import { describe, expect, it } from 'vitest';
import {
  MAX_SEARCH_WORDS,
  STOP_WORDS,
  allowedTypos,
  firstWords,
  foldText,
  readsEvery,
  searchText,
  searchTokens,
} from './text.js';

describe('firstWords', () => {
  const words = (count: number) => Array.from({ length: count }, (_, i) => `w${i}`).join(' ');

  it('leaves a text within the limit as it is', () => {
    expect(firstWords('St. Paul’s Church')).toBe('St. Paul’s Church');
    expect(firstWords(words(MAX_SEARCH_WORDS))).toBe(words(MAX_SEARCH_WORDS));
  });

  it('keeps the first words of a longer text', () => {
    expect(firstWords(`${words(MAX_SEARCH_WORDS)} more and more`)).toBe(words(MAX_SEARCH_WORDS));
  });

  it('cuts a word too long to be one of a name', () => {
    const [word = '', ...rest] = searchTokens(firstWords(`${'x'.repeat(1_500)} park`));
    expect(word.length).toBeLessThan(100);
    expect(rest).toEqual(['park']);
  });
});

describe('foldText', () => {
  it('lower-cases and removes accents', () => {
    expect(foldText('Flabébé')).toBe('flabebe');
    expect(foldText('CAFÉ Élan')).toBe('cafe elan');
    expect(foldText('Señor Niño')).toBe('senor nino');
  });

  it('writes letters that have no accent to remove as plain letters', () => {
    expect(foldText('Straße')).toBe('strasse');
    expect(foldText('Łódź Æther Øre')).toBe('lodz aether ore');
  });
});

describe('searchTokens', () => {
  it('splits at everything that is not a letter or a digit', () => {
    expect(searchTokens('Mr. Mime')).toEqual(['mr', 'mime']);
    expect(searchTokens('Ho-Oh')).toEqual(['ho', 'oh']);
    expect(searchTokens('rattata_alola')).toEqual(['rattata', 'alola']);
    expect(searchTokens('  Fire   Station No. 4 ')).toEqual(['fire', 'station', 'no', '4']);
    expect(searchTokens('Smith/Jones (Park)')).toEqual(['smith', 'jones', 'park']);
  });

  it('drops apostrophes instead of splitting at them', () => {
    expect(searchTokens("St. Mary's")).toEqual(['st', 'marys']);
    expect(searchTokens('Farfetch’d')).toEqual(['farfetchd']);
    expect(searchTokens("O'Hara")).toEqual(['ohara']);
  });

  it('reads a custom emoji as its name', () => {
    expect(searchTokens('<:mewtwo:123456789012345678>')).toEqual(['mewtwo']);
    expect(searchTokens('mega <a:charizard:1> y')).toEqual(['mega', 'charizard', 'y']);
  });

  it('reads the signs of the two Nidoran as words', () => {
    expect(searchTokens('Nidoran♀')).toEqual(['nidoran', 'female']);
    expect(searchTokens('Nidoran♂')).toEqual(['nidoran', 'male']);
  });

  it('keeps letters of other alphabets', () => {
    expect(searchTokens('Ναός 東京 Tower')).toEqual(['ναος', '東京', 'tower']);
  });

  it('gives nothing for text without letters or digits', () => {
    expect(searchTokens('')).toEqual([]);
    expect(searchTokens(' !?… ')).toEqual([]);
  });
});

describe('searchText', () => {
  it('joins the words with single spaces', () => {
    expect(searchText('  Mr.   MIME ')).toBe('mr mime');
    expect(searchText('!')).toBe('');
  });
});

describe('allowedTypos', () => {
  it('allows none up to three letters, one up to five, two beyond', () => {
    expect(['', 'a', 'mew', 'onix', 'absol', 'mewtwo', 'tyranitar'].map(allowedTypos)).toEqual([
      0, 0, 0, 1, 1, 2, 2,
    ]);
  });
});

describe('STOP_WORDS', () => {
  it('holds common words in folded form', () => {
    expect(STOP_WORDS.has('the')).toBe(true);
    expect(STOP_WORDS.has('of')).toBe(true);
    expect(STOP_WORDS.has('park')).toBe(false);
    expect(STOP_WORDS.size).toBe(118);
    for (const word of STOP_WORDS) expect(searchTokens(word)).toEqual([word]);
  });
});

describe('readsEvery', () => {
  const name = searchTokens('Riverside Park Gazebo');
  it('reads a word as typed, as a beginning, or misspelt within allowedTypos', () => {
    expect(readsEvery(['riverside', 'park'], name)).toBe(true);
    expect(readsEvery(['river', 'gaz'], name)).toBe(true);
    expect(readsEvery(['rivreside'], name)).toBe(true);
    expect(readsEvery(['gazbo'], name)).toBe(true);
  });

  it('reads a word of three letters only as typed or as a beginning', () => {
    // "art" is two letters off "park": too short to be misspelt at all.
    expect(readsEvery(['riverside', 'art'], name)).toBe(false);
    expect(readsEvery(['par'], name)).toBe(true);
    expect(readsEvery(['riverside', 'zebra'], name)).toBe(false);
  });

  it('asks nothing of a word too common to search by', () => {
    expect(readsEvery(['the', 'riverside'], name)).toBe(true);
    expect(readsEvery([], name)).toBe(true);
  });
});
