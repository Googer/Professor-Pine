import type { Kysely } from 'kysely';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startDatabase, type TestDatabase } from '../../../test/support/mysql.js';
import { createDb } from '../kysely.js';
import { runMigrations } from '../migrator.js';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';

describe('GuildRepository', () => {
  let database: TestDatabase;
  let db: Kysely<DB>;
  let guilds: GuildRepository;

  beforeAll(async () => {
    database = await startDatabase({ legacySchema: true });
    db = createDb<DB>(database.config);
    await runMigrations(db, pino({ level: 'silent' }));
    guilds = new GuildRepository(db);
  });
  afterAll(async () => {
    await db.destroy();
    await database.stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Guild').execute();
  });

  it('ensure inserts a guild once', async () => {
    const first = await guilds.ensure('412345678901234567');
    const second = await guilds.ensure('412345678901234567');
    const rows = await db.selectFrom('Guild').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.snowflake).toBe('412345678901234567');
    expect(first).toBe(rows[0]?.id);
    expect(second).toBe(first);
  });

  it('idFor returns undefined for an unknown guild', async () => {
    expect(await guilds.idFor('999999999999999999')).toBeUndefined();
  });

  it('snowflakeOf gives the server of a row, and nothing for a row that is not there', async () => {
    const guildId = await guilds.ensure('412345678901234567');
    expect(await guilds.snowflakeOf(guildId)).toBe('412345678901234567');
    expect(await guilds.snowflakeOf(guildId + 1)).toBeUndefined();
  });

  it('remove deletes the guild and cascades to its regions', async () => {
    const guildId = await guilds.ensure('412345678901234567');
    await db.insertInto('Region').values({ guildId, channelId: '512345678901234567' }).execute();

    await guilds.remove('412345678901234567');

    expect(await guilds.idFor('412345678901234567')).toBeUndefined();
    expect(await db.selectFrom('Region').selectAll().execute()).toHaveLength(0);
  });

  it('round-trips a 19-digit snowflake in a BIGINT column', async () => {
    const guildId = await guilds.ensure('412345678901234567');
    const snowflake = '1234567890123456789';
    await db.insertInto('Region').values({ guildId, channelId: snowflake }).execute();

    const row = await db.selectFrom('Region').select('channelId').executeTakeFirstOrThrow();
    expect(row.channelId).toBe(snowflake);
  });
});
