import { describe, expect, it } from 'vitest';
import { zonedAt } from '../../../test/support/time.js';
import {
  TRAIN_WEB_MIN_RIDERS,
  trainMonth,
  trainMonthRange,
  trainShownOnWeb,
} from './trains-on-web.js';

const ZONE = 'America/New_York';

describe('a train’s month: when it was made, in the posts’ zone', () => {
  it('gives the local month’s first moment and the next month’s', () => {
    expect(trainMonthRange('2026-06', ZONE)).toEqual({
      from: zonedAt('2026-06-01T00:00', ZONE),
      to: zonedAt('2026-07-01T00:00', ZONE),
    });
    expect(trainMonthRange('2019-12', ZONE)).toEqual({
      from: zonedAt('2019-12-01T00:00', ZONE),
      to: zonedAt('2020-01-01T00:00', ZONE),
    });
  });

  it('names the month of a moment by the zone’s clock, not the server’s', () => {
    const lastMoment = zonedAt('2026-07-01T00:00', ZONE) - 1;
    expect(trainMonth(lastMoment, ZONE)).toBe('2026-06');
    expect(trainMonth(lastMoment + 1, ZONE)).toBe('2026-07');
    // 23:30 on June 30th here is July in UTC.
    expect(trainMonth(zonedAt('2026-06-30T23:30', ZONE), ZONE)).toBe('2026-06');
  });
});

describe('trainShownOnWeb: which ended trains the web may show (G2)', () => {
  it('shows a train three members or more came to, by Here and Done together', () => {
    expect(TRAIN_WEB_MIN_RIDERS).toBe(3);
    expect(trainShownOnWeb({ here: 3, done: 0 })).toBe(true);
    expect(trainShownOnWeb({ here: 1, done: 2 })).toBe(true);
    expect(trainShownOnWeb({ here: 0, done: 12 })).toBe(true);
  });

  it('leaves out a train one or two members ran: its route often traces a home', () => {
    expect(trainShownOnWeb({ here: 0, done: 0 })).toBe(false);
    expect(trainShownOnWeb({ here: 1, done: 1 })).toBe(false);
    expect(trainShownOnWeb({ here: 0, done: 2 })).toBe(false);
  });
});
