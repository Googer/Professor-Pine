import { describe } from 'vitest';
import { wantBoxCases } from './want-box-cases.js';
import { MemoryWantBoxes } from './want-boxes.js';

describe('MemoryWantBoxes', () => {
  wantBoxCases(() => {
    const boxes = new MemoryWantBoxes();
    return Promise.resolve({ boxes, wants: boxes.wants, targets: boxes.targets });
  });
});
