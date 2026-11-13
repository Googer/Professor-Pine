import type { LatLon } from '@pine/wayspot-core/lat-lon';

/**
 * The point Google's answers are kept by (plan 19B-3, `GoogleAnswer`): the place rounded to a
 * millionth of a degree (about 0.1 m), finer than any two places Pine tells apart and coarser
 * than the noise of a copy: two servers' copies of one place, and a gym and the Wayspot it is
 * made of, are one key, so that Google is asked about it once and neither server's question
 * changes another's answer. Pure; the upgrade that fills the answers rounds with it too.
 */
export function answerPoint(point: LatLon): LatLon {
  return { lat: rounded(point.lat), lon: rounded(point.lon) };
}

function rounded(degrees: number): number {
  return Math.round(degrees * 1e6) / 1e6;
}

/**
 * The cells answers are looked up in: a thousandth of a degree (about 111 m north to south, 85 m
 * east to west at Pittsburgh), so that every answer within `WAYSPOT_MOVED_METRES` of a point lies
 * in its cell or one of the eight around it, anywhere south of 84° (where a thousandth of a
 * degree of longitude is still ten meters).
 */
export function answerCell(point: LatLon): { lat: number; lon: number } {
  return { lat: Math.floor(point.lat * 1e3), lon: Math.floor(point.lon * 1e3) };
}
