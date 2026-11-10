import { describe } from 'vitest';
import { webSessionCases } from './web-session-cases.js';
import { MemoryWebSessions } from './web-sessions.js';

describe('MemoryWebSessions', () => {
  webSessionCases(() => Promise.resolve(new MemoryWebSessions()));
});
