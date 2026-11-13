import { sql, type Kysely } from 'kysely';
import type {
  QueuedWayspot,
  ServerSpot,
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
 * The PokéStops and Power Spots that wait for Google, one row per server and id
 * (`ServerWayspotLookup`, migration 059, plan 19B-3). Its twin is `MemoryWayspotLookups`; both
 * run `wayspotLookupCases`. `WayspotLookup` and `WayspotPlaces` (of before) stay and are no longer
 * read or written: the places are the point's (`GoogleAnswer`). The line is read in the order of
 * `serverwayspotlookup_order_index`; a row is taken out by its primary key `(guildId, wayspotId)`.
 */
export class WayspotLookupRepository implements WayspotLookups {
  constructor(private readonly db: Kysely<DB>) {}

  async add(wayspots: readonly QueuedWayspot[], now: number): Promise<void> {
    if (wayspots.length === 0) return;
    await this.db
      .insertInto('ServerWayspotLookup')
      .values(
        wayspots.map(({ guildId, wayspotId, kind, rank }) => ({
          guildId,
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
        .selectFrom('ServerWayspotLookup')
        .select(['guildId', 'wayspotId', 'kind', 'regionRank', 'queuedAt'])
        // Stops before Power Spots ('stop' > 'powerspot'), as the order index.
        .orderBy('kind', 'desc')
        .orderBy('regionRank', 'desc')
        .orderBy('queuedAt')
        .orderBy('wayspotId')
        .orderBy('guildId')
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

  async remove(spots: readonly ServerSpot[]): Promise<void> {
    // One statement per server: its rows by the primary key's `guildId` and `wayspotId`.
    const byServer = new Map<number, string[]>();
    for (const { guildId, wayspotId } of spots) {
      byServer.set(guildId, [...(byServer.get(guildId) ?? []), wayspotId]);
    }
    for (const [guildId, ids] of byServer) {
      await this.db
        .deleteFrom('ServerWayspotLookup')
        .where('guildId', '=', guildId)
        .where('wayspotId', 'in', ids)
        .execute();
    }
  }

  async count(): Promise<number> {
    const row = await this.db
      .selectFrom('ServerWayspotLookup')
      .select((eb) => eb.fn.countAll<number | string>().as('n'))
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  async any(): Promise<boolean> {
    // One entry of any index, never a count of the line.
    const row = await this.db
      .selectFrom('ServerWayspotLookup')
      .select(sql<number>`1`.as('one'))
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  async list(): Promise<WaitingWayspot[]> {
    return (await this.ordered().execute()).map(waiting);
  }

  async ofServer(guildId: number): Promise<WaitingWayspot[]> {
    // The server's rows by the primary key's prefix `(guildId)`.
    const rows = await this.db
      .selectFrom('ServerWayspotLookup')
      .select(['guildId', 'wayspotId', 'kind', 'regionRank', 'queuedAt'])
      .where('guildId', '=', guildId)
      .execute();
    return rows.map(waiting);
  }
}

function waiting(row: {
  guildId: number;
  wayspotId: string;
  kind: string;
  regionRank: number;
  queuedAt: string;
}): WaitingWayspot {
  return {
    guildId: row.guildId,
    wayspotId: row.wayspotId,
    kind: lineKind(row.kind),
    rank: row.regionRank,
    queuedAt: Number(row.queuedAt),
  };
}
