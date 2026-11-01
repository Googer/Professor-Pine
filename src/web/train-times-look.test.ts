import { describe, expect, it } from 'vitest';
import { blockAt, clientSheet } from '../../test/support/stylesheets.js';

/**
 * A train's Starts and Ends in the map's Manage… look as a meetup's (Matt, 2026-10-30): the label
 * on a line of its own, the field under it at the form's width. A train's form is a `post-form`,
 * a meetup's a `raid-form`; the staging run found the rows bare in the former.
 */
describe("a train's times in the map's Manage…", () => {
  const css = clientSheet('map.css');

  it('stack the label over the field', () => {
    const row = blockAt(css, /\.post-form\s+\.form-row\s*\{/u);
    expect(row).toMatch(/display:\s*flex/u);
    expect(row).toMatch(/flex-direction:\s*column/u);
  });

  it('give the field the form width', () => {
    const field = blockAt(css, /\.post-form\s+\.form-row\s+input\s*\{\s*width/u);
    expect(field).toMatch(/width:\s*100%/u);
    expect(field).toMatch(/box-sizing:\s*border-box/u);
  });

  it("have a meetup's border and padding", () => {
    const shared = blockAt(css, /\.post-form\s+\.form-row\s+input\s*\{\s*padding/u);
    expect(shared).toMatch(/border:\s*1px solid var\(--field-border\)/u);
    expect(shared).toMatch(/padding:\s*4px 8px/u);
  });
});
