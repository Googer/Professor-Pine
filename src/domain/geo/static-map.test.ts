import { describe, expect, it } from 'vitest';
import { countedCorners, countedList, type Reads } from '../../../test/support/counted-corners.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { encodePolyline } from './polyline.js';
import {
  MAX_STATIC_MAP_QUERY,
  STATIC_MAP_ENDPOINT,
  gymMap,
  MAX_PLACE_PARTS,
  placeMap,
  regionMap,
  staticMapQuery,
} from './static-map.js';

const square = [
  { lat: 40, lon: -80.1 },
  { lat: 40.1, lon: -80.1 },
  { lat: 40.1, lon: -80 },
  { lat: 40, lon: -80 },
  { lat: 40, lon: -80.1 },
];

describe('encodePolyline', () => {
  it('encodes the example of Google’s documentation', () => {
    expect(
      encodePolyline([
        { lat: 38.5, lon: -120.2 },
        { lat: 40.7, lon: -120.95 },
        { lat: 43.252, lon: -126.453 },
      ]),
    ).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('encodes a single point, the origin and nothing', () => {
    expect(encodePolyline([{ lat: 38.5, lon: -120.2 }])).toBe('_p~iF~ps|U');
    expect(encodePolyline([{ lat: 0, lon: 0 }])).toBe('??');
    expect(encodePolyline([])).toBe('');
  });

  it('rounds to five decimal places', () => {
    expect(encodePolyline([{ lat: 38.500004, lon: -120.200004 }])).toBe('_p~iF~ps|U');
  });
});

describe('staticMapQuery', () => {
  const params = (query: string) => new URLSearchParams(query);

  it('asks for a 640×320 picture at double resolution', () => {
    const query = params(staticMapQuery({}));
    expect(Object.fromEntries(query)).toEqual({ size: '640x320', scale: '2', format: 'png' });
  });

  it('describes a gym as a small red pin at street level', () => {
    const query = params(staticMapQuery(gymMap({ lat: 40.05, lon: -80.05 })));
    expect(query.get('zoom')).toBe('15');
    expect(query.get('markers')).toBe('size:small|color:red|40.05,-80.05');
    expect(query.has('path')).toBe(false);
  });

  it('describes a region as a shaded outline and lets Google fit the map', () => {
    const query = params(staticMapQuery(regionMap(square)));
    expect(query.get('path')).toBe(
      `fillcolor:0xAA000033|color:red|weight:2|enc:${encodePolyline(square)}`,
    );
    expect(query.has('zoom')).toBe(false);
    expect(query.has('markers')).toBe(false);
  });

  it('draws several paths and pins, a line without shading', () => {
    const query = params(
      staticMapQuery({
        markers: [
          { lat: 1, lon: 2 },
          { lat: 3, lon: 4 },
        ],
        paths: [{ points: square }, { points: square, fill: true }],
      }),
    );
    expect(query.get('markers')).toBe('size:small|color:red|1,2|3,4');
    expect(query.getAll('path')).toEqual([
      `color:red|weight:2|enc:${encodePolyline(square)}`,
      `fillcolor:0xAA000033|color:red|weight:2|enc:${encodePolyline(square)}`,
    ]);
  });

  it('is the same text for the same map, and holds no key', () => {
    expect(staticMapQuery(gymMap({ lat: 40.05, lon: -80.05 }))).toBe(
      staticMapQuery(gymMap({ lat: 40.05, lon: -80.05 })),
    );
    expect(staticMapQuery(gymMap({ lat: 40.05, lon: -80.05 }))).not.toBe(
      staticMapQuery(gymMap({ lat: 40.06, lon: -80.05 })),
    );
    expect(staticMapQuery(regionMap(square))).not.toContain('key=');
  });

  it('stays within the length Google accepts for the largest outline in production', () => {
    // 74 corners is the largest region of the production data of 2026-10. The address must stay
    // well under Google's limit (16,384 characters); 2,000 is the bound this test holds the
    // fixture's region to.
    const outline = Array.from({ length: 74 }, (_, i) => ({
      lat: 40 + Math.sin(i) * 0.3,
      lon: -80 + Math.cos(i) * 0.3,
    }));
    expect(`${STATIC_MAP_ENDPOINT}?${staticMapQuery(regionMap(outline))}`.length).toBeLessThan(
      2000,
    );
  });
});

describe('regionMap with a long outline', () => {
  /** A traced boundary: a circle of many corners with a wobble, so that few lie on a line. */
  const traced = (corners: number) => {
    const ring = Array.from({ length: corners }, (_unused, i) => {
      const angle = (2 * Math.PI * i) / corners;
      const radius = 0.2 + 0.01 * Math.sin(angle * 97);
      return { lat: 40 + radius * Math.sin(angle), lon: -80 + radius * Math.cos(angle) };
    });
    return [...ring, ring[0] ?? { lat: 0, lon: 0 }];
  };

  it('leaves an outline as it is while its picture can be asked for', () => {
    const outline = traced(300);
    expect(regionMap(outline).paths?.[0]?.points).toEqual(outline);
  });

  it('simplifies an outline of 5,000 corners for the picture, so that the address fits', () => {
    const outline = traced(5_000);
    // As it is, the address would be longer than Google takes.
    expect(staticMapQuery({ paths: [{ points: outline, fill: true }] }).length).toBeGreaterThan(
      MAX_STATIC_MAP_QUERY,
    );
    const map = regionMap(outline);
    // Its work, counted rather than timed (a clock fails on a loaded machine): 2,698,070
    // coordinates read, about 540 a corner, as each tolerance tried simplifies the outline whole;
    // twice that is allowed. Tolerances a fifth apart rather than doubled made it fail.
    const reads: Reads = { count: 0, budget: 5_400_000 };
    const counted = regionMap(countedCorners(outline, reads));
    expect(reads.count).toBeLessThanOrEqual(reads.budget);
    expect(staticMapQuery(counted)).toBe(staticMapQuery(map));
    const points = map.paths?.[0]?.points ?? [];
    expect(staticMapQuery(map).length).toBeLessThanOrEqual(MAX_STATIC_MAP_QUERY);
    // Still the same shape: closed, made of corners of the outline in their order, and many.
    expect(points.length).toBeGreaterThan(200);
    expect(points[0]).toEqual(outline[0]);
    expect(points[points.length - 1]).toEqual(outline[0]);
    let from = 0;
    for (const point of points.slice(0, -1)) {
      const found = outline.indexOf(point, from);
      expect(found).toBeGreaterThanOrEqual(from);
      from = found + 1;
    }
    // The same outline gives the same picture.
    expect(staticMapQuery(regionMap(outline))).toBe(staticMapQuery(map));
    // The outline itself is not touched.
    expect(outline).toHaveLength(5_001);
  });

  it('gets an outline that no tolerance shortens enough under the limit all the same', () => {
    // Corners that jump across the whole world: every one of them matters.
    const wild = Array.from({ length: 2_000 }, (_unused, i) => ({
      lat: i % 2 === 0 ? -80 + (i % 7) : 80 - (i % 5),
      lon: -170 + (i * 340) / 2_000,
    }));
    const map = regionMap([...wild, wild[0] ?? { lat: 0, lon: 0 }]);
    expect(staticMapQuery(map).length).toBeLessThanOrEqual(MAX_STATIC_MAP_QUERY);
    expect(map.paths?.[0]?.points.length).toBeGreaterThan(3);
  });
});

describe('placeMap', () => {
  const params = (query: string) => new URLSearchParams(query);
  const ring = (lat: number, lon: number, corners: number, radius = 0.05) => {
    const points = Array.from({ length: corners }, (_unused, i) => ({
      lat: lat + radius * Math.sin((2 * Math.PI * i) / corners),
      lon: lon + radius * Math.cos((2 * Math.PI * i) / corners),
    }));
    return [...points, { ...(points[0] ?? { lat, lon }) }];
  };

  it('draws a place in red and the regions it lies in in blue', () => {
    const query = params(
      staticMapQuery(placeMap({ kind: 'area', areas: [{ outer: square, holes: [] }] }, [square])),
    );
    expect(query.getAll('path')).toEqual([
      `fillcolor:0xAA000033|color:red|weight:2|enc:${encodePolyline(square)}`,
      `color:0x1E50D0|weight:2|enc:${encodePolyline(square)}`,
    ]);
    expect(query.has('zoom')).toBe(false);
  });

  it('pins a point, at street level when no region is drawn', () => {
    const point = { lat: 40.05, lon: -80.05 };
    const alone = params(staticMapQuery(placeMap({ kind: 'point', point }, [])));
    expect(alone.get('markers')).toBe('size:small|color:red|40.05,-80.05');
    expect(alone.get('zoom')).toBe('15');
    const withRegion = params(staticMapQuery(placeMap({ kind: 'point', point }, [square])));
    expect(withRegion.has('zoom')).toBe(false);
    expect(withRegion.getAll('path')).toHaveLength(1);
  });

  it('simplifies a large place and its regions together until the address fits', () => {
    const lines = [ring(40, -80, 3_000), ring(40.2, -80, 3_000)];
    const map = placeMap({ kind: 'line', lines }, [ring(40.1, -80, 5_000, 0.3)]);
    expect(staticMapQuery(map).length).toBeLessThanOrEqual(MAX_STATIC_MAP_QUERY);
    expect(map.paths).toHaveLength(3);
    expect(map.paths?.[2]?.colour).toBe('blue');
  });

  it('draws the largest place there can be, with sixty large regions, simplifying what is left', () => {
    // A place of as many corners as is read of one, and sixty regions of traced boundaries.
    const wobbly = (lat: number, corners: number, radius: number) => {
      const points = Array.from({ length: corners }, (_unused, i) => {
        const angle = (2 * Math.PI * i) / corners;
        const r = radius * (1 + 0.02 * Math.sin(angle * 97));
        return { lat: lat + r * Math.sin(angle), lon: -80 + r * Math.cos(angle) };
      });
      return [...points, { ...(points[0] ?? { lat, lon: -80 }) }];
    };
    const area = { outer: wobbly(40, 50_000, 0.5), holes: [] };
    const regions = Array.from({ length: 60 }, (_unused, i) => wobbly(39.5 + i / 60, 5_000, 0.1));
    const map = placeMap({ kind: 'area', areas: [area] }, regions);
    expect(staticMapQuery(map).length).toBeLessThanOrEqual(MAX_STATIC_MAP_QUERY);
    expect(map.paths).toHaveLength(61);
    // Its work, counted rather than timed (a clock fails on a loaded machine), on a tenth of it:
    // a read counted costs, and the simplification is the same at a tenth. Each tolerance tried
    // simplifies what the one before left (only the first reads the lists given: 561,015 corners
    // read); twice that is allowed. Starting over from the place and the regions each time, or a
    // simplification that reads the whole line for each stretch it splits, made it fail.
    const reads: Reads = { count: 0, budget: 1_150_000 };
    const tenth = placeMap(
      {
        kind: 'area',
        areas: [{ outer: countedList(wobbly(40, 5_000, 0.5), reads) as LatLon[], holes: [] }],
      },
      Array.from({ length: 60 }, (_unused, i) =>
        countedList(wobbly(39.5 + i / 60, 500, 0.1), reads),
      ),
    );
    expect(reads.count).toBeLessThanOrEqual(reads.budget);
    expect(tenth.paths).toHaveLength(61);
  });

  it('draws the largest parts of a place when it has more than the limit', () => {
    const small = Array.from({ length: MAX_PLACE_PARTS }, (_unused, i) => ({
      outer: ring(40 + i / 10, -80, 8, 0.01),
      holes: [],
    }));
    const large = { outer: ring(45, -80, 8, 0.5), holes: [] };
    const map = placeMap({ kind: 'area', areas: [...small, large] }, []);
    expect(map.paths).toHaveLength(MAX_PLACE_PARTS);
    expect(map.paths?.[0]?.points).toEqual(large.outer);
  });

  it('draws no more parts of a place than the limit', () => {
    const areas = Array.from({ length: MAX_PLACE_PARTS + 5 }, (_unused, i) => ({
      outer: ring(40 + i / 10, -80, 8, 0.01),
      holes: [],
    }));
    expect(placeMap({ kind: 'area', areas }, []).paths).toHaveLength(MAX_PLACE_PARTS);
  });
});
