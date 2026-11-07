import type { LatLon } from '@pine/wayspot-core/lat-lon';

/** How many coordinates were read, of every corner counted; past `budget` a read throws. */
export interface Reads {
  count: number;
  budget: number;
}

/**
 * The same corners as new objects whose latitude and longitude count each read in `reads`: the
 * work of a geometry, by count rather than by the clock (a clock fails on a loaded machine).
 * Past the budget a read throws, so that a slow way fails at once instead of running for
 * minutes. Copies of a corner (`{ ...corner }`) read it once and are not counted after.
 */
export function countedCorners(corners: readonly LatLon[], reads: Reads): LatLon[] {
  const read = (value: number): number => {
    reads.count += 1;
    if (reads.count > reads.budget) throw new Error('too many coordinates read');
    return value;
  };
  return corners.map(({ lat, lon }) => ({
    get lat() {
      return read(lat);
    },
    get lon() {
      return read(lon);
    },
  }));
}

/**
 * The same list, counting in `reads` each item read of it by its index (cheaper than
 * `countedCorners` where there are millions of reads; what is read of a copy of the list is not
 * counted). Past the budget a read throws.
 */
export function countedList<T>(list: readonly T[], reads: Reads): readonly T[] {
  return new Proxy(list, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/u.test(key)) {
        reads.count += 1;
        if (reads.count > reads.budget) throw new Error('too many items read');
      }
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
}
