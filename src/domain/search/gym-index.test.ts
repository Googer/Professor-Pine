import { describe, expect, it } from 'vitest';
import { testGyms } from '../../../test/support/gyms.js';
import { GymIndex, searchedWords, type GymSearchOptions, type SearchableGym } from './gym-index.js';
import { MAX_SEARCH_WORDS } from './text.js';

const IGNORED = ['ex', 'raid', 'gym', 'sponsored'];
const index = new GymIndex(testGyms(), IGNORED);

const ids = (text: string, options?: GymSearchOptions) =>
  index.search(text, options).map((match) => match.gym.id);

describe('GymIndex: what is found', () => {
  it('finds a gym by its name, in any case and without accents or punctuation', () => {
    expect(ids('Pinewood Public Library')).toEqual([1]);
    expect(ids('pinewood public library')).toEqual([1]);
    expect(ids('st marys church')).toEqual([3]);
    expect(ids("St. Mary's")).toEqual([3]);
    expect(ids('cafe elan')).toEqual([8]);
    expect(ids('CAFÉ ÉLAN')).toEqual([8]);
  });

  it('finds a gym by one word, part of a word, or a misspelt word', () => {
    expect(ids('lighthouse')).toEqual([7]);
    expect(ids('lib')).toEqual([1]);
    expect(ids('Pinewood Public Libr')).toEqual([1]);
    expect(ids('libary')).toEqual([1]);
    expect(ids('lighthuose')).toEqual([7]);
    expect(ids('mapel')).toEqual(ids('maple'));
  });

  it('takes a single letter as a whole word only', () => {
    expect(ids('l')).toEqual([]);
    expect(ids('li')).toEqual([1, 7]);
    expect(ids('4')).toEqual([4]);
  });

  it('finds a gym by nickname, description, keyword, address, nearby place and number', () => {
    expect(ids('the stacks')).toEqual([1]);
    expect(ids('readers')).toEqual([1]);
    expect(ids('plaza')).toEqual([2]);
    expect(ids('church lane')).toEqual([3]);
    expect(ids('old town')).toEqual([1]);
    expect(ids('luna')).toEqual([2]);
    expect(ids('10')).toEqual([10]);
  });

  it('wants every word, each in any field', () => {
    expect(ids('starbucks')).toEqual([5, 9]);
    expect(ids('starbucks harbor')).toEqual([9]);
    expect(ids('starbucks maple')).toEqual([5]);
    expect(ids('fountain plaza')).toEqual([2]);
  });

  it('gives guesses, marked as such, only when no gym has every word', () => {
    const guesses = index.search('library zzz');
    expect(guesses.map((match) => [match.gym.id, match.allWords])).toEqual([[1, false]]);
    expect(index.search('library').map((match) => match.allWords)).toEqual([true]);
    expect(ids('library zzz', { words: 'all' })).toEqual([]);
    expect(ids('starbucks harbor', { words: 'any' })).toEqual(expect.arrayContaining([5, 7, 8, 9]));
    expect(ids('zzz')).toEqual([]);
  });

  it('does not search the notice', () => {
    expect(ids('dusk')).toEqual([]);
  });
});

describe('GymIndex: ignored words', () => {
  it('ignores the configured words and common words in what is typed', () => {
    expect(ids('the library gym')).toEqual([1]);
    expect(ids('post office gym')).toEqual([12]);
    expect(ids('raid at the library')).toEqual([1]);
  });

  it('gives nothing when only ignored words are typed', () => {
    for (const text of ['gym', 'raid', 'the', 'the gym', '', '?!']) {
      expect(ids(text), text).toEqual([]);
    }
  });

  it('ignores them in the gyms too', () => {
    // Gym 5 is described as "Sponsored gym".
    expect(ids('sponsored')).toEqual([]);
    expect(new GymIndex(testGyms()).search('sponsored').map((match) => match.gym.id)).toEqual([5]);
  });
});

describe('GymIndex: order', () => {
  it('puts a match in the name before one in the description', () => {
    expect(ids('mural')).toEqual([7, 1]);
  });

  it('puts a match in the name before one in the address', () => {
    // Gym 6 is the Maple Leaf Mosaic; gyms 1 and 5 are on Maple Avenue.
    expect(ids('maple')).toEqual([6, 1, 5]);
  });

  it('puts the exact word before a longer word and a misspelling', () => {
    const gyms = [
      { ...testGyms()[0]!, id: 1, name: 'Parkway Diner', nickname: null, description: null },
      { ...testGyms()[0]!, id: 2, name: 'Park Diner', nickname: null, description: null },
      { ...testGyms()[0]!, id: 3, name: 'Perk Diner', nickname: null, description: null },
    ].map((gym) => ({ ...gym, geodata: null, places: null }));
    const diners = new GymIndex(gyms);
    expect(diners.search('park').map((match) => match.gym.id)).toEqual([2, 1, 3]);
  });

  it('breaks ties by the lower id', () => {
    expect(ids('starbucks')).toEqual([5, 9]);
    expect(index.search('starbucks')[0]?.score).toBeGreaterThan(0);
  });
});

describe('GymIndex: options', () => {
  it('looks only at the gyms it is told to', () => {
    expect(ids('starbucks', { within: new Set([9, 8]) })).toEqual([9]);
    expect(ids('starbucks', { within: new Set() })).toEqual([]);
  });

  it('looks only at names and keywords when asked', () => {
    expect(ids('mural', { nameOnly: true })).toEqual([7]);
    expect(ids('plaza', { nameOnly: true })).toEqual([2]);
    expect(ids('luna', { nameOnly: true })).toEqual([]);
    expect(ids('the stacks', { nameOnly: true })).toEqual([]);
  });

  it('limits the matches', () => {
    expect(ids('pinewood', { limit: 2 })).toHaveLength(2);
    expect(ids('starbucks', { limit: 1 })).toEqual([5]);
  });
});

describe('GymIndex: changes', () => {
  it('adds, replaces and removes gyms', () => {
    const own = new GymIndex(testGyms(), IGNORED);
    const library = own.get(1);
    if (!library) throw new Error('The fixture has no gym 1');
    expect(own.size).toBe(12);

    own.put({ ...library, name: 'Pinewood Reading Room' });
    expect(own.size).toBe(12);
    expect(own.search('reading room').map((match) => match.gym.id)).toEqual([1]);
    expect(own.search('public library')).toEqual([]);
    expect(own.get(1)?.name).toBe('Pinewood Reading Room');

    own.put({ ...library, id: 99, name: 'Clock Tower' });
    expect(own.size).toBe(13);
    expect(own.search('clock').map((match) => match.gym.id)).toEqual([99]);

    expect(own.remove(99)).toBe(true);
    expect(own.remove(99)).toBe(false);
    expect(own.search('clock')).toEqual([]);
    expect(own.get(99)).toBeUndefined();
    expect(own.all().map((gym) => gym.id)).toHaveLength(12);
  });

  it('starts empty and answers nothing', () => {
    const empty = new GymIndex([]);
    expect(empty.size).toBe(0);
    expect(empty.search('library')).toEqual([]);
  });
});

function invented(id: number, name: string, extra: Partial<SearchableGym> = {}): SearchableGym {
  return {
    id,
    name,
    nickname: null,
    description: null,
    keywords: [],
    geodata: null,
    places: null,
    ...extra,
  };
}

describe('GymIndex: a long text', () => {
  it('goes by its first words', () => {
    const name = Array.from({ length: MAX_SEARCH_WORDS }, (_, i) => `w${i}`).join(' ');
    const [hit] = new GymIndex([invented(1, name)]).search(`${name} and nothing like these`);
    expect(hit?.gym.id).toBe(1);
    expect(hit?.allWords).toBe(true);
  });
});

describe('GymIndex: the word as typed comes before a correction', () => {
  const pizza = invented(1, 'Pizza Hut');
  const fountain = invented(2, 'Fountain', { description: 'Next to the fountain in the plaza' });
  const bench = invented(3, 'Bench', {
    geodata: JSON.stringify({ addressComponents: { route: 'Plaza Drive' } }),
  });
  const own = new GymIndex([pizza, fountain, bench]);

  it('puts the word as typed before a misspelling of another word', () => {
    const matches = own.search('plaza');
    expect(matches.map((match) => match.gym.id)).toEqual([2, 3, 1]);
    expect(matches.map((match) => match.corrected)).toEqual([false, false, true]);
    expect(matches.map((match) => match.allWords)).toEqual([true, true, true]);
  });

  it('still finds a gym by a misspelt word when nothing has the word as typed', () => {
    const matches = own.search('pizzza');
    expect(matches.map((match) => [match.gym.id, match.corrected, match.allWords])).toEqual([
      [1, true, true],
    ]);
  });

  it('marks a text with one word as typed and one misspelt as corrected', () => {
    const matches = own.search('pizza hutt');
    expect(matches.map((match) => [match.gym.id, match.corrected, match.allWords])).toEqual([
      [1, true, true],
    ]);
    expect(own.search('pizza hut').map((match) => match.corrected)).toEqual([false]);
  });

  it('reads the misspellings by the name: a word found only in the places nearby counts for more', () => {
    const many = new GymIndex([
      invented(1, 'Vicary House', { places: 'Carnegie Library Cafe' }),
      ...Array.from({ length: 41 }, (_, n) => invented(n + 2, `Library ${String(n + 1)}`)),
    ]);
    const found = many.search('libary');
    expect(found.at(-1)?.gym.id).toBe(1);
    expect(found[0]?.typos).toBe(1);
  });

  it('puts a correction of one letter before one of two: libary finds the libraries before Vicary House', () => {
    const libraries = new GymIndex([
      invented(1, 'Vicary House'),
      invented(2, 'Carnegie Library'),
      invented(3, 'Pinewood Public Library'),
      invented(4, 'Library Steps'),
      invented(5, 'Library Garden'),
    ]);
    const matches = libraries.search('libary');
    // The libraries by score among themselves (the shorter name first), then Vicary House.
    expect(matches.map((match) => match.gym.id)).toEqual([2, 4, 5, 3, 1]);
    expect(matches.map((match) => match.typos)).toEqual([1, 1, 1, 1, 2]);
    // As typed, nothing was corrected.
    expect(libraries.search('library').every((match) => match.typos === 0)).toBe(true);
  });

  it('puts a guess that found more of the typed words first, whatever its misspellings', () => {
    const three = new GymIndex([
      invented(1, 'Library Garden'),
      invented(2, 'Library Steps'),
      invented(3, 'Vicary House'),
    ]);
    const guesses = three.search('libary gardn qqqq');
    expect(guesses.every((match) => !match.allWords)).toBe(true);
    expect(guesses.map((match) => [match.gym.id, match.missed])).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
    ]);
  });

  it('marks guesses as corrected only when they needed a misspelling', () => {
    const guesses = own.search('bench zzz');
    expect(guesses.map((match) => [match.gym.id, match.corrected, match.allWords])).toEqual([
      [3, false, false],
    ]);
    const misspelt = own.search('benchh zzz');
    expect(misspelt.map((match) => [match.gym.id, match.corrected, match.allWords])).toEqual([
      [3, true, false],
    ]);
  });
});

describe('GymIndex: unfinished letters and numbers', () => {
  it('ignores a single letter when other words are typed', () => {
    const plain = index.search('pinewood');
    const unfinished = index.search('pinewood l');
    expect(unfinished.map((match) => match.gym.id)).toEqual(plain.map((match) => match.gym.id));
    expect(unfinished.every((match) => match.allWords)).toBe(true);
  });

  it('keeps a single letter that is a word of its own', () => {
    const own = new GymIndex([
      invented(1, 'AT&T Store'),
      invented(2, 'L Street Market'),
      invented(3, 'Parking Lot A'),
      invented(4, 'Parking Lot B'),
      invented(5, 'Parking Lot C'),
    ]);
    expect(own.search('at&t').map((match) => match.gym.id)).toEqual([1]);
    expect(own.search('the l').map((match) => match.gym.id)).toEqual([2]);
    expect(own.search('lot b').map((match) => match.gym.id)[0]).toBe(4);
    expect(own.search('parking l').map((match) => match.gym.id)).toEqual([3, 4, 5]);
  });

  it('keeps a single digit among other words', () => {
    const own = new GymIndex([invented(77, 'Fire Station 4'), invented(78, 'Fire Station 5')]);
    expect(own.search('station 4').map((match) => match.gym.id)).toEqual([77]);
  });

  it('matches a number as typed or as its beginning, never as a misspelling', () => {
    const own = new GymIndex([
      invented(12, 'Gamma'),
      invented(1234, 'Alpha'),
      invented(1235, 'Beta'),
    ]);
    expect(own.search('1234').map((match) => match.gym.id)).toEqual([1234]);
    expect(own.search('12').map((match) => match.gym.id)).toEqual([12, 1234, 1235]);
    expect(own.search('123').map((match) => match.gym.id)).toEqual([1234, 1235]);
    expect(own.search('1236')).toEqual([]);
  });

  it('finds a gym by a half-typed number in its name', () => {
    const own = new GymIndex([invented(500, 'Fire Station 12')]);
    const matches = own.search('station 1');
    expect(matches.map((match) => [match.gym.id, match.allWords])).toEqual([[500, true]]);
  });
});

describe('searchedWords', () => {
  it('gives the words of a text the search goes by', () => {
    expect(searchedWords("St. Mary's Church", IGNORED)).toEqual(['st', 'marys', 'church']);
    expect(searchedWords('The Old Raid Gym', IGNORED)).toEqual(['old']);
  });

  it('gives nothing for a name of ignored words only: such a gym is found by its number alone', () => {
    expect(searchedWords('The Gym', IGNORED)).toEqual([]);
    expect(searchedWords('EX-Raid Gym (Sponsored)', IGNORED)).toEqual([]);
    expect(searchedWords('The Gym', [])).toEqual(['gym']);
    // And the index agrees: nothing finds it but its number.
    const own = new GymIndex([invented(500, 'The Gym')], IGNORED);
    expect(own.search('the gym')).toEqual([]);
    expect(own.search('500').map((match) => match.gym.id)).toEqual([500]);
  });
});
