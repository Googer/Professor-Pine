import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { feedLocalTimes } from './2026_11_13_054_feed_local_times.js';

describe('migration 054: a feed’s wall-clock times beside its moments', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  it('adds a nullable wall-clock column beside each stored moment of a feed', async () => {
    const columns = await sql<{ tableName: string; name: string; type: string; nullable: string }>`
      select table_name as tableName, column_name as name, column_type as type,
        is_nullable as nullable
      from information_schema.columns
      where table_schema = database() and column_name in ('startsLocal', 'endsLocal')
      order by table_name, ordinal_position`.execute(db);
    const column = (tableName: string, name: string) => ({
      tableName,
      name,
      type: 'varchar(32)',
      nullable: 'YES',
    });
    expect(columns.rows).toEqual([
      column('EventWindow', 'startsLocal'),
      column('EventWindow', 'endsLocal'),
      column('ListedEvent', 'startsLocal'),
      column('ListedEvent', 'endsLocal'),
      column('MaxEvent', 'startsLocal'),
      column('MaxEvent', 'endsLocal'),
      column('ResearchEvent', 'startsLocal'),
      column('ResearchEvent', 'endsLocal'),
      column('ResearchTask', 'endsLocal'),
    ]);
  });

  it('runs again without touching what it made', async () => {
    await sql`insert into EventWindow (id, startsAt, endsAt, setBy, setAt, startsLocal)
              values (1, 1, 2, '3', 4, '2026-11-14T18:00:00')`.execute(db);
    await feedLocalTimes.up(db);
    const kept = await sql<{ startsLocal: string }>`select startsLocal from EventWindow`.execute(
      db,
    );
    expect(kept.rows).toEqual([{ startsLocal: '2026-11-14T18:00:00' }]);
  });
});
