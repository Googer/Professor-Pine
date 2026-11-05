import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { reachAndWantCounts } from './2026_11_04_037_reach_and_want_counts.js';

describe('migration 037: reach and want counts', () => {
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

  const reachOf = async (table: string, column: string) =>
    (await columnsOf(table)).find((one) => one.name === column);

  it('adds what a party and a report reached, 0 for a row of before', async () => {
    const counted = { type: 'int unsigned', nullable: 'NO', dflt: '0' };
    expect(await reachOf('PartyHistory', 'reached')).toEqual({ name: 'reached', ...counted });
    expect(await reachOf('StopReport', 'reach')).toEqual({ name: 'reach', ...counted });
    expect(await reachOf('StopReportHistory', 'reach')).toEqual({ name: 'reach', ...counted });
  });

  it('makes the daily want counts by server, day and target, with no member', async () => {
    expect(await columnsOf('WantCountDay')).toEqual([
      { name: 'serverId', type: 'varchar(30)', nullable: 'NO', dflt: null },
      { name: 'day', type: 'char(10)', nullable: 'NO', dflt: null },
      { name: 'target', type: 'varchar(120)', nullable: 'NO', dflt: null },
      { name: 'count', type: 'int unsigned', nullable: 'NO', dflt: null },
    ]);
    const keys = await sql<{ columns: string }>`
      select group_concat(column_name order by seq_in_index) as columns
      from information_schema.statistics
      where table_schema = database() and table_name = 'WantCountDay' and index_name = 'PRIMARY'`.execute(
      db,
    );
    expect(keys.rows[0]?.columns).toBe('serverId,day,target');
  });

  it('runs again after a failure half-way without touching what it made', async () => {
    await sql`alter table StopReportHistory drop column reach`.execute(db);
    await reachAndWantCounts.up(db);
    await reachAndWantCounts.up(db);
    expect(await reachOf('StopReportHistory', 'reach')).toBeDefined();
    expect(await columnsOf('WantCountDay')).toHaveLength(4);
  });
});
