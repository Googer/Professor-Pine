import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { DEPRECATED_SYNTAX, lastWarnings } from '../../../test/support/mysql-warnings.js';
import { planOf, scanned } from '../../../test/support/query-plan.js';
import { googleUseCases } from '../../../test/support/google-use-cases.js';
import {
  SPOT_AWAY,
  SPOT_HOME,
  wayspotLookupCases,
} from '../../../test/support/wayspot-lookup-cases.js';
import { OUT_OF_SHARE_RANK } from '../../domain/geo/google-line.js';
import type { DB } from '../types.js';
import { GoogleShareRaiseRepository } from './google-share-raise-repository.js';
import { GoogleUseRepository } from './google-use-repository.js';
import { HistoryRepository } from './history-repository.js';
import { WayspotLookupRepository } from './wayspot-lookup-repository.js';

/** The storage of the line that waits for Google beside the gyms' (plan 8W-6). */
describe('the storage of the Google line', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  describe('WayspotLookupRepository', () => {
    /** An empty line of two servers (`SPOT_HOME`, `SPOT_AWAY`). */
    const fresh = async () => {
      await db.deleteFrom('ServerWayspotLookup').execute();
      await db.deleteFrom('Guild').where('id', 'in', [SPOT_HOME, SPOT_AWAY]).execute();
      await db
        .insertInto('Guild')
        .values([
          { id: SPOT_HOME, snowflake: '412345678901234567' },
          { id: SPOT_AWAY, snowflake: '412345678901234568' },
        ])
        .execute();
      return new WayspotLookupRepository(db);
    };

    wayspotLookupCases(fresh);

    it('queues again without the VALUES() function MySQL deprecates', async () => {
      await fresh();
      const warnings = await lastWarnings(db, async (trx) => {
        const lookups = new WayspotLookupRepository(trx);
        await lookups.add(
          [{ guildId: SPOT_HOME, wayspotId: 'aa.16', kind: 'stop', rank: 0 }],
          1_000,
        );
        await lookups.add(
          [{ guildId: SPOT_HOME, wayspotId: 'aa.16', kind: 'powerspot', rank: 1 }],
          2_000,
        );
      });
      expect(warnings.filter((warning) => warning.Code === DEPRECATED_SYNTAX)).toEqual([]);
      const lookups = new WayspotLookupRepository(db);
      expect(await lookups.next()).toMatchObject({ kind: 'powerspot', queuedAt: 1_000 });
    });

    it('reads the line in the order of its index, and takes a row out by its key', async () => {
      const lookups = await fresh();
      await lookups.add(
        Array.from({ length: 300 }, (_, n) => ({
          guildId: n % 2 === 0 ? SPOT_HOME : SPOT_AWAY,
          wayspotId: `${String(n)}.16`,
          kind: n % 3 === 0 ? ('powerspot' as const) : ('stop' as const),
          rank: n / 300,
        })),
        1_000,
      );
      await sql`analyze table ServerWayspotLookup`.execute(db);
      const next = await planOf(database, (logged) =>
        new WayspotLookupRepository(logged).next({ except: new Set(['1.16']) }),
      );
      expect(next[0]?.key).toBe('serverwayspotlookup_order_index');
      const remove = await planOf(database, (logged) =>
        new WayspotLookupRepository(logged).remove([{ guildId: SPOT_HOME, wayspotId: '2.16' }]),
      );
      expect(remove[0]?.key).toBe('PRIMARY');
    });

    it('counts the servers’ need along the primary key, and asks by shares above the held rows (plan 19B-5)', async () => {
      const lookups = await fresh();
      // Home's 2,700 rows held out of its share, Away's 300 in it, stops and Power Spots both.
      await lookups.add(
        Array.from({ length: 3_000 }, (_, n) => ({
          guildId: n < 2_700 ? SPOT_HOME : SPOT_AWAY,
          wayspotId: `${String(n)}.16`,
          kind: n % 3 === 0 ? ('powerspot' as const) : ('stop' as const),
          rank: n < 2_700 ? OUT_OF_SHARE_RANK : n / 3_000,
        })),
        1_000,
      );
      await sql`analyze table ServerWayspotLookup`.execute(db);
      const needs = await planOf(database, (logged) => new WayspotLookupRepository(logged).needs());
      expect(needs[0]?.key).toBe('PRIMARY');
      expect(needs[0]?.Extra).toContain('Using index');
      const next = await planOf(database, (logged) =>
        new WayspotLookupRepository(logged).next({ outOfShare: new Set([SPOT_HOME]) }),
      );
      expect(next[0]?.key).toBe('serverwayspotlookup_order_index');
      expect(next[0]?.type).toBe('range');
      expect(next[0]?.Extra ?? '').not.toContain('filesort');
      expect(
        await new WayspotLookupRepository(db).next({ outOfShare: new Set([SPOT_HOME]) }),
      ).toMatchObject({ guildId: SPOT_AWAY, kind: 'stop' });
    });

    it('goes with its server', async () => {
      const lookups = await fresh();
      await lookups.add([{ guildId: SPOT_AWAY, wayspotId: 'aa.16', kind: 'stop', rank: 0 }], 1);
      await db.deleteFrom('Guild').where('id', '=', SPOT_AWAY).execute();
      expect(await lookups.count()).toBe(0);
    });
  });

  describe('GoogleUseRepository', () => {
    /** Two servers' rows (`SPOT_HOME`, `SPOT_AWAY`) and no counts. */
    const fresh = async () => {
      await db.deleteFrom('GoogleUseDay').execute();
      await db.deleteFrom('GoogleUseServerDay').execute();
      await db.deleteFrom('GymLookupDay').execute();
      await db.deleteFrom('Guild').where('id', 'in', [SPOT_HOME, SPOT_AWAY]).execute();
      await db
        .insertInto('Guild')
        .values([
          { id: SPOT_HOME, snowflake: '412345678901234567' },
          { id: SPOT_AWAY, snowflake: '412345678901234568' },
        ])
        .execute();
    };

    googleUseCases(async () => {
      await fresh();
      return {
        use: new GoogleUseRepository(db),
        legacy: async (day, gyms) => {
          await db.insertInto('GymLookupDay').values({ day, gyms }).execute();
        },
        servers: [SPOT_HOME, SPOT_AWAY] as const,
      };
    });

    it('reads a server’s month by its key, and every server’s by the day and kind, never the whole table (plan 19B-5; fix round 4, R4)', async () => {
      await fresh();
      // 120 days of four kinds for the two servers.
      const rows = Array.from({ length: 960 }, (_, n) => ({
        guildId: n % 2 === 0 ? SPOT_HOME : SPOT_AWAY,
        day: `2026-${String(1 + Math.floor(n / 80)).padStart(2, '0')}-${String(1 + (Math.floor(n / 8) % 10)).padStart(2, '0')}`,
        kind: ['places', 'geocode', 'hand', 'map'][Math.floor(n / 2) % 4] ?? 'places',
        questions: 1,
      }));
      await db.insertInto('GoogleUseServerDay').values(rows).ignore().execute();
      await sql`analyze table GoogleUseServerDay`.execute(db);
      const days = ['2026-03-01', '2026-03-02', '2026-03-03'];
      const one = await planOf(database, (logged) =>
        new GoogleUseRepository(logged).serversUsedOn(days, SPOT_AWAY),
      );
      expect(one[0]?.key).toBe('PRIMARY');
      expect(scanned(one)).toEqual([]);
      const every = await planOf(database, (logged) =>
        new GoogleUseRepository(logged).serversUsedOn(days),
      );
      expect(every[0]?.key).toBe('googleuseserverday_day_kind_index');
      expect(scanned(every)).toEqual([]);
      // One kind of every server (the floors of lookups by hand and of maps): a range of the
      // day and the kind.
      const hands = await planOf(database, (logged) =>
        new GoogleUseRepository(logged).serversCountedOn(days, 'hand'),
      );
      expect(hands[0]?.key).toBe('googleuseserverday_day_kind_index');
      expect(hands[0]?.type).toBe('range');
      expect(scanned(hands)).toEqual([]);
    });

    it('goes with its server', async () => {
      await fresh();
      const use = new GoogleUseRepository(db);
      await use.use('2026-10-25', 'places', SPOT_AWAY);
      await db.deleteFrom('Guild').where('id', '=', SPOT_AWAY).execute();
      expect(await use.serversUsedOn(['2026-10-25'])).toEqual(new Map());
      // The instance's count stays.
      expect((await use.usedOn(['2026-10-25'])).get('2026-10-25')?.places).toBe(1);
    });

    it('counts for the instance alone a question of a server whose row is gone (fix round 3, T7)', async () => {
      await fresh();
      const use = new GoogleUseRepository(db);
      await db.deleteFrom('Guild').where('id', '=', SPOT_AWAY).execute();
      await use.use('2026-10-25', 'places', SPOT_AWAY);
      expect((await use.usedOn(['2026-10-25'])).get('2026-10-25')?.places).toBe(1);
      expect(await use.serversUsedOn(['2026-10-25'])).toEqual(new Map());
    });
  });

  describe('GoogleShareRaiseRepository (plan 19B-5)', () => {
    const fresh = async () => {
      await db.deleteFrom('GoogleShareRaise').execute();
      await db.deleteFrom('Guild').where('id', 'in', [SPOT_HOME, SPOT_AWAY]).execute();
      await db
        .insertInto('Guild')
        .values([
          { id: SPOT_HOME, snowflake: '412345678901234567' },
          { id: SPOT_AWAY, snowflake: '412345678901234568' },
        ])
        .execute();
      return new GoogleShareRaiseRepository(db);
    };

    it('keeps a raise per month and server, replaced when set again, and gone with its server', async () => {
      const raises = await fresh();
      expect(await raises.of('2026-10-01')).toEqual(new Map());
      await raises.set('2026-10-01', SPOT_HOME, 300, 1);
      await raises.set('2026-10-01', SPOT_AWAY, 50, 1);
      await raises.set('2026-09-01', SPOT_HOME, 900, 1);
      await raises.set('2026-10-01', SPOT_HOME, 0, 2);
      expect(await raises.of('2026-10-01')).toEqual(
        new Map([
          [SPOT_HOME, 0],
          [SPOT_AWAY, 50],
        ]),
      );
      await db.deleteFrom('Guild').where('id', '=', SPOT_AWAY).execute();
      expect(await raises.of('2026-10-01')).toEqual(new Map([[SPOT_HOME, 0]]));
    });

    it('reads a month’s raises by the primary key', async () => {
      const raises = await fresh();
      for (let month = 1; month <= 12; month++) {
        const first = `2026-${String(month).padStart(2, '0')}-01`;
        await raises.set(first, SPOT_HOME, month, 1);
        await raises.set(first, SPOT_AWAY, month, 1);
      }
      const plan = await planOf(database, (logged) =>
        new GoogleShareRaiseRepository(logged).of('2026-03-01'),
      );
      expect(plan[0]?.key).toBe('PRIMARY');
      expect(scanned(plan)).toEqual([]);
    });
  });

  describe('HistoryRepository.raidsByRegion', () => {
    const HOME = '412345678901234567';
    const OTHER = '412345678901234568';
    const AWAY = '412345678901234569';

    it('counts the raids and max battles of each region since a moment, of the servers asked', async () => {
      await db.deleteFrom('PartyHistory').execute();
      const party = async (
        kind: string,
        regionId: number | null,
        createdAt: number,
        serverId = HOME,
      ) => {
        await sql`insert into PartyHistory (source, kind, serverId, regionId, createdAt, ending)
                  values ('live', ${kind}, ${serverId}, ${regionId}, ${createdAt},
                          'completed')`.execute(db);
      };
      await party('raid', 1, 2_000);
      await party('raid', 1, 3_000);
      await party('max', 1, 3_000);
      await party('raid', 2, 3_000);
      await party('train', 2, 3_000);
      await party('meetup', 3, 3_000);
      await party('raid', 2, 999);
      await party('raid', null, 3_000);
      // Another server the bot is in, and one it is not asked of.
      await party('raid', 5, 3_000, OTHER);
      await party('max', 5, 4_000, OTHER);
      await party('raid', 9, 3_000, AWAY);
      const history = new HistoryRepository(db);
      expect(await history.raidsByRegion(1_000, [HOME, OTHER])).toEqual(
        new Map([
          [1, 3],
          [2, 1],
          [5, 2],
        ]),
      );
      expect(await history.raidsByRegion(1_000, [HOME])).toEqual(
        new Map([
          [1, 3],
          [2, 1],
        ]),
      );
      // No server: nothing is asked.
      expect(await history.raidsByRegion(1_000, [])).toEqual(new Map());
    });

    it('reads the servers’ raids of the time asked along (serverId, kind, createdAt), never the whole history (plan 8Z-2, audit X3)', async () => {
      await db.deleteFrom('PartyHistory').execute();
      // 24,000 records over 600 days, as a history with the legacy import holds them: two
      // servers and one not asked (a tenth each of the last two), 28 regions and none, raids,
      // max battles, trains and meetups, live and legacy.
      const DAY = 86_400_000;
      const NOW = 1_793_000_000_000;
      const kinds = ['raid', 'raid', 'raid', 'max', 'train', 'meetup'];
      const rows = Array.from({ length: 24_000 }, (_, n) => ({
        source: n % 600 < 30 ? 'live' : 'legacy',
        kind: kinds[n % kinds.length] ?? 'raid',
        serverId: n % 10 === 8 ? OTHER : n % 10 === 9 ? AWAY : HOME,
        regionId: n % 29 === 0 ? null : n % 29,
        createdAt: String(NOW - (n % 600) * DAY - n),
        ending: 'completed',
      }));
      for (let start = 0; start < rows.length; start += 2_000) {
        await db
          .insertInto('PartyHistory')
          .values(rows.slice(start, start + 2_000))
          .execute();
      }
      await sql`analyze table PartyHistory`.execute(db);
      const since = NOW - 28 * DAY;
      const servers = [HOME, OTHER];
      const plan = await planOf(database, (seen) =>
        new HistoryRepository(seen).raidsByRegion(since, servers),
      );
      expect(plan.map((row) => row.key)).toEqual(['partyhistory_server_kind_createdat_index']);
      expect(plan[0]?.type).toBe('range');
      expect(scanned(plan)).toEqual([]);
      // The same counts as the read of before, which asked of no server, gives of these two.
      const before = await sql<{ regionId: number; raids: number | string }>`
        select regionId, count(*) as raids from PartyHistory
        where kind in ('raid', 'max') and createdAt >= ${since} and regionId is not null
          and serverId <> ${AWAY}
        group by regionId`.execute(db);
      expect(before.rows.length).toBeGreaterThan(20);
      const counted = await new HistoryRepository(db).raidsByRegion(since, servers);
      expect(counted).toEqual(new Map(before.rows.map((row) => [row.regionId, Number(row.raids)])));
    });
  });
});
