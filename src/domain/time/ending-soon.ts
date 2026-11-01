/**
 * What "nearly over" means, once for every reader (no import: the map's page takes it too). A
 * party whose end is less than this many minutes away is ending soon: a new max battle is asked
 * about before `/max` makes it (Matt, 2026-10-21: the ending-soon dialog; `max-end.ts` gives it
 * on), and a raid in its last minutes is dimmed on the map (plan 8M-7). The one place to change it.
 */
export const ENDING_SOON_MINUTES = 5;

/** Whether an end is less than `ENDING_SOON_MINUTES` away. */
export function endsSoon(end: number, now: number): boolean {
  return end - now < ENDING_SOON_MINUTES * 60_000;
}
