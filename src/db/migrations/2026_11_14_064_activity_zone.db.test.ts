import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { activityZone } from './2026_11_14_064_activity_zone.js';

describe('migration 064: the zone a server’s activity is counted in', () => {
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

  it('adds the zone beside the marks, unknown on the rows there', async () => {
    expect(await columnsOf('ActivityProgress')).toEqual([
      { name: 'serverId', type: 'varchar(30)', nullable: 'NO', dflt: null },
      { name: 'lastHistoryId', type: 'int unsigned', nullable: 'NO', dflt: '0' },
      { name: 'lastDayHistoryId', type: 'int unsigned', nullable: 'NO', dflt: '0' },
      { name: 'zone', type: 'varchar(64)', nullable: 'YES', dflt: null },
    ]);
  });

  it('runs again after a failure half-way without touching what it made', async () => {
    await sql`alter table ActivityProgress drop column zone`.execute(db);
    await sql`insert into ActivityProgress (serverId, lastHistoryId, lastDayHistoryId)
              values ('1', 7, 5)`.execute(db);
    await activityZone.up(db);
    await sql`update ActivityProgress set zone = 'Europe/Berlin'`.execute(db);
    await activityZone.up(db);
    const kept = await sql<{ lastHistoryId: number; lastDayHistoryId: number; zone: string }>`
      select lastHistoryId, lastDayHistoryId, zone from ActivityProgress`.execute(db);
    expect(kept.rows).toEqual([{ lastHistoryId: 7, lastDayHistoryId: 5, zone: 'Europe/Berlin' }]);
  });
});
