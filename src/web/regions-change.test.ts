import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_FORUM, WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { REGION_ROLE, regionRolesWith } from '../../test/support/region-roles.js';
import { Tally } from '../../test/support/tally.js';
import {
  FakeActingMembers,
  NO_PARTIES,
  partyWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { controlThrottleKey } from '../discord/router.js';
import { MEMBER_WRITE_THROTTLE, Throttles } from '../discord/throttle.js';
import type { RegionChangeAnswer } from '../domain/web/region-data.js';
import { ROLES_KIND } from '../render/role-menus.js';
import { PartyStatus } from '../domain/party/status.js';
import type { PartiesView } from '../domain/web/party-data.js';

const BASE = `/s/${FAKE_GUILD_ID}/api/regions`;
/** The region ids of `regionRolesWith`: West, East, the Plaza. */
const WEST = 1;
const EAST = 2;
const PLAZA = 4;

/**
 * Joining and leaving regions on the map (plan 8M-20) over `regionRolesWith`: Alice a member
 * holding `held`, who acts as the fake role server has her (`acting.rolesOf`); `throttles` the
 * router's, whose window of the role menus a change counts in.
 */
async function setup(
  held: string[] = [],
  options: {
    roles?: boolean;
    /** The party services (`reportedRaid`'s); the parties' routes are served over them. */
    party?: Awaited<ReturnType<typeof reportedRaid>>;
    /** Whether the acting member's forced fetch brings the gateway's cache up to date (as it does). */
    syncCache?: boolean;
  } = {},
) {
  const made = await regionRolesWith(options.party ? { made: options.party } : {});
  made.server.member(ALICE, ...held);
  const members = new FakeMemberDirectory().add(ALICE, 'Alice');
  const acting = new FakeActingMembers().add(ALICE, 'Alice');
  acting.rolesOf = (userId) => {
    if (options.syncCache !== false) made.gateway.memberFetched(userId);
    return made.server.held(userId);
  };
  acting.now = () => made.clock.now;
  const throttles = new Throttles();
  const web = webServerWith({
    members,
    parties: options.party
      ? partyWebWith(options.party, { acting, throttles })
      : { ...NO_PARTIES, acting, throttles },
    regions: options.roles === false ? { ...made.deps, selfRoles: undefined } : made.deps,
  });
  web.clock.now = options.party ? options.party.clock.now : made.clock.now;
  const press = async (region: number, action: string, body: unknown = {}) =>
    web.app.inject({
      method: 'POST',
      url: `${BASE}/${String(region)}/${action}`,
      headers: { ...(await web.posting(ALICE, 'Alice')), 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
  const answerOf = async (region: number, action: string, role: string) => {
    const answer = await press(region, action, { role });
    return {
      status: answer.statusCode,
      body: answer.json<RegionChangeAnswer & { error?: string }>(),
    };
  };
  /** The uses counted in the window of the role menus. */
  const counted = () =>
    throttles.wait(
      controlThrottleKey(ROLES_KIND),
      ALICE,
      { ...MEMBER_WRITE_THROTTLE, uses: 1 },
      made.clock.now,
    ) !== undefined;
  return { ...made, web, members, acting, throttles, press, answerOf, counted };
}

describe('POST /api/regions/<region>/join|leave', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    vi.restoreAllMocks();
    await web?.app.close();
    web = undefined;
  });

  it('joins a hidden region through the role, in /iam’s words, with the view as it is now', async () => {
    const made = await setup();
    web = made.web;
    const { status, body } = await made.answerOf(WEST, 'join', REGION_ROLE.west);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, outcome: 'done', text: 'You have West now.' });
    expect(made.server.held(ALICE)).toEqual([REGION_ROLE.west]);
    expect(made.roleGateway.said()).toEqual(['give West']);
    // The view from the member fetched afresh after the change: West is seen, and left by West.
    expect(body.view?.regions.find((region) => region.id === WEST)).toMatchObject({
      access: 'visible',
      leave: [
        { roleId: REGION_ROLE.west, name: 'West', closes: true, alsoCloses: [], stillOpenBy: [] },
      ],
    });
    expect(made.gateway.gateLooks.map((look) => look.fresh)).toEqual([false, true]);
    expect(made.counted()).toBe(true);
  });

  it('has the parties of the map see the change at once, not after their minute (R3, A4)', async () => {
    const party = await reportedRaid();
    const made = await setup([], { party });
    web = made.web;
    const parties = async () => {
      const answer = await made.web.app.inject({
        method: 'GET',
        url: `/s/${FAKE_GUILD_ID}/api/parties`,
        headers: { cookie: await made.web.loggedIn(ALICE, 'Alice') },
      });
      expect(answer.statusCode).toBe(200);
      return answer.json<PartiesView>();
    };
    // West is hidden from her: its raid shows, but is not hers to report.
    expect((await parties()).raids[0]?.mayReport).toBeUndefined();
    expect((await made.answerOf(WEST, 'join', REGION_ROLE.west)).status).toBe(200);
    expect((await parties()).raids[0]?.mayReport).toBe(true);
  });

  it('plans over the roles of the write’s own fetch, not an older cache (A3)', async () => {
    const made = await setup([REGION_ROLE.west], { syncCache: false });
    web = made.web;
    // The cache still holds West; Discord says she gave it back meanwhile.
    expect((await made.gateway.memberGates(FAKE_GUILD_ID, ALICE, [], true))?.held).toEqual([
      REGION_ROLE.west,
    ]);
    made.server.member(ALICE);
    expect(await made.answerOf(WEST, 'leave', REGION_ROLE.west)).toEqual({
      status: 409,
      body: { error: 'That role no longer opens this region.' },
    });
    expect(made.roleGateway.said()).toEqual([]);
  });

  it('keeps the forum of a party she is in when she gives back the role that showed it (B5)', async () => {
    const party = await reportedRaid();
    const made = await setup([REGION_ROLE.west], { party });
    web = made.web;
    await party.attendance.signUp(party.party.id, { id: ALICE }, PartyStatus.Coming);
    await party.access.flush();
    expect(party.access.has(WEST_FORUM, ALICE)).toBe(false);
    const left = await made.answerOf(WEST, 'leave', REGION_ROLE.west);
    expect(left.body.text).toBe('You no longer have West.');
    await party.access.flush();
    expect(party.access.has(WEST_FORUM, ALICE)).toBe(true);
    expect(party.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
  });

  it('says what a pick-one group took along, and leaves by the role that alone opens a region', async () => {
    const made = await setup([REGION_ROLE.west]);
    web = made.web;
    const joined = await made.answerOf(EAST, 'join', REGION_ROLE.east);
    expect(joined.body.text).toBe(
      'You have East now. I took West away: only one role of the group Home can be held at a time.',
    );
    expect(made.server.held(ALICE)).toEqual([REGION_ROLE.east]);
    const left = await made.answerOf(EAST, 'leave', REGION_ROLE.east);
    expect(left.body).toMatchObject({
      ok: true,
      outcome: 'done',
      text: 'You no longer have East.',
    });
    expect(made.server.held(ALICE)).toEqual([]);
  });

  it('refuses a role that does not open the region now, a region seen already, and one barred', async () => {
    const made = await setup([REGION_ROLE.west]);
    web = made.web;
    expect(await made.answerOf(EAST, 'join', REGION_ROLE.west)).toEqual({
      status: 409,
      body: { error: 'That role no longer opens this region.' },
    });
    expect(await made.answerOf(EAST, 'leave', REGION_ROLE.east)).toEqual({
      status: 409,
      body: { error: 'That role no longer opens this region.' },
    });
    expect(await made.answerOf(WEST, 'join', REGION_ROLE.metro)).toEqual({
      status: 409,
      body: { error: 'You see this region on Discord already.' },
    });
    made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    expect(await made.answerOf(EAST, 'join', REGION_ROLE.east)).toEqual({
      status: 403,
      body: { error: 'Somebody keeps you out of this region on Discord: ask staff.' },
    });
    expect((await made.answerOf(PLAZA, 'leave', REGION_ROLE.west)).status).toBe(409);
    expect((await made.answerOf(9, 'join', REGION_ROLE.west)).status).toBe(404);
    // Nothing was asked of Discord's roles, and nothing counted.
    expect(made.roleGateway.said()).toEqual([]);
    expect(made.counted()).toBe(false);
  });

  it('refuses a body or an action it does not know', async () => {
    const made = await setup();
    web = made.web;
    expect((await made.press(WEST, 'join', { role: 'west' })).statusCode).toBe(400);
    expect((await made.press(WEST, 'join', { role: REGION_ROLE.west, more: 1 })).statusCode).toBe(
      400,
    );
    expect((await made.press(WEST, 'swap', { role: REGION_ROLE.west })).statusCode).toBe(404);
  });

  it('counts in the role menus’ window, and refuses once it is full', async () => {
    const made = await setup();
    web = made.web;
    for (let use = 0; use < MEMBER_WRITE_THROTTLE.uses; use += 1) {
      made.throttles.use(
        controlThrottleKey(ROLES_KIND),
        ALICE,
        MEMBER_WRITE_THROTTLE,
        made.clock.now,
      );
    }
    const { status, body } = await made.answerOf(WEST, 'join', REGION_ROLE.west);
    expect(status).toBe(429);
    expect(body.error).toMatch(/^That was a lot of clicks\. Try again in /u);
    expect(made.server.held(ALICE)).toEqual([]);
  });

  it('refuses a member still in the server’s screening, as every write on the map', async () => {
    const made = await setup();
    web = made.web;
    made.acting.holdBack(ALICE, 'pending');
    expect(await made.answerOf(WEST, 'join', REGION_ROLE.west)).toEqual({
      status: 403,
      body: { error: "Finish this server's membership screening first." },
    });
    expect(made.roleGateway.said()).toEqual([]);
  });

  it('says what Discord stopped, and gives the use back when the change failed outright', async () => {
    const made = await setup();
    web = made.web;
    made.roleGateway.refusing = 'no-permission';
    const refused = await made.answerOf(WEST, 'join', REGION_ROLE.west);
    expect(refused.status).toBe(200);
    expect(refused.body).toMatchObject({ ok: false, outcome: 'partial' });
    expect(refused.body.text).toMatch(
      /^I could not give you West: Discord did not let me\. .* Nothing was changed\.$/u,
    );
    made.roleGateway.refusing = undefined;
    made.roleGateway.failing = new Error('Discord is away');
    const failed = await made.answerOf(WEST, 'join', REGION_ROLE.west);
    expect(failed).toEqual({ status: 503, body: { error: 'I could not make the change.' } });
    // The partial one stays counted (the member's), the failed one was given back.
    expect(
      made.throttles.wait(
        controlThrottleKey(ROLES_KIND),
        ALICE,
        { ...MEMBER_WRITE_THROTTLE, uses: 2 },
        made.clock.now,
      ),
    ).toBeUndefined();
  });

  it('answers that the roles cannot be seen, and that earlier changes still run', async () => {
    const made = await setup();
    web = made.web;
    made.roleGateway.servers.delete(FAKE_GUILD_ID);
    expect(await made.answerOf(WEST, 'join', REGION_ROLE.west)).toEqual({
      status: 503,
      body: {
        error: 'I cannot see the roles of this server at the moment. Try again in a minute.',
      },
    });
  });

  it('answers what the service says when its turn came: the roles unknown, or too late (A5)', async () => {
    const made = await setup();
    web = made.web;
    made.selfRoles.change = () => Promise.resolve({ kind: 'unavailable' });
    expect(await made.answerOf(WEST, 'join', REGION_ROLE.west)).toEqual({
      status: 503,
      body: {
        error: 'I cannot see the roles of this server at the moment. Try again in a minute.',
      },
    });
    made.selfRoles.change = () => Promise.resolve({ kind: 'refused', reason: 'expired' });
    expect(await made.answerOf(WEST, 'join', REGION_ROLE.west)).toEqual({
      status: 503,
      body: { error: 'I could not make the change.' },
    });
  });

  it('answers that earlier changes still run while three of the member wait', async () => {
    const made = await setup();
    web = made.web;
    const begun = new Tally('changes begun');
    const change = made.selfRoles.change.bind(made.selfRoles);
    made.selfRoles.change = (...args) => {
      begun.add();
      return change(...args);
    };
    let release = (): void => undefined;
    made.roleGateway.holding = new Promise((resolve) => {
      release = resolve;
    });
    const waiting = [
      made.answerOf(WEST, 'join', REGION_ROLE.west),
      made.answerOf(WEST, 'join', REGION_ROLE.metro),
      made.answerOf(EAST, 'join', REGION_ROLE.east),
    ];
    await begun.reached(3);
    expect(await made.answerOf(EAST, 'join', REGION_ROLE.metro)).toEqual({
      status: 409,
      body: { error: 'I am still working on your earlier changes. Try again in a moment.' },
    });
    release();
    expect((await Promise.all(waiting)).map((one) => one.status)).toEqual([200, 200, 200]);
  });

  it('is not there where self-assigned roles are off', async () => {
    const made = await setup([], { roles: false });
    web = made.web;
    expect((await made.press(WEST, 'join', { role: REGION_ROLE.west })).statusCode).toBe(404);
  });
});
