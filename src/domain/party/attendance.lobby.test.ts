import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  CAROL,
  REPORTER,
  testMeetup,
  testRaid,
  withAttendees,
} from '../../../test/support/parties.js';
import {
  applyAutoStatus,
  attendanceLimits,
  changeNumber,
  chooseGroup,
  joinGroup,
  joinInto,
  setAttendance,
  setRemote,
} from './attendance.js';
import { lobbyCount, type Change, type GroupId, type RaidParty } from './party.js';
import { PartyStatus } from './status.js';

const { Interested, Coming, Present, CompletePending, Complete } = PartyStatus;
const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });
/** The limits of a party whose groups hold four trainers each, as a Dynamax battle's. */
const lobby4 = { ...limits, lobbySize: 4 };

const DAVE = '200000000000000005';
const ERIN = '200000000000000006';
const FRANK = '200000000000000007';

function done<Extra>(change: Change<RaidParty, Extra>): RaidParty {
  if (!change.ok) throw new Error(`refused: ${change.reason}`);
  return change.party;
}

/** The test raid with these groups, the last the default one, as members would have opened them. */
function withGroups(ids: readonly GroupId[], party: RaidParty = testRaid()): RaidParty {
  const last = ids.at(-1) ?? 'A';
  return { ...party, groups: ids.map((id) => ({ id })), defaultGroupId: last };
}

describe('chooseGroup', () => {
  it('takes the default group while the member and their +1s fit in it', () => {
    const party = withAttendees(withGroups(['A', 'B']), {
      [ALICE]: { group: 'B', number: 2 },
    });
    const chosen = chooseGroup(party, BOB, 2, 4);
    expect(chosen.group).toBe('B');
    expect(chosen.party).toBe(party);
  });

  it('takes the first group by letter with room when the default group has none', () => {
    const party = withAttendees(withGroups(['A', 'B', 'C']), {
      [ALICE]: { group: 'C', number: 4 },
      [BOB]: { group: 'A', number: 3 },
    });
    expect(chooseGroup(party, CAROL, 1, 4).group).toBe('A');
    expect(chooseGroup(party, CAROL, 2, 4).group).toBe('B');
  });

  it('counts only who is committed: the interested and the done take no place', () => {
    const party = withAttendees(withGroups(['A']), {
      [ALICE]: { status: Interested, number: 3 },
      [BOB]: { status: Complete, number: 3 },
      [CAROL]: { status: CompletePending, pendingUntil: 1, number: 1 },
    });
    expect(chooseGroup(party, DAVE, 3, 4).group).toBe('A');
  });

  it('does not count the member against their own group', () => {
    const party = withAttendees(withGroups(['A', 'B']), {
      [ALICE]: { group: 'B', number: 2 },
      [BOB]: { group: 'B', number: 2 },
    });
    expect(chooseGroup(party, ALICE, 2, 4).group).toBe('B');
  });

  it('opens the next group silently when none has room, and makes it the default', () => {
    const party = withAttendees(withGroups(['A', 'B']), {
      [ALICE]: { group: 'A', number: 4 },
      [BOB]: { group: 'B', number: 3 },
    });
    const chosen = chooseGroup(party, CAROL, 2, 4);
    expect(chosen.group).toBe('C');
    expect(chosen.party.groups.map((group) => group.id)).toEqual(['A', 'B', 'C']);
    expect(chosen.party.defaultGroupId).toBe('C');
    expect(chosen.party.attendees).toBe(party.attendees);
  });

  it('puts them over the size in the group with the most room once five groups are full', () => {
    const party = withAttendees(withGroups(['A', 'B', 'C', 'D', 'E']), {
      [ALICE]: { group: 'A', number: 4 },
      [BOB]: { group: 'B', number: 3 },
      [CAROL]: { group: 'C', number: 4 },
      [DAVE]: { group: 'D', number: 3 },
      [ERIN]: { group: 'E', number: 4 },
    });
    const chosen = chooseGroup(party, FRANK, 2, 4);
    expect(chosen.group).toBe('B');
    expect(chosen.party).toBe(party);
  });

  it('never opens a group for a member who alone is larger than a lobby: the most room', () => {
    const party = withAttendees(withGroups(['A', 'B']), {
      [BOB]: { group: 'A', number: 2 },
      [CAROL]: { group: 'B', number: 1 },
    });
    const chosen = chooseGroup(party, ALICE, 5, 4);
    expect(chosen.group).toBe('B');
    expect(chosen.party).toBe(party);
    // The first by letter on a tie, a group nobody is in included.
    const empty = withGroups(['A']);
    expect(chooseGroup(empty, ALICE, 5, 4)).toEqual({ party: empty, group: 'A' });
    const tied = withAttendees(withGroups(['A', 'B', 'C']), {
      [BOB]: { group: 'A', number: 2 },
      [CAROL]: { group: 'C', number: 1 },
      [DAVE]: { group: 'B', number: 1 },
    });
    expect(chooseGroup(tied, ALICE, 5, 4).group).toBe('B');
  });

  it('keeps a party without groups (a meetup) in its one group, however full', () => {
    const meetup = withAttendees(testMeetup(), { [BOB]: { number: 4 } });
    expect(chooseGroup(meetup, ALICE, 1, 4)).toEqual({ party: meetup, group: 'A' });
    const joined = setAttendance(meetup, ALICE, Coming, {}, lobby4);
    if (!joined.ok) throw new Error(joined.reason);
    expect(joined.party.groups).toBe(meetup.groups);
    expect(joined.party.attendees[ALICE]?.group).toBe('A');
  });
});

describe('Join choosing the group where there is a lobby size', () => {
  it('places a new member by their heads, also one who is only interested', () => {
    const party = withAttendees(withGroups(['A', 'B']), {
      [ALICE]: { group: 'B', number: 3 },
    });
    const coming = done(setAttendance(party, BOB, Coming, { number: 2 }, lobby4));
    expect(coming.attendees[BOB]).toMatchObject({ group: 'A', number: 2, status: Coming });
    const interested = done(setAttendance(party, BOB, Interested, { number: 2 }, lobby4));
    expect(interested.attendees[BOB]).toMatchObject({ group: 'A', status: Interested });
  });

  it('opens a group silently for a new member when none has room', () => {
    const party = withAttendees(testRaid(), { [ALICE]: { number: 4 } });
    const change = setAttendance(party, BOB, Present, {}, lobby4);
    expect(change).toMatchObject({ ok: true, joined: true });
    const placed = done(change);
    expect(placed.groups.map((group) => group.id)).toEqual(['A', 'B']);
    expect(placed.defaultGroupId).toBe('B');
    expect(placed.attendees[BOB]?.group).toBe('B');
  });

  it('puts a member who names a group there, over the size if so', () => {
    const party = withAttendees(withGroups(['A', 'B']), {
      [ALICE]: { group: 'A', number: 4 },
    });
    const named = done(setAttendance(party, BOB, Coming, { group: 'A' }, lobby4));
    expect(named.attendees[BOB]?.group).toBe('A');
    expect(lobbyCount(named, 'A')).toBe(5);
    expect(done(joinGroup(party, BOB, 'A', lobby4)).attendees[BOB]?.group).toBe('A');
    expect(done(joinInto(party, BOB, 'A', lobby4)).attendees[BOB]?.group).toBe('A');
    const interested = withAttendees(party, { [CAROL]: { group: 'B', status: Interested } });
    expect(done(joinInto(interested, CAROL, 'A', lobby4)).attendees[CAROL]).toMatchObject({
      group: 'A',
      status: Coming,
    });
  });

  it('keeps an interested member in their group when they come and it has room', () => {
    const party = withAttendees(withGroups(['A', 'B']), {
      [ALICE]: { group: 'A', number: 2 },
      [BOB]: { group: 'A', status: Interested, number: 2 },
    });
    const coming = done(setAttendance(party, BOB, Coming, {}, lobby4));
    expect(coming.attendees[BOB]).toMatchObject({ group: 'A', status: Coming });
  });

  it('places an interested member anew when they come and their group has no room for them', () => {
    const party = withAttendees(withGroups(['A', 'B']), {
      [ALICE]: { group: 'A', number: 3 },
      [BOB]: { group: 'A', status: Interested, number: 2 },
    });
    expect(done(setAttendance(party, BOB, Present, {}, lobby4)).attendees[BOB]?.group).toBe('B');
    // Their new count is what is placed.
    const more = done(setAttendance(party, BOB, Coming, { number: 1 }, lobby4));
    expect(more.attendees[BOB]).toMatchObject({ group: 'A', number: 1 });
    // Interested they stay where they are.
    const still = setAttendance(party, BOB, Interested, { number: 4 }, lobby4);
    expect(done(still).attendees[BOB]?.group).toBe('A');
  });

  it('never moves a member who is coming, here or done, whatever their count does', () => {
    const party = withAttendees(withGroups(['A', 'B']), {
      [ALICE]: { group: 'A', number: 3 },
      [BOB]: { group: 'A', number: 1 },
      [CAROL]: { group: 'A', status: Complete },
    });
    const more = done(setAttendance(party, BOB, Present, { number: 3 }, lobby4));
    expect(more.attendees[BOB]).toMatchObject({ group: 'A', number: 3 });
    expect(lobbyCount(more, 'A')).toBe(6);
    let counted = party;
    for (let i = 0; i < 3; i++) counted = done(changeNumber(counted, BOB, 1, lobby4));
    expect(counted.attendees[BOB]).toMatchObject({ group: 'A', number: 4 });
    expect(done(setRemote(party, BOB, true, { number: 3 }, lobby4)).attendees[BOB]?.group).toBe(
      'A',
    );
    expect(done(setAttendance(party, CAROL, Coming, {}, lobby4)).attendees[CAROL]?.group).toBe('A');
  });

  it('places somebody whom +1 or Remote signs up, as any new member', () => {
    const party = withAttendees(withGroups(['A', 'B']), {
      [ALICE]: { group: 'B', number: 4 },
    });
    expect(done(changeNumber(party, BOB, 1, lobby4)).attendees[BOB]?.group).toBe('A');
    expect(done(setRemote(party, BOB, true, {}, lobby4)).attendees[BOB]?.group).toBe('A');
  });

  it('places a reporter whose automatic status signs them up', () => {
    const party = withAttendees(testRaid(), { [ALICE]: { number: 4 } });
    const signedUp = applyAutoStatus(party, BOB, Coming, 4);
    expect(signedUp.joined).toBe(true);
    expect(signedUp.party.attendees[BOB]?.group).toBe('B');
    expect(signedUp.party.defaultGroupId).toBe('B');
    expect(applyAutoStatus(party, BOB, Coming).party.attendees[BOB]?.group).toBe('A');
  });

  it('changes nothing without a size: the default group, however full', () => {
    const party = withAttendees(withGroups(['A', 'B']), {
      [ALICE]: { group: 'B', number: 20 },
      [REPORTER]: { group: 'B', status: Interested },
    });
    expect(done(setAttendance(party, BOB, Coming, {}, limits)).attendees[BOB]?.group).toBe('B');
    expect(done(setAttendance(party, REPORTER, Coming, {}, limits)).groups).toBe(party.groups);
  });
});
