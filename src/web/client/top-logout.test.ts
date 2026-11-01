import { describe, expect, it } from 'vitest';
import {
  afterTopLogout,
  csrfInTop,
  LOGGED_OUT_MARK,
  topLogout,
  type TopLogoutSteps,
  type TopPageAnswer,
} from './top-logout.js';

/** The top page's side of logging out: the statuses the POSTs get, and the answers of `/`. */
function steps(statuses: number[], pages: Array<TopPageAnswer | Error> = []) {
  const posted: string[] = [];
  let asked = 0;
  const made: TopLogoutSteps = {
    post(csrf) {
      posted.push(csrf);
      const next = statuses.shift();
      return next === undefined ? Promise.reject(new Error('nothing more')) : Promise.resolve(next);
    },
    page() {
      asked += 1;
      const next = pages.shift() ?? new Error('nothing more');
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  };
  return { made, posted, asked: () => asked };
}

const LOGGED_IN = (csrf: string): TopPageAnswer => ({
  status: 200,
  html: `<p class="top-account"><span>Logged in as <bdi>Ash</bdi></span><button type="button" class="top-logout" data-csrf="${csrf}">Log out</button></p>`,
});
const LOGGED_OUT: TopPageAnswer = {
  status: 200,
  html: `<head>${LOGGED_OUT_MARK}</head><p><a class="top-login" href="/auth/login?next=/">Log in with Discord</a></p>`,
};

describe('topLogout', () => {
  it('logs out with the token of the page', async () => {
    const { made, posted, asked } = steps([204]);
    expect(await topLogout('old', made)).toBe('done');
    expect(posted).toEqual(['old']);
    expect(asked()).toBe(0);
  });

  it('takes a new token from the top page once when the one it has is stale', async () => {
    const { made, posted } = steps([403, 204], [LOGGED_IN('new-token_1')]);
    expect(await topLogout('old', made)).toBe('done');
    expect(posted).toEqual(['old', 'new-token_1']);
  });

  it('is done when the top page shows the login: nobody logged in any more', async () => {
    const { made, posted } = steps([403], [LOGGED_OUT]);
    expect(await topLogout('old', made)).toBe('done');
    expect(posted).toEqual(['old']);
  });

  it('is stale when the token was and the top page says neither (a redirect, a refusal, a failure, no map), or cannot be asked (F5)', async () => {
    for (const page of [
      // A redirect to a map (`redirect: 'manual'`: an opaque answer, status 0).
      { status: 0, html: '' },
      { status: 302, html: '' },
      { status: 429, html: `<p>Too many requests. Try again in a minute.</p>${LOGGED_OUT_MARK}` },
      { status: 500, html: '<p>Something went wrong.</p>' },
      { status: 200, html: '<p>Professor Pine has no map here yet.</p>' },
      // The mark beside an account is no logged-out page.
      { status: 200, html: `${LOGGED_OUT_MARK}<p class="top-account">` },
      new Error('offline'),
    ]) {
      const { made, posted } = steps([403], [page]);
      // The page loads `/` anew (after a restart, the map), where Log out works again.
      expect(await topLogout('old', made), JSON.stringify(page)).toBe('stale');
      expect(posted).toEqual(['old']);
    }
    expect(await topLogout('old', steps([403, 403], [LOGGED_IN('new')]).made)).toBe('stale');
    expect(await topLogout('old', steps([403, 500], [LOGGED_IN('new')]).made)).toBe('stale');
  });

  it('fails without a stale token: the page stays, saying so', async () => {
    expect(await topLogout('old', steps([500]).made)).toBe('failed');
    expect(await topLogout('old', steps([302]).made)).toBe('failed');
    // A broken connection.
    expect(await topLogout('old', steps([]).made)).toBe('failed');
  });
});

describe('afterTopLogout', () => {
  it('loads the top page anew when logged out or when the token was stale, else says so (F5)', () => {
    expect(afterTopLogout('done')).toBe('load');
    expect(afterTopLogout('stale')).toBe('load');
    expect(afterTopLogout('failed')).toBe('say');
  });
});

describe('csrfInTop', () => {
  it("reads the token of the top page's Log out, and nothing else", () => {
    expect(csrfInTop(LOGGED_IN('abc-DEF_123').html)).toBe('abc-DEF_123');
    expect(csrfInTop(LOGGED_OUT.html)).toBeUndefined();
    expect(csrfInTop('<p data-csrf="x">a server named data-csrf</p>')).toBeUndefined();
  });
});
