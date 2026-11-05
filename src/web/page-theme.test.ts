import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The pages' look as named values (plan 8M-6): every colour is a custom property of
 * `src/web/client/theme.css`, the stylesheets use them, and the colours Leaflet draws come
 * through `theme.ts` from the same properties. Read from the sources, as a restyle would touch
 * them.
 */

const CLIENT = path.resolve(import.meta.dirname, 'client');
const read = (file: string): string => readFileSync(path.join(CLIENT, file), 'utf8');
/** Block comments blanked, their line breaks kept (so that a line number stays true). */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//gu, (comment) => comment.replace(/[^\n]/gu, ''));

/** Every file of the client folder and the folders in it, by its path from there (`/`). */
const files = readdirSync(CLIENT, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) =>
    path.relative(CLIENT, path.join(entry.parentPath, entry.name)).replace(/\\/gu, '/'),
  );

/**
 * Colours by name: the usual ones, which a restyle could write in place of a property.
 * `transparent`, `inherit`, `currentColor` and `none` are no colour of the theme and stay allowed.
 */
const NAMED = [
  'black',
  'white',
  'gray',
  'grey',
  'silver',
  'red',
  'maroon',
  'crimson',
  'orange',
  'gold',
  'yellow',
  'olive',
  'lime',
  'green',
  'teal',
  'cyan',
  'aqua',
  'blue',
  'navy',
  'indigo',
  'purple',
  'violet',
  'magenta',
  'fuchsia',
  'pink',
  'brown',
];
const WRITTEN = String.raw`#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|color-mix)\(`;
const NAME = `(?:${NAMED.join('|')})`;
/** A colour in a stylesheet's value: hex, a colour function or a named colour, anywhere. */
const COLOUR = new RegExp(String.raw`${WRITTEN}|(?<![\w-])${NAME}(?![\w-])`, 'iu');
/**
 * A colour in a text of TypeScript: hex or a colour function anywhere; a named colour as the
 * whole text, as Leaflet's options take one (the page's sentences may name the colours a shape
 * is drawn in: "shown in red").
 */
const COLOUR_TEXT = new RegExp(String.raw`${WRITTEN}|^\s*${NAME}\s*$`, 'iu');

/** The declarations of a stylesheet, block by block: `[selector, property, value]`. */
function declarations(css: string): [string, string, string][] {
  const found: [string, string, string][] = [];
  for (const block of withoutComments(css).matchAll(/([^{}]*)\{([^{}]*)\}/gu)) {
    const selector = (block[1] ?? '').trim();
    for (const declaration of (block[2] ?? '').split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      found.push([
        selector,
        declaration.slice(0, colon).trim(),
        declaration.slice(colon + 1).trim(),
      ]);
    }
  }
  return found;
}

/** A value of a stylesheet without the custom properties it names (`var(--red)` is no colour). */
const withoutProperties = (value: string): string => value.replace(/--[\w-]+/gu, '');

/**
 * The texts of a TypeScript file's string and template literals (the parts of a template
 * between its `${…}` too), each with its line: what could hold a colour Leaflet or the page
 * would draw. Comments and code are no texts.
 */
function texts(file: string): { line: number; text: string }[] {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const found: { line: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    // The one colour of the code: what a property the stylesheet lacks is drawn in.
    if (
      file === 'theme.ts' &&
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === 'MISSING_COLOUR'
    ) {
      return;
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push({ line: line + 1, text: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("the pages' look", () => {
  it('finds a colour anywhere in a text or a value, and allows the keywords that are none', () => {
    const anywhere = [
      '#c0392b',
      '1px solid #fff',
      '0 0 4px rgba(0, 0, 0, 0.3)',
      'background: hsl(120 50% 50%)',
      'oklch(70% 0.1 200)',
      'color-mix(in srgb, var(--a) 50%, transparent)',
    ];
    for (const text of [...anywhere, 'white', ' Red ']) {
      expect(COLOUR.test(text), text).toBe(true);
      expect(COLOUR_TEXT.test(text), text).toBe(true);
    }
    expect(COLOUR.test('1px solid red')).toBe(true);
    expect(COLOUR_TEXT.test('2 outlines cannot be saved (shown in red).')).toBe(false);
    for (const text of ['transparent', 'inherit', 'currentColor', 'none', 'Reported', 'redraw']) {
      expect(COLOUR.test(text), text).toBe(false);
      expect(COLOUR_TEXT.test(text), text).toBe(false);
    }
    expect(COLOUR.test(withoutProperties('1px solid var(--red)'))).toBe(false);
  });

  it('writes no colour in the TypeScript of the pages: Leaflet draws theme.css colours', () => {
    const sources = files.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
    expect(sources).toContain('theme.ts');
    const written = sources.flatMap((file) =>
      texts(file).flatMap(({ line, text }) => (COLOUR_TEXT.test(text) ? [`${file}:${line}`] : [])),
    );
    expect(written).toEqual([]);
  });

  it('writes colours in the stylesheets only as custom properties of theme.css', () => {
    const sheets = files.filter((file) => file.endsWith('.css') && file !== 'theme.css');
    expect(sheets).toEqual(
      expect.arrayContaining([
        'map.css',
        'editor.css',
        'userscript.css',
        'pages.css',
        'history.css',
      ]),
    );
    for (const file of sheets) {
      const written = declarations(read(file)).filter(([, , value]) =>
        COLOUR.test(withoutProperties(value)),
      );
      expect(written, file).toEqual([]);
    }
    const theme = declarations(read('theme.css'));
    expect(theme.length).toBeGreaterThan(0);
    for (const [selector, property] of theme) {
      // The light set, and the dark one where the page is not forced light (plan 8M-13, S10).
      expect([':root', ":root:not([data-theme='light'])"], property).toContain(selector);
      expect(property).toMatch(/^--[a-z0-9-]+$/u);
    }
    // The map loads it, and the editor's stylesheet is loaded beside the map's (plan 8M-10).
    expect(read('map.css')).toMatch(/@import '\.\/theme\.css';/u);
  });

  it('names the same values in its light set and its dark set (plan 8M-7)', () => {
    const css = withoutComments(read('theme.css'));
    // Dark where the page is not forced light; the build adds it for a page forced dark (plan
    // 8M-13, S10, `scripts/web/forced-dark.ts`).
    const dark =
      /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)\s*\{([^{}]*)\}\s*\}/u.exec(
        css,
      );
    expect(dark, 'a dark set in @media (prefers-color-scheme: dark)').not.toBeNull();
    const light = /^\s*:root\s*\{([^{}]*)\}/u.exec(css);
    expect(light, 'the light set first, in :root').not.toBeNull();
    const names = (block: string): string[] =>
      declarations(`:root {${block}}`)
        .map(([, property]) => property)
        .sort();
    const lightNames = names(light?.[1] ?? '');
    expect(lightNames.length).toBeGreaterThan(40);
    expect(names(dark?.[1] ?? '')).toEqual(lightNames);
  });

  it('is loaded by the stylesheet of every page Pine serves (plan 8M-7)', () => {
    for (const sheet of ['map.css', 'userscript.css', 'pages.css', 'history.css']) {
      expect(read(sheet), sheet).toMatch(/@import '\.\/theme\.css';/u);
    }
  });

  it("takes the editor's sheet as an add-on of the map's, loaded beside it (plan 8M-10)", () => {
    // Its rules use the map's theme; importing it (or Leaflet's) again would load them twice.
    const editor = withoutComments(read('editor.css'));
    expect(editor).not.toMatch(/@import '\.\/(?:map|theme)\.css';/u);
    expect(editor).not.toMatch(/@import 'leaflet\//u);
  });

  it('defines every property the pages use or draw with', () => {
    const defined = new Set(declarations(read('theme.css')).map(([, property]) => property));
    const used = new Set([
      ...files
        .filter((file) => file.endsWith('.css'))
        .flatMap((file) =>
          [...read(file).matchAll(/var\((--[a-z0-9-]+)\)/gu)].map((match) => match[1] ?? ''),
        ),
      ...[...read('theme.ts').matchAll(/'(--[a-z0-9-]+)'/gu)].map((match) => match[1] ?? ''),
    ]);
    expect(used.size).toBeGreaterThan(20);
    expect([...used].filter((property) => !defined.has(property))).toEqual([]);
  });
});
