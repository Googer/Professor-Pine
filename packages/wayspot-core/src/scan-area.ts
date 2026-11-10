import type { LatLon } from './lat-lon.js';
import { boxOf, grownBox, inBox, nearRing, ringContains, type Box } from './region-membership.js';
import { wayfarerCellAt } from './s2.js';

/**
 * The area an export covers (ruled 2026-10-15): the outlines of its areas grown by its margin,
 * since an outline drawn "into the void" may leave out a gym or stop its admin thought was in,
 * and what lies just outside is how they find out. A point is in the area when it lies inside an
 * outline or within the margin of one (`nearRing`). The area's cells are what a finished export
 * has received, whole or empty.
 */

/** The margin of an export unless it is set otherwise, in metres. */
export const DEFAULT_SCAN_MARGIN = 500;

/** The largest margin an export may have, in metres. */
export const MAX_SCAN_MARGIN = 2_000;

/** Metres in a degree of latitude. */
const METRES_PER_DEGREE = 111_320;

/** Whether a value is a margin: a number of metres from 0 to `MAX_SCAN_MARGIN`. */
export function isScanMargin(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_SCAN_MARGIN
  );
}

export interface ScanArea {
  /** A box that holds the whole area. */
  box: Box;
  /** Whether a point lies in the area. */
  contains(point: LatLon): boolean;
}

/** The closed ring of a box. */
export function ringOfBox(box: Box): LatLon[] {
  return [
    { lat: box.south, lon: box.west },
    { lat: box.south, lon: box.east },
    { lat: box.north, lon: box.east },
    { lat: box.north, lon: box.west },
    { lat: box.south, lon: box.west },
  ];
}

/**
 * The area of outlines (closed rings, latitude first) grown by `margin` metres; undefined for
 * no outline.
 */
export function scanArea(
  outlines: readonly (readonly LatLon[])[],
  margin: number,
): ScanArea | undefined {
  const rings = outlines
    .filter((ring) => ring.length > 0)
    .map((ring) => ({ ring, box: grownBox(boxOf(ring), margin) }));
  if (rings.length === 0) return undefined;
  const box = boxOf(rings.flatMap(({ box: one }) => ringOfBox(one)));
  return {
    box,
    contains: (point) =>
      rings.some(
        ({ ring, box: one }) =>
          inBox(one, point) &&
          (margin > 0 ? nearRing(ring, point, margin) : ringContains(ring, point)),
      ),
  };
}

/**
 * Every level-14 cell of the outlines grown by `margin` metres (`scanArea`), found as the cells
 * of points `spacingMetres` apart over that area, which is about half a cell (a cell that reaches
 * into the area by a sliver only may be left out), in the order found (south to north), each once.
 * Latitude and longitude are flat coordinates here, as everywhere outlines are compared with what
 * lies in them.
 */
export function areaCells(
  outlines: readonly (readonly LatLon[])[],
  margin = 0,
  spacingMetres = 300,
): string[] {
  const area = scanArea(outlines, margin);
  if (!area) return [];
  const { box } = area;
  const latStep = spacingMetres / METRES_PER_DEGREE;
  const widest = Math.max(Math.abs(box.south), Math.abs(box.north));
  const lonStep = latStep / Math.max(0.01, Math.cos((Math.min(89, widest) * Math.PI) / 180));
  const cells = new Set<string>();
  for (let lat = box.south; lat <= box.north; lat += latStep) {
    for (let lon = box.west; lon <= box.east; lon += lonStep) {
      const point = { lat, lon };
      if (area.contains(point)) cells.add(wayfarerCellAt(point));
    }
  }
  return [...cells];
}

/**
 * The cells of the outlines grown by `margin` metres (`areaCells`) that were not received
 * (`received`: the covered and the bare cells), in the order found (south to north), each once.
 */
export function missingCells(
  outlines: readonly (readonly LatLon[])[],
  received: ReadonlySet<string>,
  margin = 0,
  spacingMetres = 300,
): string[] {
  return areaCells(outlines, margin, spacingMetres).filter((token) => !received.has(token));
}
