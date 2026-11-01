import { metresBetween } from '@pine/wayspot-core/distance';
import type { LatLon } from '@pine/wayspot-core/lat-lon';

/**
 * Places nearest the ones a member named before (Matt, 2026-10-27, "nearby stops first"): the
 * next stop of a research task or of a train is almost always near the last. One path for the
 * place search's tie-break (`mergePlaces`), the lists of an empty option (`PlaceFinder.nearest`:
 * `/research`'s more stops, `/route add stop:`) and the live map's nearest places
 * (`nearestLines`). Distances by `metresBetween`, the one geometry of Pine. Pure.
 */

/** How far a point lies from the nearest of the anchors, in meters; undefined without one. */
export function anchorMetres(point: LatLon, anchors: readonly LatLon[]): number | undefined {
  let nearest: number | undefined;
  for (const anchor of anchors) {
    const metres = metresBetween(point, anchor);
    if (nearest === undefined || metres < nearest) nearest = metres;
  }
  return nearest;
}

/** The nearer first; a distance not known (no anchor) after any known, and alike to another. */
export function nearerFirst(a: number | undefined, b: number | undefined): number {
  if (a === undefined || b === undefined) return Number(a === undefined) - Number(b === undefined);
  return a - b;
}

/** How `nearestPlaces` reads a place, and how many it keeps. */
export interface NearestOptions<T> {
  pointOf: (place: T) => LatLon;
  /** Of places as near, the first by this name. */
  nameOf: (place: T) => string;
  /** Only those within this many meters of the nearest anchor; every place without. */
  within?: number;
  /** At most this many; all without. */
  count?: number;
}

/**
 * The places nearest the anchors, each with its distance to the nearest of them: nearest first,
 * as near by name, within `within` meters, `count` at most. Nothing without an anchor.
 */
export function nearestPlaces<T>(
  places: Iterable<T>,
  anchors: readonly LatLon[],
  options: NearestOptions<T>,
): { item: T; metres: number }[] {
  if (anchors.length === 0) return [];
  const found: { item: T; metres: number; name: string }[] = [];
  for (const item of places) {
    const metres = anchorMetres(options.pointOf(item), anchors) ?? Infinity;
    if (options.within !== undefined && metres > options.within) continue;
    found.push({ item, metres, name: options.nameOf(item) });
  }
  return found
    .sort((a, b) => nearerFirst(a.metres, b.metres) || a.name.localeCompare(b.name))
    .slice(0, options.count)
    .map(({ item, metres }) => ({ item, metres }));
}
