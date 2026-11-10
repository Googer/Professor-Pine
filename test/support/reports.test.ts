import { describe } from 'vitest';
import { reportCases } from './report-cases.js';
import { MemoryReports } from './reports.js';

describe('MemoryReports', () => {
  reportCases(() => Promise.resolve(new MemoryReports()));
});
