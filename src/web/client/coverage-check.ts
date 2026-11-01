import type { LatLon } from '@pine/wayspot-core/lat-lon';
import {
  coverage,
  inPiece,
  newPieces,
  OverlapCache,
  type Coverage,
  type Outlined,
  type Piece,
} from '../../domain/regions/coverage.js';
import {
  answer,
  changedOutlines,
  fixAllFinish,
  fixAllStart,
  fixOptions,
  nextQuestion,
  placesIn,
  type FixAllState,
  type FixOption,
  type Landing,
  type Place,
  type Question,
} from '../../domain/regions/fix-all.js';
import {
  findStretches,
  proposedCorner,
  type FixChoice,
  type FixRefusal,
  type PieceFix,
  type Stretch,
  type Stretches,
} from '../../domain/regions/fix.js';
import type { Point } from '../../domain/web/editor-data.js';
import type { ListedPiece, PlaceKinds } from './editor-view.js';

/**
 * The overlaps and gaps of the region editor (spec 4.3), worked out in a worker of the page
 * (`editor-worker.ts`): at the size of a city that takes seconds, which the page must not
 * stand still for. The worker is told the regions as loaded and the places to count once
 * (`loaded`), then the staged regions after every edit (`check`); it answers every piece with
 * what lies in it, whether the edits made it (`newPieces` against the loaded ones) and whether
 * it can be fixed (`findStretches`, plan 8M-2F). Fixes are worked out here too, on the regions
 * of the last check: the choices for one stretch (`fix-options`), and Fix all with its
 * questions (`fix-all`, then `fix-all-answer` for each). A fix request is always answered, with
 * `failed` when the work threw, so that the page never waits for nothing.
 */

/** What kind of place lies in a piece: a gym of Pine's, or a kept Wayspot. */
export type PlaceKind = keyof PlaceKinds;

/**
 * A staged region as the worker is told it: its key, a version of its outline (the worker keeps
 * an outline it has seen, so that the overlaps of unchanged pairs are kept), its outline.
 */
export interface CoverageRegion {
  key: string;
  version: string;
  outline: Point[];
}

/**
 * What the page asks. `places` are numbered in the order given: a fix names them by that
 * number. `fix-options`: the choices of a stretch of the last check (`corner`, where three
 * regions meet, when dragged). `fix-all` and `fix-all-answer` carry the page's number of the
 * request (`ask`), which the answer repeats: the page takes only the answer to its last.
 * `fix-all-answer`: a choice for Fix all's question of that `question` number, `skip` it, or
 * `stop` with what was fixed so far; one for another question is ignored.
 */
export type CoverageRequest =
  | { kind: 'loaded'; regions: CoverageRegion[]; places: [PlaceKind, number, number][] }
  | { kind: 'check'; seq: number; regions: CoverageRegion[] }
  | { kind: 'fix-options'; seq: number; stretch: string; corner?: Point }
  | { kind: 'fix-all'; seq: number; ask: number }
  | {
      kind: 'fix-all-answer';
      seq: number;
      ask: number;
      question: number;
      choice: FixChoice | 'skip' | 'stop';
    };

/** A piece as the page shades and lists it, and whether it can be fixed. */
export interface ShownPiece extends ListedPiece {
  /** Its outer ring, then its holes. */
  rings: Point[][];
  fix: PieceFix;
}

/** An outline a fix rebuilt. */
export interface ShownOutline {
  key: string;
  outline: Point[];
}

/**
 * A stretch as the page shows it: its regions along each side, the places in its slivers and
 * those some choice moves into another region (beyond them too), the box of its slivers
 * (south-west and north-east), and where three regions meet (null for two, or when it is not
 * offered to be moved).
 */
export interface ShownStretch {
  id: string;
  sides: [string[], string[]];
  places: number[];
  box: [Point, Point];
  corner: Point | null;
}

/** A choice of a fix: the outlines it rebuilds and where each place ends up, or why not. */
export interface ShownOption {
  choice: FixChoice;
  ok: boolean;
  reason: FixRefusal | null;
  outlines: ShownOutline[];
  landings: Landing[];
}

/**
 * What the worker answers. `check`: the pieces of one check, `failed` when polyclip could not
 * cut the outlines. `fix-options`: the choices of a stretch, none when the last check has no
 * such stretch, or `failed`. `fix-all`: how far Fix all is, with its next question (numbered),
 * or none when it is done (then `outlines`: everything it changed, to be staged as one edit;
 * `skipped` counts the questions left when it was stopped, `undone` the fixes taken back at
 * its end), or `failed` (nothing staged).
 */
export type CoverageAnswer =
  | { kind: 'check'; seq: number; pieces: ShownPiece[]; failed: boolean }
  | {
      kind: 'fix-options';
      seq: number;
      stretch: ShownStretch | null;
      options: ShownOption[];
      failed: boolean;
    }
  | {
      kind: 'fix-all';
      seq: number;
      ask: number;
      failed: boolean;
      fixed: number;
      skipped: number;
      refused: number;
      undone: number;
      question: { number: number; stretch: ShownStretch; options: ShownOption[] } | null;
      outlines: ShownOutline[];
    };

/** The work of a fix, as the worker does it (a test gives one that fails). */
export interface FixWork {
  findStretches: typeof findStretches;
  fixOptions: typeof fixOptions;
  fixAllStart: typeof fixAllStart;
  nextQuestion: typeof nextQuestion;
  answer: typeof answer;
  fixAllFinish: typeof fixAllFinish;
}

const toPoint = ({ lat, lon }: LatLon): Point => [lat, lon];
const toLatLon = ([lat, lon]: Point): LatLon => ({ lat, lon });

/** A stretch as the page shows it, boxed by the sides of its slivers. */
function shownStretch(
  stretch: Stretch,
  places: number[],
  corner: LatLon | undefined,
): ShownStretch {
  const corners = stretch.slivers.flatMap((sliver) =>
    sliver.sides.flat().flatMap((chain) => chain.points),
  );
  const lats = corners.map((one) => one.lat);
  const lons = corners.map((one) => one.lon);
  return {
    id: stretch.id,
    sides: stretch.sides,
    places,
    box: [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ],
    corner: corner ? toPoint(corner) : null,
  };
}

const shownOptions = (options: readonly FixOption[]): ShownOption[] =>
  options.map((option) => ({
    choice: option.choice,
    ok: option.ok,
    reason: option.ok ? null : option.reason,
    outlines: option.ok
      ? option.outlines.map(({ key, outline }) => ({ key, outline: outline.map(toPoint) }))
      : [],
    landings: option.landings,
  }));

/** The places in the slivers and those some choice moves, in order. */
const namedPlaces = (inside: readonly number[], options: readonly FixOption[]): number[] =>
  [
    ...new Set([
      ...inside,
      ...options.flatMap((option) => option.landings.map((landing) => landing.place)),
    ]),
  ].sort((a, b) => a - b);

/** The worker's state: the loaded pieces, the places, the outlines seen, the last check. */
export class CoverageChecker {
  private loaded: Coverage | undefined;
  /** The places in the order the page numbered them. */
  private places: (Place & { kind: PlaceKind })[] = [];
  /** The same, sorted by latitude, for counting. */
  private byLatitude: (Place & { kind: PlaceKind })[] = [];
  private readonly outlines = new Map<string, { version: string; outline: LatLon[] }>();
  private readonly cache = new OverlapCache();
  private readonly work: FixWork;
  /** The regions, pieces and stretches of the last check. */
  private last: { regions: Outlined[]; pieces: Piece[]; stretches: Stretch[] } | undefined;
  /**
   * Fix all between its questions: the regions it began with, how far it is, the question
   * asked and its number.
   */
  private fixingAll:
    | { start: Outlined[]; state: FixAllState; question: Question | undefined; number: number }
    | undefined;
  /** How many questions Fix all asked since the worker began: the last one's number. */
  private asked = 0;

  constructor(work: Partial<FixWork> = {}) {
    this.work = {
      findStretches,
      fixOptions,
      fixAllStart,
      nextQuestion,
      answer,
      fixAllFinish,
      ...work,
    };
  }

  /** Answers a request; nothing for `loaded`, a check before it, or an answer it ignores. */
  handle(message: CoverageRequest): CoverageAnswer | undefined {
    switch (message.kind) {
      case 'loaded':
        this.places = message.places.map(([kind, lat, lon], index) => ({ kind, index, lat, lon }));
        this.byLatitude = [...this.places].sort((a, b) => a.lat - b.lat);
        try {
          this.loaded = coverage(this.outlined(message.regions), this.cache);
        } catch {
          this.loaded = { overlaps: [], gaps: [] };
        }
        return undefined;
      case 'check':
        return this.check(message.seq, message.regions);
      case 'fix-options':
        return this.options(message.seq, message.stretch, message.corner);
      case 'fix-all':
        return this.fixAll(message.seq, message.ask);
      case 'fix-all-answer':
        return this.answerFixAll(message);
    }
  }

  private check(seq: number, regions: readonly CoverageRegion[]): CoverageAnswer | undefined {
    if (!this.loaded) return undefined;
    this.fixingAll = undefined;
    // Until this check is through, no stretch of the one before is offered.
    this.last = undefined;
    const outlined = this.outlined(regions);
    let now: Coverage;
    try {
      now = coverage(outlined, this.cache);
    } catch {
      return { kind: 'check', seq, pieces: [], failed: true };
    }
    let found: Stretches;
    try {
      found = this.work.findStretches(outlined, now);
    } catch {
      // The pieces are shown all the same, none of them offered a fix.
      found = { stretches: [], pieces: [] };
    }
    const { stretches, pieces: fixes } = found;
    this.last = { regions: outlined, pieces: [...now.overlaps, ...now.gaps], stretches };
    const freshOverlaps = new Set(newPieces(now.overlaps, this.loaded.overlaps));
    const freshGaps = new Set(newPieces(now.gaps, this.loaded.gaps));
    const shown = (
      piece: Piece,
      kind: 'overlap' | 'gap',
      between: [string, string] | null,
      fresh: boolean,
      fix: PieceFix | undefined,
    ): ShownPiece => ({
      kind,
      rings: piece.rings.map((ring) => ring.map(toPoint)),
      area: piece.area,
      between,
      fresh,
      counts: this.countIn(piece),
      fix: fix ?? { cannot: 'tangled' },
    });
    const overlaps = now.overlaps.length;
    return {
      kind: 'check',
      seq,
      failed: false,
      pieces: [
        ...now.overlaps.map((piece, i) =>
          shown(piece, 'overlap', piece.between, freshOverlaps.has(piece), fixes[i]),
        ),
        ...now.gaps.map((piece, i) =>
          shown(piece, 'gap', null, freshGaps.has(piece), fixes[overlaps + i]),
        ),
      ],
    };
  }

  /**
   * The choices of a stretch of the last check, with every place each moves; the corner where
   * three meet as dragged (only a dragged one is held to the sliver), else as proposed.
   */
  private options(seq: number, id: string, corner: Point | undefined): CoverageAnswer {
    const none = (failed: boolean): CoverageAnswer => ({
      kind: 'fix-options',
      seq,
      stretch: null,
      options: [],
      failed,
    });
    const stretch = this.last?.stretches.find((one) => one.id === id);
    if (!this.last || !stretch) return none(false);
    try {
      const dragged = corner ? toLatLon(corner) : undefined;
      const options = this.work.fixOptions(this.last.regions, stretch, this.places, {
        ...(dragged ? { corner: dragged } : {}),
        cache: this.cache,
      });
      const inside = placesIn(stretch, this.last.pieces, this.places);
      return {
        kind: 'fix-options',
        seq,
        stretch: shownStretch(
          stretch,
          namedPlaces(inside, options),
          dragged ?? proposedCorner(stretch),
        ),
        options: shownOptions(options),
        failed: false,
      };
    } catch {
      return none(true);
    }
  }

  /** Fix all on the regions of the last check: the quiet stretches, then the first question. */
  private fixAll(seq: number, ask: number): CoverageAnswer {
    this.fixingAll = undefined;
    if (!this.last) return this.failed(seq, ask);
    try {
      const start = this.last.regions;
      this.fixingAll = {
        start,
        state: this.work.fixAllStart(start, this.places, this.cache),
        question: undefined,
        number: 0,
      };
      return this.nextOfFixAll(seq, ask);
    } catch {
      return this.failed(seq, ask);
    }
  }

  private answerFixAll(
    message: Extract<CoverageRequest, { kind: 'fix-all-answer' }>,
  ): CoverageAnswer | undefined {
    const { seq, ask, choice } = message;
    const fixing = this.fixingAll;
    if (!fixing?.question || fixing.number !== message.question) return undefined;
    try {
      if (choice === 'stop') {
        // The question asked and those still to come are left as they are.
        const left = fixing.state.pending.length + 1;
        fixing.state = { ...fixing.state, skipped: fixing.state.skipped + left, pending: [] };
        return this.ended(seq, ask);
      }
      fixing.state = this.work.answer(fixing.state, fixing.question, choice);
      return this.nextOfFixAll(seq, ask);
    } catch {
      return this.failed(seq, ask);
    }
  }

  /** Fix all's next question, numbered, or its end. */
  private nextOfFixAll(seq: number, ask: number): CoverageAnswer {
    const fixing = this.fixingAll;
    if (!fixing) return this.failed(seq, ask);
    const next = this.work.nextQuestion(fixing.state, this.cache);
    // Also at the end: it counts the stretches refused on the way.
    fixing.state = next.state;
    if (!next.question) return this.ended(seq, ask);
    this.asked += 1;
    fixing.question = next.question;
    fixing.number = this.asked;
    const { fixed, skipped, refused, undone } = next.state;
    return {
      kind: 'fix-all',
      seq,
      ask,
      failed: false,
      fixed,
      skipped,
      refused,
      undone,
      question: {
        number: this.asked,
        stretch: shownStretch(next.question.stretch, next.question.places, undefined),
        options: shownOptions(next.question.options),
      },
      outlines: [],
    };
  }

  /**
   * Fix all's end: the fixes that made an overlap or gap the regions as loaded lack taken back
   * (`fixAllFinish`), then everything it changed.
   */
  private ended(seq: number, ask: number): CoverageAnswer {
    const fixing = this.fixingAll;
    if (!fixing) return this.failed(seq, ask);
    this.fixingAll = undefined;
    const state = this.work.fixAllFinish(
      fixing.start,
      fixing.state,
      this.loaded ?? { overlaps: [], gaps: [] },
      this.cache,
    );
    const { fixed, skipped, refused, undone } = state;
    return {
      kind: 'fix-all',
      seq,
      ask,
      failed: false,
      fixed,
      skipped,
      refused,
      undone,
      question: null,
      outlines: changedOutlines(fixing.start, state).map(({ key, outline }) => ({
        key,
        outline: outline.map(toPoint),
      })),
    };
  }

  /** Fix all could not be worked out: it is dropped, and nothing is staged. */
  private failed(seq: number, ask: number): CoverageAnswer {
    this.fixingAll = undefined;
    return {
      kind: 'fix-all',
      seq,
      ask,
      failed: true,
      fixed: 0,
      skipped: 0,
      refused: 0,
      undone: 0,
      question: null,
      outlines: [],
    };
  }

  /** The regions as outlines, the very same list for an outline whose version it has seen. */
  private outlined(regions: readonly CoverageRegion[]): Outlined[] {
    return regions.map(({ key, version, outline }) => {
      const kept = this.outlines.get(key);
      if (kept?.version === version) return { key, outline: kept.outline };
      const made = outline.map(toLatLon);
      this.outlines.set(key, { version, outline: made });
      return { key, outline: made };
    });
  }

  /** What lies in a piece, by kind: the places in its band of latitude, tested one by one. */
  private countIn(piece: Piece): PlaceKinds {
    const counts: PlaceKinds = { gym: 0, stop: 0, powerspot: 0, wayfarerGym: 0 };
    const places = this.byLatitude;
    let low = 0;
    let high = places.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((places[middle]?.lat ?? 0) < piece.box.south) low = middle + 1;
      else high = middle;
    }
    for (let i = low; i < places.length; i++) {
      const place = places[i];
      if (!place || place.lat > piece.box.north) break;
      if (inPiece(piece, place)) counts[place.kind] += 1;
    }
    return counts;
  }
}
