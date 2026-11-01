import { describe, expect, it } from 'vitest';
import { readRaidEventFeed } from '../../../test/support/raid-events.js';
import { parseRaidEventFeed } from './raid-events.js';
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
