import { describe, expect, it } from 'vitest';
import { brightestStretched, scaledBox } from './image.js';

describe('scaledBox', () => {
  it('scales x and y apart', () => {
    expect(scaledBox({ x0: 1, y0: 2, x1: 3, y1: 4 }, 2, 0.5)).toEqual({
      x0: 2,
      y0: 1,
      x1: 6,
      y1: 2,
    });
  });
});

describe('brightestStretched', () => {
  it('keeps each pixel’s brightest channel, from a level up stretched over every level', () => {
    // White, a light grey edge, a bright blue (a Pokémon in front of a CP), a light sky, black.
    const pixels = [
      [255, 255, 255],
      [200, 200, 200],
      [40, 60, 250],
      [220, 235, 250],
      [0, 0, 0],
    ];
    const image = { width: 5, height: 1, data: Uint8Array.from(pixels.flat()) };
    const stretched = brightestStretched(image, 192);
    expect(stretched).toMatchObject({ width: 5, height: 1 });
    expect([...stretched.data]).toEqual(
      [255, 32, 235, 235, 0].flatMap((value) => [value, value, value]),
    );
  });
});
