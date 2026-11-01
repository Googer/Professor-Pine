import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import type { PokemonEntry } from './game-master.js';
import { appearsInWild, wildExceptions } from './wild.js';

const catalogue = catalogueFixture();
/** The default of the settings: the lake trio. */
const LAKE_TRIO = wildExceptions(catalogue, ['Uxie', 'Mesprit', 'Azelf']);
const wild = (found: PokemonEntry): boolean => appearsInWild(found, LAKE_TRIO.species);

function entry(key: string): PokemonEntry {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`no entry ${key}`);
  return found;
}

describe('wildExceptions', () => {
  it('reads species by key, id or name, whatever the case, and says their names', () => {
    expect(LAKE_TRIO).toEqual({
      species: new Set(['UXIE', 'MESPRIT', 'AZELF']),
      names: ['Uxie', 'Mesprit', 'Azelf'],
      unknown: [],
    });
    const mixed = wildExceptions(catalogue, [' uxie ', 'MESPRIT', 'tapu koko', 'Ho-Oh']);
    expect(mixed.species).toEqual(new Set(['UXIE', 'MESPRIT', 'TAPU_KOKO', 'HO_OH']));
    expect(mixed.names).toEqual(['Uxie', 'Mesprit', 'Tapu Koko', 'Ho-Oh']);
  });

  it('takes a form for its species, and a species once', () => {
    const read = wildExceptions(catalogue, ['giratina_origin', 'Giratina', 'articuno_galarian']);
    expect(read.species).toEqual(new Set(['GIRATINA', 'ARTICUNO']));
    expect(read.names).toEqual(['Giratina', 'Articuno']);
    expect(read.unknown).toEqual([]);
  });

  it('leaves out and reports what the catalogue does not know', () => {
    const read = wildExceptions(catalogue, ['Uxie', 'Missingno', 'lake trio']);
    expect(read.species).toEqual(new Set(['UXIE']));
    expect(read.unknown).toEqual(['Missingno', 'lake trio']);
    expect(wildExceptions(catalogue, [])).toEqual({ species: new Set(), names: [], unknown: [] });
  });
});

describe('appearsInWild', () => {
  it('is true for an ordinary Pokémon, its regional forms and its other forms', () => {
    for (const key of ['dratini', 'tyranitar', 'rattata_alola', 'unown', 'burmy_sandy', 'rotom']) {
      expect(wild(entry(key)), key).toBe(true);
    }
  });

  it('is true for a Pokémon that spawns only in parts of the world', () => {
    for (const key of ['kangaskhan', 'tauros', 'relicanth', 'klefki']) {
      expect(wild(entry(key)), key).toBe(true);
    }
  });

  it('is false for a mega and a primal, whatever the exceptions', () => {
    const all = new Set(catalogue.all.map((found) => found.pokemonId));
    for (const key of ['charizard_mega_x', 'venusaur_mega', 'kyogre_primal']) {
      expect(wild(entry(key)), key).toBe(false);
      expect(appearsInWild(entry(key), all), key).toBe(false);
    }
  });

  it('is false for every legendary, the Galarian birds and the fusions among them', () => {
    for (const key of [
      'mewtwo',
      'mewtwo_a',
      'articuno',
      'zapdos_galarian',
      'giratina_origin',
      'kyurem',
      'kyurem_black',
      'kyurem_white',
      'necrozma_dusk_mane',
      'necrozma_dawn_wings',
      'cosmog',
      'zygarde',
    ]) {
      expect(wild(entry(key)), key).toBe(false);
    }
  });

  it('is false for a mythical Pokémon and an ultra beast', () => {
    for (const key of ['mew', 'celebi', 'meltan', 'zeraora', 'nihilego', 'kartana', 'poipole']) {
      expect(wild(entry(key)), key).toBe(false);
    }
  });

  it('is true for the species the settings except: by default the lake trio', () => {
    for (const key of ['uxie', 'mesprit', 'azelf']) {
      expect(entry(key).class, key).toBe('legendary');
      expect(wild(entry(key)), key).toBe(true);
      // Without the exception they are legendaries like any other.
      expect(appearsInWild(entry(key), new Set()), key).toBe(false);
    }
  });

  it('follows the list it is given: a species with all its forms but its megas', () => {
    const birds = wildExceptions(catalogue, ['Articuno']).species;
    expect(appearsInWild(entry('articuno'), birds)).toBe(true);
    expect(appearsInWild(entry('articuno_galarian'), birds)).toBe(true);
    expect(appearsInWild(entry('zapdos'), birds)).toBe(false);
    expect(appearsInWild(entry('uxie'), birds)).toBe(false);
    const latias = wildExceptions(catalogue, ['Latias']).species;
    expect(appearsInWild(entry('latias'), latias)).toBe(true);
    expect(appearsInWild(entry('latias_mega'), latias)).toBe(false);
  });

  it('refuses exactly the megas and the classed species but the exceptions, over the whole catalogue', () => {
    const refused = catalogue.all.filter((found) => !wild(found));
    expect(refused.every((found) => found.kind === 'mega' || found.class !== null)).toBe(true);
    const allowedClassed = catalogue.all
      .filter((found) => wild(found) && found.class !== null)
      .map((found) => found.pokemonId);
    expect([...new Set(allowedClassed)].sort()).toEqual(['AZELF', 'MESPRIT', 'UXIE']);
  });
});
