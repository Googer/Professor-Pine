import {
  emptyEdits,
  parseEdits,
  regionsChanged,
  serialiseEdits,
} from '../../domain/regions/staged-format.js';
import type { EditState } from '../../domain/regions/edits.js';

/**
 * Where the staged edits of a member are kept in the browser, per server: the member's own key
 * since plan 8M-2, so that no older key without a member exists to be read.
 */
export const storageKey = (guildId: string, userId: string): string =>
  `pine-region-edits:${guildId}:${userId}`;

/** What the page needs of `localStorage`. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The browser's storage (`() => window.localStorage`), or none where even asking for it throws
 * (a sandboxed page, storage forbidden by the browser's settings).
 */
export function browserStorage(get: () => KeyValueStorage): KeyValueStorage | undefined {
  try {
    return get();
  } catch {
    return undefined;
  }
}

/**
 * The staged edits kept in the browser (spec 4.4) under `key` (`storageKey`), or none: where
 * the browser keeps nothing (private windows, a full or forbidden storage throws), or what it
 * keeps is not ours.
 */
export function readStaged(storage: KeyValueStorage | undefined, key: string): EditState {
  try {
    const text = storage?.getItem(key);
    return (text == null ? undefined : parseEdits(text)) ?? emptyEdits();
  } catch {
    return emptyEdits();
  }
}

/**
 * How many regions the edits a member staged for a server change (plan 8M-11C, S31: the map's
 * "Edit regions · 3 unsaved", `regionsChanged`); none where the browser keeps nothing for the page
 * or what it keeps is not ours.
 */
export function stagedRegions(
  storage: KeyValueStorage | undefined,
  guildId: string,
  userId: string,
): number {
  return regionsChanged(readStaged(storage, storageKey(guildId, userId)));
}

/** Whether an error of the storage says that it is full (each browser names it its own way). */
function isFull(err: unknown): boolean {
  const name = typeof err === 'object' && err !== null && 'name' in err ? err.name : undefined;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

/**
 * Keeps the staged edits in the browser, or takes them away when nothing is staged or undone:
 * `kept`. Else `full` when the browser's storage for the page is full (saving or discarding
 * changes makes room), `none` when the browser keeps nothing for the page: the page says
 * which, as a reload loses what is staged.
 */
export function writeStaged(
  storage: KeyValueStorage | undefined,
  key: string,
  state: EditState,
): 'kept' | 'full' | 'none' {
  if (!storage) return 'none';
  try {
    if (state.edits.length === 0 && state.undone.length === 0) storage.removeItem(key);
    else storage.setItem(key, serialiseEdits(state));
    return 'kept';
  } catch (err) {
    return isFull(err) ? 'full' : 'none';
  }
}

/** Where the browser keeps "Move shared corners together" (plan 8M-10, C13), one for all servers. */
const MOVE_TOGETHER_KEY = 'pine-region-move-together';

/** Whether a shared corner moves in every region that has it: on unless the browser keeps it off. */
export function readMoveTogether(storage: KeyValueStorage | undefined): boolean {
  try {
    return storage?.getItem(MOVE_TOGETHER_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Keeps the choice in the browser, where it keeps anything; never throws. */
export function writeMoveTogether(storage: KeyValueStorage | undefined, on: boolean): void {
  try {
    if (on) storage?.removeItem(MOVE_TOGETHER_KEY);
    else storage?.setItem(MOVE_TOGETHER_KEY, 'off');
  } catch {
    // Kept for this visit only.
  }
}
