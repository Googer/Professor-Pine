import { describe, expect, it } from 'vitest';
import { catalogueFixture, gameDataFixture } from '../../../test/support/game-data.js';
import { readRaidBossFeed } from '../../../test/support/raid-bosses.js';
import { PokemonCatalogue } from './catalogue.js';
import { feedLookup } from './feed-lookup.js';
import {
  howIdentified,
  identifyBoss,
  isCostumeForm,
  parseRaidBossFeed,
  type FeedLookup,
} from './raid-boss-feed.js';
import { diffFeed, effectiveBosses, resolveBoss, type BossOverride } from './raid-bosses.js';
import { RAID_LEVELS, raidTier } from './raid-tier.js';

const lookup = feedLookup(catalogueFixture());
const ICONS = 'https://cdn.leekduck.com/assets/img/pokemon_icons/';

/** A look-up that knows nothing: every boss is listed by what the feed says. */
const NOTHING: FeedLookup = {
  speciesId: () => undefined,
  findByName: () => undefined,
  speciesName: () => undefined,
  kindOf: () => undefined,
  keyOf: () => undefined,
};

function raid(name: string, tier: string, file?: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    tier,
    canBeShiny: false,
    ...(file === undefined ? {} : { image: `${ICONS}${file}` }),
    ...extra,
  };
}

function parse(entries: unknown, using: FeedLookup = lookup) {
  return parseRaidBossFeed(entries, using);
}

function summary(entries: unknown, using: FeedLookup = lookup): string[] {
  return parse(entries, using).bosses.map(
    (b) => `${b.tier.shadow ? 'shadow ' : ''}${b.tier.level} ${b.pokemonId}/${b.form ?? '-'}`,
  );
}

describe('parseRaidBossFeed: the feed as downloaded', () => {
  const { bosses, unknownLevels } = parse(readRaidBossFeed());

  it('lists the 14 bosses with ids, tier, shadow and shiny flags, name and picture', () => {
    expect(unknownLevels).toEqual([]);
    expect(
      bosses.map((b) => [
        b.pokemonId,
        b.form,
        b.tier.level,
        b.tier.shadow,
        b.shiny,
        b.name,
        b.image?.slice(ICONS.length),
      ]),
    ).toEqual([
      [
        'PIKACHU',
        'PIKACHU_GLASS_HELMET_2026',
        'T1',
        false,
        true,
        'Astronaut Pikachu',
        'pm25.fGLASS_HELMET_2026.icon.png',
      ],
      ['STARMIE', null, 'T3', false, true, 'Starmie', 'pm121.icon.png'],
      ['UMBREON', null, 'T3', false, true, 'Umbreon', 'pm197.icon.png'],
      ['GOTHITELLE', null, 'T3', false, true, 'Gothitelle', 'pm576.icon.png'],
      ['YVELTAL', null, 'T5', false, true, 'Yveltal', 'pm717.icon.png'],
      ['BLASTOISE', 'BLASTOISE_MEGA', 'Mega', false, true, 'Mega Blastoise', 'pm9.fMEGA.icon.png'],
      ['GASTLY', null, 'T1', true, true, 'Gastly', 'pm92.icon.png'],
      ['TOTODILE', null, 'T1', true, true, 'Totodile', 'pm158.icon.png'],
      ['SHIELDON', null, 'T1', true, true, 'Shieldon', 'pm410.icon.png'],
      ['GIBLE', null, 'T1', true, true, 'Gible', 'pm443.icon.png'],
      ['PRIMEAPE', null, 'T3', true, true, 'Primeape', 'pm57.icon.png'],
      ['KIRLIA', null, 'T3', true, true, 'Kirlia', 'pm281.icon.png'],
      ['DRAPION', null, 'T3', true, true, 'Drapion', 'pm452.icon.png'],
      [
        'LANDORUS',
        'LANDORUS_INCARNATE',
        'T5',
        true,
        true,
        'Landorus (Incarnate)',
        'pm645.fINCARNATE.icon.png',
      ],
    ]);
  });

  it('gives every boss a tier that exists and a cdn.leekduck.com picture', () => {
    for (const { tier, pokemonId, image } of bosses) {
      expect(raidTier(tier.level, tier.shadow), pokemonId).toEqual(tier);
      expect(image).toMatch(/^https:\/\/cdn\.leekduck\.com\/.+\.png$/);
    }
  });
});

describe('parseRaidBossFeed: identity from the picture', () => {
  it('reads the species from the number and the form from the form part', () => {
    expect(
      summary([
        raid('Landorus (Incarnate)', '5-Star Raids', 'pm645.fINCARNATE.icon.png'),
        raid('Mega Charizard X', 'Mega Raids', 'pm6.fMEGA_X.icon.png'),
        raid('Yveltal', '5-Star Raids', 'pm717.icon.png'),
      ]),
    ).toEqual([
      'T5 LANDORUS/LANDORUS_INCARNATE',
      'Mega CHARIZARD/CHARIZARD_MEGA_X',
      'T5 YVELTAL/-',
    ]);
  });

  it('reads a picture with a costume, a shiny and a generation part as the plain species', () => {
    expect(
      summary([
        raid('Yveltal', '5-Star Raids', 'pm717.c1234.icon.png'),
        raid('Mewtwo', '5-Star Raids', 'pm150.s.g2.icon.png'),
      ]),
    ).toEqual(['T5 YVELTAL/-', 'T5 MEWTWO/-']);
  });

  it('does not place a boss whose name is not the species of its picture', () => {
    expect(summary([raid('Some Other Name', '5-Star Raids', 'pm717.icon.png')])).toEqual([
      'T5 SOME_OTHER_NAME/-',
    ]);
  });

  it.each([
    ['the old scheme', 'pokemon_icon_717_11.png'],
    ['no file name', ''],
    ['an unknown part', 'pm717.xyz.icon.png'],
    ['no icon part', 'pm717.png'],
    ['an unknown number', 'pm9999.icon.png'],
    ['a form part in lower case', 'pm717.fmega.icon.png'],
  ])('falls back to the name for %s', (_what, file) => {
    expect(summary([raid('Yveltal', '5-Star Raids', file)])).toEqual(['T5 YVELTAL/-']);
  });

  it('falls back to the name when there is no picture or the address is unusable', () => {
    expect(summary([raid('Yveltal', '5-Star Raids')])).toEqual(['T5 YVELTAL/-']);
    expect(summary([{ name: 'Yveltal', tier: '5-Star Raids', image: 42 }])).toEqual([
      'T5 YVELTAL/-',
    ]);
  });

  it('takes the form of a mega found by name too', () => {
    expect(summary([raid('Mega Charizard X', 'Mega Raids')])).toEqual([
      'Mega CHARIZARD/CHARIZARD_MEGA_X',
    ]);
  });

  it('strips the Shadow prefix before looking a name up', () => {
    expect(summary([raid('Shadow Yveltal', '5-Star Raids')])).toEqual(['shadow T5 YVELTAL/-']);
  });

  it('finds a form by its short name when the picture is no help', () => {
    expect(summary([raid('Shadow Landorus (Incarnate)', '5-Star Raids')])).toEqual([
      'shadow T5 LANDORUS/LANDORUS_INCARNATE',
    ]);
  });

  it('lists a boss that neither the picture nor the name identifies, under an id made of its name', () => {
    const { bosses } = parse([
      raid('Newmon-X (Dusk Form)', '5-Star Raids', 'pm9999.icon.png'),
      raid('Shadow Zzz Mon', '3-Star Raids'),
    ]);
    expect(bosses.map((b) => [b.pokemonId, b.form, b.name, b.tier.shadow])).toEqual([
      ['NEWMON_X_DUSK_FORM', null, 'Newmon-X (Dusk Form)', false],
      ['ZZZ_MON', null, 'Zzz Mon', true],
    ]);
  });

  it('makes an id that starts with a letter, with at most 64 characters', () => {
    const { bosses } = parse([
      raid('007 Agent', '5-Star Raids'),
      raid(`Q${'x'.repeat(90)}`, '5-Star Raids'),
    ]);
    expect(bosses[0]?.pokemonId).toBe('AGENT');
    expect(bosses[1]?.pokemonId).toMatch(/^Q[X]{63}$/);
  });

  it('skips a boss whose name has no letter to make an id of', () => {
    expect(summary([raid('1234', '5-Star Raids'), raid('Yveltal', '5-Star Raids')])).toEqual([
      'T5 YVELTAL/-',
    ]);
  });
});

describe('parseRaidBossFeed: shadow', () => {
  it('reads the prefix in any case and removes it from the name', () => {
    const { bosses } = parse([
      raid('Shadow Gastly', '1-Star Raids', 'pm92.icon.png'),
      raid('SHADOW totodile', '1-Star Raids', 'pm158.icon.png'),
      raid('shadow   Gible', '1-Star Raids', 'pm443.icon.png'),
    ]);
    expect(bosses.map((b) => [b.tier.shadow, b.name])).toEqual([
      [true, 'Gastly'],
      [true, 'totodile'],
      [true, 'Gible'],
    ]);
  });

  it('does not take a name that merely starts with the letters', () => {
    const { bosses } = parse([raid('Shadowmon', '1-Star Raids')], NOTHING);
    expect(bosses[0]).toMatchObject({ name: 'Shadowmon', tier: { shadow: false } });
  });

  it('keeps a name that is only Shadow as an ordinary boss called Shadow', () => {
    const { bosses } = parse([raid('Shadow', '1-Star Raids')], NOTHING);
    expect(bosses[0]).toMatchObject({
      pokemonId: 'SHADOW',
      name: 'Shadow',
      tier: { shadow: false },
    });
  });

  it.each(['Shadow 5-Star Raids', '5-Star Shadow Raids', 'shadow 5-star'])(
    'counts a heading that says shadow itself: %s',
    (heading) => {
      expect(summary([raid('Yveltal', heading, 'pm717.icon.png')])).toEqual([
        'shadow T5 YVELTAL/-',
      ]);
    },
  );

  it('reports a shadow name under a level without shadow raids and leaves the boss out', () => {
    const result = parse([
      raid('Shadow Blastoise', 'Mega Raids', 'pm9.fMEGA.icon.png'),
      raid('Yveltal', '5-Star Raids'),
    ]);
    expect(result.bosses.map((b) => b.pokemonId)).toEqual(['YVELTAL']);
    expect(result.unknownLevels).toEqual(['Shadow under Mega Raids']);
    expect(result.skipped).toBe(1);
  });

  it('reports a shadow heading over a level without shadow raids', () => {
    const result = parse([raid('Blastoise', 'Shadow Mega Raids'), raid('Yveltal', '5-Star Raids')]);
    expect(result.bosses.map((b) => b.pokemonId)).toEqual(['YVELTAL']);
    expect(result.unknownLevels).toEqual(['Shadow Mega Raids']);
  });
});

describe('parseRaidBossFeed: headings', () => {
  it.each([
    ['1-Star Raids', 'T1'],
    ['3-Star Raids', 'T3'],
    ['5-Star Raids', 'T5'],
    ['  5-STAR   raids ', 'T5'],
    ['5-Star Raid', 'T5'],
    ['5-Star', 'T5'],
    ['Tier 1', 'T1'],
    ['tier 3 raids', 'T3'],
    ['Tier 5', 'T5'],
    ['Ultra Beast Raids', 'T5'],
    ['Mega Raids', 'Mega'],
    ['mega', 'Mega'],
    ['Mega Legendary Raids', 'MegaLegendary'],
    ['Legendary Mega Raids', 'MegaLegendary'],
    ['Primal Raids', 'MegaLegendary'],
    ['Super Mega Raids', 'SuperMega'],
    ['Elite Raids', 'Elite'],
  ])('reads the heading %j as %s', (heading, level) => {
    const { bosses, unknownLevels } = parse([raid('Yveltal', heading, 'pm717.icon.png')]);
    expect(unknownLevels).toEqual([]);
    expect(bosses.map((b) => b.tier)).toEqual([{ level, shadow: false }]);
  });

  it('gives each boss its own tier object', () => {
    const { bosses } = parse([raid('Yveltal', '5-Star Raids'), raid('Xerneas', '5-Star Raids')]);
    expect(bosses[0]?.tier).not.toBe(bosses[1]?.tier);
  });

  it('only gives tiers that exist', () => {
    const { bosses } = parse(
      ['1-Star', '3-Star', '5-Star', 'Mega', 'Mega Legendary', 'Super Mega', 'Elite'].map(
        (heading, index) => raid(`Boss ${index}`, heading),
      ),
    );
    expect(bosses.map((b) => b.tier.level)).toEqual([...RAID_LEVELS]);
  });

  it.each([
    ['Shadow Raids'],
    ['Mythical Raids'],
    ['6-Star Raids'],
    ['Raids'],
    [''],
    ['   '],
    ['Mega Elite Raids'],
    // The EX tier is gone (plan 4F): its heading is one Pine does not know, like any other.
    ['EX Raids'],
    ['ex'],
    ['Exclusive Raids'],
  ])('leaves out the bosses of the heading %j and reports it', (heading) => {
    const result = parse([raid('Rayquaza', heading), raid('Yveltal', '5-Star Raids')]);
    expect(result.bosses.map((b) => b.pokemonId)).toEqual(['YVELTAL']);
    expect(result.unknownLevels).toEqual([heading.trim().replace(/\s+/g, ' ')]);
  });

  it('reports each unknown heading once, whatever the number of its bosses', () => {
    const result = parse([
      raid('A', 'New Raids'),
      raid('B', 'New Raids'),
      raid('C', 'Other Raids'),
      raid('Yveltal', '5-Star Raids'),
    ]);
    expect(result.unknownLevels).toEqual(['New Raids', 'Other Raids']);
  });

  it('reports at most ten unknown headings, each cut to forty characters', () => {
    const entries = [raid('Yveltal', '5-Star Raids'), raid('Mew', 'x'.repeat(100))];
    for (let index = 0; index < 11; index += 1) entries.push(raid('Mew', `New ${index}`));
    const { unknownLevels } = parse(entries);
    expect(unknownLevels).toHaveLength(10);
    expect(unknownLevels[0]).toBe('x'.repeat(40));
    expect(unknownLevels.every((key) => key.length <= 40)).toBe(true);
  });

  it('turns control characters of a heading into spaces before reporting it', () => {
    const { unknownLevels } = parse([
      raid('Mew', 'New\r\n‮Raids'),
      raid('Yveltal', '5-Star Raids'),
    ]);
    expect(unknownLevels).toEqual(['New Raids']);
  });

  it('reads a very long heading without trouble', () => {
    const { bosses, unknownLevels } = parse([
      raid('Mew', 'a '.repeat(50_000)),
      raid('Yveltal', '5-Star Raids'),
    ]);
    expect(bosses).toHaveLength(1);
    expect(unknownLevels[0]).toHaveLength(40);
  });

  it('does not find a heading on the prototype', () => {
    const result = parse([raid('Mew', 'constructor'), raid('Yveltal', '5-Star Raids')]);
    expect(result.unknownLevels).toEqual(['constructor']);
  });
});

describe('parseRaidBossFeed: costumes and new forms', () => {
  const resolved = (entries: unknown) =>
    effectiveBosses(parse(entries).bosses, [], catalogueFixture(), 0).map(
      (b) => `${b.key}${b.entry ? '' : ' (unknown)'}`,
    );

  it('keeps the form of the picture, and a costume newer than the game master has its species stats', () => {
    const costume = raid('Astronaut Pikachu', '1-Star Raids', 'pm25.fGLASS_HELMET_2026.icon.png');
    expect(parse([costume]).bosses[0]).toMatchObject({
      pokemonId: 'PIKACHU',
      form: 'PIKACHU_GLASS_HELMET_2026',
    });
    expect(resolved([costume])).toEqual(['pikachu']);
  });

  it('keeps a new mega unresolved, whatever the species', () => {
    expect(summary([raid('Mega Pikachu', 'Mega Raids', 'pm25.fMEGA.icon.png')])).toEqual([
      'Mega PIKACHU/PIKACHU_MEGA',
    ]);
    expect(resolved([raid('Mega Pikachu', 'Mega Raids', 'pm25.fMEGA.icon.png')])).toEqual([
      '~pikachu_mega (unknown)',
    ]);
    expect(resolved([raid('Mega Pikachu X', 'Mega Raids', 'pm25.fMEGA_X.icon.png')])).toEqual([
      '~pikachu_mega_x (unknown)',
    ]);
    expect(resolved([raid('Mega Pikachu Y', 'Mega Raids', 'pm25.fMEGA_Y.icon.png')])).toEqual([
      '~pikachu_mega_y (unknown)',
    ]);
    expect(resolved([raid('Primal Pikachu', 'Primal Raids', 'pm25.fPRIMAL.icon.png')])).toEqual([
      '~pikachu_primal (unknown)',
    ]);
  });

  it('keeps a mega of an unknown number unresolved too', () => {
    const mega = raid('Mega Newmon', 'Mega Raids', 'pm9999.fMEGA.icon.png');
    expect(parse([mega]).bosses[0]).toMatchObject({ pokemonId: 'MEGA_NEWMON', form: null });
    expect(resolved([mega])).toEqual(['~mega_newmon (unknown)']);
  });

  it('keeps a new regional form or a form named in its name unresolved', () => {
    expect(resolved([raid('Alolan Pikachu', '3-Star Raids', 'pm25.fALOLA.icon.png')])).toEqual([
      '~pikachu_alola (unknown)',
    ]);
    expect(
      resolved([raid('Pikachu (Cosplay Forme)', '3-Star Raids', 'pm25.fCOSPLAY.icon.png')]),
    ).toEqual(['~pikachu_cosplay (unknown)']);
  });

  it('resolves a form the game master knows to its own entry', () => {
    const therian = raid('Landorus (Therian)', '5-Star Raids', 'pm645.fTHERIAN.icon.png');
    expect(summary([therian])).toEqual(['T5 LANDORUS/LANDORUS_THERIAN']);
    expect(resolved([therian])).toEqual(['landorus_therian']);
  });

  it('merges a costume with the plain species of the same tier into one boss', () => {
    const entries = [
      raid('Pikachu', '1-Star Raids', 'pm25.icon.png'),
      raid('Astronaut Pikachu', '1-Star Raids', 'pm25.fGLASS_HELMET_2026.icon.png', {
        canBeShiny: true,
      }),
    ];
    expect(parse(entries).bosses).toHaveLength(2);
    const merged = effectiveBosses(parse(entries).bosses, [], catalogueFixture(), 0);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ key: 'pikachu', shiny: true });
  });
});

describe('parseRaidBossFeed: duplicates', () => {
  it('keeps a boss listed twice in one tier once, shiny if either entry says so, and in two tiers twice', () => {
    const { bosses } = parse([
      raid('Starmie', '3-Star Raids'),
      raid('Starmie', '3-Star Raids', undefined, { canBeShiny: true }),
      raid('Shadow Starmie', '3-Star Raids'),
      raid('Giratina (Origin Forme)', '5-Star Raids'),
      raid('Giratina (Altered Forme)', '5-Star Raids'),
    ]);
    expect(bosses.map((b) => [b.pokemonId, b.form, b.tier.level, b.tier.shadow, b.shiny])).toEqual([
      ['STARMIE', null, 'T3', false, true],
      ['STARMIE', null, 'T3', true, false],
      ['GIRATINA', 'GIRATINA_ORIGIN', 'T5', false, false],
      ['GIRATINA', 'GIRATINA_ALTERED', 'T5', false, false],
    ]);
  });

  it('keeps a boss listed under two headings of one tier once', () => {
    const { bosses } = parse([
      raid('Nihilego', '5-Star Raids'),
      raid('Nihilego', 'Ultra Beast Raids', undefined, { canBeShiny: true }),
    ]);
    expect(bosses.map((b) => [b.pokemonId, b.tier.level, b.shiny])).toEqual([
      ['NIHILEGO', 'T5', true],
    ]);
  });

  it('takes the picture of the second entry when the first has none', () => {
    const { bosses } = parse([
      raid('Mewtwo', '5-Star Raids'),
      raid('Mewtwo', '5-Star Raids', 'second.png'),
      raid('Mewtwo', '5-Star Raids', 'third.png'),
    ]);
    expect(bosses).toHaveLength(1);
    expect(bosses[0]?.image).toBe(`${ICONS}second.png`);
  });
});

describe('parseRaidBossFeed: names', () => {
  it('trims the name', () => {
    expect(parse([raid(' Mr. Mime ', '1-Star Raids')]).bosses[0]?.name).toBe('Mr. Mime');
  });

  it('turns control and format characters into single spaces', () => {
    const { bosses } = parse([
      raid('Mr.\r\nMime\tGalarian\u0000\u001b​Form‮evil  ok', '1-Star Raids'),
    ]);
    expect(bosses[0]?.name).toBe('Mr. Mime Galarian Form evil ok');
  });

  it('reads Shadow after cleaning the name', () => {
    const { bosses } = parse([raid('Shadow​\tGible', '1-Star Raids', 'pm443.icon.png')]);
    expect(bosses[0]).toMatchObject({ name: 'Gible', tier: { shadow: true } });
  });
});

describe('parseRaidBossFeed: a feed that must not replace the list', () => {
  it.each([
    ['not an object', 'rate limited'],
    ['null', null],
    ['a number', 42],
    ['an object', { graphics: {} }],
    ['the old format', { currentList: { lvl5: [{ id: 'YVELTAL' }] } }],
    ['an empty list', []],
    ['entries that are not objects', [1, 'x', null, [], true]],
    ['entries without a name', [{ tier: '5-Star Raids' }]],
    ['entries without a tier', [{ name: 'Yveltal' }]],
    ['a name that is not text', [{ name: 5, tier: '5-Star Raids' }]],
    ['a tier that is not text', [{ name: 'Yveltal', tier: 5 }]],
  ])('rejects %s', (_what, raw) => {
    expect(() => parse(raw)).toThrow(/raid boss feed is not in the expected format/);
  });

  it('writes the message of a document that is not a list with one space', () => {
    expect(() => parse('rate limited')).toThrow(
      /^The raid boss feed is not in the expected format: \S/,
    );
  });

  it('skips entries that are not usable and reads the rest', () => {
    expect(
      summary([
        1,
        null,
        { name: 'Yveltal' },
        { tier: '5-Star Raids' },
        raid('Mewtwo', '5-Star Raids'),
        raid('  ', '5-Star Raids'),
        raid('​', '5-Star Raids'),
      ]),
    ).toEqual(['T5 MEWTWO/-']);
  });

  it('refuses a feed from which no boss can be read', () => {
    expect(() => parse([raid('Rayquaza', 'Unheard Of')])).toThrow(
      'The raid boss feed lists no bosses',
    );
    expect(() => parse([raid('1234', '5-Star Raids')])).toThrow(
      'The raid boss feed lists no bosses',
    );
  });

  it('rejects a heading with an absurd number of bosses', () => {
    const many = Array.from({ length: 201 }, (_, index) => raid(`Boss ${index}`, '1-Star Raids'));
    expect(() => parse(many)).toThrow(/expected format/);
    expect(() => parse(many.slice(0, 200))).not.toThrow();
  });

  it('counts the limit per heading', () => {
    const a = Array.from({ length: 200 }, (_, index) => raid(`Boss ${index}`, '1-Star Raids'));
    const b = Array.from({ length: 200 }, (_, index) => raid(`Mon ${index}`, '3-Star Raids'));
    expect(parse([...a, ...b]).bosses).toHaveLength(400);
  });

  it('counts the limit per level and shadow flag, whatever the spelling of the heading', () => {
    const a = Array.from({ length: 150 }, (_, index) => raid(`Boss ${index}`, '1-Star Raids'));
    const b = Array.from({ length: 51 }, (_, index) => raid(`Mon ${index}`, 'Tier 1 Raids'));
    expect(() => parse([...a, ...b])).toThrow(/expected format/);
    const shadow = Array.from({ length: 51 }, (_, index) => raid(`Mon ${index}`, 'Shadow 1-Star'));
    expect(parse([...a, ...shadow]).bosses).toHaveLength(201);
  });
});

describe('parseRaidBossFeed: pictures', () => {
  const one = (image: unknown) =>
    parse([{ name: 'Mewtwo', tier: '5-Star Raids', canBeShiny: false, image }], NOTHING).bosses[0];

  it('keeps a plain https address', () => {
    expect(one('https://example.test/pm150.icon.png')?.image).toBe(
      'https://example.test/pm150.icon.png',
    );
    expect(one(`${ICONS}pm150.icon.png`)?.image).toBe(`${ICONS}pm150.icon.png`);
  });

  it('leaves the picture out, and keeps the boss, when the address is not usable', () => {
    const unusable: unknown[] = [
      undefined,
      null,
      42,
      {},
      'http://example.test/pm150.png',
      'javascript:alert(1)',
      'https://example.test/pm 150.png',
      'https://example.test/‮pm150.png',
      `https://example.test/${'a'.repeat(300)}.png`,
      'https://user:pw@example.test/a.png',
      'https://127.0.0.1/a.png',
      'https://localhost:8443/a.png',
      'https://example.test:8443/a.png',
      'https://example.test/a<b.png',
    ];
    for (const image of unusable) {
      const listed = one(image);
      expect(listed).toMatchObject({ name: 'Mewtwo' });
      expect(listed).not.toHaveProperty('image');
    }
  });
});

describe('identifyBoss', () => {
  it('says how a boss was identified: by its picture, by its name, or by neither', () => {
    expect(identifyBoss('Yveltal', `${ICONS}pm717.icon.png`, lookup)).toMatchObject({
      pokemonId: 'YVELTAL',
      via: 'picture',
    });
    expect(identifyBoss('Yveltal', `${ICONS}pokemon_icon_717_11.png`, lookup)).toMatchObject({
      pokemonId: 'YVELTAL',
      via: 'name',
    });
    expect(identifyBoss('Newmon', undefined, lookup)).toMatchObject({
      pokemonId: 'NEWMON',
      via: 'nothing',
    });
    expect(identifyBoss('1234', undefined, lookup)).toBeUndefined();
  });
});

describe('howIdentified', () => {
  const how = (name: string, file?: string) =>
    howIdentified(name, file === undefined ? undefined : `${ICONS}${file}`, lookup).how;

  it('says which of picture and name named the boss, and whether they agree', () => {
    expect(how('Yveltal', 'pm717.icon.png')).toBe('agree');
    expect(how('Zekrom', 'pm717.icon.png')).toBe('disagree');
    expect(how('Newmon', 'pm717.icon.png')).toBe('picture');
    expect(how('Yveltal')).toBe('name');
    expect(how('Newmon')).toBe('neither');
  });

  it('says when the picture shows a form of the named species that the game data lacks', () => {
    expect(how('Pikachu', 'pm25.fNEW_HAT_2099.icon.png')).toBe('new-form');
    expect(how('Yveltal', 'pm25.fNEW_HAT_2099.icon.png')).toBe('disagree');
  });

  it('gives what identifyBoss made of it', () => {
    expect(howIdentified('Zekrom', `${ICONS}pm717.icon.png`, lookup).used).toMatchObject({
      via: 'nothing',
      resolved: undefined,
    });
    expect(howIdentified('Yveltal', undefined, lookup).used).toMatchObject({
      pokemonId: 'YVELTAL',
      via: 'name',
    });
  });
});

/** The boss list of these entries against a catalogue, as keys. */
function resolvedKeys(
  entries: unknown,
  catalogue: PokemonCatalogue = catalogueFixture(),
): string[] {
  return effectiveBosses(parse(entries, feedLookup(catalogue)).bosses, [], catalogue, 0).map(
    (b) => `${b.key}${b.entry ? '' : ' (unknown)'}`,
  );
}

describe('parseRaidBossFeed: a form part that repeats the species', () => {
  it.each([
    ['Unown (U)', 'pm201.fUNOWN_U.icon.png', 'UNOWN_U', 'unown_u'],
    ['Burmy (Plant Cloak)', 'pm412.fBURMY_PLANT.icon.png', 'BURMY_PLANT', 'burmy_plant'],
    [
      'Wormadam (Sandy Cloak)',
      'pm413.fWORMADAM_SANDY.icon.png',
      'WORMADAM_SANDY',
      'wormadam_sandy',
    ],
  ])('takes the form of %s as it stands', (name, file, form, key) => {
    const entries = [raid(name, '3-Star Raids', file)];
    expect(parse(entries).bosses[0]).toMatchObject({ form });
    expect(resolvedKeys(entries)).toEqual([key]);
  });

  it('still puts the species before a form part that does not repeat it', () => {
    expect(summary([raid('Burmy', '3-Star Raids', 'pm412.fSANDY.icon.png')])).toEqual([
      'T3 BURMY/BURMY_SANDY',
    ]);
  });
});

describe('isCostumeForm', () => {
  const costume = (pokemonId: string, form: string, name: string) =>
    isCostumeForm(
      { pokemonId, form: `${pokemonId}_${form}`, name },
      pokemonId.charAt(0) + pokemonId.slice(1).toLowerCase(),
    );

  it('takes a form part with a year or number for a costume', () => {
    expect(costume('PIKACHU', 'GLASS_HELMET_2026', 'Astronaut Pikachu')).toBe(true);
    expect(costume('CORSOLA', 'SPRING_2026', 'Spring Corsola')).toBe(true);
    expect(costume('PIKACHU', 'FLYING_02', 'Flying Pikachu')).toBe(true);
  });

  it.each([
    ['MEGA_Z', 'Mewtwo Z'],
    ['MEGA', 'Mega Mewtwo'],
    ['MEGA_2030', 'Mega Mewtwo'],
    ['PRIMAL', 'Primal Mewtwo'],
    ['PRIMAL_2030', 'Primal Mewtwo'],
    ['ALOLA_2030', 'Mewtwo'],
    ['ALOLAN_2030', 'Mewtwo'],
    ['GALAR_2030', 'Mewtwo'],
    ['GALARIAN_2030', 'Mewtwo'],
    ['HISUI_2030', 'Mewtwo'],
    ['HISUIAN_2030', 'Mewtwo'],
    ['PALDEA_2030', 'Mewtwo'],
    ['PALDEAN_2030', 'Mewtwo'],
    ['WINTER_ALOLA_2030', 'Mewtwo'],
  ])('does not take the form part %s for a costume', (form, name) => {
    expect(costume('MEWTWO', form, name)).toBe(false);
  });

  it.each(['X', 'Y', 'TEN_PERCENT', 'POMPOM', 'FEMALE', 'DMAX', 'COSPLAY', 'MEGA_Z'])(
    'does not take the form part %s, which has no digit, for a costume',
    (form) => {
      expect(costume('MEWTWO', form, 'Mewtwo')).toBe(false);
    },
  );

  it('does not take a costume of a regional form for a costume of the plain species', () => {
    expect(costume('CORSOLA', 'SPRING_2026', 'Galarian Corsola')).toBe(false);
    expect(costume('RAICHU', 'ALOLA_WINTER_2030', 'Alolan Raichu (Holiday)')).toBe(false);
    expect(costume('GROWLITHE', 'WINTER_2030', 'Hisuian Growlithe')).toBe(false);
    expect(costume('TAUROS', 'WINTER_2030', 'Paldean Tauros')).toBe(false);
  });
});

describe('parseRaidBossFeed: costumes do not borrow the stats of another form', () => {
  const withoutCorsolaCostume = () => {
    const data = gameDataFixture();
    return new PokemonCatalogue({
      ...data,
      aliases: Object.fromEntries(
        Object.entries(data.aliases).filter(([alias]) => alias !== 'corsola_spring_2026'),
      ),
    });
  };

  it('still takes Astronaut Pikachu for Pikachu', () => {
    expect(
      resolvedKeys([raid('Astronaut Pikachu', '1-Star Raids', 'pm25.fGLASS_HELMET_2026.icon.png')]),
    ).toEqual(['pikachu']);
  });

  it('resolves a costume of Galarian Corsola the game master does not know to Galarian Corsola', () => {
    const entries = [raid('Galarian Corsola', '3-Star Raids', 'pm222.fSPRING_2026.icon.png')];
    expect(resolvedKeys(entries, withoutCorsolaCostume())).toEqual(['corsola_galarian']);
    expect(resolvedKeys(entries)).toEqual(['corsola_galarian']);
  });

  it('keeps Mewtwo Z of fMEGA_Z unresolved', () => {
    expect(resolvedKeys([raid('Mewtwo Z', 'Mega Raids', 'pm150.fMEGA_Z.icon.png')])).toEqual([
      '~mewtwo_mega_z (unknown)',
    ]);
  });

  it('keeps a form of its own with an unexpected spelling unresolved', () => {
    expect(resolvedKeys([raid('Mewtwo', '5-Star Raids', 'pm150.fTEN_PERCENT.icon.png')])).toEqual([
      '~mewtwo_ten_percent (unknown)',
    ]);
  });
});

describe('parseRaidBossFeed: a picture that names no form', () => {
  it('does not override a name the catalogue knows exactly', () => {
    expect(resolvedKeys([raid('Giratina (Origin)', '5-Star Raids', 'pm487.icon.png')])).toEqual([
      'giratina_origin',
    ]);
    expect(resolvedKeys([raid('Mega Blastoise', 'Mega Raids', 'pm9.icon.png')])).toEqual([
      'blastoise_mega',
    ]);
  });

  it('does not let a name decide for another species', () => {
    expect(summary([raid('Mewtwo', '5-Star Raids', 'pm717.icon.png')])).toEqual([
      'T5 MEWTWO_UNMATCHED/-',
    ]);
  });

  it('does not trust a plain species in a mega raid', () => {
    const entries = [raid('Mega Newmon', 'Mega Raids', 'pm25.icon.png')];
    expect(parse(entries).bosses[0]).toMatchObject({ pokemonId: 'MEGA_NEWMON', form: null });
    expect(resolvedKeys(entries)).toEqual(['~mega_newmon (unknown)']);
    expect(
      resolvedKeys([raid('Mega Newmon', 'Super Mega Raids', 'pm25.fGLASS_HELMET_2026.icon.png')]),
    ).toEqual(['~pikachu_glass_helmet_2026 (unknown)']);
  });

  it('trusts a mega or primal form in a mega raid, known or not', () => {
    expect(resolvedKeys([raid('Mega Charizard X', 'Mega Raids', 'pm6.fMEGA_X.icon.png')])).toEqual([
      'charizard_mega_x',
    ]);
    expect(resolvedKeys([raid('Primal Kyogre', 'Primal Raids', 'pm382.fPRIMAL.icon.png')])).toEqual(
      ['kyogre_primal'],
    );
  });
});

describe('parseRaidBossFeed: Shadow in a name', () => {
  it('does not read the Shadow of Shadow Rider Calyrex as a shadow raid', () => {
    const entries = [raid('Shadow Rider Calyrex', '5-Star Raids', 'pm898.fSHADOW_RIDER.icon.png')];
    expect(parse(entries).bosses[0]).toMatchObject({
      name: 'Shadow Rider Calyrex',
      tier: { level: 'T5', shadow: false },
    });
    expect(resolvedKeys(entries)).toEqual(['calyrex_shadow_rider']);
  });

  it('does not read it as shadow when the lookup knows the whole name, without a picture', () => {
    const knowsIt: FeedLookup = {
      ...lookup,
      findByName: (name) =>
        name === 'Shadow Rider Calyrex'
          ? { pokemonId: 'CALYREX', form: 'CALYREX_SHADOW_RIDER' }
          : lookup.findByName(name),
    };
    const { bosses } = parse([raid('Shadow Rider Calyrex', '5-Star Raids')], knowsIt);
    expect(bosses[0]).toMatchObject({
      form: 'CALYREX_SHADOW_RIDER',
      name: 'Shadow Rider Calyrex',
      tier: { level: 'T5', shadow: false },
    });
  });

  it('still reads Shadow Mewtwo as a shadow boss', () => {
    const { bosses } = parse([raid('Shadow Mewtwo', '5-Star Raids', 'pm150.icon.png')]);
    expect(bosses[0]).toMatchObject({ pokemonId: 'MEWTWO', name: 'Mewtwo' });
    expect(bosses[0]?.tier).toEqual({ level: 'T5', shadow: true });
  });
});

describe('parseRaidBossFeed: ids longer than the columns', () => {
  it('lets the name decide when the form of the picture would be too long', () => {
    const long = `pm25.f${'A'.repeat(200)}.icon.png`;
    const { bosses } = parse([raid('Pikachu', '1-Star Raids', long)]);
    expect(bosses[0]).toMatchObject({ pokemonId: 'PIKACHU', form: null });
  });

  it('keeps a form of 64 characters and refuses one of 65', () => {
    const room = 64 - 'PIKACHU_'.length - 1;
    const fits = parse([raid('Pikachu', '1-Star Raids', `pm25.f${'A'.repeat(room)}1.icon.png`)]);
    expect(fits.bosses[0]?.form).toHaveLength(64);
    const over = parse([
      raid('Pikachu', '1-Star Raids', `pm25.f${'A'.repeat(room + 1)}1.icon.png`),
    ]);
    expect(over.bosses[0]?.form).toBeNull();
  });
});

describe('parseRaidBossFeed: what is left out', () => {
  it.each(['‐', '‑', '‒', '–', '—', '―', '−'])(
    'reads the dash %j in a heading as a hyphen',
    (dash) => {
      const result = parse([raid('Yveltal', `5${dash}Star Raids`, 'pm717.icon.png')]);
      expect(result.unknownLevels).toEqual([]);
      expect(result.bosses[0]?.tier.level).toBe('T5');
    },
  );

  it('counts what it skipped', () => {
    const result = parse([
      raid('Yveltal', '5-Star Raids'),
      raid('Mew', 'New Raids'),
      raid('Celebi', 'New Raids'),
      raid('1234', '5-Star Raids'),
      raid('  ', '5-Star Raids'),
      raid('Shadow Blastoise', 'Mega Raids'),
      { name: 'Mewtwo' },
      5,
    ]);
    expect(result.bosses).toHaveLength(1);
    expect(result.skipped).toBe(7);
  });

  it('reports no skipped entry for a feed that is read whole', () => {
    expect(parse(readRaidBossFeed()).skipped).toBe(0);
  });

  it('does not refuse a feed for the number of entries under a heading it does not know', () => {
    const many = Array.from({ length: 500 }, (_, index) => raid(`Boss ${index}`, 'New Raids'));
    const result = parse([...many, raid('Yveltal', '5-Star Raids')]);
    expect(result.bosses).toHaveLength(1);
    expect(result.skipped).toBe(500);
    expect(result.unknownLevels).toEqual(['New Raids']);
  });
});

describe('a boss is identified only when picture and name agree', () => {
  const withoutCorsolaCostume = () => {
    const data = gameDataFixture();
    return new PokemonCatalogue({
      ...data,
      aliases: Object.fromEntries(
        Object.entries(data.aliases).filter(([alias]) => alias !== 'corsola_spring_2026'),
      ),
    });
  };

  // [name, heading, picture file, keys the boss list resolves to]
  it.each([
    ['Giratina (Origin)', '5-Star Raids', 'pm487.fWINTER_2030', ['giratina_origin']],
    ['Landorus (Therian)', '5-Star Raids', 'pm645.fWINTER_2030', ['landorus_therian']],
    ['Deoxys (Attack Forme)', '5-Star Raids', 'pm386.fHALLOWEEN_2030', ['deoxys_attack']],
    ['Deoxys (Attack)', '5-Star Raids', 'pm386.fATTACK_2030', ['deoxys_attack']],
    ['Dusk Mane Necrozma', '5-Star Raids', 'pm800.fSUMMER_2030', ['necrozma_dusk_mane']],
    ['Kyurem (Black)', '5-Star Raids', 'pm646.f2030', ['kyurem_black']],
    ['Armored Mewtwo', '5-Star Raids', 'pm150.fA_2030', ['mewtwo_a']],
    ['Galarian Darmanitan', '5-Star Raids', 'pm555', ['~galarian_darmanitan (unknown)']],
    ['Paldean Tauros', '3-Star Raids', 'pm128', ['~paldean_tauros (unknown)']],
    ['Shadow Rider Calyrex', '5-Star Raids', 'pm898', ['calyrex_shadow_rider']],
    ['Shadow Rider Calyrex', '5-Star Raids', 'pm898.fSHADOW_RIDER', ['calyrex_shadow_rider']],
    ['Shadow Mewtwo', '5-Star Raids', 'pm150.fSHADOW', ['~mewtwo_shadow (unknown)']],
    ['Shadow Lugia', '5-Star Raids', 'pm249.fSHADOW_2030', ['lugia']],
    ['Astronaut Pikachu', '1-Star Raids', 'pm25.fGLASS_HELMET_2026', ['pikachu']],
    ['Galarian Corsola', '3-Star Raids', 'pm222.fSPRING_2026', ['corsola_galarian']],
    [
      'Alolan Raichu (Holiday)',
      '3-Star Raids',
      'pm26.fALOLA_WINTER_2030',
      ['~raichu_alola_winter_2030 (unknown)'],
    ],
    ['Mewtwo', '5-Star Raids', 'pm717', ['~mewtwo_unmatched (unknown)']],
    ['Mewtwo Z', 'Mega Raids', 'pm150.fMEGA_Z', ['~mewtwo_mega_z (unknown)']],
    ['Giratina (Origin)', '5-Star Raids', 'pm487', ['giratina_origin']],
    ['Mega Blastoise', 'Mega Raids', 'pm9', ['blastoise_mega']],
    ['Mega Newmon', 'Mega Raids', 'pm25', ['~mega_newmon (unknown)']],
    ['Unown U', '3-Star Raids', 'pm201.fUNOWN_U', ['unown_u']],
  ])('%s with %s of %s', (name, heading, file, keys) => {
    expect(resolvedKeys([raid(name, heading, `${file}.icon.png`)])).toEqual(keys);
  });

  it('resolves a costume of Galarian Corsola with a catalogue that lacks the alias too', () => {
    const entries = [raid('Galarian Corsola', '3-Star Raids', 'pm222.fSPRING_2026.icon.png')];
    expect(resolvedKeys(entries, withoutCorsolaCostume())).toEqual(['corsola_galarian']);
  });

  it('reads Shadow Rider Calyrex as an ordinary tier 5 boss and the other Shadows as shadow', () => {
    const tierOf = (name: string, file: string) =>
      parse([raid(name, '5-Star Raids', `${file}.icon.png`)]).bosses[0]?.tier;
    expect(tierOf('Shadow Rider Calyrex', 'pm898')).toEqual({ level: 'T5', shadow: false });
    expect(tierOf('Shadow Rider Calyrex', 'pm898.fSHADOW_RIDER')).toEqual({
      level: 'T5',
      shadow: false,
    });
    expect(tierOf('Shadow Mewtwo', 'pm150.fSHADOW')).toEqual({ level: 'T5', shadow: true });
    expect(tierOf('Shadow Lugia', 'pm249.fSHADOW_2030')).toEqual({ level: 'T5', shadow: true });
  });

  it('keeps two bosses that picture and name disagree about apart', () => {
    const entries = [
      raid('Yveltal', '5-Star Raids', 'pm717.icon.png'),
      raid('Mewtwo', '5-Star Raids', 'pm717.icon.png'),
    ];
    expect(parse(entries).bosses).toHaveLength(2);
    expect(resolvedKeys(entries)).toEqual(['~mewtwo_unmatched (unknown)', 'yveltal']);
  });

  it('finds an entry by the usual respellings of its name, and none when the name fits several', () => {
    expect(lookup.findByName('Dusk Mane Necrozma')).toEqual({
      pokemonId: 'NECROZMA',
      form: 'NECROZMA_DUSK_MANE',
    });
    expect(lookup.findByName('Necrozma (Dusk Mane)')).toEqual(
      lookup.findByName('Dusk Mane Necrozma'),
    );
    expect(lookup.findByName('Kyurem (Black)')).toEqual({
      pokemonId: 'KYUREM',
      form: 'KYUREM_BLACK',
    });
    expect(lookup.findByName('Shadow Rider Calyrex')).toEqual({
      pokemonId: 'CALYREX',
      form: 'CALYREX_SHADOW_RIDER',
    });
    expect(lookup.findByName('Raichu (Alolan)')).toEqual({
      pokemonId: 'RAICHU',
      form: 'RAICHU_ALOLA',
    });
    expect(lookup.findByName('Deoxys (Attack)')).toEqual({
      pokemonId: 'DEOXYS',
      form: 'DEOXYS_ATTACK',
    });
    expect(lookup.findByName('Galarian Darmanitan')).toBeUndefined();
    expect(lookup.findByName('Paldean Tauros')).toBeUndefined();
  });
});

/** A catalogue without the entries and aliases named: the game master before it learned them. */
function thinned(keys: readonly string[], aliases: readonly string[] = []): PokemonCatalogue {
  const data = gameDataFixture();
  return new PokemonCatalogue({
    ...data,
    pokemon: data.pokemon.filter((entry) => !keys.includes(entry.key)),
    aliases: Object.fromEntries(
      Object.entries(data.aliases).filter(([alias]) => !aliases.includes(alias)),
    ),
  });
}

describe('a boss the game master learns later keeps its ids', () => {
  const feed = [
    raid('Mega Charizard X', 'Mega Raids', 'pm6.fMEGA_X.icon.png'),
    raid('Alolan Raichu', '3-Star Raids', 'pm26.fALOLA.icon.png'),
    raid('Landorus (Therian)', '5-Star Raids', 'pm645.fTHERIAN.icon.png'),
    raid('Pikachu Pop Star', '1-Star Raids', 'pm25.fPOP_STAR.icon.png'),
    raid('Astronaut Pikachu', '1-Star Raids', 'pm25.fGLASS_HELMET_2026.icon.png'),
  ];
  const thin = thinned(
    ['charizard_mega_x', 'raichu_alola', 'landorus_therian'],
    ['pikachu_pop_star'],
  );
  const full = catalogueFixture();

  it('stores the same ids with the thin catalogue as with the full one', () => {
    const ids = (catalogue: PokemonCatalogue) =>
      parse(feed, feedLookup(catalogue)).bosses.map((b) => `${b.pokemonId}/${b.form ?? '-'}`);
    expect(ids(thin)).toEqual(ids(full));
    expect(ids(full)).toEqual([
      'CHARIZARD/CHARIZARD_MEGA_X',
      'RAICHU/RAICHU_ALOLA',
      'LANDORUS/LANDORUS_THERIAN',
      'PIKACHU/PIKACHU_POP_STAR',
      'PIKACHU/PIKACHU_GLASS_HELMET_2026',
    ]);
  });

  it('reports nothing added or removed between the two parses', () => {
    const before = parse(feed, feedLookup(thin)).bosses;
    const after = parse(feed, feedLookup(full)).bosses;
    expect(diffFeed(before, after)).toEqual({ added: [], removed: [] });
  });

  it('leaves the bosses unresolved through resolveBoss while the form is missing', () => {
    const stored = parse(feed, feedLookup(thin)).bosses;
    expect(stored.map((boss) => resolveBoss(thin, boss)?.key)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      'pikachu',
    ]);
  });

  it('leaves them unresolved through the parser too', () => {
    const thinLookup = feedLookup(thin);
    expect(
      feed.slice(0, 4).map((entry) => {
        const mega = entry.tier === 'Mega Raids';
        return identifyBoss(entry.name, entry.image, thinLookup, { mega })?.resolved;
      }),
    ).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('finds the right entries once the catalogue has the forms', () => {
    const stored = parse(feed, feedLookup(thin)).bosses;
    expect(stored.map((boss) => resolveBoss(full, boss)?.key)).toEqual([
      'charizard_mega_x',
      'raichu_alola',
      'landorus_therian',
      'pikachu',
      'pikachu',
    ]);
  });

  it('still finds the boss for a moderator override that names the picture ids', () => {
    const override: BossOverride = {
      id: 1,
      action: 'hide',
      pokemonId: 'CHARIZARD',
      form: 'CHARIZARD_MEGA_X',
      tier: { level: 'Mega', shadow: false },
      shiny: null,
      expiresAt: null,
      createdBy: '12345678',
      createdAt: 1,
    };
    for (const catalogue of [thin, full]) {
      const bosses = parse(feed, feedLookup(catalogue)).bosses;
      const list = effectiveBosses(bosses, [override], catalogue, 0);
      expect(list.map((boss) => boss.pokemonId)).not.toContain('CHARIZARD');
    }
  });

  it('still makes the id from the name when the picture gives nothing to keep', () => {
    // A formless picture of another species, a formless picture of the species the name is not,
    // a picture whose ids are an entry the boss is not, and no picture at all.
    const first = (name: string, heading: string, file?: string) =>
      parse([raid(name, heading, file)]).bosses[0];
    expect(first('Mewtwo', '5-Star Raids', 'pm717.icon.png')).toMatchObject({
      pokemonId: 'MEWTWO_UNMATCHED',
      form: null,
    });
    expect(first('Galarian Darmanitan', '5-Star Raids', 'pm555.icon.png')).toMatchObject({
      pokemonId: 'GALARIAN_DARMANITAN',
      form: null,
    });
    expect(first('Mega Charizard Y', 'Mega Raids', 'pm6.fMEGA_X.icon.png')).toMatchObject({
      pokemonId: 'MEGA_CHARIZARD_Y',
      form: null,
    });
    expect(first('Mega Newmon', 'Mega Raids')).toMatchObject({
      pokemonId: 'MEGA_NEWMON',
      form: null,
    });
  });
});

describe('a picture with a known form and a name for another form contradict each other', () => {
  it.each([
    ['Giratina (Origin)', '5-Star Raids', 'pm487.fALTERED'],
    ['Mega Charizard Y', 'Mega Raids', 'pm6.fMEGA_X'],
    ['Galarian Meowth', '3-Star Raids', 'pm52.fALOLA'],
    ['Landorus (Incarnate)', '5-Star Raids', 'pm645.fTHERIAN'],
  ])('leaves %s with %s unresolved', (name, heading, file) => {
    const entries = [raid(name, heading, `${file}.icon.png`)];
    const [boss] = parse(entries).bosses;
    expect(boss && resolveBoss(catalogueFixture(), boss)).toBeUndefined();
    expect(resolvedKeys(entries)[0]).toContain('(unknown)');
  });

  it.each([
    ['Landorus', '5-Star Raids', 'pm645.fTHERIAN', 'landorus_therian'],
    ['Mewtwo', '5-Star Raids', 'pm150.fA', 'mewtwo_a'],
    ['A Strange Name', '5-Star Raids', 'pm487.fORIGIN', 'giratina_origin'],
    ['Giratina (Origin Forme)', '5-Star Raids', 'pm487.fORIGIN', 'giratina_origin'],
    ['Galarian Corsola', '3-Star Raids', 'pm222.fSPRING_2026', 'corsola_galarian'],
  ])('keeps %s with %s as %s', (name, heading, file, key) => {
    expect(resolvedKeys([raid(name, heading, `${file}.icon.png`)])).toEqual([key]);
  });
});

describe('names the feed is likely to use', () => {
  it.each([
    ['Mewtwo (Normal)', 'MEWTWO', null],
    ['Landorus (Normal)', 'LANDORUS', 'LANDORUS_INCARNATE'],
    ['Wormadam (Plant)', 'WORMADAM', 'WORMADAM_PLANT'],
    ['Zacian (Hero)', 'ZACIAN', 'ZACIAN_HERO'],
    ['Urshifu (Rapid Strike)', 'URSHIFU', 'URSHIFU_RAPID_STRIKE'],
    ['Landorus', 'LANDORUS', 'LANDORUS_INCARNATE'],
    ['Giratina', 'GIRATINA', 'GIRATINA_ALTERED'],
    ['Hoopa', 'HOOPA', 'HOOPA_CONFINED'],
  ])('finds %s', (name, pokemonId, form) => {
    expect(lookup.findByName(name)).toEqual({ pokemonId, form });
  });

  it('finds nothing for a parenthesis that starts no form name', () => {
    expect(lookup.findByName('Minior (Core)')).toBeUndefined();
    expect(lookup.findByName('Wormadam (Cloak)')).toBeUndefined();
  });

  it('names a species known by its default form by the species', () => {
    expect(lookup.speciesName('HOOPA')).toBe('Hoopa');
    expect(lookup.speciesName('LANDORUS')).toBe('Landorus');
    expect(lookup.speciesName('ZACIAN')).toBe('Zacian');
    expect(lookup.speciesName('WORMADAM')).toBe('Wormadam');
    expect(lookup.speciesName('MEWTWO')).toBe('Mewtwo');
  });

  it.each([
    ['Wormadam (Plant)', 'pm413', 'wormadam_plant'],
    ['Zacian (Hero)', 'pm888', 'zacian_hero'],
    ['Urshifu (Rapid Strike)', 'pm892', 'urshifu_rapid_strike'],
    ['Mewtwo (Normal)', 'pm150', 'mewtwo'],
    ['Landorus', 'pm645', 'landorus_incarnate'],
    ['Giratina', 'pm487', 'giratina_altered'],
    ['Hoopa', 'pm720', 'hoopa_confined'],
  ])('resolves %s with a formless picture and with none', (name, picture, key) => {
    expect(resolvedKeys([raid(name, '5-Star Raids', `${picture}.icon.png`)])).toEqual([key]);
    expect(resolvedKeys([raid(name, '5-Star Raids')])).toEqual([key]);
  });
});
