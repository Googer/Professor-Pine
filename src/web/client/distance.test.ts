import { describe, expect, it } from 'vitest';
import { metresBetween } from '@pine/wayspot-core/distance';
import { metersBetween, nearParam } from './distance.js';

describe('a place sent to the server to measure from (plan 8Z-2)', () => {
  it('is rounded to three decimals: the neighborhood, never the member’s own spot', () => {
    expect(nearParam({ lat: 40.441234, lon: -79.956789 })).toBe('40.441,-79.957');
    expect(nearParam({ lat: -33.86785, lon: 151.20732 })).toBe('-33.868,151.207');
    expect(nearParam({ lat: 0.0004, lon: -0.0004 })).toBe('0.000,-0.000');
    // What is sent is within about 80 meters of the place, and no nearer than rounding leaves it.
    const at = { lat: 40.441234, lon: -79.956789 };
    const [lat = '', lon = ''] = nearParam(at).split(',');
    expect(metersBetween(at, { lat: Number(lat), lon: Number(lon) })).toBeLessThan(80);
  });
});

describe('distances (plan 8M-7)', () => {
  it('measures along the earth as the rest of Pine does, by the one shared function', () => {
    // One source for every fact (Matt, 2026-10-25): no second haversine in the page.
    expect(metersBetween).toBe(metresBetween);
    expect(metersBetween({ lat: 40, lon: -80 }, { lat: 40.001, lon: -80 })).toBeCloseTo(111.2, 0);
    expect(metersBetween({ lat: 40, lon: -80 }, { lat: 40, lon: -80 })).toBe(0);
  });
});
