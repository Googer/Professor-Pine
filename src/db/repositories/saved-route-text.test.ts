import { describe, expect, it } from 'vitest';
import { gymStop, spotStop } from '../../domain/party/stops.js';
import { routeStops, routeText } from './saved-route-repository.js';

const SPOT = 'c0ffee00c0ffee00c0ffee00c0ffee00.16';

describe('the stops of a saved route as the column holds them (plan 8X-4; design 6.2)', () => {
  it('reads gym ids and Power Spots separated by commas, and leaves out what is none', () => {
    expect(routeStops('12,45,9')).toEqual([gymStop(12), gymStop(45), gymStop(9)]);
    expect(routeStops(`12,w${SPOT},9`)).toEqual([gymStop(12), spotStop(SPOT), gymStop(9)]);
    expect(routeStops('')).toEqual([]);
    expect(routeStops(null)).toEqual([]);
    // What the legacy bot may have left: a gym twice, words, numbers that are no id.
    expect(routeStops(' 3 , 3,4,x,1e3,99999999999999999999,0')).toEqual([gymStop(3), gymStop(4)]);
    // A power spot twice counts once, one of no Wayfarer id is none.
    expect(routeStops(`w${SPOT},wxyz,w${SPOT}`)).toEqual([spotStop(SPOT)]);
  });

  it('writes the stops by their keys, which it reads back as they were', () => {
    const stops = [gymStop(4), spotStop(SPOT), gymStop(1)];
    expect(routeText(stops)).toBe(`4,w${SPOT},1`);
    expect(routeStops(routeText(stops))).toEqual(stops);
    // A route of gyms is written as the legacy bot wrote it.
    expect(routeText([gymStop(4), gymStop(1)])).toBe('4,1');
  });
});
