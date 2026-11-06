/*
 * Raids per day, big days and a boss's trend on the web (plan 8H-8): what `GET
 * /s/<guild>/api/history/days`, `…/big-days`, `…/bosses` and `…/bosses/<key>` answer and the
 * history page reads. Types only, shared by the server and the page. Every word is the server's;
 * the page draws the numbers it is given.
 */

/** A day of the year's chart: its raids, and its max battles (0 in a year without any). */
export interface DayBarView {
  /** `yyyy-mm-dd`. */
  day: string;
  raids: number;
  maxes: number;
}

/** A big day as the page lists and labels it. */
export interface BigDayView {
  day: string;
  /** "Tuesday, October 8, 2019". */
  date: string;
  /** "Oct 8": the chart's label of it. */
  short: string;
  raids: number;
  /** "Mewtwo day, 180 of 412 raids", or "412 raids" where no boss names the day (G11, B8). */
  label: string;
  /**
   * Whether the chart labels it (B1): the best day of its run of big days in a row within the
   * year; the run's other days are only colored.
   */
  labeled: boolean;
  /** Whether it is one of the year's top three (`topBigDays`): a phone's chart labels only them. */
  top: boolean;
}

/** A month's totals, for the chart's hidden table (G14). */
export interface MonthTotalView {
  /** "January". */
  month: string;
  raids: number;
  maxes: number;
}

/** `GET …/api/history/days?year=`: a year's days, its big days and the years there are. */
export interface HistoryDaysView {
  year: number;
  /** Every year with a day of raids or max battles, newest first. */
  years: number[];
  /** "Raids by day, 2019". */
  title: string;
  /** Each day of the year with a raid or a max battle, in order; a day not listed had none. */
  days: DayBarView[];
  /** The days of the year (365 or 366), so that the chart leaves room for the quiet ones. */
  length: number;
  /** Whether the year had max battles: the chart draws them as a second series only then (G12). */
  maxes: boolean;
  months: MonthTotalView[];
  /** "Big days of 2019". */
  bigTitle: string;
  /** The year's big days by date (B6), both of two in a row. */
  big: BigDayView[];
  /** What the list says where the year had none: "No big days in 2019." */
  noBig: string;
  /** What a big day is, in plain words, under the list's title (B5). */
  bigNote: string;
  /** "Month", the table's head of its first column, and "Big day", of a big day's row (B12). */
  monthWord: string;
  bigDayWord: string;
  /** "Raids" and "Max battles", the chart's legend and table heads. */
  raidsWord: string;
  maxesWord: string;
}

/** `GET …/api/history/big-days`: the top three of every year, newest year first. */
export interface BigDaysView {
  /** "Big days of every year". */
  title: string;
  years: Array<{ year: number; days: BigDayView[] }>;
  /** What the page says where no year had a big day. */
  none: string;
}

/** `GET …/api/history/bosses`: the bosses the server's raids hold, by the catalogue's names. */
export interface BossListView {
  bosses: Array<{ key: string; name: string; raids: number }>;
  /** What the page says where there is none: "No raids with a known boss yet." (B12). */
  none: string;
  /** What it says to a name typed that is no boss of the list: "Pick a boss from the list.". */
  pick: string;
}

/** `GET …/api/history/bosses/<key>`: a boss's raids per month across every year. */
export interface BossTrendView {
  key: string;
  name: string;
  /** "Mewtwo raids by month". */
  title: string;
  /** The line over the chart: "Mewtwo raids by month: 320 in all." (B12). */
  summary: string;
  /** "Month" and "Raids", the heads of its table. */
  monthWord: string;
  raidsWord: string;
  /** Every month from its first to its last raid, the months without any as 0. */
  months: Array<{ month: string; label: string; raids: number }>;
  total: number;
}
