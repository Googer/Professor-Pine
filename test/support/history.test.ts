import { describe } from 'vitest';
import { MemoryHistoryOptIns } from './history.js';
import { leaderboardCases } from './leaderboard-cases.js';

describe('the opt-ins of the history in memory', () => {
  leaderboardCases(() => Promise.resolve(new MemoryHistoryOptIns()));
});
