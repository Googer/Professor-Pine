import { describe, expect, it } from 'vitest';
import {
  EAST_CHANNEL,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  testGyms,
  testRegions,
} from '../../../test/support/gyms.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import {
  NEIGHBOUR_SCALE,
  enlargeRing,
  grownBox,
  gymsByRegion,
  inBox,
  metresFromRing,
  nearRing,
  ringContains,
} from '@pine/wayspot-core/region-membership';

const square: LatLon[] = [
  { lat: 40, lon: -80 },
  { lat: 41, lon: -80 },
  { lat: 41, lon: -79 },
  { lat: 40, lon: -79 },
  { lat: 40, lon: -80 },
];

/** An L: the square without its north-east quarter. */
const ell: LatLon[] = [
  { lat: 40, lon: -80 },
  { lat: 41, lon: -80 },
  { lat: 41, lon: -79.5 },
  { lat: 40.5, lon: -79.5 },
  { lat: 40.5, lon: -79 },
  { lat: 40, lon: -79 },
  { lat: 40, lon: -80 },
];

describe('ringContains', () => {
  it('tells inside from outside', () => {
    expect(ringContains(square, { lat: 40.5, lon: -79.5 })).toBe(true);
    expect(ringContains(square, { lat: 40.999, lon: -79.001 })).toBe(true);
    expect(ringContains(square, { lat: 41.001, lon: -79.5 })).toBe(false);
    expect(ringContains(square, { lat: 40.5, lon: -80.001 })).toBe(false);
    expect(ringContains(square, { lat: -40.5, lon: 79.5 })).toBe(false);
  });

  it('handles an outline with a dent', () => {
    expect(ringContains(ell, { lat: 40.25, lon: -79.25 })).toBe(true);
    expect(ringContains(ell, { lat: 40.75, lon: -79.75 })).toBe(true);
    expect(ringContains(ell, { lat: 40.75, lon: -79.25 })).toBe(false);
  });

  it('gives the same answer whichever way round the outline runs', () => {
    const reversed = [...ell].reverse();
    for (const point of [
      { lat: 40.25, lon: -79.25 },
      { lat: 40.75, lon: -79.25 },
    ]) {
      expect(ringContains(reversed, point)).toBe(ringContains(ell, point));
    }
  });

  it('accepts an outline that is not closed, and contains nothing without corners', () => {
    expect(ringContains(square.slice(0, -1), { lat: 40.5, lon: -79.5 })).toBe(true);
    expect(ringContains([], { lat: 40.5, lon: -79.5 })).toBe(false);
  });
});

describe('nearRing', () => {
  const tenth: LatLon[] = [
    { lat: 40.0, lon: -80.1 },
    { lat: 40.1, lon: -80.1 },
    { lat: 40.1, lon: -80.0 },
    { lat: 40.0, lon: -80.0 },
    { lat: 40.0, lon: -80.1 },
  ];
  // A tenth of a millidegree of latitude is about 11 metres.
  const north = (metres: number): LatLon => ({ lat: 40.1 + metres / 111_195, lon: -80.05 });

  it('holds a point inside, and one outside within the distance of a side', () => {
    expect(nearRing(tenth, { lat: 40.05, lon: -80.05 }, 100)).toBe(true);
    expect(nearRing(tenth, north(99), 100)).toBe(true);
    expect(nearRing(tenth, north(101), 100)).toBe(false);
  });

  it('measures beyond a corner to the corner', () => {
    const off = 70 / 111_195;
    const beyond = { lat: 40.1 + off, lon: -80.0 + off / Math.cos((40.1 * Math.PI) / 180) };
    expect(nearRing(tenth, beyond, 100)).toBe(true);
    expect(nearRing(tenth, beyond, 98)).toBe(false);
  });
});

describe('metresFromRing', () => {
  const tenth: LatLon[] = [
    { lat: 40.0, lon: -80.1 },
    { lat: 40.1, lon: -80.1 },
    { lat: 40.1, lon: -80.0 },
    { lat: 40.0, lon: -80.0 },
    { lat: 40.0, lon: -80.1 },
  ];

  it('is nothing inside, and the distance to the nearest side or corner outside', () => {
    expect(metresFromRing(tenth, { lat: 40.05, lon: -80.05 })).toBe(0);
    expect(metresFromRing(tenth, { lat: 40.1 + 400 / 111_195, lon: -80.05 })).toBeCloseTo(400, 0);
    const off = 70 / 111_195;
    const beyond = { lat: 40.1 + off, lon: -80.0 + off / Math.cos((40.1 * Math.PI) / 180) };
    expect(metresFromRing(tenth, beyond)).toBeCloseTo(70 * Math.SQRT2, 0);
    expect(metresFromRing([], { lat: 40, lon: -80 })).toBe(Infinity);
  });
});

describe('grownBox', () => {
  it('grows a box by metres on every side, wider in longitude away from the equator', () => {
    const box = grownBox({ south: 40, north: 40.1, west: -80.1, east: -80 }, 500);
    const lat = 500 / 111_195;
    expect(box.south).toBeCloseTo(40 - lat, 6);
    expect(box.north).toBeCloseTo(40.1 + lat, 6);
    expect(box.west).toBeLessThan(-80.1 - lat);
    // 500 m east of the box's corner (at its northern edge, where a degree is narrowest).
    const east = -80 + lat / Math.cos((40.1 * Math.PI) / 180);
    expect(inBox(box, { lat: 40.1, lon: east - 1e-9 })).toBe(true);
    expect(grownBox({ south: 40, north: 40.1, west: -80.1, east: -80 }, 0)).toEqual({
      south: 40,
      north: 40.1,
      west: -80.1,
      east: -80,
    });
  });
});

describe('enlargeRing', () => {
  it('blows the outline up around the middle of its corners', () => {
    expect(NEIGHBOUR_SCALE).toBe(1.5);
    expect(enlargeRing(square)).toEqual([
      { lat: 39.75, lon: -80.25 },
      { lat: 41.25, lon: -80.25 },
      { lat: 41.25, lon: -78.75 },
      { lat: 39.75, lon: -78.75 },
      { lat: 39.75, lon: -80.25 },
    ]);
  });

  it('takes another factor, and leaves the outline alone at 1', () => {
    expect(enlargeRing(square, 1)).toEqual(square);
    expect(enlargeRing(square, 2)[0]).toEqual({ lat: 39.5, lon: -80.5 });
  });

  it('does not count the closing corner twice', () => {
    const open = square.slice(0, -1);
    expect(enlargeRing(open)).toEqual(enlargeRing(square).slice(0, -1));
  });

  it('gives nothing for nothing', () => {
    expect(enlargeRing([])).toEqual([]);
  });
});

describe('gymsByRegion', () => {
  const byRegion = gymsByRegion(testRegions(), testGyms());
  const sorted = (ids: Set<number> | undefined) => [...(ids ?? [])].sort((a, b) => a - b);

  it('sorts gyms into the regions that contain them', () => {
    expect(sorted(byRegion.get(WEST_CHANNEL)?.local)).toEqual([1, 2, 3, 4, 5, 6, 11, 12]);
    expect(sorted(byRegion.get(EAST_CHANNEL)?.local)).toEqual([7, 8, 9]);
  });

  it('lists the gyms just outside a region as its neighbours', () => {
    expect(sorted(byRegion.get(WEST_CHANNEL)?.neighbouring)).toEqual([7]);
    expect(sorted(byRegion.get(EAST_CHANNEL)?.neighbouring)).toEqual([4]);
  });

  it('gives a region without an outline no gyms', () => {
    expect(byRegion.get(UNBOUNDED_CHANNEL)).toEqual({ local: new Set(), neighbouring: new Set() });
  });

  it('leaves a gym outside every region in none', () => {
    for (const membership of byRegion.values()) {
      expect(membership.local.has(10)).toBe(false);
      expect(membership.neighbouring.has(10)).toBe(false);
    }
  });

  it('puts a gym inside two overlapping regions in both', () => {
    const overlapping = [
      { channelId: 'a', bounds: square },
      { channelId: 'b', bounds: square },
    ];
    const result = gymsByRegion(overlapping, [{ id: 1, lat: 40.5, lon: -79.5 }]);
    expect(result.get('a')?.local.has(1)).toBe(true);
    expect(result.get('b')?.local.has(1)).toBe(true);
  });

  it('sorts by the first of several rows of one channel, the oldest, as everything else does', () => {
    const far = square.map(({ lat, lon }) => ({ lat: lat + 10, lon }));
    const twice = [
      { channelId: 'a', bounds: square },
      { channelId: 'a', bounds: far },
    ];
    const result = gymsByRegion(twice, [{ id: 1, lat: 40.5, lon: -79.5 }]);
    expect(result.get('a')?.local.has(1)).toBe(true);
    // The first row without an outline: the channel has no gyms, whatever a newer row says.
    const unbounded = gymsByRegion(
      [
        { channelId: 'a', bounds: null },
        { channelId: 'a', bounds: square },
      ],
      [{ id: 1, lat: 40.5, lon: -79.5 }],
    );
    expect(unbounded.get('a')?.local.size).toBe(0);
  });

  it('has an entry for every region, even without gyms', () => {
    expect([...gymsByRegion(testRegions(), []).keys()]).toEqual([
      WEST_CHANNEL,
      EAST_CHANNEL,
      UNBOUNDED_CHANNEL,
    ]);
  });
});
