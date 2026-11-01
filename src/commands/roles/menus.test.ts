import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeButton,
  fakeChatInput,
  fakeMessage,
  fakeSelect,
  sent,
  type FakeMessage,
  type FakeRow,
  type SentPayload,
  answered,
} from '../../../test/support/fake-interactions.js';
import { ALICE } from '../../../test/support/parties.js';
import {
  assertSendable,
  buttonsOf,
  FakeRoleGateway,
  menusOf,
  textOfMenus,
  ROLE,
  selfRolesWith,
} from '../../../test/support/roles.js';
import type { MemorySelfRoles } from '../../../test/support/self-roles.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { components } from '../../components/index.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
import { menuRequest, NONE_VALUE } from '../../domain/roles/menus.js';
import { iam, iamnot } from './iam.js';
import { OLD_MENUS, roleControls } from './menus.js';

const ELSEWHERE = '499999999999999999';
/** What a member reads when Discord refuses a role for lack of a permission. */
const LET =
  'Discord did not let me. A moderator should check that my role has the Manage Roles ' +
  'permission and stands above the roles I hand out.';

/** What a shown message is: its text, and its rows as a press on it sees them. */
interface Shown {
  content: string;
  message: FakeMessage;
}

async function setup(kept: { storage?: MemorySelfRoles; gateway?: FakeRoleGateway } = {}) {
  const made = selfRolesWith(kept);
  if (!kept.storage) {
    await made.offerSample();
    made.server.member(ALICE);
  }
  const { ctx, entries } = createTestContext({ selfRoles: made.selfRoles });
  const router = new InteractionRouter(ctx, [iam, iamnot], [roleControls]);
  const shownBy = (payload: SentPayload): Shown => {
    assertSendable(payload);
    return {
      content: textOfMenus(payload),
      message: fakeMessage((payload.components ?? []) as FakeRow[], undefined, payload.content),
    };
  };
  /** `/iam` without a role, by Alice as she is at this moment. */
  const open = async (extra: object = {}): Promise<Shown> => {
    const interaction = fakeChatInput({
      commandName: 'iam',
      ...made.server.interactionOf(ALICE),
      ...extra,
    });
    await router.handle(interaction as never);
    return shownBy(answered(interaction));
  };
  /** The custom id of the n-th menu of a message. */
  const menuId = (shown: Shown, index: number): string => {
    const menu = menusOf({ components: shown.message.rows })[index];
    if (!menu) throw new Error(`the message has no menu ${String(index)}`);
    return menu.custom_id;
  };
  /**
   * Alice changes the n-th menu of a message to these values. She is shown as she is at this
   * moment unless `extra` says otherwise. Gives the interaction and the message as it is then.
   */
  const pick = async (shown: Shown, index: number, values: string[], extra: object = {}) => {
    const interaction = fakeSelect({
      customId: menuId(shown, index),
      values,
      message: shown.message,
      ...made.server.interactionOf(ALICE),
      ...extra,
    });
    await router.handle(interaction as never);
    const edited = interaction.editReply.mock.calls.at(-1)?.[0];
    return { interaction, after: edited ? shownBy(edited) : undefined };
  };
  const press = async (shown: Shown, label: string, extra: object = {}) => {
    const button = buttonsOf({ components: shown.message.rows }).find((b) => b.label === label);
    if (!button?.custom_id) throw new Error(`the message has no button ${label}`);
    const interaction = fakeButton({
      customId: button.custom_id,
      message: shown.message,
      ...made.server.interactionOf(ALICE),
      ...extra,
    });
    await router.handle(interaction as never);
    const updated = interaction.editReply.mock.calls.at(-1)?.[0];
    return { interaction, after: updated ? shownBy(updated) : undefined };
  };
  const held = () => made.server.heldNames(ALICE);
  /** The last line of a message: what the change did. */
  const note = (shown: Shown | undefined) =>
    shown?.content.split('\n').at(-1)?.replace(/^-# /u, '');
  const ticked = (shown: Shown | undefined) =>
    menusOf({ components: shown?.message.rows ?? [] }).map((menu) =>
      menu.options.filter((option) => option.default === true).map((option) => option.label),
    );
  return { ...made, ctx, entries, router, open, pick, press, held, note, ticked, menuId };
}

/** What `setup` gives a test. */
type Made = Awaited<ReturnType<typeof setup>>;

/** The roles each menu of a message offers, by their labels, without "None". */
const offered = (shown: Shown | undefined) =>
  menusOf({ components: shown?.message.rows ?? [] }).map((menu) =>
    menu.options.filter((option) => option.value !== NONE_VALUE).map((option) => option.label),
  );

describe('/iam without a role', () => {
  it('shows the menus privately, with the roles the member holds ticked', async () => {
    const { server, router, open, ticked } = await setup();
    server.member(ALICE, ROLE.north, ROLE.valor, ROLE.moderator);
    const interaction = fakeChatInput({ commandName: 'iam', ...server.interactionOf(ALICE) });
    await router.handle(interaction as never);
    expect(sent(interaction.reply).flags).toBe(
      MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    );
    expect(interaction.deferReply).not.toHaveBeenCalled();
    const shown = await open();
    expect(shown.content.split('\n').slice(0, 2)).toEqual([
      '### Your roles on this server',
      'Tick and untick them in the menus; a menu takes effect as soon as you close it.',
    ]);
    expect(shown.content.split('\n').slice(2)).toEqual([
      '**Regions** · pick any number',
      '**Teams** · pick one',
      '**Other** · pick any number',
    ]);
    expect(ticked(shown)).toEqual([['North'], ['Valor'], []]);
  });

  it('says so where there is nothing to pick', async () => {
    const made = selfRolesWith();
    made.server.member(ALICE);
    const { ctx } = createTestContext({ selfRoles: made.selfRoles });
    const router = new InteractionRouter(ctx, [iam], [roleControls]);
    const interaction = fakeChatInput({ commandName: 'iam', ...made.server.interactionOf(ALICE) });
    await router.handle(interaction as never);
    const answer = answered(interaction);
    expect(answer.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    expect(textOfMenus(answer)).toBe(
      'This server has no roles you can give yourself at the moment.',
    );
    expect(menusOf(answer)).toEqual([]);
  });

  it('says what is wrong when roles are offered but none can be given', async () => {
    const { server, open } = await setup();
    server.bot.mayManageRoles = false;
    expect(await open()).toMatchObject({
      content:
        'I cannot change roles on this server: I lack the Manage Roles permission. A moderator ' +
        'has to give it to my role.',
    });
    server.bot.mayManageRoles = true;
    for (const id of [ROLE.north, ROLE.south, ROLE.east, ROLE.trader]) server.delete(id);
    for (const id of [ROLE.instinct, ROLE.mystic, ROLE.valor]) server.edit(id, { position: 55 });
    const shown = await open();
    expect(shown.content).toBe(
      "None of this server's self-assignable roles can be given at the moment. A moderator " +
        'can see why with `/admin self-roles list`.',
    );
    expect(menusOf({ components: shown.message.rows })).toEqual([]);
  });

  it('says so when the roles of the server are not known', async () => {
    const { router } = await setup();
    const interaction = fakeChatInput({ commandName: 'iam', guildId: ELSEWHERE });
    await router.handle(interaction as never);
    expect(sent(interaction.reply).content).toBe(
      'I cannot see the roles of this server at the moment. Try again in a minute.',
    );
  });
});

describe('changing a menu', () => {
  it('gives the roles that were ticked, one after the other, and shows the new state', async () => {
    const { open, pick, held, note, ticked, gateway } = await setup();
    const { interaction, after } = await pick(await open(), 0, [ROLE.north, ROLE.south]);
    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(note(after)).toBe('Added **North**, **South**.');
    expect(ticked(after)).toEqual([['North', 'South'], ['None'], []]);
    expect(held()).toEqual(['North', 'South']);
    expect(gateway.said()).toEqual(['give North', 'give South']);
  });

  it('takes away the roles of the menu that were unticked', async () => {
    const { server, open, pick, held, note, ticked } = await setup();
    server.member(ALICE, ROLE.north, ROLE.south, ROLE.trader);
    const { after } = await pick(await open(), 0, [ROLE.south, ROLE.east]);
    expect(note(after)).toBe('Added **East**; removed **North**.');
    expect(ticked(after)).toEqual([['East', 'South'], ['None'], ['Trader']]);
    expect(held()).toEqual(['East', 'South', 'Trader']);

    const { after: emptied } = await pick(after ?? (await open()), 0, []);
    expect(note(emptied)).toBe('Removed **East**, **South**.');
    expect(held()).toEqual(['Trader']);
  });

  it('gives the one role of a pick-one menu and takes the other away', async () => {
    const { server, open, pick, held, note, ticked, gateway } = await setup();
    server.member(ALICE, ROLE.valor);
    const { after } = await pick(await open(), 1, [ROLE.mystic]);
    // She unticked Valor herself by choosing Mystic: the rule of the group needs no saying.
    expect(note(after)).toBe('Added **Mystic**; removed **Valor**.');
    expect(ticked(after)).toEqual([[], ['Mystic'], []]);
    expect(held()).toEqual(['Mystic']);
    expect(gateway.said()).toEqual(['give Mystic', 'take Valor']);
  });

  it('takes the role of a pick-one group away with "None"', async () => {
    const { server, open, pick, held, note, ticked } = await setup();
    server.member(ALICE, ROLE.valor, ROLE.north);
    const { after } = await pick(await open(), 1, ['none']);
    expect(note(after)).toBe('Removed **Valor**.');
    expect(ticked(after)).toEqual([['North'], ['None'], []]);
    expect(held()).toEqual(['North']);
  });

  it('says that nothing changed when the menu is closed as it was', async () => {
    const { server, open, pick, note, gateway } = await setup();
    server.member(ALICE, ROLE.north);
    const { after } = await pick(await open(), 0, [ROLE.north]);
    expect(note(after)).toBe('Nothing was changed.');
    expect(gateway.calls).toEqual([]);
  });

  it('touches only the roles of the menu that was changed', async () => {
    const { server, open, pick, held } = await setup();
    const staff = [ROLE.moderator, ROLE.admin, ROLE.booster];
    server.member(ALICE, ...staff, ROLE.north, ROLE.valor, ROLE.trader);
    // Everything in each menu is unticked in turn, then everything is ticked.
    let shown = await open();
    shown = (await pick(shown, 0, [])).after ?? shown;
    expect(held()).toEqual(['Admin', 'Moderator', 'Server Booster', 'Trader', 'Valor']);
    shown = (await pick(shown, 2, [])).after ?? shown;
    expect(held()).toEqual(['Admin', 'Moderator', 'Server Booster', 'Valor']);
    shown = (await pick(shown, 1, ['none'])).after ?? shown;
    expect(held()).toEqual(['Admin', 'Moderator', 'Server Booster']);
    shown = (await pick(shown, 0, [ROLE.north, ROLE.south, ROLE.east])).after ?? shown;
    shown = (await pick(shown, 2, [ROLE.trader])).after ?? shown;
    await pick(shown, 1, [ROLE.instinct]);
    expect(held()).toEqual(
      [
        'Admin',
        'East',
        'Instinct',
        'Moderator',
        'North',
        'Server Booster',
        'South',
        'Trader',
      ].sort(),
    );
  });

  it('never gives or takes a role the menu did not show, whatever values arrive', async () => {
    const { server, open, pick, held, note, gateway } = await setup();
    server.member(ALICE, ROLE.moderator, ROLE.valor);
    const { after } = await pick(await open(), 0, [ROLE.admin, ROLE.moderator, ROLE.mystic, 'x']);
    expect(note(after)).toBe('Nothing was changed.');
    expect(held()).toEqual(['Moderator', 'Valor']);
    expect(gateway.calls).toEqual([]);
  });

  it('skips and names a ticked role that is no longer on the list', async () => {
    const { server, storage, open, pick, held, note, ticked } = await setup();
    server.member(ALICE, ROLE.east);
    const shown = await open();
    // Since the message was shown staff took North and East off the list.
    for (const name of ['North', 'East']) {
      const row = storage.rows.find((other) => other.name === name);
      await storage.removeRole(FAKE_GUILD_ID, row?.id ?? 0);
    }
    const { after } = await pick(shown, 0, [ROLE.north, ROLE.south]);
    expect(note(after)).toBe(
      'Added **South**. **North** is no longer a role you can give yourself.',
    );
    // East was unticked, but it is not the bot's to take any more: Alice keeps it.
    expect(held()).toEqual(['East', 'South']);
    expect(ticked(after)).toEqual([['South'], ['None'], []]);
  });

  it('skips a role that may no longer be given, with what a moderator has to mend', async () => {
    const { server, open, pick, held, note } = await setup();
    const shown = await open();
    server.edit(ROLE.north, { moderation: ['Ban Members'] });
    server.edit(ROLE.south, { position: 60 });
    const { after } = await pick(shown, 0, [ROLE.north, ROLE.south, ROLE.east]);
    expect(note(after)).toBe(
      'Added **East**. ' +
        '**North** is not handed out any more: the role was changed since it was put on the ' +
        'list, and it now grants more than a self-assigned role may. A moderator has to change ' +
        'the role back or take it off the list. ' +
        'I cannot give or take **South**: it is not below my own role in the list of roles of ' +
        'this server. A moderator has to move my role above it.',
    );
    expect(held()).toEqual(['East']);
  });

  it('gives none of two roles of a group that became pick-one since the menu was shown', async () => {
    const { storage, open, pick, held, note } = await setup();
    const shown = await open();
    await storage.saveGroup(FAKE_GUILD_ID, { name: 'Regions', pickOne: true });
    const { after } = await pick(shown, 0, [ROLE.north, ROLE.south]);
    expect(note(after)).toBe(
      '**North** was not given: only one role of the group Regions can be held at a time. ' +
        '**South** was not given: only one role of the group Regions can be held at a time. ' +
        'Nothing was changed.',
    );
    expect(held()).toEqual([]);
  });

  it('says the rule when an old menu of a group that became pick-one costs a role that stayed ticked', async () => {
    const { server, storage, open, pick, held, note } = await setup();
    // The menu of the regions lets several be ticked, and shows North ticked.
    server.member(ALICE, ROLE.north);
    const shown = await open();
    await storage.saveGroup(FAKE_GUILD_ID, { name: 'Regions', pickOne: true });
    // South is ticked beside North, which the member did not untick.
    const { after } = await pick(shown, 0, [ROLE.north, ROLE.south]);
    expect(note(after)).toBe(
      'Added **South**; removed **North**. Only one role of the group Regions can be held at a time.',
    );
    expect(held()).toEqual(['South']);
  });

  it('says once that the bot lacks Manage Roles, and changes nothing', async () => {
    const { server, open, pick, held } = await setup();
    const shown = await open();
    server.bot.mayManageRoles = false;
    const { after } = await pick(shown, 0, [ROLE.north, ROLE.south]);
    expect(after?.content).toBe(
      'I cannot change roles on this server: I lack the Manage Roles permission. A moderator ' +
        'has to give it to my role. Nothing was changed.',
    );
    expect(held()).toEqual([]);
  });

  it('says a sentence when Discord refuses the change, and shows the menus as they are', async () => {
    const { gateway, open, pick, held, note, ticked, entries } = await setup();
    gateway.refusing = 'no-permission';
    const { after } = await pick(await open(), 0, [ROLE.north]);
    expect(note(after)).toBe(`I could not give you **North**: ${LET} Nothing was changed.`);
    expect(ticked(after)).toEqual([[], ['None'], []]);
    expect(held()).toEqual([]);
    expect(entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });

  it('does not lose a change to a second menu changed before the first one arrived', async () => {
    const { server, gateway, open, pick, held } = await setup();
    const shown = await open();
    // Both presses were made while Discord still showed Alice without any role.
    const stale = server.interactionOf(ALICE);
    let release: () => void = () => undefined;
    gateway.holding = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = pick(shown, 0, [ROLE.north], stale);
    const second = pick(shown, 1, [ROLE.mystic], stale);
    release();
    await Promise.all([first, second]);
    expect(held()).toEqual(['Mystic', 'North']);
  });

  it('works on a message from before a restart', async () => {
    const before = await setup();
    before.server.member(ALICE, ROLE.north);
    const shown = await before.open();
    // New services and a new router over the same database and the same Discord.
    const after = await setup({ storage: before.storage, gateway: before.gateway });
    const { after: message } = await after.pick(shown, 0, [ROLE.south]);
    expect(after.note(message)).toBe('Added **South**; removed **North**.');
    expect(after.held()).toEqual(['South']);
  });

  it('answers a menu that its message does not have as a control that is no longer active', async () => {
    const { router, server, held } = await setup();
    const interaction = fakeSelect({
      customId: 'roles:other:pick:0:0',
      values: [ROLE.trader],
      messageRows: [],
      ...server.interactionOf(ALICE),
    });
    await router.handle(interaction as never);
    expect(sent(interaction.reply).content).toBe(STALE_COMPONENT);
    expect(held()).toEqual([]);
  });

  it('says so, without menus, when the roles of the server are not known', async () => {
    const { server, open, pick, ticked } = await setup();
    server.member(ALICE, ROLE.south);
    const shown = await open();
    const { interaction, after } = await pick(shown, 0, [ROLE.north], { guildId: ELSEWHERE });
    // Menus are drawn from the roles of the server: without them there are none to show, and
    // the ticks of the press do not stand.
    expect(after?.content).toBe(
      'I cannot see the roles of this server at the moment. Try again in a minute. Nothing was ' +
        'changed. Use `/iam` again for the menus.',
    );
    expect(ticked(after)).toEqual([]);
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('puts the menus back as they were for a member whose earlier changes are still under way', async () => {
    const { server, gateway, selfRoles, open, pick, held, ticked, note } = await setup();
    server.member(ALICE, ROLE.south);
    const shown = await open();
    let release = (): void => undefined;
    gateway.holding = new Promise<void>((resolve) => (release = resolve));
    const seen = server.seen(ALICE);
    const three = [ROLE.north, ROLE.east, ROLE.trader].map((roleId) =>
      selfRoles.change(FAKE_GUILD_ID, seen, { give: [roleId], take: [] }),
    );
    const { after } = await pick(shown, 1, [ROLE.mystic]);
    expect(note(after)).toBe(
      'I am still working on your earlier changes. Try again in a moment. Nothing was changed.',
    );
    expect(ticked(after)).toEqual([['South'], ['None'], []]);
    release();
    await Promise.all(three);
    expect(held()).toEqual(['East', 'North', 'South', 'Trader']);
  });

  it('says nothing through a menu whose interaction ran out while its change waited', async () => {
    const { server, gateway, selfRoles, clock, open, pick, held } = await setup();
    server.member(ALICE, ROLE.south);
    const shown = await open();
    let release = (): void => undefined;
    gateway.holding = new Promise<void>((resolve) => (release = resolve));
    const first = selfRoles.change(FAKE_GUILD_ID, server.seen(ALICE), {
      give: [ROLE.north],
      take: [],
    });
    const picking = pick(shown, 1, [ROLE.mystic]);
    await gateway.requests.reached(1);
    expect(gateway.calls).toHaveLength(1);
    clock.now += 15 * 60_000;
    release();
    await first;
    const { interaction } = await picking;
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(held()).toEqual(['North', 'South']);
  });

  it('puts the menus back as they were when the change fails before anything was done', async () => {
    const { server, gateway, open, pick, held, ticked, entries, note } = await setup();
    server.member(ALICE, ROLE.south);
    gateway.failing = new Error('Discord is away');
    const shown = await open();
    const { interaction, after } = await pick(shown, 0, [ROLE.north, ROLE.south]);
    // The tick of the press does not stand: the menus are made anew as the roles are. A
    // request that timed out may have arrived: it does not say that nothing changed.
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    expect(after?.content).toBe(`${shown.content}\n-# I could not make the change.`);
    expect(note(after)).toBe('I could not make the change.');
    expect(ticked(after)).toEqual([['South'], ['None'], []]);
    expect(held()).toEqual(['South']);
    // and the member is told as for any failure, with the reference of the log line.
    const failure = entries.find((entry) => entry.msg === 'interaction failed');
    expect(failure).toBeDefined();
    expect(sent(interaction.followUp)).toMatchObject({
      content: `Something went wrong (ref \`${String(failure?.ref)}\`).`,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('says what the last press did, never copying what the message said before', async () => {
    const { server, gateway, open, pick, note, ticked } = await setup();
    server.member(ALICE);
    const first = await pick(await open(), 0, [ROLE.north]);
    expect(note(first.after)).toBe('Added **North**.');
    gateway.failing = new Error('Discord is away');
    if (!first.after) throw new Error('nothing was shown');
    const second = await pick(first.after, 0, [ROLE.north, ROLE.south]);
    expect(note(second.after)).toBe('I could not make the change.');
    expect(second.after?.content).not.toContain('Added **North**.');
    expect(ticked(second.after)).toEqual([['North'], ['None'], []]);
    if (!second.after) throw new Error('nothing was shown');
    const third = await pick(second.after, 0, [ROLE.north, ROLE.south]);
    expect(third.after?.content).toBe(second.after.content);
  });

  it('turns the pages of a plain-text message of menus from before below it', async () => {
    const { open, press } = await manyGroups();
    const shown = await open();
    const rows = [
      ...menusOf({ components: shown.message.rows }).map((menu) => ({
        type: 1,
        components: [{ type: 3, ...menu }],
      })),
      { type: 1, components: buttonsOf({ components: shown.message.rows }) },
    ] as unknown as FakeRow[];
    const old = { content: 'Your roles', message: fakeMessage(rows, undefined, 'Your roles') };
    const { interaction } = await press(old, 'Next');
    expect(sent(interaction.editReply)).toMatchObject({ content: OLD_MENUS, components: [] });
    expect(textOfMenus(sent(interaction.followUp))).toContain('Page 2 of 2');
  });

  it('says a failure and a busy member below a plain-text message of menus from before', async () => {
    const { server, gateway, selfRoles, open, pick } = await setup();
    server.member(ALICE, ROLE.south);
    const shown = await open();
    const rows = menusOf({ components: shown.message.rows }).map((menu) => ({
      type: 1,
      components: [{ type: 3, ...menu }],
    })) as unknown as FakeRow[];
    const old = () => ({
      content: 'Your roles',
      message: fakeMessage(rows, undefined, 'Your roles'),
    });
    gateway.failing = new Error('Discord is away');
    const failed = await pick(old(), 0, [ROLE.north, ROLE.south]);
    expect(sent(failed.interaction.editReply)).toMatchObject({ content: OLD_MENUS });
    expect(textOfMenus(sent(failed.interaction.followUp)).split('\n').at(-1)).toBe(
      '-# I could not make the change.',
    );
    gateway.failing = undefined;
    let release = (): void => undefined;
    gateway.holding = new Promise<void>((resolve) => (release = resolve));
    const seen = server.seen(ALICE);
    const three = [ROLE.north, ROLE.east, ROLE.trader].map((roleId) =>
      selfRoles.change(FAKE_GUILD_ID, seen, { give: [roleId], take: [] }),
    );
    const busy = await pick(old(), 1, [ROLE.mystic]);
    expect(sent(busy.interaction.editReply)).toMatchObject({ content: OLD_MENUS });
    expect(textOfMenus(sent(busy.interaction.followUp))).toContain(
      'I am still working on your earlier changes.',
    );
    release();
    await Promise.all(three);
  });

  it('carries a change out from a plain-text message of menus from before, and shows new ones below', async () => {
    const { server, open, pick, held } = await setup();
    server.member(ALICE);
    const shown = await open();
    // The same menus as rows at the top of a message without the components-v2 flag.
    const rows = menusOf({ components: shown.message.rows }).map((menu) => ({
      type: 1,
      components: [{ type: 3, ...menu }],
    })) as unknown as FakeRow[];
    const old = { content: 'Your roles', message: fakeMessage(rows, undefined, 'Your roles') };
    const { interaction } = await pick(old, 0, [ROLE.north]);
    expect(held()).toEqual(['North']);
    expect(sent(interaction.editReply)).toEqual({
      content: OLD_MENUS,
      embeds: [],
      components: [],
      attachments: [],
    });
    const below = sent(interaction.followUp);
    expect(below.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    expect(textOfMenus(below).split('\n').at(-1)).toBe('-# Added **North**.');
  });

  it('still reports the failure when the menus cannot be put back either', async () => {
    const { server, gateway, open, router, menuId, entries } = await setup();
    server.member(ALICE, ROLE.south);
    const shown = await open();
    gateway.failing = new Error('Discord is away');
    const interaction = fakeSelect({
      customId: menuId(shown, 0),
      values: [ROLE.north],
      message: shown.message,
      ...server.interactionOf(ALICE),
    });
    interaction.editReply.mockRejectedValueOnce(new Error('no message'));
    await router.handle(interaction as never);
    expect(entries.some((entry) => entry.msg === 'could not put the role menus back')).toBe(true);
    const failure = entries.find((entry) => entry.msg === 'interaction failed');
    expect(String((failure?.err as { message?: string } | undefined)?.message)).toBe(
      'Discord is away',
    );
    expect(sent(interaction.followUp).content).toContain('Something went wrong');
  });

  it('takes away only what the menu showed ticked: a role got elsewhere since stays', async () => {
    const { server, open, pick, held, note, ticked } = await setup();
    // The message is made while Alice holds nothing; then she gets South some other way.
    const old = await open();
    server.member(ALICE, ROLE.south);
    const { after } = await pick(old, 0, [ROLE.north]);
    expect(note(after)).toBe('Added **North**.');
    expect(held()).toEqual(['North', 'South']);
    expect(ticked(after)).toEqual([['North', 'South'], ['None'], []]);
  });

  it('gives only what the menu showed unticked: a role given up elsewhere since stays away', async () => {
    const { server, open, pick, held, note, ticked, gateway } = await setup();
    // The message is made while Alice holds North and South; then she gives South up some
    // other way, and ticks East in the old message, which still shows South ticked.
    server.member(ALICE, ROLE.north, ROLE.south);
    const old = await open();
    expect(ticked(old)[0]).toEqual(['North', 'South']);
    server.member(ALICE, ROLE.north);
    const { after } = await pick(old, 0, [ROLE.north, ROLE.south, ROLE.east]);
    expect(note(after)).toBe('Added **East**.');
    expect(held()).toEqual(['East', 'North']);
    expect(gateway.calls.map((call) => [call.action, call.roleId])).toEqual([['give', ROLE.east]]);
    // The message is shown anew as things are.
    expect(ticked(after)[0]).toEqual(['East', 'North']);
  });

  it('changes nothing through an old menu that is closed as it was shown', async () => {
    const { server, open, pick, held, note, gateway } = await setup();
    server.member(ALICE, ROLE.north, ROLE.south);
    const old = await open();
    // She no longer holds South, which the old message still shows ticked.
    server.member(ALICE, ROLE.north);
    const { after } = await pick(old, 0, [ROLE.north, ROLE.south]);
    expect(note(after)).toBe('Nothing was changed.');
    expect(held()).toEqual(['North']);
    expect(gateway.calls).toEqual([]);
  });

  it('acts in a pick-one menu only on a real change of what it showed', async () => {
    const { server, open, pick, held, note, gateway } = await setup();
    // The message shows Valor; Alice gives it up elsewhere, and the old message sends it again.
    server.member(ALICE, ROLE.valor);
    const withValor = await open();
    server.member(ALICE);
    const again = await pick(withValor, 1, [ROLE.valor]);
    expect(note(again.after)).toBe('Nothing was changed.');
    expect(held()).toEqual([]);
    // The message shows "None"; Alice takes Mystic elsewhere, and the old message sends "None".
    const withNone = await open();
    server.member(ALICE, ROLE.mystic);
    const none = await pick(withNone, 1, ['none']);
    expect(note(none.after)).toBe('Nothing was changed.');
    expect(held()).toEqual(['Mystic']);
    expect(gateway.calls).toEqual([]);
  });

  it('says the rule of a pick-one group for a role the member did not untick in the menu', async () => {
    const { server, open, pick, held, note } = await setup();
    // The message shows no team; Alice then takes Valor with `/iam role`, and picks Mystic in it.
    const old = await open();
    server.member(ALICE, ROLE.valor);
    const { after } = await pick(old, 1, [ROLE.mystic]);
    expect(note(after)).toBe(
      'Added **Mystic**; removed **Valor**. Only one role of the group Teams can be held at a time.',
    );
    expect(held()).toEqual(['Mystic']);
  });

  it('reads "None" only from a menu that offered it', async () => {
    const { server, storage, open, pick, held, note } = await setup();
    const old = await open();
    // Since the message was made Alice got North, and the regions became a pick-one group.
    server.member(ALICE, ROLE.north);
    await storage.saveGroup(FAKE_GUILD_ID, { name: 'Regions', pickOne: true });
    const { after } = await pick(old, 0, ['none']);
    expect(note(after)).toBe('Nothing was changed.');
    expect(held()).toEqual(['North']);
  });

  it.each<[string, (made: Made) => void | Promise<void>, string]>([
    [
      'its row was removed',
      async (made) => {
        const row = made.storage.rows.find((other) => other.name === 'Mystic');
        await made.storage.removeRole(FAKE_GUILD_ID, row?.id ?? 0);
      },
      '**Mystic** is no longer a role you can give yourself. Nothing was changed.',
    ],
    [
      'it gained a permission',
      (made) => {
        made.server.edit(ROLE.mystic, { moderation: ['Kick Members'] });
      },
      '**Mystic** is not handed out any more: the role was changed since it was put on the ' +
        'list, and it now grants more than a self-assigned role may. A moderator has to change ' +
        'the role back or take it off the list. Nothing was changed.',
    ],
    [
      'it moved above the bot',
      (made) => {
        made.server.edit(ROLE.mystic, { position: 55 });
      },
      'I cannot give or take **Mystic**: it is not below my own role in the list of roles of ' +
        'this server. A moderator has to move my role above it. Nothing was changed.',
    ],
  ])(
    'keeps the old role of a pick-one menu when the picked one cannot be given: %s',
    async (_what, since, sentence) => {
      const made = await setup();
      made.server.member(ALICE, ROLE.valor);
      // The message shows Valor ticked; since then something happened to Mystic.
      const old = await made.open();
      await since(made);
      const { after } = await made.pick(old, 1, [ROLE.mystic]);
      expect(made.note(after)).toBe(sentence);
      expect(made.held()).toEqual(['Valor']);
      expect(made.gateway.calls).toEqual([]);
      expect(made.ticked(after)).toEqual([[], ['Valor'], []]);
    },
  );

  it('asks the service for no take when another role of a pick-one menu is picked', async () => {
    const made = await setup();
    made.server.member(ALICE, ROLE.valor);
    // The menu as an old message shows it: Valor ticked. Since then Mystic got a permission.
    const shown = [
      { value: NONE_VALUE, ticked: false },
      { value: ROLE.instinct, ticked: false },
      { value: ROLE.mystic, ticked: false },
      { value: ROLE.valor, ticked: true },
    ];
    made.server.edit(ROLE.mystic, { moderation: ['Kick Members'] });
    await made.selfRoles.change(
      FAKE_GUILD_ID,
      made.server.seen(ALICE),
      menuRequest(shown, [ROLE.mystic]),
    );
    expect(made.held()).toEqual(['Valor']);
    // The same when the row of the picked role was removed.
    made.server.edit(ROLE.mystic, { moderation: [] });
    const row = made.storage.rows.find((other) => other.name === 'Mystic');
    await made.selfRoles.removeRole(FAKE_GUILD_ID, row?.id ?? 0);
    await made.selfRoles.change(
      FAKE_GUILD_ID,
      made.server.seen(ALICE),
      menuRequest(shown, [ROLE.mystic]),
    );
    expect(made.held()).toEqual(['Valor']);
    expect(made.gateway.calls).toEqual([]);
  });

  it('says what was done and what Discord stopped, and ticks what is so', async () => {
    const { server, gateway, open, pick, held, note, ticked, entries } = await setup();
    const shown = await open();
    // Between the look at the roles and the second request North is moved above the bot.
    gateway.meanwhile = (call) => {
      if (call.roleId === ROLE.north) server.edit(ROLE.north, { position: 55 });
    };
    const { after } = await pick(shown, 0, [ROLE.north, ROLE.south, ROLE.east]);
    // The roles are given in the order of the menu: East, North, South.
    expect(note(after)).toBe(
      `Added **East**. I could not give you **North**: ${LET} After that I did not try to ` +
        'give you **South**.',
    );
    expect(held()).toEqual(['East']);
    expect(gateway.said()).toEqual(['give East', 'give North']);
    // Nothing stands ticked that was not given, and the menus are those of the server as it
    // is after the change: North is no longer offered.
    expect(ticked(after)).toEqual([['East'], ['None'], []]);
    expect(offered(after)[0]).toEqual(['East', 'South']);
    expect(entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });

  it.each<[string, (made: Made) => void, string]>([
    [
      'gained a permission',
      (made) => {
        made.server.edit(ROLE.south, { moderation: ['Kick Members'] });
      },
      '**South** is not handed out any more: the role was changed since it was put on the ' +
        'list, and it now grants more than a self-assigned role may. A moderator has to change ' +
        'the role back or take it off the list.',
    ],
    [
      'was taken off the list',
      (made) => {
        const row = made.storage.rows.find((other) => other.name === 'South');
        void made.storage.removeRole(FAKE_GUILD_ID, row?.id ?? 0);
      },
      '**South** was not given: it is no longer on the list.',
    ],
  ])(
    'stops before a role that %s while an earlier one was given, and says so',
    async (_what, meanwhile, sentence) => {
      const made = await setup();
      const shown = await made.open();
      made.gateway.meanwhile = (call) => {
        if (made.gateway.calls.indexOf(call) === 0) meanwhile(made);
      };
      // The roles are given in the order of the menu: East, then South.
      const { after } = await made.pick(shown, 0, [ROLE.east, ROLE.south]);
      expect(made.note(after)).toBe(`Added **East**. ${sentence}`);
      expect(made.held()).toEqual(['East']);
      expect(made.gateway.said()).toEqual(['give East']);
      // South is no longer offered.
      expect(offered(after)[0]).toEqual(['East', 'North']);
      expect(made.ticked(after)).toEqual([['East'], ['None'], []]);
    },
  );
});

describe('the handler of the role menus', () => {
  it('is listed, has its own guards and the throttle of a member’s writes', () => {
    expect(components).toContain(roleControls);
    expect(roleControls.kind).toBe('roles');
    expect(roleControls.throttle).toBe(MEMBER_WRITE_THROTTLE);
    expect(roleControls.guards).toHaveLength(3);
  });

  it('refuses a press outside a server, and where the feature is off', async () => {
    const made = selfRolesWith();
    const base = createTestContext({ selfRoles: made.selfRoles });
    const config = {
      ...base.ctx.config,
      settings: {
        ...base.ctx.config.settings,
        features: { ...base.ctx.config.settings.features, roles: false },
      },
    };
    const off = new InteractionRouter({ ...base.ctx, config }, [], [roleControls]);
    const press = fakeButton({ customId: 'roles:page:next:0' });
    await off.handle(press as never);
    expect(sent(press.reply).content).toBe(STALE_COMPONENT);

    const on = new InteractionRouter(base.ctx, [], [roleControls]);
    const inDm = fakeButton({ customId: 'roles:page:next:0', isDm: true });
    await on.handle(inDm as never);
    expect(sent(inDm.reply).content).toBe('This only works in a server.');
  });

  it('refuses a member who has not finished joining the server', async () => {
    const { open, pick, gateway, held } = await setup();
    const shown = await open();
    const { interaction } = await pick(shown, 0, [ROLE.north], { pending: true });
    expect(sent(interaction.reply)).toMatchObject({
      content: 'Finish joining this server first: accept its rules, then try again.',
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(gateway.calls).toEqual([]);
    expect(held()).toEqual([]);
    const many = await manyGroups();
    const paged = await many.press(await many.open(), 'Next', { pending: true });
    expect(sent(paged.interaction.reply).content).toContain('Finish joining this server first');
  });

  it('answers a control it does not know as one that is no longer active', async () => {
    const { router, server } = await setup();
    for (const customId of ['roles:page:first:0', 'roles:12:next:0']) {
      const press = fakeButton({ customId, ...server.interactionOf(ALICE) });
      await router.handle(press as never);
      expect(sent(press.reply).content).toBe(STALE_COMPONENT);
    }
    const select = fakeSelect({
      customId: 'roles:other:choose:0:0',
      values: [],
      ...server.interactionOf(ALICE),
    });
    await router.handle(select as never);
    expect(sent(select.reply).content).toBe(STALE_COMPONENT);
  });
});

/** A server with more menus than a message has rows: seven groups, one of them large. */
async function manyGroups() {
  const made = await setup();
  const ids: string[] = [];
  let next = 0;
  const add = async (group: string, pickOne: boolean, count: number) => {
    const saved = await made.storage.saveGroup(FAKE_GUILD_ID, { name: group, pickOne });
    if (saved.kind === 'refused') throw new Error(saved.reason);
    for (let n = 0; n < count; n++) {
      const id = `58${String(next++).padStart(16, '0')}`;
      made.server.role(id, `${group} ${String(n).padStart(2, '0')}`);
      await made.selfRoles.addRole(
        FAKE_GUILD_ID,
        { roleId: id, groupId: saved.group.id },
        made.owner(),
      );
      ids.push(id);
    }
  };
  await add('Hobbies', false, 2);
  await add('Leagues', true, 30);
  await add('Pings', false, 2);
  await add('Times', false, 2);
  return { ...made, ids };
}

describe('pages of menus', () => {
  it('turns the pages with Previous and Next, and keeps the page after a change', async () => {
    const { open, press, pick, note, held } = await manyGroups();
    // Regions, Teams, Hobbies, Leagues (two parts), Pings, Times, Other: eight menus.
    const first = await open();
    expect(first.content.split('\n').slice(2)).toEqual([
      '**Regions** · pick any number',
      '**Teams** · pick one',
      '**Hobbies** · pick any number',
      '**Leagues: Leagues 00 – Leagues 14** · pick one',
      'Page 1 of 2',
    ]);
    const { interaction: turned, after: second } = await press(first, 'Next');
    // A page is read from the database: the press is acknowledged before that.
    expect(turned.deferUpdate).toHaveBeenCalledTimes(1);
    expect(turned.update).not.toHaveBeenCalled();
    expect(second?.content.split('\n').slice(2)).toEqual([
      '**Leagues: Leagues 15 – Leagues 29** · pick one',
      '**Pings** · pick any number',
      '**Times** · pick any number',
      '**Other** · pick any number',
      'Page 2 of 2',
    ]);
    if (!second) throw new Error('no second page');
    const { after: changed } = await pick(second, 3, [ROLE.trader]);
    expect(changed?.content.split('\n').slice(-2)).toEqual(['Page 2 of 2', '-# Added **Trader**.']);
    expect(held()).toEqual(['Trader']);
    const { after: back } = await press(changed ?? second, 'Previous');
    expect(note(back)).toBe('Page 1 of 2');
  });

  it('keeps a member to one role of a pick-one group that needs two menus', async () => {
    const { open, press, pick, held, note, ids, server } = await manyGroups();
    // The leagues are the roles 2 to 31 of the ones made here: the first on page 1, the last on page 2.
    const early = ids[2] ?? '';
    const late = ids[31] ?? '';
    const first = await open();
    await pick(first, 3, [early]);
    expect(held()).toEqual(['Leagues 00']);
    const { after: second } = await press(first, 'Next');
    if (!second) throw new Error('no second page');
    const { after: picked } = await pick(second, 0, [late]);
    expect(note(picked)).toBe(
      'Added **Leagues 29**; removed **Leagues 00**. Only one role of the group Leagues can ' +
        'be held at a time.',
    );
    expect(held()).toEqual(['Leagues 29']);
    // "None" in the part that does not show the role still gives it back.
    const { after: back } = await press(picked ?? second, 'Previous');
    if (!back) throw new Error('no first page');
    const { after: none } = await pick(back, 3, ['none']);
    expect(note(none)).toBe('Removed **Leagues 29**.');
    expect(server.held(ALICE)).toEqual([]);
  });

  it('shows the last page there is when the one of a button is gone', async () => {
    const { storage, open, press } = await manyGroups();
    const first = await open();
    const { after: second } = await press(first, 'Next');
    if (!second) throw new Error('no second page');
    for (const name of ['Leagues', 'Pings', 'Times', 'Hobbies']) {
      const group = storage.groups.find((other) => other.name === name);
      for (const row of storage.rows.filter((other) => other.groupId === group?.id)) {
        await storage.removeRole(FAKE_GUILD_ID, row.id);
      }
    }
    const { after } = await press(second, 'Next');
    expect(after?.content.split('\n').slice(2)).toEqual([
      '**Regions** · pick any number',
      '**Teams** · pick one',
      '**Other** · pick any number',
    ]);
  });
});
