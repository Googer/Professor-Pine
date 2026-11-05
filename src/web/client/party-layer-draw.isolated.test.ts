import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeoView } from '../../domain/web/geo-data.js';
import type {
  MapMax,
  MapMeetup,
  MapRaid,
  MapTrain,
  PartiesView,
} from '../../domain/web/party-data.js';
import type { ResearchOptionsView, StopReportsView } from '../../domain/web/stop-report-data.js';
import { LayerRegistry, LAYERS_KEY, MAP_LAYERS } from './layer-registry.js';
import type { MapSpot, MaxUiDeps } from './max-ui.js';
import { LIST_ASK_LIMIT_MS } from './live.js';
import { RING_PANE, showParties } from './party-layer.js';
import { FLOW_CYCLE_MS } from './train-flow.js';
import { MapActivity } from './parties.js';
import type { MapGym } from './popup.js';
import type { RaidUiDeps } from './raid-ui.js';
import type { RocketUiDeps } from './rocket-ui.js';
import type { LatLon } from './view.js';
import {
  CASE_NOW,
  caseGrunt,
  caseResearch,
  caseResearchOptions,
  caseStop,
  caseView,
} from './stop-report-cases.js';
import { RING_TAP_PANE, RING_TAP_PANE_Z, TRAIN_LINE_PANE, TRAIN_LINE_PANE_Z } from './panes.js';
import { BADGE_PANE, BADGE_PANE_Z } from './train-line.js';

/**
 * `showParties` drawing a list of parties (plan 8M-9A, review B1 and B9) on a map of fakes: just
 * enough of Leaflet (layers and groups that say whether they are on the map, markers whose popup
 * opens only there, as Leaflet's does), of the page (elements in a tree, clicks that bubble), and
 * the forms' hooks the party layer hands them (`raidUi`, `maxUi`), taken as they are made.
 * Isolated: mocked modules need a module graph of their own (testing.md).
 */

const fake = vi.hoisted(() => {
  type Handler = (event: unknown) => void;

  /** A Leaflet layer: its handlers, its group, its popup opened only on the map. */
  class Layer {
    readonly handlers = new Map<string, Handler[]>();
    group: Group | undefined;
    opened = 0;
    bound = false;
    constructor(
      readonly at: unknown,
      readonly options: Record<string, unknown> = {},
    ) {}
    on(type: string, handler: Handler) {
      for (const each of type.split(' ')) {
        this.handlers.set(each, [...(this.handlers.get(each) ?? []), handler]);
      }
      return this;
    }
    off(type: string) {
      this.handlers.delete(type);
      return this;
    }
    fire(type: string, event: unknown = {}) {
      for (const handler of this.handlers.get(type) ?? []) handler(event);
    }
    /** The popup's content as the page gave it (a function that draws it). */
    content: unknown;
    bindPopup(content?: unknown) {
      this.bound = true;
      this.content = content;
      return this;
    }
    getPopup() {
      return { getLatLng: () => this.openedAt ?? this.at };
    }
    /** Where its popup was opened last: where it was asked (a click on a line), else its place. */
    openedAt: unknown;
    /** The popup bound, the one Leaflet names in the map's events. */
    /** How many times its popup was drawn anew in place (a post that came, plan 8M-11B R1). */
    updates = 0;
    /** The popup's element while it is open, as the test's page draws it (`shown.page`). */
    popupElement: unknown;
    readonly popup = {
      getElement: () => this.popupElement,
      getLatLng: () => this.openedAt ?? this.at,
      options: { autoPan: true },
      // As Leaflet's: its content asked again (a form's while it holds, else drawn anew), and its
      // height let go to be measured, which brings a popup that scrolls back to its top.
      update: () => {
        this.updates += 1;
        shown.page?.redraw(this.popupElement, this.content);
        const content = (this.popupElement as PageElement | undefined)?.querySelector(
          '.leaflet-popup-content',
        );
        if (content) content.scrollTop = 0;
      },
    };
    /**
     * As Leaflet's: a layer that is not on the map opens no popup; the map is told first, then
     * the layer (`OpenPopup`), as when it closes.
     */
    openPopup(at?: unknown) {
      if (!this.bound || this.group?.onMap !== true) return this;
      shown.popupOf?.closePopup();
      this.opened += 1;
      this.openedAt = at;
      shown.popupOf = this;
      this.popupElement = shown.page?.open(this.content);
      shown.map?.fire('popupopen', { popup: this.popup });
      this.fire('popupopen');
      return this;
    }
    closePopup() {
      if (shown.popupOf !== this) return this;
      shown.popupOf = undefined;
      shown.page?.close(this.popupElement);
      this.popupElement = undefined;
      shown.map?.fire('popupclose', { popup: this.popup });
      this.fire('popupclose');
      return this;
    }
    /** Into a group, or onto the map itself (step 2's pin). */
    addTo(group: Group | object) {
      if (group instanceof Group || group instanceof FeatureGroup) group.add(this);
      return this;
    }
    remove() {
      return this;
    }
    setLatLng() {
      return this;
    }
    getLatLng() {
      const [lat, lng] = this.at as [number, number];
      return { lat, lng };
    }
    getElement(): unknown {
      return undefined;
    }
    setStyle() {
      return this;
    }
  }
  class Marker extends Layer {}
  /**
   * A feature group (a train's line, plan 8M-11B R1): a layer of its own, bound to a popup, that
   * holds the line's pieces.
   */
  class FeatureGroup extends Layer {
    layers: Layer[] = [];
    add(layer: Layer) {
      layer.group = this as unknown as Group;
      this.layers.push(layer);
    }
    getLayers() {
      return this.layers;
    }
  }
  class Path extends Layer {
    /** A line's path element, with the style the page sets on it (a train's flow, R1-3). */
    element: { style: Record<string, string> } | undefined;
    override getElement(): unknown {
      return this.element;
    }
  }
  class CircleMarker extends Path {}

  /** A layer group: its layers, and whether it is on the map. */
  class Group {
    layers: Layer[] = [];
    onMap = false;
    addTo() {
      this.onMap = true;
      return this;
    }
    remove() {
      this.onMap = false;
      return this;
    }
    clearLayers() {
      // As Leaflet's: a layer taken off the map closes the popup bound to it (`bindPopup`'s
      // `remove: this.closePopup`), which tells the map and the layer.
      for (const layer of this.layers) layer.closePopup();
      for (const layer of this.layers) layer.group = undefined;
      this.layers = [];
      return this;
    }
    eachLayer(run: (layer: Layer) => void) {
      for (const layer of this.layers) run(layer);
    }
    add(layer: Layer) {
      layer.group = this;
      this.layers.push(layer);
    }
  }

  /** Every marker made, and the popup open now. */
  const shown: {
    markers: Marker[];
    circles: CircleMarker[];
    /** The lines drawn (a train's, plan 8M-11B). */
    lines: Path[];
    popupOf: Layer | undefined;
    map: { fire(type: string, event: unknown): void } | undefined;
    /** Where a popup's content goes in the test's page: its `.leaflet-popup`, in the page. */
    page:
      | {
          open(content: unknown): unknown;
          redraw(element: unknown, content: unknown): void;
          close(element: unknown): void;
        }
      | undefined;
  } = { markers: [], circles: [], lines: [], popupOf: undefined, map: undefined, page: undefined };

  /** The phone card (plan 8M-8A) as the party layer uses it: which party it shows. */
  class Card {
    key: string | undefined;
    readonly height = 0;
    constructor(
      _document: unknown,
      private readonly hooks: { onClose?: () => void } = {},
    ) {
      card.made = this;
    }
    /** What it shows while open, as the party layer drew it. */
    drawn: unknown;
    open(key: string, content?: () => unknown) {
      // As the real card: another party in its place closes the first for the page.
      if (this.key !== undefined && this.key !== key) this.hooks.onClose?.();
      this.key = key;
      this.drawn = content?.();
    }
    content() {
      return this.key === undefined ? undefined : this.drawn;
    }
    /** As the real card: without content its party is gone, and it closes. */
    refresh(content?: unknown) {
      if (content === undefined) this.close();
    }
    close() {
      if (this.key === undefined) return;
      this.key = undefined;
      this.hooks.onClose?.();
    }
  }
  const card: { made: Card | undefined; wanted: boolean } = { made: undefined, wanted: false };

  /** The hooks the party layer hands the forms, as they are made. */
  const forms: { raid?: unknown; max?: unknown; rocket?: unknown } = {};

  /**
   * Route mode as the trains give it to the map (`spotClicked`): on or off, and the Power Spots
   * it took as stops.
   */
  const route = { on: false, taken: [] as unknown[], routed: undefined as string | undefined };

  /** The contents of the popups opened by themselves (the list of things at one place). */
  const placeList: unknown[] = [];

  /** Those who wait for the list of what is on to be drawn again without a new list. */
  const renders: Array<() => void> = [];

  /** The list of what is on as the party layer made it: whether it is told the parties are known. */
  const list: {
    partiesKnown?: (() => boolean) | undefined;
    /** The popup the party layer draws under a line the map does not open. */
    detail?: ((line: unknown) => unknown) | undefined;
    /** A line of the list tapped. */
    open?: ((line: unknown) => unknown) | undefined;
    /** The lines of the list drawn anew (a post that came), and who waits for the next. */
    redrawn: string[];
    waiting: Array<() => void>;
  } = { redrawn: [], waiting: [] };

  return {
    Layer,
    Marker,
    Path,
    CircleMarker,
    Group,
    FeatureGroup,
    shown,
    Card,
    card,
    forms,
    route,
    placeList,
    renders,
    list,
  };
});

vi.mock('leaflet', () => ({
  Marker: fake.Marker,
  Path: fake.Path,
  CircleMarker: fake.CircleMarker,
  marker: (at: [number, number], options: Record<string, unknown>) => {
    const made = new fake.Marker(at, options);
    fake.shown.markers.push(made);
    return made;
  },
  circleMarker: (at: [number, number], options: Record<string, unknown>) => {
    const made = new fake.CircleMarker(at, options);
    fake.shown.circles.push(made);
    return made;
  },
  polyline: (at: unknown, options: Record<string, unknown>) => {
    const made = new fake.Path(at, options);
    made.element = { style: {} };
    fake.shown.lines.push(made);
    return made;
  },
  divIcon: (options: Record<string, unknown>) => ({ options }),
  layerGroup: () => new fake.Group(),
  featureGroup: () => new fake.FeatureGroup(undefined),
  svg: (options: Record<string, unknown>) => ({ options }),
  latLng: (lat: number, lng: number) => ({ lat, lng }),
  popup: () => {
    const popup = {
      setLatLng: () => popup,
      // The list of the things at one place (plan 8M-7): kept, for a test to read.
      setContent: (content: unknown) => {
        fake.placeList.push(content);
        return popup;
      },
      openOn: () => popup,
      getElement: () => undefined,
    };
    return popup;
  },
  // The Report button's control over the map (plan 8M-9A), added and never drawn here.
  Control: class {
    addTo() {
      return this;
    }
  },
  DomEvent: {
    stop: () => undefined,
    stopPropagation: () => undefined,
    disableClickPropagation: () => undefined,
  },
}));

// The colors and sizes as a stylesheet without the theme gives them (no page to read).
vi.mock('./theme.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./theme.js')>();
  return { ...real, theme: () => real.readTheme(() => ''), onThemeChange: () => undefined };
});

// The list of what is on draws nothing here: its own tests are `list-ui.test.ts`.
vi.mock('./list-ui.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./list-ui.js')>();
  return {
    ...real,
    WhatIsOn: class {
      sorted = 'soonest';
      constructor(deps: {
        partiesKnown?: () => boolean;
        detail?: (line: unknown) => unknown;
        open?: (line: unknown) => unknown;
      }) {
        fake.list.partiesKnown = deps.partiesKnown;
        fake.list.detail = deps.detail;
        fake.list.open = deps.open;
      }
      show() {}
      render() {
        for (const done of fake.renders.splice(0)) done();
      }
      redrawLine(key: string) {
        fake.list.redrawn.push(key);
        for (const done of fake.list.waiting.splice(0)) done();
      }
    },
  };
});

vi.mock('./phone-card.js', () => ({
  PhoneCard: fake.Card,
  cardWanted: () => fake.card.wanted,
}));

vi.mock('./raid-ui.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./raid-ui.js')>();
  return {
    ...real,
    raidUi: (deps: RaidUiDeps) => {
      fake.forms.raid = deps;
      return real.raidUi(deps);
    },
  };
});

// Route mode (a train's route edited) stands in by `fake.route`: its own tests are
// `train-ui.isolated.test.ts`.
vi.mock('./train-ui.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./train-ui.js')>();
  return {
    ...real,
    trainUi: (deps: Parameters<typeof real.trainUi>[0]) => ({
      ...real.trainUi(deps),
      // The train being routed, where a test names one.
      routing: () => (fake.route.routed === undefined ? undefined : { id: fake.route.routed }),
      spotClicked: (spot: { id: string; title: string }) => {
        if (!fake.route.on) return false;
        fake.route.taken.push(spot);
        return true;
      },
    }),
  };
});

vi.mock('./max-ui.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./max-ui.js')>();
  return {
    ...real,
    maxUi: (deps: MaxUiDeps) => {
      fake.forms.max = deps;
      return real.maxUi(deps);
    },
  };
});

vi.mock('./rocket-ui.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./rocket-ui.js')>();
  return {
    ...real,
    rocketUi: (deps: RocketUiDeps) => {
      fake.forms.rocket = deps;
      return real.rocketUi(deps);
    },
  };
});

type Listener = (event: { target: PageElement; stopPropagation(): void }) => void;

/** Just enough of an element: a tree of them, attributes, `data-` in `dataset`, bubbling clicks. */
class PageElement {
  className = '';
  textContent: string | null = '';
  /** How far it is scrolled, which only a page's own code sets here. */
  scrollTop = 0;
  hidden = false;
  disabled = false;
  type = '';
  /** A menu's choice, as a member or `GroupPicks` sets it. */
  value = '';
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  childNodes: PageElement[] = [];
  parent: PageElement | undefined;
  private readonly listeners = new Map<string, Listener[]>();
  readonly classList = {
    toggle: (name: string, on?: boolean) => {
      const names = new Set(this.className.split(' ').filter((one) => one !== ''));
      if (on ?? !names.has(name)) names.add(name);
      else names.delete(name);
      this.className = [...names].join(' ');
    },
    add: (name: string) => {
      this.classList.toggle(name, true);
    },
    remove: (name: string) => {
      this.classList.toggle(name, false);
    },
    contains: (name: string) => this.className.split(' ').includes(name),
  };

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/gu, (_all, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
    if (name === 'hidden') this.hidden = true;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  getAttributeNames(): string[] {
    return [...this.attributes.keys()];
  }

  get parentElement(): PageElement | null {
    return this.parent ?? null;
  }

  /** Whether it is in the page, under the document's body. */
  get isConnected(): boolean {
    return page.body?.contains(this) === true;
  }

  get firstChild(): PageElement | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): PageElement | null {
    return this.childNodes.at(-1) ?? null;
  }

  get firstElementChild(): PageElement | null {
    return this.firstChild;
  }

  get childElementCount(): number {
    return this.childNodes.length;
  }

  append(...children: PageElement[]): void {
    for (const child of children) {
      child.remove();
      child.parent = this;
      this.childNodes.push(child);
    }
  }

  replaceChildren(...children: PageElement[]): void {
    for (const child of [...this.childNodes]) child.remove();
    this.append(...children);
  }

  removeChild(child: PageElement): void {
    child.remove();
  }

  insertBefore(child: PageElement, before: PageElement | null): void {
    child.remove();
    child.parent = this;
    const at = before === null ? this.childNodes.length : this.childNodes.indexOf(before);
    this.childNodes.splice(at, 0, child);
  }

  remove(): void {
    if (!this.parent) return;
    if (this.contains(page.active)) page.active = null;
    this.parent.childNodes = this.parent.childNodes.filter((child) => child !== this);
    this.parent = undefined;
  }

  contains(other: unknown): boolean {
    for (let at = other as PageElement | undefined; at; at = at.parent) {
      if (at === this) return true;
    }
    return false;
  }

  /** Every element under this one, in order. */
  all(): PageElement[] {
    return this.childNodes.flatMap((child) => [child, ...child.all()]);
  }

  /** Whether this element is what a simple selector (`tag.class[data-x="y"]`, a list) names. */
  matches(selector: string): boolean {
    return selector.split(',').some((one) => {
      const simple = one.trim();
      const tag = /^[a-z]+/u.exec(simple)?.[0];
      if (tag !== undefined && tag !== this.tagName) return false;
      for (const [, name] of simple.matchAll(/\.([\w-]+)/gu)) {
        if (name === undefined || !this.classList.contains(name)) return false;
      }
      for (const [, name, value] of simple.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/gu)) {
        if (name === undefined || !this.attributes.has(name)) return false;
        if (value !== undefined && this.attributes.get(name) !== value) return false;
      }
      return true;
    });
  }

  querySelectorAll(selector: string): PageElement[] {
    return this.all().filter((element) => element.matches(selector));
  }

  /** A menu's choices. */
  get options(): Array<{ value: string }> {
    return this.childNodes.map((option) => ({ value: option.attributes.get('value') ?? '' }));
  }

  querySelector(selector: string): PageElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  closest(selector: string): PageElement | null {
    if (this.matches(selector)) return this;
    return this.parent?.closest(selector) ?? null;
  }

  focus(): void {
    page.active = this;
    page.focused?.(this);
  }

  /** A field's caret, which these tests do not follow. */
  setSelectionRange(): void {}

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  /** An event here, bubbling up the tree as it was when it began, until a listener stops it. */
  dispatch(type: string, more: { isComposing?: boolean } = {}): void {
    const path: PageElement[] = [this];
    for (let at = this.parent; at; at = at.parent) path.push(at);
    let stop = false;
    const event = {
      ...more,
      target: this,
      stopPropagation: () => {
        stop = true;
      },
    };
    for (const at of path) {
      for (const listener of at.listeners.get(type) ?? []) listener(event);
      if (stop) return;
    }
  }
}

/** The page: its elements by id, the focus, the document's own key listeners. */
const page: {
  body?: PageElement;
  byId: Map<string, PageElement>;
  active: PageElement | null;
  /** The document's own listeners, by event. */
  listeners: Map<string, Array<(event: unknown) => void>>;
  visibility: 'hidden' | 'visible';
  /** Told of each element the focus moves to. */
  focused?: ((element: PageElement) => void) | undefined;
} = { byId: new Map(), active: null, listeners: new Map(), visibility: 'hidden' };

const ZONE = 'America/New_York';

const gym = (id: number, name: string, lat: number, lon: number): MapGym => ({
  id,
  name,
  nickname: null,
  lat,
  lon,
  regionIds: [1],
  address: null,
  description: null,
  notice: null,
});

const GYMS = new Map([[1, gym(1, 'Library', 40.441, -79.95)]]);

/** Oakland, round the map's middle (40.44 N, 79.95 W). */
const REGIONS: GeoView['regions'] = [
  {
    id: 1,
    name: 'oakland',
    outline: [
      [40.43, -79.97],
      [40.46, -79.97],
      [40.46, -79.93],
      [40.43, -79.93],
      [40.43, -79.97],
    ],
  },
];

const attendance = (): MapRaid['attendance'] => ({
  groups: [{ id: 'A', interested: 0, coming: 2, present: 0 }],
  going: 2,
  mine: null,
  actions: [{ action: 'join' }],
  remote: { offered: true, on: false },
  count: true,
});

const raidAt = (gymId: number): MapRaid => ({
  kind: 'raid',
  postKey: null,
  id: `r${String(gymId)}`,
  gymId,
  picture: null,
  tier: 'Level 5 raid',
  tierGroup: '5',
  heading: 'Level 5 raid against Yveltal',
  boss: 'Yveltal',
  stage: 'hatched',
  hatchTime: null,
  endTime: Date.now() + 40 * 60_000,
  link: 'https://discord.com/channels/1/2/3',
  place: null,
  mayChange: false,
  attendance: attendance(),
});

/** A battle at Power Spot `spot-1` (Lake Gazebo), or with `spotId` null at a pin. */
const battle = (id: string, spotId: string | null, lat: number, lon: number): MapMax => ({
  kind: 'max',
  id,
  spotId,
  picture: null,
  level: 'D2',
  tier: 'Dynamax 2★',
  boss: 'Machamp',
  title: `Dynamax Machamp (2★) ${id}`,
  endTime: Date.now() + 40 * 60_000,
  link: 'https://discord.com/channels/1/2/4',
  place: { name: spotId === null ? 'Unlisted power spot' : 'Lake Gazebo', lat, lon, address: null },
  attendance: attendance(),
  postKey: null,
});

/**
 * The battle at the Power Spot and the one at a pin, made when called (review round 2, R3): their
 * ends by the clock of the test that asks, faked or not, never the one the file was loaded at.
 */
const spotBattle = (): MapMax => battle('x1', 'spot-1', 40.45, -79.94);
const pinBattle = (): MapMax => battle('x2', null, 40.46, -79.93);

const view = (more: Partial<PartiesView> = {}): PartiesView => ({
  zone: ZONE,
  readOnly: false,
  raids: [raidAt(1)],
  maxes: [spotBattle(), pinBattle()],
  trains: [],
  meetups: [],
  ...more,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** The element of the popup open now, in the page. */
const popupNow = (): PageElement | undefined =>
  fake.shown.popupOf?.popupElement as PageElement | undefined;

/** "Add stops…" pressed in the research form in the popup open now: the form moves to the pane. */
const addStopsInPopup = (): void => {
  popupNow()?.querySelector('button[data-add-stops="start"]')?.dispatch('click');
};

/** A place's controls (`gymControls`, `spotControls`) as a popup or the phone card has them. */
const placeShowing = (className: string, boxes: readonly unknown[]): PageElement => {
  const place = new PageElement('div');
  place.className = className;
  place.append(...(boxes as PageElement[]));
  page.body?.append(place);
  return place;
};

/**
 * `showParties` started for a member who may report, its layers as the browser kept them
 * (`raids`), the list the server gives (`parties`) drawn once it came; the map's handlers and the
 * parts the forms were handed.
 */
async function started(options: {
  raids: boolean;
  parties?: PartiesView;
  /** Your location, once the browser said. */
  located?: LatLon;
  regions?: GeoView['regions'];
  /** A phone's page: a party opens as the card. */
  phone?: boolean;
  /** The reports at stops `/api/stop-reports` gives (plan 8M-9B): drawn once they came. */
  stops?: StopReportsView;
  /** The layers as the browser kept them, beside `raids`. */
  layers?: Record<string, boolean>;
  /** `/api/parties` answers 503 (Discord cannot be asked just now): no parties are drawn. */
  partiesDown?: boolean;
  /** `/api/parties` answers only once the test lets it (`releaseParties`): the reports first. */
  partiesLate?: boolean;
  /** Which places the map shows (its bounds); every place without it. */
  inView?: (at: [number, number]) => boolean;
  /** The pick lists of a research report `/api/research-options` gives. */
  research?: ResearchOptionsView;
  /** A research report sent is never answered. */
  sendsForever?: boolean;
  /** The posts `…/post` answers, by party id (none without it: 404). */
  posts?: Record<string, unknown>;
  /** The map's zoom (16, where the PokéStops are drawn from, without it). */
  zoom?: number;
  /** Whether the live map is in use (plan 8M-10); the page's visibility alone without it. */
  activity?: MapActivity;
  /** What the browser keeps (the reports' filters, plan 8M-12 ruling R4); nothing without it. */
  storage?: Record<string, string>;
  /** The places `/api/find-places` finds (plan 8M-12); none without it. */
  found?: unknown[];
}) {
  page.byId = new Map();
  page.active = null;
  page.focused = undefined;
  page.listeners = new Map();
  page.visibility = 'hidden';
  fake.shown.markers = [];
  fake.shown.circles = [];
  fake.shown.lines = [];
  fake.shown.popupOf = undefined;
  fake.card.wanted = options.phone ?? false;
  fake.route.on = false;
  fake.route.taken = [];
  fake.route.routed = undefined;
  fake.placeList.splice(0);
  fake.list.redrawn = [];
  const body = new PageElement('body');
  page.body = body;
  /** A popup's content as Leaflet asks it: a function's answer, or the element itself. */
  const contentOf = (content: unknown): PageElement | undefined => {
    const drawn: unknown = typeof content === 'function' ? (content as () => unknown)() : content;
    return drawn instanceof PageElement ? drawn : undefined;
  };
  fake.shown.page = {
    open: (content) => {
      const frame = new PageElement('div');
      frame.className = 'leaflet-popup';
      const inner = new PageElement('div');
      inner.className = 'leaflet-popup-content';
      frame.append(inner);
      const drawn = contentOf(content);
      if (drawn) inner.append(drawn);
      body.append(frame);
      return frame;
    },
    redraw: (element, content) => {
      if (!(element instanceof PageElement)) return;
      // As Leaflet's: taken out and put back, also the same node, which loses the focus in it.
      const drawn = contentOf(content);
      if (drawn) element.querySelector('.leaflet-popup-content')?.replaceChildren(drawn);
    },
    close: (element) => {
      if (element instanceof PageElement) element.remove();
    },
  };
  vi.stubGlobal('HTMLElement', PageElement);
  vi.stubGlobal('HTMLButtonElement', PageElement);
  vi.stubGlobal('Element', PageElement);
  // No field of these tests is typed in (the research form's, plan 8M-9B).
  vi.stubGlobal('HTMLInputElement', class {});
  vi.stubGlobal('CSS', { escape: (text: string) => text });
  vi.stubGlobal('document', {
    createElement: (tag: string) => new PageElement(tag),
    // Pine's own icons (`drawShapes`), as SVG.
    createElementNS: (_space: string, tag: string) => new PageElement(tag),
    getElementById: (id: string) => {
      const found = page.byId.get(id) ?? new PageElement('div');
      page.byId.set(id, found);
      return found;
    },
    body,
    get activeElement() {
      return page.active;
    },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      page.listeners.set(type, [...(page.listeners.get(type) ?? []), listener]);
    },
    querySelector: (selector: string) => body.querySelector(selector),
    querySelectorAll: () => [],
    get visibilityState() {
      return page.visibility;
    },
  });
  /** The page's timers: none runs by itself, `runTimers` runs those of a delay. */
  const pageTimers = new Map<number, { run: () => void; ms: number }>();
  let timerIds = 0;
  vi.stubGlobal('window', {
    setTimeout: (run: () => void, ms: number) => {
      timerIds += 1;
      pageTimers.set(timerIds, { run, ms });
      return timerIds;
    },
    clearTimeout: (id: number) => {
      pageTimers.delete(id);
    },
    setInterval: () => 0,
    innerWidth: 1200,
    matchMedia: (query: string) => ({
      matches: fake.card.wanted && query.includes('max-width'),
    }),
  });
  vi.stubGlobal('location', { origin: 'https://pine.example' });
  let listed = JSON.stringify(options.parties ?? view());
  let stopsListed = options.stops;
  const asked: string[] = [];
  /** The questions asked with a time limit of their own. */
  const timeLimited: string[] = [];
  let releaseParties = (): void => undefined;
  const partiesLet = new Promise<void>((resolve) => {
    releaseParties = resolve;
  });
  /** The next question of `/api/parties` is answered only once this is let go (`holdParties`). */
  let partiesHeld: Promise<void> | undefined;
  vi.stubGlobal('fetch', (url: string, init?: { signal?: AbortSignal }) => {
    asked.push(url);
    if (init?.signal) timeLimited.push(url);
    const post = /\/api\/parties\/([^/]+)\/post\?/u.exec(url);
    const posted = post ? options.posts?.[post[1] ?? ''] : undefined;
    if (posted !== undefined) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(posted) });
    }
    if (url.endsWith('/api/parties')) {
      if (options.partiesDown === true) {
        return Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('') });
      }
      const answer = { ok: true, status: 200, text: () => Promise.resolve(listed) };
      const held = partiesHeld ?? (options.partiesLate === true ? partiesLet : undefined);
      partiesHeld = undefined;
      return held === undefined ? Promise.resolve(answer) : held.then(() => answer);
    }
    if (url.includes('/api/find-places?')) {
      const places = { places: options.found ?? [] };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(places) });
    }
    if (url.endsWith('/api/stop-reports') && stopsListed !== undefined) {
      const reports = JSON.stringify(stopsListed);
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(reports) });
    }
    if (url.endsWith('/api/research-options') && options.research !== undefined) {
      const lists = options.research;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(lists) });
    }
    // A report on its way, never answered.
    if (url.endsWith('/api/research') && options.sendsForever === true) {
      return new Promise(() => undefined);
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
  const handlers = new Map<string, Array<(event: unknown) => void>>();
  const container = new PageElement('div');
  /** Where the map was flown to. */
  const flights: Array<[number, number]> = [];
  /** The zoom of each flight. */
  const flightZooms: number[] = [];
  /** Pixels per degree on the screen: far apart unless a test zooms out (`zoomedTo`). */
  let scale = 10_000;
  /** The map's zoom, which `zoomedTo` may change. */
  let zoom = options.zoom ?? 16;
  const map = {
    on(type: string, handler: (event: unknown) => void) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
      return map;
    },
    once(type: string, handler: (event: unknown) => void) {
      return map.on(type, handler);
    },
    off: () => map,
    fire(type: string, event: unknown) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    },
    createPane: () => ({ style: {} }),
    getZoom: () => zoom,
    getSize: () => ({ x: 1200, y: 800 }),
    getBounds: () => ({
      contains: (at: [number, number] | { lat: number; lng: number }) =>
        options.inView?.(Array.isArray(at) ? at : [at.lat, at.lng]) ?? true,
      getSouth: () => 40.43,
      getWest: () => -79.97,
      getNorth: () => 40.46,
      getEast: () => -79.93,
    }),
    getCenter: () => ({ lat: 40.44, lng: -79.95 }),
    getContainer: () => container,
    // Far apart on the screen: no two things share a place.
    latLngToContainerPoint: (at: { lat: number; lng: number } | [number, number]) =>
      Array.isArray(at)
        ? { x: at[1] * scale, y: -at[0] * scale }
        : { x: at.lng * scale, y: -at.lat * scale },
    closePopup: () => {
      fake.shown.popupOf?.closePopup();
    },
    invalidateSize: () => undefined,
    panBy: () => undefined,
    flyTo: (at: [number, number], zoom: number) => {
      flights.push(at);
      flightZooms.push(zoom);
    },
  };
  fake.shown.map = map;
  const kept = {
    getItem: (key: string) =>
      key === LAYERS_KEY ? JSON.stringify({ ...options.layers, raids: options.raids }) : null,
    setItem: () => undefined,
  };
  const registry = new LayerRegistry(kept);
  for (const layer of MAP_LAYERS) registry.register(layer);
  /** Who hears of the PokéStops of the view (the places layer's `onStops`), told by the test. */
  const stopListeners: Array<(answer: readonly MapSpot[] | 'failed' | 'zoom') => void> = [];
  /** What Find told the frame (plan 8M-12): the list opened or closed, a pick, a gym opened. */
  let listWaiter: () => void = () => undefined;
  const frameTold: {
    finding: boolean[];
    picked: number;
    gyms: number[];
    box: string;
    /** How many times the gyms were told the box thins them or no longer does (M1). */
    boxChanged: number;
    /** How many times the box was emptied (M2). */
    cleared: number;
    /** The lists told as drawn, by whether they were read-only (plan 8M-17). */
    listsDrawn: boolean[];
    /** The Power Spots whose address a popup asked for, with the popup (design 2026-11-04). */
    addressed: Array<{ id: string | null | undefined; popup: unknown }>;
  } = {
    listsDrawn: [],
    addressed: [],
    finding: [],
    picked: 0,
    gyms: [],
    box: '',
    boxChanged: 0,
    cleared: 0,
  };
  /** How many times the parties were drawn, and those who wait for a draw by its number. */
  let draws = 0;
  const waiting: Array<{ at: number; resolve: () => void }> = [];
  const drawNumber = (at: number) =>
    new Promise<void>((resolve) => {
      if (draws >= at) resolve();
      else waiting.push({ at, resolve });
    });
  const nextDraw = () => drawNumber(draws + 1);
  // The parties first; the reports at stops, asked for after them, drawn again with them.
  const firstDraw = drawNumber(
    (options.partiesDown === true || options.partiesLate === true ? 0 : 1) +
      (options.stops === undefined ? 0 : 1),
  );
  const raids = showParties(
    map as unknown as Parameters<typeof showParties>[0],
    '100000000000000001',
    {
      loggedIn: true,
      member: true,
      readOnly: false,
      csrf: 'token',
    } as unknown as Parameters<typeof showParties>[2],
    GYMS,
    new Map([[1, 'oakland']]),
    options.regions ?? [],
    true,
    {
      registry,
      afterDraw: () => {
        draws += 1;
        for (const waiter of waiting.filter((one) => one.at <= draws)) {
          waiting.splice(waiting.indexOf(waiter), 1);
          waiter.resolve();
        }
      },
      listDrawn: (list) => {
        frameTold.listsDrawn.push(list.readOnly);
        listWaiter();
      },
      located: () => options.located,
      onMove: () => undefined,
      storage:
        options.storage === undefined
          ? undefined
          : {
              getItem: (key: string) => options.storage?.[key] ?? null,
              setItem: (key: string, value: string) => {
                if (options.storage) options.storage[key] = value;
              },
            },
      showMap: () => undefined,
      units: 'imperial',
      finding: (on) => {
        frameTold.finding.push(on);
      },
      findPicked: () => {
        frameTold.picked += 1;
      },
      // The box's text as it is now (the test sets `frameTold.box`).
      findText: () => frameTold.box,
      findCleared: () => {
        frameTold.cleared += 1;
        frameTold.box = '';
      },
      boxChanged: () => {
        frameTold.boxChanged += 1;
      },
      openGym: (gym) => {
        frameTold.gyms.push(gym.id);
        return undefined;
      },
      onStops: (listener) => {
        stopListeners.push(listener);
      },
      spotAddress: (popup, spot) => {
        frameTold.addressed.push({ id: spot.id, popup });
      },
      ...(options.activity === undefined ? {} : { activity: options.activity }),
    },
  );
  // The first list, asked for as the layer starts, drawn.
  await firstDraw;
  /** The marker drawn last whose name is `title`. */
  const markerOf = (title: string) =>
    fake.shown.markers.findLast((marker) => marker.options.title === title);
  /** The server's list changed: the page shown again asks for it, and it is drawn. */
  const poll = async (next: PartiesView) => {
    // The page draws a list only when its text changed: the same one would wait for ever, or pass
    // only where the clock moved on between the two views (their ends from `Date.now()`).
    if (JSON.stringify(next) === listed) throw new Error('poll: the list is the same as before');
    listed = JSON.stringify(next);
    page.visibility = 'visible';
    const drawnNext = nextDraw();
    // Past the 20 seconds a page shown again waits for since its last question.
    vi.setSystemTime(Date.now() + 20_000);
    for (const listener of page.listeners.get('visibilitychange') ?? []) listener({});
    await drawnNext;
  };
  return {
    raids,
    registry,
    frameTold,
    asked,
    timeLimited,
    /** What `/api/parties` answers from now on. */
    listing: (next: PartiesView): void => {
      listed = JSON.stringify(next);
    },
    /** Runs the page's timers of this delay, and gives how many there were. */
    runTimers: (ms: number): number => {
      const due = [...pageTimers].filter(([, timer]) => timer.ms === ms);
      for (const [id, timer] of due) {
        pageTimers.delete(id);
        timer.run();
      }
      return due.length;
    },
    markerOf,
    poll,
    flights,
    flightZooms,
    /** The Report button pressed, and a kind of its menu (step 1) chosen: its step 2. */
    chooseReport: (id: string) => {
      page.byId.get('report-button')?.dispatch('click');
      body.querySelector(`button[data-report-kind="${id}"]`)?.dispatch('click');
    },
    /** Leaflet fires an event on the map. */
    fire: (type: string, event: unknown) => {
      map.fire(type, event);
    },
    /** The map zoomed so that a degree is `pixels` on the screen, its size of markers the same. */
    zoomedTo: (pixels: number, to = zoom) => {
      scale = pixels;
      zoom = to;
      map.fire('zoomend', {});
    },
    panel: page.byId.get('parties') ?? new PageElement('missing'),
    raidForms: fake.forms.raid as RaidUiDeps,
    maxForms: fake.forms.max as MaxUiDeps,
    rocketForms: fake.forms.rocket as RocketUiDeps,
    /** The server's lists from now on, asked for at the next poll (a form's `done`). */
    lists: (next: { parties?: PartiesView; stops?: StopReportsView }) => {
      if (next.parties) listed = JSON.stringify(next.parties);
      if (next.stops) stopsListed = next.stops;
    },
    card: () => fake.card.made,
    reportHeader: () => page.byId.get('report-button'),
    /** The map's own element, its classes the look of what is picked. */
    container,
    /** The next draw of the parties, once it is done. */
    nextDraw,
    /** The `n`th draw from now, once it is done. */
    drawsAhead: (n: number) => drawNumber(draws + n),
    /** The next list told as drawn. */
    listTold: () =>
      new Promise<void>((resolve) => {
        listWaiter = resolve;
      }),
    /** How many times the parties were drawn so far. */
    drawCount: () => draws,
    /** `/api/parties` answers now (`partiesLate`). */
    releaseParties,
    /** The next question of `/api/parties` waits for the answer's release: what lets it go. */
    holdParties: (): (() => void) => {
      let release = (): void => undefined;
      partiesHeld = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        release();
      };
    },
    /** The PokéStops of the view came (or why none did), as the places layer tells it. */
    stopsCame: (answer: readonly MapSpot[] | 'failed' | 'zoom') => {
      for (const listener of stopListeners) listener(answer);
    },
  };
}

describe("a list told as drawn, for the map's tour (plan 8M-17)", () => {
  it('tells of a list the server gave, not of the empty draws before it comes', async () => {
    const { frameTold, drawCount, nextDraw, listTold, releaseParties, registry } = await started({
      raids: true,
      partiesLate: true,
    });
    // A change of layers draws the parties with no list yet.
    const empty = nextDraw();
    registry.set('raids', false);
    await empty;
    expect(drawCount()).toBeGreaterThan(0);
    const told = listTold();
    releaseParties();
    await told;
    // One entry: the empty draw told nothing.
    expect(frameTold.listsDrawn).toEqual([false]);
  });
});

describe('a party a report made or found, opened with the Raids layer off (review B1)', () => {
  it('opens a max battle on its own marker after its form, the raids drawn while it shows', async () => {
    const { maxForms, markerOf } = await started({ raids: false });
    expect(markerOf(spotBattle().title)?.group?.onMap).toBe(false);
    await maxForms.done(spotBattle());
    const marker = markerOf(spotBattle().title);
    expect(marker?.group?.onMap).toBe(true);
    expect(fake.shown.popupOf).toBe(marker);
  });

  it("opens a raid on its gym's marker after its form, the raids drawn while it shows", async () => {
    const { raidForms, markerOf } = await started({ raids: false });
    await raidForms.done(raidAt(1));
    const marker = markerOf('Level 5 raid against Yveltal');
    expect(marker?.group?.onMap).toBe(true);
    expect(fake.shown.popupOf).toBe(marker);
  });

  // Design 2026-11-04: the spot's address asked as its battle's popup opens, never a pin's.
  it("asks for a Power Spot's address as its battle's popup opens, not for a pin's", async () => {
    const { raids, markerOf, frameTold } = await started({ raids: true });
    expect(raids.openBattle('spot-1')).toBe(true);
    expect(frameTold.addressed.map((asked) => asked.id)).toEqual(['spot-1']);
    expect(frameTold.addressed[0]?.popup === popupNow()).toBe(true);
    markerOf(pinBattle().title)?.openPopup();
    expect(frameTold.addressed).toHaveLength(1);
  });

  it("asks for it on a phone as the battle's card opens, with the card's content", async () => {
    const { raids, card, frameTold } = await started({ raids: true, phone: true });
    expect(raids.openBattle('spot-1')).toBe(true);
    expect(card()?.key).toBe(`max:${spotBattle().id}`);
    const shown = card()?.content();
    expect(shown).toBeDefined();
    expect(frameTold.addressed.map((asked) => asked.id)).toEqual(['spot-1']);
    expect(frameTold.addressed[0]?.popup === shown).toBe(true);
  });

  it("opens the battle at a Power Spot for a tap of the spot's dot, none where none stands", async () => {
    const { raids, markerOf } = await started({ raids: false });
    expect(raids.openBattle('spot-9')).toBe(false);
    expect(fake.shown.popupOf).toBeUndefined();
    expect(raids.openBattle('spot-1')).toBe(true);
    const marker = markerOf(spotBattle().title);
    expect(marker?.group?.onMap).toBe(true);
    expect(fake.shown.popupOf).toBe(marker);
  });
});

describe("the phone list's Report line (review B2)", () => {
  const lineIn = (panel: PageElement) =>
    panel.childNodes.some((child) => child.classList.contains('report-line'));

  it('is over the list while Report is offered, and gone once the list is read-only, a form open in the side pane or not', async () => {
    const { panel, poll } = await started({ raids: true });
    expect(lineIn(panel)).toBe(true);
    // A new train's start form in the side pane's box, which stays while the list is drawn.
    panel.querySelector('button[data-new-train]')?.dispatch('click');
    expect(panel.querySelector('[data-form="train"]')).not.toBeNull();
    await poll(view({ readOnly: true }));
    expect(lineIn(panel)).toBe(false);
  });
});

describe("a max battle's step 2 of the Report button, from where you are (review B5)", () => {
  it('flies to your location where the map may go', async () => {
    const located = { lat: 40.45, lon: -79.94 };
    const { maxForms, flights } = await started({ raids: true, regions: REGIONS, located });
    maxForms.pickSpot?.();
    expect(flights).toEqual([[40.45, -79.94]]);
  });

  it("flies to the map's middle while you are beyond the regions and their margin", async () => {
    const located = { lat: 51.5, lon: -0.12 };
    const { maxForms, flights } = await started({ raids: true, regions: REGIONS, located });
    maxForms.pickSpot?.();
    expect(flights).toEqual([[40.44, -79.95]]);
  });
});

describe('a long press or a right click in step 2 of the Report button (review B6)', () => {
  it('puts the pin there, as a tap does, and opens no spawn form', async () => {
    const { maxForms, panel, fire } = await started({ raids: true, regions: REGIONS });
    maxForms.pickSpot?.();
    fire('contextmenu', { latlng: { lat: 40.45, lng: -79.95 } });
    expect(panel.querySelector('button[data-report-pin]')).not.toBeNull();
    // Not "Close the form that is open first.": the spawn form was not asked for.
    expect(page.byId.get('notice-text')?.textContent ?? '').toBe('');
  });
});

describe('Escape in step 2 of the Report button with the phone card open (review B7)', () => {
  /** Escape pressed with the focus nowhere in particular. */
  const escape = () => {
    for (const listener of page.listeners.get('keydown') ?? []) {
      listener({
        key: 'Escape',
        shiftKey: false,
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
      });
    }
  };

  it('closes the card alone, as it closes a popup; Escape again ends step 2', async () => {
    const { maxForms, raids, markerOf, card } = await started({
      raids: true,
      regions: REGIONS,
      phone: true,
    });
    maxForms.pickSpot?.();
    // The battle tapped opens as the card on a phone (step 2 ends once the tap is through, a
    // timer the page's stub never runs here).
    markerOf(spotBattle().title)?.fire('click', {});
    expect(card()?.key).toBe(`max:${spotBattle().id}`);
    escape();
    expect(card()?.key).toBeUndefined();
    expect(raids.forcedPlaces('spots')).toBe(true);
    escape();
    expect(raids.forcedPlaces('spots')).toBe(false);
  });
});

// Review B9: max battles as the party layer draws them (plan 8M-9A, A2 and A6).
describe('a battle at a Power Spot and one at a pin on the map', () => {
  /** A train at stop `stop` of its route: Library (gym 1), then Lake Gazebo's Power Spot. */
  const trainAt = (id: string, stop: number | null): MapTrain => ({
    kind: 'train',
    postKey: null,
    trainKind: 'dynamax',
    trainKindWords: 'Dynamax Train',
    endTime: null,
    id,
    name: `Train ${id}`,
    startTime: null,
    route: ['1', 'wspot-1'],
    spots: [{ key: 'wspot-1', name: 'Lake Gazebo', lat: 40.45, lon: -79.94 }],
    stop,
    atEnd: 'finish',
    stopsAhead: stop === 0 ? [1] : [],
    ahead: null,
    link: 'https://discord.com/channels/1/2/5',
    attendance: attendance(),
    may: { arrange: false, clear: false, load: false },
    moves: null,
    conductor: { who: null, mayTake: false, mayDrop: false },
    moveRefusal: null,
    mayManage: false,
  });

  // Branch review S3: the list's heading by a train's ring.
  it("heads the list of a train's ring with its stop's own name, and a finished train's Nearby", async () => {
    const ringOf = () => fake.shown.circles.findLast((one) => one.options.pane === RING_PANE);
    const heading = () =>
      (fake.placeList.at(-1) as PageElement | undefined)?.querySelector('strong.name')?.textContent;
    await started({ raids: true, parties: view({ trains: [trainAt('t1', 0)] }) });
    ringOf()?.fire('click', {});
    expect(heading()).toBe('Library');
    // Its route finished: the pale ring at its first stop is at no place, though the raid is.
    await started({ raids: true, parties: view({ trains: [trainAt('t1', null)] }) });
    ringOf()?.fire('click', {});
    expect(heading()).toBe('Nearby');
  });

  it('draws each as its marker under the raids, opened by its own key max:<id>', async () => {
    const { markerOf, card } = await started({ raids: true, phone: true });
    for (const battle of [spotBattle(), pinBattle()]) {
      const marker = markerOf(battle.title);
      expect(marker?.group?.onMap).toBe(true);
      marker?.fire('click', {});
      expect(card()?.key).toBe(`max:${battle.id}`);
    }
  });

  it("leaves a spot's dot out for its battle while the raids are drawn, never for a pin", async () => {
    const on = await started({ raids: true });
    expect([...on.raids.battleSpots()]).toEqual(['spot-1']);
    // The parties drawn anew as the layer goes: the spot's dot comes back.
    on.registry.set('raids', false);
    expect([...on.raids.battleSpots()]).toEqual([]);
    const off = await started({ raids: false });
    expect([...off.raids.battleSpots()]).toEqual([]);
  });

  it('gives a tap on a battle to step 2 first, then to route mode, which takes its Power Spot as a stop', async () => {
    const { markerOf, chooseReport, raids, panel } = await started({ raids: true });
    fake.route.on = true;
    // Step 2 of a raid takes it (the battle dimmed: nothing happens); route mode never sees it.
    chooseReport('raid');
    expect(raids.forced()).toBe(true);
    markerOf(spotBattle().title)?.fire('click', {});
    expect(fake.route.taken).toEqual([]);
    expect(fake.shown.popupOf).toBeUndefined();
    // Step 2 canceled: route mode takes the spot's battle as its Power Spot, the pin's never.
    panel.querySelector('button[data-cancel]')?.dispatch('click');
    expect(raids.forced()).toBe(false);
    markerOf(spotBattle().title)?.fire('click', {});
    expect(fake.route.taken).toEqual([{ id: 'spot-1', title: 'Lake Gazebo' }]);
    expect(fake.shown.popupOf).toBeUndefined();
    markerOf(pinBattle().title)?.fire('click', {});
    expect(fake.route.taken).toHaveLength(1);
    expect(fake.shown.popupOf).toBe(markerOf(pinBattle().title));
  });

  it("rings a train at a Power Spot round its battle's circle while the raids are drawn", async () => {
    const trains = [trainAt('t1', 0), trainAt('t2', 1)];
    /** The rings of the trains, by where they are. */
    const ringAt = (lat: number) =>
      fake.shown.circles.findLast(
        (circle) => circle.options.pane === 'rings' && (circle.at as number[])[0] === lat,
      )?.options.radius;
    await started({ raids: true, parties: view({ trains }) });
    // At Library, round its raid; at Lake Gazebo, round its battle, the same size.
    const atGym = ringAt(40.441);
    expect(ringAt(40.45)).toBe(atGym);
    await started({ raids: false, parties: view({ trains }) });
    expect(ringAt(40.45)).toBe(ringAt(40.441));
    expect(ringAt(40.45)).toBeLessThan(atGym as number);
  });

  // Plan 8M-11B (S27): a train's line says where it goes and where it has been.
  describe("a train's line", () => {
    /** The arrowheads drawn now (those of the draws before are gone with their group). */
    const arrows = () =>
      fake.shown.markers.filter(
        (marker) =>
          marker.group?.layers.includes(marker) === true &&
          (marker.options.icon as { options: { className?: string } } | undefined)?.options
            .className === 'train-arrow',
      );
    /** Whether a layer is drawn now: in its group, and that group in its own, up to a layer's. */
    const drawnNow = (layer: InstanceType<typeof fake.Layer>): boolean => {
      const { group } = layer;
      if (group?.layers.includes(layer) !== true) return false;
      return group instanceof fake.FeatureGroup ? drawnNow(group) : true;
    };
    /** The classes Leaflet puts on a line's path. */
    const classesOf = (line: InstanceType<typeof fake.Path>): string[] =>
      (typeof line.options.className === 'string' ? line.options.className : '')
        .split(' ')
        .filter((name) => name !== '');
    /** The lines drawn now that only carry the flow (plan 8M-13, T1), by their points. */
    const flowLines = () =>
      fake.shown.lines
        .filter(
          (line) =>
            drawnNow(line) &&
            classesOf(line).includes('train-flow-line') &&
            !classesOf(line).includes('train-flow-done'),
        )
        .map((line) => ({
          points: (line.at as Array<{ lat: number; lng: number }>).length,
          interactive: line.options.interactive,
          moving: classesOf(line).includes('train-flow'),
        }));
    /** The lines drawn now, by their points, opacity and dashes (the flow's own aside). */
    const lines = () =>
      fake.shown.lines
        .filter(
          (line) =>
            drawnNow(line) &&
            line.options.opacity !== 0 &&
            !classesOf(line).includes('train-flow-line'),
        )
        .map((line) => ({
          points: (line.at as Array<{ lat: number; lng: number }>).length,
          opacity: line.options.opacity,
          dashed: line.options.dashArray !== undefined,
        }));
    /** A loop of three stops: the Library, Lake Gazebo, the Fountain. */
    const loop = (stop: number | null): MapTrain => ({
      ...trainAt('t1', 0),
      route: ['1', 'wspot-1', 'wspot-2'],
      spots: [
        { key: 'wspot-1', name: 'Lake Gazebo', lat: 40.45, lon: -79.94 },
        { key: 'wspot-2', name: 'Fountain', lat: 40.43, lon: -79.93 },
      ],
      stop,
      atEnd: 'loop',
      // Round the loop to the stop before (plan 8M-15).
      stopsAhead:
        stop === null
          ? []
          : ([
              [1, 2],
              [2, 0],
              [0, 1],
            ][stop] ?? []),
    });

    // Review SEL-1: on the overlay pane each draw would put the lines back over the gyms' dots,
    // which a draw leaves in place, and a tap on a dot at a stop would reopen the train.
    it("draws a train's line on a pane under the places' dots, the arrowheads where they were", async () => {
      await started({ raids: false, parties: view({ trains: [loop(1)] }) });
      const drawnLines = fake.shown.lines.filter((line) => drawnNow(line));
      // The faint leg and its flow, the one ahead and its, the dashed closing leg, the wide one.
      expect(drawnLines).toHaveLength(6);
      for (const line of drawnLines) {
        expect(line.options.pane).toBe(TRAIN_LINE_PANE);
        expect((line.options.renderer as { options: unknown } | undefined)?.options).toEqual({
          pane: TRAIN_LINE_PANE,
        });
      }
      expect(TRAIN_LINE_PANE_Z).toBeLessThan(400);
      for (const arrow of arrows()) expect(arrow.options.pane).toBe('overlayPane');
    });

    // Matt, 2026-10-30, on a phone: the route editor came up behind a card. A train's own card goes
    // with the draw that takes its line off the map; any other stayed in front of the editor.
    it('closes the card that is open when route mode starts', async () => {
      const { markerOf, card } = await started({
        raids: true,
        phone: true,
        parties: view({
          raids: [raidAt(1)],
          maxes: [],
          trains: [
            {
              ...loop(0),
              route: [],
              stop: null,
              may: { arrange: true, clear: false, load: false },
            },
          ],
        }),
      });
      const detail = fake.list.detail?.({
        key: 'train:t1',
        kind: 'trains',
        id: 't1',
        marker: null,
        name: 'Train t1',
        place: '',
        point: null,
        picture: null,
        going: 0,
        soonest: null,
        times: {},
      }) as PageElement | undefined;
      markerOf(raidAt(1).heading)?.openPopup();
      expect(card()?.key).toBe('gym:1');
      detail?.querySelector('button[data-route-train="t1"]')?.dispatch('click');
      expect(card()?.key).toBeUndefined();
    });

    // Matt, 2026-10-30: a ring took a tap on its line alone, and looked broken.
    describe('the tap inside a ring', () => {
      const discs = () =>
        fake.shown.circles.filter((one) => drawnNow(one) && one.options.pane === RING_TAP_PANE);
      const ringOf = () => fake.shown.circles.findLast((one) => one.options.pane === RING_PANE);
      const pin: MapMeetup = {
        kind: 'meetup',
        id: 'm1',
        name: 'Picnic',
        startTime: null,
        endTime: null,
        link: 'https://discord.com/channels/1/2/6',
        attendance: attendance(),
        postKey: null,
        place: { kind: 'pin', words: 'At it', lat: 40.5, lon: -79.5, gymId: null, at: null },
        info: null,
        panel: null,
      };

      it('is an invisible disc over the lines and under the dots, as wide as a tap', async () => {
        await started({ raids: false, parties: view({ meetups: [pin] }) });
        const [disc] = discs();
        expect(discs()).toHaveLength(1);
        expect(disc?.options).toMatchObject({ stroke: false, fillOpacity: 0, radius: 16 });
        expect((disc?.options.renderer as { options: unknown } | undefined)?.options).toEqual({
          pane: RING_TAP_PANE,
        });
        expect(RING_TAP_PANE_Z).toBeGreaterThan(TRAIN_LINE_PANE_Z);
        expect(RING_TAP_PANE_Z).toBeLessThan(400);
      });

      it("opens the meetup's popup", async () => {
        await started({ raids: false, parties: view({ meetups: [pin] }) });
        discs()[0]?.fire('click', {});
        expect(fake.shown.popupOf).toBe(ringOf());
      });

      it("opens the train's popup, and reaches to the ring's line round a raid", async () => {
        await started({ raids: true, parties: view({ trains: [loop(1)], raids: [], maxes: [] }) });
        expect(discs()).toHaveLength(1);
        expect(discs()[0]?.options.radius).toBe(16);
        discs()[0]?.fire('click', {});
        expect(fake.shown.popupOf).toBe(ringOf());
        await started({
          raids: true,
          parties: view({ trains: [loop(0)], raids: [raidAt(1)], maxes: [] }),
        });
        const ring = ringOf()?.options as { radius: number; weight: number };
        expect(discs()[0]?.options.radius).toBe(ring.radius + ring.weight / 2);
      });

      it('lists what shares its place, as a tap on the ring does', async () => {
        const walk: MapMeetup = { ...pin, id: 'm2', name: 'Walk' };
        await started({ raids: false, parties: view({ meetups: [pin, walk] }) });
        discs()[0]?.fire('click', {});
        expect(fake.shown.popupOf).toBeUndefined();
        const list = fake.placeList.at(-1) as PageElement | undefined;
        expect(
          list?.querySelectorAll('button[data-open]').map((choice) => choice.dataset.open),
        ).toEqual(['meetup:m1', 'meetup:m2']);
      });

      // Review R1: the layers' sheet counts what is in view, and a disc is no thing of its own.
      it("counts for nothing in the layer's number in view", async () => {
        const { fire, registry } = await started({
          raids: false,
          parties: view({ meetups: [pin], trains: [loop(1)] }),
        });
        fire('moveend', {});
        expect(registry.count('meetups')).toBe(1);
        expect(registry.count('trains')).toBe(1);
      });

      // Review R5: as a press on the ring's line does.
      it('asks for the post ahead as the pointer presses it', async () => {
        await started({ raids: false, parties: view({ meetups: [pin] }) });
        const disc = discs()[0];
        expect(disc?.handlers.get('mousedown')).toBeDefined();
      });

      it('is not drawn while the rings let taps through', async () => {
        const { chooseReport } = await started({
          raids: true,
          parties: view({ meetups: [pin], trains: [loop(1)], maxes: [] }),
        });
        expect(discs()).toHaveLength(2);
        chooseReport('raid');
        expect(discs()).toEqual([]);
      });
    });

    // Matt, 2026-10-30: a line of 4 pixels is hard to tap on a phone.
    describe('its wide line for taps', () => {
      const hitLine = () =>
        fake.shown.lines.find((line) => drawnNow(line) && line.options.opacity === 0);

      it('runs invisible, 20 pixels wide, over every leg, in the line’s pane', async () => {
        await started({ raids: false, parties: view({ trains: [loop(1)] }) });
        const hit = hitLine();
        expect(hit?.options).toMatchObject({ weight: 20, opacity: 0, pane: TRAIN_LINE_PANE });
        expect((hit?.options.renderer as { options: unknown } | undefined)?.options).toEqual({
          pane: TRAIN_LINE_PANE,
        });
        // The leg done, the one ahead and the closing leg, each a part of its own.
        expect((hit?.at as unknown[][]).map((part) => part.length)).toEqual([2, 2, 2]);
        expect(hit?.options.interactive).toBe(true);
      });

      it("is a piece of the line's group, so that a tap opens the train's popup as the line does", async () => {
        await started({ raids: false, parties: view({ trains: [loop(1)] }) });
        const group = hitLine()?.group as unknown as InstanceType<typeof fake.FeatureGroup>;
        expect(group).toBeInstanceOf(fake.FeatureGroup);
        expect(group.bound).toBe(true);
        // With the faint leg, the one ahead, their flows and the closing leg.
        expect(fake.shown.lines.filter((line) => line.group === hitLine()?.group).length).toBe(6);
      });

      it('takes no tap while the line takes none', async () => {
        const { chooseReport } = await started({
          raids: true,
          parties: view({ trains: [loop(1)] }),
        });
        // Report's step 2: the trains let taps through to the places, so does the wide line.
        chooseReport('raid');
        const line = fake.shown.lines.find(
          (one) => drawnNow(one) && one.options.opacity !== 0 && one.options.weight === 4,
        );
        expect(line?.options.interactive).toBe(false);
        expect(hitLine()?.options.interactive).toBe(false);
      });
    });

    it('draws the legs done faint, those ahead as before, each with an arrowhead turned along it', async () => {
      await started({ raids: false, parties: view({ trains: [trainAt('t1', 0)] }) });
      expect(lines()).toEqual([{ points: 2, opacity: 0.8, dashed: false }]);
      // Library to Lake Gazebo: north-east on the screen.
      expect(arrows()).toHaveLength(1);
      const at = arrows()[0]?.getLatLng();
      expect(at?.lat).toBeCloseTo(40.4455, 9);
      expect(at?.lng).toBeCloseTo(-79.945, 9);
      await started({ raids: false, parties: view({ trains: [trainAt('t1', 1)] }) });
      expect(lines()).toEqual([{ points: 2, opacity: 0.35, dashed: false }]);
      expect(arrows()).toEqual([]);
    });

    it('closes a loop with a dashed leg and its arrowhead; a finished one is all faint', async () => {
      await started({ raids: false, parties: view({ trains: [loop(1)] }) });
      expect(lines()).toEqual([
        { points: 2, opacity: 0.35, dashed: false },
        { points: 2, opacity: 0.8, dashed: false },
        { points: 2, opacity: 0.8, dashed: true },
      ]);
      expect(arrows()).toHaveLength(2);
      await started({ raids: false, parties: view({ trains: [loop(null)] }) });
      expect(lines()).toEqual([{ points: 3, opacity: 0.35, dashed: false }]);
      expect(arrows()).toEqual([]);
    });

    // Matt, 2026-10-30: the legs done flow too, faint as they are.
    it('runs a flow over the legs done, marked as faint, taking no taps', async () => {
      await started({ raids: false, parties: view({ trains: [loop(1)] }) });
      const done = fake.shown.lines.filter(
        (line) => drawnNow(line) && classesOf(line).includes('train-flow-done'),
      );
      expect(done.map((line) => classesOf(line))).toEqual([
        ['train-flow', 'train-flow-line', 'train-flow-done'],
      ]);
      expect(done[0]?.options.interactive).toBe(false);
      await started({ raids: false, parties: view({ trains: [loop(0)] }) });
      expect(
        fake.shown.lines.filter(
          (line) => drawnNow(line) && classesOf(line).includes('train-flow-done'),
        ),
      ).toEqual([]);
    });

    // Plan 8M-13 (T1): a slow flow along the legs ahead says which way the train goes.
    it('runs a flow over the legs ahead and moves the dashes of a loop’s closing leg', async () => {
      await started({ raids: false, parties: view({ trains: [trainAt('t1', 0)] }) });
      // One thin line over the leg ahead, letting clicks through to the train's own line.
      expect(flowLines()).toEqual([{ points: 2, interactive: false, moving: true }]);
      await started({ raids: false, parties: view({ trains: [loop(1)] }) });
      expect(flowLines()).toEqual([{ points: 2, interactive: false, moving: true }]);
      // The closing leg is no second line: its own dashes move.
      const closing = fake.shown.lines.filter(
        (line) => drawnNow(line) && line.options.dashArray !== undefined,
      );
      expect(closing.map((line) => classesOf(line))).toEqual([['train-flow']]);
      // No flow ahead at the end of the route, and a finished train stays still.
      await started({ raids: false, parties: view({ trains: [trainAt('t1', 1)] }) });
      expect(flowLines()).toEqual([]);
      await started({ raids: false, parties: view({ trains: [loop(null)] }) });
      expect(flowLines()).toEqual([]);
      expect(
        fake.shown.lines.filter((line) => drawnNow(line) && classesOf(line).length > 0),
      ).toEqual([]);
    });

    // Fix round 1 of 8M-13 (R1-3): every draw makes new paths; the flow goes on where it was.
    it('starts each flowing path where the flow is by the clock, so a redraw does not jump', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: 400 * FLOW_CYCLE_MS + 700 });
      try {
        await started({ raids: false, parties: view({ trains: [loop(1)] }) });
        const flowing = fake.shown.lines.filter(
          (line) => drawnNow(line) && classesOf(line).includes('train-flow'),
        );
        expect(flowing).toHaveLength(3);
        for (const line of flowing) line.fire('add');
        expect(flowing.map((line) => line.element?.style.animationDelay)).toEqual([
          '-700ms',
          '-700ms',
          '-700ms',
        ]);
        // The legs that do not flow keep no delay.
        const still = fake.shown.lines.find(
          (line) => drawnNow(line) && !classesOf(line).includes('train-flow'),
        );
        still?.fire('add');
        expect(still?.element?.style.animationDelay).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    // Review R1 of 8M-11B: one popup per train's line, under the key the post's rules know.
    describe('opened from its faint leg', () => {
      /** The layer whose popup a click on `line` opens: its own, or its group's. */
      const popupLayer = (line: InstanceType<typeof fake.Layer>) =>
        line.bound ? line : (line.group as unknown as InstanceType<typeof fake.Layer>);
      /** The faint leg of the train drawn now. */
      const faintLeg = () => {
        const leg = fake.shown.lines.find(
          (line) => drawnNow(line) && line.options.opacity === 0.35,
        );
        if (!leg) throw new Error('no faint leg drawn');
        return leg;
      };
      const posted = (stop: number) => ({ ...loop(stop), postKey: 'p1' });

      it("is drawn anew when the train's post comes", async () => {
        await started({
          raids: false,
          parties: view({ trains: [posted(1)] }),
          posts: { t1: { key: 'p1', blocks: [] } },
        });
        const layer = popupLayer(faintLeg());
        const redrawn = new Promise<void>((resolve) => {
          fake.list.waiting.push(resolve);
        });
        // The pointer on it asks for the post ahead; the popup opens meanwhile.
        layer.fire('mousedown');
        layer.openPopup();
        await redrawn;
        expect(fake.list.redrawn).toContain('train:t1');
        expect(layer.updates).toBe(1);
      });

      // Branch review BR-1: a train's popup reopened after a draw stays where it was opened,
      // not at the line's first piece (autoPan would move the map there).
      it('reopens where it was opened when the parties are drawn anew', async () => {
        const { poll } = await started({ raids: false, parties: view({ trains: [posted(1)] }) });
        const clicked = { lat: 40.44, lng: -79.935 };
        popupLayer(faintLeg()).openPopup(clicked);
        await poll(view({ trains: [posted(2)] }));
        const open = fake.shown.popupOf;
        expect(open !== undefined && drawnNow(open)).toBe(true);
        expect(open?.openedAt).toEqual(clicked);
      });

      // Staging of 8M-16: drawn anew up to four times as often, a tall popup jumped to its top.
      it('keeps how far its popup is scrolled when the parties are drawn anew', async () => {
        const { poll } = await started({ raids: false, parties: view({ trains: [posted(1)] }) });
        popupLayer(faintLeg()).openPopup();
        const contentNow = () =>
          (fake.shown.popupOf?.popupElement as PageElement).querySelector('.leaflet-popup-content');
        const before = contentNow();
        if (before) before.scrollTop = 120;
        await poll(view({ trains: [posted(2)] }));
        expect(contentNow()).not.toBe(before);
        expect(contentNow()?.scrollTop).toBe(120);
      });

      // Staging of 8M-16: the post of a press comes after the list, and its draw scrolled to the top.
      it('keeps how far its popup is scrolled when its post comes', async () => {
        await started({
          raids: false,
          parties: view({ trains: [posted(1)] }),
          posts: { t1: { key: 'p1', blocks: [] } },
        });
        const layer = popupLayer(faintLeg());
        const redrawn = new Promise<void>((resolve) => {
          fake.list.waiting.push(resolve);
        });
        layer.fire('mousedown');
        layer.openPopup();
        const content = (layer.popupElement as PageElement).querySelector('.leaflet-popup-content');
        if (content) content.scrollTop = 120;
        await redrawn;
        expect(layer.updates).toBe(1);
        expect(content?.scrollTop).toBe(120);
      });

      it('stays open when a move takes the faint leg away', async () => {
        const { poll } = await started({ raids: false, parties: view({ trains: [posted(1)] }) });
        popupLayer(faintLeg()).openPopup();
        // Previous: back at the first stop, nothing done.
        await poll(view({ trains: [posted(0)] }));
        const open = fake.shown.popupOf;
        expect(open !== undefined && drawnNow(open)).toBe(true);
      });
    });

    // Matt, 2026-10-30: a train's numbers only while it is selected, on its stops, above all.
    describe('its numbers', () => {
      /** The badges drawn now, by their numbers, in the order drawn. */
      const badges = () =>
        fake.shown.markers.filter(
          (marker) =>
            drawnNow(marker) &&
            (marker.options.icon as { options: { className?: string } } | undefined)?.options
              .className === 'train-badge',
        );
      const numbers = () =>
        badges().map(
          (marker) =>
            (marker.options.icon as { options: { html: { textContent: string } } }).options.html
              .textContent,
        );
      /** The train's ring drawn last, whose popup selects it. */
      const ringOf = () => fake.shown.circles.findLast((one) => one.options.pane === RING_PANE);

      it('draws none until the train is selected, none again once it is closed', async () => {
        await started({ raids: false, parties: view({ trains: [loop(1)] }) });
        expect(numbers()).toEqual([]);
        ringOf()?.openPopup();
        // At Lake Gazebo now: the Fountain next, then round the loop to the Library.
        expect(numbers()).toEqual(['1', '2']);
        expect(badges()[0]?.getLatLng()).toEqual({ lat: 40.43, lng: -79.93 });
        ringOf()?.closePopup();
        expect(numbers()).toEqual([]);
      });

      it('draws them for the popup of its line too', async () => {
        await started({ raids: false, parties: view({ trains: [loop(1)] }) });
        const leg = fake.shown.lines.find((line) => drawnNow(line) && line.options.opacity === 0.8);
        const line = leg?.bound === true ? leg : (leg?.group as unknown as typeof leg);
        line?.openPopup();
        expect(numbers()).toEqual(['1', '2']);
      });

      it('clears them when anything else is opened', async () => {
        const { markerOf } = await started({
          raids: true,
          parties: view({ trains: [loop(1)], raids: [raidAt(1)], maxes: [] }),
        });
        ringOf()?.openPopup();
        expect(numbers()).toEqual(['1', '2']);
        markerOf(raidAt(1).heading)?.openPopup();
        expect(numbers()).toEqual([]);
      });

      it('shows one train at a time', async () => {
        const other: MapTrain = { ...loop(0), id: 't2', name: 'Train t2' };
        await started({ raids: false, parties: view({ trains: [loop(1), other] }) });
        const rings = fake.shown.circles.filter((one) => one.options.pane === RING_PANE);
        rings[1]?.openPopup();
        // The second train's, at the Library: Lake Gazebo next, then the Fountain.
        expect(badges().map((one) => one.getLatLng())).toEqual([
          { lat: 40.45, lng: -79.94 },
          { lat: 40.43, lng: -79.93 },
        ]);
      });

      it('follows the train through a draw while open, and goes when it ends', async () => {
        const moved = await started({ raids: false, parties: view({ trains: [loop(1)] }) });
        ringOf()?.openPopup();
        // Moved on: at the Fountain, the Library next, then Lake Gazebo.
        await moved.poll(view({ trains: [loop(2)] }));
        expect(numbers()).toEqual(['1', '2']);
        expect(badges()[0]?.getLatLng()).toEqual({ lat: 40.441, lng: -79.95 });
        const ended = await started({ raids: false, parties: view({ trains: [loop(1)] }) });
        ringOf()?.openPopup();
        await ended.poll(view({ trains: [] }));
        expect(numbers()).toEqual([]);
      });

      it('draws none on a finished train, and none below zoom 15', async () => {
        const shown = await started({ raids: false, parties: view({ trains: [loop(1)] }) });
        ringOf()?.openPopup();
        shown.zoomedTo(10_000, 14);
        expect(numbers()).toEqual([]);
        shown.zoomedTo(10_000, 15);
        expect(numbers()).toEqual(['1', '2']);
        await started({ raids: false, parties: view({ trains: [loop(null)] }) });
        ringOf()?.openPopup();
        expect(numbers()).toEqual([]);
      });

      it('draws them for the phone card, and clears them when it closes', async () => {
        const { card } = await started({
          raids: false,
          phone: true,
          parties: view({ trains: [loop(1)] }),
        });
        ringOf()?.openPopup();
        expect(card()?.key).toBe('train:t1');
        expect(numbers()).toEqual(['1', '2']);
        card()?.close();
        expect(numbers()).toEqual([]);
      });

      // Review SEL-3: what opens a train, and what a draw does under it.
      it('keeps them through a draw under the phone card, and clears them when the train ends', async () => {
        const moved = await started({
          raids: false,
          phone: true,
          parties: view({ trains: [loop(1)] }),
        });
        ringOf()?.openPopup();
        await moved.poll(view({ trains: [loop(2)] }));
        expect(moved.card()?.key).toBe('train:t1');
        expect(numbers()).toEqual(['1', '2']);
        expect(badges()[0]?.getLatLng()).toEqual({ lat: 40.441, lng: -79.95 });
        const ended = await started({
          raids: false,
          phone: true,
          parties: view({ trains: [loop(1)] }),
        });
        ringOf()?.openPopup();
        await ended.poll(view({ trains: [] }));
        expect(ended.card()?.key).toBeUndefined();
        expect(numbers()).toEqual([]);
      });

      it('draws them for a train chosen in the list of things at one place', async () => {
        await started({
          raids: true,
          parties: view({ trains: [loop(0)], raids: [raidAt(1)], maxes: [] }),
        });
        ringOf()?.fire('click', {});
        expect(numbers()).toEqual([]);
        const list = fake.placeList.at(-1) as PageElement | undefined;
        list?.querySelector('button[data-open="train:t1"]')?.dispatch('click');
        expect(numbers()).toEqual(['1', '2']);
      });

      it('draws them for a train opened from the side list, and from Find', async () => {
        const side = await started({ raids: false, parties: view({ trains: [loop(1)] }) });
        fake.list.open?.({
          marker: 'train:t1',
          point: { lat: 40.45, lon: -79.94 },
          kind: 'trains',
        });
        side.fire('moveend', {});
        expect(numbers()).toEqual(['1', '2']);
        const found = await started({ raids: false, parties: view({ trains: [loop(1)] }) });
        found.raids.find('Train t1');
        found.raids.findFirst();
        found.fire('moveend', {});
        expect(numbers()).toEqual(['1', '2']);
      });

      it("hides them under a popup with no party's key in front of the card, and shows them after", async () => {
        const { fire } = await started({
          raids: false,
          phone: true,
          parties: view({ trains: [loop(1)] }),
        });
        ringOf()?.openPopup();
        expect(numbers()).toEqual(['1', '2']);
        // A gym's dot's popup, which `gyms-ui.ts` binds under no key of the parties.
        const dotsPopup = {
          getElement: () => undefined,
          getLatLng: () => ({ lat: 40.44, lng: -79.95 }),
        };
        fire('popupopen', { popup: dotsPopup });
        expect(numbers()).toEqual([]);
        fire('popupclose', { popup: dotsPopup });
        expect(numbers()).toEqual(['1', '2']);
      });

      it('draws none on a train being routed', async () => {
        // The clock still: the same view twice is the same list (no end a millisecond later).
        vi.useFakeTimers({ toFake: ['Date'] });
        const { poll } = await started({ raids: false, parties: view({ trains: [loop(1)] }) });
        ringOf()?.openPopup();
        expect(numbers()).toEqual(['1', '2']);
        fake.route.routed = 't1';
        // A list that changed (the train moved on): one the same as before is never drawn again.
        await poll(view({ trains: [loop(2)] }));
        expect(numbers()).toEqual([]);
      });

      it('follows a zoom under a form, which holds the parties', async () => {
        const shown = await started({ raids: false, parties: view({ trains: [loop(1)] }) });
        ringOf()?.openPopup();
        const claim = shown.raidForms.hold.take(false);
        if (!claim || !shown.raidForms.hold.ready(claim, true)) throw new Error('no form opened');
        shown.zoomedTo(10_000, 14);
        expect(numbers()).toEqual([]);
        shown.zoomedTo(10_000, 15);
        expect(numbers()).toEqual(['1', '2']);
        shown.raidForms.hold.release(claim);
      });

      // Review SEL-4: a form holds the raids at the size they were drawn at.
      it('takes the corner of the marker as it is drawn, while a form holds the parties', async () => {
        const shown = await started({
          raids: true,
          zoom: 14,
          parties: view({ trains: [loop(1)], raids: [raidAt(1)], maxes: [] }),
        });
        ringOf()?.openPopup();
        const claim = shown.raidForms.hold.take(false);
        if (!claim || !shown.raidForms.hold.ready(claim, true)) throw new Error('no form opened');
        shown.zoomedTo(10_000, 15);
        const library = badges().find((one) => one.getLatLng().lat === 40.441);
        const { options } = library?.options.icon as { options: { iconAnchor: number[] } };
        // A raid of the middle size, 30 pixels wide, and half of the number of 20.
        expect(options.iconAnchor).toEqual([25, 25]);
        shown.raidForms.hold.release(claim);
      });

      it('takes no tap, in a pane above every marker, on the corner of what the stop holds', async () => {
        await started({
          raids: true,
          parties: view({ trains: [loop(1)], raids: [raidAt(1)], maxes: [] }),
        });
        ringOf()?.openPopup();
        const anchors = badges().map((badge) => {
          expect(badge.options.pane).toBe(BADGE_PANE);
          expect(badge.options.interactive).toBe(false);
          const { options } = badge.options.icon as {
            options: { iconSize: number[]; iconAnchor: number[] };
          };
          expect(options.iconSize).toEqual([20, 20]);
          return options.iconAnchor;
        });
        // Leaflet's marker pane is 600, its tooltips' 650.
        expect(BADGE_PANE_Z).toBeGreaterThan(600);
        expect(BADGE_PANE_Z).toBeLessThan(650);
        // The Fountain has a dot; the Library's raid a full marker.
        expect(anchors).toEqual([
          [17, 17],
          [32, 32],
        ]);
      });
    });

    // Review R2 of 8M-11B: the arrowheads follow every zoom, also while a form holds the parties.
    it('draws the arrowheads for the new zoom while a form holds the parties', async () => {
      const shown = await started({ raids: false, parties: view({ trains: [loop(0)] }) });
      const claim = shown.raidForms.hold.take(false);
      if (!claim || !shown.raidForms.hold.ready(claim, true)) throw new Error('no form opened');
      // To zoom 13 (another size of markers: the parties wait for the form), far out.
      shown.zoomedTo(1_000, 13);
      expect(arrows()).toEqual([]);
      shown.raidForms.hold.release(claim);
    });

    it('draws the arrowheads anew at each zoom: none on legs too short on the screen', async () => {
      const shown = await started({ raids: false, parties: view({ trains: [loop(0)] }) });
      expect(arrows()).toHaveLength(3);
      // Zoomed out: a hundredth of a degree is 10 pixels, every leg under the 40 an arrowhead needs.
      shown.zoomedTo(1_000);
      expect(arrows()).toEqual([]);
      shown.zoomedTo(10_000);
      expect(arrows()).toHaveLength(3);
    });
  });
});

// Review B7b: the mirror of B7, a raid dimmed while a max battle's step 2 picks Power Spots.
describe("a raid's marker in a max battle's step 2 of the Report button", () => {
  it('takes the tap and does nothing: no popup, no card, step 2 going on', async () => {
    for (const phone of [false, true]) {
      const { maxForms, raids, markerOf, card } = await started({
        raids: true,
        regions: REGIONS,
        phone,
      });
      maxForms.pickSpot?.();
      markerOf('Level 5 raid against Yveltal')?.fire('click', {});
      // Compared, not printed: the fakes are no page chai can show.
      expect(fake.shown.popupOf === undefined).toBe(true);
      expect(card()?.key).toBeUndefined();
      expect(raids.forcedPlaces('spots')).toBe(true);
    }
  });
});

describe('the reports at stops on the map (plan 8M-9B)', () => {
  /** Stop 5's research and grunt, stop 7's research, in Oakland (away from the Library). */
  const STOPS = caseView({
    research: [caseResearch(5), caseResearch(7)],
    grunts: [caseGrunt(5)],
  });
  // The cases' clock (their reports end hours after it): the draw drops a report at its end.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(CASE_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws one marker per stop with every report there, its PokéStop dot left out', async () => {
    const { markerOf, raids, registry } = await started({ raids: true, stops: STOPS });
    expect(markerOf('Yellow Mural 5')?.group?.onMap).toBe(true);
    expect(markerOf('Yellow Mural 7')?.group?.onMap).toBe(true);
    expect([...raids.reportStops()]).toEqual(['stop-5', 'stop-7']);
    // Research off: stop 5 keeps its grunt's marker, stop 7 has none.
    registry.set('research', false);
    expect([...raids.reportStops()]).toEqual(['stop-5']);
    registry.set('rocket', false);
    expect([...raids.reportStops()]).toEqual([]);
  });

  it('is not drawn for layers the browser kept off', async () => {
    const { raids } = await started({
      raids: true,
      stops: STOPS,
      layers: { research: false, rocket: false },
    });
    expect([...raids.reportStops()]).toEqual([]);
  });

  // Review F11: the reports have their own poll, and do not wait for the parties'.
  it('is drawn while the parties cannot be had, the map not said to be read-only', async () => {
    const { markerOf, raids } = await started({ raids: true, stops: STOPS, partiesDown: true });
    expect([...raids.reportStops()]).toEqual(['stop-5', 'stop-7']);
    expect(markerOf('Yellow Mural 5')?.group?.onMap).toBe(true);
    expect(page.byId.get('read-only')?.hidden).toBe(true);
  });

  // Branch review W1: the reports drawn anew under a form keep the parties' newer list waiting.
  it("draws the parties' list that came under a form once it closes, though the reports changed meanwhile", async () => {
    const { raids, raidForms, rocketForms, lists, markerOf } = await started({
      raids: true,
      stops: STOPS,
    });
    const claim = raidForms.hold.take(false);
    if (!claim || !raidForms.hold.ready(claim, true)) throw new Error('the form did not open');
    // A raid reported on Discord meanwhile: its list waits for the form.
    const lugia = { ...raidAt(1), id: 'r1b', boss: 'Lugia', heading: 'Level 5 raid against Lugia' };
    lists({ parties: view({ raids: [lugia] }) });
    await raidForms.done(undefined);
    // Stop 7's research taken back elsewhere: the reports drawn anew, under the form too.
    lists({ stops: caseView({ research: [caseResearch(5)], grunts: [caseGrunt(5)] }) });
    await rocketForms.done(undefined);
    expect(markerOf(lugia.heading)).toBeUndefined();
    raidForms.hold.release(claim);
    expect(markerOf(lugia.heading)?.group?.onMap).toBe(true);
    expect([...raids.reportStops()]).toEqual(['stop-5']);
  });

  // Plan 8M-10, C9: nothing polled while the region editor is on.
  it('asks for neither list while the region editor is on, and for both when it is off', async () => {
    const activity = new MapActivity(() => page.visibility === 'visible');
    const {
      asked,
      lists: listed,
      drawsAhead,
      markerOf,
      raids,
    } = await started({ raids: true, stops: STOPS, activity });
    const lists = () =>
      asked.filter((url) => url.endsWith('/api/parties') || url.endsWith('/api/stop-reports'));
    expect(lists()).toHaveLength(2);
    activity.setEditing(true);
    // The page shown again while the editor is on asks for nothing.
    page.visibility = 'visible';
    for (const listener of page.listeners.get('visibilitychange') ?? []) listener({});
    activity.changed();
    expect(lists()).toHaveLength(2);
    // Both lists changed meanwhile: asked for and drawn once the editor is off (branch review W8:
    // the test awaits both draws).
    const lugia = { ...raidAt(1), id: 'r1b', boss: 'Lugia', heading: 'Level 5 raid against Lugia' };
    listed({
      parties: view({ raids: [lugia] }),
      stops: caseView({ research: [caseResearch(5)], grunts: [caseGrunt(5)] }),
    });
    const drawn = drawsAhead(2);
    vi.setSystemTime(CASE_NOW + 20_000);
    activity.setEditing(false);
    expect(lists().slice(2).sort()).toEqual([
      '/s/100000000000000001/api/parties',
      '/s/100000000000000001/api/stop-reports',
    ]);
    await drawn;
    expect(markerOf(lugia.heading)?.group?.onMap).toBe(true);
    expect([...raids.reportStops()]).toEqual(['stop-5']);
  });

  // Branch review W1: the hidden live map is not drawn anew (nor sized, nor its posts asked for)
  // while the region editor is on; what changed meanwhile is drawn once it is off.
  it('draws nothing while the region editor is on, and what changed once it is off', async () => {
    const activity = new MapActivity(() => page.visibility === 'visible');
    const { raids, registry, drawCount } = await started({ raids: true, stops: STOPS, activity });
    activity.setEditing(true);
    const before = drawCount();
    registry.set('research', false);
    expect(drawCount()).toBe(before);
    expect([...raids.reportStops()]).toEqual(['stop-5', 'stop-7']);
    activity.setEditing(false);
    expect(drawCount()).toBe(before + 1);
    expect([...raids.reportStops()]).toEqual(['stop-5']);
  });

  // Re-review V2: a list that came while the editor was on is the newest; a layer toggled
  // meanwhile does not put the older list drawn before the editor back in its place.
  it('draws the list that came while the editor was on, a layer toggled meanwhile', async () => {
    const activity = new MapActivity(() => page.visibility === 'visible');
    const { raidForms, registry, lists, holdParties, markerOf, nextDraw } = await started({
      raids: true,
      stops: STOPS,
      activity,
    });
    page.visibility = 'visible';
    const lugia = { ...raidAt(1), id: 'r1b', boss: 'Lugia', heading: 'Level 5 raid against Lugia' };
    lists({ parties: view({ raids: [lugia] }) });
    // The list asked for (a form went through) before the editor turns on, its answer after.
    const release = holdParties();
    const asking = raidForms.done(undefined);
    activity.setEditing(true);
    release();
    await asking;
    registry.set('research', false);
    const drawn = nextDraw();
    activity.setEditing(false);
    await drawn;
    expect(markerOf(lugia.heading)?.group?.onMap).toBe(true);
    expect(markerOf('Level 5 raid against Yveltal')?.group?.onMap).not.toBe(true);
  });

  // Branch review W1: a layer toggled draws the reports, the parties' list known or not.
  it('draws the reports anew as their layer is toggled while the parties cannot be had', async () => {
    const { raids, registry } = await started({ raids: true, stops: STOPS, partiesDown: true });
    registry.set('research', false);
    expect([...raids.reportStops()]).toEqual(['stop-5']);
  });

  // Review round 2, R1: drawn with the reports alone, the map has not had its first list of
  // parties yet; that list asks for the posts in view alone (review N6), and until it comes the
  // list of what is on does not say that nothing is on.
  it("keeps the parties' first list for when it comes after the reports", async () => {
    const { asked, nextDraw, releaseParties } = await started({
      raids: true,
      stops: STOPS,
      partiesLate: true,
      // Library (40.441) in view, Lake Gazebo (40.45) beyond it.
      inView: ([lat]) => lat < 40.445,
      parties: view({
        raids: [{ ...raidAt(1), postKey: 'a' }],
        maxes: [{ ...battle('x1', 'spot-1', 40.45, -79.94), postKey: 'b' }],
      }),
    });
    expect(fake.list.partiesKnown?.()).toBe(false);
    const drawn = nextDraw();
    releaseParties();
    await drawn;
    expect(asked.filter((url) => url.includes('/post?'))).toEqual([
      '/s/100000000000000001/api/parties/r1/post?k=a',
    ]);
    expect(fake.list.partiesKnown?.()).toBe(true);
  });

  // B9: a stop with reports is pickable in the Report button's step 2 of a report at a stop.
  it("takes a stop's marker in research's step 2 as its stop, and step 3 opens there", async () => {
    const { markerOf, raids, chooseReport, panel } = await started({ raids: true, stops: STOPS });
    chooseReport('research');
    expect(raids.forcedPlaces('stops')).toBe(true);
    // Its marker takes taps while stops are picked.
    expect(markerOf('Yellow Mural 5')?.options.interactive).toBe(true);
    markerOf('Yellow Mural 5')?.fire('click', {});
    expect(raids.forcedPlaces('stops')).toBe(false);
    // Field research's form in the stop's popup, in the place of its control, with the stop.
    expect(fake.shown.popupOf === markerOf('Yellow Mural 5')).toBe(true);
    expect(panel.querySelector('div.research-form')).toBeNull();
    const form = popupNow()?.querySelector('div.research-form');
    expect(
      form
        ?.querySelector('span.stop-chip')
        ?.all()
        .map((one) => one.textContent),
    ).toContain('Yellow Mural 5');
    form?.querySelector('button[data-cancel]')?.dispatch('click');
    expect(popupNow()?.querySelector('div.research-form')).toBeNull();
    expect(popupNow()?.querySelector('button[data-report-research]')).not.toBeNull();
    // Team GO Rocket's in the stop's popup, in place of its "Report Rocket here" (B8).
    fake.shown.popupOf?.closePopup();
    chooseReport('rocket');
    markerOf('Yellow Mural 5')?.fire('click', {});
    expect(fake.shown.popupOf).toBe(markerOf('Yellow Mural 5'));
    // While gyms are picked it lets taps through, as the rings do.
    fake.shown.popupOf?.closePopup();
    chooseReport('raid');
    expect(markerOf('Yellow Mural 5')?.options.interactive).toBe(false);
  });

  // Goal 7: "Add stops…" picks stops on the map, a stop with reports by its marker.
  it('adds stops to the research form by their markers and dots while it adds, and only then', async () => {
    const { markerOf, raids, chooseReport, panel } = await started({ raids: true, stops: STOPS });
    chooseReport('research');
    markerOf('Yellow Mural 5')?.fire('click', {});
    const chips = () =>
      panel.querySelectorAll('span.stop-chip').map((chip) => chip.all()[0]?.textContent);
    expect(raids.forcedPlaces('stops')).toBe(false);
    addStopsInPopup();
    expect(raids.forcedPlaces('stops')).toBe(true);
    expect(markerOf('Yellow Mural 7')?.options.interactive).toBe(true);
    markerOf('Yellow Mural 7')?.fire('click', {});
    expect(raids.stopTapped({ id: 'stop-9', title: 'Blue Bench', lat: 40.45, lon: -79.95 })).toBe(
      true,
    );
    expect(chips()).toEqual(['Yellow Mural 5', 'Yellow Mural 7', 'Blue Bench']);
    expect(fake.shown.popupOf).toBeUndefined();
    panel.querySelector('button[data-add-stops="done"]')?.dispatch('click');
    expect(raids.forcedPlaces('stops')).toBe(false);
    expect(raids.stopTapped({ id: 'stop-10', title: 'Red Bench', lat: 40.45, lon: -79.95 })).toBe(
      false,
    );
  });

  // Review F9: dimmed while "Add stops…" picks, as in the Report button's step 2 (review B7b).
  it("takes a raid's or a battle's tap and does nothing while stops are added", async () => {
    const { markerOf, raids, chooseReport, panel } = await started({ raids: true, stops: STOPS });
    chooseReport('research');
    markerOf('Yellow Mural 5')?.fire('click', {});
    addStopsInPopup();
    for (const title of ['Level 5 raid against Yveltal', spotBattle().title]) {
      // Drawn as running (review round 2, R3: by the clock of this describe, not the one the
      // file was loaded at).
      const icon = markerOf(title)?.options.icon as { options: { html: PageElement } } | undefined;
      expect(icon?.options.html.classList.contains('dim'), title).toBe(false);
      markerOf(title)?.fire('click', {});
      // Compared, not printed: the fakes are no page chai can show.
      expect(fake.shown.popupOf === undefined, title).toBe(true);
    }
    expect(raids.forcedPlaces('stops')).toBe(true);
    // Done adding: a raid's tap opens it again.
    panel.querySelector('button[data-add-stops="done"]')?.dispatch('click');
    markerOf('Level 5 raid against Yveltal')?.fire('click', {});
    expect(fake.shown.popupOf === markerOf('Level 5 raid against Yveltal')).toBe(true);
  });

  // Review round 2, R2: a meetup's ring lets taps through while "Add stops…" picks (Leaflet gives
  // a layer that is not interactive no click), as while a meetup's place is picked.
  it("lets a meetup ring's taps through while stops are added, and only then", async () => {
    const meetup: MapMeetup = {
      kind: 'meetup',
      id: 'm2',
      name: 'Walk by the river',
      startTime: null,
      endTime: null,
      link: 'https://discord.com/channels/1/2/7',
      attendance: attendance(),
      postKey: null,
      place: { kind: 'pin', words: 'At a pin', lat: 40.452, lon: -79.96, gymId: null, at: null },
      info: null,
      panel: null,
    };
    const { markerOf, chooseReport, panel } = await started({
      raids: true,
      stops: STOPS,
      parties: view({ meetups: [meetup] }),
    });
    const ringTaken = () =>
      fake.shown.circles.findLast(
        (circle) => circle.options.pane === 'rings' && (circle.at as number[])[0] === 40.452,
      )?.options.interactive;
    expect(ringTaken()).toBe(true);
    chooseReport('research');
    markerOf('Yellow Mural 5')?.fire('click', {});
    expect(ringTaken()).toBe(true);
    addStopsInPopup();
    expect(ringTaken()).toBe(false);
    panel.querySelector('button[data-add-stops="done"]')?.dispatch('click');
    expect(ringTaken()).toBe(true);
  });

  // Review F3: a keystroke keeps the search field (an IME's word, a phone's keyboard) and draws
  // the task list alone; a report on its way keeps its buttons off, whatever draws the form.
  it('keeps the search field as it is typed in, and the buttons off while a report is sent', async () => {
    const { markerOf, chooseReport, panel } = await started({
      raids: true,
      stops: STOPS,
      research: caseResearchOptions(),
      sendsForever: true,
    });
    // The lists come, and the search field takes the focus (step 3 of the Report button).
    const search = new Promise<PageElement>((resolve) => {
      page.focused = (element) => {
        if (element.getAttribute('name') === 'query') resolve(element);
      };
    });
    chooseReport('research');
    markerOf('Yellow Mural 5')?.fire('click', {});
    const field = await search;
    // Typed in: the page's own field.
    vi.stubGlobal('HTMLInputElement', PageElement);
    Object.assign(field, { name: 'query', value: 'spin' });
    const fitted = fake.shown.popupOf?.updates ?? 0;
    field.dispatch('input');
    // The list changed its height: the popup fits it (review, finding 12), which takes its
    // content out of the page and puts it back: the field keeps the focus for the next key.
    expect(fake.shown.popupOf?.updates).toBe(fitted + 1);
    expect(page.active === field).toBe(true);
    // Not in the middle of an IME's word, which its going out of the page would cut.
    field.dispatch('input', { isComposing: true });
    expect(fake.shown.popupOf?.updates).toBe(fitted + 1);
    // Compared, not printed: the fakes are no page chai can show.
    const inPopup = popupNow();
    expect(inPopup?.querySelector('input[name="query"]') === field).toBe(true);
    expect(inPopup?.querySelectorAll('button[data-task]').map((one) => one.dataset.task)).toEqual([
      'spin',
    ]);
    // Reported, its answer still to come: a stop added meanwhile draws the form again.
    inPopup?.querySelector('button[data-task="spin"]')?.dispatch('click');
    addStopsInPopup();
    panel.querySelector('button[data-submit="research"]')?.dispatch('click');
    markerOf('Yellow Mural 7')?.fire('click', {});
    const submit = panel.querySelector('button[data-submit="research"]');
    expect(submit?.disabled === true || submit?.getAttribute('disabled') !== null).toBe(true);
  });

  // Re-review 2, 3: only a form in a popup fits one, and it fits once a word is composed.
  it('fits no popup for a form in the side pane, and fits its own once composition ends', async () => {
    const { markerOf, chooseReport, panel } = await started({
      raids: true,
      stops: STOPS,
      research: caseResearchOptions(),
    });
    const search = new Promise<PageElement>((resolve) => {
      page.focused = (element) => {
        if (element.getAttribute('name') === 'query') resolve(element);
      };
    });
    chooseReport('research');
    markerOf('Yellow Mural 5')?.fire('click', {});
    const field = await search;
    vi.stubGlobal('HTMLInputElement', PageElement);
    Object.assign(field, { name: 'query', value: 'spin' });
    field.dispatch('input', { isComposing: true });
    const fitted = fake.shown.popupOf?.updates ?? 0;
    field.dispatch('compositionend');
    expect(fake.shown.popupOf?.updates).toBe(fitted + 1);
    // In the side pane, another popup open beside it.
    addStopsInPopup();
    panel.querySelector('button[data-add-stops="done"]')?.dispatch('click');
    markerOf('Yellow Mural 7')?.fire('click', {});
    const other = fake.shown.popupOf;
    expect(other === markerOf('Yellow Mural 7')).toBe(true);
    const before = other?.updates ?? 0;
    const inPane = panel.querySelector('input[name="query"]');
    Object.assign(inPane ?? {}, { name: 'query', value: 'spi' });
    inPane?.dispatch('input');
    inPane?.dispatch('compositionend');
    expect(other?.updates).toBe(before);
  });

  // Re-review X3: stops tapped before the lists came are taken; when the lists say fewer, the form
  // says how many a report names, not the server's generic refusal at Report.
  it('says how many stops a report names when the lists come after more were tapped', async () => {
    const { markerOf, chooseReport, panel, raids } = await started({
      raids: true,
      stops: STOPS,
      research: caseResearchOptions({ maxStops: 5 }),
    });
    const search = new Promise<PageElement>((resolve) => {
      page.focused = (element) => {
        if (element.getAttribute('name') === 'query') resolve(element);
      };
    });
    chooseReport('research');
    markerOf('Yellow Mural 5')?.fire('click', {});
    addStopsInPopup();
    for (const n of [20, 21, 22, 23, 24]) {
      raids.stopTapped({
        id: `stop-${String(n)}`,
        title: `Bench ${String(n)}`,
        lat: 40.45,
        lon: -79.95,
      });
    }
    expect(panel.querySelectorAll('span.stop-chip')).toHaveLength(6);
    await search;
    const answer = panel.querySelector('.form-answer');
    expect(answer?.textContent).toBe('A report names 5 stops at most.');
    expect(answer?.hidden).toBe(false);
    expect(panel.querySelector('button[data-add-stops="start"]')).toBeNull();
  });

  // "Same task at more stops…" from a report's popup, refused (here: a stop gone): the form stays
  // with the server's words, and the map no longer looks as if it picked stops.
  it('stops picking stops on the map when a report from "Add stops…" is refused', async () => {
    const { markerOf, raids, panel, container, nextDraw } = await started({
      raids: true,
      stops: STOPS,
    });
    const marker = markerOf('Yellow Mural 5');
    marker?.fire('click', {});
    const popup = (marker?.content as (() => PageElement) | undefined)?.();
    popup?.querySelector('button[data-same-task]')?.dispatch('click');
    expect(container.classList.contains('report-picking')).toBe(true);
    markerOf('Yellow Mural 7')?.fire('click', {});
    const drawn = nextDraw();
    panel.querySelector('button[data-submit="research"]')?.dispatch('click');
    await drawn;
    expect(raids.forcedPlaces('stops')).toBe(false);
    expect(container.classList.contains('report-picking')).toBe(false);
    expect(panel.querySelector('div.research-form')).not.toBeNull();
  });

  // Branch review W6: "Add stops…" (here at once, "Same task at more stops…") zooms the map in to
  // where the PokéStops are drawn, as step 2 does, says to zoom in while none are, and lists the
  // nearest as buttons, a way to add them without the map. Re-review X2 (Matt, 2026-10-27): to the
  // form's last stop, here the report's own until another is added, the nearest measured from it.
  it('zooms in to the last stop and lists the nearest to it, each added by its button', async () => {
    const { markerOf, panel, flights, flightZooms, fire, stopsCame } = await started({
      raids: true,
      stops: STOPS,
      zoom: 13,
    });
    const marker = markerOf('Yellow Mural 5');
    marker?.fire('click', {});
    const popup = (marker?.content as (() => PageElement) | undefined)?.();
    popup?.querySelector('button[data-same-task]')?.dispatch('click');
    // The report's stop (Yellow Mural 5), at the zoom the PokéStops are drawn from.
    expect(flights).toEqual([[caseStop(5).lat, caseStop(5).lon]]);
    expect(flightZooms).toEqual([16]);
    const words = () =>
      panel
        .querySelector('div.research-form')
        ?.all()
        .map((one) => one.textContent);
    expect(words()).toContain('Finding the nearest…');
    // On its way the map passes zooms the PokéStops are not drawn from: nothing said.
    stopsCame('zoom');
    expect(words()).not.toContain('Zoom in to see the PokéStops near here.');
    fire('moveend', {});
    stopsCame('zoom');
    expect(words()).toContain('Zoom in to see the PokéStops near here.');
    // From the map's middle (40.44) Blue, Green, Red; from the report's stop (40.445) Red, Green,
    // Blue. The report's own stop is no stop to add.
    stopsCame([
      { id: 'stop-5', title: 'Yellow Mural 5', lat: 40.445, lon: -79.95 },
      { id: 'stop-9', title: 'Blue Bench', lat: 40.4405, lon: -79.95 },
      { id: 'stop-10', title: 'Red Bench', lat: 40.446, lon: -79.95 },
      { id: 'stop-11', title: 'Green Bench', lat: 40.443, lon: -79.95 },
    ]);
    const near = () =>
      panel
        .querySelectorAll('button[data-report-near]')
        .map((one) => one.getAttribute('data-report-near'));
    expect(near()).toEqual(['stop-10', 'stop-11', 'stop-9']);
    panel.querySelector('button[data-report-near="stop-11"]')?.dispatch('click');
    expect(
      panel.querySelectorAll('span.stop-chip').map((chip) => chip.all()[0]?.textContent),
    ).toEqual(['Green Bench']);
    // An added stop is listed no more, the rest measured from it now (Blue is nearer Green than
    // Red is); the focus on the first, for the keyboard.
    expect(near()).toEqual(['stop-9', 'stop-10']);
    expect(page.active?.getAttribute('data-report-near')).toBe('stop-9');
  });

  it('offers a meetup at a PokéStop, the form in its popup, the stop its place', async () => {
    const { markerOf, panel, raids } = await started({
      raids: true,
      regions: REGIONS,
      stops: STOPS,
    });
    markerOf('Yellow Mural 5')?.fire('click', {});
    popupNow()?.querySelector('button[data-meetup-at-stop]')?.dispatch('click');
    expect(panel.querySelector('[data-form="meetup"]')).toBeNull();
    const form = popupNow()?.querySelector('[data-form="meetup"]');
    expect(form?.querySelector('.picked')?.textContent).toBe('Yellow Mural 5 (PokéStop)');
    // Never at a Power Spot (Matt, 2026-10-17): it offers a train, no meetup.
    const spot = { id: 'abc', title: 'Old Mill', lat: 40.44, lon: -79.95 };
    const atSpot = placeShowing('party-card', raids.spotControls(spot));
    expect(atSpot.querySelector('button[data-train-here]')).not.toBeNull();
    expect(atSpot.querySelector('button[data-meetup-here]')).toBeNull();
    expect(atSpot.querySelector('button[data-meetup-at-stop]')).toBeNull();
  });

  // Re-review X2: "Add stops…" zooms to the form's last stop, the map's middle while it has none.
  it('zooms to the last stop of the form as stops are added, the middle with none', async () => {
    const { markerOf, panel, flights } = await started({ raids: true, stops: STOPS });
    markerOf('Yellow Mural 5')?.fire('click', {});
    popupNow()?.querySelector('button[data-report-research]')?.dispatch('click');
    addStopsInPopup();
    expect(flights.at(-1)).toEqual([caseStop(5).lat, caseStop(5).lon]);
    markerOf('Yellow Mural 7')?.fire('click', {});
    panel.querySelector('button[data-add-stops="done"]')?.dispatch('click');
    panel.querySelector('button[data-add-stops="start"]')?.dispatch('click');
    expect(flights.at(-1)).toEqual([caseStop(7).lat, caseStop(7).lon]);
    panel.querySelector('button[data-add-stops="done"]')?.dispatch('click');
    for (const key of ['stop-5', 'stop-7']) {
      panel.querySelector(`button[data-remove-stop="${key}"]`)?.dispatch('click');
    }
    expect(panel.querySelectorAll('span.stop-chip')).toEqual([]);
    panel.querySelector('button[data-add-stops="start"]')?.dispatch('click');
    expect(flights.at(-1)).toEqual([40.44, -79.95]);
    expect(flights).toHaveLength(3);
  });

  // B3: a report and a party at one stop, one tap lists both.
  it('lists a meetup at a stop and its reports for a tap on either', async () => {
    const at = caseStop(5);
    const meetup: MapMeetup = {
      kind: 'meetup',
      id: 'm1',
      name: 'Picnic at the mural',
      startTime: null,
      endTime: null,
      link: 'https://discord.com/channels/1/2/6',
      attendance: attendance(),
      postKey: null,
      place: {
        kind: 'stop',
        words: `At ${at.name}`,
        lat: at.lat,
        lon: at.lon,
        gymId: null,
        at: { key: `stop:${at.key}`, name: at.name },
      },
      info: null,
      panel: null,
    };
    const { markerOf } = await started({
      raids: true,
      stops: STOPS,
      parties: view({ meetups: [meetup] }),
    });
    markerOf('Yellow Mural 5')?.fire('click', {});
    expect(fake.shown.popupOf).toBeUndefined();
    const list = fake.placeList.at(-1) as PageElement | undefined;
    expect(
      list?.querySelectorAll('button[data-open]').map((choice) => choice.dataset.open),
    ).toEqual(['stop:stop-5', 'meetup:m1']);
    // Plan 8M-15: the meetup is at the stop by its key, so the list is headed with the stop's
    // name and has no "Also nearby".
    expect(list?.querySelector('strong.name')?.textContent).toBe(at.name);
    expect(list?.querySelectorAll('span.also-nearby').map((one) => one.textContent)).toEqual([]);
    // Alone at its stop: its own popup.
    markerOf('Yellow Mural 7')?.fire('click', {});
    expect(fake.shown.popupOf).toBe(markerOf('Yellow Mural 7'));
  });

  // Plan 8M-15 (design 1): a gym's dot names its place, so its list is headed with the gym and
  // its raid and meetup come before what is only near it.
  it("heads a gym dot's list with the gym, its meetup first, then Also nearby", async () => {
    const library = GYMS.get(1);
    if (!library) throw new Error('the test gym');
    const meetupAt = (id: string, lon: number, gymId: number | null): MapMeetup => ({
      kind: 'meetup',
      id,
      name: id === 'm1' ? 'Picnic' : 'Walk',
      startTime: null,
      endTime: null,
      link: 'https://discord.com/channels/1/2/6',
      attendance: attendance(),
      postKey: null,
      place: {
        kind: gymId === null ? 'pin' : 'gym',
        words: 'At it',
        lat: library.lat,
        lon,
        gymId,
        at: gymId === null ? null : { key: `gym:${String(gymId)}`, name: library.name },
      },
      info: null,
      panel: null,
    });
    const { raids } = await started({
      raids: true,
      // A pin's walk a pixel off the gym, then the gym's picnic.
      parties: view({
        meetups: [meetupAt('m2', library.lon + 1 / 10_000, null), meetupAt('m1', library.lon, 1)],
      }),
    });
    raids.gymTapped(library, () => undefined);
    const list = fake.placeList.at(-1) as PageElement | undefined;
    expect(list?.querySelector('strong.name')?.textContent).toBe(library.name);
    expect(
      list
        ?.querySelector('div.choices')
        ?.childNodes.map((one) => one.dataset.open ?? one.textContent),
      // The dot's own choice, the gym's raid and its meetup; the pin's walk only near it.
    ).toEqual(['gym-dot:1', 'gym:1', 'meetup:m1', 'Also nearby', 'meetup:m2']);
  });

  // Matt, 2026-10-30: a dot under a ring is at one place with what the ring marks, as a gym's is.
  describe("a PokéStop's or Power Spot's dot among other things", () => {
    const meetupAt = (kind: 'stop' | 'powerspot', key: string): MapMeetup => ({
      kind: 'meetup',
      id: 'm1',
      name: 'Picnic',
      startTime: null,
      endTime: null,
      link: 'https://discord.com/channels/1/2/6',
      attendance: attendance(),
      postKey: null,
      place: {
        kind,
        words: 'At it',
        lat: 40.5,
        lon: -79.5,
        gymId: null,
        at: { key, name: 'The Bench' },
      },
      info: null,
      panel: null,
    });
    const dot = { id: 'bench', title: 'The Bench', lat: 40.5, lon: -79.5 };
    const choices = () =>
      (fake.placeList.at(-1) as PageElement | undefined)
        ?.querySelectorAll('button[data-open]')
        .map((choice) => choice.dataset.open);

    it("lists a stop's dot with the meetup at it, headed with the stop", async () => {
      const { raids } = await started({
        raids: false,
        parties: view({ meetups: [meetupAt('stop', 'stop:bench')] }),
      });
      const own = vi.fn();
      raids.placeTapped('stops', dot, own);
      expect(own).not.toHaveBeenCalled();
      expect(choices()).toEqual(['stop-dot:bench', 'meetup:m1']);
      expect(
        (fake.placeList.at(-1) as PageElement | undefined)?.querySelector('strong.name')
          ?.textContent,
      ).toBe('The Bench');
    });

    it("lists a Power Spot's dot with the meetup at it", async () => {
      const { raids } = await started({
        raids: false,
        parties: view({ meetups: [meetupAt('powerspot', 'spot:bench')] }),
      });
      raids.placeTapped('spots', dot, () => undefined);
      expect(choices()).toEqual(['spot-dot:bench', 'meetup:m1']);
    });

    // Review R6: the dot's own choice in the list.
    it("opens the dot's own popup from its choice in the list", async () => {
      const { raids } = await started({
        raids: false,
        parties: view({ meetups: [meetupAt('stop', 'stop:bench')] }),
      });
      const own = vi.fn();
      raids.placeTapped('stops', dot, own);
      (fake.placeList.at(-1) as PageElement | undefined)
        ?.querySelector('button[data-open="stop-dot:bench"]')
        ?.dispatch('click');
      expect(own).toHaveBeenCalledTimes(1);
    });

    // Review R2: while a place is picked the rings let taps through, and so does the dot's list.
    it('lists nothing while a place is being picked', async () => {
      const { raids, chooseReport } = await started({
        raids: true,
        parties: view({ meetups: [meetupAt('stop', 'stop:bench')], maxes: [] }),
      });
      chooseReport('raid');
      const before = fake.placeList.length;
      const own = vi.fn();
      raids.placeTapped('spots', dot, own);
      expect(own).toHaveBeenCalledTimes(1);
      expect(fake.placeList).toHaveLength(before);
    });

    // Review R4: with the Raids layer off a spot's dot is drawn though a battle stands, and opens it.
    it("names a Power Spot's choice by the battle that stands there", async () => {
      const standing = battle('x1', 'bench', 40.5, -79.5);
      const { raids } = await started({
        raids: false,
        parties: view({ meetups: [meetupAt('powerspot', 'spot:bench')], maxes: [standing] }),
      });
      raids.placeTapped('spots', dot, () => undefined);
      const choice = (fake.placeList.at(-1) as PageElement | undefined)?.querySelector(
        'button[data-open="spot-dot:bench"]',
      );
      expect(choice?.querySelector('span.what')?.textContent).toBe(standing.title);
    });

    // Review R3: Find's pick of a place answers as a tap on its dot.
    it("lists what shares a stop's place when Find picks the stop", async () => {
      const { raids, fire } = await started({
        raids: true,
        parties: view({ meetups: [meetupAt('stop', 'stop:bench')], raids: [], maxes: [] }),
        found: [{ kind: 'stop', id: dot.id, name: dot.title, lat: dot.lat, lon: dot.lon }],
      });
      raids.find('bench');
      raids.findFirst();
      await new Promise<void>((resolve) => fake.renders.push(resolve));
      fire('moveend', {});
      expect(choices()).toEqual(['stop-dot:bench', 'meetup:m1']);
    });

    it('opens its own popup where nothing else is', async () => {
      const { raids } = await started({ raids: false, parties: view({}) });
      const own = vi.fn();
      raids.placeTapped('stops', dot, own);
      expect(own).toHaveBeenCalledTimes(1);
    });
  });

  // Review F10: the pick lists asked for as a filter opens, each time (the browser asks again by
  // their ETag), a failed answer not kept for good.
  it("asks for the pick lists each time a layer's filter opens, after a failure too", async () => {
    const { asked, panel } = await started({ raids: true, stops: STOPS });
    // No field is typed in here: the filters' checkboxes are none of these buttons.
    vi.stubGlobal('HTMLInputElement', class {});
    const list = panel.querySelector('section.what-is-on');
    /** A control of the list's research group, pressed. */
    const press = (data: string): void => {
      const button = new PageElement('button');
      button.setAttribute(data, 'research');
      list?.append(button);
      button.dispatch('click');
    };
    const lists = () => asked.filter((url) => url.endsWith('/api/research-options')).length;
    press('data-filter-open');
    // The lists' answers (refused here) drawn into the list.
    await new Promise<void>((resolve) => {
      fake.renders.push(resolve);
    });
    expect(lists()).toBe(1);
    press('data-filter-done');
    press('data-filter-open');
    expect(lists()).toBe(2);
  });
});

describe("Find's pick on the map (plan 8M-12)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(CASE_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("turns a report's layer on, flies there and opens its stop's popup", async () => {
    const { raids, registry, flights, fire, markerOf } = await started({
      raids: true,
      stops: caseView({ research: [caseResearch(5)], grunts: [caseGrunt(7)] }),
      layers: { research: false },
    });
    expect(markerOf('Yellow Mural 5')?.group?.onMap).not.toBe(true);
    // Enter in the box: searched at once, the first line found picked, the map as it was meanwhile.
    raids.find('dragon');
    raids.findFirst();
    expect(registry.isOn('research')).toBe(true);
    expect(flights).toEqual([[caseStop(5).lat, caseStop(5).lon]]);
    fire('moveend', {});
    expect(fake.shown.popupOf).toBe(markerOf('Yellow Mural 5'));
  });

  it('draws nothing anew while typing: the map moves only at a pick', async () => {
    const { raids, flights, drawCount } = await started({
      raids: true,
      stops: caseView({ research: [caseResearch(5)] }),
    });
    const draws = drawCount();
    raids.find('dra');
    raids.find('drag');
    expect(drawCount()).toBe(draws);
    expect(flights).toEqual([]);
  });

  // Review F1 and ruling R1: on a phone the list opens as a search begins; a pick hides the box,
  // and the places that come after it open nothing again.
  it('opens the list as a search begins, never when its places come after a pick', async () => {
    const { raids, frameTold } = await started({
      raids: true,
      phone: true,
      stops: caseView({ research: [caseResearch(5)] }),
    });
    raids.find('dragon');
    raids.findFirst();
    expect(frameTold.finding).toEqual([true]);
    expect(frameTold.picked).toBe(1);
    // The places' answer, which draws the results anew.
    await new Promise<void>((resolve) => fake.renders.push(resolve));
    expect(frameTold.finding).toEqual([true]);
    expect(raids.finding()).toBe(true);
    raids.find('');
    expect(frameTold.finding).toEqual([true, false]);
  });

  // Ruling R3: a place opens its own popup, its layer as it was (the Gyms layer is off by default).
  it("opens a place's own popup without turning its layer on", async () => {
    const found = [{ kind: 'gym', id: '1', name: 'Library', lat: 40.441, lon: -79.95 }];
    // No raid at the gym: its own popup.
    const plain = await started({
      raids: true,
      layers: { gyms: false },
      parties: view({ raids: [] }),
      found,
    });
    plain.raids.find('library');
    plain.raids.findFirst();
    // The places come, and the first is picked.
    await new Promise<void>((resolve) => fake.renders.push(resolve));
    expect(plain.flights).toEqual([[40.441, -79.95]]);
    plain.fire('moveend', {});
    expect(plain.frameTold.gyms).toEqual([1]);
    expect(plain.registry.isOn('gyms')).toBe(false);
    // A raid at the gym: the raid's popup, as a tap on the gym opens it (branch review BR-2).
    const raided = await started({ raids: true, layers: { gyms: false }, found });
    raided.raids.find('library');
    raided.raids.findFirst();
    await new Promise<void>((resolve) => fake.renders.push(resolve));
    raided.fire('moveend', {});
    expect(raided.frameTold.gyms).toEqual([]);
    expect(fake.shown.popupOf).toBe(raided.markerOf('Level 5 raid against Yveltal'));
  });

  // Ruling R4: a report a filter of its layer hides is shown by lifting that filter.
  it('lifts the filter that hides a report picked', async () => {
    const storage: Record<string, string> = {
      'pine-map-stop-filters': JSON.stringify({ research: ['item:rare-candy'], rocket: [] }),
    };
    const { raids, fire, markerOf } = await started({
      raids: true,
      storage,
      stops: caseView({ research: [caseResearch(5)] }),
    });
    expect(markerOf('Yellow Mural 5')?.group?.onMap).not.toBe(true);
    raids.find('dragon');
    raids.findFirst();
    expect(JSON.parse(storage['pine-map-stop-filters'] ?? '{}')).toEqual({
      research: [],
      rocket: [],
    });
    fire('moveend', {});
    expect(fake.shown.popupOf).toBe(markerOf('Yellow Mural 5'));
  });

  // Matt, 2026-10-30: a train reported from a gym or a Power Spot, with it as the first stop; if a
  // form can be anchored to a place, it is.
  it("offers Start train here in a gym's and a Power Spot's popup or card, the form in its place", async () => {
    const { raids, panel, card, markerOf, reportHeader } = await started({
      raids: true,
      phone: true,
      regions: REGIONS,
      parties: view({ raids: [raidAt(1)], maxes: [] }),
    });
    const spot = { id: 'abc', title: 'Old Mill', lat: 40.44, lon: -79.95 };
    markerOf(raidAt(1).heading)?.openPopup();
    expect(card()?.key).toBe('gym:1');
    const atSpot = placeShowing('party-card', raids.spotControls(spot));
    atSpot.querySelector('button[data-train-here]')?.dispatch('click');
    expect(card()?.key).toBe('gym:1');
    expect(panel.querySelector('[data-form="train"]')).toBeNull();
    const form = atSpot.querySelector('[data-form="train"]');
    expect(form?.querySelector('.first-stop')?.textContent).toBe(
      'First stop: Old Mill (Power Spot)',
    );
    form?.querySelector('button[data-cancel]')?.dispatch('click');
    expect(atSpot.querySelector('[data-form="train"]')).toBeNull();
    expect(atSpot.querySelector('button[data-train-here]')).not.toBeNull();
    expect(reportHeader()?.disabled).toBe(false);
    const gym = [...GYMS.values()][0];
    if (!gym) throw new Error('no gym');
    const atGym = placeShowing('party-card', raids.gymControls(gym));
    atGym.querySelector('button[data-train-here]')?.dispatch('click');
    expect(
      atGym.querySelector('[data-form="train"]')?.querySelector('.first-stop')?.textContent,
    ).toBe('First stop: Library');
  });

  // Review N3: the button under a raid's post, through the post's own clicks.
  it("opens the form in a raid's popup, its region filled in only where one region holds the gym", async () => {
    const oneRegion = await started({
      raids: true,
      regions: REGIONS,
      parties: view({ raids: [raidAt(1)], maxes: [] }),
    });
    const filledIn = (shown: typeof oneRegion) => {
      shown.markerOf(raidAt(1).heading)?.openPopup();
      popupNow()?.querySelector('button[data-train-here="1"]')?.dispatch('click');
      expect(shown.panel.querySelector('[data-form="train"]')).toBeNull();
      const form = popupNow()?.querySelector('[data-form="train"]');
      expect(form?.querySelector('.first-stop')?.textContent).toBe('First stop: Library');
      return form
        ?.querySelector('select[name="region"]')
        ?.querySelectorAll('option')
        .filter((one) => one.getAttribute('selected') !== null)
        .map((one) => one.getAttribute('value'));
    };
    expect(filledIn(oneRegion)).toEqual(['1']);
    const twoRegions = await started({
      raids: true,
      regions: [...REGIONS, { ...REGIONS[0], id: 2, name: 'shadyside' } as GeoView['regions'][0]],
      parties: view({ raids: [raidAt(1)], maxes: [] }),
    });
    expect(filledIn(twoRegions)).toEqual(['']);
  });

  describe('a form at its place, on the map (Matt, 2026-10-30)', () => {
    const LIBRARY = gym(1, 'Library', 40.441, -79.95);
    const STOPS_HERE = caseView({ research: [caseResearch(5)] });
    const notice = () => page.byId.get('notice-text')?.textContent;
    const FORM_OPEN = 'Close the form that is open first.';

    it('takes the clicks of the form of Hold meetup here as its own, and Cancel leaves the hold free', async () => {
      const { raids, panel, reportHeader } = await started({ raids: true, regions: REGIONS });
      const popup = placeShowing('leaflet-popup', raids.gymControls(LIBRARY));
      popup.querySelector('button[data-meetup-here]')?.dispatch('click');
      const form = popup.querySelector('[data-form="meetup"]');
      expect(form).not.toBeNull();
      expect(panel.querySelector('[data-form="meetup"]')).toBeNull();
      expect(reportHeader()?.disabled).toBe(true);
      // What is missing is said under it; no second form asked for.
      form?.querySelector('button[data-submit]')?.dispatch('click');
      expect(notice()).toBe('Give the meetup a name first.');
      expect(popup.querySelectorAll('[data-form="meetup"]')).toHaveLength(1);
      popup.querySelector('button[data-cancel]')?.dispatch('click');
      expect(popup.querySelector('[data-form="meetup"]')).toBeNull();
      expect(popup.querySelector('button[data-meetup-here]')).not.toBeNull();
      expect(notice()).not.toBe(FORM_OPEN);
      expect(reportHeader()?.disabled).toBe(false);
      expect(panel.querySelector('[data-form="meetup"]')).toBeNull();
    });

    it("a stop's research form: Cancel puts its button back, the hold free", async () => {
      const { markerOf, reportHeader } = await started({ raids: true, stops: STOPS_HERE });
      markerOf('Yellow Mural 5')?.fire('click', {});
      popupNow()?.querySelector('button[data-report-research]')?.dispatch('click');
      expect(popupNow()?.querySelector('div.research-form')).not.toBeNull();
      expect(reportHeader()?.disabled).toBe(true);
      popupNow()?.querySelector('button[data-cancel]')?.dispatch('click');
      expect(popupNow()?.querySelector('div.research-form')).toBeNull();
      expect(popupNow()?.querySelector('button[data-report-research]')).not.toBeNull();
      expect(reportHeader()?.disabled).toBe(false);
    });

    it('a popup closed takes the form with it and frees the hold', async () => {
      const { markerOf, reportHeader, panel } = await started({ raids: true, stops: STOPS_HERE });
      markerOf('Yellow Mural 5')?.fire('click', {});
      popupNow()?.querySelector('button[data-report-research]')?.dispatch('click');
      expect(reportHeader()?.disabled).toBe(true);
      fake.shown.popupOf?.closePopup();
      expect(reportHeader()?.disabled).toBe(false);
      expect(panel.querySelector('div.research-form')).toBeNull();
    });

    it('moves to the side pane to pick on the map, the popup closed, the hold kept', async () => {
      const { markerOf, reportHeader, panel, raids } = await started({
        raids: true,
        stops: STOPS_HERE,
        regions: REGIONS,
      });
      markerOf('Yellow Mural 5')?.fire('click', {});
      popupNow()?.querySelector('button[data-report-research]')?.dispatch('click');
      addStopsInPopup();
      expect(fake.shown.popupOf).toBeUndefined();
      expect(panel.querySelector('div.research-form')).not.toBeNull();
      expect(reportHeader()?.disabled).toBe(true);
      panel.querySelector('button[data-cancel]')?.dispatch('click');
      expect(reportHeader()?.disabled).toBe(false);
      const popup = placeShowing('leaflet-popup', raids.gymControls(LIBRARY));
      popup.querySelector('button[data-meetup-here]')?.dispatch('click');
      popup.querySelector('button[data-pick="start"]')?.dispatch('click');
      expect(panel.querySelector('[data-form="meetup"]')).not.toBeNull();
      expect(popup.querySelector('[data-form="meetup"]')).toBeNull();
      expect(reportHeader()?.disabled).toBe(true);
    });

    it("leaves no phone card over the pane when Pick on the map moves a meetup's form there", async () => {
      const { raids, panel, card, markerOf } = await started({
        raids: true,
        phone: true,
        regions: REGIONS,
        parties: view({ raids: [raidAt(1)], maxes: [] }),
      });
      markerOf(raidAt(1).heading)?.openPopup();
      expect(card()?.key).toBe('gym:1');
      const shown = placeShowing('party-card', raids.gymControls(LIBRARY));
      shown.querySelector('button[data-meetup-here]')?.dispatch('click');
      expect(card()?.key).toBe('gym:1');
      shown.querySelector('button[data-pick="start"]')?.dispatch('click');
      expect(card()?.key).toBeUndefined();
      expect(panel.querySelector('[data-form="meetup"]')).not.toBeNull();
    });
  });

  // Matt, 2026-10-30: Report stood out over the route editor and only said to close the form.
  it('offers no Report while a form is open, and offers it again after', async () => {
    const { panel, reportHeader } = await started({ raids: true });
    expect(reportHeader()?.disabled).toBe(false);
    panel.querySelector('button[data-new-train]')?.dispatch('click');
    expect(panel.querySelector('[data-form="train"]')).not.toBeNull();
    expect(reportHeader()?.disabled).toBe(true);
    panel.querySelector('button[data-cancel]')?.dispatch('click');
    expect(reportHeader()?.disabled).toBe(false);
  });

  // Review F6: a line Find found that the map did not open shows its stop's popup under it.
  it("draws a found report's stop under its line, and a place's own", async () => {
    await started({ raids: true, stops: caseView({ research: [caseResearch(5)] }) });
    const report = fake.list.detail?.({
      key: 'research:5',
      kind: 'research',
      id: '5',
      marker: 'stop:stop-5',
      name: 'Yellow Mural 5',
      place: 'Catch a Dragon-type Pokémon · Dratini',
      point: { lat: caseStop(5).lat, lon: caseStop(5).lon },
      picture: null,
      going: 0,
      soonest: null,
      times: {},
    }) as PageElement | undefined;
    expect(report?.getAttribute('data-stop')).toBe('stop-5');
    const place = fake.list.detail?.({
      key: 'place:stop:abc.16',
      kind: 'stops',
      id: 'abc.16',
      marker: null,
      name: 'Little Free Library',
      place: 'PokéStop',
      point: { lat: 40.45, lon: -79.95 },
      picture: null,
      going: 0,
      soonest: null,
      times: {},
    }) as PageElement | undefined;
    expect(place).toBeDefined();
  });

  // Design 2026-11-04 (review): Find's results and the list of what is on ask the spot's address.
  it("asks for a Power Spot's address under its line, and under its battle's", async () => {
    const { frameTold } = await started({ raids: true });
    const line = {
      marker: null,
      picture: null,
      going: 0,
      soonest: null,
      times: {},
    };
    const spot = fake.list.detail?.({
      ...line,
      key: 'place:powerspot:spot-7',
      kind: 'spots',
      id: 'spot-7',
      name: 'Bandstand',
      place: 'Power Spot',
      point: { lat: 40.46, lon: -79.93 },
    }) as PageElement | undefined;
    const battle = fake.list.detail?.({
      ...line,
      key: `max:${spotBattle().id}`,
      kind: 'raids',
      id: spotBattle().id,
      name: spotBattle().title,
      place: 'Lake Gazebo',
      point: { lat: 40.45, lon: -79.94 },
    }) as PageElement | undefined;
    expect(frameTold.addressed.map((asked) => asked.id)).toEqual(['spot-7', 'spot-1']);
    expect(frameTold.addressed[0]?.popup === spot).toBe(true);
    expect(frameTold.addressed[1]?.popup === battle).toBe(true);
  });

  // Branch review BR-1: while a gym is to be clicked (route mode, a meetup's place, the Report
  // button's step 2) or a form holds the pane, the box is "Find a gym" again and Find stays out.
  it('leaves the box to the gyms while a gym is to be clicked, and Find out', async () => {
    const { raids, chooseReport, panel, frameTold } = await started({
      raids: true,
      stops: caseView({ research: [caseResearch(5)] }),
    });
    expect(raids.findOff()).toBe(false);
    chooseReport('raid');
    expect(raids.forced()).toBe(true);
    expect(raids.findOff()).toBe(true);
    raids.find('dragon');
    raids.findFirst();
    expect(raids.finding()).toBe(false);
    expect(frameTold.finding).toEqual([]);
    // Step 2 canceled: Find again.
    panel.querySelector('button[data-cancel]')?.dispatch('click');
    expect(raids.findOff()).toBe(false);
    raids.find('dragon');
    raids.findFirst();
    expect(raids.finding()).toBe(true);
  });

  // Branch review BR-2: a place found by name opens what the map shows there, not a bare popup.
  it("opens the reports' popup of a stop found by name that holds a report", async () => {
    const { raids, flights, fire, markerOf, registry } = await started({
      raids: true,
      stops: caseView({ research: [caseResearch(5)] }),
      found: [
        {
          kind: 'stop',
          id: 'stop-5',
          name: 'Yellow Mural 5',
          lat: caseStop(5).lat,
          lon: caseStop(5).lon,
        },
      ],
    });
    raids.find('yellow');
    raids.findFirst();
    // The places come, and the first is picked.
    await new Promise<void>((resolve) => fake.renders.push(resolve));
    expect(flights).toEqual([[caseStop(5).lat, caseStop(5).lon]]);
    fire('moveend', {});
    expect(fake.shown.popupOf).toBe(markerOf('Yellow Mural 5'));
    // Ruling R3 holds: no layer turned on for a place.
    expect(registry.isOn('stops')).toBe(false);
  });

  // Re-review N1: a Find search held when a gym is to be clicked thins nothing; text typed
  // meanwhile does, and the box's text is Find's again once the mode ends.
  it('thins the gyms only by text typed while a gym is to be clicked, then empties the box', async () => {
    const { raids, chooseReport, panel, frameTold } = await started({
      raids: true,
      stops: caseView({ research: [caseResearch(5)] }),
    });
    frameTold.box = 'dragon';
    raids.find('dragon');
    raids.findFirst();
    expect(raids.finding()).toBe(true);
    chooseReport('raid');
    expect(raids.findOff()).toBe(true);
    // The search held: every gym is drawn to be tapped.
    expect(raids.boxThins()).toBe(false);
    // A word typed meanwhile is the gyms': it thins them, and Find's search ends.
    frameTold.box = 'library';
    raids.find('library');
    expect(raids.finding()).toBe(false);
    expect(raids.boxThins()).toBe(true);
    // Step 2 canceled: the word typed meanwhile was the gyms' (re-review M2), the box emptied.
    panel.querySelector('button[data-cancel]')?.dispatch('click');
    expect(raids.findOff()).toBe(false);
    expect(raids.boxThins()).toBe(false);
    expect(frameTold.box).toBe('');
    raids.findFirst();
    expect(raids.finding()).toBe(false);
  });

  // Re-review N2: the Raids layer off, a gym found by name opens its own popup.
  it('opens a gym with a raid by its own popup while the Raids layer is off', async () => {
    const found = [{ kind: 'gym', id: '1', name: 'Library', lat: 40.441, lon: -79.95 }];
    const { raids, fire, frameTold } = await started({
      raids: false,
      layers: { gyms: false },
      found,
    });
    raids.find('library');
    raids.findFirst();
    await new Promise<void>((resolve) => fake.renders.push(resolve));
    fire('moveend', {});
    expect(frameTold.gyms).toEqual([1]);
  });

  // Re-review M1: the gyms are drawn anew whenever whether the box thins them changes.
  it('tells the gyms at once when the first word typed during a mode thins them', async () => {
    const { raids, chooseReport, panel, frameTold } = await started({
      raids: true,
      stops: caseView({ research: [caseResearch(5)] }),
    });
    frameTold.box = 'dragon';
    raids.find('dragon');
    raids.findFirst();
    chooseReport('raid');
    expect(raids.boxThins()).toBe(false);
    const before = frameTold.boxChanged;
    frameTold.box = 'library';
    raids.find('library');
    expect(raids.boxThins()).toBe(true);
    expect(frameTold.boxChanged).toBe(before + 1);
    // A second word changes nothing of whether it thins: the dots' own listener draws them.
    raids.find('librar');
    expect(frameTold.boxChanged).toBe(before + 1);
    // The mode ends: the box no longer thins them, and they are told.
    panel.querySelector('button[data-cancel]')?.dispatch('click');
    expect(raids.boxThins()).toBe(false);
    expect(frameTold.boxChanged).toBe(before + 2);
  });

  // Re-review M2 (the controller's ruling): text typed during a mode is a gym filter, emptied
  // when the mode ends; a Find search held through the mode is given back.
  it('empties the box of text typed during a mode, and gives a held search back', async () => {
    const { raids, chooseReport, panel, frameTold } = await started({
      raids: true,
      phone: true,
      stops: caseView({ research: [caseResearch(5)] }),
    });
    // Typed during the mode: emptied after it, no search, no sheet.
    chooseReport('raid');
    frameTold.box = 'library';
    raids.find('library');
    panel.querySelector('button[data-cancel]')?.dispatch('click');
    expect(frameTold.cleared).toBe(1);
    expect(frameTold.box).toBe('');
    raids.findFirst();
    expect(raids.finding()).toBe(false);
    expect(frameTold.finding).toEqual([]);
    // Held through the mode: given back to Find.
    frameTold.box = 'dragon';
    raids.find('dragon');
    raids.findFirst();
    expect(raids.finding()).toBe(true);
    chooseReport('raid');
    panel.querySelector('button[data-cancel]')?.dispatch('click');
    expect(frameTold.cleared).toBe(1);
    expect(raids.finding()).toBe(true);
  });
});

describe('the live stream in the page', () => {
  const GUILD = '100000000000000001';

  class FakeEventSource {
    static made: FakeEventSource[] = [];
    closed = false;
    onerror: (() => void) | null = null;
    readonly listeners = new Map<string, (event: { data: string }) => void>();
    constructor(readonly url: string) {
      FakeEventSource.made.push(this);
    }
    addEventListener(type: string, listener: (event: { data: string }) => void): void {
      this.listeners.set(type, listener);
    }
    close(): void {
      this.closed = true;
    }
    say(type: 'ping' | 'changed', data: string): void {
      this.listeners.get(type)?.({ data });
    }
  }

  const liveMap = async () => {
    FakeEventSource.made = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const shown = await started({ raids: true });
    // Hidden as the harness starts: shown, as a page is.
    page.visibility = 'visible';
    for (const listener of page.listeners.get('visibilitychange') ?? []) listener({});
    const stream = FakeEventSource.made[0];
    if (!stream) throw new Error('no stream was opened');
    const lists = () =>
      shown.asked.filter(
        (url) => url.endsWith('/api/parties') || url.endsWith('/api/stop-reports'),
      );
    return { ...shown, stream, lists };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the server’s stream with the pollers', async () => {
    const { stream } = await liveMap();
    expect(stream.url).toBe(`/s/${GUILD}/api/live`);
  });

  it('asks for the list a signal names, inside its spread', async () => {
    const { stream, runTimers, lists } = await liveMap();
    const before = lists().length;
    stream.say('changed', 'parties 4000');
    expect(lists()).toHaveLength(before);
    expect(runTimers(2_000)).toBe(1);
    expect(lists().slice(before)).toEqual([`/s/${GUILD}/api/parties`]);
  });

  it('asks for the reports at stops on their signal', async () => {
    const { stream, runTimers, lists } = await liveMap();
    const before = lists().length;
    stream.say('changed', 'stop-reports 1000');
    expect(runTimers(500)).toBe(1);
    expect(lists().slice(before)).toEqual([`/s/${GUILD}/api/stop-reports`]);
  });

  it('gives both lists’ questions a time limit past the queue’s tail', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { timeLimited } = await started({ raids: true, stops: caseView() });
    expect(timeout).toHaveBeenCalledWith(LIST_ASK_LIMIT_MS);
    expect(LIST_ASK_LIMIT_MS).toBeGreaterThanOrEqual(130_000);
    expect(timeLimited).toEqual([`/s/${GUILD}/api/parties`, `/s/${GUILD}/api/stop-reports`]);
  });

  it('asks the posts a signal’s list changed inside its spread', async () => {
    const keyed = (key: string) =>
      view({
        raids: [1, 2, 3].map((n) => ({ ...raidAt(n), id: `r${n}`, postKey: `${key}${n}` })),
      });
    FakeEventSource.made = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const shown = await started({ raids: true, parties: keyed('a') });
    const posts = (key: string) =>
      shown.asked.filter((url) => url.includes('/post?') && url.includes(`k=${key}`));
    page.visibility = 'visible';
    for (const listener of page.listeners.get('visibilitychange') ?? []) listener({});
    const stream = FakeEventSource.made[0];
    if (!stream) throw new Error('no stream was opened');
    shown.listing(keyed('b'));
    const drawn = shown.nextDraw();
    stream.say('changed', 'parties 4000');
    expect(shown.runTimers(2_000)).toBe(1);
    await drawn;
    // None yet of the three: each waits its share of the spread (the random here: half of it).
    expect(posts('b')).toEqual([]);
    expect(shown.runTimers(2_000)).toBe(3);
    expect(posts('b')).toHaveLength(3);
  });

  it('asks a list’s posts at once where no signal caused it, as a press’s list', async () => {
    const keyed = (key: string) =>
      view({
        raids: [1, 2, 3].map((n) => ({ ...raidAt(n), id: `r${n}`, postKey: `${key}${n}` })),
      });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const shown = await started({ raids: true, parties: keyed('a') });
    await shown.poll(keyed('c'));
    expect(shown.asked.filter((url) => url.includes('k=c'))).toHaveLength(3);
  });

  it('keeps a member’s group choice when the list is drawn anew', async () => {
    const picking: MapRaid = {
      ...raidAt(1),
      attendance: {
        ...attendance(),
        pick: [{ label: 'Any group with room' }, { group: 'B', label: 'Group B' }],
      },
    };
    const { markerOf, poll } = await started({ raids: true, parties: view({ raids: [picking] }) });
    markerOf(picking.heading)?.openPopup();
    const menu = popupNow()?.querySelector('select[data-group-pick]');
    if (!menu) throw new Error('no menu is drawn');
    menu.value = 'B';
    menu.dispatch('change');
    await poll(view({ raids: [{ ...picking, endTime: (picking.endTime ?? 0) + 60_000 }] }));
    markerOf(picking.heading)?.openPopup();
    expect(popupNow()?.querySelector('select[data-group-pick]')?.value).toBe('B');
  });

  it('closes the stream while the page is hidden', async () => {
    const { stream } = await liveMap();
    stream.say('ping', '1000');
    page.visibility = 'hidden';
    for (const listener of page.listeners.get('visibilitychange') ?? []) listener({});
    expect(stream.closed).toBe(true);
  });
});
