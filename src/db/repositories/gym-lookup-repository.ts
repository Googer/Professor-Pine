import { sql, type Kysely } from 'kysely';
import { OUT_OF_SHARE_RANK } from '../../domain/geo/google-line.js';
import type {
  GymLookup,
  GymLookups,
  GymRank,
  LineNeed,
  NextGymOptions,
  QueuedGym,
  WaitingGym,
} from '../../services/gym-lookups.js';
import type { DB } from '../types.js';

/**
 * The line of gyms that wait for Google, one row per server that has the gym (`ServerGymLookup`,
 * migration 059, plan 19B-3; its row goes with the gym's `GymServer` link): what `GymUpkeep`
 * works through within the monthly budget. Its twin in memory is `MemoryGymLookups`; both run
 * `gymLookupCases` (`test/support/gym-lookup-cases.ts`). `GymLookup` (of before) stays and is no
 * longer read or written; the old count per day, `GymLookupDay`, is read by
 * `GoogleUseRepository`.
 *
 * The line's order is `servergymlookup_order_index` (`next`, `list`: read in its order, the first
 * row that passes the filters); a gym's rows are read and written by the primary key
 * `(gymId, guildId)` (`setAddress`, `remove`, `setRanks`).
 */
export class GymLookupRepository implements GymLookups {
  constructor(private readonly db: Kysely<DB>) {}

  async add(gyms: readonly QueuedGym[], now: number): Promise<void> {
    if (gyms.length === 0) return;
    // A row already in the line keeps its time; it waits for its address when either asks, and
    // takes the rank given.
    await this.db
      .insertInto('ServerGymLookup')
      .values(
        gyms.map(({ guildId, gymId, address, rank }) => ({
          gymId,
          guildId,
          address: address ? 1 : 0,
          regionRank: rank,
          queuedAt: String(now),
        })),
      )
      // The row alias (MySQL 8.0.19 on), not `VALUES()`, which 8.0.20 deprecates.
      .modifyEnd(
        sql`as new on duplicate key update
            address = greatest(ServerGymLookup.address, new.address), regionRank = new.regionRank`,
      )
      .execute();
  }

  private ordered() {
    return this.db
      .selectFrom('ServerGymLookup')
      .select(['guildId', 'gymId', 'address', 'regionRank', 'queuedAt'])
      .orderBy('regionRank', 'desc')
      .orderBy('queuedAt')
      .orderBy('gymId')
      .orderBy('guildId');
  }

  async next(options: NextGymOptions = {}): Promise<GymLookup | undefined> {
    const except = [...(options.except ?? [])];
    const { outOfShare } = options;
    const outPlaces = [...(outOfShare?.places ?? [])];
    const outGeocodes = [...(outOfShare?.geocodes ?? [])];
    const row = await this.ordered()
      .$if(options.placesOnly === true, (query) => query.where('address', '=', 0))
      .$if(except.length > 0, (query) => query.where('gymId', 'not in', except))
      // By shares (plan 19B-5): the order index read above the rows held out of their share, a
      // range of its first part; the servers named only pass over rows queued before their
      // server's were ranked anew.
      .$if(outOfShare !== undefined, (query) => query.where('regionRank', '>', OUT_OF_SHARE_RANK))
      .$if(outPlaces.length > 0, (query) => query.where('guildId', 'not in', outPlaces))
      .$if(outGeocodes.length > 0, (query) =>
        query.where((eb) =>
          eb.not(eb.and([eb('address', '=', 1), eb('guildId', 'in', outGeocodes)])),
        ),
      )
      .limit(1)
      .executeTakeFirst();
    return row && { guildId: row.guildId, gymId: row.gymId, address: row.address === 1 };
  }

  async needs(): Promise<Map<number, LineNeed>> {
    // Every server's rows, counted along `servergymlookup_guildid_address_index` (migration 060)
    // from the index alone: the need is every row's by its nature, read whenever the shares are
    // worked out (`GymUpkeep.readShares`: at start, at the line's first turn of each Pacific day,
    // after a write of rows of a server the shares do not know and before such a row is served,
    // after a raise, and at the next turn after a reading that failed), in the line's turn.
    const rows = await this.db
      .selectFrom('ServerGymLookup')
      .select((eb) => ['guildId', 'address', eb.fn.countAll<number | string>().as('n')])
      .groupBy(['guildId', 'address'])
      .execute();
    const needs = new Map<number, LineNeed>();
    for (const row of rows) {
      const kept = needs.get(row.guildId) ?? { places: 0, geocodes: 0 };
      const n = Number(row.n);
      needs.set(row.guildId, {
        places: kept.places + n,
        geocodes: kept.geocodes + (row.address === 1 ? n : 0),
      });
    }
    return needs;
  }

  async ofServer(guildId: number): Promise<WaitingGym[]> {
    // The server's rows by `servergymlookup_guildid_address_index`'s first part.
    const rows = await this.db
      .selectFrom('ServerGymLookup')
      .select(['guildId', 'gymId', 'address', 'regionRank', 'queuedAt'])
      .where('guildId', '=', guildId)
      .execute();
    return rows.map((row) => ({
      guildId: row.guildId,
      gymId: row.gymId,
      address: row.address === 1,
      rank: row.regionRank,
      queuedAt: Number(row.queuedAt),
    }));
  }

  async setAddress(gymId: number, address: boolean): Promise<void> {
    await this.db
      .updateTable('ServerGymLookup')
      .set({ address: address ? 1 : 0 })
      .where('gymId', '=', gymId)
      .execute();
  }

  async remove(gymId: number): Promise<void> {
    await this.db.deleteFrom('ServerGymLookup').where('gymId', '=', gymId).execute();
  }

  async count(): Promise<number> {
    const row = await this.db
      .selectFrom('ServerGymLookup')
      .select((eb) => eb.fn.countAll<number | string>().as('n'))
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  async any(): Promise<boolean> {
    // One entry of any index, never a count of the line.
    const row = await this.db
      .selectFrom('ServerGymLookup')
      .select(sql<number>`1`.as('one'))
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  async list(): Promise<WaitingGym[]> {
    return (await this.ordered().execute()).map((row) => ({
      guildId: row.guildId,
      gymId: row.gymId,
      address: row.address === 1,
      rank: row.regionRank,
      queuedAt: Number(row.queuedAt),
    }));
  }

  async setRanks(ranks: readonly GymRank[]): Promise<void> {
    // A region's rank is shared by its gyms: one statement per rank and server, the gyms by the
    // primary key's `gymId` with its `guildId`.
    for (const [[rank, guildId], ids] of byRankAndServer(ranks)) {
      await this.db
        .updateTable('ServerGymLookup')
        .set({ regionRank: rank })
        .where('gymId', 'in', ids)
        .where('guildId', '=', guildId)
        .execute();
    }
  }
}

/** How many ids one statement names at most. */
const CHUNK = 1_000;

/** The gym ids of each rank and server, in chunks of `CHUNK`. */
function byRankAndServer(ranks: readonly GymRank[]): [[number, number], number[]][] {
  const grouped = new Map<string, { rank: number; guildId: number; ids: number[] }>();
  for (const { guildId, gymId, rank } of ranks) {
    const key = `${String(rank)}:${String(guildId)}`;
    const group = grouped.get(key);
    if (group) group.ids.push(gymId);
    else grouped.set(key, { rank, guildId, ids: [gymId] });
  }
  const chunks: [[number, number], number[]][] = [];
  for (const { rank, guildId, ids } of grouped.values()) {
    for (let start = 0; start < ids.length; start += CHUNK) {
      chunks.push([[rank, guildId], ids.slice(start, start + CHUNK)]);
    }
  }
  return chunks;
}
