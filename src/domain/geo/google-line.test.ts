import { describe, expect, it } from 'vitest';
import {
  bestRank,
  estimateLine,
  googleMonth,
  lineAllowance,
  lineOrder,
  NO_REGION_RANK,
  regionRanks,
  type GoogleBudget,
} from './google-line.js';

/** A moment given in Pacific time (`2026-10-31T23:30`), as epoch milliseconds. */
const pacific = (local: string, offset = '-07:00'): number =>
  new Date(`${local}${offset}`).getTime();

const BUDGET: GoogleBudget = { places: 4_500, reserve: 500, geocodes: 9_000 };
const NONE = { monthPlaces: 0, todayPlaces: 0, monthGeocodes: 0 };

describe('googleMonth', () => {
  it('starts the month on the 1st at midnight Pacific time, whatever the zone of the bot', () => {
    // 23:30 on the 31st in California is already November in New York and in UTC.
    const month = googleMonth(pacific('2026-10-31T23:30'));
    expect(month.today).toBe('2026-10-31');
    expect(month.days).toHaveLength(31);
    expect(month.days[0]).toBe('2026-10-01');
    expect(month.daysLeft).toBe(1);
    expect(month.nextReset).toBe(pacific('2026-11-01T00:00'));
    expect(month.tomorrow).toBe(pacific('2026-11-01T00:00'));
  });

  it('counts the days left with today, and knows where daylight saving time ends', () => {
    const month = googleMonth(pacific('2026-11-01T00:10'));
    expect(month.today).toBe('2026-11-01');
    expect(month.daysLeft).toBe(30);
    // Daylight saving time ends on November 1: the next day begins 25 hours later.
    expect(month.tomorrow - pacific('2026-11-01T00:00')).toBe(25 * 3_600_000);
    expect(month.nextReset).toBe(pacific('2026-12-01T00:00', '-08:00'));
  });
});

describe('lineAllowance', () => {
  const now = pacific('2026-10-11T12:00');

  it('lets gyms use the whole month above the reserve, and paces stops evenly over the days left', () => {
    // 21 days left with today; 4,000 above the reserve: 190 a day for stops and power spots.
    const fresh = lineAllowance(now, NONE, BUDGET);
    expect(fresh).toMatchObject({ gyms: true, wayspots: true, geocode: true, share: 190 });
    // Gyms used 3,000 today already: they go on, stops wait for tomorrow.
    const busy = lineAllowance(
      now,
      { monthPlaces: 3_000, todayPlaces: 3_000, monthGeocodes: 0 },
      BUDGET,
    );
    expect(busy).toMatchObject({ gyms: true, wayspots: false, share: 190 });
    expect(busy.waitMs).toBe(pacific('2026-10-12T00:00') - now);
  });

  it('takes the share from what was left when the day began', () => {
    // 2,000 used before today, 10 of it today: (4,000 − 1,990) ÷ 21 = 95 a day.
    const allowance = lineAllowance(
      now,
      { monthPlaces: 2_000, todayPlaces: 10, monthGeocodes: 0 },
      BUDGET,
    );
    expect(allowance).toMatchObject({ share: 95, wayspots: true });
  });

  it('stops the line when only the reserve is left, until the month resets', () => {
    const allowance = lineAllowance(
      now,
      { monthPlaces: 4_000, todayPlaces: 0, monthGeocodes: 0 },
      BUDGET,
    );
    expect(allowance).toMatchObject({ gyms: false, wayspots: false });
    expect(allowance.waitMs).toBe(pacific('2026-11-01T00:00') - now);
    // Questions outside the line went past the budget: the line still waits, it does not break.
    const over = lineAllowance(
      now,
      { monthPlaces: 4_700, todayPlaces: 0, monthGeocodes: 0 },
      BUDGET,
    );
    expect(over).toMatchObject({ gyms: false, wayspots: false, share: 0 });
  });

  it('stops asking addresses once the geocodes of the month are used', () => {
    const allowance = lineAllowance(
      now,
      { monthPlaces: 0, todayPlaces: 0, monthGeocodes: 9_000 },
      BUDGET,
    );
    expect(allowance).toMatchObject({ gyms: true, geocode: false });
  });

  it('asks nothing with a budget of nothing', () => {
    const allowance = lineAllowance(now, NONE, { places: 0, reserve: 0, geocodes: 0 });
    expect(allowance).toMatchObject({ gyms: false, wayspots: false, geocode: false });
  });
});

describe('regionRanks', () => {
  it('ranks each region by its share of its own server, so that each server’s busiest is level', () => {
    const regions = [
      { id: 1, guildId: 10 },
      { id: 2, guildId: 10 },
      { id: 3, guildId: 20 },
      { id: 4, guildId: 20 },
      { id: 5, guildId: null },
    ];
    const ranks = regionRanks(
      regions,
      new Map([
        [1, 400],
        [2, 100],
        [3, 4],
        [4, 2],
        [5, 50],
      ]),
    );
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(3)).toBe(1);
    expect(ranks.get(2)).toBe(0.25);
    expect(ranks.get(4)).toBe(0.5);
    // A region of no server is no region a place can rank by.
    expect(ranks.has(5)).toBe(false);
  });

  it('ranks every region the same where there is no history', () => {
    const ranks = regionRanks(
      [
        { id: 1, guildId: 10 },
        { id: 2, guildId: 10 },
        { id: 3, guildId: 20 },
      ],
      new Map(),
    );
    expect([...ranks.values()]).toEqual([1, 1, 1]);
  });

  it('gives a place its best region, and none in no region of any server', () => {
    const ranks = new Map([
      [1, 0.25],
      [2, 0.75],
    ]);
    expect(bestRank([1, 2], ranks)).toBe(0.75);
    expect(bestRank([], ranks)).toBe(NO_REGION_RANK);
    expect(bestRank([9], ranks)).toBe(NO_REGION_RANK);
  });
});

describe('lineOrder', () => {
  it('orders by kind, then rank, then the time queued, then the key', () => {
    const items = [
      { kind: 'powerspot' as const, rank: 1, queuedAt: 1, key: 'p' },
      { kind: 'stop' as const, rank: 0.5, queuedAt: 1, key: 's2' },
      { kind: 'stop' as const, rank: 1, queuedAt: 9, key: 's1' },
      { kind: 'gym' as const, rank: NO_REGION_RANK, queuedAt: 1, key: '3' },
      { kind: 'gym' as const, rank: 0.2, queuedAt: 5, key: '2' },
      { kind: 'gym' as const, rank: 0.2, queuedAt: 5, key: '1' },
    ];
    expect([...items].sort(lineOrder).map((item) => item.key)).toEqual([
      '1',
      '2',
      '3',
      's1',
      's2',
      'p',
    ]);
  });
});

describe('estimateLine', () => {
  const now = pacific('2026-10-11T12:00');
  const pace = { now, used: NONE, budget: BUDGET, everyMs: 5_000 };

  it('finishes gyms within the day when the month allows, and stops at the pace of the share', () => {
    // 2,000 gyms in 12 hours at one every five seconds (8,640 could go); then 190 stops a day,
    // but the gyms took more than today's share: the stops start tomorrow, at (2,000 ÷ 20) = 100
    // a day, so 200 are done on the 13th.
    const estimate = estimateLine({ ...pace, gyms: 2_000, allGyms: 2_000, wayspots: 200 });
    expect(estimate.gyms).toBe(now);
    expect(estimate.all).toBe(pacific('2026-10-13T00:00'));
  });

  it('goes into the next months when this month is not enough', () => {
    const estimate = estimateLine({ ...pace, gyms: 5_000, allGyms: 6_000, wayspots: 0 });
    // 4,000 this month, then 1,000 on November 1.
    expect(estimate.gyms).toBe(pacific('2026-11-01T00:00'));
    expect(estimate.all).toBe(estimate.gyms);
  });

  it('names nothing for a server with nothing waiting, and gives up at a budget of nothing', () => {
    expect(estimateLine({ ...pace, gyms: 0, allGyms: 10, wayspots: 0 })).toEqual({});
    const never = estimateLine({
      ...pace,
      budget: { places: 0, reserve: 0, geocodes: 0 },
      gyms: 1,
      allGyms: 1,
      wayspots: 0,
    });
    expect(never).toEqual({ gyms: 'beyond', all: 'beyond' });
  });
});
