import { editingOffered, editItemLabel } from './editor-toggle.js';
import { historyItemNode, historyOffered, meItemNode, type Me } from './notice.js';
import type { PageNode } from './popup.js';

/*
 * The items of the header's account menu (Matt, 2026-11-07), one list for the map and the history
 * pages, so that the two menus cannot drift: History, Your history, Your regions…, Edit regions,
 * the editor's tour (the map alone), Map tour; `showAccount` (`page-frame.ts`) adds the theme and
 * Log out. On the map the items that act in place are buttons (`main.ts` gives them their
 * presses); elsewhere they are links to the map that open the thing there (`?open=`, read by the
 * map). No Leaflet here: the history bundle takes this module.
 */

/** The pages whose header has the account menu: the map, the history page and "Your history". */
export type MenuPage = 'map' | 'history' | 'me';

/** An item of the member's menu. */
export type MemberItem = 'history' | 'me' | 'regions' | 'edit' | 'editor-tour';

/** An item of either menu. */
export type MenuItem = MemberItem | 'tour';

/** What the map opens by its address (`?open=regions`, `?open=tour`). */
export type MapOpening = 'regions' | 'tour';

const OPEN_QUERY_NAME = 'open';
const OPENINGS: readonly MapOpening[] = ['regions', 'tour'];

/** What either menu holds whoever asks, the visitor's ⋮ menu included: "Map tour". */
export const EVERYONE_ITEMS: readonly MenuItem[] = ['tour'];

/**
 * The member's items on a page, in the map's order: the history pages and "Your regions…" for a
 * member of the server (`historyOffered`; "Your regions…" shows once the view of the regions
 * offers it), "Edit regions" for whom `/api/me` says may edit (`editingOffered`; `map.css` and
 * `history.css` show it only where the editor is offered), and "Editor tour" on the map alone,
 * where the editor can be on.
 */
export function memberItems(me: Me, page: MenuPage): MemberItem[] {
  return [
    ...(historyOffered(me) ? (['history', 'me', 'regions'] as const) : []),
    ...(editingOffered(me) ? (['edit'] as const) : []),
    ...(editingOffered(me) && page === 'map' ? (['editor-tour'] as const) : []),
  ];
}

/** The map's address that opens a thing of it (`openingAsked`). */
function mapOpeningPath(guild: string, what: MapOpening): string {
  return `/s/${guild}/map?${OPEN_QUERY_NAME}=${what}`;
}

/** A button of the map's menu, which `main.ts` gives its press. */
function button(className: string, text: string, hidden = false): PageNode {
  return {
    tag: 'button',
    className,
    text,
    attributes: { type: 'button', ...(hidden ? { hidden: '' } : {}) },
  };
}

/** A link of a history page's menu to the map. */
function link(className: string, text: string, href: string, hidden = false): PageNode {
  return { tag: 'a', className, text, attributes: { href, ...(hidden ? { hidden: '' } : {}) } };
}

/**
 * An item of the menu on a page. The history pages' items mark the page you are on
 * (`aria-current`, drawn as the chosen theme is), which stays in the menu. "Your regions…" starts
 * hidden: shown where the view of the regions offers it (`regionsOffered`). "Edit regions" says
 * how many regions the browser holds unsaved edits of (`unsaved`, `editItemLabel`).
 */
export function menuItemNode(item: MenuItem, guild: string, page: MenuPage, unsaved = 0): PageNode {
  const onMap = page === 'map';
  switch (item) {
    case 'history':
    case 'me': {
      const node = item === 'history' ? historyItemNode(guild) : meItemNode(guild);
      return page === item
        ? { ...node, attributes: { ...node.attributes, 'aria-current': 'page' } }
        : node;
    }
    case 'regions':
      return onMap
        ? button('regions-item', 'Your regions…', true)
        : link('regions-item', 'Your regions…', mapOpeningPath(guild, 'regions'), true);
    case 'edit':
      return onMap
        ? button('edit-regions', editItemLabel(unsaved))
        : link('edit-regions', editItemLabel(unsaved), `/s/${guild}/regions/edit`);
    case 'editor-tour':
      return button('editor-tour-item', 'Editor tour');
    case 'tour':
      return onMap
        ? button('tour-item', 'Map tour')
        : link('tour-item', 'Map tour', mapOpeningPath(guild, 'tour'));
  }
}

/**
 * Whether a history page asks `/api/regions/mine` for "Your regions…": where the map asks it, for
 * a member while Discord can be reached (`regionsOffered` then decides, as on the map).
 */
export function regionsAsked(me: Me): boolean {
  return historyOffered(me) && me.loggedIn && !me.readOnly;
}

/** What the map's address asks it to open (`?open=regions`, `?open=tour`); undefined: nothing. */
export function openingAsked(search: string): MapOpening | undefined {
  const asked = new URLSearchParams(search).getAll(OPEN_QUERY_NAME);
  return OPENINGS.find((what) => asked.includes(what));
}

/** The address without `?open=`, the rest kept (as `addressWith` does for `?edit=`). */
export function addressWithoutOpening(pathname: string, search: string, hash: string): string {
  const query = new URLSearchParams(search);
  query.delete(OPEN_QUERY_NAME);
  const rest = query.toString();
  return `${pathname}${rest === '' ? '' : `?${rest}`}${hash}`;
}

/**
 * A history page's link led to the map with `?open=` (Matt, 2026-11-07): once what it `waits`
 * for settled, whether it loaded or not, the address forgets it, and the thing opens as its menu
 * item opens it where the map offers it now; else it is ignored.
 */
export async function openByAddress(
  asked: MapOpening | undefined,
  waits: readonly Promise<unknown>[],
  page: {
    offered(what: MapOpening): boolean;
    open(what: MapOpening): void;
    /** Drops `?open=` from the address. */
    leave(): void;
  },
): Promise<void> {
  if (asked === undefined) return;
  await Promise.allSettled(waits);
  page.leave();
  if (page.offered(asked)) page.open(asked);
}
