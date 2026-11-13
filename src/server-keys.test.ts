import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * A server's values are read through `ServerSettings.of(serverId)` (plan 19A-1, `servers.md`),
 * never from the settings file: outside `src/config/`, which reads the file and makes a server's
 * first values of its keys (`fileDefaults`, `fileChannelNames`), no code reads a server key of
 * the file's settings (`settings.channels`, `config.settings.features`, `settings.web.invites`),
 * as `src/text-distances.test.ts` refuses distances worded by hand. Nor its time zone (plan
 * 19A-2): a server's is `ServerSettings.zoneOf(serverId)`, and the file's, the instance's
 * default, is read only through `instanceZone(settings)` (`src/config/settings.ts`), also by the
 * tools under `scripts/`. The words gym search ignores are not among them yet (plan B moves their
 * readers), nor what the instance allows (`ocr.passive`, `autoAssignRole`).
 */

const SRC = import.meta.dirname;
const ROOT = path.dirname(SRC);

/** The file's keys that are a server's, read as `….settings.<key>`. */
const SERVER_KEYS = new Set([
  'timezone',
  'channels',
  'categories',
  'roles',
  'features',
  'eventsForum',
  'meetupSafety',
  'regionForumSuffix',
  'postNewGyms',
  'regionMapLink',
  'distanceUnits',
]);
/** The keys of the file's `web` that are a server's, read as `….settings.web.<key>`. */
const SERVER_WEB_KEYS = new Set(['memberRole', 'invites']);

/**
 * The folder and the files whose code works on the settings file itself, by the reason (review
 * G6: named one by one, never a whole folder of tools).
 */
const ALLOWED: Record<string, string> = {
  'src/config/': 'reads the file and makes the defaults of a server’s first values of it',
  'src/ops/convert-settings.ts': 'writes the settings file of a legacy installation',
  'src/ops/cutover-check.ts':
    'checks the file’s names in each server before the first start of 2.1, as the fill will find them',
};

/** The bot's code and the tools under `scripts/`, by their path from the checkout. */
const sources = ['src', 'scripts']
  .flatMap((folder) =>
    readdirSync(path.join(ROOT, folder), { recursive: true, withFileTypes: true }),
  )
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(ROOT, path.join(entry.parentPath, entry.name)).replace(/\\/gu, '/'))
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  .filter((file) => !Object.keys(ALLOWED).some((folder) => file.startsWith(folder)));

/**
 * Whether an expression is the file's settings: `settings`, `….settings`, or a call of either
 * (`settings()`, as a tool reads the file lazily).
 */
function isSettings(node: ts.Expression): boolean {
  const bare = ts.isNonNullExpression(node) ? node.expression : node;
  if (ts.isCallExpression(bare)) return isSettings(bare.expression);
  if (ts.isIdentifier(bare)) return bare.text === 'settings';
  return ts.isPropertyAccessExpression(bare) && bare.name.text === 'settings';
}

/** The key an access reads: `a.key`, or `a['key']` with a string; undefined for another. */
function accessed(node: ts.Node): { key: string; expression: ts.Expression } | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return { key: node.name.text, expression: node.expression };
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return { key: node.argumentExpression.text, expression: node.expression };
  }
  return undefined;
}

/**
 * Where a file reads a server key of the settings file: `line: the access`. Also by a string key
 * (`settings['channels']`), destructured (`{ distanceUnits } = settings`, `{ web: { invites } } =
 * settings`), and through a `web` destructured from the settings (`{ web } = settings`, then
 * `web.invites`; review G6).
 */
function serverKeyReads(code: string, file = 'code.ts'): string[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const at = (node: ts.Node, text: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push(`${String(line + 1)}: ${text}`);
  };
  // The names a `web` of the settings is bound to in this file (`const { web } = settings`).
  const webNames = new Set<string>();
  const isWeb = (node: ts.Expression): boolean => {
    const bare = ts.isNonNullExpression(node) ? node.expression : node;
    if (ts.isIdentifier(bare)) return webNames.has(bare.text);
    const inner = accessed(bare);
    return inner?.key === 'web' && isSettings(inner.expression);
  };
  const bindings = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
      const init = node.initializer;
      if (init !== undefined && isSettings(init)) {
        for (const element of node.name.elements) {
          const name = (element.propertyName ?? element.name).getText(source);
          if (SERVER_KEYS.has(name)) at(element, `{ ${name} } = settings`);
          if (name !== 'web') continue;
          if (ts.isIdentifier(element.name)) webNames.add(element.name.text);
          else if (ts.isObjectBindingPattern(element.name)) {
            for (const inner of element.name.elements) {
              const key = (inner.propertyName ?? inner.name).getText(source);
              if (SERVER_WEB_KEYS.has(key)) at(element, `{ web: { ${key} } } = settings`);
            }
          }
        }
      }
    }
    ts.forEachChild(node, bindings);
  };
  bindings(source);
  const reads = (node: ts.Node): void => {
    const read = accessed(node);
    if (
      read !== undefined &&
      ((SERVER_KEYS.has(read.key) && isSettings(read.expression)) ||
        (SERVER_WEB_KEYS.has(read.key) && isWeb(read.expression)))
    ) {
      at(node, node.getText(source));
    }
    ts.forEachChild(node, reads);
  };
  reads(source);
  return found.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

describe("a server's keys of the settings file (plans 19A-1 and 19A-2)", () => {
  it('finds a read of one, and nothing else', () => {
    expect(
      serverKeyReads(
        [
          'const a = ctx.config.settings.channels.moderation;',
          'const b = settings.features.roles;',
          'const c = config.settings.web?.invites;',
          'const { distanceUnits } = settings;',
          'const d = ctx.servers.of(id).channels;',
          'const e = config.settings.timezone;',
          'const f = settings.ocr.passive;',
          'const g = values.features;',
          "const h = config.settings['channels'];",
          'const { web } = settings;',
          'const i = web?.invites;',
          'const j = web.port;',
          'const { web: { memberRole } } = config.settings;',
          "const k = settings.web['memberRole'];",
          'const l = settings().timezone;',
          'const { timezone } = ctx.settings;',
          'const m = ctx.servers.zoneOf(id);',
          'const n = instanceZone(config.settings);',
          'const o = values.timezone;',
          'const p = settings().raidBosses;',
        ].join('\n'),
      ),
    ).toEqual([
      '1: ctx.config.settings.channels',
      '2: settings.features',
      '3: config.settings.web?.invites',
      '4: { distanceUnits } = settings',
      '6: config.settings.timezone',
      "9: config.settings['channels']",
      '11: web?.invites',
      '13: { web: { memberRole } } = settings',
      "14: settings.web['memberRole']",
      '15: settings().timezone',
      '16: { timezone } = settings',
    ]);
  });

  it('lets through only the files that work on the settings file itself, each for its reason (review G6)', () => {
    expect(Object.keys(ALLOWED).sort()).toEqual([
      'src/config/',
      'src/ops/convert-settings.ts',
      'src/ops/cutover-check.ts',
    ]);
  });

  it('scans the tools under scripts/ as well as the bot', () => {
    expect(sources).toContain('scripts/raid-bosses/check-feed.ts');
    expect(sources).toContain('src/app.ts');
  });

  it('is read nowhere outside src/config/ and the tools of the file', () => {
    const reads = sources.flatMap((file) =>
      serverKeyReads(readFileSync(path.join(ROOT, file), 'utf8'), file).map(
        (read) => `${file}:${read}`,
      ),
    );
    expect(reads).toEqual([]);
  });
});
