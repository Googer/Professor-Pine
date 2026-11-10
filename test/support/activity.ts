import type {
  ActivityDayReader,
  ActivityReader,
  DaySeries,
  DayTotal,
} from '../../src/db/repositories/activity-repository.js';
import {
  inWindow,
  NO_BOSS,
  sumBuckets,
  sumDays,
  UNKNOWN_MONTH,
  type ActivityBucket,
  type ActivityDay,
  type ActivityWindow,
} from '../../src/domain/history/activity.js';
import type { DayBoss } from '../../src/domain/history/big-days.js';
import type { MonthRange, RegionCount } from '../../src/domain/history/region-tally.js';

/**
 * The activity buckets and the raids per day in memory (`ActivityReader`, `ActivityDayReader`),
 * the repository's twin for the map's and the history page's routes: `add(serverId, buckets)` and
 * `addDays(serverId, days)` put them in place, summed into those there as the hourly adding sums
 * them; `reads` counts every read, of buckets, of months (8H4-4), of the region tally's sums
 * (plan 8H-5) and of the days (plan 8H-8), `failing` makes every read reject.
 */
export class MemoryActivity implements ActivityReader, ActivityDayReader {
  readonly rows = new Map<string, ActivityBucket[]>();
  readonly days = new Map<string, ActivityDay[]>();
  reads = 0;
  failing: Error | undefined;
  /** What `daysComplete` says of every server (A1): false while the days are being filled. */
  complete = true;

  add(serverId: string, buckets: readonly ActivityBucket[]): Promise<void> {
    this.rows.set(serverId, sumBuckets([...(this.rows.get(serverId) ?? []), ...buckets]));
    return Promise.resolve();
  }

  buckets(serverId: string, window: ActivityWindow): Promise<ActivityBucket[]> {
    this.reads += 1;
    if (this.failing) return Promise.reject(this.failing);
    return Promise.resolve(
      (this.rows.get(serverId) ?? [])
        .filter((bucket) => inWindow(window, bucket))
        .map((bucket) => ({ ...bucket })),
    );
  }

  regionSums(serverId: string, months: MonthRange): Promise<RegionCount[]> {
    this.reads += 1;
    if (this.failing) return Promise.reject(this.failing);
    const sums = new Map<number, RegionCount>();
    for (const bucket of this.rows.get(serverId) ?? []) {
      if (!inWindow({ months }, bucket)) continue;
      const had = sums.get(bucket.regionId) ?? { regionId: bucket.regionId, raids: 0, maxes: 0 };
      sums.set(bucket.regionId, {
        regionId: bucket.regionId,
        raids: had.raids + bucket.raids,
        maxes: had.maxes + bucket.maxes,
      });
    }
    return Promise.resolve([...sums.values()]);
  }

  months(serverId: string): Promise<{ first: string; last: string } | null> {
    this.reads += 1;
    if (this.failing) return Promise.reject(this.failing);
    const months = (this.rows.get(serverId) ?? [])
      .map((bucket) => bucket.month)
      .filter((month) => month > UNKNOWN_MONTH)
      .sort();
    const [first] = months;
    const last = months.at(-1);
    return Promise.resolve(first === undefined || last === undefined ? null : { first, last });
  }

  addDays(serverId: string, days: readonly ActivityDay[]): Promise<void> {
    this.days.set(serverId, sumDays([...(this.days.get(serverId) ?? []), ...days]));
    return Promise.resolve();
  }

  /** The days of a server without the regions left out, after counting the read. */
  private daysOf(serverId: string, leftOut: readonly number[]): Promise<ActivityDay[]> {
    this.reads += 1;
    if (this.failing) return Promise.reject(this.failing);
    return Promise.resolve(
      (this.days.get(serverId) ?? []).filter((one) => !leftOut.includes(one.regionId)),
    );
  }

  async dayTotals(serverId: string, leftOut: readonly number[]): Promise<DayTotal[]> {
    const sums = new Map<string, DayTotal>();
    for (const one of await this.daysOf(serverId, leftOut)) {
      const had = sums.get(one.day) ?? { day: one.day, raids: 0, maxes: 0 };
      sums.set(one.day, {
        day: one.day,
        raids: had.raids + one.raids,
        maxes: had.maxes + one.maxes,
      });
    }
    return [...sums.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  }

  /** One read, as the repository's one snapshot (R3). */
  async daySeries(serverId: string, leftOut: readonly number[]): Promise<DaySeries> {
    const reads = this.reads;
    const series = {
      complete: await this.daysComplete(),
      totals: await this.dayTotals(serverId, leftOut),
      bosses: await this.dayBosses(serverId, leftOut),
    };
    this.reads = reads + 1;
    return series;
  }

  daysComplete(): Promise<boolean> {
    this.reads += 1;
    if (this.failing) return Promise.reject(this.failing);
    return Promise.resolve(this.complete);
  }

  async dayBosses(serverId: string, leftOut: readonly number[]): Promise<DayBoss[]> {
    const sums = new Map<string, DayBoss>();
    for (const one of await this.daysOf(serverId, leftOut)) {
      if (one.boss === NO_BOSS) continue;
      const key = `${one.day}|${one.boss}`;
      const had = sums.get(key) ?? { day: one.day, boss: one.boss, raids: 0 };
      sums.set(key, { ...had, raids: had.raids + one.raids });
    }
    return [...sums.values()].filter((one) => one.raids > 0);
  }
}
