import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { bossesOfSnapshot, compareBaseline } from './baseline.js';

describe('compareBaseline', () => {
  it('lists what went from right to wrong or was not read, and what got right', () => {
    const before = {
      'a.png': { gym: true, clock: true, boss: false },
      'b.png': { gym: true },
      'c.png': { tier: false },
    };
    const now = {
      'a.png': { gym: false, boss: true },
      'c.png': { tier: false },
      'new.png': { gym: false },
    };
    expect(compareBaseline(before, now)).toEqual({
      worse: ['a.png: gym', 'a.png: clock (not read)', 'b.png: gym (not read)'],
      better: ['a.png: boss'],
    });
    expect(compareBaseline(before, before)).toEqual({ worse: [], better: [] });
  });
});

describe('bossesOfSnapshot', () => {
  it('gives the bosses of a kept list their catalogue entries, and none to one it does not know', () => {
    const bosses = bossesOfSnapshot(
      [
        { key: 'yveltal', name: 'Yveltal', tier: { level: 'T5', shadow: false } },
        { key: '~newmon', name: 'Newmon', tier: { level: 'T3', shadow: false } },
      ],
      catalogueFixture(),
    );
    expect(bosses[0]?.entry?.key).toBe('yveltal');
    expect(bosses[1]).toMatchObject({ key: '~newmon', name: 'Newmon', entry: undefined });
  });
});
