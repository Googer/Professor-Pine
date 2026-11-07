import { describe, expect, it, vi } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { jsonResponse } from '../../test/support/responses.js';
import { readEventPage, readSpawnEventFeed } from '../../test/support/spawn-events.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { parseSpawnEventFeed, type SpawnEvent } from '../domain/time/spawn-events.js';
import { parsePagedEventFeed, type PagedEvent } from '../domain/time/event-pages.js';
import { readEveryoneFeed } from '../../test/support/event-reach.js';
import {
  EventPageService,
  type EventPageOptions,
  MAX_EVENT_PAGE_BYTES,
  nextReadIn,
  REREAD_MS,
  startAfterFeed,
} from './event-page-service.js';
import { RaidEventService } from './raid-event-service.js';
import type { RaidEvent } from '../domain/time/raid-events.js';
import { textAnswer } from '../../test/support/responses.js';
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
  paged: { now: readonly PagedEvent[] } = { now: [] },
  weeklyRaidHour: { hour: number; minutes: number } | null = { hour: 18, minutes: 60 },
  more: Partial<EventPageOptions> = {},
) {
  const { log, entries } = createTestLogger();
  const clock = { now: at('2026-10-28T12:00') };
  const asked: { url: string; headers: Record<string, string>; redirect: string }[] = [];
  const service = new EventPageService({
    ...more,
    events: { spawnEvents: () => events, pagedEvents: () => paged.now },
    zone: ZONE,
    weeklyRaidHour,
    gameData: { catalogue: catalogueFixture() },
    fetch: (url, init) => {
      asked.push({ url, headers: init.headers, redirect: init.redirect });
      return answer(url);
    },
    log,
    now: () => clock.now,
  });
  const said = (msg: string) => entries.filter((entry) => entry.msg === msg).length;
  const told = (msg: string) => entries.filter((entry) => entry.msg === msg);
  return { service, clock, asked, said, told };
}

const costumedKeys = (service: EventPageService, moment: number) =>
  service
    .sightingsAt(moment)
    .filter((sighting) => sighting.costumed)
    .map((sighting) => sighting.key);

describe('EventPageService (plan 8R-4)', () => {
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
    expect(said('could not read an event page')).toBe(1);
  });

  it('gives no spawns of an event whose page was never read', async () => {
    const { service, clock, said } = serviceWith(() => Promise.reject(new Error('down')));
    await service.refresh();
    expect(service.sightingsAt(clock.now)).toEqual([]);
    expect(said('could not read an event page')).toBe(1);
  });

  it('refuses a page too large to be an event page', async () => {
    const huge = 'x'.repeat(MAX_EVENT_PAGE_BYTES + 1);
    const { service, clock, said } = serviceWith(() => page(huge));
    await service.refresh();
    expect(service.sightingsAt(clock.now)).toEqual([]);
    expect(said('could not read an event page')).toBe(1);
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
    expect(said('could not read an event page')).toBe(1);
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

describe('EventPageService: the Raid Hours of the events’ pages', () => {
  const INTO_THE_WILD = 'https://leekduck.com/events/into-the-wild-2026/';
  const WILD_AREA = 'https://leekduck.com/events/pokemon-go-wild-area-2026-global/';
  const PAGED = parsePagedEventFeed(readEveryoneFeed(), ZONE);
  const intoTheWild = readEventPage('leekduck-event-into-the-wild-2026.html');
  const byAddress = (url: string) => page(url === INTO_THE_WILD ? intoTheWild : '<html></html>');
  const raidHour = (iso: string, name: string) => ({
    kind: 'raid-hour',
    name,
    start: at(iso),
    end: at(iso) + HOUR,
    // The event whose page named it: the events forum links its line there.
    page: { event: 'into-the-wild-2026', link: INTO_THE_WILD },
  });
  const BOTH = [
    raidHour('2026-11-09T18:00', 'Zacian (Crowned Sword) Raid Hour'),
    raidHour('2026-11-10T18:00', 'Zamazenta (Crowned Shield) Raid Hour'),
  ];
  const sorted = (service: EventPageService) =>
    [...service.raidHours()].sort((a, b) => a.start - b.start);

  it('reads the pages of the events from eight days ago to eight days ahead, before they begin', async () => {
    const { service, clock, asked, told } = serviceWith(byAddress, [], { now: PAGED });
    clock.now = at('2026-11-07T12:00');
    expect(service.raidHours()).toEqual([]);
    await service.refresh();
    // The Global Wild Area (Nov 14) too; not the community day of Nov 21, beyond eight days.
    expect(asked.map((one) => one.url)).toEqual([INTO_THE_WILD, WILD_AREA]);
    expect(asked[0]).toMatchObject({
      headers: { Accept: 'text/html', 'User-Agent': PINE_USER_AGENT },
      redirect: 'error',
    });
    expect(sorted(service)).toEqual(BOTH);
    expect(told('the Raid Hours of an event page read')).toEqual([
      expect.objectContaining({ event: 'into-the-wild-2026', raidHours: 2 }),
    ]);
  });

  it('reads a page once for its spawns and its Raid Hours alike', async () => {
    const spawning = parseSpawnEventFeed(readSpawnEventFeed(), ZONE).filter(
      (event) => event.id === 'into-the-wild-2026',
    );
    expect(spawning[0]?.page).toBe(INTO_THE_WILD);
    const { service, clock, asked } = serviceWith(byAddress, spawning, {
      now: PAGED.filter((event) => event.id === 'into-the-wild-2026'),
    });
    clock.now = at('2026-11-09T12:00');
    await service.refresh();
    expect(asked.map((one) => one.url)).toEqual([INTO_THE_WILD]);
    expect(service.sightingsAt(clock.now).length).toBeGreaterThan(0);
    expect(sorted(service)).toEqual(BOTH);
  });

  it('reads again after six hours, and keeps the last good read when one fails', async () => {
    let answer = byAddress;
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const { service, clock, asked, said } = serviceWith((url) => answer(url), [], paged);
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    clock.now += REREAD_MS - 1;
    await service.refresh();
    expect(asked).toHaveLength(1);
    clock.now += 1;
    answer = () => page('', 503);
    await service.refresh();
    expect(asked).toHaveLength(2);
    expect(said('could not read an event page')).toBe(1);
    expect(sorted(service)).toEqual(BOTH);
  });

  it('keeps the Raid Hours that began of an event the feed dropped, for eight days', async () => {
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const { service, clock } = serviceWith(byAddress, [], paged);
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    // Moved or canceled before it began: its Raid Hours go.
    paged.now = [];
    expect(service.raidHours()).toEqual([]);
    // Dropped once it began: the Raid Hour that began stays, until eight days after its end.
    clock.now = at('2026-11-10T12:00');
    expect(service.raidHours()).toEqual(BOTH.slice(0, 1));
    clock.now = at('2026-11-17T18:59');
    expect(sorted(service)).toEqual(BOTH);
    clock.now = at('2026-11-17T19:00');
    expect(service.raidHours()).toEqual(BOTH.slice(1));
    clock.now = at('2026-11-18T19:00');
    expect(service.raidHours()).toEqual([]);
  });

  it('warns once of a page that names Raid Hours it cannot read', async () => {
    const changed = '<h2 id="raids">Raids</h2><h3 id="raid-hour-monday">Raid Hour on Monday</h3>';
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const { service, clock, said } = serviceWith(() => page(changed), [], paged);
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    clock.now += REREAD_MS;
    await service.refresh();
    expect(service.raidHours()).toEqual([]);
    expect(said('an event page names Raid Hours that could not be read')).toBe(1);
    expect(said('the Raid Hours of an event page read')).toBe(0);
  });

  it('says nothing of a page whose only Raid Hour id is no dated heading (a Raid Hour’s own page)', async () => {
    const own = '<h2 id="raid-hour" class="event-section-header">Raid Hour</h2>';
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const { service, clock, said } = serviceWith(() => page(own), [], paged);
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    expect(said('could not read an event page')).toBe(0);
    expect(said('an event page names Raid Hours that could not be read')).toBe(0);
  });

  it('places the Raid Hours at 18:00 for an hour without a weekly one', async () => {
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const { service, clock } = serviceWith(byAddress, [], paged, null);
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    expect(sorted(service)).toEqual(BOTH);
  });

  it('places the Raid Hours at the time the Raids section’s sentence gives, not the weekly one’s', async () => {
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const weekly = { hour: 17, minutes: 90 };
    const { service, clock, said } = serviceWith(byAddress, [], paged, weekly);
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    expect(sorted(service)).toEqual(BOTH);
    // Another time on the page: the Raid Hours follow it.
    const later = intoTheWild.replace('from 6:00 p.m. to 7:00 p.m.', 'from 5:00 p.m. to 6:30 p.m.');
    const moved = serviceWith(() => page(later), [], paged, weekly);
    moved.clock.now = at('2026-11-07T12:00');
    await moved.service.refresh();
    expect(sorted(moved.service).map((one) => [one.start, one.end])).toEqual([
      [at('2026-11-09T17:00'), at('2026-11-09T18:30')],
      [at('2026-11-10T17:00'), at('2026-11-10T18:30')],
    ]);
    expect(
      said('the time of an event page’s Raid Hours could not be read; the weekly one’s taken'),
    ).toBe(0);
  });

  it('places the Raid Hours at the weekly one’s time where the sentence is unclear, and warns once', async () => {
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const unclear = intoTheWild.replace(
      'from 6:00 p.m. to 7:00 p.m.',
      'from 6:00 p.m. to 7:00 p.m. and from 4:00 p.m. to 5:00 p.m.',
    );
    const { service, clock, said } = serviceWith(() => page(unclear), [], paged, {
      hour: 17,
      minutes: 90,
    });
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    expect(sorted(service).map((one) => [one.start, one.end])).toEqual([
      [at('2026-11-09T17:00'), at('2026-11-09T18:30')],
      [at('2026-11-10T17:00'), at('2026-11-10T18:30')],
    ]);
    clock.now += REREAD_MS;
    await service.refresh();
    expect(
      said('the time of an event page’s Raid Hours could not be read; the weekly one’s taken'),
    ).toBe(1);
  });

  it('keeps the Raid Hours of the last read when a page gives none, and warns (ER-2)', async () => {
    let answer = byAddress;
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const { service, clock, said } = serviceWith((url) => answer(url), [], paged);
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    answer = () => page('<html><h2 id="spawns">Spawns</h2></html>');
    clock.now += REREAD_MS;
    await service.refresh();
    expect(sorted(service)).toEqual(BOTH);
    expect(said('an event page gave no Raid Hours; those of its last read kept')).toBe(1);
  });

  it('warns when fewer Raid Hours are read than the Raids section has headings for (ER-3)', async () => {
    const raids =
      '<h2 id="raids">Raids</h2>' +
      '<h3 id="raid-hour-monday-november-9">Raid Hour: Monday, November 9</h3><ul></ul>' +
      '<h3 id="raid-hour-tuesday-november-10">Raid Hour at last on Tuesday</h3><ul></ul>' +
      '<h2 id="max-battles">Max Battles</h2><h3 id="raid-hour-elsewhere">Raid Hour</h3>';
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const { service, clock, said } = serviceWith(() => page(raids), [], paged);
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    expect(service.raidHours().map((hour) => hour.start)).toEqual([at('2026-11-09T18:00')]);
    expect(said('an event page names Raid Hours that could not be read')).toBe(1);
    // A dated heading id outside the Raids section is not counted.
    const elsewhere = serviceWith(
      () =>
        page(
          intoTheWild.replace(
            '<h2 id="max-battles">',
            '<h2 id="max-battles"><h3 id="raid-hour-x">Raid Hour</h3>',
          ),
        ),
      [],
      paged,
    );
    elsewhere.clock.now = at('2026-11-07T12:00');
    await elsewhere.service.refresh();
    expect(elsewhere.said('an event page names Raid Hours that could not be read')).toBe(0);
  });

  it('retries a page that failed after 15 minutes, doubling the wait up to six hours (ER-4)', async () => {
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const { service, clock, asked } = serviceWith(() => page('', 503), [], paged);
    clock.now = at('2026-11-07T00:00');
    await service.refresh();
    expect(asked).toHaveLength(1);
    for (const minutes of [15, 30, 60, 120, 240, 360, 360]) {
      const before = asked.length;
      clock.now += minutes * 60_000 - 1;
      await service.refresh();
      expect(asked, `before ${String(minutes)} minutes`).toHaveLength(before);
      clock.now += 1;
      await service.refresh();
      expect(asked, `after ${String(minutes)} minutes`).toHaveLength(before + 1);
    }
  });

  it('retries a failed page after 15 minutes also when it was read before (ER-4)', async () => {
    let answer = byAddress;
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const { service, clock, asked } = serviceWith((url) => answer(url), [], paged);
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    answer = () => page('', 503);
    clock.now += REREAD_MS;
    await service.refresh();
    clock.now += 14 * 60_000;
    await service.refresh();
    expect(asked).toHaveLength(2);
    answer = byAddress;
    clock.now += 60_000;
    await service.refresh();
    expect(asked).toHaveLength(3);
    // Read again: the next is six hours on.
    clock.now += REREAD_MS - 1;
    await service.refresh();
    expect(asked).toHaveLength(3);
  });

  it('reads the page of an event that has ended once, never again (ER-4)', async () => {
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const { service, clock, asked } = serviceWith(byAddress, [], paged);
    clock.now = at('2026-11-14T12:00');
    await service.refresh();
    expect(asked).toHaveLength(1);
    clock.now += 2 * REREAD_MS;
    await service.refresh();
    expect(asked).toHaveLength(1);
    expect(sorted(service)).toEqual(BOTH);
  });

  it('reads a page read before its event again as the event begins, for its spawns (ER-5)', async () => {
    const spawning = parseSpawnEventFeed(readSpawnEventFeed(), ZONE).filter(
      (event) => event.id === 'into-the-wild-2026',
    );
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const { service, clock, asked } = serviceWith(byAddress, spawning, paged);
    // Read for its Raid Hours five hours before it begins: within six hours of a read.
    clock.now = at('2026-11-09T05:00');
    await service.refresh();
    expect(asked).toHaveLength(1);
    clock.now = at('2026-11-09T09:59');
    await service.refresh();
    expect(asked).toHaveLength(1);
    clock.now = at('2026-11-09T10:00');
    await service.refresh();
    expect(asked).toHaveLength(2);
  });

  it('reads nothing once stopped, also when asked to refresh (ER-1)', async () => {
    const paged = { now: PAGED.filter((event) => event.id === 'into-the-wild-2026') };
    const { service, clock, asked } = serviceWith(byAddress, [], paged);
    clock.now = at('2026-11-07T12:00');
    service.stop();
    await service.refresh();
    expect(asked).toEqual([]);
  });
});

describe('EventPageService: the Max Battle hours of the events’ pages', () => {
  const INTO_THE_WILD = 'https://leekduck.com/events/into-the-wild-2026/';
  const PAGED = parsePagedEventFeed(readEveryoneFeed(), ZONE).filter(
    (event) => event.id === 'into-the-wild-2026',
  );
  const intoTheWild = readEventPage('leekduck-event-into-the-wild-2026.html');
  const hours = (service: EventPageService) =>
    [...service.maxHours()]
      .sort((a, b) => a.start - b.start)
      .map((one) => ({ name: one.name, start: one.start, end: one.end, short: one.short }));
  const THREE = [
    ['Dynamax Registeel Max Battle Hour', '2026-11-11T18:00'],
    ['Dynamax Regidrago Max Battle Hour', '2026-11-12T18:00'],
    ['Dynamax Latias and Latios Max Battle Hour', '2026-11-13T18:00'],
  ].map(([name, local]) => ({
    name,
    start: at(local ?? ''),
    end: at(local ?? '') + HOUR,
    short: true,
  }));

  it('reads the Max Battle hours of a page at the time its sentence gives, and says so', async () => {
    const { service, clock, told } = serviceWith(
      (url) => page(url === INTO_THE_WILD ? intoTheWild : '<html></html>'),
      [],
      { now: PAGED },
    );
    clock.now = at('2026-11-07T12:00');
    expect(service.maxHours()).toEqual([]);
    await service.refresh();
    expect(hours(service)).toEqual(THREE);
    expect(service.maxHours()[0]?.featured).toEqual({ gigantamax: false, names: ['Registeel'] });
    expect(told('the Max Battle hours of an event page read')).toEqual([
      expect.objectContaining({ event: 'into-the-wild-2026', maxHours: 3 }),
    ]);
  });

  it('leaves the hours out where the sentence gives no clear time, and warns once', async () => {
    const unclear = intoTheWild.replace(
      'featured in Max Battles from 6:00 p.m. to 7:00 p.m.',
      'featured in Max Battles in the evening',
    );
    const { service, clock, said } = serviceWith(() => page(unclear), [], { now: PAGED });
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    expect(service.maxHours()).toEqual([]);
    // The Raid Hours are read all the same.
    expect(service.raidHours()).toHaveLength(2);
    const several = intoTheWild.replace(
      'from 6:00 p.m. to 7:00 p.m. local time for one day',
      'from 6:00 p.m. to 7:00 p.m. or from 2 p.m. to 3 p.m. local time for one day',
    );
    const two = serviceWith(() => page(several), [], { now: PAGED });
    two.clock.now = at('2026-11-07T12:00');
    await two.service.refresh();
    two.clock.now += REREAD_MS;
    await two.service.refresh();
    expect(two.service.maxHours()).toEqual([]);
    expect(
      two.said('the time of an event page’s Max Battle hours could not be read; they are left out'),
    ).toBe(1);
    expect(
      said('the time of an event page’s Max Battle hours could not be read; they are left out'),
    ).toBe(1);
  });

  it('drops the hours of the last read when the page now names hours at an unclear time (review)', async () => {
    let answer = () => page(intoTheWild);
    const { service, clock, said } = serviceWith(() => answer(), [], { now: PAGED });
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    expect(service.maxHours()).toHaveLength(3);
    answer = () =>
      page(
        intoTheWild.replace(
          'from 6:00 p.m. to 7:00 p.m. local time for one day',
          'from 6:00 p.m. to 7:00 p.m. or from 2 p.m. to 3 p.m. local time for one day',
        ),
      );
    clock.now += REREAD_MS;
    await service.refresh();
    expect(service.maxHours()).toEqual([]);
    expect(said('an event page gave no Max Battle hours; those of its last read kept')).toBe(0);
    // A page that names no Max Battle hours at all keeps them (ER-2).
    answer = () => page(intoTheWild);
    clock.now += REREAD_MS;
    await service.refresh();
    answer = () => page('<html><h2 id="spawns">Spawns</h2></html>');
    clock.now += REREAD_MS;
    await service.refresh();
    expect(service.maxHours()).toHaveLength(3);
  });

  it('warns once when fewer Max Battle hours are read than the section has dated headings', async () => {
    const changed = intoTheWild.replace(
      'Five-Star Max Battles: Thursday, November 12',
      'Five-Star Max Battles on Thursday',
    );
    const { service, clock, said } = serviceWith(() => page(changed), [], { now: PAGED });
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    expect(hours(service).map((one) => one.name)).toEqual([
      'Dynamax Registeel Max Battle Hour',
      'Dynamax Latias and Latios Max Battle Hour',
    ]);
    clock.now += REREAD_MS;
    await service.refresh();
    expect(said('an event page names Max Battle hours that could not be read')).toBe(1);
  });

  it('keeps the hours of the last read when a page gives none, and those begun of an event dropped', async () => {
    let answer = () => page(intoTheWild);
    const paged = { now: PAGED };
    const { service, clock, said } = serviceWith(() => answer(), [], paged);
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    answer = () => page('<html><h2 id="spawns">Spawns</h2></html>');
    clock.now += REREAD_MS;
    await service.refresh();
    expect(hours(service)).toEqual(THREE);
    expect(said('an event page gave no Max Battle hours; those of its last read kept')).toBe(1);
    // Dropped by the feed: those begun stay for eight days, those to come go.
    paged.now = [];
    clock.now = at('2026-11-12T12:00');
    expect(hours(service)).toEqual(THREE.slice(0, 1));
  });

  it('says when a round of reads changed the pages’ hours, and only then (the events forum)', async () => {
    let answer = () => page(intoTheWild);
    let changes = 0;
    const { service, clock } = serviceWith(() => answer(), [], { now: PAGED }, undefined, {
      onHoursChange: () => {
        changes += 1;
      },
    });
    clock.now = at('2026-11-07T12:00');
    await service.refresh();
    expect(changes).toBe(1);
    // Read again, the same hours: nothing to say.
    clock.now += REREAD_MS;
    await service.refresh();
    expect(changes).toBe(1);
    // Read again, Thursday's boss changed.
    answer = () => page(intoTheWild.replace('Regidrago', 'Regieleki'));
    clock.now += REREAD_MS;
    await service.refresh();
    expect(changes).toBe(2);
  });

  describe('two pages read at different times (review)', () => {
    const WILD_AREA = 'https://leekduck.com/events/pokemon-go-wild-area-2026-global/';
    const BOTH_PAGED = parsePagedEventFeed(readEveryoneFeed(), ZONE).filter((event) =>
      ['into-the-wild-2026', 'pokemon-go-wild-area-2026-global'].includes(event.id),
    );
    const wildAreaHours =
      '<h2 id="raids">Raids</h2><p>A Raid Hour from 6 p.m. to 7 p.m. local time.</p>' +
      '<h3 id="raid-hour-saturday-november-14">Raid Hour: Saturday, November 14</h3><ul></ul>';
    const counting = (wildArea: string) => {
      const paged = { now: BOTH_PAGED.slice(0, 1) };
      let changes = 0;
      const made = serviceWith(
        (url) => page(url === WILD_AREA ? wildArea : intoTheWild),
        [],
        paged,
        undefined,
        {
          onHoursChange: () => {
            changes += 1;
          },
        },
      );
      return { ...made, paged, changes: () => changes };
    };

    it('says nothing when a page read again moves before another in the order of reads', async () => {
      const { service, clock, paged, changes } = counting(wildAreaHours);
      expect(BOTH_PAGED.map((event) => event.page)).toEqual([INTO_THE_WILD, WILD_AREA]);
      clock.now = at('2026-11-07T12:00');
      await service.refresh();
      expect(changes()).toBe(1);
      // An hour later the feed adds the Wild Area: its page, read, has a Raid Hour.
      paged.now = BOTH_PAGED;
      clock.now += HOUR;
      await service.refresh();
      expect(changes()).toBe(2);
      // Into the Wild's page is read again alone, unchanged.
      clock.now = at('2026-11-07T18:00');
      await service.refresh();
      expect(service.raidHours()).toHaveLength(3);
      expect(changes()).toBe(2);
    });

    it('says nothing when a page read for the first time has no hours', async () => {
      const { service, clock, paged, changes } = counting(
        '<html><h2 id="spawns">Spawns</h2></html>',
      );
      clock.now = at('2026-11-07T12:00');
      await service.refresh();
      expect(changes()).toBe(1);
      paged.now = BOTH_PAGED;
      clock.now += HOUR;
      await service.refresh();
      expect(changes()).toBe(1);
    });
  });
});

describe('startAfterFeed (ER-1, ER-5)', () => {
  it('starts the pages after the first read of the feed, and reads them after each good read', async () => {
    const INTO_THE_WILD = 'https://leekduck.com/events/into-the-wild-2026/';
    const intoTheWild = readEventPage('leekduck-event-into-the-wild-2026.html');
    const { log } = createTestLogger();
    const clock = { now: at('2026-11-07T12:00') };
    let feedUp = false;
    const feed = new RaidEventService({
      url: 'https://example.test/events.json',
      refreshMs: 6 * HOUR,
      zone: ZONE,
      fetch: () =>
        Promise.resolve(
          feedUp ? textAnswer(200, JSON.stringify(readEveryoneFeed())) : textAnswer(503, ''),
        ),
      log,
      now: () => clock.now,
      pageRaidHours: (): readonly RaidEvent[] => pages.raidHours(),
    });
    const asked: string[] = [];
    const pages = new EventPageService({
      events: feed,
      gameData: { catalogue: catalogueFixture() },
      fetch: (url) => {
        asked.push(url);
        return page(url === INTO_THE_WILD ? intoTheWild : '<html></html>');
      },
      log,
      zone: ZONE,
      weeklyRaidHour: { hour: 18, minutes: 60 },
      now: () => clock.now,
    });
    try {
      // The first read fails: the pages start, with nothing to read.
      await startAfterFeed(feed, pages);
      await pages.whenIdle();
      expect(asked).toEqual([]);
      // The feed is back: its good read has the pages read at once, not within the hour.
      feedUp = true;
      await feed.refresh();
      await pages.whenIdle();
      expect(asked).toContain(INTO_THE_WILD);
      expect(feed.events().map((event) => event.name)).toContain(
        'Zacian (Crowned Sword) Raid Hour',
      );
      // Stopped: a later good read reads no page.
      pages.stop();
      const before = asked.length;
      clock.now += 2 * REREAD_MS;
      await feed.refresh();
      await pages.whenIdle();
      expect(asked).toHaveLength(before);
    } finally {
      pages.stop();
      feed.stop();
    }
  });
});

describe('nextReadIn', () => {
  it('reads at the next start of an event with spawns, at the latest in an hour', () => {
    expect(nextReadIn(FEED_EVENTS, at('2026-10-27T09:30'))).toBe(30 * 60_000);
    expect(nextReadIn(FEED_EVENTS, at('2026-10-28T12:00'))).toBe(HOUR);
    expect(nextReadIn([], at('2026-10-28T12:00'))).toBe(HOUR);
  });
});
