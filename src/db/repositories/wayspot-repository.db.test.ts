import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { DEPRECATED_SYNTAX, lastWarnings } from '../../../test/support/mysql-warnings.js';
import { keptRow, wayspotCases, wayspotId } from '../../../test/support/wayspot-cases.js';
import type { DB } from '../types.js';
import { WayspotRepository } from './wayspot-repository.js';

describe('WayspotRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const fresh = async () => {
    await db.deleteFrom('Wayspot').execute();
    return new WayspotRepository(db);
  };

  wayspotCases(fresh, async (_storage, id, goneAt) => {
    await db
      .insertInto('Wayspot')
      .values({
        ...keptRow(1, { id }),
        kind: 'gone',
        formerKind: null,
        firstSeen: '1000',
        lastSeen: String(goneAt),
      })
      .execute();
  });

  it('writes a Wayspot seen again without the VALUES() function MySQL deprecates', async () => {
    await fresh();
    const warnings = await lastWarnings(db, async (trx) => {
      const wayspots = new WayspotRepository(trx);
      await wayspots.saveFromImport({ upsert: [keptRow(1)], remove: [] }, 1_000);
      await wayspots.saveFromImport({ upsert: [keptRow(1)], remove: [] }, 2_000);
    });
    expect(warnings.filter((warning) => warning.Code === DEPRECATED_SYNTAX)).toEqual([]);
  });

  it('leaves out a row of a kind it does not know, and leaves it alone', async () => {
    const wayspots = await fresh();
    await wayspots.saveFromImport({ upsert: [keptRow(1), keptRow(2)], remove: [] }, 1_000);
    await db.updateTable('Wayspot').set({ kind: 'later' }).where('id', '=', wayspotId(2)).execute();
    expect((await wayspots.all()).map((row) => row.id)).toEqual([wayspotId(1)]);
    const rows = await db.selectFrom('Wayspot').select('id').execute();
    expect(rows).toHaveLength(2);
  });
});
