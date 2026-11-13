import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeChatInput,
  sent,
} from '../../test/support/fake-interactions.js';
import { TestServers, testServerValues } from '../../test/support/server-values.js';
import { createTestContext } from '../../test/support/test-context.js';
import type { ServerValues } from '../config/server-settings.js';
import { commandGroup } from './command-group.js';
import { enabledCommands, type SimpleCommand } from './command.js';
import { InteractionRouter } from './router.js';
import { commandsIn, notSetUpWords } from './set-up.js';
import { Throttles } from './throttle.js';

/** A command that works only where the server notifies its members (plan 19A-1). */
function notifying() {
  const execute = vi.fn(() => Promise.resolve());
  const autocomplete = vi.fn(() => Promise.resolve());
  const command: SimpleCommand = {
    data: { name: 'want', toJSON: () => ({ name: 'want', description: 'Want' }) },
    help: { category: 'notifications' },
    setUpIn: (values) =>
      values.features.notifications ? undefined : 'Staff turn on notifications in /admin settings.',
    throttle: { uses: 1, perSeconds: 60 },
    execute,
    autocomplete,
  };
  return { command, execute, autocomplete };
}

const quiet = (): ServerValues => {
  const values = testServerValues();
  return { ...values, features: { ...values.features, notifications: false } };
};

describe('a command that a server must set up (plan 19A-1)', () => {
  it('is registered whatever any server has set', () => {
    const { ctx } = createTestContext({ servers: new TestServers(quiet()) });
    expect(enabledCommands([notifying().command], ctx.config).map((c) => c.data.name)).toEqual([
      'want',
    ]);
  });

  it('answers in a server where it is not on that staff have not, and counts no use', async () => {
    const { command: want, execute } = notifying();
    const throttles = new Throttles();
    const { ctx } = createTestContext({ servers: new TestServers(quiet()) });
    const router = new InteractionRouter(ctx, [want], [], { throttles });
    const interaction = fakeChatInput({ commandName: 'want' });
    await router.handle(interaction as never);
    // A member is not told of a staff command (review F11).
    expect(sent(interaction.reply).content).toBe(
      'This is not set up in this server. The server’s staff have not turned this on.',
    );
    // Staff are told what to set and where.
    const asStaff = fakeChatInput({ commandName: 'want', roleNames: ['Moderator'] });
    await router.handle(asStaff as never);
    expect(sent(asStaff.reply).content).toBe(
      'This is not set up in this server. Staff turn on notifications in /admin settings.',
    );
    expect(execute).not.toHaveBeenCalled();
    // On in the server: it runs, and its use is the first one counted.
    (ctx.servers as TestServers).values = testServerValues();
    await router.handle(fakeChatInput({ commandName: 'want' }) as never);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('answers its autocomplete with nothing in such a server', async () => {
    const { command: want, autocomplete } = notifying();
    const { ctx } = createTestContext({ servers: new TestServers(quiet()) });
    const router = new InteractionRouter(ctx, [want], []);
    const interaction = fakeAutocomplete({ commandName: 'want' });
    await router.handle(interaction as never);
    expect(autocomplete).not.toHaveBeenCalled();
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it("is left out of the commands of such a server, and a subcommand out of its command's", () => {
    const { ctx } = createTestContext();
    const roles = (values: ServerValues) =>
      values.features.roles ? undefined : 'Staff turn on self-assigned roles in /admin settings.';
    const admin = commandGroup({
      data: new SlashCommandBuilder().setName('admin').setDescription('Admin'),
      help: { category: 'admin' },
      parts: [
        {
          data: new SlashCommandSubcommandBuilder().setName('tutorial').setDescription('T'),
          execute: () => Promise.resolve(),
        },
        {
          data: new SlashCommandSubcommandBuilder().setName('self-roles').setDescription('S'),
          setUpIn: roles,
          execute: () => Promise.resolve(),
        },
      ],
    });
    const values = testServerValues();
    const without = { ...values, features: { ...values.features, roles: false } };
    const subcommands = (list: ReturnType<typeof commandsIn>) =>
      list.flatMap((c) => (c.subcommands ? [...c.subcommands.keys()] : [c.data.name]));
    expect(
      subcommands(commandsIn([notifying().command, admin], values, ctx.config, FAKE_GUILD_ID)),
    ).toEqual(['want', 'tutorial', 'self-roles']);
    expect(
      subcommands(commandsIn([notifying().command, admin], without, ctx.config, FAKE_GUILD_ID)),
    ).toEqual(['want', 'tutorial']);
    expect(
      subcommands(commandsIn([notifying().command, admin], quiet(), ctx.config, FAKE_GUILD_ID)),
    ).toEqual(['tutorial', 'self-roles']);
  });

  it('says what is not set up in one sentence after the other, what to set only to staff', () => {
    expect(notSetUpWords('Staff set the region map link in /admin settings.', true)).toBe(
      'This is not set up in this server. Staff set the region map link in /admin settings.',
    );
    expect(notSetUpWords('Staff set the region map link in /admin settings.', false)).toBe(
      'This is not set up in this server. The server’s staff have not turned this on.',
    );
  });
});
