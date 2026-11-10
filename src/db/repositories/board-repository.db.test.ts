import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ASH,
  BOARD_NOW,
  BOARD_SERVER,
  boardAttendee,
  boardReaderCases,
  boardRecord,
  BROCK,
  keptReport,
  OTHER_BOARD_SERVER,
  type BoardWorld,
  type KeptReport,
} from '../../../test/support/board-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { planOf, scanned } from '../../../test/support/query-plan.js';
import type { HistoryRecord } from '../../domain/history/party-history.js';
import type { DB } from '../types.js';
import { BoardRepository } from './board-repository.js';
import { HistoryRepository } from './history-repository.js';

describe('BoardRepository: what the boards read', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const clear = async () => {
    for (const table of [
      'PartyHistory',
      'StopReportHistory',
      'HistoryOptIn',
      'LeaderboardOptIn',
      'WantCountDay',
      'ModerationReport',
      'MeetupBlock',
    ] as const) {
      await db.deleteFrom(table).execute();
    }
  };
  const writeReports = async (reports: readonly KeptReport[]) => {
    if (reports.length === 0) return;
    await db
      .insertInto('StopReportHistory')
      .values(
        reports.map((report, index) => ({
          reportId: index + 1,
          reportMadeAt: String(report.endedAt - 1),
          serverId: report.serverId,
          kind: report.kind,
          periodKey: 'day:2026-11-05',
          subjectKey: report.subjectKey,
          detail: JSON.stringify(
            report.text === null
              ? {}
              : { text: report.text, category: null, rewards: [], typed: false },
          ),
          madeAt: String(report.endedAt - 1),
          endsAt: String(report.endedAt),
          endedAt: String(report.endedAt),
          reporterId: report.reporterId,
          confirmations: report.confirmations,
          reach: report.reach,
          ending: report.ending,
        })),
      )
      .execute();
  };
  const world = (): BoardWorld => {
    const history = new HistoryRepository(db);
    return {
      reader: new BoardRepository(db),
      party: async (record: HistoryRecord) => {
        await history.insertRecords([record]);
      },
      report: (report) => writeReports([report]),
      onBoard: async (memberId, serverId = BOARD_SERVER) => {
        await history.joinBoards(memberId, serverId, BOARD_NOW);
      },
      optedIn: async (memberId, serverId = BOARD_SERVER) => {
        await history.optIn(memberId, serverId, BOARD_NOW);
      },
      wants: async (day, target, count, serverId = BOARD_SERVER) => {
        await db.insertInto('WantCountDay').values({ serverId, day, target, count }).execute();
      },
      moderated: async (partyId, status) => {
        await sql`insert into ModerationReport (id, serverId, kind, partyId, subject, createdAt, status)
                  values (uuid(), ${BOARD_SERVER}, 'party', ${partyId}, '{}', ${BOARD_NOW},
                          ${status})`.execute(db);
      },
      blocked: async (memberId, at, lifted) => {
        await db
          .insertInto('MeetupBlock')
          .values({
            serverId: BOARD_SERVER,
            memberId,
            blockedBy: BROCK,
            blockedAt: String(at),
            liftedAt: lifted === undefined ? null : String(lifted),
          })
          .execute();
      },
    };
  };

  boardReaderCases(async () => {
    await clear();
    return world();
  });

  describe('a server of thousands of records (B10; its times are measured by hand, A10)', () => {
    const members = Array.from(
      { length: 40 },
      (_, n) => `3123456789012${String(n).padStart(5, '0')}`,
    );
    // One who made raids and trains (every fortieth record from the first), one who made raids,
    // max battles and meetups (from the second).
    const one = members[0] ?? ASH;
    const two = members[1] ?? BROCK;
    const DAY = 86_400_000;
    const all = { since: null };
    const index = 'partyhistory_server_source_kind_createdat_index';

    // 6,000 live records of forty members and 4,000 reports at stops; five legacy records beside
    // each live one, as the import leaves far more (30,000; 36,000 in all, with 18,000 attendee
    // rows); thirty records of `one` in another server; and, as the legacy fill-in leaves them
    // (Part H), some legacy records that name `one` as their maker or as an attendee.
    beforeAll(async () => {
      await clear();
      const records = Array.from({ length: 6_000 }, (_, n) => {
        const maker = members[n % members.length] ?? ASH;
        const kind = (['raid', 'raid', 'raid', 'max', 'train', 'meetup'] as const)[n % 6] ?? 'raid';
        return boardRecord({
          kind,
          createdById: maker,
          createdAt: BOARD_NOW - (n % 700) * DAY,
          reached: n % 13,
          attendees: [
            boardAttendee(maker, 'done', { conducted: kind === 'train' ? 2 : 0 }),
            boardAttendee(
              members[(n + 1) % members.length] ?? BROCK,
              n % 3 === 0 ? 'joined' : 'done',
            ),
            boardAttendee(null, 'here'),
          ],
        });
      });
      const history = new HistoryRepository(db);
      for (let start = 0; start < records.length; start += 1_000) {
        await history.insertRecords(records.slice(start, start + 1_000));
      }
      await writeReports(
        Array.from({ length: 4_000 }, (_, n) =>
          keptReport({
            reporterId: members[n % members.length] ?? ASH,
            endedAt: BOARD_NOW - (n % 700) * DAY,
            ending: n % 7 === 0 ? 'contradicted' : 'stood',
            confirmations: n % 3,
            subjectKey: (n % 50).toString(16).padStart(16, '0'),
          }),
        ),
      );
      for (let copy = 0; copy < 5; copy++) {
        await sql`insert into PartyHistory (source, legacyKey, kind, serverId, createdAt, ending,
                                            bossKey, reached)
                  select 'legacy', concat('x:', ${copy}, ':', id), kind, serverId, createdAt - 1,
                         ending, bossKey, 0
                  from PartyHistory where source = 'live'`.execute(db);
      }
      await history.insertRecords(
        Array.from({ length: 30 }, (_, n) =>
          boardRecord({
            serverId: OTHER_BOARD_SERVER,
            createdById: one,
            createdAt: BOARD_NOW - n * DAY,
            attendees: [boardAttendee(one, 'done'), boardAttendee(BROCK, 'done')],
          }),
        ),
      );
      await sql`update PartyHistory set createdById = ${one}
                where source = 'legacy' and legacyKey like 'x:0:%' and id % 97 = 0`.execute(db);
      await sql`insert into PartyHistoryAttendee (historyId, seq, memberId, status, furthest)
                select id, 0, ${one}, 'done', 'done' from PartyHistory
                where source = 'legacy' and legacyKey like 'x:1:%' and id % 89 = 0`.execute(db);
      await sql`analyze table PartyHistory, PartyHistoryAttendee`.execute(db);
    });

    it('reads every board and a member’s records', async () => {
      const reader = new BoardRepository(db);
      // Of every six: three raids and a max battle (two of them completed by another member), a
      // train and a meetup (another member came to each).
      expect(await reader.raidCredits(BOARD_SERVER, all)).toHaveLength(2_000);
      expect(await reader.trainCredits(BOARD_SERVER, all)).toHaveLength(1_000);
      expect(await reader.meetupCredits(BOARD_SERVER, all)).toHaveLength(1_000);
      expect(await reader.reportCredits(BOARD_SERVER, all)).toHaveLength(3_428);
      expect(await reader.reportScores(BOARD_SERVER)).toHaveLength(40);
      expect((await reader.memberParties(BOARD_SERVER, one)).length).toBeGreaterThan(100);
    });

    it('reads a server’s live records of a kind along the index of 040, past the legacy ones (W2, F3)', async () => {
      const since = BOARD_NOW - 30 * DAY;
      const reads: [string, (seen: BoardRepository) => Promise<unknown>][] = [
        ['raids of a month', (seen) => seen.raidCredits(BOARD_SERVER, { since })],
        ['sent of a month', (seen) => seen.bossSends(BOARD_SERVER, since)],
        // All time (F3): without the index named, MySQL walked the server's records by
        // `(serverId, id)`, the legacy ones too.
        ['raids of all time', (seen) => seen.raidCredits(BOARD_SERVER, all)],
        ['trains of all time', (seen) => seen.trainCredits(BOARD_SERVER, all)],
        ['meetups of all time', (seen) => seen.meetupCredits(BOARD_SERVER, all)],
        ['sent of all time', (seen) => seen.bossSends(BOARD_SERVER, null)],
      ];
      for (const [name, read] of reads) {
        const plan = await planOf(database, (seen) => read(new BoardRepository(seen)));
        expect(plan.find((row) => row.table === 'h')?.key, name).toBe(index);
        expect(scanned(plan), name).toEqual([]);
      }
    });

    it('reads one member’s records from the member’s own rows, never by a scan of the history (plan 8Z-2, audit X1)', async () => {
      const reader = new BoardRepository(db);
      const read = await reader.memberParties(BOARD_SERVER, one);
      // The same rows as the form of before plan 8Z-2 reads (`h.id in (… union …)`, which MySQL
      // runs once per record of the history): the member's live records, the legacy ones filled
      // in, none of another server.
      const before = await sql<{
        partyId: string;
        kind: string;
        at: string;
        made: number;
        furthest: string | null;
        reached: number;
      }>`
        select coalesce(h.partyId, h.legacyKey) as partyId, h.kind, h.createdAt as at,
               coalesce(h.createdById = ${one}, 0) as made, a.furthest, h.reached
        from PartyHistory h
        left join PartyHistoryAttendee a on a.historyId = h.id and a.memberId = ${one}
        where h.id in (select id from PartyHistory
                       where createdById = ${one} and serverId = ${BOARD_SERVER}
                       union
                       select x.historyId from PartyHistoryAttendee x
                       join PartyHistory y on y.id = x.historyId
                       where x.memberId = ${one} and y.serverId = ${BOARD_SERVER})`.execute(db);
      const line = (row: {
        partyId: string;
        kind: string;
        at: number;
        made: boolean;
        furthest: string | null;
        reached: number;
      }) => JSON.stringify([row.partyId, row.kind, row.at, row.made, row.furthest, row.reached]);
      expect(read.map(line).sort()).toEqual(
        before.rows
          .map((row) =>
            line({
              ...row,
              at: Number(row.at),
              made: Number(row.made) === 1,
              reached: Number(row.reached),
            }),
          )
          .sort(),
      );
      // 150 live records made and 150 more come to, and the legacy ones filled in.
      const legacy = read.filter((party) => party.partyId.startsWith('x:'));
      expect(read.length - legacy.length).toBe(300);
      expect(legacy.filter((party) => party.made).length).toBeGreaterThan(0);
      expect(legacy.filter((party) => party.furthest === 'done').length).toBeGreaterThan(0);

      const plan = await planOf(database, (seen) =>
        new BoardRepository(seen).memberParties(BOARD_SERVER, one),
      );
      expect(plan.filter((row) => row.select_type.includes('DEPENDENT'))).toEqual([]);
      expect(scanned(plan)).toEqual([]);
      expect(plan.find((row) => row.table === 'h')).toMatchObject({
        type: 'eq_ref',
        key: 'PRIMARY',
      });
    });

    it('reads one member’s credits by the member, not along all of the server’s live records (plan 8Z-2, audit X5)', async () => {
      const reader = new BoardRepository(db);
      const mine = { since: null, memberId: one };
      const theirs = { since: null, memberId: two };
      const sorted = <T extends { memberId: string; at: number }>(credits: T[]) =>
        credits.map((credit) => JSON.stringify(credit)).sort();
      const of = <T extends { memberId: string }>(memberId: string, credits: T[]) =>
        credits.filter((credit) => credit.memberId === memberId);
      // The same credits as the server's read gives of the member, whatever index reads them.
      const raids = await reader.raidCredits(BOARD_SERVER, mine);
      expect(raids).toHaveLength(50);
      expect(sorted(raids)).toEqual(sorted(of(one, await reader.raidCredits(BOARD_SERVER, all))));
      const trains = await reader.trainCredits(BOARD_SERVER, mine);
      expect(trains).toHaveLength(50);
      expect(sorted(trains)).toEqual(sorted(of(one, await reader.trainCredits(BOARD_SERVER, all))));
      const meetups = await reader.meetupCredits(BOARD_SERVER, theirs);
      expect(meetups).toHaveLength(50);
      expect(sorted(meetups)).toEqual(
        sorted(of(two, await reader.meetupCredits(BOARD_SERVER, all))),
      );

      // Raids and meetups by the records the member made; a train from the member's attendee
      // rows, its record by its id.
      const made = 'partyhistory_createdbyid_index';
      const raidPlan = await planOf(database, (seen) =>
        new BoardRepository(seen).raidCredits(BOARD_SERVER, mine),
      );
      expect(raidPlan.find((row) => row.table === 'h')?.key).toBe(made);
      expect(scanned(raidPlan)).toEqual([]);
      const meetupPlan = await planOf(database, (seen) =>
        new BoardRepository(seen).meetupCredits(BOARD_SERVER, theirs),
      );
      expect(meetupPlan.find((row) => row.table === 'h')?.key).toBe(made);
      expect(scanned(meetupPlan)).toEqual([]);
      const trainPlan = await planOf(database, (seen) =>
        new BoardRepository(seen).trainCredits(BOARD_SERVER, mine),
      );
      expect(trainPlan.find((row) => row.table === 'a')?.key).toBe(
        'partyhistoryattendee_memberid_index',
      );
      expect(trainPlan.find((row) => row.table === 'h')).toMatchObject({
        type: 'eq_ref',
        key: 'PRIMARY',
      });
      expect(scanned(trainPlan)).toEqual([]);
    });
  });
});
