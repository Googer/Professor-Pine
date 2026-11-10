import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { polygonWkt, ringFromPolygon } from './spatial.js';

const SQUARE: LatLon[] = [
  { lat: 40.4, lon: -80.05 },
  { lat: 40.4, lon: -79.95 },
  { lat: 40.5, lon: -79.95 },
  { lat: 40.5, lon: -80.05 },
  { lat: 40.4, lon: -80.05 },
];

describe('polygonWkt', () => {
  it('writes latitude first, as the legacy bot does', () => {
    expect(polygonWkt(SQUARE)).toBe(
      'POLYGON((40.4 -80.05,40.4 -79.95,40.5 -79.95,40.5 -80.05,40.4 -80.05))',
    );
  });

  it('refuses an open ring', () => {
    expect(() => polygonWkt(SQUARE.slice(0, 4))).toThrow(/closed/);
  });

  it('refuses coordinates that are not finite numbers', () => {
    const broken = SQUARE.map((p, i) => (i === 1 ? { lat: Number.NaN, lon: p.lon } : p));
    expect(() => polygonWkt(broken)).toThrow(/finite/);
  });
});

describe('ringFromPolygon', () => {
  it('reads x as latitude and y as longitude from the outer ring', () => {
    const polygon = [SQUARE.map((p) => ({ x: p.lat, y: p.lon }))];
    expect(ringFromPolygon(polygon)).toEqual(SQUARE);
  });

  it('returns null for a missing or empty polygon', () => {
    expect(ringFromPolygon(null)).toBeNull();
    expect(ringFromPolygon([])).toBeNull();
  });
});
