import { describe, expect, it } from 'vitest';
import { readMaxEventFeed } from '../../../test/support/max-events.js';
import { readSpawnEventFeed } from '../../../test/support/spawn-events.js';
import {
  eventTimeWords,
  hasCampfireHint,
  hasCampfirePostHint,
  isKnownKind,
  isListed,
  isPosted,
  isShortRead,
  mergeRead,
  listingSections,
  mergeListed,
  postOpensAt,
  readListedEvents,
  sectionChangesAt,
  sameEventName,
  type FeedListing,
  type ListedEvent,
} from './event-listing.js';
import { maxEventAt, parseBigEventFeed, parseMaxEventFeed } from './max-events.js';

const ZONE = 'America/New_York';
const at = (iso: string): number =>
  Temporal.PlainDateTime.from(iso).toZonedDateTime(ZONE).epochMilliseconds;

/** The listed events of a feed, its max and big events parsed as the service parses them. */
function listingOf(json: unknown): FeedListing {
  return readListedEvents(json, ZONE, {
    max: parseMaxEventFeed(json, ZONE).events,
    big: parseBigEventFeed(json, ZONE),
  });
}

const event = (overrides: Partial<ListedEvent> = {}): ListedEvent => ({
  id: 'november-communityday2026',
  name: 'Pawniard Community Day',
  eventType: 'community-day',
  link: 'https://leekduck.com/events/november-communityday2026/',
  image: null,
  start: at('2026-11-21T14:00'),
  end: at('2026-11-21T17:00'),
  formerIds: [],
  ...overrides,
});

describe('which events are listed, posted and hinted (plan 8V-1, design "Which events")', () => {
  const listing = listingOf(readSpawnEventFeed());
  const ids = listing.read.map((one) => one.id);

  it('lists everyone’s events of the feed of 2026-10-22 with times, of the kinds listed', () => {
    for (const id of [
      'pokemonspotlighthour2026-10-22',
      'dynamax-uxie-mesprit-azelf-max-battle-day-2026',
      'minior-showers-orionids-2026',
      'max-mondays-2026-10-26',
      'raidhour20261028',
      'chandelure-super-mega-raid-day-2026',
      'halloween-2026-part-1',
      'november-communityday2026',
      'pokemon-go-wild-area-2026-global',
      'max-mondays-2026-11-16',
      'pokemon-go-tour-alola-global-2027',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it('leaves out the passes, seasons, leagues, drops and Timed Research, and the boss rotations', () => {
    for (const id of [
      'go-pass-october-2026',
      'season-24-twilight-trails',
      'pokemon-night-out-2026-twitch-drops',
      'pokemon-x-adidas-2026',
      'gbl-twilight-trails_master-league_mega-catch-cup-great-league-edition',
      'palkia-in-5-star-raid-battles-october-2026',
    ]) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('leaves out what is somebody else’s: zoned times, a City Safari, a city’s Wild Area or Tour', () => {
    for (const id of [
      'pokemon-night-out-los-angeles-2026',
      'pokemon-go-city-safari-boston-2026-rescheduled',
      'pokemon-go-wild-area-2026-mexico-city',
      'pokemon-go-tour-alola-kaohsiung-2027',
    ]) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('counts an item without times as not seen: listed nowhere, named apart (R3)', () => {
    expect(ids).not.toContain('pokemon-tcg-30th-celebration');
    expect(listing.untimed).toContain('pokemon-tcg-30th-celebration');
    expect(listing.untimed).toContain('raidhour20261021');
  });

  it('keeps each event’s name, type, link, picture and times as read', () => {
    expect(listing.read.find((one) => one.id === 'november-communityday2026')).toEqual({
      id: 'november-communityday2026',
      name: 'Pawniard Community Day',
      eventType: 'community-day',
      link: 'https://leekduck.com/events/november-communityday2026/',
      image: expect.stringMatching(/^https:\/\/cdn\.leekduck\.com\//u) as string,
      start: at('2026-11-21T14:00'),
      end: at('2026-11-21T17:00'),
      formerIds: [],
    });
  });

  it('lists a raid-battles item that lasts less than a day, a one-off raid event (ruling B)', () => {
    const oneOff = {
      eventID: 'eternatus-returns-2026',
      name: 'Eternatus Returns',
      eventType: 'raid-battles',
      start: '2026-11-07T11:00:00.000',
      end: '2026-11-07T17:00:00.000',
    };
    const listed = listingOf([oneOff]).read;
    expect(listed.map((one) => one.id)).toEqual(['eternatus-returns-2026']);
    expect(isPosted(listed[0]!)).toBe(false);
    expect(hasCampfireHint(listed[0]!)).toBe(true);
  });

  // Review V9: a raid-battles item listed only when it lasts something and less than a day.
  it('lists no raid-battles item that ends before or as it starts', () => {
    const odd = event({ eventType: 'raid-battles' });
    expect(isListed({ ...odd, end: odd.start })).toBe(false);
    expect(isListed({ ...odd, end: odd.start - 60_000 })).toBe(false);
    expect(isListed({ ...odd, end: odd.start + 60_000 })).toBe(true);
  });

  it('takes a Max Monday’s hours from the max events, assumed ones too (R4)', () => {
    const json = readMaxEventFeed();
    const max = parseMaxEventFeed(json, ZONE);
    const listed = listingOf(json).read;
    const assumed = max.events.find((one) => one.hoursAssumed);
    if (!assumed?.id) throw new Error('the fixture has no Max Monday with assumed hours');
    const line = listed.find((one) => one.id === assumed.id);
    expect(line && { start: line.start, end: line.end }).toEqual({
      start: assumed.start,
      end: assumed.end,
    });
    // maxEventAt and the listing agree on the Monday's hours.
    expect(maxEventAt(max.events, assumed.start)?.id).toBe(assumed.id);
  });

  it('takes a big event’s times from the big events', () => {
    const json = readMaxEventFeed();
    const big = parseBigEventFeed(json, ZONE);
    const listed = listingOf(json).read;
    for (const one of big) {
      const line = listed.find((other) => other.id === one.id);
      expect(line && [line.start, line.end]).toEqual([one.start, one.end]);
    }
  });

  it('posts the bigger kinds, lines only for the weekly hours and what it does not know', () => {
    for (const eventType of [
      'community-day',
      'raid-day',
      'max-battles',
      'wild-area',
      'pokemon-go-tour',
      'pokemon-go-fest',
      'event',
      // Ruling R1 of the review: Leek Duck's Raid Weekends and elite raid days get posts too.
      'raid-weekend',
      'elite-raids',
    ]) {
      expect(isPosted(event({ eventType })), eventType).toBe(true);
    }
    for (const eventType of [
      'raid-hour',
      'pokemon-spotlight-hour',
      'max-mondays',
      'pokestop-showcase',
    ]) {
      expect(isListed(event({ eventType })), eventType).toBe(true);
      expect(isPosted(event({ eventType })), eventType).toBe(false);
    }
  });

  // Ruling R1 of the review: the other research types and Leek Duck's notices are not listed.
  it('lists none of the research types, the app updates and the location-specific notices', () => {
    for (const eventType of [
      'timed-research',
      'special-research',
      'limited-research',
      'research-breakthrough',
      'update',
      'location-specific',
    ]) {
      expect(isListed(event({ eventType })), eventType).toBe(false);
      expect(isKnownKind(eventType), eventType).toBe(true);
    }
  });

  it('gives every listed kind the Campfire hint, and none to what is not listed', () => {
    expect(hasCampfireHint(event({ eventType: 'raid-hour' }))).toBe(true);
    expect(hasCampfireHint(event({ eventType: 'pokestop-showcase' }))).toBe(true);
    expect(hasCampfireHint(event({ eventType: 'season' }))).toBe(false);
    expect(hasCampfireHint(event({ eventType: 'city-safari' }))).toBe(false);
  });

  // Plan 8M-15 (V1, Matt 2026-10-30): an event's own post names Campfire only for an event shorter
  // than a day whose kind has the hint.
  it("names Campfire in an event's post only for one shorter than a day with the hint", () => {
    const lasting = (hours: number, eventType = 'community-day') =>
      event({
        eventType,
        start: at('2026-11-21T00:00'),
        end: at('2026-11-21T00:00') + hours * 3_600_000,
      });
    expect(hasCampfirePostHint(lasting(3))).toBe(true);
    expect(hasCampfirePostHint(lasting(23.99))).toBe(true);
    // Midnight to midnight, exactly a day: none.
    expect(hasCampfirePostHint(lasting(24))).toBe(false);
    expect(hasCampfirePostHint(lasting(5 * 24))).toBe(false);
    // A kind without the hint, however short.
    expect(hasCampfirePostHint(lasting(3, 'city-safari'))).toBe(false);
  });

  it('names a kind it does not know, once with the first such event, for the log', () => {
    const json = [
      { eventID: 'showcase-1', name: 'Showcase', eventType: 'pokestop-showcase', start: null },
      {
        eventID: 'showcase-2',
        name: 'Showcase 2',
        eventType: 'pokestop-showcase',
        start: '2026-11-01T10:00:00.000',
        end: '2026-11-02T10:00:00.000',
      },
    ];
    expect(listingOf(json).unknownKinds).toEqual([
      { eventType: 'pokestop-showcase', id: 'showcase-1' },
    ]);
    expect(isKnownKind('community-day')).toBe(true);
    expect(isKnownKind('go-pass')).toBe(true);
    expect(isKnownKind('city-safari')).toBe(true);
    expect(isKnownKind('pokestop-showcase')).toBe(false);
    // Leek Duck's own type list knows no Hatch Day (checked 2026-10-29): it is no kind of its own.
    expect(isKnownKind('hatch-day')).toBe(false);
  });

  it('throws for a document that is no list of events, so that the caller keeps what it had', () => {
    expect(() => readListedEvents({ events: [] }, ZONE, { max: [], big: [] })).toThrow();
  });

  it('keeps only a link or picture of the web, and leaves out the rest of a broken item', () => {
    const listed = listingOf([
      {
        eventID: 'odd',
        name: 'Odd',
        eventType: 'event',
        link: 'javascript:alert(1)',
        image: 'http://example.com/a.png',
        start: '2026-11-01T10:00:00.000',
        end: '2026-11-02T10:00:00.000',
      },
      { eventID: 'no-name', eventType: 'event', start: '2026-11-01T10:00:00.000' },
    ]).read;
    expect(listed.map((one) => [one.id, one.link, one.image])).toEqual([['odd', null, null]]);
  });
});

// Branch review BR-1: a short or empty read is no news of drops.
describe('a short read (plan 8V-1, BR-1)', () => {
  const now = at('2026-11-10T12:00');
  const read = (events: ListedEvent[]): FeedListing => ({
    read: events,
    untimed: [],
    unknownKinds: [],
  });
  const on = event({ id: 'on', start: at('2026-11-09T10:00'), end: at('2026-11-13T20:00') });
  const coming = event({ id: 'coming' });
  const later = event({ id: 'later', start: at('2026-11-28T14:00'), end: at('2026-11-28T17:00') });

  it('is a read that lists no event at all', () => {
    expect(isShortRead([on, coming], read([]), now)).toBe(true);
    expect(isShortRead([], read([]), now)).toBe(true);
  });

  it('is a read that would drop every kept event not yet started', () => {
    expect(isShortRead([on, coming, later], read([on]), now)).toBe(true);
  });

  // Re-review RR-1: a short read is still merged, keeping what it would drop.
  it('merges a short read all the same, keeping the events it would drop and dropping none', () => {
    const added = event({
      id: 'added',
      name: 'Another event',
      start: at('2026-11-30T10:00'),
      end: at('2026-11-30T11:00'),
    });
    const moved = { ...on, start: at('2026-11-09T11:00') };
    const merged = mergeRead([on, coming], read([moved, added]), now);
    expect(merged.short).toBe(true);
    expect(merged.dropped).toEqual([]);
    expect(merged.events.map((one) => [one.id, one.start])).toEqual([
      ['on', at('2026-11-09T11:00')],
      ['coming', coming.start],
      ['added', added.start],
    ]);
    const normal = mergeRead([on, coming, later], read([on, coming]), now);
    expect(normal.short).toBe(false);
    expect(normal.dropped).toEqual([later]);
  });

  it('is not a read that keeps one of them, or that drops only what has begun', () => {
    expect(isShortRead([on, coming, later], read([on, coming]), now)).toBe(false);
    expect(isShortRead([on, coming], read([coming]), now)).toBe(false);
    expect(isShortRead([on], read([coming]), now)).toBe(false);
  });
});

describe('the kept events merged with a read (plan 8V-1)', () => {
  const now = at('2026-11-10T12:00');
  const read = (events: ListedEvent[], untimed: string[] = []): FeedListing => ({
    read: events,
    untimed,
    unknownKinds: [],
  });

  it('takes the read’s events, new ones and changed ones alike', () => {
    const kept = [event()];
    const later = event({ start: at('2026-11-21T15:00'), end: at('2026-11-21T18:00') });
    const added = event({ id: 'raidhour20261118', name: 'Raid Hour', eventType: 'raid-hour' });
    const merged = mergeListed(kept, read([later, added]), now);
    expect(merged.events).toEqual([later, added].sort((a, b) => a.start - b.start));
    expect(merged.moved).toEqual([]);
    expect(merged.dropped).toEqual([]);
  });

  it('keeps a known event the feed lists without times to its end (R3)', () => {
    const on = event({ start: at('2026-11-09T10:00'), end: at('2026-11-13T20:00') });
    const merged = mergeListed([on], read([], [on.id]), now);
    expect(merged.events).toEqual([on]);
    expect(merged.dropped).toEqual([]);
  });

  it('keeps one dropped after its start to its end, and forgets it after', () => {
    const on = event({ start: at('2026-11-09T10:00'), end: at('2026-11-13T20:00') });
    expect(mergeListed([on], read([]), now).events).toEqual([on]);
    expect(mergeListed([on], read([]), at('2026-11-13T20:00')).events).toEqual([]);
  });

  it('removes one dropped before its start, and says so', () => {
    const coming = event();
    const merged = mergeListed([coming], read([]), now);
    expect(merged.events).toEqual([]);
    expect(merged.dropped).toEqual([coming]);
  });

  it('carries a dropped event over to a new id of the same name and type: moved (R12)', () => {
    const old = event({ id: 'november-communityday2026', formerIds: ['earlier'] });
    const moved = event({
      id: 'november-communityday2026-rescheduled',
      name: 'Pawniard Community Day (Rescheduled)',
      start: at('2026-11-28T14:00'),
      end: at('2026-11-28T17:00'),
    });
    const merged = mergeListed([old], read([moved]), now);
    expect(merged.events).toEqual([
      { ...moved, formerIds: ['earlier', 'november-communityday2026'] },
    ]);
    expect(merged.moved).toEqual([
      { from: 'november-communityday2026', to: 'november-communityday2026-rescheduled' },
    ]);
    expect(merged.dropped).toEqual([]);
  });

  it('moves nothing to an id it knew already, or of another type, or while the old one stays', () => {
    const old = event();
    const known = event({ id: 'known', start: at('2026-11-28T14:00') });
    expect(mergeListed([old, known], read([known]), now).dropped).toEqual([old]);
    const other = event({ id: 'new', eventType: 'event' });
    expect(mergeListed([old], read([other]), now).dropped).toEqual([old]);
    const twin = event({ id: 'twin' });
    const both = mergeListed([old], read([old, twin]), now);
    expect(both.moved).toEqual([]);
    expect(both.events.map((one) => one.id)).toEqual(['november-communityday2026', 'twin']);
  });

  it('forgets what ended, read or kept', () => {
    const over = event({ start: at('2026-11-01T10:00'), end: at('2026-11-02T10:00') });
    expect(mergeListed([over], read([over]), now).events).toEqual([]);
  });

  it('tells one name from another, a "(Rescheduled)" mark, case and spaces aside', () => {
    expect(sameEventName('Pawniard Community Day', 'Pawniard  community day (Rescheduled)')).toBe(
      true,
    );
    expect(sameEventName('Pawniard Community Day', 'Pawniard Community Day Classic')).toBe(false);
  });
});

describe('an event’s times as plain local text (ruling A)', () => {
  it('says a day’s event with its weekday, date and hours', () => {
    expect(eventTimeWords(at('2026-11-21T14:00'), at('2026-11-21T17:00'), ZONE)).toBe(
      'Sat, Nov 21, 2–5 PM',
    );
    expect(eventTimeWords(at('2026-11-18T18:00'), at('2026-11-18T19:00'), ZONE)).toBe(
      'Wed, Nov 18, 6–7 PM',
    );
    expect(eventTimeWords(at('2026-10-26T06:00'), at('2026-10-26T21:00'), ZONE)).toBe(
      'Mon, Oct 26, 6 AM–9 PM',
    );
    expect(eventTimeWords(at('2026-12-11T17:30'), at('2026-12-11T23:59'), ZONE)).toBe(
      'Fri, Dec 11, 5:30–11:59 PM',
    );
    expect(eventTimeWords(at('2026-11-07T10:00'), at('2026-11-08T00:00'), ZONE)).toBe(
      'Sat, Nov 7, 10 AM–midnight',
    );
  });

  it('says an event of several days by its first and last date', () => {
    expect(eventTimeWords(at('2026-11-09T10:00'), at('2026-11-13T20:00'), ZONE)).toBe(
      'Nov 9 – Nov 13',
    );
    expect(eventTimeWords(at('2026-11-14T10:00'), at('2026-11-15T18:00'), ZONE)).toBe(
      'Nov 14 – Nov 15',
    );
    // An end at midnight is the day before's.
    expect(eventTimeWords(at('2026-11-27T10:00'), at('2026-11-29T00:00'), ZONE)).toBe(
      'Nov 27 – Nov 28',
    );
  });
});

describe('the listing’s sections and a post’s opening (plan 8V-1)', () => {
  const now = at('2026-11-10T12:00');

  it('puts what is on in Now, what starts within seven days in This week, then Coming up', () => {
    const on = event({ id: 'on', start: at('2026-11-09T10:00'), end: at('2026-11-13T20:00') });
    const week = event({ id: 'week', start: at('2026-11-17T11:00'), end: at('2026-11-17T12:00') });
    const coming = event({ id: 'coming' });
    const far = event({ id: 'far', start: at('2026-12-20T10:00'), end: at('2026-12-20T11:00') });
    const over = event({ id: 'over', start: at('2026-11-01T10:00'), end: at('2026-11-02T10:00') });
    const seasonal = event({ id: 'season', eventType: 'season' });
    const sections = listingSections([coming, far, week, on, over, seasonal], now, ZONE, 35);
    expect(sections.now.map((one) => one.id)).toEqual(['on']);
    expect(sections.week.map((one) => one.id)).toEqual(['week']);
    expect(sections.coming.map((one) => one.id)).toEqual(['coming']);
  });

  // Branch review BR-9: the moments a line moves from one section to another.
  it('names the moments an event changes section: its start, its end, a week and the horizon before', () => {
    const coming = event({ start: at('2026-12-20T18:00'), end: at('2026-12-20T19:00') });
    expect(sectionChangesAt(coming, 35, ZONE)).toEqual([
      at('2026-12-20T18:00'),
      at('2026-12-20T19:00'),
      at('2026-12-13T18:00'),
      at('2026-11-15T18:00'),
    ]);
    // By the local calendar, as listingSections: the same hour across the change of the clocks.
    const after = event({ start: at('2026-11-05T18:00'), end: at('2026-11-05T19:00') });
    expect(sectionChangesAt(after, 35, ZONE)[2]).toBe(at('2026-10-29T18:00'));
    expect(listingSections([after], at('2026-10-29T18:00') - 1, ZONE, 35).week).toEqual([]);
    expect(listingSections([after], at('2026-10-29T18:00') + 1, ZONE, 35).week).toEqual([after]);
  });

  it('opens a post the given days before its start, by the local calendar', () => {
    expect(postOpensAt(event(), 14, ZONE)).toBe(at('2026-11-07T14:00'));
  });
});
