import { describe, expect, it } from 'vitest';
import {
  gameDataFixture,
  readEnglishSample,
  readGameMasterSample,
} from '../../../test/support/game-data.js';
import {
  GAME_DATA_VERSION,
  parseGameMaster,
  type GameData,
  type PokemonEntry,
} from './game-master.js';
import { parseTextFile } from './text.js';

const texts = parseTextFile(readEnglishSample());
const data = parseGameMaster(readGameMasterSample(), texts);
const byKey = new Map(data.pokemon.map((entry) => [entry.key, entry]));

function entry(key: string): PokemonEntry {
  const found = byKey.get(key);
  if (!found) throw new Error(`no entry ${key}`);
  return found;
}

describe('parseGameMaster: Pokémon', () => {
  it('builds a species entry with types, stats, moves and family', () => {
    expect(entry('venusaur')).toEqual({
      key: 'venusaur',
      dex: 3,
      pokemonId: 'VENUSAUR',
      form: null,
      kind: 'species',
      tempEvolution: null,
      class: null,
      name: 'Venusaur',
      types: ['grass', 'poison'],
      stats: { attack: 198, defense: 189, stamina: 190 },
      fastMoves: ['RAZOR_LEAF_FAST', 'VINE_WHIP_FAST'],
      chargedMoves: ['SLUDGE_BOMB', 'PETAL_BLIZZARD', 'SOLAR_BEAM', 'SLUDGE'],
      eliteFastMoves: [],
      eliteChargedMoves: ['FRENZY_PLANT'],
      family: 'BULBASAUR',
      evolutions: [],
      shadow: true,
      pokebattlerId: 'VENUSAUR',
    });
  });

  it('gives every entry a unique key', () => {
    expect(new Set(data.pokemon.map((p) => p.key)).size).toBe(data.pokemon.length);
  });

  it('keeps the two Nidoran species apart although they share a form id', () => {
    expect(entry('nidoran_female').dex).toBe(29);
    expect(entry('nidoran_male').dex).toBe(32);
    expect(byKey.has('nidoran_normal')).toBe(false);
  });

  it('takes the species data from the NORMAL form where the two differ', () => {
    // The formless Dugtrio entry has defense 134; the form that appears in game has 136.
    expect(entry('dugtrio').stats).toEqual({ attack: 167, defense: 136, stamina: 111 });
    expect(entry('deoxys').chargedMoves).toContain('THUNDERBOLT');
  });

  it('does not list NORMAL forms, costumes or cosmetic forms separately', () => {
    for (const key of [
      'venusaur_normal',
      'venusaur_copy_2019',
      'pikachu_flying_01',
      'pikachu_normal',
      'latias_s',
    ]) {
      expect(byKey.has(key), key).toBe(false);
    }
    expect(data.pokemon.filter((p) => p.pokemonId === 'PIKACHU').map((p) => p.key)).toEqual([
      'pikachu',
    ]);
  });

  it('keeps a costume that has its own stats as a real form', () => {
    expect(entry('mewtwo_a')).toMatchObject({
      name: 'Armored Mewtwo',
      kind: 'form',
      form: 'MEWTWO_A',
      stats: { attack: 182, defense: 278, stamina: 214 },
      pokebattlerId: 'MEWTWO_A_FORM',
    });
  });

  it('lists regional and other forms with their own data', () => {
    expect(entry('rattata_alola')).toMatchObject({
      name: 'Alolan Rattata',
      kind: 'regional',
      types: ['dark', 'normal'],
      pokebattlerId: 'RATTATA_ALOLA_FORM',
    });
    expect(entry('tauros_paldea_blaze').name).toBe('Paldean Tauros (Blaze Breed)');
    expect(entry('giratina_origin')).toMatchObject({
      name: 'Giratina (Origin Forme)',
      kind: 'form',
      stats: { attack: 225, defense: 187, stamina: 284 },
    });
    expect(entry('unown_question_mark').name).toBe('Unown (?)');
  });

  it('knows a species with a named default form by that form alone', () => {
    expect(byKey.has('giratina')).toBe(false);
    expect(entry('giratina_altered')).toMatchObject({
      dex: 487,
      pokemonId: 'GIRATINA',
      form: 'GIRATINA_ALTERED',
      kind: 'species',
      name: 'Giratina (Altered Forme)',
      stats: { attack: 187, defense: 225, stamina: 284 },
      shadow: true,
      pokebattlerId: 'GIRATINA_ALTERED_FORM',
    });
    expect(data.aliases['giratina']).toBe('giratina_altered');
    expect(
      data.pokemon.filter((p) => p.pokemonId === 'GIRATINA').map((p) => [p.key, p.kind]),
    ).toEqual([
      ['giratina_altered', 'species'],
      ['giratina_origin', 'form'],
    ]);
    // The regional forms of such a species are unaffected.
    expect(byKey.has('darmanitan')).toBe(false);
    expect(entry('darmanitan_standard').kind).toBe('species');
    expect(entry('darmanitan_galarian_standard').kind).toBe('regional');
  });

  it('keeps the bare species when it has a NORMAL form or its forms are all alike', () => {
    expect(entry('deoxys')).toMatchObject({ kind: 'species', form: null });
    expect(entry('unown')).toMatchObject({ kind: 'species', form: null, name: 'Unown' });
    expect(entry('unown_a').kind).toBe('form');
    expect(data.aliases['deoxys']).toBeUndefined();
    expect(data.aliases['unown']).toBeUndefined();
  });

  it('has exactly one entry standing for each species', () => {
    const standing = data.pokemon.filter((p) => p.kind === 'species');
    expect(new Set(standing.map((p) => p.pokemonId)).size).toBe(standing.length);
    expect(standing.length).toBe(new Set(data.pokemon.map((p) => p.pokemonId)).size);
  });

  it('lists costumes and appearance-only forms as aliases of the entry they copy', () => {
    expect(data.aliases).toMatchObject({
      pikachu_adventure_hat_2020: 'pikachu',
      venusaur_copy_2019: 'venusaur',
      latias_s: 'latias',
    });
    // NORMAL form ids are not aliases, and neither is anything that is an entry.
    for (const id of ['venusaur_normal', 'nidoran_normal', 'mewtwo_a', 'venusaur', 'missingno']) {
      expect(data.aliases[id], id).toBeUndefined();
    }
    for (const [id, key] of Object.entries(data.aliases)) {
      expect(id, id).toBe(id.toLowerCase());
      expect(byKey.has(id), id).toBe(false);
      expect(byKey.has(key), id).toBe(true);
    }
    expect(Object.keys(data.aliases)).toEqual(Object.keys(data.aliases).sort());
  });

  it('lists temporary evolutions with their own stats and types', () => {
    expect(entry('charizard_mega_x')).toMatchObject({
      name: 'Mega Charizard X',
      kind: 'mega',
      form: null,
      tempEvolution: 'MEGA_X',
      types: ['fire', 'dragon'],
      stats: { attack: 273, defense: 213, stamina: 186 },
      pokebattlerId: 'CHARIZARD_MEGA_X',
    });
    expect(entry('kyogre_primal')).toMatchObject({
      name: 'Primal Kyogre',
      tempEvolution: 'PRIMAL',
    });
    expect(entry('venusaur_mega').fastMoves).toEqual(entry('venusaur').fastMoves);
    expect(byKey.has('mewtwo_mega_x')).toBe(true);
    expect(byKey.has('mewtwo_mega_y')).toBe(true);
  });

  it('resolves a move referenced by number', () => {
    expect(entry('zeraora').chargedMoves).toContain('PLASMA_FISTS');
  });

  it('copes with a species that has no moves and one with no English name yet', () => {
    expect(entry('smeargle')).toMatchObject({ fastMoves: [], chargedMoves: [] });
    expect(entry('walkingwake').name).toBe('Walking Wake');
  });

  it('marks which Pokémon can be shadow', () => {
    expect(entry('venusaur').shadow).toBe(true);
    expect(entry('smeargle').shadow).toBe(false);
  });

  it('sorts by Pokédex number, then key', () => {
    const order = data.pokemon.map((p) => `${String(p.dex).padStart(4, '0')} ${p.key}`);
    expect(order).toEqual([...order].sort());
  });
});

describe('parseGameMaster: moves, types, weather, CP', () => {
  it('parses moves and tells fast from charged', () => {
    const moves = new Map(data.moves.map((move) => [move.id, move]));
    expect(moves.get('VINE_WHIP_FAST')).toEqual({
      id: 'VINE_WHIP_FAST',
      number: 214,
      name: 'Vine Whip',
      type: 'grass',
      fast: true,
      power: 6,
      energyDelta: 5,
      durationMs: 500,
    });
    expect(moves.get('FRENZY_PLANT')).toMatchObject({ name: 'Frenzy Plant', fast: false });
    // No English name in the text file: the id is turned into words.
    expect(moves.get('PLASMA_FISTS')?.name).toBe('Plasma Fists');
  });

  it('reads the type chart with defenders in the fixed order', () => {
    expect(data.typeChart.water.fire).toBe(1.6);
    expect(data.typeChart.fire.water).toBe(0.625);
    expect(data.typeChart.electric.ground).toBe(0.390625);
    expect(data.typeChart.normal.ghost).toBe(0.390625);
    expect(data.typeChart.dragon.fairy).toBe(0.390625);
    expect(data.typeChart.fairy.dragon).toBe(1.6);
    expect(data.typeChart.normal.normal).toBe(1);
  });

  it('reads the weather boosts', () => {
    expect(data.weatherBoosts.clear).toEqual(['grass', 'ground', 'fire']);
    expect(data.weatherBoosts.fog).toEqual(['dark', 'ghost']);
    expect(Object.keys(data.weatherBoosts)).toHaveLength(7);
  });

  it('reads the CP multipliers by level', () => {
    expect(data.cpMultipliers[0]).toBe(0.094);
    expect(data.cpMultipliers[19]).toBe(0.5974);
    expect(data.cpMultipliers.length).toBeGreaterThanOrEqual(50);
  });

  it('warns when the CP multipliers stop below level 51, which the PvP ranks need', () => {
    const items = sampleItems();
    const level = items.find((one) => 'playerLevel' in one.data)?.data['playerLevel'] as Rec;
    level['cpMultiplier'] = (level['cpMultiplier'] as number[]).slice(0, 50);
    const { data: parsed, warnings } = parseWithWarnings(items);
    expect(parsed.cpMultipliers).toHaveLength(50);
    expect(warnings).toEqual([
      'The game master lists CP multipliers up to level 50 only: PvP ranks need level 51',
    ]);
  });
});

describe('parseGameMaster: bad input', () => {
  it('rejects input with no Pokémon', () => {
    expect(() => parseGameMaster([], texts)).toThrow(/no Pokémon/);
    expect(() => parseGameMaster({ error: 'rate limited' }, texts)).toThrow(/no Pokémon/);
  });

  it('rejects a game master without the type chart', () => {
    const items = (readGameMasterSample() as Array<{ data: Record<string, unknown> }>).filter(
      (item) => !('typeEffective' in item.data),
    );
    expect(() => parseGameMaster(items, texts)).toThrow(/type effectiveness/);
  });

  it('skips items it does not understand', () => {
    const items = [
      ...(readGameMasterSample() as unknown[]),
      null,
      'text',
      { templateId: 'V9999_POKEMON_BROKEN', data: { pokemonSettings: {} } },
      { templateId: 'NOT_A_POKEMON', data: { pokemonSettings: { pokemonId: 'X' } } },
    ];
    expect(parseGameMaster(items, texts).pokemon).toHaveLength(data.pokemon.length);
  });

  it('skips an item whose form is not a string, with a warning', () => {
    const items = sampleItems();
    items.unshift({
      templateId: 'V0487_POKEMON_GIRATINA_ODD',
      data: {
        pokemonSettings: {
          pokemonId: 'GIRATINA',
          form: 2592,
          type: 'POKEMON_TYPE_NORMAL',
          stats: { baseAttack: 1, baseDefense: 2, baseStamina: 3 },
        },
      },
    });
    const { data: parsed, warnings } = parseWithWarnings(items);
    expect(parsed.pokemon.find((p) => p.key === 'giratina_altered')?.stats).toEqual(
      entry('giratina_altered').stats,
    );
    expect(parsed.pokemon).toHaveLength(data.pokemon.length);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('GIRATINA');
  });

  it('falls back to ids when the text file is empty', () => {
    const bare = parseGameMaster(readGameMasterSample(), new Map());
    expect(bare.pokemon.find((p) => p.key === 'venusaur')?.name).toBe('Venusaur');
    expect(bare.pokemon.find((p) => p.key === 'giratina_origin')?.name).toBe('Giratina (Origin)');
  });
});

type Rec = Record<string, unknown>;
interface Item {
  templateId: string;
  data: Rec;
}

/** One section (`pokemonSettings`, `moveSettings`, ...) of an item's data, for the tests to mutate. */
function section(items: Item[], templateId: string, kind: string): Rec {
  return item(items, templateId).data[kind] as Rec;
}

function overridesOf(items: Item[], templateId: string): Rec[] {
  return section(items, templateId, 'pokemonSettings')['tempEvoOverrides'] as Rec[];
}

function sampleItems(): Item[] {
  return structuredClone(readGameMasterSample()) as Item[];
}

function item(items: Item[], templateId: string): Item {
  const found = items.find((candidate) => candidate.templateId === templateId);
  if (!found) throw new Error(`no item ${templateId}`);
  return found;
}

function parseWithWarnings(items: unknown): { data: GameData; warnings: string[] } {
  const warnings: string[] = [];
  const parsed = parseGameMaster(items, texts, (message) => warnings.push(message));
  return { data: parsed, warnings };
}

describe('parseGameMaster: warnings and gaps in a changed game master', () => {
  it('raises no warning on the sample, camera-only temp-evolution stubs included', () => {
    expect(parseWithWarnings(sampleItems()).warnings).toEqual([]);
  });

  it('raises no default-form warning on the sample', () => {
    const { warnings } = parseWithWarnings(sampleItems());
    expect(warnings.filter((w) => w.includes('DEFAULT_FORMS'))).toEqual([]);
  });

  it('warns about a temporary evolution it does not know and skips it', () => {
    const items = sampleItems();
    const mega = overridesOf(items, 'V0006_POKEMON_CHARIZARD').find(
      (o) => o['tempEvoId'] === 'TEMP_EVOLUTION_MEGA_X',
    );
    if (!mega) throw new Error('no mega x');
    mega['tempEvoId'] = 'TEMP_EVOLUTION_MEGA_Z';
    const { data: parsed, warnings } = parseWithWarnings(items);
    expect(parsed.pokemon.some((p) => p.key === 'charizard_mega_x')).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('MEGA_Z');
    expect(warnings[0]).toContain('CHARIZARD');
  });

  it('warns about a move that does not resolve and drops it', () => {
    const byId = parseWithWarnings(
      sampleItems().filter((i) => i.templateId !== 'V0214_MOVE_VINE_WHIP_FAST'),
    );
    expect(byId.data.pokemon.find((p) => p.key === 'venusaur')?.fastMoves).toEqual([
      'RAZOR_LEAF_FAST',
    ]);
    expect(byId.warnings.some((w) => w.includes('VINE_WHIP_FAST'))).toBe(true);
    const byNumber = parseWithWarnings(
      sampleItems().filter((i) => i.templateId !== 'V0497_MOVE_PLASMA_FISTS'),
    );
    expect(byNumber.warnings.some((w) => w.includes('497'))).toBe(true);
  });

  it('raises one warning for one missing move, however many Pokémon list it', () => {
    const listing = data.pokemon.filter((p) => p.fastMoves.includes('VINE_WHIP_FAST'));
    expect(listing.length).toBeGreaterThan(1);
    const { warnings } = parseWithWarnings(
      sampleItems().filter((i) => i.templateId !== 'V0214_MOVE_VINE_WHIP_FAST'),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('VINE_WHIP_FAST');
  });

  it('rejects a game master without moves before warning about any move reference', () => {
    const items = sampleItems();
    for (const i of items) delete i.data['moveSettings'];
    const warnings: string[] = [];
    expect(() => parseGameMaster(items, texts, (message) => warnings.push(message))).toThrow(
      /no moves/,
    );
    expect(warnings).toEqual([]);
  });

  it('warns about a species that has neither a formless item nor a NORMAL form', () => {
    const items = sampleItems().filter(
      (i) =>
        i.templateId !== 'V0386_POKEMON_DEOXYS' && i.templateId !== 'V0386_POKEMON_DEOXYS_NORMAL',
    );
    const { data: parsed, warnings } = parseWithWarnings(items);
    expect(parsed.pokemon.some((p) => p.pokemonId === 'DEOXYS')).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('DEOXYS');
  });

  it('builds a species that has only a NORMAL form from it, with its forms', () => {
    const items = sampleItems().filter((i) => i.templateId !== 'V0386_POKEMON_DEOXYS');
    const { data: parsed, warnings } = parseWithWarnings(items);
    const deoxys = parsed.pokemon.filter((p) => p.pokemonId === 'DEOXYS');
    expect(deoxys.map((p) => p.key)).toEqual([
      'deoxys',
      'deoxys_attack',
      'deoxys_defense',
      'deoxys_speed',
    ]);
    expect(deoxys[0]?.dex).toBe(386);
    expect(deoxys[0]?.chargedMoves).toContain('THUNDERBOLT');
    expect(warnings).toEqual([]);
  });

  it('takes the megas of a species with only a NORMAL form from that item', () => {
    const items = sampleItems();
    const formless = item(items, 'V0003_POKEMON_VENUSAUR');
    section(items, 'V0003_POKEMON_VENUSAUR_NORMAL', 'pokemonSettings')['tempEvoOverrides'] =
      overridesOf(items, 'V0003_POKEMON_VENUSAUR');
    const { data: parsed, warnings } = parseWithWarnings(items.filter((i) => i !== formless));
    expect(parsed.pokemon.some((p) => p.key === 'venusaur_mega')).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('rejects a game master without moves, form settings or weather', () => {
    const without = (kind: string): Item[] => sampleItems().filter((i) => !(kind in i.data));
    expect(() => parseGameMaster(without('moveSettings'), texts)).toThrow(/no moves/);
    expect(() => parseGameMaster(without('formSettings'), texts)).toThrow(/no form settings/);
    expect(() => parseGameMaster(without('weatherAffinities'), texts)).toThrow(/no weather/);
  });

  it('rejects a non-numeric type effectiveness or CP multiplier', () => {
    const chart = sampleItems();
    const typeItem = chart.find((i) => 'typeEffective' in i.data);
    ((typeItem?.data['typeEffective'] as Rec)['attackScalar'] as unknown[])[3] = '1.6';
    expect(() => parseGameMaster(chart, texts)).toThrow(/non-numeric type effectiveness/);

    const cp = sampleItems();
    const levelItem = cp.find((i) => 'playerLevel' in i.data);
    ((levelItem?.data['playerLevel'] as Rec)['cpMultiplier'] as unknown[])[5] = null;
    expect(() => parseGameMaster(cp, texts)).toThrow(/non-numeric CP multiplier/);
  });

  it('keeps power at 0 for a move that has none', () => {
    const items = sampleItems();
    delete section(items, 'V0214_MOVE_VINE_WHIP_FAST', 'moveSettings')['power'];
    const parsed = parseGameMaster(items, texts);
    expect(parsed.moves.find((m) => m.id === 'VINE_WHIP_FAST')?.power).toBe(0);
  });
});

describe('parseGameMaster: costumes, megas and moves that cannot be taught by TM', () => {
  it('compares a flagged costume with the item the species is built from', () => {
    const items = sampleItems();
    const costume = structuredClone(item(items, 'V0051_POKEMON_DUGTRIO_NORMAL'));
    costume.templateId = 'V0051_POKEMON_DUGTRIO_PARTY';
    (costume.data['pokemonSettings'] as Rec)['form'] = 'DUGTRIO_PARTY';
    items.push(costume, {
      templateId: 'FORMS_V0051_POKEMON_DUGTRIO_EXTRA',
      data: {
        formSettings: { pokemon: 'DUGTRIO', forms: [{ form: 'DUGTRIO_PARTY', isCostume: true }] },
      },
    });
    const { data: parsed } = parseWithWarnings(items);
    expect(parsed.pokemon.some((p) => p.key === 'dugtrio_party')).toBe(false);
    expect(parsed.aliases['dugtrio_party']).toBe('dugtrio');
  });

  it('drops a flagged costume that equals a regional form of its species', () => {
    const items = sampleItems();
    const costume = structuredClone(item(items, 'V0019_POKEMON_RATTATA_ALOLA'));
    costume.templateId = 'V0019_POKEMON_RATTATA_SPRING_2026';
    (costume.data['pokemonSettings'] as Rec)['form'] = 'RATTATA_SPRING_2026';
    items.push(costume, {
      templateId: 'FORMS_V0019_POKEMON_RATTATA_EXTRA',
      data: {
        formSettings: {
          pokemon: 'RATTATA',
          forms: [{ form: 'RATTATA_SPRING_2026', isCostume: true }],
        },
      },
    });
    const { data: parsed } = parseWithWarnings(items);
    expect(parsed.pokemon.some((p) => p.key === 'rattata_spring_2026')).toBe(false);
    expect(parsed.pokemon.some((p) => p.key === 'rattata_alola')).toBe(true);
    expect(parsed.pokemon.some((p) => p.key === 'mewtwo_a')).toBe(true);
    expect(parsed.aliases['rattata_spring_2026']).toBe('rattata_alola');
  });

  it('points a costume of a species known by its default form at that form', () => {
    const items = sampleItems();
    const costume = structuredClone(item(items, 'V0487_POKEMON_GIRATINA'));
    costume.templateId = 'V0487_POKEMON_GIRATINA_PARTY_2026';
    (costume.data['pokemonSettings'] as Rec)['form'] = 'GIRATINA_PARTY_2026';
    items.push(costume, {
      templateId: 'FORMS_V0487_POKEMON_GIRATINA_EXTRA',
      data: {
        formSettings: {
          pokemon: 'GIRATINA',
          forms: [{ form: 'GIRATINA_PARTY_2026', isCostume: true }],
        },
      },
    });
    const { data: parsed } = parseWithWarnings(items);
    expect(parsed.pokemon.some((p) => p.key === 'giratina_party_2026')).toBe(false);
    expect(parsed.aliases['giratina_party_2026']).toBe('giratina_altered');
    expect(parsed.aliases['giratina']).toBe('giratina_altered');
    // The costume is one; the bare species id standing for its default form is none.
    expect(parsed.costumes).toContain('giratina_party_2026');
    expect(parsed.costumes).not.toContain('giratina');
  });

  it('keeps the costume aliases: flagged costumes that copy an entry, the appearance-only copies', () => {
    expect(data.costumes).toEqual(
      expect.arrayContaining([
        'pikachu_adventure_hat_2020',
        'pikachu_copy_2019',
        'venusaur_copy_2019',
        'charizard_copy_2019',
      ]),
    );
    // The wild legendaries of GO Tour: Johto are no costumes (Matt's answer 1), and a flagged
    // costume with stats of its own is a form.
    for (const id of ['latias_s', 'mewtwo_a', 'mewtwo', 'giratina', 'pikachu']) {
      expect(data.costumes, id).not.toContain(id);
    }
    for (const id of data.costumes) expect(data.aliases[id], id).toBeDefined();
    expect(data.costumes).toEqual([...data.costumes].sort());
  });

  it('keeps every costume of the whole game master, Pikachu with its 68', () => {
    const { costumes, aliases } = gameDataFixture();
    expect(costumes.filter((id) => aliases[id] === 'pikachu')).toHaveLength(68);
    expect(costumes).toEqual(
      expect.arrayContaining(['pikachu_pxp_2026', 'corsola_spring_2026', 'psyduck_swim_2025']),
    );
    for (const id of ['raikou_s', 'entei_s', 'suicune_s', 'lugia_s', 'ho_oh_s', 'latios_s']) {
      expect(costumes, id).not.toContain(id);
    }
    expect(costumes).not.toContain('landorus');
  });

  it('keeps the bare species when its formless item copies none of its forms', () => {
    const items = sampleItems();
    const settings = item(items, 'V0487_POKEMON_GIRATINA').data['pokemonSettings'] as Rec;
    settings['stats'] = { baseAttack: 1, baseDefense: 2, baseStamina: 3 };
    const { data: parsed, warnings } = parseWithWarnings(items);
    expect(
      parsed.pokemon.filter((p) => p.pokemonId === 'GIRATINA').map((p) => [p.key, p.kind]),
    ).toEqual([
      ['giratina', 'species'],
      ['giratina_altered', 'form'],
      ['giratina_origin', 'form'],
    ]);
    expect(parsed.aliases['giratina']).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('GIRATINA');
    expect(warnings[0]).toContain('DEFAULT_FORMS');
  });

  it('keeps the bare species when its formless item copies several of its forms', () => {
    const items = sampleItems();
    const origin = item(items, 'V0487_POKEMON_GIRATINA_ORIGIN').data;
    origin['pokemonSettings'] = {
      ...structuredClone(item(items, 'V0487_POKEMON_GIRATINA').data['pokemonSettings'] as Rec),
      form: 'GIRATINA_ORIGIN',
    };
    const { data: parsed, warnings } = parseWithWarnings(items);
    expect(
      parsed.pokemon.filter((p) => p.pokemonId === 'GIRATINA').map((p) => [p.key, p.kind]),
    ).toEqual([
      ['giratina', 'species'],
      ['giratina_altered', 'form'],
      ['giratina_origin', 'form'],
    ]);
    expect(parsed.aliases['giratina']).toBeUndefined();
    expect(warnings.filter((w) => w.includes('DEFAULT_FORMS'))).toEqual([]);
  });

  it('keeps the first of two entries with one key and warns about the duplicate', () => {
    const items = sampleItems();
    const copy = structuredClone(item(items, 'V0019_POKEMON_RATTATA_ALOLA'));
    (copy.data['pokemonSettings'] as Rec)['stats'] = {
      baseAttack: 1,
      baseDefense: 1,
      baseStamina: 1,
    };
    items.push(copy);
    const { data: parsed, warnings } = parseWithWarnings(items);
    expect(parsed.pokemon.filter((p) => p.key === 'rattata_alola')).toHaveLength(1);
    expect(parsed.pokemon.find((p) => p.key === 'rattata_alola')?.stats).toEqual(
      entry('rattata_alola').stats,
    );
    expect(parsed.pokemon).toHaveLength(data.pokemon.length);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('rattata_alola');
  });

  it('gives a mega without type overrides the types of its species', () => {
    const items = sampleItems();
    for (const override of overridesOf(items, 'V0003_POKEMON_VENUSAUR')) {
      delete override['typeOverride1'];
      delete override['typeOverride2'];
    }
    const { data: parsed } = parseWithWarnings(items);
    expect(parsed.pokemon.find((p) => p.key === 'venusaur_mega')?.types).toEqual([
      'grass',
      'poison',
    ]);
  });

  it('never marks a mega as shadow', () => {
    expect(entry('venusaur').shadow).toBe(true);
    expect(entry('venusaur_mega').shadow).toBe(false);
  });

  it('reads moves that cannot be taught by TM as elite charged moves', () => {
    expect(entry('rayquaza').eliteChargedMoves).toContain('DRAGON_ASCENT');
    expect(entry('rayquaza_mega').eliteChargedMoves).toContain('DRAGON_ASCENT');
    expect(new Set(entry('rayquaza').eliteChargedMoves).size).toBe(
      entry('rayquaza').eliteChargedMoves.length,
    );
  });

  it('yields exactly one mega for a species with a camera-only override element', () => {
    expect(data.pokemon.filter((p) => p.pokemonId === 'GENGAR' && p.kind === 'mega')).toHaveLength(
      1,
    );
    expect(byKey.has('gengar_mega')).toBe(true);
  });
});

describe('the parsed snapshot', () => {
  const snapshot = gameDataFixture();

  it('has no event-year forms', () => {
    expect(
      snapshot.pokemon.map((p) => p.key).filter((key) => /_(19|20)\d\d(_|$)/.test(key)),
    ).toEqual([]);
  });

  it('has a unique display name for every entry', () => {
    const names = snapshot.pokemon.map((p) => p.name);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });

  it('is sorted by Pokédex number, then by key in code-unit order', () => {
    const sorted = [...snapshot.pokemon].sort(
      (a, b) => a.dex - b.dex || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
    expect(snapshot.pokemon.map((p) => p.key)).toEqual(sorted.map((p) => p.key));
  });

  it('is frozen, so one test cannot change what another reads', () => {
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.pokemon)).toBe(true);
    expect(Object.isFrozen(snapshot.pokemon[0])).toBe(true);
    expect(Object.isFrozen(snapshot.pokemon[0]?.stats)).toBe(true);
    expect(Object.isFrozen(snapshot.typeChart.fire)).toBe(true);
  });
});

describe('evolutions', () => {
  const whole = new Map(gameDataFixture().pokemon.map((found) => [found.key, found]));
  const evolutionsOf = (key: string): readonly string[] | undefined => whole.get(key)?.evolutions;

  it('are the entries a Pokémon evolves into directly, by key', () => {
    expect(evolutionsOf('bulbasaur')).toEqual(['ivysaur']);
    expect(evolutionsOf('ivysaur')).toEqual(['venusaur']);
    expect(evolutionsOf('slowpoke')).toEqual(['slowbro', 'slowking']);
    expect(evolutionsOf('eevee')).toHaveLength(8);
  });

  it('follow the form a regional form evolves into', () => {
    expect(evolutionsOf('rattata_alola')).toEqual(['raticate_alola']);
    expect(evolutionsOf('meowth_galarian')).toEqual(['perrserker']);
    expect(evolutionsOf('slowpoke_galarian')).toEqual(['slowbro_galarian', 'slowking_galarian']);
  });

  it('name a species known by its default form by that form', () => {
    expect(evolutionsOf('rockruff')).toEqual(['lycanroc_midday', 'lycanroc_midnight']);
  });

  it('of a species whose own item has none are those of its forms, as species', () => {
    // Deerling's formless item has no branch; each season form evolves into its own Sawsbuck.
    expect(evolutionsOf('deerling')).toEqual(['sawsbuck']);
    expect(evolutionsOf('deerling_spring')).toEqual(['sawsbuck_spring']);
    // A species with branches of its own keeps them.
    expect(evolutionsOf('shellos')).toEqual(['gastrodon_east_sea']);
  });

  it('leave out megas, also on the mega itself', () => {
    expect(evolutionsOf('venusaur')).toEqual([]);
    expect(evolutionsOf('venusaur_mega')).toEqual([]);
    expect(evolutionsOf('charizard_mega_x')).toEqual([]);
  });

  it('leave out without a warning what the game master does not have', () => {
    const items = sampleItems();
    section(items, 'V0025_POKEMON_PIKACHU_NORMAL', 'pokemonSettings')['evolutionBranch'] = [
      { evolution: 'RAICHU', form: 'RAICHU_NORMAL' },
      { evolution: 'PIKACHU_NEW', form: 'PIKACHU_NEW_NORMAL' },
      { temporaryEvolution: 'TEMP_EVOLUTION_MEGA' },
      { evolution: 'GENGAR', form: 'GENGAR_SOMETHING_NEW' },
      { evolution: 'GENGAR' },
    ];
    const { data: parsed, warnings } = parseWithWarnings(items);
    expect(warnings).toEqual([]);
    // Raichu is not in the sample; a form that is not there falls back to its species.
    expect(parsed.pokemon.find((found) => found.key === 'pikachu')?.evolutions).toEqual(['gengar']);
  });
});

describe('the class of a Pokémon', () => {
  it('is read from the species and is null for an ordinary one', () => {
    expect(entry('mewtwo').class).toBe('legendary');
    expect(entry('zeraora').class).toBe('mythical');
    expect(entry('venusaur').class).toBeNull();
    expect(entry('pikachu').class).toBeNull();
  });

  it('is the same for every form and mega of a species', () => {
    expect(entry('mewtwo_a').class).toBe('legendary');
    expect(entry('giratina_origin').class).toBe('legendary');
    expect(entry('latias_mega').class).toBe('legendary');
    expect(entry('kyogre_primal').class).toBe('legendary');
    expect(entry('deoxys_attack').class).toBe('mythical');
    expect(entry('charizard_mega_x').class).toBeNull();
  });

  it('is null for a class this code does not know', () => {
    const items = (readGameMasterSample() as { data: Record<string, unknown> }[]).map((item) => {
      const settings = item.data['pokemonSettings'] as Record<string, unknown> | undefined;
      return settings?.['pokemonId'] === 'MEWTWO'
        ? { ...item, data: { pokemonSettings: { ...settings, pokemonClass: 'POKEMON_CLASS_NEW' } } }
        : item;
    });
    const parsed = parseGameMaster(items, texts);
    expect(parsed.pokemon.find((found) => found.key === 'mewtwo')?.class).toBeNull();
  });

  it('counts 77 legendary, 23 mythical and 11 ultra-beast species in the whole game master', () => {
    const species = (wanted: PokemonEntry['class']): Set<string> =>
      new Set(
        gameDataFixture()
          .pokemon.filter((found) => found.class === wanted)
          .map((found) => found.pokemonId),
      );
    expect(species('legendary').size).toBe(77);
    expect(species('mythical').size).toBe(23);
    expect(species('ultra-beast').size).toBe(11);
    const whole = new Map(gameDataFixture().pokemon.map((found) => [found.key, found]));
    for (const key of [
      'articuno',
      'articuno_galarian',
      'kyurem_black',
      'necrozma_dusk_mane',
      'uxie',
    ])
      expect(whole.get(key)?.class, key).toBe('legendary');
    for (const key of ['mew', 'meltan', 'hoopa_unbound'])
      expect(whole.get(key)?.class, key).toBe('mythical');
    for (const key of ['nihilego', 'poipole', 'kartana'])
      expect(whole.get(key)?.class, key).toBe('ultra-beast');
    for (const key of ['dratini', 'tyranitar', 'lucario_mega', 'unown'])
      expect(whole.get(key)?.class, key).toBeNull();
  });
});

describe('what can Dynamax and Gigantamax (plan 8X-2)', () => {
  const extended = (
    templateId: string,
    uniqueId: string,
    form: string | undefined,
    modes: unknown[],
  ) => ({
    templateId,
    data: {
      templateId,
      pokemonExtendedSettings: {
        uniqueId,
        ...(form === undefined ? {} : { form }),
        breadOverrides: modes.map((breadMode) => ({ breadMode, maxBattleVisualSettings: {} })),
      },
    },
  });

  it('reads the modes of the extended settings, by catalogue key, costumes as their species', () => {
    expect(data.maxBattles.dynamax).toEqual(
      expect.arrayContaining(['venusaur', 'charizard', 'pikachu', 'gengar']),
    );
    expect(data.maxBattles.gigantamax).toEqual(
      expect.arrayContaining(['venusaur', 'charizard', 'pikachu', 'gengar']),
    );
    expect(data.maxBattles.dynamax).not.toContain('rattata');
    expect(data.maxBattles.dynamax).not.toContain('venusaur_mega');
    // Each key once, sorted, so the cache and the fixture stay reviewable.
    for (const list of [data.maxBattles.dynamax, data.maxBattles.gigantamax]) {
      expect([...new Set(list)].sort()).toEqual(list);
    }
  });

  it('takes a second Gigantamax mode as Gigantamax, and neither the special mode nor no mode', () => {
    const items = [
      ...sampleItems(),
      extended('EXTENDED_V0019_POKEMON_RATTATA_ALOLA', 'RATTATA', 'RATTATA_ALOLA', [
        'BREAD_DOUGH_MODE_2',
      ]),
      extended('EXTENDED_V0019_POKEMON_RATTATA_NORMAL', 'RATTATA', 'RATTATA_NORMAL', [
        'BREAD_SPECIAL_MODE',
        undefined,
      ]),
      extended('EXTENDED_V0019_POKEMON_RATTATA', 'RATTATA', undefined, ['BREAD_MODE']),
      extended('EXTENDED_V9999_POKEMON_NOBODY', 'NOBODY', undefined, ['BREAD_MODE']),
    ];
    const { data: parsed, warnings } = parseWithWarnings(items);
    expect(parsed.maxBattles.gigantamax).toContain('rattata_alola');
    expect(parsed.maxBattles.gigantamax).not.toContain('rattata');
    expect(parsed.maxBattles.dynamax).toContain('rattata');
    expect(parsed.maxBattles.dynamax).not.toContain('rattata_alola');
    expect(parsed.maxBattles.dynamax).not.toContain('nobody');
    expect(warnings).toEqual([]);
  });

  it('warns when no Pokémon can Dynamax, as when the game renames its overrides or modes', () => {
    const renamed = (rename: (settings: Rec) => void): string[] => {
      const items = sampleItems();
      for (const one of items) {
        const settings = one.data['pokemonExtendedSettings'] as Rec | undefined;
        if (settings) rename(settings);
      }
      const { data: parsed, warnings } = parseWithWarnings(items);
      expect(parsed.maxBattles.dynamax).toEqual([]);
      return warnings;
    };
    const warning =
      'The game master names no Pokémon that can Dynamax (breadMode BREAD_MODE in pokemonExtendedSettings.breadOverrides): every typed max boss is taken as one the game data does not list';
    const lists = renamed((settings) => {
      settings['maxOverrides'] = settings['breadOverrides'];
      delete settings['breadOverrides'];
    });
    expect(lists).toEqual([warning]);
    const modes = renamed((settings) => {
      for (const override of (settings['breadOverrides'] ?? []) as Rec[]) {
        override['breadMode'] = `MAX_${String(override['breadMode'])}`;
      }
    });
    expect(modes).toEqual([warning]);
  });

  it('reads the whole game master: the bosses of today, and Gigantamax only where the game has it', () => {
    const { maxBattles } = gameDataFixture();
    expect(maxBattles.dynamax).toEqual(
      expect.arrayContaining(['sneasel', 'machop', 'toxtricity_amped', 'duraludon', 'eevee']),
    );
    expect(maxBattles.gigantamax).toEqual(
      expect.arrayContaining(['machamp', 'toxtricity_amped', 'urshifu_rapid_strike', 'lapras']),
    );
    expect(maxBattles.gigantamax).not.toContain('sneasel');
    // The game master of the fixture (2026-10-10) predates the lake trio's Max Battle Day.
    expect(maxBattles.dynamax).not.toContain('uxie');
  });
});

describe('Super Megas: the levels mega level 4 adds', () => {
  /** A mega level's settings for one species, as the game master has them (2026-10). */
  const megaLevel = (level: number, pokemonId: string, effects: Rec, tempEvoId?: string): Item => ({
    templateId: `MEGA_EVOLUTION_LEVEL_${String(level)}_V0000_POKEMON_${pokemonId}`,
    data: {
      templateId: `MEGA_EVOLUTION_LEVEL_${String(level)}_V0000_POKEMON_${pokemonId}`,
      megaEvoLevelSettings: {
        level,
        pokemonId,
        ...(tempEvoId === undefined ? {} : { tempEvoId }),
        effects: { sameTypeAttackBoost: 1.3, ...effects },
      },
    },
  });

  it('gives every mega of a species the levels its level 4 adds, by catalogue key', () => {
    const { data: parsed, warnings } = parseWithWarnings([
      ...sampleItems(),
      megaLevel(3, 'VENUSAUR', {}),
      megaLevel(4, 'MEWTWO', { selfCpBoostAdditionalLevel: 2 }),
      megaLevel(4, 'BULBASAUR', { selfCpBoostAdditionalLevel: 2 }),
    ]);
    expect(parsed.superMegas).toEqual({ mewtwo_mega_x: 2, mewtwo_mega_y: 2 });
    expect(warnings).toEqual([]);
  });

  it('gives the levels to the one mega its settings name, where they name one', () => {
    const { data: parsed } = parseWithWarnings([
      ...sampleItems(),
      megaLevel(4, 'CHARIZARD', { selfCpBoostAdditionalLevel: 2 }, 'TEMP_EVOLUTION_MEGA_Y'),
    ]);
    expect(parsed.superMegas).toEqual({ charizard_mega_y: 2 });
  });

  it('has none where no mega level adds any', () => {
    expect(data.superMegas).toEqual({});
  });
});

describe('what cannot be traded', () => {
  it('lists the entries whose item has no isTradable, a mega by its species’, sorted', () => {
    expect(data.untradable).toEqual(
      expect.arrayContaining([
        'deoxys',
        'deoxys_attack',
        'deoxys_defense',
        'deoxys_speed',
        'diancie',
        'diancie_mega',
        'eternatus',
        'eternatus_eternamax',
        'kyurem_black',
        'kyurem_white',
      ]),
    );
    for (const tradable of ['meltan', 'kyurem', 'mewtwo', 'mewtwo_mega_x', 'venusaur']) {
      expect(data.untradable, tradable).not.toContain(tradable);
    }
    expect([...data.untradable].sort()).toEqual(data.untradable);
  });

  it('takes everything as tradable, and warns, where no item says isTradable', () => {
    const items = sampleItems();
    for (const one of items) {
      const settings = one.data['pokemonSettings'] as Rec | undefined;
      if (settings) delete settings['isTradable'];
    }
    const { data: parsed, warnings } = parseWithWarnings(items);
    expect(parsed.untradable).toEqual([]);
    expect(warnings).toContain(
      'The game master marks no Pokémon tradable (isTradable in pokemonSettings): every Pokémon is taken as tradable',
    );
  });
});

describe('the shape of the parsed data', () => {
  it('changes only together with GAME_DATA_VERSION: bump GAME_DATA_VERSION when this fails', () => {
    expect(GAME_DATA_VERSION).toBe(9);
    expect(Object.keys(data).sort()).toEqual([
      'aliases',
      'costumes',
      'cpMultipliers',
      'maxBattles',
      'moves',
      'pokemon',
      'superMegas',
      'typeChart',
      'untradable',
      'weatherBoosts',
    ]);
    expect(Object.keys(entry('venusaur')).sort()).toEqual([
      'chargedMoves',
      'class',
      'dex',
      'eliteChargedMoves',
      'eliteFastMoves',
      'evolutions',
      'family',
      'fastMoves',
      'form',
      'key',
      'kind',
      'name',
      'pokebattlerId',
      'pokemonId',
      'shadow',
      'stats',
      'tempEvolution',
      'types',
    ]);
    expect(Object.keys(data.moves[0] ?? {}).sort()).toEqual([
      'durationMs',
      'energyDelta',
      'fast',
      'id',
      'name',
      'number',
      'power',
      'type',
    ]);
  });
});
