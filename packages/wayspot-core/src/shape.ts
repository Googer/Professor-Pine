import type { LatLon } from './lat-lon.js';
import { segmentsMeet } from './outline.js';
import { boxOf, inBox, ringContains, type Box } from './region-membership.js';

/** An area with the holes in it; each ring closed (its first point is also its last). */
export interface Area {
  outer: LatLon[];
  holes: LatLon[][];
}

/**
 * A place on the map: a point, lines (a street, a river: each an open list of points), or
 * areas (a park, a town). Latitude and longitude are taken as flat coordinates, as everywhere
 * regions are compared with what lies in them.
 */
export type Shape =
  | { kind: 'point'; point: LatLon }
  | { kind: 'line'; lines: LatLon[][] }
  | { kind: 'area'; areas: Area[] };

/** Every point of a shape: the point, the lines' points, the areas' rings. */
export function shapePoints(shape: Shape): LatLon[] {
  switch (shape.kind) {
    case 'point':
      return [shape.point];
    case 'line':
      return shape.lines.flat();
    case 'area':
      return shape.areas.flatMap((area) => [...area.outer, ...area.holes.flat()]);
  }
}

/** The smallest box that holds all these paths, read in place (no list of all points is made). */
function boxOfPaths(paths: readonly (readonly LatLon[])[]): Box {
  const box = { south: Infinity, north: -Infinity, west: Infinity, east: -Infinity };
  for (const path of paths) {
    for (const { lat, lon } of path) {
      if (lat < box.south) box.south = lat;
      if (lat > box.north) box.north = lat;
      if (lon < box.west) box.west = lon;
      if (lon > box.east) box.east = lon;
    }
  }
  return box;
}

/** The paths of a shape: the point as a path of one, the lines, the areas' rings. */
function pathsOf(shape: Shape): (readonly LatLon[])[] {
  switch (shape.kind) {
    case 'point':
      return [[shape.point]];
    case 'line':
      return shape.lines;
    case 'area':
      return shape.areas.flatMap((area) => [area.outer, ...area.holes]);
  }
}

/** The smallest box that holds a shape. */
export function shapeBox(shape: Shape): Box {
  return boxOfPaths(pathsOf(shape));
}

const boxesMeet = (a: Box, b: Box): boolean =>
  a.south <= b.north && b.south <= a.north && a.west <= b.east && b.west <= a.east;

/** A side of a path: its two ends and its box. */
interface Side {
  a: LatLon;
  b: LatLon;
  west: number;
  east: number;
  south: number;
  north: number;
  /** Which of the two sets it is of. */
  of: 0 | 1;
}

function sidesOf(paths: readonly (readonly LatLon[])[], of: 0 | 1, within: Box): Side[] {
  const sides: Side[] = [];
  for (const path of paths) {
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i] as LatLon;
      const b = path[i + 1] as LatLon;
      const side: Side = {
        a,
        b,
        west: Math.min(a.lon, b.lon),
        east: Math.max(a.lon, b.lon),
        south: Math.min(a.lat, b.lat),
        north: Math.max(a.lat, b.lat),
        of,
      };
      if (boxesMeet(side, within)) sides.push(side);
    }
  }
  return sides;
}

/**
 * Whether a side of one set of paths meets a side of the other. Only sides inside the box both
 * sets share are looked at, and of those only sides whose spans of longitude overlap are
 * compared (a sweep in the order of where they begin), so outlines of thousands of corners are
 * compared in milliseconds.
 */
export function pathsMeet(
  first: readonly (readonly LatLon[])[],
  second: readonly (readonly LatLon[])[],
): boolean {
  const firstBox = boxOfPaths(first);
  const secondBox = boxOfPaths(second);
  if (!boxesMeet(firstBox, secondBox)) return false;
  const shared: Box = {
    south: Math.max(firstBox.south, secondBox.south),
    north: Math.min(firstBox.north, secondBox.north),
    west: Math.max(firstBox.west, secondBox.west),
    east: Math.min(firstBox.east, secondBox.east),
  };
  const sides = [...sidesOf(first, 0, shared), ...sidesOf(second, 1, shared)].sort(
    (a, b) => a.west - b.west,
  );
  const open: Side[] = [];
  for (const side of sides) {
    let kept = 0;
    for (const other of open) if (other.east >= side.west) open[kept++] = other;
    open.length = kept;
    for (const other of open) {
      if (other.of === side.of) continue;
      if (side.north < other.south || other.north < side.south) continue;
      if (segmentsMeet(side.a, side.b, other.a, other.b)) return true;
    }
    open.push(side);
  }
  return false;
}

/** Whether a point lies in one of the areas, outside its holes. */
export function inAreas(areas: readonly Area[], point: LatLon): boolean {
  return areas.some(
    (area) =>
      ringContains(area.outer, point) && !area.holes.some((hole) => ringContains(hole, point)),
  );
}

/**
 * Whether a shape and the outline of a region (a closed ring) have something in common: the
 * region contains the point; a line or an area crosses the region's outline (an area's holes
 * count as outline), or, where no sides meet, one lies wholly in the other, which one point of
 * each part says (a region that lies wholly in a hole has nothing in common with the area). So
 * the cost is the sweep over the sides near both and a test of a few points, never every
 * corner against the other outline. A shape that only touches the outline may be counted either
 * way.
 */
export function shapeTouches(shape: Shape, ring: readonly LatLon[]): boolean {
  const box = boxOf(ring);
  if (!boxesMeet(box, shapeBox(shape))) return false;
  const inRegion = (point: LatLon | undefined): boolean =>
    point !== undefined && inBox(box, point) && ringContains(ring, point);
  switch (shape.kind) {
    case 'point':
      return inRegion(shape.point);
    case 'line':
      // Without a crossing, each line lies wholly in the region or wholly outside it.
      return pathsMeet(shape.lines, [ring]) || shape.lines.some((line) => inRegion(line[0]));
    case 'area': {
      if (pathsMeet(pathsOf(shape), [ring])) return true;
      // No sides meet: each part lies wholly in the region, or the region wholly in a part (and
      // then in its hole or not), or they are apart.
      if (shape.areas.some((area) => inRegion(area.outer[0]))) return true;
      const corner = ring[0];
      return corner !== undefined && inAreas(shape.areas, corner);
    }
  }
}

/** The regions with something in common with a shape (`shapeTouches`), in their order. */
export function regionsTouching<R extends { bounds: readonly LatLon[] | null }>(
  shape: Shape,
  regions: readonly R[],
): R[] {
  return regions.filter((region) => region.bounds !== null && shapeTouches(shape, region.bounds));
}

/** Twice the area of a ring in square degrees, without its sign (shoelace). */
function ringArea(ring: readonly LatLon[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i] as LatLon;
    const b = ring[i + 1] as LatLon;
    sum += a.lon * b.lat - b.lon * a.lat;
  }
  return Math.abs(sum);
}

/** The size of a shape, to choose the largest of several: area for areas, length for lines. */
export function shapeSize(shape: Shape): number {
  switch (shape.kind) {
    case 'point':
      return 0;
    case 'line':
      return shape.lines.reduce((sum, line) => {
        let length = 0;
        for (let i = 0; i + 1 < line.length; i++) {
          const a = line[i] as LatLon;
          const b = line[i + 1] as LatLon;
          length += Math.hypot(a.lat - b.lat, a.lon - b.lon);
        }
        return sum + length;
      }, 0);
    case 'area':
      return shape.areas.reduce(
        (sum, area) =>
          sum +
          ringArea(area.outer) -
          area.holes.reduce((holes, hole) => holes + ringArea(hole), 0),
        0,
      );
  }
}

/**
 * The largest of several shapes, as the legacy bot chose among what a search found: an area
 * before a line before a point, the largest area or the longest line, and of points the first.
 */
export function largestShape<T extends { shape: Shape }>(found: readonly T[]): T | undefined {
  const rank: Record<Shape['kind'], number> = { area: 2, line: 1, point: 0 };
  let best: T | undefined;
  for (const one of found) {
    if (
      !best ||
      rank[one.shape.kind] > rank[best.shape.kind] ||
      (rank[one.shape.kind] === rank[best.shape.kind] &&
        shapeSize(one.shape) > shapeSize(best.shape))
    ) {
      best = one;
    }
  }
  return best;
}

/** The box of all regions' outlines, to search places in; undefined when none has one. */
export function regionsBox(
  regions: readonly { bounds: readonly LatLon[] | null }[],
): Box | undefined {
  const points = regions.flatMap((region) => region.bounds ?? []);
  return points.length === 0 ? undefined : boxOf(points);
}

/** Kilometres in a degree of latitude (and of longitude at the equator). */
const KM_PER_DEGREE = 111.32;

/**
 * The box widened by `km` on every side (longitude by the latitude farther from the equator),
 * within the earth's limits: to search places near the regions, not only inside their box.
 */
export function widenedBox(box: Box, km: number): Box {
  const lat = km / KM_PER_DEGREE;
  const widest = Math.min(89, Math.max(Math.abs(box.south), Math.abs(box.north)));
  const lon = lat / Math.cos((widest * Math.PI) / 180);
  return {
    south: Math.max(-90, box.south - lat),
    north: Math.min(90, box.north + lat),
    west: Math.max(-180, box.west - lon),
    east: Math.min(180, box.east + lon),
  };
}
