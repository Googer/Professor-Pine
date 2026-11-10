import type { FastifyReply, FastifyRequest } from 'fastify';
import { NOT_ALLOWED } from '../discord/errors.js';
import { CONTINUE_SCRIPT } from './continue-script.js';

/** What an answer that failed says, by status: a few words, never what went wrong. */
const FAILURE_WORDS: Readonly<Record<number, string>> = {
  400: 'Bad request.',
  401: 'Log in first.',
  403: NOT_ALLOWED,
  404: 'Not found.',
  413: 'Too large.',
  415: 'Unsupported content.',
  429: 'Too many requests. Try again in a minute.',
  503: 'Not available just now. Try again in a moment.',
};
const FAILED = 'Something went wrong.';

/** Whether an address belongs to the data of the pages, answered in JSON. */
function isApi(url: string): boolean {
  return /^\/s\/[^/?]+\/api\//.test(url) || url.startsWith('/api/');
}

/** Text for HTML: `&`, `<`, `>` and both quotes as entities. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Says that a page is drawn light or dark as the device is (plan 8M-7): the browser's own parts
 * (fields, scroll bars) follow, and the page's stylesheet takes the dark set of `theme.css`.
 */
export const COLOR_SCHEME_META = '<meta name="color-scheme" content="light dark">';

/**
 * The stylesheet of the short pages (plan 8M-7): `pages.css` with `theme.css`, built under a
 * name of its own without a hash (`scripts/web/build.ts`), since these pages are answered where
 * the bundle's manifest is not at hand; asked again at each load (`no-cache`). Without a build
 * the page is plain, as before.
 */
export const SHORT_PAGE_STYLE = '/assets/page.css';

/**
 * A short page in the short pages' look: `main`, HTML of ours (anything of a member's or of
 * Discord's escaped by the caller), and what the head adds (a script of Pine's, the top page's).
 */
export function shortDocument(main: string, head = ''): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    COLOR_SCHEME_META +
    `<link rel="stylesheet" href="${SHORT_PAGE_STYLE}">` +
    head +
    '<title>Professor Pine</title></head>' +
    `<body class="short"><main>${main}</main></body></html>`
  );
}

/** A short page of one sentence, and what follows it (HTML of ours). */
function page(sentence: string, more = ''): string {
  return shortDocument(`<p>${escapeHtml(sentence)}</p>${more}`);
}

/** A short page of one sentence: what a failure or an empty address shows. */
export function shortPage(sentence: string): string {
  return page(sentence);
}

/**
 * A short page of a sentence, a link of Pine's when there is one (`href`, a path), and a last
 * sentence: how to log in where a page needs a login.
 */
export function linkPage(
  sentence: string,
  link: { href: string; text: string } | undefined,
  after: string,
): string {
  return page(
    sentence,
    (link === undefined
      ? ''
      : `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.text)}</a></p>`) +
      `<p>${escapeHtml(after)}</p>`,
  );
}

/** What a login link's page shows, by who the browser is logged in as (plan 8Z-2). */
export interface LinkPageOptions {
  /** What the link opens, in a sentence. */
  sentence: string;
  /** Where the button POSTs: a path of Pine's. */
  action: string;
  /** The name of the link's account. */
  name: string;
  /**
   * Who the browser is logged in as: `none` (no session: the page presses its button itself),
   * `same` (the link's own account), or the name of another account, which the page says.
   */
  loggedIn: 'none' | 'same' | { other: string };
}

/**
 * A login link's page: a short page of one sentence and a button "Continue as <name>" that POSTs
 * an empty form to `action` (a path of Pine's); the form carries the name, escaped, in
 * `data-name` for the script's "Logging you in as <name>…". Only in a browser that is not logged
 * in is the button pressed by `CONTINUE_SCRIPT`, inline, where scripts run (Matt's ruling,
 * 2026-11-10, plan 8Z-2: a link never changes who a browser is logged in as by itself). In one
 * logged in as the link's account the button stays to be pressed; in one logged in as somebody
 * else the page says so first, "You are logged in as <their name>.", then the button with the
 * link's name. Every name is escaped.
 */
export function buttonPage(options: LinkPageOptions): string {
  const { sentence, action, name, loggedIn } = options;
  return page(
    sentence,
    (typeof loggedIn === 'object'
      ? `<p>You are logged in as ${escapeHtml(loggedIn.other)}.</p>`
      : '') +
      `<form method="post" action="${escapeHtml(action)}" data-name="${escapeHtml(name)}">` +
      `<button type="submit">Continue as ${escapeHtml(name)}</button></form>` +
      (loggedIn === 'none' ? `<script>${CONTINUE_SCRIPT}</script>` : ''),
  );
}

/** The answers that carry `CONTINUE_SCRIPT`: the only ones whose CSP lets it in. */
const scripted = new WeakSet<FastifyReply>();

/**
 * Whether an answer carries `CONTINUE_SCRIPT` (`sendButtonPage` sent it with the script): the
 * `onSend` hook sends the script's hash in the Content Security Policy of such an answer alone
 * (plan 8Z-2, audit L-W1: allowed on every answer, the script would submit the first form of
 * any page an injection reached).
 */
export function carriesContinueScript(reply: FastifyReply): boolean {
  return scripted.has(reply);
}

/**
 * Answers a login link's page (`buttonPage`), and marks the answer as carrying the script where
 * the page has it: the one place that does either, so that the two cannot differ.
 */
export function sendButtonPage(reply: FastifyReply, options: LinkPageOptions): FastifyReply {
  if (options.loggedIn === 'none') scripted.add(reply);
  return reply.type('text/html; charset=utf-8').send(buttonPage(options));
}

/** Answers a failure: JSON `{ error }` for the pages' data, a short page otherwise. */
export function sendFailure(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
): FastifyReply {
  const words = FAILURE_WORDS[status] ?? FAILED;
  void reply.code(status).header('cache-control', 'no-store');
  if (isApi(request.url)) return reply.send({ error: words });
  return reply.type('text/html; charset=utf-8').send(shortPage(words));
}
