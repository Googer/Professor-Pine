import { describe } from 'vitest';
import { eventWindowCases } from './event-window-store-cases.js';
import { MemoryEventWindows } from './event-window-store.js';

describe('MemoryEventWindows', () => {
  eventWindowCases(() => Promise.resolve(new MemoryEventWindows()));
});
