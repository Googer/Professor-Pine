import { sql, type Kysely } from 'kysely';
import type {
  AskedPlaces,
  QueuedWayspot,
  WaitingWayspot,
  WayspotLineKind,
  WayspotLookups,
} from '../../services/wayspot-lookups.js';
import type { DB } from '../types.js';

/** A kind as stored; anything else is read as a stop (the line asks it again as it is). */
function lineKind(kind: string): WayspotLineKind {
  return kind === 'powerspot' ? 'powerspot' : 'stop';
}

/**
 * The PokéStops and Power Spots that wait for Google (`WayspotLookup`) and the places it gave
 * around them (`WayspotPlaces`), of migration 032. Its twin is `MemoryWayspotLookups`; both run
 * `wayspotLookupCases`.
 */
export class WayspotLookupRepository implements WayspotLookups {
  constructor(private readonly db: Kysely<DB>) {}

  async add(wayspots: readonly QueuedWayspot[], now: number): Promise<void> {
    if (wayspots.length === 0) return;
    await this.db
      .insertInto('WayspotLookup')
      .values(
        wayspots.map(({ wayspotId, kind, rank }) => ({
          wayspotId,
          kind,
          regionRank: rank,
          queuedAt: String(now),
        })),
      )
      .modifyEnd(sql`as new on duplicate key update kind = new.kind, regionRank = new.regionRank`)
      .execute();
  }

  private ordered() {
    return (
      this.db
        .selectFrom('WayspotLookup')
        .select(['wayspotId', 'kind', 'regionRank', 'queuedAt'])
        // Stops before Power Spots ('stop' > 'powerspot'), as the index wayspotlookup_order_index.
        .orderBy('kind', 'desc')
        .orderBy('regionRank', 'desc')
        .orderBy('queuedAt')
        .orderBy('wayspotId')
    );
  }

  async next(options: { except?: ReadonlySet<string> } = {}): Promise<WaitingWayspot | undefined> {
    const except = [...(options.except ?? [])];
    const row = await this.ordered()
      .$if(except.length > 0, (query) => query.where('wayspotId', 'not in', except))
      .limit(1)
      .executeTakeFirst();
    return row && waiting(row);
  }

  async remove(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.deleteFrom('WayspotLookup').where('wayspotId', 'in', ids).execute();
  }

  async count(): Promise<number> {
    const row = await this.db
      .selectFrom('WayspotLookup')
      .select((eb) => eb.fn.countAll<number | string>().as('n'))
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  async list(): Promise<WaitingWayspot[]> {
    return (await this.ordered().execute()).map(waiting);
  }

  async asked(): Promise<AskedPlaces[]> {
    const rows = await this.db
      .selectFrom('WayspotPlaces')
      .select(['wayspotId', 'kind', 'lat', 'lon', 'places', 'askedAt'])
      .execute();
    return rows.map((row) => ({
      wayspotId: row.wayspotId,
      kind: lineKind(row.kind),
      lat: row.lat,
      lon: row.lon,
      places: row.places,
      askedAt: Number(row.askedAt),
    }));
  }

  async saveAsked(row: AskedPlaces): Promise<void> {
    await this.db
      .insertInto('WayspotPlaces')
      .values({ ...row, askedAt: String(row.askedAt) })
      .modifyEnd(
        sql`as new on duplicate key update kind = new.kind, lat = new.lat, lon = new.lon,
            places = new.places, askedAt = new.askedAt`,
      )
      .execute();
  }

  async dropAsked(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.deleteFrom('WayspotPlaces').where('wayspotId', 'in', ids).execute();
  }
}

function waiting(row: {
  wayspotId: string;
  kind: string;
  regionRank: number;
  queuedAt: string;
}): WaitingWayspot {
  return {
    wayspotId: row.wayspotId,
    kind: lineKind(row.kind),
    rank: row.regionRank,
    queuedAt: Number(row.queuedAt),
  };
}
