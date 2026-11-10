import { ACTIVITY_FIRST_MONTH, activityWhen } from './activity.js';
import type { TallyPeriod } from './tally-periods.js';

/*
 * The region tally (plan 8H-5; design `2026-11-04-history-on-show-design.md`, Part C): raids and
 * max battles that took place, per region, over a period, legacy included. One domain path:
 * `/stats regions`, its Share and the web's history page all read the sums of the activity
 * heatmap's buckets (`ActivityReader.regionSums`, which count by `countsAsActivity`) and turn
 * them into the tally here. Nobody is named, so it needs no opt-in.
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
export function tallyMonths(period: TallyPeriod, now: number, zone: string): MonthRange {
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
 * Whether how a member stands to a region's forum keeps the region off their tally and their
 * heatmap (the one rule `/stats regions`, the history page and the map's activity layer all
 * ask): only `barred`, an overwrite somebody set to keep them out, as the party layer decides
 * (spec 2.5: the map crosses region roles; Matt, 2026-11-05, reversing R-B's `hidden` so the
 * history and the live map agree). A forum only the member's roles hide (`hidden`), or none
 * (the forum is gone, or the member left), keeps nobody out. Share keeps its own stricter rule
 * for a public post (`shareKeeps`).
 */
export function keptOut(standing: ForumStanding | undefined): boolean {
  return standing === 'barred';
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
export interface TallyCounts {
  raids: number;
  maxes: number;
}

export interface RegionTally {
  /**
   * Every current region not left out that had a raid or max battle in the period, the busiest
   * first (raids and max battles together).
   */
  rows: RegionCount[];
  /**
   * The current regions not left out that had none (Matt, 2026-11-05: a month listed 22 of 28
   * regions as "none"), by region id: shown on one line after the rows, never ranked.
   */
  quiet: number[];
  /**
   * "No longer a region" (Matt, 2026-11-05): the parties of regions not current (deleted since,
   * a legacy channel that is no region now) and of none (0), so that the totals stay true; null
   * when there are none.
   */
  gone: TallyCounts | null;
  /** Every party on the tally: the rows and the line of gone ones. */
  total: TallyCounts;
}

/**
 * The tally of a server's sums of a period (`sums`, by region, a region possibly more than
 * once): a row for each region of `current` (the server's regions now) that is not `leftOut` (a
 * region whose forum keeps the member out, or one the public may not see) and had a party, ranked
 * by raids and max battles together and then by region id; those without one in `quiet`, by
 * region id; the parties of every other region on one line, `gone`, last. A region left out is left out of every line and of the totals; it is never
 * moved to `gone`, which everybody sees.
 */
export function regionTally(
  sums: readonly RegionCount[],
  current: readonly number[],
  leftOut: ReadonlySet<number>,
): RegionTally {
  const known = new Set(current);
  const byRegion = new Map<number, RegionCount>(
    current
      .filter((regionId) => !leftOut.has(regionId))
      .map((regionId) => [regionId, { regionId, raids: 0, maxes: 0 }]),
  );
  const gone: TallyCounts = { raids: 0, maxes: 0 };
  for (const sum of sums) {
    if (leftOut.has(sum.regionId)) continue;
    const row = known.has(sum.regionId) ? byRegion.get(sum.regionId) : gone;
    if (row === undefined) continue;
    row.raids += sum.raids;
    row.maxes += sum.maxes;
  }
  const counted = [...byRegion.values()];
  const rows = counted
    .filter((row) => row.raids + row.maxes > 0)
    .sort((a, b) => b.raids + b.maxes - (a.raids + a.maxes) || a.regionId - b.regionId);
  const quiet = counted
    .filter((row) => row.raids + row.maxes === 0)
    .map((row) => row.regionId)
    .sort((a, b) => a - b);
  const total = rows.reduce(
    (all, row) => ({ raids: all.raids + row.raids, maxes: all.maxes + row.maxes }),
    { ...gone },
  );
  return { rows, quiet, gone: gone.raids + gone.maxes === 0 ? null : gone, total };
}
