import type { ActivityPlaceView } from '../../domain/web/activity-data.js';
import { tapRadius } from './activity.js';

/*
 * The activity layer's invisible circles, which a tap on the glow finds (plan 8H-4H, review P3),
 * kept by place (`kind:id`): a circle of a place still wanted stays as it is drawn through a zoom
 * at street level, a pan and a new answer, its size and words then the answer's (its popup, open,
 * drawn anew); only those no longer wanted are taken off and those newly wanted made. Leaflet's
 * circle is made by the caller (`activity-ui.ts`); this is its pure part.
 */

/** A circle as the caller draws it. */
export interface TapCircle {
  /** The place as it stands now: where it is, its size by its weight. */
  show(place: ActivityPlaceView): void;
  /** Its words changed: its popup, where open, drawn anew. */
  refresh(): void;
  /** Its popup closed, where open (review 8H4H-6: a double-click zooms the map). */
  close(): void;
  /** Whether its popup is open (review F1: an open count is not taken away under the finger). */
  isOpen(): boolean;
  remove(): void;
}

/** What `tapCircle` needs of Leaflet's circle (`L.CircleMarker`). */
export interface PopupCircle {
  bindPopup(content: () => HTMLElement): unknown;
  setRadius(radius: number): unknown;
  setLatLng(at: [number, number]): unknown;
  getPopup(): { update(): unknown } | undefined;
  closePopup(): unknown;
  isPopupOpen(): boolean;
}

/**
 * A place's circle over Leaflet's: its popup the words it reads as it opens (`content`), its size
 * by the place's weight (`tapRadius`), `remove` taking it off.
 */
export function tapCircle(
  circle: PopupCircle,
  place: ActivityPlaceView,
  words: () => string,
  content: (words: string) => HTMLElement,
  remove: () => void,
): TapCircle {
  let radius = tapRadius(place.weight);
  let lat = place.lat;
  let lon = place.lon;
  circle.setRadius(radius);
  circle.bindPopup(() => content(words()));
  return {
    show: (now) => {
      // Where the answer has the place now (review 8H4H-5), as its size; set only when they
      // changed (review F2: shown again at every draw of the gym dots, each set a redraw).
      if (now.lat !== lat || now.lon !== lon) {
        lat = now.lat;
        lon = now.lon;
        circle.setLatLng([lat, lon]);
      }
      const size = tapRadius(now.weight);
      if (size !== radius) {
        radius = size;
        circle.setRadius(radius);
      }
    },
    refresh: () => {
      // Its bound content read again (review R2): a content set here would stay as it was.
      circle.getPopup()?.update();
    },
    close: () => {
      circle.closePopup();
    },
    isOpen: () => circle.isPopupOpen(),
    remove,
  };
}

export class ActivityCircles {
  private readonly drawn = new Map<string, { circle: TapCircle; words: string }>();

  constructor(
    /** Makes a place's circle; its popup reads `words` as it opens. */
    private readonly make: (place: ActivityPlaceView, words: () => string) => TapCircle,
  ) {}

  /** The circles of `places`, each with its words: kept, made or taken off by place. */
  show(places: readonly ActivityPlaceView[], words: (place: ActivityPlaceView) => string): void {
    const wanted = new Map(places.map((place) => [`${place.kind}:${place.id}`, place]));
    for (const [key, { circle }] of this.drawn) {
      // A circle whose count is open stays until it closes (review F1: the spot's dot drawn, or
      // a raid ended, under the finger); the next `show` after that takes it off.
      if (wanted.has(key) || circle.isOpen()) continue;
      circle.remove();
      this.drawn.delete(key);
    }
    for (const [key, place] of wanted) {
      const said = words(place);
      const kept = this.drawn.get(key);
      if (kept) {
        const changed = kept.words !== said;
        kept.words = said;
        kept.circle.show(place);
        if (changed) kept.circle.refresh();
        continue;
      }
      const entry = { words: said };
      const circle = this.make(place, () => entry.words);
      this.drawn.set(key, Object.assign(entry, { circle }));
    }
  }

  /**
   * Every circle's popup closed, the circles kept (review 8H4H-6): a double-click on the glow
   * zooms the map, and its first click's count goes with it.
   */
  close(): void {
    for (const { circle } of this.drawn.values()) circle.close();
  }

  /** Every circle taken off. */
  clear(): void {
    for (const { circle } of this.drawn.values()) circle.remove();
    this.drawn.clear();
  }
}
