import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_SERVER,
  activityBucket,
  OTHER_ACTIVITY_SERVER,
} from '../../test/support/activity-cases.js';
import { MemoryActivity } from '../../test/support/activity.js';
import type { ActivityBucket, ActivityWindow } from '../domain/history/activity.js';
import { ACTIVITY_READ_FRESH_MS, ACTIVITY_READS_KEPT, KeptActivity } from './kept-activity.js';

const NOW = 1_793_000_000_000;
/** Thursday evening, three hours. */
const EVENING: ActivityWindow = {
  hours: [17, 18, 19].map((hour) => ({ weekday: 4, hour })),
};
const JUNE: ActivityWindow = { months: { first: '2019-06', last: '2019-06' } };

/** A server's buckets in memory (June 2019 and October 2026) behind the kept reads, the clock held. */
async function setup() {
  const activity = new MemoryActivity();
  await activity.add(ACTIVITY_SERVER, [
    activityBucket(1, '2019-06', 4, 18),
    activityBucket(2, '2026-10', 4, 19),
    activityBucket(3, '2026-10', 1, 9),
  ]);
  await activity.add(OTHER_ACTIVITY_SERVER, [activityBucket(9, '2026-10', 4, 18)]);
  const clock = { now: NOW };
  const kept = new KeptActivity(activity, { now: () => clock.now });
  return { activity, kept, clock };
}

const places = (buckets: readonly ActivityBucket[]) => buckets.map((one) => one.placeId).sort();

describe('the kept reads of the activity buckets (plan 8Z-2)', () => {
  it('reads a server’s window once a minute, whoever asks', async () => {
    const { activity, kept, clock } = await setup();
    expect(places(await kept.buckets(ACTIVITY_SERVER, EVENING))).toEqual(['1', '2']);
    expect(places(await kept.buckets(ACTIVITY_SERVER, EVENING))).toEqual(['1', '2']);
    // The same hours in another order are the same window.
    const turned: ActivityWindow = { hours: [...EVENING.hours].reverse() };
    expect(places(await kept.buckets(ACTIVITY_SERVER, turned))).toEqual(['1', '2']);
    expect(activity.reads).toBe(1);
    // What was added meanwhile is seen once the minute is over.
    await activity.add(ACTIVITY_SERVER, [activityBucket(4, '2026-11', 4, 17)]);
    clock.now += ACTIVITY_READ_FRESH_MS - 1;
    expect(places(await kept.buckets(ACTIVITY_SERVER, EVENING))).toEqual(['1', '2']);
    clock.now += 1;
    expect(places(await kept.buckets(ACTIVITY_SERVER, EVENING))).toEqual(['1', '2', '4']);
    expect(activity.reads).toBe(2);
  });

  it('keeps each server and each window apart', async () => {
    const { activity, kept } = await setup();
    expect(places(await kept.buckets(ACTIVITY_SERVER, EVENING))).toEqual(['1', '2']);
    expect(places(await kept.buckets(OTHER_ACTIVITY_SERVER, EVENING))).toEqual(['9']);
    const morning: ActivityWindow = { hours: [{ weekday: 1, hour: 9 }] };
    expect(places(await kept.buckets(ACTIVITY_SERVER, morning))).toEqual(['3']);
    expect(places(await kept.buckets(ACTIVITY_SERVER, JUNE))).toEqual(['1']);
    // Three windows of the first server, its months for June, one window of the other.
    expect(activity.reads).toBe(5);
    await kept.buckets(ACTIVITY_SERVER, morning);
    await kept.buckets(OTHER_ACTIVITY_SERVER, EVENING);
    await kept.buckets(ACTIVITY_SERVER, JUNE);
    expect(activity.reads).toBe(5);
  });

  it('shares a read that is on its way', async () => {
    const { activity, kept } = await setup();
    const [first, second] = await Promise.all([
      kept.buckets(ACTIVITY_SERVER, EVENING),
      kept.buckets(ACTIVITY_SERVER, EVENING),
    ]);
    expect(activity.reads).toBe(1);
    // The very rows, not a copy for each.
    expect(second).toBe(first);
  });

  it('does not keep a read that failed', async () => {
    const { activity, kept } = await setup();
    activity.failing = new Error('no database');
    await expect(kept.buckets(ACTIVITY_SERVER, EVENING)).rejects.toThrow('no database');
    await expect(kept.months(ACTIVITY_SERVER)).rejects.toThrow('no database');
    activity.failing = undefined;
    expect(places(await kept.buckets(ACTIVITY_SERVER, EVENING))).toEqual(['1', '2']);
    expect(await kept.months(ACTIVITY_SERVER)).toEqual({ first: '2019-06', last: '2026-10' });
    expect(activity.reads).toBe(4);
  });

  it('gives rows nobody can change', async () => {
    const { kept } = await setup();
    const rows = await kept.buckets(ACTIVITY_SERVER, EVENING);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(() => (rows as ActivityBucket[]).push(activityBucket(8, '2026-10', 4, 18))).toThrow(
      TypeError,
    );
    expect(places(await kept.buckets(ACTIVITY_SERVER, EVENING))).toEqual(['1', '2']);
  });

  it('answers months the server has none of without reading the buckets, and keeps nothing of them', async () => {
    const { activity, kept } = await setup();
    await kept.buckets(ACTIVITY_SERVER, EVENING);
    expect(activity.reads).toBe(1);
    // Before its first month, after its last, a year it has none of: only its months are read, once.
    for (const months of [
      { first: '2019-05', last: '2019-05' },
      { first: '2026-11', last: '2026-11' },
      { first: '2018-01', last: '2018-12' },
    ]) {
      expect(await kept.buckets(ACTIVITY_SERVER, { months })).toEqual([]);
    }
    expect(activity.reads).toBe(2);
    // As many months as the kept reads have room for, every one of them made up: none takes
    // the place of a read that is kept.
    for (let year = 3000; year < 3000 + ACTIVITY_READS_KEPT + 20; year++) {
      const month = `${String(year)}-01`;
      expect(
        await kept.buckets(ACTIVITY_SERVER, { months: { first: month, last: month } }),
      ).toEqual([]);
    }
    await kept.buckets(ACTIVITY_SERVER, EVENING);
    expect(activity.reads).toBe(2);
    // A year that holds one of its months is read; a server without buckets has no months.
    const year: ActivityWindow = { months: { first: '2019-01', last: '2019-12' } };
    expect(places(await kept.buckets(ACTIVITY_SERVER, year))).toEqual(['1']);
    expect(activity.reads).toBe(3);
    expect(await kept.buckets('412345678901234569', JUNE)).toEqual([]);
    expect(activity.reads).toBe(4);
  });

  it('reads no hours for a window without any', async () => {
    const { activity, kept } = await setup();
    expect(await kept.buckets(ACTIVITY_SERVER, { hours: [] })).toEqual([]);
    expect(activity.reads).toBe(0);
  });

  it('keeps a server’s months and the region tally’s sums of a period as well', async () => {
    const { activity, kept, clock } = await setup();
    const all = { first: '2016-07', last: '2026-11' };
    expect(await kept.months(ACTIVITY_SERVER)).toEqual({ first: '2019-06', last: '2026-10' });
    expect(await kept.months(ACTIVITY_SERVER)).toEqual({ first: '2019-06', last: '2026-10' });
    expect(await kept.regionSums(ACTIVITY_SERVER, all)).toEqual([
      { regionId: 1, raids: 9, maxes: 0 },
    ]);
    expect(await kept.regionSums(ACTIVITY_SERVER, all)).toEqual([
      { regionId: 1, raids: 9, maxes: 0 },
    ]);
    expect(await kept.regionSums(ACTIVITY_SERVER, { first: '2019-06', last: '2019-06' })).toEqual([
      { regionId: 1, raids: 3, maxes: 0 },
    ]);
    expect(activity.reads).toBe(3);
    clock.now += ACTIVITY_READ_FRESH_MS;
    await kept.months(ACTIVITY_SERVER);
    await kept.regionSums(ACTIVITY_SERVER, all);
    expect(activity.reads).toBe(5);
  });

  it('keeps as many reads as it has room for, the oldest read again', async () => {
    const { activity, kept } = await setup();
    const hour = (n: number): ActivityWindow => ({
      hours: [{ weekday: 1 + (n % 7), hour: Math.floor(n / 7) }],
    });
    for (let n = 0; n < ACTIVITY_READS_KEPT; n++) await kept.buckets(ACTIVITY_SERVER, hour(n));
    expect(activity.reads).toBe(ACTIVITY_READS_KEPT);
    await kept.buckets(ACTIVITY_SERVER, hour(0));
    expect(activity.reads).toBe(ACTIVITY_READS_KEPT);
    // One more than there is room for: the first is forgotten, the second still kept.
    await kept.buckets(ACTIVITY_SERVER, hour(ACTIVITY_READS_KEPT));
    await kept.buckets(ACTIVITY_SERVER, hour(1));
    expect(activity.reads).toBe(ACTIVITY_READS_KEPT + 1);
    await kept.buckets(ACTIVITY_SERVER, hour(0));
    expect(activity.reads).toBe(ACTIVITY_READS_KEPT + 2);
  });
});
