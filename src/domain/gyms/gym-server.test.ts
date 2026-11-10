import { describe, expect, it } from 'vitest';
import { withinReach } from './gym-server.js';

describe('withinReach', () => {
  it('lets a server reach what lies in a region of its own', () => {
    expect(withinReach([1], 1)).toBe(true);
    expect(withinReach([1, 1], 1)).toBe(true);
  });

  it('keeps a server from what lies only in regions of other servers', () => {
    expect(withinReach([2], 1)).toBe(false);
    expect(withinReach([2, 3], 1)).toBe(false);
  });

  it('lets both servers reach what lies in regions of both', () => {
    expect(withinReach([1, 2], 1)).toBe(true);
    expect(withinReach([1, 2], 2)).toBe(true);
    expect(withinReach([1, 2], 3)).toBe(false);
  });

  it('lets every server reach what lies in no region of any server', () => {
    expect(withinReach([], 1)).toBe(true);
    // A region without a server belongs to nobody.
    expect(withinReach([null], 1)).toBe(true);
    expect(withinReach([null, null], 2)).toBe(true);
    expect(withinReach([null, 2], 1)).toBe(false);
    expect(withinReach([null, 2], 2)).toBe(true);
  });

  it('gives a server that has no row only what belongs to nobody', () => {
    expect(withinReach([], undefined)).toBe(true);
    expect(withinReach([null], undefined)).toBe(true);
    expect(withinReach([1], undefined)).toBe(false);
  });
});
