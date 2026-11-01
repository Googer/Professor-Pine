# Phase 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the TypeScript skeleton of the new Professor Pine: toolchain, validated configuration, a Kysely database layer that safely takes over the legacy MySQL schema or creates it on an empty one, a Discord client that needs no privileged intents, an interaction router with guards, `/help`, a command deploy script, graceful shutdown, and CI.

**Architecture:** New code lives in `src/` as ESM TypeScript on Node 24. The legacy JavaScript (`index.js`, `app/`, `commands/`, `types/`) stays in the tree as read-only reference and is no longer runnable on this branch. Domain-free plumbing only: later phases add parties, search, notifications and so on. Database tests run against MySQL 8 in Docker via Testcontainers, seeded from a committed dump of the legacy schema.

**Tech Stack:** Node 24, TypeScript 6.0, discord.js 14.27, Kysely 0.29 + mysql2 3.24, zod 4, pino 10, Vitest 5, ESLint 10 + typescript-eslint 8, Prettier 3, Testcontainers 12, kysely-codegen 0.20, knex 3 (dev only, to build the legacy fixture).

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md` (read sections 1, 3, 3.1, 3.2, 6.1, 6.2, 7, 8, 9 before starting).

## Global Constraints

- Node 24 (`"engines": { "node": ">=24" }`, `.nvmrc` = `24`).
- TypeScript **6.0.x**, not 7: typescript-eslint 8.71 requires `typescript >=4.8.4 <6.1.0`.
- ESM only (`"type": "module"`); relative imports in TS use the `.js` extension (`import { x } from './x.js'`).
- `strict` and `noUncheckedIndexedAccess` on. No `any` except where a line comment justifies it.
- Pine requires **no privileged intents**. Required intents: `Guilds`, `GuildMessages`, `DirectMessages`. `MessageContent` only when `settings.ocr.passive` is true; `GuildMembers` only when `settings.autoAssignRole` is true. `GuildPresences` and `GuildMessageReactions` are never requested.
- Secrets come from environment variables, never from `data/private-settings.json`.
- Ephemeral replies use `flags: MessageFlags.Ephemeral` (the `ephemeral: true` option is deprecated in discord.js 14).
- Component custom IDs: `<kind>:<id>:<action>[:<arg>...]`, at most 100 characters.
- Database changes are additive only. Kysely tracks its own migrations in `kysely_migration`; the legacy `knex_migrations` table is read, never written.
- Both a fully migrated legacy database (takeover) and an empty schema (new install) must work; anything else is refused without touching it.
- Snowflakes are strings everywhere, including values read from `BIGINT` columns.
- Test files are colocated: `*.test.ts` (unit, no Docker) and `*.db.test.ts` (needs Docker).
- Do not edit or delete legacy JS files except where a task says so. The legacy bot keeps running from `main-dev`, not from this branch.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A production `knex_migrations` table with extra rows the fixture lacks (hand-applied fixes, renamed files) must still be taken over; the baseline only requires `20221014-pokemon-elite.js`. And an operator who points `DB_SCHEMA` at the wrong, non-empty database must get a refusal, not a schema created beside their tables. Tests: Task 3, "takes over when knex_migrations has extra unknown rows" and "refuses a non-empty database that is not Pine's".
2. A handler that throws after it already deferred or replied must get its error message via `followUp`, and a failure to send that error must be logged, not crash the process. Tests: Task 7, "uses followUp when the interaction was already deferred" and "logs, does not throw, when the error reply itself fails".
3. An operator enables both optional intents but the Developer Portal grants only Message Content: the bot must still come online with passive OCR on and auto-assign off. Test: Task 6, "falls back to the largest accepted subset".
4. `.env` templates usually contain blank values (`GOOGLE_API_KEY=`, `DB_PORT=`): blanks must mean "unset", not validation errors. Test: Task 1, "treats blank optional values as unset".
5. Discord IDs stored in `BIGINT` columns (e.g. `Region.channelId`) must round-trip exactly; JavaScript numbers lose precision above 2^53. Test: Task 4, "round-trips a 19-digit snowflake in a BIGINT column".

---

## File Structure

```
.github/workflows/ci.yml            CI: lint, format check, typecheck, tests, codegen verify
.env.example                        documented environment variables
.nvmrc                              24
.prettierrc.json, .prettierignore
eslint.config.js                    flat config
tsconfig.json                       typecheck config (src, test, scripts)
tsconfig.build.json                 emit config (src → dist)
vitest.config.ts                    projects: unit, db
package.json                        rewritten for the new bot
app/package.json                    {"type":"commonjs"} so legacy migrations still load as CJS
data/settings.json                  modified: removed legacy keys, added new ones
scripts/
  legacy-schema/generate.ts         builds test/fixtures/legacy-schema.sql and src/db/baseline/legacy-schema.ts from app/db migrations
  codegen.ts                        regenerates src/db/types.ts (or verifies it)
test/
  fixtures/legacy-schema.sql        generated legacy schema + knex_migrations rows
  support/
    test-env.ts                     a valid environment for tests
    mysql.ts                        Testcontainers MySQL harness
    mysql.db.test.ts                proves the fixture matches the legacy migrations
    test-logger.ts                  pino logger capturing entries
    fake-interactions.ts            minimal fake discord.js interactions
    test-context.ts                 AppContext for tests
src/
  index.ts                          process entry: start app, signal handling
  app.ts                            wiring: config → log → db → migrate → client → router
  app-context.ts                    AppContext type
  shutdown.ts                       ordered, time-limited shutdown steps
  log.ts                            pino factory
  config/
    errors.ts                       ConfigError
    settings.ts                     settings.json schema + loader
    env.ts                          environment schema + loader
    index.ts                        Config + loadConfig
  db/
    db-config.ts                    DbConfig + dbConfigFrom(env)
    kysely.ts                       createDb()
    migrator.ts                     runMigrations()
    migrate-cli.ts                  `npm run migrate`
    migrations/index.ts             ordered migration registry
    migrations/2026_10_09_000_baseline.ts   legacy takeover or new-install schema
    baseline/legacy-schema.ts       GENERATED: legacy CREATE TABLE statements in dependency order
    types.ts                        GENERATED by kysely-codegen
    repositories/guild-repository.ts
  discord/
    errors.ts                       UserError
    custom-id.ts                    encode/decode component IDs
    intents.ts                      IntentFlags, intentsFor, fallbackCandidates, isDisallowedIntentsError
    client.ts                       createClient, loginWithFallback
    command.ts                      CommandModule, ComponentHandler, Guard types
    router.ts                       InteractionRouter
    guards.ts                       requireGuild, requireManagement, requireBotManagement, requireBotChannel, requirePvpContext
    deploy.ts                       buildCommandPayload, parseDeployArgs
    deploy-cli.ts                   `npm run deploy-commands`
    guild-sync.ts                   syncGuilds()
  commands/
    index.ts                        the command list
    categories.ts                   help category labels
    util/help.ts                    /help
    util/help-render.ts             pure embed renderers
```

---

### Task 1: Toolchain and configuration

Replaces the legacy package setup with the TypeScript toolchain and builds the validated configuration the whole bot reads.

**Files:**
- Rewrite: `package.json`, `tsconfig.json`
- Create: `tsconfig.build.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `.nvmrc`
- Delete: `.eslintrc.js`, `.npmrc`, `package-lock.json` (regenerated)
- Modify: `.gitignore`, `data/settings.json`
- Create: `src/config/errors.ts`, `src/config/settings.ts`, `src/config/env.ts`, `src/config/index.ts`, `test/support/test-env.ts`
- Test: `src/config/settings.test.ts`, `src/config/env.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class ConfigError extends Error`
  - `settingsSchema`, `type Settings = z.output<typeof settingsSchema>`, `loadSettings(path: string): Settings`
  - `envSchema`, `type Env = z.output<typeof envSchema>`, `loadEnv(raw: Record<string, string | undefined>): Env`
  - `interface Config { settings: Settings; env: Env }`, `loadConfig(raw: Record<string, string | undefined>): Config` (reads settings from `env.SETTINGS_PATH`)
  - `TEST_ENV: Record<string, string>` in `test/support/test-env.ts`

- [ ] **Step 1: Replace the package setup**

Delete the legacy toolchain files and dependencies:

```bash
git rm -q .eslintrc.js .npmrc package-lock.json
rm -rf node_modules
```

Write `package.json`:

```json
{
  "name": "professor-pine",
  "version": "2.0.0-dev",
  "description": "Professor Pine Discord bot for Pokemon Go",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "node --env-file-if-exists=.env --enable-source-maps dist/index.js",
    "dev": "tsx watch --env-file-if-exists=.env src/index.ts",
    "migrate": "tsx --env-file-if-exists=.env src/db/migrate-cli.ts",
    "deploy-commands": "tsx --env-file-if-exists=.env src/discord/deploy-cli.ts",
    "db:legacy-fixture": "tsx scripts/legacy-schema/generate.ts",
    "db:codegen": "tsx scripts/codegen.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:db": "vitest run --project db",
    "check": "npm run lint && npm run format:check && npm run typecheck && npm run test:unit"
  },
  "repository": { "type": "git", "url": "https://github.com/Googer/Professor-Pine.git" },
  "author": "Matt Legowski, Chris Vaccarello",
  "license": "GPL-3.0"
}
```

Install dependencies (exact versions verified 2026-10-09):

```bash
npm install discord.js@14.27.0 kysely@0.29.6 mysql2@3.24.5 pino@10.4.0 zod@4.6.5
npm install -D typescript@6.0.3 @types/node@24.19.1 tsx@4.23.15 vitest@5.0.3 eslint@10.12.0 @eslint/js@10.0.1 typescript-eslint@8.71.1 eslint-config-prettier@10.1.8 prettier@3.9.9 pino-pretty@13.2.0 testcontainers@12.2.0 @testcontainers/mysql@12.2.0 kysely-codegen@0.20.0 knex@3.3.0
```

Write `.nvmrc`:

```
24
```

- [ ] **Step 2: TypeScript, lint, format and test config**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "sourceMap": true,
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src", "test", "scripts", "vitest.config.ts"]
}
```

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'dist/',
    'coverage/',
    'var/',
    'node_modules/',
    // legacy JavaScript, kept as reference until the cutover phase
    'index.js',
    'app/',
    'commands/',
    'types/',
    'lang-data/',
    'src/db/types.ts',
    'src/db/baseline/legacy-schema.ts',
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
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
    },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  prettier,
]);
```

`.prettierrc.json`:

```json
{ "singleQuote": true, "printWidth": 100, "endOfLine": "auto" }
```

`.prettierignore`:

```
dist/
coverage/
var/
node_modules/
package-lock.json
index.js
app/
commands/
types/
lang-data/
data/
assets/
images/
src/db/types.ts
src/db/baseline/legacy-schema.ts
test/fixtures/
*.md
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: ['**/*.db.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['src/**/*.db.test.ts', 'test/**/*.db.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 300_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
```

Append to `.gitignore`:

```
# new TypeScript bot
dist/
coverage/
var/
.env
```

- [ ] **Step 3: Update `data/settings.json`**

Remove the keys `commandPrefix`, `reactionCommands`, `groupReactions`, and `features.reactionCommands`. Remove `"silph"` from `helpGroups`. Add these top-level keys (after `blacklistWords`):

```json
  "timezone": "America/New_York",
  "archiveRetentionDays": null,
  "ocr": {
    "passive": false,
    "debug": false
  },
  "autoAssignRole": false
```

`features` becomes:

```json
  "features": {
    "exGymChannel": true,
    "remoteRaidChannel": true,
    "notifications": true,
    "roles": true
  },
```

- [ ] **Step 4: Write the failing config tests**

`test/support/test-env.ts`:

```ts
/** A complete, valid environment for tests. Values are fake. */
export const TEST_ENV: Record<string, string> = {
  DISCORD_TOKEN: 'test-token',
  DISCORD_APP_ID: '123456789012345678',
  OWNER_ID: '223456789012345678',
  DB_HOST: 'localhost',
  DB_USER: 'pine',
  DB_SCHEMA: 'pine',
  POKEMON_IMAGE_BASE: 'https://images.example/pokemon/',
};
```

`src/config/settings.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError } from './errors.js';
import { loadSettings } from './settings.js';

const REPO_SETTINGS = 'data/settings.json';

function writeSettings(mutate: (s: Record<string, unknown>) => void): string {
  const settings = JSON.parse(readFileSync(REPO_SETTINGS, 'utf8')) as Record<string, unknown>;
  mutate(settings);
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'pine-settings-')), 'settings.json');
  writeFileSync(file, JSON.stringify(settings));
  return file;
}

describe('loadSettings', () => {
  it('accepts the committed data/settings.json', () => {
    const settings = loadSettings(REPO_SETTINGS);
    expect(settings.cleanupInterval).toBe(60000);
    expect(settings.ocr).toEqual({ passive: false, debug: false });
    expect(settings.autoAssignRole).toBe(false);
    expect(settings.helpGroups).not.toContain('silph');
  });

  it('rejects a leftover legacy key and names it', () => {
    const file = writeSettings((s) => {
      s.commandPrefix = '!';
    });
    expect(() => loadSettings(file)).toThrow(ConfigError);
    expect(() => loadSettings(file)).toThrow(/commandPrefix/);
  });

  it('rejects an unknown time zone', () => {
    const file = writeSettings((s) => {
      s.timezone = 'Mars/Olympus_Mons';
    });
    expect(() => loadSettings(file)).toThrow(/timezone/);
  });

  it('rejects a missing required key', () => {
    const file = writeSettings((s) => {
      delete s.cleanupInterval;
    });
    expect(() => loadSettings(file)).toThrow(/cleanupInterval/);
  });

  it('reports invalid JSON with the file path', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'pine-settings-')), 'broken.json');
    writeFileSync(file, '{ not json');
    expect(() => loadSettings(file)).toThrow(/broken\.json is not valid JSON/);
  });
});
```

`src/config/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '../../test/support/test-env.js';
import { loadEnv } from './env.js';
import { ConfigError } from './errors.js';

describe('loadEnv', () => {
  it('applies defaults to a minimal environment', () => {
    const env = loadEnv(TEST_ENV);
    expect(env.DB_PORT).toBe(3306);
    expect(env.DB_PASSWORD).toBe('');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.NODE_ENV).toBe('production');
    expect(env.SETTINGS_PATH).toBe('data/settings.json');
  });

  it('treats blank optional values as unset', () => {
    const env = loadEnv({
      ...TEST_ENV,
      GOOGLE_API_KEY: '',
      REGION_MAP_LINK: '   ',
      GITHUB_TOKEN: '',
      GITHUB_REPO: '',
      DB_PORT: '',
    });
    expect(env.GOOGLE_API_KEY).toBeUndefined();
    expect(env.REGION_MAP_LINK).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.DB_PORT).toBe(3306);
  });

  it('names a missing required variable', () => {
    const { DISCORD_TOKEN: _omit, ...rest } = TEST_ENV;
    expect(() => loadEnv(rest)).toThrow(ConfigError);
    expect(() => loadEnv(rest)).toThrow(/DISCORD_TOKEN/);
  });

  it('rejects a non-snowflake OWNER_ID', () => {
    expect(() => loadEnv({ ...TEST_ENV, OWNER_ID: 'matt' })).toThrow(/OWNER_ID/);
  });

  it('requires GITHUB_TOKEN and GITHUB_REPO together', () => {
    expect(() => loadEnv({ ...TEST_ENV, GITHUB_TOKEN: 'ghp_x' })).toThrow(/GITHUB_REPO/);
    const env = loadEnv({ ...TEST_ENV, GITHUB_TOKEN: 'ghp_x', GITHUB_REPO: 'Googer/PgP-Data' });
    expect(env.GITHUB_REPO).toBe('Googer/PgP-Data');
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run --project unit src/config`
Expected: FAIL, cannot resolve `./settings.js`, `./env.js`, `./errors.js`.

- [ ] **Step 6: Implement the config modules**

`src/config/errors.ts`:

```ts
/** Invalid configuration. Startup aborts with this message. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}
```

`src/config/settings.ts`:

```ts
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { ConfigError } from './errors.js';

const minutes = z.number().int().positive();
const milliseconds = z.number().int().positive();

function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export const settingsSchema = z.strictObject({
  standardRaidIncubateDuration: minutes,
  standardRaidHatchedDuration: minutes,
  exclusiveRaidIncubateDuration: minutes,
  exclusiveRaidHatchedDuration: minutes,
  eliteRaidIncubateDuration: minutes,
  eliteRaidHatchedDuration: minutes,
  maxRaidHatchedDuration: minutes,
  maxMeetupLeadupDuration: minutes,
  maximumAdditionalAttendees: z.number().int().positive(),
  startClearTime: minutes,
  deletionGraceTime: minutes,
  deletionWarningTime: minutes,
  trainOrMeetupDeletionWarningTime: minutes,
  raidCompleteTimeout: minutes,
  maximumMeetupLeadtime: minutes,
  screenshotMessageOffsetTime: minutes,
  cleanupInterval: milliseconds,
  messageCleanupDelaySuccess: milliseconds,
  messageCleanupDelayError: milliseconds,
  messageCleanupDelayStatus: milliseconds,
  showUnknownMoves: z.boolean(),
  databaseRaids: z.boolean(),
  postNewGyms: z.boolean(),
  updater: z.strictObject({
    channelIndexUpdateIntervalSeconds: z.number().int().positive(),
    gymPlacesIndexUpdateIntervalSeconds: z.number().int().positive(),
  }),
  emoji: z.strictObject({
    thumbsUp: z.string(),
    thumbsDown: z.string(),
    shiny: z.string(),
    remote: z.string(),
  }),
  features: z.strictObject({
    exGymChannel: z.boolean(),
    remoteRaidChannel: z.boolean(),
    notifications: z.boolean(),
    roles: z.boolean(),
  }),
  roles: z.strictObject({ unown: z.string().min(1) }),
  channels: z.strictObject({
    'bot-lab': z.string().min(1),
    'mod-bot-lab': z.string().min(1),
    unown: z.string().min(1),
    'ex-gym-raids': z.string().min(1),
    'remote-raids': z.string().min(1),
    pvp: z.string().min(1),
    'bot-updates': z.string().min(1),
  }),
  categories: z.strictObject({ pvp: z.string().min(1) }),
  helpGroups: z.array(z.string().min(1)),
  blacklistWords: z.array(z.string()),
  timezone: z.string().refine(isTimeZone, { message: 'must be an IANA time zone, e.g. America/New_York' }),
  archiveRetentionDays: z.number().int().positive().nullable(),
  ocr: z.strictObject({ passive: z.boolean(), debug: z.boolean() }),
  autoAssignRole: z.boolean(),
});

export type Settings = z.output<typeof settingsSchema>;

export function loadSettings(path: string): Settings {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ConfigError(`${path} is not valid JSON: ${(err as Error).message}`);
  }
  const result = settingsSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(`Invalid settings in ${path}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
```

`src/config/env.ts`:

```ts
import { z } from 'zod';
import { ConfigError } from './errors.js';

const SNOWFLAKE = /^\d{17,20}$/;

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** An optional variable where a blank value means "unset". */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());

export const envSchema = z
  .object({
    DISCORD_TOKEN: z.string().min(1),
    DISCORD_APP_ID: z.string().regex(SNOWFLAKE, 'must be a Discord ID'),
    OWNER_ID: z.string().regex(SNOWFLAKE, 'must be a Discord ID'),
    DB_HOST: z.string().min(1),
    DB_PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).default(3306)),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(''),
    DB_SCHEMA: z.string().min(1),
    POKEMON_IMAGE_BASE: z.url(),
    GOOGLE_API_KEY: optional(z.string()),
    GITHUB_TOKEN: optional(z.string()),
    GITHUB_REPO: optional(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'must look like owner/repo')),
    REGION_MAP_LINK: optional(z.url()),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
    SETTINGS_PATH: z.preprocess(blankToUndefined, z.string().default('data/settings.json')),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.GITHUB_TOKEN) !== Boolean(env.GITHUB_REPO)) {
      ctx.addIssue({
        code: 'custom',
        path: [env.GITHUB_TOKEN ? 'GITHUB_REPO' : 'GITHUB_TOKEN'],
        message: 'GITHUB_TOKEN and GITHUB_REPO must be set together',
      });
    }
  });

export type Env = z.output<typeof envSchema>;

export function loadEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
```

`src/config/index.ts`:

```ts
import { loadEnv, type Env } from './env.js';
import { loadSettings, type Settings } from './settings.js';

export { ConfigError } from './errors.js';
export type { Env } from './env.js';
export type { Settings } from './settings.js';

export interface Config {
  settings: Settings;
  env: Env;
}

export function loadConfig(raw: Record<string, string | undefined>): Config {
  const env = loadEnv(raw);
  return { env, settings: loadSettings(env.SETTINGS_PATH) };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --project unit src/config`
Expected: PASS (10 tests).

- [ ] **Step 8: Run the whole toolchain**

Run: `npm run lint && npm run format:check && npm run typecheck`
Expected: all three exit 0. If Prettier reports files, run `npm run format` and re-check.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.build.json eslint.config.js .prettierrc.json .prettierignore vitest.config.ts .nvmrc .gitignore data/settings.json src/config test/support/test-env.ts
git commit -m "Set up TypeScript toolchain and validated configuration" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Legacy schema fixture and MySQL test harness

Runs the legacy migrations once and captures their result twice: as a committed SQL dump (schema plus `knex_migrations` rows) that tests load to simulate a taken-over production database, and as a generated TS module of `CREATE TABLE` statements that a new install executes (Task 3). Also adds a Testcontainers helper that starts MySQL 8 with or without the dump. Every later database test builds on this.

**Prerequisite:** Docker running locally (Docker Desktop on Windows).

**Files:**
- Create: `app/package.json`, `src/db/db-config.ts`, `scripts/legacy-schema/generate.ts`, `scripts/legacy-schema/order-statements.ts`, `test/support/mysql.ts`
- Generated: `test/fixtures/legacy-schema.sql`, `src/db/baseline/legacy-schema.ts`
- Test: `scripts/legacy-schema/order-statements.test.ts`, `test/support/mysql.db.test.ts`

**Interfaces:**
- Consumes: `Env` (Task 1).
- Produces:
  - `interface DbConfig { host: string; port: number; user: string; password: string; database: string }`
  - `dbConfigFrom(env: Env): DbConfig`
  - `MYSQL_IMAGE = 'mysql:8.0'`, `LEGACY_SCHEMA_FIXTURE: string`
  - `interface TestDatabase { config: DbConfig; query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>; stop(): Promise<void> }`
  - `startDatabase(options: { legacySchema: boolean }): Promise<TestDatabase>`
  - `orderCreateStatements(dump: string): string[]` (CREATE TABLE statements, referenced tables first)
  - `LEGACY_SCHEMA_STATEMENTS: readonly string[]` (generated, in `src/db/baseline/legacy-schema.ts`)

- [ ] **Step 1: Keep legacy migrations loadable as CommonJS**

The root `package.json` is now `"type": "module"`, which would make Node treat `app/**/*.js` as ESM. Create `app/package.json`:

```json
{ "type": "commonjs" }
```

- [ ] **Step 2: Add the shared DB config type**

`src/db/db-config.ts`:

```ts
import type { Env } from '../config/index.js';

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function dbConfigFrom(env: Env): DbConfig {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_SCHEMA,
  };
}
```

- [ ] **Step 3: Write the harness**

`test/support/mysql.ts`:

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MySqlContainer } from '@testcontainers/mysql';
import mysql from 'mysql2/promise';
import type { DbConfig } from '../../src/db/db-config.js';

/** Keep in step with the production MySQL major version. */
export const MYSQL_IMAGE = 'mysql:8.0';

export const LEGACY_SCHEMA_FIXTURE = path.resolve(
  import.meta.dirname,
  '../fixtures/legacy-schema.sql',
);

export interface TestDatabase {
  config: DbConfig;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  stop(): Promise<void>;
}

/** Starts a throwaway MySQL, optionally loaded with the legacy Pine schema. */
export async function startDatabase(options: { legacySchema: boolean }): Promise<TestDatabase> {
  const container = await new MySqlContainer(MYSQL_IMAGE)
    .withDatabase('pine')
    .withUsername('pine')
    .withUserPassword('pine')
    .start();
  const config: DbConfig = {
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getUserPassword(),
    database: container.getDatabase(),
  };
  const pool = mysql.createPool({
    ...config,
    multipleStatements: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  if (options.legacySchema) {
    await pool.query(await readFile(LEGACY_SCHEMA_FIXTURE, 'utf8'));
  }
  return {
    config,
    async query<T>(sql: string, params: unknown[] = []) {
      const [rows] = await pool.query(sql, params);
      return rows as T[];
    },
    async stop() {
      await pool.end();
      await container.stop();
    },
  };
}
```

- [ ] **Step 4: Write the failing statement-ordering test**

A new install must create tables so that each `FOREIGN KEY ... REFERENCES` points at a table that already exists. mysqldump emits tables alphabetically, so the generator reorders them.

`scripts/legacy-schema/order-statements.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { orderCreateStatements } from './order-statements.js';

const DUMP = `
/*!40101 SET @saved_cs_client = @@character_set_client */;
CREATE TABLE \`Alias\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`roleId\` int unsigned DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`alias_roleid_foreign\` FOREIGN KEY (\`roleId\`) REFERENCES \`Role\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
CREATE TABLE \`Guild\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE \`knex_migrations\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE \`Role\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`guildId\` int unsigned DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`role_guildid_foreign\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const tableOf = (statement: string) => /CREATE TABLE `([^`]+)`/.exec(statement)?.[1];

describe('orderCreateStatements', () => {
  it('keeps only CREATE TABLE statements and drops knex bookkeeping tables', () => {
    expect(orderCreateStatements(DUMP).map(tableOf).sort()).toEqual(['Alias', 'Guild', 'Role']);
  });

  it('puts referenced tables first', () => {
    expect(orderCreateStatements(DUMP).map(tableOf)).toEqual(['Guild', 'Role', 'Alias']);
  });

  it('strips AUTO_INCREMENT counters', () => {
    expect(orderCreateStatements(DUMP).join('\n')).not.toMatch(/AUTO_INCREMENT=\d/);
  });

  it('rejects a foreign-key cycle', () => {
    const cyclic = `CREATE TABLE \`A\` (x int, CONSTRAINT f FOREIGN KEY (x) REFERENCES \`B\` (id)) ENGINE=InnoDB;
CREATE TABLE \`B\` (x int, CONSTRAINT g FOREIGN KEY (x) REFERENCES \`A\` (id)) ENGINE=InnoDB;`;
    expect(() => orderCreateStatements(cyclic)).toThrow(/cycle/);
  });
});
```

Run: `npx vitest run scripts/legacy-schema/order-statements.test.ts`
Expected: FAIL, cannot resolve `./order-statements.js`.

- [ ] **Step 5: Implement statement ordering**

`scripts/legacy-schema/order-statements.ts`:

```ts
const TABLE = /^CREATE TABLE `([^`]+)`/;
const REFERENCE = /REFERENCES `([^`]+)`/g;

/**
 * Extracts the CREATE TABLE statements from a mysqldump, minus knex bookkeeping
 * tables and AUTO_INCREMENT counters, ordered so referenced tables come first.
 */
export function orderCreateStatements(dump: string): string[] {
  const byTable = new Map<string, { statement: string; references: string[] }>();
  for (const raw of dump.split(/;\s*\n/)) {
    const statement = raw.trim().replace(/;$/, '');
    const table = TABLE.exec(statement)?.[1];
    if (!table || table.startsWith('knex_')) continue;
    const references = [...statement.matchAll(REFERENCE)]
      .map((m) => m[1] ?? '')
      .filter((name) => name !== table);
    byTable.set(table, { statement: statement.replace(/ AUTO_INCREMENT=\d+/, ''), references });
  }

  const ordered: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (table: string) => {
    if (done.has(table)) return;
    if (visiting.has(table)) throw new Error(`foreign-key cycle involving ${table}`);
    const entry = byTable.get(table);
    if (!entry) return; // reference to a table outside the dump
    visiting.add(table);
    entry.references.forEach(visit);
    visiting.delete(table);
    done.add(table);
    ordered.push(entry.statement);
  };
  [...byTable.keys()].sort().forEach(visit);
  return ordered;
}
```

Run: `npx vitest run scripts/legacy-schema/order-statements.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the fixture generator**

`scripts/legacy-schema/generate.ts`:

```ts
/**
 * Runs the legacy knex migrations (app/db/*.js) against a fresh MySQL, then writes:
 * - test/fixtures/legacy-schema.sql: schema + knex_migrations rows, as on a taken-over production database
 * - src/db/baseline/legacy-schema.ts: CREATE TABLE statements a new install executes
 * Re-run only if the legacy migrations change.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { MySqlContainer } from '@testcontainers/mysql';
import { knex } from 'knex';
import { LEGACY_SCHEMA_FIXTURE, MYSQL_IMAGE } from '../../test/support/mysql.js';
import { orderCreateStatements } from './order-statements.js';

const BASELINE_MODULE = path.resolve(import.meta.dirname, '../../src/db/baseline/legacy-schema.ts');

const repoRoot = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const ROOT_PASSWORD = 'root';

const container = await new MySqlContainer(MYSQL_IMAGE)
  .withDatabase('pine')
  .withRootPassword(ROOT_PASSWORD)
  .start();

async function dump(args: string[]): Promise<string> {
  const result = await container.exec(
    [
      'mysqldump',
      '-uroot',
      '--skip-comments',
      '--skip-dump-date',
      '--skip-add-locks',
      '--skip-lock-tables',
      '--set-gtid-purged=OFF',
      '--no-tablespaces',
      ...args,
    ],
    { env: { MYSQL_PWD: ROOT_PASSWORD } },
  );
  if (result.exitCode !== 0) {
    throw new Error(`mysqldump failed: ${result.stderr}`);
  }
  return result.stdout;
}

try {
  const legacy = knex({
    client: 'mysql2',
    connection: {
      host: container.getHost(),
      port: container.getPort(),
      user: 'root',
      password: ROOT_PASSWORD,
      database: 'pine',
    },
    migrations: { directory: path.join(repoRoot, 'app/db'), loadExtensions: ['.js'] },
  });

  // 20190226-bugfix.js requires the legacy DB singleton (app/db.js), which needs the
  // legacy runtime. It only calls DB.DB(table), so stand in a stub backed by this knex.
  const legacyDbModule = require.resolve(path.join(repoRoot, 'app/db.js'));
  require.cache[legacyDbModule] = {
    id: legacyDbModule,
    filename: legacyDbModule,
    loaded: true,
    exports: { DB: (table: string) => legacy(table) },
  } as unknown as NodeJS.Module;

  await legacy.migrate.latest();

  // A new install only gets the schema, so the legacy migrations must not have seeded data.
  const tables = (await legacy.raw(
    "select table_name as name from information_schema.tables where table_schema = database() and table_name not like 'knex_%'",
  )) as [Array<{ name: string }>, unknown];
  for (const { name } of tables[0]) {
    const [[row]] = (await legacy.raw('select count(*) as n from ??', [name])) as [[{ n: number }], unknown];
    if (Number(row.n) !== 0) {
      throw new Error(`Legacy migrations left ${row.n} row(s) in ${name}; new installs would miss them`);
    }
  }
  await legacy.destroy();

  const schema = await dump(['--no-data', 'pine']);
  const migrationRows = await dump(['--no-create-info', 'pine', 'knex_migrations', 'knex_migrations_lock']);

  await writeFile(
    LEGACY_SCHEMA_FIXTURE,
    `-- GENERATED by scripts/legacy-schema/generate.ts. Do not edit.\n${schema}\n${migrationRows}`,
  );
  await mkdir(path.dirname(BASELINE_MODULE), { recursive: true });
  await writeFile(
    BASELINE_MODULE,
    '// GENERATED by scripts/legacy-schema/generate.ts. Do not edit.\n' +
      '/** The legacy schema as of 20221014-pokemon-elite.js, in dependency order. */\n' +
      `export const LEGACY_SCHEMA_STATEMENTS: readonly string[] = ${JSON.stringify(orderCreateStatements(schema), null, 2)};\n`,
  );
  process.stdout.write(`Wrote ${LEGACY_SCHEMA_FIXTURE}\nWrote ${BASELINE_MODULE}\n`);
} finally {
  await container.stop();
}
```

- [ ] **Step 7: Write the failing fixture test**

`test/support/mysql.db.test.ts`:

```ts
import { readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEGACY_SCHEMA_STATEMENTS } from '../../src/db/baseline/legacy-schema.js';
import { startDatabase, type TestDatabase } from './mysql.js';

const LEGACY_TABLES = [
  'Alias', 'AutoAssignRole', 'AutosetPokemon', 'CommandRoleAuthorization', 'CommandRoles',
  'Guild', 'Gym', 'GymMeta', 'GymNotification', 'Pokemon', 'PokemonNotification', 'Region',
  'Role', 'SavedRoutes', 'User', 'knex_migrations', 'knex_migrations_lock',
];

describe('legacy schema fixture', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startDatabase({ legacySchema: true });
  });
  afterAll(async () => {
    await database.stop();
  });

  it('creates every legacy table', async () => {
    const rows = await database.query<{ name: string }>(
      'select table_name as name from information_schema.tables where table_schema = database()',
    );
    expect(rows.map((r) => r.name).sort()).toEqual([...LEGACY_TABLES].sort());
  });

  it('records one knex_migrations row per legacy migration file', async () => {
    const files = readdirSync('app/db').filter((f) => f.endsWith('.js')).sort();
    const rows = await database.query<{ name: string }>('select name from knex_migrations order by name');
    expect(rows.map((r) => r.name)).toEqual(files);
    expect(files).toContain('20221014-pokemon-elite.js');
  });

  it('generates one new-install statement per legacy table', () => {
    const tables = LEGACY_SCHEMA_STATEMENTS.map((s) => /CREATE TABLE `([^`]+)`/.exec(s)?.[1]).sort();
    expect(tables).toEqual(LEGACY_TABLES.filter((t) => !t.startsWith('knex_')).sort());
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npx vitest run --project db test/support/mysql.db.test.ts`
Expected: FAIL, cannot resolve `../../src/db/baseline/legacy-schema.js`.

- [ ] **Step 9: Generate the fixture and the baseline module**

Run: `npm run db:legacy-fixture`
Expected: both `Wrote ...` lines. Check that:
- `test/fixtures/legacy-schema.sql` contains `CREATE TABLE \`Region\`` with a `polygon` column and `INSERT INTO \`knex_migrations\``;
- `src/db/baseline/legacy-schema.ts` lists `Guild` before `Region`, `Role` and the other tables that reference it.

If a legacy migration fails under knex 3, the error names the file. Fix it by adjusting only the stub or knex options in the generator, never the legacy migration. If the generator reports rows left by the legacy migrations, stop and tell the maintainer: new installs would need that data seeded, which this plan does not cover.

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx vitest run --project db test/support/mysql.db.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 11: Lint, typecheck, commit**

Run: `npm run lint && npm run typecheck`
Expected: exit 0.

```bash
git add app/package.json src/db/db-config.ts src/db/baseline scripts/legacy-schema test/support/mysql.ts test/support/mysql.db.test.ts test/fixtures/legacy-schema.sql
git commit -m "Add legacy schema fixture, new-install schema and MySQL test harness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Database connection, migrator and baseline

The new bot runs Kysely migrations at startup. The first one, the baseline, takes over a fully migrated legacy database unchanged, creates the legacy schema on an empty one, and refuses anything else without touching it.

**Files:**
- Create: `src/db/kysely.ts`, `src/db/migrator.ts`, `src/db/migrations/index.ts`, `src/db/migrations/2026_10_09_000_baseline.ts`, `src/db/migrate-cli.ts`, `src/log.ts`
- Test: `src/db/migrator.db.test.ts`, `src/log.test.ts`

**Interfaces:**
- Consumes: `DbConfig`, `dbConfigFrom`, `startDatabase`, `LEGACY_SCHEMA_STATEMENTS` (Task 2); `loadConfig` (Task 1).
- Produces:
  - `createDb<Schema>(config: DbConfig): Kysely<Schema>`
  - `runMigrations(db: Kysely<any>, log: Logger): Promise<void>`
  - `LEGACY_REQUIRED_MIGRATION = '20221014-pokemon-elite.js'`
  - `detectDatabaseState(db: Kysely<any>): Promise<{ state: 'empty' | 'legacy-complete' | 'legacy-incomplete' | 'foreign'; tables: string[] }>`
  - `createLogger(options: { level: string; pretty: boolean }): Logger`, `type Logger` (re-export of pino's)

- [ ] **Step 1: Write the failing logger test**

`src/log.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createLogger } from './log.js';

describe('createLogger', () => {
  it('uses the requested level', () => {
    expect(createLogger({ level: 'warn', pretty: false }).level).toBe('warn');
  });
});
```

- [ ] **Step 2: Write the failing migrator tests**

`src/db/migrator.db.test.ts`:

```ts
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { startDatabase, type TestDatabase } from '../../test/support/mysql.js';
import { createDb } from './kysely.js';
import { LEGACY_REQUIRED_MIGRATION } from './migrations/2026_10_09_000_baseline.js';
import { runMigrations } from './migrator.js';

const silent = pino({ level: 'silent' });
const OWN_TABLES = "table_name not like 'knex\\_%' and table_name not like 'kysely\\_%'";

async function migrate(database: TestDatabase): Promise<void> {
  const db = createDb<unknown>(database.config);
  try {
    await runMigrations(db, silent);
  } finally {
    await db.destroy();
  }
}

/** Everything about the Pine tables that a new install must reproduce exactly. */
async function describeSchema(database: TestDatabase) {
  return {
    columns: await database.query(
      `select table_name as t, column_name as c, column_type as type, is_nullable as nullable,
              column_default as dflt, column_key as k, extra
       from information_schema.columns
       where table_schema = database() and ${OWN_TABLES} order by t, c`,
    ),
    indexes: await database.query(
      `select table_name as t, index_name as i, seq_in_index as s, column_name as c, non_unique as nu
       from information_schema.statistics
       where table_schema = database() and ${OWN_TABLES} order by t, i, s`,
    ),
    foreignKeys: await database.query(
      `select r.table_name as t, r.constraint_name as name, r.referenced_table_name as rt,
              r.delete_rule as onDelete, r.update_rule as onUpdate
       from information_schema.referential_constraints r
       where r.constraint_schema = database() order by t, name`,
    ),
  };
}

describe('runMigrations', () => {
  let database: TestDatabase | undefined;
  let other: TestDatabase | undefined;

  afterEach(async () => {
    await database?.stop();
    await other?.stop();
    database = other = undefined;
  });

  it('takes over a fully migrated legacy database', async () => {
    database = await startDatabase({ legacySchema: true });
    const before = await describeSchema(database);
    await migrate(database);
    const rows = await database.query<{ name: string }>('select name from kysely_migration');
    expect(rows.map((r) => r.name)).toContain('2026_10_09_000_baseline');
    expect(await describeSchema(database)).toEqual(before);
  });

  it('is idempotent', async () => {
    database = await startDatabase({ legacySchema: true });
    await migrate(database);
    await expect(migrate(database)).resolves.toBeUndefined();
  });

  it('takes over when knex_migrations has extra unknown rows', async () => {
    database = await startDatabase({ legacySchema: true });
    await database.query(
      "insert into knex_migrations (name, batch, migration_time) values ('20230101-hand-fix.js', 99, now())",
    );
    await expect(migrate(database)).resolves.toBeUndefined();
  });

  it('creates the legacy schema on an empty database', async () => {
    database = await startDatabase({ legacySchema: false });
    await migrate(database);
    const tables = await database.query<{ name: string }>(
      'select table_name as name from information_schema.tables where table_schema = database()',
    );
    expect(tables.map((r) => r.name)).toEqual(expect.arrayContaining(['Guild', 'Region', 'User', 'Gym']));
    expect(tables.map((r) => r.name)).not.toContain('knex_migrations');
  });

  it('gives a new install exactly the schema of a taken-over database', async () => {
    database = await startDatabase({ legacySchema: false });
    other = await startDatabase({ legacySchema: true });
    await migrate(database);
    await migrate(other);
    expect(await describeSchema(database)).toEqual(await describeSchema(other));
  });

  it("refuses a non-empty database that is not Pine's", async () => {
    database = await startDatabase({ legacySchema: false });
    await database.query('create table invoices (id int primary key)');
    await expect(migrate(database)).rejects.toThrow(/invoices/);
    const tables = await database.query<{ name: string }>(
      "select table_name as name from information_schema.tables where table_schema = database() and table_name not like 'kysely\\_%'",
    );
    expect(tables.map((r) => r.name)).toEqual(['invoices']);
  });

  it('refuses a legacy database missing the latest legacy migration', async () => {
    database = await startDatabase({ legacySchema: true });
    await database.query('delete from knex_migrations where name = ?', [LEGACY_REQUIRED_MIGRATION]);
    await expect(migrate(database)).rejects.toThrow(LEGACY_REQUIRED_MIGRATION);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/log.test.ts src/db/migrator.db.test.ts`
Expected: FAIL, cannot resolve `./log.js`, `./kysely.js`, `./migrator.js`.

- [ ] **Step 4: Implement logger, connection, migrations**

`src/log.ts`:

```ts
import { pino, type Logger } from 'pino';

export type { Logger } from 'pino';

export function createLogger(options: { level: string; pretty: boolean }): Logger {
  return pino({
    level: options.level,
    ...(options.pretty ? { transport: { target: 'pino-pretty' } } : {}),
  });
}
```

`src/db/kysely.ts`:

```ts
import { Kysely, MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';
import type { DbConfig } from './db-config.js';

/**
 * BIGINT and DECIMAL values come back as strings (bigNumberStrings), so Discord
 * snowflakes stored in BIGINT columns keep full precision.
 */
export function createDb<Schema>(config: DbConfig): Kysely<Schema> {
  return new Kysely<Schema>({
    dialect: new MysqlDialect({
      pool: createPool({
        ...config,
        charset: 'utf8mb4',
        supportBigNumbers: true,
        bigNumberStrings: true,
        connectionLimit: 10,
      }),
    }),
  });
}
```

`src/db/migrations/2026_10_09_000_baseline.ts`:

```ts
import { sql, type Kysely, type Migration } from 'kysely';
import { LEGACY_SCHEMA_STATEMENTS } from '../baseline/legacy-schema.js';

/** The last migration the legacy (knex) bot ever shipped. */
export const LEGACY_REQUIRED_MIGRATION = '20221014-pokemon-elite.js';

export type DatabaseState = 'empty' | 'legacy-complete' | 'legacy-incomplete' | 'foreign';

/** Classifies the target schema, ignoring Kysely's own bookkeeping tables. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
export async function detectDatabaseState(db: Kysely<any>): Promise<{ state: DatabaseState; tables: string[] }> {
  const result = await sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = database() and table_name not like 'kysely\\_%'
    order by name`.execute(db);
  const tables = result.rows.map((r) => r.name);
  if (tables.length === 0) return { state: 'empty', tables };
  if (!tables.includes('knex_migrations')) return { state: 'foreign', tables };
  const applied = await sql<{ name: string }>`
    select name from knex_migrations where name = ${LEGACY_REQUIRED_MIGRATION}`.execute(db);
  return { state: applied.rows.length > 0 ? 'legacy-complete' : 'legacy-incomplete', tables };
}

/**
 * Takes over a database the legacy bot fully migrated (no changes), creates the legacy
 * schema on an empty database (new install), and refuses anything else untouched.
 * Only the last legacy migration is required, so hand-applied extra knex_migrations rows
 * do not block a takeover.
 */
export const baseline: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const { state, tables } = await detectDatabaseState(db);
    switch (state) {
      case 'legacy-complete':
        return;
      case 'empty':
        // Statements are generated in dependency order, so foreign keys always resolve.
        for (const statement of LEGACY_SCHEMA_STATEMENTS) await sql.raw(statement).execute(db);
        return;
      case 'legacy-incomplete':
        throw new Error(
          `Baseline failed: legacy migration ${LEGACY_REQUIRED_MIGRATION} has not been applied. ` +
            'Run the legacy bot (main-dev) once so all its migrations apply, then retry.',
        );
      case 'foreign':
        throw new Error(
          `Baseline failed: the database already has tables (${tables.join(', ')}) but is not a ` +
            'Professor Pine database. Use an empty schema for a new install, or the existing Pine database.',
        );
    }
  },
  async down() {
    // Never drop the Pine schema from a migration.
  },
};
```

`src/db/migrations/index.ts`:

```ts
import type { Migration } from 'kysely';
import { baseline } from './2026_10_09_000_baseline.js';

/**
 * Every migration, keyed by name. Kysely applies them in name order, so names are
 * `YYYY_MM_DD_NNN_description`. Add new migrations here; never rename or remove one.
 */
export const migrations: Record<string, Migration> = {
  '2026_10_09_000_baseline': baseline,
};
```

`src/db/migrator.ts`:

```ts
import { Migrator, type Kysely, type Migration, type MigrationProvider } from 'kysely';
import type { Logger } from '../log.js';
import { migrations } from './migrations/index.js';

class StaticMigrationProvider implements MigrationProvider {
  constructor(private readonly all: Record<string, Migration>) {}

  getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve(this.all);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
export async function runMigrations(db: Kysely<any>, log: Logger): Promise<void> {
  const migrator = new Migrator({ db, provider: new StaticMigrationProvider(migrations) });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    if (result.status === 'Success') log.info({ migration: result.migrationName }, 'migration applied');
    if (result.status === 'Error') log.error({ migration: result.migrationName }, 'migration failed');
  }
  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}
```

`src/db/migrate-cli.ts`:

```ts
import { loadConfig } from '../config/index.js';
import { createLogger } from '../log.js';
import { dbConfigFrom } from './db-config.js';
import { createDb } from './kysely.js';
import { runMigrations } from './migrator.js';

const config = loadConfig(process.env);
const log = createLogger({ level: config.env.LOG_LEVEL, pretty: config.env.NODE_ENV === 'development' });
const db = createDb<unknown>(dbConfigFrom(config.env));
try {
  await runMigrations(db, log);
  log.info('database is up to date');
} catch (err) {
  log.fatal({ err }, 'migration failed');
  process.exitCode = 1;
} finally {
  await db.destroy();
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/log.test.ts src/db/migrator.db.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Lint, typecheck, commit**

Run: `npm run lint && npm run typecheck`
Expected: exit 0.

```bash
git add src/log.ts src/log.test.ts src/db
git commit -m "Add Kysely connection, migrator and baseline (legacy takeover or new install)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Generated database types and GuildRepository

Generates typed table definitions from the migrated legacy schema, and ports the first repository: keeping `Guild` rows in step with the servers the bot is in (legacy `app/db.js` `initialize`, `guildCreate`, `guildDelete`).

**Files:**
- Create: `scripts/codegen.ts`, `src/db/types.ts` (generated), `src/db/repositories/guild-repository.ts`
- Test: `src/db/repositories/guild-repository.db.test.ts`

**Interfaces:**
- Consumes: `startDatabase` (Task 2), `createDb`, `runMigrations` (Task 3).
- Produces:
  - `interface DB` (generated; one property per table)
  - `interface GuildStore { ensure(snowflake: string): Promise<void>; remove(snowflake: string): Promise<void> }`
  - `class GuildRepository implements GuildStore` with `constructor(db: Kysely<DB>)` and `idFor(snowflake: string): Promise<number | undefined>`

- [ ] **Step 1: Write the codegen script**

`scripts/codegen.ts`:

```ts
/**
 * Regenerates src/db/types.ts from the legacy schema plus every Kysely migration.
 * `npm run db:codegen -- --verify` fails if the committed file is stale (used in CI).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pino } from 'pino';
import { createDb } from '../src/db/kysely.js';
import { runMigrations } from '../src/db/migrator.js';
import { startDatabase } from '../test/support/mysql.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const codegenBin = path.join(repoRoot, 'node_modules/kysely-codegen/dist/cli/bin.js');
const verify = process.argv.includes('--verify');

const database = await startDatabase({ legacySchema: true });
try {
  const db = createDb<unknown>(database.config);
  await runMigrations(db, pino({ level: 'warn' }));
  await db.destroy();

  const { host, port, user, password, database: name } = database.config;
  execFileSync(
    process.execPath,
    [
      codegenBin,
      '--dialect', 'mysql',
      '--url', `mysql://${user}:${password}@${host}:${port}/${name}`,
      '--out-file', path.join(repoRoot, 'src/db/types.ts'),
      '--exclude-pattern', 'kysely_migration*',
      '--type-mapping', JSON.stringify({ bigint: 'string' }),
      ...(verify ? ['--verify'] : []),
    ],
    { stdio: 'inherit' },
  );
} finally {
  await database.stop();
}
```

- [ ] **Step 2: Generate the types**

Run: `npm run db:codegen`
Expected: `src/db/types.ts` is written. Open it and confirm `export interface DB` lists every legacy table, `Region.channelId` is typed `string | null` (from the bigint mapping), and `Guild.id` is `Generated<number>`. If `channelId` came out as `number`, the `--type-mapping` key differs for this dialect: run with `--log-level debug`, read the raw data type it reports for `Region.channelId`, and use that as the key.

- [ ] **Step 3: Write the failing repository test**

`src/db/repositories/guild-repository.db.test.ts`:

```ts
import type { Kysely } from 'kysely';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startDatabase, type TestDatabase } from '../../../test/support/mysql.js';
import { createDb } from '../kysely.js';
import { runMigrations } from '../migrator.js';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';

describe('GuildRepository', () => {
  let database: TestDatabase;
  let db: Kysely<DB>;
  let guilds: GuildRepository;

  beforeAll(async () => {
    database = await startDatabase({ legacySchema: true });
    db = createDb<DB>(database.config);
    await runMigrations(db, pino({ level: 'silent' }));
    guilds = new GuildRepository(db);
  });
  afterAll(async () => {
    await db.destroy();
    await database.stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Guild').execute();
  });

  it('ensure inserts a guild once', async () => {
    await guilds.ensure('412345678901234567');
    await guilds.ensure('412345678901234567');
    const rows = await db.selectFrom('Guild').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.snowflake).toBe('412345678901234567');
  });

  it('idFor returns undefined for an unknown guild', async () => {
    expect(await guilds.idFor('999999999999999999')).toBeUndefined();
  });

  it('remove deletes the guild and cascades to its regions', async () => {
    await guilds.ensure('412345678901234567');
    const guildId = await guilds.idFor('412345678901234567');
    await db.insertInto('Region').values({ guildId, channelId: '512345678901234567' }).execute();

    await guilds.remove('412345678901234567');

    expect(await guilds.idFor('412345678901234567')).toBeUndefined();
    expect(await db.selectFrom('Region').selectAll().execute()).toHaveLength(0);
  });

  it('round-trips a 19-digit snowflake in a BIGINT column', async () => {
    await guilds.ensure('412345678901234567');
    const guildId = await guilds.idFor('412345678901234567');
    const snowflake = '1234567890123456789';
    await db.insertInto('Region').values({ guildId, channelId: snowflake }).execute();

    const row = await db.selectFrom('Region').select('channelId').executeTakeFirstOrThrow();
    expect(row.channelId).toBe(snowflake);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/db/repositories/guild-repository.db.test.ts`
Expected: FAIL, cannot resolve `./guild-repository.js`.

- [ ] **Step 5: Implement the repository**

`src/db/repositories/guild-repository.ts`:

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../types.js';

/** What guild syncing needs; lets tests use an in-memory fake. */
export interface GuildStore {
  ensure(snowflake: string): Promise<void>;
  remove(snowflake: string): Promise<void>;
}

/** The Guild table: one row per Discord server the bot is in. */
export class GuildRepository implements GuildStore {
  constructor(private readonly db: Kysely<DB>) {}

  async ensure(snowflake: string): Promise<void> {
    await this.db
      .insertInto('Guild')
      .values({ snowflake })
      .onDuplicateKeyUpdate({ snowflake })
      .execute();
  }

  /** Deleting a guild cascades to its regions, roles and notifications. */
  async remove(snowflake: string): Promise<void> {
    await this.db.deleteFrom('Guild').where('snowflake', '=', snowflake).execute();
  }

  async idFor(snowflake: string): Promise<number | undefined> {
    const row = await this.db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', snowflake)
      .executeTakeFirst();
    return row?.id;
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/db/repositories/guild-repository.db.test.ts`
Expected: PASS (4 tests). If the `Region` insert fails to typecheck because `bounds` is generated as required, the legacy fixture still has it `NOT NULL`: check `20200506-region-fix-bounds-regression.js` ran (Task 2 test), do not hand-edit `types.ts`.

- [ ] **Step 7: Verify codegen is stable, lint, typecheck, commit**

Run: `npm run db:codegen -- --verify && npm run lint && npm run typecheck`
Expected: exit 0.

```bash
git add scripts/codegen.ts src/db/types.ts src/db/repositories
git commit -m "Generate database types and add GuildRepository" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: User errors and component custom IDs

The two small primitives every handler uses: an error type whose message is safe to show users, and the codec for component custom IDs (spec 3.2).

**Files:**
- Create: `src/discord/errors.ts`, `src/discord/custom-id.ts`
- Test: `src/discord/custom-id.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class UserError extends Error` (message is shown to the user as-is)
  - `interface CustomId { kind: string; id: string; action: string; args: string[] }`
  - `encodeCustomId(parts: { kind: string; id: string; action: string; args?: string[] }): string`
  - `decodeCustomId(raw: string): CustomId | undefined`
  - `MAX_CUSTOM_ID_LENGTH = 100`

- [ ] **Step 1: Write the failing tests**

`src/discord/custom-id.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeCustomId, encodeCustomId, MAX_CUSTOM_ID_LENGTH } from './custom-id.js';

const PARTY = '7f3c2a10-5b6e-4c1d-9a8b-0123456789ab';

describe('custom ids', () => {
  it('round-trips kind, id, action and args', () => {
    const raw = encodeCustomId({ kind: 'p', id: PARTY, action: 'group', args: ['B'] });
    expect(raw).toBe(`p:${PARTY}:group:B`);
    expect(decodeCustomId(raw)).toEqual({ kind: 'p', id: PARTY, action: 'group', args: ['B'] });
  });

  it('decodes an id without args', () => {
    expect(decodeCustomId(`p:${PARTY}:join`)).toEqual({ kind: 'p', id: PARTY, action: 'join', args: [] });
  });

  it('rejects a part containing the separator', () => {
    expect(() => encodeCustomId({ kind: 'p', id: 'a:b', action: 'join' })).toThrow(/":"/);
  });

  it('rejects an empty part', () => {
    expect(() => encodeCustomId({ kind: 'p', id: '', action: 'join' })).toThrow(/empty/);
  });

  it('rejects ids longer than Discord allows', () => {
    expect(() =>
      encodeCustomId({ kind: 'p', id: 'x'.repeat(MAX_CUSTOM_ID_LENGTH), action: 'join' }),
    ).toThrow(/100/);
  });

  it('returns undefined for malformed or legacy ids', () => {
    expect(decodeCustomId('join')).toBeUndefined();
    expect(decodeCustomId('p:only-two')).toBeUndefined();
    expect(decodeCustomId('p::join')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/discord/custom-id.test.ts`
Expected: FAIL, cannot resolve `./custom-id.js`.

- [ ] **Step 3: Implement**

`src/discord/errors.ts`:

```ts
/**
 * A problem caused by the user's input or situation (wrong channel, bad value).
 * The router shows the message ephemerally and does not log it as an error.
 */
export class UserError extends Error {
  override name = 'UserError';
}
```

`src/discord/custom-id.ts`:

```ts
export const MAX_CUSTOM_ID_LENGTH = 100;
const SEPARATOR = ':';

export interface CustomId {
  kind: string;
  id: string;
  action: string;
  args: string[];
}

export function encodeCustomId(parts: {
  kind: string;
  id: string;
  action: string;
  args?: string[];
}): string {
  const all = [parts.kind, parts.id, parts.action, ...(parts.args ?? [])];
  for (const part of all) {
    if (part === '') throw new Error('custom id parts must not be empty');
    if (part.includes(SEPARATOR)) throw new Error(`custom id part "${part}" contains ":"`);
  }
  const raw = all.join(SEPARATOR);
  if (raw.length > MAX_CUSTOM_ID_LENGTH) {
    throw new Error(`custom id is ${raw.length} characters; Discord allows ${MAX_CUSTOM_ID_LENGTH}`);
  }
  return raw;
}

/** Returns undefined for anything not produced by encodeCustomId. */
export function decodeCustomId(raw: string): CustomId | undefined {
  const [kind, id, action, ...args] = raw.split(SEPARATOR);
  if (!kind || !id || !action || args.some((a) => a === '')) return undefined;
  return { kind, id, action, args };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/discord/custom-id.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/discord/errors.ts src/discord/custom-id.ts src/discord/custom-id.test.ts
git commit -m "Add UserError and component custom-id codec" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Discord client with optional intents

Builds the client with only non-privileged intents unless a feature flag asks for more, and keeps the bot online if the Developer Portal has not granted a requested intent (spec 3.1).

**Files:**
- Create: `src/discord/intents.ts`, `src/discord/client.ts`, `test/support/test-logger.ts`
- Test: `src/discord/intents.test.ts`, `src/discord/client.test.ts`

**Interfaces:**
- Consumes: `Logger` (Task 3).
- Produces:
  - `interface IntentFlags { ocrPassive: boolean; autoAssignRole: boolean }`
  - `intentsFor(flags: IntentFlags): GatewayIntentBits[]`
  - `fallbackCandidates(flags: IntentFlags): IntentFlags[]` (requested set first, all-off last)
  - `isDisallowedIntentsError(err: unknown): boolean`
  - `createClient(intents: GatewayIntentBits[]): Client`
  - `loginWithFallback(requested: IntentFlags, deps: LoginDeps): Promise<{ client: Client; features: IntentFlags }>` where `interface LoginDeps { token: string; log: Logger; create(intents: GatewayIntentBits[]): Client; configure(client: Client): void }`
  - `createTestLogger(): { log: Logger; entries: Array<Record<string, unknown>> }`

- [ ] **Step 1: Write the test logger**

`test/support/test-logger.ts`:

```ts
import { pino, type Logger } from 'pino';

/** A real pino logger that records each entry as a parsed object. */
export function createTestLogger(): { log: Logger; entries: Array<Record<string, unknown>> } {
  const entries: Array<Record<string, unknown>> = [];
  const log = pino(
    { level: 'trace' },
    {
      write(line: string) {
        entries.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  );
  return { log, entries };
}
```

- [ ] **Step 2: Write the failing tests**

`src/discord/intents.test.ts`:

```ts
import { GatewayIntentBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fallbackCandidates, intentsFor, isDisallowedIntentsError } from './intents.js';

const NONE = { ocrPassive: false, autoAssignRole: false };

describe('intentsFor', () => {
  it('requests only non-privileged intents by default', () => {
    expect(intentsFor(NONE)).toEqual([
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
    ]);
  });

  it('adds Message Content for passive OCR and Server Members for auto-assign', () => {
    expect(intentsFor({ ocrPassive: true, autoAssignRole: false })).toContain(GatewayIntentBits.MessageContent);
    expect(intentsFor({ ocrPassive: true, autoAssignRole: false })).not.toContain(GatewayIntentBits.GuildMembers);
    expect(intentsFor({ ocrPassive: false, autoAssignRole: true })).toContain(GatewayIntentBits.GuildMembers);
  });

  it('never requests presences or reactions', () => {
    const all = intentsFor({ ocrPassive: true, autoAssignRole: true });
    expect(all).not.toContain(GatewayIntentBits.GuildPresences);
    expect(all).not.toContain(GatewayIntentBits.GuildMessageReactions);
  });
});

describe('fallbackCandidates', () => {
  it('is just the requested set when nothing privileged is requested', () => {
    expect(fallbackCandidates(NONE)).toEqual([NONE]);
  });

  it('tries the full set, then each single flag, then none', () => {
    expect(fallbackCandidates({ ocrPassive: true, autoAssignRole: true })).toEqual([
      { ocrPassive: true, autoAssignRole: true },
      { ocrPassive: true, autoAssignRole: false },
      { ocrPassive: false, autoAssignRole: true },
      NONE,
    ]);
  });
});

describe('isDisallowedIntentsError', () => {
  it('recognises the gateway close code and discord.js messages', () => {
    expect(isDisallowedIntentsError(Object.assign(new Error('closed'), { code: 4014 }))).toBe(true);
    expect(isDisallowedIntentsError(new Error('Used disallowed intents'))).toBe(true);
    expect(isDisallowedIntentsError(new Error('Privileged intent provided is not enabled or whitelisted.'))).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isDisallowedIntentsError(new Error('An invalid token was provided.'))).toBe(false);
    expect(isDisallowedIntentsError('4014')).toBe(false);
  });
});
```

`src/discord/client.test.ts`:

```ts
import { GatewayIntentBits, type Client } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { loginWithFallback } from './client.js';

const disallowed = () => Object.assign(new Error('Used disallowed intents'), { code: 4014 });

/** Fake clients whose login outcome depends on which intents they were created with. */
function fakeFactory(accept: (intents: GatewayIntentBits[]) => boolean) {
  const created: Array<{ intents: GatewayIntentBits[]; destroy: ReturnType<typeof vi.fn> }> = [];
  const create = (intents: GatewayIntentBits[]) => {
    const destroy = vi.fn(() => Promise.resolve());
    created.push({ intents, destroy });
    return {
      login: vi.fn(() => (accept(intents) ? Promise.resolve('token') : Promise.reject(disallowed()))),
      destroy,
    } as unknown as Client;
  };
  return { create, created };
}

describe('loginWithFallback', () => {
  it('logs in with the requested intents when Discord accepts them', async () => {
    const { log } = createTestLogger();
    const { create, created } = fakeFactory(() => true);
    const configure = vi.fn();

    const result = await loginWithFallback(
      { ocrPassive: true, autoAssignRole: false },
      { token: 't', log, create, configure },
    );

    expect(result.features).toEqual({ ocrPassive: true, autoAssignRole: false });
    expect(created).toHaveLength(1);
    expect(configure).toHaveBeenCalledTimes(1);
  });

  it('falls back to the largest accepted subset', async () => {
    const { log, entries } = createTestLogger();
    const { create, created } = fakeFactory((intents) => !intents.includes(GatewayIntentBits.GuildMembers));

    const result = await loginWithFallback(
      { ocrPassive: true, autoAssignRole: true },
      { token: 't', log, create, configure: vi.fn() },
    );

    expect(result.features).toEqual({ ocrPassive: true, autoAssignRole: false });
    expect(created[0]?.destroy).toHaveBeenCalled();
    expect(entries.some((e) => String(e.msg).includes('autoAssignRole'))).toBe(true);
  });

  it('rethrows errors that are not about intents', async () => {
    const { log } = createTestLogger();
    const create = () =>
      ({
        login: () => Promise.reject(new Error('An invalid token was provided.')),
        destroy: () => Promise.resolve(),
      }) as unknown as Client;

    await expect(
      loginWithFallback({ ocrPassive: true, autoAssignRole: false }, { token: 't', log, create, configure: vi.fn() }),
    ).rejects.toThrow('invalid token');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/discord/intents.test.ts src/discord/client.test.ts`
Expected: FAIL, cannot resolve `./intents.js`, `./client.js`.

- [ ] **Step 4: Implement**

`src/discord/intents.ts`:

```ts
import { GatewayIntentBits } from 'discord.js';

/** Features that need a privileged intent. Both default to off (spec 3.1). */
export interface IntentFlags {
  /** Passive screenshot OCR: needs Message Content. */
  ocrPassive: boolean;
  /** Auto-assign a role on join: needs Server Members. */
  autoAssignRole: boolean;
}

const BASE_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.DirectMessages,
];

export function intentsFor(flags: IntentFlags): GatewayIntentBits[] {
  return [
    ...BASE_INTENTS,
    ...(flags.ocrPassive ? [GatewayIntentBits.MessageContent] : []),
    ...(flags.autoAssignRole ? [GatewayIntentBits.GuildMembers] : []),
  ];
}

/** Every subset of the requested flags, largest first, ending with none. */
export function fallbackCandidates(flags: IntentFlags): IntentFlags[] {
  const ocrOptions = flags.ocrPassive ? [true, false] : [false];
  const autoOptions = flags.autoAssignRole ? [true, false] : [false];
  const candidates: IntentFlags[] = [];
  for (const ocrPassive of ocrOptions) {
    for (const autoAssignRole of autoOptions) candidates.push({ ocrPassive, autoAssignRole });
  }
  const enabled = (f: IntentFlags) => Number(f.ocrPassive) + Number(f.autoAssignRole);
  return candidates.sort((a, b) => enabled(b) - enabled(a));
}

/** Gateway close code 4014: the app asked for a privileged intent it has not been granted. */
export function isDisallowedIntentsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if ((err as { code?: unknown }).code === 4014) return true;
  return /disallowed intents|privileged intent/i.test(err.message);
}
```

`src/discord/client.ts`:

```ts
import { Client, Partials, type GatewayIntentBits } from 'discord.js';
import type { Logger } from '../log.js';
import { fallbackCandidates, intentsFor, isDisallowedIntentsError, type IntentFlags } from './intents.js';

export function createClient(intents: GatewayIntentBits[]): Client {
  return new Client({ intents, partials: [Partials.Channel] });
}

export interface LoginDeps {
  token: string;
  log: Logger;
  create(intents: GatewayIntentBits[]): Client;
  /** Attach event listeners. Called on every client before it logs in. */
  configure(client: Client): void;
}

const FLAG_HELP: Record<keyof IntentFlags, string> = {
  ocrPassive:
    'ocr.passive needs the Message Content intent. Enable it in the Discord Developer Portal ' +
    '(Bot → Privileged Gateway Intents). Passive screenshot OCR is off; /raid screenshot still works.',
  autoAssignRole:
    'autoAssignRole needs the Server Members intent. Enable it in the Discord Developer Portal ' +
    '(Bot → Privileged Gateway Intents). Auto-assigning a role on join is off.',
};

/**
 * Logs in with the requested intents. If Discord rejects a privileged intent, retries
 * with fewer, so the bot always comes online; the returned features say what is on.
 */
export async function loginWithFallback(
  requested: IntentFlags,
  deps: LoginDeps,
): Promise<{ client: Client; features: IntentFlags }> {
  for (const candidate of fallbackCandidates(requested)) {
    const client = deps.create(intentsFor(candidate));
    deps.configure(client);
    try {
      await client.login(deps.token);
    } catch (err) {
      await client.destroy();
      if (!isDisallowedIntentsError(err)) throw err;
      deps.log.warn({ tried: candidate }, 'Discord rejected a privileged intent; retrying with fewer');
      continue;
    }
    for (const flag of Object.keys(FLAG_HELP) as Array<keyof IntentFlags>) {
      if (requested[flag] && !candidate[flag]) deps.log.warn(FLAG_HELP[flag]);
    }
    return { client, features: candidate };
  }
  throw new Error('Discord rejected the login even without privileged intents');
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/discord/intents.test.ts src/discord/client.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Lint, typecheck, commit**

Run: `npm run lint && npm run typecheck`
Expected: exit 0.

```bash
git add src/discord/intents.ts src/discord/intents.test.ts src/discord/client.ts src/discord/client.test.ts test/support/test-logger.ts
git commit -m "Add Discord client with optional privileged intents and login fallback" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: AppContext, command contracts and the interaction router

The router dispatches every interaction to a command or component handler, runs guards, and turns errors into ephemeral replies with a log reference (spec 3.2, 7).

**Files:**
- Create: `src/app-context.ts`, `src/discord/command.ts`, `src/discord/router.ts`, `test/support/fake-interactions.ts`, `test/support/test-context.ts`
- Test: `src/discord/router.test.ts`

**Interfaces:**
- Consumes: `Config`, `loadSettings`, `loadEnv` (Task 1); `DB` (Task 4); `Logger` (Task 3); `UserError`, `CustomId`, `decodeCustomId` (Task 5); `IntentFlags` (Task 6); `createTestLogger` (Task 6); `TEST_ENV` (Task 1).
- Produces:
  - `interface AppContext { readonly config: Config; readonly log: Logger; readonly db: Kysely<DB>; readonly commands: readonly CommandModule[]; features: IntentFlags }`
  - `type GuardableInteraction = ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction`
  - `type Guard = (interaction: GuardableInteraction, ctx: AppContext) => void | Promise<void>` (throws `UserError` to refuse)
  - `interface CommandHelp { category: string; details?: string; examples?: string[] }`
  - `interface CommandModule { data: { readonly name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody }; help: CommandHelp; guards?: readonly Guard[]; execute(i: ChatInputCommandInteraction, ctx: AppContext): Promise<void>; autocomplete?(i: AutocompleteInteraction, ctx: AppContext): Promise<void> }`
  - `interface ComponentHandler { kind: string; guards?: readonly Guard[]; handle(i: MessageComponentInteraction | ModalSubmitInteraction, id: CustomId, ctx: AppContext): Promise<void> }`
  - `class InteractionRouter { constructor(ctx: AppContext, commands: readonly CommandModule[], components: readonly ComponentHandler[]); handle(interaction: Interaction): Promise<void> }`
  - `replyEphemeral(i: GuardableInteraction, content: string): Promise<void>`
  - `STALE_COMPONENT` message constant
  - Test helpers: `fakeChatInput(options)`, `fakeAutocomplete(options)`, `fakeButton(options)`, `createTestContext(overrides?)`

- [ ] **Step 1: Write the contracts**

`src/app-context.ts`:

```ts
import type { Kysely } from 'kysely';
import type { Config } from './config/index.js';
import type { DB } from './db/types.js';
import type { CommandModule } from './discord/command.js';
import type { IntentFlags } from './discord/intents.js';
import type { Logger } from './log.js';

/** Everything a handler may use. Later phases add services here. */
export interface AppContext {
  readonly config: Config;
  readonly log: Logger;
  readonly db: Kysely<DB>;
  readonly commands: readonly CommandModule[];
  /** Privileged-intent features actually granted at login (may be fewer than configured). */
  features: IntentFlags;
}
```

`src/discord/command.ts`:

```ts
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { AppContext } from '../app-context.js';
import type { CustomId } from './custom-id.js';

export type GuardableInteraction =
  | ChatInputCommandInteraction
  | MessageComponentInteraction
  | ModalSubmitInteraction;

/** A precondition. Throw a UserError to refuse; return normally to allow. */
export type Guard = (interaction: GuardableInteraction, ctx: AppContext) => void | Promise<void>;

export interface CommandHelp {
  /** Help category id, e.g. 'basic-raid'. Categories outside settings.helpGroups are staff-only. */
  category: string;
  details?: string;
  examples?: string[];
}

export interface CommandModule {
  /** A SlashCommandBuilder (or anything with the same shape). */
  data: { readonly name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  help: CommandHelp;
  guards?: readonly Guard[];
  execute(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction, ctx: AppContext): Promise<void>;
}

/** Handles buttons, selects and modals whose custom id has this `kind`. */
export interface ComponentHandler {
  kind: string;
  guards?: readonly Guard[];
  handle(
    interaction: MessageComponentInteraction | ModalSubmitInteraction,
    id: CustomId,
    ctx: AppContext,
  ): Promise<void>;
}
```

- [ ] **Step 2: Write the test helpers**

`test/support/fake-interactions.ts`:

```ts
import { Collection } from 'discord.js';
import { vi } from 'vitest';

interface FakeOptions {
  commandName?: string;
  customId?: string;
  deferred?: boolean;
  replied?: boolean;
  guildId?: string | null;
  channelName?: string;
  parentName?: string | null;
  isDm?: boolean;
  userId?: string;
  roleNames?: string[];
  options?: Record<string, string | null>;
  focused?: string;
}

/**
 * Just enough of a discord.js interaction for router, guard and command tests.
 * Cast to the concrete interaction type at the call site.
 */
function base(kind: 'chat' | 'autocomplete' | 'button', o: FakeOptions) {
  const guildId = o.isDm ? null : (o.guildId ?? '412345678901234567');
  const interaction = {
    id: '900000000000000001',
    type: kind === 'autocomplete' ? 4 : kind === 'chat' ? 2 : 3,
    commandName: o.commandName,
    customId: o.customId,
    guildId,
    channelId: '600000000000000001',
    user: { id: o.userId ?? '700000000000000001' },
    member: {
      roles: {
        cache: new Collection((o.roleNames ?? []).map((name, i) => [String(i), { id: String(i), name }])),
      },
    },
    channel: {
      name: o.channelName ?? 'general',
      parent: o.parentName ? { name: o.parentName } : null,
      isDMBased: () => o.isDm ?? false,
    },
    deferred: o.deferred ?? false,
    replied: o.replied ?? false,
    responded: false,
    isChatInputCommand: () => kind === 'chat',
    isAutocomplete: () => kind === 'autocomplete',
    isMessageComponent: () => kind === 'button',
    isModalSubmit: () => false,
    inCachedGuild: () => guildId !== null,
    inGuild: () => guildId !== null,
    options: {
      getString: (name: string) => o.options?.[name] ?? null,
      getFocused: () => o.focused ?? '',
    },
    reply: vi.fn(() => {
      interaction.replied = true;
      return Promise.resolve();
    }),
    followUp: vi.fn(() => Promise.resolve()),
    respond: vi.fn(() => {
      interaction.responded = true;
      return Promise.resolve();
    }),
  };
  return interaction;
}

export const fakeChatInput = (o: FakeOptions = {}) => base('chat', { commandName: 'test', ...o });
export const fakeAutocomplete = (o: FakeOptions = {}) => base('autocomplete', { commandName: 'test', ...o });
export const fakeButton = (o: FakeOptions = {}) => base('button', o);
export type FakeInteraction = ReturnType<typeof base>;
```

`test/support/test-context.ts`:

```ts
import type { Kysely } from 'kysely';
import type { AppContext } from '../../src/app-context.js';
import { loadEnv } from '../../src/config/env.js';
import { loadSettings } from '../../src/config/settings.js';
import type { DB } from '../../src/db/types.js';
import { createTestLogger } from './test-logger.js';
import { TEST_ENV } from './test-env.js';

/** An AppContext with real settings, the test env, a capturing logger and no database. */
export function createTestContext(overrides: Partial<AppContext> = {}) {
  const { log, entries } = createTestLogger();
  const ctx: AppContext = {
    config: { settings: loadSettings('data/settings.json'), env: loadEnv(TEST_ENV) },
    log,
    db: {} as Kysely<DB>,
    commands: [],
    features: { ocrPassive: false, autoAssignRole: false },
    ...overrides,
  };
  return { ctx, entries };
}
```

- [ ] **Step 3: Write the failing router tests**

`src/discord/router.test.ts`:

```ts
import { MessageFlags, type Interaction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { fakeAutocomplete, fakeButton, fakeChatInput } from '../../test/support/fake-interactions.js';
import { createTestContext } from '../../test/support/test-context.js';
import type { CommandModule, ComponentHandler } from './command.js';
import { UserError } from './errors.js';
import { InteractionRouter, STALE_COMPONENT } from './router.js';

const asInteraction = (fake: unknown) => fake as Interaction;

function command(overrides: Partial<CommandModule> = {}): CommandModule {
  return {
    data: { name: 'test', toJSON: () => ({ name: 'test', description: 'Test' }) },
    help: { category: 'util' },
    execute: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe('InteractionRouter', () => {
  it('runs guards then the command', async () => {
    const { ctx } = createTestContext();
    const order: string[] = [];
    const cmd = command({
      guards: [() => void order.push('guard')],
      execute: vi.fn(() => {
        order.push('execute');
        return Promise.resolve();
      }),
    });
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(fakeChatInput()));
    expect(order).toEqual(['guard', 'execute']);
  });

  it('shows a UserError ephemerally without logging an error', async () => {
    const { ctx, entries } = createTestContext();
    const cmd = command({ guards: [() => { throw new UserError('Use this in a raid post.'); }] });
    const i = fakeChatInput();
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
    expect(i.reply).toHaveBeenCalledWith({ content: 'Use this in a raid post.', flags: MessageFlags.Ephemeral });
    expect(cmd.execute).not.toHaveBeenCalled();
    expect(entries.filter((e) => e.level === 50)).toHaveLength(0);
  });

  it('logs an unexpected error with a reference shown to the user', async () => {
    const { ctx, entries } = createTestContext();
    const cmd = command({ execute: () => Promise.reject(new Error('boom')) });
    const i = fakeChatInput();
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));

    const logged = entries.find((e) => e.msg === 'interaction failed');
    expect(logged?.ref).toMatch(/^[0-9a-f]{6}$/);
    expect(i.reply).toHaveBeenCalledWith({
      content: `Something went wrong (ref \`${String(logged?.ref)}\`).`,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('uses followUp when the interaction was already deferred', async () => {
    const { ctx } = createTestContext();
    const cmd = command({ execute: () => Promise.reject(new UserError('Too late.')) });
    const i = fakeChatInput({ deferred: true });
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
    expect(i.reply).not.toHaveBeenCalled();
    expect(i.followUp).toHaveBeenCalledWith({ content: 'Too late.', flags: MessageFlags.Ephemeral });
  });

  it('logs, does not throw, when the error reply itself fails', async () => {
    const { ctx, entries } = createTestContext();
    const cmd = command({ execute: () => Promise.reject(new Error('boom')) });
    const i = fakeChatInput();
    i.reply.mockImplementation(() => Promise.reject(new Error('Unknown interaction')));
    await expect(new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i))).resolves.toBeUndefined();
    expect(entries.some((e) => e.msg === 'could not send error reply')).toBe(true);
  });

  it('answers an unknown command', async () => {
    const { ctx } = createTestContext();
    const i = fakeChatInput({ commandName: 'gone' });
    await new InteractionRouter(ctx, [], []).handle(asInteraction(i));
    expect(i.reply).toHaveBeenCalledWith({ content: 'That command is not available.', flags: MessageFlags.Ephemeral });
  });

  it('routes components by custom-id kind', async () => {
    const { ctx } = createTestContext();
    const handler: ComponentHandler = { kind: 'p', handle: vi.fn(() => Promise.resolve()) };
    await new InteractionRouter(ctx, [], [handler]).handle(asInteraction(fakeButton({ customId: 'p:abc:join' })));
    expect(handler.handle).toHaveBeenCalledWith(
      expect.anything(),
      { kind: 'p', id: 'abc', action: 'join', args: [] },
      ctx,
    );
  });

  it('tells the user a legacy or unknown control is no longer active', async () => {
    const { ctx } = createTestContext();
    const i = fakeButton({ customId: 'pinejoin' });
    await new InteractionRouter(ctx, [], []).handle(asInteraction(i));
    expect(i.reply).toHaveBeenCalledWith({ content: STALE_COMPONENT, flags: MessageFlags.Ephemeral });
  });

  it('responds with no choices when autocomplete fails', async () => {
    const { ctx } = createTestContext();
    const cmd = command({ autocomplete: () => Promise.reject(new Error('search down')) });
    const i = fakeAutocomplete();
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
    expect(i.respond).toHaveBeenCalledWith([]);
  });

  it('rejects duplicate command names at construction', () => {
    const { ctx } = createTestContext();
    expect(() => new InteractionRouter(ctx, [command(), command()], [])).toThrow(/Duplicate command \/test/);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/discord/router.test.ts`
Expected: FAIL, cannot resolve `./router.js`.

- [ ] **Step 5: Implement the router**

`src/discord/router.ts`:

```ts
import { randomBytes } from 'node:crypto';
import {
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../app-context.js';
import type { CommandModule, ComponentHandler, Guard, GuardableInteraction } from './command.js';
import { decodeCustomId } from './custom-id.js';
import { UserError } from './errors.js';

export const STALE_COMPONENT = 'This control is no longer active.';
const UNKNOWN_COMMAND = 'That command is not available.';
const genericError = (ref: string) => `Something went wrong (ref \`${ref}\`).`;

export async function replyEphemeral(interaction: GuardableInteraction, content: string): Promise<void> {
  const payload = { content, flags: MessageFlags.Ephemeral } as const;
  if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
  else await interaction.reply(payload);
}

export class InteractionRouter {
  private readonly commands = new Map<string, CommandModule>();
  private readonly components = new Map<string, ComponentHandler>();

  constructor(
    private readonly ctx: AppContext,
    commands: readonly CommandModule[],
    components: readonly ComponentHandler[],
  ) {
    for (const command of commands) {
      if (this.commands.has(command.data.name)) throw new Error(`Duplicate command /${command.data.name}`);
      this.commands.set(command.data.name, command);
    }
    for (const handler of components) {
      if (this.components.has(handler.kind)) throw new Error(`Duplicate component kind "${handler.kind}"`);
      this.components.set(handler.kind, handler);
    }
  }

  async handle(interaction: Interaction): Promise<void> {
    if (interaction.isChatInputCommand()) return this.handleCommand(interaction);
    if (interaction.isAutocomplete()) return this.handleAutocomplete(interaction);
    if (interaction.isMessageComponent() || interaction.isModalSubmit()) return this.handleComponent(interaction);
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);
    await this.guarded(interaction, async () => {
      if (!command) throw new UserError(UNKNOWN_COMMAND);
      await runGuards(command.guards, interaction, this.ctx);
      await command.execute(interaction, this.ctx);
    });
  }

  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);
    try {
      if (command?.autocomplete) await command.autocomplete(interaction, this.ctx);
      else await interaction.respond([]);
    } catch (err) {
      this.ctx.log.error({ err, interaction: describe(interaction) }, 'autocomplete failed');
      if (!interaction.responded) await interaction.respond([]).catch(() => undefined);
    }
  }

  private async handleComponent(
    interaction: MessageComponentInteraction | ModalSubmitInteraction,
  ): Promise<void> {
    const id = decodeCustomId(interaction.customId);
    const handler = id ? this.components.get(id.kind) : undefined;
    await this.guarded(interaction, async () => {
      if (!id || !handler) {
        this.ctx.log.warn({ customId: interaction.customId }, 'no handler for component');
        throw new UserError(STALE_COMPONENT);
      }
      await runGuards(handler.guards, interaction, this.ctx);
      await handler.handle(interaction, id, this.ctx);
    });
  }

  private async guarded(interaction: GuardableInteraction, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      let content: string;
      if (err instanceof UserError) {
        content = err.message;
      } else {
        const ref = randomBytes(3).toString('hex');
        this.ctx.log.error({ err, ref, interaction: describe(interaction) }, 'interaction failed');
        content = genericError(ref);
      }
      await replyEphemeral(interaction, content).catch((replyErr: unknown) =>
        this.ctx.log.warn({ err: replyErr }, 'could not send error reply'),
      );
    }
  }
}

async function runGuards(
  guards: readonly Guard[] | undefined,
  interaction: GuardableInteraction,
  ctx: AppContext,
): Promise<void> {
  for (const guard of guards ?? []) await guard(interaction, ctx);
}

function describe(interaction: Interaction) {
  return {
    id: interaction.id,
    type: interaction.type,
    user: interaction.user.id,
    guild: interaction.guildId,
    channel: interaction.channelId,
    command: 'commandName' in interaction ? interaction.commandName : undefined,
    customId: 'customId' in interaction ? interaction.customId : undefined,
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/discord/router.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Lint, typecheck, commit**

Run: `npm run lint && npm run typecheck`
Expected: exit 0.

```bash
git add src/app-context.ts src/discord/command.ts src/discord/router.ts src/discord/router.test.ts test/support/fake-interactions.ts test/support/test-context.ts
git commit -m "Add interaction router with guards and ephemeral error replies" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Guards

Ports the legacy permission and channel checks (`Helper.isManagement`, `isBotManagement`, `isBotChannel`, the PvP category check) as reusable guards. Party and region guards (`inParty`, `inRegion`) need domain code and come in phases 1 and 2.

**Files:**
- Create: `src/discord/guards.ts`
- Test: `src/discord/guards.test.ts`

**Interfaces:**
- Consumes: `Guard`, `GuardableInteraction` (Task 7); `UserError` (Task 5); `Settings` (Task 1); `createTestContext`, fakes (Task 7).
- Produces:
  - Pure: `isManagement(roleNames: Iterable<string>, userId: string, ownerId: string): boolean`, `isBotManagement(roleNames: Iterable<string>, userId: string, ownerId: string): boolean`, `isBotChannelName(name: string | undefined, settings: Settings): boolean`, `isPvpContext(context: { isDm: boolean; parentName: string | undefined }, settings: Settings): boolean`, `memberRoleNames(interaction: GuardableInteraction): string[]`
  - Guards: `requireGuild`, `requireManagement`, `requireBotManagement`, `requireBotChannel`, `requirePvpContext`

- [ ] **Step 1: Write the failing tests**

`src/discord/guards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fakeChatInput } from '../../test/support/fake-interactions.js';
import { createTestContext } from '../../test/support/test-context.js';
import type { GuardableInteraction } from './command.js';
import { UserError } from './errors.js';
import {
  isBotChannelName,
  isBotManagement,
  isManagement,
  isPvpContext,
  requireBotChannel,
  requireBotManagement,
  requireGuild,
  requireManagement,
  requirePvpContext,
} from './guards.js';

const OWNER = '223456789012345678'; // TEST_ENV.OWNER_ID
const USER = '700000000000000001';
const { ctx } = createTestContext();
const { settings } = ctx.config;
const as = (fake: unknown) => fake as GuardableInteraction;

describe('role checks', () => {
  it('treats admin and moderator roles as management, case-insensitively', () => {
    expect(isManagement(['Admin'], USER, OWNER)).toBe(true);
    expect(isManagement(['MODERATOR'], USER, OWNER)).toBe(true);
    expect(isManagement(['bot developer'], USER, OWNER)).toBe(false);
  });

  it('treats the owner as management with no roles', () => {
    expect(isManagement([], OWNER, OWNER)).toBe(true);
  });

  it('adds bot developer for bot management', () => {
    expect(isBotManagement(['Bot Developer'], USER, OWNER)).toBe(true);
    expect(isBotManagement(['member'], USER, OWNER)).toBe(false);
  });
});

describe('channel checks', () => {
  it('recognises both bot channels by configured name', () => {
    expect(isBotChannelName('the-bot-lab', settings)).toBe(true);
    expect(isBotChannelName('mod-bot-only', settings)).toBe(true);
    expect(isBotChannelName('general', settings)).toBe(false);
    expect(isBotChannelName(undefined, settings)).toBe(false);
  });

  it('allows PvP commands in DMs and under the PvP category', () => {
    expect(isPvpContext({ isDm: true, parentName: undefined }, settings)).toBe(true);
    expect(isPvpContext({ isDm: false, parentName: 'PVP CHAT AND TOURNAMENTS' }, settings)).toBe(true);
    expect(isPvpContext({ isDm: false, parentName: 'RAIDS' }, settings)).toBe(false);
  });
});

describe('guards', () => {
  it('requireGuild refuses DMs', () => {
    expect(() => requireGuild(as(fakeChatInput({ isDm: true })), ctx)).toThrow(UserError);
    expect(() => requireGuild(as(fakeChatInput()), ctx)).not.toThrow();
  });

  it('requireManagement checks the member roles', () => {
    expect(() => requireManagement(as(fakeChatInput({ roleNames: ['member'] })), ctx)).toThrow(UserError);
    expect(() => requireManagement(as(fakeChatInput({ roleNames: ['moderator'] })), ctx)).not.toThrow();
  });

  it('requireBotManagement accepts bot developers', () => {
    expect(() => requireBotManagement(as(fakeChatInput({ roleNames: ['bot developer'] })), ctx)).not.toThrow();
  });

  it('requireBotChannel names the channel to use', () => {
    expect(() => requireBotChannel(as(fakeChatInput({ channelName: 'general' })), ctx)).toThrow(/#the-bot-lab/);
    expect(() => requireBotChannel(as(fakeChatInput({ channelName: 'the-bot-lab' })), ctx)).not.toThrow();
  });

  it('requirePvpContext uses the parent category', () => {
    expect(() => requirePvpContext(as(fakeChatInput({ parentName: 'RAIDS' })), ctx)).toThrow(UserError);
    expect(() => requirePvpContext(as(fakeChatInput({ isDm: true })), ctx)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/discord/guards.test.ts`
Expected: FAIL, cannot resolve `./guards.js`.

- [ ] **Step 3: Implement**

`src/discord/guards.ts`:

```ts
import type { Settings } from '../config/index.js';
import type { Guard, GuardableInteraction } from './command.js';
import { UserError } from './errors.js';

const MANAGEMENT_ROLES = new Set(['admin', 'moderator']);
const BOT_MANAGEMENT_ROLES = new Set([...MANAGEMENT_ROLES, 'bot developer']);

function hasRole(roleNames: Iterable<string>, allowed: Set<string>): boolean {
  for (const name of roleNames) if (allowed.has(name.toLowerCase())) return true;
  return false;
}

export function isManagement(roleNames: Iterable<string>, userId: string, ownerId: string): boolean {
  return userId === ownerId || hasRole(roleNames, MANAGEMENT_ROLES);
}

export function isBotManagement(roleNames: Iterable<string>, userId: string, ownerId: string): boolean {
  return userId === ownerId || hasRole(roleNames, BOT_MANAGEMENT_ROLES);
}

export function isBotChannelName(name: string | undefined, settings: Settings): boolean {
  return name !== undefined && (name === settings.channels['bot-lab'] || name === settings.channels['mod-bot-lab']);
}

export function isPvpContext(
  context: { isDm: boolean; parentName: string | undefined },
  settings: Settings,
): boolean {
  return context.isDm || context.parentName === settings.categories.pvp;
}

/** Role names of the invoking member; empty outside a cached guild. */
export function memberRoleNames(interaction: GuardableInteraction): string[] {
  if (!interaction.inCachedGuild()) return [];
  return interaction.member.roles.cache.map((role) => role.name);
}

function channelName(interaction: GuardableInteraction): string | undefined {
  const channel = interaction.channel;
  return channel && 'name' in channel && typeof channel.name === 'string' ? channel.name : undefined;
}

function parentName(interaction: GuardableInteraction): string | undefined {
  const channel = interaction.channel;
  if (!channel || !('parent' in channel) || !channel.parent) return undefined;
  return channel.parent.name;
}

export const requireGuild: Guard = (interaction) => {
  if (!interaction.inCachedGuild()) throw new UserError('This only works in a server.');
};

export const requireManagement: Guard = (interaction, ctx) => {
  requireGuild(interaction, ctx);
  if (!isManagement(memberRoleNames(interaction), interaction.user.id, ctx.config.env.OWNER_ID)) {
    throw new UserError('Only admins and moderators can do that.');
  }
};

export const requireBotManagement: Guard = (interaction, ctx) => {
  requireGuild(interaction, ctx);
  if (!isBotManagement(memberRoleNames(interaction), interaction.user.id, ctx.config.env.OWNER_ID)) {
    throw new UserError('Only admins, moderators and bot developers can do that.');
  }
};

export const requireBotChannel: Guard = (interaction, ctx) => {
  requireGuild(interaction, ctx);
  if (!isBotChannelName(channelName(interaction), ctx.config.settings)) {
    throw new UserError(`Use this in #${ctx.config.settings.channels['bot-lab']}.`);
  }
};

export const requirePvpContext: Guard = (interaction, ctx) => {
  const isDm = interaction.channel?.isDMBased() ?? false;
  if (!isPvpContext({ isDm, parentName: parentName(interaction) }, ctx.config.settings)) {
    throw new UserError(`Use this in a DM with me or under ${ctx.config.settings.categories.pvp}.`);
  }
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/discord/guards.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Lint, typecheck, commit**

Run: `npm run lint && npm run typecheck`
Expected: exit 0.

```bash
git add src/discord/guards.ts src/discord/guards.test.ts
git commit -m "Port management, bot-channel and PvP guards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `/help`, the command registry and command deployment

Adds the first real command, the single list every other command will join, and the script that registers that list with Discord (spec 4.2 `/help`, 3.1 `deploy.ts`).

**Files:**
- Create: `src/commands/categories.ts`, `src/commands/util/help-render.ts`, `src/commands/util/help.ts`, `src/commands/index.ts`, `src/discord/deploy.ts`, `src/discord/deploy-cli.ts`
- Test: `src/commands/util/help-render.test.ts`, `src/commands/util/help.test.ts`, `src/discord/deploy.test.ts`

**Interfaces:**
- Consumes: `CommandModule` (Task 7); `UserError` (Task 5); `isBotManagement`, `memberRoleNames` (Task 8); `loadEnv` (Task 1); fakes and `createTestContext` (Task 7).
- Produces:
  - `CATEGORY_LABELS: Readonly<Record<string, string>>`
  - `renderHelpOverview(commands: readonly CommandModule[], helpGroups: readonly string[], includeStaff: boolean): EmbedBuilder`
  - `renderCommandHelp(command: CommandModule): EmbedBuilder`
  - `help: CommandModule`
  - `commands: readonly CommandModule[]` (from `src/commands/index.ts`)
  - `buildCommandPayload(commands: readonly CommandModule[]): RESTPostAPIChatInputApplicationCommandsJSONBody[]`
  - `parseDeployArgs(argv: readonly string[]): { scope: 'global' } | { scope: 'guild'; guildId: string }`
  - `MAX_COMMANDS = 100`

- [ ] **Step 1: Write the failing tests**

`src/commands/util/help-render.test.ts`:

```ts
import { SlashCommandBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';
import type { CommandModule } from '../../discord/command.js';
import { renderCommandHelp, renderHelpOverview } from './help-render.js';

const noop = () => Promise.resolve();

function cmd(name: string, category: string, build?: (b: SlashCommandBuilder) => void): CommandModule {
  const data = new SlashCommandBuilder().setName(name).setDescription(`About ${name}`);
  build?.(data);
  return { data, help: { category }, execute: noop };
}

const all = [cmd('join', 'basic-raid'), cmd('raid', 'raid-crud'), cmd('gym', 'admin'), cmd('help', 'util')];
const groups = ['basic-raid', 'raid-crud', 'util'];

describe('renderHelpOverview', () => {
  it('lists public categories in helpGroups order with labels', () => {
    const fields = renderHelpOverview(all, groups, false).toJSON().fields ?? [];
    expect(fields.map((f) => f.name)).toEqual(['Raid Basics', 'Raid Creation and Maintenance', 'Utility']);
    expect(fields[0]?.value).toBe('`/join` About join');
  });

  it('appends staff-only categories for staff', () => {
    const fields = renderHelpOverview(all, groups, true).toJSON().fields ?? [];
    expect(fields.map((f) => f.name)).toEqual([
      'Raid Basics',
      'Raid Creation and Maintenance',
      'Utility',
      'Administration',
    ]);
  });

  it('keeps every field within Discord limits', () => {
    const many = Array.from({ length: 80 }, (_, i) => cmd(`command-number-${i}`, 'util'));
    const field = renderHelpOverview(many, ['util'], false).toJSON().fields?.[0];
    expect(field?.value.length).toBeLessThanOrEqual(1024);
    expect(field?.value.endsWith('…')).toBe(true);
  });
});

describe('renderCommandHelp', () => {
  it('shows usage with required and optional options, details and examples', () => {
    const command = cmd('meet', 'basic-raid', (b) =>
      b
        .addStringOption((o) => o.setName('time').setDescription('When').setRequired(true))
        .addStringOption((o) => o.setName('group').setDescription('Which group')),
    );
    command.help = { category: 'basic-raid', details: 'Sets your meeting time.', examples: ['/meet time:2:30'] };
    const json = renderCommandHelp(command).toJSON();
    expect(json.title).toBe('/meet');
    expect(json.description).toBe('About meet\n\nSets your meeting time.');
    expect(json.fields).toEqual([
      { name: 'Usage', value: '`/meet <time> [group]`' },
      { name: 'Examples', value: '`/meet time:2:30`' },
    ]);
  });

  it('expands subcommands', () => {
    const command = cmd('route', 'train', (b) =>
      b
        .addSubcommand((s) => s.setName('show').setDescription('Show'))
        .addSubcommand((s) =>
          s.setName('add').setDescription('Add').addStringOption((o) => o.setName('gym').setDescription('Gym').setRequired(true)),
        ),
    );
    const usage = renderCommandHelp(command).toJSON().fields?.[0]?.value;
    expect(usage).toBe('`/route show`\n`/route add <gym>`');
  });
});
```

`src/commands/util/help.test.ts`:

```ts
import { MessageFlags, type AutocompleteInteraction, type ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeAutocomplete, fakeChatInput } from '../../../test/support/fake-interactions.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { UserError } from '../../discord/errors.js';
import { help } from './help.js';

const { ctx } = createTestContext({ commands: [help] });

describe('/help', () => {
  it('replies ephemerally with the overview', async () => {
    const i = fakeChatInput({ commandName: 'help' });
    await help.execute(i as unknown as ChatInputCommandInteraction, ctx);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
  });

  it('explains one command, accepting a leading slash', async () => {
    const i = fakeChatInput({ commandName: 'help', options: { command: '/help' } });
    await help.execute(i as unknown as ChatInputCommandInteraction, ctx);
    const payload = i.reply.mock.calls[0]?.[0] as { embeds: Array<{ toJSON(): { title?: string } }> };
    expect(payload.embeds[0]?.toJSON().title).toBe('/help');
  });

  it('rejects an unknown command name', async () => {
    const i = fakeChatInput({ commandName: 'help', options: { command: 'nope' } });
    await expect(help.execute(i as unknown as ChatInputCommandInteraction, ctx)).rejects.toThrow(UserError);
  });

  it('autocompletes command names', async () => {
    const i = fakeAutocomplete({ commandName: 'help', focused: 'he' });
    await help.autocomplete!(i as unknown as AutocompleteInteraction, ctx);
    expect(i.respond).toHaveBeenCalledWith([{ name: '/help', value: 'help' }]);
  });
});
```

`src/discord/deploy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { commands } from '../commands/index.js';
import type { CommandModule } from './command.js';
import { buildCommandPayload, MAX_COMMANDS, parseDeployArgs } from './deploy.js';

const stub = (name: string): CommandModule => ({
  data: { name, toJSON: () => ({ name, description: name }) },
  help: { category: 'util' },
  execute: () => Promise.resolve(),
});

describe('buildCommandPayload', () => {
  it('serialises the real command list', () => {
    expect(buildCommandPayload(commands).map((c) => c.name)).toContain('help');
  });

  it('rejects duplicate names', () => {
    expect(() => buildCommandPayload([stub('a'), stub('a')])).toThrow(/Duplicate command \/a/);
  });

  it('rejects more commands than Discord allows', () => {
    const tooMany = Array.from({ length: MAX_COMMANDS + 1 }, (_, i) => stub(`c${i}`));
    expect(() => buildCommandPayload(tooMany)).toThrow(/100/);
  });
});

describe('parseDeployArgs', () => {
  it('parses --guild <id> and --global', () => {
    expect(parseDeployArgs(['--guild', '412345678901234567'])).toEqual({ scope: 'guild', guildId: '412345678901234567' });
    expect(parseDeployArgs(['--global'])).toEqual({ scope: 'global' });
  });

  it('requires exactly one scope', () => {
    expect(() => parseDeployArgs([])).toThrow(/--guild <id> or --global/);
    expect(() => parseDeployArgs(['--guild'])).toThrow(/--guild <id> or --global/);
    expect(() => parseDeployArgs(['--guild', '412345678901234567', '--global'])).toThrow(/--guild <id> or --global/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/commands src/discord/deploy.test.ts`
Expected: FAIL, cannot resolve `./help-render.js`, `./help.js`, `../commands/index.js`, `./deploy.js`.

- [ ] **Step 3: Implement help**

`src/commands/categories.ts`:

```ts
/** Display names for help categories; ids match settings.helpGroups. */
export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  'basic-raid': 'Raid Basics',
  'raid-crud': 'Raid Creation and Maintenance',
  train: 'Trains',
  meetup: 'Meetups',
  roles: 'Roles',
  notifications: 'Notifications',
  friends: 'Friend Codes',
  util: 'Utility',
  admin: 'Administration',
  region: 'Region setting',
};
```

`src/commands/util/help-render.ts`:

```ts
import { ApplicationCommandOptionType, EmbedBuilder, type APIApplicationCommandOption } from 'discord.js';
import type { CommandModule } from '../../discord/command.js';
import { CATEGORY_LABELS } from '../categories.js';

const FIELD_LIMIT = 1024;
const MAX_FIELDS = 25;

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

const byName = (a: CommandModule, b: CommandModule) => a.data.name.localeCompare(b.data.name);

export function renderHelpOverview(
  commands: readonly CommandModule[],
  helpGroups: readonly string[],
  includeStaff: boolean,
): EmbedBuilder {
  const byCategory = new Map<string, CommandModule[]>();
  for (const command of commands) {
    const list = byCategory.get(command.help.category) ?? [];
    list.push(command);
    byCategory.set(command.help.category, list);
  }
  const staff = [...byCategory.keys()].filter((c) => !helpGroups.includes(c)).sort();
  const order = [...helpGroups.filter((g) => byCategory.has(g)), ...(includeStaff ? staff : [])];

  const embed = new EmbedBuilder()
    .setTitle('Professor Pine commands')
    .setDescription('Use `/help command:<name>` for details on one command.');
  for (const category of order.slice(0, MAX_FIELDS)) {
    const lines = (byCategory.get(category) ?? [])
      .sort(byName)
      .map((c) => `\`/${c.data.name}\` ${c.data.toJSON().description}`);
    embed.addFields({ name: CATEGORY_LABELS[category] ?? category, value: truncate(lines.join('\n'), FIELD_LIMIT) });
  }
  return embed;
}

function usageLines(path: string, options: readonly APIApplicationCommandOption[]): string[] {
  const nested = options.filter(
    (o) =>
      o.type === ApplicationCommandOptionType.Subcommand ||
      o.type === ApplicationCommandOptionType.SubcommandGroup,
  );
  if (nested.length === 0) {
    const args = options.map((o) => ('required' in o && o.required ? `<${o.name}>` : `[${o.name}]`));
    return [`\`/${[path, ...args].join(' ')}\``];
  }
  return nested.flatMap((o) =>
    usageLines(`${path} ${o.name}`, 'options' in o && o.options ? o.options : []),
  );
}

export function renderCommandHelp(command: CommandModule): EmbedBuilder {
  const json = command.data.toJSON();
  const embed = new EmbedBuilder()
    .setTitle(`/${json.name}`)
    .setDescription([json.description, command.help.details].filter(Boolean).join('\n\n'));
  embed.addFields({ name: 'Usage', value: truncate(usageLines(json.name, json.options ?? []).join('\n'), FIELD_LIMIT) });
  if (command.help.examples?.length) {
    const examples = command.help.examples.map((e) => `\`${e}\``).join('\n');
    embed.addFields({ name: 'Examples', value: truncate(examples, FIELD_LIMIT) });
  }
  return embed;
}
```

`src/commands/util/help.ts`:

```ts
import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { CommandModule } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { isBotManagement, memberRoleNames } from '../../discord/guards.js';
import { renderCommandHelp, renderHelpOverview } from './help-render.js';

const MAX_CHOICES = 25;

export const help: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show what Professor Pine can do')
    .addStringOption((option) =>
      option.setName('command').setDescription('The command to explain').setAutocomplete(true),
    ),
  help: {
    category: 'util',
    details: 'Without a command, lists the commands you can use. With one, explains it.',
    examples: ['/help', '/help command:raid'],
  },

  async execute(interaction, ctx) {
    const name = interaction.options.getString('command')?.replace(/^\//, '').trim();
    if (name) {
      const command = ctx.commands.find((c) => c.data.name === name);
      if (!command) throw new UserError(`There is no /${name} command.`);
      await interaction.reply({ embeds: [renderCommandHelp(command)], flags: MessageFlags.Ephemeral });
      return;
    }
    const staff = isBotManagement(memberRoleNames(interaction), interaction.user.id, ctx.config.env.OWNER_ID);
    await interaction.reply({
      embeds: [renderHelpOverview(ctx.commands, ctx.config.settings.helpGroups, staff)],
      flags: MessageFlags.Ephemeral,
    });
  },

  async autocomplete(interaction, ctx) {
    const typed = interaction.options.getFocused().toLowerCase().replace(/^\//, '');
    const startsFirst = (a: string, b: string) =>
      Number(!a.startsWith(typed)) - Number(!b.startsWith(typed)) || a.localeCompare(b);
    const names = ctx.commands
      .map((c) => c.data.name)
      .filter((n) => n.includes(typed))
      .sort(startsFirst)
      .slice(0, MAX_CHOICES);
    await interaction.respond(names.map((n) => ({ name: `/${n}`, value: n })));
  },
};
```

`src/commands/index.ts`:

```ts
import type { CommandModule } from '../discord/command.js';
import { help } from './util/help.js';

/** Every slash command. The router and the deploy script both read this list. */
export const commands: readonly CommandModule[] = [help];
```

- [ ] **Step 4: Implement deployment**

`src/discord/deploy.ts`:

```ts
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { CommandModule } from './command.js';

export const MAX_COMMANDS = 100;

export function buildCommandPayload(
  commands: readonly CommandModule[],
): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  if (commands.length > MAX_COMMANDS) {
    throw new Error(`${commands.length} commands; Discord allows ${MAX_COMMANDS} per application`);
  }
  const seen = new Set<string>();
  return commands.map((command) => {
    const json = command.data.toJSON();
    if (seen.has(json.name)) throw new Error(`Duplicate command /${json.name}`);
    seen.add(json.name);
    return json;
  });
}

export function parseDeployArgs(
  argv: readonly string[],
): { scope: 'global' } | { scope: 'guild'; guildId: string } {
  const usage = new Error('Usage: npm run deploy-commands -- --guild <id> or --global');
  const guildIndex = argv.indexOf('--guild');
  const global = argv.includes('--global');
  if (guildIndex >= 0 && !global) {
    const guildId = argv[guildIndex + 1];
    if (!guildId || !/^\d{17,20}$/.test(guildId)) throw usage;
    return { scope: 'guild', guildId };
  }
  if (global && guildIndex < 0) return { scope: 'global' };
  throw usage;
}
```

`src/discord/deploy-cli.ts`:

```ts
import { REST, Routes } from 'discord.js';
import { commands } from '../commands/index.js';
import { loadEnv } from '../config/env.js';
import { buildCommandPayload, parseDeployArgs } from './deploy.js';

const env = loadEnv(process.env);
const target = parseDeployArgs(process.argv.slice(2));
const body = buildCommandPayload(commands);
const rest = new REST().setToken(env.DISCORD_TOKEN);
const route =
  target.scope === 'guild'
    ? Routes.applicationGuildCommands(env.DISCORD_APP_ID, target.guildId)
    : Routes.applicationCommands(env.DISCORD_APP_ID);

await rest.put(route, { body });
process.stdout.write(
  `Registered ${body.length} command(s) ${target.scope === 'guild' ? `in guild ${target.guildId}` : 'globally'}.\n`,
);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/commands src/discord/deploy.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 6: Lint, typecheck, commit**

Run: `npm run lint && npm run typecheck`
Expected: exit 0.

```bash
git add src/commands src/discord/deploy.ts src/discord/deploy-cli.ts src/discord/deploy.test.ts
git commit -m "Add /help, the command registry and the deploy script" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: App bootstrap, guild sync and graceful shutdown

Wires everything into a running bot: config, logger, database and migrations, client, router, Guild row syncing, and ordered shutdown on SIGTERM/SIGINT (spec 7).

**Files:**
- Create: `src/shutdown.ts`, `src/discord/guild-sync.ts`, `src/app.ts`, `src/index.ts`
- Test: `src/shutdown.test.ts`, `src/discord/guild-sync.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (Task 1); `dbConfigFrom` (Task 2); `createDb`, `runMigrations`, `createLogger` (Task 3); `DB`, `GuildRepository`, `GuildStore` (Task 4); `createClient`, `loginWithFallback` (Task 6); `AppContext`, `InteractionRouter` (Task 7); `commands` (Task 9).
- Produces:
  - `interface ShutdownStep { name: string; timeoutMs: number; run(): Promise<void> }`
  - `createShutdown(steps: readonly ShutdownStep[], log: Logger): () => Promise<void>` (idempotent)
  - `syncGuilds(store: GuildStore, guildIds: readonly string[], log: Logger): Promise<void>`
  - `startApp(rawEnv: Record<string, string | undefined>): Promise<{ log: Logger; shutdown: () => Promise<void> }>`

- [ ] **Step 1: Write the failing tests**

`src/shutdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../test/support/test-logger.js';
import { createShutdown } from './shutdown.js';

describe('createShutdown', () => {
  it('runs steps in order', async () => {
    const { log } = createTestLogger();
    const order: string[] = [];
    const step = (name: string) => ({ name, timeoutMs: 1000, run: () => Promise.resolve(void order.push(name)) });
    await createShutdown([step('scheduler'), step('discord'), step('database')], log)();
    expect(order).toEqual(['scheduler', 'discord', 'database']);
  });

  it('continues past a failing or hanging step', async () => {
    const { log, entries } = createTestLogger();
    const order: string[] = [];
    await createShutdown(
      [
        { name: 'fails', timeoutMs: 1000, run: () => Promise.reject(new Error('nope')) },
        { name: 'hangs', timeoutMs: 20, run: () => new Promise<void>(() => undefined) },
        { name: 'database', timeoutMs: 1000, run: () => Promise.resolve(void order.push('database')) },
      ],
      log,
    )();
    expect(order).toEqual(['database']);
    expect(entries.filter((e) => e.msg === 'shutdown step failed').map((e) => e.step)).toEqual(['fails', 'hangs']);
  });

  it('runs only once when called repeatedly', async () => {
    const { log } = createTestLogger();
    let runs = 0;
    const shutdown = createShutdown([{ name: 'x', timeoutMs: 1000, run: () => Promise.resolve(void runs++) }], log);
    await Promise.all([shutdown(), shutdown()]);
    await shutdown();
    expect(runs).toBe(1);
  });
});
```

`src/discord/guild-sync.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { GuildStore } from '../db/repositories/guild-repository.js';
import { syncGuilds } from './guild-sync.js';

describe('syncGuilds', () => {
  it('ensures every guild and logs failures without stopping', async () => {
    const { log, entries } = createTestLogger();
    const ensured: string[] = [];
    const store: GuildStore = {
      ensure: (id) => (id === 'bad' ? Promise.reject(new Error('db down')) : Promise.resolve(void ensured.push(id))),
      remove: () => Promise.resolve(),
    };
    await syncGuilds(store, ['a', 'bad', 'b'], log);
    expect(ensured).toEqual(['a', 'b']);
    expect(entries.some((e) => e.msg === 'could not record guild' && e.guild === 'bad')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shutdown.test.ts src/discord/guild-sync.test.ts`
Expected: FAIL, cannot resolve `./shutdown.js`, `./guild-sync.js`.

- [ ] **Step 3: Implement shutdown and guild sync**

`src/shutdown.ts`:

```ts
import type { Logger } from './log.js';

export interface ShutdownStep {
  name: string;
  timeoutMs: number;
  run(): Promise<void>;
}

async function withTimeout(work: () => Promise<void>, ms: number, name: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms} ms`)), ms);
  });
  try {
    await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs steps in order, each time-limited; a failed step never blocks the next. */
export function createShutdown(steps: readonly ShutdownStep[], log: Logger): () => Promise<void> {
  let running: Promise<void> | undefined;
  return () =>
    (running ??= (async () => {
      for (const step of steps) {
        try {
          await withTimeout(() => step.run(), step.timeoutMs, step.name);
          log.info({ step: step.name }, 'shutdown step finished');
        } catch (err) {
          log.error({ err, step: step.name }, 'shutdown step failed');
        }
      }
    })());
}
```

`src/discord/guild-sync.ts`:

```ts
import type { GuildStore } from '../db/repositories/guild-repository.js';
import type { Logger } from '../log.js';

/** Makes sure every guild the bot is in has a Guild row. */
export async function syncGuilds(store: GuildStore, guildIds: readonly string[], log: Logger): Promise<void> {
  const results = await Promise.allSettled(guildIds.map((id) => store.ensure(id)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      log.error({ err: result.reason as unknown, guild: guildIds[index] }, 'could not record guild');
    }
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shutdown.test.ts src/discord/guild-sync.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the app**

`src/app.ts`:

```ts
import { Events } from 'discord.js';
import type { AppContext } from './app-context.js';
import { commands } from './commands/index.js';
import { loadConfig } from './config/index.js';
import { dbConfigFrom } from './db/db-config.js';
import { createDb } from './db/kysely.js';
import { runMigrations } from './db/migrator.js';
import { GuildRepository } from './db/repositories/guild-repository.js';
import type { DB } from './db/types.js';
import { createClient, loginWithFallback } from './discord/client.js';
import { syncGuilds } from './discord/guild-sync.js';
import { InteractionRouter } from './discord/router.js';
import { createLogger, type Logger } from './log.js';
import { createShutdown } from './shutdown.js';

export async function startApp(
  rawEnv: Record<string, string | undefined>,
): Promise<{ log: Logger; shutdown: () => Promise<void> }> {
  const config = loadConfig(rawEnv);
  const log = createLogger({ level: config.env.LOG_LEVEL, pretty: config.env.NODE_ENV === 'development' });
  const db = createDb<DB>(dbConfigFrom(config.env));

  try {
    await runMigrations(db, log);
  } catch (err) {
    await db.destroy();
    throw err;
  }

  const requested = { ocrPassive: config.settings.ocr.passive, autoAssignRole: config.settings.autoAssignRole };
  const ctx: AppContext = { config, log, db, commands, features: requested };
  const router = new InteractionRouter(ctx, commands, []);
  const guilds = new GuildRepository(db);

  const { client, features } = await loginWithFallback(requested, {
    token: config.env.DISCORD_TOKEN,
    log,
    create: createClient,
    configure(client) {
      client.once(Events.ClientReady, (ready) => {
        log.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'connected to Discord');
        void syncGuilds(guilds, [...ready.guilds.cache.keys()], log);
      });
      client.on(Events.GuildCreate, (guild) => {
        guilds.ensure(guild.id).catch((err: unknown) => log.error({ err, guild: guild.id }, 'could not record guild'));
      });
      client.on(Events.GuildDelete, (guild) => {
        guilds.remove(guild.id).catch((err: unknown) => log.error({ err, guild: guild.id }, 'could not remove guild'));
      });
      client.on(Events.InteractionCreate, (interaction) => void router.handle(interaction));
      client.on(Events.Error, (err) => log.error({ err }, 'discord client error'));
      client.on(Events.Warn, (message) => log.warn(message));
    },
  });
  ctx.features = features;
  log.info({ features }, 'optional features');

  const shutdown = createShutdown(
    [
      { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
      { name: 'database', timeoutMs: 5_000, run: () => db.destroy() },
    ],
    log,
  );
  return { log, shutdown };
}
```

`src/index.ts`:

```ts
import { startApp } from './app.js';

let app: Awaited<ReturnType<typeof startApp>>;
try {
  app = await startApp(process.env);
} catch (err) {
  process.stderr.write(`Professor Pine failed to start: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
}

const { log, shutdown } = app;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'shutting down');
    void shutdown().finally(() => process.exit(0));
  });
}

process.on('unhandledRejection', (reason) => log.error({ err: reason }, 'unhandled promise rejection'));
process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'uncaught exception; exiting so the supervisor restarts the bot');
  void shutdown().finally(() => process.exit(1));
});
```

- [ ] **Step 6: Build and run the full local check**

Run: `npm run check && npm run build`
Expected: exit 0; `dist/index.js` exists.

- [ ] **Step 7: Commit**

```bash
git add src/shutdown.ts src/shutdown.test.ts src/discord/guild-sync.ts src/discord/guild-sync.test.ts src/app.ts src/index.ts
git commit -m "Wire app bootstrap, guild sync and graceful shutdown" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: CI, environment template, README and staging smoke check

Makes the foundation reproducible for the next phases and proves it against real Discord.

**Files:**
- Create: `.github/workflows/ci.yml`, `.env.example`
- Rewrite: `README.md`
- Delete: `data/private-settings.json.default` (secrets now come from the environment)

**Interfaces:**
- Consumes: all npm scripts from Task 1; `db:codegen -- --verify` from Task 4.
- Produces: a green CI run on the branch; a documented staging procedure.

- [ ] **Step 1: Write the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm test
      - name: Generated database types are current
        run: npm run db:codegen -- --verify
      - run: npm run build
```

- [ ] **Step 2: Write `.env.example`**

```dotenv
# Copy to .env and fill in. Blank optional values mean "not set".

# Discord application (Developer Portal → your app)
DISCORD_TOKEN=
DISCORD_APP_ID=
# Your Discord user ID; always counts as an admin
OWNER_ID=

# MySQL: the existing Professor Pine database, or an empty schema for a new install
DB_HOST=localhost
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_SCHEMA=pine

# Base URL for Pokémon images
POKEMON_IMAGE_BASE=

# Optional
GOOGLE_API_KEY=
GITHUB_TOKEN=
GITHUB_REPO=
REGION_MAP_LINK=

# fatal | error | warn | info | debug | trace | silent
LOG_LEVEL=info
# development enables pretty logs
NODE_ENV=production
# SETTINGS_PATH=data/settings.json
```

- [ ] **Step 3: Rewrite `README.md`**

```markdown
# Professor Pine Discord Bot

Pokémon GO raid coordination for Discord. This branch is the TypeScript rewrite;
see `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`.

### Official Discord server (setup help, support, feedback, etc.)
 - https://discord.com/invite/8FkjJVe

## Requirements

- Node 24
- MySQL 8 with either the existing Professor Pine database (the legacy bot must have applied all its migrations) or an empty schema for a new install
- Docker, only for running the database tests

## Setup

1. `npm ci`
2. Copy `.env.example` to `.env` and fill it in.
3. Review `data/settings.json`, especially `timezone`.
4. `npm run deploy-commands -- --guild <server id>` while testing, or `-- --global` for production.
5. `npm run build && npm start` (or `npm run dev` while developing).

## Privileged intents

Pine needs none. Two optional features need one each, enabled in `data/settings.json`
and in the Developer Portal (Bot → Privileged Gateway Intents):

| Setting | Intent | Feature |
|---|---|---|
| `ocr.passive` | Message Content | Read raid screenshots dropped in region channels |
| `autoAssignRole` | Server Members | Give new members a role when they join |

If a setting is on but the portal toggle is off, Pine starts anyway with that feature
disabled and logs which toggle to enable.

## Development

| Script | Does |
|---|---|
| `npm run check` | lint, format check, typecheck, unit tests |
| `npm test` | all tests, including database tests (needs Docker) |
| `npm run migrate` | apply database migrations |
| `npm run db:codegen` | regenerate `src/db/types.ts` after adding a migration |
| `npm run db:legacy-fixture` | rebuild the legacy schema test fixture (rarely needed) |
```

- [ ] **Step 4: Remove the legacy secrets template and verify everything**

```bash
git rm -q data/private-settings.json.default
npm run check && npm test && npm run build
```

Expected: all pass (unit and db projects).

- [ ] **Step 5: Commit and push**

```bash
git add .github/workflows/ci.yml .env.example README.md
git commit -m "Add CI, environment template and README for the TypeScript bot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Pushing is outward-facing: ask the maintainer before the first push. Once they agree:

```bash
git push -u origin typescript-migration
```

Confirm the CI run on GitHub is green before continuing.

- [ ] **Step 6: Staging smoke check (manual, with the maintainer)**

Needs the staging guild, a test application token, and a copy of the production database (spec section 11). Record each result in the task report.

1. With `.env` pointing at the production copy, `npm run migrate` logs `migration applied` for `2026_10_09_000_baseline`, then `database is up to date`. A second run applies nothing.
1a. Create an empty schema (`create database pine_fresh`), point `DB_SCHEMA` at it, and run `npm run migrate`: it creates the Pine tables (no `knex_migrations`). Point `DB_SCHEMA` back afterwards.
2. `npm run deploy-commands -- --guild <staging id>` reports 1 command.
3. `npm run dev`: logs `connected to Discord` and `optional features` with both false. Portal privileged toggles may be off.
4. `/help` in staging shows an ephemeral overview with a Utility section; as a non-staff member there is no Administration section.
5. `/help command:help` shows usage `/help [command]`; typing `/help command:he` autocompletes `/help`.
6. Set `ocr.passive` to `true` with the Message Content toggle **off**, restart: the bot still connects, logs the `ocr.passive needs the Message Content intent` warning, and `optional features` shows `ocrPassive: false`. If instead it crashes, the disallowed-intents error has a shape `isDisallowedIntentsError` does not recognise: log the raw error, extend the check and its test, and rerun. Set the flag back to `false`.
7. Kick the bot from a scratch server and re-add it: `Guild` gains and loses that row.
8. Ctrl+C: logs `shutdown step finished` for `discord` then `database`, and the process exits.

- [ ] **Step 7: Final commit if the smoke check changed anything**

```bash
git add -A src test
git commit -m "Fix issues found in staging smoke check" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Skip if nothing changed.
