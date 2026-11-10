import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Plan 8M-11C, S30: each layer of the region editor is clustered by the same grid, each cluster at
// the mean of its places, so the clusters of gyms, PokéStops, Power Spots and Wayfarer gyms of one
// cell sit near each other. Each layer's is moved apart from the others' (seen stacked in the
// preview), as `editor.css` places them.

const CSS = readFileSync(path.resolve(import.meta.dirname, 'client', 'editor.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//gu,
  '',
);
const LAYERS = ['gyms', 'stops', 'powerspots', 'wayfarer-gyms'];
/** The clusters' circle (`iconSize` of `editor-places.ts`). */
const CIRCLE = 34;

/** Where a layer's clusters are moved from the cell's middle, by `translate`, in pixels. */
function offset(layer: string): { x: number; y: number } | undefined {
  const rule = new RegExp(`\\.cluster\\.places-${layer}\\s*\\{([^}]*)\\}`, 'u').exec(CSS);
  const found = /translate:\s*(-?\d+)px\s+(-?\d+)px/u.exec(rule?.[1] ?? '');
  return found ? { x: Number(found[1]), y: Number(found[2]) } : undefined;
}

describe("the editor's clusters of one cell", () => {
  it('sit apart by layer, overlapping by less than a third of a circle', () => {
    const offsets = LAYERS.map((layer) => {
      const found = offset(layer);
      expect(found, layer).toBeDefined();
      return found ?? { x: 0, y: 0 };
    });
    for (const [i, a] of offsets.entries()) {
      for (const b of offsets.slice(i + 1)) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual((CIRCLE * 2) / 3);
      }
    }
  });
});
