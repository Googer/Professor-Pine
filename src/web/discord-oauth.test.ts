import { describe, expect, it } from 'vitest';
import { authorizeUrl, DiscordOAuth } from './discord-oauth.js';

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
