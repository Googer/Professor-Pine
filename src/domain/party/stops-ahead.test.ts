import { describe, expect, it } from 'vitest';
import { arrivalNumbers, stopsAhead } from './stops-ahead.js';

// Plan 8M-15 (design 3): the stops ahead in the order the train reaches them, by their indices of
// the route as it is stored now, until it has reached every stop of the route once more.
describe('stopsAhead', () => {
  it('runs to the end of a route that finishes', () => {
    expect(stopsAhead(5, 1, 'finish')).toEqual([2, 3, 4]);
    expect(stopsAhead(5, 4, 'finish')).toEqual([]);
  });

  it('goes round a loop to the stop before the current one', () => {
    expect(stopsAhead(5, 2, 'loop')).toEqual([3, 4, 0, 1]);
    expect(stopsAhead(5, 0, 'loop')).toEqual([1, 2, 3, 4]);
    expect(stopsAhead(5, 4, 'loop')).toEqual([0, 1, 2, 3]);
  });

  it('turns back at the end, through the current stop, to the start', () => {
    // At the first stop: out to the end; the way back reaches nothing new.
    expect(stopsAhead(5, 0, 'turn-back')).toEqual([1, 2, 3, 4]);
    // At the last stop: back to the start (the route is stored the other way once it turns).
    expect(stopsAhead(5, 4, 'turn-back')).toEqual([3, 2, 1, 0]);
    // Mid-route: out to the end, back through the stop it is at, on to the start.
    expect(stopsAhead(5, 2, 'turn-back')).toEqual([3, 4, 3, 2, 1, 0]);
    expect(stopsAhead(2, 0, 'turn-back')).toEqual([1]);
  });

  it('has nothing ahead of a finished train, a route of one stop or none', () => {
    expect(stopsAhead(5, 5, 'loop')).toEqual([]);
    expect(stopsAhead(5, 5, 'turn-back')).toEqual([]);
    expect(stopsAhead(1, 0, 'finish')).toEqual([]);
    // A route of one stop finishes in every mode.
    expect(stopsAhead(1, 0, 'loop')).toEqual([]);
    expect(stopsAhead(1, 0, 'turn-back')).toEqual([]);
    expect(stopsAhead(0, 0, 'finish')).toEqual([]);
  });
});

// Plan 8M-15 (design 3): one number per stop ahead, its next arrival counted from the train (1 is
// the next stop), none on the current stop; the map's badges and its Route list count by it
// (review R1-5: a fact of the domain).
describe('arrivalNumbers', () => {
  it('numbers each stop by its next arrival, the current stop and later arrivals left out', () => {
    // A turn-back train at index 1 of five: 2, 3, 4, then back through 3, 2 and 1 to 0.
    expect([...arrivalNumbers(stopsAhead(5, 1, 'turn-back'), 1)]).toEqual([
      [2, 1],
      [3, 2],
      [4, 3],
      [0, 7],
    ]);
    // A loop: every other stop once.
    expect([...arrivalNumbers(stopsAhead(4, 1, 'loop'), 1)]).toEqual([
      [2, 1],
      [3, 2],
      [0, 3],
    ]);
    expect([...arrivalNumbers([], null)]).toEqual([]);
  });
});
