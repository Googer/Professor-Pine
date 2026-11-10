import { describe, expect, it } from 'vitest';
import { ENDING_SOON_MINUTES, endsSoon } from './ending-soon.js';
import * as maxEnd from './max-end.js';

describe('endsSoon (plan 8M-7)', () => {
  it("is one rule for /max's question and the map's raids in their last minutes", () => {
    expect(ENDING_SOON_MINUTES).toBe(5);
    expect(endsSoon(1_000 + 5 * 60_000 - 1, 1_000)).toBe(true);
    expect(endsSoon(1_000 + 5 * 60_000, 1_000)).toBe(false);
    // /max reads the very same function and number.
    expect(maxEnd.endsSoon).toBe(endsSoon);
    expect(maxEnd.ENDING_SOON_MINUTES).toBe(ENDING_SOON_MINUTES);
  });
});
