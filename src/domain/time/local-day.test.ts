import { describe, expect, it } from 'vitest';
import { dayBefore, localDay, localDayStart, nextLocalMidnight } from './local-day.js';
import { zonedAt } from '../../../test/support/time.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);

describe('localDay', () => {
  it('is the local date of a moment in the zone, yyyy-mm-dd', () => {
    expect(localDay(at('2026-11-21T00:00'), ZONE)).toBe('2026-11-21');
    expect(localDay(at('2026-11-21T23:59:59.999'), ZONE)).toBe('2026-11-21');
    // 03:30 UTC on the 22nd is still the 21st in Pittsburgh.
    expect(localDay(Date.UTC(2026, 10, 22, 3, 30), ZONE)).toBe('2026-11-21');
    expect(localDay(Date.UTC(2026, 10, 22, 3, 30), 'UTC')).toBe('2026-11-22');
  });
});

describe('localDayStart', () => {
  it('is the local midnight that began the day, at midnight itself that moment', () => {
    expect(localDayStart(at('2026-11-21T10:00'), ZONE)).toBe(at('2026-11-21T00:00'));
    expect(localDayStart(at('2026-11-21T00:00'), ZONE)).toBe(at('2026-11-21T00:00'));
    expect(localDayStart(Date.UTC(2026, 10, 22, 3, 30), ZONE)).toBe(at('2026-11-21T00:00'));
    // The day after the clocks went back began 25 hours after the one before.
    expect(localDayStart(at('2026-11-02T10:00'), ZONE)).toBe(
      nextLocalMidnight(at('2026-11-01T10:00'), ZONE),
    );
  });
});

describe('nextLocalMidnight', () => {
  it('is the next local midnight, at midnight itself the one after it', () => {
    expect(nextLocalMidnight(at('2026-11-21T10:00'), ZONE)).toBe(at('2026-11-22T00:00'));
    expect(nextLocalMidnight(at('2026-11-21T00:00'), ZONE)).toBe(at('2026-11-22T00:00'));
  });

  it('follows a change of the clocks: a day of 25 hours and one of 23', () => {
    // 2026-11-01: clocks go back an hour in the United States.
    const fallBack = at('2026-11-01T00:00');
    expect(nextLocalMidnight(fallBack, ZONE) - fallBack).toBe(25 * 3_600_000);
    // 2026-03-08: clocks go forward.
    const springForward = at('2026-03-08T00:00');
    expect(nextLocalMidnight(springForward, ZONE) - springForward).toBe(23 * 3_600_000);
  });

  // Final review R3-2: where the clocks go forward at midnight, that day begins at 01:00, and the
  // next one at 00:00 again.
  it('is midnight after a day that began at 01:00 (Santiago, 2026-09-06)', () => {
    const SANTIAGO = 'America/Santiago';
    const dayStart = zonedAt('2026-09-06T01:00', SANTIAGO);
    expect(localDayStart(zonedAt('2026-09-06T10:00', SANTIAGO), SANTIAGO)).toBe(dayStart);
    expect(nextLocalMidnight(zonedAt('2026-09-05T10:00', SANTIAGO), SANTIAGO)).toBe(dayStart);
    expect(nextLocalMidnight(zonedAt('2026-09-06T10:00', SANTIAGO), SANTIAGO)).toBe(
      zonedAt('2026-09-07T00:00', SANTIAGO),
    );
    expect(nextLocalMidnight(dayStart, SANTIAGO)).toBe(zonedAt('2026-09-07T00:00', SANTIAGO));
  });
});

describe('dayBefore', () => {
  it('is the local day that ended before the day of a moment (plan 8H-3: the want counts)', () => {
    expect(dayBefore(at('2026-11-21T00:00:01'), ZONE)).toBe('2026-11-20');
    expect(dayBefore(at('2026-11-21T23:59'), ZONE)).toBe('2026-11-20');
    expect(dayBefore(at('2027-01-01T00:00:01'), ZONE)).toBe('2026-12-31');
    // The day of 25 hours, and the one of 23.
    expect(dayBefore(at('2026-11-02T00:00:01'), ZONE)).toBe('2026-11-01');
    expect(dayBefore(at('2026-03-09T00:00:01'), ZONE)).toBe('2026-03-08');
  });
});
