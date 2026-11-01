import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import {
  cookieOf,
  FakeOAuth,
  setCookies,
  TEST_OWNER_ID,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';

const ASH = '700000000000000001';
const MAP = `/s/${FAKE_GUILD_ID}/map`;
const ME = `/s/${FAKE_GUILD_ID}/api/me`;

/** The text of a page's one inline script, as the browser hashes it. */
function inlineScript(page: string): string {
  const match = /<script>([\s\S]*?)<\/script>/.exec(page);
  expect(match, 'an inline script').not.toBeNull();
  return match?.[1] ?? '';
}

/** An attribute's value as a browser reads it: the entities `escapeHtml` writes, decoded. */
function decodeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

describe('logging in with Discord', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  /** Starts a login from the map; gives the state Discord is sent and the cookie that holds it. */
  async function started(made: TestWeb, next = MAP) {
    const answer = await made.app.inject({
      url: `/auth/login?next=${encodeURIComponent(next)}`,
    });
    expect(answer.statusCode).toBe(302);
    const location = new URL(String(answer.headers.location));
    return {
      state: location.searchParams.get('state') ?? '',
      cookie: cookieOf(answer, made.sessionService.secure ? '__Secure-pine_oauth' : 'pine_oauth'),
      answer,
      location,
    };
  }

  it('sends the member to Discord for their identity, with a state in a short-lived cookie', async () => {
    web = webServerWith({ members: new FakeMemberDirectory().add(ASH, 'Ash') });
    const { state, location, answer } = await started(web);
    expect(location.origin + location.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(location.searchParams.get('scope')).toBe('identify');
    expect(location.searchParams.get('client_id')).toBe('123456789012345678');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://map.example.test/auth/callback',
    );
    expect(state).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const [cookie] = setCookies(answer);
    expect(cookie).toMatch(
      /^__Secure-pine_oauth=[^;]+; Max-Age=600; Path=\/auth\/; HttpOnly; Secure; SameSite=Lax$/,
    );
  });

  it('starts a session when Discord sends the member back, and returns to the page', async () => {
    const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
    web = webServerWith({ oauth, members: new FakeMemberDirectory().add(ASH, 'Ash Ketchum') });
    const { state, cookie } = await started(web);
    const back = await web.app.inject({
      url: `/auth/callback?code=good-code&state=${state}`,
      headers: { cookie },
    });
    expect(back.statusCode).toBe(302);
    expect(back.headers.location).toBe(MAP);
    expect(setCookies(back)).toContainEqual(
      expect.stringMatching(/^__Secure-pine_oauth=; Max-Age=0; Path=\/auth\//),
    );
    const session = cookieOf(back, '__Host-pine_session');
    const me = await web.app.inject({ url: ME, headers: { cookie: session } });
    expect(me.json()).toMatchObject({ loggedIn: true, name: 'Ash', member: true, readOnly: false });
    expect(oauth.exchanged).toEqual([
      { code: 'good-code', redirectUri: 'https://map.example.test/auth/callback' },
    ]);
    // Never the code in the log.
    expect(JSON.stringify(web.entries)).not.toContain('good-code');
  });

  it('refuses a callback whose state is not the one it sent, and asks Discord nothing', async () => {
    const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
    web = webServerWith({ oauth });
    const { state, cookie } = await started(web);
    const refused = [
      { url: `/auth/callback?code=good-code&state=${state}x`, headers: { cookie } },
      { url: `/auth/callback?code=good-code&state=${state}`, headers: {} },
      { url: '/auth/callback?code=good-code', headers: { cookie } },
      {
        url: `/auth/callback?code=good-code&state=${state}`,
        headers: { cookie: '__Secure-pine_oauth=garbage' },
      },
    ];
    for (const request of refused) {
      const answer = await web.app.inject(request);
      expect(answer.statusCode, request.url).toBe(302);
      expect(String(answer.headers.location), request.url).toMatch(/\?login=failed$/);
      expect(setCookies(answer).some((c) => c.includes('pine_session='))).toBe(false);
    }
    expect(oauth.exchanged).toEqual([]);
    expect(web.sessions.rows.size).toBe(0);
  });

  it('reads the state over https from the __Secure- cookie alone, never one a sibling host set', async () => {
    const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
    web = webServerWith({ oauth });
    const { state, cookie } = await started(web);
    const tossed = cookie.replace(/^__Secure-pine_oauth=/, 'pine_oauth=');
    const answer = await web.app.inject({
      url: `/auth/callback?code=good-code&state=${state}`,
      headers: { cookie: tossed },
    });
    // No state was read, so neither was the page to return to.
    expect(answer.headers.location).toBe('/?login=failed');
    expect(oauth.exchanged).toEqual([]);
    expect(web.sessions.rows.size).toBe(0);
  });

  it('uses the plain cookie names on http of this machine, without Secure', async () => {
    const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
    web = webServerWith({ oauth, web: { publicUrl: 'http://localhost:8080' } });
    const { state, cookie, answer } = await started(web);
    expect(setCookies(answer)).toEqual([
      expect.stringMatching(
        /^pine_oauth=[^;]+; Max-Age=600; Path=\/auth\/; HttpOnly; SameSite=Lax$/,
      ),
    ]);
    const back = await web.app.inject({
      url: `/auth/callback?code=good-code&state=${state}`,
      headers: { cookie },
    });
    expect(back.headers.location).toBe(MAP);
    expect(setCookies(back)).toEqual([
      expect.stringMatching(/^pine_oauth=; Max-Age=0; Path=\/auth\/; HttpOnly; SameSite=Lax$/),
      expect.stringMatching(
        /^pine_session=[\w-]{43}; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax$/,
      ),
    ]);
  });

  it('says the login failed when Discord refuses, or the member declined', async () => {
    const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
    oauth.whoFails = true;
    web = webServerWith({ oauth });
    for (const query of ['code=bad-code', 'code=good-code', 'error=access_denied']) {
      const { state, cookie } = await started(web);
      const answer = await web.app.inject({
        url: `/auth/callback?${query}&state=${state}`,
        headers: { cookie },
      });
      expect(answer.headers.location, query).toBe(`${MAP}?login=failed`);
    }
    expect(web.sessions.rows.size).toBe(0);
    expect(JSON.stringify(web.entries)).not.toMatch(/bad-code|good-code/);
  });

  it('returns to the top page from a login started there, saying when it failed (plan 8M-14)', async () => {
    const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
    web = webServerWith({ oauth });
    for (const query of ['code=bad-code', 'error=access_denied']) {
      const { state, cookie } = await started(web, '/');
      const answer = await web.app.inject({
        url: `/auth/callback?${query}&state=${state}`,
        headers: { cookie },
      });
      expect(answer.headers.location, query).toBe('/?login=failed');
    }
    // A state that does not match its cookie (or no cookie at all) returns to the top page too.
    const { cookie } = await started(web, '/');
    const forged = await web.app.inject({
      url: '/auth/callback?code=good-code&state=AAAAAAAAAAAAAAAAAAAAAA',
      headers: { cookie },
    });
    expect(forged.headers.location).toBe('/?login=failed');
    const { state, cookie: kept } = await started(web, '/');
    const done = await web.app.inject({
      url: `/auth/callback?code=good-code&state=${state}`,
      headers: { cookie: kept },
    });
    expect(done.headers.location).toBe('/');
  });

  it('never sends the member anywhere but a page of a server here', async () => {
    const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
    web = webServerWith({ oauth });
    for (const next of [
      '//evil.example.test/',
      'https://evil.example.test/',
      '/\\evil.example.test',
    ]) {
      const { state, cookie } = await started(web, next);
      const answer = await web.app.inject({
        url: `/auth/callback?code=good-code&state=${state}`,
        headers: { cookie },
      });
      expect(answer.headers.location, next).toBe('/');
    }
  });

  it('is not offered without the client secret', async () => {
    web = webServerWith({ oauth: undefined });
    expect((await web.app.inject({ url: `/auth/login?next=${MAP}` })).statusCode).toBe(404);
    expect((await web.app.inject({ url: '/auth/callback?code=x&state=y' })).statusCode).toBe(404);
  });
});

describe('login links', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  /** Presses Continue on the page of a link: a form's POST from Pine's own page, empty. */
  const pressContinue = (made: TestWeb, url: string, headers: Record<string, string> = {}) =>
    made.app.inject({
      method: 'POST',
      url,
      headers: {
        origin: 'https://map.example.test',
        'content-type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      payload: '',
    });

  it('open a page that asks to continue, and log nobody in by GET or HEAD', async () => {
    web = webServerWith({ members: new FakeMemberDirectory().add(ASH, 'Ash') });
    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
    const url = `/auth/link/${FAKE_GUILD_ID}/${token}`;
    for (const method of ['GET', 'HEAD'] as const) {
      const opened = await web.app.inject({ method, url });
      expect(opened.statusCode, method).toBe(200);
      expect(opened.headers['content-type'], method).toMatch(/^text\/html/);
      expect(setCookies(opened), method).toEqual([]);
    }
    const page = (await web.app.inject({ url })).body;
    expect(page).toContain(`<form method="post" action="${url}" data-name="Ash">`);
    // Whose link it is, so that nobody is logged in as somebody else unawares.
    expect(page).toContain('<button type="submit">Continue as Ash</button>');
    // The page presses its button itself (Matt, 2026-10-25), by its one inline script, which the
    // CSP lets in by its hash alone (review fix 6): a preview or a prefetch runs no script, so it
    // spends nothing.
    const script = inlineScript(page);
    const hash = `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`;
    const opened = await web.app.inject({ url });
    const directives = String(opened.headers['content-security-policy']).split('; ');
    expect(directives.find((directive) => directive.startsWith('script-src '))).toBe(
      `script-src 'self' ${hash}`,
    );
    expect(page.match(/<script/g)).toHaveLength(1);
    expect(web.sessions.rows.size).toBe(0);
    // The link is still good.
    expect((await pressContinue(web, url)).headers.location).toBe(MAP);
  });

  it("name the link's account on the page as text", async () => {
    web = webServerWith();
    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, '<b>Ash</b> & "Pika"', web.clock.now);
    const page = (await web.app.inject({ url: `/auth/link/${FAKE_GUILD_ID}/${token}` })).body;
    expect(page).toContain(
      '<button type="submit">Continue as &lt;b&gt;Ash&lt;/b&gt; &amp; &quot;Pika&quot;</button>',
    );
    expect(page).not.toContain('<b>');
  });

  describe('their script (review fix 1)', () => {
    const NAME = '<b>Ash</b> & "Pika\'s"';

    /** The page of a fresh link of `NAME`. */
    async function linkPage(made: TestWeb): Promise<string> {
      const token = made.loginLinks.issue(FAKE_GUILD_ID, ASH, NAME, made.clock.now);
      return (await made.app.inject({ url: `/auth/link/${FAKE_GUILD_ID}/${token}` })).body;
    }

    /**
     * Runs the page's script against a small document of the page's form, its button and its
     * sentence, as a browser with or without `requestSubmit` (Safari before 16) would; the
     * attributes read as a browser reads them, entities decoded.
     */
    function runScript(page: string, withRequestSubmit: boolean) {
      const submits: string[] = [];
      const button = { disabled: false };
      const sentence = { textContent: 'the sentence' };
      const attribute = (name: string): string | null => {
        const match = new RegExp(`<form[^>]*\\s${name}="([^"]*)"`).exec(page);
        return match?.[1] === undefined ? null : decodeHtml(match[1]);
      };
      const form = {
        getAttribute: attribute,
        querySelector: (selector: string) => (selector === 'button' ? button : null),
        submit: () => submits.push(`submit, button disabled: ${String(button.disabled)}`),
        ...(withRequestSubmit
          ? {
              requestSubmit: () =>
                submits.push(`requestSubmit, button disabled: ${String(button.disabled)}`),
            }
          : {}),
      };
      const document = {
        querySelector: (selector: string) =>
          selector === 'form' ? form : selector === 'p' ? sentence : null,
      };
      runInNewContext(inlineScript(page), { document });
      return { submits, button, sentence };
    }

    it('submit the form once, then keep a second press from racing it', async () => {
      web = webServerWith();
      const ran = runScript(await linkPage(web), true);
      expect(ran.submits).toEqual(['requestSubmit, button disabled: false']);
      // A tap while the POST is on its way would land on ?login=expired once the link is spent.
      expect(ran.button.disabled).toBe(true);
      // The name as text, read from the page, never HTML built of it.
      expect(ran.sentence.textContent).toBe(`Logging you in as ${NAME}…`);
    });

    it('submit the form where the browser has no requestSubmit', async () => {
      web = webServerWith();
      const ran = runScript(await linkPage(web), false);
      expect(ran.submits).toEqual(['submit, button disabled: false']);
      expect(ran.button.disabled).toBe(true);
      expect(ran.sentence.textContent).toBe(`Logging you in as ${NAME}…`);
    });
  });

  it("lead an unknown, used, expired or other server's link straight to the page's notice", async () => {
    web = webServerWith();
    const used = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
    await pressContinue(web, `/auth/link/${FAKE_GUILD_ID}/${used}`);
    const stale = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now - 5 * 60_000);
    const elsewhere = web.loginLinks.issue('412345678901234999', ASH, 'Ash', web.clock.now);
    for (const token of ['A'.repeat(43), used, stale, elsewhere]) {
      for (const [suffix, page] of [
        ['', MAP],
        ['/edit', `/s/${FAKE_GUILD_ID}/regions/edit`],
      ] as const) {
        const opened = await web.app.inject({
          url: `/auth/link/${FAKE_GUILD_ID}/${token}${suffix}`,
        });
        expect(opened.statusCode, token).toBe(303);
        expect(opened.headers.location, token).toBe(`${page}?login=expired`);
        expect(setCookies(opened)).toEqual([]);
      }
    }
  });

  it('serve no script file of their own: the page carries its script', async () => {
    web = webServerWith();
    expect((await web.app.inject({ url: '/auth/continue.js' })).statusCode).toBe(404);
  });

  it('log the member in once when the page continues, and lead to the map without the token', async () => {
    web = webServerWith({ members: new FakeMemberDirectory().add(ASH, 'Ash') });
    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
    const url = `/auth/link/${FAKE_GUILD_ID}/${token}`;
    const first = await pressContinue(web, url);
    expect(first.statusCode).toBe(303);
    expect(first.headers.location).toBe(MAP);
    const session = cookieOf(first, '__Host-pine_session');
    const me = await web.app.inject({ url: ME, headers: { cookie: session } });
    expect(me.json()).toMatchObject({ loggedIn: true, name: 'Ash', member: true });
    const again = await pressContinue(web, url);
    expect(again.statusCode).toBe(303);
    expect(again.headers.location).toBe(`${MAP}?login=expired`);
    expect(setCookies(again)).toEqual([]);
    expect(JSON.stringify(web.entries)).not.toContain(token);
  });

  it('are used only from a page of Pine', async () => {
    web = webServerWith();
    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
    const url = `/auth/link/${FAKE_GUILD_ID}/${token}`;
    for (const origin of ['https://evil.example.test', 'null', '']) {
      const refused = await pressContinue(web, url, { origin });
      expect(refused.statusCode, origin).toBe(403);
    }
    const noOrigin = await web.app.inject({ method: 'POST', url });
    expect(noOrigin.statusCode).toBe(403);
    expect(web.sessions.rows.size).toBe(0);
    expect((await pressContinue(web, url)).headers.location).toBe(MAP);
  });

  it('end the session the browser had before', async () => {
    web = webServerWith();
    const before = await web.loggedIn('700000000000000002', 'Misty');
    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
    const answer = await pressContinue(web, `/auth/link/${FAKE_GUILD_ID}/${token}`, {
      cookie: before,
    });
    expect(answer.headers.location).toBe(MAP);
    expect([...web.sessions.rows.values()].map((row) => row.userName)).toEqual(['Ash']);
    const old = await web.app.inject({ url: ME, headers: { cookie: before } });
    expect(old.json()).toEqual({ loggedIn: false });
  });

  it('expire after five minutes, and count only for their own server', async () => {
    web = webServerWith();
    const late = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
    const elsewhere = web.loginLinks.issue('412345678901234999', ASH, 'Ash', web.clock.now);
    web.clock.now += 5 * 60_000;
    const answer = await pressContinue(web, `/auth/link/${FAKE_GUILD_ID}/${late}`);
    expect(answer.headers.location).toBe(`${MAP}?login=expired`);
    web.clock.now -= 5 * 60_000;
    const wrong = await pressContinue(web, `/auth/link/${FAKE_GUILD_ID}/${elsewhere}`);
    expect(wrong.headers.location).toBe(`${MAP}?login=expired`);
    expect(web.sessions.rows.size).toBe(0);
  });

  it('of /region edit open the region editor, and lead there when they have expired', async () => {
    web = webServerWith({ members: new FakeMemberDirectory().add(ASH, 'Ash') });
    const editor = `/s/${FAKE_GUILD_ID}/regions/edit`;
    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now, 'regions/edit');
    const url = `/auth/link/${FAKE_GUILD_ID}/${token}/edit`;
    const page = (await web.app.inject({ url })).body;
    expect(page).toContain('the region editor of this server');
    expect(page).toContain(`<form method="post" action="${url}" data-name="Ash">`);
    const first = await pressContinue(web, url);
    expect(first.headers.location).toBe(editor);
    expect(web.sessions.rows.size).toBe(1);
    expect((await pressContinue(web, url)).headers.location).toBe(`${editor}?login=expired`);
    // A link of /maps opens the map, whichever address it comes by.
    const mapToken = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
    const opened = await pressContinue(web, `/auth/link/${FAKE_GUILD_ID}/${mapToken}/edit`);
    expect(opened.headers.location).toBe(MAP);
  });

  it('of /maps in a region open the map on that region, and the whole map once expired', async () => {
    web = webServerWith({ members: new FakeMemberDirectory().add(ASH, 'Ash') });
    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now, 'map', 7);
    const url = `/auth/link/${FAKE_GUILD_ID}/${token}`;
    const first = await pressContinue(web, url);
    expect(first.statusCode).toBe(303);
    expect(first.headers.location).toBe(`${MAP}?region=7`);
    expect((await pressContinue(web, url)).headers.location).toBe(`${MAP}?login=expired`);
  });

  it('of a server the bot is not in are not found', async () => {
    web = webServerWith();
    const token = web.loginLinks.issue('412345678901234999', ASH, 'Ash', web.clock.now);
    for (const url of [`/auth/link/412345678901234999/${token}`, `/auth/link/abc/${token}`]) {
      expect((await web.app.inject({ url })).statusCode, url).toBe(404);
      expect((await pressContinue(web, url)).statusCode, url).toBe(404);
    }
  });
});

describe('who is asking', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('is a member of the server or not, asked anew for each server', async () => {
    const members = new FakeMemberDirectory().add(ASH, 'Ash');
    web = webServerWith({
      members,
      servers: { has: (guild) => guild === FAKE_GUILD_ID || guild === '412345678901234999' },
    });
    const cookie = await web.loggedIn(ASH, 'Ash');
    const here = (await web.app.inject({ url: ME, headers: { cookie } })).json<object>();
    expect(here).toEqual({
      loggedIn: true,
      name: 'Ash',
      // Whose the page's staged region edits are (plan 8M-11C, S31).
      userId: ASH,
      member: true,
      readOnly: false,
      mayEditRegions: false,
      csrf: expect.any(String) as string,
    });
    const there = await web.app.inject({
      url: '/s/412345678901234999/api/me',
      headers: { cookie },
    });
    expect(there.json()).toMatchObject({ loggedIn: true, member: false, readOnly: false });
    expect(members.asked).toEqual([`${FAKE_GUILD_ID}:${ASH}`, `412345678901234999:${ASH}`]);
  });

  it("is no member without the map's member role, when the settings name one", async () => {
    const members = new FakeMemberDirectory().add(ASH, 'Ash');
    const map = webServerWith({ members, web: { memberRole: 'Verified' } });
    web = map;
    const cookie = await map.loggedIn(ASH, 'Ash');
    const ask = async () => (await map.app.inject({ url: ME, headers: { cookie } })).json<object>();
    // In the server without the role: told which role lets them do more.
    expect(await ask()).toMatchObject({
      loggedIn: true,
      member: false,
      readOnly: false,
      missingRole: 'Verified',
    });
    members.standing(ASH, { roleNames: ['Trainer'], administrator: false });
    expect(await ask()).toMatchObject({ member: false, missingRole: 'Verified' });
    // By name, as Pine's other role settings: trimmed, whatever its letter case.
    members.standing(ASH, { roleNames: ['Trainer', ' VERIFIED '], administrator: false });
    expect(await ask()).toMatchObject({ member: true, readOnly: false });
    expect(await ask()).not.toHaveProperty('missingRole');
    members.standing(ASH, { roleNames: [], administrator: true });
    expect(await ask()).toMatchObject({ member: true });
  });

  it('may edit regions, as a hint, by what the directory says of the member (plan 8M-10)', async () => {
    const members = new FakeMemberDirectory().add(ASH, 'Ash');
    // The map's member role does not concern staff: the hint is judged on the member as found.
    const map = webServerWith({ members, web: { memberRole: 'Verified' } });
    web = map;
    const cookie = await map.loggedIn(ASH, 'Ash');
    const ask = async () => (await map.app.inject({ url: ME, headers: { cookie } })).json<object>();
    expect(await ask()).toMatchObject({ mayEditRegions: false });
    members.standing(ASH, { roleNames: ['Moderator'], administrator: false, manageGuild: false });
    expect(await ask()).toMatchObject({ mayEditRegions: false });
    members.standing(ASH, { roleNames: ['Moderator'], administrator: false, manageGuild: true });
    expect(await ask()).toMatchObject({ member: false, mayEditRegions: true });
    members.standing(ASH, { roleNames: ['Trainer'], administrator: true, manageGuild: true });
    expect(await ask()).toMatchObject({ mayEditRegions: false });
    // The bot's owner, as `/region`'s guard admits them.
    const owner = await map.loggedIn(TEST_OWNER_ID, 'Owner');
    members.add(TEST_OWNER_ID, 'Owner').standing(TEST_OWNER_ID, {
      roleNames: [],
      administrator: false,
      manageGuild: true,
    });
    const asOwner = await map.app.inject({ url: ME, headers: { cookie: owner } });
    expect(asOwner.json()).toMatchObject({ mayEditRegions: true });
    // Nobody in the server, and Discord away: no hint.
    members.remove(ASH);
    expect(await ask()).toMatchObject({ mayEditRegions: false });
    members.failing = new Error('Discord is away');
    expect(await ask()).toMatchObject({ readOnly: true, mayEditRegions: false });
  });

  it('names no role to somebody who is not in the server', async () => {
    const members = new FakeMemberDirectory();
    const map = webServerWith({ members, web: { memberRole: 'Verified' } });
    web = map;
    const cookie = await map.loggedIn(ASH, 'Ash');
    const me = (await map.app.inject({ url: ME, headers: { cookie } })).json<object>();
    expect(me).toMatchObject({ loggedIn: true, member: false });
    expect(me).not.toHaveProperty('missingRole');
  });

  // Plan 8M-11B: the server's invite, from the settings, only for one logged in and not in it.
  it("gives the server's invite to somebody logged in who is not in it, and to nobody else", async () => {
    const members = new FakeMemberDirectory();
    const invite = 'https://discord.gg/pinetest';
    const map = webServerWith({
      members,
      web: { memberRole: 'Verified', invites: { [FAKE_GUILD_ID]: invite } },
      servers: { has: (guild) => guild === FAKE_GUILD_ID || guild === '412345678901234999' },
    });
    web = map;
    const cookie = await map.loggedIn(ASH, 'Ash');
    const ask = async (url = ME, headers: Record<string, string> = { cookie }) =>
      (await map.app.inject({ url, headers })).json<object>();
    expect(await ask()).toMatchObject({ loggedIn: true, member: false, invite });
    // A server without one in the settings: none.
    expect(await ask('/s/412345678901234999/api/me')).not.toHaveProperty('invite');
    // Logged out (they may be a member who has not logged in): none.
    expect(await ask(ME, {})).toEqual({ loggedIn: false });
    // In the server without the map's member role: the role is named, no invite.
    members.add(ASH, 'Ash');
    expect(await ask()).toMatchObject({ member: false, missingRole: 'Verified' });
    expect(await ask()).not.toHaveProperty('invite');
    // A member: none.
    members.standing(ASH, { roleNames: ['Verified'], administrator: false });
    expect(await ask()).toMatchObject({ member: true });
    expect(await ask()).not.toHaveProperty('invite');
    // Discord cannot say whether they are in it: read-only, no invite.
    members.failing = new Error('Discord is away');
    expect(await ask()).toMatchObject({ readOnly: true });
    expect(await ask()).not.toHaveProperty('invite');
  });

  it('is read-only when Discord cannot say whether they are a member', async () => {
    const members = new FakeMemberDirectory().add(ASH, 'Ash');
    members.failing = new Error('Discord is away');
    web = webServerWith({ members });
    const cookie = await web.loggedIn(ASH, 'Ash');
    const me = await web.app.inject({ url: ME, headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ loggedIn: true, member: false, readOnly: true });
  });

  it('asks Discord nothing about somebody who is not logged in', async () => {
    const members = new FakeMemberDirectory();
    web = webServerWith({ members });
    expect((await web.app.inject({ url: ME })).json()).toEqual({ loggedIn: false });
    expect(members.asked).toEqual([]);
  });
});

describe('the rate of logins', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('is at most 20 a minute per address', async () => {
    web = webServerWith();
    const ask = (remoteAddress: string) =>
      web?.app.inject({ url: `/auth/link/${FAKE_GUILD_ID}/x`, remoteAddress });
    for (let i = 0; i < 20; i += 1) expect((await ask('203.0.113.7'))?.statusCode).toBe(303);
    const refused = await ask('203.0.113.7');
    expect(refused?.statusCode).toBe(429);
    expect(refused?.headers['retry-after']).toBe('60');
    expect((await ask('203.0.113.8'))?.statusCode).toBe(303);
    web.clock.now += 60_000;
    expect((await ask('203.0.113.7'))?.statusCode).toBe(303);
  });

  /**
   * Asks for a login link (an unknown one, led to the map) from a peer, with the headers a proxy
   * or a visitor may send.
   */
  const askFrom = (made: TestWeb, peer: string, headers: Record<string, string> = {}) =>
    made.app.inject({ url: `/auth/link/${FAKE_GUILD_ID}/x`, remoteAddress: peer, headers });

  it('counts by the visitor a trusted tunnel names last in X-Forwarded-For', async () => {
    const made = webServerWith({ web: { trustProxy: true } });
    web = made;
    // What the visitor wrote in the header themselves comes first, and is not believed.
    const forwarded = (spoofed: string) => ({ 'x-forwarded-for': `${spoofed}, 198.51.100.1` });
    for (let i = 0; i < 20; i += 1) {
      expect((await askFrom(made, '127.0.0.1', forwarded(`6.6.6.${i}`))).statusCode).toBe(303);
    }
    expect((await askFrom(made, '127.0.0.1', forwarded('6.6.6.6'))).statusCode).toBe(429);
    const other = { 'x-forwarded-for': '6.6.6.6, 198.51.100.2' };
    expect((await askFrom(made, '127.0.0.1', other)).statusCode).toBe(303);
  });

  it('counts by the peer when the peer is no nearby proxy, whatever it forwards', async () => {
    const made = webServerWith({ web: { trustProxy: true } });
    web = made;
    for (let i = 0; i < 20; i += 1) {
      const headers = { 'x-forwarded-for': `6.6.6.6, 198.51.100.${i}` };
      expect((await askFrom(made, '203.0.113.7', headers)).statusCode).toBe(303);
    }
    const headers = { 'x-forwarded-for': '6.6.6.6, 198.51.100.99' };
    expect((await askFrom(made, '203.0.113.7', headers)).statusCode).toBe(429);
  });

  it('believes no CF-Connecting-IP, even from a nearby peer', async () => {
    const made = webServerWith({ web: { trustProxy: true } });
    web = made;
    for (let i = 0; i < 20; i += 1) {
      const headers = { 'cf-connecting-ip': `198.51.100.${i}` };
      expect((await askFrom(made, '127.0.0.1', headers)).statusCode).toBe(303);
    }
    const headers = { 'cf-connecting-ip': '198.51.100.99' };
    expect((await askFrom(made, '127.0.0.1', headers)).statusCode).toBe(429);
  });

  it('counts the addresses of one IPv6 /64 together', async () => {
    const made = webServerWith();
    web = made;
    for (let i = 0; i < 20; i += 1) {
      expect((await askFrom(made, `2001:db8:1:2::${i + 1}`)).statusCode).toBe(303);
    }
    expect((await askFrom(made, '2001:db8:1:2:ffff::1')).statusCode).toBe(429);
    expect((await askFrom(made, '2001:db8:1:3::1')).statusCode).toBe(303);
  });
});
