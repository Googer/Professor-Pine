import { describe, expect, it } from 'vitest';
import {
  bestPlace,
  MAX_PLACE_POINTS,
  placeSearchQuery,
  readNominatimPlaces,
  shapeOfGeoJson,
} from './nominatim.js';
import type { Shape } from '@pine/wayspot-core/shape';

/** A place as Nominatim answers it with `format=jsonv2` and `polygon_geojson=1`. */
function place(
  name: string,
  geojson?: unknown,
  kind: { category: string; type: string } = { category: 'leisure', type: 'park' },
): unknown {
  return {
    place_id: 1,
    osm_type: 'way',
    osm_id: 2,
    lat: '40.4406',
    lon: '-79.9959',
    ...kind,
    display_name: name,
    boundingbox: ['40.43', '40.45', '-80.0', '-79.99'],
    ...(geojson === undefined ? {} : { geojson }),
  };
}

const RING = [
  [-80, 40],
  [-79, 40],
  [-79, 41],
  [-80, 41],
  [-80, 40],
];

describe('placeSearchQuery', () => {
  it('searches within the box only, with outlines', () => {
    const query = new URLSearchParams(
      placeSearchQuery('Schenley Park', { south: 40, north: 41, west: -80.5, east: -79 }),
    );
    expect(Object.fromEntries(query)).toEqual({
      q: 'Schenley Park',
      format: 'jsonv2',
      limit: '5',
      bounded: '1',
      viewbox: '-80.5,41,-79,40',
      polygon_geojson: '1',
      polygon_threshold: '0.0001',
      'accept-language': 'en',
    });
  });
});

/** A shape that was read whole; the test fails on an outline too detailed. */
function readable(value: unknown): Shape | undefined {
  const shape = shapeOfGeoJson(value);
  if (shape === 'too-detailed') throw new Error('the outline was too detailed');
  return shape;
}

describe('shapeOfGeoJson', () => {
  it('reads points, lines and areas, longitude first', () => {
    expect(shapeOfGeoJson({ type: 'Point', coordinates: [-79.9, 40.4] })).toEqual({
      kind: 'point',
      point: { lat: 40.4, lon: -79.9 },
    });
    expect(
      shapeOfGeoJson({
        type: 'LineString',
        coordinates: [
          [-79.9, 40.4],
          [-79.8, 40.5],
        ],
      }),
    ).toEqual({
      kind: 'line',
      lines: [
        [
          { lat: 40.4, lon: -79.9 },
          { lat: 40.5, lon: -79.8 },
        ],
      ],
    });
    const polygon = readable({ type: 'Polygon', coordinates: [RING, RING] });
    expect(polygon?.kind).toBe('area');
    expect(polygon?.kind === 'area' && polygon.areas[0]?.holes).toHaveLength(1);
    const multi = readable({ type: 'MultiPolygon', coordinates: [[RING], [RING]] });
    expect(multi?.kind === 'area' && multi.areas).toHaveLength(2);
    const lines = readable({ type: 'MultiLineString', coordinates: [RING, RING] });
    expect(lines?.kind === 'line' && lines.lines).toHaveLength(2);
  });

  it('closes a ring that is not closed, and leaves out what is no ring or line', () => {
    const open = readable({ type: 'Polygon', coordinates: [RING.slice(0, 4)] });
    expect(open?.kind === 'area' && open.areas[0]?.outer).toHaveLength(5);
    expect(shapeOfGeoJson({ type: 'Polygon', coordinates: [RING.slice(0, 2)] })).toBeUndefined();
    expect(shapeOfGeoJson({ type: 'LineString', coordinates: [[-79, 40]] })).toBeUndefined();
  });

  it('refuses what is not GeoJSON it reads, and coordinates off the earth', () => {
    expect(shapeOfGeoJson(undefined)).toBeUndefined();
    expect(shapeOfGeoJson({ type: 'GeometryCollection', geometries: [] })).toBeUndefined();
    expect(shapeOfGeoJson({ type: 'Point', coordinates: [200, 40] })).toBeUndefined();
    expect(shapeOfGeoJson({ type: 'Point', coordinates: ['a', 40] })).toBeUndefined();
  });

  it('reads no more points than the limit, and says that an outline was too detailed', () => {
    const many = Array.from({ length: MAX_PLACE_POINTS + 1 }, (_unused, i) => [-79 + i / 1e6, 40]);
    expect(shapeOfGeoJson({ type: 'LineString', coordinates: many })).toBe('too-detailed');
    // Never a part of a place without the rest: not the small parts after a large one is cut,
    const large = [...many.slice(0, MAX_PLACE_POINTS - 3), [-79, 40]];
    expect(shapeOfGeoJson({ type: 'MultiPolygon', coordinates: [[large], [RING], [RING]] })).toBe(
      'too-detailed',
    );
    // nor an area without the hole that would not fit.
    expect(shapeOfGeoJson({ type: 'Polygon', coordinates: [RING, large] })).toBe('too-detailed');
    // As many as the limit are read.
    expect(
      shapeOfGeoJson({ type: 'LineString', coordinates: many.slice(0, MAX_PLACE_POINTS) }),
    ).toMatchObject({ kind: 'line' });
  });
});

describe('readNominatimPlaces', () => {
  it('reads the places in order, a place without an outline as its point', () => {
    const places = readNominatimPlaces([
      place('Schenley Park, Pittsburgh', { type: 'Polygon', coordinates: [RING] }),
      place('Schenley Drive'),
      { display_name: 'no point' },
    ]);
    expect(places?.map((one) => [one.name, one.shape.kind])).toEqual([
      ['Schenley Park, Pittsburgh', 'area'],
      ['Schenley Drive', 'point'],
    ]);
    expect(places?.[1]?.shape).toEqual({ kind: 'point', point: { lat: 40.4406, lon: -79.9959 } });
    expect(places?.[0]?.tooDetailed).toBeUndefined();
  });

  it('reads a place whose outline is too detailed as its point, and says so', () => {
    const many = Array.from({ length: MAX_PLACE_POINTS + 1 }, (_unused, i) => [-79 + i / 1e6, 40]);
    const places = readNominatimPlaces([
      place('Big County', { type: 'Polygon', coordinates: [[...many, many[0]]] }),
    ]);
    expect(places).toEqual([
      {
        name: 'Big County',
        shape: { kind: 'point', point: { lat: 40.4406, lon: -79.9959 } },
        tooDetailed: true,
      },
    ]);
  });

  it('marks settlements and boundaries, and roads', () => {
    const places = readNominatimPlaces([
      place('Fredericktown', undefined, { category: 'place', type: 'town' }),
      place('Washington County', undefined, { category: 'boundary', type: 'administrative' }),
      place('East Fredericktown Road', undefined, { category: 'highway', type: 'residential' }),
      place('Schenley Park'),
    ]);
    expect(places?.map((one) => one.standing)).toEqual([
      'settlement',
      'settlement',
      'road',
      undefined,
    ]);
  });

  it('is an empty list for nothing found, and nothing for an answer that is no list', () => {
    expect(readNominatimPlaces([])).toEqual([]);
    expect(readNominatimPlaces({ error: 'Bad request' })).toBeUndefined();
  });
});

describe('bestPlace', () => {
  const point = (lat: number): Shape => ({ kind: 'point', point: { lat, lon: -80 } });
  const road: Shape = {
    kind: 'line',
    lines: [
      [
        { lat: 40, lon: -80 },
        { lat: 40.2, lon: -80 },
      ],
    ],
  };
  const park: Shape = {
    kind: 'area',
    areas: [{ outer: RING.map(([lon, lat]) => ({ lat: lat ?? 0, lon: lon ?? 0 })), holes: [] }],
  };

  it('takes a settlement or boundary over anything else, and anything over a road', () => {
    const town = { name: 'town', shape: point(40.1), standing: 'settlement' as const };
    const street = { name: 'street', shape: road, standing: 'road' as const };
    const garden = { name: 'park', shape: park };
    expect(bestPlace([street, town, garden])?.name).toBe('town');
    expect(bestPlace([street, garden])?.name).toBe('park');
    expect(bestPlace([street, { name: 'statue', shape: point(40) }])?.name).toBe('statue');
    expect(bestPlace([street])?.name).toBe('street');
    expect(bestPlace([])).toBeUndefined();
  });

  it('takes the largest among places of one standing', () => {
    const village = { name: 'village', shape: point(40.1), standing: 'settlement' as const };
    const county = { name: 'county', shape: park, standing: 'settlement' as const };
    expect(bestPlace([village, county])?.name).toBe('county');
  });
});
