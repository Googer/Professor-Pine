import type * as L from 'leaflet';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayerRegistry, LAYERS_KEY, MAP_LAYERS } from './layer-registry.js';
import { MapActivity } from './parties.js';
import { placeClicks, showPlaces, type PlaceSpot, type PlacesHooks } from './places-ui.js';
import { RouteFocus } from './route-focus.js';

// Leaflet reads the browser's `window` as it loads: what `placeClicks` uses of it is how an event
// is stopped, recorded here; what `showPlaces` draws are dots in groups, recorded with their
// handlers, and popups, counted as they open. Isolated: a mocked module needs a module graph of
// its own.
const stopped = vi.hoisted(() => [] as unknown[]);
const drawn = vi.hoisted(() => {
  type Handler = (event: unknown) => void;
  /** A place's dot as `showPlaces` draws it: where, its class, its handlers. */
  class Dot {
    readonly handlers = new Map<string, Handler[]>();
    constructor(
      readonly at: [number, number],
      readonly options: Record<string, unknown>,
    ) {}
    on(type: string, handler: Handler) {
      this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
      return this;
    }
    off(type: string) {
      this.handlers.delete(type);
      return this;
    }
    fire(type: string, event: unknown = { type }) {
      for (const handler of this.handlers.get(type) ?? []) handler(event);
    }
    addTo(group: { mine: Dot[] }) {
      group.mine.push(this);
      drawn.dots.push(this);
      return this;
    }
    getElement() {
      return undefined;
    }
    setStyle() {
      return this;
    }
  }
  const drawn = { Dot, dots: [] as Dot[], popups: 0, popupOptions: undefined as unknown };
  return drawn;
});
vi.mock('leaflet', () => ({
  DomEvent: {
    stop: (event: unknown) => {
      stopped.push(event);
    },
    stopPropagation: () => undefined,
  },
  CircleMarker: drawn.Dot,
  circleMarker: (at: [number, number], options: Record<string, unknown>) =>
    new drawn.Dot(at, options),
  layerGroup: () => {
    const group = {
      mine: [] as InstanceType<typeof drawn.Dot>[],
      addTo: () => group,
      clearLayers: () => {
        drawn.dots = drawn.dots.filter((dot) => !group.mine.includes(dot));
        group.mine = [];
        return group;
      },
      eachLayer: () => undefined,
    };
    return group;
  },
  popup: (options: unknown) => {
    drawn.popupOptions = options;
    const popup = {
      setLatLng: () => popup,
      setContent: () => popup,
      openOn: () => {
        drawn.popups += 1;
        return popup;
      },
      getElement: () => undefined,
    };
    return popup;
  },
}));

/** A place's marker: its handlers by event, and its element once on the map. */
function placeMarker() {
  const handlers = new Map<string, ((event: unknown) => void)[]>();
  const attributes = new Map<string, string>();
  const marker = {
    attributes,
    off(type: string) {
      handlers.delete(type);
      return marker;
    },
    on(type: string, handler: (event: unknown) => void) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
      return marker;
    },
    getElement() {
      return {
        setAttribute: (name: string, value: string) => {
          attributes.set(name, value);
        },
        removeAttribute: (name: string) => {
          attributes.delete(name);
        },
      };
    },
    /** Leaflet fires an event on the marker. */
    fire(type: string, event: unknown) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    },
  };
  return marker;
}

// Review C10 of 8M-8C: a Power Spot is a stop to add as a gym is, also by the keyboard.
describe("a Power Spot's clicks and keys (placeClicks)", () => {
  // Re-review N1: up to 300 dots before the side pane are no Tab stops outside route mode.
  it('is no Tab stop on the map outside route mode', () => {
    const marker = placeMarker();
    placeClicks(
      marker as unknown as L.CircleMarker,
      'Lake Gazebo',
      () => false,
      () => undefined,
    );
    marker.fire('add', {});
    expect(Object.fromEntries(marker.attributes)).toEqual({});
  });

  it('is a Tab stop named for a screen reader while route mode is on (RouteFocus)', () => {
    const marker = placeMarker();
    const focus = new RouteFocus();
    placeClicks(
      marker as unknown as L.CircleMarker,
      'Lake Gazebo',
      () => true,
      () => undefined,
      focus,
    );
    marker.fire('add', {});
    expect(Object.fromEntries(marker.attributes)).toEqual({});
    focus.set(true);
    expect(Object.fromEntries(marker.attributes)).toEqual({
      tabindex: '0',
      role: 'button',
      'aria-label': 'Lake Gazebo',
    });
  });

  it('adds the spot on Enter in route mode, and keeps a double tap from zooming the map', () => {
    stopped.length = 0;
    const marker = placeMarker();
    let added = 0;
    let opened = 0;
    placeClicks(
      marker as unknown as L.CircleMarker,
      'Lake Gazebo',
      () => {
        added += 1;
        return true;
      },
      () => {
        opened += 1;
      },
    );
    marker.fire('keypress', { originalEvent: { key: 'Enter' } });
    const taps = [{ type: 'click' }, { type: 'click' }];
    const double = { type: 'dblclick' };
    for (const tap of taps) marker.fire('click', tap);
    marker.fire('dblclick', double);
    expect(added).toBe(3);
    expect(opened).toBe(0);
    expect(stopped).toContain(double);
  });

  it('opens its popup on a tap or Enter out of route mode, a double tap left to the map', () => {
    stopped.length = 0;
    const marker = placeMarker();
    let opened = 0;
    placeClicks(
      marker as unknown as L.CircleMarker,
      'Lake Gazebo',
      () => false,
      () => {
        opened += 1;
      },
    );
    marker.fire('click', { type: 'click' });
    marker.fire('keypress', { originalEvent: { key: 'Enter' } });
    const double = { type: 'dblclick' };
    marker.fire('dblclick', double);
    expect(opened).toBe(2);
    expect(stopped).not.toContain(double);
  });
});

/** Just enough of an element for a popup's content (`renderNode`). */
class PageElement {
  className = '';
  textContent: string | null = '';
  readonly children: PageElement[] = [];
  constructor(readonly tag: string) {}
  setAttribute(): void {}
  append(...children: PageElement[]): void {
    this.children.push(...children);
  }
}

describe('the Power Spots and PokéStops of the view (showPlaces)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const SPOT: [string, number, number, string] = ['spot-1', 40.45, -79.94, 'Lake Gazebo'];
  const STOP: [string, number, number, string] = ['stop-1', 40.44, -79.95, 'Fountain'];

  /**
   * `showPlaces` for a member at street level, both layers on, with `hooks`; resolves once the
   * Power Spots of the view came and were drawn.
   */
  const shownWith = async (hooks: PlacesHooks, activity?: MapActivity) => {
    drawn.dots = [];
    drawn.popups = 0;
    // The theme read from a page without the stylesheet: its defaults.
    vi.stubGlobal('document', {
      createElement: (tag: string) => new PageElement(tag),
      // No theme chosen (plan 8M-13, S10): the device's.
      documentElement: { getAttribute: () => null },
      addEventListener: () => undefined,
    });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
    /** The timers set (the 300 ms after the map rests), to run by hand. */
    const timers: Array<() => void> = [];
    vi.stubGlobal('window', {
      setTimeout: (run: () => void) => {
        timers.push(run);
        return timers.length;
      },
      clearTimeout: () => undefined,
    });
    const asked: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url);
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes('/api/powerspots')
              ? { spots: [SPOT], more: false }
              : { stops: [STOP], more: false },
          ),
      });
    });
    const registry = new LayerRegistry({
      getItem: (key) => (key === LAYERS_KEY ? JSON.stringify({ stops: true, spots: true }) : null),
      setItem: () => undefined,
    });
    for (const layer of MAP_LAYERS) registry.register(layer);
    const handlers = new Map<string, Array<() => void>>();
    const map = {
      on: (type: string, handler: () => void) => {
        handlers.set(type, [...(handlers.get(type) ?? []), handler]);
        return map;
      },
      getZoom: () => 17,
      getSize: () => ({ x: 1200, y: 800 }),
      getBounds: () => ({
        getSouth: () => 40.4,
        getWest: () => -80,
        getNorth: () => 40.5,
        getEast: () => -79.9,
      }),
    };
    let came: (spots: readonly PlaceSpot[] | 'failed' | 'zoom') => void = () => undefined;
    const spotsCame = new Promise<readonly PlaceSpot[] | 'failed' | 'zoom'>((resolve) => {
      came = resolve;
    });
    const places = showPlaces(
      map as unknown as L.Map,
      '100000000000000001',
      registry,
      { set: () => undefined },
      () => true,
      () => false,
      undefined,
      hooks,
      activity,
    );
    places.onSpots(came);
    await spotsCame;
    // The stops' answer came in the same turn as the spots'.
    await Promise.resolve();
    const dotOf = (className: string) =>
      drawn.dots.find((dot) => dot.options.className === className);
    /** Leaflet fires an event on the map. */
    const fire = (type: string) => {
      for (const handler of handlers.get(type) ?? []) handler();
    };
    return { places, dotOf, fire, timers, asked };
  };

  /** The hooks of a member who may report, nothing picked, nothing drawn in a place's stead. */
  const hooks = (more: Partial<PlacesHooks> = {}): PlacesHooks => ({
    spotControls: () => [],
    occupied: () => new Set(),
    forced: () => false,
    openBattle: () => false,
    stopTapped: () => false,
    ...more,
  });

  // Re-review V1: the live map hidden under the region editor can move (a window resized); its
  // places are asked for once the editor is off, not for a map nobody sees.
  it('asks for nothing as the hidden map moves while the editor is on, and once when it is off', async () => {
    const activity = new MapActivity(() => true);
    const { fire, timers, asked } = await shownWith(hooks(), activity);
    const first = asked.length;
    activity.setEditing(true);
    fire('moveend');
    fire('moveend');
    expect(timers).toEqual([]);
    activity.setEditing(false);
    expect(timers).toHaveLength(2);
    for (const run of timers) run();
    expect(asked.slice(first).sort()).toEqual([
      expect.stringContaining('/s/100000000000000001/api/powerspots?'),
      expect.stringContaining('/s/100000000000000001/api/stops?'),
    ]);
  });

  // Review, finding 12: a form anchored in the popup scrolls inside it, as in the parties' popups.
  it("gives a plain place's popup the height the parties' popups have", async () => {
    const { dotOf } = await shownWith(hooks());
    dotOf('spot-dot')?.fire('click');
    expect(drawn.popups).toBe(1);
    expect(drawn.popupOptions).toMatchObject({ maxHeight: 660 });
  });

  // Review B1: with the Raids layer off a spot's dot is drawn though a battle stands there.
  it("opens the battle that stands at a Power Spot on a tap of the spot's dot, not the spot's popup", async () => {
    const asked: string[] = [];
    const { dotOf } = await shownWith(
      hooks({
        openBattle: (spotId) => {
          asked.push(spotId);
          return true;
        },
      }),
    );
    dotOf('spot-dot')?.fire('click');
    expect(asked).toEqual(['spot-1']);
    expect(drawn.popups).toBe(0);
  });

  // The Report button's dimming reaches the dots on Leaflet's overlay pane (`map.css`).
  it('draws the Power Spots and PokéStops on the overlay pane, with no pane of their own', async () => {
    const { dotOf } = await shownWith(hooks());
    expect(dotOf('spot-dot')?.options.pane).toBeUndefined();
    expect(dotOf('stop-dot')?.options.pane).toBeUndefined();
  });

  // Matt, 2026-10-30: a dot under a ring lists what shares its place, as a gym's dot does.
  it('asks the parties what a tap on a dot opens, handing them its own popup', async () => {
    const tapped: unknown[] = [];
    const owns: Array<() => void> = [];
    const { dotOf } = await shownWith(
      hooks({
        placeTapped: (layer, place, own) => {
          tapped.push([layer, place.id]);
          owns.push(own);
        },
      }),
    );
    dotOf('stop-dot')?.fire('click');
    dotOf('spot-dot')?.fire('click');
    expect(tapped).toEqual([
      ['stops', 'stop-1'],
      ['spots', 'spot-1'],
    ]);
    expect(drawn.popups).toBe(0);
    for (const own of owns) own();
    expect(drawn.popups).toBe(2);
  });

  it("opens the spot's popup where no battle stands", async () => {
    const { dotOf } = await shownWith(hooks());
    dotOf('spot-dot')?.fire('click');
    expect(drawn.popups).toBe(1);
  });

  // Review B6: in step 2 of a spawn a PokéStop tapped is the place, as a gym or a spot is.
  it("draws a Power Spot's popup by the parties' hook, its controls under it", async () => {
    const asked: unknown[] = [];
    const { dotOf } = await shownWith(
      hooks({
        spotPopup: (spot) => {
          asked.push(spot.title);
          return undefined;
        },
      }),
    );
    dotOf('spot-dot')?.fire('click');
    expect(asked).toHaveLength(1);
  });

  // Design 2026-11-04: a Power Spot's address asked as its popup opens, kept in the last list.
  it("asks for a Power Spot's address as its popup opens, and never a PokéStop's", async () => {
    const asked: unknown[] = [];
    const { dotOf, places } = await shownWith(
      hooks({
        spotAddress: (spot) => {
          asked.push([spot.id, spot.address]);
        },
      }),
    );
    dotOf('spot-dot')?.fire('click');
    dotOf('stop-dot')?.fire('click');
    places.openSpot({ id: 'spot-9', title: 'Bandstand', lat: 40.46, lon: -79.93 });
    expect(asked).toEqual([
      ['spot-1', undefined],
      ['spot-9', undefined],
    ]);
  });

  it("keeps an address found in its last list: the spot's next popup has it at once", async () => {
    const shown: unknown[] = [];
    const { dotOf, places } = await shownWith(
      hooks({
        spotPopup: (spot) => {
          shown.push(spot.address);
          return undefined;
        },
      }),
    );
    places.addressFound('spot-1', '600 Grant St, Pittsburgh');
    dotOf('spot-dot')?.fire('click');
    expect(shown).toEqual(['600 Grant St, Pittsburgh']);
  });

  it("gives a PokéStop's tap to the Report button's step 2, its popup opened only where it is not taken", async () => {
    const tapped: unknown[] = [];
    let taken = true;
    const { dotOf } = await shownWith(
      hooks({
        stopTapped: (stop) => {
          tapped.push(stop);
          return taken;
        },
      }),
    );
    dotOf('stop-dot')?.fire('click');
    expect(tapped).toEqual([{ id: 'stop-1', title: 'Fountain', lat: 40.44, lon: -79.95 }]);
    expect(drawn.popups).toBe(0);
    taken = false;
    dotOf('stop-dot')?.fire('click');
    expect(drawn.popups).toBe(1);
  });

  // Review 8H4H-3: the Activity layer's circles are judged by the dots drawn, not by the switch.
  it('says which Power Spots have their own dot drawn, and tells each time the dots are drawn', async () => {
    const told: string[] = [];
    const { places } = await shownWith(
      hooks({
        drawn: (layer) => {
          told.push(layer);
        },
      }),
    );
    expect(told).toContain('spots');
    expect(places.spotDrawn('spot-1')).toBe(true);
    // Not in the answer (past the most drawn, no title, outside the regions): no dot.
    expect(places.spotDrawn('spot-2')).toBe(false);
  });

  it('draws no dot of a Power Spot where a battle stands in its place', async () => {
    const { places } = await shownWith(
      hooks({ occupied: (layer) => new Set(layer === 'spots' ? ['spot-1'] : []) }),
    );
    expect(places.spotDrawn('spot-1')).toBe(false);
  });
});
