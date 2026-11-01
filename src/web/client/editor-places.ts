import type * as L from 'leaflet';
import { ClusterLayer } from './cluster-layer.js';
import { clusterWarns, type EditorPlace } from './editor-view.js';
import { renderNode } from './popup.js';

/**
 * One layer of the region editor's places (plan 8M-11C, S30): gyms, PokéStops, Power Spots or
 * Wayfarer gyms, drawn for the view and a margin round it and clustered below street level by the
 * live map's clusterer and its Leaflet side (`ClusterLayer`, which the live map's gyms use too): a
 * place a dot of its kind's color, made once and kept, edged in the warning color while it lies in
 * no region; a cluster a circle with its count (`.cluster` of `map.css`, `places-<layer>` of
 * `editor.css`), its ring in the warning color while one of its places lies in no region
 * (`clusterWarns`, `.outside`); a tap zooms in on it. Drawn anew at each `moveend`, while its
 * layer is on (the layer switch keeps its toggle: off, nothing is worked out; on again, drawn at
 * once, the rings with it).
 */

/** What a layer needs of the editor. */
export interface PlaceLook {
  /** The class its clusters carry beside `.cluster` (`editor.css`). */
  className: string;
  /** A cluster's title (its tooltip, what a screen reader says): "12 gyms". */
  title(count: number): string;
  /** A place's dot: filled in its kind's color, edged in it or in the warning one. */
  dot(place: EditorPlace, outside: boolean): L.CircleMarker;
  /** The edge of a dot: its kind's color, or the warning one. */
  colour(outside: boolean): string;
}

export class ClusteredPlaces {
  private places: readonly EditorPlace[] = [];
  /** The places in no region, by `id`. */
  private outside: ReadonlySet<number> = new Set();
  private readonly dots = new Map<number, L.CircleMarker>();
  private readonly layer: ClusterLayer<EditorPlace>;

  constructor(
    private readonly map: L.Map,
    /** The layer the switch toggles: everything is drawn into it. */
    readonly group: L.LayerGroup,
    private readonly look: PlaceLook,
  ) {
    this.layer = new ClusterLayer(map, group, {
      className: look.className,
      title: (count) => look.title(count),
      dot: (place) => this.dot(place),
      ring: (points) => clusterWarns(points, this.outside),
    });
  }

  /** New places (the data loaded anew): everything drawn before is taken off. */
  setPlaces(places: readonly EditorPlace[]): void {
    this.places = places;
    this.layer.clear();
    this.dots.clear();
  }

  /**
   * The places in no region changed: dots and rings colored anew, nothing else redrawn (while
   * the layer is off, the rings are set as it is put back).
   */
  setOutside(outside: ReadonlySet<number>): void {
    const before = this.outside;
    this.outside = outside;
    for (const [id, dot] of this.dots) {
      if (before.has(id) !== outside.has(id)) {
        dot.setStyle({ color: this.look.colour(outside.has(id)) });
      }
    }
    this.layer.rings();
  }

  /** Draws what the view wants (its layer on), touching only the difference. */
  refresh(): void {
    const { map } = this;
    if (!map.hasLayer(this.group)) return;
    const bounds = map.getBounds();
    const view = {
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    };
    this.layer.draw(this.places, view, map.getZoom());
  }

  /** A place's dot, made on first use with its tooltip (made when shown). */
  private dot(place: EditorPlace): L.CircleMarker {
    const made = this.dots.get(place.id);
    if (made) return made;
    const dot = this.look
      .dot(place, this.outside.has(place.id))
      .bindTooltip(() => renderNode({ tag: 'span', text: place.name }, document));
    this.dots.set(place.id, dot);
    return dot;
  }
}
