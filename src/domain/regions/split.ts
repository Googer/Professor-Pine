import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { tidyOutline } from '@pine/wayspot-core/outline';
import { ringContains } from '@pine/wayspot-core/region-membership';
import { ringArea } from './coverage.js';

/**
 * What came of splitting an outline along a line: its two parts, the larger first (it keeps the
 * region; the other becomes a new one), or why there are none. `not-across`: the line does not
 * go in through the outline and out again (it crosses once or never, or runs outside between
 * its crossings); `several-crossings`: it crosses more than twice; `crosses-itself`: a part
 * would cross itself (the line does); `too-many-corners`: a part would have more corners than
 * an outline may.
 */
export type Split =
  | { ok: true; parts: [LatLon[], LatLon[]] }
  | {
      ok: false;
      reason: 'not-across' | 'several-crossings' | 'crosses-itself' | 'too-many-corners';
    };

/** Where the line crosses the outline: along the line, on which side of the outline, where. */
interface Crossing {
  /** The line's segment and how far along it: `j + t`. */
  along: number;
  /** The outline's side (from corner `side` to the next) and how far along it, `0 <= u < 1`. */
  side: number;
  u: number;
  point: LatLon;
}

/** Where segment a-b meets segment c-d (flat coordinates): how far along each, or undefined. */
function meet(a: LatLon, b: LatLon, c: LatLon, d: LatLon): { t: number; u: number } | undefined {
  const rx = b.lon - a.lon;
  const ry = b.lat - a.lat;
  const sx = d.lon - c.lon;
  const sy = d.lat - c.lat;
  const denominator = rx * sy - ry * sx;
  if (denominator === 0) return undefined;
  const qx = c.lon - a.lon;
  const qy = c.lat - a.lat;
  const t = (qx * sy - qy * sx) / denominator;
  const u = (qx * ry - qy * rx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u < 1 ? { t, u } : undefined;
}

/**
 * Splits an outline (closed) along a line drawn across it (spec 4.2): the line must go in
 * through the outline and out again, once; its ends may lie on the outline (where snapping puts
 * them) or outside it. Each part is the line's stretch inside the outline and the outline's
 * corners on one side of it, tidied (`tidyOutline`).
 */
export function splitOutline(ring: readonly LatLon[], line: readonly LatLon[]): Split {
  const corners = ring.slice(0, -1);
  const n = corners.length;
  const crossings: Crossing[] = [];
  for (let j = 0; j + 1 < line.length; j++) {
    const a = line[j] as LatLon;
    const b = line[j + 1] as LatLon;
    for (let side = 0; side < n; side++) {
      const met = meet(a, b, corners[side] as LatLon, corners[(side + 1) % n] as LatLon);
      if (!met) continue;
      const along = j + met.t;
      // A crossing at a corner of the line is found on both of its segments.
      if (crossings.some((crossing) => Math.abs(crossing.along - along) < 1e-12)) continue;
      crossings.push({
        along,
        side,
        u: met.u,
        point: { lat: a.lat + (b.lat - a.lat) * met.t, lon: a.lon + (b.lon - a.lon) * met.t },
      });
    }
  }
  if (crossings.length > 2) return { ok: false, reason: 'several-crossings' };
  crossings.sort((x, y) => x.along - y.along);
  const [first, second] = crossings;
  if (!first || !second) return { ok: false, reason: 'not-across' };
  const middle = line.filter((_corner, k) => k > first.along && k < second.along);
  // The line must run inside between its crossings, not out and back in.
  const next = middle[0] ?? second.point;
  const probe = { lat: (first.point.lat + next.lat) / 2, lon: (first.point.lon + next.lon) / 2 };
  if (!ringContains(ring, probe)) return { ok: false, reason: 'not-across' };

  /** The outline's corners after `from` up to `to`, going round the way the outline winds. */
  const forward = (from: Crossing, to: Crossing): LatLon[] => {
    const start = from.side + from.u;
    let end = to.side + to.u;
    if (end <= start) end += n;
    const found: LatLon[] = [];
    for (let k = from.side + 1; k <= end; k++) found.push(corners[k % n] as LatLon);
    return found;
  };
  const one = [first.point, ...middle, second.point, ...forward(second, first), first.point];
  const other = [second.point, ...[...middle].reverse(), first.point, ...forward(first, second)];
  const tidied = [tidyOutline(one), tidyOutline(other)];
  const parts: LatLon[][] = [];
  for (const tidy of tidied) {
    if (tidy.ok) {
      parts.push(tidy.ring);
      continue;
    }
    if (tidy.problem.kind === 'crosses-itself') return { ok: false, reason: 'crosses-itself' };
    if (tidy.problem.kind === 'too-many') return { ok: false, reason: 'too-many-corners' };
    return { ok: false, reason: 'not-across' };
  }
  const [a, b] = parts as [LatLon[], LatLon[]];
  return { ok: true, parts: ringArea(a) >= ringArea(b) ? [a, b] : [b, a] };
}
