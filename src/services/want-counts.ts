import type { WantCountStorage } from '../db/repositories/want-count-repository.js';
import { dayBefore, localDay } from '../domain/time/local-day.js';
import type { Logger } from '../log.js';
import { everyLocalMidnightIn, type ZonesMidnight } from './local-midnight.js';
import type { ServerSettingsLookup } from './server-settings.js';

export interface WantCountServiceOptions {
  storage: WantCountStorage;
  /**
   * Each server's zone, whose days its counts are kept under, and the zones in use, whose
   * midnights count (plan 19A-2).
   */
  servers: Pick<ServerSettingsLookup, 'zoneOf' | 'zonesInUse'>;
  log: Logger;
  now?: () => number;
  /** Sets a timer; gives what cancels it. Tests run the timers by hand. */
  setTimer?: (run: () => void, ms: number) => () => void;
}

/**
 * The daily want counts (plan 8H-3; design Part A, "Want counts"; `WantCountDay`): a snapshot of
 * the wants of every server as they stand a second after its local midnight (plan 19A-2: of its
 * zone; one timer per zone in use, counting the servers in that zone), kept under its day that
 * just ended; and at start, under the day before, for each server that has no counts of that day
 * yet (a bot down over midnight loses the hours it was down, not the day). A server's day is
 * written once: a second count of it changes nothing. A count that fails is logged and that day
 * is lost; the next midnight counts the next one. A server whose write fails loses that day by
 * itself, and is named in the log. No member is kept. A server whose zone changed counts from its
 * new zone's next midnight on: a day around the change may be counted under the day it began in
 * or not at all, as a day the bot was down.
 */
export class WantCountService {
  private readonly now: () => number;
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  private midnights: ZonesMidnight | undefined;
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

  /**
   * Counts the day before now of each zone in use, then every day that ends from now on. Nothing
   * after `stop`.
   */
  start(): void {
    if (this.stopped) return;
    this.midnights?.cancel();
    for (const zone of this.options.servers.zonesInUse()) {
      this.count(dayBefore(this.now(), zone), zone);
    }
    this.midnights = everyLocalMidnightIn({
      zones: () => this.options.servers.zonesInUse(),
      now: this.now,
      setTimer: this.setTimer,
      // The day before the midnight it waited for (review P6), however late its timer fires;
      // and, where it fired past another midnight (the machine asleep), the day before now too
      // (review R1). A day further between is lost.
      run: (zone, midnight) => {
        const waited = localDay(midnight - 1, zone);
        this.count(waited, zone);
        const ended = dayBefore(this.now(), zone);
        if (ended !== waited) this.count(ended, zone);
      },
    });
  }

  /**
   * A server's zone changed (plan 19A-2; `ServerSettings.onZoneChange`): the midnights follow
   * the zones in use.
   */
  zonesChanged(): void {
    this.midnights?.refresh();
  }

  /** Stops the timers; a count under way ends, and none starts after it. */
  stop(): void {
    this.stopped = true;
    this.midnights?.cancel();
    this.midnights = undefined;
  }

  /** Waits for the counts under way. For tests and shutdown. */
  idle(): Promise<void> {
    return this.running;
  }

  /** Counts a day of the servers in `zone`, after the count under way. */
  private count(day: string, zone: string): void {
    if (this.stopped) return;
    this.running = this.running.then(() => this.countDay(day, zone));
  }

  private async countDay(day: string, zone: string): Promise<void> {
    const { storage, log } = this.options;
    try {
      const counted = await storage.serversCounted(day);
      // The servers in the zone (as they are now) whose day it is.
      const servers = [...(await storage.countNow())].filter(
        ([serverId]) => !counted.has(serverId) && this.options.servers.zoneOf(serverId) === zone,
      );
      let written = 0;
      let targets = 0;
      for (const [serverId, counts] of servers) {
        if (this.stopped) return;
        // A server's write that fails loses that server's day alone (review 8H3-3): the servers
        // after it are written all the same.
        try {
          await storage.write(serverId, day, counts);
        } catch (err) {
          log.warn(
            { err, day, server: serverId },
            'could not write the want counts of a server; that day is lost for it',
          );
          continue;
        }
        written += 1;
        targets += counts.size;
      }
      log.info({ day, zone, servers: written, targets }, 'counted the wants of a day');
    } catch (err) {
      log.warn({ err, day, zone }, 'could not count the wants of a day; that day is lost');
    }
  }
}
