import type { BoardName } from '../history/board-words.js';
import type { TallyPeriod } from '../history/tally-periods.js';

/*
 * The boards and a member's own stats on the web (plan 8H-6): what `GET /s/<guild>/api/stats/
 * boards` and `…/api/stats/me` answer and the history page and "Your Pine" read. Types only,
 * shared by the server and the page; every word and number is the server's.
 */

/** A line of a board: its rank, who or what (a member's name in the server, a thing's), the count in words. */
export interface BoardRowView {
  rank: number;
  name: string;
  count: string;
}

/** A board as `/stats boards` shows it, worded by the server. */
export interface BoardView {
  board: BoardName;
  /** "Raids reported that others completed, this month" (`boardTitle`). */
  title: string;
  rows: BoardRowView[];
  /** What it says where it has no line; null where it has. */
  empty: string | null;
  /** The small print (the day of the most wanted); null for none. */
  note: string | null;
  /** Where the member stands, where it does not show them ("You would be #4 …"); null else. */
  viewer: string | null;
}

/** Every board of a period, the people's first. */
export interface BoardsView {
  period: TallyPeriod;
  boards: BoardView[];
}

/** A count of a board, and how many of it were anonymous (on no board). */
export interface CountedView {
  count: number;
  anonymous: number;
}

/** A member's own numbers ("Your Pine"), as `/stats me` counts them. */
export type MemberStatsView =
  | {
      optedIn: false;
      /** That nothing is counted, and where it is turned on (`notOptedIn`). */
      text: string;
    }
  | {
      optedIn: true;
      /** A year the member has nothing in, as `/stats me` says it (`nothingInYear`, B3). */
      empty: string;
      /** "Your Pine in 2019", the page's heading (R-B1). */
      title: string;
      year: number;
      /** The years the member has anything in, latest first: the page's year select. */
      years: number[];
    }
  | {
      optedIn: true;
      empty?: undefined;
      /** The calendar year shown, or null for all time. */
      year: number | null;
      /** The years the member has anything in, latest first: the page's year select. */
      years: number[];
      /** "Your Pine, all time", "Your Pine in 2026". */
      title: string;
      raids: CountedView;
      trains: CountedView;
      meetups: CountedView;
      reports: { count: number; confirmations: number };
      completed: number;
      trainsCame: number;
      meetupsCame: number;
      /** The busiest region by its channel (`#west`), or `Region 5`; null for none. */
      busiestRegion: string | null;
      bosses: { name: string; count: number }[];
      sent: number;
      /** By local month, oldest first, for the page's chart. */
      months: { month: string; came: number; reports: number }[];
    };

/** A member's card on the web: their numbers, of a year they have something in or all time. */
export type MemberCardView = Extract<MemberStatsView, { raids: CountedView }>;
