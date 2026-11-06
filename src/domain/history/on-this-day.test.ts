import { describe, expect, it } from 'vitest';
import { zonedAt } from '../../../test/support/time.js';
import type { BigDay } from './big-days.js';
import { nextOnThisDayAt, onThisDayDays, onThisDayDue, ON_THIS_DAY_HOUR } from './on-this-day.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);

const big = (day: string, raids: number, score: number): BigDay => ({
  day,
  raids,
  usual: 40,
  score,
  label: undefined,
});

describe('the days "On this day" recalls', () => {
  const days = [
    big('2019-10-08', 412, 9),
    big('2020-10-08', 200, 5),
    big('2020-03-01', 300, 8),
    big('2020-05-01', 300, 7),
    big('2020-06-01', 300, 6),
    big('2021-10-08', 90, 3.5),
    big('2021-01-01', 400, 9),
    big('2021-02-01', 400, 8),
    big('2021-03-01', 400, 7),
  ];

  it('gives the earlier years whose top big days fall on today’s date, newest first', () => {
    expect(onThisDayDays(days, '2026-10-08', 3).map((one) => one.day)).toEqual(['2019-10-08']);
    // 2020-10-08 and 2021-10-08 are each fourth of their year: only with four.
    expect(onThisDayDays(days, '2026-10-08', 4).map((one) => one.day)).toEqual([
      '2021-10-08',
      '2020-10-08',
      '2019-10-08',
    ]);
    expect(onThisDayDays(days, '2026-10-08', 1).map((one) => one.day)).toEqual(['2019-10-08']);
    expect(onThisDayDays(days, '2026-10-08', 0)).toEqual([]);
    expect(onThisDayDays(days, '2026-10-09', 3)).toEqual([]);
  });

  it('never recalls this year’s own days', () => {
    expect(onThisDayDays([big('2026-03-01', 300, 9)], '2026-03-01', 3)).toEqual([]);
    expect(onThisDayDays([big('2026-03-01', 300, 9)], '2027-03-01', 3)).toHaveLength(1);
  });

  it('recalls one day of a run of big days in a row, the higher ranked (G21)', () => {
    const weekend = [big('2019-03-16', 460, 8.4), big('2019-03-17', 410, 6)];
    expect(onThisDayDays(weekend, '2026-03-16', 3)).toHaveLength(1);
    expect(onThisDayDays(weekend, '2026-03-17', 3)).toEqual([]);
  });

  it('recalls February 29th only in a leap year', () => {
    const leap = [big('2020-02-29', 300, 9)];
    expect(onThisDayDays(leap, '2024-02-29', 3)).toHaveLength(1);
    expect(onThisDayDays(leap, '2025-02-28', 3)).toEqual([]);
    expect(onThisDayDays(leap, '2025-03-01', 3)).toEqual([]);
  });
});

describe('when "On this day" is posted', () => {
  it('is due from 10:00 local time to the end of the day', () => {
    expect(ON_THIS_DAY_HOUR).toBe(10);
    expect(onThisDayDue(at('2026-10-08T09:59'), ZONE)).toBe(false);
    expect(onThisDayDue(at('2026-10-08T10:00'), ZONE)).toBe(true);
    expect(onThisDayDue(at('2026-10-08T23:59'), ZONE)).toBe(true);
    expect(onThisDayDue(at('2026-10-09T00:00'), ZONE)).toBe(false);
  });

  it('is next at today’s 10:00 before it, else tomorrow’s, by the wall clock', () => {
    expect(nextOnThisDayAt(at('2026-10-08T09:00'), ZONE)).toBe(at('2026-10-08T10:00'));
    expect(nextOnThisDayAt(at('2026-10-08T10:00'), ZONE)).toBe(at('2026-10-09T10:00'));
    // Across the night the clocks go back: 25 hours apart.
    expect(nextOnThisDayAt(at('2026-10-31T12:00'), ZONE)).toBe(at('2026-11-01T10:00'));
    expect(at('2026-11-01T10:00') - at('2026-10-31T10:00')).toBe(25 * 3_600_000);
  });
});
