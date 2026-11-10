import { describe, expect, it } from 'vitest';
import { ACTIVITY_SERVER, activityDay } from '../../test/support/activity-cases.js';
import { MemoryActivity } from '../../test/support/activity.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { zonedAt } from '../../test/support/time.js';
import type { ActivityDay } from '../domain/history/activity.js';
import { dayNumber, dayText } from '../domain/history/big-days.js';
import { DAYS_FRESH_MS, DAYS_UNCOUNTED_MS, HistoryDays } from './history-days.js';

const ZONE = 'America/New_York';
const NOW = zonedAt('2026-11-06T12:00', ZONE);

/** `count` days from `first`, 40 raids of nobody known a day in region 1, and a spike or two. */
function stretch(first: string, count: number, spikes: Record<string, ActivityDay[]> = {}) {
  const start = dayNumber(first);
  return Array.from({ length: count }, (_, index) => {
    const day = dayText(start + index);
    return spikes[day] ?? [activityDay(day, '', 40 + ((index * 7) % 5) - 2)];
  }).flat();
}

async function setup(days: readonly ActivityDay[]) {
  const reader = new MemoryActivity();
  await reader.addDays(ACTIVITY_SERVER, days);
  const service = new HistoryDays({
    reader,
    zone: ZONE,
    bossName: (key) => catalogueFixture().byKey(key)?.name,
  });
  return { reader, service };
}

/** Mewtwo's evening of 2019-10-08: 180 of 412 raids, a third of them in region 2. */
const MEWTWO_DAY = [
  activityDay('2019-10-08', 'mewtwo', 120),
  activityDay('2019-10-08', 'mewtwo', 60, { regionId: 2 }),
  activityDay('2019-10-08', '', 232),
];

describe('the raids per day of a server', () => {
  it('gives a year’s days, its big days named by their boss, and the years there are', async () => {
    const { service } = await setup([
      ...stretch('2019-09-20', 40, { '2019-10-08': MEWTWO_DAY }),
      activityDay('2024-06-01', 'zapdos', 0, { maxes: 4 }),
    ]);
    const year = await service.year(ACTIVITY_SERVER, new Set(), 2019, NOW);
    expect(year.years).toEqual([2024, 2019]);
    expect(year.days).toHaveLength(40);
    expect(year.days.find((one) => one.day === '2019-10-08')).toEqual({
      day: '2019-10-08',
      raids: 412,
      maxes: 0,
    });
    expect(year.big).toEqual([
      expect.objectContaining({
        day: '2019-10-08',
        raids: 412,
        boss: { key: 'mewtwo', name: 'Mewtwo', raids: 180 },
      }),
    ]);
    const maxYear = await service.year(ACTIVITY_SERVER, new Set(), 2024, NOW);
    expect(maxYear.days).toEqual([{ day: '2024-06-01', raids: 0, maxes: 4 }]);
    expect(maxYear.big).toEqual([]);
  });

  it('judges the days without the regions left out, the same function judging what is left', async () => {
    const { service } = await setup(stretch('2019-09-20', 40, { '2019-10-08': MEWTWO_DAY }));
    // Without region 2 the day still stands out, its boss counted in region 1 alone.
    const without = await service.year(ACTIVITY_SERVER, new Set([2]), 2019, NOW);
    expect(without.big).toEqual([
      expect.objectContaining({ raids: 352, boss: { key: 'mewtwo', name: 'Mewtwo', raids: 120 } }),
    ]);
    expect(without.days.find((one) => one.day === '2019-10-08')?.raids).toBe(352);
  });

  it('names a day by its raids alone where no boss has a quarter of them, or the catalogue lost it', async () => {
    const { service } = await setup(
      stretch('2019-09-20', 40, {
        // Under twenty Mewtwo: no Mewtwo day, and under a quarter of the day's raids.
        '2019-10-08': [activityDay('2019-10-08', 'mewtwo', 19), activityDay('2019-10-08', '', 393)],
        '2019-09-25': [activityDay('2019-09-25', 'missingno', 400)],
      }),
    );
    const year = await service.year(ACTIVITY_SERVER, new Set(), 2019, NOW);
    expect(year.big.map((one) => [one.day, one.boss])).toEqual([
      ['2019-09-25', undefined],
      ['2019-10-08', undefined],
    ]);
  });

  it('finds a boss’s own day the day’s raids would not show, named by its boss (round 1)', async () => {
    const { service } = await setup(
      stretch('2019-09-20', 40, {
        // 50 raids on days of 40: not a big day by its raids; but 30 Mewtwo, never there else.
        '2019-10-08': [activityDay('2019-10-08', 'mewtwo', 30), activityDay('2019-10-08', '', 20)],
        // A big day by its raids where a boss has a seventh of them: not its day (R1), no name.
        '2019-10-20': [activityDay('2019-10-20', 'lugia', 60), activityDay('2019-10-20', '', 352)],
      }),
    );
    const year = await service.year(ACTIVITY_SERVER, new Set(), 2019, NOW);
    expect(year.big.map((one) => [one.day, one.raids, one.boss])).toEqual([
      ['2019-10-20', 412, undefined],
      ['2019-10-08', 50, { key: 'mewtwo', name: 'Mewtwo', raids: 30 }],
    ]);
  });

  it('gives the newest year the server has where none is asked, else the local year of now', async () => {
    const { service } = await setup(stretch('2019-09-20', 40));
    expect((await service.year(ACTIVITY_SERVER, new Set(), undefined, NOW)).year).toBe(2019);
    const empty = await setup([]);
    // 03:00 UTC of New Year's Day is still the year before in New York (A6).
    const newYear = Date.UTC(2026, 0, 1, 3);
    expect((await empty.service.year(ACTIVITY_SERVER, new Set(), undefined, newYear)).year).toBe(
      2025,
    );
  });

  it('keeps a series the days have not caught up with only a moment (A1)', async () => {
    const { reader, service } = await setup(
      stretch('2019-09-20', 40, { '2019-10-08': MEWTWO_DAY }),
    );
    reader.complete = false;
    await service.year(ACTIVITY_SERVER, new Set(), 2019, NOW);
    const reads = reader.reads;
    await service.year(ACTIVITY_SERVER, new Set(), 2019, NOW + DAYS_UNCOUNTED_MS - 1);
    expect(reader.reads).toBe(reads);
    reader.complete = true;
    await service.year(ACTIVITY_SERVER, new Set(), 2019, NOW + DAYS_UNCOUNTED_MS);
    expect(reader.reads).toBe(reads * 2);
    // Once caught up, it is kept the few minutes again.
    await service.year(ACTIVITY_SERVER, new Set(), 2019, NOW + 2 * DAYS_UNCOUNTED_MS);
    expect(reader.reads).toBe(reads * 2);
  });

  it('reads a server’s days once a few minutes per set of regions left out, labels with them', async () => {
    const { reader, service } = await setup(
      stretch('2019-09-20', 40, { '2019-10-08': MEWTWO_DAY }),
    );
    await service.year(ACTIVITY_SERVER, new Set(), 2019, NOW);
    // Whether the days are caught up, the days and every day's bosses: one read, one snapshot (R3).
    expect(reader.reads).toBe(1);
    await service.year(ACTIVITY_SERVER, new Set(), 2018, NOW + 1_000);
    await service.everyYear(ACTIVITY_SERVER, new Set(), NOW + 2_000);
    expect(reader.reads).toBe(1);
    // Another set of regions is a read of its own; the same set in another order is not.
    await service.year(ACTIVITY_SERVER, new Set([2, 3]), 2019, NOW);
    await service.year(ACTIVITY_SERVER, new Set([3, 2]), 2019, NOW);
    expect(reader.reads).toBe(2);
    await service.year(ACTIVITY_SERVER, new Set(), 2019, NOW + DAYS_FRESH_MS);
    expect(reader.reads).toBe(3);
  });

  it('keeps no read that failed', async () => {
    const { reader, service } = await setup(stretch('2019-09-20', 40));
    reader.failing = new Error('away');
    await expect(service.year(ACTIVITY_SERVER, new Set(), 2019, NOW)).rejects.toThrow('away');
    reader.failing = undefined;
    expect((await service.year(ACTIVITY_SERVER, new Set(), 2019, NOW)).days).toHaveLength(40);
  });

  it('gives the top three of every year, one of a run of days in a row, newest year first', async () => {
    const { service } = await setup([
      ...stretch('2018-11-20', 50, {
        '2018-12-15': [activityDay('2018-12-15', 'lugia', 300)],
        '2018-12-16': [activityDay('2018-12-16', 'lugia', 320)],
      }),
      ...stretch('2019-09-01', 120, {
        '2019-09-18': [activityDay('2019-09-18', 'mewtwo', 500)],
        '2019-10-08': MEWTWO_DAY,
        '2019-11-02': [activityDay('2019-11-02', 'regirock', 200)],
        '2019-11-20': [activityDay('2019-11-20', 'deoxys', 600)],
      }),
    ]);
    const every = await service.everyYear(ACTIVITY_SERVER, new Set(), NOW);
    expect(every.map((one) => [one.year, one.days.map((day) => day.day)])).toEqual([
      [2019, ['2019-11-20', '2019-09-18', '2019-10-08']],
      [2018, ['2018-12-16']],
    ]);
  });

  it('gives what "On this day" recalls: earlier years’ top big days on today’s date, newest first', async () => {
    const { service } = await setup([
      ...stretch('2018-09-20', 40, {
        '2018-10-08': [activityDay('2018-10-08', 'lugia', 300)],
      }),
      ...stretch('2019-09-20', 40, { '2019-10-08': MEWTWO_DAY }),
    ]);
    const today = zonedAt('2026-10-08T10:00', ZONE);
    expect(await service.onThisDay(ACTIVITY_SERVER, new Set(), today, 3)).toEqual({
      today: '2026-10-08',
      complete: true,
      years: [
        expect.objectContaining({
          years: 7,
          day: expect.objectContaining({
            day: '2019-10-08',
            raids: 412,
            boss: { key: 'mewtwo', name: 'Mewtwo', raids: 180 },
          }) as unknown,
        }),
        expect.objectContaining({
          years: 8,
          day: expect.objectContaining({ raids: 300 }) as unknown,
        }),
      ],
    });
    expect(
      (await service.onThisDay(ACTIVITY_SERVER, new Set(), today + 86_400_000, 3)).years,
    ).toEqual([]);
    expect((await service.onThisDay(ACTIVITY_SERVER, new Set(), today, 0)).years).toEqual([]);
  });

  it('says whether the days held the whole history, so that the post can wait (A1)', async () => {
    const { reader, service } = await setup(
      stretch('2019-09-20', 40, { '2019-10-08': MEWTWO_DAY }),
    );
    reader.complete = false;
    const today = zonedAt('2026-10-08T10:00', ZONE);
    expect((await service.onThisDay(ACTIVITY_SERVER, new Set(), today, 3)).complete).toBe(false);
    reader.complete = true;
    const later = today + DAYS_UNCOUNTED_MS;
    expect((await service.onThisDay(ACTIVITY_SERVER, new Set(), later, 3)).complete).toBe(true);
  });

  it('lists the bosses by the catalogue’s names, leaving out keys it no longer knows', async () => {
    const { service } = await setup([
      activityDay('2019-10-08', 'mewtwo', 20),
      activityDay('2018-09-21', 'lugia', 30),
      activityDay('2018-09-21', 'missingno', 30),
      activityDay('2018-09-21', '', 30),
      // A max battle's boss alone is no boss of the raids.
      activityDay('2024-06-01', 'zapdos', 0, { maxes: 4 }),
    ]);
    expect(await service.bosses(ACTIVITY_SERVER, new Set(), NOW)).toEqual([
      { key: 'lugia', name: 'Lugia', raids: 30 },
      { key: 'mewtwo', name: 'Mewtwo', raids: 20 },
    ]);
  });

  it('gives a boss’s raids per month from its first to its last, the months between as 0', async () => {
    const { service } = await setup([
      activityDay('2018-11-21', 'mewtwo', 300),
      activityDay('2019-02-08', 'mewtwo', 20, { regionId: 2 }),
      activityDay('2019-02-09', 'mewtwo', 5),
    ]);
    expect(await service.boss(ACTIVITY_SERVER, 'mewtwo', new Set(), NOW)).toEqual({
      key: 'mewtwo',
      name: 'Mewtwo',
      months: [
        { month: '2018-11', raids: 300 },
        { month: '2018-12', raids: 0 },
        { month: '2019-01', raids: 0 },
        { month: '2019-02', raids: 25 },
      ],
    });
    expect(
      (await service.boss(ACTIVITY_SERVER, 'mewtwo', new Set([2]), NOW))?.months.at(-1),
    ).toEqual({
      month: '2019-02',
      raids: 5,
    });
    // A key the catalogue does not know is no boss; one without raids has no months.
    expect(await service.boss(ACTIVITY_SERVER, 'missingno', new Set(), NOW)).toBeUndefined();
    expect(await service.boss(ACTIVITY_SERVER, 'lugia', new Set(), NOW)).toEqual({
      key: 'lugia',
      name: 'Lugia',
      months: [],
    });
  });

  it('serves the boss list and a boss’s months from the series kept, no read of their own (W3)', async () => {
    const { reader, service } = await setup([
      activityDay('2018-11-21', 'mewtwo', 300),
      activityDay('2019-02-08', 'mewtwo', 20, { regionId: 2 }),
      activityDay('2019-02-09', 'lugia', 5),
    ]);
    await service.year(ACTIVITY_SERVER, new Set([2]), 2019, NOW);
    expect(reader.reads).toBe(1);
    expect(await service.bosses(ACTIVITY_SERVER, new Set([2]), NOW + 1_000)).toEqual([
      { key: 'lugia', name: 'Lugia', raids: 5 },
      { key: 'mewtwo', name: 'Mewtwo', raids: 300 },
    ]);
    expect(
      (await service.boss(ACTIVITY_SERVER, 'mewtwo', new Set([2]), NOW + 2_000))?.months,
    ).toEqual([{ month: '2018-11', raids: 300 }]);
    expect(reader.reads).toBe(1);
    // A key the catalogue does not know reads nothing.
    await service.boss(ACTIVITY_SERVER, 'missingno', new Set([3]), NOW);
    expect(reader.reads).toBe(1);
  });
});
