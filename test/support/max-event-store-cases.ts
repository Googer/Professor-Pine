import { expect, it } from 'vitest';
import type { MaxEventStorage } from '../../src/db/repositories/max-event-repository.js';
import {
  parseBigEventFeed,
  parseMaxEventFeed,
  type BigEvent,
  type MaxEvent,
} from '../../src/domain/time/max-events.js';
import { readMaxEventFeed } from './max-events.js';

const ZONE = 'America/New_York';

/** The max events of the recorded feed (`readMaxEventFeed`), in order of their start. */
export function feedMaxEvents(): MaxEvent[] {
  return parseMaxEventFeed(readMaxEventFeed(), ZONE).events;
}

/** The big events of the recorded feed, in order of their start. */
export function feedBigEvents(): BigEvent[] {
  return parseBigEventFeed(readMaxEventFeed(), ZONE);
}

/** What the kept max and big events do (plan 8X-F), for the repository and its twin. */
export function maxEventCases(made: () => Promise<MaxEventStorage>): void {
  it('keeps nothing before the first read', async () => {
    const store = await made();
    expect(await store.all()).toEqual({ max: [], big: [] });
  });

  it('keeps the events as given, every field, each kind in order of its start', async () => {
    const store = await made();
    const max = feedMaxEvents();
    const big = feedBigEvents();
    // Among them one with assumed hours, one that features nothing, a short one.
    expect(max.some((event) => event.hoursAssumed)).toBe(true);
    expect(max.some((event) => event.featured === undefined)).toBe(true);
    expect(max.some((event) => event.short)).toBe(true);
    await store.replace({ max: [...max].reverse(), big: [...big].reverse() });
    expect(await store.all()).toEqual({ max, big });
  });

  it('keeps an event without a feed id, and a Gigantamax one, as they are', async () => {
    const store = await made();
    const [first] = feedMaxEvents();
    if (!first) throw new Error('no max event in the feed');
    const giga: MaxEvent = {
      ...first,
      id: undefined,
      name: 'Gigantamax Machamp Max Battle Day',
      featured: { gigantamax: true, names: ['Machamp'] },
    };
    await store.replace({ max: [giga], big: [] });
    expect(await store.all()).toEqual({ max: [giga], big: [] });
  });

  it('keeps what the last replace gave in the place of all it kept before', async () => {
    const store = await made();
    const max = feedMaxEvents();
    const big = feedBigEvents();
    await store.replace({ max, big });
    await store.replace({ max: max.slice(1, 2), big: [] });
    expect(await store.all()).toEqual({ max: max.slice(1, 2), big: [] });
    await store.replace({ max: [], big: [] });
    expect(await store.all()).toEqual({ max: [], big: [] });
  });
}
