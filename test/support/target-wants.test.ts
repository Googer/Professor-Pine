import { describe } from 'vitest';
import { targetWantCases } from './target-want-cases.js';
import { MemoryTargetWants } from './target-wants.js';

describe('MemoryTargetWants', () => {
  targetWantCases(() => Promise.resolve(new MemoryTargetWants()));
});
