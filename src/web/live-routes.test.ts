import type { Readable } from 'node:stream';
import { get, type IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PacedDirectory } from './paced-members.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { heldCall, type HeldCall } from '../../test/support/held-call.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { Tally } from '../../test/support/tally.js';
import { cookieOf, webServerWith, type TestWeb } from '../../test/support/web.js';
import {
  LIVE_LIFETIME_MS,
  LIVE_PING_MS,
  MAX_LIVE_PER_ADDRESS,
  MAX_LIVE_PER_MEMBER,
} from './live-signals.js';
import { LIVE_PER_MINUTE } from './live-routes.js';
import { startWebServer } from './start.js';

const URL = `/s/${FAKE_GUILD_ID}/api/live`;
const ALICE = '200000000000000001';
const PING = 'event: ping\ndata: 1000\n\n';
const REPORTS = 'event: changed\ndata: stop-reports 1000\n\n';

/** Alice a member, the question held until the test lets it go. */
function heldDirectory(asked: HeldCall): PacedDirectory {
  return {
    holds: () => true,
    find: async () => {
      asked.arrive();
      await asked.released;
      return { id: ALICE, name: 'Alice' };
    },
  };
}

/** What a stream gave so far, as a count to wait for. */
function reading(stream: Readable) {
  const events: string[] = [];
  const came = new Tally('the events of the stream');
  const ended = new Tally('the end of the stream');
  stream.on('data', (chunk: Buffer) => {
    events.push(chunk.toString());
    came.add();
  });
  stream.on('end', () => {
    ended.add();
  });
  stream.on('error', () => {
    ended.add();
  });
  return { events, came, ended };
}

describe('GET /s/<guild>/api/live', () => {
  let web: TestWeb;
  const members = (): FakeMemberDirectory => new FakeMemberDirectory().add(ALICE, 'Alice');

  afterEach(async () => {
    await web.app.close();
  });

  const opened = (cookie: string, remoteAddress = '203.0.113.1') =>
    web.app.inject({
      method: 'GET',
      url: URL,
      headers: { cookie },
      remoteAddress,
      payloadAsStream: true,
    });

  it('answers 401 without a session, with the security headers', async () => {
    web = webServerWith({ members: members() });
    const answer = await web.app.inject({ method: 'GET', url: URL });
    expect(answer.statusCode).toBe(401);
    expect(answer.headers['x-content-type-options']).toBe('nosniff');
  });

  it('answers 403 to somebody who is no member', async () => {
    web = webServerWith({ members: members() });
    const answer = await web.app.inject({
      method: 'GET',
      url: URL,
      headers: { cookie: await web.loggedIn('200000000000000009', 'Mallory') },
    });
    expect(answer.statusCode).toBe(403);
  });

  it('answers 503 while Discord cannot say, for somebody it never said of', async () => {
    const directory = members();
    directory.failing = new Error('Discord is away');
    web = webServerWith({ members: directory });
    const answer = await web.app.inject({
      method: 'GET',
      url: URL,
      headers: { cookie: await web.loggedIn(ALICE, 'Alice') },
    });
    expect(answer.statusCode).toBe(503);
  });

  it('answers 404 for a server the bot is not in', async () => {
    web = webServerWith({ members: members() });
    const answer = await web.app.inject({
      method: 'GET',
      url: '/s/100000000000000099/api/live',
      headers: { cookie: await web.loggedIn(ALICE, 'Alice') },
    });
    expect(answer.statusCode).toBe(404);
  });

  it('counts every opening against the address', async () => {
    web = webServerWith({ members: members() });
    for (let n = 0; n < LIVE_PER_MINUTE; n++) {
      expect((await web.app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);
    }
    const refused = await web.app.inject({ method: 'GET', url: URL });
    expect(refused.statusCode).toBe(429);
    expect(refused.headers['retry-after']).toBeDefined();
  });

  it('opens with event-stream headers, the security headers and a first ping', async () => {
    web = webServerWith({ members: members() });
    const answer = await opened(await web.loggedIn(ALICE, 'Alice'));
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toBe('text/event-stream');
    expect(answer.headers['cache-control']).toBe('no-store, no-transform');
    expect(answer.headers['x-accel-buffering']).toBe('no');
    expect(answer.headers['x-content-type-options']).toBe('nosniff');
    expect(answer.headers['content-security-policy']).toBeDefined();
    const stream = reading(answer.stream());
    await stream.came.reached(1);
    expect(stream.events).toEqual([PING]);
  });

  it('sends a signal when it arrives, and a ping every 25 seconds', async () => {
    web = webServerWith({ members: members() });
    const stream = reading((await opened(await web.loggedIn(ALICE, 'Alice'))).stream());
    await stream.came.reached(1);
    web.live.reportsChanged(FAKE_GUILD_ID);
    await stream.came.reached(2);
    expect(stream.events[1]).toBe(REPORTS);
    web.liveTimers.pass(LIVE_PING_MS);
    await stream.came.reached(3);
    expect(stream.events[2]).toBe(PING);
  });

  it('carries a session cookie renewed on the way', async () => {
    web = webServerWith({ members: members() });
    const cookie = await web.loggedIn(ALICE, 'Alice');
    web.clock.now += 2 * 60 * 60_000;
    const answer = await opened(cookie);
    expect(cookieOf(answer, web.sessionService.cookieName)).toBeDefined();
  });

  it('forgets a stream whose client went, and logs the request at debug', async () => {
    web = webServerWith({ members: members() });
    const cookie = await web.loggedIn(ALICE, 'Alice');
    const held = [];
    for (let n = 0; n < MAX_LIVE_PER_MEMBER; n++) {
      held.push(await opened(cookie, `203.0.113.${n + 1}`));
    }
    expect((await opened(cookie, '203.0.113.50')).statusCode).toBe(429);
    const first = held[0];
    if (!first) throw new Error('no stream');
    first.raw.res.destroy();
    await web.liveGone.reached(1);
    expect((await opened(cookie, '203.0.113.50')).statusCode).toBe(200);
    expect(web.entries).toContainEqual(
      expect.objectContaining({
        level: 20,
        msg: 'web request',
        method: 'GET',
        route: '/s/:guild/api/live',
        status: 200,
        ms: expect.any(Number) as number,
      }),
    );
  });

  it('holds an address to its streams', async () => {
    const directory = members();
    const ids = Array.from({ length: MAX_LIVE_PER_ADDRESS + 1 }, (_, n) => `30000000000000000${n}`);
    for (const id of ids) directory.add(id, id);
    web = webServerWith({ members: directory });
    for (const id of ids.slice(0, MAX_LIVE_PER_ADDRESS)) {
      expect((await opened(await web.loggedIn(id, id))).statusCode).toBe(200);
    }
    const last = ids[MAX_LIVE_PER_ADDRESS] ?? '';
    expect((await opened(await web.loggedIn(last, last))).statusCode).toBe(429);
  });

  it('ends a stream at its lifetime’s end, which asks the session and membership again', async () => {
    const directory = members();
    web = webServerWith({ members: directory });
    const answer = await opened(await web.loggedIn(ALICE, 'Alice'));
    const stream = reading(answer.stream());
    await stream.came.reached(1);
    web.liveTimers.pass(LIVE_LIFETIME_MS);
    await stream.ended.reached(1);
    // A proper end: the one web request logged, by Fastify's `onResponse`.
    await web.app.close();
    expect(web.entries.filter((entry) => entry.route === '/s/:guild/api/live')).toHaveLength(1);
  });

  it('ends the streams of a session that logs out, and leaves the member’s other session its own (plan 8Z-2)', async () => {
    web = webServerWith({ members: members() });
    const laptop = await web.posting(ALICE, 'Alice');
    const phone = await web.loggedIn(ALICE, 'Alice');
    const ending = reading((await opened(laptop.cookie ?? '')).stream());
    const staying = reading((await opened(phone, '203.0.113.2')).stream());
    await ending.came.reached(1);
    await staying.came.reached(1);
    const out = await web.app.inject({ method: 'POST', url: '/auth/logout', headers: laptop });
    expect(out.statusCode).toBe(204);
    await ending.ended.reached(1);
    // The other session's stream is told of the next change as ever.
    web.live.reportsChanged(FAKE_GUILD_ID);
    await staying.came.reached(2);
    expect(staying.events[1]).toBe(REPORTS);
    expect(staying.ended.count).toBe(0);
    expect(ending.events).toEqual([PING]);
  });

  it('ends a stream at the keep-alive after its member left the server (plan 8Z-2)', async () => {
    const directory = members();
    web = webServerWith({ members: directory });
    const stream = reading((await opened(await web.loggedIn(ALICE, 'Alice'))).stream());
    await stream.came.reached(1);
    expect(directory.asked).toEqual([`${FAKE_GUILD_ID}:${ALICE}`]);
    directory.remove(ALICE);
    web.liveTimers.pass(LIVE_PING_MS);
    await stream.ended.reached(1);
    // The keep-alive came first, then the directory's answer ended the stream: asked once more,
    // through the question the opening asked.
    expect(stream.events).toEqual([PING, PING]);
    expect(directory.asked).toHaveLength(2);
  });

  it('ends its streams when the server closes', async () => {
    web = webServerWith({ members: members() });
    const answer = await opened(await web.loggedIn(ALICE, 'Alice'));
    const stream = reading(answer.stream());
    await stream.came.reached(1);
    await web.app.close();
    await stream.ended.reached(1);
  });

  it('answers 503 to a request already past the router when the hub closes', async () => {
    const asked = heldCall('the question whether somebody is a member');
    const directory = heldDirectory(asked);
    web = webServerWith({ members: directory });
    const answering = web.app.inject({
      method: 'GET',
      url: URL,
      headers: { cookie: await web.loggedIn(ALICE, 'Alice') },
    });
    await asked.reached;
    web.live.close();
    asked.release();
    expect((await answering).statusCode).toBe(503);
  });

  it('registers no stream for a client gone before it opened', async () => {
    const asked = heldCall('the question whether somebody is a member');
    const directory = heldDirectory(asked);
    web = webServerWith({ members: directory });
    const replied = new Tally('the answer of the route');
    const open = vi.spyOn(web.live, 'open');
    let client: { destroy(): void } | undefined;
    web.app.addHook('onRequest', async (_request, reply) => {
      client = reply.raw;
    });
    web.app.addHook('onSend', async (_request, _reply, payload) => {
      replied.add();
      return payload;
    });
    const answering = web.app.inject({
      method: 'GET',
      url: URL,
      headers: { cookie: await web.loggedIn(ALICE, 'Alice') },
      payloadAsStream: true,
    });
    await asked.reached;
    client?.destroy();
    asked.release();
    await answering.catch(() => undefined);
    await replied.reached(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('opens nothing for a HEAD, which has no route of its own', async () => {
    web = webServerWith({ members: members() });
    const open = vi.spyOn(web.live, 'open');
    const answer = await web.app.inject({
      method: 'HEAD',
      url: URL,
      headers: { cookie: await web.loggedIn(ALICE, 'Alice') },
    });
    expect(answer.statusCode).toBe(404);
    expect(open).not.toHaveBeenCalled();
  });
});

describe('the live stream over a real socket', () => {
  let web: TestWeb;

  const connected = async (cookie: string) => {
    if (!(await startWebServer(web.app, { host: '127.0.0.1', port: 0 }, web.log))) {
      throw new Error('it did not listen');
    }
    const address = web.app.server.address();
    if (address === null || typeof address === 'string') throw new Error('not listening');
    return new Promise<IncomingMessage>((resolve, reject) => {
      const request = get(
        { host: '127.0.0.1', port: address.port, path: URL, headers: { cookie } },
        resolve,
      );
      request.on('error', reject);
    });
  };

  it('has its headers before any signal, and the first ping with them', async () => {
    web = webServerWith({ members: new FakeMemberDirectory().add(ALICE, 'Alice') });
    const response = await connected(await web.loggedIn(ALICE, 'Alice'));
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    const stream = reading(response);
    await stream.came.reached(1);
    expect(stream.events[0]).toBe(PING);
    await web.app.close();
    await stream.ended.reached(1);
  });

  it('does not hold the close with a stream open', async () => {
    web = webServerWith({ members: new FakeMemberDirectory().add(ALICE, 'Alice') });
    const response = await connected(await web.loggedIn(ALICE, 'Alice'));
    const stream = reading(response);
    await stream.came.reached(1);
    try {
      // A close held by the stream fails here, as the stream's end that never came.
      const closing = web.app.close();
      await stream.ended.reached(1);
      await closing;
      expect(web.app.server.listening).toBe(false);
    } finally {
      response.destroy();
    }
  });
});
