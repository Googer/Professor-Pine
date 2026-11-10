import { sql, type Kysely } from 'kysely';
import type {
  GymLookup,
  GymLookups,
  NextGymOptions,
  QueuedGym,
  WaitingGym,
} from '../../services/gym-lookups.js';
import type { DB } from '../types.js';

/**
 * The line of gyms that wait for Google, in the table `GymLookup` (migration 014, its rank of
 * migration 032): what `GymUpkeep` works through within the monthly budget, and the gyms Google
 * answered about (`GymGoogleAsked`, migration 032). Its twin in memory is `MemoryGymLookups`;
 * both run `gymLookupCases` (`test/support/gym-lookup-cases.ts`). The old count per day,
 * `GymLookupDay`, is read by `GoogleUseRepository`.
 */
export class GymLookupRepository implements GymLookups {
  constructor(private readonly db: Kysely<DB>) {}

  async add(gyms: readonly QueuedGym[], now: number): Promise<void> {
    if (gyms.length === 0) return;
    // A gym already in the line keeps its time; it waits for its address when either asks, and
    // takes the rank given.
    await this.db
      .insertInto('GymLookup')
      .values(
        gyms.map(({ gymId, address, rank }) => ({
          gymId,
          address: address ? 1 : 0,
          regionRank: rank,
          queuedAt: String(now),
        })),
      )
      // The row alias (MySQL 8.0.19 on), not `VALUES()`, which 8.0.20 deprecates.
      .modifyEnd(
        sql`as new on duplicate key update address = greatest(GymLookup.address, new.address),
            regionRank = new.regionRank`,
      )
      .execute();
  }

  async next(options: NextGymOptions = {}): Promise<GymLookup | undefined> {
    const except = [...(options.except ?? [])];
    const row = await this.db
      .selectFrom('GymLookup')
      .select(['gymId', 'address'])
      .$if(options.placesOnly === true, (query) => query.where('address', '=', 0))
      .$if(except.length > 0, (query) => query.where('gymId', 'not in', except))
      .orderBy('regionRank', 'desc')
      .orderBy('queuedAt')
      .orderBy('gymId')
      .limit(1)
      .executeTakeFirst();
    return row && { gymId: row.gymId, address: row.address === 1 };
  }

  async setAddress(gymId: number, address: boolean): Promise<void> {
    await this.db
      .updateTable('GymLookup')
      .set({ address: address ? 1 : 0 })
      .where('gymId', '=', gymId)
      .execute();
  }

  async remove(gymId: number): Promise<void> {
    await this.db.deleteFrom('GymLookup').where('gymId', '=', gymId).execute();
  }

  async count(): Promise<number> {
    const row = await this.db
      .selectFrom('GymLookup')
      .select((eb) => eb.fn.countAll<number | string>().as('n'))
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  async list(): Promise<WaitingGym[]> {
    const rows = await this.db
      .selectFrom('GymLookup')
      .select(['gymId', 'address', 'regionRank', 'queuedAt'])
      .orderBy('regionRank', 'desc')
      .orderBy('queuedAt')
      .orderBy('gymId')
      .execute();
    return rows.map((row) => ({
      gymId: row.gymId,
      address: row.address === 1,
      rank: row.regionRank,
      queuedAt: Number(row.queuedAt),
    }));
  }

  async setRanks(ranks: ReadonlyMap<number, number>): Promise<void> {
    // A region's rank is shared by its gyms: one statement per rank.
    for (const [rank, ids] of byRank(ranks)) {
      await this.db
        .updateTable('GymLookup')
        .set({ regionRank: rank })
        .where('gymId', 'in', ids)
        .execute();
    }
  }

  async asked(): Promise<Set<number>> {
    const rows = await this.db.selectFrom('GymGoogleAsked').select('gymId').execute();
    return new Set(rows.map((row) => row.gymId));
  }

  async markAsked(gymId: number, at: number): Promise<void> {
    await this.db
      .insertInto('GymGoogleAsked')
      .values({ gymId, askedAt: String(at) })
      .modifyEnd(sql`as new on duplicate key update askedAt = new.askedAt`)
      .execute();
  }

  async forgetAsked(gymId: number): Promise<void> {
    await this.db.deleteFrom('GymGoogleAsked').where('gymId', '=', gymId).execute();
  }
}

/** How many ids one statement names at most. */
const CHUNK = 1_000;

/** The ids of each rank, in chunks of `CHUNK`. */
function byRank<K>(ranks: ReadonlyMap<K, number>): [number, K[]][] {
  const grouped = new Map<number, K[]>();
  for (const [id, rank] of ranks) {
    const ids = grouped.get(rank);
    if (ids) ids.push(id);
    else grouped.set(rank, [id]);
  }
  const chunks: [number, K[]][] = [];
  for (const [rank, ids] of grouped) {
    for (let start = 0; start < ids.length; start += CHUNK) {
      chunks.push([rank, ids.slice(start, start + CHUNK)]);
    }
  }
  return chunks;
}
