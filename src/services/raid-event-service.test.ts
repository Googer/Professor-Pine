import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeTimeoutSignals } from '../../test/support/timers.js';
import { at } from '../../test/support/max-bosses.js';
import { readMaxEventFeed } from '../../test/support/max-events.js';
import { featuredAt } from '../domain/time/max-events.js';
import { readRaidEventFeed } from '../../test/support/raid-events.js';
import { textAnswer } from '../../test/support/responses.js';
import { readSpawnEventFeed } from '../../test/support/spawn-events.js';
import { MAX_FINALE } from '../../test/support/event-reach.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { RaidEventService, type FetchEvents } from './raid-event-service.js';
import type { ResearchEventStorage } from '../db/repositories/research-event-repository.js';
import { MemoryResearchEvents } from '../../test/support/research-store.js';
import { MemoryMaxEvents } from '../../test/support/max-event-store.js';
import type { MaxEventStorage } from '../db/repositories/max-event-repository.js';
import type { ListedEventStorage } from '../db/repositories/listed-event-repository.js';
import { MemoryListedEvents } from '../../test/support/event-forum-store.js';
import { INTO_THE_WILD, PAWNIARD_DAY } from '../../test/support/research-store-cases.js';

const URL = 'https://example.test/events.json';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const downloaded = JSON.stringify(readRaidEventFeed());

type Response = Awaited<ReturnType<FetchEvents>>;

function reply(status: number, body = ''): Response {
  return textAnswer(status, body);
}

function service(
  fetch: FetchEvents,
  extra: {
    timeoutMs?: number;
    now?: () => number;
    url?: string;
    research?: ResearchEventStorage;
    maxEvents?: MaxEventStorage;
    listed?: ListedEventStorage;
  } = {},
) {
  const { log, entries } = createTestLogger();
  const events = new RaidEventService({
    url: extra.url ?? URL,
    refreshMs: 6 * HOUR,
    zone: 'America/New_York',
    fetch,
    log,
    ...extra,
  });
  return { events, entries };
}

describe('RaidEventService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has no events until the feed was read, then the Raid Hours and Raid Days of the feed', async () => {
    const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, downloaded)));
    const { events, entries } = service(fetch);
    expect(events.events()).toEqual([]);
    await expect(events.refresh()).resolves.toEqual({ status: 'updated', events: 5 });
    expect(events.events().map((event) => event.kind)).toEqual([
      'raid-hour',
      'raid-hour',
      'raid-hour',
      'raid-day',
      'raid-day',
    ]);
    expect(fetch).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ headers: { Accept: 'application/json' }, redirect: 'error' }),
    );
    expect(entries.find((entry) => entry.msg === 'raid events read')).toMatchObject({
      events: 5,
      max: events.maxEvents().length,
      big: events.bigEvents().length,
    });
    expect(entries.some((entry) => entry.msg === 'raid events read' && entry.events === 5)).toBe(
      true,
    );
  });

  it('catches up at once after a failed read, and only then (plan 8X-H)', async () => {
    let next: () => Promise<Response> = () => Promise.reject(new TypeError('fetch failed'));
    const fetch = vi.fn<FetchEvents>(() => next());
    const { events } = service(fetch);
    events.start();
    await vi.advanceTimersToNextTimerAsync();
    await events.whenIdle();
    expect(fetch).toHaveBeenCalledTimes(1);
    next = () => Promise.resolve(reply(200, downloaded));
    expect(await events.catchUp()).toBe('done');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(events.events()).toHaveLength(5);
    expect(await events.catchUp()).toBe('not-owed');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(6 * HOUR - 1);
    expect(fetch).toHaveBeenCalledTimes(2);
    events.stop();
  });

  it('keeps the events it has when the feed fails in any way', async () => {
    let next: () => Promise<Response> = () => Promise.resolve(reply(200, downloaded));
    const { events, entries } = service(() => next());
    await events.refresh();

    const failures: [() => Promise<Response>, string][] = [
      [() => Promise.resolve(reply(503)), 'answered 503'],
      [() => Promise.resolve(reply(200, '<html>')), 'did not send JSON'],
      [() => Promise.resolve(reply(200, '{"events":[]}')), 'not a list of events'],
      [() => Promise.resolve(reply(200, '[]')), 'not a list of events'],
      [() => Promise.resolve(reply(200, ' '.repeat(5_000_001))), 'not the events feed'],
      [
        () => Promise.reject(new TypeError('fetch failed', { cause: new Error('ENOTFOUND') })),
        'ENOTFOUND',
      ],
    ];
    for (const [answer, reason] of failures) {
      next = answer;
      const result = await events.refresh();
      expect(result).toMatchObject({ status: 'failed' });
      expect((result as { reason: string }).reason).toContain(reason);
      expect(events.events()).toHaveLength(5);
    }
    expect(entries.filter((entry) => entry.msg === 'could not read the events feed')).toHaveLength(
      failures.length,
    );
  });

  describe('events the feed no longer lists', () => {
    const DAY = 24 * HOUR;
    const raidHour = (name: string, start: string, end: string) => ({
      eventType: 'raid-hour',
      name,
      start,
      end,
    });
    const old = raidHour('Old Raid Hour', '2026-10-14T18:00:00.000', '2026-10-14T19:00:00.000');
    const kept = raidHour('Kept Raid Hour', '2026-10-21T18:00:00.000', '2026-10-21T19:00:00.000');
    const endOf = (item: { end: string }) => Date.parse(`${item.end}-04:00`);

    function feeds(...bodies: unknown[][]) {
      const answers = [...bodies];
      let last = '[]';
      return (): Promise<Response> => {
        const next = answers.shift();
        if (next) last = JSON.stringify(next);
        return Promise.resolve(reply(200, last));
      };
    }

    it('keeps an event that ended less than eight days ago, and drops it once it is older', async () => {
      let now = endOf(old) + 2 * DAY;
      const { events } = service(feeds([old, kept], [kept], [kept]), { now: () => now });
      await events.refresh();
      await events.refresh();
      expect(events.events().map((event) => event.name)).toEqual([
        'Old Raid Hour',
        'Kept Raid Hour',
      ]);

      now = endOf(old) + 8 * DAY + 1;
      await events.refresh();
      expect(events.events().map((event) => event.name)).toEqual(['Kept Raid Hour']);
    });

    it('drops an event that has not begun when the feed no longer lists it, and keeps one that has', async () => {
      const startOf = (item: { start: string }) => Date.parse(`${item.start}-04:00`);
      // `old` is in progress, `kept` is still to come, and `yesterday` ended a day ago.
      const yesterday = raidHour(
        'Yesterday Raid Hour',
        '2026-10-13T18:00:00.000',
        '2026-10-13T19:00:00.000',
      );
      const now = startOf(old) + 30 * MINUTE;
      const other = raidHour('Other', '2026-10-28T18:00:00.000', '2026-10-28T19:00:00.000');
      const { events } = service(feeds([yesterday, old, kept], [other]), { now: () => now });
      await events.refresh();
      expect(events.events()).toHaveLength(3);
      await events.refresh();
      // The feed now lists only a different event; of the three known before, the one that is
      // still to come is gone, and the finished and the running one stay.
      expect(events.events().map((event) => event.name)).toEqual([
        'Yesterday Raid Hour',
        'Old Raid Hour',
        'Other',
      ]);
    });

    it('replaces an event that has not begun by its corrected times', async () => {
      const moved = { ...kept, start: '2026-10-21T19:00:00.000', end: '2026-10-21T20:00:00.000' };
      const { events } = service(feeds([kept], [moved]), { now: () => endOf(old) });
      await events.refresh();
      await events.refresh();
      expect(events.events()).toHaveLength(1);
      expect(events.events()[0]?.start).toBe(Date.parse('2026-10-21T19:00:00.000-04:00'));
    });

    it('lists an event that is still in the feed once, with the name the feed gives now', async () => {
      const renamed = { ...old, name: 'Old Raid Hour (renamed)' };
      const { events } = service(feeds([old], [renamed]), { now: () => endOf(old) + DAY });
      await events.refresh();
      await events.refresh();
      expect(events.events().map((event) => event.name)).toEqual(['Old Raid Hour (renamed)']);
    });

    it('does not add events when a read fails', async () => {
      let fail = false;
      const { events } = service(
        () => Promise.resolve(fail ? reply(500) : reply(200, JSON.stringify([old]))),
        { now: () => endOf(old) + DAY },
      );
      await events.refresh();
      fail = true;
      await events.refresh();
      expect(events.events()).toHaveLength(1);
    });
  });

  it('gives up a download that takes too long', async () => {
    const fetch: FetchEvents = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        if (signal.aborted) reject(new Error('aborted'));
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const timeouts = fakeTimeoutSignals();
    const { events } = service(fetch, { timeoutMs: 20 });
    const refreshing = events.refresh();
    await timeouts.made.reached(1);
    timeouts.expire();
    await expect(refreshing).resolves.toEqual({
      status: 'failed',
      reason: `${URL}: timed out after 20 ms`,
    });
  });

  it('shares one download between calls made while it runs', async () => {
    const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, downloaded)));
    const { events } = service(fetch);
    await Promise.all([events.refresh(), events.refresh()]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reads the feed at once when started, then at the interval, sooner after a failure', async () => {
    let fail = false;
    const fetch = vi.fn<FetchEvents>(() =>
      Promise.resolve(fail ? reply(500) : reply(200, downloaded)),
    );
    const { events } = service(fetch);
    events.start();
    events.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(6 * HOUR - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    fail = true;
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);

    fail = false;
    await vi.advanceTimersByTimeAsync(15 * MINUTE);
    expect(fetch).toHaveBeenCalledTimes(3);
    events.stop();
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('ends a download in flight when stopped, without a warning, and is idle afterwards', async () => {
    const fetch: FetchEvents = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const { events, entries } = service(fetch);
    events.start();
    await vi.advanceTimersByTimeAsync(0);
    events.stop();
    await events.whenIdle();
    expect(entries.filter((entry) => entry.level === 40)).toEqual([]);
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(events.events()).toEqual([]);
  });

  // Plan 8X-2: the max events of the same feed, kept apart from the raid events.
  describe('the max events', () => {
    const maxFeed = JSON.stringify(readMaxEventFeed());

    it('keeps the max events of a read apart, and says once a read which hours it assumed', async () => {
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, maxFeed)));
      const { events, entries } = service(fetch, { now: () => at('2026-10-20T22:00') });
      expect(events.maxEvents()).toEqual([]);
      await expect(events.refresh()).resolves.toEqual({ status: 'updated', events: 1 });
      expect(events.events().map((event) => event.name)).toEqual(['Palkia Raid Hour']);
      expect(events.maxEvents()).toHaveLength(7);
      const assumed = entries.filter((entry) => entry.msg === 'max event hours assumed');
      expect(assumed).toHaveLength(1);
      expect(assumed[0]).toMatchObject({ events: ['Dynamax Sneasel during Max Monday'] });
      await events.refresh();
      expect(entries.filter((entry) => entry.msg === 'max event hours assumed')).toHaveLength(2);
    });

    it('warns of a coming max event without hours it cannot assume, and not of a past one', async () => {
      const feed = JSON.stringify([
        {
          eventID: 'max-mondays-2026-10-19',
          eventType: 'max-mondays',
          name: 'Dynamax Abra during Max Monday',
          start: null,
          end: null,
        },
        {
          eventID: 'max-mondays-2026-10-26',
          eventType: 'max-mondays',
          name: 'Dynamax Ralts during Max Monday',
          start: null,
          end: null,
        },
        {
          eventID: 'max-battles-x',
          eventType: 'max-battles',
          name: 'Dynamax Lugia Max Battle Weekend',
          start: null,
          end: null,
        },
      ]);
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, feed)));
      const { events, entries } = service(fetch, { now: () => at('2026-10-20T22:00') });
      await events.refresh();
      const warned = entries.filter(
        (entry) => entry.msg === 'max events without hours feature nothing',
      );
      expect(warned).toHaveLength(1);
      expect(warned[0]).toMatchObject({ events: ['Dynamax Ralts during Max Monday'] });
      expect(events.maxEvents()).toEqual([]);
    });

    it('keeps the max events it has when a read fails', async () => {
      let fail = false;
      const fetch = vi.fn<FetchEvents>(() =>
        Promise.resolve(fail ? reply(500) : reply(200, maxFeed)),
      );
      const { events } = service(fetch, { now: () => at('2026-10-20T22:00') });
      await events.refresh();
      fail = true;
      await events.refresh();
      expect(events.maxEvents()).toHaveLength(7);
    });

    it('keeps one copy of a running event the feed renames or moves: the newest', async () => {
      const all = readMaxEventFeed() as { eventID: string; name: string; start: string | null }[];
      let body = maxFeed;
      let now = at('2026-10-26T12:00');
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, body)));
      const { events } = service(fetch, { now: () => now });
      await events.refresh();
      now = at('2026-10-28T12:00');
      body = JSON.stringify(
        all.map((event) =>
          event.eventID === 'max-mondays-2026-10-26'
            ? {
                ...event,
                name: 'Dynamax Sableye and Machop during Max Monday',
                start: '2026-10-26T07:00:00.000',
              }
            : event,
        ),
      );
      await events.refresh();
      const sableye = events.maxEvents().filter((event) => event.id === 'max-mondays-2026-10-26');
      expect(sableye.map((event) => event.name)).toEqual([
        'Dynamax Sableye and Machop during Max Monday',
      ]);
      expect(featuredAt(events.maxEvents(), now, 'America/New_York')).toEqual([
        { event: sableye[0], until: at('2026-11-02T06:00') },
      ]);
    });

    it("keeps a Max Monday the feed drops once it is over, so its boss stays the week's", async () => {
      const all = readMaxEventFeed() as { name: string }[];
      const without = (...names: string[]) =>
        JSON.stringify(all.filter((event) => !names.includes(event.name)));
      let body = maxFeed;
      let now = at('2026-10-26T12:00');
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, body)));
      const { events } = service(fetch, { now: () => now });
      await events.refresh();
      // Wednesday: the feed no longer lists Sableye's Monday, nor Machop's, which is moved away.
      now = at('2026-10-28T12:00');
      body = without('Dynamax Sableye during Max Monday', 'Dynamax Machop during Max Monday');
      await events.refresh();
      const names = events.maxEvents().map((event) => event.name);
      expect(names).toContain('Dynamax Sableye during Max Monday');
      expect(names).not.toContain('Dynamax Machop during Max Monday');
      const starts = events.maxEvents().map((event) => event.start);
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
      expect(
        featuredAt(events.maxEvents(), now, 'America/New_York').map(({ event }) => event.name),
      ).toEqual(['Dynamax Sableye during Max Monday']);
      // Eight days after its start it is forgotten.
      now = at('2026-11-03T06:00');
      body = without('Dynamax Sableye during Max Monday', 'Dynamax Sneasel during Max Monday');
      await events.refresh();
      expect(events.maxEvents().map((event) => event.name)).not.toContain(
        'Dynamax Sableye during Max Monday',
      );
    });
  });

  // Plan 8X-F (staging of 8X): ScrapedDuck dropped the 10-19 Max Monday within its week, and a
  // restart lost the week's featured boss.
  describe('the max and big events kept across a restart (plan 8X-F)', () => {
    const full = () => readMaxEventFeed() as { eventID?: string; name: string }[];
    const without = (...ids: string[]) =>
      JSON.stringify(full().filter((event) => !ids.includes(event.eventID ?? '')));

    it('keeps those of each read, and gives the kept ones after a restart, before any read', async () => {
      const store = new MemoryMaxEvents();
      const feed = JSON.stringify(full());
      const { events } = service(() => Promise.resolve(reply(200, feed)), {
        maxEvents: store,
        now: () => at('2026-10-20T22:00'),
      });
      await events.refresh();
      expect(await store.all()).toEqual({ max: events.maxEvents(), big: events.bigEvents() });
      expect(events.maxEvents()).toHaveLength(7);

      const again = service(() => Promise.reject(new Error('down')), { maxEvents: store });
      await again.events.loadMax();
      expect(again.events.maxEvents()).toEqual(events.maxEvents());
      expect(again.events.bigEvents()).toEqual(events.bigEvents());
      // Plan 8X-G (staging of 8X-F, M3): a load says what it loaded, as the other loads do.
      expect(again.entries.find((entry) => entry.msg === 'max events loaded')).toMatchObject({
        max: 7,
        big: events.bigEvents().length,
      });
    });

    it("keeps the week's featured boss after a restart once the feed dropped its Monday", async () => {
      const store = new MemoryMaxEvents();
      let body = JSON.stringify(full());
      let now = at('2026-10-26T12:00');
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, body)));
      const first = service(fetch, { maxEvents: store, now: () => now });
      await first.events.refresh();
      // Thursday, after a restart: the feed no longer lists Sableye's Monday.
      now = at('2026-10-29T12:00');
      body = without('max-mondays-2026-10-26');
      const { events } = service(fetch, { maxEvents: store, now: () => now });
      await events.loadMax();
      await events.refresh();
      expect(
        featuredAt(events.maxEvents(), now, 'America/New_York').map(({ event }) => event.name),
      ).toEqual(['Dynamax Sableye during Max Monday']);
      // Eight days after its start it is forgotten, also by the store.
      now = at('2026-11-03T06:00');
      await events.refresh();
      const kept = (await store.all()).max.map((event) => event.id);
      expect(kept).not.toContain('max-mondays-2026-10-26');
      expect(events.maxEvents().map((event) => event.id)).not.toContain('max-mondays-2026-10-26');
    });

    it('forgets a kept event not begun that the read no longer lists, and a big one once over', async () => {
      const store = new MemoryMaxEvents();
      let body = JSON.stringify(full());
      let now = at('2026-11-14T12:00');
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, body)));
      const first = service(fetch, { maxEvents: store, now: () => now });
      await first.events.refresh();
      const wild = 'pokemon-go-wild-area-2026-global';
      const cryogonal = 'max-mondays-2026-11-30';
      // After a restart: Cryogonal's Monday moved away, the Wild Area dropped while it is on.
      now = at('2026-11-15T09:00');
      body = without(cryogonal, wild);
      const { events } = service(fetch, { maxEvents: store, now: () => now });
      await events.loadMax();
      await events.refresh();
      expect(events.maxEvents().map((event) => event.id)).not.toContain(cryogonal);
      expect(events.bigEvents().map((event) => event.id)).toContain(wild);
      expect((await store.all()).big.map((event) => event.id)).toContain(wild);
      // Once the Wild Area is over, a read forgets it.
      now = at('2026-11-15T19:00');
      await events.refresh();
      expect((await store.all()).big.map((event) => event.id)).not.toContain(wild);
      expect((await store.all()).max.map((event) => event.id)).not.toContain(cryogonal);
    });

    it('takes a read made before the kept events were loaded over the kept copy', async () => {
      const store = new MemoryMaxEvents({ max: [], big: [] });
      const feed = JSON.stringify(full());
      const { events } = service(() => Promise.resolve(reply(200, feed)), {
        maxEvents: store,
        now: () => at('2026-10-20T22:00'),
      });
      await events.refresh();
      const read = events.maxEvents();
      await store.replace({ max: [], big: [] });
      await events.loadMax();
      expect(events.maxEvents()).toEqual(read);
    });

    it('keeps the events of a read that cannot be stored, and says so', async () => {
      const store = new MemoryMaxEvents();
      store.failing.set('replace', new Error('database down'));
      const feed = JSON.stringify(full());
      const { events, entries } = service(() => Promise.resolve(reply(200, feed)), {
        maxEvents: store,
        now: () => at('2026-10-20T22:00'),
      });
      await expect(events.refresh()).resolves.toMatchObject({ status: 'updated' });
      expect(events.maxEvents()).toHaveLength(7);
      expect(
        entries.some(
          (entry) =>
            entry.level === 40 && entry.msg === 'could not keep the max events of the feed',
        ),
      ).toBe(true);
    });

    it('starts without kept events when they cannot be read, and says so', async () => {
      const store = new MemoryMaxEvents();
      store.failing.set('all', new Error('database down'));
      const { events, entries } = service(() => Promise.reject(new Error('down')), {
        maxEvents: store,
      });
      await events.loadMax();
      expect(events.maxEvents()).toEqual([]);
      expect(entries.some((entry) => entry.msg === 'could not read the kept max events')).toBe(
        true,
      );
    });
  });

  // Plan 8V-1: the events forum's listed events, of the same read, kept across a restart.
  describe('the listed events (plan 8V-1)', () => {
    const spawnFeed = () => readSpawnEventFeed() as { eventID: string; start: string | null }[];

    it('gives the listed events of each read, max events by their parsed hours, and tells its listeners', async () => {
      const store = new MemoryListedEvents();
      const feed = JSON.stringify(spawnFeed());
      const { events } = service(() => Promise.resolve(reply(200, feed)), {
        listed: store,
        now: () => at('2026-10-22T12:00'),
      });
      const told: number[] = [];
      events.onListedChange(() => told.push(events.listedEvents().length));
      expect(events.listedEvents()).toEqual([]);
      await events.refresh();
      const ids = events.listedEvents().map((event) => event.id);
      expect(ids).toContain('november-communityday2026');
      expect(ids).not.toContain('pokemon-tcg-30th-celebration');
      const monday = events.maxEvents().find((event) => event.id === 'max-mondays-2026-10-26');
      const line = events.listedEvents().find((event) => event.id === 'max-mondays-2026-10-26');
      expect(line && [line.start, line.end]).toEqual(monday && [monday.start, monday.end]);
      expect(await store.all()).toEqual(events.listedEvents());
      // Each read tells, changed or not: the forum draws after each read.
      await events.refresh();
      expect(told).toEqual([ids.length, ids.length]);
    });

    it('keeps them across a restart and a failed read, and merges the next read with them', async () => {
      const store = new MemoryListedEvents();
      let body = JSON.stringify(spawnFeed());
      let now = at('2026-11-10T12:00');
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, body)));
      const first = service(fetch, { listed: store, now: () => now });
      await first.events.refresh();
      // After a restart the feed fails: the kept listing stands.
      const down = service(() => Promise.resolve(reply(500)), { listed: store, now: () => now });
      const told: string[] = [];
      down.events.onListedChange(() => told.push('loaded'));
      await down.events.loadListed();
      await down.events.refresh();
      expect(down.events.listedEvents()).toEqual(first.events.listedEvents());
      expect(told).toEqual(['loaded']);
      expect(down.entries.find((entry) => entry.msg === 'listed events loaded')).toMatchObject({
        events: first.events.listedEvents().length,
      });
      // Into the Wild is on and the feed lists it without times; the Community Day is dropped.
      now = at('2026-11-11T12:00');
      body = JSON.stringify(
        spawnFeed()
          .filter((event) => event.eventID !== 'november-communityday2026')
          .map((event) =>
            event.eventID === 'into-the-wild-2026' ? { ...event, start: null, end: null } : event,
          ),
      );
      const { events, entries } = service(fetch, { listed: store, now: () => now });
      await events.loadListed();
      await events.refresh();
      const ids = events.listedEvents().map((event) => event.id);
      expect(ids).toContain('into-the-wild-2026');
      expect(ids).not.toContain('november-communityday2026');
      expect(
        entries.find((entry) => entry.msg === 'a listed event was dropped before its start'),
      ).toMatchObject({ event: 'november-communityday2026' });
    });

    it('says once that a kind is not known, and lists it', async () => {
      const showcase = {
        eventID: 'pokestop-showcase-2026-11-20',
        name: 'PokéStop Showcase',
        eventType: 'pokestop-showcase',
        start: '2026-11-20T10:00:00.000',
        end: '2026-11-21T20:00:00.000',
      };
      const feed = JSON.stringify([...spawnFeed(), showcase]);
      const { events, entries } = service(() => Promise.resolve(reply(200, feed)), {
        now: () => at('2026-11-10T12:00'),
      });
      await events.refresh();
      await events.refresh();
      expect(events.listedEvents().map((event) => event.id)).toContain(showcase.eventID);
      expect(
        entries.filter((entry) => entry.msg === 'an event type the events forum does not know'),
      ).toEqual([
        expect.objectContaining({
          level: 40,
          eventType: 'pokestop-showcase',
          event: showcase.eventID,
        }),
      ]);
    });

    it('keeps the listing of a read that cannot be stored, and one it cannot load, saying so', async () => {
      const store = new MemoryListedEvents();
      store.failing.set('replace', new Error('database down'));
      store.failing.set('all', new Error('database down'));
      const feed = JSON.stringify(spawnFeed());
      const { events, entries } = service(() => Promise.resolve(reply(200, feed)), {
        listed: store,
        now: () => at('2026-11-10T12:00'),
      });
      await events.loadListed();
      await expect(events.refresh()).resolves.toMatchObject({ status: 'updated' });
      expect(events.listedEvents().length).toBeGreaterThan(5);
      const said = entries.map((entry) => entry.msg);
      expect(said).toContain('could not read the kept listed events');
      expect(said).toContain('could not keep the listed events of the feed');
    });

    // Review V1: the forum neither drops nor posts before the listing is known.
    it('knows the listing once the kept events are loaded or a read succeeded, not before', async () => {
      const store = new MemoryListedEvents();
      const loaded = service(() => Promise.resolve(reply(500)), { listed: store });
      expect(loaded.events.listingKnown()).toBe(false);
      await loaded.events.refresh();
      expect(loaded.events.listingKnown()).toBe(false);
      await loaded.events.loadListed();
      expect(loaded.events.listingKnown()).toBe(true);
      const broken = new MemoryListedEvents();
      broken.failing.set('all', new Error('database down'));
      const feed = JSON.stringify(spawnFeed());
      const read = service(() => Promise.resolve(reply(200, feed)), {
        listed: broken,
        now: () => at('2026-11-10T12:00'),
      });
      await read.events.loadListed();
      expect(read.events.listingKnown()).toBe(false);
      await read.events.refresh();
      expect(read.events.listingKnown()).toBe(true);
    });

    // Branch review BR-1: an empty or short read keeps the listing and drops nothing.
    it('keeps the listing and drops nothing after a read that lists no event or drops every coming one', async () => {
      const store = new MemoryListedEvents();
      let body = JSON.stringify(spawnFeed());
      const { events, entries } = service(() => Promise.resolve(reply(200, body)), {
        listed: store,
        now: () => at('2026-11-10T12:00'),
      });
      await events.refresh();
      const before = events.listedEvents();
      expect(before.length).toBeGreaterThan(3);
      // Only what nobody lists.
      body = JSON.stringify(
        spawnFeed().filter((event) =>
          ['go-pass'].includes(String((event as { eventType?: string }).eventType)),
        ),
      );
      await events.refresh();
      expect(events.listedEvents()).toEqual(before);
      expect(events.droppedIds()).toEqual(new Set());
      // Only what is on now: every coming event would be dropped.
      body = JSON.stringify(spawnFeed().filter((event) => event.eventID === 'into-the-wild-2026'));
      await events.refresh();
      expect(events.listedEvents()).toEqual(before);
      expect(events.droppedIds()).toEqual(new Set());
      expect(await store.all()).toEqual(before);
      expect(
        entries.filter(
          (entry) => entry.msg === 'a short read of the events feed; the listing kept',
        ),
      ).toHaveLength(2);
    });

    // Re-review RR-1: a short read still brings what it adds.
    it('lists a new event a short read adds, keeping the coming one it would drop', async () => {
      const item = (eventID: string, eventType: string, start: string, end: string) => ({
        eventID,
        name: eventID,
        eventType,
        start,
        end,
      });
      const on = item('on-now', 'event', '2026-11-09T10:00:00.000', '2026-11-13T20:00:00.000');
      const day = item(
        'the-day',
        'community-day',
        '2026-11-21T14:00:00.000',
        '2026-11-21T17:00:00.000',
      );
      const added = item('added', 'event', '2026-11-28T10:00:00.000', '2026-11-29T20:00:00.000');
      let body = JSON.stringify([on, day]);
      const { events } = service(() => Promise.resolve(reply(200, body)), {
        now: () => at('2026-11-10T12:00'),
      });
      await events.refresh();
      body = JSON.stringify([on]);
      await events.refresh();
      body = JSON.stringify([on, added]);
      await events.refresh();
      expect(events.listedEvents().map((event) => event.id)).toEqual([
        'on-now',
        'the-day',
        'added',
      ]);
      expect(events.droppedIds()).toEqual(new Set());
    });

    it('names the events a read dropped before their start, until that start', async () => {
      let body = JSON.stringify(spawnFeed());
      let now = at('2026-11-10T12:00');
      const { events } = service(() => Promise.resolve(reply(200, body)), { now: () => now });
      await events.refresh();
      expect(events.droppedIds()).toEqual(new Set());
      body = JSON.stringify(
        spawnFeed().filter((event) => event.eventID !== 'november-communityday2026'),
      );
      await events.refresh();
      expect(events.droppedIds()).toEqual(new Set(['november-communityday2026']));
      now = at('2026-11-21T14:00');
      expect(events.droppedIds()).toEqual(new Set());
    });

    // Review V10 (ruling R5): one path, the max and big events as merged.
    it('takes a big event’s times from the merged big events, also one the read lists without times', async () => {
      const wild = 'pokemon-go-wild-area-2026-global';
      const now = at('2026-11-14T12:00');
      const full = readMaxEventFeed() as { eventID?: string; start?: string | null }[];
      const first = service(() => Promise.resolve(reply(200, JSON.stringify(full))), {
        maxEvents: new MemoryMaxEvents(),
        now: () => now,
      });
      await first.events.refresh();
      const kept = new MemoryMaxEvents({ big: [...first.events.bigEvents()] });
      const untimed = full.map((event) =>
        event.eventID === wild ? { ...event, start: null, end: null } : event,
      );
      const { events } = service(() => Promise.resolve(reply(200, JSON.stringify(untimed))), {
        maxEvents: kept,
        listed: new MemoryListedEvents(),
        now: () => now,
      });
      await events.loadMax();
      await events.loadListed();
      await events.refresh();
      const big = events.bigEvents().find((event) => event.id === wild);
      const line = events.listedEvents().find((event) => event.id === wild);
      expect(big).toBeDefined();
      expect(line && [line.start, line.end]).toEqual(big && [big.start, big.end]);
    });
  });

  // Plan 8X-3: the big events with Gigantamax battles all day, of the same feed.
  describe('the big events', () => {
    it('keeps the global editions of a read, and those it had when a read fails', async () => {
      let fail = false;
      const feed = JSON.stringify(readMaxEventFeed());
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(fail ? reply(500) : reply(200, feed)));
      const { events } = service(fetch, { now: () => at('2026-10-20T22:00') });
      expect(events.bigEvents()).toEqual([]);
      await events.refresh();
      const names = events.bigEvents().map((event) => event.name);
      expect(names).toEqual([
        'Pokémon GO Wild Area 2026: Global',
        'Pokémon GO Tour: Alola - Global 2027',
      ]);
      fail = true;
      await events.refresh();
      expect(events.bigEvents().map((event) => event.name)).toEqual(names);
    });

    // Review A of 8X-3, X3-B-5: ScrapedDuck may drop an event while it is on, as `mergedMax` keeps.
    it('keeps a big event that has begun while it lasts, though a read no longer lists it', async () => {
      const full = readMaxEventFeed() as { eventID?: string }[];
      const wild = 'pokemon-go-wild-area-2026-global';
      let feed = full;
      let now = at('2026-11-14T12:00');
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, JSON.stringify(feed))));
      const { events } = service(fetch, { now: () => now });
      await events.refresh();
      const ids = () => events.bigEvents().map((event) => event.id);
      expect(ids()).toContain(wild);
      // Dropped by the feed while it is on: still on.
      feed = full.filter((item) => item.eventID !== wild);
      now = at('2026-11-15T09:00');
      await events.refresh();
      expect(ids()).toContain(wild);
      // Once it is over, a read that does not list it forgets it.
      now = at('2026-11-15T19:00');
      await events.refresh();
      expect(ids()).not.toContain(wild);
      // One that has not begun and is no longer listed was moved or cancelled: it goes at once.
      const tour = 'pokemon-go-tour-alola-global-2027';
      feed = full;
      await events.refresh();
      expect(ids()).toContain(tour);
      feed = full.filter((item) => item.eventID !== tour);
      await events.refresh();
      expect(ids()).not.toContain(tour);
    });
  });

  describe('the events with spawns (plan 8R-4)', () => {
    const ids = (events: RaidEventService) => events.spawnEvents().map((event) => event.id);

    it('gives the global events with spawns of each read, in memory', async () => {
      const fetch = vi.fn<FetchEvents>(() =>
        Promise.resolve(reply(200, JSON.stringify(readSpawnEventFeed()))),
      );
      const { events } = service(fetch, { now: () => at('2026-10-22T12:00') });
      expect(events.spawnEvents()).toEqual([]);
      await events.refresh();
      expect(ids(events)).toEqual(
        expect.arrayContaining([
          'halloween-2026-part-1',
          'november-communityday2026',
          'pokemonspotlighthour2026-11-05',
        ]),
      );
      // The Global Wild Area counts (Matt's R-M5); a city's does not.
      expect(ids(events)).toContain('pokemon-go-wild-area-2026-global');
      expect(ids(events)).not.toContain('pokemon-go-wild-area-2026-sendai-japan');
    });

    it('keeps one on now that a read drops while it lasts, and drops one not begun', async () => {
      const full = readSpawnEventFeed() as { eventID?: string }[];
      let feed = full;
      let now = at('2026-10-28T12:00');
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, JSON.stringify(feed))));
      const { events } = service(fetch, { now: () => now });
      await events.refresh();
      feed = full.filter(
        (item) =>
          item.eventID !== 'halloween-2026-part-1' && item.eventID !== 'november-communityday2026',
      );
      await events.refresh();
      expect(ids(events)).toContain('halloween-2026-part-1');
      expect(ids(events)).not.toContain('november-communityday2026');
      now = at('2026-11-01T10:00');
      await events.refresh();
      expect(ids(events)).not.toContain('halloween-2026-part-1');
    });

    it('keeps what it has when a read has no flags, or fails', async () => {
      const full = readSpawnEventFeed() as { extraData?: unknown }[];
      let body = JSON.stringify(full);
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, body)));
      const { events } = service(fetch, { now: () => at('2026-10-28T12:00') });
      await events.refresh();
      const before = events.spawnEvents();
      expect(before.length).toBeGreaterThan(0);
      body = JSON.stringify(full.map(({ extraData: _dropped, ...rest }) => rest));
      await events.refresh();
      expect(events.spawnEvents()).toEqual(before);
      body = 'not json';
      await events.refresh();
      expect(events.spawnEvents()).toEqual(before);
    });
  });

  describe('the events with field research (plan 8R-1)', () => {
    it('keeps those of each read, as seen, and gives the kept ones after a restart', async () => {
      const store = new MemoryResearchEvents();
      const feed = JSON.stringify(readMaxEventFeed());
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, feed)));
      const now = at('2026-10-21T22:00');
      const { events } = service(fetch, { research: store, now: () => now });
      await events.refresh();
      expect(events.researchEvents()).toEqual([INTO_THE_WILD, PAWNIARD_DAY]);
      expect(await store.all()).toEqual([INTO_THE_WILD, PAWNIARD_DAY]);

      // A restart without the network: the kept ones.
      const again = service(() => Promise.reject(new Error('down')), { research: store });
      await again.events.loadResearch();
      expect(again.events.researchEvents()).toEqual([INTO_THE_WILD, PAWNIARD_DAY]);
    });

    it('keeps one the feed dropped once it ended, and forgets it a month after its end', async () => {
      const store = new MemoryResearchEvents();
      const full = readMaxEventFeed() as { eventID?: string }[];
      let feed = full;
      let now = at('2026-11-21T15:00');
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, JSON.stringify(feed))));
      const { events } = service(fetch, { research: store, now: () => now });
      await events.refresh();
      feed = full.filter((item) => item.eventID !== PAWNIARD_DAY.id);
      now = at('2026-11-21T18:00');
      await events.refresh();
      expect(events.researchEvents().map((event) => event.id)).toContain(PAWNIARD_DAY.id);
      now = at('2026-12-22T18:00');
      await events.refresh();
      expect(events.researchEvents().map((event) => event.id)).not.toContain(PAWNIARD_DAY.id);
      expect((await store.all()).map((event) => event.id)).not.toContain(PAWNIARD_DAY.id);
    });

    it('drops one not begun that the feed no longer lists, and tells its listeners (A4, A5)', async () => {
      const store = new MemoryResearchEvents();
      const full = readMaxEventFeed() as { eventID?: string }[];
      let feed = full;
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, JSON.stringify(feed))));
      const { events } = service(fetch, { research: store, now: () => at('2026-10-21T22:00') });
      const heard: string[][] = [];
      events.onResearchChange(() => heard.push(events.researchEvents().map((one) => one.id)));
      await events.refresh();
      expect(heard).toEqual([[INTO_THE_WILD.id, PAWNIARD_DAY.id]]);
      // The same read again changes nothing: nobody is told.
      await events.refresh();
      expect(heard).toHaveLength(1);
      feed = full.filter((item) => item.eventID !== PAWNIARD_DAY.id);
      await events.refresh();
      expect(events.researchEvents()).toEqual([INTO_THE_WILD]);
      expect(await store.all()).toEqual([INTO_THE_WILD]);
      expect(heard).toEqual([[INTO_THE_WILD.id, PAWNIARD_DAY.id], [INTO_THE_WILD.id]]);
    });

    it('keeps what it stored when neither feed has research flags, and says so once (R1)', async () => {
      const store = new MemoryResearchEvents([INTO_THE_WILD]);
      const bare = (readMaxEventFeed() as { extraData?: unknown }[]).map(
        ({ extraData: _dropped, ...rest }) => rest,
      );
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, JSON.stringify(bare))));
      const { events, entries } = service(fetch, {
        url: 'https://example.test/events.min.json',
        research: store,
        now: () => at('2026-10-21T22:00'),
      });
      await events.loadResearch();
      await events.refresh();
      await events.refresh();
      expect(events.researchEvents()).toEqual([INTO_THE_WILD]);
      expect(await store.all()).toEqual([INTO_THE_WILD]);
      expect(
        entries.filter((entry) => entry.msg === 'the events feed has no research flags; kept'),
      ).toHaveLength(1);
    });

    it('reads events.json for them when events.min.json has no research flags', async () => {
      const store = new MemoryResearchEvents();
      const full = readMaxEventFeed() as { extraData?: unknown }[];
      const bare = full.map(({ extraData: _dropped, ...rest }) => rest);
      const asked: string[] = [];
      const fetch = vi.fn<FetchEvents>((url) => {
        asked.push(url);
        return Promise.resolve(
          reply(200, JSON.stringify(url.endsWith('events.min.json') ? bare : full)),
        );
      });
      const { events } = service(fetch, {
        url: 'https://example.test/events.min.json',
        research: store,
        now: () => at('2026-10-21T22:00'),
      });
      await events.refresh();
      expect(asked).toEqual([
        'https://example.test/events.min.json',
        'https://example.test/events.json',
      ]);
      expect(events.researchEvents()).toEqual([INTO_THE_WILD, PAWNIARD_DAY]);
    });

    it('uses no stored in-person event, such as a City Safari kept before plan 8R-7 (F1)', async () => {
      const safari = {
        id: 'pokemon-go-city-safari-boston-2026-rescheduled',
        name: 'Pokémon GO City Safari: Boston (Rescheduled)',
        eventType: 'city-safari',
        start: at('2026-10-24T10:00'),
        end: at('2026-10-25T18:00'),
      };
      const sendai = {
        id: 'pokemon-go-wild-area-2027-sendai',
        name: 'Pokémon GO Wild Area 2027: Sendai',
        eventType: 'wild-area',
        start: at('2026-10-24T10:00'),
        end: at('2026-10-25T18:00'),
      };
      const store = new MemoryResearchEvents([safari, sendai, INTO_THE_WILD]);
      const { events } = service(() => Promise.reject(new Error('down')), {
        research: store,
        now: () => at('2026-10-24T12:00'),
      });
      await events.loadResearch();
      // A Wild Area's row counts since Matt's rule of 2026-10-24 (review W1): rows are kept only
      // after the zone test, so this one had local times, which are enough for its type.
      expect(events.researchEvents()).toEqual(
        [INTO_THE_WILD, sendai].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)),
      );
    });

    it('says once per event that it reads a GO Fest whose id and name say no Global (W1)', async () => {
      const zoned = {
        ...MAX_FINALE,
        eventID: 'pokemon-go-fest-2025-osaka',
        name: 'Pokémon GO Fest 2025: Osaka',
        start: '2025-05-29T01:00:00.000Z',
        end: '2025-06-01T09:00:00.000Z',
      };
      const feed = JSON.stringify([...(readMaxEventFeed() as unknown[]), MAX_FINALE, zoned]);
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, feed)));
      const { events, entries } = service(fetch, {
        research: new MemoryResearchEvents(),
        now: () => at('2025-08-23T12:00'),
      });
      await events.refresh();
      await events.refresh();
      expect(events.bigEvents().map((event) => event.id)).toContain(MAX_FINALE.eventID);
      const told = entries.filter(
        (entry) =>
          entry.msg === 'a Wild Area, GO Tour or GO Fest without global in its name is read',
      );
      expect(told).toHaveLength(1);
      expect(told[0]).toMatchObject({
        level: 30,
        eventType: 'pokemon-go-fest',
        event: MAX_FINALE.eventID,
        name: MAX_FINALE.name,
      });
    });

    it('warns of a type with research it does not read, once per type (Matt’s R2)', async () => {
      const novel = (eventID: string) => ({
        eventID,
        eventType: 'brand-new-type',
        name: 'Something new',
        start: '2026-11-01T10:00:00.000',
        end: '2026-11-01T17:00:00.000',
        extraData: { generic: { hasFieldResearchTasks: true } },
      });
      const feed = JSON.stringify([...(readMaxEventFeed() as unknown[]), novel('new-1')]);
      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, feed)));
      const { events, entries } = service(fetch, {
        research: new MemoryResearchEvents(),
        now: () => at('2026-10-21T22:00'),
      });
      await events.refresh();
      await events.refresh();
      expect(events.researchEvents()).toEqual([INTO_THE_WILD, PAWNIARD_DAY]);
      const warned = entries.filter(
        (entry) => entry.msg === 'an event type with field research is not read',
      );
      expect(warned).toHaveLength(1);
      expect(warned[0]).toMatchObject({ level: 40, eventType: 'brand-new-type', event: 'new-1' });
    });

    it('keeps the raid events of a read whose research events cannot be kept', async () => {
      const store = new MemoryResearchEvents();
      store.failing.set('saveSeen', new Error('database is down'));
      const fetch = vi.fn<FetchEvents>(() =>
        Promise.resolve(reply(200, JSON.stringify(readMaxEventFeed()))),
      );
      const { events, entries } = service(fetch, { research: store });
      await expect(events.refresh()).resolves.toMatchObject({ status: 'updated' });
      expect(
        entries.some((entry) => entry.msg === 'could not keep the research events of the feed'),
      ).toBe(true);
    });
  });
});
