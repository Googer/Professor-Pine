import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { setCookies, webServerWith, type TestWeb } from '../../test/support/web.js';
import { SESSION_MS } from './session-model.js';
import { sessionCookie, sessionHash, clearedSessionCookie } from './sessions.js';

const HOUR_MS = 3_600_000;
const ME = `/s/${FAKE_GUILD_ID}/api/me`;

describe('the session cookie', () => {
  it('is for the server alone, sent from its own pages and links, for 30 days', () => {
    expect(sessionCookie(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MS / 1000,
    });
    expect(SESSION_MS).toBe(30 * 24 * HOUR_MS);
    // A public address of this machine in plain http cannot keep a Secure cookie.
    expect(sessionCookie(false).secure).toBe(false);
    expect(clearedSessionCookie(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  });

  it('is stored by the SHA-256 of its value, never the value', () => {
    expect(sessionHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('sessions on the web server', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('knows who a request with a session is, and nobody without one', async () => {
    web = webServerWith();
    const cookie = await web.loggedIn('700000000000000001', 'Ash');
    const answer = await web.app.inject({ url: ME, headers: { cookie } });
    expect(answer.json()).toMatchObject({ loggedIn: true, name: 'Ash' });
    expect((await web.app.inject({ url: ME })).json()).toEqual({ loggedIn: false });
    const unknown = `__Host-pine_session=${'A'.repeat(43)}`;
    expect((await web.app.inject({ url: ME, headers: { cookie: unknown } })).json()).toEqual({
      loggedIn: false,
    });
    const odd = `__Host-pine_session=not a token`;
    expect((await web.app.inject({ url: ME, headers: { cookie: odd } })).json()).toEqual({
      loggedIn: false,
    });
  });

  it('keeps a session that is used for 30 days from its last use, renewed at most hourly', async () => {
    web = webServerWith();
    const cookie = await web.loggedIn('700000000000000001', 'Ash');
    const [row] = [...web.sessions.rows.values()];
    if (!row) throw new Error('no session');
    const started = row.createdAt;

    web.clock.now = started + HOUR_MS - 1;
    const soon = await web.app.inject({ url: ME, headers: { cookie } });
    expect(soon.headers['set-cookie']).toBeUndefined();
    expect(web.sessions.rows.get(row.id)?.lastUsedAt).toBe(started);

    web.clock.now = started + HOUR_MS;
    const later = await web.app.inject({ url: ME, headers: { cookie } });
    expect(later.json()).toMatchObject({ loggedIn: true });
    expect(String(later.headers['set-cookie'])).toMatch(
      new RegExp(
        `^__Host-pine_session=[\\w-]{43}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax$`,
      ),
    );
    expect(web.sessions.rows.get(row.id)).toMatchObject({
      lastUsedAt: started + HOUR_MS,
      expiresAt: started + HOUR_MS + SESSION_MS,
    });

    web.clock.now = started + HOUR_MS + SESSION_MS;
    expect((await web.app.inject({ url: ME, headers: { cookie } })).json()).toEqual({
      loggedIn: false,
    });
  });

  it('is a __Host- cookie over https, so that no other host of the domain can set or shadow it', async () => {
    web = webServerWith();
    const token = web.loginLinks.issue(FAKE_GUILD_ID, '700000000000000001', 'Ash', web.clock.now);
    const answer = await web.app.inject({
      method: 'POST',
      url: `/auth/link/${FAKE_GUILD_ID}/${token}`,
      headers: { origin: 'https://map.example.test' },
    });
    const [cookie = ''] = setCookies(answer);
    expect(cookie).toMatch(
      /^__Host-pine_session=[\w-]{43}; Max-Age=2592000; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
    );
    const value = cookie.split(';')[0]?.split('=')[1] ?? '';
    const me = (name: string) =>
      web?.app.inject({ url: ME, headers: { cookie: `${name}=${value}` } });
    expect((await me('__Host-pine_session'))?.json()).toMatchObject({ loggedIn: true });
    // What a sibling host could set: the plain name is not read over https.
    expect((await me('pine_session'))?.json()).toEqual({ loggedIn: false });
  });

  it('is plain pine_session on http of this machine, where a browser keeps no Secure cookie', async () => {
    web = webServerWith({ web: { publicUrl: 'http://localhost:8080' } });
    const token = web.loginLinks.issue(FAKE_GUILD_ID, '700000000000000001', 'Ash', web.clock.now);
    const answer = await web.app.inject({
      method: 'POST',
      url: `/auth/link/${FAKE_GUILD_ID}/${token}`,
      headers: { origin: 'http://localhost:8080' },
    });
    const [cookie = ''] = setCookies(answer);
    expect(cookie).toMatch(
      /^pine_session=[\w-]{43}; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax$/,
    );
    const me = await web.app.inject({ url: ME, headers: { cookie: cookie.split(';')[0] ?? '' } });
    expect(me.json()).toMatchObject({ loggedIn: true });
  });

  it('has the expired sessions deleted by the sweep', async () => {
    web = webServerWith();
    await web.loggedIn('700000000000000001', 'Ash');
    web.clock.now += SESSION_MS;
    await web.loggedIn('700000000000000002', 'Misty');
    expect(await web.sessionService.sweep()).toBe(1);
    expect([...web.sessions.rows.values()].map((row) => row.userName)).toEqual(['Misty']);
  });
});

describe('logging out', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  /** A logged-in member and what a page of theirs sends with a POST. */
  async function member(made: TestWeb) {
    const cookie = await made.loggedIn('700000000000000001', 'Ash');
    const me = (await made.app.inject({ url: ME, headers: { cookie } })).json<{ csrf: string }>();
    return { cookie, csrf: me.csrf, origin: 'https://map.example.test' };
  }

  it('deletes the session and the cookie', async () => {
    web = webServerWith();
    const { cookie, csrf, origin } = await member(web);
    const answer = await web.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie, origin, 'x-pine-csrf': csrf },
    });
    expect(answer.statusCode).toBe(204);
    expect(String(answer.headers['set-cookie'])).toMatch(
      new RegExp(`^__Host-pine_session=; Max-Age=0; Path=/`),
    );
    expect(web.sessions.rows.size).toBe(0);
    expect((await web.app.inject({ url: ME, headers: { cookie } })).json()).toEqual({
      loggedIn: false,
    });
  });

  it('refuses a request from another page, or without the token of the session', async () => {
    web = webServerWith();
    const { cookie, csrf, origin } = await member(web);
    const altered = `${csrf.slice(0, -1)}${csrf.endsWith('A') ? 'B' : 'A'}`;
    const refused = [
      { cookie, 'x-pine-csrf': csrf },
      { cookie, origin: 'https://evil.example.test', 'x-pine-csrf': csrf },
      { cookie, origin: 'https://map.example.test.evil.test', 'x-pine-csrf': csrf },
      { cookie, origin },
      { cookie, origin, 'x-pine-csrf': altered },
      { cookie, origin, 'x-pine-csrf': 'short' },
      { origin, 'x-pine-csrf': csrf },
    ];
    for (const headers of refused) {
      const answer = await web.app.inject({ method: 'POST', url: '/auth/logout', headers });
      expect(answer.statusCode, JSON.stringify(headers)).toBe(403);
    }
    expect(web.sessions.rows.size).toBe(1);
  });

  it("refuses another session's token", async () => {
    web = webServerWith();
    const { cookie, origin } = await member(web);
    const other = await member(web);
    const answer = await web.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie, origin, 'x-pine-csrf': other.csrf },
    });
    expect(answer.statusCode).toBe(403);
  });

  it('refuses a body larger than 16 KB', async () => {
    web = webServerWith();
    const { cookie, csrf, origin } = await member(web);
    const answer = await web.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie, origin, 'x-pine-csrf': csrf, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'x'.repeat(17 * 1024) }),
    });
    expect(answer.statusCode).toBe(413);
    expect(web.sessions.rows.size).toBe(1);
  });
});
