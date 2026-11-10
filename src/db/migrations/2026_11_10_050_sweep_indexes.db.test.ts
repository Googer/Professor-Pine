import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { planOf, plansOf, scanned } from '../../../test/support/query-plan.js';
import { MeetupSafetyRepository } from '../repositories/meetup-safety-repository.js';
import { ReportRepository } from '../repositories/report-repository.js';
import { UserRepository } from '../repositories/user-repository.js';
import type { DB } from '../types.js';
import { sweepIndexes } from './2026_11_10_050_sweep_indexes.js';

const HOME = '412345678901234567';
const OTHER = '412345678901234568';
const CHANNEL = '512345678901234567';
const MESSAGE = '612345678901234567';
const MEMBER = '312345678901234567';
/** 2026-11-05 in the morning, UTC. */
const NOW = 1_793_000_000_000;
const MINUTE = 60_000;
const DAY = 86_400_000;

/** The indexes of migration 050, as `information_schema.statistics` names their columns in order. */
const INDEXES: [table: string, index: string, columns: string[]][] = [
  ['User', 'user_nickname_index', ['nickname']],
  ['ModerationReport', 'moderationreport_status_createdat_index', ['status', 'createdAt']],
  ['MeetupAppeal', 'meetupappeal_status_createdat_index', ['status', 'createdAt']],
  ['MeetupPlaceAsk', 'meetupplaceask_status_createdat_index', ['status', 'createdAt']],
  ['MeetupRequest', 'meetuprequest_stranded_index', ['status', 'partyId', 'decidedAt']],
];

describe('migration 050: indexes for the sweeps of each minute and the nickname lookup', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const columnsOf = async (table: string, index: string) => {
    const rows = await sql<{ name: string; unique: number | string }>`
      select column_name as name, non_unique = 0 as \`unique\`
      from information_schema.statistics
      where table_schema = database() and table_name = ${table} and index_name = ${index}
      order by seq_in_index`.execute(db);
    return rows.rows.map((row) => ({ name: row.name, unique: Number(row.unique) === 1 }));
  };

  it('adds each index, none of them unique', async () => {
    for (const [table, index, columns] of INDEXES) {
      expect(await columnsOf(table, index), index).toEqual(
        columns.map((name) => ({ name, unique: false })),
      );
    }
  });

  it('runs again: what is there stays, what a failure half-way left out is added', async () => {
    await sql`drop index meetupappeal_status_createdat_index on MeetupAppeal`.execute(db);
    await sql`drop index meetuprequest_stranded_index on MeetupRequest`.execute(db);
    await sweepIndexes.up(db);
    await sweepIndexes.up(db);
    for (const [table, index, columns] of INDEXES) {
      expect(await columnsOf(table, index), index).toEqual(
        columns.map((name) => ({ name, unique: false })),
      );
    }
  });

  it('leaves an index of its name that somebody added by hand as it is', async () => {
    await sql`drop index user_nickname_index on User`.execute(db);
    await sql`create index user_nickname_index on User (nickname, userSnowflake)`.execute(db);
    try {
      await sweepIndexes.up(db);
      expect(await columnsOf('User', 'user_nickname_index')).toEqual([
        { name: 'nickname', unique: false },
        { name: 'userSnowflake', unique: false },
      ]);
    } finally {
      await sql`drop index user_nickname_index on User`.execute(db);
      await sweepIndexes.up(db);
    }
    expect(await columnsOf('User', 'user_nickname_index')).toEqual([
      { name: 'nickname', unique: false },
    ]);
  });

  describe('beside thousands of rows, few of them open', () => {
    // 3,000 rows a table, as years of moderation leave them: nearly all decided, a dozen open
    // (half of those not posted yet), among the meetup requests some 2,100 approved with their
    // party and five approved without one; 3,000 members, four in five with an in-game name.
    beforeAll(async () => {
      const rows = <T>(row: (n: number) => T): T[] =>
        Array.from({ length: 3_000 }, (_, n) => row(n));
      const open = (n: number) => n % 250 === 0;
      const posted = (n: number) => (n % 500 === 0 ? null : MESSAGE);
      const at = (n: number) => String(NOW - n * MINUTE);
      const serverId = (n: number) => (n % 2 === 0 ? HOME : OTHER);
      const decided = ['closed', 'refused', 'ended', 'gone', 'blocked'];
      await db
        .insertInto('ModerationReport')
        .values(
          rows((n) => ({
            id: randomUUID(),
            serverId: serverId(n),
            kind: n % 3 === 1 ? 'message' : 'party',
            subject: '{}',
            createdAt: at(n),
            status: open(n) ? 'open' : (decided[n % decided.length] ?? 'closed'),
            messageId: posted(n),
          })),
        )
        .execute();
      await db
        .insertInto('MeetupAppeal')
        .values(
          rows((n) => ({
            id: randomUUID(),
            serverId: serverId(n),
            memberId: MEMBER,
            text: 'Please',
            createdAt: at(n),
            status: open(n) ? 'open' : n % 2 === 0 ? 'lifted' : 'refused',
            messageId: posted(n),
          })),
        )
        .execute();
      await db
        .insertInto('MeetupPlaceAsk')
        .values(
          rows((n) => ({
            id: randomUUID(),
            serverId: serverId(n),
            placeKind: 'gym',
            placeId: String(n),
            place: '{}',
            memberId: MEMBER,
            text: 'Please',
            createdAt: at(n),
            status: open(n) ? 'open' : n % 2 === 0 ? 'kept' : 'changed',
            messageId: posted(n),
          })),
        )
        .execute();
      const requestStatus = (n: number) =>
        n % 300 === 1 ? 'pending' : n % 10 < 7 ? 'approved' : n % 10 < 9 ? 'declined' : 'expired';
      await db
        .insertInto('MeetupRequest')
        .values(
          rows((n) => ({
            id: randomUUID(),
            serverId: serverId(n),
            regionChannelId: CHANNEL,
            makerId: MEMBER,
            place: '{}',
            name: 'Community Day',
            startTime: at(n),
            description: '',
            createdAt: at(n),
            expiresAt: at(n - 60),
            status: requestStatus(n),
            channelId: CHANNEL,
            messageId: MESSAGE,
            decidedAt: requestStatus(n) === 'pending' ? null : at(n + 60),
            // An approval whose meetup was never made is stranded: every six hundredth.
            partyId: requestStatus(n) !== 'approved' || n % 600 === 0 ? null : randomUUID(),
          })),
        )
        .execute();
      await db
        .insertInto('User')
        .values(
          rows((n) => ({
            userSnowflake: `7123456789${String(n).padStart(8, '0')}`,
            nickname: n % 5 === 0 ? null : `Trainer${String(n)}`,
          })),
        )
        .execute();
      await sql`analyze table ModerationReport, MeetupAppeal, MeetupPlaceAsk, MeetupRequest,
                              User`.execute(db);
    });

    /** The first statement's plan: the sweep's own read (a second reads the rows' reasons). */
    const sweepPlan = async (read: (seen: Kysely<DB>) => Promise<unknown>) => {
      const [plan] = await plansOf(database, read);
      if (plan === undefined) throw new Error('the sweep asked nothing');
      return plan;
    };

    it('finds the open reports of a sweep by their status, never by reading every report', async () => {
      const index = 'moderationreport_status_createdat_index';
      const parties = await sweepPlan((seen) => new ReportRepository(seen).openPartyReports());
      expect(parties.map((row) => row.key)).toEqual([index]);
      expect(scanned(parties)).toEqual([]);
      const unposted = await sweepPlan((seen) =>
        new ReportRepository(seen).unpostedReports(NOW - 10 * MINUTE),
      );
      expect(unposted.map((row) => row.key)).toEqual([index]);
      expect(scanned(unposted)).toEqual([]);
    });

    it('finds the stale appeals and the stale asks about a place by their status', async () => {
      const stale = { unpostedBefore: NOW - 10 * MINUTE, openedBefore: NOW - 14 * DAY };
      const appeals = await planOf(database, (seen) =>
        new MeetupSafetyRepository(seen).staleAppeals(stale),
      );
      expect(appeals.map((row) => row.key)).toEqual(['meetupappeal_status_createdat_index']);
      expect(scanned(appeals)).toEqual([]);
      const asks = await planOf(database, (seen) =>
        new MeetupSafetyRepository(seen).staleAsks(stale),
      );
      expect(asks.map((row) => row.key)).toEqual(['meetupplaceask_status_createdat_index']);
      expect(scanned(asks)).toEqual([]);
    });

    it('finds the approvals without a meetup among the approved ones, not by reading each of them', async () => {
      const stranded = await planOf(database, (seen) =>
        new MeetupSafetyRepository(seen).strandedApprovals(NOW - 10 * MINUTE),
      );
      expect(stranded.map((row) => row.key)).toEqual(['meetuprequest_stranded_index']);
      expect(scanned(stranded)).toEqual([]);
    });

    it('finds the members of an in-game name by the name, whatever its letter case', async () => {
      const users = new UserRepository(db);
      expect(await users.withNickname('trainer1234')).toEqual([
        { snowflake: '712345678900001234', nickname: 'Trainer1234' },
      ]);
      const plan = await planOf(database, (seen) =>
        new UserRepository(seen).withNickname('trainer1234'),
      );
      expect(plan.map((row) => row.key)).toEqual(['user_nickname_index']);
      expect(scanned(plan)).toEqual([]);
    });
  });
});
