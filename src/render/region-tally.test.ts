import { describe, expect, it } from 'vitest';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import { tallyMessage, tallyTexts, countWords, TALLY_ROWS_BUDGET } from './region-tally.js';

describe('the region tally on Discord', () => {
  it('words the counts of a line, raids before max battles, thousands with commas', () => {
    expect(countWords({ raids: 0, maxes: 0 })).toBe('none');
    expect(countWords({ raids: 1, maxes: 0 })).toBe('1 raid');
    expect(countWords({ raids: 0, maxes: 1 })).toBe('1 max battle');
    expect(countWords({ raids: 253_114, maxes: 2 })).toBe('253,114 raids, 2 max battles');
  });

  it('lists the busiest regions of a server of very many, says how many more, and keeps the total', () => {
    const rows = Array.from({ length: 300 }, (_, n) => ({
      name: `<#1000000000000${String(n).padStart(5, '0')}>`,
      raids: 300 - n,
      maxes: 0,
    }));
    const view = {
      period: 'all' as const,
      rows,
      quiet: [],
      gone: null,
      total: { raids: 45_150, maxes: 0 },
    };
    const [head, foot] = tallyTexts(view);
    const lines = head?.split('\n') ?? [];
    expect(lines[1]).toBe('1. <#100000000000000000>: 300 raids');
    const shown = lines.length - 2;
    expect(lines.at(-1)).toBe(`…and ${String(300 - shown)} more regions, quieter`);
    expect(foot).toBe('**Total:** 45,150 raids');
    expectV2Sendable(tallyMessage(view));
  });

  it('names the regions without a raid or max battle on one line after the ranked ones', () => {
    const view = {
      period: 'month' as const,
      rows: [{ name: '<#1>', raids: 3, maxes: 0 }],
      quiet: ['<#2>', 'Region 3'],
      gone: null,
      total: { raids: 3, maxes: 0 },
    };
    expect(tallyTexts(view)[0]).toBe(
      '### Raids and max battles by region, this month\n' +
        '1. <#1>: 3 raids\n' +
        'No raids or max battles: <#2>, Region 3',
    );
    // Without quiet regions there is no such line.
    expect(tallyTexts({ ...view, quiet: [] })[0]).toBe(
      '### Raids and max battles by region, this month\n1. <#1>: 3 raids',
    );
  });

  it('says plainly when no region had a raid or max battle in the period', () => {
    const quiet = { rows: [], quiet: ['<#1>', '<#2>'], gone: null, total: { raids: 0, maxes: 0 } };
    expect(tallyTexts({ ...quiet, period: 'month' })).toEqual([
      '### Raids and max battles by region, this month\n' +
        'No raids or max battles this month in any region.',
      '**Total:** none',
    ]);
    expect(tallyTexts({ ...quiet, period: 'year' })[0]).toMatch(
      /\nNo raids or max battles this year in any region\.$/u,
    );
    expect(tallyTexts({ ...quiet, period: 'all' })[0]).toMatch(
      /\nNo raids or max battles in any region yet\.$/u,
    );
  });

  it('counts the quiet line against the budget, naming as many as fit and how many more', () => {
    const name = (n: number) => `<#2000000000000${String(n).padStart(5, '0')}>`;
    const busy = Array.from({ length: 60 }, (_, n) => ({ name: name(n), raids: 60 - n, maxes: 0 }));
    const quiet = Array.from({ length: 200 }, (_, n) => name(1000 + n));
    const view = {
      period: 'year' as const,
      rows: busy,
      quiet,
      gone: null,
      total: { raids: 1_830, maxes: 0 },
    };
    const [head] = tallyTexts(view);
    const lines = head?.split('\n') ?? [];
    // Every busy region is listed; the quiet line fills what is left of the budget.
    expect(lines.filter((line) => /^\d+\. /u.test(line))).toHaveLength(60);
    const line = lines.at(-1) ?? '';
    const named = (line.match(/<#\d+>/gu) ?? []).length;
    expect(named).toBeGreaterThan(0);
    expect(line).toMatch(
      new RegExp(`^No raids or max battles: <#.*, …and ${String(200 - named)} more$`, 'u'),
    );
    expect(lines.slice(1).join('\n').length).toBeLessThanOrEqual(TALLY_ROWS_BUDGET);
    expectV2Sendable(tallyMessage(view));
  });

  it('counts the quiet regions where the ranked ones took the whole budget', () => {
    const rows = Array.from({ length: 300 }, (_, n) => ({
      name: `<#1000000000000${String(n).padStart(5, '0')}>`,
      raids: 300 - n,
      maxes: 0,
    }));
    const view = {
      period: 'all' as const,
      rows,
      quiet: ['<#1>', '<#2>', '<#3>'],
      gone: null,
      total: { raids: 45_150, maxes: 0 },
    };
    const lines = tallyTexts(view)[0]?.split('\n') ?? [];
    expect(lines.at(-2)).toMatch(/^…and \d+ more regions, quieter$/u);
    expect(lines.at(-1)).toBe('No raids or max battles: 3 regions');
    expectV2Sendable(tallyMessage(view));
  });
});
