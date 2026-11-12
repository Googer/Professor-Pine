import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe } from 'vitest';
import { serverSettingsCases } from '../../../test/support/server-settings-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { ServerSettingsRepository } from './server-settings-repository.js';

/** The servers' settings of migration 052. */
describe('ServerSettingsRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  serverSettingsCases(async () => {
    await db.deleteFrom('ServerSettings').execute();
    return new ServerSettingsRepository(db);
  });
});
