import type { LatLon } from '@pine/wayspot-core/lat-lon';

/**
 * Lines of places measured flat, in metres (for the region editor's Fix, plan 8M-2F): at the
 * size of a sliver (a few kilometres long, metres to a few hundred metres wide) the earth is
 * flat enough, measured at one latitude.
 */

/** The metres of a degree of latitude on a sphere of the earth's mean radius. */
const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;

/** Places as flat metres east and north of a latitude's scale. */
export class Flat {
  private readonly perLon: number;

  constructor(lat: number) {
    this.perLon = METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
  }

  /** Where `to` lies from `from`, in metres east and north. */
  offset(from: LatLon, to: LatLon): { x: number; y: number } {
    return { x: (to.lon - from.lon) * this.perLon, y: (to.lat - from.lat) * METRES_PER_DEGREE };
  }

  /** How far apart two places are, in metres. */
  distance(a: LatLon, b: LatLon): number {
    return Math.hypot((b.lon - a.lon) * this.perLon, (b.lat - a.lat) * METRES_PER_DEGREE);
  }

  /**
   * Where on the segment a-b a place is nearest: how far along it (0 at a, 1 at b) and how far
   * from it, in metres.
   */
  onSegment(point: LatLon, a: LatLon, b: LatLon): { t: number; distance: number } {
    const dx = (b.lon - a.lon) * this.perLon;
    const dy = (b.lat - a.lat) * METRES_PER_DEGREE;
    const px = (point.lon - a.lon) * this.perLon;
    const py = (point.lat - a.lat) * METRES_PER_DEGREE;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / length));
    return { t, distance: Math.hypot(px - t * dx, py - t * dy) };
  }

  /** How long a line is, in metres. */
  length(line: readonly LatLon[]): number {
    let metres = 0;
    for (let i = 1; i < line.length; i++) metres += this.distance(line[i - 1]!, line[i]!);
    return metres;
  }

  /**
   * Where on a line a place is nearest: how far along the line (metres from its start), the
   * place there, and how far from it.
   */
  nearest(line: readonly LatLon[], point: LatLon): { along: number; at: LatLon; distance: number } {
    let best = { along: 0, at: line[0] ?? point, distance: Infinity };
    let travelled = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!;
      const b = line[i]!;
      const side = this.distance(a, b);
      const { t, distance } = this.onSegment(point, a, b);
      if (distance < best.distance) {
        best = { along: travelled + t * side, at: between(a, b, t), distance };
      }
      travelled += side;
    }
    return best;
  }

  /** The place a distance along a line (metres from its start; its ends beyond it). */
  at(line: readonly LatLon[], along: number): LatLon {
    let travelled = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!;
      const b = line[i]!;
      const side = this.distance(a, b);
      if (travelled + side >= along)
        return between(a, b, side === 0 ? 0 : (along - travelled) / side);
      travelled += side;
    }
    return line[line.length - 1] ?? { lat: 0, lon: 0 };
  }

  /** The line's corners, and places between them at most `step` metres apart. */
  samples(line: readonly LatLon[], step: number): LatLon[] {
    const found: LatLon[] = [];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!;
      const b = line[i]!;
      const parts = Math.max(1, Math.ceil(this.distance(a, b) / step));
      for (let k = 0; k < parts; k++) found.push(between(a, b, k / parts));
    }
    const last = line[line.length - 1];
    if (last) found.push(last);
    return found;
  }

  /**
   * Places evenly along a line, its corners not among them: `step` metres apart, or farther so
   * that there are at most `most` (at least 2); the first is its start, the last its end.
   */
  resampled(line: readonly LatLon[], step: number, most: number): LatLon[] {
    const first = line[0];
    const last = line[line.length - 1];
    if (!first || !last) return [];
    const count = Math.max(2, Math.min(most, Math.ceil(this.length(line) / step) + 1));
    const spacing = this.length(line) / (count - 1);
    const found: LatLon[] = [first];
    let i = 1;
    let travelled = 0;
    let side = line.length > 1 ? this.distance(first, line[1]!) : 0;
    for (let k = 1; k < count - 1; k++) {
      const along = k * spacing;
      // On the first side whose end is at least that far along.
      while (i < line.length - 1 && travelled + side < along) {
        travelled += side;
        i++;
        side = this.distance(line[i - 1]!, line[i]!);
      }
      const t = side === 0 ? 0 : Math.min(1, (along - travelled) / side);
      found.push(between(line[i - 1]!, line[i]!, t));
    }
    found.push(last);
    return found;
  }

  /** A place as metres east of the meridian and north of the equator, at this scale. */
  metres(point: LatLon): { x: number; y: number } {
    return { x: point.lon * this.perLon, y: point.lat * METRES_PER_DEGREE };
  }
}

/** A line of at most this many corners is searched side by side, without cells. */
const UNFILED_CORNERS = 64;

/**
 * The sides of a line (each from a corner to the next) filed in square cells of `cell` metres,
 * so that the sides near a place are found without going through all of them: a border traced
 * along a township line has thousands of corners. A short line is not filed.
 */
export class SegmentGrid {
  private readonly cells: Map<number, number[]> | undefined;

  constructor(
    private readonly line: readonly LatLon[],
    private readonly flat: Flat,
    private readonly cell: number,
  ) {
    if (line.length <= UNFILED_CORNERS) return;
    this.cells = new Map();
    for (let i = 1; i < line.length; i++) {
      const a = flat.metres(line[i - 1]!);
      const b = flat.metres(line[i]!);
      // Filed in the cells of places along it half a cell apart: every place of the side lies
      // within a quarter of a cell of one of them, so in that one's cell or the next.
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell / 2)));
      const filed = new Set<number>();
      for (let k = 0; k <= steps; k++) {
        const cx = Math.floor((a.x + ((b.x - a.x) * k) / steps) / cell);
        const cy = Math.floor((a.y + ((b.y - a.y) * k) / steps) / cell);
        filed.add(cellKey(cx, cy));
      }
      for (const one of filed) {
        const sides = this.cells.get(one);
        if (sides) sides.push(i - 1);
        else this.cells.set(one, [i - 1]);
      }
    }
  }

  /**
   * How far a place lies from the nearest side of the line, in metres, when that is at most
   * `within`; `Infinity` when no side lies that near. The cells are searched in rings round the
   * place's: a side `d` metres away is filed at most `d / cell + 1` rings out (rounded up), so
   * once a side is found within `(ring - 1) × cell` none nearer is left.
   */
  distance(point: LatLon, within: number): number {
    if (!this.cells) {
      const { distance } = this.flat.nearest(this.line, point);
      return distance <= within ? distance : Infinity;
    }
    const { x, y } = this.flat.metres(point);
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    const rings = Math.ceil(within / this.cell) + 1;
    let nearest = Infinity;
    for (let ring = 0; ring <= rings; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        // The cells of this ring only: its top and bottom rows whole, of the others both ends.
        const edge = dx === -ring || dx === ring;
        for (let dy = -ring; dy <= ring; dy += edge || ring === 0 ? 1 : 2 * ring) {
          for (const i of this.cells.get(cellKey(cx + dx, cy + dy)) ?? []) {
            const { distance } = this.flat.onSegment(point, this.line[i]!, this.line[i + 1]!);
            if (distance < nearest) nearest = distance;
          }
        }
      }
      if (nearest <= (ring - 1) * this.cell) break;
    }
    return nearest <= within ? nearest : Infinity;
  }

  /**
   * The sides of the line that lie at most `within` metres from a place, by their index (the
   * side from corner `i` to corner `i + 1`), in order. Every cell out to `within / cell + 1`
   * rings round the place's is searched (as `distance` bounds them).
   */
  sidesNear(point: LatLon, within: number): number[] {
    const near = (i: number): boolean =>
      this.flat.onSegment(point, this.line[i]!, this.line[i + 1]!).distance <= within;
    if (!this.cells) {
      const found: number[] = [];
      for (let i = 0; i + 1 < this.line.length; i++) if (near(i)) found.push(i);
      return found;
    }
    const { x, y } = this.flat.metres(point);
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    const rings = Math.ceil(within / this.cell) + 1;
    const found = new Set<number>();
    for (let dx = -rings; dx <= rings; dx++) {
      for (let dy = -rings; dy <= rings; dy++) {
        for (const i of this.cells.get(cellKey(cx + dx, cy + dy)) ?? []) {
          if (!found.has(i) && near(i)) found.add(i);
        }
      }
    }
    return [...found].sort((a, b) => a - b);
  }
}

/** A cell of a grid as one number (for cells of a metre or more, a row is below 2·10⁷). */
const cellKey = (cx: number, cy: number): number => cx * 100_000_000 + cy;

/**
 * A line with fewer corners (Douglas and Peucker): every corner left out lies within `metres` of
 * the line kept. Its ends are kept.
 */
export function simplified(line: readonly LatLon[], metres: number, flat: Flat): LatLon[] {
  if (line.length <= 2) return [...line];
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const spans: [number, number][] = [[0, line.length - 1]];
  for (let span = spans.pop(); span; span = spans.pop()) {
    const [from, to] = span;
    let farthest = -1;
    let at = -1;
    for (let i = from + 1; i < to; i++) {
      const { distance } = flat.onSegment(line[i]!, line[from]!, line[to]!);
      if (distance > farthest) {
        farthest = distance;
        at = i;
      }
    }
    if (at >= 0 && farthest > metres) {
      keep[at] = 1;
      spans.push([from, at], [at, to]);
    }
  }
  return line.filter((_point, i) => keep[i] === 1);
}

/** The place a share `t` of the way from a to b. */
export const between = (a: LatLon, b: LatLon, t: number): LatLon => ({
  lat: a.lat + (b.lat - a.lat) * t,
  lon: a.lon + (b.lon - a.lon) * t,
});
