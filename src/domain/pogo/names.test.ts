import { describe, expect, it } from 'vitest';
import { displayName, speciesName, titleCase, type NameInput } from './names.js';

const texts = new Map([
  ['pokemon_name_0019', 'Rattata'],
  ['pokemon_name_0006', 'Charizard'],
  ['pokemon_name_0006_0002', 'Mega Charizard X'],
  ['pokemon_name_0128', 'Tauros'],
  ['pokemon_name_0150', 'Mewtwo'],
  ['pokemon_name_0201', 'Unown'],
  ['pokemon_name_0479', 'Rotom'],
  ['pokemon_name_0487', 'Giratina'],
  ['pokemon_name_0646', 'Kyurem'],
  ['pokemon_name_0669', 'Flabébé'],
  ['pokemon_name_0774', 'Minior'],
  ['pokemon_name_0931', 'Squawkabilly'],
  ['form_giratina_origin', 'Origin Forme'],
  ['form_rotom_wash', 'Wash Rotom'],
  ['form_paldea_blaze', 'Blaze Breed'],
  ['form_core_blue', 'Blue Core'],
  ['form_squakabilly_white', 'White Plumage'],
  ['form_white', 'White Kyurem'],
  ['form_red', 'Red Flower'],
  ['form_kyurem_white', 'White Kyurem'],
]);

function name(input: Partial<NameInput> & Pick<NameInput, 'pokemonId' | 'dex'>): string {
  return displayName({
    species: speciesName(input.pokemonId, input.dex, texts),
    kind: 'species',
    suffix: null,
    form: null,
    tempEvolution: null,
    texts,
    ...input,
  });
}

describe('speciesName', () => {
  it('uses the text file', () => {
    expect(speciesName('RATTATA', 19, texts)).toBe('Rattata');
  });

  it('falls back for species the text file does not name yet', () => {
    expect(speciesName('WALKINGWAKE', 1009, texts)).toBe('Walking Wake');
    expect(speciesName('DIPPLIN', 1011, texts)).toBe('Dipplin');
    expect(speciesName('MR_MIME', 122, texts)).toBe('Mr Mime');
  });
});

describe('displayName', () => {
  it('names a species', () => {
    expect(name({ pokemonId: 'RATTATA', dex: 19 })).toBe('Rattata');
  });

  it('puts the region first for regional forms', () => {
    expect(
      name({
        pokemonId: 'RATTATA',
        dex: 19,
        kind: 'regional',
        suffix: 'ALOLA',
        form: 'RATTATA_ALOLA',
      }),
    ).toBe('Alolan Rattata');
  });

  it('adds the rest of a regional form in brackets', () => {
    expect(
      name({
        pokemonId: 'TAUROS',
        dex: 128,
        kind: 'regional',
        suffix: 'PALDEA_BLAZE',
        form: 'TAUROS_PALDEA_BLAZE',
      }),
    ).toBe('Paldean Tauros (Blaze Breed)');
  });

  it('describes a form in brackets', () => {
    expect(
      name({
        pokemonId: 'GIRATINA',
        dex: 487,
        kind: 'form',
        suffix: 'ORIGIN',
        form: 'GIRATINA_ORIGIN',
      }),
    ).toBe('Giratina (Origin Forme)');
  });

  it('uses the form text alone when it already names the species', () => {
    expect(
      name({ pokemonId: 'ROTOM', dex: 479, kind: 'form', suffix: 'WASH', form: 'ROTOM_WASH' }),
    ).toBe('Wash Rotom');
    expect(
      name({ pokemonId: 'KYUREM', dex: 646, kind: 'form', suffix: 'WHITE', form: 'KYUREM_WHITE' }),
    ).toBe('White Kyurem');
  });

  it('finds form texts filed under another key', () => {
    expect(
      name({ pokemonId: 'MINIOR', dex: 774, kind: 'form', suffix: 'BLUE', form: 'MINIOR_BLUE' }),
    ).toBe('Minior (Blue Core)');
    // The game master says WHITE, the text file's key is misspelt: form_squakabilly_white.
    expect(
      name({
        pokemonId: 'SQUAWKABILLY',
        dex: 931,
        kind: 'form',
        suffix: 'WHITE',
        form: 'SQUAWKABILLY_WHITE',
      }),
    ).toBe('Squawkabilly (White Plumage)');
  });

  it('does not borrow a text that belongs to one species only', () => {
    // form_white is "White Kyurem" and must not be borrowed by another species.
    expect(
      name({
        pokemonId: 'FLABEBE',
        dex: 669,
        kind: 'form',
        suffix: 'WHITE',
        form: 'FLABEBE_WHITE',
      }),
    ).toBe('Flabébé (White)');
    // A generic text that is not species-only is still used.
    expect(
      name({ pokemonId: 'FLABEBE', dex: 669, kind: 'form', suffix: 'RED', form: 'FLABEBE_RED' }),
    ).toBe('Flabébé (Red Flower)');
  });

  it('falls back to the form id when there is no text', () => {
    expect(name({ pokemonId: 'UNOWN', dex: 201, kind: 'form', suffix: 'A', form: 'UNOWN_A' })).toBe(
      'Unown (A)',
    );
  });

  it('has fixed names where the text file has nothing usable', () => {
    expect(
      name({ pokemonId: 'MEWTWO', dex: 150, kind: 'form', suffix: 'A', form: 'MEWTWO_A' }),
    ).toBe('Armored Mewtwo');
    expect(
      name({
        pokemonId: 'UNOWN',
        dex: 201,
        kind: 'form',
        suffix: 'QUESTION_MARK',
        form: 'UNOWN_QUESTION_MARK',
      }),
    ).toBe('Unown (?)');
  });

  it('tells the Power Construct Zygarde forms from the other 10% and 50% ones', () => {
    for (const [suffix, expected] of [
      ['COMPLETE_TEN_PERCENT', 'Zygarde (10% Forme, Power Construct)'],
      ['COMPLETE_FIFTY_PERCENT', 'Zygarde (50% Forme, Power Construct)'],
    ] as const) {
      expect(
        name({
          pokemonId: 'ZYGARDE',
          dex: 718,
          kind: 'form',
          suffix,
          form: `ZYGARDE_${suffix}`,
        }),
      ).toBe(expected);
    }
  });

  it('names megas from the text file, or by rule when it has none', () => {
    expect(name({ pokemonId: 'CHARIZARD', dex: 6, kind: 'mega', tempEvolution: 'MEGA_X' })).toBe(
      'Mega Charizard X',
    );
    expect(name({ pokemonId: 'CHARIZARD', dex: 6, kind: 'mega', tempEvolution: 'MEGA_Y' })).toBe(
      'Mega Charizard Y',
    );
    expect(name({ pokemonId: 'RATTATA', dex: 19, kind: 'mega', tempEvolution: 'MEGA' })).toBe(
      'Mega Rattata',
    );
    expect(name({ pokemonId: 'RATTATA', dex: 19, kind: 'mega', tempEvolution: 'PRIMAL' })).toBe(
      'Primal Rattata',
    );
  });
});

describe('titleCase', () => {
  it('turns an id into words', () => {
    expect(titleCase('RAPID_STRIKE')).toBe('Rapid Strike');
    expect(titleCase('00')).toBe('00');
  });
});
