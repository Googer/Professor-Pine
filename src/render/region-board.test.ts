import { describe, expect, it } from 'vitest';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import { boardMessage, boardTexts, countWords } from './region-board.js';

describe('the region board on Discord', () => {
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
    const view = { period: 'all' as const, rows, gone: null, total: { raids: 45_150, maxes: 0 } };
    const [head, foot] = boardTexts(view);
    const lines = head?.split('\n') ?? [];
    expect(lines[1]).toBe('1. <#100000000000000000>: 300 raids');
    const shown = lines.length - 2;
    expect(lines.at(-1)).toBe(`…and ${String(300 - shown)} more regions, quieter`);
    expect(foot).toBe('**Total:** 45,150 raids');
    expectV2Sendable(boardMessage(view));
  });
});
