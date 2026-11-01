import { describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../../test/support/responses.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { LimitedResponse } from './limited-json.js';
import { NominatimSearch, type PlaceFetch } from './place-search.js';

const BOX = { south: 40, north: 41, west: -80.5, east: -79 };
const SERVER = { url: 'https://nominatim.example.test/', userAgent: 'Pine test' };

const ANSWER = [
  {
    display_name: 'Schenley Park, Pittsburgh',
    lat: '40.43',
    lon: '-79.94',
    geojson: { type: 'Point', coordinates: [-79.94, 40.43] },
  },
];

function setup(
  answer: (url: string) => Promise<LimitedResponse> = () => Promise.resolve(jsonResponse(ANSWER)),
  options: { server?: typeof SERVER | undefined; maxWaiting?: number } = {},
) {
  const { log, entries } = createTestLogger();
  const fetch = vi.fn<PlaceFetch>(answer);
  const clock = { now: 1_000_000 };
  const waits: number[] = [];
  const search = new NominatimSearch({
    server: 'server' in options ? options.server : SERVER,
    fetch,
    log,
    now: () => clock.now,
    // Waiting moves the clock on at once.
    sleep: (ms) => {
      waits.push(ms);
      clock.now += ms;
      return Promise.resolve();
    },
    ...(options.maxWaiting === undefined ? {} : { maxWaiting: options.maxWaiting }),
  });
  return { search, fetch, entries, clock, waits };
}

describe('NominatimSearch', () => {
  it('searches the server with the installation’s User-Agent, within the box', async () => {
    const made = setup();
    const outcome = await made.search.search('Schenley  Park', BOX);
    expect(outcome).toEqual({
      ok: true,
      place: {
        name: 'Schenley Park, Pittsburgh',
        shape: { kind: 'point', point: { lat: 40.43, lon: -79.94 } },
      },
      found: 1,
    });
    const [url, init] = made.fetch.mock.calls[0] ?? [];
    const address = new URL(url ?? '');
    expect(`${address.origin}${address.pathname}`).toBe('https://nominatim.example.test/search');
    expect(address.searchParams.get('q')).toBe('schenley park');
    expect(address.searchParams.get('bounded')).toBe('1');
    expect(address.searchParams.get('viewbox')).toBe('-80.5,41,-79,40');
    expect(init?.headers['User-Agent']).toBe('Pine test');
    expect(init?.redirect).toBe('error');
    // What members search for is never logged.
    expect(JSON.stringify(made.entries)).not.toMatch(/schenley/i);
  });

  it('answers and keeps only the largest place found, with how many were', async () => {
    const ring = [
      [-80, 40],
      [-79.9, 40],
      [-79.9, 40.1],
      [-80, 40],
    ];
    const made = setup(() =>
      Promise.resolve(
        jsonResponse([
          ...ANSWER,
          {
            display_name: 'Schenley Park Area',
            lat: '40.05',
            lon: '-79.95',
            geojson: { type: 'Polygon', coordinates: [ring] },
          },
        ]),
      ),
    );
    const outcome = await made.search.search('Schenley Park', BOX);
    expect(outcome.ok && outcome.place?.name).toBe('Schenley Park Area');
    expect(outcome.ok && outcome.found).toBe(2);
    expect(await made.search.search('Schenley Park', BOX)).toEqual(outcome);
    expect(made.fetch).toHaveBeenCalledTimes(1);
    const none = setup(() => Promise.resolve(jsonResponse([])));
    expect(await none.search.search('Nowhere', BOX)).toEqual({
      ok: true,
      place: undefined,
      found: 0,
    });
  });

  it.each([429, 403])('pauses ten minutes after Nominatim answers %i', async (status) => {
    let answer = status;
    const made = setup(() => Promise.resolve(jsonResponse(ANSWER, { status: answer })));
    expect(await made.search.search('Park', BOX)).toEqual({ ok: false, reason: 'paused', status });
    answer = 200;
    made.clock.now += 9 * 60_000;
    expect(await made.search.search('Garden', BOX)).toEqual({ ok: false, reason: 'paused' });
    expect(made.fetch).toHaveBeenCalledTimes(1);
    made.clock.now += 60_000;
    expect((await made.search.search('Garden', BOX)).ok).toBe(true);
    expect(made.fetch).toHaveBeenCalledTimes(2);
  });

  it('sends no search that waited for its turn while a pause began', async () => {
    const clock = { now: 1_000_000 };
    let release: (() => void) | undefined;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetch = vi.fn<PlaceFetch>(() => Promise.resolve(jsonResponse({}, { status: 429 })));
    const search = new NominatimSearch({
      server: SERVER,
      fetch,
      log: createTestLogger().log,
      now: () => clock.now,
      sleep: (ms) =>
        turn.then(() => {
          clock.now += ms;
        }),
    });
    const first = search.search('Park', BOX);
    const second = search.search('Garden', BOX);
    expect(await first).toEqual({ ok: false, reason: 'paused', status: 429 });
    release?.();
    expect(await second).toEqual({ ok: false, reason: 'paused' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps fifty answers at most', async () => {
    const made = setup();
    for (let i = 0; i <= 50; i += 1) await made.search.search(`Place ${String(i)}`, BOX);
    expect(made.fetch).toHaveBeenCalledTimes(51);
    await made.search.search('Place 50', BOX);
    expect(made.fetch).toHaveBeenCalledTimes(51);
    await made.search.search('Place 0', BOX);
    expect(made.fetch).toHaveBeenCalledTimes(52);
  });

  it('is switched off without a server', async () => {
    const made = setup(undefined, { server: undefined });
    expect(made.search.enabled).toBe(false);
    expect(await made.search.search('Park', BOX)).toEqual({ ok: false, reason: 'disabled' });
    expect(made.fetch).not.toHaveBeenCalled();
  });

  it('keeps an answer for a day, the same search in another box apart', async () => {
    const made = setup();
    await made.search.search('Schenley Park', BOX);
    await made.search.search('schenley park ', BOX);
    expect(made.fetch).toHaveBeenCalledTimes(1);
    await made.search.search('Schenley Park', { ...BOX, south: 39 });
    expect(made.fetch).toHaveBeenCalledTimes(2);
    made.clock.now += 86_400_000;
    await made.search.search('Schenley Park', BOX);
    expect(made.fetch).toHaveBeenCalledTimes(3);
  });

  it('starts one request a second at most, and tells the eleventh waiting that it is busy', async () => {
    const made = setup(undefined, { maxWaiting: 2 });
    await made.search.search('One', BOX);
    await made.search.search('Two', BOX);
    expect(made.waits).toEqual([1_000]);
    made.clock.now += 5_000;
    await made.search.search('Three', BOX);
    expect(made.waits).toEqual([1_000]);
    // Three at once: the first goes, two wait, one more is turned away.
    const slow = setup(undefined, { maxWaiting: 2 });
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = new NominatimSearch({
      server: SERVER,
      fetch: () => Promise.resolve(jsonResponse(ANSWER)),
      log: createTestLogger().log,
      now: () => slow.clock.now,
      sleep: () => held,
      maxWaiting: 2,
    });
    const first = waiting.search('a', BOX);
    const second = waiting.search('b', BOX);
    const third = waiting.search('c', BOX);
    expect(await waiting.search('d', BOX)).toEqual({ ok: false, reason: 'busy' });
    release?.();
    expect((await Promise.all([first, second, third])).every((outcome) => outcome.ok)).toBe(true);
  });

  it('fails into an answer, and keeps no failure', async () => {
    const refused = setup(() => Promise.resolve(jsonResponse({}, { status: 500 })));
    expect(await refused.search.search('Park', BOX)).toEqual({
      ok: false,
      reason: 'refused',
      status: 500,
    });
    await refused.search.search('Park', BOX);
    expect(refused.fetch).toHaveBeenCalledTimes(2);
    const odd = setup(() => Promise.resolve(jsonResponse({ error: 'Bad' })));
    expect(await odd.search.search('Park', BOX)).toEqual({ ok: false, reason: 'unreadable' });
    const down = setup(() => Promise.reject(new TypeError('fetch failed')));
    expect(await down.search.search('Park', BOX)).toEqual({ ok: false, reason: 'unreachable' });
    const slow = setup(() =>
      Promise.reject(Object.assign(new Error('late'), { name: 'TimeoutError' })),
    );
    expect(await slow.search.search('Park', BOX)).toEqual({ ok: false, reason: 'timeout' });
  });
});
