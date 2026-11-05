import { InteractionContextType, MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeChatInput,
  sent,
  answered,
} from '../../../test/support/fake-interactions.js';
import { MemoryHistoryOptIns } from '../../../test/support/history.js';
import { MemoryNewTrains } from '../../../test/support/new-trains.js';
import { ALICE } from '../../../test/support/parties.js';
import { MemoryGymTargets } from '../../../test/support/gym-targets.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryUsers } from '../../../test/support/users.js';
import { MemoryWants } from '../../../test/support/wants.js';
import { MemoryTargetWants } from '../../../test/support/target-wants.js';
import { boxTarget } from '../../domain/notify/target-wants.js';
import { declaredSubcommands } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { DEFAULT_USER_SETTINGS } from '../../db/repositories/user-repository.js';
import { settings, settingsLines } from './settings.js';

function setup(features: { notifications?: boolean } = {}) {
  const users = new MemoryUsers();
  const wants = new MemoryWants();
  const targets = new MemoryGymTargets();
  const newTrains = new MemoryNewTrains();
  const history = new MemoryHistoryOptIns();
  const targetWants = new MemoryTargetWants();
  const { ctx } = createTestContext({
    users,
    wants,
    gymTargets: targets,
    newTrains,
    historyOptIns: history,
    targetWants,
  });
  ctx.config.settings.features = { ...ctx.config.settings.features, ...features };
  const router = new InteractionRouter(ctx, [settings], []);
  const run = async (
    subcommand: string,
    options: Record<string, string | boolean> = {},
    extra: object = {},
  ) => {
    const interaction = fakeChatInput({
      commandName: 'settings',
      subcommand,
      userId: ALICE,
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** What the member was answered. */
  const answer = async (subcommand: string, options: Record<string, string | boolean> = {}) =>
    answered(await run(subcommand, options)).content;
  return { users, wants, targets, targetWants, newTrains, history, run, answer };
}

describe('/settings', () => {
  it('is offered in servers and in a DM with the bot, with every subcommand of the spec', () => {
    const json = settings.data.toJSON();
    expect(json.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
    expect(declaredSubcommands(json.options)).toEqual([
      'show',
      'mentions',
      'mentions-groups',
      'mentions-shouts',
      'mentions-train-stops',
      'boss-set',
      'new-train',
      'history',
      'auto-status',
      'privacy',
      'pokebattler-id',
    ]);
    expect(settings.help.category).toBe('notifications');
    // The switch for all pings names every ping it switches.
    const all = settings.subcommands.get('mentions')?.help?.details ?? '';
    expect(all).toMatch(/^Turns every ping of you in a post on or off: /);
    expect(all).toContain('a raid that moved to another region');
    expect(all).toContain('the warning before a post is archived');
    for (const handler of settings.subcommands.values()) {
      expect(handler.help?.details).toBeTruthy();
      expect(handler.help?.examples?.length).toBeGreaterThan(0);
    }
  });

  it('answers the member alone', async () => {
    const made = setup();
    const used = await made.run('mentions', { enabled: false });
    expect(sent(used.reply).flags).toBe(MessageFlags.Ephemeral);
    expect(used.deferReply).not.toHaveBeenCalled();
  });

  it.each([
    ['mentions', 'mentions'],
    ['mentions-groups', 'mentionsGroups'],
    ['mentions-shouts', 'mentionsShouts'],
    ['mentions-train-stops', 'mentionsTrainStops'],
    ['boss-set', 'bossSetNotification'],
  ] as const)('%s writes the setting the party code reads', async (subcommand, field) => {
    const made = setup();
    const off = await made.answer(subcommand, { enabled: false });
    expect((await made.users.get(ALICE))[field]).toBe(false);
    expect(off).toMatch(/no longer/);
    const on = await made.answer(subcommand, { enabled: true });
    expect((await made.users.get(ALICE))[field]).toBe(true);
    expect(on).toMatch(/^You will /);
    expect(on).not.toMatch(/no longer/);
    // Setting what is set already answers the same sentence.
    expect(await made.answer(subcommand, { enabled: true })).toBe(on);
  });

  it('new-train is for the server it is used in, and for no other', async () => {
    const made = setup();
    const AWAY = '412345678901234568';
    expect(await made.answer('new-train', { enabled: true })).toBe(
      'You will get a DM when a train is announced in this server, in a region you can see.',
    );
    expect(await made.newTrains.isOn(ALICE, FAKE_GUILD_ID)).toBe(true);
    expect(await made.newTrains.isOn(ALICE, AWAY)).toBe(false);
    // Setting what is set already answers the same sentence.
    expect(await made.answer('new-train', { enabled: true })).toMatch(/^You will get a DM/);
    expect(await made.answer('show')).toContain(
      '- DM for a new train in this server: **on** · `/settings new-train`',
    );
    const elsewhere = await made.run('show', {}, { guildId: AWAY });
    expect(answered(elsewhere).content).toContain(
      '- DM for a new train in this server: **off** · `/settings new-train`',
    );
    expect(await made.answer('new-train', { enabled: false })).toBe(
      'You will no longer get a DM when a train is announced in this server.',
    );
    expect(await made.newTrains.isOn(ALICE, FAKE_GUILD_ID)).toBe(false);
    // It is no setting of the member as a whole any more.
    expect(DEFAULT_USER_SETTINGS).not.toHaveProperty('newTrainNotification');
  });

  it('new-train says in a DM with the bot to use it in a server, and sets nothing', async () => {
    const made = setup();
    const used = await made.run('new-train', { enabled: true }, { isDm: true });
    expect(answered(used).content).toBe(
      'Whether I tell you about new trains is set per server. Use `/settings new-train` in the ' +
        'server you mean.',
    );
    expect(made.newTrains.rows).toEqual([]);
    const shown = await made.run('show', {}, { isDm: true });
    expect(answered(shown).content).toContain(
      '- DM for a new train: set per server · `/settings new-train` in a server',
    );
  });

  it('history keeps the member named in the history of this server only, from now on', async () => {
    const made = setup();
    const AWAY = '412345678901234568';
    expect(await made.answer('history', { enabled: true })).toBe(
      'The party history of this server keeps your Discord id with what you sign up for and how ' +
        'far you get in every raid, max battle, train and meetup, and with every field research and ' +
        'Team GO Rocket report of yours, that ends from now on, those under way included. ' +
        '`/settings history enabled:False` takes it out again.',
    );
    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(true);
    expect(await made.history.isOptedIn(ALICE, AWAY)).toBe(false);
    expect(await made.answer('show')).toContain(
      "- Named in this server's history: **on** · `/settings history`",
    );
    const elsewhere = await made.run('show', {}, { guildId: AWAY });
    expect(answered(elsewhere).content).toContain(
      "- Named in this server's history: **off** · `/settings history`",
    );
  });

  it('history takes the member out of what the history of this server already keeps', async () => {
    const made = setup();
    await made.run('history', { enabled: true });
    made.history.named(ALICE, FAKE_GUILD_ID, 3);
    expect(await made.answer('history', { enabled: false })).toBe(
      'The party history of this server no longer keeps your Discord id. It was taken out of ' +
        'the 3 records of raids, max battles, trains, meetups and reports at stops kept with it so ' +
        'far, which still count, without it.',
    );
    await made.run('history', { enabled: true });
    made.history.named(ALICE, FAKE_GUILD_ID, 1);
    expect(await made.answer('history', { enabled: false })).toBe(
      'The party history of this server no longer keeps your Discord id. It was taken out of ' +
        'the one record of a raid, max battle, train, meetup or report at a stop kept with it so ' +
        'far, which still counts, without it.',
    );
    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(false);
    expect(made.history.namedIn(ALICE, FAKE_GUILD_ID)).toBe(0);
    expect(await made.answer('history', { enabled: false })).toBe(
      'The party history of this server no longer keeps your Discord id.',
    );
  });

  it('history says in a DM with the bot to use it in a server, and sets nothing', async () => {
    const made = setup();
    const used = await made.run('history', { enabled: true }, { isDm: true });
    expect(answered(used).content).toBe(
      'Whether the party history keeps your Discord id is set per server. Use ' +
        '`/settings history` in the server you mean.',
    );
    expect(made.history.rows).toEqual([]);
    const shown = await made.run('show', {}, { isDm: true });
    expect(answered(shown).content).toContain(
      '- Named in the history: set per server · `/settings history` in a server',
    );
  });

  it('history says what is kept, and that the legacy history is never tied to anybody', () => {
    const details = settings.subcommands.get('history')?.help?.details ?? '';
    expect(details).toContain('You always count in it, without your name.');
    expect(details).toContain('never tied to you');
    // Reports at stops as well (plan 8H-2), never the stop itself.
    expect(details).toContain(
      'It keeps every field research and Team GO Rocket report that ends as well: what was ' +
        'reported, the area and the region of its stop (never the stop itself), when, how it ended ' +
        'and how many others reported the same.',
    );
    expect(details).toContain('and the reports you make');
  });

  it('says what each switch means now', async () => {
    const made = setup();
    expect(await made.answer('mentions-shouts', { enabled: true })).toBe(
      'You will be pinged by `/shout` where you are signed up.',
    );
    expect(await made.answer('mentions-shouts', { enabled: false })).toBe(
      'You will no longer be pinged by `/shout`.',
    );
    expect(await made.answer('boss-set', { enabled: true })).toBe(
      'You will get a DM when an egg you are signed up for gets its boss.',
    );
  });

  it('says that the master switch keeps a kind of ping quiet', async () => {
    const made = setup();
    await made.run('mentions', { enabled: false });
    for (const subcommand of ['mentions-groups', 'mentions-shouts', 'mentions-train-stops']) {
      const on = await made.answer(subcommand, { enabled: true });
      expect(on).toContain('All pings are switched off for you, though');
      expect(on).toContain('`/settings mentions enabled:True`');
      // Switching it off needs no such warning.
      expect(await made.answer(subcommand, { enabled: false })).not.toContain('though');
    }
    // A direct message is no ping in a post.
    expect(await made.answer('boss-set', { enabled: true })).not.toContain('though');
    expect(await made.answer('new-train', { enabled: true })).not.toContain('though');
    await made.run('mentions', { enabled: true });
    expect(await made.answer('mentions-shouts', { enabled: true })).not.toContain('though');
  });

  it('says that no DM is sent where notifications are switched off on this bot', async () => {
    const made = setup({ notifications: false });
    const off =
      ' Notifications are switched off on this bot, though, so no such DM is sent for now.';
    expect(await made.answer('boss-set', { enabled: true })).toBe(
      `You will get a DM when an egg you are signed up for gets its boss.${off}`,
    );
    expect(await made.answer('new-train', { enabled: true })).toContain(off);
    expect(await made.answer('boss-set', { enabled: false })).not.toContain('though');
    // A ping in a post is no notification of that kind.
    expect(await made.answer('mentions-shouts', { enabled: true })).not.toContain('though');
  });

  it('allows thirty changes a minute', async () => {
    const made = setup();
    for (let use = 0; use < 30; use++) await made.run('mentions', { enabled: use % 2 === 0 });
    const next = await made.run('mentions', { enabled: true });
    expect(sent(next.reply).content).toMatch(/^You can use \/settings mentions again in /);
    // Looking is not limited.
    expect(await made.answer('show')).toContain('**Your settings**');
  });

  it('sets the status of whoever reports a raid or makes a train', async () => {
    const made = setup();
    expect(await made.answer('auto-status', { status: 'coming' })).toBe(
      'When you report a raid or max battle, or make a train, you are signed up for it as coming.',
    );
    expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.Coming);
    await made.run('auto-status', { status: 'here' });
    expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.Present);
    await made.run('auto-status', { status: 'interested' });
    expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.Interested);
    expect(await made.answer('auto-status', { status: 'none' })).toBe(
      'When you report a raid or max battle, or make a train, you are not signed up for it.',
    );
    expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.NotInterested);
  });

  it('sets whether a raid report or a train names who made it', async () => {
    const made = setup();
    expect(await made.answer('privacy', { visibility: 'anonymous' })).toBe(
      'The post of a raid you report or a train you make does not say who did.',
    );
    expect((await made.users.get(ALICE)).raidPrivacy).toBe(RaidPrivacy.Anonymous);
    expect(await made.answer('privacy', { visibility: 'visible' })).toBe(
      'The post of a raid you report or a train you make names you.',
    );
    expect((await made.users.get(ALICE)).raidPrivacy).toBe(RaidPrivacy.Visible);
  });

  it('offers the statuses and visibilities as choices', () => {
    const options = settings.data.toJSON().options ?? [];
    const choicesOf = (name: string) => {
      const sub = options.find((option) => option.name === name);
      const [option] = sub && 'options' in sub ? (sub.options ?? []) : [];
      return option && 'choices' in option ? option.choices?.map((choice) => choice.name) : [];
    };
    expect(choicesOf('auto-status')).toEqual(['Interested', 'Coming', 'Here', 'None']);
    expect(choicesOf('privacy')).toEqual(['Visible', 'Anonymous']);
  });

  it('works in a DM with the bot', async () => {
    const made = setup();
    const used = await made.run('mentions', { enabled: false }, { isDm: true });
    expect(answered(used).content).toMatch(/no longer/);
    expect((await made.users.get(ALICE)).mentions).toBe(false);
  });
});

describe('/settings show', () => {
  it('lists everything with the subcommand that changes it', async () => {
    const made = setup();
    expect(await made.answer('show')).toBe(
      [
        '**Your settings**',
        '- Pings in posts: **on** · `/settings mentions`',
        '- Pings for groups and times: **on** · `/settings mentions-groups`',
        '- Pings for shouts: **on** · `/settings mentions-shouts`',
        '- Pings when a train moves: **on** · `/settings mentions-train-stops`',
        '- DM when an egg gets its boss: **off** · `/settings boss-set`',
        '- DM for a new train in this server: **off** · `/settings new-train`',
        "- Named in this server's history: **off** · `/settings history`",
        '- Status when you report a raid or max battle, or make a train: **Interested** · `/settings auto-status`',
        '- Your reports and trains: **Visible** · `/settings privacy`',
        '- Pokémon, raid tiers and rewards on your list in this server: **0** · `/wants`',
        '- Your gyms in this server: **0** · `/targets`',
      ].join('\n'),
    );
  });

  it('counts what is on the lists of this server, and nothing in a DM', async () => {
    const made = setup();
    made.wants.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    made.wants.add(ALICE, FAKE_GUILD_ID, -5, 'raid');
    made.wants.add(ALICE, '499999999999999999', 151, 'both');
    made.targets.addRow(ALICE, FAKE_GUILD_ID, '4');
    const shown = await made.answer('show');
    expect(shown).toContain(
      '- Pokémon, raid tiers and rewards on your list in this server: **2** · `/wants`',
    );
    expect(shown).toContain('- Your gyms in this server: **1** · `/targets`');
    const dm = await made.run('show', {}, { isDm: true });
    expect(answered(dm).content).not.toMatch(/on your list|Your gyms/);
  });

  it('counts the lines of /wants: a target once with its boxes, of both tables', async () => {
    const made = setup();
    made.wants.add(ALICE, FAKE_GUILD_ID, 487, 'both');
    made.wants.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { form: 'giratina_origin' });
    made.wants.add(ALICE, FAKE_GUILD_ID, 487, 'spawn', { form: 'giratina_origin' });
    made.wants.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { shadow: true });
    // The Research, Dynamax and Gigantamax boxes and the rewards are `TargetWant` rows.
    await made.targetWants.change(
      ALICE,
      FAKE_GUILD_ID,
      {
        add: [
          boxTarget('research-pokemon', 487),
          boxTarget('dynamax', 68),
          { kind: 'research-item', item: 'rare-candy' },
        ],
        remove: [],
      },
      0,
    );
    // Giratina (its species row and its Origin Forme: one line since plan 8R-4), Machamp, Rare
    // Candy.
    expect(await made.answer('show')).toContain(
      '- Pokémon, raid tiers and rewards on your list in this server: **3** · `/wants`',
    );
  });

  it('leaves the lists out where notifications are switched off', async () => {
    const made = setup({ notifications: false });
    expect(await made.answer('show')).not.toMatch(/on your list|Your gyms/);
  });

  it('shows what was changed, and what the master switch keeps quiet', async () => {
    const made = setup();
    await made.run('mentions', { enabled: false });
    await made.run('mentions-shouts', { enabled: false });
    await made.run('auto-status', { status: 'none' });
    await made.run('privacy', { visibility: 'anonymous' });
    const shown = await made.answer('show');
    expect(shown).toContain('- Pings in posts: **off** · `/settings mentions`');
    expect(shown).toContain(
      '- Pings for groups and times: **on** (quiet while all pings are off) · `/settings mentions-groups`',
    );
    expect(shown).toContain('- Pings for shouts: **off** · `/settings mentions-shouts`');
    expect(shown).toContain(
      '- Status when you report a raid or max battle, or make a train: **None**',
    );
    expect(shown).toContain('- Your reports and trains: **Anonymous**');
  });

  it('shows the friend code and the in-game name when they are set, as plain text', () => {
    const lines = settingsLines({
      snowflake: ALICE,
      ...DEFAULT_USER_SETTINGS,
      friendCode: '1234 5678 9012',
      nickname: '**Bold_one**',
    });
    expect(lines).toContain('Friend code: **1234 5678 9012** · `/friend-code register`');
    expect(lines).toContain('In-game name: **\\*\\*Bold\\_one\\*\\*** · `/nickname register`');
    const none = settingsLines({ snowflake: ALICE, ...DEFAULT_USER_SETTINGS, nickname: ' ' });
    expect(none.join('\n')).not.toMatch(/Friend code|In-game name/);
  });

  it('cuts a long legacy value, so the overview fits a message whatever is stored', () => {
    const long = '*_~`|>'.repeat(43).slice(0, 255);
    const lines = settingsLines({
      snowflake: ALICE,
      ...DEFAULT_USER_SETTINGS,
      mentions: false,
      friendCode: long,
      nickname: long,
    });
    const shown = ['**Your settings**', ...lines.map((line) => `- ${line}`)].join('\n');
    // With the two lines of the lists, which are short, far below Discord's 2,000.
    expect(shown.length).toBeLessThan(1_500);
    expect(lines.filter((line) => line.includes('…'))).toHaveLength(2);
  });

  it('calls a stored status that signs nobody up None', () => {
    const lines = settingsLines({
      snowflake: ALICE,
      ...DEFAULT_USER_SETTINGS,
      autoStatus: PartyStatus.Complete,
    });
    expect(lines).toContain(
      'Status when you report a raid or max battle, or make a train: **None** · `/settings auto-status`',
    );
  });
});

describe('/settings pokebattler-id', () => {
  it('saves the id of a Pokebattler account, shows it, and forgets it', async () => {
    const made = setup();
    expect(await made.answer('pokebattler-id', { id: 123456 } as never)).toBe(
      'Your Pokebattler user id is 123456: `/counters level:My Pokébox on Pokebattler` uses ' +
        'the Pokémon of that account.',
    );
    expect((await made.users.get(ALICE)).pokebattlerId).toBe(123456);
    expect(await made.answer('show')).toContain(
      '- Pokebattler user id: **123456** · `/settings pokebattler-id`',
    );
    expect(await made.answer('pokebattler-id')).toBe('Your Pokebattler user id is forgotten.');
    expect((await made.users.get(ALICE)).pokebattlerId).toBeNull();
    expect(await made.answer('show')).not.toContain('Pokebattler');
  });

  it('names the choice of /counters as the list shows it', () => {
    const details = settings.subcommands.get('pokebattler-id')?.help?.details ?? '';
    expect(details).toContain('`/counters level:My Pokébox on Pokebattler`');
  });

  it('takes a whole number from 1 to what the legacy column holds', () => {
    const json = settings.data.toJSON();
    const part = json.options?.find((option) => option.name === 'pokebattler-id') as
      | { options?: { name: string; min_value?: number; max_value?: number; required?: boolean }[] }
      | undefined;
    expect(part?.options).toEqual([
      expect.objectContaining({ name: 'id', min_value: 1, max_value: 2_147_483_647 }),
    ]);
    expect(part?.options?.[0]?.required).toBeFalsy();
  });
});
