import { describe, expect, it } from 'vitest';
import { authorizeUrl, DiscordOAuth, EXCHANGE_SPACING_MS } from './discord-oauth.js';

const APP = '123456789012345678';

/** A fetch that answers from a list and records what was asked. */
function fakeFetch(...answers: Array<Response | Error>) {
  const asked: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch = (url: string, init?: RequestInit): Promise<Response> => {
    asked.push({ url, init });
    const next = answers.shift();
    if (next === undefined) return Promise.reject(new Error('nothing more to answer'));
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { fetch, asked };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('authorizeUrl', () => {
  it("asks Discord for the member's identity alone, back to Pine's callback", () => {
    const url = new URL(authorizeUrl(APP, 'https://map.example.test/auth/callback', 'st4te'));
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: APP,
      scope: 'identify',
      state: 'st4te',
      redirect_uri: 'https://map.example.test/auth/callback',
    });
  });
});

describe("DiscordOAuth's limits (plan 8Z)", () => {
  const CALLBACK = 'https://map.example.test/auth/callback';
  /**
   * An OAuth gateway over `answers`, on a clock the test moves. A wait for the exchange's slot
   * passes at once, moving the clock on by its length (`waits` records each); with
   * `waiting.held` it stays open until the test moves the clock and calls its `release`.
   */
  const limited = (...answers: Array<Response | Error>) => {
    const { fetch, asked } = fakeFetch(...answers);
    const clock = { now: 1_000_000 };
    const waits: number[] = [];
    const held: Array<{ ms: number; release: () => void }> = [];
    const waiting = { held: false };
    const oauth = new DiscordOAuth({
      appId: APP,
      secret: 's3cret',
      fetch,
      now: () => clock.now,
      wait: (ms) => {
        waits.push(ms);
        if (!waiting.held) {
          clock.now += ms;
          return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          held.push({ ms, release: resolve });
        });
      },
    });
    return { oauth, asked, clock, waits, held, waiting };
  };
  const token = () => json({ access_token: 'tok' });
  const tooMany = (retryAfter?: string) =>
    new Response('{}', {
      status: 429,
      headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
    });

  it('spaces two logins a moment apart a second, and both succeed (plan 8Z-2)', async () => {
    const { oauth, asked, clock, waits } = limited(token(), token(), token());
    expect(await oauth.exchange('one', CALLBACK)).toEqual({ accessToken: 'tok' });
    clock.now += 200;
    expect(await oauth.exchange('two', CALLBACK)).toEqual({ accessToken: 'tok' });
    // The second waited for its slot, a second after the first, and only then asked Discord.
    expect(waits).toEqual([800]);
    expect(asked).toHaveLength(2);
    // A second later or more the slot is free: no wait.
    clock.now += EXCHANGE_SPACING_MS;
    expect(await oauth.exchange('three', CALLBACK)).toEqual({ accessToken: 'tok' });
    expect(waits).toEqual([800]);
  });

  it('gives each arrival the next slot, and answers busy at once past five seconds', async () => {
    const answers = Array.from({ length: 7 }, token);
    const { oauth, asked, clock, waits, held, waiting } = limited(...answers);
    waiting.held = true;
    // Six at one moment: now, and one to five seconds on.
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((code) => oauth.exchange(code, CALLBACK));
    expect(waits).toEqual([1_000, 2_000, 3_000, 4_000, 5_000]);
    // The seventh's slot is six seconds away: refused without a wait, Discord not asked.
    expect(await oauth.exchange('g', CALLBACK)).toEqual({ failed: 'busy' });
    expect(waits).toHaveLength(5);
    expect(asked).toHaveLength(1);
    // A refused arrival reserved nothing: a second on, the slot six seconds from the start is
    // five away and taken.
    clock.now += 1_000;
    const seventh = oauth.exchange('g', CALLBACK);
    expect(waits).toEqual([1_000, 2_000, 3_000, 4_000, 5_000, 5_000]);
    clock.now += 5_000;
    for (const wait of held) wait.release();
    expect(await Promise.all([...six, seventh])).toEqual(
      Array.from({ length: 7 }, () => ({ accessToken: 'tok' })),
    );
    expect(asked).toHaveLength(7);
  });

  it('asks again whether a 429 stopped the logins once the wait for the slot is over', async () => {
    const { oauth, asked, clock, held, waiting } = limited(tooMany('30'), token());
    waiting.held = true;
    const first = oauth.exchange('one', CALLBACK);
    const second = oauth.exchange('two', CALLBACK);
    expect(await first).toEqual({ failed: 'status 429' });
    clock.now += 1_000;
    held[0]?.release();
    expect(await second).toEqual({ failed: 'busy' });
    expect(asked).toHaveLength(1);
  });

  it('stops for as long as a 429 says, every ask refused meanwhile', async () => {
    const { oauth, asked, clock } = limited(tooMany('30'), token());
    expect(await oauth.exchange('one', CALLBACK)).toEqual({ failed: 'status 429' });
    clock.now += 29_999;
    expect(await oauth.exchange('two', CALLBACK)).toEqual({ failed: 'busy' });
    expect(await oauth.who('tok')).toEqual({ failed: 'busy' });
    expect(asked).toHaveLength(1);
    clock.now += 1;
    expect(await oauth.exchange('two', CALLBACK)).toEqual({ accessToken: 'tok' });
  });

  it('reads a Retry-After with a fraction of a second', async () => {
    const { oauth, clock } = limited(tooMany('1.5'), token());
    await oauth.exchange('one', CALLBACK);
    clock.now += 1_499;
    expect(await oauth.exchange('two', CALLBACK)).toEqual({ failed: 'busy' });
    clock.now += 1;
    expect(await oauth.exchange('two', CALLBACK)).toEqual({ accessToken: 'tok' });
  });

  it.each([
    ['missing', undefined],
    ['unreadable', 'soon'],
    ['negative', '-5'],
  ])('waits 60 seconds when the Retry-After is %s', async (_what, header) => {
    const { oauth, clock } = limited(tooMany(header), token());
    await oauth.exchange('one', CALLBACK);
    clock.now += 59_999;
    expect(await oauth.exchange('two', CALLBACK)).toEqual({ failed: 'busy' });
    clock.now += 1;
    expect(await oauth.exchange('two', CALLBACK)).toEqual({ accessToken: 'tok' });
  });

  it('takes a 429 on who as a stop for the exchange too', async () => {
    const { oauth, asked, clock } = limited(tooMany('10'), token());
    expect(await oauth.who('tok')).toEqual({ failed: 'status 429' });
    expect(await oauth.exchange('one', CALLBACK)).toEqual({ failed: 'busy' });
    expect(asked).toHaveLength(1);
    clock.now += 10_000;
    expect(await oauth.exchange('one', CALLBACK)).toEqual({ accessToken: 'tok' });
  });

  it('never limits who by the second: it follows the exchange of the same login', async () => {
    const { oauth } = limited(token(), json({ id: '123456789012345678', username: 'alice' }));
    await oauth.exchange('one', CALLBACK);
    expect(await oauth.who('tok')).toEqual({ id: '123456789012345678', name: 'alice' });
  });
});

describe('DiscordOAuth', () => {
  it('exchanges a code for a token with the application id and secret, form-encoded', async () => {
    const { fetch, asked } = fakeFetch(json({ access_token: 'tok', token_type: 'Bearer' }));
    const oauth = new DiscordOAuth({ appId: APP, secret: 's3cret', fetch });
    expect(await oauth.exchange('the-code', 'https://map.example.test/auth/callback')).toEqual({
      accessToken: 'tok',
    });
    const [call] = asked;
    expect(call?.url).toBe('https://discord.com/api/v10/oauth2/token');
    expect(call?.init?.method).toBe('POST');
    expect(new Headers(call?.init?.headers).get('content-type')).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(typeof call?.init?.body).toBe('string');
    expect(Object.fromEntries(new URLSearchParams(call?.init?.body as string))).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: 'https://map.example.test/auth/callback',
      client_id: APP,
      client_secret: 's3cret',
    });
    expect(call?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('says why an exchange failed, never with the code or the secret', async () => {
    const cases: Array<Response | Error> = [
      json({ error: 'invalid_grant' }, 400),
      json({ token_type: 'Bearer' }),
      new Response('not json', { status: 200 }),
      new Error('network down'),
    ];
    for (const answer of cases) {
      const oauth = new DiscordOAuth({
        appId: APP,
        secret: 's3cret',
        fetch: fakeFetch(answer).fetch,
      });
      const result = await oauth.exchange('the-code', 'https://map.example.test/auth/callback');
      expect(result).toEqual({ failed: expect.any(String) as string });
      expect(JSON.stringify(result)).not.toMatch(/the-code|s3cret/);
    }
  });

  it('reads no answer larger than 64 KB', async () => {
    const padding = 'x'.repeat(65 * 1024);
    const oauth = new DiscordOAuth({
      appId: APP,
      secret: 's3cret',
      fetch: fakeFetch(
        json({ access_token: 'tok', padding }),
        json({ id: '700000000000000001', username: 'ash_k', padding }),
      ).fetch,
    });
    expect(await oauth.exchange('the-code', 'https://map.example.test/auth/callback')).toEqual({
      failed: 'too-large',
    });
    expect(await oauth.who('tok')).toEqual({ failed: 'too-large' });
  });

  it('asks who the token belongs to: the display name, else the user name', async () => {
    const { fetch, asked } = fakeFetch(
      json({ id: '700000000000000001', username: 'ash_k', global_name: 'Ash' }),
      json({ id: '700000000000000002', username: 'misty', global_name: null }),
    );
    const oauth = new DiscordOAuth({ appId: APP, secret: 's3cret', fetch });
    expect(await oauth.who('tok')).toEqual({ id: '700000000000000001', name: 'Ash' });
    expect(await oauth.who('tok')).toEqual({ id: '700000000000000002', name: 'misty' });
    expect(asked[0]?.url).toBe('https://discord.com/api/v10/users/@me');
    expect(new Headers(asked[0]?.init?.headers).get('authorization')).toBe('Bearer tok');
  });

  it('refuses an answer about somebody that is no member', async () => {
    for (const answer of [
      json({ message: '401: Unauthorized' }, 401),
      json({ id: 'not a snowflake', username: 'x' }),
      json({ id: '700000000000000001' }),
      new Error('network down'),
    ]) {
      const oauth = new DiscordOAuth({
        appId: APP,
        secret: 's3cret',
        fetch: fakeFetch(answer).fetch,
      });
      expect(await oauth.who('tok')).toEqual({ failed: expect.any(String) as string });
    }
  });
});
