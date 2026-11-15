import { describe, expect, it } from 'vitest';
import { MAX_SEARCH_WORDS } from './text.js';
import { WayspotIndex, type SearchableWayspot } from './wayspot-index.js';

const stops: SearchableWayspot[] = [
  { id: 's1', title: 'Little Free Library', address: '12 Maple Ave, Pinewood, PA 15999, USA' },
  { id: 's2', title: 'St. Paul Church', address: '40 Church Ln, Pinewood, PA 15999, USA' },
  { id: 's3', title: 'Church of the Pines', address: '7 Birch St, Pinewood, PA 15999, USA' },
  { id: 's4', title: 'Mural of Readers', address: '12 Maple Ave, Pinewood, PA 15999, USA' },
  { id: 's5', title: 'Playground Slide', address: null },
  { id: 's6', title: 'Paulson Memorial Bench', address: '1 River Rd, Pinewood, PA 15999, USA' },
];

const ids = (found: { wayspot: { id: string } }[]) => found.map((hit) => hit.wayspot.id);

describe('WayspotIndex', () => {
  it('goes by the first words of a long text', () => {
    const title = Array.from({ length: MAX_SEARCH_WORDS }, (_, i) => `w${i}`).join(' ');
    const index = new WayspotIndex([...stops, { id: 'long', title, address: null }]);
    const [hit] = index.search(`${title} and nothing like these`);
    expect(hit?.wayspot.id).toBe('long');
    expect(hit?.allWords).toBe(true);
  });

  it('finds a Wayspot by every word of its title, beginnings too, best first', () => {
    const index = new WayspotIndex(stops);
    expect(ids(index.search('little free library'))).toEqual(['s1']);
    expect(ids(index.search('church'))).toEqual(['s2', 's3']);
    expect(ids(index.search('st paul'))).toEqual(['s2']);
    // A beginning: Paul and Paulson.
    expect(ids(index.search('paul')).sort()).toEqual(['s2', 's6']);
    expect(index.search('church').every((hit) => hit.allWords && !hit.corrected)).toBe(true);
  });

  it('finds by the street of the address, after the titles', () => {
    const index = new WayspotIndex(stops);
    expect(ids(index.search('maple ave'))).toEqual(['s1', 's4']);
    // A title word counts more than the same word in a street.
    expect(ids(index.search('church'))[0]).toBe('s2');
  });

  it('finds a Wayspot by the places Google gave around it, after a title with the word', () => {
    const places = new Map([
      ['s5', 'Corner Bakery Maple Dental'],
      ['s3', 'Pinewood Bakery'],
    ]);
    const index = new WayspotIndex(stops, (stop) => places.get(stop.id) ?? null);
    expect(ids(index.search('corner bakery'))).toEqual(['s5']);
    expect(ids(index.search('bakery')).sort()).toEqual(['s3', 's5']);
    // A place's name counts less than a title's word.
    const withTitle = new WayspotIndex(
      [...stops, { id: 's7', title: 'Bakery Square Fountain', address: null }],
      (stop) => places.get(stop.id) ?? null,
    );
    expect(ids(withTitle.search('bakery'))[0]).toBe('s7');
    // Without places nothing is found by them.
    expect(ids(new WayspotIndex(stops).search('corner bakery', { guesses: false }))).toEqual([]);
  });

  it('reads a misspelling of one letter only when nothing matched as typed', () => {
    const index = new WayspotIndex(stops);
    const misspelt = index.search('libary');
    expect(ids(misspelt)).toEqual(['s1']);
    expect(misspelt[0]).toMatchObject({ allWords: true, corrected: true });
    // Two letters wrong is no match.
    expect(index.search('lbrry free', { guesses: false })).toEqual([]);
    // Pines is a word as typed: Pine is not corrected to anything else.
    expect(index.search('pines').every((hit) => !hit.corrected)).toBe(true);
  });

  it('offers the corrections of a word as typed that looks misspelt: Little Free Libary beside the libraries', () => {
    const libraries: SearchableWayspot[] = [
      { id: 'l0', title: 'Little Free Libary', address: null },
      ...[1, 2, 3, 4].map((n) => ({
        id: `l${n}`,
        title: `Little Free Library ${n}`,
        address: null,
      })),
      { id: 'v1', title: 'Vicary House', address: null },
    ];
    const index = new WayspotIndex(libraries);
    const found = index.search('libary');
    // The title as typed first, then the libraries: one letter wrong, never two.
    expect(ids(found)).toEqual(['l0', 'l1', 'l2', 'l3', 'l4']);
    expect(found.map((hit) => [hit.corrected, hit.typos])).toEqual([
      [false, 0],
      [true, 1],
      [true, 1],
      [true, 1],
      [true, 1],
    ]);
    // A word as typed that does not look misspelt keeps its hits alone (church, not chorch).
    expect(ids(new WayspotIndex(stops).search('church'))).toEqual(['s2', 's3']);
  });

  it('reads the misspellings by the title: a word found only in the street counts for more', () => {
    const index = new WayspotIndex<SearchableWayspot>([
      { id: 'v1', title: 'Vicary Bench', address: '2 Library Lane, Pinewood, PA 15999, USA' },
      ...[1, 2, 3].map((n) => ({ id: `l${n}`, title: `Library Garden ${n}`, address: null })),
    ]);
    const found = index.search('libary');
    expect(found.map((hit) => hit.wayspot.id).at(-1)).toBe('v1');
    expect(found.find((hit) => hit.wayspot.id === 'v1')?.typos).toBe(3);
  });

  it('puts a guess that found more of the typed words first', () => {
    const index = new WayspotIndex<SearchableWayspot>([
      { id: 'g1', title: 'Garden', address: null },
      { id: 'g2', title: 'Library Garden of the Old Mill Race Trail', address: null },
      ...[1, 2, 3, 4, 5].map((n) => ({ id: `p${n}`, title: `Library ${n}`, address: null })),
    ]);
    const guesses = index.search('library garden qqqq');
    expect(guesses[0]).toMatchObject({ wayspot: { id: 'g2' }, missed: 1 });
    expect(guesses.find((hit) => hit.wayspot.id === 'g1')?.missed).toBe(2);
  });

  it('guesses by some of the words only when no Wayspot has them all', () => {
    const index = new WayspotIndex(stops);
    const guessed = index.search('church xyzzy');
    expect(ids(guessed).sort()).toEqual(['s2', 's3']);
    expect(guessed.every((hit) => !hit.allWords)).toBe(true);
    expect(index.search('church xyzzy', { guesses: false })).toEqual([]);
  });

  it('looks only at the Wayspots it is given, and finds nothing by common words alone', () => {
    const index = new WayspotIndex(stops);
    expect(ids(index.search('church', { within: new Set(['s3']) }))).toEqual(['s3']);
    expect(index.search('of the')).toEqual([]);
    expect(index.search('')).toEqual([]);
  });
});
