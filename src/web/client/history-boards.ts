import {
  anonymousNote,
  bossesWords,
  confirmationsNote,
  MEMBER_STAT_LABELS,
  membersWords,
} from '../../domain/history/member-stats-words.js';
import type { TallyPeriod } from '../../domain/history/tally-periods.js';
import type { BoardView, MemberCardView } from '../../domain/web/board-data.js';

/*
 * The boards on the history page and the "Your Pine" page (plan 8H-6), their pure part: where
 * they are asked for, a board's lines, the member's numbers as `/stats me` words them, and the
 * bars of the months. The numbers and the boards' words are the server's.
 */

/** The route of a server's boards for a period. */
export function boardsAddress(guild: string, period: TallyPeriod): string {
  return `/s/${guild}/api/stats/boards?period=${period}`;
}

/** The route of the member's own numbers, of a year or all time (null). */
export function meAddress(guild: string, year: number | null): string {
  return `/s/${guild}/api/stats/me${year === null ? '' : `?year=${String(year)}`}`;
}

/** The "Your Pine" page of a server. */
export function meHref(guild: string): string {
  return `/s/${guild}/me`;
}

/** The year the page's address names (`?year=`, kept as the member chooses), else all time. */
export function yearOfAddress(search: string): number | null {
  const asked = new URLSearchParams(search).get('year') ?? '';
  return /^\d{4}$/u.test(asked) ? Number(asked) : null;
}

/** A board as its lines ("1. Bob: 2 raids"), or what it says where it has none. */
export function boardLines(view: BoardView): string[] {
  if (view.rows.length === 0) return view.empty === null ? [] : [view.empty];
  return view.rows.map((row) => `${String(row.rank)}. ${row.name}: ${row.count}`);
}

/** A number of "Your Pine", named. */
export interface StatLine {
  label: string;
  value: string;
}

const n = (count: number): string => count.toLocaleString('en-US');

/** The member's numbers as `/stats me` words them (`MEMBER_STAT_LABELS`), its lines in order. */
export function meLines(view: MemberCardView): StatLine[] {
  const L = MEMBER_STAT_LABELS;
  return [
    { label: L.raids, value: n(view.raids.count) + anonymousNote(view.raids.anonymous) },
    { label: L.trains, value: n(view.trains.count) + anonymousNote(view.trains.anonymous) },
    { label: L.meetups, value: n(view.meetups.count) + anonymousNote(view.meetups.anonymous) },
    {
      label: L.reports,
      value: n(view.reports.count) + confirmationsNote(view.reports.confirmations),
    },
    { label: L.completed, value: n(view.completed) },
    { label: L.trainsCame, value: n(view.trainsCame) },
    { label: L.meetupsCame, value: n(view.meetupsCame) },
    ...(view.busiestRegion === null ? [] : [{ label: L.region, value: view.busiestRegion }]),
    ...(view.bosses.length === 0 ? [] : [{ label: L.bosses, value: bossesWords(view.bosses) }]),
    { label: L.sent, value: membersWords(view.sent) },
  ];
}

/** A month's bar of the chart: its counts and their heights, in the chart's units. */
export interface MonthBar {
  month: string;
  /** "Nov 2025". */
  label: string;
  came: number;
  reports: number;
  cameHeight: number;
  reportsHeight: number;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** "Jan" for 1. */
function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? '';
}

/**
 * What the chart writes under a bar: with a year's worth of bars or fewer, every month's short
 * name ("Oct"); with more, the year under each January and under the first bar ("2026").
 */
export function barCaption(bars: readonly MonthBar[], index: number): string | null {
  const bar = bars[index];
  if (bar === undefined) return null;
  if (bars.length <= 12) return monthName(Number(bar.month.slice(5, 7)));
  return bar.month.endsWith('-01') || index === 0 ? bar.month.slice(0, 4) : null;
}

/**
 * The bars of the chart, one per month from the first to the last the server gave (the months
 * between with none), what the member came to and their reports that counted, scaled so that
 * the busiest month's taller bar is `height`. With `year`, the bars are that year's twelve
 * months, January to December, whatever the server gave (staging of 8H-6: a year of two
 * months drew two unnamed bars).
 */
export function monthBars(
  months: readonly { month: string; came: number; reports: number }[],
  height: number,
  year: number | null = null,
): MonthBar[] {
  const first = year === null ? months[0]?.month : `${String(year).padStart(4, '0')}-01`;
  const last = year === null ? months.at(-1)?.month : `${String(year).padStart(4, '0')}-12`;
  if (first === undefined || last === undefined || months.length === 0) return [];
  const byMonth = new Map(months.map((one) => [one.month, one]));
  const most = Math.max(1, ...months.map((one) => Math.max(one.came, one.reports)));
  const scale = (count: number) => Math.round((count / most) * height);
  const bars: MonthBar[] = [];
  let [shownYear, month] = first.split('-').map(Number) as [number, number];
  for (let key = first; key <= last;) {
    const one = byMonth.get(key) ?? { came: 0, reports: 0 };
    bars.push({
      month: key,
      label: `${monthName(month)} ${String(shownYear)}`,
      came: one.came,
      reports: one.reports,
      cameHeight: scale(one.came),
      reportsHeight: scale(one.reports),
    });
    month += 1;
    if (month > 12) {
      month = 1;
      shownYear += 1;
    }
    key = `${String(shownYear).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  }
  return bars;
}

/**
 * The chart's bars as a table (B1): the chart is drawn for the eye only (`aria-hidden`), and a
 * screen reader reads its numbers here.
 */
export function monthTable(bars: readonly MonthBar[]): { head: string[]; rows: string[][] } {
  return {
    head: ['Month', 'What you came to', 'Reports at stops that counted'],
    rows: bars.map((bar) => [bar.label, n(bar.came), n(bar.reports)]),
  };
}
