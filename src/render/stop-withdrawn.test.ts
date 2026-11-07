import { describe, expect, it } from 'vitest';
import {
  reportedStop,
  researchReport,
  rocketReport,
} from '../../test/support/stop-report-cases.js';
import type { StopReport } from '../domain/stops/report.js';
import { stopMapLink } from './research.js';
import { withdrawnDm } from './stop-withdrawn.js';

const research = (n: number): StopReport => ({
  id: n,
  ...researchReport({ stop: reportedStop(n) }),
});

describe('withdrawnDm (Matt, 2026-11-07)', () => {
  it('names five stops and counts the rest', () => {
    const reports = [1, 2, 3, 4, 5, 6, 7].map(research);
    const names = [1, 2, 3, 4, 5].map((n) => stopMapLink(reportedStop(n))).join(', ');
    expect(withdrawnDm(reports.map((report) => ({ report, how: { kind: 'staff' } })))).toBe(
      `The field research **Make 2 Excellent Throws** · Dratini at ${names} and 2 more stops ` +
        'was taken back by staff.',
    );
  });

  it('gives a grunt its article, names a leader, and keeps each way it ended a sentence of its own', () => {
    const electric: StopReport = {
      id: 1,
      ...rocketReport({
        subjectKey: 'grunt:electric',
        rocket: { name: 'Electric-type grunt', catches: [] },
      }),
    };
    const arlo: StopReport = {
      id: 2,
      ...rocketReport({ subjectKey: 'leader:arlo', rocket: { name: 'Arlo', catches: [] } }),
    };
    const stop = stopMapLink(reportedStop());
    expect(
      withdrawnDm([
        { report: electric, how: { kind: 'reporter' } },
        { report: research(3), how: { kind: 'replaced', by: arlo } },
      ]),
    ).toBe(
      `The report of an **Electric-type grunt** at ${stop} was taken back by its reporter.\n` +
        `The field research **Make 2 Excellent Throws** · Dratini at ${stopMapLink(reportedStop(3))} ` +
        'was replaced: **Arlo** is reported there now.',
    );
  });
});
