import { asTestServerGyms } from '../../test/support/providers.js';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { watchImmediates } from '../../test/support/timers.js';
import {
  OTHER_GUILD_ROW,
  TEST_GUILD_ROW,
  testGym,
  testGyms,
  testLinks,
  testRegions,
  WEST_CHANNEL,
  WIDE_CHANNEL,
  wideRegion,
} from '../../test/support/gyms.js';
import { FORUM_TAGS } from '../render/party-post.js';
import { ALICE, BOB, CAROL, REPORTER, stops, gym, inGyms } from '../../test/support/parties.js';
import { gymsFixture } from '../../test/support/providers.js';
import { createdMeetup, createdTrain, reportedRaid } from '../../test/support/party-service.js';
import { attendeeOf, isTrain } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { currentStop } from '../domain/party/train.js';
import type { Member } from './attendance-service.js';
import { header, textOf } from '../../test/support/messages.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const maker: Member = { id: REPORTER, name: 'Rae' };

const maps = (id: number): string => {
  const gym = testGyms().find((found) => found.id === id);
  return `https://www.google.com/maps/search/?api=1&query=${gym?.lat}%2C${gym?.lon}`;
};

type Made = Awaited<ReturnType<typeof createdTrain>>;

/** Lets everything that is under way go out: the announcement of a move, the lines, the post. */
async function settled(made: Made): Promise<void> {
  await made.trains.flush();
  await made.attendance.flush();
  await made.service.flush();
}

/** A train on a route of these gyms, with Alice and Bob coming beside the member who made it. */
async function boarded(route: readonly number[] = [4, 1, 7, 2]): Promise<Made> {
  const made = await createdTrain({ route });
  await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
  await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
  await settled(made);
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  return made;
}

const edits = (made: Made): number => made.gateway.posts.get(made.postId)?.edits ?? 0;
const messages = (made: Made) =>
  made.gateway.messagesIn(made.postId).map((message) => message.message);
/** The first line of the last message that announced a movement (those carry mentions). */
const first = (made: Made): string =>
  (
    messages(made)
      .filter((message) => message.mention)
      .at(-1)?.content ?? ''
  ).split('\n')[0] ?? '';
const lines = (made: Made): string[] => made.said().join('\n').split('\n').filter(Boolean);

describe('TrainService: the route', () => {
  it('adds a stop for a member who is signed up, shows the post anew and says so in a line', async () => {
    const made = await boarded([4]);
    const before = edits(made);
    const outcome = await made.trains.addStop(made.party.id, alice, gym(1));
    expect(outcome).toMatchObject({ kind: 'ok', changed: true, number: 2 });
    expect(made.current().train).toMatchObject({ route: stops(4, 1), stop: 0 });
    // Who changed something is noted with their name and team, as everywhere.
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({ name: 'Alice', team: 'mystic' });
    await settled(made);
    expect(edits(made)).toBe(before + 1);
    expect(messages(made)).toEqual([
      { content: `**Alice** (<@${ALICE}>) added stop 2 to the route: **The Stacks**.` },
    ]);
    const message = made.gateway.posts.get(made.postId)?.message;
    expect(textOf(message)).toContain('-# Route: **1. Veterans Memorial Bridge** · 2. The Stacks');
  });

  it('refuses a gym that is on the route, and a member who is not signed up, and says nothing', async () => {
    const made = await boarded();
    const before = made.current();
    expect(await made.trains.addStop(made.party.id, alice, gym(4))).toEqual({
      kind: 'refused',
      reason: 'already-on-route',
    });
    expect(await made.trains.addStop(made.party.id, carol, gym(5))).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(made.current()).toBe(before);
    await settled(made);
    expect(messages(made)).toEqual([]);
  });

  it('refuses a gym that is not in the gym list, whoever asks', async () => {
    const made = await createdTrain({ route: stops(4) });
    for (const staff of [false, true]) {
      expect(await made.trains.addStop(made.party.id, maker, gym(999), staff)).toEqual({
        kind: 'refused',
        reason: 'gym-gone',
      });
    }
    await settled(made);
    expect(inGyms(made.current().train.route)).toEqual(inGyms([4]));
    expect(made.said()).toEqual([]);
  });

  it('takes a gym that is deleted off every route that has it, and says why', async () => {
    const made = await boarded([4, 1, 7]);
    const staff: Member = { id: '200000000000000009', name: 'Morgan' };

    const changed = await made.trains.gymRemoved(1, staff, 'The Library');
    await settled(made);

    expect(changed.changed.map((party) => party.id)).toEqual([made.party.id]);
    expect(changed.failed).toEqual([]);
    // Not the stop the train is at: it stays where it is, and nobody is pinged.
    expect(inGyms(made.current().train.route)).toEqual(inGyms([4, 7]));
    expect(inGyms(currentStop(made.current()))).toBe(4);
    expect(made.said()).toEqual(["**The Library** was removed from Pine's gym list."]);
    // A gym no train has changes nothing.
    const nothing = { changed: [], failed: [] };
    expect(await made.trains.gymRemoved(1, staff, 'The Library')).toEqual(nothing);
    expect(await made.trains.gymRemoved(12, staff, 'Post Office')).toEqual(nothing);
  });

  it('takes stops whose gym the list no longer knows off the routes, as its own act', async () => {
    const list = gymsFixture();
    const gone = new Set<number>();
    const gyms = {
      get: (id: number) => (gone.has(id) ? undefined : list.stored(id)),
      regionsOf: (id: number) => list.of(TEST_GUILD_ROW).regionsOf(id),
      size: 12,
    };
    const made = await createdTrain({ route: stops(4, 1, 7, 2) }, { gyms: asTestServerGyms(gyms) });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await settled(made);
    for (const message of made.gateway.messagesIn(made.postId)) {
      await made.gateway.deleteMessage(made.postId, message.id);
    }
    // Nothing is unknown: nothing happens.
    expect(await made.trains.removeUnknownStops()).toBe(0);

    // The stop the train is at and one further on.
    gone.add(4).add(7);
    expect(await made.trains.removeUnknownStops()).toBe(1);
    await settled(made);

    expect(inGyms(made.current().train.route)).toEqual(inGyms([1, 2]));
    expect(inGyms(currentStop(made.current()))).toBe(1);
    // As after any removal of the current stop, who was here is coming again; nobody is pinged.
    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Coming);
    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
      { content: "2 stops were removed: their gyms are no longer in Pine's gym list." },
    ]);
    expect(await made.trains.removeUnknownStops()).toBe(0);
  });

  it("takes a shared gym its server deleted off that server's trains only (plan 19B-2)", async () => {
    // The Mural (7) is both servers': it lies in East and in Wide, the second server's region
    // over West and East (given a forum here).
    const gyms = gymsFixture([], {
      links: [...testLinks(), { gymId: 7, guildId: OTHER_GUILD_ROW }],
      regions: [...testRegions(), wideRegion()],
    });
    const made = await createdTrain({ route: stops(4, 1, 7) }, { gyms });
    const WIDE_FORUM = '100000000000000061';
    made.regions.rows.push({ ...wideRegion(), forumChannelId: WIDE_FORUM });
    made.gateway.addForum(WIDE_FORUM, FORUM_TAGS);
    // A train of the second server at the Mural, made in Wide as its members make one.
    const other = await made.service.createTrain({
      name: 'Their round',
      creatorId: BOB,
      regionChannelId: WIDE_CHANNEL,
    });
    if (other.kind !== 'created') throw new Error('the second train was not made');
    expect(other.party.guildId).toBe(OTHER_GUILD_ROW);
    expect(
      await made.trains.addStop(other.party.id, { id: BOB, name: 'Bob' }, gym(7)),
    ).toMatchObject({ kind: 'ok' });
    await settled(made);
    gyms.unlink(7, TEST_GUILD_ROW);

    expect(await made.trains.removeUnknownStops()).toBe(1);
    expect(inGyms(made.current().train.route)).toEqual(inGyms([4, 1]));
    const theirs = made.store.get(other.party.id);
    expect(theirs && isTrain(theirs) ? inGyms(theirs.train.route) : []).toEqual(inGyms([7]));
    // Nor can it be added again to the deleting server's train.
    expect(await made.trains.addStop(made.party.id, maker, gym(7), true)).toEqual({
      kind: 'refused',
      reason: 'gym-gone',
    });
  });

  it('sweeps nothing while the gym list knows no gym at all', async () => {
    const gyms = { get: () => undefined, regionsOf: () => [], size: 0 };
    const made = await createdTrain({}, { gyms: asTestServerGyms(gyms) });
    // A route from before the list was lost.
    await made.store.update(made.party.id, (party) => ({
      party:
        party.type === 'train'
          ? { ...party, train: { ...party.train, route: stops(4, 1) } }
          : party,
    }));
    expect(inGyms(await made.trains.removeUnknownStops())).toBe(0);
    expect(inGyms(made.current().train.route)).toEqual(inGyms([4, 1]));
  });

  it('answers the trains it could not change, and goes on with the others', async () => {
    const made = await boarded([4, 1, 7]);
    const other = await made.service.createTrain({
      name: 'Sunday round',
      creatorId: REPORTER,
      regionChannelId: WEST_CHANNEL,
    });
    if (other.kind !== 'created') throw new Error('no train');
    await made.trains.addStop(other.party.id, maker, gym(1));
    await settled(made);
    const staff: Member = { id: '200000000000000009', name: 'Morgan' };
    // The first train cannot be stored; the second can.
    const save = made.storage.save.bind(made.storage);
    made.storage.save = (party) =>
      party.id === made.party.id ? Promise.reject(new Error('row is locked')) : save(party);

    const outcome = await made.trains.gymRemoved(1, staff, 'The Library');

    expect(inGyms(outcome.failed.map((party) => party.id))).toEqual(inGyms([made.party.id]));
    expect(inGyms(outcome.changed.map((party) => party.id))).toEqual(inGyms([other.party.id]));
    expect(inGyms(made.current().train.route)).toEqual(inGyms([4, 1, 7]));
    expect(
      made.entries.some(
        (entry) => entry.msg === 'could not take a deleted gym off the route of a train',
      ),
    ).toBe(true);
  });

  it('moves a train on whose current stop is deleted, for a staff member who is not on it', async () => {
    const made = await boarded([4, 1, 7]);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await made.trains.setConductor(made.party.id, bob);
    await settled(made);
    const staff: Member = { id: '200000000000000009', name: 'Morgan' };

    await made.trains.gymRemoved(4, staff, 'The Bridge');
    await settled(made);

    expect(inGyms(made.current().train.route)).toEqual(inGyms([1, 7]));
    expect(inGyms(currentStop(made.current()))).toBe(1);
    // As after any removal of the current stop: who was here is coming again.
    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Coming);
    // The staff member is not signed up, and is not made so.
    expect(attendeeOf(made.current(), staff.id)).toBeUndefined();
    expect(lines(made)).toContain("**The Bridge** was removed from Pine's gym list.");
    expect(lines(made).some((line) => line.startsWith('The train is moving to'))).toBe(true);
  });

  it('removes and moves stops by their numbers, keeping the train at its gym', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    expect(inGyms(currentStop(made.current()))).toBe(1);
    const removed = await made.trains.removeStop(made.party.id, alice, 1);
    expect(inGyms(removed)).toMatchObject(inGyms({ kind: 'ok', changed: true, stop: 4 }));
    expect(made.current().train).toMatchObject({ route: stops(1, 7, 2), stop: 0 });
    const moved = await made.trains.moveStop(made.party.id, bob, 1, 3);
    expect(inGyms(moved)).toMatchObject(inGyms({ kind: 'ok', changed: true, stop: 1 }));
    expect(inGyms(made.current().train)).toMatchObject(inGyms({ route: stops(7, 2, 1), stop: 2 }));
    expect(inGyms(currentStop(made.current()))).toBe(1);
    expect(await made.trains.moveStop(made.party.id, bob, 2, 2)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    expect(await made.trains.removeStop(made.party.id, bob, 9)).toEqual({
      kind: 'refused',
      reason: 'no-such-stop',
    });
    await made.attendance.flush();
    expect(lines(made)).toEqual([
      `**Alice** (<@${ALICE}>) took **Veterans Memorial Bridge** off the route.`,
      `**Bob** (<@${BOB}>) moved **The Stacks** to stop 3 of the route.`,
    ]);
  });

  it('clears the route for staff and for the conductor, and for nobody else', async () => {
    const made = await boarded();
    expect(await made.trains.clearRoute(made.party.id, alice, false)).toEqual({
      kind: 'refused',
      reason: 'conductor-or-staff',
    });
    await made.trains.setConductor(made.party.id, alice);
    expect(await made.trains.clearRoute(made.party.id, alice, false)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    expect(made.current().train).toMatchObject({ route: [], stop: 0, conductorId: ALICE });
    expect(await made.trains.clearRoute(made.party.id, carol, true)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    await made.attendance.flush();
    expect(lines(made).at(-1)).toBe(`**Alice** (<@${ALICE}>) cleared the route.`);
  });
});

describe('TrainService.move', () => {
  it('moves the train, puts who is here back to coming and shows the post anew', async () => {
    const made = await boarded();
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present, { remote: true });
    await settled(made);
    const before = edits(made);
    const outcome = await made.trains.move(made.party.id, alice, 'next', false);
    expect(inGyms(outcome)).toMatchObject(
      inGyms({
        kind: 'ok',
        changed: true,
        move: 'next',
        at: 1,
        finished: false,
      }),
    );
    expect(made.current().train.stop).toBe(1);
    expect(attendeeOf(made.current(), BOB)).toMatchObject({
      status: PartyStatus.Coming,
      remote: true,
    });
    await made.service.flush();
    expect(edits(made)).toBe(before + 1);
  });

  it('tells the others where the train is going, in one message that pings those who allow it', async () => {
    const made = await boarded();
    made.userSettings.set(BOB, { mentionsTrainStops: false });
    await made.trains.move(made.party.id, alice, 'next', false);
    // Nothing goes out before the move has stood for a moment.
    expect(messages(made)).toEqual([]);
    await settled(made);
    expect(messages(made)).toEqual([
      {
        content:
          `The train is moving to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).\n` +
          `<@${REPORTER}>`,
        mention: { users: [REPORTER] },
      },
    ]);
  });

  it('reads the settings of everybody it may ping in one read', async () => {
    const made = await boarded();
    const before = { ...made.users.reads };
    await made.trains.move(made.party.id, alice, 'next', false);
    await settled(made);
    expect(made.users.reads).toEqual({ get: before.get, getMany: before.getMany + 1 });
    expect(made.users.asked.at(-1)?.sort()).toEqual([REPORTER, BOB].sort());
  });

  it('does not ping who switched all mentions off, nor the member who moved the train', async () => {
    const made = await boarded();
    made.userSettings.set(REPORTER, { mentions: false });
    await made.trains.move(made.party.id, bob, 'next', false);
    await settled(made);
    expect(messages(made).at(-1)?.mention).toEqual({ users: [ALICE] });
  });

  it('says it also when nobody else is signed up: a line without a ping', async () => {
    const made = await createdTrain({ route: stops(4, 1) });
    await made.trains.move(made.party.id, maker, 'next', false);
    await settled(made);
    expect(messages(made)).toEqual([
      {
        content: `The train is moving to [The Stacks](<${maps(1)}>). Moved by **Rae** (<@${REPORTER}>).`,
        mention: { users: [] },
      },
    ]);
  });

  it('makes one message of Next pressed twice, saying where the train is then', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await settled(made);
    expect(messages(made)).toHaveLength(1);
    expect(messages(made)[0]?.content).toBe(
      `The train is moving to [Harbor Lighthouse Mural](<${maps(7)}>). Moved by **Alice** (<@${ALICE}>).\n` +
        `<@${REPORTER}> <@${BOB}>`,
    );
  });

  it('says nothing of a Finish that was taken back right away, and leaves who is here as here', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await settled(made);
    const before = messages(made).length;
    const finished = await made.trains.move(made.party.id, alice, 'finish', false);
    expect(finished).toMatchObject({ kind: 'ok', finished: true });
    expect(made.current().train).toMatchObject({ stop: 4, finishedFrom: gym(1) });
    const back = await made.trains.move(made.party.id, alice, 'previous', false);
    expect(inGyms(back)).toMatchObject(inGyms({ kind: 'ok', at: 1, finished: false }));
    await settled(made);
    // The train is where it was before the two moves: there is nothing to tell.
    expect(messages(made)).toHaveLength(before);
    expect(made.current().train).toMatchObject({ stop: 1, finishedFrom: null });
    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Present);
  });

  it('says that the train is back at its stop when a Finish is taken back after a while', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await made.trains.move(made.party.id, alice, 'finish', false);
    await settled(made);
    expect(first(made)).toBe(`The train has finished its route. Moved by **Alice** (<@${ALICE}>).`);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving back to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
    // Who was here when the route was finished is still here: the train came back to them.
    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Present);
  });

  it('says nothing of a move that was taken back right away', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await settled(made);
    expect(messages(made)).toEqual([]);
    expect(made.current().train.stop).toBe(0);
  });

  it('words each move: back, past a stop, and the end of the route', async () => {
    const made = await boarded();
    const said = async (move: 'next' | 'previous' | 'skip' | 'finish'): Promise<string> => {
      await made.trains.move(made.party.id, alice, move, false);
      await settled(made);
      return (messages(made).at(-1)?.content ?? '').split('\n')[0] ?? '';
    };
    expect(await said('skip')).toBe(
      `The train is moving to [Harbor Lighthouse Mural](<${maps(7)}>), skipping **The Stacks**. ` +
        `Moved by **Alice** (<@${ALICE}>).`,
    );
    expect(await said('previous')).toBe(
      `The train is moving back to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
    expect(await said('finish')).toBe(
      `The train has finished its route. Moved by **Alice** (<@${ALICE}>).`,
    );
    // Back from the end of the route to the stop it was finished from.
    expect(await said('previous')).toBe(
      `The train is moving back to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
    expect(await said('skip')).toBe(
      `The train is moving to [Old Stone Fountain](<${maps(2)}>), skipping ` +
        `**Harbor Lighthouse Mural**. Moved by **Alice** (<@${ALICE}>).`,
    );
    // From the last stop, Next finishes the route.
    expect(await said('next')).toBe(
      `The train has finished its route. Moved by **Alice** (<@${ALICE}>).`,
    );
    expect(made.current().train).toMatchObject({ stop: 4, finishedFrom: gym(2) });
    // Earlier announcements stay: the post is a feed.
    expect(messages(made)).toHaveLength(6);
    // Finishing the route ends nothing.
    expect(made.current()).toMatchObject({ status: 'active', endTime: null, deletionTime: null });
  });

  it('refuses a move that cannot be made, and one by who may not, and announces nothing', async () => {
    const made = await boarded();
    const refusedWith = async (member: Member, move: 'previous' | 'next', staff = false) =>
      made.trains.move(made.party.id, member, move, staff);
    expect(await refusedWith(alice, 'previous')).toEqual({
      kind: 'refused',
      reason: 'at-first-stop',
    });
    expect(await refusedWith(carol, 'next')).toEqual({ kind: 'refused', reason: 'not-attending' });
    await made.trains.setConductor(made.party.id, alice);
    expect(await refusedWith(bob, 'next')).toEqual({ kind: 'refused', reason: 'not-conductor' });
    expect(made.current().train.stop).toBe(0);
    // Staff move it whoever leads it, signed up or not.
    expect(inGyms(await refusedWith(carol, 'next', true))).toMatchObject(
      inGyms({ kind: 'ok', at: 1 }),
    );
    const empty = await createdTrain();
    expect(await empty.trains.move(empty.party.id, maker, 'next', false)).toEqual({
      kind: 'refused',
      reason: 'no-route',
    });
    await settled(empty);
    expect(messages(empty)).toEqual([]);
  });

  it('says nothing into the post of a train that ended before the announcement went out', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.service.end(made.party.id);
    await settled(made);
    expect(messages(made)).toEqual([]);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });
});

describe('TrainService: the conductor and the boss', () => {
  it('makes a member who is signed up the conductor, and says a takeover by name', async () => {
    const made = await boarded();
    expect(await made.trains.setConductor(made.party.id, carol)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(await made.trains.setConductor(made.party.id, alice)).toMatchObject({
      kind: 'ok',
      changed: true,
      previous: null,
    });
    expect(await made.trains.setConductor(made.party.id, alice)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    expect(await made.trains.setConductor(made.party.id, bob)).toMatchObject({
      kind: 'ok',
      changed: true,
      previous: ALICE,
    });
    expect(made.current().train.conductorId).toBe(BOB);
    await settled(made);
    expect(lines(made)).toEqual([
      `**Alice** (<@${ALICE}>) is the conductor of this train now.`,
      `**Bob** (<@${BOB}>) is the conductor of this train now, in the place of **Alice** (<@${ALICE}>).`,
    ]);
    // A line pings nobody.
    expect(messages(made).every((message) => message.mention === undefined)).toBe(true);
    const message = made.gateway.posts.get(made.postId)?.message;
    expect(header(message)).toContain('Conductor: Bob');
  });

  it('takes the conductor off for themself and for staff, and for nobody else', async () => {
    const made = await boarded();
    await made.trains.setConductor(made.party.id, alice);
    expect(await made.trains.clearConductor(made.party.id, bob, false)).toEqual({
      kind: 'refused',
      reason: 'conductor-or-staff',
    });
    expect(await made.trains.clearConductor(made.party.id, carol, true)).toMatchObject({
      kind: 'ok',
      changed: true,
      previous: ALICE,
    });
    await made.trains.setConductor(made.party.id, bob);
    expect(await made.trains.clearConductor(made.party.id, bob, false)).toMatchObject({
      kind: 'ok',
      changed: true,
      previous: BOB,
    });
    expect(await made.trains.clearConductor(made.party.id, bob, false)).toMatchObject({
      kind: 'ok',
      changed: false,
      previous: null,
    });
    await made.attendance.flush();
    expect(lines(made).filter((line) => /conductor/.test(line))).toEqual([
      `**Alice** (<@${ALICE}>) is the conductor of this train now.`,
      `**Carol** (<@${CAROL}>) took **Alice** (<@${ALICE}>) off as the conductor of this train.`,
      `**Bob** (<@${BOB}>) is the conductor of this train now.`,
      `**Bob** (<@${BOB}>) is no longer the conductor of this train.`,
    ]);
  });

  it('frees the conductor who leaves, and the post says that the train has none', async () => {
    const made = await boarded();
    await made.trains.setConductor(made.party.id, alice);
    await made.attendance.flush();
    await made.attendance.leave(made.party.id, alice);
    expect(made.current().train.conductorId).toBeNull();
    await made.trains.setConductor(made.party.id, bob);
    await made.attendance.flush();
    // Done means leave on a train.
    await made.attendance.done(made.party.id, bob);
    expect(made.current().train.conductorId).toBeNull();
    await made.attendance.flush();
    expect(lines(made).filter((line) => /has left/.test(line))).toEqual([
      `**Alice** (<@${ALICE}>) has left: this train has no conductor now.`,
      `**Bob** (<@${BOB}>) has left: this train has no conductor now.`,
    ]);
    // Anybody who is signed up may move it again.
    expect(await made.trains.move(made.party.id, maker, 'next', false)).toMatchObject({
      kind: 'ok',
    });
  });

  it('sets the boss the train is after, which the post shows, and removes it again', async () => {
    const made = await boarded();
    const yveltal = { boss: { key: 'yveltal' }, label: 'Yveltal' };
    expect(await made.trains.setBoss(made.party.id, alice, yveltal)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    expect(await made.trains.setBoss(made.party.id, alice, yveltal)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    await settled(made);
    const message = made.gateway.posts.get(made.postId)?.message;
    expect(header(message)[1]).toMatch(/^\*\*After Yveltal\*\*/);
    expect(textOf(message)).toContain('**Weaknesses**');
    await made.trains.setBoss(made.party.id, bob, { boss: null, label: '' });
    await made.attendance.flush();
    expect(lines(made)).toEqual([
      `**Alice** (<@${ALICE}>) set the boss this train is after: **Yveltal**.`,
      `**Bob** (<@${BOB}>) removed the boss of this train.`,
    ]);
    expect(made.current().train.boss).toBeNull();
  });
});

describe('TrainService: what is no train', () => {
  it('finds no train in a raid, in a meetup, or where there is no party', async () => {
    const raid = await reportedRaid();
    const before = raid.current();
    expect(await raid.trains.addStop(raid.party.id, maker, gym(4))).toEqual({ kind: 'gone' });
    expect(await raid.trains.move(raid.party.id, maker, 'next', true)).toEqual({ kind: 'gone' });
    expect(await raid.trains.setConductor(raid.party.id, maker)).toEqual({ kind: 'gone' });
    expect(raid.current()).toBe(before);
    const meetup = await createdMeetup();
    expect(await meetup.trains.setBoss(meetup.party.id, maker, { boss: null, label: '' })).toEqual({
      kind: 'gone',
    });
    expect(await meetup.trains.clearRoute('no-such-party', maker, true)).toEqual({ kind: 'gone' });
  });
});

describe('TrainService: the announcement goes by where the train is, not by the number of its stop', () => {
  it('says where the train went when an earlier stop is removed right after the move', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    // The train is at the first stop of the route again, by number: but it has moved.
    await made.trains.removeStop(made.party.id, bob, 1);
    expect(made.current().train).toMatchObject({ route: stops(1, 7, 2), stop: 0 });
    await settled(made);
    expect(messages(made).filter((message) => message.mention)).toHaveLength(1);
    expect(first(made)).toBe(
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
  });

  it('says that the route is finished when a stop is removed right after Finish', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'finish', false);
    await made.trains.removeStop(made.party.id, bob, 1);
    await settled(made);
    expect(first(made)).toBe(`The train has finished its route. Moved by **Alice** (<@${ALICE}>).`);
  });

  it('says where a train that had finished went on to: back, and on to a stop that was added', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'skip', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await settled(made);
    const before = messages(made).length;
    // Back to the last stop, a stop more, and on to it: the number of the stop is what it was.
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.addStop(made.party.id, bob, gym(3));
    await made.trains.move(made.party.id, alice, 'next', false);
    expect(made.current().train).toMatchObject({ route: stops(4, 1, 7, 2, 3), stop: 4 });
    await settled(made);
    expect(messages(made).filter((message) => message.mention)).toHaveLength(before + 1);
    expect(first(made)).toBe(
      `The train is moving to [St. Mary's Church](<${maps(3)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
  });

  it('does not say "back" for a move forward whose target was then put at the front', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.moveStop(made.party.id, bob, 2, 1);
    expect(made.current().train).toMatchObject({ route: stops(1, 4, 7, 2), stop: 0 });
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
  });

  it('says "back" when the train went back and the gym it came from was then removed', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'skip', false);
    await settled(made);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.removeStop(made.party.id, bob, 3);
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving back to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
  });

  it('says nothing when the route is cleared right after a move', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.clearRoute(made.party.id, carol, true);
    await settled(made);
    expect(messages(made).filter((message) => message.mention)).toEqual([]);
    expect(made.said().join('\n')).not.toMatch(/Unknown gym|moving/);
  });

  it('keeps "skipping" for one skip whose target is where the train is, and drops it otherwise', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'skip', false);
    await made.trains.removeStop(made.party.id, bob, 1);
    await settled(made);
    expect(first(made)).toContain(', skipping **The Stacks**.');
    const other = await boarded();
    await other.trains.move(other.party.id, alice, 'skip', false);
    // The stop the train skipped to is removed: it is at the next one, which nothing skipped to.
    await other.trains.removeStop(other.party.id, alice, 3);
    await settled(other);
    expect(first(other)).toBe(
      `The train is moving to [Old Stone Fountain](<${maps(2)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
  });
});

describe('TrainService: an edit of the route that changes where the train is', () => {
  it('is refused for who may not move the train, and other edits are not', async () => {
    const made = await boarded();
    await made.trains.setConductor(made.party.id, alice);
    await made.trains.move(made.party.id, alice, 'next', false);
    const notConductor = { kind: 'refused', reason: 'not-conductor' };
    expect(await made.trains.removeStop(made.party.id, bob, 2)).toEqual(notConductor);
    expect(await made.trains.removeStop(made.party.id, bob, 4)).toMatchObject({
      kind: 'ok',
      moved: false,
    });
    expect(await made.trains.addStop(made.party.id, bob, gym(3))).toMatchObject({
      kind: 'ok',
      moved: false,
    });
    await made.trains.move(made.party.id, alice, 'finish', false);
    expect(await made.trains.addStop(made.party.id, bob, gym(5))).toEqual(notConductor);
    // A moderator may, and so may the conductor.
    expect(await made.trains.addStop(made.party.id, bob, gym(5), true)).toMatchObject({
      kind: 'ok',
      moved: true,
    });
    expect(made.current().train.conductorId).toBe(ALICE);
  });

  it('announces the next gym once and puts who is here back to coming', async () => {
    const made = await boarded();
    await made.trains.setConductor(made.party.id, alice);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await settled(made);
    const before = messages(made).length;
    const outcome = await made.trains.removeStop(made.party.id, alice, 1);
    expect(inGyms(outcome)).toMatchObject(
      inGyms({ kind: 'ok', changed: true, stop: 4, moved: true }),
    );
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Coming);
    await settled(made);
    const said = messages(made).slice(before);
    expect(said.map((message) => message.content).sort()).toEqual([
      `**Alice** (<@${ALICE}>) took **Veterans Memorial Bridge** off the route.`,
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).\n` +
        `<@${REPORTER}> <@${BOB}>`,
    ]);
  });

  it('announces that the route is finished when the last stop the train is at is removed', async () => {
    const made = await boarded([4, 1]);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await settled(made);
    await made.trains.removeStop(made.party.id, alice, 2);
    // Who is here stays here: there is nowhere to come to.
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    await settled(made);
    expect(first(made)).toBe(`The train has finished its route. Moved by **Alice** (<@${ALICE}>).`);
  });

  it('announces the stop a finished train goes on to', async () => {
    const made = await boarded([4]);
    await made.trains.move(made.party.id, alice, 'finish', false);
    await settled(made);
    await made.trains.addStop(made.party.id, bob, gym(1));
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by **Bob** (<@${BOB}>).`,
    );
  });
});

describe('TrainService.move from where the train was seen', () => {
  it('moves the train once when two members press Next on the same stop at the same moment', async () => {
    const made = await boarded();
    const both = await Promise.all([
      made.trains.move(made.party.id, alice, 'next', false, '4'),
      made.trains.move(made.party.id, bob, 'next', false, '4'),
    ]);
    expect(both.map((outcome) => outcome.kind).sort()).toEqual(['ok', 'refused']);
    expect(both.find((outcome) => outcome.kind === 'refused')).toEqual({
      kind: 'refused',
      reason: 'train-moved-on',
    });
    expect(made.current().train.stop).toBe(1);
    // Typed twice, `/next` moves twice: a command says where to go, not where from.
    await Promise.all([
      made.trains.move(made.party.id, alice, 'next', false),
      made.trains.move(made.party.id, bob, 'next', false),
    ]);
    expect(made.current().train.stop).toBe(3);
  });
});

describe('TrainService: the first stop of a route', () => {
  it('is said in a line and announced to nobody, also when a member adds it to a led train', async () => {
    const made = await createdTrain();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await made.trains.setConductor(made.party.id, alice);
    await settled(made);
    const before = messages(made).length;
    expect(await made.trains.addStop(made.party.id, bob, gym(4))).toMatchObject({
      kind: 'ok',
      changed: true,
      number: 1,
      moved: false,
    });
    expect(await made.trains.addStop(made.party.id, bob, gym(1))).toMatchObject({ moved: false });
    // Who is here stays here: nobody was on the way.
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    await settled(made);
    // Two lines, in one message or two, and nothing that announces a movement.
    const said = messages(made).slice(before);
    expect(said.every((message) => message.mention === undefined)).toBe(true);
    expect(said.flatMap((message) => (message.content ?? '').split('\n'))).toEqual([
      `**Bob** (<@${BOB}>) added stop 1 to the route: **Veterans Memorial Bridge**.`,
      `**Bob** (<@${BOB}>) added stop 2 to the route: **The Stacks**.`,
    ]);
  });

  it('announces nothing when the route is cleared and a first stop added in one window', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.clearRoute(made.party.id, carol, true);
    await made.trains.addStop(made.party.id, alice, gym(2));
    await settled(made);
    expect(messages(made).filter((message) => message.mention)).toEqual([]);
    // The same when the only stop is removed and another one added.
    const one = await boarded([4]);
    await one.trains.removeStop(one.party.id, alice, 1);
    await one.trains.addStop(one.party.id, alice, gym(2));
    await settled(one);
    expect(messages(one).filter((message) => message.mention)).toEqual([]);
  });
});

describe('TrainService: "back" is said only of going back', () => {
  it('says "moving to" when the train ends up at an earlier stop by other steps than Previous alone', async () => {
    const made = await boarded([4, 1]);
    // The stop the train is at is removed, Next finishes the route, Previous takes it back.
    await made.trains.removeStop(made.party.id, alice, 1);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'previous', false);
    expect(inGyms(currentStop(made.current()))).toBe(1);
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
  });

  it('says "back" for Previous, Finish, Previous: the Finish taken back is no step forward', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await settled(made);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.move(made.party.id, alice, 'finish', false);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving back to [Veterans Memorial Bridge](<${maps(4)}>). ` +
        `Moved by **Alice** (<@${ALICE}>).`,
    );
    // Forward, a Next that finishes the route and Previous: still forward.
    const last = await boarded([4, 1, 7]);
    await last.trains.move(last.party.id, alice, 'next', false);
    await settled(last);
    await last.trains.move(last.party.id, alice, 'next', false);
    await last.trains.move(last.party.id, alice, 'next', false);
    await last.trains.move(last.party.id, alice, 'previous', false);
    await settled(last);
    expect(first(last)).toBe(
      `The train is moving to [Harbor Lighthouse Mural](<${maps(7)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
  });

  it('says "back" for Previous, once or several times, and nothing else', async () => {
    const made = await boarded();
    // The route is finished from its last stop, by Next.
    await made.trains.move(made.party.id, alice, 'skip', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await settled(made);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await settled(made);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving back to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.move(made.party.id, alice, 'skip', false);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.move(made.party.id, alice, 'previous', false);
    // From The Stacks back to the bridge, by a detour: not all of it was going back.
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving to [Veterans Memorial Bridge](<${maps(4)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
  });
});

describe('TrainService: staff who are not signed up', () => {
  it('may edit the route as they may move the train', async () => {
    const made = await boarded();
    expect(await made.trains.addStop(made.party.id, carol, gym(3))).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(await made.trains.addStop(made.party.id, carol, gym(3), true)).toMatchObject({
      kind: 'ok',
    });
    expect(inGyms(await made.trains.moveStop(made.party.id, carol, 5, 1, true))).toMatchObject(
      inGyms({
        kind: 'ok',
        stop: 3,
      }),
    );
    expect(await made.trains.removeStop(made.party.id, carol, 1, true)).toMatchObject({
      kind: 'ok',
      stop: gym(3),
    });
    // Staff are not signed up by it.
    expect(attendeeOf(made.current(), CAROL)).toBeUndefined();
  });
});

/**
 * Lets the announcements of a train hang on their way to Discord (those carry mentions; lines
 * do not) until what `hold` answers is called. `turn` lets what is under way come as far as it
 * can meanwhile.
 */
function slowAnnouncements(made: Made) {
  let gate: Promise<void> | undefined;
  const immediates = watchImmediates();
  onTestFinished(() => {
    immediates.restore();
  });
  const send = made.gateway.sendMessage.bind(made.gateway);
  made.gateway.sendMessage = async (channelId, message) => {
    if (message.mention) await gate;
    return send(channelId, message);
  };
  return {
    hold: (): (() => void) => {
      let release = (): void => undefined;
      gate = new Promise<void>((resolve) => (release = resolve));
      return () => {
        gate = undefined;
        release();
      };
    },
    /** What is under way comes as far as it can while the announcement is held. */
    settle: () => immediates.settle(),
  };
}

/** The first line of every message that announced a movement, oldest first. */
const announced = (made: Made): (string | undefined)[] =>
  messages(made)
    .filter((message) => message.mention)
    .map((message) => message.content?.split('\n')[0]);

describe('TrainService: moves while an announcement is on its way', () => {
  it('says every place once, each message true, and the last place last', async () => {
    const made = await boarded([4, 1, 7, 2]);
    // Sending the announcement takes longer than the wait for the next one.
    const slow = slowAnnouncements(made);
    const release = slow.hold();
    await made.trains.move(made.party.id, alice, 'next', false);
    const one = made.trains.flush();
    await slow.settle();
    // The second announcement has waited for its delay and stands behind the first.
    await made.trains.move(made.party.id, alice, 'next', false);
    const two = made.trains.flush();
    await slow.settle();
    await made.trains.move(made.party.id, alice, 'next', false);
    release();
    await Promise.all([one, two]);
    await settled(made);
    // Not the fountain twice, and the mural never: the second and the third are one message.
    expect(announced(made)).toEqual([
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).`,
      `The train is moving to [Old Stone Fountain](<${maps(2)}>). Moved by **Alice** (<@${ALICE}>).`,
    ]);
    expect(inGyms(currentStop(made.current()))).toBe(2);
  });

  it('keeps of two announcements made one where the first began, and what the steps were', async () => {
    const made = await boarded([4, 1, 7, 2]);
    // The route is finished from its last stop, by Next.
    await made.trains.move(made.party.id, alice, 'skip', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await settled(made);
    const slow = slowAnnouncements(made);
    // Back to the last stop: on its way. Then back again, and back once more.
    let release = slow.hold();
    await made.trains.move(made.party.id, alice, 'previous', false);
    const one = made.trains.flush();
    await slow.settle();
    await made.trains.move(made.party.id, alice, 'previous', false);
    const two = made.trains.flush();
    await slow.settle();
    await made.trains.move(made.party.id, alice, 'previous', false);
    release();
    await Promise.all([one, two]);
    await settled(made);
    // Every step of the two that became one message was Previous: "back".
    const before = announced(made);
    expect(before.slice(-2)).toEqual([
      `The train is moving back to [Old Stone Fountain](<${maps(2)}>). Moved by **Alice** (<@${ALICE}>).`,
      `The train is moving back to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).`,
    ]);
    // On to the mural: on its way. A step forward and one back, made one message, leave the
    // train where the first of them began, which the message on its way has said.
    release = slow.hold();
    await made.trains.move(made.party.id, alice, 'next', false);
    const three = made.trains.flush();
    await slow.settle();
    await made.trains.move(made.party.id, alice, 'next', false);
    const four = made.trains.flush();
    await slow.settle();
    await made.trains.move(made.party.id, alice, 'previous', false);
    release();
    await Promise.all([three, four]);
    await settled(made);
    expect(announced(made)).toEqual([
      ...before,
      `The train is moving to [Harbor Lighthouse Mural](<${maps(7)}>). Moved by **Alice** (<@${ALICE}>).`,
    ]);
    expect(inGyms(currentStop(made.current()))).toBe(7);
  });
});

/** A train on the route of `boarded`, at its last stop, that does this at the end. */
async function atLastStop(atEnd: 'loop' | 'turn-back'): Promise<Made> {
  const made = await boarded();
  await made.setAtEnd(alice, false, atEnd);
  for (let n = 0; n < 3; n++) await made.trains.move(made.party.id, alice, 'next', false);
  await settled(made);
  expect(currentStop(made.current())).toEqual(gym(2));
  return made;
}

describe('TrainService: what a train does at the end of its route', () => {
  it('goes round from the last stop of a loop, and says so', async () => {
    const made = await atLastStop('loop');
    const outcome = await made.trains.move(made.party.id, alice, 'next', false);
    expect(inGyms(outcome)).toMatchObject(
      inGyms({ kind: 'ok', at: 4, turn: 'round', finished: false }),
    );
    await settled(made);
    expect(first(made)).toBe(
      `The train is going round again, back to [Veterans Memorial Bridge](<${maps(4)}>). ` +
        `Moved by **Alice** (<@${ALICE}>).`,
    );
    expect(made.current().train).toMatchObject({ route: stops(4, 1, 7, 2), stop: 0 });
  });

  it('turns back at the last stop, runs the route the other way and says where it turned', async () => {
    const made = await atLastStop('turn-back');
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    const outcome = await made.trains.move(made.party.id, alice, 'next', false);
    expect(inGyms(outcome)).toMatchObject(
      inGyms({ kind: 'ok', at: 7, turn: 'back', finished: false }),
    );
    await settled(made);
    expect(first(made)).toBe(
      'The train is turning back at **Old Stone Fountain**, on to ' +
        `[Harbor Lighthouse Mural](<${maps(7)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
    expect(made.current().train).toMatchObject({ route: stops(2, 7, 1, 4), stop: 1 });
    // A movement like any other: who was here is coming again.
    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Coming);
  });

  it('says what a skip round the end or back along the route left out', async () => {
    const looping = await atLastStop('loop');
    await looping.trains.move(looping.party.id, alice, 'skip', false);
    await settled(looping);
    expect(first(looping)).toBe(
      `The train is going round again, back to [The Stacks](<${maps(1)}>), skipping ` +
        `**Veterans Memorial Bridge**. Moved by **Alice** (<@${ALICE}>).`,
    );
    const turning = await atLastStop('turn-back');
    await turning.trains.move(turning.party.id, alice, 'skip', false);
    await settled(turning);
    expect(first(turning)).toBe(
      'The train is turning back at **Old Stone Fountain**, on to ' +
        `[The Stacks](<${maps(1)}>), skipping **Harbor Lighthouse Mural**. ` +
        `Moved by **Alice** (<@${ALICE}>).`,
    );
  });

  it('says the round of a gathered run whose last step it was, and not one followed by a step', async () => {
    const made = await boarded();
    await made.setAtEnd(alice, false, 'loop');
    await made.trains.move(made.party.id, alice, 'skip', false);
    await settled(made);
    // On to the last stop and round to the first, in one window: the round is the last step.
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await settled(made);
    expect(first(made)).toBe(
      `The train is going round again, back to [Veterans Memorial Bridge](<${maps(4)}>). ` +
        `Moved by **Alice** (<@${ALICE}>).`,
    );
    // Round and on again in one window: the train is simply moving to where it is.
    await made.trains.move(made.party.id, alice, 'skip', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await settled(made);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).`,
    );
  });

  it('says nothing of a turn that was taken back right away: the train is where it was', async () => {
    const made = await atLastStop('turn-back');
    const before = messages(made).length;
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await settled(made);
    expect(messages(made)).toHaveLength(before);
    // At the gym it turned at, which is the first stop of the route as it runs now.
    expect(made.current().train).toMatchObject({ route: stops(2, 7, 1, 4), stop: 0 });
  });

  it('goes on round the loop when its current last stop is removed, as a movement', async () => {
    const made = await atLastStop('loop');
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    const outcome = await made.trains.removeStop(made.party.id, alice, 4);
    expect(outcome).toMatchObject({ kind: 'ok', moved: true });
    await settled(made);
    expect(made.current().train).toMatchObject({ route: stops(4, 1, 7), stop: 0 });
    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Coming);
    expect(first(made)).toContain(`[Veterans Memorial Bridge](<${maps(4)}>)`);
  });

  it('turns back when the current last stop of a turn-back train is removed', async () => {
    const made = await atLastStop('turn-back');
    const outcome = await made.trains.removeStop(made.party.id, alice, 4);
    expect(outcome).toMatchObject({ kind: 'ok', moved: true });
    await settled(made);
    expect(inGyms(made.current().train)).toMatchObject(inGyms({ route: stops(7, 1, 4), stop: 0 }));
    expect(inGyms(currentStop(made.current()))).toBe(7);
  });
});

describe('TrainService.manage: Reverse alone (once TrainService.reverse)', () => {
  it('reverses the route at its first stop, says so in a line, and pings nobody', async () => {
    const made = await boarded();
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await settled(made);
    const before = messages(made).length;
    const outcome = await made.reverse(alice, false, '4');
    expect(outcome).toMatchObject({ kind: 'ok', changed: true, restarted: false });
    expect(made.current().train).toMatchObject({
      route: stops(2, 7, 1, 4),
      stop: 3,
      atEnd: 'finish',
    });
    await settled(made);
    expect(lines(made).at(-1)).toBe(
      `The route was reversed by **Alice** (<@${ALICE}>): it now runs from ` +
        '**Old Stone Fountain** to **Veterans Memorial Bridge**.',
    );
    expect(
      messages(made)
        .slice(before)
        .filter((message) => message.mention?.users?.length),
    ).toEqual([]);
    // No movement: who is here stays here, and nothing is announced.
    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Present);
  });

  // Review r0 of 8X-F, X5-3: a sentence that ends with a stop's name ends once.
  it('ends the line of a reversal once after a stop whose name ends in a period', async () => {
    const inc = testGym(13, 'Fire Company Inc.', 40.051, -80.051);
    const made = await createdTrain({ route: [13, 4] }, { gyms: gymsFixture([inc]) });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    await made.reverse(alice, false, '13');
    await settled(made);
    expect(lines(made).at(-1)).toBe(
      `The route was reversed by **Alice** (<@${ALICE}>): it now runs from ` +
        '**Veterans Memorial Bridge** to **Fire Company Inc.**',
    );
  });

  it('starts a route that was finished from its last stop again, from there', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'skip', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await settled(made);
    const outcome = await made.reverse(alice, false, 'end');
    expect(outcome).toMatchObject({ kind: 'ok', restarted: true });
    expect(made.current().train).toMatchObject({
      route: stops(2, 7, 1, 4),
      stop: 0,
      finishedFrom: null,
    });
    await settled(made);
    expect(lines(made).at(-1)).toBe(
      `The route was reversed by **Alice** (<@${ALICE}>): it now runs from ` +
        '**Old Stone Fountain** to **Veterans Memorial Bridge**, and starts again at ' +
        '**Old Stone Fountain**.',
    );
  });

  it("reverses once for one panel: a second press, or another member's old panel, changes nothing", async () => {
    const made = await boarded();
    // Both panels were drawn at the first stop, while the route began at gym 4.
    expect(await made.reverse(alice, false, '4', '4')).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    expect(await made.reverse(alice, false, '4', '4')).toEqual({
      kind: 'refused',
      reason: 'route-changed',
    });
    expect(await made.reverse(bob, false, '4', '4')).toEqual({
      kind: 'refused',
      reason: 'route-changed',
    });
    expect(made.current().train).toMatchObject({ route: stops(2, 7, 1, 4), stop: 3 });
    await settled(made);
    expect(lines(made).filter((line) => /reversed/.test(line))).toHaveLength(1);
  });

  it('refuses what cannot be reversed, and who may not move the train', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    expect(await made.reverse(alice, false)).toEqual({
      kind: 'refused',
      reason: 'reverse-mid-route',
    });
    expect(await made.reverse(carol, false)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(await made.reverse(alice, false, '4')).toEqual({
      kind: 'refused',
      reason: 'train-moved-on',
    });
    await made.setAtEnd(alice, false, 'turn-back');
    expect(await made.reverse(alice, false)).toEqual({
      kind: 'refused',
      reason: 'reverse-turns-back',
    });
    await made.setAtEnd(alice, false, 'loop');
    expect(await made.reverse(alice, false)).toMatchObject({ kind: 'ok' });
    expect(made.current().train).toMatchObject({
      route: stops(2, 7, 1, 4),
      stop: 2,
      atEnd: 'loop',
    });
  });

  it('names no maker who asked not to be named', async () => {
    const made = await createdTrain({ route: stops(4, 1), anonymous: true });
    await made.reverse(maker, false);
    await settled(made);
    expect(lines(made).at(-1)).toBe(
      'The route was reversed: it now runs from **The Stacks** to **Veterans Memorial Bridge**.',
    );
  });
});

describe('TrainService.manage: the mode alone (once TrainService.setAtEnd)', () => {
  it('sets the mode, says so in a line without a ping, and nothing for the mode it has', async () => {
    const made = await boarded();
    expect(await made.setAtEnd(alice, false, 'loop')).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    expect(await made.setAtEnd(alice, false, 'loop')).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    await made.setAtEnd(bob, false, 'turn-back');
    await made.setAtEnd(alice, false, 'finish');
    await settled(made);
    expect(lines(made).filter((line) => /set the train/.test(line))).toEqual([
      `**Alice** (<@${ALICE}>) set the train to loop.`,
      `**Bob** (<@${BOB}>) set the train to turn back at the end.`,
      `**Alice** (<@${ALICE}>) set the train to finish at the last stop.`,
    ]);
    expect(messages(made).filter((message) => message.mention?.users?.length)).toEqual([]);
  });

  it('is for whoever may arrange the route: also a member who is not the conductor', async () => {
    const made = await boarded();
    expect(await made.setAtEnd(carol, false, 'loop')).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    await made.trains.setConductor(made.party.id, alice);
    expect(await made.setAtEnd(bob, false, 'loop')).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    expect(await made.setAtEnd(carol, true, 'turn-back')).toMatchObject({
      kind: 'ok',
    });
  });

  it('names no maker who asked not to be named, who may set it without being signed up', async () => {
    const made = await createdTrain({ route: stops(4, 1), anonymous: true });
    await made.attendance.leave(made.party.id, maker);
    expect(await made.setAtEnd(maker, false, 'loop')).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    await settled(made);
    expect(lines(made).at(-1)).toBe('The train was set to loop.');
  });

  it('makes a train with the mode it was asked for', async () => {
    const made = await createdTrain({ route: stops(4, 1), atEnd: 'turn-back' });
    expect(made.current().train.atEnd).toBe('turn-back');
  });
});

describe('TrainService: a saved route keeps its mode', () => {
  it('saves the order and the mode the train has, and a load sets both', async () => {
    const made = await boarded();
    await made.setAtEnd(alice, false, 'loop');
    await made.reverse(alice, false);
    const saved = await made.trains.saveRoute(made.party.id, alice, 'Round the park');
    expect(saved).toMatchObject({
      kind: 'saved',
      route: { name: 'Round the park', stops: stops(2, 7, 1, 4), atEnd: 'loop' },
    });
    await made.setAtEnd(alice, false, 'finish');
    await made.trains.move(made.party.id, alice, 'next', false);
    if (saved.kind !== 'saved') throw new Error(saved.kind);
    const loaded = await made.trains.loadRoute(made.party.id, alice, saved.route.id);
    expect(loaded).toMatchObject({ kind: 'ok', changed: true });
    expect(made.current().train).toMatchObject({
      route: stops(2, 7, 1, 4),
      stop: 0,
      atEnd: 'loop',
    });
    await settled(made);
    expect(lines(made).at(-1)).toBe(
      `**Alice** (<@${ALICE}>) loaded the route **Round the park**: 4 stops. The train is at ` +
        'the first. At the end it loops back to the first stop.',
    );
  });
});

describe('TrainService.manage (plan 8X-G: Manage…)', () => {
  it('makes the kind, the route and the mode one change: one write, one line, in that order', async () => {
    const made = await boarded();
    const updates = vi.spyOn(made.store, 'update');
    const outcome = await made.trains.manage(
      made.party.id,
      alice,
      false,
      { kind: 'gigantamax', route: 'reverse', atEnd: 'loop' },
      { from: '4', first: '4' },
    );
    expect(outcome).toMatchObject({ kind: 'ok', changed: true, kindSet: true, route: 'reversed' });
    expect(updates).toHaveBeenCalledTimes(1);
    expect(made.current().train).toMatchObject({
      kind: 'gigantamax',
      route: stops(2, 7, 1, 4),
      stop: 3,
      atEnd: 'loop',
    });
    await settled(made);
    expect(lines(made)).toEqual([
      `**Alice** (<@${ALICE}>) made this a Gigantamax Train. The route was reversed by ` +
        `**Alice** (<@${ALICE}>): it now runs from **Old Stone Fountain** to ` +
        `**Veterans Memorial Bridge**. **Alice** (<@${ALICE}>) set the train to loop.`,
    ]);
  });

  it('judges the route before the mode, and refuses all of it when one part is refused', async () => {
    const made = await createdTrain({ route: [4, 1, 7, 2], atEnd: 'turn-back' });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    // A turn-back route is not reversed, though the mode asked for with it would allow it.
    const outcome = await made.trains.manage(
      made.party.id,
      alice,
      false,
      { kind: 'dynamax', route: 'reverse', atEnd: 'finish' },
      { from: '4', first: '4' },
    );
    expect(outcome).toEqual({ kind: 'refused', reason: 'reverse-turns-back' });
    expect(made.current().train).toMatchObject({
      kind: 'raid',
      atEnd: 'turn-back',
      route: stops(4, 1, 7, 2),
    });
    // A dialog drawn where the train no longer is changes nothing of the route.
    await made.trains.move(made.party.id, alice, 'next', false);
    expect(
      await made.trains.manage(
        made.party.id,
        alice,
        false,
        { route: 'finish' },
        { from: '4', first: '4' },
      ),
    ).toEqual({ kind: 'refused', reason: 'train-moved-on' });
    // The kind alone asks nothing of where the train is.
    expect(
      await made.trains.manage(
        made.party.id,
        alice,
        false,
        { kind: 'dynamax' },
        { from: '4', first: '4' },
      ),
    ).toMatchObject({ kind: 'ok', changed: true });
  });

  it('finishes the route here as a movement, announced as a move is', async () => {
    const made = await boarded();
    const outcome = await made.trains.manage(
      made.party.id,
      alice,
      false,
      { route: 'finish' },
      { from: '4', first: '4' },
    );
    expect(outcome).toMatchObject({ kind: 'ok', route: 'finished' });
    expect(made.current().train.stop).toBe(4);
    await settled(made);
    expect(first(made)).toBe(`The train has finished its route. Moved by **Alice** (<@${ALICE}>).`);
  });

  it('changes nothing, and writes nothing, for what the train has already', async () => {
    const made = await boarded();
    const outcome = await made.trains.manage(
      made.party.id,
      alice,
      false,
      { kind: 'raid', atEnd: 'finish' },
      { from: '4', first: '4' },
    );
    expect(outcome).toMatchObject({ kind: 'ok', changed: false });
    await settled(made);
    expect(lines(made)).toEqual([]);
  });
});
