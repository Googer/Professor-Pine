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

/** A distance in words: `distanceWords` of `src/render/`, the one wording of the map and Discord. */
export { distanceWords, type DistanceUnits };
