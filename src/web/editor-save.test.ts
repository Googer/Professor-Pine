import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { SOUTH_CHANNEL, squareRing } from '../../test/support/region-admin.js';
import { Tally } from '../../test/support/tally.js';
import {
  FakeRegionStaff,
  regionEditingWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { regionVersion } from '../domain/regions/version.js';
import type { Point, SaveAnswer, SaveRequest } from '../domain/web/editor-data.js';
import type { AdminLock } from '../services/admin-lock.js';
import { inThisThread, type SaveChecker } from './save-check.js';

const PREVIEW = `/s/${FAKE_GUILD_ID}/api/regions/preview`;
const SAVE = `/s/${FAKE_GUILD_ID}/api/regions/save`;
const STAFF = '700000000000000001';

const points = (ring: LatLon[]): Point[] => ring.map(({ lat, lon }) => [lat, lon]);
const WEST = squareRing(40.0, -80.1, 40.1, -80.0);
const EAST = squareRing(40.0, -80.0, 40.1, -79.9);
/** West without its eastern strip: the Bridge (gym 4, -80.01) falls out of it. */
const WEST_SHRUNK = squareRing(40.0, -80.1, 40.1, -80.02);

const request = (more: Partial<SaveRequest>): SaveRequest => ({
  changes: [],
  additions: [],
  removals: [],
  ...more,
});

describe('preview and save of the region editor', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  async function made(staff = new FakeRegionStaff().asStaff(STAFF), checker?: SaveChecker) {
    const editing = await regionEditingWith();
    const server = webServerWith({
      staff,
      editing: checker ? { ...editing.editing, checker } : editing.editing,
    });
    web = server;
    const headers = await server.posting(STAFF, 'Brock');
    const post = async (url: string, body: SaveRequest | string) => {
      const answer = await server.app.inject({
        method: 'POST',
        url,
        headers: { ...headers, 'content-type': 'application/json' },
        payload: typeof body === 'string' ? body : JSON.stringify(body),
      });
      return { status: answer.statusCode, json: answer.json<SaveAnswer & { error?: string }>() };
    };
    return { web: server, editing, post, headers };
  }

  it("previews a new outline in /region import's words, and changes nothing", async () => {
    const { post, editing } = await made();
    const answer = await post(
      PREVIEW,
      request({
        changes: [
          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
        ],
      }),
    );
    expect(answer.status).toBe(200);
    expect(answer.json).toEqual({
      kind: 'preview',
      changes: true,
      worded: {
        lines: [
          'Saving would give 1 new outline. Nothing is changed yet.',
          '1 gym would then lie in no region of this server any more: no raid can be reported ' +
            'there.',
        ],
        lists: [
          {
            title: 'Would be imported',
            items: [
              'west → #west · new outline · 7 gyms (8 before) · 1 gym would lie in no region ' +
                'of this server any more',
            ],
          },
        ],
      },
    });
    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST);
  });

  it('saves it, and says so region by region; the log has numbers, never names', async () => {
    const { post, editing } = await made();
    const answer = await post(
      SAVE,
      request({
        changes: [
          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
        ],
      }),
    );
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({
      kind: 'saved',
      worded: {
        lines: ['Imported 1 region.'],
        lists: [{ title: 'Imported', items: ['#west · new outline · 7 gyms'] }],
      },
    });
    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST_SHRUNK);
    const logged = editing.entries.find(
      (entry) => entry.msg === 'regions were saved in the web editor',
    );
    expect(logged).toMatchObject({ staff: STAFF, guild: 1, changes: 1, imported: 1 });
    expect(JSON.stringify(logged)).not.toContain('west');
  });

  it('makes a new region of a channel, and of a new channel in the category it names', async () => {
    const { post, editing } = await made();
    const answer = await post(
      SAVE,
      request({
        additions: [
          {
            channel: { id: SOUTH_CHANNEL },
            description: null,
            outline: points(squareRing(39.9, -80.1, 40.0, -80.0)),
          },
          {
            channel: { name: 'North Hills' },
            description: 'Suburbs',
            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
          },
        ],
      }),
    );
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({
      kind: 'saved',
      worded: {
        lines: [
          'Imported 2 regions, and created 1 channel for them.',
          'Created 1 category: Suburbs.',
        ],
      },
    });
    expect(editing.regions.rows.map((region) => region.channelId)).toContain(SOUTH_CHANNEL);
    expect(editing.regions.rows).toHaveLength(5);
  });

  it('refuses an over-long channel name or category naming the region, not as a bad request', async () => {
    const { post } = await made();
    const outline = points(squareRing(40.1, -80.1, 40.2, -80.0));
    const answer = await post(
      PREVIEW,
      request({
        additions: [
          { channel: { name: `North ${'h'.repeat(100)}` }, description: null, outline },
          { channel: { name: 'Dales' }, description: 'c'.repeat(201), outline },
        ],
      }),
    );
    expect(answer.status).toBe(422);
    expect(answer.json).toEqual({
      kind: 'refused',
      lines: [
        `The name of the new region North ${'h'.repeat(33)}… has 106 characters: a channel name ` +
          'has 100 at most.',
        'The category of the new region Dales has 201 characters: I take 200 at most.',
      ],
    });
  });

  it("says names as they are, without Discord's markdown escapes", async () => {
    const { post } = await made();
    const answer = await post(
      PREVIEW,
      request({
        additions: [
          {
            channel: { name: 'north_hills' },
            description: null,
            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
          },
        ],
      }),
    );
    expect(answer.status).toBe(200);
    const text = JSON.stringify(answer.json);
    expect(text).toContain('north_hills');
    expect(text).not.toContain('\\\\');
  });

  it('says a name with a backslash or a leading number as it was typed', async () => {
    const { post } = await made();
    const answer = await post(
      PREVIEW,
      request({
        additions: [
          {
            channel: { name: 'North\\Hills' },
            description: null,
            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
          },
          {
            channel: { name: '1. Uptown' },
            description: null,
            outline: points(squareRing(40.2, -80.1, 40.3, -80.0)),
          },
        ],
      }),
    );
    expect(answer.status).toBe(200);
    const items = answer.json.kind === 'preview' ? answer.json.worded.lists[0]?.items : [];
    expect(items?.map((item) => item.split(' → ')[0])).toEqual(
      expect.arrayContaining(['North\\Hills', '1. Uptown']),
    );
  });

  it('says a name with a backtick as typed, next to the channel it makes', async () => {
    const { post } = await made();
    const answer = await post(
      PREVIEW,
      request({
        additions: [
          {
            channel: { name: 'North`Hills' },
            description: null,
            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
          },
        ],
      }),
    );
    expect(answer.status).toBe(200);
    const items = answer.json.kind === 'preview' ? answer.json.worded.lists[0]?.items : [];
    expect(items?.[0]).toMatch(/^North`Hills → new channel #northhills /u);
  });

  it('keeps a typed channel mention as typed text', async () => {
    const { post } = await made();
    const typed = `<#${SOUTH_CHANNEL}>`;
    const answer = await post(
      PREVIEW,
      request({
        additions: [
          {
            channel: { name: `Near ${typed}` },
            description: null,
            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
          },
        ],
      }),
    );
    expect(answer.status).toBe(200);
    const text = JSON.stringify(answer.json);
    expect(text).toContain(`Near ${typed}`);
    expect(text).not.toContain('#south');
  });

  it('words a new channel for the panel it was typed in, not for a file', async () => {
    const { post } = await made();
    const answer = await post(
      PREVIEW,
      request({
        additions: [
          {
            channel: { name: 'Sooth' },
            description: null,
            outline: points(squareRing(39.9, -80.1, 40.0, -80.0)),
          },
        ],
      }),
    );
    expect(answer.status).toBe(200);
    const lines = answer.json.kind === 'preview' ? answer.json.worded.lines : [];
    expect(lines).toContain('1 new channel has a name close to another: is it a typo?');
    expect(lines).toContain(
      'I would create 1 channel: #sooth. Check the names: a typo in a name makes a channel of ' +
        'that name.',
    );
    expect(JSON.stringify(lines)).not.toContain('file');
  });

  it('removes a region, keeping or deleting its forum, with what goes with it', async () => {
    const { post, editing } = await made();
    const removal = request({
      removals: [{ regionId: 2, forum: 'keep', version: regionVersion(EAST, null) }],
    });
    const preview = await post(PREVIEW, removal);
    expect(preview.json).toMatchObject({
      kind: 'preview',
      changes: true,
      worded: {
        lines: ['Saving would remove 1 region. Nothing is changed yet.'],
        lists: [
          {
            title: 'Would be removed',
            items: [
              '#east · 3 gyms will lie in no region of this server: no raid can be reported ' +
                'there until a region covers them · its forum #east-raids stays as history',
            ],
          },
        ],
      },
    });
    const saved = await post(SAVE, removal);
    expect(saved.json).toMatchObject({
      kind: 'saved',
      worded: {
        lists: [
          { title: 'Removals', items: [expect.stringMatching(/^Removed the region #east\./u)] },
        ],
      },
    });
    expect(editing.regions.rows.map((region) => region.id)).toEqual([1, 3]);
  });

  it('refuses a region changed since the page loaded it, showing it as it is now', async () => {
    const { post, editing } = await made();
    const answer = await post(
      SAVE,
      request({
        changes: [{ regionId: 1, outline: points(WEST_SHRUNK), version: 'AAAAAAAAAAAAAAAA' }],
        removals: [{ regionId: 9, forum: 'keep', version: 'AAAAAAAAAAAAAAAA' }],
      }),
    );
    expect(answer.status).toBe(409);
    expect(answer.json).toEqual({
      kind: 'conflicts',
      conflicts: [
        {
          regionId: 1,
          theirs: expect.objectContaining({
            id: 1,
            name: 'west',
            outline: points(WEST),
            version: regionVersion(WEST, null),
          }) as unknown,
        },
        { regionId: 9, theirs: null },
      ],
    });
    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST);
  });

  it('refuses a new overlap or gap, and an outline that crosses itself', async () => {
    const { post } = await made();
    const overlapping = squareRing(40.0, -80.1, 40.1, -79.99);
    const overlap = await post(
      PREVIEW,
      request({
        changes: [
          { regionId: 1, outline: points(overlapping), version: regionVersion(WEST, null) },
        ],
      }),
    );
    expect(overlap.status).toBe(422);
    expect(overlap.json).toEqual({
      kind: 'refused',
      lines: [
        expect.stringMatching(
          /^Saving would make a new overlap of [\d,]+ m² between #west and #east\.$/u,
        ) as unknown,
      ],
    });
    const crossing: Point[] = [
      [40, -80.1],
      [40.1, -80],
      [40.1, -80.1],
      [40, -80],
      [40, -80.1],
    ];
    const crossed = await post(
      PREVIEW,
      request({
        changes: [{ regionId: 1, outline: crossing, version: regionVersion(WEST, null) }],
      }),
    );
    expect(crossed.json).toEqual({
      kind: 'refused',
      lines: ['The outline of #west crosses or touches itself.'],
    });
  });

  it('checks what the import will write: a removal whose replacement is left out is a removal', async () => {
    // Without Manage Channels the new channel is left out of the import: East is then removed
    // alone, and West with the C around East's place enclose a gap where it was.
    const { post } = await made(new FakeRegionStaff().asStaff(STAFF, false));
    // Over, east of and under West and East, open to the west, where West closes it.
    const around: Point[] = [
      [40.1, -80.1],
      [40.2, -80.1],
      [40.2, -79.8],
      [39.9, -79.8],
      [39.9, -80.1],
      [40.0, -80.1],
      [40.0, -79.9],
      [40.1, -79.9],
      [40.1, -80.1],
    ];
    const answer = await post(
      PREVIEW,
      request({
        additions: [
          { channel: { id: SOUTH_CHANNEL }, description: null, outline: around },
          { channel: { name: 'East Side' }, description: null, outline: points(EAST) },
        ],
        removals: [{ regionId: 2, forum: 'keep', version: regionVersion(EAST, null) }],
      }),
    );
    expect(answer.status).toBe(422);
    expect(answer.json).toEqual({
      kind: 'refused',
      lines: [
        expect.stringMatching(
          /^Saving would make a new gap of [\d,]+ m² between regions, around /u,
        ) as unknown,
      ],
    });
  });

  it('refuses to delete a forum for a staff member who may not manage channels', async () => {
    const { post } = await made(new FakeRegionStaff().asStaff(STAFF, false));
    const answer = await post(
      PREVIEW,
      request({ removals: [{ regionId: 2, forum: 'delete', version: regionVersion(EAST, null) }] }),
    );
    expect(answer.json).toEqual({
      kind: 'refused',
      lines: [
        'Deleting the forum of a region takes the Manage Channels permission, which you lack.',
      ],
    });
  });

  it("is for staff, from Pine's own page, with a body it can read", async () => {
    const OTHER = '700000000000000002';
    const staff = new FakeRegionStaff().asStaff(STAFF).answer(OTHER, { kind: 'not-staff' });
    const { web, post, headers } = await made(staff);
    const other = await web.posting(OTHER, 'Misty');
    const body = JSON.stringify(request({}));
    const refused = await web.app.inject({
      method: 'POST',
      url: SAVE,
      headers: { ...other, 'content-type': 'application/json' },
      payload: body,
    });
    expect(refused.statusCode).toBe(403);
    const noToken = await web.app.inject({
      method: 'POST',
      url: SAVE,
      headers: {
        cookie: headers.cookie ?? '',
        origin: headers.origin ?? '',
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(noToken.statusCode).toBe(403);
    expect((await post(SAVE, '{"changes":[],"additions":[]}')).status).toBe(400);
    expect((await post(SAVE, request({}))).json).toEqual({
      kind: 'refused',
      lines: ['There is nothing to save.'],
    });
    const huge = JSON.stringify({ ...request({}), padding: 'x'.repeat(2 * 1024 * 1024) });
    expect((await post(SAVE, huge)).status).toBe(413);
    // A large outline fits: 4,000 corners on a circle inside west.
    const circle = Array.from({ length: 4_000 }, (_unused, i): Point => [
      Number((40.05 + 0.04 * Math.sin((2 * Math.PI * i) / 4_000)).toFixed(6)),
      Number((-80.05 + 0.04 * Math.cos((2 * Math.PI * i) / 4_000)).toFixed(6)),
    ]);
    const big = await post(
      PREVIEW,
      request({
        changes: [
          { regionId: 1, outline: [...circle, circle[0]!], version: regionVersion(WEST, null) },
        ],
      }),
    );
    expect(big.status).toBe(200);
  });

  it('saves nothing while Discord cannot say who is asking', async () => {
    const staff = new FakeRegionStaff();
    staff.failing = new Error('Discord is away');
    const { post, editing } = await made(staff);
    const removal = request({
      removals: [{ regionId: 2, forum: 'keep', version: regionVersion(EAST, null) }],
    });
    // Never confirmed as staff: nothing is promised for later.
    const unconfirmed = await post(SAVE, removal);
    expect(unconfirmed.status).toBe(503);
    expect(unconfirmed.json).toEqual({
      error: 'Discord cannot be reached just now, so I cannot tell whether you are staff.',
    });
    expect(editing.regions.rows).toHaveLength(3);
  });

  it('tells staff seen lately that nothing can be saved while Discord is away', async () => {
    const staff = new FakeRegionStaff().asStaff(STAFF);
    const { post, editing } = await made(staff);
    const removal = request({
      removals: [{ regionId: 2, forum: 'keep', version: regionVersion(EAST, null) }],
    });
    expect((await post(PREVIEW, removal)).status).toBe(200);
    staff.failing = new Error('Discord is away');
    const answer = await post(SAVE, removal);
    expect(answer.status).toBe(503);
    expect(answer.json).toEqual({
      error: 'Discord cannot be reached just now, so nothing can be saved. Try again in a moment.',
    });
    expect(editing.regions.rows).toHaveLength(3);
  });

  it('counts previews and saves against a throttle of their own, six a minute per member', async () => {
    const { post, web } = await made();
    for (let i = 0; i < 6; i += 1) {
      expect((await post(i % 2 === 0 ? PREVIEW : SAVE, request({}))).status).toBe(422);
    }
    expect((await post(PREVIEW, request({}))).status).toBe(429);
    web.clock.now += 60_000;
    expect((await post(PREVIEW, request({}))).status).toBe(422);
  });

  it('refuses a new channel named as a channel the server has, region or not', async () => {
    const { post, editing } = await made();
    const outline = points(squareRing(39.9, -80.1, 40.0, -80.0));
    const answer = await post(
      SAVE,
      request({
        additions: [
          { channel: { name: 'South' }, description: null, outline },
          { channel: { name: '#West' }, description: null, outline },
        ],
      }),
    );
    expect(answer.json).toEqual({
      kind: 'refused',
      lines: [
        '#south exists: pick it from the list for the new region South.',
        '#west exists already: pick another name for the new region #West.',
      ],
    });
    expect(editing.regions.rows).toHaveLength(3);
  });

  it('saves one of two saves of the same version started together; the other is a conflict', async () => {
    const { post, editing } = await made();
    let release: () => void = () => undefined;
    const held = editing.lock.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const reached = lockReached(editing.lock, 2);
    const version = regionVersion(WEST, null);
    const first = post(
      SAVE,
      request({ changes: [{ regionId: 1, outline: points(WEST_SHRUNK), version }] }),
    );
    const second = post(
      SAVE,
      request({
        changes: [{ regionId: 1, outline: points(squareRing(40.0, -80.1, 40.1, -80.03)), version }],
      }),
    );
    await reached;
    release();
    await held;
    const answers = await Promise.all([first, second]);
    expect(answers.map((answer) => answer.status)).toEqual([200, 409]);
    expect(answers[1]?.json).toMatchObject({
      kind: 'conflicts',
      conflicts: [{ regionId: 1, theirs: { outline: points(WEST_SHRUNK) } }],
    });
    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST_SHRUNK);
  });

  it('saves one of two saves adding the same channel started together; the other is refused', async () => {
    const { post, editing } = await made();
    let release: () => void = () => undefined;
    const held = editing.lock.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const reached = lockReached(editing.lock, 2);
    const firstOutline = squareRing(39.9, -80.1, 40.0, -80.0);
    const adding = (outline: LatLon[]) =>
      request({
        additions: [
          { channel: { id: SOUTH_CHANNEL }, description: null, outline: points(outline) },
        ],
      });
    const first = post(SAVE, adding(firstOutline));
    const second = post(SAVE, adding(squareRing(39.9, -80.0, 40.0, -79.9)));
    await reached;
    release();
    await held;
    const answers = await Promise.all([first, second]);
    expect(answers.map((answer) => answer.status)).toEqual([200, 409]);
    expect(answers[1]?.json).toEqual({
      kind: 'stale',
      line: 'The regions changed meanwhile: preview again.',
    });
    expect(
      editing.regions.rows.find((region) => region.channelId === SOUTH_CHANNEL)?.bounds,
    ).toEqual(firstOutline);
  });

  it('refuses the second of two saves that grow neighbours into each other', async () => {
    const { post, editing } = await made();
    let release: () => void = () => undefined;
    const held = editing.lock.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const reached = lockReached(editing.lock, 2);
    // West grows north; East grows north and over the top of West. Each alone overlaps nothing.
    const westGrown = squareRing(40.0, -80.1, 40.15, -80.0);
    const eastGrown: LatLon[] = [
      { lat: 40.0, lon: -80.0 },
      { lat: 40.1, lon: -80.0 },
      { lat: 40.1, lon: -80.1 },
      { lat: 40.15, lon: -80.1 },
      { lat: 40.15, lon: -79.9 },
      { lat: 40.0, lon: -79.9 },
      { lat: 40.0, lon: -80.0 },
    ];
    const first = post(
      SAVE,
      request({
        changes: [{ regionId: 1, outline: points(westGrown), version: regionVersion(WEST, null) }],
      }),
    );
    const second = post(
      SAVE,
      request({
        changes: [{ regionId: 2, outline: points(eastGrown), version: regionVersion(EAST, null) }],
      }),
    );
    await reached;
    release();
    await held;
    const answers = await Promise.all([first, second]);
    expect(answers.map((answer) => answer.status)).toEqual([200, 409]);
    expect(answers[1]?.json).toMatchObject({ kind: 'stale' });
    expect(editing.regions.rows.find((region) => region.id === 2)?.bounds).toEqual(EAST);
  });

  it("saves on when only another server's regions changed while the save waited", async () => {
    const { post, editing } = await made();
    let release: () => void = () => undefined;
    const held = editing.lock.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const reached = lockReached(editing.lock, 1);
    const saving = post(
      SAVE,
      request({
        changes: [
          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
        ],
      }),
    );
    await reached;
    // Another server's region, as its own editor or import adds it meanwhile.
    const west = editing.regions.rows.find((region) => region.id === 1)!;
    editing.regions.rows = [
      ...editing.regions.rows,
      { ...west, id: 9, guildId: 2, channelId: '800000000000000009', forumChannelId: null },
    ];
    release();
    await held;
    const answer = await saving;
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({ kind: 'saved' });
    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST_SHRUNK);
  });

  it("refuses a save when the server's channels changed while it waited", async () => {
    const { post, editing } = await made();
    let release: () => void = () => undefined;
    const held = editing.lock.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const reached = lockReached(editing.lock, 1);
    const saving = post(
      SAVE,
      request({
        additions: [
          {
            channel: { name: 'North Hills' },
            description: null,
            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
          },
        ],
      }),
    );
    await reached;
    // Somebody made a channel of that name on Discord meanwhile.
    editing.gateway.addChannel('800000000000000010', 'north-hills');
    release();
    await held;
    const answer = await saving;
    expect(answer.status).toBe(409);
    expect(answer.json).toEqual({
      kind: 'stale',
      line: 'The regions changed meanwhile: preview again.',
    });
    expect(editing.regions.rows).toHaveLength(3);
  });

  it('refuses a save when the category its new channel names was made while it waited', async () => {
    const { post, editing } = await made();
    let release: () => void = () => undefined;
    const held = editing.lock.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const reached = lockReached(editing.lock, 1);
    const saving = post(
      SAVE,
      request({
        additions: [
          {
            channel: { name: 'North Hills' },
            description: 'Suburbs',
            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
          },
        ],
      }),
    );
    await reached;
    // The import would now put the channel in that category rather than make one.
    editing.gateway.addChannel('800000000000000011', 'SUBURBS', { kind: 'category' });
    release();
    await held;
    const answer = await saving;
    expect(answer.status).toBe(409);
    expect(answer.json).toMatchObject({ kind: 'stale' });
    expect(editing.regions.rows).toHaveLength(3);
  });

  /** Gives the fake server the category Suburbs, full: 50 channels. */
  function fillSuburbs(editing: Awaited<ReturnType<typeof made>>['editing']): void {
    editing.gateway.addChannel('800000000000000020', 'Suburbs', { kind: 'category' });
    for (let i = 0; i < 50; i++) {
      editing.gateway.addChannel(`8000000000000001${String(i).padStart(2, '0')}`, `s-${i}`, {
        categoryId: '800000000000000020',
      });
    }
  }
  const northHills = request({
    additions: [
      {
        channel: { name: 'North Hills' },
        description: 'Suburbs',
        outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
      },
    ],
  });

  it('previews a new channel of a full category in the next one, and says why', async () => {
    const { post, editing } = await made();
    fillSuburbs(editing);
    const answer = await post(PREVIEW, northHills);
    expect(answer.json).toMatchObject({
      kind: 'preview',
      worded: {
        lines: [
          'Saving would give 1 new region. Nothing is changed yet.',
          'I would create 1 channel: #north-hills. Check the names: a typo in a name makes a ' +
            'channel of that name.',
          'I would create 1 category: Suburbs 2.',
          'I would create 1 forum, one for each region that has none.',
          'The category Suburbs is full (Discord allows 50 channels in a category, and forums ' +
            'count), so 1 new channel goes into Suburbs 2, a new category with the permissions of ' +
            'Suburbs, right after it.',
        ],
      },
    });
    const saved = await post(SAVE, northHills);
    expect(saved.json).toMatchObject({
      kind: 'saved',
      worded: { lines: expect.arrayContaining(['Created 1 category: Suburbs 2.']) as string[] },
    });
  });

  it('refuses a save when the overflow category it would make was made while it waited', async () => {
    const { post, editing } = await made();
    fillSuburbs(editing);
    let release: () => void = () => undefined;
    const held = editing.lock.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const reached = lockReached(editing.lock, 1);
    const saving = post(SAVE, northHills);
    await reached;
    editing.gateway.addChannel('800000000000000021', 'suburbs 2', { kind: 'category' });
    release();
    await held;
    const answer = await saving;
    expect(answer.status).toBe(409);
    expect(answer.json).toMatchObject({ kind: 'stale' });
    expect(editing.regions.rows).toHaveLength(3);
  });

  it('refuses a save when the category its new channel goes into filled while it waited', async () => {
    const { post, editing } = await made();
    editing.gateway.addChannel('800000000000000020', 'Suburbs', { kind: 'category' });
    for (let i = 0; i < 48; i++) {
      editing.gateway.addChannel(`8000000000000001${String(i).padStart(2, '0')}`, `s-${i}`, {
        categoryId: '800000000000000020',
      });
    }
    let release: () => void = () => undefined;
    const held = editing.lock.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const reached = lockReached(editing.lock, 1);
    const saving = post(SAVE, northHills);
    await reached;
    // Another bot's channel in Suburbs: no room for the new channel and its forum any more.
    editing.gateway.addChannel('800000000000000199', 'ticket-0042', {
      categoryId: '800000000000000020',
    });
    release();
    await held;
    const answer = await saving;
    expect(answer.status).toBe(409);
    expect(answer.json).toMatchObject({ kind: 'stale' });
  });

  it('saves on when only channels the save does not use came or went while it waited', async () => {
    const { post, editing } = await made();
    let release: () => void = () => undefined;
    const held = editing.lock.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const reached = lockReached(editing.lock, 1);
    const saving = post(
      SAVE,
      request({
        changes: [
          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
        ],
        additions: [
          {
            channel: { name: 'North Hills' },
            description: 'Suburbs',
            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
          },
        ],
      }),
    );
    await reached;
    // A ticket bot's channel and category, as such bots make and delete them all day.
    editing.gateway.addChannel('800000000000000012', 'Tickets', { kind: 'category' });
    editing.gateway.addChannel('800000000000000013', 'ticket-0042', {
      categoryId: '800000000000000012',
    });
    release();
    await held;
    const answer = await saving;
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({ kind: 'saved' });
    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST_SHRUNK);
    expect(editing.regions.rows).toHaveLength(4);
  });

  it('creates nothing for a region removed while its save waited', async () => {
    const { post, editing } = await made();
    let release: () => void = () => undefined;
    const held = editing.lock.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const reached = lockReached(editing.lock, 1);
    const saving = post(
      SAVE,
      request({
        changes: [
          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
        ],
      }),
    );
    await reached;
    // Removed meanwhile, as /region remove leaves it: its channel is no region any more.
    editing.regions.rows = editing.regions.rows.filter((region) => region.id !== 1);
    release();
    await held;
    const answer = await saving;
    expect(answer.status).toBe(409);
    expect(answer.json).toEqual({ kind: 'conflicts', conflicts: [{ regionId: 1, theirs: null }] });
    expect(editing.regions.rows.map((region) => region.id)).toEqual([2, 3]);
  });

  it('refuses what is too complex to check', async () => {
    const { post } = await made(undefined, {
      check: () => Promise.resolve({ kind: 'too-complex' }),
    });
    const answer = await post(
      PREVIEW,
      request({
        changes: [
          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
        ],
      }),
    );
    expect(answer.status).toBe(422);
    expect(answer.json).toEqual({
      kind: 'refused',
      lines: ['Too complex to check: simplify the outlines.'],
    });
  });

  it('refuses for now what it cannot check, and lets through what polyclip could not cut', async () => {
    const change = request({
      changes: [{ regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) }],
    });
    const cases: [Awaited<ReturnType<SaveChecker['check']>>, number, unknown][] = [
      [
        { kind: 'unavailable', err: new Error('the thread ended (1) without an answer') },
        503,
        { error: 'I cannot check the outlines just now: try again in a minute.' },
      ],
      [{ kind: 'busy' }, 503, { error: 'Busy checking other saves: try again in a minute.' }],
      [{ kind: 'failed', err: new Error('polyclip threw') }, 200, expect.objectContaining({})],
    ];
    for (const [verdict, status, json] of cases) {
      const { post, editing } = await made(undefined, { check: () => Promise.resolve(verdict) });
      const answer = await post(PREVIEW, change);
      expect(answer.status).toBe(status);
      expect(answer.json).toEqual(json);
      expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST);
      await web?.app.close();
    }
  });

  it('starts no save once the web server is closing, also one already being checked', async () => {
    const closing = { now: false };
    const editing = await regionEditingWith();
    const saves = new Tally();
    const save = editing.regionAdmin.save.bind(editing.regionAdmin);
    editing.regionAdmin.save = <Changed>(
      ...args: Parameters<typeof editing.regionAdmin.save<Changed>>
    ) => {
      saves.add();
      return save<Changed>(...args);
    };
    const server = webServerWith({
      staff: new FakeRegionStaff().asStaff(STAFF),
      editing: {
        ...editing.editing,
        // The bot begins to shut down while the save is being checked.
        checker: {
          check: (before, after) => {
            closing.now = true;
            return inThisThread.check(before, after);
          },
        },
      },
      closing: () => closing.now,
    });
    web = server;
    const headers = await server.posting(STAFF, 'Brock');
    const post = (url: string) =>
      server.app.inject({
        method: 'POST',
        url,
        headers: { ...headers, 'content-type': 'application/json' },
        payload: JSON.stringify(
          request({
            changes: [
              { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
            ],
          }),
        ),
      });
    const during = await post(SAVE);
    expect(during.statusCode).toBe(503);
    expect(during.json()).toEqual({ error: 'Pine is shutting down: try again in a few minutes.' });
    // Once it is closing, neither a preview nor a save is looked at.
    for (const url of [PREVIEW, SAVE]) {
      const after = await post(url);
      expect(after.statusCode).toBe(503);
      expect(after.json()).toEqual({
        error: 'Pine is shutting down: try again in a few minutes.',
      });
    }
    expect(saves.count).toBe(0);
    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST);
  });

  it('checks a save that was previewed, unchanged, only once', async () => {
    const checks = new Tally();
    const { post, editing } = await made(undefined, {
      check: (before, after) => {
        checks.add();
        return inThisThread.check(before, after);
      },
    });
    const change = (outline: LatLon[], from = WEST) =>
      request({
        changes: [{ regionId: 1, outline: points(outline), version: regionVersion(from, null) }],
      });
    expect((await post(PREVIEW, change(WEST_SHRUNK))).status).toBe(200);
    expect((await post(SAVE, change(WEST_SHRUNK))).status).toBe(200);
    expect(checks.count).toBe(1);
    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST_SHRUNK);
    // Another body is checked; again, it is not.
    const smaller = squareRing(40.0, -80.1, 40.1, -80.03);
    expect((await post(PREVIEW, change(smaller, WEST_SHRUNK))).status).toBe(200);
    expect((await post(PREVIEW, change(smaller, WEST_SHRUNK))).status).toBe(200);
    expect(checks.count).toBe(2);
  });

  it('checks a previewed save only once though a channel it does not use was made meanwhile', async () => {
    const checks = new Tally();
    const { post, editing } = await made(undefined, {
      check: (before, after) => {
        checks.add();
        return inThisThread.check(before, after);
      },
    });
    const change = request({
      changes: [{ regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) }],
    });
    expect((await post(PREVIEW, change)).status).toBe(200);
    editing.gateway.addChannel('800000000000000013', 'ticket-0042');
    expect((await post(SAVE, change)).status).toBe(200);
    expect(checks.count).toBe(1);
  });

  it('never reads the body of a request it refuses, and limits each address', async () => {
    const { web, headers } = await made();
    let read = false;
    const body = (): Readable =>
      new Readable({
        read() {
          read = true;
          this.push(JSON.stringify(request({})));
          this.push(null);
        },
      });
    const noToken = await web.app.inject({
      method: 'POST',
      url: SAVE,
      headers: { cookie: headers.cookie ?? '', 'content-type': 'application/json' },
      payload: body(),
    });
    expect(noToken.statusCode).toBe(403);
    expect(read).toBe(false);
    for (let i = 0; i < 29; i += 1) {
      await web.app.inject({ method: 'POST', url: PREVIEW, payload: body() });
    }
    const limited = await web.app.inject({ method: 'POST', url: PREVIEW, payload: body() });
    expect(limited.statusCode).toBe(429);
    expect(read).toBe(false);
  });

  it('says which removal failed, and still answers and logs the rest', async () => {
    const { post, editing } = await made();
    const closeRegion = editing.store.closeRegion.bind(editing.store);
    editing.store.closeRegion = (regionId: number) =>
      regionId === 2 ? Promise.reject(new Error('the database is away')) : closeRegion(regionId);
    const answer = await post(
      SAVE,
      request({
        changes: [
          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
        ],
        removals: [{ regionId: 2, forum: 'keep', version: regionVersion(EAST, null) }],
      }),
    );
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({
      kind: 'saved',
      worded: {
        lines: ['Imported 1 region.'],
        lists: [
          { title: 'Imported' },
          {
            title: 'Removals',
            items: ['I could not remove the region #east: look at the regions and try again.'],
          },
        ],
      },
    });
    expect(editing.entries.map((entry) => entry.msg)).toEqual(
      expect.arrayContaining([
        'could not remove a region in the web editor',
        'regions were saved in the web editor',
      ]),
    );
  });

  it("says in the server's audit log that the region editor made and deleted channels", async () => {
    const { post, editing } = await made();
    await post(
      SAVE,
      request({
        additions: [
          {
            channel: { name: 'North Hills' },
            description: 'Suburbs',
            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
          },
        ],
        removals: [{ regionId: 2, forum: 'delete', version: regionVersion(EAST, null) }],
      }),
    );
    const reasons = [...editing.gateway.auditReasons.values()];
    expect(reasons).toHaveLength(3);
    expect(new Set(reasons)).toEqual(new Set([`region editor by ${STAFF}`]));
  });
});

/** Resolves once the lock was asked for `times` more times (by the service, under test). */
function lockReached(lock: AdminLock, times: number): Promise<void> {
  const asked = new Tally();
  const run = lock.run.bind(lock);
  lock.run = <T>(work: () => T | Promise<T>): Promise<T> => {
    asked.add();
    return run(work);
  };
  return asked.reached(times);
}
