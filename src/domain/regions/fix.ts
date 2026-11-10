import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { tidyOutline } from '@pine/wayspot-core/outline';
import {
  boxOf,
  grownBox,
  inBox,
  ringContains,
  type Box,
} from '@pine/wayspot-core/region-membership';
import {
  newProblems,
  type Coverage,
  type OverlapCache,
  type Outlined,
  type Piece,
} from './coverage.js';
import { between, Flat, SegmentGrid, simplified } from './lines.js';
import { normalisedOutline } from './version.js';

/**
 * Fix in the region editor (spec 4.3 "How Fix works", plan 8M-2F): where two neighbours'
 * borders run within `FIX_REACH_METRES` of each other, the overlaps and gaps between them (8M-2's
 * pieces) are slivers of drawing, and become one shared line. Pure: the page works it out in its
 * worker, and a fix becomes ordinary staged edits.
 *
 * A piece's outer ring runs along the borders of the regions around it, part by part (chains).
 * An overlap of two regions is bounded by the two; a gap between two by the two, and a gap where
 * three meet by three. Such a piece is a sliver: it has two sides that meet at its two ends, one
 * region's border along each side, or along one side one region and along the other two, which
 * meet somewhere along it. Slivers of the same two regions that meet end to end are one stretch:
 * one Fix takes them all.
 */

/** How far apart two borders may run for the slivers between them to be fixed, in metres. */
export const FIX_REACH_METRES = 150;
/** How near a border a place must lie to be on it, in metres (polyclip's arithmetic). */
const ON_BORDER_METRES = 0.01;
/** How finely a side is sampled when the width of a sliver is measured, in metres. */
const SAMPLE_METRES = 20;

/** A part of a sliver's side that runs along one region's border, from its start to its end. */
export interface Chain {
  key: string;
  points: LatLon[];
}

/**
 * A piece between borders: its index among the pieces (the overlaps, then the gaps), its two
 * ends, and its two sides, each from the first end to the second as the chains along it (one,
 * or two that meet where two regions meet along that side).
 */
export interface Sliver {
  piece: number;
  ends: [LatLon, LatLon];
  sides: [Chain[], Chain[]];
}

/**
 * Slivers fixed together: the regions along each side (one on each, or one and two where three
 * meet), and the slivers, each with its sides in that order. Its id is unique among the
 * stretches found at once.
 */
export interface Stretch {
  id: string;
  sides: [string[], string[]];
  slivers: Sliver[];
}

/**
 * Whether a piece can be fixed: the stretch it is in, or why not. `too-wide`: its sides lie
 * farther apart than the reach somewhere (shown, not fixed); `tangled`: it is not bounded by two
 * sides of at most three regions (a gap that more regions close, a piece with holes, borders
 * that touch along it).
 */
export type PieceFix = { stretch: string } | { cannot: 'too-wide' | 'tangled' };

/** The stretches of a server's overlaps and gaps, and what can be done for each piece. */
export interface Stretches {
  stretches: Stretch[];
  /** By the index of a piece: the overlaps, then the gaps, as `coverage` gives them. */
  pieces: PieceFix[];
}

/** A side of a sliver as one line, from its first end to its second. */
export function sideLine(side: readonly Chain[]): LatLon[] {
  const line: LatLon[] = [];
  for (const chain of side)
    line.push(...(line.length === 0 ? chain.points : chain.points.slice(1)));
  return line;
}

const reversed = (chain: Chain): Chain => ({ key: chain.key, points: [...chain.points].reverse() });

/** A part of a piece's ring, along the border of `key`. */
interface Segment {
  a: LatLon;
  b: LatLon;
  keys: string[];
}

/**
 * The parts of a ring each along one border. A part along two borders at once (where the two run
 * together) is split at the middle of the run of such parts between the chains on either side:
 * each takes its half.
 */
function chainsOf(segments: Segment[], flat: Flat): Chain[] | undefined {
  const n = segments.length;
  const sure = segments.findIndex((segment) => segment.keys.length === 1);
  if (sure < 0) return undefined;
  // Rotated to begin at a part along one border, so that runs of shared parts never wrap.
  const turned = [...segments.slice(sure), ...segments.slice(0, sure)];
  const keyed: { a: LatLon; b: LatLon; key: string }[] = [];
  for (let i = 0; i < n;) {
    const segment = turned[i]!;
    if (segment.keys.length === 1) {
      keyed.push({ a: segment.a, b: segment.b, key: segment.keys[0]! });
      i++;
      continue;
    }
    let end = i;
    while (end < n && turned[end]!.keys.length !== 1) end++;
    const run = turned.slice(i, end);
    const before = keyed[keyed.length - 1]!.key;
    const after = end < n ? turned[end]!.keys[0]! : turned[0]!.keys[0]!;
    if (before === after) {
      for (const part of run) keyed.push({ a: part.a, b: part.b, key: before });
    } else {
      // Split at half its length: the first half goes with the chain before, the rest after.
      const half = run.reduce((sum, part) => sum + flat.distance(part.a, part.b), 0) / 2;
      let travelled = 0;
      for (const part of run) {
        const length = flat.distance(part.a, part.b);
        if (travelled + length <= half) keyed.push({ a: part.a, b: part.b, key: before });
        else if (travelled >= half) keyed.push({ a: part.a, b: part.b, key: after });
        else {
          const middle = between(part.a, part.b, (half - travelled) / length);
          keyed.push({ a: part.a, b: middle, key: before }, { a: middle, b: part.b, key: after });
        }
        travelled += length;
      }
    }
    i = end;
  }
  const first = keyed.findIndex(
    (part, i) => part.key !== keyed[(i + keyed.length - 1) % keyed.length]!.key,
  );
  if (first < 0) return undefined;
  const chains: Chain[] = [];
  for (let k = 0; k < keyed.length; k++) {
    const part = keyed[(first + k) % keyed.length]!;
    const last = chains[chains.length - 1];
    if (last?.key === part.key) last.points.push(part.b);
    else chains.push({ key: part.key, points: [part.a, part.b] });
  }
  return chains;
}

/**
 * The regions a piece could be bounded by, with their outlines and boxes, and the sides of the
 * outline filed in a grid once a piece asks (`gridOf`).
 */
interface Around {
  key: string;
  outline: readonly LatLon[];
  box: Box;
  grid?: SegmentGrid;
}

/** The cells of an outline's grid: about its sides' length, within these bounds, in metres. */
const OUTLINE_CELL = { least: 10, most: 2_000 };

/** The sides of a ring in a grid of cells about their length (`OUTLINE_CELL`). */
function outlineGrid(ring: readonly LatLon[], flat: Flat): SegmentGrid {
  const sides = Math.max(1, ring.length - 1);
  const cell = Math.min(OUTLINE_CELL.most, Math.max(OUTLINE_CELL.least, flat.length(ring) / sides));
  return new SegmentGrid(ring, flat, cell);
}

/** The sides of a region's outline in a grid (made once, when a piece first asks). */
function gridOf(one: Around, flat: Flat): SegmentGrid {
  one.grid ??= outlineGrid(one.outline, flat);
  return one.grid;
}

/**
 * A piece's outer ring (closed) as its corners, with a corner added wherever a corner of a
 * region around it lies on one of its sides (within `ON_BORDER_METRES`, not at its ends):
 * polyclip leaves out a corner that lies in line, so a straight side of a piece can run along
 * two regions' borders that meet on it (one above the other), and would go wholly to one.
 */
function splitAtCorners(
  ring: readonly LatLon[],
  box: Box,
  around: readonly Around[],
  flat: Flat,
): LatLon[] {
  const corners = ring.slice(0, -1);
  const grid = outlineGrid(ring, flat);
  const near = grownBox(box, 1);
  const cuts = new Map<number, { t: number; at: LatLon }[]>();
  for (const one of around) {
    for (const corner of one.outline) {
      if (!inBox(near, corner)) continue;
      for (const i of grid.sidesNear(corner, ON_BORDER_METRES)) {
        const a = ring[i]!;
        const b = ring[i + 1]!;
        const length = flat.distance(a, b);
        const { t } = flat.onSegment(corner, a, b);
        if (t * length <= ON_BORDER_METRES || (1 - t) * length <= ON_BORDER_METRES) continue;
        cuts.set(i, [...(cuts.get(i) ?? []), { t, at: corner }]);
      }
    }
  }
  if (cuts.size === 0) return corners;
  return corners.flatMap((corner, i) => {
    const length = flat.distance(corner, ring[i + 1]!);
    const along = (cuts.get(i) ?? []).sort((x, y) => x.t - y.t);
    // The same place (a corner the regions share, or the closing corner of an outline) once.
    const kept = along.filter(
      (cut, k) => k === 0 || (cut.t - along[k - 1]!.t) * length > ON_BORDER_METRES,
    );
    return [corner, ...kept.map((cut) => cut.at)];
  });
}

/**
 * How far a place of the line `from` lies from the line `to` at most (its corners and places
 * every `SAMPLE_METRES`), in metres; `Infinity` when one lies beyond the reach.
 */
function strays(from: readonly LatLon[], to: readonly LatLon[], flat: Flat): number {
  const grid = new SegmentGrid(to, flat, FIX_REACH_METRES / 3);
  let farthest = 0;
  for (const point of flat.samples(from, SAMPLE_METRES)) {
    const distance = grid.distance(point, FIX_REACH_METRES);
    if (distance === Infinity) return Infinity;
    if (distance > farthest) farthest = distance;
  }
  return farthest;
}

/**
 * How far apart a sliver's two sides lie at most, either way, in metres; `Infinity` beyond the
 * reach (`FIX_REACH_METRES`).
 */
function widthOf(sides: Sliver['sides'], flat: Flat): number {
  const [one, other] = sides.map(sideLine) as [LatLon[], LatLon[]];
  const there = strays(one, other, flat);
  return there === Infinity ? Infinity : Math.max(there, strays(other, one, flat));
}

/** Widths this close are the same, in metres, when the sides of a gap of three are chosen. */
const SAME_WIDTH_METRES = 1;

/**
 * A piece as a sliver of two or three regions, with its width (`widthOf`), or undefined when it
 * is none.
 */
function sliverOf(
  index: number,
  piece: Piece,
  around: readonly Around[],
): { sliver: Sliver; width: number } | undefined {
  const [outer, ...holes] = piece.rings;
  if (!outer || holes.length > 0) return undefined;
  const flat = new Flat(outer[0]?.lat ?? 0);
  const corners = splitAtCorners(outer, piece.box, around, flat);
  const segments: Segment[] = corners.map((a, i) => {
    const b = corners[(i + 1) % corners.length]!;
    const middle = between(a, b, 0.5);
    const keys = around
      .filter(
        (one) =>
          inBox(one.box, middle) &&
          gridOf(one, flat).distance(middle, ON_BORDER_METRES) <= ON_BORDER_METRES,
      )
      .map((one) => one.key);
    return { a, b, keys };
  });
  if (segments.some((segment) => segment.keys.length === 0)) return undefined;
  const chains = chainsOf(segments, flat);
  if (!chains || new Set(chains.map((chain) => chain.key)).size !== chains.length) return undefined;
  if (chains.length === 2) {
    const [one, other] = chains as [Chain, Chain];
    const sides: Sliver['sides'] = [[one], [reversed(other)]];
    return {
      sliver: { piece: index, ends: [one.points[0]!, other.points[0]!], sides },
      width: widthOf(sides, flat),
    };
  }
  if (chains.length !== 3) return undefined;
  // One chain is one side, the other two (turned round) the other, which meet along it: of the
  // three ways, the one whose sides lie closest together (a U-shaped gap is not its cut across
  // one arm against all the rest); among ways as close, the one whose ends lie farthest apart.
  const reach = (chain: Chain): number =>
    flat.distance(chain.points[0]!, chain.points[chain.points.length - 1]!);
  const ways = [0, 1, 2].map((i) => {
    const single = chains[i]!;
    const sides: Sliver['sides'] = [
      [single],
      [reversed(chains[(i + 2) % 3]!), reversed(chains[(i + 1) % 3]!)],
    ];
    const sliver: Sliver = {
      piece: index,
      ends: [single.points[0]!, single.points[single.points.length - 1]!],
      sides,
    };
    return { sliver, width: widthOf(sides, flat), reach: reach(single) };
  });
  const narrowest = Math.min(...ways.map((way) => way.width));
  const best = ways
    .filter((way) => narrowest === Infinity || way.width <= narrowest + SAME_WIDTH_METRES)
    .reduce((one, other) => (other.reach > one.reach ? other : one));
  return { sliver: best.sliver, width: best.width };
}

/** A sliver with its sides in the order of the regions' keys given. */
function ordered(sliver: Sliver, keys: readonly string[]): Sliver {
  if (sliver.sides[0][0]?.key === keys[0]) return sliver;
  return { ...sliver, sides: [sliver.sides[1], sliver.sides[0]] };
}

/** Whether two places are one, as polyclip computes the same crossing for two pieces. */
const same = (a: LatLon, b: LatLon): boolean => new Flat(a.lat).distance(a, b) <= ON_BORDER_METRES;

/**
 * The stretches of the overlaps and gaps found (`coverage` of these regions): each piece that is
 * a sliver within the reach, with the slivers of the same two regions that meet it end to end;
 * a gap where three regions meet is a stretch of its own.
 */
export function findStretches(regions: readonly Outlined[], found: Coverage): Stretches {
  const order = new Map(regions.map((region, i) => [region.key, i]));
  const around: Around[] = regions
    .filter((region) => region.outline.length >= 4)
    .map((region) => ({
      key: region.key,
      outline: region.outline,
      box: grownBox(boxOf(region.outline), 1),
    }));
  const pieces: { piece: Piece; around: Around[] }[] = [
    ...found.overlaps.map((piece) => ({
      piece,
      around: around.filter((one) => piece.between.includes(one.key)),
    })),
    ...found.gaps.map((piece) => ({
      piece,
      around: around.filter((one) => {
        const box = piece.box;
        return (
          box.south <= one.box.north &&
          one.box.south <= box.north &&
          box.west <= one.box.east &&
          one.box.west <= box.east
        );
      }),
    })),
  ];
  const fixes: PieceFix[] = [];
  const slivers: Sliver[] = [];
  pieces.forEach(({ piece, around: near }, index) => {
    const measured = sliverOf(index, piece, near);
    if (!measured) {
      fixes.push({ cannot: 'tangled' });
    } else if (measured.width > FIX_REACH_METRES) {
      fixes.push({ cannot: 'too-wide' });
    } else {
      fixes.push({ stretch: '' });
      slivers.push(measured.sliver);
    }
  });

  const stretches: Stretch[] = [];
  const pairs = new Map<string, Sliver[]>();
  for (const sliver of slivers) {
    const keys = sliver.sides.flat().map((chain) => chain.key);
    if (keys.length === 3) {
      stretches.push({
        id: `${keys.join('/')}#${sliver.piece}`,
        sides: [[keys[0]!], [keys[1]!, keys[2]!]],
        slivers: [sliver],
      });
      continue;
    }
    const pair = [...keys].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const name = pair.join('/');
    pairs.set(name, [...(pairs.get(name) ?? []), ordered(sliver, pair)]);
  }
  for (const [name, group] of pairs) {
    // Slivers that meet end to end, and those that meet them, and so on, are one stretch.
    const taken = group.map(() => false);
    for (let i = 0; i < group.length; i++) {
      if (taken[i]) continue;
      taken[i] = true;
      const members = [group[i]!];
      for (let k = 0; k < members.length; k++) {
        const ends = members[k]!.ends;
        group.forEach((other, j) => {
          if (taken[j] || !other.ends.some((end) => ends.some((mine) => same(end, mine)))) return;
          taken[j] = true;
          members.push(other);
        });
      }
      members.sort((a, b) => a.piece - b.piece);
      const keys = name.split('/');
      stretches.push({
        id: `${name}#${members[0]!.piece}`,
        sides: [[keys[0]!], [keys[1]!]],
        slivers: members,
      });
    }
  }
  stretches.sort((a, b) => a.slivers[0]!.piece - b.slivers[0]!.piece);
  for (const stretch of stretches) {
    for (const sliver of stretch.slivers) fixes[sliver.piece] = { stretch: stretch.id };
  }
  return { stretches, pieces: fixes };
}

/**
 * What the shared line of a stretch is: the midline of its two sides, or the border along one
 * side (0 or 1, as `Stretch.sides`), which the regions along the other side take.
 */
export type FixChoice = 'midline' | 0 | 1;

/**
 * Why a fix is not offered: `stale`, a border of the stretch is no longer where it was found;
 * `corner-outside`, the corner where three regions meet was dragged out of the sliver;
 * `crosses-itself` or `too-many-corners`, an outline rebuilt would be refused (`tidyOutline`);
 * `new-pieces`, the outlines rebuilt would make an overlap or gap that was not there.
 */
export type FixRefusal =
  'stale' | 'corner-outside' | 'crosses-itself' | 'too-many-corners' | 'new-pieces';

/** The outlines a fix rebuilt (only those it changed, tidied), or why there are none. */
export type FixOutcome = { ok: true; outlines: Outlined[] } | { ok: false; reason: FixRefusal };

/**
 * How far apart the midline samples the sides, in metres, at most `MAX_SAMPLES` per side (then
 * farther apart): a side traced with thousands of corners is sampled as evenly as a drawn one.
 */
const MIDLINE_STEP = 10;
const MAX_SAMPLES = 1_500;
/**
 * How far from the diagonal the alignment of the samples is looked for: this share of the
 * samples of the longer side, at least `MIN_BAND` (the sides run from the same end to the same
 * end, so the pairs stay near it).
 */
const BAND_SHARE = 0.1;
const MIN_BAND = 50;
/** How far a midline may stray from the midpoints it is drawn through, in metres. */
const MIDLINE_TOLERANCE = 1;

/** A shared line from one end of a sliver to the other, and where three regions meet on it. */
interface SharedLine {
  line: LatLon[];
  /** The index of the corner in `line` where three regions meet; undefined for two. */
  corner: number | undefined;
}

/**
 * The closest alignment of two lists of places that runs forward along both from their firsts
 * to their lasts (dynamic time warping), as the pairs of indexes in order; looked for within a
 * band round the diagonal (`BAND_SHARE`), so that two sides of 1,500 samples take a few
 * megabytes, not a few hundred.
 */
function aligned(a: readonly LatLon[], b: readonly LatLon[], flat: Flat): [number, number][] {
  const n = a.length;
  const m = b.length;
  // Wide enough that each row's band meets the next one's however the lengths differ.
  const width = Math.max(
    MIN_BAND,
    Math.ceil(BAND_SHARE * Math.max(n, m)),
    Math.ceil((m - 1) / Math.max(1, n - 1)) + 1,
  );
  const low = new Int32Array(n);
  const high = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const centre = n === 1 ? 0 : (i * (m - 1)) / (n - 1);
    low[i] = Math.max(0, Math.floor(centre - width));
    high[i] = Math.min(m - 1, Math.ceil(centre + width));
  }
  const span = 2 * width + 2;
  const cost = new Float64Array(n * span);
  // 0: from both before, 1: from a's before, 2: from b's before.
  const from = new Uint8Array(n * span);
  const costAt = (i: number, j: number): number =>
    j < low[i]! || j > high[i]! ? Infinity : cost[i * span + j - low[i]!]!;
  for (let i = 0; i < n; i++) {
    for (let j = low[i]!; j <= high[i]!; j++) {
      const here = flat.distance(a[i]!, b[j]!);
      const cell = i * span + j - low[i]!;
      if (i === 0 && j === 0) {
        cost[cell] = here;
        continue;
      }
      const both = i > 0 && j > 0 ? costAt(i - 1, j - 1) : Infinity;
      const aBefore = i > 0 ? costAt(i - 1, j) : Infinity;
      const bBefore = j > 0 ? costAt(i, j - 1) : Infinity;
      let best = both;
      let way = 0;
      if (aBefore < best) {
        best = aBefore;
        way = 1;
      }
      if (bBefore < best) {
        best = bBefore;
        way = 2;
      }
      cost[cell] = here + best;
      from[cell] = way;
    }
  }
  const path: [number, number][] = [];
  for (let i = n - 1, j = m - 1; ;) {
    path.push([i, j]);
    if (i === 0 && j === 0) break;
    const way = from[i * span + j - low[i]!];
    if (way !== 2) i--;
    if (way !== 1) j--;
  }
  return path.reverse();
}

/**
 * The midline of two sides that run from the same end to the same end: the sides sampled
 * evenly, the samples matched (`aligned`), the midpoints of the pairs, simplified. `other` is
 * given as the chains along it: where two regions meet along it (the end of the first of two),
 * the midline gets a corner across from it (where three regions meet).
 */
function midline(one: LatLon[], other: readonly LatLon[][], flat: Flat): SharedLine {
  const lengths = other.map((part) => flat.length(part));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const step = Math.max(MIDLINE_STEP, Math.max(flat.length(one), total) / MAX_SAMPLES);
  const a = flat.resampled(one, step, MAX_SAMPLES);
  // Each chain sampled on its own, so that where they meet is a sample; MAX_SAMPLES in all.
  const [first, second] = other as [LatLon[], LatLon[] | undefined];
  const firstMost = second
    ? Math.min(MAX_SAMPLES - 1, Math.max(2, Math.floor((MAX_SAMPLES * lengths[0]!) / total)))
    : MAX_SAMPLES;
  const b = flat.resampled(first, step, firstMost);
  const meet = second ? b.length - 1 : undefined;
  if (second) b.push(...flat.resampled(second, step, MAX_SAMPLES + 1 - b.length).slice(1));
  const path = aligned(a, b, flat);
  const middles = path.map(([i, j]) => between(a[i]!, b[j]!, 0.5));
  middles[0] = one[0]!;
  middles[middles.length - 1] = one[one.length - 1]!;
  if (meet === undefined) {
    return { line: simplified(middles, MIDLINE_TOLERANCE, flat), corner: undefined };
  }
  const matched = path.flatMap(([, j], k) => (j === meet ? [k] : []));
  const at = matched[Math.floor(matched.length / 2)] ?? 0;
  const before = simplified(middles.slice(0, at + 1), MIDLINE_TOLERANCE, flat);
  const after = simplified(middles.slice(at), MIDLINE_TOLERANCE, flat);
  return { line: [...before, ...after.slice(1)], corner: before.length - 1 };
}

/** A line with a place inserted where it is nearest the line, and the place's index. */
function withNearest(line: LatLon[], point: LatLon, flat: Flat): SharedLine {
  const { along, at } = flat.nearest(line, point);
  let travelled = 0;
  for (let i = 1; i < line.length; i++) {
    travelled += flat.distance(line[i - 1]!, line[i]!);
    if (travelled >= along) {
      return { line: [...line.slice(0, i), at, ...line.slice(i)], corner: i };
    }
  }
  return { line: [...line, at], corner: line.length };
}

/** Where the two regions along one side of a sliver meet: the end of the first chain. */
const meetingOf = (sliver: Sliver): LatLon | undefined => {
  const [first, second] = sliver.sides[1];
  return second ? first?.points[first.points.length - 1] : undefined;
};

/** The shared line of a sliver for a choice. */
function sharedLine(sliver: Sliver, choice: FixChoice): SharedLine {
  const flat = new Flat(sliver.ends[0].lat);
  const one = sideLine(sliver.sides[0]);
  const other = sideLine(sliver.sides[1]);
  const meet = meetingOf(sliver);
  if (choice === 'midline') {
    return midline(
      one,
      sliver.sides[1].map((chain) => chain.points),
      flat,
    );
  }
  if (choice === 1) {
    const first = sliver.sides[1][0]!;
    return { line: other, corner: meet ? first.points.length - 1 : undefined };
  }
  return meet ? withNearest(one, meet, flat) : { line: one, corner: undefined };
}

/**
 * Where three regions meet in a stretch, as its midline proposes it: the middle of the strip
 * across from where two of them meet along its side. Undefined for a stretch of two.
 */
export function proposedCorner(stretch: Stretch): LatLon | undefined {
  const [sliver] = stretch.slivers;
  if (!sliver || !meetingOf(sliver)) return undefined;
  const { line, corner } = sharedLine(sliver, 'midline');
  return corner === undefined ? undefined : line[corner];
}

/** A chain of a region's border to be replaced, by the new line from its start to its end. */
interface Replacement {
  key: string;
  old: LatLon[];
  fresh: LatLon[];
}

/** What each region's chains become under a choice (the side kept is left as it is). */
function replacements(stretch: Stretch, choice: FixChoice, corner?: LatLon): Replacement[] {
  return stretch.slivers.flatMap((sliver) => {
    const shared = sharedLine(sliver, choice);
    const { line } = shared;
    const k = shared.corner;
    if (k !== undefined && corner && choice === 'midline') line[k] = corner;
    return sliver.sides.flatMap((side, index) => {
      if (index === choice) return [];
      if (side.length === 1 || k === undefined) {
        return side.map((chain) => ({ key: chain.key, old: chain.points, fresh: line }));
      }
      const [first, second] = side as [Chain, Chain];
      const meet = first.points[first.points.length - 1]!;
      return [
        { key: first.key, old: first.points, fresh: [...line.slice(0, k + 1), meet] },
        { key: second.key, old: second.points, fresh: [meet, ...line.slice(k)] },
      ];
    });
  });
}

/**
 * Where a place lies on a ring's corners (closed by the first): the side's index and how far
 * along it, `i + t`; a place within `ON_BORDER_METRES` of a corner is at that corner. Undefined
 * when it is not on the ring.
 */
function locate(corners: readonly LatLon[], point: LatLon, flat: Flat): number | undefined {
  const n = corners.length;
  let best: { at: number; distance: number } | undefined;
  for (let i = 0; i < n; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % n]!;
    const { t, distance } = flat.onSegment(point, a, b);
    if (best && distance >= best.distance) continue;
    const length = flat.distance(a, b);
    const at =
      t * length <= ON_BORDER_METRES
        ? i
        : (1 - t) * length <= ON_BORDER_METRES
          ? (i + 1) % n
          : i + t;
    best = { at, distance };
  }
  return best && best.distance <= ON_BORDER_METRES ? best.at : undefined;
}

/** How far forward round a ring of `n` corners `b` lies from `a`. */
const forward = (a: number, b: number, n: number): number => (((b - a) % n) + n) % n;
const PARAM_EPSILON = 1e-9;

/**
 * A ring (closed) with the chain of its border from `old`'s first place to its last replaced by
 * `fresh` (which runs between the same places), whichever way the ring runs along it; undefined
 * when the chain is not on the ring.
 */
function replaced(
  ring: readonly LatLon[],
  old: readonly LatLon[],
  fresh: readonly LatLon[],
  flat: Flat,
): LatLon[] | undefined {
  const corners = ring.slice(0, -1);
  const n = corners.length;
  const middle = Math.max(0, Math.floor((old.length - 2) / 2));
  const start = locate(corners, old[0]!, flat);
  const end = locate(corners, old[old.length - 1]!, flat);
  const probe = locate(corners, between(old[middle]!, old[middle + 1]!, 0.5), flat);
  if (start === undefined || end === undefined || probe === undefined) return undefined;
  const runs = (from: number, to: number): boolean => {
    const towards = forward(from, probe, n);
    return towards > PARAM_EPSILON && towards < forward(from, to, n) - PARAM_EPSILON;
  };
  let line: LatLon[];
  let from: number;
  let to: number;
  if (runs(start, end)) [line, from, to] = [[...fresh], start, end];
  else if (runs(end, start)) [line, from, to] = [[...fresh].reverse(), end, start];
  else return undefined;
  // The corners from the line's end round to its start.
  const span = forward(to, from, n);
  const kept = corners
    .map((corner, i) => ({ corner, at: forward(to, i, n) }))
    .filter(({ at }) => at > PARAM_EPSILON && at < span - PARAM_EPSILON)
    .sort((x, y) => x.at - y.at)
    .map(({ corner }) => corner);
  const made = [...line, ...kept];
  return [...made, { ...made[0]! }];
}

/** How far off a straight line a corner may lie and still be a fold of it, in metres. */
const FOLD_METRES = 0.05;

/**
 * A ring (closed) without the corners where it runs back along itself: where a region takes a
 * border that ran along its own for a while (the ends of a strip whose sides run together), the
 * line goes out along its border and back.
 */
function unfolded(ring: readonly LatLon[]): LatLon[] {
  const corners = ring.slice(0, -1);
  const flat = new Flat(corners[0]?.lat ?? 0);
  for (let i = 0; corners.length > 3 && i < corners.length;) {
    const n = corners.length;
    const a = corners[(i + n - 1) % n]!;
    const b = corners[i]!;
    const c = corners[(i + 1) % n]!;
    const u = flat.offset(b, a);
    const v = flat.offset(b, c);
    const longer = Math.max(Math.hypot(u.x, u.y), Math.hypot(v.x, v.y));
    // The two sides at b point the same way, and the shorter's end lies on the longer.
    const folds =
      u.x * v.x + u.y * v.y > 0 && Math.abs(u.x * v.y - u.y * v.x) / longer <= FOLD_METRES;
    if (folds) {
      corners.splice(i, 1);
      i = Math.max(0, i - 1);
    } else i++;
  }
  return corners.length > 0 ? [...corners, { ...corners[0]! }] : [];
}

/** How far outside its sliver a corner where three regions meet may be dragged, in metres. */
const CORNER_SLACK_METRES = 1;

/** Whether a place lies in one of a stretch's slivers, or within `CORNER_SLACK_METRES` of one. */
function inSlivers(stretch: Stretch, point: LatLon): boolean {
  const flat = new Flat(point.lat);
  return stretch.slivers.some((sliver) => {
    const [one, other] = sliver.sides.map(sideLine) as [LatLon[], LatLon[]];
    const ring = [...one, ...other.reverse()];
    return ringContains(ring, point) || flat.nearest(ring, point).distance <= CORNER_SLACK_METRES;
  });
}

/**
 * The outlines a choice for a stretch makes (`corner`: where three regions meet, dragged from
 * `proposedCorner`, for the midline), tidied; refused when a border is not where the stretch was
 * found, when the corner lies outside the stretch's slivers (land beyond them would change
 * region unseen), or when an outline would be refused. Not checked for new overlaps and gaps
 * (`fixStretch`).
 */
export function rebuildStretch(
  regions: readonly Outlined[],
  stretch: Stretch,
  choice: FixChoice,
  corner?: LatLon,
): FixOutcome {
  if (choice === 'midline' && corner && !inSlivers(stretch, corner)) {
    return { ok: false, reason: 'corner-outside' };
  }
  const outlines = new Map(regions.map((one) => [one.key, one.outline]));
  const touched = new Set<string>();
  for (const { key, old, fresh } of replacements(stretch, choice, corner)) {
    const outline = outlines.get(key);
    const made = outline && replaced(outline, old, fresh, new Flat(old[0]?.lat ?? 0));
    if (!made) return { ok: false, reason: 'stale' };
    outlines.set(key, made);
    touched.add(key);
  }
  const rebuilt: Outlined[] = [];
  for (const key of touched) {
    const tidy = tidyOutline(unfolded(normalisedOutline(outlines.get(key)!)));
    if (!tidy.ok) {
      return {
        ok: false,
        reason: tidy.problem.kind === 'too-many' ? 'too-many-corners' : 'crosses-itself',
      };
    }
    rebuilt.push({ key, outline: tidy.ring });
  }
  return { ok: true, outlines: rebuilt };
}

/**
 * A fix of a stretch (`rebuildStretch`), refused also when its outlines would make an overlap or
 * a gap that the regions do not have (`newProblems`, as a save is checked).
 */
export function fixStretch(
  regions: readonly Outlined[],
  stretch: Stretch,
  choice: FixChoice,
  options: { corner?: LatLon; cache?: OverlapCache } = {},
): FixOutcome {
  const outcome = rebuildStretch(regions, stretch, choice, options.corner);
  if (!outcome.ok) return outcome;
  const made = new Map(outcome.outlines.map((one) => [one.key, one.outline]));
  const after = regions.map((one) => ({ key: one.key, outline: made.get(one.key) ?? one.outline }));
  const problems = newProblems(regions, after, options.cache);
  return problems.overlaps.length + problems.gaps.length > 0
    ? { ok: false, reason: 'new-pieces' }
    : outcome;
}
