/** At most `uses` runs per member within `perSeconds` seconds. */
export interface Throttle {
  uses: number;
  perSeconds: number;
}

/**
 * How often one member may change what is stored for them (a setting, a want, a gym, a friend
 * code, an in-game name): each use writes to the database.
 */
export const MEMBER_WRITE_THROTTLE: Throttle = { uses: 30, perSeconds: 60 };

/** How often one member may ask for something that is only read or computed (`/rank`, `/boss-tier`). */
export const MEMBER_READ_THROTTLE: Throttle = { uses: 30, perSeconds: 60 };

const PRUNE_ABOVE = 5_000;

/**
 * Counts how often each member used each throttled command. The window opens with a member's
 * first use and closes `perSeconds` later, as the legacy bot counted. Kept in memory only: a
 * restart forgets it.
 */
export class Throttles {
  private readonly windows = new Map<
    string,
    { opened: number; closes: number; uses: number; givenBack: number }
  >();

  /**
   * Records one use at time `now` (epoch milliseconds). Answers undefined when it is allowed,
   * or the number of seconds until the member may use the command again.
   */
  use(command: string, userId: string, throttle: Throttle, now: number): number | undefined {
    const key = `${command}\n${userId}`;
    const window = this.windows.get(key);
    if (!window || now >= window.closes) {
      if (this.windows.size >= PRUNE_ABOVE) this.prune(now);
      this.windows.set(key, {
        opened: now,
        closes: now + throttle.perSeconds * 1000,
        uses: 1,
        givenBack: 0,
      });
      return undefined;
    }
    if (window.uses < throttle.uses) {
      window.uses += 1;
      return undefined;
    }
    return Math.ceil((window.closes - now) / 1000);
  }

  /**
   * How long the member would wait at time `now` for a use: undefined when one is allowed, else
   * the seconds until it is. Counts nothing (a check before a form whose submit counts, plan 8S-3).
   */
  wait(command: string, userId: string, throttle: Throttle, now: number): number | undefined {
    const window = this.windows.get(`${command}\n${userId}`);
    if (!window || now >= window.closes || window.uses < throttle.uses) return undefined;
    return Math.ceil((window.closes - now) / 1000);
  }

  /**
   * Gives back a use recorded in the member's window, while it is open: one whose work failed
   * for no fault of the member (plan 8S-3; the router does it on an unexpected error).
   * `countedAt` is when the use was counted: a window opened after it (the use's own closed
   * meanwhile, as a `/meetup` form may outlive it) gets nothing back. At most `throttle.uses` a
   * window, so that a use that keeps failing is held to twice the limit.
   */
  giveBack(
    command: string,
    userId: string,
    throttle: Throttle,
    now: number,
    countedAt: number,
  ): void {
    const window = this.windows.get(`${command}\n${userId}`);
    if (!window || now >= window.closes || window.uses === 0) return;
    if (window.opened > countedAt) return;
    if (window.givenBack >= throttle.uses) return;
    window.uses -= 1;
    window.givenBack += 1;
  }

  /** How many members' windows are held; for tests. */
  get size(): number {
    return this.windows.size;
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) if (now >= window.closes) this.windows.delete(key);
  }
}

/** "45 seconds", "1 minute", "12 minutes": how long a member has to wait, rounded up. */
export function waitText(seconds: number): string {
  if (seconds < 60) return seconds === 1 ? '1 second' : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
