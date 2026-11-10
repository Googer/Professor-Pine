import { describe, expect, it } from 'vitest';
import { INTO_THE_WILD, PAWNIARD_DAY } from '../../../test/support/research-store-cases.js';
import type { ResearchEvent } from './research-events.js';
import { eventShape, nextPeriodChange, periodAt } from './research-periods.js';
import { zonedAt } from '../../../test/support/time.js';

const ZONE = 'America/New_York';
/** A moment of New York's clock. */
const at = (local: string): number => zonedAt(local, ZONE);
const EVENTS = [INTO_THE_WILD, PAWNIARD_DAY];

/** A global GO Fest with field research: 10:00 to 18:00 on two days (one start, one end). */
const FEST: ResearchEvent = {
  id: 'pokemon-go-fest-2027-global',
  name: 'Pokémon GO Fest 2027: Global',
  eventType: 'pokemon-go-fest',
  start: at('2027-06-26T10:00'),
  end: at('2027-06-27T18:00'),
};

/** An event crossing midnight, 22:00 to 02:00. */
const NIGHT: ResearchEvent = {
  id: 'night-owl-2026',
  name: 'Night Owl',
  eventType: 'event',
  start: at('2026-12-04T22:00'),
  end: at('2026-12-05T02:00'),
};

describe('eventShape', () => {
  it('tells an intra-day event, a big event with daily hours and a rotation apart', () => {
    expect(eventShape(PAWNIARD_DAY, ZONE)).toBe('window');
    expect(eventShape(INTO_THE_WILD, ZONE)).toBe('rotation');
    expect(eventShape(FEST, ZONE)).toBe('daily');
    // Crossing midnight is a rotation (Matt's answer 6), a big event too.
    expect(eventShape(NIGHT, ZONE)).toBe('rotation');
    expect(eventShape({ ...NIGHT, eventType: 'pokemon-go-fest' }, ZONE)).toBe('rotation');
  });
});

describe('periodAt', () => {
  it('is the day without a research event, ending at local midnight', () => {
    expect(periodAt(EVENTS, at('2026-10-21T10:00'), ZONE)).toEqual({
      key: 'day:2026-10-21',
      kind: 'day',
      start: at('2026-10-21T00:00'),
      end: at('2026-10-22T00:00'),
    });
  });

  it('ends the day early at a multi-day event’s start, and starts a new day at its end', () => {
    expect(periodAt(EVENTS, at('2026-11-09T09:59'), ZONE)).toMatchObject({
      key: 'day:2026-11-09',
      end: INTO_THE_WILD.start,
    });
    expect(periodAt(EVENTS, at('2026-11-09T10:00'), ZONE)).toEqual({
      key: 'event:into-the-wild-2026:2026-11-09',
      kind: 'event',
      start: INTO_THE_WILD.start,
      end: at('2026-11-10T00:00'),
      event: { id: INTO_THE_WILD.id, name: 'Into the Wild' },
    });
    expect(periodAt(EVENTS, at('2026-11-13T19:59'), ZONE).end).toBe(INTO_THE_WILD.end);
    expect(periodAt(EVENTS, at('2026-11-13T20:00'), ZONE)).toEqual({
      key: 'day:2026-11-13',
      kind: 'day',
      start: INTO_THE_WILD.end,
      end: at('2026-11-14T00:00'),
    });
  });

  it('rolls a multi-day event’s tasks over at each local midnight inside it (Matt, 2026-10-22)', () => {
    expect(periodAt(EVENTS, at('2026-11-10T23:59'), ZONE)).toMatchObject({
      key: 'event:into-the-wild-2026:2026-11-10',
      start: at('2026-11-10T00:00'),
      end: at('2026-11-11T00:00'),
    });
    expect(periodAt(EVENTS, at('2026-11-11T00:00'), ZONE)).toEqual({
      key: 'event:into-the-wild-2026:2026-11-11',
      kind: 'event',
      start: at('2026-11-11T00:00'),
      end: at('2026-11-12T00:00'),
      event: { id: INTO_THE_WILD.id, name: 'Into the Wild' },
    });
    expect(periodAt(EVENTS, at('2026-11-13T19:59'), ZONE)).toMatchObject({
      key: 'event:into-the-wild-2026:2026-11-13',
      start: at('2026-11-13T00:00'),
    });
    expect(nextPeriodChange(EVENTS, at('2026-11-10T20:00'), ZONE)).toBe(at('2026-11-11T00:00'));
  });

  it('rolls over at midnight on the day the clocks change inside a multi-day event', () => {
    const fall: ResearchEvent = {
      ...INTO_THE_WILD,
      id: 'fall-2026',
      start: at('2026-10-31T10:00'),
      end: at('2026-11-02T20:00'),
    };
    expect(periodAt([fall], at('2026-11-01T12:00'), ZONE)).toMatchObject({
      key: 'event:fall-2026:2026-11-01',
      start: at('2026-11-01T00:00'),
      end: at('2026-11-02T00:00'),
    });
  });

  it('keeps the seconds of a big event’s daily hours (review A6)', () => {
    const tour: ResearchEvent = {
      id: 'pokemon-go-tour-alola-global-2027',
      name: 'Pokémon GO Tour: Alola - Global 2027',
      eventType: 'pokemon-go-tour',
      start: at('2027-02-27T00:00'),
      end: at('2027-02-28T23:59:59'),
    };
    expect(periodAt([tour], at('2027-02-27T23:59:30'), ZONE)).toMatchObject({
      key: 'event:pokemon-go-tour-alola-global-2027:2027-02-27',
      end: at('2027-02-27T23:59:59'),
    });
  });

  it('is an intra-day event’s window, with the day’s reports waiting until it ends', () => {
    expect(periodAt(EVENTS, at('2026-11-21T13:59'), ZONE)).toMatchObject({
      key: 'day:2026-11-21',
      end: at('2026-11-22T00:00'),
    });
    expect(periodAt(EVENTS, at('2026-11-21T14:00'), ZONE)).toEqual({
      key: 'event:november-communityday2026',
      kind: 'window',
      start: PAWNIARD_DAY.start,
      end: PAWNIARD_DAY.end,
      event: { id: PAWNIARD_DAY.id, name: 'Pawniard Community Day' },
      waiting: { key: 'day:2026-11-21', at: PAWNIARD_DAY.end },
    });
    expect(periodAt(EVENTS, at('2026-11-21T17:00'), ZONE).key).toBe('day:2026-11-21');
  });

  it('gives a big event’s each day its hours, and the day’s research before and after', () => {
    expect(periodAt([FEST], at('2027-06-26T09:59'), ZONE).key).toBe('day:2027-06-26');
    expect(periodAt([FEST], at('2027-06-26T12:00'), ZONE)).toMatchObject({
      key: 'event:pokemon-go-fest-2027-global:2027-06-26',
      kind: 'window',
      start: at('2027-06-26T10:00'),
      end: at('2027-06-26T18:00'),
      waiting: { key: 'day:2027-06-26', at: at('2027-06-26T18:00') },
    });
    expect(periodAt([FEST], at('2027-06-26T20:00'), ZONE).key).toBe('day:2027-06-26');
    expect(periodAt([FEST], at('2027-06-27T10:30'), ZONE).key).toBe(
      'event:pokemon-go-fest-2027-global:2027-06-27',
    );
  });

  it('brings a multi-day period’s reports back after an intra-day event inside it', () => {
    const inside: ResearchEvent = {
      ...PAWNIARD_DAY,
      id: 'inside',
      start: at('2026-11-10T14:00'),
      end: at('2026-11-10T17:00'),
    };
    expect(periodAt([INTO_THE_WILD, inside], at('2026-11-10T15:00'), ZONE)).toMatchObject({
      key: 'event:inside',
      waiting: { key: 'event:into-the-wild-2026:2026-11-10', at: at('2026-11-10T17:00') },
    });
  });

  it('waits for nothing when the period below ends with the window', () => {
    const late: ResearchEvent = {
      ...PAWNIARD_DAY,
      id: 'late',
      start: at('2026-11-21T21:00'),
      end: at('2026-11-22T00:00'),
    };
    expect(periodAt([late], at('2026-11-21T22:00'), ZONE)).toMatchObject({
      key: 'event:late',
      kind: 'window',
      waiting: undefined,
    });
  });

  it('takes an event crossing midnight as a rotation, rolled over at midnight', () => {
    expect(periodAt([NIGHT], at('2026-12-04T23:00'), ZONE)).toMatchObject({
      key: 'event:night-owl-2026:2026-12-04',
      start: NIGHT.start,
      end: at('2026-12-05T00:00'),
    });
    expect(periodAt([NIGHT], at('2026-12-05T01:59'), ZONE)).toMatchObject({
      key: 'event:night-owl-2026:2026-12-05',
      start: at('2026-12-05T00:00'),
      end: NIGHT.end,
    });
    expect(periodAt([NIGHT], at('2026-12-05T02:00'), ZONE)).toMatchObject({
      key: 'day:2026-12-05',
      start: NIGHT.end,
    });
  });

  it('ends a day at midnight on the days the clocks change', () => {
    // 2026-11-01 has 25 hours in New York, 2027-03-14 has 23.
    expect(periodAt([], at('2026-11-01T12:00'), ZONE)).toMatchObject({
      end: at('2026-11-02T00:00'),
    });
    expect(at('2026-11-02T00:00') - at('2026-11-01T00:00')).toBe(25 * 3_600_000);
    expect(periodAt([], at('2027-03-14T12:00'), ZONE)).toMatchObject({
      end: at('2027-03-15T00:00'),
    });
    expect(at('2027-03-15T00:00') - at('2027-03-14T00:00')).toBe(23 * 3_600_000);
  });
});

describe('nextPeriodChange', () => {
  it('is the next midnight, or an event’s start or end before it', () => {
    expect(nextPeriodChange(EVENTS, at('2026-10-21T10:00'), ZONE)).toBe(at('2026-10-22T00:00'));
    expect(nextPeriodChange(EVENTS, at('2026-11-21T09:00'), ZONE)).toBe(PAWNIARD_DAY.start);
    expect(nextPeriodChange(EVENTS, at('2026-11-21T15:00'), ZONE)).toBe(PAWNIARD_DAY.end);
    expect(nextPeriodChange(EVENTS, at('2026-11-13T19:00'), ZONE)).toBe(INTO_THE_WILD.end);
    expect(nextPeriodChange([FEST], at('2027-06-27T09:00'), ZONE)).toBe(at('2027-06-27T10:00'));
  });
});
