import { describe, expect, it } from 'vitest';
import { blockAt, clientSheet, cssPixels, themeTokens } from '../../test/support/stylesheets.js';

/**
 * The Route list of a train's popup (8M-15): the list's numbers lie in the padding of its `ol`, and
 * a popup that scrolls clips what passes its edge, so the padding holds "99." whole. Read from the
 * stylesheet; the width was measured in a browser at the page's 15 pixel type.
 */
describe("a train's Route list in its popup", () => {
  it('has room for a number of two digits and its period', () => {
    const list = blockAt(clientSheet('map.css'), /\.post-popup section\.route ol\s*\{/u);
    const padding = /padding-left:\s*([^;]+);/u.exec(list)?.[1] ?? '0';
    expect(cssPixels(padding, themeTokens())).toBeGreaterThanOrEqual(30);
  });
});
