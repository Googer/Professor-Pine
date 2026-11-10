import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { leaderboardOptIn } from './2026_11_05_040_leaderboard_opt_in.js';

const HOME = '412345678901234567';
const ALICE = '312345678901234567';

describe('migration 040: who is on the boards of a server', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  it('adds LeaderboardOptIn, one row per member and server, shaped as HistoryOptIn', async () => {
    const columns = await sql<{ name: string; type: string; nullable: string }>`
      select column_name as name, column_type as type, is_nullable as nullable
      from information_schema.columns
      where table_schema = database() and table_name = 'LeaderboardOptIn'
      order by ordinal_position`.execute(db);
    expect(columns.rows).toEqual([
      { name: 'serverId', type: 'varchar(30)', nullable: 'NO' },
      { name: 'memberId', type: 'varchar(30)', nullable: 'NO' },
      { name: 'createdAt', type: 'bigint', nullable: 'NO' },
    ]);
    await sql`insert into LeaderboardOptIn (serverId, memberId, createdAt)
              values (${HOME}, ${ALICE}, 1)`.execute(db);
    await expect(
      sql`insert into LeaderboardOptIn (serverId, memberId, createdAt)
          values (${HOME}, ${ALICE}, 2)`.execute(db),
    ).rejects.toThrow(/Duplicate/);
  });

  it('adds PartyHistory.closedBy, null unless staff or the moderators closed the party (A1)', async () => {
    const columns = await sql<{ type: string; nullable: string; dflt: string | null }>`
      select column_type as type, is_nullable as nullable, column_default as dflt
      from information_schema.columns
      where table_schema = database() and table_name = 'PartyHistory'
        and column_name = 'closedBy'`.execute(db);
    expect(columns.rows).toEqual([{ type: 'varchar(12)', nullable: 'YES', dflt: null }]);
  });

  it('adds the index the boards read the live records of a server by (W2)', async () => {
    const columns = await sql<{ name: string }>`
      select column_name as name from information_schema.statistics
      where table_schema = database() and table_name = 'PartyHistory'
        and index_name = 'partyhistory_server_source_kind_createdat_index'
      order by seq_in_index`.execute(db);
    expect(columns.rows.map((row) => row.name)).toEqual([
      'serverId',
      'source',
      'kind',
      'createdAt',
    ]);
  });

  it('keeps its rows when it runs again after a failure half-way', async () => {
    await sql`alter table PartyHistory drop column closedBy`.execute(db);
    await leaderboardOptIn.up(db);
    await leaderboardOptIn.up(db);
    const rows = await sql<{ n: number }>`select count(*) as n from LeaderboardOptIn`.execute(db);
    expect(Number(rows.rows[0]?.n)).toBe(1);
  });
});
