import { afterEach, describe, expect, it } from 'vitest';
import { accessKey, accessRequest, ADMIN } from '../../test/support/script-access-cases.js';
import { toolWebWith, webServerWith, WEB_START, type TestWeb } from '../../test/support/web.js';

const JS = 'text/javascript; charset=utf-8';
const scriptUrl = (key: string) => `/userscript/${key}/pine-wayspot-export.user.js`;
const metaUrl = (key: string) => `/userscript/${key}/pine-wayspot-export.meta.js`;

/** The tool of `toolWebWith`, with Ash approved under `accessKey(1)`. */
async function withApprovedAsh(options: Parameters<typeof toolWebWith>[0] = {}) {
  const tool = toolWebWith(options);
  const { access } = await tool.store.ask(accessRequest());
  await tool.store.decide(access.id, {
    decision: 'approve',
    from: 'asked',
    key: accessKey(1),
    at: WEB_START,
  });
  return { tool, id: access.id };
}

describe('the tool file and its header at a key', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it("gives an approved key the tool, its addresses filled with the key's, and records the fetch", async () => {
    const { tool, id } = await withApprovedAsh();
    web = webServerWith({ tool });
    web.clock.now = WEB_START + 5_000;
    const answer = await web.app.inject({ url: scriptUrl(accessKey(1)) });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toBe(JS);
    expect(answer.headers['cache-control']).toBe('no-store');
    const base = `https://map.example.test/userscript/${accessKey(1)}`;
    expect(answer.body).toContain(`// @updateURL    ${base}/pine-wayspot-export.meta.js\n`);
    expect(answer.body).toContain(`// @downloadURL  ${base}/pine-wayspot-export.user.js\n`);
    expect(answer.body).toContain('"{{PINE_META_URL}} stays in the body"');
    expect(await tool.store.byId(id)).toMatchObject({
      lastFetchAt: WEB_START + 5_000,
      lastVersion: '1.2.0',
    });
  });

  it('gives the header block alone at the meta address', async () => {
    const { tool } = await withApprovedAsh();
    web = webServerWith({ tool });
    const answer = await web.app.inject({ url: metaUrl(accessKey(1)) });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toBe(JS);
    expect(answer.body.startsWith('// ==UserScript==\n')).toBe(true);
    expect(answer.body.endsWith('// ==/UserScript==\n')).toBe(true);
    expect(answer.body).toContain(`/userscript/${accessKey(1)}/pine-wayspot-export.meta.js`);
  });

  it('logs a fetch by the route and the row, never the key', async () => {
    const { tool, id } = await withApprovedAsh();
    web = webServerWith({ tool });
    await web.app.inject({ url: scriptUrl(accessKey(1)) });
    expect(web.entries.filter((entry) => entry.level === 30)).toEqual([
      expect.objectContaining({
        route: '/userscript/:key/pine-wayspot-export.user.js',
        method: 'GET',
        access: id,
        version: '1.2.0',
        msg: 'the Wayspot export tool was fetched',
      }),
    ]);
    expect(JSON.stringify(web.entries)).not.toContain(accessKey(1));
  });

  it('records no fetch for a HEAD', async () => {
    const { tool, id } = await withApprovedAsh();
    web = webServerWith({ tool });
    const answer = await web.app.inject({ method: 'HEAD', url: scriptUrl(accessKey(1)) });
    expect(answer.statusCode).toBe(200);
    expect(await tool.store.byId(id)).toMatchObject({ lastFetchAt: null });
  });

  it('answers any other key, and any other address there, with the same plain 404', async () => {
    const { tool, id } = await withApprovedAsh();
    const misty = await tool.store.ask(accessRequest({ userId: `${ADMIN}7`, name: 'Misty' }));
    web = webServerWith({ tool });
    const plain = await web.app.inject({ url: '/userscript/anything/else.js' });
    expect(plain.statusCode).toBe(404);
    expect(plain.headers['content-type']).toBe(JS);
    expect(plain.headers['cache-control']).toBe('no-store');
    const refusedAddresses = [
      scriptUrl(accessKey(2)),
      metaUrl(accessKey(2)),
      scriptUrl(accessKey(1).toUpperCase()),
      scriptUrl('not-a-key'),
      `/userscript/${accessKey(1)}/other.user.js`,
      `/userscript/${accessKey(1)}/`,
    ];
    for (const url of refusedAddresses) {
      const answer = await web.app.inject({ url });
      expect(answer.statusCode, url).toBe(404);
      expect(answer.headers['content-type'], url).toBe(JS);
      expect(answer.headers['cache-control'], url).toBe('no-store');
      expect(answer.body, url).toBe(plain.body);
    }
    // A key replaced, revoked, or of a request not approved is no key either.
    await tool.store.newKey(ADMIN, accessKey(3));
    expect((await web.app.inject({ url: scriptUrl(accessKey(1)) })).body).toBe(plain.body);
    expect((await web.app.inject({ url: scriptUrl(accessKey(3)) })).statusCode).toBe(200);
    await tool.store.decide(id, { decision: 'revoke', from: 'approved', key: null, at: 1 });
    expect((await web.app.inject({ url: scriptUrl(accessKey(3)) })).body).toBe(plain.body);
    expect(misty.access.key).toBeNull();
  });

  it('serves nothing without the file, with a file that does not read, or without the login', async () => {
    const without = await withApprovedAsh({ script: null });
    web = webServerWith({ tool: without.tool });
    expect((await web.app.inject({ url: scriptUrl(accessKey(1)) })).statusCode).toBe(404);
    await web.app.close();

    const broken = await withApprovedAsh({ script: 'console.log("no header");\n' });
    web = webServerWith({ tool: broken.tool });
    expect((await web.app.inject({ url: scriptUrl(accessKey(1)) })).statusCode).toBe(404);
    await web.app.close();

    const noLogin = await withApprovedAsh();
    web = webServerWith({ tool: noLogin.tool, oauth: undefined });
    const answer = await web.app.inject({ url: metaUrl(accessKey(1)) });
    expect(answer.statusCode).toBe(404);
    expect(answer.headers['content-type']).toBe(JS);
    expect(await noLogin.tool.store.byId(noLogin.id)).toMatchObject({ lastFetchAt: null });
  });

  it('answers 30 requests a minute from one address, both addresses together', async () => {
    const { tool } = await withApprovedAsh();
    web = webServerWith({ tool });
    for (let n = 0; n < 15; n++) {
      expect((await web.app.inject({ url: scriptUrl(accessKey(1)) })).statusCode).toBe(200);
      expect((await web.app.inject({ url: metaUrl(accessKey(1)) })).statusCode).toBe(200);
    }
    const refused = await web.app.inject({ url: metaUrl(accessKey(1)) });
    expect(refused.statusCode).toBe(429);
    expect(refused.headers['retry-after']).toBe('60');
    expect(refused.headers['content-type']).toBe(JS);
    expect(refused.headers['cache-control']).toBe('no-store');
    web.clock.now += 60_000;
    expect((await web.app.inject({ url: scriptUrl(accessKey(1)) })).statusCode).toBe(200);
  });
});
