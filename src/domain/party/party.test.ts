import { describe, expect, it } from 'vitest';
import { testMeetup, testRaid, testTrain } from '../../../test/support/parties.js';
import { hasGroups, isBattle, isTimed, type Party } from './party.js';

/**
 * A party of a kind this build does not know, as a later kind comes (a max battle came so in plan
 * 8X-3): the guards must not take it for a timed party by elimination (design
 * `2026-10-20-max-battles-design.md`, 3.1, review 1).
 */
function ofAnotherKind(): Party {
  return { ...testRaid(), type: 'carnival' } as unknown as Party;
}

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
