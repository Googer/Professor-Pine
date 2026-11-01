import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import {
  builtAssets,
  FakeRegionStaff,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';

const EDITOR = `/s/${FAKE_GUILD_ID}/regions/edit`;
/** The map with the editor on (plan 8M-10), where the editor's address leads staff. */
const ON_THE_MAP = `/s/${FAKE_GUILD_ID}/map?edit=regions`;
const STAFF = '700000000000000001';

/** The attributes of the page's `<body>`. */
function bodyData(html: string): Record<string, string> {
  const body = /<body([^>]*)>/.exec(html)?.[1] ?? '';
  return Object.fromEntries(
    [...body.matchAll(/(data-[\w-]+)="([^"]*)"/g)].map((m): [string, string] => [
      m[1] ?? '',
      m[2] ?? '',
    ]),
  );
}

describe('the region editor page', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('leads staff to the map with the editor on (plan 8M-10)', async () => {
    web = webServerWith({ assets: builtAssets(), staff: new FakeRegionStaff().asStaff(STAFF) });
    const cookie = await web.loggedIn(STAFF, 'Brock');
    const page = await web.app.inject({ url: EDITOR, headers: { cookie } });
    expect(page.statusCode).toBe(303);
    expect(page.headers.location).toBe(ON_THE_MAP);
    expect(page.headers['cache-control']).toBe('no-cache');
    // The map there loads the editor's files when it is turned on.
    const map = await web.app.inject({ url: ON_THE_MAP, headers: { cookie } });
    expect(map.statusCode).toBe(200);
    expect(bodyData(map.body)).toMatchObject({
      'data-editor-script': '/assets/editor-QRSTUVWX.js',
      'data-editor-style': '/assets/editor-YZABCDEF.css',
      'data-worker': '/assets/editor-worker-GHIJKLMN.js',
    });
  });

  it('leads there while Discord cannot say who asks only staff it saw lately', async () => {
    const OTHER = '700000000000000002';
    const staff = new FakeRegionStaff().asStaff(STAFF).asStaff(OTHER);
    const made = webServerWith({ assets: builtAssets(), staff });
    web = made;
    const cookie = await made.loggedIn(STAFF, 'Brock');
    const other = await made.loggedIn(OTHER, 'Misty');
    expect((await made.app.inject({ url: EDITOR, headers: { cookie } })).statusCode).toBe(303);
    staff.failing = new Error('Discord is away');
    // Seen as staff a moment ago: the editor, read-only by its data.
    const page = await made.app.inject({ url: EDITOR, headers: { cookie } });
    expect(page.statusCode).toBe(303);
    expect(page.headers.location).toBe(ON_THE_MAP);
    // Never seen as staff: nothing of the editor.
    const unknown = await made.app.inject({ url: EDITOR, headers: { cookie: other } });
    expect(unknown.statusCode).toBe(503);
    expect(unknown.body).toContain(
      'Discord cannot be reached just now, so I cannot tell whether you are staff.',
    );
    expect(unknown.headers.location).toBeUndefined();
    // Half an hour after the last time Discord said so, no longer.
    made.clock.now += 30 * 60_000;
    expect((await made.app.inject({ url: EDITOR, headers: { cookie } })).statusCode).toBe(503);
  });

  it('tells somebody who is not staff that it is for staff', async () => {
    web = webServerWith({
      assets: builtAssets(),
      staff: new FakeRegionStaff().answer(STAFF, { kind: 'not-staff' }),
    });
    const cookie = await web.loggedIn(STAFF, 'Misty');
    const page = await web.app.inject({ url: EDITOR, headers: { cookie } });
    expect(page.statusCode).toBe(403);
    expect(page.body).toContain('Only staff of this server may edit its regions.');
    expect(page.headers.location).toBeUndefined();
  });

  it('offers a login to somebody logged out, and says why the last one did not happen', async () => {
    web = webServerWith({ assets: builtAssets() });
    const page = await web.app.inject({ url: EDITOR });
    expect(page.statusCode).toBe(401);
    expect(page.body).toContain(
      `<a href="/auth/login?next=%2Fs%2F${FAKE_GUILD_ID}%2Fregions%2Fedit">Log in with Discord</a>`,
    );
    expect(page.body).toContain('Or use /region edit in Discord.');
    const failed = await web.app.inject({ url: `${EDITOR}?login=failed` });
    expect(failed.body).toContain('Login failed.');
    const expired = await web.app.inject({ url: `${EDITOR}?login=expired` });
    expect(expired.body).toContain('This login link has expired.');
    await web.app.close();

    web = webServerWith({ assets: builtAssets(), oauth: undefined });
    const links = await web.app.inject({ url: EDITOR });
    expect(links.body).not.toContain('/auth/login');
    expect(links.body).toContain('Use /region edit in Discord to log in.');
  });

  it('is opened at most 20 times a minute from one address: each asks Discord', async () => {
    const staff = new FakeRegionStaff().asStaff(STAFF);
    const made = webServerWith({ assets: builtAssets(), staff });
    web = made;
    const cookie = await made.loggedIn(STAFF, 'Brock');
    const open = () =>
      made.app.inject({ url: EDITOR, headers: { cookie }, remoteAddress: '203.0.113.7' });
    for (let i = 0; i < 20; i += 1) expect((await open()).statusCode).toBe(303);
    const refused = await open();
    expect(refused.statusCode).toBe(429);
    expect(refused.headers['retry-after']).toBe('60');
    expect(staff.asked).toHaveLength(20);
  });
});
