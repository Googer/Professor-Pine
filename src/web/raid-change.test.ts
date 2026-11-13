import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESS_SHOWN_MS } from './post-drawn.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { TEST_GUILD_ROW, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, at, BOB, PARTY_NOW } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import {
  FakeActingMembers,
  partyWebWith,
  raidWebWith,
  TEST_OWNER_ID,
  webServerWith,
  type TestWeb,
  RecordingDraws,
} from '../../test/support/web.js';
import { gymsFixture } from '../../test/support/providers.js';
import { CHANGE_THROTTLE } from '../commands/raids/change.js';
import { Throttles } from '../discord/throttle.js';
import { PartyStatus } from '../domain/party/status.js';
import type { RaidReport } from '../services/party-service.js';
import type { PartiesView } from '../domain/web/party-data.js';
import type { RaidAnswer, RaidMovesView } from '../domain/web/raid-options-data.js';
import { UNREACHABLE } from './acting.js';

/** What a change answers that would make the raid the kind another raid at its gym is. */
const GYM_TAKEN = 'That gym already has a raid.';

const HATCH = at('2026-10-13T14:30');
const END = at('2026-10-13T15:15');
const change = (partyId: string, what: string) =>
  `/s/${FAKE_GUILD_ID}/api/raids/${partyId}/${what}`;

/**
 * A raid of the party services of a test (`reportedRaid`) on the map, with Alice signed up for it
 * (unless `signedUp` is false) and a member of the server, fetched fresh as `Alice`; Bob a member
 * who is not signed up. The web server's clock is the parties' own.
 */
async function changing(
  report: Partial<RaidReport> = {},
  options: { signedUp?: boolean; throttles?: Throttles } = {},
) {
  const made = await reportedRaid(report);
  if (options.signedUp !== false) {
    await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  }
  const throttles = options.throttles ?? new Throttles();
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    parties: made.store,
    regions: made.regions,
  });
  const members = new FakeMemberDirectory()
    .add(ALICE, 'Alice')
    .add(BOB, 'Bob')
    .add(TEST_OWNER_ID, 'Owner');
  const acting = new FakeActingMembers()
    .add(ALICE, 'Alice', 'mystic')
    .add(BOB, 'Bob')
    .add(TEST_OWNER_ID, 'Owner');
  const drawn = new RecordingDraws(made.store);
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles, drawn }),
    raids: raidWebWith(ctx),
  });
  web.clock.now = PARTY_NOW;
  const headers = await web.posting(ALICE, 'Alice');
  const post = async (what: string, body: unknown, sent = headers, partyId = made.party.id) => {
    const answer = await web.app.inject({
      method: 'POST',
      url: change(partyId, what),
      headers: { ...sent, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return {
      status: answer.statusCode,
      json: answer.json<RaidAnswer & { error?: string }>(),
      headers: answer.headers,
    };
  };
  const lines = async (): Promise<string[]> => {
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  return { made, ctx, web, acting, members, headers, post, lines, throttles, drawn };
}

describe('changing a raid on the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it("sets the hatch time as /hatch does: the line in the post, the command's words as text, the raid as it is now", async () => {
    const map = await changing();
    web = map.web;
    const answer = await map.post('hatch', { time: '30' });
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({
      ok: true,
      text: 'Done. It hatches at 2:30 PM and ends at 3:15 PM.',
      raid: { id: map.made.party.id, hatchTime: HATCH, endTime: END, mayChange: true },
    });
    expect(map.made.current().hatchTime).toBe(HATCH);
    expect(await map.lines()).toContain(
      `**Alice** (<@${ALICE}>) set the hatch time: <t:${HATCH / 1000}:t>.`,
    );
  });

  it('sets the end time, the boss and the moves, each as its command', async () => {
    const map = await changing();
    web = map.web;
    expect((await map.post('end', { time: '3:20pm' })).json.text).toBe(
      'Done. It hatches at 2:35 PM and ends at 3:20 PM.',
    );
    expect((await map.post('boss', { boss: 'b:yveltal:T5:0' })).json.text).toBe(
      'The boss is now Yveltal (T5).',
    );
    expect(
      (await map.post('moves', { quick: 'SNARL_FAST', charge: 'dark pulse' })).json,
    ).toMatchObject({
      ok: true,
      text: 'The moves are now Snarl / Dark Pulse.',
    });
    expect(map.made.current().raid).toMatchObject({
      boss: { key: 'yveltal' },
      fastMove: 'SNARL_FAST',
      chargedMove: 'DARK_PULSE',
    });
  });

  it("refuses what the commands' readers refuse, in their words as text, changing nothing", async () => {
    const map = await changing();
    web = map.web;
    const late = await map.post('hatch', { time: '5pm' });
    expect(late.status).toBe(422);
    expect(late.json.text).toMatch(
      /^"5pm" cannot be the time the egg hatches: it must be between \d+:\d\d [AP]M and 3:00 PM\.$/,
    );
    expect((await map.post('moves', { quick: 'snarl' })).json).toEqual({
      ok: false,
      text: 'This raid has no boss yet.',
    });
    expect((await map.post('moves', {})).json.text).toBe(
      'Give the fast move, the charged move, or both.',
    );
    expect(map.made.current().hatchTime).toBeNull();
  });

  // Plan 8M-8B (Matt's ruling, X5): Discord lets anybody in the post change a raid; on the map,
  // anybody it shows the raid to. Who is kept out of its forum is refused before (below).
  it('lets a member who is not signed up change a raid, as anybody in its post may on Discord', async () => {
    const map = await changing({}, { signedUp: false });
    web = map.web;
    const answer = await map.post('hatch', { time: '30' });
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({ ok: true, raid: { mayChange: true } });
    expect(map.made.current().hatchTime).toBe(HATCH);
    const bob = await map.web.posting(BOB, 'Bob');
    expect((await map.post('end', { time: '3:20pm' }, bob)).status).toBe(200);
  });

  it("answers a raid that is over, another server's or no raid at all as the post's buttons do: 409", async () => {
    const map = await changing();
    web = map.web;
    await map.made.service.end(map.made.party.id);
    expect((await map.post('hatch', { time: '30' })).json).toEqual({
      ok: false,
      text: 'This raid is over.',
    });
    const meetup = await map.made.service.createMeetup({
      name: 'Picnic',
      creatorId: ALICE,
      regionChannelId: WEST_CHANNEL,
    });
    if (meetup.kind !== 'created') throw new Error('no meetup');
    const other = await map.post('boss', { boss: 't3' }, map.headers, meetup.party.id);
    expect(other.status).toBe(409);
    expect(other.json.text).toBe('This raid is over.');
  });

  it('counts against the limit of the command it is: ten changes a minute of /hatch, then 429', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < CHANGE_THROTTLE.uses; n++) {
      throttles.use('hatch', ALICE, CHANGE_THROTTLE, PARTY_NOW);
    }
    const map = await changing({}, { throttles });
    web = map.web;
    const over = await map.post('hatch', { time: '30' });
    expect(over.status).toBe(429);
    expect(over.json).toEqual({ error: 'You can do that again in 1 minute.' });
    // /boss has a window of its own.
    expect((await map.post('boss', { boss: 't3' })).status).toBe(200);
    for (let n = 0; n < CHANGE_THROTTLE.uses - 1; n++) {
      throttles.use('moveset', ALICE, CHANGE_THROTTLE, PARTY_NOW);
    }
    await map.post('moves', { quick: 'snarl' });
    expect((await map.post('moves', { quick: 'snarl' })).json.error).toBe(
      'You can do that again in 1 minute.',
    );
  });

  it('gives the use back when the change fails for no fault of the member, as /hatch does', async () => {
    const throttles = new Throttles();
    const map = await changing({}, { throttles });
    web = map.web;
    const setHatchTime = vi
      .spyOn(map.ctx.raids, 'setHatchTime')
      .mockRejectedValue(new Error('the database is away'));
    for (let n = 0; n < CHANGE_THROTTLE.uses; n++) {
      expect((await map.post('hatch', { time: '30' })).status).toBe(500);
    }
    setHatchTime.mockRestore();
    // None of them counted: the next is not throttled.
    expect((await map.post('hatch', { time: '30' })).status).toBe(200);
  });

  it('refuses a member kept out of the forum, an unknown change and a malformed body, without counting them', async () => {
    const map = await changing();
    web = map.web;
    expect((await map.post('duration', { minutes: 30 })).status).toBe(404);
    expect((await map.post('hatch', { time: 30 })).status).toBe(400);
    expect((await map.post('boss', { boss: 't3', time: '30' })).status).toBe(400);
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await map.post('hatch', { time: '30' })).status).toBe(403);
    expect(map.made.current().hatchTime).toBeNull();
    expect(map.throttles.size).toBe(0);
  });

  it('refuses while Discord cannot say how the member stands to the forum, changing and counting nothing', async () => {
    const map = await changing();
    web = map.web;
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const answer = await map.post('hatch', { time: '30' });
    expect(answer.status).toBe(503);
    expect(answer.json).toEqual({ error: UNREACHABLE });
    expect(map.made.current().hatchTime).toBeNull();
    expect(map.throttles.size).toBe(0);
  });

  it("answers a refusal of the raid service in the command's words, naming no post the page cannot open", async () => {
    const map = await changing({ boss: { key: 'yveltal' }, time: { end: at('2026-10-13T14:10') } });
    web = map.web;
    // Over by the clock, then a new raid at the same gym: the first cannot come back beside it.
    map.made.clock.now = at('2026-10-13T14:12');
    web.clock.now = at('2026-10-13T14:12');
    const gym = gymsFixture().get(1);
    if (!gym) throw new Error('no gym 1');
    const standard = await map.made.service.reportRaid({
      gym,
      guildRow: TEST_GUILD_ROW,
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (standard.kind !== 'created') throw new Error(standard.kind);
    await map.made.service.flush();
    const refused = await map.post('end', { time: '2:40pm' });
    expect(refused.status).toBe(422);
    expect(refused.json).toEqual({ ok: false, text: GYM_TAKEN });
    expect(refused.json.text).not.toContain('<#');
    expect(refused.json.text).not.toContain(String(standard.party.forumPostId));
    expect(map.made.current().endTime).toBe(at('2026-10-13T14:10'));
  });

  it("gives the moves of the raid's boss for the form, to members", async () => {
    const map = await changing({ boss: { key: 'yveltal' } });
    web = map.web;
    const url = `/s/${FAKE_GUILD_ID}/api/raids/${map.made.party.id}/moves`;
    const cookie = await map.web.loggedIn(ALICE, 'Alice');
    const answer = await map.web.app.inject({ url, headers: { cookie } });
    expect(answer.statusCode).toBe(200);
    expect(answer.json<RaidMovesView>()).toMatchObject({
      boss: 'Yveltal',
      fast: [
        { id: 'SUCKER_PUNCH_FAST', name: 'Sucker Punch' },
        { id: 'SNARL_FAST', name: 'Snarl' },
        { id: 'GUST_FAST', name: 'Gust' },
      ],
    });
    const stranger = await map.web.loggedIn('200000000000000077', 'Stranger');
    expect((await map.web.app.inject({ url, headers: { cookie: stranger } })).statusCode).toBe(403);
  });

  it('keeps the moves of a raid from a member kept out of its forum, and from anybody while Discord cannot say', async () => {
    const map = await changing({ boss: { key: 'yveltal' } });
    web = map.web;
    const url = `/s/${FAKE_GUILD_ID}/api/raids/${map.made.party.id}/moves`;
    const cookie = await map.web.loggedIn(ALICE, 'Alice');
    const moves = () => map.web.app.inject({ url, headers: { cookie } });
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    const barred = await moves();
    expect(barred.statusCode).toBe(403);
    expect(barred.body).not.toContain('Yveltal');
    map.made.gateway.barred.delete(WEST_FORUM);
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const unreachable = await moves();
    expect(unreachable.statusCode).toBe(503);
    expect(unreachable.body).not.toContain('Yveltal');
    map.made.gateway.failing.delete('memberAccess');
    expect((await moves()).statusCode).toBe(200);
  });

  it('tells the page that every member it shows the raid to may change it', async () => {
    const map = await changing();
    web = map.web;
    const list = async (userId: string, name: string) => {
      const cookie = await map.web.loggedIn(userId, name);
      const answer = await map.web.app.inject({
        url: `/s/${FAKE_GUILD_ID}/api/parties`,
        headers: { cookie },
      });
      return answer.json<PartiesView>().raids[0]?.mayChange;
    };
    expect(await list(ALICE, 'Alice')).toBe(true);
    expect(await list(BOB, 'Bob')).toBe(true);
    expect(await list(TEST_OWNER_ID, 'Owner')).toBe(true);
  });

  it('logs a change as a command is logged: who, where, which raid, what; never a text', async () => {
    const map = await changing();
    web = map.web;
    await map.post('hatch', { time: '2:30pm' });
    const logged = map.web.entries.find((entry) => entry.msg === 'a raid was changed on the map');
    expect(logged).toMatchObject({
      user: ALICE,
      guild: FAKE_GUILD_ID,
      party: map.made.party.id,
      change: 'hatch',
      outcome: 'ok',
    });
    expect(JSON.stringify(logged)).not.toMatch(/2:30pm/u);
  });
  it("answers a raid's Manage… once the post shows it (plan 8M-11A, S1): the ticket taken after the change", async () => {
    const map = await changing();
    web = map.web;
    const id = map.made.party.id;
    const before = map.made.store.get(id);
    expect((await map.post('hatch', { time: '30' })).status).toBe(200);
    // Review fix R1: the ticket taken once the change returned, the party with it.
    expect(map.drawn.waits).toEqual([
      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
    ]);
    expect(map.made.store.get(id)).not.toBe(before);
  });
});
