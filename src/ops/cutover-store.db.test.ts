import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_APP_ID, FakeDiscordApi } from '../../test/support/fake-discord-api.js';
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
