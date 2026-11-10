import { nextLocalMidnight } from '../domain/time/local-day.js';

/** What `everyLocalMidnight` needs. */
export interface LocalMidnightOptions {
  /** IANA zone whose midnights count (`settings.timezone`). */
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
 * day after it is today, review P10 of 8R-9). The one timer of the region summaries'
 * (`PartyService.watchMidnight`) and the events forum's listing (plan 8V-1). `cancel` stops it for
 * good.
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
