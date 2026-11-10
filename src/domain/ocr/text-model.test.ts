import { describe, expect, it } from 'vitest';
import type { TextLine } from './image.js';
import {
  ctcDecode,
  detectorSize,
  dictionaryOf,
  groupLines,
  lineWidth,
  MAX_LINE_WIDTH,
  modelInput,
  textBoxes,
} from './text-model.js';

/** A probability map with rectangles of 0.9 on 0. */
function mapWith(width: number, height: number, ...rects: [number, number, number, number][]) {
  const map = new Float32Array(width * height);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) map[y * width + x] = 0.9;
  }
  return map;
}

const line = (text: string, x0: number, y0: number, x1: number, y1: number, confidence = 0.9) =>
  ({ text, confidence, box: { x0, y0, x1, y1 } }) satisfies TextLine;

describe('detectorSize', () => {
  it('rounds each side up to a multiple of 32, at least 32', () => {
    expect(detectorSize(720, 1600)).toEqual({ width: 736, height: 1600 });
    expect(detectorSize(10, 33)).toEqual({ width: 32, height: 64 });
  });

  it('scales down what is larger than the detector reads', () => {
    const size = detectorSize(4000, 3000);
    expect(size.width * size.height).toBeLessThanOrEqual(2_000_000 * 1.05);
    expect(size.width / size.height).toBeCloseTo(4 / 3, 1);
  });
});

describe('modelInput', () => {
  it('gives blue, green and red planes of byte / 255, padding rows to the width asked', () => {
    const image = { width: 2, height: 1, data: Uint8Array.from([255, 0, 51, 0, 102, 0]) };
    const input = modelInput(image, 3);
    expect(Array.from(input).map((v) => Math.round(v * 255))).toEqual([
      51, 0, 0, /* green */ 0, 102, 0, /* red */ 255, 0, 0,
    ]);
  });
});

describe('textBoxes', () => {
  it('makes one grown box of each region of text, regions touching at a corner included', () => {
    const map = mapWith(100, 40, [10, 10, 40, 20], [40, 20, 50, 26], [70, 10, 90, 20]);
    const boxes = textBoxes(map, 100, 40);
    expect(boxes).toHaveLength(2);
    // 40 × 16 grown by 40·16·1.5 / (2·56) ≈ 8.6 on every side.
    expect(boxes[0]).toEqual({ x0: 1, y0: 1, x1: 59, y1: 35 });
    // 20 × 10 grown by 5.
    expect(boxes[1]).toEqual({ x0: 65, y0: 5, x1: 95, y1: 25 });
  });

  it('drops what is too thin to be text, and keeps boxes inside the map', () => {
    const map = mapWith(50, 20, [0, 0, 30, 2], [5, 10, 45, 20]);
    const boxes = textBoxes(map, 50, 20);
    expect(boxes).toEqual([{ x0: 0, y0: 4, x1: 50, y1: 20 }]);
  });

  it('counts only probabilities above the threshold', () => {
    const map = new Float32Array(20 * 20).fill(0.03);
    expect(textBoxes(map, 20, 20)).toEqual([]);
  });
});

describe('lineWidth', () => {
  it('scales the width as the height goes to 48', () => {
    expect(lineWidth({ x0: 0, y0: 0, x1: 100, y1: 24 })).toBe(200);
    expect(lineWidth({ x0: 0, y0: 0, x1: 1, y1: 200 })).toBe(1);
  });

  it('scales a line wider than the recogniser should read down to its widest', () => {
    expect(MAX_LINE_WIDTH).toBe(3200);
    expect(lineWidth({ x0: 0, y0: 0, x1: 1600, y1: 24 })).toBe(3200);
    expect(lineWidth({ x0: 0, y0: 0, x1: 4000, y1: 10 })).toBe(3200);
  });
});

describe('ctcDecode', () => {
  const dictionary = dictionaryOf('a\r\nb\nc');

  /** Scores of `steps` steps over 5 classes (blank, a, b, c, space), the best given per step. */
  function scores(best: number[], value = 0.8): Float32Array {
    const out = new Float32Array(best.length * 5).fill(0.01);
    best.forEach((c, step) => {
      out[step * 5 + c] = value;
    });
    return out;
  }

  it('folds repeats, drops blanks and reads a repeat split by a blank twice', () => {
    expect(ctcDecode(scores([1, 1, 0, 1, 2, 2, 4, 3]), 0, 8, 5, dictionary)).toEqual({
      text: 'aab c',
      confidence: expect.closeTo(0.8, 5) as number,
    });
  });

  it('reads from an offset, and gives an empty text a confidence of 0', () => {
    const two = new Float32Array([...scores([0, 0]), ...scores([3])]);
    expect(ctcDecode(two, 0, 2, 5, dictionary)).toEqual({ text: '', confidence: 0 });
    expect(ctcDecode(two, 10, 1, 5, dictionary).text).toBe('c');
  });
});

describe('groupLines', () => {
  it('joins pieces of one row left to right and orders the rows top down', () => {
    const lines = groupLines([
      line('Hill', 60, 102, 90, 120),
      line('9:41', 0, 0, 30, 18),
      line('Squirrel', 0, 100, 50, 120),
    ]);
    expect(lines.map((l) => l.text)).toEqual(['9:41', 'Squirrel Hill']);
    expect(lines[1]?.box).toEqual({ x0: 0, y0: 100, x1: 90, y1: 120 });
  });

  it('keeps the pieces of a joined row as its parts (two panes side by side, plan 7P)', () => {
    const [row, alone] = groupLines([
      line('BATTLE', 900, 500, 1000, 530),
      line('BATTLE', 100, 502, 200, 530),
      line('one', 0, 700, 50, 720),
    ]);
    expect(row?.parts).toEqual([
      { box: { x0: 100, y0: 502, x1: 200, y1: 530 }, length: 6 },
      { box: { x0: 900, y0: 500, x1: 1000, y1: 530 }, length: 6 },
    ]);
    expect(alone?.parts).toBeUndefined();
  });

  it('drops pieces read with little confidence', () => {
    expect(groupLines([line('x', 0, 0, 10, 10, 0.4), line('ok', 0, 50, 10, 60)])).toEqual([
      line('ok', 0, 50, 10, 60),
    ]);
  });

  // Review of the exact-name rule (2026-11-10): a name's last word read with little confidence
  // still takes its room on the line.
  it('keeps where the pieces it dropped stood on a row it kept', () => {
    const [name] = groupLines([
      line('Temple Sinai', 280, 160, 700, 216),
      line('Garden', 730, 162, 900, 216, 0.45),
      line('x', 0, 600, 10, 610, 0.4),
    ]);
    expect(name).toEqual({
      ...line('Temple Sinai', 280, 160, 700, 216),
      unread: [{ x0: 730, y0: 162, x1: 900, y1: 216 }],
    });
  });
});
