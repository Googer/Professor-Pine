import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeChatInput,
  sent,
} from '../../../test/support/fake-interactions.js';
import { ALICE } from '../../../test/support/parties.js';
import { ROLE, selfRolesWith } from '../../../test/support/roles.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { declaredSubcommands, enabledCommands } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { admin } from './index.js';
import { testServerValues } from '../../../test/support/server-values.js';
import { commandsIn } from '../../discord/set-up.js';
import type { ServerValues } from '../../config/server-settings.js';

type Options = Record<string, string | number | boolean>;

/**
 * The fake server is owned by the member of the fake interactions (`FakeRoleServer.ownerId`),
 * whom the order of roles does not bind: a test of what staff may offer names another owner.
 */
function setup() {
  const made = selfRolesWith();
  const { ctx, entries } = createTestContext({ selfRoles: made.selfRoles });
  const router = new InteractionRouter(ctx, [admin], []);
  const run = async (subcommand: string, options: Options = {}, extra: object = {}) => {
    const { role, ...rest } = options;
    const interaction = fakeChatInput({
      commandName: 'admin',
      subcommandGroup: 'self-roles',
      subcommand,
      roleNames: ['Moderator'],
      // A role option arrives resolved; the text options as they were typed.
      options: subcommand === 'add' ? rest : options,
      ...(subcommand === 'add' && typeof role === 'string'
        ? { resolved: { role: { id: role } } }
        : {}),
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** Everything the member of staff was answered, message by message. */
  const answers = async (subcommand: string, options: Options = {}, extra: object = {}) => {
    const used = await run(subcommand, options, extra);
    const all = [used.editReply, used.followUp, used.reply].flatMap((mock) =>
      mock.mock.calls.map((call) => call[0].content ?? ''),
    );
    if (all.length === 0) throw new Error('nothing was answered');
    return all;
  };
  const answer = async (subcommand: string, options: Options = {}, extra: object = {}) =>
    (await answers(subcommand, options, extra)).join('\n');
  const choices = async (subcommand: string, focused: string, extra: object = {}) => {
    const interaction = fakeAutocomplete({
      commandName: 'admin',
      subcommandGroup: 'self-roles',
      subcommand,
      focused,
      // The lists of a command for staff are for staff: the router asks the command's guards.
      roleNames: ['Moderator'],
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction.respond.mock.calls[0]?.[0] ?? [];
  };
  const rows = async () => (await made.selfRoles.stored(FAKE_GUILD_ID)).rows;
  const groups = async () => (await made.selfRoles.stored(FAKE_GUILD_ID)).groups;
  return { ...made, ctx, entries, run, answer, answers, choices, rows, groups };
}

describe('/admin self-roles', () => {
  it('is a group of subcommands of /admin, and not in a server whose members give themselves no roles', () => {
    const { ctx } = createTestContext();
    // The parts of plan 5C (nicknames, member settings), of 8C (the cleanup of legacy
    // channels) and the tutorial are not looked at here; the shared data is `/operator`'s.
    const paths = (values: ServerValues) =>
      declaredSubcommands(
        commandsIn(
          enabledCommands([admin], ctx.config),
          values,
          ctx,
          FAKE_GUILD_ID,
        )[0]?.data.toJSON().options,
      ).filter((path) => !/^nickname |^member-settings$|^cleanup-legacy$|^tutorial$/.test(path));
    const values = testServerValues();
    expect(paths(values)).toEqual([
      'settings',
      'setup-forums',
      'save-party',
      'self-roles add',
      'self-roles remove',
      'self-roles list',
      'self-roles group',
      'self-roles ungroup',
    ]);
    const off = { ...values, features: { ...values.features, roles: false } };
    expect(paths(off)).toEqual(['settings', 'setup-forums', 'save-party']);
  });

  it('is for staff, and answers privately', async () => {
    const { run, rows } = setup();
    const refused = await run('add', { role: ROLE.north }, { roleNames: [] });
    expect(sent(refused.reply).content).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    expect(await rows()).toEqual([]);
    const allowed = await run('add', { role: ROLE.north });
    expect(sent(allowed.deferReply).flags).toBeDefined();
  });
});

describe('/admin self-roles add', () => {
  it('adds a role with its description, aliases and group', async () => {
    const { answer, rows, groups } = setup();
    await answer('group', { name: 'Regions' });
    expect(
      await answer('add', {
        role: ROLE.north,
        description: 'North of the river',
        aliases: 'N, Northside, n',
        group: 'regions',
      }),
    ).toBe(
      'Members can give themselves **North** with `/iam` now.\n' +
        'Group: Regions\nAliases: n, northside\nDescription: North of the river',
    );
    expect(await rows()).toEqual([
      {
        id: 1,
        name: 'North',
        description: 'North of the river',
        roleId: ROLE.north,
        groupId: (await groups())[0]?.id,
        aliases: ['n', 'northside'],
      },
    ]);
  });

  it('changes only what is said of a role that is there, and "none" clears', async () => {
    const { answer, rows } = setup();
    await answer('group', { name: 'Regions' });
    await answer('add', { role: ROLE.north, description: 'Up', aliases: 'n', group: 'Regions' });
    expect(await answer('add', { role: ROLE.north, aliases: 'top, up north' })).toBe(
      '**North** is changed.\nGroup: Regions\nAliases: top, up north\nDescription: Up',
    );
    expect(
      await answer('add', {
        role: ROLE.north,
        description: 'None',
        aliases: 'none',
        group: 'Other',
      }),
    ).toBe('**North** is changed.\nGroup: Other (no group)\nAliases: none\nDescription: none');
    expect(await rows()).toMatchObject([{ description: null, aliases: [], groupId: null }]);
  });

  it.each([
    [FAKE_GUILD_ID, '**@\u200beveryone** cannot be self-assigned: every member has it already.'],
    [
      ROLE.booster,
      '**Server Booster** cannot be self-assigned: it is managed by an integration (a bot role ' +
        'or the booster role), and Discord lets nobody hand such a role out.',
    ],
    [
      ROLE.moderator,
      '**Moderator** cannot be self-assigned: it grants Kick Members, and its name makes its ' +
        'holder staff of this bot. I never hand out a role that grants a permission of ' +
        'moderation or administration.',
    ],
  ])('refuses the role %s with the reason', async (role, sentence) => {
    const { answer, rows } = setup();
    expect(await answer('add', { role })).toBe(sentence);
    expect(await rows()).toEqual([]);
  });

  it('names every moderation permission of a role it refuses, and what to do about a role above its own', async () => {
    const { answer, server } = setup();
    server.edit(ROLE.north, { moderation: ['Kick Members', 'Ban Members', 'Manage Roles'] });
    expect(await answer('add', { role: ROLE.north })).toContain(
      // In the order of the list of moderation permissions.
      'it grants Manage Roles, Kick Members and Ban Members.',
    );
    server.edit(ROLE.south, { position: 50 });
    expect(await answer('add', { role: ROLE.south })).toBe(
      '**South** cannot be self-assigned: it is not below my highest role, and I can only give ' +
        'roles that are. Move my role above it in the list of roles of this server.',
    );
  });

  it('refuses a role whose name makes its holder staff of this bot, and one a channel allows moderation', async () => {
    const { answer, server, rows } = setup();
    server.role('540000000000000001', 'Bot Developer');
    expect(await answer('add', { role: '540000000000000001' })).toBe(
      '**Bot Developer** cannot be self-assigned: its name makes its holder staff of this bot. ' +
        'I never hand out a role that makes its holder staff.',
    );
    server.channelAllows(ROLE.north, ['Manage Messages', 'Manage Roles']);
    expect(await answer('add', { role: ROLE.north })).toBe(
      '**North** cannot be self-assigned: a channel grants it Manage Permissions and Manage ' +
        'Messages. I never hand out a role that grants a permission of moderation or ' +
        'administration.',
    );
    expect(await rows()).toEqual([]);
  });

  it('lets staff add only a role they could give somebody by hand, and says which of the two is missing', async () => {
    const { answer, server, rows } = setup();
    // Somebody else owns the server; the member of staff holds Moderator (at 40).
    server.ownerId = '700000000000000099';
    server.role('540000000000000001', 'Level', { position: 40 });
    const moderator = {
      roleIds: [ROLE.moderator],
      guildRoleNames: { [ROLE.moderator]: 'Moderator' },
    };
    expect(await answer('add', { role: ROLE.north }, moderator)).toBe(
      'You cannot make **North** self-assignable: that takes the Manage Roles permission, ' +
        'which you do not have on this server. Whoever puts a role on the list gives it to ' +
        'everybody who asks.',
    );
    const managing = { ...moderator, permissions: PermissionFlagsBits.ManageRoles };
    expect(await answer('add', { role: '540000000000000001' }, managing)).toBe(
      'You cannot make **Level** self-assignable: it is not below your own highest role, so ' +
        'you could not give it to anybody yourself. Somebody whose role stands above it, or ' +
        'the owner of the server, has to add it.',
    );
    expect(await rows()).toEqual([]);
    expect(await answer('add', { role: ROLE.north }, managing)).toContain(
      'Members can give themselves **North** with `/iam` now.',
    );
    // An administrator has every permission.
    const administrator = { ...moderator, permissions: PermissionFlagsBits.Administrator };
    expect(await answer('add', { role: ROLE.south }, administrator)).toContain('**South**');
    expect(await rows()).toHaveLength(2);
  });

  it('goes by what staff may do on the server, not in the channel of the command', async () => {
    const { answer, server, rows } = setup();
    server.ownerId = '700000000000000099';
    // An overwrite of the channel gives the moderator "Manage Permissions", which is the bit
    // of Manage Roles; on the server they do not have it.
    const inChannel = {
      roleIds: [ROLE.moderator],
      guildRoleNames: { [ROLE.moderator]: 'Moderator' },
      memberPermissions: PermissionFlagsBits.ManageRoles | PermissionFlagsBits.Administrator,
    };
    expect(await answer('add', { role: ROLE.north }, inChannel)).toBe(
      'You cannot make **North** self-assignable: that takes the Manage Roles permission, ' +
        'which you do not have on this server. Whoever puts a role on the list gives it to ' +
        'everybody who asks.',
    );
    expect(await rows()).toEqual([]);
    // And the other way round: Manage Roles on the server, denied in this channel.
    const onServer = {
      ...inChannel,
      permissions: PermissionFlagsBits.ManageRoles,
      memberPermissions: 0n,
    };
    expect(await answer('add', { role: ROLE.north }, onServer)).toContain(
      'Members can give themselves **North** with `/iam` now.',
    );
  });

  it('lets a member of staff who does not own the server change what is said of a role', async () => {
    const { answer, server, rows } = setup();
    server.ownerId = '700000000000000099';
    const moderator = {
      roleIds: [ROLE.moderator],
      guildRoleNames: { [ROLE.moderator]: 'Moderator' },
      permissions: PermissionFlagsBits.ManageRoles,
    };
    await answer('add', { role: ROLE.north, description: 'Up' }, moderator);
    expect(
      await answer('add', { role: ROLE.north, description: 'North of the river' }, moderator),
    ).toBe(
      '**North** is changed.\nGroup: Other (no group)\nAliases: none\nDescription: North of the river',
    );
    expect(await rows()).toMatchObject([{ name: 'North', description: 'North of the river' }]);
    // Without Manage Roles they change nothing about it either.
    const { permissions: _none, ...plain } = moderator;
    expect(await answer('add', { role: ROLE.north, description: 'Mine' }, plain)).toContain(
      'You cannot make **North** self-assignable',
    );
    expect(await rows()).toMatchObject([{ description: 'North of the river' }]);
  });

  it('adds a role while the bot lacks Manage Roles, and says what that means', async () => {
    const { answer, server, rows } = setup();
    server.bot.mayManageRoles = false;
    expect(await answer('add', { role: ROLE.north })).toContain(
      'I lack the Manage Roles permission, so I cannot give any role to anybody until my role ' +
        'has it.',
    );
    expect(await rows()).toHaveLength(1);
  });

  it('refuses an alias or a name that another role has', async () => {
    const { answer, server, rows } = setup();
    await answer('add', { role: ROLE.north, aliases: 'n, up' });
    expect(await answer('add', { role: ROLE.south, aliases: 's, UP' })).toBe(
      'The alias "up" is the name or an alias of **North** already. Nothing was changed.',
    );
    expect(await answer('add', { role: ROLE.south, aliases: 'north' })).toContain(
      'The alias "north" is the name or an alias of **North** already.',
    );
    server.edit(ROLE.east, { name: 'Up' });
    expect(await answer('add', { role: ROLE.east })).toBe(
      '"Up" is an alias of **North**. Change the aliases of that role first.',
    );
    server.role('540000000000000001', 'north');
    expect(await answer('add', { role: '540000000000000001' })).toBe(
      'Another self-assignable role is called **North** already, and members could not tell ' +
        'the two apart. Rename one of the roles.',
    );
    expect(await rows()).toHaveLength(1);
  });

  it('refuses what does not fit: a long name, a long alias, too many aliases, an unknown group', async () => {
    const { answer, server, rows } = setup();
    server.edit(ROLE.north, { name: 'N'.repeat(51) });
    expect(await answer('add', { role: ROLE.north })).toContain(
      'its name is longer than 50 characters',
    );
    expect(await answer('add', { role: ROLE.south, aliases: `ok, ${'a'.repeat(51)}` })).toContain(
      'is longer than 50 characters.',
    );
    const many = Array.from({ length: 11 }, (_unused, n) => `a${String(n)}`).join(',');
    expect(await answer('add', { role: ROLE.south, aliases: many })).toBe(
      'A role can have 10 aliases at most; you gave 11.',
    );
    expect(await answer('add', { role: ROLE.south, group: 'Regions' })).toBe(
      'There is no group "Regions". Pick one from the list, or make it with ' +
        '`/admin self-roles group`.',
    );
    expect(await rows()).toEqual([]);
  });

  it('says so when the role is gone or the roles of the server are not known', async () => {
    const { answer } = setup();
    expect(await answer('add', { role: '540000000000000009' })).toBe(
      'This server no longer has that role.',
    );
    expect(await answer('add', { role: ROLE.north }, { guildId: '499999999999999999' })).toBe(
      'I cannot see the roles of this server at the moment. Try again in a minute.',
    );
  });

  it('takes over the entry the legacy bot made for the role of that name', async () => {
    const { answer, storage, rows } = setup();
    storage.legacyRow('north', { description: 'from before', aliases: ['n'] });
    expect(await answer('add', { role: ROLE.north, group: 'other' })).toBe(
      '**North** is changed.\nGroup: Other (no group)\nAliases: n\nDescription: from before',
    );
    expect(await rows()).toMatchObject([{ name: 'North', roleId: ROLE.north }]);
  });

  it('takes over the entry of a role that was deleted and made anew under its name', async () => {
    const { answer, offerSample, server, rows } = setup();
    await offerSample();
    server.delete(ROLE.north).role('540000000000000001', 'North');
    expect(await answer('add', { role: '540000000000000001' })).toBe(
      '**North** is changed.\nGroup: Regions\nAliases: n\nDescription: North of the river',
    );
    expect(await rows()).toHaveLength(7);
    expect((await rows()).find((row) => row.name === 'North')?.roleId).toBe('540000000000000001');
  });

  it('still changes what is said of a listed role whose name has grown too long to keep', async () => {
    const { answer, offerSample, server, rows } = setup();
    await offerSample();
    const long = 'N'.repeat(51);
    server.edit(ROLE.north, { name: long });
    expect(await answer('add', { role: ROLE.north, description: 'Up', aliases: 'none' })).toBe(
      `**${long}** is changed.\nGroup: Regions\nAliases: none\nDescription: Up`,
    );
    expect((await rows()).find((row) => row.roleId === ROLE.north)).toMatchObject({
      name: 'North',
      description: 'Up',
      aliases: [],
    });
  });

  it('offers the groups of the server for the group option, and "Other"', async () => {
    const { answer, choices } = setup();
    await answer('group', { name: 'Regions' });
    await answer('group', { name: 'Teams', 'pick-one': true });
    expect(await choices('add', '')).toEqual([
      { name: 'Regions · any number', value: 'Regions' },
      { name: 'Teams · pick one', value: 'Teams' },
      { name: 'Other (no group)', value: 'other' },
    ]);
    expect(await choices('add', 'tea')).toEqual([{ name: 'Teams · pick one', value: 'Teams' }]);
  });
});

describe('/admin self-roles remove', () => {
  it('does not speak of holders for an entry whose role no longer exists', async () => {
    const { answer, offerSample, server, rows } = setup();
    await offerSample();
    server.delete(ROLE.east);
    expect(await answer('remove', { role: 'east' })).toBe(
      '**East** is no longer self-assignable. Its role no longer exists on this server, so ' +
        'nothing else changes.',
    );
    expect((await rows()).map((row) => row.name)).not.toContain('East');
  });

  it('speaks of the role as usual for an entry that several roles of the server answer to', async () => {
    const { answer, server, storage } = setup();
    server.role('540000000000000001', 'Twin').role('540000000000000002', 'twin');
    storage.legacyRow('Twin');
    // Its roles exist, and whoever holds one keeps it: only which of them is meant is open.
    expect(await answer('remove', { role: 'Twin' })).toBe(
      '**Twin** is no longer self-assignable. The role itself is untouched, and whoever ' +
        'holds it keeps it.',
    );
  });

  it('removes the entry and leaves the role and its holders alone', async () => {
    const { answer, offerSample, server, rows, gateway } = setup();
    await offerSample();
    server.member(ALICE, ROLE.north);
    expect(await answer('remove', { role: 'north' })).toBe(
      '**North** is no longer self-assignable. The role itself is untouched, and whoever ' +
        'holds it keeps it.',
    );
    expect((await rows()).map((row) => row.name)).not.toContain('North');
    expect(server.roles.has(ROLE.north)).toBe(true);
    expect(server.held(ALICE)).toEqual([ROLE.north]);
    expect(gateway.calls).toEqual([]);
  });

  it('offers every entry, also one whose role is gone, and removes what was picked', async () => {
    const { answer, choices, offerSample, server, rows } = setup();
    await offerSample();
    server.delete(ROLE.east).edit(ROLE.south, { name: 'Southside' });
    const offered = await choices('remove', '');
    expect(offered.map((choice) => choice.name)).toEqual([
      'East · its role is gone',
      'Instinct',
      'Mystic',
      'North',
      'Southside',
      'Trader',
      'Valor',
    ]);
    expect(await choices('remove', 'sou')).toMatchObject([{ name: 'Southside' }]);
    const east = offered[0]?.value ?? '';
    expect(east).toMatch(/^row:\d+$/);
    expect(await answer('remove', { role: east })).toContain('**East** is no longer');
    // By the name the role has now, typed without picking.
    expect(await answer('remove', { role: 'southside' })).toContain('**Southside** is no longer');
    expect(await rows()).toHaveLength(5);
  });

  it('offers its list while what resolving the rows found is still being written', async () => {
    const { choices, storage, selfRoles } = setup();
    const id = storage.legacyRow('north');
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const remember = storage.remember.bind(storage);
    storage.remember = async (guildId, writes) => {
      await held;
      return remember(guildId, writes);
    };
    expect(await choices('remove', '')).toEqual([{ name: 'North', value: `row:${String(id)}` }]);
    release();
    await selfRoles.idle();
    expect(storage.rows.find((row) => row.id === id)?.roleId).toBe(ROLE.north);
  });

  it('says in the list why an entry leads to no role', async () => {
    const { choices, offerSample, server, storage } = setup();
    await offerSample();
    server.role('540000000000000001', 'Twin').role('540000000000000002', 'twin');
    storage.legacyRow('Twin');
    // The only role of this name has its row already.
    storage.legacyRow('trader');
    const offered = (await choices('remove', '')).map((choice) => choice.name);
    expect(offered).toEqual(
      expect.arrayContaining([
        'Trader',
        'trader · another entry has its role',
        'Twin · several roles have its name',
      ]),
    );
    expect(offered).toHaveLength(9);
  });

  it('prefers the stored name of an entry to the name a role has now, and guesses nothing between two', async () => {
    const { answer, offerSample, server, storage, rows } = setup();
    await offerSample();
    // North and South swap their names on Discord: neither row can follow while the other has the name.
    server.edit(ROLE.north, { name: 'South' }).edit(ROLE.south, { name: 'North' });
    expect(await answer('remove', { role: 'north' })).toContain('**North** is no longer');
    expect((await rows()).map((row) => row.roleId)).not.toContain(ROLE.north);
    expect((await rows()).map((row) => row.roleId)).toContain(ROLE.south);
    // Two entries of one stored name: the legacy bot's and the one of the role.
    storage.legacyRow('trader');
    expect(await answer('remove', { role: 'Trader' })).toBe(
      '2 self-assignable roles are called "Trader". Pick the one you mean from the list.',
    );
    expect(await rows()).toHaveLength(7);
  });

  it('guesses nothing between two listed roles that are called alike on Discord', async () => {
    const { answer, choices, offerSample, server, rows } = setup();
    await offerSample();
    // East is renamed to the name South has; its entry cannot follow.
    server.edit(ROLE.east, { name: 'south' });
    expect(await answer('remove', { role: 'South' })).toBe(
      'Two roles are called **South**. Pick one from the list.',
    );
    expect(await rows()).toHaveLength(7);
    // Picked from the list, each is its own.
    const picked = (await choices('remove', 'south')).map((choice) => choice.value);
    expect(picked).toHaveLength(2);
    await answer('remove', { role: String(picked[1]) });
    expect(await rows()).toHaveLength(6);
    expect(await answer('remove', { role: 'South' })).toContain('is no longer self-assignable');
  });

  it('says so when no entry is meant', async () => {
    const { answer, offerSample } = setup();
    await offerSample();
    expect(await answer('remove', { role: 'Nor' })).toBe(
      'No self-assignable role is called "Nor". Pick it from the list; ' +
        '`/admin self-roles list` shows them all.',
    );
    expect(await answer('remove', { role: 'row:99999' })).toContain('No self-assignable role');
  });
});

describe('/admin self-roles list', () => {
  it('says how to start when there is nothing', async () => {
    const { answer } = setup();
    expect(await answer('list')).toBe(
      'No role is self-assignable yet. Add one with `/admin self-roles add`, and sort the ' +
        'roles into groups with `/admin self-roles group`.',
    );
  });

  it('lists every entry by group, with aliases and description', async () => {
    const { answer, offerSample } = setup();
    await offerSample();
    await answer('group', { name: 'Hobbies' });
    expect((await answer('list')).split('\n')).toEqual([
      '**7 self-assignable roles** in 3 groups. Members pick them with `/iam`.',
      '',
      '**Regions** · position 1 · any number',
      '- **East**',
      '- **North** [n]: North of the river',
      '- **South**',
      '',
      '**Teams** · position 2 · pick one',
      '- **Instinct**',
      '- **Mystic**',
      '- **Valor**',
      '',
      '**Hobbies** · position 3 · any number',
      '- no roles yet',
      '',
      '**Other** · no group',
      '- **Trader**: Open to trades',
    ]);
  });

  it('marks each entry that cannot be given at present with the reason', async () => {
    const { answer, offerSample, server, storage } = setup();
    await offerSample();
    server
      .delete(ROLE.east)
      .edit(ROLE.north, { moderation: ['Manage Messages', 'Kick Members'] })
      .edit(ROLE.south, { position: 51 })
      .edit(ROLE.trader, { managed: true })
      .role('540000000000000001', 'Twin')
      .role('540000000000000002', 'twin');
    storage.legacyRow('Twin');
    const text = await answer('list');
    // The heading counts what can be given, and says how many cannot: East, North, South,
    // Trader and Twin of the eight.
    expect(text.split('\n')[0]).toBe(
      '**3 self-assignable roles** in 2 groups, and 5 more that cannot be given at present ' +
        '(marked ⚠️). Members pick them with `/iam`.',
    );
    expect(text).toContain('- **East**\n  ⚠️ Cannot be given: its Discord role no longer exists.');
    expect(text).toContain(
      '- **North** [n]: North of the river\n  ⚠️ Cannot be given: it grants Manage Messages and Kick Members.',
    );
    expect(text).toContain(
      '- **South**\n  ⚠️ Cannot be given: it is not below my highest role in the list of roles.',
    );
    expect(text).toContain(
      '- **Trader**: Open to trades\n  ⚠️ Cannot be given: it is managed by an integration',
    );
    expect(text).toContain(
      '- **Twin**\n  ⚠️ Cannot be given: several roles of this server have its name',
    );
    expect(text).toContain('- **Valor**\n');

    // A role renamed to a name of staff, and one that a channel allows to moderate.
    server
      .edit(ROLE.instinct, { name: 'Moderator' })
      .channelAllows(ROLE.mystic, ['Manage Threads']);
    server.channelAllows(ROLE.north, ['Mention @everyone, @here and All Roles']);
    const promoted = await answer('list');
    expect(promoted).toContain(
      '- **Moderator**\n  ⚠️ Cannot be given: its name makes its holder staff of this bot.',
    );
    expect(promoted).toContain(
      '- **Mystic**\n  ⚠️ Cannot be given: a channel grants it Manage Threads.',
    );
    expect(promoted).toContain(
      '⚠️ Cannot be given: it grants Manage Messages and Kick Members, and a channel grants it ' +
        'Mention @everyone, @here and All Roles.',
    );

    server.bot.mayManageRoles = false;
    const powerless = await answer('list');
    // Said once above the list, not on the line of every role.
    expect(powerless.split('I lack the Manage Roles permission')).toHaveLength(2);
    expect(powerless.split('\n')[1]).toBe(
      '⚠️ I lack the Manage Roles permission: I cannot give any role to anybody until my role ' +
        'has it.',
    );
    expect(powerless).toContain('- **Valor**\n');
    // What is wrong with one role is still said on its line.
    expect(powerless).toContain('- **East**\n  ⚠️ Cannot be given: its Discord role no longer');
  });

  it('shows text staff wrote as text', async () => {
    const { answer } = setup();
    await answer('group', { name: '**Bold** @everyone' });
    await answer('add', {
      role: ROLE.north,
      description: '[link](https://example.com) <@&1>',
      aliases: '*n*',
      group: '**Bold** @everyone',
    });
    const text = await answer('list');
    expect(text).not.toContain('**Bold**');
    expect(text).not.toContain('@everyone');
    expect(text).not.toContain('](https');
    expect(text).not.toContain('<@&1>');
    expect(text).toContain('[\\*n\\*]');
  });

  it('fits Discord whatever the number of roles', async () => {
    const { answers, server, selfRoles, owner } = setup();
    for (let n = 0; n < 240; n++) {
      const id = `55${String(n).padStart(16, '0')}`;
      server.role(id, `Role number ${String(n).padStart(3, '0')} ${'x'.repeat(30)}`);
      const added = await selfRoles.addRole(
        FAKE_GUILD_ID,
        {
          roleId: id,
          description: 'd'.repeat(150),
          aliases: Array.from(
            { length: 10 },
            (_unused, k) => `${'a'.repeat(40)}${String(n)}x${String(k)}`,
          ),
        },
        owner(),
      );
      expect(added.kind).toBe('added');
    }
    const messages = await answers('list');
    expect(messages.length).toBeGreaterThan(10);
    for (const message of messages) {
      expect(message.length).toBeLessThanOrEqual(2000);
      expect(message.trim()).not.toBe('');
    }
    const all = messages.join('\n');
    expect(all).toContain('**240 self-assignable roles**. Members pick them with `/iam`.');
    expect(all.match(/^- \*\*Role number/gm)).toHaveLength(240);
  });

  it('says so when the roles of the server are not known', async () => {
    const { answer } = setup();
    expect(await answer('list', {}, { guildId: '499999999999999999' })).toBe(
      'I cannot see the roles of this server at the moment. Try again in a minute.',
    );
  });
});

describe('/admin self-roles group and ungroup', () => {
  it('makes groups, in the order they are made unless a position is named', async () => {
    const { answer, groups } = setup();
    expect(await answer('group', { name: 'Regions' })).toBe(
      'Made the group **Regions**: position 1, a member can hold any number of its roles. Put ' +
        'roles into it with the `group` option of `/admin self-roles add`.',
    );
    expect(await answer('group', { name: 'Teams', 'pick-one': true, position: 1 })).toContain(
      'Made the group **Teams**: position 1, a member can hold only one of its roles.',
    );
    expect((await groups()).map((group) => [group.name, group.position, group.pickOne])).toEqual([
      ['Teams', 1, true],
      ['Regions', 2, false],
    ]);
  });

  it('changes a group that exists: its rule, its position, its name', async () => {
    const { answer, groups } = setup();
    await answer('group', { name: 'Regions' });
    await answer('group', { name: 'Teams' });
    expect(await answer('group', { name: 'teams', 'pick-one': true, position: 1 })).toBe(
      'The group **Teams** is now: position 1, a member can hold only one of its roles.',
    );
    expect(await answer('group', { name: 'teams', 'new-name': 'Team' })).toBe(
      'The group **Team** is now: position 1, a member can hold only one of its roles.',
    );
    expect((await groups()).map((group) => group.name)).toEqual(['Team', 'Regions']);
  });

  it('refuses names that cannot be', async () => {
    const { answer, groups } = setup();
    await answer('group', { name: 'Regions' });
    expect(await answer('group', { name: 'Other' })).toBe(
      'A group cannot be called "Other" or "None": those words mean the roles that are in no ' +
        'group.',
    );
    expect(await answer('group', { name: 'Teams', 'new-name': 'Team' })).toBe(
      'There is no group "Teams" to rename. Leave `new-name` out to make it.',
    );
    await answer('group', { name: 'Teams' });
    expect(await answer('group', { name: 'Teams', 'new-name': 'regions' })).toBe(
      'Another group has that name already.',
    );
    expect(await groups()).toHaveLength(2);
  });

  it('removes a group, and its roles are under "Other" from then on', async () => {
    const { answer, offerSample, rows, groups, choices } = setup();
    await offerSample();
    expect(await choices('ungroup', 'r')).toEqual([
      { name: 'Regions · any number', value: 'Regions' },
    ]);
    // A member who is not staff learns nothing from the list.
    expect(await choices('ungroup', 'r', { roleNames: [] })).toEqual([]);
    expect(await answer('ungroup', { name: 'regions' })).toBe(
      'Removed the group **Regions**. Its 3 roles are under "Other" now.',
    );
    expect((await groups()).map((group) => [group.name, group.position])).toEqual([['Teams', 1]]);
    expect((await rows()).filter((row) => row.groupId === null)).toHaveLength(4);
    expect(await answer('ungroup', { name: 'Regions' })).toBe(
      'There is no group "Regions". Pick one from the list.',
    );
    await answer('group', { name: 'Empty' });
    expect(await answer('ungroup', { name: 'Empty' })).toBe(
      'Removed the group **Empty**. It had no roles.',
    );
  });
});
