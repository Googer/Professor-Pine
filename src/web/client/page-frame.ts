import { LOGOUT_FAILED, logOut } from './logout.js';
import { headerLines, inviteNode, NoticeBand, type Me, type WebPage } from './notice.js';
import { renderNode } from './popup.js';
import { requestError } from './request-error.js';
import { chooseTheme, shownThemeChoice } from './theme.js';
import { THEME_CHOICES, themeItemNode, type ThemeChoice } from './theme-choice.js';

/**
 * The frame every page of Pine's shares (split from `common.ts` in plan 8H-5, so that a page
 * without a map loads no Leaflet: the history page): the elements of the page, reading JSON, the
 * notice band, and the header with the login, the member's menu and the theme.
 */

export function byId(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`the page has no #${id}`);
  return found;
}

/**
 * JSON of the page's server (or another's, by `init`). A failure throws a `RequestError` that
 * keeps the server's words of a refusal (plan 8M-10); a broken connection throws as `fetch` does.
 */
export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  if (!response.ok) throw requestError(response.status, await response.text().catch(() => ''));
  return (await response.json()) as T;
}

/**
 * The notice band over the top of the map, for a moment's news that belongs to no party (a login
 * that failed, tiles that did not load, a report form's answer): gone by itself after ten seconds,
 * or by its × (plan 8M-11A, `NoticeBand`). Its text is `#notice-text`, or the band itself on a page
 * without one.
 */
const noticeBand = new NoticeBand(() => {
  const band = document.getElementById('notice');
  if (!band) return undefined;
  return { band, text: document.getElementById('notice-text') ?? band };
});

export function say(text: string, options: { lasting?: boolean } = {}): void {
  noticeBand.say(text, options);
}

/** Hides the notice band at once (its ×, or a change of what is shown). */
export function hideNotice(): void {
  noticeBand.hide();
}

/** Who is asking (`/api/me`); logged out when that cannot be read. */
export async function whoIsAsking(guild: string): Promise<Me> {
  try {
    return await getJson<Me>(`/s/${guild}/api/me`);
  } catch {
    return { loggedIn: false };
  }
}

/**
 * "Theme: Light · Dark · Device" (plan 8M-13, S10): a press chooses (`chooseTheme`) and marks
 * the choice; the menu stays open, the page turning behind it.
 */
function themeItem(): HTMLElement {
  const item = renderNode(themeItemNode(shownThemeChoice()), document);
  item.addEventListener('click', (event) => {
    const pressed =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>('[data-theme-choice]')?.dataset.themeChoice
        : undefined;
    const choice = THEME_CHOICES.find((one): one is ThemeChoice => one === pressed);
    if (choice === undefined) return;
    chooseTheme(choice);
    for (const button of item.querySelectorAll<HTMLElement>('[data-theme-choice]')) {
      const chosen = button.dataset.themeChoice === choice;
      button.setAttribute('aria-pressed', String(chosen));
      button.classList.toggle('chosen', chosen);
    }
  });
  return item;
}

/** A small menu of the header (`<details>`) that closes on Escape and on a click outside it. */
function closesByItself(menu: HTMLDetailsElement): void {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') menu.open = false;
  });
  document.addEventListener('click', (event) => {
    if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
  });
}

/**
 * The header's account: the login, or the member's name with Log out, and what they may not.
 * `items`: what its menu holds before the theme and Log out for the member (the map's "Edit
 * regions", plan 8M-10); a press of one closes the menu. `themed`: the page offers Light, Dark
 * or Device (plan 8M-13, S10: the map and its region editor), in the member's menu, or for a
 * visitor, who has none, in a small ⋮ button of its own in its place. `everyone`: what either
 * of those menus holds whoever asks (the map's "Map tour", plan 8M-17).
 */
export async function showAccount(
  guild: string,
  login: 'discord' | 'links',
  page: WebPage,
  items: (me: Me) => HTMLElement[] = () => [],
  themed = false,
  everyone: () => HTMLElement[] = () => [],
): Promise<Me> {
  const account = byId('account');
  const me = await whoIsAsking(guild);
  const header = headerLines(me, login, page);
  account.replaceChildren();
  if (header.login) {
    const link = document.createElement('a');
    link.className = 'login';
    link.href = `/auth/login?next=${encodeURIComponent(location.pathname)}`;
    // The whole words, and the short ones a phone shows (`map.css`; review fix 4). The one not
    // shown is `display: none`, so a screen reader reads only the other.
    const full = document.createElement('span');
    full.className = 'full';
    full.textContent = 'Log in with Discord';
    const short = document.createElement('span');
    short.className = 'short';
    short.textContent = 'Log in';
    link.append(full, short);
    account.append(link);
  }
  if (themed && (header.name === undefined || !me.loggedIn)) {
    const menu = document.createElement('details');
    menu.className = 'account-menu theme-menu';
    const summary = document.createElement('summary');
    summary.textContent = '⋮';
    summary.setAttribute('aria-label', 'Menu');
    summary.title = 'Menu';
    const held = document.createElement('div');
    held.className = 'menu';
    for (const item of everyone()) {
      item.addEventListener('click', () => {
        menu.open = false;
      });
      held.append(item);
    }
    held.append(themeItem());
    menu.append(summary, held);
    closesByItself(menu);
    account.append(menu);
  }
  if (header.name !== undefined && me.loggedIn) {
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = header.name;
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.textContent = 'Log out';
    const { csrf } = me;
    logout.addEventListener('click', () => {
      logout.disabled = true;
      void logOut(csrf, {
        post: (token) =>
          fetch('/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'x-pine-csrf': token },
          }).then((answer) => answer.status),
        me: () => getJson<Me>(`/s/${guild}/api/me`),
      }).then((result) => {
        if (result === 'done') {
          location.reload();
          return;
        }
        logout.disabled = false;
        say(LOGOUT_FAILED);
      });
    });
    // One button with the member's name, whose small menu holds Log out (fix round 1): one row of
    // the header on a phone. It closes on Escape and on a click outside it.
    const menu = document.createElement('details');
    menu.className = 'account-menu';
    const summary = document.createElement('summary');
    summary.append(name);
    const held = document.createElement('div');
    held.className = 'menu';
    for (const item of [...items(me), ...everyone()]) {
      item.addEventListener('click', () => {
        menu.open = false;
      });
      held.append(item);
    }
    if (themed) held.append(themeItem());
    held.append(logout);
    menu.append(summary, held);
    closesByItself(menu);
    account.append(menu);
  }
  for (const text of header.lines) {
    const line = document.createElement('span');
    line.className = 'line';
    line.textContent = text;
    account.append(line);
  }
  // The server's invite under the line that they are not in it (plan 8M-11B).
  if (header.invite !== undefined) account.append(renderNode(inviteNode(header.invite), document));
  return me;
}
