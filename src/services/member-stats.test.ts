import { describe, expect, it } from 'vitest';
import {
  ASH,
  BOARD_NOW,
  BOARD_SERVER,
  boardAttendee,
  boardRecord,
  BROCK,
  keptReport,
} from '../../test/support/board-cases.js';
import { MemoryBoards } from '../../test/support/boards.js';
import { MemoryHistoryOptIns } from '../../test/support/history.js';
import type { BoardReader } from '../db/repositories/board-repository.js';
import { MemberStatsService } from './member-stats.js';

const ZONE = 'America/New_York';

/**
 * A reader that tells how many of its reads were under way at once: each read of the bot's
 * holds a connection of the pool until its answer comes.
 */
function watched(reader: BoardReader) {
  const seen = { underWay: 0, most: 0, reads: [] as string[] };
  const watching = new Proxy(reader, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string') return value;
      return async (...asked: unknown[]) => {
        seen.reads.push(property);
        seen.underWay += 1;
        seen.most = Math.max(seen.most, seen.underWay);
        try {
          return (await Reflect.apply(value, target, asked)) as unknown;
        } finally {
          seen.underWay -= 1;
        }
      };
    },
  });
  return { reader: watching, seen };
}

/** Ash opted in, with a raid Brock completed, a train she led and a report that stood. */
async function setup() {
  const optIns = new MemoryHistoryOptIns();
  const boards = new MemoryBoards(optIns);
  await optIns.optIn(ASH, BOARD_SERVER, 1);
  boards.records.push(
    boardRecord(),
    boardRecord({
      kind: 'train',
      createdAt: BOARD_NOW + 1,
      attendees: [boardAttendee(ASH, 'done', { conducted: 2 }), boardAttendee(BROCK, 'here')],
    }),
  );
  boards.reports.push(keptReport({ confirmations: 2 }));
  const { reader, seen } = watched(boards);
  const stats = new MemberStatsService({ reader, optIns, zone: ZONE });
  return { stats, seen, boards };
}

describe('a member’s own stats, read', () => {
  it('reads a member’s rows one read at a time, never several connections for one question (plan 8Z-2)', async () => {
    const { stats, seen } = await setup();
    const shown = await stats.stats(BOARD_SERVER, ASH);
    expect(shown).toMatchObject({
      optedIn: true,
      stats: { raids: { count: 1 }, trains: { count: 1 }, reports: { count: 1 } },
    });
    // The eight reads of `/stats me`, each begun once the one before answered.
    expect([...seen.reads].sort()).toEqual([
      'meetupCredits',
      'memberParties',
      'memberReports',
      'raidCredits',
      'reportCredits',
      'reportScores',
      'splitLinks',
      'trainCredits',
    ]);
    expect(seen.most).toBe(1);
  });

  it('reads the years the same way, and nothing for a member who did not opt in', async () => {
    const { stats, seen } = await setup();
    expect(await stats.years(BOARD_SERVER, ASH)).toEqual([2026]);
    expect(seen.reads).toHaveLength(8);
    expect(seen.most).toBe(1);
    expect(await stats.stats(BOARD_SERVER, BROCK)).toEqual({ optedIn: false });
    expect(await stats.years(BOARD_SERVER, BROCK)).toEqual([]);
    expect(seen.reads).toHaveLength(8);
  });

  it('answers with the failure of the read that failed, the reads after it not begun', async () => {
    const { stats, seen, boards } = await setup();
    boards.failing = new Error('no database');
    await expect(stats.stats(BOARD_SERVER, ASH)).rejects.toThrow('no database');
    expect(seen.reads).toHaveLength(1);
    expect(seen.underWay).toBe(0);
  });
});
