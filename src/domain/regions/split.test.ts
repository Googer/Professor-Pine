import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { ringContains } from '@pine/wayspot-core/region-membership';
import { ringArea } from './coverage.js';
import { splitOutline } from './split.js';

const p = (lat: number, lon: number): LatLon => ({ lat, lon });
const SQUARE = [p(40, -80.1), p(40.1, -80.1), p(40.1, -80), p(40, -80), p(40, -80.1)];

function parts(line: LatLon[], ring = SQUARE): [LatLon[], LatLon[]] {
  const split = splitOutline(ring, line);
  if (!split.ok) throw new Error(`not split: ${split.reason}`);
  return split.parts;
}

describe('splitting an outline along a line', () => {
  it('gives the two parts on either side, the larger first, closed', () => {
    // A line from south to north at -80.07: west of it 0.03 degrees, east 0.07.
    const [larger, smaller] = parts([p(39.99, -80.07), p(40.11, -80.07)]);
    expect(ringContains(larger, p(40.05, -80.02))).toBe(true);
    expect(ringContains(smaller, p(40.05, -80.09))).toBe(true);
    expect(ringContains(larger, p(40.05, -80.09))).toBe(false);
    expect(larger[0]).toEqual(larger[larger.length - 1]);
    expect(smaller[0]).toEqual(smaller[smaller.length - 1]);
    expect(ringArea(larger) + ringArea(smaller)).toBeCloseTo(ringArea(SQUARE), -1);
    expect(ringArea(larger) / ringArea(smaller)).toBeCloseTo(7 / 3, 2);
  });

  it('follows the corners of the line inside the outline', () => {
    const [, smaller] = parts([p(39.99, -80.08), p(40.05, -80.05), p(40.11, -80.08)]);
    expect(smaller).toContainEqual(p(40.05, -80.05));
    expect(ringContains(smaller, p(40.05, -80.06))).toBe(true);
    expect(ringContains(smaller, p(40.01, -80.06))).toBe(false);
  });

  it('cuts across one side of the outline, and across a corner', () => {
    // In and out through the south side: a notch.
    const [, notch] = parts([p(39.99, -80.06), p(40.05, -80.05), p(39.99, -80.04)]);
    expect(ringContains(notch, p(40.01, -80.05))).toBe(true);
    // Through the north-west corner and out through the south side.
    const [, cut] = parts([p(40.1, -80.1), p(39.99, -80.09)]);
    expect(ringArea(cut)).toBeGreaterThan(0);
  });

  it('takes a line whose ends lie on the outline, as snapping leaves them', () => {
    const [larger, smaller] = parts([p(40, -80.05), p(40.1, -80.05)]);
    expect(ringArea(larger)).toBeCloseTo(ringArea(smaller), -1);
  });

  it('refuses a line that does not go across, or goes across more than once', () => {
    expect(splitOutline(SQUARE, [p(40.05, -80.05), p(40.11, -80.05)])).toEqual({
      ok: false,
      reason: 'not-across',
    });
    expect(splitOutline(SQUARE, [p(40.2, -80.2), p(40.2, -79.9)])).toEqual({
      ok: false,
      reason: 'not-across',
    });
    expect(
      splitOutline(SQUARE, [
        p(39.99, -80.08),
        p(40.11, -80.08),
        p(40.11, -80.02),
        p(39.99, -80.02),
      ]),
    ).toEqual({ ok: false, reason: 'several-crossings' });
  });

  it('refuses a line that crosses itself inside the outline', () => {
    expect(
      splitOutline(SQUARE, [
        p(39.99, -80.05),
        p(40.06, -80.05),
        p(40.04, -80.03),
        p(40.04, -80.07),
        p(40.11, -80.05),
      ]),
    ).toEqual({ ok: false, reason: 'crosses-itself' });
  });
});
