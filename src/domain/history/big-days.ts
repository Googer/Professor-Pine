/*
 * Big days (plan 8H-8; design `2026-11-04-history-on-show-design.md`, Part G, review H23): a
 * server's standout local days, by raids far above the days around them, or by far more of one
 * boss than the days around it had. One pure function with a fixed rule, so that the history page
 * and the events forum's "On this day" agree. Days are `yyyy-mm-dd` local dates (`dayOf`); their
 * arithmetic is the calendar's, with no clock and no Temporal (a day of a change of the clocks is
 * one day like any other).
 */

/** A server's raids on one local day (`ActivityDay` summed over the regions kept). */
export interface DayRaids {
  /** `yyyy-mm-dd`. */
  day: string;
  raids: number;
}

/** The raids of one boss on a day (`ActivityDay`'s rows of the day, summed over the regions). */
export interface DayBoss {
  day: string;
  /** A catalogue key; `NO_BOSS` (`''`) is no boss: it never makes a boss's day nor names one. */
  boss: string;
  raids: number;
}

/** A big day: its raids, how far it stood out, and the boss that names it. */
export interface BigDay {
  day: string;
  raids: number;
  /** The middle of the day totals of its window (their median), rounded to a tenth. */
  usual: number;
  /**
   * How far it stood out: its stronger signal's excess (its raids over the window's usual day, or
   * its boss's over the boss's middle) over the square root of the usual day, at least 1 (to a
   * hundredth; `bigDays`): what ranks the big days (`rankBigDays`).
   */
  score: number;
  /**
   * The boss that names the day: the boss whose own day it was (the boss rule, the strongest of
   * several), else its top known boss where it has `LABEL_SHARE` of the day's raids (`dayLabel`);
   * undefined for none.
   */
  label: { boss: string; raids: number } | undefined;
}

/** The days on each side of a day that it is judged against. */
export const BIG_DAY_WINDOW = 14;
/** The fewest days of its window a day is judged with. */
export const BIG_DAY_LEAST_DAYS = 14;
/** How far above its window a big day's raids stand, in the window's spread. */
export const BIG_DAY_SCORE = 3;
/** A big day by its raids has at least this many times the window's middle. */
export const BIG_DAY_FACTOR = 2;
/** The fewest raids of a big day, and of its boss on a boss's day. */
export const BIG_DAY_LEAST_RAIDS = 20;
/** A boss's day has this many times its middle over the days of its window it was raided… */
export const BOSS_DAY_FACTOR = 3;
/** …that middle taken as at least this many raids (a boss seldom or never there). */
export const BOSS_DAY_LEAST_USUAL = 5;
/**
 * A day without raids in a window whose other days average this many or more is not known (the
 * bot was down), not a quiet day: it is left out of the window (G2), of the boss's too.
 */
export const UNKNOWN_ZERO_AVERAGE = 20;

/** How many big days of a year the page shows of every year ("Big days of every year", G10). */
export const PAGE_TOP_DAYS = 3;

const DAY_MS = 86_400_000;
const DAY_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** A `yyyy-mm-dd` day as a number of days since 1970-01-01; NaN for what is no day. */
export function dayNumber(day: string): number {
  const match = DAY_TEXT.exec(day);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

/** The `yyyy-mm-dd` day of a number of days since 1970-01-01. */
export function dayText(number: number): string {
  return new Date(number * DAY_MS).toISOString().slice(0, 10);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * How the day totals of a window stand (G2/G20: H23's mean and standard deviation and this were
 * both run over Pittsburgh's legacy days; the median reads better, see `history.md`): the median,
 * and as the spread the median absolute deviation scaled to a standard deviation (× 1.4826), at
 * least the square root of the median (raids come as a Poisson count) and at least 1.
 */
function standing(window: readonly number[]): { usual: number; spread: number } {
  const middle = median(window);
  const deviation = median(window.map((n) => Math.abs(n - middle)));
  return { usual: middle, spread: Math.max(1.4826 * deviation, Math.sqrt(middle), 1) };
}

/**
 * The big days of a server's series (`series`: every day with raids, in any order, a day given
 * twice summed; a day between the first and the last without one is 0; `bosses`: the raids of
 * each boss on those days, `NO_BOSS` among them or not), in the order of the days.
 *
 * A day is judged against the `BIG_DAY_WINDOW` days on each side of it, itself left out; days
 * before the server's first day, and today and after (`today`, the local day now: not ended), are
 * not in its window, not zeros. A day without raids is left out of a window whose other days
 * average `UNKNOWN_ZERO_AVERAGE` or more (the bot was down). With fewer than `BIG_DAY_LEAST_DAYS`
 * days left the day is not judged. It is big where either signal holds:
 *
 * - **its raids:** `(raids − usual) / spread >= BIG_DAY_SCORE` (`standing`), `raids >=
 *   BIG_DAY_FACTOR × usual` and `raids >= BIG_DAY_LEAST_RAIDS`;
 * - **a boss's day** (the controller's ruling, round 1: a raid day of one boss that the day's
 *   raids alone miss, as the boss took the place of others): a known boss's raids that day
 *   `>= BOSS_DAY_FACTOR × max(its median over the days of the same window it was raided,
 *   BOSS_DAY_LEAST_USUAL)` and `>= BIG_DAY_LEAST_RAIDS`. Over the days it was raided, not the
 *   whole window: with its absent days as zeros every day of a legendary's week in the raids
 *   stood out (Pittsburgh's legacy days, round 1: 569 boss days, 202 of them in 2020); against
 *   its own days only a day far above them does. And the boss holds `LABEL_SHARE` of the day's
 *   raids at least, and the day has its usual raids at least (round 2, R1): an EX wave of 20
 *   among a day of 250, or a new boss on a quiet day, is no boss's day.
 *
 * Both signals are ranked by how significant their excess is (round 2, R2: raids come as a
 * Poisson count): its raids `(raids − usual) / √usual`, a boss's `(its raids − its middle) /
 * √usual`, the usual at least 1; a day's `score` is its stronger signal's. A share of the usual
 * day (round 1) put a quiet year's small days first (Hoopa's 16 of 30 raids before its 75 of
 * 108); a margin over each rule's own bounds put 45 Galarian Weezing before Rayquaza's raid day
 * of 808 raids (Pittsburgh, 2019). A boss's day is named by its boss (the strongest of several,
 * by the same scale), a day big by its raids alone by `dayLabel`. Today is never judged, and a day is judged with what days after it have passed: a
 * big day may show only the day after, and its score can change for two weeks.
 */
export function bigDays(
  series: readonly DayRaids[],
  bosses: readonly DayBoss[],
  today: string,
): BigDay[] {
  const end = dayNumber(today);
  const raids = new Map<number, number>();
  for (const { day, raids: count } of series) {
    const number = dayNumber(day);
    if (Number.isNaN(number) || number >= end || count <= 0) continue;
    raids.set(number, (raids.get(number) ?? 0) + count);
  }
  if (raids.size === 0) return [];
  // Each known boss's raids by day, and the bosses of each day.
  const byBoss = new Map<string, Map<number, number>>();
  for (const one of bosses) {
    const number = dayNumber(one.day);
    if (one.boss === '' || one.raids <= 0 || !raids.has(number)) continue;
    const days = byBoss.get(one.boss) ?? new Map<number, number>();
    days.set(number, (days.get(number) ?? 0) + one.raids);
    byBoss.set(one.boss, days);
  }
  const first = Math.min(...raids.keys());
  const big: BigDay[] = [];
  for (const [number, count] of [...raids].sort((a, b) => a[0] - b[0])) {
    if (count < BIG_DAY_LEAST_RAIDS) continue;
    const around: number[] = [];
    for (let other = number - BIG_DAY_WINDOW; other <= number + BIG_DAY_WINDOW; other++) {
      if (other === number || other < first || other >= end) continue;
      around.push(other);
    }
    const busy = around.filter((other) => raids.has(other));
    const known =
      busy.length > 0 &&
      busy.reduce((sum, other) => sum + (raids.get(other) ?? 0), 0) / busy.length >=
        UNKNOWN_ZERO_AVERAGE
        ? busy
        : around;
    if (known.length < BIG_DAY_LEAST_DAYS) continue;
    const { usual, spread } = standing(known.map((other) => raids.get(other) ?? 0));
    // How significant what a signal added is: its excess over the root of the usual day (raids
    // come as a Poisson count, R2; the usual at least one raid a day).
    const significance = (added: number): number => added / Math.sqrt(Math.max(usual, 1));
    const byRaids =
      (count - usual) / spread >= BIG_DAY_SCORE && count >= BIG_DAY_FACTOR * usual
        ? significance(count - usual)
        : undefined;
    let boss: { boss: string; raids: number; strength: number } | undefined;
    for (const [key, days] of byBoss) {
      const its = days.get(number) ?? 0;
      if (its < BIG_DAY_LEAST_RAIDS) continue;
      // Its middle over the days of the window it was in the raids (none: 0).
      const middle = median(known.flatMap((other) => days.get(other) ?? []));
      if (its < BOSS_DAY_FACTOR * Math.max(middle, BOSS_DAY_LEAST_USUAL)) continue;
      // The boss holds a quarter of its day, and the day had its usual raids at least (R1): an
      // EX wave among a busy day, or a new boss on a quiet one, is no boss's day.
      if (its < LABEL_SHARE * count || count < usual) continue;
      const strength = significance(its - middle);
      if (
        boss === undefined ||
        strength > boss.strength ||
        (strength === boss.strength &&
          (its > boss.raids || (its === boss.raids && key < boss.boss)))
      ) {
        boss = { boss: key, raids: its, strength };
      }
    }
    if (byRaids === undefined && boss === undefined) continue;
    const score = Math.max(byRaids ?? 0, boss?.strength ?? 0);
    const day = dayText(number);
    big.push({
      day,
      raids: count,
      usual: Math.round(usual * 10) / 10,
      score: Math.round(score * 100) / 100,
      label:
        boss === undefined ? dayLabel(bosses, day, count) : { boss: boss.boss, raids: boss.raids },
    });
  }
  return big;
}

/** Big days ranked: by score, then by raids, then the earlier day. */
export function rankBigDays<T extends BigDay>(days: readonly T[]): T[] {
  return [...days].sort(
    (a, b) => b.score - a.score || b.raids - a.raids || (a.day < b.day ? -1 : 1),
  );
}

/** The big days of a calendar year (`yyyy`), ranked (`rankBigDays`); both of two days in a row. */
export function yearBigDays<T extends BigDay>(days: readonly T[], year: number): T[] {
  const prefix = `${String(year).padStart(4, '0')}-`;
  return rankBigDays(days.filter((day) => day.day.startsWith(prefix)));
}

/**
 * The best day of each run of big days in a row (a weekend event is one run), the highest ranked
 * (`rankBigDays`), ranked. A run is what `days` holds: give it every big day of the server to know
 * a run across a year's end, or a year's to label one day of each run on that year's chart (B1).
 */
export function runBests<T extends BigDay>(days: readonly T[]): T[] {
  const big = new Set(days.map((day) => dayNumber(day.day)));
  const runOf = (number: number): number => {
    let start = number;
    while (big.has(start - 1)) start -= 1;
    return start;
  };
  const taken = new Set<number>();
  return rankBigDays(days).filter((day) => {
    const run = runOf(dayNumber(day.day));
    if (taken.has(run)) return false;
    taken.add(run);
    return true;
  });
}

/**
 * The top `count` big days of a year (the page's "Big days of every year", G10, and the post's
 * days, G21): one of each run of big days in a row, its best (`runBests` over `days`, every big
 * day of the server: a run is ranked whole, across a year's end too, A2), the run's day counted
 * for the year it falls in, ranked.
 */
export function topBigDays<T extends BigDay>(days: readonly T[], year: number, count: number): T[] {
  if (count <= 0) return [];
  return yearBigDays(runBests(days), year).slice(0, count);
}

/** The calendar years of a series' days, newest first. */
export function seriesYears(series: readonly DayRaids[]): number[] {
  return [...new Set(series.map((one) => Number(one.day.slice(0, 4))))]
    .filter((year) => Number.isInteger(year))
    .sort((a, b) => b - a);
}

/** The least share of a day's raids its boss has to have to name a day big by its raids (G11). */
export const LABEL_SHARE = 0.25;

/**
 * The boss a day big by its raids alone is named by: its top known boss by raids (ties by key),
 * where that boss has at least `LABEL_SHARE` of the day's raids; none where no boss is known or
 * none has that share. A shadow raid has its boss's key, so a Shadow Mewtwo day is a Mewtwo day.
 */
export function dayLabel(
  bosses: readonly DayBoss[],
  day: string,
  raids: number,
): { boss: string; raids: number } | undefined {
  const sums = new Map<string, number>();
  for (const one of bosses) {
    if (one.day !== day || one.boss === '') continue;
    sums.set(one.boss, (sums.get(one.boss) ?? 0) + one.raids);
  }
  const [top] = [...sums].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  if (top === undefined || top[1] < LABEL_SHARE * raids) return undefined;
  return { boss: top[0], raids: top[1] };
}
