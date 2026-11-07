import { ButtonStyle, ComponentType, InteractionContextType, MessageFlags } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_GUILD_ID,
  asV2,
  fakeButton,
  fakeChatInput,
  fakeModal,
  fakeSelect,
  answered,
  sent,
} from '../../../test/support/fake-interactions.js';
import { dialogField, dialogTexts, shownDialog } from '../../../test/support/dialogs.js';
import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
import { MemoryHistoryOptIns } from '../../../test/support/history.js';
import { MemoryLegacyFillIns, MemoryLegacyIndex } from '../../../test/support/legacy-fill-ins.js';
import { MemoryNewTrains } from '../../../test/support/new-trains.js';
import { ALICE } from '../../../test/support/parties.js';
import { MemoryGymTargets } from '../../../test/support/gym-targets.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import {
  buttonsOf,
  componentCount,
  customIdsOf,
  textDisplays,
} from '../../../test/support/messages.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryUsers } from '../../../test/support/users.js';
import { MemoryWants } from '../../../test/support/wants.js';
import { MemoryTargetWants } from '../../../test/support/target-wants.js';
import { boxTarget } from '../../domain/notify/target-wants.js';
import { LATE_DEFER_MS } from '../../discord/late-reply.js';
import { InteractionRouter } from '../../discord/router.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { DEFAULT_USER_SETTINGS } from '../../db/repositories/user-repository.js';
import type { OptedOut } from '../../db/repositories/history-repository.js';
import { targets as targetsCommand } from '../notifications/targets.js';
import { wants as wantsCommand } from '../notifications/wants.js';
import { help as helpCommand } from '../util/help.js';
import { settings, settingsControls } from './settings.js';
import { settingsLines, type LegacyLine } from './settings-lines.js';

type Fake = ReturnType<typeof fakeButton>;

/** What a press showed last in the panel's place: its `update`, or the edit after `deferUpdate`. */
function shownAfter(fake: Fake): V2Message {
  const calls = [fake.update, fake.editReply].flatMap(({ mock }) =>
    mock.calls.map((args, index) => ({
      at: mock.invocationCallOrder[index] ?? 0,
      payload: args[0],
    })),
  );
  const last = calls.sort((a, b) => a.at - b.at).at(-1)?.payload;
  if (last === undefined) throw new Error('the press showed nothing');
  return asV2(last);
}

/** The menus of a message with their options, the one marked to start with included. */
function menusOf(message: V2Message) {
  const found: { customId: string; options: { value: string; default?: boolean }[] }[] = [];
  const visit = (component: unknown): void => {
    const shown = component as {
      type?: number;
      custom_id?: string;
      options?: { value: string; default?: boolean }[];
      components?: unknown[];
    };
    if (shown.type === ComponentType.StringSelect) {
      found.push({ customId: shown.custom_id ?? '', options: shown.options ?? [] });
    }
    for (const child of shown.components ?? []) visit(child);
  };
  for (const component of message.components) visit(component);
  return found;
}

const AWAY = '412345678901234568';

function setup(features: { notifications?: boolean } = {}, legacy: { index?: boolean } = {}) {
  const users = new MemoryUsers();
  const wants = new MemoryWants();
  const targets = new MemoryGymTargets();
  const newTrains = new MemoryNewTrains();
  const history = new MemoryHistoryOptIns();
  const targetWants = new MemoryTargetWants();
  const fillIns = new MemoryLegacyFillIns(history);
  const legacyIndex = new MemoryLegacyIndex();
  const { ctx } = createTestContext({
    users,
    wants,
    gymTargets: targets,
    newTrains,
    historyOptIns: history,
    targetWants,
    legacyFillIns: fillIns,
    legacyIndex: legacy.index === true ? legacyIndex : undefined,
  });
  ctx.config.settings.features = { ...ctx.config.settings.features, ...features };
  const router = new InteractionRouter(
    ctx,
    [settings, wantsCommand, targetsCommand],
    [settingsControls],
  );
  /** `/settings`, as the member answers it: the panel. */
  const open = async (extra: object = {}) => {
    const interaction = fakeChatInput({ commandName: 'settings', userId: ALICE, ...extra });
    await router.handle(interaction as never);
    return interaction;
  };
  const panel = async (extra: object = {}) => asV2(answered(await open(extra)));
  /** A press on the panel, a private v2 message. */
  const press = async (customId: string, extra: object = {}) => {
    const interaction = fakeButton({
      customId,
      userId: ALICE,
      ephemeralMessage: true,
      v2Message: true,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const pick = async (customId: string, value: string, extra: object = {}) => {
    const interaction = fakeSelect({
      customId,
      values: [value],
      userId: ALICE,
      ephemeralMessage: true,
      v2Message: true,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const submit = async (customId: string, form: unknown, fields: Record<string, string>) => {
    const interaction = fakeModal({
      customId,
      form,
      fields,
      userId: ALICE,
      ephemeralMessage: true,
      v2Message: true,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const run = async (commandName: string) => {
    const interaction = fakeChatInput({ commandName, userId: ALICE });
    await router.handle(interaction as never);
    return interaction;
  };
  return {
    ctx,
    users,
    wants,
    targets,
    targetWants,
    newTrains,
    history,
    fillIns,
    legacyIndex,
    open,
    panel,
    press,
    pick,
    submit,
    run,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('/settings', () => {
  it('is one command without options, offered in servers and in a DM with the bot', () => {
    const json = settings.data.toJSON();
    expect(json.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
    expect(json.options ?? []).toEqual([]);
    expect(settings.help.category).toBe('notifications');
    expect(settings.help.examples).toEqual(['/settings']);
  });

  /** The paragraphs of `/help settings` on an installation with these features. */
  const helpOf = (
    features: { notifications?: boolean } = {},
    facts: { oldHistory?: boolean } = {},
  ): string[] => {
    const { details } = settings.help;
    const said =
      typeof details === 'function'
        ? details(setup(features).ctx.config.settings, { oldHistory: facts.oldHistory === true })
        : details;
    return (said ?? '').split('\n\n');
  };

  it('says in its help what the old bot’s history button does, only where it is offered (B6)', () => {
    const paragraph = (help: string[]) => help.find((one) => one.startsWith('The old bot’s'));
    expect(paragraph(helpOf({}, { oldHistory: true }))).toBe(
      'The old bot’s raids, trains and meetups count in this server’s numbers without saying ' +
        'who was there. With your history on, **Add my old-bot history** adds the ones you made ' +
        'or joined to your history; turning your history off takes them out again.',
    );
  });

  it('shows the button’s words on /help settings where the installation has the index (B6)', async () => {
    const page = async (legacyIndex: MemoryLegacyIndex | undefined) => {
      const { ctx } = createTestContext({ commands: [helpCommand, settings], legacyIndex });
      const asked = fakeChatInput({ commandName: 'help', options: { command: 'settings' } });
      await new InteractionRouter(ctx, [helpCommand, settings], []).handle(asked as never);
      return textDisplays(asV2(sent(asked.reply))).join('\n');
    };
    expect(await page(new MemoryLegacyIndex())).toContain('**Add my old-bot history**');
    expect(await page(undefined)).not.toContain('Add my old-bot history');
  });

  it('promises in its help the counts of wants and gyms only where the bot notifies', () => {
    expect(helpOf({ notifications: true })[1]).toBe(
      'In a server it also has what is set per server: DMs for new trains, your history, the ' +
        'boards, and how many wants and gyms you have there.',
    );
    expect(helpOf({ notifications: false })[1]).toBe(
      'In a server it also has what is set per server: DMs for new trains, your history and ' +
        'the boards.',
    );
  });

  it('says in its help what the history keeps and what the boards count (S4)', () => {
    const paragraphs = helpOf();
    expect(paragraphs.slice(2)).toEqual([
      '**Your history.** I keep a history of every raid, max battle, train and meetup that ' +
        'ends: what it was, where and when, and how many signed up, came and completed it. You ' +
        'always count in it, without your Discord id.',
      'I keep every field research and Team GO Rocket report that ends too: what was reported, ' +
        'when, how it ended and how many others reported the same.',
      'With your history on, I also keep your Discord id with what you do from then on: what ' +
        'you sign up for and when, how far you get, and what you report. `/stats me` shows your ' +
        'numbers. Turning it off takes your id out of everything kept so far; it all still counts.',
      'While a raid, max battle, train or meetup is going on, or a report stands, I keep who ' +
        'signed up or reported, to run it. When it ends, I keep only the ids of members whose ' +
        'history is on and delete the rest.',
      'A report at a stop is kept by its area and region, never the stop itself.',
      'The old bot’s raids, trains and meetups count in this server’s numbers without saying ' +
        'who was there.',
      '**The boards.** `/stats boards` ranks members by what others confirmed, and only those ' +
        'who turned the boards on; they are off until you do. Turning them on turns your ' +
        'history on too, and turning your history off takes you off the boards. A raid, max ' +
        'battle or train you report anonymously counts on no board.',
    ]);
  });

  it('answers privately with the panel of every setting, its controls beside them', async () => {
    const made = setup();
    const used = await made.open();
    expect(answered(used).flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    const shown = asV2(answered(used));
    expect(textDisplays(shown)).toEqual([
      '### Your settings',
      [
        'Pings in posts: **on**',
        'Pings for new groups and meeting times: **on**',
        'Pings for shouts: **on**',
        'Pings when a train moves: **on**',
      ].join('\n'),
      'DM when an egg gets its boss: **off**',
      'DM for a new train in this server: **off**',
      'History in this server: **off**',
      'On this server’s boards: **off**',
      'Status on reports and trains: **Interested**',
      'Name on reports and trains: **Visible**',
      'Pokebattler user id: none',
      'Wants in this server: **0**',
      'Your gyms in this server: **0**',
    ]);
    expect(buttonsOf(shown).map((button) => [button.label, button.customId])).toEqual([
      ['Pings: on', 'settings:mentions:set:off'],
      ['Groups and times: on', 'settings:groups:set:off'],
      ['Shouts: on', 'settings:shouts:set:off'],
      ['Train moves: on', 'settings:train-moves:set:off'],
      ['Turn on', 'settings:boss-set:set:on'],
      ['Turn on', 'settings:new-train:set:on'],
      ['Turn on', 'settings:history:set:on'],
      ['Turn on', 'settings:leaderboard:set:on'],
      ['Change…', 'settings:pokebattler:ask'],
      ['Show', 'settings:wants:show'],
      ['Show', 'settings:targets:show'],
    ]);
    expect(menusOf(shown).map((menu) => menu.customId)).toEqual([
      'settings:auto-status:set',
      'settings:privacy:set',
    ]);
  });

  it('colors green only what is on now, and blue what turns a setting on', async () => {
    const made = setup();
    await made.users.update(ALICE, { mentionsShouts: false });
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    const styles = buttonsOf(await made.panel()).map((button) => [button.customId, button.style]);
    expect(styles).toEqual([
      ['settings:mentions:set:off', ButtonStyle.Success],
      ['settings:groups:set:off', ButtonStyle.Success],
      ['settings:shouts:set:on', ButtonStyle.Secondary],
      ['settings:train-moves:set:off', ButtonStyle.Success],
      ['settings:boss-set:set:on', ButtonStyle.Primary],
      ['settings:new-train:set:on', ButtonStyle.Primary],
      ['settings:history:set:off', ButtonStyle.Secondary],
      ['settings:leaderboard:set:on', ButtonStyle.Primary],
      ['settings:pokebattler:ask', ButtonStyle.Secondary],
      ['settings:wants:show', ButtonStyle.Secondary],
      ['settings:targets:show', ButtonStyle.Secondary],
    ]);
  });

  it('fits the fullest panel in what Discord takes, every custom id once', async () => {
    const made = setup();
    await made.users.update(ALICE, {
      mentions: false,
      friendCode: '1234 5678 9012',
      nickname: '**Bold_one**',
      pokebattlerId: 2_147_483_647,
      autoStatus: PartyStatus.Coming,
      raidPrivacy: RaidPrivacy.Anonymous,
    });
    await made.newTrains.set(ALICE, FAKE_GUILD_ID, true, 0);
    await made.history.joinBoards(ALICE, FAKE_GUILD_ID, 0);
    made.wants.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    made.targets.addRow(ALICE, FAKE_GUILD_ID, '4');
    const shown = await made.panel();
    expectV2Sendable(shown);
    // The line of what a press changed shares the title's text: 36 of Discord's 40.
    expect(componentCount(shown)).toBe(36);
    const ids = [...customIdsOf(shown), ...menusOf(shown).map((menu) => menu.customId)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(textDisplays(shown)).toContain(
      'Friend code: **1234 5678 9012** · `/friend-code register`\n' +
        'In-game name: **\\*\\*Bold\\_one\\*\\*** · `/nickname register`',
    );
    expect(textDisplays(shown)).toContain(
      [
        'Pings in posts: **off**',
        'Pings for new groups and meeting times: **on** (quiet while pings in posts are off)',
        'Pings for shouts: **on** (quiet while pings in posts are off)',
        'Pings when a train moves: **on** (quiet while pings in posts are off)',
      ].join('\n'),
    );
  });

  it('shows in a DM what is set for the member as a whole, and says the rest is per server', async () => {
    const made = setup();
    await made.users.update(ALICE, { friendCode: '1234 5678 9012' });
    const shown = await made.panel({ isDm: true });
    expectV2Sendable(shown);
    const texts = textDisplays(shown);
    expect(texts).toContain(
      'New trains, your history, the boards, wants and gyms are set per server: use ' +
        '`/settings` in that server.',
    );
    expect(texts.join('\n')).not.toMatch(/this server|Wants in|gyms in/u);
    expect(texts).toContain('Friend code: **1234 5678 9012** · `/friend-code register`');
    expect(customIdsOf(shown)).toEqual([
      'settings:mentions:set:off',
      'settings:groups:set:off',
      'settings:shouts:set:off',
      'settings:train-moves:set:off',
      'settings:boss-set:set:on',
      'settings:pokebattler:ask',
    ]);
  });

  it('leaves the counts of wants and gyms out where notifications are switched off', async () => {
    const made = setup({ notifications: false });
    const shown = await made.panel();
    expect(textDisplays(shown).join('\n')).not.toMatch(/Wants in|gyms in/u);
    expect(customIdsOf(shown)).not.toContain('settings:wants:show');
  });

  it('counts the lines of /wants: a target once with its boxes, of both tables', async () => {
    const made = setup();
    made.wants.add(ALICE, FAKE_GUILD_ID, 487, 'both');
    made.wants.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { form: 'giratina_origin' });
    made.wants.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { shadow: true });
    made.wants.add(ALICE, AWAY, 151, 'both');
    await made.targetWants.change(
      ALICE,
      FAKE_GUILD_ID,
      {
        add: [boxTarget('dynamax', 68), { kind: 'research-item', item: 'rare-candy' }],
        remove: [],
      },
      0,
    );
    made.targets.addRow(ALICE, FAKE_GUILD_ID, '4');
    const texts = textDisplays(await made.panel());
    // Giratina (its species row and its forms: one line), Machamp, Rare Candy.
    expect(texts).toContain('Wants in this server: **3**');
    expect(texts).toContain('Your gyms in this server: **1**');
  });

  it('opens the panel for a subcommand of the old /settings, and changes nothing', async () => {
    const made = setup();
    const used = await made.open({ subcommand: 'mentions', options: { enabled: false } });
    expect(textDisplays(asV2(answered(used)))[0]).toBe('### Your settings');
    expect((await made.users.get(ALICE)).mentions).toBe(true);
  });
});

describe('the controls of /settings', () => {
  it.each([
    ['mentions', 'mentions', 'Pings'],
    ['groups', 'mentionsGroups', 'Groups and times'],
    ['shouts', 'mentionsShouts', 'Shouts'],
    ['train-moves', 'mentionsTrainStops', 'Train moves'],
  ] as const)(
    '%s sets the ping the party code reads, and the panel shows it',
    async (name, flag, label) => {
      const made = setup();
      const off = await made.press(`settings:${name}:set:off`);
      expect((await made.users.get(ALICE))[flag]).toBe(false);
      const shown = shownAfter(off);
      expect(buttonsOf(shown)).toContainEqual(
        expect.objectContaining({ label: `${label}: off`, customId: `settings:${name}:set:on` }),
      );
      const on = await made.press(`settings:${name}:set:on`);
      expect((await made.users.get(ALICE))[flag]).toBe(true);
      expect(buttonsOf(shownAfter(on))).toContainEqual(
        expect.objectContaining({ label: `${label}: on`, customId: `settings:${name}:set:off` }),
      );
    },
  );

  it('says what changed at the top of the panel', async () => {
    const made = setup();
    const shown = shownAfter(await made.press('settings:shouts:set:off'));
    expect(textDisplays(shown)[0]).toBe('### Your settings\nPings for shouts are off.');
    expect(textDisplays(shownAfter(await made.press('settings:shouts:set:on')))[0]).toBe(
      '### Your settings\nPings for shouts are on.',
    );
    expect(textDisplays(shownAfter(await made.press('settings:boss-set:set:on')))[0]).toBe(
      '### Your settings\nYou will get a DM when an egg you signed up for gets its boss.',
    );
    expect(textDisplays(shownAfter(await made.press('settings:mentions:set:off')))[0]).toBe(
      '### Your settings\nPings in posts are off: no post pings you, not even for groups, ' +
        'shouts or train moves.',
    );
  });

  it('sets the state the button showed, and only redraws where it is so already', async () => {
    const made = setup();
    // The panel was drawn while shouts were on; they were turned off elsewhere since.
    await made.users.update(ALICE, { mentionsShouts: false });
    const stale = await made.press('settings:shouts:set:off');
    expect((await made.users.get(ALICE)).mentionsShouts).toBe(false);
    const shown = shownAfter(stale);
    expect(textDisplays(shown)[0]).toBe('### Your settings\nThat was off already.');
    expect(buttonsOf(shown)).toContainEqual(
      expect.objectContaining({ label: 'Shouts: off', customId: 'settings:shouts:set:on' }),
    );
  });

  it('says that pings in posts keep a kind of ping quiet', async () => {
    const made = setup();
    await made.press('settings:mentions:set:off');
    await made.press('settings:groups:set:off');
    const on = shownAfter(await made.press('settings:groups:set:on'));
    expect(textDisplays(on)[0]).toBe(
      '### Your settings\nPings for new groups and meeting times are on. Pings in posts are ' +
        'off, though, so these stay quiet until you turn pings in posts on.',
    );
    // A DM is no ping in a post.
    expect(textDisplays(shownAfter(await made.press('settings:boss-set:set:on')))[0]).not.toMatch(
      /though/u,
    );
  });

  it('says that no DM is sent where notifications are switched off on this bot', async () => {
    const made = setup({ notifications: false });
    expect(textDisplays(shownAfter(await made.press('settings:boss-set:set:on')))[0]).toBe(
      '### Your settings\nYou will get a DM when an egg you signed up for gets its boss. This ' +
        'bot sends no such DMs for now, though.',
    );
    expect(textDisplays(shownAfter(await made.press('settings:new-train:set:on')))[0]).toMatch(
      /This bot sends no such DMs for now, though\.$/u,
    );
    expect(textDisplays(shownAfter(await made.press('settings:shouts:set:off')))[0]).not.toMatch(
      /though/u,
    );
  });

  it('sets new trains for the server it is pressed in, and for no other', async () => {
    const made = setup();
    const on = shownAfter(await made.press('settings:new-train:set:on'));
    expect(textDisplays(on)[0]).toBe(
      '### Your settings\nYou will get a DM when a train is announced in a region of this ' +
        'server you can see.',
    );
    expect(textDisplays(on)).toContain('DM for a new train in this server: **on**');
    expect(await made.newTrains.isOn(ALICE, FAKE_GUILD_ID)).toBe(true);
    expect(await made.newTrains.isOn(ALICE, AWAY)).toBe(false);
    expect(textDisplays(await made.panel({ guildId: AWAY }))).toContain(
      'DM for a new train in this server: **off**',
    );
    const again = shownAfter(await made.press('settings:new-train:set:on'));
    expect(textDisplays(again)[0]).toBe('### Your settings\nThat was on already.');
    const off = shownAfter(await made.press('settings:new-train:set:off'));
    expect(textDisplays(off)[0]).toBe(
      '### Your settings\nNo more DMs for new trains in this server.',
    );
    expect(await made.newTrains.isOn(ALICE, FAKE_GUILD_ID)).toBe(false);
    expect(DEFAULT_USER_SETTINGS).not.toHaveProperty('newTrainNotification');
  });

  it('turns the history on in this server only, and off again', async () => {
    const made = setup();
    const on = shownAfter(await made.press('settings:history:set:on'));
    expect(textDisplays(on)[0]).toBe(
      '### Your settings\nYour history is on: from now on I keep your Discord id with the ' +
        'raids, max battles, trains and meetups you join, including those going on now, and ' +
        'with the reports you make at stops. `/stats me` shows your numbers.',
    );
    expect(textDisplays(on)).toContain('History in this server: **on**');
    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(true);
    expect(await made.history.isOptedIn(ALICE, AWAY)).toBe(false);
    // Named nowhere yet and on no board: nothing to ask about, it is off at once.
    const pressed = await made.press('settings:history:set:off');
    expect(pressed.showModal).not.toHaveBeenCalled();
    expect(textDisplays(shownAfter(pressed))[0]).toBe('### Your settings\nYour history is off.');
    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(false);
  });

  it('only redraws where the history was on already, or the boards off already', async () => {
    const made = setup();
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    const optIn = vi.spyOn(made.history, 'optIn');
    expect(textDisplays(shownAfter(await made.press('settings:history:set:on')))[0]).toBe(
      '### Your settings\nThat was on already.',
    );
    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(true);
    expect(optIn).toHaveBeenCalledTimes(1);
    const off = shownAfter(await made.press('settings:leaderboard:set:off'));
    expect(textDisplays(off)[0]).toBe('### Your settings\nThat was off already.');
    expect(textDisplays(off)).toContain('On this server’s boards: **off**');
    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(true);
  });

  it('puts the member on this server’s boards, turning the history on with it', async () => {
    const made = setup();
    const on = await made.press('settings:leaderboard:set:on');
    // A slow write: the press is acknowledged first.
    expect(on.deferUpdate).toHaveBeenCalled();
    expect(textDisplays(shownAfter(on))[0]).toBe(
      '### Your settings\nYou are on this server’s boards: `/stats boards` ranks you by what ' +
        'others confirmed. Your history was off, so I turned it on: the boards count what it ' +
        'keeps.',
    );
    expect(await made.history.isOnBoards(ALICE, FAKE_GUILD_ID)).toBe(true);
    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(true);
    expect(await made.history.isOnBoards(ALICE, AWAY)).toBe(false);
    expect(textDisplays(shownAfter(await made.press('settings:leaderboard:set:on')))[0]).toBe(
      '### Your settings\nThat was on already.',
    );
    const off = shownAfter(await made.press('settings:leaderboard:set:off'));
    expect(textDisplays(off)[0]).toBe(
      '### Your settings\nYou are off this server’s boards. Your history stays on.',
    );
    expect(await made.history.isOnBoards(ALICE, FAKE_GUILD_ID)).toBe(false);
    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(true);
  });

  it('acknowledges a quick write that turns late in the panel’s place, then edits it (A7)', async () => {
    const made = setup();
    let answer: (() => void) | undefined;
    let asked: (() => void) | undefined;
    const wasAsked = new Promise<void>((resolve) => {
      asked = resolve;
    });
    const write = made.users.update.bind(made.users);
    vi.spyOn(made.users, 'update').mockImplementation(async (...args) => {
      asked?.();
      await new Promise<void>((resolve) => {
        answer = resolve;
      });
      return write(...args);
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pressing = made.press('settings:shouts:set:off');
    await wasAsked;
    await vi.advanceTimersByTimeAsync(LATE_DEFER_MS);
    answer?.();
    const pressed = await pressing;
    expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    expect(pressed.update).not.toHaveBeenCalled();
    expect(textDisplays(asV2(sent(pressed.editReply)))[0]).toBe(
      '### Your settings\nPings for shouts are off.',
    );
  });

  it('acknowledges a slow write once, however long it takes', async () => {
    const made = setup();
    let answer: (() => void) | undefined;
    let asked: (() => void) | undefined;
    const wasAsked = new Promise<void>((resolve) => {
      asked = resolve;
    });
    const join = made.history.joinBoards.bind(made.history);
    vi.spyOn(made.history, 'joinBoards').mockImplementation(async (...args) => {
      asked?.();
      await new Promise<void>((resolve) => {
        answer = resolve;
      });
      return join(...args);
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pressing = made.press('settings:leaderboard:set:on');
    await wasAsked;
    await vi.advanceTimersByTimeAsync(LATE_DEFER_MS);
    answer?.();
    const pressed = await pressing;
    expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    expect(pressed.reply).not.toHaveBeenCalled();
    expect(textDisplays(shownAfter(pressed))[0]).toMatch(/^### Your settings\nYou are on /u);
  });

  it('says on the boards that anonymous raids and trains count on no board (W6)', async () => {
    const made = setup();
    await made.users.update(ALICE, { raidPrivacy: RaidPrivacy.Anonymous });
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    expect(textDisplays(shownAfter(await made.press('settings:leaderboard:set:on')))[0]).toBe(
      '### Your settings\nYou are on this server’s boards: `/stats boards` ranks you by what ' +
        'others confirmed. Your raids, max battles and trains are anonymous, so they count on ' +
        'no board, only in `/stats me`.',
    );
  });

  it('refuses the settings of a server in a DM with the bot, and sets nothing', async () => {
    const made = setup();
    for (const id of [
      'settings:new-train:set:on',
      'settings:history:set:on',
      'settings:wants:show',
    ]) {
      const used = await made.press(id, { isDm: true });
      expect(sent(used.reply).content).toBe('This only works in a server.');
    }
    expect(made.newTrains.rows).toEqual([]);
    expect(made.history.rows).toEqual([]);
  });

  it('works in a DM with the bot for what is set for the member as a whole', async () => {
    const made = setup();
    const used = await made.press('settings:mentions:set:off', { isDm: true });
    expect((await made.users.get(ALICE)).mentions).toBe(false);
    expect(textDisplays(shownAfter(used))).toContain(
      'New trains, your history, the boards, wants and gyms are set per server: use ' +
        '`/settings` in that server.',
    );
  });

  it('sets the status of whoever reports a raid or makes a train, its menu marking it', async () => {
    const made = setup();
    const statusMenu = (shown: V2Message) =>
      menusOf(shown).find((menu) => menu.customId === 'settings:auto-status:set');
    expect(
      statusMenu(await made.panel())?.options.map((option) => [option.value, option.default]),
    ).toEqual([
      ['interested', true],
      ['coming', undefined],
      ['here', undefined],
      ['none', undefined],
    ]);
    const coming = shownAfter(await made.pick('settings:auto-status:set', 'coming'));
    expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.Coming);
    expect(textDisplays(coming)[0]).toBe(
      '### Your settings\nA raid or max battle you report, or a train you make, signs you up ' +
        'as coming.',
    );
    expect(statusMenu(coming)?.options.find((option) => option.default)?.value).toBe('coming');
    await made.pick('settings:auto-status:set', 'here');
    expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.Present);
    const none = shownAfter(await made.pick('settings:auto-status:set', 'none'));
    expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.NotInterested);
    expect(textDisplays(none)[0]).toBe(
      '### Your settings\nA raid or max battle you report, or a train you make, does not sign ' +
        'you up.',
    );
    // A pick of what is stored already (the panel was stale) only redraws.
    expect(textDisplays(shownAfter(await made.pick('settings:auto-status:set', 'none')))[0]).toBe(
      '### Your settings\nYour status was None already.',
    );
  });

  it('sets whether the post of a raid report or a train names who made it', async () => {
    const made = setup();
    const anonymous = shownAfter(await made.pick('settings:privacy:set', 'anonymous'));
    expect((await made.users.get(ALICE)).raidPrivacy).toBe(RaidPrivacy.Anonymous);
    expect(textDisplays(anonymous)[0]).toBe(
      '### Your settings\nPosts of raids and max battles you report, and of trains you make, ' +
        'do not name you.',
    );
    expect(textDisplays(shownAfter(await made.pick('settings:privacy:set', 'anonymous')))[0]).toBe(
      '### Your settings\nYour posts were Anonymous already.',
    );
    expect(textDisplays(anonymous)).toContain('Name on reports and trains: **Anonymous**');
    const visible = shownAfter(await made.pick('settings:privacy:set', 'visible'));
    expect((await made.users.get(ALICE)).raidPrivacy).toBe(RaidPrivacy.Visible);
    expect(textDisplays(visible)[0]).toBe(
      '### Your settings\nPosts of raids and max battles you report, and of trains you make, ' +
        'name you.',
    );
  });

  it('answers a menu value it does not know as a stale control', async () => {
    const made = setup();
    const used = await made.pick('settings:privacy:set', 'loud');
    expect(sent(used.reply).content).toBe('This is out of date and no longer works.');
    expect((await made.users.get(ALICE)).raidPrivacy).toBe(RaidPrivacy.Visible);
  });

  it('allows thirty changes a minute, and looking is not limited by them', async () => {
    const made = setup();
    for (let use = 0; use < 30; use++) {
      await made.press(`settings:mentions:set:${use % 2 === 0 ? 'off' : 'on'}`);
    }
    const next = await made.press('settings:mentions:set:off');
    expect(sent(next.reply).content).toMatch(/^That was a lot of clicks\. Try again in /u);
    expect(textDisplays(await made.panel())[0]).toBe('### Your settings');
  });
});

describe('the old bot’s history in /settings (plan 8H-10)', () => {
  const ADD = 'settings:legacy:add';
  const OFFER =
    'Your raids, trains and meetups with the old bot in this server can be added to your history.';
  const QUEUED = 'Your old-bot history is being added.';
  const FAILED = 'Your old-bot history could not be added. Ask staff, then press **Try again**.';
  const FAILED_FOR_GOOD = 'Your old-bot history could not be added: ask staff.';
  const offered = (shown: V2Message) =>
    buttonsOf(shown).filter((button) => button.customId === ADD);

  it('offers it only with the history on, a member index here, and a file of the member in it', async () => {
    // No member index on this installation: nothing about it, whatever else.
    const none = setup();
    await none.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    none.legacyIndex.add(ALICE, FAKE_GUILD_ID);
    expect(offered(await none.panel())).toEqual([]);
    expect(textDisplays(await none.panel()).join('\n')).not.toMatch(/old bot/u);

    const made = setup({}, { index: true });
    made.legacyIndex.add(ALICE, FAKE_GUILD_ID);
    // History off.
    expect(offered(await made.panel())).toEqual([]);
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    const shown = await made.panel();
    expect(offered(shown)).toEqual([
      expect.objectContaining({ label: 'Add my old-bot history', style: ButtonStyle.Primary }),
    ]);
    expect(textDisplays(shown)).toContain(OFFER);
    // No file of the member in another server's index.
    await made.history.optIn(ALICE, AWAY, 0);
    expect(offered(await made.panel({ guildId: AWAY }))).toEqual([]);
  });

  it('queues the fill-in once, starts the worker, and says it will follow', async () => {
    const made = setup({}, { index: true });
    made.legacyIndex.add(ALICE, FAKE_GUILD_ID);
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    const shown = shownAfter(await made.press(ADD));
    expect(textDisplays(shown)[0]).toBe('### Your settings\nAsked: it takes a few minutes.');
    expect(textDisplays(shown)).toContain(QUEUED);
    expect(offered(shown)).toEqual([]);
    expect(await made.fillIns.stateOf(ALICE, FAKE_GUILD_ID)).toEqual({ state: 'queued' });
    expect(made.legacyIndex.kicks).toBe(1);
    // A press again (a panel drawn before): said so, nothing queued or started.
    const again = shownAfter(await made.press(ADD));
    expect(textDisplays(again)[0]).toBe('### Your settings\nYour old-bot history is being added.');
    expect(made.legacyIndex.kicks).toBe(1);
  });

  it('says what the fill-in did, or that it could not be done', async () => {
    const made = setup({}, { index: true });
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    made.fillIns.ended(ALICE, FAKE_GUILD_ID, { state: 'done', filled: 1234 });
    const done = await made.panel();
    expect(textDisplays(done)).toContain('Your Discord id is now on 1,234 parties of the old bot.');
    expect(offered(done)).toEqual([]);
    expect(textDisplays(shownAfter(await made.press(ADD)))[0]).toBe(
      '### Your settings\nYour old-bot history was added already.',
    );
    made.fillIns.ended(ALICE, FAKE_GUILD_ID, { state: 'done', filled: 0 });
    expect(textDisplays(await made.panel())).toContain(
      'None of your old-bot parties could be added: this bot holds them otherwise.',
    );
  });

  it('offers Try again where the fill-in failed, and queues it again (A1)', async () => {
    const made = setup({}, { index: true });
    made.legacyIndex.add(ALICE, FAKE_GUILD_ID);
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    made.fillIns.ended(ALICE, FAKE_GUILD_ID, {
      state: 'failed',
      failure: 'Their file in the member index is damaged: run the history import again.',
    });
    const failed = await made.panel();
    expect(textDisplays(failed)).toContain(FAILED);
    expect(offered(failed)).toEqual([
      expect.objectContaining({ label: 'Try again', style: ButtonStyle.Primary }),
    ]);
    const shown = shownAfter(await made.press(ADD));
    expect(textDisplays(shown)[0]).toBe('### Your settings\nAsked: it takes a few minutes.');
    expect(textDisplays(shown)).toContain(QUEUED);
    expect(made.legacyIndex.kicks).toBe(1);
  });

  it('offers no Try again where the member index has no file of theirs any more', async () => {
    const made = setup({}, { index: true });
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    made.fillIns.ended(ALICE, FAKE_GUILD_ID, {
      state: 'failed',
      failure: 'The member index has no file of theirs (it was rebuilt without them).',
    });
    const failed = await made.panel();
    expect(textDisplays(failed)).toContain(FAILED_FOR_GOOD);
    expect(offered(failed)).toEqual([]);
  });

  it('offers no Try again where the installation has no index any more', async () => {
    const made = setup();
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    made.legacyIndex.add(ALICE, FAKE_GUILD_ID);
    made.fillIns.ended(ALICE, FAKE_GUILD_ID, {
      state: 'failed',
      failure: 'Their file in the member index is damaged: run the history import again.',
    });
    const failed = await made.panel();
    expect(textDisplays(failed)).toContain(FAILED_FOR_GOOD);
    expect(offered(failed)).toEqual([]);
  });

  it('says nothing of a waiting fill-in where the installation has no index any more (B5)', async () => {
    const made = setup();
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    made.fillIns.ended(ALICE, FAKE_GUILD_ID, { state: 'queued' });
    expect(textDisplays(await made.panel()).join('\n')).not.toMatch(/old.bot/u);
  });

  it('takes the line away with the history, and offers it again once the history is back (B11)', async () => {
    const made = setup({}, { index: true });
    made.legacyIndex.add(ALICE, FAKE_GUILD_ID);
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    await made.press(ADD);
    const off = shownAfter(await made.press('settings:history:set:off'));
    expect(textDisplays(off).join('\n')).not.toMatch(/old.bot/u);
    expect(await made.fillIns.stateOf(ALICE, FAKE_GUILD_ID)).toBeUndefined();
    // A panel drawn while the history was on, pressed now: nothing is asked.
    expect(textDisplays(shownAfter(await made.press(ADD)))[0]).toBe(
      '### Your settings\nYour history is off: turn it on first.',
    );
    const on = shownAfter(await made.press('settings:history:set:on'));
    expect(offered(on)).toHaveLength(1);
  });

  it('mentions it where turning the boards on turns the history on (B12)', async () => {
    const made = setup({}, { index: true });
    made.legacyIndex.add(ALICE, FAKE_GUILD_ID);
    const on = shownAfter(await made.press('settings:leaderboard:set:on'));
    expect(textDisplays(on)[0]).toMatch(
      /the boards count what it keeps\. Your old-bot history can be added too: press \*\*Add my old-bot history\*\*\.$/u,
    );
  });

  it('refuses a press without a file of the member, and in a DM', async () => {
    const made = setup({}, { index: true });
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    const pressed = await made.press(ADD);
    expect(textDisplays(shownAfter(pressed))[0]).toBe(
      '### Your settings\nThere is no old-bot history of yours to add.',
    );
    expect(await made.fillIns.stateOf(ALICE, FAKE_GUILD_ID)).toBeUndefined();
    const dm = await made.press(ADD, { isDm: true });
    expect(sent(dm.reply).content).toBe('This only works in a server.');
    expect(made.legacyIndex.kicks).toBe(0);
  });

  it('mentions it when the history is turned on and the member has a file', async () => {
    const made = setup({}, { index: true });
    made.legacyIndex.add(ALICE, FAKE_GUILD_ID);
    const on = shownAfter(await made.press('settings:history:set:on'));
    expect(textDisplays(on)[0]).toMatch(
      /`\/stats me` shows your numbers\. Your old-bot history can be added too: press \*\*Add my old-bot history\*\*\.$/u,
    );
    expect(offered(on)).toHaveLength(1);
  });

  it('fits the fullest panel with the offer: 39 of Discord’s 40 components', async () => {
    const made = setup({}, { index: true });
    await made.users.update(ALICE, {
      mentions: false,
      friendCode: '1234 5678 9012',
      nickname: '**Bold_one**',
      pokebattlerId: 2_147_483_647,
    });
    await made.newTrains.set(ALICE, FAKE_GUILD_ID, true, 0);
    await made.history.joinBoards(ALICE, FAKE_GUILD_ID, 0);
    made.legacyIndex.add(ALICE, FAKE_GUILD_ID);
    const shown = await made.panel();
    expectV2Sendable(shown);
    expect(componentCount(shown)).toBe(39);
  });
});

describe('turning the history off in /settings (S1, S2)', () => {
  it('asks in a dialog how many records lose the name, and Submit turns it off', async () => {
    const made = setup();
    await made.history.joinBoards(ALICE, FAKE_GUILD_ID, 0);
    made.history.named(ALICE, FAKE_GUILD_ID, 3);
    const asked = await made.press('settings:history:set:off');
    const dialog = shownDialog(asked);
    expect(dialog.custom_id).toBe('settings:history:forget');
    expect(dialog.title).toBe('Turn your history off');
    expect(dialogTexts(dialog)).toEqual([
      'This takes your Discord id off 3 records (they still count) and takes you off the ' +
        'boards. Submit turns it off.',
    ]);
    // Nothing changed before the Submit.
    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(true);
    const counted = await made.history.namedIn(ALICE, FAKE_GUILD_ID);
    const optOut = vi.spyOn(made.history, 'optOut');
    const submitted = await made.submit(dialog.custom_id, dialog, {});
    expect(submitted.deferUpdate).toHaveBeenCalledTimes(1);
    // The memory twin answers both from one number, so this holds by its make: it pins that the
    // line says the opt-out's own count. One path in SQL is `history-repository.db.test.ts`'s.
    const opted = (await optOut.mock.results[0]?.value) as OptedOut | undefined;
    expect(opted?.forgotten).toBe(counted);
    expect(textDisplays(shownAfter(submitted))[0]).toBe(
      '### Your settings\nYour history is off. I took your Discord id off 3 records; they ' +
        'still count. You are off the boards too.',
    );
    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(false);
    expect(await made.history.isOnBoards(ALICE, FAKE_GUILD_ID)).toBe(false);
  });

  it.each([
    [
      1,
      false,
      'This takes your Discord id off the one record (it still counts). Submit turns it off.',
    ],
    [2, false, 'This takes your Discord id off 2 records (they still count). Submit turns it off.'],
    [0, true, 'This takes you off the boards. Submit turns it off.'],
  ] as const)(
    'words the question for %s records, on the boards: %s',
    async (records, boards, text) => {
      const made = setup();
      await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
      if (boards) await made.history.joinBoards(ALICE, FAKE_GUILD_ID, 0);
      made.history.named(ALICE, FAKE_GUILD_ID, records);
      expect(dialogTexts(shownDialog(await made.press('settings:history:set:off')))).toEqual([
        text,
      ]);
    },
  );

  it('says so where the history was turned off meanwhile', async () => {
    const made = setup();
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    made.history.named(ALICE, FAKE_GUILD_ID, 2);
    const dialog = shownDialog(await made.press('settings:history:set:off'));
    await made.history.optOut(ALICE, FAKE_GUILD_ID);
    const submitted = await made.submit(dialog.custom_id, dialog, {});
    expect(textDisplays(shownAfter(submitted))[0]).toBe('### Your settings\nThat was off already.');
  });

  it('opens no dialog when the count is slow, and says so', async () => {
    const made = setup();
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    let asked: (() => void) | undefined;
    const wasAsked = new Promise<void>((resolve) => {
      asked = resolve;
    });
    vi.spyOn(made.history, 'namedIn').mockImplementation(() => {
      asked?.();
      return new Promise<number>(() => undefined);
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pressing = made.press('settings:history:set:off');
    await wasAsked;
    await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
    const pressed = await pressing;
    expect(pressed.showModal).not.toHaveBeenCalled();
    expect(sent(pressed.reply).content).toBe(SLOW_READ);
    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(true);
  });

  it('takes five Submits in ten minutes, in a window of their own', async () => {
    const made = setup();
    for (let use = 0; use < 5; use++) {
      await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
      made.history.named(ALICE, FAKE_GUILD_ID, 1);
      const dialog = shownDialog(await made.press('settings:history:set:off'));
      expect(textDisplays(shownAfter(await made.submit(dialog.custom_id, dialog, {})))[0]).toMatch(
        /Your history is off\./u,
      );
    }
    await made.history.optIn(ALICE, FAKE_GUILD_ID, 0);
    made.history.named(ALICE, FAKE_GUILD_ID, 1);
    // The button that would open the dialog is refused while its window is full.
    const refused = await made.press('settings:history:set:off');
    expect(refused.showModal).not.toHaveBeenCalled();
    expect(sent(refused.reply).content).toMatch(/^That was a lot of clicks\. Try again in /u);
    // Other controls go on in theirs.
    expect(textDisplays(shownAfter(await made.press('settings:shouts:set:off')))[0]).toBe(
      '### Your settings\nPings for shouts are off.',
    );
  });
});

describe('the Pokebattler id of /settings', () => {
  it('opens its dialog with the saved id, and saves what is submitted', async () => {
    const made = setup();
    await made.users.update(ALICE, { pokebattlerId: 26516 });
    const asked = await made.press('settings:pokebattler:ask');
    const dialog = shownDialog(asked);
    expect(dialog.title).toBe('Your Pokebattler user id');
    expect(dialog.custom_id).toMatch(/^settings:pokebattler:set:~[0-9a-z]+$/u);
    expect(dialogField(dialog, 'Pokebattler user id')).toMatchObject({ value: '26516' });
    const submitted = await made.submit(dialog.custom_id, dialog, { id: ' 123456 ' });
    expect((await made.users.get(ALICE)).pokebattlerId).toBe(123456);
    const shown = shownAfter(submitted);
    expect(textDisplays(shown)[0]).toBe(
      '### Your settings\nYour Pokebattler user id is 123456: `/counters level:My Pokébox on ' +
        'Pokebattler` uses its Pokémon.',
    );
    expect(textDisplays(shown)).toContain('Pokebattler user id: **123456**');
  });

  it('clears the id when the line is left empty', async () => {
    const made = setup();
    await made.users.update(ALICE, { pokebattlerId: 26516 });
    const dialog = shownDialog(await made.press('settings:pokebattler:ask'));
    const shown = shownAfter(await made.submit(dialog.custom_id, dialog, { id: '' }));
    expect((await made.users.get(ALICE)).pokebattlerId).toBeNull();
    expect(textDisplays(shown)[0]).toBe('### Your settings\nYour Pokebattler user id is cleared.');
  });

  it.each(['0', '2147483648', '12.5', 'abc', '-3'])(
    'refuses %s before acknowledging, and keeps the id',
    async (typed) => {
      const made = setup();
      await made.users.update(ALICE, { pokebattlerId: 26516 });
      const dialog = shownDialog(await made.press('settings:pokebattler:ask'));
      const submitted = await made.submit(dialog.custom_id, dialog, { id: typed });
      expect(submitted.deferUpdate).not.toHaveBeenCalled();
      expect(sent(submitted.reply).content).toBe(
        'A Pokebattler user id is a whole number from 1 to 2,147,483,647.',
      );
      expect((await made.users.get(ALICE)).pokebattlerId).toBe(26516);
    },
  );

  it('counts neither the opening of its dialog nor a Submit it refuses (A1)', async () => {
    const made = setup();
    for (let use = 0; use < 30; use++) {
      const dialog = shownDialog(await made.press('settings:pokebattler:ask'));
      await made.submit(dialog.custom_id, dialog, { id: 'abc' });
    }
    expect(textDisplays(shownAfter(await made.press('settings:shouts:set:off')))[0]).toBe(
      '### Your settings\nPings for shouts are off.',
    );
  });

  it('counts the opening of its dialog as a look at /settings, never as a change', async () => {
    const made = setup();
    for (let use = 0; use < 30; use++) {
      expect(shownDialog(await made.press('settings:pokebattler:ask')).title).toBe(
        'Your Pokebattler user id',
      );
    }
    const refused = await made.press('settings:pokebattler:ask');
    expect(refused.showModal).not.toHaveBeenCalled();
    expect(sent(refused.reply).content).toMatch(/^You can use \/settings again in /u);
    expect(sent((await made.open()).reply).content).toMatch(/^You can use \/settings again in /u);
    // The changes go on in their own window.
    expect(textDisplays(shownAfter(await made.press('settings:shouts:set:off')))[0]).toBe(
      '### Your settings\nPings for shouts are off.',
    );
  });

  it('answers a Submit without its line as a stale control (A2)', async () => {
    const made = setup();
    await made.users.update(ALICE, { pokebattlerId: 26516 });
    const submitted = await made.submit('settings:pokebattler:set:~abc', undefined, {});
    expect(sent(submitted.reply).content).toBe('This is out of date and no longer works.');
    expect((await made.users.get(ALICE)).pokebattlerId).toBe(26516);
  });
});

describe('Show of /settings', () => {
  it.each([
    ['wants', 'wants'],
    ['targets', 'targets'],
  ] as const)('answers apart with exactly what /%s answers', async (list, command) => {
    const made = setup();
    made.wants.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    made.targets.addRow(ALICE, FAKE_GUILD_ID, '4');
    const shown = await made.press(`settings:${list}:show`);
    expect(shown.update).not.toHaveBeenCalled();
    expect(shown.deferUpdate).not.toHaveBeenCalled();
    const apart = sent(shown.reply);
    expect(apart.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    expect(apart.components).toEqual(answered(await made.run(command)).components);
  });

  it('acknowledges privately first when the read is late, never in the panel’s place', async () => {
    const made = setup();
    made.wants.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    let answer: (() => void) | undefined;
    let asked: (() => void) | undefined;
    const wasAsked = new Promise<void>((resolve) => {
      asked = resolve;
    });
    const list = made.wants.list.bind(made.wants);
    const held = vi.spyOn(made.wants, 'list').mockImplementation(async (...args) => {
      asked?.();
      await new Promise<void>((resolve) => {
        answer = resolve;
      });
      return list(...args);
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pressing = made.press('settings:wants:show');
    await wasAsked;
    await vi.advanceTimersByTimeAsync(LATE_DEFER_MS);
    answer?.();
    const shown = await pressing;
    vi.useRealTimers();
    held.mockRestore();
    expect(sent(shown.deferReply).flags).toBe(MessageFlags.Ephemeral);
    expect(shown.deferUpdate).not.toHaveBeenCalled();
    expect(asV2(sent(shown.editReply)).components).toEqual(
      answered(await made.run('wants')).components,
    );
  });
});

describe('settingsLines', () => {
  it('words every setting for the member and for staff alike, without commands', () => {
    const lines = settingsLines(
      {
        snowflake: ALICE,
        ...DEFAULT_USER_SETTINGS,
        autoStatus: PartyStatus.Complete,
        friendCode: '1234 5678 9012',
      },
      { newTrain: true, history: true, leaderboard: false },
    ).map((line) => line.text);
    expect(lines).toEqual([
      'Pings in posts: **on**',
      'Pings for new groups and meeting times: **on**',
      'Pings for shouts: **on**',
      'Pings when a train moves: **on**',
      'DM when an egg gets its boss: **off**',
      'DM for a new train in this server: **on**',
      'History in this server: **on**',
      'On this server’s boards: **off**',
      // A stored status that signs nobody up is None.
      'Status on reports and trains: **None**',
      'Name on reports and trains: **Visible**',
      'Friend code: **1234 5678 9012**',
      'Pokebattler user id: none',
    ]);
  });

  it('words the old bot’s history in neutral words, where there is anything to say (plan 8H-10)', () => {
    const line = (legacy: LegacyLine | undefined) =>
      settingsLines(
        { snowflake: ALICE, ...DEFAULT_USER_SETTINGS },
        {
          newTrain: false,
          history: true,
          leaderboard: false,
          ...(legacy === undefined ? {} : { legacy }),
        },
      )
        .filter((one) => one.setting === 'legacy')
        .map((one) => one.text);
    expect(line(undefined)).toEqual([]);
    expect(line({ state: 'offer' })).toEqual(['Old-bot history: **not added**']);
    expect(line({ state: 'queued' })).toEqual(['Old-bot history: **being added**']);
    expect(line({ state: 'done', filled: 1234 })).toEqual([
      'Old-bot history: **added** (on 1,234 parties)',
    ]);
    expect(
      line({
        state: 'failed',
        failure: 'Their file in the member index is damaged: run the history import again.',
        retry: true,
      }),
    ).toEqual([
      'Old-bot history: **could not be added** (Their file in the member index is damaged: run the history import again.)',
    ]);
  });

  it('cuts a long legacy value, so the panel fits whatever is stored', () => {
    const long = '*_~`|>'.repeat(43).slice(0, 255);
    const lines = settingsLines({
      snowflake: ALICE,
      ...DEFAULT_USER_SETTINGS,
      friendCode: long,
      nickname: long,
    });
    expect(lines.filter((line) => line.text.includes('…'))).toHaveLength(2);
    expect(lines.every((line) => line.text.length < 400)).toBe(true);
  });
});
