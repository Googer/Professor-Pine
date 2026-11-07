import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { legacyFillIn } from './2026_11_06_043_legacy_fill_in.js';

describe('migration 043: the queue of legacy fill-ins', () => {
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

  it('keeps a row per member and server who asked, with how far it got', async () => {
    const when = { type: 'bigint', nullable: 'YES', dflt: null };
    expect(await columnsOf('LegacyFillIn')).toEqual([
      { name: 'serverId', type: 'varchar(30)', nullable: 'NO', dflt: null },
      { name: 'memberId', type: 'varchar(30)', nullable: 'NO', dflt: null },
      { name: 'requestedAt', type: 'bigint', nullable: 'NO', dflt: null },
      { name: 'startedAt', ...when },
      { name: 'doneAt', ...when },
      { name: 'filled', type: 'int unsigned', nullable: 'NO', dflt: '0' },
      { name: 'failedAt', ...when },
      { name: 'failure', type: 'varchar(200)', nullable: 'YES', dflt: null },
    ]);
    expect(await indexOf('LegacyFillIn', 'PRIMARY')).toBe('serverId,memberId');
    // The worker's question: the oldest that is neither done nor failed.
    expect(await indexOf('LegacyFillIn', 'legacyfillin_waiting_index')).toBe(
      'doneAt,failedAt,requestedAt',
    );
  });

  it('runs again without touching what it made', async () => {
    await sql`insert into LegacyFillIn (serverId, memberId, requestedAt)
              values ('1', '2', 3)`.execute(db);
    await legacyFillIn.up(db);
    const kept = await sql<{ requestedAt: string }>`
      select requestedAt from LegacyFillIn`.execute(db);
    expect(kept.rows).toEqual([{ requestedAt: '3' }]);
  });
});
