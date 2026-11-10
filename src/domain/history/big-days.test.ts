import { describe, expect, it } from 'vitest';
import {
  BIG_DAY_LEAST_RAIDS,
  bigDays,
  dayLabel,
  dayNumber,
  dayText,
  rankBigDays,
  runBests,
  seriesYears,
  topBigDays,
  yearBigDays,
  type BigDay,
  type DayBoss,
  type DayRaids,
} from './big-days.js';

/** `count` days from `first` on, each with the raids `raidsOf` gives its index (0 for none). */
function series(first: string, count: number, raidsOf: (index: number) => number): DayRaids[] {
  const start = dayNumber(first);
  return Array.from({ length: count }, (_, index) => ({
    day: dayText(start + index),
    raids: raidsOf(index),
  })).filter((one) => one.raids > 0);
}

/** One boss's raids on the days `raidsOf` gives (0 for none), from `first` on. */
function bossDays(
  boss: string,
  first: string,
  count: number,
  raidsOf: (index: number) => number,
): DayBoss[] {
  return series(first, count, raidsOf).map((one) => ({ day: one.day, boss, raids: one.raids }));
}

/** The day totals of some bosses' days. */
function totalsOf(...bosses: ReadonlyArray<readonly DayBoss[]>): DayRaids[] {
  const sums = new Map<string, number>();
  for (const one of bosses.flat()) sums.set(one.day, (sums.get(one.day) ?? 0) + one.raids);
  return [...sums].map(([day, raids]) => ({ day, raids }));
}

/** An even stretch: 40 raids a day, a little up and down. */
const even = (index: number): number => 40 + ((index * 7) % 5) - 2;

const days = (found: readonly BigDay[]): string[] => found.map((one) => one.day);

describe('big days by their raids', () => {
  it('finds the one spike of an even month, and nothing else', () => {
    const month = series('2019-10-01', 31, (index) => (index === 7 ? 180 : even(index)));
    const found = bigDays(month, [], '2019-11-15');
    expect(days(found)).toEqual(['2019-10-08']);
    expect(found[0]).toMatchObject({ raids: 180, usual: 40, label: undefined });
  });

  it('wants a spike far above the days around it, twice their middle and twenty raids', () => {
    // Far above a quiet stretch, but under twenty raids: not big.
    const quiet = series('2023-01-01', 40, (index) => (index === 20 ? BIG_DAY_LEAST_RAIDS - 1 : 1));
    expect(bigDays(quiet, [], '2023-12-31')).toEqual([]);
    const twenty = series('2023-01-01', 40, (index) => (index === 20 ? BIG_DAY_LEAST_RAIDS : 1));
    expect(days(bigDays(twenty, [], '2023-12-31'))).toEqual(['2023-01-21']);
    // Above a busy stretch, but not twice it: not big.
    const busy = series('2019-01-01', 40, (index) => (index === 20 ? 79 : even(index)));
    expect(bigDays(busy, [], '2019-12-31')).toEqual([]);
    const twice = series('2019-01-01', 40, (index) => (index === 20 ? 84 : even(index)));
    expect(days(bigDays(twice, [], '2019-12-31'))).toEqual(['2019-01-21']);
  });

  it('scores a day by its raids over the usual, in the usual’s square root (R2)', () => {
    // 180 raids on days of 40: 140 over √40.
    const month = series('2019-10-01', 31, (index) => (index === 7 ? 180 : even(index)));
    expect(bigDays(month, [], '2019-11-15')[0]?.score).toBe(22.14);
  });

  it('judges a day only with fourteen days of its window, not counting days before the first', () => {
    // The server's first days: a spike on its very first day has only the days after it.
    const opening = series('2018-01-03', 40, (index) => (index === 0 ? 200 : even(index)));
    expect(days(bigDays(opening, [], '2018-12-31'))).toEqual(['2018-01-03']);
    // Days before the first are no zeros: a server that starts busy has no big first day.
    const busyStart = series('2018-01-03', 40, even);
    expect(bigDays(busyStart, [], '2018-12-31')).toEqual([]);
    // With fewer than fourteen days in its window a day is not judged at all.
    const short = series('2018-01-03', 10, (index) => (index === 5 ? 200 : even(index)));
    expect(bigDays(short, [], '2018-01-13')).toEqual([]);
  });

  it('judges the day fourteen days after the first against all fourteen days before it', () => {
    // Day 14's window reaches back to the first day exactly; a spike there is judged.
    const opening = series('2018-01-03', 29, (index) => (index === 14 ? 200 : even(index)));
    expect(days(bigDays(opening, [], '2018-01-31'))).toEqual(['2018-01-17']);
    // On the first day's own raids too: the first day is in that window, not left out.
    const withFirst = series('2018-01-03', 29, (index) =>
      index === 0 ? 400 : index === 14 ? 200 : even(index),
    );
    expect(
      bigDays(withFirst, [], '2018-01-31').find((one) => one.day === '2018-01-17'),
    ).toBeDefined();
  });

  it('never judges today, and judges yesterday with the days before it alone', () => {
    const month = series('2026-10-01', 37, (index) => (index >= 35 ? 300 : even(index)));
    // 2026-11-06 is today: not judged; yesterday has no days after it, and is judged.
    expect(days(bigDays(month, [], '2026-11-06'))).toEqual(['2026-11-05']);
    // A day after today (a bad time) is in no window either.
    expect(days(bigDays([...month, { day: '2026-11-20', raids: 999 }], [], '2026-11-06'))).toEqual([
      '2026-11-05',
    ]);
  });

  it('keeps both of two big days in a row, a weekend event', () => {
    const weekend = series('2019-03-01', 40, (index) =>
      index === 15 ? 400 : index === 16 ? 380 : even(index),
    );
    expect(days(bigDays(weekend, [], '2019-12-31'))).toEqual(['2019-03-16', '2019-03-17']);
  });

  it('takes a day without raids on a busy stretch as not known, not as a quiet day', () => {
    // The bot down for two days of a busy month: they do not lower the window.
    const down = series('2019-06-01', 40, (index) =>
      index === 10 || index === 11 ? 0 : index === 20 ? 84 : even(index),
    );
    const found = bigDays(down, [], '2019-12-31');
    expect(days(found)).toEqual(['2019-06-21']);
    expect(found[0]?.usual).toBe(40);
    // On a quiet server a day without raids is a quiet day, and counts as 0.
    const quiet = series('2023-06-01', 40, (index) =>
      index % 2 === 0 ? 0 : index === 21 ? 30 : 2,
    );
    expect(bigDays(quiet, [], '2023-12-31').find((one) => one.day === '2023-06-22')?.usual).toBe(1);
  });

  it('counts the days a change of the clocks makes as the calendar days they are', () => {
    // 2019-03-10 (23 hours) and 2019-11-03 (25 hours) in New York: one day each.
    const spring = series('2019-02-20', 40, (index) => (index === 18 ? 200 : even(index)));
    expect(days(bigDays(spring, [], '2019-12-31'))).toEqual(['2019-03-10']);
    const fall = series('2019-10-15', 40, (index) => (index === 19 ? 200 : even(index)));
    expect(days(bigDays(fall, [], '2019-12-31'))).toEqual(['2019-11-03']);
    expect(dayNumber('2019-11-04') - dayNumber('2019-11-03')).toBe(1);
  });

  it('sums a day given twice (regions apart) and takes the days in any order', () => {
    const month = series('2019-10-01', 31, (index) => (index === 7 ? 90 : even(index)));
    const split = [...month, { day: '2019-10-08', raids: 90 }].reverse();
    expect(bigDays(split, [], '2019-11-15')).toMatchObject([{ day: '2019-10-08', raids: 180 }]);
  });

  it('names a day by its top known boss where it has a quarter of the day’s raids', () => {
    // Mewtwo in the raids all month, 20 a day: 55 on the big day is not its own day (under 60).
    const eggs = bossDays('', '2019-10-01', 31, (index) => (index === 7 ? 0 : even(index) - 20));
    const mewtwo = bossDays('MEWTWO', '2019-10-01', 31, (index) => (index === 7 ? 0 : 20));
    const spike = [
      { day: '2019-10-08', boss: 'MEWTWO', raids: 55 },
      { day: '2019-10-08', boss: 'GIRATINA_ALTERED', raids: 5 },
      { day: '2019-10-08', boss: '', raids: 140 },
    ];
    const month = [...eggs, ...mewtwo];
    const [named] = bigDays(totalsOf(month, spike), [...month, ...spike], '2019-11-15');
    expect(named).toMatchObject({ day: '2019-10-08', raids: 200 });
    expect(named?.label).toEqual({ boss: 'MEWTWO', raids: 55 });
    // Under a quarter: the day is named by its raids alone.
    const lesser = spike.map((one) => (one.boss === '' ? { ...one, raids: 161 } : one));
    const unnamed = bigDays(totalsOf(month, lesser), [...month, ...lesser], '2019-11-15');
    expect(unnamed).toMatchObject([{ day: '2019-10-08', raids: 221, label: undefined }]);
  });
});

describe('big days by a boss', () => {
  /** An even stretch of other bosses' raids, with `boss`'s raids of `raidsOf` on top. */
  function withBoss(boss: string, raidsOf: (index: number) => number, busy = 100) {
    const others = bossDays('', '2019-09-01', 41, () => busy);
    const its = bossDays(boss, '2019-09-01', 41, raidsOf);
    return { totals: totalsOf(others, its), bosses: [...others, ...its] };
  }

  it('finds a boss’s own day that the day’s raids alone would not show', () => {
    // 140 raids on days of 100: not twice them; but 40 of one boss never there otherwise.
    const { totals, bosses } = withBoss('MEWTWO', (index) => (index === 20 ? 40 : 0));
    const found = bigDays(totals, bosses, '2019-12-31');
    expect(found).toMatchObject([{ day: '2019-09-21', raids: 140 }]);
    expect(found[0]?.label).toEqual({ boss: 'MEWTWO', raids: 40 });
    // The same raids by eggs or a boss known only by name show nothing.
    const eggs = withBoss('', (index) => (index === 20 ? 40 : 0));
    expect(bigDays(eggs.totals, eggs.bosses, '2019-12-31')).toEqual([]);
  });

  /** Days of `busy` raids of other bosses, `others` of them on the 21st with `its` of `boss`. */
  function oneDay(boss: string, its: number, others: number, busy: number) {
    const rest = bossDays('', '2019-09-01', 41, (index) => (index === 20 ? others : busy));
    const day = [{ day: '2019-09-21', boss, raids: its }];
    return { totals: totalsOf(rest, day), bosses: [...rest, ...day] };
  }

  it('wants the boss a quarter of its day’s raids, and the day as many as usual (R1)', () => {
    // An EX wave: 20 of a boss raided nowhere else, on a day of 250 raids among days of 300.
    const ex = oneDay('DEOXYS', 20, 230, 300);
    expect(bigDays(ex.totals, ex.bosses, '2019-12-31')).toEqual([]);
    // A new boss on a quiet day: 30 of 90 raids, among days of 100.
    const quiet = oneDay('MEWTWO', 30, 60, 100);
    expect(bigDays(quiet.totals, quiet.bosses, '2019-12-31')).toEqual([]);
    // As many raids as usual, a quarter of them the boss's: its day.
    const usual = oneDay('MEWTWO', 25, 75, 100);
    expect(days(bigDays(usual.totals, usual.bosses, '2019-12-31'))).toEqual(['2019-09-21']);
  });

  it('wants three times the boss’s middle of the days around, at least five, and twenty raids', () => {
    const steady = (spike: number) => (index: number) => (index === 20 ? spike : 10);
    // A boss of ten raids a day among 50 others: 29 is not three times it, 30 is.
    const under = withBoss('LUGIA', steady(29), 50);
    expect(bigDays(under.totals, under.bosses, '2019-12-31')).toEqual([]);
    const thrice = withBoss('LUGIA', steady(30), 50);
    expect(days(bigDays(thrice.totals, thrice.bosses, '2019-12-31'))).toEqual(['2019-09-21']);
    // A boss seldom there: its middle counts as five, and the day needs twenty of it.
    const rare = (spike: number) => (index: number) => (index === 20 ? spike : index % 2);
    const nineteen = withBoss('LUGIA', rare(19), 50);
    expect(bigDays(nineteen.totals, nineteen.bosses, '2019-12-31')).toEqual([]);
    const twenty = withBoss('LUGIA', rare(20), 50);
    expect(days(bigDays(twenty.totals, twenty.bosses, '2019-12-31'))).toEqual(['2019-09-21']);
  });

  it('scores a boss’s day by its raids over its middle, in the usual’s root, and a day by its stronger signal (R2)', () => {
    // 60 of a boss never there, on days of 100 raids: 60 over √100.
    const { totals, bosses } = withBoss('MEWTWO', (index) => (index === 20 ? 60 : 0));
    expect(bigDays(totals, bosses, '2019-12-31')[0]?.score).toBe(6);
    // 180 raids on days of 40, 50 of them a boss never there: the day's raids score 140 over
    // √40, the boss 50 over √40; the day takes the raids' score, and the boss's name.
    const month = bossDays('', '2019-10-01', 31, (index) => (index === 7 ? 130 : even(index)));
    const its = [{ day: '2019-10-08', boss: 'DEOXYS', raids: 50 }];
    const [both] = bigDays(totalsOf(month, its), [...month, ...its], '2019-11-15');
    expect(both).toMatchObject({ score: 22.14, label: { boss: 'DEOXYS', raids: 50 } });
  });

  it('names a day by the boss with the strongest signal of several', () => {
    const others = bossDays('', '2019-09-01', 41, () => 100);
    const two = [
      { day: '2019-09-21', boss: 'ZAPDOS', raids: 40 },
      { day: '2019-09-21', boss: 'MOLTRES', raids: 60 },
    ];
    const [day] = bigDays(totalsOf(others, two), [...others, ...two], '2019-12-31');
    expect(day?.label).toEqual({ boss: 'MOLTRES', raids: 60 });
  });

  it('takes no day of a boss’s week in the raids for its day: only a day above its own days', () => {
    // A legendary in the raids for a week, as they came and went most weeks of 2019 to 2021:
    // the days it was there are its middle, so none of them stands out.
    const week = (index: number) => index >= 14 && index < 21;
    const others = bossDays('', '2019-09-01', 41, (index) => (week(index) ? 40 : 100));
    const its = bossDays('LUGIA', '2019-09-01', 41, (index) => (week(index) ? 60 : 0));
    expect(bigDays(totalsOf(others, its), [...others, ...its], '2019-12-31')).toEqual([]);
    // Its raid day in that week, three times its other days (and the day's raids not twice the
    // usual), does.
    const raidDay = (index: number) => index === 17;
    const rest = bossDays('', '2019-09-01', 41, (index) =>
      raidDay(index) ? 0 : week(index) ? 40 : 100,
    );
    const day = bossDays('LUGIA', '2019-09-01', 41, (index) =>
      raidDay(index) ? 180 : week(index) ? 60 : 0,
    );
    expect(days(bigDays(totalsOf(rest, day), [...rest, ...day], '2019-12-31'))).toEqual([
      '2019-09-18',
    ]);
  });
});

describe('a year’s big days', () => {
  const big = (day: string, raids: number, score: number): BigDay => ({
    day,
    raids,
    usual: 40,
    score,
    label: undefined,
  });

  it('ranks them by score, then raids, then the earlier day', () => {
    const ranked = rankBigDays([
      big('2019-05-01', 100, 4),
      big('2019-03-01', 100, 9),
      big('2019-04-01', 120, 4),
      big('2019-02-01', 100, 4),
    ]);
    expect(days(ranked)).toEqual(['2019-03-01', '2019-04-01', '2019-02-01', '2019-05-01']);
  });

  it('keeps a calendar year’s alone', () => {
    const all = [big('2018-12-31', 100, 5), big('2019-01-01', 100, 4), big('2019-06-01', 90, 8)];
    expect(days(yearBigDays(all, 2019))).toEqual(['2019-06-01', '2019-01-01']);
    expect(days(yearBigDays(all, 2020))).toEqual([]);
  });

  it('takes at most one of a run of big days in a row into a year’s top, the higher ranked', () => {
    const all = [
      big('2019-03-16', 460, 8.4),
      big('2019-03-17', 410, 6),
      big('2019-11-02', 170, 8),
      big('2019-02-23', 390, 4.4),
      big('2019-02-24', 360, 4.5),
      big('2019-12-28', 290, 4),
    ];
    expect(days(topBigDays(all, 2019, 3))).toEqual(['2019-03-16', '2019-11-02', '2019-02-24']);
    expect(days(topBigDays(all, 2019, 10))).toEqual([
      '2019-03-16',
      '2019-11-02',
      '2019-02-24',
      '2019-12-28',
    ]);
    expect(topBigDays(all, 2019, 0)).toEqual([]);
  });

  it('ranks a run across the year’s end whole: its best day counts for its own year alone', () => {
    // The run's best is 2018's last day: 2019 keeps nothing of it, 2018 keeps that day.
    const all = [big('2018-12-31', 300, 9), big('2019-01-01', 200, 5), big('2019-05-05', 90, 4)];
    expect(days(topBigDays(all, 2019, 3))).toEqual(['2019-05-05']);
    expect(days(topBigDays(all, 2018, 3))).toEqual(['2018-12-31']);
    // Its best in the new year: that year has it, the old one none of the run.
    const later = [big('2018-12-31', 200, 5), big('2019-01-01', 300, 9)];
    expect(days(topBigDays(later, 2019, 3))).toEqual(['2019-01-01']);
    expect(topBigDays(later, 2018, 3)).toEqual([]);
  });

  it('gives the best day of each run of days in a row', () => {
    const all = [big('2019-03-16', 460, 8.4), big('2019-03-17', 410, 9), big('2019-11-02', 170, 8)];
    expect(days(runBests(all))).toEqual(['2019-03-17', '2019-11-02']);
  });

  it('says the years of a series, newest first', () => {
    expect(
      seriesYears([
        { day: '2019-01-01', raids: 1 },
        { day: '2024-03-01', raids: 1 },
        { day: '2019-05-01', raids: 1 },
      ]),
    ).toEqual([2024, 2019]);
  });
});

describe('the label of a day', () => {
  it('is its top known boss by raids, where it has a quarter of the day’s raids', () => {
    const bosses = [
      { day: '2019-10-08', boss: 'MEWTWO', raids: 100 },
      { day: '2019-10-08', boss: 'GIRATINA_ALTERED', raids: 80 },
      { day: '2019-10-08', boss: '', raids: 220 },
      { day: '2019-10-09', boss: 'LUGIA', raids: 500 },
    ];
    // Eggs and bosses known by name only never win (G1).
    expect(dayLabel(bosses, '2019-10-08', 400)).toEqual({ boss: 'MEWTWO', raids: 100 });
    expect(dayLabel(bosses, '2019-10-08', 401)).toBeUndefined();
    expect(dayLabel(bosses, '2019-10-07', 100)).toBeUndefined();
  });

  it('sums a boss over the day’s regions, and breaks a tie by the key', () => {
    const bosses = [
      { day: '2019-10-08', boss: 'MEWTWO', raids: 30 },
      { day: '2019-10-08', boss: 'MEWTWO', raids: 30 },
      { day: '2019-10-08', boss: 'DEOXYS', raids: 60 },
    ];
    expect(dayLabel(bosses, '2019-10-08', 120)).toEqual({ boss: 'DEOXYS', raids: 60 });
  });
});
