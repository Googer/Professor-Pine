import { describe, expect, it } from 'vitest';
import { zonedAt } from '../../../test/support/time.js';
import { ACTIVITY_FIRST_MONTH, UNKNOWN_MONTH } from './activity.js';
import { tallyMonths, keptOut, regionTally, regionGate, type RegionCount } from './region-tally.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);

const count = (regionId: number, raids: number, maxes = 0): RegionCount => ({
  regionId,
  raids,
  maxes,
});

describe('the months of a period of the region tally', () => {
  it('reads this month, this year and all time in the zone of the settings', () => {
    // 00:30 on November 1 in New York is still October 31 in Los Angeles, a month and a year apart.
    const now = at('2026-11-01T00:30');
    expect(tallyMonths('month', now, ZONE)).toEqual({ first: '2026-11', last: '2026-11' });
    expect(tallyMonths('month', now, 'America/Los_Angeles')).toEqual({
      first: '2026-10',
      last: '2026-10',
    });
    expect(tallyMonths('year', now, ZONE)).toEqual({ first: '2026-01', last: '2026-11' });
    expect(tallyMonths('all', now, ZONE)).toEqual({ first: ACTIVITY_FIRST_MONTH, last: '2026-11' });
  });

  it('never reaches the month of records at no time', () => {
    for (const period of ['month', 'year', 'all'] as const) {
      expect(tallyMonths(period, at('2026-11-05T12:00'), ZONE).first > UNKNOWN_MONTH).toBe(true);
    }
  });
});

describe('the region tally', () => {
  it('ranks the regions by raids and max battles together, ties by region id', () => {
    const tally = regionTally(
      [count(1, 4, 1), count(2, 2, 3), count(3, 7), count(4, 0, 5)],
      [1, 2, 3, 4],
      new Set(),
    );
    expect(tally.rows).toEqual([count(3, 7), count(1, 4, 1), count(2, 2, 3), count(4, 0, 5)]);
    expect(tally.gone).toBeNull();
    expect(tally.total).toEqual({ raids: 13, maxes: 9 });
  });

  it('lists a current region without a party at the bottom, with nothing', () => {
    const tally = regionTally([count(2, 1)], [3, 1, 2], new Set());
    expect(tally.rows).toEqual([count(2, 1), count(1, 0), count(3, 0)]);
  });

  it('sums the parties of every region no longer there, and of none, on one line last', () => {
    const tally = regionTally([count(1, 2), count(0, 5, 1), count(99, 3)], [1], new Set());
    expect(tally.rows).toEqual([count(1, 2)]);
    expect(tally.gone).toEqual({ raids: 8, maxes: 1 });
    // The totals stay true: every party counted once.
    expect(tally.total).toEqual({ raids: 10, maxes: 1 });
  });

  it('leaves a region left out out of every line and the totals, not on the line of gone ones', () => {
    const tally = regionTally([count(1, 2), count(2, 6, 2), count(0, 1)], [1, 2], new Set([2]));
    expect(tally.rows).toEqual([count(1, 2)]);
    expect(tally.gone).toEqual({ raids: 1, maxes: 0 });
    expect(tally.total).toEqual({ raids: 3, maxes: 0 });
  });

  it('sums the counts a region is given twice', () => {
    const tally = regionTally(
      [count(1, 2), count(1, 1, 1), count(0, 0), count(7, 0)],
      [1],
      new Set(),
    );
    expect(tally.rows).toEqual([count(1, 3, 1)]);
    // Gone ones with nothing are no line.
    expect(tally.gone).toBeNull();
  });
});

describe('who a forum keeps from a region (the map’s rule, Matt 2026-11-05)', () => {
  it('keeps out a member barred from the forum, not one its roles only hide it from', () => {
    expect(keptOut('barred')).toBe(true);
    expect(keptOut('hidden')).toBe(false);
    expect(keptOut('visible')).toBe(false);
    // The forum is gone, or the member left: nothing keeps them out.
    expect(keptOut(undefined)).toBe(false);
  });
});

describe('the channel that decides who sees a region (8H5-2)', () => {
  it('is its forum, or its text channel where it has none', () => {
    expect(regionGate({ forumChannelId: 'forum', channelId: 'text' })).toBe('forum');
    expect(regionGate({ forumChannelId: null, channelId: 'text' })).toBe('text');
  });
});
