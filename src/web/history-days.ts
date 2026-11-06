import type { DayTotal } from '../db/repositories/activity-repository.js';
import { runBests } from '../domain/history/big-days.js';
import type {
  BigDayView,
  BigDaysView,
  BossListView,
  BossTrendView,
  HistoryDaysView,
} from '../domain/web/history-days-data.js';
import { bigDayLabel, dayDateWords, dayShortWords } from '../render/big-days.js';
import type { NamedBigDay } from '../services/history-days.js';

/*
 * The views of the history page's raids by day, big days and a boss's trend (plan 8H-8): the
 * numbers `HistoryDays` computed, in the server's words. Pure.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));

/** Whether a calendar year has a February 29. */
function leap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * A big day as the page lists it: `labeled` where the chart labels it, `top` where it is one of
 * its year's top three (both true of every year's top three, B1).
 */
export function bigDayView(
  day: NamedBigDay,
  marks: { labeled: boolean; top: boolean } = { labeled: true, top: true },
): BigDayView {
  return {
    day: day.day,
    date: dayDateWords(day.day),
    short: dayShortWords(day.day),
    raids: day.raids,
    label: bigDayLabel(day.boss, day.raids),
    ...marks,
  };
}

/** What a big day is, in plain words, both signals (B5). */
export const BIG_DAY_NOTE =
  'A big day had far more raids than the weeks around it, or far more of one boss.';

/**
 * A year of the chart: its days, month totals, big days and the words around them. The big days
 * by date (B6), each run of days in a row labeled once on the chart, its best (`runBests` over the
 * year's), and the year's top three marked (`HistoryDays.year`'s `top`).
 */
export function historyDaysView(
  year: number,
  read: { years: number[]; days: DayTotal[]; big: NamedBigDay[]; top: NamedBigDay[] },
): HistoryDaysView {
  const labeled = new Set(runBests(read.big).map((one) => one.day));
  const top = new Set(read.top.map((one) => one.day));
  const months = MONTHS.map((month) => ({ month, raids: 0, maxes: 0 }));
  for (const one of read.days) {
    const month = months[Number(one.day.slice(5, 7)) - 1];
    if (month === undefined) continue;
    month.raids += one.raids;
    month.maxes += one.maxes;
  }
  return {
    year,
    years: read.years,
    title: `Raids by day, ${String(year)}`,
    days: read.days.map((one) => ({ day: one.day, raids: one.raids, maxes: one.maxes })),
    length: leap(year) ? 366 : 365,
    maxes: read.days.some((one) => one.maxes > 0),
    months,
    bigTitle: `Big days of ${String(year)}`,
    big: [...read.big]
      .sort((a, b) => (a.day < b.day ? -1 : 1))
      .map((one) => bigDayView(one, { labeled: labeled.has(one.day), top: top.has(one.day) })),
    noBig: `No big days in ${String(year)}.`,
    bigNote: BIG_DAY_NOTE,
    monthWord: 'Month',
    bigDayWord: 'Big day',
    raidsWord: 'Raids',
    maxesWord: 'Max battles',
  };
}

/** The top three of every year, newest first. */
export function bigDaysView(
  every: ReadonlyArray<{ year: number; days: NamedBigDay[] }>,
): BigDaysView {
  return {
    title: 'Big days of every year',
    years: every.map((one) => ({ year: one.year, days: one.days.map((day) => bigDayView(day)) })),
    none: 'No big days yet.',
  };
}

/** A boss's raids by month, labeled "Nov 2018". */
export function bossTrendView(trend: {
  key: string;
  name: string;
  months: Array<{ month: string; raids: number }>;
}): BossTrendView {
  const title = `${trend.name} raids by month`;
  const total = trend.months.reduce((sum, one) => sum + one.raids, 0);
  return {
    key: trend.key,
    name: trend.name,
    title,
    summary: `${title}: ${total.toLocaleString('en-US')} in all.`,
    monthWord: 'Month',
    raidsWord: 'Raids',
    months: trend.months.map((one) => ({
      month: one.month,
      label: `${SHORT_MONTHS[Number(one.month.slice(5, 7)) - 1] ?? ''} ${one.month.slice(0, 4)}`,
      raids: one.raids,
    })),
    total,
  };
}

/** The bosses of the server's raids, and the page's words around the list (B12). */
export function bossListView(bosses: BossListView['bosses']): BossListView {
  return {
    bosses,
    none: 'No raids with a known boss yet.',
    pick: 'Pick a boss from the list.',
  };
}
