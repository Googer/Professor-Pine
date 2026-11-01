import type * as L from 'leaflet';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GYM_DOT,
  MEETUP_RING,
  RING_PANE,
  chooseRaid,
  gymClicks,
  showParties,
  trainMarker,
} from './party-layer.js';
import { LayerRegistry } from './layer-registry.js';
import { RING_TAP_PANE, TRAIN_LINE_PANE } from './panes.js';
import { formControls } from './raid-ui.js';

// Leaflet reads the browser's `window` as it loads: what `gymClicks` uses of it is how an event
// is stopped, recorded here; what `showParties` uses of it as it starts is a layer group added to
// the map; the circles drawn are recorded with their options. Isolated: a mocked module needs a
// module graph of its own.
const stopped = vi.hoisted(() => [] as unknown[]);
const renderers = vi.hoisted(() => [] as Record<string, unknown>[]);
const circles = vi.hoisted(
  () => [] as { at: [number, number]; options: Record<string, unknown> }[],
);
vi.mock('leaflet', () => ({
  DomEvent: {
    stop: (event: unknown) => {
      stopped.push(event);
    },
    disableClickPropagation: () => undefined,
  },
  // The Report button's control over the map (plan 8M-9A), added and never drawn here.
  Control: class {
    addTo() {
      return this;
    }
  },
  layerGroup: () => {
    const group = { addTo: () => group, clearLayers: () => group };
    return group;
  },
  circleMarker: (at: [number, number], options: Record<string, unknown>) => {
    circles.push({ at, options });
    return { at, options };
  },
  svg: (options: Record<string, unknown>) => {
    renderers.push(options);
    return { svg: options };
  },
}));

describe("a train's place on the map (trainMarker)", () => {
  /** How far from its centre a circle's stroke reaches, inside and out. */
  const edges = (circle: { radius: number; weight: number }) => ({
    inner: circle.radius - circle.weight / 2,
    outer: circle.radius + circle.weight / 2,
  });

  it("rings the gym a train is at, on the rings' pane, leaving the gym's dot to click", () => {
    circles.length = 0;
    const rings = { svg: { pane: RING_PANE } } as unknown as L.Renderer;
    trainMarker({ lat: 40.44, lon: -79.95 }, true, true, '#ff7a00', rings);
    const [ring] = circles;
    // Drawn as SVG on its pane whatever the map prefers: a canvas would take the clicks inside
    // an unfilled ring as the ring's.
    expect(ring?.options.renderer).toBe(rings);
    expect(ring?.at).toEqual([40.44, -79.95]);
    // Unfilled: a click inside the ring reaches the gym's marker below; its line opens the
    // train's popup, above the markers (a raid's picture) on the pane of the rings.
    expect(ring?.options).toMatchObject({ fill: false, pane: RING_PANE, interactive: true });
    const train = edges(ring?.options as { radius: number; weight: number });
    // Neither the gym's dot nor a meetup's ring at the same gym lies under the train's line.
    expect(edges(GYM_DOT).outer).toBeLessThanOrEqual(train.inner);
    expect(train.outer).toBeLessThanOrEqual(edges(MEETUP_RING).inner);
  });

  it('rings the first gym of a train not at a stop yet, dashed and pale', () => {
    circles.length = 0;
    trainMarker({ lat: 40.44, lon: -79.95 }, false, false, '#ff7a00', {} as unknown as L.Renderer);
    expect(circles[0]?.options).toMatchObject({
      fill: false,
      pane: RING_PANE,
      interactive: false,
      dashArray: expect.any(String) as string,
    });
  });
});

/** A gym's layer: its handlers by event, and how often its popup was opened. */
function gymLayer() {
  const handlers = new Map<string, ((event: unknown) => void)[]>();
  const layer = {
    opened: 0,
    off(type: string) {
      handlers.delete(type);
      return layer;
    },
    on(type: string, handler: (event: unknown) => void) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
      return layer;
    },
    openPopup() {
      layer.opened += 1;
      return layer;
    },
    /** Leaflet fires an event on the layer. */
    fire(type: string, event: unknown) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    },
  };
  return layer;
}

describe("a gym's clicks (gymClicks)", () => {
  it('keeps a double click on a gym in route mode from zooming the map: its clicks add the stop', () => {
    stopped.length = 0;
    const layer = gymLayer();
    let added = 0;
    gymClicks(layer as unknown as Parameters<typeof gymClicks>[0], () => {
      added += 1;
      return true;
    });
    const clicks = [{ type: 'click' }, { type: 'click' }];
    const double = { type: 'dblclick' };
    for (const click of clicks) layer.fire('click', click);
    layer.fire('dblclick', double);
    expect(added).toBe(2);
    expect(layer.opened).toBe(0);
    expect(stopped).toEqual([...clicks, double]);
  });

  it('leaves a double click on a gym to the map out of route mode, its popup opened', () => {
    stopped.length = 0;
    const layer = gymLayer();
    gymClicks(layer as unknown as Parameters<typeof gymClicks>[0], () => false);
    const click = { type: 'click' };
    layer.fire('click', click);
    layer.fire('dblclick', { type: 'dblclick' });
    expect(layer.opened).toBe(1);
    expect(stopped).toEqual([click]);
  });
});

describe('a raid chosen in the list of a gym’s raids (chooseRaid, review W-3)', () => {
  /** The phone card showing gym 7, and what was drawn anew. */
  const onCard = (editing: boolean) => {
    const drawn: string[] = [];
    const chosen = new Map<number, string>([[7, 'r1']]);
    const at = {
      editing,
      cardKey: 'gym:7',
      popupKey: undefined,
      chosen,
      refreshCard: (key: string) => {
        drawn.push(key);
      },
      updatePopup: () => {
        drawn.push('popup');
      },
    };
    return { at, drawn, chosen };
  };

  it('keeps the choice by gym and draws the card anew', () => {
    const { at, drawn, chosen } = onCard(false);
    chooseRaid('', at);
    expect(chosen.has(7)).toBe(false);
    expect(drawn).toEqual(['gym:7']);
  });

  it('leaves the card, and the form held in it, alone while a form is open', () => {
    const { at, drawn, chosen } = onCard(true);
    chooseRaid('', at);
    chooseRaid('r2', at);
    expect(chosen.get(7)).toBe('r1');
    expect(drawn).toEqual([]);
  });

  it('turns the raid choices off with the controls that open a form', () => {
    const button = (name: string) => ({ dataset: { [name]: '' }, disabled: false });
    const buttons = [button('showRaid'), button('report'), button('toggle')];
    // As a browser matches `button[data-…]`: by the attribute's name in the dataset.
    const root = {
      querySelectorAll: (selector: string) => {
        const names = selector
          .split(',')
          .map((one) => /data-([a-z-]+)/u.exec(one)?.[1] ?? '')
          .map((name) =>
            name.replace(/-([a-z])/gu, (_all, letter: string) => letter.toUpperCase()),
          );
        return buttons.filter((one) => names.some((name) => name in one.dataset));
      },
    };
    formControls(root as unknown as ParentNode, false);
    expect(buttons.map((one) => one.disabled)).toEqual([true, true, false]);
    formControls(root as unknown as ParentNode, true);
    expect(buttons.map((one) => one.disabled)).toEqual([false, false, false]);
  });
});

type Listener = (event: { target: PageElement; stopPropagation(): void }) => void;

/**
 * Just enough of an element for `showParties` to start (what `renderNode` sets, a tree) and for a
 * click to bubble up the tree as it was when the click began, until a listener stops it.
 */
class PageElement {
  className = '';
  textContent: string | null = '';
  hidden = false;
  disabled = false;
  readonly dataset: Record<string, string> = {};
  childNodes: PageElement[] = [];
  parent: PageElement | undefined;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly tag: string) {}

  setAttribute(): void {}

  append(...children: PageElement[]): void {
    for (const child of children) {
      child.remove();
      child.parent = this;
      this.childNodes.push(child);
    }
  }

  remove(): void {
    if (!this.parent) return;
    this.parent.childNodes = this.parent.childNodes.filter((child) => child !== this);
    this.parent = undefined;
  }

  /** No buttons that open a form: `formControls` has nothing to turn on or off. */
  querySelectorAll(): PageElement[] {
    return [];
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  /** A click here, along the way up fixed as it begins (as a browser fixes it). */
  dispatch(type: string): void {
    const path: PageElement[] = [this];
    for (let at = this.parent; at; at = at.parent) path.push(at);
    let stop = false;
    const event = {
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

describe("the map's popups (showParties)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * `showParties` started on a map that records its handlers; the page a document of
   * `PageElement`s, hidden, whose list is never answered (the poller waits for good).
   */
  const started = () => {
    vi.stubGlobal('document', {
      createElement: (tag: string) => new PageElement(tag),
      getElementById: (id: string) => new PageElement(id),
      // Where the Report button's menu waits, hidden (plan 8M-9A).
      body: new PageElement('body'),
      addEventListener: () => undefined,
      querySelectorAll: () => [],
      visibilityState: 'hidden',
      // No theme chosen (plan 8M-13, S10): the device's.
      documentElement: { getAttribute: () => null },
    });
    vi.stubGlobal('window', {
      setTimeout: () => 0,
      clearTimeout: () => undefined,
      setInterval: () => 0,
    });
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const handlers = new Map<string, ((event: unknown) => void)[]>();
    const map = {
      on(type: string, handler: (event: unknown) => void) {
        handlers.set(type, [...(handlers.get(type) ?? []), handler]);
        return map;
      },
      createPane: (name: string) => {
        const pane = { style: {} as { zIndex?: string } };
        panes.set(name, pane);
        return pane;
      },
    };
    showParties(
      map as unknown as Parameters<typeof showParties>[0],
      '100000000000000001',
      { loggedIn: true, csrf: 'token' } as unknown as Parameters<typeof showParties>[2],
      new Map(),
      new Map(),
      [],
      false,
      {
        registry: new LayerRegistry(undefined),
        afterDraw: () => undefined,
        located: () => undefined,
        onMove: () => undefined,
        storage: undefined,
        showMap: () => undefined,
        units: 'imperial',
      },
    );
    /** Leaflet fires an event on the map. */
    const fire = (type: string, event: unknown) => {
      for (const handler of handlers.get(type) ?? []) handler(event);
    };
    return { fire };
  };
  /** The panes the map was asked to make, by name. */
  const panes = new Map<string, { style: { zIndex?: string } }>();

  // Plan 8M-11A (S2): the rings under Leaflet's markers (600) and over its overlays (400), so that
  // a raid's time badge is drawn over a meetup's or a train's ring.
  it("puts the rings' pane below the markers and above the overlays", () => {
    started();
    expect(panes.get(RING_PANE)?.style.zIndex).toBe('590');
  });

  it("draws the rings and the trains' lines each with one SVG renderer on its pane", () => {
    renderers.length = 0;
    started();
    expect(renderers).toEqual([
      { pane: RING_PANE },
      { pane: RING_TAP_PANE },
      { pane: TRAIN_LINE_PANE },
    ]);
  });

  it("keeps a click from the map's container once the popup opened, though its button was taken out of the page", () => {
    const { fire } = started();
    // The map's container, the popup's element in it, and a button the click takes out of the
    // page in its own handler (Cancel putting a gym's buttons back, Manage… drawing its panel).
    const container = new PageElement('div');
    const element = new PageElement('div');
    container.append(element);
    let reached = 0;
    container.addEventListener('click', () => {
      reached += 1;
    });
    const button = () => {
      const made = new PageElement('button');
      made.addEventListener('click', () => {
        made.remove();
      });
      element.append(made);
      return made;
    };
    // Before the popup opened on the map, such a click reaches the container (Leaflet's own
    // walk up from the detached button would find no popup, and close it).
    button().dispatch('click');
    expect(reached).toBe(1);
    fire('popupopen', { popup: { getElement: () => element } });
    button().dispatch('click');
    expect(reached).toBe(1);
  });
});
