import { describe, expect, it } from 'vitest';
import { beginningFirst, byName } from './choices.js';

describe('the order of choices', () => {
  it('puts the names that begin with the typed text first, then goes by name', () => {
    const names = ['Old Mill', 'Mill Pond', 'Windmill', 'mill Street', 'Abbey'];
    const sorted = names.map((name) => ({ name })).sort(beginningFirst('mill'));
    expect(sorted.map(({ name }) => name)).toEqual([
      'Mill Pond',
      'mill Street',
      'Abbey',
      'Old Mill',
      'Windmill',
    ]);
  });

  it('is by name alone while nothing is typed', () => {
    const sorted = [{ name: 'b' }, { name: 'A' }, { name: 'c' }].sort(beginningFirst(''));
    expect(sorted.map(({ name }) => name)).toEqual(['A', 'b', 'c']);
    expect(['b', 'A', 'c'].sort(byName)).toEqual(['A', 'b', 'c']);
  });
});
