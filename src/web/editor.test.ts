import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { keptRow } from '../../test/support/wayspot-cases.js';
import {
  editorSourcesWith,
  FakeRegionStaff,
  SOUTH_TEXT_CHANNEL,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import type { EditorData } from '../domain/web/editor-data.js';

const DATA = `/s/${FAKE_GUILD_ID}/api/regions/edit`;
const STAFF = '700000000000000001';
const MEMBER = '700000000000000002';

describe("the region editor's data", () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  async function made(staff = new FakeRegionStaff().asStaff(STAFF)) {
    const editor = await editorSourcesWith([
      // A stop in west, and one a kilometre south of it, outside every region.
      keptRow(1, { lat: 40.05, lon: -80.04 }),
      keptRow(2, { lat: 40.0 - 0.009, lon: -80.05, kind: 'powerspot' }),
      // Far away.
      keptRow(3, { lat: 41, lon: -80.05 }),
    ]);
    web = webServerWith({ staff, editor });
    return { web, staff, editor };
  }

  it('is for those logged in', async () => {
    const { web } = await made();
    const answer = await web.app.inject({ url: DATA });
    expect(answer.statusCode).toBe(401);
    expect(answer.json()).toEqual({ error: 'Log in first.' });
  });

  it('is for staff of the server alone, asked of Discord at every request', async () => {
    const { web, staff } = await made();
    const member = await web.loggedIn(MEMBER, 'Misty');
    const refused = await web.app.inject({ url: DATA, headers: { cookie: member } });
    expect(refused.statusCode).toBe(403);
    // The page's words, which the map says as it turns the editor off (plan 8M-10, C2).
    expect(refused.json()).toEqual({ error: 'Only staff of this server may edit its regions.' });
    staff.answer(MEMBER, { kind: 'not-staff' });
    expect((await web.app.inject({ url: DATA, headers: { cookie: member } })).statusCode).toBe(403);
    const cookie = await web.loggedIn(STAFF, 'Brock');
    expect((await web.app.inject({ url: DATA, headers: { cookie } })).statusCode).toBe(200);
    expect((await web.app.inject({ url: DATA, headers: { cookie } })).statusCode).toBe(200);
    expect(staff.asked).toEqual([
      `${FAKE_GUILD_ID}:${MEMBER}`,
      `${FAKE_GUILD_ID}:${MEMBER}`,
      `${FAKE_GUILD_ID}:${STAFF}`,
      `${FAKE_GUILD_ID}:${STAFF}`,
    ]);
  });

  it('gives the regions, gyms, Wayspots near them and the channels a new region may take', async () => {
    const { web } = await made();
    const cookie = await web.loggedIn(STAFF, 'Brock');
    const answer = await web.app.inject({ url: DATA, headers: { cookie } });
    expect(answer.headers['content-type']).toMatch(/^application\/json/);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    const data = answer.json<EditorData>();
    expect(data.guild).toEqual({ id: FAKE_GUILD_ID, name: 'Pinewood' });
    // Whose staged edits the page keeps.
    expect(data.userId).toBe(STAFF);
    expect(data.readOnly).toBe(false);
    expect(data.mayManageChannels).toBe(true);
    expect(data.regions.map((region) => [region.id, region.name, region.category])).toEqual([
      [1, 'west', 'Town'],
      [2, 'east', 'Town'],
      // Its channel is not among the server's: named by its number.
      [3, 'Region 3', null],
    ]);
    expect(data.regions[0]?.version).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(data.gyms.map(([id]) => id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]);
    expect(data.wayspots.map(([kind, , , title]) => [kind, title])).toEqual([
      ['stop', 'Stop 1'],
      ['powerspot', 'Stop 2'],
    ]);
    expect(data.channels).toEqual([{ id: SOUTH_TEXT_CHANNEL, name: 'south' }]);
  });

  it('shows the server’s own stops of Pine’s own, never another server’s, and follows them', async () => {
    const { web, editor } = await made();
    const sponsored = (id: number, serverId: string) => ({
      stop: {
        id,
        serverId,
        name: `Sponsored ${String(id)}`,
        lat: 40.051,
        lon: -80.04,
        address: null,
        createdBy: STAFF,
        createdAt: 1,
        updatedBy: STAFF,
        updatedAt: 1,
      },
      guildRow: serverId === FAKE_GUILD_ID ? 1 : 2,
    });
    const cookie = await web.loggedIn(STAFF, 'Brock');
    const first = await web.app.inject({ url: DATA, headers: { cookie } });
    editor.wayspots.setPineStops([sponsored(1, FAKE_GUILD_ID), sponsored(2, '412345678901234568')]);
    const answer = await web.app.inject({ url: DATA, headers: { cookie } });
    expect(answer.headers.etag).not.toBe(first.headers.etag);
    expect(answer.json<EditorData>().wayspots.map(([, , , title]) => title)).toEqual([
      'Stop 1',
      'Stop 2',
      'Sponsored 1',
    ]);
  });

  it('answers 304 to the ETag it gave, and a new view when a region changed', async () => {
    const { web, editor } = await made();
    const cookie = await web.loggedIn(STAFF, 'Brock');
    const first = await web.app.inject({ url: DATA, headers: { cookie } });
    const etag = String(first.headers.etag);
    const again = await web.app.inject({ url: DATA, headers: { cookie, 'if-none-match': etag } });
    expect(again.statusCode).toBe(304);
    editor.regionRows.rows = editor.regionRows.rows.filter((region) => region.id !== 2);
    await editor.regions.load();
    const changed = await web.app.inject({ url: DATA, headers: { cookie, 'if-none-match': etag } });
    expect(changed.statusCode).toBe(200);
    expect(changed.json<EditorData>().regions.map((region) => region.id)).toEqual([1, 3]);
  });

  it('is read-only, offering no channel, while Discord cannot say who is asking', async () => {
    const { web, staff } = await made();
    const cookie = await web.loggedIn(STAFF, 'Brock');
    expect((await web.app.inject({ url: DATA, headers: { cookie } })).statusCode).toBe(200);
    staff.failing = new Error('Discord is away');
    const answer = await web.app.inject({ url: DATA, headers: { cookie } });
    expect(answer.statusCode).toBe(200);
    const data = answer.json<EditorData>();
    expect(data).toMatchObject({ readOnly: true, mayManageChannels: false, channels: [] });
    expect(data.regions).toHaveLength(3);
    expect(web.entries.some((entry) => entry.msg?.toString().includes('could not ask'))).toBe(true);
  });

  it('gives nothing while Discord cannot say who is asking to whom it never saw as staff', async () => {
    const { web, staff } = await made(new FakeRegionStaff().answer(STAFF, { kind: 'not-staff' }));
    const cookie = await web.loggedIn(STAFF, 'Brock');
    expect((await web.app.inject({ url: DATA, headers: { cookie } })).statusCode).toBe(403);
    staff.failing = new Error('Discord is away');
    const answer = await web.app.inject({ url: DATA, headers: { cookie } });
    expect(answer.statusCode).toBe(503);
    expect(answer.json()).toEqual({
      error: 'Discord cannot be reached just now, so I cannot tell whether you are staff.',
    });
  });

  it('forgets a staff member whom Discord no longer says is staff', async () => {
    const { web, staff } = await made();
    const cookie = await web.loggedIn(STAFF, 'Brock');
    expect((await web.app.inject({ url: DATA, headers: { cookie } })).statusCode).toBe(200);
    staff.answer(STAFF, { kind: 'not-staff' });
    expect((await web.app.inject({ url: DATA, headers: { cookie } })).statusCode).toBe(403);
    staff.failing = new Error('Discord is away');
    expect((await web.app.inject({ url: DATA, headers: { cookie } })).statusCode).toBe(503);
  });

  it('says that a staff member may not create channels when they may not', async () => {
    const { web } = await made(new FakeRegionStaff().asStaff(STAFF, false));
    const cookie = await web.loggedIn(STAFF, 'Brock');
    const data = (await web.app.inject({ url: DATA, headers: { cookie } })).json<EditorData>();
    expect(data.mayManageChannels).toBe(false);
    expect(data.channels).toHaveLength(1);
  });

  it('waits while the server has no row', async () => {
    const staff = new FakeRegionStaff().answer(STAFF, { kind: 'unknown-server' });
    const { web } = await made(staff);
    const cookie = await web.loggedIn(STAFF, 'Brock');
    const answer = await web.app.inject({ url: DATA, headers: { cookie } });
    expect(answer.statusCode).toBe(503);
    expect(answer.json()).toEqual({
      error: 'I do not know this server yet. Try again in a moment.',
    });
  });
});
