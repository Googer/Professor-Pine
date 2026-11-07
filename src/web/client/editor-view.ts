import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { KmlProblem } from '@pine/wayspot-core/kml';
import { tidyOutline, type OutlineProblem } from '@pine/wayspot-core/outline';
import { containment } from '@pine/wayspot-core/region-membership';
import {
  saveRequest,
  type ChannelChoice,
  type Draft,
  type EditState,
  type LoadedRegion,
} from '../../domain/regions/edits.js';
import type { Landing } from '../../domain/regions/fix-all.js';
import {
  FIX_REACH_METRES,
  type FixChoice,
  type FixRefusal,
  type PieceFix,
} from '../../domain/regions/fix.js';
import { channelKey } from '../../domain/regions/region-import.js';
import type { EditorData, SaveAnswer } from '../../domain/web/editor-data.js';
import { distanceWords, type DistanceUnits } from './distance.js';
import type { MapView } from './editor-mount.js';

/**
 * What the region editor's page shows of the staged regions (plan 8M-2), as pure functions the
 * page draws with: gym counts and the places in no region, labels, which outlines cannot be
 * saved and why Save is off, the lines of the overlaps and gaps, the channels a new region may
 * take. Tested without a browser.
 */

/** `1 gym`, `2 gyms`. */
export const count = (n: number, singular: string, plural = `${singular}s`): string =>
  `${n} ${n === 1 ? singular : plural}`;

/** The regions of the editor's data as the staged edits take them. */
export function loadedRegions(data: EditorData): LoadedRegion[] {
  return data.regions.map((region) => ({
    id: region.id,
    channelId: region.channelId,
    name: region.name,
    category: region.category,
    description: region.description,
    outline: region.outline && region.outline.map(([lat, lon]) => ({ lat, lon })),
    version: region.version,
  }));
}

/** The outlines of the drafts that count (not staged for removal), as tests of places. */
function containers(drafts: readonly Draft[]): { key: string; contains: (p: LatLon) => boolean }[] {
  return drafts.flatMap((draft) =>
    draft.removed === null && draft.outline !== null && draft.outline.length >= 4
      ? [{ key: draft.key, contains: containment(draft.outline) }]
      : [],
  );
}

/** How many gyms each region holds, and which gyms and Wayspots lie in none (by index). */
export interface PlaceCounts {
  gyms: Map<string, number>;
  /** Indexes into `EditorData.gyms`. */
  outsideGyms: number[];
  /** Indexes into `EditorData.wayspots`. */
  outsideWayspots: number[];
}

/** The gyms in each staged region, and the gyms and Wayspots in none (spec 4.1, 4.2a). */
export function placeCounts(
  drafts: readonly Draft[],
  data: Pick<EditorData, 'gyms' | 'wayspots'>,
): PlaceCounts {
  const tests = containers(drafts);
  const gyms = new Map(tests.map(({ key }) => [key, 0]));
  const outsideGyms: number[] = [];
  data.gyms.forEach(([, lat, lon], index) => {
    let inside = false;
    for (const test of tests) {
      if (!test.contains({ lat, lon })) continue;
      inside = true;
      gyms.set(test.key, (gyms.get(test.key) ?? 0) + 1);
    }
    if (!inside) outsideGyms.push(index);
  });
  const outsideWayspots: number[] = [];
  data.wayspots.forEach(([, lat, lon], index) => {
    if (!tests.some((test) => test.contains({ lat, lon }))) outsideWayspots.push(index);
  });
  return { gyms, outsideGyms, outsideWayspots };
}

/**
 * A place the editor draws (plan 8M-11C, S30): `id` is its index in the data's own list
 * (`EditorData.gyms` for a gym, `EditorData.wayspots` for the rest), the index `placeCounts`
 * names the places in no region by.
 */
export interface EditorPlace {
  id: number;
  lat: number;
  lon: number;
  name: string;
}

/** The layers of places the editor clusters, as its layer switch names them. */
export type PlaceLayer = 'gyms' | 'stops' | 'powerspots' | 'wayfarerGyms';

/** The data's places by the layer that draws them (S30). */
export function placeLayers(
  data: Pick<EditorData, 'gyms' | 'wayspots'>,
): Record<PlaceLayer, EditorPlace[]> {
  const layers: Record<PlaceLayer, EditorPlace[]> = {
    gyms: data.gyms.map(([, lat, lon, name], id) => ({ id, lat, lon, name })),
    stops: [],
    powerspots: [],
    wayfarerGyms: [],
  };
  data.wayspots.forEach(([kind, lat, lon, name], id) => {
    const layer = kind === 'stop' ? 'stops' : kind === 'powerspot' ? 'powerspots' : 'wayfarerGyms';
    layers[layer].push({ id, lat, lon, name });
  });
  return layers;
}

/**
 * Whether a cluster's ring is drawn in the warning color (S30): one of its places lies in no
 * region (`outside`, by the places' `id`s of one list).
 */
export function clusterWarns(
  points: readonly { id: number }[],
  outside: ReadonlySet<number>,
): boolean {
  return points.some((point) => outside.has(point.id));
}

/** How a region is named on the page: `#west`, or what a new one takes or makes. */
export function draftLabel(draft: Draft): string {
  const { channel } = draft;
  if (draft.regionId !== null) return channel && 'id' in channel ? `#${channel.name}` : 'region';
  if (channel === null) return 'new region (no channel yet)';
  return 'id' in channel ? `new region #${channel.name}` : `new channel ${channel.create}`;
}

/** Why an outline cannot be a region's, in words after "its outline …". */
export function outlineProblemWords(problem: OutlineProblem): string {
  switch (problem.kind) {
    case 'not-a-number':
    case 'out-of-range':
      return 'its outline has a corner that is no place on earth';
    case 'too-few':
      return 'its outline has fewer than three corners';
    case 'too-many':
      return `its outline has ${problem.corners} corners, more than 5,000`;
    case 'crosses-itself':
      return 'its outline crosses or touches itself';
  }
}

/** The staged regions whose outlines cannot be saved (`tidyOutline`), with why. */
export function outlineProblems(drafts: readonly Draft[]): Map<string, string> {
  const problems = new Map<string, string>();
  for (const draft of drafts) {
    if (draft.removed !== null || draft.outline === null) continue;
    const tidy = tidyOutline(draft.outline);
    if (!tidy.ok) problems.set(draft.key, outlineProblemWords(tidy.problem));
  }
  return problems;
}

/**
 * The text channels a new region may take: those of the server that are no region, less those
 * another staged region has taken.
 */
export function channelChoices(
  channels: EditorData['channels'],
  drafts: readonly Draft[],
  key: string,
): EditorData['channels'] {
  const taken = new Set(
    drafts.flatMap((draft) =>
      draft.key !== key && draft.removed === null && draft.channel && 'id' in draft.channel
        ? [draft.channel.id]
        : [],
    ),
  );
  return channels.filter((channel) => !taken.has(channel.id));
}

/**
 * Why a new channel cannot have this name, as the server refuses it (`planSave`): it gives no
 * channel name, or the server has a channel of the name (`channelKey`), which a new region
 * takes from the list when it is no region yet. Undefined when it may. The page knows the text
 * channels that are no region and those of the regions; a forum of the name the server refuses.
 */
export function newChannelProblem(
  name: string,
  channels: EditorData['channels'],
  loaded: readonly LoadedRegion[],
): string | undefined {
  const key = channelKey(name);
  if (key === '') return 'That name gives no channel name: use letters or digits.';
  const listed = channels.find((channel) => channelKey(channel.name) === key);
  if (listed) return `#${listed.name} exists: pick it from the list.`;
  const region = loaded.find((one) => channelKey(one.name) === key);
  if (region) return `#${region.name} exists already: pick another name.`;
  return undefined;
}

/**
 * A new region's channel picker as it is being filled in (spec 4.2): its list's value (`''`
 * none, `id:<channel id>`, `new`), the name and category typed, and why the name is refused.
 * The page keeps it while the panel is drawn anew, so that nothing typed is lost and a refusal
 * stays to be read.
 */
export interface PickerState {
  /** The staged region it is of. */
  key: string;
  choice: string;
  name: string;
  category: string;
  refusal: string | undefined;
}

/** The picker of a region as it is shown: as it was being filled in, or as the region has it. */
export function pickerShown(kept: PickerState | undefined, draft: Draft): PickerState {
  if (kept?.key === draft.key) return kept;
  const { channel } = draft;
  return {
    key: draft.key,
    choice: channel === null ? '' : 'id' in channel ? `id:${channel.id}` : 'new',
    name: channel && 'create' in channel ? channel.create : '',
    category: draft.description ?? '',
    refusal: undefined,
  };
}

/**
 * What a change of the picker comes to: the picker as it is now, and the channel and category
 * to record for the region (a `details` edit). A name typed that the server would refuse
 * (`newChannelProblem`) puts the refusal in the picker and stages no channel: the one the region
 * had (`staged`, a name typed before or a channel of the list) is taken off, so that what Save
 * would send is never a name the picker no longer shows; nothing is recorded when it had none.
 * `choices` are the channels the list offers (`channelChoices`).
 */
export function pickerChange(
  state: PickerState,
  staged: ChannelChoice | null,
  choices: EditorData['channels'],
  channels: EditorData['channels'],
  loaded: readonly LoadedRegion[],
): {
  state: PickerState;
  details: { channel: ChannelChoice | null; description: string | null } | undefined;
} {
  const shown = { ...state, refusal: undefined };
  if (state.choice.startsWith('id:')) {
    const id = state.choice.slice(3);
    const found = choices.find((one) => one.id === id);
    return {
      state: shown,
      details: { channel: found ? { id: found.id, name: found.name } : null, description: null },
    };
  }
  if (state.choice !== 'new')
    return { state: shown, details: { channel: null, description: null } };
  const description = state.category.trim() === '' ? null : state.category.trim();
  const name = state.name.trim();
  if (name === '') return { state: shown, details: { channel: null, description } };
  const refusal = newChannelProblem(name, channels, loaded);
  if (refusal !== undefined) {
    return {
      state: { ...state, refusal },
      details: staged === null ? undefined : { channel: null, description },
    };
  }
  return { state: shown, details: { channel: { create: name }, description } };
}

/**
 * The body a save of the drafts sends (`saveRequest`), as text: Save sends exactly the body its
 * preview was of, and previews again when the drafts give another.
 */
export const saveBody = (loaded: readonly LoadedRegion[], drafts: readonly Draft[]): string =>
  JSON.stringify(saveRequest(loaded, drafts).request);

/**
 * What came back of a preview or a save: an `answer` of the server; a request it `refused`
 * before doing anything (a 4xx or 503 with its words); or an answer whose outcome is `unknown`
 * (a failure on the way, an answer cut off or of no kind the page knows): a save may have been
 * done then.
 */
export type ReadAnswer =
  { kind: 'answer'; answer: SaveAnswer } | { kind: 'refused'; text: string } | { kind: 'unknown' };

const ANSWER_KINDS: ReadonlySet<unknown> = new Set([
  'preview',
  'saved',
  'refused',
  'conflicts',
  'stale',
]);
/** The statuses of a refusal before anything is done (`editorRoutes`, the guards). */
const REFUSALS: ReadonlySet<number> = new Set([400, 401, 403, 404, 413, 415, 429, 503]);

/** Reads what came back of a preview or a save by its status and its text. */
export function readSaveAnswer(status: number, text: string): ReadAnswer {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { kind: 'unknown' };
  }
  if (typeof body !== 'object' || body === null) return { kind: 'unknown' };
  if ((status === 200 || status === 409 || status === 422) && 'kind' in body) {
    return ANSWER_KINDS.has(body.kind)
      ? { kind: 'answer', answer: body as SaveAnswer }
      : { kind: 'unknown' };
  }
  if (REFUSALS.has(status) && 'error' in body && typeof body.error === 'string') {
    return { kind: 'refused', text: body.error };
  }
  return { kind: 'unknown' };
}

/**
 * What the page adds to an outcome it shows when the regions cannot be loaded after it: the
 * outcome is shown all the same, with what to do.
 */
export function reloadFailedLine(after: 'saved' | 'conflicts'): string {
  return after === 'saved'
    ? 'Reload the page to see the regions as saved.'
    : 'Reload the page to see the regions as they are now.';
}

/** What decides whether Save is offered. */
export interface ReadinessInput {
  readOnly: boolean;
  /** Whether anything is staged that a save would send. */
  changes: boolean;
  /** `outlineProblems`. */
  problems: ReadonlyMap<string, string>;
  /** New regions without a channel (`saveRequest`). */
  missingChannel: readonly string[];
  /** Regions changed or removed by somebody else, not yet resolved. */
  conflicts: number;
  /** The overlaps and gaps the staged edits make. */
  fresh: { overlaps: number; gaps: number };
  /** Whether the overlaps and gaps of the last edit are still being worked out. */
  checking: boolean;
  /**
   * Whether the page cannot work them out (its worker failed to load or to cut the outlines):
   * Save then waits for nothing, and the server's own check refuses what is new.
   */
  checkFailed?: boolean;
}

/**
 * What the editor draws that a sentence of its panel refers to (plan 8M-10, C10): a sentence
 * names no color, and a small swatch of what is drawn (`swatch-<name>` of `editor.css`, colored
 * by `theme.css`) stands beside it.
 */
export type Swatch = 'broken' | 'outside' | 'theirs';

/** A sentence of the panel, with the swatch of what it refers to on the map. */
export interface Swatched {
  text: string;
  swatch?: Swatch;
}

/** Whether Save is offered, and every reason it is not. */
export function saveReadiness(input: ReadinessInput): { ready: boolean; reasons: Swatched[] } {
  const reasons: Swatched[] = [];
  const say = (text: string): void => {
    reasons.push({ text });
  };
  if (input.readOnly) say('Discord cannot be reached just now, so the editor is read-only.');
  if (!input.changes) say('There are no changes to save.');
  if (input.problems.size > 0) {
    reasons.push({
      text: `${count(input.problems.size, 'outline')} cannot be saved.`,
      swatch: 'broken',
    });
  }
  if (input.missingChannel.length > 0) {
    say(
      `${count(input.missingChannel.length, 'new region')} ` +
        `${input.missingChannel.length === 1 ? 'has' : 'have'} no channel yet.`,
    );
  }
  if (input.conflicts > 0) {
    say(
      `${count(input.conflicts, 'region')} ${input.conflicts === 1 ? 'was' : 'were'} changed by ` +
        'somebody else: take theirs or keep yours.',
    );
  }
  const { overlaps, gaps } = input.fresh;
  if (overlaps + gaps > 0) {
    const made = [
      ...(overlaps > 0 ? [count(overlaps, 'new overlap')] : []),
      ...(gaps > 0 ? [count(gaps, 'new gap')] : []),
    ];
    say(`Your changes make ${made.join(' and ')}.`);
  }
  if (input.checking && input.checkFailed !== true) {
    say('The overlaps and gaps are being worked out.');
  }
  return { ready: reasons.length === 0, reasons };
}

/** The places in no region, beside their swatch; nothing when every place is in one. */
export function outsideLine(gyms: number, wayspots: number): Swatched | undefined {
  if (gyms + wayspots === 0) return undefined;
  return {
    text: `In no region: ${count(gyms, 'gym')}, ${count(wayspots, 'Wayspot')}.`,
    swatch: 'outside',
  };
}

/** A region somebody else changed: theirs is drawn beside the staged one, dashed. */
export function theirsLine(name: string): Swatched {
  return { text: `#${name}: theirs is drawn dashed.`, swatch: 'theirs' };
}

/** What the panel says when a check went through and found no overlap and no gap (note c). */
export const NO_PIECES = 'No overlaps or gaps.';

/** What the panel's section of overlaps and gaps shows now. */
export interface CoverageState {
  /** How many pieces the last check that went through found, and how many are overlaps. */
  pieces: number;
  overlaps: number;
  /** Whether the overlaps and gaps of the last edit are being worked out. */
  checking: boolean;
  /** Whether the last check (or the worker) failed. */
  checkFailed: boolean;
  /** Whether any check went through since the editor opened. */
  checked: boolean;
}

/**
 * The section's heading over the list of what the last check found (shown also while the next is
 * worked out), or "No overlaps or gaps." only after a check that went through and found none, not
 * while the next is worked out (C11); nothing when no check went through or the last failed.
 */
export function coverageSummary(
  state: CoverageState,
): { kind: 'list' | 'none'; text: string } | { kind: 'nothing' } {
  if (state.pieces > 0) {
    return {
      kind: 'list',
      text: `Overlaps (${state.overlaps}) and gaps (${state.pieces - state.overlaps})`,
    };
  }
  if (state.checking || state.checkFailed || !state.checked) return { kind: 'nothing' };
  return { kind: 'none', text: NO_PIECES };
}

/** What lies in an overlap or a gap, by kind. */
export interface PlaceKinds {
  gym: number;
  stop: number;
  powerspot: number;
  wayfarerGym: number;
}

/** An overlap or a gap as the page lists it. */
export interface ListedPiece {
  kind: 'overlap' | 'gap';
  area: number;
  between: [string, string] | null;
  /** Made by the staged edits (Save refuses it). */
  fresh: boolean;
  counts: PlaceKinds;
}

/** How many places lie in a piece, of every kind. */
const placesIn = ({ counts }: ListedPiece): number =>
  counts.gym + counts.stop + counts.powerspot + counts.wayfarerGym;

/**
 * The order of the list of overlaps and gaps: new ones first (Save refuses them), then the
 * largest; on the first open of a server's regions (nothing staged, spec 4.3) the worst first,
 * those with the most gyms, stops and power spots in them, then the largest.
 */
export function pieceOrder(worstFirst: boolean): (a: ListedPiece, b: ListedPiece) => number {
  return (a, b) =>
    Number(b.fresh) - Number(a.fresh) ||
    (worstFirst ? placesIn(b) - placesIn(a) : 0) ||
    b.area - a.area;
}

/** "New overlap of 1,234 m², #west and #east: 2 gyms, 1 stop". */
export function pieceLine(piece: ListedPiece, name: (key: string) => string): string {
  const what = piece.kind === 'overlap' ? 'overlap' : 'gap';
  const head = `${piece.fresh ? `New ${what}` : what === 'overlap' ? 'Overlap' : 'Gap'} of ${Math.round(
    piece.area,
  ).toLocaleString('en-US')} m²`;
  const between = piece.between ? `, ${name(piece.between[0])} and ${name(piece.between[1])}` : '';
  const { gym, stop, powerspot, wayfarerGym } = piece.counts;
  const inside = [
    ...(gym > 0 ? [count(gym, 'gym')] : []),
    ...(stop > 0 ? [count(stop, 'stop')] : []),
    ...(powerspot > 0 ? [count(powerspot, 'Power Spot')] : []),
    ...(wayfarerGym > 0 ? [count(wayfarerGym, 'Wayfarer gym')] : []),
  ];
  return `${head}${between}${inside.length > 0 ? `: ${inside.join(', ')}` : ''}`;
}

/** "#a and #b", "#a, #b and #c". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/** What a stretch of slivers is called (plan 8M-2F): between two regions, or where three meet. */
export function stretchTitle(sides: readonly string[][], name: (key: string) => string): string {
  const keys = sides.flat().map(name);
  return keys.length === 2 ? `The slivers between ${listed(keys)}` : `Where ${listed(keys)} meet`;
}

/** A choice of a fix, after "take": a side's border (or borders), or the midline. */
export function choiceWords(
  choice: FixChoice,
  sides: readonly string[][],
  name: (key: string) => string,
): string {
  if (choice === 'midline') return 'the midline';
  const keys = (sides[choice] ?? []).map(name);
  return keys.length === 1 ? `${keys[0] ?? ''}'s border` : `the borders of ${listed(keys)}`;
}

/** What the page calls a place: by its number, the gyms first, then the Wayspots. */
function placeWords(index: number, data: Pick<EditorData, 'gyms' | 'wayspots'>): string {
  const gym = data.gyms[index];
  if (gym) return `Gym #${gym[0]} “${gym[3]}”`;
  const wayspot = data.wayspots[index - data.gyms.length];
  if (!wayspot) return 'A place';
  const [kind, , , title] = wayspot;
  const what = kind === 'stop' ? 'Stop' : kind === 'powerspot' ? 'Power Spot' : 'Wayfarer gym';
  return `${what} “${title}”`;
}

/** "Gym #3092 “Library” ends up in #east." */
export function landingWords(
  landing: Landing,
  data: Pick<EditorData, 'gyms' | 'wayspots'>,
  name: (key: string) => string,
): string {
  const where = landing.key === null ? 'no region' : name(landing.key);
  return `${placeWords(landing.place, data)} ends up in ${where}.`;
}

/** What the page says when the worker could not work a fix out. */
export const FIX_FAILED_WORDS = 'I could not work this fix out: draw it by hand.';

/**
 * Why a piece or a choice cannot be fixed, in a sentence. A choice is worked out on the regions
 * as they are (of the last check, or as Fix all left them), so `stale` there means a border was
 * not found where the stretch lies: the arithmetic failed, nothing changed meanwhile.
 */
export function cannotFixWords(
  reason: Extract<PieceFix, { cannot: string }>['cannot'] | FixRefusal,
  units: DistanceUnits,
): string {
  switch (reason) {
    case 'too-wide':
      // The fix's reach in the settings' units (review fix 8).
      return `Its borders lie more than ${distanceWords(FIX_REACH_METRES, units)} apart: draw it by hand.`;
    case 'tangled':
      return 'This is not a sliver between two or three regions: draw it by hand.';
    case 'stale':
      return FIX_FAILED_WORDS;
    case 'corner-outside':
      return 'The corner must stay inside the sliver.';
    case 'crosses-itself':
      return 'An outline would cross itself: draw it by hand.';
    case 'too-many-corners':
      return 'An outline would have more than 5,000 corners: draw it by hand.';
    case 'new-pieces':
      return 'That would make a new overlap or gap: draw it by hand.';
  }
}

/**
 * What Fix all did, in a sentence: fixed, skipped, refused, and taken back at its end
 * (together they would make an overlap or gap the regions as loaded lack).
 */
export function fixAllWords(fixed: number, skipped: number, refused: number, undone = 0): string {
  const parts = [
    ...(fixed > 0 ? [`Fixed ${count(fixed, 'stretch', 'stretches')}`] : []),
    ...(skipped > 0 ? [`left ${skipped} as ${skipped === 1 ? 'it was' : 'they were'}`] : []),
    ...(refused > 0
      ? [
          `${refused} could not be fixed automatically: draw ${refused === 1 ? 'it' : 'them'} by hand`,
        ]
      : []),
    ...(undone > 0
      ? [
          `${undone} taken back, as ${undone === 1 ? 'it' : 'they'} would make a new overlap or gap: draw ${undone === 1 ? 'it' : 'them'} by hand`,
        ]
      : []),
  ];
  if (parts.length === 0) return 'Nothing was fixed.';
  const text = parts.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/**
 * The choice a fix shows after an answer of the worker: after a drag of the corner where three
 * regions meet, the midline, refused or not (its refusal is shown under it, and Apply is off);
 * else the one shown before while it can be made, the midline when it can, or the first that can.
 */
export function fixPick(
  options: readonly { choice: FixChoice; ok: boolean }[],
  shown: FixChoice | undefined,
  dragged: boolean,
): FixChoice | undefined {
  if (dragged) return 'midline';
  if (options.some((option) => option.ok && option.choice === shown)) return shown;
  return (
    options.find((option) => option.ok && option.choice === 'midline') ??
    options.find((option) => option.ok)
  )?.choice;
}

/**
 * How many answers of the worker a Fix still waits for after an event; only an answer that
 * leaves none to come is shown, and Apply waits until none is. Each request of its choices
 * counts one; a drag of the corner where three regions meet counts from its start (its request
 * is sent when it ends), so that no answer to a drag before redraws the marker being dragged.
 */
export function fixWaiting(
  waiting: number,
  event: 'asked' | 'drag-started' | 'drag-ended' | 'answered',
): number {
  switch (event) {
    case 'asked':
    case 'drag-started':
      return waiting + 1;
    case 'drag-ended':
      return waiting;
    case 'answered':
      return Math.max(0, waiting - 1);
  }
}

/** The margin round a stretch the map is fitted to, in pixels. */
const FIT_MARGIN = 40;
/** The room between the Fix box and the stretch, beside the control's own margin. */
const BOX_GAP = 16;

/**
 * The padding the map is fitted to a stretch with (plan 8M-10, C12): Fix… and Fix all slivers…
 * show in a box pinned over the map's top right corner, so the stretch is fitted into the part
 * of the map left of it; a narrow map keeps at least a third of its width for the stretch.
 */
export function fixBoxPadding(
  box: { width: number; height: number },
  map: { x: number; y: number },
): { topLeft: [number, number]; bottomRight: [number, number] } {
  const right =
    box.width > 0
      ? Math.round(Math.min(box.width + BOX_GAP + FIT_MARGIN, map.x - FIT_MARGIN - map.x / 3))
      : FIT_MARGIN;
  return {
    topLeft: [FIT_MARGIN, FIT_MARGIN],
    bottomRight: [Math.max(FIT_MARGIN, right), FIT_MARGIN],
  };
}

/**
 * Where a redraw of the Fix box puts the focus (branch review W3): never dropped to the page.
 * `question`: Fix all's question changed (re-review V3: under the same title and buttons it
 * would not be read out), its lead paragraph; `same-button`: the button of the words it was on;
 * `title`: its title (or first choice); `panel`: the editor's panel, the box closed with the focus
 * in it or lost; `keep`: left where it is, on a part of the page the member went to.
 */
export type FixFocus = 'question' | 'same-button' | 'title' | 'panel' | 'keep';

export function fixFocus(facts: {
  /** The box showed before the redraw. */
  wasShown: boolean;
  /** It shows after it. */
  shown: boolean;
  /** The focus was in it. */
  inside: boolean;
  /** The focus was in it, or on nothing (the page's body). */
  lost: boolean;
  /** Its title is the same as before. */
  sameTitle: boolean;
  /** A button of the words the focus was on is drawn again, and can be pressed. */
  sameButton: boolean;
  /** Fix all's question shown is another than the one shown before (or the first). */
  newQuestion: boolean;
}): FixFocus {
  if (!facts.shown) return facts.wasShown && facts.lost ? 'panel' : 'keep';
  if (facts.newQuestion && (facts.lost || !facts.wasShown)) return 'question';
  if (facts.wasShown && facts.inside && facts.sameTitle && facts.sameButton) return 'same-button';
  if (facts.wasShown && !facts.inside && facts.sameTitle) return 'keep';
  return 'title';
}

/**
 * Whether the page offers Fix and "Fix all slivers…": not to a member who may only look, nor
 * once the overlaps and gaps could not be worked out (a check failed, or the worker stopped
 * with an error), when the pieces listed may be those of the regions before.
 */
export const fixesOffered = (page: { readOnly: boolean; checkFailed: boolean }): boolean =>
  !page.readOnly && !page.checkFailed;

/** The region a region was split from, or that was split off it, by the last split of either. */
export function splitPartner(state: EditState, key: string): string | undefined {
  for (const edit of [...state.edits].reverse()) {
    if (edit.kind !== 'split') continue;
    if (edit.newKey === key) return edit.key;
    if (edit.key === key) return edit.newKey;
  }
  return undefined;
}

/** Where the editor's map is drawn first when the live map has no view to hand on. */
export const START_VIEW: MapView = { lat: 40.44, lon: -79.99, zoom: 11 };

/**
 * Where the editor's map is first drawn (branch review W2): at the live map's view; with none
 * (the live map could not be loaded, and its fallback view is not the server's), at
 * `START_VIEW`, then fitted to the editor's regions where it has any (as the editor's own page
 * opened before plan 8M-10).
 */
export function firstView(view: MapView | undefined): { view: MapView; fitRegions: boolean } {
  return view === undefined ? { view: START_VIEW, fitRegions: true } : { view, fitRegions: false };
}

/** Why a file cannot be read as KML, in a sentence (as `/region import` says it, shorter). */
export const KML_PROBLEMS: Readonly<Record<KmlProblem, string>> = {
  kmz: 'That is a KMZ file (a zipped KML): export as KML instead.',
  'not-xml': 'That file is not well-formed XML.',
  doctype: 'That file declares a document type (DOCTYPE), which I never read.',
  'too-deep': 'That file is nested deeper than any KML.',
  'not-kml': 'That file is XML, but not KML.',
  'no-areas': 'That file has no areas: draw each region as a shape.',
  'too-many-areas': 'That file has more than 200 areas.',
  'too-many-corners': 'The outlines of that file have more than 20,000 corners in all.',
};

/** Said of a file over the editor's limit (`MAX_KML_BYTES`). */
export const KML_TOO_LARGE =
  'That file is larger than 1 MB. Export only the layer with the regions.';

/** Said where the browser keeps nothing for the page. */
export const NO_STORAGE =
  'This browser does not keep unsaved changes: reloading the page loses them.';

/** A region marked for removal, beside its Restore, with what becomes of its forum. */
export const removalWords = (removed: 'keep' | 'delete'): string =>
  removed === 'delete'
    ? 'Removed when you save; its forum is deleted with it.'
    : 'Removed when you save; its forum stays.';

/** After a region's name in the list while it is marked for removal. */
export const REMOVAL_MARK = ' (removed when you save)';

/** What Fix all did, when it changed outlines: one edit, not saved yet. */
export const fixedAsOneWords = (words: string): string =>
  `${words} Not saved yet; one Undo takes it all back.`;

/** What a KML file loaded as one edit, and what of it could not be read. */
export function kmlLoadedWords(areas: number, skipped: number): string {
  const loaded = `Loaded ${count(areas, 'area')} of the file; not saved yet.`;
  return skipped > 0
    ? `${loaded} ${count(skipped, 'area')} could not be read (an outline that crosses itself, or several shapes).`
    : loaded;
}

/** Said when a save's answer was lost, after the regions were loaded again. */
export const OUTCOME_UNKNOWN =
  'I could not tell whether the save went through. Here are the regions as they are now.';

/** Said when a save's answer was lost and the regions could not be loaded again either. */
export const OUTCOME_UNKNOWN_RELOAD =
  'I could not tell whether the save went through, and could not load the regions again: ' +
  'reload the page in a moment.';

/** Said when the editor is opened again for another account than it was opened for (W6). */
export const ACCOUNT_CHANGED = 'You are logged in as someone else now: reload the page.';

/**
 * Whether an opening of the editor is refused (branch review W6): the editor's data now names
 * another member than the one it was first opened for (`kept`; none before a first opening), so
 * that the edits staged by one member are never shown or saved as another's.
 */
export function reopenRefusal(kept: string | undefined, userId: string): string | undefined {
  return kept !== undefined && kept !== userId ? ACCOUNT_CHANGED : undefined;
}

/**
 * Why a corner was not deleted with "Move shared corners together" on (plan 8M-11C, S32): a
 * region that has it (`name`, `draftLabel`) would be left with fewer than three corners.
 */
export const notDeletedWords = (name: string): string =>
  `Not deleted: ${name} would have fewer than three corners.`;

/**
 * Why a reshape was not staged (branch review BR-4): a corner dragged onto another of the same
 * outline, its own or a sharer's, would leave the region (`name`, `draftLabel`) without an area.
 */
export const notChangedWords = (name: string): string =>
  `Not changed: ${name} would have fewer than three corners.`;

/**
 * The line under the editor's tools (plan 8M-11C, S31): how many regions have changes that wait
 * in the browser (`regionsChanged`); nothing without any.
 */
export function unsavedLine(regions: number): string | undefined {
  if (regions === 0) return undefined;
  return regions === 1
    ? '1 region has unsaved changes. It waits here until you save or undo it.'
    : `${regions} regions have unsaved changes. They wait here until you save or undo them.`;
}

/** The name of an exported file: the server's name as letters, digits and hyphens, or its id. */
export function exportFileName(guild: { id: string; name: string }): string {
  const name = guild.name
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60);
  return `${name === '' ? guild.id : name}-regions.kml`;
}
