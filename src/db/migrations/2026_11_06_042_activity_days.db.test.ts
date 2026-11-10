import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { activityDays } from './2026_11_06_042_activity_days.js';

describe('migration 042: raids per day', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const columnsOf = async (table: string) => {
    const rows = await sql<{ name: string; type: string; nullable: string; dflt: string | null }>`
      select column_name as name, column_type as type, is_nullable as nullable,
             column_default as dflt
      from information_schema.columns
      where table_schema = database() and table_name = ${table}
      order by ordinal_position`.execute(db);
    return rows.rows;
  };

  const indexOf = async (table: string, index: string) => {
    const rows = await sql<{ columns: string | null }>`
      select group_concat(column_name order by seq_in_index) as columns
      from information_schema.statistics
      where table_schema = database() and table_name = ${table} and index_name = ${index}`.execute(
      db,
    );
    return rows.rows[0]?.columns ?? null;
  };

  it('makes the days by server, region, local day and boss, with no member', async () => {
    const counted = { type: 'int unsigned', nullable: 'NO', dflt: '0' };
    expect(await columnsOf('ActivityDay')).toEqual([
      { name: 'serverId', type: 'varchar(30)', nullable: 'NO', dflt: null },
      { name: 'regionId', type: 'int unsigned', nullable: 'NO', dflt: null },
      { name: 'day', type: 'char(10)', nullable: 'NO', dflt: null },
      { name: 'boss', type: 'varchar(64)', nullable: 'NO', dflt: null },
      { name: 'raids', ...counted },
      { name: 'maxes', ...counted },
    ]);
    expect(await indexOf('ActivityDay', 'PRIMARY')).toBe('serverId,regionId,day,boss');
    // A server's days (the year's chart, big days) and a boss's trend, each read from its index
    // alone (A7).
    expect(await indexOf('ActivityDay', 'activityday_server_day_index')).toBe(
      'serverId,day,regionId,raids,maxes',
    );
    expect(await indexOf('ActivityDay', 'activityday_server_boss_day_index')).toBe(
      'serverId,boss,day,regionId,raids',
    );
  });

  it('gives the days a mark of their own, at 0 for every server the buckets counted', async () => {
    expect(await columnsOf('ActivityProgress')).toEqual([
      { name: 'serverId', type: 'varchar(30)', nullable: 'NO', dflt: null },
      { name: 'lastHistoryId', type: 'int unsigned', nullable: 'NO', dflt: '0' },
      { name: 'lastDayHistoryId', type: 'int unsigned', nullable: 'NO', dflt: '0' },
    ]);
  });

  it('runs again after a failure half-way without touching what it made', async () => {
    await sql`alter table ActivityProgress drop column lastDayHistoryId`.execute(db);
    await sql`insert into ActivityProgress (serverId, lastHistoryId) values ('1', 7)`.execute(db);
    await activityDays.up(db);
    await sql`update ActivityProgress set lastDayHistoryId = 5`.execute(db);
    await sql`insert into ActivityDay (serverId, regionId, day, boss, raids)
              values ('1', 0, '2019-10-08', 'MEWTWO', 3)`.execute(db);
    await activityDays.up(db);
    const kept = await sql<{ lastHistoryId: number; lastDayHistoryId: number }>`
      select lastHistoryId, lastDayHistoryId from ActivityProgress`.execute(db);
    // The buckets' mark is untouched; the days' starts at 0, and is left alone once there.
    expect(kept.rows).toEqual([{ lastHistoryId: 7, lastDayHistoryId: 5 }]);
    const days = await sql<{ n: number }>`select raids as n from ActivityDay`.execute(db);
    expect(days.rows).toEqual([{ n: 3 }]);
  });
});
