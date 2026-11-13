import type { EventWindowStorage } from '../db/repositories/event-window-repository.js';
import type { EventWindow } from '../domain/time/event-window.js';
import { timedIn } from '../domain/time/feed-times.js';
import type { Logger } from '../log.js';

/**
 * What an end made of the window (`EventWindows.end`; fix round 1, M1, M4): its end is now, a
 * moment for every server, so that what ran anywhere stays and nothing is left to come.
 */
export interface EventWindowEnd {
  /** The window as kept before the end. */
  before: EventWindow;
  /** The window as ended, in the ender's zone: empty there (`end <= start`) where it had not begun. */
  window: EventWindow;
  /**
   * How it stood in the ender's zone: `on`, `to-come` (called off there), or `over` there already
   * while still on in another zone in use, where it ends now.
   */
  here: 'on' | 'to-come' | 'over';
  /** Whether it had begun in some zone in use: else it was called off for every server. */
  ran: boolean;
}

/** What a set made of the window (`EventWindows.set`). */
export interface EventWindowSet {
  /** The window kept now. */
  window: EventWindow;
  /** The window kept before, ended or not (`current`); undefined when there was none. */
  before: EventWindow | undefined;
}

/** What `/admin event-window` needs of the event window (`EventWindowService`). */
export interface EventWindows {
  /**
   * The window that has not ended at `now` (begun or still to come), in `zone` (a server's, plan
   * 19A-2); undefined when none.
   */
  ongoing(now: number, zone: string): EventWindow | undefined;
  /**
   * Keeps the window `decide` makes of the one kept, as kept (its wall-clock times and moments,
   * ended or not, empty or not: fix round 1, M3), in its place, in the store first, after every
   * set and end asked before it (review LW-2). What `decide` throws (a `UserError`) rejects the
   * set, and nothing changes. `before`: the kept one where it is not empty.
   */
  set(decide: (kept: EventWindow | undefined) => EventWindow): Promise<EventWindowSet>;
  /**
   * Ends the window still on at `now` in `zone` (the zone of the server of whoever ends it) or in
   * another zone in use, after every set and end asked before it: its end becomes `now`, a moment
   * for every server (fix round 1, M1, M4): where it had begun it ran until now, where it had not
   * nothing of it is left. Undefined when it was on nowhere.
   */
  end(now: number, zone: string): Promise<EventWindowEnd | undefined>;
}

/**
 * The event window staff set (`/admin event-window`; 2026-11-09): kept in the database
 * (`EventWindowStorage`) and in memory, where `RaidEventService` asks it at every call
 * (`current`, its option `eventWindow`), so that every reader of the raid and max events has it
 * the moment it is set. Loaded at start (`load`, before the first read of the feed). Its changes
 * run one at a time, each deciding from what the one before kept (`changes`).
 */
export class EventWindowService implements EventWindows {
  private kept: EventWindow | undefined;
  /** The last change asked for: the next one starts after it, whether it failed or not. */
  private changes: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly options: {
      store: EventWindowStorage;
      log: Logger;
      /** The zones in use (`ServerSettings.zonesInUse`); without it, the ender's zone alone. */
      zones?: () => readonly string[];
    },
  ) {}

  /** Reads the kept window; a failure is logged, and there is none until one is set. */
  async load(): Promise<void> {
    let kept: EventWindow | undefined;
    try {
      kept = await this.options.store.current();
    } catch (err) {
      this.options.log.warn({ err }, 'could not read the event window');
      return;
    }
    this.kept = kept;
    if (kept) this.options.log.info({ start: kept.start, end: kept.end }, 'event window loaded');
  }

  /**
   * The window kept, ended or not (an ended one still sets how long the raids that hatched in it
   * last), in `zone` (plan 19A-2: its wall-clock times on that zone's clock, `timedIn`; without
   * one as kept, its moments in the instance's default zone); undefined when none was set, or
   * when it is empty there (ended before it began).
   */
  current(zone?: string): EventWindow | undefined {
    const kept = this.kept;
    if (kept === undefined) return undefined;
    const timed = zone === undefined ? kept : timedIn(kept, zone);
    return timed.end > timed.start ? timed : undefined;
  }

  ongoing(now: number, zone: string): EventWindow | undefined {
    const kept = this.current(zone);
    return kept !== undefined && kept.end > now ? kept : undefined;
  }

  set(decide: (kept: EventWindow | undefined) => EventWindow): Promise<EventWindowSet> {
    return this.inTurn(async () => {
      const before = this.current();
      const window = decide(this.kept);
      await this.keep(window);
      return { window, before };
    });
  }

  end(now: number, zone: string): Promise<EventWindowEnd | undefined> {
    return this.inTurn(async () => {
      const kept = this.kept;
      if (!kept) return undefined;
      const zones = [zone, ...(this.options.zones?.() ?? [])];
      const timed = zones.map((one) => timedIn(kept, one)).filter((one) => one.end > one.start);
      if (!timed.some((one) => one.end > now)) return undefined;
      const here = timedIn(kept, zone);
      // Ended now, one moment for every server (its end no longer local): what ran anywhere
      // stays, and where it had not begun it is empty.
      const { endLocal: _end, ...rest } = kept;
      const ended: EventWindow = { ...rest, end: now };
      await this.keep(ended);
      return {
        before: kept,
        window: timedIn(ended, zone),
        here:
          here.end <= now || here.end <= here.start ? 'over' : here.start > now ? 'to-come' : 'on',
        ran: timed.some((one) => one.start <= now),
      };
    });
  }

  /** Runs `change` after every change asked before it. */
  private inTurn<T>(change: () => Promise<T>): Promise<T> {
    const done = this.changes.then(change);
    this.changes = done.catch(() => undefined);
    return done;
  }

  /** Writes the window to the store, then keeps it in memory. */
  private async keep(window: EventWindow): Promise<void> {
    await this.options.store.keep(window);
    this.kept = window;
  }
}
