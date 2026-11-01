import {
  ButtonStyle,
  ComponentType,
  type APIButtonComponentWithCustomId,
  type APIComponentInContainer,
} from 'discord.js';
import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
import type { V2Message } from '../discord/party-gateway.js';
import { cutText, TEXT_BUDGET } from './party-post.js';
import { count } from './text.js';
import { actionRow, container, LIST_COLOUR, section, separator, textDisplay } from './v2.js';

/**
 * A list a member manages by themself, shown to them alone (`/wants`, `/targets`): one
 * components-v2 message of a page of items, each with a Remove button beside it, the buttons
 * that turn the pages and the one that asks to remove them all.
 */

/** As many items as a page shows: ten sections of three components and the rest stay within 40. */
export const LIST_PAGE = 10;

/** The actions of the controls of a list (the custom id's id is the page shown, from 0). */
export const LIST_ACTIONS = { prev: 'prev', next: 'next', remove: 'remove', all: 'all' } as const;

/** One entry of a list. */
export interface ListItem {
  /**
   * The line of the entry (Markdown) in at most `room` characters: the entry keeps within it
   * itself, cutting what can be long (a name) before it is escaped, so no cut leaves a markup or
   * an escape half done. The list cuts only a line that breaks this (`cutText`, a backstop).
   */
  line(room: number): string;
  /** The custom id's arguments that name what Remove takes off (a want token's parts, a gym id). */
  removeArgs: string[];
  /**
   * A button of its own instead of the red Remove (plan 8R-4: Manage… of a line of `/wants`): its
   * action, label and style, the custom id's arguments, and the command that does the same where
   * its id would not fit.
   */
  button?: {
    action: string;
    label: string;
    style: APIButtonComponentWithCustomId['style'];
    args: string[];
    command: string;
  };
}

/** What a list shows, besides its entries. */
export interface ListView {
  /** The custom-id kind of its controls (`wantlist`, `targetlist`). */
  kind: string;
  /** `### Your wants in Pine Test`. */
  heading: string;
  /** What an entry is called, one and several: `['want', 'wants']`, `['gym', 'gyms']`. */
  noun: readonly [string, string];
  items: readonly ListItem[];
  /** The page asked for, from 0; one past the end shows the last. */
  page: number;
  /** Lines under the count that are about the whole list (entries this version cannot read). */
  notes?: readonly string[];
  /**
   * A note at the top, under the heading (plan 8R-4: what a Submit of a dialog opened from the
   * list changed).
   */
  notice?: string;
  /** The small print at the end: `` `/want` adds one. `` */
  footer: string;
  /** What an empty list says, under its heading: `` You want nothing yet. `/want` adds one. `` */
  empty: string;
  /** What an entry whose Remove would not fit into a custom id says at its end. */
  removeCommand: string;
  /** Whether "Remove all…" is offered (there is something to remove, readable or not). */
  removable: boolean;
}

/** The number of pages of a list of `n` entries: one at least. */
export function pageCount(n: number): number {
  return Math.max(1, Math.ceil(n / LIST_PAGE));
}

/** The page a list shows for `page`: within its pages. */
export function shownPage(page: number, n: number): number {
  return Math.min(Math.max(0, Math.floor(page)), pageCount(n) - 1);
}

function button(
  customId: string,
  label: string,
  style: APIButtonComponentWithCustomId['style'],
  disabled = false,
): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    style,
    custom_id: customId,
    label,
    ...(disabled ? { disabled: true } : {}),
  };
}

/**
 * The list as a components-v2 message: its heading and the count (`14 wants · page 1 of 2`, no
 * page words with one page), a line, one section per entry of the page with a red Remove beside
 * it (an entry whose Remove would not fit into a custom id says which command removes it), a
 * line, the row of Previous / Next (with more than one page; disabled at the ends) and "Remove
 * all…", and the footer. An empty list is its heading and `empty` alone. The entries share what
 * is left of `TEXT_BUDGET` after the rest.
 */
export function renderMemberList(view: ListView): V2Message {
  const { items, kind } = view;
  if (items.length === 0 && !view.removable) {
    return {
      v2: true,
      components: [container(LIST_COLOUR, [textDisplay(`${view.heading}\n${view.empty}`)])],
    };
  }
  const pages = pageCount(items.length);
  const page = shownPage(view.page, items.length);
  const id = String(page);
  const counted = count(items.length, view.noun[0], view.noun[1]);
  const head = [
    view.heading,
    ...(view.notice === undefined ? [] : [view.notice]),
    pages > 1 ? `${counted} · page ${page + 1} of ${pages}` : counted,
    ...(view.notes ?? []),
  ].join('\n');
  const footer = `-# ${view.footer}`;
  const shown = items.slice(page * LIST_PAGE, (page + 1) * LIST_PAGE);
  const room = Math.floor((TEXT_BUDGET - head.length - footer.length) / Math.max(1, shown.length));
  const parts: APIComponentInContainer[] = [textDisplay(head), separator()];
  for (const item of shown) {
    const own = item.button;
    const removeId = encodeCustomIdIfFits({
      kind,
      id,
      action: own?.action ?? LIST_ACTIONS.remove,
      args: own?.args ?? item.removeArgs,
    });
    if (removeId === undefined) {
      const hint = own
        ? ` · \`${own.command}\` changes it`
        : ` · \`${view.removeCommand}\` removes it`;
      parts.push(textDisplay(cutText(item.line(room - hint.length), room - hint.length) + hint));
    } else {
      const control = own
        ? button(removeId, own.label, own.style)
        : button(removeId, 'Remove', ButtonStyle.Danger);
      parts.push(section(cutText(item.line(room), room), control));
    }
  }
  if (shown.length > 0) parts.push(separator());
  const controls = [
    ...(pages > 1
      ? [
          button(
            encodeCustomId({ kind, id, action: LIST_ACTIONS.prev }),
            '◀ Previous',
            ButtonStyle.Secondary,
            page === 0,
          ),
          button(
            encodeCustomId({ kind, id, action: LIST_ACTIONS.next }),
            'Next ▶',
            ButtonStyle.Secondary,
            page === pages - 1,
          ),
        ]
      : []),
    ...(view.removable
      ? [
          button(
            encodeCustomId({ kind, id, action: LIST_ACTIONS.all }),
            'Remove all…',
            ButtonStyle.Danger,
          ),
        ]
      : []),
  ];
  if (controls.length > 0) parts.push(actionRow(controls));
  parts.push(textDisplay(footer));
  return { v2: true, components: [container(LIST_COLOUR, parts)] };
}
