import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  OTHER_GUILD_ROW,
  TEST_GUILD_ROW,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ROLE, selfRolesWith } from '../../test/support/roles.js';
import { GeoCache, PUBLIC_REGIONS_KEPT_MS } from './geo-cache.js';
import { geoSourcesWith, webServerWith, type TestWeb } from '../../test/support/web.js';
import { TEST_MAP_ROLE, withMapRole } from '../../test/support/server-values.js';

const GEO = `/s/${FAKE_GUILD_ID}/api/geo`;

interface View {
  regions: Array<{ id: number; name: string }>;
  gyms: Array<{ id: number; name: string }>;
}

describe('the regions a visitor may not see (plan 8Z-2, ruling 8)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  const ASH = '700000000000000001';
  const MISTY = '700000000000000002';
  const BROCK = '700000000000000003';
  interface Shown {
    regions: Array<{ id: number; name: string }>;
    gyms: Array<{ id: number; regionIds: number[] }>;
  }

  /** A server whose East is hidden from everybody but its members: Ash is one, Misty is not. */
  async function hiddenEast() {
    const sources = await geoSourcesWith();
    sources.hidden.add(EAST_FORUM);
    const members = new FakeMemberDirectory().add(ASH, 'Ash');
    const made = webServerWith({ geo: sources, members });
    web = made;
    const ask = async (cookie?: string, headers: Record<string, string> = {}) =>
      made.app.inject({
        url: GEO,
        headers: { ...headers, ...(cookie === undefined ? {} : { cookie }) },
      });
    const ash = await made.loggedIn(ASH, 'Ash');
    const misty = await made.loggedIn(MISTY, 'Misty');
    const all = (await ask(ash)).json<Shown>();
    return { made, sources, members, ask, ash, misty, all };
  }

  it('are left out for a visitor who is not logged in, with the gyms that lie in them alone', async () => {
    const { ask, all } = await hiddenEast();
    const view = (await ask()).json<Shown>();
    expect(view.regions.map((region) => region.name)).toEqual(['west']);
    // Every gym of the member's map that lies in West, and none other: nothing of East.
    const west = all.gyms.filter((gym) => gym.regionIds.includes(1)).map((gym) => gym.id);
    expect(view.gyms.map((gym) => gym.id)).toEqual(west);
    expect(view.gyms.length).toBeLessThan(all.gyms.length);
    expect(JSON.stringify(view)).not.toContain('east');
  });

  it('keep a gym that lies in a public region too, as that region’s alone', async () => {
    const { ask, ash, sources } = await hiddenEast();
    // East reaches over West's edge, to longitude -80.02: the bridge (gym 4, -80.01) is in both.
    sources.regionRows.rows = sources.regionRows.rows.map((region) =>
      region.channelId === EAST_CHANNEL
        ? {
            ...region,
            bounds: [
              { lat: 40.0, lon: -80.02 },
              { lat: 40.1, lon: -80.02 },
              { lat: 40.1, lon: -79.9 },
              { lat: 40.0, lon: -79.9 },
              { lat: 40.0, lon: -80.02 },
            ],
          }
        : region,
    );
    await sources.regions.load();
    await sources.directory.load();
    const regionsOf = async (cookie?: string) =>
      (await ask(cookie)).json<Shown>().gyms.find((gym) => gym.id === 4)?.regionIds;
    expect(await regionsOf(ash)).toEqual([1, 2]);
    expect(await regionsOf()).toEqual([1]);
  });

  it('are left out for somebody logged in who is no member of the server', async () => {
    const { ask, misty } = await hiddenEast();
    const visitor = await ask();
    const stranger = await ask(misty);
    expect(stranger.statusCode).toBe(200);
    expect(stranger.body).toBe(visitor.body);
    expect(stranger.headers.etag).toBe(visitor.headers.etag);
  });

  it('are all there for a member, as before', async () => {
    const { all, ask, ash } = await hiddenEast();
    expect(all.regions.map((region) => region.name)).toEqual(['east', 'west']);
    expect(all.gyms).toHaveLength(11);
    const answer = await ask(ash);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    expect(answer.headers.vary).toBe('Cookie');
  });

  it('are left out for somebody of whom Discord cannot say whether they are a member', async () => {
    const { made, ask, members } = await hiddenEast();
    const visitor = (await ask()).body;
    members.add(BROCK, 'Brock');
    members.failing = new Error('Discord is away');
    // Discord never said of Brock in this process: nothing to go by, so the visitor's view.
    const brock = await made.loggedIn(BROCK, 'Brock');
    const answer = await ask(brock);
    expect(answer.statusCode).toBe(200);
    expect(answer.body).toBe(visitor);
    // The map starts with that; the page asks again once a list says Discord answers (8Z-2
    // final fix F2, `geoAgain`), and the same session then gets every region.
    members.failing = undefined;
    const again = await ask(brock, { 'if-none-match': String(answer.headers.etag) });
    expect(again.statusCode).toBe(200);
    expect(again.json<Shown>().regions.map((region) => region.name)).toEqual(['east', 'west']);
  });

  it('are left out for a member without the role the map asks for', async () => {
    const sources = await geoSourcesWith();
    sources.hidden.add(EAST_FORUM);
    const members = new FakeMemberDirectory()
      .add(ASH, 'Ash')
      .add(BROCK, 'Brock')
      .standing(BROCK, { roleNames: ['Verified'], roleIds: [TEST_MAP_ROLE], administrator: false });
    web = webServerWith({ geo: sources, members, serverSettings: withMapRole() });
    const names = async (userId: string) => {
      const cookie = (await web?.loggedIn(userId, 'A member')) ?? '';
      const answer = await web?.app.inject({ url: GEO, headers: { cookie } });
      return answer?.json<Shown>().regions.map((region) => region.name);
    };
    expect(await names(ASH)).toEqual(['west']);
    expect(await names(BROCK)).toEqual(['east', 'west']);
  });

  it('do not reach a visitor through what was kept for a member, nor by a member’s ETag', async () => {
    const { ask, ash, misty } = await hiddenEast();
    // In turns, each kept: every answer is its asker's own.
    const answers = [];
    for (const cookie of [ash, undefined, ash, misty, undefined, ash]) {
      answers.push({ member: cookie === ash, answer: await ask(cookie) });
    }
    const etags = { member: new Set<string>(), visitor: new Set<string>() };
    for (const { member, answer } of answers) {
      const names = answer.json<Shown>().regions.map((region) => region.name);
      expect(names).toEqual(member ? ['east', 'west'] : ['west']);
      etags[member ? 'member' : 'visitor'].add(String(answer.headers.etag));
    }
    expect([etags.member.size, etags.visitor.size]).toEqual([1, 1]);
    const [memberTag = ''] = etags.member;
    const [visitorTag = ''] = etags.visitor;
    expect(memberTag).not.toBe(visitorTag);
    // A member's ETag from a visitor is no match: the visitor's own view, whole.
    const crossed = await ask(undefined, { 'if-none-match': memberTag });
    expect(crossed.statusCode).toBe(200);
    expect(crossed.json<Shown>().regions.map((region) => region.name)).toEqual(['west']);
    // Each their own tag: nothing new.
    expect((await ask(undefined, { 'if-none-match': visitorTag })).statusCode).toBe(304);
    expect((await ask(ash, { 'if-none-match': memberTag })).statusCode).toBe(304);
    expect((await ask(ash, { 'if-none-match': visitorTag })).statusCode).toBe(200);
  });

  it('follow the channel: shown again once everybody can view it, hidden while Discord cannot say', async () => {
    const { ask, sources, made } = await hiddenEast();
    const names = async () => (await ask()).json<Shown>().regions.map((region) => region.name);
    expect(await names()).toEqual(['west']);
    sources.hidden.delete(EAST_FORUM);
    // Decided once a minute (F-B10): the same until then, then shown.
    expect(await names()).toEqual(['west']);
    made.clock.now += PUBLIC_REGIONS_KEPT_MS;
    expect(await names()).toEqual(['east', 'west']);
    // The bot's cache lacks West's forum: nothing can be said of it, so it is not shown.
    sources.unseen.add(WEST_FORUM);
    made.clock.now += PUBLIC_REGIONS_KEPT_MS;
    expect(await names()).toEqual(['east']);
    sources.unseen.add(EAST_FORUM);
    made.clock.now += PUBLIC_REGIONS_KEPT_MS;
    expect((await ask()).json()).toEqual({ regions: [], gyms: [] });
  });

  it('are judged by a region’s forum, and by its text channel where it has none', async () => {
    const sources = await geoSourcesWith();
    // East's text channel is hidden, its forum is not: the forum decides.
    sources.hidden.add(EAST_CHANNEL);
    sources.channelNames.set(EAST_CHANNEL, 'east-staff-only');
    sources.channelNames.set(EAST_FORUM, 'east-raids');
    web = webServerWith({ geo: sources });
    const answer = async () => (await web?.app.inject({ url: GEO }))?.json<Shown>();
    const shown = async () => (await answer())?.regions.map((region) => region.id);
    // Named by its forum, the channel that let it in: the hidden channel's name is nowhere.
    const visitor = await answer();
    expect(visitor?.regions.map((region) => [region.id, region.name])).toEqual([
      [2, 'east-raids'],
      [1, 'west'],
    ]);
    expect(JSON.stringify(visitor)).not.toContain('east-staff-only');
    expect(await shown()).toEqual([2, 1]);
    // Without a forum the text channel decides.
    sources.regionRows.rows = sources.regionRows.rows.map((region) =>
      region.channelId === EAST_CHANNEL ? { ...region, forumChannelId: null } : region,
    );
    await sources.regions.load();
    expect(await shown()).toEqual([1]);
  });

  it('are named for a visitor by their forum without its ending, the hidden channel still nowhere', async () => {
    const sources = await geoSourcesWith();
    sources.hidden.add(EAST_CHANNEL);
    sources.channelNames.set(EAST_CHANNEL, 'east-staff-only');
    sources.channelNames.set(EAST_FORUM, 'east-board');
    sources.channelNames.set(WEST_FORUM, 'west-board');
    const members = new FakeMemberDirectory().add(ASH, 'Ash');
    const made = webServerWith({ geo: sources, members });
    web = made;
    const visitor = (await made.app.inject({ url: GEO })).json<Shown>();
    expect(visitor.regions.map((region) => [region.id, region.name])).toEqual([
      [2, 'east'],
      [1, 'west'],
    ]);
    expect(JSON.stringify(visitor)).not.toContain('east-staff-only');
    expect(JSON.stringify(visitor)).not.toContain('-board');
    // A member's view names each region by its text channel, as before.
    const ash = await made.loggedIn(ASH, 'Ash');
    const member = (await made.app.inject({ url: GEO, headers: { cookie: ash } })).json<Shown>();
    expect(member.regions.map((region) => region.name)).toEqual(['east-staff-only', 'west']);
  });

  it('are named for a member by their text channel, as before', async () => {
    const { ask, ash, sources } = await hiddenEast();
    sources.channelNames.set(EAST_CHANNEL, 'east-chat');
    sources.channelNames.set(EAST_FORUM, 'east-raids');
    const names = (await ask(ash)).json<Shown>().regions.map((region) => region.name);
    expect(names).toEqual(['east-chat', 'west']);
  });
});

describe('the regions a member can open for themselves (F-B10, Matt 2026-11-10)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  /**
   * A server whose forums are all closed to everybody: East's opens to the role East, which
   * members give themselves; West's to Trader, which is not on the roster.
   */
  async function gated() {
    const sources = await geoSourcesWith();
    sources.hidden.add(EAST_FORUM).add(WEST_FORUM);
    sources.opens.set(EAST_FORUM, new Set([ROLE.east]));
    sources.opens.set(WEST_FORUM, new Set([ROLE.trader]));
    const roles = selfRolesWith();
    const added = await roles.selfRoles.addRole(
      FAKE_GUILD_ID,
      { roleId: ROLE.east },
      roles.owner(),
    );
    if (added.kind !== 'added') throw new Error(`East: ${added.kind}`);
    sources.sources.roles = roles.selfRoles;
    const made = webServerWith({ geo: sources });
    web = made;
    const names = async () =>
      (await made.app.inject({ url: GEO })).json<View>().regions.map((region) => region.name);
    return { made, sources, roles, row: added.row, names };
  }

  it('shows a visitor a region a self-assignable role opens, not one behind a role staff give', async () => {
    const { names } = await gated();
    expect(await names()).toEqual(['east']);
  });

  it('hides it again at the next build once its role is taken off the roster', async () => {
    const { names, roles, row } = await gated();
    expect(await names()).toEqual(['east']);
    await roles.selfRoles.removeRole(FAKE_GUILD_ID, row.id);
    expect(await names()).toEqual([]);
  });

  it("follows the server's self-assigned roles turned off and on at the next build (review F8)", async () => {
    const { names, roles, sources } = await gated();
    // As the app gives them: the roster only where the server's members give themselves roles.
    let on = true;
    sources.sources.roles = {
      roster: (guildId, remember) =>
        on ? roles.selfRoles.roster(guildId, remember) : Promise.resolve(undefined),
      get generation() {
        return roles.selfRoles.generation;
      },
      usedIn: () => on,
    };
    expect(await names()).toEqual(['east']);
    on = false;
    expect(await names()).toEqual([]);
    on = true;
    expect(await names()).toEqual(['east']);
  });

  it('shows only what everybody views while the roster cannot be read', async () => {
    const { names, roles, sources, made } = await gated();
    roles.storage.failing = new Error('the database is away');
    sources.hidden.delete(WEST_FORUM);
    // No roster: only West, which everybody views now, and not East, which its role opens.
    expect(await names()).toEqual(['west']);
    // Read again a minute later, once it can be: East as well.
    roles.storage.failing = undefined;
    made.clock.now += 60_000;
    expect(await names()).toEqual(['east', 'west']);
  });
});

describe('GeoCache, asked by many at once (F-B3)', () => {
  it('builds a view once, the gate asked once, whoever asks while it is built', async () => {
    const { sources } = await geoSourcesWith();
    const cache = new GeoCache(sources);
    let asked = 0;
    const mayBuild = () => {
      asked += 1;
      return Promise.resolve(true);
    };
    const views = await Promise.all(
      Array.from({ length: 300 }, () => cache.view(FAKE_GUILD_ID, 'public', mayBuild)),
    );
    expect(asked).toBe(1);
    expect(views.every((view) => view === views[0])).toBe(true);
    // Kept now: nobody asks the gate.
    expect(await cache.view(FAKE_GUILD_ID, 'public', mayBuild)).toBe(views[0]);
    expect(asked).toBe(1);
  });
});

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
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    // What it holds depends on who asks (plan 8Z-2): a cache keeps it per cookie.
    expect(answer.headers.vary).toBe('Cookie');
    expect(answer.headers.etag).toMatch(/^"[A-Za-z0-9_-]{20,}"$/);
    const view = answer.json<View>();
    expect(view.regions.map((region) => region.name)).toEqual(['east', 'west']);
    expect(view.gyms).toHaveLength(11);
  });

  it("show the server's own gyms only, though another server's lies in its regions (plan 19B-2)", async () => {
    const sources = await geoSourcesWith();
    web = webServerWith({ geo: sources });
    // The Library, in West, becomes the second server's alone.
    sources.gyms.unlink(1, TEST_GUILD_ROW);
    sources.gyms.link(1, OTHER_GUILD_ROW);
    await sources.directory.refreshGym(1);
    const view = (await web.app.inject({ url: GEO })).json<View>();
    expect(view.gyms).toHaveLength(10);
    expect(view.gyms.map((gym) => gym.id)).not.toContain(1);
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

    // A visitor's view names a region by its forum (F-B1).
    sources.channelNames.set(WEST_FORUM, 'west-end');
    expect((await named())?.regions.map((region) => region.name)).toEqual(['west-end']);

    expect(new Set(etags).size).toBe(4);
  });

  it('are empty for a server without regions', async () => {
    const sources = await geoSourcesWith();
    web = webServerWith({
      geo: sources,
      servers: {
        has: (guild) => guild === FAKE_GUILD_ID || guild === '412345678901234999',
        inSetup: () => false,
        openToVisitors: () => true,
      },
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
