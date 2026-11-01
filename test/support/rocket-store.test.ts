import { describe } from 'vitest';
import { gruntMessageCases, rocketLineupCases } from './rocket-store-cases.js';
import { MemoryGruntMessages, MemoryRocketLineups } from './rocket-store.js';

describe('MemoryGruntMessages', () => {
  gruntMessageCases(() => Promise.resolve(new MemoryGruntMessages()));
});

describe('MemoryRocketLineups', () => {
  rocketLineupCases(() => Promise.resolve(new MemoryRocketLineups()));
});
