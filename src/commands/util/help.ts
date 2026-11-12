import {
  ApplicationCommandOptionType,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import {
  declaredSubcommands,
  type CommandModule,
  type ComponentHandler,
  type MessageCommand,
  type SimpleCommand,
} from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { isBotManagement, memberRoleNames } from '../../discord/guards.js';
import { v2Answer } from '../../discord/late-reply.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
import {
  HELP_CONTROLS,
  HELP_KIND,
  HELP_PAGES,
  helpGroupsOf,
  isStaffCommand,
  renderCommandHelp,
  renderGroupHelp,
  renderHelpOverview,
  renderMessageCommandHelp,
  renderSubcommandHelp,
  type HelpGroup,
} from './help-render.js';
import { serverValuesOf } from '../../discord/server-values.js';

const MAX_CHOICES = 25;

/** What was typed as a command name: `/Gym  Create ` is `gym create`. */
function normalise(text: string): string {
  return text.trim().replace(/^\//, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

type Asker = Parameters<typeof memberRoleNames>[0];

function isStaff(interaction: Asker, ctx: AppContext): boolean {
  return isBotManagement(
    memberRoleNames(interaction),
    interaction.user.id,
    ctx.config.env.OWNER_ID,
  );
}

/** The commands a member may read about: staff commands are shown to staff only. */
function visibleCommands(staff: boolean, ctx: AppContext): readonly CommandModule[] {
  return staff
    ? ctx.commands
    : ctx.commands.filter((c) => !isStaffCommand(c, ctx.config.settings.helpGroups));
}

/** The message commands a member may read about: staff ones are shown to staff only. */
function visibleMessageCommands(staff: boolean, ctx: AppContext): readonly MessageCommand[] {
  return staff
    ? ctx.messageCommands
    : ctx.messageCommands.filter((c) => !isStaffCommand(c, ctx.config.settings.helpGroups));
}

/** The message command of this name (`normalise`d, as `/help` reads what was typed). */
function messageCommandNamed(
  path: string,
  staff: boolean,
  ctx: AppContext,
): MessageCommand | undefined {
  return visibleMessageCommands(staff, ctx).find((c) => normalise(c.data.name) === path);
}

/** What a member is told of a command they cannot see or that does not exist. */
const noCommand = (asked: string): UserError =>
  new UserError(TOLD_INSTEAD.get(asked) ?? `There is no /${asked} command.`);

/**
 * What a member is told who asks for a command that is no longer theirs (plan 8S-2: `/delete` is
 * for staff, members use `/report`), without saying that it exists for others.
 */
const TOLD_INSTEAD: ReadonlyMap<string, string> = new Map([
  [
    'delete',
    'There is no /delete command for members: to tell the moderators about a raid, max battle, ' +
      'train or meetup, use `/report` in its post.',
  ],
]);

/**
 * The page of a command, a subcommand or a group of subcommands (`raid`, `route add`, `admin
 * boss`) as the member who asks may see it; a staff command is answered to anybody else exactly
 * as one that does not exist.
 */
function commandPage(
  path: string,
  staff: boolean,
  ctx: AppContext,
  where: { guildId: string | null },
): V2Message {
  const onMessage = messageCommandNamed(normalise(path), staff, ctx);
  if (onMessage) return renderMessageCommandHelp(onMessage, ctx.config.settings);
  const [name = '', ...rest] = path.split(' ');
  const command = visibleCommands(staff, ctx).find((c) => c.data.name === name);
  // What the help may depend on besides the settings (`HelpFacts`).
  const facts = {
    oldHistory: ctx.legacyIndex !== undefined,
    server: serverValuesOf(where, ctx),
  };
  const page =
    command &&
    (rest.length === 0
      ? renderCommandHelp(command, ctx.config.settings, facts)
      : renderSubcommandHelp(command, rest.join(' '), ctx.config.settings, facts));
  if (!page) throw noCommand(path);
  return page;
}

/** The groups of commands the member sees. */
function groupsFor(staff: boolean, ctx: AppContext): HelpGroup[] {
  return helpGroupsOf(
    visibleCommands(staff, ctx),
    ctx.config.settings.helpGroups,
    staff,
    visibleMessageCommands(staff, ctx),
  );
}

/** The page of one group of commands, if the member sees it. */
function groupPage(category: string, staff: boolean, ctx: AppContext): V2Message {
  const group = groupsFor(staff, ctx).find((each) => each.category === category);
  if (!group) throw new UserError('There is no such group of commands.');
  return renderGroupHelp(group);
}

export const help: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show what Professor Pine can do')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .addStringOption((option) =>
      option
        .setName('command')
        .setDescription('The command to explain')
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'util',
    details:
      'Without a command, lists the groups of commands you can use: pick one to see what its ' +
      'commands do, and a command to see how it is used. With a command, explains it. Only ' +
      'you see the answer.',
    examples: [
      '/help',
      '/help command:raid',
      '/help command:route add',
      '/help command:route saved',
    ],
  },

  async execute(interaction, ctx) {
    const staff = isStaff(interaction, ctx);
    const asked = normalise(interaction.options.getString('command') ?? '');
    const page =
      asked === ''
        ? renderHelpOverview(groupsFor(staff, ctx))
        : commandPage(asked, staff, ctx, interaction);
    await interaction.reply({
      ...v2Answer(page),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  },

  async autocomplete(interaction, ctx) {
    const typed = normalise(interaction.options.getFocused());
    const staff = isStaff(interaction, ctx);
    const slashNames = visibleCommands(staff, ctx).flatMap((command) => {
      const { options } = command.data.toJSON();
      const groups = (options ?? []).flatMap((option) =>
        option.type === ApplicationCommandOptionType.SubcommandGroup ? [option.name] : [],
      );
      return [
        command.data.name,
        ...[...groups, ...declaredSubcommands(options)].map(
          (path) => `${command.data.name} ${path}`,
        ),
      ];
    });
    // A message command by the name its menu shows, without a slash.
    const names = [
      ...slashNames.map((name) => ({ name: `/${name}`, value: name })),
      ...visibleMessageCommands(staff, ctx).map((c) => ({ name: c.data.name, value: c.data.name })),
    ];
    const key = (choice: { value: string }) => normalise(choice.value);
    const startsFirst = (a: { value: string }, b: { value: string }) =>
      Number(!key(a).startsWith(typed)) - Number(!key(b).startsWith(typed)) ||
      key(a).localeCompare(key(b));
    const choices = names
      .filter((choice) => key(choice).includes(typed))
      .sort(startsFirst)
      .slice(0, MAX_CHOICES);
    await interaction.respond(choices);
  },
};

/**
 * The controls of a help page (custom ids in `help-render.ts`, `HELP_PAGES`): every press shows
 * another page in the place of the one it was on (`update`; a help page is the member's alone).
 * Who is staff is asked anew with every press, so a staff page reached otherwise is answered as
 * one that does not exist.
 */
export const helpControls: ComponentHandler = {
  kind: HELP_KIND,
  throttle: MEMBER_READ_THROTTLE,
  async button(interaction, id, ctx) {
    const staff = isStaff(interaction, ctx);
    const [control] = id.args;
    let page: V2Message;
    if (control === HELP_CONTROLS.overview) {
      page = renderHelpOverview(groupsFor(staff, ctx));
    } else if (id.id === HELP_PAGES.command && control === HELP_CONTROLS.back) {
      const onMessage = messageCommandNamed(id.action, staff, ctx);
      const words = id.action.split(' ');
      const [name = ''] = words;
      if (onMessage) {
        page = groupPage(onMessage.help.category, staff, ctx);
      } else if (words.length > 1) {
        // One level up: `/admin boss add` to `/admin boss`, `/route add` to `/route`.
        page = commandPage(words.slice(0, -1).join(' '), staff, ctx, interaction);
      } else {
        const command = visibleCommands(staff, ctx).find((c) => c.data.name === name);
        if (!command) throw noCommand(name);
        page = groupPage(command.help.category, staff, ctx);
      }
    } else {
      throw new UserError(STALE_COMPONENT);
    }
    await interaction.update(v2Answer(page));
  },
  async select(interaction, id, ctx) {
    const staff = isStaff(interaction, ctx);
    const [value] = interaction.values;
    const [control] = id.args;
    if (value === undefined) throw new UserError(STALE_COMPONENT);
    let page: V2Message;
    if (id.id === HELP_PAGES.overview && id.action === HELP_CONTROLS.group) {
      page = groupPage(value, staff, ctx);
    } else if (
      id.id === HELP_PAGES.group &&
      (control === HELP_CONTROLS.command || control === HELP_CONTROLS.more)
    ) {
      page = commandPage(value, staff, ctx, interaction);
    } else if (id.id === HELP_PAGES.command && control === HELP_CONTROLS.subgroup) {
      page = commandPage(`${id.action} ${value}`, staff, ctx, interaction);
    } else {
      throw new UserError(STALE_COMPONENT);
    }
    await interaction.update(v2Answer(page));
  },
};
