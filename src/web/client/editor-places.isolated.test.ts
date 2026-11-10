import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClusteredPlaces, type PlaceLook } from './editor-places.js';
import type { EditorPlace } from './editor-view.js';

/**
 * One layer of the region editor's places (plan 8M-11C, S30, review C1) over a Leaflet of fakes
 * that behave as Leaflet does where it matters here: a marker's element exists only while its
 * group is on the map, and is made anew (without the classes the page gave the old one) each time
 * the group is put back. Isolated: Leaflet is mocked.
 */
const fake = vi.hoisted(() => {
  type Handler = () => void;
  /** An element as Leaflet makes it for a marker: its classes and attributes. */
  class Element {
    readonly classes = new Set<string>();
    readonly classList = {
      toggle: (name: string, on: boolean) => {
        if (on) this.classes.add(name);
        else this.classes.delete(name);
      },
    };
    setAttribute() {
      return undefined;
    }
  }
  class Layer {
    readonly handlers = new Map<string, Handler[]>();
    group: Group | undefined;
    element: Element | undefined;
    constructor(
      public at: [number, number],
      readonly options: Record<string, unknown> = {},
    ) {}
    on(type: string, handler: Handler) {
      this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
      return this;
    }
    fire(type: string) {
      for (const handler of this.handlers.get(type) ?? []) handler();
    }
    bindTooltip() {
      return this;
    }
    setStyle(style: Record<string, unknown>) {
      Object.assign(this.options, style);
      return this;
    }
    setLatLng(at: [number, number]) {
      this.at = at;
      return this;
    }
    getElement() {
      return this.element;
    }
    addTo(group: Group) {
      group.addLayer(this);
      return this;
    }
    /** Put on the map: a new element, then Leaflet's `add`. */
    shown() {
      this.element = new Element();
      this.fire('add');
    }
  }
  class Group {
    readonly layers = new Set<Layer>();
    onMap = false;
    addLayer(layer: Layer) {
      layer.group = this;
      this.layers.add(layer);
      if (this.onMap) layer.shown();
      return this;
    }
    removeLayer(layer: Layer) {
      layer.group = undefined;
      layer.element = undefined;
      this.layers.delete(layer);
      return this;
    }
    clearLayers() {
      for (const layer of [...this.layers]) this.removeLayer(layer);
      return this;
    }
    /** The layer switch turns it on: every element made anew. */
    putOn() {
      this.onMap = true;
      for (const layer of this.layers) layer.shown();
    }
    takeOff() {
      this.onMap = false;
      for (const layer of this.layers) layer.element = undefined;
    }
  }
  return { Layer, Group, Element };
});

vi.mock('leaflet', () => ({
  marker: (at: [number, number], options: Record<string, unknown>) => new fake.Layer(at, options),
  divIcon: (options: Record<string, unknown>) => ({ options }),
  latLngBounds: () => ({ getCenter: () => ({ lat: 0, lng: 0 }) }),
  point: (x: number, y: number) => ({ x, y }),
}));

type FakeLayer = InstanceType<typeof fake.Layer>;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Two stops of one cell at zoom 12 (a cluster), and one on its own there, in their cell at 8. */
const PLACES: EditorPlace[] = [
  { id: 0, lat: 40.03, lon: -80.05, name: 'Mural' },
  { id: 1, lat: 40.031, lon: -80.051, name: 'Bench' },
  { id: 2, lat: 40.1, lon: -80.2, name: 'Kiosk' },
];

/** A layer of the editor's places on a map at `zoom` that shows them all. */
function placed(zoom = 12) {
  // The clusters' hover words watch the pointer used and the map's popups (`hover-name.ts`).
  vi.stubGlobal('document', {
    createElement: () => ({ textContent: null }),
    addEventListener: () => undefined,
  });
  const group = new fake.Group();
  group.onMap = true;
  let viewAsked = 0;
  const map = {
    zoom,
    hasLayer: (layer: unknown) => layer === group && group.onMap,
    on: () => map,
    getZoom: () => map.zoom,
    getBounds: () => {
      viewAsked += 1;
      return {
        getSouth: () => 39.9,
        getWest: () => -80.2,
        getNorth: () => 40.3,
        getEast: () => -79.6,
      };
    },
  };
  const look: PlaceLook = {
    className: 'places-stops',
    title: (n) => `${String(n)} PokéStops`,
    colour: (outside) => (outside ? 'warn' : 'stop'),
    dot: (place, outside) =>
      new fake.Layer([place.lat, place.lon], {
        name: place.name,
        color: outside ? 'warn' : 'stop',
      }) as never,
  };
  const places = new ClusteredPlaces(map as never, group as never, look);
  places.setPlaces(PLACES);
  /** What the group holds: its clusters and its dots. */
  const clusters = () => [...group.layers].filter((layer) => layer.options.icon !== undefined);
  const dots = () => [...group.layers].filter((layer) => layer.options.icon === undefined);
  const ringed = (layer: FakeLayer | undefined) =>
    layer?.getElement()?.classes.has('outside') ?? false;
  return { places, group, map, clusters, dots, ringed, viewAsked: () => viewAsked };
}

describe("the editor's clustered places (review C1)", () => {
  it('keep the ring of a cluster when its layer is turned off and on again', () => {
    const { places, group, clusters, ringed } = placed();
    places.setOutside(new Set([1]));
    places.refresh();
    expect(ringed(clusters()[0])).toBe(true);
    group.takeOff();
    group.putOn();
    // Leaflet made its element anew: the ring is put back with it, before any move.
    expect(ringed(clusters()[0])).toBe(true);
  });

  it('ring a cluster whose place left every region while its layer was off', () => {
    const { places, group, clusters, ringed } = placed();
    places.refresh();
    expect(ringed(clusters()[0])).toBe(false);
    group.takeOff();
    places.setOutside(new Set([0]));
    group.putOn();
    expect(ringed(clusters()[0])).toBe(true);
  });

  it('work nothing out while their layer is off', () => {
    const { places, group, viewAsked } = placed();
    group.takeOff();
    places.refresh();
    expect(viewAsked()).toBe(0);
    expect(group.layers.size).toBe(0);
  });

  it('draw the new places alone once the data is loaded anew', () => {
    const { places, dots, map } = placed(16);
    places.refresh();
    expect(dots().map((dot) => dot.options.name)).toEqual(['Mural', 'Bench', 'Kiosk']);
    places.setPlaces([{ id: 0, lat: 40.05, lon: -80.0, name: 'Fountain' }]);
    map.zoom = 16;
    places.refresh();
    expect(dots().map((dot) => [dot.options.name, dot.at])).toEqual([['Fountain', [40.05, -80.0]]]);
  });

  it("set a cluster's ring anew when its marker is given to another zoom's cluster", () => {
    const { places, clusters, ringed, map } = placed(12);
    places.setOutside(new Set([2]));
    places.refresh();
    const [cluster] = clusters();
    expect(ringed(cluster)).toBe(false);
    // Zoom 8: the three are one cluster, on the marker of the two; the third is in no region.
    map.zoom = 8;
    places.refresh();
    expect(clusters()).toEqual([cluster]);
    expect(ringed(cluster)).toBe(true);
    places.setOutside(new Set());
    expect(ringed(cluster)).toBe(false);
  });

  it('edge a dot in the warning color while its place is in no region', () => {
    const { places, dots } = placed(16);
    places.refresh();
    places.setOutside(new Set([2]));
    expect(dots().map((dot) => dot.options.color)).toEqual(['stop', 'stop', 'warn']);
  });
});
