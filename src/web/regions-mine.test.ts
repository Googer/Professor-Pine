import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_FORUM, WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE } from '../../test/support/parties.js';
import {
  PLAZA_FORUM,
  REGION_ROLE,
  regionRolesWith,
  viewOverwrite,
} from '../../test/support/region-roles.js';
import { webServerWith, type TestWeb } from '../../test/support/web.js';
import type { RegionsMineView } from '../domain/web/region-data.js';

const URL = `/s/${FAKE_GUILD_ID}/api/regions/mine`;

/**
 * "Your regions" (plan 8M-20): the regions of `regionRolesWith` and Alice a member holding
 * `held`; `offer` false leaves the roles unoffered, `roles` false is `settings.features.roles`
 * off.
 */
async function setup(held: string[] = [], options: { offer?: boolean; roles?: boolean } = {}) {
  const made = await regionRolesWith({ offer: options.offer ?? true });
  made.server.member(ALICE, ...held);
  const members = new FakeMemberDirectory().add(ALICE, 'Alice');
  const web = webServerWith({
    members,
    regions: options.roles === false ? { ...made.deps, selfRoles: undefined } : made.deps,
  });
  const ask = async (userId = ALICE) =>
    web.app.inject({
      method: 'GET',
      url: URL,
      headers: { cookie: await web.loggedIn(userId, 'x') },
    });
  const view = async (): Promise<RegionsMineView> => {
    const answer = await ask();
    expect(answer.statusCode).toBe(200);
    return answer.json<RegionsMineView>();
  };
  return { ...made, web, members, ask, view };
}

describe('GET /api/regions/mine', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('says how a member stands to each region with an outline, and which roles open those hidden', async () => {
    const made = await setup();
    web = made.web;
    const view = await made.view();
    expect(view.readOnly).toBe(false);
    expect(view.roles).toBe(true);
    // The region without an outline (3) is not on the map, so not here either.
    expect(view.regions.map((region) => [region.id, region.access, region.listed])).toEqual([
      [1, 'hidden', true],
      [2, 'hidden', true],
      [4, 'visible', true],
    ]);
    const [west, east, plaza] = view.regions;
    expect(west?.join).toEqual([
      {
        roleId: REGION_ROLE.metro,
        name: 'Metro',
        alsoOpens: [2],
        alsoLeaves: { roles: [], regions: [] },
        stuck: null,
      },
      {
        roleId: REGION_ROLE.west,
        name: 'West',
        alsoOpens: [],
        alsoLeaves: { roles: [], regions: [] },
        stuck: null,
      },
    ]);
    expect(east?.join.map((join) => join.name)).toEqual(['East', 'Metro']);
    // Everybody sees the Plaza: nothing to join or leave.
    expect(plaza).toEqual({ id: 4, access: 'visible', listed: true, join: [], leave: [] });
    // The member as the directory's look left them in the cache (A1): no forced fetch of its own.
    expect(made.gateway.gateLooks).toEqual([{ memberId: ALICE, fresh: false }]);
  });

  it('says what a pick-one group takes along, and what a leave closes or what keeps it open', async () => {
    const made = await setup([REGION_ROLE.west]);
    web = made.web;
    const [west, east] = (await made.view()).regions;
    expect(west).toMatchObject({ access: 'visible', join: [] });
    expect(west?.leave).toEqual([
      { roleId: REGION_ROLE.west, name: 'West', closes: true, alsoCloses: [], stillOpenBy: [] },
    ]);
    expect(east?.join.find((join) => join.name === 'East')?.alsoLeaves).toEqual({
      roles: ['West'],
      regions: [1],
    });
    // Roles changed on Discord: the directory's next look brings the cache up to date.
    made.server.member(ALICE, REGION_ROLE.metro);
    made.gateway.memberFetched(ALICE);
    const [westByMetro, eastByMetro] = (await made.view()).regions;
    expect(westByMetro?.leave).toEqual([
      { roleId: REGION_ROLE.metro, name: 'Metro', closes: true, alsoCloses: [2], stillOpenBy: [] },
    ]);
    expect(eastByMetro?.leave).toEqual([
      { roleId: REGION_ROLE.metro, name: 'Metro', closes: true, alsoCloses: [1], stillOpenBy: [] },
    ]);
    // Metro beside West and a role staff gave (Patrol, which opens West too): West stays open.
    made.gateway.forumOverwrites.get(WEST_FORUM)?.push(viewOverwrite(REGION_ROLE.patrol, true));
    made.server.member(ALICE, REGION_ROLE.metro, REGION_ROLE.west, REGION_ROLE.patrol);
    made.gateway.memberFetched(ALICE);
    const [both] = (await made.view()).regions;
    expect(both?.leave).toEqual([
      {
        roleId: REGION_ROLE.metro,
        name: 'Metro',
        closes: false,
        // West stays open, East (which only Metro opens) closes (W1).
        alsoCloses: [2],
        stillOpenBy: ['West', 'a role staff gave you'],
      },
      {
        roleId: REGION_ROLE.west,
        name: 'West',
        closes: false,
        alsoCloses: [],
        stillOpenBy: ['Metro', 'a role staff gave you'],
      },
    ]);
  });

  it('lays the bot’s own changes over the cached member, whose age is unknown (W4)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const made = await setup([REGION_ROLE.west]);
      web = made.web;
      // The cache holds her with West (the directory's look, an interaction of hers).
      made.gateway.memberFetched(ALICE);
      // `/iamnot` takes West through the service; nothing brings the cache up to date.
      const taken = await made.selfRoles.change(FAKE_GUILD_ID, made.server.seen(ALICE), {
        give: [],
        take: [REGION_ROLE.west],
      });
      expect(taken.kind).toBe('done');
      // The map asks a minute later, from the cache.
      vi.setSystemTime(made.clock.now + 60_000);
      const [west] = (await made.view()).regions;
      expect(west?.leave).toEqual([]);
      expect(made.gateway.gateLooks).toEqual([{ memberId: ALICE, fresh: false }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a member out only by an overwrite of their own or a role nobody gives themselves (A6)', async () => {
    const made = await setup([REGION_ROLE.west]);
    web = made.web;
    made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    // West denies the Plaza: a self-assignable role, so the Plaza is only hidden, and East,
    // which gives West back, opens it.
    made.gateway.forumOverwrites.set(PLAZA_FORUM, [viewOverwrite(REGION_ROLE.west, false)]);
    const [, east, plaza] = (await made.view()).regions;
    expect(east).toMatchObject({ access: 'barred', join: [], leave: [] });
    expect(plaza?.access).toBe('hidden');
    // Its raids are not listed on the map either (the party lists' barred, W3).
    expect(plaza?.listed).toBe(false);
    expect(east?.listed).toBe(false);
    expect(plaza?.join.map((join) => [join.name, join.alsoLeaves])).toEqual([
      ['East', { roles: ['West'], regions: [1] }],
    ]);
    // Patrol, which staff give, denies it: kept out.
    made.gateway.forumOverwrites.set(PLAZA_FORUM, [viewOverwrite(REGION_ROLE.patrol, false)]);
    made.server.member(ALICE, REGION_ROLE.west, REGION_ROLE.patrol);
    made.gateway.memberFetched(ALICE);
    const [, , patrolled] = (await made.view()).regions;
    expect(patrolled).toMatchObject({ access: 'barred', join: [] });
  });

  it('gives access alone where the server offers no role that opens a region, or has roles off', async () => {
    const unoffered = await setup([], { offer: false });
    web = unoffered.web;
    const plain = await unoffered.view();
    expect(plain.roles).toBe(true);
    expect(plain.regions.every((region) => region.join.length + region.leave.length === 0)).toBe(
      true,
    );
    await web.app.close();
    const off = await setup([REGION_ROLE.west], { roles: false });
    web = off.web;
    const view = await off.view();
    expect(view.roles).toBe(false);
    expect(
      view.regions.map((region) => [region.id, region.access, region.join, region.leave]),
    ).toEqual([
      [1, 'visible', [], []],
      [2, 'hidden', [], []],
      [4, 'visible', [], []],
    ]);
  });

  it('is for members: 401 logged out, 403 for somebody else, 503 or read-only while Discord is away', async () => {
    const made = await setup();
    web = made.web;
    expect((await made.web.app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);
    expect((await made.ask('200000000000000099')).statusCode).toBe(403);
    // Nothing of the server was asked for somebody who is no member.
    expect(made.gateway.gateLooks).toEqual([]);
    made.members.failing = new Error('Discord is away');
    expect((await made.ask()).statusCode).toBe(503);
    made.members.failing = undefined;
    made.gateway.failing.set('memberGates', new Error('Discord is away'));
    expect(await made.view()).toEqual({ readOnly: true, roles: true, regions: [] });
  });
});
