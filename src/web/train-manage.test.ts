import { START_THROTTLE } from '../commands/parties/timed.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESS_SHOWN_MS } from './post-drawn.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, PARTY_NOW, REPORTER, stops } from '../../test/support/parties.js';
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
import { CHANGE_THROTTLE } from '../commands/raids/change.js';
import { controlThrottleKey, variedThrottleKey } from '../discord/router.js';
import { Throttles } from '../discord/throttle.js';
import { PartyStatus } from '../domain/party/status.js';
import type { PartiesView } from '../domain/web/party-data.js';
import type { ManageBody, MapManage, TrainAnswer } from '../domain/web/train-data.js';
import { PARTY_KIND } from '../render/party-controls.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * A train of the party services of a test (`createdTrain`, made by `REPORTER`) on the route
 * Veterans Memorial Bridge (4), The Stacks (1), Harbor Lighthouse Mural (7), at its first stop, on
 * the map: Alice signed up as coming, Bob a member who is not signed up, the bot's owner staff.
 */
async function managing(options: { throttles?: Throttles; route?: number[] } = {}) {
  const made = await createdTrain({ route: options.route ?? [4, 1, 7] });
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  await made.attendance.flush();
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
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
  const names: Array<[string, string]> = [
    [ALICE, 'Alice'],
    [BOB, 'Bob'],
    [REPORTER, 'Reporter'],
    [TEST_OWNER_ID, 'Owner'],
  ];
  const members = new FakeMemberDirectory();
  const acting = new FakeActingMembers();
  for (const [id, name] of names) {
    members.add(id, name);
    acting.add(id, name);
  }
  const drawn = new RecordingDraws(made.store);
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles, drawn }),
    trains: trainWebWith(ctx),
  });
  web.clock.now = PARTY_NOW;
  const url = `/s/${FAKE_GUILD_ID}/api/trains/${made.party.id}/manage`;
  /** Opens Manage… as this member (`GET …/manage`). */
  const open = async (userId = ALICE, name = 'Alice') => {
    const answer = await web.app.inject({
      url,
      headers: { cookie: await web.loggedIn(userId, name) },
    });
    return { status: answer.statusCode, json: answer.json<MapManage & { error?: string }>() };
  };
  /** Submits Manage… as this member, what was shown sent back with what was picked. */
  const submit = async (body: ManageBody | object, userId = ALICE, name = 'Alice') => {
    const answer = await web.app.inject({
      method: 'POST',
      url,
      headers: { ...(await web.posting(userId, name)), 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return { status: answer.statusCode, json: answer.json<TrainAnswer & { error?: string }>() };
  };
  const lines = async (): Promise<string[]> => {
    await made.trains.flush();
    await made.attendance.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  return { made, web, throttles, open, submit, lines, drawn };
}

describe('the start in Manage… of a train on the map (Matt, 2026-10-30)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  const picked = { kind: 'raid', route: 'keep', atEnd: 'finish' };

  it('asks it of who may arrange the train, says what it is, and sets it as /meet reads it', async () => {
    const map = await managing();
    web = map.web;
    const opened = await map.open();
    expect(opened.json.times).toMatchObject({
      startTime: null,
      endTime: map.made.current().endTime,
    });
    expect(opened.json.text).not.toContain('start time');
    const set = await map.submit({
      shown: opened.json.shown,
      picked: { ...picked, start: 'in 30' },
    });
    expect(set.status).toBe(200);
    expect(set.json.text).toMatch(/^This train starts at /u);
    expect(map.made.current().timed.startTime).not.toBeNull();
    const kept = await map.submit({ shown: opened.json.shown, picked });
    expect(kept.json.text).toBe('Nothing changed.');
    expect(map.made.current().timed.startTime).not.toBeNull();
    expect((await map.open()).json.times?.startTime).toBe(map.made.current().timed.startTime);
    expect(set.json.text).not.toContain('<t:');
    const removed = await map.submit({
      shown: opened.json.shown,
      picked: { ...picked, start: 'cancel' },
    });
    expect(removed.json.text).toMatch(/^This train has no start time any more\./u);
    expect(map.made.current().timed.startTime).toBeNull();
  });

  it('sets the end as /end reads it, read from a start asked with it, and joins the answers', async () => {
    const map = await managing();
    web = map.web;
    const { shown } = (await map.open()).json;
    const set = await map.submit({ shown, picked: { ...picked, start: 'in 30', end: 'in 90' } });
    expect(set.status).toBe(200);
    expect(set.json.text).toMatch(/^This train starts at .* This train ends at /u);
    const train = map.made.current();
    expect(train.endTime).toBeGreaterThan(train.timed.startTime ?? Infinity);
    const removed = await map.submit({ shown, picked: { ...picked, end: 'none' } });
    expect(removed.json.text).toMatch(/^This train has no end time any more\./u);
    expect(map.made.current().endTime).toBeNull();
  });

  it('moves both times later and both earlier, whichever must go first (review, finding 5)', async () => {
    const map = await managing();
    web = map.web;
    const { shown } = (await map.open()).json;
    expect(
      (await map.submit({ shown, picked: { ...picked, start: 'in 30', end: 'in 60' } })).status,
    ).toBe(200);
    // The new start lies past the end as it is: the end goes first.
    const later = await map.submit({
      shown,
      picked: { ...picked, start: 'in 120', end: 'in 180' },
    });
    expect(later.status).toBe(200);
    // Said start first all the same (staging of 2026-10-30).
    expect(later.json.text).toMatch(/^This train starts at .* This train ends at /u);
    const moved = map.made.current();
    expect(moved.timed.startTime).toBe(PARTY_NOW - (PARTY_NOW % 60_000) + 120 * 60_000);
    expect(moved.endTime).toBe(PARTY_NOW - (PARTY_NOW % 60_000) + 180 * 60_000);
    // The new end lies before the start as it is: the start goes first.
    const earlier = await map.submit({
      shown,
      picked: { ...picked, start: 'in 10', end: 'in 20' },
    });
    expect(earlier.status).toBe(200);
    expect(earlier.json.text).toMatch(/^This train starts at .* This train ends at /u);
    expect(map.made.current().endTime).toBe(PARTY_NOW - (PARTY_NOW % 60_000) + 20 * 60_000);
  });

  it('refuses times out of order before anything is changed or counted (review, finding 8)', async () => {
    const throttles = new Throttles();
    const map = await managing({ throttles });
    web = map.web;
    const { shown } = (await map.open()).json;
    const pair = await map.submit({
      shown,
      picked: { ...picked, kind: 'dynamax', start: 'in 60', end: 'in 60' },
    });
    expect(pair.status).toBe(422);
    expect(pair.json.keepsForm).toBe(true);
    expect(map.made.current().train.kind).toBe('raid');
    expect(map.made.current().timed.startTime).toBeNull();
    // Set, then a start alone past that end.
    await map.submit({ shown, picked: { ...picked, end: 'in 60' } });
    const alone = await map.submit({
      shown,
      picked: { ...picked, kind: 'dynamax', start: 'in 120' },
    });
    expect(alone.status).toBe(422);
    expect(alone.json.keepsForm).toBe(true);
    expect(map.made.current().train.kind).toBe('raid');
    // None of it counted in /meet's window.
    const window = variedThrottleKey('meet', START_THROTTLE);
    for (let use = 0; use < START_THROTTLE.uses; use++) {
      expect(throttles.use(window, ALICE, START_THROTTLE, PARTY_NOW)).toBeUndefined();
    }
  });

  it('takes a start removed with an end before the start as it was', async () => {
    const map = await managing();
    web = map.web;
    const { shown } = (await map.open()).json;
    await map.submit({ shown, picked: { ...picked, start: 'in 120', end: 'in 180' } });
    const answer = await map.submit({
      shown,
      picked: { ...picked, start: 'cancel', end: 'in 60' },
    });
    expect(answer.status).toBe(200);
    expect(map.made.current().timed.startTime).toBeNull();
  });

  it('gives back only the use of a time that did not go through (review, finding 8)', async () => {
    const throttles = new Throttles();
    const map = await managing({ throttles });
    web = map.web;
    const { shown } = (await map.open()).json;
    // Refused meanwhile, past what the route read ahead.
    vi.spyOn(map.made.timed, 'setEndTime').mockResolvedValueOnce({
      kind: 'refused',
      reason: 'end-before-start',
    });
    const answer = await map.submit({
      shown,
      picked: { ...picked, start: 'in 30', end: 'in 60' },
    });
    expect(answer.status).toBe(422);
    expect(map.made.current().timed.startTime).not.toBeNull();
    // The start's use stays spent: one fewer left in /meet's window.
    const window = variedThrottleKey('meet', START_THROTTLE);
    for (let use = 0; use < START_THROTTLE.uses - 1; use++) {
      expect(throttles.use(window, ALICE, START_THROTTLE, PARTY_NOW)).toBeUndefined();
    }
    expect(throttles.wait(window, ALICE, START_THROTTLE, PARTY_NOW)).toBeDefined();
    // The end's came back: its whole window is left.
    for (let use = 0; use < CHANGE_THROTTLE.uses; use++) {
      expect(throttles.use('end', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeUndefined();
    }
  });

  it('gives back the use of a start refused after its end went first', async () => {
    const throttles = new Throttles();
    const map = await managing({ throttles });
    web = map.web;
    const { shown } = (await map.open()).json;
    await map.submit({ shown, picked: { ...picked, end: 'in 60' } });
    vi.spyOn(map.made.timed, 'setStartTime').mockResolvedValueOnce({
      kind: 'refused',
      reason: 'start-after-end',
    });
    const answer = await map.submit({
      shown,
      picked: { ...picked, start: 'in 120', end: 'in 180' },
    });
    expect(answer.status).toBe(422);
    expect(map.made.current().endTime).toBe(PARTY_NOW - (PARTY_NOW % 60_000) + 180 * 60_000);
    const window = variedThrottleKey('meet', START_THROTTLE);
    for (let use = 0; use < START_THROTTLE.uses; use++) {
      expect(throttles.use(window, ALICE, START_THROTTLE, PARTY_NOW)).toBeUndefined();
    }
    // Two ends went through: the first Submit's and this one's.
    for (let use = 0; use < CHANGE_THROTTLE.uses - 2; use++) {
      expect(throttles.use('end', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeUndefined();
    }
    expect(throttles.wait('end', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeDefined();
  });

  it('refuses an end it cannot read before anything is changed or counted', async () => {
    const map = await managing();
    web = map.web;
    const { shown } = (await map.open()).json;
    const bad = await map.submit({
      shown,
      picked: { ...picked, kind: 'dynamax', end: 'whenever' },
    });
    expect(bad.status).toBe(422);
    // The form stays, with what was picked: only the time is to type again (finding 7).
    expect(bad.json.keepsForm).toBe(true);
    expect(map.made.current().train.kind).toBe('raid');
  });

  it('gives the use of /meet back when the post controls’ window is full or the start is refused', async () => {
    const throttles = new Throttles();
    const map = await managing({ throttles });
    web = map.web;
    const { shown } = (await map.open()).json;
    const key = controlThrottleKey('party');
    for (let use = 0; use < ACTION_THROTTLE.uses; use++) {
      throttles.use(key, ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const start = { ...picked, start: 'in 30' };
    expect((await map.submit({ shown, picked: start })).status).toBe(429);
    const window = variedThrottleKey('meet', START_THROTTLE);
    // No use of it was spent, in a window that opened then.
    expect(throttles.wait(window, ALICE, START_THROTTLE, PARTY_NOW)).toBeUndefined();
    for (let use = 0; use < START_THROTTLE.uses - 1; use++) {
      expect(throttles.use(window, ALICE, START_THROTTLE, PARTY_NOW)).toBeUndefined();
    }
    expect(throttles.wait(window, ALICE, START_THROTTLE, PARTY_NOW)).toBeUndefined();
  });

  it('refuses a start of who may not arrange the train before anything counts', async () => {
    const throttles = new Throttles();
    const map = await managing({ throttles, route: [4, 1, 7] });
    web = map.web;
    const { shown } = (await map.open()).json;
    const answer = await map.submit(
      { shown, picked: { ...picked, kind: 'dynamax', start: 'in 30' } },
      'carol',
      'Carol',
    );
    expect([403, 422]).toContain(answer.status);
    expect(map.made.current().train.kind).toBe('raid');
    expect(
      throttles.wait(variedThrottleKey('meet', START_THROTTLE), 'carol', START_THROTTLE, PARTY_NOW),
    ).toBeUndefined();
  });

  it('refuses a time it cannot read in /meet’s words, uncounted, and counts one in /meet’s window', async () => {
    const throttles = new Throttles();
    const map = await managing({ throttles });
    web = map.web;
    const { shown } = (await map.open()).json;
    const bad = await map.submit({ shown, picked: { ...picked, start: 'whenever' } });
    expect(bad.status).toBe(422);
    expect(bad.json.text).toContain('I could not read "whenever"');
    for (const start of ['in 30', 'in 40', 'in 50']) {
      expect((await map.submit({ shown, picked: { ...picked, start } })).status).toBe(200);
    }
    const over = await map.submit({ shown, picked: { ...picked, start: 'in 60' } });
    expect(over.status).toBe(429);
    expect(over.json.error).toMatch(/^You can do that again in /u);
    // Nothing of the form is applied either: the kind stays.
    const both = await map.submit({
      shown,
      picked: { ...picked, kind: 'dynamax', start: 'in 60' },
    });
    expect(both.status).toBe(429);
    expect(map.made.current().train.kind).toBe('raid');
  });
});

describe('Manage… of a train on the map (plan 8M-8C)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it("opens with Discord's dialog: where the train is, the route's choices, the mode and the kind, each with the train's own picked", async () => {
    const map = await managing();
    web = map.web;
    const opened = await map.open();
    expect(opened.status).toBe(200);
    expect(opened.json).toEqual({
      title: 'Manage the train',
      text: 'At stop 1 of 3: Veterans Memorial Bridge\nNext is The Stacks',
      times: {
        zone: 'America/New_York',
        startTime: null,
        endTime: map.made.current().endTime,
      },
      route: {
        label: 'The route',
        options: [
          { value: 'keep', label: 'Keep it as it is' },
          { value: 'reverse', label: 'Reverse it' },
          { value: 'finish', label: 'Finish it here' },
        ],
        picked: 'keep',
      },
      atEnd: {
        label: 'At the end of the route',
        options: [
          {
            value: 'finish',
            label: 'Finish at the last stop',
            line: 'The train stops at the last stop',
            emoji: '🏁',
          },
          {
            value: 'loop',
            label: 'Loop: back to the first stop',
            line: 'After the last stop comes the first',
            emoji: '🔁',
          },
          {
            value: 'turn-back',
            label: 'Turn back at the end',
            line: 'The route is run backwards from the end',
            emoji: '↩️',
          },
        ],
        picked: 'finish',
      },
      kind: {
        label: 'What the train is mainly for',
        options: [
          {
            value: 'raid',
            label: 'Raids',
            line: 'Members choose their groups themselves',
            emoji: '⚔️',
          },
          {
            value: 'dynamax',
            label: 'Dynamax Battles',
            line: 'Lobbies form on the spot: the groups have no size',
            emoji: '🔴',
          },
          {
            value: 'gigantamax',
            label: 'Gigantamax Battles',
            line: 'Join fills the groups up to a Gigantamax lobby',
            emoji: '🌋',
          },
        ],
        picked: 'raid',
      },
      shown: { from: '4', first: '4', atEnd: 'finish', kind: 'raid' },
    });
  });

  it('applies what was picked otherwise than shown as one change, in the words of the dialog', async () => {
    const map = await managing();
    web = map.web;
    const { json: manage } = await map.open();
    const done = await map.submit({
      shown: manage.shown,
      picked: { kind: 'dynamax', route: 'reverse', atEnd: 'loop' },
    });
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({
      ok: true,
      text:
        'This train is a Max Battle Train now. The route is reversed. At the end it loops back ' +
        'to the first stop. The train is at stop 3 of 3: Veterans Memorial Bridge. Next goes ' +
        'round to Harbor Lighthouse Mural.',
      train: { route: ['7', '1', '4'], trainKind: 'dynamax' },
    });
    expect(map.made.current().train).toMatchObject({
      route: stops(7, 1, 4),
      atEnd: 'loop',
      kind: 'dynamax',
    });
    // One line in the post for all three.
    expect((await map.lines()).at(-1)).toMatch(
      /made this a Max Battle Train\. The route was reversed by .+ set the train to loop\.$/,
    );
    // A form whose picks are what it showed changes nothing.
    const { json: again } = await map.open();
    const nothing = await map.submit({
      shown: again.shown,
      picked: { kind: 'dynamax', route: 'keep', atEnd: 'loop' },
    });
    expect(nothing.json).toMatchObject({ ok: true, text: 'Nothing changed.' });
  });

  it('finishes the route here, announced as a move, and refuses a route change from a form drawn where the train no longer is', async () => {
    const map = await managing();
    web = map.web;
    const { json: early } = await map.open();
    await map.made.trains.move(map.made.party.id, { id: BOB }, 'next', true);
    const late = await map.submit({
      shown: early.shown,
      picked: { kind: 'dynamax', route: 'finish', atEnd: 'finish' },
    });
    expect(late.status).toBe(409);
    expect(late.json.text).toBe(
      'The train has moved on since you opened this: The train is at stop 2 of 3: The Stacks. ' +
        'Next is Harbor Lighthouse Mural. Nothing was changed.',
    );
    expect(late.json.train).toMatchObject({ stop: 1 });
    expect(map.made.current().train).toMatchObject({ stop: 1, kind: 'raid' });
    const { json: fresh } = await map.open();
    const finished = await map.submit({
      shown: fresh.shown,
      picked: { kind: 'raid', route: 'finish', atEnd: 'finish' },
    });
    expect(finished.json).toMatchObject({
      ok: true,
      text: 'The train has finished its route of 3 stops. Move… takes it back to stop 2: The Stacks.',
    });
    expect(await map.lines()).toContain(
      `The train has finished its route. Moved by **Alice** (<@${ALICE}>).`,
    );
  });

  it('asks a train without a route its kind alone', async () => {
    const map = await managing({ route: [] });
    web = map.web;
    const { json: manage } = await map.open();
    expect(manage).toMatchObject({
      text: 'This train has no route yet. Add its stops with /route add.',
      kind: { picked: 'raid' },
      shown: { from: 'none', first: '-', atEnd: 'finish', kind: 'raid' },
    });
    expect(manage.route).toBeUndefined();
    expect(manage.atEnd).toBeUndefined();
    const set = await map.submit({ shown: manage.shown, picked: { kind: 'gigantamax' } });
    expect(set.json).toMatchObject({ ok: true, text: 'This train is a Gigantamax Train now.' });
    expect(map.made.current().train.kind).toBe('gigantamax');
  });

  it('opens for who may move the train and staff, refused before it opens in the words of the dialog, uncounted', async () => {
    const throttles = new Throttles();
    const map = await managing({ throttles });
    web = map.web;
    const bob = await map.open(BOB, 'Bob');
    expect(bob).toMatchObject({
      status: 422,
      json: { error: 'You are not signed up for this train.' },
    });
    const { json: manage } = await map.open();
    const refused = await map.submit(
      { shown: manage.shown, picked: { kind: 'gigantamax', route: 'keep', atEnd: 'finish' } },
      BOB,
      'Bob',
    );
    expect(refused).toMatchObject({
      status: 403,
      json: { ok: false, text: 'You are not signed up for this train.' },
    });
    expect((await map.open(TEST_OWNER_ID, 'Owner')).status).toBe(200);
    // Neither refusal was counted: Bob has used none of the post's controls.
    expect(
      throttles.use(controlThrottleKey(PARTY_KIND), BOB, { uses: 1, perSeconds: 60 }, PARTY_NOW),
    ).toBeUndefined();
  });

  // Review C1: the page words no refusal of its own; the server sends the dialog's.
  it("sends why Move… and Manage… do not open with the train in the list, in the dialog's words", async () => {
    const map = await managing();
    web = map.web;
    const listed = async (userId: string, name: string) => {
      const answer = await map.web.app.inject({
        url: `/s/${FAKE_GUILD_ID}/api/parties`,
        headers: { cookie: await map.web.loggedIn(userId, name) },
      });
      return answer.json<PartiesView>().trains[0]?.moveRefusal;
    };
    expect(await listed(BOB, 'Bob')).toEqual({
      reason: 'not-attending',
      text: 'You are not signed up for this train.',
    });
    await map.made.attendance.signUp(
      map.made.party.id,
      { id: BOB, name: 'Bob' },
      PartyStatus.Coming,
    );
    await map.made.trains.setConductor(map.made.party.id, { id: ALICE, name: 'Alice' });
    expect(await listed(BOB, 'Bob')).toEqual({
      reason: 'not-conductor',
      text: 'This train has a conductor: only they and the moderators can move it.',
    });
    expect(await listed(ALICE, 'Alice')).toBeNull();
  });

  // Branch review B2: whether Manage… opens is the server's, as `GET …/manage` decides it.
  it('sends with the train in the list whether Manage… opens for the member', async () => {
    const map = await managing();
    web = map.web;
    const manages = async (userId: string, name: string) => {
      const answer = await map.web.app.inject({
        url: `/s/${FAKE_GUILD_ID}/api/parties`,
        headers: { cookie: await map.web.loggedIn(userId, name) },
      });
      return answer.json<PartiesView>().trains[0]?.mayManage;
    };
    expect(await manages(BOB, 'Bob')).toBe(false);
    expect(await manages(ALICE, 'Alice')).toBe(true);
    expect(await manages(TEST_OWNER_ID, 'Owner')).toBe(true);
    await map.made.attendance.signUp(
      map.made.party.id,
      { id: BOB, name: 'Bob' },
      PartyStatus.Coming,
    );
    expect(await manages(BOB, 'Bob')).toBe(true);
    await map.made.trains.setConductor(map.made.party.id, { id: ALICE, name: 'Alice' });
    expect(await manages(BOB, 'Bob')).toBe(false);
    expect(await manages(ALICE, 'Alice')).toBe(true);
  });

  it("counts the Submit in the window of the post's controls, and refuses the opening while it is full, uncounted", async () => {
    const throttles = new Throttles();
    const map = await managing({ throttles });
    web = map.web;
    const { json: manage } = await map.open();
    for (let use = 0; use < ACTION_THROTTLE.uses; use += 1) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const opened = await map.open();
    expect(opened.status).toBe(429);
    expect(opened.json.error).toBe('That was a lot of clicks. Try again in 1 minute.');
    const counted = await map.submit({
      shown: manage.shown,
      picked: { kind: 'gigantamax', route: 'keep', atEnd: 'finish' },
    });
    expect(counted.status).toBe(429);
    expect(map.made.current().train.kind).toBe('raid');
  });

  it('answers a train that is over (409), refuses a member kept out of its forum (403), and knows only its bodies (400)', async () => {
    const map = await managing();
    web = map.web;
    const { json: manage } = await map.open();
    expect((await map.submit({ shown: manage.shown })).status).toBe(400);
    expect(
      (await map.submit({ shown: manage.shown, picked: { kind: 'max', route: 'keep' } })).status,
    ).toBe(400);
    expect(
      (
        await map.submit({
          shown: { ...manage.shown, first: undefined },
          picked: { kind: 'raid' },
        })
      ).status,
    ).toBe(400);
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await map.open()).status).toBe(403);
    expect((await map.submit({ shown: manage.shown, picked: { kind: 'dynamax' } })).status).toBe(
      403,
    );
    await map.made.service.end(map.made.party.id);
    expect((await map.open(TEST_OWNER_ID, 'Owner')).status).toBe(409);
  });

  it("retires the old panel's Finish, Reverse, mode and kind presses: Manage… does them (404)", async () => {
    const map = await managing();
    web = map.web;
    const headers = await map.web.posting(ALICE, 'Alice');
    const press = async (what: string, body: object) =>
      (
        await map.web.app.inject({
          method: 'POST',
          url: `/s/${FAKE_GUILD_ID}/api/trains/${map.made.party.id}/move/${what}`,
          headers: { ...headers, 'content-type': 'application/json' },
          payload: JSON.stringify(body),
        })
      ).statusCode;
    expect(await press('finish', { from: '4' })).toBe(404);
    expect(await press('reverse', { from: '4', first: '4' })).toBe(404);
    expect(await press('at-end', { from: '4', atEnd: 'loop' })).toBe(404);
    expect(await press('kind', { kind: 'dynamax' })).toBe(404);
    expect(map.made.current().train).toMatchObject({ stop: 0, kind: 'raid', atEnd: 'finish' });
  });
  it("answers Manage…'s Submit once the post shows it (plan 8M-11A, S1): the ticket taken after the change", async () => {
    const map = await managing();
    web = map.web;
    const id = map.made.party.id;
    const before = map.made.store.get(id);
    const { json: manage } = await map.open();
    const done = await map.submit({
      shown: manage.shown,
      picked: { kind: 'dynamax', route: 'reverse', atEnd: 'loop' },
    });
    expect(done.status).toBe(200);
    // Review fix R1: the ticket taken once the change returned, the party with it.
    expect(map.drawn.waits).toEqual([
      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
    ]);
    expect(map.made.store.get(id)).not.toBe(before);
  });
});
