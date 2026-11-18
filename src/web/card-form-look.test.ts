import { describe, expect, it } from 'vitest';
import { blockAt, clientSheet } from '../../test/support/stylesheets.js';

/**
 * The phone card's form mode (plan 8M-22, review P10), as `map.css` draws it: as tall as its form
 * up to 85% of the screen less the browser's bars (`dvh`), not always that tall, its form's body
 * scrolling over the row at its foot.
 */
describe("the phone card's form mode", () => {
  const css = clientSheet('map.css');

  it('is as tall as its form up to 85dvh, never a fixed height', () => {
    const rule = blockAt(css, /^\.party-card\.form \{/mu);
    expect(rule).toMatch(/max-height:\s*85dvh/u);
    expect(rule).not.toMatch(/(^|[^-])height:/u);
  });

  it("keeps the form's row at the card's foot while its body scrolls", () => {
    expect(blockAt(css, /^\.party-card \.card-form \{/mu)).toMatch(/overflow-y:\s*auto/u);
    expect(blockAt(css, /^\.party-card \.card-form > \* > \.form-foot \{/mu)).toMatch(
      /position:\s*sticky/u,
    );
  });
});
