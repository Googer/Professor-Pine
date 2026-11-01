import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  CAROL,
  PARTY_NOW,
  REPORTER,
  testMeetup,
  testRaid,
  testTrain,
  withAttendees,
} from '../../../test/support/parties.js';
import {
  attendanceLimits,
  chooseGroup,
  createGroup,
  leaveParty,
  pruneGroups,
} from './attendance.js';
import {
  groupOpened,
  groupStamp,
  stampedGroup,
  type Change,
  type GroupId,
  type PartyGroup,
  type RaidParty,
} from './party.js';
import { PartyStatus } from './status.js';

const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });
const LATER = PARTY_NOW + 60_000;

function done<P, Extra>(change: Change<P, Extra>): P {
  if (!change.ok) throw new Error(`refused: ${change.reason}`);
  return change.party;
}

/** The test raid without its reporter, with these groups, the last the default one. */
function raidWith(groups: readonly PartyGroup[], defaultGroupId?: GroupId): RaidParty {
  const party = testRaid();
  return {
    ...party,
    attendees: {},
    groups,
    defaultGroupId: defaultGroupId ?? groups.at(-1)?.id ?? 'A',
  };
}

describe('the stamp of a group', () => {
  it('of the first group of a new party is when the party was made', () => {
    for (const party of [testRaid(), testMeetup(), testTrain()]) {
      const [first] = party.groups;
      expect(first && groupOpened(party, first)).toBe(PARTY_NOW);
    }
  });

  it('is set on a group a member opens, and on one Join opens where a lobby is full', () => {
    const opened = done(createGroup(testRaid(), ALICE, { ...limits, now: LATER }));
    expect(opened.groups.at(-1)).toEqual({ id: 'B', opened: LATER });
    const full = withAttendees(testRaid(), { [ALICE]: { number: 4 } });
    const chosen = chooseGroup(full, BOB, 1, 4, LATER);
    expect(chosen.party.groups.at(-1)).toEqual({ id: 'B', opened: LATER });
  });

  it('stamps each group after the party’s last write and every group it has, within one millisecond too', () => {
    // The clock has not moved since the party's last write (PARTY_NOW).
    const b = done(createGroup(testRaid(), ALICE, { ...limits, now: PARTY_NOW }));
    expect(b.groups.at(-1)).toEqual({ id: 'B', opened: PARTY_NOW + 1 });
    const c = done(createGroup(b, BOB, { ...limits, now: PARTY_NOW }));
    expect(c.groups.at(-1)).toEqual({ id: 'C', opened: PARTY_NOW + 2 });
    // Without a time (a test), after the last write as well.
    expect(done(createGroup(testRaid(), ALICE, limits)).groups.at(-1)?.opened).toBe(PARTY_NOW + 1);
  });

  it('counts a group of an older document as opened with the party', () => {
    const party = raidWith([{ id: 'A' }, { id: 'B', opened: LATER }]);
    const [a, b] = party.groups;
    expect(a && groupOpened(party, a)).toBe(PARTY_NOW);
    expect(b && groupOpened(party, b)).toBe(LATER);
    expect(b && groupStamp(party, b)).toBe(LATER.toString(36));
  });

  it('names a group by its letter only while the letter is the same group', () => {
    const party = raidWith([{ id: 'A' }, { id: 'B', opened: LATER }]);
    expect(stampedGroup(party, 'B', LATER.toString(36))).toEqual({ id: 'B', opened: LATER });
    expect(stampedGroup(party, 'B', PARTY_NOW.toString(36))).toBeUndefined();
    expect(stampedGroup(party, 'C', LATER.toString(36))).toBeUndefined();
  });
});

describe('pruneGroups', () => {
  it('drops a group nobody is in, and keeps the letters of the others', () => {
    const party = withAttendees(raidWith([{ id: 'A' }, { id: 'B' }, { id: 'C' }], 'A'), {
      [ALICE]: { group: 'A' },
      [BOB]: { group: 'C' },
    });
    const pruned = pruneGroups(party);
    expect(pruned.groups.map((group) => group.id)).toEqual(['A', 'C']);
    expect(pruned.defaultGroupId).toBe('A');
    expect(pruned.attendees).toBe(party.attendees);
  });

  it('counts the interested and those who are done as being in a group', () => {
    const party = withAttendees(raidWith([{ id: 'A' }, { id: 'B' }, { id: 'C' }]), {
      [ALICE]: { group: 'A', status: PartyStatus.Interested },
      [BOB]: { group: 'B', status: PartyStatus.Complete },
      [CAROL]: { group: 'C' },
    });
    expect(pruneGroups(party)).toBe(party);
  });

  it('keeps an empty group with a label or a meeting time', () => {
    const party = withAttendees(
      raidWith([{ id: 'A' }, { id: 'B', label: 'by the bridge' }, { id: 'C', startTime: LATER }]),
      { [ALICE]: { group: 'A' } },
    );
    expect(pruneGroups(party)).toBe(party);
  });

  it('never drops the last group, and keeps the default one when all are empty', () => {
    const one = raidWith([{ id: 'A' }]);
    expect(pruneGroups(one)).toBe(one);
    const two = raidWith([{ id: 'A' }, { id: 'B' }], 'A');
    const pruned = pruneGroups(two);
    expect(pruned.groups).toEqual([{ id: 'A' }]);
    expect(pruned.defaultGroupId).toBe('A');
  });

  it('makes the newest group left the default one when the default group goes', () => {
    const party = withAttendees(
      raidWith(
        [
          { id: 'A', opened: PARTY_NOW },
          { id: 'C', opened: LATER + 2 },
          { id: 'B', opened: LATER + 1 },
          { id: 'D', opened: LATER + 3 },
        ],
        'D',
      ),
      { [ALICE]: { group: 'A' }, [BOB]: { group: 'C' }, [CAROL]: { group: 'B' } },
    );
    const pruned = pruneGroups(party);
    expect(pruned.groups.map((group) => group.id)).toEqual(['A', 'C', 'B']);
    expect(pruned.defaultGroupId).toBe('C');
  });

  it('puts a group Join opens with a reused letter in its place by letter (plan 8X-G)', () => {
    const party = withAttendees(
      raidWith([
        { id: 'C', opened: LATER },
        { id: 'E', opened: LATER + 1 },
      ]),
      {
        [ALICE]: { group: 'C' },
        [BOB]: { group: 'E' },
      },
    );
    const chosen = chooseGroup(party, CAROL, 1, 1, LATER + 2);
    expect(chosen.group).toBe('A');
    expect(chosen.party.groups.map((group) => group.id)).toEqual(['A', 'C', 'E']);
  });

  it('is the very same party when every group has somebody in it', () => {
    const party = testRaid();
    expect(pruneGroups(party)).toBe(party);
  });

  it('lets a later group take the letter of a pruned one, with a stamp of its own', () => {
    // B was opened at LATER and went when its last member left.
    const before = withAttendees(
      raidWith([{ id: 'A' }, { id: 'B', opened: LATER }, { id: 'E', opened: LATER + 1 }]),
      { [ALICE]: { group: 'A' }, [BOB]: { group: 'B' }, [CAROL]: { group: 'E' } },
    );
    const pruned = pruneGroups(done(leaveParty(before, BOB)));
    expect(pruned.groups.map((group) => group.id)).toEqual(['A', 'E']);
    // No letter after E: the first free one, B again, opened now.
    const again = done(createGroup(pruned, REPORTER, { ...limits, now: LATER + 5 }));
    // In its place by letter, not after E (plan 8X-G): the post and dialogs list A, B, E.
    expect(again.groups).toEqual([
      { id: 'A' },
      { id: 'B', opened: LATER + 5 },
      { id: 'E', opened: LATER + 1 },
    ]);
    expect(again.defaultGroupId).toBe('B');
    expect(stampedGroup(again, 'B', LATER.toString(36))).toBeUndefined();
  });
});
