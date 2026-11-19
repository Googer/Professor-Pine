import { describe, expect, it } from 'vitest';
import { blockAt, clientSheet } from '../../test/support/stylesheets.js';

/**
 * The phone card's form mode (plan 8M-22, reviews P10, R3 and W7), as `map.css` draws it: as tall
 * as its form, 85% of the screen less the browser's bars at most (`dvh`, the card's own cap), never
 * a height of its own; its form's body scrolling over the row at its foot.
 */
describe("the phone card's form mode", () => {
  const css = clientSheet('map.css');

  /** The bodies of every rule whose selector starts with `.party-card.form`. */
  const formRules = (): string[] =>
    [...css.matchAll(/^\.party-card\.form[^{]*\{([^}]*)\}/gmu)].map((found) => found[1] ?? '');

  it('sets no height of its own in any rule: the card caps it at 85dvh', () => {
    const rules = formRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule).not.toMatch(/height:/u);
    const card = blockAt(css, /^\.party-card \{/mu);
    expect(card).not.toBe('');
    expect(card).toMatch(/max-height:\s*85dvh/u);
  });

  it("keeps the form's row at the card's foot while its body scrolls", () => {
    expect(blockAt(css, /^\.party-card \.card-form \{/mu)).toMatch(/overflow-y:\s*auto/u);
    expect(blockAt(css, /^\.party-card \.card-form > \* > \.form-foot \{/mu)).toMatch(
      /position:\s*sticky/u,
    );
  });
});
