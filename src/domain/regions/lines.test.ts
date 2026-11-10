import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { Flat, SegmentGrid } from './lines.js';

/** A generator of numbers in [0, 1) from a seed, the same every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe('a line resampled', () => {
  const flat = new Flat(40);
  // A border traced along a township line: 4,000 corners over 10 km.
  const traced: LatLon[] = Array.from({ length: 4_000 }, (_unused, i) => ({
    lat: 40 + i * 0.0000225,
    lon: -80 + (i % 2) * 0.00001,
  }));

  it('takes places evenly along it, at most as many as asked, from its start to its end', () => {
    const places = flat.resampled(traced, 5, 1_500);
    expect(places.length).toBeLessThanOrEqual(1_500);
    expect(places.length).toBeGreaterThan(1_400);
    expect(places[0]).toEqual(traced[0]);
    expect(places[places.length - 1]).toEqual(traced[traced.length - 1]);
    const apart = places.slice(1).map((place, i) => flat.distance(places[i]!, place));
    expect(Math.max(...apart) - Math.min(...apart)).toBeLessThan(0.5);
  });

  it('takes places `step` apart on a line short enough', () => {
    const line = [traced[0]!, { lat: 40.00089, lon: -80 }];
    const places = flat.resampled(line, 10, 1_500);
    // 99 m: eleven places.
    expect(places).toHaveLength(11);
  });
});

describe('the sides of a line filed in a grid', () => {
  it('finds the nearest side within the distance asked, as going through every side does', () => {
    const random = seeded(7);
    // A line of 400 corners wandering east over about 4 km, a few metres apart up and down.
    const line: LatLon[] = Array.from({ length: 400 }, (_unused, i) => ({
      lat: 40 + (random() - 0.5) * 0.0004,
      lon: -80 + i * 0.0001 + (random() - 0.5) * 0.00005,
    }));
    const flat = new Flat(40);
    const grid = new SegmentGrid(line, flat, 25);
    for (let k = 0; k < 500; k++) {
      const point = { lat: 40 + (random() - 0.5) * 0.004, lon: -80.001 + random() * 0.042 };
      const nearest = flat.nearest(line, point).distance;
      const found = grid.distance(point, 150);
      if (nearest <= 150) expect(found).toBeCloseTo(nearest, 9);
      else expect(found).toBe(Infinity);
    }
  });

  it('finds every side within the distance asked, as going through every side does', () => {
    const random = seeded(11);
    const flat = new Flat(40);
    for (const corners of [20, 400]) {
      const line: LatLon[] = Array.from({ length: corners }, (_unused, i) => ({
        lat: 40 + (random() - 0.5) * 0.0004,
        lon: -80 + i * 0.0001 + (random() - 0.5) * 0.00005,
      }));
      const grid = new SegmentGrid(line, flat, 25);
      for (let k = 0; k < 300; k++) {
        const point = {
          lat: 40 + (random() - 0.5) * 0.0006,
          lon: -80 + random() * 0.0001 * corners,
        };
        const within = random() * 20;
        const near = line
          .slice(1)
          .flatMap((b, i) => (flat.onSegment(point, line[i]!, b).distance <= within ? [i] : []));
        expect(grid.sidesNear(point, within)).toEqual(near);
      }
    }
  });
});
