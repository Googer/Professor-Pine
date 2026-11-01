import { describe, expect, it } from 'vitest';
import { blockAt, clientSheet } from '../../test/support/stylesheets.js';

/**
 * The game's icons before a train's kinds in the map's Manage… (Matt, 2026-10-30): as small as the
 * words beside them, not the Report menu's 28 pixels, on their line.
 */
describe("a train kind's icon in the map's Manage…", () => {
  const rule = blockAt(clientSheet('map.css'), /\.choice-label\s+\.report-icon\s*\{/u);

  it('is the size of the words, on their line', () => {
    expect(rule).toMatch(/display:\s*inline-block/u);
    expect(rule).toMatch(/width:\s*1\.25em/u);
    expect(rule).toMatch(/height:\s*1\.25em/u);
    expect(rule).toMatch(/vertical-align:\s*-0\.25em/u);
  });
});
