import { sql, type Kysely, type Selectable } from 'kysely';
import type { HistoryNote, WrittenRecord } from '../../domain/history/party-history.js';
import {
  partyFromStored,
  partyMirrors,
  partyState,
  type PartyColumns,
  type StoredParty,
} from '../../domain/party/party-state.js';
import type { Party } from '../../domain/party/party.js';
import { inTransaction, retryOnDeadlock } from '../transaction.js';
import type { DB, Party as PartyTable } from '../types.js';
import { HistoryRepository } from './history-repository.js';

/**
 * A row of `Party` that could not be read as a party; it is left as it is. The columns of its
 * post are kept so that whoever handles it can still find the post.
 */
export interface UnreadableParty {
  id: string;
  problem: string;
  forumChannelId: string | null;
  forumPostId: string | null;
}

export interface PartyList {
  parties: Party[];
  unreadable: UnreadableParty[];
}

/**
 * What `save` did: false where there is no such row; otherwise the record its note wrote in the
 * party's transaction, with its server (plan 8H-7A, review F-B1: the card of an ended train is
 * drawn from it), undefined where it wrote none (no end, a move, a drop) or where the record
 * failed and went to `historyFailed` (also when the party's write ran again alone).
 */
export type Saved = false | { recorded: WrittenRecord | undefined };

/** One party of `saveBoth`, with what it adds to the party history. */
export interface PartySave {
  party: Party;
  note?: HistoryNote;
}

/** What the party store needs from storage. */
export interface PartyStorage {
  /**
   * Writes a new party; with `note` what it adds to the party history (`HistoryNote`), in the
   * same transaction where the storage can.
   */
  insert(party: Party, note?: HistoryNote): Promise<void>;
  /**
   * Writes everything that can change, and `note` as `insert` does. Returns false when there is
   * no such row (and writes no note), else the record the note wrote (`Saved`).
   */
  save(party: Party, note?: HistoryNote): Promise<Saved>;
  /**
   * Writes two parties in one transaction, each as `save` does with its note: both or neither
   * (`PartyStore.updateBoth`). Says, per party, whether its row is there; when one is not,
   * neither is written and no note is.
   */
  saveBoth(writes: readonly [PartySave, PartySave]): Promise<[boolean, boolean]>;
  /** Every party that has not ended, oldest first. */
  listActive(): Promise<PartyList>;
  /** Those of these forum posts that are the post of a party that has ended. */
  endedPosts(forumPostIds: readonly string[]): Promise<string[]>;
  /**
   * Every forum that a party, active or ended, has or had its post in, each once per server:
   * by this a forum is still found when its region is gone. `guildId` (a row id) narrows it to
   * the parties of one server.
   */
  partyForums(guildId?: number): Promise<PartyForum[]>;
}

/** A forum that parties name, with the server (its row id) of those parties. */
export interface PartyForum {
  forumChannelId: string;
  guildId: number;
}

const epoch = (value: string | null): number | null => (value === null ? null : Number(value));

function toStored(row: Selectable<PartyTable>): StoredParty {
  if (row.status !== 'active' && row.status !== 'ended') {
    return { ok: false, id: row.id, problem: `a party with status "${row.status}"` };
  }
  const columns: PartyColumns = {
    id: row.id,
    type: row.type,
    guildId: row.guildId,
    status: row.status,
    regionId: row.regionId,
    gymId: row.gymId,
    forumChannelId: row.forumChannelId,
    forumPostId: row.forumPostId,
    regionLinkMessageId: row.regionLinkMessageId,
    mirrorMessages: [],
    createdById: row.createdById,
    hatchTime: epoch(row.hatchTime),
    endTime: epoch(row.endTime),
    lastPossibleTime: epoch(row.lastPossibleTime),
    deletionTime: epoch(row.deletionTime),
    saved: row.saved === 1,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
  return partyFromStored(columns, row.state, row.mirrorMessages);
}

/** The columns that change during a party's life, as they are written. */
function changeable(party: Party) {
  return {
    status: party.status,
    regionId: party.regionId,
    gymId: party.gymId,
    forumChannelId: party.forumChannelId,
    forumPostId: party.forumPostId,
    regionLinkMessageId: party.regionLinkMessageId,
    mirrorMessages: JSON.stringify(partyMirrors(party)),
    hatchTime: party.hatchTime === null ? null : String(party.hatchTime),
    endTime: party.endTime === null ? null : String(party.endTime),
    lastPossibleTime: party.lastPossibleTime === null ? null : String(party.lastPossibleTime),
    deletionTime: party.deletionTime === null ? null : String(party.deletionTime),
    saved: party.saved ? 1 : 0,
    state: JSON.stringify(partyState(party)),
    updatedAt: String(party.updatedAt),
  };
}

/** Writes a party's changeable columns; false when there is no such row. */
async function updateRow(
  db: Kysely<DB>,
  row: { id: string; values: ReturnType<typeof changeable> },
): Promise<boolean> {
  const result = await db
    .updateTable('Party')
    .set(row.values)
    .where('id', '=', row.id)
    .executeTakeFirst();
  // The driver reports matched rows, so an unchanged row already counts; the look-up only
  // tells a missing row from a present one when the count is zero.
  if (result.numUpdatedRows > 0n) return true;
  const found = await db
    .selectFrom('Party')
    .select('id')
    .where('id', '=', row.id)
    .executeTakeFirst();
  return found !== undefined;
}

/** Thrown inside `saveBoth`'s transaction to roll it back when a row is gone. */
class RowsMissing extends Error {
  constructor(readonly found: [boolean, boolean]) {
    super('A party of the pair is no longer in the database');
  }
}

function listOf(rows: Selectable<PartyTable>[]): PartyList {
  const list: PartyList = { parties: [], unreadable: [] };
  for (const row of rows) {
    const item = toStored(row);
    if (item.ok) list.parties.push(item.party);
    else {
      list.unreadable.push({
        id: item.id,
        problem: item.problem,
        forumChannelId: row.forumChannelId,
        forumPostId: row.forumPostId,
      });
    }
  }
  return list;
}

/** What writes a note of the party history: `HistoryRepository`, over the connection given. */
export type HistoryWriter = (db: Kysely<DB>) => {
  write(note: HistoryNote): Promise<WrittenRecord | undefined>;
};

export interface PartyRepositoryOptions {
  /**
   * Told, once the party's own write has committed, of a note of the party history that could
   * not be written with it (the party's write stands): `PartyHistory.failed`, which tries it
   * again. Never told of a write that did not commit, which the store does not keep either.
   */
  historyFailed: (note: HistoryNote, err: unknown) => void;
  /** Who writes the notes; `HistoryRepository` (a test gives one that fails as it needs). */
  history?: HistoryWriter;
}

/**
 * The `Party` table. What the scheduler and the duplicate check search by is in columns; the
 * rest of a party is the JSON document `state` (see `party-state.ts`).
 */
export class PartyRepository implements PartyStorage {
  private readonly history: HistoryWriter;

  /**
   * `db` is the pool, never a caller's transaction: the note of a party's end is written behind
   * a savepoint of a transaction of its own, which may have to be run again alone.
   */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly options: PartyRepositoryOptions,
  ) {
    if (db.isTransaction) throw new Error('PartyRepository needs the pool, not a transaction');
    this.history = options.history ?? ((on) => new HistoryRepository(on));
  }

  async insert(party: Party, note?: HistoryNote): Promise<void> {
    await this.withNote(note, async (db) => {
      await db
        .insertInto('Party')
        .values({
          id: party.id,
          guildId: party.guildId,
          type: party.type,
          createdById: party.createdById,
          createdAt: String(party.createdAt),
          ...changeable(party),
        })
        .execute();
      return true;
    });
  }

  save(party: Party, note?: HistoryNote): Promise<Saved> {
    return this.withNote(note, (db) => updateRow(db, { id: party.id, values: changeable(party) }));
  }

  /**
   * As `save` for two parties, in one transaction: both rows or neither (a row that is gone
   * rolls the other one back too). Both documents are made before anything is written, so one
   * that cannot be stored writes neither. The notes keep the guarantees of `withNote`: one that
   * ends its party is written inside the transaction behind a savepoint of its own, rolled back
   * alone when it fails and handed to `historyFailed` once the parties' writes have committed.
   * A deadlock (rows or notes) runs the whole transaction again (`retryOnDeadlock`, the pool
   * being no transaction); when one persists, or another failure takes the whole transaction
   * with it (the savepoint is gone, and so is what the other note wrote), both parties' writes
   * are run again alone, and every note that ends a party goes to `historyFailed` (with its own
   * error when it had failed by itself before).
   * Notes of steps alone follow the commit, one statement each.
   */
  async saveBoth(writes: readonly [PartySave, PartySave]): Promise<[boolean, boolean]> {
    const [first, second] = writes;
    const rows = [
      { id: first.party.id, values: changeable(first.party) },
      { id: second.party.id, values: changeable(second.party) },
    ] as const;
    const notes = [first.note, second.note].filter(
      (note): note is HistoryNote =>
        note !== undefined && (note.steps.length > 0 || note.end !== undefined),
    );
    const ending = notes.filter((note) => note.end !== undefined);
    const both = async (db: Kysely<DB>): Promise<[boolean, boolean]> => {
      const found: [boolean, boolean] = [
        await updateRow(db, rows[0]),
        await updateRow(db, rows[1]),
      ];
      if (!found[0] || !found[1]) throw new RowsMissing(found);
      return found;
    };
    const { historyFailed } = this.options;
    const failures: { note: HistoryNote; err: unknown }[] = [];
    let lost: { err: unknown } | undefined;
    let found: [boolean, boolean];
    try {
      try {
        // A deadlock rolled the whole try back: what it collected goes with it.
        found = await retryOnDeadlock(this.db, () => {
          failures.length = 0;
          lost = undefined;
          return inTransaction(this.db, async (trx) => {
            const there = await both(trx);
            for (const note of ending) {
              await sql`savepoint party_history`.execute(trx);
              try {
                await this.history(trx).write(note);
                await sql`release savepoint party_history`.execute(trx);
              } catch (err) {
                failures.push({ note, err });
                try {
                  await sql`rollback to savepoint party_history`.execute(trx);
                } catch {
                  lost = { err };
                  throw err;
                }
              }
            }
            return there;
          });
        });
      } catch (err) {
        if (lost === undefined) throw err;
        found = await retryOnDeadlock(this.db, () => inTransaction(this.db, both));
        const { err: cause } = lost;
        // A note that had failed by itself keeps its own error; the others lost theirs with it.
        failures.splice(
          0,
          failures.length,
          ...ending.map((note) => ({
            note,
            err: failures.find((failure) => failure.note === note)?.err ?? cause,
          })),
        );
      }
    } catch (err) {
      if (err instanceof RowsMissing) return err.found;
      throw err;
    }
    for (const failure of failures) historyFailed(failure.note, failure.err);
    for (const note of notes) {
      if (note.end !== undefined) continue;
      try {
        await this.history(this.db).write(note);
      } catch (err) {
        historyFailed(note, err);
      }
    }
    return found;
  }

  /**
   * Runs the party's own write, and the note after it. A note that ends the party is written in
   * the same transaction, behind a savepoint: one that fails is rolled back alone and handed to
   * `historyFailed` once the party's write has committed. A deadlock (the party's row or the
   * note) runs the whole transaction again (`retryOnDeadlock`, the pool being no transaction);
   * when one persists, or another failure took the whole transaction with it (a lock wait that
   * rolls back: the savepoint is gone), the party's write is run again alone, so that the party
   * ends all the same. A note of steps alone (what a click adds) follows the party's write in
   * one statement of its own, without a transaction: a click costs one round trip more, not
   * five, and a step that fails is tried again the same way. The party's write by itself (no
   * note, or steps only) runs again on a deadlock too. Answers the record the note wrote with the
   * party (`Saved`): that of the try that committed, never one a deadlock rolled back.
   */
  private async withNote(
    note: HistoryNote | undefined,
    write: (db: Kysely<DB>) => Promise<boolean>,
  ): Promise<Saved> {
    const none: Saved = { recorded: undefined };
    const alone = async (): Promise<Saved> =>
      (await retryOnDeadlock(this.db, () => write(this.db))) && none;
    if (note === undefined || (note.steps.length === 0 && note.end === undefined)) {
      return alone();
    }
    const { historyFailed } = this.options;
    if (note.end === undefined) {
      if (!(await alone())) return false;
      try {
        await this.history(this.db).write(note);
      } catch (err) {
        historyFailed(note, err);
      }
      return none;
    }
    let failure: { err: unknown } | undefined;
    let lost = false;
    let written: Saved;
    try {
      // A deadlock rolled the whole try back: what it found and wrote goes with it.
      written = await retryOnDeadlock(this.db, () => {
        failure = undefined;
        lost = false;
        return inTransaction(this.db, async (trx): Promise<Saved> => {
          if (!(await write(trx))) return false;
          let recorded: WrittenRecord | undefined;
          await sql`savepoint party_history`.execute(trx);
          try {
            recorded = await this.history(trx).write(note);
            await sql`release savepoint party_history`.execute(trx);
          } catch (err) {
            failure = { err };
            try {
              await sql`rollback to savepoint party_history`.execute(trx);
            } catch {
              lost = true;
              throw err;
            }
            // Rolled back to the savepoint: nothing of it was written.
            recorded = undefined;
          }
          return { recorded };
        });
      });
    } catch (err) {
      if (!lost) throw err;
      // The party alone: its record goes to its later tries, and none is given back.
      written = await alone();
    }
    if (failure && written) historyFailed(note, failure.err);
    return written;
  }

  /** The party with this id, whatever its status; undefined when there is none. */
  async findById(id: string): Promise<StoredParty | undefined> {
    const row = await this.db
      .selectFrom('Party')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toStored(row) : undefined;
  }

  /**
   * Oldest first. The order is made here and not by MySQL: sorting rows that carry JSON
   * columns can run out of sort memory.
   */
  async listActive(): Promise<PartyList> {
    const rows = await this.db
      .selectFrom('Party')
      .selectAll()
      .where('status', '=', 'active')
      .execute();
    rows.sort(
      (a, b) =>
        Number(a.createdAt) - Number(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    return listOf(rows);
  }

  /** From the rows of ended parties, and from what stands in for those deleted once recorded. */
  async endedPosts(forumPostIds: readonly string[]): Promise<string[]> {
    if (forumPostIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('Party')
      .select('forumPostId')
      .where('status', '=', 'ended')
      .where('forumPostId', 'in', [...forumPostIds])
      .execute();
    const kept = await this.db
      .selectFrom('EndedPartyPost')
      .select('forumPostId')
      .where('forumPostId', 'in', [...forumPostIds])
      .execute();
    const ids = [...rows.map((row) => row.forumPostId), ...kept.map((row) => row.forumPostId)];
    return [...new Set(ids.filter((id): id is string => id !== null))];
  }

  /** From the rows of parties, and from what stands in for those deleted once recorded. */
  async partyForums(guildId?: number): Promise<PartyForum[]> {
    let query = this.db
      .selectFrom('Party')
      .select(['forumChannelId', 'guildId'])
      .where('forumChannelId', 'is not', null);
    // By the index on (guildId, forumChannelId) of migration 011.
    if (guildId !== undefined) query = query.where('guildId', '=', guildId);
    let kept = this.db.selectFrom('EndedPartyPost').select(['forumChannelId', 'guildId']);
    // By the index on (guildId, forumChannelId) of migration 018.
    if (guildId !== undefined) kept = kept.where('guildId', '=', guildId);
    const rows = [
      ...(await query.groupBy(['forumChannelId', 'guildId']).execute()),
      ...(await kept.groupBy(['forumChannelId', 'guildId']).execute()),
    ];
    const forums = new Map<string, PartyForum>();
    for (const { forumChannelId, guildId: guild } of rows) {
      if (forumChannelId !== null) {
        forums.set(`${String(guild)}:${forumChannelId}`, { forumChannelId, guildId: guild });
      }
    }
    return [...forums.values()].sort(
      (a, b) =>
        a.guildId - b.guildId ||
        (a.forumChannelId < b.forumChannelId ? -1 : a.forumChannelId > b.forumChannelId ? 1 : 0),
    );
  }
}
