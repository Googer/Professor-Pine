import { InteractionContextType, MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  asV2,
  fakeAutocomplete,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import {
  buttonsOf,
  linksOf,
  sectionsOf,
  textDisplays,
  textOf,
  thumbnailBeside,
  thumbnailOf,
} from '../../../test/support/messages.js';
import { catalogueFixture, iconsFixture } from '../../../test/support/game-data.js';
import { maxBossServiceWith } from '../../../test/support/max-boss-service.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { ALICE } from '../../../test/support/parties.js';
import { createdTrain, reportedMax, reportedRaid } from '../../../test/support/party-service.js';
import {
  answerSimulating,
  FakePokebattler,
  recordedTeam,
  type RecordedMaxTeam,
} from '../../../test/support/pokebattler.js';
import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryUsers } from '../../../test/support/users.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { InteractionRouter } from '../../discord/router.js';
import type { MaxTier } from '../../domain/pogo/max-tier.js';
import type { MaxBossProvider } from '../../services/max-boss-service.js';
import { bossMovesets, counters, SIMULATED_NAMED } from './counters.js';

function setup(overrides: Parameters<typeof createTestContext>[0] = {}) {
  const pokebattler = new FakePokebattler();
  const users = new MemoryUsers();
  const { ctx, entries } = createTestContext({ pokebattler, users, ...overrides });
  const router = new InteractionRouter(ctx, [counters], []);
  const run = async (options: Record<string, string | boolean>, extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'counters',
      userId: ALICE,
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ctx, entries, pokebattler, users, router, run };
}

/** What the member was told in words: a refusal before the deferral, or a failure after it. */
function told(used: FakeInteraction): string | undefined {
  for (const mock of [used.followUp, used.editReply, used.reply]) {
    if (mock.mock.calls.length > 0) return sent(mock).content;
  }
  throw new Error('nothing was answered');
}

/** The answer, a components-v2 message. */
const answerOf = (used: FakeInteraction): V2Message => asV2(sent(used.editReply));

/** The parts of an answer: its head, its counters, what the simulation was for, its link. */
function partsOf(used: FakeInteraction) {
  const answer = answerOf(used);
  const [head = '', rows = '', settings = ''] = textDisplays(answer);
  const [link = ''] = linksOf(answer);
  return { head, rows, settings, link };
}

describe('/counters: the command', () => {
  it('is for members, in servers and DMs, three in a minute, with the legacy choices', () => {
    const json = counters.data.toJSON();
    expect(json.default_member_permissions).toBeUndefined();
    expect(json.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
    expect(json.options?.map((option) => [option.name, option.required ?? false])).toEqual([
      ['boss', false],
      ['tier', false],
      ['role', false],
      ['level', false],
      ['weather', false],
      ['friendship', false],
      ['moveset', false],
      ['shadow', false],
      ['mega', false],
      ['single', false],
    ]);
    const choices = (name: string) =>
      (
        json.options?.find((option) => option.name === name) as
          { choices?: { name: string; value: string }[] } | undefined
      )?.choices?.map((choice) => choice.value);
    expect(choices('tier')).toEqual([
      'T1',
      'T3',
      'T5',
      'Mega',
      'MegaLegendary',
      'SuperMega',
      'Elite',
      'shadow:T1',
      'shadow:T3',
      'shadow:T5',
      'D1',
      'D2',
      'D3',
      'D4',
      'D5',
      'G',
    ]);
    expect(choices('role')).toEqual(['attacker', 'defensive', 'healer', 'shielder']);
    expect(choices('level')).toEqual(['20', '25', '30', '35', '40', '41', '45', '50', '51', 'box']);
    expect(choices('friendship')).toEqual(['0', '1', '2', '3', '4']);
    expect(counters.throttle).toEqual({ uses: 3, perSeconds: 60 });
  });
});

describe('/counters: elsewhere than in a raid post', () => {
  it('simulates the boss named, in the tier it is a boss of now, privately', async () => {
    const made = setup();
    const used = await made.run({ boss: 'yveltal' });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(made.pokebattler.asked).toEqual([
      {
        boss: 'YVELTAL',
        raidLevel: 'RAID_LEVEL_5',
        attackers: { kind: 'level', level: '40' },
        weather: 'NO_WEATHER',
        friendship: '4',
        shadow: false,
        mega: false,
      },
    ]);
    const answer = answerOf(used);
    expect(sent(used.editReply).flags).toBe(MessageFlags.IsComponentsV2);
    expect(textDisplays(answer)).toEqual([
      '### Counters for Yveltal\nLevel 5 raid · boss moves: the average of all its movesets\n' +
        'About **3 trainers** with the best counters',
      '`#01` **Tyranitar** · 120s · 5.0 deaths · 2.7 trainers\n' +
        '-# Bite (Dark) / Brutal Swing (Dark)\n' +
        '`#02` **Darkrai** · 122s · 5.0 deaths · 2.7 trainers\n' +
        '-# Snarl (Dark) / Shadow Ball (Ghost) †',
      '-# Attackers at level 40 · no weather · best friends · no shadow Pokémon or megas · ' +
        '† a legacy move',
      '-# Data provided by Pokebattler',
    ]);
    // The boss's page on Pokebattler's new site, without the shadow Pokémon and megas left out.
    expect(linksOf(answer)).toEqual([
      'Full results https://www.pokebattler.com/raids/YVELTAL?includeShadow=0&includeMegas=0',
    ]);
    expect(thumbnailOf(answer)).toBeDefined();
    expectV2Sendable(answer);
  });

  it('shows the types of the moves as the emoji of the application or the server', async () => {
    const made = setup({
      emoji: { find: (name, guildId) => (guildId === null ? undefined : `<:${name}:1>`) },
    });
    expect(partsOf(await made.run({ boss: 'yveltal' })).rows).toContain(
      '-# <:dark:1> Bite / <:dark:1> Brutal Swing',
    );
    // A DM has no server: only the application's would show.
    expect(
      partsOf(await made.run({ boss: 'yveltal' }, { isDm: true, guildId: null })).rows,
    ).toContain('-# Bite (Dark) / Brutal Swing (Dark)');
  });

  it('takes the shadow tier a Pokémon is a boss of, and its shadow name', async () => {
    const made = setup();
    await made.run({ boss: 'landorus_incarnate' });
    expect(made.pokebattler.asked.map((query) => [query.boss, query.raidLevel])).toEqual([
      ['LANDORUS_SHADOW_FORM', 'RAID_LEVEL_5_SHADOW'],
    ]);
  });

  it('asks with what was chosen, and under the next name Pokebattler might know', async () => {
    const made = setup();
    made.pokebattler.known = new Set(['LANDORUS']);
    const used = await made.run({
      boss: 'landorus_incarnate',
      tier: 'T5',
      level: '50',
      weather: 'WINDY',
      friendship: '2',
      shadow: true,
      mega: true,
      single: true,
    });
    expect(made.pokebattler.asked).toEqual([
      expect.objectContaining({ boss: 'LANDORUS_INCARNATE_FORM' }),
      {
        boss: 'LANDORUS',
        raidLevel: 'RAID_LEVEL_5',
        attackers: { kind: 'level', level: '50' },
        weather: 'WINDY',
        friendship: '2',
        shadow: true,
        mega: true,
      },
    ]);
    const { link, rows, settings } = partsOf(used);
    // Shadow Pokémon and megas listed: the page as it comes.
    expect(link).toBe('Full results https://www.pokebattler.com/raids/LANDORUS');
    expect(settings).toBe(
      '-# Attackers at level 50 · windy weather · great friends · shadow Pokémon and megas ' +
        'listed · every moveset of a counter · † a legacy move',
    );
    expect(rows).toContain('`#01` **Shadow Tyranitar** · 100s');
    expect(rows).toContain('`#02` **Mega Gengar** · 110s');
    expect(rows).toContain('`#05` **Tyranitar** · 125s');
  });

  it('shows the counters against one moveset of the boss', async () => {
    const made = setup();
    const used = await made.run({
      boss: 'mewtwo',
      tier: 'T5',
      moveset: 'CONFUSION_FAST/PSYSTRIKE',
    });
    const { head, rows } = partsOf(used);
    expect(head).toContain('Level 5 raid · boss moves: Confusion / Psystrike');
    expect(rows).toContain('`#01` **Tyranitar**');
    expect(rows).not.toContain('Darkrai');
  });

  it('reads a moveset typed by its moves, and says which Pokebattler has', async () => {
    const made = setup();
    expect(
      told(await made.run({ boss: 'mewtwo', tier: 'T5', moveset: 'psycho cut / shadow ball' })),
    ).toBe(
      'Pokebattler has no results for Mewtwo with Psycho Cut / Shadow Ball. It simulates ' +
        'Confusion / Psystrike.',
    );
  });

  it('names a handful of the many movesets Pokebattler simulates, and how many more', async () => {
    const made = setup();
    const mew = made.ctx.gameData.catalogue.byKey('mew');
    if (!mew) throw new Error('no mew');
    const all = bossMovesets(made.ctx.gameData.catalogue, mew);
    // Pokebattler simulates the last 30 of the game master's (Mew: some 100 of 350).
    const simulated = all.slice(-30).reverse();
    made.pokebattler.answer = answerSimulating(
      simulated.map((each) => ({ fast: each.fast.id, charged: each.charged.id })),
    );
    const [first] = all;
    if (!first) throw new Error('no moveset');
    const text = told(
      await made.run({ boss: 'mew', tier: 'T5', moveset: `${first.fast.id}/${first.charged.id}` }),
    );
    const named = simulated
      .slice(0, SIMULATED_NAMED)
      .map((each) => `${each.fast.name} / ${each.charged.name}`)
      .join(', ');
    expect(text).toBe(
      `Pokebattler has no results for Mew with ${first.fast.name} / ${first.charged.name}. ` +
        `It simulates ${named}, and ${String(30 - SIMULATED_NAMED)} more.`,
    );
  });

  it('refuses what it can before Pokebattler is asked, without counting it', async () => {
    const made = setup();
    expect(told(await made.run({}))).toBe(
      'Say which boss with `boss`, or use this in the post of a raid or a max battle, where it ' +
        'is that battle’s.',
    );
    expect(told(await made.run({ boss: 'rattata' }))).toBe(
      'Rattata is not a raid or max battle boss now. Say which tier to simulate with `tier`.',
    );
    expect(told(await made.run({ boss: 'blastoise_mega', tier: 'shadow:T5' }))).toBe(
      'Mega Blastoise is never the boss of a shadow raid.',
    );
    expect(told(await made.run({ boss: 'mewtwo', tier: 'T5', moveset: 'hydro pump' }))).toBe(
      '"hydro pump" is not a moveset of Mewtwo: name a fast and a charged move it has, or ' +
        'pick one from the list.',
    );
    expect(told(await made.run({ boss: 'mewtwo', tier: 'T5', level: 'box' }))).toBe(
      'You have no Pokebattler user id saved. Save it with `/settings pokebattler-id`, or pick ' +
        'a level.',
    );
    // A value of the list that is no moveset of this boss (another Pokémon's list).
    expect(
      told(await made.run({ boss: 'yveltal', tier: 'T5', moveset: 'CONFUSION_FAST/PSYSTRIKE' })),
    ).toBe(
      '"CONFUSION\\_FAST/PSYSTRIKE" is not a moveset of Yveltal: name a fast and a charged move ' +
        'it has, or pick one from the list.',
    );
    expect(made.pokebattler.asked).toEqual([]);
    for (let i = 0; i < 3; i += 1) await made.run({ boss: 'yveltal' });
    expect(told(await made.run({ boss: 'yveltal' }))).toMatch(/^You can use \/counters again in/);
    expect(made.pokebattler.asked).toHaveLength(3);
  });

  it('says so when Pokebattler gave nothing', async () => {
    const made = setup();
    made.pokebattler.known = new Set();
    expect(told(await made.run({ boss: 'yveltal' }))).toBe(
      'Pokebattler does not know Yveltal as a boss of T5 raids.',
    );
    made.pokebattler.failing = { ok: false, reason: 'empty' };
    expect(told(await made.run({ boss: 'yveltal' }))).toBe(
      'Pokebattler lists no counters against Yveltal in T5 raids.',
    );
    const again = setup();
    again.pokebattler.failing = { ok: false, reason: 'timeout' };
    expect(told(await again.run({ boss: 'yveltal' }))).toBe(
      'Pokebattler is still working this out: try again in a minute.',
    );
    again.pokebattler.failing = { ok: false, reason: 'unreachable' };
    expect(told(await again.run({ boss: 'yveltal' }))).toBe(
      'Pokebattler did not answer just now. Please try again later.',
    );
    again.pokebattler.failing = { ok: false, reason: 'unreadable' };
    expect(told(await again.run({ boss: 'yveltal' }))).toBe(
      'The answer of Pokebattler could not be read. Please try again later.',
    );
    const more = setup();
    more.pokebattler.failing = { ok: false, reason: 'unavailable' };
    expect(told(await more.run({ boss: 'yveltal' }))).toBe(
      'Pokebattler did not answer just now. Please try again later.',
    );
    more.pokebattler.failing = { ok: false, reason: 'busy' };
    expect(told(await more.run({ boss: 'yveltal' }))).toBe(
      'Many are asking Pokebattler just now. Please try again in a minute.',
    );
  });

  it('says a 503 is Pokebattler still working the query out, for raids and max battles', async () => {
    const made = setup();
    made.pokebattler.failing = { ok: false, reason: 'refused', status: 503 };
    expect(told(await made.run({ boss: 'yveltal' }))).toBe(
      'Pokebattler is still working this out: try again in a minute.',
    );
    expect(told(await made.run({ boss: 'uxie', tier: 'D5' }))).toBe(
      'Pokebattler is still working this out: try again in a minute.',
    );
    // Another of Pokebattler's own errors is as before.
    made.pokebattler.failing = { ok: false, reason: 'refused', status: 500 };
    expect(told(await made.run({ boss: 'yveltal' }))).toBe(
      'Pokebattler did not answer just now. Please try again later.',
    );
  });

  it('says plainly when the answer is too large, with the full results on Pokebattler’s site', async () => {
    const made = setup();
    made.pokebattler.failing = { ok: false, reason: 'too-large' };
    expect(told(await made.run({ boss: 'yveltal' }))).toBe(
      'Pokebattler’s answer for Yveltal is too large for me to read. See the ' +
        '[full results on Pokebattler](<https://www.pokebattler.com/raids/YVELTAL?includeShadow=0&includeMegas=0>).',
    );
  });

  it('gives the use back when Pokebattler failed, but not when it refused the request', async () => {
    const made = setup();
    for (const reason of ['timeout', 'unreachable', 'unavailable', 'busy', 'too-large'] as const) {
      made.pokebattler.failing = { ok: false, reason };
      expect(told(await made.run({ boss: 'yveltal' }))).not.toMatch(/^You can use/);
    }
    made.pokebattler.failing = { ok: false, reason: 'refused', status: 503 };
    expect(told(await made.run({ boss: 'yveltal' }))).not.toMatch(/^You can use/);
    // The three of a minute are all still there.
    made.pokebattler.failing = undefined;
    for (let i = 0; i < 3; i += 1) await made.run({ boss: 'yveltal' });
    expect(told(await made.run({ boss: 'yveltal' }))).toMatch(/^You can use \/counters again in/);
    // A refusal of the request Pine made (a 4xx other than an unknown boss) counts.
    const refused = setup();
    refused.pokebattler.failing = { ok: false, reason: 'refused', status: 429 };
    for (let i = 0; i < 3; i += 1) await refused.run({ boss: 'yveltal' });
    expect(told(await refused.run({ boss: 'yveltal' }))).toMatch(
      /^You can use \/counters again in/,
    );
  });

  it('says what an unknown Pokébox can mean', async () => {
    const made = setup();
    await made.users.update(ALICE, { pokebattlerId: 4242 });
    made.pokebattler.known = new Set();
    expect(told(await made.run({ boss: 'yveltal', level: 'box' }))).toBe(
      'Pokebattler will not show a Pokébox of user 4242 (check the id you saved with ' +
        '`/settings pokebattler-id`), or does not know Yveltal as a boss of T5 raids.',
    );
  });

  it('works in a DM', async () => {
    const made = setup();
    const used = await made.run({ boss: 'yveltal' }, { isDm: true, guildId: null });
    expect(partsOf(used).head).toMatch(/^### Counters for Yveltal\nLevel 5 raid · /);
  });
});

describe('/counters: in the post of a raid', () => {
  it('simulates the raid’s boss and tier, for everybody there', async () => {
    const raid = await reportedRaid({
      boss: { key: 'yveltal' },
      tier: { level: 'T5', shadow: false },
    });
    const made = setup({ parties: raid.store, regions: raid.regions });
    const used = await made.run({}, { channelId: raid.postId, thread: { parentId: WEST_FORUM } });
    expect(used.deferReply).toHaveBeenCalledWith({});
    expect(made.pokebattler.asked[0]?.boss).toBe('YVELTAL');
    expect(partsOf(used).head).toMatch(/^### Counters for Yveltal\nLevel 5 raid · /);
  });

  it('answers a Pokébox privately, with the member’s saved id', async () => {
    const raid = await reportedRaid({ boss: { key: 'yveltal' } });
    const made = setup({ parties: raid.store, regions: raid.regions });
    await made.users.update(ALICE, { pokebattlerId: 4242 });
    const used = await made.run(
      { level: 'box' },
      { channelId: raid.postId, thread: { parentId: WEST_FORUM } },
    );
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(made.pokebattler.asked[0]?.attackers).toEqual({ kind: 'box', userId: 4242 });
    // A Pokébox lists its shadow Pokémon and megas, so Pokebattler is asked to include them.
    expect(made.pokebattler.asked[0]).toMatchObject({ shadow: true, mega: true });
    const { head, settings } = partsOf(used);
    expect(head).toContain('with your best counters');
    expect(settings).toMatch(/^-# Your Pokébox on Pokebattler · /);
    // The text never shows the member's Pokebattler user number (the link to the results has it).
    expect(textOf(answerOf(used))).not.toContain('4242');
  });

  it('refuses for an egg whose boss is not known yet', async () => {
    const raid = await reportedRaid();
    const made = setup({ parties: raid.store, regions: raid.regions });
    const used = await made.run({}, { channelId: raid.postId, thread: { parentId: WEST_FORUM } });
    expect(told(used)).toBe('The boss of this raid is not known yet. Name it with `boss`.');
    expect(used.deferReply).not.toHaveBeenCalled();
  });
});

describe('/counters: more in the posts of parties', () => {
  const inPost = (postId: string) => ({ channelId: postId, thread: { parentId: WEST_FORUM } });

  it('takes the raid’s tier for a boss named in its post, unless a tier is named', async () => {
    const egg = await reportedRaid({ tier: { level: 'T5', shadow: false } });
    const made = setup({ parties: egg.store, regions: egg.regions });
    await made.run({ boss: 'yveltal' }, inPost(egg.postId));
    expect(made.pokebattler.asked[0]?.raidLevel).toBe('RAID_LEVEL_5');
    const t3 = await reportedRaid({ tier: { level: 'T3', shadow: false } });
    const other = setup({ parties: t3.store, regions: t3.regions });
    await other.run({ boss: 'yveltal' }, inPost(t3.postId));
    expect(other.pokebattler.asked[0]?.raidLevel).toBe('RAID_LEVEL_3');
    await other.run({ boss: 'yveltal', tier: 'Elite' }, inPost(t3.postId));
    expect(other.pokebattler.asked[1]?.raidLevel).toBe('RAID_LEVEL_ELITE');
  });

  it('says that the tier of a shadow raid’s post was used for a boss never shadow', async () => {
    const raid = await reportedRaid({ tier: { level: 'T5', shadow: true } });
    const made = setup({ parties: raid.store, regions: raid.regions });
    expect(told(await made.run({ boss: 'blastoise_mega' }, inPost(raid.postId)))).toBe(
      'Mega Blastoise is never the boss of a shadow raid. I took the tier of this post ' +
        '(Shadow T5): name another with `tier`.',
    );
    await made.run({ boss: 'blastoise_mega', tier: 'Mega' }, inPost(raid.postId));
    expect(made.pokebattler.asked[0]?.raidLevel).toBe('RAID_LEVEL_MEGA');
  });

  it('says in its help and options what a raid’s post and a Pokébox change', () => {
    const json = counters.data.toJSON();
    const described = (name: string) =>
      json.options?.find((option) => option.name === name)?.description ?? '';
    expect(described('tier')).toBe(
      'The tier; when left out, that of the raid or max battle whose post this is, else the boss’s now',
    );
    expect(described('shadow')).toBe(
      'List shadow Pokémon as counters (a Pokébox lists them unless False)',
    );
    expect(described('mega')).toBe('List megas as counters (a Pokébox lists them unless False)');
    for (const option of json.options ?? [])
      expect(option.description.length).toBeLessThanOrEqual(100);
    const details = typeof counters.help.details === 'string' ? counters.help.details : '';
    expect(details).toContain(
      'A boss you name in the post of a raid is simulated in that raid’s tier',
    );
    expect(details).toContain('A Pokébox lists its shadow Pokémon and megas too');
    // Max battles (plan 8X-6): the team of the role, what it takes and what it does not.
    expect(details).toContain(
      'With a max battle tier, in the post of a max battle, or in the post of a Max Battle ' +
        'Train (the boss at its Dynamax tier) or Gigantamax Train, it shows the team of three ' +
        'Pokebattler suggests for your `role`',
    );
    expect(details).toContain('levels 20 to 50 in steps of five');
    expect(details).toContain('A link leads to Pokebattler’s Lobby, where it builds such teams');
    // Pokebattler's four trainer roles (Matt, 2026-10-24).
    expect(details).toContain(
      '`role` as Pokebattler defines it.\n\nThe role is Attacker (an attacker and two chargers) ' +
        'unless you name another: Defensive, Healer or Shielder.',
    );
    expect(described('role')).toBe(
      'For a max battle: your role as Pokebattler defines it; Attacker when left out',
    );
    expect(counters.help.examples).toContain(
      '/counters boss:Uxie tier:Dynamax 5★ role:Shielder (three shielders)',
    );
    expect(described('friendship')).toBe(
      'Friendship with the others in the battle; best friends when left out',
    );
  });

  it('refuses a boss too new for the game data', async () => {
    const raid = await reportedRaid({ boss: { name: 'Newmon' } });
    const made = setup({ parties: raid.store, regions: raid.regions });
    expect(told(await made.run({}, inPost(raid.postId)))).toBe(
      'I cannot ask Pokebattler about Newmon yet: it is newer than the game data I have.',
    );
  });

  it('tells of a failure after the public deferral privately', async () => {
    const raid = await reportedRaid({ boss: { key: 'yveltal' } });
    const made = setup({ parties: raid.store, regions: raid.regions });
    made.pokebattler.failing = { ok: false, reason: 'unreachable' };
    const used = await made.run({}, inPost(raid.postId));
    expect(used.deferReply).toHaveBeenCalledWith({});
    expect(used.deleteReply).toHaveBeenCalled();
    expect(used.followUp).toHaveBeenCalledWith({
      content: 'Pokebattler did not answer just now. Please try again later.',
      flags: MessageFlags.Ephemeral,
    });
    expect(used.editReply).not.toHaveBeenCalled();
  });

  it('answers privately when the raid ended while Pokebattler was asked', async () => {
    const raid = await reportedRaid({ boss: { key: 'yveltal' } });
    const made = setup({ parties: raid.store, regions: raid.regions });
    const ask = made.pokebattler.counters.bind(made.pokebattler);
    made.pokebattler.counters = async (request) => {
      // The post is archived meanwhile: anything sent or edited there would open it again.
      await raid.service.end(raid.party.id);
      return ask(request);
    };
    const used = await made.run({}, inPost(raid.postId));
    expect(used.deferReply).toHaveBeenCalledWith({});
    expect(raid.gateway.posts.get(raid.postId)?.archived).toBe(true);
    expect(used.editReply).not.toHaveBeenCalled();
    expect(used.deleteReply).toHaveBeenCalled();
    const answer = sent(used.followUp);
    expect(answer.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    expect(textDisplays(asV2(answer))[0]).toMatch(/^### Counters for Yveltal/);
  });

  it('simulates the boss of a train for everybody in its post, and refuses without one', async () => {
    const train = await createdTrain();
    const made = setup({ parties: train.store, regions: train.regions });
    expect(told(await made.run({}, inPost(train.postId)))).toBe(
      'This train has no boss. Name one with `boss`.',
    );
    await train.trains.setBoss(
      train.party.id,
      { id: ALICE },
      { boss: { key: 'yveltal' }, label: 'Yveltal' },
    );
    const used = await made.run({}, inPost(train.postId));
    expect(used.deferReply).toHaveBeenCalledWith({});
    expect(made.pokebattler.asked[0]).toMatchObject({
      boss: 'YVELTAL',
      raidLevel: 'RAID_LEVEL_5',
    });
  });

  it('lists shadow Pokémon and megas of a Pokébox unless told not to', async () => {
    const made = setup();
    await made.users.update(ALICE, { pokebattlerId: 4242 });
    const used = await made.run({ boss: 'yveltal', level: 'box' });
    const { rows } = partsOf(used);
    expect(rows).toContain('**Shadow Tyranitar**');
    expect(rows).toContain('**Mega Gengar**');
    const without = await made.run({ boss: 'yveltal', level: 'box', shadow: false, mega: false });
    expect(partsOf(without).rows).not.toContain('Shadow Tyranitar');
  });

  it('says so of a Pokébox with nothing that can fight', async () => {
    const made = setup();
    await made.users.update(ALICE, { pokebattlerId: 4242 });
    made.pokebattler.failing = { ok: false, reason: 'empty' };
    expect(told(await made.run({ boss: 'yveltal', level: 'box' }))).toBe(
      'Pokebattler found no Pokémon in the Pokébox of user 4242 that can fight this boss: ' +
        'check that your Pokébox on Pokebattler is filled in.',
    );
  });
});

describe('/counters: the lists while typing', () => {
  it('offers Pokémon for the boss, and the boss’s movesets with the average first', async () => {
    const made = setup();
    const ask = async (options: object) => {
      const interaction = fakeAutocomplete({ commandName: 'counters', ...options });
      await made.router.handle(interaction as never);
      return (interaction.respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string }[];
    };
    expect((await ask({ focusedName: 'boss', focused: 'yvelt' }))[0]?.value).toBe('yveltal');
    const movesets = await ask({
      focusedName: 'moveset',
      focused: '',
      options: { boss: 'mewtwo' },
    });
    expect(movesets[0]).toEqual({ name: 'Average of all movesets', value: 'average' });
    expect(movesets).toContainEqual({
      name: 'Confusion / Psystrike',
      value: 'CONFUSION_FAST/PSYSTRIKE',
    });
    const narrowed = await ask({
      focusedName: 'moveset',
      focused: 'psystr',
      options: { boss: 'mewtwo' },
    });
    expect(narrowed.every((choice) => choice.name.includes('Psystrike'))).toBe(true);
    expect(await ask({ focusedName: 'moveset', focused: '' })).toEqual([
      { name: 'Average of all movesets', value: 'average' },
    ]);
  });

  it('offers no boss moves for a max battle, whose team takes none', async () => {
    const made = setup();
    const interaction = fakeAutocomplete({
      commandName: 'counters',
      focusedName: 'moveset',
      focused: '',
      options: { boss: 'mewtwo', tier: 'D5' },
    });
    await made.router.handle(interaction as never);
    expect(interaction.respond).toHaveBeenCalledWith([]);
    const max = await reportedMax();
    const inMax = setup({ parties: max.store, regions: max.regions });
    const inPost = fakeAutocomplete({
      commandName: 'counters',
      focusedName: 'moveset',
      focused: '',
      channelId: max.postId,
      thread: { parentId: WEST_FORUM },
    });
    await inMax.router.handle(inPost as never);
    expect(inPost.respond).toHaveBeenCalledWith([]);
    // A boss typed without a tier that is no raid boss now and is a max boss is its max battle.
    const listed = setup({ maxBosses: listing('uxie', 'D5') });
    const typed = fakeAutocomplete({
      commandName: 'counters',
      focusedName: 'moveset',
      focused: '',
      options: { boss: 'uxie' },
    });
    await listed.router.handle(typed as never);
    expect(typed.respond).toHaveBeenCalledWith([]);
  });
});

describe('/counters: max battles', () => {
  /** With the game's icons, so that the team has its pictures. */
  const withIcons = { gameData: { catalogue: catalogueFixture(), icons: iconsFixture() } };
  const inPost = (postId: string) => ({ channelId: postId, thread: { parentId: WEST_FORUM } });

  it('asks for Pokebattler’s Attacker, an attacker and two chargers, unless a role is named', async () => {
    const made = setup(withIcons);
    // Pokebattler's Attacker team against Azelf, as recorded on 2026-10-24.
    made.pokebattler.maxAnswer = recordedTeam('azelf-d5-1-0-0-0-2');
    const used = await made.run({ boss: 'azelf', tier: 'D5' });
    expect(made.pokebattler.maxAsked[0]).toMatchObject({ boss: 'AZELF', role: 'attacker' });
    const answer = answerOf(used);
    const [head = '', ...rest] = textDisplays(answer);
    expect(head).toBe(
      '### Max battle team against Dynamax Azelf (5★)\n' +
        'Psychic · your role: Attacker (an attacker and two chargers)\n' +
        '-# Pokebattler’s suggested team, as its Lobby builds it',
    );
    // A charger as Pokebattler means it: the one that fills the Max Meter (Blissey, as its Lobby).
    expect(sectionsOf(answer).map((section) => section.text)).toEqual([
      head,
      '**Attacker** · Hydreigon\n-# max phase only · Bite (Dark) / Flash Cannon (Steel)',
      '**Charger** · Blissey\n-# fills the Max Meter · Pound (Normal)',
      '**Charger** · Metagross\n-# fills the Max Meter · Fury Cutter (Bug) / Meteor Mash (Steel)',
    ]);
    // The two chargers' alternatives once.
    expect(rest.filter((text) => text.startsWith('-# Other'))).toEqual([
      '-# Other attackers: Gigantamax Gengar (Shadow Claw) · Zacian (Crowned Sword) (Metal Claw) · ' +
        'Zamazenta (Crowned Shield) (Metal Claw) · Gyarados (Bite) · Weavile (Snarl)',
      '-# Other chargers: Registeel (Metal Claw) · Lugia (Extrasensory) · Umbreon (Snarl) · ' +
        'Omastar (Water Gun) · Suicune (Water Gun)',
    ]);
    expect(linksOf(answer)).toEqual([
      'Lobby on Pokebattler https://www.pokebattler.com/max/AZELF/PARTY',
    ]);
  });

  it('shows Pokebattler’s team against a max boss, privately; a role of before 8X-I as the nearest', async () => {
    const made = setup(withIcons);
    // A team of three attackers, recorded for a role of before 8X-I (for its pictures and
    // moves): the fake answers any role with it, so it does not match the head's role here.
    made.pokebattler.maxAnswer = recordedTeam('uxie-d5-3-0-0');
    // All attackers, a role of before 8X-I that a command not yet deployed again still offers.
    const used = await made.run({ boss: 'uxie', tier: 'D5', role: 'attackers' });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(made.pokebattler.maxAsked).toEqual([
      {
        boss: 'UXIE',
        maxLevel: 'RAID_LEVEL_5_MAX',
        role: 'attacker',
        level: '40',
        weather: 'NO_WEATHER',
        friendship: '4',
      },
    ]);
    expect(made.pokebattler.asked).toEqual([]);
    const answer = answerOf(used);
    const [head = '', ...rest] = textDisplays(answer);
    expect(head).toBe(
      '### Max battle team against Dynamax Uxie (5★)\n' +
        'Psychic · your role: Attacker (an attacker and two chargers)\n' +
        '-# Pokebattler’s suggested team, as its Lobby builds it',
    );
    // Each of the three with its role, what the role does and its moves, no charged move where
    // Pokebattler names none.
    expect(sectionsOf(answer).map((section) => section.text)).toEqual([
      head,
      '**Attacker** · Zacian (Crowned Sword)\n-# max phase only · Metal Claw (Steel)',
      '**Attacker** · Hydreigon\n-# max phase only · Bite (Dark)',
      '**Attacker** · Gigantamax Gengar\n-# max phase only · Sucker Punch (Dark)',
    ]);
    // The alternatives once for the three attackers, whose alternatives are the same.
    expect(rest.filter((text) => text.startsWith('-# Other'))).toEqual([
      '-# Other attackers: Zamazenta (Crowned Shield) (Metal Claw) · Metagross (Fury Cutter) · ' +
        'Gigantamax Rillaboom (Scratch) · Weavile (Feint Attack) · Gigantamax Cinderace (Tackle)',
    ]);
    expect(rest).toContain(
      '-# Pokémon at level 40 · no weather · best friends · Max Attack level 1, Max Guard 3, ' +
        'Max Spirit 3',
    );
    expect(rest).toContain('-# Data provided by Pokebattler');
    // Gigantamax Pokémon are pictured as Gigantamax; the boss's Lobby on Pokebattler's site,
    // whatever the role.
    expect(thumbnailBeside(answer, '**Attacker** · Gigantamax Gengar')).toMatch(
      /pm94\.fGIGANTAMAX\.icon\.png$/,
    );
    expect(linksOf(answer)).toEqual([
      'Lobby on Pokebattler https://www.pokebattler.com/max/UXIE/PARTY',
    ]);
    expect(buttonsOf(answer).map((button) => button.label)).toEqual([
      'Change options…',
      'Lobby on Pokebattler',
    ]);
    expectV2Sendable(answer);
  });

  it('asks for the role’s team, at the level, and a Gigantamax boss by its Gigantamax name', async () => {
    const made = setup(withIcons);
    // What is asked is the point here: the recorded Machamp team of two attackers and a
    // shielder (a role of before 8X-I) stands for whatever Pokebattler answers.
    made.pokebattler.maxAnswer = recordedTeam('gmax-machamp-2-0-1');
    const used = await made.run({
      boss: 'machamp',
      tier: 'G',
      role: 'defensive',
      level: '30',
      weather: 'RAINY',
      friendship: '2',
    });
    expect(made.pokebattler.maxAsked).toEqual([
      {
        boss: 'MACHAMP_GIGANTAMAX',
        maxLevel: 'RAID_LEVEL_6_MAX',
        role: 'defensive',
        level: '30',
        weather: 'RAINY',
        friendship: '2',
      },
    ]);
    const answer = answerOf(used);
    expect(textDisplays(answer)[0]).toBe(
      '### Max battle team against Gigantamax Machamp\n' +
        'Fighting · your role: Defensive (an attacker and two defenders)\n' +
        '-# Pokebattler’s suggested team, as its Lobby builds it',
    );
    expect(thumbnailOf(answer)).toMatch(/pm68\.fGIGANTAMAX\.icon\.png$/);
    expect(linksOf(answer)).toEqual([
      'Lobby on Pokebattler https://www.pokebattler.com/max/MACHAMP_GIGANTAMAX/PARTY',
    ]);
    const texts = sectionsOf(answer).map((section) => section.text);
    expect(texts).toContain(
      '**Shielder** · Zamazenta (Crowned Shield)\n' +
        '-# shields and taunts · Metal Claw (Steel) / Moonblast (Fairy)',
    );
    expect(textOf(answer)).toContain('-# Other shielders: Gigantamax Venusaur (Vine Whip)');
    // The level the answer was simulated at, as Pokebattler says (here 40).
    expect(textOf(answer)).toContain('-# Pokémon at level 40 · rainy weather · great friends ·');
  });

  it('shows Pokebattler’s Defensive, Healer and Shielder teams with its words for their slots', async () => {
    /** The answer for a role with its recorded Azelf team (2026-10-24): head, slots, others. */
    const shown = async (role: string, team: RecordedMaxTeam) => {
      const made = setup(withIcons);
      made.pokebattler.maxAnswer = recordedTeam(team);
      const answer = answerOf(await made.run({ boss: 'azelf', tier: 'D5', role }));
      expect(made.pokebattler.maxAsked[0]).toMatchObject({ boss: 'AZELF', role });
      const [head = '', ...rest] = textDisplays(answer);
      return {
        role: head.split('\n')[1],
        slots: sectionsOf(answer)
          .slice(1)
          .map((section) => section.text),
        others: rest
          .filter((text) => text.startsWith('-# Other'))
          .map((text) => text.split(':')[0]),
      };
    };
    expect(await shown('defensive', 'azelf-d5-1-0-0-2-0')).toEqual({
      role: 'Psychic · your role: Defensive (an attacker and two defenders)',
      slots: [
        '**Attacker** · Hydreigon\n-# max phase only · Bite (Dark) / Flash Cannon (Steel)',
        '**Defender** · Gigalith\n-# charges the meter, takes hits · Lock-On (Normal) / Meteor Beam (Rock)',
        '**Defender** · Zamazenta (Crowned Shield)\n' +
          '-# charges the meter, takes hits · Metal Claw (Steel) / Behemoth Bash (Steel)',
      ],
      others: ['-# Other attackers', '-# Other defenders'],
    });
    expect(await shown('healer', 'azelf-d5-0-1-0-2-0')).toEqual({
      role: 'Psychic · your role: Healer (a healer and two defenders)',
      slots: [
        '**Healer** · Blissey\n-# heals the team · Pound (Normal) / Wild Charge (Electric)',
        '**Defender** · Gigalith\n-# charges the meter, takes hits · Lock-On (Normal) / Meteor Beam (Rock)',
        '**Defender** · Hydreigon\n' +
          '-# charges the meter, takes hits · Dragon Breath (Dragon) / Brutal Swing (Dark)',
      ],
      others: ['-# Other healers', '-# Other defenders'],
    });
    expect(await shown('shielder', 'azelf-d5-0-0-3-0-0')).toEqual({
      role: 'Psychic · your role: Shielder (three shielders)',
      slots: [
        '**Shielder** · Blissey\n-# shields and taunts · Pound (Normal)',
        '**Shielder** · Hydreigon\n-# shields and taunts · Bite (Dark) / Brutal Swing (Dark)',
        '**Shielder** · Lugia\n-# shields and taunts · Extrasensory (Psychic) / Fly (Flying)',
      ],
      others: ['-# Other shielders'],
    });
  });

  it('shows a team of three roles, each with its alternatives once', async () => {
    const made = setup(withIcons);
    // An attacker, a shielder and a healer (no role of Pokebattler's; the fake answers any).
    made.pokebattler.maxAnswer = recordedTeam('gmax-machamp-1-1-1');
    const answer = answerOf(await made.run({ boss: 'machamp', tier: 'G', role: 'healer' }));
    expect(sectionsOf(answer).map((section) => section.text.split('\n')[0])).toEqual([
      '### Max battle team against Gigantamax Machamp',
      '**Attacker** · Zacian (Crowned Sword)',
      '**Shielder** · Zamazenta (Crowned Shield)',
      '**Healer** · Blissey',
    ]);
    expect(textOf(answer)).toContain('**Healer** · Blissey\n-# heals the team · ');
    expect(textDisplays(answer).filter((text) => text.startsWith('-# Other'))).toEqual([
      '-# Other attackers: Gallade (Psycho Cut) · Latios (Zen Headbutt) · Metagross (Zen Headbutt) · ' +
        'Gigantamax Rillaboom (Scratch) · Latias (Zen Headbutt)',
      '-# Other shielders: Gigantamax Venusaur (Vine Whip) · Venusaur (Vine Whip) · Vaporeon ' +
        '(Water Gun) · Gigantamax Blastoise (Water Gun) · Suicune (Water Gun)',
      '-# Other healers: Vaporeon (Water Gun) · Gigantamax Snorlax (Psywave) · Eternatus ' +
        '(Dragon Tail) · Suicune (Water Gun) · Lugia (Extrasensory)',
    ]);
    expectV2Sendable(answer);
  });

  it('shows the types of the moves as emoji where the server or the application has them', async () => {
    const made = setup({ ...withIcons, emoji: { find: (name) => `<:${name}:1>` } });
    const answer = answerOf(await made.run({ boss: 'uxie', tier: 'D5' }));
    expect(textDisplays(answer)[0]).toContain('<:psychic:1> · your role');
    expect(textOf(answer)).toContain(
      '**Attacker** · Hydreigon\n-# max phase only · <:dark:1> Bite',
    );
  });

  it('refuses what a max battle team does not take, before Pokebattler is asked', async () => {
    const made = setup();
    expect(told(await made.run({ boss: 'uxie', tier: 'D5', moveset: 'average' }))).toBe(
      'Pokebattler’s max battle teams take no `moveset`: leave it out.',
    );
    expect(
      told(await made.run({ boss: 'uxie', tier: 'D5', single: false, shadow: true, mega: true })),
    ).toBe('Pokebattler’s max battle teams take no `shadow`, `mega` or `single`: leave them out.');
    expect(told(await made.run({ boss: 'uxie', tier: 'D5', level: 'box' }))).toBe(
      'Pokebattler’s max battle teams cannot use your Pokébox: pick a level, or leave `level` out.',
    );
    // A best buddy is one Pokémon at a time: a team at level 41 or 51 makes no sense (Matt).
    for (const level of ['41', '51']) {
      expect(told(await made.run({ boss: 'uxie', tier: 'D5', level }))).toBe(
        'A max battle team is simulated at level 20, 25, 30, 35, 40, 45 or 50: pick one of those.',
      );
    }
    expect(told(await made.run({ boss: 'yveltal', tier: 'T5', role: 'shielder' }))).toBe(
      '`role` is for max battles: leave it out for a raid.',
    );
    expect(told(await made.run({ boss: 'gengar_mega', tier: 'G' }))).toBe(
      'Mega Gengar never battles in a max battle.',
    );
    expect(made.pokebattler.maxAsked).toEqual([]);
    expect(made.pokebattler.asked).toEqual([]);
  });

  it('says so when Pokebattler gave no team', async () => {
    const made = setup();
    made.pokebattler.known = new Set();
    expect(told(await made.run({ boss: 'machamp', tier: 'G' }))).toBe(
      'Pokebattler does not know Gigantamax Machamp as a max battle boss.',
    );
    made.pokebattler.failing = { ok: false, reason: 'empty' };
    expect(told(await made.run({ boss: 'uxie', tier: 'D5' }))).toBe(
      'Pokebattler suggests no team against Dynamax Uxie (5★).',
    );
    made.pokebattler.failing = { ok: false, reason: 'timeout' };
    expect(told(await made.run({ boss: 'uxie', tier: 'D5' }))).toBe(
      'Pokebattler is still working this out: try again in a minute.',
    );
    made.pokebattler.failing = { ok: false, reason: 'too-large' };
    expect(told(await made.run({ boss: 'uxie', tier: 'D5' }))).toBe(
      'Pokebattler’s answer for Dynamax Uxie (5★) is too large for me to read. See the ' +
        '[Lobby on Pokebattler](<https://www.pokebattler.com/max/UXIE/PARTY>).',
    );
  });

  it('names a Pokémon the game data does not know by Pokebattler’s name, and logs it', async () => {
    const made = setup();
    const team = recordedTeam('uxie-d5-3-0-0');
    const [first, ...others] = team.slots;
    if (!first) throw new Error('the recorded team has no slots');
    made.pokebattler.maxAnswer = {
      slots: [{ ...first, pick: { ...first.pick, pokemonId: 'NEWMON_GIGANTAMAX' } }, ...others],
    };
    const answer = answerOf(await made.run({ boss: 'uxie', tier: 'D5' }));
    expect(textOf(answer)).toContain('**Attacker** · Gigantamax Newmon');
    expect(
      made.entries.find(
        (entry) => entry.msg === 'Pokebattler named Pokémon the game data does not know',
      ),
    ).toMatchObject({ pokemonIds: ['NEWMON_GIGANTAMAX'] });
  });

  it('takes the max tier a Pokémon is a boss of now when no tier is named', async () => {
    const bosses = await maxBossServiceWith();
    await bosses.service.sync();
    const made = setup({ maxBosses: bosses.service });
    await made.run({ boss: 'duraludon' });
    expect(made.pokebattler.maxAsked[0]).toMatchObject({
      boss: 'DURALUDON',
      maxLevel: 'RAID_LEVEL_4_MAX',
    });
  });

  it('takes the boss and tier of a max battle’s post, for everybody there', async () => {
    const max = await reportedMax();
    const made = setup({ parties: max.store, regions: max.regions });
    const used = await made.run({ role: 'healer' }, inPost(max.postId));
    expect(used.deferReply).toHaveBeenCalledWith({});
    expect(made.pokebattler.maxAsked).toEqual([
      {
        boss: 'MACHAMP',
        maxLevel: 'RAID_LEVEL_2_MAX',
        role: 'healer',
        level: '40',
        weather: 'NO_WEATHER',
        friendship: '4',
      },
    ]);
    expect(textDisplays(answerOf(used))[0]).toMatch(
      /^### Max battle team against Dynamax Machamp \(2★\)\n/,
    );
    // A boss named there is simulated in the battle's tier, unless a tier is named.
    await made.run({ boss: 'uxie' }, inPost(max.postId));
    expect(made.pokebattler.maxAsked[1]).toMatchObject({
      boss: 'UXIE',
      maxLevel: 'RAID_LEVEL_2_MAX',
    });
    await made.run({ boss: 'yveltal', tier: 'T5' }, inPost(max.postId));
    expect(made.pokebattler.asked[0]).toMatchObject({ boss: 'YVELTAL', raidLevel: 'RAID_LEVEL_5' });
  });

  it('says that the tier of a max battle’s post was used for a mega', async () => {
    const max = await reportedMax();
    const made = setup({ parties: max.store, regions: max.regions });
    expect(told(await made.run({ boss: 'gengar_mega' }, inPost(max.postId)))).toBe(
      'Mega Gengar never battles in a max battle. I took the tier of this post (Dynamax 2★): ' +
        'name another with `tier`.',
    );
  });

  it('refuses Gigantamax for a Pokémon the game never has so, without counting it', async () => {
    const made = setup();
    for (let i = 0; i < 4; i += 1) {
      expect(told(await made.run({ boss: 'uxie', tier: 'G' }))).toBe(
        'Uxie has no Gigantamax battle in the game: name a Dynamax tier with `tier`.',
      );
    }
    expect(made.pokebattler.maxAsked).toEqual([]);
    // Refusals are not counted: the three of a minute are all left.
    await made.run({ boss: 'uxie', tier: 'D5' });
    expect(made.pokebattler.maxAsked).toHaveLength(1);
  });

  it('asks for a species’ Gigantamax forms where it has them', async () => {
    const made = setup();
    made.pokebattler.known = new Set(['TOXTRICITY_AMPED_GIGANTAMAX']);
    await made.run({ boss: 'toxtricity', tier: 'G' });
    expect(made.pokebattler.maxAsked.map((query) => query.boss)).toEqual([
      'TOXTRICITY_GIGANTAMAX',
      'TOXTRICITY_AMPED_GIGANTAMAX',
    ]);
  });

  it('reads “Gigantamax” or “Dynamax” before the boss as /max does', async () => {
    const made = setup();
    await made.run({ boss: 'Gigantamax Machamp' });
    expect(made.pokebattler.maxAsked[0]).toMatchObject({
      boss: 'MACHAMP_GIGANTAMAX',
      maxLevel: 'RAID_LEVEL_6_MAX',
    });
    await made.run({ boss: 'Dynamax Uxie', tier: 'D5' });
    expect(made.pokebattler.maxAsked[1]).toMatchObject({
      boss: 'UXIE',
      maxLevel: 'RAID_LEVEL_5_MAX',
    });
    expect(told(await made.run({ boss: 'Gigantamax Machamp', tier: 'T5' }))).toBe(
      'Gigantamax Machamp is a Gigantamax battle: leave `tier` out, or name Gigantamax.',
    );
    expect(told(await made.run({ boss: 'Dynamax Uxie', tier: 'G' }))).toBe(
      'Dynamax Uxie is a Dynamax battle: name a Dynamax tier with `tier`.',
    );
  });

  it('takes the listed boss of a species named whose form is on the list', async () => {
    const catalogue = catalogueFixture();
    const amped = catalogue.byKey('toxtricity_amped');
    const made = setup({
      maxBosses: {
        bosses: () => [
          {
            pokemonId: 'TOXTRICITY',
            form: 'TOXTRICITY_AMPED',
            key: 'toxtricity_amped',
            tier: 'G',
            shiny: false,
            name: amped?.name ?? '',
            entry: amped,
            source: 'feed',
            autoset: false,
          },
        ],
        coming: () => [],
        hidden: () => [],
        feedBosses: () => [],
      },
    });
    await made.run({ boss: 'toxtricity' });
    expect(made.pokebattler.maxAsked[0]).toMatchObject({
      boss: 'TOXTRICITY_AMPED_GIGANTAMAX',
      maxLevel: 'RAID_LEVEL_6_MAX',
    });
  });

  it('asks for a Gigantamax boss of the list the game data does not have so yet', async () => {
    // Pokebattler's feed lists Uxie at Gigantamax; the game master has no Gigantamax Uxie.
    const made = setup({ maxBosses: listing('uxie', 'G') });
    await made.run({ boss: 'uxie', tier: 'G' });
    expect(made.pokebattler.maxAsked[0]).toMatchObject({
      boss: 'UXIE_GIGANTAMAX',
      maxLevel: 'RAID_LEVEL_6_MAX',
    });
    // Off the list it is still refused.
    expect(told(await made.run({ boss: 'mewtwo', tier: 'G' }))).toBe(
      'Mewtwo has no Gigantamax battle in the game: name a Dynamax tier with `tier`.',
    );
  });

  it('reads a Dynamax species as the listed form, as without the word', async () => {
    const made = setup({ maxBosses: listing('toxtricity_amped', 'D4') });
    await made.run({ boss: 'Dynamax Toxtricity' });
    await made.run({ boss: 'toxtricity' });
    expect(made.pokebattler.maxAsked.map((query) => query.boss)).toEqual([
      'TOXTRICITY_AMPED_FORM',
      'TOXTRICITY_AMPED_FORM',
    ]);
  });

  it('fits the longest team Pokebattler could answer into one message', async () => {
    const made = setup(withIcons);
    const long = (letter: string, i: number) => `${letter}${String(i)}`.padEnd(100, letter);
    const pick = (letter: string, i: number) => ({
      pokemonId: long(letter, i),
      fast: long('F', i),
      charged: long('C', i),
      level: '40',
    });
    // Three roles Pine does not know, of the most letters the answer takes, ten others each.
    made.pokebattler.maxAnswer = {
      slots: ['X', 'Y', 'Z'].map((letter) => ({
        role: letter.repeat(40),
        pick: pick(letter, 0),
        alternatives: Array.from({ length: 10 }, (_unused, i) => pick(letter, i + 1)),
        maxMoves: { attack: 1, guard: 3, spirit: 3 },
      })),
    };
    const answer = answerOf(await made.run({ boss: 'uxie', tier: 'D5' }));
    expectV2Sendable(answer);
    const others = textDisplays(answer).filter((text) => text.startsWith('-# Others: '));
    expect(others).toHaveLength(3);
    expect(others.every((text) => /…and \d+ more$/.test(text))).toBe(true);
    // A role Pine does not know has no description: its small print is the moves alone.
    const smallPrint = textDisplays(answer)
      .filter((text) => text.startsWith('**'))
      .map((text) => text.split('\n')[1] ?? '');
    expect(smallPrint).toHaveLength(3);
    expect(smallPrint.every((line) => line.startsWith('-# ') && !line.includes(' · '))).toBe(true);
  });

  it('takes the post of a Gigantamax battle as the list only for its own boss', async () => {
    const max = await reportedMax({ tier: 'G', boss: { key: 'machamp' } });
    const made = setup({ parties: max.store, regions: max.regions });
    // Uxie named there takes the post's tier, but is no Gigantamax boss of the list or the game.
    for (let i = 0; i < 4; i += 1) {
      expect(told(await made.run({ boss: 'uxie' }, inPost(max.postId)))).toBe(
        'Uxie has no Gigantamax battle in the game: name a Dynamax tier with `tier`.',
      );
    }
    expect(made.pokebattler.maxAsked).toEqual([]);
    // Refused uncounted: the battle's own boss is still asked.
    await made.run({}, inPost(max.postId));
    await made.run({ boss: 'machamp' }, inPost(max.postId));
    expect(made.pokebattler.maxAsked.map((query) => query.boss)).toEqual([
      'MACHAMP_GIGANTAMAX',
      'MACHAMP_GIGANTAMAX',
    ]);
  });

  it('gives a Dynamax train the max counters at its boss’s Dynamax tier (plan 8X-4)', async () => {
    const train = await createdTrain({ kind: 'dynamax' });
    await train.trains.setBoss(
      train.party.id,
      { id: ALICE },
      { boss: { key: 'uxie' }, label: 'Uxie' },
    );
    const made = setup({
      parties: train.store,
      regions: train.regions,
      maxBosses: listing('uxie', 'D5'),
    });
    await made.run({}, inPost(train.postId));
    expect(made.pokebattler.maxAsked[0]).toMatchObject({
      boss: 'UXIE',
      maxLevel: 'RAID_LEVEL_5_MAX',
    });
    expect(made.pokebattler.asked).toEqual([]);
    // A boss no max boss list names: the tier is asked, as for a typed boss.
    const unlisted = setup({ parties: train.store, regions: train.regions });
    expect(told(await unlisted.run({}, inPost(train.postId)))).toBe(
      'Uxie is not a Dynamax boss now. Say which tier to simulate with `tier`.',
    );
    await unlisted.run({ tier: 'D3' }, inPost(train.postId));
    expect(unlisted.pokebattler.maxAsked[0]).toMatchObject({ maxLevel: 'RAID_LEVEL_3_MAX' });
  });

  it('gives a Gigantamax train the Gigantamax counters of its boss (plan 8X-4)', async () => {
    const train = await createdTrain({ kind: 'gigantamax' });
    await train.trains.setBoss(
      train.party.id,
      { id: ALICE },
      { boss: { key: 'machamp' }, label: 'Machamp' },
    );
    const made = setup({ parties: train.store, regions: train.regions });
    await made.run({}, inPost(train.postId));
    expect(made.pokebattler.maxAsked[0]).toMatchObject({
      boss: 'MACHAMP_GIGANTAMAX',
      maxLevel: 'RAID_LEVEL_6_MAX',
    });
  });

  it('takes no max battle tier for the boss of a raid train, as before', async () => {
    const train = await createdTrain();
    await train.trains.setBoss(
      train.party.id,
      { id: ALICE },
      { boss: { key: 'uxie' }, label: 'Uxie' },
    );
    const made = setup({
      parties: train.store,
      regions: train.regions,
      maxBosses: listing('uxie', 'D5'),
    });
    const refusal = 'Uxie is not a raid boss now. Say which tier to simulate with `tier`.';
    expect(told(await made.run({}, inPost(train.postId)))).toBe(refusal);
    expect(told(await made.run({ boss: 'uxie' }, inPost(train.postId)))).toBe(refusal);
    expect(made.pokebattler.maxAsked).toEqual([]);
    // Its boss moves are offered, as for a raid.
    const typing = fakeAutocomplete({
      commandName: 'counters',
      focusedName: 'moveset',
      focused: '',
      channelId: train.postId,
      thread: { parentId: WEST_FORUM },
    });
    await made.router.handle(typing as never);
    const offered = typing.respond.mock.calls[0]?.[0] ?? [];
    expect(offered.length).toBeGreaterThan(1);
  });
});

// The Mega Chandelure event, 2026-10-31: the feed had the boss, Pokebattler too, the game master not.
describe('/counters: a mega newer than the game data', () => {
  const inPost = (postId: string) => ({ channelId: postId, thread: { parentId: WEST_FORUM } });
  const PICTURE = 'https://example.test/mega-chandelure.png';
  /** The raid boss list with Mega Chandelure, held by its name as the feed gave it. */
  const listed = () => {
    const list = raidBossesFixture();
    const bosses = list.bosses();
    return Object.assign(list, {
      bosses: () => [
        ...bosses,
        {
          pokemonId: 'CHANDELURE',
          form: null,
          key: '~chandelure_mega',
          tier: { level: 'Mega' as const, shadow: false },
          shiny: false,
          name: 'Mega Chandelure',
          entry: undefined,
          source: 'feed' as const,
          autoset: false,
          image: PICTURE,
        },
      ],
    });
  };

  it('asks Pokebattler about the boss a raid’s post holds by name', async () => {
    const raid = await reportedRaid({
      tier: { level: 'Mega', shadow: false },
      boss: { name: 'Mega Chandelure' },
    });
    const made = setup({ parties: raid.store, regions: raid.regions, raidBosses: listed() });
    const used = await made.run({}, inPost(raid.postId));
    expect(made.pokebattler.asked).toHaveLength(1);
    expect(made.pokebattler.asked[0]).toMatchObject({
      boss: 'CHANDELURE_MEGA',
      raidLevel: 'RAID_LEVEL_MEGA',
    });
    expect(partsOf(used).head).toContain('Mega Chandelure');
    expect(thumbnailOf(answerOf(used))).toBe(PICTURE);
  });

  it('takes the name typed, in the tier the list gives it', async () => {
    const made = setup({ raidBosses: listed() });
    await made.run({ boss: 'mega chandelure' });
    expect(made.pokebattler.asked[0]).toMatchObject({
      boss: 'CHANDELURE_MEGA',
      raidLevel: 'RAID_LEVEL_MEGA',
    });
  });

  it('asks for a tier when the list does not have it, as for any boss', async () => {
    const made = setup();
    expect(told(await made.run({ boss: 'Mega Chandelure' }))).toBe(
      'Mega Chandelure is not a raid or max battle boss now. Say which tier to simulate with `tier`.',
    );
    expect(made.pokebattler.asked).toEqual([]);
    await made.run({ boss: 'Mega Chandelure', tier: 'MegaLegendary' });
    expect(made.pokebattler.asked[0]).toMatchObject({
      boss: 'CHANDELURE_MEGA',
      raidLevel: 'RAID_LEVEL_MEGA_5',
    });
  });

  it('says what Pokebattler says of a name it does not know', async () => {
    const made = setup({ raidBosses: listed() });
    made.pokebattler.known = new Set();
    expect(told(await made.run({ boss: 'Mega Chandelure' }))).toMatch(
      /^Pokebattler does not know Mega Chandelure as a boss of /u,
    );
  });

  it('refuses a shadow tier, and moves it does not know', async () => {
    const made = setup({ raidBosses: listed() });
    expect(told(await made.run({ boss: 'Mega Chandelure', tier: 'shadow:T5' }))).toBe(
      'Mega Chandelure is never the boss of a shadow raid.',
    );
    expect(told(await made.run({ boss: 'Mega Chandelure', moveset: 'Hex / Shadow Ball' }))).toMatch(
      /is not a moveset of Mega Chandelure/u,
    );
    expect(made.pokebattler.asked).toEqual([]);
  });

  it('still asks which, for a species whose megas the game data has, X and Y', async () => {
    const made = setup();
    expect(told(await made.run({ boss: 'Mega Charizard' }))).toMatch(
      /^"Mega Charizard" is not the name of one Pokémon\. Did you mean /u,
    );
    const raid = await reportedRaid({
      tier: { level: 'Mega', shadow: false },
      boss: { key: 'yveltal' },
    });
    const inRaid = setup({ parties: raid.store, regions: raid.regions });
    expect(told(await inRaid.run({ boss: 'Mega Charizard' }, inPost(raid.postId)))).toMatch(
      /^"Mega Charizard" is not the name of one Pokémon\./u,
    );
    expect(made.pokebattler.asked).toEqual([]);
    expect(inRaid.pokebattler.asked).toEqual([]);
  });

  it('takes a row of the list by its name for a mega alone', async () => {
    // The feed's name and picture disagreed, so the row has no entry: it is no word on Yveltal.
    const list = raidBossesFixture();
    const rows = list.bosses();
    const row = rows.find((one) => one.entry?.key === 'yveltal');
    if (!row) throw new Error('no Yveltal on the list');
    Object.assign(list, {
      bosses: () => [{ ...row, entry: undefined }, ...rows.filter((one) => one !== row)],
    });
    const made = setup({ raidBosses: list });
    expect(told(await made.run({ boss: 'yveltal' }))).toMatch(
      /is not a raid or max battle boss now/u,
    );
  });

  it('offers a boss listed in two tiers once while typing', async () => {
    const list = listed();
    const rows = list.bosses();
    const row = rows.find((one) => one.name === 'Mega Chandelure');
    if (!row) throw new Error('no Mega Chandelure on the list');
    Object.assign(list, {
      bosses: () => [...rows, { ...row, tier: { level: 'SuperMega' as const, shadow: false } }],
    });
    const made = setup({ raidBosses: list });
    const interaction = fakeAutocomplete({
      commandName: 'counters',
      focusedName: 'boss',
      focused: 'mega chand',
    });
    await made.router.handle(interaction as never);
    const offered = (interaction.respond.mock.calls[0]?.[0] ?? []) as readonly { name: string }[];
    expect(offered.filter((one) => one.name === 'Mega Chandelure')).toHaveLength(1);
  });

  it('keeps refusing a name that is no mega of a known species', async () => {
    for (const name of ['Newmon', 'Mega Newmon']) {
      const raid = await reportedRaid({ boss: { name } });
      const made = setup({ parties: raid.store, regions: raid.regions });
      expect(told(await made.run({}, inPost(raid.postId)))).toBe(
        `I cannot ask Pokebattler about ${name} yet: it is newer than the game data I have.`,
      );
    }
  });

  it('offers the listed boss while typing, and only the average of its moves', async () => {
    const made = setup({ raidBosses: listed() });
    const asking = async (focusedName: string, focused: string, options = {}) => {
      const interaction = fakeAutocomplete({
        commandName: 'counters',
        focusedName,
        focused,
        options,
      });
      await made.router.handle(interaction as never);
      return (interaction.respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string }[];
    };
    expect(await asking('boss', 'mega chand')).toContainEqual({
      name: 'Mega Chandelure',
      value: 'Mega Chandelure',
    });
    expect(await asking('boss', 'yveltal')).not.toContainEqual(
      expect.objectContaining({ name: 'Mega Chandelure' }),
    );
    expect(await asking('moveset', '', { boss: 'Mega Chandelure' })).toEqual([
      { name: 'Average of all movesets', value: 'average' },
    ]);
  });
});

/** A max boss list of one boss, by its catalogue key and tier. */
function listing(key: string, tier: MaxTier): MaxBossProvider {
  const entry = catalogueFixture().byKey(key);
  if (!entry) throw new Error(`no ${key} in the fixture`);
  return {
    bosses: () => [
      {
        pokemonId: entry.pokemonId,
        form: entry.form,
        key,
        tier,
        shiny: false,
        name: entry.name,
        entry,
        source: 'feed',
        autoset: false,
      },
    ],
    coming: () => [],
    hidden: () => [],
    feedBosses: () => [],
  };
}
