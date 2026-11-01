import { afterAll, describe, expect, it, vi } from 'vitest';

// Leaflet reads the browser as it loads (what it is, whether it draws SVG or Canvas): just
// enough of one for it to load, before it is imported. Isolated: the real Leaflet with these
// globals needs a module graph of its own (testing.md).
vi.hoisted(() => {
  class FakeElement {}
  // An element as Leaflet makes and draws a marker's icon in it (review fix 9): its class, its
  // attributes, its listeners; and the parent a child hangs in.
  const element = (tag = 'div') => {
    const attributes = new Map<string, string>();
    const tree: { parentNode: unknown } = { parentNode: null };
    const made = Object.assign(new FakeElement(), tree, {
      style: {},
      tagName: tag.toUpperCase(),
      className: '',
      attributes,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      addEventListener: () => undefined,
      appendChild: (child: { parentNode: unknown }) => {
        child.parentNode = made;
        return child;
      },
    });
    return made;
  };
  vi.stubGlobal('Element', FakeElement);
  const browser = { userAgent: 'vitest', platform: 'vitest' };
  vi.stubGlobal('navigator', browser);
  vi.stubGlobal('window', {
    devicePixelRatio: 1,
    navigator: browser,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal('document', {
    documentElement: { style: {} },
    createElement: element,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});

import * as L from 'leaflet';
import { raidsMarker } from './party-layer.js';

afterAll(() => {
  vi.unstubAllGlobals();
});

/** A DOM node as Leaflet walks it from an event's target up to the map's container. */
interface Node {
  parentNode: Node | null;
}

/** What of Leaflet's map the routing of a mouse event uses (not in its published types). */
interface RoutingMap extends L.Map {
  _targets: Record<number, L.Layer>;
  _container: Node;
  _loaded: boolean;
  _fireDOMEvent(event: object, type: string): void;
}

/** Where the pointer is: what the map makes of the event's place, without a page to measure. */
const POINTER = L.latLng(40.0123, -80.0456);
const GYM = { lat: 40.06, lon: -80.06 };
/** The lead raid's heading, as its post words it (`MapRaid.heading`). */
const HEADING = 'Level 5 raid against Yveltal';

/**
 * The real Leaflet map's routing of a mouse event (`Map._fireDOMEvent`, `_findEventTargets`)
 * over a map with no page: its container, a pane in it, and the layers' elements in the pane;
 * where on the map the pointer is comes from `POINTER`. A layer's element is made its target as
 * Leaflet does when the layer is added to a map (`addInteractiveTarget`).
 */
function routingMap() {
  const map = Object.create(L.Map.prototype) as RoutingMap;
  const container: Node = { parentNode: null };
  const pane: Node = { parentNode: container };
  map._targets = {};
  map._container = container;
  map._loaded = true;
  map.mouseEventToContainerPoint = () => L.point(120, 80);
  map.containerPointToLayerPoint = (point) => L.point(point);
  map.layerPointToLatLng = () => POINTER;
  map.latLngToContainerPoint = () => L.point(0, 0);
  const opened: L.LatLng[] = [];
  // The page's handler (`showParties`): the spawn form opens where the map says.
  map.on('contextmenu', (event: L.LeafletMouseEvent) => opened.push(event.latlng));
  /** A right click (or a long press) on a layer's element. */
  const rightClick = (layer: L.Layer): void => {
    const element: Node = { parentNode: pane };
    (layer as unknown as { _map: L.Map })._map = map;
    (layer as unknown as { addInteractiveTarget(element: Node): void }).addInteractiveTarget(
      element,
    );
    map._fireDOMEvent(
      { type: 'contextmenu', target: element, preventDefault: () => undefined },
      'contextmenu',
    );
  };
  return { map, opened, rightClick };
}

/**
 * A raid's marker as the party layer makes it: its popup bound, its clicks taken. The binding is
 * a copy of what `showParties`' own `withPopup` adds (a popup, `popupopen` and `popupclose`):
 * that one is a closure of `showParties`, which needs the page's document and the side panel, so
 * it cannot run here. Should `withPopup` ever listen for more, this copy must follow it.
 */
function raidMarker(): L.Marker {
  return raidsMarker(
    GYM,
    // The circle of plan 8M-7 is an element of the page's; any icon of its kind routes alike.
    L.divIcon({ className: 'raid-icon' }),
    HEADING,
    (marker) =>
      marker
        .bindPopup('the raids of the gym')
        .on('popupopen', () => undefined)
        .on('popupclose', () => undefined),
    () => false,
  );
}

describe("a right click on a raid's picture or dot (plan 8M-6)", () => {
  it('opens the spawn form where the pointer is, through the map', () => {
    const { opened, rightClick } = routingMap();
    rightClick(raidMarker());
    expect(opened).toEqual([POINTER]);
  });

  it('would lose it to a raid marker that listened for it, at the gym instead of the pointer', () => {
    const { opened, rightClick } = routingMap();
    const taken: L.LatLng[] = [];
    const listening = raidMarker().on('contextmenu', (event: L.LeafletMouseEvent) =>
      taken.push(event.latlng),
    );
    rightClick(listening);
    expect(opened).toEqual([]);
    expect(taken).toEqual([L.latLng(GYM.lat, GYM.lon)]);
  });
});

describe("a raid marker's name (review fix 9)", () => {
  it("is the lead raid's heading on the element Leaflet draws, a button to the keyboard", () => {
    const { map } = routingMap();
    const marker = raidMarker();
    // What Leaflet's `_initIcon` needs of the page: the marker on a map, a pane to draw into.
    const drawing = marker as unknown as {
      _map: L.Map;
      getPane(): { appendChild(element: unknown): void };
      _initIcon(): void;
      _icon: { title?: string; tabIndex?: string; attributes: Map<string, string> };
    };
    drawing._map = map;
    drawing.getPane = () => ({ appendChild: () => undefined });
    drawing._initIcon();
    expect(drawing._icon.title).toBe(HEADING);
    expect(drawing._icon.attributes.get('role')).toBe('button');
  });
});
