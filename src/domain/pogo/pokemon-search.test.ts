import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { MAX_SEARCH_WORDS } from '../search/text.js';
import { CURATED_NICKNAMES } from './nicknames.js';
import { PokemonSearch, mergeNicknames } from './pokemon-search.js';

const catalogue = catalogueFixture();
const search = new PokemonSearch(catalogue, mergeNicknames(catalogue, CURATED_NICKNAMES));

/** The words of an entry's own name and key: what a guess may be a misspelling of. */
const searchWords = (entry: { name: string; key: string }): string[] =>
  `${entry.name} ${entry.key.replace(/_/g, ' ')}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const keys = (text: string, limit?: number) =>
  search.search(text, { limit }).map((entry) => entry.key);
const first = (text: string) => search.search(text)[0]?.key;

describe('PokemonSearch: names', () => {
  it('finds every Pokémon first by its own name and by its key', () => {
    // Unown's "!" and "?" have no letters in their names; their keys still find them.
    const unnameable = new Set(['unown_exclamation_point', 'unown_question_mark']);
    for (const entry of catalogue.all) {
      expect(first(entry.key), entry.key).toBe(entry.key);
      if (!unnameable.has(entry.key)) expect(first(entry.name), entry.name).toBe(entry.key);
    }
  });

  it('ignores case, accents, punctuation and custom-emoji wrapping', () => {
    expect(first('FLABÉBÉ')).toBe('flabebe');
    expect(first('flabebe')).toBe('flabebe');
    expect(first("farfetch'd")).toBe('farfetchd');
    expect(first('mr mime')).toBe('mr_mime');
    expect(first('Mr. Mime')).toBe('mr_mime');
    expect(first('ho-oh')).toBe('ho_oh');
    expect(first('<:mewtwo:123456789012345678>')).toBe('mewtwo');
    expect(first('RATTATA_ALOLA')).toBe('rattata_alola');
  });

  it('puts the species before its forms and megas', () => {
    expect(keys('charizard')).toEqual(['charizard', 'charizard_mega_x', 'charizard_mega_y']);
    expect(keys('rattata')).toEqual(['rattata', 'rattata_alola']);
    expect(keys('weezing')).toEqual(['weezing', 'weezing_galarian']);
    expect(keys('mew', 2)).toEqual(['mew', 'mewtwo']);
  });

  it('finds a species known by its default form under the bare species name', () => {
    expect(keys('giratina')).toEqual(['giratina_altered', 'giratina_origin']);
    expect(keys('landorus')).toEqual(['landorus_incarnate', 'landorus_therian']);
    expect(first('zacian')).toBe('zacian_hero');
    expect(first('wormadam')).toBe('wormadam_plant');
  });

  it('narrows down with more words', () => {
    expect(keys('giratina origin')).toEqual(['giratina_origin']);
    expect(keys('mega charizard')).toEqual(['charizard_mega_x', 'charizard_mega_y']);
    expect(keys('mega charizard y')).toEqual(['charizard_mega_y']);
    expect(keys('black kyurem')).toEqual(['kyurem_black']);
    expect(keys('primal kyogre')).toEqual(['kyogre_primal']);
    expect(keys('deoxys attack')).toEqual(['deoxys_attack']);
    expect(keys('nidoran female', 1)).toEqual(['nidoran_female']);
    expect(keys('nidoran male', 1)).toEqual(['nidoran_male']);
  });

  it('accepts the beginning of a word and small misspellings', () => {
    expect(keys('gira')).toEqual(['giratina_altered', 'giratina_origin', 'girafarig']);
    expect(keys('lando', 2)).toEqual(['landorus_incarnate', 'landorus_therian']);
    expect(keys('lando t')).toEqual(['landorus_therian']);
    expect(first('tyrannitar')).toBe('tyranitar');
    expect(first('mewtoo')).toBe('mewtwo');
    expect(first('pikchu')).toBe('pikachu');
  });

  it('finds regional forms by the short words members use', () => {
    expect(keys('alo rattata')).toEqual(['rattata_alola']);
    expect(keys('alolan rat')).toEqual(['rattata_alola', 'raticate_alola']);
    expect(keys('galar weezing')).toEqual(['weezing_galarian']);
    expect(first('hisu arcanine')).toBe('arcanine_hisuian');
    expect(first('paldea tauros')).toMatch(/^tauros_paldea/);
    expect(keys('kanto rattata')).toEqual(['rattata']);
  });

  it('finds a Pokémon by its Pokédex number', () => {
    expect(keys('150', 1)).toEqual(['mewtwo']);
    expect(first('#25')).toBe('pikachu');
  });

  it('never reads a number as a misspelling of another', () => {
    const found = search.search('150');
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((entry) => entry.dex === 150)).toBe(true);
    expect(search.search('1000').every((entry) => entry.dex !== 1002)).toBe(true);
  });

  it('puts the species of a low Pokédex number before forms that merely contain it', () => {
    for (const text of ['10', '#10', '1', '19', '11', '15']) {
      const dex = Number(text.replace('#', ''));
      expect(first(text), text).toBe(catalogue.species(dex)?.key);
    }
    expect(first('150')).toBe('mewtwo');
  });

  it('finds short names with two letters swapped', () => {
    expect(first('lugai')).toBe('lugia');
    expect(first('etnei')).toBe('entei');
    expect(first('abslo')).toBe('absol');
    expect(first('onxi')).toBe('onix');
    expect(first('eeeve')).toBe('eevee');
    expect(first('pikahcu')).toBe('pikachu');
    expect(keys('qqqqqq')).toEqual([]);
  });

  it('finds an Unown letter and the megas that carry it by one letter', () => {
    expect(search.search('x')[0]?.key).toBe('unown_x');
    expect(keys('x')).toContain('charizard_mega_x');
    expect(first('unown x')).toBe('unown_x');
  });

  it('gives nothing for no words and for words no Pokémon has', () => {
    expect(keys('')).toEqual([]);
    expect(keys('?!')).toEqual([]);
    expect(keys('qqqqqq')).toEqual([]);
    expect(keys('mega qqqqqq')).toEqual([]);
  });
});

describe('PokemonSearch.exact', () => {
  it('tells a text that names one Pokémon from one that is only close', () => {
    expect(search.exact('giratina origin')?.key).toBe('giratina_origin');
    expect(search.exact('ttar')?.key).toBe('tyranitar');
    expect(search.exact('Mewtwo')?.key).toBe('mewtwo');
    for (const text of ['mega', 'zard', 'gira', 'lugai', '']) {
      expect(search.exact(text), text).toBeUndefined();
    }
  });
});

describe('PokemonSearch: nicknames and other ids', () => {
  it('finds a Pokémon by a nickname of its own', () => {
    expect(first('ttar')).toBe('tyranitar');
    expect(first('hooh')).toBe('ho_oh');
    expect(first('alowak')).toBe('marowak_alola');
    expect(keys('exegg', 2)).toEqual(['exeggutor', 'exeggutor_alola']);
  });

  it('treats a nickname shared by many as a word, not as one Pokémon', () => {
    const found = keys('mega');
    const megas = catalogue.all.filter((entry) => entry.tempEvolution?.startsWith('MEGA'));
    for (const mega of megas) expect(found, mega.key).toContain(mega.key);
    // The megas of legendary and mythical species first, then the others by name.
    expect(found.slice(0, 3)).toEqual(['diancie_mega', 'latias_mega', 'latios_mega']);
    const ordinary = found.filter((key) => catalogue.byKey(key)?.class === null);
    expect(ordinary.slice(0, 3)).toEqual(['abomasnow_mega', 'absol_mega', 'aerodactyl_mega']);
    expect(found.slice(0, 40).every((key) => catalogue.byKey(key)?.kind === 'mega')).toBe(true);
    // A word that merely begins the same comes along, after them.
    expect(found).toContain('meganium');
  });

  it('finds an entry by a game-master id that stands for it', () => {
    expect(first('giratina')).toBe('giratina_altered');
    expect(first('pikachu_copy_2019')).toBe('pikachu');
    expect(first('PIKACHU COPY 2019')).toBe('pikachu');
  });

  it('uses the nicknames it was given', () => {
    const own = new PokemonSearch(
      catalogue,
      mergeNicknames(catalogue, { giratina: ['tina'], dratini: ['noodle'] }),
    );
    expect(own.search('tina')[0]?.key).toBe('giratina_altered');
    expect(own.search('noodle')[0]?.key).toBe('dratini');
    expect(own.search('ttar').map((entry) => entry.key)).not.toContain('tyranitar');
  });
});

describe('PokemonSearch: the order of hits', () => {
  const hits = (text: string) => search.find(text).map((hit) => `${hit.entry.key}:${hit.match}`);

  it('puts a legendary, a mythical Pokémon and an ultra beast before an ordinary one', () => {
    expect(keys('gira')[0]).toBe('giratina_altered');
    const la = keys('la');
    expect(la.indexOf('latias')).toBeLessThan(la.indexOf('lapras'));
    expect(la.indexOf('landorus_therian')).toBeLessThan(la.indexOf('larvitar'));
    const ka = keys('ka');
    expect(ka.indexOf('kartana')).toBeLessThan(ka.indexOf('kabuto'));
    const me = keys('me');
    expect(me.indexOf('meltan')).toBeLessThan(me.indexOf('meowth'));
  });

  it('puts the Pokémon a text leads to by name before what a form, type or style word finds', () => {
    // Starmie and the others begin with it; Furfrou has it as the word of a trim.
    expect(hits('star')).toEqual([
      'starly:beginning',
      'staryu:beginning',
      'staravia:beginning',
      'staraptor:beginning',
      'starmie:beginning',
      'starmie_mega:beginning',
      'furfrou_star:word',
    ]);
    expect(hits('mew').slice(0, 2)).toEqual(['mew:exact', 'mewtwo:beginning']);
    // Type: Null is found by its name, and so are Tyranitar and Typhlosion: all before the
    // seventeen types of Arceus and of Silvally, which are legendary and mythical.
    for (const text of ['ty', 'typ']) {
      const found = keys(text, 25);
      expect(found[0], text).toBe('type_null');
      expect(found, text).toContain('typhlosion');
      expect(found.indexOf('typhlosion'), text).toBeLessThan(found.indexOf('arceus_bug'));
    }
    expect(keys('ty', 25)).toContain('tyranitar');
    expect(keys('psy')).toEqual(['psyduck', 'arceus_psychic', 'silvally_psychic']);
    // Tapu Bulu has it in the middle of its name; by `bulu` it is found by name.
    expect(keys('bul')).toEqual(['bulbasaur', 'tapu_bulu']);
    expect(keys('bulu')).toEqual(['tapu_bulu']);
    expect(first('for')).toBe('forretress');
    // A regional form and a mega are found by the name of their species.
    expect(keys('ratt')).toEqual(['rattata', 'rattata_alola']);
    expect(keys('exegg', 2)).toEqual(['exeggutor', 'exeggutor_alola']);
  });

  it('lets the class lift three entries of a species at most', () => {
    // Arceus has eighteen entries and Arcanine two: both in the first few.
    const arc = keys('arc', 25);
    expect(arc.slice(0, 3).every((key) => key.startsWith('arceus'))).toBe(true);
    // Then the ordinary Pokémon as the search has them, Arcanine and its Hisuian form among
    // them, and only then the other fifteen types.
    expect(arc.slice(3, 11)).toEqual([
      'archen',
      'archeops',
      'arctibax',
      'arctovish',
      'arctozolt',
      'archaludon',
      'arcanine',
      'arcanine_hisuian',
    ]);
    expect(arc[11]).toBe('arceus_dragon');
    // The other types of Arceus are still found, where they would stand without a class.
    expect(keys('arc').filter((key) => key.startsWith('arceus'))).toHaveLength(18);
    expect(keys('ar', 25)).toContain('arcanine');
    const sil = keys('sil', 25);
    expect(sil.filter((key) => key.startsWith('silvally')).slice(0, 3)).toEqual(sil.slice(0, 3));
    expect(sil.indexOf('silcoon')).toBeLessThan(6);
    // Two entries are both lifted.
    expect(keys('gira')).toEqual(['giratina_altered', 'giratina_origin', 'girafarig']);
  });

  it('takes the beginning of a nickname for the beginning of a name', () => {
    // `hooh` is a nickname of Ho-Oh, a legendary: found by name, so before Hoothoot.
    const hoo = keys('hoo');
    expect(hoo.indexOf('ho_oh')).toBeGreaterThanOrEqual(0);
    expect(hoo.indexOf('ho_oh')).toBeLessThan(hoo.indexOf('hoothoot'));
    expect(search.find('tta')).toMatchObject([
      { entry: { key: 'tyranitar' }, match: 'beginning', named: true },
    ]);
    expect(search.find('hoo').find((hit) => hit.entry.key === 'ho_oh')?.named).toBe(true);
  });

  it('gives an id that stands for an entry no weight over another entry', () => {
    // As before there were classes: Charjabug, Cubchoo, Bewear and Delibird have such ids.
    expect(keys('char').slice(0, 4)).toEqual([
      'charcadet',
      'charjabug',
      'charmeleon',
      'charmander',
    ]);
    expect(keys('cub')).toEqual(['cubone', 'cubchoo']);
    expect(keys('be').slice(0, 2)).toEqual(['beldum', 'bewear']);
    expect(keys('del').slice(0, 2)).toEqual(['delcatty', 'delibird']);
  });

  it('puts what only a key or a number finds after the names', () => {
    expect(hits('zygarde fifty')).toEqual([
      'zygarde_fifty_percent:loose',
      'zygarde_complete_fifty_percent:loose',
    ]);
    const fifteen = hits('15');
    expect(fifteen.slice(0, 3)).toEqual([
      // The species of that number first, but as what a number finds: it is no name.
      'beedrill:loose',
      'spinda_15:word',
      'beedrill_mega:loose',
    ]);
    // Mew is number 151: found, but its class does not lift it over number 15 itself.
    expect(fifteen).toContain('mew:loose');
  });

  it('puts a guess after every proper match and says which word it guessed', () => {
    expect(search.find('shadow').map((hit) => [hit.entry.key, hit.match, hit.guessed])).toEqual([
      ['calyrex_shadow_rider', 'word', []],
      ['scatterbug_meadow', 'guess', ['meadow']],
      ['spewpa_meadow', 'guess', ['meadow']],
      ['vivillon_meadow', 'guess', ['meadow']],
    ]);
    expect(search.find('perfect').every((hit) => hit.match === 'guess')).toBe(true);
    expect(search.find('perfect')[0]?.guessed).toEqual(['percent']);
    // The second try reads two neighbouring letters in the wrong order, and nothing wider.
    expect(search.find('lugai').map((hit) => [hit.entry.key, hit.match, hit.guessed])).toEqual([
      ['lugia', 'guess', ['lugia']],
    ]);
    expect(hits('mwetwo')[0]).toBe('mewtwo:guess');
    for (const text of ['none', 'lake', 'elit', 'base form', 'hundo', 'ex']) {
      expect(
        search.find(text).filter((hit) => hit.match === 'guess'),
        text,
      ).toEqual([]);
    }
    // A short word keeps its first letter to be read as a misspelling.
    expect(hits('mewt')[0]).toBe('mewtwo:beginning');
    expect(keys('nuk')).toEqual([]);
    expect(hits('tyrannitar')[0]).toBe('tyranitar:guess');
  });

  it('guesses at nothing for a text that names a Pokémon outright', () => {
    for (const text of ['mawile', 'zekrom', 'machamp', 'kabuto', 'swanna']) {
      const found = search.find(text);
      expect(found[0]?.match, text).toBe('exact');
      expect(
        found.filter((hit) => hit.match === 'guess').map((hit) => hit.entry.key),
        text,
      ).toEqual([]);
    }
    // What begins with the name stays.
    expect(keys('kabuto')).toEqual(['kabuto', 'kabutops']);
    expect(hits('kabuto')).toEqual(['kabuto:exact', 'kabutops:beginning']);
    // A text that names nothing outright is guessed at as before.
    expect(hits('kabutu')).toContain('kabuto:guess');
    // Also when the entry that is named is not among those asked for.
    expect(
      search
        .find('kabuto', { filter: (entry) => entry.key !== 'kabuto' })
        .map((hit) => hit.entry.key),
    ).toEqual(['kabutops']);
  });

  it('reads no word as a misspelling of a nickname of another Pokémon', () => {
    // `kanto` is a nickname of the species that have an Alolan form, `regiduck` one of
    // Cresselia, `galar` one of the Galarian forms.
    // Kabutops begins with it (Furfrou's Kabuki Trim, one letter of a name away, is no guess
    // for a text that names Kabuto): no Diglett, Geodude or Meowth for their `kanto`.
    expect(keys('kabuto')).toEqual(['kabuto', 'kabutops']);
    expect(keys('regirock')).toEqual(['regirock']);
    // Guesses by names (Gengar, Gligar), and no Galarian form for its `galar`.
    const gangar = search.find('gangar');
    expect(gangar.map((hit) => hit.entry.key)).toEqual(['gengar', 'gligar', 'gengar_mega']);
    expect(gangar.every((hit) => hit.match === 'guess')).toBe(true);
    expect(keys('poodle')).toEqual([]);
    for (const text of ['swanna', 'poodle', 'kabuto', 'regirock', 'gangar']) {
      const nicknamed = search
        .find(text)
        .filter((hit) => hit.match === 'guess')
        .filter((hit) => !searchWords(hit.entry).some((word) => hit.guessed.includes(word)));
      expect(nicknamed, text).toEqual([]);
    }
    // Swanna is named outright: the Savanna Pattern, a letter away, is not guessed at.
    expect(keys('swanna')).toEqual(['swanna']);
    // Misspelt, it is guessed at: by a word of a name, never by a nickname.
    expect(search.find('swana').flatMap((hit) => hit.guessed)).toEqual(
      expect.arrayContaining(['swanna']),
    );
  });

  it('never reads a nickname as a misspelling', () => {
    // `ttar` is a nickname of Tyranitar: `star` is not it, `tta` begins it.
    expect(keys('star')).not.toContain('tyranitar');
    expect(hits('tta')).toEqual(['tyranitar:beginning']);
    expect(hits('ttar')).toEqual(['tyranitar:exact']);
  });

  it('does not find an entry by nothing but the words of ids that stand for it', () => {
    // Pikachu's costumes have ids such as pikachu_rock_star and pikachu_pop_star.
    expect(catalogue.aliasesOf('pikachu').some((alias) => alias.includes('star'))).toBe(true);
    expect(keys('star')).not.toContain('pikachu');
    for (const text of ['copy', '2019', 'copy 2019']) {
      for (const key of ['pikachu', 'venusaur', 'charizard', 'blastoise']) {
        expect(keys(text), text).not.toContain(key);
      }
    }
    // With a word of the entry itself they do find it.
    expect(hits('pikachu copy')).toEqual(['pikachu:loose']);
    expect(hits('pikachu star')).toEqual(['pikachu:loose']);
  });
});

describe('PokemonSearch: forms that differ in looks only', () => {
  it('leaves them out unless the text names the form', () => {
    expect(keys('vivillon')).toEqual(['vivillon']);
    expect(keys('vivillon marine')).toEqual(['vivillon_marine']);
    expect(keys('unown')).toEqual(['unown']);
    expect(keys('unown f')).toEqual(['unown_f']);
    expect(keys('spinda')).toEqual(['spinda']);
    expect(keys('marine').slice(0, 3)).toEqual([
      'scatterbug_marine',
      'spewpa_marine',
      'vivillon_marine',
    ]);
  });

  it('keeps forms that battle differently', () => {
    expect(keys('deoxys')).toEqual(['deoxys', 'deoxys_attack', 'deoxys_defense', 'deoxys_speed']);
    expect(keys('wormadam')).toEqual(['wormadam_plant', 'wormadam_sandy', 'wormadam_trash']);
  });
});

describe('PokemonSearch: options', () => {
  it('goes by the first words of a long text', () => {
    expect(keys(`${'charizard '.repeat(MAX_SEARCH_WORDS)}nothing like these`, 1)).toEqual([
      'charizard',
    ]);
  });

  it('limits the results', () => {
    expect(keys('mega', 5)).toHaveLength(5);
    expect(keys('charizard', 1)).toEqual(['charizard']);
  });

  it('filters before limiting', () => {
    const megas = search.search('charizard', {
      filter: (entry) => entry.kind === 'mega',
      limit: 1,
    });
    expect(megas.map((entry) => entry.key)).toEqual(['charizard_mega_x']);
    expect(search.search('charizard', { filter: () => false })).toEqual([]);
  });
});

describe('mergeNicknames', () => {
  it('merges the sources under the entry each key means', () => {
    const merged = mergeNicknames(
      catalogue,
      { giratina_altered: ['altered'], tyranitar: ['ttar'] },
      new Map([
        ['giratina', ['tina', 'altered']],
        ['TYRANITAR', ['godzilla']],
      ]),
    );
    expect(merged.get('giratina_altered')).toEqual(['altered', 'tina']);
    expect(merged.get('tyranitar')).toEqual(['ttar', 'godzilla']);
    expect(merged.has('giratina')).toBe(false);
  });

  it('leaves out keys the catalogue does not know', () => {
    const merged = mergeNicknames(
      catalogue,
      new Map([
        ['ex', ['exclusive']],
        ['perfect', ['hundo']],
      ]),
    );
    expect(merged.size).toBe(0);
  });

  it('places every curated nickname', () => {
    const merged = mergeNicknames(catalogue, CURATED_NICKNAMES);
    expect(merged.size).toBe(Object.keys(CURATED_NICKNAMES).length);
  });
});
