import type { LatLon } from '@pine/wayspot-core/lat-lon';
import {
  boxOf,
  containment,
  inBox,
  ringContains,
  type Box,
} from '@pine/wayspot-core/region-membership';
import {
  coverage,
  inPiece,
  newPieces,
  newProblems,
  type Coverage,
  type OverlapCache,
  type Outlined,
  type Piece,
} from './coverage.js';
import {
  findStretches,
  fixStretch,
  rebuildStretch,
  sideLine,
  type FixChoice,
  type FixOutcome,
  type FixRefusal,
  type Stretch,
} from './fix.js';

/**
 * "Fix all slivers" in the region editor (spec 4.3, plan 8M-2F): the midline for every stretch
 * whose midline moves no gym, stop or power spot into another region; a stretch where it would is
 * asked about, one at a time, naming where each place ends up under each choice. At the end,
 * the fixes that together made an overlap or gap the regions as loaded lack are taken back
 * (`fixAllFinish`). Pure: the page's worker keeps the state between the questions, and what was
 * fixed becomes one staged edit.
 */

/** A place that may change region: an index of the caller's, and where it is. */
export interface Place {
  index: number;
  lat: number;
  lon: number;
}

/**
 * A place whose region a fix changes (in its slivers or not), and where it ends up: a region
 * the fix changed that holds it after, else any region that does; none when no region does.
 */
export interface Landing {
  place: number;
  key: string | null;
}

/** A choice of a question: the outlines it makes and where each place ends up, or why not. */
export type FixOption =
  | { choice: FixChoice; ok: true; outlines: Outlined[]; landings: Landing[] }
  | { choice: FixChoice; ok: false; reason: FixRefusal; landings: Landing[] };

/** A stretch asked about: the places some choice moves, and the choices. */
export interface Question {
  stretch: Stretch;
  places: number[];
  options: FixOption[];
}

/**
 * Fix all between its questions: the regions as fixed so far, the places, the stretches still
 * to ask about with the places in their slivers or moved by their midline (found on the regions
 * after the others were fixed; `again`: found again after an answer moved a border of one,
 * never looked for again), the regions each fix changed (`log`, to take fixes back), and the
 * numbers of stretches fixed, skipped, refused (no choice could be made: "draw it by hand") and
 * taken back at the end (`fixAllFinish`).
 */
export interface FixAllState {
  regions: Outlined[];
  places: Place[];
  pending: { stretch: Stretch; places: number[]; again?: boolean }[];
  log: string[][];
  fixed: number;
  skipped: number;
  refused: number;
  undone: number;
}

/** How many times the stretches are found anew and fixed (a fix can move another's border). */
const MAX_ROUNDS = 6;

/** The choices in the order they are offered: either border, then the midline. */
const CHOICES: readonly FixChoice[] = [0, 1, 'midline'];

/** The regions with the outlines a fix rebuilt. */
function withOutlines(regions: readonly Outlined[], outlines: readonly Outlined[]): Outlined[] {
  const made = new Map(outlines.map((one) => [one.key, one.outline]));
  return regions.map((one) => {
    const outline = made.get(one.key);
    return outline ? { key: one.key, outline } : one;
  });
}

/** The places in a stretch's slivers (`pieces`: the overlaps, then the gaps it was found in). */
export function placesIn(
  stretch: Stretch,
  pieces: readonly Piece[],
  places: readonly Place[],
): number[] {
  return places
    .filter((place) =>
      stretch.slivers.some((sliver) => {
        const piece = pieces[sliver.piece];
        return piece !== undefined && inPiece(piece, place);
      }),
    )
    .map((place) => place.index);
}

/**
 * The box of what changed between two outlines of a region: the corners of either that the other
 * lacks, with their neighbours along the ring. A place whose side of the border changed lies in
 * it. Undefined when nothing changed.
 */
function changedBox(before: readonly LatLon[], after: readonly LatLon[]): Box | undefined {
  const cornerKey = ({ lat, lon }: LatLon): string => `${lat} ${lon}`;
  const changed: LatLon[] = [];
  const differing = (ring: readonly LatLon[], other: readonly LatLon[]): void => {
    const kept = new Set(other.map(cornerKey));
    const n = ring.length;
    ring.forEach((corner, i) => {
      if (kept.has(cornerKey(corner))) return;
      changed.push(corner, ring[(i + n - 1) % n]!, ring[(i + 1) % n]!);
    });
  };
  differing(before, after);
  differing(after, before);
  return changed.length > 0 ? boxOf(changed) : undefined;
}

/**
 * Every place whose region the outlines rebuilt change (`outlines`, against `regions`), and
 * where it ends up: only places in the boxes of what changed are tested.
 */
function landingsOf(
  regions: readonly Outlined[],
  outlines: readonly Outlined[],
  places: readonly Place[],
): Landing[] {
  const before = new Map(regions.map((one) => [one.key, one.outline]));
  const boxes = outlines.flatMap((one) => {
    const box = changedBox(before.get(one.key) ?? [], one.outline);
    return box ? [box] : [];
  });
  const tests = outlines.map((one) => ({
    key: one.key,
    was: containment(before.get(one.key) ?? []),
    is: containment(one.outline),
  }));
  const landings: Landing[] = [];
  for (const place of places) {
    if (!boxes.some((box) => inBox(box, place))) continue;
    if (tests.every((test) => test.was(place) === test.is(place))) continue;
    const key =
      tests.find((test) => test.is(place))?.key ??
      regions.find(
        (one) => !tests.some((test) => test.key === one.key) && ringContains(one.outline, place),
      )?.key ??
      null;
    landings.push({ place: place.index, key });
  }
  return landings;
}

/**
 * Every choice for a stretch (either border, then the midline; `corner`: where three regions
 * meet, for the midline), each checked (`fixStretch`), with every place among those given whose
 * region it changes.
 */
export function fixOptions(
  regions: readonly Outlined[],
  stretch: Stretch,
  places: readonly Place[],
  options: { corner?: LatLon; cache?: OverlapCache } = {},
): FixOption[] {
  return CHOICES.map((choice): FixOption => {
    const outcome: FixOutcome = fixStretch(regions, stretch, choice, options);
    if (!outcome.ok) return { choice, ok: false, reason: outcome.reason, landings: [] };
    return {
      choice,
      ok: true,
      outlines: outcome.outlines,
      landings: landingsOf(regions, outcome.outlines, places),
    };
  });
}

/** A stretch with its signature: its regions and its slivers' area, to know it again. */
const signature = (stretch: Stretch, pieces: readonly Piece[]): string =>
  `${stretch.sides.flat().join('/')}:${Math.round(
    stretch.slivers.reduce((sum, sliver) => sum + (pieces[sliver.piece]?.area ?? 0), 0),
  )}`;

/** The box of a stretch's slivers. */
const stretchBox = (stretch: Stretch): Box =>
  boxOf(stretch.slivers.flatMap((sliver) => sliver.sides.flatMap((side) => sideLine(side))));

/** The regions of a stretch, either side, as one key. */
const keysOf = (stretch: Stretch): string => stretch.sides.flat().sort().join('/');

const boxesMeet = (a: Box, b: Box): boolean =>
  a.south <= b.north && b.south <= a.north && a.west <= b.east && b.west <= a.east;

/**
 * Fix all, first part: the midline for every stretch whose midline moves no place into another
 * region, in rounds (each finds the stretches of the regions as fixed so far, so that a stretch
 * whose border the one before moved is found again); each round is checked for new overlaps and
 * gaps as a whole, and fix by fix when it made some. Then the stretches left: those with a place
 * in their slivers or one their midline moves are to be asked about, the others could not be
 * fixed (each counted once, however often it was tried).
 */
export function fixAllStart(
  regions: readonly Outlined[],
  places: readonly Place[],
  cache?: OverlapCache,
): FixAllState {
  let working = [...regions];
  let fixed = 0;
  const log: string[][] = [];
  // Stretches not to try again: refused, or moving a place (asked about at the end).
  const given = new Set<string>();
  const quiet = (outlines: readonly Outlined[]): boolean =>
    landingsOf(working, outlines, places).length === 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const found = coverage(working, cache);
    const pieces = [...found.overlaps, ...found.gaps];
    const tried = findStretches(working, found).stretches.filter(
      (stretch) =>
        !given.has(signature(stretch, pieces)) && placesIn(stretch, pieces, places).length === 0,
    );
    if (tried.length === 0) break;
    const before = working;
    const madeLog: string[][] = [];
    for (const stretch of tried) {
      const outcome = rebuildStretch(working, stretch, 'midline');
      if (outcome.ok && quiet(outcome.outlines)) {
        working = withOutlines(working, outcome.outlines);
        madeLog.push(outcome.outlines.map((one) => one.key));
      } else if (!outcome.ok && outcome.reason === 'stale') {
        // Its border was moved by a fix of this round: found again in the next.
      } else {
        given.add(signature(stretch, pieces));
      }
    }
    const problems = madeLog.length > 0 ? newProblems(before, working, cache) : undefined;
    if (problems && problems.overlaps.length + problems.gaps.length > 0) {
      // Fix by fix, each checked: those that make new pieces are refused.
      working = before;
      madeLog.length = 0;
      for (const stretch of tried) {
        if (given.has(signature(stretch, pieces))) continue;
        const outcome = fixStretch(working, stretch, 'midline', { cache });
        if (outcome.ok && quiet(outcome.outlines)) {
          working = withOutlines(working, outcome.outlines);
          madeLog.push(outcome.outlines.map((one) => one.key));
        } else if (outcome.ok || outcome.reason !== 'stale') {
          given.add(signature(stretch, pieces));
        }
      }
    }
    fixed += madeLog.length;
    log.push(...madeLog);
    // Nothing moved: what was stale stays so.
    if (madeLog.length === 0) break;
  }
  const found = coverage(working, cache);
  const pieces = [...found.overlaps, ...found.gaps];
  const pending: FixAllState['pending'] = [];
  let refused = 0;
  for (const stretch of findStretches(working, found).stretches) {
    const outcome = rebuildStretch(working, stretch, 'midline');
    const moved = outcome.ok ? landingsOf(working, outcome.outlines, places) : [];
    const inside = new Set([
      ...placesIn(stretch, pieces, places),
      ...moved.map((landing) => landing.place),
    ]);
    if (inside.size > 0) pending.push({ stretch, places: [...inside].sort((a, b) => a - b) });
    else refused++;
  }
  return {
    regions: working,
    places: [...places],
    pending,
    log,
    fixed,
    skipped: 0,
    refused,
    undone: 0,
  };
}

/**
 * The question of the next stretch still to ask about, its choices worked out on the regions
 * as fixed so far; a stretch for which no choice can be made is counted as refused and passed.
 * The question is undefined when none is left (the state then counts those refused last).
 */
export function nextQuestion(
  state: FixAllState,
  cache?: OverlapCache,
): { state: FixAllState; question: Question | undefined } {
  let { pending, refused } = state;
  while (pending.length > 0) {
    const [{ stretch, places: inside, again: foundAgain }, ...rest] = pending as [
      FixAllState['pending'][number],
      ...FixAllState['pending'],
    ];
    pending = rest;
    const options = fixOptions(state.regions, stretch, state.places, { cache });
    if (!foundAgain && options.some((option) => !option.ok && option.reason === 'stale')) {
      // An answer before moved a border of it: found again on the regions as they are now, by
      // its regions and where its slivers lie. Those found are not looked for again, and the
      // stretches waiting that they cover are dropped (each is asked about once): every turn
      // takes a stretch first found off the list, so the search ends.
      const found = coverage(state.regions, cache);
      const pieces = [...found.overlaps, ...found.gaps];
      const keys = keysOf(stretch);
      const box = stretchBox(stretch);
      const again = findStretches(state.regions, found).stretches.filter(
        (one) => keysOf(one) === keys && boxesMeet(stretchBox(one), box),
      );
      if (again.length > 0) {
        const boxes = again.map(stretchBox);
        pending = [
          ...again.map((one) => ({
            stretch: one,
            places: placesIn(one, pieces, state.places),
            again: true,
          })),
          ...pending.filter(
            (other) =>
              keysOf(other.stretch) !== keys ||
              !boxes.some((one) => boxesMeet(stretchBox(other.stretch), one)),
          ),
        ];
        continue;
      }
    }
    if (options.some((option) => option.ok)) {
      const named = new Set([
        ...inside,
        ...options.flatMap((option) => option.landings.map((landing) => landing.place)),
      ]);
      return {
        state: { ...state, pending, refused },
        question: { stretch, places: [...named].sort((a, b) => a - b), options },
      };
    }
    refused++;
  }
  return { state: { ...state, pending, refused }, question: undefined };
}

/** The regions after a question was answered with a choice, or skipped. */
export function answer(
  state: FixAllState,
  question: Question,
  choice: FixChoice | 'skip',
): FixAllState {
  const option = question.options.find((one) => one.choice === choice);
  if (choice === 'skip' || !option?.ok) return { ...state, skipped: state.skipped + 1 };
  return {
    ...state,
    regions: withOutlines(state.regions, option.outlines),
    log: [...state.log, option.outlines.map((one) => one.key)],
    fixed: state.fixed + 1,
  };
}

/**
 * Fix all's end: its fixes were each checked against the regions before them, but a save is
 * checked against the regions as loaded (`loaded`, their pieces). The pieces of the regions now
 * that are new against those and against the pieces Fix all started from (`start`: those are
 * the staged edits', not Fix all's) are looked for; the fixes that changed a region near one
 * are taken back (the region and every region a fix of it changed get their outlines of the
 * start again), until none is left.
 */
export function fixAllFinish(
  start: readonly Outlined[],
  state: FixAllState,
  loaded: Coverage,
  cache?: OverlapCache,
): FixAllState {
  if (state.log.length === 0) return state;
  const first = new Map(start.map((one) => [one.key, one.outline]));
  const began = coverage(start, cache);
  let { regions, log } = state;
  let undone = 0;
  for (;;) {
    const now = coverage(regions, cache);
    const made = [
      ...newPieces(newPieces(now.overlaps, loaded.overlaps), began.overlaps),
      ...newPieces(newPieces(now.gaps, loaded.gaps), began.gaps),
    ];
    if (made.length === 0) break;
    const back = new Set(
      regions
        .filter(
          (one) =>
            first.get(one.key) !== one.outline &&
            made.some((piece) => boxesMeet(piece.box, boxOf(one.outline))),
        )
        .map((one) => one.key),
    );
    if (back.size === 0) break;
    // Every fix of a region taken back is taken back whole, with the other regions it changed.
    let taken: string[][] = [];
    for (let grew = true; grew;) {
      grew = false;
      taken = log.filter((keys) => keys.some((key) => back.has(key)));
      for (const key of taken.flat()) {
        if (!back.has(key)) {
          back.add(key);
          grew = true;
        }
      }
    }
    undone += taken.length;
    log = log.filter((keys) => !keys.some((key) => back.has(key)));
    regions = regions.map((one) =>
      back.has(one.key) ? { key: one.key, outline: first.get(one.key) ?? one.outline } : one,
    );
  }
  return { ...state, regions, log, fixed: state.fixed - undone, undone };
}

/** The outlines Fix all changed, against the regions it started from, in their order. */
export function changedOutlines(regions: readonly Outlined[], state: FixAllState): Outlined[] {
  const before = new Map(regions.map((one) => [one.key, one.outline]));
  return state.regions.filter((one) => before.get(one.key) !== one.outline);
}
