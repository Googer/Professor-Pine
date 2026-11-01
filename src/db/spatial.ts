import { isClosedRing, type LatLon } from '@pine/wayspot-core/lat-lon';
import type { Polygon } from './types.js';

/**
 * Well-known text for a region outline. Latitude comes first, as in every polygon the legacy
 * bot stored, so gyms are tested with POINT(lat, lon).
 */
export function polygonWkt(ring: readonly LatLon[]): string {
  if (!isClosedRing(ring)) {
    throw new Error('A region outline must be a closed ring of at least four points');
  }
  for (const { lat, lon } of ring) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error('Region coordinates must be finite numbers');
    }
  }
  return `POLYGON((${ring.map(({ lat, lon }) => `${lat} ${lon}`).join(',')}))`;
}

/** The outer ring of a stored polygon; x is latitude and y is longitude. */
export function ringFromPolygon(polygon: Polygon | null): LatLon[] | null {
  const outer = polygon?.[0];
  if (!outer || outer.length === 0) return null;
  return outer.map(({ x, y }) => ({ lat: x, lon: y }));
}
