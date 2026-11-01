/**
 * A train's flow in step with the clock (fix round 1 of 8M-13, R1-3). A module without the DOM's
 * types, so that the stylesheet's test (`src/web/train-flow.test.ts`) holds the cycle to
 * `--flow-time` of `theme.css`.
 */

/** One cycle of a train's flow, as `--flow-time` of `theme.css` says (2.5 s). */
export const FLOW_CYCLE_MS = 2500;

/**
 * Where a flowing path starts its cycle, as its `animationDelay`: the clock's place in the cycle,
 * behind, so that every path is in step with the clock and a path drawn anew (every draw of the
 * parties) goes on where the one before was, not from 0.
 */
export function flowDelay(now: number): string {
  return `${String(-(now % FLOW_CYCLE_MS))}ms`;
}
