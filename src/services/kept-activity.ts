import { BoundedMap } from '../bounded-map.js';
import type { ActivityReader } from '../db/repositories/activity-repository.js';
import type { ActivityBucket, ActivityWindow } from '../domain/history/activity.js';
import type { MonthRange, RegionCount } from '../domain/history/region-tally.js';

/**
 * How long a read of the buckets is used for: the buckets change once an hour (the upkeep's
 * adding), so a minute old shows nothing a member could miss.
 */
export const ACTIVITY_READ_FRESH_MS = 60_000;
/**
 * As many reads as are kept at once; the oldest goes first. Room for a member playing History
 * through its months (a month a second) beside the windows everybody asks for; a read that lost
 * its place only costs the read again.
 */
export const ACTIVITY_READS_KEPT = 100;

export interface KeptActivityOptions {
  /** The clock; `Date.now` by default. */
  now?: () => number;
}

/** No row, for every window that reads nothing. */
const NONE: readonly Readonly<ActivityBucket>[] = Object.freeze([]);

/** A window as a key: its months, or its hours in one order whatever order they were asked in. */
function windowKey(window: ActivityWindow): string {
  if ('months' in window) return `months ${window.months.first} ${window.months.last}`;
  const hours = window.hours.map((one) => one.weekday * 24 + one.hour).sort((a, b) => a - b);
  return `hours ${[...new Set(hours)].join(' ')}`;
}

/**
 * The reads of the activity buckets, each kept for a minute (plan 8Z-2, audit M4 and X2): a
 * wrapper around the reader (`ActivityRepository`) that the map's heatmap and the region tally
 * read through. A read of the buckets takes every matching row of a server (some 45,000 of
 * Pittsburgh's 216,000 for the weekday evenings) and nothing of it depends on who asks: what a
 * member may see is decided on the rows afterwards (the routes, `RegionTallies`). So one read per
 * server and window serves everybody for `ACTIVITY_READ_FRESH_MS`:
 *
 * - a read on its way is shared by those who ask meanwhile; one that failed is not kept;
 * - the rows are the very same for every caller, so they are read-only (frozen, and typed so);
 * - a window of months the server has no bucket in (`months`, itself kept) reads nothing and
 *   keeps nothing, so that asking for made-up months neither reads the database nor pushes out
 *   what is kept: the months that can be kept are those of the server's own span;
 * - at most `ACTIVITY_READS_KEPT` reads, the oldest out; those run out are let go at the next read.
 */
export class KeptActivity implements ActivityReader {
  private readonly kept = new BoundedMap<string, { until: number; read: Promise<unknown> }>(
    ACTIVITY_READS_KEPT,
  );
  private readonly now: () => number;

  constructor(
    private readonly reader: ActivityReader,
    options: KeptActivityOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  async buckets(
    serverId: string,
    window: ActivityWindow,
  ): Promise<readonly Readonly<ActivityBucket>[]> {
    if ('months' in window) {
      const has = await this.months(serverId);
      if (has === null || window.months.last < has.first || window.months.first > has.last) {
        return NONE;
      }
    } else if (window.hours.length === 0) {
      return NONE;
    }
    return this.read(`${serverId} ${windowKey(window)}`, async () =>
      Object.freeze(await this.reader.buckets(serverId, window)),
    );
  }

  months(serverId: string): Promise<{ first: string; last: string } | null> {
    return this.read(`${serverId} span`, () => this.reader.months(serverId));
  }

  regionSums(serverId: string, months: MonthRange): Promise<readonly Readonly<RegionCount>[]> {
    return this.read(`${serverId} sums ${months.first} ${months.last}`, async () =>
      Object.freeze(await this.reader.regionSums(serverId, months)),
    );
  }

  /**
   * A read kept `ACTIVITY_READ_FRESH_MS` from now under its key, one on its way shared; a read
   * that failed is not kept (as `Boards` keeps its own).
   */
  private read<T>(key: string, work: () => Promise<T>): Promise<T> {
    const now = this.now();
    // Set in the order they run out, so the ones run out are the oldest: let go here, since
    // their rows are many and nothing else would free them while their keys are not asked again.
    this.kept.dropWhile((entry) => entry.until <= now);
    const kept = this.kept.get(key);
    if (kept !== undefined && kept.until > now) return kept.read as Promise<T>;
    const read = work();
    this.kept.set(key, { until: now + ACTIVITY_READ_FRESH_MS, read });
    read.catch(() => {
      if (this.kept.get(key)?.read === read) this.kept.delete(key);
    });
    return read;
  }
}
