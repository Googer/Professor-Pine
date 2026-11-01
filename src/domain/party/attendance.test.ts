import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  CAROL,
  MINUTE,
  PARTY_NOW,
  REPORTER,
  testMeetup,
  testRaid,
  testRaidRules,
  withAttendees,
} from '../../../test/support/parties.js';
import {
  answerCompletion,
  applyAutoStatus,
  attendanceLimits,
  changeNumber,
  completeRaid,
  completeUnanswered,
  createGroup,
  finishParty,
  joinGroup,
  joinInto,
  labelGroup,
  leaveParty,
  releaseAsked,
  servedQuestions,
  setAttendance,
  setMeetingTime,
  setNotHere,
  setRemote,
  withdrawQuestions,
} from './attendance.js';
import { headCount, type Change, type RaidParty } from './party.js';
import { setHatchTime } from './raid.js';
import { PartyStatus } from './status.js';

const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });
const { Interested, Coming, Present, CompletePending, Complete } = PartyStatus;

/** The party of a change that must have worked. */
function done<Extra>(change: Change<RaidParty, Extra>): RaidParty {
  if (!change.ok) throw new Error(`refused: ${change.reason}`);
  return change.party;
}

/**
 * The test raid with a group B that the reporter opened and is in. Somebody keeps them company
 * in A while they open it (alone in A, a new group would change nothing), and is gone after.
 */
function reporterInB(): RaidParty {
  const company = '200000000000000008';
  const opened = done(
    createGroup(withAttendees(testRaid(), { [company]: { group: 'A' } }), REPORTER, limits),
  );
  const { [company]: _company, ...attendees } = opened.attendees;
  return { ...opened, attendees };
}

describe('setAttendance', () => {
  it('signs a new member up alone, in person, in the default group', () => {
    const change = setAttendance(testRaid(), ALICE, Coming, {}, limits);
    expect(change).toMatchObject({ ok: true, joined: true });
    expect(done(change).attendees[ALICE]).toEqual({
      number: 1,
      status: Coming,
      group: 'A',
      remote: false,
    });
  });

  it('takes count, group and remote for a new member', () => {
    const party = reporterInB();
    const change = setAttendance(
      party,
      ALICE,
      Present,
      { number: 3, group: 'A', remote: true },
      limits,
    );
    expect(done(change).attendees[ALICE]).toEqual({
      number: 3,
      status: Present,
      group: 'A',
      remote: true,
    });
  });

  it('changes only the status of an attendee unless more is given', () => {
    const party = withAttendees(testRaid(), { [ALICE]: { number: 4, group: 'A', remote: true } });
    const change = setAttendance(party, ALICE, Present, {}, limits);
    expect(change).toMatchObject({ ok: true, joined: false });
    expect(done(change).attendees[ALICE]).toEqual({
      number: 4,
      status: Present,
      group: 'A',
      remote: true,
    });
    expect(
      done(setAttendance(party, ALICE, Coming, { number: 2 }, limits)).attendees[ALICE]?.number,
    ).toBe(2);
  });

  it('works from every status and forgets a pending question', () => {
    const party = withAttendees(testRaid(), {
      [ALICE]: { status: Complete },
      [BOB]: { status: CompletePending, pendingUntil: PARTY_NOW + 5 * MINUTE },
    });
    expect(done(setAttendance(party, ALICE, Interested, {}, limits)).attendees[ALICE]?.status).toBe(
      Interested,
    );
    expect(done(setAttendance(party, BOB, Coming, {}, limits)).attendees[BOB]).toEqual({
      number: 1,
      status: Coming,
      group: 'A',
      remote: false,
    });
  });

  it('refuses a head count outside 1 to 21, an unknown group, and remote on an elite raid', () => {
    const party = testRaid();
    for (const number of [0, -1, 22, 1.5, Number.NaN]) {
      expect(setAttendance(party, ALICE, Coming, { number }, limits)).toEqual({
        ok: false,
        reason: 'bad-count',
      });
    }
    expect(setAttendance(party, ALICE, Coming, { number: 21 }, limits).ok).toBe(true);
    expect(setAttendance(party, ALICE, Coming, { group: 'B' }, limits)).toEqual({
      ok: false,
      reason: 'no-such-group',
    });
    const elite = testRaid({ tier: { level: 'Elite', shadow: false } });
    expect(setAttendance(elite, ALICE, Coming, { remote: true }, limits)).toEqual({
      ok: false,
      reason: 'in-person-only',
    });
    expect(setAttendance(elite, ALICE, Coming, { remote: false }, limits).ok).toBe(true);
  });

  it('never changes the party it was given', () => {
    const party = testRaid();
    const before = structuredClone(party);
    setAttendance(party, ALICE, Coming, { number: 2 }, limits);
    expect(party).toEqual(before);
  });

  it('is not fooled by a member id that is a property of every object', () => {
    const change = setAttendance(testRaid(), 'constructor', Coming, {}, limits);
    expect(change).toMatchObject({ ok: true, joined: true });
    expect(leaveParty(testRaid(), 'toString')).toEqual({ ok: false, reason: 'not-attending' });
  });
});

describe('setRemote', () => {
  it('signs a new member up as interested with the flag', () => {
    const change = setRemote(testRaid(), ALICE, true, { number: 2 }, limits);
    expect(change).toMatchObject({ ok: true, joined: true });
    expect(done(change).attendees[ALICE]).toEqual({
      number: 2,
      status: Interested,
      group: 'A',
      remote: true,
    });
  });

  it('keeps the status of an attendee, both ways', () => {
    const party = withAttendees(testRaid(), { [ALICE]: { status: Present } });
    const remote = done(setRemote(party, ALICE, true, {}, limits));
    expect(remote.attendees[ALICE]).toMatchObject({ status: Present, remote: true });
    expect(done(setRemote(remote, ALICE, false, {}, limits)).attendees[ALICE]).toMatchObject({
      status: Present,
      remote: false,
    });
  });

  it('is refused on an elite raid, for a new member and for an attendee', () => {
    const elite = withAttendees(testRaid({ tier: { level: 'Elite', shadow: false } }), {
      [ALICE]: {},
    });
    expect(setRemote(elite, ALICE, true, {}, limits)).toEqual({
      ok: false,
      reason: 'in-person-only',
    });
    expect(setRemote(elite, BOB, true, {}, limits)).toEqual({
      ok: false,
      reason: 'in-person-only',
    });
    expect(setRemote(elite, ALICE, false, {}, limits).ok).toBe(true);
  });
});

describe('changeNumber', () => {
  it('adds and takes away one, within 1 and the maximum', () => {
    let party = withAttendees(testRaid(), { [ALICE]: { number: 1 } });
    expect(changeNumber(party, ALICE, -1, limits)).toMatchObject({ ok: true, changed: false });
    party = done(changeNumber(party, ALICE, 1, limits));
    expect(party.attendees[ALICE]?.number).toBe(2);
    party = withAttendees(party, { [ALICE]: { number: 21 } });
    expect(changeNumber(party, ALICE, 1, limits)).toMatchObject({ ok: true, changed: false });
    expect(done(changeNumber(party, ALICE, -1, limits)).attendees[ALICE]?.number).toBe(20);
  });

  it('signs somebody up as interested on +1 and refuses -1 from somebody not signed up', () => {
    const change = changeNumber(testRaid(), ALICE, 1, limits);
    expect(change).toMatchObject({ ok: true, joined: true, changed: true });
    expect(done(change).attendees[ALICE]).toMatchObject({ number: 1, status: Interested });
    expect(changeNumber(testRaid(), ALICE, -1, limits)).toEqual({
      ok: false,
      reason: 'not-attending',
    });
  });
});

describe('setNotHere and leaveParty', () => {
  it('puts an attendee back to interested and removes one who leaves', () => {
    const party = withAttendees(testRaid(), { [ALICE]: { status: Present, number: 2 } });
    expect(done(setNotHere(party, ALICE)).attendees[ALICE]).toMatchObject({
      status: Interested,
      number: 2,
    });
    expect(done(leaveParty(party, ALICE)).attendees).not.toHaveProperty(ALICE);
    expect(done(leaveParty(party, ALICE)).attendees).toHaveProperty(REPORTER);
  });

  it('refuses both from somebody who is not signed up, instead of adding them', () => {
    expect(setNotHere(testRaid(), ALICE)).toEqual({ ok: false, reason: 'not-attending' });
    expect(leaveParty(testRaid(), ALICE)).toEqual({ ok: false, reason: 'not-attending' });
  });
});

describe('completing a raid', () => {
  const party = withAttendees(reporterInB(), {
    [ALICE]: { status: Present, group: 'A' },
    [BOB]: { status: Present, group: 'A', number: 2 },
    [CAROL]: { status: Coming, group: 'A' },
    '200000000000000009': { status: Present, group: 'B' },
  });

  it('completes the member and asks the present members of the same group', () => {
    const change = completeRaid(party, ALICE, PARTY_NOW, 5);
    expect(change).toMatchObject({ ok: true, asked: [BOB] });
    const after = done(change);
    expect(after.attendees[ALICE]?.status).toBe(Complete);
    expect(after.attendees[BOB]).toMatchObject({
      status: CompletePending,
      pendingUntil: PARTY_NOW + 5 * MINUTE,
    });
    expect(after.attendees[CAROL]?.status).toBe(Coming);
    expect(after.attendees['200000000000000009']?.status).toBe(Present);
  });

  it('refuses somebody who never signed up, instead of adding them as complete', () => {
    expect(completeRaid(party, '200000000000000099', PARTY_NOW, 5)).toEqual({
      ok: false,
      reason: 'not-attending',
    });
  });

  it('takes yes and no as an answer, once', () => {
    const asked = done(completeRaid(party, ALICE, PARTY_NOW, 5));
    const yes = done(answerCompletion(asked, BOB, true));
    expect(yes.attendees[BOB]).toEqual({
      number: 2,
      status: Complete,
      group: 'A',
      remote: false,
      askedBy: ALICE,
    });
    const no = done(answerCompletion(asked, BOB, false));
    expect(no.attendees[BOB]).toEqual({ number: 2, status: Present, group: 'A', remote: false });
    expect(answerCompletion(yes, BOB, false)).toEqual({ ok: false, reason: 'not-pending' });
    expect(answerCompletion(asked, CAROL, true)).toEqual({ ok: false, reason: 'not-pending' });
    expect(answerCompletion(asked, '200000000000000099', true)).toEqual({
      ok: false,
      reason: 'not-pending',
    });
  });

  it('counts silence as yes once the time is up, and not a moment before', () => {
    const asked = done(completeRaid(party, ALICE, PARTY_NOW, 5));
    expect(completeUnanswered(asked, PARTY_NOW + 5 * MINUTE - 1)).toEqual({
      party: asked,
      completed: [],
    });
    const late = completeUnanswered(asked, PARTY_NOW + 5 * MINUTE);
    expect(late.completed).toEqual([BOB]);
    expect(late.party.attendees[BOB]).toEqual({
      number: 2,
      status: Complete,
      group: 'A',
      remote: false,
      askedBy: ALICE,
    });
  });

  it('leaves the completed out of the head count but keeps those who were asked', () => {
    const asked = done(completeRaid(party, ALICE, PARTY_NOW, 5));
    // Group A: Bob 2 (asked) and Carol 1; Alice is done. Group B: the reporter and one more.
    expect(headCount(asked, 'A')).toBe(3);
    expect(headCount(asked)).toBe(5);
  });
});

describe('groups', () => {
  it('opens groups B to E, makes the newest the default and moves the member into it', () => {
    let party = withAttendees(testRaid(), {
      [ALICE]: { status: Present, number: 3 },
      [BOB]: { status: Complete },
    });
    const change = createGroup(party, ALICE, limits);
    expect(change).toMatchObject({ ok: true, group: 'B', joined: false, others: [REPORTER] });
    party = done(change);
    expect(party.groups.map((group) => group.id)).toEqual(['A', 'B']);
    expect(party.defaultGroupId).toBe('B');
    expect(party.attendees[ALICE]).toMatchObject({ group: 'B', status: Present, number: 3 });
    expect(done(setAttendance(party, CAROL, Coming, {}, limits)).attendees[CAROL]?.group).toBe('B');

    // Each by a newcomer: Alice, alone in B now, would change nothing by a new group.
    const newcomers = [CAROL, '200000000000000005', '200000000000000006'];
    for (const [n, id] of (['C', 'D', 'E'] as const).entries()) {
      const next = createGroup(party, newcomers[n] ?? '', limits);
      expect(next).toMatchObject({ ok: true, group: id });
      party = done(next);
    }
    expect(createGroup(party, '200000000000000007', limits)).toEqual({
      ok: false,
      reason: 'too-many-groups',
    });
  });

  it('opens a group under a letter no group has, after one went (a split, plan 8T)', () => {
    // Groups A and C: B was split off. The next group is D, never a second C.
    const gapped = {
      ...testRaid(),
      groups: [{ id: 'A' }, { id: 'C' }],
      defaultGroupId: 'C',
    } as const;
    const opened = createGroup(gapped, ALICE, limits);
    expect(opened).toMatchObject({ ok: true, group: 'D' });
    // With E in use, the first letter that is free.
    const late = {
      ...testRaid(),
      groups: [{ id: 'A' }, { id: 'C' }, { id: 'E' }],
      defaultGroupId: 'E',
    } as const;
    expect(createGroup(late, ALICE, limits)).toMatchObject({ ok: true, group: 'B' });
  });

  it('adds somebody who is not signed up as coming when they open or join a group', () => {
    const opened = createGroup(testRaid(), ALICE, limits);
    expect(opened).toMatchObject({ ok: true, joined: true });
    expect(done(opened).attendees[ALICE]).toEqual({
      number: 1,
      status: Coming,
      group: 'B',
      remote: false,
    });
    const joined = joinGroup(done(opened), BOB, 'A', limits);
    expect(joined).toMatchObject({ ok: true, joined: true });
    expect(done(joined).attendees[BOB]).toMatchObject({ status: Coming, group: 'A' });
  });

  it('joins into a group: coming there from any status but coming, which only moves', () => {
    const party = withAttendees(reporterInB(), {
      [ALICE]: { status: PartyStatus.Interested, number: 2, group: 'A', remote: true },
      [BOB]: { status: Present, group: 'A' },
      [CAROL]: { status: Coming, group: 'A' },
    });
    for (const member of [ALICE, BOB, CAROL]) {
      expect(done(joinInto(party, member, 'B', limits)).attendees[member]).toMatchObject({
        status: Coming,
        group: 'B',
      });
    }
    // What else the member gave stays: the head count, remote.
    expect(done(joinInto(party, ALICE, 'B', limits)).attendees[ALICE]).toMatchObject({
      number: 2,
      remote: true,
    });
    const newcomer = joinInto(party, '200000000000000077', 'A', limits);
    expect(newcomer).toMatchObject({ ok: true, joined: true });
    expect(done(newcomer).attendees['200000000000000077']).toMatchObject({
      status: Coming,
      group: 'A',
    });
    // Coming already, in that group: nothing changes.
    const same = joinInto(party, CAROL, 'A', limits);
    expect(same.ok && same.party).toBe(party);
    expect(joinInto(party, ALICE, 'C', limits)).toEqual({ ok: false, reason: 'no-such-group' });
    expect(joinInto(testMeetup(), ALICE, 'A', limits)).toEqual({ ok: false, reason: 'no-groups' });
  });

  it('joins into one’s own group: only who is interested comes, who is present or asked stays so', () => {
    const party = withAttendees(reporterInB(), {
      [ALICE]: { status: PartyStatus.Interested, number: 2, group: 'A', remote: true },
      [BOB]: { status: Present, group: 'A' },
      [CAROL]: { status: Coming, group: 'A' },
    });
    const present = joinInto(party, BOB, 'A', limits);
    expect(present).toMatchObject({ ok: true, joined: false });
    expect(present.ok && present.party).toBe(party);
    // Who is being asked whether they completed the raid stays asked, as who is present.
    const ASKED = '200000000000000005';
    const pending = withAttendees(party, {
      [ASKED]: { status: CompletePending, pendingUntil: PARTY_NOW + 5 * MINUTE, group: 'A' },
    });
    const asked = joinInto(pending, ASKED, 'A', limits);
    expect(asked).toMatchObject({ ok: true, joined: false });
    expect(asked.ok && asked.party).toBe(pending);
    const coming = joinInto(party, CAROL, 'A', limits);
    expect(coming.ok && coming.party).toBe(party);
    expect(done(joinInto(party, ALICE, 'A', limits)).attendees[ALICE]).toMatchObject({
      status: Coming,
      group: 'A',
      number: 2,
      remote: true,
    });
  });

  it('moves an attendee to another group and refuses a group that does not exist', () => {
    const party = withAttendees(reporterInB(), {
      [ALICE]: { status: Present, number: 2, group: 'A' },
    });
    expect(done(joinGroup(party, ALICE, 'B', limits)).attendees[ALICE]).toMatchObject({
      status: Present,
      number: 2,
      group: 'B',
    });
    expect(joinGroup(party, ALICE, 'C', limits)).toEqual({ ok: false, reason: 'no-such-group' });
    expect(joinGroup(party, BOB, 'C', limits)).toEqual({ ok: false, reason: 'no-such-group' });
  });

  it('labels the group of an attendee, tidies the text, and removes the label with an empty one', () => {
    let party = done(labelGroup(testRaid(), REPORTER, '  park   side \n'));
    expect(party.groups).toEqual([{ id: 'A', label: 'park side' }]);
    party = done(labelGroup(party, REPORTER, '   '));
    expect(party.groups).toEqual([{ id: 'A' }]);
    expect(labelGroup(party, ALICE, 'mine')).toEqual({ ok: false, reason: 'not-attending' });
    expect(labelGroup(party, REPORTER, 'x'.repeat(101))).toEqual({
      ok: false,
      reason: 'label-too-long',
    });
    expect(labelGroup(party, REPORTER, 'x'.repeat(100)).ok).toBe(true);
  });

  it('sets and removes the meeting time of the own group and names who to tell', () => {
    const base = withAttendees(reporterInB(), {
      [ALICE]: { group: 'A', status: Interested },
      [BOB]: { group: 'A', status: Complete },
      [CAROL]: { group: 'A', status: Present },
    });
    const meet = PARTY_NOW + 30 * MINUTE;
    const change = setMeetingTime(base, ALICE, meet);
    expect(change).toMatchObject({ ok: true, group: 'A', others: [CAROL] });
    let party = done(change);
    expect(party.groups).toEqual([
      { id: 'A', startTime: meet },
      { id: 'B', opened: PARTY_NOW + 1 },
    ]);

    // A new time forgets that the old one had passed; null removes both.
    party = {
      ...party,
      groups: [{ id: 'A', startTime: meet, startClearTime: meet + 10 * MINUTE }, { id: 'B' }],
    };
    expect(done(setMeetingTime(party, ALICE, meet + MINUTE)).groups[0]).toEqual({
      id: 'A',
      startTime: meet + MINUTE,
    });
    expect(done(setMeetingTime(party, ALICE, null)).groups[0]).toEqual({ id: 'A' });
    expect(setMeetingTime(party, '200000000000000099', meet)).toEqual({
      ok: false,
      reason: 'not-attending',
    });
  });
});

describe('applyAutoStatus', () => {
  it('signs up somebody who is not an attendee and leaves an attendee exactly as they are', () => {
    const party = withAttendees(testRaid(), {
      [ALICE]: { status: Present, number: 3, remote: true },
    });
    const attendee = applyAutoStatus(party, ALICE, Interested);
    expect(attendee.joined).toBe(false);
    expect(attendee.party).toBe(party);
    const signedUp = applyAutoStatus(party, BOB, Coming);
    expect(signedUp.joined).toBe(true);
    expect(signedUp.party.attendees[BOB]).toEqual({
      number: 1,
      status: Coming,
      group: 'A',
      remote: false,
    });
    const notInterested = applyAutoStatus(party, BOB, PartyStatus.NotInterested);
    expect(notInterested.joined).toBe(false);
    expect(notInterested.party).toBe(party);
  });
});

describe('a member who was asked whether they completed the raid', () => {
  const until = PARTY_NOW + 5 * MINUTE;
  const asked = withAttendees(reporterInB(), {
    [ALICE]: { status: CompletePending, pendingUntil: until, group: 'A', number: 2 },
  });

  it('has answered "not yet" by moving to another group (joinGroup)', () => {
    expect(done(joinGroup(asked, ALICE, 'B', limits)).attendees[ALICE]).toEqual({
      number: 2,
      status: Present,
      group: 'B',
      remote: false,
    });
  });

  it('is left alone by joining the group they are in', () => {
    expect(done(joinGroup(asked, ALICE, 'A', limits))).toBe(asked);
  });

  it('answers "not yet" by opening a group (createGroup)', () => {
    // Carol in A with her: alone there, a new group would change nothing.
    const party = done(
      createGroup(withAttendees(asked, { [CAROL]: { group: 'A' } }), ALICE, limits),
    );
    expect(party.attendees[ALICE]).toEqual({
      number: 2,
      status: Present,
      group: 'C',
      remote: false,
    });
  });

  it('stays pending, with the same time, when only the remote flag changes (setRemote)', () => {
    expect(done(setRemote(asked, ALICE, true, {}, limits)).attendees[ALICE]).toEqual({
      number: 2,
      status: CompletePending,
      pendingUntil: until,
      group: 'A',
      remote: true,
    });
  });

  it('answers "not yet" when setRemote moves them to another group', () => {
    expect(done(setRemote(asked, ALICE, true, { group: 'B' }, limits)).attendees[ALICE]).toEqual({
      number: 2,
      status: Present,
      group: 'B',
      remote: true,
    });
    expect(done(setRemote(asked, ALICE, false, { group: 'A' }, limits))).toBe(asked);
  });

  it('stays pending when only the head count changes', () => {
    expect(done(changeNumber(asked, ALICE, 1, limits)).attendees[ALICE]).toEqual({
      number: 3,
      status: CompletePending,
      pendingUntil: until,
      group: 'A',
      remote: false,
    });
    expect(done(setRemote(asked, ALICE, false, { number: 4 }, limits)).attendees[ALICE]).toEqual({
      number: 4,
      status: CompletePending,
      pendingUntil: until,
      group: 'A',
      remote: false,
    });
  });

  it('loses the question when they say they are not here', () => {
    expect(done(setNotHere(asked, ALICE)).attendees[ALICE]).toEqual({
      number: 2,
      status: Interested,
      group: 'A',
      remote: false,
    });
  });

  it('loses the question when they complete the raid themselves', () => {
    expect(done(completeRaid(asked, ALICE, PARTY_NOW, 5)).attendees[ALICE]).toEqual({
      number: 2,
      status: Complete,
      group: 'A',
      remote: false,
    });
  });
});

describe('a change that makes no difference returns the very same party', () => {
  const base = withAttendees(reporterInB(), {
    [REPORTER]: { status: Interested, group: 'A' },
    [ALICE]: { status: Present, number: 2, group: 'A', remote: true },
    [BOB]: { status: Interested, group: 'A' },
  });
  const meet = PARTY_NOW + 30 * MINUTE;
  const timed: RaidParty = {
    ...base,
    groups: [{ id: 'A', startTime: meet, label: 'park' }, { id: 'B' }],
  };

  it('setAttendance to what the attendee already has', () => {
    const same = setAttendance(
      base,
      ALICE,
      Present,
      { number: 2, group: 'A', remote: true },
      limits,
    );
    expect(same).toMatchObject({ ok: true, joined: false });
    expect(done(same)).toBe(base);
    expect(done(setAttendance(base, ALICE, Present, {}, limits))).toBe(base);
  });

  it('setAttendance from a pending question is a change, because the time is dropped', () => {
    const asked = withAttendees(base, {
      [ALICE]: { status: CompletePending, pendingUntil: PARTY_NOW, number: 2, remote: true },
    });
    expect(done(setAttendance(asked, ALICE, Present, {}, limits))).not.toBe(asked);
  });

  it('setRemote to the flag they have', () => {
    expect(done(setRemote(base, ALICE, true, {}, limits))).toBe(base);
    expect(done(setRemote(base, BOB, false, {}, limits))).toBe(base);
  });

  it('setNotHere when already interested', () => {
    expect(done(setNotHere(base, BOB))).toBe(base);
  });

  it('joinGroup into their own group', () => {
    expect(done(joinGroup(base, ALICE, 'A', limits))).toBe(base);
  });

  it('labelGroup with the label the group has, or removing one that is not there', () => {
    expect(done(labelGroup(timed, REPORTER, ' park '))).toBe(timed);
    expect(done(labelGroup(base, REPORTER, ''))).toBe(base);
  });

  it('setMeetingTime with the time the group has, or null when it has none', () => {
    const same = setMeetingTime(timed, REPORTER, meet);
    expect(same).toMatchObject({ ok: true, others: [] });
    expect(done(same)).toBe(timed);
    const none = setMeetingTime(base, REPORTER, null);
    expect(none).toMatchObject({ ok: true, others: [] });
    expect(done(none)).toBe(base);
  });

  it('setMeetingTime on a group with a clear time is a change, and names who to tell', () => {
    const passed: RaidParty = {
      ...timed,
      groups: [{ id: 'A', startTime: meet, startClearTime: PARTY_NOW }, { id: 'B' }],
    };
    const change = setMeetingTime(passed, REPORTER, meet);
    expect(done(change)).not.toBe(passed);
    expect(change).toMatchObject({ others: [ALICE, BOB] });
  });

  it('changeNumber that cannot move', () => {
    const alone = withAttendees(base, { [BOB]: { number: 1, status: Interested } });
    expect(done(changeNumber(alone, BOB, -1, limits))).toBe(alone);
  });
});

describe('a change of one field alone is a change', () => {
  it('an attendee whose only difference is pendingUntil', () => {
    const stray = withAttendees(testRaid(), {
      [ALICE]: { status: Present, pendingUntil: PARTY_NOW + 5 * MINUTE },
    });
    const same = setAttendance(stray, ALICE, Present, {}, limits);
    expect(done(same)).not.toBe(stray);
    expect(done(same).attendees[ALICE]).toEqual({
      number: 1,
      status: Present,
      group: 'A',
      remote: false,
    });
  });

  it('a group whose only difference is startClearTime', () => {
    const minute = PARTY_NOW + 30 * MINUTE;
    const cleared: RaidParty = {
      ...testRaid(),
      groups: [{ id: 'A', startTime: minute, startClearTime: minute + 10 * MINUTE }],
    };
    const changed = done(setMeetingTime(cleared, REPORTER, minute));
    expect(changed).not.toBe(cleared);
    expect(changed.groups[0]).toEqual({ id: 'A', startTime: minute });
  });
});

describe('setMeetingTime', () => {
  it('drops the seconds, like a hatch time', () => {
    const minute = PARTY_NOW + 30 * MINUTE;
    const party = done(setMeetingTime(testRaid(), REPORTER, minute + 45_678));
    expect(party.groups[0]?.startTime).toBe(minute);
  });
});

describe('changeNumber with a maximum that was lowered', () => {
  const crowded = withAttendees(testRaid(), { [ALICE]: { number: 30 } });

  it('never lowers a count on +1', () => {
    const change = changeNumber(crowded, ALICE, 1, limits);
    expect(change).toMatchObject({ ok: true, changed: false });
    expect(done(change)).toBe(crowded);
  });

  it('goes down by one from where it is on -1', () => {
    const change = changeNumber(crowded, ALICE, -1, limits);
    expect(change).toMatchObject({ ok: true, changed: true });
    expect(done(change).attendees[ALICE]?.number).toBe(29);
  });
});

describe('completeRaid by the status of the caller', () => {
  const party = withAttendees(testRaid(), {
    [ALICE]: { status: Interested },
    [BOB]: { status: Present },
    [CAROL]: { status: Present, number: 2 },
    '200000000000000009': { status: Coming },
  });

  it.each([
    ['coming', Coming],
    ['present', Present],
  ] as const)('asks the others when the caller was %s', (_name, status) => {
    const before = withAttendees(party, { [ALICE]: { status } });
    const change = completeRaid(before, ALICE, PARTY_NOW, 5);
    expect(change).toMatchObject({ ok: true, wasComplete: false, asked: [BOB, CAROL] });
    expect(done(change).attendees[ALICE]?.status).toBe(Complete);
  });

  it('asks the others when the caller was asked themself', () => {
    const before = withAttendees(party, {
      [ALICE]: { status: CompletePending, pendingUntil: PARTY_NOW },
    });
    expect(completeRaid(before, ALICE, PARTY_NOW, 5)).toMatchObject({
      ok: true,
      wasComplete: false,
      asked: [BOB, CAROL],
    });
  });

  it('asks nobody when the caller was merely interested', () => {
    const change = completeRaid(party, ALICE, PARTY_NOW, 5);
    expect(change).toMatchObject({ ok: true, wasComplete: false, asked: [] });
    const after = done(change);
    expect(after.attendees[ALICE]?.status).toBe(Complete);
    expect(after.attendees[BOB]?.status).toBe(Present);
  });

  it('asks nobody and returns the same party when the caller had already completed it', () => {
    const before = withAttendees(party, { [ALICE]: { status: Complete } });
    const change = completeRaid(before, ALICE, PARTY_NOW, 5);
    expect(change).toMatchObject({ ok: true, wasComplete: true, asked: [] });
    expect(done(change)).toBe(before);
  });
});

describe('immutability', () => {
  it('completeRaid and createGroup leave the party they were given alone', () => {
    const party = withAttendees(testRaid(), {
      [ALICE]: { status: Present },
      [BOB]: { status: Present },
    });
    const before = structuredClone(party);
    completeRaid(party, ALICE, PARTY_NOW, 5);
    createGroup(party, ALICE, limits);
    expect(party).toEqual(before);
  });
});

describe('a key that is present but undefined', () => {
  it('does not make a real change look like no change', () => {
    // Two keys on each side: `startClearTime: undefined` must not stand in for `startTime`.
    const party = {
      ...testRaid(),
      groups: [{ id: 'A' as const, startClearTime: undefined }],
    };
    const meet = PARTY_NOW + 30 * MINUTE;
    const change = setMeetingTime(party, REPORTER, meet);
    expect(change.ok && change.party.groups[0]).toEqual({ id: 'A', startTime: meet });
  });
});

describe('withdrawQuestions', () => {
  const TIMEOUT = 5;
  /** Alice, Bob and Carol are present in group A; Alice has completed the raid. */
  function aliceDone(): RaidParty {
    const raid = withAttendees(testRaid({ boss: { key: 'yveltal' } }), {
      [ALICE]: { status: Present },
      [BOB]: { status: Present, number: 2 },
      [CAROL]: { status: Present },
    });
    return done(completeRaid(raid, ALICE, PARTY_NOW, TIMEOUT));
  }

  it('records with everybody asked whose Done asked them', () => {
    const raid = aliceDone();
    expect(raid.attendees[BOB]).toEqual({
      number: 2,
      status: CompletePending,
      group: 'A',
      remote: false,
      pendingUntil: PARTY_NOW + TIMEOUT * MINUTE,
      askedBy: ALICE,
    });
    expect(raid.attendees[ALICE]?.askedBy).toBeUndefined();
  });

  it('does nothing while the member is done', () => {
    const raid = aliceDone();
    expect(withdrawQuestions(raid)).toEqual({ party: raid, released: [] });
    expect(withdrawQuestions(raid).party).toBe(raid);
  });

  it('puts those asked back to present, without a trace of the question', () => {
    const back = done(setAttendance(aliceDone(), ALICE, Present, {}, limits));
    const withdrawn = withdrawQuestions(back);
    expect(withdrawn.released).toEqual([BOB, CAROL]);
    expect(withdrawn.party.attendees[BOB]).toEqual({
      number: 2,
      status: Present,
      group: 'A',
      remote: false,
    });
    expect(withdrawQuestions(withdrawn.party).party).toBe(withdrawn.party);
  });

  it('works when the member has left', () => {
    const left = done(leaveParty(aliceDone(), ALICE));
    expect(withdrawQuestions(left).released).toEqual([BOB, CAROL]);
  });

  it('lets the question stand when one of those asked completed: by yes, by silence or by Done', () => {
    const ways: ((raid: RaidParty) => RaidParty)[] = [
      (raid) => done(answerCompletion(raid, BOB, true)),
      (raid) => completeUnanswered(raid, PARTY_NOW + TIMEOUT * MINUTE).party,
      (raid) => done(completeRaid(raid, BOB, PARTY_NOW + MINUTE, TIMEOUT)),
    ];
    for (const way of ways) {
      const followed = way(aliceDone());
      expect(followed.attendees[BOB]).toMatchObject({ status: Complete, askedBy: ALICE });
      const back = done(setAttendance(followed, ALICE, Present, {}, limits));
      expect(withdrawQuestions(back)).toEqual({ party: back, released: [] });
    }
  });

  it('releases only who is still asked: not who answered "not yet", moved or stepped back', () => {
    let raid = done(answerCompletion(aliceDone(), BOB, false));
    expect(raid.attendees[BOB]?.askedBy).toBeUndefined();
    raid = done(setAttendance(raid, ALICE, Coming, {}, limits));
    expect(withdrawQuestions(raid).released).toEqual([CAROL]);
    const stepped = done(setNotHere(aliceDone(), CAROL));
    expect(stepped.attendees[CAROL]).toEqual({
      number: 1,
      status: Interested,
      group: 'A',
      remote: false,
    });
  });

  it('leaves alone who was asked by somebody else, or by the scheduler', () => {
    const raid = withAttendees(aliceDone(), {
      [REPORTER]: { status: CompletePending, pendingUntil: PARTY_NOW + MINUTE },
    });
    const back = done(setAttendance(raid, ALICE, Present, {}, limits));
    const withdrawn = withdrawQuestions(back);
    expect(withdrawn.released).toEqual([BOB, CAROL]);
    expect(withdrawn.party.attendees[REPORTER]?.status).toBe(CompletePending);
  });

  it('releases the rest when the one who followed goes back too', () => {
    const followed = done(answerCompletion(aliceDone(), BOB, true));
    const aliceBack = done(setAttendance(followed, ALICE, Present, {}, limits));
    expect(withdrawQuestions(aliceBack).released).toEqual([]);
    const bobBack = done(setAttendance(aliceBack, BOB, Present, {}, limits));
    const withdrawn = withdrawQuestions(bobBack);
    expect(withdrawn.released).toEqual([CAROL]);
    expect(withdrawn.party.attendees[CAROL]?.status).toBe(Present);
  });

  it('lets a question stand while its asker is done, whoever else goes back', () => {
    const followed = done(answerCompletion(aliceDone(), BOB, true));
    const bobBack = done(setAttendance(followed, BOB, Present, {}, limits));
    expect(withdrawQuestions(bobBack)).toEqual({ party: bobBack, released: [] });
  });

  it('drops who asked when a member who had completed comes back', () => {
    const followed = done(answerCompletion(aliceDone(), BOB, true));
    const back = done(setAttendance(followed, BOB, Present, {}, limits));
    expect(back.attendees[BOB]).toEqual({ number: 2, status: Present, group: 'A', remote: false });
  });
});

describe('releaseAsked', () => {
  it('makes those who are still asked present again and returns the same party otherwise', () => {
    const raid = withAttendees(testRaid(), {
      [ALICE]: { status: CompletePending, pendingUntil: PARTY_NOW + MINUTE, askedBy: BOB },
      [BOB]: { status: Complete },
      [CAROL]: { status: Coming },
    });
    const released = releaseAsked(raid, [ALICE, BOB, CAROL, '299999999999999999']);
    expect(released.released).toEqual([ALICE]);
    expect(released.party.attendees[ALICE]).toEqual({
      number: 1,
      status: Present,
      group: 'A',
      remote: false,
    });
    expect(released.party.attendees[BOB]).toBe(raid.attendees[BOB]);
    expect(releaseAsked(released.party, [ALICE]).party).toBe(released.party);
  });
});

describe('servedQuestions', () => {
  const pending = { status: CompletePending, pendingUntil: PARTY_NOW + MINUTE };
  const asked = (questions: { id: string; members: string[] }[], attendees = {}): RaidParty => ({
    ...withAttendees(testRaid(), attendees),
    prompts: { completion: questions, warning: null },
  });

  it('is every question none of whose members is still asked', () => {
    const first = { id: '300000000000000001', members: [ALICE, BOB] };
    const second = { id: '300000000000000002', members: [CAROL] };
    const raid = asked([first, second], { [ALICE]: pending, [BOB]: { status: Complete } });
    expect(servedQuestions(raid)).toEqual([second]);
    expect(servedQuestions(asked([first, second]))).toEqual([first, second]);
  });

  it('takes a question without members as served only when nobody at all is asked', () => {
    const old = { id: '300000000000000001', members: [] };
    expect(servedQuestions(asked([old], { [CAROL]: pending }))).toEqual([]);
    expect(servedQuestions(asked([old], { [CAROL]: { status: Present } }))).toEqual([old]);
  });
});

describe('finishParty', () => {
  const hatched = withAttendees(testRaid({ boss: { key: 'yveltal' } }), {
    [ALICE]: { status: Present },
    [BOB]: { status: Present },
  });

  it('completes a raid for the member and asks the others who are present', () => {
    const change = finishParty(hatched, ALICE, PARTY_NOW, 5);
    expect(change).toMatchObject({ ok: true, asked: [BOB], wasComplete: false, left: false });
    expect(change).toEqual({ ...completeRaid(hatched, ALICE, PARTY_NOW, 5), left: false });
  });

  it('refuses while the raid is an egg, by its times or by how it was reported', () => {
    const egg = withAttendees(testRaid(), { [ALICE]: { status: Present } });
    expect(finishParty(egg, ALICE, PARTY_NOW, 5)).toEqual({ ok: false, reason: 'not-hatched' });
    const timed = setHatchTime(egg, PARTY_NOW + 10 * MINUTE, testRaidRules(), PARTY_NOW);
    expect(finishParty(timed, ALICE, PARTY_NOW + 9 * MINUTE, 5)).toEqual({
      ok: false,
      reason: 'not-hatched',
    });
    expect(finishParty(timed, ALICE, PARTY_NOW + 10 * MINUTE, 5).ok).toBe(true);
  });

  it('takes the member off a meetup: done means leave, and nobody is asked', () => {
    const meetup = withAttendees(testMeetup(), {
      [ALICE]: { status: Present },
      [BOB]: { status: Present },
    });
    const change = finishParty(meetup, ALICE, PARTY_NOW, 5);
    expect(change).toMatchObject({ ok: true, asked: [], wasComplete: false, left: true });
    expect(change.ok && Object.keys(change.party.attendees)).toEqual([REPORTER, BOB]);
    expect(change.ok && change.party.attendees[BOB]).toBe(meetup.attendees[BOB]);
    expect(change).toEqual({
      ...leaveParty(meetup, ALICE),
      asked: [],
      wasComplete: false,
      left: true,
    });
  });

  it('is only for somebody who is signed up, in either kind', () => {
    const refusal = { ok: false, reason: 'not-attending' };
    expect(finishParty(hatched, CAROL, PARTY_NOW, 5)).toEqual(refusal);
    expect(finishParty(testMeetup(), CAROL, PARTY_NOW, 5)).toEqual(refusal);
  });
});

describe('a meetup, which has one group for good', () => {
  const meetup = withAttendees(testMeetup(), { [ALICE]: {} });
  const noGroups = { ok: false, reason: 'no-groups' };

  it('opens no second group', () => {
    expect(createGroup(meetup, ALICE, limits)).toEqual(noGroups);
  });

  it('has no group to move to, not even its own', () => {
    expect(joinGroup(meetup, ALICE, 'B', limits)).toEqual(noGroups);
    expect(joinGroup(meetup, ALICE, 'A', limits)).toEqual(noGroups);
    expect(joinGroup(meetup, CAROL, 'A', limits)).toEqual(noGroups);
  });

  it('takes no label', () => {
    expect(labelGroup(meetup, ALICE, 'park side')).toEqual(noGroups);
  });

  it('takes no meeting time of a group: it starts for everybody at once', () => {
    const partyWide = { ok: false, reason: 'party-wide-start' };
    expect(setMeetingTime(meetup, ALICE, PARTY_NOW + MINUTE)).toEqual(partyWide);
    expect(setMeetingTime(meetup, ALICE, null)).toEqual(partyWide);
    expect(setMeetingTime(meetup, CAROL, null)).toEqual(partyWide);
  });

  it('still signs members up, with a head count, in group A', () => {
    const joined = setAttendance(meetup, BOB, Coming, { number: 3, group: 'A' }, limits);
    expect(joined.ok && joined.party.attendees[BOB]).toEqual({
      number: 3,
      status: Coming,
      group: 'A',
      remote: false,
    });
    expect(setAttendance(meetup, BOB, Coming, { group: 'B' }, limits)).toEqual({
      ok: false,
      reason: 'no-such-group',
    });
    expect(headCount(joined.ok ? joined.party : meetup)).toBe(5);
  });
});
