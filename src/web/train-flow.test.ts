import { describe, expect, it } from 'vitest';
import {
  clientSheet,
  cssPixels,
  motionBlock,
  themeTokens,
} from '../../test/support/stylesheets.js';
import { FLOW_CYCLE_MS, flowDelay } from './client/train-flow.js';

/**
 * A train's flow (plan 8M-13, T1): the dashes over its legs ahead move along its way, slowly,
 * only where the device does not ask for less motion, and the loop of the animation does not
 * jump. Read from the stylesheets, as the browser reads them.
 */

describe("a train's flow (plan 8M-13, T1)", () => {
  it('reads lengths through the tokens', () => {
    const values = new Map([
      ['--a', '8px'],
      ['--b', '4px'],
    ]);
    expect(cssPixels('calc(-1 * (var(--a) + var(--b)))', values)).toBe(-12);
  });

  it('moves the dashes by one whole period, forward along the line, in a loop', () => {
    const css = clientSheet('map.css');
    const values = themeTokens();
    const keyframes = /@keyframes\s+train-flow\s*\{([\s\S]*?\})\s*\}/u.exec(css)?.[1] ?? '';
    const offsets = [...keyframes.matchAll(/stroke-dashoffset:\s*([^;]+);/gu)].map((match) =>
      cssPixels(match[1] ?? '', values),
    );
    const motion = motionBlock(css, '.train-flow');
    const pattern = /\.train-flow\s*\{[^}]*stroke-dasharray:\s*([^;]+);/u.exec(motion)?.[1] ?? '';
    const period = pattern
      .split(/\s+(?![^(]*\))/u)
      .map((part) => cssPixels(part, values))
      .reduce((total, part) => total + part, 0);
    expect(period).toBeGreaterThan(0);
    // From 0 to minus a period: the dashes run from the line's first point toward its last.
    expect(offsets).toEqual([0, -period]);
    expect(motion).toMatch(
      /\.train-flow\s*\{[^}]*animation:\s*train-flow\s+var\(--flow-time\)\s+linear\s+infinite/u,
    );
    expect(values.get('--flow-time')).toBe('2.5s');
    // The page sets each path's delay by the same cycle (fix round 1, R1-3: `flowDelay`).
    expect(FLOW_CYCLE_MS).toBe(Number.parseFloat(values.get('--flow-time') ?? '') * 1000);
  });

  // Fix round 1 (R1-3): a path drawn anew starts where the flow is by the clock.
  it("starts a path's flow where the clock says, the same for every path at one moment", () => {
    expect(flowDelay(0)).toBe('0ms');
    expect(flowDelay(FLOW_CYCLE_MS * 1_000 + 1_234)).toBe('-1234ms');
    expect(flowDelay(FLOW_CYCLE_MS - 1)).toBe(`-${String(FLOW_CYCLE_MS - 1)}ms`);
  });

  it('moves nothing and hides the flow line where the device asks for less motion', () => {
    const css = clientSheet('map.css');
    const motion = motionBlock(css, '.train-flow');
    // Every rule of the flow but the hidden line's is inside the media query.
    const outside = css.replace(motion, '');
    expect(outside).not.toMatch(/animation:\s*train-flow/u);
    expect(outside).toMatch(/\.train-flow-line\s*\{[^}]*visibility:\s*hidden/u);
    expect(motion).toMatch(/\.train-flow-line\s*\{[^}]*visibility:\s*visible/u);
  });
});
