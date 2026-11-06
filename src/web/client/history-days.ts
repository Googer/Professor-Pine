import type {
  BigDayView,
  BossListView,
  BossTrendView,
  HistoryDaysView,
} from '../../domain/web/history-days-data.js';
import { HISTORY_FIRST_YEAR } from '../../domain/web/history-days-data.js';
import { yearOfAddress } from './history-boards.js';
import { tallyFailure } from './history-tally.js';

/*
 * Raids by day, big days and a boss's trend on the history page (plan 8H-8), their pure part:
 * where each is asked for, the bars a chart is drawn with, and the tables a screen reader reads in
 * place of a chart. The numbers and every word are the server's (`/api/history/…`); the page only
 * places them. No Temporal here (the page's tsconfig has none): a day's place in its year is
 * counted on the calendar.
 */

/** The route of a year's days; the newest year the server has without one. */
export function daysAddress(guild: string, year: number | null): string {
  return `/s/${guild}/api/history/days${year === null ? '' : `?year=${String(year)}`}`;
}

/**
 * The year of raids by day the page's address names (`?year=`); none (the newest the server has)
 * for one before the game's first year, which the route refuses (review W5).
 */
export function daysYearOfAddress(search: string): number | null {
  const year = yearOfAddress(search);
  return year !== null && year >= HISTORY_FIRST_YEAR ? year : null;
}

/** The page's address without its year (`?year=`), what else it says kept. */
export function addressWithoutYear(pathname: string, search: string): string {
  const query = new URLSearchParams(search);
  query.delete('year');
  const rest = query.toString();
  return rest === '' ? pathname : `${pathname}?${rest}`;
}

/** The route of every year's big days. */
export function bigDaysAddress(guild: string): string {
  return `/s/${guild}/api/history/big-days`;
}

/** The route of the bosses the server's history holds. */
export function bossesAddress(guild: string): string {
  return `/s/${guild}/api/history/bosses`;
}

/** The route of one boss's months. */
export function bossAddress(guild: string, key: string): string {
  return `/s/${guild}/api/history/bosses/${encodeURIComponent(key)}`;
}

const DAY_MS = 86_400_000;
const n = (count: number): string => count.toLocaleString('en-US');

/** A `yyyy-mm-dd` day's place in its year: 0 for January 1st, 365 for a leap year's last. */
export function dayIndex(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return (
    (Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1) - Date.UTC(year ?? 1970, 0, 1)) / DAY_MS
  );
}

/** A day's bar: its place in the year, its raids and max battles stacked, and whether it is big. */
export interface DayBar {
  index: number;
  day: string;
  raidsHeight: number;
  maxesHeight: number;
  /** A big day's bar is colored as one, labeled or not (`bigLabels`). */
  big: boolean;
}

/**
 * The bars of a year's chart, one per day the server gave (a day without raids or max battles
 * has none), scaled so that the busiest day's raids and max battles together are `height`; the
 * max battles drawn on top of the raids only in a year that had any (G12).
 */
export function dayBars(view: HistoryDaysView, height: number): DayBar[] {
  const most = Math.max(1, ...view.days.map((one) => one.raids + (view.maxes ? one.maxes : 0)));
  const scale = (count: number) => Math.round((count / most) * height);
  const big = new Set(view.big.map((one) => one.day));
  return view.days.map((one) => ({
    index: dayIndex(one.day),
    day: one.day,
    raidsHeight: scale(one.raids),
    maxesHeight: view.maxes ? scale(one.maxes) : 0,
    big: big.has(one.day),
  }));
}

/** About how wide a character of the chart's labels is, at 11 pixels (B1). */
export const LABEL_CHAR_WIDTH = 6.5;

/** A big day's label on the chart: its text, where it begins and in which of the two rows. */
export interface BigLabel {
  day: string;
  text: string;
  x: number;
  row: 0 | 1;
}

/**
 * The labels of a year's chart `width` wide (B1): the big days the server marks `labeled` (one of
 * each run of days in a row), on a narrow chart only the year's top three, in date order and
 * the two rows in turn; a label that would cover the last one of its row is left out (its bar
 * stays colored), one at the year's end moved left to fit.
 */
export function bigLabels(view: HistoryDaysView, width: number, narrow: boolean): BigLabel[] {
  const step = width / view.length;
  const ends = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const labels: BigLabel[] = [];
  for (const one of [...view.big].sort((a, b) => (a.day < b.day ? -1 : 1))) {
    if (!one.labeled || (narrow && !one.top)) continue;
    const row = labels.length % 2 === 0 ? 0 : 1;
    const wide = one.short.length * LABEL_CHAR_WIDTH;
    const x = Math.max(0, Math.min(dayIndex(one.day) * step, width - wide));
    if (x < (ends[row] ?? 0)) continue;
    ends[row] = x + wide;
    labels.push({ day: one.day, text: one.short, x, row });
  }
  return labels;
}

/** A big day of the lists: "Tuesday, October 8, 2019 · Mewtwo day, 180 of 412 raids" (B7). */
export function bigDayLine(day: BigDayView): string {
  return `${day.date} · ${day.label}`;
}

/**
 * The year's chart as a table (G14): the months' totals, then the big days, each by its date; a
 * column of max battles only in a year that had any. Every word the server's (B12).
 */
export function daysTable(view: HistoryDaysView): { head: string[]; rows: string[][] } {
  const counts = (raids: number, maxes: number) => (view.maxes ? [n(raids), n(maxes)] : [n(raids)]);
  const bigMaxes = new Map(view.days.map((one) => [one.day, one.maxes]));
  return {
    head: [view.monthWord, view.raidsWord, ...(view.maxes ? [view.maxesWord] : [])],
    rows: [
      ...view.months.map((one) => [one.month, ...counts(one.raids, one.maxes)]),
      ...view.big.map((one) => [
        `${view.bigDayWord}: ${one.date}`,
        ...counts(one.raids, bigMaxes.get(one.day) ?? 0),
      ]),
    ],
  };
}

/**
 * What a section of raids by day says when it cannot be shown (B9): where the member is logged
 * out or no member (401, 403), the login or members-only line once, in the first section (the
 * days), the others hidden (null); anything else in each section, as the tally says it.
 */
export function sectionFailure(
  status: number | undefined,
  login: 'discord' | 'links',
  first: boolean,
): { text: string; login: boolean } | null {
  if (!first && (status === 401 || status === 403)) return null;
  return tallyFailure(status, login);
}

/** The key of the boss whose name a member typed or picked from the list, in any case. */
export function bossOfText(bosses: BossListView['bosses'], text: string): string | undefined {
  const asked = text.trim().toLocaleLowerCase('en-US');
  return bosses.find((one) => one.name.toLocaleLowerCase('en-US') === asked)?.key;
}

/** A month's bar of a boss's trend, and its year under it where a year begins. */
export interface TrendBar {
  label: string;
  raids: number;
  height: number;
  /**
   * The year under each January, and under the first month where the next January is four
   * months on or more (B14: else the two would cover each other); null under the others.
   */
  caption: string | null;
}

/** The first month a year's caption may sit under: from October the next January is too near. */
const LAST_CAPTIONED_FIRST_MONTH = 9;

/** The bars of a boss's months, scaled so that its busiest month is `height`. */
export function trendBars(view: BossTrendView, height: number): TrendBar[] {
  const most = Math.max(1, ...view.months.map((one) => one.raids));
  return view.months.map((one, index) => ({
    label: one.label,
    raids: one.raids,
    height: Math.round((one.raids / most) * height),
    caption:
      one.month.endsWith('-01') ||
      (index === 0 && Number(one.month.slice(5, 7)) <= LAST_CAPTIONED_FIRST_MONTH)
        ? one.month.slice(0, 4)
        : null,
  }));
}

/** A boss's months as a table, for whoever cannot see the chart, in the server's words. */
export function trendTable(view: BossTrendView): { head: string[]; rows: string[][] } {
  return {
    head: [view.monthWord, view.raidsWord],
    rows: view.months.map((one) => [one.label, n(one.raids)]),
  };
}
