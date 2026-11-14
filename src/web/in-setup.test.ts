import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { SOUTH_CHANNEL, SOUTH_RING } from '../../test/support/region-admin.js';
import { TestServers } from '../../test/support/server-values.js';
import {
  builtAssets,
  FakeRegionStaff,
  regionEditingWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import type { Point } from '../domain/web/editor-data.js';

const points = (ring: LatLon[]): Point[] => ring.map(({ lat, lon }) => [lat, lon]);

/** A server set up (the fakes' own) and one in setup (plan 19C-2). */
const SET_UP = FAKE_GUILD_ID;
const NEW = '412345678901234599';
const STAFF = '700000000000000011';
const MEMBER = '700000000000000012';
const MANAGER = '700000000000000013';

function inSetupWeb(): TestWeb {
  const serverSettings = new TestServers();
  serverSettings.settingUp.add(NEW);
  const members = new FakeMemberDirectory();
  for (const guild of [SET_UP, NEW]) {
    members
      .add(STAFF, 'Staff', guild)
      .standing(
        STAFF,
        { roleNames: ['Admin'], roleIds: [], administrator: true, manageGuild: true },
        guild,
      )
      .add(MEMBER, 'Member', guild)
      .standing(MEMBER, { roleNames: [], roleIds: [], administrator: false }, guild)
      // Who may manage the server, without a staff role: its owner, say (S3).
      .add(MANAGER, 'Manager', guild)
      .standing(
        MANAGER,
        { roleNames: [], roleIds: [], administrator: false, manageGuild: true },
        guild,
      );
  }
  const staff = new FakeRegionStaff()
    .answer(
      STAFF,
      {
        kind: 'staff',
        staff: { staffId: STAFF, guildId: 2, server: NEW, mayManageChannels: true },
      },
      NEW,
    )
    .answer(MEMBER, { kind: 'not-staff' }, NEW);
  return webServerWith({
    assets: builtAssets(),
    serverSettings,
    members,
    staff,
    servers: {
      has: (guild) => guild === SET_UP || guild === NEW,
      inSetup: (guild) => serverSettings.inSetup(guild),
      openToVisitors: () => true,
    },
  });
}

describe('the web pages of a server in setup (plan 19C-2)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('answers a visitor and a member as a server Pine is not in', async () => {
    web = inSetupWeb();
    const member = await web.loggedIn(MEMBER, 'Member');
    for (const url of [
      '/map',
      '/history',
      '/api/geo',
      '/api/me',
      '/regions/edit',
      '/api/regions/edit',
    ]) {
      const visitor = await web.app.inject({ url: `/s/${NEW}${url}` });
      expect(visitor.statusCode, url).toBe(404);
      const asked = await web.app.inject({ url: `/s/${NEW}${url}`, headers: { cookie: member } });
      expect(asked.statusCode, url).toBe(404);
      // The server set up answers as ever.
      const there = await web.app.inject({
        url: `/s/${SET_UP}${url}`,
        headers: { cookie: member },
      });
      expect(there.statusCode, url).not.toBe(404);
    }
  });

  it('opens the region editor and the map it draws on to staff, and nothing else', async () => {
    web = inSetupWeb();
    const staff = await web.loggedIn(STAFF, 'Staff');
    const at = (url: string) =>
      web!.app.inject({ url: `/s/${NEW}${url}`, headers: { cookie: staff } });
    expect((await at('/regions/edit')).statusCode).toBe(303);
    expect((await at('/api/regions/edit')).statusCode).toBe(200);
    expect((await at('/map')).statusCode).toBe(200);
    expect((await at('/api/geo')).statusCode).toBe(200);
    const me = await at('/api/me');
    expect(me.statusCode).toBe(200);
    // The page is told the server is in setup (S11): it starts no live layer.
    expect(me.json<{ mayEditRegions: boolean; inSetup?: boolean }>()).toMatchObject({
      mayEditRegions: true,
      inSetup: true,
    });
    // The rest of the map is not there yet.
    for (const url of ['/history', '/api/parties', '/api/live', '/api/stops', '/api/activity']) {
      expect((await at(url)).statusCode, url).toBe(404);
    }
    // The server set up says nothing of it.
    const there = await web.app.inject({
      url: `/s/${SET_UP}/api/me`,
      headers: { cookie: staff },
    });
    expect(there.json<object>()).not.toHaveProperty('inSetup');
  });

  it('opens them to who may manage the server without a staff role too (S3)', async () => {
    web = inSetupWeb();
    const manager = await web.loggedIn(MANAGER, 'Manager');
    const at = (url: string) =>
      web!.app.inject({ url: `/s/${NEW}${url}`, headers: { cookie: manager } });
    expect((await at('/map')).statusCode).toBe(200);
    expect((await at('/api/me')).json<{ mayEditRegions: boolean }>().mayEditRegions).toBe(true);
    expect((await at('/history')).statusCode).toBe(404);
  });
});

describe('the region editor of a server in setup (plan 19C-2, S11)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('previews and saves the outline of its first region', async () => {
    const editing = await regionEditingWith();
    // The fakes' server is the one in setup here: its editor has the region rows.
    const serverSettings = new TestServers();
    serverSettings.settingUp.add(FAKE_GUILD_ID);
    const members = new FakeMemberDirectory()
      .add(STAFF, 'Staff')
      .standing(STAFF, { roleNames: [], roleIds: [], administrator: false, manageGuild: true });
    web = webServerWith({
      staff: new FakeRegionStaff().asStaff(STAFF),
      editing: editing.editing,
      serverSettings,
      members,
      servers: {
        has: () => true,
        inSetup: (guild) => serverSettings.inSetup(guild),
        openToVisitors: () => true,
      },
    });
    const headers = await web.posting(STAFF, 'Staff');
    const post = (route: string) =>
      web!.app.inject({
        method: 'POST',
        url: `/s/${FAKE_GUILD_ID}/api/regions/${route}`,
        headers: { ...headers, 'content-type': 'application/json' },
        payload: JSON.stringify({
          changes: [],
          removals: [],
          additions: [
            { channel: { id: SOUTH_CHANNEL }, description: null, outline: points(SOUTH_RING) },
          ],
        }),
      });
    const preview = await post('preview');
    expect(preview.statusCode).toBe(200);
    expect(preview.json<{ kind: string }>().kind).toBe('preview');
    expect(editing.regions.rows.some((region) => region.channelId === SOUTH_CHANNEL)).toBe(false);
    const saved = await post('save');
    expect(saved.statusCode).toBe(200);
    expect(saved.json<{ kind: string }>().kind).toBe('saved');
    expect(
      editing.regions.rows.find((region) => region.channelId === SOUTH_CHANNEL)?.bounds,
    ).toEqual(SOUTH_RING);
  });
});
