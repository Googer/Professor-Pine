import { lineOrder } from '../domain/geo/google-line.js';

/**
 * The PokéStops and Power Spots that wait for Google, and the places it gave around them (plan
 * 8W-6): they join the gyms' line after every gym (`GymUpkeep`), PokéStops before Power Spots,
 * each by the rank of its best region, then by the time it was queued. Their places are kept
 * apart from the Wayfarer import's writes, with the point and kind they were asked for, so that a
 * Wayspot moved or of another kind waits again. `WayspotLookupRepository` keeps them in the
 * database; `MemoryWayspotLookups` is its twin (both run `wayspotLookupCases`).
 */

/** The kinds of Wayspot the line asks about. */
export type WayspotLineKind = 'stop' | 'powerspot';

/** A Wayspot put in the line: its id (a Wayfarer id or `pine-<id>`), kind and rank. */
export interface QueuedWayspot {
  wayspotId: string;
  kind: WayspotLineKind;
  rank: number;
}

/** A Wayspot that waits, as the line holds it. */
export interface WaitingWayspot extends QueuedWayspot {
  queuedAt: number;
}

/** What Google gave around a Wayspot, and for which point and kind it was asked. */
export interface AskedPlaces {
  wayspotId: string;
  kind: WayspotLineKind;
  lat: number;
  lon: number;
  /** The names joined by spaces (`placesText`); null when Google found none. */
  places: string | null;
  askedAt: number;
}

export interface WayspotLookups {
  /** Puts Wayspots in the line; one already in it keeps its time, and takes the kind and rank given. */
  add(wayspots: readonly QueuedWayspot[], now: number): Promise<void>;
  /**
   * The first of the line: stops before Power Spots, then the highest rank, the oldest, the
   * lower id; never one of `except` (set aside after a failure).
   */
  next(options?: { except?: ReadonlySet<string> }): Promise<WaitingWayspot | undefined>;
  /** Takes Wayspots out of the line. */
  remove(ids: readonly string[]): Promise<void>;
  count(): Promise<number>;
  /** Every Wayspot that waits, in the order of the line. */
  list(): Promise<WaitingWayspot[]>;
  /** Every Wayspot's places as asked. */
  asked(): Promise<AskedPlaces[]>;
  /** Keeps what Google gave around a Wayspot, over what it gave before. */
  saveAsked(row: AskedPlaces): Promise<void>;
  /** Forgets the places of these Wayspots (they became gyms, or are gone). */
  dropAsked(ids: readonly string[]): Promise<void>;
}

/** The order of the line (`lineOrder`): kind, rank (higher first), time queued, id. */
function wayspotLineOrder(a: WaitingWayspot, b: WaitingWayspot): number {
  return lineOrder({ ...a, key: a.wayspotId }, { ...b, key: b.wayspotId });
}

/** The line and the places in memory: the database's twin. */
export class MemoryWayspotLookups implements WayspotLookups {
  readonly rows = new Map<string, WaitingWayspot>();
  readonly places = new Map<string, AskedPlaces>();

  add(wayspots: readonly QueuedWayspot[], now: number): Promise<void> {
    for (const wayspot of wayspots) {
      const kept = this.rows.get(wayspot.wayspotId);
      this.rows.set(wayspot.wayspotId, { ...wayspot, queuedAt: kept?.queuedAt ?? now });
    }
    return Promise.resolve();
  }

  async next(options: { except?: ReadonlySet<string> } = {}): Promise<WaitingWayspot | undefined> {
    return (await this.list()).find((row) => options.except?.has(row.wayspotId) !== true);
  }

  remove(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.rows.delete(id);
    return Promise.resolve();
  }

  count(): Promise<number> {
    return Promise.resolve(this.rows.size);
  }

  list(): Promise<WaitingWayspot[]> {
    return Promise.resolve(
      [...this.rows.values()].map((row) => ({ ...row })).sort(wayspotLineOrder),
    );
  }

  asked(): Promise<AskedPlaces[]> {
    return Promise.resolve([...this.places.values()].map((row) => ({ ...row })));
  }

  saveAsked(row: AskedPlaces): Promise<void> {
    this.places.set(row.wayspotId, { ...row });
    return Promise.resolve();
  }

  dropAsked(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.places.delete(id);
    return Promise.resolve();
  }
}
