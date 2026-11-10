import { dateTime, shortDateTime } from '../domain/web/clock.js';
import {
  askAgainAt,
  mayAskAgain,
  type ScriptAccess,
  type ScriptAccessState,
} from '../domain/script-access/access.js';
import type { ChangelogEntry, ToolUrls } from '../domain/script-access/tool-file.js';
import { plainNoLinks, unplain } from '../render/text.js';
import { COLOR_SCHEME_META, escapeHtml } from './answers.js';
import type { PageAssets } from './page.js';

/** The page's words that the routes answer with too. */
export const TOOL_WORDS = {
  lead: "Professor Pine's Wayfarer export tool, for the admins of servers that run Pine.",
  notAvailable: 'Not available on this Pine.',
  askQuestion: 'Which community do you run Pine for?',
  ask: 'Ask for access',
  asked: 'Your request is waiting for the owner.',
  refused: 'Your request was refused.',
  revoked: 'Your access was withdrawn.',
  install: 'Install',
  newLink: 'Make a new link',
  newLinkConfirm: 'Press again to make a new link',
  reinstall:
    'A new link must be installed again: the copy installed from the old link keeps working, but gets no more updates.',
  myLink: 'Make my link',
  staleLogin: 'Log in again: managing the tool needs a login of the last 12 hours.',
  noScript: 'The buttons of this page need JavaScript.',
} as const;

/** The login with Discord that comes back to this page. */
export const TOOL_LOGIN = `/auth/login?next=${encodeURIComponent('/userscript')}`;

/**
 * Text a member wrote (a name, a community line) as the page shows it: through `plainNoLinks`, as
 * a DM would show it (no address in it can be followed: a zero-width space breaks each), its
 * Markdown escapes undone (`unplain`: a page shows them), then escaped for HTML.
 */
export function memberWords(text: string): string {
  return escapeHtml(unplain(plainNoLinks(text)));
}

/** What a member logged in sees of their own access. */
export type OwnAccess =
  | { kind: 'none' }
  | { kind: 'asked' }
  /** `askFrom`: when the refused member may ask again. */
  | { kind: 'refused'; mayAsk: boolean; askFrom: number }
  | { kind: 'approved'; urls: ToolUrls; version: string; changelog: ChangelogEntry[] }
  | { kind: 'revoked' }
  /** The owner, approved without a row until the first "Make my link". */
  | { kind: 'owner-without-link' };

/** The page of somebody logged in. */
export interface ToolPageView {
  name: string;
  csrf: string;
  own: OwnAccess;
  /** The owner's list: every row but the owner's own; undefined for anybody else. */
  requests?: ScriptAccess[];
  /** The owner whose login is older than `OWNER_LOGIN_MS`: asked to log in again, nothing else. */
  staleOwner?: boolean;
  /** The posts' zone, for the list's times. */
  zone: string;
}

/**
 * What a member sees of their own row (`row` undefined: none). The owner sees their link, or
 * "Make my link" whatever else their row is (they may have asked as an admin before `OWNER_ID`
 * named them).
 */
export function ownAccess(
  row: ScriptAccess | undefined,
  options: {
    owner: boolean;
    now: number;
    tool: { version: string; changelog: ChangelogEntry[] };
    urls: (key: string) => ToolUrls;
  },
): OwnAccess {
  if (options.owner && (row?.state !== 'approved' || row.key === null)) {
    return { kind: 'owner-without-link' };
  }
  if (!row) return { kind: 'none' };
  switch (row.state) {
    case 'asked':
      return { kind: 'asked' };
    case 'refused':
      return {
        kind: 'refused',
        mayAsk: mayAskAgain(row, options.now),
        askFrom: askAgainAt(row) ?? options.now,
      };
    case 'revoked':
      return { kind: 'revoked' };
    case 'approved':
      return row.key === null
        ? { kind: 'revoked' }
        : {
            kind: 'approved',
            urls: options.urls(row.key),
            version: options.tool.version,
            changelog: options.tool.changelog,
          };
  }
}

/** A button of the page: what it does, the data its POST carries, a second press if asked. */
function button(
  action: string,
  text: string,
  data: { id?: number; from?: ScriptAccessState; asked?: number; confirm?: string } = {},
): string {
  const attributes = [
    `type="button"`,
    `data-action="${escapeHtml(action)}"`,
    ...(data.id === undefined ? [] : [`data-id="${data.id}"`]),
    ...(data.from === undefined ? [] : [`data-from="${data.from}"`]),
    ...(data.asked === undefined ? [] : [`data-asked="${data.asked}"`]),
    ...(data.confirm === undefined ? [] : [`data-confirm="${escapeHtml(data.confirm)}"`]),
  ];
  return `<button ${attributes.join(' ')}>${escapeHtml(text)}</button>`;
}

const paragraph = (text: string): string => `<p>${escapeHtml(text)}</p>`;

/** The form of a request: one line, at most 200 characters, required. */
function askForm(): string {
  return [
    '<form id="ask" class="ask">',
    `<label for="community">${escapeHtml(TOOL_WORDS.askQuestion)}</label>`,
    '<input id="community" name="community" type="text" maxlength="200" required autocomplete="off">',
    button('ask', TOOL_WORDS.ask),
    '</form>',
  ].join('\n');
}

/**
 * What an entry of the changelog says, as text (no HTML of the file's): its lines that start
 * with `- ` as the items of a list (an indented line after one continues it; an item with
 * nothing in it, `- ` or `-` alone, is left out), the other lines as paragraphs, a blank line
 * ending either. The entry's line breaks are kept (`<br>` between its escaped lines).
 */
function changeBlocks(text: string): string {
  /** A paragraph's lines, or a list's items, each of its lines. */
  const blocks: ({ list: false; lines: string[] } | { list: true; items: string[][] })[] = [];
  let item: string[] | undefined;
  for (const line of text.split('\n')) {
    const last = blocks.at(-1);
    const trimmed = line.trim();
    if (trimmed === '') {
      blocks.push({ list: false, lines: [] });
      item = undefined;
    } else if (line.startsWith('- ') || trimmed === '-') {
      const list = last?.list ? last : { list: true as const, items: [] };
      if (list !== last) blocks.push(list);
      const words = line.slice(1).trim();
      item = words === '' ? undefined : [words];
      if (item) list.items.push(item);
    } else if (item && /^\s/.test(line)) {
      item.push(trimmed);
    } else {
      if (last && !last.list && last.lines.length > 0) last.lines.push(trimmed);
      else blocks.push({ list: false, lines: [trimmed] });
      item = undefined;
    }
  }
  const lines = (all: readonly string[]): string => all.map(escapeHtml).join('<br>');
  return blocks
    .filter((block) => (block.list ? block.items.length > 0 : block.lines.length > 0))
    .map((block) =>
      block.list
        ? [
            '<ul class="changes">',
            ...block.items.map((one) => `<li>${lines(one)}</li>`),
            '</ul>',
          ].join('\n')
        : `<p class="changes">${lines(block.lines)}</p>`,
    )
    .join('\n');
}

/** The changelog's newest entries, as text. */
function changes(entries: readonly ChangelogEntry[]): string {
  return entries
    .map(
      (entry) =>
        `<h3>${escapeHtml(entry.version)}</h3>` +
        (entry.text === '' ? '' : `\n${changeBlocks(entry.text)}`),
    )
    .join('\n');
}

/** The section of a member's own access; `zone` is the posts' (`settings.timezone`). */
function ownSection(own: OwnAccess, zone: string): string {
  switch (own.kind) {
    case 'none':
      return askForm();
    case 'asked':
      return paragraph(TOOL_WORDS.asked);
    case 'refused':
      return own.mayAsk
        ? `${paragraph(TOOL_WORDS.refused)}\n${askForm()}`
        : paragraph(`${TOOL_WORDS.refused} You may ask again from ${dateTime(own.askFrom, zone)}.`);
    case 'revoked':
      return paragraph(TOOL_WORDS.revoked);
    case 'owner-without-link':
      return `<p>${button('my-link', TOOL_WORDS.myLink)}</p>`;
    case 'approved':
      return [
        `<p><a class="install" href="${escapeHtml(own.urls.script)}">${escapeHtml(TOOL_WORDS.install)}</a></p>`,
        `<p class="link"><code>${escapeHtml(own.urls.script)}</code></p>`,
        paragraph(`Version ${own.version}`),
        changes(own.changelog),
        `<p>${button('new-link', TOOL_WORDS.newLink, { confirm: TOOL_WORDS.newLinkConfirm })}</p>`,
        paragraph(TOOL_WORDS.reinstall),
      ].join('\n');
  }
}

/** How the owner's list names a state. */
const STATE_WORDS: Readonly<Record<ScriptAccessState, string>> = {
  asked: 'Waiting',
  approved: 'Approved',
  refused: 'Refused',
  revoked: 'Revoked',
};

/** A time of the list in the posts' zone, or a dash for none. */
function when(at: number | null, zone: string): string {
  return at === null ? '–' : shortDateTime(at, zone);
}

/**
 * What the owner may decide of a row, as it is drawn: each button carries the state and the asking
 * (`askedAt`) it was drawn with, so a request asked again since is not decided from this page.
 */
function decisions(row: ScriptAccess): string {
  const data = { id: row.id, from: row.state, asked: row.askedAt };
  switch (row.state) {
    case 'asked':
      return button('approve', 'Approve', data) + ' ' + button('refuse', 'Refuse', data);
    case 'approved':
      return button('revoke', 'Revoke', { ...data, confirm: 'Press again to revoke' });
    case 'refused':
    case 'revoked':
      return button('approve', 'Approve', data);
  }
}

/** The owner's list of every request and admin (the owner's own row is not in it). */
function requestList(rows: readonly ScriptAccess[], zone: string): string {
  if (rows.length === 0) return '<h2>Requests</h2>\n<p>Nobody has asked yet.</p>';
  const head =
    '<tr><th>Name</th><th>Community</th><th>State</th><th>Asked</th><th>Decided</th>' +
    '<th>Last fetch</th><th>Version</th><th></th></tr>';
  const lines = rows.map(
    (row) =>
      '<tr>' +
      `<td>${memberWords(row.name)}<br><small>${escapeHtml(row.userId)}</small></td>` +
      `<td>${memberWords(row.community)}</td>` +
      `<td>${STATE_WORDS[row.state]}</td>` +
      `<td>${when(row.askedAt, zone)}</td>` +
      `<td>${when(row.decidedAt, zone)}</td>` +
      `<td>${when(row.lastFetchAt, zone)}</td>` +
      `<td>${row.lastVersion === null ? '–' : escapeHtml(row.lastVersion)}</td>` +
      `<td>${decisions(row)}</td>` +
      '</tr>',
  );
  return ['<h2>Requests</h2>', '<table class="requests">', head, ...lines, '</table>'].join('\n');
}

/** The head of the page: its title, its style and its script, nothing inline. */
function head(assets: PageAssets): string[] {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    COLOR_SCHEME_META,
    '<title>Professor Pine: Wayfarer export tool</title>',
    `<link rel="stylesheet" href="/assets/${escapeHtml(assets.style)}">`,
    `<script src="/assets/${escapeHtml(assets.script)}" defer></script>`,
    '</head>',
  ];
}

/**
 * The page `/userscript` of somebody logged in (plan 8W-P): a static page of Pine's, its own
 * bundled script and style, nothing inline; the CSRF token in an escaped `data-csrf` on
 * `<body>`. Their own access by its state, and for the owner the list of every request.
 */
export function toolPage(view: ToolPageView, assets: PageAssets): string {
  const body = view.staleOwner
    ? [
        paragraph(TOOL_WORDS.staleLogin),
        `<p><a href="${escapeHtml(TOOL_LOGIN)}">Log in with Discord</a></p>`,
      ].join('\n')
    : [
        ownSection(view.own, view.zone),
        ...(view.requests ? [requestList(view.requests, view.zone)] : []),
      ].join('\n');
  return [
    ...head(assets),
    `<body data-csrf="${escapeHtml(view.csrf)}">`,
    '<header id="header"><span class="title">Professor Pine</span>' +
      `<span id="account">${memberWords(view.name)} ${button('logout', 'Log out')}</span></header>`,
    '<p id="notice" role="status" hidden></p>',
    '<main id="tool">',
    '<h1>Wayfarer export tool</h1>',
    paragraph(TOOL_WORDS.lead),
    body,
    '</main>',
    `<noscript>${paragraph(TOOL_WORDS.noScript)}</noscript>`,
    '</body>',
    '</html>',
  ].join('\n');
}
