import * as L from 'leaflet';
import {
  googleAttribution,
  googleTileUrl,
  sessionRequest,
  sessionUrl,
  BaseAttribution,
  StadiaFallback,
  tileLayers,
  viewportUrl,
  type Scheme,
  type TileLayerSpec,
  type TileSetting,
  type XyzSpec,
} from './layers.js';
import { getJson, say } from './page-frame.js';
import { darkScheme, onThemeChange } from './theme.js';

// The page's frame, without Leaflet (plan 8H-5), for the map's modules as before.
export { byId, getJson, hideNotice, say, showAccount, whoIsAsking } from './page-frame.js';

/**
 * What the map page and the region editor share (plans 8M-1, 8M-2): the tiles with Google's
 * layers, and the page's frame (`page-frame.ts`: the elements of the page, reading JSON, the
 * line under the header, and the header with the login).
 */

/**
 * Said once per switch to OpenStreetMap's tiles (Matt, 2026-11-07), so that a member knows why the
 * map looks different; Stadia's coming back says nothing.
 */
export const OSM_NOTICE =
  "The usual map tiles could not be loaded, so the map shows OpenStreetMap's for now.";

/** How long the map rests before Google is asked for the attribution of what is in view. */
const ATTRIBUTION_DELAY_MS = 500;

/** The Google layer of a spec: a session asked for when it is first shown, then its tiles. */
function googleLayer(
  map: L.Map,
  spec: Extract<TileLayerSpec, { kind: 'google' }>,
  key: string,
): L.LayerGroup {
  const group = L.layerGroup();
  let session: Promise<string> | undefined;
  let attribution: string | undefined;
  let timer: number | undefined;
  const setAttribution = (text: string | undefined): void => {
    if (attribution !== undefined) map.attributionControl.removeAttribution(attribution);
    attribution = text;
    if (text !== undefined) map.attributionControl.addAttribution(text);
  };
  const refresh = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!session || !map.hasLayer(group)) return;
      void session
        .then((id) => {
          const bounds = map.getBounds();
          return getJson<{ copyright?: string }>(
            viewportUrl(id, key, map.getZoom(), {
              north: bounds.getNorth(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              west: bounds.getWest(),
            }),
            { credentials: 'omit' },
          );
        })
        .then((answer) => {
          if (map.hasLayer(group)) setAttribution(googleAttribution(answer.copyright ?? ''));
        })
        .catch(() => setAttribution(googleAttribution('')));
    }, ATTRIBUTION_DELAY_MS);
  };
  group.on('add', () => {
    setAttribution(googleAttribution(''));
    session ??= getJson<{ session: string }>(sessionUrl(key), {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sessionRequest(spec)),
    }).then((answer) => answer.session);
    session
      .then((id) => {
        if (group.getLayers().length === 0) {
          group.addLayer(L.tileLayer(googleTileUrl(id, key), { maxZoom: spec.maxZoom }));
        }
        refresh();
      })
      .catch(() => {
        session = undefined;
        say("Google's map could not be loaded.");
      });
    map.on('moveend', refresh);
  });
  group.on('remove', () => {
    map.off('moveend', refresh);
    window.clearTimeout(timer);
    setAttribution(undefined);
  });
  return group;
}

/**
 * The page's one `StadiaFallback` (review F1): the map and the region editor's map, one hidden
 * while the other is shown, switch together, on one wait and with one notice, each map by its
 * own `swap`. The last map to unload stops the tries, and a map added after starts anew.
 */
interface PageTiles {
  fallback: StadiaFallback;
  swaps: Set<() => void>;
}

let shared: PageTiles | undefined;

const swapAll = (page: PageTiles): void => {
  for (const swap of page.swaps) swap();
};

function pageTiles(setting: TileSetting): PageTiles {
  if (shared !== undefined) return shared;
  const swaps = new Set<() => void>();
  const page: PageTiles = {
    swaps,
    // Stadia tried again: every map's base drawn anew, quietly.
    fallback: new StadiaFallback(setting, () => {
      for (const swap of swaps) swap();
    }),
  };
  shared = page;
  return page;
}

function leaveTiles(page: PageTiles, swap: () => void): void {
  page.swaps.delete(swap);
  if (page.swaps.size > 0) return;
  page.fallback.stop();
  if (shared === page) shared = undefined;
}

/** A plain layer of tiles; its credit is the page's own (`BaseAttribution`). */
const xyzLayer = (spec: XyzSpec): L.TileLayer =>
  L.tileLayer(spec.url, {
    maxZoom: spec.maxZoom,
    ...(spec.maxNativeZoom === undefined ? {} : { maxNativeZoom: spec.maxNativeZoom }),
  });

/** The tiles a page's `data-tiles` names. */
export function tileSetting(value: string | undefined): TileSetting {
  return value === 'google' || value === 'osm' ? value : 'stadia';
}

/**
 * The tiles of the setting (`tileLayers`), the base shown first, with a switch where Google's are
 * offered too (plan 8M-7): the base follows the device's light or dark (`onThemeChange`), and
 * once Stadia refuses its tiles it is OpenStreetMap's until Stadia's are tried again, after five
 * minutes and then longer (`StadiaFallback`, one for the page: `pageTiles`), the credit following
 * the base shown (`BaseAttribution`); the switch is said once in the notice band (`OSM_NOTICE`).
 * The tries stop with the page's last map (`unload`).
 * While OpenStreetMap's base is shown in dark, the map's container has `tiles-darkened`, whose
 * filter in `map.css` darkens the tile pane (never Google's).
 */
export function addTiles(map: L.Map, setting: TileSetting, key: string | undefined): void {
  const page = pageTiles(setting);
  const { fallback } = page;
  const credit = new BaseAttribution(map.attributionControl);
  const scheme = (): Scheme => (darkScheme() ? 'dark' : 'light');
  const baseSpec = (): XyzSpec => {
    const [base] = tileLayers(setting, key, scheme(), fallback.refused);
    if (base?.kind !== 'xyz') throw new Error('the base tiles are plain tiles');
    return base;
  };
  let spec = baseSpec();
  let base = xyzLayer(spec);
  const googles = tileLayers(setting, key, scheme()).filter(
    (one): one is Extract<TileLayerSpec, { kind: 'google' }> => one.kind === 'google',
  );
  const order = [spec.name, ...googles.map((one) => one.name)];
  const control =
    googles.length === 0
      ? undefined
      : L.control.layers(
          Object.fromEntries(googles.map((one) => [one.name, googleLayer(map, one, key ?? '')])),
          undefined,
          {
            position: 'topright',
            sortLayers: true,
            // The base first, then Google's in their order, whatever was swapped in since.
            sortFunction: (_a, _b, nameA, nameB) =>
              (order.indexOf(nameA) + 1 || order.length + 1) -
              (order.indexOf(nameB) + 1 || order.length + 1),
          },
        );
  const darkened = (): void => {
    map.getContainer().classList.toggle('tiles-darkened', spec.darkFilter && map.hasLayer(base));
    credit.show(map.hasLayer(base) ? spec : undefined);
  };
  /**
   * The base drawn anew in the scheme's style, or OpenStreetMap's while Stadia is refused, or
   * Stadia's again when it is tried again.
   */
  const swap = (): void => {
    const next = baseSpec();
    if (next.url === spec.url) {
      spec = next;
      darkened();
      return;
    }
    const shown = map.hasLayer(base);
    control?.removeLayer(base);
    map.removeLayer(base);
    base.off('tileerror tileload');
    spec = next;
    order[0] = spec.name;
    base = watched(xyzLayer(spec));
    control?.addBaseLayer(base, spec.name);
    if (shown) base.addTo(map);
    darkened();
  };
  const watched = (layer: L.TileLayer): L.TileLayer =>
    layer
      .on('tileload', () => {
        fallback.tileLoaded();
      })
      .on('tileerror', () => {
        if (!fallback.tileFailed()) return;
        swapAll(page);
        say(OSM_NOTICE);
      });
  page.swaps.add(swap);
  map.on('unload', () => {
    leaveTiles(page, swap);
  });
  base = watched(base);
  control?.addBaseLayer(base, spec.name);
  base.addTo(map);
  control?.addTo(map);
  map.on('baselayerchange', darkened);
  onThemeChange(swap);
  darkened();
}
