import { describe, expect, it } from 'vitest';
import { clientSheet } from '../../test/support/stylesheets.js';
import { BADGE_PANE, TRAIN_LINE_PANE } from './client/panes.js';

/**
 * The Report button's step 2 (plan 8M-9A) dims everything drawn but the places that fit: the
 * lines and the places' dots on Leaflet's overlay pane, a train's arrowheads and numbers (branch
 * review S4), while the dots that fit stay bright and the larger targets clear. Read from the
 * stylesheet, as the browser reads it.
 */

/** The rules of `map.css`: each one's selectors and its declarations by name. */
function rules(): Array<{ selectors: string[]; declarations: Map<string, string> }> {
  return [...clientSheet('map.css').matchAll(/([^{}]*)\{([^{}]*)\}/gu)].map((rule) => ({
    selectors: (rule[1] ?? '').split(',').map((one) => one.trim()),
    declarations: new Map(
      [...(rule[2] ?? '').matchAll(/([a-z-]+)\s*:\s*([^;]+)/gu)].map((found) => [
        found[1] ?? '',
        (found[2] ?? '').trim(),
      ]),
    ),
  }));
}

/** The value of `property` that the rules give `selector`, if one of them names it exactly. */
const valueFor = (selector: string, property: string): string | undefined =>
  rules()
    .find((rule) => rule.selectors.includes(selector))
    ?.declarations.get(property);

describe('what is drawn while step 2 of Report picks', () => {
  it("dims the dots on the overlay pane, and a train's line on its own pane", () => {
    expect(valueFor('.report-picking .leaflet-overlay-pane path', 'opacity')).toBe('0.35');
    expect(valueFor(`.report-picking .leaflet-${TRAIN_LINE_PANE}-pane path`, 'opacity')).toBe(
      '0.35',
    );
  });

  // Branch review S4: they take no tap then.
  it("dims a train's numbers and arrowheads with its line", () => {
    expect(valueFor(`.report-picking .leaflet-${BADGE_PANE}-pane`, 'opacity')).toBe('0.35');
    expect(valueFor('.report-picking .train-arrow', 'opacity')).toBe('0.35');
  });

  it('keeps the dots that fit bright, and the larger targets clear', () => {
    expect(valueFor('.pick-gyms .leaflet-overlay-pane path.gym-dot', 'opacity')).toBe('1');
    expect(valueFor('.pick-spots .leaflet-overlay-pane path.spot-dot', 'opacity')).toBe('1');
    expect(valueFor('.pick-stops .leaflet-overlay-pane path.stop-dot', 'opacity')).toBe('1');
    expect(valueFor('.report-picking .leaflet-overlay-pane path.place-target', 'opacity')).toBe(
      '0',
    );
  });
});
