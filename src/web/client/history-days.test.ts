import { describe, expect, it } from 'vitest';
import type {
  BigDayView,
  BossTrendView,
  HistoryDaysView,
} from '../../domain/web/history-days-data.js';
import {
  bigDayLine,
  bigDaysAddress,
  bigLabels,
  bossAddress,
  bossOfText,
  bossesAddress,
  dayBars,
  dayIndex,
  daysAddress,
  daysTable,
  sectionFailure,
  trendBars,
  trendTable,
} from './history-days.js';

const GUILD = '412345678901234567';

const MEWTWO_DAY: BigDayView = {
  day: '2019-10-08',
  date: 'Tuesday, October 8, 2019',
  short: 'Oct 8',
  raids: 412,
  label: 'Mewtwo day, 180 of 412 raids',
  labeled: true,
  top: true,
};

const year = (overrides: Partial<HistoryDaysView> = {}): HistoryDaysView => ({
  year: 2019,
  years: [2024, 2019],
  title: 'Raids by day, 2019',
  days: [
    { day: '2019-01-01', raids: 100, maxes: 0 },
    { day: '2019-10-08', raids: 412, maxes: 0 },
    { day: '2019-12-31', raids: 50, maxes: 0 },
  ],
  length: 365,
  maxes: false,
  months: [
    { month: 'January', raids: 100, maxes: 0 },
    { month: 'October', raids: 412, maxes: 0 },
    { month: 'December', raids: 50, maxes: 0 },
  ],
  bigTitle: 'Big days of 2019',
  big: [MEWTWO_DAY],
  noBig: 'No big days in 2019.',
  bigNote: 'A big day had far more raids than the weeks around it, or far more of one boss.',
  monthWord: 'Month',
  bigDayWord: 'Big day',
  raidsWord: 'Raids',
  maxesWord: 'Max battles',
  ...overrides,
});

/** A big day of 2019 on `day`, labeled "Mon d". */
const bigOn = (day: string, marks: Partial<BigDayView> = {}): BigDayView => ({
  ...MEWTWO_DAY,
  day,
  short: new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }),
  ...marks,
});

describe('raids by day on the history page', () => {
  it('asks for a year’s days, every year’s big days, the bosses and one boss', () => {
    expect(daysAddress(GUILD, null)).toBe(`/s/${GUILD}/api/history/days`);
    expect(daysAddress(GUILD, 2019)).toBe(`/s/${GUILD}/api/history/days?year=2019`);
    expect(bigDaysAddress(GUILD)).toBe(`/s/${GUILD}/api/history/big-days`);
    expect(bossesAddress(GUILD)).toBe(`/s/${GUILD}/api/history/bosses`);
    expect(bossAddress(GUILD, 'giratina_altered')).toBe(
      `/s/${GUILD}/api/history/bosses/giratina_altered`,
    );
  });

  it('places a day by its day of the year, the 29th of February in a leap year', () => {
    expect(dayIndex('2019-01-01')).toBe(0);
    expect(dayIndex('2019-12-31')).toBe(364);
    expect(dayIndex('2020-03-01')).toBe(60);
    expect(dayIndex('2020-12-31')).toBe(365);
  });

  it('scales a year’s bars to its busiest day, the big days marked, every day in its place', () => {
    const bars = dayBars(year(), 100);
    expect(bars).toHaveLength(3);
    expect(bars[1]).toEqual({
      index: 280,
      day: '2019-10-08',
      raidsHeight: 100,
      maxesHeight: 0,
      big: true,
    });
    expect(bars[0]).toMatchObject({ index: 0, raidsHeight: 24, big: false });
  });

  it('stacks the max battles on the raids where the year has them', () => {
    const bars = dayBars(
      year({
        maxes: true,
        days: [
          { day: '2024-06-01', raids: 10, maxes: 30 },
          { day: '2024-06-02', raids: 20, maxes: 0 },
        ],
        big: [],
      }),
      80,
    );
    expect(bars.map((bar) => [bar.raidsHeight, bar.maxesHeight])).toEqual([
      [20, 60],
      [40, 0],
    ]);
  });

  it('labels one day of a run, in two rows, skipping one that would cover the last of its row (B1)', () => {
    const view = year({
      big: [
        bigOn('2019-03-01', { labeled: false, top: false }),
        bigOn('2019-10-08'),
        bigOn('2019-10-10', { top: false }),
        bigOn('2019-10-20', { top: false }),
        bigOn('2019-11-20', { top: false }),
      ],
    });
    // A day a pixel: "Oct 8" is 5 characters, 32.5 pixels.
    expect(bigLabels(view, 365, false)).toEqual([
      { day: '2019-10-08', text: 'Oct 8', x: 280, row: 0 },
      { day: '2019-10-10', text: 'Oct 10', x: 282, row: 1 },
      // 2019-10-20 would cover "Oct 8" in the first row: left out, its bar still colored.
      { day: '2019-11-20', text: 'Nov 20', x: 323, row: 0 },
    ]);
    // A label at the year's end moves left to fit.
    expect(bigLabels(year({ big: [bigOn('2019-12-31')] }), 365, false)).toEqual([
      { day: '2019-12-31', text: 'Dec 31', x: 326, row: 0 },
    ]);
    // On a phone, only the year's top three.
    expect(bigLabels(view, 365, true).map((one) => one.day)).toEqual(['2019-10-08']);
  });

  it('says a big day on one line: its date, then what it was (B7)', () => {
    expect(bigDayLine(MEWTWO_DAY)).toBe('Tuesday, October 8, 2019 · Mewtwo day, 180 of 412 raids');
  });

  it('gives the months’ totals and the big days as a table, in the server’s words (B12)', () => {
    expect(daysTable(year())).toEqual({
      head: ['Month', 'Raids'],
      rows: [
        ['January', '100'],
        ['October', '412'],
        ['December', '50'],
        ['Big day: Tuesday, October 8, 2019', '412'],
      ],
    });
    expect(
      daysTable(year({ maxes: true, months: [{ month: 'June', raids: 10, maxes: 30 }], big: [] })),
    ).toEqual({ head: ['Month', 'Raids', 'Max battles'], rows: [['June', '10', '30']] });
    expect(daysTable(year({ monthWord: 'Mois', bigDayWord: 'Grand jour' }))).toMatchObject({
      head: ['Mois', 'Raids'],
      rows: expect.arrayContaining([['Grand jour: Tuesday, October 8, 2019', '412']]) as unknown,
    });
  });

  it('says why the page cannot be shown once, in the days, and hides the others (B9)', () => {
    expect(sectionFailure(401, 'discord', true)).toEqual({
      text: "Log in with Discord to see this server's history.",
      login: true,
    });
    // The big days of every year and a boss's trend: hidden, the days have said it.
    expect(sectionFailure(401, 'discord', false)).toBeNull();
    expect(sectionFailure(403, 'links', false)).toBeNull();
    // What may pass says itself in each.
    expect(sectionFailure(503, 'discord', false)?.text).toBe(
      'Discord cannot be reached just now. Try again in a moment.',
    );
    expect(sectionFailure(undefined, 'discord', false)?.text).toBe(
      'This could not be loaded. Try again in a moment.',
    );
  });
});

describe('a boss’s trend on the history page', () => {
  const bosses = [
    { key: 'giratina_altered', name: 'Giratina (Altered Forme)', raids: 3000 },
    { key: 'mewtwo', name: 'Mewtwo', raids: 9000 },
  ];

  it('finds the boss a member typed or picked, by its name in any case', () => {
    expect(bossOfText(bosses, 'Mewtwo')).toBe('mewtwo');
    expect(bossOfText(bosses, ' mewtwo ')).toBe('mewtwo');
    expect(bossOfText(bosses, 'giratina (altered forme)')).toBe('giratina_altered');
    expect(bossOfText(bosses, 'Mew')).toBeUndefined();
  });

  const trend: BossTrendView = {
    key: 'mewtwo',
    name: 'Mewtwo',
    title: 'Mewtwo raids by month',
    summary: 'Mewtwo raids by month: 450 in all.',
    monthWord: 'Month',
    raidsWord: 'Raids',
    months: [
      { month: '2018-11', label: 'Nov 2018', raids: 300 },
      { month: '2018-12', label: 'Dec 2018', raids: 0 },
      { month: '2019-01', label: 'Jan 2019', raids: 150 },
    ],
    total: 450,
  };

  it('scales the months to the busiest, naming each January by its year', () => {
    expect(trendBars(trend, 60)).toEqual([
      // November: the next January is two months on, and is named instead (B14).
      { label: 'Nov 2018', raids: 300, height: 60, caption: null },
      { label: 'Dec 2018', raids: 0, height: 0, caption: null },
      { label: 'Jan 2019', raids: 150, height: 30, caption: '2019' },
    ]);
  });

  it('names the first month by its year where the next January is four months on or more (B14)', () => {
    const from = (month: string) =>
      trendBars({ ...trend, months: [{ month, label: month, raids: 1 }] }, 60)[0]?.caption;
    expect(from('2018-09')).toBe('2018');
    expect(from('2018-10')).toBeNull();
    expect(from('2018-01')).toBe('2018');
  });

  it('gives the months as a table, in the server’s words', () => {
    expect(trendTable({ ...trend, monthWord: 'Mois', raidsWord: 'Raids' })).toEqual({
      head: ['Mois', 'Raids'],
      rows: [
        ['Nov 2018', '300'],
        ['Dec 2018', '0'],
        ['Jan 2019', '150'],
      ],
    });
  });
});
