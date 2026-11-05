import { sql, type Insertable, type Kysely } from 'kysely';
import {
  historyCounts,
  type HistoryNote,
  type HistoryRecord,
  type HistoryStep,
} from '../../domain/history/party-history.js';
import { inTransaction, retryOnDeadlock } from '../transaction.js';
import type { DB } from '../types.js';

/**
 * Who is named in the party history of a server (`ctx.historyOptIns`, `/settings history`). A
 * member and a server are named by their snowflakes. Nobody is, until they opt in: from then on
 * the history keeps their id with what they do in that server's parties; opting out takes it
 * out of everything kept already.
 */
export interface HistoryOptIns {
  /** Whether the member asked to be named in the history of this server. */
  isOptedIn(memberId: string, guildId: string): Promise<boolean>;
  /** Opts the member in for this server; true when that changed anything. `now` is when. */
  optIn(memberId: string, guildId: string, now: number): Promise<boolean>;
  /**
   * Opts the member out for this server and takes their id out of every party of its history
   * (as an attendee, as who made it, as its conductor) and out of every record of their reports
   * at stops (plan 8H-2): the rows stay, without it. `changed`: they were opted in; `forgotten`:
   * in how many records (parties and reports together) the history named them.
   */
  optOut(memberId: string, guildId: string): Promise<{ changed: boolean; forgotten: number }>;
}

/** An ended party whose row is still there: nothing recorded it, dropped it or took it along. */
export interface UnrecordedParty {
  partyId: string;
  /** The party it moved to and goes on as, whose record will take it along; null if none. */
  movedTo: string | null;
}

/** What the party history service writes besides the store (a retry, the sweep at start). */
export interface HistoryStorage {
  /**
   * Writes a note (see `HistoryNote`): its steps, and what becomes of the party when it ended.
   * `retry`: a write after the party's own, which writes no step for a party that has ended (a
   * late step would otherwise stay behind for good) and nothing for one whose row is gone.
   */
  write(note: HistoryNote, options?: { retry?: boolean }): Promise<void>;
  /** The ended parties still waiting for their record (`PartyHistory.sweep`), oldest first. */
  unrecorded(): Promise<UnrecordedParty[]>;
  /**
   * Notes how many members a run of the notifier's news of a party reached (plan 8H-3): a step
   * `reach` (`subject` the event), which its record sums into `reached`. One plain insert, while
   * the party's row is there (also once it ended, until its record took its steps); false where
   * it is gone (recorded meanwhile), and nothing is written.
   */
  addReach(partyId: string, subject: string, members: number, at: number): Promise<boolean>;
}

/** What `insertRecords` did: rows it wrote, and records it found there already. */
export interface RecordsWritten {
  inserted: number;
  existing: number;
}

/** As many rows as one insert of children takes (MySQL takes 65,535 placeholders at most). */
const ROWS_PER_INSERT = 2_000;
/** What the varchar(100) columns of names and labels hold. */
const NAME_ROOM = 100;
/** What the smallint unsigned column of the stops a conductor led holds. */
const MAX_LED_STOPS = 65_535;

const flag = (value: boolean): number => (value ? 1 : 0);
const epoch = (value: number | null): string | null => (value === null ? null : String(value));
const clip = (value: string | null): string | null =>
  value === null ? null : [...value].slice(0, NAME_ROOM).join('');

function historyRow(record: HistoryRecord): Insertable<DB['PartyHistory']> {
  const { boss } = record;
  const known = boss !== null && 'key' in boss ? boss : undefined;
  return {
    source: record.source,
    partyId: record.partyId,
    legacyKey: record.legacyKey,
    kind: record.kind,
    serverId: record.serverId,
    regionId: record.regionId,
    gymId: record.gymId,
    legacyGymId: record.legacyGymId,
    name: clip(record.name),
    description: record.description,
    tier: record.tier,
    shadow: flag(record.shadow),
    mega: flag(record.mega),
    elite: flag(record.elite),
    ex: flag(record.ex),
    shiny: record.shiny === null ? null : flag(record.shiny),
    bossKey: known?.key ?? null,
    bossDex: known?.dex ?? null,
    bossSpecies: known?.species ?? null,
    bossForm: known?.form ?? null,
    bossName: boss !== null && 'name' in boss ? clip(boss.name) : null,
    fastMove: record.fastMove,
    chargedMove: record.chargedMove,
    createdAt: String(record.createdAt),
    hatchTime: epoch(record.hatchTime),
    startTime: epoch(record.startTime),
    endTime: epoch(record.endTime),
    endedAt: epoch(record.endedAt),
    ending: record.ending,
    createdById: record.createdById,
    conductorId: record.conductorId,
    anonymous: flag(record.anonymous),
    routeStops: record.routeStops,
    trainKind: record.trainKind,
    splitFromId: record.splitFromId,
    wayspotId: record.wayspotId,
    reached: record.reached,
    ...historyCounts(record.attendees),
  };
}

/** The key that makes a record unique: the live party, or the legacy file's raid. */
const keyOf = (record: HistoryRecord): string => record.partyId ?? record.legacyKey ?? '';

/** Writes steps of active parties; nothing for none. */
async function insertSteps(db: Kysely<DB>, steps: readonly HistoryStep[]): Promise<void> {
  if (steps.length === 0) return;
  await db
    .insertInto('PartyHistoryStep')
    .values(
      steps.map((step) => ({
        partyId: step.partyId,
        at: String(step.at),
        kind: step.kind,
        subject: step.subject,
        value: step.value === null ? null : String(step.value),
      })),
    )
    .execute();
}

/**
 * The party and every party it went on from (its `from` steps, and theirs), itself first: what
 * its record takes along. Only parties that have ended, locked (`for update`), and none beyond
 * one that has not: a party that is still going on (its move failed, so it stayed) is no part of
 * this one and stays as it is, with what it went on from.
 */
async function partiesOf(db: Kysely<DB>, partyId: string): Promise<string[]> {
  const found = [partyId];
  let frontier = [partyId];
  while (frontier.length > 0) {
    const rows = await db
      .selectFrom('PartyHistoryStep')
      .select('subject')
      .where('kind', '=', 'from')
      .where('partyId', 'in', frontier)
      .execute();
    const named = [...new Set(rows.map((row) => row.subject))].filter((id) => !found.includes(id));
    const ended =
      named.length === 0
        ? []
        : await db
            .selectFrom('Party')
            .select('id')
            .where('id', 'in', named)
            .where('status', '=', 'ended')
            .forUpdate()
            .execute();
    frontier = ended.map((row) => row.id);
    found.push(...frontier);
  }
  return found;
}

/**
 * Deletes the rows of these parties, which hold their makers' and members' ids, once nothing of
 * them is waiting for the history (their steps go with them). Their posts and forums are kept in
 * `EndedPartyPost`, for the hourly archiving of reopened posts and the forums parties named.
 */
async function forget(db: Kysely<DB>, partyIds: readonly string[]): Promise<void> {
  if (partyIds.length === 0) return;
  await sql`
    insert ignore into EndedPartyPost (forumPostId, forumChannelId, guildId, endedAt)
    select forumPostId, forumChannelId, guildId, updatedAt from Party
    where id in (${sql.join(partyIds)})
      and forumPostId is not null and forumChannelId is not null`.execute(db);
  await db
    .deleteFrom('Party')
    .where('id', 'in', [...partyIds])
    .execute();
}

/** Inserts rows in chunks that one statement takes. */
async function insertChunked<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
    await insert(rows.slice(start, start + ROWS_PER_INSERT));
  }
}

/**
 * The party history: `PartyHistory` and its attendees, groups and stops, the steps of active
 * parties that become it (`PartyHistoryStep`) and who may be named in it (`HistoryOptIn`, a row
 * per member and server that is on, none for off). A server is its snowflake, never a `Guild`
 * row: the history outlives the row. See migration 018 and docs/architecture/history.md.
 *
 * The opt-in rows are a member's rows of a server but hang on no `User` row, so they are written
 * without `withMemberLocked`, as `NewTrainRepository` writes its rows: an opt-in and an opt-out
 * of one member at once end as whichever committed last, and an opt-out takes the id out of
 * what is kept under the lock its statements take.
 */
export class HistoryRepository implements HistoryOptIns, HistoryStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async unrecorded(): Promise<UnrecordedParty[]> {
    const rows = await sql<{ partyId: string; movedTo: string | null }>`
      select p.id as partyId,
             (select s.partyId from PartyHistoryStep s
              where s.kind = 'from' and s.subject = p.id limit 1) as movedTo
      from Party p
      where p.status = 'ended'
        and not exists (select 1 from PartyHistory h where h.partyId = p.id)
      order by p.updatedAt, p.id`.execute(this.db);
    return rows.rows.map((row) => ({ partyId: row.partyId, movedTo: row.movedTo }));
  }

  async addReach(partyId: string, subject: string, members: number, at: number): Promise<boolean> {
    // From the party's row: no row (recorded, deleted) writes nothing, and fails no foreign key.
    const written = await sql`
      insert into PartyHistoryStep (partyId, at, kind, subject, value)
      select id, ${String(at)}, 'reach', ${subject}, ${String(members)} from Party
      where id = ${partyId}`.execute(this.db);
    return Number(written.numAffectedRows ?? 0n) > 0;
  }

  async write(note: HistoryNote, options: { retry?: boolean } = {}): Promise<void> {
    // Steps alone, the first time: one statement, no transaction (what every click writes).
    if (note.end === undefined && !options.retry) {
      await insertSteps(this.db, note.steps);
      return;
    }
    await inTransaction(this.db, async (trx) => {
      const { partyId, end } = note;
      // Locked: a retry and the party's own end, or the sweep, take turns.
      const row = await trx
        .selectFrom('Party')
        .select(['status', 'updatedAt'])
        .where('id', '=', partyId)
        .forUpdate()
        .executeTakeFirst();
      if (end === undefined) {
        // A late step of a party that has ended (or is gone) is no step any more.
        if (row?.status === 'active') await insertSteps(trx, note.steps);
        return;
      }
      // Recorded, dropped or taken along already: its row went with it.
      if (!row) return;
      await insertSteps(trx, note.steps);
      if (end.kind === 'move') {
        // Lazy: the new party's record takes this one's steps and row. Said again here, in
        // case the new party's own step did not make it.
        const to = await trx
          .selectFrom('Party')
          .select('id')
          .where('id', '=', end.to)
          .executeTakeFirst();
        if (to) {
          await insertSteps(trx, [
            {
              partyId: end.to,
              at: Number(row.updatedAt),
              kind: 'from',
              subject: partyId,
              value: null,
            },
          ]);
        }
        return;
      }
      if (end.kind === 'drop') {
        await forget(trx, [partyId]);
        return;
      }
      const lineage = await partiesOf(trx, partyId);
      const rows = await trx
        .selectFrom('PartyHistoryStep')
        .select(['partyId', 'at', 'kind', 'subject', 'value'])
        .where('partyId', 'in', lineage)
        .orderBy('at')
        .orderBy('id')
        .execute();
      const steps = rows.map((step): HistoryStep => ({
        partyId: step.partyId,
        at: Number(step.at),
        kind: step.kind as HistoryStep['kind'],
        subject: step.subject,
        value: step.value === null ? null : Number(step.value),
      }));
      const server = await trx
        .selectFrom('Guild')
        .select('snowflake')
        .where('id', '=', note.guildId)
        .executeTakeFirst();
      if (!server?.snowflake) throw new Error(`Party ${partyId} has no server to record it in`);
      const members = end.members(steps);
      // Read under a shared lock: an opt-out of one of them that is under way finishes first,
      // or waits for this record and then takes the id out of it.
      const optedIn =
        members.length === 0
          ? []
          : await trx
              .selectFrom('HistoryOptIn')
              .select('memberId')
              .where('serverId', '=', server.snowflake)
              .where('memberId', 'in', members)
              .forShare()
              .execute();
      const record = end.build(steps, new Set(optedIn.map((opted) => opted.memberId)));
      await new HistoryRepository(trx).insertRecords([{ ...record, serverId: server.snowflake }]);
      await forget(trx, lineage);
    });
  }

  /**
   * Writes records with their attendees, groups and stops, in one transaction (or the
   * caller's); a record whose party (or legacy key) is there already is left as it is.
   */
  insertRecords(records: readonly HistoryRecord[]): Promise<RecordsWritten> {
    return inTransaction(this.db, async (trx) => {
      const keys = (column: 'partyId' | 'legacyKey') =>
        records.map((record) => record[column]).filter((key): key is string => key !== null);
      const known = async (column: 'partyId' | 'legacyKey', wanted: string[]) => {
        if (wanted.length === 0) return new Map<string, number>();
        const rows = await trx
          .selectFrom('PartyHistory')
          .select(['id', column])
          .where(column, 'in', wanted)
          .execute();
        return new Map(rows.map((row) => [row[column] ?? '', row.id]));
      };
      const ids = async () =>
        new Map([
          ...(await known('partyId', keys('partyId'))),
          ...(await known('legacyKey', keys('legacyKey'))),
        ]);
      const there = await ids();
      const seen = new Set<string>();
      const fresh = records.filter((record) => {
        const key = keyOf(record);
        if (there.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (fresh.length === 0) return { inserted: 0, existing: records.length };
      await insertChunked(fresh.map(historyRow), (rows) =>
        trx.insertInto('PartyHistory').values(rows).execute(),
      );
      const made = await ids();
      const attendees: Insertable<DB['PartyHistoryAttendee']>[] = [];
      const groups: Insertable<DB['PartyHistoryGroup']>[] = [];
      const stops: Insertable<DB['PartyHistoryStop']>[] = [];
      for (const record of fresh) {
        const historyId = made.get(keyOf(record));
        if (historyId === undefined) throw new Error(`No history row for ${keyOf(record)}`);
        for (const [seq, attendee] of record.attendees.entries()) {
          attendees.push({
            historyId,
            seq,
            memberId: attendee.memberId,
            status: attendee.status,
            furthest: attendee.furthest,
            groupId: attendee.groupId,
            extras: Math.min(255, attendee.extras),
            remote: flag(attendee.remote),
            team: attendee.team,
            signedUpAt: epoch(attendee.signedUpAt),
            joinedAt: epoch(attendee.joinedAt),
            hereAt: epoch(attendee.hereAt),
            doneAt: epoch(attendee.doneAt),
            leftAt: epoch(attendee.leftAt),
            splitOff: flag(attendee.splitOff === true),
            conducted: Math.min(MAX_LED_STOPS, attendee.conducted ?? 0),
          });
        }
        for (const group of record.groups) {
          groups.push({
            historyId,
            groupId: group.groupId,
            label: clip(group.label),
            meetingTime: epoch(group.meetingTime),
            members: group.members,
            heads: group.heads,
          });
        }
        for (const [seq, stop] of record.stops.entries()) {
          stops.push({
            historyId,
            seq,
            gymId: stop.gymId,
            legacyGymId: stop.legacyGymId,
            wayspotId: stop.wayspotId,
            arrivedAt: epoch(stop.arrivedAt),
            leftAt: epoch(stop.leftAt),
          });
        }
      }
      await insertChunked(attendees, (rows) =>
        trx.insertInto('PartyHistoryAttendee').values(rows).execute(),
      );
      await insertChunked(groups, (rows) =>
        trx.insertInto('PartyHistoryGroup').values(rows).execute(),
      );
      await insertChunked(stops, (rows) =>
        trx.insertInto('PartyHistoryStop').values(rows).execute(),
      );
      return { inserted: fresh.length, existing: records.length - fresh.length };
    });
  }

  /**
   * How many raids each region had since a moment (epoch ms), max battles counted as raids
   * (plan 8W-6: the rank of a region in the line that waits for Google). Regions without any are
   * left out, as are parties without a region.
   */
  async raidsByRegion(since: number): Promise<Map<number, number>> {
    const rows = await this.db
      .selectFrom('PartyHistory')
      .select((eb) => ['regionId', eb.fn.countAll<number | string>().as('raids')])
      .where('kind', 'in', ['raid', 'max'])
      .where('createdAt', '>=', String(since))
      .where('regionId', 'is not', null)
      .groupBy('regionId')
      .execute();
    return new Map(
      rows.flatMap((row) => (row.regionId === null ? [] : [[row.regionId, Number(row.raids)]])),
    );
  }

  async isOptedIn(memberId: string, guildId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('HistoryOptIn')
      .select('memberId')
      .where('serverId', '=', guildId)
      .where('memberId', '=', memberId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async optIn(memberId: string, guildId: string, now: number): Promise<boolean> {
    // On already: the row stays as it was (`insert ignore`), and nothing counts as changed.
    const made = await sql`
      insert ignore into HistoryOptIn (serverId, memberId, createdAt)
      values (${guildId}, ${memberId}, ${String(now)})`.execute(this.db);
    return Number(made.numAffectedRows ?? 0) > 0;
  }

  /**
   * One transaction: the opt-in goes, and the member's id goes from every party of the
   * server's history and every record of their reports at stops, also where no opt-in row says
   * it should be there. The parties are counted from three lookups by index (maker, conductor,
   * attendee), the reports by the index of server and reporter, so that neither the counts nor
   * the updates scan the server's history.
   */
  optOut(memberId: string, guildId: string): Promise<{ changed: boolean; forgotten: number }> {
    // Two members opting out at once, each in a party the other made, deadlock: the join locks
    // the parties of the attendee rows shared, then each clears the parties its member made. The
    // loser runs again; every step finds what is left to do.
    return retryOnDeadlock(this.db, () => this.forget(memberId, guildId));
  }

  private forget(
    memberId: string,
    guildId: string,
  ): Promise<{ changed: boolean; forgotten: number }> {
    return inTransaction(this.db, async (trx) => {
      const gone = await trx
        .deleteFrom('HistoryOptIn')
        .where('serverId', '=', guildId)
        .where('memberId', '=', memberId)
        .executeTakeFirst();
      const named = await sql<{ n: number }>`
        select count(distinct n.id) as n from (
          select id from PartyHistory where createdById = ${memberId} and serverId = ${guildId}
          union all
          select id from PartyHistory where conductorId = ${memberId} and serverId = ${guildId}
          union all
          select a.historyId as id from PartyHistoryAttendee a
          join PartyHistory h on h.id = a.historyId
          where a.memberId = ${memberId} and h.serverId = ${guildId}) n`.execute(trx);
      await sql`
        update PartyHistoryAttendee a inner join PartyHistory h on h.id = a.historyId
        set a.memberId = null
        where a.memberId = ${memberId} and h.serverId = ${guildId}`.execute(trx);
      await trx
        .updateTable('PartyHistory')
        .set({ createdById: null })
        .where('createdById', '=', memberId)
        .where('serverId', '=', guildId)
        .execute();
      await trx
        .updateTable('PartyHistory')
        .set({ conductorId: null })
        .where('conductorId', '=', memberId)
        .where('serverId', '=', guildId)
        .execute();
      // The reports at stops (plan 8H-2): one record per version, each counted.
      const reports = await trx
        .updateTable('StopReportHistory')
        .set({ reporterId: null })
        .where('serverId', '=', guildId)
        .where('reporterId', '=', memberId)
        .executeTakeFirst();
      return {
        changed: gone.numDeletedRows > 0n,
        forgotten: Number(named.rows[0]?.n ?? 0) + Number(reports.numUpdatedRows),
      };
    });
  }
}
