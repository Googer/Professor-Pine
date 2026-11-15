import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import { gymsInNoRegion, upgradeLinks } from '../../domain/gyms/gym-server.js';
import { routeGymIds, routeStops } from '../repositories/saved-route-repository.js';
import { ringFromPolygon } from '../spatial.js';
import type { Polygon } from '../types.js';

/** As many links as one statement writes, and as many gyms as one read of the history asks. */
const CHUNK = 500;

/**
 * The servers (their `Guild` rows) whose party history used these gyms: a raid's gym, a train's
 * stops. Each part reads through its table's gym index (`partyhistory_gymid_index`,
 * `partyhistorystop_gymid_index`; a stop's record by its primary key), never the whole history;
 * a server without a row is left out. Exported for the test of its plan.
 */
export function historyUseOf(gymIds: readonly number[]) {
  const ids = sql.join(gymIds.map((id) => sql`${id}`));
  return sql<{ gymId: number; guildId: number }>`
    select distinct used.gymId, Guild.id as guildId from (
      select gymId, serverId from PartyHistory where gymId in (${ids})
      union
      select PartyHistoryStop.gymId, PartyHistory.serverId from PartyHistoryStop
        join PartyHistory on PartyHistory.id = PartyHistoryStop.historyId
        where PartyHistoryStop.gymId in (${ids})
    ) used
    join Guild on Guild.snowflake = used.serverId`;
}

/**
 * The gyms of each server (plan 19B-2, spec "Gyms, stops and Wayspots per server"): `GymServer`,
 * one row per gym and server it belongs to, the server by its `Guild` row as regions and parties
 * name it; a link goes with its gym and with its server.
 *
 * The upgrade gives the gyms there are their links (`upgradeLinks`, the pure rule): each gym to
 * every server whose regions hold it, by the rule gym search sorts gyms into regions by; a gym
 * in no region of any server, to the servers whose party history used it (its raids, and the
 * stops of trains); otherwise to every server recorded. Nothing is copied and no reference is
 * rewritten. It runs once, as every migration: the gyms made afterwards are linked by what makes
 * them, and a gym a server deleted stays unlinked from it.
 *
 * The gym stops of saved routes (`SavedRouteGym`, `indexRouteGyms`): so that a deletion of a gym
 * per server finds its routes by an index rather than by searching their text.
 *
 * Safe to run again after a failure half-way: the tables are made only when they are missing,
 * and the rows are written with `insert ignore`, so a second run gives the same rows.
 */
export const gymServers: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await linkGyms(db);
    await indexRouteGyms(db);
  },
  async down() {
    // Additive only: the tables stay.
  },
};

/** `GymServer`, and the links of the gyms there are (above). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
async function linkGyms(db: Kysely<any>): Promise<void> {
  await sql`
    create table if not exists GymServer (
      gymId int unsigned not null,
      guildId int unsigned not null,
      primary key (gymId, guildId),
      key gymserver_guildid_index (guildId),
      constraint gymserver_gymid_foreign foreign key (gymId) references Gym (id)
        on delete cascade,
      constraint gymserver_guildid_foreign foreign key (guildId) references Guild (id)
        on delete cascade
    ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);

  // Every gym is read once, as each gets its links (as the gym directory's load reads them);
  // the regions and the servers are few. The history is read by gym (`historyUseOf`).
  const gyms = await sql<{
    id: number;
    lat: number | null;
    lon: number | null;
  }>`select id, lat, lon from Gym order by id`.execute(db);
  if (gyms.rows.length === 0) return;
  const regions = await sql<{
    guildId: number | null;
    channelId: string | null;
    bounds: Polygon | null;
  }>`select guildId, channelId, bounds from Region order by id`.execute(db);
  const servers = await sql<{ id: number }>`select id from Guild order by id`.execute(db);
  const placed = {
    gyms: gyms.rows.map((gym) => ({
      id: gym.id,
      lat: gym.lat === null ? null : Number(gym.lat),
      lon: gym.lon === null ? null : Number(gym.lon),
    })),
    regions: regions.rows.flatMap((region) =>
      region.channelId === null
        ? []
        : [
            {
              guildId: region.guildId,
              channelId: String(region.channelId),
              bounds: ringFromPolygon(region.bounds),
            },
          ],
    ),
  };
  // The servers whose history used a gym, read only for the gyms in no region (the only ones
  // it decides), through the history's gym indexes, a chunk of gyms at a time.
  const unplaced = gymsInNoRegion(placed);
  const historyServers = new Map<number, number[]>();
  for (let start = 0; start < unplaced.length; start += CHUNK) {
    const used = await historyUseOf(unplaced.slice(start, start + CHUNK)).execute(db);
    for (const { gymId, guildId } of used.rows) {
      historyServers.set(gymId, [...(historyServers.get(gymId) ?? []), guildId]);
    }
  }

  const links = upgradeLinks({
    ...placed,
    historyServers,
    servers: servers.rows.map((server) => server.id),
  });
  for (let start = 0; start < links.length; start += CHUNK) {
    const chunk = links.slice(start, start + CHUNK);
    await sql`insert ignore into GymServer (gymId, guildId) values ${sql.join(
      chunk.map((link) => sql`(${link.gymId}, ${link.guildId})`),
    )}`.execute(db);
  }
}

/**
 * `SavedRouteGym`, one row per saved route and gym among its stops (its Power Spots are not
 * there), and the rows of the routes there are, read from their text as the repository reads it
 * (`routeStops`, `routeGymIds`; the legacy bot's text included). `SavedRouteRepository` keeps the
 * rows current with every write of a route's stops. The route by its key (a row goes with its
 * route); the gym by its id alone, without a foreign key: a route may keep a stop of a gym that
 * is gone (the legacy bot's text names such), as it did before. The index `(gymId, routeId)` is
 * how a deletion of a gym finds its routes (`countWithGym`, `removeGym`). Exported for the tests
 * that index a route as the upgrade left it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
export async function indexRouteGyms(db: Kysely<any>): Promise<void> {
  await sql`
    create table if not exists SavedRouteGym (
      routeId int unsigned not null,
      gymId int unsigned not null,
      primary key (routeId, gymId),
      key savedroutegym_gymid_routeid_index (gymId, routeId),
      constraint savedroutegym_routeid_foreign foreign key (routeId) references SavedRoutes (id)
        on delete cascade
    ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);

  // The routes a chunk at a time, by their key.
  for (let after = 0; ;) {
    const routes = await sql<{ id: number; gyms: string | null }>`
      select id, gyms from SavedRoutes where id > ${after} order by id limit ${CHUNK}`.execute(db);
    const last = routes.rows.at(-1);
    if (last === undefined) return;
    after = last.id;
    const rows = routes.rows.flatMap((route) =>
      routeGymIds(routeStops(route.gyms)).map((gymId) => sql`(${route.id}, ${gymId})`),
    );
    if (rows.length > 0) {
      await sql`insert ignore into SavedRouteGym (routeId, gymId) values ${sql.join(rows)}`.execute(
        db,
      );
    }
  }
}
