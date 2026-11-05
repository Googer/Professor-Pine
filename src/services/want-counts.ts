import type { WantCountStorage } from '../db/repositories/want-count-repository.js';
import { dayBefore, localDay } from '../domain/time/local-day.js';
import type { Logger } from '../log.js';
import { everyLocalMidnight } from './local-midnight.js';

export interface WantCountServiceOptions {
  storage: WantCountStorage;
  /** The zone whose days are counted (`settings.timezone`). */
  zone: string;
  log: Logger;
  now?: () => number;
  /** Sets a timer; gives what cancels it. Tests run the timers by hand. */
  setTimer?: (run: () => void, ms: number) => () => void;
}

/**
 * The daily want counts (plan 8H-3; design Part A, "Want counts"; `WantCountDay`): a snapshot of
 * the wants of every server as they stand a second after local midnight, kept under the day that
 * just ended; and at start, under the day before, for each server that has no counts of that day
 * yet (a bot down over midnight loses the hours it was down, not the day). A server's day is
 * written once: a second count of it changes nothing. A count that fails is logged and that day
 * is lost; the next midnight counts the next one. No member is kept.
 */
export class WantCountService {
  private readonly now: () => number;
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  private midnight: { cancel(): void } | undefined;
  /** The counts one after the other: a midnight's waits for the start's. */
  private running: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(private readonly options: WantCountServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.setTimer =
      options.setTimer ??
      ((run, ms) => {
        const timer = setTimeout(run, ms);
        timer.unref();
        return () => {
          clearTimeout(timer);
        };
      });
  }

  /** Counts the day before now, then every day that ends from now on. Nothing after `stop`. */
  start(): void {
    if (this.stopped) return;
    this.midnight?.cancel();
    this.count(dayBefore(this.now(), this.options.zone));
    this.midnight = everyLocalMidnight({
      zone: this.options.zone,
      now: this.now,
      setTimer: this.setTimer,
      // The day before the midnight it waited for (review P6), however late its timer fires;
      // and, where it fired past another midnight (the machine asleep), the day before now too
      // (review R1). A day further between is lost.
      run: (midnight) => {
        const waited = localDay(midnight - 1, this.options.zone);
        this.count(waited);
        const ended = dayBefore(this.now(), this.options.zone);
        if (ended !== waited) this.count(ended);
      },
    });
  }

  /** Stops the timer; a count under way ends, and none starts after it. */
  stop(): void {
    this.stopped = true;
    this.midnight?.cancel();
    this.midnight = undefined;
  }

  /** Waits for the counts under way. For tests and shutdown. */
  idle(): Promise<void> {
    return this.running;
  }

  /** Counts a day, after the count under way. */
  private count(day: string): void {
    if (this.stopped) return;
    this.running = this.running.then(() => this.countDay(day));
  }

  private async countDay(day: string): Promise<void> {
    const { storage, log } = this.options;
    try {
      const counted = await storage.serversCounted(day);
      const servers = [...(await storage.countNow())].filter(
        ([serverId]) => !counted.has(serverId),
      );
      let targets = 0;
      for (const [serverId, counts] of servers) {
        if (this.stopped) return;
        await storage.write(serverId, day, counts);
        targets += counts.size;
      }
      log.info({ day, servers: servers.length, targets }, 'counted the wants of a day');
    } catch (err) {
      log.warn({ err, day }, 'could not count the wants of a day; that day is lost');
    }
  }
}
