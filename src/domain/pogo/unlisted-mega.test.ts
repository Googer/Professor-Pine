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
  'mr. mime': entry({ key: 'mr_mime', pokemonId: 'MR_MIME', name: 'Mr. Mime', dex: 122 }),
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

  // The audit of 2026-11-10 (M5): a run of white space reached the pattern as it was typed, which
  // made it try every split of the run (cubic in its length), and the species was looked up with
  // the run in its name. The name is read with its white space collapsed.
  it('reads a name through runs of white space, as one space each', () => {
    expect(unlistedMega('mega  mr.   mime', named)).toMatchObject({
      key: 'mr_mime_mega',
      name: 'Mega Mr. Mime',
      pokebattlerId: 'MR_MIME_MEGA',
    });
    expect(unlistedMega('  Mega\t\tChandelure \n  Y  ', named)).toMatchObject({
      key: 'chandelure_mega_y',
      name: 'Mega Chandelure Y',
    });
    // A no-break space is white space too.
    const noBreak = String.fromCharCode(0xa0);
    expect(unlistedMega(`primal ${noBreak} kyogre`, named)?.key).toBe('kyogre_primal');
    // A species is still looked up by its whole name: no word of it is dropped.
    expect(unlistedMega('mega mr.   mime   x   y', named)).toBeUndefined();
  });

  it('reads nothing else: a name without the word, an unknown species, a form', () => {
    expect(unlistedMega('Chandelure', named)).toBeUndefined();
    expect(unlistedMega('Mega Newmon', named)).toBeUndefined();
    expect(unlistedMega('Primal Kyogre X', named)).toBeUndefined();
    expect(unlistedMega('Mega Alolan Rattata', named)).toBeUndefined();
    expect(unlistedMega('Mega', named)).toBeUndefined();
  });
});
