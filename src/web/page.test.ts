import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, onTestFinished } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { builtAssets, webServerWith, type TestWeb } from '../../test/support/web.js';
import { readAssets } from './page.js';

const MAP = `/s/${FAKE_GUILD_ID}/map`;

describe("the bundle's manifest", () => {
  it("names the map's, the editor's, the tool page's and the history page's files, and is none when it lacks one", async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pine-web-'));
    onTestFinished(() => {
      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    });
    const manifest = {
      map: { script: 'map-A.js', style: 'map-B.css', theme: 'theme-H.js' },
      editor: { script: 'editor-C.js', style: 'editor-D.css', worker: 'editor-worker-E.js' },
      userscript: { script: 'userscript-F.js', style: 'userscript-G.css' },
      history: { script: 'history-I.js', style: 'history-J.css' },
    };
    writeFileSync(path.join(root, 'assets.json'), JSON.stringify(manifest));
    expect(await readAssets(root)).toEqual({ dir: path.resolve(root, 'assets'), manifest });
    // What an older build wrote: the map's names alone.
    writeFileSync(path.join(root, 'assets.json'), '{"script":"map-A.js","style":"map-B.css"}');
    expect((await readAssets(root)).manifest).toBeUndefined();
    writeFileSync(
      path.join(root, 'assets.json'),
      JSON.stringify({ ...manifest, editor: { script: 'x.js', style: 'y.css' } }),
    );
    expect((await readAssets(root)).manifest).toBeUndefined();
    // What the build before the tool's page wrote: the map's and the editor's names alone.
    writeFileSync(
      path.join(root, 'assets.json'),
      JSON.stringify({ map: manifest.map, editor: manifest.editor }),
    );
    expect((await readAssets(root)).manifest).toBeUndefined();
    // What the build before the theme's choice wrote (plan 8M-13): the map without its head script.
    writeFileSync(
      path.join(root, 'assets.json'),
      JSON.stringify({ ...manifest, map: { script: 'map-A.js', style: 'map-B.css' } }),
    );
    expect((await readAssets(root)).manifest).toBeUndefined();
    // What the build before the history page wrote (plan 8H-5).
    const { history: _history, ...before } = manifest;
    writeFileSync(path.join(root, 'assets.json'), JSON.stringify(before));
    expect((await readAssets(root)).manifest).toBeUndefined();
  });
});

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

describe('the map page', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it("loads the bundle's script and style, and nothing inline", async () => {
    web = webServerWith({ assets: builtAssets() });
    const page = await web.app.inject({ url: MAP });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/^text\/html/);
    expect(page.headers['cache-control']).toBe('no-cache');
    expect(page.body).toContain('<script src="/assets/map-ABCDEFGH.js" defer></script>');
    expect(page.body).toContain('<link rel="stylesheet" href="/assets/map-IJKLMNOP.css">');
    expect(page.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    // The theme chosen (plan 8M-13, S10), set before the page is drawn: a classic script of the
    // head, neither deferred nor async, before the stylesheet.
    const head = page.body.slice(0, page.body.indexOf('</head>'));
    const theme = head.indexOf('<script src="/assets/theme-STUVWXYZ.js"></script>');
    expect(theme).toBeGreaterThan(0);
    expect(theme).toBeLessThan(head.indexOf('<link rel="stylesheet"'));
    expect(page.body).not.toMatch(/<style|\sstyle=|\son\w+=/i);
    // The title, "Pine" alone narrower than 768 pixels (fix round 1).
    expect(page.body).toContain(
      '<span class="title"><span class="title-first">Professor </span>Pine</span>',
    );
    expect(bodyData(page.body)).toEqual({
      'data-guild': FAKE_GUILD_ID,
      'data-tiles': 'osm',
      'data-login': 'discord',
      'data-distance-units': 'imperial',
      // The region editor's files (plan 8M-10), loaded only when it is first turned on.
      'data-editor-script': '/assets/editor-QRSTUVWX.js',
      'data-editor-style': '/assets/editor-YZABCDEF.css',
      'data-worker': '/assets/editor-worker-GHIJKLMN.js',
    });
    // The row of the layers (plan 8M-7), which the script fills; beside it the editor's tools,
    // hidden until the editor is on (plan 8M-10), led by the way back to the map.
    expect(page.body).toContain(
      '<nav id="layers" aria-label="Layers"></nav>' +
        '<div id="editor-bar" class="editor-only" hidden>' +
        '<button id="editor-back" type="button">Back to the map</button>' +
        '<span id="editor-tools"></span></div>',
    );
    // The side pane of what is on (plan 8M-7; the meetups' panel of 8M-3 before), hidden until
    // the script draws it, and the phone's button that swaps the map for it; the editor's map
    // and panel in their places, hidden until it is on (plan 8M-10); the editor's map a landmark
    // of its own while the live map's `<main>` is hidden (branch review W3).
    expect(page.body).toContain(
      '<main id="map" aria-label="Map"></main>' +
        '<aside id="parties" aria-label="What\'s going on" hidden></aside>' +
        '<div id="editor-map" class="editor-only" role="region" aria-label="Map of the regions" hidden></div>' +
        '<aside id="editor-panel" class="editor-only" aria-label="Regions" hidden></aside></div>',
    );
    // Its words say what it shows next ("List", "Map"), so it is no toggle: a screen reader
    // would read "Map, pressed" (review fix 9).
    expect(page.body).toContain(
      '<button id="list-button" class="list-button" type="button">List</button>',
    );
    expect(page.body).not.toContain('aria-pressed');
    // The Report button (plan 8M-9A): before "Find a gym", hidden until the script knows a
    // member who may report; on a phone it floats over the map instead (map.css).
    expect(page.body).toContain(
      '<button id="report-button" class="report-button" type="button" aria-haspopup="dialog" hidden>Report</button>' +
        '\n<input id="filter"',
    );
    // On a phone "Find a gym" opens from a button of the one row (fix round 1).
    expect(page.body).toContain(
      '<button id="search-button" class="search-button" type="button" aria-controls="filter" aria-expanded="false">Find</button>',
    );
    // The read-only line of the parties: a line of its own under the header. The notice band
    // (plan 8M-11A) lies over the top of the map, with its ×, and goes away by itself.
    expect(page.body).toContain('<p id="read-only" role="status" hidden></p>');
    expect(page.body).toContain(
      '<div id="content"><div id="notice" role="status" hidden><span id="notice-text"></span>' +
        '<button id="notice-close" type="button" aria-label="Hide this line">×</button></div>' +
        '<main id="map"',
    );
  });

  it("gives the page Google's tiles and the browser key only when both are set", async () => {
    web = webServerWith({
      assets: builtAssets(),
      web: { tiles: 'google' },
      googleKey: 'browser"key<',
    });
    const page = await web.app.inject({ url: MAP });
    expect(bodyData(page.body)).toMatchObject({
      'data-tiles': 'google',
      'data-google-key': 'browser&quot;key&lt;',
    });
    expect(page.headers['content-security-policy']).toContain('https://tile.googleapis.com');
    await web.app.close();

    web = webServerWith({ assets: builtAssets(), web: { tiles: 'google' } });
    const without = await web.app.inject({ url: MAP });
    // Without the key: Stadia Maps' tiles alone (plan 8M-7), as with the default.
    expect(bodyData(without.body)).not.toHaveProperty('data-google-key');
    expect(bodyData(without.body)).toMatchObject({
      'data-guild': FAKE_GUILD_ID,
      'data-tiles': 'stadia',
      'data-login': 'discord',
      'data-distance-units': 'imperial',
    });
    expect(without.headers['content-security-policy']).not.toContain('googleapis');
    expect(without.headers['content-security-policy']).toContain('https://tiles.stadiamaps.com');
  });

  it("gives the page Stadia Maps' tiles, which need no key, and OpenStreetMap's alone for 'osm'", async () => {
    web = webServerWith({ assets: builtAssets(), web: { tiles: 'stadia' } });
    const page = await web.app.inject({ url: MAP });
    expect(bodyData(page.body)['data-tiles']).toBe('stadia');
    expect(page.headers['content-security-policy']).toContain('https://tiles.stadiamaps.com');
    await web.app.close();

    web = webServerWith({ assets: builtAssets(), web: { tiles: 'osm' } });
    const osm = await web.app.inject({ url: MAP });
    expect(bodyData(osm.body)['data-tiles']).toBe('osm');
    expect(osm.headers['content-security-policy']).not.toContain('stadiamaps');
  });

  it('tells the page the units of distances the settings name (task 7)', async () => {
    web = webServerWith({ assets: builtAssets(), distanceUnits: 'metric' });
    const page = await web.app.inject({ url: MAP });
    expect(bodyData(page.body)['data-distance-units']).toBe('metric');
  });

  it('offers no login with Discord without the client secret', async () => {
    web = webServerWith({ assets: builtAssets(), oauth: undefined });
    const page = await web.app.inject({ url: MAP });
    expect(bodyData(page.body)['data-login']).toBe('links');
  });

  it('is not found for a server the bot is not in', async () => {
    web = webServerWith({ assets: builtAssets() });
    const page = await web.app.inject({ url: '/s/412345678901234999/map' });
    expect(page.statusCode).toBe(404);
    expect(page.headers['content-type']).toMatch(/^text\/html/);
  });

  it('says so when the bundle was not built', async () => {
    web = webServerWith();
    const page = await web.app.inject({ url: MAP });
    expect(page.statusCode).toBe(503);
    expect(page.body).toContain('npm run web:build');
  });
});

describe('the history page (plan 8H-5)', () => {
  const HISTORY = `/s/${FAKE_GUILD_ID}/history`;
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it("loads its own script and style and the map's theme, nothing inline, open to anybody", async () => {
    web = webServerWith({ assets: builtAssets() });
    // No session: the page is public as the map is; its data is for members only.
    const page = await web.app.inject({ url: HISTORY });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/^text\/html/);
    expect(page.headers['cache-control']).toBe('no-cache');
    expect(page.body).toContain('<title>Professor Pine: history</title>');
    expect(page.body).toContain('<script src="/assets/history-EFGHIJKL.js" defer></script>');
    expect(page.body).toContain('<link rel="stylesheet" href="/assets/history-MNOPQRST.css">');
    // The theme chosen on the map, set before the page is drawn.
    const head = page.body.slice(0, page.body.indexOf('</head>'));
    expect(head.indexOf('<script src="/assets/theme-STUVWXYZ.js"></script>')).toBeGreaterThan(0);
    expect(page.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    expect(page.body).not.toMatch(/<style|\sstyle=|\son\w+=/i);
    expect(bodyData(page.body)).toEqual({ 'data-guild': FAKE_GUILD_ID, 'data-login': 'discord' });
    // Back to the map from the header; the heatmap's History by the map.
    expect(page.body).toContain(
      `<a id="map-link" class="map-link" href="/s/${FAKE_GUILD_ID}/map">Map</a>`,
    );
    expect(page.body).toContain(`<a href="/s/${FAKE_GUILD_ID}/map">Open the map</a>`);
    // The heatmap's months are the server's, which may not reach back to 2018 (P6).
    expect(page.body).not.toMatch(/since 20\d\d/u);
    // The region tally's places, which the script fills.
    for (const id of [
      'tally-title',
      'tally-periods',
      'tally-status',
      'tally-table',
      'tally-quiet',
    ]) {
      expect(page.body, id).toContain(`id="${id}"`);
    }
  });

  it('holds the boards’ places and leads to "Your history" (plan 8H-6)', async () => {
    web = webServerWith({ assets: builtAssets() });
    const page = await web.app.inject({ url: HISTORY });
    for (const id of ['boards-title', 'boards-periods', 'boards-status', 'boards-list']) {
      expect(page.body, id).toContain(`id="${id}"`);
    }
    expect(page.body).toContain(`<a href="/s/${FAKE_GUILD_ID}/me">Your history</a>`);
  });

  it('holds raids by day, the big days of every year and a boss’s trend above the tally (plan 8H-8)', async () => {
    web = webServerWith({ assets: builtAssets() });
    const page = await web.app.inject({ url: HISTORY });
    for (const id of [
      'days-title',
      'days-year',
      'days-status',
      'days-chart',
      'days-table',
      'days-big-title',
      'days-big',
      'days-big-note',
      'every-status',
      'every-list',
      'boss-input',
      'boss-names',
      'boss-status',
      'boss-chart',
      'boss-table',
    ]) {
      expect(page.body, id).toContain(`id="${id}"`);
    }
    // The charts are for the eye; their numbers are in the tables under them (G14).
    expect(page.body).toContain('<svg id="days-chart" aria-hidden="true" focusable="false">');
    expect(page.body).toContain('<svg id="boss-chart" aria-hidden="true" focusable="false">');
    // Days, then the big days of every year, then a boss, then the tally and the boards.
    const at = (id: string) => page.body.indexOf(`<section id="${id}"`);
    expect(at('days')).toBeGreaterThan(0);
    expect(at('days')).toBeLessThan(at('every'));
    expect(at('every')).toBeLessThan(at('boss'));
    expect(at('boss')).toBeLessThan(at('tally'));
    expect(at('tally')).toBeLessThan(at('boards'));
    // What "Big days of every year" holds (B4), with the page's one apostrophe (B16).
    expect(page.body).toContain(
      '<p>The days of each year that stood out most from the weeks around them, up to three a year.</p>',
    );
    expect(page.body).not.toContain('’');
  });

  it('offers no login with Discord without the client secret', async () => {
    web = webServerWith({ assets: builtAssets(), oauth: undefined });
    const page = await web.app.inject({ url: HISTORY });
    expect(bodyData(page.body)['data-login']).toBe('links');
  });

  it('is not found for a server the bot is not in, and says so when the bundle was not built', async () => {
    web = webServerWith({ assets: builtAssets() });
    expect((await web.app.inject({ url: '/s/412345678901234999/history' })).statusCode).toBe(404);
    await web.app.close();
    web = webServerWith();
    const page = await web.app.inject({ url: HISTORY });
    expect(page.statusCode).toBe(503);
    expect(page.body).toContain('npm run web:build');
  });
});

describe('the "Your history" page (plan 8H-6)', () => {
  const ME = `/s/${FAKE_GUILD_ID}/me`;
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('is the history page’s bundle told to draw the member’s own numbers, nothing inline', async () => {
    web = webServerWith({ assets: builtAssets() });
    const page = await web.app.inject({ url: ME });
    expect(page.statusCode).toBe(200);
    expect(page.headers['cache-control']).toBe('no-cache');
    expect(page.body).toContain('<title>Professor Pine: your history</title>');
    expect(page.body).toContain('<h1 id="me-title">Your history</h1>');
    expect(page.body).toContain('<script src="/assets/history-EFGHIJKL.js" defer></script>');
    expect(page.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    expect(page.body).not.toMatch(/<style|\sstyle=|\son\w+=/i);
    expect(bodyData(page.body)).toEqual({
      'data-guild': FAKE_GUILD_ID,
      'data-login': 'discord',
      'data-page': 'me',
    });
    for (const id of [
      'me-title',
      'me-year-line',
      'me-year',
      'me-status',
      'me-list',
      'me-chart',
      'me-table',
    ]) {
      expect(page.body, id).toContain(`id="${id}"`);
    }
    expect(page.body).toContain(`<a href="/s/${FAKE_GUILD_ID}/history">History</a>`);
    // The chart is for the eye; a screen reader reads the table (B1).
    expect(page.body).toContain('<svg id="me-chart" aria-hidden="true" focusable="false">');
    expect(page.body).not.toContain('role="img"');
    // The table is named by the chart's heading (R-B2).
    expect(page.body).toContain(
      '<table id="me-table" class="visually-hidden" aria-labelledby="me-chart-title">',
    );
  });

  it('is not found for a server the bot is not in, and says so when the bundle was not built', async () => {
    web = webServerWith({ assets: builtAssets() });
    expect((await web.app.inject({ url: '/s/412345678901234999/me' })).statusCode).toBe(404);
    await web.app.close();
    web = webServerWith();
    expect((await web.app.inject({ url: ME })).statusCode).toBe(503);
  });
});

describe("every page's look (plan 8M-7)", () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  /** Says that a page follows the device's light or dark, through a stylesheet with theme.css. */
  const followsTheScheme = (html: string, style: string, url: string): void => {
    expect(html, url).toContain('<meta name="color-scheme" content="light dark">');
    expect(html, url).toContain(`<link rel="stylesheet" href="/assets/${style}">`);
  };

  it('follows the device on the map, the editor, the short pages and the login pages, the top page the choice', async () => {
    web = webServerWith({ assets: builtAssets() });
    followsTheScheme((await web.app.inject({ url: MAP })).body, 'map-IJKLMNOP.css', MAP);
    // The region editor is on the map since plan 8M-10; its address's refusals are short pages.
    for (const url of [
      '/',
      `/s/${FAKE_GUILD_ID}/regions/edit`,
      `/auth/link/${FAKE_GUILD_ID}/${web.loginLinks.issue(FAKE_GUILD_ID, '700000000000000001', 'Ash', web.clock.now)}`,
      '/s/412345678901234999/map',
    ]) {
      const body = (await web.app.inject({ url })).body;
      followsTheScheme(body, 'page.css', url);
      // The server's own pages keep the device's scheme (plan 8M-13, S10); the top page, the map's
      // front door, keeps the choice made on the map (plan 8M-14).
      if (url === '/')
        expect(body, url).toContain('<script src="/assets/theme-STUVWXYZ.js"></script>');
      else expect(body, url).not.toContain('theme-STUVWXYZ.js');
    }
  });
});

describe('the files of the bundle', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('are kept for good when their name carries a hash, and asked again otherwise', async () => {
    web = webServerWith({ assets: builtAssets() });
    const script = await web.app.inject({ url: '/assets/map-ABCDEFGH.js' });
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toMatch(/javascript/);
    expect(script.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(script.headers['x-content-type-options']).toBe('nosniff');
    // The map's head script (plan 8M-13, S10), as the page names it.
    const theme = await web.app.inject({ url: '/assets/theme-STUVWXYZ.js' });
    expect(theme.statusCode).toBe(200);
    expect(theme.headers['content-type']).toMatch(/javascript/);
    const plain = await web.app.inject({ url: '/assets/notes.txt' });
    expect(plain.statusCode).toBe(200);
    expect(plain.headers['cache-control']).toBe('no-cache');
  });

  it('are never listed, and nothing outside them is served', async () => {
    web = webServerWith({ assets: builtAssets() });
    for (const url of [
      '/assets/',
      '/assets',
      '/assets/../assets.json',
      '/assets/%2e%2e/assets.json',
      '/assets/missing.js',
    ]) {
      const answer = await web.app.inject({ url });
      expect(answer.statusCode, url).toBe(404);
    }
  });
});
