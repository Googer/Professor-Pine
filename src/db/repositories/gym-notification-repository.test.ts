import { describe, expect, it } from 'vitest';
import { readGymTargets, rowsOfGymTarget, targetGymId } from './gym-notification-repository.js';

describe('targetGymId, readGymTargets, rowsOfGymTarget', () => {
  it('reads a gym id from the stored text, and nothing else', () => {
    expect(targetGymId('12')).toBe(12);
    expect(targetGymId(' 12 ')).toBe(12);
    for (const text of [null, '', '0', '-3', '1.5', 'abc', '12a', '12345678901']) {
      expect(targetGymId(text)).toBeUndefined();
    }
  });

  it('reads each gym once and counts what is no gym id', () => {
    const rows = [
      { id: 3, gym: '7' },
      { id: 1, gym: '4' },
      { id: 5, gym: '7' },
      { id: 6, gym: null },
      { id: 8, gym: 'library' },
    ];
    expect(readGymTargets(rows)).toEqual({ gymIds: [7, 4], unreadable: 2 });
    expect(rowsOfGymTarget(rows, 7)).toEqual([3, 5]);
    expect(rowsOfGymTarget(rows, 9)).toEqual([]);
  });
});
