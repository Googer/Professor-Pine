import { describe } from 'vitest';
import { stopReportCases } from './stop-report-cases.js';
import { MemoryStopReports } from './stop-reports.js';

describe('MemoryStopReports', () => {
  stopReportCases(() => Promise.resolve(new MemoryStopReports()));
});
