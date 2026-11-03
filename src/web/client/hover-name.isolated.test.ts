import type * as L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hoverName, type Named } from './hover-name.js';

// Leaflet reads the browser's `window` as it loads: its tooltips are recorded here, each with what
// it was given and whether it is still open. Isolated: a mocked module needs a module graph of its
// own.
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

/** A dot: its handlers by event, and whether its popup is open. */
function dot(popupOpen = false) {
  const handlers = new Map<string, Array<() => void>>();
  const named = {
    on(type: string, handler: () => void) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
      return named;
    },
    getLatLng: () => ({ lat: 40.44, lng: -79.95 }),
    isPopupOpen: () => popupOpen,
  };
  const fire = (type: string) => {
    for (const handler of handlers.get(type) ?? []) handler();
  };
  return { named: named as unknown as Named, fire };
}

const map = {} as L.Map;
/** The tooltips open now, by their words. */
const open = () => tips.made.filter((tip) => tip.open).map((tip) => tip.content?.textContent);

beforeEach(() => {
  tips.made.splice(0);
  vi.stubGlobal('document', { createElement: () => ({ textContent: null }) });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a place named on hover (Matt, 2026-11-02)', () => {
  it('shows the name over the dot while a mouse is on it, as text', () => {
    const { named, fire } = dot();
    hoverName(map, named, 'Library <b>', () => true);
    fire('mouseover');
    expect(open()).toEqual(['Library <b>']);
    expect(tips.made[0]?.at).toEqual({ lat: 40.44, lng: -79.95 });
    fire('mouseout');
    expect(open()).toEqual([]);
  });

  it('shows nothing where the pointer does not hover (a touch device)', () => {
    const { named, fire } = dot();
    hoverName(map, named, 'Library', () => false);
    fire('mouseover');
    expect(tips.made).toEqual([]);
  });

  it('closes at a click, which opens the popup, and shows nothing over an open popup', () => {
    const { named, fire } = dot();
    hoverName(map, named, 'Library', () => true);
    fire('mouseover');
    fire('click');
    expect(open()).toEqual([]);
    const withPopup = dot(true);
    hoverName(map, withPopup.named, 'Fountain', () => true);
    withPopup.fire('mouseover');
    expect(open()).toEqual([]);
  });

  it('closes when the dot is taken off the map, and shows one name at a time', () => {
    const { named, fire } = dot();
    hoverName(map, named, 'Library', () => true);
    fire('mouseover');
    fire('mouseover');
    expect(tips.made).toHaveLength(1);
    fire('remove');
    expect(open()).toEqual([]);
  });
});
