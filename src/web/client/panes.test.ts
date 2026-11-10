import { describe, expect, it } from 'vitest';
import { REGION_OUTLINE, TRAIN_LINE_PANE_Z } from './panes.js';

// Review SEL-1: the overlay pane (400) lies over a train's line, and a region's fill would take
// the line's taps (seen in a browser: `elementFromPoint` on the line answered the region).
describe("a train's line under the overlay pane", () => {
  it("is not covered by a region's outline, which takes no tap", () => {
    expect(TRAIN_LINE_PANE_Z).toBeLessThan(400);
    expect(REGION_OUTLINE.interactive).toBe(false);
  });
});
