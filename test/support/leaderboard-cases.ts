import { expect, it } from 'vitest';
import type { HistoryOptIns } from '../../src/db/repositories/history-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const NOW = 1_800_000_000_000;

/**
 * What the switch of the boards does (`/settings leaderboard`, plan 8H-6), run against
 * `HistoryRepository` and its twin `MemoryHistoryOptIns` alike. `made` gives fresh opt-ins.
 */
export function leaderboardCases(made: () => Promise<HistoryOptIns>): void {
  it('puts nobody on the boards until they switch it on, per server', async () => {
    const optIns = await made();
    expect(await optIns.isOnBoards(ALICE, HOME)).toBe(false);
    expect(await optIns.joinBoards(ALICE, HOME, NOW)).toEqual({ joined: true, historyOn: true });
    expect(await optIns.isOnBoards(ALICE, HOME)).toBe(true);
    expect(await optIns.isOnBoards(ALICE, AWAY)).toBe(false);
    expect(await optIns.isOnBoards(BOB, HOME)).toBe(false);
  });

  it('turns the history opt-in on with it where it was off, and says so', async () => {
    const optIns = await made();
    expect(await optIns.isOptedIn(ALICE, HOME)).toBe(false);
    expect((await optIns.joinBoards(ALICE, HOME, NOW)).historyOn).toBe(true);
    expect(await optIns.isOptedIn(ALICE, HOME)).toBe(true);
    await optIns.optIn(BOB, HOME, NOW);
    expect(await optIns.joinBoards(BOB, HOME, NOW)).toEqual({ joined: true, historyOn: false });
    // Again: nothing changes.
    expect(await optIns.joinBoards(BOB, HOME, NOW + 1)).toEqual({
      joined: false,
      historyOn: false,
    });
  });

  it('takes a member off the boards and leaves the history opt-in as it is', async () => {
    const optIns = await made();
    await optIns.joinBoards(ALICE, HOME, NOW);
    expect(await optIns.leaveBoards(ALICE, HOME)).toBe(true);
    expect(await optIns.isOnBoards(ALICE, HOME)).toBe(false);
    expect(await optIns.isOptedIn(ALICE, HOME)).toBe(true);
    expect(await optIns.leaveBoards(ALICE, HOME)).toBe(false);
  });

  it('takes a member off the boards when they opt out of the history, and says so', async () => {
    const optIns = await made();
    await optIns.joinBoards(ALICE, HOME, NOW);
    await optIns.joinBoards(ALICE, AWAY, NOW);
    expect((await optIns.optOut(ALICE, HOME)).leftBoards).toBe(true);
    expect(await optIns.isOnBoards(ALICE, HOME)).toBe(false);
    expect(await optIns.isOnBoards(ALICE, AWAY)).toBe(true);
    // Opted in again, they are not on the boards again by themself.
    await optIns.optIn(ALICE, HOME, NOW);
    expect(await optIns.isOnBoards(ALICE, HOME)).toBe(false);
    expect((await optIns.optOut(ALICE, HOME)).leftBoards).toBe(false);
  });
}
