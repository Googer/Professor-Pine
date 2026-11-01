import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { feedLookup } from './feed-lookup.js';

const lookup = feedLookup(catalogueFixture());

describe('feedLookup', () => {
  it('gives the species id of a Pokédex number, or nothing for an unknown one', () => {
    expect(lookup.speciesId(25)).toBe('PIKACHU');
    expect(lookup.speciesId(29)).toBe('NIDORAN_FEMALE');
    expect(lookup.speciesId(645)).toBe('LANDORUS');
    expect(lookup.speciesId(99999)).toBeUndefined();
  });

  it('finds an entry by its exact name, with the ids a feed row carries', () => {
    expect(lookup.findByName('Yveltal')).toEqual({ pokemonId: 'YVELTAL', form: null });
    expect(lookup.findByName('yveltal ')).toEqual({ pokemonId: 'YVELTAL', form: null });
    expect(lookup.findByName('Mega Blastoise')).toEqual({
      pokemonId: 'BLASTOISE',
      form: 'BLASTOISE_MEGA',
    });
    expect(lookup.findByName('Mega Charizard X')).toEqual({
      pokemonId: 'CHARIZARD',
      form: 'CHARIZARD_MEGA_X',
    });
    expect(lookup.findByName('Alolan Rattata')).toEqual({
      pokemonId: 'RATTATA',
      form: 'RATTATA_ALOLA',
    });
  });

  it('finds a form written with its short name', () => {
    expect(lookup.findByName('Landorus (Incarnate)')).toEqual({
      pokemonId: 'LANDORUS',
      form: 'LANDORUS_INCARNATE',
    });
    expect(lookup.findByName('Landorus (Incarnate Forme)')).toEqual({
      pokemonId: 'LANDORUS',
      form: 'LANDORUS_INCARNATE',
    });
  });

  it('finds nothing for a name that is not exact', () => {
    expect(lookup.findByName('Astronaut Pikachu')).toBeUndefined();
    expect(lookup.findByName('Yvelta')).toBeUndefined();
    expect(lookup.findByName('Landorus (Sky)')).toBeUndefined();
    expect(lookup.findByName('')).toBeUndefined();
  });
});
