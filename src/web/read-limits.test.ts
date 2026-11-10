import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { geoSourcesWith, webServerWith, type TestWeb } from '../../test/support/web.js';
import { REFUSED } from '../services/costly.js';
import { EmojiPictures } from '../services/post-pictures.js';
import { PARTIES_PER_MINUTE } from './party-routes.js';
import { PUBLIC_COSTS_PER_MINUTE } from './public-costs.js';

const ASH = '700000000000000001';
const MISTY = '700000000000000002';
const PARTIES = `/s/${FAKE_GUILD_ID}/api/parties`;
const GEO = `/s/${FAKE_GUILD_ID}/api/geo`;

/** The nth address of the test: each a client of its own to the limits per address. */
const address = (n: number) => `198.51.${Math.floor(n / 250)}.${(n % 250) + 1}`;

/**
 * The GET routes of the server as Fastify lists them (`printRoutes`: a tree, a line per route,
 * four characters of indent per level), as paths with their parameters' names.
 */
function getRoutes(app: FastifyInstance): string[] {
  const parents: string[] = [];
  const routes: string[] = [];
  for (const line of app.printRoutes({ commonPrefix: false, method: 'GET' }).split('\n')) {
    const match = /^([│ ]*)[├└]── (.+?)(?: \((.+)\))?$/u.exec(line);
    if (!match) continue;
    const [, indent = '', part = '', methods] = match;
    const depth = indent.length / 4;
    parents.length = depth;
    parents.push(part);
    if (methods?.split(', ').includes('GET')) routes.push(parents.join(''));
  }
  return routes;
}

/** A route's path with something in the place of each parameter. */
const filled = (route: string) =>
  route
    .replace(':guild', FAKE_GUILD_ID)
    .replace(':kind', 'gym')
    .replace(/:[a-z]+/gu, '1');

describe('the reads of one member (plan 8Z-2)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('are limited by the member, from however many addresses and sessions', async () => {
    const made = webServerWith({
      members: new FakeMemberDirectory().add(ASH, 'Ash').add(MISTY, 'Misty'),
    });
    web = made;
    const cookie = await made.loggedIn(ASH, 'Ash');
    const ask = (n: number, headers: Record<string, string> = { cookie }) =>
      made.app.inject({ url: PARTIES, headers, remoteAddress: address(n) });
    for (let i = 0; i < PARTIES_PER_MINUTE; i += 1) {
      expect((await ask(i)).statusCode, String(i)).toBe(200);
    }
    const refused = await ask(PARTIES_PER_MINUTE);
    expect(refused.statusCode).toBe(429);
    expect(refused.headers['retry-after']).toBe('60');
    expect(refused.json()).toEqual({ error: expect.any(String) as string });
    // Another session of theirs is the same member.
    const second = await made.loggedIn(ASH, 'Ash');
    expect((await ask(PARTIES_PER_MINUTE + 1, { cookie: second })).statusCode).toBe(429);
    // Another member is not held up by it, nor a visitor who is not logged in.
    const misty = await made.loggedIn(MISTY, 'Misty');
    expect((await ask(PARTIES_PER_MINUTE + 2, { cookie: misty })).statusCode).toBe(200);
    expect((await ask(PARTIES_PER_MINUTE + 3, {})).statusCode).toBe(401);
    made.clock.now += 60_000;
    expect((await ask(PARTIES_PER_MINUTE + 4)).statusCode).toBe(200);
  });

  it('pass a request without a session, or with a cookie no session has, uncounted', async () => {
    const made = webServerWith();
    web = made;
    const unknown = { cookie: `__Host-pine_session=${'A'.repeat(43)}` };
    for (let i = 0; i < PARTIES_PER_MINUTE + 5; i += 1) {
      const answer = await made.app.inject({
        url: PARTIES,
        headers: i % 2 === 0 ? {} : unknown,
        remoteAddress: address(i),
      });
      expect(answer.statusCode, String(i)).toBe(401);
    }
  });

  it('are limited so on every read of a server’s data and pictures', async () => {
    const made = webServerWith();
    web = made;
    await made.app.ready();
    const reads = getRoutes(made.app).filter(
      (route) =>
        route.startsWith('/s/:guild/api/') ||
        route.startsWith('/s/:guild/pictures/') ||
        route === '/s/:guild/regions/edit',
    );
    // The list is read off a printout: it must have found the routes.
    expect(reads).toContain('/s/:guild/api/parties/:party/post');
    expect(reads).toContain('/s/:guild/api/history/trains/:train');
    expect(reads.length).toBeGreaterThanOrEqual(36);
    const cookie = await made.loggedIn(ASH, 'Ash');
    let n = 0;
    const unlimited: string[] = [];
    const held: string[] = [];
    for (const route of reads) {
      const url = filled(route);
      let refused = false;
      // The largest limit of a read is 480 a minute (a party's posts).
      for (let i = 0; i <= 480 && !refused; i += 1) {
        n += 1;
        const answer = await made.app.inject({
          url,
          headers: { cookie },
          remoteAddress: address(n),
        });
        refused = answer.statusCode === 429;
      }
      if (!refused) unlimited.push(route);
      // Nobody else is held up: a visitor who is not logged in, from an address of their own.
      n += 1;
      const other = await made.app.inject({ url, remoteAddress: address(n) });
      if (other.statusCode === 429) held.push(route);
    }
    expect(unlimited).toEqual([]);
    expect(held).toEqual([]);
  });
});

describe('work that costs, for visitors who are not logged in (plan 8Z-2)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  /** The application's emoji, every id one of them, over a cache that records what it is asked. */
  const emojiWith = () => {
    const fetched: string[] = [];
    const emoji = new EmojiPictures({
      emoji: { hasId: () => true },
      cache: {
        get: (request) => {
          fetched.push(request.id);
          return Promise.resolve(`file-${request.id}`);
        },
      },
      read: () => Promise.resolve(PNG),
    });
    return { emoji, fetched };
  };
  /** The address of the nth emoji. */
  const emojiUrl = (n: number) => `/emoji/${String(100_000_000_000_000_000n + BigInt(n))}.png`;
  /**
   * Spends the overall cap of a minute with emoji never asked for before (those from `from`
   * on), each from an address of its own.
   */
  const spend = async (made: TestWeb, from = 0) => {
    for (let i = from; i < from + PUBLIC_COSTS_PER_MINUTE; i += 1) {
      const answer = await made.app.inject({ url: emojiUrl(i), remoteAddress: address(i) });
      expect(answer.statusCode, String(i)).toBe(200);
    }
  };
  /** An emoji no test asked for before. */
  const FRESH = 20_000;

  it('answers an emoji in memory while the cap is spent, and refuses one that is not', async () => {
    const { emoji, fetched } = emojiWith();
    const made = webServerWith({ emoji });
    web = made;
    await spend(made);
    const refused = await made.app.inject({ url: emojiUrl(FRESH), remoteAddress: address(FRESH) });
    expect(refused.statusCode).toBe(429);
    expect(refused.headers['retry-after']).toBe('60');
    expect(refused.headers['cache-control']).toBe('no-store');
    expect(fetched).toHaveLength(PUBLIC_COSTS_PER_MINUTE);
    const kept = await made.app.inject({ url: emojiUrl(0), remoteAddress: address(FRESH) });
    expect(kept.statusCode).toBe(200);
    expect(kept.rawPayload).toEqual(PNG);
    // One the application does not have is not found, as ever: nothing was to be done for it.
    const none = webServerWith();
    try {
      expect((await none.app.inject({ url: emojiUrl(1) })).statusCode).toBe(404);
    } finally {
      await none.app.close();
    }
    made.clock.now += 60_000;
    const later = await made.app.inject({ url: emojiUrl(FRESH), remoteAddress: address(FRESH) });
    expect(later.statusCode).toBe(200);
  });

  it('never counts an answer from memory', async () => {
    const { emoji, fetched } = emojiWith();
    const made = webServerWith({ emoji });
    web = made;
    for (let i = 0; i < PUBLIC_COSTS_PER_MINUTE + 5; i += 1) {
      const answer = await made.app.inject({ url: emojiUrl(0), remoteAddress: address(i) });
      expect(answer.statusCode, String(i)).toBe(200);
    }
    expect(fetched).toHaveLength(1);
    expect((await made.app.inject({ url: emojiUrl(1) })).statusCode).toBe(200);
  });

  it('neither counts nor refuses whoever is logged in, and sends them no cookie', async () => {
    const { emoji, fetched } = emojiWith();
    const made = webServerWith({ emoji });
    web = made;
    const cookie = await made.loggedIn(ASH, 'Ash');
    // The session is due to be renewed: a public picture still carries no cookie.
    made.clock.now += 2 * 3_600_000;
    for (let i = 0; i < PUBLIC_COSTS_PER_MINUTE; i += 1) {
      const answer = await made.app.inject({ url: emojiUrl(i), headers: { cookie } });
      expect(answer.statusCode, String(i)).toBe(200);
      expect(answer.headers['set-cookie']).toBeUndefined();
    }
    // None of it counted: the visitors who are not logged in have the whole cap, to its last.
    await spend(made, 10_000);
    expect((await made.app.inject({ url: emojiUrl(FRESH) })).statusCode).toBe(429);
    // And with it spent, whoever is logged in is still answered.
    const more = await made.app.inject({ url: emojiUrl(FRESH), headers: { cookie } });
    expect(more.statusCode).toBe(200);
    expect(more.headers['set-cookie']).toBeUndefined();
    expect(fetched).toHaveLength(2 * PUBLIC_COSTS_PER_MINUTE + 1);
  });

  it('is one cap for the emoji, the stops’ pictures and a server’s regions and gyms', async () => {
    const { emoji } = emojiWith();
    const sources = await geoSourcesWith();
    const KEY = 'ab'.repeat(16);
    const made = webServerWith({
      emoji,
      geo: sources,
      pictures: {
        // A picture that is never in memory: every read of it costs.
        read: async (key, mayCost) => {
          if (key !== KEY) return undefined;
          return mayCost === undefined || (await mayCost()) ? PNG : REFUSED;
        },
      },
    });
    web = made;
    // Built for somebody logged in, which counts nothing; the visitors then spend the cap.
    const cookie = await made.loggedIn(ASH, 'Ash');
    expect((await made.app.inject({ url: GEO, headers: { cookie } })).statusCode).toBe(200);
    await spend(made);
    const picture = await made.app.inject({ url: `/pictures/${KEY}.png` });
    expect(picture.statusCode).toBe(429);
    expect(picture.headers['retry-after']).toBe('60');
    // The view as it was built is in memory: answered, and with 304 to who has it.
    const kept = await made.app.inject({ url: GEO });
    expect(kept.statusCode).toBe(200);
    const etag = String(kept.headers.etag);
    expect(
      (await made.app.inject({ url: GEO, headers: { 'if-none-match': etag } })).statusCode,
    ).toBe(304);
    // A gym changed: the view must be built anew, which costs.
    await sources.gyms.update(1, { name: 'Pinewood Central Library' });
    await sources.directory.refreshGym(1);
    const stale = await made.app.inject({ url: GEO, remoteAddress: address(FRESH) });
    expect(stale.statusCode).toBe(429);
    expect(stale.headers['retry-after']).toBe('60');
    expect(stale.json()).toEqual({ error: expect.any(String) as string });
    // Somebody logged in has it built, and it serves the visitors after them.
    const built = await made.app.inject({ url: GEO, headers: { cookie } });
    expect(built.statusCode).toBe(200);
    expect(built.headers.etag).not.toBe(etag);
    expect(
      (await made.app.inject({ url: `/pictures/${KEY}.png`, headers: { cookie } })).statusCode,
    ).toBe(200);
    const after = await made.app.inject({ url: GEO, remoteAddress: address(FRESH + 1) });
    expect(after.statusCode).toBe(200);
    expect(after.headers.etag).toBe(built.headers.etag);
  });
});
