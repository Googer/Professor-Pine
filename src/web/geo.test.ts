import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { geoSourcesWith, webServerWith, type TestWeb } from '../../test/support/web.js';

const GEO = `/s/${FAKE_GUILD_ID}/api/geo`;

interface View {
  regions: Array<{ id: number; name: string }>;
  gyms: Array<{ id: number; name: string }>;
}

describe('the regions and gyms of a server', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('are public, in JSON with a strong ETag, to be asked again each time', async () => {
    const sources = await geoSourcesWith();
    web = webServerWith({ geo: sources });
    const answer = await web.app.inject({ url: GEO });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toMatch(/^application\/json/);
    expect(answer.headers['cache-control']).toBe('no-cache');
    expect(answer.headers.etag).toMatch(/^"[A-Za-z0-9_-]{20,}"$/);
    const view = answer.json<View>();
    expect(view.regions.map((region) => region.name)).toEqual(['east', 'west']);
    expect(view.gyms).toHaveLength(11);
  });

  it('answer an unchanged view with 304, and nothing else', async () => {
    const sources = await geoSourcesWith();
    web = webServerWith({ geo: sources });
    const first = await web.app.inject({ url: GEO });
    const etag = String(first.headers.etag);
    const again = await web.app.inject({ url: GEO, headers: { 'if-none-match': etag } });
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe('');
    expect(again.headers.etag).toBe(etag);
    const other = await web.app.inject({ url: GEO, headers: { 'if-none-match': '"other"' } });
    expect(other.statusCode).toBe(200);
  });

  it('are built anew when a gym changes, the regions load, or a channel is renamed', async () => {
    const sources = await geoSourcesWith();
    web = webServerWith({ geo: sources });
    const etags = [String((await web.app.inject({ url: GEO })).headers.etag)];
    const named = async () => {
      const answer = await web?.app.inject({ url: GEO });
      etags.push(String(answer?.headers.etag));
      return answer?.json<View>();
    };

    await sources.gyms.update(1, { name: 'Pinewood Central Library' });
    await sources.directory.refreshGym(1);
    expect((await named())?.gyms.find((gym) => gym.id === 1)?.name).toBe(
      'Pinewood Central Library',
    );

    sources.regionRows.rows = sources.regionRows.rows.filter(
      (region) => region.channelId !== EAST_CHANNEL,
    );
    await sources.regions.load();
    expect((await named())?.regions.map((region) => region.name)).toEqual(['west']);

    sources.channelNames.set(WEST_CHANNEL, 'west-end');
    expect((await named())?.regions.map((region) => region.name)).toEqual(['west-end']);

    expect(new Set(etags).size).toBe(4);
  });

  it('are empty for a server without regions', async () => {
    const sources = await geoSourcesWith();
    web = webServerWith({
      geo: sources,
      servers: { has: (guild) => guild === FAKE_GUILD_ID || guild === '412345678901234999' },
    });
    const answer = await web.app.inject({ url: '/s/412345678901234999/api/geo' });
    expect(answer.json()).toEqual({ regions: [], gyms: [] });
  });

  it('are asked for at most 60 times a minute from one address, 304s counted', async () => {
    const sources = await geoSourcesWith();
    web = webServerWith({ geo: sources });
    const etag = String((await web.app.inject({ url: GEO })).headers.etag);
    for (let i = 1; i < 60; i += 1) {
      const answer = await web.app.inject({ url: GEO, headers: { 'if-none-match': etag } });
      expect(answer.statusCode).toBe(304);
    }
    const refused = await web.app.inject({ url: GEO });
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toEqual({ error: 'Too many requests. Try again in a minute.' });
    expect(refused.headers['retry-after']).toBe('60');
  });

  it('answer 304 to the ETag marked weak, in a list, or to any', async () => {
    const sources = await geoSourcesWith();
    web = webServerWith({ geo: sources });
    const etag = String((await web.app.inject({ url: GEO })).headers.etag);
    for (const sent of [`W/${etag}`, `"other", ${etag}`, `"other",W/${etag} `, '*']) {
      const answer = await web.app.inject({ url: GEO, headers: { 'if-none-match': sent } });
      expect(answer.statusCode, sent).toBe(304);
    }
    for (const sent of ['"other", W/"more"', etag.slice(1, -1), `${etag.slice(0, -2)}"`]) {
      const answer = await web.app.inject({ url: GEO, headers: { 'if-none-match': sent } });
      expect(answer.statusCode, sent).toBe(200);
    }
  });
});

describe('who is asking, asked often', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('is answered at most 60 times a minute to one address', async () => {
    const made = webServerWith();
    web = made;
    const ask = (remoteAddress: string) =>
      made.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/me`, remoteAddress });
    for (let i = 0; i < 60; i += 1) expect((await ask('203.0.113.7')).statusCode).toBe(200);
    const refused = await ask('203.0.113.7');
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toEqual({ error: 'Too many requests. Try again in a minute.' });
    expect((await ask('203.0.113.8')).statusCode).toBe(200);
    made.clock.now += 60_000;
    expect((await ask('203.0.113.7')).statusCode).toBe(200);
  });
});
