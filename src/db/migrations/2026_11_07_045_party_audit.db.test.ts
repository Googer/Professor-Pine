import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { partyAudit } from './2026_11_07_045_party_audit.js';

describe('migration 045: the staff audit log of parties', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const columnsOf = async (table: string) => {
    const rows = await sql<{ name: string; type: string; nullable: string; extra: string }>`
      select column_name as name, column_type as type, is_nullable as nullable, extra as extra
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

  it('keeps an entry per change, with who made it, when, and the post the party had', async () => {
    expect(await columnsOf('PartyAudit')).toEqual([
      { name: 'id', type: 'bigint', nullable: 'NO', extra: 'auto_increment' },
      { name: 'serverId', type: 'varchar(30)', nullable: 'NO', extra: '' },
      { name: 'partyId', type: 'char(36)', nullable: 'NO', extra: '' },
      { name: 'postId', type: 'varchar(30)', nullable: 'YES', extra: '' },
      { name: 'at', type: 'bigint', nullable: 'NO', extra: '' },
      { name: 'actorId', type: 'varchar(30)', nullable: 'YES', extra: '' },
      { name: 'actorName', type: 'varchar(100)', nullable: 'YES', extra: '' },
      { name: 'action', type: 'varchar(16)', nullable: 'NO', extra: '' },
      { name: 'detail', type: 'json', nullable: 'YES', extra: '' },
    ]);
    expect(await indexOf('PartyAudit', 'PRIMARY')).toBe('id');
    // A party's entries, a post's parties, a member's entries in a server, the retention.
    expect(await indexOf('PartyAudit', 'partyaudit_party_index')).toBe('partyId,at');
    expect(await indexOf('PartyAudit', 'partyaudit_post_index')).toBe('postId');
    expect(await indexOf('PartyAudit', 'partyaudit_actor_index')).toBe('serverId,actorId,at');
    expect(await indexOf('PartyAudit', 'partyaudit_at_index')).toBe('at');
  });

  it('runs again without touching what it made', async () => {
    await sql`insert into PartyAudit (serverId, partyId, at, action)
              values ('1', '00000000-0000-0000-0000-000000000001', 3, 'saved')`.execute(db);
    await partyAudit.up(db);
    const kept = await sql<{ at: string }>`select at from PartyAudit`.execute(db);
    expect(kept.rows).toEqual([{ at: '3' }]);
  });
});
