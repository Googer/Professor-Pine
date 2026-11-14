import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeChatInput, type FakeOptions } from '../../test/support/fake-interactions.js';
import { createTestContext } from '../../test/support/test-context.js';
import type { GroupedCommand, LocatedInteraction } from '../discord/command.js';
import { commandGroup, type SubcommandPart } from '../discord/command-group.js';
import { UserError } from '../discord/errors.js';
import { BOT_STAFF_ONLY, SERVER_ADMIN_ONLY } from '../discord/guards.js';
import { admin } from './admin/index.js';
import { region } from './regions/index.js';
import { staffParts } from './staff-parts.js';

const USER = '700000000000000005';

/** What the guards of a subcommand (the command's, then its own) answer a member; undefined: let through. */
async function refusal(
  command: GroupedCommand,
  path: string,
  member: FakeOptions,
): Promise<string | undefined> {
  const { ctx } = createTestContext();
  const part = command.subcommands.get(path);
  if (part === undefined) throw new Error(`no /${command.data.name} ${path}`);
  const interaction = fakeChatInput({ commandName: command.data.name, userId: USER, ...member });
  try {
    for (const guard of [...(command.guards ?? []), ...(part.guards ?? [])]) {
      await guard(interaction as unknown as LocatedInteraction, ctx);
    }
    return undefined;
  } catch (err) {
    if (err instanceof UserError) return err.message;
    throw err;
  }
}

/** The parts that set a server up (plan 19C-2): for its owner and who may manage it too. */
const SETUP: Record<string, readonly string[]> = {
  admin: ['setup', 'settings', 'setup-forums'],
  region: ['import', 'edit'],
};

const MANAGER: FakeOptions = { roleNames: [], permissions: PermissionFlagsBits.ManageGuild };
const OWNER_OF_SERVER: FakeOptions = { roleNames: [], guildOwnerId: USER };
const NOBODY: FakeOptions = { roleNames: ['Raider'] };
const STAFF: FakeOptions = { roleNames: ['Moderator'] };

describe('staffParts', () => {
  it('guards a part with no guard of its own for staff, and a setup part for whoever may set the server up', async () => {
    const part = (name: string): SubcommandPart => ({
      data: new SlashCommandSubcommandBuilder().setName(name).setDescription(name),
      execute: () => Promise.resolve(),
    });
    const added = part('added');
    const setup = part('first');
    const command = commandGroup({
      data: new SlashCommandBuilder().setName('staffed').setDescription('A staff command'),
      help: { category: 'admin' },
      parts: staffParts([setup, added], [setup]),
    });
    expect(await refusal(command, 'added', MANAGER)).toBe(BOT_STAFF_ONLY);
    expect(await refusal(command, 'added', STAFF)).toBeUndefined();
    expect(await refusal(command, 'first', MANAGER)).toBeUndefined();
    expect(await refusal(command, 'first', NOBODY)).toBe(SERVER_ADMIN_ONLY);
  });
});

describe.each([admin, region])('who may use /$data.name', (command) => {
  const name = command.data.name;
  const paths = [...command.subcommands.keys()];

  it('lets whoever may set the server up use the setup parts, and refuses them every other', async () => {
    for (const member of [MANAGER, OWNER_OF_SERVER]) {
      for (const path of paths) {
        const said = await refusal(command, path, member);
        if (SETUP[name]?.includes(path) === true) expect(said, path).toBeUndefined();
        else expect(said, path).toBe(BOT_STAFF_ONLY);
      }
    }
  });

  it('refuses a member who is neither staff nor may manage the server every part', async () => {
    for (const path of paths) {
      expect(await refusal(command, path, NOBODY), path).toBe(
        SETUP[name]?.includes(path) === true ? SERVER_ADMIN_ONLY : BOT_STAFF_ONLY,
      );
    }
  });

  it('lets staff by role use every part', async () => {
    for (const path of paths) expect(await refusal(command, path, STAFF), path).toBeUndefined();
  });
});
