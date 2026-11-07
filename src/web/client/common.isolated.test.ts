import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addTiles, OSM_NOTICE } from './common.js';

// Leaflet reads the browser's `window` as it loads: its tile layers, groups and layer switch are
// recorded here instead, each layer with its handlers to be fired. The page's notice band and its
// theme are stand-ins too. Isolated: a mocked module needs a module graph of its own.
const fake = vi.hoisted(() => {
  type Handler = () => void;
  class Handlers {
    private readonly byEvent = new Map<string, Handler[]>();
    on(events: string, handler: Handler): this {
      for (const event of events.split(' ')) {
        this.byEvent.set(event, [...(this.byEvent.get(event) ?? []), handler]);
      }
      return this;
    }
    off(events: string): this {
      for (const event of events.split(' ')) this.byEvent.delete(event);
      return this;
    }
    fire(event: string): void {
      for (const handler of this.byEvent.get(event) ?? []) handler();
    }
  }
  class Layer extends Handlers {
    constructor(readonly url: string) {
      super();
    }
    addTo(map: { layers: Set<unknown> }): this {
      map.layers.add(this);
      return this;
    }
  }
  class Switch {
    bases: { layer: unknown; name: string }[] = [];
    addBaseLayer(layer: unknown, name: string): this {
      this.bases.push({ layer, name });
      return this;
    }
    removeLayer(layer: unknown): this {
      this.bases = this.bases.filter((one) => one.layer !== layer);
      return this;
    }
    addTo(): this {
      return this;
    }
  }
  class LeafletMap extends Handlers {
    readonly layers = new Set<unknown>();
    readonly attributionControl = {
      addAttribution: () => undefined,
      removeAttribution: () => undefined,
    };
    hasLayer(layer: unknown): boolean {
      return this.layers.has(layer);
    }
    removeLayer(layer: unknown): this {
      this.layers.delete(layer);
      return this;
    }
    getContainer() {
      return { classList: { toggle: () => undefined } };
    }
  }
  return {
    Layer,
    Switch,
    LeafletMap,
    tiles: [] as Layer[],
    switches: [] as Switch[],
    said: [] as string[],
  };
});

vi.mock('leaflet', () => ({
  tileLayer: (url: string) => {
    const layer = new fake.Layer(url);
    fake.tiles.push(layer);
    return layer;
  },
  layerGroup: () => new fake.Layer('google'),
  control: {
    layers: (bases: Record<string, unknown>) => {
      const made = new fake.Switch();
      for (const [name, layer] of Object.entries(bases)) made.bases.push({ layer, name });
      fake.switches.push(made);
      return made;
    },
  },
}));
vi.mock('./theme.js', () => ({ darkScheme: () => false, onThemeChange: () => undefined }));
vi.mock('./page-frame.js', () => ({
  getJson: () => Promise.reject(new Error('no network in tests')),
  say: (text: string) => {
    fake.said.push(text);
  },
}));

const MINUTE = 60_000;
type FakeMap = InstanceType<typeof fake.LeafletMap>;
type FakeLayer = InstanceType<typeof fake.Layer>;

let maps: FakeMap[] = [];

/** A map with the tiles of the setting, as the map page and the region editor add them. */
function mapWith(setting: 'stadia' | 'google'): FakeMap {
  const map = new fake.LeafletMap();
  maps.push(map);
  addTiles(map as unknown as Parameters<typeof addTiles>[0], setting, 'key');
  return map;
}

/** The plain tiles a map shows (Stadia's or OpenStreetMap's), if any. */
const shownTiles = (map: FakeMap): FakeLayer | undefined =>
  fake.tiles.find((layer) => map.hasLayer(layer));

const isStadia = (layer: FakeLayer | undefined) => layer?.url.includes('stadiamaps') === true;
const isOsm = (layer: FakeLayer | undefined) => layer?.url.includes('openstreetmap') === true;

/** Stadia's tiles of a map refuse: one loaded, then three failed in a row. */
function refuse(map: FakeMap): void {
  const stadia = shownTiles(map);
  stadia?.fire('tileload');
  for (let i = 0; i < 3; i += 1) stadia?.fire('tileerror');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const map of maps) map.fire('unload');
  maps = [];
  fake.tiles.length = 0;
  fake.switches.length = 0;
  fake.said.length = 0;
  vi.useRealTimers();
});

describe('addTiles: Stadia refused and tried again', () => {
  it("says once that the map shows OpenStreetMap's, and nothing when Stadia's come back", () => {
    const map = mapWith('stadia');
    refuse(map);
    expect(isOsm(shownTiles(map))).toBe(true);
    expect(fake.said).toEqual([OSM_NOTICE]);
    vi.advanceTimersByTime(5 * MINUTE);
    expect(isStadia(shownTiles(map))).toBe(true);
    expect(fake.said).toEqual([OSM_NOTICE]);
    refuse(map);
    expect(isOsm(shownTiles(map))).toBe(true);
    expect(fake.said).toEqual([OSM_NOTICE, OSM_NOTICE]);
  });

  it("puts Stadia's back in the layer switch without showing them while Google's is chosen", () => {
    const map = mapWith('google');
    const [layerSwitch] = fake.switches;
    refuse(map);
    const osm = shownTiles(map);
    expect(layerSwitch?.bases.map((one) => one.layer)).toContain(osm);
    // The member picks Google's roadmap in the switch.
    if (osm !== undefined) map.removeLayer(osm);
    map.layers.add(layerSwitch?.bases.find((one) => one.name === 'Google roadmap')?.layer);
    map.fire('baselayerchange');
    vi.advanceTimersByTime(5 * MINUTE);
    const base = layerSwitch?.bases.find((one) => one.name === 'Stadia Maps')?.layer as
      FakeLayer | undefined;
    expect(isStadia(base)).toBe(true);
    expect(layerSwitch?.bases.map((one) => one.layer)).not.toContain(osm);
    expect(map.hasLayer(base)).toBe(false);
  });

  it("switches the map and the region editor's together, on one wait and with one notice", () => {
    const live = mapWith('stadia');
    const editor = mapWith('stadia');
    refuse(live);
    expect(isOsm(shownTiles(live))).toBe(true);
    expect(isOsm(shownTiles(editor))).toBe(true);
    expect(fake.said).toEqual([OSM_NOTICE]);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(5 * MINUTE);
    expect(isStadia(shownTiles(live))).toBe(true);
    expect(isStadia(shownTiles(editor))).toBe(true);
  });

  it('keeps trying while a map is left, and stops once the last one unloads', () => {
    const live = mapWith('stadia');
    const editor = mapWith('stadia');
    refuse(live);
    editor.fire('unload');
    expect(vi.getTimerCount()).toBe(1);
    live.fire('unload');
    expect(vi.getTimerCount()).toBe(0);
  });
});
