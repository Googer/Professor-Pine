# Phase 1A: Data Access and Time Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the new bot typed, tested access to the legacy `User`, `Region`, `Gym` and `GymMeta` tables and a pure, time-zone-aware port of the legacy time-argument parser, and clear the Phase 0 follow-ups that touch the database layer.

**Architecture:** Repositories in `src/db/repositories/` wrap Kysely and return plain domain objects (booleans instead of tinyints, `{ lat, lon }` instead of `{ x, y }`, decoded text instead of HTML entities); nothing outside them sees column names. Time parsing lives in `src/domain/time/` with no Discord or database imports: one module turns text into a clock reading or a duration, another applies the party's valid window. No new tables or migrations are added in this plan.

**Tech Stack:** TypeScript 6.0, Kysely 0.29 on mysql2, MySQL 8 spatial functions, Luxon, `he`, Vitest, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md` (sections 6.1, 6.2, 8; phase 1 row of section 9). Phase 1 is split into three plans: this one (1A), game data and raid bosses (1B), and search, image cache and static maps (1C).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`).
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension.
- `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- **No new migrations and no schema changes in this plan.** `src/db/types.ts`, `src/db/baseline/legacy-schema.ts` and `test/fixtures/legacy-schema.sql` are generated; only Task 1 regenerates them, with the scripts.
- The legacy bot must still be able to read every row this code writes (rollback): gym `name`, `nickname`, `description` and `notice` are stored HTML-entity-encoded with `he.encode` and decoded on read; `GymMeta.keywords` is a lower-case string joined with `", "`; `taggedEx`/`confirmedEx` are `1` or `NULL`.
- Coordinates in SQL follow the legacy order: `POINT(lat, lon)`, polygons as `POLYGON((lat lon, lat lon, ...))`. In a geometry value `x` is latitude and `y` is longitude.
- Snowflakes are strings everywhere. A snowflake compared with the `BIGINT` column `Region.channelId` goes through `snowflakeParam()` (Task 4), never a bare string parameter. Never compare `Region.channelId` with a `VARCHAR` snowflake column in SQL.
- Times are epoch milliseconds in data and Luxon `DateTime` in the zone `settings.timezone` while computing. Never use the server's local zone or `new Date()` parsing.
- Test files are colocated: `*.test.ts` (unit, no Docker) and `*.db.test.ts` (needs Docker). Tests use real MySQL and real pino loggers, not mocks.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (re-run lint after formatting). Tasks 1, 3, 4 and 5 also run their `*.db.test.ts` file.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `.idea/`.

## Review Focus

1. Gym text written by the legacy bot is HTML-entity-encoded (`Joe&#x27;s Caf&#xE9;`). A person must see `Joe's Café` from the new bot, and the legacy bot must still see correct text for gyms the new bot writes. Test: Task 5, "decodes legacy entity-encoded text" and "stores text entity-encoded like the legacy bot".
2. Two region channels whose 19-digit IDs differ only in the last digit must never be confused; JavaScript numbers and MySQL's string-to-number comparison both lose that digit. Test: Task 4, "tells apart channel IDs that differ only in the last digit".
3. A member who has never used the bot has no `User` row. Reading their settings must return the defaults (mentions on, and so on) without creating a row, not fail. Test: Task 3, "returns defaults for a member with no row, without creating one".
4. A time typed just before midnight for just after it (`12:10` at 23:50) must resolve to tomorrow 00:10. The legacy parser only tried today and next year, so it refused. Test: Task 6, "resolves a time just after midnight to tomorrow".
5. A gym that lies outside every region (bad coordinates, a region not yet imported) must yield an empty list of channels, not an error. Test: Task 4, "returns no channels for a point outside every region".

---

## File Structure

```
scripts/
  codegen.ts                         modify: also exclude knex_migrations* from generated types
  legacy-schema/
    generate.ts                      modify: no DROP TABLE in the fixture; fixed migration_time
    normalise.ts                     create: normaliseMigrationTimes()
    normalise.test.ts                create
  legacy-parity/
    moment-time-cases.ts             create: writes test/fixtures/legacy-time-cases.json using the legacy moment version
src/
  log.ts                             modify: redact secrets
  log.test.ts                        modify
  db/
    spatial.ts                       create: polygonWkt, ringFromPolygon, snowflakeParam
    spatial.test.ts                  create
    migrator.db.test.ts              modify: new-install idempotency, detectDatabaseState
    repositories/
      guild-repository.db.test.ts    modify: assert guildId is defined
      user-repository.ts             create
      user-repository.db.test.ts     create
      region-repository.ts           create
      region-repository.db.test.ts   create
      gym-repository.ts              create
      gym-repository.db.test.ts      create
  domain/
    geo/lat-lon.ts                   create: LatLon, isClosedRing
    geo/lat-lon.test.ts              create
    party/status.ts                  create: PartyStatus, RaidPrivacy
    party/status.test.ts             create
    time/clock-input.ts              create: parseClockInput, parseRelativeMinutes
    time/clock-input.test.ts         create (includes the legacy parity test)
    time/party-time.ts               create: resolvePartyTime
    time/party-time.test.ts          create
test/
  fixtures/
    settings.json                    create: settings used by tests
    legacy-schema.sql                regenerated
    legacy-schema.test.ts            create
    legacy-time-cases.json           create (generated)
  support/
    test-context.ts                  modify: use the fixture settings
    migrated-db.ts                   create: startMigratedDatabase()
CLAUDE.md                            modify (Task 6)
docs/superpowers/plans/phase-0-follow-ups.md   modify (Task 6)
```

---

### Task 1: Database housekeeping from Phase 0

Clears four Phase 0 follow-ups: the test fixture must not contain `DROP TABLE`, re-running the generator must not churn the file, typed writes to `knex_migrations` must not compile, and the migrator needs two missing tests.

**Files:**
- Create: `scripts/legacy-schema/normalise.ts`, `scripts/legacy-schema/normalise.test.ts`, `test/fixtures/legacy-schema.test.ts`
- Modify: `scripts/legacy-schema/generate.ts`, `scripts/codegen.ts`, `src/db/migrator.db.test.ts`, `src/db/repositories/guild-repository.db.test.ts`
- Regenerate: `test/fixtures/legacy-schema.sql`, `src/db/baseline/legacy-schema.ts`, `src/db/types.ts`

**Interfaces:**
- Consumes: `detectDatabaseState(db)` from `src/db/migrations/2026_10_09_000_baseline.ts`, returning `{ state: 'empty' | 'legacy-complete' | 'legacy-incomplete' | 'foreign'; tables: string[] }`; `startDatabase`, `TestDatabase` from `test/support/mysql.ts`.
- Produces: `normaliseMigrationTimes(sql: string): string`; a `DB` type in `src/db/types.ts` with no `knex_migrations` or `knex_migrations_lock` keys.

- [ ] **Step 1: Write the failing tests for the fixture**

`scripts/legacy-schema/normalise.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FIXED_MIGRATION_TIME, normaliseMigrationTimes } from './normalise.js';

describe('normaliseMigrationTimes', () => {
  it('replaces every timestamp literal with the fixed one', () => {
    const dump =
      "INSERT INTO `knex_migrations` VALUES (1,'20180101-a.js',1,'2026-10-10 11:33:07'),(2,'20180102-b.js',1,'2026-10-10 11:33:08');";
    expect(normaliseMigrationTimes(dump)).toBe(
      `INSERT INTO \`knex_migrations\` VALUES (1,'20180101-a.js',1,'${FIXED_MIGRATION_TIME}'),(2,'20180102-b.js',1,'${FIXED_MIGRATION_TIME}');`,
    );
  });

  it('leaves migration names and other strings alone', () => {
    const dump = "INSERT INTO `knex_migrations` VALUES (1,'20221014-pokemon-elite.js',9,NULL);";
    expect(normaliseMigrationTimes(dump)).toBe(dump);
  });
});
```

`test/fixtures/legacy-schema.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXED_MIGRATION_TIME } from '../../scripts/legacy-schema/normalise.js';
import { LEGACY_SCHEMA_FIXTURE } from '../support/mysql.js';

describe('legacy schema fixture', () => {
  const fixture = readFileSync(LEGACY_SCHEMA_FIXTURE, 'utf8');

  it('never drops a table', () => {
    expect(fixture).not.toMatch(/drop\s+table/i);
  });

  it('uses the fixed migration time so regenerating does not change the file', () => {
    const times = fixture.match(/'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}'/g) ?? [];
    expect(times.length).toBeGreaterThan(0);
    expect(new Set(times)).toEqual(new Set([`'${FIXED_MIGRATION_TIME}'`]));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run scripts/legacy-schema/normalise.test.ts test/fixtures/legacy-schema.test.ts`
Expected: FAIL. The first file cannot resolve `./normalise.js`; the second too (same import).

- [ ] **Step 3: Implement the normaliser**

`scripts/legacy-schema/normalise.ts`:

```ts
/** Every knex_migrations row in the fixture gets this time, so re-running the generator is a no-op. */
export const FIXED_MIGRATION_TIME = '2022-10-14 00:00:00';

const TIMESTAMP_LITERAL = /'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}'/g;

/** Replaces the wall-clock times mysqldump wrote for knex_migrations.migration_time. */
export function normaliseMigrationTimes(sql: string): string {
  return sql.replace(TIMESTAMP_LITERAL, `'${FIXED_MIGRATION_TIME}'`);
}
```

- [ ] **Step 4: Change the generator**

In `scripts/legacy-schema/generate.ts`:

1. Add the import below the `order-statements.js` import:

```ts
import { normaliseMigrationTimes } from './normalise.js';
```

2. In `dump()`, add `'--skip-add-drop-table',` to the argument array, directly after `'--skip-comments',`.

3. Replace the `migrationRows` statement with:

```ts
  const migrationRows = normaliseMigrationTimes(
    await dump(['--no-create-info', 'pine', 'knex_migrations', 'knex_migrations_lock']),
  );
```

- [ ] **Step 5: Regenerate the fixture (needs Docker)**

Run: `npm run db:legacy-fixture`
Expected: prints `Wrote …legacy-schema.sql` and `Wrote …legacy-schema.ts`.

Run: `git diff --stat`
Expected: `test/fixtures/legacy-schema.sql` changed (DROP TABLE lines removed, times replaced). `src/db/baseline/legacy-schema.ts` must be **unchanged**; if it changed, stop and report what differs rather than committing it.

- [ ] **Step 6: Run the fixture tests to verify they pass**

Run: `npx vitest run scripts/legacy-schema/normalise.test.ts test/fixtures/legacy-schema.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Exclude the knex tables from the generated types**

In `scripts/codegen.ts`, replace the `'kysely_migration*',` argument (the value after `'--exclude-pattern'`) with:

```ts
      '@(kysely_migration*|knex_migrations*)',
```

Run: `npm run db:codegen`
Then: `grep -c "knex_migrations\|KnexMigrations" src/db/types.ts`
Expected: `0`. `git diff src/db/types.ts` shows only the removal of the `KnexMigrations` and `KnexMigrationsLock` interfaces and their two `DB` entries. If the pattern is rejected or the count is not 0, try `'{kysely_migration*,knex_migrations*}'`; report which one worked.

Run: `npm run db:codegen -- --verify`
Expected: `Generated types are up-to-date!`

- [ ] **Step 8: Add the missing migrator tests**

In `src/db/migrator.db.test.ts`, add this import after the existing `LEGACY_REQUIRED_MIGRATION` import, merging it into that line:

```ts
import {
  detectDatabaseState,
  LEGACY_REQUIRED_MIGRATION,
} from './migrations/2026_10_09_000_baseline.js';
```

Add these two tests inside `describe('runMigrations', …)`, after the test `'is idempotent'`:

```ts
  it('is idempotent on a new install', async () => {
    database = await startDatabase({ legacySchema: false });
    await migrate(database);
    const before = await describeSchema(database);
    await expect(migrate(database)).resolves.toBeUndefined();
    expect(await describeSchema(database)).toEqual(before);
  });

  it('classifies each kind of database', async () => {
    database = await startDatabase({ legacySchema: false });
    other = await startDatabase({ legacySchema: true });
    const empty = createDb<unknown>(database.config);
    const legacy = createDb<unknown>(other.config);
    try {
      expect((await detectDatabaseState(empty)).state).toBe('empty');
      await database.query('create table invoices (id int primary key)');
      expect(await detectDatabaseState(empty)).toEqual({ state: 'foreign', tables: ['invoices'] });

      expect((await detectDatabaseState(legacy)).state).toBe('legacy-complete');
      await other.query('delete from knex_migrations where name = ?', [LEGACY_REQUIRED_MIGRATION]);
      expect((await detectDatabaseState(legacy)).state).toBe('legacy-incomplete');
    } finally {
      await empty.destroy();
      await legacy.destroy();
    }
  });
```

In `src/db/repositories/guild-repository.db.test.ts`, in both tests that call `guilds.idFor('412345678901234567')` and then insert into `Region`, add this line directly after the `const guildId = …` line:

```ts
    expect(guildId).toBeDefined();
```

- [ ] **Step 9: Run the database tests**

Run: `npx vitest run src/db/migrator.db.test.ts src/db/repositories/guild-repository.db.test.ts test/support/mysql.db.test.ts`
Expected: PASS (migrator 10 tests, guild repository 4, harness tests unchanged). These tests describe behaviour that already exists, so they pass without a code change; if one fails, that is a real defect: stop and report it.

- [ ] **Step 10: Check and commit**

Run: `npx prettier --write scripts/legacy-schema scripts/codegen.ts src/db/migrator.db.test.ts src/db/repositories/guild-repository.db.test.ts test/fixtures/legacy-schema.test.ts && npm run check`
Expected: green.

```bash
git add scripts/legacy-schema scripts/codegen.ts src/db/types.ts src/db/migrator.db.test.ts src/db/repositories/guild-repository.db.test.ts test/fixtures/legacy-schema.sql test/fixtures/legacy-schema.test.ts
git commit -m "Harden the legacy fixture and generated types; add migrator tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Test settings fixture and log redaction

Unit tests currently read the operator's `data/settings.json`, so a local customisation breaks them. Secrets are reachable through `ctx.config.env` and nothing stops them being logged.

**Files:**
- Create: `test/fixtures/settings.json`
- Modify: `test/support/test-context.ts`, `src/log.ts`, `src/log.test.ts`

**Interfaces:**
- Consumes: `loadSettings(path)`, `loadEnv(raw)`, `TEST_ENV`, `createTestLogger()`.
- Produces: `TEST_SETTINGS_PATH: string` exported from `test/support/test-context.ts`; `createLogger(options: { level: string; pretty: boolean }, destination?: DestinationStream): Logger`; `REDACT_PATHS: string[]` exported from `src/log.ts`.

- [ ] **Step 1: Write the failing redaction tests**

Add to `src/log.test.ts` (keep the existing tests; add `createLogger` and `REDACT_PATHS` to the existing import from `./log.js` if they are not already imported):

```ts
describe('secret redaction', () => {
  function capture() {
    const entries: Array<Record<string, unknown>> = [];
    const log = createLogger(
      { level: 'info', pretty: false },
      { write: (line: string) => entries.push(JSON.parse(line) as Record<string, unknown>) },
    );
    return { log, entries };
  }

  it('redacts secrets logged through the app context shape', () => {
    const { log, entries } = capture();
    log.info(
      { config: { env: { DISCORD_TOKEN: 'abc.def', DB_PASSWORD: 'hunter2', DB_HOST: 'db1' } } },
      'ctx',
    );
    expect(entries[0]?.config).toEqual({
      env: { DISCORD_TOKEN: '[redacted]', DB_PASSWORD: '[redacted]', DB_HOST: 'db1' },
    });
  });

  it('redacts secrets logged as a bare env object or one level down', () => {
    const { log, entries } = capture();
    log.info({ env: { GITHUB_TOKEN: 'ghp_x', GOOGLE_API_KEY: 'AIza' } }, 'env');
    log.info({ DISCORD_TOKEN: 'abc.def' }, 'top');
    log.info({ anything: { DB_PASSWORD: 'hunter2' } }, 'nested');
    expect(entries[0]?.env).toEqual({ GITHUB_TOKEN: '[redacted]', GOOGLE_API_KEY: '[redacted]' });
    expect(entries[1]?.DISCORD_TOKEN).toBe('[redacted]');
    expect(entries[2]?.anything).toEqual({ DB_PASSWORD: '[redacted]' });
  });

  it('covers every secret environment variable', () => {
    for (const key of ['DISCORD_TOKEN', 'DB_PASSWORD', 'GITHUB_TOKEN', 'GOOGLE_API_KEY']) {
      expect(REDACT_PATHS).toContain(`config.env.${key}`);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/log.test.ts`
Expected: FAIL: `REDACT_PATHS` is not exported, and `createLogger` ignores the second argument so `entries` stays empty.

- [ ] **Step 3: Implement redaction**

Replace `src/log.ts` with:

```ts
import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

export type { Logger } from 'pino';

const SECRET_KEYS = ['DISCORD_TOKEN', 'DB_PASSWORD', 'GITHUB_TOKEN', 'GOOGLE_API_KEY'] as const;
/** Where an env object usually sits in a log entry: bare, as `env`, inside a config or context, or one level down. */
const PREFIXES = ['', 'env.', 'config.env.', 'ctx.config.env.', '*.'] as const;

export const REDACT_PATHS: string[] = PREFIXES.flatMap((prefix) =>
  SECRET_KEYS.map((key) => `${prefix}${key}`),
);

/** `destination` is for tests; production logs to stdout. It is ignored when `pretty` is on. */
export function createLogger(
  options: { level: string; pretty: boolean },
  destination?: DestinationStream,
): Logger {
  const config: LoggerOptions = {
    level: options.level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(options.pretty ? { transport: { target: 'pino-pretty' } } : {}),
  };
  return destination && !options.pretty ? pino(config, destination) : pino(config);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/log.test.ts`
Expected: PASS, including the tests that were already there.

- [ ] **Step 5: Give tests their own settings file**

Run: `cp data/settings.json test/fixtures/settings.json`

In `test/support/test-context.ts`:

1. Add `import path from 'node:path';` as the first import.
2. Add below the imports:

```ts
/** Settings for tests. Deliberately not data/settings.json, which operators customise. */
export const TEST_SETTINGS_PATH = path.resolve(import.meta.dirname, '../fixtures/settings.json');
```

3. Replace `loadSettings('data/settings.json')` with `loadSettings(TEST_SETTINGS_PATH)`.

Run: `grep -rn "data/settings.json" src test scripts --include=*.ts`
Expected: the only remaining matches are in `src/config/` (the default path and tests of the shipped file). For any other test that loads `data/settings.json`, import `TEST_SETTINGS_PATH` from `test/support/test-context.js` and use it instead. Leave a test alone if its purpose is to check that the shipped `data/settings.json` is valid.

- [ ] **Step 6: Check and commit**

Run: `npx prettier --write src/log.ts src/log.test.ts test/support/test-context.ts && npm run check`
Expected: green.

```bash
git add src/log.ts src/log.test.ts test/support/test-context.ts test/fixtures/settings.json
git commit -m "Redact secrets in logs; give tests their own settings file" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Party status constants and UserRepository

The `User` table holds each member's notification switches, auto-status, privacy, nickname, friend code and Pokebattler ID. Legacy code is `app/user.js` and the `status`/`privacy` constants in `app/constants.js`.

**Files:**
- Create: `src/domain/party/status.ts`, `src/domain/party/status.test.ts`, `test/support/migrated-db.ts`, `src/db/repositories/user-repository.ts`, `src/db/repositories/user-repository.db.test.ts`

**Interfaces:**
- Consumes: `createDb<DB>(config)`, `runMigrations(db, log)`, `startDatabase`, `DB` from `src/db/types.ts`.
- Produces:
  - `PartyStatus` (`NotInterested: -1, Interested: 0, Coming: 1, Present: 2, CompletePending: 3, Complete: 4`) and `RaidPrivacy` (`Visible: 0, Anonymous: 1`) const objects with same-named union types; `toPartyStatus(value: number): PartyStatus`; `toRaidPrivacy(value: number): RaidPrivacy`.
  - `startMigratedDatabase(): Promise<{ database: TestDatabase; db: Kysely<DB>; stop(): Promise<void> }>`.
  - `UserSettings`, `UserSettingsPatch`, `DEFAULT_USER_SETTINGS`, and `class UserRepository` with `get(snowflake): Promise<UserSettings>`, `idFor(snowflake): Promise<number | undefined>`, `ensure(snowflake): Promise<number>`, `update(snowflake, patch): Promise<void>`, `snowflakeForNickname(nickname): Promise<string | undefined>`.

- [ ] **Step 1: Write the failing unit test for the constants**

`src/domain/party/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PartyStatus, RaidPrivacy, toPartyStatus, toRaidPrivacy } from './status.js';

describe('party status constants', () => {
  it('keeps the integers the legacy bot stores', () => {
    expect(PartyStatus).toEqual({
      NotInterested: -1,
      Interested: 0,
      Coming: 1,
      Present: 2,
      CompletePending: 3,
      Complete: 4,
    });
    expect(RaidPrivacy).toEqual({ Visible: 0, Anonymous: 1 });
  });

  it('accepts stored values and falls back for anything else', () => {
    expect(toPartyStatus(1)).toBe(PartyStatus.Coming);
    expect(toPartyStatus(-1)).toBe(PartyStatus.NotInterested);
    expect(toPartyStatus(17)).toBe(PartyStatus.Interested);
    expect(toRaidPrivacy(1)).toBe(RaidPrivacy.Anonymous);
    expect(toRaidPrivacy(9)).toBe(RaidPrivacy.Visible);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/domain/party/status.test.ts`
Expected: FAIL, cannot resolve `./status.js`.

- [ ] **Step 3: Implement the constants**

`src/domain/party/status.ts`:

```ts
/** An attendee's status. The integers are what the legacy bot stores in User.status and party state. */
export const PartyStatus = {
  NotInterested: -1,
  Interested: 0,
  Coming: 1,
  Present: 2,
  CompletePending: 3,
  Complete: 4,
} as const;
export type PartyStatus = (typeof PartyStatus)[keyof typeof PartyStatus];

/** Whether a raid report names its reporter (User.raidPrivacy). */
export const RaidPrivacy = { Visible: 0, Anonymous: 1 } as const;
export type RaidPrivacy = (typeof RaidPrivacy)[keyof typeof RaidPrivacy];

const STATUSES: readonly number[] = Object.values(PartyStatus);
const PRIVACIES: readonly number[] = Object.values(RaidPrivacy);

/** Unknown stored values become Interested, the column default. */
export function toPartyStatus(value: number): PartyStatus {
  return STATUSES.includes(value) ? (value as PartyStatus) : PartyStatus.Interested;
}

/** Unknown stored values become Visible, the column default. */
export function toRaidPrivacy(value: number): RaidPrivacy {
  return PRIVACIES.includes(value) ? (value as RaidPrivacy) : RaidPrivacy.Visible;
}
```

Run: `npx vitest run src/domain/party/status.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 4: Add the shared database test helper**

`test/support/migrated-db.ts`:

```ts
import type { Kysely } from 'kysely';
import { pino } from 'pino';
import { createDb } from '../../src/db/kysely.js';
import { runMigrations } from '../../src/db/migrator.js';
import type { DB } from '../../src/db/types.js';
import { startDatabase, type TestDatabase } from './mysql.js';

/** A throwaway MySQL holding the legacy schema with every Kysely migration applied. */
export async function startMigratedDatabase(): Promise<{
  database: TestDatabase;
  db: Kysely<DB>;
  stop(): Promise<void>;
}> {
  const database = await startDatabase({ legacySchema: true });
  const db = createDb<DB>(database.config);
  await runMigrations(db, pino({ level: 'silent' }));
  return {
    database,
    db,
    async stop() {
      await db.destroy();
      await database.stop();
    },
  };
}
```

- [ ] **Step 5: Write the failing repository test**

`src/db/repositories/user-repository.db.test.ts`:

```ts
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import type { DB } from '../types.js';
import { DEFAULT_USER_SETTINGS, UserRepository } from './user-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';

describe('UserRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let users: UserRepository;

  beforeAll(async () => {
    const started = await startMigratedDatabase();
    ({ db, stop } = started);
    users = new UserRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('User').execute();
  });

  it('returns defaults for a member with no row, without creating one', async () => {
    expect(await users.get(ALICE)).toEqual({ snowflake: ALICE, ...DEFAULT_USER_SETTINGS });
    expect(await db.selectFrom('User').selectAll().execute()).toHaveLength(0);
    expect(await users.idFor(ALICE)).toBeUndefined();
  });

  it('has the column defaults as its defaults', async () => {
    await users.ensure(ALICE);
    expect(await users.get(ALICE)).toEqual({ snowflake: ALICE, ...DEFAULT_USER_SETTINGS });
  });

  it('ensure creates one row and returns the same id each time', async () => {
    const first = await users.ensure(ALICE);
    const second = await users.ensure(ALICE);
    expect(second).toBe(first);
    expect(await users.idFor(ALICE)).toBe(first);
    expect(await db.selectFrom('User').selectAll().execute()).toHaveLength(1);
  });

  it('update creates the row and stores every field', async () => {
    await users.update(ALICE, {
      mentions: false,
      mentionsGroups: false,
      mentionsShouts: false,
      mentionsTrainStops: false,
      bossSetNotification: true,
      newTrainNotification: true,
      autoStatus: PartyStatus.Coming,
      raidPrivacy: RaidPrivacy.Anonymous,
      nickname: 'AliceGo',
      friendCode: '1234 5678 9012',
      pokebattlerId: 4242,
    });
    expect(await users.get(ALICE)).toEqual({
      snowflake: ALICE,
      mentions: false,
      mentionsGroups: false,
      mentionsShouts: false,
      mentionsTrainStops: false,
      bossSetNotification: true,
      newTrainNotification: true,
      autoStatus: PartyStatus.Coming,
      raidPrivacy: RaidPrivacy.Anonymous,
      nickname: 'AliceGo',
      friendCode: '1234 5678 9012',
      pokebattlerId: 4242,
    });
  });

  it('update changes only the fields given and only that member', async () => {
    await users.update(ALICE, { nickname: 'AliceGo', mentions: false });
    await users.update(BOB, { nickname: 'BobGo' });
    await users.update(ALICE, { friendCode: '1111 2222 3333' });
    const alice = await users.get(ALICE);
    expect(alice.nickname).toBe('AliceGo');
    expect(alice.mentions).toBe(false);
    expect(alice.friendCode).toBe('1111 2222 3333');
    expect((await users.get(BOB)).friendCode).toBeNull();
  });

  it('update with an empty patch only ensures the row', async () => {
    await users.update(ALICE, {});
    expect(await users.idFor(ALICE)).toBeDefined();
  });

  it('clears nullable fields with null', async () => {
    await users.update(ALICE, { nickname: 'AliceGo', pokebattlerId: 7 });
    await users.update(ALICE, { nickname: null, pokebattlerId: null });
    const alice = await users.get(ALICE);
    expect(alice.nickname).toBeNull();
    expect(alice.pokebattlerId).toBeNull();
  });

  it('reads a legacy row with a NULL raidBoss and an out-of-range status', async () => {
    await db
      .insertInto('User')
      .values({ userSnowflake: ALICE, raidBoss: null, status: 42 })
      .execute();
    const alice = await users.get(ALICE);
    expect(alice.bossSetNotification).toBe(false);
    expect(alice.autoStatus).toBe(PartyStatus.Interested);
  });

  it('finds a member by game nickname, ignoring case', async () => {
    await users.update(ALICE, { nickname: 'AliceGo' });
    expect(await users.snowflakeForNickname('alicego')).toBe(ALICE);
    expect(await users.snowflakeForNickname('nobody')).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/db/repositories/user-repository.db.test.ts`
Expected: FAIL, cannot resolve `./user-repository.js`.

- [ ] **Step 7: Implement the repository**

`src/db/repositories/user-repository.ts`:

```ts
import type { Kysely, Updateable } from 'kysely';
import {
  PartyStatus,
  RaidPrivacy,
  toPartyStatus,
  toRaidPrivacy,
} from '../../domain/party/status.js';
import type { DB } from '../types.js';

/** One member's personal settings, as the rest of the bot sees them. */
export interface UserSettings {
  snowflake: string;
  /** May be @mentioned in party posts at all. */
  mentions: boolean;
  /** Mentioned when a new group is created (column `groups`). */
  mentionsGroups: boolean;
  /** Mentioned by /shout (column `shouts`). */
  mentionsShouts: boolean;
  /** Mentioned when a train moves (column `trainMovement`). */
  mentionsTrainStops: boolean;
  /** DM when an egg they are attending gets a boss (column `raidBoss`). */
  bossSetNotification: boolean;
  /** DM when a train is created (column `newTrain`). */
  newTrainNotification: boolean;
  /** Status applied to the reporter of a new raid (column `status`). */
  autoStatus: PartyStatus;
  raidPrivacy: RaidPrivacy;
  /** In-game name (column `nickname`). */
  nickname: string | null;
  friendCode: string | null;
  pokebattlerId: number | null;
}

export type UserSettingsPatch = Partial<Omit<UserSettings, 'snowflake'>>;

/** What a member with no row has. These equal the column defaults. */
export const DEFAULT_USER_SETTINGS: Omit<UserSettings, 'snowflake'> = {
  mentions: true,
  mentionsGroups: true,
  mentionsShouts: true,
  mentionsTrainStops: true,
  bossSetNotification: false,
  newTrainNotification: false,
  autoStatus: PartyStatus.Interested,
  raidPrivacy: RaidPrivacy.Visible,
  nickname: null,
  friendCode: null,
  pokebattlerId: null,
};

function toColumns(patch: UserSettingsPatch): Updateable<DB['User']> {
  const columns: Updateable<DB['User']> = {};
  if (patch.mentions !== undefined) columns.mentions = Number(patch.mentions);
  if (patch.mentionsGroups !== undefined) columns.groups = Number(patch.mentionsGroups);
  if (patch.mentionsShouts !== undefined) columns.shouts = Number(patch.mentionsShouts);
  if (patch.mentionsTrainStops !== undefined) {
    columns.trainMovement = Number(patch.mentionsTrainStops);
  }
  if (patch.bossSetNotification !== undefined) columns.raidBoss = Number(patch.bossSetNotification);
  if (patch.newTrainNotification !== undefined) {
    columns.newTrain = Number(patch.newTrainNotification);
  }
  if (patch.autoStatus !== undefined) columns.status = patch.autoStatus;
  if (patch.raidPrivacy !== undefined) columns.raidPrivacy = patch.raidPrivacy;
  if (patch.nickname !== undefined) columns.nickname = patch.nickname;
  if (patch.friendCode !== undefined) columns.friendcode = patch.friendCode;
  if (patch.pokebattlerId !== undefined) columns.pokebattlerId = patch.pokebattlerId;
  return columns;
}

/** The User table: one row per member who has changed a setting. */
export class UserRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /** The member's settings; the defaults when they have no row. Never creates a row. */
  async get(snowflake: string): Promise<UserSettings> {
    const row = await this.db
      .selectFrom('User')
      .selectAll()
      .where('userSnowflake', '=', snowflake)
      .executeTakeFirst();
    if (!row) return { snowflake, ...DEFAULT_USER_SETTINGS };
    return {
      snowflake,
      mentions: row.mentions === 1,
      mentionsGroups: row.groups === 1,
      mentionsShouts: row.shouts === 1,
      mentionsTrainStops: row.trainMovement === 1,
      bossSetNotification: row.raidBoss === 1,
      newTrainNotification: row.newTrain === 1,
      autoStatus: toPartyStatus(row.status),
      raidPrivacy: toRaidPrivacy(row.raidPrivacy),
      nickname: row.nickname,
      friendCode: row.friendcode,
      pokebattlerId: row.pokebattlerId,
    };
  }

  /** The row id other tables reference (PokemonNotification.userId and so on). */
  async idFor(snowflake: string): Promise<number | undefined> {
    const row = await this.db
      .selectFrom('User')
      .select('id')
      .where('userSnowflake', '=', snowflake)
      .executeTakeFirst();
    return row?.id;
  }

  /** Creates the member's row if it is missing and returns its id. */
  async ensure(snowflake: string): Promise<number> {
    const existing = await this.idFor(snowflake);
    if (existing !== undefined) return existing;
    await this.db
      .insertInto('User')
      .values({ userSnowflake: snowflake })
      .onDuplicateKeyUpdate({ userSnowflake: snowflake })
      .execute();
    const id = await this.idFor(snowflake);
    if (id === undefined) throw new Error(`User row for ${snowflake} vanished after insert`);
    return id;
  }

  /** Changes the given fields, creating the row when needed. */
  async update(snowflake: string, patch: UserSettingsPatch): Promise<void> {
    const columns = toColumns(patch);
    if (Object.keys(columns).length === 0) {
      await this.ensure(snowflake);
      return;
    }
    await this.db
      .insertInto('User')
      .values({ userSnowflake: snowflake, ...columns })
      .onDuplicateKeyUpdate(columns)
      .execute();
  }

  /** Who registered this in-game name. The column's collation makes the match case-insensitive. */
  async snowflakeForNickname(nickname: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('User')
      .select('userSnowflake')
      .where('nickname', '=', nickname)
      .orderBy('id')
      .executeTakeFirst();
    return row?.userSnowflake ?? undefined;
  }
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run src/db/repositories/user-repository.db.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 9: Check and commit**

Run: `npx prettier --write src/domain/party src/db/repositories/user-repository.ts src/db/repositories/user-repository.db.test.ts test/support/migrated-db.ts && npm run check`
Expected: green.

```bash
git add src/domain/party src/db/repositories/user-repository.ts src/db/repositories/user-repository.db.test.ts test/support/migrated-db.ts
git commit -m "Add party status constants and UserRepository" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Geometry helpers and RegionRepository

A region is a Discord text channel plus a polygon. Legacy code is `app/region.js` (`storeRegion`, `getAllRegions`, `getChannelsForGym`, `regionChannelForGym`, `getRegionsRaw`), which builds SQL by string concatenation; this port uses parameters only.

**Files:**
- Create: `src/domain/geo/lat-lon.ts`, `src/domain/geo/lat-lon.test.ts`, `src/db/spatial.ts`, `src/db/spatial.test.ts`, `src/db/repositories/region-repository.ts`, `src/db/repositories/region-repository.db.test.ts`

**Interfaces:**
- Consumes: `startMigratedDatabase()` (Task 3), `GuildRepository` (`ensure`, `idFor`), `DB` and `Polygon` from `src/db/types.ts`.
- Produces:
  - `interface LatLon { lat: number; lon: number }`; `isClosedRing(ring: readonly LatLon[]): boolean`.
  - `polygonWkt(ring: readonly LatLon[]): string`; `ringFromPolygon(polygon: Polygon | null): LatLon[] | null`; `snowflakeParam(id: string): RawBuilder<string>`; `isSnowflake(id: string): boolean`.
  - `interface Region { id: number; guildId: number | null; channelId: string; description: string | null; bounds: LatLon[] | null }` and `class RegionRepository` with `findByChannel(channelId): Promise<Region | undefined>`, `listForGuild(guildId: number): Promise<Region[]>`, `listAll(): Promise<Region[]>`, `saveBounds(guildId: number, channelId: string, ring: readonly LatLon[]): Promise<Region>`, `setDescription(channelId: string, description: string | null): Promise<boolean>`, `channelsContaining(point: LatLon, guildId?: number): Promise<string[]>`, `delete(channelId: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing unit tests**

`src/domain/geo/lat-lon.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isClosedRing, type LatLon } from './lat-lon.js';

const SQUARE: LatLon[] = [
  { lat: 40.4, lon: -80.05 },
  { lat: 40.4, lon: -79.95 },
  { lat: 40.5, lon: -79.95 },
  { lat: 40.5, lon: -80.05 },
  { lat: 40.4, lon: -80.05 },
];

describe('isClosedRing', () => {
  it('accepts a ring whose last point repeats the first', () => {
    expect(isClosedRing(SQUARE)).toBe(true);
  });

  it('rejects an open ring', () => {
    expect(isClosedRing(SQUARE.slice(0, 4))).toBe(false);
  });

  it('rejects fewer than four points', () => {
    const first = SQUARE[0] as LatLon;
    expect(isClosedRing([first, { lat: 40.5, lon: -80 }, first])).toBe(false);
    expect(isClosedRing([])).toBe(false);
  });
});
```

`src/db/spatial.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { LatLon } from '../domain/geo/lat-lon.js';
import { isSnowflake, polygonWkt, ringFromPolygon, snowflakeParam } from './spatial.js';

const SQUARE: LatLon[] = [
  { lat: 40.4, lon: -80.05 },
  { lat: 40.4, lon: -79.95 },
  { lat: 40.5, lon: -79.95 },
  { lat: 40.5, lon: -80.05 },
  { lat: 40.4, lon: -80.05 },
];

describe('polygonWkt', () => {
  it('writes latitude first, as the legacy bot does', () => {
    expect(polygonWkt(SQUARE)).toBe(
      'POLYGON((40.4 -80.05,40.4 -79.95,40.5 -79.95,40.5 -80.05,40.4 -80.05))',
    );
  });

  it('refuses an open ring', () => {
    expect(() => polygonWkt(SQUARE.slice(0, 4))).toThrow(/closed/);
  });

  it('refuses coordinates that are not finite numbers', () => {
    const broken = SQUARE.map((p, i) => (i === 1 ? { lat: Number.NaN, lon: p.lon } : p));
    expect(() => polygonWkt(broken)).toThrow(/finite/);
  });
});

describe('ringFromPolygon', () => {
  it('reads x as latitude and y as longitude from the outer ring', () => {
    const polygon = [SQUARE.map((p) => ({ x: p.lat, y: p.lon }))];
    expect(ringFromPolygon(polygon)).toEqual(SQUARE);
  });

  it('returns null for a missing or empty polygon', () => {
    expect(ringFromPolygon(null)).toBeNull();
    expect(ringFromPolygon([])).toBeNull();
  });
});

describe('snowflakes', () => {
  it('recognises Discord IDs', () => {
    expect(isSnowflake('1234567890123456789')).toBe(true);
    expect(isSnowflake('123456789012345678')).toBe(true);
    expect(isSnowflake('12345')).toBe(false);
    expect(isSnowflake('1234567890123456789; drop table Region')).toBe(false);
    expect(isSnowflake('')).toBe(false);
  });

  it('refuses to build a parameter from anything else', () => {
    expect(() => snowflakeParam('not-an-id')).toThrow(/snowflake/);
    expect(() => snowflakeParam('1234567890123456789')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/domain/geo src/db/spatial.test.ts`
Expected: FAIL, cannot resolve `./lat-lon.js` and `./spatial.js`.

- [ ] **Step 3: Implement the helpers**

`src/domain/geo/lat-lon.ts`:

```ts
/** A position in decimal degrees. */
export interface LatLon {
  lat: number;
  lon: number;
}

/** A polygon outline is usable when it has at least a triangle and ends where it starts. */
export function isClosedRing(ring: readonly LatLon[]): boolean {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length < 4 || !first || !last) return false;
  return first.lat === last.lat && first.lon === last.lon;
}
```

`src/db/spatial.ts`:

```ts
import { sql, type RawBuilder } from 'kysely';
import { isClosedRing, type LatLon } from '../domain/geo/lat-lon.js';
import type { Polygon } from './types.js';

/**
 * Well-known text for a region outline. Latitude comes first, as in every polygon the legacy
 * bot stored, so gyms are tested with POINT(lat, lon).
 */
export function polygonWkt(ring: readonly LatLon[]): string {
  if (!isClosedRing(ring)) {
    throw new Error('A region outline must be a closed ring of at least four points');
  }
  for (const { lat, lon } of ring) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error('Region coordinates must be finite numbers');
    }
  }
  return `POLYGON((${ring.map(({ lat, lon }) => `${lat} ${lon}`).join(',')}))`;
}

/** The outer ring of a stored polygon; x is latitude and y is longitude. */
export function ringFromPolygon(polygon: Polygon | null): LatLon[] | null {
  const outer = polygon?.[0];
  if (!outer || outer.length === 0) return null;
  return outer.map(({ x, y }) => ({ lat: x, lon: y }));
}

const SNOWFLAKE = /^\d{15,20}$/;

export function isSnowflake(id: string): boolean {
  return SNOWFLAKE.test(id);
}

/**
 * A snowflake for comparison with a BIGINT column. MySQL compares a string with a number as
 * doubles, which cannot tell 19-digit IDs apart; an explicit cast keeps the comparison exact.
 */
export function snowflakeParam(id: string): RawBuilder<string> {
  if (!isSnowflake(id)) throw new Error(`Not a Discord snowflake: ${JSON.stringify(id)}`);
  return sql<string>`cast(${id} as unsigned)`;
}
```

Run: `npx vitest run src/domain/geo src/db/spatial.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 4: Write the failing repository test**

`src/db/repositories/region-repository.db.test.ts`:

```ts
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { LatLon } from '../../domain/geo/lat-lon.js';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';
import { RegionRepository } from './region-repository.js';

const GUILD = '412345678901234567';
const OTHER_GUILD = '412345678901234568';
const DOWNTOWN = '1234567890123456788';
const NORTH = '1234567890123456789';

/** About 11 km square around downtown Pittsburgh. */
const DOWNTOWN_RING: LatLon[] = [
  { lat: 40.4, lon: -80.05 },
  { lat: 40.4, lon: -79.95 },
  { lat: 40.5, lon: -79.95 },
  { lat: 40.5, lon: -80.05 },
  { lat: 40.4, lon: -80.05 },
];
/** The square directly north of it. */
const NORTH_RING: LatLon[] = [
  { lat: 40.5, lon: -80.05 },
  { lat: 40.5, lon: -79.95 },
  { lat: 40.6, lon: -79.95 },
  { lat: 40.6, lon: -80.05 },
  { lat: 40.5, lon: -80.05 },
];

describe('RegionRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let regions: RegionRepository;
  let guildId: number;
  let otherGuildId: number;

  beforeAll(async () => {
    const started = await startMigratedDatabase();
    ({ db, stop } = started);
    regions = new RegionRepository(db);
    const guilds = new GuildRepository(db);
    await guilds.ensure(GUILD);
    await guilds.ensure(OTHER_GUILD);
    guildId = (await guilds.idFor(GUILD)) as number;
    otherGuildId = (await guilds.idFor(OTHER_GUILD)) as number;
    expect(guildId).toBeDefined();
    expect(otherGuildId).toBeDefined();
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Region').execute();
  });

  it('saves a region and reads its outline back exactly', async () => {
    const saved = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    expect(saved).toEqual({
      id: expect.any(Number) as number,
      guildId,
      channelId: DOWNTOWN,
      description: null,
      bounds: DOWNTOWN_RING,
    });
    expect(await regions.findByChannel(DOWNTOWN)).toEqual(saved);
  });

  it('replaces the outline of an existing region instead of adding a row', async () => {
    const first = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    const second = await regions.saveBounds(guildId, DOWNTOWN, NORTH_RING);
    expect(second.id).toBe(first.id);
    expect(second.bounds).toEqual(NORTH_RING);
    expect(await regions.listAll()).toHaveLength(1);
  });

  it('refuses an open outline and stores nothing', async () => {
    await expect(regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING.slice(0, 4))).rejects.toThrow(
      /closed/,
    );
    expect(await regions.listAll()).toHaveLength(0);
  });

  it('tells apart channel IDs that differ only in the last digit', async () => {
    await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await regions.saveBounds(guildId, NORTH, NORTH_RING);
    expect((await regions.findByChannel(DOWNTOWN))?.bounds).toEqual(DOWNTOWN_RING);
    expect((await regions.findByChannel(NORTH))?.bounds).toEqual(NORTH_RING);
    expect(await regions.delete(DOWNTOWN)).toBe(true);
    expect(await regions.findByChannel(DOWNTOWN)).toBeUndefined();
    expect(await regions.findByChannel(NORTH)).toBeDefined();
  });

  it('returns undefined for a channel that is not a region', async () => {
    expect(await regions.findByChannel('999999999999999999')).toBeUndefined();
    expect(await regions.delete('999999999999999999')).toBe(false);
  });

  it('finds the channels whose region contains a point', async () => {
    await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await regions.saveBounds(guildId, NORTH, NORTH_RING);
    expect(await regions.channelsContaining({ lat: 40.45, lon: -80 })).toEqual([DOWNTOWN]);
    expect(await regions.channelsContaining({ lat: 40.55, lon: -80 })).toEqual([NORTH]);
  });

  it('returns no channels for a point outside every region', async () => {
    await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    expect(await regions.channelsContaining({ lat: 41, lon: -80 })).toEqual([]);
    expect(await regions.channelsContaining({ lat: 0, lon: 0 })).toEqual([]);
  });

  it('limits a containment search to one guild when asked', async () => {
    await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await regions.saveBounds(otherGuildId, NORTH, DOWNTOWN_RING);
    const point = { lat: 40.45, lon: -80 };
    expect(await regions.channelsContaining(point)).toEqual([DOWNTOWN, NORTH]);
    expect(await regions.channelsContaining(point, otherGuildId)).toEqual([NORTH]);
  });

  it('lists the regions of one guild', async () => {
    await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await regions.saveBounds(otherGuildId, NORTH, NORTH_RING);
    expect((await regions.listForGuild(guildId)).map((r) => r.channelId)).toEqual([DOWNTOWN]);
    expect((await regions.listAll()).map((r) => r.channelId)).toEqual([DOWNTOWN, NORTH]);
  });

  it('sets and clears a description', async () => {
    await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    expect(await regions.setDescription(DOWNTOWN, 'Downtown and the North Shore')).toBe(true);
    expect((await regions.findByChannel(DOWNTOWN))?.description).toBe(
      'Downtown and the North Shore',
    );
    expect(await regions.setDescription(DOWNTOWN, null)).toBe(true);
    expect((await regions.findByChannel(DOWNTOWN))?.description).toBeNull();
    expect(await regions.setDescription(NORTH, 'nope')).toBe(false);
  });

  it('reads a legacy row that has no outline yet', async () => {
    await db.insertInto('Region').values({ guildId, channelId: DOWNTOWN }).execute();
    expect((await regions.findByChannel(DOWNTOWN))?.bounds).toBeNull();
    expect(await regions.channelsContaining({ lat: 40.45, lon: -80 })).toEqual([]);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run src/db/repositories/region-repository.db.test.ts`
Expected: FAIL, cannot resolve `./region-repository.js`.

- [ ] **Step 6: Implement the repository**

`src/db/repositories/region-repository.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { LatLon } from '../../domain/geo/lat-lon.js';
import { polygonWkt, ringFromPolygon, snowflakeParam } from '../spatial.js';
import type { DB, Polygon } from '../types.js';

/** A region: a Discord text channel and the area it covers. */
export interface Region {
  id: number;
  guildId: number | null;
  channelId: string;
  description: string | null;
  /** Closed outline; null for a row created before its outline was imported. */
  bounds: LatLon[] | null;
}

interface RegionRow {
  id: number;
  guildId: number | null;
  channelId: string | null;
  description: string | null;
  bounds: Polygon | null;
}

function toRegion(row: RegionRow): Region | undefined {
  if (row.channelId === null) return undefined;
  return {
    id: row.id,
    guildId: row.guildId,
    channelId: row.channelId,
    description: row.description,
    bounds: ringFromPolygon(row.bounds),
  };
}

function toRegions(rows: RegionRow[]): Region[] {
  return rows.map(toRegion).filter((region): region is Region => region !== undefined);
}

const COLUMNS = ['id', 'guildId', 'channelId', 'description', 'bounds'] as const;

/** The Region table. All spatial SQL for regions lives here. */
export class RegionRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async findByChannel(channelId: string): Promise<Region | undefined> {
    const row = await this.db
      .selectFrom('Region')
      .select(COLUMNS)
      .where('channelId', '=', snowflakeParam(channelId))
      .orderBy('id')
      .executeTakeFirst();
    return row ? toRegion(row) : undefined;
  }

  async listForGuild(guildId: number): Promise<Region[]> {
    const rows = await this.db
      .selectFrom('Region')
      .select(COLUMNS)
      .where('guildId', '=', guildId)
      .orderBy('id')
      .execute();
    return toRegions(rows);
  }

  async listAll(): Promise<Region[]> {
    const rows = await this.db.selectFrom('Region').select(COLUMNS).orderBy('id').execute();
    return toRegions(rows);
  }

  /** Creates the channel's region or replaces its outline. The ring must be closed. */
  async saveBounds(guildId: number, channelId: string, ring: readonly LatLon[]): Promise<Region> {
    const bounds = sql<Polygon>`ST_PolygonFromText(${polygonWkt(ring)})`;
    await this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('Region')
        .select('id')
        .where('channelId', '=', snowflakeParam(channelId))
        .orderBy('id')
        .executeTakeFirst();
      if (existing) {
        await trx
          .updateTable('Region')
          .set({ bounds, guildId })
          .where('id', '=', existing.id)
          .execute();
      } else {
        await trx.insertInto('Region').values({ guildId, channelId, bounds }).execute();
      }
    });
    const saved = await this.findByChannel(channelId);
    if (!saved) throw new Error(`Region for channel ${channelId} vanished after save`);
    return saved;
  }

  /** Returns false when the channel is not a region. */
  async setDescription(channelId: string, description: string | null): Promise<boolean> {
    const existing = await this.findByChannel(channelId);
    if (!existing) return false;
    await this.db
      .updateTable('Region')
      .set({ description })
      .where('id', '=', existing.id)
      .execute();
    return true;
  }

  /** Channel IDs of the regions containing the point, oldest region first. Empty when none do. */
  async channelsContaining(point: LatLon, guildId?: number): Promise<string[]> {
    let query = this.db
      .selectFrom('Region')
      .select('channelId')
      .where('channelId', 'is not', null)
      .where('bounds', 'is not', null)
      .where(sql<boolean>`ST_Contains(bounds, POINT(${point.lat}, ${point.lon}))`);
    if (guildId !== undefined) query = query.where('guildId', '=', guildId);
    const rows = await query.orderBy('id').execute();
    return rows.map((row) => row.channelId).filter((id): id is string => id !== null);
  }

  /** Returns false when the channel was not a region. */
  async delete(channelId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('Region')
      .where('channelId', '=', snowflakeParam(channelId))
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
```

- [ ] **Step 7: Run to verify it passes**

Run: `npx vitest run src/db/repositories/region-repository.db.test.ts`
Expected: PASS, 11 tests.

If the outline does not come back as an array of `{ x, y }` rings (the driver's geometry parsing), do not change the tests: select `sql<string>\`ST_AsText(bounds)\`.as('boundsText')` instead of `bounds`, parse the `POLYGON((a b,c d,…))` text into `LatLon[]` in `spatial.ts` with a unit test, and report the change.

- [ ] **Step 8: Check and commit**

Run: `npx prettier --write src/domain/geo src/db/spatial.ts src/db/spatial.test.ts src/db/repositories/region-repository.ts src/db/repositories/region-repository.db.test.ts && npm run check`
Expected: green.

```bash
git add src/domain/geo src/db/spatial.ts src/db/spatial.test.ts src/db/repositories/region-repository.ts src/db/repositories/region-repository.db.test.ts
git commit -m "Add geometry helpers and RegionRepository" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: GymRepository

A gym is a `Gym` row (name, position) plus an optional `GymMeta` row (nickname, description, keywords, notice, EX flags, cached geocoding). Legacy code is the gym half of `app/region.js` (`getGym`, `getAllGyms`, `getGyms`, `addGym`, `setGymName`, `setGymNickname`, `setGymDescription`, `setGymNotice`, `editGymKeywords`, `setEXStatus`, `deleteGym`) and the decoding in `app/gym.js:260-300`.

**Files:**
- Create: `src/db/repositories/gym-repository.ts`, `src/db/repositories/gym-repository.db.test.ts`
- Modify: `package.json`, `package-lock.json` (add `he`, `@types/he`)

**Interfaces:**
- Consumes: `startMigratedDatabase()`, `RegionRepository.saveBounds`, `GuildRepository`, `polygonWkt`, `snowflakeParam`, `LatLon`.
- Produces:
  - `interface Gym { id: number; pogoId: string | null; name: string; lat: number; lon: number; nickname: string | null; description: string | null; keywords: string[]; notice: string | null; taggedEx: boolean; confirmedEx: boolean; imageUrl: string | null; sponsor: number | null; geodata: string | null; places: string | null; nearestGym: number | null }`
  - `interface NewGym { name: string; lat: number; lon: number; pogoId?: string | null; nickname?: string | null; description?: string | null }`
  - `interface GymPatch` (every field optional): `name: string`, `lat: number`, `lon: number`, `pogoId`, `nickname`, `description`, `notice`, `imageUrl`, `geodata`, `places` (each `string | null`), `keywords: string[]`, `taggedEx: boolean`, `confirmedEx: boolean`, `sponsor: number | null`, `nearestGym: number | null`.
  - `class GymRepository` with `get(id: number): Promise<Gym | undefined>`, `listAll(): Promise<Gym[]>`, `listInRegion(channelId: string): Promise<Gym[]>`, `listInPolygon(ring: readonly LatLon[]): Promise<Gym[]>`, `create(gym: NewGym): Promise<Gym>`, `update(id: number, patch: GymPatch): Promise<Gym | undefined>`, `delete(id: number): Promise<boolean>`.

- [ ] **Step 1: Add the dependency**

Run: `npm install he@^1.2.0 && npm install --save-dev @types/he`
Expected: `package.json` gains `he` under `dependencies` and `@types/he` under `devDependencies`.

- [ ] **Step 2: Write the failing test**

`src/db/repositories/gym-repository.db.test.ts`:

```ts
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { LatLon } from '../../domain/geo/lat-lon.js';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';
import { GymRepository } from './gym-repository.js';
import { RegionRepository } from './region-repository.js';

const DOWNTOWN = '1234567890123456788';
const DOWNTOWN_RING: LatLon[] = [
  { lat: 40.4, lon: -80.05 },
  { lat: 40.4, lon: -79.95 },
  { lat: 40.5, lon: -79.95 },
  { lat: 40.5, lon: -80.05 },
  { lat: 40.4, lon: -80.05 },
];

describe('GymRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let gyms: GymRepository;

  beforeAll(async () => {
    const started = await startMigratedDatabase();
    ({ db, stop } = started);
    gyms = new GymRepository(db);
    const guilds = new GuildRepository(db);
    await guilds.ensure('412345678901234567');
    const guildId = (await guilds.idFor('412345678901234567')) as number;
    expect(guildId).toBeDefined();
    await new RegionRepository(db).saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Gym').execute();
  });

  it('creates a gym and reads it back with empty metadata', async () => {
    const created = await gyms.create({ name: 'Big Fountain', lat: 40.4417, lon: -80.0128 });
    expect(created).toEqual({
      id: expect.any(Number) as number,
      pogoId: null,
      name: 'Big Fountain',
      lat: 40.4417,
      lon: -80.0128,
      nickname: null,
      description: null,
      keywords: [],
      notice: null,
      taggedEx: false,
      confirmedEx: false,
      imageUrl: null,
      sponsor: null,
      geodata: null,
      places: null,
      nearestGym: null,
    });
    expect(await gyms.get(created.id)).toEqual(created);
  });

  it('returns undefined for an unknown gym', async () => {
    expect(await gyms.get(987654)).toBeUndefined();
    expect(await gyms.update(987654, { notice: 'x' })).toBeUndefined();
    expect(await gyms.delete(987654)).toBe(false);
  });

  it('decodes legacy entity-encoded text', async () => {
    const inserted = await db
      .insertInto('Gym')
      .values({ name: 'Joe&#x27;s Caf&#xE9;', lat: 40.45, lon: -80 })
      .executeTakeFirstOrThrow();
    const id = Number(inserted.insertId);
    await db
      .insertInto('GymMeta')
      .values({
        gymId: id,
        nickname: 'Joe&#x27;s',
        description: 'Mural &amp; fountain',
        notice: 'Closed &lt; 9am',
        keywords: 'cafe, joes',
        taggedEx: 1,
      })
      .execute();
    const gym = await gyms.get(id);
    expect(gym?.name).toBe("Joe's Café");
    expect(gym?.nickname).toBe("Joe's");
    expect(gym?.description).toBe('Mural & fountain');
    expect(gym?.notice).toBe('Closed < 9am');
    expect(gym?.keywords).toEqual(['cafe', 'joes']);
    expect(gym?.taggedEx).toBe(true);
    expect(gym?.confirmedEx).toBe(false);
  });

  it('stores text entity-encoded like the legacy bot', async () => {
    const gym = await gyms.create({
      name: "Joe's Café",
      lat: 40.45,
      lon: -80,
      nickname: "Joe's",
      description: 'Mural & fountain',
    });
    const raw = await db
      .selectFrom('Gym')
      .leftJoin('GymMeta', 'GymMeta.gymId', 'Gym.id')
      .select(['Gym.name', 'GymMeta.nickname', 'GymMeta.description'])
      .where('Gym.id', '=', gym.id)
      .executeTakeFirstOrThrow();
    expect(raw).toEqual({
      name: 'Joe&#x27;s Caf&#xE9;',
      nickname: 'Joe&#x27;s',
      description: 'Mural &#x26; fountain',
    });
    expect(gym.name).toBe("Joe's Café");
  });

  it('updates gym and metadata fields and leaves the rest alone', async () => {
    const gym = await gyms.create({ name: 'Old Name', lat: 40.45, lon: -80, nickname: 'Oldie' });
    const updated = await gyms.update(gym.id, {
      name: 'New Name',
      lat: 40.46,
      notice: 'Park closes at dusk',
      keywords: [' Fountain ', 'PARK', ''],
      taggedEx: true,
    });
    expect(updated).toEqual({
      ...gym,
      name: 'New Name',
      lat: 40.46,
      notice: 'Park closes at dusk',
      keywords: ['fountain', 'park'],
      taggedEx: true,
    });
    const raw = await db
      .selectFrom('GymMeta')
      .select(['keywords', 'taggedEx', 'confirmedEx'])
      .where('gymId', '=', gym.id)
      .executeTakeFirstOrThrow();
    expect(raw).toEqual({ keywords: 'fountain, park', taggedEx: 1, confirmedEx: null });
  });

  it('clears metadata with null, an empty keyword list and false', async () => {
    const gym = await gyms.create({ name: 'Gym', lat: 40.45, lon: -80, nickname: 'Nick' });
    await gyms.update(gym.id, { keywords: ['a'], taggedEx: true, confirmedEx: true });
    const cleared = await gyms.update(gym.id, {
      nickname: null,
      keywords: [],
      taggedEx: false,
      confirmedEx: false,
    });
    expect(cleared?.nickname).toBeNull();
    expect(cleared?.keywords).toEqual([]);
    expect(cleared?.taggedEx).toBe(false);
    const raw = await db
      .selectFrom('GymMeta')
      .select(['keywords', 'taggedEx', 'confirmedEx'])
      .where('gymId', '=', gym.id)
      .executeTakeFirstOrThrow();
    expect(raw).toEqual({ keywords: null, taggedEx: null, confirmedEx: null });
  });

  it('reads and updates a legacy gym that has no metadata row', async () => {
    const inserted = await db
      .insertInto('Gym')
      .values({ name: 'Bare', lat: 40.45, lon: -80 })
      .executeTakeFirstOrThrow();
    const id = Number(inserted.insertId);
    expect((await gyms.get(id))?.keywords).toEqual([]);
    const updated = await gyms.update(id, { nickname: 'Now with meta' });
    expect(updated?.nickname).toBe('Now with meta');
  });

  it('an empty patch changes nothing', async () => {
    const gym = await gyms.create({ name: 'Gym', lat: 40.45, lon: -80 });
    expect(await gyms.update(gym.id, {})).toEqual(gym);
  });

  it('lists the gyms inside a region or an arbitrary outline', async () => {
    const inside = await gyms.create({ name: 'Inside', lat: 40.45, lon: -80 });
    const outside = await gyms.create({ name: 'Outside', lat: 40.55, lon: -80 });
    expect((await gyms.listAll()).map((g) => g.id)).toEqual([inside.id, outside.id]);
    expect((await gyms.listInRegion(DOWNTOWN)).map((g) => g.id)).toEqual([inside.id]);
    expect(await gyms.listInRegion('999999999999999999')).toEqual([]);
    const north: LatLon[] = DOWNTOWN_RING.map((p) => ({ lat: p.lat + 0.1, lon: p.lon }));
    expect((await gyms.listInPolygon(north)).map((g) => g.id)).toEqual([outside.id]);
  });

  it('skips gyms that have no coordinates', async () => {
    await db.insertInto('Gym').values({ name: 'Nowhere' }).execute();
    expect(await gyms.listAll()).toEqual([]);
  });

  it('deletes a gym together with its metadata', async () => {
    const gym = await gyms.create({ name: 'Gone', lat: 40.45, lon: -80, nickname: 'Bye' });
    expect(await gyms.delete(gym.id)).toBe(true);
    expect(await gyms.get(gym.id)).toBeUndefined();
    expect(await db.selectFrom('GymMeta').selectAll().execute()).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/db/repositories/gym-repository.db.test.ts`
Expected: FAIL, cannot resolve `./gym-repository.js`.

- [ ] **Step 4: Implement the repository**

`src/db/repositories/gym-repository.ts`:

```ts
import he from 'he';
import { sql, type Kysely, type Updateable } from 'kysely';
import type { LatLon } from '../../domain/geo/lat-lon.js';
import { polygonWkt, snowflakeParam } from '../spatial.js';
import type { DB } from '../types.js';

/** A gym with its metadata, text decoded and flags as booleans. */
export interface Gym {
  id: number;
  /** Niantic's ID for the gym, when known. */
  pogoId: string | null;
  name: string;
  lat: number;
  lon: number;
  nickname: string | null;
  description: string | null;
  /** Extra search terms, lower case. */
  keywords: string[];
  /** Warning shown with the gym (access, hours). */
  notice: string | null;
  /** Tagged as an EX raid location in the game. */
  taggedEx: boolean;
  /** Has hosted an EX raid before. */
  confirmedEx: boolean;
  imageUrl: string | null;
  sponsor: number | null;
  /** Cached geocoding result, a JSON string. */
  geodata: string | null;
  /** Cached nearby place names. */
  places: string | null;
  nearestGym: number | null;
}

export interface NewGym {
  name: string;
  lat: number;
  lon: number;
  pogoId?: string | null;
  nickname?: string | null;
  description?: string | null;
}

export interface GymPatch {
  name?: string;
  lat?: number;
  lon?: number;
  pogoId?: string | null;
  nickname?: string | null;
  description?: string | null;
  notice?: string | null;
  keywords?: string[];
  taggedEx?: boolean;
  confirmedEx?: boolean;
  imageUrl?: string | null;
  sponsor?: number | null;
  geodata?: string | null;
  places?: string | null;
  nearestGym?: number | null;
}

interface GymRow {
  id: number;
  pogoId: string | null;
  name: string;
  lat: number | null;
  lon: number | null;
  nickname: string | null;
  description: string | null;
  keywords: string | null;
  notice: string | null;
  taggedEx: number | null;
  confirmedEx: number | null;
  imageUrl: string | null;
  sponsor: number | null;
  geodata: string | null;
  places: string | null;
  nearestGym: number | null;
}

/** The legacy bot stores gym text HTML-entity-encoded; both bots must read the same rows. */
function encode(text: string | null): string | null {
  return text === null ? null : he.encode(text);
}

function decode(text: string | null): string | null {
  return text === null ? null : he.decode(text);
}

function parseKeywords(stored: string | null): string[] {
  if (!stored) return [];
  return stored
    .split(',')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword !== '');
}

function formatKeywords(keywords: readonly string[]): string | null {
  const clean = keywords.map((keyword) => keyword.trim().toLowerCase()).filter((k) => k !== '');
  return clean.length > 0 ? clean.join(', ') : null;
}

/** The legacy bot writes EX flags as 1 or NULL, never 0. */
function exFlag(value: boolean): number | null {
  return value ? 1 : null;
}

function toGym(row: GymRow): Gym | undefined {
  if (row.lat === null || row.lon === null) return undefined;
  return {
    id: row.id,
    pogoId: row.pogoId,
    name: he.decode(row.name),
    lat: row.lat,
    lon: row.lon,
    nickname: decode(row.nickname),
    description: decode(row.description),
    keywords: parseKeywords(row.keywords),
    notice: decode(row.notice),
    taggedEx: row.taggedEx === 1,
    confirmedEx: row.confirmedEx === 1,
    imageUrl: row.imageUrl,
    sponsor: row.sponsor,
    geodata: row.geodata,
    places: row.places,
    nearestGym: row.nearestGym,
  };
}

function toGyms(rows: GymRow[]): Gym[] {
  return rows.map(toGym).filter((gym): gym is Gym => gym !== undefined);
}

function gymColumns(patch: GymPatch): Updateable<DB['Gym']> {
  const columns: Updateable<DB['Gym']> = {};
  if (patch.name !== undefined) columns.name = he.encode(patch.name);
  if (patch.lat !== undefined) columns.lat = patch.lat;
  if (patch.lon !== undefined) columns.lon = patch.lon;
  if (patch.pogoId !== undefined) columns.pogoId = patch.pogoId;
  return columns;
}

function metaColumns(patch: GymPatch): Updateable<DB['GymMeta']> {
  const columns: Updateable<DB['GymMeta']> = {};
  if (patch.nickname !== undefined) columns.nickname = encode(patch.nickname);
  if (patch.description !== undefined) columns.description = encode(patch.description);
  if (patch.notice !== undefined) columns.notice = encode(patch.notice);
  if (patch.keywords !== undefined) columns.keywords = formatKeywords(patch.keywords);
  if (patch.taggedEx !== undefined) columns.taggedEx = exFlag(patch.taggedEx);
  if (patch.confirmedEx !== undefined) columns.confirmedEx = exFlag(patch.confirmedEx);
  if (patch.imageUrl !== undefined) columns.imageUrl = patch.imageUrl;
  if (patch.sponsor !== undefined) columns.sponsor = patch.sponsor;
  if (patch.geodata !== undefined) columns.geodata = patch.geodata;
  if (patch.places !== undefined) columns.places = patch.places;
  if (patch.nearestGym !== undefined) columns.nearestGym = patch.nearestGym;
  return columns;
}

/** The Gym and GymMeta tables. Gyms without coordinates are invisible to the bot. */
export class GymRepository {
  constructor(private readonly db: Kysely<DB>) {}

  private select() {
    return this.db
      .selectFrom('Gym')
      .leftJoin('GymMeta', 'GymMeta.gymId', 'Gym.id')
      .select([
        'Gym.id',
        'Gym.pogoId',
        'Gym.name',
        'Gym.lat',
        'Gym.lon',
        'GymMeta.nickname',
        'GymMeta.description',
        'GymMeta.keywords',
        'GymMeta.notice',
        'GymMeta.taggedEx',
        'GymMeta.confirmedEx',
        'GymMeta.imageUrl',
        'GymMeta.sponsor',
        'GymMeta.geodata',
        'GymMeta.places',
        'GymMeta.nearestGym',
      ]);
  }

  async get(id: number): Promise<Gym | undefined> {
    const row = await this.select().where('Gym.id', '=', id).executeTakeFirst();
    return row ? toGym(row) : undefined;
  }

  async listAll(): Promise<Gym[]> {
    return toGyms(await this.select().orderBy('Gym.id').execute());
  }

  /** Gyms inside the region of the given channel. Empty when the channel is not a region. */
  async listInRegion(channelId: string): Promise<Gym[]> {
    const rows = await this.select()
      .where(
        sql<boolean>`exists (
          select 1 from Region r
          where r.channelId = ${snowflakeParam(channelId)}
            and r.bounds is not null
            and ST_Contains(r.bounds, POINT(Gym.lat, Gym.lon)))`,
      )
      .orderBy('Gym.id')
      .execute();
    return toGyms(rows);
  }

  /** Gyms inside an arbitrary closed outline (used for a region enlarged to reach its neighbours). */
  async listInPolygon(ring: readonly LatLon[]): Promise<Gym[]> {
    const rows = await this.select()
      .where(
        sql<boolean>`ST_Contains(ST_PolygonFromText(${polygonWkt(ring)}), POINT(Gym.lat, Gym.lon))`,
      )
      .orderBy('Gym.id')
      .execute();
    return toGyms(rows);
  }

  async create(gym: NewGym): Promise<Gym> {
    const id = await this.db.transaction().execute(async (trx) => {
      const inserted = await trx
        .insertInto('Gym')
        .values({
          name: he.encode(gym.name),
          lat: gym.lat,
          lon: gym.lon,
          pogoId: gym.pogoId ?? null,
        })
        .executeTakeFirstOrThrow();
      const gymId = Number(inserted.insertId);
      await trx
        .insertInto('GymMeta')
        .values({
          gymId,
          nickname: encode(gym.nickname ?? null),
          description: encode(gym.description ?? null),
        })
        .execute();
      return gymId;
    });
    const created = await this.get(id);
    if (!created) throw new Error(`Gym ${id} vanished after insert`);
    return created;
  }

  /** Changes the given fields. Returns the gym afterwards, or undefined when it does not exist. */
  async update(id: number, patch: GymPatch): Promise<Gym | undefined> {
    const gym = gymColumns(patch);
    const meta = metaColumns(patch);
    return this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('Gym')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!existing) return undefined;
      if (Object.keys(gym).length > 0) {
        await trx.updateTable('Gym').set(gym).where('id', '=', id).execute();
      }
      if (Object.keys(meta).length > 0) {
        await trx
          .insertInto('GymMeta')
          .values({ gymId: id, ...meta })
          .onDuplicateKeyUpdate(meta)
          .execute();
      }
      return new GymRepository(trx).get(id);
    });
  }

  /** Deleting a gym cascades to its metadata. Returns false when it did not exist. */
  async delete(id: number): Promise<boolean> {
    const result = await this.db.deleteFrom('Gym').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/db/repositories/gym-repository.db.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Check and commit**

Run: `npx prettier --write src/db/repositories/gym-repository.ts src/db/repositories/gym-repository.db.test.ts && npm run check`
Expected: green.

```bash
git add package.json package-lock.json src/db/repositories/gym-repository.ts src/db/repositories/gym-repository.db.test.ts
git commit -m "Add GymRepository" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Time-argument parsing

Port of `types/time.js`: the text a member types for a hatch, end or meeting time ("in 20", "3:30pm", "at 4", "10-14 6pm", "hatch", "unset") becomes an epoch-millisecond time inside the window valid for that party. The legacy parser relied on moment's lenient multi-format parsing and the server's local zone; this port has its own small grammar, checked against the legacy library's actual results, and works in `settings.timezone`.

Deliberate differences from the legacy parser, each covered by a test:
- A time with no date also tries tomorrow, and `12:xx` with no am/pm also tries `00:xx`, so times just after midnight work (Review Focus 4). These candidates come after the legacy ones, so anything the legacy parser accepted resolves the same way.
- For a train or meetup end time, the legacy code compared a relative duration in minutes with a limit in days. Here the limit is converted to minutes.

**Files:**
- Create: `scripts/legacy-parity/moment-time-cases.ts`, `test/fixtures/legacy-time-cases.json` (generated), `src/domain/time/clock-input.ts`, `src/domain/time/clock-input.test.ts`, `src/domain/time/party-time.ts`, `src/domain/time/party-time.test.ts`
- Modify: `package.json`, `package-lock.json` (add `luxon`, `@types/luxon`), `CLAUDE.md`, `docs/superpowers/plans/phase-0-follow-ups.md`

**Interfaces:**
- Consumes: `Settings` from `src/config/settings.ts`; `loadSettings`, `TEST_SETTINGS_PATH` (Task 2).
- Produces:
  - `interface ClockInput { hour: number; minute: number; hasMeridiem: boolean; month?: number; day?: number }`; `parseClockInput(text: string): ClockInput | undefined`; `parseRelativeMinutes(text: string): number | undefined`.
  - `type TimeParameter = 'hatch' | 'meet' | 'end'`; `type TimedPartyType = 'raid' | 'train' | 'meetup'`; `type RaidKind = 'standard' | 'exclusive' | 'elite'`.
  - `interface PartyTimes { creationTime: number; hatchTime?: number; endTime?: number; startTime?: number; hatchedDuration?: number }`
  - `interface PartyTimeRequest { text: string; now: number; zone: string; parameter: TimeParameter; partyType: TimedPartyType; raidKind: RaidKind; party?: PartyTimes; settings: TimeSettings }` where `TimeSettings = Pick<Settings, 'standardRaidIncubateDuration' | 'standardRaidHatchedDuration' | 'exclusiveRaidIncubateDuration' | 'exclusiveRaidHatchedDuration' | 'eliteRaidIncubateDuration' | 'eliteRaidHatchedDuration' | 'maxMeetupLeadupDuration' | 'maximumMeetupLeadtime'>`.
  - `type PartyTimeResult = { kind: 'time'; at: number } | { kind: 'unset' } | { kind: 'unparseable' } | { kind: 'out-of-range'; first: number; last: number }`; `resolvePartyTime(request: PartyTimeRequest): PartyTimeResult`.

- [ ] **Step 1: Add Luxon**

Run: `npm install luxon && npm install --save-dev @types/luxon`

- [ ] **Step 2: Record what the legacy library does**

`scripts/legacy-parity/moment-time-cases.ts`:

```ts
/**
 * Records how the legacy bot's moment calls read time text, so the new parser can be tested
 * against them. Needs the legacy moment version, installed outside the project:
 *   npm install --prefix var/legacy-parity moment@2.29.4
 *   npx tsx scripts/legacy-parity/moment-time-cases.ts
 * Writes test/fixtures/legacy-time-cases.json. Re-run only if the input lists below change.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

interface MomentDate {
  isValid(): boolean;
  hour(): number;
  minute(): number;
  month(): number;
  date(): number;
  creationData(): { format: string };
}
interface MomentDuration {
  isValid(): boolean;
  asMinutes(): number;
  asMilliseconds(): number;
}
interface MomentStatic {
  (input: string, formats: string[]): MomentDate;
  duration(input: string | number, unit?: string): MomentDuration;
}

const repoRoot = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(repoRoot, 'var/legacy-parity/package.json'));
const moment = require('moment') as MomentStatic;

/** The formats in types/time.js, in the same order. */
const FORMATS = [
  'hmm a',
  'Hmm',
  'h:m a',
  'H:m',
  'M-D hmm a',
  'M-D Hmm',
  'M-D h:m a',
  'M-D H:m',
  'M-D h a',
  'M-D H',
];

const CLOCK_INPUTS = [
  '330pm',
  '330 pm',
  '3:30pm',
  '3:30 pm',
  '3:30 PM',
  '3:30p',
  '3:30',
  '330',
  '1530',
  '15:30',
  '3pm',
  '3 pm',
  '3',
  '9',
  '12am',
  '12pm',
  '12:05',
  '12:05am',
  '0:15',
  '09:05',
  '9:5',
  '7:15 a',
  '10-14 3:30pm',
  '10-14 330pm',
  '10-14 15:30',
  '10-14 1530',
  '10-14 3 pm',
  '10-14 6pm',
  '10-14 15',
  '1-5 9:00',
  '12/25 6pm',
  '45',
  '90',
  'abc',
  '',
  '25:00',
  '3:75',
];

const DURATION_INPUTS = [
  '45',
  '0',
  '90',
  '-5',
  '30 minutes',
  'abc',
  '',
  '1:30',
  '0:45',
  '1:30:00',
  '0:00',
  '3:30pm',
  '2:5',
];

function clockCase(input: string) {
  const parsed = moment(input, FORMATS);
  if (!parsed.isValid()) return { input, valid: false };
  const format = parsed.creationData().format;
  const hasDate = format.includes('D');
  return {
    input,
    valid: true,
    hour: parsed.hour(),
    minute: parsed.minute(),
    hasMeridiem: format.endsWith('a'),
    ...(hasDate ? { month: parsed.month() + 1, day: parsed.date() } : {}),
  };
}

/** Mirrors the duration branch of types/time.js. */
function durationCase(input: string) {
  let duration: MomentDuration | undefined;
  if (!input.includes(':')) {
    duration = moment.duration(Number.parseInt(input), 'minutes');
  } else {
    const anyDuration = input.split(':').some((part) => Number.parseInt(part) !== 0);
    if (anyDuration) {
      duration = moment.duration(input);
      if (duration.isValid() && duration.asMilliseconds() === 0) duration = undefined;
    } else {
      duration = moment.duration(0);
    }
  }
  return duration?.isValid()
    ? { input, valid: true, minutes: duration.asMinutes() }
    : { input, valid: false };
}

const out = path.join(repoRoot, 'test/fixtures/legacy-time-cases.json');
writeFileSync(
  out,
  `${JSON.stringify({ clock: CLOCK_INPUTS.map(clockCase), duration: DURATION_INPUTS.map(durationCase) }, null, 2)}\n`,
);
process.stdout.write(`Wrote ${out}\n`);
```

Run:

```bash
npm install --prefix var/legacy-parity moment@2.29.4
npx tsx scripts/legacy-parity/moment-time-cases.ts
```

Expected: `Wrote …test/fixtures/legacy-time-cases.json`. `var/` is git-ignored, so the moment install is not committed. Open the JSON and confirm `"3:30pm"` has `hour: 15, minute: 30, hasMeridiem: true`.

- [ ] **Step 3: Write the failing tests for reading text**

`src/domain/time/clock-input.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseClockInput, parseRelativeMinutes } from './clock-input.js';

interface LegacyClockCase {
  input: string;
  valid: boolean;
  hour?: number;
  minute?: number;
  hasMeridiem?: boolean;
  month?: number;
  day?: number;
}
interface LegacyDurationCase {
  input: string;
  valid: boolean;
  minutes?: number;
}

const legacy = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../test/fixtures/legacy-time-cases.json'),
    'utf8',
  ),
) as { clock: LegacyClockCase[]; duration: LegacyDurationCase[] };

/**
 * Inputs where the new parser is deliberately different from the legacy library, with the
 * reason. Keep this list short: add an entry only when the legacy result is nonsense.
 */
const KNOWN_CLOCK_DIFFERENCES: Record<string, string> = {};
const KNOWN_DURATION_DIFFERENCES: Record<string, string> = {};

describe('parseClockInput', () => {
  it('reads common ways of writing a time', () => {
    expect(parseClockInput('3:30pm')).toEqual({ hour: 15, minute: 30, hasMeridiem: true });
    expect(parseClockInput('330 PM')).toEqual({ hour: 15, minute: 30, hasMeridiem: true });
    expect(parseClockInput('3:30')).toEqual({ hour: 3, minute: 30, hasMeridiem: false });
    expect(parseClockInput('1530')).toEqual({ hour: 15, minute: 30, hasMeridiem: false });
    expect(parseClockInput('3pm')).toEqual({ hour: 15, minute: 0, hasMeridiem: true });
    expect(parseClockInput('12am')).toEqual({ hour: 0, minute: 0, hasMeridiem: true });
    expect(parseClockInput('12pm')).toEqual({ hour: 12, minute: 0, hasMeridiem: true });
  });

  it('reads a month and day in front of the time', () => {
    expect(parseClockInput('10-14 6pm')).toEqual({
      hour: 18,
      minute: 0,
      hasMeridiem: true,
      month: 10,
      day: 14,
    });
    expect(parseClockInput('12/25 15:30')).toEqual({
      hour: 15,
      minute: 30,
      hasMeridiem: false,
      month: 12,
      day: 25,
    });
  });

  it('rejects text that is not a time', () => {
    expect(parseClockInput('abc')).toBeUndefined();
    expect(parseClockInput('')).toBeUndefined();
    expect(parseClockInput('3:75')).toBeUndefined();
    expect(parseClockInput('soon')).toBeUndefined();
  });

  it.each(legacy.clock.filter((c) => !(c.input in KNOWN_CLOCK_DIFFERENCES)))(
    'reads "$input" as the legacy bot did',
    ({ input, valid, ...expected }) => {
      const parsed = parseClockInput(input);
      if (!valid) {
        expect(parsed).toBeUndefined();
      } else {
        expect(parsed).toEqual(expected);
      }
    },
  );
});

describe('parseRelativeMinutes', () => {
  it('reads minutes and h:mm', () => {
    expect(parseRelativeMinutes('45')).toBe(45);
    expect(parseRelativeMinutes('1:30')).toBe(90);
    expect(parseRelativeMinutes('0:00')).toBe(0);
    expect(parseRelativeMinutes('abc')).toBeUndefined();
  });

  it.each(legacy.duration.filter((c) => !(c.input in KNOWN_DURATION_DIFFERENCES)))(
    'reads "$input" as the legacy bot did',
    ({ input, valid, minutes }) => {
      expect(parseRelativeMinutes(input)).toBe(valid ? minutes : undefined);
    },
  );
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npx vitest run src/domain/time/clock-input.test.ts`
Expected: FAIL, cannot resolve `./clock-input.js`.

- [ ] **Step 5: Implement reading text**

`src/domain/time/clock-input.ts`:

```ts
/** A time of day as typed, optionally with a month and day. */
export interface ClockInput {
  /** 0–23, with am/pm already applied when it was given. */
  hour: number;
  minute: number;
  /** False when am/pm was omitted, so a morning hour may mean the afternoon. */
  hasMeridiem: boolean;
  month?: number;
  day?: number;
}

const CLOCK = new RegExp(
  '^' +
    '(?:(?<month>\\d{1,2})\\s*[-/.]\\s*(?<day>\\d{1,2})\\s+)?' + // optional "M-D "
    '(?:' +
    '(?<compact>\\d{3,4})' + // 330, 1530
    '|(?<hour>\\d{1,2})(?:\\s*:\\s*(?<minute>\\d{1,2}))?' + // 3, 3:30, 15:30
    ')' +
    '\\s*(?<meridiem>[ap])?\\.?m?\\.?' + // am, pm, a, p
    '$',
  'i',
);

/** Reads text such as "3:30pm", "1530", "3 pm" or "10-14 6pm". Undefined when it is not a time. */
export function parseClockInput(text: string): ClockInput | undefined {
  const groups = CLOCK.exec(text.trim())?.groups;
  if (!groups) return undefined;

  let hour: number;
  let minute: number;
  if (groups.compact !== undefined) {
    hour = Number(groups.compact.slice(0, -2));
    minute = Number(groups.compact.slice(-2));
  } else {
    hour = Number(groups.hour);
    minute = groups.minute === undefined ? 0 : Number(groups.minute);
  }
  if (minute > 59 || hour > 23) return undefined;

  const meridiem = groups.meridiem?.toLowerCase();
  if (meridiem === 'p' && hour < 12) hour += 12;
  if (meridiem === 'a' && hour === 12) hour = 0;

  const clock: ClockInput = { hour, minute, hasMeridiem: meridiem !== undefined };
  if (groups.month !== undefined && groups.day !== undefined) {
    const month = Number(groups.month);
    const day = Number(groups.day);
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    clock.month = month;
    clock.day = day;
  }
  return clock;
}

/** [sign] [days.]hours:minutes[:seconds], the shape the legacy duration parser accepted. */
const SPAN = /^([-+])?(?:(\d*)[. ])?(\d+):(\d+)(?::(\d+)(?:\.\d*)?)?$/;

/**
 * Reads a relative duration: whole minutes ("45") or hours:minutes ("1:30"). "0:00" is zero;
 * any other span that works out to nothing is rejected, as the legacy parser did.
 */
export function parseRelativeMinutes(text: string): number | undefined {
  const value = text.trim();
  if (!value.includes(':')) {
    const minutes = Number.parseInt(value, 10);
    return Number.isNaN(minutes) ? undefined : minutes;
  }
  if (value.split(':').every((part) => Number.parseInt(part, 10) === 0)) return 0;
  const match = SPAN.exec(value);
  if (!match) return undefined;
  const [, sign, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 1440 + Number(hours) * 60 + Number(minutes) + Number(seconds ?? 0) / 60;
  if (total === 0) return undefined;
  return sign === '-' ? -total : total;
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run src/domain/time/clock-input.test.ts`
Expected: PASS.

The fixture is the authority on what the legacy bot did. If a parity case fails, change `clock-input.ts` so it passes, unless the legacy result is nonsense (for example a time accepted from text that plainly is not one); in that case add the input to `KNOWN_CLOCK_DIFFERENCES` or `KNOWN_DURATION_DIFFERENCES` with a one-line reason. List every such entry, and every change you made to the code above, in your report.

- [ ] **Step 7: Write the failing tests for the party window**

`src/domain/time/party-time.test.ts`:

```ts
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
import { loadSettings } from '../../config/settings.js';
import { resolvePartyTime, type PartyTimeRequest } from './party-time.js';

const ZONE = 'America/New_York';
const settings = loadSettings(TEST_SETTINGS_PATH);

/** Epoch ms for a wall-clock time in the test zone. */
function at(iso: string): number {
  const time = DateTime.fromISO(iso, { zone: ZONE });
  if (!time.isValid) throw new Error(`bad test time ${iso}`);
  return time.toMillis();
}

const NOW = at('2026-10-10T14:00');

function request(overrides: Partial<PartyTimeRequest>): PartyTimeRequest {
  return {
    text: '',
    now: NOW,
    zone: ZONE,
    parameter: 'hatch',
    partyType: 'raid',
    raidKind: 'standard',
    settings,
    ...overrides,
  };
}

describe('resolvePartyTime: raid hatch time', () => {
  // Standard raid: incubates 60 min, hatched 45 min. Window: now - 45 min to creation + 60 min.
  it('reads "in 20" and a bare "20" as minutes from now', () => {
    expect(resolvePartyTime(request({ text: 'in 20' }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:20'),
    });
    expect(resolvePartyTime(request({ text: '20' }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:20'),
    });
  });

  it('takes the afternoon reading of an ambiguous time when only that fits', () => {
    expect(resolvePartyTime(request({ text: '2:30' }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:30'),
    });
    expect(resolvePartyTime(request({ text: 'at 230' }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:30'),
    });
  });

  it('accepts a hatch time in the recent past', () => {
    expect(resolvePartyTime(request({ text: '1:30pm' }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T13:30'),
    });
  });

  it('reports the valid window when the time is outside it', () => {
    expect(resolvePartyTime(request({ text: '5pm' }))).toEqual({
      kind: 'out-of-range',
      first: at('2026-10-10T13:15'),
      last: at('2026-10-10T15:00'),
    });
  });

  it('rejects a relative duration as long as the whole incubation, as the legacy bot did', () => {
    expect(resolvePartyTime(request({ text: 'in 59' })).kind).toBe('time');
    expect(resolvePartyTime(request({ text: 'in 60' }))).toEqual({ kind: 'unparseable' });
    expect(resolvePartyTime(request({ text: 'in 90' }))).toEqual({ kind: 'unparseable' });
  });

  it('measures the window from the raid creation time once the raid exists', () => {
    const party = { creationTime: at('2026-10-10T13:30') };
    expect(resolvePartyTime(request({ text: '2:45pm', party }))).toEqual({
      kind: 'out-of-range',
      first: at('2026-10-10T13:15'),
      last: at('2026-10-10T14:30'),
    });
  });

  it('rejects text that is neither a time nor a duration', () => {
    expect(resolvePartyTime(request({ text: 'soon' }))).toEqual({ kind: 'unparseable' });
    expect(resolvePartyTime(request({ text: '' }))).toEqual({ kind: 'unparseable' });
  });

  it('recognises the words that clear a time', () => {
    for (const text of ['unset', 'Cancel', 'none']) {
      expect(resolvePartyTime(request({ text }))).toEqual({ kind: 'unset' });
    }
  });

  it('uses the long windows of EX and elite raids', () => {
    expect(
      resolvePartyTime(request({ text: '10-20 6:30pm', raidKind: 'exclusive' })),
    ).toEqual({ kind: 'time', at: at('2026-10-20T18:30') });
    expect(resolvePartyTime(request({ text: '10-11 11am', raidKind: 'elite' }))).toEqual({
      kind: 'time',
      at: at('2026-10-11T11:00'),
    });
    expect(resolvePartyTime(request({ text: '10-11 11am' })).kind).toBe('out-of-range');
  });

  it('resolves a time just after midnight to tomorrow', () => {
    const now = at('2026-10-10T23:50');
    expect(resolvePartyTime(request({ text: '12:10', now }))).toEqual({
      kind: 'time',
      at: at('2026-10-11T00:10'),
    });
    expect(resolvePartyTime(request({ text: '12:10am', now }))).toEqual({
      kind: 'time',
      at: at('2026-10-11T00:10'),
    });
  });
});

describe('resolvePartyTime: raid end time', () => {
  // Window: now to creation + 105 min.
  it('accepts a time up to incubation plus hatched duration after creation', () => {
    expect(resolvePartyTime(request({ text: '3:15pm', parameter: 'end' }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T15:15'),
    });
    expect(resolvePartyTime(request({ text: '4pm', parameter: 'end' })).kind).toBe(
      'out-of-range',
    );
  });

  it('does not accept an end time in the past', () => {
    expect(resolvePartyTime(request({ text: '1:30pm', parameter: 'end' }))).toEqual({
      kind: 'out-of-range',
      first: NOW,
      last: at('2026-10-10T15:45'),
    });
  });
});

describe('resolvePartyTime: raid meeting time', () => {
  const party = {
    creationTime: at('2026-10-10T13:45'),
    hatchTime: at('2026-10-10T14:30'),
    endTime: at('2026-10-10T15:15'),
  };

  it('accepts a time between hatch and end', () => {
    expect(resolvePartyTime(request({ text: '2:45', parameter: 'meet', party }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:45'),
    });
  });

  it('reads "hatch" and "start" as the hatch time', () => {
    for (const text of ['hatch', 'Start']) {
      expect(resolvePartyTime(request({ text, parameter: 'meet', party }))).toEqual({
        kind: 'time',
        at: at('2026-10-10T14:30'),
      });
    }
  });

  it('refuses a meeting time before the egg hatches or after the raid ends', () => {
    expect(resolvePartyTime(request({ text: '2:15pm', parameter: 'meet', party }))).toEqual({
      kind: 'out-of-range',
      first: at('2026-10-10T14:30'),
      last: at('2026-10-10T15:15'),
    });
    expect(resolvePartyTime(request({ text: '3:30pm', parameter: 'meet', party })).kind).toBe(
      'out-of-range',
    );
  });

  it('starts the window now once the raid has hatched', () => {
    const now = at('2026-10-10T14:40');
    expect(resolvePartyTime(request({ text: 'in 5', parameter: 'meet', party, now }))).toEqual({
      kind: 'time',
      at: at('2026-10-10T14:45'),
    });
    expect(
      resolvePartyTime(request({ text: '2:35pm', parameter: 'meet', party, now })),
    ).toEqual({ kind: 'out-of-range', first: now, last: at('2026-10-10T15:15') });
  });

  it('falls back to creation plus both durations when the raid has no end time', () => {
    const open = { creationTime: at('2026-10-10T13:45') };
    expect(
      resolvePartyTime(request({ text: '3:25pm', parameter: 'meet', party: open })),
    ).toEqual({ kind: 'time', at: at('2026-10-10T15:25') });
  });
});

describe('resolvePartyTime: trains and meetups', () => {
  const party = { creationTime: NOW };

  it('reads a meetup meeting time with a date, days ahead', () => {
    expect(
      resolvePartyTime(
        request({ text: '10-12 6pm', parameter: 'meet', partyType: 'meetup', party }),
      ),
    ).toEqual({ kind: 'time', at: at('2026-10-12T18:00') });
  });

  it('treats a bare number as a clock time, not minutes', () => {
    expect(
      resolvePartyTime(request({ text: '6', parameter: 'meet', partyType: 'train', party })),
    ).toEqual({ kind: 'time', at: at('2026-10-10T18:00') });
  });

  it('still accepts an explicit "in"', () => {
    expect(
      resolvePartyTime(request({ text: 'in 30', parameter: 'meet', partyType: 'train', party })),
    ).toEqual({ kind: 'time', at: at('2026-10-10T14:30') });
  });

  it('puts a date-less end time on the day the party starts', () => {
    const started = { creationTime: NOW, startTime: at('2026-10-12T18:00') };
    expect(
      resolvePartyTime(
        request({ text: '8pm', parameter: 'end', partyType: 'meetup', party: started }),
      ),
    ).toEqual({ kind: 'time', at: at('2026-10-12T20:00') });
  });

  it('accepts a relative end time longer than the legacy unit bug allowed', () => {
    expect(
      resolvePartyTime(request({ text: 'in 120', parameter: 'end', partyType: 'train', party })),
    ).toEqual({ kind: 'time', at: at('2026-10-10T16:00') });
  });

  it('wraps a date into next year', () => {
    const now = at('2026-12-30T12:00');
    expect(
      resolvePartyTime(
        request({
          text: '1-2 6pm',
          now,
          parameter: 'meet',
          partyType: 'meetup',
          party: { creationTime: now },
        }),
      ),
    ).toEqual({ kind: 'time', at: at('2027-01-02T18:00') });
  });

  it('refuses a meeting time beyond the lead-up limit', () => {
    // maxMeetupLeadupDuration is 133920 minutes (93 days).
    expect(
      resolvePartyTime(
        request({ text: '3-1 6pm', parameter: 'meet', partyType: 'meetup', party }),
      ).kind,
    ).toBe('out-of-range');
  });

  it('ignores a date that does not exist', () => {
    expect(
      resolvePartyTime(
        request({ text: '2-30 6pm', parameter: 'meet', partyType: 'meetup', party }),
      ),
    ).toEqual({ kind: 'unparseable' });
  });
});

describe('resolvePartyTime: time zone', () => {
  it('reads wall-clock times in the configured zone, not UTC', () => {
    const result = resolvePartyTime(request({ text: '2:30pm' }));
    expect(result).toEqual({ kind: 'time', at: Date.UTC(2026, 9, 10, 18, 30) });
  });
});
```

- [ ] **Step 8: Run to verify they fail**

Run: `npx vitest run src/domain/time/party-time.test.ts`
Expected: FAIL, cannot resolve `./party-time.js`.

- [ ] **Step 9: Implement the party window**

`src/domain/time/party-time.ts`:

```ts
import { DateTime } from 'luxon';
import type { Settings } from '../../config/settings.js';
import { parseClockInput, parseRelativeMinutes, type ClockInput } from './clock-input.js';

export type TimeParameter = 'hatch' | 'meet' | 'end';
export type TimedPartyType = 'raid' | 'train' | 'meetup';
export type RaidKind = 'standard' | 'exclusive' | 'elite';

export type TimeSettings = Pick<
  Settings,
  | 'standardRaidIncubateDuration'
  | 'standardRaidHatchedDuration'
  | 'exclusiveRaidIncubateDuration'
  | 'exclusiveRaidHatchedDuration'
  | 'eliteRaidIncubateDuration'
  | 'eliteRaidHatchedDuration'
  | 'maxMeetupLeadupDuration'
  | 'maximumMeetupLeadtime'
>;

/** The times of an existing party, in epoch milliseconds. */
export interface PartyTimes {
  creationTime: number;
  hatchTime?: number;
  endTime?: number;
  /** Meeting time of a train or meetup. */
  startTime?: number;
  /** Minutes a hatched raid lasts, when set by hand for this raid. */
  hatchedDuration?: number;
}

export interface PartyTimeRequest {
  /** What the member typed. */
  text: string;
  /** Epoch milliseconds. */
  now: number;
  /** IANA zone that wall-clock times are read in (settings.timezone). */
  zone: string;
  parameter: TimeParameter;
  partyType: TimedPartyType;
  raidKind: RaidKind;
  /** Omitted while a raid is being created. */
  party?: PartyTimes;
  settings: TimeSettings;
}

export type PartyTimeResult =
  | { kind: 'time'; at: number }
  /** The member asked to clear the time ("unset", "cancel", "none"). */
  | { kind: 'unset' }
  | { kind: 'unparseable' }
  | { kind: 'out-of-range'; first: number; last: number };

const MINUTE = 60_000;
const UNSET_WORDS = ['unset', 'cancel', 'none'];
const HATCH_WORDS = ['hatch', 'start'];

interface Window {
  first: number;
  last: number;
  /** A relative duration must be shorter than this many minutes. */
  maxMinutes: number;
}

function raidDurations(request: PartyTimeRequest): { incubation: number; hatched: number } {
  const { settings, raidKind, party } = request;
  const byKind = {
    standard: {
      incubation: settings.standardRaidIncubateDuration,
      hatched: settings.standardRaidHatchedDuration,
    },
    exclusive: {
      incubation: settings.exclusiveRaidIncubateDuration,
      hatched: settings.exclusiveRaidHatchedDuration,
    },
    elite: {
      incubation: settings.eliteRaidIncubateDuration,
      hatched: settings.eliteRaidHatchedDuration,
    },
  }[raidKind];
  return { incubation: byKind.incubation, hatched: party?.hatchedDuration ?? byKind.hatched };
}

function plusDays(time: number, days: number, zone: string): number {
  return DateTime.fromMillis(time, { zone }).plus({ days }).toMillis();
}

/** The earliest and latest time valid for this parameter of this party. */
function timeWindow(request: PartyTimeRequest): Window {
  const { now, zone, parameter, partyType, party, settings } = request;
  const { incubation, hatched } = raidDurations(request);
  const creation = party?.creationTime ?? now;
  const timed = partyType !== 'raid';

  if (parameter === 'hatch') {
    return {
      first: now - hatched * MINUTE,
      last: creation + incubation * MINUTE,
      maxMinutes: incubation,
    };
  }

  if (parameter === 'end') {
    if (timed) {
      const days = settings.maximumMeetupLeadtime + 1;
      return { first: now, last: plusDays(creation, days, zone), maxMinutes: days * 1440 };
    }
    const total = incubation + hatched;
    return { first: now, last: creation + total * MINUTE, maxMinutes: total };
  }

  // Meeting time.
  if (timed) {
    const max = settings.maxMeetupLeadupDuration;
    return { first: creation, last: creation + max * MINUTE, maxMinutes: max };
  }
  const total = incubation + hatched;
  return {
    first: Math.max(now, party?.hatchTime ?? now),
    last: party?.endTime ?? creation + total * MINUTE,
    maxMinutes: total,
  };
}

/**
 * Every moment a typed clock time could mean, most likely first. The first four are the
 * legacy bot's guesses; the rest make times just after midnight work.
 */
function candidates(clock: ClockInput, request: PartyTimeRequest, reference?: number): number[] {
  const { zone, parameter, partyType } = request;
  const now = DateTime.fromMillis(request.now, { zone });
  const hasDate = clock.month !== undefined && clock.day !== undefined;

  // A date-less meeting time, or end time of a train or meetup, falls on the reference day.
  const useReference =
    !hasDate &&
    reference !== undefined &&
    (parameter === 'meet' || (parameter === 'end' && partyType !== 'raid'));
  const day = useReference ? DateTime.fromMillis(reference, { zone }) : now;

  const base = {
    year: day.year,
    month: clock.month ?? day.month,
    day: clock.day ?? day.day,
    minute: clock.minute,
  };
  const build = (hour: number, years = 0, days = 0): DateTime =>
    DateTime.fromObject({ ...base, year: base.year + years, hour }, { zone }).plus({ days });

  const afternoon = !clock.hasMeridiem && clock.hour < 12 ? clock.hour + 12 : undefined;
  const midnight = !clock.hasMeridiem && clock.hour === 12 ? 0 : undefined;

  const all = [build(clock.hour), build(clock.hour, 1)];
  if (afternoon !== undefined) all.push(build(afternoon), build(afternoon, 1));
  if (!hasDate) {
    all.push(build(clock.hour, 0, 1));
    if (afternoon !== undefined) all.push(build(afternoon, 0, 1));
  }
  if (midnight !== undefined) {
    all.push(build(midnight));
    if (!hasDate) all.push(build(midnight, 0, 1));
  }
  return all.filter((time) => time.isValid).map((time) => time.toMillis());
}

/**
 * Turns what a member typed for a hatch, end or meeting time into a moment inside the window
 * valid for that party. Port of the legacy `time` argument type.
 */
export function resolvePartyTime(request: PartyTimeRequest): PartyTimeResult {
  const { now, zone, partyType, party } = request;
  const window = timeWindow(request);
  const timed = partyType !== 'raid';
  let text = request.text.trim();
  let mode: 'auto' | 'relative' | 'absolute' = 'auto';
  let clock: ClockInput | undefined;

  if (/^in/i.test(text)) {
    text = text.slice(2).trim();
    mode = 'relative';
  } else if (party?.hatchTime !== undefined && HATCH_WORDS.includes(text.toLowerCase())) {
    const hatch = DateTime.fromMillis(party.hatchTime, { zone });
    clock = { hour: hatch.hour, minute: hatch.minute, hasMeridiem: true };
    mode = 'absolute';
  } else if (UNSET_WORDS.includes(text.toLowerCase())) {
    return { kind: 'unset' };
  } else if (timed) {
    mode = 'absolute';
  } else {
    const absolute = /^at(.*)|(.*[ap]m?)$/i.exec(text);
    if (absolute) {
      text = (absolute[1] ?? absolute[2] ?? '').trim();
      mode = 'absolute';
    }
  }

  const possible: number[] = [];
  if (mode !== 'absolute') {
    const minutes = parseRelativeMinutes(text);
    if (minutes !== undefined && minutes < window.maxMinutes) possible.push(now + minutes * MINUTE);
  }
  if (mode !== 'relative') {
    clock ??= parseClockInput(text);
    if (clock) {
      const reference = timed ? party?.startTime : party?.hatchTime;
      possible.push(...candidates(clock, request, reference));
    }
  }

  if (possible.length === 0) return { kind: 'unparseable' };
  const match = possible.find((time) => time >= window.first && time <= window.last);
  return match === undefined
    ? { kind: 'out-of-range', first: window.first, last: window.last }
    : { kind: 'time', at: match };
}
```

- [ ] **Step 10: Run to verify they pass**

Run: `npx vitest run src/domain/time`
Expected: PASS, both files.

If a `party-time` test fails, fix the implementation, not the test, unless the test contradicts `types/time.js` for a case not listed under "Deliberate differences" at the top of this task; in that case stop and report the contradiction.

- [ ] **Step 11: Update the project documents**

In `CLAUDE.md`, add these lines to the end of the `## Conventions` list:

```markdown
- Repositories (`src/db/repositories/`) are the only code that knows column names. They return plain objects: booleans, `{ lat, lon }`, decoded text.
- Geometry in SQL is latitude first: `POINT(lat, lon)` and `POLYGON((lat lon, …))`, as the legacy bot stored it. Build it with `src/db/spatial.ts`.
- Compare a snowflake with the `BIGINT` column `Region.channelId` only through `snowflakeParam()`; never compare it with a `VARCHAR` snowflake column in SQL.
- Gym text (`name`, `nickname`, `description`, `notice`) is stored HTML-entity-encoded for the legacy bot; `GymRepository` encodes and decodes it.
- Times are epoch milliseconds in data and Luxon `DateTime` in `settings.timezone` while computing. Member-typed times go through `resolvePartyTime` (`src/domain/time/`).
- Tests load `test/fixtures/settings.json` (`TEST_SETTINGS_PATH`), not `data/settings.json`.
```

In the same file, replace the `**Status:**` paragraph with:

```markdown
**Status:** Phase 0 (Foundation) and Phase 1A (data access and time parsing) are complete. Phase 1 continues with 1B (game data and raid bosses) and 1C (search, image cache, static maps). What earlier phases left open, grouped by the phase that should pick it up, is in `docs/superpowers/plans/phase-0-follow-ups.md`; read it before planning any phase, and add to it when a phase ends.
```

In `docs/superpowers/plans/phase-0-follow-ups.md`, under `## Phase 1 (domain ports)`, delete the bullets that this plan has done (exclude `knex_migrations` from the generated type; regenerate the legacy fixture; the "Tests to add" bullet; never compare a `BIGINT` snowflake column; `Region.bounds` typed `Polygon`; secrets and redaction; unit tests reading `data/settings.json`). Leave the migration-convention bullet (charset and collation), which Phase 1B needs.

- [ ] **Step 12: Check and commit**

Run: `npx prettier --write src/domain/time scripts/legacy-parity && npm run check && npm run build`
Expected: green. (`test/fixtures/` and `*.md` are ignored by Prettier.)

```bash
git add package.json package-lock.json src/domain/time scripts/legacy-parity test/fixtures/legacy-time-cases.json CLAUDE.md docs/superpowers/plans/phase-0-follow-ups.md
git commit -m "Port time-argument parsing to a pure, zone-aware module" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Not in this plan

- `PokemonRepository` (`Pokemon.nickname`), game data, the tier enum, the notification-target codec and the raid boss feed and tables: Phase 1B. That plan adds the first new migrations and needs the production schema check listed in `phase-0-follow-ups.md`.
- Search (gym, Pokémon, move, status, privacy), the image cache and static maps: Phase 1C.
- Enlarging a region to find neighbouring gyms (the legacy 1.5× scale): Phase 1C, on top of `GymRepository.listInPolygon`.
- Formatting the "valid time range is between … and …" message: the commands that use `resolvePartyTime` (Phase 2) render it from `first` and `last`.
