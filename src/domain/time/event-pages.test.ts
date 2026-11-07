import { describe, expect, it } from 'vitest';
import { readEveryoneFeed } from '../../../test/support/event-reach.js';
import { zonedAt } from '../../../test/support/time.js';
import { pagedEventsNear, parsePagedEventFeed, type PagedEvent } from './event-pages.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);
const DAY = 24 * 3_600_000;

const item = (over: Record<string, unknown>) => ({
  eventID: 'an-event',
  name: 'An Event',
  eventType: 'raid-battles',
  link: 'https://leekduck.com/events/an-event/',
  start: '2026-11-09T10:00:00.000',
  end: '2026-11-13T20:00:00.000',
  ...over,
});

describe('parsePagedEventFeed', () => {
  it('takes everyone’s events with a Leek Duck events page, of any type, at local times', () => {
    const events = parsePagedEventFeed(readEveryoneFeed(), ZONE);
    expect(events.map((event) => event.id)).toEqual([
      'into-the-wild-2026',
      'pokemon-go-wild-area-2026-global',
      'november-communityday2026',
      'pokemon-go-tour-alola-global-2027',
    ]);
    expect(events[0]).toEqual({
      id: 'into-the-wild-2026',
      name: 'Into the Wild',
      eventType: 'event',
      start: at('2026-11-09T10:00'),
      end: at('2026-11-13T20:00'),
      page: 'https://leekduck.com/events/into-the-wild-2026/',
    });
  });

  it('leaves out another address, an event without hours or of over 31 days, a City Safari', () => {
    const events = parsePagedEventFeed(
      [
        item({ eventID: 'kept' }),
        item({ eventID: 'elsewhere', link: 'https://example.test/events/x/' }),
        item({ eventID: 'no-link', link: undefined }),
        item({ eventID: 'no-start', start: null }),
        item({ eventID: 'backwards', end: '2026-11-08T10:00:00.000' }),
        item({ eventID: 'season', end: '2026-12-11T10:00:00.000' }),
        item({ eventID: 'safari', eventType: 'city-safari' }),
        item({ eventID: 'zoned', start: '2026-11-09T15:00:00.000Z' }),
        { eventID: 'broken' },
        'nothing',
      ],
      ZONE,
    );
    expect(events.map((event) => event.id)).toEqual(['kept']);
  });

  it('refuses what is not a list', () => {
    expect(() => parsePagedEventFeed({}, ZONE)).toThrow('not a list of events');
  });
});

describe('pagedEventsNear', () => {
  const event = (id: string, start: string, end: string): PagedEvent => ({
    id,
    name: id,
    eventType: 'event',
    start: at(start),
    end: at(end),
    page: `https://leekduck.com/events/${id}/`,
  });

  it('gives the events from eight days ago to eight days ahead, those on now first', () => {
    const now = at('2026-11-07T12:00');
    const events = [
      event('long-over', '2026-10-20T10:00', '2026-10-30T13:00'),
      event('just-in', '2026-10-25T10:00', '2026-10-30T13:01'),
      event('on-now', '2026-11-05T10:00', '2026-11-08T20:00'),
      event('into-the-wild', '2026-11-09T10:00', '2026-11-13T20:00'),
      event('last-in', '2026-11-15T12:00', '2026-11-15T20:00'),
      event('too-far', '2026-11-15T12:01', '2026-11-15T20:00'),
    ];
    // Eight days of 24 hours: 13:00 before the clocks fell back.
    expect(now - 8 * DAY).toBe(at('2026-10-30T13:00'));
    expect(pagedEventsNear(events, now).map((one) => one.id)).toEqual([
      'on-now',
      'just-in',
      'into-the-wild',
      'last-in',
    ]);
  });
});
