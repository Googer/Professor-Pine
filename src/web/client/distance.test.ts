import { describe, expect, it } from 'vitest';
import { metresBetween } from '@pine/wayspot-core/distance';
import { metersBetween } from './distance.js';

describe('distances (plan 8M-7)', () => {
  it('measures along the earth as the rest of Pine does, by the one shared function', () => {
    // One source for every fact (Matt, 2026-10-25): no second haversine in the page.
    expect(metersBetween).toBe(metresBetween);
    expect(metersBetween({ lat: 40, lon: -80 }, { lat: 40.001, lon: -80 })).toBeCloseTo(111.2, 0);
    expect(metersBetween({ lat: 40, lon: -80 }, { lat: 40, lon: -80 })).toBe(0);
  });
});
