import {
  GEOCODE_ENDPOINT,
  PLACES_ENDPOINT,
  PLACES_FIELD_MASK,
  placesRequest,
  readGeocode,
  readPlaces,
  type AddressComponents,
} from '../domain/geo/google.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';
import { discardBody, readLimitedJson, type LimitedResponse } from './limited-json.js';

/**
 * Why Google gave nothing. `no-key`: no API key is configured. `denied`: the key may not use
 * that API (it is not asked again for a while). `failed`: anything else; it was logged.
 */
export type GeoFailure = 'no-key' | 'denied' | 'failed';

export type GeoAnswer<T> = { ok: true; value: T } | GeoRefusal;

/** Nothing came; for `denied`, `retryInMs` says how long that API is still left alone. */
export interface GeoRefusal {
  ok: false;
  reason: GeoFailure;
  retryInMs?: number;
}

/**
 * What gym administration asks of the outside world: Google, about a point, and the address a
 * short link leads to. Nothing here throws: a failure is an answer. Tests use `FakeGeoGateway`
 * (`test/support/geo.ts`); nothing in a test touches the network.
 */
export interface GeoGateway {
  /** False when no Google API key is configured: both questions then answer `no-key`. */
  readonly enabled: boolean;
  /** The address parts of a point (none when Google knows nothing there). */
  reverseGeocode(point: LatLon): Promise<GeoAnswer<AddressComponents>>;
  /** The names of the places within `radiusMetres` of a point that are worth keeping. */
  placesNear(point: LatLon, radiusMetres: number): Promise<GeoAnswer<string[]>>;
  /**
   * The address a short link of the Maps app leads to: the first address on its way that
   * `readable` accepts. Undefined when it leads to none, or could not be followed.
   */
  followShortLink(url: string, readable: (address: string) => boolean): Promise<string | undefined>;
}

/**
 * What is used of an answer: its body read with a limit (`readLimitedJson`), and of a redirect
 * or a refusal not read at all.
 */
export type GeoResponse = LimitedResponse;

export type GeoFetch = (
  url: string,
  init: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    redirect: 'manual' | 'error';
    signal: AbortSignal;
  },
) => Promise<GeoResponse>;

export interface GoogleGeoOptions {
  /** `GOOGLE_API_KEY`; without it nothing is asked of Google. */
  apiKey: string | undefined;
  fetch: GeoFetch;
  log: Logger;
  now?: () => number;
  /** How long one question to Google may take. Default ten seconds. */
  timeoutMs?: number;
  /** How long following a short link may take, all its hops together. Default five seconds. */
  linkTimeoutMs?: number;
  /** How long an API that refused the key is not asked again. Default an hour. */
  deniedForMs?: number;
  /** A longer answer of an API is given up. Default `MAX_GEO_ANSWER_BYTES`. */
  maxBytes?: number;
}

/** The only hosts a short link is ever followed to. */
const LINK_HOSTS: ReadonlySet<string> = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'google.com',
  'www.google.com',
  'maps.google.com',
]);
/** A short link is followed over at most this many addresses. */
export const MAX_LINK_HOPS = 5;
/**
 * How long an answer of the Geocoding or the Places API may be (plan 8Z-2): read piece by piece
 * and given up the moment it is longer. An address of a point is some tens of kilobytes at its
 * longest, twenty places with their names and types less.
 */
export const MAX_GEO_ANSWER_BYTES = 1024 * 1024;

type Api = 'geocoding' | 'places';

/**
 * Google's Geocoding API and Places API (New) over `fetch`, and the redirects of a short link
 * followed by hand.
 *
 * The API key is only ever in a request: the Geocoding API takes it in the address, the Places
 * API in a header. No address is logged, and what a failure says is logged with the key taken
 * out of it. A refused key (`REQUEST_DENIED`, 403) is logged once and that API is left alone
 * for an hour.
 */
export class GoogleGeo implements GeoGateway {
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly linkTimeoutMs: number;
  private readonly deniedForMs: number;
  private readonly maxBytes: number;
  private readonly deniedUntil = new Map<Api, number>();

  constructor(private readonly options: GoogleGeoOptions) {
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.linkTimeoutMs = options.linkTimeoutMs ?? 5_000;
    this.deniedForMs = options.deniedForMs ?? 3_600_000;
    this.maxBytes = options.maxBytes ?? MAX_GEO_ANSWER_BYTES;
  }

  /**
   * The JSON of an answer, read piece by piece and given up the moment it is longer than an
   * answer may be (plan 8Z-2); or why it was not read, as the log says it.
   */
  private async answerOf(
    response: GeoResponse,
  ): Promise<{ ok: true; value: unknown } | { ok: false; why: string }> {
    const body = await readLimitedJson(response, this.maxBytes);
    if (body.ok) return body;
    return {
      ok: false,
      why:
        body.reason === 'too-large'
          ? `the answer is longer than ${this.maxBytes} bytes`
          : 'the answer is no JSON',
    };
  }

  get enabled(): boolean {
    return this.options.apiKey !== undefined && this.options.apiKey !== '';
  }

  /** A text that may be logged: without the key, wherever it stands in it. */
  private safe(text: string): string {
    const key = this.options.apiKey;
    if (!key) return text;
    return text.split(key).join('[key]').split(encodeURIComponent(key)).join('[key]');
  }

  private denied(api: Api, message: string, response?: GeoResponse): GeoRefusal {
    // What the refusal says in its body is of no use: let go of it unread.
    if (response) discardBody(response);
    this.deniedUntil.set(api, this.now() + this.deniedForMs);
    this.options.log.warn(
      { api, reason: this.safe(message) },
      'Google refused the API key; not asking again for a while',
    );
    return { ok: false, reason: 'denied', retryInMs: this.deniedForMs };
  }

  private failed(api: Api, reason: string): GeoRefusal {
    this.options.log.warn({ api, reason: this.safe(reason) }, 'a request to Google failed');
    return { ok: false, reason: 'failed' };
  }

  /** Why an API is not asked now; undefined when it may be. */
  private unavailable(api: Api): GeoRefusal | undefined {
    if (!this.enabled) return { ok: false, reason: 'no-key' };
    const until = this.deniedUntil.get(api);
    if (until === undefined) return undefined;
    const left = until - this.now();
    if (left > 0) return { ok: false, reason: 'denied', retryInMs: left };
    this.deniedUntil.delete(api);
    return undefined;
  }

  async reverseGeocode(point: LatLon): Promise<GeoAnswer<AddressComponents>> {
    const api: Api = 'geocoding';
    const unavailable = this.unavailable(api);
    if (unavailable) return unavailable;
    const query = new URLSearchParams({
      latlng: `${point.lat},${point.lon}`,
      language: 'en',
      key: this.options.apiKey ?? '',
    });
    let body: unknown;
    try {
      const response = await this.options.fetch(`${GEOCODE_ENDPOINT}?${query.toString()}`, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status === 403) return this.denied(api, 'HTTP 403', response);
      // Google answers 200 also for what it refuses, and says why in the body.
      const answer = await this.answerOf(response);
      if (!answer.ok) return this.failed(api, answer.why);
      body = answer.value;
    } catch (err) {
      return this.failed(api, failureReason(err));
    }
    const reading = readGeocode(body);
    if (reading.kind === 'denied') return this.denied(api, reading.message);
    if (reading.kind === 'failed') return this.failed(api, reading.status);
    return { ok: true, value: reading.components };
  }

  async placesNear(point: LatLon, radiusMetres: number): Promise<GeoAnswer<string[]>> {
    const api: Api = 'places';
    const unavailable = this.unavailable(api);
    if (unavailable) return unavailable;
    try {
      const response = await this.options.fetch(PLACES_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.options.apiKey ?? '',
          'X-Goog-FieldMask': PLACES_FIELD_MASK,
        },
        body: JSON.stringify(placesRequest(point, radiusMetres)),
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status === 403) return this.denied(api, 'HTTP 403', response);
      if (response.status !== 200) {
        discardBody(response);
        return this.failed(api, `HTTP ${response.status}`);
      }
      const answer = await this.answerOf(response);
      if (!answer.ok) return this.failed(api, answer.why);
      return { ok: true, value: readPlaces(answer.value) };
    } catch (err) {
      return this.failed(api, failureReason(err));
    }
  }

  /**
   * Follows the redirects of a short link by hand. Only `https` addresses of the hosts in
   * `LINK_HOSTS` are ever requested (a redirect anywhere else ends it), over at most
   * `MAX_LINK_HOPS` addresses and `linkTimeoutMs` in all, and no body is read: where a link
   * leads is in the `Location` header of the answer.
   */
  async followShortLink(
    url: string,
    readable: (address: string) => boolean,
  ): Promise<string | undefined> {
    const signal = AbortSignal.timeout(this.linkTimeoutMs);
    let current = url;
    for (let hop = 0; hop < MAX_LINK_HOPS; hop++) {
      const target = requestable(current);
      if (!target) return undefined;
      let next: string;
      try {
        const response = await this.options.fetch(target.href, {
          method: 'GET',
          redirect: 'manual',
          signal,
        });
        const location = response.headers.get('location');
        // The page itself is of no use: let go of it unread.
        discardBody(response);
        if (response.status < 300 || response.status >= 400 || location === null) {
          return undefined;
        }
        next = new URL(location, target).href;
      } catch (err) {
        this.options.log.warn({ reason: failureReason(err), hop }, 'could not follow a short link');
        return undefined;
      }
      if (readable(next)) return next;
      current = next;
    }
    return undefined;
  }
}

/** The address as one that may be requested while following a short link; undefined otherwise. */
function requestable(address: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return undefined;
  }
  const plain = url.protocol === 'https:' && url.port === '' && url.username === '';
  return plain && url.password === '' && LINK_HOSTS.has(url.hostname) ? url : undefined;
}
