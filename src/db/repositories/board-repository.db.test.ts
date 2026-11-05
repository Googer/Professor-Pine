import { CompiledQuery, sql, type Kysely } from 'kysely';
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
  type BoardWorld,
  type KeptReport,
} from '../../../test/support/board-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import type { HistoryRecord } from '../../domain/history/party-history.js';
import { createDb } from '../kysely.js';
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

  it('reads a server of thousands of records (B10; its times are measured by hand, A10)', async () => {
    await clear();
    const members = Array.from(
      { length: 40 },
      (_, n) => `3123456789012${String(n).padStart(5, '0')}`,
    );
    const DAY = 86_400_000;
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
    const reader = new BoardRepository(db);
    const all = { since: null };
    // Of every six: three raids and a max battle (two of them completed by another member), a
    // train and a meetup (another member came to each).
    expect(await reader.raidCredits(BOARD_SERVER, all)).toHaveLength(2_000);
    expect(await reader.trainCredits(BOARD_SERVER, all)).toHaveLength(1_000);
    expect(await reader.meetupCredits(BOARD_SERVER, all)).toHaveLength(1_000);
    expect(await reader.reportCredits(BOARD_SERVER, all)).toHaveLength(3_428);
    expect(await reader.reportScores(BOARD_SERVER)).toHaveLength(40);
    const one = members[0] ?? ASH;
    expect((await reader.memberParties(BOARD_SERVER, one)).length).toBeGreaterThan(100);

    // As many legacy records beside them, as the import leaves: the reads of live records of a
    // kind from a moment on go along the index of 040, past the legacy ones (W2).
    await sql`insert into PartyHistory (source, legacyKey, kind, serverId, createdAt, ending,
                                        bossKey, reached)
              select 'legacy', concat('x:', id), kind, serverId, createdAt - 1, ending, bossKey, 0
              from PartyHistory`.execute(db);
    await sql`analyze table PartyHistory, PartyHistoryAttendee`.execute(db);
    const asked: CompiledQuery[] = [];
    const logged = createDb<DB>(database.config, (event) => {
      if (event.level === 'query') asked.push(event.query);
    });
    try {
      const since = BOARD_NOW - 30 * DAY;
      const seen = new BoardRepository(logged);
      await seen.raidCredits(BOARD_SERVER, { since });
      await seen.bossSends(BOARD_SERVER, since);
      expect(asked).toHaveLength(2);
      for (const query of asked) {
        const plan = await db.executeQuery<{ table: string; key: string | null }>(
          CompiledQuery.raw(`explain ${query.sql}`, [...query.parameters]),
        );
        expect(plan.rows.find((row) => row.table === 'h')?.key, query.sql.slice(0, 60)).toBe(
          'partyhistory_server_source_kind_createdat_index',
        );
      }
    } finally {
      await logged.destroy();
    }
  });
});
