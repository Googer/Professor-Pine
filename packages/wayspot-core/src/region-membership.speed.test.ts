import { describe, expect, it } from 'vitest';
import type { LatLon } from './lat-lon.js';
import { gymsByRegion } from './region-membership.js';

function traced(corners: number, lat: number, lon: number): LatLon[] {
  const ring = Array.from({ length: corners }, (_unused, i) => {
    const angle = (2 * Math.PI * i) / corners;
    const r = 0.05 * (1 + 0.05 * Math.sin(angle * 97));
    return { lat: lat + r * Math.sin(angle), lon: lon + r * Math.cos(angle) };
  });
  return [...ring, ring[0] ?? { lat: 0, lon: 0 }];
}

describe('gymsByRegion: long outlines', () => {
  it('sorts thousands of gyms into thirty regions of 5,000 corners in well under a second', () => {
    const gyms = Array.from({ length: 3_000 }, (_unused, i) => ({
      id: i + 1,
      lat: 40 + (i % 60) * 0.1,
      lon: -80 + Math.floor(i / 60) * 0.1,
    }));
    const regions = Array.from({ length: 30 }, (_unused, i) => ({
      channelId: `c${i}`,
      bounds: traced(5_000, 40 + (i % 6), -80 + Math.floor(i / 6)),
    }));
    const started = performance.now();
    const sorted = gymsByRegion(regions, gyms);
    expect(performance.now() - started).toBeLessThan(1_000);
    // The gym at the middle of the first region is its own.
    expect(sorted.get('c0')?.local.has(1)).toBe(true);
  });
});
