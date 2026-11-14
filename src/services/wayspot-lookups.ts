import { lineOrder, OUT_OF_SHARE_RANK } from '../domain/geo/google-line.js';

/**
 * The PokéStops and Power Spots that wait for Google (plan 8W-6): they join the gyms' line after
 * every gym (`GymUpkeep`), PokéStops before Power Spots, each by the rank of its best region,
 * then by the time it was queued. A Wayspot waits per server that keeps it (plan 19B-3), by that
 * server's regions; the places Google gives are the point's (`GoogleAnswers`), so the second
 * server's row finds them and leaves the line unasked. `WayspotLookupRepository` keeps the line in
 * the database; `MemoryWayspotLookups` is its twin (both run `wayspotLookupCases`).
 */

/** The kinds of Wayspot the line asks about. */
export type WayspotLineKind = 'stop' | 'powerspot';

/** A server's Wayspot in the line, without its order: its server's `Guild` row and its id. */
export interface ServerSpot {
  guildId: number;
  /** A Wayfarer id or `pine-<id>`. */
  wayspotId: string;
}

/** A Wayspot put in the line: its server, id, kind and rank. */
export interface QueuedWayspot extends ServerSpot {
  kind: WayspotLineKind;
  rank: number;
}

/** A Wayspot that waits, as the line holds it. */
export interface WaitingWayspot extends QueuedWayspot {
  queuedAt: number;
}

/** Which Wayspot `WayspotLookups.next` may give. */
export interface NextWayspotOptions {
  except?: ReadonlySet<string>;
  /** The servers out of their share of places questions, by `Guild` row. */
  outOfShare?: ReadonlySet<number>;
}

export interface WayspotLookups {
  /**
   * Puts Wayspots in the line, each for its server; one already in it for that server keeps its
   * time, and takes the kind and rank given.
   */
  add(wayspots: readonly QueuedWayspot[], now: number): Promise<void>;
  /**
   * The first of the line: stops before Power Spots, then the highest rank, the oldest, the
   * lower id, the lower server; never a Wayspot of `except`, of any server (set aside after a
   * failure). With `outOfShare` (plan 19B-5) the line asks by shares: no row ranked out of its
   * share (`OUT_OF_SHARE_RANK`, read above it alone), and none of these servers'.
   */
  next(options?: NextWayspotOptions): Promise<WaitingWayspot | undefined>;
  /** Each server's rows (plan 19B-5: its need), by `Guild` row; a server without is left out. */
  needs(): Promise<Map<number, number>>;
  /** Takes these servers' rows out of the line. */
  remove(spots: readonly ServerSpot[]): Promise<void>;
  count(): Promise<number>;
  /** Whether any row waits (one row read, never a count of the line). */
  any(): Promise<boolean>;
  /** Every row that waits, in the order of the line. */
  list(): Promise<WaitingWayspot[]>;
  /**
   * The rows of one server that wait, in no particular order: what a change of that server's
   * Wayspots brings up to date (`GymUpkeep`), without reading another server's.
   */
  ofServer(guildId: number): Promise<WaitingWayspot[]>;
}

/** The order of the line (`lineOrder`): kind, rank (higher first), time queued, id, server. */
export function wayspotLineOrder(a: WaitingWayspot, b: WaitingWayspot): number {
  return lineOrder({ ...a, key: a.wayspotId }, { ...b, key: b.wayspotId }) || a.guildId - b.guildId;
}

/** A row's key in memory: `<guildId>:<wayspotId>`. */
export function spotKey(spot: ServerSpot): string {
  return `${String(spot.guildId)}:${spot.wayspotId}`;
}

/** The line in memory: the database's twin. */
export class MemoryWayspotLookups implements WayspotLookups {
  readonly rows = new Map<string, WaitingWayspot>();

  add(wayspots: readonly QueuedWayspot[], now: number): Promise<void> {
    for (const wayspot of wayspots) {
      const kept = this.rows.get(spotKey(wayspot));
      this.rows.set(spotKey(wayspot), { ...wayspot, queuedAt: kept?.queuedAt ?? now });
    }
    return Promise.resolve();
  }

  async next(options: NextWayspotOptions = {}): Promise<WaitingWayspot | undefined> {
    const { except, outOfShare } = options;
    return (await this.list()).find(
      (row) =>
        except?.has(row.wayspotId) !== true &&
        (outOfShare === undefined ||
          (row.rank > OUT_OF_SHARE_RANK && !outOfShare.has(row.guildId))),
    );
  }

  needs(): Promise<Map<number, number>> {
    const needs = new Map<number, number>();
    for (const row of this.rows.values()) needs.set(row.guildId, (needs.get(row.guildId) ?? 0) + 1);
    return Promise.resolve(needs);
  }

  remove(spots: readonly ServerSpot[]): Promise<void> {
    for (const spot of spots) this.rows.delete(spotKey(spot));
    return Promise.resolve();
  }

  count(): Promise<number> {
    return Promise.resolve(this.rows.size);
  }

  any(): Promise<boolean> {
    return Promise.resolve(this.rows.size > 0);
  }

  ofServer(guildId: number): Promise<WaitingWayspot[]> {
    return Promise.resolve(
      [...this.rows.values()].filter((row) => row.guildId === guildId).map((row) => ({ ...row })),
    );
  }

  list(): Promise<WaitingWayspot[]> {
    return Promise.resolve(
      [...this.rows.values()].map((row) => ({ ...row })).sort(wayspotLineOrder),
    );
  }
}
