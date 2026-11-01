import { afterEach, describe, expect, it } from 'vitest';
import { REASK_MS } from '../domain/script-access/access.js';
import { accessRequest, ADMIN, OTHER_ADMIN } from '../../test/support/script-access-cases.js';
import {
  builtAssets,
  toolWebWith,
  webServerWith,
  WEB_START,
  type TestWeb,
} from '../../test/support/web.js';
import { sessionHash } from './sessions.js';
import { OWNER_LOGIN_MS } from './tool-routes.js';

const PAGE = '/userscript';
const OWNER = '200000000000000029';
const HOUR = 3_600_000;

/** The web server with the tool of `toolWebWith` and the bundle built; the owner is `OWNER`. */
function toolWeb(options: Parameters<typeof toolWebWith>[0] = {}) {
  const tool = toolWebWith({ ownerId: OWNER, ...options });
  const web = webServerWith({ tool, assets: builtAssets() });
  return { tool, web };
}

/** The page as somebody logged in sees it. */
async function pageOf(web: TestWeb, userId: string, name = 'Ash') {
  const cookie = await web.loggedIn(userId, name);
  return web.app.inject({ url: PAGE, headers: { cookie } });
}

/** A POST of the page, with the headers of Pine's own page for somebody. */
async function post(web: TestWeb, headers: Record<string, string>, body: unknown) {
  return web.app.inject({ method: 'POST', url: PAGE, headers, payload: body as object });
}

/** Ash's request, approved: the key the owner's approval made. */
async function approvedAsh(tool: ReturnType<typeof toolWebWith>) {
  const { access } = await tool.store.ask(accessRequest());
  const decided = await tool.access.decide(access.id, 'approve', 'asked');
  if (decided.kind !== 'decided' || decided.access.key === null) throw new Error('not approved');
  return { id: access.id, key: decided.access.key };
}

describe('the page /userscript', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('says only that it is not available where there is no tool file or no login', async () => {
    for (const made of [
      webServerWith({ assets: builtAssets() }),
      webServerWith({ tool: toolWebWith({ script: null }), assets: builtAssets() }),
      webServerWith({ tool: toolWebWith(), oauth: undefined, assets: builtAssets() }),
    ]) {
      web = made;
      const cookie = await web.loggedIn(ADMIN, 'Ash');
      const answer = await web.app.inject({ url: PAGE, headers: { cookie } });
      expect(answer.statusCode).toBe(404);
      expect(answer.headers['cache-control']).toBe('no-store');
      expect(answer.body).toContain('<p>Not available on this Pine.</p></main></body>');
      expect(answer.body).not.toMatch(/Wayspot|tool|Log in/i);
      await web.app.close();
    }
    web = undefined;
  });

  it('tells a visitor what it is and offers the login, back to this page', async () => {
    ({ web } = toolWeb());
    const answer = await web.app.inject({ url: PAGE });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('no-store');
    expect(answer.body).toContain(
      'Professor Pine&#39;s Wayspot export tool, for the admins of servers that run Pine.',
    );
    expect(answer.body).toContain(
      '<a href="/auth/login?next=%2Fuserscript">Log in with Discord</a>',
    );
    const failed = await web.app.inject({ url: `${PAGE}?login=failed` });
    expect(failed.body).toContain('Login failed.');
  });

  it('asks a member who has no access which community they run Pine for', async () => {
    ({ web } = toolWeb());
    const cookie = await web.loggedIn(ADMIN, 'Ash');
    const answer = await web.app.inject({ url: PAGE, headers: { cookie } });
    expect(answer.statusCode).toBe(200);
    expect(answer.body).toContain('Which community do you run Pine for?');
    expect(answer.body).toMatch(/<input id="community"[^>]* maxlength="200" required/);
    expect(answer.body).toContain(
      '<button type="button" data-action="ask">Ask for access</button>',
    );
    // The page's own script and style, its CSRF token on <body>, nothing inline.
    const token = web.sessionService.csrfToken({
      id: sessionHash(cookie.split('=')[1] ?? ''),
    });
    expect(answer.body).toContain(`<body data-csrf="${token}">`);
    expect(answer.body).toContain('<script src="/assets/userscript-OPQRSTUV.js" defer></script>');
    expect(answer.body).toContain('<link rel="stylesheet" href="/assets/userscript-WXYZABCD.css">');
    // It follows the device's light or dark (plan 8M-7).
    expect(answer.body).toContain('<meta name="color-scheme" content="light dark">');
    expect(answer.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>|\sstyle=|\son[a-z]+=/);
  });

  it('says a request waits, a refusal stands for 30 days, and access was withdrawn', async () => {
    const made = toolWeb();
    ({ web } = made);
    const { access } = await made.tool.store.ask(accessRequest());
    expect((await pageOf(web, ADMIN)).body).toContain('Your request is waiting for the owner.');

    await made.tool.access.decide(access.id, 'refuse', 'asked');
    const refused = (await pageOf(web, ADMIN)).body;
    expect(refused).toContain('Your request was refused.');
    expect(refused).not.toContain('data-action="ask"');
    // The refusal at 2026-10-16 12:00 UTC stands 30 days: in New York's time, as the posts.
    expect(refused).toContain('You may ask again from November 15, 2026 at 7:00 AM EST.');
    web.clock.now = made.tool.clock.now + REASK_MS;
    const later = (await pageOf(web, ADMIN)).body;
    expect(later).toContain('Your request was refused.');
    expect(later).toContain('data-action="ask"');
    expect(later).not.toContain('You may ask again');

    await made.tool.store.decide(access.id, {
      decision: 'approve',
      from: 'refused',
      key: 'b'.repeat(64),
      at: 1,
    });
    await made.tool.access.decide(access.id, 'revoke', 'approved');
    const revoked = (await pageOf(web, ADMIN)).body;
    expect(revoked).toContain('Your access was withdrawn.');
    expect(revoked).not.toContain('b'.repeat(64));
  });

  it('gives an approved member the install link, the version, the changelog and a new link', async () => {
    const made = toolWeb();
    ({ web } = made);
    const { key } = await approvedAsh(made.tool);
    const page = (await pageOf(web, ADMIN)).body;
    const link = `https://map.example.test/userscript/${key}/pine-wayspot-export.user.js`;
    expect(page).toContain(`<a class="install" href="${link}">Install</a>`);
    expect(page).toContain(`<code>${link}</code>`);
    expect(page).toContain('Version 1.2.0');
    expect(page).toContain('<h3>1.2.0</h3>');
    expect(page).toContain('Fixes &lt;b&gt;one&lt;/b&gt; thing.');
    expect(page).toContain('<h3>1.0.1</h3>');
    expect(page).not.toContain('<h3>1.0.0</h3>');
    expect(page).toContain(
      '<button type="button" data-action="new-link" data-confirm="Press again to make a new link">Make a new link</button>',
    );
    expect(page).toContain(
      'A new link must be installed again: the copy installed from the old link keeps working, but gets no more updates.',
    );
  });

  it('shows the changelog’s list items as a list and its other lines as paragraphs, as text', async () => {
    const made = toolWeb({
      changelog: [
        '## 1.2.0',
        '',
        'A release for <i>autumn</i>.',
        'A second line.',
        '',
        '- Fixes <b>one</b> thing.',
        '- ',
        '-',
        '- Fixes another,',
        '  in two lines.',
        '-Not an item.',
        '',
      ].join('\n'),
    });
    ({ web } = made);
    await approvedAsh(made.tool);
    const page = (await pageOf(web, ADMIN)).body;
    // The entry's line breaks kept; an item with nothing in it left out.
    expect(page).toContain(
      '<h3>1.2.0</h3>\n' +
        '<p class="changes">A release for &lt;i&gt;autumn&lt;/i&gt;.<br>A second line.</p>\n' +
        '<ul class="changes">\n' +
        '<li>Fixes &lt;b&gt;one&lt;/b&gt; thing.</li>\n' +
        '<li>Fixes another,<br>in two lines.</li>\n' +
        '</ul>\n' +
        '<p class="changes">-Not an item.</p>',
    );
    expect(page).not.toContain('<li></li>');
    expect(page).not.toContain('- Fixes');
    expect(page).not.toContain('<pre');
  });

  it('lists every request for the owner, with what can be decided of each', async () => {
    const made = toolWeb();
    ({ web } = made);
    const ash = await made.tool.store.ask(
      accessRequest({ name: 'Ash <b>', community: 'See https://evil.example.test now' }),
    );
    const misty = await made.tool.store.ask(
      accessRequest({ userId: OTHER_ADMIN, name: 'Misty', at: WEB_START + 1 }),
    );
    await made.tool.access.decide(misty.access.id, 'approve', 'asked');
    const page = (await pageOf(web, OWNER, 'Matt')).body;
    expect(page).toContain('<button type="button" data-action="my-link">Make my link</button>');
    expect(page).toContain('Ash &lt;b&gt;');
    // The community line cannot be followed as a link: a zero-width space breaks its address.
    expect(page).not.toContain('https://evil.example.test');
    expect(page).toContain(
      `<button type="button" data-action="approve" data-id="${ash.access.id}" data-from="asked" data-asked="${ash.access.askedAt}">Approve</button>`,
    );
    expect(page).toContain(
      `<button type="button" data-action="refuse" data-id="${ash.access.id}" data-from="asked" data-asked="${ash.access.askedAt}">Refuse</button>`,
    );
    expect(page).toContain(
      `<button type="button" data-action="revoke" data-id="${misty.access.id}" data-from="approved" data-asked="${misty.access.askedAt}" data-confirm="Press again to revoke">Revoke</button>`,
    );
    expect(page).toContain('<td>Oct 16, 2026, 8:00 AM EDT</td>');
  });

  it('leaves the owner’s own row out of the list: their link is above it', async () => {
    const made = toolWeb();
    ({ web } = made);
    const owner = await web.posting(OWNER, 'Matt');
    expect((await post(web, owner, { action: 'my-link' })).statusCode).toBe(200);
    const mine = await made.tool.store.byUser(OWNER);
    const alone = (await pageOf(web, OWNER, 'Matt')).body;
    expect(alone).toContain('class="install"');
    expect(alone).not.toContain(`data-id="${mine?.id}"`);
    expect(alone).not.toContain(`<small>${OWNER}</small>`);
    expect(alone).toContain('Nobody has asked yet.');
    const ash = await made.tool.store.ask(accessRequest());
    const listed = (await pageOf(web, OWNER, 'Matt')).body;
    expect(listed).toContain(`data-id="${ash.access.id}"`);
    expect(listed).not.toContain(`data-id="${mine?.id}"`);
    expect(listed).not.toContain(`<small>${OWNER}</small>`);
  });

  it('offers the owner a link of their own whatever their row is, short of approved', async () => {
    const made = toolWeb();
    ({ web } = made);
    // The owner asked as an admin before OWNER_ID named them.
    const { access } = await made.tool.store.ask(accessRequest({ userId: OWNER, name: 'Matt' }));
    const myLink = '<button type="button" data-action="my-link">Make my link</button>';
    const asked = (await pageOf(web, OWNER, 'Matt')).body;
    expect(asked).toContain(myLink);
    expect(asked).not.toContain('Your request is waiting for the owner.');
    await made.tool.access.decide(access.id, 'refuse', 'asked');
    const refused = (await pageOf(web, OWNER, 'Matt')).body;
    expect(refused).toContain(myLink);
    expect(refused).not.toContain('Your request was refused.');
    const owner = await web.posting(OWNER, 'Matt');
    expect((await post(web, owner, { action: 'my-link' })).statusCode).toBe(200);
    expect(await made.tool.store.byUser(OWNER)).toMatchObject({ state: 'approved' });
    expect((await pageOf(web, OWNER, 'Matt')).body).toContain('class="install"');
  });

  it('asks the owner to log in again after 12 hours, and shows nothing of the requests then', async () => {
    const made = toolWeb();
    ({ web } = made);
    await made.tool.store.ask(accessRequest());
    const cookie = await web.loggedIn(OWNER, 'Matt');
    web.clock.now += OWNER_LOGIN_MS + 1;
    const page = (await web.app.inject({ url: PAGE, headers: { cookie } })).body;
    expect(page).toContain('Log in again: managing the tool needs a login of the last 12 hours.');
    expect(page).toContain('<a href="/auth/login?next=%2Fuserscript">Log in with Discord</a>');
    expect(page).not.toContain('Ash');
    expect(page).not.toMatch(/data-action="(?!logout)/);
  });

  it('says the page is not built when the bundle is not', async () => {
    const tool = toolWebWith({ ownerId: OWNER });
    web = webServerWith({ tool });
    const answer = await pageOf(web, ADMIN);
    expect(answer.statusCode).toBe(503);
    expect(answer.body).toContain('run npm run web:build');
  });

  it('answers 30 loads a minute from one address', async () => {
    ({ web } = toolWeb());
    for (let n = 0; n < 30; n++) {
      expect((await web.app.inject({ url: PAGE })).statusCode).toBe(200);
    }
    expect((await web.app.inject({ url: PAGE })).statusCode).toBe(429);
  });
});

describe("the page's POSTs", () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('refuses a POST without a session, from elsewhere or without the CSRF token', async () => {
    const made = toolWeb();
    ({ web } = made);
    const headers = await web.posting(ADMIN, 'Ash');
    const ask = { action: 'ask', community: 'Pinewood' };
    expect((await post(web, { origin: headers.origin ?? '' }, ask)).statusCode).toBe(403);
    expect(
      (await post(web, { ...headers, origin: 'https://evil.example.test' }, ask)).statusCode,
    ).toBe(403);
    expect((await post(web, { ...headers, 'x-pine-csrf': 'wrong' }, ask)).statusCode).toBe(403);
    expect(await made.tool.store.all()).toEqual([]);
  });

  it('answers 404 where the tool is not offered, and 400 to a body that is none of its own', async () => {
    const off = toolWebWith({ script: null, ownerId: OWNER });
    web = webServerWith({ tool: off, assets: builtAssets() });
    const headers = await web.posting(ADMIN, 'Ash');
    expect((await post(web, headers, { action: 'ask', community: 'Pinewood' })).statusCode).toBe(
      404,
    );
    await web.app.close();
    ({ web } = toolWeb());
    const fresh = await web.posting(ADMIN, 'Ash');
    for (const body of [{ action: 'fly' }, { action: 'ask' }, { action: 'approve', id: 'x' }]) {
      expect((await post(web, fresh, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it('asks for access with the community line, once', async () => {
    const made = toolWeb();
    ({ web } = made);
    const headers = await web.posting(ADMIN, 'Ash');
    const empty = await post(web, headers, { action: 'ask', community: '  ' });
    expect(empty.statusCode).toBe(422);
    expect(empty.json()).toEqual({ ok: false, text: 'Say which community you run Pine for.' });
    const asked = await post(web, headers, { action: 'ask', community: 'Pinewood raiders' });
    expect(asked.statusCode).toBe(200);
    expect(asked.json()).toEqual({ ok: true, text: 'Your request is waiting for the owner.' });
    expect(made.tool.dms.recipients).toEqual([OWNER]);
    expect(await made.tool.store.byUser(ADMIN)).toMatchObject({
      name: 'Ash',
      community: 'Pinewood raiders',
      state: 'asked',
    });
    const again = await post(web, headers, { action: 'ask', community: 'Elsewhere' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ ok: false, text: 'Your request is waiting for the owner.' });
  });

  it('makes an approved member a new link, the old one stopping, and nobody else', async () => {
    const made = toolWeb();
    ({ web } = made);
    const headers = await web.posting(OTHER_ADMIN, 'Misty');
    expect((await post(web, headers, { action: 'new-link' })).statusCode).toBe(409);
    const { key } = await approvedAsh(made.tool);
    const ash = await web.posting(ADMIN, 'Ash');
    const renewed = await post(web, ash, { action: 'new-link' });
    expect(renewed.statusCode).toBe(200);
    expect(await made.tool.store.byKey(key)).toBeUndefined();
    expect((await made.tool.store.byUser(ADMIN))?.key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("makes the owner's link, for the owner alone and with a fresh login", async () => {
    const made = toolWeb();
    ({ web } = made);
    const admin = await web.posting(ADMIN, 'Ash');
    expect((await post(web, admin, { action: 'my-link' })).statusCode).toBe(403);
    const owner = await web.posting(OWNER, 'Matt');
    web.clock.now += OWNER_LOGIN_MS + 1;
    const stale = await post(web, owner, { action: 'my-link' });
    expect(stale.statusCode).toBe(403);
    expect(stale.json()).toEqual({
      ok: false,
      text: 'Log in again: managing the tool needs a login of the last 12 hours.',
    });
    const fresh = await web.posting(OWNER, 'Matt');
    const made1 = await post(web, fresh, { action: 'my-link' });
    expect(made1.statusCode).toBe(200);
    expect(await made.tool.store.byUser(OWNER)).toMatchObject({ state: 'approved', name: 'Matt' });
  });

  it('lets the owner decide, refuses anybody else, a stale login and a request decided meanwhile', async () => {
    const made = toolWeb();
    ({ web } = made);
    const { access } = await made.tool.store.ask(accessRequest());
    const decide = { action: 'approve', id: access.id, from: 'asked', askedAt: access.askedAt };
    const admin = await web.posting(OTHER_ADMIN, 'Misty');
    expect((await post(web, admin, decide)).statusCode).toBe(403);
    const owner = await web.posting(OWNER, 'Matt');
    web.clock.now += 11 * HOUR;
    const approved = await post(web, owner, decide);
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toEqual({ ok: true, text: 'Approved.' });
    expect((await made.tool.store.byId(access.id))?.state).toBe('approved');
    const late = await post(web, owner, { ...decide, action: 'refuse' });
    expect(late.statusCode).toBe(409);
    expect(late.json()).toEqual({
      ok: false,
      text: 'This request changed meanwhile: reload the page to see it as it is now.',
    });
    expect((await post(web, owner, { ...decide, id: access.id + 99 })).statusCode).toBe(409);
    web.clock.now += 2 * HOUR;
    const stale = await post(web, owner, { ...decide, action: 'revoke', from: 'approved' });
    expect(stale.statusCode).toBe(403);
    expect((await made.tool.store.byId(access.id))?.state).toBe('approved');
  });

  it('decides from a page drawn before the member asked again nothing of the new request', async () => {
    const made = toolWeb();
    ({ web } = made);
    const { access } = await made.tool.store.ask(accessRequest());
    // The owner's page, drawn while the first request waited.
    const drawn = { action: 'approve', id: access.id, from: 'asked', askedAt: access.askedAt };
    await made.tool.access.decide(access.id, 'refuse', 'asked');
    made.tool.clock.now += REASK_MS;
    web.clock.now = made.tool.clock.now;
    const renewed = await made.tool.store.ask(accessRequest({ at: made.tool.clock.now }));
    expect(renewed.kind).toBe('asked');
    const owner = await web.posting(OWNER, 'Matt');
    const old = await post(web, owner, drawn);
    expect(old.statusCode).toBe(409);
    expect(old.json()).toEqual({
      ok: false,
      text: 'This request changed meanwhile: reload the page to see it as it is now.',
    });
    expect((await made.tool.store.byId(access.id))?.state).toBe('asked');
    const current = await post(web, owner, { ...drawn, askedAt: renewed.access.askedAt });
    expect(current.statusCode).toBe(200);
    expect((await made.tool.store.byId(access.id))?.state).toBe('approved');
    // A decision without its asking is no body of the page's.
    const { askedAt: _askedAt, ...bare } = drawn;
    expect((await post(web, owner, bare)).statusCode).toBe(400);
  });

  it('answers 20 POSTs a minute from one address', async () => {
    ({ web } = toolWeb());
    const headers = await web.posting(OTHER_ADMIN, 'Misty');
    for (let n = 0; n < 20; n++) {
      expect((await post(web, headers, { action: 'new-link' })).statusCode).toBe(409);
    }
    expect((await post(web, headers, { action: 'new-link' })).statusCode).toBe(429);
  });
});
