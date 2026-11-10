import { describe, expect, it } from 'vitest';
import {
  clientSheet,
  cssPixels,
  motionBlock,
  themeTokens,
} from '../../test/support/stylesheets.js';

/**
 * Where the page answers (plan 8M-13, A1, A2): the lines that carry an answer keep its line
 * breaks, and the phone card moves for a refusal with a small upward bounce, only where the device
 * does not ask for less motion. Read from the stylesheets, as the browser reads them.
 */

/** The value of `property` in the rule of exactly `selector` (the first such rule), if any. */
const valueIn = (css: string, selector: string, property: string): string | undefined => {
  for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/gu)) {
    const selectors = (rule[1] ?? '').split(',').map((one) => one.trim());
    if (!selectors.includes(selector)) continue;
    const found = new RegExp(String.raw`(?:^|;)\s*${property}\s*:\s*([^;]+)`, 'u').exec(
      rule[2] ?? '',
    );
    if (found) return found[1]?.trim();
  }
  return undefined;
};

describe('the lines that answer (plan 8M-13, A1)', () => {
  it('keep the line breaks of an answer: the notice band, the answer line, a form’s answer', () => {
    const css = clientSheet('map.css');
    for (const selector of ['#notice', '.post .press-answer', '.form-answer']) {
      expect(valueIn(css, selector, 'white-space'), selector).toBe('pre-line');
    }
  });
});

describe('the phone card nudged (plan 8M-13, A2)', () => {
  it('bounces up and back once, by --nudge-distance over --shake-time', () => {
    const css = clientSheet('map.css');
    const values = themeTokens();
    const keyframes = /@keyframes\s+nudge\s*\{([\s\S]*?\})\s*\}/u.exec(css)?.[1] ?? '';
    /** Each step of the keyframes (`0%`, `40%`, …) by how far up it moves the card. */
    const steps = new Map<string, number>();
    for (const rule of keyframes.matchAll(/([^{}]*)\{[^{}]*translateY\(([^;]+)\);[^{}]*\}/gu)) {
      const moved = cssPixels((rule[2] ?? '').replace(/\)$/u, ''), values);
      for (const step of (rule[1] ?? '').split(',')) steps.set(step.trim(), moved);
    }
    // Back where it was at both ends; up by the distance on the way.
    expect(steps.get('0%')).toBe(0);
    expect(steps.get('100%')).toBe(0);
    expect(Math.min(...steps.values())).toBe(-cssPixels('var(--nudge-distance)', values));
    expect(values.get('--nudge-distance')).toBe('6px');
    const motion = motionBlock(css, '.party-card.nudge');
    expect(valueIn(motion, '.party-card.nudge', 'animation')).toBe(
      'nudge var(--shake-time) ease-out 1',
    );
    expect(css.replace(motion, '')).not.toMatch(/animation:\s*nudge/u);
  });
});
