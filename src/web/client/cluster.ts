/**
 * Pine's own grid clustering of the map's background places (plan 8M-7; Leaflet.markercluster's
 * last release is from 2020): below street level the places that fall in one cell of a grid
 * fixed on the world (so that a cluster does not change as the map pans) are one cluster, drawn
 * as a circle with its count at the middle of its places; a tap zooms in on it. Live things
 * (raids, trains, meetups) never cluster. And when the PokéStops and Power Spots of the view are
 * asked for: from street level, while their layer is on, for a member (`PlacesInView`).
 */

/** From this zoom places are drawn one by one. */
export const CLUSTER_BELOW = 16;
/** The PokéStops and Power Spots are drawn from this zoom. */
export const PLACES_FROM = 16;
/**
 * A cell of the grid at a zoom, in pixels of the map (plan 8M-11B, S13: fewer clusters zoomed out,
 * where Pittsburgh's gyms made some 700 of them in the view and its margin): 60 from zoom 15, 90
 * at 13 and 14, 120 at 12 and below.
 */
export function cellPixels(zoom: number): number {
  if (zoom >= 15) return 60;
  return zoom >= 13 ? 90 : 120;
}
const TILE = 256;

export interface Cluster<P> {
  /** Its cell of the grid at the zoom (`x:y`); none from `CLUSTER_BELOW`, where none are made. */
  cell?: string;
  points: P[];
  /** The middle of its places. */
  lat: number;
  lon: number;
}

/** Where a place is on the world's square at a zoom, in pixels (Web Mercator). */
function pixelOf(place: { lat: number; lon: number }, zoom: number): { x: number; y: number } {
  const size = TILE * 2 ** zoom;
  const sin = Math.sin((place.lat * Math.PI) / 180);
  return {
    x: ((place.lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/**
 * The clusters of places at a zoom, in the order their first place comes; from `CLUSTER_BELOW`
 * each place is a cluster of its own.
 */
export function clustersAt<P extends { lat: number; lon: number }>(
  points: readonly P[],
  zoom: number,
  cell = cellPixels(zoom),
): Cluster<P>[] {
  if (zoom >= CLUSTER_BELOW)
    return points.map((point) => ({ points: [point], ...middle([point]) }));
  const cells = new Map<string, P[]>();
  for (const point of points) {
    const { x, y } = pixelOf(point, zoom);
    const key = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
    const there = cells.get(key);
    if (there) there.push(point);
    else cells.set(key, [point]);
  }
  return [...cells].map(([cell, group]) => ({ cell, points: group, ...middle(group) }));
}

/** A place's cell of the grid at a zoom (`x:y`), as `clustersAt` lays it. */
function cellOf(place: { lat: number; lon: number }, zoom: number): string {
  const cell = cellPixels(zoom);
  const { x, y } = pixelOf(place, zoom);
  return `${String(Math.floor(x / cell))}:${String(Math.floor(y / cell))}`;
}

/**
 * The places of `others` that fall in a cell of the grid of `points` at a zoom (review P7 of
 * 8H-4H: the gyms a raid's marker hides still belong to their cluster's area); none from
 * `CLUSTER_BELOW`, where a place is its own.
 */
export function inCellsOf<P extends { lat: number; lon: number }>(
  points: readonly { lat: number; lon: number }[],
  others: readonly P[],
  zoom: number,
): P[] {
  if (zoom >= CLUSTER_BELOW) return [];
  const cells = new Set(points.map((point) => cellOf(point, zoom)));
  return others.filter((other) => cells.has(cellOf(other, zoom)));
}

function middle(points: readonly { lat: number; lon: number }[]): { lat: number; lon: number } {
  const sum = points.reduce(
    (total, point) => ({ lat: total.lat + point.lat, lon: total.lon + point.lon }),
    {
      lat: 0,
      lon: 0,
    },
  );
  return { lat: sum.lat / points.length, lon: sum.lon / points.length };
}

/** Whether the PokéStops or Power Spots of the view are wanted. */
export function placesWanted(
  on: boolean,
  zoom: number,
  member: boolean,
  /** A report picks these places (plan 8M-9A, A4): drawn whatever the layer, as route mode draws the gyms. */
  forced = false,
): boolean {
  return (on || forced) && member && zoom >= PLACES_FROM;
}

/**
 * The places of an answer of `/api/stops` or `/api/powerspots` (`[id, lat, lon, title]`) that are
 * drawn: not those whose own thing the map draws in their place (plan 8M-9A, A6: a Power Spot with
 * a battle shows the battle; one card per thing at a place), by id.
 */
export function unoccupied<P extends readonly [string, ...unknown[]]>(
  places: readonly P[],
  occupied: ReadonlySet<string>,
): P[] {
  return places.filter(([id]) => !occupied.has(id));
}

/** What `PlacesInView` drives: the loads of `StopLoads`, and taking the places off the map. */
export interface PlacesInViewDeps {
  loads: { now(): void; moved(): void; stop(): void };
  clear(): void;
}

/**
 * The PokéStops or Power Spots of the view (`/api/stops`, `/api/powerspots`): asked for at once
 * when they become wanted, again once the map has rested after it moved (the loads' debounce),
 * and taken off the map, nothing more asked or shown, once they are not.
 */
export class PlacesInView {
  private active = false;

  constructor(private readonly deps: PlacesInViewDeps) {}

  /** The layer, the zoom or the view changed; `moved`: the map moved (a pan or a zoom). */
  changed(wanted: boolean, moved = false): void {
    if (!wanted) {
      if (!this.active) return;
      this.active = false;
      this.deps.loads.stop();
      this.deps.clear();
      return;
    }
    if (!this.active) {
      this.active = true;
      this.deps.loads.now();
      return;
    }
    if (moved) this.deps.loads.moved();
  }
}
