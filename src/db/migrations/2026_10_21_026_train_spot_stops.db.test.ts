import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { trainSpotStops } from './2026_10_21_026_train_spot_stops.js';

const HOME = '412345678901234567';
const TRAIN = '00000000-0000-4000-8000-000000000001';
const MAX_TRAIN = '00000000-0000-4000-8000-000000000002';
const RAID = '00000000-0000-4000-8000-000000000003';

describe('migration 026: Power Spots as stops and the kind of a train in the history', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const columns = async () => {
    const rows = await sql<{ name: string; type: string; nullable: string }>`
      select concat(table_name, '.', column_name) as name, column_type as type,
             is_nullable as nullable
      from information_schema.columns
      where table_schema = database()
        and ((table_name = 'PartyHistoryStop' and column_name = 'wayspotId')
          or (table_name = 'PartyHistory' and column_name = 'trainKind'))
      order by name`.execute(db);
    return rows.rows;
  };

  it('adds PartyHistoryStop.wayspotId and PartyHistory.trainKind, both null by default', async () => {
    expect(await columns()).toEqual([
      { name: 'PartyHistory.trainKind', type: 'varchar(10)', nullable: 'YES' },
      { name: 'PartyHistoryStop.wayspotId', type: 'varchar(40)', nullable: 'YES' },
    ]);
  });

  it('records the trains of before as raid trains, and no other party as a train', async () => {
    // As 026 finds them: trains recorded before it had no kind.
    await sql`insert into PartyHistory (source, partyId, kind, serverId, createdAt, ending)
              values ('live', ${TRAIN}, 'train', ${HOME}, 900, 'completed'),
                     ('live', ${RAID}, 'raid', ${HOME}, 950, 'completed')`.execute(db);
    await sql`insert into PartyHistory (source, partyId, kind, serverId, createdAt, ending, trainKind)
              values ('live', ${MAX_TRAIN}, 'train', ${HOME}, 1000, 'completed', 'gigantamax')`.execute(
      db,
    );
    await trainSpotStops.up(db);
    const rows = await sql<{ partyId: string; trainKind: string | null }>`
      select partyId, trainKind from PartyHistory order by createdAt`.execute(db);
    expect(rows.rows).toEqual([
      { partyId: TRAIN, trainKind: 'raid' },
      { partyId: RAID, trainKind: null },
      { partyId: MAX_TRAIN, trainKind: 'gigantamax' },
    ]);
  });

  it('can run again: the columns are added only when they are missing', async () => {
    await trainSpotStops.up(db);
    expect(await columns()).toHaveLength(2);
  });
});
