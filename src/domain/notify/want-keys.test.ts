import { describe, expect, it } from 'vitest';
import { formAsStored, type FormReader } from '../pogo/wants.js';
import {
  countWants,
  gymWantKey,
  NEW_TRAINS_KEY,
  pokemonWantKeys,
  targetWantKey,
} from './want-keys.js';

describe('the keys of wants (plan 8H-3: WantCountDay)', () => {
  it('keys a Pokémon want by its target and scope, a tier and IVs by their target alone', () => {
    expect(
      pokemonWantKeys([
        { pokemon: 25, type: 'raid' },
        { pokemon: 487, type: 'both', form: 'giratina_origin' },
        { pokemon: 717, type: 'raid', shadow: true },
        { pokemon: 1, type: 'spawn', costumed: true },
        { pokemon: -5, type: 'raid' },
        { pokemon: -8, type: 'both' },
      ]),
    ).toEqual([
      'pokemon:25@raid',
      'pokemon:487:giratina_origin@both',
      'pokemon:717::shadow',
      // Costumed is the row's, never part of what is wanted.
      'pokemon:1@spawn',
      'tier:T5',
      'iv:zero',
    ]);
  });

  it('reads a member’s rows as one want per target, and skips a row it cannot read', () => {
    // Legacy duplicates of one target are one want, in every scope any of them has.
    expect(
      pokemonWantKeys([
        { pokemon: 25, type: 'raid' },
        { pokemon: 25, type: 'Spawn' },
        { pokemon: 0, type: 'raid' },
        { pokemon: 25, type: 'what' },
      ]),
    ).toEqual(['pokemon:25@both']);
    // Two keys of one entry are one want, by the reader of the game data.
    const reader: FormReader = (_dex, form) => ({
      key: form === 'giratina_old' ? 'giratina_origin' : form,
      mega: false,
    });
    expect(
      pokemonWantKeys(
        [
          { pokemon: 487, type: 'raid', form: 'giratina_old' },
          { pokemon: 487, type: 'raid', form: 'giratina_origin' },
        ],
        reader,
      ),
    ).toEqual(['pokemon:487:giratina_origin@raid']);
    expect(pokemonWantKeys([{ pokemon: 25, type: 'raid' }], formAsStored)).toHaveLength(1);
  });

  it('keys a target want by its token, a gym by its id, new trains as one', () => {
    expect(targetWantKey('research:pokemon:147')).toBe('research:pokemon:147');
    expect(targetWantKey('dynamax:6:charizard_gmax')).toBe('dynamax:6:charizard_gmax');
    expect(targetWantKey('grunt:water')).toBe('grunt:water');
    expect(targetWantKey('leader:any')).toBe('leader:any');
    expect(targetWantKey('giovanni')).toBe('giovanni');
    // A token of a later version, or none at all, is skipped.
    expect(targetWantKey('grunt:water:male')).toBeUndefined();
    expect(targetWantKey('research:pokemon:0')).toBeUndefined();
    expect(gymWantKey(42)).toBe('gym:42');
    expect(NEW_TRAINS_KEY).toBe('trains');
  });

  it('counts the members of each key, each member once', () => {
    expect(
      countWants([
        ['alice', 'pokemon:25@raid'],
        ['bob', 'pokemon:25@raid'],
        ['alice', 'pokemon:25@raid'],
        ['alice', 'trains'],
      ]),
    ).toEqual(
      new Map([
        ['pokemon:25@raid', 2],
        ['species:25', 2],
        ['trains', 1],
      ]),
    );
    expect(countWants([])).toEqual(new Map());
  });

  it('counts the members who want a species in any way once, for the board of the most wanted', () => {
    const counts = countWants([
      ['alice', 'pokemon:25@raid'],
      ['alice', 'pokemon:26:raichu_alola@both'],
      ['alice', 'pokemon:25::shadow'],
      ['alice', 'research:pokemon:25'],
      ['alice', 'dynamax:25'],
      ['alice', 'gigantamax:25:pikachu_gmax'],
      ['bob', 'research:pokemon:25:pikachu_costume'],
      // Mega Energy, a tier, a Rocket target and the like are no Pokémon wanted.
      ['carol', 'research:energy:25'],
      ['carol', 'tier:T5'],
      ['carol', 'grunt:electric'],
      ['carol', 'gym:25'],
    ]);
    expect(counts.get('species:25')).toBe(2);
    expect(counts.get('species:26')).toBe(1);
    expect([...counts.keys()].filter((key) => key.startsWith('species:')).sort()).toEqual([
      'species:25',
      'species:26',
    ]);
    expect(counts.get('pokemon:25@raid')).toBe(1);
  });
});
