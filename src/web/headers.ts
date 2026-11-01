import { MEGA_PORTRAIT_BASE, POKEMON_ICON_BASE } from '../domain/pogo/pokemon-icons.js';
import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
import { CONTINUE_SCRIPT_SOURCE } from './continue-script.js';

/** OpenStreetMap's standard tiles (one host since 2024; no subdomains). */
export const OSM_TILES = 'https://tile.openstreetmap.org';
/** Google's Map Tiles API: its sessions, its 2D tiles and its attribution. */
export const GOOGLE_TILES = 'https://tile.googleapis.com';
/** Stadia Maps' raster tiles (plan 8M-7): Alidade Smooth, light and dark. */
export const STADIA_TILES = 'https://tiles.stadiamaps.com';

/** The tiles a page shows (`settings.web.tiles`, plan 8M-7). */
export type TileSetting = 'stadia' | 'osm' | 'google';

/**
 * The tiles the pages show by the setting: Google's only with the browser key, Stadia's in their
 * place without it (Stadia needs no key: it checks the page's domain).
 */
export function shownTiles(setting: TileSetting, googleKey: string | undefined): TileSetting {
  return setting === 'google' && googleKey === undefined ? 'stadia' : setting;
}

export interface PolicyOptions {
  /**
   * The tiles the page shows (`shownTiles`): Stadia's with OpenStreetMap's to fall back to,
   * OpenStreetMap's alone, or Google's beside Stadia's.
   */
  tiles: TileSetting;
  /** The origins of the pictures posts show (`pictureOrigins`). */
  pictureOrigins: readonly string[];
}

/**
 * The origins the pictures of posts come from: the Pokémon icons (`pokemonPicture`; the raid
 * boss feed's pictures, the stops' rewards, catches and leaders' portraits are on the same CDN),
 * the megas' portraits (`MEGA_PORTRAIT_BASE`), the game's encounter picture of the stops (plan
 * 8R-6, `ENCOUNTER_PICTURE`; the same host today) and the raid eggs and the stops' square
 * pictures, which Pine serves itself (`eggPictures`, plan 8D-F, and `StopPictures`: `publicUrl`),
 * each once.
 */
export function pictureOrigins(publicUrl: string): string[] {
  return [
    ...new Set(
      [POKEMON_ICON_BASE, MEGA_PORTRAIT_BASE, ENCOUNTER_PICTURE, publicUrl].map(
        (url) => new URL(url).origin,
      ),
    ),
  ];
}

/**
 * The Content Security Policy of every answer (spec 2.2): scripts, styles and fonts from Pine
 * alone, no inline script but the login link page's `CONTINUE_SCRIPT`, by its hash (review fix
 * 6); pictures from Pine, the tile hosts and the posts' picture hosts
 * (Stadia's unless the tiles are OpenStreetMap's alone, plan 8M-7; OpenStreetMap's always, the
 * fallback); connections to Pine and, with Google's tiles, the Map Tiles API; no frames, no
 * `<base>`, forms only to Pine. Leaflet sets `style` attributes from its script, which
 * `style-src` does not govern (it covers style elements and attributes in the markup).
 */
export function contentSecurityPolicy({ tiles: shown, pictureOrigins }: PolicyOptions): string {
  const google = shown === 'google';
  const tiles = [
    ...(shown === 'osm' ? [] : [STADIA_TILES]),
    OSM_TILES,
    ...(google ? [GOOGLE_TILES] : []),
  ];
  return [
    "default-src 'none'",
    `script-src 'self' ${CONTINUE_SCRIPT_SOURCE}`,
    "style-src 'self'",
    `img-src 'self' data: ${[...tiles, ...pictureOrigins].join(' ')}`,
    `connect-src 'self'${google ? ` ${GOOGLE_TILES}` : ''}`,
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
}

/**
 * The headers every answer carries. The referrer of a request to another site is Pine's
 * origin, never a path: Google checks a browser key's referrer restriction by it.
 */
export function securityHeaders(options: PolicyOptions): Record<string, string> {
  return {
    'content-security-policy': contentSecurityPolicy(options),
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
  };
}
