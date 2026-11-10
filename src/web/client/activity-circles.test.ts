import { describe, expect, it } from 'vitest';
import type { ActivityPlaceView } from '../../domain/web/activity-data.js';
import {
  ActivityCircles,
  tapCircle,
  type PopupCircle,
  type TapCircle,
} from './activity-circles.js';
import { tapRadius } from './activity.js';

/** A place of the activity's answer. */
const at = (id: string, parties: number, weight = 0.5): ActivityPlaceView => ({
  kind: 'gym',
  id,
  lat: 40.44,
  lon: -79.95,
  weight,
  parties,
});

/** The circles made, each with what it was last shown, its popup open or not, and its words. */
function drawn() {
  const made: Array<{
    id: string;
    shown: ActivityPlaceView;
    words: () => string;
    open: boolean;
    refreshed: string[];
    removed: boolean;
  }> = [];
  const circles = new ActivityCircles((place, words): TapCircle => {
    const circle = {
      id: place.id,
      shown: place,
      words,
      open: false,
      refreshed: [] as string[],
      removed: false,
    };
    made.push(circle);
    return {
      show: (now) => {
        circle.shown = now;
      },
      refresh: () => {
        if (circle.open) circle.refreshed.push(words());
      },
      close: () => {
        circle.open = false;
      },
      isOpen: () => circle.open,
      remove: () => {
        circle.removed = true;
      },
    };
  });
  const standing = () => made.filter((circle) => !circle.removed).map((circle) => circle.id);
  return { circles, made, standing };
}

const words = (place: ActivityPlaceView) => `${String(place.parties)} parties`;

// Review P3 and P11 of 8H-4H.
describe("the activity's invisible circles", () => {
  it('keeps its circles when the same places are wanted again (a zoom from 16 to 17)', () => {
    const { circles, made, standing } = drawn();
    const places = [at('1', 4), at('2', 9)];
    circles.show(places, words);
    circles.show(places, words);
    expect(made).toHaveLength(2);
    expect(standing()).toEqual(['1', '2']);
  });

  it("keeps a place's circle through a new answer, its words and size the answer's", () => {
    const { circles, made } = drawn();
    circles.show([at('1', 4, 0.2)], words);
    const [circle] = made;
    if (!circle) throw new Error('no circle');
    circle.open = true;
    circles.show([at('1', 12, 0.8)], words);
    expect(made).toHaveLength(1);
    expect(circle.shown.weight).toBe(0.8);
    expect(circle.words()).toBe('12 parties');
    // Its popup open: drawn anew with them.
    expect(circle.refreshed).toEqual(['12 parties']);
  });

  it('takes off the circles of places no longer wanted and adds those newly wanted', () => {
    const { circles, made, standing } = drawn();
    circles.show([at('1', 4), at('2', 9)], words);
    circles.show([at('2', 9), at('3', 5)], words);
    expect(standing()).toEqual(['2', '3']);
    expect(made.map((circle) => circle.id)).toEqual(['1', '2', '3']);
  });

  // Review F1: a spot's dot drawn, or a raid ended, under an open count does not take it away.
  it('keeps a circle whose popup is open until it closes, then takes it off', () => {
    const { circles, made, standing } = drawn();
    circles.show([at('1', 4)], words);
    const [circle] = made;
    if (!circle) throw new Error('no circle');
    circle.open = true;
    circles.show([], words);
    expect(standing()).toEqual(['1']);
    circle.open = false;
    circles.show([], words);
    expect(standing()).toEqual([]);
  });

  it('takes every circle off when cleared, and makes them anew after', () => {
    const { circles, made, standing } = drawn();
    circles.show([at('1', 4)], words);
    circles.clear();
    expect(standing()).toEqual([]);
    circles.show([at('1', 4)], words);
    expect(made).toHaveLength(2);
    expect(standing()).toEqual(['1']);
  });

  // Review R2: the popup keeps reading its words; a content set once would stay as it was.
  it("draws a circle's popup from its words each time it opens, and anew while open", () => {
    /** A Leaflet circle with a popup: its content a function or set once, shown as it opens. */
    const leaflet = () => {
      const popup = {
        content: undefined as (() => { text: string }) | { text: string } | undefined,
        open: false,
        shown: undefined as string | undefined,
        render() {
          const content = typeof this.content === 'function' ? this.content() : this.content;
          this.shown = content?.text;
        },
        update() {
          if (this.open) this.render();
        },
      };
      const circle = {
        radius: 0,
        bindPopup(content: () => { text: string }) {
          popup.content = content;
          return circle;
        },
        setRadius(radius: number) {
          circle.radius = radius;
          return circle;
        },
        setLatLng: () => circle,
        isPopupOpen: () => popup.open,
        setPopupContent(content: { text: string }) {
          popup.content = content;
          popup.update();
          return circle;
        },
        getPopup: () => popup,
        openPopup() {
          popup.open = true;
          popup.render();
        },
        closePopup() {
          popup.open = false;
        },
      };
      return circle;
    };
    const made: Array<ReturnType<typeof leaflet>> = [];
    const circles = new ActivityCircles((place, words) => {
      const circle = leaflet();
      made.push(circle);
      return tapCircle(
        circle as unknown as PopupCircle,
        place,
        words,
        (text) => ({ text }) as unknown as HTMLElement,
        () => undefined,
      );
    });
    circles.show([at('1', 4)], words);
    const [circle] = made;
    if (!circle) throw new Error('no circle');
    expect(circle.radius).toBeGreaterThan(0);
    circle.openPopup();
    expect(circle.getPopup().shown).toBe('4 parties');
    circles.show([at('1', 12, 1)], words);
    expect(circle.getPopup().shown).toBe('12 parties');
    expect(circle.radius).toBe(tapRadius(1));
    circle.closePopup();
    circles.show([at('1', 20)], words);
    circle.openPopup();
    expect(circle.getPopup().shown).toBe('20 parties');
  });

  // Review 8H4H-5: a place kept through a new answer stands where the answer has it.
  it("moves a kept circle to where the new answer has its place, its size the answer's", () => {
    const circle = {
      at: undefined as [number, number] | undefined,
      radius: 0,
      bindPopup: () => circle,
      setRadius(radius: number) {
        circle.radius = radius;
        return circle;
      },
      setLatLng(at: [number, number]) {
        circle.at = at;
        return circle;
      },
      getPopup: () => undefined,
      closePopup: () => circle,
      isPopupOpen: () => false,
    };
    const tapped = tapCircle(
      circle,
      at('1', 4),
      () => '4 parties',
      () => ({}) as HTMLElement,
      () => undefined,
    );
    tapped.show({ ...at('1', 9, 1), lat: 40.45, lon: -79.94 });
    expect(circle.at).toEqual([40.45, -79.94]);
    expect(circle.radius).toBe(tapRadius(1));
  });

  // Review F2: the circles are shown again at every draw of the dots; a place unchanged is left.
  it('sets a circle’s place and size only when they changed', () => {
    const calls: string[] = [];
    const circle = {
      bindPopup: () => circle,
      setRadius: () => {
        calls.push('radius');
        return circle;
      },
      setLatLng: () => {
        calls.push('place');
        return circle;
      },
      getPopup: () => undefined,
      closePopup: () => circle,
      isPopupOpen: () => false,
    };
    const tapped = tapCircle(
      circle,
      at('1', 4),
      () => '4 parties',
      () => ({}) as HTMLElement,
      () => undefined,
    );
    calls.length = 0;
    tapped.show(at('1', 9));
    expect(calls).toEqual([]);
    tapped.show(at('1', 9, 0.9));
    expect(calls).toEqual(['radius']);
    tapped.show({ ...at('1', 9, 0.9), lat: 40.5 });
    expect(calls).toEqual(['radius', 'place']);
  });

  // Review 8H4H-6: a double-click on the glow zooms the map; the count its first click opened goes.
  it("closes every circle's popup when asked, keeping the circles", () => {
    const { circles, made, standing } = drawn();
    circles.show([at('1', 4), at('2', 9)], words);
    for (const circle of made) circle.open = true;
    circles.close();
    expect(made.map((circle) => circle.open)).toEqual([false, false]);
    expect(standing()).toEqual(['1', '2']);
    const leaflet = {
      closed: 0,
      bindPopup: () => leaflet,
      setRadius: () => leaflet,
      setLatLng: () => leaflet,
      getPopup: () => undefined,
      isPopupOpen: () => false,
      closePopup() {
        leaflet.closed += 1;
        return leaflet;
      },
    };
    tapCircle(
      leaflet,
      at('1', 4),
      () => '4 parties',
      () => ({}) as HTMLElement,
      () => undefined,
    ).close();
    expect(leaflet.closed).toBe(1);
  });

  it('tells a gym from a Power Spot of the same id', () => {
    const { circles, standing } = drawn();
    circles.show([at('1', 4), { ...at('1', 4), kind: 'spot' }], words);
    expect(standing()).toEqual(['1', '1']);
  });
});
