/**
 * What the start of a meetup's forms on the map shows before anything is typed: examples of the
 * forms the bot reads (`src/web/meetup-start-examples.test.ts` reads each back). A module of its
 * own, without the page's DOM, so that the server's tests can import it.
 */

/** The start of a new meetup. */
export const NEW_MEETUP_START_EXAMPLES = '6:30pm, noon, tomorrow 11am or 10-18 11am (month-day)';

/** The start in a meetup's editor. */
export const MEETUP_START_EXAMPLES = '6:15pm, tomorrow noon, 10-17 6:15pm or in 30';
