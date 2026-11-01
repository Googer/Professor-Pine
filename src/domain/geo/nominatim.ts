import { z } from 'zod';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { Box } from '@pine/wayspot-core/region-membership';
import { largestShape, type Area, type Shape } from '@pine/wayspot-core/shape';

/**
 * Searching places by name in OpenStreetMap's Nominatim (`/search`), for `/find-region`: the
 * request and what is used of the answer. With `polygon_geojson=1` each place carries its
 * outline as GeoJSON (longitude first); without it, or with an outline Pine does not read, the
 * place is its point.
 */

/** How many places a search answers at most (the legacy bot's five). */
export const PLACES_PER_SEARCH = 5;

/**
 * How finely Nominatim draws an outline, in degrees (about ten metres): outlines of towns
 * otherwise have tens of thousands of corners, far more than telling regions apart needs.
 */
const OUTLINE_TOLERANCE = 0.0001;

/**
 * No place is read with more corners than this in all: a place whose outline has more is read
 * as its point (`Place.tooDetailed`), never as the parts that fitted.
 */
export const MAX_PLACE_POINTS = 50_000;

/**
 * The query of a search for `text` among the places in `box` only (`bounded=1`; Nominatim's
 * `viewbox` is west, north, east, south), with outlines, in English.
 */
export function placeSearchQuery(text: string, box: Box): string {
  return new URLSearchParams({
    q: text,
    format: 'jsonv2',
    limit: String(PLACES_PER_SEARCH),
    bounded: '1',
    viewbox: [box.west, box.north, box.east, box.south].map(String).join(','),
    polygon_geojson: '1',
    polygon_threshold: String(OUTLINE_TOLERANCE),
    'accept-language': 'en',
  }).toString();
}

/** A place a search found. */
export interface Place {
  /** What OpenStreetMap calls it in full ("Schenley Park, Pittsburgh, …"). */
  name: string;
  shape: Shape;
  /**
   * Its outline had more than `MAX_PLACE_POINTS` corners: `shape` is the place's point, which
   * the answer says.
   */
  tooDetailed?: true;
  /**
   * What OpenStreetMap files it under: a `settlement` (a town, a village, a neighbourhood) or a
   * boundary, a `road`, or (undefined) anything else.
   */
  standing?: 'settlement' | 'road';
}

/** OpenStreetMap's categories (`category` of `jsonv2`) and the standing of a place in them. */
const STANDINGS: Readonly<Record<string, NonNullable<Place['standing']>>> = {
  place: 'settlement',
  boundary: 'settlement',
  highway: 'road',
};

const STANDING_RANK = { settlement: 2, other: 1, road: 0 } as const;

/**
 * The place a name most likely means of what a search found: a settlement or boundary before
 * anything else, anything else before a road, whatever their sizes ("Fredericktown" is the
 * town, not East Fredericktown Road); among places of one standing the largest
 * (`largestShape`).
 */
export function bestPlace<T extends { shape: Shape; standing?: Place['standing'] }>(
  found: readonly T[],
): T | undefined {
  const rank = (one: T): number => STANDING_RANK[one.standing ?? 'other'];
  const top = Math.max(...found.map(rank));
  return largestShape(found.filter((one) => rank(one) === top));
}

const coordinate = z
  .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
  .rest(z.unknown());
const path = z.array(coordinate);

const geometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), coordinates: coordinate }),
  z.object({ type: z.literal('LineString'), coordinates: path }),
  z.object({ type: z.literal('MultiLineString'), coordinates: z.array(path) }),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(path) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(path)) }),
]);

const degrees = (low: number, high: number) =>
  z.coerce.number().refine((value) => Number.isFinite(value) && value >= low && value <= high);

const placeSchema = z.object({
  display_name: z.string().min(1),
  category: z.string().optional().catch(undefined),
  lat: degrees(-90, 90),
  lon: degrees(-180, 180),
  geojson: z.unknown().optional(),
});

/**
 * Counts the points read, to stop at `MAX_PLACE_POINTS`; `cut` once a path did not fit, after
 * which nothing more is read (the shape is then not used at all).
 */
class Budget {
  left = MAX_PLACE_POINTS;
  cut = false;
  take(points: readonly z.infer<typeof coordinate>[]): LatLon[] | undefined {
    if (this.cut || points.length > this.left) {
      this.cut = true;
      return undefined;
    }
    this.left -= points.length;
    return points.map(([lon, lat]) => ({ lat, lon }));
  }
}

/**
 * The points as a closed ring (the first point added at the end when it is not there), or
 * undefined for fewer than four points: a closed triangle has four, so an open triangle (three
 * points) is refused too, as GeoJSON never sends one.
 */
function ringOf(points: LatLon[] | undefined): LatLon[] | undefined {
  if (!points || points.length < 4) return undefined;
  const first = points[0] as LatLon;
  const last = points[points.length - 1] as LatLon;
  return first.lat === last.lat && first.lon === last.lon ? points : [...points, { ...first }];
}

function areaOf(rings: readonly z.infer<typeof path>[], budget: Budget): Area | undefined {
  const [outerPoints, ...holePoints] = rings;
  const outer = ringOf(outerPoints && budget.take(outerPoints));
  if (!outer) return undefined;
  const holes = holePoints
    .map((hole) => ringOf(budget.take(hole)))
    .filter((hole): hole is LatLon[] => hole !== undefined);
  return { outer, holes };
}

/**
 * The shape of a place's GeoJSON outline; undefined for what this does not read, `too-detailed`
 * for an outline of more than `MAX_PLACE_POINTS` corners in all.
 */
export function shapeOfGeoJson(value: unknown): Shape | 'too-detailed' | undefined {
  const shape = readShape(value);
  return shape.cut ? 'too-detailed' : shape.shape;
}

function readShape(value: unknown): { shape: Shape | undefined; cut: boolean } {
  const parsed = geometry.safeParse(value);
  if (!parsed.success) return { shape: undefined, cut: false };
  const budget = new Budget();
  const lines = (paths: readonly z.infer<typeof path>[]): Shape | undefined => {
    const read = paths
      .map((one) => budget.take(one))
      .filter((line): line is LatLon[] => line !== undefined && line.length >= 2);
    return read.length === 0 ? undefined : { kind: 'line', lines: read };
  };
  const areas = (polygons: readonly (readonly z.infer<typeof path>[])[]): Shape | undefined => {
    const read = polygons
      .map((rings) => areaOf(rings, budget))
      .filter((area): area is Area => area !== undefined);
    return read.length === 0 ? undefined : { kind: 'area', areas: read };
  };
  const read = (): Shape | undefined => {
    const shape = parsed.data;
    switch (shape.type) {
      case 'Point':
        return { kind: 'point', point: { lat: shape.coordinates[1], lon: shape.coordinates[0] } };
      case 'LineString':
        return lines([shape.coordinates]);
      case 'MultiLineString':
        return lines(shape.coordinates);
      case 'Polygon':
        return areas([shape.coordinates]);
      case 'MultiPolygon':
        return areas(shape.coordinates);
    }
  };
  const shape = read();
  return { shape, cut: budget.cut };
}

/**
 * The places of Nominatim's answer (`format=jsonv2`), in its order; a place without an outline
 * this reads is its point (`tooDetailed` when the outline had too many corners), one without a
 * name or point is left out. Undefined for an answer that is no list.
 */
export function readNominatimPlaces(body: unknown): Place[] | undefined {
  if (!Array.isArray(body)) return undefined;
  const places: Place[] = [];
  for (const value of body.slice(0, PLACES_PER_SEARCH)) {
    const parsed = placeSchema.safeParse(value);
    if (!parsed.success) continue;
    const place = parsed.data;
    const shape = shapeOfGeoJson(place.geojson);
    const point: Shape = { kind: 'point', point: { lat: place.lat, lon: place.lon } };
    const { category } = place;
    const standing =
      category !== undefined && Object.hasOwn(STANDINGS, category)
        ? STANDINGS[category]
        : undefined;
    places.push({
      ...(shape === 'too-detailed'
        ? { name: place.display_name, shape: point, tooDetailed: true as const }
        : { name: place.display_name, shape: shape ?? point }),
      ...(standing === undefined ? {} : { standing }),
    });
  }
  return places;
}
