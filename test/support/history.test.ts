import { describe } from 'vitest';
import { MemoryHistory, MemoryHistoryOptIns } from './history.js';
import { leaderboardCases } from './leaderboard-cases.js';
import { raidsAlongCases } from './raids-along-cases.js';

describe('the opt-ins of the history in memory', () => {
  leaderboardCases(() => Promise.resolve(new MemoryHistoryOptIns()));
});

describe('the raids along a train’s way in memory (plan 8H-7A)', () => {
  raidsAlongCases(() => {
    const history = new MemoryHistory();
    return Promise.resolve({
      reader: history,
      add: (records) => {
        history.records.push(...records);
        return Promise.resolve();
      },
    });
  });
});
