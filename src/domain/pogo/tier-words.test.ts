import { describe, expect, it } from 'vitest';
import { leadingTier } from './tier-words.js';

describe('leadingTier', () => {
  it('reads a tier typed as words at the start of a text, and the rest', () => {
    expect(leadingTier('t5')).toEqual({ tier: { level: 'T5', shadow: false }, rest: '' });
    expect(leadingTier('Shadow tier 3 egg')).toEqual({
      tier: { level: 'T3', shadow: true },
      rest: '',
    });
    expect(leadingTier('mega legendary raid at the fountain')).toEqual({
      tier: { level: 'MegaLegendary', shadow: false },
      rest: 'at the fountain',
    });
    expect(leadingTier('super mega')).toEqual({
      tier: { level: 'SuperMega', shadow: false },
      rest: '',
    });
  });

  it('reads no tier in the name of a boss', () => {
    expect(leadingTier('pikachu')).toBeUndefined();
    expect(leadingTier('')).toBeUndefined();
  });

  // The audit of 2026-11-10 (L-I5): the table of tier words was read with a plain index, so a
  // word every object has was a tier: a boss named so failed with an error line per use.
  it('reads no tier in a word every object has: constructor, __proto__ and the like', () => {
    for (const word of ['constructor', '__proto__', 'tostring', 'valueof', 'hasownproperty']) {
      expect(leadingTier(word)).toBeUndefined();
      expect(leadingTier(`shadow ${word}`)).toBeUndefined();
      expect(leadingTier(`${word} at the fountain`)).toBeUndefined();
    }
    // Nor in two words that make one together, as "mega legendary" does.
    expect(leadingTier('__proto __')).toBeUndefined();
    expect(leadingTier('con structor')).toBeUndefined();
    expect(leadingTier('__ proto__')).toBeUndefined();
  });
});
