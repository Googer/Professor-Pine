import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every time left or countdown the live map says goes through `durationWords`, and every stamp of
 * Discord's through `relativeStamp` (`src/render/duration-words.ts`, plan 8M-11A, S19, S28): no
 * minutes or hours are worded by hand in the string and template literals of the web pages
 * (`src/web/client`), and minutes are never "m", which is meters. As `text-distances.test.ts`
 * does for distances. Comments and identifiers are no texts.
 */

const SRC = import.meta.dirname;
const SPEAKING = ['web/client'];

/**
 * Minutes or hours in words: "min" or "mins" (not "min-width"), an "m" or "h" right after a
 * number or a substitution (`12m`, `${minutes}m`, `1h 05m`), and written out after a number (`13
 * minutes`, `2 hours`, `1 hr`: review fix F6).
 */
const UNIT = /\bmins?\b(?!-)|^\s*[hm]\b|\d\s?[hm]\b|\d\s*(?:minutes?|hours?|hrs?)\b/u;

/**
 * Minutes or hours written out right after a substitution (`${n} minutes left`, review fix F6):
 * read of the parts of a template after its first.
 */
const AFTER_SUBSTITUTION = /^\s*(?:minutes?|hours?)\b/u;

/** An SVG drawing's path data (`M8 19h2l-1.5 3h-2z`), whose letters are commands, not units. */
const PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa][\d\s.,MmZzLlHhVvCcSsQqTtAa-]*$/u;

/** Texts that are no time said to anybody, by file (from `src/`) and exact text. */
const ALLOWED: Record<string, { texts: string[]; why: string }> = {
  'web/client/editor-view.ts': { texts: [' m²'], why: "a region's area in square meters" },
};

const sources = SPEAKING.flatMap((folder) =>
  readdirSync(path.join(SRC, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(SRC, path.join(entry.parentPath, entry.name)).replace(/\\/gu, '/'),
    )
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts')),
);

/** The texts of a file's string and template literals, with lines; module paths aside. */
function texts(file: string): { line: number; text: string; after: boolean }[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(path.join(SRC, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: { line: number; text: string; after: boolean }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const { parent } = node;
      const modulePath =
        (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
        parent.moduleSpecifier === node;
      if (!modulePath && !ts.isLiteralTypeNode(parent)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        found.push({
          line: line + 1,
          text: node.text,
          after: ts.isTemplateMiddle(node) || ts.isTemplateTail(node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('times in what the map says (plan 8M-11A)', () => {
  it('finds minutes and hours worded by hand, and nothing else', () => {
    for (const text of ['in 13 min', ' min', 'm', 'h ', '30m left', '1h 05m']) {
      expect(UNIT.test(text), text).toBe(true);
    }
    // Review fix F6: written out too, after a number or after a substitution.
    for (const text of ['in 13 minutes', 'in 2 hours', '1 hr', '3hrs']) {
      expect(UNIT.test(text), text).toBe(true);
    }
    for (const text of [' minutes left', ' hours', ' hour ago']) {
      expect(AFTER_SUBSTITUTION.test(text), text).toBe(true);
    }
    expect(AFTER_SUBSTITUTION.test(' going')).toBe(false);
    for (const text of ['(min-width: 1024px)', 'minute', 'Make the meetup', '2 more', 'h3']) {
      expect(UNIT.test(text), text).toBe(false);
    }
  });

  it('words no minutes or hours by hand outside duration-words', () => {
    expect(sources.length).toBeGreaterThan(50);
    const found = sources.flatMap((file) =>
      texts(file)
        .filter(
          ({ text, after }) =>
            (UNIT.test(text) || (after && AFTER_SUBSTITUTION.test(text))) &&
            !PATH_DATA.test(text) &&
            !(ALLOWED[file]?.texts.includes(text) ?? false),
        )
        .map(({ line, text }) => `${file}:${line} ${text}`),
    );
    expect(found).toEqual([]);
  });
});
