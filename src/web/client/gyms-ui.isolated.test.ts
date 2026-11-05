import { afterEach, describe, expect, it, vi } from 'vitest';
import { showGymDots, type GymDotsDeps } from './gyms-ui.js';
import type { MapGym } from './popup.js';

/**
 * The gyms' layer (`showGymDots`, plan 8M-11B, S13) over a Leaflet of fakes that count what the
 * page changes on the map: layers put into the gyms' group and taken out of it, markers moved,
 * a cluster's count written. Isolated: mocked modules need a module graph of their own.
 */
const counted = vi.hoisted(() => {
  const changes = { added: 0, removed: 0, moved: 0, relabeled: 0 };
  type Handler = (event: unknown) => void;
  /** A dot or a cluster's marker: where it is, its handlers, its popup. */
  class Layer {
    readonly handlers = new Map<string, Handler[]>();
    group: Group | undefined;
    constructor(
      public at: [number, number],
      readonly options: Record<string, unknown> = {},
    ) {}
    on(type: string, handler: Handler) {
      this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
      return this;
    }
    off() {
      return this;
    }
    /** What the popup was bound with. */
    popupOptions: unknown;
    bindPopup(_content?: unknown, options?: unknown) {
      this.popupOptions = options;
      return this;
    }
    openPopup() {
      return this;
    }
    getPopup() {
      return undefined;
    }
    /** Where it is, as Leaflet's points, which compare by `equals`. */
    getLatLng() {
      const [lat, lng] = this.at;
      return { lat, lng, equals: (other: { lat: number; lng: number }) => other.lat === lat };
    }
    setStyle() {
      return this;
    }
    setLatLng(at: [number, number]) {
      changes.moved += 1;
      this.at = at;
      return this;
    }
    /** The attributes set on its element. */
    readonly attributes: Record<string, string> = {};
    /**
     * What a screen reader says of it now: its element's `aria-label` (review P6 of 8H-4H: no
     * `title`, whose tooltip the browser would show beside the page's own).
     */
    title(): unknown {
      return this.options.title ?? this.attributes['aria-label'];
    }
    getElement() {
      return {
        setAttribute: (name: string, value: string) => {
          this.attributes[name] = value;
        },
      };
    }
    addTo(group: Group) {
      group.addLayer(this);
      return this;
    }
  }
  class Group {
    readonly layers = new Set<Layer>();
    addTo() {
      return this;
    }
    addLayer(layer: Layer) {
      changes.added += 1;
      layer.group = this;
      this.layers.add(layer);
      // Leaflet makes its element as it goes on the map, and says so.
      for (const handler of layer.handlers.get('add') ?? []) handler({});
      return this;
    }
    removeLayer(layer: Layer) {
      changes.removed += 1;
      layer.group = undefined;
      this.layers.delete(layer);
      return this;
    }
    hasLayer(layer: Layer) {
      return this.layers.has(layer);
    }
  }
  /** The groups made (the gyms' is the only one). */
  const groups: Group[] = [];
  /** The hover names' tooltips (`hover-name.ts`): their words, and whether still open. */
  const tips: Array<{ words: string | null | undefined; open: boolean }> = [];
  /** What each tooltip was made with. */
  const tipOptions: unknown[] = [];
  return { changes, Layer, Group, groups, tips, tipOptions };
});

vi.mock('leaflet', () => ({
  layerGroup: () => {
    const group = new counted.Group();
    counted.groups.push(group);
    return group;
  },
  circleMarker: (at: [number, number], options: Record<string, unknown>) =>
    new counted.Layer(at, options),
  marker: (at: [number, number], options: Record<string, unknown>) =>
    new counted.Layer(at, options),
  divIcon: (options: Record<string, unknown>) => ({ options }),
  latLngBounds: () => ({ getCenter: () => ({ lat: 0, lng: 0 }) }),
  point: (x: number, y: number) => ({ x, y }),
  tooltip: (options: unknown) => {
    counted.tipOptions.push(options);
    const tip = { words: undefined as string | null | undefined, open: false };
    counted.tips.push(tip);
    const made = {
      setLatLng: () => made,
      setContent: (content: { textContent: string | null }) => {
        tip.words = content.textContent;
        return made;
      },
      openOn: () => {
        tip.open = true;
        return made;
      },
      remove: () => {
        tip.open = false;
        return made;
      },
    };
    return made;
  },
}));
// What the gyms' layer takes of the party layer: the dot's size and its clicks, none here.
vi.mock('./party-layer.js', () => ({
  GYM_DOT: { radius: 6, weight: 2 },
  gymClicks: () => undefined,
}));
vi.mock('./raid-forms.js', () => ({ heldContent: (draw: () => unknown) => draw }));
vi.mock('./train-forms.js', () => ({ stopName: () => 'a gym' }));
vi.mock('./theme.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./theme.js')>();
  return { ...real, theme: () => real.readTheme(() => ''), onThemeChange: () => undefined };
});

/** Six gyms of Oakland close together, and one across the river. */
const gym = (id: number, lat: number, lon: number): MapGym => ({
  id,
  name: `Gym ${String(id)}`,
  nickname: null,
  lat,
  lon,
  regionIds: [1],
  address: null,
  description: null,
  notice: null,
});
const GYMS = [
  ...Array.from({ length: 6 }, (_, index) => gym(index + 1, 40.444 + index * 0.0002, -79.953)),
  gym(7, 40.43, -79.92),
];

/** A cluster's count as its marker shows it (a span of ours), by its marker. */
const labelOf = (layer: InstanceType<typeof counted.Layer>): string | null =>
  (layer.options.icon as { options: { html: { textContent: string | null } } } | undefined)?.options
    .html.textContent ?? null;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The gyms' layer over a map at `zoom` that shows Oakland, the raids hiding `hidden`. */
function shown(
  zoom: number,
  more: {
    on?: boolean;
    thins?: () => boolean;
    typed?: string;
    area?: (gyms: readonly MapGym[]) => string | undefined;
    /** Whether the Activity layer has counts now (review R4); always without it. */
    counting?: () => boolean;
  } = {},
) {
  vi.stubGlobal('document', {
    // The hover names watch the pointer used (`hover-name.ts`).
    addEventListener: () => undefined,
    createElement: () => {
      const element = { textContent: null as string | null };
      return new Proxy(element, {
        set(target, key, value: unknown) {
          if (key === 'textContent' && target.textContent !== null) counted.changes.relabeled += 1;
          return Reflect.set(target, key, value);
        },
      });
    },
  });
  // A mouse's device: its pointer hovers (`hover-name.ts`).
  vi.stubGlobal('window', { setTimeout: () => 0, matchMedia: () => ({ matches: true }) });
  counted.tips.splice(0);
  counted.tipOptions.splice(0);
  counted.groups.splice(0);
  Object.assign(counted.changes, { added: 0, removed: 0, moved: 0, relabeled: 0 });
  const hidden = new Set<number>();
  /** How many times the gyms under raids were asked for. */
  const hiddenAsked = { count: 0 };
  const map = {
    zoom,
    on: () => map,
    once: () => map,
    getZoom: () => map.zoom,
    getSize: () => ({ x: 1200, y: 800 }),
    getBounds: () => ({
      getSouth: () => 40.42,
      getWest: () => -79.97,
      getNorth: () => 40.46,
      getEast: () => -79.9,
      contains: () => true,
    }),
  };
  /** How many times the gyms were worked out anew (each refresh counts those in view once). */
  const refreshed = { count: 0 };
  /** The Gyms layer, which a test may turn on and off (`toggle`), and who listens. */
  const layer = { on: more.on ?? true, listeners: [] as Array<(id: string, on: boolean) => void> };
  const registry = {
    isOn: () => layer.on,
    onChange: (listener: (id: string, on: boolean) => void) => {
      layer.listeners.push(listener);
    },
    setCount: () => {
      refreshed.count += 1;
    },
    // As the layer menu's switch: kept, and told (plan 8M-13, R1-1).
    set: (id: string, on: boolean) => {
      if (id === 'gyms' && layer.on !== on) toggle(on);
    },
  };
  const typing: Array<() => void> = [];
  const filter = {
    value: more.typed ?? '',
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'input') typing.push(listener);
    },
  };
  /** A keystroke in the box. */
  const type = (text: string) => {
    filter.value = text;
    for (const listener of typing) listener();
  };
  const dots = showGymDots({
    map,
    gyms: GYMS,
    where: () => ({ located: undefined, units: 'imperial' }),
    registry,
    filter,
    extras: () => [],
    editing: () => false,
    clicked: () => false,
    forced: () => false,
    hidden: () => {
      hiddenAsked.count += 1;
      return hidden;
    },
    tapped: () => undefined,
    ...(more.thins === undefined ? {} : { thins: more.thins }),
    ...(more.area === undefined ? {} : { area: more.area }),
    ...(more.counting === undefined ? {} : { counting: more.counting }),
  } as unknown as GymDotsDeps);
  dots.refresh();
  const group = counted.groups[0];
  if (!group) throw new Error('the gyms drew no group');
  /** What changed on the map since the last look. */
  const changes = () => {
    const now = { ...counted.changes };
    Object.assign(counted.changes, { added: 0, removed: 0, moved: 0, relabeled: 0 });
    return now;
  };
  changes();
  /** The Gyms layer turned on or off. */
  const toggle = (on: boolean) => {
    layer.on = on;
    for (const listener of layer.listeners) listener('gyms', on);
  };
  return { dots, map, hidden, hiddenAsked, group, changes, type, refreshed, toggle, layer };
}

// The Report button's dimming reaches the dots on Leaflet's overlay pane (`map.css`).
describe("the gyms' dots", () => {
  it('are drawn on the overlay pane, with no pane of their own', () => {
    const { group } = shown(17);
    const dots = [...group.layers].filter((layer) => layer.options.className === 'gym-dot');
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) expect(dot.options.pane).toBeUndefined();
  });

  // Review, finding 12: a form anchored in the popup scrolls inside it.
  it("give their popups the height the parties' popups have", () => {
    const { group } = shown(17);
    const dots = [...group.layers].filter((layer) => layer.options.className === 'gym-dot');
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) expect(dot.popupOptions).toMatchObject({ maxHeight: 660 });
  });
});

describe("the gyms' clusters (plan 8M-11B, S13)", () => {
  // A guard rather than a change of behavior: the keys of plan 8M-7 were stable too while no gym
  // changed (review R3); it keeps the layer from drawing anything anew at a poll.
  it('draws nothing anew when the parties are drawn and no gym changed', () => {
    const { dots, group, changes } = shown(12);
    const before = [...group.layers];
    expect(before.length).toBeGreaterThan(0);
    dots.refresh();
    dots.refresh();
    expect(changes()).toEqual({ added: 0, removed: 0, moved: 0, relabeled: 0 });
    expect([...group.layers]).toEqual(before);
  });

  it("changes a cluster's count and place in place when a raid hides one of its gyms", () => {
    const { dots, group, hidden, changes } = shown(12);
    const cluster = [...group.layers].find((layer) => labelOf(layer) === '6');
    if (!cluster) throw new Error('no cluster of the six gyms');
    const was = cluster.at;
    hidden.add(6);
    dots.refresh();
    expect(changes()).toEqual({ added: 0, removed: 0, moved: 1, relabeled: 1 });
    expect(labelOf(cluster)).toBe('5');
    // Its title (the tooltip, what a screen reader says) with it.
    expect(cluster.title()).toBe('5 gyms');
    expect(cluster.at).not.toEqual(was);
    expect(group.hasLayer(cluster)).toBe(true);
  });

  it("gives a cluster's marker to a cluster of the next zoom rather than drawing one anew", () => {
    const { dots, map, group, changes } = shown(12);
    const cluster = [...group.layers].find((layer) => labelOf(layer) === '6');
    map.zoom = 13;
    dots.refresh();
    const now = changes();
    expect(now.added).toBe(0);
    expect(now.removed).toBe(0);
    expect(cluster && group.hasLayer(cluster)).toBe(true);
  });
});

describe("a gym cluster's activity on hover (plan 8H-4H)", () => {
  /** What a mouse over a cluster shows, and the cluster of the six gyms. */
  const hovered = (area: (gyms: readonly MapGym[]) => string | undefined) => {
    const made = shown(12, { area });
    const cluster = [...made.group.layers].find((layer) => labelOf(layer) === '6');
    if (!cluster) throw new Error('no cluster of the six gyms');
    const fire = (type: string) => {
      for (const handler of cluster.handlers.get(type) ?? []) handler({});
    };
    return { ...made, cluster, fire };
  };
  const open = () => counted.tips.filter((tip) => tip.open).map((tip) => tip.words);

  it('shows its gyms and their parties while a mouse is on it; its badge counts gyms', () => {
    const asked: number[][] = [];
    const { cluster, fire } = hovered((gyms) => {
      asked.push(gyms.map((gym) => gym.id));
      return `≈ ${String(gyms.length * 10)} parties in this area`;
    });
    fire('mouseover');
    expect(open()).toEqual(['6 gyms · ≈ 60 parties in this area']);
    expect(asked.at(-1)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(labelOf(cluster)).toBe('6');
    // Over the badge, not into it (review P6).
    expect(counted.tipOptions.at(-1)).toMatchObject({ offset: [0, -17] });
    fire('mouseout');
    expect(open()).toEqual([]);
  });

  // Review P7: a gym under a raid's marker still stands for its area's parties.
  it("counts the gyms of its area hidden under a raid's marker, while its badge counts those drawn", () => {
    const asked: number[][] = [];
    const { cluster, fire, dots, hidden } = hovered((gyms) => {
      asked.push(gyms.map((gym) => gym.id));
      return `≈ ${String(gyms.length * 10)} parties in this area`;
    });
    hidden.add(6);
    hidden.add(7);
    dots.refresh();
    fire('mouseover');
    expect(labelOf(cluster)).toBe('5');
    // Gym 7, across the river, is of another area.
    expect(asked.at(-1)?.toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(open()).toEqual(['5 gyms · ≈ 60 parties in this area']);
  });

  it('shows its gyms alone while the layer has nothing to say of them, and without the layer', () => {
    hovered(() => undefined).fire('mouseover');
    expect(open()).toEqual(['6 gyms']);
    const without = shown(12);
    const cluster = [...without.group.layers].find((layer) => labelOf(layer) === '6');
    for (const handler of cluster?.handlers.get('mouseover') ?? []) handler({});
    expect(open()).toEqual(['6 gyms']);
  });

  // Review P6: a screen reader hears the same, and the browser shows no tooltip of its own.
  it('names it by an aria-label, no title, its parties in it while the layer has them', () => {
    const { cluster, dots, hidden } = hovered(
      (gyms) => `≈ ${String(gyms.length * 10)} parties in this area`,
    );
    expect(cluster.options.title).toBeUndefined();
    expect(cluster.attributes['aria-label']).toBe('6 gyms · ≈ 60 parties in this area');
    hidden.add(6);
    dots.refresh();
    expect(cluster.attributes['aria-label']).toBe('5 gyms · ≈ 60 parties in this area');
  });

  // Review R3: a new answer of the Activity layer, or the layer turned off, reaches the labels.
  it('names its clusters anew when told, as the Activity sums change', () => {
    const sums = { now: 60 as number | undefined };
    const { cluster, dots } = hovered((_gyms) =>
      sums.now === undefined ? undefined : `≈ ${String(sums.now)} parties in this area`,
    );
    sums.now = 90;
    dots.names();
    expect(cluster.attributes['aria-label']).toBe('6 gyms · ≈ 90 parties in this area');
    sums.now = undefined;
    dots.names();
    expect(cluster.attributes['aria-label']).toBe('6 gyms');
  });

  // Review R4: nothing worked out per cluster while the layer has nothing to say.
  it('asks nothing of the gyms while the layer has no counts, and asks the hidden ones once a draw', () => {
    const asked: number[][] = [];
    const counting = { now: false };
    const made = shown(12, {
      area: (gyms) => {
        asked.push(gyms.map((gym) => gym.id));
        return undefined;
      },
      counting: () => counting.now,
    });
    const cluster = [...made.group.layers].find((layer) => labelOf(layer) === '6');
    const hover = () => {
      for (const handler of cluster?.handlers.get('mouseover') ?? []) handler({});
    };
    hover();
    expect(asked).toEqual([]);
    counting.now = true;
    made.dots.refresh();
    const once = made.hiddenAsked.count;
    hover();
    made.dots.names();
    expect(asked.length).toBeGreaterThan(0);
    expect(made.hiddenAsked.count).toBe(once);
  });
});

describe('the box over the gyms (plan 8M-12)', () => {
  it('draws the gyms a word typed finds, for a visitor', () => {
    const { group } = shown(16, { on: true, typed: 'Gym 7' });
    expect([...group.layers].map((layer) => layer.at)).toEqual([[40.43, -79.92]]);
  });

  // Plan 8M-13 (L2): Gyms off hides the matches; on again shows them while the text stands.
  it('hides the matches with the Gyms layer, and shows them again with it', () => {
    const { group, toggle } = shown(16, { on: true, typed: 'Gym 7' });
    toggle(false);
    expect([...group.layers]).toEqual([]);
    toggle(true);
    expect([...group.layers].map((layer) => layer.at)).toEqual([[40.43, -79.92]]);
  });

  // Fix round 1 of 8M-13 (R1-1, Matt's A): a search with the Gyms layer off turns it on.
  it('turns the Gyms layer on when a word is typed while it is off, and shows the matches', () => {
    const { group, type, layer } = shown(16, { on: false });
    expect([...group.layers]).toEqual([]);
    type('Gym 7');
    expect(layer.on).toBe(true);
    expect([...group.layers].map((one) => one.at)).toEqual([[40.43, -79.92]]);
  });

  it("thins nothing for a member, whose box is Find's: the layer says what is drawn", () => {
    const off = shown(16, { on: false, typed: 'Gym 7', thins: () => false });
    expect([...off.group.layers]).toEqual([]);
    const on = shown(16, { on: true, typed: 'Gym 7', thins: () => false });
    expect(on.group.layers.size).toBe(7);
    // A keystroke works nothing out for the gyms (review F2).
    const before = on.refreshed.count;
    on.type('Gym 1');
    expect(on.refreshed.count).toBe(before);
    const visitor = shown(16, { on: false });
    const was = visitor.refreshed.count;
    visitor.type('Gym 7');
    expect(visitor.refreshed.count).toBe(was + 1);
  });
});
