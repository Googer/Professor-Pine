import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import type { PokemonEntry } from './game-master.js';
import { POKEMON_TYPES } from './types.js';

const catalogue = catalogueFixture();

describe('a mega the game data does not have', () => {
  it('is read from a name over a species without that mega', () => {
    expect(catalogue.unlistedMega('Mega Chandelure')?.pokebattlerId).toBe('CHANDELURE_MEGA');
  });

  it('is not one the game data has, nor a name that leaves out which of two', () => {
    expect(catalogue.unlistedMega('Mega Blastoise')).toBeUndefined();
    expect(catalogue.unlistedMega('Mega Charizard X')).toBeUndefined();
    expect(catalogue.unlistedMega('Mega Charizard')).toBeUndefined();
    expect(catalogue.unlistedMega('Primal Kyogre')).toBeUndefined();
  });
});

function entry(key: string): PokemonEntry {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`no entry ${key}`);
  return found;
}

describe('PokemonCatalogue: the whole game master', () => {
  it('holds every species once, with forms and megas beside it', () => {
    const species = catalogue.all.filter((p) => p.kind === 'species');
    expect(species.length).toBeGreaterThanOrEqual(1024);
    expect(new Set(species.map((p) => p.dex)).size).toBe(species.length);
    expect(catalogue.all.filter((p) => p.kind === 'mega').length).toBeGreaterThanOrEqual(61);
    expect(catalogue.all.filter((p) => p.kind === 'regional').length).toBeGreaterThanOrEqual(56);
  });

  it('has unique keys and complete data for every entry', () => {
    expect(new Set(catalogue.all.map((p) => p.key)).size).toBe(catalogue.all.length);
    for (const pokemon of catalogue.all) {
      expect(pokemon.types.length, pokemon.key).toBeGreaterThan(0);
      expect(pokemon.stats.attack, pokemon.key).toBeGreaterThan(0);
      expect(pokemon.name, pokemon.key).not.toBe('');
      for (const move of [...pokemon.fastMoves, ...pokemon.chargedMoves]) {
        expect(catalogue.move(move), `${pokemon.key} ${move}`).toBeDefined();
      }
    }
  });

  it('never lists a costume', () => {
    expect(catalogue.all.filter((p) => p.pokemonId === 'PIKACHU').map((p) => p.key)).toEqual([
      'pikachu',
    ]);
  });
});

describe('PokemonCatalogue: costumes', () => {
  it('knows a costume by its game master id, in any case', () => {
    expect(catalogue.isCostume('PIKACHU_PXP_2026')).toBe(true);
    expect(catalogue.isCostume('corsola_spring_2026')).toBe(true);
    expect(catalogue.isCostume('pikachu')).toBe(false);
    expect(catalogue.isCostume('RAIKOU_S')).toBe(false);
    expect(catalogue.isCostume('mewtwo_a')).toBe(false);
    expect(catalogue.isCostume('landorus')).toBe(false);
    expect(catalogue.isCostume('constructor')).toBe(false);
  });

  it('says whether any form of a species has a costume', () => {
    expect(catalogue.hasCostume(25)).toBe(true);
    // Corsola's costume copies Galarian Corsola: the species has a costume all the same.
    expect(catalogue.hasCostume(222)).toBe(true);
    expect(catalogue.hasCostume(243)).toBe(false);
    expect(catalogue.hasCostume(150)).toBe(false);
    expect(catalogue.hasCostume(9999)).toBe(false);
  });
});

describe('PokemonCatalogue: lookups', () => {
  it('finds by key, ignoring case', () => {
    expect(entry('rattata_alola').name).toBe('Alolan Rattata');
    expect(catalogue.byKey('RATTATA_ALOLA')).toBe(entry('rattata_alola'));
    expect(catalogue.byKey('missingno')).toBeUndefined();
  });

  it('resolves an alias to the entry it stands for', () => {
    expect(catalogue.byKey('landorus')).toBe(entry('landorus_incarnate'));
    expect(catalogue.byKey('LANDORUS')?.key).toBe('landorus_incarnate');
    expect(catalogue.byKey('pikachu_adventure_hat_2020')?.key).toBe('pikachu');
    expect(catalogue.byKey('corsola_spring_2026')?.key).toBe('corsola_galarian');
    expect(catalogue.byKey('zacian')?.key).toBe('zacian_hero');
    expect(catalogue.all.some((p) => p.key === 'landorus')).toBe(false);
    // Names every object has must not be mistaken for aliases.
    expect(catalogue.byKey('constructor')).toBeUndefined();
    expect(catalogue.byKey('__proto__')).toBeUndefined();
  });

  it('knows a species with a named default form by that form', () => {
    expect(catalogue.species(645)?.key).toBe('landorus_incarnate');
    expect(catalogue.byDex(645).map((p) => p.key)).toEqual([
      'landorus_incarnate',
      'landorus_therian',
    ]);
    expect(entry('zacian_hero')).toMatchObject({ kind: 'species', types: ['fairy'] });
    expect(entry('zamazenta_hero').kind).toBe('species');
    expect(entry('meloetta_aria').kind).toBe('species');
    expect(entry('wormadam_plant').kind).toBe('species');
    // Forms that are all alike leave the bare species in place.
    expect(entry('vivillon')).toMatchObject({ kind: 'species', form: null });
    expect(entry('keldeo')).toMatchObject({ kind: 'species', form: null });
  });

  it('knows exactly these species by a default form', () => {
    // A change here changes Pokémon keys; check LEGACY_NAME_ALIASES and bump GAME_DATA_VERSION if
    // the rule changed.
    const keys = catalogue.all
      .filter((p) => p.kind === 'species' && p.form !== null)
      .map((p) => p.key)
      .sort();
    expect(keys).toEqual([
      'aegislash_shield',
      'cherrim_overcast',
      'darmanitan_standard',
      'eiscue_ice',
      'enamorus_incarnate',
      'giratina_altered',
      'gourgeist_small',
      'hoopa_confined',
      'indeedee_male',
      'koraidon_apex',
      'landorus_incarnate',
      'lycanroc_midday',
      'meloetta_aria',
      'miraidon_ultimate',
      'morpeko_full_belly',
      'oricorio_baile',
      'palafin_zero',
      'pumpkaboo_small',
      'shaymin_land',
      'thundurus_incarnate',
      'tornadus_incarnate',
      'wishiwashi_solo',
      'wormadam_plant',
      'zacian_hero',
      'zamazenta_hero',
    ]);
  });

  it('finds the species and all entries for a Pokédex number', () => {
    expect(catalogue.species(150)?.key).toBe('mewtwo');
    expect(catalogue.byDex(150).map((p) => p.key)).toEqual([
      'mewtwo',
      'mewtwo_a',
      'mewtwo_mega_x',
      'mewtwo_mega_y',
    ]);
    expect(catalogue.species(0)).toBeUndefined();
    expect(catalogue.byDex(99999)).toEqual([]);
  });

  it('finds by game-master ids', () => {
    expect(catalogue.byGameMasterId('YVELTAL')?.key).toBe('yveltal');
    expect(catalogue.byGameMasterId('LANDORUS', 'LANDORUS_INCARNATE')?.key).toBe(
      'landorus_incarnate',
    );
    expect(catalogue.byGameMasterId('BLASTOISE', null, 'MEGA')?.key).toBe('blastoise_mega');
    expect(catalogue.byGameMasterId('NIDORAN_FEMALE')?.dex).toBe(29);
    // The raid feed sends a mega as a form string, with no temporary evolution.
    expect(catalogue.byGameMasterId('BLASTOISE', 'BLASTOISE_MEGA')?.key).toBe('blastoise_mega');
    // `<SPECIES>_NORMAL` means the species itself.
    expect(catalogue.byGameMasterId('MEWTWO', 'MEWTWO_NORMAL')?.key).toBe('mewtwo');
    expect(catalogue.byGameMasterId('NIDORAN_FEMALE', 'NIDORAN_NORMAL')?.dex).toBe(29);
    // A species known by its default form, with or without the form id.
    expect(catalogue.byGameMasterId('LANDORUS')?.key).toBe('landorus_incarnate');
    expect(catalogue.byGameMasterId('GIRATINA', 'GIRATINA_ALTERED')?.key).toBe('giratina_altered');
    // A costume or an appearance-only form gives the entry it copies.
    expect(catalogue.byGameMasterId('PIKACHU', 'PIKACHU_ADVENTURE_HAT_2020')?.key).toBe('pikachu');
    expect(catalogue.byGameMasterId('CORSOLA', 'CORSOLA_SPRING_2026')?.key).toBe(
      'corsola_galarian',
    );
    expect(catalogue.byGameMasterId('LATIAS', 'LATIAS_S')?.key).toBe('latias');
    // A costume newer than the game master.
    expect(catalogue.byGameMasterId('PIKACHU', 'PIKACHU_GLASS_HELMET_2026')).toBeUndefined();
    // A form id that belongs to another species.
    expect(catalogue.byGameMasterId('PIKACHU', 'RATTATA_ALOLA')).toBeUndefined();
    expect(catalogue.byGameMasterId('PIKACHU', 'CORSOLA_SPRING_2026')).toBeUndefined();
  });

  it('finds moves', () => {
    expect(catalogue.move('FRENZY_PLANT')?.name).toBe('Frenzy Plant');
    expect(catalogue.move('NOPE')).toBeUndefined();
  });
});

describe('PokemonCatalogue: what a raid gives you (values from Bulbapedia, "Raid Battle (GO)")', () => {
  it('gives a shadow raid catch a lower minimum CP', () => {
    expect(catalogue.raidCatchCp(entry('latios'), true)).toEqual({
      min: 2021,
      max: 2178,
      minBoosted: 2526,
      maxBoosted: 2723,
    });
    expect(catalogue.raidCatchCp(entry('drowzee'), true)).toEqual({
      min: 512,
      max: 594,
      minBoosted: 640,
      maxBoosted: 743,
    });
    expect(catalogue.raidCatchCp(entry('latios')).min).toBe(2090);
  });

  it('gives a max battle’s catch the plain raid range, never boosted (plan 8F-1)', () => {
    const plainRaid = catalogue.raidCatchCp(entry('latios'));
    expect(catalogue.maxCatchCp(entry('latios'))).toEqual({
      min: plainRaid.min,
      max: plainRaid.max,
    });
    // A fused form is caught as its base species, as from a raid.
    expect(catalogue.maxCatchCp(entry('kyurem_white'))).toEqual(
      catalogue.maxCatchCp(entry('kyurem')),
    );
    // Eternamax Eternatus is fought; plain Eternatus is caught.
    expect(catalogue.maxCatchCp(entry('eternatus_eternamax'))).toEqual(
      catalogue.maxCatchCp(entry('eternatus')),
    );
    expect(catalogue.maxCatchCp(entry('eternatus')).max).toBeLessThan(3_000);
  });

  it('answers for the base Pokémon of a fused form', () => {
    for (const [fused, base] of [
      ['kyurem_white', 'kyurem'],
      ['kyurem_black', 'kyurem'],
      ['necrozma_dusk_mane', 'necrozma'],
      ['necrozma_dawn_wings', 'necrozma'],
      ['calyrex_ice_rider', 'calyrex'],
      ['calyrex_shadow_rider', 'calyrex'],
    ] as const) {
      expect(catalogue.raidCatchCp(entry(fused)), fused).toEqual(
        catalogue.raidCatchCp(entry(base)),
      );
      expect(catalogue.boostedIn(entry(fused)), fused).toEqual(catalogue.boostedIn(entry(base)));
    }
    expect(catalogue.raidCatchCp(entry('kyurem_white')).min).toBe(1957);
    // The boss itself is still judged by its own types.
    expect(catalogue.weaknesses(entry('necrozma_dusk_mane')).map((w) => w.type)).not.toEqual(
      catalogue.weaknesses(entry('necrozma')).map((w) => w.type),
    );
    // A form that is not fused or crowned is caught as itself.
    expect(catalogue.raidCatchCp(entry('giratina_origin'))).not.toEqual(
      catalogue.raidCatchCp(entry('giratina_altered')),
    );
  });

  it('answers for the Hero of Many Battles form of a crowned boss (Matt, 2026-11-09)', () => {
    // Zacian and Zamazenta Hero share their stats: 2100–2188, 2625–2735 boosted.
    const hero = { min: 2100, max: 2188, minBoosted: 2625, maxBoosted: 2735 };
    for (const [crowned, base] of [
      ['zacian_crowned_sword', 'zacian_hero'],
      ['zamazenta_crowned_shield', 'zamazenta_hero'],
    ] as const) {
      expect(catalogue.raidCatchCp(entry(crowned)), crowned).toEqual(hero);
      expect(catalogue.raidCatchCp(entry(base)), base).toEqual(hero);
      expect(catalogue.maxCatchCp(entry(crowned)), crowned).toEqual({ min: 2100, max: 2188 });
      // The Hero forms are of one type; the crowned bosses add Steel, which a catch is not
      // boosted by.
      expect(catalogue.boostedIn(entry(crowned)), crowned).toEqual(
        catalogue.boostedIn(entry(base)),
      );
    }
    // The boss itself is still judged by its own types.
    expect(catalogue.weaknesses(entry('zacian_crowned_sword')).map((w) => w.type)).not.toEqual(
      catalogue.weaknesses(entry('zacian_hero')).map((w) => w.type),
    );
  });
});

describe('PokemonCatalogue: aliases', () => {
  it('lists the other ids that stand for an entry', () => {
    expect(catalogue.aliasesOf('giratina_altered')).toEqual(['giratina']);
    expect(catalogue.aliasesOf('pikachu')).toContain('pikachu_copy_2019');
    expect(catalogue.aliasesOf('giratina_origin')).toEqual([]);
    expect(catalogue.aliasesOf('no_such_pokemon')).toEqual([]);
    for (const alias of catalogue.aliasesOf('pikachu')) {
      expect(catalogue.byKey(alias)?.key, alias).toBe('pikachu');
    }
  });
});

describe('PokemonCatalogue: types and weather', () => {
  it('multiplies effectiveness over both types', () => {
    expect(catalogue.effectiveness('ice', ['dragon', 'flying'])).toBeCloseTo(2.56, 10);
    expect(catalogue.effectiveness('ground', ['electric', 'flying'])).toBeCloseTo(0.625, 10);
    expect(catalogue.effectiveness('normal', [])).toBe(1);
  });

  it('lists weaknesses strongest first, ties in type order', () => {
    expect(catalogue.weaknesses(entry('dragonite')).map((w) => w.type)).toEqual([
      'ice',
      'rock',
      'dragon',
      'fairy',
    ]);
    expect(catalogue.weaknesses(entry('dragonite'))[0]?.multiplier).toBeCloseTo(2.56, 10);
  });

  it('uses the types of the mega, not of the species', () => {
    expect(catalogue.weaknesses(entry('charizard')).map((w) => w.type)).toEqual([
      'rock',
      'water',
      'electric',
    ]);
    expect(catalogue.weaknesses(entry('charizard_mega_x')).map((w) => w.type)).toEqual([
      'ground',
      'rock',
      'dragon',
    ]);
  });

  it('gives every type at least one weakness and no multiplier of 1 or less', () => {
    const template = entry('mewtwo');
    for (const type of POKEMON_TYPES) {
      const weaknesses = catalogue.weaknesses({ ...template, types: [type] });
      expect(weaknesses.length, type).toBeGreaterThan(0);
      expect(
        weaknesses.every((w) => w.multiplier > 1),
        type,
      ).toBe(true);
    }
  });

  it('lists the weather that boosts a Pokémon', () => {
    expect(catalogue.boostedIn(entry('venusaur'))).toEqual(['clear', 'overcast']);
    expect(catalogue.boostedIn(entry('mewtwo'))).toEqual(['windy']);
  });

  it('answers boostedIn for the Pokémon caught from a mega raid', () => {
    expect(catalogue.boostedIn(entry('gyarados_mega'))).toEqual(
      catalogue.boostedIn(entry('gyarados')),
    );
    expect(catalogue.boostedIn(entry('gyarados_mega'))).toEqual(['rainy', 'windy']);
  });
});

describe('PokemonCatalogue: CP', () => {
  it('exposes multipliers and raid catch ranges', () => {
    expect(catalogue.cpMultiplier(20)).toBe(0.5974);
    expect(catalogue.raidCatchCp(entry('mewtwo'))).toEqual({
      min: 2294,
      max: 2387,
      minBoosted: 2868,
      maxBoosted: 2984,
    });
  });

  it('gives the catch range of the species for a mega', () => {
    expect(catalogue.raidCatchCp(entry('charizard_mega_x'))).toEqual(
      catalogue.raidCatchCp(entry('charizard')),
    );
    expect(catalogue.raidCatchCp(entry('charizard_mega_x'))).toEqual({
      min: 1574,
      max: 1651,
      minBoosted: 1968,
      maxBoosted: 2064,
    });
  });
});

describe('PokemonCatalogue: evolution lines', () => {
  const keysOf = (key: string): string[] =>
    catalogue.evolutionLine(entry(key)).map((one) => one.key);

  it('is the first stage and what it evolves into, on and on, each followed by its megas', () => {
    expect(keysOf('bulbasaur')).toEqual(['bulbasaur', 'ivysaur', 'venusaur', 'venusaur_mega']);
    expect(keysOf('ralts')).toEqual([
      'ralts',
      'kirlia',
      'gallade',
      'gallade_mega',
      'gardevoir',
      'gardevoir_mega',
    ]);
  });

  it('starts from what the Pokémon evolved from, whichever stage is asked', () => {
    expect(keysOf('malamar')).toEqual(['inkay', 'malamar', 'malamar_mega']);
    expect(keysOf('ivysaur')).toEqual(['bulbasaur', 'ivysaur', 'venusaur', 'venusaur_mega']);
    expect(keysOf('raichu')).toEqual([
      'pichu',
      'pikachu',
      'raichu',
      'raichu_mega_x',
      'raichu_mega_y',
    ]);
  });

  it('is the same line when a mega is asked', () => {
    expect(keysOf('malamar_mega')).toEqual(['inkay', 'malamar', 'malamar_mega']);
    expect(keysOf('mewtwo_mega_x')).toEqual(['mewtwo', 'mewtwo_mega_x', 'mewtwo_mega_y']);
  });

  it('follows a regional form, not the whole family', () => {
    expect(keysOf('meowth_galarian')).toEqual(['meowth_galarian', 'perrserker']);
    expect(keysOf('perrserker')).toEqual(['meowth_galarian', 'perrserker']);
    expect(keysOf('persian')).toEqual(['meowth', 'persian']);
    expect(keysOf('slowbro_galarian')).toEqual([
      'slowpoke_galarian',
      'slowbro_galarian',
      'slowking_galarian',
    ]);
  });

  it('is the Pokémon alone when nothing evolves into it or from it', () => {
    expect(keysOf('tauros')).toEqual(['tauros']);
  });

  it('gives every branch of a Pokémon that evolves in several ways', () => {
    expect(keysOf('eevee')).toHaveLength(9);
  });

  it('folds a form that only changes the look into its species, as parent and as child', () => {
    // Burmy's cloaks are Burmy; the three Wormadam differ in type (Sandy) or stats (Trash).
    const burmy = ['burmy', 'wormadam_plant', 'mothim', 'wormadam_sandy', 'wormadam_trash'];
    expect(keysOf('burmy')).toEqual(burmy);
    expect(keysOf('burmy_sandy')).toEqual(burmy);
    expect(keysOf('wormadam_trash')).toEqual(burmy);
    expect(keysOf('gastrodon_east_sea')).toEqual(['shellos', 'gastrodon']);
    expect(keysOf('shellos_west_sea')).toEqual(['shellos', 'gastrodon']);
    expect(keysOf('deerling_winter')).toEqual(['deerling', 'sawsbuck']);
    expect(keysOf('scatterbug_polar')).toEqual(['scatterbug', 'spewpa', 'vivillon']);
  });

  it('gives every member of a family the same family, of at most 25', () => {
    for (const one of catalogue.all) {
      const family = keysOf(one.key);
      expect(family.length, one.key).toBeLessThanOrEqual(25);
      for (const member of family) expect(keysOf(member), `${one.key} ${member}`).toEqual(family);
    }
  });

  it('says which member of its family stands for a Pokémon', () => {
    expect(catalogue.familyMember(entry('burmy_sandy')).key).toBe('burmy');
    expect(catalogue.familyMember(entry('wormadam_sandy')).key).toBe('wormadam_sandy');
    expect(catalogue.familyMember(entry('malamar_mega')).key).toBe('malamar_mega');
  });
});

describe('PokemonCatalogue: trading', () => {
  it('says what the game lets be traded', () => {
    for (const key of ['mew', 'zarude', 'diancie', 'diancie_mega', 'eternatus', 'kyurem_black']) {
      expect(catalogue.isTradable(entry(key)), key).toBe(false);
    }
    for (const key of ['meltan', 'melmetal', 'pecharunt', 'mewtwo', 'kyurem', 'pikachu']) {
      expect(catalogue.isTradable(entry(key)), key).toBe(true);
    }
  });
});

describe('PokemonCatalogue: Super Megas', () => {
  it('says how many levels a Super Mega adds: 2 for the megas that have one, else none', () => {
    expect(catalogue.superMegaLevels(entry('malamar_mega'))).toBe(2);
    expect(catalogue.superMegaLevels(entry('mewtwo_mega_y'))).toBe(2);
    expect(catalogue.superMegaLevels(entry('venusaur_mega'))).toBe(0);
    expect(catalogue.superMegaLevels(entry('kyogre_primal'))).toBe(0);
    expect(catalogue.superMegaLevels(entry('malamar'))).toBe(0);
  });
});

describe('PokemonCatalogue: max battles (plan 8X-2)', () => {
  it('says which Pokémon can be Dynamax and which Gigantamax bosses', () => {
    expect(catalogue.canDynamax(entry('sneasel'))).toBe(true);
    expect(catalogue.canGigantamax(entry('sneasel'))).toBe(false);
    expect(catalogue.canDynamax(entry('machamp'))).toBe(true);
    expect(catalogue.canGigantamax(entry('machamp'))).toBe(true);
    expect(catalogue.canDynamax(entry('sneasel_hisuian'))).toBe(false);
    expect(catalogue.canDynamax(entry('venusaur_mega'))).toBe(false);
  });

  it('lists them as entries, in catalogue order', () => {
    const gigantamax = catalogue.gigantamaxEntries().map((one) => one.key);
    expect(gigantamax).toEqual(expect.arrayContaining(['machamp', 'urshifu_rapid_strike']));
    expect(gigantamax).not.toContain('sneasel');
    const dex = catalogue.dynamaxEntries().map((one) => one.dex);
    expect([...dex].sort((a, b) => a - b)).toEqual(dex);
  });
});
