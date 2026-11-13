import type { Kysely } from 'kysely';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startDatabase, type TestDatabase } from '../../../test/support/mysql.js';
import { createDb } from '../kysely.js';
import { runMigrations } from '../migrator.js';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';
import { RowIds } from './row-ids.js';

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

  it('ensureAll makes the rows of many servers in chunks, keeps those there and remembers them (19D fix round 1, F3)', async () => {
    const ids = new RowIds();
    const remembering = new GuildRepository(db, ids);
    const kept = await guilds.ensure('412345678901234567');
    const snowflakes = Array.from({ length: 1_203 }, (_, n) =>
      String(412345678901234567n + BigInt(n)),
    );

    await remembering.ensureAll(snowflakes);
    await remembering.ensureAll([]);

    const rows = await db.selectFrom('Guild').select(['id', 'snowflake']).execute();
    expect(rows).toHaveLength(1_203);
    expect(new Set(rows.map((row) => row.snowflake))).toEqual(new Set(snowflakes));
    expect(rows.find((row) => row.snowflake === '412345678901234567')?.id).toBe(kept);
    const last = snowflakes.at(-1) ?? '';
    expect(ids.guild(last)).toBe(rows.find((row) => row.snowflake === last)?.id);
  });

  it('loadRows makes the server of every row known before any is seen, and ensure, ensureAll and idFor add theirs (fix round 1, K1)', async () => {
    const first = await guilds.ensure('412345678901234567');
    const second = await guilds.ensure('412345678901234568');
    // A process starting: nothing seen yet; the parties it loads next name these rows.
    const ids = new RowIds();
    const starting = new GuildRepository(db, ids);
    expect(ids.serverOfRow(first)).toBeUndefined();
    await starting.loadRows();
    expect(ids.serverOfRow(first)).toBe('412345678901234567');
    expect(ids.serverOfRow(second)).toBe('412345678901234568');
    // A server joined after the start, and rows found by a read.
    const joined = await starting.ensure('412345678901234569');
    expect(ids.serverOfRow(joined)).toBe('412345678901234569');
    await starting.ensureAll(['412345678901234570']);
    const many = await guilds.idFor('412345678901234570');
    expect(many === undefined ? undefined : ids.serverOfRow(many)).toBe('412345678901234570');
    const elsewhere = await guilds.ensure('412345678901234571');
    expect(await starting.idFor('412345678901234571')).toBe(elsewhere);
    expect(ids.serverOfRow(elsewhere)).toBe('412345678901234571');
  });

  it('idFor returns undefined for an unknown guild', async () => {
    expect(await guilds.idFor('999999999999999999')).toBeUndefined();
  });

  it('snowflakeOf gives the server of a row, and nothing for a row that is not there', async () => {
    const guildId = await guilds.ensure('412345678901234567');
    expect(await guilds.snowflakeOf(guildId)).toBe('412345678901234567');
    expect(await guilds.snowflakeOf(guildId + 1)).toBeUndefined();
  });

  it('snowflakes gives the servers that have a row, a server the bot left no longer', async () => {
    expect(await guilds.snowflakes()).toEqual([]);
    await guilds.ensure('412345678901234567');
    await guilds.ensure('412345678901234568');
    await guilds.ensure('412345678901234567');
    expect(await guilds.snowflakes()).toEqual(['412345678901234567', '412345678901234568']);
    await guilds.remove('412345678901234567');
    expect(await guilds.snowflakes()).toEqual(['412345678901234568']);
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
