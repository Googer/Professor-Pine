import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { MOD } from '../../test/support/meetup-safety-cases.js';
import { MOD_CHANNEL, type SafetyOptions } from '../../test/support/meetup-safety-service.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { maxReportingWith, MAX_THURSDAY } from '../../test/support/max-reporting.js';
import { textDisplays } from '../../test/support/messages.js';
import { ALICE, asMax, at, BOB, TEST_SPOT } from '../../test/support/parties.js';
import {
  FakeActingMembers,
  maxWebWith,
  partyWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { MAX_BARRED, MAX_COMMAND, MAX_THROTTLE } from '../commands/max/max-report.js';
import { Throttles } from '../discord/throttle.js';
import { PartyStatus } from '../domain/party/status.js';
import type { MaxAnswer } from '../domain/web/max-data.js';
import { UNREACHABLE } from './acting.js';
import { MAP_MAX_ENDED, MAP_NOT_HERE, MAP_PIN_BLOCKED, MAP_WHICH_TIER } from './max-routes.js';

const REPORT = `/s/${FAKE_GUILD_ID}/api/maxes`;
const NINE = at('2026-10-22T21:00');
/** A point of West that no power spot is near: an unlisted power spot. */
const PIN = { lat: 40.05, lon: -80.05 };

/**
 * The map of the fakes' server over what `/max` reads and calls, Alice and Bob members (Alice
 * fetched fresh as `Alice` of team valor), the clock at `MAX_THURSDAY` (Date faked to it too).
 */
async function reporting(options: { throttles?: Throttles; safety?: SafetyOptions } = {}) {
  const throttles = options.throttles ?? new Throttles();
  const made = await maxReportingWith(options.safety ?? { moderation: null });
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const acting = new FakeActingMembers().add(ALICE, 'Alice', 'valor').add(BOB, 'Bob');
  const names = new Map([
    [WEST_CHANNEL, 'west'],
    [EAST_CHANNEL, 'east'],
  ]);
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles }),
    maxes: maxWebWith(made.ctx, { channelName: (id) => names.get(id) }),
  });
  web.clock.now = MAX_THURSDAY;
  const headers = await web.posting(ALICE, 'Alice');
  const bob = await web.posting(BOB, 'Bob');
  const report = async (body: unknown, sent = headers) => {
    const answer = await web.app.inject({
      method: 'POST',
      url: REPORT,
      headers: { ...sent, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return {
      status: answer.statusCode,
      json: answer.json<MaxAnswer & { error?: string }>(),
      headers: answer.headers,
    };
  };
  /** Uses `n` of Alice's uses of /max, as Discord would have. */
  const fill = (n: number) => {
    for (let use = 0; use < n; use++) {
      throttles.use(MAX_COMMAND, ALICE, MAX_THROTTLE, web.clock.now);
    }
  };
  /** Moves the clocks of the services and of the web server on to `time`. */
  const clockAt = (time: number) => {
    vi.setSystemTime(time);
    web.clock.now = time;
  };
  return { made, web, acting, members, headers, bob, report, throttles, clockAt, fill };
}

describe('reporting a max battle on the map', () => {
  let web: TestWeb | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await web?.app.close();
    web = undefined;
  });

  it("reports a boss of the list at a Power Spot as /max does: as the member, until its end, the command's words and the battle as the map shows it", async () => {
    const map = await reporting();
    web = map.web;
    const answer = await map.report({ spot: TEST_SPOT.id, boss: 'm:D2:machop' });
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({
      ok: true,
      text: 'Reported: Dynamax Machop (2★) at Gazebo of the Park, until 9:00 PM.',
      max: { kind: 'max', spotId: TEST_SPOT.id, title: 'Dynamax Machop (2★)', endTime: NINE },
    });
    const battle = asMax(map.made.store.active()[0]);
    expect(battle).toMatchObject({ createdById: ALICE, forumChannelId: WEST_FORUM, endTime: NINE });
    expect(battle.attendees[ALICE]).toMatchObject({ name: 'Alice', team: 'valor' });
    expect(answer.json.max?.id).toBe(battle.id);
    expect(map.made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    // Counted in /max's own window, as a use of /max is: once.
    map.fill(MAX_THROTTLE.uses - 2);
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(409);
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(429);
    expect(map.web.entries).toContainEqual(
      expect.objectContaining({
        msg: 'a max battle was reported on the map',
        user: ALICE,
        guild: FAKE_GUILD_ID,
        spot: TEST_SPOT.id,
        outcome: 'created',
      }),
    );
  });

  it('takes a point near a Power Spot as that spot, and one near none as an unlisted power spot, telling the moderators', async () => {
    const map = await reporting({ safety: {} });
    web = map.web;
    const near = await map.report({
      lat: TEST_SPOT.lat,
      lon: TEST_SPOT.lon + 0.0002,
      boss: 'Machop',
    });
    expect(near.json.max?.spotId).toBe(TEST_SPOT.id);
    const pinned = await map.report({ lat: 40.0500000004, lon: -80.05, boss: 'Machop' });
    expect(pinned.status).toBe(200);
    expect(pinned.json.text).toBe(
      'Reported: Dynamax Machop (2★) at an unlisted power spot, until 9:00 PM.',
    );
    expect(pinned.json.max).toMatchObject({
      spotId: null,
      place: { name: 'Unlisted power spot', lat: 40.05, lon: -80.05, address: null },
    });
    const pin = map.made.store
      .active()
      .map(asMax)
      .find((one) => one.max.spot.kind === 'pin');
    expect(pin?.max.spot).toEqual({
      kind: 'pin',
      lat: 40.05,
      lon: -80.05,
      near: null,
      linkName: null,
    });
    await map.made.reports.flush();
    const [notice] = map.made.gateway.messagesIn(MOD_CHANNEL);
    expect(textDisplays(notice?.message)[0]).toMatch(/^### Max battle at an unlisted power spot/);
    expect(map.web.entries).toContainEqual(
      expect.objectContaining({ msg: 'a max battle was reported on the map', pin: true }),
    );
  });

  it('refuses a member blocked from meetups a new battle at a pin, uncounted, and lets them join one there', async () => {
    const map = await reporting({ safety: {} });
    web = map.web;
    await map.made.storage.addBlock(map.made.gateway.guildId, ALICE, MOD);
    const refused = await map.report({ ...PIN, boss: 'Machop' });
    expect(refused.status).toBe(403);
    // The map's own words (the list of /max's option is no part of the map), and what it needs.
    expect(refused.json).toEqual({ ok: false, text: MAP_PIN_BLOCKED, needs: 'listed-spot' });
    expect(map.made.store.active()).toEqual([]);
    expect(map.throttles.size).toBe(0);
    expect((await map.report({ ...PIN, boss: 'Machop' }, map.bob)).status).toBe(200);
    const joined = await map.report({ ...PIN, boss: 'Machop' });
    expect(joined.status).toBe(409);
    expect(joined.json.text).toBe(
      'There is already a max battle against Dynamax Machop (2★) at this spot. You have been ' +
        'marked as interested.',
    );
    const battle = asMax(map.made.store.active()[0]);
    expect(battle.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
    expect(joined.json.max?.id).toBe(battle.id);
  });

  // Review r1 of 8X-F, R1-1 / X5-5: the map names no post, also none being made.
  it('says of a battle whose post is not made yet only that it is at this spot', async () => {
    const map = await reporting();
    web = map.web;
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' }, map.bob)).status).toBe(200);
    const [there] = map.made.store.active();
    if (!there) throw new Error('no battle');
    await map.made.store.update(there.id, (party) => ({ party: { ...party, forumPostId: null } }));
    const joined = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
    expect(joined.status).toBe(409);
    expect(joined.json.text).toBe(
      'There is already a max battle against Dynamax Machop (2★) at this spot. You have been ' +
        'marked as interested.',
    );
  });

  it('refuses another boss at the spot, naming the battle there and no post, uncounted', async () => {
    const map = await reporting();
    web = map.web;
    await map.report({ spot: TEST_SPOT.id, boss: 'Machop' }, map.bob);
    map.fill(MAX_THROTTLE.uses - 1);
    const taken = await map.report({ spot: TEST_SPOT.id, boss: 'Machamp', tier: 'D3' });
    expect(taken.status).toBe(409);
    expect(taken.json).toMatchObject({
      ok: false,
      text:
        'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park. ' +
        'Open its post and use /boss there to change its boss.',
      max: { title: 'Dynamax Machop (2★)' },
    });
    expect(map.made.store.active()).toHaveLength(1);
    // Uncounted: the one use left still reports (here, joins), the next is refused.
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(409);
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(429);
  });

  // Final review F1: the battle there is in the forum the report would go to, which is barred.
  it('names the battle of another boss to a member kept out of its forum, but never shows it', async () => {
    const map = await reporting();
    web = map.web;
    await map.report({ spot: TEST_SPOT.id, boss: 'Machop' }, map.bob);
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    const taken = await map.report({ spot: TEST_SPOT.id, boss: 'Machamp', tier: 'D3' });
    expect(taken.status).toBe(409);
    expect(taken.json.text).toMatch(/^There is already a max battle against Dynamax Machop \(2★\)/);
    expect(taken.json.max).toBeUndefined();
  });

  // Final review F4: the battle there ended after the checks, before the report was made.
  it('refuses a blocked member a new battle at a pin when the one there ended meanwhile, given back', async () => {
    const map = await reporting({ safety: {} });
    web = map.web;
    await map.report({ ...PIN, boss: 'Machop' }, map.bob);
    const bobs = asMax(map.made.store.active()[0]);
    await map.made.storage.addBlock(map.made.gateway.guildId, ALICE, MOD);
    const reportMax = map.made.service.reportMax.bind(map.made.service);
    vi.spyOn(map.made.service, 'reportMax').mockImplementationOnce(async (report) => {
      await map.made.store.update(bobs.id, (party) => ({
        party: { ...party, endTime: Date.now() - 60_000 },
      }));
      return reportMax(report);
    });
    map.fill(MAX_THROTTLE.uses - 1);
    const refused = await map.report({ ...PIN, boss: 'Machop' });
    expect(refused.status).toBe(403);
    expect(refused.json).toEqual({ ok: false, text: MAP_PIN_BLOCKED, needs: 'listed-spot' });
    expect(map.made.store.active().filter((party) => party.createdById === ALICE)).toEqual([]);
    // Given back: the one use left still reports, the next is refused.
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(200);
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(429);
  });

  // Final review F3: /max's words name the list that appears while one types in Discord.
  it('refuses a boss it does not know in the words of the map, and asks for one of the list', async () => {
    const map = await reporting();
    web = map.web;
    const unknown = await map.report({ spot: TEST_SPOT.id, boss: 'Zzzmon' });
    expect(unknown).toMatchObject({
      status: 422,
      json: {
        ok: false,
        text: 'I know no Pokémon called "Zzzmon". Pick a boss from the list.',
        needs: 'boss',
      },
    });
    expect(map.throttles.size).toBe(0);
  });

  it("refuses what /max's readers refuse in their words, uncounted", async () => {
    const map = await reporting();
    web = map.web;
    const which = await map.report({ spot: TEST_SPOT.id, boss: 'Machamp' });
    expect(which).toMatchObject({
      status: 422,
      json: { ok: false, text: MAP_WHICH_TIER, needs: 'tier' },
    });
    const gone = await map.report({ spot: 'deadbeef.16', boss: 'Machop' });
    expect(gone.json.text).toBe('That place is gone from the list; pick it again.');
    const outside = await map.report({ lat: 10, lon: 10, boss: 'Machop' });
    expect(outside.json.text).toBe(
      'That pin is not in a region of this server. Give a place in the regions here.',
    );
    map.clockAt(at('2026-10-22T21:05'));
    const late = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
    expect(late.json.text).toBe(
      'Max battles are over for today: they can be fought from 06:00 to 21:00.',
    );
    expect(map.throttles.size).toBe(0);
    expect(map.made.store.active()).toEqual([]);
  });

  it('refuses a member kept out of the forum the battle would be in, and says Discord is away, uncounted', async () => {
    const map = await reporting();
    web = map.web;
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    const barred = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
    expect(barred).toMatchObject({ status: 403, json: { error: MAX_BARRED } });
    map.made.gateway.barred.clear();
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const away = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
    expect(away).toMatchObject({ status: 503, json: { error: UNREACHABLE } });
    expect(map.throttles.size).toBe(0);
    expect(map.made.store.active()).toEqual([]);
  });

  it('asks which region of a spot that lies in several, and says where the battle went when the one picked has no forum', async () => {
    const map = await reporting();
    web = map.web;
    // East reaches into West here, over the spot.
    const east = map.made.regions.rows.find((region) => region.id === 2);
    if (east?.bounds) {
      east.bounds = east.bounds.map((corner) => ({
        ...corner,
        lon: corner.lon === -80 ? -80.05 : corner.lon,
      }));
    }
    const asked = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
    expect(asked).toMatchObject({
      status: 422,
      json: {
        ok: false,
        text: 'This place lies in several regions: pick the one to report the max battle in.',
        regions: [
          { id: 1, name: 'west' },
          { id: 2, name: 'east' },
        ],
      },
    });
    expect(map.throttles.size).toBe(0);
    if (east) east.forumChannelId = null;
    const posted = await map.report({ spot: TEST_SPOT.id, boss: 'Machop', region: 2 });
    expect(posted.status).toBe(200);
    expect(posted.json.text).toBe(
      'Reported: Dynamax Machop (2★) at Gazebo of the Park, until 9:00 PM. It was posted in #west.',
    );
    expect(map.made.gateway.postsIn(EAST_FORUM)).toEqual([]);
  });

  it('gives the use back when the bot may not make the post', async () => {
    const map = await reporting();
    web = map.web;
    map.made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    // More than /max's window holds, none of them counted.
    for (let n = 0; n <= MAX_THROTTLE.uses; n++) {
      const refused = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
      expect(refused.status).toBe(503);
      expect(refused.json.text).toMatch(/^I am not allowed to make posts in /);
    }
    map.made.gateway.refusePosts.delete(WEST_FORUM);
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(200);
  });

  it("answers what only the report finds out in /max's words: no forum and no region counted, ended and a failure given back", async () => {
    const map = await reporting();
    web = map.web;
    map.fill(MAX_THROTTLE.uses - 3);
    const west = map.made.regions.rows.find((region) => region.id === 1);
    if (west) west.forumChannelId = null;
    const noForum = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
    expect(noForum).toMatchObject({
      status: 422,
      json: {
        ok: false,
        text: 'The region #west has no raid forum yet. A moderator can create it with /admin setup-forums.',
      },
    });
    if (west) west.forumChannelId = WEST_FORUM;
    const reportMax = vi.spyOn(map.made.service, 'reportMax');
    reportMax.mockResolvedValueOnce({ kind: 'no-region' });
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).json).toMatchObject({
      ok: false,
      text: 'Gazebo of the Park is not in any region of this server, so I have nowhere to post the battle.',
    });
    reportMax.mockResolvedValueOnce({ kind: 'ended' });
    const ended = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
    // The map's words for it: /max is no part of the map.
    expect(ended).toMatchObject({ status: 422, json: { ok: false, text: MAP_MAX_ENDED } });
    reportMax.mockRejectedValueOnce(new Error('the store failed'));
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(500);
    reportMax.mockRestore();
    // No forum and no region count, as for /max (a refusal after its throttle); ended and the
    // failure were given back: one use is left.
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(200);
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(429);
  });

  it("refuses a spot whose region's outline no longer holds it, in the map's words", async () => {
    const map = await reporting();
    web = map.web;
    // West's outline moved off the spot since the kept power spots were placed.
    const west = map.made.regions.rows.find((region) => region.id === 1);
    if (west?.bounds)
      west.bounds = west.bounds.map((corner) => ({ ...corner, lat: corner.lat + 1 }));
    const refused = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
    expect(refused).toMatchObject({ status: 422, json: { ok: false, text: MAP_NOT_HERE } });
    expect(MAP_NOT_HERE).toBe(
      'That place is not in a region of this server. Pick a Power Spot on the map.',
    );
  });

  it("counts in /max's window, shared with Discord", async () => {
    const map = await reporting();
    web = map.web;
    for (let n = 0; n < MAX_THROTTLE.uses; n++) {
      map.throttles.use(MAX_COMMAND, ALICE, MAX_THROTTLE, Date.now());
    }
    const refused = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
    expect(refused.status).toBe(429);
    expect(refused.json.error).toMatch(/^You can do that again in /);
    expect(map.made.store.active()).toEqual([]);
  });

  it('refuses a body that is not a report, and more than 30 reports a minute from one address', async () => {
    const map = await reporting();
    web = map.web;
    const malformed = [
      {},
      { boss: 'Machop' },
      { spot: TEST_SPOT.id, ...PIN, boss: 'Machop' },
      { lat: 40.05, boss: 'Machop' },
      { spot: TEST_SPOT.id, boss: 'Machop', tier: 'T5' },
      { spot: TEST_SPOT.id, boss: 'Machop', colour: 'red' },
      { spot: TEST_SPOT.id, boss: 'Machop', end: '20', soon: { value: 'next', end: NINE } },
    ];
    for (const body of malformed) expect((await map.report(body)).status).toBe(400);
    for (let n = malformed.length; n < 30; n++) {
      expect((await map.report({ spot: 'deadbeef.16', boss: 'Machop' })).status).toBe(422);
    }
    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' })).status).toBe(429);
  });
});

describe('the ending-soon question of a max battle on the map', () => {
  let web: TestWeb | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: at('2026-10-22T14:57') });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await web?.app.close();
    web = undefined;
  });

  const GIGA = { spot: TEST_SPOT.id, boss: 'Machamp', tier: 'G' };

  it("asks what /max's dialog asks, uncounted, and reports the choice sent back, counted once", async () => {
    const map = await reporting();
    web = map.web;
    map.clockAt(at('2026-10-22T14:57'));
    map.fill(MAX_THROTTLE.uses - 1);
    const asked = await map.report(GIGA);
    expect(asked.status).toBe(422);
    expect(asked.json).toEqual({
      ok: false,
      text: 'This max battle ends at 3:00 PM, in 3 minutes. Report it until the next rotation?',
      soon: {
        choices: [
          { value: 'next', label: 'Until the next rotation, 4:00 PM', end: at('2026-10-22T16:00') },
          { value: 'soon', label: 'Until 3:00 PM (in 3 minutes)', end: at('2026-10-22T15:00') },
        ],
      },
    });
    expect(map.made.store.active()).toEqual([]);
    const reported = await map.report({
      ...GIGA,
      soon: { value: 'next', end: at('2026-10-22T16:00') },
    });
    expect(reported.status).toBe(200);
    expect(reported.json.text).toBe(
      'Reported: Gigantamax Machamp at Gazebo of the Park, until 4:00 PM.',
    );
    expect(map.made.store.active()[0]?.endTime).toBe(at('2026-10-22T16:00'));
    // The question and the report sent again were one use: the window is full now.
    const more = await map.report({ ...GIGA });
    expect(more.status).toBe(429);
  });

  // Final review F2: Discord refuses /max for the full window before its dialog opens.
  it("refuses at once, uncounted, when /max's window is full, rather than ask", async () => {
    const map = await reporting();
    web = map.web;
    map.clockAt(at('2026-10-22T14:57'));
    map.fill(MAX_THROTTLE.uses);
    const refused = await map.report(GIGA);
    expect(refused.status).toBe(429);
    expect(refused.json.error).toMatch(/^You can do that again in /);
    expect(refused.headers['retry-after']).toBe(String(MAX_THROTTLE.perSeconds));
    expect(map.made.store.active()).toEqual([]);
  });

  it('ignores the answer when a battle of the same boss came meanwhile: the report joins it', async () => {
    const map = await reporting();
    web = map.web;
    map.clockAt(at('2026-10-22T14:57'));
    const next = { value: 'next', end: at('2026-10-22T16:00') };
    expect((await map.report(GIGA)).status).toBe(422);
    expect((await map.report({ ...GIGA, soon: next }, map.bob)).status).toBe(200);
    const joined = await map.report({ ...GIGA, soon: next });
    expect(joined.status).toBe(409);
    expect(joined.json.text).toMatch(
      /^There is already a max battle against Gigantamax \S+ at this spot\./,
    );
    expect(map.made.store.active()).toHaveLength(1);
  });

  it('asks again with the new choices when the end sent back is no longer offered, and refuses one that has passed', async () => {
    const map = await reporting();
    web = map.web;
    map.clockAt(at('2026-10-22T14:57'));
    map.fill(MAX_THROTTLE.uses - 1);
    const stale = await map.report({
      ...GIGA,
      soon: { value: 'next', end: at('2026-10-22T15:30') },
    });
    expect(stale.status).toBe(422);
    expect(stale.json.soon?.choices.map((choice) => choice.end)).toEqual([
      at('2026-10-22T16:00'),
      at('2026-10-22T15:00'),
    ]);
    map.clockAt(at('2026-10-22T15:00'));
    const passed = await map.report({
      ...GIGA,
      soon: { value: 'soon', end: at('2026-10-22T15:00') },
    });
    expect(passed).toMatchObject({
      status: 422,
      json: { ok: false, text: 'That battle has ended meanwhile: nothing was reported.' },
    });
    expect(map.made.store.active()).toEqual([]);
    // Neither was counted: the one use left reports, the next is refused.
    expect((await map.report(GIGA)).status).toBe(200);
    expect((await map.report(GIGA)).status).toBe(429);
  });

  it('asks only whether to report it where no later rotation is left, and never about a typed end or a battle to join', async () => {
    const map = await reporting();
    web = map.web;
    map.clockAt(at('2026-10-22T20:57'));
    const asked = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
    expect(asked.json).toEqual({
      ok: false,
      text: 'This max battle ends at 9:00 PM, in 3 minutes. Report it anyway?',
      soon: { choices: [{ value: 'soon', label: 'Until 9:00 PM (in 3 minutes)', end: NINE }] },
    });
    const typed = await map.report({ spot: TEST_SPOT.id, boss: 'Machop', end: '2' });
    expect(typed.status).toBe(200);
    const joined = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' }, map.bob);
    expect(joined.status).toBe(409);
    expect(joined.json.text).toMatch(/^There is already a max battle against Dynamax Machop/);
  });
});
