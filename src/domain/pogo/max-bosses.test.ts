import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import {
  at,
  MAX_FEED_READ_AT,
  MAX_ZONE,
  pokebattlerFeed,
  readPokebattlerFeed,
} from '../../../test/support/max-bosses.js';
import {
  comingMaxBosses,
  maxBossesAt,
  maxBossOf,
  maxOverrideProblem,
  maxRowsIn,
  parseMaxBossFeed,
  type MaxBoss,
  type MaxFeedBoss,
} from './max-bosses.js';
import type { MaxTier } from './max-tier.js';
import type { BossOverride, NewBossOverride } from './raid-bosses.js';

const catalogue = catalogueFixture();
const read = (raw: unknown, now = MAX_FEED_READ_AT) =>
  parseMaxBossFeed(raw, catalogue, { now, zone: MAX_ZONE });

describe('parseMaxBossFeed: the recorded feed', () => {
  const parsed = read(readPokebattlerFeed());
  const ofTier = (tier: MaxTier) => parsed.bosses.filter((boss) => boss.tier === tier);

  it('reads the five Dynamax tiers and Gigantamax, verified or not, and nothing else', () => {
    expect(
      (['D1', 'D2', 'D3', 'D4', 'D5', 'G'] as const).map((tier) => ofTier(tier).length),
    ).toEqual([36, 6, 13, 2, 3, 0]);
    // Neither the _LEGACY and _FUTURE twins nor the raid tier: Dialga is a raid boss there.
    expect(parsed.bosses.some((boss) => boss.pokemonId === 'DIALGA')).toBe(false);
    expect(parsed.bosses.some((boss) => boss.pokemonId === 'LATIAS')).toBe(false);
  });

  it('gives each boss the ids and name of its catalogue entry', () => {
    expect(ofTier('D4')).toEqual([
      { pokemonId: 'DURALUDON', form: null, tier: 'D4', shiny: true, name: 'Duraludon' },
      { pokemonId: 'TOXTRICITY', form: null, tier: 'D4', shiny: false, name: 'Toxtricity' },
    ]);
    expect(ofTier('D1').find((boss) => boss.pokemonId === 'SNEASEL')).toMatchObject({
      form: null,
      name: 'Sneasel',
    });
  });

  it('knows every boss of the day, and reports what it does not know and no tier', () => {
    expect(parsed.unknownIds).toEqual([]);
    expect(parsed.unknownLevels).toEqual([]);
    expect(parsed.skipped).toBe(0);
  });

  it('keeps an upcoming boss from the start of its day in the zone, and the others from now', () => {
    const lake = ofTier('D5');
    expect(lake.map((boss) => boss.name)).toEqual(['Azelf', 'Mesprit', 'Uxie']);
    // Pokebattler's start is 2026-10-24T21:00Z, 17:00 in the zone, when the Max Battle Day of
    // 14:00 to 17:00 is over: the day is what is meant.
    for (const boss of lake) expect(boss.startsAt).toBe(at('2026-10-24T00:00'));
    expect(parsed.bosses.filter((boss) => boss.startsAt !== undefined)).toHaveLength(3);
  });

  it('keeps Pokebattler’s moment, a boss from the start of its day in each zone (plan 19A-2)', () => {
    const [azelf] = ofTier('D5');
    expect(azelf?.startsFrom).toBe(Date.UTC(2026, 9, 24, 21));
    const row = { ...(azelf as MaxFeedBoss), firstSeen: at('2026-10-24T00:00'), lastSeen: 0 };
    // 21:00Z is 06:00 on the 25th in Tokyo, 23:00 on the 24th in Berlin.
    expect(maxRowsIn([row], 'Asia/Tokyo')[0]?.firstSeen).toBe(Date.UTC(2026, 9, 24, 15));
    expect(maxRowsIn([row], 'Europe/Berlin')[0]?.firstSeen).toBe(Date.UTC(2026, 9, 23, 22));
    expect(maxRowsIn([row], MAX_ZONE)[0]?.firstSeen).toBe(at('2026-10-24T00:00'));
    const plain = { ...row, startsFrom: undefined };
    expect(maxRowsIn([plain], 'Asia/Tokyo')[0]).toBe(plain);
  });

  it('keeps no start once it has passed', () => {
    const later = read(readPokebattlerFeed(), at('2026-10-25T09:00'));
    expect(later.bosses.filter((boss) => boss.startsAt !== undefined)).toEqual([]);
  });
});

describe('parseMaxBossFeed: Gigantamax and the mapping of ids', () => {
  const gigantamax = read(
    pokebattlerFeed({
      RAID_LEVEL_6_MAX: [
        { pokemonId: 'MACHAMP_GIGANTAMAX', shiny: true },
        { pokemonId: 'TOXTRICITY_AMPED_GIGANTAMAX' },
        { pokemonId: 'URSHIFU_RAPID_STRIKE_GIGANTAMAX' },
        { pokemonId: 'ETERNATUS' },
        { pokemonId: 'ETERNATUS_ETERNAMAX_FORM' },
        { pokemonId: 'NEWMON_GIGANTAMAX' },
      ],
      RAID_LEVEL_2_MAX: [{ pokemonId: 'MACHAMP' }],
    }),
  );

  it('reads a Gigantamax id as its Pokémon with the tier G, never an entry of its own', () => {
    expect(gigantamax.bosses.map((boss) => [boss.pokemonId, boss.form, boss.tier])).toEqual([
      ['MACHAMP', null, 'G'],
      ['TOXTRICITY', 'TOXTRICITY_AMPED', 'G'],
      ['URSHIFU', 'URSHIFU_RAPID_STRIKE', 'G'],
      ['ETERNATUS', null, 'G'],
      ['ETERNATUS', 'ETERNATUS_ETERNAMAX', 'G'],
      ['NEWMON', null, 'G'],
      ['MACHAMP', null, 'D2'],
    ]);
    expect(gigantamax.bosses[0]?.shiny).toBe(true);
  });

  it('lists an id the game data does not know by a name made of it, and reports it', () => {
    expect(gigantamax.bosses.find((boss) => boss.pokemonId === 'NEWMON')?.name).toBe('Newmon');
    expect(gigantamax.unknownIds).toEqual(['NEWMON_GIGANTAMAX']);
  });

  it('maps Pokebattler ids by the catalogue: form ids, the bare species, Gigantamax ids', () => {
    const key = (id: string) => maxBossOf(id, catalogue);
    expect(key('MEOWSTIC_FEMALE_FORM')).toEqual({
      entry: catalogue.byKey('meowstic_female'),
      gigantamax: false,
    });
    expect(key('TOXTRICITY')?.entry?.key).toBe('toxtricity');
    expect(key('TOXTRICITY_AMPED_FORM')?.entry?.key).toBe('toxtricity_amped');
    expect(key('TOXTRICITY_GIGANTAMAX')).toEqual({
      entry: catalogue.byKey('toxtricity'),
      gigantamax: true,
    });
    // A species known by its default form: the bare id is that form (as the raid feed reads it).
    expect(key('GIRATINA')?.entry?.key).toBe('giratina_altered');
    expect(key('NEWMON')).toEqual({ entry: undefined, gigantamax: false });
    // A mega is no max boss.
    expect(key('CHARIZARD_MEGA_X')?.entry).toBeUndefined();
  });
});

describe('parseMaxBossFeed: what it refuses and leaves out', () => {
  it('refuses a document that is not the feed, and one with no max boss', () => {
    for (const raw of [null, [], 'text', { tiers: 'none' }, { breakingNews: [] }]) {
      expect(() => read(raw), JSON.stringify(raw)).toThrow(/not in the expected format/);
    }
    expect(() => read(pokebattlerFeed({ RAID_LEVEL_5: [{ pokemonId: 'DIALGA' }] }))).toThrow(
      /lists no max bosses/,
    );
  });

  it('reports a max tier it does not know that has bosses, and leaves them out', () => {
    const parsed = read(
      pokebattlerFeed({
        RAID_LEVEL_1_MAX: [{ pokemonId: 'SNEASEL' }],
        RAID_LEVEL_7_MAX: [{ pokemonId: 'MACHAMP' }],
        RAID_LEVEL_6_5_MAX: [],
        RAID_LEVEL_7_MAX_FUTURE: [{ pokemonId: 'MACHAMP' }],
      }),
    );
    expect(parsed.bosses.map((boss) => boss.pokemonId)).toEqual(['SNEASEL']);
    expect(parsed.unknownLevels).toEqual(['RAID_LEVEL_7_MAX']);
    expect(parsed.skipped).toBe(1);
  });

  it('leaves out an entry without a usable id, and keeps a boss listed twice once', () => {
    const parsed = read(
      pokebattlerFeed({
        RAID_LEVEL_1_MAX: [
          { pokemonId: 'SNEASEL' },
          { pokemonId: 'SNEASEL', shiny: true },
          { pokemonId: 42 },
          { pokemonId: 'drop table' },
          { pokemonId: `A${'B'.repeat(80)}` },
        ],
      }),
    );
    expect(parsed.bosses).toEqual([
      { pokemonId: 'SNEASEL', form: null, tier: 'D1', shiny: true, name: 'Sneasel' },
    ]);
    expect(parsed.skipped).toBe(3);
  });

  it('takes an upcoming boss without a start, or with one passed, as a boss from now', () => {
    const parsed = read(
      pokebattlerFeed({
        RAID_LEVEL_1_MAX: [
          { pokemonId: 'SNEASEL', upcoming: true },
          { pokemonId: 'MACHOP', upcoming: true, startDate: MAX_FEED_READ_AT - 1 },
          { pokemonId: 'ABRA', upcoming: false, startDate: at('2026-11-01T10:00') },
        ],
      }),
    );
    expect(parsed.bosses.map((boss) => boss.startsAt)).toEqual([undefined, undefined, undefined]);
  });

  it('takes an upcoming boss whose start is out of range as a boss from now, a fraction floored', () => {
    const parsed = read(
      pokebattlerFeed({
        RAID_LEVEL_1_MAX: [
          { pokemonId: 'SNEASEL', upcoming: true, startDate: at('2026-11-01T10:00') + 0.5 },
          { pokemonId: 'MACHOP', upcoming: true, startDate: 1e17 },
          { pokemonId: 'ABRA', upcoming: true, startDate: at('2026-11-01T10:00') },
        ],
      }),
    );
    expect(parsed.bosses.map((boss) => boss.startsAt)).toEqual([
      at('2026-11-01T00:00'),
      undefined,
      at('2026-11-01T00:00'),
    ]);
  });
});

describe('maxBossesAt', () => {
  const NOW = at('2026-10-21T12:00');
  const row = (
    pokemonId: string,
    tier: MaxTier,
    firstSeen = NOW - 1,
  ): MaxFeedBoss & { firstSeen: number } => ({
    pokemonId,
    form: null,
    tier,
    shiny: false,
    name: pokemonId,
    firstSeen,
  });
  let id = 0;
  const override = (extra: Partial<NewBossOverride<MaxTier>>): BossOverride<MaxTier> => ({
    action: 'add',
    pokemonId: 'MACHAMP',
    form: null,
    tier: 'D2',
    shiny: null,
    expiresAt: null,
    createdBy: '123456789012345678',
    id: ++id,
    createdAt: NOW - 1000 + id,
    ...extra,
  });

  it('offers a boss from its start, by tier and then name', () => {
    const feed = [
      row('UXIE', 'D5', at('2026-10-24T00:00')),
      row('SNEASEL', 'D1'),
      row('MACHOP', 'D2'),
      row('ABRA', 'D1'),
    ];
    expect(maxBossesAt(feed, [], catalogue, NOW).map((boss) => [boss.name, boss.tier])).toEqual([
      ['Abra', 'D1'],
      ['Sneasel', 'D1'],
      ['Machop', 'D2'],
    ]);
    expect(
      maxBossesAt(feed, [], catalogue, at('2026-10-24T00:00')).map((boss) => boss.name),
    ).toContain('Uxie');
  });

  it('applies its own overrides: one Pokémon in two tiers, hidden in one', () => {
    const feed = [row('MACHAMP', 'D3')];
    const bosses = maxBossesAt(
      feed,
      [override({ tier: 'G', shiny: true }), override({ action: 'hide', tier: 'D3' })],
      catalogue,
      NOW,
    );
    expect(
      bosses.map((boss) => [boss.key, boss.tier, boss.shiny, boss.source, boss.autoset]),
    ).toEqual([['machamp', 'G', true, 'override', false]]);
  });
});

describe('maxBossesAt and comingMaxBosses: an add moves its boss within its kind (plan 8X-J)', () => {
  const NOW = at('2026-10-25T12:00');
  const row = (
    pokemonId: string,
    tier: MaxTier,
    extra: Partial<MaxFeedBoss & { firstSeen: number }> = {},
  ): MaxFeedBoss & { firstSeen: number } => ({
    pokemonId,
    form: null,
    tier,
    shiny: false,
    name: pokemonId,
    firstSeen: NOW - 1,
    ...extra,
  });
  let id = 100;
  const override = (extra: Partial<NewBossOverride<MaxTier>>): BossOverride<MaxTier> => ({
    action: 'add',
    pokemonId: 'SNEASEL',
    form: null,
    tier: 'D2',
    shiny: false,
    expiresAt: null,
    createdBy: '123456789012345678',
    id: ++id,
    createdAt: NOW - 1000 + id,
    ...extra,
  });
  const tiers = (bosses: readonly MaxBoss[], key = 'sneasel') =>
    bosses.filter((boss) => boss.key === key).map((boss) => [boss.tier, boss.source]);

  it('leaves out the feed row at another Dynamax tier: only the add’s tier stays', () => {
    const feed = [row('SNEASEL', 'D1'), row('MACHOP', 'D1')];
    const bosses = maxBossesAt(feed, [override({})], catalogue, NOW);
    expect(tiers(bosses)).toEqual([['D2', 'override']]);
    expect(tiers(bosses, 'machop')).toEqual([['D1', 'feed']]);
  });

  it('moves nothing when the add is hidden at its own tier: hide still beats add', () => {
    const feed = [row('SNEASEL', 'D1')];
    const bosses = maxBossesAt(
      feed,
      [override({}), override({ action: 'hide', shiny: null })],
      catalogue,
      NOW,
    );
    expect(tiers(bosses)).toEqual([['D1', 'feed']]);
  });

  it('keeps both of two adds of one boss, and the feed’s row where staff added it', () => {
    const feed = [row('SNEASEL', 'D1'), row('SNEASEL', 'D3')];
    const bosses = maxBossesAt(
      feed,
      [override({ tier: 'D1' }), override({ tier: 'D2' })],
      catalogue,
      NOW,
    );
    expect(tiers(bosses)).toEqual([
      ['D1', 'feed'],
      ['D2', 'override'],
    ]);
  });

  it('keeps Gigantamax apart: a Dynamax add leaves G alone, and a G add the stars', () => {
    const feed = [row('MACHAMP', 'D3'), row('MACHAMP', 'G')];
    const dynamax = maxBossesAt(
      feed,
      [override({ pokemonId: 'MACHAMP', tier: 'D2' })],
      catalogue,
      NOW,
    );
    expect(tiers(dynamax, 'machamp')).toEqual([
      ['D2', 'override'],
      ['G', 'feed'],
    ]);
    const gigantamax = maxBossesAt(
      [row('MACHAMP', 'D3')],
      [override({ pokemonId: 'MACHAMP', tier: 'G' })],
      catalogue,
      NOW,
    );
    expect(tiers(gigantamax, 'machamp')).toEqual([
      ['D3', 'feed'],
      ['G', 'override'],
    ]);
  });

  it('moves nothing once the add has expired', () => {
    const feed = [row('SNEASEL', 'D1')];
    const bosses = maxBossesAt(feed, [override({ expiresAt: NOW })], catalogue, NOW);
    expect(tiers(bosses)).toEqual([['D1', 'feed']]);
  });

  it('makes the moved boss shiny when the add or a moved feed row says so', () => {
    const shinyRow = maxBossesAt(
      [row('SNEASEL', 'D1', { shiny: true })],
      [override({})],
      catalogue,
      NOW,
    );
    expect(shinyRow.find((boss) => boss.key === 'sneasel')?.shiny).toBe(true);
    const shinyAdd = maxBossesAt(
      [row('SNEASEL', 'D1')],
      [override({ shiny: true })],
      catalogue,
      NOW,
    );
    expect(shinyAdd.find((boss) => boss.key === 'sneasel')?.shiny).toBe(true);
    const neither = maxBossesAt([row('SNEASEL', 'D1')], [override({})], catalogue, NOW);
    expect(neither.find((boss) => boss.key === 'sneasel')?.shiny).toBe(false);
  });

  it('keeps an upcoming row of a moved boss from coming back, and the coming list without adds', () => {
    const feed = [
      row('SNEASEL', 'D1', { firstSeen: NOW + 1000 }),
      row('UXIE', 'D5', { firstSeen: NOW + 1000 }),
    ];
    const add = override({});
    expect(tiers(comingMaxBosses(feed, [add], catalogue, NOW))).toEqual([]);
    expect(comingMaxBosses(feed, [add], catalogue, NOW).map((boss) => boss.key)).toEqual(['uxie']);
    expect(tiers(maxBossesAt(feed, [add], catalogue, NOW))).toEqual([['D2', 'override']]);
    expect(tiers(maxBossesAt(feed, [add], catalogue, NOW + 2000))).toEqual([['D2', 'override']]);
    expect(tiers(comingMaxBosses(feed, [], catalogue, NOW))).toEqual([['D1', 'feed']]);
  });
});

describe('maxOverrideProblem', () => {
  const base: NewBossOverride<MaxTier> = {
    action: 'add',
    pokemonId: 'MACHAMP',
    form: null,
    tier: 'D2',
    shiny: false,
    expiresAt: null,
    createdBy: '123456789012345678',
  };
  const NOW = at('2026-10-21T12:00');

  it('takes an add, a hide and a shiny override of a max tier', () => {
    expect(maxOverrideProblem(base, NOW)).toBeUndefined();
    expect(maxOverrideProblem({ ...base, action: 'hide', shiny: null }, NOW)).toBeUndefined();
    expect(
      maxOverrideProblem({ ...base, action: 'shiny', tier: 'G', shiny: true }, NOW),
    ).toBeUndefined();
  });

  it('refuses one without a max tier: a shiny override for every tier is a raid one', () => {
    expect(maxOverrideProblem({ ...base, action: 'shiny', tier: null, shiny: true }, NOW)).toMatch(
      /max battle tier/,
    );
    expect(maxOverrideProblem({ ...base, tier: 'T5' as MaxTier }, NOW)).toMatch(/max battle tier/);
  });

  it('refuses an autoset: a max battle has no egg', () => {
    expect(maxOverrideProblem({ ...base, action: 'autoset', shiny: null }, NOW)).toMatch(/egg/);
  });

  it('refuses what a raid override refuses', () => {
    expect(maxOverrideProblem({ ...base, pokemonId: 'machamp' }, NOW)).toMatch(/Pokémon id/);
    expect(maxOverrideProblem({ ...base, expiresAt: NOW }, NOW)).toMatch(/future/);
    expect(maxOverrideProblem({ ...base, action: 'shiny', shiny: null }, NOW)).toMatch(/shiny/);
  });
});
