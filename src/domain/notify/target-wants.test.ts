import { describe, expect, it } from 'vitest';
import {
  boxTarget,
  parseTargetWantToken,
  readTargetWantArgs,
  targetWantArgs,
  targetWantToken,
  type TargetWant,
} from './target-wants.js';

const EVERY: readonly TargetWant[] = [
  boxTarget('research-pokemon', 147),
  boxTarget('research-pokemon', 37, 'vulpix_alola'),
  { kind: 'research-item', item: 'golden-razz-berry' },
  { kind: 'research-energy', dex: 6 },
  boxTarget('dynamax', 68),
  boxTarget('gigantamax', 849, 'toxtricity_amped'),
  { kind: 'rocket', who: 'grunt:dragon' },
  { kind: 'rocket', who: 'grunt:none' },
  { kind: 'rocket', who: 'leader:sierra' },
  { kind: 'rocket', who: 'leader:any' },
  { kind: 'rocket', who: 'giovanni' },
  { kind: 'rocket', who: 'decoy' },
];

describe('the tokens of TargetWant', () => {
  it('spells each target as design 9.1 says, and reads it back', () => {
    expect(EVERY.map(targetWantToken)).toEqual([
      'research:pokemon:147',
      'research:pokemon:37:vulpix_alola',
      'research:item:golden-razz-berry',
      'research:energy:6',
      'dynamax:68',
      'gigantamax:849:toxtricity_amped',
      'grunt:dragon',
      'grunt:none',
      'leader:sierra',
      'leader:any',
      'giovanni',
      'decoy',
    ]);
    for (const want of EVERY) expect(parseTargetWantToken(targetWantToken(want))).toEqual(want);
  });

  it('reads nothing that is no target of this version', () => {
    for (const token of [
      '',
      'research',
      'research:pokemon',
      'research:pokemon:0',
      'research:pokemon:147:Dratini',
      'research:item:Rare Candy',
      'research:energy:6:charizard_mega_x',
      'dynamax',
      'dynamax:abc',
      'grunt:shadow',
      'grunt:',
      'leader:jessie',
      'giovanni:1',
      // A lineup is reported, never wanted (plan 8R-4L): wants stay by type.
      'grunt:water:male',
      'grunt:none:female',
      'research:pokemon:147:dratini:more',
    ]) {
      expect(parseTargetWantToken(token)).toBeUndefined();
    }
  });

  it('fits a custom id, and the arguments of a Stop button read back', () => {
    for (const want of EVERY) {
      const args = targetWantArgs(want);
      expect(args.every((arg) => arg !== '' && !arg.includes(':'))).toBe(true);
      expect(readTargetWantArgs(args)).toEqual(want);
    }
    expect(readTargetWantArgs(['rp'])).toBeUndefined();
    expect(readTargetWantArgs(['ri', 'Rare Candy'])).toBeUndefined();
    expect(readTargetWantArgs(['re', '6', 'x'])).toBeUndefined();
    expect(readTargetWantArgs(['zz', '6'])).toBeUndefined();
    expect(readTargetWantArgs(['rg', 'shadow'])).toBeUndefined();
    expect(readTargetWantArgs(['rl', 'jessie'])).toBeUndefined();
    expect(readTargetWantArgs(['rv', 'x'])).toBeUndefined();
  });

  // The same slip as the tier words' (the audit of 2026-11-10, L-I5): a kind read with a plain
  // index from its table, so a word every object has was one.
  it('reads no target from a kind every object has', () => {
    expect(readTargetWantArgs(['constructor', '6'])).toBeUndefined();
    expect(readTargetWantArgs(['__proto__', '6'])).toBeUndefined();
    expect(readTargetWantArgs(['toString', '6', 'vulpix_alola'])).toBeUndefined();
  });
});
