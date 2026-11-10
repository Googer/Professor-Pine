import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtAssets } from './web.js';

describe('builtAssets', () => {
  let root: string | undefined;

  it('makes a folder of its own with the bundle for the test', () => {
    const assets = builtAssets();
    root = path.dirname(assets.dir);
    for (const file of [
      assets.manifest?.map.script,
      assets.manifest?.editor.script,
      assets.manifest?.editor.worker,
    ]) {
      expect(existsSync(path.join(assets.dir, file ?? ''))).toBe(true);
    }
  });

  it('removes that folder when the test that made it is over', () => {
    expect(root).toBeDefined();
    expect(existsSync(root ?? '')).toBe(false);
  });
});
