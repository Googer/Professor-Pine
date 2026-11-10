import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { webServerWith, type TestWeb } from '../../test/support/web.js';
import { ICON_FOLDER } from './server.js';
import { EGG_FOLDER } from '../services/egg-pictures.js';
import { LockOverdueError } from '../services/keyed-lock.js';

describe('the web server', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('answers an address it does not serve with a short page, and sends its headers', async () => {
    web = webServerWith();
    const answer = await web.app.inject({ url: '/nothing/here' });
    expect(answer.statusCode).toBe(404);
    expect(answer.headers['content-type']).toMatch(/^text\/html/);
    expect(answer.body).toContain('Not found');
    expect(answer.body.length).toBeLessThan(600);
    expect(answer.headers['x-content-type-options']).toBe('nosniff');
    expect(answer.headers['x-frame-options']).toBe('DENY');
    expect(answer.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('answers in JSON below an api address', async () => {
    web = webServerWith();
    const answer = await web.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/nothing` });
    expect(answer.statusCode).toBe(404);
    expect(answer.json()).toEqual({ error: 'Not found.' });
  });

  it('serves the servers the bot is in, and no other', async () => {
    web = webServerWith();
    const ok = await web.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/me` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ loggedIn: false });
    for (const guild of ['412345678901234999', 'abc', '1', `${FAKE_GUILD_ID}x`]) {
      const answer = await web.app.inject({ url: `/s/${guild}/api/me` });
      expect(answer.statusCode, guild).toBe(404);
      expect(answer.json(), guild).toEqual({ error: 'Not found.' });
    }
  });

  it('answers a failure briefly, without what went wrong, and logs it', async () => {
    web = webServerWith({
      servers: {
        has() {
          throw new Error('the cache is gone');
        },
      },
    });
    const answer = await web.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/me` });
    expect(answer.statusCode).toBe(500);
    expect(answer.json()).toEqual({ error: 'Something went wrong.' });
    expect(answer.body).not.toContain('cache');
    const logged = web.entries.filter((entry) => entry.msg === 'the web server failed');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ level: 50, route: '/s/:guild/api/me' });
    expect((logged[0]?.err as { message: string }).message).toBe('the cache is gone');
  });

  it('answers a change that waited too long for an earlier one as not available just now, unlogged', async () => {
    web = webServerWith({
      servers: {
        has() {
          throw new LockOverdueError('a party');
        },
      },
    });
    const answer = await web.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/me` });
    expect(answer.statusCode).toBe(503);
    expect(answer.json()).toEqual({ error: 'Not available just now. Try again in a moment.' });
    expect(web.entries.filter((entry) => entry.msg === 'the web server failed')).toEqual([]);
  });

  it('logs a request by its route, never by what its address carries', async () => {
    web = webServerWith();
    await web.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/me?token=hush-hush` });
    await web.app.inject({ url: '/missing?code=hush-hush' });
    const requests = web.entries.filter((entry) => entry.msg === 'web request');
    expect(requests).toEqual([
      expect.objectContaining({
        level: 20,
        method: 'GET',
        route: '/s/:guild/api/me',
        status: 200,
      }),
      expect.objectContaining({ level: 20, method: 'GET', route: '(none)', status: 404 }),
    ]);
    expect(JSON.stringify(web.entries)).not.toContain('hush-hush');
  });

  it('serves the square egg pictures to anybody, kept long, and nothing else under /eggs/', async () => {
    web = webServerWith();
    const answer = await web.app.inject({ url: '/eggs/raid_egg_2_icon.png' });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toBe('image/png');
    expect(answer.headers['cache-control']).toBe('public, max-age=2592000');
    expect(
      answer.rawPayload.equals(readFileSync(path.join(EGG_FOLDER, 'raid_egg_2_icon.png'))),
    ).toBe(true);
    expect(answer.headers['x-content-type-options']).toBe('nosniff');
    for (const url of [
      '/eggs/raid_egg_9_icon.png',
      '/eggs/raid_egg_2_icon',
      '/eggs/',
      '/eggs/..%2Fraid_egg_2_icon.png',
      '/eggs/../package.json',
    ]) {
      expect((await web.app.inject({ url })).statusCode, url).toBe(404);
    }
    const head = await web.app.inject({ method: 'HEAD', url: '/eggs/raid_ultra_icon.png' });
    expect(head.statusCode).toBe(200);
  });

  // Plan 8M-11A (S14): the game's Dynamax icon kept in Pine, for the Report menu's mask.
  it('serves the icons Pine keeps to anybody, kept long, and nothing else under /icons/', async () => {
    web = webServerWith();
    for (const file of ['dynamax.png', 'gigantamax.png']) {
      const answer = await web.app.inject({ url: `/icons/${file}` });
      expect(answer.statusCode, file).toBe(200);
      expect(answer.headers['content-type']).toBe('image/png');
      expect(answer.headers['cache-control']).toBe('public, max-age=2592000');
      expect(answer.rawPayload.equals(readFileSync(path.join(ICON_FOLDER, file)))).toBe(true);
    }
    for (const url of ['/icons/nothing.png', '/icons/', '/icons/..%2Fdynamax.png']) {
      expect((await web.app.inject({ url })).statusCode, url).toBe(404);
    }
  });

  it('serves the square pictures of the stops it made to anybody, kept long, and nothing else under /pictures/ (plan 8R-6)', async () => {
    const key = 'ab'.repeat(16);
    const picture = Buffer.from('a square picture');
    const asked: string[] = [];
    web = webServerWith({
      pictures: {
        read: (wanted) => {
          asked.push(wanted);
          return Promise.resolve(wanted === key ? picture : undefined);
        },
      },
    });
    const answer = await web.app.inject({ url: `/pictures/${key}.png?v=0123abcd` });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toBe('image/png');
    expect(answer.headers['cache-control']).toBe('public, max-age=2592000');
    expect(answer.rawPayload.equals(picture)).toBe(true);
    for (const url of [
      `/pictures/${'cd'.repeat(16)}.png`,
      `/pictures/${key}`,
      `/pictures/${key.toUpperCase()}.png`,
      '/pictures/',
      `/pictures/..%2F${key}.png`,
      '/pictures/../package.json',
    ]) {
      expect((await web.app.inject({ url })).statusCode, url).toBe(404);
    }
    // Only a key of the right shape is looked up.
    expect(asked).toEqual([key, 'cd'.repeat(16)]);
  });

  it('names no server at its root to a visitor not logged in (the top page: top-page.test.ts)', async () => {
    web = webServerWith({ serversWithMap: [{ id: FAKE_GUILD_ID, name: 'Pinewood' }] });
    const answer = await web.app.inject({ url: '/' });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toMatch(/^text\/html/);
    expect(answer.body).toContain('/maps');
    expect(answer.body).not.toContain('Pinewood');
    expect(answer.body).not.toContain(FAKE_GUILD_ID);
  });
});
