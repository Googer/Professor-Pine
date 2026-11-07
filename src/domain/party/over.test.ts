import { describe, expect, it } from 'vitest';
import {
  at,
  MINUTE,
  PARTY_NOW,
  testMax,
  testMeetup,
  testRaid,
  testTrain,
} from '../../../test/support/parties.js';
import { overByClock } from './over.js';
import { raidStage } from './raid.js';

describe('overByClock', () => {
  it('is a raid whose stage by the clock is ended', () => {
    const raid = testRaid();
    const last = raid.lastPossibleTime ?? 0;
    expect(overByClock(raid, PARTY_NOW)).toBe(false);
    expect(overByClock(raid, last - MINUTE)).toBe(false);
    expect(overByClock(raid, last + MINUTE)).toBe(true);
    expect(raidStage(raid, last + MINUTE)).toBe('ended');
  });

  it('is a max battle whose end has come', () => {
    const max = testMax();
    expect(overByClock(max, at('2026-10-13T20:59'))).toBe(false);
    expect(overByClock(max, at('2026-10-13T21:00'))).toBe(true);
  });

  it('is a train or meetup whose end time has passed, and never one without an end', () => {
    const meetup = testMeetup();
    const day = at('2026-10-14T14:00');
    expect(overByClock(meetup, day)).toBe(false);
    const ending = { ...meetup, endTime: at('2026-10-13T18:00') };
    expect(overByClock(ending, at('2026-10-13T17:59'))).toBe(false);
    expect(overByClock(ending, at('2026-10-13T18:00'))).toBe(true);
    const train = { ...testTrain(), endTime: at('2026-10-13T18:00') };
    expect(overByClock(train, at('2026-10-13T18:00'))).toBe(true);
  });
});
