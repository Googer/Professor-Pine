import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { Edit, EditState } from './edits.js';

/**
 * The region editor's staged edits as the browser keeps them (spec 4.4, `serialiseEdits`,
 * `parseEdits`), an empty state, and how many regions they change (plan 8M-11C, S31,
 * `regionsChanged`): what the map's page reads of them for "Edit regions · 3 unsaved". Imports
 * nothing at run time (`src/web/page-imports.test.ts`), so that the map's bundle takes it whole;
 * `edits.ts` gives the rest of the staged edits and passes these on.
 */

/** The key of the `n`-th new region. */
export const newKey = (n: number): string => `n${n}`;

/** Whether a key is a new region's (`newKey`), not a loaded region's (`regionKey`). */
export const isNewKey = (key: string): boolean => /^n\d+$/u.test(key);

export function emptyEdits(): EditState {
  return { edits: [], undone: [], next: 0 };
}

/**
 * How many regions the staged edits change (plan 8M-11C, S31: "Edit regions · 3 unsaved" and the
 * editor's line), not how many steps: every region an edit made (not undone) touches, by key, in
 * the order of the edits; a new region removed again, and a region taken as somebody else has it
 * (`take-theirs`), count no more, nor does a region restored whose only edits before were its
 * removals (branch review BR-2). Read from the edits alone, so that the map counts them without
 * the editor's data.
 */
export function regionsChanged(state: EditState): number {
  const keys = new Set<string>();
  // The regions counted so far for their removal alone: a restore takes them out again.
  const removedOnly = new Set<string>();
  const add = (key: string): void => {
    keys.add(key);
    removedOnly.delete(key);
  };
  const drop = (key: string): void => {
    keys.delete(key);
    removedOnly.delete(key);
  };
  const count = (edit: Edit): void => {
    switch (edit.kind) {
      case 'take-theirs':
        drop(edit.key);
        return;
      case 'remove':
        if (isNewKey(edit.key)) drop(edit.key);
        else if (!keys.has(edit.key)) {
          keys.add(edit.key);
          removedOnly.add(edit.key);
        }
        return;
      case 'restore':
        if (removedOnly.has(edit.key)) drop(edit.key);
        else add(edit.key);
        return;
      case 'split':
        add(edit.key);
        add(edit.newKey);
        return;
      case 'swap':
        add(edit.a);
        add(edit.b);
        return;
      case 'batch':
        for (const inner of edit.edits) count(inner);
        return;
      default:
        add(edit.key);
    }
  };
  for (const edit of state.edits) count(edit);
  return keys.size;
}

/**
 * Whether an outline has an area: three distinct corners at least (at six decimals, as the editor
 * keeps them; a closed ring's last corner is its first). The editor stages no reshaped outline
 * without one (branch review BR-1), and drops one read back from the browser (`parseEdits`).
 */
export function hasArea(outline: readonly LatLon[]): boolean {
  const six = (value: number): string => value.toFixed(6);
  return new Set(outline.map(({ lat, lon }) => `${six(lat)} ${six(lon)}`)).size >= 3;
}

/**
 * The edits without a reshaped outline that has no area (`hasArea`), a batch left empty with it:
 * what a browser kept of a triangle's corner deleted before branch review BR-1 drew nothing, and
 * no longer stops the editor from opening (the region keeps the outline it had before).
 */
function withAreas(edits: readonly Edit[]): Edit[] {
  return edits.flatMap((edit): Edit[] => {
    if (edit.kind === 'outline') return hasArea(edit.outline) ? [edit] : [];
    if (edit.kind !== 'batch') return [edit];
    const inner = withAreas(edit.edits);
    return inner.length === 0 ? [] : [{ ...edit, edits: inner }];
  });
}

/** The format of what is kept in the browser; another is not read. */
const FORMAT = 1;

/** The staged edits as the browser keeps them (`localStorage`). */
export function serialiseEdits(state: EditState): string {
  const { edits, undone, next } = state;
  return JSON.stringify({ v: FORMAT, edits, undone, next });
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isTextOrNull = (value: unknown): boolean => value === null || isText(value);
const isOutline = (value: unknown): value is LatLon[] =>
  Array.isArray(value) &&
  value.every(
    (point) => isObject(point) && Number.isFinite(point.lat) && Number.isFinite(point.lon),
  );
const isBases = (value: unknown): boolean => isObject(value) && Object.values(value).every(isText);
const isChannel = (value: unknown): boolean =>
  value === null ||
  (isObject(value) &&
    ((isText(value.id) && isText(value.name)) || (value.id === undefined && isText(value.create))));
const isForum = (value: unknown): boolean => value === 'keep' || value === 'delete';

/** Whether a value read back is an edit this code made. */
function isEdit(value: unknown): value is Edit {
  if (!isObject(value)) return false;
  switch (value.kind) {
    case 'add':
      return (
        isText(value.key) &&
        isOutline(value.outline) &&
        isChannel(value.channel) &&
        isTextOrNull(value.description)
      );
    case 'outline':
      return isText(value.key) && isOutline(value.outline) && isBases(value.bases);
    case 'details':
      return isText(value.key) && isChannel(value.channel) && isTextOrNull(value.description);
    case 'remove':
      return isText(value.key) && isForum(value.forum) && isBases(value.bases);
    case 'restore':
      return isText(value.key) && isBases(value.bases);
    case 'split':
      return (
        isText(value.key) &&
        isOutline(value.keep) &&
        isText(value.newKey) &&
        isOutline(value.other) &&
        isBases(value.bases)
      );
    case 'swap':
      return isText(value.a) && isText(value.b) && isBases(value.bases);
    case 'take-theirs':
    case 'keep-mine':
      return isText(value.key) && isText(value.version);
    case 'batch':
      return Array.isArray(value.edits) && value.edits.every(isEdit);
    default:
      return false;
  }
}

/** Staged edits read back from the browser; undefined for anything this code did not write. */
export function parseEdits(text: string): EditState | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isObject(value) || value.v !== FORMAT) return undefined;
  const { edits, undone, next } = value;
  if (!Array.isArray(edits) || !edits.every(isEdit)) return undefined;
  if (!Array.isArray(undone) || !undone.every(isEdit)) return undefined;
  if (typeof next !== 'number' || !Number.isInteger(next) || next < 0) return undefined;
  return { edits: withAreas(edits), undone: withAreas(undone), next };
}
