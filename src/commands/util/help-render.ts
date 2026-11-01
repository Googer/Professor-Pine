import {
  ApplicationCommandOptionType,
  ButtonStyle,
  ComponentType,
  type APIApplicationCommandOption,
  type APIButtonComponentWithCustomId,
  type APIComponentInContainer,
  type APISelectMenuOption,
  type APIStringSelectComponent,
} from 'discord.js';
import type { Settings } from '../../config/settings.js';
import { dateExample } from '../../domain/time/clock-input.js';
import {
  DATE_EXAMPLE,
  subcommandPath,
  type CommandHelp,
  type CommandModule,
  type MessageCommand,
} from '../../discord/command.js';
import { encodeCustomIdIfFits } from '../../discord/custom-id.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { cutText, TEXT_BUDGET } from '../../render/party-post.js';
import { count, fitItems } from '../../render/text.js';
import {
  actionRow,
  container,
  LIST_COLOUR,
  menuRow,
  separator,
  textDisplay,
} from '../../render/v2.js';
import { CATEGORY_LABELS, type HelpCategory } from '../categories.js';

/**
 * What `/help` shows (plan 8B-2): components-v2 messages for the member alone, one page at a
 * time (the overview, a group of commands, one command), with the controls that lead from one
 * to another (`helpControls`, kind `help`).
 */

/** The colour of the edge of a help page: the blue of the lists. */
export const HELP_COLOUR = LIST_COLOUR;

/** The custom-id kind of the controls of a help page. */
export const HELP_KIND = 'help';

/**
 * The custom ids of the controls, by the page they are on (the custom id's id: `overview`,
 * `group`, `command`), the page itself (its action: a category, a command's path) and what the
 * control does (the first argument):
 * - `help:overview:group`: the overview's menu of groups (its value: a category);
 * - `help:group:<category>:command` and `…:command:more`: a group's menus of commands (their
 *   value: a command's name); `help:group:<category>:overview`: "◀ All groups";
 * - `help:command:<path>:back` ("◀" to the command's group, or to the command of a subcommand or
 *   a group of subcommands), `help:command:<path>:overview` ("All groups"), and
 *   `help:command:<path>:subgroup`, the menu of a command's groups of subcommands (its value: a
 *   group's name).
 */
export const HELP_PAGES = { overview: 'overview', group: 'group', command: 'command' } as const;
export const HELP_CONTROLS = {
  group: 'group',
  command: 'command',
  more: 'more',
  overview: 'overview',
  back: 'back',
  subgroup: 'subgroup',
} as const;

/** What a select menu holds at most. */
const MAX_OPTIONS = 25;
/** What an option's label and description hold. */
const OPTION_TEXT = 100;

/**
 * As many whole lines as fit in `limit` characters; when some do not, the last line says how
 * many were left out. A single line longer than the limit is cut.
 */
export function fitLines(lines: readonly string[], limit: number): string {
  const all = lines.join('\n');
  if (all.length <= limit) return all;
  for (let kept = lines.length - 1; kept > 0; kept--) {
    const text = [...lines.slice(0, kept), `…and ${lines.length - kept} more`].join('\n');
    if (text.length <= limit) return text;
  }
  return cutText(lines[0] ?? '', limit);
}

/** A command in a category outside `settings.helpGroups` is for staff. */
export function isStaffCommand(
  command: CommandModule | MessageCommand,
  helpGroups: readonly string[],
): boolean {
  return !helpGroups.includes(command.help.category);
}

/**
 * A command as a help page lists it: a slash command by its name and its other forms (`/hmm` of
 * `/interested`), a message command (plan 8S-2) by the name its menu shows.
 */
export interface HelpEntry {
  /** What `/help command:` takes and a menu's value: the command's name. */
  name: string;
  /** The command's name first, then its other forms. */
  names: string[];
  /** What it does, as the group's line says it. */
  description: string;
  /** A message command: named without a slash, as the Apps menu shows it. */
  onMessage: boolean;
}

/** A group of commands: a help category with what is filed under it. */
export interface HelpGroup {
  category: HelpCategory;
  label: string;
  /** By name. */
  entries: HelpEntry[];
}

/** The slash commands by name, then the message commands by name. */
const byName = (a: HelpEntry, b: HelpEntry) =>
  Number(a.onMessage) - Number(b.onMessage) || a.name.localeCompare(b.name);

/**
 * The groups of commands a member sees, in the order of `helpGroups` and then, for staff, the
 * staff's groups by name. A command's other forms stand on its line, not on their own.
 */
export function helpGroupsOf(
  commands: readonly CommandModule[],
  helpGroups: readonly string[],
  includeStaff: boolean,
  messageCommands: readonly MessageCommand[] = [],
): HelpGroup[] {
  const byCategory = new Map<HelpCategory, HelpEntry[]>();
  const forms = new Map<string, string[]>();
  const listedNames = new Set(commands.map((command) => command.data.name));
  for (const command of commands) {
    if (command.formOf !== undefined && listedNames.has(command.formOf)) {
      forms.set(command.formOf, [...(forms.get(command.formOf) ?? []), command.data.name]);
      continue;
    }
    const list = byCategory.get(command.help.category) ?? [];
    list.push({
      name: command.data.name,
      names: [command.data.name],
      description: command.data.toJSON().description,
      onMessage: false,
    });
    byCategory.set(command.help.category, list);
  }
  for (const command of messageCommands) {
    const list = byCategory.get(command.help.category) ?? [];
    list.push({
      name: command.data.name,
      names: [command.data.name],
      description: command.help.description,
      onMessage: true,
    });
    byCategory.set(command.help.category, list);
  }
  const categories = [...byCategory.keys()];
  const order = [
    ...helpGroups.flatMap((group) => categories.filter((category) => category === group)),
    ...(includeStaff ? categories.filter((c) => !helpGroups.includes(c)).sort() : []),
  ];
  return order.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    entries: (byCategory.get(category) ?? [])
      .map((entry) => ({
        ...entry,
        names: entry.onMessage ? entry.names : [...entry.names, ...(forms.get(entry.name) ?? [])],
      }))
      .sort(byName),
  }));
}

/** `` `/interested` `/hmm` ``, or `**Report to moderators** (Apps menu)`. */
const namesOf = (entry: HelpEntry): string =>
  entry.onMessage
    ? `**${entry.name}** (Apps menu)`
    : entry.names.map((name) => `\`/${name}\``).join(' ');

function select(
  customId: string,
  placeholder: string,
  options: APISelectMenuOption[],
): APIStringSelectComponent {
  return { type: ComponentType.StringSelect, custom_id: customId, placeholder, options };
}

const option = (label: string, value: string, description?: string): APISelectMenuOption => ({
  label: cutText(label, OPTION_TEXT),
  value,
  ...(description ? { description: cutText(description, OPTION_TEXT) } : {}),
});

function button(customId: string, label: string): APIButtonComponentWithCustomId {
  return { type: ComponentType.Button, style: ButtonStyle.Secondary, custom_id: customId, label };
}

/** A custom id of a help control; undefined when it would be too long (then no control). */
function helpId(page: string, which: string, control?: string): string | undefined {
  return encodeCustomIdIfFits({
    kind: HELP_KIND,
    id: page,
    action: which,
    ...(control === undefined ? {} : { args: [control] }),
  });
}

/**
 * The room each of several texts gets of `room` by what it needs: those that need no more than an
 * equal share of what is left get all they need, smallest first, and the others share the rest
 * equally.
 */
export function roomsByNeed(needs: readonly number[], room: number): number[] {
  const rooms = needs.map(() => 0);
  const order = needs.map((need, i) => ({ need, i })).sort((a, b) => a.need - b.need);
  let left = room;
  for (const [k, { need, i }] of order.entries()) {
    const given = Math.min(need, Math.floor(left / (order.length - k)));
    rooms[i] = given;
    left -= given;
  }
  return rooms;
}

const OVERVIEW_HEAD =
  '### Professor Pine commands\n' +
  'Pick a group to see what its commands do, or use `/help command:<name>`.';

/**
 * The overview: every group the member sees with its commands' names (a command's other forms
 * beside it), and a menu that opens a group. The groups get what is left of `TEXT_BUDGET` by
 * need (`roomsByNeed`: the small ones whole, the others sharing the rest); a group whose names
 * do not fit says how many it left out, never cutting a name.
 */
export function renderHelpOverview(groups: readonly HelpGroup[]): V2Message {
  const parts: APIComponentInContainer[] = [textDisplay(OVERVIEW_HEAD)];
  if (groups.length > 0) {
    parts.push(separator());
    const texts = groups.map((group) => ({
      heading: `**${group.label}**\n`,
      names: group.entries.map(namesOf),
    }));
    const rooms = roomsByNeed(
      texts.map((text) => text.heading.length + text.names.join(' · ').length),
      TEXT_BUDGET - OVERVIEW_HEAD.length,
    );
    for (const [i, text] of texts.entries()) {
      const room = (rooms[i] ?? 0) - text.heading.length;
      parts.push(textDisplay(text.heading + fitItems(text.names, room, ' · ')));
    }
    const id = helpId(HELP_PAGES.overview, HELP_CONTROLS.group);
    if (id !== undefined) {
      parts.push(
        separator(),
        menuRow(
          select(
            id,
            'Show a group…',
            groups
              .slice(0, MAX_OPTIONS)
              .map((group) =>
                option(group.label, group.category, count(group.entries.length, 'command')),
              ),
          ),
        ),
      );
    }
  }
  return { v2: true, components: [container(HELP_COLOUR, parts)] };
}

/**
 * A group of commands: its label and how many, a line per command (its names and what it does;
 * "…and N more" when they do not fit), a menu of its commands (a second for those past 25) and
 * "◀ All groups".
 */
export function renderGroupHelp(group: HelpGroup): V2Message {
  const head = `### ${group.label}\n${count(group.entries.length, 'command')}`;
  const lines = group.entries.map((entry) => `${namesOf(entry)} ${entry.description}`);
  const parts: APIComponentInContainer[] = [textDisplay(head), separator()];
  if (lines.length > 0) parts.push(textDisplay(fitLines(lines, TEXT_BUDGET - head.length)));
  const menus = [
    { control: HELP_CONTROLS.command, entries: group.entries.slice(0, MAX_OPTIONS) },
    {
      control: HELP_CONTROLS.more,
      entries: group.entries.slice(MAX_OPTIONS, 2 * MAX_OPTIONS),
    },
  ].filter((menu) => menu.entries.length > 0);
  const rows: APIComponentInContainer[] = [];
  for (const [index, menu] of menus.entries()) {
    const id = helpId(HELP_PAGES.group, group.category, menu.control);
    if (id === undefined) continue;
    rows.push(
      menuRow(
        select(
          id,
          index === 0 ? 'Details of a command…' : 'Details of a command (more)…',
          menu.entries.map((entry) =>
            option(entry.onMessage ? entry.name : `/${entry.name}`, entry.name, entry.description),
          ),
        ),
      ),
    );
  }
  const back = helpId(HELP_PAGES.group, group.category, HELP_CONTROLS.overview);
  if (back !== undefined) rows.push(actionRow([button(back, '◀ All groups')]));
  if (rows.length > 0) parts.push(separator(), ...rows);
  return { v2: true, components: [container(HELP_COLOUR, parts)] };
}

type Option = APIApplicationCommandOption;

function isNested(option: Option): boolean {
  return (
    option.type === ApplicationCommandOptionType.Subcommand ||
    option.type === ApplicationCommandOptionType.SubcommandGroup
  );
}

const childrenOf = (option: Option): readonly Option[] =>
  'options' in option && option.options ? option.options : [];

function usageLine(path: string, options: readonly Option[]): string {
  const args = options.map((o) => ('required' in o && o.required ? `<${o.name}>` : `[${o.name}]`));
  return `\`/${[path, ...args].join(' ')}\``;
}

/** One line per way of using the command; a subcommand's line ends with its description. */
function usageLines(path: string, options: readonly Option[], description?: string): string[] {
  const nested = options.filter(isNested);
  if (nested.length === 0) {
    const line = usageLine(path, options);
    return [description ? `${line} ${description}` : line];
  }
  return nested.flatMap((o) => usageLines(`${path} ${o.name}`, childrenOf(o), o.description));
}

/**
 * What a page of one command may take of the text for its usage and its examples, at most; what
 * it does has the rest.
 */
const USAGE_ROOM = 1_400;
const EXAMPLES_ROOM = 700;

/** Where a command's page leads besides "All groups". */
interface HelpPageControls {
  /** The page's path: `raid`, `admin boss`, `route add`. */
  path: string;
  /** The label of "◀": a group's label, or `/admin`. */
  back: string;
  /** The command's groups of subcommands, for their menu. */
  subgroups?: readonly { name: string; description: string }[];
}

function helpPage(
  title: string,
  description: string,
  help: Pick<CommandHelp, 'details' | 'examples'> | undefined,
  usage: readonly string[],
  settings: Settings,
  controls: HelpPageControls,
): V2Message {
  // `DATE_EXAMPLE` is the date three days from today, in the examples and in what it says.
  const date = dateExample(Date.now(), settings.timezone);
  const said = typeof help?.details === 'function' ? help.details(settings) : help?.details;
  const details = said?.replaceAll(DATE_EXAMPLE, date);
  const usageText = `**Usage**\n${fitLines(usage, USAGE_ROOM)}`;
  const examples = help?.examples?.length
    ? `**Examples**\n${fitLines(
        help.examples.map((example) => `\`${example.replaceAll(DATE_EXAMPLE, date)}\``),
        EXAMPLES_ROOM,
      )}`
    : undefined;
  const howTo = examples === undefined ? usageText : `${usageText}\n${examples}`;
  const about = cutText(
    [`### ${title}`, [description, details].filter(Boolean).join('\n\n')].join('\n'),
    TEXT_BUDGET - howTo.length,
  );
  const parts: APIComponentInContainer[] = [textDisplay(about), separator(), textDisplay(howTo)];
  const rows: APIComponentInContainer[] = [];
  const subgroups = controls.subgroups ?? [];
  const menu = helpId(HELP_PAGES.command, controls.path, HELP_CONTROLS.subgroup);
  if (subgroups.length > 0 && menu !== undefined) {
    rows.push(
      menuRow(
        select(
          menu,
          'Subcommands of a group…',
          subgroups
            .slice(0, MAX_OPTIONS)
            .map((group) =>
              option(`/${controls.path} ${group.name}`, group.name, group.description),
            ),
        ),
      ),
    );
  }
  const back = helpId(HELP_PAGES.command, controls.path, HELP_CONTROLS.back);
  const all = helpId(HELP_PAGES.command, controls.path, HELP_CONTROLS.overview);
  if (back !== undefined && all !== undefined) {
    rows.push(actionRow([button(back, `◀ ${controls.back}`), button(all, 'All groups')]));
  }
  if (rows.length > 0) parts.push(separator(), ...rows);
  return { v2: true, components: [container(HELP_COLOUR, parts)] };
}

/**
 * Help for a command: what it does, a usage line per subcommand, and one per group of
 * subcommands (`/admin boss …` with what the group is for), with a menu of those groups; its
 * examples; "◀" to its group of commands and "All groups".
 */
export function renderCommandHelp(command: CommandModule, settings: Settings): V2Message {
  const json = command.data.toJSON();
  const options = json.options ?? [];
  const groups = options.filter(
    (option) => option.type === ApplicationCommandOptionType.SubcommandGroup,
  );
  const usage = options.flatMap((option) =>
    option.type === ApplicationCommandOptionType.SubcommandGroup
      ? [`\`/${json.name} ${option.name} …\` ${option.description}`]
      : usageLines(json.name, [option]),
  );
  const [first] = groups;
  const hint = first
    ? `Pick a group below, or use \`/help command:${json.name} ${first.name}\`, for the ` +
      'subcommands of a group.'
    : undefined;
  return helpPage(
    `/${json.name}`,
    [json.description, hint].filter(Boolean).join('\n\n'),
    command.help,
    options.some(isNested) ? usage : usageLines(json.name, options),
    settings,
    {
      path: json.name,
      back: CATEGORY_LABELS[command.help.category],
      subgroups: groups.map((group) => ({ name: group.name, description: group.description })),
    },
  );
}

/** How a message command is reached: the Apps menu of a message. */
export function messageCommandUsage(name: string): string {
  return (
    'In the Apps menu of a message: a right-click on a computer, a long press on a phone, then ' +
    `**Apps** › **${name}**.`
  );
}

/**
 * Help for a message command (plan 8S-2): what it does, how it is reached (`messageCommandUsage`),
 * its examples, and "◀" to its group of commands.
 */
export function renderMessageCommandHelp(command: MessageCommand, settings: Settings): V2Message {
  const { name } = command.data;
  return helpPage(
    name,
    command.help.description,
    command.help,
    [messageCommandUsage(name)],
    settings,
    {
      path: name.toLowerCase(),
      back: CATEGORY_LABELS[command.help.category],
    },
  );
}

/**
 * Help for one subcommand (`create`, `boss add`), or for a group of subcommands (`boss`: each
 * of its subcommands with what it does), with "◀" to the command; undefined when the command has
 * none such.
 */
export function renderSubcommandHelp(
  command: CommandModule,
  path: string,
  settings: Settings,
): V2Message | undefined {
  const json = command.data.toJSON();
  const name = `${json.name} ${path}`;
  const controls = { path: name, back: `/${json.name}` };
  const group = (json.options ?? []).find(
    (option) =>
      option.type === ApplicationCommandOptionType.SubcommandGroup && option.name === path,
  );
  if (group) {
    return helpPage(
      `/${name}`,
      group.description,
      undefined,
      usageLines(name, childrenOf(group)),
      settings,
      controls,
    );
  }
  for (const option of (json.options ?? []).filter(isNested)) {
    const candidates =
      option.type === ApplicationCommandOptionType.SubcommandGroup
        ? childrenOf(option).map((sub) => ({ sub, group: option.name }))
        : [{ sub: option, group: null }];
    for (const { sub, group: parent } of candidates) {
      if (subcommandPath(parent, sub.name) !== path) continue;
      return helpPage(
        `/${name}`,
        sub.description,
        command.subcommands?.get(path)?.help,
        [usageLine(name, childrenOf(sub))],
        settings,
        // A subcommand of a group leads back to its group: `/admin boss add` to `/admin boss`.
        parent === null ? controls : { path: name, back: `/${json.name} ${parent}` },
      );
    }
  }
  return undefined;
}
