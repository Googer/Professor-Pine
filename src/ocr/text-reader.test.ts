import { describe, expect, it } from 'vitest';
import { textReader, type ModelRun, type TextModels } from './text-reader.js';

/**
 * Made-up models: the detector marks two rows of text, the recogniser reads "ab" in whatever it
 * is given. The real models are never part of a unit test (`npm run ocr:check` runs them).
 */
function models(): TextModels & { asked: (readonly number[])[] } {
  const asked: (readonly number[])[] = [];
  const detect: ModelRun = (input, dims) => {
    asked.push(dims);
    const [, , height = 0, width = 0] = dims;
    expect(input).toHaveLength(3 * height * width);
    const map = new Float32Array(height * width);
    for (const [x0, y0, x1, y1] of [
      [8, 8, 40, 16],
      [8, 40, 24, 48],
    ] as const) {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) map[y * width + x] = 0.9;
    }
    return Promise.resolve({ data: map, dims: [1, 1, height, width] });
  };
  const recognise: ModelRun = (_input, dims) => {
    asked.push(dims);
    // Four steps over blank, a, b, space: a, a, blank, b.
    const scores = new Float32Array(4 * 4);
    [1, 1, 0, 2].forEach((c, step) => (scores[step * 4 + c] = 0.9));
    return Promise.resolve({ data: scores, dims: [1, 4, 4] });
  };
  return { detect, recognise, dictionary: ['a', 'b', ' '], asked };
}

describe('textReader', () => {
  it('reads each box of text and gives its box in the pixels of the picture', async () => {
    const made = models();
    // 48 × 60 is read by the detector at 64 × 64.
    const image = { width: 48, height: 60, data: new Uint8Array(48 * 60 * 3).fill(200) };
    const lines = await textReader(made)(image);
    expect(made.asked[0]).toEqual([1, 3, 64, 64]);
    // Every box was read at the recogniser's height.
    expect(made.asked.slice(1).every((dims) => dims[2] === 48)).toBe(true);
    expect(lines.map((line) => line.text)).toEqual(['ab', 'ab']);
    // The first box, 32 × 8 grown by 4.8 on each side, from 64 × 64 into 48 × 60.
    const first = lines[0]?.box;
    expect(first?.x0).toBeCloseTo((8 - 5) * (48 / 64), 5);
    expect(first?.y0).toBeCloseTo((8 - 5) * (60 / 64), 5);
    expect(first?.x1).toBeCloseTo((40 + 5) * (48 / 64), 5);
  });

  it('reads nothing when the detector finds no text', async () => {
    const made = models();
    made.detect = (_input, dims) =>
      Promise.resolve({ data: new Float32Array((dims[2] ?? 0) * (dims[3] ?? 0)), dims });
    const image = { width: 32, height: 32, data: new Uint8Array(32 * 32 * 3) };
    expect(await textReader(made)(image)).toEqual([]);
  });
});
