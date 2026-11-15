import { describe, expect, it } from 'vitest';
import { sameGyms, type MatchedGym } from './neighbor-match.js';

/** A gym at a point, a few meters east of the first by `east` (about 0.0000118° a meter here). */
function gym(id: number, name: string, east = 0, pogoId: string | null = null): MatchedGym {
  return { id, name, pogoId, lat: 40.4406, lon: -79.9959 + east * 0.0000118 };
}

describe('sameGyms (plan 19E)', () => {
  it('matches one row both servers have, trivially', () => {
    expect(sameGyms([gym(1, 'Fountain')], [gym(1, 'Fountain')])).toEqual(new Map([[1, 1]]));
  });

  it('matches by the Wayfarer id where both have one, wherever and whatever they are called', () => {
    const ours = [gym(1, 'Fountain', 0, 'a.16')];
    const theirs = [gym(7, 'The Big Fountain', 40, 'a.16'), gym(8, 'Fountain', 0, 'b.16')];
    expect(sameGyms(ours, theirs)).toEqual(new Map([[1, 7]]));
  });

  it('matches by place within 10 meters and the name as the search reads it, failing an id', () => {
    const ours = [gym(1, 'St. Mary’s Church', 0, 'a.16'), gym(2, 'Library', 0)];
    const theirs = [gym(7, 'st marys church', 8), gym(8, 'Library', 11), gym(9, 'Park', 1)];
    expect(sameGyms(ours, theirs)).toEqual(new Map([[1, 7]]));
  });

  it('never matches two gyms whose Wayfarer ids differ, however near and alike', () => {
    expect(sameGyms([gym(1, 'Fountain', 0, 'a.16')], [gym(7, 'Fountain', 1, 'b.16')])).toEqual(
      new Map(),
    );
  });

  it('gives each gym one match at most: the nearest, the lower id on a tie', () => {
    const ours = [gym(1, 'Fountain', 0), gym(2, 'Fountain', 6)];
    const theirs = [gym(8, 'Fountain', 5), gym(7, 'Fountain', 3)];
    // Ours 1 takes 7 (3 m); ours 2 takes 8, the one left (1 m).
    expect(sameGyms(ours, theirs)).toEqual(
      new Map([
        [1, 7],
        [2, 8],
      ]),
    );
    expect(
      sameGyms([gym(1, 'Fountain', 0)], [gym(8, 'Fountain', 4), gym(7, 'Fountain', -4)]),
    ).toEqual(new Map([[1, 7]]));
  });
});
