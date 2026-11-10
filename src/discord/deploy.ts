import {
  ApplicationIntegrationType,
  InteractionContextType,
  Routes,
  type RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js';
import type { CommandModule, MessageCommand } from './command.js';

export const MAX_COMMANDS = 100;
/**
 * Discord allows one command this many characters over its name, its description and those of
 * all its subcommands, options and choices (with the choices' values). `/admin` and `/gym`
 * grow with every plan: a test keeps every command below it.
 */
export const MAX_COMMAND_CHARACTERS = 8_000;

/** Discord allows an application this many message commands (the Apps menu on a message). */
export const MAX_MESSAGE_COMMANDS = 5;

/**
 * What is sent to Discord to register the commands: the slash commands, then the message
 * commands (plan 8S-2). A command that does not say where it may be used is offered in servers
 * only, and installed to servers only: Discord's own default would also offer it in DMs.
 */
export function buildCommandPayload(
  commands: readonly CommandModule[],
  messageCommands: readonly MessageCommand[] = [],
): RESTPostAPIApplicationCommandsJSONBody[] {
  if (commands.length > MAX_COMMANDS) {
    throw new Error(`${commands.length} commands; Discord allows ${MAX_COMMANDS} per application`);
  }
  if (messageCommands.length > MAX_MESSAGE_COMMANDS) {
    throw new Error(
      `${messageCommands.length} message commands; Discord allows ${MAX_MESSAGE_COMMANDS}`,
    );
  }
  const where = <T extends { contexts?: unknown; integration_types?: unknown }>(json: T) => ({
    ...json,
    contexts: json.contexts ?? [InteractionContextType.Guild],
    // Without this, an application with User Install enabled would offer the commands in
    // servers the bot is not in.
    integration_types: json.integration_types ?? [ApplicationIntegrationType.GuildInstall],
  });
  const seen = new Set<string>();
  const slash = commands.map((command) => {
    const json = command.data.toJSON();
    if (seen.has(json.name)) throw new Error(`Duplicate command /${json.name}`);
    seen.add(json.name);
    return where(json);
  });
  // Discord keeps the names of message commands apart from those of slash commands.
  const named = new Set<string>();
  const onMessages = messageCommands.map((command) => {
    const json = command.data.toJSON();
    if (named.has(json.name)) throw new Error(`Duplicate command ${json.name}`);
    named.add(json.name);
    return where(json);
  });
  return [...slash, ...onMessages];
}

/**
 * Where the commands are registered: everywhere (`--global`), in one server (`--guild <id>`), in
 * rehearsal mode in the servers of the database (`--rehearsal`), or taken away
 * from the servers of the database (`--clear-guild`, the end of a rehearsal).
 */
export type DeployTarget =
  | { scope: 'global' }
  | { scope: 'guild'; guildId: string }
  | { scope: 'rehearsal' }
  | { scope: 'clear' };

export function parseDeployArgs(argv: readonly string[]): DeployTarget {
  const usage = new Error(
    'Usage: npm run deploy-commands -- --guild <id> or --global, or --rehearsal or --clear-guild',
  );
  const guildIndex = argv.indexOf('--guild');
  const scopes = [
    guildIndex >= 0,
    argv.includes('--global'),
    argv.includes('--rehearsal'),
    argv.includes('--clear-guild'),
  ];
  if (scopes.filter(Boolean).length !== 1) throw usage;
  if (guildIndex >= 0) {
    const guildId = argv[guildIndex + 1];
    if (!guildId || !/^\d{17,20}$/.test(guildId)) throw usage;
    return { scope: 'guild', guildId };
  }
  if (argv.includes('--global')) return { scope: 'global' };
  return argv.includes('--rehearsal') ? { scope: 'rehearsal' } : { scope: 'clear' };
}

/**
 * The servers a rehearsal's registration (or its removal) goes to: those of the database that
 * the bot is in (`GET /users/@me/guilds`, as the cutover check reads them); the others are named.
 */
export function deployServers(
  databaseServers: readonly string[],
  joined: readonly { id: string; name: string }[],
): { servers: string[]; absent: string[] } {
  const ids = new Set(joined.map((one) => one.id));
  return {
    servers: databaseServers.filter((id) => ids.has(id)),
    absent: databaseServers.filter((id) => !ids.has(id)),
  };
}

/**
 * Sends the registrations one after the other, saying each; one that fails is said and the
 * others go on. Resolves to the exit status: 1 when any failed.
 */
export async function sendDeploy(
  rest: { put(route: `/${string}`, options: { body: unknown }): Promise<unknown> },
  requests: readonly DeployRequest[],
  say: (line: string) => void,
): Promise<number> {
  let failed = 0;
  for (const request of requests) {
    const removing = request.body.length === 0;
    try {
      await rest.put(request.route, { body: request.body });
      say(
        removing
          ? `Removed the commands ${request.what}.`
          : `Registered ${request.body.length} command(s) ${request.what}.`,
      );
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : String(err);
      say(
        `Could not ${removing ? 'remove the commands' : 'register the commands'} ${request.what}: ${reason}`,
      );
    }
  }
  return failed > 0 ? 1 : 0;
}

/** One registration: where, what, and what the deploy script says of it. */
export interface DeployRequest {
  route: `/${string}`;
  body: RESTPostAPIApplicationCommandsJSONBody[];
  what: string;
}

/**
 * What a deploy sends, or why it refuses: while rehearsal mode is on, the commands are
 * registered only as the commands of the servers of the database (`servers`), each as it is;
 * the admin restricts the application to staff and the testers under Server Settings >
 * Integrations (runbook R1), and rehearsal mode answers nobody else. Never for everybody;
 * `--rehearsal` needs the mode. `--clear-guild` takes the commands of those servers away.
 */
export function deployPlan(
  target: DeployTarget,
  options: {
    appId: string;
    body: RESTPostAPIApplicationCommandsJSONBody[];
    rehearsal: boolean;
    servers: readonly string[];
  },
): { ok: true; requests: DeployRequest[] } | { ok: false; refusal: string } {
  const { appId, body, rehearsal, servers } = options;
  const inServers = (commands: RESTPostAPIApplicationCommandsJSONBody[]) =>
    servers.length === 0
      ? ({ ok: false, refusal: 'The database names no server.' } as const)
      : ({
          ok: true,
          requests: servers.map((guildId) => ({
            route: Routes.applicationGuildCommands(appId, guildId),
            body: commands,
            what: `in server ${guildId}`,
          })),
        } as const);
  switch (target.scope) {
    case 'clear':
      return inServers([]);
    case 'rehearsal':
      if (!rehearsal) {
        return {
          ok: false,
          refusal:
            '--rehearsal registers the commands for a rehearsal: it needs rehearsal mode on (settings.rehearsal).',
        };
      }
      // Each command as it is: who sees the application at all is the admin's restriction
      // under Integrations (staff and the testers); an app-level allow does not beat a
      // command's default permission (staging 2026-10-16), so none is added here.
      return inServers(body);
    case 'global':
    case 'guild':
      if (rehearsal) {
        return {
          ok: false,
          refusal:
            'Rehearsal mode is on (settings.rehearsal): deploy with --rehearsal, which registers ' +
            'the commands in the servers of the database only.',
        };
      }
      return {
        ok: true,
        requests: [
          target.scope === 'guild'
            ? {
                route: Routes.applicationGuildCommands(appId, target.guildId),
                body,
                what: `in server ${target.guildId}`,
              }
            : { route: Routes.applicationCommands(appId), body, what: 'everywhere' },
        ],
      };
  }
}
