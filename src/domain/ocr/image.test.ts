import { describe, expect, it } from 'vitest';
import { scaledBox } from './image.js';

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
