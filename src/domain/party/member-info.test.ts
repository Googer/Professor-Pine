import { describe, expect, it } from 'vitest';
import { ALICE, BOB, REPORTER, testRaid, withAttendees } from '../../../test/support/parties.js';
import {
  attendanceLimits,
  changeNumber,
  completeRaid,
  joinGroup,
  noteMember,
  setAttendance,
  setNotHere,
  setRemote,
} from './attendance.js';
import { partyState } from './party-state.js';
import { attendeeOf, memberOf, type Change, type RaidParty } from './party.js';
import { PartyStatus } from './status.js';

const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });

function done<Extra>(change: Change<RaidParty, Extra>): RaidParty {
  if (!change.ok) throw new Error(`refused: ${change.reason}`);
  return change.party;
}

describe('noteMember', () => {
  it('records the name and the team of an attendee', () => {
    const raid = withAttendees(testRaid(), { [ALICE]: {} });
    const noted = noteMember(raid, ALICE, { name: 'Alice', team: 'mystic' });
    expect(attendeeOf(noted, ALICE)).toMatchObject({ name: 'Alice', team: 'mystic' });
    expect(attendeeOf(raid, ALICE)).not.toHaveProperty('name');
  });

  it('does nothing for somebody who is not signed up', () => {
    const raid = testRaid();
    expect(noteMember(raid, BOB, { name: 'Bob', team: 'valor' })).toBe(raid);
  });

  it('keeps the name of the member who made the party with the party, signed up or not', () => {
    const { [REPORTER]: _gone, ...others } = withAttendees(testRaid(), { [ALICE]: {} }).attendees;
    const raid: RaidParty = { ...testRaid(), attendees: others };
    expect(attendeeOf(raid, REPORTER)).toBeUndefined();
    const noted = noteMember(raid, REPORTER, { name: '  Rae \n the   Reporter ', team: 'valor' });
    expect(noted.makerName).toBe('Rae the Reporter');
    expect(noted.attendees).toBe(raid.attendees);
    // Nothing differs: the very same party. A later name replaces it; none or a blank one not.
    expect(noteMember(noted, REPORTER, { name: 'Rae the Reporter' })).toBe(noted);
    expect(noteMember(noted, REPORTER, {})).toBe(noted);
    expect(noteMember(noted, REPORTER, { name: '   ' })).toBe(noted);
    expect(noteMember(noted, REPORTER, { name: 'Rae' }).makerName).toBe('Rae');
    expect(noteMember(noted, REPORTER, { name: 'x'.repeat(40) }).makerName).toHaveLength(32);
    // Signed up, they have it in both places; nobody else's name is kept with the party.
    const signedUp = noteMember(testRaid(), REPORTER, { name: 'Rae' });
    expect(signedUp.makerName).toBe('Rae');
    expect(attendeeOf(signedUp, REPORTER)?.name).toBe('Rae');
    expect(noteMember(raid, ALICE, { name: 'Alice' }).makerName).toBeUndefined();
    expect(() => partyState(noted)).not.toThrow();
  });

  it('names a member by the attendee record, and the maker by the name kept with the party', () => {
    const raid = noteMember(withAttendees(testRaid(), { [ALICE]: {} }), ALICE, { name: 'Alice' });
    expect(memberOf(raid, ALICE)).toEqual({ id: ALICE, name: 'Alice' });
    expect(memberOf(raid, BOB)).toEqual({ id: BOB });
    expect(memberOf(raid, REPORTER)).toEqual({ id: REPORTER });
    const { [REPORTER]: _gone, ...others } = raid.attendees;
    const left: RaidParty = { ...raid, attendees: others, makerName: 'Rae' };
    expect(memberOf(left, REPORTER)).toEqual({ id: REPORTER, name: 'Rae' });
    // A name kept for the maker is nobody else's.
    expect(memberOf(left, BOB)).toEqual({ id: BOB });
    // The attendee record is the newer of the two for a maker who is signed up.
    const both = noteMember({ ...raid, makerName: 'Old' }, REPORTER, { name: 'Rae' });
    expect(memberOf(both, REPORTER)).toEqual({ id: REPORTER, name: 'Rae' });
  });

  it('returns the very same party when nothing differs', () => {
    const raid = noteMember(withAttendees(testRaid(), { [ALICE]: {} }), ALICE, {
      name: 'Alice',
      team: 'mystic',
    });
    expect(noteMember(raid, ALICE, { name: 'Alice', team: 'mystic' })).toBe(raid);
  });

  it('drops the team of a member who no longer has one, and keeps a name it is not told', () => {
    const raid = noteMember(withAttendees(testRaid(), { [ALICE]: {} }), ALICE, {
      name: 'Alice',
      team: 'mystic',
    });
    const later = noteMember(raid, ALICE, { name: 'Alice' });
    expect(attendeeOf(later, ALICE)).toMatchObject({ name: 'Alice' });
    expect(attendeeOf(later, ALICE)).not.toHaveProperty('team');
  });

  it('keeps what is recorded when the interaction did not show the member at all', () => {
    const raid = noteMember(withAttendees(testRaid(), { [ALICE]: {} }), ALICE, {
      name: 'Alice',
      team: 'mystic',
    });
    expect(noteMember(raid, ALICE, {})).toBe(raid);
  });

  it('tidies a name and cuts it to what is stored', () => {
    const raid = withAttendees(testRaid(), { [ALICE]: {} });
    const spaced = noteMember(raid, ALICE, { name: '  Alice \n the   Great ' });
    expect(attendeeOf(spaced, ALICE)?.name).toBe('Alice the Great');
    const long = noteMember(raid, ALICE, { name: '😀'.repeat(40) });
    expect([...(attendeeOf(long, ALICE)?.name ?? '')]).toHaveLength(32);
    // The longest name that is kept can be stored: the cut and the schema count the same way.
    expect(() => partyState(long)).not.toThrow();
    expect(() => partyState(noteMember(raid, ALICE, { name: 'x'.repeat(40) }))).not.toThrow();
    const blank = noteMember(spaced, ALICE, { name: '   ', team: 'valor' });
    expect(attendeeOf(blank, ALICE)).toMatchObject({ name: 'Alice the Great', team: 'valor' });
  });
});

describe('what is known of a member stays through every change', () => {
  const known = noteMember(
    withAttendees(testRaid({ boss: { key: 'yveltal' } }), {
      [ALICE]: { status: PartyStatus.Present },
    }),
    ALICE,
    { name: 'Alice', team: 'instinct' },
  );
  const changes: [string, (party: RaidParty) => RaidParty][] = [
    ['a new status', (p) => done(setAttendance(p, ALICE, PartyStatus.Coming, {}, limits))],
    ['remote', (p) => done(setRemote(p, ALICE, true, {}, limits))],
    ['one more', (p) => done(changeNumber(p, ALICE, 1, limits))],
    ['not here', (p) => done(setNotHere(p, ALICE))],
    ['done', (p) => done(completeRaid(p, ALICE, p.createdAt, 5))],
    [
      'another group',
      (p) =>
        done(joinGroup({ ...p, groups: [...p.groups, { id: 'B' as const }] }, ALICE, 'B', limits)),
    ],
  ];
  it.each(changes)('%s', (_name, change) => {
    const after = change(known);
    expect(after).not.toBe(known);
    expect(attendeeOf(after, ALICE)).toMatchObject({ name: 'Alice', team: 'instinct' });
  });
});
