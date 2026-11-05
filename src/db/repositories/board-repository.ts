import { sql, type Kysely, type RawBuilder } from 'kysely';
import {
  CLOSED_ENDING,
  COUNTING_ENDINGS,
  type BoardCredit,
  type ReportCredit,
  type ReportScore,
  type RideCredit,
  type SplitLink,
} from '../../domain/history/boards.js';
import type { MemberParty, MemberReport } from '../../domain/history/member-stats.js';
import type { HistoryKind, HistoryStatus } from '../../domain/history/party-history.js';
import type { DB } from '../types.js';

/**
 * Which records a board reads: those from `since` on (epoch ms; null for all time), and of one
 * member only where `memberId` is given (`/stats me`).
 */
export interface BoardRange {
  since: number | null;
  memberId?: string;
}

/** The latest day of want counts of a server, its species only. */
export interface WantDay {
  day: string;
  counts: { target: string; count: number }[];
}

/**
 * What the boards read of the party history and the reports at stops (plan 8H-6, design Part D;
 * `history.md`, "The boards"): live records only, a record's period by when it was made (parties)
 * or when it ended (reports at stops), along the history's indexes. Each read is tested SQL,
 * whose twin is `MemoryBoards`; the domain (`src/domain/history/boards.ts`) ranks what it reads.
 */
export interface BoardReader {
  /**
   * Raids and max battles a member reported (`createdById`, with their opt-in) that another
   * member completed (an attendee row reached `done` that is not the reporter's), not canceled.
   */
  raidCredits(serverId: string, range: BoardRange): Promise<BoardCredit[]>;
  /**
   * Trains a member conducted (their attendee row led one stop or more, `conducted`) that another
   * member came to (here or done), by their party, so that a split counts once (`rides`).
   */
  trainCredits(serverId: string, range: BoardRange): Promise<RideCredit[]>;
  /** The trains of a server split off another: one ride with it. */
  splitLinks(serverId: string): Promise<SplitLink[]>;
  /**
   * Meetups a member made that another member came to, unless staff or the moderators closed
   * them (B9, A1: such a meetup records `completed` like any other): its `closedBy` (migration
   * 040); and, for the records of before 040, which keep none, a report about it decided
   * `closed`, `refused` or `blocked`, or its maker blocked from making meetups when it ended.
   */
  meetupCredits(serverId: string, range: BoardRange): Promise<BoardCredit[]>;
  /** A member's reports at stops that counted (`COUNTING_ENDINGS`), by when they ended. */
  reportCredits(serverId: string, range: BoardRange): Promise<ReportCredit[]>;
  /**
   * Each reporter's score of all time (`ReportScore`), of these members only where given: the
   * confirmations of their reports that counted, and how many were contradicted.
   */
  reportScores(serverId: string, memberIds?: readonly string[]): Promise<ReportScore[]>;
  /** The members on the server's boards: their history opt-in and their board row both there. */
  onBoards(serverId: string): Promise<Set<string>>;
  /** The server's latest day of want counts, its `species:<dex>` keys; undefined for none. */
  latestWants(serverId: string): Promise<WantDay | undefined>;
  /** What each catalogue boss's raids and max battles were sent to (`reached`), from `since` on. */
  bossSends(serverId: string, since: number | null): Promise<{ bossKey: string; sent: number }[]>;
  /**
   * The field research reports of each subject that counted, from `since` on (by when they
   * ended), typed tasks left out, with the task's words as a report kept them.
   */
  taskReports(
    serverId: string,
    since: number | null,
  ): Promise<{ subjectKey: string; text: string | null; reports: number }[]>;
  /**
   * Every record of the server a member is in, as its maker or an attendee, live and legacy (a
   * legacy record has an id only once Part H fills it in), for their own stats (`/stats me`).
   */
  memberParties(serverId: string, memberId: string): Promise<MemberParty[]>;
  /** Every record of a member's reports at stops of the server, however it ended. */
  memberReports(serverId: string, memberId: string): Promise<MemberReport[]>;
}

const counting = sql.join(COUNTING_ENDINGS.map((ending) => sql.lit(ending)));
const from = (column: RawBuilder<unknown>, since: number | null) =>
  since === null ? sql`` : sql`and ${column} >= ${String(since)}`;
const ofMember = (column: RawBuilder<unknown>, memberId: string | undefined) =>
  memberId === undefined ? sql`` : sql`and ${column} = ${memberId}`;

/**
 * Another attendee of the record `h` than `member` (a column) came as far as `furthest`: a row
 * without an id is somebody who did not opt in, never the member.
 */
const another = (member: RawBuilder<unknown>, furthest: readonly string[]) => sql`
  exists (select 1 from PartyHistoryAttendee o
          where o.historyId = h.id and o.furthest in (${sql.join(furthest.map((f) => sql.lit(f)))})
            and (o.memberId is null or o.memberId <> ${member}))`;

/**
 * Not closed by the moderators (W3): a raid or train they closed credits nobody. One staff
 * closed (a clean-up) still counts; a meetup either way (`meetupCredits`).
 */
const notByModerators = sql`(h.closedBy is null or h.closedBy <> 'moderators')`;

interface CreditRow {
  memberId: string;
  at: string;
  anonymous: number;
}

const credit = (row: CreditRow): BoardCredit => ({
  memberId: row.memberId,
  at: Number(row.at),
  anonymous: Number(row.anonymous) === 1,
});

/** The boards' reads over the database (`BoardReader`). */
export class BoardRepository implements BoardReader {
  constructor(private readonly db: Kysely<DB>) {}

  async raidCredits(serverId: string, range: BoardRange): Promise<BoardCredit[]> {
    const rows = await sql<CreditRow>`
      select h.createdById as memberId, h.createdAt as at, h.anonymous
      from PartyHistory h
      where h.serverId = ${serverId} and h.kind in ('raid', 'max') and h.source = 'live'
        ${from(sql.ref('h.createdAt'), range.since)}
        and h.createdById is not null ${ofMember(sql.ref('h.createdById'), range.memberId)}
        and h.ending <> ${CLOSED_ENDING} and ${notByModerators}
        and ${another(sql.ref('h.createdById'), ['done'])}`.execute(this.db);
    return rows.rows.map(credit);
  }

  async trainCredits(serverId: string, range: BoardRange): Promise<RideCredit[]> {
    const rows = await sql<CreditRow & { partyId: string }>`
      select a.memberId, h.createdAt as at, h.anonymous, h.partyId
      from PartyHistory h
      join PartyHistoryAttendee a on a.historyId = h.id
      where h.serverId = ${serverId} and h.kind = 'train' and h.source = 'live'
        ${from(sql.ref('h.createdAt'), range.since)}
        and a.memberId is not null ${ofMember(sql.ref('a.memberId'), range.memberId)}
        and a.conducted >= 1 and ${notByModerators}
        and ${another(sql.ref('a.memberId'), ['here', 'done'])}`.execute(this.db);
    return rows.rows.map((row) => ({ ...credit(row), partyId: row.partyId }));
  }

  async splitLinks(serverId: string): Promise<SplitLink[]> {
    const rows = await this.db
      .selectFrom('PartyHistory')
      .select(['partyId', 'splitFromId'])
      .where('serverId', '=', serverId)
      .where('kind', '=', 'train')
      .where('splitFromId', 'is not', null)
      .execute();
    return rows.flatMap((row) =>
      row.partyId === null || row.splitFromId === null
        ? []
        : [{ partyId: row.partyId, splitFromId: row.splitFromId }],
    );
  }

  async meetupCredits(serverId: string, range: BoardRange): Promise<BoardCredit[]> {
    const rows = await sql<CreditRow>`
      select h.createdById as memberId, h.createdAt as at, h.anonymous
      from PartyHistory h
      where h.serverId = ${serverId} and h.kind = 'meetup' and h.source = 'live'
        ${from(sql.ref('h.createdAt'), range.since)}
        and h.createdById is not null ${ofMember(sql.ref('h.createdById'), range.memberId)}
        and ${another(sql.ref('h.createdById'), ['here', 'done'])}
        and h.closedBy is null
        and not exists (select 1 from ModerationReport r
                        where r.partyId = h.partyId and r.status in ('closed', 'refused', 'blocked'))
        and not exists (select 1 from MeetupBlock b
                        where b.serverId = h.serverId and b.memberId = h.createdById
                          and b.blockedAt <= coalesce(h.endedAt, h.createdAt)
                          and (b.liftedAt is null
                               or b.liftedAt > coalesce(h.endedAt, h.createdAt)))`.execute(this.db);
    return rows.rows.map(credit);
  }

  async reportCredits(serverId: string, range: BoardRange): Promise<ReportCredit[]> {
    const rows = await sql<{ memberId: string; at: string; confirmations: number }>`
      select reporterId as memberId, endedAt as at, confirmations
      from StopReportHistory
      where serverId = ${serverId} ${from(sql.ref('endedAt'), range.since)}
        and reporterId is not null ${ofMember(sql.ref('reporterId'), range.memberId)}
        and ending in (${counting})`.execute(this.db);
    return rows.rows.map((row) => ({
      memberId: row.memberId,
      at: Number(row.at),
      confirmations: Number(row.confirmations),
    }));
  }

  async reportScores(serverId: string, memberIds?: readonly string[]): Promise<ReportScore[]> {
    if (memberIds?.length === 0) return [];
    const rows = await sql<{
      memberId: string;
      confirmations: string;
      contradicted: string;
      counted: string;
    }>`
      select reporterId as memberId,
             sum(case when ending <> 'staff' then confirmations else 0 end) as confirmations,
             sum(ending = 'contradicted') as contradicted,
             sum(ending in (${counting})) as counted
      from StopReportHistory
      where serverId = ${serverId} and reporterId is not null
        ${memberIds === undefined ? sql`` : sql`and reporterId in (${sql.join([...memberIds])})`}
      group by reporterId`.execute(this.db);
    return rows.rows.map((row) => ({
      memberId: row.memberId,
      confirmations: Number(row.confirmations),
      contradicted: Number(row.contradicted),
      counted: Number(row.counted),
    }));
  }

  async onBoards(serverId: string): Promise<Set<string>> {
    const rows = await this.db
      .selectFrom('LeaderboardOptIn as l')
      .innerJoin('HistoryOptIn as h', (join) =>
        join.onRef('h.serverId', '=', 'l.serverId').onRef('h.memberId', '=', 'l.memberId'),
      )
      .select('l.memberId')
      .where('l.serverId', '=', serverId)
      .execute();
    return new Set(rows.map((row) => row.memberId));
  }

  async latestWants(serverId: string): Promise<WantDay | undefined> {
    const latest = await this.db
      .selectFrom('WantCountDay')
      .select((eb) => eb.fn.max('day').as('day'))
      .where('serverId', '=', serverId)
      .executeTakeFirst();
    const day = latest?.day;
    if (day === undefined || day === null) return undefined;
    const rows = await this.db
      .selectFrom('WantCountDay')
      .select(['target', 'count'])
      .where('serverId', '=', serverId)
      .where('day', '=', day)
      .where('target', 'like', 'species:%')
      .execute();
    return { day, counts: rows.map((row) => ({ target: row.target, count: row.count })) };
  }

  async bossSends(
    serverId: string,
    since: number | null,
  ): Promise<{ bossKey: string; sent: number }[]> {
    const rows = await sql<{ bossKey: string; sent: string }>`
      select h.bossKey, sum(h.reached) as sent
      from PartyHistory h
      where h.serverId = ${serverId} and h.kind in ('raid', 'max') and h.source = 'live'
        ${from(sql.ref('h.createdAt'), since)}
        and h.bossKey is not null
      group by h.bossKey`.execute(this.db);
    return rows.rows.map((row) => ({ bossKey: row.bossKey, sent: Number(row.sent) }));
  }

  async taskReports(
    serverId: string,
    since: number | null,
  ): Promise<{ subjectKey: string; text: string | null; reports: number }[]> {
    const rows = await sql<{ subjectKey: string; text: string | null; reports: string }>`
      select subjectKey, any_value(detail ->> '$.text') as text, count(*) as reports
      from StopReportHistory
      where serverId = ${serverId} ${from(sql.ref('endedAt'), since)}
        and kind = 'research' and ending in (${counting})
        and subjectKey not like 'typed:%'
      group by subjectKey`.execute(this.db);
    return rows.rows.map((row) => ({
      subjectKey: row.subjectKey,
      text: row.text,
      reports: Number(row.reports),
    }));
  }

  async memberParties(serverId: string, memberId: string): Promise<MemberParty[]> {
    // The records by two indexes, as the opt-out counts them: made by the member, or with an
    // attendee row of theirs.
    const rows = await sql<{
      partyId: string;
      splitFromId: string | null;
      kind: HistoryKind;
      at: string;
      regionId: number | null;
      bossKey: string | null;
      anonymous: number;
      made: number;
      furthest: HistoryStatus | null;
      reached: number;
    }>`
      select coalesce(h.partyId, h.legacyKey) as partyId, h.splitFromId, h.kind, h.createdAt as at, h.regionId, h.bossKey, h.anonymous,
             coalesce(h.createdById = ${memberId}, 0) as made, a.furthest, h.reached
      from PartyHistory h
      left join PartyHistoryAttendee a on a.historyId = h.id and a.memberId = ${memberId}
      where h.id in (select id from PartyHistory
                     where createdById = ${memberId} and serverId = ${serverId}
                     union
                     select x.historyId from PartyHistoryAttendee x
                     join PartyHistory y on y.id = x.historyId
                     where x.memberId = ${memberId} and y.serverId = ${serverId})`.execute(this.db);
    return rows.rows.map((row) => ({
      partyId: row.partyId,
      splitFromId: row.splitFromId,
      kind: row.kind,
      at: Number(row.at),
      regionId: row.regionId,
      bossKey: row.bossKey,
      anonymous: Number(row.anonymous) === 1,
      made: Number(row.made) === 1,
      furthest: row.furthest,
      reached: Number(row.reached),
    }));
  }

  async memberReports(serverId: string, memberId: string): Promise<MemberReport[]> {
    const rows = await this.db
      .selectFrom('StopReportHistory')
      .select(['endedAt', 'reach'])
      .where('serverId', '=', serverId)
      .where('reporterId', '=', memberId)
      .execute();
    return rows.map((row) => ({ at: Number(row.endedAt), reach: Number(row.reach) }));
  }
}
