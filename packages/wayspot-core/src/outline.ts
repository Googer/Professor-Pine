import type { LatLon } from './lat-lon.js';

/**
 * How many corners the outline of a region may have. A region drawn by hand has tens; one
 * traced along a boundary (a township line) has thousands (ruled 2026-10-13: those must be
 * accepted). The check for crossings compares only sides whose spans of longitude overlap (a
 * sweep, see `isSimple`): an outline this long is checked in milliseconds (outline.test.ts
 * holds the longest under a second).
 */
export const MAX_OUTLINE_CORNERS = 5_000;

/** Why a list of points cannot be the outline of a region. */
export type OutlineProblem =
  /** A latitude or longitude that is no finite number. */
  | { kind: 'not-a-number' }
  /** A latitude outside -90..90 or a longitude outside -180..180. */
  | { kind: 'out-of-range' }
  /** Fewer than three distinct corners: no area. */
  | { kind: 'too-few' }
  /** More corners than `MAX_OUTLINE_CORNERS`. */
  | { kind: 'too-many'; corners: number }
  /** Two sides cross, touch or run along each other. */
  | { kind: 'crosses-itself' };

export type TidyOutline = { ok: true; ring: LatLon[] } | { ok: false; problem: OutlineProblem };

const same = (a: LatLon, b: LatLon): boolean => a.lat === b.lat && a.lon === b.lon;

/** Twice the signed area of the triangle a, b, c: zero when the three lie on one line. */
function turn(a: LatLon, b: LatLon, c: LatLon): number {
  return (b.lat - a.lat) * (c.lon - a.lon) - (b.lon - a.lon) * (c.lat - a.lat);
}

/** Whether c, known to lie on the line through a and b, lies between them (ends included). */
function between(a: LatLon, b: LatLon, c: LatLon): boolean {
  return (
    Math.min(a.lat, b.lat) <= c.lat &&
    c.lat <= Math.max(a.lat, b.lat) &&
    Math.min(a.lon, b.lon) <= c.lon &&
    c.lon <= Math.max(a.lon, b.lon)
  );
}

/** Whether the segments a-b and c-d have a point in common, their ends included (flat coordinates). */
export function segmentsMeet(a: LatLon, b: LatLon, c: LatLon, d: LatLon): boolean {
  const abc = turn(a, b, c);
  const abd = turn(a, b, d);
  const cda = turn(c, d, a);
  const cdb = turn(c, d, b);
  if (
    ((abc > 0 && abd < 0) || (abc < 0 && abd > 0)) &&
    ((cda > 0 && cdb < 0) || (cda < 0 && cdb > 0))
  )
    return true;
  return (
    (abc === 0 && between(a, b, c)) ||
    (abd === 0 && between(a, b, d)) ||
    (cda === 0 && between(c, d, a)) ||
    (cdb === 0 && between(c, d, b))
  );
}

/**
 * Whether two sides that share the corner `shared` run back along each other: `before` and
 * `after` (their other ends) lie on one line with it, on the same side of it.
 */
function foldsBack(before: LatLon, shared: LatLon, after: LatLon): boolean {
  if (turn(before, shared, after) !== 0) return false;
  const dot =
    (before.lat - shared.lat) * (after.lat - shared.lat) +
    (before.lon - shared.lon) * (after.lon - shared.lon);
  return dot > 0;
}

/**
 * Whether a ring of distinct neighbouring corners (open: the last joins the first) is simple.
 * Neighbouring sides must not run back along each other; any other two sides must not meet.
 * Only sides whose spans of longitude overlap can meet: the sides are taken in the order of
 * where they begin in longitude, and each is compared only with those still open there (a
 * sweep), and of those only with sides whose span of latitude overlaps its own. A traced
 * boundary of thousands of corners is so checked in milliseconds.
 */
function isSimple(corners: readonly LatLon[]): boolean {
  const n = corners.length;
  const at = (i: number): LatLon => corners[i % n] as LatLon;
  for (let i = 0; i < n; i++) {
    // The sides i and i + 1 share corner i + 1.
    if (foldsBack(at(i), at(i + 1), at(i + 2))) return false;
  }
  const west = new Float64Array(n);
  const east = new Float64Array(n);
  const south = new Float64Array(n);
  const north = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = at(i);
    const b = at(i + 1);
    west[i] = Math.min(a.lon, b.lon);
    east[i] = Math.max(a.lon, b.lon);
    south[i] = Math.min(a.lat, b.lat);
    north[i] = Math.max(a.lat, b.lat);
  }
  const order = Array.from({ length: n }, (_unused, i) => i).sort(
    (a, b) => (west[a] ?? 0) - (west[b] ?? 0),
  );
  const open: number[] = [];
  for (const i of order) {
    const from = west[i] ?? 0;
    // The sides that end west of this one are closed: dropped in place, without a new list.
    let kept = 0;
    for (const j of open) if ((east[j] ?? 0) >= from) open[kept++] = j;
    open.length = kept;
    for (const j of open) {
      // Neighbours share a corner, and were looked at above.
      const apart = Math.abs(i - j);
      if (apart === 1 || apart === n - 1) continue;
      if ((north[i] ?? 0) < (south[j] ?? 0) || (north[j] ?? 0) < (south[i] ?? 0)) continue;
      if (segmentsMeet(at(i), at(i + 1), at(j), at(j + 1))) return false;
    }
    open.push(i);
  }
  return true;
}

/**
 * Makes the outline of a region of the points of a ring, or says why they are none. Points that
 * repeat the one before are dropped, and the ring is closed (its first point is also its last),
 * as `RegionRepository` stores it. Refused: a coordinate that is no number or out of range,
 * fewer than three distinct corners, more than `MAX_OUTLINE_CORNERS`, and an outline that
 * crosses or touches itself (by a sweep over the sides in the order of their longitude, which
 * compares only sides that are near each other: `isSimple`): MySQL's `ST_Contains` and
 * `ringContains` are only sure to agree on a simple polygon. Either
 * winding is accepted and kept. Latitude and longitude are taken as flat coordinates, as
 * everywhere regions are compared with gyms.
 */
export function tidyOutline(points: readonly LatLon[]): TidyOutline {
  const refused = (problem: OutlineProblem): TidyOutline => ({ ok: false, problem });
  const corners: LatLon[] = [];
  for (const { lat, lon } of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return refused({ kind: 'not-a-number' });
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return refused({ kind: 'out-of-range' });
    const last = corners[corners.length - 1];
    if (!last || !same(last, { lat, lon })) corners.push({ lat, lon });
  }
  // The closing point of a closed ring repeats the first: the corners are the open ring.
  const first = corners[0];
  while (corners.length > 1 && first && same(first, corners[corners.length - 1] as LatLon)) {
    corners.pop();
  }
  const distinct = new Set(corners.map(({ lat, lon }) => `${lat} ${lon}`)).size;
  if (distinct < 3) return refused({ kind: 'too-few' });
  if (corners.length > MAX_OUTLINE_CORNERS) {
    return refused({ kind: 'too-many', corners: corners.length });
  }
  if (!isSimple(corners)) return refused({ kind: 'crosses-itself' });
  return { ok: true, ring: [...corners, { ...(first as LatLon) }] };
}
