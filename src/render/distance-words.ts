/**
 * A distance in words, one wording for the live map and every Discord text that says a distance
 * (Matt, 2026-10-25: one setting shared by both; since plan 19A-1 a server's, its values'
 * `distanceUnits`, read through `ServerSettings.of`). No import, so that the page's bundle takes it as the renderer does.
 */

/** The units distances are said in (a server's `distanceUnits`, plan 19A-1). */
export type DistanceUnits = 'imperial' | 'metric';

/** The units themselves in words (`/admin setup`'s checklist), beside the distances said in them. */
export function unitsWords(units: DistanceUnits): string {
  return units === 'metric' ? 'meters and kilometers' : 'feet and miles';
}

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.280_839_9;

/**
 * A short distance is never rounded to nothing (the controller's ruling): under 100 of the unit
 * to the whole one. Imperial: under 100 ft to the foot (`2 ft`), under a tenth of a mile to ten
 * feet (`520 ft`), else miles to one decimal (`1.3 mi`). Metric: under 100 m to the meter
 * (`2 m`), under a kilometer to ten (`440 m`), else kilometers to one decimal (`1.3 km`); what
 * would round to 1000 m is said as `1.0 km`.
 */
export function distanceWords(meters: number, units: DistanceUnits): string {
  if (units === 'metric') {
    const whole = Math.round(meters);
    if (whole < 100) return `${whole} m`;
    const tens = Math.round(meters / 10) * 10;
    return tens < 1_000 ? `${tens} m` : `${(meters / 1_000).toFixed(1)} km`;
  }
  const miles = meters / METERS_PER_MILE;
  if (miles >= 0.1) return `${miles.toFixed(1)} mi`;
  const feet = meters * FEET_PER_METER;
  return Math.round(feet) < 100 ? `${Math.round(feet)} ft` : `${Math.round(feet / 10) * 10} ft`;
}
