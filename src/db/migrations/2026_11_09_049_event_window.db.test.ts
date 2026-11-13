import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { eventWindow } from './2026_11_09_049_event_window.js';

describe('migration 049: the event window staff set', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  it('keeps one window: its start, its end, who set it and when', async () => {
    const columns = await sql<{ name: string; type: string; nullable: string; key: string }>`
      select column_name as name, column_type as type, is_nullable as nullable,
        column_key as \`key\`
      from information_schema.columns
      where table_schema = database() and table_name = 'EventWindow'
        and column_name not in ('startsLocal', 'endsLocal')
      order by ordinal_position`.execute(db);
    // Migration 054 adds the wall-clock columns (startsLocal, endsLocal): its own test checks them.
    expect(columns.rows).toEqual([
      { name: 'id', type: 'tinyint unsigned', nullable: 'NO', key: 'PRI' },
      { name: 'startsAt', type: 'bigint', nullable: 'NO', key: '' },
      { name: 'endsAt', type: 'bigint', nullable: 'NO', key: '' },
      { name: 'setBy', type: 'varchar(30)', nullable: 'NO', key: '' },
      { name: 'setAt', type: 'bigint', nullable: 'NO', key: '' },
    ]);
  });

  it('runs again without touching what it made', async () => {
    await sql`insert into EventWindow (id, startsAt, endsAt, setBy, setAt)
              values (1, 1, 2, '3', 4)`.execute(db);
    await eventWindow.up(db);
    const kept = await sql<{ endsAt: string }>`select endsAt from EventWindow`.execute(db);
    expect(kept.rows).toEqual([{ endsAt: '2' }]);
  });
});
