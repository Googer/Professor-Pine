import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe } from 'vitest';
import { serverNeighborCases } from '../../../test/support/server-neighbor-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { ServerNeighborRepository } from './server-neighbor-repository.js';

/** The pairs of neighbors, of migration 063. */
describe('ServerNeighborRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  serverNeighborCases(async () => {
    await db.deleteFrom('ServerNeighbor').execute();
    return new ServerNeighborRepository(db);
  });
});
