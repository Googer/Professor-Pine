import { MessageFlags } from 'discord.js';
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
import { enabledCommands } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { commands } from '../index.js';
import { iam, iamnot } from './iam.js';
import { memberProblem } from './words.js';
import { testServerValues } from '../../../test/support/server-values.js';
import { commandsIn } from '../../discord/set-up.js';
import type { ServerValues } from '../../config/server-settings.js';

const ELSEWHERE = '499999999999999999';
/** What a member reads when Discord refuses a role for lack of a permission. */
const LET =
  'Discord did not let me. A moderator should check that my role has the Manage Roles ' +
  'permission and stands above the roles I hand out.';

async function setup() {
  const made = selfRolesWith();
  await made.offerSample();
  made.server.member(ALICE);
  const { ctx, entries } = createTestContext({ selfRoles: made.selfRoles });
  const router = new InteractionRouter(ctx, [iam, iamnot], []);
  /** A command of Alice, who is shown with the roles she holds at that moment. */
  const run = async (commandName: string, role: string | undefined, extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName,
      ...made.server.interactionOf(ALICE),
      options: role === undefined ? {} : { role },
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const answer = async (commandName: string, role: string | undefined, extra: object = {}) => {
    const used = await run(commandName, role, extra);
    for (const mock of [used.editReply, used.followUp, used.reply]) {
      if (mock.mock.calls.length > 0) return sent(mock).content;
    }
    throw new Error('nothing was answered');
  };
  const choices = async (commandName: string, focused: string, extra: object = {}) => {
    const interaction = fakeAutocomplete({
      commandName,
      ...made.server.interactionOf(ALICE),
      focused,
      focusedName: 'role',
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction.respond.mock.calls[0]?.[0] ?? [];
  };
  const held = () => made.server.heldNames(ALICE);
  return { ...made, ctx, entries, run, answer, choices, held };
}

describe('the role commands', () => {
  it('are registered for every server, set up where its members give themselves roles, under Roles', () => {
    const { ctx } = createTestContext();
    const names = (values: ServerValues) =>
      commandsIn(enabledCommands(commands, ctx.config), values, ctx.config).map(
        (command) => command.data.name,
      );
    const values = testServerValues();
    expect(names(values)).toEqual(expect.arrayContaining(['iam', 'iamnot']));
    const off = { ...values, features: { ...values.features, roles: false } };
    expect(names(off)).not.toContain('iam');
    expect(names(off)).not.toContain('iamnot');
    expect(iam.setUpIn?.(off, ctx.config)).toBe(
      'Staff turn on self-assigned roles in /admin settings.',
    );
    expect(iam.help.category).toBe('roles');
    expect(iamnot.help.category).toBe('roles');
    expect(iam.data.toJSON().contexts).toBeUndefined();
  });

  it('say in /help that the web map’s "Your regions…" does the same, where the map is on (plan 8M-20)', () => {
    const { ctx } = createTestContext();
    const said = (settings: typeof ctx.config.settings, command: typeof iam) =>
      typeof command.help.details === 'function'
        ? command.help.details(settings)
        : command.help.details;
    const sentence =
      'On the web map, "Your regions…" in the menu under your name gives you or takes away the roles that open regions.';
    const web = { port: 8080, host: '127.0.0.1', publicUrl: 'https://map.example.test' };
    for (const command of [iam, iamnot]) {
      expect(said({ ...ctx.config.settings, web } as never, command)).toContain(sentence);
      expect(said({ ...ctx.config.settings, web: undefined }, command)).not.toContain('web map');
    }
  });

  it('say in /help that taking a role of a pick-one group takes the first away (staging F2)', () => {
    const { ctx } = createTestContext();
    const details = iam.help.details;
    const text = typeof details === 'function' ? details(ctx.config.settings) : details;
    expect(text).toContain('taking another one takes the first away');
    expect(text).not.toContain('gives the first back');
  });

  it('refuse a member who has not finished joining the server', async () => {
    const { answer, server, gateway, held } = await setup();
    server.member(ALICE, ROLE.south);
    for (const [command, role] of [
      ['iam', 'North'],
      ['iam', undefined],
      ['iamnot', 'South'],
    ] as const) {
      expect(await answer(command, role, { pending: true })).toBe(
        'Finish joining this server first: accept its rules, then try again.',
      );
    }
    expect(gateway.calls).toEqual([]);
    expect(held()).toEqual(['South']);
  });

  it('answer privately, in any channel, and not in a DM', async () => {
    const { run, answer } = await setup();
    const used = await run('iam', 'North', { channelName: 'random-chatter' });
    expect(sent(used.reply).flags).toBe(MessageFlags.Ephemeral);
    expect(used.deferReply).not.toHaveBeenCalled();
    expect(await answer('iam', 'North', { isDm: true })).toBe('This only works in a server.');
  });
});

describe('/iam role', () => {
  it('gives the role that was picked from the list', async () => {
    const { answer, held, gateway } = await setup();
    expect(await answer('iam', `id:${ROLE.north}`)).toBe('You have **North** now.');
    expect(held()).toEqual(['North']);
    expect(gateway.said()).toEqual(['give North']);
  });

  it('gives the role a typed name or alias names outright, without case', async () => {
    const { answer, held } = await setup();
    expect(await answer('iam', ' south ')).toBe('You have **South** now.');
    expect(await answer('iam', 'N')).toBe('You have **North** now.');
    expect(held()).toEqual(['North', 'South']);
  });

  it('says so when the member has the role already, and asks nothing of Discord', async () => {
    const { answer, server, gateway } = await setup();
    server.member(ALICE, ROLE.north);
    expect(await answer('iam', 'North')).toBe('You have **North** already.');
    expect(gateway.calls).toEqual([]);
  });

  it('takes the other roles of a pick-one group away in the same step, and says so', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.valor, ROLE.north, ROLE.moderator);
    expect(await answer('iam', 'Mystic')).toBe(
      'You have **Mystic** now. I took **Valor** away: only one role of the group Teams can ' +
        'be held at a time.',
    );
    expect(held()).toEqual(['Moderator', 'Mystic', 'North']);
    expect(gateway.said()).toEqual(['give Mystic', 'take Valor']);
  });

  it('refuses a text that is not a name or an alias in full, with suggestions', async () => {
    const { answer, held } = await setup();
    expect(await answer('iam', 'nor')).toBe(
      'No self-assignable role is called "nor". Did you mean **North**? Pick the role ' +
        'from the list that appears while you type.',
    );
    expect(await answer('iam', 'zzz')).toBe(
      'No self-assignable role is called "zzz". Pick the role from the list that appears while ' +
        'you type.',
    );
    expect(held()).toEqual([]);
  });

  it('guesses nothing between two listed roles that are called alike on Discord', async () => {
    const { answer, choices, server, held, gateway } = await setup();
    // East is renamed to the name South has; its entry cannot follow.
    server.edit(ROLE.east, { name: 'south' });
    expect(await answer('iam', 'South')).toBe(
      'Two roles are called **South**. Pick one from the list.',
    );
    server.member(ALICE, ROLE.south, ROLE.east);
    expect(await answer('iamnot', 'south')).toBe(
      'Two roles are called **South**. Pick one from the list.',
    );
    expect(gateway.calls).toEqual([]);
    // Picked from the list, each is its own.
    const offered = await choices('iamnot', 'south');
    expect(offered.map((choice) => choice.value).sort()).toEqual(
      [`id:${ROLE.south}`, `id:${ROLE.east}`].sort(),
    );
    await answer('iamnot', `id:${ROLE.east}`);
    expect(held()).toEqual(['South']);
  });

  it('reads a picked choice only when it holds the id of a role', async () => {
    const { answer } = await setup();
    for (const typed of ['id:12', 'id:99999999999999999999999', 'id:']) {
      expect(await answer('iam', typed)).toContain(`No self-assignable role is called "${typed}".`);
    }
    expect(await answer('iam', ` id:${ROLE.north} `)).toBe('You have **North** now.');
  });

  it('never gives a role that is not on the list, by name or by a made-up choice', async () => {
    const { answer, held, gateway } = await setup();
    for (const role of [
      'Moderator',
      'Admin',
      `id:${ROLE.admin}`,
      `id:${ROLE.moderator}`,
      '@everyone',
    ]) {
      expect(await answer('iam', role)).toContain('No self-assignable role is called');
    }
    expect(held()).toEqual([]);
    expect(gateway.calls).toEqual([]);
  });

  it('refuses a role that was given a moderation permission after it was added', async () => {
    const { answer, server, held } = await setup();
    server.edit(ROLE.north, { moderation: ['Manage Messages'] });
    expect(await answer('iam', 'North')).toBe(
      '**North** is not handed out any more: the role was changed since it was put on the ' +
        'list, and it now grants more than a self-assigned role may. A moderator has to change ' +
        'the role back or take it off the list.',
    );
    expect(held()).toEqual([]);
  });

  it('says what a moderator has to mend when the bot cannot give the role', async () => {
    const { answer, server, held, gateway } = await setup();
    server.edit(ROLE.north, { position: 55 });
    expect(await answer('iam', 'North')).toBe(
      'I cannot give or take **North**: it is not below my own role in the list of roles of ' +
        'this server. A moderator has to move my role above it.',
    );
    server.bot.mayManageRoles = false;
    expect(await answer('iam', 'South')).toBe(
      'I cannot change roles on this server: I lack the Manage Roles permission. A moderator ' +
        'has to give it to my role.',
    );
    server.delete(ROLE.east);
    expect(await answer('iam', 'East')).toBe(
      '**East** is not available at the moment: the role behind it is missing on this server. ' +
        'A moderator can mend that with `/admin self-roles`.',
    );
    expect(held()).toEqual([]);
    expect(gateway.calls).toEqual([]);
  });

  it('says what is wrong with an entry that leads to no role, by what it is', async () => {
    const { answer, server, storage } = await setup();
    server.role('540000000000000001', 'Twin').role('540000000000000002', 'twin');
    storage.legacyRow('Twin');
    expect(await answer('iam', 'twin')).toBe(
      '**Twin** is not available at the moment: several roles of this server have its name, ' +
        'and I cannot tell which one is meant. A moderator can mend that with ' +
        '`/admin self-roles`.',
    );
    expect(memberProblem('**Trader**', { reason: 'duplicate' })).toBe(
      '**Trader** is not available at the moment: another entry of the list already stands ' +
        'for the role of that name. A moderator can mend that with `/admin self-roles`.',
    );
  });

  it('says a sentence, not an error with a reference, when Discord refuses the change', async () => {
    const { answer, gateway, entries } = await setup();
    gateway.refusing = 'no-permission';
    const text = await answer('iam', 'North');
    expect(text).toBe(`I could not give you **North**: ${LET} Nothing was changed.`);
    expect(entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });

  it('says so when the roles of the server are not known', async () => {
    const { answer } = await setup();
    expect(await answer('iam', 'North', { guildId: ELSEWHERE })).toBe(
      'I cannot see the roles of this server at the moment. Try again in a minute.',
    );
  });

  it('works for a role the legacy bot added, and for one that was renamed since', async () => {
    const { answer, server, storage, held } = await setup();
    server.role('540000000000000001', 'Raider');
    storage.legacyRow('raider', { aliases: ['raids'] });
    expect(await answer('iam', 'raids')).toBe('You have **Raider** now.');
    server.edit('540000000000000001', { name: 'Raid Fan' });
    server.edit(ROLE.south, { name: 'Southside' });
    expect(await answer('iam', 'southside')).toBe('You have **Southside** now.');
    expect(await answer('iam', 'raider')).toContain('No self-assignable role is called');
    expect(held()).toEqual(['Raid Fan', 'Southside']);
  });

  it('shows names that members could have written as text', async () => {
    const { answer, server, selfRoles, owner } = await setup();
    server.role('540000000000000001', '**bold** <@&1>');
    await selfRoles.addRole(FAKE_GUILD_ID, { roleId: '540000000000000001' }, owner());
    const text = await answer('iam', '**bold** <@&1>');
    expect(text).toBe('You have **\\*\\*bold\\*\\* <\u200b@&1>** now.');
  });

  it('offers the self-assignable roles by name and alias, with the description beside the name', async () => {
    const { choices, server } = await setup();
    server.edit(ROLE.trader, { moderation: ['Kick Members'] }).delete(ROLE.east);
    expect(await choices('iam', '')).toEqual([
      { name: 'Instinct', value: `id:${ROLE.instinct}` },
      { name: 'Mystic', value: `id:${ROLE.mystic}` },
      { name: 'North · North of the river', value: `id:${ROLE.north}` },
      { name: 'South', value: `id:${ROLE.south}` },
      { name: 'Valor', value: `id:${ROLE.valor}` },
    ]);
    expect(await choices('iam', 'n')).toMatchObject([
      { name: 'North · North of the river' },
      { name: 'Instinct' },
    ]);
    expect(await choices('iam', 'sou')).toMatchObject([{ name: 'South' }]);
    expect(await choices('iam', 'x')).toEqual([]);
    expect(await choices('iam', '', { guildId: ELSEWHERE })).toEqual([]);
  });

  it('offers 25 choices at most, each within 100 characters', async () => {
    const { choices, server, selfRoles, owner } = await setup();
    for (let n = 0; n < 30; n++) {
      const id = `55${String(n).padStart(16, '0')}`;
      server.role(id, `Zone ${String(n).padStart(2, '0')}`);
      await selfRoles.addRole(FAKE_GUILD_ID, { roleId: id, description: 'd'.repeat(150) }, owner());
    }
    const offered = await choices('iam', 'zone');
    expect(offered).toHaveLength(25);
    for (const choice of offered) expect(choice.name.length).toBeLessThanOrEqual(100);
  });
});

describe('/iamnot', () => {
  it('takes a role away', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.north, ROLE.valor, ROLE.admin);
    expect(await answer('iamnot', `id:${ROLE.north}`)).toBe('You no longer have **North**.');
    expect(await answer('iamnot', 'valor')).toBe('You no longer have **Valor**.');
    expect(held()).toEqual(['Admin']);
    expect(gateway.said()).toEqual(['take North', 'take Valor']);
  });

  it('says so when the member does not have the role', async () => {
    const { answer, server, gateway } = await setup();
    expect(await answer('iamnot', 'North')).toBe('You do not have **North**.');
    server.delete(ROLE.east);
    expect(await answer('iamnot', 'East')).toBe('You do not have **East**.');
    expect(gateway.calls).toEqual([]);
  });

  it('never takes away a role that is not on the list', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.moderator, ROLE.booster);
    for (const role of [
      'Moderator',
      `id:${ROLE.moderator}`,
      'Server Booster',
      `id:${ROLE.booster}`,
    ]) {
      expect(await answer('iamnot', role)).toBe(
        `No self-assignable role is called "${role}". Pick one of your roles from the list ` +
          'that appears while you type.',
      );
    }
    expect(held()).toEqual(['Moderator', 'Server Booster']);
    expect(gateway.calls).toEqual([]);
  });

  it('still takes away a role that may no longer be given', async () => {
    const { answer, server, held } = await setup();
    server.member(ALICE, ROLE.north);
    server.edit(ROLE.north, { moderation: ['Manage Messages'] });
    expect(await answer('iamnot', 'North')).toBe('You no longer have **North**.');
    expect(held()).toEqual([]);
  });

  it('says what a moderator has to mend when the bot cannot take the role', async () => {
    const { answer, server, held } = await setup();
    server.member(ALICE, ROLE.north);
    server.edit(ROLE.north, { position: 55 });
    expect(await answer('iamnot', 'North')).toContain('I cannot give or take **North**');
    server.edit(ROLE.north, { position: 5 });
    server.bot.mayManageRoles = false;
    expect(await answer('iamnot', 'North')).toContain('I lack the Manage Roles permission');
    expect(held()).toEqual(['North']);
  });

  it('offers only the self-assignable roles the member holds', async () => {
    const { choices, server } = await setup();
    expect(await choices('iamnot', '')).toEqual([]);
    server.member(ALICE, ROLE.north, ROLE.valor, ROLE.moderator, ROLE.booster);
    expect(await choices('iamnot', '')).toEqual([
      { name: 'North · North of the river', value: `id:${ROLE.north}` },
      { name: 'Valor', value: `id:${ROLE.valor}` },
    ]);
    expect(await choices('iamnot', 'val')).toMatchObject([{ name: 'Valor' }]);
  });

  it('offers a role right after it was given, before Discord shows it on the member', async () => {
    const { answer, choices, server } = await setup();
    // The interaction of the list is as old as the one of the command: Alice held nothing.
    const before = server.interactionOf(ALICE);
    await answer('iam', 'North');
    expect(await choices('iamnot', '', before)).toMatchObject([{ value: `id:${ROLE.north}` }]);
  });
});

describe('the lists of the role commands', () => {
  it('answer while what resolving the rows found is still being written', async () => {
    const { choices, server, storage, selfRoles } = await setup();
    server.role('540000000000000001', 'Raider');
    const id = storage.legacyRow('raider');
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const remember = storage.remember.bind(storage);
    storage.remember = async (guildId, writes) => {
      await held;
      return remember(guildId, writes);
    };
    expect(await choices('iam', 'rai')).toEqual([
      { name: 'Raider', value: 'id:540000000000000001' },
    ]);
    expect(await choices('iamnot', '')).toEqual([]);
    expect(storage.rows.find((row) => row.id === id)?.roleId).toBeNull();
    release();
    await selfRoles.idle();
    expect(storage.rows.find((row) => row.id === id)?.roleId).toBe('540000000000000001');
  });
});

describe('a member with changes still under way', () => {
  it('is told to wait, and nothing more is queued', async () => {
    const { run, answer, gateway, held, selfRoles } = await setup();
    let release = (): void => undefined;
    gateway.holding = new Promise<void>((resolve) => (release = resolve));
    const three = ['North', 'South', 'East'].map((role) => run('iam', role));
    await gateway.requests.reached(1);
    expect(gateway.calls).toHaveLength(1);
    expect(await answer('iam', 'Trader')).toBe(
      'I am still working on your earlier changes. Try again in a moment.',
    );
    expect(await answer('iamnot', 'North')).toBe(
      'I am still working on your earlier changes. Try again in a moment.',
    );
    release();
    await Promise.all(three);
    await selfRoles.idle();
    expect(held()).toEqual(['East', 'North', 'South']);
  });

  it('is told nothing by a command whose interaction ran out while it waited', async () => {
    const { run, gateway, held, clock, entries } = await setup();
    let release = (): void => undefined;
    gateway.holding = new Promise<void>((resolve) => (release = resolve));
    const first = run('iam', 'North');
    const second = run('iam', 'South');
    await gateway.requests.reached(1);
    expect(gateway.calls).toHaveLength(1);
    clock.now += 15 * 60_000;
    release();
    await first;
    const late = await second;
    // Nothing can be said through an interaction whose token has run out.
    expect(late.editReply).not.toHaveBeenCalled();
    expect(late.followUp).not.toHaveBeenCalled();
    expect(held()).toEqual(['North']);
    expect(entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });
});

describe('the roles a member holds, as the role commands know them', () => {
  it('believe a later interaction over their own change: a role staff took away since is not offered', async () => {
    const { answer, choices, server, clock } = await setup();
    await answer('iam', 'North');
    // Staff take North away by hand; five seconds later Alice asks for the list of her roles.
    server.member(ALICE);
    clock.now += 5_000;
    expect(await choices('iamnot', '')).toEqual([]);
    expect(await answer('iamnot', 'North')).toBe('You do not have **North**.');
  });

  it('do not undo what happened to the member since their interaction was made', async () => {
    const { answer, server, held, gateway } = await setup();
    server.role('580000000000000001', 'Muted', { position: 45 });
    server.member(ALICE, ROLE.moderator);
    // The interaction shows Alice as a moderator; she is demoted and muted before it is handled.
    const stale = server.interactionOf(ALICE);
    server.member(ALICE, '580000000000000001');
    expect(await answer('iam', 'North', stale)).toBe('You have **North** now.');
    expect(held()).toEqual(['Muted', 'North']);
    expect(gateway.said()).toEqual(['give North']);
  });

  it('say "already" for a role an old interaction still shows, and change nothing', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.north);
    const stale = server.interactionOf(ALICE);
    server.member(ALICE);
    // Wrong, and harmless: nothing is asked of Discord.
    expect(await answer('iam', 'North', stale)).toBe('You have **North** already.');
    expect(held()).toEqual([]);
    expect(gateway.calls).toEqual([]);
  });
});

describe('a change of roles that Discord stops', () => {
  it('says what was given and what could not be taken away', async () => {
    const { answer, server, held, gateway, entries } = await setup();
    server.member(ALICE, ROLE.valor);
    // Between the bot's look at the roles and its second request Valor is moved above its own.
    gateway.meanwhile = (call) => {
      if (call.action === 'take') server.edit(ROLE.valor, { position: 55 });
    };
    expect(await answer('iam', 'Mystic')).toBe(
      `You have **Mystic** now. I could not take **Valor** away: ${LET}`,
    );
    expect(held()).toEqual(['Mystic', 'Valor']);
    expect(entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });

  it('does not ask Discord to take a role that left the bot\u2019s reach while the new one was given', async () => {
    const { answer, server, storage, held, gateway } = await setup();
    server.member(ALICE, ROLE.valor);
    // While Mystic is on its way, Valor is moved above the bot's own role.
    gateway.meanwhile = (call) => {
      if (call.action === 'give') server.edit(ROLE.valor, { position: 55 });
    };
    expect(await answer('iam', 'Mystic')).toBe(
      'You have **Mystic** now. I cannot give or take **Valor**: it is not below my own role ' +
        'in the list of roles of this server. A moderator has to move my role above it.',
    );
    expect(held()).toEqual(['Mystic', 'Valor']);
    expect(gateway.said()).toEqual(['give Mystic']);

    // Or staff take the old role off the list meanwhile.
    server.edit(ROLE.valor, { position: 5 }).member(ALICE, ROLE.mystic);
    gateway.meanwhile = (call) => {
      const row = storage.rows.find((other) => other.name === 'Mystic');
      if (call.action === 'give') void storage.removeRole(FAKE_GUILD_ID, row?.id ?? 0);
    };
    expect(await answer('iam', 'Valor')).toBe(
      'You have **Valor** now. **Mystic** was not taken away: it is no longer on the list.',
    );
    expect(held()).toEqual(['Mystic', 'Valor']);
  });

  it('leaves the old role of a pick-one group alone when it became one of moderation while the new one was given', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.valor);
    gateway.meanwhile = (call) => {
      if (call.action === 'give') server.channelAllows(ROLE.valor, ['Manage Messages']);
    };
    expect(await answer('iam', 'Mystic')).toBe(
      'You have **Mystic** now. **Valor** was not taken away: it grants more than a ' +
        'self-assigned role may by now, and I take such a role away only when you give it back ' +
        'yourself with `/iamnot`.',
    );
    expect(held()).toEqual(['Mystic', 'Valor']);
    expect(gateway.said()).toEqual(['give Mystic']);
  });

  it('says that the old role no longer exists when it was deleted while the new one was given', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.valor);
    gateway.meanwhile = (call) => {
      if (call.action === 'give') server.delete(ROLE.valor);
    };
    expect(await answer('iam', 'Mystic')).toBe(
      'You have **Mystic** now. **Valor** was not taken away: the role no longer exists.',
    );
    expect(held()).toEqual(['Mystic']);
    expect(gateway.said()).toEqual(['give Mystic']);
  });

  it('claims nothing about where a failure of another kind lay', async () => {
    const { answer, server, storage, gateway, held } = await setup();
    server.member(ALICE, ROLE.valor);
    // The database is away when the rows are read again before the second step.
    gateway.meanwhile = (call) => {
      if (call.action === 'give') storage.failing = new Error('database away');
    };
    expect(await answer('iam', 'Mystic')).toBe(
      'You have **Mystic** now. I could not take **Valor** away: something went wrong. Try ' +
        'again in a moment.',
    );
    storage.failing = undefined;
    expect(held()).toEqual(['Mystic', 'Valor']);
  });

  it('takes nothing away when the role itself could not be given', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.valor);
    gateway.meanwhile = () => server.edit(ROLE.mystic, { position: 55 });
    expect(await answer('iam', 'Mystic')).toBe(
      `I could not give you **Mystic**: ${LET} After that I did not try to take **Valor** ` +
        'away. Nothing was changed.',
    );
    expect(held()).toEqual(['Valor']);
    expect(gateway.said()).toEqual(['give Mystic']);
  });

  it('says so when a role could not be taken away', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.north);
    gateway.refusing = 'no-permission';
    expect(await answer('iamnot', 'North')).toBe(
      `I could not take **North** away: ${LET} Nothing was changed.`,
    );
    expect(held()).toEqual(['North']);
  });

  it.each([
    [
      'two-factor',
      "this server requires two-factor authentication for moderation, and the bot's owner has " +
        'none.',
    ],
    ['no-role', 'the role was deleted a moment ago.'],
    ['no-member', 'Discord says you are no longer a member of this server.'],
  ] as const)('gives the refusal %s a sentence of its own', async (reason, sentence) => {
    const { answer, gateway, entries } = await setup();
    gateway.refusing = reason;
    expect(await answer('iam', 'North')).toBe(
      `I could not give you **North**: ${sentence} Nothing was changed.`,
    );
    expect(entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });
});

describe('what a member is told about a role that cannot be given', () => {
  it('names the role that is in the way of a pick-one group, and why it cannot be taken', async () => {
    const { answer, server, held } = await setup();
    server.member(ALICE, ROLE.valor);
    server.edit(ROLE.valor, { position: 55 });
    expect(await answer('iam', 'Mystic')).toBe(
      '**Mystic** was not given: you hold **Valor** of the group Teams, of which only one can ' +
        'be held, and I cannot take that one away: it is not below my own role. A moderator ' +
        'has to move my role above it.',
    );
    server.edit(ROLE.valor, { position: 5, managed: true });
    expect(await answer('iam', 'Mystic')).toBe(
      '**Mystic** was not given: you hold **Valor** of the group Teams, of which only one can ' +
        'be held, and I cannot take that one away: it is managed by an integration now. A ' +
        'moderator has to take it off the list.',
    );
    expect(held()).toEqual(['Valor']);
  });

  it('does not swap away a role that became one of staff, and takes it when it is given back', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.valor);
    server.edit(ROLE.valor, { name: 'Admin' });
    expect(await answer('iam', 'Mystic')).toBe(
      '**Mystic** was not given: you hold **Admin** of the group Teams, of which only one can ' +
        'be held, and I do not take that one away unasked: it grants more than a self-assigned ' +
        'role may by now. Give it back with `/iamnot` first.',
    );
    expect(gateway.calls).toEqual([]);
    expect(await answer('iamnot', 'admin')).toBe('You no longer have **Admin**.');
    expect(await answer('iam', 'Mystic')).toBe('You have **Mystic** now.');
    expect(held()).toEqual(['Mystic']);
  });

  it('says that a role an integration took over can no longer be handed out', async () => {
    const { answer, server } = await setup();
    server.edit(ROLE.north, { managed: true });
    expect(await answer('iam', 'North')).toBe(
      '**North** can no longer be handed out. A moderator has to take it off the list.',
    );
  });
});
