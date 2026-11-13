import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { Logger } from '../log.js';
import type { GoogleAnswers } from './google-answers.js';

/** How often at most a server's search is told of new places while answers arrive. */
export const PLACES_TOLD_EVERY_MS = 3_600_000;

export interface WayspotPlacesOptions {
  /** Google's answers by the point (plan 19B-3), where the places are kept. */
  answers: Pick<GoogleAnswers, 'at'>;
  log: Logger;
  /** Default `PLACES_TOLD_EVERY_MS`. */
  toldEveryMs?: number;
  /** Starts a timer and gives the function that cancels it; default `setTimeout`, unref'd. */
  setTimer?: (run: () => void, ms: number) => () => void;
  /** Default `Date.now`. */
  now?: () => number;
}

/** What is told of one server: when last, how often, and the timer of the next while one is set. */
interface Told {
  at: number;
  generation: number;
  cancelTimer: (() => void) | undefined;
}

/**
 * The places Google gave around each PokéStop and Power Spot (plan 8W-6): the point's answer
 * (`GoogleAnswers`, plan 19B-3), read by the search (`PlaceFinder`, `WayspotIndex`'s `places`),
 * the same for every server's copy of the place. A server's search builds its indexes anew when
 * told (`whenChanged`, with the server): `GymUpkeep` says which server's Wayspot got its places
 * (`changed`), and that server is told at once, then at most once an hour while answers arrive
 * (a build takes about half a second for a city), never once per answer; another server is not
 * told of them.
 */
export class WayspotPlaces {
  private readonly servers = new Map<number, Told>();
  private changes = 0;
  private readonly listeners: ((guildId: number) => void)[] = [];
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

  /** A number that changes whenever any server is told. */
  get generation(): number {
    return this.changes;
  }

  /** A number that changes whenever this server is told: what it built at it is current. */
  generationOf(guildId: number): number {
    return this.servers.get(guildId)?.generation ?? 0;
  }

  /** Told with the server whose Wayspots' places changed. */
  whenChanged(listener: (guildId: number) => void): void {
    this.listeners.push(listener);
  }

  /** The names of the places around a point, as the search reads them; null for none. */
  placesAt(point: LatLon): string | null {
    return this.options.answers.at('places', point)?.answer ?? null;
  }

  /** A Wayspot of this server got its places (asked, or found asked): its search is told. */
  changed(guildId: number): void {
    const told = this.servers.get(guildId) ?? {
      at: Number.NEGATIVE_INFINITY,
      generation: 0,
      cancelTimer: undefined,
    };
    this.servers.set(guildId, told);
    if (told.cancelTimer) return;
    const wait = told.at + this.toldEveryMs - this.now();
    if (wait <= 0) {
      this.tell(guildId, told);
      return;
    }
    told.cancelTimer = this.setTimer(() => {
      told.cancelTimer = undefined;
      this.tell(guildId, told);
    }, wait);
  }

  /** For shutdown: no timer is left. */
  stop(): void {
    for (const told of this.servers.values()) {
      told.cancelTimer?.();
      told.cancelTimer = undefined;
    }
  }

  private tell(guildId: number, told: Told): void {
    told.at = this.now();
    told.generation += 1;
    this.changes += 1;
    for (const listener of this.listeners) {
      try {
        listener(guildId);
      } catch (err) {
        this.options.log.warn({ err }, 'could not tell of the places around the Wayspots');
      }
    }
  }
}
