import type { FastifyReply, FastifyRequest } from 'fastify';
import { CONTINUE_SCRIPT } from './continue-script.js';

/** What an answer that failed says, by status: a few words, never what went wrong. */
const FAILURE_WORDS: Readonly<Record<number, string>> = {
  400: 'Bad request.',
  401: 'Log in first.',
  403: 'Not allowed.',
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

/**
 * A login link's page: a short page of one sentence and a button "Continue as <name>" that POSTs
 * an empty form to `action` (a path of Pine's), pressed by `CONTINUE_SCRIPT`, inline, where
 * scripts run (the CSP lets it in by its hash, `CONTINUE_SCRIPT_SOURCE`); the form carries the
 * name, escaped, in `data-name` for the script's "Logging you in as <name>…".
 */
export function buttonPage(sentence: string, action: string, name: string): string {
  return page(
    sentence,
    `<form method="post" action="${escapeHtml(action)}" data-name="${escapeHtml(name)}">` +
      `<button type="submit">Continue as ${escapeHtml(name)}</button></form>` +
      `<script>${CONTINUE_SCRIPT}</script>`,
  );
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
