import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { conductors } from './2026_11_05_039_conductors.js';

const HOME = '412345678901234567';

describe('migration 039: what every conductor of a train led', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const conducted = async () => {
    const rows = await sql<{ type: string; nullable: string; dflt: string | null }>`
      select column_type as type, is_nullable as nullable, column_default as dflt
      from information_schema.columns
      where table_schema = database() and table_name = 'PartyHistoryAttendee'
        and column_name = 'conducted'`.execute(db);
    return rows.rows;
  };

  it('adds PartyHistoryAttendee.conducted, a count of stops, 0 unless written', async () => {
    expect(await conducted()).toEqual([{ type: 'smallint unsigned', nullable: 'NO', dflt: '0' }]);
  });

  it('gives a row of before 0, also when it runs again after a failure half-way', async () => {
    await sql`alter table PartyHistoryAttendee drop column conducted`.execute(db);
    await sql`insert into PartyHistory (source, partyId, kind, serverId, createdAt, ending)
              values ('live', '00000000-0000-4000-8000-000000000001', 'train', ${HOME}, 1000,
                      'completed')`.execute(db);
    await sql`insert into PartyHistoryAttendee (historyId, seq, furthest)
              select max(id), 0, 'here' from PartyHistory`.execute(db);
    await conductors.up(db);
    await conductors.up(db);
    expect(await conducted()).toHaveLength(1);
    const rows = await sql<{ conducted: number }>`
      select conducted from PartyHistoryAttendee`.execute(db);
    expect(rows.rows).toEqual([{ conducted: 0 }]);
  });
});
