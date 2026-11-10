import { describe, expect, it } from 'vitest';
import {
  at,
  PARTY_NOW,
  PARTY_ZONE,
  testMax,
  testMeetup,
  testRaid,
  testRaidRules,
  testTrain,
} from '../../../test/support/parties.js';
import { isToday, partyStart } from './board-day.js';
import type { MeetupParty } from './party.js';
import { setHatchTime } from './raid.js';

const HOUR = 60 * 60_000;

/** A meetup with these times. */
function meetupAt(times: { start?: number; end?: number }): MeetupParty {
  const made = testMeetup();
  return {
    ...made,
    endTime: times.end ?? null,
    timed: { ...made.timed, startTime: times.start ?? null },
  };
}

describe('partyStart and isToday (plan 8R-9, B8)', () => {
  const rules = testRaidRules();

  it('starts a train or meetup at its start, a raid at its hatch, a max battle never', () => {
    const meetup = meetupAt({ start: PARTY_NOW + HOUR });
    expect(partyStart(meetup)).toBe(PARTY_NOW + HOUR);
    const egg = setHatchTime(testRaid(), PARTY_NOW + HOUR, rules, PARTY_NOW);
    expect(partyStart(egg)).toBe(PARTY_NOW + HOUR);
    expect(partyStart(testMax())).toBeNull();
    expect(partyStart(testTrain())).toBe(testTrain().timed.startTime);
  });

  it('is today when it started, starts before midnight, or has no time; coming up after', () => {
    const tonight = meetupAt({ start: at('2026-10-13T23:30') });
    const tomorrow = meetupAt({ start: at('2026-10-14T00:00') });
    const started = meetupAt({ start: PARTY_NOW - 3 * HOUR, end: PARTY_NOW + HOUR });
    const untimed = meetupAt({});
    expect(isToday(tonight, PARTY_NOW, PARTY_ZONE)).toBe(true);
    expect(isToday(tomorrow, PARTY_NOW, PARTY_ZONE)).toBe(false);
    expect(isToday(started, PARTY_NOW, PARTY_ZONE)).toBe(true);
    expect(isToday(untimed, PARTY_NOW, PARTY_ZONE)).toBe(true);
    // An elite raid's egg days ahead is coming up too; a max battle is always today.
    const elite = setHatchTime(testRaid(), at('2026-10-15T11:00'), rules, PARTY_NOW);
    expect(isToday(elite, PARTY_NOW, PARTY_ZONE)).toBe(false);
    expect(isToday(testMax(), PARTY_NOW, PARTY_ZONE)).toBe(true);
  });
});
