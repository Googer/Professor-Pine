import { rowsOf } from '../../test/support/messages.js';
import { describe, expect, it, vi } from 'vitest';
import { heldCall } from '../../test/support/held-call.js';
import { watchForTest } from '../../test/support/timers.js';
import {
  ALICE,
  asRaid,
  BOB,
  CAROL,
  MINUTE,
  REPORTER,
  withAttendees,
} from '../../test/support/parties.js';
import {
  createdMeetup,
  createdTrain,
  reportedMax,
  reportedRaid,
} from '../../test/support/party-service.js';
import { decodeCustomId } from '../discord/custom-id.js';
import { completeRaid } from '../domain/party/attendance.js';
import { WITHDRAWN_LINE } from './attendance-service.js';
import { attendeeOf, endParty, groupStamp } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol', team: 'valor' };
const yveltal = { boss: { key: 'yveltal' } } as const;

describe('AttendanceService: signing up', () => {
  it('stores the sign-up with name and team, shows the post anew and says so in the post', async () => {
    const made = await reportedRaid();
    const edits = () => made.gateway.posts.get(made.postId)?.edits;
    const outcome = await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, {
      number: 3,
    });
    expect(outcome).toMatchObject({
      kind: 'ok',
      acted: true,
      attendee: { status: PartyStatus.Coming, number: 3, name: 'Alice', team: 'mystic' },
    });
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({ number: 3, team: 'mystic' });
    await made.attendance.flush();
    await made.service.flush();
    expect(edits()).toBe(1);
    expect(made.said()).toEqual([`**Alice** (<@${ALICE}>) is coming with 2 more.`]);
    // The line pings nobody.
    expect(made.gateway.messagesIn(made.postId)[0]?.message.mention).toBeUndefined();
  });

  it('says nothing when the action changes nothing, but still notes a new name', async () => {
    const made = await reportedRaid();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.flush();
    const again = await made.attendance.signUp(
      made.party.id,
      { ...alice, name: 'Alice II' },
      PartyStatus.Coming,
    );
    expect(again).toMatchObject({ kind: 'ok', acted: false, attendee: { name: 'Alice II' } });
    await made.attendance.flush();
    expect(made.said()).toHaveLength(1);
  });

  it('gathers the lines of a burst into one message, one line per member', async () => {
    const made = await reportedRaid();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Interested);
    for (let n = 0; n < 4; n++) await made.attendance.changeNumber(made.party.id, bob, 1);
    await made.attendance.signUp(made.party.id, carol, PartyStatus.Present);
    await made.attendance.changeNumber(made.party.id, bob, -1);
    await made.attendance.flush();
    // The first line goes out at once. Of what follows within the delay, a member has one line:
    // how they stand at the end, in the place of their first.
    expect(made.said()).toEqual([
      `**Alice** (<@${ALICE}>) is coming.`,
      `**Bob** (<@${BOB}>) is interested with 3 more.\n**Carol** (<@${CAROL}>) is here.`,
    ]);
  });

  it('answers a refusal with its reason and changes nothing', async () => {
    const made = await reportedRaid();
    const before = made.current();
    expect(
      await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 99 }),
    ).toEqual({ kind: 'refused', reason: 'bad-count' });
    expect(await made.attendance.leave(made.party.id, alice)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(made.current()).toBe(before);
    await made.attendance.flush();
    expect(made.said()).toEqual([]);
  });

  it('answers gone for a party that is no longer active', async () => {
    const made = await reportedRaid();
    const outcome = await made.attendance.signUp(
      '00000000-0000-4000-8000-00000000ffff',
      alice,
      PartyStatus.Coming,
    );
    expect(outcome).toEqual({ kind: 'gone' });
  });

  it('switches remote and back, and one fewer never goes below one', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    expect(await made.attendance.setRemote(id, alice, 'toggle')).toMatchObject({
      attendee: { remote: true, status: PartyStatus.Interested },
    });
    expect(await made.attendance.setRemote(id, alice, 'toggle')).toMatchObject({
      attendee: { remote: false },
    });
    expect(await made.attendance.changeNumber(id, alice, -1)).toMatchObject({
      kind: 'ok',
      acted: false,
      attendee: { number: 1 },
    });
    expect(await made.attendance.changeNumber(id, bob, -1)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
  });

  it('says that a member has left, and that one is not here any more', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.flush();
    await made.attendance.notHere(id, alice);
    await made.attendance.flush();
    const left = await made.attendance.leave(id, alice);
    expect(left).toMatchObject({ kind: 'ok', acted: true, attendee: undefined });
    await made.attendance.flush();
    expect(made.said()).toEqual([
      `**Alice** (<@${ALICE}>) is here.`,
      `**Alice** (<@${ALICE}>) is interested.`,
      `**Alice** (<@${ALICE}>) has left.`,
    ]);
  });

  it('says "in person" when a member switches remote off, and nothing of it otherwise', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Coming, { number: 2 });
    await made.attendance.flush();
    await made.attendance.setRemote(id, alice, true);
    await made.attendance.flush();
    await made.attendance.setRemote(id, alice, false);
    await made.attendance.flush();
    expect(made.said()).toEqual([
      `**Alice** (<@${ALICE}>) is coming with 1 more.`,
      `**Alice** (<@${ALICE}>) is coming with 1 more, remotely.`,
      `**Alice** (<@${ALICE}>) is coming with 1 more, in person.`,
    ]);
  });

  it('says nothing in the post of a raid that has ended meanwhile', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    await made.attendance.flush();
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.store.update(id, (party) => ({ party: endParty(party) }));
    await made.attendance.flush();
    expect(made.said()).toEqual([`**Alice** (<@${ALICE}>) is coming.`]);
  });
});

describe('AttendanceService: a party over by the clock, before the scheduler ends it', () => {
  it('refuses a newcomer to a raid whose end has passed, and changes nothing', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.attendance.flush();
    made.clock.now = (made.current().lastPossibleTime ?? 0) + MINUTE;
    const before = made.current();
    const gone = { kind: 'gone' };
    for (const status of [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present]) {
      expect(await made.attendance.signUp(id, alice, status)).toEqual(gone);
    }
    expect(await made.attendance.joinChosen(id, alice, PartyStatus.Coming, { group: 'A' })).toEqual(
      gone,
    );
    expect(await made.attendance.joinInto(id, alice, 'A')).toEqual(gone);
    // Whatever would sign a newcomer up.
    expect(await made.attendance.changeNumber(id, alice, 1)).toEqual(gone);
    expect(await made.attendance.setRemote(id, alice, 'toggle')).toEqual(gone);
    expect(await made.attendance.newGroup(id, alice)).toEqual(gone);
    expect(made.current()).toBe(before);
    await made.attendance.flush();
    expect(made.said()).toEqual([`**Bob** (<@${BOB}>) is coming.`]);
  });

  it('lets those signed up go on until the post is archived: their status, +1, remote, done, leave', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.attendance.signUp(id, carol, PartyStatus.Present);
    made.clock.now = (made.current().lastPossibleTime ?? 0) + MINUTE;
    const worked = { kind: 'ok', acted: true };
    expect(await made.attendance.signUp(id, bob, PartyStatus.Present)).toMatchObject(worked);
    expect(await made.attendance.signUp(id, bob, PartyStatus.Interested)).toMatchObject(worked);
    expect(await made.attendance.signUp(id, bob, PartyStatus.Present)).toMatchObject(worked);
    expect(await made.attendance.changeNumber(id, bob, 1)).toMatchObject(worked);
    expect(await made.attendance.changeNumber(id, bob, -1)).toMatchObject(worked);
    expect(await made.attendance.setRemote(id, bob, true)).toMatchObject(worked);
    expect(await made.attendance.setRemote(id, bob, false)).toMatchObject(worked);
    expect(await made.attendance.notHere(id, bob)).toMatchObject(worked);
    expect(await made.attendance.done(id, carol)).toMatchObject(worked);
    expect(await made.attendance.leave(id, bob)).toMatchObject(worked);
  });

  it('still takes an answer to the completion question asked before the end', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    for (const member of [alice, bob]) {
      await made.attendance.signUp(id, member, PartyStatus.Present);
    }
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    made.clock.now = (made.current().lastPossibleTime ?? 0) + MINUTE;
    expect(await made.attendance.answer(id, bob, true)).toMatchObject({ kind: 'ok', acted: true });
  });

  it('answers gone for a max battle whose end has come', async () => {
    const made = await reportedMax();
    made.clock.now = made.current().endTime ?? 0;
    expect(await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming)).toEqual({
      kind: 'gone',
    });
  });

  it('takes newcomers to a meetup or train whose end time has passed: they often run late', async () => {
    for (const made of [await createdMeetup(), await createdTrain()]) {
      const id = made.party.id;
      const end = made.clock.now + MINUTE;
      await made.store.update(id, (party) => ({ party: { ...party, endTime: end } }));
      made.clock.now = end + MINUTE;
      expect(await made.attendance.signUp(id, bob, PartyStatus.Coming)).toMatchObject({
        kind: 'ok',
        acted: true,
      });
    }
  });
});

describe('AttendanceService: completing a raid', () => {
  it('refuses Done while the raid is an egg', async () => {
    const made = await reportedRaid();
    expect(await made.attendance.done(made.party.id, { id: REPORTER })).toEqual({
      kind: 'refused',
      reason: 'not-hatched',
    });
  });

  it('asks the others of the group who are here, with buttons, and pings those who allow it', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    made.userSettings.set(BOB, { mentions: false });
    for (const member of [alice, bob, carol]) {
      await made.attendance.signUp(id, member, PartyStatus.Present);
    }
    const outcome = await made.attendance.done(id, alice);
    expect(outcome).toMatchObject({ kind: 'ok', asked: [BOB, CAROL], wasComplete: false });
    await made.attendance.flush();
    const question = made.gateway
      .messagesIn(made.postId)
      .find((message) => message.message.components?.length);
    expect(question?.message.content).toContain(`<@${BOB}>, <@${CAROL}>: have you completed`);
    expect(question?.message.mention).toEqual({ users: [CAROL] });
    const ids = rowsOf(question?.message)[0]?.components.map((c) =>
      'custom_id' in c ? decodeCustomId(c.custom_id) : undefined,
    );
    expect(ids).toEqual([
      { kind: 'party', id, action: 'answer', args: ['yes'] },
      { kind: 'party', id, action: 'answer', args: ['no'] },
    ]);
    expect(made.current().prompts.completion).toEqual([
      { id: question?.id, members: [BOB, CAROL] },
    ]);
    expect(attendeeOf(made.current(), BOB)).toMatchObject({
      status: PartyStatus.CompletePending,
      pendingUntil: made.clock.now + 5 * MINUTE,
    });
  });

  it('removes the question once everybody asked has answered', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    for (const member of [alice, bob, carol]) {
      await made.attendance.signUp(id, member, PartyStatus.Present);
    }
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    const [question] = made.current().prompts.completion;
    expect(await made.attendance.answer(id, bob, true)).toMatchObject({
      attendee: { status: PartyStatus.Complete },
    });
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([question]);
    expect(await made.attendance.answer(id, carol, false)).toMatchObject({
      attendee: { status: PartyStatus.Present },
    });
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([]);
    expect(made.gateway.deleted).toEqual([{ channelId: made.postId, messageId: question?.id }]);
    expect(await made.attendance.answer(id, carol, true)).toEqual({
      kind: 'refused',
      reason: 'not-pending',
    });
  });

  it('removes the question also when the last one asked leaves or changes their status', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    expect(made.current().prompts.completion).toHaveLength(1);
    await made.attendance.leave(id, bob);
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([]);
    expect(made.gateway.deleted).toHaveLength(1);
  });

  it('deletes a question that nobody is left to answer by the time it is sent', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    // Both actions are on their way together: the answer is stored before the question is sent.
    const done = made.attendance.done(id, alice);
    const answered = made.attendance.answer(id, bob, true);
    await Promise.all([done, answered]);
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([]);
    const questions = made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.components?.length);
    expect(questions).toEqual([]);
    // Sent and deleted again, not never sent.
    expect(made.gateway.deleted).toHaveLength(1);
  });

  it('does not ask in the post of a party that has ended', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.flush();
    const asked = made.current();
    await made.store.update(id, (party) => ({ party: endParty(party) }));
    const before = made.gateway.calls.length;
    await made.attendance.ask(asked, [BOB]);
    expect(made.gateway.calls.slice(before).filter((c) => c.startsWith('sendMessage'))).toEqual([]);
  });

  it('pings at most a hundred and stays within a message when more are asked', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    const many = Array.from({ length: 120 }, (_, n) => `70000000000000${String(1000 + n)}`);
    await made.attendance.ask(made.current(), [BOB, ...many]);
    const question = made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.components?.length)
      .at(-1);
    expect(question?.message.content?.length).toBeLessThanOrEqual(2000);
    expect(question?.message.mention?.users).toHaveLength(100);
  });

  it('asks nobody when a member who was only interested says done', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    const outcome = await made.attendance.done(id, { id: REPORTER });
    expect(outcome).toMatchObject({ kind: 'ok', asked: [] });
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([]);
  });

  it('keeps at most ten questions, deleting the oldest', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    // Alice is done: Bob is asked, and stays asked, so every question is recorded.
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    const ids = () => made.current().prompts.completion.map((question) => question.id);
    const sent = ids();
    for (let round = 0; round < 11; round++) {
      // Each question asks others as well: one of the very same members would take the place
      // of the one before.
      await made.attendance.ask(made.current(), [BOB, `7000000000000${String(10000 + round)}`]);
      sent.push(ids().at(-1) ?? '');
    }
    expect(sent).toHaveLength(12);
    expect(ids()).toEqual(sent.slice(2));
    expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual(sent.slice(0, 2));
  });

  it('says "not done yet" for the answer no, and "done" for yes', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    for (const member of [alice, bob, carol]) {
      await made.attendance.signUp(id, member, PartyStatus.Present, { number: 2 });
    }
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    await made.attendance.answer(id, bob, false);
    await made.attendance.flush();
    await made.attendance.answer(id, carol, true);
    await made.attendance.flush();
    // Somebody who is done is just that: no head count, no group, no remote.
    expect(made.said().slice(-2)).toEqual([
      `**Bob** (<@${BOB}>) is not done yet.`,
      `**Carol** (<@${CAROL}>) is done.`,
    ]);
  });

  it('keeps a question it could not delete in mind and deletes it the next time', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    await made.attendance.ask(made.current(), [BOB, CAROL]);
    const ids = () => made.current().prompts.completion.map((question) => question.id);
    const questions = ids();
    expect(questions).toHaveLength(2);

    made.gateway.failing.set('deleteMessage', new Error('no'));
    await made.attendance.answer(id, bob, true);
    await made.attendance.flush();
    expect(ids()).toEqual(questions);
    expect(made.entries.filter((e) => e.msg === 'could not delete a message')).toHaveLength(2);

    made.gateway.failing.clear();
    await made.attendance.removeQuestions(id);
    expect(made.current().prompts.completion).toEqual([]);
    expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual(questions);
  });

  it('deletes a question it could not record', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.flush();
    const asked = await made.store.update(id, (party) =>
      completeRaid(asRaid(party), ALICE, made.clock.now, 5),
    );
    made.storage.failing = new Error('the database is away');
    await expect(made.attendance.ask(asked?.party ?? made.current(), [BOB])).rejects.toThrow(
      'the database is away',
    );
    made.storage.failing = undefined;
    const questions = made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.components?.length);
    expect(questions).toEqual([]);
    expect(made.gateway.deleted).toHaveLength(1);
  });

  it('reads the settings of those it asks in one read', async () => {
    const made = await reportedRaid(yveltal, {});
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.signUp(id, { id: CAROL }, PartyStatus.Present);
    await made.attendance.flush();
    const before = { ...made.users.reads };
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    expect(made.users.reads).toEqual({ get: before.get, getMany: before.getMany + 1 });
    expect(made.users.asked.at(-1)?.sort()).toEqual([BOB, CAROL].sort());
  });

  it('asks without pinging anybody when the settings cannot be read', async () => {
    const made = await reportedRaid(yveltal, {});
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.flush();
    made.users.getMany = () => Promise.reject(new Error('the database is away'));
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    const question = made.gateway
      .messagesIn(made.postId)
      .find((message) => message.message.components?.length);
    expect(question?.message.content).toContain(`<@${BOB}>: have you completed`);
    expect(question?.message.mention).toEqual({ users: [] });
    // The failure is not swallowed silently.
    expect(made.entries).toContainEqual(
      expect.objectContaining({ level: 40, msg: 'could not read the settings of members' }),
    );
  });
});

describe('AttendanceService: a member who is done', () => {
  async function doneRaid() {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.newGroup(id, bob);
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Complete);
    return made;
  }

  it('cannot change the head count, remote or group, and nothing is said', async () => {
    const made = await doneRaid();
    const id = made.party.id;
    const before = made.current();
    const saidBefore = made.said().length;
    const refusal = { kind: 'refused', reason: 'already-done' };
    expect(await made.attendance.changeNumber(id, alice, 1)).toEqual(refusal);
    expect(await made.attendance.changeNumber(id, alice, -1)).toEqual(refusal);
    expect(await made.attendance.setRemote(id, alice, 'toggle')).toEqual(refusal);
    expect(await made.attendance.setRemote(id, alice, true)).toEqual(refusal);
    expect(await made.attendance.joinGroup(id, alice, 'B')).toEqual(refusal);
    expect(made.current()).toBe(before);
    await made.attendance.flush();
    expect(made.said()).toHaveLength(saidBefore);
  });

  it('can do all of it again after signing up anew', async () => {
    const made = await doneRaid();
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    expect(await made.attendance.changeNumber(id, alice, 1)).toMatchObject({ kind: 'ok' });
    expect(await made.attendance.setRemote(id, alice, 'toggle')).toMatchObject({ kind: 'ok' });
    expect(await made.attendance.joinGroup(id, alice, 'B')).toMatchObject({ kind: 'ok' });
  });
});

describe('AttendanceService: groups', () => {
  it('opens a group, moves the member there and tells the others, pinging those who allow it', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    made.userSettings.set(BOB, { mentionsGroups: false });
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.attendance.signUp(id, carol, PartyStatus.Coming);
    await made.attendance.flush();
    const outcome = await made.attendance.newGroup(id, alice);
    expect(outcome).toMatchObject({
      kind: 'ok',
      group: 'B',
      attendee: { group: 'B', status: PartyStatus.Coming },
    });
    await made.attendance.flush();
    const notice = made.gateway.messagesIn(made.postId).at(-1);
    expect(notice?.message.content).toBe(
      `**Alice** (<@${ALICE}>) opened group B. To move to it, press Group… on the post or use \`/group join\`.` +
        `\n<@${REPORTER}> <@${CAROL}>`,
    );
    expect(notice?.message.mention).toEqual({ users: [REPORTER, CAROL] });
    expect(made.current().defaultGroupId).toBe('B');
  });

  describe('the pings of a new group (plan 8Z)', () => {
    const OPENED_BY_BOB =
      `**Bob** (<@${BOB}>) opened group C. To move to it, press Group… on the post or use ` +
      '`/group join`.';
    /** A raid with Alice, Bob and Carol signed up; Alice has opened group B, which pinged. */
    const onePingGone = async () => {
      const made = await reportedRaid();
      const id = made.party.id;
      await made.attendance.signUp(id, bob, PartyStatus.Coming);
      await made.attendance.signUp(id, carol, PartyStatus.Coming);
      await made.attendance.flush();
      await made.attendance.newGroup(id, alice);
      await made.attendance.flush();
      const first = made.gateway.messagesIn(made.postId).at(-1);
      expect(first?.message.mention?.users).toContain(CAROL);
      return { made, id };
    };

    it('opens a second group within 5 minutes and says so, without mentions', async () => {
      const { made, id } = await onePingGone();
      made.clock.now += 5 * MINUTE - 1;
      const outcome = await made.attendance.newGroup(id, bob);
      expect(outcome).toMatchObject({ kind: 'ok', group: 'C' });
      await made.attendance.flush();
      const notice = made.gateway.messagesIn(made.postId).at(-1);
      expect(notice?.message.content).toBe(OPENED_BY_BOB);
      expect(notice?.message.mention?.users ?? []).toEqual([]);
    });

    it('pings again once 5 minutes have passed', async () => {
      const { made, id } = await onePingGone();
      made.clock.now += 5 * MINUTE;
      await made.attendance.newGroup(id, bob);
      await made.attendance.flush();
      const notice = made.gateway.messagesIn(made.postId).at(-1);
      expect(notice?.message.mention?.users).toContain(CAROL);
    });

    it('pings one of two groups opened at once', async () => {
      const made = await reportedRaid();
      const id = made.party.id;
      await made.attendance.signUp(id, bob, PartyStatus.Coming);
      await made.attendance.signUp(id, carol, PartyStatus.Coming);
      await made.attendance.flush();
      const before = made.gateway.messagesIn(made.postId).length;
      await Promise.all([made.attendance.newGroup(id, alice), made.attendance.newGroup(id, bob)]);
      await made.attendance.flush();
      const said = made.gateway.messagesIn(made.postId).slice(before);
      expect(said).toHaveLength(2);
      expect(said.filter((one) => (one.message.mention?.users ?? []).length > 0)).toHaveLength(1);
    });

    it('counts per party: another party pings all the same', async () => {
      const { made, id } = await onePingGone();
      const otherPost = '300000000000000099';
      const other = { ...made.current(), id: `${id}-other`, forumPostId: otherPost };
      await made.store.add(other);
      await made.attendance.newGroup(other.id, bob);
      await made.attendance.flush();
      const notice = made.gateway.messagesIn(otherPost).at(-1);
      expect(notice?.message.mention?.users ?? []).not.toEqual([]);
    });

    it('takes no turn when nobody could be pinged', async () => {
      const made = await reportedRaid();
      const id = made.party.id;
      made.userSettings.set(REPORTER, { mentionsGroups: false });
      made.userSettings.set(BOB, { mentionsGroups: false });
      await made.attendance.signUp(id, bob, PartyStatus.Coming);
      await made.attendance.signUp(id, carol, PartyStatus.Coming);
      await made.attendance.flush();
      made.userSettings.set(CAROL, { mentionsGroups: false });
      await made.attendance.newGroup(id, alice);
      await made.attendance.flush();
      expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention?.users ?? []).toEqual([]);
      made.userSettings.delete(CAROL);
      await made.attendance.newGroup(id, bob);
      await made.attendance.flush();
      expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention?.users).toContain(CAROL);
    });
  });

  it('opens a group with its label (Group…, plan 8X-1B), and names it in the notice', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    const outcome = await made.attendance.newGroup(id, alice, 'by the *bridge*');
    expect(outcome).toMatchObject({ kind: 'ok', group: 'B' });
    expect(made.current().groups.at(-1)).toMatchObject({ id: 'B', label: 'by the *bridge*' });
    await made.attendance.flush();
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.content).toMatch(
      new RegExp(
        `^\\*\\*Alice\\*\\* \\(<@${ALICE}>\\) opened group B \\(by the \\\\\\*bridge\\\\\\*\\)\\. `,
      ),
    );
    expect(await made.attendance.newGroup(id, bob, 'x'.repeat(101))).toEqual({
      kind: 'refused',
      reason: 'label-too-long',
    });
  });

  it("moves a member by Group…'s choice only to the group of that stamp", async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.newGroup(id, bob);
    const b = made.current().groups.find((group) => group.id === 'B');
    if (!b) throw new Error('no group B');
    const stamp = groupStamp(made.current(), b);
    expect(await made.attendance.joinStamped(id, alice, 'B', stamp)).toMatchObject({
      kind: 'ok',
      attendee: { group: 'B', status: PartyStatus.Coming },
    });
    expect(await made.attendance.joinStamped(id, carol, 'B', 'x')).toEqual({
      kind: 'refused',
      reason: 'group-changed',
    });
  });

  it('keeps the line of naming a group apart from the line of the member coming', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.attendance.flush();
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    await made.attendance.labelGroup(id, alice, 'park side');
    await made.attendance.flush();
    expect(made.said().slice(1)).toEqual([
      `**Alice** (<@${ALICE}>) is coming.\n**Alice** (<@${ALICE}>) named group A (park side).`,
    ]);
  });

  it('names as many in the notice of a new group as fit, and pings the rest after it (plan 8X-4)', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    const crowd: Record<string, object> = {};
    for (let n = 0; n < 150; n++) crowd[`70000000000000${String(1000 + n)}`] = {};
    await made.store.update(id, (party) => ({
      party: withAttendees(party, crowd),
    }));
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    await made.attendance.flush();
    const before = made.gateway.messagesIn(made.postId).length;
    await made.attendance.newGroup(id, alice);
    await made.attendance.flush();
    const said = made.gateway.messagesIn(made.postId).slice(before);
    const notice = said.find((message) => message.message.content?.includes('`/group join`'));
    const content = notice?.message.content ?? '';
    const users = notice?.message.mention?.users ?? [];
    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content).toContain('`/group join`');
    expect(users.length).toBeGreaterThan(50);
    expect(users.length).toBeLessThanOrEqual(100);
    const named = [...content.matchAll(/<@(\d+)>/g)].map((m) => m[1]);
    expect(named).toEqual([ALICE, ...users]);
    // The rest of the crowd in the messages after it, each pinged once.
    const pinged = said.flatMap((message) => message.message.mention?.users ?? []);
    expect(new Set(pinged).size).toBe(pinged.length);
    expect(pinged).toEqual(expect.arrayContaining(Object.keys(crowd)));
  });

  it('does not announce a group in the post of a party that ended meanwhile', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.attendance.flush();
    const original = made.users.getMany.bind(made.users);
    // The settings of the members arrive only once the party has ended.
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    made.users.getMany = async (snowflakes) => {
      await gate;
      return original(snowflakes);
    };
    const sends = () => made.gateway.calls.filter((call) => call.startsWith('sendMessage')).length;
    await made.attendance.newGroup(id, alice);
    const before = sends();
    await made.store.update(id, (party) => ({ party: endParty(party) }));
    release();
    await made.attendance.flush();
    expect(sends()).toBe(before);
  });

  it('refuses a sixth group', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    // Each by somebody else: a group its one member leaves goes (plan 8X-1B).
    const dave: Member = { id: '200000000000000005', name: 'Dave' };
    for (const member of [alice, bob, carol, dave]) await made.attendance.newGroup(id, member);
    expect(made.current().groups.map((group) => group.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    // By a newcomer: Dave, alone in E, would change nothing by a new group.
    expect(await made.attendance.newGroup(id, { id: '200000000000000006' })).toEqual({
      kind: 'refused',
      reason: 'too-many-groups',
    });
    expect(await made.attendance.newGroup(id, dave)).toEqual({
      kind: 'refused',
      reason: 'nothing-to-change',
    });
  });

  it('moves a member to a group and says where they stand', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.newGroup(id, alice);
    await made.attendance.flush();
    const moved = await made.attendance.joinGroup(id, bob, 'B');
    expect(moved).toMatchObject({ kind: 'ok', attendee: { group: 'B' } });
    expect(await made.attendance.joinGroup(id, bob, 'D')).toEqual({
      kind: 'refused',
      reason: 'no-such-group',
    });
    await made.attendance.flush();
    expect(made.said().at(-1)).toBe(`**Bob** (<@${BOB}>) is coming, in group B.`);
  });

  it('names a group and removes the name again', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    const named = await made.attendance.labelGroup(id, { id: REPORTER }, ' park *side* ');
    expect(named).toMatchObject({ kind: 'ok', group: 'A' });
    expect(made.current().groups[0]?.label).toBe('park *side*');
    await made.attendance.labelGroup(id, { id: REPORTER }, '');
    await made.attendance.flush();
    expect(made.said().join('\n').split('\n')).toEqual([
      `<@${REPORTER}> named group A (park \\*side\\*).`,
      `<@${REPORTER}> removed the name of group A.`,
    ]);
    expect(await made.attendance.labelGroup(id, alice, 'x')).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
  });
});

describe('AttendanceService: when Discord fails', () => {
  it('keeps the change and logs a warning when the line cannot be sent', async () => {
    const made = await reportedRaid();
    made.gateway.failing.set('sendMessage', new Error('no'));
    const outcome = await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    expect(outcome.kind).toBe('ok');
    await made.attendance.flush();
    expect(attendeeOf(made.current(), ALICE)).toBeDefined();
    expect(made.entries.some((e) => e.msg === 'could not post a party line')).toBe(true);
  });

  it('keeps the members asked when taking a failed question back fails too', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.flush();
    made.gateway.failing.set('sendMessage', new Error('no'));
    await made.attendance.done(id, alice);
    made.storage.failing = new Error('database down');
    await made.attendance.flush();
    made.storage.failing = undefined;
    const messages = made.entries.map((e) => e.msg);
    expect(messages).toContain('could not take back a question that was not sent');
    expect(messages).toContain('could not ask who completed');
    // The scheduler's timeout completes them, as before.
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.CompletePending);
  });
});

describe('AttendanceService: taking a question back', () => {
  /** Alice, Bob and Carol are here at a hatched raid; Alice has pressed Done. */
  async function aliceDone() {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    for (const member of [alice, bob, carol]) {
      await made.attendance.signUp(id, member, PartyStatus.Present);
    }
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    const questions = () =>
      made.gateway.messagesIn(made.postId).filter((message) => message.message.components?.length);
    return { made, id, questions };
  }

  it('puts the others back to here and deletes the question when the member is here again', async () => {
    const { made, id, questions } = await aliceDone();
    expect(questions()).toHaveLength(1);
    const outcome = await made.attendance.signUp(id, alice, PartyStatus.Present);
    expect(outcome).toMatchObject({ kind: 'ok', withdrawn: [BOB, CAROL] });
    await made.attendance.flush();
    expect(attendeeOf(made.current(), BOB)).toEqual({
      number: 1,
      status: PartyStatus.Present,
      group: 'A',
      remote: false,
      name: 'Bob',
    });
    expect(attendeeOf(made.current(), CAROL)?.status).toBe(PartyStatus.Present);
    expect(questions()).toEqual([]);
    expect(made.current().prompts.completion).toEqual([]);
    expect(made.said().join('\n').split('\n').slice(-2)).toEqual([
      `**Alice** (<@${ALICE}>) is here.`,
      'So I took back my question, and the others I asked are here again.',
    ]);
  });

  it('takes it back as well when the member joins, is interested or leaves', async () => {
    for (const back of ['join', 'maybe', 'leave'] as const) {
      const { made, id, questions } = await aliceDone();
      const outcome =
        back === 'leave'
          ? await made.attendance.leave(id, alice)
          : await made.attendance.signUp(
              id,
              alice,
              back === 'join' ? PartyStatus.Coming : PartyStatus.Interested,
            );
      expect(outcome, back).toMatchObject({ kind: 'ok', withdrawn: [BOB, CAROL] });
      await made.attendance.flush();
      expect(questions(), back).toEqual([]);
    }
  });

  it('lets the question stand once one of those asked has completed the raid', async () => {
    const { made, id, questions } = await aliceDone();
    await made.attendance.answer(id, bob, true);
    const outcome = await made.attendance.signUp(id, alice, PartyStatus.Present);
    expect(outcome).toMatchObject({ kind: 'ok', withdrawn: [] });
    await made.attendance.flush();
    expect(attendeeOf(made.current(), CAROL)?.status).toBe(PartyStatus.CompletePending);
    expect(questions()).toHaveLength(1);
    expect(made.said().join('\n')).not.toContain(WITHDRAWN_LINE);
  });

  it('leaves alone who answered "not yet", and who was asked by somebody else', async () => {
    const { made, id } = await aliceDone();
    await made.attendance.answer(id, bob, false);
    const outcome = await made.attendance.signUp(id, alice, PartyStatus.Present);
    expect(outcome).toMatchObject({ kind: 'ok', withdrawn: [CAROL] });
  });

  it('takes nothing back for a member who was never done, or is done again', async () => {
    const { made, id } = await aliceDone();
    expect(await made.attendance.changeNumber(id, bob, 1)).toMatchObject({ withdrawn: [] });
    expect(await made.attendance.done(id, alice)).toMatchObject({ withdrawn: [] });
    expect(attendeeOf(made.current(), CAROL)?.status).toBe(PartyStatus.CompletePending);
  });

  it('takes it back when a follower who had said yes goes back after the asker', async () => {
    const { made, id, questions } = await aliceDone();
    await made.attendance.answer(id, bob, true);
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    const outcome = await made.attendance.signUp(id, bob, PartyStatus.Present);
    expect(outcome).toMatchObject({ kind: 'ok', withdrawn: [CAROL] });
    await made.attendance.flush();
    expect(attendeeOf(made.current(), CAROL)?.status).toBe(PartyStatus.Present);
    expect(questions()).toEqual([]);
    expect(made.current().prompts.completion).toEqual([]);
  });

  it('deletes a question that was withdrawn while it was on its way', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    const done = made.attendance.done(id, alice);
    const back = made.attendance.signUp(id, alice, PartyStatus.Present);
    await Promise.all([done, back]);
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([]);
    expect(
      made.gateway.messagesIn(made.postId).filter((m) => m.message.components?.length),
    ).toEqual([]);
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
  });

  it('records a question once: Done, Here and Done again faster than one send', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.flush();
    await Promise.all([
      made.attendance.done(id, alice),
      made.attendance.signUp(id, alice, PartyStatus.Present),
      made.attendance.done(id, alice),
    ]);
    await made.attendance.flush();
    const questions = made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.components?.length)
      .filter((message) => !made.gateway.deleted.some((gone) => gone.messageId === message.id));
    expect(questions).toHaveLength(1);
    expect(made.current().prompts.completion).toEqual([{ id: questions[0]?.id, members: [BOB] }]);
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.CompletePending);
  });

  it('has the ending of the party wait for a question on its way, which goes before the archiving', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.flush();
    const held = heldCall('the question');
    const send = made.gateway.sendMessage.bind(made.gateway);
    const asked: (string | undefined)[] = [];
    vi.spyOn(made.gateway, 'sendMessage').mockImplementation(async (channel, message, options) => {
      if (message.v2 || !message.components?.length) return send(channel, message, options);
      held.arrive();
      await held.released;
      const id = await send(channel, message, options);
      asked.push(id);
      return id;
    });
    const immediates = watchForTest();
    await made.attendance.done(id, alice);
    await held.reached;
    const ending = made.service.end(id);
    await immediates.settle();
    // The party has ended, but its post stays open while the question is on its way.
    expect(made.store.get(id)).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    held.release();
    expect(await ending).toBe(true);
    await made.attendance.flush();
    // Sent while the post was open, and deleted again before the archiving: nothing failed.
    expect(asked).toEqual([expect.any(String)]);
    expect(made.gateway.deleted.map((gone) => gone.messageId)).toContain(asked[0]);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
    expect(made.entries.filter((entry) => entry.msg === 'could not ask who completed')).toEqual([]);
  });
});

describe('AttendanceService: a question and the members it asked', () => {
  it('removes each question when its own members have answered, whoever else is still asked', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.newGroup(id, carol);
    await made.attendance.signUp(id, carol, PartyStatus.Present);
    await made.attendance.signUp(id, { id: REPORTER }, PartyStatus.Present, { group: 'B' });
    await made.attendance.done(id, alice);
    await made.attendance.done(id, carol);
    await made.attendance.flush();
    expect(made.current().prompts.completion.map((q) => q.members)).toEqual([[BOB], [REPORTER]]);
    const [first, second] = made.current().prompts.completion;
    await made.attendance.answer(id, bob, false);
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([second]);
    expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual([first?.id]);
  });

  it('puts the members back to here when the question cannot be sent', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.flush();
    made.gateway.failing.set('sendMessage', new Error('no'));
    const outcome = await made.attendance.done(id, alice);
    expect(outcome).toMatchObject({ kind: 'ok', asked: [BOB] });
    await made.attendance.flush();
    expect(attendeeOf(made.current(), BOB)).toEqual({
      number: 1,
      status: PartyStatus.Present,
      group: 'A',
      remote: false,
      name: 'Bob',
    });
    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Complete);
    expect(made.entries.some((e) => e.msg === 'could not ask who completed')).toBe(true);
  });
});
