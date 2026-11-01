import { describe, expect, it } from 'vitest';
import { blockAt, clientSheet, motionBlock } from '../../test/support/stylesheets.js';

/** Matt's small things from the staging of 8M-15 (2026-10-30), read from the stylesheets. */
describe("the map's look", () => {
  it("runs a tall popup's scroll bar on the popup's own color, not the browser's white track", () => {
    const content = blockAt(clientSheet('map.css'), /\.leaflet-popup-content\s*\{/u);
    expect(content).toMatch(/scrollbar-color:\s*var\(--muted\)\s+transparent;/u);
  });

  it("draws the flow over a train's done legs as faint as they are, only where motion is welcome", () => {
    const motion = motionBlock(clientSheet('map.css'), '.train-flow');
    expect(blockAt(motion, /\.train-flow-line\.train-flow-done\s*\{/u)).toContain(
      'stroke-opacity: var(--train-done);',
    );
  });

  it("draws a train's flow in the dark set's own color: dark dashes on the orange, not white", () => {
    const flow = (css: string) => /--train-flow:\s*([^;]+);/u.exec(css)?.[1];
    const sheet = clientSheet('theme.css');
    const dark = blockAt(sheet, /@media\s*\(prefers-color-scheme:\s*dark\)/u);
    expect(flow(sheet)).toBe('rgba(255, 255, 255, 0.9)');
    expect(flow(dark)).toBe('rgba(30, 31, 34, 0.9)');
  });
});
