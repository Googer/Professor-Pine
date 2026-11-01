import { describe, expect, it } from 'vitest';
import { gymFilter } from './filter.js';

const gyms = [
  { id: 1, name: 'Pinewood Public Library', nickname: 'The Stacks' },
  { id: 2, name: 'Café Élan Fresco', nickname: null },
  { id: 3, name: "St. Mary's Church", nickname: null },
  { id: 4, name: 'Starbucks', nickname: 'Downtown Starbucks' },
];

const ids = (text: string) => gyms.filter(gymFilter(text)).map((gym) => gym.id);

describe('gymFilter', () => {
  it('lets every gym through an empty filter', () => {
    expect(ids('')).toEqual([1, 2, 3, 4]);
    expect(ids('   ')).toEqual([1, 2, 3, 4]);
  });

  it('finds gyms by every word typed, in the name or the nickname', () => {
    expect(ids('library')).toEqual([1]);
    expect(ids('stacks')).toEqual([1]);
    expect(ids('pinewood stacks')).toEqual([1]);
    expect(ids('star')).toEqual([4]);
    expect(ids('downtown')).toEqual([4]);
    expect(ids('library church')).toEqual([]);
  });

  it('reads without case or accents, and an apostrophe as nothing', () => {
    expect(ids('CAFE elan')).toEqual([2]);
    expect(ids('marys')).toEqual([3]);
    expect(ids("mary's")).toEqual([3]);
  });
});
