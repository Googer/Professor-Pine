import { intersection, union, type Geom } from 'polyclip-ts';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { boxOf, grownBox, ringContains, type Box } from '@pine/wayspot-core/region-membership';

/**
 * Where a server's regions overlap and where they leave gaps (spec 4.3), for the region editor
 * and the check of its saves. Pure: `polyclip-ts` cuts the outlines as flat latitudes and
 * longitudes (as everywhere regions are compared with places), and the areas of what it gives
 * are measured on the sphere.
 */

/**
 * How wide a piece must be on average (twice its area over its perimeter) to count. Outlines
 * travel at six decimals (about 10 cm): a corner snapped onto a neighbour's border comes back a
 * few centimetres off it, which leaves a sliver along the whole border. Thinner than this is
 * that rounding, never a slip of drawing (Pittsburgh's slivers are 50 to 130 m wide).
 */
export const MIN_SLIVER_WIDTH = 0.5;
/** A piece smaller than this (in m²) is the noise of the arithmetic. */
const MIN_AREA = 1;
/**
 * How much of a piece must lie inside one of the loaded outlines' pieces of its kind for it to
 * count as that one (shrunk, moved a little, or split between two regions) rather than new.
 */
export const SAME_PIECE_SHARE = 0.9;
/** How far around what changed `newProblems` looks for the regions it is measured with. */
const NEIGHBOURHOOD_METRES = 100;

/** The mean radius of the earth, in metres. */
const EARTH_RADIUS = 6_371_000;
const RADIANS = Math.PI / 180;

/** An outline of a region by a key of the caller's (a region id, a new region's key). */
export interface Outlined {
  key: string;
  outline: readonly LatLon[];
}

/**
 * A piece of the map: its outer ring, then its holes (each closed), its area in m² (holes taken
 * out) and the box of its outer ring.
 */
export interface Piece {
  rings: LatLon[][];
  area: number;
  box: Box;
}

/** Where two regions overlap, by their keys in the order the regions were given. */
export interface Overlap extends Piece {
  between: [string, string];
}

export interface Coverage {
  overlaps: Overlap[];
  /** The areas inside the outer shape of all regions that no region covers. */
  gaps: Piece[];
}

type Ring = [number, number][];

/** An outline as polyclip takes it: `[lon, lat]`, closed. */
function toRing(outline: readonly LatLon[]): Ring {
  const ring: Ring = outline.map(({ lat, lon }) => [lon, lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([...first]);
  return ring;
}

const toOutline = (ring: Ring): LatLon[] => ring.map(([lon, lat]) => ({ lat, lon }));

/**
 * The area of a ring in m², whichever way it winds: by the shoelace formula in Lambert's
 * cylindrical equal-area projection (x the longitude, y the sine of the latitude, both times the
 * earth's radius), which keeps areas exactly on a sphere of the earth's mean radius. Its sides
 * are straight in that projection, where the outlines' sides are straight in latitude and
 * longitude: at the size of a city the difference is far below a square metre per kilometre.
 */
export function ringArea(ring: readonly LatLon[]): number {
  const first = ring[0];
  if (!first) return 0;
  // Measured from the first corner, so that a sliver keeps its digits.
  const x = (corner: LatLon): number => EARTH_RADIUS * (corner.lon - first.lon) * RADIANS;
  const sinFirst = Math.sin(first.lat * RADIANS);
  const y = (corner: LatLon): number => EARTH_RADIUS * (Math.sin(corner.lat * RADIANS) - sinFirst);
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as LatLon;
    const b = ring[(i + 1) % ring.length] as LatLon;
    twice += x(a) * y(b) - x(b) * y(a);
  }
  return Math.abs(twice) / 2;
}

/** The length of a ring's sides in metres, each measured flat at its middle. */
function ringLength(ring: readonly LatLon[]): number {
  let metres = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1] as LatLon;
    const b = ring[i] as LatLon;
    const across = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * RADIANS);
    metres += EARTH_RADIUS * RADIANS * Math.hypot(b.lat - a.lat, across);
  }
  return metres;
}

/** Rings as a piece, or nothing when it is too small or too thin to be drawing. */
function pieceOf(rings: LatLon[][]): Piece[] {
  const [outer, ...holes] = rings;
  if (!outer) return [];
  const area = holes.reduce((left, hole) => left - ringArea(hole), ringArea(outer));
  const perimeter = rings.reduce((sum, ring) => sum + ringLength(ring), 0);
  if (area < MIN_AREA || (2 * area) / perimeter < MIN_SLIVER_WIDTH) return [];
  return [{ rings, area, box: boxOf(outer) }];
}

/** What polyclip gave, as pieces. */
const piecesOf = (polygons: readonly Ring[][]): Piece[] =>
  polygons.flatMap((polygon) => pieceOf(polygon.map(toOutline)));

/** Whether a place lies in a piece: in its outer ring and in none of its holes. */
export function inPiece(piece: Piece, point: LatLon): boolean {
  const { box } = piece;
  if (point.lat < box.south || point.lat > box.north) return false;
  if (point.lon < box.west || point.lon > box.east) return false;
  const [outer, ...holes] = piece.rings;
  return (
    outer !== undefined &&
    ringContains(outer, point) &&
    !holes.some((hole) => ringContains(hole, point))
  );
}

const boxesMeet = (a: Box, b: Box): boolean =>
  a.south <= b.north && b.south <= a.north && a.west <= b.east && b.west <= a.east;

/**
 * The overlaps of pairs of outlines already cut, by the outlines themselves (their identity):
 * while one region is drawn, only its own pairs are cut again.
 */
export class OverlapCache {
  private readonly kept = new WeakMap<object, WeakMap<object, Piece[]>>();
  private count = 0;

  /** How many pairs are kept; for tests. */
  get size(): number {
    return this.count;
  }

  get(a: readonly LatLon[], b: readonly LatLon[]): Piece[] | undefined {
    return this.kept.get(a)?.get(b);
  }

  set(a: readonly LatLon[], b: readonly LatLon[], pieces: Piece[]): void {
    let inner = this.kept.get(a);
    if (!inner) {
      inner = new WeakMap();
      this.kept.set(a, inner);
    }
    if (!inner.has(b)) this.count++;
    inner.set(b, pieces);
  }
}

/** The outlines with their rings for polyclip and their boxes. */
function shapedOf(regions: readonly Outlined[]) {
  return regions
    .filter((region) => region.outline.length >= 4)
    .map((region) => ({ ...region, ring: toRing(region.outline), box: boxOf(region.outline) }));
}

/** The overlaps of every pair whose boxes meet, cut once per pair of outlines (`cache`). */
function overlapsOf(shaped: ReturnType<typeof shapedOf>, cache?: OverlapCache): Overlap[] {
  const overlaps: Overlap[] = [];
  for (let i = 0; i < shaped.length; i++) {
    for (let j = i + 1; j < shaped.length; j++) {
      const a = shaped[i]!;
      const b = shaped[j]!;
      if (!boxesMeet(a.box, b.box)) continue;
      let pieces = cache?.get(a.outline, b.outline);
      if (!pieces) {
        pieces = piecesOf(intersection([a.ring], [b.ring]));
        cache?.set(a.outline, b.outline, pieces);
      }
      for (const piece of pieces) overlaps.push({ ...piece, between: [a.key, b.key] });
    }
  }
  return overlaps;
}

/**
 * The gaps: the holes of the union of the outlines, less any part of the union that lies inside
 * a hole (a region drawn inside a gap, whose own holes are gaps of their own). A bay open to the
 * outside is no hole, so no gap.
 */
function gapsOf(shaped: ReturnType<typeof shapedOf>): Piece[] {
  const [first, ...rest] = shaped.map((region): Geom => [region.ring]);
  if (!first) return [];
  const parts = union(first, ...rest).map((polygon) => polygon.map(toOutline));
  return parts.flatMap((part) =>
    part.slice(1).flatMap((hole) => {
      const islands = parts.flatMap((other) => {
        const [outer] = other;
        const corner = outer?.[0];
        return other !== part && outer && corner && ringContains(hole, corner) ? [outer] : [];
      });
      return pieceOf([hole, ...islands]);
    }),
  );
}

/**
 * The overlaps of every pair of outlines (cut only where their boxes meet), and the gaps
 * (`gapsOf`). Pieces thinner than `MIN_SLIVER_WIDTH` are left out. A piece where three regions
 * overlap is listed once for each pair. Throws when polyclip cannot cut the outlines.
 */
export function coverage(regions: readonly Outlined[], cache?: OverlapCache): Coverage {
  const shaped = shapedOf(regions);
  return { overlaps: overlapsOf(shaped, cache), gaps: gapsOf(shaped) };
}

/** Whether two pieces are the very same: the same rings, or the same area in the same box. */
function samePiece(a: Piece, b: Piece): boolean {
  if (a.rings === b.rings) return true;
  return (
    Math.abs(a.area - b.area) <= 1e-9 * a.area &&
    a.box.south === b.box.south &&
    a.box.north === b.box.north &&
    a.box.west === b.box.west &&
    a.box.east === b.box.east
  );
}

/**
 * Of the pieces now, those that are new against the pieces of the loaded outlines (of the same
 * kind): a piece counts as one that was there when at least `SAME_PIECE_SHARE` of its area lies
 * inside one loaded piece. So an overlap that shrank, moved a little or was split between two
 * regions with the region it was in is not new; one that grew by more than a ninth, or one
 * elsewhere, is.
 */
export function newPieces<P extends Piece>(now: readonly P[], loaded: readonly Piece[]): P[] {
  return now.filter(
    (piece) =>
      !loaded.some((before) => {
        if (!boxesMeet(piece.box, before.box)) return false;
        if (samePiece(piece, before)) return true;
        const shared = intersection(
          piece.rings.map((ring) => toRing(ring)),
          before.rings.map((ring) => toRing(ring)),
        ).reduce((sum, polygon) => {
          const [outer, ...holes] = polygon.map(toOutline);
          if (!outer) return sum;
          return sum + holes.reduce((left, hole) => left - ringArea(hole), ringArea(outer));
        }, 0);
        return shared >= SAME_PIECE_SHARE * piece.area;
      }),
  );
}

/** Whether two outlines are the same ring: the same list, or the same corners. */
function sameOutline(a: readonly LatLon[], b: readonly LatLon[]): boolean {
  return (
    a === b ||
    (a.length === b.length &&
      a.every((point, i) => point.lat === b[i]?.lat && point.lon === b[i]?.lon))
  );
}

/**
 * The outlines chained to these boxes: those whose boxes (grown by `NEIGHBOURHOOD_METRES`)
 * meet one of them, then those whose boxes meet one of those, and so on. A gap is a hole of the
 * union, and the ring of regions around a hole is chained this way, however far it reaches.
 */
function chainedTo(seeds: readonly Box[], outlines: readonly Outlined[]): Outlined[] {
  const boxes = outlines.map((one) => grownBox(boxOf(one.outline), NEIGHBOURHOOD_METRES));
  const taken = outlines.map(() => false);
  const reached = [...seeds];
  for (let i = 0; i < reached.length; i++) {
    const from = reached[i] as Box;
    boxes.forEach((box, j) => {
      if (taken[j] || !boxesMeet(from, box)) return;
      taken[j] = true;
      reached.push(box);
    });
  }
  return outlines.filter((_one, j) => taken[j]);
}

/**
 * The overlaps and gaps a change of the outlines makes (`before` to `after`, by key), as a save
 * is checked (spec 4.3: Save refuses a new overlap or gap; one that is there already does not
 * block). Overlaps are cut only near what changed: the outlines whose boxes meet, within
 * `NEIGHBOURHOOD_METRES`, the boxes of the outlines changed, added or removed (before and
 * after), on both sides alike; a new overlap can only lie there. Gaps are cut over the outlines
 * chained to what changed (`chainedTo`), so that a region closing a ring of regions far beyond
 * it is seen to close the hole. `cache` keeps the overlaps of the pairs that did not change.
 * Throws when polyclip cannot cut the outlines.
 */
export function newProblems(
  before: readonly Outlined[],
  after: readonly Outlined[],
  cache?: OverlapCache,
): Coverage {
  const old = new Map(before.map((one) => [one.key, one.outline]));
  const fresh = new Map(after.map((one) => [one.key, one.outline]));
  const changed = new Set(
    [...old.keys(), ...fresh.keys()].filter((key) => {
      const a = old.get(key);
      const b = fresh.get(key);
      return !a || !b || !sameOutline(a, b);
    }),
  );
  if (changed.size === 0) return { overlaps: [], gaps: [] };
  const dirty = [...changed].flatMap((key) =>
    [old.get(key), fresh.get(key)].flatMap((outline) =>
      outline && outline.length > 0 ? [grownBox(boxOf(outline), NEIGHBOURHOOD_METRES)] : [],
    ),
  );
  const near = (one: Outlined): boolean => {
    const box = boxOf(one.outline);
    return dirty.some((area) => boxesMeet(area, box));
  };
  const touches = (piece: Piece): boolean => dirty.some((area) => boxesMeet(area, piece.box));
  const overlapsNow = overlapsOf(shapedOf(after.filter(near)), cache).filter(
    (piece) => changed.has(piece.between[0]) || changed.has(piece.between[1]),
  );
  const overlapsThen = overlapsOf(shapedOf(before.filter(near)), cache).filter(touches);
  const gapsNow = gapsOf(shapedOf(chainedTo(dirty, after))).filter(touches);
  const gapsThen = gapsOf(shapedOf(chainedTo(dirty, before))).filter(touches);
  return {
    overlaps: newPieces(overlapsNow, overlapsThen),
    gaps: newPieces(gapsNow, gapsThen),
  };
}
