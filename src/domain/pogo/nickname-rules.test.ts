import { describe, expect, it } from 'vitest';
import { nicknameProblem, tidyNickname } from './nickname-rules.js';

describe('tidyNickname', () => {
  it('trims, joins words with one space and writes lower case', () => {
    expect(tidyNickname('  Danger   Noodle \t')).toBe('danger noodle');
    expect(tidyNickname('ÉCLAIR')).toBe('éclair');
  });
});

describe('nicknameProblem', () => {
  it('takes letters, digits, spaces and hyphens', () => {
    expect(nicknameProblem('danger noodle')).toBeUndefined();
    expect(nicknameProblem('big-x2')).toBeUndefined();
    expect(nicknameProblem('pokémon')).toBeUndefined();
    expect(nicknameProblem('ab')).toBeUndefined();
    expect(nicknameProblem('a'.repeat(30))).toBeUndefined();
  });

  it('refuses what is too short or too long, counted in characters', () => {
    expect(nicknameProblem('a')).toBe('length');
    expect(nicknameProblem('a'.repeat(31))).toBe('length');
    expect(nicknameProblem('é'.repeat(30))).toBeUndefined();
  });

  it('refuses commas, punctuation and symbols', () => {
    expect(nicknameProblem('a, b')).toBe('characters');
    expect(nicknameProblem('ttar!')).toBe('characters');
    expect(nicknameProblem('<@123>')).toBe('characters');
    expect(nicknameProblem('a_b')).toBe('characters');
  });

  it('refuses digits alone, which read as a Pokédex number', () => {
    expect(nicknameProblem('150')).toBe('no-letter');
    expect(nicknameProblem('1-2')).toBe('no-letter');
  });

  it('refuses the words that the Pokémon options read as something else', () => {
    for (const word of [
      'shadow',
      'shadow ttar',
      'mega',
      'none',
      'perfect',
      'hundo',
      'zero',
      'useless',
      'nundo',
      'legendary',
      'elite',
      'super mega',
      'mega legendary',
      't5',
      'tier 5',
      'level 3',
      '5 star',
      'egg',
      'raid',
      'spawn',
      'boss',
      'primal',
      'ex',
    ]) {
      expect(nicknameProblem(tidyNickname(word)), word).toBe('reserved');
    }
    expect(nicknameProblem('megaman')).toBeUndefined();
    // Words that only a phrase makes a tier are free by themselves.
    expect(nicknameProblem('shooting star')).toBeUndefined();
    expect(nicknameProblem('level up')).toBeUndefined();
    expect(nicknameProblem('super fan')).toBeUndefined();
    expect(nicknameProblem('top tier')).toBeUndefined();
    expect(nicknameProblem('noodle')).toBeUndefined();
  });

  it('refuses a nickname that begins with a tier, which a raid report reads as an egg', () => {
    for (const word of [
      '1 punch',
      '3 headed dog',
      '5 star dragon',
      '5-star dragon',
      't1 dino',
      't3 blob',
      'tier5 thing',
      'level 3 thing',
      'tier 1 fish',
    ]) {
      expect(nicknameProblem(tidyNickname(word)), word).toBe('reserved');
    }
    expect(nicknameProblem('dragon 5')).toBeUndefined();
    expect(nicknameProblem('t1000')).toBeUndefined();
    expect(nicknameProblem('2 headed')).toBeUndefined();
    expect(nicknameProblem('tier x')).toBeUndefined();
  });
});
