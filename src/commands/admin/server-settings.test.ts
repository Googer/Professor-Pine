import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dialogField, shownDialog } from '../../../test/support/dialogs.js';
import {
  answered,
  asV2,
  FAKE_GUILD_ID,
  fakeButton,
  fakeChatInput,
  fakeModal,
  fakeSelect,
  type FakeOptions,
} from '../../../test/support/fake-interactions.js';
import {
  allComponents,
  buttonsOf,
  componentCount,
  textOf,
} from '../../../test/support/messages.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { MemoryServerSettings } from '../../../test/support/server-settings.js';
import {
  TEST_MAP_ROLE,
  TEST_PVP_CATEGORY,
  TEST_SERVER_CHANNELS,
  TEST_UNOWN_ROLE,
  testServerValues,
} from '../../../test/support/server-values.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
import { TEST_WEB } from '../../../test/support/web.js';
import type { ServerValues } from '../../config/server-settings.js';
import { loadSettings } from '../../config/settings.js';
import { isSnowflake } from '../../db/snowflake.js';
import { SERVER_ADMIN_ONLY } from '../../discord/guards.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { ServerSettings } from '../../services/server-settings.js';
import { admin } from './index.js';
import { RECENT_CHANGES } from './server-settings-panel.js';
import { serverSettingsControls } from './server-settings.js';

const STAFF = '200000000000000001';
const MEMBER = '200000000000000002';
const NOW = Date.parse('2026-11-12T15:00:00Z');
const MODERATORS = '300000000000000009';
const NEW_ROLE = '300000000000000039';

type Fake = ReturnType<typeof fakeButton>;

/** What a press showed last in the panel's place: its `update`, or the edit after a deferral. */
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

/** The menus of a message (string, channel and role selects) with their custom ids and defaults. */
function menusOf(message: V2Message) {
  return allComponents(message)
    .map(
      (component) =>
        component as {
          type: ComponentType;
          custom_id?: string;
          channel_types?: number[];
          default_values?: { id: string; type: string }[];
          min_values?: number;
          options?: { value: string; default?: boolean }[];
        },
    )
    .filter((component) =>
      [ComponentType.StringSelect, ComponentType.ChannelSelect, ComponentType.RoleSelect].includes(
        component.type,
      ),
    );
}

const menu = (message: V2Message, customId: string) => {
  const found = menusOf(message).find((one) => one.custom_id === customId);
  if (!found) throw new Error(`no menu ${customId}`);
  return found;
};

/** What Discord resolves of a pick of the panel's channel or role selects (`fakeSelect`). */
function asDiscordResolves(
  customId: string,
  values: readonly string[],
): Partial<Pick<FakeOptions, 'pickedChannels' | 'pickedRoles'>> {
  const key = customId.split(':')[1] ?? '';
  if (key.startsWith('roles.')) return { pickedRoles: values.map((id) => ({ id, name: 'role' })) };
  const type = key === 'channels.events' ? 15 : key === 'categories.pvp' ? 4 : 0;
  if (!key.startsWith('channels.') && key !== 'categories.pvp') return {};
  return { pickedChannels: values.map((id) => ({ id, type, guildId: FAKE_GUILD_ID })) };
}

/** The channels and roles the server has (the interaction's guild), unless a test says otherwise. */
const KNOWN = {
  channels: [...Object.values(TEST_SERVER_CHANNELS), TEST_PVP_CATEGORY, MODERATORS],
  roles: { [TEST_UNOWN_ROLE]: 'Unown', [NEW_ROLE]: 'New', [TEST_MAP_ROLE]: 'Verified' },
};

async function setup(
  options: {
    passive?: boolean;
    values?: ServerValues;
    known?: { channels: string[]; roles: Record<string, string> };
    /** An open instance (`servers: "open"`, plan 19C-4); else the test settings' (none listed). */
    open?: boolean;
    /** Whether the instance has web pages (`settings.web`); it has unless a test says not. */
    web?: boolean;
  } = {},
) {
  const known = options.known ?? KNOWN;
  const read = loadSettings(TEST_SETTINGS_PATH);
  const settings = {
    ...read,
    ...(options.open === true ? { servers: 'open' as const } : {}),
    ...(options.web === false ? { web: undefined } : { web: TEST_WEB }),
  };
  const store = new MemoryServerSettings([
    {
      serverId: FAKE_GUILD_ID,
      settings: options.values ?? testServerValues(),
      setUpAt: NOW,
      updatedAt: NOW,
      updatedBy: null,
    },
  ]);
  let now = NOW;
  const { ctx } = createTestContext({ serverSettingsAudit: store.audit });
  const servers = new ServerSettings({
    store,
    audit: store.audit,
    settings,
    log: ctx.log,
    now: () => now,
  });
  await servers.load();
  const context = {
    ...ctx,
    servers,
    ...(options.passive === true
      ? {
          config: {
            ...ctx.config,
            settings: { ...settings, ocr: { ...settings.ocr, passive: true } },
          },
          features: { ocrPassive: true, autoAssignRole: false },
        }
      : { config: { ...ctx.config, settings } }),
  };
  const router = new InteractionRouter(context, [admin], [serverSettingsControls]);
  const who = (userId: string) => ({
    userId,
    roleNames: userId === STAFF ? ['Admin'] : [],
    displayName: userId === STAFF ? 'Staff' : 'Member',
    guildChannelNames: Object.fromEntries(known.channels.map((one) => [one, 'channel'])),
    guildRoleNames: known.roles,
  });
  const open = async (userId = STAFF) => {
    const interaction = fakeChatInput({
      commandName: 'admin',
      subcommand: 'settings',
      ...who(userId),
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const panel = async () => asV2(answered(await open()));
  const onPanel = { ephemeralMessage: true, v2Message: true };
  const press = async (customId: string, userId = STAFF) => {
    const interaction = fakeButton({ customId, ...onPanel, ...who(userId) });
    await router.handle(interaction as never);
    return interaction;
  };
  /**
   * A pick of a menu, resolved as Discord resolves it: a channel select's channels of this
   * server of the kind its setting takes (`as` another), a role select's roles; `resolved` in
   * their place.
   */
  const pick = async (
    customId: string,
    values: string[],
    userId = STAFF,
    resolved: Partial<Pick<FakeOptions, 'pickedChannels' | 'pickedRoles'>> = asDiscordResolves(
      customId,
      values,
    ),
  ) => {
    const interaction = fakeSelect({ customId, values, ...resolved, ...onPanel, ...who(userId) });
    await router.handle(interaction as never);
    return interaction;
  };
  const submit = async (form: { custom_id: string }, fields: Record<string, string>) => {
    const interaction = fakeModal({
      customId: form.custom_id,
      form,
      fields,
      ...onPanel,
      ...who(STAFF),
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return {
    servers,
    store,
    panel,
    open,
    press,
    pick,
    submit,
    pass: (ms: number) => {
      now += ms;
    },
  };
}

describe('/admin settings', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the server's settings privately, on its channels, each in a select of its own", async () => {
    const { open } = await setup();
    const used = await open();
    const payload = answered(used);
    expect((payload.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    const panel = asV2(payload);
    expectV2Sendable(panel);
    expect(textOf(panel)).toContain('### This server’s settings');
    const sections = menu(panel, 'server:panel:show');
    expect(sections.options?.map((option) => option.value)).toEqual([
      'channels',
      'roles',
      'features',
      'text',
      'changes',
    ]);
    expect(sections.options?.find((option) => option.default === true)?.value).toBe('channels');
    const lab = menu(panel, 'server:channels.bot-lab:set');
    expect(lab.type).toBe(ComponentType.ChannelSelect);
    expect(lab.channel_types).toEqual([0]);
    expect(lab.min_values).toBe(0);
    expect(lab.default_values).toEqual([{ id: TEST_SERVER_CHANNELS['bot-lab'], type: 'channel' }]);
    expect(menu(panel, 'server:channels.moderation:set').default_values).toEqual([]);
    // The events forum is a forum.
    expect(menu(panel, 'server:channels.events:set').channel_types).toEqual([15]);
  });

  it('is refused to a member who may not set the server up, and so is a press of its controls', async () => {
    const { open, pick, servers } = await setup();
    const used = await open(MEMBER);
    expect(answered(used).content).toBe(SERVER_ADMIN_ONLY);
    const picked = await pick('server:channels.moderation:set', [MODERATORS], MEMBER);
    expect(answered(picked).content).toBe(SERVER_ADMIN_ONLY);
    expect(servers.of(FAKE_GUILD_ID).channels.moderation).toBeUndefined();
  });

  it('sets a channel picked, says so in its place, and logs who did it', async () => {
    const { pick, servers, store, pass } = await setup();
    pass(60_000);
    const picked = await pick('server:channels.moderation:set', [MODERATORS]);
    const shown = shownAfter(picked);
    expect(textOf(shown)).toContain(`Set the moderators’ channel to <#${MODERATORS}>.`);
    expect(menu(shown, 'server:channels.moderation:set').default_values).toEqual([
      { id: MODERATORS, type: 'channel' },
    ]);
    expect(servers.of(FAKE_GUILD_ID).channels.moderation).toBe(MODERATORS);
    expect(store.rows.get(FAKE_GUILD_ID)).toMatchObject({
      updatedBy: STAFF,
      updatedAt: NOW + 60_000,
    });
    expect(store.audit.rows.map(({ id: _id, ...row }) => row)).toEqual([
      {
        serverId: FAKE_GUILD_ID,
        at: NOW + 60_000,
        actor: { id: STAFF, name: 'Staff' },
        key: 'channels.moderation',
        before: null,
        after: MODERATORS,
      },
    ]);
  });

  it('takes a pick only of the kind its setting takes and of this server, @everyone never (review G3)', async () => {
    const { pick, servers } = await setup();
    const stale = async (customId: string, value: string, resolved: object) =>
      answered(await pick(customId, [value], STAFF, resolved)).content;
    const key = 'server:channels.moderation:set';
    // A forum where a text channel is asked for, a channel of another server, a string pick.
    expect(
      await stale(key, MODERATORS, {
        pickedChannels: [{ id: MODERATORS, type: 15, guildId: FAKE_GUILD_ID }],
      }),
    ).toBe(STALE_COMPONENT);
    expect(
      await stale(key, MODERATORS, {
        pickedChannels: [{ id: MODERATORS, type: 0, guildId: '412345678901234999' }],
      }),
    ).toBe(STALE_COMPONENT);
    expect(await stale(key, MODERATORS, {})).toBe(STALE_COMPONENT);
    // A channel picked in a role's select, and the server's own role, @everyone.
    expect(
      await stale('server:roles.mapMember:set', FAKE_GUILD_ID, {
        pickedRoles: [{ id: FAKE_GUILD_ID, name: '@everyone' }],
      }),
    ).toBe(STALE_COMPONENT);
    expect(
      await stale('server:roles.mapMember:set', NEW_ROLE, {
        pickedChannels: [{ id: NEW_ROLE, type: 0, guildId: FAKE_GUILD_ID }],
      }),
    ).toBe(STALE_COMPONENT);
    expect(servers.of(FAKE_GUILD_ID).channels.moderation).toBeUndefined();
    expect(servers.of(FAKE_GUILD_ID).roles.mapMember).toBeUndefined();
  });

  it('clears a channel when its select is left empty', async () => {
    const { pick, servers } = await setup();
    const picked = await pick('server:channels.unown:set', []);
    expect(textOf(shownAfter(picked))).toContain(
      `Cleared the Unown channel (was <#${TEST_SERVER_CHANNELS.unown}>).`,
    );
    expect(servers.of(FAKE_GUILD_ID).channels.unown).toBeUndefined();
  });

  it("refuses a moderators' channel that is another channel of the server, in the panel's line", async () => {
    const { pick, servers, store } = await setup();
    const picked = await pick('server:channels.moderation:set', [TEST_SERVER_CHANNELS.pvp]);
    expect(textOf(shownAfter(picked))).toContain(
      'Not changed: the moderators’ channel must be a channel of its own, not the same as the PvP channel.',
    );
    expect(servers.of(FAKE_GUILD_ID).channels.moderation).toBeUndefined();
    expect(store.audit.rows).toEqual([]);
  });

  it('says a pick of what is set already changed nothing, and writes nothing', async () => {
    const { pick, store } = await setup();
    const picked = await pick('server:channels.bot-lab:set', [TEST_SERVER_CHANNELS['bot-lab']]);
    expect(textOf(shownAfter(picked))).toContain('That was so already.');
    expect(store.rows.get(FAKE_GUILD_ID)?.updatedBy).toBeNull();
  });

  it('shows each section in its place, each within what Discord takes in one message', async () => {
    const { pick } = await setup({ passive: true });
    for (const section of ['channels', 'roles', 'features', 'text', 'changes']) {
      const shown = shownAfter(await pick('server:panel:show', [section]));
      expectV2Sendable(shown);
      expect(componentCount(shown)).toBeLessThanOrEqual(40);
      const chosen = menu(shown, 'server:panel:show').options?.find((one) => one.default === true);
      expect(chosen?.value).toBe(section);
    }
  });

  it('sets the PvP category and the roles in their selects', async () => {
    const { pick, servers } = await setup();
    const shown = shownAfter(await pick('server:panel:show', ['roles']));
    const category = menu(shown, 'server:categories.pvp:set');
    expect(category.channel_types).toEqual([4]);
    expect(category.default_values).toEqual([{ id: TEST_PVP_CATEGORY, type: 'channel' }]);
    const unown = menu(shown, 'server:roles.unown:set');
    expect(unown.type).toBe(ComponentType.RoleSelect);
    expect(unown.default_values).toEqual([{ id: TEST_UNOWN_ROLE, type: 'role' }]);
    const picked = await pick('server:roles.mapMember:set', [NEW_ROLE]);
    expect(textOf(shownAfter(picked))).toContain(`Set the map’s member role to <@&${NEW_ROLE}>.`);
    expect(servers.of(FAKE_GUILD_ID).roles.mapMember).toBe(NEW_ROLE);
  });

  it('opens where the file named a moderators’ channel and a member role the server lacks, saying so (review F1, F2)', async () => {
    const { panel, pick, servers, store } = await setup({
      values: testServerValues({ unmatched: ['channels.moderation', 'roles.mapMember'] }),
    });
    const channels = await panel();
    expectV2Sendable(channels);
    // Discord refuses a default that is no id (50035): only ids are ever offered as one.
    const defaults = (message: V2Message) =>
      menusOf(message).flatMap((one) =>
        'default_values' in one ? (one.default_values ?? []).map((value) => value.id) : [],
      );
    expect(defaults(channels).every((one) => isSnowflake(one))).toBe(true);
    expect(menu(channels, 'server:channels.moderation:set').default_values).toEqual([]);
    expect(textOf(channels)).toContain('not found: meetups that need approval');
    const roles = shownAfter(await pick('server:panel:show', ['roles']));
    expectV2Sendable(roles);
    expect(defaults(roles).every((one) => isSnowflake(one))).toBe(true);
    expect(menu(roles, 'server:roles.mapMember:set').default_values).toEqual([]);
    expect(textOf(roles)).toContain('not found: the map shows parties to administrators only');
    // A role picked is set, and is found from then on; the log has the role alone.
    const picked = shownAfter(await pick('server:roles.mapMember:set', [NEW_ROLE]));
    expect(textOf(picked)).toContain(`Set the map’s member role to <@&${NEW_ROLE}>.`);
    expect(textOf(picked)).not.toContain('not found:');
    expect(servers.of(FAKE_GUILD_ID).unmatched).toEqual(['channels.moderation']);
    expect(store.audit.rows.map((row) => row.key)).toEqual(['roles.mapMember']);
  });

  it('says what a setting the file named and the server lacks keeps closed, and what leaving it unset does (fix round 4, I2)', async () => {
    const { panel, pick } = await setup({
      values: testServerValues({ unmatched: ['channels.moderation', 'roles.mapMember'] }),
    });
    const channels = await panel();
    expectV2Sendable(channels);
    expect(textOf(channels)).toContain(
      'not found: meetups that need approval and reports are refused. Leaving it unset turns ' +
        'meetup safety off: meetups are no longer held for the moderators, blocks stop ' +
        'applying, and reports stay refused.',
    );
    expect(buttonsOf(channels).map((one) => [one.label, one.style, one.customId])).toContainEqual([
      'Leave unset',
      ButtonStyle.Secondary,
      'server:channels.moderation:unset',
    ]);
    const roles = shownAfter(await pick('server:panel:show', ['roles']));
    expect(textOf(roles)).toContain(
      'not found: the map shows parties to administrators only. Leaving it unset opens the ' +
        'map: every member sees the map’s parties.',
    );
  });

  it('asks once more before it leaves the moderators’ channel unset, and writes nothing until then (fix round 4, I2)', async () => {
    const { panel, press, servers, store } = await setup({
      values: testServerValues({ unmatched: ['channels.moderation', 'roles.mapMember'] }),
    });
    const before = await panel();
    const asked = shownAfter(await press('server:channels.moderation:unset'));
    expectV2Sendable(asked);
    expect(componentCount(asked)).toBeLessThanOrEqual(40);
    expect(textOf(asked)).toContain(
      'Leave the moderators’ channel unset? Meetup safety goes off in this server: meetups are ' +
        'no longer held for the moderators, blocks stop applying, and reports stay refused.',
    );
    const buttons = buttonsOf(asked).map((one) => [one.label, one.style, one.customId]);
    expect(buttons).toContainEqual([
      'Leave unset',
      ButtonStyle.Danger,
      'server:channels.moderation:unset:confirm',
    ]);
    expect(buttons).toContainEqual([
      'Keep it closed',
      ButtonStyle.Secondary,
      'server:channels.moderation:keep',
    ]);
    expect(buttons).not.toContainEqual([
      'Leave unset',
      ButtonStyle.Secondary,
      'server:channels.moderation:unset',
    ]);
    // The first press writes nothing.
    expect(servers.of(FAKE_GUILD_ID).unmatched).toEqual(['channels.moderation', 'roles.mapMember']);
    expect(store.rows.get(FAKE_GUILD_ID)?.updatedBy).toBeNull();
    expect(store.audit.rows).toEqual([]);
    // Keep it closed: the panel as it was, nothing written.
    const kept = shownAfter(await press('server:channels.moderation:keep'));
    expect(kept).toEqual(before);
    expect(store.audit.rows).toEqual([]);
    // Leave unset, asked again and confirmed: written, logged, its effect said.
    await press('server:channels.moderation:unset');
    const left = shownAfter(await press('server:channels.moderation:unset:confirm'));
    expect(textOf(left)).toContain(
      'Left the moderators’ channel unset: meetup safety is off in this server; reports are ' +
        'refused.',
    );
    expect(buttonsOf(left).map((one) => one.customId)).not.toContain(
      'server:channels.moderation:unset',
    );
    expect(servers.of(FAKE_GUILD_ID).unmatched).toEqual(['roles.mapMember']);
    expect(store.audit.rows.map((row) => [row.key, row.before, row.after])).toEqual([
      ['channels.moderation', 'not found', null],
    ]);
    // Confirmed again (a panel drawn before), it changes nothing.
    expect(textOf(shownAfter(await press('server:channels.moderation:unset:confirm')))).toContain(
      'That was so already.',
    );
  });

  it('asks once more before it leaves the map’s member role unset, then says every member sees the map (fix round 4, I2)', async () => {
    const { press, servers, store } = await setup({
      values: testServerValues({ unmatched: ['roles.mapMember'] }),
    });
    const asked = shownAfter(await press('server:roles.mapMember:unset'));
    expect(textOf(asked)).toContain(
      'Leave the map’s member role unset? The map opens: every member sees the map’s parties.',
    );
    expect(store.audit.rows).toEqual([]);
    expect(servers.of(FAKE_GUILD_ID).unmatched).toEqual(['roles.mapMember']);
    const left = shownAfter(await press('server:roles.mapMember:unset:confirm'));
    expect(textOf(left)).toContain(
      'Left the map’s member role unset: every member sees the map’s parties.',
    );
    expect(servers.of(FAKE_GUILD_ID).unmatched).toBeUndefined();
    expect(store.audit.rows.map((row) => [row.key, row.before, row.after])).toEqual([
      ['roles.mapMember', 'not found', null],
    ]);
  });

  it('says what clearing the moderators’ channel does, beside its select (fix round 4, I2)', async () => {
    const { panel } = await setup();
    expect(textOf(await panel())).toContain(
      '**Moderators’ channel** · reports and meetup safety; a channel of its own. Clearing it ' +
        'turns meetup safety off: meetups are no longer held for the moderators, blocks stop ' +
        'applying, and reports are refused\n',
    );
  });

  it('offers no channel or role the server no longer has, and says it was not found (review G2)', async () => {
    const gone = '300000000000000777';
    const { panel, pick } = await setup({
      values: testServerValues({
        channels: { ...TEST_SERVER_CHANNELS, moderation: gone },
        roles: { unown: gone, mapMember: TEST_MAP_ROLE },
      }),
      known: {
        channels: Object.values(TEST_SERVER_CHANNELS),
        roles: { [TEST_MAP_ROLE]: 'Verified' },
      },
    });
    const channels = await panel();
    expectV2Sendable(channels);
    expect(menu(channels, 'server:channels.moderation:set').default_values).toEqual([]);
    expect(menu(channels, 'server:channels.bot-lab:set').default_values).toEqual([
      { id: TEST_SERVER_CHANNELS['bot-lab'], type: 'channel' },
    ]);
    expect(textOf(channels)).toContain('not found: pick a channel');
    const roles = shownAfter(await pick('server:panel:show', ['roles']));
    expect(menu(roles, 'server:roles.unown:set').default_values).toEqual([]);
    expect(menu(roles, 'server:roles.mapMember:set').default_values).toEqual([
      { id: TEST_MAP_ROLE, type: 'role' },
    ]);
    expect(textOf(roles)).toContain('not found: pick a role');
  });

  it('turns a feature on and off with what its button sets, never a toggle', async () => {
    const { press, pick, servers } = await setup();
    const features = shownAfter(await pick('server:panel:show', ['features']));
    // On in the test settings: its button turns it off.
    const roles = buttonsOf(features).find((one) =>
      one.customId?.startsWith('server:features.roles'),
    );
    expect(roles).toMatchObject({ label: 'Turn off', style: ButtonStyle.Secondary });
    const off = shownAfter(await press('server:features.roles:set:off'));
    expect(textOf(off)).toContain('Turned off self-assigned roles (`/iam`).');
    expect(textOf(off)).toContain('Self-assigned roles (`/iam`): **off**');
    expect(servers.of(FAKE_GUILD_ID).features.roles).toBe(false);
    // A second press of the same button (a panel drawn before) sets the same.
    expect(textOf(shownAfter(await press('server:features.roles:set:off')))).toContain(
      'That was so already.',
    );
    await press('server:features.roles:set:on');
    expect(servers.of(FAKE_GUILD_ID).features.roles).toBe(true);
  });

  it('opens and closes the map to visitors who are not logged in, under the map’s member role (plan 19C-4)', async () => {
    const { press, pick, servers, store } = await setup();
    const roles = shownAfter(await pick('server:panel:show', ['roles']));
    // On by default where the instance lists its servers, or none: said so, with a button that
    // keeps it on and one that closes it (fix round 1, R4).
    expect(textOf(roles)).toContain(
      '**Map for visitors who are not logged in**: **on** (the instance’s default)',
    );
    expect(textOf(roles)).toContain('only members see its parties');
    const ofMap = (shown: V2Message) =>
      buttonsOf(shown)
        .filter((one) => one.customId?.startsWith('server:publicMap'))
        .map((one) => [one.label, one.customId]);
    expect(ofMap(roles)).toEqual([
      ['Keep on', 'server:publicMap:set:on'],
      ['Turn off', 'server:publicMap:set:off'],
    ]);
    // Keep on writes the value, so that the instance's default no longer moves it.
    const kept = shownAfter(await press('server:publicMap:set:on'));
    expect(servers.of(FAKE_GUILD_ID).publicMap).toBe(true);
    expect(textOf(kept)).toContain('**Map for visitors who are not logged in**: **on** ·');
    expect(textOf(kept)).not.toContain('the instance’s default');
    expect(ofMap(kept)).toEqual([['Turn off', 'server:publicMap:set:off']]);
    expect((await store.audit.ofServer(FAKE_GUILD_ID, 5)).at(-1)).toMatchObject({
      key: 'publicMap',
      before: null,
      after: true,
    });
    // Pressed again, what is so already.
    expect(textOf(shownAfter(await press('server:publicMap:set:on')))).toContain(
      'That was so already.',
    );
    const off = shownAfter(await press('server:publicMap:set:off'));
    expect(textOf(off)).toContain('Turned off the map for visitors who are not logged in.');
    expect(textOf(off)).toContain('**Map for visitors who are not logged in**: **off**');
    expect(textOf(off)).toContain('only somebody logged in with Discord can open');
    expect(ofMap(off)).toEqual([['Turn on', 'server:publicMap:set:on']]);
    // The press shows the section it changed again.
    expect(menu(off, 'server:panel:show').options?.find((one) => one.default)?.value).toBe('roles');
    expect(servers.of(FAKE_GUILD_ID).publicMap).toBe(false);
    expect((await store.audit.ofServer(FAKE_GUILD_ID, 5)).at(-1)).toMatchObject({
      key: 'publicMap',
      before: true,
      after: false,
    });
  });

  it('keeps the map closed to such visitors on an open instance until staff open it (plan 19C-4)', async () => {
    const { press, pick, servers } = await setup({ open: true });
    const roles = shownAfter(await pick('server:panel:show', ['roles']));
    expect(textOf(roles)).toContain(
      '**Map for visitors who are not logged in**: **off** (the instance’s default)',
    );
    expect(
      buttonsOf(roles)
        .filter((one) => one.customId?.startsWith('server:publicMap'))
        .map((one) => [one.label, one.customId]),
    ).toEqual([
      ['Keep off', 'server:publicMap:set:off'],
      ['Turn on', 'server:publicMap:set:on'],
    ]);
    // Keep off writes it: closed whatever the instance's default becomes.
    await press('server:publicMap:set:off');
    expect(servers.of(FAKE_GUILD_ID).publicMap).toBe(false);
    const on = shownAfter(await press('server:publicMap:set:on'));
    expect(textOf(on)).toContain('Turned on the map for visitors who are not logged in.');
    expect(servers.of(FAKE_GUILD_ID).publicMap).toBe(true);
  });

  it('offers the map for visitors only on an instance with web pages (fix round 1, R9)', async () => {
    const { press, pick, servers } = await setup({ web: false });
    const roles = textOf(shownAfter(await pick('server:panel:show', ['roles'])));
    expect(roles).not.toContain('Map for visitors');
    const refused = await press('server:publicMap:set:off');
    expect(answered(refused).content).toContain('no longer');
    expect(servers.of(FAKE_GUILD_ID).publicMap).toBeUndefined();
  });

  it('offers passive reading and the auto-assigned role only where the instance allows them', async () => {
    const without = await setup();
    const plain = textOf(shownAfter(await without.pick('server:panel:show', ['features'])));
    expect(plain).not.toContain('Reading every screenshot');
    expect(plain).not.toContain('auto-assigned role');
    const refused = await without.press('server:passiveReading:set:off');
    expect(answered(refused).content).toContain('no longer');
    const allowed = await setup({ passive: true });
    const shown = textOf(shownAfter(await allowed.pick('server:panel:show', ['features'])));
    expect(shown).toContain('Reading every screenshot in region channels');
    expect(shown).not.toContain('auto-assigned role');
    await allowed.press('server:passiveReading:set:off');
    expect(allowed.servers.of(FAKE_GUILD_ID).passiveReading).toBe(false);
  });

  it('says the time zone is not chosen while the instance’s stands in (plan 19C-2, S9)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const { pick, press, submit } = await setup({
      values: testServerValues({ timezone: undefined }),
    });
    const shown = shownAfter(await pick('server:panel:show', ['text']));
    expect(textOf(shown)).toContain(
      '**Time zone** · not chosen: `America/New_York` meanwhile; it is 10:00 AM, Thursday, ' +
        'November 12 there now',
    );
    const form = shownDialog(await press('server:timezone:ask'));
    const set = await submit(form, { zone: 'America/New_York' });
    // Chosen, the same zone as the instance's: chosen all the same.
    expect(textOf(shownAfter(set))).toContain('**Time zone** · `America/New_York`: it is 10:00 AM');
  });

  it('sets the time zone in a dialog, canonical, refusing a name it does not know (plan 19A-2)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const { pick, press, submit, servers } = await setup();
    const shown = shownAfter(await pick('server:panel:show', ['text']));
    // The zone, and the time there now, so that staff can see it is right.
    expect(textOf(shown)).toContain(
      '**Time zone** · `America/New_York`: it is 10:00 AM, Thursday, November 12 there now',
    );
    expect(buttonsOf(shown).map((one) => one.customId)).toContain('server:timezone:ask');
    const form = shownDialog(await press('server:timezone:ask'));
    expect(dialogField(form, 'Time zone').value).toBe('America/New_York');
    const refused = await submit(form, { zone: 'Mars/Olympus' });
    expect(textOf(shownAfter(refused))).toContain(
      'Not changed: “Mars/Olympus” is not a time zone I know; use a name such as America/Chicago.',
    );
    // An offset is no zone's name: it would never change for daylight saving time.
    const offset = await submit(form, { zone: '+05:30' });
    expect(textOf(shownAfter(offset))).toContain('Not changed: “+05:30” is not a time zone I know');
    expect(servers.zoneOf(FAKE_GUILD_ID)).toBe('America/New_York');
    const set = await submit(form, { zone: ' europe/berlin ' });
    const after = textOf(shownAfter(set));
    expect(after).toContain('Set the time zone to `Europe/Berlin` (was `America/New_York`).');
    expect(after).toContain('`Europe/Berlin`: it is 4:00 PM, Thursday, November 12 there now');
    expect(servers.of(FAKE_GUILD_ID).timezone).toBe('Europe/Berlin');
    // An abbreviation is refused in words of its own (fix round 1, K2): it follows no place's
    // daylight saving time.
    for (const typed of ['EST', 'CST', 'EST5EDT']) {
      const abbreviation = await submit(form, { zone: typed });
      expect(textOf(shownAfter(abbreviation))).toContain(
        `Not changed: “${typed}” is an abbreviation; use a name such as America/New_York.`,
      );
    }
    // A place's word alone is no abbreviation (fix round 2, P3), nor one in lower case.
    for (const typed of ['Paris', 'Tokyo', 'cst']) {
      const word = await submit(form, { zone: typed });
      expect(textOf(shownAfter(word))).toContain(
        `Not changed: “${typed}” is not a time zone I know; use a name such as America/Chicago.`,
      );
    }
    const fixed = await submit(form, { zone: 'Etc/GMT+5' });
    expect(textOf(shownAfter(fixed))).toContain(
      'Not changed: “Etc/GMT+5” is not a time zone I know',
    );
    expect(servers.zoneOf(FAKE_GUILD_ID)).toBe('Europe/Berlin');
    // Stored as IANA writes it (fix round 1, K3), and the same zone typed back is no change.
    await submit(form, { zone: 'asia/kolkata' });
    expect(servers.of(FAKE_GUILD_ID).timezone).toBe('Asia/Kolkata');
    const again = await submit(form, { zone: 'Asia/Calcutta' });
    expect(textOf(shownAfter(again))).toContain('That was so already.');
    expect(servers.of(FAKE_GUILD_ID).timezone).toBe('Asia/Kolkata');
    const log = textOf(shownAfter(await pick('server:panel:show', ['changes'])));
    expect(log).toContain(
      '**Staff** set the time zone to `Europe/Berlin` (was `America/New_York`).',
    );
    expect(log).not.toContain('`Asia/Calcutta`');
  });

  it('sets the distance units from their menu', async () => {
    const { pick, servers } = await setup();
    const shown = shownAfter(await pick('server:panel:show', ['text']));
    expect(menu(shown, 'server:distanceUnits:set').options?.find((o) => o.default)?.value).toBe(
      'metric',
    );
    const picked = await pick('server:distanceUnits:set', ['imperial']);
    expect(textOf(shownAfter(picked))).toContain(
      'Set the distance units to imperial (was metric).',
    );
    expect(servers.of(FAKE_GUILD_ID).distanceUnits).toBe('imperial');
  });

  it('changes the ending of region forums in a dialog, refusing one that is no ending', async () => {
    const { press, submit, servers } = await setup();
    const asked = await press('server:regionForumSuffix:ask');
    const form = shownDialog(asked);
    expect(dialogField(form, 'Ending').value).toBe('-meetups');
    const refused = await submit(form, { suffix: 'raids now' });
    expect(textOf(shownAfter(refused))).toContain(
      'Not changed: the ending of region forums must be a hyphen and up to 30 letters.',
    );
    const set = await submit(form, { suffix: '-raids' });
    expect(textOf(shownAfter(set))).toContain(
      'Set the ending of region forums to `-raids` (was `-meetups`).',
    );
    expect(servers.of(FAKE_GUILD_ID).regionForumSuffix).toBe('-raids');
  });

  it("changes the events forum's numbers in one dialog, checked together", async () => {
    const { press, submit, servers } = await setup();
    const form = shownDialog(await press('server:eventsForum:ask'));
    expect(dialogField(form, 'Days listed').value).toBe('35');
    const refused = await submit(form, { horizonDays: '10', postDaysAhead: '14', onThisDay: '3' });
    expect(textOf(shownAfter(refused))).toContain(
      'Not changed: the days before an event that its post opens must be at most the days listed.',
    );
    expect(servers.of(FAKE_GUILD_ID).eventsForum.horizonDays).toBe(35);
    const notANumber = await submit(form, {
      horizonDays: 'soon',
      postDaysAhead: '14',
      onThisDay: '3',
    });
    expect(textOf(shownAfter(notANumber))).toContain(
      'Not changed: the days the events forum lists must be a whole number.',
    );
    const set = await submit(form, { horizonDays: '20', postDaysAhead: '7', onThisDay: '3' });
    expect(textOf(shownAfter(set))).toContain(
      'Set the days the events forum lists to 20 (was 35). Set the days before an event that its post opens to 7 (was 14).',
    );
    expect(servers.of(FAKE_GUILD_ID).eventsForum).toEqual({
      horizonDays: 20,
      postDaysAhead: 7,
      onThisDay: 3,
    });
  });

  it('changes the flagged words in a dialog, one a line, never split at a comma (review G5)', async () => {
    const { press, submit, servers } = await setup();
    const form = shownDialog(await press('server:flaggedWords:ask'));
    const set = await submit(form, { words: 'garden\n condo, the tower \n Garden\n\n' });
    expect(textOf(shownAfter(set))).toContain('added “garden”, “condo, the tower”');
    expect(servers.of(FAKE_GUILD_ID).flaggedWords).toEqual(['garden', 'condo, the tower']);
    const again = shownDialog(await press('server:flaggedWords:ask'));
    expect(dialogField(again, 'Words').value).toBe('garden\ncondo, the tower');
    // Prefilled, its Submit replaces the list.
    await submit(again, { words: 'garden' });
    expect(servers.of(FAKE_GUILD_ID).flaggedWords).toEqual(['garden']);
  });

  it('changes the words gym search ignores in a dialog, shown under Text and numbers (plan 19B-2)', async () => {
    const { press, submit, servers, pick, store } = await setup({
      values: testServerValues({ blacklistWords: ['gym', 'raid'] }),
    });
    const text = textOf(shownAfter(await pick('server:panel:show', ['text'])));
    expect(text).toContain('**Words gym search ignores**');
    expect(text).toContain('“gym”, “raid”');
    const form = shownDialog(await press('server:blacklistWords:ask'));
    expect(dialogField(form, 'Words').value).toBe('gym\nraid');
    const set = await submit(form, { words: 'gym\n raid \nMall\nmall\n\n' });
    expect(textOf(shownAfter(set))).toContain('added “Mall”');
    expect(servers.of(FAKE_GUILD_ID).blacklistWords).toEqual(['gym', 'raid', 'Mall']);
    // Logged as any change, by the staff member who made it.
    expect(store.audit.rows).toMatchObject([
      {
        key: 'blacklistWords',
        actor: { id: STAFF },
        before: ['gym', 'raid'],
        after: ['gym', 'raid', 'Mall'],
      },
    ]);
    // A word over the limits is refused, nothing changed.
    const refused = await submit(shownDialog(await press('server:blacklistWords:ask')), {
      words: 'x'.repeat(101),
    });
    expect(textOf(shownAfter(refused))).toContain(
      'Not changed: a word gym search ignores is longer than 100 characters.',
    );
    expect(servers.of(FAKE_GUILD_ID).blacklistWords).toEqual(['gym', 'raid', 'Mall']);
  });

  it.each(['flaggedWords', 'blacklistWords'] as const)(
    'adds and removes %s where they are too many to show, never dropping the list (review G5)',
    async (key) => {
      const many = Array.from({ length: 50 }, (_, i) => `${String(i)}-${'w'.repeat(90)}`);
      const { press, submit, servers, panel, pick } = await setup({
        values: testServerValues({ [key]: many }),
      });
      const add = shownDialog(await press(`server:${key}:ask`));
      expect(add.title).toBe('Words to add');
      expect(dialogField(add, 'Words to add').value).toBeUndefined();
      await submit(add, { words: 'garden\ncondo' });
      expect(servers.of(FAKE_GUILD_ID)[key]).toEqual([...many, 'garden', 'condo']);
      // The panel offers the removal beside the addition.
      await panel();
      const text = shownAfter(await pick('server:panel:show', ['text']));
      expectV2Sendable(text);
      expect(componentCount(text)).toBeLessThanOrEqual(40);
      expect(buttonsOf(text).map((one) => one.customId)).toContain(`server:${key}:ask:remove`);
      const remove = shownDialog(await press(`server:${key}:ask:remove`));
      expect(remove.title).toBe('Words to remove');
      await submit(remove, { words: `GARDEN\n${many[0] ?? ''}` });
      expect(servers.of(FAKE_GUILD_ID)[key]).toEqual([...many.slice(1), 'condo']);
    },
  );

  it('keeps the Text and numbers section within what Discord takes with both lists too many to show', async () => {
    const many = Array.from({ length: 50 }, (_, i) => `${String(i)}-${'w'.repeat(90)}`);
    const { pick } = await setup({
      values: testServerValues({ flaggedWords: many, blacklistWords: many }),
    });
    const text = shownAfter(await pick('server:panel:show', ['text']));
    expectV2Sendable(text);
    expect(componentCount(text)).toBeLessThanOrEqual(40);
  });

  it('sets and clears the map link and the invite in dialogs', async () => {
    const { press, submit, servers } = await setup();
    const link = shownDialog(await press('server:regionMapLink:ask'));
    await submit(link, { link: 'https://maps.example.test/pgh' });
    expect(servers.of(FAKE_GUILD_ID).regionMapLink).toBe('https://maps.example.test/pgh');
    const invite = shownDialog(await press('server:invite:ask'));
    const refused = await submit(invite, { invite: 'https://example.test/join' });
    expect(textOf(shownAfter(refused))).toContain(
      'Not changed: the invite must be https://discord.gg/',
    );
    await submit(invite, { invite: 'https://discord.gg/pine' });
    expect(servers.of(FAKE_GUILD_ID).invite).toBe('https://discord.gg/pine');
    await submit(shownDialog(await press('server:invite:ask')), { invite: '' });
    expect(servers.of(FAKE_GUILD_ID).invite).toBeUndefined();
  });

  it('shows the newest changes first, by name, with when', async () => {
    // The panel words a time by the clock (`clockOrDate`): the day of the changes.
    vi.useFakeTimers({ toFake: ['Date'], now: NOW + 120_000 });
    const { pick, pass } = await setup();
    await pick('server:channels.moderation:set', [MODERATORS]);
    pass(60_000);
    await pick('server:distanceUnits:set', ['imperial']);
    const shown = textOf(shownAfter(await pick('server:panel:show', ['changes'])));
    const lines = shown.split('\n').filter((line) => line.startsWith('<t:'));
    expect(lines).toEqual([
      `<t:${String((NOW + 60_000) / 1000)}:t> **Staff** set the distance units to imperial (was metric).`,
      `<t:${String(NOW / 1000)}:t> **Staff** set the moderators’ channel to <#${MODERATORS}>.`,
    ]);
  });

  it('keeps Recent changes and the line of what changed within what Discord takes (review G1)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW + 3_600_000 });
    const { pick, press, submit, servers } = await setup();
    const by = { id: STAFF, name: 'Staff' };
    const longLink = (n: number) => `https://maps.example.test/${String(n)}/${'a'.repeat(900)}`;
    const longWords = (n: number) =>
      Array.from({ length: 30 }, (_, i) => `${String(n)}-${String(i)}-${'w'.repeat(80)}`);
    for (let n = 0; n < 15; n++) {
      await servers.set(
        FAKE_GUILD_ID,
        (values) =>
          n % 2 === 0
            ? { ...values, regionMapLink: longLink(n) }
            : { ...values, flaggedWords: longWords(n) },
        by,
      );
    }
    const shown = shownAfter(await pick('server:panel:show', ['changes']));
    expectV2Sendable(shown);
    expect(textOf(shown)).toMatch(/-# …and \d+ earlier changes/u);
    // A change whose own line is long: said within bounds too.
    const form = shownDialog(await press('server:regionMapLink:ask'));
    const said = shownAfter(await submit(form, { link: longLink(99) }));
    expectV2Sendable(said);
    expect(servers.of(FAKE_GUILD_ID).regionMapLink).toBe(longLink(99));
  });

  it('fits the line of what changed by whole parts, never cutting inside a code span (fix round 3, H11)', async () => {
    const { press, submit, servers } = await setup();
    const link = (n: number) => `https://maps.example.test/${String(n)}/${'a'.repeat(300)}`;
    await servers.set(FAKE_GUILD_ID, (values) => ({ ...values, regionMapLink: link(1) }), {
      id: STAFF,
      name: 'Staff',
    });
    const form = shownDialog(await press('server:regionMapLink:ask'));
    const said = textOf(shownAfter(await submit(form, { link: link(2) }))).split('\n')[1];
    // Both links do not fit: the one set does, without the one it was.
    expect(said).toBe(`Set the region map link to \`${link(2)}\`.`);
    // Many sentences: those that fit, whole, and how many more.
    const many = shownDialog(await press('server:eventsForum:ask'));
    const numbers = textOf(
      shownAfter(await submit(many, { horizonDays: '20', postDaysAhead: '7', onThisDay: '3' })),
    ).split('\n')[1];
    expect(numbers).toBe(
      'Set the days the events forum lists to 20 (was 35). Set the days before an event that its post opens to 7 (was 14).',
    );
  });

  it('says there are earlier changes than the newest it shows (fix round 3, H8)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW + 3_600_000 });
    const { pick, servers } = await setup();
    const by = { id: STAFF, name: 'Staff' };
    for (let n = 0; n <= RECENT_CHANGES; n++) {
      await servers.set(
        FAKE_GUILD_ID,
        (values) => ({ ...values, postNewGyms: !values.postNewGyms }),
        by,
      );
    }
    const shown = textOf(shownAfter(await pick('server:panel:show', ['changes'])));
    expect(shown.split('\n').filter((line) => line.startsWith('<t:'))).toHaveLength(RECENT_CHANGES);
    expect(shown).toContain('-# …and earlier changes');
  });

  it('says so where nothing changed in the last 30 days', async () => {
    const { pick } = await setup();
    const shown = textOf(shownAfter(await pick('server:panel:show', ['changes'])));
    expect(shown).toContain('Nothing was changed here in the last 30 days.');
  });
});
