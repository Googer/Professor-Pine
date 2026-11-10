import { describe, expect, it } from 'vitest';
import type { GeoView } from '../../domain/web/geo-data.js';
import {
  fitZoom,
  MemberMoves,
  paddedBox,
  readLastView,
  regionOf,
  regionsBox,
  startView,
  STREET_ZOOM,
  writeLastView,
  zoomLimits,
  withinReach,
  type ViewStorage,
} from './view.js';

/** Two regions side by side: West 40.0–40.1 N, 80.2–80.1 W; East 40.0–40.2 N, 80.1–79.9 W. */
const REGIONS: GeoView['regions'] = [
  {
    id: 1,
    name: 'west',
    outline: [
      [40, -80.2],
      [40.1, -80.2],
      [40.1, -80.1],
      [40, -80.1],
      [40, -80.2],
    ],
  },
  {
    id: 2,
    name: 'east',
    outline: [
      [40, -80.1],
      [40.2, -80.1],
      [40.2, -79.9],
      [40, -79.9],
      [40, -80.1],
    ],
  },
];

const ALL = { south: 40, west: -80.2, north: 40.2, east: -79.9 };

/** A storage of the test's, which may refuse as a browser's does (private mode, full). */
function storage(refuses = false): ViewStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => {
      if (refuses) throw new Error('SecurityError');
      return items.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (refuses) throw new Error('QuotaExceededError');
      items.set(key, value);
    },
  };
}

describe("the server's box and its limits (plan 8M-7)", () => {
  it('is the box of every region, grown by a quarter of its size each way', () => {
    expect(regionsBox(REGIONS)).toEqual(ALL);
    expect(regionsBox([])).toBeUndefined();
    const grown = paddedBox(ALL, 0.25);
    expect(grown.south).toBeCloseTo(39.95, 9);
    expect(grown.north).toBeCloseTo(40.25, 9);
    expect(grown.west).toBeCloseTo(-80.275, 9);
    expect(grown.east).toBeCloseTo(-79.825, 9);
  });

  it('fits a box at the greatest whole zoom at which it shows whole', () => {
    // A 1,024th of the world's width in 256 pixels: zoom 10, by its width.
    expect(fitZoom({ south: 0, north: 0.0001, west: 0, east: 360 / 1024 }, 256, 256)).toBe(10);
    // Half as many pixels: one zoom less.
    expect(fitZoom({ south: 0, north: 0.0001, west: 0, east: 360 / 1024 }, 128, 256)).toBe(9);
    // A tall box is fitted by its height.
    expect(fitZoom({ south: -10, north: 10, west: 0, east: 0.0001 }, 1_000, 256)).toBe(
      Math.floor(fitZoom({ south: -10, north: 10, west: 0, east: 0.0001 }, 1_000, 256)),
    );
    expect(fitZoom({ south: -10, north: 10, west: 0, east: 0.0001 }, 1_000, 256)).toBeLessThan(
      fitZoom({ south: -10, north: 10, west: 0, east: 0.0001 }, 1_000, 512),
    );
  });

  it('never lets the map out past the zoom of all regions, nor far beyond them', () => {
    const limits = zoomLimits(REGIONS, { width: 800, height: 600 });
    expect(limits?.minZoom).toBe(fitZoom(ALL, 800, 600));
    expect(limits?.minZoom).toBe(11);
    expect(limits?.maxBounds).toEqual(paddedBox(ALL, 0.25));
    // A server without regions has no limits.
    expect(zoomLimits([], { width: 800, height: 600 })).toBeUndefined();
  });
});

describe('the start view (plan 8M-7)', () => {
  const here = { lat: 40.05, lon: -80.15 };

  it('is where you are, at street level, when the browser shares it already', () => {
    expect(
      startView({
        located: here,
        region: 2,
        last: { lat: 40.1, lon: -80, zoom: 13 },
        regions: REGIONS,
      }),
    ).toEqual({ kind: 'point', center: here, zoom: STREET_ZOOM });
  });

  it("is the region /maps named next, at street level at its box's middle", () => {
    expect(
      startView({ region: 2, last: { lat: 40.1, lon: -80, zoom: 13 }, regions: REGIONS }),
    ).toEqual({ kind: 'point', center: { lat: 40.1, lon: -80 }, zoom: STREET_ZOOM });
  });

  it('is where you last left the map next, at its own zoom', () => {
    const last = { lat: 40.12, lon: -80.01, zoom: 13 };
    expect(startView({ region: 99, last, regions: REGIONS })).toEqual({
      kind: 'point',
      center: { lat: 40.12, lon: -80.01 },
      zoom: 13,
    });
  });

  it('is the whole server last, and skips a place far beyond its regions', () => {
    const far = { lat: 51.5, lon: -0.12 };
    expect(startView({ located: far, last: { ...far, zoom: 15 }, regions: REGIONS })).toEqual({
      kind: 'fit',
      box: ALL,
    });
    expect(startView({ regions: [] })).toEqual({ kind: 'none' });
    // Without regions any place will do: nothing limits the map.
    expect(startView({ located: far, regions: [] })).toEqual({
      kind: 'point',
      center: far,
      zoom: STREET_ZOOM,
    });
  });

  // Review B5: the Report button's step 2 takes your location by the same rule.
  it('reaches a place within the regions and their margin, any place without regions', () => {
    expect(withinReach(REGIONS, { lat: 40.1, lon: -80 })).toBe(true);
    // A quarter of the regions' size beyond them (0.05° of 0.2° north), and not beyond that.
    expect(withinReach(REGIONS, { lat: 40.24, lon: -80 })).toBe(true);
    expect(withinReach(REGIONS, { lat: 40.26, lon: -80 })).toBe(false);
    expect(withinReach(REGIONS, { lat: 51.5, lon: -0.12 })).toBe(false);
    expect(withinReach([], { lat: 51.5, lon: -0.12 })).toBe(true);
  });

  it('reads the region /maps named from the address', () => {
    expect(regionOf('?region=12')).toBe(12);
    expect(regionOf('?login=expired&region=3')).toBe(3);
    expect(regionOf('')).toBeUndefined();
    expect(regionOf('?region=x')).toBeUndefined();
    expect(regionOf('?region=-1')).toBeUndefined();
  });
});

describe('the last view (plan 8M-7)', () => {
  it('is kept per server in the browser, and read back', () => {
    const kept = storage();
    writeLastView(kept, '412345678901234567', { lat: 40.1, lon: -80, zoom: 14 });
    expect(readLastView(kept, '412345678901234567')).toEqual({ lat: 40.1, lon: -80, zoom: 14 });
    expect(readLastView(kept, '412345678901234999')).toBeUndefined();
  });

  it('is none where the browser keeps nothing or kept something else', () => {
    const refusing = storage(true);
    expect(() => {
      writeLastView(refusing, '1', { lat: 1, lon: 2, zoom: 3 });
    }).not.toThrow();
    expect(readLastView(refusing, '1')).toBeUndefined();
    const odd = storage();
    odd.items.set('pine-map-view:1', '{"lat":"x"}');
    expect(readLastView(odd, '1')).toBeUndefined();
    odd.items.set('pine-map-view:1', 'not json');
    expect(readLastView(odd, '1')).toBeUndefined();
    expect(readLastView(undefined, '1')).toBeUndefined();
  });
});

describe('whether the member moved the map (plan 8M-7)', () => {
  it('counts any move or zoom once the start view is set, not the start view itself', () => {
    const moves = new MemberMoves();
    // The start view's own move.
    moves.seen();
    expect(moves.moved).toBe(false);
    moves.begin();
    expect(moves.moved).toBe(false);
    // A drag, a zoom, a tap on a line of the list that flies the map: the location waits.
    moves.seen();
    expect(moves.moved).toBe(true);
  });
});
