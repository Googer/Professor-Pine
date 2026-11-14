import { ApplicationCommandOptionType, type APIApplicationCommandOption } from 'discord.js';
import type { ServerValues } from '../config/server-settings.js';
import type { AppContext } from '../app-context.js';
import {
  subcommandPath,
  type CommandHandler,
  type CommandModule,
  type GroupedCommand,
  type LocatedInteraction,
  type SubcommandHandler,
} from './command.js';
import { admittedBy } from './guards.js';

/**
 * Commands that a server must set up (plan 19A-1, `servers.md`): a command or a subcommand whose
 * work depends on a server's values (`CommandHandler.setUpIn`: notifications and self-assigned
 * roles by `features`, `/maps` without the instance's web pages and the server's region map
 * link) is registered for everyone, answers in a server where it is not on what its staff set and
 * where (`notSetUpWords`), and is left out of that server's `/help` and its autocomplete
 * (`commandsIn`). A command that depends on the instance alone keeps `enabled(config)`.
 */
export const NOT_SET_UP = 'This is not set up in this server.';

/**
 * What a command's `setUpIn` may read besides the server's values: the instance's settings and
 * each server's standing (where a server's gym requests go, plan 19C-1: `isTrustedServer`).
 */
export type SetUpContext = Pick<AppContext, 'config' | 'standings'>;

/**
 * What a member is told of anything but what works in a server in setup (plan 19C-2,
 * `CommandHandler.worksInSetup`); staff are told more (`inSetupWords`).
 */
export const IN_SETUP = 'Pine is not set up in this server yet.';

/**
 * What the router answers in a server in setup: to whoever may set it up (`isServerAdmin`), where
 * to go on.
 */
export function inSetupWords(staff: boolean): string {
  return staff ? `${IN_SETUP} Run /admin setup.` : IN_SETUP;
}

/** What a member who is not staff is told after `NOT_SET_UP` (review F11: no staff command named). */
export const NOT_TURNED_ON = 'The server’s staff have not turned this on.';

/**
 * What a member is told of a command that is not set up in the server: then, to staff
 * (`isServerAdmin`, who may use `/admin settings`), what to set and where; to anybody else, that
 * staff have not.
 */
export function notSetUpWords(what: string, staff: boolean): string {
  return `${NOT_SET_UP} ${staff ? what : NOT_TURNED_ON}`;
}

/** What the server must set for this handler, in words; undefined where it may be used. */
export function notSetUpIn(
  handler: Pick<CommandHandler, 'setUpIn'>,
  values: ServerValues,
  ctx: SetUpContext,
  serverId: string,
): string | undefined {
  return handler.setUpIn?.(values, ctx, serverId);
}

/**
 * The commands as a server with these values offers them: without those its values leave off,
 * and a command of subcommands without those of its subcommands (in its definition and among its
 * handlers alike, a group left empty dropped), so that `/help` lists what works there.
 */
export function commandsIn(
  commands: readonly CommandModule[],
  values: ServerValues,
  ctx: SetUpContext,
  serverId: string,
): CommandModule[] {
  return commands.flatMap((command): CommandModule[] =>
    command.subcommands === undefined
      ? notSetUpIn(command, values, ctx, serverId) === undefined
        ? [command]
        : []
      : keptOf(command, (handler) => notSetUpIn(handler, values, ctx, serverId) === undefined),
  );
}

/**
 * The commands that work in a server in setup (plan 19C-2, `worksInSetup`): of a command of
 * subcommands only those that do, so that its `/help` lists what works there.
 */
export function commandsInSetup(commands: readonly CommandModule[]): CommandModule[] {
  return commands.flatMap((command): CommandModule[] =>
    command.subcommands === undefined
      ? command.worksInSetup === true
        ? [command]
        : []
      : keptOf(command, (handler) => handler.worksInSetup === true),
  );
}

/**
 * The commands the member who asks may read about where they ask (plan 19B-1): a command with
 * `seenBy` only where it says yes, and a command of subcommands without those whose `seenBy` says
 * no (`/operator forget` but to the instance operators), in its definition and among its handlers
 * alike. Whether a staff command is shown at all is `/help`'s own rule, before this.
 */
export function commandsSeenBy(
  commands: readonly CommandModule[],
  asker: LocatedInteraction,
  ctx: AppContext,
): CommandModule[] {
  return commands.flatMap((command): CommandModule[] => {
    if (command.seenBy !== undefined && !command.seenBy(asker, ctx)) return [];
    if (command.subcommands === undefined) return [command];
    return keptOf(command, (handler) => handler.seenBy?.(asker, ctx) ?? true);
  });
}

/**
 * The commands the member who asks may read about by their guards (plan 19C-2, C3): a staff
 * command (`isStaff`, `/help`'s rule) only where its guards admit them, and of a command of
 * subcommands only the parts whose guards (the command's, then the part's own) do, in its
 * definition and among its handlers alike (`admittedBy`: the guards that decide by the member;
 * staff by role where none does). Any other command as it is: its guards keep it all the same.
 */
export function commandsAdmitting(
  commands: readonly CommandModule[],
  asker: LocatedInteraction,
  ctx: AppContext,
  isStaff: (command: CommandModule) => boolean,
): CommandModule[] {
  return commands.flatMap((command): CommandModule[] => {
    if (!isStaff(command)) return [command];
    const outer = command.guards ?? [];
    if (command.subcommands === undefined) {
      return admittedBy(outer, asker, ctx) ? [command] : [];
    }
    return keptOf(command, (handler) =>
      admittedBy([...outer, ...(handler.guards ?? [])], asker, ctx),
    );
  });
}

/**
 * A command of subcommands with only those `kept` says yes to (in its definition and among its
 * handlers alike, a group left empty dropped); none where it keeps none.
 */
function keptOf(
  command: GroupedCommand,
  kept: (handler: SubcommandHandler) => boolean,
): GroupedCommand[] {
  const dropped = new Set(
    [...command.subcommands].filter(([, handler]) => !kept(handler)).map(([path]) => path),
  );
  if (dropped.size === 0) return [command];
  if (dropped.size === command.subcommands.size) return [];
  const json = command.data.toJSON();
  const options = (json.options ?? []).flatMap((option): APIApplicationCommandOption[] => {
    if (option.type === ApplicationCommandOptionType.Subcommand) {
      return dropped.has(option.name) ? [] : [option];
    }
    if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
      const left = (option.options ?? []).filter(
        (sub) => !dropped.has(subcommandPath(option.name, sub.name)),
      );
      return left.length === 0 ? [] : [{ ...option, options: left }];
    }
    return [option];
  });
  return [
    {
      ...command,
      data: { name: command.data.name, toJSON: () => ({ ...json, options }) },
      subcommands: new Map([...command.subcommands].filter(([path]) => !dropped.has(path))),
    },
  ];
}
