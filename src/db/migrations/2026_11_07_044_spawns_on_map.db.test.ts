import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { spawnsOnMap } from './2026_11_07_044_spawns_on_map.js';

describe('migration 044: what the map shows of a wild spawn', () => {
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

  it('keeps beside each report what its region message says, null for the rows of before', async () => {
    const empty = { nullable: 'YES', dflt: null };
    expect(await columnsOf('SpawnReport')).toEqual([
      { name: 'messageId', type: 'varchar(30)', nullable: 'NO', dflt: null },
      { name: 'channelId', type: 'varchar(30)', nullable: 'NO', dflt: null },
      { name: 'deleteAt', type: 'bigint', nullable: 'NO', dflt: null },
      { name: 'guildId', type: 'varchar(30)', ...empty },
      { name: 'pokemonKey', type: 'varchar(100)', ...empty },
      { name: 'pokemonName', type: 'varchar(100)', ...empty },
      { name: 'costumed', type: 'tinyint(1)', nullable: 'NO', dflt: '0' },
      { name: 'iv', type: 'varchar(10)', ...empty },
      { name: 'details', type: 'varchar(255)', ...empty },
      { name: 'reporterName', type: 'varchar(100)', ...empty },
      { name: 'image', type: 'varchar(1000)', ...empty },
      { name: 'near', type: 'json', ...empty },
      { name: 'madeAt', type: 'bigint', ...empty },
    ]);
    // The map's question: a server's reports that stand.
    expect(await indexOf('SpawnReport', 'spawnreport_guildid_deleteat_index')).toBe(
      'guildId,deleteAt',
    );
  });

  it('runs again without touching what it made', async () => {
    await sql`insert into SpawnReport (messageId, channelId, deleteAt, guildId)
              values ('1', '2', 3, '4')`.execute(db);
    await spawnsOnMap.up(db);
    const kept = await sql<{ guildId: string }>`select guildId from SpawnReport`.execute(db);
    expect(kept.rows).toEqual([{ guildId: '4' }]);
  });
});
