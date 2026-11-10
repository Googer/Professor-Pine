import { describe, expect, it } from 'vitest';
import { MAX_FINALE, readEveryoneFeed } from '../../../test/support/event-reach.js';
import { readMaxEventFeed } from '../../../test/support/max-events.js';
import { MAX_ZONE } from '../../../test/support/max-bosses.js';
import { readSpawnEventFeed } from '../../../test/support/spawn-events.js';
import {
  editionsWithoutGlobal,
  everyonesTimes,
  hasOwnZone,
  isForEveryone,
  isForEveryoneKind,
  isGlobalEdition,
} from './event-reach.js';
import { parseBigEventFeed, parseMaxEventFeed } from './max-events.js';
import { parseRaidEventFeed } from './raid-events.js';
import { parseResearchEventFeed, unreadResearchTypes } from './research-events.js';
import { parseSpawnEventFeed } from './spawn-events.js';

const ZONE = 'America/New_York';

const event = (
  eventType: string,
  name: string,
  overrides: { eventID?: string; start?: string | null; end?: string | null } = {},
) => ({
  eventID: overrides.eventID ?? 'some-event-2027',
  eventType,
  name,
  start: '2027-03-01T10:00:00.000',
  end: '2027-03-02T20:00:00.000',
  ...overrides,
});

describe('isForEveryone: an event for every member wherever they play (plan 8R-7)', () => {
  it('tells a time with a zone of its own from a local one', () => {
    expect(hasOwnZone('2026-10-25T02:30:00.000Z')).toBe(true);
    expect(hasOwnZone('2027-05-30T01:00:00+09:00')).toBe(true);
    expect(hasOwnZone('2027-05-30T01:00:00-0500')).toBe(true);
    expect(hasOwnZone('2026-10-24T10:00:00.000')).toBe(false);
  });

  it('knows a Global edition by the word in its id or in its name, in any case', () => {
    expect(isGlobalEdition('pokemon-go-wild-area-2026-global', 'Pokémon GO Wild Area 2026')).toBe(
      true,
    );
    expect(isGlobalEdition('pokemon-go-fest-2027', 'Pokémon GO Fest 2027: Global')).toBe(true);
    expect(isGlobalEdition('GLOBAL-fest', 'Fest')).toBe(true);
    // A word inside another is none.
    expect(isGlobalEdition('globalized-2027', 'Globally yours')).toBe(false);
    expect(isGlobalEdition('pokemon-go-fest-2027-paris', 'Pokémon GO Fest 2027: Paris')).toBe(
      false,
    );
  });

  it('leaves out an in-person type in every edition, local times and all', () => {
    expect(isForEveryone(event('city-safari', 'Pokémon GO City Safari: Boston'))).toBe(false);
    expect(isForEveryone(event('city-safari', 'City Safari: Global'))).toBe(false);
    expect(isForEveryone(event('safari-zone', 'Safari Zone: Liverpool'))).toBe(false);
    expect(isForEveryoneKind('city-safari')).toBe(false);
  });

  // Matt, 2026-10-24 (review W1), in place of the Global rule of 8X-3 (Matt, 2026-10-21): every
  // city edition the feed has listed has zoned times, and GO Fest 2025's Max Finale, everyone's,
  // had local times and no "global" in its id or name.
  it('takes a Wild Area, GO Tour or GO Fest at local times, its name saying Global or not', () => {
    for (const eventType of ['wild-area', 'pokemon-go-tour', 'pokemon-go-fest']) {
      expect(isForEveryone(event(eventType, 'Something 2027: Global')), eventType).toBe(true);
      expect(isForEveryone(event(eventType, 'Something 2027: Paris')), eventType).toBe(true);
      expect(
        isForEveryone(event(eventType, 'Something 2027: Paris', { end: '2027-03-02T20:00:00Z' })),
        eventType,
      ).toBe(false);
      // A kept row was kept after the zone test: its kind is enough.
      expect(isForEveryoneKind(eventType), eventType).toBe(true);
    }
  });

  it('names those taken whose id and name both say no Global, for the log', () => {
    expect(
      editionsWithoutGlobal([
        MAX_FINALE,
        event('wild-area', 'Wild Area 2027: Global'),
        event('pokemon-go-tour', 'GO Tour 2027', { eventID: 'go-tour-global-2027' }),
        event('event', 'Into the Wild'),
        { not: 'an event' },
        null,
      ]),
    ).toEqual([
      {
        eventType: 'pokemon-go-fest',
        id: 'pokemon-go-fest-2025-max-finale',
        name: 'Pokémon GO Fest 2025: Max Finale',
      },
    ]);
    expect(editionsWithoutGlobal({ not: 'a list' })).toEqual([]);
  });

  it('leaves out any event at the fixed times of another zone, Global or not', () => {
    const night = event('event', 'Pokémon Night Out 2026 - Los Angeles', {
      start: '2026-10-25T02:30:00.000Z',
      end: '2026-10-25T06:59:59.000Z',
    });
    expect(isForEveryone(night)).toBe(false);
    expect(
      isForEveryone(event('wild-area', 'Wild Area: Global', { end: '2027-03-02T20:00:00Z' })),
    ).toBe(false);
    // The kind alone (a stored event's) says nothing of times.
    expect(isForEveryoneKind('event')).toBe(true);
  });

  it('takes every other type at local times, and one without hours as far as the kind goes', () => {
    expect(isForEveryone(event('event', 'Into the Wild'))).toBe(true);
    expect(isForEveryone(event('community-day', 'Pawniard Community Day'))).toBe(true);
    expect(isForEveryone(event('event', 'No hours', { start: null, end: null }))).toBe(true);
  });
});

describe('everyonesTimes: the one reader of a feed item’s times (plan 8V-1, R4)', () => {
  const at = (iso: string) => Temporal.PlainDateTime.from(iso).toZonedDateTime(ZONE);

  it('gives the local times of an event for everyone, read in the zone', () => {
    const times = everyonesTimes(event('community-day', 'Pawniard Community Day'), ZONE);
    expect(times.kind).toBe('times');
    if (times.kind !== 'times') return;
    expect(times.start.epochMilliseconds).toBe(at('2027-03-01T10:00').epochMilliseconds);
    expect(times.end.epochMilliseconds).toBe(at('2027-03-02T20:00').epochMilliseconds);
  });

  it('says an event is somebody else’s: zoned times, or an in-person type, with or without times', () => {
    const night = event('event', 'Pokémon Night Out', { start: '2027-03-01T02:30:00.000Z' });
    expect(everyonesTimes(night, ZONE)).toEqual({ kind: 'elsewhere' });
    expect(everyonesTimes(event('city-safari', 'City Safari: Boston'), ZONE)).toEqual({
      kind: 'elsewhere',
    });
    const untimedSafari = event('city-safari', 'City Safari', { start: null, end: null });
    expect(everyonesTimes(untimedSafari, ZONE)).toEqual({ kind: 'elsewhere' });
  });

  it('says the feed gave no times where either is left out or null', () => {
    for (const times of [
      { start: null, end: null },
      { start: '2027-03-01T10:00:00.000', end: null },
      { start: null, end: '2027-03-01T10:00:00.000' },
    ]) {
      expect(everyonesTimes(event('event', 'TCG celebration', times), ZONE)).toEqual({
        kind: 'none',
      });
    }
    const { start: _start, end: _end, ...bare } = event('event', 'No times at all');
    expect(everyonesTimes(bare, ZONE)).toEqual({ kind: 'none' });
  });

  it('says a time it cannot read is unreadable, never a throw', () => {
    const odd = event('event', 'Odd', { start: 'soon' });
    expect(everyonesTimes(odd, ZONE)).toEqual({ kind: 'unreadable' });
  });
});

describe('the readers on the feed of 2026-10-24 (plan 8R-7, R11)', () => {
  const feed = readEveryoneFeed();

  it('gives research only Into the Wild and the Community Day: no City Safari (F1)', () => {
    expect(parseResearchEventFeed(feed, ZONE).map((one) => one.id)).toEqual([
      'into-the-wild-2026',
      'november-communityday2026',
    ]);
  });

  it('gives the big events the two Global editions', () => {
    expect(parseBigEventFeed(feed, MAX_ZONE).map((one) => one.id)).toEqual([
      'pokemon-go-wild-area-2026-global',
      'pokemon-go-tour-alola-global-2027',
    ]);
  });

  it('gives the spawns Into the Wild, the Global Wild Area and the Community Day, as before', () => {
    expect(parseSpawnEventFeed(feed, ZONE).map((one) => one.id)).toEqual([
      'into-the-wild-2026',
      'pokemon-go-wild-area-2026-global',
      'november-communityday2026',
    ]);
  });

  // Review W3: every reader of the feed runs on it. None of its items is a Max Monday, a max
  // battle day, a Raid Hour or a Raid Day, and Night Out's UTC times are no pattern for hours.
  it('gives the max events and the raid events nothing: none of these is theirs', () => {
    expect(parseMaxEventFeed(feed, MAX_ZONE)).toEqual({ events: [], assumed: [], unhoured: [] });
    expect(parseRaidEventFeed(feed, ZONE)).toEqual([]);
  });

  it('names no research type it does not know: the City Safari is known and left out', () => {
    expect(unreadResearchTypes(feed)).toEqual([]);
  });

  it('reads the older recorded feeds as before', () => {
    expect(parseResearchEventFeed(readMaxEventFeed(), ZONE).map((one) => one.id)).toEqual([
      'into-the-wild-2026',
      'november-communityday2026',
    ]);
    expect(parseResearchEventFeed(readSpawnEventFeed(), ZONE).map((one) => one.id)).toEqual([
      'into-the-wild-2026',
      'november-communityday2026',
    ]);
    expect(parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events).toHaveLength(7);
  });
});

describe('a GO Fest at local times without "global" (Matt, 2026-10-24; review W1)', () => {
  const zoned = {
    ...MAX_FINALE,
    eventID: 'pokemon-go-fest-2025-osaka',
    name: 'Pokémon GO Fest 2025: Osaka',
    start: '2025-05-29T01:00:00.000Z',
    end: '2025-06-01T09:00:00.000Z',
  };

  it('is read by research, the big events and the spawns: GO Fest 2025’s Max Finale', () => {
    expect(parseResearchEventFeed([MAX_FINALE], ZONE).map((one) => one.id)).toEqual([
      MAX_FINALE.eventID,
    ]);
    expect(parseBigEventFeed([MAX_FINALE], MAX_ZONE).map((one) => one.id)).toEqual([
      MAX_FINALE.eventID,
    ]);
    expect(parseSpawnEventFeed([MAX_FINALE], ZONE).map((one) => one.id)).toEqual([
      MAX_FINALE.eventID,
    ]);
  });

  it('while a city’s edition at zoned times is read by none', () => {
    expect(parseResearchEventFeed([zoned], ZONE)).toEqual([]);
    expect(parseBigEventFeed([zoned], MAX_ZONE)).toEqual([]);
    expect(parseSpawnEventFeed([zoned], ZONE)).toEqual([]);
  });
});
