import type { ActivityReader } from '../../src/db/repositories/activity-repository.js';
import {
  inWindow,
  sumBuckets,
  UNKNOWN_MONTH,
  type ActivityBucket,
  type ActivityWindow,
} from '../../src/domain/history/activity.js';

/**
 * The activity buckets in memory (`ActivityReader`), the repository's twin for the map's route:
 * `add(serverId, buckets)` puts them in place, summed into those there as the hourly adding sums
 * them; `reads` counts every read, of buckets and of months (8H4-4), `failing` makes every read
 * reject.
 */
export class MemoryActivity implements ActivityReader {
  readonly rows = new Map<string, ActivityBucket[]>();
  reads = 0;
  failing: Error | undefined;

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
}
