import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { geoSourcesWith, webServerWith, type TestWeb } from '../../test/support/web.js';
import { REFUSED } from '../services/costly.js';
import { EmojiPictures } from '../services/post-pictures.js';
import { PARTIES_PER_MINUTE } from './party-routes.js';
import {
  COOKIE_LOOKUPS_PER_ADDRESS_MINUTE,
  EMOJI_COSTS_PER_MINUTE,
  GEO_COSTS_PER_MINUTE,
  MEMBER_COSTS_PER_MINUTE,
} from './public-costs.js';

const ASH = '700000000000000001';
const MISTY = '700000000000000002';
const PARTIES = `/s/${FAKE_GUILD_ID}/api/parties`;
const GEO = `/s/${FAKE_GUILD_ID}/api/geo`;

/** What every read's limit is lowered to where a test lowers them (`readUses`). */
const LOWERED = 2;

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
    // Every read's limit lowered to two (F-B9: at their own numbers, up to 480 a route, the test
    // sent thousands of requests); a route without the hooks is still never refused.
    const made = webServerWith({ readUses: () => LOWERED });
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
      for (let i = 0; i <= LOWERED && !refused; i += 1) {
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
   * Spends the visitors' emoji of a minute with emoji never asked for before (those from
   * `from` on), each from an address of its own.
   */
  const spend = async (made: TestWeb, from = 0) => {
    for (let i = from; i < from + EMOJI_COSTS_PER_MINUTE; i += 1) {
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
    expect(fetched).toHaveLength(EMOJI_COSTS_PER_MINUTE);
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
    for (let i = 0; i < EMOJI_COSTS_PER_MINUTE + 5; i += 1) {
      const answer = await made.app.inject({ url: emojiUrl(0), remoteAddress: address(i) });
      expect(answer.statusCode, String(i)).toBe(200);
    }
    expect(fetched).toHaveLength(1);
    expect((await made.app.inject({ url: emojiUrl(1) })).statusCode).toBe(200);
  });

  it('counts whoever is logged in by their account, not against the visitors’ cap, and sends them no cookie (F-B3)', async () => {
    const { emoji, fetched } = emojiWith();
    const made = webServerWith({ emoji });
    web = made;
    const cookie = await made.loggedIn(ASH, 'Ash');
    // The session is due to be renewed: a public picture still carries no cookie.
    made.clock.now += 2 * 3_600_000;
    for (let i = 0; i < MEMBER_COSTS_PER_MINUTE; i += 1) {
      const answer = await made.app.inject({
        url: emojiUrl(i),
        headers: { cookie },
        remoteAddress: address(i),
      });
      expect(answer.statusCode, String(i)).toBe(200);
      expect(answer.headers['set-cookie']).toBeUndefined();
    }
    // Their own sixty misses are spent, from however many addresses and sessions.
    const second = await made.loggedIn(ASH, 'Ash');
    const refused = await made.app.inject({ url: emojiUrl(FRESH), headers: { cookie: second } });
    expect(refused.statusCode).toBe(429);
    expect(refused.headers['retry-after']).toBe('60');
    // An emoji in memory is theirs all the same.
    expect((await made.app.inject({ url: emojiUrl(0), headers: { cookie } })).statusCode).toBe(200);
    // None of it counted against the visitors, who are served to the last of their cap.
    await spend(made, 10_000);
    expect((await made.app.inject({ url: emojiUrl(FRESH) })).statusCode).toBe(429);
    expect(fetched).toHaveLength(MEMBER_COSTS_PER_MINUTE + EMOJI_COSTS_PER_MINUTE);
    made.clock.now += 60_000;
    const later = await made.app.inject({ url: emojiUrl(FRESH), headers: { cookie } });
    expect(later.statusCode).toBe(200);
  });

  it('looks up the cookies of misses at most so often from one address (F-B4)', async () => {
    const { emoji } = emojiWith();
    const made = webServerWith({ emoji });
    web = made;
    const finds = { times: 0 };
    const find = made.sessions.find.bind(made.sessions);
    made.sessions.find = (id, now) => {
      finds.times += 1;
      return find(id, now);
    };
    // A cookie no session has, as well-formed as a real one.
    const junk = { cookie: `__Host-pine_session=${'A'.repeat(43)}` };
    await spend(made);
    const ask = (n: number, remoteAddress: string, headers: Record<string, string> = junk) =>
      made.app.inject({ url: emojiUrl(FRESH + n), headers, remoteAddress });
    for (let i = 0; i < COOKIE_LOOKUPS_PER_ADDRESS_MINUTE + 10; i += 1) {
      expect((await ask(i, '203.0.113.7')).statusCode, String(i)).toBe(429);
    }
    // The cap is spent: each was refused, and past the address's number without a lookup.
    expect(finds.times).toBe(COOKIE_LOOKUPS_PER_ADDRESS_MINUTE);
    // Another address is looked up for; one without a cookie needs no lookup.
    await ask(1_000, '203.0.113.8');
    await ask(1_001, '203.0.113.7', {});
    expect(finds.times).toBe(COOKIE_LOOKUPS_PER_ADDRESS_MINUTE + 1);
    // An emoji in memory is answered whatever is sent with it, and costs no lookup.
    expect((await ask(-FRESH, '203.0.113.7')).statusCode).toBe(200);
    expect(finds.times).toBe(COOKIE_LOOKUPS_PER_ADDRESS_MINUTE + 1);
  });

  it('keeps a budget per kind: spent emoji refuse no picture of a stop (F-B3)', async () => {
    const { emoji } = emojiWith();
    const KEY = 'ab'.repeat(16);
    const made = webServerWith({
      emoji,
      pictures: {
        // A picture that is never in memory: every read of it costs.
        read: async (key, mayCost) => {
          if (key !== KEY) return undefined;
          return mayCost === undefined || (await mayCost()) ? PNG : REFUSED;
        },
      },
    });
    web = made;
    await spend(made);
    expect((await made.app.inject({ url: emojiUrl(FRESH) })).statusCode).toBe(429);
    const picture = await made.app.inject({ url: `/pictures/${KEY}.png` });
    expect(picture.statusCode).toBe(200);
  });

  it('caps the regions and gyms of servers built for visitors, as kept answered all the same', async () => {
    const { emoji } = emojiWith();
    const sources = await geoSourcesWith();
    // Other servers of the bot, each a view of its own to build (empty: no regions).
    const others = Array.from(
      { length: GEO_COSTS_PER_MINUTE },
      (_, i) => `41234567890123${String(i).padStart(4, '0')}`,
    );
    const made = webServerWith({
      emoji,
      geo: sources,
      servers: { has: (guild) => guild === FAKE_GUILD_ID || others.includes(guild) },
    });
    web = made;
    // Built for a visitor, then the visitors spend the cap on the other servers' views.
    expect((await made.app.inject({ url: GEO })).statusCode).toBe(200);
    for (const [i, guild] of others.entries()) {
      const answer = await made.app.inject({
        url: `/s/${guild}/api/geo`,
        remoteAddress: address(i),
      });
      expect(answer.statusCode, guild).toBe(i < GEO_COSTS_PER_MINUTE - 1 ? 200 : 429);
    }
    // Spent views refuse no emoji: a budget of its own.
    expect((await made.app.inject({ url: emojiUrl(FRESH) })).statusCode).toBe(200);
    const cookie = await made.loggedIn(ASH, 'Ash');
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
    // Somebody logged in has it built, counted by their account, and it serves the visitors.
    const built = await made.app.inject({ url: GEO, headers: { cookie } });
    expect(built.statusCode).toBe(200);
    expect(built.headers.etag).not.toBe(etag);
    const after = await made.app.inject({ url: GEO, remoteAddress: address(FRESH + 1) });
    expect(after.statusCode).toBe(200);
    expect(after.headers.etag).toBe(built.headers.etag);
  });
});
