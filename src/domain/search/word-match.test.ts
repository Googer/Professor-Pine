import { describe, expect, it } from 'vitest';
import { matchNamed, type Named } from './word-match.js';

const MOVES: Named<string>[] = [
  { value: 'cannon', names: ['Hydro Cannon'] },
  { value: 'pump', names: ['Hydro Pump'] },
  { value: 'gun', names: ['Water Gun'] },
  { value: 'ball', names: ['Shadow Ball', 'sball'] },
  { value: 'hydro', names: ['Hydro'] },
];

describe('matchNamed', () => {
  it('puts the exact name first, whatever the case, spaces or punctuation', () => {
    expect(matchNamed(MOVES, 'hydro pump')).toEqual(['pump']);
    expect(matchNamed(MOVES, 'HydroPump')).toEqual(['pump']);
    expect(matchNamed(MOVES, ' hydro-pump! ')).toEqual(['pump']);
    expect(matchNamed(MOVES, 'hydro')).toEqual(['hydro', 'cannon', 'pump']);
  });

  it('finds a thing by any of its names', () => {
    expect(matchNamed(MOVES, 'sball')).toEqual(['ball']);
    expect(matchNamed(MOVES, 'shadow ball')).toEqual(['ball']);
  });

  it('accepts the beginning of a name, and beginnings of its words', () => {
    expect(matchNamed(MOVES, 'hydro c')).toEqual(['cannon']);
    expect(matchNamed(MOVES, 'wat')).toEqual(['gun']);
    expect(matchNamed(MOVES, 'can hyd')).toEqual(['cannon']);
    expect(matchNamed(MOVES, 'gun')).toEqual(['gun']);
  });

  it('accepts small misspellings, after everything that fits better', () => {
    expect(matchNamed(MOVES, 'hydro canon')).toEqual(['cannon']);
    expect(matchNamed(MOVES, 'shadwo ball')).toEqual(['ball']);
    expect(matchNamed(MOVES, 'watr gun')).toEqual(['gun']);
    expect(matchNamed(MOVES, 'hidro')).toEqual(['hydro', 'cannon', 'pump']);
  });

  it('does not guess from one or two letters', () => {
    expect(matchNamed(MOVES, 'hy')).toEqual([]);
    expect(matchNamed(MOVES, 'w')).toEqual([]);
    expect(matchNamed([{ value: 1, names: ['no'] }], 'no')).toEqual([1]);
  });

  it('does not correct words of fewer than five letters', () => {
    const words: Named<string>[] = [{ value: 'none', names: ['none'] }];
    expect(matchNamed(words, 'done')).toEqual([]);
    expect(matchNamed(words, 'nonee')).toEqual(['none']);
  });

  it('does not drop a word or a first letter to make a match', () => {
    const words: Named<string>[] = [
      { value: 'coming', names: ['coming'] },
      { value: 'private', names: ['private'] },
      { value: 'hidden', names: ['hidden'] },
      { value: 'unhidden', names: ['unhidden'] },
      { value: 'cannon', names: ['hydro cannon'] },
    ];
    for (const text of ['no coming', 'uncoming', 'unprivate', 'no private', 'nhidden']) {
      expect(matchNamed(words, text), text).toEqual([]);
    }
    expect(matchNamed(words, 'comming')).toEqual(['coming']);
    expect(matchNamed(words, 'privat')).toEqual(['private']);
    expect(matchNamed(words, 'hydrocanon')).toEqual(['cannon']);
    expect(matchNamed(words, 'hydro canon')).toEqual(['cannon']);
  });

  it('gives nothing for text that fits no name, or no text', () => {
    expect(matchNamed(MOVES, 'thunderbolt')).toEqual([]);
    expect(matchNamed(MOVES, '')).toEqual([]);
    expect(matchNamed(MOVES, '?!')).toEqual([]);
    expect(matchNamed([], 'hydro')).toEqual([]);
  });

  it('keeps the order of the list among equal fits and returns each value once', () => {
    const twice: Named<string>[] = [
      { value: 'b', names: ['Rock Slide'] },
      { value: 'a', names: ['Rock Tomb'] },
      { value: 'b', names: ['Rock Blast'] },
    ];
    expect(matchNamed(twice, 'rock')).toEqual(['b', 'a']);
  });
});
