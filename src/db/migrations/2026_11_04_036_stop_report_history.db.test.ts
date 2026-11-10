import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { stopReportHistory } from './2026_11_04_036_stop_report_history.js';

describe('migration 036: the history of reports at stops', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  /** The columns of a table as this migration made them: those of later migrations left out. */
  const LATER = new Set(['StopReportHistory.reach']);
  const columnsOf = async (table: string) => {
    const rows = await sql<{ name: string; type: string; nullable: string }>`
      select column_name as name, column_type as type, is_nullable as nullable
      from information_schema.columns
      where table_schema = database() and table_name = ${table}
      order by ordinal_position`.execute(db);
    return rows.rows.filter((column) => !LATER.has(`${table}.${column.name}`));
  };

  const indexesOf = async (table: string) => {
    const rows = await sql<{ name: string; columns: string }>`
      select index_name as name, group_concat(column_name order by seq_in_index) as columns
      from information_schema.statistics
      where table_schema = database() and table_name = ${table}
      group by index_name
      order by index_name`.execute(db);
    return rows.rows;
  };

  it('adds the place and the confirmations to the live report, null for a row of before', async () => {
    const added = (await columnsOf('StopReport')).filter((column) =>
      ['cell', 'regionIds', 'confirmedBy'].includes(column.name),
    );
    expect(added).toEqual([
      { name: 'cell', type: 'varchar(16)', nullable: 'YES' },
      { name: 'regionIds', type: 'json', nullable: 'YES' },
      { name: 'confirmedBy', type: 'json', nullable: 'YES' },
    ]);
  });

  it('makes the history table with no stop, place or name of a member, and its indexes', async () => {
    expect(await columnsOf('StopReportHistory')).toEqual([
      { name: 'id', type: 'int unsigned', nullable: 'NO' },
      { name: 'reportId', type: 'int unsigned', nullable: 'NO' },
      { name: 'reportMadeAt', type: 'bigint', nullable: 'NO' },
      { name: 'serverId', type: 'varchar(30)', nullable: 'NO' },
      { name: 'kind', type: 'varchar(10)', nullable: 'NO' },
      { name: 'periodKey', type: 'varchar(220)', nullable: 'NO' },
      { name: 'subjectKey', type: 'varchar(64)', nullable: 'NO' },
      { name: 'detail', type: 'json', nullable: 'NO' },
      { name: 'cell', type: 'varchar(16)', nullable: 'YES' },
      { name: 'regionIds', type: 'json', nullable: 'YES' },
      { name: 'madeAt', type: 'bigint', nullable: 'NO' },
      { name: 'endsAt', type: 'bigint', nullable: 'NO' },
      { name: 'endedAt', type: 'bigint', nullable: 'NO' },
      { name: 'reporterId', type: 'varchar(30)', nullable: 'YES' },
      { name: 'confirmations', type: 'int unsigned', nullable: 'NO' },
      { name: 'ending', type: 'varchar(20)', nullable: 'NO' },
    ]);
    expect(await indexesOf('StopReportHistory')).toEqual([
      { name: 'PRIMARY', columns: 'id' },
      { name: 'stopreporthistory_report_index', columns: 'reportId,reportMadeAt' },
      { name: 'stopreporthistory_server_ended_index', columns: 'serverId,endedAt' },
      { name: 'stopreporthistory_server_reporter_index', columns: 'serverId,reporterId' },
    ]);
  });

  it('runs again after a failure half-way without touching what it made', async () => {
    await sql`alter table StopReport drop column confirmedBy`.execute(db);
    await stopReportHistory.up(db);
    await stopReportHistory.up(db);
    expect((await columnsOf('StopReport')).map((column) => column.name)).toContain('confirmedBy');
    expect(await columnsOf('StopReportHistory')).toHaveLength(16);
  });
});
