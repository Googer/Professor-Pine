import { describe, expect, it } from 'vitest';
import { at, MAX_ZONE } from '../../../test/support/max-bosses.js';
import { readMaxEventFeed } from '../../../test/support/max-events.js';
import {
  featuredAt,
  featuredNames,
  maxEventAt,
  parseMaxEventFeed,
  type MaxEvent,
} from './max-events.js';

const recorded = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE);
const named = (name: string): MaxEvent => {
  const found = recorded.events.find((event) => event.name === name);
  if (!found) throw new Error(`no event ${name}`);
  return found;
};

describe('featuredNames', () => {
  it('reads the bosses a Max Monday, a Max Battle Day or Weekend names', () => {
    expect(featuredNames('Dynamax Sneasel during Max Monday')).toEqual({
      gigantamax: false,
      names: ['Sneasel'],
    });
    expect(featuredNames('Dynamax Uxie, Mesprit, and Azelf Max Battle Day')).toEqual({
      gigantamax: false,
      names: ['Uxie', 'Mesprit', 'Azelf'],
    });
    expect(featuredNames('Dynamax Lugia Max Battle Weekend')?.names).toEqual(['Lugia']);
    expect(featuredNames('Gigantamax Machamp Max Battle Day')).toEqual({
      gigantamax: true,
      names: ['Machamp'],
    });
    expect(featuredNames('Dynamax Latios & Latias Max Battle Day')?.names).toEqual([
      'Latios',
      'Latias',
    ]);
  });

  it('reads nothing from a name that names no boss', () => {
    expect(featuredNames('Max Monday: Pokémon to be announced')).toBeUndefined();
    expect(featuredNames('Dynamax Trails')).toBeUndefined();
    expect(featuredNames('Max Battle Day')).toBeUndefined();
  });
});

describe('parseMaxEventFeed: the recorded feed', () => {
  it('keeps the Max Mondays and Max Battle Days, and no other kind', () => {
    expect(recorded.events.map((event) => [event.kind, event.name])).toEqual([
      ['max-monday', 'Dynamax Sneasel during Max Monday'],
      ['max-battle', 'Dynamax Uxie, Mesprit, and Azelf Max Battle Day'],
      ['max-monday', 'Dynamax Sableye during Max Monday'],
      ['max-monday', 'Dynamax Machop during Max Monday'],
      ['max-monday', 'Max Monday: Pokémon to be announced'],
      ['max-monday', 'Dynamax Espurr during Max Monday'],
      ['max-monday', 'Dynamax Cryogonal during Max Monday'],
    ]);
  });

  it("takes the feed's own hours: a Max Battle Day is short, a Max Monday all day", () => {
    expect(named('Dynamax Uxie, Mesprit, and Azelf Max Battle Day')).toEqual({
      kind: 'max-battle',
      name: 'Dynamax Uxie, Mesprit, and Azelf Max Battle Day',
      start: at('2026-10-24T14:00'),
      end: at('2026-10-24T17:00'),
      short: true,
      hoursAssumed: false,
      featured: { gigantamax: false, names: ['Uxie', 'Mesprit', 'Azelf'] },
      id: 'dynamax-uxie-mesprit-azelf-max-battle-day-2026',
    });
    expect(named('Dynamax Sableye during Max Monday')).toMatchObject({
      start: at('2026-10-26T06:00'),
      end: at('2026-10-26T21:00'),
      short: false,
    });
    expect(named('Max Monday: Pokémon to be announced').featured).toBeUndefined();
  });

  it('assumes the hours of a Max Monday the feed gives none from the nearest of its kind', () => {
    expect(named('Dynamax Sneasel during Max Monday')).toMatchObject({
      start: at('2026-10-19T06:00'),
      end: at('2026-10-19T21:00'),
      hoursAssumed: true,
      short: false,
    });
    expect(recorded.assumed).toEqual(['Dynamax Sneasel during Max Monday']);
    expect(recorded.unhoured).toEqual([]);
  });
});

describe('parseMaxEventFeed: what the feed may also hold', () => {
  const item = (extra: Record<string, unknown>) => ({
    eventID: 'some-event',
    name: 'Dynamax Lugia Max Battle Weekend',
    eventType: 'max-battles',
    start: '2026-11-07T06:00:00.000',
    end: '2026-11-08T21:00:00.000',
    ...extra,
  });

  it('keeps a weekend from its start to its end, nights included, as all day', () => {
    const [weekend] = parseMaxEventFeed([item({})], MAX_ZONE).events;
    expect(weekend).toMatchObject({
      start: at('2026-11-07T06:00'),
      end: at('2026-11-08T21:00'),
      short: false,
      featured: { gigantamax: false, names: ['Lugia'] },
    });
    expect(weekend && maxEventAt([weekend], at('2026-11-08T02:00'))).toBe(weekend);
  });

  it('assumes a weekend of hours across the days of the event it copies', () => {
    const parsed = parseMaxEventFeed(
      [
        item({}),
        item({
          eventID: 'dynamax-ho-oh-weekend-2026-11-21',
          name: 'Dynamax Ho-Oh Max Battle Weekend',
          start: null,
          end: null,
        }),
      ],
      MAX_ZONE,
    );
    expect(parsed.events[1]).toMatchObject({
      start: at('2026-11-21T06:00'),
      end: at('2026-11-22T21:00'),
      hoursAssumed: true,
    });
  });

  it('assumes the hours of the same kind of event: a weekend from a weekend, a day from a day', () => {
    const parsed = parseMaxEventFeed(
      [
        item({}),
        item({
          eventID: 'dynamax-latios-max-battle-day-2026-11-20',
          name: 'Dynamax Latios Max Battle Day',
          start: '2026-11-20T14:00:00.000',
          end: '2026-11-20T17:00:00.000',
        }),
        item({
          eventID: 'dynamax-ho-oh-weekend-2026-11-21',
          name: 'Dynamax Ho-Oh Max Battle Weekend',
          start: null,
          end: null,
        }),
        item({
          eventID: 'dynamax-entei-max-battle-day-2026-11-09',
          name: 'Dynamax Entei Max Battle Day',
          start: null,
          end: null,
        }),
      ],
      MAX_ZONE,
    );
    const named = (name: string) => parsed.events.find((event) => event.name === name);
    // The Latios day is nearer to the Ho-Oh weekend, but a weekend copies a weekend.
    expect(named('Dynamax Ho-Oh Max Battle Weekend')).toMatchObject({
      start: at('2026-11-21T06:00'),
      end: at('2026-11-22T21:00'),
    });
    // The Lugia weekend is nearer to the Entei day, but a day copies a day.
    expect(named('Dynamax Entei Max Battle Day')).toMatchObject({
      start: at('2026-11-09T14:00'),
      end: at('2026-11-09T17:00'),
      short: true,
    });
  });

  it('assumes the hours of a Max Monday whose name says no boss from another Max Monday', () => {
    const parsed = parseMaxEventFeed(
      [
        item({
          eventID: 'max-mondays-2026-12-07',
          eventType: 'max-mondays',
          name: 'Dynamax Abra during Max Monday',
          start: '2026-12-07T06:00:00.000',
          end: '2026-12-07T21:00:00.000',
        }),
        item({
          eventID: 'max-mondays-2026-12-14',
          eventType: 'max-mondays',
          name: 'Max Monday: Pokémon to be announced',
          start: null,
          end: null,
        }),
      ],
      MAX_ZONE,
    );
    expect(parsed.events[1]).toMatchObject({
      name: 'Max Monday: Pokémon to be announced',
      start: at('2026-12-14T06:00'),
      end: at('2026-12-14T21:00'),
      hoursAssumed: true,
      featured: undefined,
    });
    expect(parsed.unhoured).toEqual([]);
  });

  it('features nothing of an event without hours it cannot assume, and says which', () => {
    const parsed = parseMaxEventFeed(
      [
        item({
          eventID: 'max-mondays-2026-12-07',
          eventType: 'max-mondays',
          name: 'Dynamax Abra during Max Monday',
          start: null,
          end: null,
        }),
        item({ eventID: 'no-date-here', start: null, end: null }),
      ],
      MAX_ZONE,
    );
    expect(parsed.events).toEqual([]);
    expect(parsed.unhoured).toEqual([
      { name: 'Dynamax Abra during Max Monday', date: '2026-12-07' },
      { name: 'Dynamax Lugia Max Battle Weekend', date: undefined },
    ]);
  });

  it('leaves out what is no event of its kind', () => {
    const parsed = parseMaxEventFeed(
      [
        item({ end: '2026-11-06T21:00:00.000' }),
        item({ end: '2026-11-30T21:00:00.000' }),
        item({ eventType: 'event' }),
        item({ name: 7 }),
      ],
      MAX_ZONE,
    );
    expect(parsed.events).toEqual([]);
  });

  it('leaves out an event at the fixed times of another zone, and copies no hours of it (8R-7)', () => {
    const parsed = parseMaxEventFeed(
      [
        item({ start: '2026-11-07T06:00:00.000Z', end: '2026-11-08T21:00:00.000Z' }),
        item({ start: '2026-11-07T06:00:00.000', end: '2026-11-08T21:00:00+09:00' }),
        item({
          eventID: 'dynamax-ho-oh-weekend-2026-11-21',
          name: 'Dynamax Ho-Oh Max Battle Weekend',
          start: null,
          end: null,
        }),
      ],
      MAX_ZONE,
    );
    expect(parsed.events).toEqual([]);
    expect(parsed.unhoured).toEqual([
      { name: 'Dynamax Ho-Oh Max Battle Weekend', date: '2026-11-21' },
    ]);
  });

  it('refuses a document that is no list of events', () => {
    expect(() => parseMaxEventFeed({ events: [] }, MAX_ZONE)).toThrow(/not a list of events/);
  });
});

describe('maxEventAt', () => {
  it('is the event on at a time, with its kind and hours', () => {
    const day = named('Dynamax Uxie, Mesprit, and Azelf Max Battle Day');
    expect(maxEventAt(recorded.events, at('2026-10-24T14:00'))).toBe(day);
    expect(maxEventAt(recorded.events, at('2026-10-24T16:59'))).toBe(day);
    expect(maxEventAt(recorded.events, at('2026-10-24T17:00'))).toBeUndefined();
    expect(maxEventAt(recorded.events, at('2026-10-26T12:00'))?.name).toBe(
      'Dynamax Sableye during Max Monday',
    );
    expect(maxEventAt(recorded.events, at('2026-10-26T22:00'))).toBeUndefined();
  });

  it('is a Max Battle Day before a Max Monday at the same time', () => {
    const monday = named('Dynamax Sableye during Max Monday');
    const battle: MaxEvent = { ...monday, kind: 'max-battle', name: 'Overlap', short: true };
    expect(maxEventAt([monday, battle], at('2026-10-26T12:00'))).toBe(battle);
  });
});

describe('featuredAt', () => {
  const names = (time: number) =>
    featuredAt(recorded.events, time, MAX_ZONE).map(({ event }) => event.name);

  it("features a Max Monday's boss for its week, until the next Max Monday", () => {
    expect(names(at('2026-10-26T05:59'))).toEqual(['Dynamax Sneasel during Max Monday']);
    expect(names(at('2026-10-26T06:00'))).toEqual(['Dynamax Sableye during Max Monday']);
    expect(names(at('2026-11-01T23:00'))).toEqual(['Dynamax Sableye during Max Monday']);
    expect(names(at('2026-11-02T06:00'))).toEqual(['Dynamax Machop during Max Monday']);
    expect(names(at('2026-10-19T05:59'))).toEqual([]);
  });

  it('features a Max Battle Day during its hours, before the boss of the week', () => {
    expect(names(at('2026-10-24T14:00'))).toEqual([
      'Dynamax Uxie, Mesprit, and Azelf Max Battle Day',
      'Dynamax Sneasel during Max Monday',
    ]);
    expect(names(at('2026-10-24T17:00'))).toEqual(['Dynamax Sneasel during Max Monday']);
  });

  it('features nothing in the week of a Max Monday that names no boss, and at most 7 days', () => {
    expect(names(at('2026-11-16T12:00'))).toEqual([]);
    // Cryogonal's Monday is the last: its week ends 7 days after its start.
    expect(names(at('2026-12-07T05:59'))).toEqual(['Dynamax Cryogonal during Max Monday']);
    expect(names(at('2026-12-07T06:00'))).toEqual([]);
  });

  it('ends a week at the same local hour across a change of the clocks', () => {
    const sableye = recorded.events.filter(
      (event) => event.name === 'Dynamax Sableye during Max Monday',
    );
    // The clocks go back on 2026-11-01: a week is 169 hours then, not 168.
    const week = (time: number) => featuredAt(sableye, time, MAX_ZONE).length;
    expect(week(at('2026-11-02T05:59'))).toBe(1);
    expect(week(at('2026-11-02T06:00'))).toBe(0);
  });
});
