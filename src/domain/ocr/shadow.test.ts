import { describe, expect, it } from 'vitest';
import type { RgbImage } from './image.js';
import { purpleShare } from './shadow.js';

/** A 100 × 100 screen of one colour, with another in the rectangle given. */
function screen(
  ground: [number, number, number],
  patch?: { colour: [number, number, number]; x0: number; y0: number; x1: number; y1: number },
): RgbImage {
  const data = new Uint8Array(100 * 100 * 3);
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      const inPatch = patch && x >= patch.x0 && x < patch.x1 && y >= patch.y0 && y < patch.y1;
      data.set(inPatch ? patch.colour : ground, (y * 100 + x) * 3);
    }
  }
  return { width: 100, height: 100, data };
}

describe('purpleShare', () => {
  const smoke: [number, number, number] = [140, 40, 220];

  it('measures saturated purple in the middle of the screen', () => {
    // 20 × 20 of the 80 × 50 middle.
    const share = purpleShare(
      screen([30, 120, 60], { colour: smoke, x0: 40, y0: 40, x1: 60, y1: 60 }),
    );
    expect(share).toBeCloseTo(0.1, 5);
  });

  it('does not count purple outside the middle, pale or dark purple, or blue', () => {
    const top = { colour: smoke, x0: 0, y0: 0, x1: 100, y1: 30 };
    expect(purpleShare(screen([30, 120, 60], top))).toBe(0);
    expect(purpleShare(screen([200, 180, 220]))).toBe(0);
    expect(purpleShare(screen([40, 10, 50]))).toBe(0);
    expect(purpleShare(screen([40, 60, 230]))).toBe(0);
  });
});
