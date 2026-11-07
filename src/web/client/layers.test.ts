import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  googleAttribution,
  googleTileUrl,
  OSM_ATTRIBUTION,
  sessionRequest,
  STADIA_ATTRIBUTION,
  BaseAttribution,
  StadiaFallback,
  type Wait,
  tileLayers,
  viewportUrl,
} from './layers.js';

const OSM = {
  kind: 'xyz',
  provider: 'osm',
  name: 'OpenStreetMap',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: OSM_ATTRIBUTION,
  // Drawn up to Stadia's 20, its own pictures enlarged past 19.
  maxNativeZoom: 19,
  maxZoom: 20,
};

const stadia = (style: string) => ({
  kind: 'xyz',
  provider: 'stadia',
  name: 'Stadia Maps',
  url: `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}{r}.png`,
  attribution: STADIA_ATTRIBUTION,
  maxZoom: 20,
  darkFilter: false,
});

describe('tileLayers (plan 8M-7)', () => {
  it("is Stadia Maps' Alidade Smooth by the device's scheme, light or dark", () => {
    expect(tileLayers('stadia', undefined, 'light')).toEqual([stadia('alidade_smooth')]);
    expect(tileLayers('stadia', undefined, 'dark')).toEqual([stadia('alidade_smooth_dark')]);
    // A key for Google changes nothing unless Google's tiles are set.
    expect(tileLayers('stadia', 'key', 'light')).toHaveLength(1);
  });

  it("is OpenStreetMap's alone for 'osm', darkened by the page's filter in dark", () => {
    expect(tileLayers('osm', undefined, 'light')).toEqual([{ ...OSM, darkFilter: false }]);
    expect(tileLayers('osm', 'key', 'dark')).toEqual([{ ...OSM, darkFilter: true }]);
  });

  it("offers Google's roadmap, satellite and hybrid beside Stadia's, only with a key", () => {
    expect(tileLayers('google', 'key', 'dark').map((layer) => layer.name)).toEqual([
      'Stadia Maps',
      'Google roadmap',
      'Google satellite',
      'Google hybrid',
    ]);
    expect(tileLayers('google', undefined, 'light')).toEqual([stadia('alidade_smooth')]);
  });

  it("is OpenStreetMap's in place of Stadia's once Stadia refused, Google's kept", () => {
    expect(tileLayers('stadia', undefined, 'dark', true)).toEqual([{ ...OSM, darkFilter: true }]);
    expect(tileLayers('stadia', undefined, 'light', true)).toEqual([{ ...OSM, darkFilter: false }]);
    expect(tileLayers('google', 'key', 'light', true).map((layer) => layer.name)).toEqual([
      'OpenStreetMap',
      'Google roadmap',
      'Google satellite',
      'Google hybrid',
    ]);
  });

  it("credits Stadia Maps, OpenMapTiles and OpenStreetMap's contributors, with links", () => {
    expect(STADIA_ATTRIBUTION).toBe(
      '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> ' +
        '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    );
  });
});

describe('StadiaFallback (plan 8M-7)', () => {
  it('switches after three failed tiles in a row, once until Stadia is tried again', () => {
    const fallback = new StadiaFallback('stadia');
    fallback.tileLoaded();
    expect(fallback.tileFailed()).toBe(false);
    expect(fallback.tileFailed()).toBe(false);
    expect(fallback.refused).toBe(false);
    expect(fallback.tileFailed()).toBe(true);
    expect(fallback.refused).toBe(true);
    // Every later error (OpenStreetMap's, or Stadia's still on their way) is no switch.
    expect(fallback.tileFailed()).toBe(false);
    expect(fallback.tileFailed()).toBe(false);
    expect(fallback.tileFailed()).toBe(false);
    fallback.stop();
  });

  it('starts the run again at a tile that loads: a hiccup is no refusal', () => {
    const fallback = new StadiaFallback('stadia');
    fallback.tileLoaded();
    expect(fallback.tileFailed()).toBe(false);
    expect(fallback.tileFailed()).toBe(false);
    fallback.tileLoaded();
    expect(fallback.tileFailed()).toBe(false);
    expect(fallback.tileFailed()).toBe(false);
    expect(fallback.refused).toBe(false);
  });

  it('switches at once when the first two tiles of the visit both fail', () => {
    const fallback = new StadiaFallback('stadia');
    expect(fallback.tileFailed()).toBe(false);
    expect(fallback.tileFailed()).toBe(true);
    expect(fallback.refused).toBe(true);
    fallback.stop();
  });

  it("never switches where Stadia's tiles are not shown", () => {
    const fallback = new StadiaFallback('osm');
    for (let i = 0; i < 5; i += 1) expect(fallback.tileFailed()).toBe(false);
    expect(fallback.refused).toBe(false);
  });
});

describe('StadiaFallback tries Stadia again (Matt, 2026-11-07)', () => {
  const MINUTE = 60_000;

  /** A wait that only records: what was asked, and the step to run when the test says. */
  function recordedWait() {
    const asked: number[] = [];
    let due: (() => void) | undefined;
    let canceled = 0;
    const wait: Wait = (ms, then) => {
      asked.push(ms);
      due = then;
      return () => {
        canceled += 1;
        due = undefined;
      };
    };
    const end = (): void => {
      const step = due;
      due = undefined;
      step?.();
    };
    return { wait, asked, end, canceled: () => canceled };
  }

  /** Three failed tiles in a row: the switch to OpenStreetMap. */
  const failThrice = (fallback: StadiaFallback): boolean[] => [
    fallback.tileFailed(),
    fallback.tileFailed(),
    fallback.tileFailed(),
  ];

  afterEach(() => {
    vi.useRealTimers();
  });

  it('goes back to Stadia after five minutes on OpenStreetMap', () => {
    const waits = recordedWait();
    const tryAgain = vi.fn<() => void>();
    const fallback = new StadiaFallback('stadia', tryAgain, waits.wait);
    fallback.tileLoaded();
    expect(failThrice(fallback)).toEqual([false, false, true]);
    expect(waits.asked).toEqual([5 * MINUTE]);
    expect(tryAgain).not.toHaveBeenCalled();
    waits.end();
    expect(tryAgain).toHaveBeenCalledTimes(1);
    expect(fallback.refused).toBe(false);
  });

  it('switches again only after three more failed tiles, a loaded one starting the count again', () => {
    const waits = recordedWait();
    const fallback = new StadiaFallback('stadia', () => undefined, waits.wait);
    // The first two tiles of the visit failed: the quick switch, once.
    expect([fallback.tileFailed(), fallback.tileFailed()]).toEqual([false, true]);
    waits.end();
    expect([fallback.tileFailed(), fallback.tileFailed()]).toEqual([false, false]);
    fallback.tileLoaded();
    expect(failThrice(fallback)).toEqual([false, false, true]);
    expect(fallback.refused).toBe(true);
  });

  it('doubles the wait at every switch, to an hour at most', () => {
    const waits = recordedWait();
    const fallback = new StadiaFallback('stadia', () => undefined, waits.wait);
    fallback.tileLoaded();
    for (let i = 0; i < 6; i += 1) {
      expect(failThrice(fallback)).toEqual([false, false, true]);
      waits.end();
    }
    expect(waits.asked).toEqual([5, 10, 20, 40, 60, 60].map((minutes) => minutes * MINUTE));
  });

  it("takes no OpenStreetMap tile's error or load for Stadia's while it waits", () => {
    const waits = recordedWait();
    const fallback = new StadiaFallback('stadia', () => undefined, waits.wait);
    fallback.tileLoaded();
    failThrice(fallback);
    fallback.tileLoaded();
    for (let i = 0; i < 5; i += 1) expect(fallback.tileFailed()).toBe(false);
    expect(waits.asked).toHaveLength(1);
  });

  it('tries no more once stopped (the map is gone)', () => {
    const waits = recordedWait();
    const tryAgain = vi.fn<() => void>();
    const fallback = new StadiaFallback('stadia', tryAgain, waits.wait);
    fallback.tileLoaded();
    failThrice(fallback);
    fallback.stop();
    expect(waits.canceled()).toBe(1);
    waits.end();
    expect(tryAgain).not.toHaveBeenCalled();
  });

  it("waits on the page's own timers by default", () => {
    vi.useFakeTimers();
    const tryAgain = vi.fn<() => void>();
    const fallback = new StadiaFallback('stadia', tryAgain);
    fallback.tileLoaded();
    failThrice(fallback);
    vi.advanceTimersByTime(5 * MINUTE - 1);
    expect(tryAgain).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(tryAgain).toHaveBeenCalledTimes(1);
    failThrice(fallback);
    vi.advanceTimersByTime(10 * MINUTE - 1);
    expect(tryAgain).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(tryAgain).toHaveBeenCalledTimes(2);
    failThrice(fallback);
    fallback.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('BaseAttribution (plan 8M-7)', () => {
  it("credits the base shown alone: OpenStreetMap's in place of Stadia's after the switch", () => {
    const shown: string[] = [];
    const control = {
      addAttribution: (text: string) => {
        shown.push(text);
      },
      removeAttribution: (text: string) => {
        shown.splice(shown.indexOf(text), 1);
      },
    };
    const credit = new BaseAttribution(control);
    const [stadiaBase] = tileLayers('stadia', undefined, 'light');
    const [osmBase] = tileLayers('stadia', undefined, 'light', true);
    if (stadiaBase?.kind !== 'xyz' || osmBase?.kind !== 'xyz') throw new Error('no base');
    credit.show(stadiaBase);
    expect(shown).toEqual([STADIA_ATTRIBUTION]);
    credit.show(osmBase);
    expect(shown).toEqual([OSM_ATTRIBUTION]);
    // A Google layer chosen in the switch: the base is not shown, nor credited.
    credit.show(undefined);
    expect(shown).toEqual([]);
  });
});

describe("Google's tiles", () => {
  it('ask for a session of the map type, in English for the US, the hybrid with roads', () => {
    const [, roadmap, satellite, hybrid] = tileLayers('google', 'key', 'light');
    if (roadmap?.kind !== 'google' || satellite?.kind !== 'google' || hybrid?.kind !== 'google') {
      throw new Error('no Google layers');
    }
    expect(sessionRequest(roadmap)).toEqual({
      mapType: 'roadmap',
      language: 'en-US',
      region: 'US',
    });
    expect(sessionRequest(satellite)).toEqual({
      mapType: 'satellite',
      language: 'en-US',
      region: 'US',
    });
    expect(sessionRequest(hybrid)).toEqual({
      mapType: 'satellite',
      language: 'en-US',
      region: 'US',
      layerTypes: ['layerRoadmap'],
    });
  });

  it('are fetched with the session and the key, from the Map Tiles API alone', () => {
    expect(googleTileUrl('s e/s', 'k&y')).toBe(
      'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=s%20e%2Fs&key=k%26y',
    );
    expect(
      viewportUrl('sess', 'key', 12, { north: 40.1, south: 40, east: -79.9, west: -80.1 }),
    ).toBe(
      'https://tile.googleapis.com/tile/v1/viewport?session=sess&key=key&zoom=12&north=40.1&south=40&east=-79.9&west=-80.1',
    );
  });

  it("credit Google Maps and the data's sources, as text", () => {
    expect(googleAttribution('Map data ©2026 Google')).toBe('Google Maps · Map data ©2026 Google');
    expect(googleAttribution('<img src=x onerror=alert(1)>')).toBe(
      'Google Maps · &lt;img src=x onerror=alert(1)&gt;',
    );
    expect(googleAttribution('')).toBe('Google Maps');
  });
});
