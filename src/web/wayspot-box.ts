import { z } from 'zod';
import type { AppContext } from '../app-context.js';
import { nearestPlaces } from '../domain/search/nearest.js';
import type { Wayspot } from '../domain/wayspots/kept.js';
import type { WayspotProvider } from '../services/wayspot-directory.js';

/**
 * The kept Wayspots of one kind in a box of the map (plans 8M-5M, 8X-5): the PokéStops of
 * `/api/stops`, the power spots of `/api/powerspots`.
 */

/** A box of the map, as Leaflet's bounds give it: within the world, not inverted. */
export const boxSchema = z
  .object({
    south: z.coerce.number().min(-90).max(90),
    west: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
  })
  .strict()
  .refine((box) => box.south <= box.north && box.west <= box.east);

export type MapBox = z.infer<typeof boxSchema>;

/** A Wayspot as the map lists it: `[id, lat, lon, title, address]`. */
export type BoxedWayspot = [string, number, number, string, string | null];

/**
 * A Wayspot's line of the map's lists; its address where anything of it is known
 * (`WayspotProvider.addressOf`: a Power Spot's looked-up one too).
 */
const boxed = (wayspots: Pick<WayspotProvider, 'addressOf'>, wayspot: Wayspot): BoxedWayspot => [
  wayspot.id,
  wayspot.lat,
  wayspot.lon,
  wayspot.title,
  wayspots.addressOf(wayspot) || null,
];

/**
 * The kept Wayspots of `kind` with a title in a region of the server (`row`) inside the box, the
 * nearest to the box's middle first, at most `max`; `more` when the box holds more. None for a
 * server without its row yet.
 */
export function wayspotsInBox(
  ctx: Pick<AppContext, 'regions' | 'wayspots'>,
  row: number | undefined,
  box: MapBox,
  kind: 'stop' | 'powerspot',
  max: number,
): { found: BoxedWayspot[]; more: boolean } {
  const { south, west, north, east } = box;
  const middle = { lat: (south + north) / 2, lon: (west + east) / 2 };
  const found = new Map<string, BoxedWayspot>();
  for (const region of ctx.regions.all()) {
    if (region.guildId !== row || row === undefined || region.bounds === null) continue;
    for (const wayspot of ctx.wayspots.inRegion(region.channelId)) {
      if (wayspot.kind !== kind || wayspot.title.trim() === '') continue;
      const { lat, lon } = wayspot;
      if (lat < south || lat > north || lon < west || lon > east) continue;
      found.set(wayspot.id, boxed(ctx.wayspots, wayspot));
    }
  }
  const distance = ([, lat, lon]: BoxedWayspot): number =>
    (lat - middle.lat) ** 2 + (lon - middle.lon) ** 2;
  const nearest = [...found.values()].sort((a, b) => distance(a) - distance(b));
  return { found: nearest.slice(0, max), more: nearest.length > max };
}

/** The most places one ask for the nearest gives (`near=`): a menu's 25. */
export const MAX_NEAREST = 25;

/** A point of the earth in a query, `<lat>,<lon>` (`near=`; Find's too, plan 8M-12). */
export const pointSchema = z
  .string()
  .regex(/^-?\d{1,3}(?:\.\d+)?,-?\d{1,3}(?:\.\d+)?$/u)
  .transform((text) => {
    const [lat = NaN, lon = NaN] = text.split(',').map(Number);
    return { lat, lon };
  })
  .refine(({ lat, lon }) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180);

/**
 * The nearest of a point (plan 8M-11A): `near=<lat>,<lon>&count=<n>`, the Report button's step 2
 * listing the nearest Power Spots or PokéStops wherever they are, not only those in view.
 */
export const nearSchema = z
  .object({
    near: pointSchema,
    count: z.coerce.number().int().min(1).max(MAX_NEAREST),
  })
  .strict();

/** A box of the map, or the nearest of a point: what `/api/stops` and `/api/powerspots` take. */
export const placesQuerySchema = z.union([boxSchema, nearSchema]);

/**
 * The kept Wayspots of `kind` with a title in a region of the server (`row`) nearest `at`, nearest
 * first, as near by title, `count` at most (plan 8M-11A): by `nearestPlaces`, the search Discord's
 * lists of nearby stops use (`PlaceFinder.nearest`), each once. None for a server without its row.
 */
export function wayspotsNear(
  ctx: Pick<AppContext, 'regions' | 'wayspots'>,
  row: number | undefined,
  at: { lat: number; lon: number },
  kind: 'stop' | 'powerspot',
  count: number,
): BoxedWayspot[] {
  const places = new Map<string, BoxedWayspot>();
  for (const region of ctx.regions.all()) {
    if (region.guildId !== row || row === undefined || region.bounds === null) continue;
    for (const wayspot of ctx.wayspots.inRegion(region.channelId)) {
      if (wayspot.kind !== kind || wayspot.title.trim() === '') continue;
      places.set(wayspot.id, boxed(ctx.wayspots, wayspot));
    }
  }
  return nearestPlaces(places.values(), [at], {
    pointOf: ([, lat, lon]) => ({ lat, lon }),
    nameOf: ([, , , title]) => title,
    count,
  }).map(({ item }) => item);
}

/**
 * The places of `/api/stops` or `/api/powerspots` for a query (`placesQuerySchema`): in a box,
 * at most `max`, or the `count` nearest a point (never "more").
 */
export function placesFor(
  ctx: Pick<AppContext, 'regions' | 'wayspots'>,
  row: number | undefined,
  query: z.infer<typeof placesQuerySchema>,
  kind: 'stop' | 'powerspot',
  max: number,
): { found: BoxedWayspot[]; more: boolean } {
  if ('near' in query) {
    return { found: wayspotsNear(ctx, row, query.near, kind, query.count), more: false };
  }
  return wayspotsInBox(ctx, row, query, kind, max);
}
