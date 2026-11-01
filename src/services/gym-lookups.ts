import { lineOrder } from '../domain/geo/google-line.js';

/**
 * The line of gyms that wait for Google (Matt, 2026-10-16; plan 8W-6): what `GymUpkeep` asks
 * Google about one at a time within a monthly budget, kept in the database
 * (`GymLookupRepository`) so that a restart loses nothing and a city's first import (thousands of
 * gyms) is worked through within the free allowance. The gyms go by the rank of their best region
 * (`regionRanks`, `src/domain/geo/google-line.ts`), then by the time they were queued.
 * `MemoryGymLookups` is its twin, for tests and for an upkeep built without a database.
 */

/** A gym in the line: for its places, and with `address` its address first. */
export interface GymLookup {
  gymId: number;
  address: boolean;
}

/** A gym put in the line, with the rank of its best region (`NO_REGION_RANK` in none). */
export interface QueuedGym extends GymLookup {
  rank: number;
}

/** A gym that waits, as the line holds it. */
export interface WaitingGym extends QueuedGym {
  queuedAt: number;
}

/** Which gym `GymLookups.next` may give. */
export interface NextGymOptions {
  /** Only one that waits for its places alone. */
  placesOnly?: boolean;
  /** None of these gyms. */
  except?: ReadonlySet<number>;
}

export interface GymLookups {
  /**
   * Puts gyms in the line; a gym already in it keeps its place in time, takes the rank given,
   * and waits for its address too when either asks for it.
   */
  add(gyms: readonly QueuedGym[], now: number): Promise<void>;
  /**
   * The first gym of the line: the highest rank, then the one that has waited longest, then the
   * lower id; with `placesOnly`, of those that do not wait for their address (while Geocoding is
   * refused or its budget used); never one of `except` (set aside after a failure).
   */
  next(options?: NextGymOptions): Promise<GymLookup | undefined>;
  /** Sets whether a gym in the line still waits for its address (its places it always waits for). */
  setAddress(gymId: number, address: boolean): Promise<void>;
  /** Takes a gym out of the line. */
  remove(gymId: number): Promise<void>;
  /** How many gyms wait. */
  count(): Promise<number>;
  /** Every gym that waits, in the order of the line. */
  list(): Promise<WaitingGym[]>;
  /** Sets the rank of the gyms named (those not in the line are left alone). */
  setRanks(ranks: ReadonlyMap<number, number>): Promise<void>;
  /**
   * The gyms whose places Google answered at the place they are (`markAsked`), whatever it
   * found: a gym it found nothing for has neither address nor places, as one never asked.
   */
  asked(): Promise<Set<number>>;
  /** Notes that Google answered about a gym's places (`at`: when). */
  markAsked(gymId: number, at: number): Promise<void>;
  /** Forgets that a gym was asked about: it moved, and its new place was not. */
  forgetAsked(gymId: number): Promise<void>;
}

/** The order of the line in memory (`lineOrder`): rank (higher first), time queued, id. */
function gymLineOrder(a: WaitingGym, b: WaitingGym): number {
  return lineOrder(
    { kind: 'gym', rank: a.rank, queuedAt: a.queuedAt, key: String(a.gymId) },
    { kind: 'gym', rank: b.rank, queuedAt: b.queuedAt, key: String(b.gymId) },
  );
}

/** The line in memory: the database's twin. */
export class MemoryGymLookups implements GymLookups {
  /** By gym id: whether it waits for its address, its rank, and when it was queued. */
  readonly rows = new Map<number, { address: boolean; rank: number; queuedAt: number }>();
  /** By gym id: when Google answered about its places. */
  readonly askedAt = new Map<number, number>();

  add(gyms: readonly QueuedGym[], now: number): Promise<void> {
    for (const { gymId, address, rank } of gyms) {
      const kept = this.rows.get(gymId);
      this.rows.set(gymId, {
        address: address || (kept?.address ?? false),
        rank,
        queuedAt: kept?.queuedAt ?? now,
      });
    }
    return Promise.resolve();
  }

  private waiting(): WaitingGym[] {
    return [...this.rows].map(([gymId, row]) => ({ gymId, ...row }));
  }

  next(options: NextGymOptions = {}): Promise<GymLookup | undefined> {
    let first: WaitingGym | undefined;
    for (const row of this.waiting()) {
      if (options.placesOnly && row.address) continue;
      if (options.except?.has(row.gymId)) continue;
      if (!first || gymLineOrder(row, first) < 0) first = row;
    }
    return Promise.resolve(first && { gymId: first.gymId, address: first.address });
  }

  setAddress(gymId: number, address: boolean): Promise<void> {
    const kept = this.rows.get(gymId);
    if (kept) this.rows.set(gymId, { ...kept, address });
    return Promise.resolve();
  }

  remove(gymId: number): Promise<void> {
    this.rows.delete(gymId);
    return Promise.resolve();
  }

  count(): Promise<number> {
    return Promise.resolve(this.rows.size);
  }

  list(): Promise<WaitingGym[]> {
    return Promise.resolve(this.waiting().sort(gymLineOrder));
  }

  setRanks(ranks: ReadonlyMap<number, number>): Promise<void> {
    for (const [gymId, rank] of ranks) {
      const kept = this.rows.get(gymId);
      if (kept) this.rows.set(gymId, { ...kept, rank });
    }
    return Promise.resolve();
  }

  asked(): Promise<Set<number>> {
    return Promise.resolve(new Set(this.askedAt.keys()));
  }

  markAsked(gymId: number, at: number): Promise<void> {
    this.askedAt.set(gymId, at);
    return Promise.resolve();
  }

  forgetAsked(gymId: number): Promise<void> {
    this.askedAt.delete(gymId);
    return Promise.resolve();
  }
}
