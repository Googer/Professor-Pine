import { logOut } from './logout.js';
import type { Me } from './notice.js';

/** What `/` answered: its status (0 for a redirect not followed) and its HTML. */
export interface TopPageAnswer {
  status: number;
  html: string;
}

/** What logging out of the top page needs: the POST with a CSRF token, and the page anew. */
export interface TopLogoutSteps {
  /** POSTs `/auth/logout` with this token; the status of the answer. */
  post(csrf: string): Promise<number>;
  /** Asks `/` again, following no redirect. */
  page(): Promise<TopPageAnswer>;
}

/**
 * The mark of the top page for a visitor logged out (the login, or /maps alone), as the server
 * writes it (`top-page.ts`, `LOGGED_OUT_MARK`; `top-page.test.ts` holds the two together).
 */
export const LOGGED_OUT_MARK = '<meta name="pine-top" content="logged-out">';

/** The token on the top page's Log out (`top-page.ts`): base64url, as `csrfToken` makes it. */
const LOGOUT_TOKEN = /<button type="button" class="top-logout" data-csrf="([A-Za-z0-9_-]+)">/u;

/** The CSRF token of the top page's Log out, or undefined where the page has none (logged out). */
export function csrfInTop(html: string): string | undefined {
  return LOGOUT_TOKEN.exec(html)?.[1];
}

/**
 * Who the top page says is asking: logged in with its token, logged out only by its mark on a
 * page with no account; anything else (a redirect, a refusal, a failure, the page of no map)
 * says neither, and throws.
 */
function whoTopSays(answer: TopPageAnswer): Me {
  if (answer.status === 200) {
    const token = csrfInTop(answer.html);
    if (token !== undefined) {
      return { loggedIn: true, name: '', csrf: token, member: false, readOnly: false };
    }
    if (answer.html.includes(LOGGED_OUT_MARK) && !answer.html.includes('top-account')) {
      return { loggedIn: false };
    }
  }
  throw new Error(`the top page said neither (${answer.status})`);
}

/**
 * Logs out of the top page (plan 8M-14) as the map does (`logOut`): with the page's token, and
 * when that is stale (the bot restarted and made a new key since the page loaded) once more with
 * the token of the top page asked anew, which has no `/api/me` of its own. Logged out only when
 * that page is the one for a visitor logged out (`LOGGED_OUT_MARK`); anything else fails.
 *
 * A failure after a stale token is `stale` (review BR-1, F5): after a restart `/` may lead
 * straight to the one map of theirs, which no fetch here follows, so every press would fail;
 * the page then loads `/` itself (`top.ts`), landing on that map or on a fresh page whose token
 * works. Any other failure is `failed`, said on the page.
 */
export async function topLogout(
  csrf: string,
  steps: TopLogoutSteps,
): Promise<'done' | 'stale' | 'failed'> {
  let posts = 0;
  let stale = false;
  const result = await logOut(csrf, {
    post: async (token) => {
      posts += 1;
      const status = await steps.post(token);
      // `logOut`'s rule: a 403 to the page's own token, the first POST, means it is stale.
      if (posts === 1 && status === 403) stale = true;
      return status;
    },
    me: async () => whoTopSays(await steps.page()),
  });
  return result === 'failed' && stale ? 'stale' : result;
}

/**
 * What the page does after `topLogout`: load `/` anew when logged out or when the token was
 * stale (F5), else stay and say that Log out failed.
 */
export function afterTopLogout(result: 'done' | 'stale' | 'failed'): 'load' | 'say' {
  return result === 'failed' ? 'say' : 'load';
}
