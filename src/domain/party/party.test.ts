import { describe, expect, it } from 'vitest';
import { testMeetup, testRaid, testTrain, withAttendees } from '../../../test/support/parties.js';
import { hasGroups, headsByStatus, isBattle, isTimed, type Party } from './party.js';
import { PartyStatus } from './status.js';

/**
 * A party of a kind this build does not know, as a later kind comes (a max battle came so in plan
 * 8X-3): the guards must not take it for a timed party by elimination (design
 * `2026-10-20-max-battles-design.md`, 3.1, review 1).
 */
function ofAnotherKind(): Party {
  return { ...testRaid(), type: 'carnival' } as unknown as Party;
}

describe('headsByStatus (plan 19E)', () => {
  it('counts the heads of each status as a post lists them: one asked whether done is here', () => {
    const nobody = { ...testRaid(), attendees: {} };
    const raid = withAttendees(nobody, {
      ash: { status: PartyStatus.Interested, number: 2 },
      misty: { status: PartyStatus.Coming },
      brock: { status: PartyStatus.Present, number: 3 },
      gary: { status: PartyStatus.CompletePending },
      oak: { status: PartyStatus.Complete },
    });
    expect(headsByStatus(raid)).toEqual({ interested: 2, coming: 1, present: 4, complete: 1 });
    expect(headsByStatus(nobody)).toEqual({
      interested: 0,
      coming: 0,
      present: 0,
      complete: 0,
    });
  });
});

describe('the guards of the kinds of party', () => {
  it('names the timed kinds outright: a meetup and a train, no other kind', () => {
    expect([testRaid(), testMeetup(), testTrain()].map(isTimed)).toEqual([false, true, true]);
    expect(isTimed(ofAnotherKind())).toBe(false);
  });

  it('calls a raid battled (Done completes it), a meetup and a train not', () => {
    expect([testRaid(), testMeetup(), testTrain()].map(isBattle)).toEqual([true, false, false]);
  });

  it('gives groups to every kind but a meetup', () => {
    expect([testRaid(), testMeetup(), testTrain()].map(hasGroups)).toEqual([true, false, true]);
  });
});
