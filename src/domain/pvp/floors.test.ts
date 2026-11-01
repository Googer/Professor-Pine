import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import type { PokemonEntry } from '../pogo/game-master.js';
import { autoFloor, rankedAsShadow } from './floors.js';

const catalogue = catalogueFixture();

function entry(key: string): PokemonEntry {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`no entry ${key}`);
  return found;
}

const floorOf = (key: string, shadow = false) => autoFloor(catalogue, entry(key), shadow);

describe('autoFloor', () => {
  it('starts an untradable legendary or mythical of an untradable species at 10', () => {
    for (const key of [
      'mew',
      'zarude',
      'deoxys_attack',
      'darkrai',
      'diancie',
      'diancie_mega',
      'eternatus',
      'eternatus_eternamax',
      'zygarde',
      'zygarde_complete',
    ]) {
      expect(floorOf(key), key).toEqual({ floor: 10, reason: 'untradable' });
    }
  });

  it('gives no floor to the tradable, to fusions of a tradable species, to the ordinary', () => {
    for (const key of [
      'meltan',
      'melmetal',
      'pecharunt',
      'mewtwo',
      'dialga',
      'nihilego',
      'kyurem',
      'kyurem_black',
      'necrozma_dusk_mane',
      'zacian_crowned_sword',
      'rayquaza_mega',
      'pikachu',
    ]) {
      expect(floorOf(key), key).toEqual({ floor: 0, reason: 'none' });
    }
  });

  it('starts a shadow legendary or mythical at 6, before the untradable 10', () => {
    expect(floorOf('mewtwo', true)).toEqual({ floor: 6, reason: 'shadow' });
    expect(floorOf('darkrai', true)).toEqual({ floor: 6, reason: 'shadow' });
    // A shadow of an ordinary Pokémon is caught from a grunt: no floor.
    expect(floorOf('bulbasaur', true)).toEqual({ floor: 0, reason: 'none' });
    // A Pokémon that cannot be a shadow is ranked as it is.
    expect(floorOf('mew', true)).toEqual({ floor: 10, reason: 'untradable' });
  });
});

describe('rankedAsShadow', () => {
  it('is a shadow only where one was asked for and the Pokémon can be one', () => {
    expect(rankedAsShadow(entry('mewtwo'), true)).toBe(true);
    expect(rankedAsShadow(entry('mewtwo'), false)).toBe(false);
    expect(rankedAsShadow(entry('mewtwo_mega_x'), true)).toBe(false);
    expect(rankedAsShadow(entry('mew'), true)).toBe(false);
  });
});
