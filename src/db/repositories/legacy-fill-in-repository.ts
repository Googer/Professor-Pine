import { sql, type Kysely } from 'kysely';
import type { LegacyIndexEntry } from '../../domain/history/legacy-index.js';
import { inTransaction, retryOnDeadlock } from '../transaction.js';
import type { DB } from '../types.js';

/** Where a member's legacy fill-in of a server stands. `queued`: waiting, or under way. */
export type FillInState =
  { state: 'queued' } | { state: 'done'; filled: number } | { state: 'failed'; failure: string };

/**
 * What asking did: `queued`, a new request, or one that had failed asked again (A1); `asked`,
 * there was one already, waiting or done: nothing is queued again; `off`, the member's history is
 * off in that server.
 */
export type FillInAsked = 'queued' | 'asked' | 'off';

/**
 * The legacy fill-ins members asked for (plan 8H-10; `LegacyFillIn`, migration 043): a request
 * per member and server, written only from their history opt-in and deleted with it by the
 * opt-out (`HistoryRepository.optOut`). A member and a server are their snowflakes.
 */
export interface LegacyFillIns {
  /** Queues the member's fill-in of the server where their history is on there (H7). */
  request(memberId: string, serverId: string, now: number): Promise<FillInAsked>;
  /** Where the member's fill-in of the server stands; undefined where they never asked. */
  stateOf(memberId: string, serverId: string): Promise<FillInState | undefined>;
}

/** A request, as the worker takes it: its member, server and when it was asked (its identity). */
export interface FillInJob {
  serverId: string;
  memberId: string;
  requestedAt: number;
}

/**
 * What a batch did: `gone`, the request is no more (the member opted out, or asked anew after
 * turning the history off and on): nothing was written, and the fill-in stops. Otherwise how many
 * legacy parties now name the member that did not before (`filled`), and how many of the batch's
 * entries name no place the history holds as the index says (`skipped`: another member's place,
 * a place stored otherwise, a record of another server or none).
 */
export type BatchFilled = { gone: true } | { gone: false; filled: number; skipped: number };

/** The worker's side of the queue (`LegacyFillInService`). */
export interface LegacyFillInStorage extends LegacyFillIns {
  /**
   * The oldest request neither done nor failed that no worker holds: never claimed, or claimed
   * longer ago than `leaseMs` (a run a stop or a crash cut short).
   */
  nextWaiting(now: number, leaseMs: number): Promise<FillInJob | undefined>;
  /** Claims a request, by a conditional update: false where another worker has it (two bots). */
  claim(job: FillInJob, now: number, leaseMs: number): Promise<boolean>;
  /**
   * Fills in one batch of a member's index entries, in one transaction: the member's history
   * opt-in read locked shared (gone: the request is deleted and nothing written), then their
   * request locked (gone, or asked anew: nothing written), then each entry's place by key on the
   * server's legacy records, in ascending order: a maker where none is named, an attendee where
   * the place is empty and still as the index says. Advances `filled` and the claim with it.
   */
  fillBatch(
    job: FillInJob,
    entries: readonly LegacyIndexEntry[],
    now: number,
  ): Promise<BatchFilled>;
  /** Gives a claim back (a run stopped between batches, B9): the next start takes it at once. */
  release(job: FillInJob): Promise<void>;
  /** Marks the request done; false where it is gone. */
  finish(job: FillInJob, now: number): Promise<boolean>;
  /** Marks the request failed, with why in words (no ids). */
  fail(job: FillInJob, now: number, failure: string): Promise<void>;
}

/** What the `varchar(200)` column of a failure holds. */
const FAILURE_ROOM = 200;

export class LegacyFillInRepository implements LegacyFillInStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async nextWaiting(now: number, leaseMs: number): Promise<FillInJob | undefined> {
    const row = await this.db
      .selectFrom('LegacyFillIn')
      .select(['serverId', 'memberId', 'requestedAt'])
      .where('doneAt', 'is', null)
      .where('failedAt', 'is', null)
      .where((eb) =>
        eb.or([eb('startedAt', 'is', null), eb('startedAt', '<', String(now - leaseMs))]),
      )
      .orderBy('requestedAt')
      .orderBy('serverId')
      .orderBy('memberId')
      .limit(1)
      .executeTakeFirst();
    return row === undefined
      ? undefined
      : { serverId: row.serverId, memberId: row.memberId, requestedAt: Number(row.requestedAt) };
  }

  async claim(job: FillInJob, now: number, leaseMs: number): Promise<boolean> {
    const claimed = await this.db
      .updateTable('LegacyFillIn')
      .set({ startedAt: String(now) })
      .where('serverId', '=', job.serverId)
      .where('memberId', '=', job.memberId)
      .where('requestedAt', '=', String(job.requestedAt))
      .where('doneAt', 'is', null)
      .where('failedAt', 'is', null)
      .where((eb) =>
        eb.or([eb('startedAt', 'is', null), eb('startedAt', '<', String(now - leaseMs))]),
      )
      .executeTakeFirst();
    return claimed.numUpdatedRows > 0n;
  }

  fillBatch(
    job: FillInJob,
    entries: readonly LegacyIndexEntry[],
    now: number,
  ): Promise<BatchFilled> {
    // Beside an opt-out, or another member's fill-in on another bot, a deadlock is possible: the
    // loser runs again and finds what is left to do.
    return retryOnDeadlock(this.db, () =>
      inTransaction(this.db, (trx) => fillBatchIn(trx, job, entries, now)),
    );
  }

  async release(job: FillInJob): Promise<void> {
    await this.db
      .updateTable('LegacyFillIn')
      .set({ startedAt: null })
      .where('serverId', '=', job.serverId)
      .where('memberId', '=', job.memberId)
      .where('requestedAt', '=', String(job.requestedAt))
      .where('doneAt', 'is', null)
      .where('failedAt', 'is', null)
      .execute();
  }

  async finish(job: FillInJob, now: number): Promise<boolean> {
    const done = await this.db
      .updateTable('LegacyFillIn')
      .set({ doneAt: String(now) })
      .where('serverId', '=', job.serverId)
      .where('memberId', '=', job.memberId)
      .where('requestedAt', '=', String(job.requestedAt))
      .where('doneAt', 'is', null)
      .executeTakeFirst();
    return done.numUpdatedRows > 0n;
  }

  async fail(job: FillInJob, now: number, failure: string): Promise<void> {
    await this.db
      .updateTable('LegacyFillIn')
      .set({ failedAt: String(now), failure: [...failure].slice(0, FAILURE_ROOM).join('') })
      .where('serverId', '=', job.serverId)
      .where('memberId', '=', job.memberId)
      .where('requestedAt', '=', String(job.requestedAt))
      .execute();
  }

  request(memberId: string, serverId: string, now: number): Promise<FillInAsked> {
    // Beside a transaction that locks in another order, a deadlock is possible: the loser runs
    // again and finds what is left to do.
    return retryOnDeadlock(this.db, () =>
      inTransaction(this.db, (trx) => requestIn(trx, memberId, serverId, now)),
    );
  }

  async stateOf(memberId: string, serverId: string): Promise<FillInState | undefined> {
    const row = await this.db
      .selectFrom('LegacyFillIn')
      .select(['doneAt', 'filled', 'failedAt', 'failure'])
      .where('serverId', '=', serverId)
      .where('memberId', '=', memberId)
      .executeTakeFirst();
    if (row === undefined) return undefined;
    if (row.failedAt !== null) return { state: 'failed', failure: row.failure ?? '' };
    if (row.doneAt !== null) return { state: 'done', filled: row.filled };
    return { state: 'queued' };
  }
}

/** `request`, in one transaction. */
async function requestIn(
  trx: Kysely<DB>,
  memberId: string,
  serverId: string,
  now: number,
): Promise<FillInAsked> {
  // The opt-in first, locked shared, then the request: the order of the opt-out and the worker
  // (H6). An opt-out that deleted the opt-in meanwhile has committed or waits for this
  // transaction, and then deletes the request with it.
  const optedIn = await trx
    .selectFrom('HistoryOptIn')
    .select('memberId')
    .where('serverId', '=', serverId)
    .where('memberId', '=', memberId)
    .forShare()
    .executeTakeFirst();
  if (optedIn === undefined) return 'off';
  const made = await sql`
    insert ignore into LegacyFillIn (serverId, memberId, requestedAt)
    values (${serverId}, ${memberId}, ${String(now)})`.execute(trx);
  if (Number(made.numAffectedRows ?? 0) > 0) return 'queued';
  // A request that failed is asked again (A1, the member retries): its row starts afresh; one
  // waiting or done stays as it is.
  const again = await trx
    .updateTable('LegacyFillIn')
    .set({ requestedAt: String(now), startedAt: null, failedAt: null, failure: null })
    .where('serverId', '=', serverId)
    .where('memberId', '=', memberId)
    .where('failedAt', 'is not', null)
    .executeTakeFirst();
  return again.numUpdatedRows > 0n ? 'queued' : 'asked';
}

/** The legacy records (of the batch's) that name the member, and the places that do. */
async function namedIn(
  trx: Kysely<DB>,
  memberId: string,
  ids: readonly number[],
): Promise<{ makers: Set<number>; places: Set<string>; records: Set<number> }> {
  if (ids.length === 0) return { makers: new Set(), places: new Set(), records: new Set() };
  const makers = await trx
    .selectFrom('PartyHistory')
    .select('id')
    .where('id', 'in', [...ids])
    .where('createdById', '=', memberId)
    .execute();
  const places = await trx
    .selectFrom('PartyHistoryAttendee')
    .select(['historyId', 'seq'])
    .where('historyId', 'in', [...ids])
    .where('memberId', '=', memberId)
    .execute();
  return {
    makers: new Set(makers.map((row) => row.id)),
    places: new Set(places.map((row) => `${String(row.historyId)}:${String(row.seq)}`)),
    records: new Set([...makers.map((row) => row.id), ...places.map((row) => row.historyId)]),
  };
}

async function fillBatchIn(
  trx: Kysely<DB>,
  job: FillInJob,
  entries: readonly LegacyIndexEntry[],
  now: number,
): Promise<BatchFilled> {
  const { serverId, memberId } = job;
  // The opt-in first, then the request: the opt-out deletes them in this order (H6).
  const optedIn = await trx
    .selectFrom('HistoryOptIn')
    .select('memberId')
    .where('serverId', '=', serverId)
    .where('memberId', '=', memberId)
    .forShare()
    .executeTakeFirst();
  if (optedIn === undefined) {
    await trx
      .deleteFrom('LegacyFillIn')
      .where('serverId', '=', serverId)
      .where('memberId', '=', memberId)
      .execute();
    return { gone: true };
  }
  const request = await trx
    .selectFrom('LegacyFillIn')
    .select('memberId')
    .where('serverId', '=', serverId)
    .where('memberId', '=', memberId)
    .where('requestedAt', '=', String(job.requestedAt))
    .where('doneAt', 'is', null)
    .where('failedAt', 'is', null)
    .forUpdate()
    .executeTakeFirst();
  if (request === undefined) return { gone: true };

  // The count of what the batch filled (`before` and `after` below) relies on the transaction's
  // read view opening here, at its first non-locking read, after the two locks above (A8): a run
  // that took the request over meanwhile has committed by then and is seen. No plain read may
  // come before the locks.
  // The server's legacy records of the batch's keys: never a live one, never another server's.
  const keys = [...new Set(entries.map((entry) => entry.key))];
  const records =
    keys.length === 0
      ? []
      : await trx
          .selectFrom('PartyHistory')
          .select(['id', 'legacyKey'])
          .where('serverId', '=', serverId)
          .where('source', '=', 'legacy')
          .where('legacyKey', 'in', keys)
          .orderBy('id')
          .execute();
  const idOf = new Map(records.map((row) => [row.legacyKey ?? '', row.id]));
  const ids = records.map((row) => row.id);
  const before = await namedIn(trx, memberId, ids);

  const makers = entries
    .filter((entry) => entry.role === 'reporter')
    .flatMap((entry) => {
      const id = idOf.get(entry.key);
      return id === undefined ? [] : [id];
    })
    .sort((a, b) => a - b);
  if (makers.length > 0) {
    await sql`
      update PartyHistory set createdById = ${memberId}
      where id in (${sql.join(makers)}) and createdById is null
      order by id`.execute(trx);
  }
  const places = entries
    .flatMap((entry) => {
      if (entry.role !== 'attendee') return [];
      const historyId = idOf.get(entry.key);
      return historyId === undefined ? [] : [{ ...entry, historyId }];
    })
    .sort((a, b) => a.historyId - b.historyId || a.seq - b.seq);
  if (places.length > 0) {
    // By the primary key (the pairs), each place only as the index says it was stored (H1).
    await sql`
      update PartyHistoryAttendee set memberId = ${memberId}
      where (historyId, seq) in (${sql.join(places.map((p) => sql`(${p.historyId}, ${p.seq})`))})
        and memberId is null
        and (${sql.join(
          places.map(
            (p) =>
              sql`(historyId = ${p.historyId} and seq = ${p.seq} and furthest = ${p.furthest}
                   and extras = ${p.extras} and groupId <=> ${p.groupId})`,
          ),
          sql` or `,
        )})
      order by historyId, seq`.execute(trx);
  }

  const after = await namedIn(trx, memberId, ids);
  const named =
    makers.filter((id) => after.makers.has(id)).length +
    places.filter((p) => after.places.has(`${String(p.historyId)}:${String(p.seq)}`)).length;
  const filled = after.records.size - before.records.size;
  await trx
    .updateTable('LegacyFillIn')
    .set((eb) => ({ filled: eb('filled', '+', filled), startedAt: String(now) }))
    .where('serverId', '=', serverId)
    .where('memberId', '=', memberId)
    .execute();
  return { gone: false, filled, skipped: entries.length - named };
}
