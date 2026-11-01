import type { LatLon } from './lat-lon.js';

const EARTH_RADIUS_M = 6_371_000;
const RADIANS = Math.PI / 180;

/** The distance between two points in metres, along the surface of the earth (haversine). */
export function metresBetween(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RADIANS;
  const dLon = (b.lon - a.lon) * RADIANS;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RADIANS) * Math.cos(b.lat * RADIANS) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A place with an id: what the functions here need of a gym. */
export interface Placed extends LatLon {
  id: number;
}

/**
 * Those of `places` that lie within `metres` of a point, nearest first (ties: the lower id),
 * each with its distance. `exceptId` leaves one out: the gym that is being moved.
 */
export function placesWithin<P extends Placed>(
  point: LatLon,
  places: Iterable<P>,
  metres: number,
  exceptId?: number,
): { place: P; metres: number }[] {
  const found: { place: P; metres: number }[] = [];
  for (const place of places) {
    if (place.id === exceptId) continue;
    const distance = metresBetween(point, place);
    if (distance <= metres) found.push({ place, metres: distance });
  }
  return found.sort((a, b) => a.metres - b.metres || a.place.id - b.place.id);
}

/**
 * The one of `places` nearest to `of`, which itself does not count, with its distance; of
 * several equally near, the one with the lowest id. Undefined when there is no other.
 */
export function nearestTo<P extends Placed>(
  of: Placed,
  places: Iterable<P>,
): { place: P; metres: number } | undefined {
  let best: { place: P; metres: number } | undefined;
  for (const place of places) {
    if (place.id === of.id) continue;
    const metres = metresBetween(of, place);
    if (!best || metres < best.metres || (metres === best.metres && place.id < best.place.id)) {
      best = { place, metres };
    }
  }
  return best;
}
