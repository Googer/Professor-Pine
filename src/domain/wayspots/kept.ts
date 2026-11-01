import type { WayspotKind } from '@pine/wayspot-core/export-file';

/**
 * The Wayspots Pine keeps (plan 8W-2; table `Wayspot`): every Wayspot of the Wayfarer imports
 * but the Wayfarer gyms that are Pine gyms (those live in `Gym`, by their `pogoId`). Stops and
 * power spots are Pine's only through Wayfarer; the Wayfarer gyms kept here are those Pine did
 * not take (outside the regions, held, asked about, another server's).
 */
export interface Wayspot {
  /** Wayfarer's id (`isWayfarerId`). */
  id: string;
  kind: WayspotKind;
  /**
   * The kind it had before an import last saw it as another: `stop` for a stop promoted to a
   * gym. Null while it never changed.
   */
  formerKind: WayspotKind | null;
  lat: number;
  lon: number;
  /** As Wayfarer gives it, plain (never entity-encoded), cut to `MAX_KEPT_TEXT`. */
  title: string;
  /** Null where Wayfarer gives none. */
  address: string | null;
  /** The address of its picture; null where it has none or the address is too long. */
  image: string | null;
  /** When an import first kept it, epoch milliseconds. */
  firstSeen: number;
  /**
   * When the scan of the newest file that saw it was made (its `finishedAt`, else `startedAt`,
   * else when it was imported), epoch milliseconds: an older file does not change the row.
   */
  lastSeen: number;
  /**
   * Set for a stop of Pine's own (plan 8R-1, `/pokestop`; id `pine-<n>`), which
   * `WayspotDirectory` holds beside the kept Wayspots: the snowflake of its server, the only
   * server whose regions it lies in. Never in the table `Wayspot`.
   */
  pineServer?: string;
}

/**
 * A Wayspot an import found gone from a covered cell (`WayspotStorage.gone`): when the scan that
 * found it gone was made, and the kind it had then (a stop that comes back as a gym was a stop).
 */
export interface GoneWayspot {
  goneAt: number;
  kind: WayspotKind;
}

/** A Wayspot as an import writes it: the times are the storage's. */
export type WayspotRow = Omit<Wayspot, 'firstSeen' | 'lastSeen'>;

/**
 * What an import writes of the kept Wayspots: rows to insert or update by id (a row that exists
 * keeps when it was first seen; a row a newer scan wrote, kept or gone, is never overwritten),
 * the ids of rows to delete (Wayspots that Pine gyms are now: they live in `Gym`), and the ids
 * of rows found gone from a covered cell (`gone`): those are not deleted but marked gone, with
 * when the scan that found them gone was made, so that an older file does not bring them back
 * (a row another scan saw after the file's scan started is left as it is).
 */
export interface WayspotWrites {
  upsert: readonly WayspotRow[];
  remove: readonly string[];
  gone?: readonly string[];
}

/** How long a title or an address may be: the columns hold 255 characters. */
export const MAX_KEPT_TEXT = 255;
