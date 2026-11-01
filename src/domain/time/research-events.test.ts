import { describe, expect, it } from 'vitest';
import { readMaxEventFeed } from '../../../test/support/max-events.js';
import { INTO_THE_WILD, PAWNIARD_DAY } from '../../../test/support/research-store-cases.js';
import {
  feedHasResearchFlags,
  parseResearchEventFeed,
  unreadResearchTypes,
} from './research-events.js';

const ZONE = 'America/New_York';

describe('parseResearchEventFeed', () => {
  it('reads the events with field research of their own from the recorded feed, in local time', () => {
    expect(parseResearchEventFeed(readMaxEventFeed(), ZONE)).toEqual([INTO_THE_WILD, PAWNIARD_DAY]);
  });

  it('says whether the feed has the research flags at all (events.min.json may lose them)', () => {
    expect(feedHasResearchFlags(readMaxEventFeed())).toBe(true);
    expect(
      feedHasResearchFlags([
        { eventID: 'a', eventType: 'event', name: 'A', start: null, end: null },
      ]),
    ).toBe(false);
  });

  it('leaves out an event without hours, without an id, of a city edition, or that ends first', () => {
    const flagged = { extraData: { generic: { hasFieldResearchTasks: true } } };
    const feed = [
      {
        eventID: 'no-hours',
        eventType: 'event',
        name: 'No hours',
        start: null,
        end: null,
        ...flagged,
      },
      {
        eventType: 'event',
        name: 'No id',
        start: '2026-11-01T10:00:00.000',
        end: '2026-11-01T12:00:00.000',
        ...flagged,
      },
      {
        eventID: 'city',
        eventType: 'pokemon-go-fest',
        name: 'City',
        start: '2026-11-01T10:00:00.000Z',
        end: '2026-11-02T10:00:00.000Z',
        ...flagged,
      },
      {
        eventID: 'backwards',
        eventType: 'event',
        name: 'Backwards',
        start: '2026-11-01T12:00:00.000',
        end: '2026-11-01T10:00:00.000',
        ...flagged,
      },
      {
        eventID: 'plain',
        eventType: 'event',
        name: 'Without research',
        start: '2026-11-01T10:00:00.000',
        end: '2026-11-01T12:00:00.000',
      },
    ];
    expect(parseResearchEventFeed(feed, ZONE)).toEqual([]);
    expect(() => parseResearchEventFeed({ not: 'a list' }, ZONE)).toThrow();
  });

  describe('only events for everyone (plan 8R-7, F1; Matt’s R2)', () => {
    const flagged = { extraData: { generic: { hasFieldResearchTasks: true } } };
    const item = (eventType: string, name: string, eventID = name, local = true) => ({
      eventID,
      eventType,
      name,
      start: local ? '2027-03-01T10:00:00.000' : '2027-03-01T15:00:00.000Z',
      end: local ? '2027-03-01T17:00:00.000' : '2027-03-01T22:00:00.000Z',
      ...flagged,
    });
    const ids = (feed: unknown[]) => parseResearchEventFeed(feed, ZONE).map((one) => one.id);

    it('leaves out the City Safari as the feed had it on 2026-10-24, local times and all', () => {
      const safari = {
        eventID: 'pokemon-go-city-safari-boston-2026-rescheduled',
        eventType: 'city-safari',
        name: 'Pokémon GO City Safari: Boston (Rescheduled)',
        start: '2026-10-24T10:00:00.000',
        end: '2026-10-25T18:00:00.000',
        extraData: { generic: { hasSpawns: true, hasFieldResearchTasks: true } },
      };
      expect(parseResearchEventFeed([safari], ZONE)).toEqual([]);
      expect(ids([item('safari-zone', 'Safari Zone: Liverpool')])).toEqual([]);
    });

    // Matt, 2026-10-24 (review W1): local times are enough for these three types; every city
    // edition the feed has listed came with zoned times (left out below and in event-reach).
    it('reads a Wild Area, GO Tour or GO Fest at local times whose name says no Global', () => {
      expect(
        new Set(
          ids([
            item('wild-area', 'Wild Area 2027: Sendai'),
            item('pokemon-go-tour', 'GO Tour: Alola - Los Angeles 2027'),
            item('pokemon-go-fest', 'Pokémon GO Fest 2027: Paris'),
          ]),
        ),
      ).toEqual(
        new Set([
          'Wild Area 2027: Sendai',
          'GO Tour: Alola - Los Angeles 2027',
          'Pokémon GO Fest 2027: Paris',
        ]),
      );
    });

    it('reads their Global editions, by the word in the id or in the name', () => {
      const read = ids([
        item('wild-area', 'Wild Area 2027: Global'),
        item('pokemon-go-tour', 'GO Tour: Alola 2027', 'pokemon-go-tour-alola-global-2027'),
        item('pokemon-go-fest', 'Pokémon GO Fest 2027: Global'),
      ]);
      expect(new Set(read)).toEqual(
        new Set([
          'Wild Area 2027: Global',
          'pokemon-go-tour-alola-global-2027',
          'Pokémon GO Fest 2027: Global',
        ]),
      );
    });

    it('reads the types on the list, and no other', () => {
      expect(
        ids([
          item('event', 'An event'),
          item('community-day', 'A day'),
          item('research-day', 'A research day'),
          item('season', 'A season'),
          item('go-battle-league', 'A league'),
          item('brand-new-type', 'Something new'),
        ]).sort(),
      ).toEqual(['A day', 'A research day', 'An event']);
    });

    it('names the types with research it does not read, each once, but no in-person one', () => {
      expect(
        unreadResearchTypes([
          item('brand-new-type', 'Something new', 'new-1'),
          item('brand-new-type', 'Something new again', 'new-2'),
          item('season', 'A season', 'season-25'),
          item('city-safari', 'City Safari: Boston', 'safari'),
          item('event', 'An event', 'event'),
          // Without the flag: no research, nothing to say.
          { ...item('another-type', 'Plain', 'plain'), extraData: {} },
        ]),
      ).toEqual([
        { eventType: 'brand-new-type', id: 'new-1' },
        { eventType: 'season', id: 'season-25' },
      ]);
      expect(unreadResearchTypes({ not: 'a list' })).toEqual([]);
    });

    it('still leaves out a Global edition at the fixed times of another zone', () => {
      expect(ids([item('wild-area', 'Wild Area 2027: Global', 'w', false)])).toEqual([]);
    });
  });
});
