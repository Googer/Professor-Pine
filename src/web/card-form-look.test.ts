import { describe, expect, it } from 'vitest';
import { blockAt, clientSheet } from '../../test/support/stylesheets.js';

/**
 * The phone card's form mode (plan 8M-22, reviews P10 and R3), as `map.css` draws it: as tall as
 * its form, 85% of the screen less the browser's bars at most (`dvh`, the card's own cap), never a
 * fixed height; its form's body scrolling over the row at its foot.
 */
describe("the phone card's form mode", () => {
  const css = clientSheet('map.css');

  it('sets no height of its own: the card caps it at 85dvh', () => {
    const form = blockAt(css, /^\.party-card\.form \{/mu);
    expect(form).not.toMatch(/height:/u);
    expect(blockAt(css, /^\.party-card \{/mu)).toMatch(/max-height:\s*85dvh/u);
  });

  it("keeps the form's row at the card's foot while its body scrolls", () => {
    expect(blockAt(css, /^\.party-card \.card-form \{/mu)).toMatch(/overflow-y:\s*auto/u);
    expect(blockAt(css, /^\.party-card \.card-form > \* > \.form-foot \{/mu)).toMatch(
      /position:\s*sticky/u,
    );
  });
});
