import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { pokemonFixture } from '../../../test/support/providers.js';
import {
  encodeNotification,
  isNotificationTier,
  notificationTiers,
  pokemonTarget,
  readNotification,
  sameNotificationTarget,
  type NotificationTarget,
} from './notification-target.js';
import { CURATED_NICKNAMES } from './nicknames.js';
import { raidTierLabel, type RaidLevel } from './raid-tier.js';
import { PokemonSearch, mergeNicknames } from './pokemon-search.js';
import {
  entryWant,
  formAsStored,
  formReader,
  parseWantToken,
  planSetWant,
  pokemonWantFits,
  pokemonWantName,
  raidsOnly,
  readWant,
  readWantText,
  readWants,
  rowsOfWant,
  typedEntryWant,
  wantTargetLabel,
  wantToken,
  speciesNameOf,
  wantSpeciesFinder,
  wantWord,
  wantWordGuesses,
  wantsByMember,
} from './wants.js';

const tier = (level: RaidLevel, shadow = false): NotificationTarget => ({
  kind: 'tier',
  tier: { level, shadow },
});
const species = (dex: number): NotificationTarget => ({ kind: 'pokemon', dex });
/** One form of a species, by the key of its entry. */
const form = (dex: number, key: string) => pokemonTarget(dex, key);
/** The shadow raids of a species, or of one form of it. */
const shadowOf = (dex: number, key?: string) => pokemonTarget(dex, key, true);
/** What a row holds in the two newer columns when it is for no form and not for shadow raids. */
const NONE = { form: null, shadow: false };
const PERFECT: NotificationTarget = { kind: 'iv', iv: 'perfect' };
const ZERO: NotificationTarget = { kind: 'iv', iv: 'zero' };

describe('readNotification: the scope in effect', () => {
  it('gives a species the scope of its row, whatever the letter case', () => {
    expect(readNotification({ pokemon: 150, type: 'Raid' })).toEqual({
      target: species(150),
      scope: 'raid',
    });
    expect(readNotification({ pokemon: 150, type: 'BOTH' })?.scope).toBe('both');
    expect(readNotification({ pokemon: 150, type: ' spawn ' })?.scope).toBe('spawn');
  });

  it('gives a tier the scope raid and an IV target the scope spawn, whatever is stored', () => {
    expect(readNotification({ pokemon: -5, type: 'both' })).toEqual({
      target: tier('T5'),
      scope: 'raid',
    });
    // The legacy rows of 2019: a perfect-IV want typed `both`.
    expect(readNotification({ pokemon: -6, type: 'both' })).toEqual({
      target: PERFECT,
      scope: 'spawn',
    });
    expect(readNotification({ pokemon: -8, type: 'raid' })).toEqual({
      target: ZERO,
      scope: 'spawn',
    });
    expect(readNotification({ pokemon: -6, type: 'raid' })).toEqual({
      target: tier('MegaLegendary'),
      scope: 'raid',
    });
  });

  it('is undefined for what the codec cannot read', () => {
    expect(readNotification({ pokemon: -5, type: 'spawn' })).toBeUndefined();
    expect(readNotification({ pokemon: 150, type: 'sometimes' })).toBeUndefined();
    expect(readNotification({ pokemon: 0, type: 'both' })).toBeUndefined();
    expect(readNotification({ pokemon: -99, type: 'raid' })).toBeUndefined();
  });

  it('reads back what the codec writes, with the scope it stored', () => {
    for (const target of [species(1), tier('T5', true), tier('Elite'), PERFECT, ZERO]) {
      for (const scope of ['raid', 'spawn', 'both'] as const) {
        const stored = encodeNotification(target, scope);
        expect(readNotification(stored)).toEqual({ target, scope: stored.type });
      }
    }
  });
});

describe('notificationTiers', () => {
  it('lists the tiers with a code: ordinary first, then elite, the shadow tiers', () => {
    expect(notificationTiers().map(raidTierLabel)).toEqual([
      'T1',
      'T3',
      'T5',
      'Mega',
      'Mega Legendary',
      'Super Mega',
      'Elite',
      'Shadow T1',
      'Shadow T3',
      'Shadow T5',
    ]);
    for (const listed of notificationTiers()) {
      expect(isNotificationTier(listed)).toBe(true);
      expect(() => encodeNotification({ kind: 'tier', tier: listed }, 'raid')).not.toThrow();
    }
    expect(isNotificationTier({ level: 'Mega', shadow: true })).toBe(false);
  });
});

describe('sameNotificationTarget', () => {
  it('tells targets apart by what they are for', () => {
    expect(sameNotificationTarget(species(150), species(150))).toBe(true);
    expect(sameNotificationTarget(species(150), species(151))).toBe(false);
    expect(sameNotificationTarget(tier('T5'), tier('T5'))).toBe(true);
    expect(sameNotificationTarget(tier('T5'), tier('T5', true))).toBe(false);
    expect(sameNotificationTarget(PERFECT, ZERO)).toBe(false);
    expect(sameNotificationTarget(PERFECT, tier('MegaLegendary'))).toBe(false);
    expect(sameNotificationTarget(PERFECT, PERFECT)).toBe(true);
  });
});

describe('want tokens', () => {
  it('names every target and is read back', () => {
    const all = [
      species(150),
      species(1025),
      PERFECT,
      ZERO,
      ...notificationTiers().map((listed): NotificationTarget => ({ kind: 'tier', tier: listed })),
    ];
    for (const target of all) expect(parseWantToken(wantToken(target))).toEqual(target);
    expect(wantToken(species(150))).toBe('pokemon:150');
    expect(wantToken(tier('T5'))).toBe('tier:T5');
    expect(wantToken(tier('T5', true))).toBe('tier:T5:shadow');
    expect(wantToken(tier('MegaLegendary'))).toBe('tier:MegaLegendary');
    expect(wantToken(PERFECT)).toBe('iv:perfect');
    expect(wantToken(ZERO)).toBe('iv:zero');
  });

  it('is unique per target', () => {
    const tokens = notificationTiers().map((listed) => wantToken({ kind: 'tier', tier: listed }));
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('names one form, and the shadow raids of a species or of a form', () => {
    expect(wantToken(form(487, 'giratina_origin'))).toBe('pokemon:487:giratina_origin');
    expect(wantToken(shadowOf(645))).toBe('pokemon:645::shadow');
    expect(wantToken(shadowOf(645, 'landorus_therian'))).toBe(
      'pokemon:645:landorus_therian:shadow',
    );
    expect(parseWantToken('pokemon:487:giratina_origin')).toStrictEqual(
      form(487, 'giratina_origin'),
    );
    expect(parseWantToken(' pokemon:645::shadow ')).toStrictEqual(shadowOf(645));
    expect(parseWantToken('pokemon:645:landorus_therian:shadow')).toStrictEqual(
      shadowOf(645, 'landorus_therian'),
    );
    // A form called `shadow` would be a form, not the flag: the flag has a place of its own.
    expect(parseWantToken('pokemon:150:shadow')).toStrictEqual(form(150, 'shadow'));
  });

  it('gives every entry of the game data a token that fits a choice and is read back', () => {
    const catalogue = catalogueFixture();
    const tokens = new Set<string>();
    for (const entry of catalogue.all) {
      for (const target of [
        species(entry.dex),
        form(entry.dex, entry.key),
        shadowOf(entry.dex),
        shadowOf(entry.dex, entry.key),
      ]) {
        const token = wantToken(target);
        expect(token.length).toBeLessThanOrEqual(100);
        expect(parseWantToken(token)).toStrictEqual(target);
        tokens.add(token);
      }
    }
    const dexes = new Set(catalogue.all.map((entry) => entry.dex)).size;
    expect(tokens.size).toBe(2 * dexes + 2 * catalogue.all.length);
  });

  it.each([
    '',
    'pokemon',
    'pokemon:',
    'pokemon:0',
    'pokemon:-5',
    'pokemon:1.5',
    'pokemon:150:',
    'pokemon:150::',
    'pokemon:150::Shadow',
    'pokemon:150::shadow:x',
    'pokemon:150:Mewtwo_A',
    'pokemon:150:mewtwo a',
    'pokemon:150:mewtwo_a:raid',
    'pokemon:150:mewtwo_a:shadow:x',
    `pokemon:150:${'a'.repeat(65)}`,
    'pokemon:1234567',
    'pokemon:1234567:mewtwo_a',
    'tier:T5::shadow',
    'iv:perfect::shadow',
    'Pokemon:150',
    'tier:T2',
    'tier:t5',
    'tier:Mega:shadow',
    'tier:T5:Shadow',
    'tier:T5:shadow:x',
    'iv:hundo',
    'iv:perfect:x',
    'mewtwo',
    'e:T5:0',
    'g:12',
  ])('reads %j as no token', (text) => {
    expect(parseWantToken(text)).toBeUndefined();
  });
});

describe('wantWord', () => {
  it.each([
    ['tier 5', tier('T5')],
    ['Tier5', tier('T5')],
    ['t5', tier('T5')],
    ['T 5', tier('T5')],
    ['5', tier('T5')],
    ['level 5', tier('T5')],
    ['5 star', tier('T5')],
    ['5-stars', tier('T5')],
    ['legendary', tier('T5')],
    ['t5 raids', tier('T5')],
    ['tier 5 eggs', tier('T5')],
    ['1', tier('T1')],
    ['tier 3', tier('T3')],
    ['mega', tier('Mega')],
    ['Mega raids', tier('Mega')],
    ['4', tier('Mega')],
    ['mega legendary', tier('MegaLegendary')],
    ['megalegendary', tier('MegaLegendary')],
    ['6', tier('MegaLegendary')],
    ['super mega', tier('SuperMega')],
    ['7', tier('SuperMega')],
    ['elite', tier('Elite')],
    ['shadow 5', tier('T5', true)],
    ['shadow t5', tier('T5', true)],
    ['Shadow Tier 1', tier('T1', true)],
    ['shadow level 3', tier('T3', true)],
    ['shadow legendary', tier('T5', true)],
    ['perfect', PERFECT],
    ['Perfect IV', PERFECT],
    ['hundo', PERFECT],
    ['100', PERFECT],
    ['100%', PERFECT],
    ['perfect spawns', PERFECT],
    ['zero', ZERO],
    ['none', ZERO],
    ['useless', ZERO],
    ['0', ZERO],
    ['0%', ZERO],
    ['zero iv', ZERO],
  ] as const)('reads %j', (text, target) => {
    expect(wantWord(text)).toEqual(target);
  });

  it.each([
    '',
    'raids',
    'shadow',
    'tier',
    'level',
    '2',
    '8',
    't2',
    'tier 9',
    '55',
    '1000',
    'shadow mega',
    'shadow ex',
    'mewtwo',
    'mega charizard',
    'mega mewtwo y',
    'meganium',
    'zeraora',
    'zorua',
    'persian',
    'elekid',
    'exeggutor',
    'houndour',
    'unown',
    'nosepass',
    'tier 5 mewtwo',
    'pe',
    'no',
    // The beginning or a misspelling of a word is not the word (it may begin a Pokemon's name).
    'perf',
    'perfact',
    'exclusiv',
    'exc',
    'zer',
    'zekro',
    'hun',
    'houndo',
    'mega s',
    'mega l',
    'mega legend',
    'level 50',
    '1000 iv',
  ])('reads %j as no tier or IV word', (text) => {
    expect(wantWord(text)).toBeUndefined();
  });
});

describe('wantWordGuesses', () => {
  it('offers the word a text names in full, alone', () => {
    expect(wantWordGuesses('t5')).toEqual([tier('T5')]);
    expect(wantWordGuesses('hundo')).toEqual([PERFECT]);
  });

  it('offers what a beginning or a misspelling may mean, three at most', () => {
    expect(wantWordGuesses('perf')).toEqual([PERFECT]);
    expect(wantWordGuesses('perfact')).toEqual([PERFECT]);
    expect(wantWordGuesses('elit')).toEqual([tier('Elite')]);
    // The words of the EX tier, which is gone, name and begin nothing.
    for (const text of ['ex', 'EX raid', 'exclusive', 'exclusiv']) {
      expect(wantWord(text), text).toBeUndefined();
      expect(wantWordGuesses(text), text).toEqual([]);
    }
    expect(wantWordGuesses('mega l')).toContainEqual(tier('MegaLegendary'));
    expect(wantWordGuesses('shadow').length).toBe(3);
    expect(wantWordGuesses('mewtwo')).toEqual([]);
    expect(wantWordGuesses('')).toEqual([]);
  });
});

describe('wantWord against every Pokemon', () => {
  it('reads no beginning of any name, key or curated nickname as a tier or IV word', () => {
    const catalogue = catalogueFixture();
    const texts = new Set<string>();
    for (const entry of catalogue.all) {
      const names = [
        entry.name,
        entry.key.replace(/_/g, ' '),
        ...(CURATED_NICKNAMES[entry.key] ?? []),
      ];
      for (const name of names) {
        const lower = name.toLowerCase();
        for (let end = 1; end <= lower.length; end++) texts.add(lower.slice(0, end));
      }
    }
    expect(texts.size).toBeGreaterThan(10_000);
    // Only what is a tier's own word in full, which members type for the tier: `mega` begins
    // Meganium and every Mega's name. A longer beginning is the Pokemon. (`ex` was the EX
    // tier's word, and now only begins Exeggcute.)
    const read = [...texts]
      .filter((text) => wantWord(text) !== undefined)
      .map((text) => text.trim());
    expect([...new Set(read)].sort()).toEqual(['mega']);
  });
});

describe('readWantText', () => {
  const catalogue = catalogueFixture();
  const pokemon = pokemonFixture({ catalogue });
  const finder = wantSpeciesFinder(catalogue, pokemon);

  it('takes a token as what it names', () => {
    expect(readWantText('pokemon:150', finder)).toEqual({ kind: 'target', target: species(150) });
    expect(readWantText(' tier:T5:shadow ', finder)).toEqual({
      kind: 'target',
      target: tier('T5', true),
    });
    expect(readWantText('iv:zero', finder)).toEqual({ kind: 'target', target: ZERO });
  });

  it('says that the Pokémon of a token is gone when the game data does not have it', () => {
    expect(readWantText('pokemon:99999', finder)).toEqual({ kind: 'gone' });
  });

  it('reads a tier or IV word before any Pokémon', () => {
    expect(readWantText('t5', finder)).toEqual({ kind: 'target', target: tier('T5') });
    expect(readWantText('hundo', finder)).toEqual({ kind: 'target', target: PERFECT });
    expect(readWantText('none', finder)).toEqual({ kind: 'target', target: ZERO });
  });

  const read = (text: string, own = false) => {
    const answer = readWantText(text, finder, { own });
    return answer.kind === 'target' ? answer.target : answer.kind;
  };

  it('takes the name of a species as the want for every form of it', () => {
    expect(read('Mewtwo')).toStrictEqual(species(150));
    expect(read('charizard')).toStrictEqual(species(6));
    expect(read('dratini')).toStrictEqual(species(147));
    // The search knows Giratina by the form it is known by; its name is the species all the same.
    expect(pokemon.exact('giratina')?.key).toBe('giratina_altered');
    expect(read('giratina')).toStrictEqual(species(487));
    expect(read('Giratina (every form)')).toStrictEqual(species(487));
    expect(read('hoopa')).toStrictEqual(species(720));
  });

  it('takes the name of one form or mega as the want for that form', () => {
    expect(read('mega charizard y')).toStrictEqual(form(6, 'charizard_mega_y'));
    expect(read('alolan rattata')).toStrictEqual(form(19, 'rattata_alola'));
    expect(read('Giratina Origin')).toStrictEqual(form(487, 'giratina_origin'));
    expect(read('Giratina (Origin Forme)')).toStrictEqual(form(487, 'giratina_origin'));
    expect(read('giratina altered')).toStrictEqual(form(487, 'giratina_altered'));
    expect(read('armored mewtwo')).toStrictEqual(form(150, 'mewtwo_a'));
    expect(read('hoopa unbound')).toStrictEqual(form(720, 'hoopa_unbound'));
    // `(every form)` after the name of a form names nothing.
    expect(read('Giratina Origin (every form)')).toBe('unknown');
  });

  it('takes a nickname of an entry that is called as its species as the species', () => {
    const [nickname] = Object.entries(CURATED_NICKNAMES).flatMap(([key, names]) => {
      const entry = catalogue.byKey(key);
      const called =
        entry?.kind === 'species' &&
        catalogue.byDex(entry.dex).length > 1 &&
        entry.name === speciesNameOf(catalogue, entry.dex);
      return called ? names.filter((name) => pokemon.exact(name)?.key === key) : [];
    });
    expect(nickname).toBeDefined();
    const entry = pokemon.exact(nickname ?? '');
    expect(read(nickname ?? '')).toStrictEqual(species(entry?.dex ?? 0));
  });

  it('takes `shadow` before a name as the want for its shadow raids', () => {
    expect(read('shadow landorus')).toStrictEqual(shadowOf(645));
    expect(read('Shadow Dratini')).toStrictEqual(shadowOf(147));
    expect(read('shadow giratina origin')).toStrictEqual(shadowOf(487, 'giratina_origin'));
    expect(read('Shadow Landorus (Therian Forme)')).toStrictEqual(
      shadowOf(645, 'landorus_therian'),
    );
    // With a tier it stays the shadow tier, and alone it is nothing.
    expect(read('shadow 5')).toStrictEqual(tier('T5', true));
    expect(read('shadow legendary')).toStrictEqual(tier('T5', true));
    expect(read('shadow')).toBe('unknown');
    // Nothing is guessed behind the word either.
    expect(read('shadow landoru')).toBe('unknown');
    expect(read('shadow a')).toBe('unknown');
    expect(read('landorus shadow')).toBe('unknown');
  });

  it('takes a token for a form as the game data knows it, and says when it does not', () => {
    expect(read('pokemon:487:giratina_origin')).toStrictEqual(form(487, 'giratina_origin'));
    expect(read('pokemon:645::shadow')).toStrictEqual(shadowOf(645));
    expect(read('pokemon:645:landorus_therian:shadow')).toStrictEqual(
      shadowOf(645, 'landorus_therian'),
    );
    // An alias is stored as the key of the entry it stands for.
    expect(catalogue.byKey('giratina')?.key).toBe('giratina_altered');
    expect(read('pokemon:487:giratina')).toStrictEqual(form(487, 'giratina_altered'));
    // A form the game data does not have, or has for another species.
    expect(read('pokemon:487:giratina_sky')).toBe('gone');
    expect(read('pokemon:6:giratina_origin')).toBe('gone');
    expect(read('pokemon:99999::shadow')).toBe('gone');
    // A want the member has is taken as it stands.
    expect(read('pokemon:487:giratina_sky', true)).toStrictEqual(form(487, 'giratina_sky'));
    expect(read('pokemon:99999::shadow', true)).toStrictEqual(shadowOf(99999));
  });

  it('finds a species by its name when several of its entries answer to it', () => {
    // The search itself knows no one entry called Unown.
    expect(pokemon.exact('unown')).toBeUndefined();
    expect(readWantText('Unown', finder)).toEqual({ kind: 'target', target: species(201) });
    expect(readWantText('nidoran', finder).kind).toBe('unknown');
  });

  it('never acts on a near miss: it suggests species, each once, five at most', () => {
    const answer = readWantText('mewtw', finder);
    expect(answer.kind).toBe('unknown');
    if (answer.kind !== 'unknown') return;
    expect(answer.suggestions).toContain(150);
    expect(answer.suggestions.length).toBeLessThanOrEqual(5);
    expect(new Set(answer.suggestions).size).toBe(answer.suggestions.length);
    const forms = readWantText('charizar', finder);
    expect(forms).toEqual({ kind: 'unknown', words: [], suggestions: [6] });
  });

  it('acts on neither one letter nor nothing, and suggests nothing for them', () => {
    expect(readWantText('a', finder)).toEqual({ kind: 'unknown', words: [], suggestions: [] });
    expect(readWantText('  ', finder)).toEqual({ kind: 'unknown', words: [], suggestions: [] });
    expect(readWantText('!?', finder)).toEqual({ kind: 'unknown', words: [], suggestions: [] });
  });

  it('suggests the shadow tiers and no Pokémon for the bare word shadow', () => {
    const tiers = [tier('T1', true), tier('T3', true), tier('T5', true)];
    for (const typed of ['shadow', ' Shadow ', 'shadow raids', 'shadow raid eggs']) {
      expect(readWantText(typed, finder)).toEqual({
        kind: 'unknown',
        words: tiers,
        suggestions: [],
      });
    }
  });

  it('offers the tier or IV word a text begins or misspells, and does not act on it', () => {
    expect(readWantText('perf', finder)).toMatchObject({ kind: 'unknown', words: [PERFECT] });
    const zer = readWantText('zer', finder);
    expect(zer).toMatchObject({ kind: 'unknown', words: [ZERO] });
    if (zer.kind === 'unknown') expect(zer.suggestions.length).toBeGreaterThan(0);
  });

  it('reads a want of the member’s own list whatever the game data knows', () => {
    const own = { own: true };
    expect(readWantText('pokemon:99999', finder, own)).toEqual({
      kind: 'target',
      target: species(99999),
    });
    expect(readWantText('Pokémon #99999', finder, own)).toEqual({
      kind: 'target',
      target: species(99999),
    });
    expect(readWantText('Mewtwo (raids and spawns)', finder, own)).toEqual({
      kind: 'target',
      target: species(150),
    });
    expect(readWantText('pikachu (Raids)', finder, own)).toEqual({
      kind: 'target',
      target: species(25),
    });
    expect(readWantText('T5 raids', finder, own)).toEqual({ kind: 'target', target: tier('T5') });
    // Not for a new want: the label of another list means nothing there.
    expect(readWantText('Pokémon #99999', finder).kind).toBe('unknown');
    // The bound of the codec: a number above it is no row that could be removed.
    expect(readWantText('Pokémon #999999', finder, own)).toMatchObject({ kind: 'target' });
    expect(readWantText('pokemon:999999', finder, own)).toMatchObject({ kind: 'target' });
    expect(readWantText('Pokémon #1000000', finder, own).kind).toBe('unknown');
    expect(readWantText('pokemon:1000000', finder, own).kind).toBe('unknown');
  });

  it('does not take a Pokédex number for a Pokémon', () => {
    const answer = readWantText('25', finder);
    expect(answer.kind).toBe('unknown');
  });

  it('suggests nothing for a text no Pokémon is near', () => {
    expect(readWantText('qqqqzzzz', finder)).toEqual({
      kind: 'unknown',
      words: [],
      suggestions: [],
    });
  });
});

describe('speciesNameOf', () => {
  const catalogue = catalogueFixture();

  it('names a species, not the form it is known by', () => {
    expect(speciesNameOf(catalogue, 150)).toBe('Mewtwo');
    expect(speciesNameOf(catalogue, 487)).toBe('Giratina');
    expect(speciesNameOf(catalogue, 720)).toBe('Hoopa');
    expect(speciesNameOf(catalogue, 201)).toBe('Unown');
    expect(speciesNameOf(catalogue, 99999)).toBeUndefined();
  });
});

describe('readWants', () => {
  it('reads each target once, in the order of the rows, and counts what it cannot read', () => {
    expect(
      readWants([
        { pokemon: 150, type: 'Both' },
        { pokemon: -5, type: 'raid' },
        { pokemon: -5, type: 'spawn' },
        { pokemon: -6, type: 'both' },
        { pokemon: 0, type: 'both' },
        { pokemon: 3, type: 'never' },
        { pokemon: -8, type: 'spawn' },
      ]),
    ).toEqual({
      wants: [
        { target: species(150), scope: 'both' },
        { target: tier('T5'), scope: 'raid' },
        { target: PERFECT, scope: 'spawn' },
        { target: ZERO, scope: 'spawn' },
      ],
      unreadable: 3,
    });
  });

  it('reads several rows for one species as one want in every scope they have', () => {
    expect(
      readWants([
        { pokemon: 150, type: 'raid' },
        { pokemon: 150, type: 'spawn' },
        { pokemon: 151, type: 'raid' },
        { pokemon: 151, type: 'Raid' },
      ]).wants,
    ).toEqual([
      { target: species(150), scope: 'both' },
      { target: species(151), scope: 'raid' },
    ]);
  });

  it('keeps the two meanings of -6 apart', () => {
    expect(
      readWants([
        { pokemon: -6, type: 'raid' },
        { pokemon: -6, type: 'spawn' },
      ]).wants,
    ).toEqual([
      { target: tier('MegaLegendary'), scope: 'raid' },
      { target: PERFECT, scope: 'spawn' },
    ]);
  });
});

describe('costumed wants (plan 8R-4)', () => {
  it('reads a costumed row as a costumed want, and plain rows of one target over costumed ones', () => {
    expect(readWants([{ pokemon: 25, type: 'raid', costumed: true }]).wants).toEqual([
      { target: species(25), scope: 'raid', costumed: true },
    ]);
    // Rows of one target that disagree: the plain one wins, as the wider scope does.
    expect(
      readWants([
        { pokemon: 25, type: 'raid', costumed: true },
        { pokemon: 25, type: 'spawn' },
      ]).wants,
    ).toEqual([{ target: species(25), scope: 'both' }]);
    expect(
      readWants([
        { pokemon: 25, type: 'raid', costumed: true },
        { pokemon: 25, type: 'spawn', costumed: true },
      ]).wants,
    ).toEqual([{ target: species(25), scope: 'both', costumed: true }]);
  });

  it('never reads a tier or an IV want as costumed', () => {
    expect(readWants([{ pokemon: -5, type: 'raid', costumed: true }]).wants).toEqual([
      { target: tier('T5'), scope: 'raid' },
    ]);
  });

  it('writes the costume of a want, and rewrites a row whose costume changes', () => {
    expect(planSetWant([], species(25), 'raid', undefined, true)).toEqual({
      outcome: { kind: 'added', want: { target: species(25), scope: 'raid', costumed: true } },
      insert: { pokemon: 25, type: 'raid', ...NONE, costumed: true },
      update: undefined,
      remove: [],
    });
    const costumedRow = { id: 3, pokemon: 25, type: 'raid', costumed: true };
    expect(planSetWant([costumedRow], species(25), 'raid')).toMatchObject({
      update: { id: 3, values: { pokemon: 25, type: 'raid', ...NONE } },
    });
    expect(planSetWant([costumedRow], species(25), 'raid', undefined, true)).toMatchObject({
      outcome: { kind: 'unchanged' },
      update: undefined,
    });
  });
});

describe('planSetWant', () => {
  it('adds a row for a target that has none', () => {
    expect(planSetWant([{ id: 1, pokemon: 151, type: 'both' }], species(150), 'raid')).toEqual({
      outcome: { kind: 'added', want: { target: species(150), scope: 'raid' } },
      insert: { pokemon: 150, type: 'raid', ...NONE },
      update: undefined,
      remove: [],
    });
  });

  it('stores a tier as raid and an IV target as spawn, whatever was asked', () => {
    expect(planSetWant([], tier('T5'), 'both')).toMatchObject({
      outcome: { kind: 'added', want: { scope: 'raid' } },
      insert: { pokemon: -5, type: 'raid' },
    });
    expect(planSetWant([], PERFECT, 'raid')).toMatchObject({
      outcome: { kind: 'added', want: { scope: 'spawn' } },
      insert: { pokemon: -6, type: 'spawn' },
    });
  });

  it('changes the scope of the row a target has', () => {
    expect(planSetWant([{ id: 7, pokemon: 150, type: 'Raid' }], species(150), 'both')).toEqual({
      outcome: { kind: 'changed', want: { target: species(150), scope: 'both' }, before: 'raid' },
      insert: undefined,
      update: { id: 7, values: { pokemon: 150, type: 'both', ...NONE } },
      remove: [],
    });
  });

  it('writes nothing for a row that says the same in other letters', () => {
    expect(planSetWant([{ id: 7, pokemon: 150, type: 'BOTH' }], species(150), 'both')).toEqual({
      outcome: { kind: 'unchanged', want: { target: species(150), scope: 'both' } },
      insert: undefined,
      update: undefined,
      remove: [],
    });
    // The perfect-IV want of 2019, typed `both`.
    expect(planSetWant([{ id: 8, pokemon: -6, type: 'both' }], PERFECT, 'both')).toMatchObject({
      outcome: { kind: 'unchanged' },
      insert: undefined,
      update: undefined,
      remove: [],
    });
  });

  it('keeps the oldest of several rows for one target and removes the others', () => {
    const rows = [
      { id: 9, pokemon: 150, type: 'spawn' },
      { id: 4, pokemon: 150, type: 'raid' },
      { id: 5, pokemon: 151, type: 'raid' },
    ];
    // Together they were a want for both already.
    expect(planSetWant(rows, species(150), 'both')).toEqual({
      outcome: { kind: 'unchanged', want: { target: species(150), scope: 'both' } },
      insert: undefined,
      update: { id: 4, values: { pokemon: 150, type: 'both', ...NONE } },
      remove: [9],
    });
    expect(planSetWant(rows, species(150), 'raid')).toEqual({
      outcome: { kind: 'changed', want: { target: species(150), scope: 'raid' }, before: 'both' },
      insert: undefined,
      update: undefined,
      remove: [9],
    });
  });

  it('adds the mega legendary tier beside a perfect-IV want with the same number', () => {
    const rows = [{ id: 1, pokemon: -6, type: 'both' }];
    expect(planSetWant(rows, tier('MegaLegendary'), 'raid')).toMatchObject({
      outcome: { kind: 'added' },
      insert: { pokemon: -6, type: 'raid' },
      remove: [],
    });
  });

  it('leaves rows it cannot read alone', () => {
    const rows = [{ id: 1, pokemon: -5, type: 'spawn' }];
    expect(planSetWant(rows, tier('T5'), 'raid')).toMatchObject({
      outcome: { kind: 'added' },
      insert: { pokemon: -5, type: 'raid' },
      update: undefined,
      remove: [],
    });
  });
});

describe('rowsOfWant', () => {
  it('finds every row of a target, and no row that cannot be read', () => {
    const rows = [
      { id: 1, pokemon: 150, type: 'raid' },
      { id: 2, pokemon: 150, type: 'Spawn' },
      { id: 3, pokemon: 150, type: 'whenever' },
      { id: 4, pokemon: -6, type: 'both' },
      { id: 5, pokemon: -6, type: 'raid' },
    ];
    expect(rowsOfWant(rows, species(150))).toEqual([1, 2]);
    expect(rowsOfWant(rows, PERFECT)).toEqual([4]);
    expect(rowsOfWant(rows, tier('MegaLegendary'))).toEqual([5]);
    expect(rowsOfWant(rows, ZERO)).toEqual([]);
  });
});

describe('entryWant, typedEntryWant', () => {
  const catalogue = catalogueFixture();
  const entry = (key: string) => {
    const found = catalogue.byKey(key);
    if (!found) throw new Error(`no ${key} in the fixture`);
    return found;
  };

  it('gives an entry picked from a list its own form, unless it is all there is of its species', () => {
    expect(entryWant(catalogue, entry('giratina_origin'))).toStrictEqual(
      form(487, 'giratina_origin'),
    );
    expect(entryWant(catalogue, entry('charizard'))).toStrictEqual(form(6, 'charizard'));
    expect(entryWant(catalogue, entry('charizard_mega_y'))).toStrictEqual(
      form(6, 'charizard_mega_y'),
    );
    expect(entryWant(catalogue, entry('dratini'))).toStrictEqual(species(147));
  });

  it('gives an entry named in text its form, unless it is called as its species is', () => {
    expect(typedEntryWant(catalogue, entry('rattata_alola'), 'alolan rattata')).toStrictEqual(
      form(19, 'rattata_alola'),
    );
    // Not the species' own entry: a nickname of it is the form too.
    expect(typedEntryWant(catalogue, entry('rattata_alola'), 'purple rat')).toStrictEqual(
      form(19, 'rattata_alola'),
    );
    expect(typedEntryWant(catalogue, entry('charizard'), 'charizard')).toStrictEqual(species(6));
    expect(typedEntryWant(catalogue, entry('charizard'), 'zard')).toStrictEqual(species(6));
    expect(typedEntryWant(catalogue, entry('dratini'), 'dratini')).toStrictEqual(species(147));
  });

  it('takes the species entry that is a named form for that form only by its own name or key', () => {
    const altered = entry('giratina_altered');
    for (const text of [
      'Giratina (Altered Forme)',
      'giratina altered',
      'altered giratina',
      'giratina_altered',
      'altered',
      'Altered Forme',
    ]) {
      expect(typedEntryWant(catalogue, altered, text), text).toStrictEqual(
        form(487, 'giratina_altered'),
      );
    }
    // Anything else that led to it is a nickname of the species.
    for (const text of ['tina', 'giratina', 'forme', 'ghost dragon', 'giratina tina']) {
      expect(typedEntryWant(catalogue, altered, text), text).toStrictEqual(species(487));
    }
    expect(typedEntryWant(catalogue, entry('hoopa_confined'), 'hoopa confined')).toStrictEqual(
      form(720, 'hoopa_confined'),
    );
    expect(typedEntryWant(catalogue, entry('hoopa_confined'), 'hoops')).toStrictEqual(species(720));
  });
});

describe('readWantText with a nickname of a species known by a named form', () => {
  const catalogue = catalogueFixture();
  // Moderators' nicknames, as `PokemonRepository.nicknames()` gives them.
  const nicknames = mergeNicknames(catalogue, CURATED_NICKNAMES, {
    giratina_altered: ['tina'],
    landorus_incarnate: ['lando'],
  });
  const search = new PokemonSearch(catalogue, nicknames);
  const finder = wantSpeciesFinder(catalogue, search);
  const read = (text: string) => {
    const answer = readWantText(text, finder);
    return answer.kind === 'target' ? answer.target : answer.kind;
  };

  it('reads the nickname as the species, plain and after shadow', () => {
    expect(search.exact('tina')?.key).toBe('giratina_altered');
    expect(read('tina')).toStrictEqual(species(487));
    expect(read('Tina raids')).toStrictEqual(species(487));
    expect(read('shadow tina')).toStrictEqual(shadowOf(487));
    expect(read('lando')).toStrictEqual(species(645));
    expect(read('shadow lando')).toStrictEqual(shadowOf(645));
  });

  it('still reads the name of the default form as that form', () => {
    expect(read('giratina altered')).toStrictEqual(form(487, 'giratina_altered'));
    expect(read('shadow landorus incarnate')).toStrictEqual(shadowOf(645, 'landorus_incarnate'));
  });
});

describe('readWantText: filler words, the base form, and what follows shadow', () => {
  const catalogue = catalogueFixture();
  const finder = wantSpeciesFinder(catalogue, pokemonFixture({ catalogue }));
  const read = (text: string, own = false) => {
    const answer = readWantText(text, finder, { own });
    return answer.kind === 'target' ? answer.target : answer;
  };

  it('reads a Pokémon whatever of raids, eggs or spawns follows its name', () => {
    expect(read('lugia raids')).toStrictEqual(species(249));
    expect(read('Lugia raid')).toStrictEqual(species(249));
    expect(read('shadow lugia raids')).toStrictEqual(shadowOf(249));
    expect(read('dratini spawns')).toStrictEqual(species(147));
    expect(read('giratina origin raid eggs')).toStrictEqual(form(487, 'giratina_origin'));
    expect(read('t5 raids')).toStrictEqual(tier('T5'));
    // The word alone, or with nothing it could follow, names nothing.
    expect(read('raids')).toMatchObject({ kind: 'unknown' });
    expect(read('lugi raids')).toMatchObject({ kind: 'unknown', suggestions: [249] });
  });

  it('reads the base form of a species by those words', () => {
    expect(read('charizard base form')).toStrictEqual(form(6, 'charizard'));
    expect(read('Charizard (base form)')).toStrictEqual(form(6, 'charizard'));
    expect(read('shadow rattata base form')).toStrictEqual(shadowOf(19, 'rattata'));
    expect(read('Charizard (base form) · raids', true)).toStrictEqual(form(6, 'charizard'));
    // A species whose own entry is a named form, or that is one entry, has no such form.
    expect(read('giratina base form')).toMatchObject({ kind: 'unknown' });
    expect(read('dratini base form')).toMatchObject({ kind: 'unknown' });
  });

  it('reads a label of the member’s own list with the scope after a dot or in brackets', () => {
    expect(read('Mewtwo (every form) · raids and spawns', true)).toStrictEqual(species(150));
    expect(read('Mewtwo (every form) (raids)', true)).toStrictEqual(species(150));
    expect(read('Giratina (Origin Forme) · spawns', true)).toStrictEqual(
      form(487, 'giratina_origin'),
    );
    // A scope typed for a new want is read past as well: it says nothing of the type.
    for (const text of [
      'Mewtwo · raids',
      'Mewtwo · raids and spawns',
      'Mewtwo (every form) · raids',
      'Mewtwo (raids)',
      'mewtwo (Raids and Spawns)',
    ]) {
      expect(read(text), text).toStrictEqual(species(150));
    }
    expect(read('Giratina (Origin Forme) · spawns')).toStrictEqual(form(487, 'giratina_origin'));
  });

  it('suggests the shadow raids of what a misspelt name after shadow may be', () => {
    expect(read('shadow mewtw')).toEqual({
      kind: 'unknown',
      words: [],
      suggestions: [150],
      shadow: true,
    });
    // Nothing near the rest: what the whole text is near, as ever.
    const nothing = read('shadow qqqqzzzz');
    expect(nothing).toEqual({ kind: 'unknown', words: [], suggestions: [] });
    expect(read('mewtw')).toMatchObject({ kind: 'unknown', suggestions: [150] });
    expect(read('mewtw')).not.toHaveProperty('shadow');
  });

  it('takes a token for the one entry of a species as the species', () => {
    expect(read('pokemon:147:dratini')).toStrictEqual(species(147));
    expect(read('pokemon:147:dratini:shadow')).toStrictEqual(shadowOf(147));
    expect(read('pokemon:6:charizard')).toStrictEqual(form(6, 'charizard'));
    // A want the member has is taken as it stands.
    expect(read('pokemon:147:dratini', true)).toStrictEqual(form(147, 'dratini'));
  });
});

describe('readWantText: a name that ends in a filler word', () => {
  const catalogue = catalogueFixture();
  const nicknames = mergeNicknames(catalogue, CURATED_NICKNAMES, { togepi: ['bad egg'] });
  const finder = wantSpeciesFinder(catalogue, new PokemonSearch(catalogue, nicknames));
  const read = (text: string) => {
    const answer = readWantText(text, finder);
    return answer.kind === 'target' ? answer.target : answer.kind;
  };

  it('reads the whole text as a name before it takes the word off', () => {
    expect(read('bad egg')).toStrictEqual(species(175));
    expect(read('bad egg raids')).toStrictEqual(species(175));
    expect(read('shadow bad egg')).toStrictEqual(shadowOf(175));
    expect(read('bad')).toBe('unknown');
  });
});

describe('a want named by an older key of its entry', () => {
  const catalogue = catalogueFixture();
  const reader = formReader(() => catalogue);
  const older = form(487, 'giratina');
  const altered = form(487, 'giratina_altered');
  const rows = [{ id: 1, pokemon: 487, type: 'raid', form: 'giratina' }];

  it('finds the rows of the entry, whichever key they hold', () => {
    expect(rowsOfWant(rows, older, reader)).toEqual([1]);
    expect(
      rowsOfWant([{ id: 2, pokemon: 487, type: 'raid', form: 'giratina_altered' }], older, reader),
    ).toEqual([2]);
  });

  it('is set as the want of the entry: no second row, and the key of today', () => {
    expect(planSetWant(rows, older, 'spawn', reader)).toEqual({
      outcome: { kind: 'changed', want: { target: altered, scope: 'spawn' }, before: 'raid' },
      insert: undefined,
      update: {
        id: 1,
        values: { pokemon: 487, type: 'spawn', form: 'giratina_altered', shadow: false },
      },
      remove: [],
    });
    expect(planSetWant([], older, 'raid', reader).insert).toEqual({
      pokemon: 487,
      type: 'raid',
      form: 'giratina_altered',
      shadow: false,
    });
  });
});

describe('forms as the game data reads them', () => {
  const catalogue = catalogueFixture();
  const reader = formReader(() => catalogue);

  it('reads a stored key as the key of the entry it stands for, and says what is a mega', () => {
    expect(reader(487, 'giratina_origin')).toEqual({ key: 'giratina_origin', mega: false });
    // An alias: the bare id of a species known by its default form.
    expect(reader(487, 'giratina')).toEqual({ key: 'giratina_altered', mega: false });
    expect(reader(6, 'charizard_mega_y')).toEqual({ key: 'charizard_mega_y', mega: true });
    // What the game data does not have, or has for another species, is read as it stands.
    expect(reader(487, 'giratina_sky')).toEqual({ key: 'giratina_sky', mega: false });
    expect(reader(487, 'charizard_mega_y')).toEqual({ key: 'charizard_mega_y', mega: false });
    expect(formAsStored(487, 'giratina')).toEqual({ key: 'giratina', mega: false });
  });

  it('says what can only be about raids: a tier, shadow raids and a mega', () => {
    expect(raidsOnly(tier('T5'), reader)).toBe(true);
    expect(raidsOnly(shadowOf(645), reader)).toBe(true);
    expect(raidsOnly(form(6, 'charizard_mega_y'), reader)).toBe(true);
    expect(raidsOnly(form(6, 'charizard'), reader)).toBe(false);
    expect(raidsOnly(species(6), reader)).toBe(false);
    expect(raidsOnly(PERFECT, reader)).toBe(false);
  });

  it('reads a row for a mega as raids whatever its type says', () => {
    for (const type of ['both', 'spawn', 'raid', 'Both']) {
      expect(readWant({ pokemon: 6, type, form: 'charizard_mega_y' }, reader)).toEqual({
        target: form(6, 'charizard_mega_y'),
        scope: 'raid',
      });
    }
    expect(readWant({ pokemon: 6, type: 'both', form: 'charizard' }, reader)?.scope).toBe('both');
    expect(readWant({ pokemon: -5, type: 'spawn' }, reader)).toBeUndefined();
  });

  it('reads two rows whose forms are two keys of one entry as one want', () => {
    const rows = [
      { id: 1, pokemon: 487, type: 'raid', form: 'giratina', shadow: false },
      { id: 2, pokemon: 487, type: 'spawn', form: 'giratina_altered', shadow: false },
      { id: 3, pokemon: 487, type: 'raid', form: null, shadow: false },
    ];
    expect(readWants(rows, reader).wants).toEqual([
      { target: form(487, 'giratina_altered'), scope: 'both' },
      { target: species(487), scope: 'raid' },
    ]);
    expect(rowsOfWant(rows, form(487, 'giratina_altered'), reader)).toEqual([1, 2]);
    // Without the game data they are two.
    expect(readWants(rows).wants).toHaveLength(3);
  });

  it('writes the key of today when a want is set whose row holds an older key', () => {
    const altered = form(487, 'giratina_altered');
    const values = { pokemon: 487, type: 'raid', form: 'giratina_altered', shadow: false };
    // The same scope: unchanged for the member, and the row gets its key all the same.
    expect(
      planSetWant(
        [{ id: 1, pokemon: 487, type: 'raid', form: 'giratina' }],
        altered,
        'raid',
        reader,
      ),
    ).toEqual({
      outcome: { kind: 'unchanged', want: { target: altered, scope: 'raid' } },
      insert: undefined,
      update: { id: 1, values },
      remove: [],
    });
    // Both keys: the oldest row stays, under the key of today.
    const rows = [
      { id: 1, pokemon: 487, type: 'raid', form: 'giratina' },
      { id: 2, pokemon: 487, type: 'raid', form: 'giratina_altered' },
    ];
    expect(planSetWant(rows, altered, 'raid', reader)).toMatchObject({
      outcome: { kind: 'unchanged' },
      update: { id: 1, values },
      remove: [2],
    });
    // A row that holds the key already, in other letters, is left alone.
    expect(
      planSetWant(
        [{ id: 1, pokemon: 487, type: 'Raid', form: 'Giratina_Altered' }],
        altered,
        'raid',
        reader,
      ).update,
    ).toBeUndefined();
  });

  it('stores a mega as raid whatever is asked, and leaves a row that says otherwise', () => {
    const megaY = form(6, 'charizard_mega_y');
    for (const scope of ['both', 'spawn', 'raid'] as const) {
      expect(planSetWant([], megaY, scope, reader)).toEqual({
        outcome: { kind: 'added', want: { target: megaY, scope: 'raid' } },
        insert: { pokemon: 6, type: 'raid', form: 'charizard_mega_y', shadow: false },
        update: undefined,
        remove: [],
      });
    }
    // An older row typed `both` means raids already: nothing to write.
    const rows = [{ id: 3, pokemon: 6, type: 'both', form: 'charizard_mega_y' }];
    expect(planSetWant(rows, megaY, 'spawn', reader)).toEqual({
      outcome: { kind: 'unchanged', want: { target: megaY, scope: 'raid' } },
      insert: undefined,
      update: undefined,
      remove: [],
    });
  });
});

describe('pokemonWantName', () => {
  const catalogue = catalogueFixture();
  const name = (target: ReturnType<typeof pokemonTarget>) => pokemonWantName(catalogue, target);
  const listed = (target: ReturnType<typeof pokemonTarget>) =>
    pokemonWantName(catalogue, target, { everyForm: true });

  it('calls a species by its name, and in a list says when that is every form', () => {
    expect(name(pokemonTarget(487))).toBe('Giratina');
    expect(listed(pokemonTarget(487))).toBe('Giratina (every form)');
    expect(listed(pokemonTarget(6))).toBe('Charizard (every form)');
    // All there is of Dratini is Dratini.
    expect(listed(pokemonTarget(147))).toBe('Dratini');
    expect(listed(pokemonTarget(99999))).toBe('Pokémon #99999');
  });

  it('puts Costumed before a costumed want, which of every form needs no "(every form)"', () => {
    const costumed = (target: ReturnType<typeof pokemonTarget>) =>
      pokemonWantName(catalogue, target, { everyForm: true, costumed: true });
    expect(costumed(pokemonTarget(25))).toBe('Costumed Pikachu');
    expect(costumed(form(222, 'corsola_galarian'))).toBe('Costumed Galarian Corsola');
    expect(costumed(pokemonTarget(222))).toBe('Costumed Corsola');
    expect(wantTargetLabel(catalogue, pokemonTarget(25), true)).toBe('Costumed Pikachu');
    expect(wantTargetLabel(catalogue, tier('T5'), true)).toBe('T5 raids');
  });

  it('calls a form by the name of its entry', () => {
    expect(name(form(487, 'giratina_origin'))).toBe('Giratina (Origin Forme)');
    expect(listed(form(487, 'giratina_origin'))).toBe('Giratina (Origin Forme)');
    expect(listed(form(6, 'charizard_mega_y'))).toBe('Mega Charizard Y');
    expect(listed(form(19, 'rattata_alola'))).toBe('Alolan Rattata');
    // The entry that is called as its species is: never to be taken for the species.
    expect(listed(form(6, 'charizard'))).toBe('Charizard (base form)');
    expect(name(form(6, 'charizard'))).toBe('Charizard (base form)');
    expect(listed(form(19, 'rattata'))).toBe('Rattata (base form)');
    expect(listed(shadowOf(19, 'rattata'))).toBe('Shadow Rattata (base form)');
    // The species entry that is a named form keeps its name; an alias is named as its entry.
    expect(listed(form(487, 'giratina_altered'))).toBe('Giratina (Altered Forme)');
    expect(listed(form(487, 'giratina'))).toBe('Giratina (Altered Forme)');
    // All there is of a species is no base form of anything.
    expect(listed(form(147, 'dratini'))).toBe('Dratini');
  });

  it('calls a form the game data does not have by its species and the key', () => {
    expect(listed(form(487, 'giratina_sky'))).toBe('Giratina (giratina_sky)');
    // A key of another species is no form of this one.
    expect(listed(form(487, 'charizard_mega_y'))).toBe('Giratina (charizard_mega_y)');
    expect(listed(form(99999, 'missingno_glitch'))).toBe('Pokémon #99999 (missingno_glitch)');
  });

  it('puts Shadow before the shadow raids of a species or a form', () => {
    expect(name(shadowOf(645))).toBe('Shadow Landorus');
    expect(listed(shadowOf(645))).toBe('Shadow Landorus');
    expect(listed(shadowOf(645, 'landorus_therian'))).toBe('Shadow Landorus (Therian Forme)');
    expect(listed(shadowOf(147))).toBe('Shadow Dratini');
  });
});

describe('pokemonWantFits', () => {
  const catalogue = catalogueFixture();
  const entry = (key: string) => catalogue.byKey(key);

  it('fits a want for a species to every entry with its Pokédex number', () => {
    for (const key of ['giratina_altered', 'giratina_origin']) {
      expect(pokemonWantFits(catalogue, pokemonTarget(487), entry(key), false)).toBe(true);
      expect(pokemonWantFits(catalogue, pokemonTarget(487), entry(key), true)).toBe(true);
    }
    expect(pokemonWantFits(catalogue, pokemonTarget(6), entry('charizard_mega_y'), false)).toBe(
      true,
    );
    expect(pokemonWantFits(catalogue, pokemonTarget(487), entry('charizard'), false)).toBe(false);
  });

  it('fits a want for a form only to the entry with that key', () => {
    const origin = form(487, 'giratina_origin');
    expect(pokemonWantFits(catalogue, origin, entry('giratina_origin'), false)).toBe(true);
    expect(pokemonWantFits(catalogue, origin, entry('giratina_origin'), true)).toBe(true);
    expect(pokemonWantFits(catalogue, origin, entry('giratina_altered'), false)).toBe(false);
    expect(pokemonWantFits(catalogue, form(6, 'charizard'), entry('charizard_mega_x'), false)).toBe(
      false,
    );
    // A stored key that is an alias today fits the entry it stands for, and no other.
    expect(
      pokemonWantFits(catalogue, form(487, 'giratina'), entry('giratina_altered'), false),
    ).toBe(true);
    expect(pokemonWantFits(catalogue, form(487, 'giratina'), entry('giratina_origin'), false)).toBe(
      false,
    );
    // A key of another species is no form of this one.
    expect(pokemonWantFits(catalogue, form(6, 'giratina_origin'), entry('charizard'), false)).toBe(
      false,
    );
    // A form the game data has lost fits nothing.
    expect(
      pokemonWantFits(catalogue, form(487, 'giratina_sky'), entry('giratina_origin'), false),
    ).toBe(false);
  });

  it('fits a want for shadow raids only to a shadow raid', () => {
    expect(pokemonWantFits(catalogue, shadowOf(645), entry('landorus_incarnate'), true)).toBe(true);
    expect(pokemonWantFits(catalogue, shadowOf(645), entry('landorus_therian'), true)).toBe(true);
    expect(pokemonWantFits(catalogue, shadowOf(645), entry('landorus_incarnate'), false)).toBe(
      false,
    );
    expect(
      pokemonWantFits(
        catalogue,
        shadowOf(645, 'landorus_therian'),
        entry('landorus_therian'),
        true,
      ),
    ).toBe(true);
    expect(
      pokemonWantFits(
        catalogue,
        shadowOf(645, 'landorus_therian'),
        entry('landorus_incarnate'),
        true,
      ),
    ).toBe(false);
  });

  it('fits no want to a boss the game data does not know', () => {
    expect(pokemonWantFits(catalogue, pokemonTarget(487), undefined, false)).toBe(false);
    expect(pokemonWantFits(catalogue, shadowOf(487), undefined, true)).toBe(false);
  });
});

describe('wants for one form and for shadow raids, as rows', () => {
  const origin = form(487, 'giratina_origin');

  it('reads a species, one form of it and its shadow raids as wants side by side', () => {
    const rows = [
      { pokemon: 487, type: 'both', form: null, shadow: false },
      { pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: false },
      { pokemon: 487, type: 'both', form: null, shadow: true },
      { pokemon: 487, type: 'spawn', form: 'giratina_sky', shadow: false },
      { pokemon: 487, type: 'raid', form: 'Origin Forme', shadow: false },
    ];
    expect(readWants(rows)).toEqual({
      wants: [
        { target: species(487), scope: 'both' },
        { target: origin, scope: 'raid' },
        { target: shadowOf(487), scope: 'raid' },
        // A form the game data may not have: a want all the same.
        { target: form(487, 'giratina_sky'), scope: 'spawn' },
      ],
      unreadable: 1,
    });
  });

  it('reads several rows as one want only when species, form and flag are the same', () => {
    const rows = [
      { pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: false },
      { pokemon: 487, type: 'spawn', form: 'GIRATINA_ORIGIN', shadow: false },
      { pokemon: 487, type: 'spawn', form: null, shadow: false },
      { pokemon: 487, type: 'spawn', form: 'giratina_origin', shadow: true },
    ];
    expect(readWants(rows).wants).toEqual([
      { target: origin, scope: 'both' },
      { target: species(487), scope: 'spawn' },
      { target: shadowOf(487, 'giratina_origin'), scope: 'raid' },
    ]);
  });

  it('adds a row for a form beside the row of its species, with the form in it', () => {
    const rows = [{ id: 1, pokemon: 487, type: 'both', ...NONE }];
    expect(planSetWant(rows, origin, 'raid')).toEqual({
      outcome: { kind: 'added', want: { target: origin, scope: 'raid' } },
      insert: { pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: false },
      update: undefined,
      remove: [],
    });
    expect(planSetWant(rows, shadowOf(487), 'both')).toEqual({
      outcome: { kind: 'added', want: { target: shadowOf(487), scope: 'raid' } },
      insert: { pokemon: 487, type: 'raid', form: null, shadow: true },
      update: undefined,
      remove: [],
    });
  });

  it('changes and tidies only the rows of the very target that is set', () => {
    const rows = [
      { id: 1, pokemon: 487, type: 'both', ...NONE },
      { id: 2, pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: false },
      { id: 3, pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: false },
      { id: 4, pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: true },
    ];
    expect(planSetWant(rows, origin, 'spawn')).toEqual({
      outcome: { kind: 'changed', want: { target: origin, scope: 'spawn' }, before: 'raid' },
      insert: undefined,
      update: {
        id: 2,
        values: { pokemon: 487, type: 'spawn', form: 'giratina_origin', shadow: false },
      },
      remove: [3],
    });
    // Shadow raids are raids whatever is asked: nothing to change.
    expect(planSetWant(rows, shadowOf(487, 'giratina_origin'), 'spawn')).toEqual({
      outcome: {
        kind: 'unchanged',
        want: { target: shadowOf(487, 'giratina_origin'), scope: 'raid' },
      },
      insert: undefined,
      update: undefined,
      remove: [],
    });
  });

  it('finds the rows of one target and no others of its species', () => {
    const rows = [
      { id: 1, pokemon: 487, type: 'both', ...NONE },
      { id: 2, pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: false },
      { id: 3, pokemon: 487, type: 'raid', form: null, shadow: true },
      { id: 4, pokemon: 487, type: 'raid', form: 'giratina_sky', shadow: false },
      { id: 5, pokemon: 487, type: 'spawn', form: ' Giratina_Origin', shadow: false },
    ];
    expect(rowsOfWant(rows, species(487))).toEqual([1]);
    expect(rowsOfWant(rows, origin)).toEqual([2, 5]);
    expect(rowsOfWant(rows, shadowOf(487))).toEqual([3]);
    expect(rowsOfWant(rows, form(487, 'giratina_sky'))).toEqual([4]);
    expect(rowsOfWant(rows, shadowOf(487, 'giratina_origin'))).toEqual([]);
  });
});

describe('wantsByMember', () => {
  const ALICE = '312345678901234567';
  const BOB = '312345678901234568';
  const CAROL = '312345678901234569';
  const reader = formReader(() => catalogueFixture());

  it('reads the rows of each member as their wants, in the order of the first rows', () => {
    const found = wantsByMember(
      [
        { memberId: BOB, pokemon: -5, type: 'raid' },
        { memberId: ALICE, pokemon: 487, type: 'Both' },
        { memberId: BOB, pokemon: 487, type: 'raid', form: 'giratina_origin' },
        { memberId: ALICE, pokemon: 487, type: 'raid', shadow: true },
      ],
      reader,
    );
    expect(found).toEqual([
      {
        memberId: BOB,
        wants: [
          { target: tier('T5'), scope: 'raid' },
          { target: form(487, 'giratina_origin'), scope: 'raid' },
        ],
      },
      {
        memberId: ALICE,
        wants: [
          { target: species(487), scope: 'both' },
          { target: shadowOf(487), scope: 'raid' },
        ],
      },
    ]);
  });

  it('reads a row found by -6 as what it means, not as a tier because of its number', () => {
    const found = wantsByMember([
      { memberId: ALICE, pokemon: -6, type: 'both' },
      { memberId: BOB, pokemon: -6, type: 'raid' },
      { memberId: CAROL, pokemon: -6, type: 'spawn' },
    ]);
    expect(found).toEqual([
      { memberId: ALICE, wants: [{ target: PERFECT, scope: 'spawn' }] },
      { memberId: BOB, wants: [{ target: tier('MegaLegendary'), scope: 'raid' }] },
      { memberId: CAROL, wants: [{ target: PERFECT, scope: 'spawn' }] },
    ]);
  });

  it('makes one want of duplicate rows, reads an older key as the entry of today, a mega as raids', () => {
    const found = wantsByMember(
      [
        { memberId: ALICE, pokemon: 150, type: 'raid' },
        { memberId: ALICE, pokemon: 150, type: 'spawn' },
        { memberId: ALICE, pokemon: 487, type: 'both', form: 'giratina' },
        { memberId: ALICE, pokemon: 6, type: 'both', form: 'charizard_mega_y' },
      ],
      reader,
    );
    expect(found).toEqual([
      {
        memberId: ALICE,
        wants: [
          { target: species(150), scope: 'both' },
          { target: form(487, 'giratina_altered'), scope: 'both' },
          { target: form(6, 'charizard_mega_y'), scope: 'raid' },
        ],
      },
    ]);
  });

  it('leaves out a member none of whose rows can be read, and is empty for no rows', () => {
    expect(
      wantsByMember([
        { memberId: ALICE, pokemon: -7, type: 'spawn' },
        { memberId: BOB, pokemon: 150, type: 'nonsense' },
        { memberId: CAROL, pokemon: 1, type: 'raid' },
        { memberId: CAROL, pokemon: 0, type: 'raid' },
      ]),
    ).toEqual([{ memberId: CAROL, wants: [{ target: species(1), scope: 'raid' }] }]);
    expect(wantsByMember([])).toEqual([]);
  });
});
