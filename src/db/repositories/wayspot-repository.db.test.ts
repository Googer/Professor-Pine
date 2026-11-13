import { CompiledQuery, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { DEPRECATED_SYNTAX, lastWarnings } from '../../../test/support/mysql-warnings.js';
import {
  AWAY,
  HOME,
  keptRow,
  wayspotCases,
  wayspotId,
} from '../../../test/support/wayspot-cases.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { planOf, scanned } from '../../../test/support/query-plan.js';
import type { DB } from '../types.js';
import { WayspotRepository } from './wayspot-repository.js';

describe('WayspotRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
    await db
      .insertInto('Guild')
      .values([
        { id: HOME, snowflake: '412345678901234567' },
        { id: AWAY, snowflake: '412345678901234568' },
      ])
      .execute();
  });
  afterAll(async () => {
    await stop();
  });

  const fresh = async () => {
    await db.deleteFrom('ServerWayspot').execute();
    return new WayspotRepository(db);
  };

  wayspotCases(fresh, async (_storage, guildId, id, goneAt) => {
    await db
      .insertInto('ServerWayspot')
      .values({
        ...keptRow(1, { id }),
        guildId,
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
      await wayspots.saveFromImport(HOME, { upsert: [keptRow(1)], remove: [] }, 1_000);
      await wayspots.saveFromImport(HOME, { upsert: [keptRow(1)], remove: [] }, 2_000);
    });
    expect(warnings.filter((warning) => warning.Code === DEPRECATED_SYNTAX)).toEqual([]);
  });

  it('leaves out a row of a kind it does not know, and leaves it alone', async () => {
    const wayspots = await fresh();
    await wayspots.saveFromImport(HOME, { upsert: [keptRow(1), keptRow(2)], remove: [] }, 1_000);
    await db
      .updateTable('ServerWayspot')
      .set({ kind: 'later' })
      .where('id', '=', wayspotId(2))
      .execute();
    expect((await wayspots.all(HOME)).map((row) => row.id)).toEqual([wayspotId(1)]);
    expect(await wayspots.everyServer()).toHaveLength(1);
    const rows = await db.selectFrom('ServerWayspot').select('id').execute();
    expect(rows).toHaveLength(2);
  });

  it('reads one server’s rows and its tombstones by the server’s keys', async () => {
    const wayspots = await fresh();
    // A city's rows of another server, and some of its own, a few of them gone.
    const city = Array.from({ length: 2_000 }, (_, n) => keptRow(n + 1));
    await wayspots.saveFromImport(AWAY, { upsert: city, remove: [] }, 1_000);
    await wayspots.saveFromImport(HOME, { upsert: city.slice(0, 200), remove: [] }, 1_000);
    await wayspots.saveFromImport(
      HOME,
      { upsert: [], remove: [], gone: city.slice(0, 20).map((row) => row.id) },
      2_000,
    );
    await db.executeQuery(CompiledQuery.raw('analyze table ServerWayspot'));
    const kept = await planOf(database, (seen) => new WayspotRepository(seen).all(HOME));
    expect(kept.map((row) => row.key)).toEqual(['PRIMARY']);
    const gone = await planOf(database, (seen) => new WayspotRepository(seen).gone(HOME));
    // The kind index, alone or merged with the primary key's server prefix (index_merge).
    expect(gone).toHaveLength(1);
    expect(gone[0]?.key?.split(',')).toContain('serverwayspot_guildid_kind_index');
    expect(scanned(gone)).toEqual([]);
    expect((await wayspots.gone(HOME)).size).toBe(20);
  });
});
