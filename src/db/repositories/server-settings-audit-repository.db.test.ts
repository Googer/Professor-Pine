import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe } from 'vitest';
import { serverSettingsAuditCases } from '../../../test/support/server-settings-audit-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { ServerSettingsAuditRepository } from './server-settings-audit-repository.js';

/** The log of a server's settings of migration 053. */
describe('ServerSettingsAuditRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  serverSettingsAuditCases(async () => {
    await db.deleteFrom('ServerSettingsAudit').execute();
    return new ServerSettingsAuditRepository(db);
  });
});
