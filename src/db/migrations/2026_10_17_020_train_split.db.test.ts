import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { trainSplit } from './2026_10_17_020_train_split.js';

const HOME = '412345678901234567';
const OLD = '00000000-0000-4000-8000-000000000001';
const NEW = '00000000-0000-4000-8000-000000000002';

describe('migration 020: the train a train was split off from', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const column = async () => {
    const rows = await sql<{ type: string; nullable: string; defaultValue: string | null }>`
      select column_type as type, is_nullable as nullable, column_default as defaultValue
      from information_schema.columns
      where table_schema = database() and table_name = 'PartyHistory'
        and column_name = 'splitFromId'`.execute(db);
    return rows.rows;
  };

  it('adds PartyHistory.splitFromId: a party id or nothing, without a foreign key', async () => {
    expect(await column()).toEqual([{ type: 'char(36)', nullable: 'YES', defaultValue: null }]);
    const keys = await sql<{ n: number }>`
      select count(*) as n from information_schema.key_column_usage
      where table_schema = database() and table_name = 'PartyHistory'
        and column_name = 'splitFromId' and referenced_table_name is not null`.execute(db);
    expect(Number(keys.rows[0]?.n)).toBe(0);
    // A record names a train that was never recorded, or whose record is gone: it is a link.
    await sql`insert into PartyHistory (source, partyId, kind, serverId, createdAt, ending, splitFromId)
              values ('live', ${NEW}, 'train', ${HOME}, 1000, 'completed', ${OLD})`.execute(db);
    await sql`insert into PartyHistory (source, partyId, kind, serverId, createdAt, ending)
              values ('live', ${OLD}, 'train', ${HOME}, 900, 'completed')`.execute(db);
    const rows = await sql<{ partyId: string; splitFromId: string | null }>`
      select partyId, splitFromId from PartyHistory order by createdAt`.execute(db);
    expect(rows.rows).toEqual([
      { partyId: OLD, splitFromId: null },
      { partyId: NEW, splitFromId: OLD },
    ]);
  });

  it('adds PartyHistoryAttendee.splitOff: whether the member left with a group split off', async () => {
    const rows = await sql<{ type: string; nullable: string; defaultValue: string | null }>`
      select column_type as type, is_nullable as nullable, column_default as defaultValue
      from information_schema.columns
      where table_schema = database() and table_name = 'PartyHistoryAttendee'
        and column_name = 'splitOff'`.execute(db);
    expect(rows.rows).toEqual([{ type: 'tinyint(1)', nullable: 'NO', defaultValue: '0' }]);
  });

  it('indexes PartyHistory.splitFromId, for the trains split off a train', async () => {
    expect(await indexed()).toEqual(['splitFromId']);
  });

  const indexed = async () => {
    const rows = await sql<{ name: string }>`
      select column_name as name from information_schema.statistics
      where table_schema = database() and table_name = 'PartyHistory'
        and index_name = 'partyhistory_splitfromid_index'`.execute(db);
    return rows.rows.map((row) => row.name);
  };

  it('can run again: the columns and the index are added only when they are missing', async () => {
    await trainSplit.up(db);
    expect(await column()).toHaveLength(1);
    expect(await indexed()).toEqual(['splitFromId']);
  });
});
