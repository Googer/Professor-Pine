import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { blockAt, clientSheet, cssPixels, themeTokens } from '../../test/support/stylesheets.js';

/**
 * The popup's × in a header row on a coarse pointer (plan 8M-15, design 2): the × keeps its 44
 * pixels, and instead of pushing every popup's content below it, one spacer floated to the ×'s
 * side at the top of the content keeps the first line clear of it, so that the first line (a
 * post's title, the place list's heading, a form's title) shares the row with the ×, and a post's
 * floated picture sits beside it. Read from Leaflet's stylesheet and the page's, as the browser
 * reads them.
 */

/** Leaflet's stylesheet, which `map.css` imports first. */
const LEAFLET = readFileSync(
  createRequire(import.meta.url).resolve('leaflet/dist/leaflet.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//gu, '');

/** The declarations of the rule of exactly `selector` in `css` (the first such rule), by name. */
function ruleOf(css: string, selector: string): Map<string, string> | undefined {
  /** A rule's selectors, a comma inside brackets (`:is(a, b)`) kept, white space made single. */
  const selectorsOf = (head: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let from = 0;
    for (let at = 0; at < head.length; at += 1) {
      if (head[at] === '(') depth += 1;
      if (head[at] === ')') depth -= 1;
      if (head[at] === ',' && depth === 0) {
        parts.push(head.slice(from, at));
        from = at + 1;
      }
    }
    parts.push(head.slice(from));
    return parts.map((one) =>
      one.replace(/\s+/gu, ' ').replace(/\(\s/gu, '(').replace(/\s\)/gu, ')').trim(),
    );
  };
  for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/gu)) {
    if (!selectorsOf(rule[1] ?? '').includes(selector)) continue;
    return new Map(
      [...(rule[2] ?? '').matchAll(/([a-z-]+)\s*:\s*([^;]+)/gu)].map((found) => [
        found[1] ?? '',
        (found[2] ?? '').trim(),
      ]),
    );
  }
  return undefined;
}

/** A length of Leaflet's `margin` shorthand: top, right, bottom, left in pixels. */
function margins(value: string): { top: number; right: number } {
  const [top = 0, right = top] = value.split(/\s+/u).map((one) => Number.parseFloat(one));
  return { top, right };
}

describe("the popup's × on a coarse pointer (plan 8M-15)", () => {
  const css = clientSheet('map.css');
  const coarse = blockAt(css, /@media\s*\(pointer:\s*coarse\)/u);
  const values = themeTokens();
  const tap = cssPixels('var(--tap-size)', values);

  it('keeps its 44 pixel tap area', () => {
    const close = ruleOf(coarse, '.leaflet-container a.leaflet-popup-close-button');
    expect(cssPixels(close?.get('width') ?? '0', values)).toBe(44);
    expect(cssPixels(close?.get('height') ?? '0', values)).toBe(44);
  });

  it('no longer pushes the content below it', () => {
    expect(ruleOf(coarse, '.leaflet-popup-content')?.get('margin-top')).toBeUndefined();
  });

  /**
   * The popups whose root is a flex column (review R1-3): a box that makes its own block
   * formatting context is narrowed beside a float for its whole height, so they reserve the room
   * on their first row instead.
   */
  const FLEX_ROOTS = ['.place-popup', '.stop-popup', '.raid-form'];
  const rootsList = FLEX_ROOTS.join(', ');
  /**
   * A post's form (Group…, Meet…, Report…, Delete…, the completion question, a train's Move…,
   * Manage… and Split…; review N3) or a meetup's editor: each is put in place of everything in
   * the party's popup, as its only child.
   */
  const POST_FORM = '.party-popup > :is(.post-form, .meetup-editor):first-child';
  /** The content of a popup that does not scroll: a scrolled one has neither spacer nor reserve. */
  const UNSCROLLED = '.leaflet-popup-content:not(.leaflet-popup-scrolled)';
  /** The spacer's width and height, as the stylesheet gives them. */
  const spacerSize = () => {
    const spacer = ruleOf(
      coarse,
      `.leaflet-popup-content:not(.leaflet-popup-scrolled, :has(> :is(${rootsList}), > ${POST_FORM}))::before`,
    );
    return {
      spacer,
      width: cssPixels(spacer?.get('width') ?? '0', values),
      height: cssPixels(spacer?.get('height') ?? '0', values),
    };
  };

  it('is kept clear by one spacer floated to its side at the top of every popup', () => {
    const { spacer, width, height } = spacerSize();
    expect(spacer?.get('content')).toBe("''");
    // The × is at the top right of the popup (Leaflet's `right: 0`).
    expect(ruleOf(LEAFLET, '.leaflet-container a.leaflet-popup-close-button')?.get('right')).toBe(
      '0',
    );
    expect(spacer?.get('float')).toBe('right');
    // With Leaflet's margins of the content and the wrapper's padding, the spacer reaches the
    // ×'s whole square: no first line runs under it.
    const leaflet = margins(ruleOf(LEAFLET, '.leaflet-popup-content')?.get('margin') ?? '');
    const padding = Number.parseFloat(
      ruleOf(LEAFLET, '.leaflet-popup-content-wrapper')?.get('padding') ?? '0',
    );
    expect(padding + leaflet.right + width).toBeGreaterThanOrEqual(tap);
    expect(padding + leaflet.top + height).toBeGreaterThanOrEqual(tap);
    // And no more than that: the first line keeps the rest of the row.
    expect(width).toBeLessThanOrEqual(tap - leaflet.right);
  });

  // Review R1-3: the reserve is the first line's only.
  it('reserves the first row of a flex popup, not beside it, as wide and high as the spacer', () => {
    const { width, height } = spacerSize();
    expect(width).toBeGreaterThan(0);
    for (const root of FLEX_ROOTS) {
      expect(['flex', 'grid'], root).toContain(ruleOf(css, root)?.get('display'));
    }
    const first = ruleOf(coarse, `${UNSCROLLED} > :is(${rootsList}) > :first-child`);
    expect(cssPixels(first?.get('margin-right') ?? '0', values)).toBe(width);
    expect(cssPixels(first?.get('min-height') ?? '0', values)).toBe(height);
  });

  // Review N3: a post's form sits inside the party's popup, not at the content's top.
  it("reserves the first row of a post's form inside the party's popup, as wide and high as the spacer", () => {
    const { width, height } = spacerSize();
    expect(width).toBeGreaterThan(0);
    expect(ruleOf(css, '.post-form')?.get('display')).toBe('flex');
    const first = ruleOf(coarse, `${UNSCROLLED} > ${POST_FORM} > :first-child`);
    expect(cssPixels(first?.get('margin-right') ?? '0', values)).toBe(width);
    expect(cssPixels(first?.get('min-height') ?? '0', values)).toBe(height);
  });

  // Branch review S1: Leaflet scrolls the content element itself (`maxHeight`), so what scrolls
  // would pass under the fixed × and a tap meant for a control would close the popup.
  it('starts a scrolled popup below the ×, its whole height clear of it', () => {
    const scrolled = ruleOf(coarse, '.leaflet-popup-content.leaflet-popup-scrolled');
    expect(scrolled?.get('margin-top')).toBe('var(--tap-size)');
    const reach = Number.parseFloat(
      ruleOf(LEAFLET, '.leaflet-popup-content-wrapper')?.get('padding') ?? '0',
    );
    expect(reach + cssPixels(scrolled?.get('margin-top') ?? '0', values)).toBeGreaterThanOrEqual(
      tap,
    );
  });

  it("starts the place list's choices below the spacer, at their full width", () => {
    expect(ruleOf(coarse, '.place-list .choices')?.get('clear')).toBe('right');
  });

  it("has a post's floated picture beside the spacer, not under it", () => {
    // Both float right, the spacer first: the picture stacks to its left.
    expect(ruleOf(css, '.post .beside')?.get('float')).toBe('right');
    expect(ruleOf(css, '.post .beside')?.get('clear')).toBeUndefined();
  });
});
