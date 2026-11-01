import { afterEach, describe, expect, it } from 'vitest';
import { PRESS_SHOWN_MS } from './post-drawn.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import {
  FakeActingMembers,
  partyWebWith,
  webServerWith,
  type TestWeb,
  RecordingDraws,
} from '../../test/support/web.js';
import { ACTION_THROTTLE } from '../commands/parties/reply.js';
import { controlThrottleKey } from '../discord/router.js';
import { Throttles } from '../discord/throttle.js';
import { groupStamp } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { PartiesView, PressAnswer } from '../domain/web/party-data.js';
import { PARTY_KIND } from '../render/party-controls.js';

const MINUTE = 60_000;
const HATCH = PARTY_NOW + 30 * MINUTE;

/**
 * A raid with times (it hatches in half an hour) of two groups on the map: the reporter in A, Bob
 * alone in B (he opened it), Alice coming in A unless `signedUp` is false. Alice and Bob are
 * members of the server, fetched fresh by name; the web server's clock is the parties' own.
 */
async function grouped(
  options: { signedUp?: boolean; throttles?: Throttles; oneGroup?: boolean } = {},
) {
  const made = await reportedRaid({ time: { hatch: HATCH } });
  const id = made.party.id;
  if (options.oneGroup !== true) await made.attendance.newGroup(id, { id: BOB, name: 'Bob' });
  if (options.signedUp !== false) {
    await made.attendance.signUp(id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming, {
      group: 'A',
    });
  }
  const throttles = options.throttles ?? new Throttles();
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const acting = new FakeActingMembers().add(ALICE, 'Alice').add(BOB, 'Bob');
  const drawn = new RecordingDraws(made.store);
  const web = webServerWith({ members, parties: partyWebWith(made, { acting, throttles, drawn }) });
  web.clock.now = PARTY_NOW;
  const headers = await web.posting(ALICE, 'Alice');
  const stampOf = (group: 'A' | 'B'): string => {
    const found = made.current().groups.find((one) => one.id === group);
    if (!found) throw new Error(`no group ${group}`);
    return groupStamp(made.current(), found);
  };
  const regroup = async (body: unknown, sent = headers) => {
    const answer = await web.app.inject({
      method: 'POST',
      url: `/s/${FAKE_GUILD_ID}/api/parties/${id}/regroup`,
      headers: { ...sent, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return { status: answer.statusCode, json: answer.json<PressAnswer & { error?: string }>() };
  };
  const listed = async (userId = ALICE, name = 'Alice') => {
    const cookie = await web.loggedIn(userId, name);
    const answer = await web.app.inject({
      url: `/s/${FAKE_GUILD_ID}/api/parties`,
      headers: { cookie },
    });
    return answer.json<PartiesView>().raids[0]?.attendance;
  };
  return { made, id, web, acting, headers, stampOf, regroup, listed, throttles, drawn };
}

describe('Group… on the map (plan 8M-8B)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it("gives a member signed up Group…'s choices with the list: the other groups by letter and stamp, their size, the meeting time as a moment", async () => {
    const map = await grouped();
    web = map.web;
    await map.made.attendance.setMeetingTime(map.id, { id: BOB, name: 'Bob' }, HATCH);
    // A new group is a way on Discord, not on the map ("Start a new group on Discord"): the move
    // to B is the one way here, said as the dialog says a single way.
    expect((await map.listed())?.regroup).toEqual({
      title: 'Change group',
      text: "You're in group A. Submit moves you to group B.",
      label: 'Move to',
      signedUp: true,
      choices: [
        {
          group: 'B',
          stamp: map.stampOf('B'),
          label: 'Group B',
          size: '1 trainer',
          meeting: HATCH,
        },
      ],
      newGroup: true,
    });
    // Bob, in B: group A, which has no meeting time.
    expect((await map.listed(BOB, 'Bob'))?.regroup).toMatchObject({
      choices: [{ group: 'A', size: '2 trainers', meeting: null }],
    });
  });

  it('offers no new group where Discord offers none: a member alone in a plain group of their own', async () => {
    const map = await grouped();
    web = map.web;
    expect((await map.listed(BOB, 'Bob'))?.regroup).toMatchObject({
      text: "You're in group B. Submit moves you to group A.",
      newGroup: false,
    });
  });

  // Review W-1: where a new group is the only way, the map has nothing to submit: Group… sends the
  // member to the post on Discord.
  it('sends Group… to Discord where a new group is the only way left', async () => {
    const map = await grouped({ oneGroup: true });
    web = map.web;
    expect((await map.listed())?.regroup).toEqual({ onlyNewGroup: true });
  });

  it('refuses at the list what Group… refuses at the press: a member who has completed the raid', async () => {
    const map = await grouped();
    web = map.web;
    await map.made.store.update(map.id, (party) => ({
      party: {
        ...party,
        attendees: {
          ...party.attendees,
          [ALICE]: { number: 1, status: PartyStatus.Complete, group: 'A', remote: false },
        },
      },
    }));
    expect((await map.listed())?.regroup).toEqual({
      refused: 'You are done with this raid. Use Join or Here if you are back.',
    });
  });

  it("moves the member to the group picked as Group…'s Submit does: by its stamp, in the post's words", async () => {
    const map = await grouped();
    web = map.web;
    const answer = await map.regroup({ group: 'B', stamp: map.stampOf('B'), signedUp: true });
    expect(answer).toEqual({
      status: 200,
      json: { ok: true, text: 'You are coming, in group B.' },
    });
    expect(map.made.current().attendees[ALICE]).toMatchObject({ group: 'B', name: 'Alice' });
  });

  it('refuses a group that changed since the form was drawn, and a member who left meanwhile, in their words', async () => {
    const map = await grouped();
    web = map.web;
    const stale = await map.regroup({ group: 'B', stamp: 'x0', signedUp: true });
    expect(stale).toEqual({
      status: 422,
      json: { ok: false, text: 'Group B has changed since: press Group… again.' },
    });
    const stamp = map.stampOf('B');
    await map.made.attendance.leave(map.id, { id: ALICE });
    const left = await map.regroup({ group: 'B', stamp, signedUp: true });
    expect(left.json).toEqual({
      ok: false,
      text: 'You are no longer signed up: press Group… again.',
    });
    expect(map.made.current().attendees[ALICE]).toBeUndefined();
  });

  it('signs a newcomer up as coming in the group picked, as "Join a group" does', async () => {
    const map = await grouped({ signedUp: false });
    web = map.web;
    expect((await map.listed())?.regroup).toMatchObject({
      title: 'Join a group',
      text: 'You join as coming, in the group you pick.',
      signedUp: false,
      label: 'Join',
      choices: [{ group: 'A' }, { group: 'B' }],
      newGroup: true,
    });
    const answer = await map.regroup({ group: 'A', stamp: map.stampOf('A'), signedUp: false });
    expect(answer.json).toEqual({ ok: true, text: 'You are coming, in group A.' });
    expect(map.made.current().attendees[ALICE]).toMatchObject({
      group: 'A',
      status: PartyStatus.Coming,
    });
  });

  it("counts one use in the window of the post's controls, none for a member refused before it", async () => {
    const throttles = new Throttles();
    for (let n = 0; n < ACTION_THROTTLE.uses - 1; n++) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const map = await grouped({ throttles });
    web = map.web;
    const body = { group: 'B', stamp: map.stampOf('B'), signedUp: true };
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await map.regroup(body)).status).toBe(403);
    map.made.gateway.barred.delete(WEST_FORUM);
    expect((await map.regroup({ group: 'B' })).status).toBe(400);
    expect((await map.regroup(body)).status).toBe(200);
    expect((await map.regroup(body)).status).toBe(429);
    expect(map.web.entries).toContainEqual(
      expect.objectContaining({ msg: 'a party was pressed on the map', action: 'regroup' }),
    );
  });

  it('answers a party that has ended as Group…: "This has ended."', async () => {
    const map = await grouped();
    web = map.web;
    const stamp = map.stampOf('B');
    await map.made.service.end(map.id);
    const answer = await map.regroup({ group: 'B', stamp, signedUp: true });
    expect(answer).toEqual({ status: 409, json: { ok: false, text: 'This has ended.' } });
  });
  it("answers Group…'s move once the post shows it (plan 8M-11A, S1): the ticket taken after the change", async () => {
    const map = await grouped();
    web = map.web;
    const id = map.made.party.id;
    const before = map.made.store.get(id);
    const answer = await map.regroup({ group: 'B', stamp: map.stampOf('B'), signedUp: true });
    expect(answer.status).toBe(200);
    // Review fix R1: the ticket taken once the change returned, the party with it.
    expect(map.drawn.waits).toEqual([
      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
    ]);
    expect(map.made.store.get(id)).not.toBe(before);
  });
});
