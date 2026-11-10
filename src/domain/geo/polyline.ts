import type { LatLon } from '@pine/wayspot-core/lat-lon';

function encodeNumber(value: number): string {
  let bits = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';
  while (bits >= 0x20) {
    encoded += String.fromCharCode((0x20 | (bits & 0x1f)) + 63);
    bits >>= 5;
  }
  return encoded + String.fromCharCode(bits + 63);
}

/**
 * Google's encoded polyline format (five decimal places): a compact text for a line of points,
 * used for the outlines on static maps.
 */
export function encodePolyline(points: readonly LatLon[]): string {
  let encoded = '';
  let previousLat = 0;
  let previousLon = 0;
  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lon = Math.round(point.lon * 1e5);
    encoded += encodeNumber(lat - previousLat) + encodeNumber(lon - previousLon);
    previousLat = lat;
    previousLon = lon;
  }
  return encoded;
}
