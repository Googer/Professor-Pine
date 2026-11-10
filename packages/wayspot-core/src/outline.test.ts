import { describe, expect, it } from 'vitest';
import { isClosedRing, type LatLon } from './lat-lon.js';
import { isSimple, MAX_OUTLINE_CORNERS, segmentsMeet, tidyOutline } from './outline.js';

const p = (lat: number, lon: number): LatLon => ({ lat, lon });
const SQUARE = [p(0, 0), p(1, 0), p(1, 1), p(0, 1)];

function ring(points: readonly LatLon[]): LatLon[] {
  const tidy = tidyOutline(points);
  if (!tidy.ok) throw new Error(`refused: ${tidy.problem.kind}`);
  return tidy.ring;
}

describe('tidyOutline', () => {
  it('keeps a closed ring as it is', () => {
    expect(ring([...SQUARE, p(0, 0)])).toEqual([...SQUARE, p(0, 0)]);
  });

  it('closes an open ring', () => {
    const closed = ring(SQUARE);
    expect(closed).toEqual([...SQUARE, p(0, 0)]);
    expect(isClosedRing(closed)).toBe(true);
  });

  it('accepts either winding', () => {
    const reversed = [...SQUARE].reverse();
    expect(ring(reversed)).toEqual([...reversed, reversed[0]]);
  });

  it('drops points that repeat the one before, also around the closing point', () => {
    expect(
      ring([p(0, 0), p(0, 0), p(1, 0), p(1, 0), p(1, 0), p(1, 1), p(0, 1), p(0, 0), p(0, 0)]),
    ).toEqual([...SQUARE, p(0, 0)]);
  });

  it('accepts a triangle and a shape that is not convex', () => {
    expect(ring([p(0, 0), p(1, 0), p(0, 1)])).toHaveLength(4);
    // An L.
    expect(ring([p(0, 0), p(2, 0), p(2, 1), p(1, 1), p(1, 2), p(0, 2)])).toHaveLength(7);
  });

  it('refuses fewer than three distinct corners', () => {
    for (const points of [
      [],
      [p(0, 0)],
      [p(0, 0), p(1, 1)],
      [p(0, 0), p(1, 1), p(0, 0)],
      [p(0, 0), p(0, 0), p(0, 0), p(0, 0)],
      [p(0, 0), p(1, 1), p(0, 0), p(1, 1), p(0, 0)],
    ]) {
      expect(tidyOutline(points)).toEqual({ ok: false, problem: { kind: 'too-few' } });
    }
  });

  it('refuses a coordinate that is no number', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(tidyOutline([...SQUARE, p(bad, 0)])).toEqual({
        ok: false,
        problem: { kind: 'not-a-number' },
      });
      expect(tidyOutline([...SQUARE, p(0, bad)])).toEqual({
        ok: false,
        problem: { kind: 'not-a-number' },
      });
    }
  });

  it('refuses a latitude or a longitude out of range, and accepts the ends of the ranges', () => {
    expect(tidyOutline([p(0, 0), p(90.01, 0), p(1, 1)])).toEqual({
      ok: false,
      problem: { kind: 'out-of-range' },
    });
    expect(tidyOutline([p(0, 0), p(1, -180.01), p(1, 1)])).toEqual({
      ok: false,
      problem: { kind: 'out-of-range' },
    });
    expect(tidyOutline([p(-90, -180), p(90, -180), p(90, 180), p(-90, 180)]).ok).toBe(true);
  });

  it('refuses more corners than a hand-drawn region has, and says how many', () => {
    // A circle of points: simple, only too fine.
    const circle = (corners: number) =>
      Array.from({ length: corners }, (_unused, i) => {
        const angle = (2 * Math.PI * i) / corners;
        return p(40 + Math.sin(angle), -80 + Math.cos(angle));
      });
    expect(tidyOutline(circle(MAX_OUTLINE_CORNERS)).ok).toBe(true);
    expect(tidyOutline(circle(MAX_OUTLINE_CORNERS + 1))).toEqual({
      ok: false,
      problem: { kind: 'too-many', corners: MAX_OUTLINE_CORNERS + 1 },
    });
    // Counted before anything dear is done: a ring too long that also crosses itself is refused
    // for its count, so the check for crossings never ran on it.
    const crossing = (corners: number) => {
      const ring = circle(corners);
      const [first, third] = [ring[0], ring[2]];
      if (!first || !third) throw new Error('the test ring');
      ring[0] = third;
      ring[2] = first;
      return ring;
    };
    expect(tidyOutline(crossing(MAX_OUTLINE_CORNERS))).toEqual({
      ok: false,
      problem: { kind: 'crosses-itself' },
    });
    expect(tidyOutline(crossing(100_000))).toEqual({
      ok: false,
      problem: { kind: 'too-many', corners: 100_000 },
    });
  });

  it('checks the longest outline it accepts for crossings by comparing only sides near each other', () => {
    // A traced boundary: a comb of 2,500 teeth, whose sides all lie in the same narrow band
    // (the worst case for looking only at sides that are near each other). Counted, not timed
    // (a clock fails on a loaded machine): every pair of its 2,501 sides would be over three million.
    const comb: LatLon[] = [];
    const teeth = (MAX_OUTLINE_CORNERS - 2) / 2;
    for (let i = 0; i < teeth; i++) comb.push(p(40 + (i % 2), -80 + i * 0.0001));
    comb.push(p(42, -80 + teeth * 0.0001), p(42, -80.0001));
    let compared = 0;
    const counting: typeof segmentsMeet = (...sides) => {
      compared += 1;
      return segmentsMeet(...sides);
    };
    expect(isSimple(comb, counting)).toBe(true);
    expect(compared).toBeLessThanOrEqual(comb.length);
    expect(tidyOutline(comb).ok).toBe(true);
    // One crossing at the very end is still found.
    const crossed = [...comb.slice(0, -1), p(39, -80.00005)];
    expect(tidyOutline(crossed)).toEqual({ ok: false, problem: { kind: 'crosses-itself' } });
  });

  it.each([
    ['a bow tie', [p(0, 0), p(1, 1), p(1, 0), p(0, 1)]],
    [
      'a figure of eight that meets in a corner',
      [p(0, 0), p(1, 0), p(1, 1), p(2, 1), p(2, 2), p(1, 2), p(1, 1), p(0, 1)],
    ],
    ['a corner that lies on another side', [p(0, 0), p(2, 0), p(2, 2), p(1, 0), p(0, 2)]],
    ['a spike that folds back on itself', [p(0, 0), p(2, 0), p(1, 0), p(1, 1)]],
    ['corners all on one line', [p(0, 0), p(1, 1), p(2, 2)]],
    ['a side that runs along another', [p(0, 0), p(3, 0), p(3, 1), p(2, 0), p(1, 0), p(0, 1)]],
  ])('refuses %s as an outline that crosses itself', (_what, points) => {
    expect(tidyOutline(points)).toEqual({ ok: false, problem: { kind: 'crosses-itself' } });
  });

  it('does not take corners on one line along a side for a crossing', () => {
    expect(ring([p(0, 0), p(0.5, 0), p(1, 0), p(1, 1), p(0, 1)])).toHaveLength(6);
  });
});
