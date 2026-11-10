import { describe, expect, it } from 'vitest';
import { idsOf } from './stop-post-repository.js';

describe('idsOf (review R4)', () => {
  it('reads a list of ids as MySQL gives it, and none for anything else', () => {
    expect(idsOf('["1","2"]')).toEqual(['1', '2']);
    expect(idsOf(['3'])).toEqual(['3']);
    expect(idsOf(null)).toEqual([]);
    expect(idsOf('not json')).toEqual([]);
    expect(idsOf('{"a":1}')).toEqual([]);
  });
});
