import * as L from 'leaflet';
import type { GeoView } from '../../domain/web/geo-data.js';
import {
  readLastView,
  regionOf,
  startView,
  MemberMoves,
  writeLastView,
  zoomLimits,
  type Box,
  type StartFacts,
  type StartView,
  type ViewStorage,
} from './view.js';
import type { MapActivity } from './parties.js';
import type { You } from './you-ui.js';

/**
 * Leaflet's side of the map's view (plan 8M-7, `view.ts`): the zoom and pan limits of the
 * server's regions (again when the map is resized), the start view, the last view kept as the
 * map rests, and your location as the first rule once the browser, having granted it before,
 * gives it (unless the member moved the map meanwhile).
 */

/** How strongly the map resists being panned past its bounds (Leaflet: 0 none, 1 a wall). */
export const BOUNDS_VISCOSITY = 0.8;

const bounds = (box: Box): L.LatLngBounds =>
  L.latLngBounds([box.south, box.west], [box.north, box.east]);

/** The browser's `localStorage`, or none where reading it throws (some private modes). */
export function browserStorage(): ViewStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Puts the map where it starts and keeps it within the server's regions. `gymsBox`: where the
 * whole server is when it has gyms but no region yet. `activity`: a resize or a move of the live
 * map while the region editor hides it sets no limits and stores no view; once the editor is off,
 * each is done once (re-review V1).
 */
export function placeTheMap(
  map: L.Map,
  guild: string,
  regions: GeoView['regions'],
  gymsBox: L.LatLngBounds | undefined,
  you: You,
  say: (text: string) => void,
  activity: Pick<MapActivity, 'whenLive'>,
): void {
  const storage = browserStorage();
  const limit = (): void => {
    const size = map.getSize();
    const limits = zoomLimits(regions, { width: size.x, height: size.y });
    if (!limits) return;
    map.setMinZoom(limits.minZoom);
    map.setMaxBounds(bounds(limits.maxBounds));
  };
  limit();
  map.on('resize', activity.whenLive(limit));

  const facts: StartFacts = {
    region: regionOf(location.search),
    last: readLastView(storage, guild),
    regions,
  };
  // `/maps`' region is used once: a reload opens where the member left the map.
  if (facts.region !== undefined) {
    const query = new URLSearchParams(location.search);
    query.delete('region');
    const rest = query.toString();
    history.replaceState(null, '', `${location.pathname}${rest === '' ? '' : `?${rest}`}`);
  }
  const apply = (view: StartView): void => {
    if (view.kind === 'point') map.setView([view.center.lat, view.center.lon], view.zoom);
    else if (view.kind === 'fit') map.fitBounds(bounds(view.box));
    else if (gymsBox?.isValid()) map.fitBounds(gymsBox);
    else {
      map.setView([40.44, -79.99], 11);
      say('This server has no regions yet.');
    }
  };
  const moves = new MemberMoves();
  map.on('movestart zoomstart', () => {
    moves.seen();
  });
  apply(startView(facts));
  moves.begin();
  map.on(
    'moveend',
    activity.whenLive(() => {
      const center = map.getCenter();
      writeLastView(storage, guild, { lat: center.lat, lon: center.lng, zoom: map.getZoom() });
    }),
  );
  void you.startIfGranted().then((located) => {
    if (located && !moves.moved) apply(startView({ ...facts, located }));
  });
}
