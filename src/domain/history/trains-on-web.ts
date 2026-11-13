import { monthStart } from '../time/zoned.js';
import { activityWhen } from './activity.js';

/*
 * Ended trains on the web (plan 8H-7B, Part F's web half; design
 * `2026-11-04-history-on-show-design.md`): which ones the map's History may list and draw, and
 * the month a train belongs to. Pure.
 */

/**
 * The month of a train (the brief's ruling): when it was made (`createdAt`), as the local month
 * (`yyyy-mm`) in the server's zone, the heatmap's months.
 */
export function trainMonth(createdAt: number, zone: string): string {
  return activityWhen(createdAt, zone).month;
}

/**
 * A local month (`yyyy-mm`) in `zone` as epoch ms: its first moment (`from`) and the next
 * month's (`to`, not in it). Throws a `RangeError` for a month that is none.
 */
export function trainMonthRange(month: string, zone: string): { from: number; to: number } {
  const [year = Number.NaN, number = Number.NaN] = month.split('-').map(Number);
  // The next month's own start: a zone whose clocks change at midnight starts it later.
  const next = number === 12 ? monthStart(year + 1, 1, zone) : monthStart(year, number + 1, zone);
  return { from: monthStart(year, number, zone).epochMilliseconds, to: next.epochMilliseconds };
}

/**
 * The fewest members who must have come to a train (Here or Done at some point) for the web to
 * show it (Matt, 2026-11-05, review F-B13): a train one or two members ran often traces a home or
 * a commute. As the heatmap's minimum of three.
 */
export const TRAIN_WEB_MIN_RIDERS = 3;

/**
 * Whether the web may list and draw an ended train (review G2): by its record's own counts of the
 * members who came (`PartyHistory.here` and `done`), live and legacy alike (the legacy history
 * keeps its attendees' statuses). One rule for the month's list, a train's route and the post's
 * link to it. A split's old train counts the members who went with the group too (G10).
 */
export function trainShownOnWeb(counts: { here: number; done: number }): boolean {
  return counts.here + counts.done >= TRAIN_WEB_MIN_RIDERS;
}
