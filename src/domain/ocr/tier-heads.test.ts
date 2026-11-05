import { describe, expect, it } from 'vitest';
import type { GreyImage } from './image.js';
import { countHeads, headBand, headTemplate } from './tier-heads.js';

/**
 * A made-up head, 40 × 36: an opaque round body with two transparent eyes, transparent around
 * it. The game's own icon is never part of a test.
 */
function icon() {
  const width = 40;
  const height = 36;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inBody = ((x - 20) / 18) ** 2 + ((y - 18) / 16) ** 2 <= 1;
      const inEye = (x - 13) ** 2 + (y - 15) ** 2 <= 9 || (x - 27) ** 2 + (y - 15) ** 2 <= 9;
      const k = (y * width + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = 255;
      data[k + 3] = inBody && !inEye ? 255 : 0;
    }
  }
  return { width, height, data };
}

/** A band of a screen: a grey gradient with `count` heads drawn in a centred row. */
function band(
  count: number,
  headHeight = 30,
  spacing = 1.35,
  shift = 0,
  missing: readonly number[] = [],
): GreyImage {
  const width = 600;
  const height = 80;
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data[y * width + x] = 60 + x / 20;
  const scale = headHeight / 36;
  const headWidth = 40 * scale;
  const source = icon();
  for (let i = 0; i < count; i++) {
    if (missing.includes(i)) continue;
    const left = shift + width / 2 - headWidth / 2 + (i - (count - 1) / 2) * headWidth * spacing;
    for (let y = 0; y < headHeight; y++) {
      for (let x = 0; x < headWidth; x++) {
        const sx = Math.floor(x / scale);
        const sy = Math.floor(y / scale);
        const alpha = source.data[(sy * 40 + sx) * 4 + 3] ?? 0;
        const inside = ((sx - 20) / 18) ** 2 + ((sy - 18) / 16) ** 2 <= 1;
        if (!inside) continue;
        data[(25 + y) * width + Math.round(left + x)] = alpha > 127 ? 240 : 20;
      }
    }
  }
  return { width, height, data };
}

describe('headTemplate', () => {
  it('masks the outside but not the eyes', () => {
    const template = headTemplate(icon());
    const at = (x: number, y: number) => template.mask[y * template.width + x];
    expect(at(0, 0)).toBe(0);
    expect(at(13, 15)).toBe(1);
    expect(at(20, 18)).toBe(1);
    expect(template.data[15 * template.width + 13]).toBe(0);
  });
});

describe('countHeads', () => {
  const template = headTemplate(icon());

  it.each([1, 3, 4, 5, 6, 7])('counts a row of %i', (count) => {
    expect(countHeads(band(count), 30, template).count).toBe(count);
  });

  it('counts heads drawn smaller than expected, or wider apart', () => {
    expect(countHeads(band(5, 24), 30, template).count).toBe(5);
    expect(countHeads(band(5, 30, 1.48), 30, template).count).toBe(5);
  });

  it('counts a row of 2, which is no tier', () => {
    expect(countHeads(band(2), 30, template).count).toBe(2);
  });

  it('finds no row that is not centred on the screen', () => {
    expect(countHeads(band(3, 30, 1.35, 60), 30, template).count).toBe(0);
  });

  it('counts five whose outer heads are hidden as three: a hatched raid says so (heads-only)', () => {
    const counted = countHeads(band(5, 30, 1.35, 0, [0, 4]), 30, template);
    expect(counted.count).toBe(3);
    expect(counted.outside).toBeLessThan(0.45);
  });

  it('finds no heads where there are none', () => {
    expect(countHeads(band(0), 30, template).count).toBe(0);
  });
});

describe('headBand', () => {
  const template = headTemplate(icon());

  it('looks above the CP of a hatched raid, else under the countdown', () => {
    const cpBox = { x0: 300, y0: 1100, x1: 780, y1: 1200 };
    const countdownBox = { x0: 420, y0: 1500, x1: 660, y1: 1560 };
    expect(headBand({ cpBox, countdownBox })).toEqual({ top: 1028, bottom: 1112, unit: 30 });
    expect(headBand({ cpBox: null, countdownBox })).toEqual({ top: 1560, bottom: 1794, unit: 90 });
    expect(headBand({ cpBox: null, countdownBox: null })).toBeNull();
  });

  it('finds the heads GO draws higher over the CP in a short pane (plan 7P-H)', () => {
    // Matt's split of 2026-11-05: in a pane 1080 × 1212 the CP was 80 pixels tall (unit 24),
    // its heads 29 tall and 17 above it, so their tops stood 1.9 units over the CP's top.
    const cpBox = { x0: 200, y0: 120, x1: 400, y1: 200 };
    const screen = band(4, 29);
    // The heads of `band` stand from row 25 to 54: the CP's top 17 rows under them.
    const shift = 54 + 17 - cpBox.y0;
    const found = headBand({ cpBox, countdownBox: null });
    expect(found).not.toBeNull();
    const { top, bottom, unit } = found ?? { top: 0, bottom: 0, unit: 0 };
    const from = Math.max(0, Math.round(top + shift));
    const to = Math.min(screen.height, Math.round(bottom + shift));
    const rows: GreyImage = {
      width: screen.width,
      height: to - from,
      data: screen.data.slice(from * screen.width, to * screen.width),
    };
    expect(countHeads(rows, unit, template).count).toBe(4);
  });

  it('looks just above the species of a max battle, before anything else', () => {
    const max = {
      form: 'dynamax' as const,
      species: 'Sneasel',
      powerSpot: null,
      spotConfidence: null,
      box: { x0: 135, y0: 1500, x1: 950, y1: 1600 },
    };
    const countdownBox = { x0: 820, y0: 1380, x1: 980, y1: 1430 };
    expect(headBand({ cpBox: null, countdownBox, max })).toEqual({
      top: 1350,
      bottom: 1440,
      unit: 42,
    });
  });
});
