import { describe, expect, it } from 'vitest';
import {
  EAST_CHANNEL,
  TEST_GUILD_ROW,
  testGyms,
  testRegions,
  WEST_CHANNEL,
} from '../../../test/support/gyms.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { at, PARTY_NOW, PARTY_ZONE } from '../../../test/support/parties.js';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { UserError } from '../../discord/errors.js';
import { raid } from './raid.js';
import { bossIdsOf, type RaidBoss } from '../../domain/pogo/raid-bosses.js';
import { CURATED_NICKNAMES } from '../../domain/pogo/nicknames.js';
import { mergeNicknames, PokemonSearch } from '../../domain/pogo/pokemon-search.js';
import { raidTier, sameRaidTier, type RaidLevel } from '../../domain/pogo/raid-tier.js';
import {
  bossChoices,
  gymChoices,
  reportedBoss,
  reportedGym,
  reportedTime,
  trainBossChoices,
  type ReportedBoss,
} from './raid-input.js';

/** The fixture has 14 bosses, among them Yveltal (T5), Shadow Landorus (T5) and Mega Blastoise. */
const { ctx } = createTestContext();
const T5 = { level: 'T5', shadow: false } as const;

/** What `/raid` and the map answer an Elite egg reported without its time (review 8E-1). */
const ELITE_EGG_WORDS =
  'An Elite egg shows when it hatches: give its hatch time, in minutes from now (`20`) or as a clock time (`6:15pm`).';

describe('bossChoices', () => {
  it('offers the current bosses first, then an egg for every tier', () => {
    const choices = bossChoices(ctx, '', PARTY_ZONE);
    // Fourteen bosses, and an egg for each of the seven levels and the three shadow tiers.
    expect(choices).toHaveLength(24);
    expect(choices[0]).toEqual({ name: 'Pikachu (T1)', value: 'b:pikachu:T1:0' });
    expect(choices[13]).toEqual({
      name: 'Mega Blastoise (Mega)',
      value: 'b:blastoise_mega:Mega:0',
    });
    expect(choices[14]).toEqual({ name: 'T1 egg', value: 'e:T1:0' });
    expect(choices[15]).toEqual({ name: 'Shadow T1 egg', value: 'e:T1:1' });
    expect(choices.map((choice) => choice.name)).toContain('Elite egg');
    expect(choices.map((choice) => choice.name)).not.toContain('EX egg');
  });

  it('narrows to what was typed, by name or by tier, whatever the case', () => {
    expect(bossChoices(ctx, 'yve', PARTY_ZONE)).toEqual([
      { name: 'Yveltal (T5)', value: 'b:yveltal:T5:0' },
    ]);
    expect(bossChoices(ctx, 'T5', PARTY_ZONE).map((choice) => choice.name)).toEqual([
      'Yveltal (T5)',
      'Landorus (Incarnate Forme) (Shadow T5)',
      'T5 egg',
      'Shadow T5 egg',
    ]);
    expect(bossChoices(ctx, 'shadow egg', PARTY_ZONE).map((choice) => choice.name)).toEqual([
      'Shadow T1 egg',
      'Shadow T3 egg',
      'Shadow T5 egg',
    ]);
    expect(bossChoices(ctx, 'zzz', PARTY_ZONE)).toEqual([]);
  });

  // Staging of 2026-11-07: "tier 1" found nothing, though `/raid` reads it as a T1 egg.
  it('reads a tier spelled as a report reads it: tier 1, level 5, tier1, 5 star, as T1, T5', () => {
    const names = (typed: string) =>
      bossChoices(ctx, typed, PARTY_ZONE).map((choice) => choice.name);
    const t5 = names('t5');
    for (const typed of ['tier 5', 'level 5', 'tier5', 'Level5', '5 star', '5-star']) {
      expect(names(typed)).toEqual(t5);
    }
    expect(names('tier 1')).toEqual(names('t1'));
    expect(names('level 1')).toContain('T1 egg');
    expect(names('tier 5 egg')).toEqual(['T5 egg', 'Shadow T5 egg']);
    expect(names('shadow tier 3')).toEqual(names('shadow t3'));
    expect(names('shadow tier 3')).toContain('Shadow T3 egg');
    expect(names('mega')).toEqual(
      expect.arrayContaining(['Mega egg', 'Mega Legendary egg', 'Super Mega egg']),
    );
    // A name keeps its own words: no tier is read inside it.
    expect(names('yve')).toEqual(['Yveltal (T5)']);
  });

  it('finds a boss by a nickname, after the bosses whose name fits', () => {
    const catalogue = catalogueFixture();
    const search = new PokemonSearch(
      catalogue,
      mergeNicknames(catalogue, CURATED_NICKNAMES, {
        landorus_incarnate: ['genie'],
        yveltal: ['deathbird'],
      }),
    );
    const { ctx: nicknamed } = createTestContext({
      pokemon: {
        search: (text, options) => search.search(text, options),
        find: (text, options) => search.find(text, options),
        exact: (text) => search.exact(text),
      },
    });
    expect(bossChoices(nicknamed, 'genie', PARTY_ZONE)).toEqual([
      { name: 'Landorus (Incarnate Forme) (Shadow T5)', value: 'b:landorus_incarnate:T5:1' },
    ]);
    // The beginning of a nickname, as of a name.
    expect(bossChoices(nicknamed, 'death', PARTY_ZONE).map((choice) => choice.name)).toEqual([
      'Yveltal (T5)',
    ]);
    // A nickname of a Pokémon that is no boss offers nothing.
    expect(bossChoices(nicknamed, 'noodle', PARTY_ZONE)).toEqual([]);
  });
});

describe('reportedBoss', () => {
  it('reads every value the choices offer back as what was picked', () => {
    for (const choice of bossChoices(ctx, '', PARTY_ZONE)) {
      expect(reportedBoss(ctx, choice.value, PARTY_ZONE).label).toBe(choice.name);
    }
    expect(reportedBoss(ctx, 'e:T5:0', PARTY_ZONE)).toEqual({
      tier: T5,
      boss: null,
      label: 'T5 egg',
    });
    expect(reportedBoss(ctx, 'b:yveltal:T5:0', PARTY_ZONE)).toEqual({
      tier: T5,
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
  });

  it('reads a typed tier as an egg', () => {
    const egg = (text: string) => reportedBoss(ctx, text, PARTY_ZONE);
    expect(egg('t5')).toMatchObject({ tier: T5, boss: null });
    expect(egg('5')).toMatchObject({ tier: T5, boss: null });
    expect(egg('Tier 5 egg')).toMatchObject({ tier: T5, boss: null });
    expect(egg('shadow t3')).toMatchObject({ tier: { level: 'T3', shadow: true }, boss: null });
    expect(egg('mega')).toMatchObject({ tier: { level: 'Mega', shadow: false } });
    expect(egg('mega legendary')).toMatchObject({
      tier: { level: 'MegaLegendary', shadow: false },
    });
    expect(egg('super mega egg')).toMatchObject({ tier: { level: 'SuperMega', shadow: false } });
    expect(egg('elite')).toMatchObject({ tier: { level: 'Elite', shadow: false } });
  });

  it('knows no EX tier any more: the word names no egg', () => {
    for (const text of ['ex', 'EX raid', 'exclusive']) {
      expect(() => reportedBoss(ctx, text, PARTY_ZONE), text).toThrow(UserError);
    }
  });

  it('reads a typed name of a current boss, also half typed, with its tier from the list', () => {
    expect(reportedBoss(ctx, 'Yveltal', PARTY_ZONE)).toMatchObject({
      tier: T5,
      boss: { key: 'yveltal' },
    });
    expect(reportedBoss(ctx, 'yvel', PARTY_ZONE)).toMatchObject({ boss: { key: 'yveltal' } });
    expect(reportedBoss(ctx, 'mega blastoise', PARTY_ZONE)).toMatchObject({
      tier: { level: 'Mega', shadow: false },
      boss: { key: 'blastoise_mega' },
    });
    expect(reportedBoss(ctx, 'landorus', PARTY_ZONE)).toMatchObject({
      tier: { level: 'T5', shadow: true },
      boss: { key: 'landorus_incarnate' },
    });
  });

  it('takes any Pokémon as a boss when its tier comes first', () => {
    expect(reportedBoss(ctx, 't5 mewtwo', PARTY_ZONE)).toEqual({
      tier: T5,
      boss: { key: 'mewtwo' },
      label: 'Mewtwo (T5)',
    });
    expect(reportedBoss(ctx, 't3 mewtwo', PARTY_ZONE)).toMatchObject({
      tier: { level: 'T3', shadow: false },
      boss: { key: 'mewtwo' },
    });
  });

  it('says what would work for a Pokémon that is no current boss, and for text it cannot read', () => {
    expect(() => reportedBoss(ctx, 'mewtwo', PARTY_ZONE)).toThrow(
      'Mewtwo is not on the current boss list. To report it anyway, put its tier first, for example `t3 mewtwo` or `t5 mewtwo`.',
    );
    expect(() => reportedBoss(ctx, 'qwertyuiop', PARTY_ZONE)).toThrow(UserError);
    expect(() => reportedBoss(ctx, 'a', PARTY_ZONE)).toThrow(
      'I do not know a raid boss or tier called "a"',
    );
    expect(() => reportedBoss(ctx, 'shadow mega', PARTY_ZONE)).toThrow(UserError);
    expect(() => reportedBoss(ctx, '**@everyone**', PARTY_ZONE)).toThrow(/\\\*\\\*@\u200beveryone/);
  });

  it('refuses a choice whose boss has left the list, and a damaged value', () => {
    expect(() => reportedBoss(ctx, 'b:zekrom:T5:0', PARTY_ZONE)).toThrow('no longer on the list');
    expect(() => reportedBoss(ctx, 'b:yveltal:T3:0', PARTY_ZONE)).toThrow('no longer on the list');
    expect(() => reportedBoss(ctx, 'e:T9:0', PARTY_ZONE)).toThrow(UserError);
    expect(() => reportedBoss(ctx, 'e:Mega:1', PARTY_ZONE)).toThrow(UserError);
  });
});

describe('gymChoices and reportedGym', () => {
  const regionName = (channelId: string) => (channelId === EAST_CHANNEL ? 'east' : 'west');

  it("offers the region's own gyms by name until something is typed", () => {
    const offered = gymChoices(ctx.gyms.of(1), WEST_CHANNEL, '  ', regionName);
    expect(offered.map((choice) => choice.value)).toEqual(
      testGyms()
        .filter((gym) => ctx.gyms.of(TEST_GUILD_ROW).regionsOf(gym.id).includes(WEST_CHANNEL))
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
        .map((gym) => `g:${String(gym.id)}`),
    );
    expect(offered).toContainEqual({ name: 'Pinewood Public Library · The Stacks', value: 'g:1' });
    // Outside a region there is no telling which gyms to offer.
    expect(gymChoices(ctx.gyms.of(1), undefined, '', regionName)).toEqual([]);
  });

  it('offers the gyms that fit, with nickname, and the region of one that lies elsewhere', () => {
    expect(gymChoices(ctx.gyms.of(1), WEST_CHANNEL, 'library', regionName)).toEqual([
      { name: 'Pinewood Public Library · The Stacks', value: 'g:1' },
    ]);
    // Gym 7 lies in East, just over the border of West.
    expect(gymChoices(ctx.gyms.of(1), WEST_CHANNEL, 'lighthouse', regionName)).toEqual([
      { name: 'Harbor Lighthouse Mural · east', value: 'g:7' },
    ]);
    const starbucks = gymChoices(ctx.gyms.of(1), undefined, 'starbucks', regionName);
    expect(starbucks.map((choice) => choice.value).sort()).toEqual(['g:5', 'g:9']);
  });

  it('takes a picked gym by its id', () => {
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'g:7')).toMatchObject({
      kind: 'gym',
      gym: { id: 7 },
    });
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'g:999')).toEqual({ kind: 'none' });
  });

  it('acts on typed text only when exactly one gym has every word as typed', () => {
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'stone fountain')).toMatchObject({
      kind: 'gym',
      gym: { id: 2 },
    });
    // Misspelt: found, but offered, not acted on.
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'fountian')).toMatchObject({
      kind: 'several',
      gyms: [{ id: 2 }],
    });
    // Two gyms have the word.
    const pinewood = reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'pinewood');
    expect(pinewood.kind).toBe('several');
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'zzzzzz')).toEqual({ kind: 'none' });
  });

  it("looks in the server's other regions when no gym here or next door has every word", () => {
    // Gym 8 lies deep in East, not next to West (Matt, 2026-10-11).
    expect(gymChoices(ctx.gyms.of(1), WEST_CHANNEL, 'fresco', regionName)).toEqual([
      { name: 'Café Élan Fresco · east', value: 'g:8' },
    ]);
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'fresco')).toMatchObject({
      kind: 'gym',
      gym: { id: 8 },
    });
    // A good match here keeps the search here: West has its own Starbucks.
    expect(gymChoices(ctx.gyms.of(1), WEST_CHANNEL, 'starbucks', regionName)).toEqual([
      { name: 'Starbucks', value: 'g:5' },
    ]);
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'starbucks')).toMatchObject({
      gym: { id: 5 },
    });
    // Gym 10 lies in no region: from a region it is not offered.
    expect(gymChoices(ctx.gyms.of(1), WEST_CHANNEL, 'trailhead', regionName)).toEqual([]);
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'trailhead')).toEqual({ kind: 'none' });
  });

  it('searches the server’s gyms from a channel whose region row is of no server, as from no region (plan 19B-2)', () => {
    // Two regions without a server are no regions of this one.
    const unowned = testRegions().map((region) => ({ ...region, guildId: null }));
    const gyms = gymsFixture([], { regions: unowned }).of(TEST_GUILD_ROW);
    expect(gyms.isRegion(WEST_CHANNEL)).toBe(false);
    // Not West's gyms first: every gym of the server, by name.
    expect(reportedGym(gyms, WEST_CHANNEL, 'fresco')).toMatchObject({
      kind: 'gym',
      gym: { id: 8 },
    });
    expect(reportedGym(gyms, WEST_CHANNEL, 'starbucks')).toMatchObject({
      kind: 'several',
      everyWord: [5, 9],
    });
    expect(gymChoices(gyms, WEST_CHANNEL, 'trailhead', regionName)).toEqual([
      { name: 'Lakeview Trailhead', value: 'g:10' },
    ]);
  });
});

describe('gymChoices and reportedGym among the gyms a caller accepts', () => {
  const regionName = (channelId: string) => (channelId === EAST_CHANNEL ? 'east' : 'west');
  const mine = new Set([2, 8, 9]);
  const accepts = (gym: { id: number }) => mine.has(gym.id);

  it('never answers with a gym that is not accepted, picked or typed', () => {
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'g:1', accepts)).toEqual({ kind: 'none' });
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'g:2', accepts)).toMatchObject({
      gym: { id: 2 },
    });
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'library', accepts)).toEqual({ kind: 'none' });
    expect(reportedGym(ctx.gyms.of(1), undefined, 'library', accepts)).toEqual({ kind: 'none' });
  });

  it('acts on a text that one accepted gym has every word of, though others have them too', () => {
    // West has its own Starbucks (gym 5), which is not accepted: the one in East is meant.
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'starbucks', accepts)).toMatchObject({
      kind: 'gym',
      gym: { id: 9 },
    });
    expect(reportedGym(ctx.gyms.of(1), undefined, 'starbucks', accepts)).toMatchObject({
      gym: { id: 9 },
    });
    expect(reportedGym(ctx.gyms.of(1), WEST_CHANNEL, 'fresco', accepts)).toMatchObject({
      gym: { id: 8 },
    });
  });

  it('offers only accepted gyms', () => {
    expect(gymChoices(ctx.gyms.of(1), WEST_CHANNEL, '', regionName, accepts)).toEqual([
      { name: 'Old Stone Fountain', value: 'g:2' },
    ]);
    expect(gymChoices(ctx.gyms.of(1), undefined, 'starbucks', regionName, accepts)).toEqual([
      { name: 'Starbucks · east', value: 'g:9' },
    ]);
    expect(gymChoices(ctx.gyms.of(1), WEST_CHANNEL, 'library', regionName, accepts)).toEqual([]);
  });
});

describe('reportedTime', () => {
  const egg: ReportedBoss = { tier: T5, boss: null, label: 'T5 egg' };
  const boss: ReportedBoss = { tier: T5, boss: { key: 'yveltal' }, label: 'Yveltal (T5)' };

  it('is nothing for no text', () => {
    expect(reportedTime(ctx, egg, null, PARTY_NOW, PARTY_ZONE)).toBeUndefined();
    expect(reportedTime(ctx, egg, '  ', PARTY_NOW, PARTY_ZONE)).toBeUndefined();
  });

  // Review 8E-1: an elite egg without its time would stand a day at its gym and block it.
  it('refuses an Elite egg without its hatch time, and takes an Elite raid seen hatched without one', () => {
    const elite = { level: 'Elite', shadow: false } as const;
    const eliteEgg: ReportedBoss = { tier: elite, boss: null, label: 'Elite egg' };
    const hatched: ReportedBoss = { tier: elite, boss: { name: 'unknown' }, label: '' };
    for (const text of [null, '  ']) {
      expect(() => reportedTime(ctx, eliteEgg, text, PARTY_NOW, PARTY_ZONE)).toThrow(
        new UserError(ELITE_EGG_WORDS),
      );
      expect(reportedTime(ctx, hatched, text, PARTY_NOW, PARTY_ZONE)).toBeUndefined();
    }
    expect(reportedTime(ctx, eliteEgg, '6:15pm', PARTY_NOW, PARTY_ZONE)).toEqual({
      hatch: at('2026-10-13T18:15'),
    });
  });

  it('reads an Elite egg’s hatch past midnight as tomorrow 12am, as the help says (review of 2026-11-07)', () => {
    const elite = { level: 'Elite', shadow: false } as const;
    const eliteEgg: ReportedBoss = { tier: elite, boss: null, label: 'Elite egg' };
    const evening = at('2026-10-13T22:00');
    expect(() => reportedTime(ctx, eliteEgg, '12am', evening, PARTY_ZONE)).toThrow(UserError);
    expect(reportedTime(ctx, eliteEgg, 'tomorrow 12am', evening, PARTY_ZONE)).toEqual({
      hatch: at('2026-10-14T00:00'),
    });
    const help = raid.help?.details;
    expect(typeof help === 'string' ? help : '').toContain('`tomorrow 12am`');
  });

  it('reads the hatch time of an egg and the end time of a boss', () => {
    expect(reportedTime(ctx, egg, '20', PARTY_NOW, PARTY_ZONE)).toEqual({
      hatch: at('2026-10-13T14:20'),
    });
    expect(reportedTime(ctx, egg, 'at 2:45pm', PARTY_NOW, PARTY_ZONE)).toEqual({
      hatch: at('2026-10-13T14:45'),
    });
    expect(reportedTime(ctx, boss, 'in 30', PARTY_NOW, PARTY_ZONE)).toEqual({
      end: at('2026-10-13T14:30'),
    });
  });

  it('allows no more than the usual time on a Raid Day, whose bosses stay 30 minutes', () => {
    // Saturday 31 October 2026, Raid Day 14:00 to 17:00: an egg seen now can end up to 105 minutes
    // from now, as on any other day (a boss that hatched before the day stays 45).
    const now = at('2026-10-31T14:30');
    expect(reportedTime(ctx, boss, '100', now, PARTY_ZONE)).toEqual({
      end: at('2026-10-31T16:10'),
    });
    expect(() => reportedTime(ctx, boss, '110', now, PARTY_ZONE)).toThrow(UserError);
  });

  it('allows the longer raids of a Raid Day when the rules say a boss stays longer', () => {
    const now = at('2026-10-31T14:30');
    const base = createTestContext();
    const { settings } = base.ctx.config;
    const long = createTestContext({
      config: {
        ...base.ctx.config,
        settings: {
          ...settings,
          raidEvents: {
            ...settings.raidEvents,
            hatchedDuration: { ...settings.raidEvents.hatchedDuration, 'raid-day': 60 },
          },
        },
      },
    }).ctx;
    expect(reportedTime(long, boss, '110', now, PARTY_ZONE)).toEqual({
      end: at('2026-10-31T16:20'),
    });
    expect(() => reportedTime(long, boss, '110', PARTY_NOW, PARTY_ZONE)).toThrow(UserError);
  });

  it('says what a time must be when it cannot be right, and when it is no time', () => {
    expect(() => reportedTime(ctx, egg, '90', PARTY_NOW, PARTY_ZONE)).toThrow(
      /cannot be the time the egg hatches: it must be between <t:\d+:t> and <t:\d+:t>\./,
    );
    expect(() => reportedTime(ctx, boss, 'soon', PARTY_NOW, PARTY_ZONE)).toThrow(
      'I could not read "soon" as the time the raid ends.',
    );
  });
});

/** A boss of the list in effect, for a test; the Pokémon is looked up in the fixture catalogue. */
function listed(key: string, level: RaidLevel, shadow = false): RaidBoss {
  const entry = catalogueFixture().byKey(key);
  if (!entry) throw new Error(`no ${key} in the fixture`);
  const tier = raidTier(level, shadow);
  if (!tier) throw new Error(`no shadow ${level}`);
  return {
    ...bossIdsOf(entry),
    key,
    tier,
    shiny: false,
    name: entry.name,
    entry,
    source: 'feed',
    autoset: false,
  };
}

/** A boss the game master does not know, as the feed names it. */
function unknownBoss(name: string, level: RaidLevel): RaidBoss {
  const tier = raidTier(level);
  if (!tier) throw new Error('no tier');
  return {
    pokemonId: 'NEWMON',
    form: null,
    key: 'newmon',
    tier,
    shiny: false,
    name,
    entry: undefined,
    source: 'feed',
    autoset: false,
  };
}

function contextWith(list: RaidBoss[]) {
  return createTestContext({
    raidBosses: {
      bosses: () => list,
      bossesOf: (tier) => list.filter((boss) => sameRaidTier(boss.tier, tier)),
      autoset: () => undefined,
    },
  }).ctx;
}

describe('trainBossChoices', () => {
  const names = (list: RaidBoss[], typed: string) =>
    trainBossChoices(contextWith(list), typed, PARTY_ZONE).map((choice) => choice.name);

  it('offers the current bosses, each Pokémon once, while nothing is typed', () => {
    const list = [listed('yveltal', 'T5'), listed('gastly', 'T1'), listed('gastly', 'T1', true)];
    expect(names(list, '')).toEqual(['Yveltal', 'Gastly']);
  });

  it('puts the bosses a text finds by name first, in the order of the search, then the rest', () => {
    // Listed in another order than the search has them; Staryu is no boss.
    const list = [listed('starmie', 'T3'), listed('starly', 'T1'), listed('yveltal', 'T5')];
    expect(names(list, 'star')).toEqual([
      'Starly',
      'Starmie',
      'Staryu',
      'Staravia',
      'Staraptor',
      'Mega Starmie',
      'Furfrou (Star Trim)',
    ]);
    // A boss with the letters in the middle of its name is not found by them, as elsewhere.
    expect(names([listed('yveltal', 'T5')], 'elt')).toEqual([]);
    // A boss found only by its number stands where the search has it, not before the names.
    expect(names([listed('venusaur', 'T3'), listed('charmander', 'T1')], '3')[0]).toBe('Venusaur');
    expect(names([listed('mewtwo', 'T5')], '15').indexOf('Mewtwo')).toBeGreaterThan(0);
  });

  it('puts the Pokémon a text names in full before the bosses', () => {
    const list = [listed('mewtwo', 'T5'), listed('yveltal', 'T5')];
    expect(names(list, 'mew').slice(0, 2)).toEqual(['Mew', 'Mewtwo']);
    expect(names(list, 'mewt')[0]).toBe('Mewtwo');
  });

  it('finds a boss by its name however many Pokémon the text finds before it', () => {
    // The bosses of the fixture, Starmie and Mega Blastoise among them: a single letter finds
    // hundreds of Pokémon. The Unown of that letter, which it names in full, no longer leads
    // (the audit of 2026-11-07): the names it begins come first.
    const fixture = (typed: string) =>
      trainBossChoices(ctx, typed, PARTY_ZONE).map((choice) => choice.name);
    const s = fixture('s');
    expect(s.slice(0, 2)).toEqual(['Shieldon', 'Starmie']);
    expect(s.slice(0, 25)).not.toContain('Unown (S)');
    const m = fixture('m');
    expect(m.indexOf('Mega Blastoise')).toBe(0);
    // Arcanine stands near the top, though Arceus has eighteen entries.
    expect(fixture('arc').indexOf('Arcanine')).toBeLessThan(12);
    expect(fixture('ar')).toContain('Arcanine');
    // Silcoon beside Silvally and its eighteen types; Forretress beside every Forme.
    const sil = fixture('sil');
    expect(sil.indexOf('Silcoon')).toBeGreaterThanOrEqual(0);
    expect(sil.indexOf('Silcoon')).toBeLessThan(8);
    expect(fixture('for')).toContain('Forretress');
  });

  it('offers a guess only when the name shows the word that was guessed', () => {
    const fixture = (typed: string) =>
      trainBossChoices(ctx, typed, PARTY_ZONE).map((choice) => choice.name);
    // `percent` (a word of Zygarde's keys) is a guess for `perfect` that no name shows.
    expect(fixture('perfect')).toEqual([]);
    // A guess whose name shows the word stays, as in the list of `/want`: `meadow` for
    // `shadow`, `rapid` for `raid` (the style, never a bare Urshifu), Lugia for `lugai`.
    expect(fixture('shadow')).toContain('Scatterbug (Meadow Pattern)');
    expect(fixture('raid')).toEqual(['Urshifu (Rapid Strike Style)']);
    expect(fixture('lugai')).toEqual(['Lugia']);
  });

  it('finds Tyranitar and Typhlosion for the beginning of their names', () => {
    for (const typed of ['ty', 'typ']) {
      const found = names([listed('yveltal', 'T5')], typed);
      expect(found.length, typed).toBeLessThanOrEqual(25);
      expect(found, typed).toContain('Typhlosion');
    }
    expect(names([listed('yveltal', 'T5')], 'ty')).toContain('Tyranitar');
    // As a boss it goes before Type: Null, which the class would otherwise put first.
    expect(names([listed('tyranitar', 'T5')], 'ty').slice(0, 2)).toEqual([
      'Tyranitar',
      'Type: Null',
    ]);
  });

  it('finds a boss the game master does not know by the words of its name', () => {
    const list = [unknownBoss('Bloodmoon Ursaluna', 'T5'), listed('yveltal', 'T5')];
    expect(names(list, 'blood')).toEqual(['Bloodmoon Ursaluna']);
    expect(names(list, 'ursa')[0]).toBe('Bloodmoon Ursaluna');
  });
});

describe('reportedBoss against a list of bosses', () => {
  it('reads a Mega boss by the name of its Pokémon', () => {
    const list = contextWith([listed('rayquaza_mega', 'MegaLegendary'), listed('yveltal', 'T5')]);
    expect(reportedBoss(list, 'mega rayquaza', PARTY_ZONE)).toMatchObject({
      tier: { level: 'MegaLegendary', shadow: false },
      boss: { key: 'rayquaza_mega' },
    });
  });

  it('lets an exact name win over the longer names it begins', () => {
    const mew = contextWith([listed('mewtwo', 'T5'), listed('mew', 'T3')]);
    expect(reportedBoss(mew, 'mew', PARTY_ZONE)).toMatchObject({ boss: { key: 'mew' } });
    expect(reportedBoss(mew, 'MEW', PARTY_ZONE)).toMatchObject({ boss: { key: 'mew' } });
    expect(reportedBoss(mew, 'mewtw', PARTY_ZONE)).toMatchObject({ boss: { key: 'mewtwo' } });
    const charizard = contextWith([listed('charizard_mega_x', 'Mega'), listed('charizard', 'T5')]);
    expect(reportedBoss(charizard, 'charizard', PARTY_ZONE)).toMatchObject({
      tier: { level: 'T5', shadow: false },
      boss: { key: 'charizard' },
    });
    expect(reportedBoss(charizard, 'mega charizard x', PARTY_ZONE)).toMatchObject({
      boss: { key: 'charizard_mega_x' },
    });
  });

  it('names up to three bosses when a half-typed name fits several', () => {
    const several = contextWith([
      listed('machop', 'T1'),
      listed('machop', 'T1', true),
      listed('machamp', 'T3'),
    ]);
    expect(() => reportedBoss(several, 'mach', PARTY_ZONE)).toThrow(
      '"mach" could be Machop (T1), Machop (Shadow T1) or Machamp (T3). Pick one from the list.',
    );
    const four = contextWith([
      listed('machop', 'T1'),
      listed('machoke', 'T3'),
      listed('machamp', 'T5'),
      listed('machop', 'T3'),
    ]);
    expect(() => reportedBoss(four, 'mach', PARTY_ZONE)).toThrow(
      '"mach" could be Machop (T1), Machoke (T3) or Machamp (T5). Pick one from the list.',
    );
  });

  it('reads the name of every choice the list offers as that choice', () => {
    const list = [
      listed('machop', 'T1'),
      listed('machop', 'T1', true),
      listed('machamp', 'T3'),
      listed('mew', 'T3'),
      listed('mewtwo', 'T5'),
      listed('charizard', 'T5'),
      listed('charizard_mega_x', 'Mega'),
      listed('rayquaza_mega', 'MegaLegendary'),
      listed('landorus_incarnate', 'T5', true),
    ];
    for (const context of [contextWith(list), ctx]) {
      for (const choice of bossChoices(context, '', PARTY_ZONE)) {
        expect(reportedBoss(context, choice.name, PARTY_ZONE), choice.name).toEqual(
          reportedBoss(context, choice.value, PARTY_ZONE),
        );
      }
    }
  });

  it('reads a nickname of a Pokémon that is a current boss, in the tier it is listed in', () => {
    const list = contextWith([listed('tyranitar', 'T3'), listed('yveltal', 'T5')]);
    expect(reportedBoss(list, 'ttar', PARTY_ZONE)).toMatchObject({
      tier: { level: 'T3', shadow: false },
      boss: { key: 'tyranitar' },
    });
  });

  it('reads shadow before a name as the shadow boss', () => {
    expect(reportedBoss(ctx, 'shadow landorus', PARTY_ZONE)).toMatchObject({
      tier: { level: 'T5', shadow: true },
      boss: { key: 'landorus_incarnate' },
    });
  });

  it('says that a listed boss is a shadow raid when a plain tier was typed with its name', () => {
    expect(() => reportedBoss(ctx, 't5 landorus', PARTY_ZONE)).toThrow(
      /shadow raid, not a plain T5 raid/,
    );
    const plainOnly = contextWith([listed('landorus_incarnate', 'T5')]);
    expect(() => reportedBoss(plainOnly, 'shadow t5 landorus', PARTY_ZONE)).toThrow(
      /plain raid, not a Shadow T5 raid/,
    );
  });

  it('takes any Pokémon after a tier that does not clash with the list', () => {
    const list = contextWith([listed('yveltal', 'T5')]);
    expect(reportedBoss(list, 't3 mewtwo', PARTY_ZONE)).toMatchObject({
      tier: { level: 'T3', shadow: false },
      boss: { key: 'mewtwo' },
    });
  });

  it('refuses a tier that contradicts the list for a boss that is listed in another tier', () => {
    const list = contextWith([listed('yveltal', 'T5'), listed('mewtwo', 'T5')]);
    expect(() => reportedBoss(list, 't3 yveltal', PARTY_ZONE)).toThrow(
      new UserError(
        'Yveltal is a T5 raid right now. Pick it from the list, or leave the tier out.',
      ),
    );
    expect(() => reportedBoss(list, 'tier 1 mewtwo', PARTY_ZONE)).toThrow(
      /Mewtwo is a T5 raid right now/,
    );
    // The tier the list has is fine.
    expect(reportedBoss(list, 't5 yveltal', PARTY_ZONE)).toMatchObject({
      boss: { key: 'yveltal' },
    });
  });

  it('reads a nickname after a tier as the boss listed in that tier', () => {
    const list = contextWith([listed('cresselia', 'T5'), listed('yveltal', 'T5')]);
    expect(reportedBoss(list, 't5 regiduck', PARTY_ZONE)).toEqual({
      tier: T5,
      boss: { key: 'cresselia' },
      label: 'Cresselia (T5)',
    });
    expect(() => reportedBoss(list, 't3 regiduck', PARTY_ZONE)).toThrow(
      'Cresselia is a T5 raid right now. Pick it from the list, or leave the tier out.',
    );
  });

  it('words the article of a tier by its first sound', () => {
    const list = contextWith([listed('yveltal', 'T5'), listed('mewtwo', 'Elite')]);
    expect(() => reportedBoss(list, 't3 mewtwo', PARTY_ZONE)).toThrow(
      'Mewtwo is an Elite raid right now. Pick it from the list, or leave the tier out.',
    );
  });

  it('names the mega forms of a Pokémon that has several, instead of not knowing it', () => {
    const list = contextWith([listed('yveltal', 'T5')]);
    expect(() => reportedBoss(list, 'mega charizard', PARTY_ZONE)).toThrow(
      new UserError(
        '"mega charizard" could be Mega Charizard X or Mega Charizard Y: type the full name.',
      ),
    );
    // One form is enough to name it.
    expect(reportedBoss(list, 'mega charizard x', PARTY_ZONE)).toMatchObject({
      tier: { level: 'Mega', shadow: false },
      boss: { key: 'charizard_mega_x' },
    });
  });

  it('reads tier5, 5 star and 5-star as the tier', () => {
    const list = contextWith([listed('yveltal', 'T5')]);
    for (const [text, level] of [
      ['tier5', 'T5'],
      ['Tier3', 'T3'],
      ['5 star', 'T5'],
      ['5-star', 'T5'],
      ['1 stars', 'T1'],
      ['3-star egg', 'T3'],
    ] as const) {
      expect(reportedBoss(list, text, PARTY_ZONE), text).toMatchObject({
        tier: { level, shadow: false },
        boss: null,
      });
    }
    expect(reportedBoss(list, '5-star mewtwo', PARTY_ZONE)).toMatchObject({
      tier: { level: 'T5' },
      boss: { key: 'mewtwo' },
    });
  });

  it('never turns mega and a name into the plain Pokémon', () => {
    const list = contextWith([listed('mewtwo', 'T5')]);
    expect(() => reportedBoss(list, 'mega mewtwo', PARTY_ZONE)).toThrow(UserError);
    expect(() => reportedBoss(list, 'mega yveltal', PARTY_ZONE)).toThrow(UserError);
    const megas = contextWith([listed('charizard_mega_x', 'Mega')]);
    expect(reportedBoss(megas, 'mega charizard x', PARTY_ZONE)).toMatchObject({
      boss: { key: 'charizard_mega_x' },
    });
  });

  it('names the tiers a listed Pokémon has when its tier was not typed', () => {
    const both = contextWith([listed('tyranitar', 'T3'), listed('tyranitar', 'T5')]);
    expect(() => reportedBoss(both, 'ttar', PARTY_ZONE)).toThrow(
      '"ttar" could be Tyranitar (T3) or Tyranitar (T5). Pick one from the list.',
    );
  });

  it('refuses damaged values and texts with less than two letters', () => {
    for (const text of ['b:', 'e:::', 'e:T5:2', 'e:T5:', 'a', ' x ', '::', '!!']) {
      expect(() => reportedBoss(ctx, text, PARTY_ZONE), text).toThrow(UserError);
    }
  });

  it('puts the name of a boss from the feed through plain wherever it is shown', () => {
    const context = contextWith([
      unknownBoss('*Odd* Boss', 'T5'),
      unknownBoss('*Odd* Other', 'T3'),
    ]);
    expect(reportedBoss(context, 'b:newmon:T5:0', PARTY_ZONE).label).toBe('\\*Odd\\* Boss (T5)');
    expect(() => reportedBoss(context, 'odd', PARTY_ZONE)).toThrow(
      '"odd" could be \\*Odd\\* Boss (T5) or \\*Odd\\* Other (T3). Pick one from the list.',
    );
    expect(bossChoices(context, '', PARTY_ZONE)[0]?.name).toBe('*Odd* Boss (T5)');
  });

  it('suggests no particular tier for a Pokémon that is no boss', () => {
    expect(() => reportedBoss(ctx, 'mewtwo', PARTY_ZONE)).toThrow(
      'Mewtwo is not on the current boss list. To report it anyway, put its tier first, for example `t3 mewtwo` or `t5 mewtwo`.',
    );
  });
});

describe('bossChoices with a long list', () => {
  function many(count: number): RaidBoss[] {
    const keys = ['pikachu', 'machop', 'machamp', 'mew', 'mewtwo', 'charizard', 'yveltal'];
    return Array.from({ length: count }, (_, i) => {
      const boss = listed(keys[i % keys.length] ?? 'pikachu', 'T1');
      return { ...boss, key: `${boss.key}${i}`, name: `${boss.name} ${i}` };
    });
  }

  it('keeps room for every egg when nothing is typed', () => {
    const choices = bossChoices(contextWith(many(30)), '', PARTY_ZONE);
    expect(choices).toHaveLength(25);
    const eggs = choices.filter((choice) => choice.value.startsWith('e:'));
    const everyEgg = bossChoices(contextWith([]), '', PARTY_ZONE).filter((c) =>
      c.value.startsWith('e:'),
    );
    expect(eggs).toEqual(everyEgg);
    expect(choices[0]?.value.startsWith('b:')).toBe(true);
  });

  it('fills the list with bosses when something is typed', () => {
    const choices = bossChoices(contextWith(many(60)), 'c', PARTY_ZONE);
    expect(choices).toHaveLength(25);
    expect(choices.every((choice) => choice.value.startsWith('b:'))).toBe(true);
  });

  it('leaves out a boss whose value would not fit Discord', () => {
    const long = { ...listed('mew', 'T3'), key: 'x'.repeat(95) };
    const names = bossChoices(contextWith([long, listed('mewtwo', 'T5')]), '', PARTY_ZONE).map(
      (c) => c.name,
    );
    expect(names).toContain('Mewtwo (T5)');
    expect(names).not.toContain('Mew (T3)');
  });

  it('cuts a name longer than Discord allows', () => {
    const longName = { ...listed('mew', 'T3'), name: 'M'.repeat(150) };
    const [first] = bossChoices(contextWith([longName]), '', PARTY_ZONE);
    expect(first?.name).toHaveLength(100);
    expect(first?.name.endsWith('…')).toBe(true);
  });
});
