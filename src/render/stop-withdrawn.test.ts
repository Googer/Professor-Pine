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
  it('keeps within Discord’s 2,000 characters, leaving whole sentences out at the end (review F2)', () => {
    const long = (n: number, task: string): StopReport => ({
      id: n,
      ...researchReport({
        stop: reportedStop(n, { name: `${'Very Long Mural Name '.repeat(4)}${String(n)}` }),
        subjectKey: task,
        research: {
          text: `${task} ${'x'.repeat(100)}`,
          category: 'Other',
          rewards: [],
          typed: false,
        },
      }),
    });
    const ends = ['a', 'b', 'c'].flatMap((task, t) =>
      [1, 2, 3, 4, 5].map((n) => ({
        report: long(t * 10 + n, task),
        how: { kind: 'staff' as const },
      })),
    );
    const sentences = ['a', 'b', 'c'].map((task) =>
      withdrawnDm(ends.filter(({ report }) => report.subjectKey === task)),
    );
    expect(sentences.join('\n').length).toBeGreaterThan(2_000);
    expect(withdrawnDm(ends)).toBe(sentences.slice(0, 2).join('\n'));
  });

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
