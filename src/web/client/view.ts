import type { GeoView } from '../../domain/web/geo-data.js';

/**
 * Where the map opens and how far it may go (plan 8M-7), as pure functions of what the page
 * knows: the server's regions, your location when the browser shares it already, the region
 * `/maps` named (`?region=<id>`), and where you last left the map (kept per server in the
 * browser). The map never zooms out past the zoom that shows every region of the server, and
 * panning stops a quarter of their size beyond them; a server without regions has no limits.
 */

/** A box of the map, in degrees. */
export interface Box {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** Where the map was left: its middle and zoom. */
export interface LastView extends LatLon {
  zoom: number;
}

/** The zoom the map opens at on a place: street level. */
export const STREET_ZOOM = 15;
/** How far beyond the regions panning goes, as a share of their size each way. */
export const PAN_MARGIN = 0.25;
/** The size of a tile, in pixels. */
const TILE = 256;

/** The box of every region's outline; undefined for none. */
export function regionsBox(regions: GeoView['regions']): Box | undefined {
  const points = regions.flatMap((region) => region.outline);
  if (points.length === 0) return undefined;
  const lats = points.map(([lat]) => lat);
  const lons = points.map(([, lon]) => lon);
  return {
    south: Math.min(...lats),
    west: Math.min(...lons),
    north: Math.max(...lats),
    east: Math.max(...lons),
  };
}

/** A box grown by `share` of its height and width each way. */
export function paddedBox(box: Box, share: number): Box {
  const height = (box.north - box.south) * share;
  const width = (box.east - box.west) * share;
  return {
    south: box.south - height,
    west: box.west - width,
    north: box.north + height,
    east: box.east + width,
  };
}

/** Whether a place lies in a box. */
export function inBox(box: Box, place: LatLon): boolean {
  return (
    place.lat >= box.south &&
    place.lat <= box.north &&
    place.lon >= box.west &&
    place.lon <= box.east
  );
}

/** The middle of a box. */
export function middleOf(box: Box): LatLon {
  return { lat: (box.south + box.north) / 2, lon: (box.west + box.east) / 2 };
}

/** Where a latitude lies down the world's square of Web Mercator, from 0 (north) to 1. */
function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}

/**
 * The greatest whole zoom at which a box shows whole in `width` by `height` pixels (Web
 * Mercator, tiles of 256 pixels), as Leaflet's `getBoundsZoom` without padding.
 */
export function fitZoom(box: Box, width: number, height: number): number {
  const across = (box.east - box.west) / 360;
  const down = mercatorY(box.south) - mercatorY(box.north);
  const byWidth = across > 0 ? Math.log2(width / (TILE * across)) : Infinity;
  const byHeight = down > 0 ? Math.log2(height / (TILE * down)) : Infinity;
  const zoom = Math.floor(Math.min(byWidth, byHeight));
  return Number.isFinite(zoom) ? Math.max(0, zoom) : 0;
}

/**
 * How far the map may go for a server: never out past the zoom that fits all its regions in the
 * map's size (worked out again when the map is resized), never panned more than a quarter of
 * their size beyond them. Undefined for a server without regions: no limits.
 */
export function zoomLimits(
  regions: GeoView['regions'],
  size: { width: number; height: number },
): { minZoom: number; maxBounds: Box } | undefined {
  const box = regionsBox(regions);
  if (!box) return undefined;
  return { minZoom: fitZoom(box, size.width, size.height), maxBounds: paddedBox(box, PAN_MARGIN) };
}

/**
 * Whether the map may go to a place: within the regions and the margin panning stops at
 * (`zoomLimits`); any place for a server without regions. Your location is taken only so, where
 * the map opens (`startView`) and where the Report button's step 2 measures from (review B5).
 */
export function withinReach(regions: GeoView['regions'], place: LatLon): boolean {
  const all = regionsBox(regions);
  return all === undefined || inBox(paddedBox(all, PAN_MARGIN), place);
}

/** What the page knows as it opens. */
export interface StartFacts {
  /** Your location, when the browser had granted it already (never asked for on load). */
  located?: LatLon;
  /** The region `/maps` named (`?region=<id>`). */
  region?: number;
  /** Where you last left the map of this server. */
  last?: LastView;
  regions: GeoView['regions'];
}

export type StartView =
  { kind: 'point'; center: LatLon; zoom: number } | { kind: 'fit'; box: Box } | { kind: 'none' };

/**
 * Where the map opens, the first that applies: (1) your location, at street level; (2) the region
 * `/maps` named, at street level at the middle of its box (an explicit `/maps` wins over the
 * last view); (3) where you last left it, at its own zoom; (4) the whole server. A location or
 * last view beyond the regions and their margin (where panning cannot go) is passed over.
 */
export function startView(facts: StartFacts): StartView {
  const all = regionsBox(facts.regions);
  const reachable = (place: LatLon): boolean => withinReach(facts.regions, place);
  if (facts.located && reachable(facts.located)) {
    return { kind: 'point', center: facts.located, zoom: STREET_ZOOM };
  }
  const named = facts.regions.find((region) => region.id === facts.region);
  const box = named ? regionsBox([named]) : undefined;
  if (box) return { kind: 'point', center: middleOf(box), zoom: STREET_ZOOM };
  if (facts.last && reachable(facts.last)) {
    const { lat, lon, zoom } = facts.last;
    return { kind: 'point', center: { lat, lon }, zoom };
  }
  return all ? { kind: 'fit', box: all } : { kind: 'none' };
}

/**
 * Whether the member moved the map since it was placed (plan 8M-7): any move or zoom once the
 * start view is set (`begin`) counts, a drag, the zoom buttons, a tap on a line of the list that
 * flies the map; then a location that comes late does not take the map away.
 */
export class MemberMoves {
  moved = false;
  private started = false;

  /** The start view is set: what moves the map from now on is the member's. */
  begin(): void {
    this.started = true;
  }

  /** The map started to move or zoom. */
  seen(): void {
    if (this.started) this.moved = true;
  }
}

/** The region `/maps` named in the page's address (`?region=<id>`), if any. */
export function regionOf(search: string): number | undefined {
  const value = new URLSearchParams(search).get('region') ?? '';
  return /^\d{1,10}$/u.test(value) ? Number(value) : undefined;
}

/** What the page needs of the browser's `localStorage`, which may refuse (private mode, full). */
export interface ViewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const viewKey = (guild: string): string => `pine-map-view:${guild}`;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Where the map of a server was last left in this browser; none when nothing (good) is kept. */
export function readLastView(
  storage: ViewStorage | undefined,
  guild: string,
): LastView | undefined {
  try {
    const kept = JSON.parse(storage?.getItem(viewKey(guild)) ?? 'null') as Partial<LastView> | null;
    if (!kept || !isNumber(kept.lat) || !isNumber(kept.lon) || !isNumber(kept.zoom)) {
      return undefined;
    }
    return { lat: kept.lat, lon: kept.lon, zoom: kept.zoom };
  } catch {
    return undefined;
  }
}

/** Keeps where the map of a server is left; a browser that keeps nothing is left alone. */
export function writeLastView(
  storage: ViewStorage | undefined,
  guild: string,
  view: LastView,
): void {
  try {
    storage?.setItem(viewKey(guild), JSON.stringify(view));
  } catch {
    // Private mode or a full storage: the next visit opens on the server's own start.
  }
}
