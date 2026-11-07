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

/** How many corners were read, of every outline; past `budget` a read throws. */
interface Reads {
  count: number;
  budget: number;
}

/**
 * The same corners, each read counted in `reads`: the work, by count rather than by the clock (a
 * clock fails on a loaded machine). Past the budget a read throws, so that a slow way fails at
 * once instead of running for minutes.
 */
function counted(corners: readonly LatLon[], reads: Reads): readonly LatLon[] {
  return new Proxy(corners, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/u.test(key)) {
        reads.count += 1;
        if (reads.count > reads.budget) throw new Error('too many corners read');
      }
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
}

describe('gymsByRegion: long outlines', () => {
  it('sorts thousands of gyms into thirty regions of 5,000 corners, each outline read only for the gyms near it', () => {
    const gyms = Array.from({ length: 3_000 }, (_unused, i) => ({
      id: i + 1,
      lat: 40 + (i % 60) * 0.1,
      lon: -80 + Math.floor(i / 60) * 0.1,
    }));
    // Each outline is read a few times whole (its box, its enlarged copy) and again for the few
    // gyms in its box: 750,180 reads in all. Every gym against every outline would be 450 million.
    const reads: Reads = { count: 0, budget: 1_000_000 };
    const regions = Array.from({ length: 30 }, (_unused, i) => ({
      channelId: `c${i}`,
      bounds: counted(traced(5_000, 40 + (i % 6), -80 + Math.floor(i / 6)), reads),
    }));
    const sorted = gymsByRegion(regions, gyms);
    expect(reads.count).toBeLessThanOrEqual(reads.budget);
    // The gym at the middle of the first region is its own.
    expect(sorted.get('c0')?.local.has(1)).toBe(true);
  });
});
