import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { activityBuckets } from './2026_11_05_038_activity_buckets.js';

describe('migration 038: the activity heatmap’s buckets', () => {
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

  it('makes the buckets by server, region, place, month, weekday and hour, with no member', async () => {
    const counted = { type: 'int unsigned', nullable: 'NO', dflt: '0' };
    expect(await columnsOf('ActivityBucket')).toEqual([
      { name: 'serverId', type: 'varchar(30)', nullable: 'NO', dflt: null },
      { name: 'regionId', type: 'int unsigned', nullable: 'NO', dflt: null },
      { name: 'placeKind', type: 'varchar(4)', nullable: 'NO', dflt: null },
      { name: 'placeId', type: 'varchar(40)', nullable: 'NO', dflt: null },
      { name: 'month', type: 'char(7)', nullable: 'NO', dflt: null },
      { name: 'weekday', type: 'tinyint unsigned', nullable: 'NO', dflt: null },
      { name: 'hour', type: 'tinyint unsigned', nullable: 'NO', dflt: null },
      { name: 'raids', ...counted },
      { name: 'maxes', ...counted },
      { name: 'completed', ...counted },
      { name: 'heads', ...counted },
    ]);
    expect(await indexOf('ActivityBucket', 'PRIMARY')).toBe(
      'serverId,regionId,placeKind,placeId,month,weekday,hour',
    );
    // A mode's window is read by its hours (Expected now, the presets) or by its months (History).
    expect(await indexOf('ActivityBucket', 'activitybucket_server_weekday_hour_index')).toBe(
      'serverId,weekday,hour',
    );
    expect(await indexOf('ActivityBucket', 'activitybucket_server_month_index')).toBe(
      'serverId,month',
    );
  });

  it('keeps how far each server’s buckets have counted the history', async () => {
    expect(await columnsOf('ActivityProgress')).toEqual([
      { name: 'serverId', type: 'varchar(30)', nullable: 'NO', dflt: null },
      { name: 'lastHistoryId', type: 'int unsigned', nullable: 'NO', dflt: '0' },
    ]);
    expect(await indexOf('ActivityProgress', 'PRIMARY')).toBe('serverId');
  });

  it('indexes a server’s history by id, which the buckets are added in', async () => {
    expect(await indexOf('PartyHistory', 'partyhistory_serverid_id_index')).toBe('serverId,id');
  });

  it('runs again after a failure half-way without touching what it made', async () => {
    await sql`insert into ActivityProgress (serverId, lastHistoryId) values ('1', 7)`.execute(db);
    await sql`drop index partyhistory_serverid_id_index on PartyHistory`.execute(db);
    await activityBuckets.up(db);
    await activityBuckets.up(db);
    expect(await indexOf('PartyHistory', 'partyhistory_serverid_id_index')).toBe('serverId,id');
    const kept = await sql<{ n: number }>`select lastHistoryId as n from ActivityProgress`.execute(
      db,
    );
    expect(kept.rows).toEqual([{ n: 7 }]);
  });
});
