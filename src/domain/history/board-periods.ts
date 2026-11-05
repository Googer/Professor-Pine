/*
 * The periods of the region board (plan 8H-5) and their words, apart from the board itself so
 * that the web page, whose type check has no Temporal, can import them.
 */

/** The periods of the board: this month, this year, all time, in `settings.timezone`. */
export const BOARD_PERIODS = ['month', 'year', 'all'] as const;
export type BoardPeriod = (typeof BOARD_PERIODS)[number];

/** Whether a text is a period of the board (a custom id's argument, a query). */
export function isBoardPeriod(text: string | undefined): text is BoardPeriod {
  return BOARD_PERIODS.some((period) => period === text);
}

/** The period's words in a title: "this month", "this year", "all time". */
export const PERIOD_WORDS: Readonly<Record<BoardPeriod, string>> = {
  month: 'this month',
  year: 'this year',
  all: 'all time',
};

/** A period as a button or a tab names it: "This month", "This year", "All time". */
export const PERIOD_LABELS: Readonly<Record<BoardPeriod, string>> = {
  month: 'This month',
  year: 'This year',
  all: 'All time',
};

/** The board's title: "Raids and max battles by region, this month". */
export function boardTitle(period: BoardPeriod): string {
  return `Raids and max battles by region, ${PERIOD_WORDS[period]}`;
}
