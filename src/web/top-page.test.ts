import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PacedDirectory } from './paced-members.js';
import { Tally } from '../../test/support/tally.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { blockAt, clientSheet } from '../../test/support/stylesheets.js';
import { builtAssets, webServerWith, type TestWeb } from '../../test/support/web.js';
import { csrfInTop, LOGGED_OUT_MARK as CLIENT_LOGGED_OUT_MARK } from './client/top-logout.js';
import { AFTER_JOINING, LOGGED_OUT_MARK } from './top-page.js';
import { TOP_LOOKUP_MS, TOP_PER_MINUTE } from './top-routes.js';
import { withMapRole } from '../../test/support/server-values.js';

const ASH = '700000000000000001';
const PINEWOOD = { id: '410000000000000001', name: 'Pinewood' };
const OAKVALE = { id: '410000000000000002', name: 'Oakvale' };
const ELMHURST = { id: '410000000000000003', name: 'Elmhurst' };
const OAK_INVITE = 'https://discord.gg/oakvale';

const LOGIN_SENTENCE =
  "Professor Pine's maps are kept per Discord server. Log in with Discord to see the maps of your servers.";

/** HTML of ours as it is sent: the escapes of `escapeHtml`. */
const html = (text: string): string => text.replace(/'/g, '&#39;');

describe('the top page', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('says that there is no map here yet while no server has one', async () => {
    web = webServerWith();
    const answer = await web.app.inject({ url: '/' });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('no-store');
    expect(answer.body).toContain('Professor Pine has no map here yet.');
  });

  it('offers the login to a visitor not logged in, naming no server', async () => {
    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE] });
    const answer = await web.app.inject({ url: '/' });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toMatch(/^text\/html/);
    expect(answer.headers['cache-control']).toBe('no-store');
    expect(answer.body).toContain(html(LOGIN_SENTENCE));
    expect(answer.body).toContain(
      '<a class="top-login" href="/auth/login?next=/">Log in with Discord</a>',
    );
    expect(answer.body).toContain('Or use /maps in your server on Discord.');
    expect(answer.body).not.toContain('failed');
    expect(answer.body).not.toMatch(/Pinewood|Oakvale|410000000000000/);
    // Its script, which takes `?login=failed` out of the address (F4), and no other.
    expect([...answer.body.matchAll(/<script[^>]*>/gu)].map(([tag]) => tag)).toEqual([
      '<script src="/assets/top.js" defer>',
    ]);
  });

  it('says what Professor Pine is above the login, with and without the client secret (F6)', async () => {
    const INTRO = 'Professor Pine organizes Pokémon GO raids, raid trains and meetups on Discord.';
    web = webServerWith({ serversWithMap: [PINEWOOD] });
    for (const url of ['/', '/?login=failed']) {
      const { body } = await web.app.inject({ url });
      const heading = body.indexOf('<main><h1>Professor Pine</h1>');
      const intro = body.indexOf(`<p>${INTRO}</p>`);
      expect(heading, url).toBeGreaterThan(-1);
      expect(intro, url).toBeGreaterThan(heading);
      expect(body.indexOf(html(LOGIN_SENTENCE)), url).toBeGreaterThan(intro);
    }
    // A failed login is said under the heading and the line, above the rest.
    const { body: failed } = await web.app.inject({ url: '/?login=failed' });
    const said = failed.indexOf('Logging in with Discord failed; try again.');
    expect(said).toBeGreaterThan(failed.indexOf(`<p>${INTRO}</p>`));
    expect(said).toBeLessThan(failed.indexOf(html(LOGIN_SENTENCE)));
    await web.app.close();
    web = webServerWith({ serversWithMap: [PINEWOOD], oauth: undefined });
    const { body } = await web.app.inject({ url: '/' });
    expect(body).toContain(
      `<main><h1>Professor Pine</h1><p>${INTRO}</p><p>Use /maps in your server on Discord to open its map.</p>`,
    );
  });

  it("loads the map's theme head script on each of its pages where the bundle is built (F7)", async () => {
    const THEME = '<script src="/assets/theme-STUVWXYZ.js"></script>';
    const pages = async (made: TestWeb): Promise<string[]> => [
      (await made.app.inject({ url: '/' })).body,
      (await made.app.inject({ url: '/?login=failed' })).body,
      (await made.app.inject({ url: '/', headers: { cookie: await made.loggedIn(ASH, 'Ash') } }))
        .body,
    ];
    web = webServerWith({ assets: builtAssets(), serversWithMap: [PINEWOOD, OAKVALE] });
    const built = await pages(web);
    await web.app.close();
    web = webServerWith({ assets: builtAssets() });
    built.push((await web.app.inject({ url: '/' })).body);
    await web.app.close();
    web = webServerWith({ assets: builtAssets(), serversWithMap: [PINEWOOD], oauth: undefined });
    built.push((await web.app.inject({ url: '/' })).body);
    for (const body of built) {
      // Before the page is drawn: in the head, neither deferred nor async.
      const head = body.slice(0, body.indexOf('</head>'));
      expect(head).toContain(THEME);
    }
    expect(built[1]).toContain('<main><h1>Professor Pine</h1>');
    expect(built[2]).toContain('top-account');
    expect(built[3]).toContain('no map here yet');
    await web.app.close();
    // Without a build: no theme script, the page as it was.
    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE] });
    for (const body of await pages(web)) expect(body).not.toContain('/assets/theme');
  });

  it('is the same page for one server as for several', async () => {
    web = webServerWith({ serversWithMap: [PINEWOOD] });
    const one = (await web.app.inject({ url: '/' })).body;
    await web.app.close();
    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE, ELMHURST] });
    expect((await web.app.inject({ url: '/' })).body).toBe(one);
  });

  it('says that a login with Discord failed, back from Discord', async () => {
    web = webServerWith({ serversWithMap: [PINEWOOD] });
    const answer = await web.app.inject({ url: '/?login=failed' });
    expect(answer.body).toContain('Logging in with Discord failed; try again.');
    expect(answer.body).toContain('Log in with Discord</a>');
  });

  it('only points to /maps without the client secret', async () => {
    web = webServerWith({ serversWithMap: [PINEWOOD], oauth: undefined });
    for (const url of ['/', '/?login=failed']) {
      const answer = await web.app.inject({ url });
      // Its script takes a `?login=failed` out of the address here too (F4).
      expect(answer.body, url).toContain('<script src="/assets/top.js" defer></script>');
      expect(answer.body, url).toContain('Use /maps in your server on Discord to open its map.');
      expect(answer.body, url).not.toContain('/auth/login');
      expect(answer.body, url).not.toContain('maps are kept');
      expect(answer.body, url).not.toContain('failed');
    }
  });

  it('leads straight to the map of the one server of theirs, not kept', async () => {
    web = webServerWith({
      serversWithMap: [PINEWOOD, OAKVALE],
      members: new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id),
    });
    const answer = await web.app.inject({
      url: '/',
      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
    });
    expect(answer.statusCode).toBe(302);
    expect(answer.headers.location).toBe(`/s/${PINEWOOD.id}/map`);
    expect(answer.headers['cache-control']).toBe('no-store');
  });

  it('asks the member directory itself: a member without the map role still counts', async () => {
    web = webServerWith({
      serverSettings: withMapRole(),
      serversWithMap: [PINEWOOD],
      members: new FakeMemberDirectory()
        .add(ASH, 'Ash', PINEWOOD.id)
        .standing(ASH, { roleNames: [], roleIds: [], administrator: false }, PINEWOOD.id),
    });
    const answer = await web.app.inject({
      url: '/',
      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
    });
    expect(answer.headers.location).toBe(`/s/${PINEWOOD.id}/map`);
  });

  it('lists the servers of theirs and those they could join, names the visitor and offers Log out', async () => {
    web = webServerWith({
      web: { invites: { [OAKVALE.id]: OAK_INVITE, [ELMHURST.id]: 'https://discord.gg/elm' } },
      serversWithMap: [PINEWOOD, OAKVALE, ELMHURST, { id: '410000000000000004', name: 'acorn' }],
      members: new FakeMemberDirectory()
        .add(ASH, 'Ash', PINEWOOD.id)
        .add(ASH, 'Ash', ELMHURST.id)
        .add(ASH, 'Ash', '410000000000000004'),
    });
    const posting = await web.posting(ASH, 'Ash');
    const answer = await web.app.inject({ url: '/', headers: { cookie: posting.cookie } });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('no-store');
    const { body } = answer;
    const link = (server: { id: string; name: string }) =>
      `<a href="/s/${server.id}/map"><bdi>${server.name}</bdi></a>`;
    const acorn = body.indexOf(link({ id: '410000000000000004', name: 'acorn' }));
    const elmhurst = body.indexOf(link(ELMHURST));
    const pinewood = body.indexOf(link(PINEWOOD));
    expect(acorn).toBeGreaterThan(-1);
    expect(elmhurst).toBeGreaterThan(acorn);
    expect(pinewood).toBeGreaterThan(elmhurst);
    expect(body).toContain('Servers you can join');
    expect(body).toContain(
      `<bdi>Oakvale</bdi> <a class="top-join" href="${OAK_INVITE}" target="_blank" rel="noopener">Join on Discord</a>`,
    );
    // An invite of a server they are in is not offered.
    expect(body).not.toContain('https://discord.gg/elm');
    expect(body).toContain(
      '<p class="top-account"><span>Logged in as <bdi>Ash</bdi></span><button',
    );
    expect(body).toContain(
      `<button type="button" class="top-logout" data-csrf="${posting['x-pine-csrf']}">Log out</button>`,
    );
    expect(body).toContain('<script src="/assets/top.js" defer></script>');
    expect(body).not.toContain('You are not in');
    expect(body).not.toContain('did not answer');
  });

  it('says under the servers to join to reload once joined, and only there (F2)', async () => {
    expect(AFTER_JOINING).toBe(
      'Once you have joined, reload this page; Discord can take a minute to tell Pine.',
    );
    web = webServerWith({
      web: { invites: { [OAKVALE.id]: OAK_INVITE } },
      serversWithMap: [PINEWOOD, OAKVALE],
      members: new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id),
    });
    const cookie = await web.loggedIn(ASH, 'Ash');
    const { body } = await web.app.inject({ url: '/', headers: { cookie } });
    const list = body.indexOf('Join on Discord</a></li></ul>');
    expect(list).toBeGreaterThan(-1);
    expect(body.indexOf(html(AFTER_JOINING))).toBeGreaterThan(list);
    await web.app.close();
    // Nothing to join: nothing to reload for.
    web = webServerWith({
      serversWithMap: [PINEWOOD, OAKVALE],
      members: new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id).add(ASH, 'Ash', OAKVALE.id),
    });
    const none = await web.app.inject({
      url: '/',
      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
    });
    expect(none.body).toContain('Your servers');
    expect(none.body).not.toContain('Once you have joined');
  });

  it('says they are in no server here, with the servers they could join', async () => {
    web = webServerWith({
      web: { invites: { [OAKVALE.id]: OAK_INVITE } },
      serversWithMap: [PINEWOOD, OAKVALE],
    });
    const answer = await web.app.inject({
      url: '/',
      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
    });
    expect(answer.statusCode).toBe(200);
    expect(answer.body).toContain('None of your Discord servers has a map here.');
    expect(answer.body).toContain('Join on Discord');
    // A server without an invite stays unnamed.
    expect(answer.body).not.toContain('Pinewood');
    expect(answer.body).toContain('Log out</button>');
  });

  it('says that Discord did not answer for every server, listing those found, never redirecting', async () => {
    const directory = new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id);
    const members: PacedDirectory = {
      holds: () => true,
      find: (guildId, userId) =>
        guildId === OAKVALE.id
          ? Promise.reject(new Error('Discord is away'))
          : directory.find(guildId, userId),
    };
    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE], members });
    const answer = await web.app.inject({
      url: '/',
      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
    });
    expect(answer.statusCode).toBe(200);
    expect(answer.body).toContain(`<bdi>Pinewood</bdi>`);
    expect(answer.body).toContain('Discord did not answer for every server; reload to try again.');
    expect(answer.body).not.toContain('Oakvale');
    expect(web.entries).toContainEqual(
      expect.objectContaining({ guild: OAKVALE.id, user: ASH, level: 40 }),
    );
  });

  it('offers the login, not "no map", while the only server with a map is unavailable (F1)', async () => {
    web = webServerWith({ serversWithMap: { servers: [], unavailable: [OAKVALE.id] } });
    const answer = await web.app.inject({ url: '/' });
    expect(answer.body).toContain(html(LOGIN_SENTENCE));
    expect(answer.body).not.toContain('no map here');
  });

  it('counts a server unavailable as one Discord did not answer for, never asking of it (F1)', async () => {
    const members = new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id);
    web = webServerWith({
      web: { invites: { [OAKVALE.id]: OAK_INVITE } },
      serversWithMap: { servers: [PINEWOOD], unavailable: [OAKVALE.id] },
      members,
    });
    const answer = await web.app.inject({
      url: '/',
      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
    });
    // Not straight to Pinewood's map: they may be in the other server too.
    expect(answer.statusCode).toBe(200);
    expect(answer.body).toContain('<bdi>Pinewood</bdi>');
    expect(answer.body).toContain('Discord did not answer for every server; reload to try again.');
    expect(answer.body).not.toContain('You are not in');
    expect(answer.body).not.toContain(OAKVALE.id);
    expect(answer.body).not.toContain(OAK_INVITE);
    expect(members.asked).toEqual([`${PINEWOOD.id}:${ASH}`]);
  });

  it('asks Discord of every server at once', async () => {
    let asking = 0;
    let most = 0;
    const directory = new FakeMemberDirectory()
      .add(ASH, 'Ash', PINEWOOD.id)
      .add(ASH, 'Ash', OAKVALE.id);
    const members: PacedDirectory = {
      holds: () => true,
      async find(guildId, userId) {
        asking += 1;
        most = Math.max(most, asking);
        await Promise.resolve();
        asking -= 1;
        return directory.find(guildId, userId);
      },
    };
    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE, ELMHURST], members });
    await web.app.inject({ url: '/', headers: { cookie: await web.loggedIn(ASH, 'Ash') } });
    expect(most).toBe(3);
  });

  it("escapes a server's and the visitor's names, and keeps their direction to themselves", async () => {
    const hostile = { id: PINEWOOD.id, name: '<img src=x onerror=alert(1)>\u202Eevil"&' };
    const hostileToJoin = { id: ELMHURST.id, name: '<svg onload=alert(2)>\u202Ejoin"&' };
    web = webServerWith({
      web: { invites: { [ELMHURST.id]: 'https://discord.gg/elm' } },
      serversWithMap: [hostile, OAKVALE, hostileToJoin],
      members: new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id).add(ASH, 'Ash', OAKVALE.id),
    });
    const answer = await web.app.inject({
      url: '/',
      headers: { cookie: await web.loggedIn(ASH, '<b>Ash</b>\u202E') },
    });
    expect(answer.body).toContain(
      '<bdi>&lt;img src=x onerror=alert(1)&gt;\u202Eevil&quot;&amp;</bdi>',
    );
    // A server they could join, in "Servers you can join".
    expect(answer.body).toContain(
      '<li><bdi>&lt;svg onload=alert(2)&gt;\u202Ejoin&quot;&amp;</bdi> <a class="top-join"',
    );
    expect(answer.body).toContain(
      '<span>Logged in as <bdi>&lt;b&gt;Ash&lt;/b&gt;\u202E</bdi></span>',
    );
    expect(answer.body).not.toContain('<img');
    expect(answer.body).not.toContain('<svg');
    expect(answer.body).not.toContain('<b>');
  });

  it('asks the member directory nothing for a visitor not logged in', async () => {
    const members = new FakeMemberDirectory();
    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE, ELMHURST], members });
    expect((await web.app.inject({ url: '/' })).statusCode).toBe(200);
    expect((await web.app.inject({ method: 'HEAD', url: '/' })).statusCode).toBe(200);
    expect(members.asked).toEqual([]);
  });

  it(`counts a server Discord has not answered for in ${TOP_LOOKUP_MS / 1000} seconds as not known`, async () => {
    const directory = new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id);
    const asked = new Tally('the questions of the member directory');
    const members: PacedDirectory = {
      holds: () => true,
      find(guildId, userId) {
        asked.add();
        // Oakvale's question never settles.
        return guildId === OAKVALE.id
          ? new Promise<never>(() => undefined)
          : directory.find(guildId, userId);
      },
    };
    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE], members });
    const cookie = await web.loggedIn(ASH, 'Ash');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const answering = web.app.inject({ url: '/', headers: { cookie } });
      await asked.reached(2);
      await vi.advanceTimersByTimeAsync(TOP_LOOKUP_MS);
      const answer = await answering;
      expect(answer.statusCode).toBe(200);
      expect(answer.body).toContain('<bdi>Pinewood</bdi>');
      expect(answer.body).toContain(
        'Discord did not answer for every server; reload to try again.',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks its pages for a visitor logged out for its script, and no other', async () => {
    const MARK = '<meta name="pine-top" content="logged-out">';
    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE] });
    expect((await web.app.inject({ url: '/' })).body).toContain(MARK);
    expect((await web.app.inject({ url: '/?login=failed' })).body).toContain(MARK);
    const loggedIn = await web.app.inject({
      url: '/',
      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
    });
    expect(loggedIn.body).toContain('top-account');
    expect(loggedIn.body).not.toContain(MARK);
    await web.app.close();
    web = webServerWith({ serversWithMap: [PINEWOOD], oauth: undefined });
    expect((await web.app.inject({ url: '/' })).body).toContain(MARK);
    await web.app.close();
    web = webServerWith();
    expect((await web.app.inject({ url: '/' })).body).not.toContain(MARK);
  });

  it(`refuses more than ${TOP_PER_MINUTE} a minute from one address, the refusal not kept either`, async () => {
    web = webServerWith({ serversWithMap: [PINEWOOD] });
    for (let i = 0; i < TOP_PER_MINUTE; i += 1) {
      expect((await web.app.inject({ url: '/', remoteAddress: '203.0.113.7' })).statusCode).toBe(
        200,
      );
    }
    const refused = await web.app.inject({ url: '/', remoteAddress: '203.0.113.7' });
    expect(refused.statusCode).toBe(429);
    expect(refused.headers['cache-control']).toBe('no-store');
    expect(refused.headers['retry-after']).toBeDefined();
    // Another address is not held back.
    expect((await web.app.inject({ url: '/', remoteAddress: '203.0.113.8' })).statusCode).toBe(200);
  });

  it('answers HEAD as GET, without a body', async () => {
    web = webServerWith({ serversWithMap: [PINEWOOD] });
    const answer = await web.app.inject({ method: 'HEAD', url: '/' });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('no-store');
    expect(answer.headers['content-type']).toMatch(/^text\/html/);
    expect(answer.body).toBe('');
  });

  it('answers HEAD on the way to a map as GET: the redirect, not kept, without a body', async () => {
    web = webServerWith({
      serversWithMap: [PINEWOOD],
      members: new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id),
    });
    const answer = await web.app.inject({
      method: 'HEAD',
      url: '/',
      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
    });
    expect(answer.statusCode).toBe(302);
    expect(answer.headers.location).toBe(`/s/${PINEWOOD.id}/map`);
    expect(answer.headers['cache-control']).toBe('no-store');
    expect(answer.body).toBe('');
  });

  it("gives its script the session's token on Log out, as the script reads it", async () => {
    web = webServerWith({
      serversWithMap: [PINEWOOD, OAKVALE],
      members: new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id).add(ASH, 'Ash', OAKVALE.id),
    });
    const posting = await web.posting(ASH, 'Ash');
    const answer = await web.app.inject({ url: '/', headers: { cookie: posting.cookie } });
    expect(csrfInTop(answer.body)).toBe(posting['x-pine-csrf']);
  });

  it('marks its pages for a visitor logged out as its script looks for them', async () => {
    expect(LOGGED_OUT_MARK).toBe(CLIENT_LOGGED_OUT_MARK);
    web = webServerWith({ serversWithMap: [PINEWOOD] });
    expect((await web.app.inject({ url: '/' })).body).toContain(CLIENT_LOGGED_OUT_MARK);
  });

  it("draws every class of its pages in the short pages' stylesheet, no style in the markup", async () => {
    web = webServerWith({
      web: { invites: { [OAKVALE.id]: OAK_INVITE } },
      serversWithMap: [PINEWOOD, OAKVALE, ELMHURST],
      members: new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id).add(ASH, 'Ash', ELMHURST.id),
    });
    const loggedOut = (await web.app.inject({ url: '/?login=failed' })).body;
    const loggedIn = (
      await web.app.inject({ url: '/', headers: { cookie: await web.loggedIn(ASH, 'Ash') } })
    ).body;
    const sheet = clientSheet('pages.css');
    const classes = new Set(
      [loggedOut, loggedIn].flatMap((body) =>
        [...body.matchAll(/class="([^"]+)"/gu)].flatMap((match) => (match[1] ?? '').split(' ')),
      ),
    );
    expect([...classes].sort()).toEqual([
      'short',
      'top-account',
      'top-failed',
      'top-join',
      'top-login',
      'top-logout',
      'top-notice',
      'top-servers',
    ]);
    for (const name of classes) {
      expect(sheet, name).toMatch(new RegExp(`\\.${name}\\b[^{]*\\{`, 'u'));
    }
    for (const body of [loggedOut, loggedIn]) {
      expect(body).not.toMatch(/\sstyle=/u);
      expect(body).not.toMatch(/<script>/u);
    }
  });

  it('breaks a long name of a server or of the visitor rather than widening the page', () => {
    const sheet = clientSheet('pages.css');
    for (const selector of [
      /body\.short ul\.top-servers li\s*\{/u,
      /body\.short \.top-account bdi\s*\{/u,
    ]) {
      expect(blockAt(sheet, selector), String(selector)).toMatch(/overflow-wrap:\s*anywhere;/u);
    }
    // The name's line may shrink beside Log out (the flex row's item), so that it can wrap.
    expect(blockAt(sheet, /body\.short \.top-account span\s*\{/u)).toMatch(/min-width:\s*0;/u);
  });
});
