import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { maxBossStart } from './2026_11_13_055_max_boss_start.js';

describe('migration 055: the moment an upcoming max boss starts', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  it('adds a nullable moment to the boss rows', async () => {
    const columns = await sql<{ name: string; type: string; nullable: string }>`
      select column_name as name, column_type as type, is_nullable as nullable
      from information_schema.columns
      where table_schema = database() and table_name = 'RaidBoss' and column_name = 'startsFrom'`.execute(
      db,
    );
    expect(columns.rows).toEqual([{ name: 'startsFrom', type: 'bigint', nullable: 'YES' }]);
  });

  it('runs again without touching what it made', async () => {
    await sql`insert into RaidBoss (pokemonId, level, name, firstSeen, lastSeen, startsFrom)
              values ('MACHAMP', 'D3', 'Machamp', 1, 1, 7)`.execute(db);
    await maxBossStart.up(db);
    const kept = await sql<{ startsFrom: string }>`select startsFrom from RaidBoss`.execute(db);
    expect(kept.rows).toEqual([{ startsFrom: '7' }]);
  });
});
