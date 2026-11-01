import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { CURATED_NICKNAMES } from './nicknames.js';

describe('curated nicknames', () => {
  const catalogue = catalogueFixture();

  it('carries over the nicknames of the legacy data', () => {
    expect(Object.keys(CURATED_NICKNAMES).length).toBeGreaterThanOrEqual(140);
    expect(CURATED_NICKNAMES['tyranitar']).toEqual(['ttar']);
    expect(CURATED_NICKNAMES['ho_oh']).toEqual(['ho-oh', 'hooh', 'hoho', 'santa']);
    expect(CURATED_NICKNAMES['nidoran_female']).toEqual(['female']);
    expect(CURATED_NICKNAMES['rattata_alola']).toEqual(['alo']);
    expect(CURATED_NICKNAMES['unown_a']).toEqual(['a']);
  });

  it('is keyed by the keys of catalogue entries, never by an alias', () => {
    for (const key of Object.keys(CURATED_NICKNAMES)) {
      expect(catalogue.byKey(key)?.key, key).toBe(key);
    }
  });

  it('holds clean, lower-case, non-empty names without duplicates', () => {
    for (const [key, names] of Object.entries(CURATED_NICKNAMES)) {
      expect(names.length, key).toBeGreaterThan(0);
      expect(new Set(names).size, key).toBe(names.length);
      for (const name of names) {
        expect(name, key).toBe(name.trim().toLowerCase());
        expect(name, key).not.toBe('');
      }
    }
  });
});
