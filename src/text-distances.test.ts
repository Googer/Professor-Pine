import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every distance Pine says to members or staff goes through `distanceWords(…, settings
 * .distanceUnits)` (`src/render/distance-words.ts`, Matt 2026-10-25): no unit of distance is
 * worded by hand in the string and template literals of what speaks (`src/commands`,
 * `src/render`, `src/components`, and the web pages' `src/web/client`: 8M-7 review fix 8).
 * Comments and identifiers are no texts.
 */

const SRC = import.meta.dirname;
const SPEAKING = ['commands', 'render', 'components', 'web/client'];

/** A unit of distance in words: meters, kilometers (either spelling), or a number with m or km. */
const UNIT = /\b(?:met(?:er|re)s?|kilomet(?:er|re)s?)\b|\d\s?k?m\b/iu;

/** Texts that are no distance said to anybody, by file (from `src/`) and exact text. */
const ALLOWED: Record<string, { texts: string[]; why: string }> = {
  'render/distance-words.ts': { texts: [' m', ' km'], why: 'the one wording itself' },
  'render/wayfarer-report.ts': {
    texts: ['gym,name,what,wayspot,title,kind,metres,cell,region'],
    why: "the columns of the Wayfarer report's CSV file, a file format (CLAUDE.md)",
  },
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
function texts(file: string): { line: number; text: string }[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(path.join(SRC, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: { line: number; text: string }[] = [];
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
        found.push({ line: line + 1, text: node.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('distances in what Pine says (round 2)', () => {
  it('finds a unit of distance worded by hand, and nothing else', () => {
    for (const text of ['within 10 m of that place', '500 m away', 'in 2 km', 'metres']) {
      expect(UNIT.test(text), text).toBe(true);
    }
    for (const text of ['Make the meetup', 'in 5 min', 'Moveset', '2 more']) {
      expect(UNIT.test(text), text).toBe(false);
    }
  });

  it('words no unit of distance by hand outside distanceWords', () => {
    expect(sources.length).toBeGreaterThan(50);
    const found = sources.flatMap((file) =>
      texts(file)
        .filter(({ text }) => UNIT.test(text) && !(ALLOWED[file]?.texts.includes(text) ?? false))
        .map(({ line, text }) => `${file}:${line} ${text}`),
    );
    expect(found).toEqual([]);
  });
});
