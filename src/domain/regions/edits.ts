import type { KmlArea } from '@pine/wayspot-core/kml';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { Point, SaveRequest } from '../web/editor-data.js';
import { channelKey } from './region-import.js';
import { MAX_NEW_CATEGORY } from './save-plan.js';
import { isNewKey, newKey } from './staged-format.js';
import { normalisedOutline, regionVersion, roundSix } from './version.js';

// The staged edits as the browser keeps them, and what the map counts of them (plan 8M-11C),
// live in a module that imports nothing at run time, so that the map's page takes it whole.
export {
  emptyEdits,
  hasArea,
  isNewKey,
  newKey,
  parseEdits,
  regionsChanged,
  serialiseEdits,
} from './staged-format.js';

/**
 * A description cut to what a save takes as a new channel's category (`MAX_NEW_CATEGORY`
 * UTF-16 units, as the page's field counts them), never through the middle of a character.
 */
function categoryCut(description: string | null): string | null {
  if (description === null || description.length <= MAX_NEW_CATEGORY) return description;
  const cut = description.slice(0, MAX_NEW_CATEGORY);
  return /[\uD800-\uDBFF]$/u.test(cut) ? cut.slice(0, -1) : cut;
}

/**
 * The staged changes of the region editor (spec 4.4, plan 8M-2): a list of edits applied to the
 * regions as they were loaded, with undo and redo over it, kept in the browser between visits
 * (`serialiseEdits`), and turned into what a save sends (`saveRequest`). Pure: the page keeps
 * the state and draws what `applyEdits` gives.
 *
 * Every edit that touches a loaded region carries the version that region had when the edit was
 * made (`bases`): a region whose version on the server differs from the one its first edit saw
 * was changed by somebody else meanwhile (`conflicts`, spec 4.6), until the staff member takes
 * theirs or keeps theirs own (which sends the version it has now). A region the server has as
 * it is staged is no conflict: a save whose answer never came saved it.
 */

/** A region of the server as the editor loaded it (`EditorRegion`, outlines as places). */
export interface LoadedRegion {
  id: number;
  channelId: string;
  name: string;
  /** The category of its channel: what an export writes as its description. */
  category: string | null;
  /** The region's own description, part of its version. */
  description: string | null;
  outline: LatLon[] | null;
  version: string;
}

/** The channel of a region: one of the server (by id, with its name), or a new one to create. */
export type ChannelChoice = { id: string; name: string } | { create: string };

/** A region as the staged edits leave it. */
export interface Draft {
  /** `regionKey(id)` of a loaded region, `newKey(n)` of a new one. */
  key: string;
  /** The loaded region; null for a new one. */
  regionId: number | null;
  /** A loaded region's own channel; a new region's choice, null until it is chosen. */
  channel: ChannelChoice | null;
  /** For a new channel: the category to create it in (a KML description). */
  description: string | null;
  outline: LatLon[] | null;
  /** Staged for removal, with what becomes of its forum. */
  removed: 'keep' | 'delete' | null;
  /** The version a loaded region had when it was first changed; null while unchanged. */
  base: string | null;
}

/** The versions of the loaded regions an edit touches, by key, when the edit was made. */
export type Bases = Record<string, string>;

/**
 * One staged edit. `add`: a new region (drawn, or of a file); `outline`: a region reshaped,
 * moved or drawn anew; `details`: a new region's channel and category; `remove`, and
 * `restore` (a removal taken back); `split`: a region keeps one part and a new region gets the
 * other; `swap`: two regions exchange their
 * outlines (which part of a split keeps the region); `take-theirs` / `keep-mine`: a region
 * changed by somebody else is taken as it is now, or the staged one is kept and sent with the
 * version it has now; `batch`: several edits undone as one (a file).
 */
export type Edit =
  | {
      kind: 'add';
      key: string;
      outline: LatLon[];
      channel: ChannelChoice | null;
      description: string | null;
    }
  | { kind: 'outline'; key: string; outline: LatLon[]; bases: Bases }
  | { kind: 'details'; key: string; channel: ChannelChoice | null; description: string | null }
  | { kind: 'remove'; key: string; forum: 'keep' | 'delete'; bases: Bases }
  | { kind: 'restore'; key: string; bases: Bases }
  | {
      kind: 'split';
      key: string;
      keep: LatLon[];
      newKey: string;
      other: LatLon[];
      bases: Bases;
    }
  | { kind: 'swap'; a: string; b: string; bases: Bases }
  | { kind: 'take-theirs'; key: string; version: string }
  | { kind: 'keep-mine'; key: string; version: string }
  | { kind: 'batch'; edits: Edit[] };

/**
 * The edits made, those undone (the last undone last), and the number of the next new key.
 * `recordedAt`: when the last edit was recorded (`record`), while nothing was undone or redone
 * since; not kept in the browser.
 */
export interface EditState {
  edits: Edit[];
  undone: Edit[];
  next: number;
  recordedAt?: number;
}

/**
 * How close one outline edit of a region must follow the one before it, of the same region, to
 * be one step with it: Geoman reports a drag of a corner as many edits.
 */
export const SAME_STEP_MS = 2_000;
/** How many steps undo goes back at most: the oldest edits beyond are one step together. */
export const MAX_UNDO_STEPS = 200;

/** The key of a loaded region. */
export const regionKey = (id: number): string => `r${id}`;

/** The keys of new regions an edit makes. */
function madeKeys(edit: Edit): string[] {
  if (edit.kind === 'add') return [edit.key];
  if (edit.kind === 'split') return [edit.newKey];
  if (edit.kind === 'batch') return edit.edits.flatMap(madeKeys);
  return [];
}

/** An edit with its outlines as the editor keeps them (`normalisedOutline`). */
function normalised(edit: Edit): Edit {
  switch (edit.kind) {
    case 'add':
    case 'outline':
      return { ...edit, outline: normalisedOutline(edit.outline) };
    case 'split':
      return { ...edit, keep: normalisedOutline(edit.keep), other: normalisedOutline(edit.other) };
    case 'batch':
      return { ...edit, edits: edit.edits.map(normalised) };
    default:
      return edit;
  }
}

/** The edits of one step: a batch's own, or the edit. */
const stepEdits = (edit: Edit): Edit[] => (edit.kind === 'batch' ? edit.edits : [edit]);

/**
 * A new edit (made `when.at`, epoch milliseconds, where the page knows it): added after the
 * others, its outlines at six decimals; what was undone is forgotten. An outline edit of the
 * region the last edit reshaped, within `SAME_STEP_MS` of it, takes that edit's place (one step
 * of undo for one drag). Beyond `MAX_UNDO_STEPS` the two oldest steps become one.
 */
export function record(state: EditState, edit: Edit, when?: { at: number }): EditState {
  const at = when?.at;
  const made = normalised(edit);
  const numbers = madeKeys(made).flatMap((key) => (isNewKey(key) ? [Number(key.slice(1))] : []));
  const last = state.edits[state.edits.length - 1];
  const sameStep =
    made.kind === 'outline' &&
    last?.kind === 'outline' &&
    last.key === made.key &&
    at !== undefined &&
    state.recordedAt !== undefined &&
    at - state.recordedAt <= SAME_STEP_MS;
  let edits = sameStep
    ? [...state.edits.slice(0, -1), { ...last, outline: made.outline }]
    : [...state.edits, made];
  if (edits.length > MAX_UNDO_STEPS) {
    const [oldest, second, ...rest] = edits as [Edit, Edit, ...Edit[]];
    edits = [{ kind: 'batch', edits: [...stepEdits(oldest), ...stepEdits(second)] }, ...rest];
  }
  return {
    edits,
    undone: [],
    next: Math.max(state.next, ...numbers.map((n) => n + 1)),
    ...(at === undefined ? {} : { recordedAt: at }),
  };
}

/** The last edit undone; the very same state when there is none. */
export function undo(state: EditState): EditState {
  const last = state.edits[state.edits.length - 1];
  if (!last) return state;
  return { edits: state.edits.slice(0, -1), undone: [...state.undone, last], next: state.next };
}

/** The last undone edit made again; the very same state when there is none. */
export function redo(state: EditState): EditState {
  const last = state.undone[state.undone.length - 1];
  if (!last) return state;
  return { edits: [...state.edits, last], undone: state.undone.slice(0, -1), next: state.next };
}

/** What the staged edits make of the loaded regions. */
export interface Applied {
  /** The loaded regions in their order, then the new ones in the order they were made. */
  drafts: Draft[];
  /** The loaded regions changed by somebody else since they were first edited, by id. */
  conflicts: number[];
  /** The regions edited that the server no longer has, by id. */
  gone: number[];
}

const loadedDraft = (region: LoadedRegion): Draft => ({
  key: regionKey(region.id),
  regionId: region.id,
  channel: { id: region.channelId, name: region.name },
  description: null,
  outline: region.outline,
  removed: null,
  base: null,
});

/**
 * The regions as the edits leave them, applied in order to the regions loaded now. An edit of
 * a region the server no longer has does nothing; its region is `gone` until a `take-theirs`
 * drops it. A loaded region keeps its channel: `details` change only new regions.
 */
export function applyEdits(loaded: readonly LoadedRegion[], state: EditState): Applied {
  const drafts = new Map<string, Draft>(
    loaded.map((region) => [regionKey(region.id), loadedDraft(region)]),
  );
  const missing = new Map<string, boolean>();
  const byKey = new Map(loaded.map((region) => [regionKey(region.id), region]));
  const touch = (key: string, bases: Bases): Draft | undefined => {
    const draft = drafts.get(key);
    if (!draft) {
      if (/^r\d+$/.test(key)) missing.set(key, true);
      return undefined;
    }
    if (draft.regionId !== null) draft.base ??= bases[key] ?? null;
    return draft;
  };
  const apply = (edit: Edit): void => {
    switch (edit.kind) {
      case 'add':
        drafts.set(edit.key, {
          key: edit.key,
          regionId: null,
          channel: edit.channel,
          description: edit.description,
          outline: edit.outline,
          removed: null,
          base: null,
        });
        return;
      case 'outline': {
        const draft = touch(edit.key, edit.bases);
        if (draft) draft.outline = edit.outline;
        return;
      }
      case 'details': {
        const draft = drafts.get(edit.key);
        if (draft && draft.regionId === null) {
          draft.channel = edit.channel;
          draft.description = edit.description;
        }
        return;
      }
      case 'remove': {
        const draft = touch(edit.key, edit.bases);
        if (!draft) return;
        if (draft.regionId === null) drafts.delete(edit.key);
        else draft.removed = edit.forum;
        return;
      }
      case 'restore': {
        const draft = touch(edit.key, edit.bases);
        if (draft) draft.removed = null;
        return;
      }
      case 'split': {
        const draft = touch(edit.key, edit.bases);
        if (!draft) return;
        draft.outline = edit.keep;
        drafts.set(edit.newKey, {
          key: edit.newKey,
          regionId: null,
          channel: null,
          description: null,
          outline: edit.other,
          removed: null,
          base: null,
        });
        return;
      }
      case 'swap': {
        const a = touch(edit.a, edit.bases);
        const b = touch(edit.b, edit.bases);
        if (a && b) [a.outline, b.outline] = [b.outline, a.outline];
        return;
      }
      case 'take-theirs': {
        missing.set(edit.key, false);
        const region = byKey.get(edit.key);
        if (region) drafts.set(edit.key, { ...loadedDraft(region), base: edit.version });
        return;
      }
      case 'keep-mine': {
        const draft = drafts.get(edit.key);
        if (draft) draft.base = edit.version;
        return;
      }
      case 'batch':
        for (const inner of edit.edits) apply(inner);
        return;
    }
  };
  for (const edit of state.edits) apply(edit);
  const all = [...drafts.values()];
  // A region the server has as it is staged was saved (by a save whose answer never came):
  // no conflict, and nothing to send.
  const conflicts = all.flatMap((draft) => {
    const region = draft.regionId === null ? undefined : byKey.get(draft.key);
    if (!region || draft.base === null || draft.base === region.version) return [];
    const saved =
      draft.removed === null && regionVersion(draft.outline, region.description) === region.version;
    return saved ? [] : [region.id];
  });
  const gone = [...missing]
    .filter(([, isMissing]) => isMissing)
    .map(([key]) => Number(key.slice(1)))
    .sort((a, b) => a - b);
  return {
    drafts: [
      ...all.filter((draft) => draft.regionId !== null),
      ...all.filter((draft) => draft.regionId === null),
    ],
    conflicts,
    gone,
  };
}

/** An outline as a save sends it: `[lat, lon]` at six decimals. */
export const toPoints = (outline: readonly LatLon[]): Point[] =>
  outline.map(({ lat, lon }) => [roundSix(lat), roundSix(lon)]);

/** Points as places. */
export const toLatLons = (points: readonly Point[]): LatLon[] =>
  points.map(([lat, lon]) => ({ lat, lon }));

/** Whether a draft of a loaded region has another outline than the region has on the server. */
export function outlineChanged(draft: Draft, region: LoadedRegion): boolean {
  return (
    draft.outline !== null && regionVersion(draft.outline, region.description) !== region.version
  );
}

/**
 * What a save of the drafts sends (spec 4.5): the changed outlines of loaded regions, the new
 * regions, and the removals, each loaded region with the version its first edit saw (or the
 * one it has, when it was never edited). A new region without a channel is not sent: it is
 * named in `missingChannel`, and Save waits for it.
 */
export function saveRequest(
  loaded: readonly LoadedRegion[],
  drafts: readonly Draft[],
): { request: SaveRequest; missingChannel: string[] } {
  const byId = new Map(loaded.map((region) => [region.id, region]));
  const request: SaveRequest = { changes: [], additions: [], removals: [] };
  const missingChannel: string[] = [];
  for (const draft of drafts) {
    const region = draft.regionId === null ? undefined : byId.get(draft.regionId);
    if (region) {
      const version = draft.base ?? region.version;
      if (draft.removed !== null) {
        request.removals.push({ regionId: region.id, forum: draft.removed, version });
      } else if (draft.outline !== null && outlineChanged(draft, region)) {
        request.changes.push({ regionId: region.id, outline: toPoints(draft.outline), version });
      }
      continue;
    }
    if (draft.regionId !== null || draft.removed !== null || draft.outline === null) continue;
    if (draft.channel === null) {
      missingChannel.push(draft.key);
      continue;
    }
    request.additions.push({
      channel: 'id' in draft.channel ? { id: draft.channel.id } : { name: draft.channel.create },
      description: draft.description,
      outline: toPoints(draft.outline),
    });
  }
  return { request, missingChannel };
}

/** The name a draft goes by: its channel's, the name of the channel to create, or none yet. */
export function draftName(draft: Draft): string | undefined {
  if (draft.channel === null) return undefined;
  return 'id' in draft.channel ? draft.channel.name : draft.channel.create;
}

/**
 * The staged edits left after a save, full or partial (spec 6): the drafts as they were, against
 * the regions the server has now. What it has as the draft has it (an outline saved, a region
 * removed, a new region whose channel now has it) is no longer staged; the rest is, against the
 * versions its regions had when they were first edited (so that what somebody else changed
 * meanwhile is a conflict). Undo starts afresh.
 */
export function rebaseAfterSave(
  drafts: readonly Draft[],
  loaded: readonly LoadedRegion[],
  state: EditState,
): EditState {
  const byId = new Map(loaded.map((region) => [region.id, region]));
  const edits: Edit[] = [];
  for (const draft of drafts) {
    if (draft.regionId !== null) {
      const region = byId.get(draft.regionId);
      if (!region) continue;
      // Against the version it was first edited from: a region somebody else changed since is
      // a conflict, never overwritten unseen.
      const bases = { [draft.key]: draft.base ?? region.version };
      if (draft.removed !== null) {
        edits.push({ kind: 'remove', key: draft.key, forum: draft.removed, bases });
      } else if (draft.outline !== null && outlineChanged(draft, region)) {
        edits.push({ kind: 'outline', key: draft.key, outline: draft.outline, bases });
      }
      continue;
    }
    if (draft.outline === null || draft.removed !== null) continue;
    const { channel } = draft;
    const saved = loaded.some(
      (region) =>
        channel !== null &&
        ('id' in channel
          ? region.channelId === channel.id
          : channelKey(region.name) === channelKey(channel.create)) &&
        regionVersion(draft.outline, region.description) === region.version,
    );
    if (saved) continue;
    edits.push({
      kind: 'add',
      key: draft.key,
      outline: draft.outline,
      channel: draft.channel,
      description: draft.description,
    });
  }
  return { edits, undone: [], next: state.next };
}

/**
 * The areas of a KML file as one staged edit (`readKml` gave them): an area named after a
 * region shown (by the rule of `/region import`, `channelKey`) reshapes it; one named after a
 * text channel that is no region yet makes that channel a region; any other makes a new region
 * of a new channel of its name, in the category its description names (as `/region import`
 * would create it; cut to `MAX_NEW_CATEGORY`). New regions are numbered from `state.next`.
 */
export function kmlEdit(
  areas: readonly KmlArea[],
  loaded: readonly LoadedRegion[],
  drafts: readonly Draft[],
  channels: readonly { id: string; name: string }[],
  state: EditState,
): Edit {
  const versions = new Map(loaded.map((region) => [regionKey(region.id), region.version]));
  const edits: Edit[] = [];
  let next = state.next;
  for (const area of areas) {
    const wanted = channelKey(area.name);
    const draft =
      wanted === ''
        ? undefined
        : drafts.find((one) => one.removed === null && channelKey(draftName(one) ?? '') === wanted);
    if (draft) {
      const version = versions.get(draft.key);
      edits.push({
        kind: 'outline',
        key: draft.key,
        outline: area.outline,
        bases: version === undefined ? {} : { [draft.key]: version },
      });
      continue;
    }
    const channel =
      wanted === '' ? undefined : channels.find((one) => channelKey(one.name) === wanted);
    edits.push({
      kind: 'add',
      key: newKey(next++),
      outline: area.outline,
      channel: channel
        ? { id: channel.id, name: channel.name }
        : wanted === ''
          ? null
          : { create: area.name },
      description: channel ? null : categoryCut(area.description),
    });
  }
  return { kind: 'batch', edits };
}

/**
 * What the editor shows, as the areas of a KML file (spec 4.7, `writeKml`): the regions not
 * staged for removal that have an outline, each named after its channel (a new one after the
 * channel it will create), described by its category, as `/region export` writes them.
 */
export function exportAreas(
  loaded: readonly LoadedRegion[],
  drafts: readonly Draft[],
): Pick<KmlArea, 'name' | 'description' | 'outline'>[] {
  const byId = new Map(loaded.map((region) => [region.id, region]));
  return drafts.flatMap((draft, index) => {
    if (draft.removed !== null || draft.outline === null) return [];
    const region = draft.regionId === null ? undefined : byId.get(draft.regionId);
    return [
      {
        name: draftName(draft) ?? `New region ${index + 1}`,
        description: region ? region.category : draft.description,
        outline: draft.outline,
      },
    ];
  });
}
