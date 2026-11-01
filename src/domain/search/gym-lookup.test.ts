import { describe, expect, it } from 'vitest';
import {
  EAST_CHANNEL,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  testGyms,
  testRegions,
} from '../../../test/support/gyms.js';
import { GymLookup, type GymLookupOptions } from './gym-lookup.js';

const IGNORED = ['ex', 'raid', 'gym', 'sponsored'];
const lookup = new GymLookup(testGyms(), testRegions(), IGNORED);

/** Hits as `<gym id><first letter of the place>`, with `?` for a guess: `5l`, `7n`, `1a?`. */
const hits = (channelId: string | null, text: string, options?: GymLookupOptions) =>
  lookup
    .search(channelId, text, options)
    .map((hit) => `${hit.gym.id}${hit.place[0] ?? ''}${hit.allWords ? '' : '?'}`);

describe('GymLookup: regions', () => {
  it('knows which channels are regions', () => {
    expect(lookup.isRegion(WEST_CHANNEL)).toBe(true);
    expect(lookup.isRegion(EAST_CHANNEL)).toBe(true);
    expect(lookup.isRegion(UNBOUNDED_CHANNEL)).toBe(false);
    expect(lookup.isRegion('999')).toBe(false);
  });

  it('goes by the first, oldest, of several rows of one channel', () => {
    const [west] = testRegions();
    if (!west) throw new Error('no West');
    const twice = new GymLookup(testGyms(), [{ ...west, bounds: null }, west]);
    expect(twice.isRegion(WEST_CHANNEL)).toBe(false);
    expect(twice.inRegion(WEST_CHANNEL)).toEqual([]);
  });

  it('knows the regions a gym lies in', () => {
    expect(lookup.regionsOf(1)).toEqual([WEST_CHANNEL]);
    expect(lookup.regionsOf(7)).toEqual([EAST_CHANNEL]);
    expect(lookup.regionsOf(10)).toEqual([]);
    expect(lookup.regionsOf(12345)).toEqual([]);
  });

  it('gives gyms by id', () => {
    expect(lookup.get(8)?.name).toBe('Café Élan Fresco');
    expect(lookup.get(12345)).toBeUndefined();
    expect(lookup.size).toBe(12);
  });
});

describe('GymLookup: searching from a region channel', () => {
  it('finds the gyms of the region', () => {
    expect(hits(WEST_CHANNEL, 'library')).toEqual(['1l']);
    expect(hits(WEST_CHANNEL, 'starbucks')).toEqual(['5l']);
    expect(hits(EAST_CHANNEL, 'starbucks')).toEqual(['9l']);
  });

  it('adds the gyms just across the border, after the region’s own', () => {
    expect(hits(WEST_CHANNEL, 'mural')).toEqual(['1l', '7n']);
    expect(hits(WEST_CHANNEL, 'lighthouse')).toEqual(['7n']);
    expect(hits(EAST_CHANNEL, 'bridge')).toEqual(['4n']);
    expect(hits(WEST_CHANNEL, 'bridge')).toEqual(['4l']);
  });

  it('does not find gyms further away', () => {
    expect(hits(EAST_CHANNEL, 'library')).toEqual([]);
    expect(hits(WEST_CHANNEL, 'fresco')).toEqual([]);
    expect(hits(WEST_CHANNEL, 'trailhead')).toEqual([]);
  });

  it('prefers a gym across the border that has every word to a guess at home', () => {
    // West has a Starbucks but nothing on Harbor Street; the lighthouse is on it, across the border.
    expect(hits(WEST_CHANNEL, 'harbor lighthouse')).toEqual(['7n']);
    expect(hits(WEST_CHANNEL, 'starbucks harbor')).toEqual(['5l?', '7n?']);
  });
});

describe('GymLookup: searching from elsewhere', () => {
  it('looks at all gyms without a channel', () => {
    expect(hits(null, 'starbucks')).toEqual(['5a', '9a']);
    expect(hits(null, 'trailhead')).toEqual(['10a']);
    expect(hits(null, 'mural')).toEqual(['7a', '1a']);
  });

  it('looks at all gyms from a channel that is not a region with an outline', () => {
    expect(hits(UNBOUNDED_CHANNEL, 'library')).toEqual(['1a']);
    expect(hits('999', 'library')).toEqual(['1a']);
  });

  it('marks guesses', () => {
    expect(hits(null, 'library zzz')).toEqual(['1a?']);
    expect(hits(null, 'zzz')).toEqual([]);
    expect(hits(null, '')).toEqual([]);
  });
});

describe('GymLookup: options', () => {
  it('passes on name-only searching', () => {
    expect(hits(WEST_CHANNEL, 'mural', { nameOnly: true })).toEqual(['7n']);
    expect(hits(null, 'luna', { nameOnly: true })).toEqual([]);
  });

  it('limits the hits over both places together', () => {
    expect(hits(WEST_CHANNEL, 'mural', { limit: 1 })).toEqual(['1l']);
    expect(hits(WEST_CHANNEL, 'pinewood', { limit: 3 })).toHaveLength(3);
  });

  it('looks only at the gyms `within` names, guessing among them when none has every word', () => {
    expect(hits(null, 'starbucks', { within: new Set([9, 10]) })).toEqual(['9a']);
    // The Starbucks of West has every word; among the others, the mosaic is a guess.
    expect(hits(null, 'starbucks mosaic', { within: new Set([6, 7]) })).toEqual(['6a?']);
    expect(hits(WEST_CHANNEL, 'mural', { within: new Set([7]) })).toEqual(['7n']);
  });
});

describe('GymLookup: changes', () => {
  it('sorts a new gym into its regions', () => {
    const own = new GymLookup(testGyms(), testRegions(), IGNORED);
    const template = testGyms()[0];
    if (!template) throw new Error('The fixture is empty');
    own.put({ ...template, id: 50, name: 'Clock Tower', lat: 40.05, lon: -79.95 });
    expect(own.regionsOf(50)).toEqual([EAST_CHANNEL]);
    expect(own.search(EAST_CHANNEL, 'clock').map((hit) => hit.place)).toEqual(['local']);
    expect(own.search(WEST_CHANNEL, 'clock')).toEqual([]);
  });

  it('moves a gym that changed place', () => {
    const own = new GymLookup(testGyms(), testRegions(), IGNORED);
    const library = own.get(1);
    if (!library) throw new Error('The fixture has no gym 1');
    own.put({ ...library, lon: -79.99 });
    expect(own.regionsOf(1)).toEqual([EAST_CHANNEL]);
    expect(own.search(WEST_CHANNEL, 'library').map((hit) => hit.place)).toEqual(['neighbouring']);
    own.put({ ...library, lat: 45 });
    expect(own.regionsOf(1)).toEqual([]);
    expect(own.search(WEST_CHANNEL, 'library')).toEqual([]);
    expect(own.search(null, 'library')).toHaveLength(1);
  });

  it('forgets a removed gym', () => {
    const own = new GymLookup(testGyms(), testRegions(), IGNORED);
    expect(own.remove(7)).toBe(true);
    expect(own.remove(7)).toBe(false);
    expect(own.get(7)).toBeUndefined();
    expect(own.regionsOf(7)).toEqual([]);
    expect(own.search(WEST_CHANNEL, 'lighthouse')).toEqual([]);
  });
});

describe('GymLookup: corrections', () => {
  it('prefers the word as typed across the border to a correction at home', () => {
    const template = testGyms()[0];
    if (!template) throw new Error('The fixture is empty');
    const own = new GymLookup(
      [...testGyms(), { ...template, id: 60, name: 'Lighthouze', lat: 40.04, lon: -80.05 }],
      testRegions(),
      IGNORED,
    );
    const found = own.search(WEST_CHANNEL, 'lighthouse');
    expect(found.map((hit) => [hit.gym.id, hit.place, hit.corrected])).toEqual([
      [7, 'neighbouring', false],
      [60, 'local', true],
    ]);
  });
});
