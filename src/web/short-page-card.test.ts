import { describe, expect, it } from 'vitest';
import { blockAt, clientSheet, cssPixels, themeTokens } from '../../test/support/stylesheets.js';

/**
 * P1 (plan 8M-15, design 4): every short page's card (`body.short main`, `pages.css`) is the full
 * 480 pixels where the screen allows, the 16 pixel gutters kept, narrower only on a narrow screen,
 * however little it holds: a logged-in top page with links only, a one-line answer. Read from the
 * stylesheet, laid out as a browser lays out a flex item in a row (`body.short` is a flex row that
 * centers it).
 */

/** The declarations of the first rule whose head `head` finds, by name. */
function declarations(css: string, head: RegExp): Map<string, string> {
  return new Map(
    [...blockAt(css, head).matchAll(/([a-z-]+)\s*:\s*([^;]+);/gu)].map((found) => [
      found[1] ?? '',
      (found[2] ?? '').trim(),
    ]),
  );
}

/**
 * The width of the card's content box on a screen `screen` pixels wide, its content as wide as
 * `content` would be unbroken: a flex item's size from its `flex` (or `width`), capped by its
 * `max-width`, shrunk to the room left by its margins and padding; its content's width where it
 * has no size of its own.
 */
function cardContent(screen: number, content: number): number {
  const sheet = clientSheet('pages.css');
  const values = themeTokens();
  const body = declarations(sheet, /body\.short\s*\{/u);
  const card = declarations(sheet, /body\.short main\s*\{/u);
  expect(body.get('display')).toBe('flex');
  expect(body.get('flex-direction') ?? 'row').toBe('row');
  const [, side = '0'] = (card.get('margin') ?? '0').split(/\s+/u);
  const [, across = '0'] = (card.get('padding') ?? '0').split(/\s+/u);
  const room = screen - 2 * cssPixels(side, values) - 2 * cssPixels(across, values);
  const flex = (card.get('flex') ?? '').split(/\s+/u);
  const basis =
    flex.length === 3 && flex[2] !== 'auto'
      ? cssPixels(flex[2] ?? '0', values)
      : card.has('width') && card.get('width') !== 'auto'
        ? card.get('width') === '100%'
          ? room
          : cssPixels(card.get('width') ?? '0', values)
        : content;
  const shrinks = flex.length !== 3 || flex[1] !== '0';
  const most = card.has('max-width') ? cssPixels(card.get('max-width') ?? '0', values) : Infinity;
  const sized = Math.min(basis, most);
  return shrinks ? Math.min(sized, room) : sized;
}

describe("the short pages' card (plan 8M-15, P1)", () => {
  it('is the full 480 pixels on a wide screen, however little it holds', () => {
    expect(cardContent(1280, 200)).toBe(480);
    expect(cardContent(1280, 900)).toBe(480);
    expect(cardContent(560, 120)).toBe(480);
  });

  it('is narrower on a narrow screen, the 16 pixel gutters kept', () => {
    // 360 less two gutters of 16 and two paddings of 20.
    expect(cardContent(360, 100)).toBe(288);
  });
});
