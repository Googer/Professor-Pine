import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { compareOutlines, gymsBeyond, sameOutline, scanFinished } from './scanned-area.js';
import { missingCells } from '@pine/wayspot-core/scan-area';

const square = (south: number, west: number, size = 0.01): LatLon[] => [
  { lat: south, lon: west },
  { lat: south + size, lon: west },
  { lat: south + size, lon: west + size },
  { lat: south, lon: west + size },
  { lat: south, lon: west },
];

const A = square(40.4, -79.95);
const B = square(40.4, -79.94);

describe('the outlines of a scan and the regions of a server', () => {
  it('knows a ring whichever corner and way it starts', () => {
    const turned = [A[2]!, A[3]!, A[0]!, A[1]!, A[2]!];
    expect(sameOutline(A, turned)).toBe(true);
    expect(sameOutline(A, [...A].reverse())).toBe(true);
    expect(sameOutline(A, B)).toBe(false);
    const moved = A.map((corner, n) => (n === 1 ? { ...corner, lat: corner.lat + 0.001 } : corner));
    expect(sameOutline(A, moved)).toBe(false);
  });

  it('names the regions that are none of the scanned outlines, and counts the outlines that are no region', () => {
    expect(
      compareOutlines(
        [A, B],
        [
          { channelId: 'a', bounds: [...A].reverse() },
          { channelId: 'c', bounds: square(40.5, -79.9) },
        ],
      ),
    ).toEqual({ regionsNotScanned: ['c'], areasNotRegions: 1 });
    expect(compareOutlines([A], [{ channelId: 'a', bounds: A }])).toEqual({
      regionsNotScanned: [],
      areasNotRegions: 0,
    });
  });
});

describe('the gyms beyond the scanned area', () => {
  it('lists the gyms outside the outlines grown by the margin, nearest first, with their distance', () => {
    const gyms = [
      { id: 1, lat: 40.405, lon: -79.945 }, // inside A
      { id: 2, lat: 40.405, lon: -79.9555 }, // about 470 m west of A: within 500 m
      { id: 3, lat: 40.405, lon: -79.97 }, // about 1.7 km west
      { id: 4, lat: 40.405, lon: -79.962 }, // about 1 km west
    ];
    const beyond = gymsBeyond(gyms, [A], 500);
    expect(beyond.map((gym) => gym.gymId)).toEqual([4, 3]);
    expect(beyond[0]!.metres).toBeGreaterThan(900);
    expect(beyond[0]!.metres).toBeLessThan(1_100);
    expect(gymsBeyond(gyms, [], 500)).toEqual([]);
  });
});

describe('whether a scan was finished', () => {
  it('is finished when every cell of the area came, and never without outlines', () => {
    const cells = new Set(missingCells([A], new Set(), 100));
    expect(scanFinished([A], cells, 100)).toBe(true);
    const [first] = cells;
    cells.delete(first!);
    expect(scanFinished([A], cells, 100)).toBe(false);
    expect(scanFinished([], new Set(), 0)).toBe(false);
  });
});
