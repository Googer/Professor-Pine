import { ACTIVITY_FIRST_MONTH, activityWhen } from './activity.js';
import type { BoardPeriod } from './board-periods.js';

/*
 * The region board (plan 8H-5; design `2026-11-04-history-on-show-design.md`, Part C): raids and
 * max battles that took place, per region, over a period, legacy included. One domain path:
 * `/stats regions`, its Share and the web's history page all read the sums of the activity
 * heatmap's buckets (`ActivityReader.regionSums`, which count by `countsAsActivity`) and turn
 * them into the board here. Nobody is named, so it needs no opt-in.
 */

/** A span of local months, `yyyy-mm`, both ends included. */
export interface MonthRange {
  first: string;
  last: string;
}

/**
 * The months a period reads, in `zone`: this month; January to this month; the game's launch
 * (`ACTIVITY_FIRST_MONTH`) to this month. No period reaches the records at no time
 * (`UNKNOWN_MONTH`, before every month), nor a bucket after this month (a bad time written before
 * the heatmap bounded its months; a record of next month counts once that month has come).
 */
export function boardMonths(period: BoardPeriod, now: number, zone: string): MonthRange {
  const { month } = activityWhen(now, zone);
  switch (period) {
    case 'month':
      return { first: month, last: month };
    case 'year':
      return { first: `${month.slice(0, 4)}-01`, last: month };
    case 'all':
      return { first: ACTIVITY_FIRST_MONTH, last: month };
  }
}

/** How a member stands to a region's forum, as Discord says it (`PartyGateway.memberAccess`). */
export type ForumStanding = 'visible' | 'hidden' | 'barred';

/**
 * Whether how a member stands to a region's forum keeps the region off their board and their
 * heatmap (Matt, 2026-11-05, R-B; the one rule `/stats regions`, the history page and the map's
 * activity layer all ask): kept out (`barred`) or not shown it by their roles (`hidden`) alike;
 * undefined (the forum is gone, or the member left) keeps nobody out.
 */
export function keptOut(standing: ForumStanding | undefined): boolean {
  return standing === 'barred' || standing === 'hidden';
}

/**
 * The channel whose viewers may see a region's counts (8H5-2, the one rule of `/stats regions`,
 * its Share, the history page and the map's activity layer): its forum, or its text channel
 * where it has none.
 */
export function regionGate(region: { forumChannelId: string | null; channelId: string }): string {
  return region.forumChannelId ?? region.channelId;
}

/** A region's raids and max battles over a period; region 0 is a record without one. */
export interface RegionCount {
  regionId: number;
  raids: number;
  maxes: number;
}

/** Raids and max battles together, a line without a region. */
export interface BoardCounts {
  raids: number;
  maxes: number;
}

export interface RegionBoard {
  /** Every current region not left out, the busiest first (raids and max battles together). */
  rows: RegionCount[];
  /**
   * "No longer a region" (Matt, 2026-11-05): the parties of regions not current (deleted since,
   * a legacy channel that is no region now) and of none (0), so that the totals stay true; null
   * when there are none.
   */
  gone: BoardCounts | null;
  /** Every party on the board: the rows and the line of gone ones. */
  total: BoardCounts;
}

/**
 * The board of a server's sums of a period (`sums`, by region, a region possibly more than
 * once): a row for each region of `current` (the server's regions now, zero ones too) that is not
 * `leftOut` (a region whose forum keeps the member out, or one the public may not see), ranked by
 * raids and max battles together and then by region id; the parties of every other region on one
 * line, `gone`, last. A region left out is left out of every line and of the totals; it is never
 * moved to `gone`, which everybody sees.
 */
export function regionBoard(
  sums: readonly RegionCount[],
  current: readonly number[],
  leftOut: ReadonlySet<number>,
): RegionBoard {
  const known = new Set(current);
  const byRegion = new Map<number, RegionCount>(
    current
      .filter((regionId) => !leftOut.has(regionId))
      .map((regionId) => [regionId, { regionId, raids: 0, maxes: 0 }]),
  );
  const gone: BoardCounts = { raids: 0, maxes: 0 };
  for (const sum of sums) {
    if (leftOut.has(sum.regionId)) continue;
    const row = known.has(sum.regionId) ? byRegion.get(sum.regionId) : gone;
    if (row === undefined) continue;
    row.raids += sum.raids;
    row.maxes += sum.maxes;
  }
  const rows = [...byRegion.values()].sort(
    (a, b) => b.raids + b.maxes - (a.raids + a.maxes) || a.regionId - b.regionId,
  );
  const total = rows.reduce(
    (all, row) => ({ raids: all.raids + row.raids, maxes: all.maxes + row.maxes }),
    { ...gone },
  );
  return { rows, gone: gone.raids + gone.maxes === 0 ? null : gone, total };
}
