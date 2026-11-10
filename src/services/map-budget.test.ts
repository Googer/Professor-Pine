import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { MemoryGoogleUse, type GoogleUse } from './google-use.js';
import { MapBudget } from './map-budget.js';

/** Noon on October 31 in California, and an hour after midnight on November 1. */
const OCTOBER = new Date('2026-10-31T12:00:00-07:00').getTime();
const NOVEMBER = new Date('2026-11-01T01:00:00-07:00').getTime();

function budgetOf(perMonth: number, use: GoogleUse = new MemoryGoogleUse()) {
  const { log, entries } = createTestLogger();
  const clock = { now: OCTOBER };
  const budget = new MapBudget({ use, perMonth, log, now: () => clock.now });
  return { budget, use, entries, clock };
}

describe('MapBudget (plan 8Z-2)', () => {
  it('counts each map taken on its Pacific day, and says how many the month has used', async () => {
    const { budget, use } = budgetOf(5);
    expect(await budget.used()).toBe(0);
    expect(await budget.spend()).toBe(true);
    expect(await budget.spend()).toBe(true);
    expect(await use.usedOn(['2026-10-31'])).toEqual(
      new Map([['2026-10-31', { places: 0, geocodes: 0, byHand: 0, maps: 2 }]]),
    );
    expect(await budget.used()).toBe(2);
  });

  it('gives as many as the month has, those asked for at once too, then none, said once', async () => {
    const { budget, entries, clock } = budgetOf(3);
    const taken = await Promise.all(Array.from({ length: 5 }, () => budget.spend()));
    expect(taken).toEqual([true, true, true, false, false]);
    expect(await budget.spend()).toBe(false);
    expect(await budget.used()).toBe(3);
    expect(entries).toEqual([
      expect.objectContaining({
        level: 40,
        msg: 'this month’s maps of places are used: /find-region answers without a map until the month starts again',
        maps: 3,
        perMonth: 3,
      }),
    ]);
    // A new month has its own.
    clock.now = NOVEMBER;
    expect(await budget.spend()).toBe(true);
    expect(await budget.used()).toBe(1);
  });

  it('gives none where the month has none', async () => {
    const { budget } = budgetOf(0);
    expect(await budget.spend()).toBe(false);
  });

  it('gives none while the count cannot be read or written, and says so', async () => {
    const broken: GoogleUse = {
      use: () => Promise.reject(new Error('the database is away')),
      usedOn: () => Promise.resolve(new Map()),
    };
    const unwritten = budgetOf(5, broken);
    expect(await unwritten.budget.spend()).toBe(false);
    expect(unwritten.entries).toEqual([
      expect.objectContaining({ level: 40, msg: 'could not count a map of a place: none is made' }),
    ]);
    // The count read again once it can be: the next map is taken.
    let away = true;
    const memory = new MemoryGoogleUse();
    const unread = budgetOf(5, {
      use: (day, counted) => memory.use(day, counted),
      usedOn: (days) => (away ? Promise.reject(new Error('away')) : memory.usedOn(days)),
    });
    expect(await unread.budget.spend()).toBe(false);
    expect(await unread.budget.used()).toBeUndefined();
    away = false;
    expect(await unread.budget.spend()).toBe(true);
    expect(await unread.budget.used()).toBe(1);
  });
});
