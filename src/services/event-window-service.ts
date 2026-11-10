import type { EventWindowStorage } from '../db/repositories/event-window-repository.js';
import type { EventWindow } from '../domain/time/event-window.js';
import type { Logger } from '../log.js';

/** What a set made of the window (`EventWindows.set`). */
export interface EventWindowSet {
  /** The window kept now. */
  window: EventWindow;
  /** The window kept before, ended or not (`current`); undefined when there was none. */
  before: EventWindow | undefined;
}

/** What `/admin event-window` needs of the event window (`EventWindowService`). */
export interface EventWindows {
  /** The window that has not ended at `now` (begun or still to come); undefined when none. */
  ongoing(now: number): EventWindow | undefined;
  /**
   * Keeps the window `decide` makes of the one kept (`current`, ended or not) in its place, in
   * the store first, after every set and end asked before it (review LW-2). What `decide` throws
   * (a `UserError`) rejects the set, and nothing changes.
   */
  set(decide: (kept: EventWindow | undefined) => EventWindow): Promise<EventWindowSet>;
  /**
   * Ends the window that has not ended at `now`, after every set and end asked before it: its end
   * becomes `now` (or its start, for one not begun, so that nothing of it is left). The window as
   * ended; undefined when there was none.
   */
  end(now: number): Promise<EventWindow | undefined>;
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

  constructor(private readonly options: { store: EventWindowStorage; log: Logger }) {}

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
   * last); undefined when none was set, or when it was ended before it began.
   */
  current(): EventWindow | undefined {
    const kept = this.kept;
    return kept !== undefined && kept.end > kept.start ? kept : undefined;
  }

  ongoing(now: number): EventWindow | undefined {
    const kept = this.current();
    return kept !== undefined && kept.end > now ? kept : undefined;
  }

  set(decide: (kept: EventWindow | undefined) => EventWindow): Promise<EventWindowSet> {
    return this.inTurn(async () => {
      const before = this.current();
      const window = decide(before);
      await this.keep(window);
      return { window, before };
    });
  }

  end(now: number): Promise<EventWindow | undefined> {
    return this.inTurn(async () => {
      const window = this.ongoing(now);
      if (!window) return undefined;
      const ended = { ...window, end: Math.max(now, window.start) };
      await this.keep(ended);
      return ended;
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
