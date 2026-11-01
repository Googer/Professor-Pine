import { readFileSync } from 'node:fs';
import path from 'node:path';
import { transform } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { blockAt } from '../../test/support/stylesheets.js';
import { checkForcedDark, FORCED_DARK, withForcedDark } from './forced-dark.js';

/**
 * The page's dark rules in one place (plan 8M-13, S10): each `@media (prefers-color-scheme: dark)`
 * block of the page's stylesheets is written once, for a page whose theme is not forced light;
 * the build adds the same rules for a page forced dark (`data-theme="dark"`), whatever the device.
 */

const CLIENT = path.resolve(import.meta.dirname, '../../src/web/client');
const read = (file: string): string => readFileSync(path.join(CLIENT, file), 'utf8');

/** The rules of a stylesheet's text, as selector and declarations, spaces made one. */
const rules = (css: string): Array<[string, string]> =>
  [...css.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((rule) => [
    (rule[1] ?? '').replace(/\s+/gu, ' ').trim(),
    (rule[2] ?? '').replace(/\s+/gu, ' ').trim(),
  ]);

describe('the dark rules for a page forced dark (plan 8M-13, S10)', () => {
  it('adds a copy of each dark block for a page forced dark, after it, outside the query', () => {
    const css = [
      '.a { color: var(--x); }',
      '@media (prefers-color-scheme: dark) {',
      "  :root:not([data-theme='light']) {",
      '    --x: #000;',
      '  }',
      '',
      "  :root:not([data-theme='light']) .b,",
      "  :root:not([data-theme='light']) .c {",
      '    filter: none;',
      '  }',
      '}',
      '.d { color: var(--x); }',
    ].join('\n');
    const built = withForcedDark(css);
    expect(built.startsWith(css.slice(0, css.indexOf('.d')))).toBe(true);
    expect(built.trimEnd().endsWith('.d { color: var(--x); }')).toBe(true);
    const added = built.slice(css.indexOf('.d') - 1, built.lastIndexOf('.d'));
    expect(rules(added)).toEqual([
      [`${FORCED_DARK}`, '--x: #000;'],
      [`${FORCED_DARK} .b, ${FORCED_DARK} .c`, 'filter: none;'],
    ]);
    // The media query is left as it was.
    expect(built).toContain('@media (prefers-color-scheme: dark) {');
  });

  it('refuses a dark rule that a forced Light would not turn off', () => {
    const css = '@media (prefers-color-scheme: dark) {\n  :root {\n    --x: #000;\n  }\n}\n';
    expect(() => withForcedDark(css)).toThrow(/:root/u);
    const half = [
      '@media (prefers-color-scheme: dark) {',
      "  :root:not([data-theme='light']) .b, .c {",
      '    filter: none;',
      '  }',
      '}',
    ].join('\n');
    expect(() => withForcedDark(half)).toThrow(/\.c/u);
  });

  it('leaves a stylesheet without dark rules as it is', () => {
    expect(withForcedDark('.a { color: red; }\n')).toBe('.a { color: red; }\n');
  });

  it("gives the page's own dark blocks their forced copies, rule for rule", () => {
    for (const file of ['theme.css', 'map.css', 'editor.css']) {
      const source = read(file);
      const dark = blockAt(source, /@media\s*\(prefers-color-scheme:\s*dark\)/u);
      expect(dark, file).not.toBe('');
      const built = withForcedDark(source);
      // The rules the build added (a rule of the source may name a forced Dark itself: the
      // browser's own parts' `color-scheme`, `map.css`).
      const own = new Set(rules(source).map((rule) => rule.join('{')));
      const forced = rules(built).filter(
        (rule) => rule[0].includes(FORCED_DARK) && !own.has(rule.join('{')),
      );
      expect(rules(built).length, file).toBe(rules(source).length + forced.length);
      const media = rules(
        [...source.matchAll(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/gu)]
          .map((match) => blockAt(source.slice(match.index), /@media/u))
          .join('\n'),
      ).map(([selector, body]): [string, string] => [
        selector.replaceAll(":root:not([data-theme='light'])", FORCED_DARK),
        body,
      ]);
      expect(forced, file).toEqual(media);
      expect(forced.length, file).toBeGreaterThan(0);
    }
  });
});

// Review BR-6 of the small pass: the build fails, rather than ship a map that ignores a chosen
// Dark, when its built stylesheet lacks the forced copies its sources call for.
describe("the build's check of the pages' forced-dark rules", () => {
  /** A page's stylesheets, minified together as the build does, the files of `forced` forced. */
  const built = async (files: readonly string[], forced: readonly string[]): Promise<string> =>
    (
      await transform(
        files
          .map((file) => (forced.includes(file) ? withForcedDark(read(file)) : read(file)))
          .join('\n'),
        { loader: 'css', minify: true },
      )
    ).code;
  /** The check of a page built so. */
  const check = async (files: readonly string[], forced: readonly string[]) => {
    const css = await built(files, forced);
    return () => {
      checkForcedDark(files[0] ?? '', files.map(read), css);
    };
  };
  // Each page's stylesheet with the sources it bundles (`pages.css` and `userscript.css` import
  // `theme.css`; the editor's add-on does not).
  const pages = [
    ['map.css', 'theme.css'],
    ['editor.css'],
    ['pages.css', 'theme.css'],
    ['userscript.css', 'theme.css'],
  ] as const;

  it('passes each page built with them', async () => {
    for (const files of pages) expect(await check(files, files), files[0]).not.toThrow();
  });

  it('refuses each page with a dark block built without them', async () => {
    for (const files of pages) {
      expect(await check(files, []), files[0]).toThrow(
        new RegExp(files[0].replace('.', '\\.'), 'u'),
      );
    }
  });

  // Re-review N1: map.css writes one forced rule by hand, which must not stand in for a missing
  // copy; every dark selector needs its own twin.
  it("refuses the map built with only one of its sources' copies", async () => {
    expect(await check(['map.css', 'theme.css'], ['map.css'])).toThrow(/data-theme/u);
    expect(await check(['map.css', 'theme.css'], ['theme.css'])).toThrow(/data-theme/u);
  });

  it('asks nothing of sources without a dark block', () => {
    expect(() => {
      checkForcedDark('page', ['.a { color: red; }'], '.a{color:red}');
    }).not.toThrow();
  });
});
