/*
 * The activity heatmap's view on the map (plan 8H-4): what `GET /s/<guild>/api/activity` answers
 * and the page reads. Types only, shared by the server and the page.
 */

/** The modes the page offers (`?mode=`); History also names `year` or `month`. */
export const ACTIVITY_MODES = ['now', 'evenings', 'weekend', 'history'] as const;
export type ActivityModeName = (typeof ACTIVITY_MODES)[number];

/** A place drawn on the heatmap. */
export interface ActivityPlaceView {
  kind: 'gym' | 'spot';
  /** The gym's id in decimal, the Power Spot's Wayfarer id. */
  id: string;
  lat: number;
  lon: number;
  /** 0–1: the busiest place drawn is 1. */
  weight: number;
  /** Raids and max battles in the mode's window, unweighted. */
  parties: number;
}

export interface ActivityView {
  mode: ActivityModeName;
  /** Expected now's weekday (ISO, 1 Monday … 7 Sunday) in the posts' zone; null in other modes. */
  weekday: number | null;
  places: ActivityPlaceView[];
  /**
   * Parties in the window the map cannot draw: at gyms no longer listed, at Power Spots no longer
   * kept, at pins and without a gym.
   */
  leftOut: number;
  /** The first and the last month the server has activity of (History's slider); null for none. */
  months: { first: string; last: string } | null;
  /**
   * How long until Expected now's window moves on (the next hour on the server's clock), in ms:
   * the page waits that long from the answer, whatever its own clock says. Null in other modes.
   */
  changesInMs: number | null;
}
