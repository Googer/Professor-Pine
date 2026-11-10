import { afterEach, describe, expect, it, vi } from 'vitest';
import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { leadOf, textOf } from '../../test/support/messages.js';
import {
  ALICE,
  asTrain,
  BOB,
  CAROL,
  MINUTE,
  REPORTER,
  stops,
  gym,
} from '../../test/support/parties.js';
import { createdTrain, restarted } from '../../test/support/party-service.js';
import { isTrain, type Party } from '../domain/party/party.js';
import { groupMark } from '../domain/party/train.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const DAVE = '200000000000000005';

/** How long the new post takes to make, in the tests that hold it: the clock moves on. */
const POST_TIME = 3_000;
const HOUR = 60 * MINUTE;

type Made = Awaited<ReturnType<typeof createdTrain>>;

/**
 * A train on stop 2 of 3 with the maker in A and group B (Fast): Alice opened it, Bob is in it
 * (coming, +1), Carol in A. Everything said so far is cleared.
 */
async function fastTrain(route: readonly number[] = [4, 1, 7]): Promise<Made> {
  const made = await createdTrain({ route });
  await made.trains.move(made.party.id, { id: REPORTER }, 'next', true);
  await made.attendance.signUp(made.party.id, carol, PartyStatus.Coming);
  await made.attendance.newGroup(made.party.id, alice);
  await made.attendance.labelGroup(made.party.id, alice, 'Fast');
  await made.attendance.joinGroup(made.party.id, bob, 'B');
  await made.attendance.changeNumber(made.party.id, bob, 1);
  await settled(made);
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  return made;
}

async function settled(made: Made): Promise<void> {
  await made.attendance.flush();
  await made.trains.flush();
  await made.service.flush();
  await made.access.flush();
}

/** Holds the creation of the next post until `release` is called. */
function holdPost(made: Made): { release: () => void; reached: Promise<void> } {
  let release: () => void = () => undefined;
  let arrive: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const original = made.gateway.createPost.bind(made.gateway);
  vi.spyOn(made.gateway, 'createPost').mockImplementation(async (forumId, post) => {
    arrive();
    await held;
    // Making a post takes a moment: the split happens after it was asked for.
    made.clock.now += POST_TIME;
    return original(forumId, post);
  });
  return { release, reached };
}

/**
 * The id the next split gives its new train: after every other id, so that the paired write
 * takes the old train's lock first and a press on the new post may go before it (the order of
 * the locks is that of the ids, `PartyStore.updateBoth`).
 */
const LAST_ID = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
/** And one before every other id: the paired write holds the new train's lock while it waits. */
const FIRST_ID = '00000000-0000-4000-8000-000000000000';

/**
 * Holds the old train between the new post and its own change: a write of the old train is
 * held until `release`, and `reached` comes once the split asks to change the old train behind
 * it (the new train has its post by then). `fresh` gives the new train as it is then. The new
 * train's id sorts after the old one's (`LAST_ID`) unless `newId` says otherwise.
 */
function holdOldTrain(
  made: Made,
  newId: `${string}-${string}-${string}-${string}-${string}` = LAST_ID,
): {
  release: () => void;
  reached: Promise<void>;
  fresh: () => Party;
} {
  let release: () => void = () => undefined;
  let arrive: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const save = made.storage.save.bind(made.storage);
  let holding = true;
  vi.spyOn(made.storage, 'save').mockImplementation(async (party, note) => {
    if (holding && party.id === made.party.id) {
      holding = false;
      await held;
    }
    return save(party, note);
  });
  // The write that is held: one that changes nothing a member sees.
  void made.store.update(made.party.id, (party) => ({ party: { ...party } }));
  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(newId);
  const updateBoth = made.store.updateBoth.bind(made.store);
  vi.spyOn(made.store, 'updateBoth').mockImplementation((ids, change) => {
    if (ids.includes(made.party.id)) arrive();
    return updateBoth(ids, change);
  });
  const fresh = () => {
    const party = made.store.active().find((one) => one.id !== made.party.id);
    if (!party) throw new Error('there is no new train');
    return party;
  };
  return { release, reached, fresh };
}

/** Saves of parties that `when` picks fail, as the database's would; the others are written. */
function failingSaves(made: Made, when: (party: Party) => boolean): void {
  const save = made.storage.save.bind(made.storage);
  vi.spyOn(made.storage, 'save').mockImplementation((party, note) =>
    when(party) ? Promise.reject(new Error('the database is away')) : save(party, note),
  );
}

/**
 * The writes of two parties together fail (the split's: the old train without the group, the
 * new one made to match), as the database's transaction would: neither is written.
 */
function failingPairs(made: Made): void {
  vi.spyOn(made.storage, 'saveBoth').mockRejectedValue(new Error('the database is away'));
}

/**
 * A stop of the process at the split's paired write: it is asked for and never commits (nor
 * fails), so nothing of the process tidies up after it. `reached` comes once it is asked for,
 * the new post made by then; the services are then as a stop leaves them (`restarted`).
 */
function stopAtPairedWrite(made: Made): Promise<void> {
  return new Promise<void>((resolve) => {
    vi.spyOn(made.storage, 'saveBoth').mockImplementation(() => {
      resolve();
      return new Promise<never>(() => undefined);
    });
  });
}

/** The new train's post and its link line in the region's channel, as the gateway has them. */
function postAndLink(made: Made, party: Party | undefined): { post: boolean; link: boolean } {
  const linkId = party?.regionLinkMessageId ?? null;
  return {
    post: made.gateway.posts.has(party?.forumPostId ?? ''),
    link: made.gateway.messagesIn(WEST_CHANNEL).some((sent) => sent.id === linkId),
  };
}

/** Ending the new train of a split fails: with a failing paired write, a stop as it were. */
const endingTheNewOne = (made: Made) => (party: Party) =>
  party.id !== made.party.id && party.status === 'ended';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TrainService.split', () => {
  it('makes the group a train of its own in the same forum, and the old train goes on without it', async () => {
    const made = await fastTrain();
    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    const fresh = asTrain(made.store.get(outcome.party.id));
    const old = made.current();
    expect(fresh).toMatchObject({
      forumChannelId: WEST_FORUM,
      regionId: 1,
      createdById: ALICE,
      makerName: 'Alice',
      timed: { name: 'Saturday legendaries (Fast)' },
      groups: [{ id: 'A', label: 'Fast' }],
      train: {
        route: stops(4, 1, 7),
        stop: 1,
        conductorId: ALICE,
        splitFrom: { partyId: made.party.id, postId: made.postId },
        splitOff: [],
      },
    });
    expect(Object.keys(fresh.attendees)).toEqual([ALICE, BOB]);
    expect(fresh.attendees).toMatchObject({
      [ALICE]: { group: 'A', status: PartyStatus.Coming, name: 'Alice' },
      [BOB]: { group: 'A', number: 2, name: 'Bob' },
    });
    expect(Object.keys(old.attendees)).toEqual([REPORTER, CAROL]);
    expect(old.groups).toEqual([{ id: 'A' }]);
    expect(old.train.splitOff).toEqual([
      {
        partyId: fresh.id,
        postId: fresh.forumPostId,
        group: 'B',
        label: 'Fast',
        opened: expect.any(Number) as number,
      },
    ]);
    expect(outcome.moved).toEqual([ALICE, BOB]);
    // The new post, with its link line in the region's channel; the old post is still there.
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(2);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    expect(fresh.regionLinkMessageId).not.toBeNull();
  });

  it('keeps the name and team the presser has now on the new train, as on every other press', async () => {
    const made = await fastTrain();
    // Bob, in group B as "Bob", has since changed his name and joined a team.
    const robert: Member = { id: BOB, name: 'Robert', team: 'valor' };
    const outcome = await made.trains.split(made.party.id, robert, false, 'B');
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    const fresh = asTrain(made.store.get(outcome.party.id));
    expect(fresh.attendees[BOB]).toMatchObject({ group: 'A', name: 'Robert', team: 'valor' });
    const post = textOf(made.gateway.posts.get(fresh.forumPostId ?? '')?.message);
    expect(post).toContain('Robert');
    expect(post).not.toContain('Bob');
  });

  it('says in both posts who split what, and pings the members who moved, but not the presser', async () => {
    const made = await fastTrain();
    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    expect(made.said()).toEqual([
      `**Alice** (<@${ALICE}>) split group B (Fast) off into a train of its own.`,
    ]);
    const postId = outcome.party.forumPostId ?? '';
    const sent = made.gateway.messagesIn(postId).map((message) => message.message);
    expect(sent).toEqual([
      {
        content: `**Alice** (<@${ALICE}>) split this train off with group B (Fast).\n<@${BOB}>`,
        mention: { users: [BOB] },
      },
    ]);
  });

  it('pings only those who allow mentions', async () => {
    const made = await fastTrain();
    made.userSettings.set(BOB, { mentions: false });
    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    const [said] = made.gateway.messagesIn(outcome.party.forumPostId ?? '');
    expect(said?.message).toEqual({
      content: `**Alice** (<@${ALICE}>) split this train off with group B (Fast).`,
      mention: { users: [] },
    });
  });

  it('names nobody where the presser made the old train and asked not to be named', async () => {
    const made = await fastTrain();
    const old = made.current();
    // The maker, staff here, splits a group they are not in, anonymously.
    await made.store.update(made.party.id, (party) => ({ party: { ...party, anonymous: true } }));
    const outcome = await made.trains.split(old.id, { id: REPORTER }, true, 'B', {
      anonymous: true,
    });
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    expect(made.said()).toEqual(['Group B (Fast) was split off into a train of its own.']);
    const [said] = made.gateway.messagesIn(outcome.party.forumPostId ?? '');
    expect(said?.message.content?.split('\n')[0]).toBe(
      'This train was split off with group B (Fast).',
    );
    expect(asTrain(made.store.get(outcome.party.id))).toMatchObject({
      anonymous: true,
      createdById: REPORTER,
      train: { conductorId: null },
    });
  });

  it('gives the new train no conductor when the presser in the group asked not to be named', async () => {
    const made = await fastTrain();
    const outcome = await made.trains.split(made.party.id, alice, false, 'B', { anonymous: true });
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    expect(asTrain(made.store.get(outcome.party.id))).toMatchObject({
      anonymous: true,
      createdById: ALICE,
      train: { conductorId: null },
    });
  });

  it('tells nobody of a new train: the people in it know', async () => {
    const made = await fastTrain();
    await made.newTrains.set('200000000000000009', made.gateway.guildId, true, 1);
    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
    await settled(made);
    await made.notify.flush();
    expect(outcome.kind).toBe('split');
    expect(made.dms.to('200000000000000009')).toEqual([]);
    // Who asks to hear of new trains hears of one that is made.
    await made.service.createTrain({
      name: 'Another',
      creatorId: CAROL,
      regionChannelId: WEST_CHANNEL,
    });
    await made.notify.flush();
    expect(made.dms.to('200000000000000009')).toHaveLength(1);
  });

  it('copies the new train into the channels of the other regions of its route', async () => {
    // Gym 8 lies in East.
    const made = await fastTrain([4, 1, 8]);
    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    const leads = made.gateway.messagesIn(EAST_CHANNEL).map((sent) => leadOf(sent.message));
    expect(leads).toContain(
      'A raid train that stops in this region. ' +
        `Sign up here to follow it in its post: <#${outcome.party.forumPostId}>`,
    );
  });

  it('refuses before anything is made, as mayNotSplit says', async () => {
    const made = await fastTrain();
    expect(await made.trains.split(made.party.id, carol, false, 'B')).toEqual({
      kind: 'refused',
      reason: 'not-in-group',
    });
    expect(await made.trains.split(made.party.id, alice, false, 'C')).toEqual({
      kind: 'refused',
      reason: 'no-such-group',
    });
    await settled(made);
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    expect(made.store.active()).toHaveLength(1);
    expect(made.said()).toEqual([]);
  });

  it('refuses a press drawn for a group that changed since', async () => {
    const made = await fastTrain();
    const drawn = groupMark(made.current(), 'B');
    await made.attendance.labelGroup(made.party.id, alice, 'Slow');
    expect(await made.trains.split(made.party.id, alice, false, 'B', { drawn })).toEqual({
      kind: 'refused',
      reason: 'group-changed',
    });
    expect(made.store.active()).toHaveLength(1);
  });

  it('answers gone for a party that is no train, or no longer there', async () => {
    const made = await fastTrain();
    await made.service.end(made.party.id);
    expect(await made.trains.split(made.party.id, alice, false, 'B')).toEqual({ kind: 'gone' });
  });

  it('records each train on its own once they end', async () => {
    const made = await fastTrain();
    made.history.optIn(1, ALICE);
    made.clock.now += 5 * MINUTE;
    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } });
    await made.service.end(outcome.party.id, undefined, { ended: { how: 'clock' } });
    const [old, fresh] = made.history.records;
    expect(old).toMatchObject({ partyId: made.party.id, splitFromId: null });
    expect(old?.attendees.find((one) => one.memberId === ALICE)).toMatchObject({
      status: null,
      leftAt: made.clock.now,
      splitOff: true,
    });
    expect(fresh).toMatchObject({
      partyId: outcome.party.id,
      splitFromId: made.party.id,
      createdAt: made.clock.now,
    });
    expect(fresh?.attendees.map((one) => one.signedUpAt)).toEqual([made.clock.now, made.clock.now]);
  });

  it("starts the new train's history at the split, after its post was made, and the group's time on the old one ends then", async () => {
    const made = await fastTrain();
    made.history.optIn(1, ALICE);
    const asked = made.clock.now;
    const { release, reached } = holdPost(made);
    const splitting = made.trains.split(made.party.id, alice, false, 'B');
    await reached;
    release();
    const outcome = await splitting;
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    const split = asked + POST_TIME;
    await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } });
    await made.service.end(outcome.party.id, undefined, { ended: { how: 'clock' } });
    const [old, fresh] = made.history.records;
    expect(old?.attendees.find((one) => one.memberId === ALICE)?.leftAt).toBe(split);
    expect(fresh?.createdAt).toBe(split);
    expect(fresh?.attendees.map((one) => one.signedUpAt)).toEqual([split, split]);
    expect(fresh?.stops[0]?.arrivedAt).toBe(split);
  });

  it('pings everybody of the group when staff split it, and leads neither train anew', async () => {
    const made = await fastTrain();
    await made.store.update(made.party.id, (party) =>
      isTrain(party) ? { party: { ...party, train: { ...party.train, conductorId: CAROL } } } : {},
    );
    const outcome = await made.trains.split(made.party.id, { id: DAVE, name: 'Dave' }, true, 'B');
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    const fresh = asTrain(made.store.get(outcome.party.id));
    expect(fresh).toMatchObject({ createdById: DAVE, train: { conductorId: null } });
    expect(made.current().train.conductorId).toBe(CAROL);
    const [said] = made.gateway.messagesIn(outcome.party.forumPostId ?? '');
    expect(said?.message.mention).toEqual({ users: [ALICE, BOB] });
  });

  it("makes no train in another forum than the old train's", async () => {
    const made = await fastTrain();
    await made.store.update(made.party.id, (party) => ({
      party: { ...party, forumChannelId: '900000000000000777' },
    }));
    expect(await made.trains.split(made.party.id, alice, false, 'B')).toEqual({
      kind: 'no-forum',
    });
    await settled(made);
    expect(made.store.active()).toHaveLength(1);
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
  });
});

describe('TrainService.split: what fails, and what happens meanwhile', () => {
  it('leaves the old train as it was and no post behind when the new post cannot be made', async () => {
    const made = await fastTrain();
    const before = made.current();
    made.gateway.failing.set('createPost', new Error('Discord is away'));
    await expect(made.trains.split(made.party.id, alice, false, 'B')).rejects.toThrow(
      'Discord is away',
    );
    made.gateway.failing.delete('createPost');
    await settled(made);
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
    expect(made.current().attendees).toEqual(before.attendees);
    expect(made.current().groups).toEqual(before.groups);
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    expect(made.said()).toEqual([]);
  });

  it('takes the new train back when the old one refuses at the split, and changes nothing', async () => {
    const made = await fastTrain();
    const { release, reached } = holdPost(made);
    const splitting = made.trains.split(made.party.id, alice, false, 'B');
    await reached;
    // Alice leaves the train while the new post is made: she may no longer split group B.
    await made.attendance.leave(made.party.id, alice);
    release();
    expect(await splitting).toEqual({ kind: 'refused', reason: 'not-in-group' });
    await settled(made);
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
    expect(Object.keys(made.current().attendees)).toEqual([REPORTER, CAROL, BOB]);
    // The post that was a moment old is deleted, and so is its link line.
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    expect(
      made.gateway
        .messagesIn(WEST_CHANNEL)
        .filter((sent) => (sent.message.content ?? '').startsWith('New train')),
    ).toHaveLength(1);
    // Nothing of the new train is recorded: it never was one.
    expect(made.history.records).toEqual([]);
  });

  it('takes the new train back when the old one ended meanwhile', async () => {
    const made = await fastTrain();
    const { release, reached } = holdPost(made);
    const splitting = made.trains.split(made.party.id, alice, false, 'B');
    await reached;
    await made.service.end(made.party.id);
    release();
    expect(await splitting).toEqual({ kind: 'gone' });
    await settled(made);
    expect(made.store.active()).toEqual([]);
    expect(made.gateway.postsIn(WEST_FORUM).filter((post) => !post.archived)).toEqual([]);
  });

  it('splits a group once: a second press at the same time finds it gone', async () => {
    const made = await fastTrain();
    const drawn = groupMark(made.current(), 'B');
    const [first, second] = await Promise.all([
      made.trains.split(made.party.id, alice, false, 'B', { drawn }),
      made.trains.split(made.party.id, bob, false, 'B', { drawn }),
    ]);
    await settled(made);
    expect(first.kind).toBe('split');
    // The group went with the first: no such group by now (plan 8X-1B; its Submit says where).
    expect(second).toEqual({ kind: 'refused', reason: 'no-such-group' });
    expect(made.store.active()).toHaveLength(2);
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(2);
  });

  it('moves who is in the group at the split: a leave and a join meanwhile count', async () => {
    const made = await fastTrain();
    const { release, reached } = holdPost(made);
    const splitting = made.trains.split(made.party.id, alice, false, 'B');
    await reached;
    await made.attendance.leave(made.party.id, bob);
    await made.attendance.joinGroup(made.party.id, carol, 'B');
    release();
    const outcome = await splitting;
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    const fresh = asTrain(made.store.get(outcome.party.id));
    expect(Object.keys(fresh.attendees).sort()).toEqual([ALICE, CAROL].sort());
    expect(Object.keys(made.current().attendees)).toEqual([REPORTER]);
    expect(outcome.moved).toEqual([CAROL, ALICE]);
    // Nobody is on both trains, and nobody of the group on neither.
    for (const id of [ALICE, CAROL]) expect(made.current().attendees[id]).toBeUndefined();
  });

  it('keeps what a member did on the new post before the old train lost the group', async () => {
    const made = await fastTrain();
    const { release, reached, fresh } = holdOldTrain(made);
    const splitting = made.trains.split(made.party.id, alice, false, 'B');
    await reached;
    // Bob is here already, and says so on the new post.
    await made.attendance.signUp(fresh().id, bob, PartyStatus.Present);
    release();
    const outcome = await splitting;
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    // The press went before the paired write, which keeps it.
    expect(outcome.party.attendees[BOB]).toMatchObject({ status: PartyStatus.Present });
    const train = asTrain(made.store.get(outcome.party.id));
    expect(train.attendees[BOB]).toMatchObject({ status: PartyStatus.Present, number: 2 });
    expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
    expect(made.current().attendees[BOB]).toBeUndefined();
  });

  it('refuses to split the new train while its own split is not settled', async () => {
    const made = await fastTrain();
    const { release, reached, fresh } = holdOldTrain(made);
    const splitting = made.trains.split(made.party.id, alice, false, 'B');
    await reached;
    // On the new post, Bob opens a group of his own: the new train has two groups with members.
    const pending = fresh().id;
    await made.attendance.newGroup(pending, bob);
    const dave: Member = { id: DAVE, name: 'Dave' };
    expect(await made.trains.split(pending, dave, true, 'B')).toEqual({
      kind: 'refused',
      reason: 'split-pending',
    });
    release();
    const outcome = await splitting;
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    // Two trains, two posts: nothing was split off the new one before it was settled.
    expect(made.store.active()).toHaveLength(2);
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(2);
    expect(asTrain(made.store.get(pending)).train.splitOff).toEqual([]);
  });

  it('takes the new train back, and leaves the old one as it was, when the new one ends before the split', async () => {
    const made = await fastTrain();
    const before = made.current();
    const { release, reached, fresh } = holdOldTrain(made);
    const splitting = made.trains.split(made.party.id, alice, false, 'B');
    await reached;
    const gone = fresh();
    await made.service.end(gone.id);
    release();
    expect(await splitting).toEqual({ kind: 'no-post' });
    await settled(made);
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
    expect(made.current().attendees).toEqual(before.attendees);
    expect(made.current().train.splitOff).toEqual([]);
    expect(made.history.records.map((record) => record.partyId)).not.toContain(gone.id);
  });

  it('carries the new train to where the old one went while the new post was made', async () => {
    const made = await fastTrain([4, 1, 7]);
    const { release, reached } = holdPost(made);
    const splitting = made.trains.split(made.party.id, alice, false, 'B');
    await reached;
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', true);
    await made.trains.addStop(made.party.id, { id: REPORTER }, gym(9));
    release();
    const outcome = await splitting;
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    expect(asTrain(made.store.get(outcome.party.id)).train).toMatchObject({
      route: stops(4, 1, 7, 9),
      stop: 2,
    });
  });

  it('waits with a press on the new post for the paired write when it holds the new train first', async () => {
    const made = await fastTrain();
    // The new train's id sorts first: the paired write holds its lock while the old one's waits.
    const { release, reached, fresh } = holdOldTrain(made, FIRST_ID);
    const splitting = made.trains.split(made.party.id, alice, false, 'B');
    await reached;
    const pressing = made.attendance.signUp(fresh().id, bob, PartyStatus.Present);
    release();
    const outcome = await splitting;
    await pressing;
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    // The split was written before the press: Bob went as he was, then said he is here.
    expect(outcome.party.attendees[BOB]).toMatchObject({ status: PartyStatus.Coming });
    const train = asTrain(made.store.get(outcome.party.id));
    expect(Object.keys(train.attendees)).toEqual([ALICE, BOB]);
    expect(train.attendees[BOB]).toMatchObject({ status: PartyStatus.Present, number: 2 });
    expect(made.current().attendees[BOB]).toBeUndefined();
  });

  it('writes the old train without the group and the new train made to match in one write', async () => {
    const made = await fastTrain();
    const pairs: string[][] = [];
    const saveBoth = made.storage.saveBoth.bind(made.storage);
    vi.spyOn(made.storage, 'saveBoth').mockImplementation((writes) => {
      pairs.push(
        writes.map(({ party }) =>
          !isTrain(party)
            ? party.type
            : party.id === made.party.id
              ? `old: ${String(party.train.splitOff.length)} split off`
              : `new: ${party.train.splitFrom?.pending === true ? 'pending' : 'settled'}`,
        ),
      );
      return saveBoth(writes);
    });
    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    expect(pairs).toEqual([['old: 1 split off', 'new: settled']]);
    expect(outcome.party.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
  });

  it('takes the new train back, and leaves the old one as it was, when the paired write fails', async () => {
    const made = await fastTrain();
    const before = made.current();
    failingPairs(made);
    await expect(made.trains.split(made.party.id, alice, false, 'B')).rejects.toThrow(
      'the database is away',
    );
    await settled(made);
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
    expect(made.current().attendees).toEqual(before.attendees);
    expect(made.current().groups).toEqual(before.groups);
    expect(made.current().train.splitOff).toEqual([]);
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    expect(made.history.records).toEqual([]);
  });

  it('loses nobody by a stop before the paired write: at start the new train is taken back, and the group is as it is on the old train', async () => {
    const made = await fastTrain();
    const { release, reached } = holdPost(made);
    // It never answers: the process stops before.
    void made.trains.split(made.party.id, alice, false, 'B');
    await reached;
    // While the new post is made, Bob leaves the train and Carol joins the group.
    await made.attendance.leave(made.party.id, bob);
    await made.attendance.joinGroup(made.party.id, carol, 'B');
    // The process stops in the paired write: it never commits, and nothing tidies up after it.
    const stopped = stopAtPairedWrite(made);
    release();
    await stopped;
    const pending = made.store.active().find((party) => party.id !== made.party.id);
    expect(pending && isTrain(pending) && pending.train.splitFrom?.pending).toBe(true);
    vi.restoreAllMocks();

    const again = await restarted(made);
    // The new post and its link line outlive the stop, until the start takes them back.
    expect(postAndLink(made, pending)).toEqual({ post: true, link: true });
    expect(await again.service.settlePendingSplits()).toBe(1);
    await again.service.flush();
    expect(postAndLink(made, pending)).toEqual({ post: false, link: false });
    expect(again.store.active().map((party) => party.id)).toEqual([made.party.id]);
    const old = asTrain(again.store.get(made.party.id));
    expect(Object.keys(old.attendees)).toEqual([REPORTER, CAROL, ALICE]);
    expect(old.attendees[CAROL]).toMatchObject({ group: 'B' });
    expect(old.train.splitOff).toEqual([]);
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    expect(again.history.records.map((record) => record.partyId)).not.toContain(pending?.id);
  });

  it('takes back a pending train whose old train has ended since', async () => {
    const made = await fastTrain();
    const stopped = stopAtPairedWrite(made);
    // It never answers: the process stops in the paired write.
    void made.trains.split(made.party.id, alice, false, 'B');
    await stopped;
    const pending = made.store.active().find((party) => party.id !== made.party.id);
    vi.restoreAllMocks();

    const again = await restarted(made);
    // The old train ends, with the group on it, before the pending one is settled.
    await again.service.end(made.party.id);
    await again.service.flush();
    expect(postAndLink(made, pending)).toEqual({ post: true, link: true });
    expect(await again.service.settlePendingSplits()).toBe(1);
    await again.service.flush();
    expect(postAndLink(made, pending)).toEqual({ post: false, link: false });
    expect(again.store.active()).toEqual([]);
    expect(again.history.records.map((record) => record.partyId)).not.toContain(pending?.id);
  });

  it('settles at start, as it is stored, a pending train that its old train lists (only an earlier build left one)', async () => {
    const made = await fastTrain();
    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
    await settled(made);
    if (outcome.kind !== 'split') throw new Error(outcome.kind);
    // As the build of plan 8T could leave it: the old train lost the group, the new one is pending.
    await made.store.update(outcome.party.id, (party) =>
      isTrain(party) && party.train.splitFrom
        ? {
            party: {
              ...party,
              train: { ...party.train, splitFrom: { ...party.train.splitFrom, pending: true } },
            },
          }
        : {},
    );

    const again = await restarted(made);
    expect(await again.service.settlePendingSplits()).toBe(1);
    const train = asTrain(again.store.get(outcome.party.id));
    expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
    expect(Object.keys(train.attendees)).toEqual([ALICE, BOB]);
    expect(made.gateway.posts.get(train.forumPostId ?? '')).toBeDefined();
    expect(again.entries).toContainEqual(
      expect.objectContaining({
        level: 50,
        party: outcome.party.id,
        msg: 'a pending new train of a split that its old train lists: settled as it is',
      }),
    );
    expect(await again.service.settlePendingSplits()).toBe(0);
  });

  it('takes back with the upkeep a new train left pending in the process, once it is a minute old', async () => {
    const made = await fastTrain();
    // The paired write fails, and so does the take-back: the database and Discord are away.
    failingPairs(made);
    failingSaves(made, endingTheNewOne(made));
    const away = new Error('Discord is away');
    made.gateway.failing.set('deletePost', away);
    made.gateway.failing.set('deleteMessage', away);
    await expect(made.trains.split(made.party.id, alice, false, 'B')).rejects.toThrow(
      'the database is away',
    );
    await settled(made);
    const pending = made.store.active().find((party) => party.id !== made.party.id);
    vi.restoreAllMocks();
    made.gateway.failing.clear();
    expect(postAndLink(made, pending)).toEqual({ post: true, link: true });
    const said = () =>
      made.entries.filter(
        (entry) =>
          entry.msg === 'settled or took back the new trains of splits that were left pending',
      );
    // Younger than a minute: a split may still be under way.
    expect(await made.service.settlePendingSplits(MINUTE)).toBe(0);
    expect(said()).toEqual([]);
    expect(made.store.get(pending?.id ?? '')).toBeDefined();
    // The clock's hourly upkeep takes it back.
    made.clock.now += HOUR;
    await made.scheduler.tick();
    await made.scheduler.whenIdle();
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
    expect(postAndLink(made, pending)).toEqual({ post: false, link: false });
    expect(said()).toHaveLength(1);
    expect(said()[0]).toMatchObject({ settled: 0, takenBack: 1 });
  });

  it('logs nothing taken back when a pending train could not be ended', async () => {
    const made = await fastTrain();
    failingPairs(made);
    failingSaves(made, endingTheNewOne(made));
    await expect(made.trains.split(made.party.id, alice, false, 'B')).rejects.toThrow(
      'the database is away',
    );
    await settled(made);
    const pending = made.store.active().find((party) => party.id !== made.party.id);
    // The database is still away for it.
    expect(await made.service.settlePendingSplits()).toBe(0);
    expect(made.entries.map((entry) => entry.msg)).not.toContain(
      'settled or took back the new trains of splits that were left pending',
    );
    expect(made.store.get(pending?.id ?? '')).toBeDefined();
  });
});
