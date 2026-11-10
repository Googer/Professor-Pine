import { describe, expect, it } from 'vitest';
import {
  clearPlace,
  extraWords,
  guessRank,
  mergePlaces,
  placeFit,
  placeFitBy,
  type PlaceHit,
} from './place-merge.js';

const typed = { allWords: true, corrected: false };

describe('placeFit', () => {
  it('says how well the typed words fit a title, best first', () => {
    expect(placeFit('PNC park', ['PNC Park'], typed)).toBe('exact');
    // Common words and punctuation do not count.
    expect(placeFit('st paul church', ['St. Paul of the Church'], typed)).toBe('exact');
    expect(placeFit('park', ['PNC Park'], typed)).toBe('word');
    expect(placeFit('pnc pa', ['PNC Park'], typed)).toBe('beginning');
    // Found as typed, but by a word that is not in the title (the street, the nickname's
    // neighbour fields): looser.
    expect(placeFit('maple', ['Mural of Readers'], typed)).toBe('loose');
    expect(placeFit('libary', ['Little Free Library'], { allWords: true, corrected: true })).toBe(
      'guess',
    );
    expect(
      placeFit('church xyzzy', ['St. Paul Church'], { allWords: false, corrected: false }),
    ).toBe('guess');
  });

  it('takes the best of several names (a gym and its nickname)', () => {
    expect(placeFit('the stacks', ['Pinewood Public Library', 'The Stacks'], typed)).toBe('exact');
    expect(placeFit('stacks', ['Pinewood Public Library', null], typed)).toBe('loose');
  });

  it('says which of the names the fit came from: the words beyond are counted in that one', () => {
    const names = ['Pinewood Public Library', 'The Stacks'];
    expect(placeFitBy('the stacks', names, typed)).toEqual({ fit: 'exact', name: 'The Stacks' });
    expect(placeFitBy('library', names, typed)).toEqual({
      fit: 'word',
      name: 'Pinewood Public Library',
    });
    // Found by neither name: the first counts.
    expect(placeFitBy('maple', [null, 'Mural of Readers'], typed)).toEqual({
      fit: 'loose',
      name: 'Mural of Readers',
    });
  });
});

function hit(
  title: string,
  kind: PlaceHit<string>['kind'],
  fit: PlaceHit<string>['fit'],
  local = true,
  score = 1,
): PlaceHit<string> {
  return { item: title, title, kind, fit, local, score };
}

describe('mergePlaces', () => {
  it('orders by fit, then the member’s region, then gym, stop, Power Spot, then score', () => {
    const merged = mergePlaces([
      hit('Spot word', 'powerspot', 'word'),
      hit('Stop beginning', 'stop', 'beginning'),
      hit('Gym word elsewhere', 'gym', 'word', false),
      hit('Stop word', 'stop', 'word', true, 1),
      hit('Stop word better', 'stop', 'word', true, 5),
      hit('Gym exact', 'gym', 'exact', false),
      hit('Gym word', 'gym', 'word'),
      hit('Stop guess', 'stop', 'guess'),
    ]);
    expect(merged.map((one) => one.title)).toEqual([
      'Gym exact',
      'Gym word',
      'Stop word better',
      'Stop word',
      'Spot word',
      'Gym word elsewhere',
      'Stop beginning',
      'Stop guess',
    ]);
  });

  it('puts the kinds asked for first among hits as good, never above a better one (plan 8X-4)', () => {
    const merged = mergePlaces(
      [
        hit('Gym word', 'gym', 'word'),
        hit('Spot word', 'powerspot', 'word'),
        hit('Gym exact', 'gym', 'exact'),
        hit('Spot beginning', 'powerspot', 'beginning'),
      ],
      ['powerspot', 'gym'],
    );
    expect(merged.map((one) => one.title)).toEqual([
      'Gym exact',
      'Spot word',
      'Gym word',
      'Spot beginning',
    ]);
  });
});

describe('the distance to the places named before (Matt, 2026-10-27: nearby stops first)', () => {
  it('puts the nearer first after the words beyond those typed, before the score and the title', () => {
    const merged = mergePlaces([
      { ...hit('Bench far', 'stop', 'word', true, 9), extra: 1, distance: 900 },
      { ...hit('Bench near', 'stop', 'word', true, 1), extra: 1, distance: 100 },
      { ...hit('Bench', 'stop', 'word', true, 1), extra: 0, distance: 1_500 },
      { ...hit('Alley bench', 'stop', 'word', true, 1), extra: 1, distance: 100 },
      // Fit, region and kind still come first.
      { ...hit('Bench gym', 'gym', 'word', true, 1), extra: 1, distance: 5_000 },
      { ...hit('Bench elsewhere', 'stop', 'word', false, 1), extra: 1, distance: 10 },
      { ...hit('Bench guess', 'stop', 'guess', true, 1), distance: 1 },
    ]);
    expect(merged.map((one) => one.title)).toEqual([
      'Bench gym',
      'Bench',
      'Alley bench',
      'Bench near',
      'Bench far',
      'Bench elsewhere',
      'Bench guess',
    ]);
  });

  it('orders guesses as good alike by distance too, before their score', () => {
    const merged = mergePlaces([
      { ...hit('Libary far', 'stop', 'guess', true, 9), guess: 1, distance: 900 },
      { ...hit('Libary near', 'stop', 'guess', true, 1), guess: 1, distance: 100 },
    ]);
    expect(merged.map((one) => one.title)).toEqual(['Libary near', 'Libary far']);
  });
});

describe('guessRank and the guesses of several kinds', () => {
  it('puts a guess that found more of the typed words first, then the fewer letters read wrong', () => {
    const guess = (
      title: string,
      kind: PlaceHit<string>['kind'],
      missed: number,
      typos: number,
    ) => ({
      ...hit(title, kind, 'guess'),
      guess: guessRank({ missed, typos }),
    });
    const merged = mergePlaces([
      guess('Library Steps', 'gym', 2, 1),
      guess('Library Garden', 'stop', 1, 2),
      guess('Garden Bench', 'gym', 1, 1),
    ]);
    expect(merged.map((one) => one.title)).toEqual([
      'Garden Bench',
      'Library Garden',
      'Library Steps',
    ]);
  });
});

describe('extraWords and the order within one fit', () => {
  it('puts a title with fewer words beyond those typed before a better score', () => {
    expect(extraWords('park', 'Mammoth Park Skate Park')).toBe(2);
    expect(extraWords('park', 'Riverview Park')).toBe(1);
    expect(extraWords('st paul', 'St. Paul of the Church')).toBe(1);
    const merged = mergePlaces([
      { ...hit('Mammoth Park Skate Park', 'gym', 'word', true, 9), extra: 2 },
      { ...hit('Riverview Park', 'gym', 'word', true, 3), extra: 1 },
      { ...hit('Riverview Park Stop', 'stop', 'word', true, 9), extra: 0 },
    ]);
    // The kind still comes before the words beyond.
    expect(merged.map((one) => one.title)).toEqual([
      'Riverview Park',
      'Mammoth Park Skate Park',
      'Riverview Park Stop',
    ]);
    // A guess accounts for no word of a title: guesses go by score alone.
    const guesses = mergePlaces([
      { ...hit('Vicary House', 'gym', 'guess', true, 2), extra: 2 },
      { ...hit('Little Free Library', 'gym', 'guess', true, 5), extra: 3 },
    ]);
    expect(guesses.map((one) => one.title)).toEqual(['Little Free Library', 'Vicary House']);
  });
});

describe('clearPlace', () => {
  it('is the one hit whose every word matched exactly, of every kind and region', () => {
    expect(clearPlace([hit('A', 'stop', 'word'), hit('B', 'stop', 'beginning')])?.title).toBe('A');
    expect(clearPlace([hit('A', 'stop', 'exact', false), hit('B', 'gym', 'loose')])?.title).toBe(
      'A',
    );
    expect(clearPlace([hit('A', 'stop', 'word'), hit('B', 'gym', 'word')])).toBeUndefined();
    // One that names it outright beside others that hold every word is no clear hit either.
    expect(
      clearPlace([hit('A', 'stop', 'exact'), hit('B', 'gym', 'word'), hit('C', 'stop', 'word')]),
    ).toBeUndefined();
    expect(clearPlace([hit('A', 'stop', 'exact'), hit('B', 'gym', 'word', false)])).toBeUndefined();
    expect(clearPlace([hit('A', 'stop', 'exact'), hit('B', 'gym', 'exact')])).toBeUndefined();
    expect(clearPlace([hit('A', 'stop', 'loose')])).toBeUndefined();
    expect(clearPlace([])).toBeUndefined();
  });
});
