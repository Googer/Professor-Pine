import { createHash } from 'node:crypto';

/**
 * The one inline script of Pine's pages, on a login link's page (Matt, 2026-10-25): it presses
 * the page's button as the page is shown, so the member goes on without a second tap. A link
 * preview or a prefetch runs no script, so opening the address still spends nothing; without
 * script the button stays. Inline rather than a file of its own (review fix 6): a file was a
 * third request to `/auth/` for every login, counted in its rate limit.
 *
 * Once it submitted (with `requestSubmit`, or `submit` where a browser lacks it: Safari before
 * 16), it disables the button and says "Logging you in as <name>…" in place of the sentence
 * (review fix 1): a tap while the POST is on its way would abort it after the server spent the
 * link, and the second POST would land on `?login=expired`. The name is the form's `data-name`,
 * written HTML-escaped by `buttonPage` and set here as text, never as HTML. Written for old
 * browsers too: no `?.`, no arrow, no `let`.
 */
export const CONTINUE_SCRIPT = [
  '(function () {',
  "var form = document.querySelector('form');",
  'if (!form) return;',
  "if (typeof form.requestSubmit === 'function') form.requestSubmit();",
  'else form.submit();',
  "var button = form.querySelector('button');",
  'if (button) button.disabled = true;',
  "var sentence = document.querySelector('p');",
  'if (sentence) {',
  "sentence.textContent = 'Logging you in as ' + form.getAttribute('data-name') + '\\u2026';",
  '}',
  '})();',
].join('');

/**
 * The CSP's source for `CONTINUE_SCRIPT` (`script-src`): the SHA-256 of its exact text, worked
 * out once. The policy lets in no other inline script.
 */
export const CONTINUE_SCRIPT_SOURCE = `'sha256-${createHash('sha256').update(CONTINUE_SCRIPT, 'utf8').digest('base64')}'`;
