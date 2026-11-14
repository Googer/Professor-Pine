import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gymLookupCases, LINE_AWAY, LINE_HOME } from '../../../test/support/gym-lookup-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { DEPRECATED_SYNTAX, lastWarnings } from '../../../test/support/mysql-warnings.js';
import { planOf } from '../../../test/support/query-plan.js';
import { OUT_OF_SHARE_RANK } from '../../domain/geo/google-line.js';
import type { DB } from '../types.js';
import { GymLookupRepository } from './gym-lookup-repository.js';

describe('GymLookupRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  /** An empty line over the gyms 1 to 4 (more with `gyms`), each of both servers. */
  const fresh = async (gyms = 4) => {
    await db.deleteFrom('GymLookupDay').execute();
    await db.deleteFrom('ServerGymLookup').execute();
    await db.deleteFrom('GymServer').execute();
    await db.deleteFrom('Gym').execute();
    await db.deleteFrom('Guild').execute();
    await db
      .insertInto('Guild')
      .values([
        { id: LINE_HOME, snowflake: '412345678901234567' },
        { id: LINE_AWAY, snowflake: '412345678901234568' },
      ])
      .execute();
    const ids = Array.from({ length: gyms }, (_, n) => n + 1);
    await db
      .insertInto('Gym')
      .values(ids.map((id) => ({ id, name: `Gym ${String(id)}`, lat: 40, lon: -80 })))
      .execute();
    await db
      .insertInto('GymServer')
      .values(ids.flatMap((gymId) => [LINE_HOME, LINE_AWAY].map((guildId) => ({ gymId, guildId }))))
      .execute();
    return new GymLookupRepository(db);
  };

  gymLookupCases(() => fresh());

  it('keeps a gym in the line without the VALUES() function MySQL deprecates', async () => {
    await fresh();
    const warnings = await lastWarnings(db, async (trx) => {
      const lookups = new GymLookupRepository(trx);
      await lookups.add([{ guildId: LINE_HOME, gymId: 2, address: false, rank: 0 }], 1_000);
      await lookups.add([{ guildId: LINE_HOME, gymId: 2, address: true, rank: 1 }], 2_000);
    });
    expect(warnings.filter((warning) => warning.Code === DEPRECATED_SYNTAX)).toEqual([]);
    const lookups = new GymLookupRepository(db);
    expect(await lookups.next()).toEqual({ guildId: LINE_HOME, gymId: 2, address: true });
  });

  it('takes a gym out of the line with its row, and a server’s row with its link', async () => {
    const lookups = await fresh();
    await lookups.add(
      [2, 3].flatMap((gymId) =>
        [LINE_HOME, LINE_AWAY].map((guildId) => ({ guildId, gymId, address: true, rank: 0 })),
      ),
      1_000,
    );
    await db.deleteFrom('Gym').where('id', '=', 2).execute();
    await db
      .deleteFrom('GymServer')
      .where('gymId', '=', 3)
      .where('guildId', '=', LINE_AWAY)
      .execute();
    expect((await lookups.list()).map((row) => [row.gymId, row.guildId])).toEqual([[3, LINE_HOME]]);
  });

  it('reads the line in the order of its index, and a gym’s rows by the primary key', async () => {
    const lookups = await fresh(300);
    await lookups.add(
      Array.from({ length: 300 }, (_, n) => ({
        guildId: n % 2 === 0 ? LINE_HOME : LINE_AWAY,
        gymId: n + 1,
        address: n % 3 === 0,
        rank: n / 300,
      })),
      1_000,
    );
    await sql`analyze table ServerGymLookup`.execute(db);
    const next = await planOf(database, (logged) =>
      new GymLookupRepository(logged).next({ placesOnly: true, except: new Set([1]) }),
    );
    expect(next[0]?.key).toBe('servergymlookup_order_index');
    for (const read of [
      (logged: Kysely<DB>) => new GymLookupRepository(logged).remove(7),
      (logged: Kysely<DB>) => new GymLookupRepository(logged).setAddress(7, false),
      (logged: Kysely<DB>) =>
        new GymLookupRepository(logged).setRanks([{ guildId: LINE_HOME, gymId: 7, rank: 1 }]),
    ]) {
      expect((await planOf(database, read))[0]?.key).toBe('PRIMARY');
    }
  });

  it('counts the servers’ need and reads a server’s rows by the server’s index, and asks by shares above the held rows (plan 19B-5)', async () => {
    const lookups = await fresh(3_000);
    // Home's 2,700 rows held out of its share, Away's 300 in it.
    await lookups.add(
      Array.from({ length: 3_000 }, (_, n) => ({
        guildId: n < 2_700 ? LINE_HOME : LINE_AWAY,
        gymId: n + 1,
        address: n % 3 === 0,
        rank: n < 2_700 ? OUT_OF_SHARE_RANK : n / 3_000,
      })),
      1_000,
    );
    await sql`analyze table ServerGymLookup`.execute(db);
    const needs = await planOf(database, (logged) => new GymLookupRepository(logged).needs());
    expect(needs[0]?.key).toBe('servergymlookup_guildid_address_index');
    expect(needs[0]?.Extra).toContain('Using index');
    const ofServer = await planOf(database, (logged) =>
      new GymLookupRepository(logged).ofServer(LINE_AWAY),
    );
    expect(ofServer[0]?.key).toBe('servergymlookup_guildid_address_index');
    expect(ofServer[0]?.type).toBe('ref');
    const next = await planOf(database, (logged) =>
      new GymLookupRepository(logged).next({
        outOfShare: { places: new Set([LINE_HOME]), geocodes: new Set([LINE_AWAY]) },
      }),
    );
    // A range of the order index above the held rows, read in its order: Home's rows are never
    // read through to find Away's.
    expect(next[0]?.key).toBe('servergymlookup_order_index');
    expect(next[0]?.type).toBe('range');
    expect(next[0]?.Extra ?? '').not.toContain('filesort');
    expect(
      await new GymLookupRepository(db).next({
        outOfShare: { places: new Set([LINE_HOME]), geocodes: new Set([LINE_AWAY]) },
      }),
    ).toMatchObject({ guildId: LINE_AWAY, address: false });
  });
});
