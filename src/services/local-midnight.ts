import { nextLocalMidnight } from '../domain/time/local-day.js';

/** What `everyLocalMidnight` needs. */
export interface LocalMidnightOptions {
  /** IANA zone whose midnights count. */
  zone: string;
  now: () => number;
  /** Sets a timer; gives what cancels it (the services' own, injected in tests). */
  setTimer: (run: () => void, ms: number) => () => void;
  /**
   * Called a second after each local midnight, with the midnight it was set for (plan 8H-3: a
   * timer that fires late, the machine asleep, still says which midnight it is). Must not throw.
   */
  run: (midnight: number) => void;
}

/**
 * Calls `run` a second after every local midnight from now on (Temporal's midnight in `zone`, so a
 * day of a change of the clocks is 23 or 25 hours long; a second after, as the other timers: the
 * day after it is today, review P10 of 8R-9). One zone's timer of `everyLocalMidnightIn`. `cancel`
 * stops it for good.
 */
export function everyLocalMidnight(options: LocalMidnightOptions): { cancel(): void } {
  let cancelTimer: (() => void) | undefined;
  let cancelled = false;
  const next = (): void => {
    const now = options.now();
    const midnight = nextLocalMidnight(now, options.zone);
    cancelTimer = options.setTimer(
      () => {
        cancelTimer = undefined;
        if (cancelled) return;
        options.run(midnight);
        if (!cancelled) next();
      },
      midnight - now + 1_000,
    );
  };
  next();
  return {
    cancel() {
      cancelled = true;
      cancelTimer?.();
      cancelTimer = undefined;
    },
  };
}

/** What `everyLocalMidnightIn` needs. */
export interface ZonesMidnightOptions {
  /** The zones in use (`ServerSettingsLookup.zonesInUse`), read anew at `refresh` and after each midnight. */
  zones: () => Iterable<string>;
  now: () => number;
  /** Sets a timer; gives what cancels it (the services' own, injected in tests). */
  setTimer: (run: () => void, ms: number) => () => void;
  /**
   * Called a second after each local midnight of each zone in use, with the zone and the midnight
   * it was set for (`everyLocalMidnight`). Must not throw.
   */
  run: (zone: string, midnight: number) => void;
}

/** The timers of `everyLocalMidnightIn`. */
export interface ZonesMidnight {
  /** Reads the zones in use anew: a zone that came gets its timer, one that went loses its own. */
  refresh(): void;
  /** Stops every timer for good; a refresh after it sets none. */
  cancel(): void;
}

/**
 * Calls `run` a second after every local midnight of every zone in use (plan 19A-2): one timer
 * per zone (`everyLocalMidnight`), each serving the servers in that zone. The zones are read at
 * start, at `refresh` (a server's zone changed) and after each midnight, so that a zone that came
 * or went with a server is followed by the next midnight at the latest. The one timer of the
 * region summaries' (`PartyService.watchMidnight`), the events forum's listing (plan 8V-1), the
 * want counts and the lines of the region channels.
 */
export function everyLocalMidnightIn(options: ZonesMidnightOptions): ZonesMidnight {
  const watches = new Map<string, { cancel(): void }>();
  let cancelled = false;
  const refresh = (): void => {
    if (cancelled) return;
    const zones = new Set(options.zones());
    for (const [zone, watch] of watches) {
      if (zones.has(zone)) continue;
      watch.cancel();
      watches.delete(zone);
    }
    for (const zone of zones) {
      if (watches.has(zone)) continue;
      watches.set(
        zone,
        everyLocalMidnight({
          zone,
          now: options.now,
          setTimer: options.setTimer,
          run: (midnight) => {
            options.run(zone, midnight);
            refresh();
          },
        }),
      );
    }
  };
  refresh();
  return {
    refresh,
    cancel() {
      cancelled = true;
      for (const watch of watches.values()) watch.cancel();
      watches.clear();
    },
  };
}
