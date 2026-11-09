import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe } from 'vitest';
import { eventWindowCases } from '../../../test/support/event-window-store-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { EventWindowRepository } from './event-window-repository.js';

/** The event window of migration 049. */
describe('EventWindowRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  eventWindowCases(async () => {
    await db.deleteFrom('EventWindow').execute();
    return new EventWindowRepository(db);
  });
});
