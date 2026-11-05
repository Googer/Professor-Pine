import { expect, it } from 'vitest';
import type { ActivityReader } from '../../src/db/repositories/activity-repository.js';
import { UNKNOWN_MONTH, type ActivityBucket } from '../../src/domain/history/activity.js';

/** The server of the activity tests, and another one. */
export const ACTIVITY_SERVER = '412345678901234567';
export const OTHER_ACTIVITY_SERVER = '412345678901234568';

/** A bucket of `raids` raids at gym `gym` in region 1, at an hour of a weekday of a month. */
export function activityBucket(
  gym: number,
  month: string,
  weekday: number,
  hour: number,
  overrides: Partial<ActivityBucket> = {},
): ActivityBucket {
  return {
    regionId: 1,
    placeKind: 'gym',
    placeId: String(gym),
    month,
    weekday,
    hour,
    raids: 3,
    maxes: 0,
    completed: 1,
    heads: 9,
    ...overrides,
  };
}

/**
 * What reading the activity buckets does, run against the repository and its twin alike.
 * `made` gives a fresh reader and a way to put buckets of a server in place.
 */
export function activityReaderCases(
  made: () => Promise<{
    reader: ActivityReader;
    add: (serverId: string, buckets: readonly ActivityBucket[]) => Promise<void>;
  }>,
): void {
  const sorted = (buckets: readonly ActivityBucket[]) =>
    [...buckets].sort((a, b) =>
      `${a.placeId} ${a.month} ${String(a.weekday)} ${String(a.hour).padStart(2, '0')}`.localeCompare(
        `${b.placeId} ${b.month} ${String(b.weekday)} ${String(b.hour).padStart(2, '0')}`,
      ),
    );

  it('reads a server’s buckets of some weekdays’ hours, every month', async () => {
    const { reader, add } = await made();
    const thursdayEvening = activityBucket(1, '2019-06', 4, 18);
    const thursdayLater = activityBucket(2, '2026-10', 4, 19, {
      placeKind: 'spot',
      placeId: 'a.16',
    });
    await add(ACTIVITY_SERVER, [
      thursdayEvening,
      thursdayLater,
      activityBucket(1, '2026-10', 4, 21),
      activityBucket(1, '2026-10', 5, 18),
    ]);
    await add(OTHER_ACTIVITY_SERVER, [activityBucket(1, '2026-10', 4, 18)]);
    const read = await reader.buckets(ACTIVITY_SERVER, {
      hours: [
        { weekday: 4, hour: 18 },
        { weekday: 4, hour: 19 },
        { weekday: 3, hour: 18 },
      ],
    });
    expect(sorted(read)).toEqual([thursdayEvening, thursdayLater]);
    expect(await reader.buckets(ACTIVITY_SERVER, { hours: [] })).toEqual([]);
  });

  it('reads a server’s buckets of some months, every hour', async () => {
    const { reader, add } = await made();
    const june = activityBucket(1, '2019-06', 1, 3);
    const december = activityBucket(1, '2019-12', 7, 23, {
      regionId: 0,
      placeKind: 'none',
      placeId: '0',
    });
    await add(ACTIVITY_SERVER, [june, december, activityBucket(1, '2020-01', 1, 3)]);
    expect(
      sorted(
        await reader.buckets(ACTIVITY_SERVER, { months: { first: '2019-01', last: '2019-12' } }),
      ),
    ).toEqual(sorted([june, december]));
    expect(
      await reader.buckets(ACTIVITY_SERVER, { months: { first: '2019-06', last: '2019-06' } }),
    ).toEqual([june]);
  });

  it('sums a server’s raids and max battles per region over a span of months (plan 8H-5)', async () => {
    const { reader, add } = await made();
    expect(await reader.regionSums(ACTIVITY_SERVER, { first: '2019-01', last: '2019-12' })).toEqual(
      [],
    );
    await add(ACTIVITY_SERVER, [
      activityBucket(1, '2019-06', 1, 3, { raids: 2 }),
      activityBucket(2, '2019-12', 7, 23, { raids: 1, maxes: 4 }),
      activityBucket(0, '2019-07', 2, 18, {
        regionId: 2,
        placeKind: 'none',
        placeId: '0',
        raids: 5,
        maxes: 0,
      }),
      activityBucket(3, '2019-08', 2, 18, { regionId: 0, raids: 0, maxes: 2 }),
      // Out of the span, before and after.
      activityBucket(1, '2018-12', 1, 3),
      activityBucket(1, '2020-01', 1, 3),
      // At no time: in no span.
      activityBucket(0, UNKNOWN_MONTH, 0, 0, { placeKind: 'none', placeId: '0' }),
    ]);
    await add(OTHER_ACTIVITY_SERVER, [activityBucket(1, '2019-06', 1, 3)]);
    const sums = await reader.regionSums(ACTIVITY_SERVER, { first: '2019-01', last: '2019-12' });
    expect([...sums].sort((a, b) => a.regionId - b.regionId)).toEqual([
      { regionId: 0, raids: 0, maxes: 2 },
      { regionId: 1, raids: 3, maxes: 4 },
      { regionId: 2, raids: 5, maxes: 0 },
    ]);
    expect(await reader.regionSums(ACTIVITY_SERVER, { first: '2019-06', last: '2019-06' })).toEqual(
      [{ regionId: 1, raids: 2, maxes: 0 }],
    );
    expect(
      await reader.regionSums(ACTIVITY_SERVER, { first: '2016-07', last: '2026-11' }),
    ).toHaveLength(3);
  });

  it('says the first and the last month a server has buckets of, none for a server without', async () => {
    const { reader, add } = await made();
    expect(await reader.months(ACTIVITY_SERVER)).toBeNull();
    await add(ACTIVITY_SERVER, [
      activityBucket(1, '2019-06', 1, 3),
      activityBucket(2, '2018-03', 1, 3, { regionId: 2 }),
      activityBucket(1, '2026-10', 1, 3),
    ]);
    await add(OTHER_ACTIVITY_SERVER, [activityBucket(1, '2027-01', 1, 3)]);
    // A record of a time no month holds (`bucketOf`) is in no month of the slider.
    await add(ACTIVITY_SERVER, [
      activityBucket(0, UNKNOWN_MONTH, 0, 0, { placeKind: 'none', placeId: '0' }),
    ]);
    expect(await reader.months(ACTIVITY_SERVER)).toEqual({ first: '2018-03', last: '2026-10' });
  });
}
