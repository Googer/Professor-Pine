import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  filledRow,
  serverSettingsCases,
  SETTINGS_ACTOR,
  SETTINGS_NOW,
  SETTINGS_SERVER,
} from '../../../test/support/server-settings-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { ServerSettingsAuditRepository } from './server-settings-audit-repository.js';
import { ServerSettingsRepository } from './server-settings-repository.js';

/** The servers' settings of migration 052, their log of migration 053. */
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
    await db.deleteFrom('ServerSettingsAudit').execute();
    return { store: new ServerSettingsRepository(db), log: new ServerSettingsAuditRepository(db) };
  });

  it('writes the values and their log in one transaction: neither when the log fails', async () => {
    await db.deleteFrom('ServerSettings').execute();
    await db.deleteFrom('ServerSettingsAudit').execute();
    const store = new ServerSettingsRepository(db);
    await store.create(filledRow());
    // A key longer than its column: MySQL refuses the log's row.
    const write = store.write(
      SETTINGS_SERVER,
      { postNewGyms: true },
      SETTINGS_NOW + 1,
      SETTINGS_ACTOR,
      [
        { key: 'postNewGyms', before: false, after: true },
        { key: 'k'.repeat(65), before: null, after: 1 },
      ],
    );
    await expect(write).rejects.toThrow();
    expect(await store.one(SETTINGS_SERVER)).toEqual(filledRow());
    expect(await new ServerSettingsAuditRepository(db).ofServer(SETTINGS_SERVER, 5)).toEqual([]);
  });
});
