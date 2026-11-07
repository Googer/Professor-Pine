import { describe, expect, it } from 'vitest';
import { readRaidEventFeed } from '../../../test/support/raid-events.js';
import {
  eventPageRaidHours,
  parseRaidEventFeed,
  withPageRaidHours,
  type RaidEvent,
} from './raid-events.js';
import { zonedAt } from '../../../test/support/time.js';

const ZONE = 'America/New_York';
const at = (iso: string, zone = ZONE): number => zonedAt(iso, zone);

describe('parseRaidEventFeed', () => {
  it('keeps the Raid Hours and Raid Days of the downloaded feed, in order of time', () => {
    const events = parseRaidEventFeed(readRaidEventFeed(), ZONE);
    expect(events.map((event) => [event.kind, event.name])).toEqual([
      ['raid-hour', 'Dialga Raid Hour'],
      ['raid-hour', 'Palkia Raid Hour'],
      ['raid-hour', 'Giratina (Origin Forme) Raid Hour'],
      ['raid-day', 'Super Mega Raid Day'],
      ['raid-day', 'Super Mega Raid Day'],
    ]);
    expect(events[0]).toEqual({
      kind: 'raid-hour',
      name: 'Dialga Raid Hour',
      start: at('2026-10-14T18:00'),
      end: at('2026-10-14T19:00'),
    });
  });

  it('reads a time without a zone as local time and keeps the zone of one that has it', () => {
    const feed = [
      {
        eventType: 'raid-hour',
        name: 'Local',
        start: '2026-10-14T18:00:00.000',
        end: '2026-10-14T19:00:00.000',
      },
      {
        eventType: 'raid-day',
        name: 'Global',
        start: '2026-10-17T18:00:00.000Z',
        end: '2026-10-17T21:00:00.000Z',
      },
    ];
    const [local, global] = parseRaidEventFeed(feed, 'Europe/Berlin');
    expect(local?.start).toBe(at('2026-10-14T18:00', 'Europe/Berlin'));
    expect(global?.start).toBe(Date.UTC(2026, 9, 17, 18));
  });

  it('leaves out a raid event it cannot read, and keeps the others', () => {
    const good = {
      eventType: 'raid-hour',
      name: 'Good',
      start: '2026-10-14T18:00',
      end: '2026-10-14T19:00',
    };
    const events = parseRaidEventFeed(
      [
        good,
        { ...good, name: 'No end', end: null },
        { ...good, name: 'Not a time', start: 'soon' },
        { ...good, name: 'Backwards', start: '2026-10-14T19:00', end: '2026-10-14T18:00' },
        { ...good, name: 'A whole week', end: '2026-10-21T18:00' },
        { ...good, name: '' },
        { ...good, name: 42 },
      ],
      ZONE,
    );
    expect(events.map((event) => event.name)).toEqual(['Good']);
  });

  it('removes control characters from a name', () => {
    const [event] = parseRaidEventFeed(
      [
        {
          eventType: 'raid-day',
          name: 'Mega\n\u202eDay\t ',
          start: '2026-10-31T14:00',
          end: '2026-10-31T17:00',
        },
      ],
      ZONE,
    );
    expect(event?.name).toBe('Mega Day');
  });

  it('accepts a feed without raid events', () => {
    expect(parseRaidEventFeed([{ eventType: 'season', name: 'Season' }], ZONE)).toEqual([]);
  });

  it('ignores an item that is not an event instead of refusing the feed', () => {
    expect(parseRaidEventFeed([1, { eventType: 'season', name: 'Season' }], ZONE)).toEqual([]);
  });

  it('cuts a long name to 100 characters', () => {
    const [event] = parseRaidEventFeed(
      [
        {
          eventType: 'raid-day',
          name: 'x'.repeat(150),
          start: '2026-10-31T14:00',
          end: '2026-10-31T17:00',
        },
      ],
      ZONE,
    );
    expect(event?.name).toHaveLength(100);
  });

  it('cuts a long name by characters, never inside an emoji, and without a trailing space', () => {
    const nameOf = (name: string): string | undefined =>
      parseRaidEventFeed(
        [{ eventType: 'raid-day', name, start: '2026-10-31T14:00', end: '2026-10-31T17:00' }],
        ZONE,
      )[0]?.name;

    const insideEmoji = nameOf(`${'a'.repeat(98)} \u{1F409} and more text`);
    expect(/[\uD800-\uDFFF]/u.test(insideEmoji ?? '')).toBe(false);
    expect(insideEmoji?.endsWith('\u{1F409}')).toBe(true);

    const atSpace = nameOf(`${'a'.repeat(99)} \u{1F409} and more text`);
    expect(atSpace).toBe('a'.repeat(99));
  });

  it('refuses what is not a list of events', () => {
    for (const json of [null, {}, [], 'events', [{ name: 'no type' }], [1, 2]]) {
      expect(() => parseRaidEventFeed(json, ZONE)).toThrow('not a list of events');
    }
  });
});

describe('eventPageRaidHours', () => {
  const WEEKLY = { hour: 18, minutes: 60 };
  const INTO_THE_WILD = { start: at('2026-11-09T10:00'), end: at('2026-11-13T20:00') };
  const hour = (iso: string, name: string, minutes = 60): RaidEvent => ({
    kind: 'raid-hour',
    name,
    start: at(iso),
    end: at(iso) + minutes * 60_000,
  });

  it('places each day of the page at the weekly Raid Hour’s time, named by its bosses', () => {
    const page = [
      { month: 11, day: 9, bosses: ['Zacian (Crowned Sword)'] },
      { month: 11, day: 10, bosses: ['Zamazenta (Crowned Shield)'] },
    ];
    expect(eventPageRaidHours(page, INTO_THE_WILD, WEEKLY, ZONE)).toEqual([
      hour('2026-11-09T18:00', 'Zacian (Crowned Sword) Raid Hour'),
      hour('2026-11-10T18:00', 'Zamazenta (Crowned Shield) Raid Hour'),
    ]);
    // The weekly one's hour and length; 18:00 for an hour without it.
    expect(
      eventPageRaidHours(page.slice(0, 1), INTO_THE_WILD, { hour: 17, minutes: 90 }, ZONE),
    ).toEqual([hour('2026-11-09T17:00', 'Zacian (Crowned Sword) Raid Hour', 90)]);
    expect(eventPageRaidHours(page.slice(0, 1), INTO_THE_WILD, null, ZONE)).toEqual([
      hour('2026-11-09T18:00', 'Zacian (Crowned Sword) Raid Hour'),
    ]);
  });

  it('places each day at the page’s own time where it gives one, minutes included', () => {
    const page = [{ month: 11, day: 9, bosses: ['Zacian (Crowned Sword)'] }];
    expect(
      eventPageRaidHours(page, INTO_THE_WILD, { hour: 17, minute: 30, minutes: 90 }, ZONE),
    ).toEqual([hour('2026-11-09T17:30', 'Zacian (Crowned Sword) Raid Hour', 90)]);
  });

  it('names a Raid Hour without bosses "Raid Hour", and several bosses with "and"', () => {
    const page = [
      { month: 11, day: 11, bosses: [] },
      { month: 11, day: 12, bosses: ['Palkia', 'Dialga​ \n'] },
    ];
    expect(eventPageRaidHours(page, INTO_THE_WILD, WEEKLY, ZONE).map((one) => one.name)).toEqual([
      'Raid Hour',
      'Palkia and Dialga Raid Hour',
    ]);
  });

  it('drops a day outside the event, and one listed twice', () => {
    const page = [
      { month: 11, day: 8, bosses: [] },
      { month: 11, day: 13, bosses: ['A'] },
      { month: 11, day: 13, bosses: ['B'] },
      { month: 11, day: 14, bosses: [] },
    ];
    expect(eventPageRaidHours(page, INTO_THE_WILD, WEEKLY, ZONE)).toEqual([
      hour('2026-11-13T18:00', 'A Raid Hour'),
    ]);
    // An event that ends at midnight has no Raid Hour on the day of its end.
    const twoDays = { start: at('2026-11-09T00:00'), end: at('2026-11-11T00:00') };
    expect(eventPageRaidHours([{ month: 11, day: 11, bosses: [] }], twoDays, WEEKLY, ZONE)).toEqual(
      [],
    );
  });

  it('chooses the year in which the day falls within the event', () => {
    const newYear = { start: at('2026-12-28T10:00'), end: at('2027-01-03T20:00') };
    const page = [
      { month: 12, day: 29, bosses: [] },
      { month: 1, day: 2, bosses: [] },
      { month: 2, day: 3, bosses: [] },
    ];
    expect(eventPageRaidHours(page, newYear, WEEKLY, ZONE)).toEqual([
      hour('2026-12-29T18:00', 'Raid Hour'),
      hour('2027-01-02T18:00', 'Raid Hour'),
    ]);
    // February 29 only in a leap year.
    const leap = { start: at('2028-02-27T10:00'), end: at('2028-03-02T20:00') };
    expect(eventPageRaidHours([{ month: 2, day: 29, bosses: [] }], leap, WEEKLY, ZONE)).toEqual([
      hour('2028-02-29T18:00', 'Raid Hour'),
    ]);
    const notLeap = { start: at('2027-02-27T10:00'), end: at('2027-03-02T20:00') };
    expect(eventPageRaidHours([{ month: 2, day: 29, bosses: [] }], notLeap, WEEKLY, ZONE)).toEqual(
      [],
    );
  });

  it('keeps the local time across the change of the clocks', () => {
    const fall = { start: at('2026-10-31T10:00'), end: at('2026-11-02T20:00') };
    const page = [
      { month: 10, day: 31, bosses: [] },
      { month: 11, day: 1, bosses: [] },
    ];
    const [before, after] = eventPageRaidHours(page, fall, WEEKLY, ZONE);
    expect(before?.start).toBe(Date.parse('2026-10-31T22:00:00Z'));
    expect(after?.start).toBe(Date.parse('2026-11-01T23:00:00Z'));
    expect(after && after.end - after.start).toBe(3_600_000);
    // An hour in the spring's gap moves forward by it, as the weekly one's would.
    const spring = { start: at('2026-03-07T10:00'), end: at('2026-03-09T20:00') };
    expect(
      eventPageRaidHours(
        [{ month: 3, day: 8, bosses: [] }],
        spring,
        { hour: 2, minutes: 60 },
        ZONE,
      )[0]?.start,
    ).toBe(Date.parse('2026-03-08T07:00:00Z'));
  });
});

describe('withPageRaidHours', () => {
  const event = (kind: RaidEvent['kind'], name: string, iso: string): RaidEvent => ({
    kind,
    name,
    start: at(iso),
    end: at(iso) + 3_600_000,
  });

  it('adds the pages’ Raid Hours in order, the feed’s winning at the same start', () => {
    const feed = [
      event('raid-hour', 'Dialga Raid Hour', '2026-11-04T18:00'),
      event('raid-day', 'Raid Day', '2026-11-10T18:00'),
      event('raid-hour', 'Palkia Raid Hour', '2026-11-18T18:00'),
    ];
    const page = [
      event('raid-hour', 'Zamazenta Raid Hour', '2026-11-10T18:00'),
      event('raid-hour', 'Zacian Raid Hour', '2026-11-09T18:00'),
      event('raid-hour', 'Raid Hour', '2026-11-18T18:00'),
      event('raid-hour', 'Zacian again Raid Hour', '2026-11-09T18:00'),
    ];
    expect(withPageRaidHours(feed, page).map((one) => one.name)).toEqual([
      'Dialga Raid Hour',
      'Zacian Raid Hour',
      'Raid Day',
      'Zamazenta Raid Hour',
      'Palkia Raid Hour',
    ]);
    expect(withPageRaidHours(feed, [])).toBe(feed);
  });
});
