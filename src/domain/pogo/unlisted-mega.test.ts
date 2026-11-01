import { describe, expect, it } from 'vitest';
import type { PokemonEntry } from './game-master.js';
import { unlistedMega } from './unlisted-mega.js';

const entry = (over: Partial<PokemonEntry>): PokemonEntry => ({
  key: 'chandelure',
  dex: 609,
  pokemonId: 'CHANDELURE',
  form: null,
  kind: 'species',
  tempEvolution: null,
  class: null,
  name: 'Chandelure',
  types: ['ghost', 'fire'],
  stats: { attack: 271, defense: 182, stamina: 155 },
  fastMoves: ['HEX_FAST'],
  chargedMoves: ['SHADOW_BALL'],
  eliteFastMoves: [],
  eliteChargedMoves: [],
  family: 'FAMILY_LITWICK',
  evolutions: [],
  shadow: true,
  pokebattlerId: 'CHANDELURE',
  ...over,
});

const species: Readonly<Record<string, PokemonEntry>> = {
  chandelure: entry({}),
  kyogre: entry({ key: 'kyogre', pokemonId: 'KYOGRE', name: 'Kyogre', dex: 382 }),
  'alolan rattata': entry({
    key: 'rattata_alola',
    pokemonId: 'RATTATA',
    form: 'RATTATA_ALOLA',
    kind: 'regional',
    name: 'Alolan Rattata',
  }),
};
const named = (name: string): PokemonEntry | undefined => species[name.toLowerCase()];

describe('unlistedMega', () => {
  it('reads a mega of a known species, as the catalogue would name it', () => {
    expect(unlistedMega('mega chandelure', named)).toEqual({
      key: 'chandelure_mega',
      dex: 609,
      pokemonId: 'CHANDELURE',
      form: null,
      kind: 'mega',
      tempEvolution: 'MEGA',
      class: null,
      name: 'Mega Chandelure',
      types: [],
      stats: { attack: 0, defense: 0, stamina: 0 },
      fastMoves: [],
      chargedMoves: [],
      eliteFastMoves: [],
      eliteChargedMoves: [],
      family: 'FAMILY_LITWICK',
      evolutions: [],
      shadow: false,
      pokebattlerId: 'CHANDELURE_MEGA',
    });
  });

  it('reads the two megas of a species and a primal', () => {
    expect(unlistedMega('Mega Chandelure X', named)).toMatchObject({
      key: 'chandelure_mega_x',
      name: 'Mega Chandelure X',
      tempEvolution: 'MEGA_X',
      pokebattlerId: 'CHANDELURE_MEGA_X',
    });
    expect(unlistedMega('Mega Chandelure Y', named)?.pokebattlerId).toBe('CHANDELURE_MEGA_Y');
    expect(unlistedMega('Primal Kyogre', named)).toMatchObject({
      key: 'kyogre_primal',
      name: 'Primal Kyogre',
      tempEvolution: 'PRIMAL',
      pokebattlerId: 'KYOGRE_PRIMAL',
    });
  });

  it('reads nothing else: a name without the word, an unknown species, a form', () => {
    expect(unlistedMega('Chandelure', named)).toBeUndefined();
    expect(unlistedMega('Mega Newmon', named)).toBeUndefined();
    expect(unlistedMega('Primal Kyogre X', named)).toBeUndefined();
    expect(unlistedMega('Mega Alolan Rattata', named)).toBeUndefined();
    expect(unlistedMega('Mega', named)).toBeUndefined();
  });
});
