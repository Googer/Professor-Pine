import type { BoardPeriod } from '../history/board-periods.js';

/*
 * The region board on the web (plan 8H-5): what `GET /s/<guild>/api/stats/regions` answers and
 * the history page reads. Types only, shared by the server and the page.
 */

/** Raids and max battles together. */
export interface BoardCountsView {
  raids: number;
  maxes: number;
}

/** A region's line: its name as the page shows it (`#west`, or `Region 5`), and its counts. */
export interface BoardRowView extends BoardCountsView {
  name: string;
}

export interface RegionBoardView {
  period: BoardPeriod;
  /** "Raids and max battles by region, this month" (`boardTitle`). */
  title: string;
  /** The busiest first; every region the member may see, those without a party too. */
  rows: BoardRowView[];
  /** "No longer a region": regions deleted since and records without one; null for none. */
  gone: BoardCountsView | null;
  total: BoardCountsView;
}
