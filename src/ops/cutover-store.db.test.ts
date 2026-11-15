import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_APP_ID, FakeDiscordApi } from '../../test/support/fake-discord-api.js';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { startDatabase, type TestDatabase } from '../../test/support/mysql.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { loadSettings } from '../config/settings.js';
import { createDb } from '../db/kysely.js';
import { cutoverCheck, type CheckLine } from './cutover-check.js';
import { databaseStore } from './cutover-store.js';

/** The whole check over a database of this shape, in a read-only transaction as the CLI runs it. */
async function checkOf(database: TestDatabase): Promise<CheckLine[]> {
  const db = createDb<unknown>(database.config);
  try {
    return await db
      .transaction()
      .setAccessMode('read only')
      .execute((trx) =>
        cutoverCheck({
          store: databaseStore(trx),
          discord: new FakeDiscordApi(),
          appId: FAKE_APP_ID,
          settings: loadSettings(TEST_SETTINGS_PATH),
        }),
      );
  } finally {
    await db.destroy();
  }
}

const byWhat = (lines: CheckLine[]) =>
  Object.fromEntries(lines.map((line) => [line.what, line.status]));

describe('the cutover check over the database', () => {
  let database: TestDatabase | undefined;

  afterEach(async () => {
    await database?.stop();
    database = undefined;
  });

  it('checks an empty database to the end: a new install, and nothing to carry over', async () => {
    database = await startDatabase({ legacySchema: false });
    expect(byWhat(await checkOf(database))).toMatchObject({
      database: 'warn',
      servers: 'warn',
      restrictions: 'pass',
    });
  });

  it('checks a database whose table names Windows lower-cased to the end, failing it', async () => {
    database = await startDatabase({ legacySchema: true });
    await database.query(
      'rename table `Guild` to `guild`, `CommandRoles` to `commandroles`, `Role` to `role`',
    );
    const lines = await checkOf(database);
    expect(lines.find((line) => line.what === 'database')?.text).toMatch(/lower-case names/);
    expect(byWhat(lines)).toMatchObject({ database: 'fail', restrictions: 'pass' });
  });

  it('reads the servers’ records of 2.1, and none of a legacy database, which has no table yet', async () => {
    database = await startDatabase({ legacySchema: true });
    const legacy = createDb<unknown>(database.config);
    try {
      expect(await databaseStore(legacy).serverRecords()).toBeUndefined();
    } finally {
      await legacy.destroy();
    }
    await database.stop();
    const migrated = await startMigratedDatabase();
    database = migrated.database;
    await migrated.db
      .insertInto('ServerRecord')
      .values({ serverId: '412345678901234567', recordedAt: '1', leftAt: '5', deletedAt: '9' })
      .execute();
    // What the check reads of a record, its deletion's times too (plan 19C-3).
    expect(await databaseStore(migrated.db).serverRecords()).toEqual([
      {
        serverId: '412345678901234567',
        recordedAt: 1,
        allowedAt: null,
        allowedBy: null,
        blockedAt: null,
        blockedBy: null,
        leftAt: 5,
        deletingAt: null,
        deletedAt: 9,
        filesLeftAt: null,
      },
    ]);
    await migrated.db.destroy();
  });

  it('reads a record of a database before migration 062, which lacks the deletion’s columns, as nothing deleted (fix round 3, R4)', async () => {
    const migrated = await startMigratedDatabase();
    database = migrated.database;
    // The table as migration 061 made it: no deletion's times yet.
    await database.query(
      'alter table ServerRecord drop column deletingAt, drop column deletedAt, drop column filesLeftAt',
    );
    await database.query(
      "insert into ServerRecord (serverId, recordedAt, leftAt) values ('412345678901234567', 1, 5)",
    );
    const records = await databaseStore(migrated.db).serverRecords();
    expect(records).toEqual([
      {
        serverId: '412345678901234567',
        recordedAt: 1,
        allowedAt: null,
        allowedBy: null,
        blockedAt: null,
        blockedBy: null,
        leftAt: 5,
        deletingAt: null,
        deletedAt: null,
        filesLeftAt: null,
      },
    ]);
    await migrated.db.destroy();
  });

  it('reads the self-assigned roles of a legacy database by their names', async () => {
    database = await startDatabase({ legacySchema: true });
    await database.query("insert into Guild (id, snowflake) values (1, '412345678901234567')");
    await database.query("insert into Role (roleName, guildId) values ('Mystic', 1)");
    const db = createDb<unknown>(database.config);
    try {
      expect(await databaseStore(db).selfRoles()).toEqual([
        { guild: '412345678901234567', roleId: null, name: 'Mystic' },
      ]);
    } finally {
      await db.destroy();
    }
  });
});
