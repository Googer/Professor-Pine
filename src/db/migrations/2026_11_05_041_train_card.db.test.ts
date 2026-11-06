import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { trainCardFacts } from './2026_11_05_041_train_card.js';

const HOME = '412345678901234567';

describe('migration 041: what the card of an ended train is drawn from', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const column = async (table: string, name: string) => {
    const rows = await sql<{ type: string; nullable: string; dflt: string | null }>`
      select column_type as type, is_nullable as nullable, column_default as dflt
      from information_schema.columns
      where table_schema = database() and table_name = ${table}
        and column_name = ${name}`.execute(db);
    return rows.rows;
  };

  it('adds PartyHistory.peakRiders and PartyHistoryStop.regionIds, both null unless written', async () => {
    expect(await column('PartyHistory', 'peakRiders')).toEqual([
      { type: 'smallint unsigned', nullable: 'YES', dflt: null },
    ]);
    expect(await column('PartyHistoryStop', 'regionIds')).toEqual([
      { type: 'json', nullable: 'YES', dflt: null },
    ]);
  });

  it('leaves the rows of before null, also when it runs again after a failure half-way', async () => {
    await sql`alter table PartyHistory drop column peakRiders`.execute(db);
    await sql`insert into PartyHistory (source, partyId, kind, serverId, createdAt, ending)
              values ('live', '00000000-0000-4000-8000-000000000001', 'train', ${HOME}, 1000,
                      'completed')`.execute(db);
    await sql`insert into PartyHistoryStop (historyId, seq, gymId)
              select max(id), 0, 11 from PartyHistory`.execute(db);
    await trainCardFacts.up(db);
    await trainCardFacts.up(db);
    expect(await column('PartyHistory', 'peakRiders')).toHaveLength(1);
    expect(await column('PartyHistoryStop', 'regionIds')).toHaveLength(1);
    const records = await sql<{ peakRiders: number | null }>`
      select peakRiders from PartyHistory`.execute(db);
    expect(records.rows).toEqual([{ peakRiders: null }]);
    const stops = await sql<{ regionIds: unknown }>`
      select regionIds from PartyHistoryStop`.execute(db);
    expect(stops.rows).toEqual([{ regionIds: null }]);
  });
});
