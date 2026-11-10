import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { endedPartyCopies } from './2026_11_07_046_ended_party_copies.js';

describe('migration 046: the copies ended parties left', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  it('keeps a row per message, by its id', async () => {
    const rows = await sql<{ name: string; type: string; nullable: string }>`
      select column_name as name, column_type as type, is_nullable as nullable
      from information_schema.columns
      where table_schema = database() and table_name = 'EndedPartyCopy'
      order by ordinal_position`.execute(db);
    expect(rows.rows).toEqual([
      { name: 'messageId', type: 'varchar(30)', nullable: 'NO' },
      { name: 'channelId', type: 'varchar(30)', nullable: 'YES' },
      { name: 'regionId', type: 'int unsigned', nullable: 'YES' },
      { name: 'partyId', type: 'char(36)', nullable: 'NO' },
      { name: 'endedAt', type: 'bigint', nullable: 'NO' },
    ]);
    const primary = await sql<{ columns: string | null }>`
      select group_concat(column_name order by seq_in_index) as columns
      from information_schema.statistics
      where table_schema = database() and table_name = 'EndedPartyCopy'
        and index_name = 'PRIMARY'`.execute(db);
    expect(primary.rows[0]?.columns).toBe('messageId');
  });

  it('runs again without touching what it made', async () => {
    await sql`insert into EndedPartyCopy (messageId, channelId, partyId, endedAt)
              values ('1', '2', '00000000-0000-4000-8000-000000000001', 3)`.execute(db);
    await endedPartyCopies.up(db);
    const count = await sql<{ n: number }>`select count(*) as n from EndedPartyCopy`.execute(db);
    expect(Number(count.rows[0]?.n)).toBe(1);
  });
});
