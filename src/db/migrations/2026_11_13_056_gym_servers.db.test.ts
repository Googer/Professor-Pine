import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { polygonWkt } from '../spatial.js';
import type { DB } from '../types.js';
import { gymServers, historyUseOf } from './2026_11_13_056_gym_servers.js';

const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const THIRD = '412345678901234569';
const GONE = '412345678901234570';

function square(south: number, west: number, north: number, east: number) {
  return polygonWkt([
    { lat: south, lon: west },
    { lat: north, lon: west },
    { lat: north, lon: east },
    { lat: south, lon: east },
    { lat: south, lon: west },
  ]);
}

describe('migration 056: the gyms of each server', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await sql`delete from GymServer`.execute(db);
    await sql`delete from PartyHistoryStop`.execute(db);
    await sql`delete from PartyHistory`.execute(db);
    await sql`delete from Region`.execute(db);
    await sql`delete from Gym`.execute(db);
    await sql`delete from Guild`.execute(db);
  });

  /**
   * Three servers: Home has West, Away has Wide over West and East (their regions overlap), Third
   * none. Gym 1 in West, 2 in East, 3 and 4 in no region (3 used by Third's history, 4 by
   * nobody's), 5 in no region and a stop of Away's train.
   */
  const seed = async () => {
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY}), (3, ${THIRD})`.execute(
      db,
    );
    await sql`insert into Region (guildId, channelId, bounds) values
      (1, 100000000000000001, ST_PolygonFromText(${square(40.0, -80.1, 40.1, -80.0)})),
      (2, 100000000000000002, ST_PolygonFromText(${square(40.0, -80.1, 40.1, -79.9)}))`.execute(db);
    await sql`insert into Gym (id, name, lat, lon) values
      (1, 'Library', 40.05, -80.05),
      (2, 'Fountain', 40.05, -79.95),
      (3, 'Trailhead', 40.5, -80.05),
      (4, 'Lighthouse', 41.5, -80.05),
      (5, 'Mill', 42.5, -80.05)`.execute(db);
    await sql`insert into PartyHistory (id, kind, source, ending, createdAt, serverId, gymId) values
      (1, 'raid', 'bot', 'ended', 1, ${THIRD}, 3),
      (2, 'raid', 'bot', 'ended', 1, ${GONE}, 4),
      (3, 'train', 'bot', 'ended', 1, ${AWAY}, null)`.execute(db);
    await sql`insert into PartyHistoryStop (historyId, seq, gymId) values (3, 0, 5)`.execute(db);
  };

  const links = async () =>
    (
      await sql<{
        gymId: number;
        guildId: number;
      }>`select gymId, guildId from GymServer order by gymId, guildId`.execute(db)
    ).rows.map((row) => [row.gymId, row.guildId]);

  it('links each gym to the servers whose regions hold it, else whose history used it', async () => {
    await seed();
    await gymServers.up(db);
    expect(await links()).toEqual([
      [1, 1],
      [1, 2],
      [2, 2],
      [3, 3],
      // Used only by a server that has no row: as a gym nobody used.
      [4, 1],
      [4, 2],
      [4, 3],
      [5, 2],
    ]);
  });

  it('gives the same links when it runs again after stopping half-way', async () => {
    await seed();
    await gymServers.up(db);
    await sql`delete from GymServer where gymId >= 3`.execute(db);
    await gymServers.up(db);
    expect(await links()).toHaveLength(8);
  });

  it('goes with its gym and with its server', async () => {
    await seed();
    await gymServers.up(db);
    await sql`delete from Gym where id = 1`.execute(db);
    await sql`delete from Guild where id = 3`.execute(db);
    expect(await links()).toEqual([
      [2, 2],
      [4, 1],
      [4, 2],
      [5, 2],
    ]);
  });

  it('reads the history of the gyms in no region alone, through the gym indexes', async () => {
    await seed();
    // A history of some size, of other gyms, so that the plan is the one a real history gets.
    const many = Array.from({ length: 300 }, (_, n) => n + 10);
    await sql`insert into PartyHistory (kind, source, ending, createdAt, serverId, gymId) values ${sql.join(
      many.map((gymId) => sql`('raid', 'bot', 'ended', 1, ${HOME}, ${gymId})`),
    )}`.execute(db);
    await sql`insert into PartyHistoryStop (historyId, seq, gymId)
      select id, 0, gymId from PartyHistory where gymId >= 10`.execute(db);
    await sql`analyze table PartyHistory, PartyHistoryStop`.execute(db);
    const plan = await sql<{ table: string | null; key: string | null }>`
      explain format=traditional ${historyUseOf([3, 4, 5])}`.execute(db);
    const keyOf = (table: string) => plan.rows.find((row) => row.table === table)?.key;
    expect(keyOf('PartyHistoryStop')).toBe('partyhistorystop_gymid_index');
    const histories = plan.rows.filter((row) => row.table === 'PartyHistory');
    expect(histories.map((row) => row.key)).toContain('partyhistory_gymid_index');
    expect(histories.map((row) => row.key)).not.toContain(null);
  });

  it('links nothing in a database without gyms', async () => {
    await sql`insert into Guild (id, snowflake) values (1, ${HOME})`.execute(db);
    await gymServers.up(db);
    expect(await links()).toEqual([]);
  });
});

describe('migration 056: the gym stops of saved routes', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    await sql`insert into Guild (id, snowflake) values (1, ${HOME})`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 100000000000000001)`.execute(
      db,
    );
    await sql`insert into User (id, userSnowflake) values (1, '312345678901234567')`.execute(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    // Its rows go with their routes.
    await sql`delete from SavedRoutes`.execute(db);
  });

  const indexed = async () =>
    (
      await sql<{
        routeId: number;
        gymId: number;
      }>`select routeId, gymId from SavedRouteGym order by routeId, gymId`.execute(db)
    ).rows.map((row) => [row.routeId, row.gymId]);

  /**
   * Routes as the legacy bot and the new one wrote them: gyms, a gym twice with spaces, a Power
   * Spot (whose Wayfarer id holds digits), what is no stop, an id no gym's row can have, no text.
   */
  const seed = async () => {
    await sql`insert into SavedRoutes (id, userId, region, name, gyms) values
      (1, 1, 1, 'Loop', '4,1,7'),
      (2, 1, 1, 'Twice', '12, 5,12'),
      (3, 1, 1, 'Spots', '4,w0000000000000000000000000000017a.16'),
      (4, 1, 1, 'Odd', '7,,x,0,-3,[object Object],9999999999,8'),
      (5, 1, 1, 'Empty', ''),
      (6, 1, 1, null, null)`.execute(db);
  };

  it('holds each gym of every route once, read from its text, and none of its Power Spots', async () => {
    await seed();
    await gymServers.up(db);
    expect(await indexed()).toEqual([
      [1, 1],
      [1, 4],
      [1, 7],
      [2, 5],
      [2, 12],
      [3, 4],
      [4, 7],
      [4, 8],
    ]);
  });

  it('gives the same rows when it runs again after stopping half-way', async () => {
    await seed();
    await gymServers.up(db);
    await sql`delete from SavedRouteGym where routeId >= 2`.execute(db);
    await gymServers.up(db);
    expect(await indexed()).toHaveLength(8);
  });

  it('reads the routes a chunk at a time, in a database without gyms', async () => {
    // More routes than one read takes, and no gym (the links stop early; the routes do not).
    await sql`insert into SavedRoutes (id, userId, region, name, gyms) values ${sql.join(
      Array.from(
        { length: 1201 },
        (_, n) => sql`(${n + 1}, 1, 1, 'Route', ${`${String(n + 1)},5000`})`,
      ),
    )}`.execute(db);
    await gymServers.up(db);
    const rows = await indexed();
    expect(rows).toHaveLength(2402);
    expect(rows.at(-1)).toEqual([1201, 5000]);
  });

  it('goes with its route', async () => {
    await seed();
    await gymServers.up(db);
    await sql`delete from SavedRoutes where id in (1, 2)`.execute(db);
    expect(await indexed()).toEqual([
      [3, 4],
      [4, 7],
      [4, 8],
    ]);
  });
});
