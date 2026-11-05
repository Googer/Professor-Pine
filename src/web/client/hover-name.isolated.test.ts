import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hoverName, type Named, type NamesMap } from './hover-name.js';

// Leaflet reads the browser's `window` as it loads: its tooltips are recorded here, each with what
// it was given and whether it is still open. The page's pointer listeners are kept to be fired.
// Isolated: a mocked module needs a module graph of its own.
const tips = vi.hoisted(() => {
  class Tip {
    at: unknown;
    content: { textContent: string | null } | undefined;
    open = false;
    constructor(readonly options: Record<string, unknown>) {}
    setLatLng(at: unknown) {
      this.at = at;
      return this;
    }
    setContent(content: { textContent: string | null }) {
      this.content = content;
      return this;
    }
    openOn() {
      this.open = true;
      return this;
    }
    remove() {
      this.open = false;
      return this;
    }
  }
  return { Tip, made: [] as Tip[] };
});
vi.mock('leaflet', () => ({
  tooltip: (options: Record<string, unknown>) => {
    const tip = new tips.Tip(options);
    tips.made.push(tip);
    return tip;
  },
}));

/** The page's pointer listeners (one set for the module: it watches the pointer once). */
const pointerListeners = new Map<string, Array<(event: { pointerType: string }) => void>>();
vi.stubGlobal('document', {
  createElement: () => ({ textContent: null }),
  addEventListener: (type: string, listener: (event: { pointerType: string }) => void) => {
    pointerListeners.set(type, [...(pointerListeners.get(type) ?? []), listener]);
  },
});
/** The pointer used: a finger's tap, a mouse moved. */
const pointer = (type: 'pointerdown' | 'pointermove', pointerType: string) => {
  for (const listener of pointerListeners.get(type) ?? []) listener({ pointerType });
};

/** A point as Leaflet's, which compares with `equals`. */
const point = (lat: number, lng: number) => ({
  lat,
  lng,
  equals: (other: { lat: number; lng: number }) => other.lat === lat && other.lng === lng,
});

/** Something with handlers by event, fired by `fire`. */
function handled() {
  const handlers = new Map<string, Array<(event: unknown) => void>>();
  const on = (type: string, handler: (event: unknown) => void) => {
    handlers.set(type, [...(handlers.get(type) ?? []), handler]);
  };
  const fire = (type: string, event: unknown = {}) => {
    for (const handler of handlers.get(type) ?? []) handler(event);
  };
  return { on, fire };
}

/** A dot at a place. */
function dot(lat = 40.44, lng = -79.95) {
  const { on, fire } = handled();
  const named = { on, getLatLng: () => point(lat, lng) };
  return { named: named as unknown as Named, fire };
}

/** A map whose popups open (`opened`, at a place) and close. */
function map() {
  const { on, fire } = handled();
  return {
    map: { on } as unknown as NamesMap,
    opened: (lat: number, lng: number) => {
      fire('popupopen', { popup: { getLatLng: () => point(lat, lng) } });
    },
    closed: () => {
      fire('popupclose');
    },
  };
}

/** The tooltips open now, by their words. */
const open = () => tips.made.filter((tip) => tip.open).map((tip) => tip.content?.textContent);

beforeEach(() => {
  tips.made.splice(0);
  pointer('pointermove', 'mouse');
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe('a place named on hover (Matt, 2026-11-02)', () => {
  it('shows the name over the dot while a mouse is on it, as text', () => {
    const { map: page } = map();
    const { named, fire } = dot();
    hoverName(page, named, 'Library <b>', () => true);
    fire('mouseover');
    expect(open()).toEqual(['Library <b>']);
    expect(tips.made[0]?.at).toMatchObject({ lat: 40.44, lng: -79.95 });
    fire('mouseout');
    expect(open()).toEqual([]);
  });

  it('shows nothing where the pointer does not hover (a touch device)', () => {
    const { map: page } = map();
    const { named, fire } = dot();
    hoverName(page, named, 'Library', () => false);
    fire('mouseover');
    expect(tips.made).toEqual([]);
  });

  // Review H2: a touch laptop's pointer hovers, but a finger's tap sends a mouseover too.
  it("shows nothing for a finger's tap on a device whose pointer hovers", () => {
    const { map: page } = map();
    const { named, fire } = dot();
    hoverName(page, named, 'Library', () => true);
    pointer('pointerdown', 'touch');
    fire('mouseover');
    expect(tips.made).toEqual([]);
    pointer('pointermove', 'mouse');
    fire('mouseover');
    expect(open()).toEqual(['Library']);
  });

  // Review H1: the dots' click handlers are taken off and set anew (`gymClicks`), and a stop's or
  // Power Spot's popup is the map's own: a press and any popup opening close the name.
  it('closes at a press, and when any popup opens', () => {
    const { map: page, opened } = map();
    const { named, fire } = dot();
    hoverName(page, named, 'Library', () => true);
    fire('mouseover');
    fire('mousedown');
    expect(open()).toEqual([]);
    fire('mouseout');
    fire('mouseover');
    opened(40.5, -79.9);
    expect(open()).toEqual([]);
  });

  it("shows nothing while the map's popup stands at the dot, and again once it closed", () => {
    const { map: page, opened, closed } = map();
    const library = dot();
    const fountain = dot(40.45, -79.94);
    hoverName(page, library.named, 'Library', () => true);
    hoverName(page, fountain.named, 'Fountain', () => true);
    opened(40.44, -79.95);
    library.fire('mouseover');
    expect(tips.made).toEqual([]);
    fountain.fire('mouseover');
    expect(open()).toEqual(['Fountain']);
    fountain.fire('mouseout');
    closed();
    library.fire('mouseover');
    expect(open()).toEqual(['Library']);
  });

  // Plan 8H-4H: a gym cluster's parties in the activity layer's mode, while it has any.
  it('reads words given as a function at each hover, and shows nothing while it gives none', () => {
    const { map: page } = map();
    const { named, fire } = dot();
    const words = { now: undefined as string | undefined };
    hoverName(
      page,
      named,
      () => words.now,
      () => true,
    );
    fire('mouseover');
    expect(tips.made).toEqual([]);
    fire('mouseout');
    words.now = '≈ 140 parties in this area';
    fire('mouseover');
    expect(open()).toEqual(['≈ 140 parties in this area']);
    fire('mouseout');
    words.now = '≈ 12 parties in this area';
    fire('mouseover');
    expect(open()).toEqual(['≈ 12 parties in this area']);
  });

  // Review P6: over a cluster's badge (34 pixels), not into it.
  it('stands over the dot by the offset given, six pixels up without one', () => {
    const { map: page } = map();
    const small = dot();
    const cluster = dot(40.45, -79.94);
    hoverName(page, small.named, 'Library', () => true);
    hoverName(page, cluster.named, '6 gyms', () => true, [0, -17]);
    small.fire('mouseover');
    small.fire('mouseout');
    cluster.fire('mouseover');
    expect(tips.made.map((tip) => tip.options.offset)).toEqual([
      [0, -6],
      [0, -17],
    ]);
  });

  it('closes when the dot is taken off the map, and shows one name at a time', () => {
    const { map: page } = map();
    const library = dot();
    const fountain = dot(40.45, -79.94);
    hoverName(page, library.named, 'Library', () => true);
    hoverName(page, fountain.named, 'Fountain', () => true);
    library.fire('mouseover');
    library.fire('mouseover');
    expect(tips.made).toHaveLength(1);
    fountain.fire('mouseover');
    expect(open()).toEqual(['Fountain']);
    fountain.fire('remove');
    expect(open()).toEqual([]);
  });
});
