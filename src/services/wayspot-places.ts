import type { Logger } from '../log.js';
import type { AskedPlaces, WayspotLookups } from './wayspot-lookups.js';

/** How often at most the search is told of new places while answers arrive. */
export const PLACES_TOLD_EVERY_MS = 3_600_000;

export interface WayspotPlacesOptions {
  /** Where the places are kept (`WayspotLookupRepository` in the bot). */
  storage: Pick<WayspotLookups, 'asked' | 'saveAsked' | 'dropAsked'>;
  log: Logger;
  /** Default `PLACES_TOLD_EVERY_MS`. */
  toldEveryMs?: number;
  /** Starts a timer and gives the function that cancels it; default `setTimeout`, unref'd. */
  setTimer?: (run: () => void, ms: number) => () => void;
  /** Default `Date.now`. */
  now?: () => number;
}

/**
 * The places Google gave around each PokéStop and Power Spot (plan 8W-6), in memory: read at
 * start, written by `GymUpkeep` as the line's answers arrive, read by the search
 * (`PlaceFinder`, `WayspotIndex`'s `places`). The search builds its indexes anew when told
 * (`whenChanged`): at the load, and at most once an hour while answers arrive (a build takes
 * about half a second for a city), never once per answer.
 */
export class WayspotPlaces {
  private rows = new Map<string, AskedPlaces>();
  private changes = 0;
  private toldAt = Number.NEGATIVE_INFINITY;
  private cancelTimer: (() => void) | undefined;
  private readonly listeners: (() => void)[] = [];
  private readonly toldEveryMs: number;
  private readonly now: () => number;
  private readonly setTimer: (run: () => void, ms: number) => () => void;

  constructor(private readonly options: WayspotPlacesOptions) {
    this.toldEveryMs = options.toldEveryMs ?? PLACES_TOLD_EVERY_MS;
    this.now = options.now ?? Date.now;
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

  /** A number that changes whenever the search is told: what it built at it is current. */
  get generation(): number {
    return this.changes;
  }

  whenChanged(listener: () => void): void {
    this.listeners.push(listener);
  }

  /** Reads every Wayspot's places, and tells the search at once. */
  async load(): Promise<void> {
    const rows = await this.options.storage.asked();
    this.rows = new Map(rows.map((row) => [row.wayspotId, row]));
    this.tell();
  }

  get(id: string): AskedPlaces | undefined {
    return this.rows.get(id);
  }

  /** The names of the places around a Wayspot, as the search reads them; null for none. */
  placesOf(id: string): string | null {
    return this.rows.get(id)?.places ?? null;
  }

  /** The Wayspots whose places are kept. */
  ids(): string[] {
    return [...this.rows.keys()];
  }

  /** Keeps what Google gave around a Wayspot; the search is told within the hour. */
  async save(row: AskedPlaces): Promise<void> {
    await this.options.storage.saveAsked(row);
    this.rows.set(row.wayspotId, row);
    this.changed();
  }

  /** Forgets the places of these Wayspots (they became gyms, are gone, or are gyms). */
  async drop(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.options.storage.dropAsked(ids);
    for (const id of ids) this.rows.delete(id);
    this.changed();
  }

  /** For shutdown: no timer is left. */
  stop(): void {
    this.cancelTimer?.();
    this.cancelTimer = undefined;
  }

  private changed(): void {
    if (this.cancelTimer) return;
    const wait = this.toldAt + this.toldEveryMs - this.now();
    if (wait <= 0) {
      this.tell();
      return;
    }
    this.cancelTimer = this.setTimer(() => {
      this.cancelTimer = undefined;
      this.tell();
    }, wait);
  }

  private tell(): void {
    this.toldAt = this.now();
    this.changes += 1;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        this.options.log.warn({ err }, 'could not tell of the places around the Wayspots');
      }
    }
  }
}
