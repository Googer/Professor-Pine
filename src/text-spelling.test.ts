import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Everything Pine says is in American spelling (Matt, 2026-10-18; CLAUDE.md, "Text"): the
 * string and template literals of every source file under `src/` are read and a British form
 * in them is refused. Comments and identifiers are no texts and keep their spelling.
 */

const SRC = import.meta.dirname;

/** British forms, as words (any case). */
const BRITISH = new RegExp(
  [
    String.raw`\bcentr(?:e|es|ed|ing)\b`,
    String.raw`(?:\b|kilo)metres?\b`,
    String.raw`colour`,
    String.raw`\bcancell(?:ed|ing)\b`,
    String.raw`behaviour`,
    String.raw`neighbour`,
    String.raw`favourite`,
    String.raw`\bgrey`,
    String.raw`\bcatalogue`,
    String.raw`\blicence`,
    String.raw`\b(?:organ|recogn|real|apolog|minim|priorit|normal|summar|final)is(?:e|es|ed|ing|ation|ations)\b`,
    String.raw`[a-z]isations?\b`,
  ].join('|'),
  'iu',
);

/**
 * Texts that are no words for members or staff and keep their spelling, by file (from `src/`,
 * `/`) and the exact text. Keep it short: each entry says why it is not shown as it stands.
 */
const ALLOWED: Record<string, { texts: string[]; why: string }> = {
  'domain/history/party-history.ts': {
    texts: ['cancelled'],
    why: "a party history's ending, stored in the history's rows",
  },
  'domain/history/activity.ts': {
    texts: ['cancelled'],
    why: "the history's ending the activity heatmap does not count (plan 8H-4), as stored",
  },
  'domain/history/boards.ts': {
    texts: ['cancelled'],
    why: "the history's ending of a raid that credits nobody on the boards (plan 8H-6), as stored",
  },
  'services/party-service.ts': {
    texts: ['cancelled'],
    why: "the history's ending of a party somebody closed (`PartyEnd`), stored as above",
  },
  'domain/ocr/raid-screen.ts': {
    texts: ['centre'],
    why: "the countdown's place on the screen, kept in the screenshot records of the review folder",
  },
  'domain/ocr/screenshot-report.ts': {
    texts: ['centre'],
    why: 'the same stored place, read back',
  },
  'domain/ocr/panes.ts': {
    texts: ['centre'],
    why: "the same stored place, which tells an egg's pane (plan 7P)",
  },
  'domain/search/gym-lookup.ts': {
    texts: ['neighbouring'],
    why: "the gym search's place of a hit (`GymPlace`), a value of the code, never shown",
  },
  'render/wayfarer-report.ts': {
    texts: ['gym,name,what,wayspot,title,kind,metres,cell,region'],
    why: "the columns of the Wayfarer report's CSV file, a file format (CLAUDE.md)",
  },
};

/** Every source file under `src/` that is no test and not generated, by its path from there. */
const sources = readdirSync(SRC, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(SRC, path.join(entry.parentPath, entry.name)).replace(/\\/gu, '/'))
  .filter(
    (file) =>
      file.endsWith('.ts') &&
      !file.endsWith('.test.ts') &&
      file !== 'db/types.ts' &&
      !file.startsWith('db/baseline/'),
  );

/**
 * Whether a literal names code rather than says something: a module's path (`catalogue.js`) or
 * a literal in a type (`Pick<…, 'catalogue'>`, a union of stored values). Those are identifiers.
 */
function namesCode(node: ts.Node): boolean {
  const { parent } = node;
  if (
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === node
  ) {
    return true;
  }
  if (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return true;
  }
  return ts.isLiteralTypeNode(parent);
}

/** The texts of a file's string and template literals (a template's parts too), with lines. */
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
      if (namesCode(node)) return;
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push({ line: line + 1, text: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('American spelling in what Pine says', () => {
  it('finds the British forms as words and leaves the American ones', () => {
    for (const text of [
      'Within 40 metres of the gym',
      'Centre of the map',
      'centred on the gym',
      'Change the colour',
      'Raid cancelled.',
      'cancelling the train',
      'odd behaviour',
      'a neighbouring region',
      'Your favourite',
      'grey',
      'the catalogue',
      'licence',
      'Recognised',
      'organise',
      'prioritises',
      'summarising',
      'finalised',
      'normalisation',
      'organisation',
      '2 kilometres',
    ]) {
      expect(BRITISH.test(text), text).toBe(true);
    }
    for (const text of [
      'Within 40 meters of the gym',
      'Center of the map',
      'centered',
      'color',
      'Raid canceled.',
      'cancellation',
      'behavior',
      'neighboring',
      'favorite',
      'gray',
      'catalog',
      'license',
      'Recognized',
      'organize',
      'realistic',
      'finalist',
      'Centered',
      'diameters',
      'parameter',
    ]) {
      expect(BRITISH.test(text), text).toBe(false);
    }
  });

  it('writes no British spelling in the texts of the sources', () => {
    expect(sources).toContain('index.ts');
    expect(sources.length).toBeGreaterThan(100);
    const british = sources.flatMap((file) =>
      texts(file).flatMap(({ line, text }) =>
        BRITISH.test(text) && !(ALLOWED[file]?.texts.includes(text) ?? false)
          ? [`${file}:${line}: ${text}`]
          : [],
      ),
    );
    expect(british).toEqual([]);
  });

  it('allows only texts that are still there', () => {
    const stale = Object.entries(ALLOWED).flatMap(([file, { texts: allowed }]) => {
      const present = sources.includes(file) ? texts(file).map(({ text }) => text) : [];
      return allowed.filter((text) => !present.includes(text)).map((text) => `${file}: ${text}`);
    });
    expect(stale).toEqual([]);
  });
});
