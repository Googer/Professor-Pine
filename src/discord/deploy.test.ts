import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '../../test/support/test-context.js';
import { commands } from '../commands/index.js';
import { enabledCommands, type CommandModule, type MessageCommand } from './command.js';
import {
  buildCommandPayload,
  deployPlan,
  deployServers,
  sendDeploy,
  MAX_COMMAND_CHARACTERS,
  MAX_COMMANDS,
  parseDeployArgs,
} from './deploy.js';

const stub = (name: string): CommandModule => ({
  data: { name, toJSON: () => ({ name, description: name }) },
  help: { category: 'util' },
  execute: () => Promise.resolve(),
});

describe('buildCommandPayload', () => {
  it('serialises the real command list', () => {
    expect(buildCommandPayload(commands).map((c) => c.name)).toContain('help');
  });

  it('offers a command in servers only unless it says otherwise', () => {
    const everywhere: CommandModule = {
      ...stub('rank'),
      data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('PvP rank')
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
    };
    const [raid, rank] = buildCommandPayload([stub('raid'), everywhere]);
    expect(raid?.contexts).toEqual([InteractionContextType.Guild]);
    expect(rank?.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
  });

  it('installs a command to servers only unless it says otherwise', () => {
    const userInstall: CommandModule = {
      ...stub('rank'),
      data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('PvP rank')
        .setIntegrationTypes(ApplicationIntegrationType.UserInstall),
    };
    const [raid, rank] = buildCommandPayload([stub('raid'), userInstall]);
    expect(raid?.integration_types).toEqual([ApplicationIntegrationType.GuildInstall]);
    expect(rank?.integration_types).toEqual([ApplicationIntegrationType.UserInstall]);
  });

  it('registers the message commands beside them, in servers only, five at most', () => {
    const onMessage = (name: string): MessageCommand => ({
      target: 'message',
      data: new ContextMenuCommandBuilder().setName(name).setType(ApplicationCommandType.Message),
      help: { category: 'util', description: name },
      run: () => Promise.resolve(),
    });
    const body = buildCommandPayload([stub('raid')], [onMessage('Report to moderators')]);
    expect(body.map((one) => [one.name, one.type ?? ApplicationCommandType.ChatInput])).toEqual([
      ['raid', ApplicationCommandType.ChatInput],
      ['Report to moderators', ApplicationCommandType.Message],
    ]);
    const [, report] = body;
    expect(report?.contexts).toEqual([InteractionContextType.Guild]);
    expect(report?.integration_types).toEqual([ApplicationIntegrationType.GuildInstall]);
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(onMessage);
    expect(() => buildCommandPayload([], six)).toThrow(/6 message commands; Discord allows 5/);
    expect(() => buildCommandPayload([], [onMessage('a'), onMessage('a')])).toThrow(
      /Duplicate command a/,
    );
  });

  it('offers /help in a DM with the bot as well', () => {
    const help = buildCommandPayload(commands).find((c) => c.name === 'help');
    expect(help?.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
  });

  it('keeps every command within the 8,000 characters Discord allows one command', () => {
    const { ctx } = createTestContext();
    // What Discord counts: every name, description and choice value, over all subcommands.
    const size = (option: {
      name: string;
      description?: string;
      options?: unknown[];
      choices?: { name: string; value: string | number }[];
    }): number =>
      option.name.length +
      (option.description?.length ?? 0) +
      (option.choices ?? []).reduce(
        (sum, choice) => sum + choice.name.length + String(choice.value).length,
        0,
      ) +
      ((option.options ?? []) as Parameters<typeof size>[0][]).reduce(
        (sum, inner) => sum + size(inner),
        0,
      );
    // With everything switched on: the largest each command can be.
    const everything = {
      ...ctx.config,
      settings: {
        ...ctx.config.settings,
        features: { ...ctx.config.settings.features, roles: true, notifications: true },
      },
    };
    const sizes = buildCommandPayload(enabledCommands(commands, everything)).map(
      (command) => [command.name, size(command)] as const,
    );
    expect(sizes.find(([name]) => name === 'gym')?.[1]).toBeGreaterThan(500);
    for (const [name, characters] of sizes) {
      expect(characters, `/${name}`).toBeLessThanOrEqual(MAX_COMMAND_CHARACTERS);
    }
    // The measure counts what it should: a command built to be too large is found.
    const huge = new SlashCommandBuilder().setName('huge').setDescription('x'.repeat(100));
    for (let n = 0; n < 25; n++) {
      huge.addSubcommand((sub) =>
        sub
          .setName(`sub${n}`)
          .setDescription('d'.repeat(100))
          .addStringOption((option) =>
            option
              .setName('choice')
              .setDescription('d'.repeat(100))
              .addChoices({ name: 'n'.repeat(100), value: 'v'.repeat(100) }),
          ),
      );
    }
    expect(size(huge.toJSON())).toBeGreaterThan(MAX_COMMAND_CHARACTERS);
  });

  it('rejects duplicate names', () => {
    expect(() => buildCommandPayload([stub('a'), stub('a')])).toThrow(/Duplicate command \/a/);
  });

  it('rejects more commands than Discord allows', () => {
    const tooMany = Array.from({ length: MAX_COMMANDS + 1 }, (_, i) => stub(`c${i}`));
    expect(() => buildCommandPayload(tooMany)).toThrow(/100/);
  });
});

describe('enabledCommands', () => {
  it('leaves out a command this installation is not set up for', () => {
    const { ctx } = createTestContext();
    const maps: CommandModule = {
      ...stub('maps'),
      enabled: (config) => !!config.settings.regionMapLink,
    };
    const always: CommandModule = { ...stub('find'), enabled: () => true };
    const names = (config: typeof ctx.config) =>
      enabledCommands([stub('raid'), maps, always], config).map((c) => c.data.name);

    const { regionMapLink: _link, ...withoutLink } = ctx.config.settings;
    expect(names({ ...ctx.config, settings: withoutLink })).toEqual(['raid', 'find']);
    const withLink = {
      ...ctx.config,
      settings: { ...ctx.config.settings, regionMapLink: 'https://x.test' },
    };
    expect(names(withLink)).toEqual(['raid', 'maps', 'find']);
  });
});

describe('parseDeployArgs', () => {
  it('parses --guild <id> and --global', () => {
    expect(parseDeployArgs(['--guild', '412345678901234567'])).toEqual({
      scope: 'guild',
      guildId: '412345678901234567',
    });
    expect(parseDeployArgs(['--global'])).toEqual({ scope: 'global' });
  });

  it('requires exactly one scope', () => {
    expect(() => parseDeployArgs([])).toThrow(/--guild <id> or --global/);
    expect(() => parseDeployArgs(['--guild'])).toThrow(/--guild <id> or --global/);
    expect(() => parseDeployArgs(['--guild', '412345678901234567', '--global'])).toThrow(
      /--guild <id> or --global/,
    );
    expect(() => parseDeployArgs(['--rehearsal', '--clear-guild'])).toThrow(/--rehearsal/);
  });

  it('parses --rehearsal and --clear-guild', () => {
    expect(parseDeployArgs(['--rehearsal'])).toEqual({ scope: 'rehearsal' });
    expect(parseDeployArgs(['--clear-guild'])).toEqual({ scope: 'clear' });
  });
});

describe('deployPlan', () => {
  const APP = '400000000000000777';
  const HOME = '412345678901234567';
  const AWAY = '412345678901234568';
  const body = buildCommandPayload([
    stub('raid'),
    {
      ...stub('admin'),
      data: {
        name: 'admin',
        toJSON: () => ({ name: 'admin', description: 'admin', default_member_permissions: '8' }),
      },
    },
  ]);

  it('registers everywhere, or in one server, while rehearsal mode is off', () => {
    expect(
      deployPlan({ scope: 'global' }, { appId: APP, body, rehearsal: false, servers: [] }),
    ).toEqual({
      ok: true,
      requests: [{ route: `/applications/${APP}/commands`, body, what: 'everywhere' }],
    });
    expect(
      deployPlan(
        { scope: 'guild', guildId: HOME },
        { appId: APP, body, rehearsal: false, servers: [] },
      ),
    ).toMatchObject({
      ok: true,
      requests: [{ route: `/applications/${APP}/guilds/${HOME}/commands` }],
    });
  });

  it('refuses to register for all while rehearsal mode is on, and --rehearsal while it is off', () => {
    for (const target of [{ scope: 'global' }, { scope: 'guild', guildId: HOME }] as const) {
      const plan = deployPlan(target, { appId: APP, body, rehearsal: true, servers: [HOME] });
      expect(plan).toMatchObject({
        ok: false,
        refusal: expect.stringMatching(/--rehearsal/) as string,
      });
    }
    expect(
      deployPlan({ scope: 'rehearsal' }, { appId: APP, body, rehearsal: false, servers: [HOME] }),
    ).toMatchObject({ ok: false, refusal: expect.stringMatching(/settings\.rehearsal/) as string });
  });

  it('registers in rehearsal mode in the servers of the database, each command as it is', () => {
    const plan = deployPlan(
      { scope: 'rehearsal' },
      { appId: APP, body, rehearsal: true, servers: [HOME, AWAY] },
    );
    if (!plan.ok) throw new Error(plan.refusal);
    expect(plan.requests.map((request) => request.route)).toEqual([
      `/applications/${APP}/guilds/${HOME}/commands`,
      `/applications/${APP}/guilds/${AWAY}/commands`,
    ]);
    // A member command for everybody the admin lets see the application under Integrations
    // (staging 2026-10-16: an app-level allow does not beat a default permission, so Manage
    // Server on every command shut the testers out); a staff command keeps its own.
    const sentBody = plan.requests[0]?.body ?? [];
    expect(sentBody).toEqual(body);
    expect(sentBody.map((command) => [command.name, command.default_member_permissions])).toEqual([
      ['raid', undefined],
      ['admin', '8'],
    ]);
  });

  it('takes the commands of the servers of the database away with --clear-guild', () => {
    const plan = deployPlan(
      { scope: 'clear' },
      { appId: APP, body, rehearsal: true, servers: [HOME] },
    );
    expect(plan).toEqual({
      ok: true,
      requests: [
        {
          route: `/applications/${APP}/guilds/${HOME}/commands`,
          body: [],
          what: `in server ${HOME}`,
        },
      ],
    });
    expect(
      deployPlan({ scope: 'clear' }, { appId: APP, body, rehearsal: false, servers: [] }),
    ).toMatchObject({
      ok: false,
    });
  });
});

describe('deployServers', () => {
  it('takes the servers of the database that the bot is in, and names those it is not in', () => {
    expect(
      deployServers(
        ['412345678901234567', '412345678901234568'],
        [{ id: '412345678901234568', name: 'Away' }],
      ),
    ).toEqual({ servers: ['412345678901234568'], absent: ['412345678901234567'] });
  });
});

describe('sendDeploy', () => {
  it('sends each registration, says each, and goes on past one that fails', async () => {
    const said: string[] = [];
    const sent: string[] = [];
    const rest = {
      put(route: string): Promise<unknown> {
        sent.push(route);
        return route.includes('412345678901234567')
          ? Promise.reject(new Error('403: Missing Access'))
          : Promise.resolve([]);
      },
    };
    const status = await sendDeploy(
      rest,
      [
        {
          route: '/applications/1/guilds/412345678901234567/commands',
          body: [],
          what: 'in server 412345678901234567',
        },
        {
          route: '/applications/1/guilds/412345678901234568/commands',
          body: [],
          what: 'in server 412345678901234568',
        },
      ],
      (line) => said.push(line),
    );
    expect(status).toBe(1);
    expect(sent).toHaveLength(2);
    expect(said).toEqual([
      'Could not remove the commands in server 412345678901234567: 403: Missing Access',
      'Removed the commands in server 412345678901234568.',
    ]);
  });
});
