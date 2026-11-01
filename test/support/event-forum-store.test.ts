import { describe } from 'vitest';
import { eventForumCases, listedEventCases } from './event-forum-store-cases.js';
import { MemoryEventForums, MemoryListedEvents } from './event-forum-store.js';

describe('MemoryEventForums', () => {
  eventForumCases(() => Promise.resolve(new MemoryEventForums()));
});

describe('MemoryListedEvents', () => {
  listedEventCases(() => Promise.resolve(new MemoryListedEvents()));
});
