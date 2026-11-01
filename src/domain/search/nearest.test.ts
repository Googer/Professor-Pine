import { metresBetween } from '@pine/wayspot-core/distance';
import { describe, expect, it } from 'vitest';
import { anchorMetres, nearerFirst, nearestPlaces } from './nearest.js';

/** A place `steps` thousandths of a degree north of 40.0, -80.0 (about 111 m each). */
const at = (name: string, steps: number, lon = -80) => ({ name, lat: 40 + steps * 0.001, lon });
const ORIGIN = { lat: 40, lon: -80 };
const NORTH = { lat: 40.01, lon: -80 };

describe('anchorMetres', () => {
  it('measures to the nearest of the anchors, with the one geometry of Pine', () => {
    const point = at('A', 8);
    expect(anchorMetres(point, [ORIGIN, NORTH])).toBe(metresBetween(point, NORTH));
    expect(anchorMetres(point, [ORIGIN])).toBe(metresBetween(point, ORIGIN));
  });

  it('is undefined without anchors', () => {
    expect(anchorMetres(ORIGIN, [])).toBeUndefined();
  });
});

describe('nearerFirst', () => {
  it('orders the nearer first, and leaves alone what has no distance', () => {
    expect(nearerFirst(10, 20)).toBeLessThan(0);
    expect(nearerFirst(20, 10)).toBeGreaterThan(0);
    expect(nearerFirst(10, 10)).toBe(0);
    expect(nearerFirst(undefined, undefined)).toBe(0);
    // One without a distance goes after one with.
    expect(nearerFirst(10, undefined)).toBeLessThan(0);
    expect(nearerFirst(undefined, 10)).toBeGreaterThan(0);
  });
});

describe('nearestPlaces', () => {
  const places = [at('Far', 30), at('Two', 2), at('One b', 1), at('One a', 1), at('Five', 5)];
  const options = {
    pointOf: (place: { lat: number; lon: number }) => place,
    nameOf: (place: { name: string }) => place.name,
  };

  it('lists the places nearest first, ties by name, each with its distance to the nearest anchor', () => {
    const found = nearestPlaces(places, [ORIGIN], options);
    expect(found.map(({ item }) => item.name)).toEqual(['One a', 'One b', 'Two', 'Five', 'Far']);
    expect(found[2]?.metres).toBe(metresBetween(at('Two', 2), ORIGIN));
  });

  it('measures from the nearest of several anchors', () => {
    // Far (30 steps) is half a step from the north anchor; the others are nearer the origin.
    const found = nearestPlaces(places, [ORIGIN, at('North', 30.5)], options);
    expect(found.map(({ item }) => item.name)).toEqual(['Far', 'One a', 'One b', 'Two', 'Five']);
  });

  it('keeps only those within the radius, and as many as asked', () => {
    expect(
      nearestPlaces(places, [ORIGIN], { ...options, within: 300 }).map(({ item }) => item.name),
    ).toEqual(['One a', 'One b', 'Two']);
    expect(
      nearestPlaces(places, [ORIGIN], { ...options, count: 2 }).map(({ item }) => item.name),
    ).toEqual(['One a', 'One b']);
  });

  it('lists nothing without an anchor', () => {
    expect(nearestPlaces(places, [], options)).toEqual([]);
  });
});
