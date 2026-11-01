/** A position in decimal degrees. */
export interface LatLon {
  lat: number;
  lon: number;
}

/** A polygon outline is usable when it has at least a triangle and ends where it starts. */
export function isClosedRing(ring: readonly LatLon[]): boolean {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length < 4 || !first || !last) return false;
  return first.lat === last.lat && first.lon === last.lon;
}
