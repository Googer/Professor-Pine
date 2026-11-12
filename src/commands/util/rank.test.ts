import { ButtonStyle, ComponentType, InteractionContextType, MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  asV2,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeSelect,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import {
  catalogueFixture,
  gameDataFixture,
  iconsFixture,
} from '../../../test/support/game-data.js';
import { refusedBody } from '../../../test/support/fake-gateway.js';
import {
  accentOf,
  allComponents,
  buttonsOf,
  componentCount,
  header,
  linksOf,
  selectsOf,
  textDisplays,
  textOf,
  thumbnailOf,
  thumbnailsOf,
} from '../../../test/support/messages.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { TEST_PVP_CATEGORY } from '../../../test/support/server-values.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { PokemonCatalogue } from '../../domain/pogo/catalogue.js';
import { rankButtonId, rankPickId } from '../../render/pvp-rank.js';
import { leagueRanks, rank, rankControls } from './rank.js';

const PVP = TEST_PVP_CATEGORY;
const RAIDS = '600000000000000004';
const { ctx } = createTestContext({
  gameData: { catalogue: catalogueFixture(), icons: iconsFixture() },
});
const router = new InteractionRouter(ctx, [rank], [rankControls]);

const IVS = { attack: 10, defense: 12, stamina: 13 };

async function use(options: Record<string, string | number | boolean>, extra: object = {}) {
  const interaction = fakeChatInput({
    commandName: 'rank',
    parentId: PVP,
    options: { ...IVS, ...options },
    ...extra,
  });
  await router.handle(interaction as never);
  return interaction;
}

/** The answer, a components-v2 message. */
const answerOf = (interaction: FakeInteraction): V2Message => asV2(sent(interaction.reply));
/** The text under the heading of the answer, by its blocks. */
const blocksOf = (interaction: FakeInteraction): string[] => textDisplays(answerOf(interaction));

describe('/rank: the command', () => {
  it('works in servers and in a DM with the bot, for every member', () => {
    const json = rank.data.toJSON();
    expect(json.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
    expect(json.default_member_permissions).toBeUndefined();
    expect(json.options?.map((option) => option.name)).toEqual([
      'pokemon',
      'attack',
      'defense',
      'stamina',
      'league',
      'filter',
      'evolutions',
      'shadow',
    ]);
    expect(rank.throttle).toEqual({ uses: 30, perSeconds: 60 });
    expect(json.options?.find((option) => option.name === 'filter')?.description).toBe(
      'How you got it: a trade, raid or lucky trade sets the lowest IVs it can have',
    );
  });

  it('is refused outside the PvP category and a DM', async () => {
    const used = await use({ pokemon: 'mewtwo' }, { parentId: RAIDS });
    expect(sent(used.reply)).toEqual({
      content: `Use this in a DM with me or under <#${PVP}>.`,
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe('/rank: the answer', () => {
  it('is public under the PvP category, with the rank, the best combination and its link', async () => {
    const used = await use({ pokemon: 'mewtwo' });
    const payload = sent(used.reply);
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    const answer = answerOf(used);
    expectV2Sendable(answer);
    const [heading, league, rankLine] = header(answer);
    // Without the league's emoji, its name alone.
    expect([heading, league]).toEqual(['### Mewtwo 10/12/13', 'Great League']);
    expect(rankLine).toMatch(/^\*\*Rank [\d,]+\*\* of 4,096 · \d+\.\d\d%$/);
    expect(thumbnailOf(answer)).toMatch(/^https:\/\/cdn\.leekduck\.com\/.*pm150/);
    const [, cap, small] = blocksOf(used);
    expect(cap?.split('\n')).toEqual([
      '**Up to level 50** · the same rank up to 51 · ' +
        '[🔗](<https://pvpivs.com/?mon=Mewtwo&cp=1500&IVs=10_12_13&f=0&min=1&max=50>)',
      expect.stringMatching(
        /^\d+ CP at level \d+(\.5)? · Attack \d+\.\d\d · Defense \d+\.\d\d · HP \d+$/,
      ),
      expect.stringMatching(/^-# Best: \d+\/\d+\/\d+ · \d+ CP at level [\d.]+$/),
    ]);
    expect(small).toBe('-# 🔗 opens that ranking on pvpivs.com');
    expect(textOf(answer)).not.toContain('Filter');
    // The links are in the text: no link button.
    expect(linksOf(answer)).toEqual([]);
  });

  it('has the leagues’ buttons, the shown one pressed, and the Family toggle', async () => {
    const answer = answerOf(await use({ pokemon: 'mewtwo' }));
    expect(
      buttonsOf(answer).map((button) => [
        button.label,
        button.emoji,
        button.style,
        button.customId,
      ]),
    ).toEqual([
      ['Little', undefined, ButtonStyle.Secondary, 'rank:mewtwo:show:little:10-12-13:auto:0:0'],
      ['Great', undefined, ButtonStyle.Primary, 'rank:mewtwo:show:great:10-12-13:auto:0:0'],
      ['Ultra', undefined, ButtonStyle.Secondary, 'rank:mewtwo:show:ultra:10-12-13:auto:0:0'],
      ['Master', undefined, ButtonStyle.Secondary, 'rank:mewtwo:show:master:10-12-13:auto:0:0'],
      ['Family', '🧬', ButtonStyle.Secondary, 'rank:mewtwo:show:great:10-12-13:auto:1:0'],
    ]);
  });

  it('shows the leagues by their icons where the application has them', async () => {
    const icons: Record<string, string> = {
      leaguelittle: '<:leaguelittle:1400000000000000001>',
      leaguegreat: '<:leaguegreat:1400000000000000002>',
      leagueultra: '<:leagueultra:1400000000000000003>',
      leaguemaster: '<:leaguemaster:1400000000000000004>',
    };
    const { ctx: withIcons } = createTestContext({
      gameData: { catalogue: catalogueFixture(), icons: iconsFixture() },
      emoji: { find: (name) => icons[name] },
    });
    const interaction = fakeChatInput({
      commandName: 'rank',
      parentId: PVP,
      options: { ...IVS, pokemon: 'mewtwo', league: 'ultra' },
    });
    await new InteractionRouter(withIcons, [rank], [rankControls]).handle(interaction as never);
    const answer = answerOf(interaction);
    expect(header(answer)[1]).toBe('<:leagueultra:1400000000000000003> Ultra League');
    expect(
      buttonsOf(answer)
        .slice(0, 4)
        .map((button) => [button.label, button.emoji]),
    ).toEqual([
      [undefined, 'leaguelittle'],
      [undefined, 'leaguegreat'],
      [undefined, 'leagueultra'],
      [undefined, 'leaguemaster'],
    ]);
    expectV2Sendable(answer);
  });

  it('sends the answer again in words when Discord refuses a league’s emoji', async () => {
    const refused = vi.fn();
    const { ctx: withIcons } = createTestContext({
      gameData: { catalogue: catalogueFixture(), icons: iconsFixture() },
      emoji: {
        find: (name) => (name === 'leaguegreat' ? '<:leaguegreat:1400000000000000002>' : undefined),
        refused,
      },
    });
    const interaction = fakeChatInput({
      commandName: 'rank',
      parentId: PVP,
      options: { ...IVS, pokemon: 'mewtwo' },
    });
    interaction.reply.mockImplementationOnce(() =>
      Promise.reject(
        refusedBody('the emoji of a button was refused', {
          components: {
            0: {
              components: {
                3: {
                  components: {
                    1: { emoji: { id: { _errors: [{ code: 'COMPONENT_INVALID_EMOJI' }] } } },
                  },
                },
              },
            },
          },
        }),
      ),
    );
    await new InteractionRouter(withIcons, [rank], [rankControls]).handle(interaction as never);
    expect(refused).toHaveBeenCalledTimes(1);
    const answer = asV2(sent(interaction.reply, 1));
    expect(header(answer)[1]).toBe('Great League');
    expect(buttonsOf(answer)[1]).toMatchObject({ label: 'Great', emoji: undefined });
  });

  it('is the answer in a DM too', async () => {
    const used = await use({ pokemon: 'mewtwo' }, { isDm: true, guildId: null });
    expect(header(answerOf(used))[0]).toBe('### Mewtwo 10/12/13');
  });

  it('ranks the best combination first, gold', async () => {
    const used = await use({
      pokemon: 'mewtwo',
      league: 'master',
      attack: 15,
      defense: 15,
      stamina: 15,
    });
    const answer = answerOf(used);
    expect(accentOf(answer)).toBe(0xffd700);
    expect(header(answer)[2]).toBe('**Rank 1** of 4,096 · 100.00%');
    // Level 51 changes the CP, but neither the rank nor the best combination: one block, its
    // link up to 50 (the site's own default is 51).
    const [, cap, next] = blocksOf(used);
    expect(cap).toMatch(
      /^\*\*Up to level 50\*\* · the same rank up to 51 · \[🔗\]\(<https:\/\/pvpivs\.com\/\?mon=Mewtwo&cp=10000&IVs=15_15_15&f=0&min=1&max=50>\)\n\d+ CP at level 50 /,
    );
    expect(next).toBe('-# 🔗 opens that ranking on pvpivs.com');
  });

  it('shows level 51 below level 50 where the rank differs, each with its link', async () => {
    const used = await use({ pokemon: 'medicham', attack: 15, defense: 15, stamina: 15 });
    const [, level50, level51] = blocksOf(used);
    const base = 'https://pvpivs.com/?mon=Medicham&cp=1500&IVs=15_15_15&f=0&min=1';
    expect(level50?.split('\n')[0]).toBe(`**Up to level 50** · [🔗](<${base}&max=50>)`);
    expect(level51?.split('\n')[0]).toMatch(
      /^\*\*Up to level 51 \(best buddy\)\*\* · rank [\d,]+ · \d+\.\d\d% · \[🔗\]\(<https:\/\/pvpivs\.com\/\?mon=Medicham&cp=1500&IVs=15_15_15&f=0&min=1&max=51>\)$/,
    );
    expect(level51?.split('\n')).toHaveLength(3);
  });

  it('shows a Super Mega up to the levels it adds, each with its link', async () => {
    const used = await use({ pokemon: 'Mega Malamar', league: 'master' });
    const base = 'https://pvpivs.com/?mon=Mega_Malamar&cp=10000&IVs=10_12_13&f=0&min=1';
    const headings = blocksOf(used)
      .slice(1, 5)
      .map((block) => block.split('\n')[0]);
    expect(headings).toEqual([
      `**Up to level 50** · [🔗](<${base}&max=50>)`,
      `**Up to level 51 (best buddy)** · rank 214 · 95.98% · [🔗](<${base}&max=51>)`,
      `**Up to level 52 (Super Mega)** · rank 217 · 95.99% · [🔗](<${base}&max=52>)`,
      `**Up to level 53 (Super Mega, best buddy)** · rank 229 · 95.99% · [🔗](<${base}&max=53>)`,
    ]);
    expectV2Sendable(answerOf(used));
  });

  it('counts among what the filter allows, and says the filter in the small print', async () => {
    const used = await use({ pokemon: 'mewtwo', filter: 'raid' });
    const answer = answerOf(used);
    expect(header(answer)[2]).toMatch(/ of 216 · /);
    expect(blocksOf(used).at(-1)).toBe(
      '-# 🔗 opens that ranking on pvpivs.com\n-# Filter: Raid, egg or research (IVs from 10)',
    );
    expect(buttonsOf(answer)[0]?.customId).toBe('rank:mewtwo:show:little:10-12-13:raid:0:0');
  });

  it('refuses IVs below the filter', async () => {
    const used = await use({ pokemon: 'mewtwo', filter: 'raid', attack: 9 });
    expect(sent(used.reply)).toEqual({
      content:
        'With the filter "Raid, egg or research" every IV is 10 or more, and 9/12/13 has one ' +
        'below that.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('ranks a mega and a primal: some cups of Go Battle League allow megas', async () => {
    expect(header(answerOf(await use({ pokemon: 'charizard_mega_x' })))[0]).toBe(
      '### Mega Charizard X 10/12/13',
    );
    expect(
      header(answerOf(await use({ pokemon: 'kyogre_primal', league: 'master' }))).slice(0, 2),
    ).toEqual(['### Primal Kyogre 10/12/13', 'Master League']);
  });

  it('refuses with a sentence when the game data does not reach level 51', async () => {
    const data = gameDataFixture();
    const short = new PokemonCatalogue({ ...data, cpMultipliers: data.cpMultipliers.slice(0, 50) });
    const { ctx: lacking } = createTestContext({ gameData: { catalogue: short } });
    const interaction = fakeChatInput({
      commandName: 'rank',
      parentId: PVP,
      options: { ...IVS, pokemon: 'mewtwo' },
    });
    await new InteractionRouter(lacking, [rank], []).handle(interaction as never);
    expect(sent(interaction.reply)).toEqual({
      content: 'The game data I have does not reach level 51, so I cannot rank IVs just now.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('acts on typed text only when it names one Pokémon', async () => {
    expect(header(answerOf(await use({ pokemon: 'Mewtwo' })))[0]).toBe('### Mewtwo 10/12/13');
    const used = await use({ pokemon: 'mewtw' });
    expect(sent(used.reply).content).toMatch(
      /^"mewtw" is not the name of one Pokémon\. Did you mean /,
    );
  });

  it('has room in its controls’ custom ids for every Pokémon of the game data', () => {
    const worst = {
      league: 'master',
      ivs: { attack: 15, defense: 15, stamina: 15 },
      floor: 'ultra-friend',
      evolutions: true,
      shadow: true,
    } as const;
    for (const entry of catalogueFixture().all) {
      expect(rankButtonId(entry.key, worst), entry.key).toBeDefined();
      expect(rankButtonId(entry.key, { ...worst, shadow: true }), entry.key).toBeDefined();
      expect(rankPickId(entry.key, worst), entry.key).toBeDefined();
    }
  });
});

describe('/rank: the family', () => {
  /** The members' texts of the family, without its heading. */
  const familyTexts = (interaction: FakeInteraction): string[] => {
    const blocks = blocksOf(interaction);
    const start = blocks.indexOf('**Family**');
    return blocks.slice(start + 1).filter((block) => !block.startsWith('-# 🔗'));
  };

  it('shows each member with its picture beside its rank, ▸ on the one asked for', async () => {
    const used = await use({ pokemon: 'malamar', league: 'master', evolutions: true });
    expect(header(answerOf(used))[0]).toBe('### Malamar 10/12/13');
    expect(familyTexts(used)).toEqual([
      '**Inkay** · rank 265 · 92.25%\n-# 982 CP at level 50 · best buddy: rank 248',
      '▸ **Malamar** · rank 281 · 94.70%\n-# 2563 CP at level 50 · best buddy: rank 221',
      '**Mega Malamar** · rank 280 · 95.44%\n-# 3436 CP at level 50 · best buddy: rank 214 · ' +
        'Super Mega: rank 217 · Super Mega and best buddy: rank 229',
    ]);
    // The head's and Inkay's and Malamar's pictures; Mega Malamar has none in the test's list.
    expect(thumbnailsOf(answerOf(used))).toEqual([
      expect.stringMatching(/pm687\.icon\.png$/),
      expect.stringMatching(/pm686\.icon\.png$/),
      expect.stringMatching(/pm687\.icon\.png$/),
    ]);
    const toggle = buttonsOf(answerOf(used)).find((button) => button.label === 'Family');
    expect(toggle).toMatchObject({
      style: ButtonStyle.Primary,
      customId: 'rank:malamar:show:master:10-12-13:auto:0:0',
    });
    expectV2Sendable(answerOf(used));
  });

  it('marks the species where a form that only changes the look was asked', async () => {
    const used = await use({ pokemon: 'burmy_sandy', evolutions: true });
    const names = familyTexts(used).map((text) => /^(▸ )?\*\*(.+?)\*\*/.exec(text)?.[0]);
    expect(names).toEqual([
      '▸ **Burmy**',
      '**Wormadam (Plant Cloak)**',
      '**Mothim**',
      '**Wormadam (Sandy Cloak)**',
      '**Wormadam (Trash Cloak)**',
    ]);
  });

  it('lists a family too large for pictures as text, within what a message holds', async () => {
    const used = await use({
      pokemon: 'eevee',
      league: 'master',
      evolutions: true,
      filter: 'raid',
    });
    const answer = answerOf(used);
    const list = familyTexts(used)[0]?.split('\n') ?? [];
    expect(list).toHaveLength(9);
    expect(list[0]).toMatch(/^▸ \*\*Eevee\*\* · rank [\d,]+ · \d+\.\d\d%/);
    expect(list[1]).toMatch(/^\*\*Vaporeon\*\* · rank /);
    // Only the head has a picture.
    expect(thumbnailsOf(answer)).toHaveLength(1);
    expect(componentCount(answer)).toBeLessThanOrEqual(40);
    expectV2Sendable(answer);
  });

  it('says of a Pokémon alone in its family that it does not evolve, and offers no menu', async () => {
    const used = await use({ pokemon: 'tauros', evolutions: true });
    expect(blocksOf(used)).toContain('**Family**\nTauros does not evolve.');
    expect(selectsOf(answerOf(used))).toEqual([]);
  });

  it('offers another of the family in a menu, shown or hidden, its placeholder in sight', async () => {
    for (const evolutions of [false, true]) {
      const used = await use({ pokemon: 'malamar', league: 'master', evolutions });
      const [menu] = selectsOf(answerOf(used));
      // No option is its default: the closed menu says what it is for (Matt, 2026-10-23).
      const raw = allComponents(answerOf(used)).find(
        (component) => (component as { type?: unknown }).type === ComponentType.StringSelect,
      ) as { options: { default?: boolean }[] } | undefined;
      expect(raw?.options.some((option) => option.default === true)).toBe(false);
      expect(menu?.customId).toBe(
        `rank:malamar:pick:master:10-12-13:auto:${evolutions ? '1' : '0'}:0`,
      );
      expect(menu?.placeholder).toBe('Show another of the family…');
      expect(menu?.options).toEqual([
        { label: 'Inkay', value: 'inkay', description: 'Rank 265 · 92.25%' },
        { label: 'Malamar', value: 'malamar', description: 'Rank 281 · 94.70%' },
        { label: 'Mega Malamar', value: 'malamar_mega', description: 'Rank 280 · 95.44%' },
      ]);
    }
    const [menu] = selectsOf(answerOf(await use({ pokemon: 'malamar', league: 'master' })));
    expect(menu).toBeDefined();
    // Hidden, the family takes no room of its own.
    const hidden = answerOf(await use({ pokemon: 'malamar', league: 'master' }));
    expect(textDisplays(hidden)).not.toContain('**Family**');
  });
});

describe('/rank: the lowest IVs a Pokémon can have', () => {
  it('starts an untradable mythical at 10 when no filter is given, and says why', async () => {
    const used = await use({ pokemon: 'mew' });
    expect(header(answerOf(used))[2]).toMatch(/ of 216 · /);
    expect(blocksOf(used).at(-1)).toBe(
      '-# 🔗 opens that ranking on pvpivs.com\n' +
        '-# IVs from 10: Mew cannot be traded, so it came from a raid, research or a max battle.',
    );
    expect(textOf(answerOf(used))).toContain('&f=10&min=1&max=50>)');
  });

  it('ranks IVs below that floor among all, and says so, never refuses', async () => {
    const used = await use({ pokemon: 'mew', attack: 3, defense: 15, stamina: 15 });
    expect(header(answerOf(used))[2]).toMatch(/ of 4,096 · /);
    expect(blocksOf(used).at(-1)).toBe(
      '-# 🔗 opens that ranking on pvpivs.com\n' +
        '-# Ranked among all IVs: 3/15/15 is below the 10 Pine assumes for Mew.',
    );
    expect(textOf(answerOf(used))).toContain('&f=0&min=1&max=50>)');
  });

  it('lets a picked filter win, None too, and refuse IVs below it as before', async () => {
    const none = await use({ pokemon: 'mew', filter: 'none' });
    expect(header(answerOf(none))[2]).toMatch(/ of 4,096 · /);
    expect(textOf(answerOf(none))).not.toContain('IVs from');
    const raid = await use({ pokemon: 'mew', filter: 'raid', attack: 3 });
    expect(sent(raid.reply).content).toMatch(/^With the filter "Raid, egg or research"/);
  });

  it('ranks a shadow legendary from 6, its head saying Shadow, its link too', async () => {
    const used = await use({ pokemon: 'mewtwo', shadow: true });
    const answer = answerOf(used);
    expect(header(answer)[0]).toBe('### Shadow Mewtwo 10/12/13');
    expect(header(answer)[2]).toMatch(/ of 1,000 · /);
    expect(blocksOf(used).at(-1)).toBe(
      '-# 🔗 opens that ranking on pvpivs.com\n' +
        '-# IVs from 6: a shadow legendary comes from a raid or Giovanni.',
    );
    expect(textOf(answer)).toContain('IVs=10_12_13_true&f=6&min=1&max=50>)');
    expect(buttonsOf(answer)[0]?.customId).toBe('rank:mewtwo:show:little:10-12-13:auto:0:1');
  });

  it('refuses a shadow of a Pokémon that cannot be one, in a sentence', async () => {
    const used = await use({ pokemon: 'mewtwo_mega_x', shadow: true });
    expect(sent(used.reply)).toEqual({
      content: 'Mega Mewtwo X has no shadow form in the game.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('ranks each member of the family as a shadow where it can be one', async () => {
    const used = await use({ pokemon: 'mewtwo', shadow: true, evolutions: true });
    const names = textDisplays(answerOf(used))
      .filter((text) => /^(▸ )?\*\*.+?\*\* · rank /.test(text))
      .map((text) => /^(▸ )?\*\*(.+?)\*\*/.exec(text)?.[2]);
    expect(names).toEqual(['Shadow Mewtwo', 'Mega Mewtwo X', 'Mega Mewtwo Y']);
    const [menu] = selectsOf(answerOf(used));
    expect(menu?.options.map((option) => option.label)).toEqual([
      'Shadow Mewtwo',
      'Mega Mewtwo X',
      'Mega Mewtwo Y',
    ]);
  });
});

describe('/rank: the controls under an answer', () => {
  const ASKER = '700000000000000001';
  const OTHER = '700000000000000002';
  const press = async (customId: string, userId: string, extra: object = {}) => {
    // The answer of /rank is a components-v2 message.
    const interaction = fakeButton({ customId, userId, askedBy: ASKER, v2Message: true, ...extra });
    await router.handle(interaction as never);
    return interaction;
  };
  const pick = async (customId: string, values: string[], userId = ASKER) => {
    const interaction = fakeSelect({ customId, values, userId, askedBy: ASKER, v2Message: true });
    await router.handle(interaction as never);
    return interaction;
  };

  it('change the answer for everybody when the member who asked presses them', async () => {
    const pressed = await press('rank:mewtwo:show:ultra:10-12-13:none:1', ASKER);
    const shown = asV2(sent(pressed.update));
    expect(header(shown).slice(0, 2)).toEqual(['### Mewtwo 10/12/13', 'Ultra League']);
    expect(textDisplays(shown)).toContain('**Family**');
    expect(buttonsOf(shown).find((button) => button.label === 'Ultra')?.style).toBe(
      ButtonStyle.Primary,
    );
    expect(pressed.reply).not.toHaveBeenCalled();
  });

  it('give anybody else a private copy, and leave the answer as it is', async () => {
    const pressed = await press('rank:mewtwo:show:master:10-12-13:raid:0', OTHER);
    expect(pressed.update).not.toHaveBeenCalled();
    const copy = sent(pressed.reply);
    expect(copy.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    expect(header(asV2(copy)).slice(0, 2)).toEqual(['### Mewtwo 10/12/13', 'Master League']);
    expect(textOf(asV2(copy))).toContain('-# Filter: Raid, egg or research (IVs from 10)');
  });

  it('change a private copy in its place for the member who holds it', async () => {
    const pressed = await press('rank:mewtwo:show:little:10-12-13:none:0', OTHER, {
      askedBy: OTHER,
      ephemeralMessage: true,
    });
    expect(pressed.reply).not.toHaveBeenCalled();
    expect(header(asV2(sent(pressed.update)))[1]).toBe('Little Cup');
  });

  it('work where /rank may not be used: the answer stands where it was allowed', async () => {
    const pressed = await press('rank:mewtwo:show:little:10-12-13:none:0', ASKER, {
      parentId: RAIDS,
    });
    expect(header(asV2(sent(pressed.update)))[1]).toBe('Little Cup');
  });

  it('show the member of the family picked in the menu, as everything else was', async () => {
    const picked = await pick('rank:malamar:pick:master:10-12-13:raid:1', ['inkay']);
    const shown = asV2(sent(picked.update));
    expect(header(shown).slice(0, 2)).toEqual(['### Inkay 10/12/13', 'Master League']);
    expect(textOf(shown)).toContain('▸ **Inkay**');
    expect(textOf(shown)).toContain('-# Filter: Raid, egg or research (IVs from 10)');
    const other = await pick('rank:malamar:pick:master:10-12-13:none:0', ['malamar_mega'], OTHER);
    expect(other.update).not.toHaveBeenCalled();
    expect(header(asV2(sent(other.reply)))[0]).toBe('### Mega Malamar 10/12/13');
  });

  it('keep working the floor out, and the shadow, for the member of the family picked', async () => {
    const picked = await pick('rank:mewtwo:pick:great:10-12-13:auto:1:1', ['mewtwo_mega_x']);
    const shown = asV2(sent(picked.update));
    // No mega can be a shadow: it is ranked as it is, never refused.
    expect(header(shown)[0]).toBe('### Mega Mewtwo X 10/12/13');
    expect(buttonsOf(shown)[0]?.customId).toBe('rank:mewtwo_mega_x:show:little:10-12-13:auto:1:1');
  });

  it('read an answer of the form before the shadow as it showed: its filter picked', async () => {
    const pressed = await press('rank:mew:show:great:10-12-13:none:0', ASKER);
    expect(header(asV2(sent(pressed.update)))[2]).toMatch(/ of 4,096 · /);
  });

  it('refuse a pick outside the family, or of more than one, as stale', async () => {
    for (const values of [['mewtwo'], ['missingno'], ['inkay', 'malamar'], []]) {
      const picked = await pick('rank:malamar:pick:master:10-12-13:none:0', values);
      expect(sent(picked.reply).content, values.join()).toBe(STALE_COMPONENT);
    }
  });

  it('say so of a Pokémon the game data no longer has, and of a custom id they cannot read', async () => {
    const gone = await press('rank:missingno:show:great:10-12-13:none:0', ASKER);
    expect(sent(gone.reply)).toEqual({
      content: 'I no longer know that Pokémon. Use `/rank` again.',
      flags: MessageFlags.Ephemeral,
    });
    for (const customId of [
      'rank:mewtwo:show:great:10-12-16:none:0',
      'rank:mewtwo:show:great:10-12:none:0',
      'rank:mewtwo:show:silph:10-12-13:none:0',
      'rank:mewtwo:show:great:10-12-13:none:2',
      'rank:mewtwo:hide:great:10-12-13:none:0',
    ]) {
      expect(sent((await press(customId, ASKER)).reply).content, customId).toBe(STALE_COMPONENT);
    }
  });

  it('count as uses of /rank’s controls, thirty a minute', async () => {
    const member = '700000000000000777';
    const own = new InteractionRouter(ctx, [rank], [rankControls], {
      now: () => 1_800_000_000_000,
    });
    let last: FakeInteraction | undefined;
    for (let n = 0; n < 31; n++) {
      last = fakeButton({
        customId: 'rank:mewtwo:show:great:10-12-13:none:0',
        userId: member,
        askedBy: member,
        // The answer of /rank is a components-v2 message: a press that worked (one that failed
        // would be given back).
        v2Message: true,
      });
      await own.handle(last as never);
    }
    expect(last && sent(last.reply).content).toBe(
      'That was a lot of clicks. Try again in 1 minute.',
    );
  });
});

describe('/rank: the pokemon option', () => {
  it('offers what the search finds, megas too', async () => {
    const interaction = fakeAutocomplete({
      commandName: 'rank',
      parentId: PVP,
      focused: 'charizard',
      focusedName: 'pokemon',
    });
    await router.handle(interaction as never);
    const offered = interaction.respond.mock.calls[0]?.[0] ?? [];
    expect(offered.map((choice) => choice.value)).toContain('charizard');
    expect(offered.map((choice) => choice.value)).toContain('charizard_mega_x');
  });
});

describe('/little, /great, /ultra and /master', () => {
  const leagues = new InteractionRouter(ctx, [rank, ...leagueRanks], [], {
    now: () => 1_800_000_000_000,
  });
  const useIn = async (
    commandName: string,
    options: Record<string, string | number | boolean>,
    extra: object = {},
  ) => {
    const interaction = fakeChatInput({
      commandName,
      parentId: PVP,
      options: { ...IVS, ...options },
      ...extra,
    });
    await leagues.handle(interaction as never);
    return interaction;
  };

  it('are /rank in their league, without the league option, where /rank works', () => {
    expect(leagueRanks.map((command) => command.data.name)).toEqual([
      'little',
      'great',
      'ultra',
      'master',
    ]);
    for (const command of leagueRanks) {
      const json = command.data.toJSON();
      expect(json.contexts).toEqual(rank.data.toJSON().contexts);
      expect(json.options?.map((option) => option.name)).toEqual([
        'pokemon',
        'attack',
        'defense',
        'stamina',
        'filter',
        'evolutions',
        'shadow',
      ]);
      expect(command.formOf).toBe('rank');
      expect(command.guards).toEqual(rank.guards);
    }
  });

  it('rank in their own league', async () => {
    expect(header(answerOf(await useIn('master', { pokemon: 'Mewtwo' })))[1]).toBe('Master League');
    expect(header(answerOf(await useIn('ultra', { pokemon: 'Mewtwo' })))[1]).toBe('Ultra League');
    expect(answerOf(await useIn('great', { pokemon: 'Mewtwo' }))).toEqual(
      answerOf(await useIn('rank', { pokemon: 'Mewtwo' })),
    );
  });

  it('are refused where /rank is, and count as uses of /rank', async () => {
    const outside = await useIn('great', { pokemon: 'mewtwo' }, { parentId: RAIDS });
    expect(sent(outside.reply).content).toBe(`Use this in a DM with me or under <#${PVP}>.`);
    const member = { userId: '700000000000000123' };
    for (let n = 0; n < 15; n++) {
      await useIn('rank', { pokemon: 'mewtwo' }, member);
      await useIn('little', { pokemon: 'azumarill' }, member);
    }
    const over = await useIn('great', { pokemon: 'mewtwo' }, member);
    expect(sent(over.reply)).toEqual({
      content: 'You can use /great again in 1 minute.',
      flags: MessageFlags.Ephemeral,
    });
  });
});
