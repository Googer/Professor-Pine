import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESS_SHOWN_MS } from './post-drawn.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, MINUTE, PARTY_NOW } from '../../test/support/parties.js';
import { reportedMax, reportedRaid } from '../../test/support/party-service.js';
import {
  FakeActingMembers,
  partyWebWith,
  webServerWith,
  type TestWeb,
  RecordingDraws,
} from '../../test/support/web.js';
import { MEET_THROTTLE } from '../commands/parties/meet.js';
import { variedThrottleKey } from '../discord/router.js';
import { Throttles } from '../discord/throttle.js';
import { PartyStatus } from '../domain/party/status.js';
import type { MapMeet, PressAnswer } from '../domain/web/party-data.js';

const HATCH = PARTY_NOW + 30 * MINUTE;
const MEET_KEY = variedThrottleKey('meet', MEET_THROTTLE);

beforeEach(() => {
  // The attendance service reads the clock (as Meet…'s Submit does on Discord).
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * An egg hatching in half an hour (or `made`), Alice coming, on the map: Alice and Bob members of
 * the server; the web server's clock the parties' own.
 */
async function meeting(
  made?: Awaited<ReturnType<typeof reportedRaid>> | Awaited<ReturnType<typeof reportedMax>>,
  throttles = new Throttles(),
) {
  const party = made ?? (await reportedRaid({ time: { hatch: HATCH } }));
  const id = party.party.id;
  await party.attendance.signUp(id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const acting = new FakeActingMembers().add(ALICE, 'Alice').add(BOB, 'Bob');
  const drawn = new RecordingDraws(party.store);
  const web = webServerWith({
    members,
    parties: partyWebWith(party, { acting, throttles, drawn }),
  });
  web.clock.now = PARTY_NOW;
  const headers = await web.posting(ALICE, 'Alice');
  const url = `/s/${FAKE_GUILD_ID}/api/parties/${id}/meet`;
  const open = async (userId = ALICE, name = 'Alice') => {
    const answer = await web.app.inject({
      url,
      headers: { cookie: await web.loggedIn(userId, name) },
    });
    return { status: answer.statusCode, json: answer.json<MapMeet & { error?: string }>() };
  };
  const set = async (body: unknown, sent = headers) => {
    const answer = await web.app.inject({
      method: 'POST',
      url,
      headers: { ...sent, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return { status: answer.statusCode, json: answer.json<PressAnswer & { error?: string }>() };
  };
  return { made: party, id, web, open, set, throttles, drawn };
}

describe('Meet… on the map (plan 8M-8B)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it("offers the times of the post's Meet… for the member's group, with the dialog's words", async () => {
    const map = await meeting();
    web = map.web;
    const { status, json } = await map.open();
    expect(status).toBe(200);
    expect(json).toMatchObject({
      title: 'Meeting time',
      text: 'For your group: everybody in it is told.',
      label: 'When does your group meet?',
      group: 'A',
      set: null,
      // The hatch, the most common meeting time, chosen to start with.
      picked: HATCH,
    });
    expect(json.stamp).toMatch(/\S/u);
    // Nothing before the hatch: a meeting time lies between the hatch and the end.
    expect(json.times[0]).toEqual({ at: HATCH, rsvp: true, hatch: true });
    expect(json.times).toContainEqual({ at: HATCH + 5 * MINUTE, rsvp: false });
    expect(json.times).toContainEqual({ at: HATCH + 15 * MINUTE, rsvp: true });
  });

  it('refuses at the opening what Meet… refuses at the press, in its words', async () => {
    const map = await meeting();
    web = map.web;
    const bob = await map.open(BOB, 'Bob');
    expect(bob).toEqual({ status: 422, json: { error: 'You are not signed up for this raid.' } });
    const noTimes = await meeting(await reportedRaid());
    web = noTimes.web;
    await map.web.app.close();
    expect((await noTimes.open()).json).toEqual({
      error: 'This raid has no times yet: press "Set time…" to give them.',
    });
  });

  it("refuses to open while /meet's window is full, counting nothing", async () => {
    const throttles = new Throttles();
    for (let n = 0; n < MEET_THROTTLE.uses; n++) {
      throttles.use(MEET_KEY, ALICE, MEET_THROTTLE, PARTY_NOW);
    }
    const map = await meeting(undefined, throttles);
    web = map.web;
    const refused = await map.open();
    expect(refused).toEqual({
      status: 429,
      json: { error: 'You can do that again in 1 minute.' },
    });
  });

  it("sets the group's meeting time as Meet…'s Submit does, in /meet's words, once in its window", async () => {
    const throttles = new Throttles();
    for (let n = 0; n < MEET_THROTTLE.uses - 1; n++) {
      throttles.use(MEET_KEY, ALICE, MEET_THROTTLE, PARTY_NOW);
    }
    const map = await meeting(undefined, throttles);
    web = map.web;
    const { json: offered } = await map.open();
    const answer = await map.set({ group: offered.group, stamp: offered.stamp, time: HATCH });
    expect(answer).toEqual({
      status: 200,
      // The reporter is in the group too.
      json: {
        ok: true,
        text: 'The meeting time of your group is 2:30 PM (in 30 minutes). I have told the others.',
      },
    });
    expect(map.made.store.get(map.id)?.groups[0]?.startTime).toBe(HATCH);
    expect((await map.set({ group: 'A', stamp: offered.stamp, time: null })).status).toBe(429);
  });

  // Review B-3: a raid over by the clock (the store not through with it yet) is gone, 409, as a
  // party the store no longer has is.
  it('answers the Submit for a raid that is over as gone: 409', async () => {
    const map = await meeting();
    web = map.web;
    const { json: offered } = await map.open();
    map.web.clock.now = PARTY_NOW + 24 * 60 * MINUTE;
    vi.setSystemTime(PARTY_NOW + 24 * 60 * MINUTE);
    const answer = await map.set({ group: offered.group, stamp: offered.stamp, time: HATCH });
    expect(answer.status).toBe(409);
    expect(answer.json.ok).toBe(false);
  });

  it('refuses a group that changed meanwhile and a time no longer offered, as the dialog says it', async () => {
    const map = await meeting();
    web = map.web;
    const { json: offered } = await map.open();
    expect((await map.set({ group: 'A', stamp: 'x0', time: HATCH })).json).toEqual({
      ok: false,
      text: 'Group A has changed since: press Meet… again.',
    });
    expect(
      (await map.set({ group: 'A', stamp: offered.stamp, time: HATCH + MINUTE })).json,
    ).toEqual({ ok: false, text: 'That time is no longer offered: press Meet… again.' });
    expect((await map.set({ group: 'A', stamp: offered.stamp })).status).toBe(400);
  });

  // Plan 8Z-2, fix round F-A3: who is signed up changes their own group's time whatever the forum
  // says, as Meet… on Discord; whether a newcomer is kept out is the attendance service's to ask.
  it('lets a member signed up whom somebody keeps out of the forum since open and submit Meet…, as on Discord', async () => {
    const map = await meeting();
    web = map.web;
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE, BOB]));
    const { status, json: offered } = await map.open();
    expect(status).toBe(200);
    const answer = await map.set({ group: offered.group, stamp: offered.stamp, time: HATCH });
    expect(answer).toMatchObject({ status: 200, json: { ok: true } });
    expect(map.made.store.get(map.id)?.groups[0]?.startTime).toBe(HATCH);
    // Bob, not signed up, is told so, as Meet… tells him.
    expect(await map.open(BOB, 'Bob')).toEqual({
      status: 422,
      json: { error: 'You are not signed up for this raid.' },
    });
  });

  it('serves a max battle too: the five-minute times up to its end', async () => {
    const map = await meeting(await reportedMax());
    web = map.web;
    const { status, json } = await map.open();
    expect(status).toBe(200);
    expect(json.times[0]).toEqual({ at: PARTY_NOW + 5 * MINUTE, rsvp: false });
    expect(json.times.every((time) => !time.rsvp)).toBe(true);
  });
  it("answers Meet…'s Submit once the post shows it (plan 8M-11A, S1): the ticket taken after the change", async () => {
    const map = await meeting();
    web = map.web;
    const id = map.made.party.id;
    const before = map.made.store.get(id);
    const { json: offered } = await map.open();
    const answer = await map.set({ group: offered.group, stamp: offered.stamp, time: HATCH });
    expect(answer.status).toBe(200);
    // Review fix R1: the ticket taken once the change returned, the party with it.
    expect(map.drawn.waits).toEqual([
      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
    ]);
    expect(map.made.store.get(id)).not.toBe(before);
  });
});
