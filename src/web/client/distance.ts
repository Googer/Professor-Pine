import { metresBetween } from '@pine/wayspot-core/distance';
import { distanceWords, type DistanceUnits } from '../../render/distance-words.js';

/**
 * Distances on the live map (plan 8M-7), for the list and the plans after it: measured by the
 * one function the rest of Pine measures with (`metresBetween` of `@pine/wayspot-core`: the
 * place search, Wayfarer matching), said by `distanceWords` in the units of
 * `settings.distanceUnits` (task 7), which the page reads from `data-distance-units`.
 */

export interface Place {
  lat: number;
  lon: number;
}

/** How far apart two places are, in meters: the shared function itself, never a copy. */
export const metersBetween: (a: Place, b: Place) => number = metresBetween;

/**
 * A place as the page sends it to the server to measure from (`near=<lat>,<lon>`: Find's places,
 * the Report button's nearest), at three decimals (plan 8Z-2, audit L-W3): a point within some
 * 80 meters, enough to order places by how near they are, where six decimals told the member's
 * own spot to a tenth of a meter in a GET query, which proxies and logs keep. The distances the
 * page shows are measured in the page, from the place itself.
 */
export function nearParam(at: Place): string {
  return `${at.lat.toFixed(3)},${at.lon.toFixed(3)}`;
}

/** A distance in words: `distanceWords` of `src/render/`, the one wording of the map and Discord. */
export { distanceWords, type DistanceUnits };
