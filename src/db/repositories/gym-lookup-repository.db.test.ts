import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gymLookupCases } from '../../../test/support/gym-lookup-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { DEPRECATED_SYNTAX, lastWarnings } from '../../../test/support/mysql-warnings.js';
import type { DB } from '../types.js';
import { GymLookupRepository } from './gym-lookup-repository.js';

describe('GymLookupRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  /** An empty line over the gyms 1 to 4. */
  const fresh = async () => {
    await db.deleteFrom('GymLookupDay').execute();
    await db.deleteFrom('GymLookup').execute();
    await db.deleteFrom('Gym').execute();
    await db
      .insertInto('Gym')
      .values([1, 2, 3, 4].map((id) => ({ id, name: `Gym ${id}`, lat: 40, lon: -80 })))
      .execute();
    return new GymLookupRepository(db);
  };

  gymLookupCases(fresh);

  it('keeps a gym in the line without the VALUES() function MySQL deprecates', async () => {
    await fresh();
    const warnings = await lastWarnings(db, async (trx) => {
      const lookups = new GymLookupRepository(trx);
      await lookups.add([{ gymId: 2, address: false, rank: 0 }], 1_000);
      await lookups.add([{ gymId: 2, address: true, rank: 1 }], 2_000);
    });
    expect(warnings.filter((warning) => warning.Code === DEPRECATED_SYNTAX)).toEqual([]);
    const lookups = new GymLookupRepository(db);
    expect(await lookups.next()).toEqual({ gymId: 2, address: true });
  });

  it('takes a gym out of the line and forgets it was asked with its row', async () => {
    const lookups = await fresh();
    await lookups.add([{ gymId: 2, address: true, rank: 0 }], 1_000);
    await lookups.markAsked(2, 1_000);
    await db.deleteFrom('Gym').where('id', '=', 2).execute();
    expect(await lookups.count()).toBe(0);
    expect(await lookups.asked()).toEqual(new Set());
  });
});
