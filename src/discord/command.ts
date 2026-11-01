import {
  ApplicationCommandOptionType,
  type AnySelectMenuInteraction,
  type APIApplicationCommandOption,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type MessageContextMenuCommandInteraction,
  type ModalSubmitInteraction,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type RESTPostAPIContextMenuApplicationCommandsJSONBody,
} from 'discord.js';
import type { AppContext } from '../app-context.js';
import type { HelpCategory } from '../commands/categories.js';
import type { Config } from '../config/index.js';
import type { Settings } from '../config/settings.js';
import type { CustomId } from './custom-id.js';
import type { Throttle } from './throttle.js';

export type GuardableInteraction =
  ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;

/** Any interaction, for code that only reads where it came from and who sent it. */
export type LocatedInteraction =
  GuardableInteraction | AutocompleteInteraction | MessageContextMenuCommandInteraction;

/** A precondition. Throw a UserError to refuse; return normally to allow. */
export type Guard = (interaction: LocatedInteraction, ctx: AppContext) => void | Promise<void>;

export interface CommandHelp {
  /** Where `/help` files the command. Categories outside settings.helpGroups are staff-only. */
  category: HelpCategory;
  /**
   * What `/help` says below the description; a function of the settings where that depends on
   * what this installation has switched on. `DATE_EXAMPLE` in it is shown as in `examples`.
   */
  details?: string | ((settings: Settings) => string);
  /** Ways to use it; `DATE_EXAMPLE` in one is shown as a date three days from today. */
  examples?: string[];
}

/**
 * Stands for a date in a command's example (`/meet time:${DATE_EXAMPLE} 6:15pm`): `/help` shows
 * it as the date three days from today, month-day (`dateExample`), so that it never goes stale
 * (plan 8X-G, M2).
 */
export const DATE_EXAMPLE = '{date}';

/**
 * How a command is acknowledged: before it runs, for the member alone or for everyone; or
 * `late`, for the member alone and only when it has not answered after a second
 * (`late-reply.ts`).
 */
export type Deferral = 'ephemeral' | 'public' | 'late';

/** What runs for one slash command, or for one subcommand of a grouped command. */
export interface CommandHandler {
  guards?: readonly Guard[];
  /**
   * Set this when `execute` may take more than two seconds (Discord allows three for the first
   * answer). The router then acknowledges before `execute` runs, and `execute` answers with
   * `editReply`. `public` shows "thinking…" to everyone and the answer is public; `ephemeral`
   * shows both to the member only. `late` is for a command whose work is short (a read or a
   * write of the member's own rows): it runs at once, answers with `answer` (`late-reply.ts`)
   * and never with `editReply`, and is acknowledged for the member alone only if that takes
   * longer than a second, so its member does not wait for two requests to Discord where one
   * will do. A command that opens a modal must not defer; one that does
   * so only for some uses gives a function, which is asked after the guards and the throttle
   * and answers undefined for "do not acknowledge".
   */
  defer?:
    | Deferral
    | ((interaction: ChatInputCommandInteraction, ctx: AppContext) => Deferral | undefined);
  /**
   * How often one member may use this. A use counts once the guards have let it through. A
   * function, asked after the guards, for a command whose uses cost more in one place than in
   * another (`/meet` pings a group in a raid and everybody in a train or meetup); each limit it gives
   * is counted by itself.
   */
  throttle?:
    | Throttle
    | ((interaction: ChatInputCommandInteraction, ctx: AppContext) => Throttle | undefined);
  /**
   * For a command that opens a form whose submit counts (`/report`): the window that submit
   * counts in (`as` its command, else this command's own). A use is refused, after the guards,
   * while that window is full, so that nobody types into a form only to be refused; it counts
   * nothing (plan 8S-3).
   */
  checks?: ControlThrottle;
  execute(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction, ctx: AppContext): Promise<void>;
}

/** A SlashCommandBuilder (or anything with the same shape). */
export interface CommandData {
  readonly name: string;
  toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
}

interface CommandBase {
  /**
   * The definition sent to Discord. A command is offered in servers only, unless its definition
   * sets other contexts (`setContexts`), as commands that also work in a DM with the bot do.
   */
  data: CommandData;
  help: CommandHelp;
  /**
   * For a command that needs something optional (an API key, a setting): whether this
   * installation has it. A command that is not enabled is neither registered nor routed.
   */
  enabled?: (config: Config) => boolean;
  /**
   * The command this one is another form of: another name (`/hmm` of `/interested`, `alsoAs`)
   * or a short form (`/great` of `/rank`). Its uses count as that command's (the throttle), and
   * `/help` lists it on that command's line.
   */
  formOf?: string;
}

/** A command without subcommands: `/join`, `/raid`. */
export interface SimpleCommand extends CommandBase, CommandHandler {
  subcommands?: undefined;
  /**
   * For a command some of whose options need something optional (`/raid`'s screenshot): the
   * command as an installation with this configuration offers it.
   */
  forConfig?: (config: Config) => SimpleCommand;
}

export interface SubcommandHandler extends CommandHandler {
  /** Shown by `/help` for this subcommand, in addition to its description. */
  help?: Pick<CommandHelp, 'details' | 'examples'>;
}

/**
 * A command made of subcommands: `/gym create`, `/admin boss add`. Build one with
 * `commandGroup` (command-group.ts), which keeps the definition and the handlers together.
 */
export interface GroupedCommand extends CommandBase {
  /** Guards for every subcommand; they run before the subcommand's own. */
  guards?: readonly Guard[];
  /** Handlers by path: `create`, or `boss add` for subcommand `add` of group `boss`. */
  subcommands: ReadonlyMap<string, SubcommandHandler>;
  /**
   * For a command some of whose subcommands need something optional: the command as an
   * installation with this configuration offers it (see `SubcommandPart.enabled`).
   */
  forConfig?: (config: Config) => GroupedCommand;
}

export type CommandModule = SimpleCommand | GroupedCommand;

/** A ContextMenuCommandBuilder of type Message (or anything with the same shape). */
export interface MessageCommandData {
  readonly name: string;
  toJSON(): RESTPostAPIContextMenuApplicationCommandsJSONBody;
}

/**
 * A message command (plan 8S-2): an entry of Discord's Apps menu on a message (a right-click, or
 * a long press on a phone), which Discord sends with the message it was used on, text included,
 * without any intent. Listed in `messageCommands` (`src/commands/index.ts`) beside the slash
 * commands; the router, the deploy script and `/help` read both lists. Offered in servers only
 * and for server installs only. Its name is what the menu shows (`Report to moderators`), and
 * its throttle and its uses are counted under that name.
 */
export interface MessageCommand {
  target: 'message';
  data: MessageCommandData;
  /** `/help` lists it under its name; a message command has no description of its own. */
  help: CommandHelp & { description: string };
  enabled?: (config: Config) => boolean;
  guards?: readonly Guard[];
  /**
   * How it is acknowledged before it runs (`ephemeral`), or not at all (it answers within three
   * seconds itself, or opens a form, which must come first).
   */
  defer?:
    | 'ephemeral'
    | ((
        interaction: MessageContextMenuCommandInteraction,
        ctx: AppContext,
      ) => 'ephemeral' | undefined);
  throttle?: Throttle;
  /**
   * The window of the form it opens (`CommandHandler.checks`): refused while it is full,
   * counting nothing; `as` names the command whose window it is (`report`).
   */
  checks?: ControlThrottle;
  run(interaction: MessageContextMenuCommandInteraction, ctx: AppContext): Promise<void>;
}

/** Whether a command of the router's list is a message command. */
export function isMessageCommand(
  command: CommandModule | MessageCommand,
): command is MessageCommand {
  return 'target' in command && command.target === 'message';
}

/** The message commands this installation offers. */
export function enabledMessageCommands(
  commands: readonly MessageCommand[],
  config: Config,
): MessageCommand[] {
  return commands.filter((command) => command.enabled?.(config) ?? true);
}

/**
 * The command under another name as well (`/hmm` for `/interested`): the same guards, handlers,
 * throttle and help, its own name, and its own description when one is given. Both names are
 * registered and routed; the uses of either count as the command's.
 */
export function alsoAs(command: SimpleCommand, name: string, description?: string): SimpleCommand {
  const original = command.data.name;
  const { details } = command.help;
  const note = `\`/${name}\` is another name for \`/${original}\`.`;
  const form: SimpleCommand = {
    ...command,
    data: {
      name,
      toJSON: () => ({
        ...command.data.toJSON(),
        name,
        ...(description === undefined ? {} : { description }),
      }),
    },
    help: {
      ...command.help,
      details: (settings) => {
        const own = typeof details === 'function' ? details(settings) : details;
        return own === undefined ? note : `${note}\n\n${own}`;
      },
      // The examples show it used by its own name.
      ...(command.help.examples
        ? {
            examples: command.help.examples.map((example) =>
              example === `/${original}` || example.startsWith(`/${original} `)
                ? `/${name}${example.slice(original.length + 1)}`
                : example,
            ),
          }
        : {}),
    },
    formOf: original,
  };
  const { forConfig } = command;
  return forConfig
    ? { ...form, forConfig: (config) => alsoAs(forConfig(config), name, description) }
    : form;
}

/**
 * The commands this installation offers, each with the subcommands it offers: what the router,
 * `/help` and the deploy script all go by.
 */
export function enabledCommands(
  commands: readonly CommandModule[],
  config: Config,
): CommandModule[] {
  return commands
    .filter((command) => command.enabled?.(config) ?? true)
    .map((command) => command.forConfig?.(config) ?? command);
}

/** The path of a subcommand as the keys of `GroupedCommand.subcommands` spell it. */
export function subcommandPath(group: string | null, subcommand: string | null): string {
  return [group, subcommand].filter(Boolean).join(' ');
}

/** The subcommand paths a command definition declares; empty for a command without any. */
export function declaredSubcommands(
  options: readonly APIApplicationCommandOption[] | undefined,
): string[] {
  return (options ?? []).flatMap((option) => {
    if (option.type === ApplicationCommandOptionType.Subcommand) return [option.name];
    if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
      return (option.options ?? []).map((sub) => subcommandPath(option.name, sub.name));
    }
    return [];
  });
}

/**
 * Handles the buttons, select menus and modals whose custom id has this `kind`. A handler
 * implements only what it puts on screen; anything else with its kind is answered as a control
 * that is no longer active. List every handler in `src/components/index.ts`.
 */
/**
 * The limit of a control. `as` names the command whose window it shares, as the router counts
 * that command's uses (its name, `counters`; a subcommand as `name path`): a control that runs
 * the work of a command that protects an outside service (`/counters`' dialog and Pokebattler)
 * counts together with the command. Without it the control counts in its kind's own window
 * (`component:<kind>`).
 */
export type ControlThrottle = Throttle & { as?: string };

export interface ComponentHandler {
  kind: string;
  guards?: readonly Guard[];
  /**
   * How often one member may use the controls of this kind, all of them together. A use counts
   * once the guards have let it through. A function, asked after the guards, for a kind some of
   * whose controls do the work of a command again and others not (`/counters`: a submitted form
   * runs a new simulation, the button that opens it does not): undefined lets a control through
   * uncounted, and each limit it gives is counted by itself. A limit with `as` is counted in the
   * window of that command instead (`ControlThrottle`). `ctx` is for a limit the settings give
   * (plan 8R-1: "Same task at more stops…" in the window of `/research report`).
   */
  throttle?:
    | Throttle
    | ((
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        id: CustomId,
        ctx: AppContext,
      ) => ControlThrottle | undefined);
  /**
   * For a control that opens a form (Ask the moderators, Appeal): the limit its form is counted
   * by, as `throttle` gives it for the form (undefined for a control that opens none). The press
   * is refused, after the guards and before its own count, while the form's window is full; it
   * counts nothing there (plan 8S-3).
   */
  checks?: (
    interaction: MessageComponentInteraction | ModalSubmitInteraction,
    id: CustomId,
  ) => ControlThrottle | undefined;
  /**
   * For a form whose command counted the use when it opened it (`/meetup`'s): that command's
   * limit and window (`as`), and when the use was counted (`countedAt`, the form's opening).
   * Nothing is counted here, but an unexpected error gives that use back, as the router gives
   * back every use whose work failed (plan 8S-3), to the window it was counted in only.
   * Undefined for a form it knows nothing of (expired, another member's): nothing goes back.
   */
  carriesOn?: (
    interaction: MessageComponentInteraction | ModalSubmitInteraction,
    id: CustomId,
  ) => (ControlThrottle & { countedAt: number }) | undefined;
  button?: (interaction: ButtonInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
  select?: (interaction: AnySelectMenuInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
  modal?: (interaction: ModalSubmitInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
}
