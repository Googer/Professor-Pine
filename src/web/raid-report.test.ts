import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID, fakeChatInput, sent } from '../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  TEST_GUILD_ROW,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import { textOf } from '../../test/support/messages.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, at, BOB, PARTY_NOW } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { gymsFixture, gymsLyingIn } from '../../test/support/providers.js';
import { createTestContext } from '../../test/support/test-context.js';
import { MemoryUsers } from '../../test/support/users.js';
import {
  FakeActingMembers,
  partyWebWith,
  raidWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { raid, raidControls } from '../commands/raids/raid.js';
import { RAID_COMMAND, RAID_THROTTLE, REPORT_BARRED } from '../commands/raids/report.js';
import type { UserSettings } from '../db/repositories/user-repository.js';
import { InteractionRouter } from '../discord/router.js';
import { Throttles } from '../discord/throttle.js';
import { PartyStatus, RaidPrivacy } from '../domain/party/status.js';
import type { RaidAnswer } from '../domain/web/raid-options-data.js';
import type { GymProvider } from '../services/gym-directory.js';
import { UNREACHABLE } from './acting.js';

const REPORT = `/s/${FAKE_GUILD_ID}/api/raids`;
const HATCH = at('2026-10-13T14:30');

/** The invented gyms, with the bridge (gym 4) lying in West and in East as well. */
function gymsWithBridgeInBoth(): GymProvider {
  return gymsLyingIn({ 4: [WEST_CHANNEL, EAST_CHANNEL] });
}

/**
 * The map of a server with the party services of a test and none of its raids yet: Alice a
 * member (in the directory, and fetched fresh as `Alice` of team valor), the clock the parties'
 * own; `settings` what members set (`MemoryUsers`); `gyms` the gyms of the services and the
 * context alike.
 */
async function reporting(
  options: {
    throttles?: Throttles;
    settings?: Map<string, Partial<UserSettings>>;
    gyms?: GymProvider;
    /** The names of channels as the bot sees them (West and East by default). */
    channelNames?: Map<string, string>;
  } = {},
) {
  const throttles = options.throttles ?? new Throttles();
  const made = await partyServiceWith([], options.gyms ? { gyms: options.gyms } : {});
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    parties: made.store,
    regions: made.regions,
    users: new MemoryUsers(options.settings),
    ...(options.gyms ? { gyms: options.gyms } : {}),
  });
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const acting = new FakeActingMembers().add(ALICE, 'Alice', 'valor').add(BOB, 'Bob');
  const names =
    options.channelNames ??
    new Map([
      [WEST_CHANNEL, 'west'],
      [EAST_CHANNEL, 'east'],
    ]);
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles }),
    raids: raidWebWith(ctx, { channelName: (id) => names.get(id) }),
  });
  web.clock.now = PARTY_NOW;
  const headers = await web.posting(ALICE, 'Alice');
  const report = async (body: unknown, sent = headers) => {
    const answer = await web.app.inject({
      method: 'POST',
      url: REPORT,
      headers: { ...sent, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return {
      status: answer.statusCode,
      json: answer.json<RaidAnswer & { error?: string }>(),
      headers: answer.headers,
    };
  };
  return { made, ctx, web, acting, members, headers, report, throttles };
}

describe('reporting a raid on the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    vi.useRealTimers();
    await web?.app.close();
    web = undefined;
  });

  it("reports an egg picked from the list as /raid does: as the member, its hatch time in minutes, the command's words and the raid as the map shows it", async () => {
    const map = await reporting();
    web = map.web;
    const told = vi.spyOn(map.made.notify, 'raidReported');
    const answer = await map.report({ gym: 1, boss: 'e:T5:0', time: '30' });
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({
      ok: true,
      text: 'Reported: T5 egg at The Stacks.',
      raid: { kind: 'raid', gymId: 1, tier: 'Level 5 raid', stage: 'egg', hatchTime: HATCH },
    });
    const [party] = map.made.store.active();
    expect(party).toMatchObject({ gymId: 1, createdById: ALICE, anonymous: false });
    expect(party?.attendees[ALICE]).toMatchObject({
      status: PartyStatus.Interested,
      name: 'Alice',
      team: 'valor',
    });
    expect(answer.json.raid?.id).toBe(party?.id);
    const posts = map.made.gateway.postsIn(WEST_FORUM);
    expect(posts).toHaveLength(1);
    expect(textOf(posts[0]?.message)).toContain('Reported by **Alice**');
    // Whoever wants the raid is told, as of a report with /raid.
    expect(told).toHaveBeenCalledWith(expect.objectContaining({ id: party?.id }), ALICE);
  });

  it("reports a boss with a typed end time, and the member's privacy keeps them out of the post", async () => {
    const map = await reporting({
      settings: new Map([
        [ALICE, { raidPrivacy: RaidPrivacy.Anonymous, autoStatus: PartyStatus.NotInterested }],
      ]),
    });
    web = map.web;
    const answer = await map.report({ gym: 2, boss: 'yveltal', time: 'at 2:40pm' });
    expect(answer.json).toMatchObject({
      ok: true,
      text: 'Reported: Yveltal (T5) at Old Stone Fountain.',
    });
    expect(map.made.store.active()[0]).toMatchObject({
      gymId: 2,
      endTime: at('2026-10-13T14:40'),
      anonymous: true,
      raid: { boss: { key: 'yveltal' }, reportedHatched: true },
    });
    // Neither as the reporter nor in the list (not signed up by their automatic status).
    const [post] = map.made.gateway.postsIn(WEST_FORUM);
    expect(post).toBeDefined();
    expect(textOf(post?.message)).not.toContain('Reported by');
    expect(JSON.stringify(post?.message)).not.toContain('Alice');
    expect(JSON.stringify(post?.message)).not.toContain(ALICE);
  });

  it("refuses a time the raid cannot have, and a boss it cannot read, in the command's words as text", async () => {
    const map = await reporting();
    web = map.web;
    const late = await map.report({ gym: 1, boss: 'e:T5:0', time: '5pm' });
    expect(late.status).toBe(422);
    expect(late.json).toEqual({
      ok: false,
      text: '"5pm" cannot be the time the egg hatches: it must be between 1:15 PM and 3:00 PM.',
    });
    // Review 8E-1: an Elite egg needs its hatch time, as on /raid.
    const elite = await map.report({ gym: 1, boss: 'e:Elite:0' });
    expect(elite.status).toBe(422);
    expect(elite.json).toEqual({
      ok: false,
      text: 'An Elite egg shows when it hatches: give its hatch time, in minutes from now (20) or as a clock time (6:15pm).',
    });
    const unknown = await map.report({ gym: 1, boss: 'zzzz' });
    expect(unknown.json.text).toMatch(
      /^I do not know a raid boss or tier called "zzzz"\. .* t5 for/,
    );
    expect(map.made.store.active()).toEqual([]);
  });

  it('answers a raid already at the gym with that raid, so that the page can open it', async () => {
    const map = await reporting();
    web = map.web;
    const first = await map.report({ gym: 1, boss: 'e:T5:0' });
    const again = await map.web.app.inject({
      method: 'POST',
      url: REPORT,
      headers: { ...(await map.web.posting(BOB, 'Bob')), 'content-type': 'application/json' },
      payload: JSON.stringify({ gym: 1, boss: 'e:T5:0' }),
    });
    expect(again.statusCode).toBe(409);
    expect(again.json<RaidAnswer>()).toMatchObject({
      ok: false,
      text: 'There is already a raid at The Stacks. You have been marked as interested.',
      raid: { id: first.json.raid?.id },
    });
    expect(map.made.store.active()).toHaveLength(1);
  });

  // Review E6 of plan 8E: one raid per gym, of any kind, on the map as on Discord.
  it('answers a raid of the other kind at the gym as taken too, both ways', async () => {
    const map = await reporting();
    web = map.web;
    const bob = { ...(await map.web.posting(BOB, 'Bob')), 'content-type': 'application/json' };
    for (const [gym, first, second, name] of [
      [1, 'e:Elite:0', 'e:T5:0', 'The Stacks'],
      [2, 'e:T5:0', 'e:Elite:0', 'Old Stone Fountain'],
    ] as const) {
      const made = await map.report({ gym, boss: first, time: '30' });
      expect(made.json).toMatchObject({ ok: true });
      const again = await map.web.app.inject({
        method: 'POST',
        url: REPORT,
        headers: bob,
        payload: JSON.stringify({ gym, boss: second, time: '30' }),
      });
      expect(again.statusCode).toBe(409);
      expect(again.json<RaidAnswer>()).toMatchObject({
        ok: false,
        text: `There is already a raid at ${name}. You have been marked as interested.`,
        raid: { id: made.json.raid?.id },
      });
    }
    expect(map.made.store.active()).toHaveLength(2);
  });

  it('asks which region of a gym that lies in several, and reports into the one picked', async () => {
    const map = await reporting({ gyms: gymsWithBridgeInBoth() });
    web = map.web;
    const asked = await map.report({ gym: 4, boss: 'e:T5:0' });
    expect(asked.status).toBe(422);
    expect(asked.json).toEqual({
      ok: false,
      text: 'This gym lies in several regions: pick the one to report the raid in.',
      regions: [
        { id: 1, name: 'west' },
        { id: 2, name: 'east' },
      ],
    });
    expect(map.made.store.active()).toEqual([]);
    const east = await map.report({ gym: 4, region: 2, boss: 'e:T5:0' });
    expect(east.status).toBe(200);
    expect(map.made.store.active()[0]).toMatchObject({ gymId: 4, regionId: 2 });
  });

  it('says where the raid was posted when the region picked has no forum', async () => {
    const map = await reporting({ gyms: gymsWithBridgeInBoth() });
    web = map.web;
    await map.made.regions.setForum(1, null);
    const answer = await map.report({ gym: 4, region: 1, boss: 'e:T5:0' });
    expect(answer.status).toBe(200);
    expect(answer.json.text).toBe(
      'Reported: T5 egg at Veterans Memorial Bridge. It was posted in #east.',
    );
    expect(map.made.store.active()[0]).toMatchObject({ gymId: 4, regionId: 2 });
  });

  it('names a region whose channel the bot does not see by its number, in the list and in the words', async () => {
    const map = await reporting({ gyms: gymsWithBridgeInBoth(), channelNames: new Map() });
    web = map.web;
    expect((await map.report({ gym: 4, boss: 'e:T5:0' })).json.regions).toEqual([
      { id: 1, name: 'Region 1' },
      { id: 2, name: 'Region 2' },
    ]);
    await map.made.regions.setForum(1, null);
    expect((await map.report({ gym: 1, boss: 'e:T5:0' })).json.text).toBe(
      'The region Region 1 has no raid forum yet. A moderator can create it with /admin setup-forums.',
    );
    expect((await map.report({ gym: 4, region: 1, boss: 'e:T5:0' })).json.text).toBe(
      'Reported: T5 egg at Veterans Memorial Bridge. It was posted in Region 2.',
    );
  });

  it('refuses a report at a gym whose raid stands in a forum the member is kept out of, before anything is counted', async () => {
    const throttles = new Throttles();
    const map = await reporting({ throttles, gyms: gymsWithBridgeInBoth() });
    web = map.web;
    const bob = await map.report(
      { gym: 4, region: 2, boss: 'e:T5:0' },
      await map.web.posting(BOB, 'Bob'),
    );
    expect(bob.status).toBe(200);
    expect(throttles.size).toBe(1);
    map.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    // West, which Alice may see, would take a new raid; but the one there is in East.
    const refused = await map.report({ gym: 4, region: 1, boss: 'e:T5:0' });
    expect(refused.status).toBe(403);
    // In the words /raid refuses it with (plan 8M-6: one check for both).
    expect(refused.json).toEqual({ error: REPORT_BARRED });
    const [party] = map.made.store.active();
    expect(map.made.store.active()).toHaveLength(1);
    expect(party?.attendees[ALICE]).toBeUndefined();
    expect(throttles.size).toBe(1);
  });

  /**
   * Bob reports the bridge from East once Alice's checks passed, before her report is made (as
   * `raid.test.ts` makes the race): through the members' settings, read just before the report.
   */
  function bobReportsFirst(map: Awaited<ReturnType<typeof reporting>>): void {
    const users = map.ctx.users;
    const settingsOf = users.get.bind(users);
    users.get = async (userId) => {
      if (userId === ALICE && map.made.store.active().length === 0) {
        await map.made.service.reportRaid({
          gym: gymsFixture().get(4)!,
          guildRow: TEST_GUILD_ROW,
          reporterId: BOB,
          anonymous: false,
          autoStatus: PartyStatus.Interested,
          tier: { level: 'T5', shadow: false },
          boss: null,
          regionChannelId: EAST_CHANNEL,
        });
      }
      return settingsOf(userId);
    };
  }

  it('refuses to join a raid reported meanwhile in a forum the member is kept out of', async () => {
    const throttles = new Throttles();
    const map = await reporting({ throttles, gyms: gymsWithBridgeInBoth() });
    web = map.web;
    map.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    bobReportsFirst(map);
    const refused = await map.report({ gym: 4, region: 1, boss: 'e:T5:0' });
    expect(refused.status).toBe(403);
    expect(refused.json).toEqual({ ok: false, text: REPORT_BARRED });
    expect(map.made.store.active()).toHaveLength(1);
    expect(map.made.store.active()[0]?.attendees[ALICE]).toBeUndefined();
    // Past the checks before the report, it counts as a report does.
    expect(throttles.size).toBe(1);
  });

  it('answers that Discord is away when it cannot say at the join, and joins nothing', async () => {
    const map = await reporting({ gyms: gymsWithBridgeInBoth() });
    web = map.web;
    bobReportsFirst(map);
    const access = map.made.gateway.memberAccess.bind(map.made.gateway);
    map.made.gateway.memberAccess = (forum, member) =>
      forum === EAST_FORUM ? Promise.reject(new Error('Discord is away')) : access(forum, member);
    const answer = await map.report({ gym: 4, region: 1, boss: 'e:T5:0' });
    expect(answer.status).toBe(503);
    expect(answer.json).toEqual({ error: UNREACHABLE });
    expect(map.made.store.active()[0]?.attendees[ALICE]).toBeUndefined();
  });

  it('shares the limit of /raid: a report on the map counts, and /raid is refused after it', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < RAID_THROTTLE.uses - 1; n++) {
      throttles.use(RAID_COMMAND, ALICE, RAID_THROTTLE, PARTY_NOW);
    }
    const map = await reporting({ throttles });
    web = map.web;
    expect((await map.report({ gym: 1, boss: 'e:T5:0' })).status).toBe(200);
    const over = await map.report({ gym: 2, boss: 'e:T5:0' });
    expect(over.status).toBe(429);
    expect(over.json).toEqual({ error: 'You can do that again in 15 minutes.' });
    expect(over.headers['retry-after']).toBe('900');
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
    const router = new InteractionRouter(map.ctx, [raid], [raidControls], {
      throttles,
      now: () => PARTY_NOW,
    });
    const used = fakeChatInput({
      commandName: 'raid',
      channelId: WEST_CHANNEL,
      userId: ALICE,
      options: { boss: 'e:T5:0', gym: 'g:2' },
    });
    await router.handle(used as never);
    expect(sent(used.reply).content).toBe('You can use /raid again in 15 minutes.');
  });

  it('does not count a report whose post the bot may not make, nor one that failed', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < RAID_THROTTLE.uses - 1; n++) {
      throttles.use(RAID_COMMAND, ALICE, RAID_THROTTLE, PARTY_NOW);
    }
    const map = await reporting({ throttles });
    web = map.web;
    map.made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    const refused = await map.report({ gym: 1, boss: 'e:T5:0' });
    expect(refused.status).toBe(422);
    expect(refused.json.text).toContain('I lack the permission Manage Posts there.');
    map.made.gateway.refusePosts.delete(WEST_FORUM);
    // A post lost while it was made is none of the member's doing either.
    map.made.gateway.losePosts = true;
    expect((await map.report({ gym: 1, boss: 'e:T5:0' })).status).toBe(422);
    map.made.gateway.losePosts = false;
    map.made.gateway.failing.set('createPost', new Error('Discord is away'));
    expect((await map.report({ gym: 1, boss: 'e:T5:0' })).status).toBe(500);
    map.made.gateway.failing.delete('createPost');
    expect((await map.report({ gym: 1, boss: 'e:T5:0' })).status).toBe(200);
    expect((await map.report({ gym: 2, boss: 'e:T5:0' })).status).toBe(429);
  });

  it('refuses before anything is counted: a gym of no region of the server, a forum the member is kept out of, somebody not a member', async () => {
    const throttles = new Throttles();
    const map = await reporting({ throttles });
    web = map.web;
    expect((await map.report({ gym: 10, boss: 'e:T5:0' })).status).toBe(404);
    expect((await map.report({ gym: 999, boss: 'e:T5:0' })).status).toBe(404);
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    const barred = await map.report({ gym: 1, boss: 'e:T5:0' });
    expect(barred.status).toBe(403);
    expect(barred.json).toEqual({ error: REPORT_BARRED });
    map.acting.holdBack(ALICE, 'timed-out');
    expect((await map.report({ gym: 2, boss: 'e:T5:0' })).json).toEqual({
      error: 'You are timed out in this server, so you cannot do that now.',
    });
    map.acting.remove(ALICE);
    expect((await map.report({ gym: 2, boss: 'e:T5:0' })).status).toBe(403);
    expect(throttles.size).toBe(0);
    expect(map.made.store.active()).toEqual([]);
  });

  it('refuses while Discord cannot say how the member stands to the forum, reporting and counting nothing', async () => {
    const throttles = new Throttles();
    const map = await reporting({ throttles });
    web = map.web;
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const answer = await map.report({ gym: 1, boss: 'e:T5:0' });
    expect(answer.status).toBe(503);
    expect(answer.json).toEqual({ error: UNREACHABLE });
    expect(map.made.store.active()).toEqual([]);
    expect(throttles.size).toBe(0);
  });

  it('refuses a malformed body, and a request without the CSRF token, before reading it', async () => {
    const map = await reporting();
    web = map.web;
    expect((await map.report({ gym: '1', boss: 'e:T5:0' })).status).toBe(400);
    expect((await map.report({ gym: 1, boss: 'e:T5:0', extra: true })).status).toBe(400);
    expect((await map.report({ gym: 1, boss: 'x'.repeat(101) })).status).toBe(400);
    const { 'x-pine-csrf': _token, ...withoutToken } = map.headers;
    expect((await map.report({ gym: 1, boss: 'e:T5:0' }, withoutToken)).status).toBe(403);
    expect(map.made.store.active()).toEqual([]);
  });

  it('logs a report as a command is logged: who, where, which gym, what came of it; never a text', async () => {
    const map = await reporting();
    web = map.web;
    const answer = await map.report({ gym: 1, boss: 'e:T5:0', time: '30' });
    const logged = map.web.entries.find((entry) => entry.msg === 'a raid was reported on the map');
    expect(logged).toMatchObject({ user: ALICE, guild: FAKE_GUILD_ID, gym: 1, outcome: 'created' });
    const everything = JSON.stringify(map.web.entries);
    for (const text of [answer.json.text, 'The Stacks', 'e:T5:0', 'Alice']) {
      expect(everything).not.toContain(text);
    }
  });

  it('logs a refused report too, one line with what refused it; never a text', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < RAID_THROTTLE.uses - 1; n++) {
      throttles.use(RAID_COMMAND, ALICE, RAID_THROTTLE, PARTY_NOW);
    }
    const map = await reporting({ throttles });
    web = map.web;
    const logged = () =>
      map.web.entries.filter((entry) => entry.msg === 'a raid was reported on the map');
    await map.report({ gym: 10, boss: 'e:T5:0' });
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    await map.report({ gym: 1, boss: 'e:T5:0' });
    map.made.gateway.barred.delete(WEST_FORUM);
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    await map.report({ gym: 1, boss: 'e:T5:0' });
    map.made.gateway.failing.delete('memberAccess');
    // Refused by `/raid`'s reader, counted: the window is full after it.
    await map.report({ gym: 1, boss: 'not a boss at all' });
    await map.report({ gym: 1, boss: 'e:T5:0' });
    expect(logged().map((entry) => (entry as { outcome?: unknown }).outcome)).toEqual([
      'no-gym',
      'barred',
      'unreachable',
      'refused',
      'throttled',
    ]);
    expect(logged()[3]).toMatchObject({ user: ALICE, guild: FAKE_GUILD_ID, gym: 1 });
    expect(JSON.stringify(map.web.entries)).not.toContain('not a boss at all');
  });
});
