import type { LatLon } from './lat-lon.js';

/** How far a region reaches into its neighbours when looking for gyms: the legacy bot's factor. */
export const NEIGHBOUR_SCALE = 1.5;

/**
 * Whether the point lies inside the closed outline. Latitude and longitude are treated as flat
 * coordinates, as MySQL does for the regions' polygons. A point exactly on the outline may be
 * counted either way.
 */
export function ringContains(ring: readonly LatLon[], point: LatLon): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const crosses = a.lon > point.lon !== b.lon > point.lon;
    if (crosses && point.lat < ((b.lat - a.lat) * (point.lon - a.lon)) / (b.lon - a.lon) + a.lat) {
      inside = !inside;
    }
  }
  return inside;
}

const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;

/**
 * The distance of each side of the outline from the point, in metres, measured flat at the
 * point's own scale (exact enough for the few hundred metres it is asked about), each given to
 * `side` until it answers true.
 */
function sideDistances(
  ring: readonly LatLon[],
  point: LatLon,
  side: (metres: number) => boolean,
): void {
  const perLon = METRES_PER_DEGREE * Math.cos((point.lat * Math.PI) / 180);
  const flat = (corner: LatLon) => ({
    x: (corner.lon - point.lon) * perLon,
    y: (corner.lat - point.lat) * METRES_PER_DEGREE,
  });
  for (let i = 1; i < ring.length; i++) {
    const a = flat(ring[i - 1]!);
    const b = flat(ring[i]!);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / length));
    if (side(Math.hypot(a.x + t * dx, a.y + t * dy))) return;
  }
}

/** Whether a point lies inside the outline or within `metres` of its edge. */
export function nearRing(ring: readonly LatLon[], point: LatLon, metres: number): boolean {
  if (ringContains(ring, point)) return true;
  let near = false;
  sideDistances(ring, point, (side) => (near = side <= metres));
  return near;
}

/**
 * How far a point lies from the outline, in metres: 0 inside it, the distance to its nearest
 * side or corner outside it (as `nearRing` measures), `Infinity` for an outline without sides.
 */
export function metresFromRing(ring: readonly LatLon[], point: LatLon): number {
  if (ringContains(ring, point)) return 0;
  let nearest = Infinity;
  sideDistances(ring, point, (side) => {
    nearest = Math.min(nearest, side);
    return false;
  });
  return nearest;
}

/** The smallest box of latitudes and longitudes that holds an outline. */
export interface Box {
  south: number;
  north: number;
  west: number;
  east: number;
}

export function boxOf(ring: readonly LatLon[]): Box {
  const box = { south: Infinity, north: -Infinity, west: Infinity, east: -Infinity };
  for (const { lat, lon } of ring) {
    if (lat < box.south) box.south = lat;
    if (lat > box.north) box.north = lat;
    if (lon < box.west) box.west = lon;
    if (lon > box.east) box.east = lon;
  }
  return box;
}

/**
 * A box grown by `metres` on every side: in longitude by the width of a degree at the edge
 * farther from the equator, where it is narrowest, so every point within `metres` of the box
 * lies in it.
 */
export function grownBox(box: Box, metres: number): Box {
  if (metres <= 0) return { ...box };
  const lat = metres / METRES_PER_DEGREE;
  const widest = Math.min(89, Math.max(Math.abs(box.south), Math.abs(box.north)) + lat);
  const lon = lat / Math.cos((widest * Math.PI) / 180);
  return {
    south: box.south - lat,
    north: box.north + lat,
    west: box.west - lon,
    east: box.east + lon,
  };
}

/** Whether a point lies in a box (on its edge counts). */
export function inBox(box: Box, point: LatLon): boolean {
  return (
    point.lat >= box.south &&
    point.lat <= box.north &&
    point.lon >= box.west &&
    point.lon <= box.east
  );
}

/**
 * A test of points against one outline: `ringContains`, asked only of points in the outline's
 * box. An outline may have thousands of corners, and most points lie far from it.
 */
export function containment(ring: readonly LatLon[]): (point: LatLon) => boolean {
  const box = boxOf(ring);
  return (point) => inBox(box, point) && ringContains(ring, point);
}

/**
 * The outline blown up around its middle (the mean of its corners), so that it also covers the
 * edge of the neighbouring regions. The east-west stretch is not corrected for latitude; at the
 * size of a region the difference from a true scaling is a few metres.
 */
export function enlargeRing(ring: readonly LatLon[], factor = NEIGHBOUR_SCALE): LatLon[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = first && last && first.lat === last.lat && first.lon === last.lon;
  const corners = closed ? ring.slice(0, -1) : ring;
  if (corners.length === 0) return [];
  const lat = corners.reduce((sum, corner) => sum + corner.lat, 0) / corners.length;
  const lon = corners.reduce((sum, corner) => sum + corner.lon, 0) / corners.length;
  return ring.map((corner) => ({
    lat: lat + (corner.lat - lat) * factor,
    lon: lon + (corner.lon - lon) * factor,
  }));
}

/** The gyms of one region. */
export interface RegionGyms {
  /** Gyms inside the region. */
  local: Set<number>;
  /** Gyms outside it but inside the enlarged outline: the near edge of the neighbours. */
  neighbouring: Set<number>;
}

/**
 * Sorts gyms into regions, by channel id. A region without an outline has no gyms. A gym may be
 * local to several regions when their outlines overlap. Of several regions of one channel (rows
 * older than the unique key of migration 011) the first counts: given oldest first, as the
 * regions are read, that is the oldest, which is the one everything else looks up.
 */
export function gymsByRegion(
  regions: readonly { channelId: string; bounds: readonly LatLon[] | null }[],
  gyms: readonly { id: number; lat: number; lon: number }[],
): Map<string, RegionGyms> {
  const result = new Map<string, RegionGyms>();
  for (const region of regions) {
    if (result.has(region.channelId)) continue;
    const membership: RegionGyms = { local: new Set(), neighbouring: new Set() };
    result.set(region.channelId, membership);
    if (!region.bounds) continue;
    const local = containment(region.bounds);
    const near = containment(enlargeRing(region.bounds));
    for (const gym of gyms) {
      if (local(gym)) membership.local.add(gym.id);
      else if (near(gym)) membership.neighbouring.add(gym.id);
    }
  }
  return result;
}
