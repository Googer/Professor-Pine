import { describe, expect, it } from 'vitest';
import { zonedAt } from '../../../test/support/time.js';
import { startsFromAgrees } from './raid-boss-repository.js';

const ZONE = 'America/New_York';

describe('startsFromAgrees: the read rule of an upcoming max boss’s start (fix round 1, L8)', () => {
  // Uxie from 17:00 on the 24th in New York.
  const start = zonedAt('2026-10-24T17:00', ZONE);

  it('keeps a start whose day began when the boss was first a boss, or that was read that day', () => {
    expect(startsFromAgrees(start, zonedAt('2026-10-24T00:00', ZONE), ZONE)).toBe(true);
    expect(startsFromAgrees(start, zonedAt('2026-10-24T09:30', ZONE), ZONE)).toBe(true);
  });

  it('leaves out one a write of 2.0 left behind when it moved the boss', () => {
    expect(startsFromAgrees(start, zonedAt('2026-10-25T00:00', ZONE), ZONE)).toBe(false);
    expect(startsFromAgrees(start, zonedAt('2026-10-23T00:00', ZONE), ZONE)).toBe(false);
  });
});
