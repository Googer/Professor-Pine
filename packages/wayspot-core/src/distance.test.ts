import { describe, expect, it } from 'vitest';
import { metresBetween, nearestTo, placesWithin } from './distance.js';

const at = (id: number, lat: number, lon: number) => ({ id, lat, lon });

describe('metresBetween', () => {
  it('is zero for one point and the same both ways', () => {
    const a = { lat: 40.4406, lon: -79.9959 };
    const b = { lat: 40.4416, lon: -79.9949 };
    expect(metresBetween(a, a)).toBe(0);
    expect(metresBetween(a, b)).toBeCloseTo(metresBetween(b, a), 9);
  });

  it('measures a degree of latitude as about 111.2 km', () => {
    expect(metresBetween({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111_195, -1);
  });

  it('measures a degree of longitude shorter away from the equator', () => {
    const atEquator = metresBetween({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    const at60 = metresBetween({ lat: 60, lon: 0 }, { lat: 60, lon: 1 });
    expect(at60 / atEquator).toBeCloseTo(0.5, 3);
  });

  it('measures across the date line and to the other side of the earth', () => {
    expect(metresBetween({ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 })).toBeCloseTo(111_195, -1);
    expect(metresBetween({ lat: 90, lon: 0 }, { lat: -90, lon: 0 })).toBeCloseTo(20_015_087, -2);
  });
});

describe('placesWithin', () => {
  // A ten-thousandth of a degree of latitude is 11.1 metres.
  const places = [at(1, 40.0, -80.0), at(2, 40.00005, -80.0), at(3, 40.0002, -80.0)];

  it('gives what lies within the distance, nearest first, with the distance', () => {
    const found = placesWithin({ lat: 40.00001, lon: -80.0 }, places, 10);
    expect(found.map(({ place }) => place.id)).toEqual([1, 2]);
    expect(found[0]?.metres).toBeCloseTo(1.11, 1);
    expect(found[1]?.metres).toBeCloseTo(4.45, 1);
  });

  it('leaves out the place that is being moved', () => {
    const found = placesWithin({ lat: 40.0, lon: -80.0 }, places, 10, 1);
    expect(found.map(({ place }) => place.id)).toEqual([2]);
  });

  it('puts the lower id first of two that are equally near', () => {
    const twins = [at(9, 40.0, -80.0), at(4, 40.0, -80.0)];
    expect(placesWithin({ lat: 40.0, lon: -80.0 }, twins, 10).map((f) => f.place.id)).toEqual([
      4, 9,
    ]);
  });

  it('gives nothing when nothing is near', () => {
    expect(placesWithin({ lat: 41, lon: -80 }, places, 10)).toEqual([]);
  });
});

describe('nearestTo', () => {
  const places = [at(1, 40.0, -80.0), at(2, 40.001, -80.0), at(3, 40.01, -80.0)];

  it('gives the nearest other place with its distance', () => {
    const nearest = nearestTo(at(1, 40.0, -80.0), places);
    expect(nearest?.place.id).toBe(2);
    expect(nearest?.metres).toBeCloseTo(111.2, 0);
    expect(nearestTo(at(3, 40.01, -80.0), places)?.place.id).toBe(2);
  });

  it('does not count the place itself, by its id', () => {
    expect(nearestTo(at(2, 40.0, -80.0), places)?.place.id).toBe(1);
  });

  it('takes the lower id of two that are equally near', () => {
    const twins = [at(7, 40.001, -80.0), at(5, 40.001, -80.0), at(1, 40.0, -80.0)];
    expect(nearestTo(at(1, 40.0, -80.0), twins)?.place.id).toBe(5);
  });

  it('gives nothing for the only place', () => {
    expect(nearestTo(at(1, 40.0, -80.0), [at(1, 40.0, -80.0)])).toBeUndefined();
    expect(nearestTo(at(1, 40.0, -80.0), [])).toBeUndefined();
  });
});
