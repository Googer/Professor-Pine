import { describe, expect, it } from 'vitest';
import type { LatLon } from './lat-lon.js';
import { ringContains } from './region-membership.js';
import { cellCentre, wayfarerCellAt } from './s2.js';
import {
  areaCells,
  DEFAULT_SCAN_MARGIN,
  isScanMargin,
  MAX_SCAN_MARGIN,
  missingCells,
  scanArea,
} from './scan-area.js';

const ring = (...points: [number, number][]): LatLon[] => {
  const corners = points.map(([lat, lon]) => ({ lat, lon }));
  return [...corners, corners[0] ?? { lat: 0, lon: 0 }];
};

/** Invented outlines east of Pittsburgh: a bent one, and a small one apart from it. */
const BENT = ring(
  [40.4, -79.95],
  [40.4, -79.8],
  [40.47, -79.8],
  [40.47, -79.86],
  [40.44, -79.86],
  [40.44, -79.95],
);
const SMALL = ring([40.52, -79.7], [40.52, -79.68], [40.535, -79.68]);
const OUTLINES = [BENT, SMALL];

/** Points about 150 m apart inside the outlines. */
function pointsInside(outlines: readonly LatLon[][]): LatLon[] {
  const points: LatLon[] = [];
  for (let lat = 40.39; lat <= 40.54; lat += 0.00135) {
    for (let lon = -79.96; lon <= -79.67; lon += 0.0018) {
      const point = { lat, lon };
      if (outlines.some((outline) => ringContains(outline, point))) points.push(point);
    }
  }
  return points;
}

describe('the area of an export', () => {
  it('holds what lies in an outline, or within the margin of one, and is nothing without outlines', () => {
    const inside = { lat: 40.42, lon: -79.9 };
    // 400 m south of the bent outline.
    const near = { lat: 40.4 - 400 / 111_195, lon: -79.92 };
    const far = { lat: 40.4 - 900 / 111_195, lon: -79.92 };
    const bare = scanArea(OUTLINES, 0)!;
    expect(bare.contains(inside)).toBe(true);
    expect(bare.contains(near)).toBe(false);
    const grown = scanArea(OUTLINES, 500)!;
    expect(grown.contains(inside)).toBe(true);
    expect(grown.contains(near)).toBe(true);
    expect(grown.contains(far)).toBe(false);
    expect(grown.box.south).toBeLessThan(near.lat);
    expect(scanArea([], 500)).toBeUndefined();
  });

  it('holds the cells of the outlines, all but a few that only touch them, and nothing without outlines', () => {
    // The cells of points about 150 m apart in the outlines, whose centres lie in them: points
    // 300 m apart find all but one of each outline's 265 and 7 (a cell that reaches into an
    // outline only by a sliver has no such point inside; `scanFinished` counts the same).
    const points = pointsInside(OUTLINES);
    expect(points.length).toBeGreaterThan(1000);
    const inside = [...new Set(points.map((point) => wayfarerCellAt(point)))].filter((token) =>
      OUTLINES.some((outline) => ringContains(outline, cellCentre(token)!)),
    );
    expect(inside.length).toBeGreaterThan(50);
    const cells = new Set(areaCells(OUTLINES));
    expect(inside.filter((token) => !cells.has(token)).length).toBeLessThanOrEqual(2);
    expect(missingCells([], new Set())).toEqual([]);
  });
});

describe('the cells not received', () => {
  it('finds the cells inside the outlines that were not received, each once', () => {
    const all = missingCells([SMALL], new Set());
    expect(all.length).toBeGreaterThan(1);
    expect(new Set(all).size).toBe(all.length);
    const [kept, ...rest] = all;
    expect(missingCells([SMALL], new Set(rest))).toEqual([kept]);
    expect(missingCells([SMALL], new Set(all))).toEqual([]);
  });

  it('gives every cell of the area once, the margin included, the missing being those not received', () => {
    const bare = areaCells([SMALL]);
    const grown = areaCells([SMALL], 500);
    expect(new Set(grown).size).toBe(grown.length);
    expect(grown.length).toBeGreaterThan(bare.length);
    for (const token of bare) expect(grown).toContain(token);
    expect(missingCells([SMALL], new Set(), 500)).toEqual(grown);
    expect(areaCells([])).toEqual([]);
  });
});

describe('the margin of an export', () => {
  it('is 500 metres unless set, from nothing to 2,000', () => {
    expect(DEFAULT_SCAN_MARGIN).toBe(500);
    expect(MAX_SCAN_MARGIN).toBe(2_000);
    expect([0, 500, 2_000, 333.5].every(isScanMargin)).toBe(true);
    expect([-1, 2_001, NaN, Infinity, '500', null].some(isScanMargin)).toBe(false);
  });

  it('wants a cell 400 metres outside an outline with a margin of 500, not without one', () => {
    // 400 m south of the bent outline's southern side, where no point of the outline lies in
    // the same cell.
    const outside = { lat: 40.4 - 400 / 111_195, lon: -79.92 };
    const token = wayfarerCellAt(outside);
    expect(missingCells(OUTLINES, new Set(), 0)).not.toContain(token);
    expect(missingCells(OUTLINES, new Set(), 500)).toContain(token);
    expect(missingCells(OUTLINES, new Set([token]), 500)).not.toContain(token);
  });
});
