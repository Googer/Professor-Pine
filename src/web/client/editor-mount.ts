import type { DistanceUnits } from './distance.js';
import type { TileSetting } from './layers.js';
import type { Me } from './notice.js';

/**
 * How the map page and the region editor's bundle meet (plan 8M-10, C3): the editor's script,
 * loaded when the editor is first turned on, registers one mount on `window.pineRegionEditor`;
 * the map opens and closes the editor through it. Types and the words both sides say alone: the
 * map's bundle takes nothing of the editor's code (Leaflet and Geoman stay in the editor's bundle).
 */

/** Said when the editor is turned on while a form of the map holds (C8). */
export const CLOSE_FORM_FIRST = 'Close the form first.';
/** Said when the editor's files could not be loaded, or the editor could not be started. */
export const EDITOR_FAILED = 'The region editor could not be loaded. Try again in a moment.';

/**
 * Where the editor draws on the map page: its own map, its tool row, its side panel; and the
 * row's "Back to the map", which it turns off while a preview or a save is being sent.
 */
export interface EditorHosts {
  map: HTMLElement;
  tools: HTMLElement;
  panel: HTMLElement;
  back: HTMLButtonElement;
}

/** A view of a map: its center and zoom. */
export interface MapView {
  lat: number;
  lon: number;
  zoom: number;
}

/** What the editor is opened with. */
export interface EditorOpening {
  hosts: EditorHosts;
  guild: string;
  me: Me;
  /** The script of the editor's worker (`data-worker`). */
  worker: string;
  units: DistanceUnits;
  tiles: TileSetting;
  googleKey: string | undefined;
  /**
   * Where its map opens: the live map's view (C4); none while the live map could not be loaded
   * (branch review W2): a first opening then fits the editor's regions, a later one keeps its view.
   */
  view: MapView | undefined;
  /**
   * Shows the editor's hosts, once its data came (before its map is drawn in them); false when
   * the page cannot show them now (a form of the map opened meanwhile, C8): the editor then
   * draws nothing and answers `{ ok: false, words: CLOSE_FORM_FIRST }`.
   */
  show(): boolean;
}

/**
 * What the editor leaves as it closes (plan 8M-11C, review C4): where its map was, and how many
 * regions its staged edits change (`regionsChanged`), which the account menu counts.
 */
export interface EditorClosed {
  view: MapView;
  unsaved: number;
}

/** Whether the editor opened, or the words of why not (the data route's refusal, C2). */
export type EditorOpened = { ok: true } | { ok: false; words: string };

/** The editor's side of the meeting. */
export interface EditorMount {
  /**
   * Turns the editor on: its data asked anew (the staff check, fresh, at every opening), then its
   * hosts shown and drawn; the staged edits kept by the browser as they are. Never rejects.
   */
  open(opening: EditorOpening): Promise<EditorOpened>;
  /** Turns it off (its hosts are hidden by the map): where its map was, what is unsaved. */
  close(): EditorClosed | undefined;
}

declare global {
  interface Window {
    /** Set by the editor's script as it runs (`editor.ts`). */
    pineRegionEditor?: EditorMount;
  }
}
