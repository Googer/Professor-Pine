import { describe, expect, it } from 'vitest';
import { distanceWords } from './distance-words.js';

/** Feet in meters. */
const ft = (feet: number) => feet / 3.280_839_9;

describe('distanceWords (task 7: one wording by settings.distanceUnits)', () => {
  it('says imperial distances to the foot under 100 ft, to ten under a tenth of a mile, else miles', () => {
    expect(distanceWords(0, 'imperial')).toBe('0 ft');
    // A short distance is never rounded to nothing.
    expect(distanceWords(ft(2), 'imperial')).toBe('2 ft');
    expect(distanceWords(ft(99.4), 'imperial')).toBe('99 ft');
    expect(distanceWords(ft(104), 'imperial')).toBe('100 ft');
    expect(distanceWords(160, 'imperial')).toBe('520 ft');
    expect(distanceWords(161, 'imperial')).toBe('0.1 mi');
    expect(distanceWords(1609.344 * 12, 'imperial')).toBe('12.0 mi');
  });

  it('says metric distances to the meter under 100 m, to ten under a kilometer, else kilometers', () => {
    expect(distanceWords(0, 'metric')).toBe('0 m');
    expect(distanceWords(2, 'metric')).toBe('2 m');
    expect(distanceWords(44, 'metric')).toBe('44 m');
    expect(distanceWords(99.4, 'metric')).toBe('99 m');
    expect(distanceWords(104, 'metric')).toBe('100 m');
    expect(distanceWords(994, 'metric')).toBe('990 m');
    // What would round to 1000 m is said as a kilometer.
    expect(distanceWords(995, 'metric')).toBe('1.0 km');
    expect(distanceWords(1_000, 'metric')).toBe('1.0 km');
    expect(distanceWords(12_345, 'metric')).toBe('12.3 km');
  });
});
