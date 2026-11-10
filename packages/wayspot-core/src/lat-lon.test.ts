import { describe, expect, it } from 'vitest';
import { isClosedRing, type LatLon } from './lat-lon.js';

const SQUARE: LatLon[] = [
  { lat: 40.4, lon: -80.05 },
  { lat: 40.4, lon: -79.95 },
  { lat: 40.5, lon: -79.95 },
  { lat: 40.5, lon: -80.05 },
  { lat: 40.4, lon: -80.05 },
];

describe('isClosedRing', () => {
  it('accepts a ring whose last point repeats the first', () => {
    expect(isClosedRing(SQUARE)).toBe(true);
  });

  it('rejects an open ring', () => {
    expect(isClosedRing(SQUARE.slice(0, 4))).toBe(false);
  });

  it('rejects fewer than four points', () => {
    const first = SQUARE[0] as LatLon;
    expect(isClosedRing([first, { lat: 40.5, lon: -80 }, first])).toBe(false);
    expect(isClosedRing([])).toBe(false);
  });
});
