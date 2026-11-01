import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { readRocketFeed } from '../../test/support/rocket.js';
import { listedChoice } from '../../test/support/rocket-store-cases.js';
import { MemoryRocketLineups } from '../../test/support/rocket-store.js';
import { jsonResponse } from '../../test/support/responses.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { lineupPictureSources } from '../domain/stops/pictures.js';
import { PINE_USER_AGENT, type FetchPage } from './research-task-service.js';
import { MAX_ROCKET_FEED_BYTES, RocketLineupService } from './rocket-lineup-service.js';

const URL = 'https://scrapedduck.example.test/rocketLineups.min.json';
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 22, 8);

/** A service over the kept list in memory, reading what `answer` gives, at `clock.now`. */
function serviceWith(answer: () => ReturnType<FetchPage>, store = new MemoryRocketLineups()) {
  const { log, entries } = createTestLogger();
  const clock = { now: NOW };
  const asked: { url: string; headers: Record<string, string> }[] = [];
  const prepared: string[][] = [];
  /** Whether each `prepare` was a background one's (branch review W5). */
  const inBackground: boolean[] = [];
  const service = new RocketLineupService({
    pictures: {
      prepare: (sources, how) => {
        prepared.push([...sources]);
        inBackground.push(how?.background === true);
        return Promise.resolve();
      },
    },
    url: URL,
    refreshMs: 6 * HOUR,
    staleAfterMs: 24 * HOUR,
    store,
    gameData: { catalogue: catalogueFixture() },
    fetch: (url, init) => {
      asked.push({ url, headers: init.headers });
      return answer();
    },
    log,
    now: () => clock.now,
  });
  const said = (msg: string) => entries.filter((entry) => entry.msg === msg).length;
  return { service, store, clock, asked, said, prepared, inBackground };
}

const feed = (body: unknown = readRocketFeed(), options: { status?: number; raw?: string } = {}) =>
  Promise.resolve({ ...jsonResponse(body, options), ok: (options.status ?? 200) < 300 });

/** The feed with only its first `n` lineups (Giovanni, Cliff, Arlo, …). */
const firstOf = (n: number): unknown => (readRocketFeed() as unknown[]).slice(0, n);

describe('RocketLineupService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('catches up at once after a failed read, and only then (plan 8X-H)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let answer = () => feed();
    const { service, asked } = serviceWith(() => answer());
    expect(await service.catchUp()).toBe('not-owed');
    answer = () => Promise.reject(new TypeError('fetch failed'));
    service.start();
    await vi.advanceTimersToNextTimerAsync();
    await service.whenIdle();
    expect(asked).toHaveLength(1);
    answer = () => feed();
    expect(await service.catchUp()).toBe('done');
    expect(asked).toHaveLength(2);
    expect(await service.catchUp()).toBe('not-owed');
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(6 * HOUR - 1);
    expect(asked).toHaveLength(2);
    service.stop();
  });

  it('reads the feed with Pine’s User-Agent and keeps the list in the database', async () => {
    const { service, store, asked } = serviceWith(() => feed());
    expect(service.choices()).toEqual([]);
    expect(await service.refresh()).toEqual({ status: 'updated', choices: 24 });
    expect(asked).toEqual([
      { url: URL, headers: { Accept: 'application/json', 'User-Agent': PINE_USER_AGENT } },
    ]);
    expect(service.readAt()).toBe(NOW);
    expect(service.byKey('grunt:water')?.name).toBe('Water-type grunt');
    expect(service.byKey('grunt:shadow')).toBeUndefined();
    expect((await store.kept()).choices).toHaveLength(24);
  });

  it('starts with the list of the last run, without the network', async () => {
    const store = new MemoryRocketLineups();
    await store.replace([listedChoice('leader:arlo')], NOW - HOUR);
    const { service } = serviceWith(() => Promise.reject(new Error('no network')), store);
    await service.load();
    expect(service.choices().map((choice) => choice.name)).toEqual(['Arlo']);
    expect(service.readAt()).toBe(NOW - HOUR);
  });

  it('has the pictures of the lineups it takes made square, without waiting for them (plan 8M-9B)', async () => {
    const store = new MemoryRocketLineups();
    await store.replace([listedChoice('leader:arlo')], NOW - HOUR);
    const { service, prepared, inBackground } = serviceWith(() => feed(), store);
    await service.load();
    expect(prepared).toEqual([lineupPictureSources(service.choices())]);
    await service.refresh();
    expect(prepared).toHaveLength(2);
    expect(prepared[1]).toEqual(lineupPictureSources(service.choices()));
    expect(prepared[1]?.length).toBeGreaterThan(20);
    // Behind the pictures a post or a DM waits for (branch review W5).
    expect(inBackground).toEqual([true, true]);
  });

  it('keeps its list when the feed lists fewer than half the choices, and says so', async () => {
    let body: unknown = readRocketFeed();
    const { service, clock, said } = serviceWith(() => feed(body));
    await service.refresh();
    body = firstOf(4);
    clock.now += HOUR;
    expect(await service.refresh()).toEqual({ status: 'kept', choices: 24, read: 4 });
    expect(service.choices()).toHaveLength(24);
    expect(
      said('the Rocket lineups list fewer than half the choices they did; the list is kept'),
    ).toBe(1);
  });

  it('takes a smaller list when the next read lists the same choices', async () => {
    let body: unknown = readRocketFeed();
    const { service, clock } = serviceWith(() => feed(body));
    await service.refresh();
    body = firstOf(4);
    clock.now += 6 * HOUR;
    expect(await service.refresh()).toMatchObject({ status: 'kept' });
    // Another small list is no agreement: it waits for one more read.
    body = firstOf(3);
    clock.now += 6 * HOUR;
    expect(await service.refresh()).toMatchObject({ status: 'kept' });
    clock.now += 6 * HOUR;
    expect(await service.refresh()).toEqual({ status: 'updated', choices: 3 });
    expect(service.choices().map((choice) => choice.name)).toEqual(['Cliff', 'Arlo', 'Giovanni']);
  });

  it('takes a smaller list once the list in use is older than staleAfterHours', async () => {
    let body: unknown = readRocketFeed();
    const { service, clock, said } = serviceWith(() => feed(body));
    await service.refresh();
    body = firstOf(4);
    clock.now += 24 * HOUR;
    expect(await service.refresh()).toEqual({ status: 'updated', choices: 4 });
    expect(said('the Rocket lineups are out of date')).toBe(0);
  });

  it('never empties its list: a refusal, no lineup, not JSON, too large', async () => {
    let answer: () => ReturnType<FetchPage> = () => feed();
    const { service, clock } = serviceWith(() => answer());
    await service.refresh();
    answer = () => feed(null, { status: 503 });
    expect(await service.refresh()).toMatchObject({
      status: 'failed',
      reason: `${URL} answered 503`,
    });
    answer = () => feed([]);
    clock.now += 48 * HOUR;
    expect(await service.refresh()).toMatchObject({ status: 'failed' });
    expect(await service.refresh()).toMatchObject({ status: 'failed' });
    answer = () => feed(null, { raw: '<html>Maintenance</html>' });
    expect(await service.refresh()).toMatchObject({
      status: 'failed',
      reason: `${URL}: the feed is unreadable`,
    });
    answer = () => feed(null, { raw: 'x'.repeat(MAX_ROCKET_FEED_BYTES + 1) });
    expect(await service.refresh()).toMatchObject({
      status: 'failed',
      reason: `${URL}: the feed is too-large`,
    });
    expect(service.choices()).toHaveLength(24);
  });

  it('says once that the list is out of date, until a read succeeds again', async () => {
    let fails = false;
    const { service, clock, said } = serviceWith(() =>
      fails ? Promise.reject(new Error('down')) : feed(),
    );
    await service.refresh();
    fails = true;
    clock.now += 23 * HOUR;
    await service.refresh();
    expect(said('the Rocket lineups are out of date')).toBe(0);
    clock.now += 2 * HOUR;
    await service.refresh();
    await service.refresh();
    expect(said('the Rocket lineups are out of date')).toBe(1);
    fails = false;
    await service.refresh();
    expect(said('Rocket lineups read')).toBe(2);
  });

  it('says whether its list is out of date by the rule the log follows (plan 8R-3: the map)', async () => {
    const { service } = serviceWith(() => feed());
    // Never read: out of date.
    expect(service.stale(NOW)).toBe(true);
    await service.refresh();
    expect(service.stale(NOW + 24 * HOUR - 1)).toBe(false);
    expect(service.stale(NOW + 24 * HOUR)).toBe(true);
  });

  it('reads at start only when its list is older than the refresh, then every refresh', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = new MemoryRocketLineups();
    await store.replace([listedChoice('leader:arlo')], NOW - 5 * HOUR);
    const { service, asked } = serviceWith(() => feed(), store);
    await service.load();
    service.start();
    await vi.advanceTimersByTimeAsync(HOUR / 2);
    expect(asked).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(HOUR / 2);
    await service.whenIdle();
    expect(asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(6 * HOUR);
    await service.whenIdle();
    expect(asked).toHaveLength(2);
    service.stop();
  });
});
