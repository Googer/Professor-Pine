import { afterEach, describe, expect, it } from 'vitest';
import { startDatabase, type TestDatabase } from '../../../test/support/mysql.js';
import { pino } from 'pino';
import { createDb } from '../kysely.js';
import { runMigrations } from '../migrator.js';
import { CutoverRepository } from './cutover-repository.js';

const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const NORTH = '512345678901234561';
const SOUTH = '512345678901234562';
const FORUM = '612345678901234561';

async function withServers(database: TestDatabase): Promise<void> {
  await database.query('insert into Guild (id, snowflake) values (1, ?), (2, ?), (3, null)', [
    HOME,
    AWAY,
  ]);
  await database.query('insert into Region (guildId, channelId) values (1, ?), (1, ?), (2, null)', [
    NORTH,
    SOUTH,
  ]);
}

/** The repository over a read-only transaction, as the cutover check reads. */
async function read<T>(
  database: TestDatabase,
  work: (repository: CutoverRepository) => Promise<T>,
): Promise<T> {
  const db = createDb<unknown>(database.config);
  try {
    return await db
      .transaction()
      .setAccessMode('read only')
      .execute((trx) => work(new CutoverRepository(trx)));
  } finally {
    await db.destroy();
  }
}

describe('CutoverRepository', () => {
  let database: TestDatabase | undefined;

  afterEach(async () => {
    await database?.stop();
    database = undefined;
  });

  it('reads the servers and the regions of a legacy database, which has no forums yet', async () => {
    database = await startDatabase({ legacySchema: true });
    await withServers(database);
    expect(await read(database, (repository) => repository.servers())).toEqual([HOME, AWAY]);
    expect(await read(database, (repository) => repository.regions())).toEqual([
      { guild: HOME, channelId: NORTH, forumChannelId: null, summaryMessageId: null },
      { guild: HOME, channelId: SOUTH, forumChannelId: null, summaryMessageId: null },
    ]);
  });

  it('reads the forums of a migrated database', async () => {
    database = await startDatabase({ legacySchema: true });
    await withServers(database);
    const db = createDb<unknown>(database.config);
    try {
      await runMigrations(db, pino({ level: 'silent' }));
    } finally {
      await db.destroy();
    }
    await database.query('update Region set forumChannelId = ? where channelId = ?', [
      FORUM,
      NORTH,
    ]);
    expect(await read(database, (repository) => repository.regions())).toEqual([
      { guild: HOME, channelId: NORTH, forumChannelId: FORUM, summaryMessageId: null },
      { guild: HOME, channelId: SOUTH, forumChannelId: null, summaryMessageId: null },
    ]);
  });

  it('reads nothing of an empty database', async () => {
    database = await startDatabase({ legacySchema: false });
    expect(await read(database, (repository) => repository.servers())).toEqual([]);
    expect(await read(database, (repository) => repository.regions())).toEqual([]);
  });
});
