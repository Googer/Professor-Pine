import * as L from 'leaflet';
import { CLUSTER_BELOW } from './cluster.js';
import { dotKey, planDots, wantedDots, type DrawnDot, type WantedDot } from './gym-dots.js';
import { hoverName } from './hover-name.js';
import type { Box } from './view.js';

/**
 * The Leaflet side of Pine's clustered places (plans 8M-7, 8M-11B, 8M-11C review C1), one for
 * the live map's gyms (`showGymDots`) and the region editor's places (`ClusteredPlaces`): what is
 * wanted for a view (`wantedDots`) drawn into a group touching only the difference (`planDots`):
 * a place's own dot from `look.dot`, a cluster a circle with its count (`.cluster` and the look's
 * class) whose marker is changed in place or given to a new cluster rather than made anew, a tap
 * on it zooming in on its places. The `open` place is drawn on its own and never taken off. A
 * cluster may warn by its ring (`look.ring`, the class `outside`), set again whenever Leaflet makes
 * its element anew (its group put back on the map) and whenever `rings` is asked. A cluster's
 * words (its title, "12 gyms", and what `look.hover` adds) show over it on a desktop's hover and
 * are its `aria-label` (plan 8H-4H, review P6: no `title`, whose tooltip the browser would show).
 */

/** Where a cluster's words stand on hover: over its badge of 34 pixels (review P6 of 8H-4H). */
const HOVER_OFFSET: [number, number] = [0, -17];

/** How far a tap on a cluster zooms in at least. */
const CLUSTER_STEP = 2;

/** A place the layer draws: its id (its own dot's key), and where it is. */
export interface ClusterPlace {
  id: number;
  lat: number;
  lon: number;
}

/** How a layer's places and clusters look. */
export interface ClusterLook<P extends ClusterPlace> {
  /** The class its clusters carry beside `.cluster`; empty for none. */
  className: string;
  /** A cluster's title (the first of its words on hover and in its `aria-label`): "12 gyms". */
  title(count: number): string;
  /** A place's own dot, kept by the caller (the very same layer at each call). */
  dot(place: P): L.Layer;
  /** Whether a cluster of these places warns by its ring; never, without it. */
  ring?: (points: readonly P[]) => boolean;
  /**
   * What a cluster's words add after its title, read at each hover (`hoverName`) and as it is
   * drawn (plan 8H-4H: the gyms' parties while the Activity layer is on); its title alone while
   * it gives none, and without it: `shown` on hover, after "·"; `spoken` in its `aria-label`,
   * after a comma (review 8H4H-7: words, not symbols, for a screen reader).
   */
  hover?: (points: readonly P[]) => { shown: string; spoken: string } | undefined;
}

/** A cluster as drawn: its marker, its count's text, and its places. */
interface Bubble<P> {
  marker: L.Marker;
  label: HTMLElement;
  points: readonly P[];
  /** Its words as its element's `aria-label` has them; none before it is on the map. */
  named: string | undefined;
}

export class ClusterLayer<P extends ClusterPlace> {
  /** What is drawn, by its key (`wantedDots`), with what a cluster shows (`planDots`). */
  private readonly drawn = new Map<string, { layer: L.Layer; shows: DrawnDot }>();
  /** The clusters' markers by key: their count's text and their places, set in place. */
  private readonly bubbles = new Map<string, Bubble<P>>();

  constructor(
    private readonly map: L.Map,
    readonly group: L.LayerGroup,
    private readonly look: ClusterLook<P>,
  ) {}

  /**
   * Draws `places` for the view and its margin at `zoom`: the `open` place on its own, never
   * clustered nor taken off.
   */
  draw(places: readonly P[], view: Box, zoom: number, open?: number): void {
    const wanted = wantedDots(places, zoom, view, open);
    const shows = new Map([...this.drawn].map(([key, { shows: what }]) => [key, what]));
    const plan = planDots(shows, wanted, open === undefined ? undefined : dotKey(open));
    for (const key of plan.remove) {
      const layer = this.drawn.get(key)?.layer;
      if (layer) this.group.removeLayer(layer);
      this.drawn.delete(key);
      this.bubbles.delete(key);
    }
    for (const [from, to] of plan.move) {
      const shown = this.bubbles.get(from);
      const item = wanted.get(to);
      this.bubbles.delete(from);
      this.drawn.delete(from);
      if (!shown || item?.kind !== 'cluster') continue;
      this.reshow(shown, item);
      this.bubbles.set(to, shown);
      this.drawn.set(to, { layer: shown.marker, shows: showsOf(item) });
    }
    for (const key of plan.change) {
      const shown = this.bubbles.get(key);
      const item = wanted.get(key);
      if (!shown || item?.kind !== 'cluster') continue;
      this.reshow(shown, item);
      this.drawn.set(key, { layer: shown.marker, shows: showsOf(item) });
    }
    for (const key of plan.add) {
      const item = wanted.get(key);
      if (!item) continue;
      if (item.kind === 'dot') {
        const dot = this.look.dot(item.gym);
        dot.addTo(this.group);
        this.drawn.set(key, { layer: dot, shows: undefined });
        continue;
      }
      const made = this.bubble(item.points, item.lat, item.lon);
      made.marker.addTo(this.group);
      this.bubbles.set(key, made);
      this.drawn.set(key, { layer: made.marker, shows: showsOf(item) });
    }
  }

  /** A place's dot drawn outside the plan (its popup opened by the page), kept as drawn. */
  keep(place: P): void {
    const dot = this.look.dot(place);
    if (!this.group.hasLayer(dot)) {
      dot.addTo(this.group);
      this.drawn.set(dotKey(place.id), { layer: dot, shows: undefined });
    }
  }

  /** Every cluster's ring set again (what it warns of changed). */
  rings(): void {
    for (const bubble of this.bubbles.values()) this.ring(bubble);
  }

  /** Every cluster's words set again (what `look.hover` adds changed: review R3 of 8H-4H). */
  names(): void {
    for (const bubble of this.bubbles.values()) this.name(bubble);
  }

  /** Everything taken off the map and forgotten (new places). */
  clear(): void {
    this.group.clearLayers();
    this.drawn.clear();
    this.bubbles.clear();
  }

  /**
   * A cluster's words (review P6 of 8H-4H): its title and what `look.hover` adds, "6 gyms · ≈ 140
   * parties in this area" shown on hover (returned), and "6 gyms, about 140 parties in this area"
   * set as its element's `aria-label` (review 8H4H-7; no `title`, whose tooltip the browser would
   * show beside the page's own), touched only when they changed.
   */
  private name(bubble: Bubble<P>): string {
    const more = this.look.hover?.(bubble.points);
    const title = this.look.title(bubble.points.length);
    const label = more === undefined ? title : `${title}, ${more.spoken}`;
    if (bubble.named !== label) {
      const element = bubble.marker.getElement();
      if (element) {
        element.setAttribute('aria-label', label);
        bubble.named = label;
      }
    }
    return more === undefined ? title : `${title} · ${more.shown}`;
  }

  private ring(bubble: Bubble<P>): void {
    const { ring } = this.look;
    if (ring) bubble.marker.getElement()?.classList.toggle('outside', ring(bubble.points));
  }

  private bubble(points: readonly P[], lat: number, lon: number): Bubble<P> {
    // The count as text of an element of ours: Leaflet sets a string as HTML.
    const label = document.createElement('span');
    label.textContent = String(points.length);
    const { className } = this.look;
    const marker = L.marker([lat, lon], {
      icon: L.divIcon({
        html: label,
        className: className === '' ? 'cluster' : `cluster ${className}`,
        iconSize: [34, 34],
      }),
      keyboard: true,
      pmIgnore: true,
    });
    const made: Bubble<P> = { marker, label, points, named: undefined };
    marker.on('click', () => {
      const box = L.latLngBounds(made.points.map((point) => [point.lat, point.lon]));
      const zoom = Math.min(
        Math.max(
          this.map.getBoundsZoom(box, false, L.point(40, 40)),
          this.map.getZoom() + CLUSTER_STEP,
        ),
        CLUSTER_BELOW,
      );
      this.map.setView(box.getCenter(), zoom);
    });
    // Leaflet makes the element anew each time its group is put back on the map: its ring too.
    marker.on('add', () => {
      made.named = undefined;
      this.ring(made);
      this.name(made);
    });
    // A desktop's mouse over it, over its badge; a tap still zooms in (`hoverName` shows nothing
    // for a finger).
    hoverName(this.map, marker, () => this.name(made), undefined, HOVER_OFFSET);
    return made;
  }

  /**
   * A cluster's marker shows `item` (plan 8M-11B, S13): its count, its title, its places and its
   * ring, and it moves to their middle; only what changed is touched.
   */
  private reshow(shown: Bubble<P>, item: { points: P[]; lat: number; lon: number }): void {
    const count = String(item.points.length);
    if (shown.label.textContent !== count) {
      shown.label.textContent = count;
    }
    shown.points = item.points;
    this.name(shown);
    this.ring(shown);
    shown.marker.setLatLng([item.lat, item.lon]);
  }
}

function showsOf<P>(item: WantedDot<P>): DrawnDot {
  return item.kind === 'cluster'
    ? { count: item.points.length, lat: item.lat, lon: item.lon }
    : undefined;
}
