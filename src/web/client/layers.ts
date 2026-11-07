/**
 * The tiles the map offers (spec 2.3, plan 8M-7): by `settings.web.tiles`, Stadia Maps' Alidade
 * Smooth in the device's light or dark (no key: Stadia checks the page's domain, and `localhost`
 * works without one), falling back to OpenStreetMap's standard tiles a while once Stadia refuses
 * its tiles (`StadiaFallback`); OpenStreetMap's alone; or with `tiles: 'google'`
 * and a browser key Google's roadmap, satellite and hybrid beside Stadia's, through the Map Tiles
 * API (a session per layer, then 2D tiles; never the raw `mt*.google.com` addresses).
 * OpenStreetMap's tiles have no dark style: in dark they are darkened by a filter of the page
 * (`darkFilter`, `map.css`).
 */

/** OpenStreetMap's attribution as its tile policy asks (HTML of ours, for Leaflet). */
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Stadia Maps' attribution as its terms ask (HTML of ours, for Leaflet). */
export const STADIA_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> ' +
  '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const MAP_TILES = 'https://tile.googleapis.com';

/** The tiles a page is told to show (`data-tiles`, `shownTiles` of the server). */
export type TileSetting = 'stadia' | 'osm' | 'google';

/** The device's scheme. */
export type Scheme = 'light' | 'dark';

/** A layer of plain tiles by a template of Leaflet's: Stadia's or OpenStreetMap's. */
export interface XyzSpec {
  kind: 'xyz';
  provider: 'stadia' | 'osm';
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  /** The zoom past which its own pictures are enlarged (OpenStreetMap's stop at 19). */
  maxNativeZoom?: number;
  /** Darkened by the page's filter: OpenStreetMap's tiles in dark. */
  darkFilter: boolean;
}

export type TileLayerSpec =
  | XyzSpec
  | {
      kind: 'google';
      name: string;
      mapType: 'roadmap' | 'satellite';
      /** Roads over the satellite pictures: the hybrid. */
      roads: boolean;
      maxZoom: number;
    };

/** OpenStreetMap's standard tiles, filtered in dark. */
function osmTiles(scheme: Scheme): XyzSpec {
  return {
    kind: 'xyz',
    provider: 'osm',
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    // Its pictures stop at 19; enlarged past it, so the map reaches Stadia's 20 either way.
    maxNativeZoom: 19,
    maxZoom: 20,
    darkFilter: scheme === 'dark',
  };
}

/** Stadia's Alidade Smooth, or Alidade Smooth Dark; `{r}` is `@2x` on a sharp screen. */
function stadiaTiles(scheme: Scheme): XyzSpec {
  const style = scheme === 'dark' ? 'alidade_smooth_dark' : 'alidade_smooth';
  return {
    kind: 'xyz',
    provider: 'stadia',
    name: 'Stadia Maps',
    url: `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}{r}.png`,
    attribution: STADIA_ATTRIBUTION,
    maxZoom: 20,
    darkFilter: false,
  };
}

/**
 * The layers of the layer switch, the base first (the one shown at first): Stadia's in the
 * scheme's style, or OpenStreetMap's once Stadia refused (`stadiaRefused`) or for `'osm'`; with
 * `'google'` and a key, Google's three after it.
 */
export function tileLayers(
  tiles: TileSetting,
  googleKey: string | undefined,
  scheme: Scheme,
  stadiaRefused = false,
): TileLayerSpec[] {
  const base = tiles === 'osm' || stadiaRefused ? osmTiles(scheme) : stadiaTiles(scheme);
  if (tiles !== 'google' || googleKey === undefined || googleKey === '') return [base];
  return [
    base,
    { kind: 'google', name: 'Google roadmap', mapType: 'roadmap', roads: false, maxZoom: 20 },
    { kind: 'google', name: 'Google satellite', mapType: 'satellite', roads: false, maxZoom: 20 },
    { kind: 'google', name: 'Google hybrid', mapType: 'satellite', roads: true, maxZoom: 20 },
  ];
}

/** The first wait on OpenStreetMap's tiles before Stadia's are tried again: five minutes. */
export const STADIA_RETRY_FIRST_MS = 5 * 60_000;
/** The longest wait: each switch doubles it (10, 20, 40 minutes), up to an hour. */
export const STADIA_RETRY_MAX_MS = 60 * 60_000;

/** Runs `then` after `ms`; what it returns cancels it. */
export type Wait = (ms: number, then: () => void) => () => void;

/** The page's own timers. */
const timerWait: Wait = (ms, then) => {
  const timer = setTimeout(then, ms);
  return () => {
    clearTimeout(timer);
  };
};

/**
 * Whether Stadia refused (plan 8M-7): a 401 on a domain Stadia does not know (a quick tunnel's),
 * a 429 past the month's credits, or the network away a while; the page cannot see which, only
 * that tiles fail. Three failed tiles in a row with none loaded between, or the first two tiles of
 * the visit both failed, switch the base layer to OpenStreetMap's; a tile that loads starts the
 * run again, so a hiccup of the network is no refusal. Nothing switches where Stadia's tiles are
 * not shown.
 * Stadia is tried again after a while (Matt, 2026-11-07: "I'd say retry"): five minutes after
 * the switch `tryAgain` is called to bring Stadia's tiles back, quietly; three more failed in a row
 * switch back to OpenStreetMap's with the wait doubled, up to an hour (5, 10, 20, 40, 60, 60 …
 * minutes). The wait never shrinks in a visit: tiles the browser kept would load at a try and
 * would reset it while Stadia still refuses new ones. While OpenStreetMap's are shown their tiles
 * count for nothing.
 */
export class StadiaFallback {
  refused = false;
  private failedInRow = 0;
  /** The first two failed tiles switch, until a tile loaded or Stadia was tried again. */
  private quickSwitch = true;
  private waitMs = STADIA_RETRY_FIRST_MS;
  private cancel: (() => void) | undefined;

  constructor(
    private readonly tiles: TileSetting,
    private readonly tryAgain: () => void = () => undefined,
    private readonly wait: Wait = timerWait,
  ) {}

  /** A tile of the base layer loaded. */
  tileLoaded(): void {
    if (this.refused) return;
    this.quickSwitch = false;
    this.failedInRow = 0;
  }

  /** A tile of the base layer failed: true when this is the switch to OpenStreetMap's. */
  tileFailed(): boolean {
    if (this.tiles === 'osm' || this.refused) return false;
    this.failedInRow += 1;
    if (this.failedInRow < 3 && (!this.quickSwitch || this.failedInRow < 2)) return false;
    this.refused = true;
    this.failedInRow = 0;
    const waited = this.waitMs;
    this.waitMs = Math.min(waited * 2, STADIA_RETRY_MAX_MS);
    this.cancel = this.wait(waited, () => {
      this.cancel = undefined;
      this.refused = false;
      this.quickSwitch = false;
      this.tryAgain();
    });
    return true;
  }

  /** No more tries: the map is gone. */
  stop(): void {
    this.cancel?.();
    this.cancel = undefined;
  }
}

/** What `BaseAttribution` needs of Leaflet's attribution control. */
export interface AttributionControl {
  addAttribution(text: string): void;
  removeAttribution(text: string): void;
}

/**
 * The credit of the base tiles, kept by the page itself (the layers carry none): the base shown,
 * alone, so that OpenStreetMap's replaces Stadia's at the switch and none stays behind; none
 * while a Google layer is chosen (Google's own is `googleAttribution`).
 */
export class BaseAttribution {
  private shown: string | undefined;

  constructor(private readonly control: AttributionControl | undefined) {}

  show(spec: XyzSpec | undefined): void {
    if (this.shown !== undefined) this.control?.removeAttribution(this.shown);
    this.shown = spec?.attribution;
    if (this.shown !== undefined) this.control?.addAttribution(this.shown);
  }
}

/** The body of `createSession` for a Google layer. */
export function sessionRequest(spec: Extract<TileLayerSpec, { kind: 'google' }>): {
  mapType: string;
  language: string;
  region: string;
  layerTypes?: string[];
} {
  return {
    mapType: spec.mapType,
    language: 'en-US',
    region: 'US',
    ...(spec.roads ? { layerTypes: ['layerRoadmap'] } : {}),
  };
}

/** Where a session is created (POST, JSON). */
export function sessionUrl(key: string): string {
  return `${MAP_TILES}/v1/createSession?key=${encodeURIComponent(key)}`;
}

/** The tile address of a session, as Leaflet's template. */
export function googleTileUrl(session: string, key: string): string {
  return `${MAP_TILES}/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`;
}

/** Where the attribution of what is in view is asked for. */
export function viewportUrl(
  session: string,
  key: string,
  zoom: number,
  bounds: { north: number; south: number; east: number; west: number },
): string {
  const query = new URLSearchParams({
    session,
    key,
    zoom: String(zoom),
    north: String(bounds.north),
    south: String(bounds.south),
    east: String(bounds.east),
    west: String(bounds.west),
  });
  return `${MAP_TILES}/tile/v1/viewport?${query.toString()}`;
}

/**
 * The attribution of Google's tiles: "Google Maps" (Google's policies: its logo where there is
 * room, the words otherwise) and the copyright of what is in view, as Google wrote it, escaped
 * for Leaflet, which shows attributions as HTML.
 */
export function googleAttribution(copyright: string): string {
  const text = copyright.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text.trim() === '' ? 'Google Maps' : `Google Maps · ${text}`;
}
