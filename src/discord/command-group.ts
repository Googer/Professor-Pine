import {
  ApplicationCommandOptionType,
  SlashCommandSubcommandGroupBuilder,
  type APIApplicationCommandOption,
  type SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { Config } from '../config/index.js';
import {
  subcommandPath,
  type CommandHelp,
  type GroupedCommand,
  type Guard,
  type SubcommandHandler,
} from './command.js';

/** One subcommand: its definition and what runs for it, kept in one place. */
export interface SubcommandPart extends SubcommandHandler {
  /** The subcommand group it belongs to: `boss` for `/admin boss add`. */
  group?: string;
  data: SlashCommandSubcommandBuilder;
  /**
   * For a subcommand that needs something optional (a setting): whether this installation has
   * it. One that is not enabled is neither registered nor routed (`GroupedCommand.forConfig`).
   */
  enabled?: (config: Config) => boolean;
}

export interface CommandGroupDefinition {
  /** Name, description, permissions and contexts of the command; the subcommands are added. */
  data: SlashCommandBuilder;
  help: CommandHelp;
  /** Guards for every subcommand; they run before a subcommand's own. */
  guards?: readonly Guard[];
  /** Whether this installation offers the command at all; see `CommandModule.enabled`. */
  enabled?: (config: Config) => boolean;
  /** Subcommand groups by name, with the description Discord shows for each. */
  groups?: Readonly<Record<string, string>>;
  parts: readonly SubcommandPart[];
}

/**
 * Builds a command of subcommands from its parts, so that a subcommand's definition and its
 * handler cannot drift apart and several files can contribute to one command (`/admin`).
 * Subcommands keep the order of `parts`; groups come after them, in the order of `groups`.
 * The builder passed as `data` is consumed (the subcommands are added to it), so it must not be
 * shared between two calls.
 */
export function commandGroup(definition: CommandGroupDefinition): GroupedCommand {
  const { data, help, guards, enabled, parts } = definition;
  const groups = new Map(
    Object.entries(definition.groups ?? {}).map(([name, description]) => [
      name,
      new SlashCommandSubcommandGroupBuilder().setName(name).setDescription(description),
    ]),
  );
  const used = new Set<string>();
  const subcommands = new Map<string, SubcommandHandler>();
  for (const { group = null, data: subcommand, enabled: _enabled, ...handler } of parts) {
    const path = subcommandPath(group, subcommand.name);
    if (subcommands.has(path)) throw new Error(`Duplicate subcommand /${data.name} ${path}`);
    if (group === null) {
      data.addSubcommand(subcommand);
    } else {
      const builder = groups.get(group);
      if (!builder) throw new Error(`/${data.name} ${path}: no group "${group}" is defined`);
      builder.addSubcommand(subcommand);
      used.add(group);
    }
    subcommands.set(path, handler);
  }
  for (const [name, builder] of groups) {
    // Discord refuses a group without subcommands.
    if (!used.has(name)) throw new Error(`/${data.name}: group "${name}" has no subcommands`);
    data.addSubcommandGroup(builder);
  }
  if (subcommands.size === 0) throw new Error(`/${data.name} has no subcommands`);
  const command: GroupedCommand = {
    data,
    help,
    ...(guards ? { guards } : {}),
    ...(enabled ? { enabled } : {}),
    subcommands,
  };
  if (!parts.some((part) => part.enabled)) return command;
  const narrowing: GroupedCommand = {
    ...command,
    forConfig: (config) => withoutDisabled(narrowing, parts, config),
  };
  return narrowing;
}

/**
 * The command as an installation with this configuration offers it: without the subcommands
 * whose `enabled` says no, in the definition and among the handlers alike, and without a group
 * that is left empty.
 */
function withoutDisabled(
  command: GroupedCommand,
  parts: readonly SubcommandPart[],
  config: Config,
): GroupedCommand {
  const dropped = new Set(
    parts
      .filter((part) => part.enabled && !part.enabled(config))
      .map((part) => subcommandPath(part.group ?? null, part.data.name)),
  );
  if (dropped.size === 0) return command;
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
  const subcommands = new Map([...command.subcommands].filter(([path]) => !dropped.has(path)));
  if (subcommands.size === 0) {
    throw new Error(`/${command.data.name} has no subcommands left in this configuration`);
  }
  return {
    ...command,
    data: { name: command.data.name, toJSON: () => ({ ...json, options }) },
    subcommands,
  };
}
