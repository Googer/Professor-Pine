import { describe, expect, it } from 'vitest';
import type { LatLon } from './lat-lon.js';
import { MAX_OUTLINE_CORNERS } from './outline.js';
import {
  largestShape,
  pathsMeet,
  regionsBox,
  widenedBox,
  regionsTouching,
  shapeTouches,
  type Area,
  type Shape,
} from './shape.js';

/** A closed square ring from (south, west) with sides of `size` degrees. */
function square(south: number, west: number, size: number): LatLon[] {
  return [
    { lat: south, lon: west },
    { lat: south + size, lon: west },
    { lat: south + size, lon: west + size },
    { lat: south, lon: west + size },
    { lat: south, lon: west },
  ];
}

/** A closed ring of `corners` corners around a middle: a traced boundary. */
function circle(lat: number, lon: number, radius: number, corners: number): LatLon[] {
  const ring = Array.from({ length: corners }, (_unused, i) => ({
    lat: lat + radius * Math.sin((2 * Math.PI * i) / corners),
    lon: lon + radius * Math.cos((2 * Math.PI * i) / corners),
  }));
  return [...ring, { ...(ring[0] as LatLon) }];
}

/** How many coordinates were read, of every corner counted; past `budget` a read throws. */
interface Reads {
  count: number;
  budget: number;
}

/**
 * The same corners, each reading of a latitude or longitude counted in `reads`: the work, by
 * count rather than by the clock (a clock fails on a loaded machine). Past the budget a read
 * throws, so that a slow way fails at once instead of running for minutes.
 */
function counted(corners: readonly LatLon[], reads: Reads): LatLon[] {
  const read = (value: number): number => {
    reads.count += 1;
    if (reads.count > reads.budget) throw new Error('too many coordinates read');
    return value;
  };
  return corners.map(({ lat, lon }) => ({
    get lat() {
      return read(lat);
    },
    get lon() {
      return read(lon);
    },
  }));
}

const area = (outer: LatLon[], ...holes: LatLon[][]): Shape => ({
  kind: 'area',
  areas: [{ outer, holes } satisfies Area],
});

/** The region: the square from (40, -80) to (41, -79). */
const REGION = square(40, -80, 1);

describe('shapeTouches', () => {
  it('counts a point inside the region, not one outside', () => {
    expect(shapeTouches({ kind: 'point', point: { lat: 40.5, lon: -79.5 } }, REGION)).toBe(true);
    expect(shapeTouches({ kind: 'point', point: { lat: 41.5, lon: -79.5 } }, REGION)).toBe(false);
  });

  it('counts a line with a point inside, or one that crosses the region without a point in it', () => {
    const into = [
      { lat: 40.5, lon: -79.5 },
      { lat: 42, lon: -79.5 },
    ];
    const across = [
      { lat: 39, lon: -79.5 },
      { lat: 42, lon: -79.5 },
    ];
    const past = [
      { lat: 39, lon: -81 },
      { lat: 42, lon: -81 },
    ];
    expect(shapeTouches({ kind: 'line', lines: [into] }, REGION)).toBe(true);
    expect(shapeTouches({ kind: 'line', lines: [across] }, REGION)).toBe(true);
    expect(shapeTouches({ kind: 'line', lines: [past, past] }, REGION)).toBe(false);
  });

  it('counts an area inside the region, around it, or overlapping it', () => {
    expect(shapeTouches(area(square(40.2, -79.8, 0.2)), REGION)).toBe(true);
    expect(shapeTouches(area(square(39, -81, 3)), REGION)).toBe(true);
    expect(shapeTouches(area(square(40.5, -79.5, 1)), REGION)).toBe(true);
    expect(shapeTouches(area(square(42, -79.5, 1)), REGION)).toBe(false);
  });

  it('counts a cross of two areas with no corner in the other', () => {
    // A tall thin bar through the middle of the region, its ends outside.
    const bar = [
      { lat: 39, lon: -79.6 },
      { lat: 42, lon: -79.6 },
      { lat: 42, lon: -79.4 },
      { lat: 39, lon: -79.4 },
      { lat: 39, lon: -79.6 },
    ];
    // A wide flat region across it.
    const wide = [
      { lat: 40.4, lon: -81 },
      { lat: 40.6, lon: -81 },
      { lat: 40.6, lon: -78 },
      { lat: 40.4, lon: -78 },
      { lat: 40.4, lon: -81 },
    ];
    expect(shapeTouches(area(bar), wide)).toBe(true);
  });

  it('does not count a region that lies wholly in a hole of the area', () => {
    const ring = square(38, -82, 5);
    expect(shapeTouches(area(ring, square(39.5, -80.5, 2)), REGION)).toBe(false);
    expect(shapeTouches(area(ring, square(40.5, -80.5, 2)), REGION)).toBe(true);
  });
});

describe('regionsTouching', () => {
  it('gives the regions with something in common with the shape, in their order', () => {
    const regions = [
      { id: 1, bounds: REGION },
      { id: 2, bounds: square(41, -80, 1) },
      { id: 3, bounds: null },
      { id: 4, bounds: square(45, -80, 1) },
    ];
    const line: Shape = {
      kind: 'line',
      lines: [
        [
          { lat: 40.5, lon: -79.5 },
          { lat: 41.5, lon: -79.5 },
        ],
      ],
    };
    expect(regionsTouching(line, regions).map((region) => region.id)).toEqual([1, 2]);
  });

  it('compares outlines of thousands of corners reading each corner a few times', () => {
    // About 20 coordinates read a corner at most (140,044 for these 15,003 corners).
    const reads: Reads = { count: 0, budget: 300_000 };
    const region = counted(circle(40.5, -79.5, 0.5, 5_000), reads);
    const town = counted(circle(40.5, -78.9, 0.2, 5_000), reads);
    expect(shapeTouches(area(town), region)).toBe(true);
    const away = counted(circle(40.5, -78.7, 0.15, 5_000), reads);
    expect(shapeTouches(area(away), region)).toBe(false);
    expect(reads.count).toBeLessThanOrEqual(reads.budget);
  });
});

describe('shapeTouches at the limits', () => {
  /** An arc of `corners` points from `from` to `to` (radians) around a middle. */
  const arc = (
    lat: number,
    lon: number,
    radius: number,
    from: number,
    to: number,
    corners: number,
  ) =>
    Array.from({ length: corners }, (_unused, i) => {
      const angle = from + ((to - from) * i) / (corners - 1);
      return { lat: lat + radius * Math.sin(angle), lon: lon + radius * Math.cos(angle) };
    });

  it('finds a region of 5,000 corners in the hole of an area of 50,000 points, reading each corner a few times', () => {
    // About 20 coordinates read a corner at most (860,056 for these 55,003 corners): every
    // corner of the region tried against the area would be billions.
    const reads: Reads = { count: 0, budget: 1_100_000 };
    const region = counted(circle(40.5, -79.5, 0.1, MAX_OUTLINE_CORNERS), reads);
    const outer = counted(circle(40.5, -79.5, 1, 25_000), reads);
    const hole = counted(circle(40.5, -79.5, 0.3, 25_000), reads);
    expect(shapeTouches(area(outer, hole), region)).toBe(false);
    expect(reads.count).toBeLessThanOrEqual(reads.budget);
  });

  it('finds a region of 5,000 corners in the mouth of a crescent of 50,000 points, reading each corner a few times', () => {
    // About 20 coordinates read a corner at most (860,046 for these 55,001 corners, the region's
    // 5,001 among them): every corner of the region tried against the crescent would be billions.
    const reads: Reads = { count: 0, budget: 1_100_000 };
    const region = counted(circle(40.5, -79.5, 0.1, MAX_OUTLINE_CORNERS), reads);
    // A ring around the region, open on the east: out along a wide arc, back along a narrow one.
    const wide = arc(40.5, -79.5, 1, 0.3, 2 * Math.PI - 0.3, 25_000);
    const narrow = arc(40.5, -79.5, 0.3, 2 * Math.PI - 0.3, 0.3, 25_000);
    const crescent = counted([...wide, ...narrow, { ...(wide[0] as LatLon) }], reads);
    expect(shapeTouches(area(crescent), region)).toBe(false);
    expect(reads.count).toBeLessThanOrEqual(reads.budget);
  });

  it('decides by one corner each way when no sides meet', () => {
    const region = circle(40.5, -79.5, 0.1, 100);
    expect(shapeTouches(area(circle(40.5, -79.5, 1, 100)), region)).toBe(true);
    expect(shapeTouches(area(circle(40.5, -79.5, 0.05, 100)), region)).toBe(true);
    expect(
      shapeTouches(
        {
          kind: 'line',
          lines: [
            [
              { lat: 40.5, lon: -79.52 },
              { lat: 40.5, lon: -79.48 },
            ],
          ],
        },
        region,
      ),
    ).toBe(true);
    // Two parts of one place: only the second lies in the region.
    expect(
      shapeTouches(
        {
          kind: 'area',
          areas: [
            { outer: circle(42, -79.5, 0.05, 50), holes: [] },
            { outer: circle(40.5, -79.5, 0.05, 50), holes: [] },
          ],
        },
        region,
      ),
    ).toBe(true);
  });
});

describe('pathsMeet', () => {
  it('is false for paths whose boxes do not meet', () => {
    expect(pathsMeet([square(0, 0, 1)], [square(5, 5, 1)])).toBe(false);
  });
});

describe('largestShape', () => {
  it('prefers an area to a line to a point, then the largest', () => {
    const point = { name: 'point', shape: { kind: 'point', point: { lat: 1, lon: 1 } } as Shape };
    const street = { name: 'street', shape: { kind: 'line', lines: [square(0, 0, 9)] } as Shape };
    const park = { name: 'park', shape: area(square(0, 0, 1)) };
    const town = { name: 'town', shape: area(square(0, 0, 2)) };
    expect(largestShape([point, street, park, town])?.name).toBe('town');
    expect(largestShape([point, street])?.name).toBe('street');
    expect(largestShape([point])?.name).toBe('point');
    expect(largestShape([])).toBeUndefined();
  });
});

describe('regionsBox', () => {
  it('is the box of all outlines', () => {
    expect(
      regionsBox([{ bounds: REGION }, { bounds: null }, { bounds: square(41, -79, 1) }]),
    ).toEqual({ south: 40, north: 42, west: -80, east: -78 });
    expect(regionsBox([{ bounds: null }])).toBeUndefined();
  });
});

describe('widenedBox', () => {
  it('widens a box by as many kilometres on every side', () => {
    const wide = widenedBox({ south: 40, north: 40.1, west: -80.1, east: -79.9 }, 10);
    // 10 km is about 0.09 degrees of latitude, and about 0.118 of longitude at 40 degrees.
    expect(wide.south).toBeCloseTo(39.91, 2);
    expect(wide.north).toBeCloseTo(40.19, 2);
    expect(wide.west).toBeCloseTo(-80.218, 2);
    expect(wide.east).toBeCloseTo(-79.782, 2);
  });

  it('stays on the earth', () => {
    const wide = widenedBox({ south: -89.99, north: 89.99, west: -179.99, east: 179.99 }, 10);
    expect(wide).toEqual({ south: -90, north: 90, west: -180, east: 180 });
  });
});
