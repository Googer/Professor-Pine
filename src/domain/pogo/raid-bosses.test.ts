import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { readRaidBossFeed } from '../../../test/support/raid-bosses.js';
import { feedLookup } from './feed-lookup.js';
import { parseRaidBossFeed, type FeedBoss } from './raid-boss-feed.js';
import {
  autosetBoss,
  bossIdsOf,
  diffFeed,
  effectiveBosses,
  isOverrideAction,
  overrideProblem,
  resolveBoss,
  type BossOverride,
  type RaidBoss,
} from './raid-bosses.js';
import type { RaidTier } from './raid-tier.js';

const catalogue = catalogueFixture();
const feed = parseRaidBossFeed(readRaidBossFeed(), feedLookup(catalogue)).bosses;
const NOW = 1_800_000_000_000;
const T1: RaidTier = { level: 'T1', shadow: false };
const T3: RaidTier = { level: 'T3', shadow: false };
const T5: RaidTier = { level: 'T5', shadow: false };
const SHADOW_T5: RaidTier = { level: 'T5', shadow: true };
const MEGA: RaidTier = { level: 'Mega', shadow: false };
const ELITE: RaidTier = { level: 'Elite', shadow: false };

let nextId = 1;
function override(
  action: BossOverride['action'],
  pokemonId: string,
  tier: RaidTier | null,
  extra: Partial<BossOverride> = {},
): BossOverride {
  const id = nextId++;
  return {
    id,
    action,
    pokemonId,
    form: null,
    tier,
    shiny: null,
    expiresAt: null,
    createdBy: '123456789012345678',
    createdAt: NOW - 1_000_000 + id,
    ...extra,
  };
}

function feedBoss(pokemonId: string, tier: RaidTier, extra: Partial<FeedBoss> = {}): FeedBoss {
  return { pokemonId, form: null, tier, shiny: false, name: pokemonId, ...extra };
}

function keys(bosses: readonly RaidBoss[], tier?: RaidTier): string[] {
  return bosses
    .filter((b) => !tier || (b.tier.level === tier.level && b.tier.shadow === tier.shadow))
    .map((b) => b.key);
}

describe('resolveBoss', () => {
  it('finds the entry of a plain species, a mega and a named form', () => {
    expect(resolveBoss(catalogue, { pokemonId: 'YVELTAL', form: null })?.key).toBe('yveltal');
    expect(resolveBoss(catalogue, { pokemonId: 'BLASTOISE', form: 'BLASTOISE_MEGA' })?.key).toBe(
      'blastoise_mega',
    );
    expect(resolveBoss(catalogue, { pokemonId: 'LANDORUS', form: 'LANDORUS_INCARNATE' })?.key).toBe(
      'landorus_incarnate',
    );
    expect(resolveBoss(catalogue, { pokemonId: 'LANDORUS', form: null })?.key).toBe(
      'landorus_incarnate',
    );
  });

  it('takes a costume newer than the game master for the species the feed names it as', () => {
    const boss = { pokemonId: 'PIKACHU', form: 'PIKACHU_GLASS_HELMET_2026' };
    expect(resolveBoss(catalogue, { ...boss, name: 'Pikachu' })?.key).toBe('pikachu');
    expect(resolveBoss(catalogue, { ...boss, name: ' pikachu ' })?.key).toBe('pikachu');
  });

  it('takes a costume for the species by the form part and the name, however the name is written', () => {
    const boss = { pokemonId: 'PIKACHU', form: 'PIKACHU_GLASS_HELMET_2026' };
    expect(resolveBoss(catalogue, { ...boss, name: 'Astronaut Pikachu' })?.key).toBe('pikachu');
    expect(resolveBoss(catalogue, boss)).toBeUndefined();
  });

  it('does not take a regional form, a mega or a form named in the name for a costume', () => {
    for (const [form, name] of [
      ['PIKACHU_ALOLA', 'Alolan Pikachu'],
      ['PIKACHU_MEGA', 'Mega Pikachu'],
      ['PIKACHU_MEGA_X', 'Mega Pikachu X'],
      ['PIKACHU_PRIMAL', 'Primal Pikachu'],
      ['PIKACHU_COSPLAY', 'Pikachu (Cosplay Forme)'],
    ] as const) {
      expect(resolveBoss(catalogue, { pokemonId: 'PIKACHU', form, name }), form).toBeUndefined();
    }
  });

  it('does not pass off a new form or mega as the species', () => {
    expect(
      resolveBoss(catalogue, { pokemonId: 'YVELTAL', form: 'YVELTAL_MEGA', name: 'Mega Yveltal' }),
    ).toBeUndefined();
    expect(resolveBoss(catalogue, { pokemonId: 'YVELTAL', form: 'YVELTAL_MEGA' })).toBeUndefined();
    expect(
      resolveBoss(catalogue, { pokemonId: 'NEWMON', form: null, name: 'Newmon' }),
    ).toBeUndefined();
  });

  it('resolves a costume of a regional form to that form or to nothing, never to the plain species', () => {
    expect(
      resolveBoss(catalogue, {
        pokemonId: 'RAICHU',
        form: 'RAICHU_ALOLA_WINTER_2030',
        name: 'Alolan Raichu (Holiday)',
      }),
    ).toBeUndefined();
    expect(
      resolveBoss(catalogue, {
        pokemonId: 'GROWLITHE',
        form: 'GROWLITHE_WINTER_2030',
        name: 'Hisuian Growlithe',
      })?.key,
    ).toBe('growlithe_hisuian');
  });

  it('leaves a costume of a regional form the catalogue lacks, or several of, unresolved', () => {
    for (const [pokemonId, form, name] of [
      ['PIKACHU', 'PIKACHU_WINTER_2030', 'Alolan Pikachu'],
      ['TAUROS', 'TAUROS_WINTER_2030', 'Paldean Tauros'],
      // The picture says Galarian and the name Alolan: they contradict each other.
      ['RAICHU', 'RAICHU_GALARIAN_2030', 'Alolan Raichu'],
    ] as const) {
      expect(resolveBoss(catalogue, { pokemonId, form, name }), name).toBeUndefined();
    }
  });

  it('leaves a form of its own with an unexpected spelling unresolved, even under the name of the species', () => {
    for (const form of ['MEWTWO_MEGA_Z', 'MEWTWO_X', 'MEWTWO_TEN_PERCENT', 'MEWTWO_FEMALE']) {
      expect(resolveBoss(catalogue, { pokemonId: 'MEWTWO', form, name: 'Mewtwo' }), form).toBe(
        undefined,
      );
    }
  });

  it('places a stored row by the same decision the parser made', () => {
    const key = (pokemonId: string, form: string | null, name: string, tier?: RaidTier) =>
      resolveBoss(catalogue, { pokemonId, form, name, ...(tier ? { tier } : {}) })?.key;
    // A row of the old feed.
    expect(key('PIKACHU', null, 'Pikachu')).toBe('pikachu');
    expect(key('PIKACHU', 'PIKACHU_GLASS_HELMET_2026', 'Pikachu')).toBe('pikachu');
    // The picture names no form, the name does.
    expect(key('GIRATINA', null, 'Giratina (Origin)')).toBe('giratina_origin');
    expect(key('GIRATINA', null, 'Giratina')).toBe('giratina_altered');
    // A costume picture does not override a form named by the name.
    expect(key('GIRATINA', 'GIRATINA_WINTER_2030', 'Giratina (Origin)')).toBe('giratina_origin');
    expect(key('DEOXYS', 'DEOXYS_ATTACK_2030', 'Deoxys (Attack)')).toBe('deoxys_attack');
    expect(key('CORSOLA', 'CORSOLA_NEW_2030', 'Galarian Corsola')).toBe('corsola_galarian');
    // Picture and name for different Pokémon, a name that is not the species, a new form.
    expect(key('YVELTAL', null, 'Mewtwo')).toBeUndefined();
    expect(key('YVELTAL', null, 'Mega Newmon')).toBeUndefined();
    expect(key('DARMANITAN', null, 'Galarian Darmanitan')).toBeUndefined();
    expect(key('MEWTWO', 'MEWTWO_MEGA_Z', 'Mewtwo Z')).toBeUndefined();
    // An id made of a name resolves to nothing, even when a catalogue entry has the name.
    expect(key('MEWTWO_UNMATCHED', null, 'Mewtwo')).toBeUndefined();
    expect(key('GALARIAN_DARMANITAN', null, 'Galarian Darmanitan')).toBeUndefined();
    // In a raid of the mega kind only a mega or primal form counts.
    expect(
      key('BLASTOISE', 'BLASTOISE_MEGA', 'Mega Blastoise', { level: 'Mega', shadow: false }),
    ).toBe('blastoise_mega');
    expect(key('YVELTAL', null, 'Yveltal', { level: 'Mega', shadow: false })).toBeUndefined();
    expect(key('YVELTAL', null, 'Yveltal', { level: 'T5', shadow: false })).toBe('yveltal');
  });

  it('resolves every boss of the downloaded feed', () => {
    expect(feed.map((boss) => resolveBoss(catalogue, boss)?.key)).toEqual([
      'pikachu',
      'starmie',
      'umbreon',
      'gothitelle',
      'yveltal',
      'blastoise_mega',
      'gastly',
      'totodile',
      'shieldon',
      'gible',
      'primeape',
      'kirlia',
      'drapion',
      'landorus_incarnate',
    ]);
  });
});

describe('bossIdsOf', () => {
  it('names an entry the way the feed does', () => {
    const ids = (key: string) => {
      const entry = catalogue.byKey(key);
      if (!entry) throw new Error(key);
      return bossIdsOf(entry);
    };
    expect(ids('yveltal')).toEqual({ pokemonId: 'YVELTAL', form: null });
    expect(ids('blastoise_mega')).toEqual({ pokemonId: 'BLASTOISE', form: 'BLASTOISE_MEGA' });
    expect(ids('charizard_mega_x')).toEqual({ pokemonId: 'CHARIZARD', form: 'CHARIZARD_MEGA_X' });
    expect(ids('kyogre_primal')).toEqual({ pokemonId: 'KYOGRE', form: 'KYOGRE_PRIMAL' });
    expect(ids('landorus_incarnate')).toEqual({
      pokemonId: 'LANDORUS',
      form: 'LANDORUS_INCARNATE',
    });
  });

  it('gives ids that resolve back to the same entry, for every entry', () => {
    const wrong = catalogue.all.filter(
      (entry) => resolveBoss(catalogue, bossIdsOf(entry)) !== entry,
    );
    expect(wrong.map((entry) => entry.key)).toEqual([]);
  });
});

describe('effectiveBosses: the feed alone', () => {
  const bosses = effectiveBosses(feed, [], catalogue, NOW);

  it('lists the feed in tier order, then by name', () => {
    expect(bosses.map((b) => `${b.tier.shadow ? 'S' : ''}${b.tier.level} ${b.name}`)).toEqual([
      'T1 Pikachu',
      'ST1 Gastly',
      'ST1 Gible',
      'ST1 Shieldon',
      'ST1 Totodile',
      'T3 Gothitelle',
      'T3 Starmie',
      'T3 Umbreon',
      'ST3 Drapion',
      'ST3 Kirlia',
      'ST3 Primeape',
      'T5 Yveltal',
      'ST5 Landorus (Incarnate Forme)',
      'Mega Mega Blastoise',
    ]);
  });

  it('carries the catalogue entry, the feed ids and the shiny flag', () => {
    expect(bosses.find((b) => b.key === 'blastoise_mega')).toEqual({
      key: 'blastoise_mega',
      pokemonId: 'BLASTOISE',
      form: 'BLASTOISE_MEGA',
      tier: MEGA,
      shiny: true,
      name: 'Mega Blastoise',
      entry: catalogue.byKey('blastoise_mega'),
      source: 'feed',
      autoset: false,
      image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm9.fMEGA.icon.png',
    });
  });

  it('gives a boss the picture of whichever feed row has one, and an override boss none', () => {
    const plain = feedBoss('PIKACHU', T3);
    const costume = feedBoss('PIKACHU', T3, {
      form: 'PIKACHU_NEW_HAT_2026',
      name: 'Pikachu',
      image: 'https://example.test/hat.png',
    });
    const [pikachu] = effectiveBosses([plain, costume], [], catalogue, NOW);
    expect(pikachu?.image).toBe('https://example.test/hat.png');
    const added = effectiveBosses([], [override('add', 'ZEKROM', T5)], catalogue, NOW);
    expect(added[0]).not.toHaveProperty('image');
  });

  it('does not give a boss an image property when none of its feed rows has a picture', () => {
    const [pikachu, ...rest] = effectiveBosses(
      [
        feedBoss('PIKACHU', T3),
        feedBoss('PIKACHU', T3, { form: 'PIKACHU_NEW_HAT_2026', name: 'Pikachu' }),
      ],
      [],
      catalogue,
      NOW,
    );
    expect(rest).toEqual([]);
    expect(pikachu).not.toHaveProperty('image');
  });

  it('keeps a Pokémon the game master does not know, under the name of the feed', () => {
    const [boss] = effectiveBosses(
      [feedBoss('NEWMON', T5, { form: 'NEWMON_SKY', name: 'Newmon (Sky Forme)' })],
      [],
      catalogue,
      NOW,
    );
    expect(boss).toMatchObject({
      key: '~newmon_sky',
      name: 'Newmon (Sky Forme)',
      entry: undefined,
      source: 'feed',
    });
  });

  it('makes one boss of two feed rows that are one Pokémon in one tier', () => {
    const merged = effectiveBosses(
      [
        feedBoss('PIKACHU', T1, { form: 'PIKACHU_GLASS_HELMET_2026', name: 'Pikachu' }),
        feedBoss('PIKACHU', T1, { shiny: true, name: 'Pikachu' }),
        feedBoss('PIKACHU', T3, { name: 'Pikachu' }),
      ],
      [],
      catalogue,
      NOW,
    );
    expect(merged.map((b) => [b.key, b.tier.level, b.shiny, b.form])).toEqual([
      ['pikachu', 'T1', true, 'PIKACHU_GLASS_HELMET_2026'],
      ['pikachu', 'T3', false, null],
    ]);
  });

  it('says a boss is costumed when a row of it in its tier is (plan 8R-4)', () => {
    const bosses = effectiveBosses(
      [
        feedBoss('PIKACHU', T1, { form: 'PIKACHU_GLASS_HELMET_2026', name: 'Astronaut Pikachu' }),
        feedBoss('PIKACHU', T1, { name: 'Pikachu' }),
        feedBoss('PIKACHU', T3, { name: 'Pikachu' }),
        feedBoss('ZUBAT', T1, {
          name: 'Zubat wearing a top hat',
          image:
            'https://cdn.leekduck.com/assets/img/events/article-images/2026/x/zubat-top-hat.png',
        }),
      ],
      [
        override('add', 'PIKACHU', T5, { form: 'PIKACHU_PXP_2026' }),
        override('add', 'RAIKOU', T5, { form: 'RAIKOU_S' }),
      ],
      catalogue,
      NOW,
    );
    expect(bosses.map((b) => [b.key, b.tier.level, b.costumed === true])).toEqual([
      ['pikachu', 'T1', true],
      ['zubat', 'T1', true],
      ['pikachu', 'T3', false],
      ['pikachu', 'T5', true],
      ['raikou', 'T5', false],
    ]);
    expect(bosses[2]).not.toHaveProperty('costumed');
  });

  it('makes a plain boss of the feed costumed where an add override names a costume of it', () => {
    const bosses = effectiveBosses(
      [feedBoss('PIKACHU', T5, { name: 'Pikachu' })],
      [override('add', 'PIKACHU', T5, { form: 'PIKACHU_PXP_2026' })],
      catalogue,
      NOW,
    );
    expect(bosses.map((b) => [b.key, b.tier.level, b.source, b.costumed === true])).toEqual([
      ['pikachu', 'T5', 'feed', true],
    ]);
  });

  it('does not change the feed list it is given', () => {
    const frozen = feed.map((boss) =>
      Object.freeze({ ...boss, tier: Object.freeze({ ...boss.tier }) }),
    );
    const row = override('add', 'ZEKROM', T5, { shiny: true });
    const frozenRow = Object.freeze({ ...row, tier: Object.freeze({ ...row.tier! }) });
    const shiny = override('shiny', 'YVELTAL', null, { shiny: false });
    expect(() =>
      effectiveBosses(frozen, [frozenRow, Object.freeze(shiny)], catalogue, NOW),
    ).not.toThrow();
  });
});

describe('effectiveBosses: overrides', () => {
  it('adds a boss the feed does not list', () => {
    const bosses = effectiveBosses(
      feed,
      [override('add', 'MEWTWO', ELITE, { shiny: true }), override('add', 'ZEKROM', T5)],
      catalogue,
      NOW,
    );
    expect(keys(bosses, T5)).toEqual(['yveltal', 'zekrom']);
    expect(bosses.find((b) => b.key === 'mewtwo')).toMatchObject({
      tier: ELITE,
      shiny: true,
      name: 'Mewtwo',
      source: 'override',
      pokemonId: 'MEWTWO',
      form: null,
    });
    expect(bosses.find((b) => b.key === 'zekrom')?.shiny).toBe(false);
  });

  it('leaves a feed boss as it is when an override adds it again', () => {
    const bosses = effectiveBosses(feed, [override('add', 'YVELTAL', T5)], catalogue, NOW);
    expect(bosses.filter((b) => b.key === 'yveltal')).toHaveLength(1);
    expect(bosses.find((b) => b.key === 'yveltal')).toMatchObject({ source: 'feed', shiny: true });
  });

  it('names an added Pokémon the game master does not know after its id', () => {
    const [boss] = effectiveBosses(
      [],
      [override('add', 'NEWMON', T5, { form: 'NEWMON_SKY_FORME' })],
      catalogue,
      NOW,
    );
    expect(boss).toMatchObject({ key: '~newmon_sky_forme', name: 'Newmon Sky Forme' });
  });

  it('hides a boss of one tier only', () => {
    const twice = [...feed, feedBoss('YVELTAL', SHADOW_T5, { name: 'Yveltal' })];
    const bosses = effectiveBosses(twice, [override('hide', 'YVELTAL', T5)], catalogue, NOW);
    expect(keys(bosses, T5)).toEqual([]);
    expect(keys(bosses, SHADOW_T5)).toEqual(['landorus_incarnate', 'yveltal']);
  });

  it('hides by Pokémon, whichever ids name it', () => {
    const bosses = effectiveBosses(
      feed,
      [
        // The feed says LANDORUS_INCARNATE; the bare species id is the same Pokémon.
        override('hide', 'LANDORUS', SHADOW_T5),
        // The feed lists a costume; hiding Pikachu hides it.
        override('hide', 'PIKACHU', T1),
      ],
      catalogue,
      NOW,
    );
    expect(keys(bosses, SHADOW_T5)).toEqual([]);
    expect(keys(bosses, T1)).toEqual([]);
  });

  it('lets hide beat add and autoset, whichever is newer', () => {
    const bosses = effectiveBosses(
      feed,
      [
        override('hide', 'ZEKROM', T5),
        override('add', 'ZEKROM', T5),
        override('autoset', 'ZEKROM', T5),
      ],
      catalogue,
      NOW,
    );
    expect(keys(bosses, T5)).toEqual(['yveltal']);
    expect(autosetBoss(bosses, T5)?.key).toBe('yveltal');
  });

  it('forces the shiny flag, for one tier or for all', () => {
    const twice = [...feed, feedBoss('YVELTAL', SHADOW_T5, { shiny: true, name: 'Yveltal' })];
    const everywhere = effectiveBosses(
      twice,
      [override('shiny', 'YVELTAL', null, { shiny: false })],
      catalogue,
      NOW,
    );
    expect(everywhere.filter((b) => b.key === 'yveltal').map((b) => b.shiny)).toEqual([
      false,
      false,
    ]);
    const oneTier = effectiveBosses(
      twice,
      [override('shiny', 'YVELTAL', SHADOW_T5, { shiny: false })],
      catalogue,
      NOW,
    );
    expect(oneTier.filter((b) => b.key === 'yveltal').map((b) => [b.tier.shadow, b.shiny])).toEqual(
      [
        [false, true],
        [true, false],
      ],
    );
  });

  it('lets the newest shiny override win, and one tier beat every tier', () => {
    const newest = effectiveBosses(
      feed,
      [
        override('shiny', 'YVELTAL', T5, { shiny: false }),
        override('shiny', 'YVELTAL', T5, { shiny: true }),
      ],
      catalogue,
      NOW,
    );
    expect(newest.find((b) => b.key === 'yveltal')?.shiny).toBe(true);
    const specific = effectiveBosses(
      feed,
      [
        override('shiny', 'YVELTAL', T5, { shiny: false }),
        override('shiny', 'YVELTAL', null, { shiny: true }),
      ],
      catalogue,
      NOW,
    );
    expect(specific.find((b) => b.key === 'yveltal')?.shiny).toBe(false);
  });

  it('lets the newest shiny override win whatever order they are passed in', () => {
    const older = override('shiny', 'YVELTAL', T5, { shiny: false });
    const newer = override('shiny', 'YVELTAL', T5, { shiny: true });
    const bosses = effectiveBosses(feed, [newer, older], catalogue, NOW);
    expect(bosses.find((b) => b.key === 'yveltal')?.shiny).toBe(true);
  });

  it('applies a shiny override to a boss another override added', () => {
    const bosses = effectiveBosses(
      [],
      [override('add', 'ZEKROM', T5), override('shiny', 'ZEKROM', null, { shiny: true })],
      catalogue,
      NOW,
    );
    expect(bosses[0]).toMatchObject({ key: 'zekrom', shiny: true });
  });

  it('ignores an override once it has expired', () => {
    const overrides = [
      override('hide', 'YVELTAL', T5, { expiresAt: NOW }),
      override('add', 'ZEKROM', T5, { expiresAt: NOW + 1 }),
      override('add', 'RESHIRAM', T5, { expiresAt: NOW - 1 }),
    ];
    expect(keys(effectiveBosses(feed, overrides, catalogue, NOW), T5)).toEqual([
      'yveltal',
      'zekrom',
    ]);
    expect(keys(effectiveBosses(feed, overrides, catalogue, NOW - 1), T5)).toEqual(['zekrom']);
  });

  it('ignores an override that needs a tier and has none', () => {
    const bosses = effectiveBosses(
      feed,
      [override('add', 'ZEKROM', null), override('hide', 'YVELTAL', null)],
      catalogue,
      NOW,
    );
    expect(keys(bosses, T5)).toEqual(['yveltal']);
  });
});

describe('effectiveBosses: an add moves its boss within its kind of raid (plan 8X-J)', () => {
  const tiersOf = (bosses: readonly RaidBoss[], key: string) =>
    bosses
      .filter((b) => b.key === key)
      .map((b) => `${b.tier.shadow ? 'Shadow ' : ''}${b.tier.level} ${b.source}`);

  it('leaves out the feed’s plain tier of the boss for an add at another plain tier', () => {
    const rows = [feedBoss('STARMIE', T3), feedBoss('UMBREON', T3)];
    const bosses = effectiveBosses(rows, [override('add', 'STARMIE', T1)], catalogue, NOW);
    expect(tiersOf(bosses, 'starmie')).toEqual(['T1 override']);
    expect(tiersOf(bosses, 'umbreon')).toEqual(['T3 feed']);
  });

  it('counts Elite among the plain tiers', () => {
    const rows = [feedBoss('MEWTWO', T5)];
    const bosses = effectiveBosses(rows, [override('add', 'MEWTWO', ELITE)], catalogue, NOW);
    expect(tiersOf(bosses, 'mewtwo')).toEqual(['Elite override']);
  });

  it('keeps shadow raids apart from plain ones', () => {
    const SHADOW_T3: RaidTier = { level: 'T3', shadow: true };
    const rows = [feedBoss('STARMIE', T3), feedBoss('STARMIE', SHADOW_T5)];
    const plain = effectiveBosses(rows, [override('add', 'STARMIE', T1)], catalogue, NOW);
    expect(tiersOf(plain, 'starmie')).toEqual(['T1 override', 'Shadow T5 feed']);
    const shadow = effectiveBosses(rows, [override('add', 'STARMIE', SHADOW_T3)], catalogue, NOW);
    expect(tiersOf(shadow, 'starmie')).toEqual(['T3 feed', 'Shadow T3 override']);
  });

  it('moves nothing among the mega tiers', () => {
    const MEGA_LEGENDARY: RaidTier = { level: 'MegaLegendary', shadow: false };
    const rows = [feedBoss('BLASTOISE', MEGA, { form: 'BLASTOISE_MEGA', name: 'Mega Blastoise' })];
    const bosses = effectiveBosses(
      rows,
      [override('add', 'BLASTOISE', MEGA_LEGENDARY, { form: 'BLASTOISE_MEGA' })],
      catalogue,
      NOW,
    );
    expect(tiersOf(bosses, 'blastoise_mega')).toEqual(['Mega feed', 'MegaLegendary override']);
  });

  it('keeps costumes apart: an add of a costume moves nothing, and a plain add no costume', () => {
    const rows = [
      feedBoss('PIKACHU', T1, { form: 'PIKACHU_GLASS_HELMET_2026', name: 'Astronaut Pikachu' }),
      feedBoss('PIKACHU', T3, { name: 'Pikachu' }),
    ];
    const costume = effectiveBosses(
      rows,
      [override('add', 'PIKACHU', T5, { form: 'PIKACHU_PXP_2026' })],
      catalogue,
      NOW,
    );
    expect(tiersOf(costume, 'pikachu')).toEqual(['T1 feed', 'T3 feed', 'T5 override']);
    const plain = effectiveBosses(rows, [override('add', 'PIKACHU', T5)], catalogue, NOW);
    expect(tiersOf(plain, 'pikachu')).toEqual(['T1 feed', 'T5 override']);
  });

  it('moves the boss for an autoset as for an add, and not while the autoset is hidden', () => {
    const rows = [feedBoss('STARMIE', T3)];
    const autoset = override('autoset', 'STARMIE', T1);
    expect(tiersOf(effectiveBosses(rows, [autoset], catalogue, NOW), 'starmie')).toEqual([
      'T1 override',
    ]);
    const hidden = effectiveBosses(
      rows,
      [autoset, override('hide', 'STARMIE', T1)],
      catalogue,
      NOW,
    );
    expect(tiersOf(hidden, 'starmie')).toEqual(['T3 feed']);
  });
});

describe('effectiveBosses: overrides that name a boss by the ids of the feed', () => {
  const ids = { form: 'PIKACHU_GLASS_HELMET_2026' };

  it('hides the feed boss', () => {
    const bosses = effectiveBosses(feed, [override('hide', 'PIKACHU', T1, ids)], catalogue, NOW);
    expect(keys(bosses, T1)).toEqual([]);
  });

  it('adds nothing beside the feed boss', () => {
    const bosses = effectiveBosses(feed, [override('add', 'PIKACHU', T1, ids)], catalogue, NOW);
    expect(bosses.filter((b) => b.tier.level === 'T1' && !b.tier.shadow)).toMatchObject([
      { key: 'pikachu', source: 'feed' },
    ]);
  });

  it('flags the feed boss as the autoset one', () => {
    const bosses = effectiveBosses(feed, [override('autoset', 'PIKACHU', T1, ids)], catalogue, NOW);
    expect(keys(bosses, T1)).toEqual(['pikachu']);
    expect(autosetBoss(bosses, T1)).toMatchObject({ key: 'pikachu', autoset: true });
    expect(autosetBoss(bosses, T1)?.entry?.key).toBe('pikachu');
  });

  it('forces the shiny flag of the feed boss', () => {
    const before = effectiveBosses(feed, [], catalogue, NOW).find((b) => b.key === 'pikachu');
    expect(before?.shiny).toBe(true);
    const bosses = effectiveBosses(
      feed,
      [override('shiny', 'PIKACHU', null, { ...ids, shiny: false })],
      catalogue,
      NOW,
    );
    expect(bosses.find((b) => b.key === 'pikachu')?.shiny).toBe(false);
  });

  it('matches an override row stored in lower case', () => {
    const bosses = effectiveBosses(
      feed,
      [override('hide', 'pikachu', T1, { form: 'pikachu_glass_helmet_2026' })],
      catalogue,
      NOW,
    );
    expect(keys(bosses, T1)).toEqual([]);
  });

  it('gives a form neither the game master nor the feed knows a key of its own', () => {
    const bosses = effectiveBosses(
      feed,
      [override('add', 'PIKACHU', T1, { form: 'PIKACHU_NEVER_SEEN' })],
      catalogue,
      NOW,
    );
    expect(bosses.filter((b) => b.tier.level === 'T1' && !b.tier.shadow)).toMatchObject([
      { key: 'pikachu' },
      { key: '~pikachu_never_seen', source: 'override', entry: undefined },
    ]);
  });

  it('counts <id>_NORMAL as no form for a Pokémon nobody knows', () => {
    const bosses = effectiveBosses(
      [feedBoss('NEWMON', T5, { form: 'NEWMON_NORMAL', name: 'Newmon' })],
      [override('hide', 'NEWMON', T5)],
      catalogue,
      NOW,
    );
    expect(bosses).toEqual([]);
    const added = effectiveBosses(
      [feedBoss('NEWMON', T5, { name: 'Newmon' })],
      [override('hide', 'NEWMON', T5, { form: 'NEWMON_NORMAL' })],
      catalogue,
      NOW,
    );
    expect(added).toEqual([]);
  });
});

describe('effectiveBosses: the key of a boss the game master does not know', () => {
  it('can never be the key of a catalogue entry', () => {
    // An unresolved boss whose id spells a real key (`Genesect (Burn)` stored as GENESECT_BURN).
    const [boss] = effectiveBosses(
      [feedBoss('TYRANITAR_UNKNOWN_FORM', T5, { name: 'Tyranitar (Odd)' })],
      [],
      catalogue,
      NOW,
    );
    expect(boss?.entry).toBeUndefined();
    expect(boss?.key).toBe('~tyranitar_unknown_form');
    expect(catalogue.all.some((entry) => entry.key.startsWith('~'))).toBe(false);
  });
});

describe('autosetBoss', () => {
  it('is the only boss of a tier', () => {
    const bosses = effectiveBosses(feed, [], catalogue, NOW);
    expect(autosetBoss(bosses, T5)?.key).toBe('yveltal');
    expect(autosetBoss(bosses, MEGA)?.key).toBe('blastoise_mega');
    expect(autosetBoss(bosses, SHADOW_T5)?.key).toBe('landorus_incarnate');
  });

  it('is nothing for a tier with several bosses or none', () => {
    const bosses = effectiveBosses(feed, [], catalogue, NOW);
    expect(autosetBoss(bosses, T3)).toBeUndefined();
    expect(autosetBoss(bosses, ELITE)).toBeUndefined();
    expect(autosetBoss([], T5)).toBeUndefined();
  });

  it('is the boss a moderator chose, which need not be in the feed', () => {
    const chosen = effectiveBosses(feed, [override('autoset', 'UMBREON', T3)], catalogue, NOW);
    expect(autosetBoss(chosen, T3)?.key).toBe('umbreon');
    expect(chosen.filter((b) => b.autoset).map((b) => b.key)).toEqual(['umbreon']);

    const added = effectiveBosses(feed, [override('autoset', 'ZEKROM', T5)], catalogue, NOW);
    expect(keys(added, T5)).toEqual(['yveltal', 'zekrom']);
    expect(autosetBoss(added, T5)).toMatchObject({ key: 'zekrom', source: 'override' });
  });

  it('takes the newest choice for a tier, and each tier has its own', () => {
    const bosses = effectiveBosses(
      feed,
      [
        override('autoset', 'UMBREON', T3),
        override('autoset', 'STARMIE', T3),
        override('autoset', 'KIRLIA', { level: 'T3', shadow: true }),
      ],
      catalogue,
      NOW,
    );
    expect(autosetBoss(bosses, T3)?.key).toBe('starmie');
    expect(autosetBoss(bosses, { level: 'T3', shadow: true })?.key).toBe('kirlia');
    expect(bosses.filter((b) => b.autoset).map((b) => b.key)).toEqual(['starmie', 'kirlia']);
  });

  it('takes the newest choice whatever order the overrides are passed in', () => {
    const older = override('autoset', 'UMBREON', T3);
    const newer = override('autoset', 'STARMIE', T3);
    const bosses = effectiveBosses(feed, [newer, older], catalogue, NOW);
    expect(autosetBoss(bosses, T3)?.key).toBe('starmie');
  });

  it('falls back when the choice has expired or is hidden', () => {
    const expired = effectiveBosses(
      feed,
      [override('autoset', 'ZEKROM', T5, { expiresAt: NOW - 1 })],
      catalogue,
      NOW,
    );
    expect(autosetBoss(expired, T5)?.key).toBe('yveltal');
    const hidden = effectiveBosses(
      feed,
      [
        override('autoset', 'UMBREON', T3),
        override('autoset', 'STARMIE', T3),
        override('hide', 'STARMIE', T3),
      ],
      catalogue,
      NOW,
    );
    expect(autosetBoss(hidden, T3)?.key).toBe('umbreon');
  });
});

describe('diffFeed', () => {
  it('lists what appeared and what went', () => {
    const before = [feedBoss('ZEKROM', T5), feedBoss('STARMIE', T3)];
    const after = [feedBoss('STARMIE', T3), feedBoss('YVELTAL', T5), feedBoss('STARMIE', T1)];
    const change = diffFeed(before, after);
    expect(change.added.map((b) => [b.pokemonId, b.tier.level])).toEqual([
      ['YVELTAL', 'T5'],
      ['STARMIE', 'T1'],
    ]);
    expect(change.removed.map((b) => b.pokemonId)).toEqual(['ZEKROM']);
  });

  it('tells forms and shadow tiers apart, and ignores the shiny flag and the name', () => {
    const before = [feedBoss('GIRATINA', T5, { form: 'GIRATINA_ALTERED' }), feedBoss('MEW', T5)];
    const after = [
      feedBoss('GIRATINA', T5, { form: 'GIRATINA_ORIGIN' }),
      feedBoss('MEW', T5, { shiny: true, name: 'Mew!' }),
      feedBoss('MEW', SHADOW_T5),
    ];
    const change = diffFeed(before, after);
    expect(change.added.map((b) => b.form ?? b.tier.shadow)).toEqual(['GIRATINA_ORIGIN', true]);
    expect(change.removed.map((b) => b.form)).toEqual(['GIRATINA_ALTERED']);
  });

  it('finds nothing between equal lists', () => {
    expect(diffFeed(feed, [...feed].reverse())).toEqual({ added: [], removed: [] });
    expect(diffFeed([], [])).toEqual({ added: [], removed: [] });
  });
});

describe('overrideProblem', () => {
  it('accepts each kind of override', () => {
    for (const ok of [
      override('add', 'MEWTWO', ELITE),
      override('add', 'MEWTWO', ELITE, { shiny: true, expiresAt: NOW + 1 }),
      override('hide', 'YVELTAL', T5),
      override('autoset', 'BLASTOISE', MEGA, { form: 'BLASTOISE_MEGA' }),
      override('shiny', 'KIRLIA', null, { shiny: false }),
      override('shiny', 'KIRLIA', SHADOW_T5, { shiny: true }),
      override('add', 'PORYGON2', T3),
    ]) {
      expect(overrideProblem(ok, NOW), JSON.stringify(ok)).toBeUndefined();
    }
  });

  it.each([
    ['a tier is missing', override('add', 'MEWTWO', null), /tier is needed/],
    ['a tier is missing for hide', override('hide', 'MEWTWO', null), /tier is needed/],
    ['a tier is missing for autoset', override('autoset', 'MEWTWO', null), /tier is needed/],
    [
      'the tier has no shadow raids',
      override('add', 'MEWTWO', { level: 'Elite', shadow: true }),
      /no shadow raids/,
    ],
    ['a shiny override has no value', override('shiny', 'MEWTWO', null), /shiny or not/],
    [
      'a hide override has a shiny value',
      override('hide', 'MEWTWO', T5, { shiny: true }),
      /says nothing/,
    ],
    ['the expiry is now', override('add', 'MEWTWO', T5, { expiresAt: NOW }), /in the future/],
    [
      'the expiry is not a time',
      override('add', 'MEWTWO', T5, { expiresAt: Number.NaN }),
      /in the future/,
    ],
    ['the Pokémon id is lower case', override('add', 'mewtwo', T5), /not a Pokémon id/],
    ['the Pokémon id is empty', override('add', '', T5), /not a Pokémon id/],
    ['the Pokémon id is too long', override('add', 'A'.repeat(65), T5), /not a Pokémon id/],
    [
      'the form is not an id',
      override('add', 'MEWTWO', T5, { form: 'armored mewtwo' }),
      /not a form id/,
    ],
    [
      'the tier is no raid level',
      override('add', 'MEWTWO', { level: 'T2' as never, shadow: false }),
      /not a raid tier/,
    ],
    [
      'the member id is not a snowflake',
      override('add', 'MEWTWO', T5, { createdBy: 'matt' }),
      /not a member id/,
    ],
  ])('refuses an override when %s', (_what, bad, message) => {
    expect(overrideProblem(bad, NOW)).toMatch(message);
  });
});

describe('isOverrideAction', () => {
  it('accepts the four actions only', () => {
    expect(['add', 'hide', 'autoset', 'shiny'].every(isOverrideAction)).toBe(true);
    expect(isOverrideAction('remove')).toBe(false);
    expect(isOverrideAction('ADD')).toBe(false);
  });
});
