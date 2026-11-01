import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { DEPRECATED_SYNTAX, lastWarnings } from '../../../test/support/mysql-warnings.js';
import { googleUseCases } from '../../../test/support/google-use-cases.js';
import { wayspotLookupCases } from '../../../test/support/wayspot-lookup-cases.js';
import type { DB } from '../types.js';
import { GoogleUseRepository } from './google-use-repository.js';
import { HistoryRepository } from './history-repository.js';
import { WayspotLookupRepository } from './wayspot-lookup-repository.js';

/** The storage of the line that waits for Google beside the gyms' (plan 8W-6). */
describe('the storage of the Google line', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  describe('WayspotLookupRepository', () => {
    const fresh = async () => {
      await db.deleteFrom('WayspotLookup').execute();
      await db.deleteFrom('WayspotPlaces').execute();
      return new WayspotLookupRepository(db);
    };

    wayspotLookupCases(fresh);

    it('queues and keeps places again without the VALUES() function MySQL deprecates', async () => {
      await fresh();
      const warnings = await lastWarnings(db, async (trx) => {
        const lookups = new WayspotLookupRepository(trx);
        await lookups.add([{ wayspotId: 'aa.16', kind: 'stop', rank: 0 }], 1_000);
        await lookups.add([{ wayspotId: 'aa.16', kind: 'powerspot', rank: 1 }], 2_000);
        const asked = { wayspotId: 'aa.16', kind: 'stop' as const, lat: 40, lon: -80 };
        await lookups.saveAsked({ ...asked, places: 'One', askedAt: 1 });
        await lookups.saveAsked({ ...asked, places: 'Two', askedAt: 2 });
      });
      expect(warnings.filter((warning) => warning.Code === DEPRECATED_SYNTAX)).toEqual([]);
      const lookups = new WayspotLookupRepository(db);
      expect(await lookups.next()).toMatchObject({ kind: 'powerspot', queuedAt: 1_000 });
      expect((await lookups.asked())[0]?.places).toBe('Two');
    });
  });

  describe('GoogleUseRepository', () => {
    googleUseCases(async () => {
      await db.deleteFrom('GoogleUseDay').execute();
      await db.deleteFrom('GymLookupDay').execute();
      return {
        use: new GoogleUseRepository(db),
        legacy: async (day, gyms) => {
          await db.insertInto('GymLookupDay').values({ day, gyms }).execute();
        },
      };
    });
  });

  describe('HistoryRepository.raidsByRegion', () => {
    it('counts the raids and max battles of each region since a moment', async () => {
      await db.deleteFrom('PartyHistory').execute();
      const party = async (kind: string, regionId: number | null, createdAt: number) => {
        await sql`insert into PartyHistory (source, kind, serverId, regionId, createdAt, ending)
                  values ('live', ${kind}, '412345678901234567', ${regionId}, ${createdAt},
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
      const raids = await new HistoryRepository(db).raidsByRegion(1_000);
      expect(raids).toEqual(
        new Map([
          [1, 3],
          [2, 1],
        ]),
      );
    });
  });
});
