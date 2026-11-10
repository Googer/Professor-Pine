import {
  ButtonStyle,
  ComponentType,
  type APIButtonComponent,
  type APIComponentInContainer,
  type APISelectMenuOption,
  type APIStringSelectComponent,
} from 'discord.js';
import type { V2Message } from '../discord/party-gateway.js';
import { encodeCustomId } from '../discord/custom-id.js';
import {
  groupRoleIds,
  menuPages,
  nearestPage,
  NONE_VALUE,
  roleMenus,
  type RoleMenu,
} from '../domain/roles/menus.js';
import type { Roster } from '../domain/roles/self-roles.js';
import { cutMarkdown, plain, truncate } from './text.js';
import { actionRow, container, LIST_COLOUR, menuRow, separator, textDisplay } from './v2.js';

/**
 * The custom-id kind of the controls of `/iam` without a role (see `custom-id.ts`):
 * `roles:<group>:pick:<part>:<page>` is a menu, `roles:page:prev|next:<page>` a page button.
 */
export const ROLES_KIND = 'roles';
/** The id part of a menu of the roles without a group. */
export const OTHER_ID = 'other';
/** The id part of the buttons that turn the pages. */
export const PAGE_ID = 'page';
export const PICK_ACTION = 'pick';
export const PREVIOUS_ACTION = 'prev';
export const NEXT_ACTION = 'next';

/** Discord's limits for a select menu. */
const OPTION_LABEL = 100;
const OPTION_DESCRIPTION = 100;
const PLACEHOLDER = 150;

/** The rule of a group, or of a menu of it, as a list and a menu say it. */
export function groupRule(group: { pickOne: boolean }): string {
  return group.pickOne ? 'pick one' : 'any number';
}

function roleMenu(
  menu: RoleMenu,
  roster: Roster,
  held: ReadonlySet<string>,
  page: number,
): APIStringSelectComponent {
  const options: APISelectMenuOption[] = menu.entries.map((entry) => ({
    label: truncate(entry.name, OPTION_LABEL),
    value: entry.role?.id ?? '',
    ...(entry.row.description === null
      ? {}
      : { description: truncate(entry.row.description, OPTION_DESCRIPTION) }),
    default: entry.role !== undefined && held.has(entry.role.id),
  }));
  if (menu.pickOne && menu.group) {
    // A menu of one choice shows one role as chosen, also for a member who holds several.
    let chosen = false;
    for (const option of options) {
      option.default = option.default === true && !chosen;
      chosen ||= option.default;
    }
    const holdsOne = groupRoleIds(roster, menu.group.id).some((id) => held.has(id));
    options.unshift({
      label: 'None',
      value: NONE_VALUE,
      description: truncate(`No role of ${menu.group.name}`, OPTION_DESCRIPTION),
      default: !holdsOne,
    });
  }
  return {
    type: ComponentType.StringSelect,
    custom_id: encodeCustomId({
      kind: ROLES_KIND,
      id: menu.group ? String(menu.group.id) : OTHER_ID,
      action: PICK_ACTION,
      args: [String(menu.part), String(page)],
    }),
    placeholder: truncate(`${menu.title} (${groupRule(menu)})`, PLACEHOLDER),
    min_values: menu.pickOne ? 1 : 0,
    max_values: menu.pickOne ? 1 : options.length,
    options,
  };
}

function pageButtons(page: number, pages: number): APIButtonComponent[] {
  const button = (action: string, label: string, disabled: boolean) => ({
    type: ComponentType.Button as const,
    style: ButtonStyle.Secondary as const,
    label,
    custom_id: encodeCustomId({
      kind: ROLES_KIND,
      id: PAGE_ID,
      action,
      args: [String(page)],
    }),
    disabled,
  });
  return [
    button(PREVIOUS_ACTION, 'Previous', page === 0),
    button(NEXT_ACTION, 'Next', page >= pages - 1),
  ];
}

/** The heading of the message, and the line of help under it. */
const HEADING =
  '### Your roles on this server\nTick and untick them in the menus; a menu takes effect as ' +
  'soon as you close it.';
/** How much of a note (what the last change did) the message shows. */
const NOTE_ROOM = 1_500;
/** What the message says in a server that offers no role at all. */
export const NO_ROLES = 'This server has no roles you can give yourself at the moment.';
/** What a member is told when nothing can be handed out because the bot lacks Manage Roles. */
export const NO_MANAGE_ROLES =
  'I cannot change roles on this server: I lack the Manage Roles permission. A ' +
  'moderator has to give it to my role.';
/** What the message says where roles are offered, but none of them can be given. */
export const NONE_AVAILABLE =
  "None of this server's self-assignable roles can be given at the moment. A moderator can " +
  'see why with `/admin self-roles list`.';

/** Why there is nothing to pick: what a member can do about each differs. */
function nothingToPick(roster: Roster): string {
  if (roster.entries.length === 0) return NO_ROLES;
  return roster.bot.mayManageRoles ? NONE_AVAILABLE : NO_MANAGE_ROLES;
}

/** The rule of a menu as its heading says it. */
const headingRule = (menu: { pickOne: boolean }): string =>
  menu.pickOne ? 'pick one' : 'pick any number';

/**
 * The message with the menus, as a components-v2 message (plan 8B-4): one container of
 * `LIST_COLOUR` with the heading and a line of help, then each menu (one per group, a part of a
 * group that needs several) under its name and rule, the member's own roles ticked; with more
 * than five menus four to a page, "Page 2 of 3" and a row of Previous and Next. Nothing depends
 * on anything but the roster and the roles the member holds, so the same message is made anew
 * after every change and after a restart. `note` is what the change that led here did; it
 * comes last, in small print.
 */
export function renderRoleMenus(
  roster: Roster,
  held: ReadonlySet<string>,
  page: number,
  note?: string,
): V2Message {
  const said = note === undefined || note === '' ? undefined : cutMarkdown(note, NOTE_ROOM);
  const menus = roleMenus(roster);
  if (menus.length === 0) {
    const why = nothingToPick(roster);
    // A change that led here may have said the same already.
    const text = said !== undefined && said.includes(why) ? said : [said, why].filter(Boolean);
    return {
      v2: true,
      components: [container(LIST_COLOUR, [textDisplay([text].flat().join('\n'))])],
    };
  }
  const pages = menuPages(menus);
  const shown = nearestPage(page, pages.length);
  const onPage = pages[shown] ?? [];
  const parts: APIComponentInContainer[] = [textDisplay(HEADING), separator()];
  for (const menu of onPage) {
    parts.push(
      textDisplay(`**${plain(menu.title)}** · ${headingRule(menu)}`),
      menuRow(roleMenu(menu, roster, held, shown)),
    );
  }
  if (pages.length > 1) {
    parts.push(
      textDisplay(`Page ${String(shown + 1)} of ${String(pages.length)}`),
      actionRow(pageButtons(shown, pages.length)),
    );
  }
  if (said !== undefined) parts.push(textDisplay(`-# ${said}`));
  return { v2: true, components: [container(LIST_COLOUR, parts)] };
}
