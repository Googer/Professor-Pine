import { describe, expect, it, vi } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { jsonResponse } from '../../test/support/responses.js';
import { readEventPage, readSpawnEventFeed } from '../../test/support/spawn-events.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { parseSpawnEventFeed, type SpawnEvent } from '../domain/time/spawn-events.js';
import {
  EventSpawnService,
  MAX_EVENT_PAGE_BYTES,
  nextReadIn,
  REREAD_MS,
} from './event-spawn-service.js';
import { PINE_USER_AGENT, type FetchPage } from './research-task-service.js';
import { zonedAt } from '../../test/support/time.js';

const ZONE = 'America/New_York';
const HOUR = 3_600_000;
const at = (local: string): number => zonedAt(local, ZONE);
const HALLOWEEN = 'https://leekduck.com/events/halloween-2026-part-1/';
const FEED_EVENTS = parseSpawnEventFeed(readSpawnEventFeed(), ZONE);

const page = (html: string, status = 200) =>
  Promise.resolve({ ...jsonResponse(null, { raw: html, status }), ok: status < 300 });

/** A service over `events`, reading what `answer` gives for an address, at `clock.now`. */
function serviceWith(
  answer: (url: string) => ReturnType<FetchPage>,
  events: readonly SpawnEvent[] = FEED_EVENTS,
) {
  const { log, entries } = createTestLogger();
  const clock = { now: at('2026-10-28T12:00') };
  const asked: { url: string; headers: Record<string, string>; redirect: string }[] = [];
  const service = new EventSpawnService({
    events: { spawnEvents: () => events },
    gameData: { catalogue: catalogueFixture() },
    fetch: (url, init) => {
      asked.push({ url, headers: init.headers, redirect: init.redirect });
      return answer(url);
    },
    log,
    now: () => clock.now,
  });
  const said = (msg: string) => entries.filter((entry) => entry.msg === msg).length;
  return { service, clock, asked, said };
}

const costumedKeys = (service: EventSpawnService, moment: number) =>
  service
    .sightingsAt(moment)
    .filter((sighting) => sighting.costumed)
    .map((sighting) => sighting.key);

describe('EventSpawnService (plan 8R-4)', () => {
  it('reads the page of an event on now with Pine’s User-Agent, and places its spawns', async () => {
    const halloween = readEventPage('leekduck-event-halloween-2026-part-1.html');
    const { service, clock, asked } = serviceWith(() => page(halloween));
    expect(service.sightingsAt(clock.now)).toEqual([]);
    await service.refresh();
    expect(asked).toEqual([
      {
        url: HALLOWEEN,
        headers: { Accept: 'text/html', 'User-Agent': PINE_USER_AGENT },
        redirect: 'error',
      },
    ]);
    // Zubat with a hand-named picture, Piplup by its picture's costume; Duskull plain.
    expect(service.sightingsAt(clock.now)).toEqual(
      expect.arrayContaining([
        { key: 'zubat', dex: 41, costumed: true },
        { key: 'duskull', dex: 355, costumed: false },
        expect.objectContaining({ dex: 393, costumed: true }),
      ]),
    );
    // Not on before it starts, nor after it ends.
    expect(service.sightingsAt(at('2026-10-27T09:59'))).toEqual([]);
    expect(service.sightingsAt(at('2026-11-01T10:00'))).toEqual([]);
  });

  it('reads a page again only after six hours, and keeps the last good read when one fails', async () => {
    let answer = () => page(readEventPage('leekduck-event-halloween-2026-part-1.html'));
    const { service, clock, asked, said } = serviceWith(() => answer());
    await service.refresh();
    clock.now += REREAD_MS - 1;
    await service.refresh();
    expect(asked).toHaveLength(1);
    clock.now += 1;
    answer = () => page('', 503);
    await service.refresh();
    expect(asked).toHaveLength(2);
    expect(costumedKeys(service, clock.now)).toContain('zubat');
    expect(said('could not read the spawns of an event')).toBe(1);
  });

  it('gives no spawns of an event whose page was never read', async () => {
    const { service, clock, said } = serviceWith(() => Promise.reject(new Error('down')));
    await service.refresh();
    expect(service.sightingsAt(clock.now)).toEqual([]);
    expect(said('could not read the spawns of an event')).toBe(1);
  });

  it('refuses a page too large to be an event page', async () => {
    const huge = 'x'.repeat(MAX_EVENT_PAGE_BYTES + 1);
    const { service, clock, said } = serviceWith(() => page(huge));
    await service.refresh();
    expect(service.sightingsAt(clock.now)).toEqual([]);
    expect(said('could not read the spawns of an event')).toBe(1);
  });

  it('takes a community day’s and a spotlight hour’s spawns from the feed, reading nothing', async () => {
    const { service, clock, asked } = serviceWith(() => Promise.reject(new Error('no network')));
    clock.now = at('2026-11-05T18:30');
    await service.refresh();
    // Halloween Part II's page is read; the spotlight hour's spawns are the feed's (B5).
    expect(asked.map((one) => one.url)).toEqual([
      'https://leekduck.com/events/halloween-2026-part-2/',
    ]);
    expect(costumedKeys(service, clock.now)).toEqual(['teddiursa']);
    expect(costumedKeys(service, at('2026-11-21T15:00'))).toEqual([]);
    expect(service.sightingsAt(at('2026-11-21T15:00')).map((sighting) => sighting.key)).toEqual([
      'pawniard',
    ]);
  });

  it('reads no address but Leek Duck’s events pages, and says so once (F11)', async () => {
    const elsewhere: SpawnEvent = {
      id: 'elsewhere',
      name: 'Elsewhere',
      eventType: 'event',
      start: at('2026-10-28T00:00'),
      end: at('2026-10-29T00:00'),
      page: 'https://example.test/events/elsewhere/',
    };
    const { service, asked, said } = serviceWith(() => page('<html></html>'), [elsewhere]);
    await service.refresh();
    await service.refresh();
    expect(asked).toEqual([]);
    expect(said('an event page that is not Leek Duck’s is not read')).toBe(1);
  });

  it('takes nothing from a page that ended up anywhere but an events page (B3)', async () => {
    const halloween = readEventPage('leekduck-event-halloween-2026-part-1.html');
    const { service, clock, said } = serviceWith(() =>
      page(halloween).then((response) => ({ ...response, url: 'https://example.test/x' })),
    );
    await service.refresh();
    expect(service.sightingsAt(clock.now)).toEqual([]);
    expect(said('could not read the spawns of an event')).toBe(1);
  });

  it('reads as an event begins and again after six hours, by its timer (B6)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const halloween = readEventPage('leekduck-event-halloween-2026-part-1.html');
      const { service, clock, asked } = serviceWith(() => page(halloween));
      // Half an hour before Halloween Part I begins: nothing on to read yet.
      clock.now = at('2026-10-27T09:30');
      service.start();
      await service.whenIdle();
      expect(asked).toEqual([]);
      expect(vi.getTimerCount()).toBe(1);
      // Its timer runs at the start: the page is read.
      clock.now = at('2026-10-27T10:00');
      await vi.advanceTimersToNextTimerAsync();
      await service.whenIdle();
      expect(asked).toHaveLength(1);
      // Every hour after it looks again; the page is read anew once six hours are up.
      for (let hour = 1; hour <= 6; hour++) {
        expect(vi.getTimerCount()).toBe(1);
        clock.now = at('2026-10-27T10:00') + hour * HOUR;
        await vi.advanceTimersToNextTimerAsync();
        await service.whenIdle();
        expect(asked, `after ${String(hour)} hours`).toHaveLength(hour < 6 ? 1 : 2);
      }
      service.stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads at once when started, and nothing once stopped, also when started after (shutdown)', async () => {
    const halloween = readEventPage('leekduck-event-halloween-2026-part-1.html');
    const started = serviceWith(() => page(halloween));
    started.service.start();
    await started.service.whenIdle();
    started.service.stop();
    expect(started.asked).toHaveLength(1);
    const stopped = serviceWith(() => page(halloween));
    stopped.service.stop();
    stopped.service.start();
    await stopped.service.whenIdle();
    expect(stopped.asked).toEqual([]);
  });
});

describe('nextReadIn', () => {
  it('reads at the next start of an event with spawns, at the latest in an hour', () => {
    expect(nextReadIn(FEED_EVENTS, at('2026-10-27T09:30'))).toBe(30 * 60_000);
    expect(nextReadIn(FEED_EVENTS, at('2026-10-28T12:00'))).toBe(HOUR);
    expect(nextReadIn([], at('2026-10-28T12:00'))).toBe(HOUR);
  });
});
