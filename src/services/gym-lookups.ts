import { lineOrder } from '../domain/geo/google-line.js';

/**
 * The line of gyms that wait for Google (Matt, 2026-10-16; plan 8W-6): what `GymUpkeep` asks
 * Google about one at a time within a monthly budget, kept in the database
 * (`GymLookupRepository`) so that a restart loses nothing and a city's first import (thousands of
 * gyms) is worked through within the free allowance. A gym waits once per server that has it
 * (plan 19B-3), by the rank of its best region of that server (`regionRanks`,
 * `src/domain/geo/google-line.ts`), then by the time it was queued; it is asked once, for every
 * server, and every server's row of it leaves the line together. `MemoryGymLookups` is its twin,
 * for tests and for an upkeep built without a database.
 */

/** A gym in the line, for a server: for its places, and with `address` its address first. */
export interface GymLookup {
  /** The server's `Guild` row. */
  guildId: number;
  gymId: number;
  address: boolean;
}

/** A gym put in the line, with the rank of its best region of the server (`NO_REGION_RANK` in none). */
export interface QueuedGym extends GymLookup {
  rank: number;
}

/** A gym that waits, as the line holds it. */
export interface WaitingGym extends QueuedGym {
  queuedAt: number;
}

/** A rank worked out anew for a server's row of a gym (`GymLookups.setRanks`). */
export interface GymRank {
  guildId: number;
  gymId: number;
  rank: number;
}

/** Which gym `GymLookups.next` may give. */
export interface NextGymOptions {
  /** Only one that waits for its places alone. */
  placesOnly?: boolean;
  /** None of these gyms, of any server. */
  except?: ReadonlySet<number>;
}

export interface GymLookups {
  /**
   * Puts gyms in the line, each for its server; a gym already in it for that server keeps its
   * place in time, takes the rank given, and waits for its address too when either asks for it.
   */
  add(gyms: readonly QueuedGym[], now: number): Promise<void>;
  /**
   * The first of the line: the highest rank, then the one that has waited longest, then the
   * lower gym id, then the lower server; with `placesOnly`, of those that do not wait for their
   * address (while Geocoding is refused or its budget used); never a gym of `except` (set aside
   * after a failure).
   */
  next(options?: NextGymOptions): Promise<GymLookup | undefined>;
  /** Sets whether a gym still waits for its address, for every server (its places it always waits for). */
  setAddress(gymId: number, address: boolean): Promise<void>;
  /** Takes a gym out of the line, every server's row of it: it was asked once, for all. */
  remove(gymId: number): Promise<void>;
  /** How many rows wait (a gym of two servers is two): `/gym google`'s snapshot. */
  count(): Promise<number>;
  /** Whether any row waits (one row read, never a count of the line): the line's turns. */
  any(): Promise<boolean>;
  /** Every row that waits, in the order of the line. */
  list(): Promise<WaitingGym[]>;
  /** Sets the rank of the rows named (those not in the line are left alone). */
  setRanks(ranks: readonly GymRank[]): Promise<void>;
}

/** The order of the line in memory (`lineOrder`): rank (higher first), time queued, id, server. */
export function gymLineOrder(a: WaitingGym, b: WaitingGym): number {
  return (
    lineOrder(
      { kind: 'gym', rank: a.rank, queuedAt: a.queuedAt, key: String(a.gymId) },
      { kind: 'gym', rank: b.rank, queuedAt: b.queuedAt, key: String(b.gymId) },
    ) || a.guildId - b.guildId
  );
}

function keyOf(row: { guildId: number; gymId: number }): string {
  return `${String(row.guildId)}:${String(row.gymId)}`;
}

/** The line in memory: the database's twin. */
export class MemoryGymLookups implements GymLookups {
  /** By server and gym (`<guildId>:<gymId>`). */
  readonly rows = new Map<string, WaitingGym>();

  add(gyms: readonly QueuedGym[], now: number): Promise<void> {
    for (const gym of gyms) {
      const kept = this.rows.get(keyOf(gym));
      this.rows.set(keyOf(gym), {
        ...gym,
        address: gym.address || (kept?.address ?? false),
        queuedAt: kept?.queuedAt ?? now,
      });
    }
    return Promise.resolve();
  }

  next(options: NextGymOptions = {}): Promise<GymLookup | undefined> {
    let first: WaitingGym | undefined;
    for (const row of this.rows.values()) {
      if (options.placesOnly && row.address) continue;
      if (options.except?.has(row.gymId)) continue;
      if (!first || gymLineOrder(row, first) < 0) first = row;
    }
    return Promise.resolve(
      first && { guildId: first.guildId, gymId: first.gymId, address: first.address },
    );
  }

  setAddress(gymId: number, address: boolean): Promise<void> {
    for (const [key, row] of this.rows) {
      if (row.gymId === gymId) this.rows.set(key, { ...row, address });
    }
    return Promise.resolve();
  }

  remove(gymId: number): Promise<void> {
    for (const [key, row] of this.rows) if (row.gymId === gymId) this.rows.delete(key);
    return Promise.resolve();
  }

  count(): Promise<number> {
    return Promise.resolve(this.rows.size);
  }

  any(): Promise<boolean> {
    return Promise.resolve(this.rows.size > 0);
  }

  list(): Promise<WaitingGym[]> {
    return Promise.resolve([...this.rows.values()].map((row) => ({ ...row })).sort(gymLineOrder));
  }

  setRanks(ranks: readonly GymRank[]): Promise<void> {
    for (const { guildId, gymId, rank } of ranks) {
      const kept = this.rows.get(keyOf({ guildId, gymId }));
      if (kept) this.rows.set(keyOf({ guildId, gymId }), { ...kept, rank });
    }
    return Promise.resolve();
  }
}
