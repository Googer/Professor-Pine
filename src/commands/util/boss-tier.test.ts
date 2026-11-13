import { InteractionContextType, MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  answered,
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeChatInput,
  sent,
} from '../../../test/support/fake-interactions.js';
import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import {
  autosetBoss,
  UNKNOWN_KEY_PREFIX,
  type BossOverride,
  type RaidBoss,
} from '../../domain/pogo/raid-bosses.js';
import { RAID_LEVELS, raidTier, sameRaidTier, type RaidTier } from '../../domain/pogo/raid-tier.js';
import type { RaidBossProvider } from '../../services/raid-boss-service.js';
import { bossTier } from './boss-tier.js';
import { maps } from './maps.js';
import { testServerValues } from '../../../test/support/server-values.js';

/** A list of bosses as the provider of the context gives it. */
function provider(bosses: () => RaidBoss[]): RaidBossProvider {
  return {
    bosses,
    bossesOf: (tier) => bosses().filter((boss) => sameRaidTier(boss.tier, tier)),
    autoset: (tier) => autosetBoss(bosses(), tier),
  };
}

/** A boss of the feed the game master does not know (a costume newer than the game data). */
function unknownBoss(name: string, tier: RaidTier, shiny = false): RaidBoss {
  return {
    pokemonId: 'YVELTAL',
    form: `YVELTAL_${name.length}`,
    key: `${UNKNOWN_KEY_PREFIX}${name.toLowerCase()}`,
    tier,
    shiny,
    name,
    entry: undefined,
    source: 'feed',
    autoset: false,
  };
}

const T5: RaidTier = { level: 'T5', shadow: false };

function setup(overrides: readonly BossOverride[] = [], extra: RaidBoss[] = []) {
  const fixture = raidBossesFixture(overrides);
  const { ctx } = createTestContext({
    raidBosses: provider(() => [...fixture.bosses(), ...extra]),
  });
  const router = new InteractionRouter(ctx, [bossTier, maps], []);
  const use = async (commandName: string, options: Record<string, string> = {}, more = {}) => {
    const interaction = fakeChatInput({ commandName, options, ...more });
    await router.handle(interaction as never);
    return interaction;
  };
  const typing = async (focused: string) => {
    const interaction = fakeAutocomplete({
      commandName: 'boss-tier',
      focused,
      focusedName: 'pokemon',
    });
    await router.handle(interaction as never);
    return (interaction.respond.mock.calls[0]?.[0] ?? []).map((choice) => choice.value);
  };
  return { ctx, use, typing };
}

const textOf = (interaction: Parameters<typeof answered>[0]): string =>
  answered(interaction).content ?? '';

const SHADOW_YVELTAL: BossOverride = {
  id: 1,
  pokemonId: 'YVELTAL',
  form: null,
  action: 'add',
  tier: { level: 'T5', shadow: true },
  shiny: false,
  expiresAt: null,
  createdBy: '200000000000000001',
  createdAt: 0,
};

describe('/boss-tier', () => {
  it('is a member command of servers, private and throttled', () => {
    const json = bossTier.data.toJSON();
    expect(json.default_member_permissions).toBeUndefined();
    expect(json.contexts).toBeUndefined();
    expect(json.options?.[0]).toMatchObject({ name: 'pokemon', required: false });
    expect(bossTier.defer).toBe('late');
    expect(bossTier.throttle).toEqual({ uses: 30, perSeconds: 60 });
  });

  it('says every tier a Pokémon is a boss of, and which can be shiny', async () => {
    const { use } = setup();
    const used = await use('boss-tier', { pokemon: 'yveltal' });
    expect(answered(used).flags).toBe(MessageFlags.Ephemeral);
    expect(textOf(used)).toBe('**Yveltal** is a boss of T5 raids now, and can be shiny.');
  });

  it('lists several tiers of one Pokémon (a shadow tier is a kind of its own: plan 8X-J)', async () => {
    const { use } = setup([SHADOW_YVELTAL]);
    expect(textOf(await use('boss-tier', { pokemon: 'Yveltal' }))).toBe(
      '**Yveltal** is a boss of T5 ✨ and Shadow T5 raids now.\n✨ can be shiny.',
    );
  });

  it('says of a Pokémon that is no boss that it is none', async () => {
    const { use } = setup();
    expect(textOf(await use('boss-tier', { pokemon: 'rattata' }))).toBe(
      '**Rattata** is not a raid boss now.',
    );
  });

  it('names the other forms of its species that are bosses now', async () => {
    const { use } = setup();
    expect(textOf(await use('boss-tier', { pokemon: 'blastoise' }))).toBe(
      '**Blastoise** is not a raid boss now.\nAlso a boss now: Mega Blastoise (Mega ✨).\n✨ can ' +
        'be shiny.',
    );
  });

  it('names a boss the game data does not know yet when its name has the species', async () => {
    const { use } = setup([], [unknownBoss('Yveltal (Festival)', T5)]);
    expect(textOf(await use('boss-tier', { pokemon: 'yveltal' }))).toBe(
      '**Yveltal** is a boss of T5 raids now, and can be shiny.\nAlso a boss now: Yveltal ' +
        '(Festival) (T5).',
    );
  });

  it('reads text that names a Pokémon outright as that Pokémon, also beside a boss of its name', async () => {
    const { use } = setup([], [unknownBoss('Yveltal', T5)]);
    expect(textOf(await use('boss-tier', { pokemon: 'yveltal' }))).toBe(
      '**Yveltal** is a boss of T5 raids now, and can be shiny.\nAlso a boss now: Yveltal (T5).',
    );
  });

  it('cuts a long list of the other bosses of its species with a count', async () => {
    const many = Array.from({ length: 150 }, (_unused, i) =>
      unknownBoss(`Yveltal (Costume Number ${String(i)})`, T5, true),
    );
    const { use } = setup([], many);
    const text = textOf(await use('boss-tier', { pokemon: 'yveltal' }));
    expect(text.length).toBeLessThanOrEqual(2000);
    const [first, kin = '', legend] = text.split('\n');
    expect(first).toBe('**Yveltal** is a boss of T5 raids now, and can be shiny.');
    expect(legend).toBe('✨ can be shiny.');
    expect(kin).toMatch(/^Also a boss now: Yveltal \(Costume Number 0\) \(T5 ✨\), /);
    expect(kin).toMatch(/…and \d+ more\.$/);
    expect(kin.length).toBeLessThanOrEqual(1500 + 'Also a boss now: .'.length);
  });

  it('matches the species by whole words only', async () => {
    const { use } = setup([], [unknownBoss('Mewtwo (Festival)', T5)]);
    expect(textOf(await use('boss-tier', { pokemon: 'mew' }))).toBe(
      '**Mew** is not a raid boss now.',
    );
  });

  it('answers for a boss the game data does not know yet by its name', async () => {
    const { use, typing } = setup([], [unknownBoss('Yveltal (Festival)', T5, true)]);
    expect(textOf(await use('boss-tier', { pokemon: 'yveltal (festival)' }))).toBe(
      '**Yveltal (Festival)** is a boss of T5 raids now, and can be shiny.',
    );
    expect(await typing('')).toContain('Yveltal (Festival)');
  });

  it('refuses text that names no one Pokémon', async () => {
    const { use } = setup();
    const used = await use('boss-tier', { pokemon: 'qqqqqq' });
    expect(used.reply).toHaveBeenCalledWith({
      content: 'I do not know a Pokémon called "qqqqqq". Pick one from the list.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('lists every boss by tier without a Pokémon, what eggs hatch as only among several', async () => {
    const { use } = setup();
    const lines = textOf(await use('boss-tier')).split('\n');
    expect(lines[0]).toBe('**Raid bosses now**');
    expect(lines[1]).toBe('**T1**: Pikachu ✨');
    expect(lines[2]).toBe('**Shadow T1**: Gastly ✨, Gible ✨, Shieldon ✨, Totodile ✨');
    expect(lines).toContain('**T5**: Yveltal ✨');
    expect(lines.at(-1)).toBe('✨ can be shiny.');
  });

  it('says what eggs hatch as where the moderators chose it among several', async () => {
    const { use } = setup([
      {
        id: 1,
        pokemonId: 'GIBLE',
        form: null,
        action: 'autoset',
        tier: { level: 'T1', shadow: true },
        shiny: true,
        expiresAt: null,
        createdBy: '200000000000000001',
        createdAt: 0,
      },
    ]);
    expect(textOf(await use('boss-tier')).split('\n')).toContain(
      '**Shadow T1**: Gastly ✨, Gible ✨, Shieldon ✨, Totodile ✨ · eggs hatch as Gible',
    );
  });

  it('sends a long list in as many messages as it needs, all for the member alone', async () => {
    const tiers = RAID_LEVELS.flatMap((level) =>
      [raidTier(level), raidTier(level, true)].filter((tier) => tier !== undefined),
    );
    const many = tiers.flatMap((tier) =>
      Array.from({ length: 25 }, (_unused, i) =>
        unknownBoss(`Boss ${tier.level}${tier.shadow ? 'S' : ''} ${String(i)}`, tier),
      ),
    );
    const { ctx } = createTestContext({ raidBosses: provider(() => many) });
    const router = new InteractionRouter(ctx, [bossTier], []);
    const interaction = fakeChatInput({ commandName: 'boss-tier' });
    await router.handle(interaction as never);
    const first = answered(interaction).content ?? '';
    const rest = interaction.followUp.mock.calls.map(([payload]) => payload);
    expect(rest.length).toBeGreaterThan(0);
    for (const payload of rest) expect(payload?.flags).toBe(MessageFlags.Ephemeral);
    const all = [first, ...rest.map((payload) => payload?.content ?? '')];
    for (const text of all) expect(text.length).toBeLessThanOrEqual(2000);
    expect(
      all
        .join('\n')
        .split('\n')
        .filter((line) => line.startsWith('**')),
    ).toHaveLength(tiers.length + 1);
    expect(sent(interaction.followUp, rest.length - 1).content).not.toContain('…');
  });

  it('offers the bosses while nothing is typed, and any Pokémon for text', async () => {
    const { typing } = setup();
    const empty = await typing('');
    expect(empty).toContain('yveltal');
    expect(empty).toContain('blastoise_mega');
    expect(await typing('rattat')).toContain('rattata');
  });
});

describe('/maps', () => {
  it('works in servers and DMs, and is set up only where a map is set (plan 19A-1)', () => {
    const json = maps.data.toJSON();
    expect(json.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
    const { ctx } = createTestContext();
    const values = testServerValues();
    expect(maps.setUpIn?.(values, ctx.config, FAKE_GUILD_ID)).toBeUndefined();
    const { regionMapLink: _link, ...without } = values;
    expect(maps.setUpIn?.(without, ctx.config, FAKE_GUILD_ID)).toBeDefined();
  });

  it('gives the member the address of the map, privately, also in a post or a DM', async () => {
    const { use } = setup();
    for (const extra of [
      {},
      { isDm: true, guildId: null },
      { thread: { parentName: 'west-meetups' } },
    ]) {
      const used = await use('maps', {}, extra);
      expect(used.reply).toHaveBeenCalledWith({
        content: 'The map of all regions: https://maps.example.test/regions',
        flags: MessageFlags.Ephemeral,
      });
    }
  });
});
