import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import { RegionRepository } from '../repositories/region-repository.js';
import type { DB } from '../types.js';
import {
  PARTY_FORUM_INDEX,
  REGION_CHANNEL_KEY,
  regionChannelUnique,
  warnOfSharedChannels,
} from './2026_10_13_011_region_channel_unique.js';

const HOME = '412345678901234567';
const WEST = '1234567890123456788';
const EAST = '1234567890123456789';

describe('migration 011: one region per channel', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    await sql`insert into Guild (id, snowflake) values (1, ${HOME})`.execute(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Region').execute();
  });

  const hasKey = async (): Promise<boolean> => {
    const found = await sql<{ unique: number }>`
      select max(1 - non_unique) as \`unique\` from information_schema.statistics
      where table_schema = database() and table_name = 'Region'
        and index_name = ${REGION_CHANNEL_KEY}`.execute(db);
    return Number(found.rows[0]?.unique ?? 0) === 1;
  };
  const dropKey = () =>
    sql`alter table Region drop index ${sql.ref(REGION_CHANNEL_KEY)}`.execute(db);
  const insert = (channelId: string | null) =>
    sql`insert into Region (guildId, channelId) values (1, ${channelId})`.execute(db);
  const migrate = () => regionChannelUnique.up(db);

  it('has given a database without regions the key', async () => {
    expect(await hasKey()).toBe(true);
  });

  it('indexes the forums of the parties of a server, once', async () => {
    const columns = async () => {
      const found = await sql<{ c: string }>`
        select column_name as c from information_schema.statistics
        where table_schema = database() and table_name = 'Party'
          and index_name = ${PARTY_FORUM_INDEX} order by seq_in_index`.execute(db);
      return found.rows.map((row) => row.c);
    };
    expect(await columns()).toEqual(['guildId', 'forumChannelId']);
    await migrate();
    expect(await columns()).toEqual(['guildId', 'forumChannelId']);
  });

  it('adds the key where no two rows share a channel, whatever else the rows hold', async () => {
    await dropKey();
    await insert(WEST);
    await insert(EAST);
    // Rows without a channel are no obstacle, however many.
    await insert(null);
    await insert(null);
    await migrate();
    expect(await hasKey()).toBe(true);
    // The key holds from now on, and still allows rows without a channel.
    await expect(insert(WEST)).rejects.toThrow(/Duplicate entry/u);
    await insert(null);
    // What the legacy bot does (look, then insert) and what this bot does keep working.
    const regions = new RegionRepository(db);
    expect((await regions.findByChannel(WEST))?.channelId).toBe(WEST);
    expect((await regions.listAll()).map((region) => region.channelId)).toEqual([WEST, EAST]);
  });

  it('leaves the key out where two rows share a channel, and everything works as before', async () => {
    await dropKey();
    await insert(WEST);
    await insert(WEST);
    await insert(EAST);
    await migrate();
    expect(await hasKey()).toBe(false);
    // Said in the log, with how many channels are shared (never which: no ids of servers).
    const { log, entries } = createTestLogger();
    await warnOfSharedChannels(db, log);
    expect(entries).toMatchObject([
      { level: 40, sharedChannels: 1, msg: expect.stringContaining('unique key') as unknown },
    ]);
    // The oldest row of a channel counts, as it always did.
    const regions = new RegionRepository(db);
    const rows = await db.selectFrom('Region').select('id').orderBy('id').execute();
    expect((await regions.findByChannel(WEST))?.id).toBe(rows[0]?.id);
    const ring = [
      { lat: 40, lon: -80 },
      { lat: 40.1, lon: -80 },
      { lat: 40.1, lon: -79.9 },
      { lat: 40, lon: -80 },
    ];
    expect((await regions.saveBounds(1, WEST, ring)).id).toBe(rows[0]?.id);
    // Put right by hand, a second run adds it.
    await db
      .deleteFrom('Region')
      .where('id', '=', rows[1]?.id ?? 0)
      .execute();
    await migrate();
    expect(await hasKey()).toBe(true);
  });

  it('does nothing when the key is there', async () => {
    await insert(WEST);
    await migrate();
    await migrate();
    expect(await hasKey()).toBe(true);
    const { log, entries } = createTestLogger();
    await warnOfSharedChannels(db, log);
    expect(entries).toEqual([]);
  });
});
