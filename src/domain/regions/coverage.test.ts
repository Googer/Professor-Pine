import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import {
  coverage,
  inPiece,
  MIN_SLIVER_WIDTH,
  newPieces,
  newProblems,
  OverlapCache,
  ringArea,
  type Outlined,
} from './coverage.js';

const p = (lat: number, lon: number): LatLon => ({ lat, lon });

/** A closed square of latitudes and longitudes. */
function square(south: number, west: number, north: number, east: number): LatLon[] {
  return [p(south, west), p(north, west), p(north, east), p(south, east), p(south, west)];
}

const R = 6_371_000;
const rad = (degrees: number): number => (degrees * Math.PI) / 180;
/** The area of a box of latitudes and longitudes on the sphere, in m². */
const boxArea = (south: number, west: number, north: number, east: number): number =>
  R * R * rad(east - west) * (Math.sin(rad(north)) - Math.sin(rad(south)));

const region = (key: string, outline: LatLon[]): Outlined => ({ key, outline });

describe('the area of an outline', () => {
  it('is measured on the sphere, in square metres, whichever way it winds', () => {
    const ring = square(40, -80.1, 40.1, -80);
    expect(ringArea(ring)).toBeCloseTo(boxArea(40, -80.1, 40.1, -80), -1);
    expect(ringArea([...ring].reverse())).toBeCloseTo(ringArea(ring), 6);
    // About 85 km by 111 km at 40° north.
    expect(ringArea(ring) / 1e6).toBeCloseTo(94.8, 0);
  });
});

describe('overlaps and gaps', () => {
  it('finds none between neighbours that share a border', () => {
    const found = coverage([
      region('west', square(40, -80.1, 40.1, -80)),
      region('east', square(40, -80, 40.1, -79.9)),
    ]);
    expect(found).toEqual({ overlaps: [], gaps: [] });
  });

  it('finds where two squares overlap, with its area', () => {
    const found = coverage([
      region('west', square(40, -80.1, 40.1, -79.99)),
      region('east', square(40, -80, 40.1, -79.9)),
    ]);
    expect(found.gaps).toEqual([]);
    expect(found.overlaps).toHaveLength(1);
    const [overlap] = found.overlaps;
    expect(overlap?.between).toEqual(['west', 'east']);
    expect(overlap?.area).toBeCloseTo(boxArea(40, -80, 40.1, -79.99), -2);
    expect(inPiece(overlap!, p(40.05, -79.995))).toBe(true);
    expect(inPiece(overlap!, p(40.05, -80.05))).toBe(false);
  });

  it('finds the gap three regions leave between them, and nothing outside them', () => {
    // West and east leave a strip between them; north closes it from above and south.
    const found = coverage([
      region('west', square(40, -80.1, 40.1, -80.01)),
      region('east', square(40, -80, 40.1, -79.9)),
      region('north', square(40.1, -80.1, 40.2, -79.9)),
      region('south', square(39.9, -80.1, 40, -79.9)),
    ]);
    expect(found.overlaps).toEqual([]);
    expect(found.gaps).toHaveLength(1);
    const [gap] = found.gaps;
    expect(gap?.area).toBeCloseTo(boxArea(40, -80.01, 40.1, -80), -2);
    expect(inPiece(gap!, p(40.05, -80.005))).toBe(true);
    expect(inPiece(gap!, p(40.05, -80.05))).toBe(false);
    // A bay open to the outside is no gap: without south the strip is open.
    expect(
      coverage([
        region('west', square(40, -80.1, 40.1, -80.01)),
        region('east', square(40, -80, 40.1, -79.9)),
        region('north', square(40.1, -80.1, 40.2, -79.9)),
      ]).gaps,
    ).toEqual([]);
  });

  it('measures a gap without a region that lies inside it', () => {
    const frame = [
      region('west', square(40, -80.1, 40.1, -80.05)),
      region('east', square(40, -79.95, 40.1, -79.9)),
      region('north', square(40.1, -80.1, 40.2, -79.9)),
      region('south', square(39.9, -80.1, 40, -79.9)),
    ];
    const island = region('island', square(40.04, -80.01, 40.06, -79.99));
    const [gap] = coverage([...frame, island]).gaps;
    expect(gap?.area).toBeCloseTo(
      boxArea(40, -80.05, 40.1, -79.95) - boxArea(40.04, -80.01, 40.06, -79.99),
      -2,
    );
    expect(inPiece(gap!, p(40.05, -80))).toBe(false);
    expect(inPiece(gap!, p(40.05, -80.03))).toBe(true);
  });

  it('leaves out a sliver thinner than half a metre, as six decimals leave along a border', () => {
    // East's west edge 10 cm into west: an overlap 0.1 m wide and 11 km long.
    const tenCentimetres = 0.1 / ((R * Math.PI) / 180) / Math.cos(rad(40));
    const found = coverage([
      region('west', square(40, -80.1, 40.1, -80)),
      region('east', square(40, -80 - tenCentimetres, 40.1, -79.9)),
    ]);
    expect(found.overlaps).toEqual([]);
    expect(MIN_SLIVER_WIDTH).toBe(0.5);
    // A metre wide is a sliver to show.
    const metre = tenCentimetres * 10;
    expect(
      coverage([
        region('west', square(40, -80.1, 40.1, -80)),
        region('east', square(40, -80 - metre, 40.1, -79.9)),
      ]).overlaps,
    ).toHaveLength(1);
  });

  it('keeps the overlaps of the outlines it has seen, by the outlines themselves', () => {
    const cache = new OverlapCache();
    const west = square(40, -80.1, 40.1, -79.99);
    const east = square(40, -80, 40.1, -79.9);
    const first = coverage([region('west', west), region('east', east)], cache);
    expect(cache.size).toBe(1);
    const again = coverage([region('w', west), region('e', east)], cache);
    expect(cache.size).toBe(1);
    expect(again.overlaps[0]?.between).toEqual(['w', 'e']);
    expect(again.overlaps[0]?.area).toBe(first.overlaps[0]?.area);
  });
});

describe('new overlaps and gaps', () => {
  const west = square(40, -80.1, 40.1, -79.99);
  const east = square(40, -80, 40.1, -79.9);
  const loaded = coverage([region('west', west), region('east', east)]);

  it('are none when an overlap shrank, or the region it was in was split', () => {
    const shrunk = coverage([
      region('west', square(40, -80.1, 40.1, -79.995)),
      region('east', east),
    ]);
    expect(newPieces(shrunk.overlaps, loaded.overlaps)).toEqual([]);
    // West split in two: its northern half overlaps east where west did.
    const split = coverage([
      region('west', square(40, -80.1, 40.05, -79.99)),
      region('new', square(40.05, -80.1, 40.1, -79.99)),
      region('east', east),
    ]);
    expect(split.overlaps).toHaveLength(2);
    expect(newPieces(split.overlaps, loaded.overlaps)).toEqual([]);
  });

  it('are an overlap that grew by more than a tenth, or one somewhere else', () => {
    const grown = coverage([region('west', square(40, -80.1, 40.1, -79.98)), region('east', east)]);
    expect(newPieces(grown.overlaps, loaded.overlaps)).toHaveLength(1);
    const elsewhere = coverage([
      region('west', west),
      region('east', east),
      region('north', square(40.09, -80.05, 40.2, -79.95)),
    ]);
    const fresh = newPieces(elsewhere.overlaps, loaded.overlaps);
    expect(fresh.map((piece) => piece.between)).toEqual([
      ['west', 'north'],
      ['east', 'north'],
    ]);
  });

  it('are found near what changed alone, whatever lies elsewhere', () => {
    const far = square(41, -80.1, 41.1, -79.99);
    const farEast = square(41, -80, 41.1, -79.9);
    const before = [
      region('r1', west),
      region('r2', east),
      region('r3', far),
      region('r4', farEast),
    ];
    // West grows into east, far away from the overlap of r3 and r4 that is there already.
    const grownWest = square(40, -80.1, 40.1, -79.98);
    const after = [
      region('r1', grownWest),
      region('r2', east),
      region('r3', far),
      region('r4', farEast),
    ];
    const found = newProblems(before, after);
    expect(found.overlaps.map((piece) => piece.between)).toEqual([['r1', 'r2']]);
    expect(found.gaps).toEqual([]);
    expect(newProblems(before, before)).toEqual({ overlaps: [], gaps: [] });
    // East removed between west and a region beyond it: a gap where it was.
    const beyond = square(40, -79.9, 40.1, -79.8);
    const around = [
      region('r1', square(40, -80.1, 40.1, -80)),
      region('r2', east),
      region('r5', beyond),
      region('r6', square(40.1, -80.1, 40.2, -79.8)),
      region('r7', square(39.9, -80.1, 40, -79.8)),
    ];
    const removed = around.filter((one) => one.key !== 'r2');
    expect(newProblems(around, removed).gaps).toHaveLength(1);
  });

  it('are the hole a region closes in a ring of regions far beyond it', () => {
    // Five regions around a long hole; the last one closes the ring at its eastern end, far
    // from the western ones, which only a chain of neighbours reaches.
    const ring = [
      region('south', square(40, -80.5, 40.1, -79.9)),
      region('west', square(40.1, -80.5, 40.2, -80.4)),
      region('north-west', square(40.2, -80.5, 40.3, -80.2)),
      region('north-east', square(40.2, -80.2, 40.3, -79.9)),
    ];
    const closed = [...ring, region('east', square(40.1, -80, 40.2, -79.9))];
    const found = newProblems(ring, closed);
    expect(found.overlaps).toEqual([]);
    expect(found.gaps).toHaveLength(1);
    expect(found.gaps[0]?.area).toBeCloseTo(boxArea(40.1, -80.4, 40.2, -80), -3);
    expect(newProblems(closed, ring).gaps).toEqual([]);
  });

  it('are a gap where there was none', () => {
    const before = coverage([
      region('west', square(40, -80.1, 40.1, -80)),
      region('east', square(40, -80, 40.1, -79.9)),
      region('north', square(40.1, -80.1, 40.2, -79.9)),
      region('south', square(39.9, -80.1, 40, -79.9)),
    ]);
    const after = coverage([
      region('west', square(40, -80.1, 40.1, -80.01)),
      region('east', square(40, -80, 40.1, -79.9)),
      region('north', square(40.1, -80.1, 40.2, -79.9)),
      region('south', square(39.9, -80.1, 40, -79.9)),
    ]);
    expect(before.gaps).toEqual([]);
    expect(newPieces(after.gaps, before.gaps)).toHaveLength(1);
    expect(newPieces(after.gaps, after.gaps)).toEqual([]);
  });
});
