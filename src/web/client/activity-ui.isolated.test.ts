import type * as L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityPlaceView, ActivityView } from '../../domain/web/activity-data.js';
import type { TrainMonthView, TrainRouteView } from '../../domain/web/train-history-data.js';
import { showActivity } from './activity-ui.js';
import { LayerRegistry, MAP_LAYERS } from './layer-registry.js';
import { RequestError } from './request-error.js';

/**
 * The activity layer's wiring (`showActivity`, plan 8H-4H, review 8H4H-8) over a Leaflet of fakes:
 * the glow's places as `HeatLayer` is given them, the invisible circles on their group with their
 * popups, the panel's elements and their events, and the server's answers, each held until the test
 * gives it. Isolated: mocked modules need a module graph of their own.
 */
const fake = vi.hoisted(() => {
  type Listener = (event?: unknown) => void;
  /** An element of the page: what the layer sets on it, its children, its listeners. */
  class PageElement {
    className = '';
    textContent: string | null = '';
    hidden = false;
    value = '';
    open = false;
    type = '';
    disabled = false;
    readonly dataset: Record<string, string> = {};
    readonly attributes: Record<string, string> = {};
    readonly children: PageElement[] = [];
    readonly listeners = new Map<string, Listener[]>();
    constructor(readonly tag: string) {}
    append(...children: PageElement[]) {
      this.children.push(...children);
    }
    replaceChildren(...children: PageElement[]) {
      this.children.splice(0, this.children.length, ...children);
    }
    /** Every element under it, itself first. */
    all(): PageElement[] {
      return [this, ...this.children.flatMap((child) => child.all())];
    }
    /** Its text and its children's, as a page would show it. */
    text(): string {
      return [this.textContent ?? '', ...this.children.map((child) => child.text())]
        .join(' ')
        .trim();
    }
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    }
    addEventListener(type: string, listener: Listener) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    /** Whether `node` is it or under it. */
    contains(node: unknown) {
      return node instanceof PageElement && this.all().includes(node);
    }
    /** Itself where it matches `[data-layer="…"]`, the one selector the layer asks (no parents). */
    closest(selector: string) {
      const layer = /^\[data-layer="(.+)"\]$/.exec(selector)?.[1];
      return layer !== undefined && this.dataset.layer === layer ? this : null;
    }
    /** The page's event on it, with what else the event carries (`relatedTarget`). */
    fire(type: string, more: Record<string, unknown> = {}) {
      for (const listener of this.listeners.get(type) ?? []) listener({ target: this, ...more });
    }
  }
  /** A circle on the circles' canvas: where, how large, its popup's words while open. */
  class Circle {
    radius = 0;
    content: (() => PageElement) | undefined;
    open = false;
    shown: string | null | undefined;
    group: Group | undefined;
    constructor(public at: [number, number]) {}
    addTo(group: Group) {
      group.layers.add(this);
      this.group = group;
      return this;
    }
    bindPopup(content: () => PageElement) {
      this.content = content;
      return this;
    }
    setRadius(radius: number) {
      this.radius = radius;
      return this;
    }
    setLatLng(at: [number, number]) {
      this.at = at;
      return this;
    }
    /** A tap on it: its popup opens, its content read. */
    openPopup() {
      this.open = true;
      this.shown = this.content?.().textContent;
      return this;
    }
    closePopup() {
      this.open = false;
      return this;
    }
    isPopupOpen() {
      return this.open;
    }
    getPopup() {
      return {
        update: () => {
          if (this.open) this.shown = this.content?.().textContent;
        },
      };
    }
  }
  /** A line drawn: its points and how. */
  class Line {
    group: Group | undefined;
    constructor(
      readonly points: Array<{ lat: number; lng: number }>,
      readonly options: Record<string, unknown>,
    ) {}
    addTo(group: Group) {
      group.layers.add(this);
      this.group = group;
      return this;
    }
  }
  class Group {
    readonly layers = new Set<unknown>();
    onMap = false;
    constructor(layers: unknown[] = []) {
      for (const layer of layers) this.layers.add(layer);
    }
    clearLayers() {
      for (const layer of this.layers) {
        if (layer instanceof Circle || layer instanceof Line) layer.group = undefined;
      }
      this.layers.clear();
      return this;
    }
    addTo() {
      this.onMap = true;
      return this;
    }
    remove() {
      this.onMap = false;
      return this;
    }
    removeLayer(layer: unknown) {
      this.layers.delete(layer);
      if (layer instanceof Circle) layer.group = undefined;
      return this;
    }
  }
  /** The glow: the places it was last given. */
  const heat = { places: [] as unknown[] };
  /** The questions asked of the server, each answered (or failed) when the test says. */
  const asked: Array<{
    url: string;
    answer: (view: unknown) => void;
    fail: (err?: Error) => void;
  }> = [];
  /** Every element the layer made, in order. */
  const elements: PageElement[] = [];
  /** Every circle made. */
  const circles: Circle[] = [];
  /** Every line drawn. */
  const lines: Line[] = [];
  /** The listeners of the page itself (`document`). */
  const pageListeners: Array<{ type: string; listener: (event: unknown) => void }> = [];
  return { PageElement, Circle, Line, Group, heat, asked, elements, circles, lines, pageListeners };
});

vi.mock('leaflet', () => ({
  canvas: () => ({}),
  layerGroup: (layers?: unknown[]) => new fake.Group(layers),
  latLng: (lat: number, lng: number) => ({ lat, lng }),
  latLngBounds: (points: unknown[]) => ({ points }),
  polyline: (points: Array<{ lat: number; lng: number }>, options: Record<string, unknown>) => {
    const line = new fake.Line(points, options);
    fake.lines.push(line);
    return line;
  },
  circleMarker: (at: [number, number]) => {
    const circle = new fake.Circle(at);
    fake.circles.push(circle);
    return circle;
  },
  Control: class {
    onAdd: (() => unknown) | undefined;
    addTo() {
      this.onAdd?.();
      return this;
    }
  },
  DomEvent: {
    disableClickPropagation: () => undefined,
    disableScrollPropagation: () => undefined,
  },
}));
vi.mock('./heat-layer.js', () => ({
  HeatLayer: class {
    setPlaces(places: unknown[]) {
      fake.heat.places = places;
    }
    setStops() {
      return undefined;
    }
  },
}));
vi.mock('./theme.js', () => ({
  theme: () => ({
    heat: [],
    colours: { train: 'teal' },
    opacities: { trainDone: 0.35, trainAhead: 0.8 },
  }),
  onThemeChange: () => undefined,
}));
vi.mock('./common.js', () => ({
  getJson: (url: string) =>
    new Promise((resolve, reject) => {
      fake.asked.push({
        url,
        answer: resolve,
        fail: (err?: Error) => {
          reject(err ?? new Error('the activity failed'));
        },
      });
    }),
}));

type PageElement = InstanceType<typeof fake.PageElement>;

/** A place of an answer, at street level in the view. */
const at = (kind: ActivityPlaceView['kind'], id: string, parties: number): ActivityPlaceView => ({
  kind,
  id,
  lat: 40.44,
  lon: -79.95,
  weight: 0.5,
  parties,
});

/** An answer of the server: Expected now on a Thursday unless told otherwise. */
const answer = (more: Partial<ActivityView> = {}): ActivityView => ({
  mode: 'now',
  weekday: 4,
  places: [],
  leftOut: 0,
  months: { first: '2019-01', last: '2019-12' },
  changesInMs: 60_000,
  ...more,
});

beforeEach(() => {
  fake.heat.places = [];
  fake.lines.splice(0);
  fake.pageListeners.splice(0);
  fake.asked.splice(0);
  fake.elements.splice(0);
  fake.circles.splice(0);
  // The page's clock on a day of the fixtures (`todayStep`).
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 15, 16));
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      const made = new fake.PageElement(tag);
      fake.elements.push(made);
      return made;
    },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      fake.pageListeners.push({ type, listener });
    },
  });
  vi.stubGlobal('window', { setTimeout: () => 1, clearTimeout: () => undefined });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * The layer over a map at street zoom whose open popups hold `lines`, the Activity layer off
 * until `turn(true)`; `counted()` resolves at the next time the layer says its counts changed.
 */
function shown(
  more: {
    picking?: () => boolean;
    drawn?: (kind: string, id: string) => boolean;
    entry?: { train: number; taken: () => void };
  } = {},
) {
  const registry = new LayerRegistry(undefined);
  for (const layer of MAP_LAYERS) registry.register(layer);
  /** The lines of the popups open now. */
  const lines: PageElement[] = [];
  const handlers = new Map<string, Array<() => void>>();
  const box = {
    getSouth: () => 40.4,
    getWest: () => -80,
    getNorth: () => 40.5,
    getEast: () => -79.9,
  };
  const map = {
    createPane: () => ({ style: {} }),
    on: (type: string, handler: () => void) => {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
      return map;
    },
    getZoom: () => 17,
    getBounds: () => ({ ...box, contains: () => true, pad: () => box }),
    getContainer: () => ({ querySelectorAll: () => lines }),
    getSize: () => ({ x: 1000, y: 800 }),
    fitBounds: (bounds: unknown, options: unknown) => {
      fitted.push({ bounds, options });
      return map;
    },
  };
  /** Where the map was moved to show a train whole. */
  const fitted: { bounds: unknown; options: unknown }[] = [];
  const layer = showActivity(
    map as unknown as L.Map,
    '100000000000000001',
    registry,
    more.picking,
    more.drawn,
    more.entry,
  );
  let told: () => void = () => undefined;
  let tells = 0;
  layer.onCounts(() => {
    tells += 1;
    told();
  });
  /** Resolves once the layer next says its counts changed. */
  const counted = () =>
    new Promise<void>((resolve) => {
      told = resolve;
    });
  const turn = (on: boolean) => {
    registry.set('activity', on);
  };
  /** A popup's line opened now. */
  const opened = (kind: 'gym' | 'spot', id: string) => {
    const line = layer.line(kind, id) as unknown as PageElement;
    lines.push(line);
    return line;
  };
  /** The circles on the map now, by where their places are. */
  const standing = () => fake.circles.filter((circle) => circle.group !== undefined);
  /** Leaflet fires an event on the map. */
  const fire = (type: string) => {
    for (const handler of handlers.get(type) ?? []) handler();
  };
  const element = (className: string) => {
    const found = fake.elements.find((made) => made.className === className);
    if (!found) throw new Error(`no element .${className}`);
    return found;
  };
  /** The panel's menu of modes: the first menu made. */
  const modeMenu = () => {
    const found = fake.elements.find((made) => made.tag === 'select');
    if (!found) throw new Error('no menu of modes');
    return found;
  };
  return {
    layer,
    turn,
    counted,
    tells: () => tells,
    opened,
    standing,
    fire,
    element,
    modeMenu,
    fitted,
  };
}

/** A month's trains as the server lists them. */
const monthOfTrains = (ids: number[]): TrainMonthView => ({
  month: '2019-12',
  trains: ids.map((id) => ({
    id,
    name: `Train ${String(id)}`,
    when: 'Sat, Dec 14, 6:00 PM',
    about: 'About 2 stops · 3 riders',
  })),
  more: 0,
});

/** A train's line and card as the server gives them. */
const trainRoute = (id: number): TrainRouteView => ({
  ...(monthOfTrains([id]).trains[0] as TrainRouteView),
  month: '2019-12',
  points: [
    { lat: 40.45, lon: -79.95 },
    { lat: 40.46, lon: -79.94 },
  ],
  route: [0, 1],
  card: [
    { text: 'How the train went', small: false },
    { text: 'About 2 stops in 40 min', small: false },
  ],
});

describe('History’s trains on the map (plan 8H-7B)', () => {
  /** The layer on in History by month, its answer of December 2019 drawn. */
  async function inHistory() {
    const made = shown();
    made.turn(true);
    const now = made.counted();
    fake.asked[0]?.answer(answer());
    await now;
    const menu = made.modeMenu();
    menu.value = 'history';
    menu.fire('change');
    // The month's trains are asked once its answer was drawn, not before.
    expect(fake.asked).toHaveLength(2);
    const december = made.counted();
    fake.asked[1]?.answer(answer({ mode: 'history', weekday: null, changesInMs: null }));
    await december;
    return made;
  }
  /** The buttons of the trains listed. */
  const pressesOf = (part: PageElement) =>
    part.all().filter((one) => one.className === 'activity-train');

  it('lists the month’s trains, and draws one chosen as a still line with its card', async () => {
    const { element, layer, fitted } = await inHistory();
    expect(fake.asked[2]?.url).toBe('/s/100000000000000001/api/history/trains?month=2019-12');
    fake.asked[2]?.answer(monthOfTrains([3, 2]));
    await layer.trainsIdle();
    const part = element('activity-trains');
    expect(part.hidden).toBe(false);
    expect(part.text()).toContain('Trains in December 2019 (2)');
    expect(pressesOf(part).map((press) => press.attributes['aria-pressed'])).toEqual([
      'false',
      'false',
    ]);
    // The panel 300 pixels wide, over the map's right side.
    (element('activity-panel') as unknown as { offsetWidth: number }).offsetWidth = 300;
    pressesOf(part)[1]?.fire('click');
    expect(fake.asked[3]?.url).toBe('/s/100000000000000001/api/history/trains/2');
    fake.asked[3]?.answer(trainRoute(2));
    await layer.trainsIdle();
    // Its colour, nothing to tap.
    expect(fake.lines).toHaveLength(1);
    expect(fake.lines[0]?.options).toMatchObject({
      color: 'teal',
      // A live line's opacity, not the faint done legs' (review B8).
      opacity: 0.8,
      interactive: false,
    });
    expect(fake.lines[0]?.points).toEqual([
      { lat: 40.45, lng: -79.95 },
      { lat: 40.46, lng: -79.94 },
    ]);
    // Fitted beside the panel, which covers the right side (review B3).
    expect(fitted).toHaveLength(1);
    expect(fitted[0]?.options).toMatchObject({
      paddingTopLeft: [24, 24],
      paddingBottomRight: [324, 24],
    });
    expect(pressesOf(element('activity-trains'))[1]?.attributes['aria-pressed']).toBe('true');
    expect(element('activity-trains').text()).toContain('About 2 stops in 40 min');
    // Chosen again: cleared.
    pressesOf(element('activity-trains'))[1]?.fire('click');
    expect(fake.lines[0]?.group).toBeUndefined();
    expect(element('activity-trains').text()).not.toContain('About 2 stops in 40 min');
  });

  it('opens History at the month of the train the address names, with it chosen (G4)', async () => {
    let taken = 0;
    const { element, layer, counted, modeMenu } = shown({
      entry: {
        train: 2,
        taken: () => {
          taken += 1;
        },
      },
    });
    // The train first: the page does not know its month.
    expect(fake.asked.map((one) => one.url)).toEqual([
      '/s/100000000000000001/api/history/trains/2',
    ]);
    fake.asked[0]?.answer(trainRoute(2));
    await layer.trainsIdle();
    expect(taken).toBe(1);
    // The layer turned on in History at that month.
    expect(modeMenu().value).toBe('history');
    expect(fake.asked[1]?.url).toBe(
      '/s/100000000000000001/api/activity?mode=history&month=2019-12',
    );
    const december = counted();
    fake.asked[1]?.answer(answer({ mode: 'history', weekday: null, changesInMs: null }));
    await december;
    fake.asked[2]?.answer(monthOfTrains([3, 2]));
    await layer.trainsIdle();
    expect(fake.lines).toHaveLength(1);
    expect(fake.lines[0]?.group).toBeDefined();
    const part = element('activity-trains');
    expect(pressesOf(part).map((press) => press.attributes['aria-pressed'])).toEqual([
      'false',
      'true',
    ]);
    expect(part.text()).toContain('About 2 stops in 40 min');
  });

  it('leaves History as the member made it while the address’s train was on its way (B6)', async () => {
    let taken = 0;
    const { layer, turn, modeMenu, counted } = shown({
      entry: {
        train: 2,
        taken: () => {
          taken += 1;
        },
      },
    });
    turn(true);
    // The member changes the mode before any answer came (review R1: the change, not the heat's
    // answer, takes the address's train's place).
    const menu = modeMenu();
    menu.value = 'evenings';
    menu.fire('change');
    const evenings = counted();
    fake.asked[2]?.answer(answer({ mode: 'evenings', weekday: null, changesInMs: null }));
    await evenings;
    fake.asked[0]?.answer({ ...trainRoute(2), month: '2019-06' });
    await layer.trainsIdle();
    expect(taken).toBe(1);
    expect(menu.value).toBe('evenings');
    expect(fake.asked.some((one) => one.url.includes('month=2019-06'))).toBe(false);
    expect(fake.lines).toEqual([]);
  });

  it('draws the address’s train whose answer came after the heat’s, at its month (R1)', async () => {
    const { layer, turn, modeMenu, counted } = shown({
      entry: { train: 2, taken: () => undefined },
    });
    turn(true);
    const now = counted();
    fake.asked[1]?.answer(answer());
    await now;
    fake.asked[0]?.answer({ ...trainRoute(2), month: '2019-06' });
    await layer.trainsIdle();
    expect(modeMenu().value).toBe('history');
    expect(fake.asked.at(-1)?.url).toBe(
      '/s/100000000000000001/api/activity?mode=history&month=2019-06',
    );
    expect(fake.lines).toHaveLength(1);
    expect(fake.lines[0]?.group).toBeDefined();
  });

  it('opens at a train’s month outside the slider’s, the slider at its nearest end (B6)', async () => {
    const { layer, counted, element } = shown({ entry: { train: 2, taken: () => undefined } });
    fake.asked[0]?.answer({ ...trainRoute(2), month: '2020-03' });
    await layer.trainsIdle();
    expect(fake.asked[1]?.url).toContain('month=2020-03');
    const march = counted();
    fake.asked[1]?.answer(answer({ mode: 'history', weekday: null, changesInMs: null }));
    await march;
    expect(element('activity-slider').value).toBe('11');
    expect(element('activity-step').textContent).toBe('March 2020');
  });

  it('says once that the train of the address cannot be shown', async () => {
    const { element, layer, counted } = shown({ entry: { train: 2, taken: () => undefined } });
    fake.asked[0]?.fail(new RequestError(404, 'Not found.'));
    await layer.trainsIdle();
    // History opens all the same, on this month.
    const shownMonth = counted();
    expect(fake.asked[1]?.url).toContain('month=2026-10');
    fake.asked[1]?.answer(
      answer({
        mode: 'history',
        weekday: null,
        changesInMs: null,
        months: { first: '2026-01', last: '2026-10' },
      }),
    );
    await shownMonth;
    expect(element('activity-trains-note').textContent).toBe('This train cannot be shown.');
  });

  it('hides the trains during Play and clears the one chosen, and when turned off (G8)', async () => {
    const { element, layer, turn } = await inHistory();
    fake.asked[2]?.answer(monthOfTrains([2]));
    await layer.trainsIdle();
    pressesOf(element('activity-trains'))[0]?.fire('click');
    fake.asked[3]?.answer(trainRoute(2));
    await layer.trainsIdle();
    expect(fake.lines[0]?.group).toBeDefined();
    element('press activity-play').fire('click');
    expect(element('activity-trains').hidden).toBe(true);
    expect(fake.lines[0]?.group).toBeUndefined();
    // Stop: the trains of the month Play got to, January (review B5: on its Stop).
    element('press activity-play').fire('click');
    expect(element('activity-trains').hidden).toBe(false);
    expect(fake.asked.at(-1)?.url).toBe('/s/100000000000000001/api/history/trains?month=2019-01');
    fake.asked.at(-1)?.answer(monthOfTrains([2]));
    await layer.trainsIdle();
    expect(pressesOf(element('activity-trains'))).toHaveLength(1);
    // A train chosen again, then the layer turned off: nothing of it stays.
    pressesOf(element('activity-trains'))[0]?.fire('click');
    fake.asked.at(-1)?.answer(trainRoute(2));
    await layer.trainsIdle();
    expect(fake.lines.at(-1)?.group).toBeDefined();
    turn(false);
    expect(element('activity-trains').hidden).toBe(true);
    expect(fake.lines.at(-1)?.group).toBeUndefined();
  });

  it('shows the trains again when Play is stopped by a press elsewhere on the page (R2)', async () => {
    const { element, layer } = await inHistory();
    fake.asked[2]?.answer(monthOfTrains([2]));
    await layer.trainsIdle();
    element('press activity-play').fire('click');
    expect(element('activity-trains').hidden).toBe(true);
    // A press on the map: Play stops, and its month's trains are asked.
    vi.stubGlobal('Node', class {});
    for (const { type, listener } of fake.pageListeners) {
      if (type === 'pointerdown') listener({ target: {} });
    }
    expect(element('activity-trains').hidden).toBe(false);
    expect(fake.asked.at(-1)?.url).toBe('/s/100000000000000001/api/history/trains?month=2019-01');
  });

  describe('Play stopped by a press on what changes History (W2)', () => {
    /** The layer in History, its list answered, Play on; a press of the page's on `target`. */
    async function playing() {
      const made = await inHistory();
      fake.asked[2]?.answer(monthOfTrains([2]));
      await made.layer.trainsIdle();
      made.element('press activity-play').fire('click');
      vi.stubGlobal('Node', fake.PageElement);
      vi.stubGlobal('Element', fake.PageElement);
      const press = (target: PageElement) => {
        for (const { type, listener } of fake.pageListeners) {
          if (type === 'pointerdown') listener({ target });
        }
      };
      return { ...made, press };
    }
    const monthsAsked = () => fake.asked.filter((one) => one.url.includes('/trains?month='));

    it('asks no trains between a press on the mode menu and its change', async () => {
      const { modeMenu, press } = await playing();
      const menu = modeMenu();
      press(menu);
      menu.value = 'now';
      menu.fire('change');
      expect(monthsAsked()).toHaveLength(1);
    });

    it('asks no trains between a press on the layer’s toggle and the layer off', async () => {
      const { press, turn, element } = await playing();
      const toggle = new fake.PageElement('input');
      toggle.dataset.layer = 'activity';
      press(toggle);
      turn(false);
      expect(monthsAsked()).toHaveLength(1);
      expect(element('activity-trains').hidden).toBe(true);
    });

    it('shows the month’s trains once focus leaves a control pressed without a change', async () => {
      const { element, press } = await playing();
      const slider = element('activity-slider');
      press(slider);
      expect(monthsAsked()).toHaveLength(1);
      // Focus from the slider to the menu: still within what changes History.
      element('activity-panel').fire('focusout', { relatedTarget: element('activity-span') });
      expect(monthsAsked()).toHaveLength(1);
      element('activity-panel').fire('focusout', { relatedTarget: null });
      expect(element('activity-trains').hidden).toBe(false);
      expect(monthsAsked().at(-1)?.url).toBe(
        '/s/100000000000000001/api/history/trains?month=2019-01',
      );
    });
  });

  it('says a refusal in one live line that stays through each drawing (R3)', async () => {
    const { element, layer } = await inHistory();
    fake.asked[2]?.answer(monthOfTrains([3, 2]));
    await layer.trainsIdle();
    pressesOf(element('activity-trains'))[1]?.fire('click');
    fake.asked[3]?.fail(new RequestError(404, 'Not found.'));
    await layer.trainsIdle();
    const note = element('activity-trains-note');
    expect(note.attributes.role).toBe('status');
    expect(note.textContent).toBe('This train cannot be shown.');
    // Drawn anew (another train pressed): the same line, its words gone.
    pressesOf(element('activity-trains'))[0]?.fire('click');
    expect(fake.elements.filter((one) => one.className === 'activity-trains-note')).toEqual([note]);
    expect(note.hidden).toBe(true);
  });

  it('leaves the live line’s words alone when a drawing says the same (W3)', async () => {
    const { element, layer } = await inHistory();
    fake.asked[2]?.answer(monthOfTrains([3, 2]));
    await layer.trainsIdle();
    pressesOf(element('activity-trains'))[1]?.fire('click');
    fake.asked[3]?.fail(new RequestError(404, 'Not found.'));
    await layer.trainsIdle();
    const note = element('activity-trains-note');
    let words = note.textContent;
    let said = 0;
    Object.defineProperty(note, 'textContent', {
      get: () => words,
      set: (next: string | null) => {
        said += 1;
        words = next;
      },
    });
    // The slider let go: the part drawn anew, the refusal still its line.
    const slider = element('activity-slider');
    slider.value = '5';
    slider.fire('input');
    slider.fire('change');
    expect(note.textContent).toBe('This train cannot be shown.');
    expect(said).toBe(0);
  });

  it('marks the list of the month left busy, its trains not to be pressed, until the next (R5)', async () => {
    const { element, layer } = await inHistory();
    fake.asked[2]?.answer(monthOfTrains([2]));
    await layer.trainsIdle();
    const slider = element('activity-slider');
    slider.value = '5';
    slider.fire('input');
    slider.fire('change');
    const list = element('activity-trains')
      .all()
      .find((one) => one.className === 'activity-trains-list');
    expect(list?.attributes['aria-busy']).toBe('true');
    expect(pressesOf(element('activity-trains')).map((press) => press.disabled)).toEqual([true]);
  });

  it('drops the train chosen at the slider’s change, before the month’s answer (B10)', async () => {
    const { element, layer } = await inHistory();
    fake.asked[2]?.answer(monthOfTrains([2]));
    await layer.trainsIdle();
    pressesOf(element('activity-trains'))[0]?.fire('click');
    fake.asked[3]?.answer(trainRoute(2));
    await layer.trainsIdle();
    expect(fake.lines[0]?.group).toBeDefined();
    const slider = element('activity-slider');
    slider.value = '5';
    slider.fire('input');
    slider.fire('change');
    expect(fake.asked.at(-1)?.url).toContain('month=2019-06');
    expect(fake.lines[0]?.group).toBeUndefined();
  });
});

describe('the activity layer on the map (showActivity, review 8H4H-8)', () => {
  it('fills the popups’ lines with each answer drawn, and hides them when it is turned off', async () => {
    const { turn, counted, opened } = shown();
    const line = opened('gym', '7');
    expect(line.hidden).toBe(true);
    turn(true);
    const drawn = counted();
    fake.asked[0]?.answer(answer({ places: [at('gym', '7', 12)] }));
    await drawn;
    expect(line.hidden).toBe(false);
    expect(line.textContent).toBe(
      'Activity: 12 raids and max battles at this time of day on Thursdays, over the years',
    );
    turn(false);
    expect(line.hidden).toBe(true);
    expect(line.textContent).toBe('');
  });

  it('tells who listens after each answer drawn and when it is turned off', async () => {
    const { turn, counted, tells, layer } = shown();
    turn(true);
    const drawn = counted();
    fake.asked[0]?.answer(answer({ places: [at('gym', '7', 12)] }));
    await drawn;
    expect(tells()).toBe(1);
    expect(layer.active()).toBe(true);
    turn(false);
    expect(tells()).toBe(2);
    expect(layer.active()).toBe(false);
  });

  it('clears the glow, the circles and the counts when turned off, and drops an answer that comes late', async () => {
    const { turn, counted, standing, layer } = shown();
    turn(true);
    const first = counted();
    fake.asked[0]?.answer(answer({ places: [at('gym', '7', 12), at('spot', 'abc.16', 4)] }));
    await first;
    expect(fake.heat.places).toHaveLength(2);
    expect(standing()).toHaveLength(2);
    expect(layer.area(['7'])?.shown).toBe('≈ 12 raids and max battles in this area');
    turn(false);
    expect(fake.heat.places).toEqual([]);
    expect(standing()).toEqual([]);
    expect(layer.area(['7'])).toBeUndefined();
    // On again; off and on before the answer comes: the first answer is never drawn.
    turn(true);
    turn(false);
    turn(true);
    expect(fake.asked).toHaveLength(3);
    const later = counted();
    fake.asked[1]?.answer(answer({ places: [at('gym', '7', 12)] }));
    fake.asked[2]?.answer(answer({ places: [at('gym', '8', 5)] }));
    await later;
    expect(layer.area(['7'])).toBeUndefined();
    expect(layer.area(['8'])?.shown).toBe('≈ 5 raids and max battles in this area');
    expect(standing()).toHaveLength(1);
  });

  it('draws no circle where the place’s own dot is drawn, nor any while a place is picked', async () => {
    const picking = { now: false };
    const { turn, counted, standing, layer } = shown({
      picking: () => picking.now,
      drawn: (kind, id) => kind === 'gym' && id === '7',
    });
    turn(true);
    const drawn = counted();
    fake.asked[0]?.answer(answer({ places: [at('gym', '7', 12), at('gym', '8', 5)] }));
    await drawn;
    expect(standing()).toHaveLength(1);
    picking.now = true;
    layer.refresh();
    expect(standing()).toEqual([]);
    picking.now = false;
    layer.refresh();
    expect(standing()).toHaveLength(1);
  });

  // Review 8H4H-4: the slider dragged while History's answer is on its way names another step.
  it('words the counts by the step its answer is of, not the step the slider was dragged to since', async () => {
    const { turn, counted, opened, modeMenu, element } = shown();
    const line = opened('gym', '7');
    turn(true);
    const now = counted();
    fake.asked[0]?.answer(answer());
    await now;
    const menu = modeMenu();
    menu.value = 'history';
    menu.fire('change');
    expect(fake.asked[1]?.url).toContain('month=2019-12');
    // Dragged to June, not let go yet: nothing is asked.
    const slider = element('activity-slider');
    slider.value = '5';
    slider.fire('input');
    expect(fake.asked).toHaveLength(2);
    const december = counted();
    fake.asked[1]?.answer(
      answer({ mode: 'history', weekday: null, changesInMs: null, places: [at('gym', '7', 4)] }),
    );
    await december;
    expect(line.textContent).toBe('Activity: 4 raids and max battles in December 2019');
  });

  // Review 8H4H-6: a double-click on the glow zooms the map, and the count its first click opened goes.
  it("closes a circle's count at the map's double-click", async () => {
    const { turn, counted, standing, fire } = shown();
    turn(true);
    const drawn = counted();
    fake.asked[0]?.answer(answer({ places: [at('gym', '8', 5)] }));
    await drawn;
    const [circle] = standing();
    circle?.openPopup();
    expect(circle?.shown).toBe(
      '5 raids and max battles at this time of day on Thursdays, over the years',
    );
    fire('dblclick');
    expect(circle?.open).toBe(false);
  });
});
