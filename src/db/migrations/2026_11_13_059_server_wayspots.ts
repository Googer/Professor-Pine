import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import { upgradeCopies, wayspotsInNoRegion } from '../../domain/wayspots/server-copies.js';
import { ringFromPolygon } from '../spatial.js';
import type { Polygon } from '../types.js';

/** As many Wayspots as one statement copies, and as many as one read of their use asks. */
const CHUNK = 500;

/** The indexes the use of a Wayspot is read by (`useOf`), and later readers by Wayspot. */
const ADDED = [
  { table: 'PartyHistory', name: 'partyhistory_wayspotid_index', column: 'wayspotId' },
  { table: 'PartyHistoryStop', name: 'partyhistorystop_wayspotid_index', column: 'wayspotId' },
] as const;

/**
 * The servers (their `Guild` rows) that used these Wayspots in the party history: a max battle's
 * Power Spot, a train's Power Spot stops. Each part reads through its table's Wayspot index
 * (`partyhistory_wayspotid_index`, `partyhistorystop_wayspotid_index`, added here; a stop's
 * record by its primary key), never the whole history; a server without a row is left out.
 * Exported for the test of its plan.
 */
export function historyUseOf(ids: readonly string[]) {
  const listed = sql.join(ids.map((id) => sql`${id}`));
  return sql<{ id: string; guildId: number }>`
    select distinct used.wayspotId as id, Guild.id as guildId from (
      select wayspotId, serverId from PartyHistory where wayspotId in (${listed})
      union
      select PartyHistoryStop.wayspotId, PartyHistory.serverId from PartyHistoryStop
        join PartyHistory on PartyHistory.id = PartyHistoryStop.historyId
        where PartyHistoryStop.wayspotId in (${listed})
    ) used
    join Guild on Guild.snowflake = used.serverId`;
}

/**
 * The servers whose stop reports name a Wayspot (by its Wayfarer id; a stop of Pine's own is
 * `pine-<n>` and matches none), each pair once: the reports' unique key leads with the server and
 * the stop, so the distinct pairs are read from the index alone, one entry per pair (a loose index
 * scan), however many reports each has. Reports are swept when they end. Exported for the test of
 * its plan.
 */
export function reportUse() {
  return sql<{ id: string; guildId: number }>`
    select used.stopKey as id, Guild.id as guildId from (
      select distinct serverId, stopKey from StopReport
    ) used
    join Guild on Guild.snowflake = used.serverId`;
}

/**
 * The servers whose moderators ruled on a meetup at a Wayspot (`MeetupPlaceRuling`, a PokéStop
 * or a Power Spot): a table of moderators' decisions, a few per server by its nature, read whole.
 */
function rulingUse() {
  return sql<{ id: string; guildId: number }>`
    select MeetupPlaceRuling.placeId as id, Guild.id as guildId from MeetupPlaceRuling
      join Guild on Guild.snowflake = MeetupPlaceRuling.serverId
      where MeetupPlaceRuling.placeKind in ('stop', 'powerspot')`;
}

/**
 * The Wayspots of each server (plan 19B-3, spec "Gyms, stops and Wayspots per server"):
 * `ServerWayspot`, one row per server and Wayfarer id, the server by its `Guild` row as regions,
 * parties and `GymServer` name it, with the columns of `Wayspot` (kind, the kind before, place,
 * title, address, picture, when an import first kept it and when a scan last saw it); a row goes
 * with its server. A server's import writes its own rows alone, so two servers' imports of one
 * place neither see nor undo each other. Indexed by the server's key (its rows, a row by id) and
 * by server and kind (the tombstones an import reads, `kind` `gone`).
 *
 * `Wayspot` stays as it was (additive only) and is no longer written: 2.0 reads it as it was.
 * Going back to 2.0 after this update is restoring the backup made before it.
 *
 * The upgrade copies the Wayspots there are, tombstones too (`upgradeCopies`, the pure rule, the
 * gyms' of migration 056): each to every server whose regions hold it; one in no region of any
 * server, to the servers that used it (their stop reports, the party history's max battles and
 * train stops, their meetup rulings); otherwise to every server recorded. A Wayspot an active
 * party holds lies in a region of its server (a max battle, a train's stop, a meetup are made
 * only there), so the active parties are not read; nor are the saved routes' Power Spots: a
 * Wayspot in no region that only a saved route or an active party's state uses is copied to every
 * server recorded. The history's Wayspot ids are read by the two indexes this migration adds.
 *
 * Safe to run again after a failure half-way: the table and the indexes are made only when they
 * are missing, and the copies are written with `insert ignore`, so a second run gives the same
 * rows.
 */
export const serverWayspots: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists ServerWayspot (
        guildId int unsigned not null,
        id varchar(40) not null,
        kind varchar(10) not null,
        formerKind varchar(10) null,
        lat double not null,
        lon double not null,
        title varchar(255) not null,
        address varchar(255) null,
        image varchar(255) null,
        firstSeen bigint not null,
        lastSeen bigint not null,
        primary key (guildId, id),
        key serverwayspot_guildid_kind_index (guildId, kind),
        constraint serverwayspot_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    for (const index of ADDED) {
      const found = await sql<{ n: number }>`
        select count(*) as n from information_schema.statistics
        where table_schema = database() and table_name = ${index.table}
          and index_name = ${index.name}`.execute(db);
      if (Number(found.rows[0]?.n ?? 0) > 0) continue;
      await sql`create index ${sql.ref(index.name)} on ${sql.table(index.table)}
        (${sql.ref(index.column)})`.execute(db);
    }
    await copyWayspots(db);
  },
  async down() {
    // Additive only: the table and the indexes stay.
  },
};

/** The copies of the Wayspots there are (above). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
async function copyWayspots(db: Kysely<any>): Promise<void> {
  // Every Wayspot is read once, as each gets its servers (as the directory's load reads them);
  // the regions and the servers are few.
  const kept = await sql<{
    id: string;
    lat: number;
    lon: number;
  }>`select id, lat, lon from Wayspot order by id`.execute(db);
  if (kept.rows.length === 0) return;
  const regions = await sql<{
    guildId: number | null;
    channelId: string | null;
    bounds: Polygon | null;
  }>`select guildId, channelId, bounds from Region order by id`.execute(db);
  const servers = await sql<{ id: number }>`select id from Guild order by id`.execute(db);
  const placed = {
    wayspots: kept.rows.map((row) => ({ id: row.id, lat: Number(row.lat), lon: Number(row.lon) })),
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

  // Their use, read only for the Wayspots in no region (the only ones it decides).
  const unplaced = new Set(wayspotsInNoRegion(placed));
  const usedBy = new Map<string, number[]>();
  const note = (rows: readonly { id: string; guildId: number }[]) => {
    for (const { id, guildId } of rows) {
      if (unplaced.has(id)) usedBy.set(id, [...(usedBy.get(id) ?? []), guildId]);
    }
  };
  if (unplaced.size > 0) {
    const ids = [...unplaced];
    for (let start = 0; start < ids.length; start += CHUNK) {
      note((await historyUseOf(ids.slice(start, start + CHUNK)).execute(db)).rows);
    }
    note((await reportUse().execute(db)).rows);
    note((await rulingUse().execute(db)).rows);
  }

  const copies = upgradeCopies({
    ...placed,
    usedBy,
    servers: servers.rows.map((server) => server.id),
  });
  const byServer = new Map<number, string[]>();
  for (const { id, guildId } of copies) {
    const ids = byServer.get(guildId);
    if (ids) ids.push(id);
    else byServer.set(guildId, [id]);
  }
  for (const [guildId, ids] of byServer) {
    for (let start = 0; start < ids.length; start += CHUNK) {
      const chunk = ids.slice(start, start + CHUNK);
      // Each row as it is, tombstones too, read by `Wayspot`'s primary key.
      await sql`insert ignore into ServerWayspot
          (guildId, id, kind, formerKind, lat, lon, title, address, image, firstSeen, lastSeen)
        select ${guildId}, id, kind, formerKind, lat, lon, title, address, image, firstSeen, lastSeen
          from Wayspot where id in (${sql.join(chunk.map((id) => sql`${id}`))})`.execute(db);
    }
  }
}
