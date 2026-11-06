/*
 * The periods of the region tally (plan 8H-5) and their words, apart from the tally itself so
 * that the web page, whose type check has no Temporal, can import them.
 */

/** The periods of the tally: this month, this year, all time, in `settings.timezone`. */
export const TALLY_PERIODS = ['month', 'year', 'all'] as const;
export type TallyPeriod = (typeof TALLY_PERIODS)[number];

/** Whether a text is a period of the tally (a custom id's argument, a query). */
export function isTallyPeriod(text: string | undefined): text is TallyPeriod {
  return TALLY_PERIODS.some((period) => period === text);
}

/** The period's words in a title: "this month", "this year", "all time". */
export const PERIOD_WORDS: Readonly<Record<TallyPeriod, string>> = {
  month: 'this month',
  year: 'this year',
  all: 'all time',
};

/** A period as a button or a tab names it: "This month", "This year", "All time". */
export const PERIOD_LABELS: Readonly<Record<TallyPeriod, string>> = {
  month: 'This month',
  year: 'This year',
  all: 'All time',
};

/** The tally's title: "Raids and max battles by region, this month". */
export function tallyTitle(period: TallyPeriod): string {
  return `Raids and max battles by region, ${PERIOD_WORDS[period]}`;
}

/**
 * What the region tally, the raids per day and the heatmap count beside raids and max battles
 * (plan 8H-9, `countedParties`): said in `/stats regions`' help and on the history page.
 */
export const TRAIN_STOPS_COUNT =
  'Each stop a train made counts as a raid, or as a max battle at a Power Spot.';

/**
 * The words before the quiet regions (Matt, 2026-11-05): "No raids or max battles: #a, #b", one
 * line on Discord and on the history page alike.
 */
export const QUIET_LEAD = 'No raids or max battles';

/** What the tally says where every region it shows was quiet in the period. */
export function allQuietText(period: TallyPeriod): string {
  return period === 'all'
    ? `${QUIET_LEAD} in any region yet.`
    : `${QUIET_LEAD} ${PERIOD_WORDS[period]} in any region.`;
}
