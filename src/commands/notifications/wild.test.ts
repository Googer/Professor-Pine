import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes } from 'discord.js';
import {
  accentOf,
  customIdsOf,
  dmBrief,
  dmSummary,
  linksOf,
  textDisplays,
  textOf,
  thumbnailBeside,
  thumbnailOf,
} from '../../../test/support/messages.js';
import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../../test/support/wayspots.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchEachTest } from '../../../test/support/timers.js';
import {
  fakeAutocomplete,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, CAROL, PARTY_NOW } from '../../../test/support/parties.js';
import { partyServiceWith, reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
import type { AppContext } from '../../app-context.js';
import { loadSettings } from '../../config/settings.js';
import { InteractionRouter } from '../../discord/router.js';
import { pokemonTarget, type NotificationTarget } from '../../domain/pogo/notification-target.js';
import { postLink } from '../../render/notify-dm.js';
import { DM_PRIORITY } from '../../services/dm-sender.js';
import { SPAWN_CAUTION, SPAWN_FOOTER, SPAWN_WARNING } from '../../render/spawn.js';
import { commands } from '../index.js';
import { renderCommandHelp } from '../util/help-render.js';
import { MOD, SAFETY_SERVER } from '../../../test/support/meetup-safety-cases.js';
import { meetupSafetyWith } from '../../../test/support/meetup-safety-service.js';
import {
  MAX_DETAILS,
  WILD_PIN_BLOCKED,
  WILD_THROTTLE,
  wildCommand,
  wildExceptionsOf,
} from './wild.js';

const SIGHTINGS = '100000000000000031';
const PERFECT: NotificationTarget = { kind: 'iv', iv: 'perfect' };

async function setup(
  overrides: Parameters<typeof partyServiceWith>[1] = {},
  context: Partial<AppContext> = {},
) {
  const made = await partyServiceWith([], overrides);
  const { ctx } = createTestContext({
    ...context,
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    spawns: made.spawns,
    wants: made.wants,
    // Who sees the region's channel, as the direct messages ask it.
    members: made.members,
  });
  // The search of the stops and power spots is built in a turn of its own.
  await ctx.placeFinder.built();
  const router = new InteractionRouter(ctx, [wildCommand], []);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const run = (options: Record<string, string>, extra: object = {}) =>
    handle(
      fakeChatInput({
        commandName: 'wild',
        channelId: WEST_CHANNEL,
        userId: ALICE,
        displayName: 'Alice',
        // `details` is required: a report that does not test them says the same place.
        options: { details: 'by the fountain', ...options },
        ...extra,
      }),
    );
  const offered = async (focused: string, focusedName = 'pokemon', channelId = WEST_CHANNEL) => {
    const interaction = await handle(
      fakeAutocomplete({
        commandName: 'wild',
        channelId,
        focusedName,
        focused,
      }),
    );
    return interaction.respond.mock.calls[0]?.[0];
  };
  /** The reports that stand in a channel. */
  const reports = (channelId = WEST_CHANNEL) => made.gateway.messagesIn(channelId);
  /** The Pokémon of each report in the region's channel, by its head (`### Wild Dratini`). */
  const named = () => reports().map(({ message }) => /^### Wild (.+)$/m.exec(textOf(message))?.[1]);
  const want = async (target: NotificationTarget, ...ids: string[]) => {
    for (const id of ids) await made.wants.set(id, made.gateway.guildId, target, 'both');
  };
  const told = async (userId: string): Promise<string[][]> => {
    await made.notify.flush();
    return made.dms.to(userId).map((message) => dmSummary(message));
  };
  return { ...made, ctx, handle, run, offered, reports, named, want, told };
}
const background = watchEachTest();

describe('/wild', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a Pokémon an event on lists costumed as costumed, and tells costumed wants (plan 8R-4)', async () => {
    const costumes = { listed: [{ key: 'dratini', dex: 147, costumed: true }] };
    const made = await setup({ spawnCostumes: { sightingsAt: () => costumes.listed } });
    await made.ctx.wants.set(BOB, made.gateway.guildId, pokemonTarget(147), 'both', true);
    const used = await made.run({ pokemon: 'dratini' });
    expect(sent(used.reply).content).toMatch(/^Reported: a wild costumed Dratini\. https:/);
    expect(made.named()).toEqual(['costumed Dratini']);
    expect((await made.told(BOB))[0]?.[0]).toMatch(/^A wild costumed \*\*Dratini\*\* has been/);
    // No event lists it costumed: a plain report, of which a costumed want hears nothing.
    costumes.listed = [];
    await made.run({ pokemon: 'dratini' });
    expect(made.named()).toEqual(['costumed Dratini', 'Dratini']);
    expect(await made.told(BOB)).toHaveLength(1);
  });

  it('posts the report in the region channel, publicly, and answers privately with a link', async () => {
    const made = await setup();
    const used = await made.run({ pokemon: 'dratini', details: 'by the fountain' });
    expect(sent(used.reply).flags).toBe(MessageFlags.Ephemeral);
    const [report] = made.reports();
    expect(report?.message.v2).toBe(true);
    expect(accentOf(report?.message)).toBe(0x2ecc71);
    expect(textDisplays(report?.message)).toEqual([
      `### Wild Dratini\nReported by **Alice** (<@${ALICE}>)\n` +
        `This report goes away <t:${String(PARTY_NOW / 1000 + 30 * 60)}:R>.`,
      '**Where**\nby the fountain',
      `-# ${SPAWN_CAUTION} · ${SPAWN_FOOTER}`,
    ]);
    expect(sent(used.reply).content).toBe(
      'Reported: a wild Dratini. ' +
        `${postLink(made.gateway.guildId, WEST_CHANNEL, report?.id ?? '')}\n` +
        'The report is removed in 30 minutes.',
    );
  });

  it('posts in the text channel of the region also when used in its forum or a post there', async () => {
    const made = await setup();
    await made.run({ pokemon: 'dratini' }, { channelId: WEST_FORUM });
    const raid = await reportedRaid({}, {}, made);
    await made.run(
      { pokemon: 'dratini' },
      { channelId: raid.postId, thread: { parentId: WEST_FORUM } },
    );
    // The link line of the raid is the third message there.
    expect(made.reports().filter((message) => message.message.v2)).toHaveLength(2);
    expect(made.gateway.messagesIn(raid.postId)).toEqual([]);
  });

  it('says so, without a dead link, where the member cannot see the region’s channel (a guest of a post)', async () => {
    const made = await setup();
    const raid = await reportedRaid({}, {}, made);
    // Alice is in the post only through an access grant: she cannot see the region's channel.
    made.members.hide(WEST_CHANNEL, ALICE);
    const used = await made.run(
      { pokemon: 'dratini' },
      { channelId: raid.postId, thread: { parentId: WEST_FORUM } },
    );
    // The report goes where the region's members and those who want it look for it.
    expect(made.reports().filter((message) => message.message.v2)).toHaveLength(1);
    expect(sent(used.reply).content).toBe(
      'Reported: a wild Dratini. It went into the channel of this region, which you cannot ' +
        'see, so there is no link to it; the region’s members see it.\n' +
        'The report is removed in 30 minutes.',
    );
    // Who sees the channel gets the link, in the post as in the channel.
    const seen = await made.run(
      { pokemon: 'dratini' },
      { channelId: raid.postId, thread: { parentId: WEST_FORUM }, userId: BOB },
    );
    expect(sent(seen.reply).content).toContain(postLink(made.gateway.guildId, WEST_CHANNEL, ''));
  });

  it('is refused outside a region, with a sentence, and counts nothing against the limit', async () => {
    const made = await setup();
    const used = await made.run({ pokemon: 'dratini' }, { channelId: '600000000000000099' });
    expect(sent(used.reply)).toEqual({
      content: 'Report a wild Pokémon from the channel of a region, its forum or a post there.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.reports()).toEqual([]);
  });

  it('shows the picture of a Pokémon that is a raid boss, and the IVs when they are said', async () => {
    const made = await setup();
    await made.run({ pokemon: 'gastly', iv: 'perfect' });
    const [report] = made.reports();
    expect(textDisplays(report?.message)[0]).toMatch(
      new RegExp(
        `^### Wild Gastly\\nwith 100% IVs · reported by \\*\\*Alice\\*\\* \\(<@${ALICE}>\\)\\n`,
      ),
    );
    // The private answer says the IVs again: the member sees what was reported.
    const used = await made.run({ pokemon: 'dratini', iv: 'zero' });
    expect(sent(used.reply).content).toMatch(/^Reported: a wild Dratini with 0% IVs\. https:/);
    expect(textDisplays(report?.message)[1]).toBe('**Where**\nby the fountain');
    expect(thumbnailOf(report?.message)).toContain('pm92.icon.png');
  });

  it('shows the details as plain text: nothing in them pings or links', async () => {
    const made = await setup();
    await made.run({
      pokemon: 'dratini',
      details: '@everyone <@&5> [here](https://example.com) **now** https://evil.example/a_b',
    });
    const description = textOf(made.reports()[0]?.message);
    expect(description).not.toContain('@everyone');
    expect(description).not.toContain('<@&');
    expect(description).not.toContain('](');
    expect(description).toContain('\\*\\*now\\*\\*');
    // Not the bare address either: nothing a member typed is a link.
    expect(description).not.toContain('://');
    expect(description).toContain('evil.\u200Bexample/a\\_b');
    expect(made.reports()[0]?.message.mention).toBeUndefined();
  });

  it('carries no working link into the direct messages: not in the details, not in the name', async () => {
    const made = await setup();
    await made.want(pokemonTarget(147), BOB);
    await made.want(pokemonTarget(201), BOB);
    made.gateway.channelNames.set(SIGHTINGS, made.settings.channels.unown);
    made.gateway.noEmbeds.add(EAST_CHANNEL);
    const typed = {
      details: 'free coins https://evil.example/a_b www.evil.example discord.gg/abc',
    };
    const named = { displayName: 'discord.gg/xyz https://evil.example' };
    await made.run({ pokemon: 'dratini', ...typed }, named);
    await made.run({ pokemon: 'unown', ...typed }, named);
    await made.run({ pokemon: 'dratini', ...typed }, { ...named, channelId: EAST_CHANNEL });
    await made.notify.flush();
    expect(made.dms.to(BOB)).toHaveLength(3);
    const texts = [
      ...made.dms.to(BOB).flatMap((dm) => textDisplays(dm)),
      ...[WEST_CHANNEL, EAST_CHANNEL, SIGHTINGS].flatMap((channel) =>
        made.gateway
          .messagesIn(channel)
          .flatMap(({ message }) => (message.v2 ? textDisplays(message) : [message.content])),
      ),
    ].filter((text) => text !== undefined);
    expect(texts.length).toBeGreaterThanOrEqual(9);
    for (const text of texts) {
      expect(text).not.toContain('://');
      expect(text).not.toContain('www.e');
      expect(text).not.toContain('discord.gg');
    }
  });

  it('names `/want` under a report and in its help only where notifications are on', async () => {
    const settings = loadSettings(TEST_SETTINGS_PATH);
    const off = { ...settings, features: { ...settings.features, notifications: false } };
    const made = await setup({ settings: off });
    await made.run({ pokemon: 'dratini' });
    made.gateway.noEmbeds.add(WEST_CHANNEL);
    await made.run({ pokemon: 'dratini' });
    const [embedded, text] = made.reports();
    expect(textDisplays(embedded?.message).at(-1)).toBe(
      `-# ${SPAWN_CAUTION} · /wild reports a spawn like this one`,
    );
    expect(text?.message.content).toMatch(/\n-# \/wild reports a spawn like this one$/);
    const help = (of: typeof settings) => textDisplays(renderCommandHelp(wildCommand, of))[0] ?? '';
    expect(help(settings)).toContain('`/want`');
    expect(help(settings)).toContain('get a direct message');
    expect(help(off)).not.toContain('/want');
    expect(help(off)).not.toContain('direct message');
    expect(help(off)).toContain('removed after 30 minutes');
    // The limit, in both: from the throttle itself.
    for (const of of [settings, off]) {
      expect(help(of)).toContain('You can make 5 reports in half an hour.');
      expect(help(of)).toContain('`details` says where it is and is needed');
    }
  });

  it('needs the details, which come right after the Pokémon', async () => {
    const options = (wildCommand.data.toJSON().options ?? []) as {
      name: string;
      required?: boolean;
    }[];
    expect(options.map((option) => [option.name, option.required === true])).toEqual([
      ['pokemon', true],
      ['details', true],
      ['near', false],
      ['iv', false],
    ]);
    for (const example of wildCommand.help.examples ?? []) {
      expect(example).toMatch(/^\/wild pokemon:\S+ details:/);
    }
    // Blanks alone say nothing: refused before anything is posted, and not counted.
    const made = await setup();
    for (let n = 0; n < 6; n++) {
      const blank = await made.run({ pokemon: 'dratini', details: '   ' });
      expect(sent(blank.reply)).toEqual({
        content: 'Say in `details` where the Pokémon is: a street corner, a park, a gym.',
        flags: MessageFlags.Ephemeral,
      });
    }
    expect(made.reports()).toEqual([]);
    await made.run({ pokemon: 'dratini', details: '  Riverside Park ' });
    expect(textDisplays(made.reports()[0]?.message)[1]).toBe('**Where**\nRiverside Park');
  });

  it('refuses what never appears in the wild with a sentence, picked or typed', async () => {
    const made = await setup();
    const refused = async (pokemon: string) => sent((await made.run({ pokemon })).reply);
    // Picked from an old list (the key) and typed (the name) alike.
    expect(await refused('mewtwo')).toEqual({
      content: '**Mewtwo** does not appear in the wild.',
      flags: MessageFlags.Ephemeral,
    });
    expect((await refused('Mewtwo')).content).toBe('**Mewtwo** does not appear in the wild.');
    expect((await refused('kyurem_black')).content).toBe(
      '**Black Kyurem** does not appear in the wild.',
    );
    expect((await refused('Galarian Zapdos')).content).toBe(
      '**Galarian Zapdos** does not appear in the wild.',
    );
    expect((await refused('mew')).content).toBe('**Mew** does not appear in the wild.');
    expect((await refused('kartana')).content).toBe('**Kartana** does not appear in the wild.');
    expect((await refused('kyogre_primal')).content).toBe(
      '**Primal Kyogre** is a primal: those are met in raids, not in the wild.',
    );
    expect(made.reports()).toEqual([]);
    // None of them counted against the limit, and the lake trio does spawn.
    for (const pokemon of ['uxie', 'Mesprit', 'azelf']) await made.run({ pokemon });
    expect(made.named()).toEqual(['Uxie', 'Mesprit', 'Azelf']);
  });

  it('answers a use without details with the sentence, as an old definition may send it', async () => {
    const made = await setup();
    const used = await made.handle(
      fakeChatInput({
        commandName: 'wild',
        channelId: WEST_CHANNEL,
        userId: ALICE,
        options: { pokemon: 'dratini' },
      }),
    );
    expect(sent(used.reply)).toEqual({
      content: 'Say in `details` where the Pokémon is: a street corner, a park, a gym.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.reports()).toEqual([]);
  });

  it('acts on no single letter that is sent without picking', async () => {
    const made = await setup();
    // `f` is how the search knows Unown (F); one letter is too little to act on.
    for (const pokemon of ['f', 'F', ' a ', '?']) {
      const used = await made.run({ pokemon });
      expect(sent(used.reply).content, pokemon).toBe(
        `I do not know "${pokemon.trim()}" as a Pokémon. ` +
          'Pick one from the list that appears while you type.',
      );
    }
    expect(made.reports()).toEqual([]);
    // Picked from the list (its key), the letter is reported.
    await made.run({ pokemon: 'unown_f' });
    expect(made.reports()).toHaveLength(1);
  });

  it('follows the settings for what spawns although it has a class', async () => {
    const made = await setup();
    // A name, a text the game data does not know, and the key of a form of a species.
    const listed = ['Articuno', 'Nobody', 'tapu_koko', 'giratina_origin'];
    const settings = { ...made.ctx.config.settings, wildSpawnExceptions: listed };
    // Before anything read the list, the help does not guess at names.
    expect(textDisplays(renderCommandHelp(wildCommand, settings))[0]).toContain(
      'ultra beasts do not, with few exceptions.\n\n`details`',
    );
    const { ctx, entries } = createTestContext({
      regions: made.regions,
      spawns: made.spawns,
      config: { ...made.ctx.config, settings },
    });
    const router = new InteractionRouter(ctx, [wildCommand], []);
    const run = async (pokemon: string) => {
      const interaction = fakeChatInput({
        commandName: 'wild',
        channelId: WEST_CHANNEL,
        userId: ALICE,
        options: { pokemon, details: 'by the fountain' },
      });
      await router.handle(interaction as never);
      return interaction;
    };
    await run('articuno');
    await run('articuno_galarian');
    expect(made.reports()).toHaveLength(2);
    // The lake trio is no exception here.
    expect(sent((await run('uxie')).reply).content).toBe('**Uxie** does not appear in the wild.');
    expect(wildExceptionsOf(ctx).names).toEqual(['Articuno', 'Tapu Koko', 'Giratina']);
    await run('tapu_koko');
    await run('Giratina (Origin Forme)');
    expect(made.reports()).toHaveLength(4);
    // What the game data does not know is said once, however often it is asked.
    wildExceptionsOf(ctx);
    const warned = entries.filter(
      (entry) =>
        entry.msg === 'the settings name a Pokémon the game data does not know; it is ignored',
    );
    expect(warned).toMatchObject([{ level: 40, text: 'Nobody', setting: 'wildSpawnExceptions' }]);
    // The help names what the game data knew, by its names: not `Nobody`, and no key.
    const help = textDisplays(renderCommandHelp(wildCommand, settings))[0] ?? '';
    expect(help).toContain(
      'ultra beasts do not, except Articuno, Tapu Koko and Giratina.\n\n`details`',
    );
    // Another settings object with the same list reads the same.
    const same = { ...settings, wildSpawnExceptions: [...listed] };
    expect(textDisplays(renderCommandHelp(wildCommand, same))[0]).toBe(help);
    const none = renderCommandHelp(wildCommand, { ...settings, wildSpawnExceptions: [] });
    expect(textDisplays(none)[0]).toContain('ultra beasts do not.\n\n`details`');
    // The usual list is read here, as the start of the bot reads it: whether an earlier test
    // happened to read it must not matter.
    wildExceptionsOf(made.ctx);
    const usual = textDisplays(renderCommandHelp(wildCommand, made.ctx.config.settings))[0];
    expect(usual).toContain('ultra beasts do not, except Uxie, Mesprit and Azelf.\n\n`details`');
  });

  it('does not offer what never appears in the wild, nor suggest it', async () => {
    const made = await setup();
    const values = async (typed: string) =>
      ((await made.offered(typed)) ?? []).map((choice) => choice.value);
    expect(await values('kyurem')).toEqual([]);
    expect(await values('mewtwo')).toEqual([]);
    expect(await values('mew')).toEqual([]);
    // A refused Pokémon named outright brings no near misses: not Lugia's neighbours for Lugia.
    for (const typed of ['Lugia', 'ho-oh', 'Mega Charizard Y', 'Black Kyurem']) {
      expect(await values(typed), typed).toEqual([]);
    }
    expect(await values('nihilego')).toEqual([]);
    expect(await values('uxie')).toEqual(['uxie']);
    // The legendaries leave their places to what can be reported.
    expect(await values('gira')).toEqual(['girafarig']);
    expect(await values('zap')).toEqual([]);
    const la = await values('la');
    expect(la).toContain('lapras');
    expect(la).not.toContain('latias');
    const used = await made.run({ pokemon: 'gira' });
    expect(sent(used.reply).content).toBe(
      'I do not know "gira" as a Pokémon. Did you mean Girafarig? ' +
        'Pick one from the list that appears while you type.',
    );
  });

  it('puts no legendary first where only the exceptions have a class', async () => {
    const made = await setup();
    const values = async (typed: string) =>
      ((await made.offered(typed)) ?? []).map((choice) => choice.value);
    // Mesprit is an exception of the settings: it is offered, where the search has it without
    // its class, after the ordinary Pokémon that fit as well.
    const me = await values('me');
    expect(me).toContain('mesprit');
    expect(me[0]).not.toBe('mesprit');
    expect(Math.min(me.indexOf('metang'), me.indexOf('meowth'))).toBeGreaterThanOrEqual(0);
    expect(Math.min(me.indexOf('metang'), me.indexOf('meowth'))).toBeLessThan(
      me.indexOf('mesprit'),
    );
    // The suggestions of a refusal follow the same order.
    const used = await made.run({ pokemon: 'me' });
    const said = sent(used.reply).content ?? '';
    expect(said).toMatch(/^I do not know "me" as a Pokémon\. Did you mean /);
    expect(said).not.toMatch(/Did you mean Mesprit/);
  });

  it('limits the details to 200 characters', () => {
    const details = wildCommand.data
      .toJSON()
      .options?.find((option) => option.name === 'details') as { max_length?: number };
    expect(MAX_DETAILS).toBe(200);
    expect(details.max_length).toBe(200);
  });

  it('takes a form as that form, a species by its key or name, and refuses a mega', async () => {
    const made = await setup();
    await made.run({ pokemon: 'rattata_alola' });
    await made.run({ pokemon: 'Alolan Rattata' });
    await made.run({ pokemon: 'Unown' });
    await made.run({ pokemon: 'unown_f' });
    expect(made.named()).toEqual(['Alolan Rattata', 'Alolan Rattata', 'Unown', 'Unown (F)']);
    const mega = await made.run({ pokemon: 'charizard_mega_y' });
    expect(sent(mega.reply).content).toBe(
      '**Mega Charizard Y** is a mega: those are met in raids, not in the wild.',
    );
    expect(made.reports()).toHaveLength(4);
  });

  it('never guesses at text that names no Pokémon outright: it suggests', async () => {
    const made = await setup();
    const used = await made.run({ pokemon: 'chariz' });
    expect(sent(used.reply).content).toBe(
      'I do not know "chariz" as a Pokémon. Did you mean Charizard? ' +
        'Pick one from the list that appears while you type.',
    );
    const nothing = await made.run({ pokemon: 'zzzzqqq' });
    expect(sent(nothing.reply).content).toBe(
      'I do not know "zzzzqqq" as a Pokémon. Pick one from the list that appears while you type.',
    );
    expect(made.reports()).toEqual([]);
  });

  it('offers every Pokémon while typing, a form as a form, and no megas', async () => {
    const made = await setup();
    expect(await made.offered('')).toEqual([]);
    expect(await made.offered('chariz')).toEqual([{ name: 'Charizard', value: 'charizard' }]);
    const rattata = (await made.offered('rattata')) ?? [];
    expect(rattata.map((choice) => choice.value)).toEqual(
      expect.arrayContaining(['rattata', 'rattata_alola']),
    );
    expect(((await made.offered('a')) ?? []).length).toBeLessThanOrEqual(25);
  });

  it('allows 5 reports in half an hour; a refused use does not count', async () => {
    expect(WILD_THROTTLE).toEqual({ uses: 5, perSeconds: 1800 });
    expect(wildCommand.throttle).toBe(WILD_THROTTLE);
    const made = await setup();
    for (let n = 0; n < 5; n++) await made.run({ pokemon: 'zzzzqqq' });
    for (let n = 0; n < 5; n++) await made.run({ pokemon: 'dratini' });
    expect(made.reports()).toHaveLength(5);
    const late = await made.run({ pokemon: 'dratini' });
    expect(sent(late.reply).content).toBe('You can use /wild again in 30 minutes.');
  });

  it('deletes the report after 30 minutes, and at a graceful shutdown what still waits', async () => {
    const made = await setup();
    await made.run({ pokemon: 'dratini' });
    await made.run({ pokemon: 'gastly' });
    expect(made.spawnTimers.map((timer) => timer.ms)).toEqual([30 * 60_000, 30 * 60_000]);
    expect(made.spawns.pending).toBe(2);
    // The timer alone deletes the first: nothing is flushed.
    made.spawnTimers[0]?.run();
    await background.settle();
    expect(made.gateway.deleted).toHaveLength(1);
    expect(made.reports()).toHaveLength(1);
    expect(made.spawns.pending).toBe(1);
    // The second because the bot stops.
    await made.spawns.flush();
    expect(made.reports()).toEqual([]);
    expect(made.spawns.pending).toBe(0);
    expect(made.spawnTimers[1]?.cancelled).toBe(true);
    expect(made.gateway.deleted).toHaveLength(2);
  });

  it('tells who wants the Pokémon in the wild and can see the region channel, not the reporter', async () => {
    const made = await setup();
    await made.want(pokemonTarget(147), ALICE, BOB, CAROL);
    await made.wants.set('200000000000000005', made.gateway.guildId, pokemonTarget(147), 'raid');
    made.members.hide(WEST_CHANNEL, CAROL);
    await made.run({ pokemon: 'dratini', details: 'by the fountain' });
    expect(await made.told(BOB)).toEqual([
      [
        `A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
        'Dratini · Spawns',
      ],
    ]);
    expect(made.dms.recipients).toEqual([BOB]);
    // After the messages for who is in a party, before the other news.
    expect(made.dms.jobs[0]?.priority).toBe(DM_PRIORITY.spawn);
    const message = made.dms.to(BOB)[0];
    expect(dmBrief(message)).toEqual([
      '**Where** by the fountain',
      `The report goes away <t:${String((PARTY_NOW + 30 * 60_000) / 1000)}:R>.`,
    ]);
    expect(accentOf(message)).toBe(0x2ecc71);
    expect(linksOf(message)).toEqual([
      `Go to report ${postLink(made.gateway.guildId, WEST_CHANNEL, made.reports()[0]?.id ?? '')}`,
    ]);
    expect(customIdsOf(message)).toEqual([`dm:${made.gateway.guildId}:change:sp:147`]);
    expect(made.members.batches.at(-1)).toMatchObject({ channelId: WEST_CHANNEL });
    expect(made.dms.jobs[0]?.expiresAt).toBe(PARTY_NOW + 30 * 60_000);
    // A spawn is no party: another member's report of the same Pokémon is news again.
    await made.run({ pokemon: 'dratini' }, { userId: CAROL, displayName: 'Carol' });
    expect(await made.told(BOB)).toHaveLength(2);
  });

  it('tells in the direct message when the report goes away as the report itself says it', async () => {
    const made = await setup({ spawnDeleteAfterMs: 10 * 60_000 });
    await made.want(pokemonTarget(147), BOB);
    await made.run({ pokemon: 'dratini', details: 'by the fountain' });
    const goneAt = PARTY_NOW + 10 * 60_000;
    expect(textOf(made.reports()[0]?.message ?? { content: '' })).toContain(
      `This report goes away <t:${String(goneAt / 1000)}:R>.`,
    );
    await made.notify.flush();
    expect(dmBrief(made.dms.to(BOB)[0])).toEqual([
      '**Where** by the fountain',
      `The report goes away <t:${String(goneAt / 1000)}:R>.`,
    ]);
    expect(made.dms.jobs[0]?.expiresAt).toBe(goneAt);
  });

  it('tells of every report, also the same Pokémon again by the same member', async () => {
    const made = await setup();
    await made.want(pokemonTarget(147), BOB);
    await made.run({ pokemon: 'dratini' });
    expect(await made.told(BOB)).toHaveLength(1);
    made.clock.now += 60_000;
    await made.run({ pokemon: 'dratini', details: 'still there' });
    expect(await made.told(BOB)).toHaveLength(2);
    expect(made.reports()).toHaveLength(2);
  });

  it('tells who asked for perfect IVs when the report says so, with the Pokémon they may also want', async () => {
    const made = await setup();
    await made.want(PERFECT, BOB);
    await made.want(pokemonTarget(147), BOB, CAROL);
    await made.run({ pokemon: 'dratini', iv: 'perfect' });
    expect(await made.told(BOB)).toEqual([
      [
        expect.stringMatching(
          /^A wild \*\*Dratini\*\* with 100% IVs has been reported in <#\d+> by \*\*Alice\*\*\.$/,
        ),
        'Perfect IV spawns · Dratini · Spawns',
      ],
    ]);
    expect(await made.told(CAROL)).toHaveLength(1);
    await made.run({ pokemon: 'gastly' });
    expect(await made.told(BOB)).toHaveLength(1);
  });

  it('posts the report where notifications are off, and sends no direct message', async () => {
    const settings = loadSettings(TEST_SETTINGS_PATH);
    const made = await setup({
      settings: { ...settings, features: { ...settings.features, notifications: false } },
    });
    await made.want(pokemonTarget(147), BOB);
    await made.run({ pokemon: 'dratini' });
    expect(made.reports()).toHaveLength(1);
    expect(await made.told(BOB)).toEqual([]);
    expect(wildCommand.enabled).toBeUndefined();
  });

  it('says that the channel of the region is gone, and that a moderator should know', async () => {
    const made = await setup();
    made.gateway.gone.add(WEST_CHANNEL);
    const used = await made.run({ pokemon: 'dratini' });
    expect(sent(used.reply).content).toBe(
      'The channel of this region is gone, so I cannot post the report. Tell a moderator.',
    );
  });

  it('says that it may not post there when Discord refuses, without an error to look up', async () => {
    const made = await setup();
    made.gateway.failing.set(
      'sendMessage',
      new DiscordAPIError(
        { code: RESTJSONErrorCodes.MissingPermissions, message: 'Missing Permissions' },
        RESTJSONErrorCodes.MissingPermissions,
        403,
        'POST',
        '/x',
        {},
      ),
    );
    const used = await made.run({ pokemon: 'dratini' });
    expect(sent(used.reply).content).toBe(
      `I am not allowed to post in <#${WEST_CHANNEL}>, so the report was not made. Tell a moderator.`,
    );
    expect(made.entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });

  it('posts where the bot may not post embeds, as text', async () => {
    const made = await setup();
    made.gateway.noEmbeds.add(WEST_CHANNEL);
    const used = await made.run({ pokemon: 'dratini', details: 'by the fountain' });
    const [report] = made.reports();
    expect(report?.message.embeds).toBeUndefined();
    expect(report?.message.content).toContain(`by the fountain\n\n${SPAWN_WARNING}`);
    expect(sent(used.reply).content).toMatch(/^Reported: a wild Dratini/);
  });

  it('asks to report again once the bot is shutting down', async () => {
    const made = await setup();
    await made.spawns.flush();
    const used = await made.run({ pokemon: 'dratini' });
    expect(sent(used.reply).content).toBe(
      'I am restarting just now, so the report was not made. Report it again in a minute.',
    );
    expect(made.reports()).toEqual([]);
  });

  it('is listed with the commands, filed under notifications', () => {
    expect(commands).toContain(wildCommand);
    expect(wildCommand.help.category).toBe('notifications');
    expect(commands.some((command) => command.data.name === 'spawn')).toBe(false);
  });
});

describe('/wild: Unown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a species like any other: the region message and the direct messages', async () => {
    const made = await setup();
    await made.want(pokemonTarget(201), BOB);
    await made.run({ pokemon: 'unown_f', details: 'at the library' });
    expect(made.reports()).toHaveLength(1);
    expect(await made.told(BOB)).toEqual([
      [
        expect.stringMatching(
          /^A wild \*\*Unown \(F\)\*\* has been reported in <#\d+> by \*\*Alice\*\*\.$/,
        ),
        'Unown · Spawns',
      ],
    ]);
  });

  it('is also posted in the sightings channel where the server has one, and stays there', async () => {
    const made = await setup();
    made.gateway.channelNames.set(SIGHTINGS, made.settings.channels.unown);
    await made.run({ pokemon: 'unown_f', details: 'at the library' });
    const sightings = made.gateway.messagesIn(SIGHTINGS);
    expect(sightings).toHaveLength(1);
    expect(textDisplays(sightings[0]?.message)).toEqual([
      `A wild **Unown (F)** has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
      '**Where**\nat the library',
      `-# ${SPAWN_CAUTION}`,
    ]);
    // Nobody is pinged and no role is named.
    expect(JSON.stringify(made.gateway.messagesIn(SIGHTINGS))).not.toContain('<@&');
    // Only the region message waits for its deletion.
    expect(made.spawns.pending).toBe(1);
    await made.spawns.flush();
    expect(made.reports()).toEqual([]);
    expect(made.gateway.messagesIn(SIGHTINGS)).toHaveLength(1);
    // Another Pokémon is not posted there.
    await made.run({ pokemon: 'dratini' });
    expect(made.gateway.messagesIn(SIGHTINGS)).toHaveLength(1);
  });

  it('is not posted there when the bot may not post embeds in that channel, and the report still stands', async () => {
    const made = await setup();
    made.gateway.channelNames.set(SIGHTINGS, made.settings.channels.unown);
    made.gateway.noEmbeds.add(SIGHTINGS);
    await made.run({ pokemon: 'unown' });
    expect(made.gateway.messagesIn(SIGHTINGS)).toEqual([]);
    expect(made.reports()).toHaveLength(1);
  });

  it('reports in the region all the same when the sightings channel refuses', async () => {
    const made = await setup();
    made.gateway.channelNames.set(SIGHTINGS, made.settings.channels.unown);
    await made.run({ pokemon: 'dratini' }, { channelId: EAST_CHANNEL });
    const failing = made.gateway.sendMessage.bind(made.gateway);
    made.gateway.sendMessage = (channelId, message) =>
      channelId === SIGHTINGS
        ? Promise.reject(new Error('Missing Access'))
        : failing(channelId, message);
    const used = await made.run({ pokemon: 'unown' });
    expect(sent(used.reply).content).toMatch(/^Reported: a wild Unown/);
    expect(made.entries.some((entry) => entry.msg === 'could not post an Unown sighting')).toBe(
      true,
    );
  });
});

describe('/wild near: a pin and a member blocked from meetups', () => {
  /** `setup` with meetup safety on, Alice blocked and Bob not. */
  async function withABlock() {
    const safe = await meetupSafetyWith();
    await safe.storage.addBlock(SAFETY_SERVER, ALICE, MOD);
    return setup({}, { meetupSafety: safe.safety });
  }
  const A_PIN = 'https://www.google.com/maps?q=40.02,-80.02';

  it('refuses the pin, uncounted, in words that name the way out and the appeal', async () => {
    const made = await withABlock();
    const used = await made.run({ pokemon: 'dratini', near: A_PIN });
    expect(sent(used.reply).content).toBe(WILD_PIN_BLOCKED);
    expect(made.reports()).toHaveLength(0);
    // Refused by the guard: all of the limit is left.
    for (let n = 0; n < WILD_THROTTLE.uses; n++) await made.run({ pokemon: 'dratini' });
    expect(made.reports()).toHaveLength(WILD_THROTTLE.uses);
  });

  it('leaves them a report at a known place, or with no place', async () => {
    const made = await withABlock();
    await made.run({ pokemon: 'dratini', near: 'gym:2' });
    await made.run({ pokemon: 'dratini' });
    expect(made.reports()).toHaveLength(2);
  });

  it('leaves other members their pins, and staff', async () => {
    const made = await withABlock();
    await made.run({ pokemon: 'dratini', near: A_PIN }, { userId: BOB });
    expect(made.reports()).toHaveLength(1);
    await made.run({ pokemon: 'dratini', near: A_PIN }, { roleNames: ['Moderator'] });
    expect(made.reports()).toHaveLength(2);
  });

  it('refuses nobody while the safety is off', async () => {
    const made = await setup();
    await made.run({ pokemon: 'dratini', near: A_PIN });
    expect(made.reports()).toHaveLength(1);
  });
});

describe('/wild near:', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const SQUARE_PICTURE = 'https://lh3.googleusercontent.com/square';

  /**
   * Kept Wayspots over the invented gyms: in West a stop Fountain Square on Market Street with a
   * picture and a power spot Fountain Garden without an address; in East a stop Fountain Steps;
   * one far outside every region.
   */
  async function withWayspots() {
    const { wayspots } = await wayspotsWith([
      keptRow(1, {
        title: 'Fountain Square',
        lat: 40.0601,
        lon: -80.0601,
        address: '20 Market Street, Pinewood, PA 15999, USA',
        image: SQUARE_PICTURE,
      }),
      keptRow(2, {
        title: 'Fountain Garden',
        kind: 'powerspot',
        lat: 40.0602,
        lon: -80.0602,
        address: null,
      }),
      keptRow(3, { title: 'Fountain Steps', lat: 40.05, lon: -79.95 }),
      keptRow(4, { title: 'Fountain Far Away', lat: 41, lon: -81 }),
    ]);
    return setup({}, { wayspots });
  }

  it('offers gyms, stops and Power Spots of the server, the region first, saying where each is', async () => {
    const made = await withWayspots();
    expect(await made.offered('fountain', 'near')).toEqual([
      { name: 'Old Stone Fountain (gym) · Market Street', value: 'gym:2' },
      { name: 'Fountain Square (PokéStop) · Market Street', value: `stop:${wayspotId(1)}` },
      {
        name: 'Fountain Garden (Power Spot) · near Old Stone Fountain',
        value: `powerspot:${wayspotId(2)}`,
      },
      { name: 'Fountain Steps (PokéStop) · Main St', value: `stop:${wayspotId(3)}` },
    ]);
    // From East its own stop comes first.
    expect((await made.offered('fountain', 'near', EAST_CHANNEL))?.[0]?.name).toMatch(
      /^Fountain Steps/,
    );
    expect(await made.offered('', 'near')).toEqual([]);
  });

  it('says in its help what near does', () => {
    const settings = loadSettings(TEST_SETTINGS_PATH);
    const help = textDisplays(renderCommandHelp(wildCommand, settings)).join('\n');
    expect(help).toContain(
      '`near` names a gym, PokéStop or Power Spot it is near: pick one from the list',
    );
    expect(help).toContain('/wild pokemon:Pikachu details:by the bench near:Fountain Square');
  });

  it('cuts a long title to fit, keeping where it is', async () => {
    const { wayspots } = await wayspotsWith([
      keptRow(1, { title: `Fountain ${'x'.repeat(240)}`, lat: 40.0601, lon: -80.0601 }),
    ]);
    const made = await setup({}, { wayspots });
    const choice = (await made.offered('fountain', 'near'))?.find((one) =>
      String(one.value).startsWith('stop:'),
    );
    expect(choice?.name.length).toBeLessThanOrEqual(100);
    expect(choice?.name).toMatch(/… \(PokéStop\) · Main St$/);
  });

  it('names the place in the report, with its map link and its picture', async () => {
    const made = await withWayspots();
    const used = await made.run({ pokemon: 'dratini', near: `stop:${wayspotId(1)}` });
    expect(sent(used.reply).content).toMatch(/^Reported: a wild Dratini near Fountain Square\./);
    const [report] = made.reports();
    expect(textDisplays(report?.message)[1]).toBe(
      '**Where**\nby the fountain\nNear **Fountain Square** (PokéStop) · ' +
        '20 Market Street, Pinewood, PA 15999, USA · ' +
        '[Map](<https://www.google.com/maps/search/?api=1&query=40.0601%2C-80.0601>)',
    );
    expect(thumbnailBeside(report?.message, '**Where**')).toBe(`${SQUARE_PICTURE}=s400`);
  });

  it('offers and names a PokéStop of Pine’s own (plan 8R-1)', async () => {
    const made = await withWayspots();
    await made.ctx.pineStops.add({
      serverId: made.gateway.guildId,
      name: 'Fountain Coffee',
      lat: 40.07,
      lon: -80.07,
      address: '12 Market Street',
      createdBy: ALICE,
      createdAt: 1,
    });
    await made.ctx.placeFinder.built();
    expect(await made.offered('fountain coffee', 'near')).toContainEqual({
      name: 'Fountain Coffee (PokéStop) · Market Street',
      value: 'stop:pine-1',
    });
    await made.run({ pokemon: 'dratini', near: 'stop:pine-1' });
    expect(textDisplays(made.reports()[0]?.message)[1]).toBe(
      '**Where**\nby the fountain\nNear **Fountain Coffee** (PokéStop) · 12 Market Street · ' +
        '[Map](<https://www.google.com/maps/search/?api=1&query=40.07%2C-80.07>)',
    );
  });

  it('says the address of a gym, and that a Power Spot without one has none', async () => {
    const made = await withWayspots();
    await made.run({ pokemon: 'dratini', near: 'gym:2' });
    await made.run({ pokemon: 'dratini', near: `powerspot:${wayspotId(2)}` });
    const [gym, spot] = made.reports().map((report) => textDisplays(report.message)[1]);
    expect(gym).toContain(
      'Near **Old Stone Fountain** (gym) · 12 Market Street, Pinewood, Pennsylvania 15999 · [Map]',
    );
    expect(spot).toContain(
      'Near **Fountain Garden** (Power Spot) · (no address available) · [Map]',
    );
  });

  it('takes typed text only when it means one place beyond doubt', async () => {
    const made = await withWayspots();
    await made.run({ pokemon: 'dratini', near: 'fountain garden' });
    expect(textOf(made.reports()[0]?.message)).toContain('Near **Fountain Garden** (Power Spot)');
    const used = await made.run({ pokemon: 'dratini', near: 'fountain' });
    expect(sent(used.reply)).toEqual({
      content:
        'Which place is "fountain"? Pick one from the list that appears while you type: Old ' +
        'Stone Fountain (gym), Fountain Square (PokéStop), Fountain Garden (Power Spot) or ' +
        'Fountain Steps (PokéStop).',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.reports()).toHaveLength(1);
  });

  it('searches once for typed text, though the guard and the command both read it', async () => {
    const made = await withWayspots();
    const find = vi.spyOn(made.ctx.placeFinder, 'find');
    await made.run({ pokemon: 'dratini', near: 'fountain garden' });
    expect(made.reports()).toHaveLength(1);
    // The command takes the place the guard found.
    expect(find).toHaveBeenCalledTimes(1);
    find.mockClear();
    // A refusal is the guard's alone.
    await made.run({ pokemon: 'dratini', near: 'fountain' });
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('asks which place where one hit names it outright beside another with the word', async () => {
    const { wayspots } = await wayspotsWith([
      keptRow(1, { title: 'Fountain', lat: 40.0601, lon: -80.0601, address: null }),
    ]);
    const made = await setup({}, { wayspots });
    const used = await made.run({ pokemon: 'dratini', near: 'fountain' });
    expect(sent(used.reply).content).toBe(
      'Which place is "fountain"? Pick one from the list that appears while you type: ' +
        'Fountain (PokéStop) or Old Stone Fountain (gym).',
    );
    expect(made.reports()).toEqual([]);
  });

  it('names the place in the direct messages of the members who want the Pokémon', async () => {
    const made = await withWayspots();
    await made.want(pokemonTarget(147), BOB);
    await made.run({ pokemon: 'dratini', near: `stop:${wayspotId(1)}` });
    await made.notify.flush();
    expect(dmBrief(made.dms.to(BOB)[0])).toEqual([
      '**Where** by the fountain',
      'Near **Fountain Square** (PokéStop) · 20 Market Street, Pinewood, PA 15999, USA · ' +
        '[Map](<https://www.google.com/maps/search/?api=1&query=40.0601%2C-80.0601>)',
      `The report goes away <t:${String((PARTY_NOW + 30 * 60_000) / 1000)}:R>.`,
    ]);
  });

  it('takes a maps link or typed coordinates as a pin, named by the nearest place within 50 m', async () => {
    const made = await withWayspots();
    const map = (lat: number, lon: number) =>
      `[Map](<https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}>)`;
    // A few metres from the stop Fountain Square, from a Google Maps place page.
    const link =
      'https://www.google.com/maps/place/Blue+Tent/@40.0602,-80.0603,17z/data=!3m1!4b1!4m6' +
      '!3m5!1s0x0:0x0!8m2!3d40.06012!4d-80.06012!16s%2Fg%2F11c1';
    const near = await made.run({ pokemon: 'dratini', near: link });
    expect(sent(near.reply).content).toMatch(/^Reported: a wild Dratini near Fountain Square\./);
    // Far from every place: the name the link gave, else a dropped pin.
    await made.run({
      pokemon: 'dratini',
      near: 'https://www.google.com/maps/place/Blue+Tent/@40.02,-80.02,17z',
    });
    const dropped = await made.run({ pokemon: 'dratini', near: '40.02,-80.02' });
    expect(sent(dropped.reply).content).toMatch(/^Reported: a wild Dratini at your pin\./);
    const wheres = made.reports().map((report) => textDisplays(report.message)[1]);
    expect(wheres).toEqual([
      `**Where**\nby the fountain\n📍 Near **Fountain Square** (PokéStop) · ${map(40.06012, -80.06012)}`,
      `**Where**\nby the fountain\n📍 **Blue Tent** · ${map(40.02, -80.02)}`,
      `**Where**\nby the fountain\n📍 Dropped pin · ${map(40.02, -80.02)}`,
    ]);
    // A pin has no picture of its own: the Pokémon's alone.
    for (const report of made.reports()) {
      expect(thumbnailBeside(report.message, '**Where**')).toBeUndefined();
    }
  });

  it('refuses a pin outside the regions, numbers that are no place and a short link', async () => {
    const made = await withWayspots();
    const refusal = async (near: string) =>
      sent((await made.run({ pokemon: 'dratini', near })).reply).content;
    expect(await refusal('41.5, -81.5')).toBe(
      'That pin is not in a region of this server. Give a place in the regions here.',
    );
    expect(await refusal('95.5, 10.5')).toBe(
      'Those are no coordinates on earth: give the latitude first, then the longitude ' +
        '(`40.4406, -79.9959`).',
    );
    expect(await refusal('https://maps.app.goo.gl/AbC123xyz')).toBe(
      'I do not follow short links. Open that one, and paste the address your browser shows ' +
        'then, or drop a pin in Google Maps and paste the coordinates it shows.',
    );
    expect(await refusal('https://www.google.com/maps/search/coffee')).toBe(
      'That link shows no one place: open the place itself and copy its address, or give its ' +
        'coordinates.',
    );
    expect(made.reports()).toEqual([]);
  });

  it('names a gym as its post does, by its nickname', async () => {
    const made = await withWayspots();
    await made.run({ pokemon: 'dratini', near: 'gym:1' });
    expect(textDisplays(made.reports()[0]?.message)[1]).toContain('Near **The Stacks** (gym) · ');
  });

  it('takes a maps link of any usual length, and says so in its help', () => {
    const near = wildCommand.data.toJSON().options?.find((option) => option.name === 'near') as
      { max_length?: number } | undefined;
    expect(near?.max_length).toBeGreaterThanOrEqual(1000);
    const settings = loadSettings(TEST_SETTINGS_PATH);
    const help = textDisplays(renderCommandHelp(wildCommand, settings)).join('\n');
    expect(help).toContain('or paste a link to the place from a maps app, or its coordinates');
  });

  it('names a pin in the direct messages, without a link but its map', async () => {
    const made = await withWayspots();
    await made.want(pokemonTarget(147), BOB);
    await made.run({ pokemon: 'dratini', near: '40.02, -80.02' });
    await made.notify.flush();
    expect(dmBrief(made.dms.to(BOB)[0])?.[1]).toBe(
      '📍 Dropped pin · [Map](<https://www.google.com/maps/search/?api=1&query=40.02%2C-80.02>)',
    );
  });

  it('asks to pick again a place gone from the list, or no longer of its kind', async () => {
    const made = await withWayspots();
    for (const near of [`stop:${wayspotId(9)}`, `powerspot:${wayspotId(1)}`, 'gym:999']) {
      const used = await made.run({ pokemon: 'dratini', near });
      expect([near, sent(used.reply).content]).toEqual([
        near,
        'That place is gone from the list; pick it again.',
      ]);
    }
    expect(made.reports()).toEqual([]);
  });

  it('refuses a place outside the server’s regions, and nothing found, without counting it', async () => {
    const made = await withWayspots();
    for (const near of [`stop:${wayspotId(4)}`, 'gym:10']) {
      const used = await made.run({ pokemon: 'dratini', near });
      expect(sent(used.reply).content).toBe(
        'That place is not in a region of this server. Pick one from the list that appears ' +
          'while you type.',
      );
    }
    const none = await made.run({ pokemon: 'dratini', near: 'qwxzy' });
    expect(sent(none.reply).content).toBe(
      'I know no gym, PokéStop or Power Spot called "qwxzy" here. Pick one from the list that ' +
        'appears while you type, or say where in `details` alone.',
    );
    expect(made.reports()).toEqual([]);
    // None of those counted: five reports still go.
    for (let n = 0; n < WILD_THROTTLE.uses; n++) await made.run({ pokemon: 'dratini' });
    expect(made.reports()).toHaveLength(WILD_THROTTLE.uses);
  });
});
