import { describe } from 'vitest';
import { stopReportCases } from './stop-report-cases.js';
import { MemoryStopReports } from './stop-reports.js';

describe('MemoryStopReports', () => {
  stopReportCases(
    () => Promise.resolve(new MemoryStopReports()),
    (store, serverId, memberId) => {
      store.optIn(serverId, memberId);
      return Promise.resolve();
    },
  );
});
