import { describe, expect, it } from 'vitest';
import { at, MAX_ZONE } from '../../../test/support/max-bosses.js';
import { readMaxEventFeed } from '../../../test/support/max-events.js';
import { BIG_EVENT_TYPES, bigEventAt, parseBigEventFeed, parseMaxEventFeed } from './max-events.js';

const recorded = parseBigEventFeed(readMaxEventFeed(), MAX_ZONE);

describe('parseBigEventFeed: the events with Gigantamax battles all day (plan 8X-3)', () => {
  it('reads the global Wild Area and GO Tour of the recorded feed, in local time', () => {
    expect(recorded).toEqual([
      {
        id: 'pokemon-go-wild-area-2026-global',
        name: 'Pokémon GO Wild Area 2026: Global',
        start: at('2026-11-14T10:00'),
        end: at('2026-11-15T18:00'),
        startLocal: '2026-11-14T10:00:00',
        endLocal: '2026-11-15T18:00:00',
      },
      {
        id: 'pokemon-go-tour-alola-global-2027',
        name: 'Pokémon GO Tour: Alola - Global 2027',
        start: at('2027-02-27T00:00'),
        end: at('2027-02-28T23:59:59'),
        startLocal: '2027-02-27T00:00:00',
        endLocal: '2027-02-28T23:59:59',
      },
    ]);
  });

  it('leaves the in-person city editions out (Matt, 2026-10-21): another city, UTC times', () => {
    const names = recorded.map((event) => event.name);
    expect(names.some((name) => /Sendai|Mexico City|Kaohsiung|Los Angeles/.test(name))).toBe(false);
  });

  it('takes GO Fest Global by its kind, one line in a list of kinds', () => {
    expect(BIG_EVENT_TYPES).toEqual(['wild-area', 'pokemon-go-tour', 'pokemon-go-fest']);
    const fest = parseBigEventFeed(
      [
        {
          eventID: 'pokemon-go-fest-2027-global',
          eventType: 'pokemon-go-fest',
          name: 'Pokémon GO Fest 2027: Global',
          start: '2027-07-10T10:00:00.000',
          end: '2027-07-11T18:00:00.000',
        },
      ],
      MAX_ZONE,
    );
    expect(fest.map((event) => event.name)).toEqual(['Pokémon GO Fest 2027: Global']);
  });

  // Matt, 2026-10-24 (review W1), in place of the Global rule of 2026-10-21: local times are
  // enough, whatever the name says (GO Fest 2025's Max Finale was everyone's and said no
  // "global"); every city edition the feed has listed came with zoned times.
  it('takes every edition at local times, its name saying Global or not, and none at zoned', () => {
    const item = (eventID: string, eventType: string, name: string, zoned = false) => ({
      eventID,
      eventType,
      name,
      start: zoned ? '2027-07-10T01:00:00.000Z' : '2027-07-10T10:00:00.000',
      end: zoned ? '2027-07-11T09:00:00.000Z' : '2027-07-11T18:00:00.000',
    });
    const read = parseBigEventFeed(
      [
        item('pokemon-go-fest-2027', 'pokemon-go-fest', 'Pokémon GO Fest 2027: Global'),
        item('pokemon-go-fest-2027-paris', 'pokemon-go-fest', 'Pokémon GO Fest 2027: Paris'),
        item('pokemon-go-tour-alola-honolulu', 'pokemon-go-tour', 'GO Tour: Alola - Honolulu'),
        item('wild-area-sendai-2027', 'wild-area', 'Wild Area 2027: Sendai', true),
      ],
      MAX_ZONE,
    );
    expect(read.map((event) => event.id).sort()).toEqual([
      'pokemon-go-fest-2027',
      'pokemon-go-fest-2027-paris',
      'pokemon-go-tour-alola-honolulu',
    ]);
  });

  it('refuses what is no event of these: another kind, no hours, an end before the start', () => {
    const feed = [
      {
        eventID: 'x-global',
        eventType: 'community-day',
        name: 'A',
        start: '2026-11-01T10:00:00.000',
        end: '2026-11-01T12:00:00.000',
      },
      { eventID: 'wild-area-global', eventType: 'wild-area', name: 'B', start: null, end: null },
      {
        eventID: 'wild-area-global-2',
        eventType: 'wild-area',
        name: 'C',
        start: '2026-11-02T10:00:00.000',
        end: '2026-11-01T10:00:00.000',
      },
    ];
    expect(parseBigEventFeed(feed, MAX_ZONE)).toEqual([]);
    expect(() => parseBigEventFeed({}, MAX_ZONE)).toThrow(/not a list/);
  });

  it('features nothing and keeps the max events as they were', () => {
    // The Max Mondays and Max Battle Days of 8X-2 read as before.
    expect(parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events).toHaveLength(7);
  });
});

describe('bigEventAt', () => {
  it('is the big event on at a time, its start included and its end not', () => {
    expect(bigEventAt(recorded, at('2026-11-14T10:00'))?.name).toBe(
      'Pokémon GO Wild Area 2026: Global',
    );
    expect(bigEventAt(recorded, at('2026-11-15T17:59'))).toBeDefined();
    expect(bigEventAt(recorded, at('2026-11-15T18:00'))).toBeUndefined();
    expect(bigEventAt(recorded, at('2026-11-14T09:59'))).toBeUndefined();
  });
});
