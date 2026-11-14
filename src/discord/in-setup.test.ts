import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type Interaction,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeMessageCommand,
  fakeModal,
  sent,
} from '../../test/support/fake-interactions.js';
import { TestServers } from '../../test/support/server-values.js';
import { createTestContext } from '../../test/support/test-context.js';
import { commands } from '../commands/index.js';
import { components } from '../components/index.js';
import { commandGroup } from './command-group.js';
import type { ComponentHandler, MessageCommand, SimpleCommand } from './command.js';
import { InteractionRouter } from './router.js';
import { IN_SETUP } from './set-up.js';
import { Throttles } from './throttle.js';

/** A server set up long ago (the fakes' own) and one that just added Pine (plan 19C-2). */
const SET_UP = FAKE_GUILD_ID;
const NEW = '412345678901234599';
/** The Discord owner of the server in setup, with no staff role. */
const OWNER = '700000000000000050';
const asInteraction = (fake: unknown) => fake as Interaction;

function servers(): TestServers {
  const made = new TestServers();
  made.settingUp.add(NEW);
  return made;
}

function setup() {
  const throttles = new Throttles();
  const { ctx } = createTestContext({ servers: servers() });
  const raid = vi.fn(() => Promise.resolve());
  const raidTyped = vi.fn(() => Promise.resolve());
  const help = vi.fn(() => Promise.resolve());
  const commands: SimpleCommand[] = [
    {
      data: { name: 'raid', toJSON: () => ({ name: 'raid', description: 'Raid' }) },
      help: { category: 'basic-raid' },
      throttle: { uses: 1, perSeconds: 60 },
      execute: raid,
      autocomplete: raidTyped,
    },
    {
      data: { name: 'help', toJSON: () => ({ name: 'help', description: 'Help' }) },
      help: { category: 'util' },
      worksInSetup: true,
      execute: help,
    },
  ];
  const settings = vi.fn(() => Promise.resolve());
  const tutorial = vi.fn(() => Promise.resolve());
  const admin = commandGroup({
    data: new SlashCommandBuilder().setName('admin').setDescription('Admin'),
    help: { category: 'admin' },
    parts: [
      {
        data: new SlashCommandSubcommandBuilder().setName('settings').setDescription('S'),
        worksInSetup: true,
        execute: settings,
      },
      {
        data: new SlashCommandSubcommandBuilder().setName('tutorial').setDescription('T'),
        execute: tutorial,
      },
    ],
  });
  const join = vi.fn(() => Promise.resolve());
  const panel = vi.fn(() => Promise.resolve());
  const panelDialog = vi.fn(() => Promise.resolve());
  const controls: ComponentHandler[] = [
    { kind: 'party', button: join },
    { kind: 'server', worksInSetup: true, button: panel, modal: panelDialog },
  ];
  const report = vi.fn(() => Promise.resolve());
  const onMessage: MessageCommand = {
    target: 'message',
    data: new ContextMenuCommandBuilder()
      .setName('Report to moderators')
      .setType(ApplicationCommandType.Message),
    help: { category: 'util', description: 'Report' },
    run: report,
  };
  const router = new InteractionRouter(ctx, [...commands, admin, onMessage], controls, {
    throttles,
  });
  return {
    ctx,
    router,
    throttles,
    raid,
    raidTyped,
    help,
    settings,
    tutorial,
    join,
    panel,
    panelDialog,
    report,
  };
}

const MEMBER_WORDS = 'Pine is not set up in this server yet.';
const STAFF_WORDS = 'Pine is not set up in this server yet. Run /admin setup.';

describe('a server in setup (plan 19C-2)', () => {
  it('answers a member and staff that Pine is not set up yet, privately, and runs nothing', async () => {
    const { router, raid } = setup();
    const member = fakeChatInput({ commandName: 'raid', guildId: NEW });
    await router.handle(asInteraction(member));
    expect(sent(member.reply)).toMatchObject({
      content: MEMBER_WORDS,
      flags: MessageFlags.Ephemeral,
    });
    expect(IN_SETUP).toBe(MEMBER_WORDS);
    const staff = fakeChatInput({ commandName: 'raid', guildId: NEW, roleNames: ['Admin'] });
    await router.handle(asInteraction(staff));
    expect(sent(staff.reply)).toMatchObject({
      content: STAFF_WORDS,
      flags: MessageFlags.Ephemeral,
    });
    // The server's owner and who may manage it are told so too, without a staff role (S3).
    for (const asked of [
      fakeChatInput({ commandName: 'raid', guildId: NEW, userId: OWNER, guildOwnerId: OWNER }),
      fakeChatInput({
        commandName: 'raid',
        guildId: NEW,
        permissions: PermissionFlagsBits.ManageGuild,
      }),
    ]) {
      await router.handle(asInteraction(asked));
      expect(sent(asked.reply).content).toBe(STAFF_WORDS);
    }
    expect(raid).not.toHaveBeenCalled();
    // The server set up runs it.
    await router.handle(asInteraction(fakeChatInput({ commandName: 'raid', guildId: SET_UP })));
    expect(raid).toHaveBeenCalledTimes(1);
  });

  it('counts no use of what it refuses', async () => {
    const { router, raid, ctx } = setup();
    await router.handle(asInteraction(fakeChatInput({ commandName: 'raid', guildId: NEW })));
    // Set up now: the first use is the first one counted (a limit of one a minute).
    (ctx.servers as TestServers).settingUp.delete(NEW);
    const first = fakeChatInput({ commandName: 'raid', guildId: NEW });
    await router.handle(asInteraction(first));
    expect(raid).toHaveBeenCalledTimes(1);
  });

  it('runs /help, and of a command of subcommands only those that work in setup', async () => {
    const { router, help, settings, tutorial } = setup();
    await router.handle(asInteraction(fakeChatInput({ commandName: 'help', guildId: NEW })));
    expect(help).toHaveBeenCalledTimes(1);
    const asked = fakeChatInput({
      commandName: 'admin',
      subcommand: 'settings',
      guildId: NEW,
      roleNames: ['Admin'],
    });
    await router.handle(asInteraction(asked));
    expect(settings).toHaveBeenCalledTimes(1);
    const other = fakeChatInput({
      commandName: 'admin',
      subcommand: 'tutorial',
      guildId: NEW,
      roleNames: ['Admin'],
    });
    await router.handle(asInteraction(other));
    expect(tutorial).not.toHaveBeenCalled();
    expect(sent(other.reply).content).toBe(STAFF_WORDS);
  });

  it('runs the controls and dialogs of a kind that works in setup, and refuses any other', async () => {
    const { router, join, panel, panelDialog } = setup();
    const pressed = fakeButton({ customId: 'party:1:join', guildId: NEW });
    await router.handle(asInteraction(pressed));
    expect(join).not.toHaveBeenCalled();
    expect(sent(pressed.reply).content).toBe(MEMBER_WORDS);
    await router.handle(
      asInteraction(
        fakeButton({ customId: 'server:panel:show', guildId: NEW, roleNames: ['Admin'] }),
      ),
    );
    expect(panel).toHaveBeenCalledTimes(1);
    await router.handle(
      asInteraction(
        fakeModal({ customId: 'server:timezone:set', guildId: NEW, roleNames: ['Admin'] }),
      ),
    );
    expect(panelDialog).toHaveBeenCalledTimes(1);
    // In the server set up, every control runs.
    await router.handle(asInteraction(fakeButton({ customId: 'party:1:join', guildId: SET_UP })));
    expect(join).toHaveBeenCalledTimes(1);
  });

  it('answers the autocomplete of what does not work in setup with nothing', async () => {
    const { router, raidTyped } = setup();
    const typing = fakeAutocomplete({ commandName: 'raid', guildId: NEW });
    await router.handle(asInteraction(typing));
    expect(raidTyped).not.toHaveBeenCalled();
    expect(typing.respond).toHaveBeenCalledWith([]);
    await router.handle(asInteraction(fakeAutocomplete({ commandName: 'raid', guildId: SET_UP })));
    expect(raidTyped).toHaveBeenCalledTimes(1);
  });

  it('refuses the Apps menu on a message', async () => {
    const { router, report } = setup();
    const used = fakeMessageCommand({ guildId: NEW });
    await router.handle(asInteraction(used));
    expect(report).not.toHaveBeenCalled();
    expect(sent(used.reply).content).toBe(MEMBER_WORDS);
  });

  it('is no server in a direct message', async () => {
    const { router, raid } = setup();
    await router.handle(asInteraction(fakeChatInput({ commandName: 'raid', guildId: null })));
    expect(raid).toHaveBeenCalledTimes(1);
  });

  it('lets through only /help, /admin settings, /region import and /region edit', () => {
    const paths = commands.flatMap((command) =>
      command.subcommands === undefined
        ? command.worksInSetup === true
          ? [command.data.name]
          : []
        : [...command.subcommands]
            .filter(([, handler]) => handler.worksInSetup === true)
            .map(([path]) => `${command.data.name} ${path}`),
    );
    expect(paths.sort()).toEqual(['admin settings', 'help', 'region edit', 'region import'].sort());
    expect(
      components
        .filter((handler) => handler.worksInSetup === true)
        .map((handler) => handler.kind)
        .sort(),
    ).toEqual(['help', 'region', 'server'].sort());
  });
});
