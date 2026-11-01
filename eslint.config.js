import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// `he` 2 has named exports only: a default import type-checks (interop) but is undefined at
// run time, so every gym write would throw (src/types/he.d.ts).
const HE_DEFAULT = {
  selector: "ImportDeclaration[source.value='he'] > ImportDefaultSpecifier",
  message: "he has no default export: import * as he from 'he' (src/types/he.d.ts).",
};

// Plan 8Y: zoned times are Temporal's, made through src/domain/time/zoned.ts. The rules of the
// tests and the package replace these, so they repeat them.
const LUXON_GONE =
  'Luxon is gone (plan 8Y): zoned times are Temporal, through src/domain/time/zoned.ts.';
// The package and any file of it (`luxon/src/datetime.js`), imported statically.
const LUXON = { regex: '^luxon(/|$)', message: LUXON_GONE };
const CLOCK =
  'The clock is Date.now() or an injected now, so that a faked Date holds (src/domain/time/zoned.ts).';
const TEMPORAL_NOW = { object: 'Temporal', property: 'Now', message: CLOCK };
// What the rules above do not see: `import('luxon')`, and `globalThis.Temporal.Now`.
const TIME_SYNTAX = [
  { selector: 'ImportExpression[source.value=/^luxon(\\/|$)/]', message: LUXON_GONE },
  {
    selector:
      "MemberExpression[property.name='Now'][object.type='MemberExpression'][object.property.name='Temporal'][object.object.name='globalThis']",
    message: CLOCK,
  },
];

const TEMPORAL_IN_BROWSERS = 'The package runs in browsers too, some without Temporal: use Date.';

const SLEEP =
  'A sleep waits on real time: await the work itself or fake the timer (docs/architecture/testing.md).';

// The tests' rule replaces the one of every file, so it repeats he's and Temporal's.
const TEST_SYNTAX = [
  HE_DEFAULT,
  ...TIME_SYNTAX,
  {
    // A timer in a promise, by its bare name or as a property (`globalThis.setTimeout`),
    // with any delay but a literal 0 (a constant, a sum): a sleep.
    selector:
      "NewExpression[callee.name='Promise'] CallExpression:matches([callee.name=/^set(Timeout|Interval)$/], [callee.property.name=/^set(Timeout|Interval)$/])[arguments.length>1]:not([arguments.1.type='Literal'][arguments.1.value=0])",
    message: SLEEP,
  },
  {
    selector: "CallExpression[callee.name='setTimeout'][arguments.0.value>0]",
    message: SLEEP,
  },
];

// The unit tests share a module graph per worker (`isolate: false`): a module mock would leak
// into the files after it, or come too late for a module they imported already.
const MODULE_MOCK = {
  selector:
    "CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock|unmock|doUnmock)$/]",
  message:
    'A module mock needs a module graph of its own: name the file *.isolated.test.ts (vitest.config.ts).',
};

export default defineConfig([
  globalIgnores([
    'dist/',
    'packages/*/dist/',
    'coverage/',
    'var/',
    'node_modules/',
    // other sessions' worktrees, each a whole checkout: linted with them, ESLint ran out of memory
    '.claude/worktrees/',
    // the private Wayspot export tool's built file, which the owner's instance serves (git-ignored)
    'wayspot-tool/',
    // legacy JavaScript, kept as reference until the cutover phase
    'index.js',
    'app/',
    'commands/',
    'types/',
    'lang-data/',
    'src/db/types.ts',
    'src/db/baseline/legacy-schema.ts',
    // the data of the Gantt chart page: JSON in a script file, written by scripts/gantt/update.ts
    'docs/superpowers/gantt-data.js',
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-console': 'error',
      'no-restricted-imports': ['error', { patterns: [LUXON] }],
      'no-restricted-properties': ['error', TEMPORAL_NOW],
      'no-restricted-syntax': ['error', HE_DEFAULT, ...TIME_SYNTAX],
    },
  },
  {
    // A test awaits the work itself, never real time or a poll (docs/architecture/testing.md,
    // "Waiting for work in the background"). A test that truly needs real time (a real child
    // process, a measurement of the event loop) disables the rule on its line, with the reason.
    files: ['**/*.test.ts', 'test/support/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...[
          ['vi', 'waitFor'],
          ['vi', 'waitUntil'],
          ['expect', 'poll'],
        ].map(([object, property]) => ({
          object,
          property,
          message:
            'Await the work itself (a flush, a Tally, fake timers, settle()): see docs/architecture/testing.md.',
        })),
        TEMPORAL_NOW,
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: ['node:timers/promises', 'timers/promises'].map((name) => ({
            name,
            importNames: ['setTimeout', 'scheduler'],
            message:
              'A sleep waits on real time: await the work itself or fake the timer (docs/architecture/testing.md).',
          })),
          patterns: [LUXON],
        },
      ],
      'no-restricted-syntax': ['error', ...TEST_SYNTAX, MODULE_MOCK],
    },
  },
  {
    // Files that run in a module graph of their own (vitest.config.ts) may mock modules.
    files: ['**/*.isolated.test.ts', '**/*.db.test.ts', '**/*.sh.test.ts'],
    rules: { 'no-restricted-syntax': ['error', ...TEST_SYNTAX] },
  },
  {
    // The package Pine shares with the Wayspot export tool stands alone and runs in a browser
    // too: no Node module (its tests may read the fixtures), no Discord or database library,
    // nothing of Pine outside the package (CLAUDE.md, "Domain and parties").
    files: ['packages/*/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['discord.js', 'kysely', 'mysql2'].map((name) => ({
            name,
            message: 'The package stands alone: no Discord or database library.',
          })),
          patterns: [
            LUXON,
            {
              regex: '^node:',
              message: 'The package runs in a browser too: no Node module outside its tests.',
            },
            {
              regex: '^kysely/|^mysql2/',
              message: 'The package stands alone: no Discord or database library.',
            },
            {
              regex: '^(\\.\\./){2,}',
              message: 'The package stands alone: nothing of Pine outside it.',
            },
          ],
        },
      ],
      // Plan 8Y: the root tsconfig's lib has Temporal for the bot, but the package runs in
      // browsers (the Wayspot export tool) that may lack it.
      'no-restricted-globals': [
        'error',
        {
          name: 'Temporal',
          message: TEMPORAL_IN_BROWSERS,
        },
      ],
      // The global rule's syntax, and Temporal through `globalThis`, which the rule above misses.
      'no-restricted-syntax': [
        'error',
        HE_DEFAULT,
        ...TIME_SYNTAX,
        {
          selector: "MemberExpression[object.name='globalThis'][property.name='Temporal']",
          message: TEMPORAL_IN_BROWSERS,
        },
      ],
    },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  prettier,
]);
