import { describe, expect, it } from 'vitest';
import { zonedAt } from '../../../test/support/time.js';
import {
  ACTIVITY_FIRST_MONTH,
  ACTIVITY_MINIMUM,
  activityHours,
  activityMonths,
  activityWeights,
  activityWindow,
  bucketOf,
  countsAsActivity,
  nextActivityHour,
  NO_PLACE_ID,
  sumBuckets,
  UNKNOWN_MONTH,
  type ActivityBucket,
  type ActivityRecord,
} from './activity.js';
import { PARTY_ENDINGS } from './party-history.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);
/** When the records are bucketed: a Thursday of November 2026. */
const NOW = at('2026-11-05T12:00');

/** A raid recorded live at gym 7 in region 2, hatched at 18:00 on Thursday, 2026-10-22. */
const record = (overrides: Partial<ActivityRecord> = {}): ActivityRecord => ({
  kind: 'raid',
  ending: 'completed',
  createdAt: at('2026-10-22T17:20'),
  hatchTime: at('2026-10-22T18:00'),
  regionId: 2,
  gymId: 7,
  wayspotId: null,
  hereHeads: 3,
  doneHeads: 2,
  ...overrides,
});

/** A bucket of `parties` raids at gym `id` in region 1, in `month` on a weekday at an hour. */
const bucket = (
  id: number | string,
  month: string,
  weekday: number,
  hour: number,
  parties = 3,
  overrides: Partial<ActivityBucket> = {},
): ActivityBucket => ({
  regionId: 1,
  placeKind: typeof id === 'number' ? 'gym' : 'spot',
  placeId: String(id),
  month,
  weekday,
  hour,
  raids: parties,
  maxes: 0,
  completed: 0,
  heads: 0,
  ...overrides,
});

const everywhere = () => true;

describe('what counts toward the activity heatmap', () => {
  it('counts raids and max battles however they ended, but canceled', () => {
    for (const ending of PARTY_ENDINGS) {
      expect(countsAsActivity({ kind: 'raid', ending })).toBe(ending !== 'cancelled');
      expect(countsAsActivity({ kind: 'max', ending })).toBe(ending !== 'cancelled');
    }
  });

  it('counts no train and no meetup', () => {
    expect(countsAsActivity({ kind: 'train', ending: 'completed' })).toBe(false);
    expect(countsAsActivity({ kind: 'meetup', ending: 'completed' })).toBe(false);
  });
});

describe('the bucket of a record', () => {
  it('is its gym, its region, and the local month, weekday and hour it hatched', () => {
    expect(bucketOf(record(), ZONE, NOW)).toEqual({
      regionId: 2,
      placeKind: 'gym',
      placeId: '7',
      month: '2026-10',
      weekday: 4,
      hour: 18,
      raids: 1,
      maxes: 0,
      completed: 1,
      heads: 5,
    });
  });

  it('takes the time it was made where it has no hatch, as the raids-by-hour query does', () => {
    expect(bucketOf(record({ hatchTime: null }), ZONE, NOW)).toMatchObject({ hour: 17 });
  });

  it('is the local month and weekday, not UTC’s', () => {
    // 03:30 UTC on Sunday, March 1st is 22:30 on Saturday, February 28th in New York.
    const late = Date.UTC(2026, 2, 1, 3, 30);
    expect(bucketOf(record({ hatchTime: late }), ZONE, NOW)).toMatchObject({
      month: '2026-02',
      weekday: 6,
      hour: 22,
    });
  });

  it('is a max battle’s Power Spot, by its Wayfarer id', () => {
    const max = record({ kind: 'max', gymId: null, wayspotId: 'abc.16', ending: 'expired' });
    expect(bucketOf(max, ZONE, NOW)).toMatchObject({
      placeKind: 'spot',
      placeId: 'abc.16',
      raids: 0,
      maxes: 1,
      completed: 0,
    });
  });

  it('is no place for a raid without a gym or a max battle at a pin, and region 0 for none', () => {
    expect(bucketOf(record({ gymId: null }), ZONE, NOW)).toMatchObject({
      placeKind: 'none',
      placeId: '0',
    });
    expect(bucketOf(record({ kind: 'max', gymId: null }), ZONE, NOW)).toMatchObject({
      placeKind: 'none',
      placeId: '0',
      maxes: 1,
    });
    expect(bucketOf(record({ regionId: null }), ZONE, NOW)).toMatchObject({ regionId: 0 });
  });

  it('gives both 1 AMs of the night the clocks go back hour 1', () => {
    // 2026-11-01 in New York: 1:30 EDT (05:30 UTC), then 1:30 EST (06:30 UTC).
    for (const hatch of [Date.UTC(2026, 10, 1, 5, 30), Date.UTC(2026, 10, 1, 6, 30)]) {
      expect(bucketOf(record({ hatchTime: hatch }), ZONE, NOW)).toMatchObject({
        month: '2026-11',
        weekday: 7,
        hour: 1,
      });
    }
  });

  it('puts a record of a time no month can hold at no place and no time, never in a window', () => {
    const unknown = {
      regionId: 2,
      placeKind: 'none',
      placeId: NO_PLACE_ID,
      month: UNKNOWN_MONTH,
      weekday: 0,
      hour: 0,
    };
    // Beyond year 9999, before year 0, and no moment at all: the adding never stalls on them.
    for (const hatchTime of [8.64e15, -8.64e15, Number.NaN]) {
      expect(bucketOf(record({ hatchTime }), ZONE, NOW)).toMatchObject({ ...unknown, raids: 1 });
    }
    const odd = bucketOf(record({ hatchTime: 8.64e15 }), ZONE, NOW);
    if (!odd) throw new Error('no bucket');
    const now = at('2026-10-22T18:40');
    for (const mode of [
      { kind: 'now' },
      { kind: 'evenings' },
      { kind: 'history', year: 2026 },
    ] as const) {
      expect(activityWeights([odd], mode, now, ZONE, everywhere)).toEqual({
        places: [],
        leftOut: 0,
      });
    }
  });

  it('puts a record before the game’s launch or after next month at no place and no time (8H4-3)', () => {
    const unknown = { placeKind: 'none', placeId: NO_PLACE_ID, month: UNKNOWN_MONTH, weekday: 0 };
    for (const hatchTime of [
      at('2016-06-30T23:59'),
      at('1970-01-01T00:00'),
      at('2027-01-01T00:00'),
      at('2099-05-05T18:00'),
    ]) {
      expect(bucketOf(record({ hatchTime }), ZONE, NOW), String(hatchTime)).toMatchObject({
        ...unknown,
        raids: 1,
      });
    }
    // The first month of the game and this month are in the range, by the zone's months.
    expect(bucketOf(record({ hatchTime: at('2016-07-01T00:00') }), ZONE, NOW)).toMatchObject({
      placeKind: 'gym',
      month: '2016-07',
    });
    expect(bucketOf(record({ hatchTime: at('2026-11-30T23:30') }), ZONE, NOW)).toMatchObject({
      placeKind: 'gym',
      month: '2026-11',
    });
    // A record added before the month turns may already be of the next month (an egg of the
    // legacy import's active/ that hatches on the 1st): it keeps its place (review F1); the
    // slider still ends at this month (activityMonths).
    expect(bucketOf(record({ hatchTime: at('2026-12-01T00:30') }), ZONE, NOW)).toMatchObject({
      placeKind: 'gym',
      month: '2026-12',
    });
  });

  it('bounds the slider’s months to the game’s launch and this month in the zone (8H4-3)', () => {
    expect(ACTIVITY_FIRST_MONTH).toBe('2016-07');
    expect(activityMonths({ first: '2018-03', last: '2026-10' }, NOW, ZONE)).toEqual({
      first: '2018-03',
      last: '2026-10',
    });
    // One bad time stretches neither end.
    expect(activityMonths({ first: '1970-01', last: '2099-05' }, NOW, ZONE)).toEqual({
      first: '2016-07',
      last: '2026-11',
    });
    // This month by the zone: 03:30 UTC on December 1st is still November in New York.
    expect(
      activityMonths({ first: '2019-01', last: '2026-12' }, Date.UTC(2026, 11, 1, 3, 30), ZONE),
    ).toEqual({ first: '2019-01', last: '2026-11' });
    // Nothing left in the range is no months at all.
    expect(activityMonths({ first: '2099-01', last: '2099-05' }, NOW, ZONE)).toBeNull();
    expect(activityMonths({ first: '2001-01', last: '2015-12' }, NOW, ZONE)).toBeNull();
    expect(activityMonths(null, NOW, ZONE)).toBeNull();
  });

  it('is none for what does not count', () => {
    expect(bucketOf(record({ ending: 'cancelled' }), ZONE, NOW)).toBeUndefined();
    expect(bucketOf(record({ kind: 'train' }), ZONE, NOW)).toBeUndefined();
  });

  it('sums buckets of one key, keeping each key once', () => {
    const one = bucketOf(record(), ZONE, NOW);
    const other = bucketOf(record({ gymId: 8 }), ZONE, NOW);
    if (!one || !other) throw new Error('no bucket');
    expect(sumBuckets([one, other, one])).toEqual([
      { ...one, raids: 2, completed: 2, heads: 10 },
      other,
    ]);
  });
});

describe('the hours of a mode', () => {
  it('Expected now is today’s weekday, from the hour before now to the hour after', () => {
    expect(activityHours({ kind: 'now' }, at('2026-10-22T18:40'), ZONE)).toEqual([
      { weekday: 4, hour: 17 },
      { weekday: 4, hour: 18 },
      { weekday: 4, hour: 19 },
    ]);
  });

  it('wraps midnight into the weekday before and after', () => {
    // Monday 00:20: Sunday's last hour is the hour before.
    expect(activityHours({ kind: 'now' }, at('2026-10-26T00:20'), ZONE)).toEqual([
      { weekday: 7, hour: 23 },
      { weekday: 1, hour: 0 },
      { weekday: 1, hour: 1 },
    ]);
    // Sunday 23:50: Monday's first hour is the hour after.
    expect(activityHours({ kind: 'now' }, at('2026-10-25T23:50'), ZONE)).toEqual([
      { weekday: 7, hour: 22 },
      { weekday: 7, hour: 23 },
      { weekday: 1, hour: 0 },
    ]);
  });

  it('keeps three wall-clock hours on the days the clocks change', () => {
    // 2026-11-01 01:30 EDT, before the clocks go back: the hour repeats, the window does not.
    const fallBack = Date.UTC(2026, 10, 1, 5, 30);
    expect(activityHours({ kind: 'now' }, fallBack, ZONE).map((one) => one.hour)).toEqual([
      0, 1, 2,
    ]);
    // 2026-03-08 03:30 EDT, the hour after the one skipped: 2 AM is still other years' hour.
    const springForward = at('2026-03-08T03:30');
    expect(activityHours({ kind: 'now' }, springForward, ZONE).map((one) => one.hour)).toEqual([
      2, 3, 4,
    ]);
  });

  it('weekday evenings are Monday to Friday, 17:00 to 21:59', () => {
    const hours = activityHours({ kind: 'evenings' }, at('2026-10-22T09:00'), ZONE);
    expect(hours).toHaveLength(25);
    expect(new Set(hours.map((one) => one.weekday))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(new Set(hours.map((one) => one.hour))).toEqual(new Set([17, 18, 19, 20, 21]));
  });

  it('weekend afternoons are Saturday and Sunday, 12:00 to 16:59', () => {
    const hours = activityHours({ kind: 'weekend' }, at('2026-10-22T09:00'), ZONE);
    expect(hours).toHaveLength(10);
    expect(new Set(hours.map((one) => one.weekday))).toEqual(new Set([6, 7]));
    expect(new Set(hours.map((one) => one.hour))).toEqual(new Set([12, 13, 14, 15, 16]));
  });

  it('History is every hour of its months', () => {
    expect(activityWindow({ kind: 'history', year: 2019 }, 0, ZONE)).toEqual({
      months: { first: '2019-01', last: '2019-12' },
    });
    expect(activityWindow({ kind: 'history', month: '2019-06' }, 0, ZONE)).toEqual({
      months: { first: '2019-06', last: '2019-06' },
    });
  });
});

describe('the weights of a mode', () => {
  const now = at('2026-10-22T18:40');

  it('weighs this year’s parties at this hour, the hour before and after, today’s weekday alone', () => {
    const weights = activityWeights(
      [
        bucket(1, '2026-10', 4, 18, 4),
        bucket(1, '2026-10', 4, 17, 2),
        bucket(2, '2026-10', 4, 19, 3),
        // Another weekday, and another hour: outside the window.
        bucket(3, '2026-10', 3, 18, 9),
        bucket(3, '2026-10', 4, 21, 9),
      ],
      { kind: 'now' },
      now,
      ZONE,
      everywhere,
    );
    expect(weights.places).toEqual([
      { kind: 'gym', id: '1', weight: 1, parties: 6 },
      { kind: 'gym', id: '2', weight: 0.5, parties: 3 },
    ]);
    expect(weights.leftOut).toBe(0);
  });

  it('halves a party’s weight with every year since the middle of its month', () => {
    const weights = activityWeights(
      [bucket(1, '2026-10', 4, 18, 4), bucket(2, '2025-10', 4, 18, 4)],
      { kind: 'now' },
      now,
      ZONE,
      everywhere,
    );
    const [recent, older] = weights.places;
    expect(recent?.weight).toBe(1);
    expect(older?.weight).toBeCloseTo(0.5, 2);
    // Five years back counts about 3%: 2019 under 1%.
    const old = activityWeights(
      [bucket(1, '2026-10', 4, 18, 4), bucket(2, '2019-10', 4, 18, 4)],
      { kind: 'now' },
      now,
      ZONE,
      everywhere,
    );
    expect(old.places[1]?.weight).toBeLessThan(0.01);
    // Unweighted in what it counts: both still have their four parties.
    expect(old.places.map((place) => place.parties)).toEqual([4, 4]);
  });

  it('draws a place only with three parties in the window: fewer are quiet, not left out', () => {
    const weights = activityWeights(
      [
        bucket(1, '2026-10', 4, 18, ACTIVITY_MINIMUM),
        bucket(2, '2026-10', 4, 18, ACTIVITY_MINIMUM - 1),
        // Two in the window and one outside it are still two.
        bucket(3, '2026-10', 4, 18, 2),
        bucket(3, '2026-10', 5, 18, 1),
      ],
      { kind: 'now' },
      now,
      ZONE,
      everywhere,
    );
    expect(weights.places.map((place) => place.id)).toEqual(['1']);
    expect(weights.leftOut).toBe(0);
  });

  it('counts the minimum by the parties of a place, gyms and Power Spots alike, every region', () => {
    const weights = activityWeights(
      [
        bucket(1, '2026-10', 4, 18, 2),
        bucket(1, '2026-10', 4, 18, 1, { regionId: 2 }),
        bucket('abc.16', '2026-10', 4, 18, 0, { maxes: 3 }),
      ],
      { kind: 'now' },
      now,
      ZONE,
      everywhere,
    );
    expect(weights.places).toEqual([
      { kind: 'gym', id: '1', weight: 1, parties: 3 },
      { kind: 'spot', id: 'abc.16', weight: 1, parties: 3 },
    ]);
  });

  it('leaves out the parties at no place and at places no longer kept, and says how many', () => {
    const weights = activityWeights(
      [
        bucket(1, '2026-10', 4, 18, 3),
        bucket(2, '2026-10', 4, 18, 4),
        bucket('gone.16', '2026-10', 4, 18, 0, { maxes: 1 }),
        bucket(0, '2026-10', 4, 18, 2, { placeKind: 'none', placeId: '0' }),
        // Outside the window: neither drawn nor left out.
        bucket(0, '2026-10', 1, 9, 5, { placeKind: 'none', placeId: '0' }),
      ],
      { kind: 'now' },
      now,
      ZONE,
      (kind, id) => kind === 'gym' && id === '1',
    );
    expect(weights.places.map((place) => place.id)).toEqual(['1']);
    // Gym 2 (4), the Power Spot gone (1) and the parties at no place (2).
    expect(weights.leftOut).toBe(7);
  });

  it('weighs the presets with the same half-life', () => {
    const evenings = activityWeights(
      [bucket(1, '2026-10', 2, 20, 4), bucket(2, '2025-10', 5, 17, 4), bucket(3, '2026-10', 6, 20)],
      { kind: 'evenings' },
      now,
      ZONE,
      everywhere,
    );
    expect(evenings.places.map((place) => [place.id, place.weight])).toEqual([
      ['1', 1],
      ['2', expect.closeTo(0.5, 2)],
    ]);
    const weekend = activityWeights(
      [bucket(1, '2026-10', 6, 12, 3), bucket(2, '2026-10', 7, 16, 6), bucket(3, '2026-10', 7, 17)],
      { kind: 'weekend' },
      now,
      ZONE,
      everywhere,
    );
    expect(weekend.places.map((place) => [place.id, place.weight])).toEqual([
      ['1', 0.5],
      ['2', 1],
    ]);
  });

  it('weighs History unweighted by age, by year or by month, every weekday and hour', () => {
    const buckets = [
      bucket(1, '2019-06', 1, 3, 4),
      bucket(1, '2019-07', 6, 22, 4),
      bucket(2, '2019-06', 4, 18, 4),
      bucket(3, '2020-01', 4, 18, 9),
    ];
    const year = activityWeights(buckets, { kind: 'history', year: 2019 }, now, ZONE, everywhere);
    expect(year.places).toEqual([
      { kind: 'gym', id: '1', weight: 1, parties: 8 },
      { kind: 'gym', id: '2', weight: 0.5, parties: 4 },
    ]);
    const month = activityWeights(
      buckets,
      { kind: 'history', month: '2019-06' },
      now,
      ZONE,
      everywhere,
    );
    expect(month.places).toEqual([
      { kind: 'gym', id: '1', weight: 1, parties: 4 },
      { kind: 'gym', id: '2', weight: 1, parties: 4 },
    ]);
  });

  it('draws nothing where nothing counts', () => {
    expect(activityWeights([], { kind: 'now' }, now, ZONE, everywhere)).toEqual({
      places: [],
      leftOut: 0,
    });
  });
});

describe('when Expected now changes', () => {
  it('at the next hour on the wall clock', () => {
    expect(nextActivityHour(at('2026-10-22T18:40'), ZONE)).toBe(at('2026-10-22T19:00'));
    expect(nextActivityHour(at('2026-10-22T23:59'), ZONE)).toBe(at('2026-10-23T00:00'));
  });
});
