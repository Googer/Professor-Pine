import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Wayfarer export tool is private (Matt, 2026-11-01): its code lives in its own private
 * repository, and this one keeps only the export format and the geometry
 * (`packages/wayspot-core`) and the page that hands the built file out. The folders the tool once
 * had here stay gone, and the folder its built file is deployed to stays out of git.
 */

const ROOT = path.join(import.meta.dirname, '..');

describe('the Wayfarer export tool stays out of this repository', () => {
  it.each(['userscript', 'scripts/userscript'])('has no folder %s', (folder) => {
    expect(existsSync(path.join(ROOT, folder))).toBe(false);
  });

  it('keeps the deployed tool out of git', () => {
    const ignored = readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/u);
    expect(ignored.some((line) => /^\/?wayspot-tool\/?$/u.test(line))).toBe(true);
  });
});
