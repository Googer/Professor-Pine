import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { serverSettingsAudit } from './2026_11_12_053_server_settings_audit.js';

describe("migration 053: the staff's log of a server's settings", () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  it('keeps an entry per setting changed: the server, when, who, the key, before and after', async () => {
    const columns = await sql<{ name: string; type: string; nullable: string; extra: string }>`
      select column_name as name, column_type as type, is_nullable as nullable, extra as extra
      from information_schema.columns
      where table_schema = database() and table_name = 'ServerSettingsAudit'
      order by ordinal_position`.execute(db);
    expect(columns.rows).toEqual([
      { name: 'id', type: 'bigint', nullable: 'NO', extra: 'auto_increment' },
      { name: 'serverId', type: 'varchar(20)', nullable: 'NO', extra: '' },
      { name: 'at', type: 'bigint', nullable: 'NO', extra: '' },
      { name: 'actorId', type: 'varchar(20)', nullable: 'NO', extra: '' },
      { name: 'actorName', type: 'varchar(100)', nullable: 'YES', extra: '' },
      { name: 'key', type: 'varchar(64)', nullable: 'NO', extra: '' },
      { name: 'before', type: 'json', nullable: 'YES', extra: '' },
      { name: 'after', type: 'json', nullable: 'YES', extra: '' },
    ]);
    const index = await sql<{ name: string; columns: string }>`
      select index_name as name, group_concat(column_name order by seq_in_index) as columns
      from information_schema.statistics
      where table_schema = database() and table_name = 'ServerSettingsAudit'
      group by index_name order by index_name`.execute(db);
    // A server's newest entries, the panel's; a member's of a server, `/audit member:`'s; the
    // 30 days' sweep by `at` (review G7: as migration 045 keys `PartyAudit`).
    expect(index.rows).toEqual([
      { name: 'PRIMARY', columns: 'id' },
      { name: 'serversettingsaudit_actor_index', columns: 'serverId,actorId,at' },
      { name: 'serversettingsaudit_at_index', columns: 'at' },
      { name: 'serversettingsaudit_server_at_index', columns: 'serverId,at' },
    ]);
  });

  it('runs again without touching what it made', async () => {
    await sql`insert into ServerSettingsAudit (serverId, at, actorId, \`key\`)
              values ('412345678901234567', 3, '200000000000000001', 'postNewGyms')`.execute(db);
    await serverSettingsAudit.up(db);
    const kept = await sql<{ at: string }>`select at from ServerSettingsAudit`.execute(db);
    expect(kept.rows).toEqual([{ at: '3' }]);
  });
});
