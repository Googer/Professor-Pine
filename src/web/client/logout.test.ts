import { describe, expect, it } from 'vitest';
import { logOut, type LogoutSteps } from './logout.js';
import type { Me } from './notice.js';

/** The page's side of logging out: the statuses the POSTs get, and what `/api/me` says. */
function steps(statuses: Array<number | Error>, me: Me | Error = { loggedIn: false }) {
  const posted: string[] = [];
  let asked = 0;
  const made: LogoutSteps = {
    post(csrf) {
      posted.push(csrf);
      const next = statuses.shift();
      if (next === undefined) return Promise.reject(new Error('nothing more to answer'));
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    me() {
      asked += 1;
      return me instanceof Error ? Promise.reject(me) : Promise.resolve(me);
    },
  };
  return { made, posted, asked: () => asked };
}

const LOGGED_IN = (csrf: string): Me => ({
  loggedIn: true,
  name: 'Ash',
  csrf,
  member: true,
  readOnly: false,
});

describe('logOut', () => {
  it('logs out with the token of the page', async () => {
    const { made, posted, asked } = steps([204]);
    expect(await logOut('old', made)).toBe('done');
    expect(posted).toEqual(['old']);
    expect(asked()).toBe(0);
  });

  it('asks for the token again once when the page has a stale one (after a restart)', async () => {
    const { made, posted } = steps([403, 204], LOGGED_IN('fresh'));
    expect(await logOut('old', made)).toBe('done');
    expect(posted).toEqual(['old', 'fresh']);
  });

  it('is done when the session is gone already', async () => {
    const { made, posted } = steps([403], { loggedIn: false });
    expect(await logOut('old', made)).toBe('done');
    expect(posted).toEqual(['old']);
  });

  it('fails when the second try is refused too, and tries no third time', async () => {
    const { made, posted } = steps([403, 403], LOGGED_IN('fresh'));
    expect(await logOut('old', made)).toBe('failed');
    expect(posted).toEqual(['old', 'fresh']);
  });

  it('fails on any other refusal or a broken connection, without asking again', async () => {
    for (const answer of [429, 500, new Error('offline')]) {
      const { made, posted, asked } = steps([answer], LOGGED_IN('fresh'));
      expect(await logOut('old', made), String(answer)).toBe('failed');
      expect(posted).toEqual(['old']);
      expect(asked()).toBe(0);
    }
  });

  it('counts only a 2xx as logged out, also on the second try', async () => {
    for (const status of [101, 199, 302, 304]) {
      expect(await logOut('old', steps([status]).made), String(status)).toBe('failed');
      expect(
        await logOut('old', steps([403, status], LOGGED_IN('fresh')).made),
        String(status),
      ).toBe('failed');
    }
    expect(await logOut('old', steps([200]).made)).toBe('done');
  });

  it('fails when the token cannot be asked for again', async () => {
    const { made } = steps([403], new Error('offline'));
    expect(await logOut('old', made)).toBe('failed');
  });
});
