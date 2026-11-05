import type { TallyPeriod } from '../history/tally-periods.js';

/*
 * The region tally on the web (plan 8H-5): what `GET /s/<guild>/api/stats/regions` answers and
 * the history page reads. Types only, shared by the server and the page.
 */

/** Raids and max battles together. */
export interface TallyCountsView {
  raids: number;
  maxes: number;
}

/** A region's line: its name as the page shows it (`#west`, or `Region 5`), and its counts. */
export interface TallyRowView extends TallyCountsView {
  name: string;
}

export interface RegionTallyView {
  period: TallyPeriod;
  /** "Raids and max battles by region, this month" (`tallyTitle`). */
  title: string;
  /** The busiest first; every region the member may see, those without a party too. */
  rows: TallyRowView[];
  /** "No longer a region": regions deleted since and records without one; null for none. */
  gone: TallyCountsView | null;
  total: TallyCountsView;
}
