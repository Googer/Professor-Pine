import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { metresFromRing } from '@pine/wayspot-core/region-membership';
import { missingCells, scanArea } from '@pine/wayspot-core/scan-area';

/**
 * The area an export scanned, against the server it is imported into (Matt, 2026-10-15): the
 * file's own outlines grown by its margin (`scanArea`), never the server's regions of the day.
 * Whether those outlines are the server's regions as they are now, which gyms lie beyond the
 * area (the bulk deletion's candidates: production's gyms came from a box well past the
 * regions), and whether the scan was finished. Pure.
 */

/** How far two corners may lie apart, in degrees, and still be the same corner (about 1 cm). */
const SAME_CORNER = 1e-7;

/** The corners of a ring without its closing one, from its lowest corner, in both directions. */
function normalForms(ring: readonly LatLon[]): LatLon[][] {
  const open = ring.length > 1 ? ring.slice(0, -1) : [...ring];
  if (open.length === 0) return [[]];
  const lowest = (corners: readonly LatLon[]): number => {
    let best = 0;
    corners.forEach((corner, n) => {
      const kept = corners[best]!;
      if (corner.lat < kept.lat || (corner.lat === kept.lat && corner.lon < kept.lon)) best = n;
    });
    return best;
  };
  const from = (corners: readonly LatLon[]): LatLon[] => {
    const start = lowest(corners);
    return [...corners.slice(start), ...corners.slice(0, start)];
  };
  return [from(open), from([...open].reverse())];
}

/** Whether two outlines are the same ring: the same corners, whichever corner and way they start. */
export function sameOutline(a: readonly LatLon[], b: readonly LatLon[]): boolean {
  const [first] = normalForms(a);
  return normalForms(b).some(
    (other) =>
      other.length === first!.length &&
      other.every(
        (corner, n) =>
          Math.abs(corner.lat - first![n]!.lat) <= SAME_CORNER &&
          Math.abs(corner.lon - first![n]!.lon) <= SAME_CORNER,
      ),
  );
}

/** A region of the server as the comparison needs it. */
export interface OutlinedRegion {
  channelId: string;
  bounds: readonly LatLon[];
}

/**
 * How the file's outlines and the server's regions differ: the regions whose outline is none
 * of the file's (changed since the scan, or never scanned), and how many of the file's
 * outlines are no region's now.
 */
export interface OutlineComparison {
  regionsNotScanned: string[];
  areasNotRegions: number;
}

export function compareOutlines(
  outlines: readonly (readonly LatLon[])[],
  regions: readonly OutlinedRegion[],
): OutlineComparison {
  const matched = new Set<number>();
  const regionsNotScanned: string[] = [];
  for (const region of regions) {
    const found = outlines.findIndex(
      (outline, n) => !matched.has(n) && sameOutline(outline, region.bounds),
    );
    if (found < 0) regionsNotScanned.push(region.channelId);
    else matched.add(found);
  }
  return { regionsNotScanned, areasNotRegions: outlines.length - matched.size };
}

/** A gym beyond the scanned area: how far beyond the nearest outline it lies. */
export interface BeyondGym {
  gymId: number;
  metres: number;
}

/**
 * The gyms that lie outside the scanned area (the outlines grown by `margin`), nearest first,
 * each with its distance from the nearest outline. None for a file without outlines.
 */
export function gymsBeyond(
  gyms: readonly { id: number; lat: number; lon: number }[],
  outlines: readonly (readonly LatLon[])[],
  margin: number,
): BeyondGym[] {
  const area = scanArea(outlines, margin);
  if (!area) return [];
  return gyms
    .filter((gym) => !area.contains(gym))
    .map((gym) => ({
      gymId: gym.id,
      metres: Math.min(...outlines.map((outline) => metresFromRing(outline, gym))),
    }))
    .sort((a, b) => a.metres - b.metres || a.gymId - b.gymId);
}

/**
 * Whether a scan was finished: every cell of its area was received (covered or empty). A file
 * without outlines (listed cells) never is: it says nothing of an area.
 */
export function scanFinished(
  outlines: readonly (readonly LatLon[])[],
  covered: ReadonlySet<string>,
  margin: number,
): boolean {
  return outlines.length > 0 && missingCells(outlines, covered, margin).length === 0;
}
