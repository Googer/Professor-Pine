import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The facts the live map shares with the Discord side (one source for every fact, Matt
 * 2026-10-25): every module of `src/domain/` and `src/render/` the map's page imports for what
 * it runs (not only for types) imports nothing at run time itself, so that the page's bundle and
 * its type check (no Node) take it whole and never a copy. The map's sources are found from its
 * entry, `main.ts`, by their imports (the region editor's are left out); read as the bundle would.
 */

const SRC = path.resolve(import.meta.dirname, '..');
const CLIENT = path.join(SRC, 'web', 'client');

/** The relative imports of a source that are not for types alone, as resolved `.ts` paths. */
function runtimeImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const match of text.matchAll(
    /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gmu,
  )) {
    if (match[1]) continue;
    const target = path.resolve(path.dirname(file), (match[2] ?? '').replace(/\.js$/u, '.ts'));
    if (existsSync(target)) found.push(target);
  }
  return found;
}

/** The map page's own sources: from `main.ts`, every client module it reaches. */
function mapSources(): string[] {
  const seen = new Set<string>();
  const queue = [path.join(CLIENT, 'main.ts')];
  while (queue.length > 0) {
    const file = queue.pop() ?? '';
    if (seen.has(file)) continue;
    seen.add(file);
    for (const target of runtimeImports(file)) {
      if (target.startsWith(CLIENT + path.sep)) queue.push(target);
    }
  }
  return [...seen];
}

describe("the shared modules the map's page imports (plan 8M-7)", () => {
  it("import nothing of Pine's own at run time", () => {
    const sources = mapSources();
    expect(sources.length).toBeGreaterThan(10);
    // The editor's own sources are not the map's.
    expect(sources.some((file) => file.endsWith(`${path.sep}editor.ts`))).toBe(false);
    const shared = new Set(
      sources
        .flatMap(runtimeImports)
        .filter((target) =>
          [path.join(SRC, 'domain'), path.join(SRC, 'render')].some((root) =>
            target.startsWith(root + path.sep),
          ),
        ),
    );
    expect([...shared].map((file) => path.relative(SRC, file))).toEqual(
      expect.arrayContaining([path.join('domain', 'party', 'raid-stage.ts')]),
    );
    for (const file of shared) {
      // Nothing of Pine's own at run time (a package the bundle takes whole, such as
      // fastest-levenshtein of `search/text.ts`, is no second implementation).
      expect(runtimeImports(file), path.relative(SRC, file)).toEqual([]);
    }
  });
});

describe("the wild spawns' modules of the map's page (review S7)", () => {
  it('are in no import cycle with the list of what is on', () => {
    /** Every client module `from` reaches at run time. */
    const reached = (from: string): Set<string> => {
      const seen = new Set<string>();
      const queue = runtimeImports(from);
      while (queue.length > 0) {
        const file = queue.pop() ?? '';
        if (seen.has(file) || !file.startsWith(CLIENT + path.sep)) continue;
        seen.add(file);
        queue.push(...runtimeImports(file));
      }
      return seen;
    };
    for (const name of ['what-is-on.ts', 'spawns.ts', 'spawn-names.ts']) {
      const file = path.join(CLIENT, name);
      if (!existsSync(file)) continue;
      expect(reached(file).has(file), name).toBe(false);
    }
  });
});
