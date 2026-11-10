import { BoundedMap } from '../bounded-map.js';
import {
  bestPlace,
  placeSearchQuery,
  readNominatimPlaces,
  type Place,
} from '../domain/geo/nominatim.js';
import type { Box } from '@pine/wayspot-core/region-membership';
import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';
import { discardBody, readLimitedJson, type LimitedResponse } from './limited-json.js';

/**
 * What came of a search. `ok`: the place the name most likely means (`bestPlace`; undefined when
 * none was), and how many were found. `disabled`: no server is configured. `busy`: too many
 * searches wait for their turn already. `paused`: Nominatim asked to be left alone (429, 403)
 * and nothing is asked of it for a while (`status` on the answer that asked).
 * `refused`: another error status (`status`). `timeout`, `unreachable`: no answer. `too-large`,
 * `unreadable`: an answer that could not be read.
 */
export type PlaceOutcome =
  | { ok: true; place: Place | undefined; found: number }
  | {
      ok: false;
      reason:
        | 'disabled'
        | 'busy'
        | 'paused'
        | 'refused'
        | 'timeout'
        | 'unreachable'
        | 'too-large'
        | 'unreadable';
      status?: number;
    };

/**
 * Places by name, for `/find-region`. Nothing here throws: a failure is an answer. Tests use
 * `FakePlaces` (`test/support/places.ts`); nothing in a test touches the network.
 */
export interface PlaceSearch {
  /** False when no server is configured (`settings.findRegion`). */
  readonly enabled: boolean;
  /** The place most likely meant of those called `text` that lie in `box` (`bestPlace`). */
  search(text: string, box: Box): Promise<PlaceOutcome>;
}

export type PlaceFetch = (
  url: string,
  init: {
    method: 'GET';
    headers: Record<string, string>;
    redirect: 'error';
    signal: AbortSignal;
  },
) => Promise<LimitedResponse>;

export interface NominatimOptions {
  /** `settings.findRegion`: the server and the User-Agent; undefined switches searching off. */
  server: { url: string; userAgent: string } | undefined;
  fetch: PlaceFetch;
  log: Logger;
  now?: () => number;
  /** Waits; for tests. Default `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** How long one search may take once its turn came. Default ten seconds. */
  timeoutMs?: number;
  /** A longer answer is given up. Default 5 MB. */
  maxBytes?: number;
  /** The least time between the starts of two requests. Default a second (Nominatim's policy). */
  intervalMs?: number;
  /** How many searches may wait for their turn; one more is `busy`. Default ten. */
  maxWaiting?: number;
  /** How long a search's answer is kept. Default a day. */
  cacheMs?: number;
  /** How many answers are kept at most. Default 50: a place is a large object. */
  cacheSize?: number;
  /** How long nothing is asked after Nominatim answered 429 or 403. Default ten minutes. */
  pauseMs?: number;
}

/** The statuses by which Nominatim says the bot asks too much, or is blocked for it. */
const LEAVE_ALONE = new Set([403, 429]);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * OpenStreetMap's Nominatim (or another server of it) over `fetch`. Its usage policy is kept:
 * one request a second at most for the whole bot (searches wait for their turn, and when ten
 * wait already the next is told the service is busy), a User-Agent that names the installation,
 * and answers kept for a day, so that the same search in the same box is asked once. What
 * members search for is never logged.
 */
export class NominatimSearch implements PlaceSearch {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly intervalMs: number;
  private readonly maxWaiting: number;
  private readonly cacheMs: number;
  private readonly cache: BoundedMap<
    string,
    { at: number; place: Place | undefined; found: number }
  >;
  private readonly pauseMs: number;
  /** Until when nothing is asked of Nominatim. */
  private pausedUntil = 0;
  private readonly asking = new Map<string, Promise<PlaceOutcome>>();
  /** When the next request may start. */
  private nextStart = 0;
  private waiting = 0;

  constructor(private readonly options: NominatimOptions) {
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? sleep;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    this.intervalMs = options.intervalMs ?? 1_000;
    this.maxWaiting = options.maxWaiting ?? 10;
    this.cacheMs = options.cacheMs ?? 86_400_000;
    this.cache = new BoundedMap(options.cacheSize ?? 50);
    this.pauseMs = options.pauseMs ?? 600_000;
  }

  get enabled(): boolean {
    return this.options.server !== undefined;
  }

  search(text: string, box: Box): Promise<PlaceOutcome> {
    const { server } = this.options;
    if (!server) return Promise.resolve({ ok: false, reason: 'disabled' });
    const query = placeSearchQuery(text.trim().replace(/\s+/g, ' ').toLowerCase(), box);
    const now = this.now();
    this.cache.dropWhile((kept) => now - kept.at >= this.cacheMs);
    const kept = this.cache.get(query);
    if (kept) return Promise.resolve({ ok: true, place: kept.place, found: kept.found });
    const asking = this.asking.get(query);
    if (asking) return asking;
    if (now < this.pausedUntil) return Promise.resolve({ ok: false, reason: 'paused' });
    if (this.waiting >= this.maxWaiting) return Promise.resolve({ ok: false, reason: 'busy' });
    const answer = this.inTurn(() => this.ask(server, query))
      .then((outcome) => {
        // Only what is answered is kept: the place chosen and the count, not every outline.
        if (outcome.ok) {
          this.cache.set(query, { at: this.now(), place: outcome.place, found: outcome.found });
        }
        return outcome;
      })
      .finally(() => this.asking.delete(query));
    this.asking.set(query, answer);
    return answer;
  }

  /**
   * Runs a request when its turn has come: `intervalMs` after the start of the one before; not
   * at all when a pause began while it waited.
   */
  private async inTurn(request: () => Promise<PlaceOutcome>): Promise<PlaceOutcome> {
    const now = this.now();
    const start = Math.max(now, this.nextStart);
    this.nextStart = start + this.intervalMs;
    if (start > now) {
      this.waiting += 1;
      try {
        await this.sleep(start - now);
      } finally {
        this.waiting -= 1;
      }
      if (this.now() < this.pausedUntil) return { ok: false, reason: 'paused' };
    }
    return request();
  }

  private async ask(
    server: { url: string; userAgent: string },
    query: string,
  ): Promise<PlaceOutcome> {
    const { log } = this.options;
    const host = hostOf(server.url);
    try {
      const response = await this.options.fetch(
        `${server.url.replace(/\/+$/, '')}/search?${query}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': server.userAgent },
          redirect: 'error',
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      if (response.status !== 200) {
        discardBody(response);
        if (LEAVE_ALONE.has(response.status)) {
          this.pausedUntil = this.now() + this.pauseMs;
          log.warn(
            { host, status: response.status, pauseMs: this.pauseMs },
            'Nominatim asks to be left alone; not searching for a while',
          );
          return { ok: false, reason: 'paused', status: response.status };
        }
        log.warn({ host, status: response.status }, 'Nominatim refused a search');
        return { ok: false, reason: 'refused', status: response.status };
      }
      const body = await readLimitedJson(response, this.maxBytes);
      if (!body.ok) {
        log.warn({ host, reason: body.reason }, 'could not read the answer of Nominatim');
        return { ok: false, reason: body.reason };
      }
      const places = readNominatimPlaces(body.value);
      if (!places) {
        log.warn({ host }, 'the answer of Nominatim is not of the shape known');
        return { ok: false, reason: 'unreadable' };
      }
      return { ok: true, place: bestPlace(places), found: places.length };
    } catch (err) {
      const timeout = err instanceof Error && err.name === 'TimeoutError';
      log.warn(
        { host, reason: timeout ? 'timeout' : failureReason(err) },
        'could not search Nominatim',
      );
      return { ok: false, reason: timeout ? 'timeout' : 'unreachable' };
    }
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}
