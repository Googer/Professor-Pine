import { addDays, isoDate, zoned } from './zoned.js';

/**
 * The local day of a moment in `zone`, `yyyy-mm-dd` (Temporal): the day of the posts of the stops,
 * of the lines of the region channels, of a research period's and a Rocket report's key.
 */
export function localDay(time: number, zone: string): string {
  return isoDate(time, zone);
}

/**
 * The local midnight that began the day of `time` in `zone` (Temporal), at midnight itself that
 * moment: since when a report is of today (`/rocket report`'s "last today", Matt, 2026-10-27).
 */
export function localDayStart(time: number, zone: string): number {
  return zoned(time, zone).startOfDay().epochMilliseconds;
}

/**
 * The next local midnight after `time` in `zone` (Temporal: a day of a change of the clocks has 23
 * or 25 hours), at midnight itself the one after it: when the region's board turns its coming up
 * into today (plan 8R-9, B7), the day's research period and Rocket reports end, and the lines of
 * the region channels go.
 */
export function nextLocalMidnight(time: number, zone: string): number {
  return addDays(zoned(time, zone).startOfDay(), 1).epochMilliseconds;
}
