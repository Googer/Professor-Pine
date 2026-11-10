import { createHash } from 'node:crypto';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { Shape } from '@pine/wayspot-core/shape';
import {
  STATIC_MAP_ENDPOINT,
  gymMap,
  hasContent,
  placeMap,
  regionMap,
  staticMapQuery,
  type StaticMap,
} from '../domain/geo/static-map.js';
import type { Logger } from '../log.js';
import type { ImageCache, ImageResponse } from './image-cache.js';

/** What handlers need: map pictures as files to attach. */
export interface MapProvider {
  /** False when no Google API key is configured: every map is then undefined. */
  readonly enabled: boolean;
  /** Path of a picture of the gym's surroundings; undefined when it cannot be had. */
  gym(gym: { id: number; lat: number; lon: number }): Promise<string | undefined>;
  /** Path of a picture of the region's outline; undefined when it cannot be had. */
  region(region: { id: number; bounds: readonly LatLon[] | null }): Promise<string | undefined>;
  /**
   * Path of a picture of a place and the outlines of the regions it lies in (`/find-region`);
   * undefined when it cannot be had. A member chooses the place, and Google bills each map
   * downloaded: `spend` takes one of the month's maps before a download (`MapBudget.spend`;
   * none for a picture on disk), and where it answers false there is no map (plan 8Z-2).
   */
  place(
    shape: Shape,
    outlines: readonly (readonly LatLon[])[],
    spend?: () => Promise<boolean>,
  ): Promise<string | undefined>;
  /**
   * Deletes every picture that is kept (`/admin clear-image-cache`) and gives how many there
   * were. Those still in use are downloaded again when they are next asked for.
   */
  clear(): Promise<number>;
}

/**
 * A map of `ctx.maps` for a message that goes out with or without it: the file, or undefined
 * when there is none or getting it failed (logged with `context`, as "could not get the map of
 * <what>"). Never throws. Give the answer to `mapPicture` (`src/render/v2.ts`).
 */
export async function mapOrNothing(
  map: Promise<string | undefined>,
  log: Pick<Logger, 'warn'>,
  what: string,
  context: Record<string, unknown> = {},
): Promise<string | undefined> {
  try {
    return await map;
  } catch (err) {
    log.warn({ err, ...context }, `could not get the map of ${what}`);
    return undefined;
  }
}

/** How long the picture of a place is kept after it was last made. */
const PLACE_PICTURE_MS = 86_400_000;

/** Google answers a request it cannot fulfil (quota, bad key) with a picture of an error. */
function refuseWarning(response: ImageResponse): string | undefined {
  const warning = response.headers.get('x-staticmap-api-warning');
  return warning === null ? undefined : `Google Static Maps warned: ${warning}`;
}

/**
 * Map pictures from Google Static Maps, downloaded through the image cache so that the API key
 * never appears in anything sent to Discord. A gym's picture is replaced when the gym moves, a
 * region's when its outline changes.
 */
export class StaticMaps implements MapProvider {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly cache: ImageCache,
  ) {}

  get enabled(): boolean {
    return this.apiKey !== undefined && this.apiKey !== '';
  }

  gym(gym: { id: number; lat: number; lon: number }): Promise<string | undefined> {
    return this.picture('gyms', gym.id, gymMap(gym));
  }

  region(region: { id: number; bounds: readonly LatLon[] | null }): Promise<string | undefined> {
    if (!region.bounds) return Promise.resolve(undefined);
    return this.picture('regions', region.id, regionMap(region.bounds));
  }

  /**
   * A place has no id of its own: its picture is named by what it shows, so the same search
   * finds the same file, and pictures of different places never replace each other (they go
   * with `/admin clear-image-cache`).
   */
  place(
    shape: Shape,
    outlines: readonly (readonly LatLon[])[],
    spend?: () => Promise<boolean>,
  ): Promise<string | undefined> {
    // Without a key no picture is made, and the outlines are not simplified for nothing.
    if (!this.enabled) return Promise.resolve(undefined);
    const map = placeMap(shape, outlines);
    if (!hasContent(map)) return Promise.resolve(undefined);
    const id = createHash('sha256').update(staticMapQuery(map)).digest('hex').slice(0, 16);
    // Served again, it is kept another day (`prunePlaces` counts from its last use).
    return this.picture('places', id, map, true, spend);
  }

  clear(): Promise<number> {
    return this.cache.clear();
  }

  /**
   * Deletes the pictures of places not made again for a day (with the hourly upkeep): unlike a
   * gym's or a region's, which a new one replaces, they would only pile up.
   */
  prunePlaces(): Promise<number> {
    return this.cache.removeOlder('places', Date.now() - PLACE_PICTURE_MS);
  }

  private picture(
    folder: string,
    id: number | string,
    map: StaticMap,
    touch = false,
    spend?: () => Promise<boolean>,
  ): Promise<string | undefined> {
    if (!this.enabled) return Promise.resolve(undefined);
    const query = staticMapQuery(map);
    return this.cache.get({
      folder,
      id: String(id),
      variant: query,
      url: `${STATIC_MAP_ENDPOINT}?${query}&key=${encodeURIComponent(this.apiKey ?? '')}`,
      refuse: refuseWarning,
      ...(touch ? { touch } : {}),
      ...(spend ? { spend } : {}),
    });
  }
}
