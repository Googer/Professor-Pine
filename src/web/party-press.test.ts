import { MessageFlags } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID, fakeButton } from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
import {
  createdMeetup,
  createdTrain,
  partyServiceWith,
  reportedMax,
  reportedRaid,
} from '../../test/support/party-service.js';
import {
  FakeActingMembers,
  partyWebWith,
  RecordingDraws,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { createTestContext } from '../../test/support/test-context.js';
import { ACTION_THROTTLE } from '../commands/parties/reply.js';
import { components } from '../components/index.js';
import { controlThrottleKey, InteractionRouter } from '../discord/router.js';
import { Throttles } from '../discord/throttle.js';
import { PartyStatus } from '../domain/party/status.js';
import type { PressAnswer } from '../domain/web/party-data.js';
import { PARTY_KIND } from '../render/party-controls.js';
import type { PartyWebDeps } from './party-routes.js';
import type { WebSettings } from './server.js';
import { PRESS_SHOWN_MS } from './post-drawn.js';
import { textOf } from '../../test/support/messages.js';
import { postMessage } from '../render/party-post.js';

const press = (partyId: string, action: string) =>
  `/s/${FAKE_GUILD_ID}/api/parties/${partyId}/${action}`;

/**
 * A party of the services of a test (`reportedRaid` by default) on the map: Alice a member of
 * the server (in the directory and fetched fresh as `Alice`, team mystic), the web server's
 * clock the parties' own; `changed` replaces parts of what the map is given (`partyWebWith`),
 * `settings` parts of the web settings.
 */
async function onTheMap<M extends Awaited<ReturnType<typeof partyServiceWith>>>(
  made: M,
  throttles = new Throttles(),
  changed: Partial<PartyWebDeps> = {},
  settings: Partial<WebSettings> = {},
) {
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const acting = new FakeActingMembers().add(ALICE, 'Alice', 'mystic').add(BOB, 'Bob');
  const web = webServerWith({
    members,
    parties: { ...partyWebWith(made, { acting, throttles }), ...changed },
    web: settings,
  });
  web.clock.now = PARTY_NOW;
  const headers = await web.posting(ALICE, 'Alice');
  const post = async (url: string, body: unknown = {}, sent = headers) => {
    const answer = await web.app.inject({
      method: 'POST',
      url,
      headers: { ...sent, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return {
      status: answer.statusCode,
      json: answer.json<PressAnswer & { error?: string }>(),
      headers: answer.headers,
    };
  };
  return { made, web, acting, members, headers, post, throttles };
}

describe('pressing the buttons of a party on the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it("signs the member up as the post's Join does: the name and team fetched fresh, the line in the post, the answer in the post's words", async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    const answer = await map.post(press(map.made.party.id, 'join'));
    expect(answer.status).toBe(200);
    // The answer alone: the page asks for the list again after a press.
    expect(answer.json).toEqual({ ok: true, text: 'You are coming.' });
    expect(map.made.current().attendees[ALICE]).toMatchObject({
      status: PartyStatus.Coming,
      name: 'Alice',
      team: 'mystic',
    });
    expect(map.acting.asked).toEqual([`${FAKE_GUILD_ID}:${ALICE}`]);
    await map.made.attendance.flush();
    expect(map.made.said()).toContain('**Alice** (<@200000000000000002>) is coming.');
  });

  it('takes Interested, Here, Leave and Join of a group, each as its button', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    const id = map.made.party.id;
    expect((await map.post(press(id, 'interested'))).json.text).toBe('You are interested.');
    expect((await map.post(press(id, 'here'))).json.text).toBe('You are here.');
    // Signed up already: a group sent with Join is the popup's question, which Alice was not
    // asked; she stays in her group (plan 8X-1B).
    expect((await map.post(press(id, 'join'), { group: 'B' })).json).toMatchObject({
      ok: true,
      text: 'You are coming.',
    });
    expect((await map.post(press(id, 'leave'))).json).toEqual({
      ok: true,
      text: 'You have left this raid.',
    });
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
  });

  it('takes the group a newcomer chose in the popup with Interested and Here as with Join (plan 8X-1B)', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    const id = map.made.party.id;
    await map.made.attendance.newGroup(id, { id: BOB, name: 'Bob' });
    expect((await map.post(press(id, 'interested'), { group: 'A' })).json).toEqual({
      ok: true,
      text: 'You are interested, in group A.',
    });
    // Signed up meanwhile: the status in their own group, as the post's dialog decides.
    expect((await map.post(press(id, 'here'), { group: 'B' })).json).toEqual({
      ok: true,
      text: 'You are here, in group A.',
    });
    expect(map.made.current().attendees[ALICE]).toMatchObject({ group: 'A' });
    // So does Join: its group is the popup's question, not a move (Group… moves).
    expect((await map.post(press(id, 'join'), { group: 'B' })).json).toEqual({
      ok: true,
      text: 'You are coming, in group A.',
    });
    expect((await map.post(press(id, 'leave'), { group: 'A' })).status).toBe(400);
    expect((await map.post(press(id, 'done'), { group: 'A' })).status).toBe(400);
  });

  // Final review, G6: a max battle's id takes the presses its post's buttons take.
  it("takes Join and Done on a max battle as its post's buttons", async () => {
    const map = await onTheMap(await reportedMax());
    web = map.web;
    const id = map.made.party.id;
    expect((await map.post(press(id, 'join'))).json).toEqual({ ok: true, text: 'You are coming.' });
    expect(map.made.current().attendees[ALICE]).toMatchObject({ status: PartyStatus.Coming });
    const done = await map.post(press(id, 'done'));
    expect(done.status).toBe(200);
    expect(done.json).toEqual({ ok: true, text: 'You are done.' });
    expect(map.made.current().attendees[ALICE]).toMatchObject({ status: PartyStatus.Complete });
  });

  // Plan 8X-5: the post's Remote switch, for every party whose post has it.
  it("switches Remote as the post's button does: on, signing a newcomer up, and off again", async () => {
    const map = await onTheMap(await reportedMax());
    web = map.web;
    const id = map.made.party.id;
    const on = await map.post(press(id, 'remote'));
    expect(on).toMatchObject({ status: 200, json: { ok: true } });
    expect(on.json.text).toMatch(/remote/i);
    expect(map.made.current().attendees[ALICE]).toMatchObject({
      status: PartyStatus.Interested,
      remote: true,
      name: 'Alice',
    });
    const off = await map.post(press(id, 'remote'));
    expect(off.json.text).toMatch(/in person/i);
    expect(map.made.current().attendees[ALICE]?.remote).toBe(false);
    expect(map.web.entries).toContainEqual(
      expect.objectContaining({ msg: 'a party was pressed on the map', action: 'remote' }),
    );
  });

  // Plan 8M-8B: +1 and −1, as the post's buttons (`moreWords`), in the window of its controls.
  it("takes +1 and −1 as the post's buttons: a newcomer signed up, the count, the most one may bring", async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    const id = map.made.party.id;
    expect((await map.post(press(id, 'less'))).json).toEqual({
      ok: false,
      text: 'You are not signed up for this raid.',
    });
    expect((await map.post(press(id, 'more'))).json).toEqual({
      ok: true,
      text: 'You are interested.',
    });
    expect((await map.post(press(id, 'more'))).json.text).toBe('You are interested with 1 more.');
    expect((await map.post(press(id, 'less'))).json.text).toBe('You are interested.');
    expect(map.made.current().attendees[ALICE]).toMatchObject({ number: 1, name: 'Alice' });
    expect((await map.post(press(id, 'more'), { group: 'A' })).status).toBe(400);
    expect(map.web.entries).toContainEqual(
      expect.objectContaining({ msg: 'a party was pressed on the map', action: 'more' }),
    );
  });

  it('counts +1 against the limit of the buttons of the post', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < ACTION_THROTTLE.uses; n++) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const map = await onTheMap(await reportedRaid(), throttles);
    web = map.web;
    expect((await map.post(press(map.made.party.id, 'more'))).status).toBe(429);
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
  });

  // Plan 8M-8B: the completion question, answered on the map as its buttons answer it.
  it('answers the completion question as "Yes, done" and "Not yet" do', async () => {
    const map = await onTheMap(await reportedRaid({ boss: { key: 'yveltal' } }));
    web = map.web;
    const id = map.made.party.id;
    const bob = { id: BOB, name: 'Bob' };
    await map.post(press(id, 'here'));
    await map.made.attendance.signUp(id, bob, PartyStatus.Present);
    await map.made.attendance.done(id, bob);
    await map.made.attendance.flush();
    expect(map.made.current().attendees[ALICE]?.status).toBe(PartyStatus.CompletePending);
    expect((await map.post(press(id, 'answer'))).status).toBe(400);
    expect((await map.post(press(id, 'answer'), { yes: false })).json).toEqual({
      ok: true,
      text: 'You are here.',
    });
    expect(map.made.current().attendees[ALICE]?.status).toBe(PartyStatus.Present);
    expect((await map.post(press(id, 'answer'), { yes: true })).json).toMatchObject({
      text: 'You were not asked, or you have answered already.',
    });
  });

  it("refuses Remote on an elite raid in the post's words, and a Remote with a group", async () => {
    const map = await onTheMap(await reportedRaid({ tier: { level: 'Elite', shadow: false } }));
    web = map.web;
    const id = map.made.party.id;
    const refused = await map.post(press(id, 'remote'));
    expect(refused).toMatchObject({
      status: 422,
      json: { ok: false, text: 'Elite raids can only be done in person.' },
    });
    expect((await map.post(press(id, 'remote'), { group: 'A' })).status).toBe(400);
  });

  it('switches Remote on a meetup and a train too, as their posts offer it', async () => {
    for (const made of [await createdMeetup(), await createdTrain()]) {
      const map = await onTheMap(made);
      web = map.web;
      const on = await map.post(press(made.party.id, 'remote'));
      expect(on).toMatchObject({ status: 200, json: { ok: true } });
      expect(made.store.get(made.party.id)?.attendees[ALICE]).toMatchObject({ remote: true });
      await web.app.close();
      web = undefined;
    }
  });

  it('counts Remote against the limit of the buttons of the post', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < ACTION_THROTTLE.uses; n++) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const map = await onTheMap(await reportedRaid(), throttles);
    web = map.web;
    expect((await map.post(press(map.made.party.id, 'remote'))).status).toBe(429);
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
  });

  it("answers Done on an egg with the post's refusal", async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    const answer = await map.post(press(map.made.party.id, 'done'));
    expect(answer.status).toBe(422);
    expect(answer.json).toMatchObject({ ok: false, text: 'This raid has not hatched yet.' });
  });

  it('lets the member into a forum they cannot see, as signing up on a copy does, and out again', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    map.made.gateway.shutOut(WEST_FORUM, ALICE);
    await map.post(press(map.made.party.id, 'join'));
    await map.made.access.flush();
    expect(map.made.gateway.admitted.get(WEST_FORUM)?.has(ALICE)).toBe(true);
    await map.post(press(map.made.party.id, 'leave'));
    await map.made.access.flush();
    expect(map.made.gateway.admitted.get(WEST_FORUM)?.has(ALICE)).toBe(false);
  });

  // Plan 8Z-2: asked by the attendance service, for a newcomer alone, as for a press on Discord.
  it('refuses a newcomer somebody keeps out of the forum in the post’s words, and changes nothing', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    const answer = await map.post(press(map.made.party.id, 'join'));
    expect(answer).toMatchObject({
      status: 422,
      json: { ok: false, text: 'You cannot sign up for this raid: you are kept out of its forum.' },
    });
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
  });

  it('lets a member who is signed up leave, also once somebody keeps them out or Discord cannot say', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    expect((await map.post(press(map.made.party.id, 'join'))).status).toBe(200);
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await map.post(press(map.made.party.id, 'here'))).status).toBe(200);
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    expect((await map.post(press(map.made.party.id, 'leave'))).status).toBe(200);
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
    // A newcomer again, and Discord cannot say: refused, to try again.
    const again = await map.post(press(map.made.party.id, 'join'));
    expect(again).toMatchObject({
      status: 422,
      json: {
        ok: false,
        text: 'I could not check with Discord just now whether you may do that. Try again in a moment.',
      },
    });
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
  });

  it('lets a newcomer in whom the forum is only hidden from', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    map.made.gateway.shutOut(WEST_FORUM, ALICE);
    expect((await map.post(press(map.made.party.id, 'join'))).status).toBe(200);
    await map.made.access.flush();
    expect(map.made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
  });

  it('answers a party that has ended as its button would, never reading it from the database', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    await map.made.service.end(map.made.party.id);
    // The party has left the store: what kind it was is known only from what only a raid has,
    // which no press of the map is (Done is a max battle's too: plan 8X-3, review B6).
    const raid = await map.post(press(map.made.party.id, 'join'));
    expect(raid.status).toBe(409);
    expect(raid.json).toEqual({ ok: false, text: 'This has ended.' });
    expect((await map.post(press(map.made.party.id, 'done'))).json.text).toBe('This has ended.');
    expect((await map.post(press('00000000-0000-4000-8000-00000000ffff', 'here'))).json.text).toBe(
      'This has ended.',
    );
  });

  it('answers a party of another server in the store as one that has ended, changing nothing', async () => {
    const made = await reportedRaid();
    // The store's raid is of the server with row 1; this server is row 2.
    const map = await onTheMap(made, new Throttles(), {
      guilds: { idFor: () => Promise.resolve(2) },
    });
    web = map.web;
    const answer = await map.post(press(made.party.id, 'join'));
    expect(answer.status).toBe(409);
    expect(answer.json).toMatchObject({ ok: false, text: 'This has ended.' });
    expect(made.current().attendees[ALICE]).toBeUndefined();
  });

  it('answers a party that ends between the check and the press as its button would: 409', async () => {
    const made = await reportedRaid();
    // The party ends while its forum is looked at (by the attendance service, plan 8Z-2), after
    // the route found it in the store.
    const look = made.gateway.memberAccess.bind(made.gateway);
    vi.spyOn(made.gateway, 'memberAccess').mockImplementation(async (forumId, memberId) => {
      await made.service.end(made.party.id);
      return look(forumId, memberId);
    });
    const map = await onTheMap(made);
    web = map.web;
    const answer = await map.post(press(made.party.id, 'join'));
    expect(answer.status).toBe(409);
    expect(answer.json).toMatchObject({ ok: false, text: 'This has ended.' });
    const logged = map.web.entries.find((entry) => entry.msg === 'a party was pressed on the map');
    expect(logged).toMatchObject({ action: 'join', outcome: 'gone' });
  });

  // Plan 8Z-2: the attendance service asks, and refuses as a button of the post would (the press
  // counted, as there).
  it("refuses a newcomer while Discord cannot say how they stand to the party's forum: nothing written", async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    const url = (action: string) => press(map.made.party.id, action);
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const answer = await map.post(url('join'));
    expect(answer).toMatchObject({
      status: 422,
      json: {
        ok: false,
        text: 'I could not check with Discord just now whether you may do that. Try again in a moment.',
      },
    });
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
    map.made.gateway.failing.delete('memberAccess');
    expect((await map.post(url('join'))).status).toBe(200);
  });

  it("answers a party of the meetup's kind in its own words", async () => {
    const map = await onTheMap(await createdMeetup());
    web = map.web;
    const id = map.made.party.id;
    expect((await map.post(press(id, 'join'))).json.text).toBe('You are coming.');
    expect((await map.post(press(id, 'leave'))).json.text).toBe('You have left this meetup.');
  });

  it('counts against the same limit as the buttons of the post', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < ACTION_THROTTLE.uses; n++) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const map = await onTheMap(await reportedRaid(), throttles);
    web = map.web;
    const answer = await map.post(press(map.made.party.id, 'join'));
    expect(answer.status).toBe(429);
    expect(answer.json.error).toBe('That was a lot of clicks. Try again in 1 minute.');
    expect(answer.headers['retry-after']).toBe('60');
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
  });

  it('gives the use back when a press fails for no fault of the member, as a button of the post does', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < ACTION_THROTTLE.uses - 1; n++) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const map = await onTheMap(await reportedRaid(), throttles);
    web = map.web;
    const update = vi
      .spyOn(map.made.store, 'update')
      .mockRejectedValue(new Error('the database is away'));
    expect((await map.post(press(map.made.party.id, 'join'))).status).toBe(500);
    update.mockRestore();
    expect((await map.post(press(map.made.party.id, 'join'))).status).toBe(200);
  });

  it('counts only the presses it carries out: one refused for who presses does not use the budget', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < ACTION_THROTTLE.uses - 1; n++) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const map = await onTheMap(await reportedRaid(), throttles);
    web = map.web;
    const url = (action: string) => press(map.made.party.id, action);
    map.acting.remove(ALICE);
    expect((await map.post(url('join'))).status).toBe(403);
    map.acting.add(ALICE, 'Alice', 'mystic');
    expect((await map.post(url('join'))).status).toBe(200);
    expect((await map.post(url('here'))).status).toBe(429);
  });

  // Plan 8Z-2: a newcomer kept out of the forum is the attendance service's to refuse, once the
  // press is counted, as a press of the post's button is on Discord.
  it('counts the press of a newcomer somebody keeps out of the forum, as the post’s button does', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < ACTION_THROTTLE.uses - 1; n++) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const map = await onTheMap(await reportedRaid(), throttles);
    web = map.web;
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await map.post(press(map.made.party.id, 'join'))).status).toBe(422);
    expect((await map.post(press(map.made.party.id, 'join'))).status).toBe(429);
  });

  it('tells somebody who is not a member nothing of a party id: ended or unknown, 403', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    await map.made.service.end(map.made.party.id);
    map.acting.remove(ALICE);
    expect((await map.post(press(map.made.party.id, 'join'))).status).toBe(403);
    expect((await map.post(press('00000000-0000-4000-8000-00000000ffff', 'join'))).status).toBe(
      403,
    );
  });

  it('asks the member directory first: somebody it says is no member is refused without a fetch from Discord', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    map.members.remove(ALICE);
    expect((await map.post(press(map.made.party.id, 'join'))).status).toBe(403);
    expect((await map.post(press('00000000-0000-4000-8000-00000000ffff', 'join'))).status).toBe(
      403,
    );
    expect(map.members.asked).toEqual([`${FAKE_GUILD_ID}:${ALICE}`, `${FAKE_GUILD_ID}:${ALICE}`]);
    expect(map.acting.asked).toEqual([]);
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
  });

  it("refuses a member without the map's member role as a non-member, by the directory and fresh, without counting it", async () => {
    const throttles = new Throttles();
    for (let n = 0; n < ACTION_THROTTLE.uses - 1; n++) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const map = await onTheMap(await reportedRaid(), throttles, {}, { memberRole: 'Verified' });
    web = map.web;
    const url = press(map.made.party.id, 'join');
    const unverified = { roleNames: ['Trainer'], administrator: false };
    const verified = { roleNames: ['Verified'], administrator: false };
    // The directory says Alice lacks the role: refused before Discord is asked afresh.
    map.members.standing(ALICE, unverified);
    expect(await map.post(url)).toMatchObject({ status: 403, json: { error: 'Not allowed.' } });
    expect(map.acting.asked).toEqual([]);
    // The directory saw the role (a minute ago), but she has lost it since.
    map.members.standing(ALICE, verified);
    map.acting.standing(ALICE, unverified);
    expect(await map.post(url)).toMatchObject({ status: 403, json: { error: 'Not allowed.' } });
    expect(map.acting.asked).toEqual([`${FAKE_GUILD_ID}:${ALICE}`]);
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
    // An administrator needs no role; neither refusal was counted.
    map.acting.standing(ALICE, { roleNames: [], administrator: true });
    expect((await map.post(url)).status).toBe(200);
    expect((await map.post(press(map.made.party.id, 'here'))).status).toBe(429);
  });

  it('refuses a member who is timed out, or has not finished the membership screening, without counting it', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < ACTION_THROTTLE.uses - 1; n++) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const map = await onTheMap(await reportedRaid(), throttles);
    web = map.web;
    const url = press(map.made.party.id, 'join');
    map.acting.holdBack(ALICE, 'timed-out');
    expect(await map.post(url)).toMatchObject({
      status: 403,
      json: { error: 'You are timed out in this server, so you cannot do that now.' },
    });
    map.acting.holdBack(ALICE, 'pending');
    expect(await map.post(url)).toMatchObject({
      status: 403,
      json: { error: "Finish this server's membership screening first." },
    });
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
    map.acting.add(ALICE, 'Alice', 'mystic');
    expect((await map.post(url)).status).toBe(200);
    expect((await map.post(press(map.made.party.id, 'here'))).status).toBe(429);
  });

  it('refuses while the member directory cannot ask Discord, asking nothing more', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    map.members.failing = new Error('Discord is away');
    const answer = await map.post(press(map.made.party.id, 'join'));
    expect(answer.status).toBe(503);
    expect(answer.json.error).toBe(
      'Discord cannot be reached just now, so nothing can be changed. Try again in a moment.',
    );
    expect(map.acting.asked).toEqual([]);
  });

  it("uses up the budget of the post's buttons: the router refuses a click after 30 presses", async () => {
    const throttles = new Throttles();
    const map = await onTheMap(await reportedRaid(), throttles);
    web = map.web;
    const { ctx } = createTestContext();
    const router = new InteractionRouter(ctx, [], components, { now: () => PARTY_NOW, throttles });
    for (let n = 0; n < ACTION_THROTTLE.uses; n++) {
      expect((await map.post(press(map.made.party.id, n % 2 ? 'join' : 'interested'))).status).toBe(
        200,
      );
    }
    const click = fakeButton({ customId: `party:${map.made.party.id}:join`, userId: ALICE });
    await router.handle(click as never);
    expect(click.reply).toHaveBeenCalledWith({
      content: 'That was a lot of clicks. Try again in 1 minute.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it("gives the post's answer as plain text: what a member wrote reads as they wrote it", async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    const id = map.made.party.id;
    const bob = { id: BOB, name: 'Bob' };
    const label = '1. north_hills `gate` <3 @everyone';
    await map.made.attendance.signUp(id, bob, PartyStatus.Coming);
    await map.made.attendance.newGroup(id, bob);
    await map.made.attendance.labelGroup(id, bob, label);
    const answer = await map.post(press(id, 'join'), { group: 'B' });
    expect(answer.json).toMatchObject({ ok: true, text: `You are coming, in group B (${label}).` });
  });

  it('is refused without the session, its CSRF token or Pine as its origin, before anything is asked', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    const url = press(map.made.party.id, 'join');
    const { origin: _origin, ...noOrigin } = map.headers;
    const { 'x-pine-csrf': _csrf, ...noToken } = map.headers;
    expect((await map.post(url, {}, noOrigin)).status).toBe(403);
    expect((await map.post(url, {}, noToken)).status).toBe(403);
    expect(
      (await map.post(url, {}, { ...map.headers, origin: 'https://evil.example' })).status,
    ).toBe(403);
    expect(map.acting.asked).toEqual([]);
    expect(map.members.asked).toEqual([]);
  });

  it('refuses an action the post has not, a malformed body, and a member who left the server', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    const id = map.made.party.id;
    // +1 is one since plan 8M-8B; Split… is not.
    expect((await map.post(press(id, 'split'))).status).toBe(404);
    expect((await map.post(press(id, 'join'), { group: 'Z' })).status).toBe(400);
    expect((await map.post(press(id, 'join'), { group: 'A', more: 1 })).status).toBe(400);
    map.acting.remove(ALICE);
    expect((await map.post(press(id, 'join'))).status).toBe(403);
  });

  it('refuses while Discord cannot be reached: nothing is changed on roles nobody checked', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    map.acting.failing = new Error('Discord is away');
    const answer = await map.post(press(map.made.party.id, 'join'));
    expect(answer.status).toBe(503);
    expect(answer.json.error).toBe(
      'Discord cannot be reached just now, so nothing can be changed. Try again in a moment.',
    );
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
  });

  it('logs a press as a command is logged: who, where, which party, what; never a text', async () => {
    const map = await onTheMap(await reportedRaid());
    web = map.web;
    await map.post(press(map.made.party.id, 'join'));
    const logged = map.web.entries.find((entry) => entry.msg === 'a party was pressed on the map');
    expect(logged).toMatchObject({
      user: ALICE,
      guild: FAKE_GUILD_ID,
      party: map.made.party.id,
      action: 'join',
      outcome: 'ok',
    });
    expect(JSON.stringify(logged)).not.toContain('Alice');
  });
  it('answers once the post shows the press (plan 8M-11A, S1): the map then gets the post with it', async () => {
    // A quiet party: the press's draw starts at once; its edit is held on its way to Discord.
    const made = await reportedRaid({}, { renderDelayMs: 0 });
    const edit = made.gateway.editPost.bind(made.gateway);
    let release: () => void = () => undefined;
    let tell: () => void = () => undefined;
    const asked = new Promise<void>((resolve) => {
      tell = resolve;
    });
    vi.spyOn(made.gateway, 'editPost').mockImplementationOnce(async (...args) => {
      tell();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return edit(...args);
    });
    const map = await onTheMap(made, new Throttles(), { drawn: made.service });
    web = map.web;
    let answered = false;
    const answering = map.post(press(made.party.id, 'join')).then((answer) => {
      answered = true;
      return answer;
    });
    await asked;
    expect(answered).toBe(false);
    release();
    expect((await answering).json).toEqual({ ok: true, text: 'You are coming.' });
    const layout = made.service.layoutOf(made.party.id);
    expect(layout === undefined ? '' : textOf(postMessage(layout))).toContain('Alice');
    await made.service.flush();
  });

  it('takes the draw ticket after the press and waits at most PRESS_SHOWN_MS; a refusal waits for nothing', async () => {
    const made = await reportedRaid();
    const drawn = new RecordingDraws(made.store);
    const map = await onTheMap(made, new Throttles(), { drawn });
    web = map.web;
    await map.post(press(made.party.id, 'join'));
    expect(drawn.waits).toHaveLength(1);
    expect(drawn.waits[0]).toMatchObject({ partyId: made.party.id, maxMs: PRESS_SHOWN_MS });
    // Review fix R1: the ticket taken once the press returned, with Alice signed up.
    expect(drawn.waits[0]?.at?.attendees[ALICE]).toBeDefined();
    expect((await map.post(press(made.party.id, 'done'))).status).toBe(422);
    expect(drawn.waits).toHaveLength(1);
  });
});
