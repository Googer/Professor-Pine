import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The look of the reports at stops on the map (branch review of 8M-9B, W9 and W10) as `map.css`
 * gives it: the rules read by their selectors. Here, beside `post-accents.test.ts`, outside the
 * client's type check.
 */
const MAP_CSS = readFileSync(path.resolve(import.meta.dirname, 'client', 'map.css'), 'utf8');

/** The rules of a stylesheet: each one's selectors (spaces made one) and its declarations. */
function rules(css: string): Array<{ selectors: string[]; declarations: Map<string, string> }> {
  const plain = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map(([, head = '', body = '']) => ({
    selectors: head.split(',').map((one) => one.trim().replace(/\s+/gu, ' ')),
    declarations: new Map(
      body
        .split(';')
        .map((one) => one.split(':'))
        .filter((parts): parts is [string, string] => parts.length === 2)
        .map(([name, value]) => [name.trim(), value.trim()]),
    ),
  }));
}

/** The value `property` has for `selector` (the last rule that names it and sets it). */
function valueOf(selector: string, property: string): string | undefined {
  return rules(MAP_CSS)
    .filter((rule) => rule.selectors.includes(selector) && rule.declarations.has(property))
    .at(-1)
    ?.declarations.get(property);
}

/** The pixels of a length such as `22px` or `-3px`. */
const pixels = (value: string | undefined): number => Number(/^(-?\d+)px$/u.exec(value ?? '')?.[1]);

describe("the note box's look (plan 8M-11A)", () => {
  // The preview's finding: "Open the post on Discord" is a button, not underlined text.
  it('draws the link of the note box as a button, without an underline', () => {
    expect(valueOf('.note-box a.press', 'text-decoration')).toBe('none');
  });
});

describe("the reports at stops' look on the map", () => {
  // W9: a target to tap of at least 24 pixels (WCAG 2.5.8), the look kept small.
  it('gives every × that clears a filter or leaves out a stop a target of at least 24 pixels', () => {
    expect(valueOf('.clear-filter', 'position')).toBe('relative');
    const reach = -pixels(valueOf('.clear-filter::after', 'inset'));
    expect(valueOf('.clear-filter::after', 'position')).toBe('absolute');
    for (const selector of ['.clear-filter', '.what-is-on h3 .clear-filter']) {
      const side = pixels(valueOf(selector, 'width'));
      expect(side, selector).toBeLessThan(24);
      expect(side + 2 * reach, selector).toBeGreaterThanOrEqual(24);
    }
  });

  // W10 (1): a report whose end passed while its popup is open says "Ended" as one drawn ended.
  it('draws the Ended of a report that ended in an open popup as one drawn ended', () => {
    const drawn = rules(MAP_CSS).find((rule) => rule.selectors.includes('.stop-report .ended'));
    expect(drawn?.selectors).toContain('.stop-report.ended .small > span:first-child');
    expect(drawn?.declarations.get('color')).toBe('var(--danger)');
  });

  // W10 (2): a PokéStop's popup in its own color; Team GO Rocket's where Rocket is there, and
  // research's where research is.
  it("edges a stop's popup and card in the PokéStop's color, Rocket's and research's by what is there", () => {
    expect(valueOf('.leaflet-popup-content-wrapper:has(.stop-popup)', 'border-left-color')).toBe(
      'var(--stop)',
    );
    expect(valueOf('.party-card:has(.stop-popup)', 'border-top-color')).toBe('var(--stop)');
    const rocket = '.stop-report.grunt, .stop-report.hideout';
    expect(MAP_CSS).toMatch(
      new RegExp(
        String.raw`\.leaflet-popup-content-wrapper:has\(${rocket.replaceAll('.', String.raw`\.`)}\)\s*\{\s*border-left-color: var\(--rocket\)`,
        'u',
      ),
    );
    expect(MAP_CSS).toMatch(
      new RegExp(
        String.raw`\.party-card:has\(${rocket.replaceAll('.', String.raw`\.`)}\)\s*\{\s*border-top-color: var\(--rocket\)`,
        'u',
      ),
    );
    // Research after Rocket: a stop with both is research's.
    const research = MAP_CSS.indexOf('.leaflet-popup-content-wrapper:has(.stop-report.research)');
    const rocketAt = MAP_CSS.indexOf(`.leaflet-popup-content-wrapper:has(${rocket})`);
    expect(rocketAt).toBeGreaterThan(-1);
    expect(research).toBeGreaterThan(rocketAt);
  });
});
