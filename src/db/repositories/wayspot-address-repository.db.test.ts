import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { DEPRECATED_SYNTAX, lastWarnings } from '../../../test/support/mysql-warnings.js';
import { wayspotAddressCases } from '../../../test/support/wayspot-address-cases.js';
import { wayspotId } from '../../../test/support/wayspot-cases.js';
import type { DB } from '../types.js';
import { WayspotAddressRepository } from './wayspot-address-repository.js';

/** The kept addresses of Power Spots (design `2026-11-04-power-spot-address-design.md`). */
describe('WayspotAddressRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const fresh = async () => {
    await db.deleteFrom('WayspotAddress').execute();
    return new WayspotAddressRepository(db);
  };

  wayspotAddressCases(fresh);

  it('keeps an answer again without the VALUES() function MySQL deprecates', async () => {
    await fresh();
    const row = { wayspotId: wayspotId(1), lat: 40, lon: -80, geodata: null, askedAt: 1 };
    const warnings = await lastWarnings(db, async (trx) => {
      const addresses = new WayspotAddressRepository(trx);
      await addresses.save(row);
      await addresses.save({ ...row, askedAt: 2 });
    });
    expect(warnings.filter((warning) => warning.Code === DEPRECATED_SYNTAX)).toEqual([]);
    expect(await new WayspotAddressRepository(db).all()).toEqual([{ ...row, askedAt: 2 }]);
  });
});
