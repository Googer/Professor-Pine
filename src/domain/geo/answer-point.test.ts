import { describe, expect, it } from 'vitest';
import { answerCell, answerPoint } from './answer-point.js';

describe('answerPoint', () => {
  it('rounds a point to a millionth of a degree, so that two servers’ copies of a place are one key', () => {
    expect(answerPoint({ lat: 40.44123449, lon: -79.99512351 })).toEqual({
      lat: 40.441234,
      lon: -79.995124,
    });
    expect(answerPoint({ lat: 40.4412344, lon: -79.995124 })).toEqual(
      answerPoint({ lat: 40.44123439, lon: -79.99512401 }),
    );
  });
});

describe('answerCell', () => {
  it('puts points in cells of a thousandth of a degree', () => {
    expect(answerCell({ lat: 40.4419, lon: -79.9951 })).toEqual({ lat: 40441, lon: -79996 });
    expect(answerCell({ lat: 40.4411, lon: -79.9959 })).toEqual({ lat: 40441, lon: -79996 });
  });
});
