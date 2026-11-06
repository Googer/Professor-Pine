import { CompiledQuery, sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { leaderboardCases } from '../../../test/support/leaderboard-cases.js';
import { raidsAlongCases } from '../../../test/support/raids-along-cases.js';
import { boardAttendee, boardRecord } from '../../../test/support/board-cases.js';
import {
  trainHistoryCases,
  trainRecord,
  TRAINS_SERVER,
  TRAINS_ZONE,
} from '../../../test/support/train-history-cases.js';
import type { HistoryRecord } from '../../domain/history/party-history.js';
import { trainCard } from '../../domain/history/train-card.js';
import { trainMonthRange } from '../../domain/history/trains-on-web.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { createDb } from '../kysely.js';
import type { DB } from '../types.js';
import { HistoryRepository } from './history-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const NOWHERE = '499999999999999999';
const NOW = 1_800_000_000_000;

describe('HistoryRepository: who is named in the history', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;
  let history: HistoryRepository;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
    history = new HistoryRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('PartyHistory').execute();
    await db.deleteFrom('HistoryOptIn').execute();
    await db.deleteFrom('LeaderboardOptIn').execute();
    await db.deleteFrom('StopReportHistory').execute();
  });

  /** A party of the history in a server (by snowflake), made by `creator`, with these attendees. */
  const kept = async (server: string, creator: string | null, members: (string | null)[]) => {
    await sql`insert into PartyHistory (source, kind, serverId, createdAt, ending, createdById,
                                        conductorId)
              values ('live', 'train', ${server}, ${NOW}, 'completed', ${creator},
                      ${creator})`.execute(db);
    const id = Number(
      (await sql<{ id: number }>`select max(id) as id from PartyHistory`.execute(db)).rows[0]?.id,
    );
    for (const [seq, member] of members.entries()) {
      await sql`insert into PartyHistoryAttendee (historyId, seq, memberId, status, furthest)
                values (${id}, ${seq}, ${member}, 'here', 'here')`.execute(db);
    }
    return id;
  };
  /** A record of a report at a stop that ended in a server (plan 8H-2), by `reporter`. */
  const reported = async (server: string, reporter: string | null) => {
    const made = await db
      .insertInto('StopReportHistory')
      .values({
        reportId: 1,
        reportMadeAt: String(NOW),
        serverId: server,
        kind: 'research',
        periodKey: 'day:2027-01-15',
        subjectKey: 'a'.repeat(16),
        detail: JSON.stringify({}),
        madeAt: String(NOW),
        endsAt: String(NOW + 1),
        endedAt: String(NOW + 1),
        reporterId: reporter,
        ending: 'stood',
      })
      .executeTakeFirstOrThrow();
    return Number(made.insertId);
  };
  const reporters = async () =>
    db
      .selectFrom('StopReportHistory')
      .select(['id', 'serverId', 'reporterId'])
      .orderBy('id')
      .execute();
  const named = async () => {
    const parties = await db
      .selectFrom('PartyHistory')
      .select(['id', 'serverId', 'createdById', 'conductorId'])
      .orderBy('id')
      .execute();
    const attendees = await db
      .selectFrom('PartyHistoryAttendee')
      .select(['historyId', 'seq', 'memberId'])
      .orderBy('historyId')
      .orderBy('seq')
      .execute();
    return { parties, attendees };
  };

  it('names nobody until a member opts in, per server', async () => {
    expect(await history.isOptedIn(ALICE, HOME)).toBe(false);
    expect(await history.optIn(ALICE, HOME, NOW)).toBe(true);
    expect(await history.optIn(ALICE, HOME, NOW + 1)).toBe(false);
    expect(await history.isOptedIn(ALICE, HOME)).toBe(true);
    expect(await history.isOptedIn(ALICE, AWAY)).toBe(false);
    expect(await history.isOptedIn(BOB, HOME)).toBe(false);
  });

  it('keeps an opt-in by the server alone: no Guild row is needed or made', async () => {
    expect(await history.optIn(ALICE, NOWHERE, NOW)).toBe(true);
    expect(await history.isOptedIn(ALICE, NOWHERE)).toBe(true);
    expect(
      await db.selectFrom('Guild').select('id').where('snowflake', '=', NOWHERE).execute(),
    ).toEqual([]);
  });

  it('forgets two members who opt out at the same moment, each in the party the other made', async () => {
    // Each opt-out reads the parties of the attendee rows it clears (locked shared), then clears
    // the parties its member made: two at once, each in the other's party, deadlock. Over 200
    // rounds: they meet in the middle too seldom to be seen in fewer.
    for (let round = 0; round < 200; round++) {
      await db.deleteFrom('PartyHistory').execute();
      const hers = await kept(HOME, ALICE, [BOB]);
      const his = await kept(HOME, BOB, [ALICE]);
      const both = await Promise.all([history.optOut(ALICE, HOME), history.optOut(BOB, HOME)]);
      expect(both).toEqual([
        { changed: false, forgotten: 2, leftBoards: false },
        { changed: false, forgotten: 2, leftBoards: false },
      ]);
      expect(await named()).toEqual({
        parties: [
          { id: hers, serverId: HOME, createdById: null, conductorId: null },
          { id: his, serverId: HOME, createdById: null, conductorId: null },
        ],
        attendees: [
          { historyId: hers, seq: 0, memberId: null },
          { historyId: his, seq: 0, memberId: null },
        ],
      });
    }
  });

  it('forgets a member who opts out in every party of that server, and only there', async () => {
    await history.optIn(ALICE, HOME, NOW);
    await history.optIn(ALICE, AWAY, NOW);
    const first = await kept(HOME, ALICE, [ALICE, null, BOB]);
    const second = await kept(HOME, BOB, [BOB, ALICE]);
    const elsewhere = await kept(AWAY, ALICE, [ALICE]);

    // Named as maker, conductor and attendee of the first party: it counts once.
    expect(await history.optOut(ALICE, HOME)).toEqual({
      changed: true,
      forgotten: 2,
      leftBoards: false,
    });
    expect(await history.isOptedIn(ALICE, HOME)).toBe(false);
    expect(await history.isOptedIn(ALICE, AWAY)).toBe(true);
    // The rows stay, without her id; the other server and the other member keep theirs.
    expect(await named()).toEqual({
      parties: [
        { id: first, serverId: HOME, createdById: null, conductorId: null },
        { id: second, serverId: HOME, createdById: BOB, conductorId: BOB },
        { id: elsewhere, serverId: AWAY, createdById: ALICE, conductorId: ALICE },
      ],
      attendees: [
        { historyId: first, seq: 0, memberId: null },
        { historyId: first, seq: 1, memberId: null },
        { historyId: first, seq: 2, memberId: BOB },
        { historyId: second, seq: 0, memberId: BOB },
        { historyId: second, seq: 1, memberId: null },
        { historyId: elsewhere, seq: 0, memberId: ALICE },
      ],
    });
  });

  it('forgets a member who opts out in their reports at stops of that server too, counted (plan 8H-2)', async () => {
    await history.optIn(ALICE, HOME, NOW);
    await kept(HOME, ALICE, [ALICE]);
    const mine = await reported(HOME, ALICE);
    const again = await reported(HOME, ALICE);
    const his = await reported(HOME, BOB);
    const away = await reported(AWAY, ALICE);
    // One party and two reports.
    expect(await history.optOut(ALICE, HOME)).toEqual({
      changed: true,
      forgotten: 3,
      leftBoards: false,
    });
    expect(await reporters()).toEqual([
      { id: mine, serverId: HOME, reporterId: null },
      { id: again, serverId: HOME, reporterId: null },
      { id: his, serverId: HOME, reporterId: BOB },
      { id: away, serverId: AWAY, reporterId: ALICE },
    ]);
    expect(await history.optOut(ALICE, HOME)).toEqual({
      changed: false,
      forgotten: 0,
      leftBoards: false,
    });
  });

  it('forgets a member who opts out even when they were not opted in, or the server left', async () => {
    const id = await kept(NOWHERE, null, [ALICE]);
    expect(await history.optOut(ALICE, NOWHERE)).toEqual({
      changed: false,
      forgotten: 1,
      leftBoards: false,
    });
    expect((await named()).attendees).toEqual([{ historyId: id, seq: 0, memberId: null }]);
    expect(await history.optOut(ALICE, HOME)).toEqual({
      changed: false,
      forgotten: 0,
      leftBoards: false,
    });
  });

  describe('the switch of the boards (plan 8H-6)', () => {
    leaderboardCases(() => Promise.resolve(history));

    it('never leaves a board row without its history opt-in when an opt-out runs at once (B11, A10)', async () => {
      for (let n = 0; n < 25; n++) {
        await Promise.all([history.joinBoards(ALICE, HOME, NOW + n), history.optOut(ALICE, HOME)]);
        const orphans = await sql<{ n: number }>`
          select count(*) as n from LeaderboardOptIn l
          where not exists (select 1 from HistoryOptIn h
                            where h.serverId = l.serverId and h.memberId = l.memberId)`.execute(db);
        expect(Number(orphans.rows[0]?.n), `round ${String(n)}`).toBe(0);
      }
    });

    it('keeps when the member switched the boards on, by the server’s snowflake', async () => {
      expect(await history.joinBoards(ALICE, HOME, NOW)).toEqual({ joined: true, historyOn: true });
      const rows = await db.selectFrom('LeaderboardOptIn').selectAll().execute();
      expect(rows).toEqual([{ serverId: HOME, memberId: ALICE, createdAt: String(NOW) }]);
    });
  });

  describe('the raids along a train’s way (plan 8H-7A)', () => {
    raidsAlongCases(async () => {
      await db.deleteFrom('PartyHistory').execute();
      return {
        reader: history,
        add: async (records) => {
          await history.insertRecords(records);
        },
      };
    });
  });

  describe('the ended trains for the web (plan 8H-7B)', () => {
    const idOf = async (record: HistoryRecord) =>
      (
        await db
          .selectFrom('PartyHistory')
          .select('id')
          .where(
            record.partyId === null ? 'legacyKey' : 'partyId',
            '=',
            record.partyId ?? record.legacyKey ?? '',
          )
          .executeTakeFirstOrThrow()
      ).id;
    trainHistoryCases(async () => {
      await db.deleteFrom('PartyHistory').execute();
      return {
        reader: history,
        add: async (records) => {
          await history.insertRecords(records);
        },
        idOf,
      };
    });

    it('reads a month’s trains along (serverId, kind, createdAt), past its other records', async () => {
      await db.deleteFrom('PartyHistory').execute();
      const june = trainMonthRange('2026-06', TRAINS_ZONE);
      const trains = Array.from({ length: 5 }, (_, n) => trainRecord(june.from + n * 86_400_000));
      // Many raids of the server beside them, of that month and others.
      const raids = Array.from({ length: 200 }, (_, n) =>
        boardRecord({ serverId: TRAINS_SERVER, createdAt: june.from + (n - 100) * 3_600_000 }),
      );
      await history.insertRecords([...trains, ...raids]);
      await sql`analyze table PartyHistory`.execute(db);
      const asked: CompiledQuery[] = [];
      const logged = createDb<DB>(database.config, (event) => {
        if (event.level === 'query') asked.push(event.query);
      });
      try {
        const read = await new HistoryRepository(logged).trainsMade(TRAINS_SERVER, june);
        expect(read).toHaveLength(5);
        const [query] = asked;
        if (query === undefined) throw new Error('the month’s read asked nothing');
        const plan = await db.executeQuery<{ key: string | null }>(
          CompiledQuery.raw(`explain ${query.sql}`, [...query.parameters]),
        );
        expect(plan.rows[0]?.key).toBe('partyhistory_server_kind_createdat_index');
      } finally {
        await logged.destroy();
      }
    });
  });

  describe('the rows of a train’s card, read back (plan 8H-7A)', () => {
    const MINUTE = 60_000;
    const SPOT = 'c0ffee00c0ffee00c0ffee00c0ffee00.16';
    const train = boardRecord({
      kind: 'train',
      serverId: HOME,
      gymId: null,
      tier: null,
      boss: null,
      createdAt: NOW,
      startTime: NOW,
      endTime: NOW + 120 * MINUTE,
      endedAt: NOW + 180 * MINUTE,
      peakRiders: 2,
      attendees: [
        boardAttendee(ALICE, 'here', { extras: 1 }),
        boardAttendee(null, 'done', { doneAt: NOW + 60 * MINUTE }),
        boardAttendee(null, 'here', { status: null, leftAt: NOW + 30 * MINUTE, splitOff: true }),
        boardAttendee(BOB, 'joined'),
      ],
      stops: [
        {
          gymId: 1,
          legacyGymId: null,
          wayspotId: null,
          arrivedAt: NOW,
          leftAt: NOW + 20 * MINUTE,
          regionIds: [2, 1],
        },
        {
          gymId: null,
          legacyGymId: null,
          wayspotId: SPOT,
          arrivedAt: NOW + 20 * MINUTE,
          leftAt: null,
          regionIds: [],
        },
        // A stop of a record of before 041: its regions not known.
        {
          gymId: 3,
          legacyGymId: null,
          wayspotId: null,
          arrivedAt: NOW + 50 * MINUTE,
          leftAt: null,
        },
      ],
    });
    const idOf = async (partyId: string | null) =>
      (
        await db
          .selectFrom('PartyHistory')
          .select('id')
          .where('partyId', '=', partyId ?? '')
          .executeTakeFirstOrThrow()
      ).id;

    it('reads a train’s record, stops and attendees as the card takes them', async () => {
      const raid = boardRecord({ serverId: HOME });
      await history.insertRecords([train, raid]);
      const id = await idOf(train.partyId);
      const read = await history.trainCardRows(HOME, [id, await idOf(raid.partyId), 999_999]);
      // Trains only.
      expect([...read.keys()]).toEqual([id]);
      const rows = read.get(id);
      expect(rows).toEqual({
        serverId: HOME,
        // What the web lists of it (plan 8H-7B).
        listing: { source: 'live', name: null, createdAt: NOW, regionId: 1, here: 2, done: 1 },
        record: { endedAt: NOW + 180 * MINUTE, endTime: NOW + 120 * MINUTE, peakRiders: 2 },
        stops: [
          {
            gymId: 1,
            wayspotId: null,
            arrivedAt: NOW,
            leftAt: NOW + 20 * MINUTE,
            regionIds: [2, 1],
          },
          {
            gymId: null,
            wayspotId: SPOT,
            arrivedAt: NOW + 20 * MINUTE,
            leftAt: null,
            regionIds: [],
          },
          {
            gymId: 3,
            wayspotId: null,
            arrivedAt: NOW + 50 * MINUTE,
            leftAt: null,
            regionIds: null,
          },
        ],
        attendees: [
          {
            furthest: 'here',
            status: 'here',
            extras: 1,
            remote: false,
            leftAt: null,
            doneAt: null,
          },
          {
            furthest: 'done',
            status: 'done',
            extras: 0,
            remote: false,
            leftAt: null,
            doneAt: NOW + 60 * MINUTE,
          },
          {
            furthest: 'here',
            status: null,
            extras: 0,
            remote: false,
            leftAt: NOW + 30 * MINUTE,
            doneAt: null,
            splitOff: true,
          },
          {
            furthest: 'joined',
            status: 'joined',
            extras: 0,
            remote: false,
            leftAt: null,
            doneAt: null,
          },
        ],
      });
      // The card of the rows read back is the card of the record as it was written.
      if (!rows) throw new Error('no rows');
      const raids = [
        { id: 1, ...raid, gymId: 1, hatchTime: NOW + 5 * MINUTE, endTime: NOW + 50 * MINUTE },
      ];
      expect(trainCard(rows.record, rows.stops, rows.attendees, raids)).toEqual(
        trainCard(train, train.stops, train.attendees, raids),
      );
      expect(trainCard(rows.record, rows.stops, rows.attendees, raids)).toMatchObject({
        stops: { count: 3 },
        regionIds: [2, 1],
        riders: { members: 3, heads: 4 },
        peakRiders: 2,
      });
    });

    it('reads no most at once of a record that kept none', async () => {
      const old = { ...train, partyId: '00000000-0000-4000-8000-00000000beef', peakRiders: null };
      await history.insertRecords([old]);
      const read = await history.trainCardRows(HOME, [await idOf(old.partyId)]);
      expect([...read.values()][0]?.record.peakRiders).toBeNull();
    });
  });
});
