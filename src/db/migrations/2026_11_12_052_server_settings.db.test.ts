import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { serverSettings } from './2026_11_12_052_server_settings.js';

describe("migration 052: a server's settings", () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  it('keeps one row per server: its values, when it was set up, who changed it last and when', async () => {
    const columns = await sql<{ name: string; type: string; nullable: string; key: string }>`
      select column_name as name, column_type as type, is_nullable as nullable,
        column_key as \`key\`
      from information_schema.columns
      where table_schema = database() and table_name = 'ServerSettings'
      order by ordinal_position`.execute(db);
    expect(columns.rows).toEqual([
      { name: 'serverId', type: 'varchar(20)', nullable: 'NO', key: 'PRI' },
      { name: 'settings', type: 'json', nullable: 'NO', key: '' },
      { name: 'setUpAt', type: 'bigint', nullable: 'YES', key: '' },
      { name: 'updatedAt', type: 'bigint', nullable: 'NO', key: '' },
      { name: 'updatedBy', type: 'varchar(20)', nullable: 'YES', key: '' },
    ]);
  });

  it('runs again without touching what it made', async () => {
    await sql`insert into ServerSettings (serverId, settings, setUpAt, updatedAt, updatedBy)
              values ('412345678901234567', '{}', 1, 2, null)`.execute(db);
    await serverSettings.up(db);
    const kept = await sql<{ updatedAt: string }>`select updatedAt from ServerSettings`.execute(db);
    expect(kept.rows).toEqual([{ updatedAt: '2' }]);
  });
});
