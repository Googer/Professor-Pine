import { describe, expect, it } from 'vitest';
import { fakeTimeoutSignals } from '../../test/support/timers.js';
import { Tally } from '../../test/support/tally.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { readLocation } from '../domain/geo/location-input.js';
import { GoogleGeo, MAX_LINK_HOPS, type GeoFetch, type GeoResponse } from './geo-gateway.js';

const KEY = 'test-key-123+/=';
const POINT = { lat: 40.4406, lon: -79.9959 };

interface Call {
  url: string;
  init: Parameters<GeoFetch>[1];
}

/** A `fetch` that answers from a list and records what it was asked. Nothing leaves the test. */
function fakeFetch(answers: (GeoResponse | Error | 'hang')[]) {
  const calls: Call[] = [];
  const asked = new Tally('the requests to Google');
  let cancelled = 0;
  const fetch: GeoFetch = (url, init) => {
    calls.push({ url, init });
    asked.add();
    const answer = answers.shift();
    if (answer === undefined) return Promise.reject(new Error('no answer left'));
    if (answer instanceof Error) return Promise.reject(answer);
    if (answer === 'hang') {
      return new Promise((_resolve, reject) => {
        if (init.signal.aborted) reject(new Error('The operation was aborted'));
        init.signal.addEventListener('abort', () => {
          reject(new Error('The operation was aborted'));
        });
      });
    }
    return Promise.resolve({
      ...answer,
      body: {
        cancel: () => {
          cancelled += 1;
          return Promise.resolve();
        },
      },
    });
  };
  return { fetch, calls, asked, cancelledBodies: () => cancelled };
}

function json(body: unknown, status = 200): GeoResponse {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  };
}

function redirect(location: string | null, status = 302): GeoResponse {
  return {
    status,
    headers: { get: (name) => (name.toLowerCase() === 'location' ? location : null) },
    json: () => Promise.reject(new Error('the body of a redirect must not be read')),
  };
}

function geo(answers: (GeoResponse | Error | 'hang')[], options: { apiKey?: string } = {}) {
  const { log, entries } = createTestLogger();
  const faked = fakeFetch(answers);
  const clock = { now: 1_000_000 };
  const gateway = new GoogleGeo({
    apiKey: 'apiKey' in options ? options.apiKey : KEY,
    fetch: faked.fetch,
    log,
    now: () => clock.now,
    linkTimeoutMs: 40,
  });
  return { gateway, entries, clock, ...faked };
}

const logged = (entries: readonly unknown[]): string => JSON.stringify(entries);
/** The entries at pino's level for warnings. */
const warnings = (entries: ReadonlyArray<Record<string, unknown>>) =>
  entries.filter((entry) => entry.level === 40);
const readable = (address: string): boolean => readLocation(address).kind === 'point';

describe('GoogleGeo: reverse geocoding', () => {
  const answer = {
    status: 'OK',
    results: [
      {
        address_components: [
          { long_name: 'Maple Avenue', short_name: 'Maple Ave', types: ['route'] },
        ],
      },
    ],
  };

  it('asks the Geocoding API for the point and reads the address parts', async () => {
    const { gateway, calls } = geo([json(answer)]);
    await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({
      ok: true,
      value: { route: 'Maple Ave' },
    });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]?.url ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://maps.googleapis.com/maps/api/geocode/json',
    );
    expect(url.searchParams.get('latlng')).toBe('40.4406,-79.9959');
    expect(url.searchParams.get('key')).toBe(KEY);
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('asks nothing without a key', async () => {
    for (const apiKey of [undefined, '']) {
      const { gateway, calls } = geo([], { apiKey });
      expect(gateway.enabled).toBe(false);
      await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({ ok: false, reason: 'no-key' });
      await expect(gateway.placesNear(POINT, 100)).resolves.toEqual({
        ok: false,
        reason: 'no-key',
      });
      expect(calls).toEqual([]);
    }
  });

  it('logs a failure without the address and without the key', async () => {
    const failure = new TypeError('fetch failed', {
      cause: new Error(`connect ECONNREFUSED https://maps.googleapis.com/?key=${KEY}`),
    });
    const { gateway, entries } = geo([failure, json({ status: 'OVER_QUERY_LIMIT' })]);
    await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({ ok: false, reason: 'failed' });
    await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(warnings(entries)).toHaveLength(2);
    expect(logged(entries)).not.toContain(KEY);
    expect(logged(entries)).not.toContain(encodeURIComponent(KEY));
    expect(logged(entries)).toContain('OVER_QUERY_LIMIT');
  });

  it('lets go of the body of a 403 unread', async () => {
    const { gateway, cancelledBodies } = geo([json({ error: 'forbidden' }, 403)]);
    await expect(gateway.reverseGeocode(POINT)).resolves.toMatchObject({ reason: 'denied' });
    expect(cancelledBodies()).toBe(1);
    const places = geo([json({ error: 'forbidden' }, 403)]);
    await expect(places.gateway.placesNear(POINT, 100)).resolves.toMatchObject({
      reason: 'denied',
    });
    expect(places.cancelledBodies()).toBe(1);
  });

  it('remembers a refused key for an hour, and says so once', async () => {
    const refusal = json({
      status: 'REQUEST_DENIED',
      error_message: `The key ${KEY} is not allowed`,
    });
    const { gateway, calls, entries, clock } = geo([refusal, json(answer)]);
    await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({
      ok: false,
      reason: 'denied',
      retryInMs: 3_600_000,
    });
    clock.now += 600_000;
    // It says how long it is still left alone.
    await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({
      ok: false,
      reason: 'denied',
      retryInMs: 3_000_000,
    });
    clock.now -= 600_000;
    expect(calls).toHaveLength(1);
    expect(warnings(entries)).toHaveLength(1);
    expect(logged(entries)).not.toContain(KEY);
    clock.now += 3_600_000;
    await expect(gateway.reverseGeocode(POINT)).resolves.toMatchObject({ ok: true });
    expect(calls).toHaveLength(2);
  });
});

describe('GoogleGeo: places', () => {
  const answer = {
    places: [
      { types: ['bakery'], displayName: { text: 'Corner Bakery' } },
      { types: ['route'], displayName: { text: 'Maple Avenue' } },
    ],
  };

  it('asks the Places API (New) with the key in a header and reads the names', async () => {
    const { gateway, calls } = geo([json(answer)]);
    await expect(gateway.placesNear(POINT, 150)).resolves.toEqual({
      ok: true,
      value: ['Corner Bakery'],
    });
    const [call] = calls;
    expect(call?.url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(call?.url).not.toContain(KEY);
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'places.displayName,places.types',
    });
    expect(JSON.parse(call?.init.body ?? '')).toEqual({
      maxResultCount: 20,
      languageCode: 'en',
      locationRestriction: {
        circle: { center: { latitude: 40.4406, longitude: -79.9959 }, radius: 150 },
      },
    });
  });

  it('reads an answer without places as none', async () => {
    const { gateway } = geo([json({})]);
    await expect(gateway.placesNear(POINT, 150)).resolves.toEqual({ ok: true, value: [] });
  });

  it('remembers a 403 for an hour, apart from the Geocoding API', async () => {
    const { gateway, calls, entries, clock } = geo([
      json({ error: { code: 403, status: 'PERMISSION_DENIED' } }, 403),
      json({ status: 'ZERO_RESULTS', results: [] }),
      json(answer),
    ]);
    await expect(gateway.placesNear(POINT, 150)).resolves.toMatchObject({ reason: 'denied' });
    await expect(gateway.placesNear(POINT, 150)).resolves.toMatchObject({ reason: 'denied' });
    expect(calls).toHaveLength(1);
    expect(warnings(entries)).toHaveLength(1);
    // The other API is still asked.
    await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({ ok: true, value: {} });
    clock.now += 3_599_999;
    await expect(gateway.placesNear(POINT, 150)).resolves.toEqual({
      ok: false,
      reason: 'denied',
      retryInMs: 1,
    });
    clock.now += 1;
    await expect(gateway.placesNear(POINT, 150)).resolves.toMatchObject({ ok: true });
  });

  it('answers another status and a broken connection as a failure', async () => {
    const { gateway, entries } = geo([json({}, 500), new Error('socket hang up')]);
    await expect(gateway.placesNear(POINT, 150)).resolves.toEqual({ ok: false, reason: 'failed' });
    await expect(gateway.placesNear(POINT, 150)).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(logged(entries)).toContain('HTTP 500');
    expect(logged(entries)).toContain('socket hang up');
  });
});

describe('GoogleGeo: short links', () => {
  const SHORT = 'https://maps.app.goo.gl/AbC123';
  const LONG =
    'https://www.google.com/maps/place/Big+Fountain/@40.5,-79.9,17z/data=!3d40.4406!4d-79.9959';

  it('gives the address a short link redirects to, without reading any body', async () => {
    const { gateway, calls, cancelledBodies } = geo([redirect(LONG)]);
    await expect(gateway.followShortLink(SHORT, readable)).resolves.toBe(LONG);
    expect(calls.map((call) => call.url)).toEqual([SHORT]);
    expect(calls[0]?.init).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(calls[0]?.init.headers).toBeUndefined();
    expect(cancelledBodies()).toBe(1);
  });

  it('follows on through addresses that say nothing yet, relative ones too', async () => {
    const { gateway, calls } = geo([
      redirect('https://maps.google.com/?cid=123', 301),
      redirect('/maps?cid=123&hl=en'),
      redirect(LONG, 307),
    ]);
    await expect(gateway.followShortLink(SHORT, readable)).resolves.toBe(LONG);
    expect(calls.map((call) => call.url)).toEqual([
      SHORT,
      'https://maps.google.com/?cid=123',
      'https://maps.google.com/maps?cid=123&hl=en',
    ]);
  });

  it.each([
    ['another host', 'https://consent.example.com/?continue=x'],
    ['a host that only looks like Google', 'https://www.google.com.evil.example/maps'],
    ['plain http', 'http://www.google.com/maps?cid=1'],
    ['another port', 'https://www.google.com:8443/maps?cid=1'],
    ['an address with a user in it', 'https://user@www.google.com/maps?cid=1'],
  ])('never requests %s', async (_what, address) => {
    const { gateway, calls } = geo([redirect(address), redirect(LONG)]);
    await expect(gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
    expect(calls.map((call) => call.url)).toEqual([SHORT]);
  });

  it('does not request a first address that is not a short link of the hosts it follows', async () => {
    const { gateway, calls } = geo([redirect(LONG)]);
    await expect(
      gateway.followShortLink('https://example.com/short', readable),
    ).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('gives up after five addresses', async () => {
    const hop = (n: number) => `https://www.google.com/maps?cid=${n}`;
    const { gateway, calls } = geo(Array.from({ length: 8 }, (_, n) => redirect(hop(n))));
    await expect(gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
    expect(calls).toHaveLength(MAX_LINK_HOPS);
  });

  it('gives up on an answer that is no redirect, or names no address', async () => {
    const page = geo([json('<html>', 200)]);
    await expect(page.gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
    expect(page.cancelledBodies()).toBe(1);
    const nowhere = geo([redirect(null)]);
    await expect(nowhere.gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
    const garbled = geo([redirect('https://')]);
    await expect(garbled.gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
  });

  it('gives up when the hops together take longer than allowed', async () => {
    const timeouts = fakeTimeoutSignals();
    const { gateway, calls, asked, entries } = geo([
      redirect('https://maps.google.com/?cid=1'),
      'hang',
    ]);
    const following = gateway.followShortLink(SHORT, readable);
    // The second hop hangs; then the time for the whole way is up.
    await asked.reached(2);
    timeouts.expire();
    await expect(following).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
    // One limit for the whole way: the second request got the signal of the first.
    expect(calls[1]?.init.signal).toBe(calls[0]?.init.signal);
    expect(entries.some((entry) => entry.msg === 'could not follow a short link')).toBe(true);
  });

  it('answers a broken connection as no address', async () => {
    const { gateway } = geo([new Error('getaddrinfo ENOTFOUND maps.app.goo.gl')]);
    await expect(gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
  });
});
