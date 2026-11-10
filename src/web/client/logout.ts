import type { Me } from './notice.js';

/** What logging out needs of the page: the POST with a CSRF token, and `/api/me` again. */
export interface LogoutSteps {
  /** POSTs `/auth/logout` with this token; the status of the answer. */
  post(csrf: string): Promise<number>;
  /** Asks `/s/<guild>/api/me` again. */
  me(): Promise<Me>;
}

/** What the page says when logging out did not happen. */
export const LOGOUT_FAILED = 'Log out failed; try again.';

/** Whether an answer's status says it was done: a 2xx only (`fetch` follows redirects). */
const succeeded = (status: number): boolean => status >= 200 && status < 300;

/**
 * Logs out with the page's CSRF token. A 403 means the token is stale (the bot restarted and
 * made a new key since the page loaded): the token is asked for again and the POST tried once
 * more; a session that is gone by then is as good as logged out. Only a 2xx is done: any other
 * status, a second 403 or a broken connection is `failed`.
 */
export async function logOut(csrf: string, steps: LogoutSteps): Promise<'done' | 'failed'> {
  try {
    const first = await steps.post(csrf);
    if (succeeded(first)) return 'done';
    if (first !== 403) return 'failed';
    const me = await steps.me();
    if (!me.loggedIn) return 'done';
    return succeeded(await steps.post(me.csrf)) ? 'done' : 'failed';
  } catch {
    return 'failed';
  }
}
