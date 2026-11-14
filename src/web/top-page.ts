import { escapeHtml, shortDocument, TOP_LOGIN } from './answers.js';
import type { MapServer } from './map-servers.js';
import type { JoinableServer, TopAnswer } from './top-answer.js';

/**
 * The top page's script (plan 8M-14): Log out, and on the pages for a visitor logged out the
 * address without `?login=failed` (review BR-1, F4); built under a name of its own without a
 * hash (`scripts/web/build.ts`), as the short pages' stylesheet is, since the page is answered
 * where the bundle's manifest is not at hand. Without a build the button does nothing.
 */
export const TOP_SCRIPT = '/assets/top.js';

/** The tag of `TOP_SCRIPT`, run once the page is read. */
const TOP_SCRIPT_TAG = `<script src="${TOP_SCRIPT}" defer></script>`;

export const NO_MAP = 'Professor Pine has no map here yet.';
/** What the login page says first, under its heading "Professor Pine" (review BR-1, F6). */
export const INTRO =
  'Professor Pine organizes Pokémon GO raids, raid trains and meetups on Discord.';
export const LOGIN_SENTENCE =
  "Professor Pine's maps are kept per Discord server. Log in with Discord to see the maps of your servers.";
export const LOGIN_FAILED = 'Logging in with Discord failed; try again.';
export const OR_MAPS = 'Or use /maps in your server on Discord.';
export const ONLY_MAPS = 'Use /maps in your server on Discord to open its map.';
export const NOT_IN = 'None of your Discord servers has a map here.';
export const PARTIAL = 'Discord did not answer for every server; reload to try again.';
export const YOUR_SERVERS = 'Your servers';
export const TO_JOIN = 'Servers you can join';
export const JOIN = 'Join on Discord';
/**
 * Under the servers to join (review BR-1, F2): the member directory keeps "not a member" for a
 * minute (`CachedMemberDirectory`), so a server just joined may still be offered for that long.
 */
export const AFTER_JOINING =
  'Once you have joined, reload this page; Discord can take a minute to tell Pine.';

/**
 * The mark of a page for a visitor logged out (the login, or /maps alone): how the page's script,
 * asking `/` anew for a token, knows that the session is over (`top-logout.ts`, `LOGGED_OUT`).
 */
export const LOGGED_OUT_MARK = '<meta name="pine-top" content="logged-out">';

/** A paragraph of plain words. */
const line = (words: string, className?: string): string =>
  `${className === undefined ? '<p>' : `<p class="${className}">`}${escapeHtml(words)}</p>`;

/** A name of Discord's as it is shown: escaped, and isolated so that it cannot turn the line. */
const named = (name: string): string => `<bdi>${escapeHtml(name)}</bdi>`;

/** The heading and the first line of a page for a visitor logged out: what Pine is. */
const INTRODUCTION = `<h1>Professor Pine</h1>${line(INTRO)}`;

/** A page's `main` and what its head adds. */
interface PageParts {
  main: string;
  head: string;
}

/**
 * The page of a visitor not logged in: what Pine is, then the login, or `/maps` alone without the
 * client secret.
 */
function loginPage(discord: boolean, failed: boolean): PageParts {
  const head = LOGGED_OUT_MARK + TOP_SCRIPT_TAG;
  if (!discord) return { main: INTRODUCTION + line(ONLY_MAPS), head };
  return {
    main:
      INTRODUCTION +
      (failed ? line(LOGIN_FAILED, 'top-failed') : '') +
      line(LOGIN_SENTENCE) +
      `<p><a class="top-login" href="${escapeHtml(TOP_LOGIN)}">Log in with Discord</a></p>` +
      line(OR_MAPS),
    head,
  };
}

/** A server of theirs: its name, a link to its map. */
const yourItem = (server: MapServer): string =>
  `<li><a href="/s/${escapeHtml(server.id)}/map">${named(server.name)}</a></li>`;

/** A server they could join: its name, and its invite in a new tab that cannot reach back. */
const joinItem = (server: JoinableServer): string =>
  `<li>${named(server.name)} <a class="top-join" href="${escapeHtml(server.invite)}" ` +
  `target="_blank" rel="noopener">${JOIN}</a></li>`;

/** The page of a visitor logged in: who they are with Log out, their servers, those to join. */
function serversPage(answer: Extract<TopAnswer, { kind: 'servers' }>, csrf: string): PageParts {
  const account =
    `<p class="top-account"><span>Logged in as ${named(answer.visitor)}</span>` +
    `<button type="button" class="top-logout" data-csrf="${escapeHtml(csrf)}">Log out</button></p>` +
    '<p class="top-notice" id="notice" role="status" hidden></p>';
  const yours =
    answer.yours.length === 0
      ? ''
      : `<h2>${YOUR_SERVERS}</h2><ul class="top-servers">${answer.yours.map(yourItem).join('')}</ul>`;
  const toJoin =
    answer.toJoin.length === 0
      ? ''
      : `<h2>${TO_JOIN}</h2><ul class="top-servers">${answer.toJoin.map(joinItem).join('')}</ul>` +
        line(AFTER_JOINING);
  return {
    main:
      account +
      (answer.notIn ? line(NOT_IN) : '') +
      yours +
      (answer.partial ? line(PARTIAL, 'top-partial') : '') +
      toJoin,
    head: TOP_SCRIPT_TAG,
  };
}

/** The parts of the top page's answer, but a redirect's. */
function pageParts(answer: Exclude<TopAnswer, { kind: 'redirect' }>, csrf: string): PageParts {
  switch (answer.kind) {
    case 'no-map':
      return { main: line(NO_MAP), head: '' };
    case 'login':
      return loginPage(answer.discord, answer.failed);
    case 'servers':
      return serversPage(answer, csrf);
  }
}

/**
 * The HTML of the top page's answer (plan 8M-14), but a redirect's: the short pages' look, every
 * name escaped and in `<bdi>`, the Log out of a logged-in page carrying the session's CSRF token
 * for `TOP_SCRIPT`. With `theme`, the map's head script in the bundle (the manifest's
 * `map.theme`), first in the head, neither deferred nor async, as the map loads it: a Light or
 * Dark chosen on the map holds here too (review BR-1, F7; `theme-head.ts`, `data-theme`). Without
 * a build there is none, and the page follows the device.
 */
export function topPage(
  answer: Exclude<TopAnswer, { kind: 'redirect' }>,
  csrf: string | undefined,
  theme?: string,
): string {
  const { main, head } = pageParts(answer, csrf ?? '');
  const themeTag =
    theme === undefined ? '' : `<script src="/assets/${escapeHtml(theme)}"></script>`;
  return shortDocument(main, themeTag + head);
}
