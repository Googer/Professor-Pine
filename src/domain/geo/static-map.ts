import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { encodePolyline } from './polyline.js';
import { shapeSize, type Shape } from '@pine/wayspot-core/shape';
import { simplifyLine } from './simplify.js';

export const STATIC_MAP_ENDPOINT = 'https://maps.googleapis.com/maps/api/staticmap';

/**
 * How long the query of a picture may be. Google takes an address of 16,384 characters; this
 * leaves room for the endpoint, the key and a signature.
 */
export const MAX_STATIC_MAP_QUERY = 15_000;
/** The finest simplification tried for a picture: a hundred-thousandth of a degree, about a metre. */
const FINEST_TOLERANCE = 1e-5;

/**
 * A line or outline drawn on the map, in red unless `colour` says blue; `fill` shades the inside
 * of a closed outline.
 */
export interface MapPath {
  points: readonly LatLon[];
  fill?: boolean;
  colour?: 'red' | 'blue';
}

export interface StaticMap {
  /** Small red pins. */
  markers?: readonly LatLon[];
  paths?: readonly MapPath[];
  /** Needed when the map shows only pins; with a path Google fits the map to it. */
  zoom?: number;
}

/**
 * The query of a Google Static Maps request for a 640×320 picture at double resolution, without
 * the API key. It doubles as the picture's identity: the same query is the same picture.
 */
export function staticMapQuery(map: StaticMap): string {
  const params = new URLSearchParams({ size: '640x320', scale: '2', format: 'png' });
  if (map.zoom !== undefined) params.set('zoom', String(map.zoom));
  if (map.markers && map.markers.length > 0) {
    const pins = map.markers.map((pin) => `${pin.lat},${pin.lon}`).join('|');
    params.append('markers', `size:small|color:red|${pins}`);
  }
  for (const path of map.paths ?? []) {
    const colour = path.colour === 'blue' ? '0x1E50D0' : 'red';
    const style = path.fill
      ? `fillcolor:0xAA000033|color:${colour}|weight:2`
      : `color:${colour}|weight:2`;
    params.append('path', `${style}|enc:${encodePolyline(path.points)}`);
  }
  return params.toString();
}

/** The map of one gym: a pin at street level. */
export function gymMap(gym: LatLon): StaticMap {
  return { markers: [{ lat: gym.lat, lon: gym.lon }], zoom: 15 };
}

/**
 * The map of a region: its outline, shaded. The outline of a region may have thousands of
 * corners (a traced boundary), more than the address of a picture holds: such an outline is
 * simplified, for the picture only (the stored outline never is), by the smallest tolerance
 * with which the address fits, doubled from about a metre. A picture is 1,280 points wide,
 * so what goes is not seen. An outline that fits is drawn as it is.
 */
export function regionMap(bounds: readonly LatLon[]): StaticMap {
  const mapOf = (points: readonly LatLon[]): StaticMap => ({ paths: [{ points, fill: true }] });
  const fits = (map: StaticMap): boolean => staticMapQuery(map).length <= MAX_STATIC_MAP_QUERY;
  const whole = mapOf(bounds);
  if (fits(whole)) return whole;
  for (let tolerance = FINEST_TOLERANCE; tolerance < 360; tolerance *= 2) {
    const map = mapOf(simplifyLine(bounds, tolerance));
    if (fits(map)) return map;
  }
  // No tolerance left more than the two ends of the line, and they still do not fit: cannot be.
  return mapOf(bounds.slice(0, 1));
}

/** How many parts of a place a picture draws at most: a place of many parts is shown by its first. */
export const MAX_PLACE_PARTS = 20;

/**
 * The map of a place and the regions it lies in (`/find-region`): the place in red (an area
 * shaded, a line drawn, a point a pin), the outlines of the regions in blue. Everything is
 * simplified together, by a tolerance doubled from a tenth of a pixel of the picture until the
 * address fits (a place of 50,000 corners with sixty regions of 5,000 takes a few hundredths of
 * a second); what fits as it is is drawn as it is. A point alone is shown at street level. A place with nothing to draw (no part, no region) is a
 * map without content: `hasContent` says whether a map shows anything.
 */
export function placeMap(shape: Shape, outlines: readonly (readonly LatLon[])[]): StaticMap {
  // Of a place of many parts the largest are drawn: they are what the picture is about.
  const largest = <T>(parts: readonly T[], size: (part: T) => number): T[] =>
    [...parts].sort((a, b) => size(b) - size(a)).slice(0, MAX_PLACE_PARTS);
  const place: MapPath[] =
    shape.kind === 'line'
      ? largest(shape.lines, (line) => shapeSize({ kind: 'line', lines: [line] })).map(
          (points) => ({ points }),
        )
      : shape.kind === 'area'
        ? largest(shape.areas, (area) => shapeSize({ kind: 'area', areas: [area] })).map(
            (area) => ({ points: area.outer, fill: true }),
          )
        : [];
  const regions: MapPath[] = outlines.map((points) => ({ points, colour: 'blue' }));
  const markers = shape.kind === 'point' ? [shape.point] : [];
  const paths = [...place, ...regions];
  const mapOf = (drawn: readonly MapPath[]): StaticMap => ({
    ...(markers.length > 0 ? { markers } : {}),
    ...(markers.length > 0 && regions.length === 0 ? { zoom: 15 } : {}),
    paths: drawn,
  });
  const simplified = (from: readonly MapPath[], tolerance: number): MapPath[] =>
    from.map((path) => ({ ...path, points: simplifyLine(path.points, tolerance) }));
  // Every corner takes two characters of the address at least: a map of more cannot fit, and
  // its address is not made.
  const fits = (drawn: readonly MapPath[]): StaticMap | undefined => {
    const corners = drawn.reduce((sum, path) => sum + path.points.length, 0);
    if (corners * 2 > MAX_STATIC_MAP_QUERY) return undefined;
    const map = mapOf(drawn);
    return staticMapQuery(map).length <= MAX_STATIC_MAP_QUERY ? map : undefined;
  };
  const whole = fits(paths);
  if (whole) return whole;
  // What is finer than a tenth of a pixel is not seen: the doubling starts there, and each step
  // simplifies what the one before left, far fewer corners than the place and the regions have.
  let drawn: readonly MapPath[] = paths;
  for (
    let tolerance = Math.max(FINEST_TOLERANCE, diagonal(paths) / PIXEL_TENTHS);
    tolerance < 360;
    tolerance *= 2
  ) {
    drawn = simplified(drawn, tolerance);
    const map = fits(drawn);
    if (map) return map;
  }
  // Even two points a path do not fit: the pins alone, or nothing.
  return markers.length > 0 ? { markers, zoom: 15 } : {};
}

/**
 * A tenth of a pixel of the picture (1,280 pixels wide) across the box of what it shows, as a
 * part of the box's diagonal: Google fits the map to the paths, so a pixel is never smaller.
 */
const PIXEL_TENTHS = 12_800 * Math.SQRT2;

/** The diagonal of the box around every corner of the paths, in degrees taken as flat. */
function diagonal(paths: readonly MapPath[]): number {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const path of paths) {
    for (const point of path.points) {
      south = Math.min(south, point.lat);
      north = Math.max(north, point.lat);
      west = Math.min(west, point.lon);
      east = Math.max(east, point.lon);
    }
  }
  return north < south ? 0 : Math.hypot(north - south, east - west);
}

/** Whether a map shows anything: a pin or a path. A map without either is not downloaded. */
export function hasContent(map: StaticMap): boolean {
  return (map.markers?.length ?? 0) > 0 || (map.paths?.length ?? 0) > 0;
}
