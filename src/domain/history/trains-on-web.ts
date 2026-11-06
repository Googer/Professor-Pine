/*
 * Ended trains on the web (plan 8H-7B, Part F's web half; design
 * `2026-11-04-history-on-show-design.md`): which ones the map's History may list and draw. Pure.
 */

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
