import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESS_SHOWN_MS } from './post-drawn.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER, stops } from '../../test/support/parties.js';
import { createdTrain } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import {
  FakeActingMembers,
  partyWebWith,
  TEST_OWNER_ID,
  trainWebWith,
  webServerWith,
  type TestWeb,
  RecordingDraws,
} from '../../test/support/web.js';
import { ACTION_THROTTLE } from '../commands/parties/reply.js';
import { controlThrottleKey } from '../discord/router.js';
import { Throttles } from '../discord/throttle.js';
import { attendeeOf, isTrain } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { PartiesView } from '../domain/web/party-data.js';
import type { MapSplit, TrainAnswer } from '../domain/web/train-data.js';
import { PARTY_KIND } from '../render/party-controls.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

const DAVE = '200000000000000005';

/**
 * A train on stop 2 of 3 (Veterans Memorial Bridge, The Stacks, Harbor Lighthouse Mural) with the
 * maker and Carol in A, and group B (Fast): Alice opened it, Bob is in it; on the map with them,
 * Dave (a member not on the train) and the bot's owner (staff).
 */
async function splitting(options: { throttles?: Throttles } = {}) {
  const made = await createdTrain({ route: stops(4, 1, 7) });
  const { id } = made.party;
  await made.trains.move(id, { id: REPORTER }, 'next', true);
  await made.attendance.signUp(id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
  await made.attendance.newGroup(id, { id: ALICE, name: 'Alice' });
  await made.attendance.labelGroup(id, { id: ALICE, name: 'Alice' }, 'Fast');
  await made.attendance.joinGroup(id, { id: BOB, name: 'Bob' }, 'B');
  await made.attendance.flush();
  await made.service.flush();
  const throttles = options.throttles ?? new Throttles();
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
    users: made.users,
  });
  const members = new FakeMemberDirectory();
  const acting = new FakeActingMembers();
  for (const [userId, name] of [
    [ALICE, 'Alice'],
    [BOB, 'Bob'],
    [CAROL, 'Carol'],
    [DAVE, 'Dave'],
    [REPORTER, 'Reporter'],
    [TEST_OWNER_ID, 'Owner'],
  ] as const) {
    members.add(userId, name);
    acting.add(userId, name);
  }
  const drawn = new RecordingDraws(made.store);
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles, drawn }),
    trains: trainWebWith(ctx),
  });
  web.clock.now = PARTY_NOW;
  const url = `/s/${FAKE_GUILD_ID}/api/trains/${id}/split`;
  const names: Record<string, string> = {
    [ALICE]: 'Alice',
    [BOB]: 'Bob',
    [CAROL]: 'Carol',
    [DAVE]: 'Dave',
    [REPORTER]: 'Reporter',
    [TEST_OWNER_ID]: 'Owner',
  };
  /** Opens Split… as this member (`GET …/split`). */
  const open = async (userId = ALICE) => {
    const answer = await web.app.inject({
      url,
      headers: { cookie: await web.loggedIn(userId, names[userId] ?? 'Somebody') },
    });
    return { status: answer.statusCode, json: answer.json<MapSplit & { error?: string }>() };
  };
  /** Submits Split… as this member. */
  const submit = async (body: object, userId = ALICE) => {
    const answer = await web.app.inject({
      method: 'POST',
      url,
      headers: {
        ...(await web.posting(userId, names[userId] ?? 'Somebody')),
        'content-type': 'application/json',
      },
      payload: JSON.stringify(body),
    });
    return { status: answer.statusCode, json: answer.json<TrainAnswer & { error?: string }>() };
  };
  /** The trains a member sees in the list. */
  const listed = async (userId = ALICE) => {
    const cookie = await web.loggedIn(userId, names[userId] ?? 'Somebody');
    const answer = await web.app.inject({
      url: `/s/${FAKE_GUILD_ID}/api/parties`,
      headers: { cookie },
    });
    return answer.json<PartiesView>().trains;
  };
  return { made, web, throttles, open, submit, listed, drawn };
}

describe('Split… of a train on the map (plan 8M-8C)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it("opens for a member of a group with the dialog of that group alone, in the dialog's words", async () => {
    const map = await splitting();
    web = map.web;
    const opened = await map.open();
    expect(opened.status).toBe(200);
    expect(opened.json).toMatchObject({
      title: 'Split a group off the train',
      only: { group: 'B' },
    });
    expect(opened.json.choice).toBeUndefined();
    expect(opened.json.text.split('\n')).toEqual([
      'Group B (Fast) leaves Saturday legendaries and becomes a train of its own, Saturday ' +
        'legendaries (Fast):',
      // Discord's list marks as bullets (plan 8M-13, A1, fix round 1), each item on its own line.
      '• the same route, at the same stop (stop 2 of 3: The Stacks), the same end mode, boss ' +
        'and start',
      '• Alice and Bob move to it as they are signed up now',
      '• you are its conductor',
      '',
      'Submit splits it off.',
    ]);
  });

  it('opens for staff with the dialog that asks which group leaves, who is in each named, nothing picked', async () => {
    const map = await splitting();
    web = map.web;
    const opened = await map.open(TEST_OWNER_ID);
    expect(opened.status).toBe(200);
    expect(opened.json.only).toBeUndefined();
    expect(opened.json.choice).toMatchObject({
      label: 'Group that leaves',
      options: [
        { value: expect.stringMatching(/^A:/) as unknown, label: 'Group A · 2 trainers' },
        { value: expect.stringMatching(/^B:/) as unknown, label: 'Group B (Fast) · 2 trainers' },
      ],
    });
    expect(opened.json.text).toContain('Group B (Fast) (2 trainers): Alice, Bob');
  });

  it("refuses before it opens who may split no group, in the dialog's words, uncounted", async () => {
    const throttles = new Throttles();
    const map = await splitting({ throttles });
    web = map.web;
    const dave = await map.open(DAVE);
    expect(dave).toMatchObject({
      status: 422,
      json: {
        error: "Only a group's members, the conductor and the moderators can split a group off.",
      },
    });
    expect(
      throttles.use(controlThrottleKey(PARTY_KIND), DAVE, { uses: 1, perSeconds: 60 }, PARTY_NOW),
    ).toBeUndefined();
  });

  it('splits the group off into a train of its own, which the list shows beside the old one, counted once', async () => {
    const throttles = new Throttles();
    const map = await splitting({ throttles });
    web = map.web;
    const { json: split } = await map.open();
    const done = await map.submit({ group: 'B', mark: split.only?.mark });
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({
      ok: true,
      text: 'Split off: Saturday legendaries (Fast)',
    });
    const old = map.made.current();
    expect(old.groups.map((group) => group.id)).toEqual(['A']);
    expect(attendeeOf(old, ALICE)).toBeUndefined();
    const trains = await map.listed();
    expect(trains.map((train) => train.name).sort()).toEqual([
      'Saturday legendaries',
      'Saturday legendaries (Fast)',
    ]);
    const added = map.made.store.active().find((party) => party.id !== old.id);
    expect(added && isTrain(added) && attendeeOf(added, BOB)).toBeTruthy();
    // A second Submit of the same form says where the group went, as the dialog does.
    const again = await map.submit({ group: 'B', mark: split.only?.mark });
    expect(again.json).toMatchObject({ ok: true, text: 'Split off: Saturday legendaries (Fast)' });
    expect(map.made.store.active()).toHaveLength(2);
  });

  it("refuses a group called otherwise since the form opened, in the dialog's words", async () => {
    const map = await splitting();
    web = map.web;
    const { json: split } = await map.open();
    await map.made.attendance.labelGroup(map.made.party.id, { id: ALICE }, 'Faster');
    const stale = await map.submit({ group: 'B', mark: split.only?.mark });
    expect(stale.status).toBe(409);
    expect(stale.json).toMatchObject({
      ok: false,
      text: 'The groups of this train changed meanwhile: press Split… again.',
      train: { id: map.made.party.id },
    });
    expect(map.made.store.active()).toHaveLength(1);
  });

  it("counts the Submit in the window of the post's controls, and refuses the opening while it is full, uncounted", async () => {
    const throttles = new Throttles();
    const map = await splitting({ throttles });
    web = map.web;
    const { json: split } = await map.open();
    for (let use = 0; use < ACTION_THROTTLE.uses; use += 1) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    expect((await map.open()).status).toBe(429);
    expect((await map.submit({ group: 'B', mark: split.only?.mark })).status).toBe(429);
    expect(map.made.store.active()).toHaveLength(1);
  });

  it('says a split that failed split nothing off, and gives its use back, as the dialog does', async () => {
    const throttles = new Throttles();
    const map = await splitting({ throttles });
    web = map.web;
    const { json: split } = await map.open();
    for (let use = 0; use < ACTION_THROTTLE.uses - 1; use += 1) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const failing = vi
      .spyOn(map.made.trains, 'split')
      .mockRejectedValue(new Error('the database is away'));
    const failed = await map.submit({ group: 'B', mark: split.only?.mark });
    expect(failed).toMatchObject({
      status: 500,
      json: { ok: false, text: 'The split did not work: nothing was split off.' },
    });
    failing.mockRestore();
    expect((await map.submit({ group: 'B', mark: split.only?.mark })).status).toBe(200);
  });

  // Review C3: as Manage…'s Submit, who may not is refused before anything is counted.
  it("refuses the Submit of who may not split that group before it counts, 403 with the train, in the dialog's words", async () => {
    const throttles = new Throttles();
    const map = await splitting({ throttles });
    web = map.web;
    const { json: split } = await map.open();
    const dave = await map.submit({ group: 'B', mark: split.only?.mark }, DAVE);
    expect(dave).toMatchObject({
      status: 403,
      json: {
        ok: false,
        text: "Only a group's members, the conductor and the moderators can split a group off.",
        train: { id: map.made.party.id },
      },
    });
    expect(map.made.store.active()).toHaveLength(1);
    expect(
      throttles.use(controlThrottleKey(PARTY_KIND), DAVE, { uses: 1, perSeconds: 60 }, PARTY_NOW),
    ).toBeUndefined();
  });

  // Re-review N2: what the train is (not who asks) is refused by the counted way, as Discord's
  // Submit is.
  it("counts a Submit the train refuses for what it is now (one group left), 422 in the dialog's words", async () => {
    const throttles = new Throttles();
    const map = await splitting({ throttles });
    web = map.web;
    const { json: split } = await map.open();
    const { id } = map.made.party;
    await map.made.attendance.leave(id, { id: CAROL });
    await map.made.attendance.leave(id, { id: REPORTER });
    for (let use = 0; use < ACTION_THROTTLE.uses - 1; use += 1) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const whole = await map.submit({ group: 'B', mark: split.only?.mark });
    expect(whole).toMatchObject({
      status: 422,
      json: {
        ok: false,
        text: 'This train has one group: there is no group to split off it.',
      },
    });
    // That Submit was the window's last use.
    expect((await map.submit({ group: 'B', mark: split.only?.mark })).status).toBe(429);
    expect(map.made.store.active()).toHaveLength(1);
  });

  // Review C4: a post the bot may not make is none of the member's doing.
  it("says plainly where the bot may not make the new post, and gives the Submit's use back", async () => {
    const throttles = new Throttles();
    const map = await splitting({ throttles });
    web = map.web;
    const { json: split } = await map.open();
    for (let use = 0; use < ACTION_THROTTLE.uses - 1; use += 1) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    map.made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    const refused = await map.submit({ group: 'B', mark: split.only?.mark });
    expect(refused.status).toBe(422);
    expect(refused.json).toMatchObject({ ok: false, train: { id: map.made.party.id } });
    expect(refused.json.text).toMatch(
      /^I am not allowed to make posts in .+: I lack the permission Manage Posts there\. Nothing was made\./u,
    );
    expect(map.made.store.active()).toHaveLength(1);
    map.made.gateway.refusePosts.delete(WEST_FORUM);
    // The window has the one use left that the refused Submit gave back.
    expect((await map.submit({ group: 'B', mark: split.only?.mark })).status).toBe(200);
  });

  it('answers a train that is over (409), refuses a member kept out of its forum (403), and knows only its bodies (400)', async () => {
    const map = await splitting();
    web = map.web;
    expect((await map.submit({ group: 'B' })).status).toBe(400);
    expect((await map.submit({ group: 'F', mark: '1.a' })).status).toBe(400);
    expect((await map.submit({ group: 'B', mark: '1.a', more: 1 })).status).toBe(400);
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await map.open()).status).toBe(403);
    map.made.gateway.barred.clear();
    await map.made.service.end(map.made.party.id);
    expect((await map.open()).status).toBe(409);
    expect((await map.submit({ group: 'B', mark: '1.a' })).status).toBe(409);
  });
  it("answers Split…'s Submit, for the train it leaves once the post shows it (plan 8M-11A, S1): the ticket taken after the change", async () => {
    const map = await splitting();
    web = map.web;
    const id = map.made.party.id;
    const before = map.made.store.get(id);
    const { json: split } = await map.open();
    expect((await map.submit({ group: 'B', mark: split.only?.mark })).status).toBe(200);
    // Review fix R1: the ticket taken once the change returned, the party with it.
    expect(map.drawn.waits).toEqual([
      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
    ]);
    expect(map.made.store.get(id)).not.toBe(before);
  });
});
