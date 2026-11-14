import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { topPageServers, webServers } from '../app-wiring.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import {
  builtAssets,
  serverRoutes,
  webServerWith,
  type TestWeb,
  type WebTestOptions,
} from '../../test/support/web.js';

/**
 * The map of a server closed to visitors who are not logged in (plan 19C-4; spec "The web"): a
 * server whose staff keep it closed (`publicMap`, `publicMapOn`) answers such a visitor exactly
 * as a server Pine is not in; one whose staff open it answers as ever; somebody logged in is
 * answered as ever in both.
 */

/**
 * The server whose map is open to visitors (the fakes' own), one whose map is closed, one in setup
 * (plan 19C-2), one added back while its data is being deleted (plan 19C-3, `pending`: set up and
 * with its map open, so that nothing but its deletion hides it), one Pine is not in.
 */
const OPEN = FAKE_GUILD_ID;
const CLOSED = '412345678901234577';
const SETUP = '412345678901234566';
const PENDING = '412345678901234555';
const UNKNOWN = '412345678901234588';
/** The servers that answer a visitor who is not logged in as one Pine is not in. */
const HIDDEN = [CLOSED, SETUP, PENDING];
const VISITOR = '700000000000000021';
const MEMBER = '700000000000000022';
/** Staff of the server in setup, who may edit its regions. */
const STAFF = '700000000000000023';

/** A cookie of the session's shape that no session has. */
const MADE_UP = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

/**
 * The members of the servers: a member of the four, staff of the one in setup and of the one
 * being deleted.
 */
function publicMapMembers(): FakeMemberDirectory {
  const staff = { roleNames: ['Admin'], roleIds: [], administrator: true, manageGuild: true };
  return new FakeMemberDirectory()
    .add(MEMBER, 'Member', OPEN)
    .add(MEMBER, 'Member', CLOSED)
    .add(MEMBER, 'Member', SETUP)
    .standing(MEMBER, { roleNames: [], roleIds: [], administrator: false }, SETUP)
    .add(MEMBER, 'Member', PENDING)
    .standing(MEMBER, { roleNames: [], roleIds: [], administrator: false }, PENDING)
    .add(STAFF, 'Staff', SETUP)
    .standing(STAFF, staff, SETUP)
    .add(STAFF, 'Staff', PENDING)
    .standing(STAFF, staff, PENDING);
}

/**
 * The web server over the four servers, which it answers by the bot's own rule (`webServers`):
 * the client has all four; one is being deleted; one is in setup; two have their maps open.
 */
function publicMapWeb(options: Pick<WebTestOptions, 'oauth' | 'members'> = {}): TestWeb {
  return webServerWith({
    members: publicMapMembers(),
    ...options,
    assets: builtAssets(),
    servers: webServers({
      has: (guild) => [OPEN, CLOSED, SETUP, PENDING].includes(guild),
      standings: { isLeft: () => false, pending: (guild) => guild === PENDING },
      servers: {
        inSetup: (guild) => guild === SETUP,
        of: (guild) => ({ publicMap: guild === OPEN || guild === PENDING }),
      },
      open: false,
    }),
  });
}

/** The addresses of a login link that is no link, of a server: the map's and the editor's. */
const NO_LINKS = ['/auth/link/:guild/no-such-link', '/auth/link/:guild/no-such-link/edit'];

/**
 * A request; to a login link's address a minute after the one before, so that the loops stay
 * within the logins' 20 a minute from one address.
 */
function inject(web: TestWeb, request: InjectOptions & { url: string }) {
  if (request.url.startsWith('/auth/')) web.clock.now += 60_000;
  return web.app.inject(request);
}

/** Every address of a server, and of its login links, each method of each. */
function serverAddresses(web: TestWeb): Array<{ method: string; url: string }> {
  return [
    ...serverRoutes(web.app).filter(({ url }) => url.startsWith('/s/:guild/')),
    ...NO_LINKS.flatMap((url) => (['GET', 'POST'] as const).map((method) => ({ method, url }))),
  ];
}

/** What could tell two answers apart: the status, the headers but the date, the body. */
function seen(answer: LightMyRequestResponse) {
  const { date: _date, ...headers } = answer.headers;
  return { status: answer.statusCode, headers, body: answer.body };
}

/** A route's path for a server, with something in the place of every other parameter. */
const at = (route: string, guild: string) =>
  route
    .replace(':guild', guild)
    .replace(':kind', 'gym')
    .replace(/:[a-z]+/giu, '1');

/**
 * Every address of a server and its login links that are none, each method, without a cookie and
 * with one that is no session (any more): a closed server's answer, one in setup's and one being
 * deleted's are an unknown server's 404, byte for byte.
 */
async function expectEveryAddressAlike(web: TestWeb): Promise<void> {
  for (const { method, url } of serverAddresses(web)) {
    for (const headers of [{}, { cookie: `${web.sessionService.cookieName}=${MADE_UP}` }]) {
      const ask = (guild: string) => inject(web, { method, url: at(url, guild), headers });
      const unknown = seen(await ask(UNKNOWN));
      expect(unknown.status, `${method} ${url}`).toBe(404);
      for (const guild of HIDDEN) {
        expect(seen(await ask(guild)), `${guild} ${method} ${url}`).toEqual(unknown);
      }
    }
  }
}

describe('a server’s map for visitors who are not logged in (plan 19C-4)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('answers every address of a closed server, of one in setup and of one being deleted as one Pine is not in, byte for byte', async () => {
    web = publicMapWeb();
    await web.app.ready();
    const routes = serverRoutes(web.app).filter(({ url }) => url.startsWith('/s/:guild/'));
    // Every page and answer of a server, those that answer without a session among them.
    expect(routes.map(({ url }) => url)).toEqual(
      expect.arrayContaining([
        '/s/:guild/map',
        '/s/:guild/history',
        '/s/:guild/me',
        '/s/:guild/api/me',
        '/s/:guild/api/geo',
      ]),
    );
    // The forms' and the editor's POSTs too.
    expect(routes).toContainEqual({ method: 'POST', url: '/s/:guild/api/regions/save' });
    // And the login links that are none, of the map and of the editor.
    await expectEveryAddressAlike(web);
  });

  it('answers every address of a closed server, of one in setup and of one being deleted as one Pine is not in without the client secret too', async () => {
    // Without the client secret the not-found page offers no login: still one page for all.
    web = publicMapWeb({ oauth: undefined });
    await web.app.ready();
    const urls = serverAddresses(web).map(({ url }) => url);
    expect(urls).toEqual(
      expect.arrayContaining(['/s/:guild/map', '/s/:guild/api/geo', ...NO_LINKS]),
    );
    await expectEveryAddressAlike(web);
  });

  it('reads the session of every request to a server’s address alike, so that no timing tells a server Pine is in from one it is not in', async () => {
    web = publicMapWeb();
    await web.app.ready();
    const sessions = web.sessions;
    let reads = 0;
    const find = sessions.find.bind(sessions);
    sessions.find = (id, now) => {
      reads += 1;
      return find(id, now);
    };
    const readsOf = async (guild: string, method: string, url: string, cookie: string) => {
      reads = 0;
      await inject(web!, { method, url: at(url, guild), headers: { cookie } });
      return reads;
    };
    const madeUp = `${web.sessionService.cookieName}=${MADE_UP}`;
    for (const { method, url } of serverAddresses(web)) {
      const unknown = await readsOf(UNKNOWN, method, url, madeUp);
      expect(unknown, `${method} ${url}`).toBe(1);
      for (const guild of HIDDEN) {
        expect(await readsOf(guild, method, url, madeUp), `${guild} ${method} ${url}`).toBe(
          unknown,
        );
      }
    }
  });

  it('asks whether somebody logged in is staff of a server in setup only at its region editor and the map it draws on', async () => {
    // Each look-up of the member directory, by its server.
    const asked: string[] = [];
    const members = publicMapMembers();
    const find = members.find.bind(members);
    members.find = (guild, userId) => {
      asked.push(guild);
      return find(guild, userId);
    };
    web = publicMapWeb({ members });
    await web.app.ready();
    const cookie = await web.loggedIn(MEMBER, 'Member');
    const editors = new Set([
      '/s/:guild/regions/edit',
      '/s/:guild/api/regions/edit',
      '/s/:guild/api/regions/preview',
      '/s/:guild/api/regions/save',
      '/s/:guild/map',
      '/s/:guild/api/me',
      '/s/:guild/api/geo',
    ]);
    for (const { method, url } of serverAddresses(web)) {
      if (editors.has(url) || url.startsWith('/auth/link/')) continue;
      asked.length = 0;
      const ask = (guild: string) =>
        inject(web!, { method, url: at(url, guild), headers: { cookie } });
      const unknown = seen(await ask(UNKNOWN));
      expect(seen(await ask(SETUP)), `${method} ${url}`).toEqual(unknown);
      expect(asked, `${method} ${url}`).toEqual([]);
    }
  });

  it('answers a login link of a server in setup that is no link as one of a server Pine is not in, but to its staff', async () => {
    web = publicMapWeb();
    for (const suffix of ['', '/edit']) {
      const ask = (guild: string, cookie?: string) =>
        inject(web!, {
          url: `/auth/link/${guild}/no-such-link${suffix}`,
          headers: cookie === undefined ? {} : { cookie },
        });
      // A visitor, and a member who is not staff.
      const member = await web.loggedIn(MEMBER, 'Member');
      for (const cookie of [undefined, member]) {
        const setup = seen(await ask(SETUP, cookie));
        expect(setup.status, suffix).toBe(404);
        expect(setup, suffix).toEqual(seen(await ask(UNKNOWN, cookie)));
      }
      // Its staff are led to the page, as anywhere.
      const staff = await ask(SETUP, await web.loggedIn(STAFF, 'Staff'));
      expect(staff.statusCode, suffix).toBe(303);
      expect(staff.headers.location).toBe(
        `/s/${SETUP}/${suffix === '' ? 'map' : 'regions/edit'}?login=expired`,
      );
    }
  });

  it('says on a server’s address not found that a link of /maps lasts five minutes, and how to log in', async () => {
    web = publicMapWeb();
    for (const url of [
      `/s/${UNKNOWN}/map`,
      `/s/${CLOSED}/history`,
      `/s/${SETUP}/me`,
      `/s/${OPEN}/no-such-page`,
      `/auth/link/${CLOSED}/no-such-link`,
    ]) {
      const answer = await web.app.inject({ url });
      expect(answer.statusCode, url).toBe(404);
      expect(answer.body, url).toContain('<p>Not found.</p>');
      expect(answer.body, url).toContain(
        '<p>A link from /maps lasts five minutes: use /maps on Discord again, or log in with Discord.</p>',
      );
      expect(answer.body, url).toContain(
        '<p><a href="/auth/login?next=/">Log in with Discord</a></p>',
      );
    }
    // The data of the pages answer in JSON, as ever.
    expect((await web.app.inject({ url: `/s/${CLOSED}/api/geo` })).json()).toEqual({
      error: 'Not found.',
    });
    // Elsewhere a page not found says only so.
    expect((await web.app.inject({ url: '/nothing/here' })).body).not.toContain('/maps');
    await web.app.close();
    // Without the client secret there is no login to offer.
    web = publicMapWeb({ oauth: undefined });
    const without = await web.app.inject({ url: `/s/${CLOSED}/map` });
    expect(without.statusCode).toBe(404);
    expect(without.body).toContain(
      '<p>A link from /maps lasts five minutes: use /maps on Discord again.</p>',
    );
    expect(without.body).not.toContain('/auth/login');
  });

  it('answers an open server’s pages and its public view to such a visitor as ever', async () => {
    web = publicMapWeb();
    for (const url of ['/map', '/history', '/me', '/api/geo']) {
      expect((await web.app.inject({ url: `/s/${OPEN}${url}` })).statusCode, url).toBe(200);
    }
    expect((await web.app.inject({ url: `/s/${OPEN}/api/me` })).json()).toEqual({
      loggedIn: false,
    });
  });

  it('answers somebody logged in as ever, in a closed server too, member or not', async () => {
    web = publicMapWeb();
    for (const [userId, name] of [
      [MEMBER, 'Member'],
      [VISITOR, 'Visitor'],
    ] as const) {
      const cookie = await web.loggedIn(userId, name);
      for (const guild of [OPEN, CLOSED]) {
        for (const url of ['/map', '/history', '/me', '/api/geo']) {
          const answer = await web.app.inject({ url: `/s/${guild}${url}`, headers: { cookie } });
          expect(answer.statusCode, `${name} ${guild}${url}`).toBe(200);
        }
        const me = await web.app.inject({ url: `/s/${guild}/api/me`, headers: { cookie } });
        expect(me.json<{ loggedIn: boolean; member: boolean }>()).toMatchObject({
          loggedIn: true,
          member: userId === MEMBER,
        });
      }
    }
    // A server Pine is not in is not found, logged in or not.
    const cookie = await web.loggedIn(MEMBER, 'Member');
    expect(
      (await web.app.inject({ url: `/s/${UNKNOWN}/map`, headers: { cookie } })).statusCode,
    ).toBe(404);
  });

  it('answers a server being deleted as one Pine is not in to its members and staff too, at every address', async () => {
    // Set up, its map open, its members and staff known: nothing counts while its deletion is
    // unfinished (plan 19C-3).
    web = publicMapWeb();
    await web.app.ready();
    for (const [userId, name] of [
      [MEMBER, 'Member'],
      [STAFF, 'Staff'],
    ] as const) {
      const cookie = await web.loggedIn(userId, name);
      for (const { method, url } of serverAddresses(web)) {
        const ask = (guild: string) =>
          inject(web!, { method, url: at(url, guild), headers: { cookie } });
        const unknown = seen(await ask(UNKNOWN));
        expect(unknown.status, `${name} ${method} ${url}`).toBe(404);
        expect(seen(await ask(PENDING)), `${name} ${method} ${url}`).toEqual(unknown);
      }
    }
  });

  it('answers a login link of a closed server that is no link as one of a server Pine is not in', async () => {
    web = publicMapWeb();
    for (const suffix of ['', '/edit']) {
      for (const method of ['GET', 'POST'] as const) {
        const ask = (guild: string) =>
          inject(web!, { method, url: `/auth/link/${guild}/no-such-link${suffix}` });
        const closed = seen(await ask(CLOSED));
        expect(closed, `${method} ${suffix}`).toEqual(seen(await ask(UNKNOWN)));
        expect(closed.status).toBe(404);
      }
      // An open server's leads to its page, as ever.
      const open = await web.app.inject({ url: `/auth/link/${OPEN}/no-such-link${suffix}` });
      expect(open.statusCode).toBe(303);
    }
    // To somebody logged in a closed server's leads to its page, as ever.
    const cookie = await web.loggedIn(VISITOR, 'Visitor');
    const expired = await web.app.inject({
      url: `/auth/link/${CLOSED}/no-such-link`,
      headers: { cookie },
    });
    expect(expired.statusCode).toBe(303);
    expect(expired.headers.location).toBe(`/s/${CLOSED}/map?login=expired`);
  });

  it('logs a member in to a closed server’s map by their link of /maps', async () => {
    web = publicMapWeb();
    const token = web.loginLinks.issue(CLOSED, MEMBER, 'Member', web.clock.now);
    const page = await web.app.inject({ url: `/auth/link/${CLOSED}/${token}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Continue as Member');
    const used = await web.app.inject({
      method: 'POST',
      url: `/auth/link/${CLOSED}/${token}`,
      headers: { origin: 'https://map.example.test' },
    });
    expect(used.statusCode).toBe(303);
    expect(used.headers.location).toBe(`/s/${CLOSED}/map`);
    const cookie = String(used.headers['set-cookie']).split(';')[0] ?? '';
    const map = await web.app.inject({ url: `/s/${CLOSED}/map`, headers: { cookie } });
    expect(map.statusCode).toBe(200);
  });

  it('names no server on the top page to a visitor who is not logged in', async () => {
    const members = new FakeMemberDirectory().add(MEMBER, 'Member', OPEN);
    web = webServerWith({
      assets: builtAssets(),
      members,
      serversWithMap: [
        { id: OPEN, name: 'Pinewood' },
        { id: CLOSED, name: 'Elmwood' },
      ],
      servers: {
        has: (guild) => guild === OPEN || guild === CLOSED,
        inSetup: () => false,
        openToVisitors: (guild) => guild === OPEN,
      },
    });
    const top = await web.app.inject({ url: '/' });
    expect(top.statusCode).toBe(200);
    for (const named of ['Pinewood', 'Elmwood', OPEN, CLOSED])
      expect(top.body).not.toContain(named);
  });

  it('names to a member on the top page no server being deleted or in setup, by the bot’s own rule (fix round 3, R6)', async () => {
    const onWeb = webServers({
      has: (guild) => [OPEN, CLOSED, SETUP, PENDING].includes(guild),
      standings: { isLeft: () => false, pending: (guild) => guild === PENDING },
      servers: { inSetup: (guild) => guild === SETUP, of: () => ({ publicMap: true }) },
      open: false,
    });
    // The four as the client has them, each with a region that has an outline.
    const named = new Map([
      [OPEN, 'Pinewood'],
      [CLOSED, 'Elmwood'],
      [SETUP, 'Setupton'],
      [PENDING, 'Pendleton'],
    ]);
    const rows = [...named.keys()];
    const outline = [
      { lat: 40, lon: -80 },
      { lat: 40.1, lon: -80 },
      { lat: 40.1, lon: -79.9 },
      { lat: 40, lon: -80 },
    ];
    web = webServerWith({
      assets: builtAssets(),
      members: publicMapMembers(),
      servers: onWeb,
      serversWithMap: topPageServers({
        cached: () => [...named].map(([id, name]) => ({ id, name, available: true })),
        web: onWeb,
        guilds: { snowflakeOf: (row) => Promise.resolve(rows[row - 1]) },
        regions: { all: () => rows.map((_, index) => ({ guildId: index + 1, bounds: outline })) },
      }),
    });
    const cookie = await web.loggedIn(MEMBER, 'Member');
    const top = await web.app.inject({ url: '/', headers: { cookie } });
    expect(top.statusCode).toBe(200);
    expect(top.body).toContain('Pinewood');
    expect(top.body).toContain('Elmwood');
    for (const hidden of ['Setupton', 'Pendleton', SETUP, PENDING])
      expect(top.body).not.toContain(hidden);
  });
});
