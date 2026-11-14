import { describe } from 'vitest';
import { serverRecordCases } from './server-record-cases.js';
import { MemoryServerRecords } from './server-standings.js';

describe('MemoryServerRecords', () => {
  serverRecordCases(({ rows, guilds }) => Promise.resolve(new MemoryServerRecords(rows, guilds)));
});
