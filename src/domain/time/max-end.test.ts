import { describe, expect, it } from 'vitest';
import { at, MAX_ZONE } from '../../../test/support/max-bosses.js';
import { readMaxEventFeed } from '../../../test/support/max-events.js';
import type { MaxTier } from '../pogo/max-tier.js';
import { defaultMaxEnd, maxRotation, nextRotationEnd, type MaxEndInput } from './max-end.js';
import { parseBigEventFeed, parseMaxEventFeed, type MaxEvent } from './max-events.js';

const recorded = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events;
const big = parseBigEventFeed(readMaxEventFeed(), MAX_ZONE);
const hours = { firstBattle: '06:00', lastBattle: '21:00' };

/** An all-day Max Monday, 06:00 to 21:00 on Monday 2026-10-26, as the feed has them. */
const monday: MaxEvent = {
  kind: 'max-monday',
  name: 'Dynamax Sableye during Max Monday',
  start: at('2026-10-26T06:00'),
  end: at('2026-10-26T21:00'),
  short: false,
  hoursAssumed: false,
  featured: { gigantamax: false, names: ['Sableye'] },
  id: 'monday',
};

function input(tier: MaxTier, time: number, events: readonly MaxEvent[] = recorded): MaxEndInput {
  return { tier, at: time, events, big, hours, zone: MAX_ZONE };
}

/** The default end of a report at a local time, or `over`. */
function endAt(tier: MaxTier, local: string, events?: readonly MaxEvent[]): number | 'over' {
  const decided = defaultMaxEnd(input(tier, at(local), events));
  return decided.kind === 'over' ? 'over' : decided.end;
}

describe('maxRotation: how long a battle lasts at a spot (design Q9, Matt 2026-10-21)', () => {
  it('rotates every half hour in a short event, every hour all day, never on an ordinary day', () => {
    // The lake trio's Max Battle Day, 14:00 to 17:00: a few hours.
    expect(maxRotation(input('D5', at('2026-10-24T15:10')))).toBe('half-hour');
    expect(maxRotation(input('D1', at('2026-10-26T15:10'), [monday]))).toBe('hour');
    expect(maxRotation(input('D2', at('2026-10-22T15:10')))).toBe('day');
  });

  it('rotates a Gigantamax battle every hour outside any event, and in a big event all day', () => {
    expect(maxRotation(input('G', at('2026-10-22T15:10')))).toBe('hour');
    // Wild Area 2026 Global: all day for a Gigantamax battle, a Dynamax one as on any day.
    expect(maxRotation(input('G', at('2026-11-14T12:00')))).toBe('hour');
    expect(maxRotation(input('D2', at('2026-11-14T12:00')))).toBe('day');
    // A Max Battle Day of a few hours inside it: its own half hours.
    const day: MaxEvent = {
      ...monday,
      kind: 'max-battle',
      name: 'Gigantamax Machamp Max Battle Day',
      start: at('2026-11-14T14:00'),
      end: at('2026-11-14T17:00'),
      short: true,
    };
    expect(maxRotation(input('G', at('2026-11-14T15:00'), [day]))).toBe('half-hour');
  });

  // Review A, X3-B-5: while the rule outside events is an hour, a big event changes nothing that
  // shows; with another rule outside, the big event's hour still holds inside it.
  it('tells a Gigantamax battle in a big event from one outside, whatever the rule outside', () => {
    expect(maxRotation(input('G', at('2026-11-14T12:00')), 'half-hour')).toBe('hour');
    expect(maxRotation(input('G', at('2026-10-22T15:10')), 'half-hour')).toBe('half-hour');
    expect(maxRotation(input('D2', at('2026-10-22T15:10')), 'half-hour')).toBe('day');
  });
});

describe('defaultMaxEnd: the boundary of the rotation the battle is in', () => {
  it('ends a battle of a short event at the next half hour after the report', () => {
    expect(endAt('D5', '2026-10-24T14:00')).toBe(at('2026-10-24T14:30'));
    expect(endAt('D5', '2026-10-24T14:29')).toBe(at('2026-10-24T14:30'));
    expect(endAt('D5', '2026-10-24T14:31')).toBe(at('2026-10-24T15:00'));
    expect(endAt('D5', '2026-10-24T16:59')).toBe(at('2026-10-24T17:00'));
  });

  it('ends a battle of an all-day event at the next full hour, never past the last battle', () => {
    expect(endAt('D1', '2026-10-26T14:00', [monday])).toBe(at('2026-10-26T15:00'));
    expect(endAt('D1', '2026-10-26T14:31', [monday])).toBe(at('2026-10-26T15:00'));
    expect(endAt('D1', '2026-10-26T20:45', [monday])).toBe(at('2026-10-26T21:00'));
  });

  it('ends a Gigantamax battle outside events at the next hour, a Dynamax one at 21:00', () => {
    expect(endAt('G', '2026-10-22T10:20')).toBe(at('2026-10-22T11:00'));
    expect(endAt('D2', '2026-10-22T10:20')).toBe(at('2026-10-22T21:00'));
    expect(endAt('G', '2026-11-14T20:30')).toBe(at('2026-11-14T21:00'));
  });

  // Matt, 2026-10-21 (Q-B): the event's own battles replace the day's at its start.
  it('ends a Dynamax battle of the day at the start of a max event later that day', () => {
    // The lake trio's Max Battle Day, 14:00 to 17:00.
    expect(endAt('D2', '2026-10-24T10:00')).toBe(at('2026-10-24T14:00'));
    expect(endAt('D2', '2026-10-24T05:30')).toBe(at('2026-10-24T14:00'));
    // After it, the day's last battle time again; a Gigantamax battle keeps its own hour.
    expect(endAt('D2', '2026-10-24T17:10')).toBe(at('2026-10-24T21:00'));
    expect(endAt('G', '2026-10-24T10:20')).toBe(at('2026-10-24T11:00'));
    // An event of another day changes nothing.
    expect(endAt('D2', '2026-10-23T10:00')).toBe(at('2026-10-23T21:00'));
  });

  it('takes a report before the first battle, its rotation counted from then', () => {
    expect(endAt('D2', '2026-10-22T05:30')).toBe(at('2026-10-22T21:00'));
    expect(endAt('G', '2026-10-22T05:30')).toBe(at('2026-10-22T07:00'));
  });

  it('refuses a report at or after the last battle time', () => {
    expect(endAt('D2', '2026-10-22T21:00')).toBe('over');
    expect(endAt('G', '2026-10-22T23:10')).toBe('over');
    expect(defaultMaxEnd(input('D2', at('2026-10-22T21:30')))).toEqual({
      kind: 'over',
      first: '06:00',
      last: '21:00',
    });
  });
});

describe('nextRotationEnd: one rotation later (the ending-soon dialog)', () => {
  it('is the boundary after the end, by the same rule, capped at the last battle', () => {
    expect(nextRotationEnd(at('2026-10-24T14:30'), input('D5', at('2026-10-24T14:29')))).toBe(
      at('2026-10-24T15:00'),
    );
    expect(
      nextRotationEnd(at('2026-10-26T15:00'), input('D1', at('2026-10-26T14:57'), [monday])),
    ).toBe(at('2026-10-26T16:00'));
    // An end typed off the boundaries goes to the next one.
    expect(nextRotationEnd(at('2026-10-22T10:42'), input('G', at('2026-10-22T10:40')))).toBe(
      at('2026-10-22T11:00'),
    );
  });

  it('is none at the last battle time, nor for a battle that lasts the day', () => {
    expect(
      nextRotationEnd(at('2026-10-26T21:00'), input('D1', at('2026-10-26T20:57'), [monday])),
    ).toBeUndefined();
    expect(
      nextRotationEnd(at('2026-10-22T21:00'), input('D2', at('2026-10-22T20:57'))),
    ).toBeUndefined();
  });

  // Review B, B12 (Claude's call): the rule as things are at the end, not at the report.
  it('is the rule at the end: none for a Dynamax battle past its event, an hour for Gigantamax', () => {
    // The lake trio's Max Battle Day ends at 17:00: a Dynamax battle has no rotation after it.
    expect(
      nextRotationEnd(at('2026-10-24T17:00'), input('D5', at('2026-10-24T16:57'))),
    ).toBeUndefined();
    // A Gigantamax battle outside events rotates every hour.
    expect(nextRotationEnd(at('2026-10-24T17:00'), input('G', at('2026-10-24T16:57')))).toBe(
      at('2026-10-24T18:00'),
    );
  });
});
