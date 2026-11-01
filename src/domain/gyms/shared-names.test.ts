import { describe, expect, it } from 'vitest';
import { nameKey, namesakes, sharedNames, shownName } from './shared-names.js';

const gym = (id: number, name: string, nickname: string | null = null) => ({ id, name, nickname });

describe('gyms that share a name', () => {
  it('compares shown names by their letters and digits alone', () => {
    expect(nameKey("St. Mary's Café")).toBe(nameKey('st marys cafe'));
    expect(nameKey('PNC  Park')).toBe(nameKey('pnc-park'));
    expect(nameKey('P.N.C. Park')).toBe(nameKey('PNC Park'));
    expect(nameKey('Park')).not.toBe(nameKey('Parks'));
    expect(nameKey('Gym 1')).not.toBe(nameKey('Gym 2'));
    expect(shownName(gym(1, 'Starbucks', 'Starbucks by the river'))).toBe('Starbucks by the river');
    expect(shownName(gym(1, 'Starbucks', '  '))).toBe('Starbucks');
  });

  it('finds the other gyms shown by the same name, also by a nickname', () => {
    const gyms = [
      gym(1, 'Starbucks'),
      gym(2, 'STARBUCKS'),
      gym(3, 'Starbucks', 'Starbucks by the river'),
      gym(4, 'Old Mill', 'Starbücks'),
    ];
    expect(namesakes(gyms[0] ?? gym(0, ''), gyms).map((g) => g.id)).toEqual([2, 4]);
    expect(namesakes(gyms[2] ?? gym(0, ''), gyms)).toEqual([]);
    // A nickname equal to another gym's shown name makes a pair as well.
    expect(namesakes(gym(9, 'Library', 'Starbucks'), gyms).map((g) => g.id)).toEqual([1, 2, 4]);
  });

  it('groups the gyms shown by one name, leaving out those a nickname tells apart', () => {
    const groups = sharedNames([
      gym(5, 'PNC Park'),
      gym(1, 'Starbucks'),
      gym(2, "Starbuck's"),
      gym(3, 'Starbucks', 'River Starbucks'),
      gym(4, 'P.N.C. Park'),
      gym(6, 'Library'),
    ]);
    expect(groups.map((group) => group.map((g) => g.id))).toEqual([
      [4, 5],
      [1, 2],
    ]);
    expect(sharedNames([gym(5, 'PNC Park'), gym(4, 'pnc park')]).map((g) => g.length)).toEqual([2]);
  });
});
