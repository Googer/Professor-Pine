import { ApplicationCommandOptionType, type APIApplicationCommandOption } from 'discord.js';
import type { Config } from '../config/index.js';
import type { ServerValues } from '../config/server-settings.js';
import {
  subcommandPath,
  type CommandHandler,
  type CommandModule,
  type GroupedCommand,
} from './command.js';

/**
 * Commands that a server must set up (plan 19A-1, `servers.md`): a command or a subcommand whose
 * work depends on a server's values (`CommandHandler.setUpIn`: notifications and self-assigned
 * roles by `features`, `/maps` without the instance's web pages and the server's region map
 * link) is registered for everyone, answers in a server where it is not on what its staff set and
 * where (`notSetUpWords`), and is left out of that server's `/help` and its autocomplete
 * (`commandsIn`). A command that depends on the instance alone keeps `enabled(config)`.
 */
export const NOT_SET_UP = 'This is not set up in this server.';

/** What a member who is not staff is told after `NOT_SET_UP` (review F11: no staff command named). */
export const NOT_TURNED_ON = 'The server’s staff have not turned this on.';

/**
 * What a member is told of a command that is not set up in the server: then, to staff
 * (`isBotStaff`), what to set and where; to anybody else, that staff have not.
 */
export function notSetUpWords(what: string, staff: boolean): string {
  return `${NOT_SET_UP} ${staff ? what : NOT_TURNED_ON}`;
}

/** What the server must set for this handler, in words; undefined where it may be used. */
export function notSetUpIn(
  handler: Pick<CommandHandler, 'setUpIn'>,
  values: ServerValues,
  config: Config,
): string | undefined {
  return handler.setUpIn?.(values, config);
}

/**
 * The commands as a server with these values offers them: without those its values leave off,
 * and a command of subcommands without those of its subcommands (in its definition and among its
 * handlers alike, a group left empty dropped), so that `/help` lists what works there.
 */
export function commandsIn(
  commands: readonly CommandModule[],
  values: ServerValues,
  config: Config,
): CommandModule[] {
  return commands.flatMap((command): CommandModule[] => {
    if (command.subcommands === undefined) {
      return notSetUpIn(command, values, config) === undefined ? [command] : [];
    }
    const dropped = new Set(
      [...command.subcommands]
        .filter(([, handler]) => notSetUpIn(handler, values, config) !== undefined)
        .map(([path]) => path),
    );
    if (dropped.size === 0) return [command];
    if (dropped.size === command.subcommands.size) return [];
    const json = command.data.toJSON();
    const options = (json.options ?? []).flatMap((option): APIApplicationCommandOption[] => {
      if (option.type === ApplicationCommandOptionType.Subcommand) {
        return dropped.has(option.name) ? [] : [option];
      }
      if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
        const kept = (option.options ?? []).filter(
          (sub) => !dropped.has(subcommandPath(option.name, sub.name)),
        );
        return kept.length === 0 ? [] : [{ ...option, options: kept }];
      }
      return [option];
    });
    const narrowed: GroupedCommand = {
      ...command,
      data: { name: command.data.name, toJSON: () => ({ ...json, options }) },
      subcommands: new Map([...command.subcommands].filter(([path]) => !dropped.has(path))),
    };
    return [narrowed];
  });
}
