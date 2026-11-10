import { googleMonth } from '../domain/geo/google-line.js';
import type { Logger } from '../log.js';
import { mapsThisMonth, type GoogleUse } from './google-use.js';

export interface MapBudgetOptions {
  /** The counts of what was asked of Google (`GoogleUseRepository`). */
  use: GoogleUse;
  /** How many maps of places a Pacific month may download. */
  perMonth: number;
  log: Logger;
  now?: () => number;
}

/**
 * The month's maps of places (plan 8Z-2): `/find-region` shows a map of whatever place a member
 * types, and Google bills each one that is downloaded (Static Maps), so they count against a
 * monthly cap as the lookups by hand do, in a count of their own (`GoogleUseDay`, kind `map`):
 * members' maps and staff's lookups do not use each other's up. The month is Google's (Pacific
 * time, `googleMonth`). Past the cap no map is downloaded: the answer goes without one.
 */
export class MapBudget {
  private readonly now: () => number;
  /** One at a time: a map is counted before the next is asked about. */
  private line: Promise<unknown> = Promise.resolve();
  /** The month (its first day) whose cap was said to be reached: once a month. */
  private toldFor: string | undefined;

  constructor(private readonly options: MapBudgetOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Takes one of the month's maps for a download that is about to begin, and counts it (a
   * download that fails afterwards counts, as every question that reached Google does). False
   * when the month has none left, or while the count cannot be read or written: nothing is
   * downloaded that would not be counted. Never rejects.
   */
  spend(): Promise<boolean> {
    const taken = this.line.then(() => this.take());
    this.line = taken;
    return taken;
  }

  /** How many maps this month has used; undefined while the count cannot be read. */
  async used(): Promise<number | undefined> {
    try {
      return await mapsThisMonth(this.options.use, this.now());
    } catch {
      return undefined;
    }
  }

  /** How many a month may use. */
  get perMonth(): number {
    return this.options.perMonth;
  }

  private async take(): Promise<boolean> {
    const { use, perMonth, log } = this.options;
    const now = this.now();
    const month = googleMonth(now);
    try {
      const maps = await mapsThisMonth(use, now);
      if (maps >= perMonth) {
        if (this.toldFor !== month.days[0]) {
          this.toldFor = month.days[0];
          log.warn(
            { maps, perMonth, nextReset: month.nextReset },
            'this month’s maps of places are used: /find-region answers without a map until the month starts again',
          );
        }
        return false;
      }
      await use.use(month.today, 'map');
      return true;
    } catch (err) {
      log.warn({ err }, 'could not count a map of a place: none is made');
      return false;
    }
  }
}
