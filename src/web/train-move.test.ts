import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESS_SHOWN_MS } from './post-drawn.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { testGyms, WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
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
import { controlThrottleKey } from '../discord/router.js';
import { Throttles } from '../discord/throttle.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { PartiesView } from '../domain/web/party-data.js';
import type { TrainAnswer } from '../domain/web/train-data.js';
import { PARTY_KIND } from '../render/party-controls.js';
import { UNREACHABLE } from './acting.js';

const maps = (id: number): string => {
  const gym = testGyms().find((found) => found.id === id);
  return `https://www.google.com/maps/search/?api=1&query=${gym?.lat}%2C${gym?.lon}`;
};
const STACKS = `[The Stacks](<${maps(1)}>)`;

/**
 * A train of the party services of a test (`createdTrain`, made by `REPORTER`, who is signed up
 * as interested) on the route Veterans Memorial Bridge (4), The Stacks (1), Harbor Lighthouse
 * Mural (7), at its first stop, on the map: Alice signed up as coming and a member of the server
 * (fetched fresh as `Alice`), Bob a member who is not signed up, the bot's owner a member (staff).
 */
async function moving(options: { throttles?: Throttles } = {}) {
  const made = await createdTrain({ route: [4, 1, 7] });
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
  const members = new FakeMemberDirectory()
    .add(ALICE, 'Alice')
    .add(BOB, 'Bob')
    .add(REPORTER, 'Reporter')
    .add(TEST_OWNER_ID, 'Owner');
  const acting = new FakeActingMembers()
    .add(ALICE, 'Alice')
    .add(BOB, 'Bob')
    .add(REPORTER, 'Reporter')
    .add(TEST_OWNER_ID, 'Owner');
  const drawn = new RecordingDraws(made.store);
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles, drawn }),
    trains: trainWebWith(ctx),
  });
  web.clock.now = PARTY_NOW;
  const headers = await web.posting(ALICE, 'Alice');
  const post = async (path: string, body: unknown, sent = headers) => {
    const answer = await web.app.inject({
      method: 'POST',
      url: `/s/${FAKE_GUILD_ID}/api/trains/${made.party.id}/${path}`,
      headers: { ...sent, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return {
      status: answer.statusCode,
      json: answer.json<TrainAnswer & { error?: string }>(),
      headers: answer.headers,
    };
  };
  const move = (what: string, body: unknown, sent = headers) => post(`move/${what}`, body, sent);
  /** A conductor's button, carrying whose the role was when the page drew it. */
  const conductor = (what: string, who = 'none', sent = headers) =>
    post(`conductor/${what}`, { who }, sent);
  /** The train as a member sees it in the list of parties. */
  const listed = async (userId: string, name: string) => {
    const cookie = await web.loggedIn(userId, name);
    const answer = await web.app.inject({
      url: `/s/${FAKE_GUILD_ID}/api/parties`,
      headers: { cookie },
    });
    return answer.json<PartiesView>().trains[0];
  };
  /** The lines said in the post since the setup, one by one, the movement announced. */
  const lines = async (): Promise<string[]> => {
    await made.trains.flush();
    await made.attendance.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  return {
    made,
    web,
    acting,
    members,
    headers,
    post,
    move,
    conductor,
    listed,
    lines,
    throttles,
    drawn,
  };
}

describe('moving a train on the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it("moves it as Move…'s Next does: the movement in the post pings as usual, the dialog's words as text, the train as it is now", async () => {
    const map = await moving();
    web = map.web;
    await map.made.attendance.signUp(
      map.made.party.id,
      { id: BOB, name: 'Bob' },
      PartyStatus.Present,
    );
    await map.made.attendance.flush();
    const answer = await map.move('next', { from: '4', target: '1' });
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({
      ok: true,
      text:
        'The train is at stop 2 of 3: The Stacks. Next is Harbor Lighthouse Mural. ' +
        'I am telling the others.',
      train: { stop: 1, moves: { place: '1' } },
    });
    expect(attendeeOf(map.made.current(), BOB)?.status).toBe(PartyStatus.Coming);
    expect(await map.lines()).toEqual([
      `**Bob** (<@${BOB}>) is here.`,
      `The train is moving to ${STACKS}. Moved by **Alice** (<@${ALICE}>).`,
      `<@${REPORTER}> <@${BOB}>`,
    ]);
  });

  it("refuses a move drawn where the train no longer is, or leading where the route no longer goes, in Move…'s words, and gives the train as it is now", async () => {
    const map = await moving();
    web = map.web;
    expect((await map.move('next', { from: '4', target: '1' })).status).toBe(200);
    const twice = await map.move('next', { from: '4', target: '1' });
    expect(twice.status).toBe(409);
    expect(twice.json).toMatchObject({
      ok: false,
      text:
        'The train has moved on since you opened this: The train is at stop 2 of 3: The ' +
        'Stacks. Next is Harbor Lighthouse Mural.',
      train: { stop: 1 },
    });
    await map.made.trains.moveStop(map.made.party.id, { id: ALICE }, 3, 2);
    const elsewhere = await map.move('previous', { from: '1', target: '4' });
    expect(elsewhere.status).toBe(409);
    expect(elsewhere.json.text).toMatch(/^The train has moved on since you opened this: /);
    expect(map.made.current().train.stop).toBe(2);
  });

  it('skips and goes back as Move… does, and names Move… for what takes a finished route back', async () => {
    const map = await moving();
    web = map.web;
    expect((await map.move('skip', { from: '4', target: '7' })).json.text).toBe(
      'The train is at stop 3 of 3: Harbor Lighthouse Mural. It is the last stop: Next finishes the route. I am telling the others.',
    );
    expect((await map.move('previous', { from: '7', target: '1' })).json).toMatchObject({
      ok: true,
      train: { stop: 1, moves: { place: '1' } },
    });
    await map.made.trains.move(map.made.party.id, { id: ALICE }, 'next', false);
    expect((await map.move('next', { from: '7', target: 'end' })).json.text).toBe(
      'The train has finished its route of 3 stops. Move… takes it back to stop 3: Harbor ' +
        'Lighthouse Mural. I am telling the others.',
    );
  });

  it("gives who may move the train Move… as the post's dialog draws it: where the train is, the moves from there in its words; nobody else", async () => {
    const map = await moving();
    web = map.web;
    expect((await map.listed(ALICE, 'Alice'))?.moves).toEqual({
      title: 'Move the train',
      place: '4',
      text: 'At stop 1 of 3: Veterans Memorial Bridge\nNext is The Stacks',
      label: 'Where to',
      moves: [
        { move: 'next', target: '1', label: 'Next: The Stacks' },
        {
          move: 'skip',
          target: '7',
          label: 'Skip The Stacks, go to Harbor Lighthouse Mural',
        },
      ],
    });
    expect((await map.listed(BOB, 'Bob'))?.moves).toBeNull();
    // What lies ahead, as the post's small print words it, for anybody (the map's Route, R3).
    expect((await map.listed(BOB, 'Bob'))?.ahead).toBe(
      'Route: 1. Veterans Memorial Bridge · 2. The Stacks · 3. Harbor Lighthouse Mural',
    );
    await map.made.trains.setConductor(map.made.party.id, { id: REPORTER });
    expect((await map.listed(ALICE, 'Alice'))?.moves).toBeNull();
    expect((await map.listed(TEST_OWNER_ID, 'Owner'))?.moves?.place).toBe('4');
  });

  it('offers the undo of a turn-back route and says what Submit does where one move is left, as the dialog does', async () => {
    const map = await moving();
    web = map.web;
    await map.made.setAtEnd({ id: ALICE }, false, 'turn-back');
    await map.made.trains.move(map.made.party.id, { id: ALICE }, 'skip', false);
    const atEnd = (await map.listed(ALICE, 'Alice'))?.moves;
    expect(atEnd?.text).toBe(
      'At stop 3 of 3: Harbor Lighthouse Mural\nNext turns back to The Stacks',
    );
    expect(atEnd?.moves.map(({ label, line }) => [label, line])).toEqual([
      ['Next: turn back to The Stacks', undefined],
      [
        'Previous: back to The Stacks (undo)',
        'Back one stop, still heading for the end: undoes a Next made by mistake',
      ],
      ['Skip The Stacks, go to Veterans Memorial Bridge', undefined],
    ]);
    await map.made.setAtEnd({ id: ALICE }, false, 'finish');
    await map.made.trains.move(map.made.party.id, { id: ALICE }, 'next', false);
    const finished = (await map.listed(ALICE, 'Alice'))?.moves;
    expect(finished?.text).toBe(
      'The train has finished its route of 3 stops.\n\nSubmit takes it back to stop 3, ' +
        'Harbor Lighthouse Mural.',
    );
    expect(finished?.moves).toEqual([
      {
        move: 'previous',
        target: '7',
        label: 'Previous: back to stop 3, Harbor Lighthouse Mural',
      },
    ]);
  });

  it("lets only who may move it move it, in the command's words before the throttle", async () => {
    const throttles = new Throttles();
    const map = await moving({ throttles });
    web = map.web;
    const bob = await map.web.posting(BOB, 'Bob');
    const notSigned = await map.move('next', { from: '4', target: '1' }, bob);
    expect(notSigned.status).toBe(403);
    // With the train as Bob sees it, without Move…: the page closes the form.
    expect(notSigned.json).toMatchObject({
      ok: false,
      text: 'You are not signed up for this train.',
      train: { route: ['4', '1', '7'], moves: null },
    });
    await map.made.trains.setConductor(map.made.party.id, { id: REPORTER });
    const conducted = await map.move('next', { from: '4', target: '1' });
    expect(conducted.status).toBe(403);
    expect(conducted.json).toMatchObject({
      text: 'This train has a conductor: only they and the moderators can move it.',
      train: { moves: null, conductor: { who: 'other' } },
    });
    expect(
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, { uses: 1, perSeconds: 60 }, PARTY_NOW),
    ).toBeUndefined();
    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
    expect((await map.move('next', { from: '4', target: '1' }, owner)).status).toBe(200);
  });

  it("counts in the window of the post's controls, as a press of the panel is", async () => {
    const throttles = new Throttles();
    const map = await moving({ throttles });
    web = map.web;
    for (let use = 0; use < ACTION_THROTTLE.uses; use += 1) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const counted = await map.move('next', { from: '4', target: '1' });
    expect(counted.status).toBe(429);
    expect(counted.json.error).toBe('That was a lot of clicks. Try again in 1 minute.');
    expect(map.made.current().train.stop).toBe(0);
  });

  it('gives the use back when a press fails for no fault of the member, as a press of the panel does', async () => {
    const throttles = new Throttles();
    const map = await moving({ throttles });
    web = map.web;
    for (let use = 0; use < ACTION_THROTTLE.uses - 1; use += 1) {
      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
    }
    const update = vi
      .spyOn(map.made.store, 'update')
      .mockRejectedValue(new Error('the database is away'));
    expect((await map.move('next', { from: '4', target: '1' })).status).toBe(500);
    update.mockRestore();
    expect((await map.move('next', { from: '4', target: '1' })).status).toBe(200);
  });

  it('gives the use back when a conductor change fails for no fault of the member, as /conductor set does', async () => {
    const throttles = new Throttles();
    const map = await moving({ throttles });
    web = map.web;
    for (let use = 0; use < CHANGE_THROTTLE.uses - 1; use += 1) {
      throttles.use('conductor set', ALICE, CHANGE_THROTTLE, PARTY_NOW);
    }
    const update = vi
      .spyOn(map.made.store, 'update')
      .mockRejectedValue(new Error('the database is away'));
    expect((await map.conductor('take')).status).toBe(500);
    update.mockRestore();
    expect((await map.conductor('take')).status).toBe(200);
  });

  it('takes and gives up the conductor role as /conductor set and clear do, in their window', async () => {
    const throttles = new Throttles();
    const map = await moving({ throttles });
    web = map.web;
    const taken = await map.conductor('take');
    expect(taken.json).toMatchObject({
      ok: true,
      text: 'You are the conductor of this train. Only you and the moderators can move it now.',
      train: { conductor: { who: 'you', mayTake: false, mayDrop: true } },
    });
    expect((await map.listed(REPORTER, 'Reporter'))?.conductor).toEqual({
      who: 'other',
      mayTake: true,
      mayDrop: false,
    });
    const bob = await map.web.posting(BOB, 'Bob');
    const notSigned = await map.conductor('take', 'other', bob);
    expect(notSigned.status).toBe(403);
    expect(notSigned.json).toMatchObject({
      text: 'You are not signed up for this train.',
      train: { conductor: { who: 'other', mayTake: false, mayDrop: false } },
    });
    const notTheirs = await map.conductor(
      'give-up',
      'other',
      await map.web.posting(REPORTER, 'Reporter'),
    );
    expect(notTheirs.status).toBe(403);
    expect(notTheirs.json).toMatchObject({
      text: 'Only the conductor of this train and the moderators can do that.',
      train: { conductor: { who: 'other', mayTake: true, mayDrop: false } },
    });
    const given = await map.conductor('give-up', 'you');
    expect(given.json).toMatchObject({
      ok: true,
      text: 'You are no longer the conductor of this train. Anybody who is signed up can move it.',
      train: { conductor: { who: null, mayTake: true, mayDrop: false } },
    });
    for (let use = 0; use < CHANGE_THROTTLE.uses; use += 1) {
      throttles.use('conductor set', ALICE, CHANGE_THROTTLE, PARTY_NOW);
    }
    const counted = await map.conductor('take');
    expect(counted.status).toBe(429);
    expect(counted.json.error).toBe('You can do that again in 1 minute.');
  });

  it('takes the role over from another conductor without naming them', async () => {
    const map = await moving();
    web = map.web;
    await map.made.trains.setConductor(map.made.party.id, { id: REPORTER, name: 'Reporter' });
    const taken = await map.conductor('take', 'other');
    expect(taken.json).toMatchObject({
      ok: true,
      text:
        'You are the conductor of this train, in the place of the conductor before. ' +
        'Only you and the moderators can move it now.',
      train: { conductor: { who: 'you' } },
    });
    expect(taken.json.text).not.toContain('Reporter');
    expect(taken.json.text).not.toContain(REPORTER);
  });

  it("refuses a conductor button drawn when the role was somebody else's than it is now, and gives the train as it is now, uncounted", async () => {
    const throttles = new Throttles();
    const map = await moving({ throttles });
    web = map.web;
    // The page drew the train without a conductor; the reporter took the role meanwhile.
    await map.made.trains.setConductor(map.made.party.id, { id: REPORTER, name: 'Reporter' });
    const taken = await map.conductor('take', 'none');
    expect(taken.status).toBe(409);
    expect(taken.json).toMatchObject({
      ok: false,
      text: 'The conductor of this train changed meanwhile: here it is as it is now.',
      train: { conductor: { who: 'other', mayTake: true } },
    });
    expect(map.made.current().train.conductorId).toBe(REPORTER);
    // Drawn while Alice was it: she is not any more.
    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
    const dropped = await map.conductor('give-up', 'you', owner);
    expect(dropped.status).toBe(409);
    expect(map.made.current().train.conductorId).toBe(REPORTER);
    expect(
      throttles.use('conductor set', ALICE, { uses: 1, perSeconds: 60 }, PARTY_NOW),
    ).toBeUndefined();
    expect((await map.conductor('give-up', 'other', owner)).status).toBe(200);
    expect(map.made.current().train.conductorId).toBeNull();
  });

  it('refuses a conductor button whose role another member took while the press was on its way, inside the store', async () => {
    const map = await moving();
    web = map.web;
    const { gateway, trains, party } = map.made;
    // The reporter takes the role while Alice's press is asked about her forum: their change is
    // being stored as her press passes the route's own checks, and is in the store before hers.
    const ask = gateway.memberAccess.bind(gateway);
    let inFlight: Promise<unknown> | undefined;
    gateway.memberAccess = (forumId, memberId) => {
      if (memberId === ALICE) {
        inFlight ??= trains.setConductor(party.id, { id: REPORTER, name: 'Reporter' });
      }
      return ask(forumId, memberId);
    };
    const taken = await map.conductor('take', 'none');
    await inFlight;
    expect(taken.status).toBe(409);
    expect(taken.json).toMatchObject({
      ok: false,
      text: 'The conductor of this train changed meanwhile: here it is as it is now.',
      train: { conductor: { who: 'other', mayTake: true } },
    });
    expect(map.made.current().train.conductorId).toBe(REPORTER);
  });

  it('answers a train that is over (409), refuses a member kept out of its forum (403), and nothing while Discord cannot say (503)', async () => {
    const map = await moving();
    web = map.web;
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await map.move('next', { from: '4', target: '1' })).status).toBe(403);
    expect((await map.conductor('take')).status).toBe(403);
    map.made.gateway.barred.clear();
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const away = await map.move('next', { from: '4', target: '1' });
    expect(away.status).toBe(503);
    expect(away.json.error).toBe(UNREACHABLE);
    map.made.gateway.failing.clear();
    await map.made.service.end(map.made.party.id);
    const over = await map.move('next', { from: '4', target: '1' });
    expect(over.status).toBe(409);
    expect(over.json).toEqual({ ok: false, text: 'This train is over.' });
  });

  it('knows only its moves (404) and their bodies (400)', async () => {
    const map = await moving();
    web = map.web;
    expect((await map.move('jump', { from: '4' })).status).toBe(404);
    expect((await map.conductor('steal')).status).toBe(404);
    expect((await map.conductor('take', 'nobody')).status).toBe(400);
    expect((await map.post('conductor/take', {})).status).toBe(400);
    expect((await map.move('next', { from: '4' })).status).toBe(400);
    expect((await map.move('next', { from: '4', target: '1', more: 1 })).status).toBe(400);
    // Finish is Manage…'s since plan 8M-8C.
    expect((await map.move('finish', { from: '4' })).status).toBe(404);
    expect(map.made.current().train.stop).toBe(0);
  });

  it('logs a move as a command is logged: who, where, which train, what', async () => {
    const map = await moving();
    web = map.web;
    await map.move('next', { from: '4', target: '1' });
    await map.conductor('take');
    expect(map.web.entries).toContainEqual(
      expect.objectContaining({
        msg: 'a train was moved on the map',
        user: ALICE,
        guild: FAKE_GUILD_ID,
        party: map.made.party.id,
        move: 'next',
        outcome: 'ok',
      }),
    );
    expect(map.web.entries).toContainEqual(
      expect.objectContaining({
        msg: "a train's conductor was changed on the map",
        conductor: 'take',
        outcome: 'ok',
      }),
    );
  });
  it('answers Move… and the conductor once the post shows it (plan 8M-11A, S1): the ticket taken after the change', async () => {
    const map = await moving();
    web = map.web;
    const id = map.made.party.id;
    const before = map.made.store.get(id);
    expect((await map.move('next', { from: '4', target: '1' })).status).toBe(200);
    // Review fix R1: the ticket taken once the change returned, the party with it.
    expect(map.drawn.waits).toEqual([
      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
    ]);
    const moved = map.made.store.get(id);
    expect(moved).not.toBe(before);
    expect((await map.conductor('take')).status).toBe(200);
    expect(map.drawn.waits[1]).toEqual({
      partyId: id,
      at: map.made.store.get(id),
      maxMs: PRESS_SHOWN_MS,
    });
    expect(map.made.store.get(id)).not.toBe(moved);
  });
});
