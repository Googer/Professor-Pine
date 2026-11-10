/**
 * What the region editor's addresses answer and take (plan 8M-2): `GET /s/<guild>/api/regions/
 * edit` (`EditorData`) and the bodies of `POST …/api/regions/preview` and `…/save`
 * (`SaveRequest`). Types alone, with no import: the page's bundle takes them without the
 * server's code.
 */

/** A place: `[lat, lon]`, six decimals (about 10 cm). */
export type Point = [number, number];

/** What a kept Wayspot is in the game. */
export type EditorWayspotKind = 'gym' | 'stop' | 'powerspot';

/** A region of the server as the editor loads it. */
export interface EditorRegion {
  id: number;
  channelId: string;
  /** Its channel's name as the bot sees it; `Region <id>` when the channel is gone. */
  name: string;
  /** The category its channel is in now (what `/region export` writes as the description). */
  category: string | null;
  /** The region's own description (a legacy column; part of the version). */
  description: string | null;
  /** Closed; null for a region that has no outline yet. */
  outline: Point[] | null;
  /** `regionVersion` of its outline and description, as it is stored now. */
  version: string;
}

export interface EditorData {
  /** The server: its id and name (the name of an exported file). */
  guild: { id: string; name: string };
  /** Who asks: the page keeps their staged edits under it (`storageKey`). */
  userId: string;
  /** Discord could not say who is asking: the editor shows, but saves nothing. */
  readOnly: boolean;
  /** Whether the member may create channels (Manage Channels): new names need it. */
  mayManageChannels: boolean;
  /** The server's regions, by id. */
  regions: EditorRegion[];
  /** Other servers' regions near these (grey, not selectable): their outlines alone. */
  others: Array<{ id: number; outline: Point[] }>;
  /**
   * The gyms in the server's regions, and those in no region of any server near them: by id,
   * as `[id, lat, lon, name]`.
   */
  gyms: Array<[number, number, number, string]>;
  /**
   * The kept Wayspots near the server's regions (their box grown by 2 km), as
   * `[kind, lat, lon, title]`: no addresses, no pictures.
   */
  wayspots: Array<[EditorWayspotKind, number, number, string]>;
  /** The server's text channels that are no region yet: what a new region may take. */
  channels: Array<{ id: string; name: string }>;
}

/** A changed outline of a region, with the version it was changed from. */
export interface SavedChange {
  regionId: number;
  outline: Point[];
  version: string;
}

/** A new region: a channel that is no region yet (by id), or a new channel (by its name). */
export interface SavedAddition {
  channel: { id: string } | { name: string };
  /** For a new channel: the category it is created in (as a KML description says it). */
  description: string | null;
  outline: Point[];
}

/** A region to remove, what becomes of its forum, and the version it was loaded as. */
export interface SavedRemoval {
  regionId: number;
  forum: 'keep' | 'delete';
  version: string;
}

/** What the page sends to preview or save: the staged changes, by kind. */
export interface SaveRequest {
  changes: SavedChange[];
  additions: SavedAddition[];
  removals: SavedRemoval[];
}

/** A list of a preview or an outcome: its title and its lines (plain text). */
export interface WordedList {
  title: string;
  items: string[];
}

/** A preview or an outcome as the page shows it: sentences, then lists; plain text. */
export interface Worded {
  lines: string[];
  lists: WordedList[];
}

/** A region the save refused because it changed since the page loaded it (spec 4.6). */
export interface SaveConflict {
  regionId: number;
  /** The region as it is now; null when it is gone. */
  theirs: EditorRegion | null;
}

/**
 * What a preview or a save answers. `preview`: what would be done (and whether anything
 * would); `saved`: what was done; `refused`: why nothing is done (lines); `conflicts`: regions
 * of the save changed meanwhile (409); `stale`: other regions of the server changed, or a
 * channel became a region, between the check of the save and its run under the lock: nothing
 * was saved, and the page loads the regions and previews again (409; `line` says so).
 */
export type SaveAnswer =
  | { kind: 'preview'; worded: Worded; changes: boolean }
  | { kind: 'saved'; worded: Worded }
  | { kind: 'refused'; lines: string[] }
  | { kind: 'conflicts'; conflicts: SaveConflict[] }
  | { kind: 'stale'; line: string };
