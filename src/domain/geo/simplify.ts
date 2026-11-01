import type { LatLon } from '@pine/wayspot-core/lat-lon';

/**
 * The square of how far `point` lies from the segment a-b, in degrees taken as flat
 * coordinates (the square: `Math.hypot` would make a long line several times slower).
 */
function distanceSquared(point: LatLon, a: LatLon, b: LatLon): number {
  const dLat = b.lat - a.lat;
  const dLon = b.lon - a.lon;
  const length = dLat * dLat + dLon * dLon;
  // A segment without length (the closing point of a ring is its first): the distance to it.
  const along =
    length === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((point.lat - a.lat) * dLat + (point.lon - a.lon) * dLon) / length),
        );
  const offLat = point.lat - (a.lat + along * dLat);
  const offLon = point.lon - (a.lon + along * dLon);
  return offLat * offLat + offLon * offLon;
}

/**
 * A line with fewer points that stays within `tolerance` (degrees) of the line given
 * (Douglas-Peucker): its first and last point are kept, and every point kept is one of the
 * line's own, in their order. It works on a list of stretches, never by calling itself, so a
 * long line cannot exhaust the stack. A closed ring stays closed.
 */
export function simplifyLine(points: readonly LatLon[], tolerance: number): LatLon[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stretches: [number, number][] = [[0, points.length - 1]];
  for (let stretch = stretches.pop(); stretch; stretch = stretches.pop()) {
    const [from, to] = stretch;
    const a = points[from];
    const b = points[to];
    if (!a || !b) continue;
    let farthest = -1;
    let most = tolerance * tolerance;
    for (let i = from + 1; i < to; i++) {
      const point = points[i];
      const away = point ? distanceSquared(point, a, b) : 0;
      if (away > most) {
        most = away;
        farthest = i;
      }
    }
    if (farthest < 0) continue;
    keep[farthest] = true;
    stretches.push([from, farthest], [farthest, to]);
  }
  return points.filter((_point, i) => keep[i]);
}
