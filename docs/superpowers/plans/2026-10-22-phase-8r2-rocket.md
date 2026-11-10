# Phase 8R-2: Team GO Rocket Reports: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The second plan of reports at stops (design `docs/superpowers/specs/2026-10-21-stop-reports-design.md`, sections 5, 6, 7, 9; Gantt phase 17), on 8R-1's foundation. In detail:

- **The lineups** from ScrapedDuck's `rocketLineups.min.json` (`settings.rocket`, always on, defaults for every key): one choice per grunt type (a type's male and female lineups merged), "Grunt (no type)", "Decoy grunt", Cliff, Arlo, Sierra and Giovanni, each with what can be caught (`isEncounter` in any slot); the last good list kept in the database, guarded as the task list.
- **One Rocket report per stop**, a `StopReport` row of kind `rocket` in the day's period, decided inside one transaction (`decideRocket`, `saveUnless`), also across midnight: a grunt replaces a grunt; a hideout (leader, Giovanni, decoy) replaces anything; the same grunt standing is "Already reported" with a link (Matt's answer 4); a grunt where a hideout was reported today asks first in a dialog.
- **Grunt messages** in each region channel holding the stop for 30 minutes (`settings.rocket.gruntMinutes`), components-v2 or plain text, deleted on time, at once when replaced or taken back, swept hourly and at start, kept across a restart; a failure in one channel never loses the report; a grunt posted nowhere is taken back (and a hideout it replaced restored).
- **`/rocket report who: stop:`** and **`/rocket remove stop:`**, the answer with Take back, on every server, a throttle window of its own.
- **Hideouts in the pinned post** "Today at the stops", after research, within 8R-1's limits.
- **Rocket wants:** `/want` takes grunt types, "Grunt (no type)", the decoy, each leader, any leader and Giovanni at once; the Shadow box also shows for a Pokémon in today's lineups; a **Shadow** want covers Rocket catches. **DMs:** one per report and region channel, grunts at the spawn priority and at most one an hour per member and grunt type (Matt's answer 3), hideouts never twice for the same hideout at a stop in a day.

**Not in 8R-2:** the map (8R-3; `RocketService` is the one way to report, ready for it).

**Architecture:**

- **Domain:** `src/domain/rocket/lineups.ts` (`parseRocketLineups`, keys), `reports.ts` (`decideRocket`, Rocket reports); `StopReport` becomes a union of research and Rocket reports.
- **Storage:** migration `2026_10_22_028_rocket` (`RocketLineup`, `GruntMessage`); `StopReportStorage.saveUnless`.
- **Services:** `RocketLineupService`, `StopReportService.reportRocket` / `rocketAt` / `restore` and its `ended` event, `GruntMessageService`, `RocketService` (`ctx.rocket`), `NotifyService.rocketReported`.
- **Discord:** `src/commands/rocket/`, `src/render/rocket.ts`, the hideout section of `src/render/stop-post.ts`, `/want`'s Rocket targets.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Vitest. No new dependency. **Migration 028** (typescript-migration ends at 027). **Commands change** (`/rocket` new; `/want`'s targets): deploy the commands again before staging.

**Spec:** the design above, the brief `.superpowers/sdd/8r-2-rocket/design.md` and its ledger (git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8r2`, tip `23e58981`, tag `proto-8r2-r3`), one commit per task, on `stop-reports` e8bc470e. Each commit typechecks and its unit tests pass; on the tip the full check (8,763 tests), the build and the database suite (567) are clean. The commit bodies below describe each task as first built; the reviews' fixes are folded into the diffs (listed under Reviews).

**Reviews:** two Opus reviewers went through the prototype, one on storage and the services, one on the commands, wants and DMs (three Important: a send error in one channel failed a stored report, with no DMs and an invisible "Already reported"; the one-DM hour per grunt type was bypassed by reports moments apart; ten Minor, among them one Rocket report per stop across midnight and a grunt posted nowhere blocking its type). Then two fix reviews (round 2: "Grunt (no type)" unreachable in `/want`, an unposted grunt destroying the hideout it replaced; round 3: the hideout restored in one locked step, tests of its refusals, Take back on a restored hideout). Every finding is in the commits below.

## Decisions in this plan

Made while prototyping and reviewing, for Matt to look at:

1. **Grunts and hideouts share one row per stop and day** (`StopReport` kind `rocket`); `GruntMessage` keeps only a grunt's messages. A grunt reported before midnight stands its full 30 minutes and still counts as the stop's Rocket report after midnight.
2. **The hideout dialog** uses Discord's own Submit and Cancel ("Submit replaces it."), as the 8Q dialogs do.
3. **Grunt messages stay up across a restart** (the report stands on); spawn reports are deleted at shutdown.
4. **A grunt that could not be posted anywhere** is taken back and the member told; a hideout it replaced comes back under a new id (its reporter's Take back still works), a grunt it replaced is named as taken off.
5. **"Already reported" counts against the throttle** (decided after the guard, inside the transaction).
6. **Before any lineups were read**, every choice is offered without catches; the hideouts are always offered, whatever the feed lists.
7. **The one-DM hour per grunt type** covers DMs from grunt-type wants and Shadow wants alike; in memory, lost on a restart.
8. **`/want`'s list:** Rocket targets match only on their own words (the type, the leader's name, any, giovanni, decoy, "no type"), sharing the rewards' five places; today's catches come right after the raid bosses among the Pokémon. **A typed "none" now means "Grunt (no type)"**, no longer zero IVs ("zero" still does).
9. **Grunt message look:** a gallery of the catches' pictures; with a single catch (the decoy's Bellsprout) the picture spans the width: check at staging.

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8r2`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed. Apply the diffs with `git apply`, never retype them.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock), one at a time. Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/`, `.superpowers/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **8R-1's research is unchanged** although `StopReport` became a union: `/research`, its answer, the post and the DMs read research reports only.
2. **One Rocket report per stop**, decided inside the transaction, across midnight; replaced reports get new ids; no Discord call under a lock.
3. **Grunt messages:** every channel's failure handled, deletes on time and early, the sweeps, rehearsal mode.
4. **DMs:** the hour per grunt type under bursts, Shadow wants of catches, never the reporter, viewers only.
5. **Migration 028** additive and guarded.

### Task 1: 8R-2 task 1: Rocket lineups and their storage, migration 028

Prototype commit: `8c251e897926509fd926f010275834a17650d779`

Migration 028 adds RocketLineup (the last good list of /rocket's choices,
kept as ResearchTask keeps the task list) and GruntMessage (a grunt report's
message in a region channel until it is deleted, as SpawnReport keeps a
spawn's). A Rocket report itself will be a StopReport row of the kind
rocket.

parseRocketLineups reads ScrapedDuck's rocketLineups feed: one choice per
grunt type (a type of two lineups is the union of both), the untyped grunts,
the decoy, Cliff, Arlo, Sierra and Giovanni, keyed grunt:<type>, grunt:none,
decoy, leader:<name>, giovanni; the catchable Pokemon are those marked
isEncounter in any slot, named by the catalogue (identifyBoss); a lineup it
cannot place is skipped and counted; a feed of none throws. The fixture is
the feed of 2026-10-22 unchanged (26 lineups, 24 choices).

RocketLineupRepository and MemoryRocketLineups run rocketLineupCases.

**Files:**

```
 src/db/migrations/2026_10_22_028_rocket.ts         |  50 +++++++++++++
 src/db/migrations/index.ts                         |   2 +
 src/db/migrator.db.test.ts                         |   3 +
 src/db/repositories/rocket-lineup-repository.ts    |  93 ++++++++++++++++++++++++
 src/db/repositories/rocket-repositories.db.test.ts |  43 ++++++++++++
 src/db/table-names.ts                              |   2 +
 src/db/types.ts                                    |  20 ++++++
 src/domain/research/leekduck.ts                    |  13 ++--
 src/domain/rocket/lineups.test.ts                  | 163 ++++++++++++++++++++++++++++++++++++++++++
 src/domain/rocket/lineups.ts                       | 234 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/fixtures/rocket-lineups.json                  |   1 +
 test/support/rocket-store-cases.ts                 |  43 ++++++++++++
 test/support/rocket-store.test.ts                  |   7 ++
 test/support/rocket-store.ts                       |  44 ++++++++++++
 test/support/rocket.ts                             |  30 ++++++++
 15 files changed, 743 insertions(+), 5 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/rocket/lineups.test.ts test/support/rocket-store.test.ts`); all pass. Its database test files (`src/db/migrator.db.test.ts`, `src/db/repositories/rocket-repositories.db.test.ts`) run with the database suite at the tip.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 8c251e897926509fd926f010275834a17650d779 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-2 task 1: Rocket lineups and their storage, migration 028`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/db/migrations/2026_10_22_028_rocket.ts b/src/db/migrations/2026_10_22_028_rocket.ts
new file mode 100644
index 0000000000000000000000000000000000000000..715216b3e5474c967dd3edb2b2c48046a68c2f67
--- /dev/null
+++ b/src/db/migrations/2026_10_22_028_rocket.ts
@@ -0,0 +1,50 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * Team GO Rocket at stops (plan 8R-2; design `2026-10-21-stop-reports-design.md`, sections 5 to
+ * 7). A Rocket report itself is a `StopReport` row of the kind `rocket` (migration 027 left the
+ * kind for it), one per server, stop and day: a grunt and a hideout share that one row, so that
+ * which of them stands is decided in one transaction. This migration adds what is beside it:
+ *
+ * - `RocketLineup`: the last good list of `/rocket`'s choices read from ScrapedDuck, as
+ *   `ResearchTask` keeps the task list: a row per choice (`rocketKey`, `grunt:water`,
+ *   `leader:arlo`), its name, its catchable Pokémon (JSON), its place in the list (`position`),
+ *   when first and last read, and whether the last good read listed it.
+ * - `GruntMessage`: a grunt report's message in a region channel, as `SpawnReport` keeps a
+ *   spawn's, until it is deleted: the message, its channel and server, the report it shows
+ *   (`reportId`, the `StopReport` row; no foreign key: the message outlives a report replaced or
+ *   taken back until its delete is done) and when it is due (epoch milliseconds).
+ *
+ * Safe to run again after a failure half-way: each table is created only when it is missing.
+ */
+export const rocket: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    await sql`
+      create table if not exists RocketLineup (
+        rocketKey varchar(20) not null,
+        name varchar(60) not null,
+        catches json not null,
+        position int not null default 0,
+        firstSeen bigint not null,
+        lastSeen bigint not null,
+        active tinyint(1) not null default 1,
+        primary key (rocketKey)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists GruntMessage (
+        messageId varchar(30) not null,
+        channelId varchar(30) not null,
+        serverId varchar(30) not null,
+        reportId int unsigned not null,
+        deleteAt bigint not null,
+        primary key (messageId),
+        key gruntmessage_report_index (reportId),
+        key gruntmessage_delete_index (deleteAt)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+  },
+  async down() {
+    // Additive only: nothing is ever dropped.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index d63c4ddc2bdbf377c18250b35032ee5b79cd5f85..7f2a494fca079358a3f9f21c3437512b5e2aa623 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -26,6 +26,7 @@ import { scriptAccess } from './2026_10_19_024_script_access.js';
 import { maxBattleHistory } from './2026_10_21_025_max_battle_history.js';
 import { trainSpotStops } from './2026_10_21_026_train_spot_stops.js';
 import { stopReports } from './2026_10_21_027_stop_reports.js';
+import { rocket } from './2026_10_22_028_rocket.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -59,4 +60,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_21_025_max_battle_history': maxBattleHistory,
   '2026_10_21_026_train_spot_stops': trainSpotStops,
   '2026_10_21_027_stop_reports': stopReports,
+  '2026_10_22_028_rocket': rocket,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index 7698622cead77f927e53ffa2fc98958dfec58929..1c63d10885ce9a97eea21dfec138ccaf4210256a 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -62,6 +62,8 @@ const ADDED_TABLES = [
   'StopPost',
   'TargetWant',
   'ResearchTask',
+  'RocketLineup',
+  'GruntMessage',
 ];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = [
@@ -184,6 +186,7 @@ describe('runMigrations', () => {
       '2026_10_21_025_max_battle_history',
       '2026_10_21_026_train_spot_stops',
       '2026_10_21_027_stop_reports',
+      '2026_10_22_028_rocket',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/rocket-lineup-repository.ts b/src/db/repositories/rocket-lineup-repository.ts
new file mode 100644
index 0000000000000000000000000000000000000000..41726c919155312b648759c30264a74746aa0944
--- /dev/null
+++ b/src/db/repositories/rocket-lineup-repository.ts
@@ -0,0 +1,93 @@
+import { sql, type Kysely } from 'kysely';
+import { z } from 'zod';
+import type { RocketChoice } from '../../domain/rocket/lineups.js';
+import type { Logger } from '../../log.js';
+import { inTransaction } from '../transaction.js';
+import type { DB } from '../types.js';
+
+/** The last good list of `/rocket`'s choices, and when it was read (undefined: never). */
+export interface KeptRocketList {
+  choices: RocketChoice[];
+  readAt: number | undefined;
+}
+
+/** A choice's catchable Pokémon as a document keeps them (`RocketLineup.catches`, a report's). */
+export const catchesDocument = z.array(
+  z.object({
+    name: z.string(),
+    key: z.string().nullable(),
+    dex: z.number().int().nullable(),
+    shiny: z.boolean(),
+    image: z.string().nullable(),
+  }),
+);
+
+/**
+ * The last good Rocket lineups read from ScrapedDuck (plan 8R-2; design 5.1; table
+ * `RocketLineup` of migration 028), as the task list is kept: a start without the network still
+ * offers them. Twin `MemoryRocketLineups` (`test/support/rocket-store.ts`), both running
+ * `rocketLineupCases`.
+ */
+export interface RocketLineupStorage {
+  /** The choices of the last good read, in its order, and when it was. */
+  kept(): Promise<KeptRocketList>;
+  /**
+   * Makes `choices` the kept list, in one transaction: a choice kept before keeps when it was
+   * first read, every choice listed is read `at` in its place, and one not listed is no longer
+   * kept as current.
+   */
+  replace(choices: readonly RocketChoice[], at: number): Promise<void>;
+}
+
+/** The `RocketLineup` table. */
+export class RocketLineupRepository implements RocketLineupStorage {
+  /** `log` hears of a row whose catches cannot be read (left out). */
+  constructor(
+    private readonly db: Kysely<DB>,
+    private readonly log?: Logger,
+  ) {}
+
+  async kept(): Promise<KeptRocketList> {
+    const rows = await this.db
+      .selectFrom('RocketLineup')
+      .selectAll()
+      .where('active', '=', 1)
+      .orderBy('position')
+      .orderBy('rocketKey')
+      .execute();
+    const choices: RocketChoice[] = [];
+    let readAt: number | undefined;
+    for (const row of rows) {
+      readAt = Math.max(readAt ?? 0, Number(row.lastSeen));
+      const catches = catchesDocument.safeParse(
+        typeof row.catches === 'string' ? JSON.parse(row.catches) : row.catches,
+      );
+      if (!catches.success) {
+        this.log?.warn({ lineup: row.rocketKey }, 'a kept Rocket lineup cannot be read; left out');
+        continue;
+      }
+      choices.push({ key: row.rocketKey, name: row.name, catches: catches.data });
+    }
+    return { choices, readAt };
+  }
+
+  replace(choices: readonly RocketChoice[], at: number): Promise<void> {
+    return inTransaction(this.db, async (trx) => {
+      await trx.updateTable('RocketLineup').set({ active: 0 }).execute();
+      if (choices.length === 0) return;
+      const values = sql.join(
+        choices.map(
+          (choice, position) =>
+            sql`(${choice.key}, ${choice.name}, ${JSON.stringify(choice.catches)},
+              ${String(at)}, ${String(at)}, 1, ${position})`,
+        ),
+      );
+      await sql`
+        insert into RocketLineup
+          (rocketKey, name, catches, firstSeen, lastSeen, active, position)
+        values ${values} as new
+        on duplicate key update name = new.name, catches = new.catches,
+          lastSeen = new.lastSeen, active = 1, position = new.position`.execute(trx);
+    });
+  }
+}
diff --git a/src/db/repositories/rocket-repositories.db.test.ts b/src/db/repositories/rocket-repositories.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d7b1995447f161ca5ca7e1ad487c0fdbc2d17d7f
--- /dev/null
+++ b/src/db/repositories/rocket-repositories.db.test.ts
@@ -0,0 +1,43 @@
+import type { Kysely } from 'kysely';
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import { listedChoice, rocketLineupCases } from '../../../test/support/rocket-store-cases.js';
+import { createTestLogger } from '../../../test/support/test-logger.js';
+import type { DB } from '../types.js';
+import { RocketLineupRepository } from './rocket-lineup-repository.js';
+
+/** The tables of plan 8R-2: the kept Rocket lineups and the grunt messages. */
+describe('the repositories of Team GO Rocket', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+
+  beforeAll(async () => {
+    ({ db, stop } = await startMigratedDatabase());
+  });
+  afterAll(async () => {
+    await stop();
+  });
+
+  describe('RocketLineupRepository', () => {
+    rocketLineupCases(async () => {
+      await db.deleteFrom('RocketLineup').execute();
+      return new RocketLineupRepository(db);
+    });
+
+    it('leaves out a kept choice whose catches it cannot read, and says so', async () => {
+      await db.deleteFrom('RocketLineup').execute();
+      const { log, entries } = createTestLogger();
+      const store = new RocketLineupRepository(db, log);
+      await store.replace([listedChoice('grunt:water'), listedChoice('leader:arlo')], 1_000);
+      await db
+        .updateTable('RocketLineup')
+        .set({ catches: JSON.stringify([{ name: 1 }]) })
+        .where('rocketKey', '=', 'leader:arlo')
+        .execute();
+      expect((await store.kept()).choices.map((choice) => choice.key)).toEqual(['grunt:water']);
+      expect(
+        entries.some((entry) => entry.msg === 'a kept Rocket lineup cannot be read; left out'),
+      ).toBe(true);
+    });
+  });
+});
diff --git a/src/db/table-names.ts b/src/db/table-names.ts
index 16f28e8b5365f386f5ab0a816b0335d6a354b4e1..9768b15b0e6eccd05b9beca39640d460ec5fd3bb 100644
--- a/src/db/table-names.ts
+++ b/src/db/table-names.ts
@@ -14,6 +14,7 @@ export const PINE_TABLES: readonly string[] = [
   ...LEGACY_TABLES,
   'knex_migrations',
   'knex_migrations_lock',
+  'GruntMessage',
   'GymLookup',
   'GymLookupDay',
   'GymReview',
@@ -40,6 +41,7 @@ export const PINE_TABLES: readonly string[] = [
   'RaidBossOverride',
   'ResearchEvent',
   'ResearchTask',
+  'RocketLineup',
   'RoleGroup',
   'ScriptAccess',
   'SpawnReport',
diff --git a/src/db/types.ts b/src/db/types.ts
index 25ddc08cf2948c84e5be9385debea64698684463..f699de0a92ba462debaaa8878eef25e9719ceeaa 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -70,6 +70,14 @@ export interface EndedPartyPost {
   guildId: number;
 }
 
+export interface GruntMessage {
+  channelId: string;
+  deleteAt: string;
+  messageId: string;
+  reportId: number;
+  serverId: string;
+}
+
 export interface Guild {
   id: Generated<number>;
   snowflake: string | null;
@@ -486,6 +494,16 @@ export interface ResearchTask {
   text: string;
 }
 
+export interface RocketLineup {
+  active: Generated<number>;
+  catches: Json;
+  firstSeen: string;
+  lastSeen: string;
+  name: string;
+  position: Generated<number>;
+  rocketKey: string;
+}
+
 export interface Role {
   groupId: number | null;
   guildId: number | null;
@@ -628,6 +646,7 @@ export interface DB {
   CommandRoleAuthorization: CommandRoleAuthorization;
   CommandRoles: CommandRoles;
   EndedPartyPost: EndedPartyPost;
+  GruntMessage: GruntMessage;
   Guild: Guild;
   Gym: Gym;
   GymLookup: GymLookup;
@@ -660,6 +679,7 @@ export interface DB {
   Region: Region;
   ResearchEvent: ResearchEvent;
   ResearchTask: ResearchTask;
+  RocketLineup: RocketLineup;
   Role: Role;
   RoleGroup: RoleGroup;
   SavedRoutes: SavedRoutes;
diff --git a/src/domain/research/leekduck.ts b/src/domain/research/leekduck.ts
index eb658a768fec171ee2911795029fe003db5508d6..ada1abab1f13d4636a283f23385486f8a9453d24 100644
--- a/src/domain/research/leekduck.ts
+++ b/src/domain/research/leekduck.ts
@@ -92,8 +92,11 @@ function pictures(html: string): string[] {
   return found;
 }
 
-/** Only https addresses of Leek Duck's CDN are kept as a reward's picture. */
-function pictureOf(src: string | undefined): string | null {
+/**
+ * Only https addresses of Leek Duck's CDN are kept as a reward's picture (also a Rocket catch's:
+ * ScrapedDuck's lineups name Leek Duck's pictures).
+ */
+export function leekDuckPicture(src: string | undefined): string | null {
   if (src === undefined) return null;
   // The page names its item pictures with spaces (`items/Rare Candy.png`).
   const address = htmlText(src).replace(/ /g, '%20');
@@ -147,7 +150,7 @@ function readReward(html: string, reading: Reading): TaskReward | undefined {
       dex: entry?.dex ?? null,
       shiny: html.includes('class="shiny-badge"'),
       cp: min !== undefined && max !== undefined ? { min, max } : null,
-      image: pictureOf(image),
+      image: leekDuckPicture(image),
     };
   }
   if (type === 'item' || type === 'resource') {
@@ -162,12 +165,12 @@ function readReward(html: string, reading: Reading): TaskReward | undefined {
         dex: dexOfPicture(srcs[1]),
         name,
         quantity,
-        image: pictureOf(srcs[0]),
+        image: leekDuckPicture(srcs[0]),
       };
     }
     const item = itemKey(name);
     if (item === '') return undefined;
-    return { kind: 'item', item, name, quantity, image: pictureOf(srcs[0]) };
+    return { kind: 'item', item, name, quantity, image: leekDuckPicture(srcs[0]) };
   }
   return undefined;
 }
diff --git a/src/domain/rocket/lineups.test.ts b/src/domain/rocket/lineups.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c488e053dc7d8db4ebb1f8e41a8c0ebc5708ce32
--- /dev/null
+++ b/src/domain/rocket/lineups.test.ts
@@ -0,0 +1,163 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import { feedChoice, readRocketFeed, rocketChoicesOfFeed } from '../../../test/support/rocket.js';
+import {
+  isHideout,
+  parseRocketKey,
+  parseRocketLineups,
+  rocketKey,
+  rocketName,
+  type RocketWho,
+} from './lineups.js';
+
+const names = (key: string): string[] => feedChoice(key).catches.map((one) => one.name);
+
+describe('parseRocketLineups', () => {
+  it('makes one choice per grunt type, the untyped grunts, the decoy, the leaders and Giovanni', () => {
+    const parsed = parseRocketLineups(readRocketFeed(), catalogueFixture());
+    expect(parsed.skipped).toBe(0);
+    expect(parsed.unknown).toEqual([]);
+    expect(parsed.choices.map((choice) => choice.name)).toEqual([
+      'Bug-type grunt',
+      'Dark-type grunt',
+      'Dragon-type grunt',
+      'Electric-type grunt',
+      'Fairy-type grunt',
+      'Fighting-type grunt',
+      'Fire-type grunt',
+      'Flying-type grunt',
+      'Ghost-type grunt',
+      'Grass-type grunt',
+      'Ground-type grunt',
+      'Ice-type grunt',
+      'Normal-type grunt',
+      'Poison-type grunt',
+      'Psychic-type grunt',
+      'Rock-type grunt',
+      'Steel-type grunt',
+      'Water-type grunt',
+      'Grunt (no type)',
+      'Decoy grunt',
+      'Cliff',
+      'Arlo',
+      'Sierra',
+      'Giovanni',
+    ]);
+    expect(parsed.choices.map((choice) => choice.key).slice(-7)).toEqual([
+      'grunt:water',
+      'grunt:none',
+      'decoy',
+      'leader:cliff',
+      'leader:arlo',
+      'leader:sierra',
+      'giovanni',
+    ]);
+  });
+
+  it('takes the catchable Pokémon of every slot, a type of two lineups as their union', () => {
+    // The female and the male water grunt: Magikarp once.
+    expect(names('grunt:water')).toEqual(['Mudkip', 'Tentacool', 'Krabby', 'Magikarp', 'Feebas']);
+    // Catches in the first and the second slot.
+    expect(names('grunt:normal')).toEqual([
+      'Teddiursa',
+      'Hoothoot',
+      'Porygon',
+      'Loudred',
+      'Stufful',
+      'Starly',
+    ]);
+    expect(names('grunt:none')).toEqual([
+      'Bulbasaur',
+      'Charmander',
+      'Squirtle',
+      'Snorlax',
+      'Lapras',
+    ]);
+    expect(names('decoy')).toEqual(['Bellsprout']);
+    // Giovanni's is in the third slot.
+    expect(names('giovanni')).toEqual(['Zekrom']);
+    expect(names('leader:sierra')).toEqual(['Pancham']);
+  });
+
+  it('names each catch by the catalogue, a regional form by its own entry', () => {
+    const [grimer] = feedChoice('leader:arlo').catches;
+    const grimerEntry = catalogueFixture().byKey(grimer?.key ?? '');
+    expect(grimer).toMatchObject({ name: 'Alolan Grimer', dex: 88, shiny: true });
+    expect(grimerEntry?.form).not.toBeNull();
+    expect(grimer?.image).toBe(
+      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm88.fALOLA.icon.png',
+    );
+    const [zekrom] = feedChoice('giovanni').catches;
+    expect(zekrom).toMatchObject({ name: 'Zekrom', key: 'zekrom', dex: 644, shiny: true });
+  });
+
+  it('skips and counts a lineup it cannot place, and says which Pokémon it does not know', () => {
+    const feed = readRocketFeed() as Record<string, unknown>[];
+    const odd = [
+      ...feed,
+      { name: 'Jessie', title: 'Team GO Rocket Leader', type: '', firstPokemon: [] },
+      { name: 'Shadow-type Grunt', title: 'Team GO Rocket Grunt', type: 'shadow' },
+      {
+        name: 'Male Grunt',
+        title: 'Team GO Rocket Grunt',
+        type: '',
+        firstPokemon: [{ name: 'Missingno', image: 'x', isEncounter: true, canBeShiny: false }],
+      },
+    ];
+    const parsed = parseRocketLineups(odd, catalogueFixture());
+    expect(parsed.skipped).toBe(2);
+    expect(parsed.unknown).toEqual(['Missingno']);
+    expect(parsed.choices.find((choice) => choice.key === 'grunt:none')?.catches.at(-1)).toEqual({
+      name: 'Missingno',
+      key: null,
+      dex: null,
+      shiny: false,
+      image: null,
+    });
+  });
+
+  it('throws for a feed of no lineup it can read, so a broken read never empties the list', () => {
+    expect(() => parseRocketLineups([], catalogueFixture())).toThrow(/no lineup/);
+    expect(() => parseRocketLineups({ lineups: [] }, catalogueFixture())).toThrow(/no lineup/);
+    expect(() => parseRocketLineups([{ name: 'Jessie' }], catalogueFixture())).toThrow(/no lineup/);
+  });
+
+  it('shares the parse of the fixture', () => {
+    expect(rocketChoicesOfFeed()).toHaveLength(24);
+  });
+});
+
+describe('Rocket keys', () => {
+  const every: RocketWho[] = [
+    { kind: 'grunt', type: 'water' },
+    { kind: 'grunt', type: null },
+    { kind: 'decoy' },
+    { kind: 'leader', leader: 'cliff' },
+    { kind: 'giovanni' },
+  ];
+
+  it('spells each who as a key and reads it back', () => {
+    expect(every.map(rocketKey)).toEqual([
+      'grunt:water',
+      'grunt:none',
+      'decoy',
+      'leader:cliff',
+      'giovanni',
+    ]);
+    for (const who of every) expect(parseRocketKey(rocketKey(who))).toEqual(who);
+    for (const text of ['grunt:shadow', 'grunt:', 'leader:jessie', 'leader:any', 'boss', 'Decoy']) {
+      expect(parseRocketKey(text)).toBeUndefined();
+    }
+  });
+
+  it('names each who and tells hideouts from grunts', () => {
+    expect(every.map(rocketName)).toEqual([
+      'Water-type grunt',
+      'Grunt (no type)',
+      'Decoy grunt',
+      'Cliff',
+      'Giovanni',
+    ]);
+    expect(every.map(isHideout)).toEqual([false, false, true, true, true]);
+  });
+});
diff --git a/src/domain/rocket/lineups.ts b/src/domain/rocket/lineups.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b9199cfe93ac6b08980e23962061eea8dfd0c535
--- /dev/null
+++ b/src/domain/rocket/lineups.ts
@@ -0,0 +1,234 @@
+import type { PokemonCatalogue } from '../pogo/catalogue.js';
+import { feedLookupOf } from '../pogo/feed-lookup.js';
+import { identifyBoss } from '../pogo/raid-boss-feed.js';
+import { POKEMON_TYPES, type PokemonType } from '../pogo/types.js';
+import { leekDuckPicture } from '../research/leekduck.js';
+
+/*
+ * Team GO Rocket's lineups (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.1): who a
+ * member can meet at a PokéStop and what they can catch from them, as ScrapedDuck's
+ * `rocketLineups.json` lists it. A grunt type with two lineups (a male and a female water grunt)
+ * is one choice whose catches are the union of both (design 5.1). Pure: the feed is read by
+ * `RocketLineupService`.
+ */
+
+/** The three leaders. */
+export const LEADERS = ['cliff', 'arlo', 'sierra'] as const;
+export type Leader = (typeof LEADERS)[number];
+
+/**
+ * Who a Rocket report is of: a grunt of a type (null: the untyped grunts), the decoy grunt, a
+ * leader, or Giovanni. The last three are hideouts: they hold their stop all day (Matt).
+ */
+export type RocketWho =
+  | { kind: 'grunt'; type: PokemonType | null }
+  | { kind: 'decoy' }
+  | { kind: 'leader'; leader: Leader }
+  | { kind: 'giovanni' };
+
+/** A Pokémon that can be caught after a battle with them (`isEncounter` in the feed). */
+export interface RocketCatch {
+  /** The feed's name (`Alolan Grimer`). */
+  name: string;
+  /** The catalogue's entry where the name and picture agree (`identifyBoss`); null else. */
+  key: string | null;
+  dex: number | null;
+  shiny: boolean;
+  /** Leek Duck's picture, when the feed gives one of its CDN. */
+  image: string | null;
+}
+
+/**
+ * A choice of `/rocket who:` (design 5.2), as the list keeps it: its key (`rocketKey`), its name
+ * (`rocketName`) and the Pokémon that can be caught, in the feed's order (a type of two lineups:
+ * the union of both).
+ */
+export interface RocketChoice {
+  key: string;
+  name: string;
+  catches: RocketCatch[];
+}
+
+/** What the feed gave: the choices, how many lineups were not read, the catches not known. */
+export interface ParsedRocketLineups {
+  choices: RocketChoice[];
+  /** Lineups of a title, leader or type this version does not know. */
+  skipped: number;
+  /** The names of catches the game data does not know (shown by name, wanted by nobody). */
+  unknown: string[];
+}
+
+const TYPES: ReadonlySet<string> = new Set(POKEMON_TYPES);
+const LEADER_NAMES: ReadonlySet<string> = new Set(LEADERS);
+
+/** `grunt:<type>`, `grunt:none`, `decoy`, `leader:<name>`, `giovanni`. */
+export function rocketKey(who: RocketWho): string {
+  switch (who.kind) {
+    case 'grunt':
+      return `grunt:${who.type ?? 'none'}`;
+    case 'leader':
+      return `leader:${who.leader}`;
+    default:
+      return who.kind;
+  }
+}
+
+/** Who a key names (`rocketKey`); undefined for any other text. */
+export function parseRocketKey(key: string): RocketWho | undefined {
+  if (key === 'decoy' || key === 'giovanni') return { kind: key };
+  const [head, value, ...more] = key.split(':');
+  if (value === undefined || more.length > 0) return undefined;
+  if (head === 'grunt') {
+    if (value === 'none') return { kind: 'grunt', type: null };
+    return TYPES.has(value) ? { kind: 'grunt', type: value as PokemonType } : undefined;
+  }
+  if (head === 'leader' && LEADER_NAMES.has(value)) {
+    return { kind: 'leader', leader: value as Leader };
+  }
+  return undefined;
+}
+
+/** Whether it holds its stop all day (a leader, Giovanni, the decoy), not for half an hour. */
+export function isHideout(who: RocketWho): boolean {
+  return who.kind !== 'grunt';
+}
+
+/** A word with its first letter upper case. */
+function capital(word: string): string {
+  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
+}
+
+/** `Water-type grunt`, `Grunt (no type)`, `Decoy grunt`, `Cliff`, `Giovanni`. */
+export function rocketName(who: RocketWho): string {
+  switch (who.kind) {
+    case 'grunt':
+      return who.type === null ? 'Grunt (no type)' : `${capital(who.type)}-type grunt`;
+    case 'decoy':
+      return 'Decoy grunt';
+    case 'leader':
+      return capital(who.leader);
+    case 'giovanni':
+      return 'Giovanni';
+  }
+}
+
+/** The longest name of a catch that is kept. */
+const MAX_CATCH_NAME = 100;
+
+/** A text of the feed as one plain line, or '' for none. */
+function line(value: unknown, room: number): string {
+  if (typeof value !== 'string') return '';
+  return value
+    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
+    .replace(/\s+/g, ' ')
+    .trim()
+    .slice(0, room);
+}
+
+/** Who a lineup of the feed is of, by its title, name and type; undefined for one not known. */
+function whoOf(lineup: Record<string, unknown>): RocketWho | undefined {
+  const title = line(lineup.title, 100).toLowerCase();
+  const name = line(lineup.name, 100).toLowerCase();
+  if (title.endsWith('boss') || name === 'giovanni') return { kind: 'giovanni' };
+  if (title.endsWith('leader')) {
+    return LEADER_NAMES.has(name) ? { kind: 'leader', leader: name as Leader } : undefined;
+  }
+  if (!title.endsWith('grunt')) return undefined;
+  if (name.includes('decoy')) return { kind: 'decoy' };
+  const type = line(lineup.type, 20).toLowerCase();
+  if (type === '') return { kind: 'grunt', type: null };
+  return TYPES.has(type) ? { kind: 'grunt', type: type as PokemonType } : undefined;
+}
+
+/** The order of the choices: grunt types by name, the untyped, the decoy, the leaders, Giovanni. */
+function rank(who: RocketWho): number {
+  switch (who.kind) {
+    case 'grunt':
+      return who.type === null ? 1 : 0;
+    case 'decoy':
+      return 2;
+    case 'leader':
+      return 3 + LEADERS.indexOf(who.leader);
+    case 'giovanni':
+      return 6;
+  }
+}
+
+/** The slots of a lineup in the feed. */
+const SLOTS = ['firstPokemon', 'secondPokemon', 'thirdPokemon'] as const;
+
+/**
+ * Reads ScrapedDuck's Rocket lineups (design 5.1). Throws when it holds no lineup this version
+ * can place (not a list, another feed), so that a broken read never replaces a good list. The
+ * catchable Pokémon are those marked `isEncounter`, in any slot; one named twice (two lineups of
+ * a type, two slots) is kept once.
+ */
+export function parseRocketLineups(raw: unknown, catalogue: PokemonCatalogue): ParsedRocketLineups {
+  if (!Array.isArray(raw)) throw new Error('The Rocket lineups feed holds no lineup');
+  const lookup = feedLookupOf(catalogue);
+  const byKey = new Map<string, { who: RocketWho; choice: RocketChoice }>();
+  const unknown = new Set<string>();
+  let skipped = 0;
+  for (const item of raw as unknown[]) {
+    if (typeof item !== 'object' || item === null) {
+      skipped += 1;
+      continue;
+    }
+    const lineup = item as Record<string, unknown>;
+    const who = whoOf(lineup);
+    if (!who) {
+      skipped += 1;
+      continue;
+    }
+    const key = rocketKey(who);
+    let known = byKey.get(key);
+    if (!known) {
+      known = { who, choice: { key, name: rocketName(who), catches: [] } };
+      byKey.set(key, known);
+    }
+    const { catches } = known.choice;
+    for (const slot of SLOTS) {
+      const pokemon: unknown = lineup[slot];
+      if (!Array.isArray(pokemon)) continue;
+      for (const one of pokemon as unknown[]) {
+        if (typeof one !== 'object' || one === null) continue;
+        const shown = one as Record<string, unknown>;
+        if (shown.isEncounter !== true) continue;
+        const name = line(shown.name, MAX_CATCH_NAME);
+        if (name === '') continue;
+        const image = typeof shown.image === 'string' ? shown.image : undefined;
+        const ids = identifyBoss(name, image, lookup)?.resolved;
+        const entryKey = ids && lookup.keyOf(ids.pokemonId, ids.form);
+        const entry = entryKey === undefined ? undefined : catalogue.byKey(entryKey);
+        if (!entry) unknown.add(name);
+        const caught: RocketCatch = {
+          name,
+          key: entry?.key ?? null,
+          dex: entry?.dex ?? null,
+          shiny: shown.canBeShiny === true,
+          image: leekDuckPicture(image),
+        };
+        const same = (other: RocketCatch): boolean =>
+          caught.key === null
+            ? other.key === null && other.name === name
+            : other.key === caught.key;
+        if (!catches.some(same)) catches.push(caught);
+      }
+    }
+  }
+  if (byKey.size === 0) throw new Error('The Rocket lineups feed holds no lineup');
+  const choices = [...byKey.values()]
+    .sort((a, b) => rank(a.who) - rank(b.who) || a.choice.name.localeCompare(b.choice.name))
+    .map(({ choice }) => choice);
+  return { choices, skipped, unknown: [...unknown] };
+}
+
+/**
+ * The catches of a list in short, as a choice and a line show them: `Mudkip, Tentacool, Krabby
+ * +2`, the first `most` and "+N" for the rest.
+ */
+export function catchesInShort(catches: readonly Pick<RocketCatch, 'name'>[], most = 3): string {
+  const names = catches.map((one) => one.name);
+  const shown = names.slice(0, most).join(', ');
+  return names.length > most ? `${shown} +${String(names.length - most)}` : shown;
+}
diff --git a/test/fixtures/rocket-lineups.json b/test/fixtures/rocket-lineups.json
new file mode 100644
index 0000000000000000000000000000000000000000..ce9eb6797df05a4f852b0bae2e3f0fce8144e939
--- /dev/null
+++ b/test/fixtures/rocket-lineups.json
@@ -0,0 +1 @@
+[{"name":"Giovanni","title":"Team GO Rocket Boss","type":"","firstPokemon":[{"name":"Persian","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm53.icon.png","types":["normal"],"isEncounter":false,"canBeShiny":false}],"secondPokemon":[{"name":"Kangaskhan","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm115.icon.png","types":["normal"],"isEncounter":false,"canBeShiny":false},{"name":"Rhyperior","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm464.icon.png","types":["ground","rock"],"isEncounter":false,"canBeShiny":false},{"name":"Machamp","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm68.icon.png","types":["fighting"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Zekrom","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm644.icon.png","types":["dragon","electric"],"isEncounter":true,"canBeShiny":true}]},{"name":"Cliff","title":"Team GO Rocket Leader","type":"","firstPokemon":[{"name":"Cubone","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm104.icon.png","types":["ground"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Snorlax","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm143.icon.png","types":["normal"],"isEncounter":false,"canBeShiny":false},{"name":"Golurk","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm623.icon.png","types":["ground","ghost"],"isEncounter":false,"canBeShiny":false},{"name":"Galarian Weezing","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm110.fGALARIAN.icon.png","types":["poison","fairy"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Tyranitar","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm248.icon.png","types":["rock","dark"],"isEncounter":false,"canBeShiny":false},{"name":"Camerupt","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm323.icon.png","types":["fire","ground"],"isEncounter":false,"canBeShiny":false},{"name":"Gallade","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm475.icon.png","types":["psychic","fighting"],"isEncounter":false,"canBeShiny":false}]},{"name":"Arlo","title":"Team GO Rocket Leader","type":"","firstPokemon":[{"name":"Alolan Grimer","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm88.fALOLA.icon.png","types":["poison","dark"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Steelix","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm208.icon.png","types":["steel","ground"],"isEncounter":false,"canBeShiny":false},{"name":"Golurk","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm623.icon.png","types":["ground","ghost"],"isEncounter":false,"canBeShiny":false},{"name":"Slowbro","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm80.icon.png","types":["water","psychic"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Alakazam","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm65.icon.png","types":["psychic"],"isEncounter":false,"canBeShiny":false},{"name":"Charizard","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm6.icon.png","types":["fire","flying"],"isEncounter":false,"canBeShiny":false},{"name":"Scizor","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm212.icon.png","types":["bug","steel"],"isEncounter":false,"canBeShiny":false}]},{"name":"Sierra","title":"Team GO Rocket Leader","type":"","firstPokemon":[{"name":"Pancham","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm674.icon.png","types":["fighting"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Blastoise","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm9.icon.png","types":["water"],"isEncounter":false,"canBeShiny":false},{"name":"Flygon","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm330.icon.png","types":["ground","dragon"],"isEncounter":false,"canBeShiny":false},{"name":"Ferrothorn","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm598.icon.png","types":["grass","steel"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Milotic","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm350.icon.png","types":["water"],"isEncounter":false,"canBeShiny":false},{"name":"Houndoom","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm229.icon.png","types":["dark","fire"],"isEncounter":false,"canBeShiny":false},{"name":"Steelix","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm208.icon.png","types":["steel","ground"],"isEncounter":false,"canBeShiny":false}]},{"name":"Normal-type Male Grunt","title":"Team GO Rocket Grunt","type":"normal","firstPokemon":[{"name":"Teddiursa","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm216.icon.png","types":["normal"],"isEncounter":true,"canBeShiny":true},{"name":"Hoothoot","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm163.icon.png","types":["normal","flying"],"isEncounter":true,"canBeShiny":true},{"name":"Porygon","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm137.icon.png","types":["normal"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Loudred","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm294.icon.png","types":["normal"],"isEncounter":true,"canBeShiny":true},{"name":"Stufful","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm759.icon.png","types":["normal","fighting"],"isEncounter":true,"canBeShiny":true},{"name":"Starly","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm396.icon.png","types":["normal","flying"],"isEncounter":true,"canBeShiny":true}],"thirdPokemon":[{"name":"Ursaring","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm217.icon.png","types":["normal"],"isEncounter":false,"canBeShiny":false},{"name":"Swellow","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm277.icon.png","types":["normal","flying"],"isEncounter":false,"canBeShiny":false},{"name":"Kangaskhan","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm115.icon.png","types":["normal"],"isEncounter":false,"canBeShiny":false}]},{"name":"Fire-type Female Grunt","title":"Team GO Rocket Grunt","type":"fire","firstPokemon":[{"name":"Litwick","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm607.icon.png","types":["ghost","fire"],"isEncounter":true,"canBeShiny":true},{"name":"Ponyta","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm77.icon.png","types":["fire"],"isEncounter":true,"canBeShiny":true},{"name":"Torchic","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm255.icon.png","types":["fire"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Magmar","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm126.icon.png","types":["fire"],"isEncounter":false,"canBeShiny":false},{"name":"Blaziken","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm257.icon.png","types":["fire","fighting"],"isEncounter":false,"canBeShiny":false},{"name":"Camerupt","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm323.icon.png","types":["fire","ground"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Darmanitan","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm555.fSTANDARD.icon.png","types":["fire"],"isEncounter":false,"canBeShiny":false},{"name":"Delphox","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm655.icon.png","types":["fire","psychic"],"isEncounter":false,"canBeShiny":false},{"name":"Magmortar","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm467.icon.png","types":["fire"],"isEncounter":false,"canBeShiny":false}]},{"name":"Water-type Female Grunt","title":"Team GO Rocket Grunt","type":"water","firstPokemon":[{"name":"Mudkip","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm258.icon.png","types":["water"],"isEncounter":true,"canBeShiny":true},{"name":"Tentacool","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm72.icon.png","types":["water","poison"],"isEncounter":true,"canBeShiny":true},{"name":"Krabby","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm98.icon.png","types":["water"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Dewpider","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm751.icon.png","types":["water","bug"],"isEncounter":false,"canBeShiny":false},{"name":"Swampert","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm260.icon.png","types":["water","ground"],"isEncounter":false,"canBeShiny":false},{"name":"Sharpedo","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm319.icon.png","types":["water","dark"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Walrein","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm365.icon.png","types":["ice","water"],"isEncounter":false,"canBeShiny":false},{"name":"Greninja","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm658.icon.png","types":["water","dark"],"isEncounter":false,"canBeShiny":false},{"name":"Tentacruel","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm73.icon.png","types":["water","poison"],"isEncounter":false,"canBeShiny":false}]},{"name":"Water-type Male Grunt","title":"Team GO Rocket Grunt","type":"water","firstPokemon":[{"name":"Magikarp","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm129.icon.png","types":["water"],"isEncounter":true,"canBeShiny":true},{"name":"Feebas","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm349.icon.png","types":["water"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Magikarp","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm129.icon.png","types":["water"],"isEncounter":true,"canBeShiny":true}],"thirdPokemon":[{"name":"Magikarp","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm129.icon.png","types":["water"],"isEncounter":false,"canBeShiny":false},{"name":"Gyarados","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm130.icon.png","types":["water","flying"],"isEncounter":false,"canBeShiny":false}]},{"name":"Electric-type Female Grunt","title":"Team GO Rocket Grunt","type":"electric","firstPokemon":[{"name":"Voltorb","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm100.icon.png","types":["electric"],"isEncounter":true,"canBeShiny":true},{"name":"Shinx","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm403.icon.png","types":["electric"],"isEncounter":true,"canBeShiny":true},{"name":"Helioptile","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm694.icon.png","types":["electric","normal"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Electabuzz","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm125.icon.png","types":["electric"],"isEncounter":true,"canBeShiny":true},{"name":"Magnemite","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm81.icon.png","types":["electric","steel"],"isEncounter":true,"canBeShiny":true},{"name":"Alolan Geodude","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm74.fALOLA.icon.png","types":["rock","electric"],"isEncounter":true,"canBeShiny":true}],"thirdPokemon":[{"name":"Luxray","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm405.icon.png","types":["electric"],"isEncounter":false,"canBeShiny":false},{"name":"Ampharos","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm181.icon.png","types":["electric"],"isEncounter":false,"canBeShiny":false},{"name":"Galvantula","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm596.icon.png","types":["bug","electric"],"isEncounter":false,"canBeShiny":false}]},{"name":"Grass-type Male Grunt","title":"Team GO Rocket Grunt","type":"grass","firstPokemon":[{"name":"Phantump","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm708.icon.png","types":["ghost","grass"],"isEncounter":true,"canBeShiny":true},{"name":"Fomantis","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm753.icon.png","types":["grass"],"isEncounter":true,"canBeShiny":true},{"name":"Tangela","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm114.icon.png","types":["grass"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Lileep","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm345.icon.png","types":["rock","grass"],"isEncounter":false,"canBeShiny":false},{"name":"Sceptile","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm254.icon.png","types":["grass"],"isEncounter":false,"canBeShiny":false},{"name":"Morelull","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm755.icon.png","types":["grass","fairy"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Chesnaught","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm652.icon.png","types":["grass","fighting"],"isEncounter":false,"canBeShiny":false},{"name":"Trevenant","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm709.icon.png","types":["ghost","grass"],"isEncounter":false,"canBeShiny":false},{"name":"Cradily","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm346.icon.png","types":["rock","grass"],"isEncounter":false,"canBeShiny":false}]},{"name":"Ice-type Female Grunt","title":"Team GO Rocket Grunt","type":"ice","firstPokemon":[{"name":"Seel","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm86.icon.png","types":["water"],"isEncounter":true,"canBeShiny":true},{"name":"Delibird","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm225.icon.png","types":["ice","flying"],"isEncounter":true,"canBeShiny":true},{"name":"Spheal","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm363.icon.png","types":["ice","water"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Sealeo","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm364.icon.png","types":["ice","water"],"isEncounter":false,"canBeShiny":false},{"name":"Froslass","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm478.icon.png","types":["ice","ghost"],"isEncounter":false,"canBeShiny":false},{"name":"Alolan Ninetales","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm38.fALOLA.icon.png","types":["ice","fairy"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Aurorus","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm699.icon.png","types":["rock","ice"],"isEncounter":false,"canBeShiny":false},{"name":"Froslass","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm478.icon.png","types":["ice","ghost"],"isEncounter":false,"canBeShiny":false},{"name":"Glalie","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm362.icon.png","types":["ice"],"isEncounter":false,"canBeShiny":false}]},{"name":"Fighting-type Female Grunt","title":"Team GO Rocket Grunt","type":"fighting","firstPokemon":[{"name":"Timburr","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm532.icon.png","types":["fighting"],"isEncounter":true,"canBeShiny":true},{"name":"Mankey","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm56.icon.png","types":["fighting"],"isEncounter":true,"canBeShiny":true},{"name":"Makuhita","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm296.icon.png","types":["fighting"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Hitmontop","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm237.icon.png","types":["fighting"],"isEncounter":true,"canBeShiny":true},{"name":"Hitmonlee","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm106.icon.png","types":["fighting"],"isEncounter":true,"canBeShiny":true},{"name":"Hitmonchan","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm107.icon.png","types":["fighting"],"isEncounter":true,"canBeShiny":true}],"thirdPokemon":[{"name":"Conkeldurr","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm534.icon.png","types":["fighting"],"isEncounter":false,"canBeShiny":false},{"name":"Annihilape","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm979.icon.png","types":["fighting","ghost"],"isEncounter":false,"canBeShiny":false},{"name":"Infernape","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm392.icon.png","types":["fire","fighting"],"isEncounter":false,"canBeShiny":false}]},{"name":"Poison-type Female Grunt","title":"Team GO Rocket Grunt","type":"poison","firstPokemon":[{"name":"Oddish","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm43.icon.png","types":["grass","poison"],"isEncounter":true,"canBeShiny":true},{"name":"Zubat","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm41.icon.png","types":["poison","flying"],"isEncounter":true,"canBeShiny":true},{"name":"Qwilfish","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm211.icon.png","types":["water","poison"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Galarian Weezing","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm110.fGALARIAN.icon.png","types":["poison","fairy"],"isEncounter":true,"canBeShiny":true},{"name":"Nidorino","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm33.icon.png","types":["poison"],"isEncounter":true,"canBeShiny":true},{"name":"Nidorina","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm30.icon.png","types":["poison"],"isEncounter":true,"canBeShiny":true}],"thirdPokemon":[{"name":"Weezing","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm110.icon.png","types":["poison"],"isEncounter":false,"canBeShiny":false},{"name":"Toxicroak","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm454.icon.png","types":["poison","fighting"],"isEncounter":false,"canBeShiny":false},{"name":"Amoonguss","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm591.icon.png","types":["grass","poison"],"isEncounter":false,"canBeShiny":false}]},{"name":"Ground-type Male Grunt","title":"Team GO Rocket Grunt","type":"ground","firstPokemon":[{"name":"Rhyhorn","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm111.icon.png","types":["ground","rock"],"isEncounter":true,"canBeShiny":true},{"name":"Gligar","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm207.icon.png","types":["ground","flying"],"isEncounter":true,"canBeShiny":true},{"name":"Trapinch","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm328.icon.png","types":["ground"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Gligar","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm207.icon.png","types":["ground","flying"],"isEncounter":true,"canBeShiny":true},{"name":"Claydol","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm344.icon.png","types":["ground","psychic"],"isEncounter":true,"canBeShiny":true},{"name":"Vibrava","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm329.icon.png","types":["ground","dragon"],"isEncounter":true,"canBeShiny":true}],"thirdPokemon":[{"name":"Golurk","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm623.icon.png","types":["ground","ghost"],"isEncounter":false,"canBeShiny":false},{"name":"Hippowdon","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm450.icon.png","types":["ground"],"isEncounter":false,"canBeShiny":false},{"name":"Flygon","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm330.icon.png","types":["ground","dragon"],"isEncounter":false,"canBeShiny":false}]},{"name":"Flying-type Female Grunt","title":"Team GO Rocket Grunt","type":"flying","firstPokemon":[{"name":"Taillow","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm276.icon.png","types":["normal","flying"],"isEncounter":true,"canBeShiny":true},{"name":"Rookidee","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm821.icon.png","types":["flying"],"isEncounter":true,"canBeShiny":true},{"name":"Swablu","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm333.icon.png","types":["normal","flying"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Scyther","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm123.icon.png","types":["bug","flying"],"isEncounter":true,"canBeShiny":true},{"name":"Zubat","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm41.icon.png","types":["poison","flying"],"isEncounter":true,"canBeShiny":true},{"name":"Gligar","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm207.icon.png","types":["ground","flying"],"isEncounter":true,"canBeShiny":true}],"thirdPokemon":[{"name":"Dragonite","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm149.icon.png","types":["dragon","flying"],"isEncounter":false,"canBeShiny":false},{"name":"Toucannon","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm733.icon.png","types":["normal","flying"],"isEncounter":false,"canBeShiny":false},{"name":"Swanna","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm581.icon.png","types":["water","flying"],"isEncounter":false,"canBeShiny":false}]},{"name":"Psychic-type Male Grunt","title":"Team GO Rocket Grunt","type":"psychic","firstPokemon":[{"name":"Wobbuffet","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm202.icon.png","types":["psychic"],"isEncounter":true,"canBeShiny":true},{"name":"Ralts","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm280.icon.png","types":["psychic","fairy"],"isEncounter":true,"canBeShiny":true},{"name":"Drowzee","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm96.icon.png","types":["psychic"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Drowzee","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm96.icon.png","types":["psychic"],"isEncounter":true,"canBeShiny":true},{"name":"Duosion","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm578.icon.png","types":["psychic"],"isEncounter":true,"canBeShiny":true},{"name":"Wobbuffet","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm202.icon.png","types":["psychic"],"isEncounter":true,"canBeShiny":true}],"thirdPokemon":[{"name":"Gallade","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm475.icon.png","types":["psychic","fighting"],"isEncounter":false,"canBeShiny":false},{"name":"Malamar","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm687.icon.png","types":["dark","psychic"],"isEncounter":false,"canBeShiny":false},{"name":"Reuniclus","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm579.icon.png","types":["psychic"],"isEncounter":false,"canBeShiny":false}]},{"name":"Bug-type Male Grunt","title":"Team GO Rocket Grunt","type":"bug","firstPokemon":[{"name":"Venonat","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm48.icon.png","types":["bug","poison"],"isEncounter":true,"canBeShiny":true},{"name":"Weedle","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm13.icon.png","types":["bug","poison"],"isEncounter":true,"canBeShiny":true},{"name":"Wimpod","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm767.icon.png","types":["bug","water"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Pinsir","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm127.icon.png","types":["bug"],"isEncounter":true,"canBeShiny":true},{"name":"Anorith","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm347.icon.png","types":["rock","bug"],"isEncounter":true,"canBeShiny":true},{"name":"Dewpider","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm751.icon.png","types":["water","bug"],"isEncounter":true,"canBeShiny":true}],"thirdPokemon":[{"name":"Scizor","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm212.icon.png","types":["bug","steel"],"isEncounter":false,"canBeShiny":false},{"name":"Scolipede","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm545.icon.png","types":["bug","poison"],"isEncounter":false,"canBeShiny":false},{"name":"Vikavolt","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm738.icon.png","types":["bug","electric"],"isEncounter":false,"canBeShiny":false}]},{"name":"Rock-type Male Grunt","title":"Team GO Rocket Grunt","type":"rock","firstPokemon":[{"name":"Onix","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm95.icon.png","types":["rock","ground"],"isEncounter":true,"canBeShiny":true},{"name":"Kabuto","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm140.icon.png","types":["rock","water"],"isEncounter":true,"canBeShiny":true},{"name":"Cranidos","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm408.icon.png","types":["rock"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Shieldon","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm410.icon.png","types":["rock","steel"],"isEncounter":true,"canBeShiny":true},{"name":"Graveler","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm75.icon.png","types":["rock","ground"],"isEncounter":true,"canBeShiny":true},{"name":"Cranidos","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm408.icon.png","types":["rock"],"isEncounter":true,"canBeShiny":true}],"thirdPokemon":[{"name":"Tyrantrum","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm697.icon.png","types":["rock","dragon"],"isEncounter":false,"canBeShiny":false},{"name":"Golem","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm76.icon.png","types":["rock","ground"],"isEncounter":false,"canBeShiny":false},{"name":"Aurorus","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm699.icon.png","types":["rock","ice"],"isEncounter":false,"canBeShiny":false}]},{"name":"Ghost-type Male Grunt","title":"Team GO Rocket Grunt","type":"ghost","firstPokemon":[{"name":"Duskull","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm355.icon.png","types":["ghost"],"isEncounter":true,"canBeShiny":true},{"name":"Sandygast","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm769.icon.png","types":["ghost","ground"],"isEncounter":true,"canBeShiny":true},{"name":"Yamask","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm562.icon.png","types":["ghost"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Dusclops","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm356.icon.png","types":["ghost"],"isEncounter":false,"canBeShiny":false},{"name":"Sableye","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm302.icon.png","types":["dark","ghost"],"isEncounter":false,"canBeShiny":false},{"name":"Cofagrigus","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm563.icon.png","types":["ghost"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Gengar","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm94.icon.png","types":["ghost","poison"],"isEncounter":false,"canBeShiny":false},{"name":"Froslass","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm478.icon.png","types":["ice","ghost"],"isEncounter":false,"canBeShiny":false},{"name":"Cofagrigus","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm563.icon.png","types":["ghost"],"isEncounter":false,"canBeShiny":false}]},{"name":"Dragon-type Female Grunt","title":"Team GO Rocket Grunt","type":"dragon","firstPokemon":[{"name":"Noibat","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm714.icon.png","types":["flying","dragon"],"isEncounter":true,"canBeShiny":true},{"name":"Deino","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm633.icon.png","types":["dark","dragon"],"isEncounter":true,"canBeShiny":true},{"name":"Axew","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm610.icon.png","types":["dragon"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Alolan Exeggutor","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm103.fALOLA.icon.png","types":["grass","dragon"],"isEncounter":false,"canBeShiny":false},{"name":"Dragonair","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm148.icon.png","types":["dragon"],"isEncounter":false,"canBeShiny":false},{"name":"Gabite","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm444.icon.png","types":["dragon","ground"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Dragonite","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm149.icon.png","types":["dragon","flying"],"isEncounter":false,"canBeShiny":false},{"name":"Garchomp","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm445.icon.png","types":["dragon","ground"],"isEncounter":false,"canBeShiny":false},{"name":"Salamence","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm373.icon.png","types":["dragon","flying"],"isEncounter":false,"canBeShiny":false}]},{"name":"Dark-type Female Grunt","title":"Team GO Rocket Grunt","type":"dark","firstPokemon":[{"name":"Carvanha","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm318.icon.png","types":["water","dark"],"isEncounter":true,"canBeShiny":true},{"name":"Poochyena","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm261.icon.png","types":["dark"],"isEncounter":true,"canBeShiny":true},{"name":"Alolan Rattata","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm19.fALOLA.icon.png","types":["dark","normal"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Sneasel","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm215.icon.png","types":["dark","ice"],"isEncounter":true,"canBeShiny":true},{"name":"Houndour","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm228.icon.png","types":["dark","fire"],"isEncounter":true,"canBeShiny":true},{"name":"Absol","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm359.icon.png","types":["dark"],"isEncounter":true,"canBeShiny":true}],"thirdPokemon":[{"name":"Liepard","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm510.icon.png","types":["dark"],"isEncounter":false,"canBeShiny":false},{"name":"Hydreigon","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm635.icon.png","types":["dark","dragon"],"isEncounter":false,"canBeShiny":false}]},{"name":"Steel-type Male Grunt","title":"Team GO Rocket Grunt","type":"steel","firstPokemon":[{"name":"Alolan Sandshrew","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm27.fALOLA.icon.png","types":["ice","steel"],"isEncounter":true,"canBeShiny":true},{"name":"Aron","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm304.icon.png","types":["steel","rock"],"isEncounter":true,"canBeShiny":true},{"name":"Beldum","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm374.icon.png","types":["steel","psychic"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Lairon","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm305.icon.png","types":["steel","rock"],"isEncounter":false,"canBeShiny":false},{"name":"Skarmory","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm227.icon.png","types":["steel","flying"],"isEncounter":false,"canBeShiny":false},{"name":"Metang","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm375.icon.png","types":["steel","psychic"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Aggron","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm306.icon.png","types":["steel","rock"],"isEncounter":false,"canBeShiny":false},{"name":"Alolan Sandslash","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm28.fALOLA.icon.png","types":["ice","steel"],"isEncounter":false,"canBeShiny":false},{"name":"Probopass","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm476.icon.png","types":["rock","steel"],"isEncounter":false,"canBeShiny":false}]},{"name":"Fairy-type Female Grunt","title":"Team GO Rocket Grunt","type":"fairy","firstPokemon":[{"name":"Ralts","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm280.icon.png","types":["psychic","fairy"],"isEncounter":true,"canBeShiny":true},{"name":"Snubbull","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm209.icon.png","types":["fairy"],"isEncounter":true,"canBeShiny":true},{"name":"Alolan Vulpix","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm37.fALOLA.icon.png","types":["ice"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Snubbull","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm209.icon.png","types":["fairy"],"isEncounter":true,"canBeShiny":true},{"name":"Galarian Weezing","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm110.fGALARIAN.icon.png","types":["poison","fairy"],"isEncounter":true,"canBeShiny":true},{"name":"Kirlia","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm281.icon.png","types":["psychic","fairy"],"isEncounter":true,"canBeShiny":true}],"thirdPokemon":[{"name":"Alolan Ninetales","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm38.fALOLA.icon.png","types":["ice","fairy"],"isEncounter":false,"canBeShiny":false},{"name":"Galarian Weezing","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm110.fGALARIAN.icon.png","types":["poison","fairy"],"isEncounter":false,"canBeShiny":false},{"name":"Granbull","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm210.icon.png","types":["fairy"],"isEncounter":false,"canBeShiny":false}]},{"name":"Male Grunt","title":"Team GO Rocket Grunt","type":"","firstPokemon":[{"name":"Bulbasaur","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm1.icon.png","types":["grass","poison"],"isEncounter":true,"canBeShiny":true},{"name":"Charmander","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm4.icon.png","types":["fire"],"isEncounter":true,"canBeShiny":true},{"name":"Squirtle","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm7.icon.png","types":["water"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Ivysaur","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm2.icon.png","types":["grass","poison"],"isEncounter":false,"canBeShiny":false},{"name":"Charmeleon","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm5.icon.png","types":["fire"],"isEncounter":false,"canBeShiny":false},{"name":"Wartortle","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm8.icon.png","types":["water"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Venusaur","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm3.icon.png","types":["grass","poison"],"isEncounter":false,"canBeShiny":false},{"name":"Charizard","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm6.icon.png","types":["fire","flying"],"isEncounter":false,"canBeShiny":false},{"name":"Blastoise","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm9.icon.png","types":["water"],"isEncounter":false,"canBeShiny":false}]},{"name":"Female Grunt","title":"Team GO Rocket Grunt","type":"","firstPokemon":[{"name":"Snorlax","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm143.icon.png","types":["normal"],"isEncounter":true,"canBeShiny":true},{"name":"Lapras","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm131.icon.png","types":["water","ice"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Poliwrath","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm62.icon.png","types":["water","fighting"],"isEncounter":false,"canBeShiny":false},{"name":"Gardevoir","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm282.icon.png","types":["psychic","fairy"],"isEncounter":false,"canBeShiny":false},{"name":"Snorlax","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm143.icon.png","types":["normal"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Gyarados","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm130.icon.png","types":["water","flying"],"isEncounter":false,"canBeShiny":false},{"name":"Dragonite","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm149.icon.png","types":["dragon","flying"],"isEncounter":false,"canBeShiny":false},{"name":"Snorlax","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm143.icon.png","types":["normal"],"isEncounter":false,"canBeShiny":false}]},{"name":"Decoy Female Grunt","title":"Team GO Rocket Grunt","type":"","firstPokemon":[{"name":"Bellsprout","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm69.icon.png","types":["grass","poison"],"isEncounter":true,"canBeShiny":true}],"secondPokemon":[{"name":"Raticate","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm20.icon.png","types":["normal"],"isEncounter":false,"canBeShiny":false},{"name":"Weepinbell","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm70.icon.png","types":["grass","poison"],"isEncounter":false,"canBeShiny":false}],"thirdPokemon":[{"name":"Raticate","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm20.icon.png","types":["normal"],"isEncounter":false,"canBeShiny":false},{"name":"Snorlax","image":"https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm143.icon.png","types":["normal"],"isEncounter":false,"canBeShiny":false}]}]
\ No newline at end of file
diff --git a/test/support/rocket-store-cases.ts b/test/support/rocket-store-cases.ts
new file mode 100644
index 0000000000000000000000000000000000000000..606c0fb1520fece0cea97ed4091a555fbb371db5
--- /dev/null
+++ b/test/support/rocket-store-cases.ts
@@ -0,0 +1,43 @@
+import { expect, it } from 'vitest';
+import type { RocketLineupStorage } from '../../src/db/repositories/rocket-lineup-repository.js';
+import type { RocketChoice } from '../../src/domain/rocket/lineups.js';
+
+/** A choice of the list as the feed of 2026-10-22 has it, made shorter (`overrides` change it). */
+export function listedChoice(key: string, overrides: Partial<RocketChoice> = {}): RocketChoice {
+  return {
+    key,
+    name: key === 'leader:arlo' ? 'Arlo' : 'Water-type grunt',
+    catches: [
+      {
+        name: key === 'leader:arlo' ? 'Alolan Grimer' : 'Magikarp',
+        key: key === 'leader:arlo' ? 'grimer-alola' : 'magikarp',
+        dex: key === 'leader:arlo' ? 88 : 129,
+        shiny: true,
+        image: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm129.icon.png',
+      },
+      { name: 'Missingno', key: null, dex: null, shiny: false, image: null },
+    ],
+    ...overrides,
+  };
+}
+
+/** What the kept Rocket lineups do, run against the repository and its twin in memory alike. */
+export function rocketLineupCases(made: () => Promise<RocketLineupStorage>): void {
+  it('has no list before the first read', async () => {
+    const store = await made();
+    expect(await store.kept()).toEqual({ choices: [], readAt: undefined });
+  });
+
+  it('keeps the last list read, in its order, a choice changed by a later read', async () => {
+    const store = await made();
+    const water = listedChoice('grunt:water');
+    const arlo = listedChoice('leader:arlo');
+    const decoy = listedChoice('decoy', { name: 'Decoy grunt', catches: [] });
+    await store.replace([water, arlo], 1_000);
+    await store.replace([decoy, { ...water, catches: water.catches.slice(0, 1) }], 2_000);
+    expect(await store.kept()).toEqual({
+      choices: [decoy, { ...water, catches: water.catches.slice(0, 1) }],
+      readAt: 2_000,
+    });
+  });
+}
diff --git a/test/support/rocket-store.test.ts b/test/support/rocket-store.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..38bcfd65218dfea787a94e8340b254f0d1808434
--- /dev/null
+++ b/test/support/rocket-store.test.ts
@@ -0,0 +1,7 @@
+import { describe } from 'vitest';
+import { rocketLineupCases } from './rocket-store-cases.js';
+import { MemoryRocketLineups } from './rocket-store.js';
+
+describe('MemoryRocketLineups', () => {
+  rocketLineupCases(() => Promise.resolve(new MemoryRocketLineups()));
+});
diff --git a/test/support/rocket-store.ts b/test/support/rocket-store.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1e9124d94cb7bad50b59996a0b657c8e627408f0
--- /dev/null
+++ b/test/support/rocket-store.ts
@@ -0,0 +1,44 @@
+import type {
+  KeptRocketList,
+  RocketLineupStorage,
+} from '../../src/db/repositories/rocket-lineup-repository.js';
+import type { RocketChoice } from '../../src/domain/rocket/lineups.js';
+
+/** The kept Rocket lineups in memory (`RocketLineupStorage`), the twin of `RocketLineupRepository`. */
+export class MemoryRocketLineups implements RocketLineupStorage {
+  readonly rows = new Map<
+    string,
+    { choice: RocketChoice; firstSeen: number; lastSeen: number; active: boolean; position: number }
+  >();
+  readonly failing = new Map<keyof RocketLineupStorage, Error>();
+
+  private fail(method: keyof RocketLineupStorage): void {
+    const err = this.failing.get(method);
+    if (err) throw err;
+  }
+
+  kept(): Promise<KeptRocketList> {
+    this.fail('kept');
+    const active = [...this.rows.values()]
+      .filter((row) => row.active)
+      .sort((a, b) => a.position - b.position || a.choice.key.localeCompare(b.choice.key));
+    const readAt = active.length === 0 ? undefined : Math.max(...active.map((row) => row.lastSeen));
+    return Promise.resolve({ choices: active.map((row) => structuredClone(row.choice)), readAt });
+  }
+
+  replace(choices: readonly RocketChoice[], at: number): Promise<void> {
+    this.fail('replace');
+    for (const row of this.rows.values()) row.active = false;
+    for (const [position, choice] of choices.entries()) {
+      const firstSeen = this.rows.get(choice.key)?.firstSeen ?? at;
+      this.rows.set(choice.key, {
+        choice: structuredClone(choice),
+        firstSeen,
+        lastSeen: at,
+        active: true,
+        position,
+      });
+    }
+    return Promise.resolve();
+  }
+}
diff --git a/test/support/rocket.ts b/test/support/rocket.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1019767ffdb9877f96c2b4d42f3192cd74e01d23
--- /dev/null
+++ b/test/support/rocket.ts
@@ -0,0 +1,30 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { parseRocketLineups, type RocketChoice } from '../../src/domain/rocket/lineups.js';
+import { catalogueFixture } from './game-data.js';
+
+const fixtures = path.resolve(import.meta.dirname, '../fixtures');
+
+/**
+ * ScrapedDuck's `rocketLineups.min.json` as it was on 2026-10-22 at 04:11, unchanged: 26
+ * lineups (Giovanni, Cliff, Arlo, Sierra, 18 typed grunts with water twice, the untyped male and
+ * female grunts, the decoy female grunt).
+ */
+export function readRocketFeed(): unknown {
+  return JSON.parse(readFileSync(path.join(fixtures, 'rocket-lineups.json'), 'utf8'));
+}
+
+let parsed: readonly RocketChoice[] | undefined;
+
+/** The choices of the feed of 2026-10-22, read once and shared (read-only). */
+export function rocketChoicesOfFeed(): readonly RocketChoice[] {
+  parsed ??= Object.freeze(parseRocketLineups(readRocketFeed(), catalogueFixture()).choices);
+  return parsed;
+}
+
+/** A choice of the feed of 2026-10-22 by its key; throws for one it does not have. */
+export function feedChoice(key: string): RocketChoice {
+  const found = rocketChoicesOfFeed().find((choice) => choice.key === key);
+  if (!found) throw new Error(`the feed has no choice "${key}"`);
+  return found;
+}
````

### Task 2: 8R-2 task 2: the Rocket lineups read from ScrapedDuck, settings.rocket

Prototype commit: `2b183cf33ebf08226fcd14f3fe48dce1d745f094`

settings.rocket (always on, a default for every key: ScrapedDuck's
rocketLineups.min.json, read every 6 hours, out of date after 24 (at least
two refreshes), a grunt's message for 30 minutes, and /rocket's throttle of
10 in 30 minutes in a window of its own).

RocketLineupService reads the feed with Pine's User-Agent and a byte cap
(readLimitedJson), keeps the last good list in RocketLineup and takes it at
start without the network, reads when the list is older than the refresh
and every refresh after, keeps its list when a read lists fewer than half
the choices (a warning; taken on a second read that agrees, or once the list
is out of date) or fails, never empties it (a feed of no lineup is a failed
read), and says once in the log that the list is out of date: the guard of
the research task list. ctx.rocketLineups; the test context has the feed's
choices (rocketLineupsFixture).

**Files:**

```
 src/app-context.ts                         |   3 +
 src/app.ts                                 |  23 +++++++
 src/config/settings.test.ts                |  24 +++++++
 src/config/settings.ts                     |  36 +++++++++++
 src/services/rocket-lineup-service.test.ts | 171 ++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/rocket-lineup-service.ts      | 244 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/rocket.ts                     |  17 +++++
 test/support/test-context.ts               |   3 +
 8 files changed, 521 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/config/settings.test.ts src/services/rocket-lineup-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 2b183cf33ebf08226fcd14f3fe48dce1d745f094 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-2 task 2: the Rocket lineups read from ScrapedDuck, settings.rocket`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index 26d2e79875eac7098f724d8543827325870104cb..c86f119464a18a1b5e0a82b66b5ccce0dec96116 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -24,6 +24,7 @@ import type { IssueGateway } from './services/issue-gateway.js';
 import type { PartyService } from './services/party-service.js';
 import type { PineStopService } from './services/pine-stops.js';
 import type { ResearchTaskProvider } from './services/research-task-service.js';
+import type { RocketLineupProvider } from './services/rocket-lineup-service.js';
 import type { StopReportService } from './services/stop-reports.js';
 import type { PlaceFinder } from './services/place-finder.js';
 import type { PlaceSearch } from './services/place-search.js';
@@ -83,6 +84,8 @@ export interface AppContext {
   readonly raidEvents: RaidEventProvider & MaxEventProvider & ResearchEventProvider;
   /** The field research task list read from Leek Duck (plan 8R-1). */
   readonly researchTasks: ResearchTaskProvider;
+  /** Team GO Rocket's lineups read from ScrapedDuck: `/rocket`'s choices (plan 8R-2). */
+  readonly rocketLineups: RocketLineupProvider;
   /** Reports at stops (plan 8R-1): field research, in research periods. */
   readonly stopReports: StopReportService;
   /** The gyms, and finding them by what members type. */
diff --git a/src/app.ts b/src/app.ts
index e94e9b488e4f856201a8bec2f219337b6a18f4ff..cd24f4611fe5519e74712ad606aa83f0b37abb3b 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -75,6 +75,8 @@ import { PlaceFinder } from './services/place-finder.js';
 import { PineStopService } from './services/pine-stops.js';
 import { ResearchTaskService } from './services/research-task-service.js';
 import { ResearchTaskRepository } from './db/repositories/research-task-repository.js';
+import { RocketLineupService } from './services/rocket-lineup-service.js';
+import { RocketLineupRepository } from './db/repositories/rocket-lineup-repository.js';
 import { ResearchEventRepository } from './db/repositories/research-event-repository.js';
 import { StopReportRepository } from './db/repositories/stop-report-repository.js';
 import { StopReportService } from './services/stop-reports.js';
@@ -265,6 +267,16 @@ export async function startApp(
     fetch: (url, init) => fetch(url, init),
     log,
   });
+  // Team GO Rocket's lineups (plan 8R-2): ScrapedDuck's feed, the last good list kept.
+  const rocketLineups = new RocketLineupService({
+    url: config.settings.rocket.url,
+    refreshMs: config.settings.rocket.refreshHours * HOUR_MS,
+    staleAfterMs: config.settings.rocket.staleAfterHours * HOUR_MS,
+    store: new RocketLineupRepository(db, log),
+    gameData,
+    fetch: (url, init) => fetch(url, init),
+    log,
+  });
   // Reports at stops (plan 8R-1), each in the research period of the stored events.
   const stopReports = new StopReportService({
     store: new StopReportRepository(db, log),
@@ -732,6 +744,7 @@ export async function startApp(
     await raidBosses.load();
     await maxBosses.load();
     await researchTasks.load();
+    await rocketLineups.load();
     await raidEvents.loadResearch();
     await gyms.load();
     // The gyms that waited for Google before a restart, and those that lack what it gives.
@@ -772,6 +785,7 @@ export async function startApp(
     maxBossAdmin: maxBosses,
     raidEvents,
     researchTasks,
+    rocketLineups,
     stopReports,
     gyms,
     gymAdmin,
@@ -938,6 +952,7 @@ export async function startApp(
   maxBosses.startAutoSync();
   raidEvents.start();
   researchTasks.start();
+  rocketLineups.start();
   // The clock waits for Discord, however long that takes: a post that cannot be asked for yet
   // would be taken for deleted. Then for the first read of the raid events (a raid that hatched
   // during a Raid Hour is otherwise given the usual length), but for that not for ever.
@@ -1150,6 +1165,14 @@ export async function startApp(
           await researchTasks.whenIdle();
         },
       },
+      {
+        name: 'Rocket lineups',
+        timeoutMs: 1_000,
+        run: async () => {
+          rocketLineups.stop();
+          await rocketLineups.whenIdle();
+        },
+      },
       // Answers, lines and edits that are still waiting go out while Discord is connected.
       { name: 'click answers', timeoutMs: 3_000, run: () => clickAnswers.flush() },
       { name: 'start times', timeoutMs: 5_000, run: () => timedParties.flush() },
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index a3b680b37551f4f4dfa08fc124e1e182db5da054..3fa0ee94f293619064e3d5bbffb692a4ffb0d14c 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -499,6 +499,30 @@ describe('loadSettings', () => {
     expect(loadSettings(empty).maxBattles).toEqual(defaults);
   });
 
+  it('has Team GO Rocket on without a rocket block, with every default (plan 8R-2)', () => {
+    const defaults = {
+      url: 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.min.json',
+      refreshHours: 6,
+      staleAfterHours: 24,
+      gruntMinutes: 30,
+      throttle: { uses: 10, minutes: 30 },
+    };
+    expect(loadSettings(REPO_SETTINGS).rocket).toEqual(defaults);
+    expect(loadSettings('test/fixtures/settings.json').rocket).toEqual(defaults);
+    const partly = writeSettings((s) => {
+      s.rocket = { gruntMinutes: 25, throttle: { minutes: 15 } };
+    });
+    expect(loadSettings(partly).rocket).toEqual({
+      ...defaults,
+      gruntMinutes: 25,
+      throttle: { uses: 10, minutes: 15 },
+    });
+    const tooSoon = writeSettings((s) => {
+      s.rocket = { refreshHours: 12, staleAfterHours: 20 };
+    });
+    expect(() => loadSettings(tooSoon)).toThrow(/staleAfterHours/);
+  });
+
   it('has field research on without a research block, with every default (plan 8R-1)', () => {
     const defaults = {
       url: 'https://leekduck.com/research/',
diff --git a/src/config/settings.ts b/src/config/settings.ts
index e8e4ed2196a51964c2c9c0e6735c02f37992b995..50d481ea7b1028f38c470657276a893c8501241e 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -13,6 +13,9 @@ const lobby = z.number().int().min(MIN_LOBBY).max(MAX_LOBBY);
 export const MAX_BOSS_FEED_URL = 'https://fight.pokebattler.com/raids';
 /** Leek Duck's research page, the task list (`settings.research.url` unless set). */
 export const RESEARCH_URL = 'https://leekduck.com/research/';
+/** ScrapedDuck's Rocket lineups, `/rocket`'s choices (`settings.rocket.url` unless set). */
+export const ROCKET_LINEUPS_URL =
+  'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.min.json';
 /** A time of day, `HH:MM` on a 24-hour clock (`7:30` is `07:30`). */
 const clockTime = z
   .string()
@@ -459,6 +462,39 @@ export const settingsSchema = z.strictObject({
       staleAfterHours: 6,
       throttle: { uses: 10, minutes: 30 },
     })),
+  /**
+   * Team GO Rocket (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5). Always on, as field
+   * research is: every key has a default. `url` is ScrapedDuck's Rocket lineups
+   * (`ROCKET_LINEUPS_URL`), read every `refreshHours` (6 unless set); a list not read anew for
+   * `staleAfterHours` (24 unless set, at least two refreshes) is out of date, which the log says.
+   * A grunt's message stands `gruntMinutes` (30 unless set). `throttle` is how many reports a
+   * member may make in how many minutes (10 in 30 unless set), in a window of its own (design
+   * 9.12: `/research`'s numbers, not its window).
+   */
+  rocket: z
+    .strictObject({
+      url: z.url({ protocol: /^https?$/ }).default(ROCKET_LINEUPS_URL),
+      refreshHours: z.number().int().min(1).max(48).default(6),
+      staleAfterHours: z.number().int().min(1).max(336).default(24),
+      gruntMinutes: z.number().int().min(5).max(120).default(30),
+      throttle: z
+        .strictObject({
+          uses: z.number().int().min(1).max(100).default(10),
+          minutes: z.number().int().min(1).max(1440).default(30),
+        })
+        .default(() => ({ uses: 10, minutes: 30 })),
+    })
+    .refine((rocket) => rocket.staleAfterHours >= 2 * rocket.refreshHours, {
+      error: 'staleAfterHours must cover at least two refreshes',
+      path: ['staleAfterHours'],
+    })
+    .default(() => ({
+      url: ROCKET_LINEUPS_URL,
+      refreshHours: 6,
+      staleAfterHours: 24,
+      gruntMinutes: 30,
+      throttle: { uses: 10, minutes: 30 },
+    })),
 });
 
 export type Settings = z.output<typeof settingsSchema>;
diff --git a/src/services/rocket-lineup-service.test.ts b/src/services/rocket-lineup-service.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2fc36b4c937d4fe9ebf2459449be978dc31fe7d0
--- /dev/null
+++ b/src/services/rocket-lineup-service.test.ts
@@ -0,0 +1,171 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { catalogueFixture } from '../../test/support/game-data.js';
+import { readRocketFeed } from '../../test/support/rocket.js';
+import { listedChoice } from '../../test/support/rocket-store-cases.js';
+import { MemoryRocketLineups } from '../../test/support/rocket-store.js';
+import { jsonResponse } from '../../test/support/responses.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { PINE_USER_AGENT, type FetchPage } from './research-task-service.js';
+import { MAX_ROCKET_FEED_BYTES, RocketLineupService } from './rocket-lineup-service.js';
+
+const URL = 'https://scrapedduck.example.test/rocketLineups.min.json';
+const HOUR = 3_600_000;
+const NOW = Date.UTC(2026, 9, 22, 8);
+
+/** A service over the kept list in memory, reading what `answer` gives, at `clock.now`. */
+function serviceWith(answer: () => ReturnType<FetchPage>, store = new MemoryRocketLineups()) {
+  const { log, entries } = createTestLogger();
+  const clock = { now: NOW };
+  const asked: { url: string; headers: Record<string, string> }[] = [];
+  const service = new RocketLineupService({
+    url: URL,
+    refreshMs: 6 * HOUR,
+    staleAfterMs: 24 * HOUR,
+    store,
+    gameData: { catalogue: catalogueFixture() },
+    fetch: (url, init) => {
+      asked.push({ url, headers: init.headers });
+      return answer();
+    },
+    log,
+    now: () => clock.now,
+  });
+  const said = (msg: string) => entries.filter((entry) => entry.msg === msg).length;
+  return { service, store, clock, asked, said };
+}
+
+const feed = (body: unknown = readRocketFeed(), options: { status?: number; raw?: string } = {}) =>
+  Promise.resolve({ ...jsonResponse(body, options), ok: (options.status ?? 200) < 300 });
+
+/** The feed with only its first `n` lineups (Giovanni, Cliff, Arlo, …). */
+const firstOf = (n: number): unknown => (readRocketFeed() as unknown[]).slice(0, n);
+
+describe('RocketLineupService', () => {
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('reads the feed with Pine’s User-Agent and keeps the list in the database', async () => {
+    const { service, store, asked } = serviceWith(() => feed());
+    expect(service.choices()).toEqual([]);
+    expect(await service.refresh()).toEqual({ status: 'updated', choices: 24 });
+    expect(asked).toEqual([
+      { url: URL, headers: { Accept: 'application/json', 'User-Agent': PINE_USER_AGENT } },
+    ]);
+    expect(service.readAt()).toBe(NOW);
+    expect(service.byKey('grunt:water')?.name).toBe('Water-type grunt');
+    expect(service.byKey('grunt:shadow')).toBeUndefined();
+    expect((await store.kept()).choices).toHaveLength(24);
+  });
+
+  it('starts with the list of the last run, without the network', async () => {
+    const store = new MemoryRocketLineups();
+    await store.replace([listedChoice('leader:arlo')], NOW - HOUR);
+    const { service } = serviceWith(() => Promise.reject(new Error('no network')), store);
+    await service.load();
+    expect(service.choices().map((choice) => choice.name)).toEqual(['Arlo']);
+    expect(service.readAt()).toBe(NOW - HOUR);
+  });
+
+  it('keeps its list when the feed lists fewer than half the choices, and says so', async () => {
+    let body: unknown = readRocketFeed();
+    const { service, clock, said } = serviceWith(() => feed(body));
+    await service.refresh();
+    body = firstOf(4);
+    clock.now += HOUR;
+    expect(await service.refresh()).toEqual({ status: 'kept', choices: 24, read: 4 });
+    expect(service.choices()).toHaveLength(24);
+    expect(
+      said('the Rocket lineups list fewer than half the choices they did; the list is kept'),
+    ).toBe(1);
+  });
+
+  it('takes a smaller list when the next read lists the same choices', async () => {
+    let body: unknown = readRocketFeed();
+    const { service, clock } = serviceWith(() => feed(body));
+    await service.refresh();
+    body = firstOf(4);
+    clock.now += 6 * HOUR;
+    expect(await service.refresh()).toMatchObject({ status: 'kept' });
+    // Another small list is no agreement: it waits for one more read.
+    body = firstOf(3);
+    clock.now += 6 * HOUR;
+    expect(await service.refresh()).toMatchObject({ status: 'kept' });
+    clock.now += 6 * HOUR;
+    expect(await service.refresh()).toEqual({ status: 'updated', choices: 3 });
+    expect(service.choices().map((choice) => choice.name)).toEqual(['Cliff', 'Arlo', 'Giovanni']);
+  });
+
+  it('takes a smaller list once the list in use is older than staleAfterHours', async () => {
+    let body: unknown = readRocketFeed();
+    const { service, clock, said } = serviceWith(() => feed(body));
+    await service.refresh();
+    body = firstOf(4);
+    clock.now += 24 * HOUR;
+    expect(await service.refresh()).toEqual({ status: 'updated', choices: 4 });
+    expect(said('the Rocket lineups are out of date')).toBe(0);
+  });
+
+  it('never empties its list: a refusal, no lineup, not JSON, too large', async () => {
+    let answer: () => ReturnType<FetchPage> = () => feed();
+    const { service, clock } = serviceWith(() => answer());
+    await service.refresh();
+    answer = () => feed(null, { status: 503 });
+    expect(await service.refresh()).toMatchObject({
+      status: 'failed',
+      reason: `${URL} answered 503`,
+    });
+    answer = () => feed([]);
+    clock.now += 48 * HOUR;
+    expect(await service.refresh()).toMatchObject({ status: 'failed' });
+    expect(await service.refresh()).toMatchObject({ status: 'failed' });
+    answer = () => feed(null, { raw: '<html>Maintenance</html>' });
+    expect(await service.refresh()).toMatchObject({
+      status: 'failed',
+      reason: `${URL}: the feed is unreadable`,
+    });
+    answer = () => feed(null, { raw: 'x'.repeat(MAX_ROCKET_FEED_BYTES + 1) });
+    expect(await service.refresh()).toMatchObject({
+      status: 'failed',
+      reason: `${URL}: the feed is too-large`,
+    });
+    expect(service.choices()).toHaveLength(24);
+  });
+
+  it('says once that the list is out of date, until a read succeeds again', async () => {
+    let fails = false;
+    const { service, clock, said } = serviceWith(() =>
+      fails ? Promise.reject(new Error('down')) : feed(),
+    );
+    await service.refresh();
+    fails = true;
+    clock.now += 23 * HOUR;
+    await service.refresh();
+    expect(said('the Rocket lineups are out of date')).toBe(0);
+    clock.now += 2 * HOUR;
+    await service.refresh();
+    await service.refresh();
+    expect(said('the Rocket lineups are out of date')).toBe(1);
+    fails = false;
+    await service.refresh();
+    expect(said('Rocket lineups read')).toBe(2);
+  });
+
+  it('reads at start only when its list is older than the refresh, then every refresh', async () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    const store = new MemoryRocketLineups();
+    await store.replace([listedChoice('leader:arlo')], NOW - 5 * HOUR);
+    const { service, asked } = serviceWith(() => feed(), store);
+    await service.load();
+    service.start();
+    await vi.advanceTimersByTimeAsync(HOUR / 2);
+    expect(asked).toHaveLength(0);
+    await vi.advanceTimersByTimeAsync(HOUR / 2);
+    await service.whenIdle();
+    expect(asked).toHaveLength(1);
+    await vi.advanceTimersByTimeAsync(6 * HOUR);
+    await service.whenIdle();
+    expect(asked).toHaveLength(2);
+    service.stop();
+  });
+});
diff --git a/src/services/rocket-lineup-service.ts b/src/services/rocket-lineup-service.ts
new file mode 100644
index 0000000000000000000000000000000000000000..41de407867d8a60866fa530241e2ef43fe1032dc
--- /dev/null
+++ b/src/services/rocket-lineup-service.ts
@@ -0,0 +1,244 @@
+import type { RocketLineupStorage } from '../db/repositories/rocket-lineup-repository.js';
+import { parseRocketLineups, type RocketChoice } from '../domain/rocket/lineups.js';
+import type { Logger } from '../log.js';
+import { failureReason } from './failure-reason.js';
+import type { GameDataProvider } from './game-data-service.js';
+import { readLimitedJson } from './limited-json.js';
+import { PINE_USER_AGENT, type FetchPage } from './research-task-service.js';
+
+/** The feed was 38 KB on 2026-10-22; anything much larger is not the feed. */
+export const MAX_ROCKET_FEED_BYTES = 1024 * 1024;
+
+const MINUTE_MS = 60_000;
+/** The longest delay `setTimeout` accepts. */
+const MAX_TIMER_MS = 2 ** 31 - 1;
+
+export interface RocketLineupOptions {
+  /** ScrapedDuck's Rocket lineups (`settings.rocket.url`). */
+  url: string;
+  refreshMs: number;
+  /** A list not read anew for this long is out of date (logged once). */
+  staleAfterMs: number;
+  store: RocketLineupStorage;
+  gameData: GameDataProvider;
+  fetch: FetchPage;
+  log: Logger;
+  /** How long one download may take. Default 30 seconds. */
+  timeoutMs?: number;
+  /** How long to wait after a failed attempt. Default 15 minutes, at most `refreshMs`. */
+  retryMs?: number;
+  now?: () => number;
+}
+
+/** What handlers need: `/rocket`'s choices of now. */
+export interface RocketLineupProvider {
+  /** The choices of the last good read, in their order; empty while none was ever read. */
+  choices(): readonly RocketChoice[];
+  /** A choice by its key (`grunt:water`), if the list has it. */
+  byKey(key: string): RocketChoice | undefined;
+  /** When the list in use was read, epoch milliseconds; undefined while none was. */
+  readAt(): number | undefined;
+}
+
+export type RocketRefresh =
+  | { status: 'updated'; choices: number }
+  /** The feed could not be read, or was not the feed: the list in use is unchanged. */
+  | { status: 'failed'; reason: string }
+  /** The feed listed fewer than half the choices of the list in use: kept. */
+  | { status: 'kept'; choices: number; read: number };
+
+/** Thrown inside a download that `stop` ended; not worth a warning. */
+class RefreshStopped extends Error {}
+
+/**
+ * Team GO Rocket's lineups (plan 8R-2; design 5.1): ScrapedDuck's feed, read every `refreshMs`
+ * with Pine's User-Agent and a byte cap, the last good list kept in the database
+ * (`RocketLineupStorage`) so that a start without the network still offers it, as the research
+ * task list is kept (`ResearchTaskService`, whose guard this repeats): a read that lists fewer
+ * than half the choices of the list in use is a warning and the list stays, unless the read
+ * before it listed the very same choices or the list in use is older than `staleAfterMs`; a feed
+ * of no lineup at all is a failed read (`parseRocketLineups` throws), so it never empties the
+ * list; a list not read anew for `staleAfterMs` is said once in the log.
+ */
+export class RocketLineupService implements RocketLineupProvider {
+  private current: readonly RocketChoice[] = [];
+  private keyed = new Map<string, RocketChoice>();
+  private read: number | undefined;
+  private readonly timeoutMs: number;
+  private readonly retryMs: number;
+  private readonly now: () => number;
+  private controller: AbortController | undefined;
+  private inFlight: Promise<RocketRefresh> | undefined;
+  private timer: NodeJS.Timeout | undefined;
+  private stopped = true;
+  private staleTold = false;
+  /** The keys of the last read refused as much smaller (`shrinkAgreed`); a read clears it. */
+  private shrink: string | undefined;
+
+  constructor(private readonly options: RocketLineupOptions) {
+    this.timeoutMs = options.timeoutMs ?? 30_000;
+    this.retryMs = Math.min(options.retryMs ?? 15 * MINUTE_MS, options.refreshMs);
+    this.now = options.now ?? (() => Date.now());
+  }
+
+  choices(): readonly RocketChoice[] {
+    return this.current;
+  }
+
+  byKey(key: string): RocketChoice | undefined {
+    return this.keyed.get(key);
+  }
+
+  readAt(): number | undefined {
+    return this.read;
+  }
+
+  /** Takes the list kept by the last run (no network). */
+  async load(): Promise<void> {
+    const kept = await this.options.store.kept();
+    this.use(kept.choices, kept.readAt);
+    this.options.log.info({ choices: kept.choices.length }, 'Rocket lineups loaded');
+  }
+
+  private use(choices: readonly RocketChoice[], readAt: number | undefined): void {
+    this.current = choices;
+    this.keyed = new Map(choices.map((choice) => [choice.key, choice]));
+    this.read = readAt;
+  }
+
+  /** Reads the feed now. Never rejects; calls made while one runs share its result. */
+  refresh(): Promise<RocketRefresh> {
+    this.inFlight ??= this.refreshOnce().finally(() => {
+      this.inFlight = undefined;
+    });
+    return this.inFlight;
+  }
+
+  /** Resolves once no read is in flight. Never rejects. */
+  async whenIdle(): Promise<void> {
+    while (this.inFlight) await this.inFlight;
+  }
+
+  /**
+   * Reads the feed when the list in use is older than `refreshMs` (or there is none), else when
+   * it is due, and again every `refreshMs`. Calling it again changes nothing.
+   */
+  start(): void {
+    if (!this.stopped) return;
+    this.stopped = false;
+    const age = this.read === undefined ? Infinity : this.now() - this.read;
+    this.schedule(Math.max(0, this.options.refreshMs - age));
+  }
+
+  /** Cancels the scheduled read and ends one in flight. */
+  stop(): void {
+    this.stopped = true;
+    this.controller?.abort();
+    if (this.timer) clearTimeout(this.timer);
+    this.timer = undefined;
+  }
+
+  private schedule(delayMs: number): void {
+    if (this.timer) clearTimeout(this.timer);
+    this.timer = setTimeout(
+      () => {
+        this.timer = undefined;
+        void this.refresh().then((result) => {
+          if (this.stopped) return;
+          this.schedule(result.status === 'failed' ? this.retryMs : this.options.refreshMs);
+        });
+      },
+      Math.min(delayMs, MAX_TIMER_MS),
+    );
+    this.timer.unref();
+  }
+
+  private async refreshOnce(): Promise<RocketRefresh> {
+    const { log, store, gameData } = this.options;
+    let result: RocketRefresh;
+    try {
+      const parsed = parseRocketLineups(await this.download(), gameData.catalogue);
+      const before = this.current.length;
+      const shrunk = parsed.choices
+        .map((choice) => choice.key)
+        .sort()
+        .join(' ');
+      if (parsed.choices.length * 2 < before && !this.shrinkAgreed(shrunk)) {
+        this.shrink = shrunk;
+        log.warn(
+          { read: parsed.choices.length, kept: before },
+          'the Rocket lineups list fewer than half the choices they did; the list is kept',
+        );
+        result = { status: 'kept', choices: before, read: parsed.choices.length };
+      } else {
+        const at = this.now();
+        await store.replace(parsed.choices, at);
+        this.use(parsed.choices, at);
+        this.shrink = undefined;
+        this.staleTold = false;
+        if (parsed.unknown.length > 0) {
+          log.info({ pokemon: parsed.unknown }, 'Rocket catches the game data does not know');
+        }
+        if (parsed.skipped > 0) {
+          log.warn({ skipped: parsed.skipped }, 'lineups of the Rocket feed could not be read');
+        }
+        log.info({ choices: parsed.choices.length }, 'Rocket lineups read');
+        result = { status: 'updated', choices: parsed.choices.length };
+      }
+    } catch (err) {
+      if (err instanceof RefreshStopped) return { status: 'failed', reason: 'stopped' };
+      log.warn({ err }, 'could not read the Rocket lineups');
+      result = { status: 'failed', reason: err instanceof Error ? err.message : String(err) };
+    }
+    this.tellIfStale();
+    return result;
+  }
+
+  /**
+   * Whether a much smaller list is taken after all: the read before it listed the very same
+   * choices (the feed did shrink), or the list in use is out of date anyway (older than
+   * `staleAfterMs`): a real shrink is never refused for good.
+   */
+  private shrinkAgreed(shrunk: string): boolean {
+    if (this.shrink === shrunk) return true;
+    return this.read !== undefined && this.now() - this.read >= this.options.staleAfterMs;
+  }
+
+  /** Says once in the log that the list is out of date, until a read succeeds again. */
+  private tellIfStale(): void {
+    if (this.staleTold) return;
+    const read = this.read;
+    if (read !== undefined && this.now() - read < this.options.staleAfterMs) return;
+    this.staleTold = true;
+    this.options.log.warn(
+      { readAt: read === undefined ? null : new Date(read).toISOString() },
+      'the Rocket lineups are out of date',
+    );
+  }
+
+  private async download(): Promise<unknown> {
+    const { url } = this.options;
+    const timeout = AbortSignal.timeout(this.timeoutMs);
+    const controller = new AbortController();
+    this.controller = controller;
+    try {
+      const response = await this.options.fetch(url, {
+        signal: AbortSignal.any([timeout, controller.signal]),
+        headers: { Accept: 'application/json', 'User-Agent': PINE_USER_AGENT },
+      });
+      if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
+      const body = await readLimitedJson(response, MAX_ROCKET_FEED_BYTES);
+      if (!body.ok) throw new Error(`${url}: the feed is ${body.reason}`);
+      return body.value;
+    } catch (err) {
+      if (controller.signal.aborted) throw new RefreshStopped('stopped', { cause: err });
+      if (timeout.aborted) {
+        throw new Error(`${url}: timed out after ${String(this.timeoutMs)} ms`, { cause: err });
+      }
+      if (err instanceof Error && err.message.startsWith(url)) throw err;
+      throw new Error(`${url}: ${failureReason(err)}`, { cause: err });
+    } finally {
+      if (this.controller === controller) this.controller = undefined;
+    }
+  }
+}
diff --git a/test/support/rocket.ts b/test/support/rocket.ts
index 1019767ffdb9877f96c2b4d42f3192cd74e01d23..8bbf8db283ffef97d2a93b30ae7cdd5aa912a020 100644
--- a/test/support/rocket.ts
+++ b/test/support/rocket.ts
@@ -1,6 +1,7 @@
 import { readFileSync } from 'node:fs';
 import path from 'node:path';
 import { parseRocketLineups, type RocketChoice } from '../../src/domain/rocket/lineups.js';
+import type { RocketLineupProvider } from '../../src/services/rocket-lineup-service.js';
 import { catalogueFixture } from './game-data.js';
 
 const fixtures = path.resolve(import.meta.dirname, '../fixtures');
@@ -22,6 +23,22 @@ export function rocketChoicesOfFeed(): readonly RocketChoice[] {
   return parsed;
 }
 
+/**
+ * The lineups as handlers read them (`RocketLineupProvider`): the choices of the feed of
+ * 2026-10-22 unless given, read at `readAt`.
+ */
+export function rocketLineupsFixture(
+  given?: readonly RocketChoice[],
+  readAt = Date.UTC(2026, 9, 22, 8, 11),
+): RocketLineupProvider {
+  const choices = (): readonly RocketChoice[] => given ?? rocketChoicesOfFeed();
+  return {
+    choices,
+    byKey: (key) => choices().find((choice) => choice.key === key),
+    readAt: () => readAt,
+  };
+}
+
 /** A choice of the feed of 2026-10-22 by its key; throws for one it does not have. */
 export function feedChoice(key: string): RocketChoice {
   const found = rocketChoicesOfFeed().find((choice) => choice.key === key);
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index cb090f11cd4d875226f0f710ef80e57a06883eed..6b5a953233ff38beda1d71204d85e9b00c31793c 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -41,6 +41,7 @@ import type { MaxChangeService } from '../../src/services/max-change-service.js'
 import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
 import { researchTasksFixture } from './research.js';
+import { rocketLineupsFixture } from './rocket.js';
 import { selfRolesWith } from './roles.js';
 import { createTestLogger } from './test-logger.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
@@ -111,6 +112,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     raidEvents: raidEventsFixture(),
     // The task list of Leek Duck's page of 2026-10-21; a test passes its own to change it.
     researchTasks: researchTasksFixture(),
+    // The Rocket lineups of ScrapedDuck's feed of 2026-10-22; a test passes its own to change them.
+    rocketLineups: rocketLineupsFixture(),
     // Over memory and the context's own research events (below), unless a test passes its own.
     stopReports: undefined as unknown as StopReportService,
     gyms: gymsFixture(),
````

### Task 3: 8R-2 task 3: Rocket reports at stops, one per stop and day

Prototype commit: `bb3b4b4c2bbc44cd2969e9fdc05ca08aa06a2ff2`

A Rocket report is a StopReport row of the kind rocket in the day's period
(day:<date>): the grunt and the hideout of a stop share the one row of the
unique (server, stop, kind, period), so which of them stands is decided
with that row locked in one transaction. StopReport is now a union of
ResearchReport and RocketReport (who by name and the catches as the lineups
had them, its rocketKey the subject); the repository reads and writes the
kind's own detail.

decideRocket (pure): nothing standing or ended, reported; a hideout
replaces whatever stands; the same grunt standing is reported already
(Matt's answer 4), another grunt replaces it; a grunt where a hideout
stands asks first, unless the member said Replace to that very hideout.
StopReportStorage.saveUnless asks it inside the transaction (save is
saveUnless that never keeps); two first reports of a grunt at once make one.

StopReportService.reportRocket: a grunt stands gruntMs
(settings.rocket.gruntMinutes), a hideout until local midnight (rocketDay);
what it replaced while it stood is told as ended, a hideout made or
replaced draws the posts, the same hideout again is no news. takeBack
tells what it removed as ended. at() is research only, rocketAt() the
stop's Rocket report; the research post, /research and its answer read
research reports only.

**Files:**

```
 src/app.ts                                            |   2 +
 src/commands/research/research.test.ts                |  14 ++--
 src/commands/research/research.ts                     |  15 +++--
 src/db/repositories/stop-report-repository.db.test.ts |  17 +++++
 src/db/repositories/stop-report-repository.ts         | 108 +++++++++++++++++++++++-------
 src/domain/rocket/reports.test.ts                     |  59 +++++++++++++++++
 src/domain/rocket/reports.ts                          |  61 +++++++++++++++++
 src/domain/stops/report.ts                            |  67 +++++++++++++++----
 src/render/research.ts                                |  17 ++++-
 src/services/stop-posts.ts                            |  14 ++--
 src/services/stop-reports.test.ts                     | 169 ++++++++++++++++++++++++++++++++++++++++++++++-
 src/services/stop-reports.ts                          | 206 +++++++++++++++++++++++++++++++++++++++++++++++++---------
 test/support/stop-report-cases.ts                     | 112 ++++++++++++++++++++++++++++++-
 test/support/stop-reports.ts                          |  40 +++++++++---
 14 files changed, 805 insertions(+), 96 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/research/research.test.ts src/domain/rocket/reports.test.ts src/services/stop-reports.test.ts`); all pass. Its database test files (`src/db/repositories/stop-report-repository.db.test.ts`) run with the database suite at the tip.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff bb3b4b4c2bbc44cd2969e9fdc05ca08aa06a2ff2 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-2 task 3: Rocket reports at stops, one per stop and day`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index cd24f4611fe5519e74712ad606aa83f0b37abb3b..04124853ccbf4d8b1abb8f96281fe478959a2761 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -282,6 +282,8 @@ export async function startApp(
     store: new StopReportRepository(db, log),
     events: raidEvents,
     zone: config.settings.timezone,
+    // A grunt's report (plan 8R-2) stands as long as its message.
+    gruntMs: config.settings.rocket.gruntMinutes * 60_000,
     log,
   });
   const gymRepository = new GymRepository(db);
diff --git a/src/commands/research/research.test.ts b/src/commands/research/research.test.ts
index efcfb7d9302e78b929706e0a644f2b7cd031ad53..1956bd253c4746509de4b1a049c2025c2087b4b4 100644
--- a/src/commands/research/research.test.ts
+++ b/src/commands/research/research.test.ts
@@ -174,11 +174,15 @@ describe('/research report', () => {
       }),
     );
     expect(said(answer)).toContain('**Win 3 raids in the rain http:\u200B//x.test** · Rare Candy');
-    expect([...made.store.rows.values()][0]?.research).toEqual({
-      text: 'Win 3 raids in the rain http://x.test',
-      category: null,
-      rewards: [{ kind: 'item', item: 'rare-candy', name: 'Rare Candy', quantity: 0, image: null }],
-      typed: true,
+    expect([...made.store.rows.values()][0]).toMatchObject({
+      research: {
+        text: 'Win 3 raids in the rain http://x.test',
+        category: null,
+        rewards: [
+          { kind: 'item', item: 'rare-candy', name: 'Rare Candy', quantity: 0, image: null },
+        ],
+        typed: true,
+      },
     });
   });
 
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index 1da7c7131e9e33186608a9c9bc4dccf97122e6b7..3a4778a89b8a59c1f8df95341119abf50a1195a6 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -21,9 +21,9 @@ import {
   RESEARCH_ACTIONS,
   RESEARCH_COLOUR,
   RESEARCH_KIND,
+  reportSubject,
   researchAnswer,
   stopLine,
-  taskText,
   periodEndWords,
   type MoreStop,
 } from '../../render/research.js';
@@ -116,7 +116,12 @@ async function moreStops(
   );
   const reported = new Set(
     (await ctx.stopReports.standing(guildIdOf(interaction)))
-      .filter((report) => report.periodKey === periodKey && report.subjectKey === subjectKey)
+      .filter(
+        (report) =>
+          report.kind === 'research' &&
+          report.periodKey === periodKey &&
+          report.subjectKey === subjectKey,
+      )
       .map((report) => report.stop.key),
   );
   return ctx.wayspots
@@ -294,7 +299,7 @@ const removeResearch: SubcommandPart = {
     const [gone] = removed;
     if (!gone) throw new UserError(notYours.length > 0 ? NOT_YOUR_REPORT : REPORT_CHANGED);
     await answer(interaction, {
-      content: `Took back **${taskText(gone.research)}** at ${stopLine(gone.stop)}.`,
+      content: `Took back **${reportSubject(gone)}** at ${stopLine(gone.stop)}.`,
     });
   },
   autocomplete: async (interaction, ctx) => {
@@ -369,7 +374,7 @@ export const researchControls: ComponentHandler = {
     const serverId = guildIdOf(interaction);
     const base: StopReport | undefined = await ctx.stopReports.get(serverId, Number(id.id));
     // Nothing reported: the use counted in `/research report`'s window is given back (B11).
-    if (!base || base.periodKey !== ctx.stopReports.period().key) {
+    if (base?.kind !== 'research' || base.periodKey !== ctx.stopReports.period().key) {
       throw new UserError(REPORT_ENDED, { givesBack: true });
     }
     const stops = await pickedStops(interaction, ctx, interaction.values);
@@ -402,7 +407,7 @@ export const researchControls: ComponentHandler = {
         first === undefined
           ? 'There was nothing left to take back: the report has ended, was taken back, or was ' +
             'replaced by a newer one.'
-          : `Took back **${taskText(first.research)}** at ` +
+          : `Took back **${reportSubject(first)}** at ` +
             `${removed.map((report) => stopLine(report.stop)).join(', ')}.`,
       ]),
     );
diff --git a/src/db/repositories/stop-report-repository.db.test.ts b/src/db/repositories/stop-report-repository.db.test.ts
index b8c3bbabecd428c6bd638fc9a461da5b82a6fcc8..17751cd782ea4243dff7f104ad283c4da0fe9027 100644
--- a/src/db/repositories/stop-report-repository.db.test.ts
+++ b/src/db/repositories/stop-report-repository.db.test.ts
@@ -6,6 +6,7 @@ import {
   REPORT_SERVER,
   reportedStop,
   researchReport,
+  rocketReport,
   stopReportCases,
 } from '../../../test/support/stop-report-cases.js';
 import { createTestLogger } from '../../../test/support/test-logger.js';
@@ -41,6 +42,22 @@ describe('StopReportRepository', () => {
     expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([later[0]?.report]);
   });
 
+  it('decides two first reports of the same grunt at once as one, the other kept out (8R-2)', async () => {
+    const store = await fresh();
+    const keepsSame = (standing: { subjectKey: string }) => standing.subjectKey === 'grunt:water';
+    const [one, two] = await Promise.all([
+      store.saveUnless(rocketReport(), keepsSame),
+      store.saveUnless(
+        rocketReport({ reporter: { id: '200000000000000033', name: 'Gary' } }),
+        keepsSame,
+      ),
+    ]);
+    expect([one, two].filter(({ saved }) => saved)).toHaveLength(1);
+    const kept = [one, two].find(({ saved }) => !saved);
+    expect(kept).toMatchObject({ saved: false, standing: { subjectKey: 'grunt:water' } });
+    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toHaveLength(1);
+  });
+
   it('keeps the period of an event whose id is as long as the feed allows (review A7)', async () => {
     const store = await fresh();
     const periodKey = `event:${'e'.repeat(200)}:2026-11-21`;
diff --git a/src/db/repositories/stop-report-repository.ts b/src/db/repositories/stop-report-repository.ts
index afbbdc520af39eaee63e884227df4e3dded2965f..c52859aab09bcd04b0d6bd51f9d16de4e7e5e751 100644
--- a/src/db/repositories/stop-report-repository.ts
+++ b/src/db/repositories/stop-report-repository.ts
@@ -1,15 +1,11 @@
 import type { Kysely, Selectable } from 'kysely';
 import { z } from 'zod';
-import type {
-  NewStopReport,
-  ResearchDetail,
-  StopReport,
-  StopReportKind,
-} from '../../domain/stops/report.js';
+import type { NewStopReport, StopReport, StopReportKind } from '../../domain/stops/report.js';
 import type { Logger } from '../../log.js';
 import { isDuplicateEntry } from '../errors.js';
 import { inTransaction, retryOnDeadlock } from '../transaction.js';
 import type { DB, StopReport as StopReportRow } from '../types.js';
+import { catchesDocument } from './rocket-lineup-repository.js';
 
 /** What came of saving a report: it, and the report it took the place of, if any. */
 export interface SavedStopReport {
@@ -17,6 +13,13 @@ export interface SavedStopReport {
   replaced: StopReport | undefined;
 }
 
+/**
+ * What came of a save that may keep the report standing in its place (`saveUnless`): saved, as
+ * `save` saves; or not, the report standing there kept as it is.
+ */
+export type SaveOutcome =
+  ({ saved: true } & SavedStopReport) | { saved: false; standing: StopReport };
+
 /**
  * The reports at stops (plan 8R-1; table `StopReport` of migration 027); lets tests keep them in
  * memory (`MemoryStopReports`, `test/support/stop-reports.ts`). Both run `stopReportCases`.
@@ -28,6 +31,20 @@ export interface StopReportStorage {
    * kept and the one it replaced.
    */
   save(report: NewStopReport): Promise<SavedStopReport>;
+  /**
+   * `save`, unless `keeps` says the report standing in its place stays (plan 8R-2: one Rocket
+   * report per stop and day, design 5.2): asked with that report, while its row is locked in the
+   * same transaction, so that the decision and the write are one. Not asked where nothing stands
+   * (or what stands cannot be read: it is replaced). With `standingAt`, a report of the same
+   * server, stop and kind that still stands at that time in another period (a grunt of yesterday
+   * past midnight) counts as standing in its place too: it is asked about (the latest), locked,
+   * and replaced with the rest (fix A2: one Rocket report per stop, also across midnight).
+   */
+  saveUnless(
+    report: NewStopReport,
+    keeps: (standing: StopReport) => boolean,
+    standingAt?: number,
+  ): Promise<SaveOutcome>;
   /** A report by its id, if it is kept. */
   byId(id: number): Promise<StopReport | undefined>;
   /** The reports of a server that have not ended at `now` (`endsAt` later), oldest first. */
@@ -77,7 +94,10 @@ const researchDocument = z.object({
   typed: z.boolean(),
 });
 
-const KINDS: ReadonlySet<string> = new Set<StopReportKind>(['research']);
+/** What a Rocket report's `detail` holds (plan 8R-2). */
+const rocketDocument = z.object({ name: z.string(), catches: catchesDocument });
+
+const KINDS: ReadonlySet<string> = new Set<StopReportKind>(['research', 'rocket']);
 
 /** A JSON column as the driver gives it: parsed already, or text. */
 function parsedJson(value: unknown): unknown {
@@ -99,19 +119,19 @@ export class StopReportRepository implements StopReportStorage {
 
   /** A row as a report; undefined (logged) for one of a kind or a detail this version cannot read. */
   private read(row: Selectable<StopReportRow>): StopReport | undefined {
-    const detail = researchDocument.safeParse(parsedJson(row.detail));
-    if (!KINDS.has(row.kind) || !detail.success) {
+    const detail = parsedJson(row.detail);
+    const research = row.kind === 'research' ? researchDocument.safeParse(detail) : undefined;
+    const rocket = row.kind === 'rocket' ? rocketDocument.safeParse(detail) : undefined;
+    if (!KINDS.has(row.kind) || !(research?.success ?? rocket?.success ?? false)) {
       this.log?.warn(
         { report: row.id, kind: row.kind },
         'a stop report cannot be read; left alone',
       );
       return undefined;
     }
-    const research: ResearchDetail = detail.data;
-    return {
+    const base = {
       id: row.id,
       serverId: row.serverId,
-      kind: 'research',
       stop: {
         key: row.stopKey,
         name: row.stopName,
@@ -123,10 +143,12 @@ export class StopReportRepository implements StopReportStorage {
       periodKey: row.periodKey,
       endsAt: Number(row.endsAt),
       subjectKey: row.subjectKey,
-      research,
       reporter: { id: row.reporterId, name: row.reporterName },
       madeAt: Number(row.madeAt),
     };
+    if (rocket?.success) return { ...base, kind: 'rocket', rocket: rocket.data };
+    if (research?.success) return { ...base, kind: 'research', research: research.data };
+    return undefined;
   }
 
   private columns(report: NewStopReport) {
@@ -142,7 +164,7 @@ export class StopReportRepository implements StopReportStorage {
       lat: report.stop.lat,
       lon: report.stop.lon,
       subjectKey: report.subjectKey,
-      detail: JSON.stringify(report.research),
+      detail: JSON.stringify(report.kind === 'research' ? report.research : report.rocket),
       reporterId: report.reporter.id,
       reporterName: report.reporter.name,
       madeAt: String(report.madeAt),
@@ -156,10 +178,24 @@ export class StopReportRepository implements StopReportStorage {
    * replacing it.
    */
   async save(report: NewStopReport): Promise<SavedStopReport> {
+    const outcome = await this.saveUnless(report, () => false);
+    if (!outcome.saved) throw new Error('a report kept what stood without being asked to');
+    return outcome;
+  }
+
+  /**
+   * As `save`; `keeps` is asked inside the transaction, with the standing row locked. Two first
+   * reports at once: the one whose insert meets the other's row runs again, and is asked then.
+   */
+  async saveUnless(
+    report: NewStopReport,
+    keeps: (standing: StopReport) => boolean,
+    standingAt?: number,
+  ): Promise<SaveOutcome> {
     for (let attempt = 1; ; attempt++) {
       try {
         return await retryOnDeadlock(this.db, () =>
-          inTransaction(this.db, (trx) => this.saveIn(trx, report), {
+          inTransaction(this.db, (trx) => this.saveIn(trx, report, keeps, standingAt), {
             isolation: 'read committed',
           }),
         );
@@ -169,29 +205,53 @@ export class StopReportRepository implements StopReportStorage {
     }
   }
 
-  private async saveIn(trx: Kysely<DB>, report: NewStopReport): Promise<SavedStopReport> {
-    const before = await trx
+  private async saveIn(
+    trx: Kysely<DB>,
+    report: NewStopReport,
+    keeps: (standing: StopReport) => boolean,
+    standingAt: number | undefined,
+  ): Promise<SaveOutcome> {
+    // The row of the report's identity, and with `standingAt` every row of the stop and kind
+    // still standing then, whatever its period: all locked, the latest standing one asked about.
+    const rows = await trx
       .selectFrom('StopReport')
       .selectAll()
       .where('serverId', '=', report.serverId)
       .where('stopKey', '=', report.stop.key)
       .where('kind', '=', report.kind)
-      .where('periodKey', '=', report.periodKey)
+      .where((eb) =>
+        standingAt === undefined
+          ? eb('periodKey', '=', report.periodKey)
+          : eb.or([eb('periodKey', '=', report.periodKey), eb('endsAt', '>', String(standingAt))]),
+      )
+      .orderBy('madeAt')
+      .orderBy('id')
       .forUpdate()
-      .executeTakeFirst();
+      .execute();
+    const live =
+      standingAt === undefined ? [] : rows.filter((row) => Number(row.endsAt) > standingAt);
+    const before = live.at(-1) ?? rows.find((row) => row.periodKey === report.periodKey);
+    const standing = before && this.read(before);
+    if (standing && keeps(standing)) return { saved: false, standing };
     // A replacement is a report of its own (review A1): the replaced row is deleted and a new one
     // made, under the same lock, so an id never changes what it is; an old answer's Take back or
     // "Same task at more stops…" finds its report gone.
-    if (before) await trx.deleteFrom('StopReport').where('id', '=', before.id).execute();
+    if (rows.length > 0) {
+      await trx
+        .deleteFrom('StopReport')
+        .where(
+          'id',
+          'in',
+          rows.map((row) => row.id),
+        )
+        .execute();
+    }
     const made = await trx
       .insertInto('StopReport')
       .values(this.columns(report))
       .executeTakeFirstOrThrow();
     const id = Number(made.insertId);
-    return {
-      report: { ...report, id },
-      replaced: before && this.read(before),
-    };
+    return { saved: true, report: { ...report, id }, replaced: standing };
   }
 
   async byId(id: number): Promise<StopReport | undefined> {
diff --git a/src/domain/rocket/reports.test.ts b/src/domain/rocket/reports.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1a0435449537b84c35726fa3419456d4663c5179
--- /dev/null
+++ b/src/domain/rocket/reports.test.ts
@@ -0,0 +1,59 @@
+import { DateTime } from 'luxon';
+import { describe, expect, it } from 'vitest';
+import { decideRocket, rocketDay } from './reports.js';
+
+const ZONE = 'America/New_York';
+const at = (local: string): number => DateTime.fromISO(local, { zone: ZONE }).toMillis();
+const NOW = at('2026-10-22T12:00');
+
+/** What stands at the stop, as far as the decision looks at it. */
+const standing = (subjectKey: string, endsAt: number, id = 7) => ({
+  id,
+  kind: 'rocket' as const,
+  subjectKey,
+  endsAt,
+});
+
+describe('decideRocket', () => {
+  it('reports at a stop with nothing standing, or only what has ended', () => {
+    expect(decideRocket(undefined, 'grunt:water', NOW)).toBe('report');
+    expect(decideRocket(standing('grunt:water', NOW), 'grunt:water', NOW)).toBe('report');
+    expect(decideRocket(standing('leader:arlo', NOW - 1), 'grunt:water', NOW)).toBe('report');
+  });
+
+  it('answers the same grunt standing as reported already, another grunt replaces it', () => {
+    expect(decideRocket(standing('grunt:water', NOW + 1), 'grunt:water', NOW)).toBe('already');
+    expect(decideRocket(standing('grunt:none', NOW + 1), 'grunt:water', NOW)).toBe('report');
+  });
+
+  it('asks before a grunt replaces a hideout, unless that very hideout was asked about', () => {
+    const arlo = standing('leader:arlo', at('2026-10-23T00:00'), 7);
+    expect(decideRocket(arlo, 'grunt:water', NOW)).toBe('asks');
+    expect(decideRocket(arlo, 'grunt:water', NOW, 7)).toBe('report');
+    // Another hideout came while the question was open: asked again.
+    expect(decideRocket(arlo, 'grunt:water', NOW, 6)).toBe('asks');
+    expect(decideRocket(standing('decoy', NOW + 1), 'grunt:none', NOW)).toBe('asks');
+  });
+
+  it('lets a hideout replace whatever stands, the same hideout too', () => {
+    for (const before of ['grunt:water', 'leader:arlo', 'giovanni', 'decoy']) {
+      expect(decideRocket(standing(before, NOW + 1), 'giovanni', NOW)).toBe('report');
+    }
+  });
+});
+
+describe('rocketDay', () => {
+  it('is the local day, ending at the next local midnight', () => {
+    expect(rocketDay(NOW, ZONE)).toEqual({
+      key: 'day:2026-10-22',
+      end: at('2026-10-23T00:00'),
+    });
+    expect(rocketDay(at('2026-10-22T23:59'), ZONE).key).toBe('day:2026-10-22');
+    expect(rocketDay(at('2026-10-23T00:00'), ZONE).key).toBe('day:2026-10-23');
+  });
+
+  it('ends at midnight on a day of a change of the clocks', () => {
+    // 2026-11-01 has 25 hours in New York.
+    expect(rocketDay(at('2026-11-01T09:00'), ZONE).end).toBe(at('2026-11-02T00:00'));
+  });
+});
diff --git a/src/domain/rocket/reports.ts b/src/domain/rocket/reports.ts
new file mode 100644
index 0000000000000000000000000000000000000000..19f24fbb9d24368a6532e62ad3e02d018314ef8b
--- /dev/null
+++ b/src/domain/rocket/reports.ts
@@ -0,0 +1,61 @@
+import { DateTime } from 'luxon';
+import { isHideout, parseRocketKey } from './lineups.js';
+
+/*
+ * Rocket reports at a stop (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.2, Matt's
+ * answer 4): one per stop and day, so that a stop has either grunts or a hideout that day. Pure:
+ * the decision is taken by the storage inside the transaction that holds the stop's row.
+ */
+
+/**
+ * What becomes of a Rocket report at a stop: `report` (made, in the place of what stood there),
+ * `already` (the same grunt stands: nothing is posted or sent), or `asks` (a grunt where a
+ * hideout stands today: the member is asked first).
+ */
+export type RocketDecision = 'report' | 'already' | 'asks';
+
+/** What the decision reads of the report standing at the stop. */
+export interface StandingRocket {
+  id: number;
+  kind: string;
+  subjectKey: string;
+  endsAt: number;
+}
+
+/**
+ * The decision on a Rocket report of `subjectKey` (a `rocketKey`) at a stop where `standing` is
+ * the stop's Rocket report that stands, of today or a grunt of yesterday past midnight (fix A2),
+ * else today's ended one, at `now` (design 5.2):
+ *
+ * - nothing standing, or what stood has ended: reported;
+ * - a hideout (a leader, Giovanni, the decoy) replaces whatever stands, the same hideout too;
+ * - a grunt where the same grunt stands is reported already (Matt's answer 4); where another
+ *   grunt stands it replaces it;
+ * - a grunt where a hideout stands is asked about first, unless `replacing` is that very report
+ *   (the member said Replace to it: a hideout reported meanwhile is asked about again).
+ */
+export function decideRocket(
+  standing: StandingRocket | undefined,
+  subjectKey: string,
+  now: number,
+  replacing?: number,
+): RocketDecision {
+  if (!standing || standing.endsAt <= now) return 'report';
+  const who = parseRocketKey(subjectKey);
+  if (!who || isHideout(who)) return 'report';
+  const there = parseRocketKey(standing.subjectKey);
+  if (there === undefined || !isHideout(there)) {
+    return standing.subjectKey === subjectKey ? 'already' : 'report';
+  }
+  return standing.id === replacing ? 'report' : 'asks';
+}
+
+/**
+ * The day a Rocket report belongs to (design 5.2: hideouts keep their stop all day; events do
+ * not change hideouts): `day:<yyyy-mm-dd>` of the local day of `time`, ending at the next local
+ * midnight (Luxon in `zone`, a day of a change of the clocks included).
+ */
+export function rocketDay(time: number, zone: string): { key: string; end: number } {
+  const local = DateTime.fromMillis(time, { zone }).startOf('day');
+  return { key: `day:${local.toISODate() ?? ''}`, end: local.plus({ days: 1 }).toMillis() };
+}
diff --git a/src/domain/stops/report.ts b/src/domain/stops/report.ts
index c4cf85d4423b2d84c0d9ea97b2cd238df3b9a2b8..8c21d651965b85a7341b5e2a6afec6b9449206ec 100644
--- a/src/domain/stops/report.ts
+++ b/src/domain/stops/report.ts
@@ -1,13 +1,14 @@
 import type { TaskReward } from '../research/task.js';
+import type { RocketCatch } from '../rocket/lineups.js';
 
 /*
  * Reports at stops (plan 8R-1; design `2026-10-21-stop-reports-design.md`, decision 1): a stop,
- * what is there and until when. Field research is the kind of this plan; Team GO Rocket's
- * hideouts (plan 8R-2) add a kind with a detail of its own.
+ * what is there and until when. Field research is the kind of plan 8R-1; Team GO Rocket (plan
+ * 8R-2) adds a kind with a detail of its own.
  */
 
-/** The kinds of report at a stop. */
-export type StopReportKind = 'research';
+/** The kinds of report at a stop: field research, and Team GO Rocket (plan 8R-2). */
+export type StopReportKind = StopReport['kind'];
 
 /**
  * A stop as a report keeps it (design 3: a snapshot, as a spawn report keeps its place): its key
@@ -42,29 +43,71 @@ export interface Reporter {
   name: string;
 }
 
-/** A report as it is kept. */
-export interface StopReport {
+/**
+ * What a Rocket report says (plan 8R-2): who it is of by name (`Water-type grunt`, `Arlo`), and
+ * the Pokémon that can be caught, as the lineups had them when it was reported. Who it is of is
+ * its `subjectKey` (`rocketKey`).
+ */
+export interface RocketDetail {
+  name: string;
+  catches: RocketCatch[];
+}
+
+/** What every report has, whatever its kind. */
+interface StopReportBase {
   id: number;
   /** Snowflake of the server: a report belongs to one (design 9.3). */
   serverId: string;
-  kind: StopReportKind;
   stop: ReportedStop;
-  /** The research period it was made in (`src/domain/time/research-periods.ts`). */
+  /**
+   * The period it was made in: of research, the research period
+   * (`src/domain/time/research-periods.ts`); of Rocket, the local day (`rocketDay`).
+   */
   periodKey: string;
-  /** When it ends, epoch milliseconds: the end of its period as known when it was made. */
+  /**
+   * When it ends, epoch milliseconds: research and hideouts with their period; a grunt
+   * `settings.rocket.gruntMinutes` after it was made.
+   */
   endsAt: number;
   /**
    * What it is of, for telling two reports of one thing apart: a task's key, a typed task's
-   * `typed:<key of its text>`.
+   * `typed:<key of its text>`; a Rocket report's `rocketKey` (`grunt:water`, `leader:arlo`).
    */
   subjectKey: string;
-  research: ResearchDetail;
   reporter: Reporter;
   madeAt: number;
 }
 
+/** Field research reported at a stop (plan 8R-1). */
+export interface ResearchReport extends StopReportBase {
+  kind: 'research';
+  research: ResearchDetail;
+}
+
+/**
+ * Team GO Rocket reported at a stop (plan 8R-2): a grunt for half an hour, or a hideout (a
+ * leader, Giovanni, the decoy) for the day. One per server, stop and day (design 5.2).
+ */
+export interface RocketReport extends StopReportBase {
+  kind: 'rocket';
+  rocket: RocketDetail;
+}
+
+/** A report as it is kept. */
+export type StopReport = ResearchReport | RocketReport;
+
 /** A report as it is made: the storage gives its id. */
-export type NewStopReport = Omit<StopReport, 'id'>;
+export type NewStopReport = Omit<ResearchReport, 'id'> | Omit<RocketReport, 'id'>;
+
+/** Whether a report is of field research. */
+export function isResearchReport(report: StopReport): report is ResearchReport {
+  return report.kind === 'research';
+}
+
+/** Whether a report is of Team GO Rocket. */
+export function isRocketReport(report: StopReport): report is RocketReport {
+  return report.kind === 'rocket';
+}
 
 /** The key of a stop of Pine's own (`/pokestop`). */
 export function pineStopKey(id: number): string {
diff --git a/src/render/research.ts b/src/render/research.ts
index b986bf036794001c7ad431cc0b6dc2648c0a708c..246d8202e10ca7f21e015c2910daf712279d4f17 100644
--- a/src/render/research.ts
+++ b/src/render/research.ts
@@ -9,7 +9,12 @@ import { DateTime } from 'luxon';
 import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
 import type { V2Message } from '../discord/party-gateway.js';
 import { rewardsInShort, type TaskReward } from '../domain/research/task.js';
-import type { ReportedStop, ResearchDetail, StopReport } from '../domain/stops/report.js';
+import type {
+  ReportedStop,
+  ResearchDetail,
+  ResearchReport,
+  StopReport,
+} from '../domain/stops/report.js';
 import { cutText } from './party-post.js';
 import {
   clockOrDay,
@@ -37,6 +42,14 @@ export function taskText(research: Pick<ResearchDetail, 'text' | 'typed'>, room
   return research.typed ? plainNoLinks(cut) : plain(cut);
 }
 
+/**
+ * What a report is of, as an answer names it: a task's text (`taskText`), or who of Team GO
+ * Rocket (plan 8R-2: `Water-type grunt`, `Arlo`).
+ */
+export function reportSubject(report: StopReport): string {
+  return report.kind === 'research' ? taskText(report.research) : plain(report.rocket.name);
+}
+
 /** What a task may give, in short: `one of Dratini, Bagon, Axew +4`, `Rare Candy ×3`. */
 export function rewardWords(rewards: readonly TaskReward[]): string {
   if (rewards.length === 0) return '';
@@ -71,7 +84,7 @@ export interface MoreStop {
 /** What the answer of a research report shows. */
 export interface ResearchAnswerView {
   /** The reports made, one per stop, in the order given; with the report each replaced. */
-  saved: readonly { report: StopReport; replaced: StopReport | undefined }[];
+  saved: readonly { report: ResearchReport; replaced: ResearchReport | undefined }[];
   /** The region channels whose pinned posts show them. */
   channels: readonly string[];
   /** When they end, as shown (`periodEndWords`). */
diff --git a/src/services/stop-posts.ts b/src/services/stop-posts.ts
index 421413a694a747179bc6afc200d0888f37f0c081..abe08513dd1608c23f3428ca5181fc8cfe97c91e 100644
--- a/src/services/stop-posts.ts
+++ b/src/services/stop-posts.ts
@@ -7,7 +7,11 @@ import {
   type OutgoingMessage,
   type PartyGateway,
 } from '../discord/party-gateway.js';
-import type { ReportedStop, StopReport } from '../domain/stops/report.js';
+import {
+  isResearchReport,
+  type ReportedStop,
+  type ResearchReport,
+} from '../domain/stops/report.js';
 import { nextPeriodChange } from '../domain/time/research-periods.js';
 import type { Logger } from '../log.js';
 import {
@@ -222,9 +226,9 @@ export class StopPostService {
     const inside = containment(region.bounds);
     const now = this.now();
     const period = this.options.reports.period(now);
-    const here = (await this.options.reports.standing(serverId)).filter((report) =>
-      inside(report.stop),
-    );
+    const here = (await this.options.reports.standing(serverId))
+      .filter(isResearchReport)
+      .filter((report) => inside(report.stop));
     const shown = here.filter((report) => report.periodKey === period.key);
     const waiting = here.filter((report) => report.periodKey === period.waiting?.key);
     return {
@@ -443,7 +447,7 @@ function payloadHash(message: OutgoingMessage): string {
 }
 
 /** Reports grouped by task: most stops first, then by the first report. */
-export function grouped(reports: readonly StopReport[]): PostTask[] {
+export function grouped(reports: readonly ResearchReport[]): PostTask[] {
   const bySubject = new Map<string, PostTask & { first: number }>();
   for (const report of reports) {
     const known = bySubject.get(report.subjectKey);
diff --git a/src/services/stop-reports.test.ts b/src/services/stop-reports.test.ts
index 5f295e24b8785acda00b8b4d77672489871b0cd3..ce4653fddd5461db4b48b7774938565a2a5d5d55 100644
--- a/src/services/stop-reports.test.ts
+++ b/src/services/stop-reports.test.ts
@@ -3,6 +3,7 @@ import { describe, expect, it } from 'vitest';
 import { PAWNIARD_DAY } from '../../test/support/research-store-cases.js';
 import {
   DRATINI,
+  MUDKIP,
   OTHER_REPORTER,
   REPORT_SERVER,
   REPORTER,
@@ -12,7 +13,12 @@ import { MemoryStopReports } from '../../test/support/stop-reports.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { taskKeyOf } from '../domain/research/task.js';
 import type { ResearchEvent } from '../domain/time/research-events.js';
-import { StopReportService, type ResearchNews, type ResearchSubject } from './stop-reports.js';
+import {
+  StopReportService,
+  type ResearchNews,
+  type ResearchSubject,
+  type RocketSubject,
+} from './stop-reports.js';
 
 const ZONE = 'America/New_York';
 const at = (local: string): number => DateTime.fromISO(local, { zone: ZONE }).toMillis();
@@ -159,6 +165,167 @@ describe('StopReportService', () => {
     ]);
   });
 
+  describe('Team GO Rocket (plan 8R-2)', () => {
+    const WATER: RocketSubject = {
+      subjectKey: 'grunt:water',
+      rocket: { name: 'Water-type grunt', catches: [MUDKIP] },
+    };
+    const NONE: RocketSubject = {
+      subjectKey: 'grunt:none',
+      rocket: { name: 'Grunt (no type)', catches: [] },
+    };
+    const ARLO: RocketSubject = {
+      subjectKey: 'leader:arlo',
+      rocket: { name: 'Arlo', catches: [] },
+    };
+    const rocket = (
+      service: StopReportService,
+      subject: RocketSubject,
+      more: { stop?: number; replacing?: number; reporter?: typeof REPORTER } = {},
+    ) =>
+      service.reportRocket({
+        serverId: REPORT_SERVER,
+        stop: reportedStop(more.stop ?? 1),
+        subject,
+        reporter: more.reporter ?? REPORTER,
+        ...(more.replacing === undefined ? {} : { replacing: more.replacing }),
+      });
+
+    function rocketServiceWith() {
+      const made = serviceWith([], at('2026-10-22T12:00'));
+      const ended: number[][] = [];
+      made.service.listen({ ended: (reports) => ended.push(reports.map((one) => one.id)) });
+      return { ...made, ended };
+    }
+
+    it('reports a grunt for gruntMinutes of the day; the same grunt again is reported already', async () => {
+      const { service, clock, changed } = rocketServiceWith();
+      const first = await rocket(service, WATER);
+      expect(first).toMatchObject({ kind: 'reported', replaced: undefined, news: true });
+      if (first.kind !== 'reported') return;
+      expect(first.report).toMatchObject({
+        kind: 'rocket',
+        periodKey: 'day:2026-10-22',
+        endsAt: at('2026-10-22T12:30'),
+        subjectKey: 'grunt:water',
+      });
+      // A grunt changes no pinned post.
+      expect(changed).toEqual([]);
+      clock.now += 10 * 60_000;
+      expect(await rocket(service, WATER, { reporter: OTHER_REPORTER })).toEqual({
+        kind: 'already',
+        standing: first.report,
+      });
+      expect(await service.rocketAt(REPORT_SERVER, reportedStop(1).key)).toEqual(first.report);
+      // Once it has ended it is a new report.
+      clock.now = at('2026-10-22T12:30');
+      expect(await rocket(service, WATER)).toMatchObject({ kind: 'reported', news: true });
+    });
+
+    it('replaces a grunt by another at once, and tells that the first one ended', async () => {
+      const { service, ended } = rocketServiceWith();
+      const first = await rocket(service, WATER);
+      const second = await rocket(service, NONE, { reporter: OTHER_REPORTER });
+      expect(second).toMatchObject({ kind: 'reported', news: true });
+      if (first.kind !== 'reported' || second.kind !== 'reported') return;
+      expect(second.replaced).toEqual(first.report);
+      expect(ended).toEqual([[first.report.id]]);
+      expect(await service.standing(REPORT_SERVER)).toEqual([second.report]);
+    });
+
+    it('asks before a grunt replaces a hideout; Replace for that hideout reports it', async () => {
+      const { service, changed, ended } = rocketServiceWith();
+      const arlo = await rocket(service, ARLO);
+      if (arlo.kind !== 'reported') throw new Error('not reported');
+      expect(arlo.report.endsAt).toBe(at('2026-10-23T00:00'));
+      expect(changed).toEqual([[REPORT_SERVER, [reportedStop(1).key]]]);
+      expect(await rocket(service, WATER)).toEqual({ kind: 'asks', standing: arlo.report });
+      expect(await rocket(service, WATER, { replacing: arlo.report.id + 1 })).toMatchObject({
+        kind: 'asks',
+      });
+      const replaced = await rocket(service, WATER, { replacing: arlo.report.id });
+      expect(replaced).toMatchObject({ kind: 'reported', replaced: arlo.report, news: true });
+      expect(ended).toEqual([[arlo.report.id]]);
+      // The hideout left the post.
+      expect(changed).toHaveLength(2);
+    });
+
+    it('lets a hideout replace a grunt; the same hideout again is no news', async () => {
+      const { service, ended } = rocketServiceWith();
+      const grunt = await rocket(service, WATER);
+      const arlo = await rocket(service, ARLO);
+      expect(arlo).toMatchObject({ kind: 'reported', news: true });
+      const again = await rocket(service, ARLO, { reporter: OTHER_REPORTER });
+      expect(again).toMatchObject({ kind: 'reported', news: false });
+      if (grunt.kind !== 'reported' || arlo.kind !== 'reported') return;
+      expect(ended).toEqual([[grunt.report.id], [arlo.report.id]]);
+    });
+
+    it('keeps research and Rocket at a stop apart', async () => {
+      const { service } = rocketServiceWith();
+      await service.reportResearch({
+        serverId: REPORT_SERVER,
+        stops: [reportedStop(1)],
+        subject: THROWS,
+        reporter: REPORTER,
+      });
+      const grunt = await rocket(service, WATER);
+      expect(grunt).toMatchObject({ kind: 'reported', replaced: undefined });
+      expect((await service.at(REPORT_SERVER, reportedStop(1).key))?.kind).toBe('research');
+      expect((await service.rocketAt(REPORT_SERVER, reportedStop(1).key))?.kind).toBe('rocket');
+      expect(await service.rocketAt(REPORT_SERVER, reportedStop(2).key)).toBeUndefined();
+    });
+
+    it('takes back a Rocket report, and tells that it ended', async () => {
+      const { service, ended } = rocketServiceWith();
+      const grunt = await rocket(service, WATER);
+      if (grunt.kind !== 'reported') throw new Error('not reported');
+      const { removed } = await service.takeBack(
+        REPORT_SERVER,
+        [grunt.report.id],
+        REPORTER.id,
+        false,
+      );
+      expect(removed).toEqual([grunt.report]);
+      expect(ended).toEqual([[grunt.report.id]]);
+    });
+
+    it('draws no post when only a grunt is taken back; a hideout taken back draws it', async () => {
+      const { service, changed } = rocketServiceWith();
+      const grunt = await rocket(service, WATER);
+      const arlo = await rocket(service, ARLO, { stop: 2 });
+      if (grunt.kind !== 'reported' || arlo.kind !== 'reported') throw new Error('not reported');
+      changed.length = 0;
+      await service.takeBack(REPORT_SERVER, [grunt.report.id], REPORTER.id, false);
+      expect(changed).toEqual([]);
+      await service.takeBack(REPORT_SERVER, [arlo.report.id], REPORTER.id, false);
+      expect(changed).toEqual([[REPORT_SERVER, [reportedStop(2).key]]]);
+    });
+
+    it('keeps one Rocket report per stop across midnight (fix A2)', async () => {
+      const { service, clock, ended } = rocketServiceWith();
+      clock.now = at('2026-10-22T23:50');
+      const late = await rocket(service, WATER);
+      if (late.kind !== 'reported') throw new Error('not reported');
+      clock.now = at('2026-10-23T00:05');
+      // Yesterday's grunt still stands: the same grunt is reported already.
+      expect(await rocket(service, WATER)).toEqual({ kind: 'already', standing: late.report });
+      // Another grunt replaces it, across the day.
+      const other = await rocket(service, NONE);
+      expect(other).toMatchObject({ kind: 'reported', replaced: late.report });
+      expect(ended).toEqual([[late.report.id]]);
+      expect(await service.standing(REPORT_SERVER)).toHaveLength(1);
+      // A hideout ends a grunt of yesterday as well.
+      clock.now = at('2026-10-23T23:55');
+      const lateAgain = await rocket(service, WATER, { stop: 3 });
+      if (lateAgain.kind !== 'reported') throw new Error('not reported');
+      clock.now = at('2026-10-24T00:01');
+      const arlo = await rocket(service, ARLO, { stop: 3 });
+      expect(arlo).toMatchObject({ kind: 'reported', replaced: lateAgain.report });
+      expect(ended.at(-1)).toEqual([lateAgain.report.id]);
+    });
+  });
+
   it('forgets the reports that ended', async () => {
     const { service, clock, store } = serviceWith();
     await service.reportResearch({
diff --git a/src/services/stop-reports.ts b/src/services/stop-reports.ts
index c77ce480507a7817178d3fddc53f3a93db0f4492..50120d30e2a8cd805f3d4ecd3ed39f4654e5a2a3 100644
--- a/src/services/stop-reports.ts
+++ b/src/services/stop-reports.ts
@@ -1,8 +1,17 @@
-import type {
-  SavedStopReport,
-  StopReportStorage,
-} from '../db/repositories/stop-report-repository.js';
-import type { Reporter, ReportedStop, ResearchDetail, StopReport } from '../domain/stops/report.js';
+import type { StopReportStorage } from '../db/repositories/stop-report-repository.js';
+import { isHideout, parseRocketKey } from '../domain/rocket/lineups.js';
+import { decideRocket, rocketDay, type RocketDecision } from '../domain/rocket/reports.js';
+import {
+  isResearchReport,
+  isRocketReport,
+  type Reporter,
+  type ReportedStop,
+  type ResearchDetail,
+  type ResearchReport,
+  type RocketDetail,
+  type RocketReport,
+  type StopReport,
+} from '../domain/stops/report.js';
 import { periodAt, type ResearchPeriod } from '../domain/time/research-periods.js';
 import type { Logger } from '../log.js';
 import type { ResearchEventProvider } from './raid-event-service.js';
@@ -13,8 +22,11 @@ export interface ResearchSubject {
   research: ResearchDetail;
 }
 
-/** A report saved at one stop: it, and the report there it replaced. */
-export type SavedAtStop = SavedStopReport;
+/** A research report saved at one stop: it, and the research report there it replaced. */
+export interface SavedAtStop {
+  report: ResearchReport;
+  replaced: ResearchReport | undefined;
+}
 
 /** What came of a research report at one or more stops. */
 export interface ResearchOutcome {
@@ -30,20 +42,42 @@ export interface ResearchOutcome {
  */
 export interface ResearchNews {
   serverId: string;
-  reports: StopReport[];
+  reports: ResearchReport[];
   reporter: Reporter;
   period: ResearchPeriod;
 }
 
+/** What a Rocket report is of (plan 8R-2): who (`rocketKey`) and what it says. */
+export interface RocketSubject {
+  subjectKey: string;
+  rocket: RocketDetail;
+}
+
+/**
+ * What came of a Rocket report (plan 8R-2; design 5.2, Matt's answer 4): reported (in the place
+ * of the stop's Rocket report of the day, if any; `news` unless it is the same hideout again);
+ * or not: the same grunt stands (`already`), or a hideout does and the member is asked (`asks`).
+ */
+export type RocketOutcome =
+  | { kind: 'reported'; report: RocketReport; replaced: RocketReport | undefined; news: boolean }
+  | { kind: 'already'; standing: RocketReport }
+  | { kind: 'asks'; standing: RocketReport };
+
 /** Who hears of reports as they come and go. */
 export interface StopReportListener {
   /**
    * Reports were made or taken back in a server, at these stops (and where a report replaced
    * another, that one's stop too): the pinned posts of the regions they lie in are drawn anew.
+   * Not told of grunts, which no post shows.
    */
   changed?(serverId: string, stops: readonly ReportedStop[]): void;
   /** Research reports that are news (`ResearchNews`). */
   reported?(news: ResearchNews): void;
+  /**
+   * Reports that ended before their time (plan 8R-2): taken back, or replaced while they stood.
+   * A grunt's message goes with it.
+   */
+  ended?(reports: readonly StopReport[]): void;
 }
 
 /** What came of taking reports back. */
@@ -53,6 +87,9 @@ export interface TakenBack {
   notYours: StopReport[];
 }
 
+/** How long a grunt stands unless said (`settings.rocket.gruntMinutes`). */
+const GRUNT_MS = 30 * 60_000;
+
 export interface StopReportServiceOptions {
   store: StopReportStorage;
   /** The events with field research (`researchEvents`), whose periods a report belongs to. */
@@ -61,22 +98,29 @@ export interface StopReportServiceOptions {
   zone: string;
   log: Logger;
   now?: () => number;
+  /** How long a grunt's report stands (`settings.rocket.gruntMinutes`). Default 30 minutes. */
+  gruntMs?: number;
 }
 
 /**
  * Reports at stops (plan 8R-1; design 1–4): field research by task at one to five stops, each
  * in the place of the stop's report of the period, whoever made it (`StopReportStorage.save`).
  * A report belongs to the research period that was on when it was made (`periodAt` of the
- * stored events: design 9.2) and ends with it. Listeners hear of every change (the pinned posts)
- * and of the reports that are news (the notifier). Taking back is the reporter's, or staff's.
- * The hourly upkeep forgets what has ended (`sweep`).
+ * stored events: design 9.2) and ends with it. Team GO Rocket (plan 8R-2; design 5.2): one
+ * report per stop and day, a grunt for `gruntMs`, a hideout until midnight, decided with the
+ * stop's row locked (`decideRocket` in `saveUnless`). Listeners hear of every change (the pinned
+ * posts), of the research that is news (the notifier) and of the reports that ended early (the
+ * grunts' messages). Taking back is the reporter's, or staff's. The hourly upkeep forgets what
+ * has ended (`sweep`).
  */
 export class StopReportService {
   private readonly now: () => number;
+  private readonly gruntMs: number;
   private readonly listeners: StopReportListener[] = [];
 
   constructor(private readonly options: StopReportServiceOptions) {
     this.now = options.now ?? (() => Date.now());
+    this.gruntMs = options.gruntMs ?? GRUNT_MS;
   }
 
   /** Adds a listener; it must not throw (what it throws is logged). */
@@ -101,18 +145,28 @@ export class StopReportService {
   }
 
   /**
-   * The report a member means at a stop: of the period on now, else of the one waiting under it
-   * (an intra-day event's window); undefined when the stop has neither.
+   * The research report a member means at a stop: of the period on now, else of the one waiting
+   * under it (an intra-day event's window); undefined when the stop has neither.
    */
-  async at(serverId: string, stopKey: string): Promise<StopReport | undefined> {
+  async at(serverId: string, stopKey: string): Promise<ResearchReport | undefined> {
     const period = this.period();
-    const here = (await this.standing(serverId)).filter((report) => report.stop.key === stopKey);
+    const here = (await this.standing(serverId))
+      .filter(isResearchReport)
+      .filter((report) => report.stop.key === stopKey);
     return (
       here.find((report) => report.periodKey === period.key) ??
       here.find((report) => report.periodKey === period.waiting?.key)
     );
   }
 
+  /** The Rocket report standing at a stop (plan 8R-2), the latest where two do (past midnight). */
+  async rocketAt(serverId: string, stopKey: string): Promise<RocketReport | undefined> {
+    return (await this.standing(serverId))
+      .filter(isRocketReport)
+      .filter((report) => report.stop.key === stopKey)
+      .at(-1);
+  }
+
   /**
    * Reports a task at these stops (one to five, each once) in the period on now: each in the
    * place of the stop's report of the period. Throws what storing throws; a stop stored before
@@ -129,19 +183,23 @@ export class StopReportService {
     const saved: SavedAtStop[] = [];
     try {
       for (const stop of input.stops) {
-        saved.push(
-          await this.options.store.save({
-            serverId: input.serverId,
-            kind: 'research',
-            stop,
-            periodKey: period.key,
-            endsAt: period.end,
-            subjectKey: input.subject.subjectKey,
-            research: input.subject.research,
-            reporter: input.reporter,
-            madeAt,
-          }),
-        );
+        const { report, replaced } = await this.options.store.save({
+          serverId: input.serverId,
+          kind: 'research',
+          stop,
+          periodKey: period.key,
+          endsAt: period.end,
+          subjectKey: input.subject.subjectKey,
+          research: input.subject.research,
+          reporter: input.reporter,
+          madeAt,
+        });
+        // A report replaces only one of its own kind (the identity has the kind).
+        if (!isResearchReport(report)) throw new Error('a research report was saved as another');
+        saved.push({
+          report,
+          replaced: replaced && isResearchReport(replaced) ? replaced : undefined,
+        });
       }
     } finally {
       if (saved.length > 0) {
@@ -178,6 +236,84 @@ export class StopReportService {
     return { period, saved };
   }
 
+  /**
+   * Reports Team GO Rocket at a stop (plan 8R-2; design 5.2): in the place of the stop's Rocket
+   * report of the day as `decideRocket` decides, inside the transaction that holds the stop's row
+   * (`saveUnless`): the same grunt standing is reported already; a grunt where a hideout stands
+   * asks first, unless `replacing` is that hideout's id (the member said Replace). A grunt stands
+   * `gruntMs`, a hideout until local midnight. What it replaced while it stood has ended
+   * (`ended`); a hideout made or replaced changes the posts (`changed`). The same hideout again
+   * is no news. Throws what storing throws.
+   */
+  async reportRocket(input: {
+    serverId: string;
+    stop: ReportedStop;
+    subject: RocketSubject;
+    reporter: Reporter;
+    replacing?: number;
+  }): Promise<RocketOutcome> {
+    const who = parseRocketKey(input.subject.subjectKey);
+    if (!who) throw new Error(`no Rocket report is of ${input.subject.subjectKey}`);
+    const madeAt = this.now();
+    const day = rocketDay(madeAt, this.options.zone);
+    const hideout = isHideout(who);
+    // Set by the decision inside the transaction (an object: a closure's write is not narrowed).
+    const asked: { decision: RocketDecision } = { decision: 'report' };
+    const outcome = await this.options.store.saveUnless(
+      {
+        serverId: input.serverId,
+        kind: 'rocket',
+        stop: input.stop,
+        periodKey: day.key,
+        endsAt: hideout ? day.end : madeAt + this.gruntMs,
+        subjectKey: input.subject.subjectKey,
+        rocket: input.subject.rocket,
+        reporter: input.reporter,
+        madeAt,
+      },
+      (standing) => {
+        asked.decision = decideRocket(standing, input.subject.subjectKey, madeAt, input.replacing);
+        return asked.decision !== 'report';
+      },
+      // What still stands at the stop, also from yesterday past midnight (fix A2).
+      madeAt,
+    );
+    if (!outcome.saved) {
+      const { standing } = outcome;
+      if (!isRocketReport(standing)) throw new Error('a Rocket report met another kind');
+      return asked.decision === 'already'
+        ? { kind: 'already', standing }
+        : { kind: 'asks', standing };
+    }
+    const { report } = outcome;
+    if (!isRocketReport(report)) throw new Error('a Rocket report was saved as another');
+    const replaced =
+      outcome.replaced && isRocketReport(outcome.replaced) ? outcome.replaced : undefined;
+    // What stood until now ended early: a grunt's message goes with it.
+    const stood = replaced !== undefined && replaced.endsAt > madeAt ? replaced : undefined;
+    if (stood) this.tell((listener) => listener.ended?.([stood]));
+    const wasHideout = stood !== undefined && isHideoutReport(stood);
+    if (hideout || wasHideout) {
+      const stops = stood ? [report.stop, stood.stop] : [report.stop];
+      this.tell((listener) => listener.changed?.(input.serverId, stops));
+    }
+    this.options.log.info(
+      {
+        guild: input.serverId,
+        by: input.reporter.id,
+        who: input.subject.subjectKey,
+        replaced: replaced?.subjectKey,
+      },
+      'Team GO Rocket reported',
+    );
+    return {
+      kind: 'reported',
+      report,
+      replaced,
+      news: stood?.subjectKey !== report.subjectKey,
+    };
+  }
+
   /**
    * Takes back reports of a server by their ids: those of `by`, or every one for `staff`; one
    * gone or ended already is passed over. A replaced report does not come back (design 9.13).
@@ -201,8 +337,12 @@ export class StopReportService {
       if (gone) removed.push(gone);
     }
     if (removed.length > 0) {
-      const stops = removed.map((report) => report.stop);
-      this.tell((listener) => listener.changed?.(serverId, stops));
+      // Only research and hideouts are in the posts: a grunt taken back draws none (fix A4).
+      const stops = removed
+        .filter((report) => isResearchReport(report) || isHideoutReport(report))
+        .map((report) => report.stop);
+      if (stops.length > 0) this.tell((listener) => listener.changed?.(serverId, stops));
+      this.tell((listener) => listener.ended?.(removed));
       this.options.log.info(
         { guild: serverId, by, staff, reports: removed.map((report) => report.id) },
         'stop reports taken back',
@@ -226,3 +366,9 @@ export class StopReportService {
     }
   }
 }
+
+/** Whether a Rocket report is of a hideout (a leader, Giovanni, the decoy). */
+export function isHideoutReport(report: RocketReport): boolean {
+  const who = parseRocketKey(report.subjectKey);
+  return who !== undefined && isHideout(who);
+}
diff --git a/test/support/stop-report-cases.ts b/test/support/stop-report-cases.ts
index 3ed11b5c61d60ae98ab03be0a12bbfbc56889fcc..072e9839431398a2f9ac80e07f8b6838f062e978 100644
--- a/test/support/stop-report-cases.ts
+++ b/test/support/stop-report-cases.ts
@@ -1,6 +1,7 @@
 import { expect, it } from 'vitest';
 import type { StopReportStorage } from '../../src/db/repositories/stop-report-repository.js';
-import type { NewStopReport, ReportedStop } from '../../src/domain/stops/report.js';
+import type { RocketCatch } from '../../src/domain/rocket/lineups.js';
+import type { ReportedStop, ResearchReport, RocketReport } from '../../src/domain/stops/report.js';
 import { taskKeyOf, type TaskReward } from '../../src/domain/research/task.js';
 
 /** When the reports of these cases are made (2026-10-21 10:00 in New York). */
@@ -37,7 +38,9 @@ export function reportedStop(n = 1, overrides: Partial<ReportedStop> = {}): Repo
 }
 
 /** A report of "Make 2 Excellent Throws" (Dratini) by Brock at stop 1, in the day's period. */
-export function researchReport(overrides: Partial<NewStopReport> = {}): NewStopReport {
+export function researchReport(
+  overrides: Partial<Omit<ResearchReport, 'id'>> = {},
+): Omit<ResearchReport, 'id'> {
   const text = 'Make 2 Excellent Throws';
   return {
     serverId: REPORT_SERVER,
@@ -53,6 +56,33 @@ export function researchReport(overrides: Partial<NewStopReport> = {}): NewStopR
   };
 }
 
+/** The catch of the water grunts' first lineup, as the feed of 2026-10-22 has it. */
+export const MUDKIP: RocketCatch = {
+  name: 'Mudkip',
+  key: 'mudkip',
+  dex: 258,
+  shiny: true,
+  image: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm258.icon.png',
+};
+
+/** A Water-type grunt by Brock at stop 1, for half an hour from `REPORT_NOW`. */
+export function rocketReport(
+  overrides: Partial<Omit<RocketReport, 'id'>> = {},
+): Omit<RocketReport, 'id'> {
+  return {
+    serverId: REPORT_SERVER,
+    kind: 'rocket',
+    stop: reportedStop(),
+    periodKey: 'day:2026-10-21',
+    endsAt: REPORT_NOW + 30 * 60_000,
+    subjectKey: 'grunt:water',
+    rocket: { name: 'Water-type grunt', catches: [MUDKIP] },
+    reporter: REPORTER,
+    madeAt: REPORT_NOW,
+    ...overrides,
+  };
+}
+
 /**
  * What the reports at stops do, run against the repository and its twin in memory alike. `made`
  * gives a fresh, empty store.
@@ -127,6 +157,84 @@ export function stopReportCases(made: () => Promise<StopReportStorage>): void {
     expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([]);
   });
 
+  it('keeps a Rocket report beside the research of the same stop and day (plan 8R-2)', async () => {
+    const store = await made();
+    const research = await store.save(researchReport());
+    const rocket = await store.save(rocketReport());
+    expect(rocket.replaced).toBeUndefined();
+    expect(rocket.report).toEqual({ ...rocketReport(), id: rocket.report.id });
+    expect(await store.byId(rocket.report.id)).toEqual(rocket.report);
+    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([
+      research.report,
+      rocket.report,
+    ]);
+  });
+
+  it('keeps what stands when the decision says so, and replaces it else (plan 8R-2)', async () => {
+    const store = await made();
+    const grunt = await store.save(rocketReport());
+    const arlo = rocketReport({
+      subjectKey: 'leader:arlo',
+      rocket: { name: 'Arlo', catches: [] },
+      endsAt: REPORT_MIDNIGHT,
+      reporter: OTHER_REPORTER,
+    });
+    const asked: unknown[] = [];
+    expect(
+      await store.saveUnless(arlo, (standing) => {
+        asked.push(standing);
+        return true;
+      }),
+    ).toEqual({ saved: false, standing: grunt.report });
+    expect(asked).toEqual([grunt.report]);
+    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([grunt.report]);
+    const replaced = await store.saveUnless(arlo, () => false);
+    expect(replaced).toMatchObject({ saved: true, replaced: grunt.report });
+    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([
+      replaced.saved ? replaced.report : undefined,
+    ]);
+    // Nothing standing: nothing to ask about.
+    const other = await store.saveUnless(rocketReport({ stop: reportedStop(2) }), () => true);
+    expect(other).toMatchObject({ saved: true, replaced: undefined });
+  });
+
+  it('decides against what still stands at the stop in another period, if asked (fix A2)', async () => {
+    const store = await made();
+    // A grunt of yesterday that stands past midnight, and an ended one of today at stop 2.
+    const yesterday = await store.save(
+      rocketReport({ periodKey: 'day:2026-10-20', endsAt: REPORT_NOW + 60_000 }),
+    );
+    const research = await store.save(researchReport({ periodKey: 'day:2026-10-20' }));
+    const asked: unknown[] = [];
+    const keep = await store.saveUnless(
+      rocketReport({ subjectKey: 'grunt:fire' }),
+      (standing) => {
+        asked.push(standing);
+        return true;
+      },
+      REPORT_NOW,
+    );
+    expect(keep).toEqual({ saved: false, standing: yesterday.report });
+    expect(asked).toEqual([yesterday.report]);
+    const replaced = await store.saveUnless(
+      rocketReport({ subjectKey: 'grunt:fire' }),
+      () => false,
+      REPORT_NOW,
+    );
+    expect(replaced).toMatchObject({ saved: true, replaced: yesterday.report });
+    // The other kind of report at the stop is left alone.
+    expect((await store.standing(REPORT_SERVER, REPORT_NOW)).map((one) => one.id)).toEqual([
+      research.report.id,
+      replaced.saved ? replaced.report.id : 0,
+    ]);
+    // Without `standingAt` another period is no matter.
+    const apart = await store.saveUnless(
+      rocketReport({ periodKey: 'day:2026-10-22', subjectKey: 'decoy' }),
+      () => true,
+    );
+    expect(apart).toMatchObject({ saved: true, replaced: undefined });
+  });
+
   it('keeps a typed task with its typed reward and no category', async () => {
     const store = await made();
     const text = 'Win 3 raids in the rain';
diff --git a/test/support/stop-reports.ts b/test/support/stop-reports.ts
index e09b96cba1286ecbce64605e241d3225f29eb5ec..57adcfbc59885d3e1ac90dac92a54811fcba4070 100644
--- a/test/support/stop-reports.ts
+++ b/test/support/stop-reports.ts
@@ -1,4 +1,5 @@
 import type {
+  SaveOutcome,
   SavedStopReport,
   StopReportStorage,
 } from '../../src/db/repositories/stop-report-repository.js';
@@ -22,21 +23,40 @@ export class MemoryStopReports implements StopReportStorage {
     if (err) throw err;
   }
 
-  save(report: NewStopReport): Promise<SavedStopReport> {
+  async save(report: NewStopReport): Promise<SavedStopReport> {
     this.fail('save');
-    const before = [...this.rows.values()].find(
-      (row) =>
-        row.serverId === report.serverId &&
-        row.stop.key === report.stop.key &&
-        row.kind === report.kind &&
-        row.periodKey === report.periodKey,
-    );
+    const outcome = await this.saveUnless(report, () => false);
+    if (!outcome.saved) throw new Error('a report kept what stood without being asked to');
+    return outcome;
+  }
+
+  saveUnless(
+    report: NewStopReport,
+    keeps: (standing: StopReport) => boolean,
+    standingAt?: number,
+  ): Promise<SaveOutcome> {
+    this.fail('saveUnless');
+    const rows = [...this.rows.values()]
+      .filter(
+        (row) =>
+          row.serverId === report.serverId &&
+          row.stop.key === report.stop.key &&
+          row.kind === report.kind &&
+          (row.periodKey === report.periodKey ||
+            (standingAt !== undefined && row.endsAt > standingAt)),
+      )
+      .sort((a, b) => a.madeAt - b.madeAt || a.id - b.id);
+    const live = standingAt === undefined ? [] : rows.filter((row) => row.endsAt > standingAt);
+    const before = live.at(-1) ?? rows.find((row) => row.periodKey === report.periodKey);
+    if (before && keeps(structuredClone(before))) {
+      return Promise.resolve({ saved: false, standing: structuredClone(before) });
+    }
     // A replacement is a report of its own: the replaced one's id is gone for good.
-    if (before) this.rows.delete(before.id);
+    for (const row of rows) this.rows.delete(row.id);
     const id = this.nextId++;
     const kept: StopReport = structuredClone({ ...report, id });
     this.rows.set(id, kept);
-    return Promise.resolve({ report: structuredClone(kept), replaced: before });
+    return Promise.resolve({ saved: true, report: structuredClone(kept), replaced: before });
   }
 
   byId(id: number): Promise<StopReport | undefined> {
````

### Task 4: 8R-2 task 4: grunts' messages in the region channels

Prototype commit: `49f8e7634fc86129f1b07fc2d8f2677d9a37edfa`

A grunt's report is a message in each region channel whose outline holds
its stop, as a spawn report is: components v2 (the grunt, what can be caught
with a gallery of the catches' pictures, the stop's line with its address,
maps link and picture, when it goes away, the reporter in the small print by
name), plain text where the bot may not embed; a message Discord refuses for
its pictures goes once more without them; a channel where the bot may not
post is passed over and logged.

GruntMessageService records each message (GruntMessage) and deletes it when
the report ends, at once when it ends early (a newer report at the stop,
taken back: the reports' new ended event), also one still on its way; a
failed delete is tried once more a minute later, then by the sweeps until a
day after its time. The upkeep sweeps them hourly and at start (the
scheduler's grunts). Unlike spawn reports a shutdown deletes nothing: the
report stands on through a restart, and so does its message.

RocketService is the one way to report Rocket (/rocket now, the map later):
the report decided and kept, the grunt's messages posted (none in rehearsal
mode, the report still kept), then the notifier told with the messages for
the DMs' links; the same grunt again answers with its messages. ctx.rocket.

**Files:**

```
 src/app-context.ts                                 |   6 ++
 src/app.ts                                         |  30 ++++++
 src/db/repositories/grunt-message-repository.ts    |  67 +++++++++++++
 src/db/repositories/rocket-repositories.db.test.ts |  14 ++-
 src/render/rocket.test.ts                          |  84 +++++++++++++++++
 src/render/rocket.ts                               | 115 ++++++++++++++++++++++
 src/services/grunt-messages.test.ts                | 210 +++++++++++++++++++++++++++++++++++++++++
 src/services/grunt-messages.ts                     | 309 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/party-scheduler.test.ts               |  33 +++++++
 src/services/party-scheduler.ts                    |   8 +-
 src/services/rocket-reports.test.ts                | 314 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/rocket-reports.ts                     | 177 ++++++++++++++++++++++++++++++++++
 src/services/stop-reports.ts                       |  32 +++++++
 test/support/rocket-store-cases.ts                 |  46 +++++++++
 test/support/rocket-store.test.ts                  |   8 +-
 test/support/rocket-store.ts                       |  53 +++++++++++
 test/support/test-context.ts                       |  14 +++
 17 files changed, 1515 insertions(+), 5 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/rocket.test.ts src/services/grunt-messages.test.ts src/services/party-scheduler.test.ts src/services/rocket-reports.test.ts test/support/rocket-store.test.ts`); all pass. Its database test files (`src/db/repositories/rocket-repositories.db.test.ts`) run with the database suite at the tip.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 49f8e7634fc86129f1b07fc2d8f2677d9a37edfa -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-2 task 4: grunts' messages in the region channels`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index c86f119464a18a1b5e0a82b66b5ccce0dec96116..a7ce912a9028af9bfeed57647126dfcdf072cc82 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -26,6 +26,7 @@ import type { PineStopService } from './services/pine-stops.js';
 import type { ResearchTaskProvider } from './services/research-task-service.js';
 import type { RocketLineupProvider } from './services/rocket-lineup-service.js';
 import type { StopReportService } from './services/stop-reports.js';
+import type { RocketService } from './services/rocket-reports.js';
 import type { PlaceFinder } from './services/place-finder.js';
 import type { PlaceSearch } from './services/place-search.js';
 import type { PokebattlerGateway } from './services/pokebattler-gateway.js';
@@ -88,6 +89,11 @@ export interface AppContext {
   readonly rocketLineups: RocketLineupProvider;
   /** Reports at stops (plan 8R-1): field research, in research periods. */
   readonly stopReports: StopReportService;
+  /**
+   * Reporting Team GO Rocket (plan 8R-2): the report, the grunt's messages (none in rehearsal
+   * mode), the notifier.
+   */
+  readonly rocket: RocketService;
   /** The gyms, and finding them by what members type. */
   readonly gyms: GymProvider;
   /** Gym administration (`/gym`): adding, changing, moving and deleting gyms. */
diff --git a/src/app.ts b/src/app.ts
index 04124853ccbf4d8b1abb8f96281fe478959a2761..2fa7b9c29fb53f558a1adba4430b3ae55488a493 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -77,6 +77,9 @@ import { ResearchTaskService } from './services/research-task-service.js';
 import { ResearchTaskRepository } from './db/repositories/research-task-repository.js';
 import { RocketLineupService } from './services/rocket-lineup-service.js';
 import { RocketLineupRepository } from './db/repositories/rocket-lineup-repository.js';
+import { GruntMessageRepository } from './db/repositories/grunt-message-repository.js';
+import { GruntMessageService } from './services/grunt-messages.js';
+import { RocketService } from './services/rocket-reports.js';
 import { ResearchEventRepository } from './db/repositories/research-event-repository.js';
 import { StopReportRepository } from './db/repositories/stop-report-repository.js';
 import { StopReportService } from './services/stop-reports.js';
@@ -470,6 +473,23 @@ export async function startApp(
     settings: config.settings,
     log,
   });
+  // The grunts' messages (plan 8R-2), deleted after their half hour; none in rehearsal mode,
+  // which posts nothing outside party posts (design 6, 9.14): the reports are still kept.
+  const gruntMessages = rehearsal
+    ? undefined
+    : new GruntMessageService({
+        gateway: partyGateway,
+        store: new GruntMessageRepository(db),
+        reports: stopReports,
+        log,
+      });
+  const rocket = new RocketService({
+    reports: stopReports,
+    messages: gruntMessages,
+    regions,
+    guilds,
+    log,
+  });
   const lines = new PartyLines({
     gateway: partyGateway,
     active: (postId) => parties.byPost(postId) !== undefined,
@@ -695,6 +715,7 @@ export async function startApp(
     routes: trains,
     spawns,
     stops: stopReports,
+    ...(gruntMessages ? { grunts: gruntMessages } : {}),
     pictures: maps,
     screenshots: screenshotStore,
     emoji: appEmoji,
@@ -789,6 +810,7 @@ export async function startApp(
     researchTasks,
     rocketLineups,
     stopReports,
+    rocket,
     gyms,
     gymAdmin,
     wayfarer,
@@ -1194,6 +1216,14 @@ export async function startApp(
       { name: 'self-assigned roles', timeoutMs: 5_000, run: () => selfRoles.idle() },
       // The spawn reports that wait for their half hour are deleted now: they would stay for good.
       { name: 'spawn reports', timeoutMs: 5_000, run: () => spawns.flush() },
+      // The grunts' messages stand on (their reports do): the next start's sweep deletes them.
+      {
+        name: 'grunt reports',
+        timeoutMs: 5_000,
+        run: async () => {
+          await gruntMessages?.close();
+        },
+      },
       // What waits to be drawn in the pinned posts of the stops goes out now.
       {
         name: 'posts of the stops',
diff --git a/src/db/repositories/grunt-message-repository.ts b/src/db/repositories/grunt-message-repository.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ed4fe0f9bad6eaf936e853a20993bb58381b69df
--- /dev/null
+++ b/src/db/repositories/grunt-message-repository.ts
@@ -0,0 +1,67 @@
+import { sql, type Kysely } from 'kysely';
+import type { DB } from '../types.js';
+
+/** A grunt report's message in a region channel, until it is deleted (plan 8R-2). */
+export interface GruntMessageRow {
+  messageId: string;
+  channelId: string;
+  /** Snowflake of the server. */
+  serverId: string;
+  /** The `StopReport` row of the grunt it shows. */
+  reportId: number;
+  /** When it is due, epoch milliseconds. */
+  deleteAt: number;
+}
+
+/**
+ * The grunts' messages that still stand (plan 8R-2; table `GruntMessage` of migration 028), kept
+ * so that a restart does not leave them standing, as `SpawnReportStorage` keeps spawns'; twin
+ * `MemoryGruntMessages` (`test/support/rocket-store.ts`), both running `gruntMessageCases`.
+ */
+export interface GruntMessageStorage {
+  /** Records a message; one recorded already stays as it is. */
+  add(row: GruntMessageRow): Promise<void>;
+  /** Forgets a message; nothing happens for one that is not recorded. */
+  remove(messageId: string): Promise<void>;
+  /** Every recorded message, the one due first at the head. */
+  all(): Promise<GruntMessageRow[]>;
+  /** The messages of a report (one per region channel it was posted in), in their order. */
+  ofReport(reportId: number): Promise<GruntMessageRow[]>;
+}
+
+/** The `GruntMessage` table. */
+export class GruntMessageRepository implements GruntMessageStorage {
+  constructor(private readonly db: Kysely<DB>) {}
+
+  async add(row: GruntMessageRow): Promise<void> {
+    await sql`
+      insert into GruntMessage (messageId, channelId, serverId, reportId, deleteAt)
+      values (${row.messageId}, ${row.channelId}, ${row.serverId}, ${row.reportId},
+        ${String(row.deleteAt)})
+      on duplicate key update messageId = GruntMessage.messageId`.execute(this.db);
+  }
+
+  async remove(messageId: string): Promise<void> {
+    await this.db.deleteFrom('GruntMessage').where('messageId', '=', messageId).execute();
+  }
+
+  async all(): Promise<GruntMessageRow[]> {
+    const rows = await this.db
+      .selectFrom('GruntMessage')
+      .selectAll()
+      .orderBy('deleteAt')
+      .orderBy('messageId')
+      .execute();
+    return rows.map((row) => ({ ...row, deleteAt: Number(row.deleteAt) }));
+  }
+
+  async ofReport(reportId: number): Promise<GruntMessageRow[]> {
+    const rows = await this.db
+      .selectFrom('GruntMessage')
+      .selectAll()
+      .where('reportId', '=', reportId)
+      .orderBy('messageId')
+      .execute();
+    return rows.map((row) => ({ ...row, deleteAt: Number(row.deleteAt) }));
+  }
+}
diff --git a/src/db/repositories/rocket-repositories.db.test.ts b/src/db/repositories/rocket-repositories.db.test.ts
index d7b1995447f161ca5ca7e1ad487c0fdbc2d17d7f..fd9613b3fbbfd48a73d6294ab90d3fd3af7c1ae0 100644
--- a/src/db/repositories/rocket-repositories.db.test.ts
+++ b/src/db/repositories/rocket-repositories.db.test.ts
@@ -1,9 +1,14 @@
 import type { Kysely } from 'kysely';
 import { afterAll, beforeAll, describe, expect, it } from 'vitest';
 import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
-import { listedChoice, rocketLineupCases } from '../../../test/support/rocket-store-cases.js';
+import {
+  gruntMessageCases,
+  listedChoice,
+  rocketLineupCases,
+} from '../../../test/support/rocket-store-cases.js';
 import { createTestLogger } from '../../../test/support/test-logger.js';
 import type { DB } from '../types.js';
+import { GruntMessageRepository } from './grunt-message-repository.js';
 import { RocketLineupRepository } from './rocket-lineup-repository.js';
 
 /** The tables of plan 8R-2: the kept Rocket lineups and the grunt messages. */
@@ -18,6 +23,13 @@ describe('the repositories of Team GO Rocket', () => {
     await stop();
   });
 
+  describe('GruntMessageRepository', () => {
+    gruntMessageCases(async () => {
+      await db.deleteFrom('GruntMessage').execute();
+      return new GruntMessageRepository(db);
+    });
+  });
+
   describe('RocketLineupRepository', () => {
     rocketLineupCases(async () => {
       await db.deleteFrom('RocketLineup').execute();
diff --git a/src/render/rocket.test.ts b/src/render/rocket.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..92e7c2a53b718bab6a584bc593326d3421ce6989
--- /dev/null
+++ b/src/render/rocket.test.ts
@@ -0,0 +1,84 @@
+import { describe, expect, it } from 'vitest';
+import { classic, galleryOf, textOf, thumbnailOf } from '../../test/support/messages.js';
+import { feedChoice } from '../../test/support/rocket.js';
+import { reportedStop } from '../../test/support/stop-report-cases.js';
+import {
+  catchWords,
+  gruntMessage,
+  gruntTextMessage,
+  ROCKET_COLOUR,
+  type GruntView,
+} from './rocket.js';
+
+const GONE = Date.UTC(2026, 9, 22, 16, 30);
+const STOP_PICTURE = 'https://lh3.googleusercontent.com/abc';
+
+const view = (overrides: Partial<GruntView> = {}): GruntView => ({
+  name: 'Water-type grunt',
+  catches: feedChoice('grunt:water').catches,
+  stop: reportedStop(1, { name: 'Yellow Mural', address: 'Market Street', image: STOP_PICTURE }),
+  reporter: { id: '200000000000000061', name: 'Ash' },
+  ...overrides,
+});
+
+describe('gruntMessage', () => {
+  it('shows the grunt, its catches with their pictures, the stop, when it goes, and who reported it', () => {
+    const message = gruntMessage(view(), GONE);
+    const text = textOf(message);
+    expect(text).toContain('### Water-type grunt');
+    expect(text).toContain('**Catch** one of Mudkip, Tentacool, Krabby, Magikarp, Feebas');
+    expect(text).toContain('This report goes away <t:1792686600:R>.');
+    expect(text).toMatch(/\*\*Where\*\* \*\*Yellow Mural\*\* · Market Street · \[Map\]\(<https:/);
+    expect(text).toContain('-# Reported by **Ash**');
+    expect(text).not.toContain('<@');
+    expect(thumbnailOf(message)).toMatch(/^https:\/\/lh3\.googleusercontent\.com\/abc/);
+    expect(galleryOf(message)).toEqual([
+      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm258.icon.png',
+      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm72.icon.png',
+      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm98.icon.png',
+      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm129.icon.png',
+      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm349.icon.png',
+    ]);
+    expect(message.components[0]).toMatchObject({ accent_color: ROCKET_COLOUR });
+  });
+
+  it('makes what members and the stop say plain, without links', () => {
+    const message = gruntMessage(
+      view({
+        stop: reportedStop(1, { name: 'Go to http://x.test', address: null, image: null }),
+        reporter: { id: '200000000000000061', name: '@everyone' },
+        catches: [],
+      }),
+      GONE,
+    );
+    const text = textOf(message);
+    expect(text).toContain('**Go to http:​//x.test**');
+    expect(text).not.toContain('@everyone');
+    expect(text).not.toContain('**Catch**');
+    expect(galleryOf(message)).toEqual([]);
+  });
+});
+
+describe('gruntTextMessage', () => {
+  it('says the same as text, where the bot may not embed', () => {
+    const { content } = classic(gruntTextMessage(view(), GONE));
+    expect(content).toContain('**Water-type grunt** has been reported by **Ash**');
+    expect(content).toContain('at **Yellow Mural** · Market Street');
+    expect(content).toContain('one of Mudkip, Tentacool, Krabby, Magikarp, Feebas');
+    expect(content).toContain('<t:1792686600:R>');
+    // The article by the name (fix B4).
+    expect(classic(gruntTextMessage(view({ name: 'Electric-type grunt' }), GONE)).content).toMatch(
+      /^An \*\*Electric-type grunt\*\* has been reported/,
+    );
+  });
+});
+
+describe('catchWords', () => {
+  it('names one catch alone and several as one of them, the first few and the rest counted', () => {
+    expect(catchWords(feedChoice('decoy').catches)).toBe('Bellsprout');
+    expect(catchWords(feedChoice('grunt:normal').catches, 3)).toBe(
+      'one of Teddiursa, Hoothoot, Porygon +3',
+    );
+    expect(catchWords([])).toBe('');
+  });
+});
diff --git a/src/render/rocket.ts b/src/render/rocket.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a3a2979f5d9e106272d876ffe8225da02de8eeac
--- /dev/null
+++ b/src/render/rocket.ts
@@ -0,0 +1,115 @@
+import type { APIComponentInContainer } from 'discord.js';
+import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
+import { catchesInShort, type RocketCatch } from '../domain/rocket/lineups.js';
+import type { ReportedStop } from '../domain/stops/report.js';
+import { wayspotPicture } from '../domain/wayspots/picture.js';
+import { mapMarkdown } from './raid-post.js';
+import {
+  memberByName,
+  plain,
+  plainNoLinks,
+  timestamp,
+  truncate,
+  type NamedMember,
+} from './text.js';
+import { container, GALLERY_ITEMS, mediaGallery, section, textDisplay, thumbnail } from './v2.js';
+
+/*
+ * Team GO Rocket's messages (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.2): a
+ * grunt's report in the region channel, deleted after `settings.rocket.gruntMinutes`, as a spawn
+ * report is; and the words the answers, the post and the DMs share.
+ */
+
+/** The colour of what is about Team GO Rocket. */
+export const ROCKET_COLOUR = 0xb3262f;
+
+/** What a grunt's message in a region channel shows. */
+export interface GruntView {
+  /** Who: `Water-type grunt`, `Grunt (no type)`. */
+  name: string;
+  catches: readonly RocketCatch[];
+  stop: ReportedStop;
+  reporter: NamedMember;
+}
+
+/**
+ * What can be caught, in short: `Bellsprout` alone, `one of Mudkip, Tentacool +3` of several (the
+ * first `most`); empty for none.
+ */
+export function catchWords(catches: readonly Pick<RocketCatch, 'name'>[], most = 5): string {
+  if (catches.length === 0) return '';
+  const short = plainNoLinks(catchesInShort(catches, most));
+  return catches.length === 1 ? short : `one of ${short}`;
+}
+
+/** A stop as a line names it in a public message or a DM: plain, without links, cut. */
+export function rocketStopLine(stop: Pick<ReportedStop, 'name' | 'address'>): string {
+  const name = `**${plainNoLinks(truncate(stop.name, 80))}**`;
+  return stop.address === null ? name : `${name} · ${plainNoLinks(truncate(stop.address, 80))}`;
+}
+
+/**
+ * A name with its article, by the name's first letter: `a Water-type grunt`, `an Electric-type
+ * grunt`; `shown` is the name as it is shown (in bold).
+ */
+export function withArticle(name: string, shown = name): string {
+  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${shown}`;
+}
+
+/** A text with its first letter upper case. */
+function capitalised(text: string): string {
+  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
+}
+
+/** The pictures of the catches, as a gallery shows them (those with one, ten at most). */
+function catchGallery(catches: readonly RocketCatch[]): APIComponentInContainer[] {
+  const pictured = catches.flatMap((one) =>
+    one.image === null ? [] : [{ url: one.image, description: plain(one.name) }],
+  );
+  return pictured.length === 0 ? [] : [mediaGallery(pictured.slice(0, GALLERY_ITEMS))];
+}
+
+/**
+ * A grunt's report in the region channel (design 5.2), a components-v2 message like a spawn
+ * report: `### Water-type grunt`, what can be caught, when the report goes away; where, with the
+ * stop's address line, its maps link and its picture beside it; the catches' pictures; the
+ * reporter in the small print (`memberByName`, no ping). Everything a member or a feed wrote
+ * through `plainNoLinks`.
+ */
+export function gruntMessage(view: GruntView, goneAt: number): V2Message {
+  const catches = catchWords(view.catches);
+  const head = [
+    `### ${plain(view.name)}`,
+    ...(catches === '' ? [] : [`**Catch** ${catches}`]),
+    `This report goes away ${timestamp(goneAt, 'R')}.`,
+  ].join('\n');
+  const where = `**Where** ${rocketStopLine(view.stop)} · ${mapMarkdown(view.stop)}`;
+  const picture = wayspotPicture(view.stop.image);
+  return {
+    v2: true,
+    components: [
+      container(ROCKET_COLOUR, [
+        textDisplay(head),
+        picture === undefined ? textDisplay(where) : section(where, thumbnail(picture)),
+        ...catchGallery(view.catches),
+        textDisplay(`-# Reported by ${memberByName(view.reporter)} · /rocket reports one`),
+      ]),
+    ],
+  };
+}
+
+/**
+ * A grunt's report where the bot may not post embeds (as `spawnTextMessage`): the same in a
+ * sentence or two of classic text, without pictures.
+ */
+export function gruntTextMessage(view: GruntView, goneAt: number): ClassicMessage {
+  const catches = catchWords(view.catches);
+  return {
+    content:
+      `${capitalised(withArticle(view.name, `**${plain(view.name)}**`))} has been reported by ` +
+      `${memberByName(view.reporter)} at ` +
+      `${rocketStopLine(view.stop)} · ${mapMarkdown(view.stop)}.\n` +
+      (catches === '' ? '' : `Catch ${catches}.\n`) +
+      `This report goes away ${timestamp(goneAt, 'R')}.\n-# /rocket reports one`,
+  };
+}
diff --git a/src/services/grunt-messages.test.ts b/src/services/grunt-messages.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..91022e809bc113e2d6447d258fe3c8f2f06e586a
--- /dev/null
+++ b/src/services/grunt-messages.test.ts
@@ -0,0 +1,210 @@
+import { describe, expect, it } from 'vitest';
+import { FakePartyGateway, missingPermissions } from '../../test/support/fake-gateway.js';
+import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
+import { textOf } from '../../test/support/messages.js';
+import { MemoryGruntMessages } from '../../test/support/rocket-store.js';
+import { REPORT_NOW, rocketReport } from '../../test/support/stop-report-cases.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import type { RocketReport, StopReport } from '../domain/stops/report.js';
+import { GIVE_UP_MS, GruntMessageService } from './grunt-messages.js';
+import type { StopReportListener } from './stop-reports.js';
+
+const HALF_HOUR = 30 * 60_000;
+
+/** A grunt's report as kept, with its id. */
+const grunt = (id: number, overrides: Partial<Omit<RocketReport, 'id'>> = {}): RocketReport => ({
+  ...rocketReport(overrides),
+  id,
+});
+
+/** A service over a store and the fake gateway; `again()` is the service of the next process. */
+function messagesWith() {
+  const gateway = new FakePartyGateway();
+  const store = new MemoryGruntMessages();
+  const clock = { now: REPORT_NOW };
+  const { log, entries } = createTestLogger();
+  const listeners: StopReportListener[] = [];
+  /** Channels where a send fails with this error (Discord answering 500, say). */
+  const failSend = new Map<string, Error>();
+  const service = () => {
+    const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
+    const messages = new GruntMessageService({
+      gateway: {
+        sendMessage: (channelId, message) => {
+          const err = failSend.get(channelId);
+          return err ? Promise.reject(err) : gateway.sendMessage(channelId, message);
+        },
+        deleteMessage: (channelId, messageId) => gateway.deleteMessage(channelId, messageId),
+        mayPost: (channelId) => gateway.mayPost(channelId),
+      },
+      store,
+      reports: { listen: (listener) => listeners.push(listener) },
+      log,
+      now: () => clock.now,
+      setTimer: (run, ms) => {
+        const timer = { run, ms, cancelled: false };
+        timers.push(timer);
+        return () => {
+          timer.cancelled = true;
+        };
+      },
+    });
+    /** Runs the timers that wait (not cancelled), and what follows from them. */
+    const fire = async () => {
+      for (const timer of timers.splice(0)) if (!timer.cancelled) timer.run();
+      await messages.flush();
+    };
+    return { messages, timers, fire };
+  };
+  const ended = (reports: readonly StopReport[]) => {
+    for (const listener of listeners) listener.ended?.(reports);
+  };
+  return { gateway, store, clock, entries, ended, failSend, ...service(), again: service };
+}
+
+describe('GruntMessageService', () => {
+  it('posts a grunt in each region channel, records it, and deletes it when it is due', async () => {
+    const made = messagesWith();
+    const posted = await made.messages.post(grunt(1), [WEST_CHANNEL, EAST_CHANNEL]);
+    expect(posted.map((one) => one.channelId)).toEqual([WEST_CHANNEL, EAST_CHANNEL]);
+    const [west] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(textOf(west?.message)).toContain('### Water-type grunt');
+    expect(made.store.rows.map((row) => [row.channelId, row.reportId, row.deleteAt])).toEqual([
+      [WEST_CHANNEL, 1, REPORT_NOW + HALF_HOUR],
+      [EAST_CHANNEL, 1, REPORT_NOW + HALF_HOUR],
+    ]);
+    expect(made.timers.map((timer) => timer.ms)).toEqual([HALF_HOUR, HALF_HOUR]);
+    expect(await made.messages.messagesOf(1)).toEqual(posted);
+    made.clock.now += HALF_HOUR;
+    await made.fire();
+    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual(
+      posted.map((one) => one.messageId),
+    );
+    expect(made.store.rows).toEqual([]);
+  });
+
+  it('posts plain text where the bot may not embed', async () => {
+    const made = messagesWith();
+    made.gateway.noEmbeds.add(WEST_CHANNEL);
+    await made.messages.post(grunt(1), [WEST_CHANNEL]);
+    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.message.content).toContain(
+      'A **Water-type grunt** has been reported by **Brock**',
+    );
+  });
+
+  it('posts in the other channels when one fails for any reason, and says so (fix A1)', async () => {
+    const made = messagesWith();
+    made.failSend.set(EAST_CHANNEL, new Error('500 Internal Server Error'));
+    const posted = await made.messages.post(grunt(1), [EAST_CHANNEL, WEST_CHANNEL]);
+    expect(posted.map((one) => one.channelId)).toEqual([WEST_CHANNEL]);
+    expect(made.store.rows.map((row) => row.channelId)).toEqual([WEST_CHANNEL]);
+    expect(
+      made.entries.some((entry) => entry.msg === 'could not post a grunt in a region channel'),
+    ).toBe(true);
+  });
+
+  it('deletes a message it could not record, and gives it as not posted (fix A1)', async () => {
+    const made = messagesWith();
+    made.store.failing.set('add', new Error('the database is away'));
+    expect(await made.messages.post(grunt(1), [WEST_CHANNEL])).toEqual([]);
+    await made.messages.flush();
+    // Sent, then deleted: none stands.
+    expect(made.gateway.deleted.map((one) => one.channelId)).toEqual([WEST_CHANNEL]);
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(made.timers).toEqual([]);
+  });
+
+  it('tries the delete of a message it could not record once more a minute later (fix R4)', async () => {
+    const made = messagesWith();
+    made.store.failing.set('add', new Error('the database is away'));
+    made.gateway.failing.set('deleteMessage', new Error('Discord is away'));
+    await made.messages.post(grunt(1), [WEST_CHANNEL]);
+    await made.messages.flush();
+    expect(made.timers.map((timer) => timer.ms)).toEqual([60_000]);
+    made.gateway.failing.delete('deleteMessage');
+    await made.fire();
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+  });
+
+  it('tries once more a minute later a delete of a report that ended early (fix A3)', async () => {
+    const made = messagesWith();
+    await made.messages.post(grunt(1), [WEST_CHANNEL]);
+    made.gateway.failing.set('deleteMessage', new Error('Discord is away'));
+    made.ended([grunt(1)]);
+    await made.messages.flush();
+    expect(made.timers.filter((timer) => !timer.cancelled).map((timer) => timer.ms)).toEqual([
+      60_000,
+    ]);
+    made.gateway.failing.delete('deleteMessage');
+    await made.fire();
+    expect(made.store.rows).toEqual([]);
+  });
+
+  it('passes over a channel where it may not post, and says so', async () => {
+    const made = messagesWith();
+    made.gateway.failing.set('sendMessage', missingPermissions('POST'));
+    expect(await made.messages.post(grunt(1), [WEST_CHANNEL])).toEqual([]);
+    expect(
+      made.entries.some(
+        (entry) => entry.msg === 'the bot may not post a grunt in a region channel',
+      ),
+    ).toBe(true);
+  });
+
+  it('deletes at once the messages of a report that ended early, one still on its way too', async () => {
+    const made = messagesWith();
+    const posted = await made.messages.post(grunt(1), [WEST_CHANNEL]);
+    made.ended([grunt(1)]);
+    await made.messages.flush();
+    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([posted[0]?.messageId]);
+    expect(made.store.rows).toEqual([]);
+    // Replaced while its message was being sent: it goes as soon as it is there.
+    const sending = made.messages.post(grunt(2), [WEST_CHANNEL]);
+    made.ended([grunt(2)]);
+    const late = await sending;
+    await made.messages.flush();
+    expect(made.gateway.deleted.map((one) => one.messageId)).toContain(late[0]?.messageId);
+    expect(made.store.rows).toEqual([]);
+    // A research report or a hideout has no message: nothing is asked.
+    made.ended([grunt(3, { subjectKey: 'leader:arlo' })]);
+    await made.messages.flush();
+    expect(made.gateway.deleted).toHaveLength(2);
+  });
+
+  it('leaves its messages at shutdown; the next start deletes what is overdue, the rest when due', async () => {
+    const made = messagesWith();
+    await made.messages.post(grunt(1), [WEST_CHANNEL]);
+    made.clock.now += 20 * 60_000;
+    const later = await made.messages.post(grunt(2, { endsAt: made.clock.now + HALF_HOUR }), [
+      WEST_CHANNEL,
+    ]);
+    await made.messages.close();
+    expect(made.gateway.deleted).toEqual([]);
+    expect(made.store.rows).toHaveLength(2);
+    made.clock.now += 15 * 60_000;
+    const next = made.again();
+    expect(await next.messages.sweep()).toBe(2);
+    expect(next.timers.map((timer) => timer.ms)).toEqual([0, 15 * 60_000]);
+    await next.fire();
+    expect(made.store.rows.map((row) => row.messageId)).toEqual([]);
+    expect(made.gateway.deleted.map((one) => one.messageId)).toContain(later[0]?.messageId);
+  });
+
+  it('tries a failed delete again, and gives up a day after its time', async () => {
+    const made = messagesWith();
+    await made.messages.post(grunt(1), [WEST_CHANNEL]);
+    made.gateway.failing.set('deleteMessage', new Error('Discord is away'));
+    made.clock.now += HALF_HOUR;
+    await made.fire();
+    // Once more a minute later.
+    expect(made.timers.map((timer) => timer.ms)).toEqual([60_000]);
+    await made.fire();
+    expect(made.store.rows).toHaveLength(1);
+    made.clock.now += GIVE_UP_MS;
+    expect(await made.messages.sweep()).toBe(0);
+    expect(made.store.rows).toEqual([]);
+    expect(made.entries.some((entry) => entry.msg === 'gave up deleting a grunt report')).toBe(
+      true,
+    );
+  });
+});
diff --git a/src/services/grunt-messages.ts b/src/services/grunt-messages.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8a72bd01570852229d22ed9aed83d70e662b5c62
--- /dev/null
+++ b/src/services/grunt-messages.ts
@@ -0,0 +1,309 @@
+import { BoundedMap } from '../bounded-map.js';
+import type { GruntMessageStorage } from '../db/repositories/grunt-message-repository.js';
+import {
+  isMissingPermission,
+  isRefusedBody,
+  type OutgoingMessage,
+  type PartyGateway,
+} from '../discord/party-gateway.js';
+import { isRocketReport, type RocketReport, type StopReport } from '../domain/stops/report.js';
+import type { Logger } from '../log.js';
+import { gruntMessage, gruntTextMessage, type GruntView } from '../render/rocket.js';
+import { isHideoutReport, type StopReportListener } from './stop-reports.js';
+
+/** A grunt's message in a region channel. */
+export interface PostedGrunt {
+  channelId: string;
+  messageId: string;
+}
+
+/** How long after a delete that failed at its time it is tried once more. */
+export const DELETE_AGAIN_MS = 60_000;
+
+/** How long after its time a message that cannot be deleted is still tried at every sweep. */
+export const GIVE_UP_MS = 24 * 60 * 60_000;
+
+/** How many reports that ended early are remembered, for a message still on its way. */
+const ENDED_KEPT = 1_000;
+
+export interface GruntMessageServiceOptions {
+  gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage' | 'mayPost'>;
+  store: GruntMessageStorage;
+  /** The reports at stops: a grunt that ended early (replaced, taken back) is deleted at once. */
+  reports: { listen(listener: StopReportListener): void };
+  log: Logger;
+  now?: () => number;
+  /**
+   * Starts the timer that deletes a message and gives the function that cancels it. Default:
+   * `setTimeout`, unref'd. A test passes its own to fire the timer by hand.
+   */
+  setTimer?: (run: () => void, ms: number) => () => void;
+}
+
+/**
+ * The grunts' messages (plan 8R-2; design 5.2): a grunt's report is a message in each region
+ * channel that holds its stop, as a spawn report is (components v2, or plain text where the bot
+ * may not embed; a message Discord refuses for its pictures is sent once more without them),
+ * deleted when the report ends (`endsAt`, `settings.rocket.gruntMinutes` after it was made) and
+ * at once when it ends early (a newer report at the stop, taken back: `ended`). Every message
+ * is recorded (`GruntMessageStorage`) until it is deleted; `sweep` (at start and hourly) takes
+ * up what is recorded and does not wait in this process. A delete that fails is tried once more
+ * a minute later, then by the sweeps until a day after its time.
+ *
+ * Unlike spawn reports, a shutdown deletes nothing (`close`): the report stands on through a
+ * restart, and so does its message; the next start's sweep deletes what is overdue then.
+ */
+export class GruntMessageService {
+  private readonly now: () => number;
+  private readonly setTimer: (run: () => void, ms: number) => () => void;
+  /** The messages that wait for their delete, by message. */
+  private readonly waiting = new Map<string, { channelId: string; cancel: () => void }>();
+  /** The work on the side (deletes, the ends of reports): `flush` waits for it. */
+  private readonly work = new Set<Promise<unknown>>();
+  /** The messages whose delete is on its way. */
+  private readonly removing = new Set<string>();
+  /** The reports that ended early (by id): a message of one still on its way goes at once. */
+  private readonly endedEarly = new BoundedMap<number, true>(ENDED_KEPT);
+  private closed = false;
+
+  constructor(private readonly options: GruntMessageServiceOptions) {
+    this.now = options.now ?? (() => Date.now());
+    this.setTimer =
+      options.setTimer ??
+      ((run, ms) => {
+        const timer = setTimeout(run, ms);
+        timer.unref();
+        return () => {
+          clearTimeout(timer);
+        };
+      });
+    options.reports.listen({
+      ended: (reports) => {
+        this.ended(reports);
+      },
+    });
+  }
+
+  /**
+   * Posts a grunt's report in these region channels and has each message deleted when the report
+   * ends; gives the messages posted and recorded. Never rejects (fix A1): a channel where the bot
+   * may not post, one that is gone, and any other failure (Discord's 5xx, a time-out) is passed
+   * over and logged, and the next channel is posted; a message that cannot be recorded is
+   * deleted at once (nothing would delete it after a restart) and counts as not posted.
+   */
+  async post(report: RocketReport, channelIds: readonly string[]): Promise<PostedGrunt[]> {
+    const posted: PostedGrunt[] = [];
+    const view: GruntView = {
+      name: report.rocket.name,
+      catches: report.rocket.catches,
+      stop: report.stop,
+      reporter: report.reporter,
+    };
+    for (const channelId of channelIds) {
+      if (this.closed) break;
+      let messageId: string | undefined;
+      try {
+        messageId = await this.send(channelId, view, report.endsAt);
+      } catch (err) {
+        this.options.log.warn(
+          { err, guild: report.serverId, channel: channelId },
+          isMissingPermission(err)
+            ? 'the bot may not post a grunt in a region channel'
+            : 'could not post a grunt in a region channel',
+        );
+        continue;
+      }
+      if (messageId === undefined) continue;
+      if (!(await this.record(report, channelId, messageId))) {
+        this.removeNow(channelId, messageId);
+        continue;
+      }
+      posted.push({ channelId, messageId });
+      // Ended while it was on its way (a newer report, taken back): it goes at once.
+      if (this.endedEarly.has(report.id)) this.removeNow(channelId, messageId);
+      else this.deleteLater(channelId, messageId, Math.max(0, report.endsAt - this.now()), true);
+    }
+    return posted;
+  }
+
+  /** Deletes a message now; one whose delete fails is tried once more a minute later (fix A3). */
+  private removeNow(channelId: string, messageId: string): void {
+    this.track(
+      this.remove(channelId, messageId).then((removed) => {
+        if (!removed && !this.closed) {
+          this.deleteLater(channelId, messageId, DELETE_AGAIN_MS, false);
+        }
+      }),
+    );
+  }
+
+  /** The messages of a report that stand (for "Already reported" and a DM's link). */
+  async messagesOf(reportId: number): Promise<PostedGrunt[]> {
+    return (await this.options.store.ofReport(reportId)).map(({ channelId, messageId }) => ({
+      channelId,
+      messageId,
+    }));
+  }
+
+  /**
+   * Sends a grunt's message; when Discord refuses it for what it holds (an address of a picture),
+   * once more without its pictures.
+   */
+  private async send(
+    channelId: string,
+    view: GruntView,
+    goneAt: number,
+  ): Promise<string | undefined> {
+    const { gateway, log } = this.options;
+    const make = (shown: GruntView): OutgoingMessage =>
+      gateway.mayPost(channelId) ? gruntMessage(shown, goneAt) : gruntTextMessage(shown, goneAt);
+    try {
+      return await gateway.sendMessage(channelId, make(view));
+    } catch (err) {
+      if (!isRefusedBody(err)) throw err;
+      log.warn({ err, channel: channelId }, 'Discord refused the pictures of a grunt report');
+      return gateway.sendMessage(
+        channelId,
+        make({
+          ...view,
+          catches: view.catches.map((one) => ({ ...one, image: null })),
+          stop: { ...view.stop, image: null },
+        }),
+      );
+    }
+  }
+
+  /** Records a message; whether it was. Never rejects (the failure is logged). */
+  private async record(
+    report: RocketReport,
+    channelId: string,
+    messageId: string,
+  ): Promise<boolean> {
+    try {
+      await this.options.store.add({
+        messageId,
+        channelId,
+        serverId: report.serverId,
+        reportId: report.id,
+        deleteAt: report.endsAt,
+      });
+      return true;
+    } catch (err) {
+      this.options.log.warn(
+        { err, channel: channelId },
+        'could not record a grunt report; its message is deleted',
+      );
+      return false;
+    }
+  }
+
+  /** The reports that ended early: the messages of the grunts among them are deleted now. */
+  private ended(reports: readonly StopReport[]): void {
+    for (const report of reports) {
+      if (!isRocketReport(report) || isHideoutReport(report)) continue;
+      this.endedEarly.set(report.id, true);
+      this.track(
+        this.messagesOf(report.id).then(
+          (messages) => {
+            for (const { channelId, messageId } of messages) {
+              this.waiting.get(messageId)?.cancel();
+              this.waiting.delete(messageId);
+              if (!this.removing.has(messageId)) this.removeNow(channelId, messageId);
+            }
+          },
+          (err: unknown) => {
+            this.options.log.warn({ err, report: report.id }, 'could not find a grunt’s messages');
+          },
+        ),
+      );
+    }
+  }
+
+  /**
+   * Takes up the recorded messages that do not wait in this process; answers how many. Each is
+   * deleted when it is due (now, when that has passed), and tried again at the next sweep when
+   * that fails, until `GIVE_UP_MS` after its time.
+   */
+  async sweep(): Promise<number> {
+    if (this.closed) return 0;
+    const rows = await this.options.store.all();
+    const now = this.now();
+    let taken = 0;
+    for (const { channelId, messageId, deleteAt } of rows) {
+      if (this.closed) break;
+      if (this.waiting.has(messageId) || this.removing.has(messageId)) continue;
+      if (now - deleteAt >= GIVE_UP_MS) {
+        await this.forget(channelId, messageId);
+        this.options.log.warn(
+          { channel: channelId, message: messageId },
+          'gave up deleting a grunt report',
+        );
+        continue;
+      }
+      this.deleteLater(channelId, messageId, Math.max(0, deleteAt - now), false);
+      taken += 1;
+    }
+    return taken;
+  }
+
+  /** Has a message deleted after `ms`; one that fails then is tried once more (`again`). */
+  private deleteLater(channelId: string, messageId: string, ms: number, again: boolean): void {
+    const cancel = this.setTimer(() => {
+      this.waiting.delete(messageId);
+      this.track(
+        this.remove(channelId, messageId).then((removed) => {
+          if (!removed && again && !this.closed) {
+            this.deleteLater(channelId, messageId, DELETE_AGAIN_MS, false);
+          }
+        }),
+      );
+    }, ms);
+    this.waiting.get(messageId)?.cancel();
+    this.waiting.set(messageId, { channelId, cancel });
+  }
+
+  /** Deletes a message and forgets it; whether it went. Never rejects (a failure is logged). */
+  private async remove(channelId: string, messageId: string): Promise<boolean> {
+    this.removing.add(messageId);
+    try {
+      await this.options.gateway.deleteMessage(channelId, messageId);
+      await this.forget(channelId, messageId);
+      return true;
+    } catch (err) {
+      this.options.log.warn({ err, channel: channelId }, 'could not delete a grunt report');
+      return false;
+    } finally {
+      this.removing.delete(messageId);
+    }
+  }
+
+  /** Forgets a recorded message; never rejects. */
+  private async forget(channelId: string, messageId: string): Promise<void> {
+    try {
+      await this.options.store.remove(messageId);
+    } catch (err) {
+      this.options.log.warn({ err, channel: channelId }, 'could not forget a grunt report');
+    }
+  }
+
+  private track(promise: Promise<unknown>): void {
+    const tracked = promise.finally(() => this.work.delete(tracked));
+    this.work.add(tracked);
+  }
+
+  /** Waits for the work on the side (deletes, the ends of reports). For tests and `close`. */
+  async flush(): Promise<void> {
+    while (this.work.size > 0) await Promise.allSettled([...this.work]);
+  }
+
+  /**
+   * For shutdown: posts no more, cancels the timers and waits for the deletes on their way.
+   * What still stands is deleted by the next start's sweep (the report stands on as well).
+   */
+  async close(): Promise<void> {
+    this.closed = true;
+    for (const { cancel } of this.waiting.values()) cancel();
+    this.waiting.clear();
+    await this.flush();
+  }
+}
diff --git a/src/services/party-scheduler.test.ts b/src/services/party-scheduler.test.ts
index 77313c0f299a24c92dca8b8c99d56cc6eeba9b95..a7ce64961882c771d9a5086a8d375dcba2bab67c 100644
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -715,6 +715,39 @@ describe('PartyScheduler: running', () => {
     expect(swept).toBe(1);
   });
 
+  it('has the grunts’ messages swept with the reports at stops, also when that fails (8R-2)', async () => {
+    const made = await reportedRaid();
+    const swept: string[] = [];
+    const { PartyScheduler } = await import('./party-scheduler.js');
+    const scheduler = new PartyScheduler({
+      store: made.store,
+      posts: made.service,
+      attendance: made.attendance,
+      stops: {
+        sweep: () => {
+          swept.push('stops');
+          return Promise.reject(new Error('the database is away'));
+        },
+      },
+      grunts: {
+        sweep: () => {
+          swept.push('grunts');
+          return Promise.resolve(0);
+        },
+      },
+      lines: made.lines,
+      gateway: made.gateway,
+      raidBosses: { autoset: () => undefined },
+      settings: made.settings,
+      log: made.log,
+      now: () => made.clock.now,
+      upkeepMs: 0,
+    });
+    await scheduler.tick();
+    await scheduler.whenIdle();
+    expect(swept).toEqual(['stops', 'grunts']);
+  });
+
   it('expires the meetup requests whose time is up at every tick, a failure only logged', async () => {
     const made = await reportedRaid();
     let expired = 0;
diff --git a/src/services/party-scheduler.ts b/src/services/party-scheduler.ts
index c1c3e6c2dbfc3aff032124ef2364f5b03a5b5415..ae7229bd34777f3946991cd6a240d699c759ac0b 100644
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -56,6 +56,8 @@ export interface PartySchedulerOptions {
   spawns?: { sweep(): Promise<unknown> };
   /** The reports at stops, of which those that ended go with the upkeep (plan 8R-1). */
   stops?: { sweep(): Promise<unknown> };
+  /** The grunts' messages that still stand, swept as spawn reports are (plan 8R-2). */
+  grunts?: { sweep(): Promise<unknown> };
   /** The map pictures of places, of which those older than a day go with the upkeep. */
   pictures?: { prunePlaces(): Promise<unknown> };
   /** The screenshots kept on disk, of which those that are due go with the upkeep. */
@@ -267,7 +269,8 @@ export class PartyScheduler {
   /**
    * Archives open posts of ended parties, looks after the summaries, takes back the access to
    * forums that nothing calls for any more, takes stops off the routes of trains whose gym is
-   * gone, has the spawn reports deleted that no process deleted at their time, and the kept
+   * gone, has the spawn reports and grunts' messages deleted that no process deleted at their
+   * time, forgets the reports at stops that ended, and the kept
    * screenshots that are due, and the expired sessions of the web pages, settles the new trains
    * of splits left pending, records the parties the party history was left without, and reads the
    * application's emoji anew: at start and hourly.
@@ -275,7 +278,7 @@ export class PartyScheduler {
   private upkeep(): void {
     const { posts, access, routes, spawns, pictures, screenshots, emoji, webSessions, log } =
       this.options;
-    const { history, splits, stops } = this.options;
+    const { history, splits, stops, grunts } = this.options;
     this.lastUpkeep = this.now();
     // Each by itself: one that fails does not keep the others from running.
     const step = async (work: () => Promise<unknown>): Promise<void> => {
@@ -292,6 +295,7 @@ export class PartyScheduler {
       if (routes) await step(() => routes.removeUnknownStops());
       if (spawns) await step(() => spawns.sweep());
       if (stops) await step(() => stops.sweep());
+      if (grunts) await step(() => grunts.sweep());
       if (pictures) await step(() => pictures.prunePlaces());
       if (screenshots) await step(() => screenshots.sweep());
       if (emoji) await step(() => emoji.refresh());
diff --git a/src/services/rocket-reports.test.ts b/src/services/rocket-reports.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..062b079740c1c197ce50e4a8024feedff09a6a24
--- /dev/null
+++ b/src/services/rocket-reports.test.ts
@@ -0,0 +1,314 @@
+import { describe, expect, it } from 'vitest';
+import { FakePartyGateway } from '../../test/support/fake-gateway.js';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from '../../test/support/gyms.js';
+import { feedChoice } from '../../test/support/rocket.js';
+import { MemoryGruntMessages } from '../../test/support/rocket-store.js';
+import { REPORT_NOW, reportedStop } from '../../test/support/stop-report-cases.js';
+import { MemoryStopReports } from '../../test/support/stop-reports.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { rocketDay } from '../domain/rocket/reports.js';
+import { GruntMessageService } from './grunt-messages.js';
+import { RocketService, rocketSubject, type RocketNews } from './rocket-reports.js';
+import { StopReportService } from './stop-reports.js';
+
+const ASH = { id: '200000000000000061', name: 'Ash' };
+const MISTY = { id: '200000000000000062', name: 'Misty' };
+/** A stop in West, one in East, and one in neither. */
+const WEST = reportedStop(1, { lat: 40.051, lon: -80.05 });
+const EAST = reportedStop(2, { lat: 40.05, lon: -79.95 });
+
+function rocketWith(options: { rehearsal?: boolean; overlap?: boolean } = {}) {
+  const clock = { now: REPORT_NOW };
+  const { log } = createTestLogger();
+  const gateway = new FakePartyGateway();
+  const reports = new StopReportService({
+    store: new MemoryStopReports(),
+    events: { researchEvents: () => [] },
+    zone: 'America/New_York',
+    log,
+    now: () => clock.now,
+  });
+  /** Channels where a send fails with this error. */
+  const failSend = new Map<string, Error>();
+  /** Run before a send fails (what happens meanwhile, fix S1); `guildsFail` makes the lookup throw. */
+  const hooks: { beforeFail?: () => Promise<unknown>; guildsFail?: Error } = {};
+  const messages = options.rehearsal
+    ? undefined
+    : new GruntMessageService({
+        gateway: {
+          sendMessage: async (channelId, message) => {
+            const err = failSend.get(channelId);
+            if (!err) return gateway.sendMessage(channelId, message);
+            await hooks.beforeFail?.();
+            throw err;
+          },
+          deleteMessage: (channelId, messageId) => gateway.deleteMessage(channelId, messageId),
+          mayPost: (channelId) => gateway.mayPost(channelId),
+        },
+        store: new MemoryGruntMessages(),
+        reports,
+        log,
+        now: () => clock.now,
+        setTimer: () => () => undefined,
+      });
+  const told: RocketNews[] = [];
+  const rocket = new RocketService({
+    reports,
+    messages,
+    // With `overlap`, East holds West's stops too (two region channels for one stop).
+    regions: {
+      all: () =>
+        testRegions().map((region) =>
+          options.overlap && region.channelId === EAST_CHANNEL
+            ? { ...region, bounds: testRegions()[0]?.bounds ?? null }
+            : region,
+        ),
+    },
+    guilds: {
+      idFor: (id) =>
+        hooks.guildsFail
+          ? Promise.reject(hooks.guildsFail)
+          : Promise.resolve(id === FAKE_GUILD_ID ? 1 : undefined),
+    },
+    notify: { rocketReported: (news) => told.push(news) },
+    log,
+  });
+  const report = (key: string, stop = WEST, more: { by?: typeof ASH; replacing?: number } = {}) =>
+    rocket.report({
+      serverId: FAKE_GUILD_ID,
+      stop,
+      subject: rocketSubject(feedChoice(key)),
+      reporter: more.by ?? ASH,
+      ...(more.replacing === undefined ? {} : { replacing: more.replacing }),
+    });
+  return { clock, gateway, reports, messages, rocket, told, report, failSend, hooks };
+}
+
+describe('RocketService', () => {
+  it('posts in the other region channel when one fails, and tells of it (fix A1)', async () => {
+    const made = rocketWith({ overlap: true });
+    made.failSend.set(EAST_CHANNEL, new Error('500 Internal Server Error'));
+    const outcome = await made.report('grunt:water');
+    expect(outcome).toMatchObject({
+      kind: 'reported',
+      channels: [WEST_CHANNEL, EAST_CHANNEL],
+    });
+    if (outcome.kind !== 'reported') return;
+    expect(outcome.posted.map((one) => one.channelId)).toEqual([WEST_CHANNEL]);
+    // Only the channel it was posted in (fix R3).
+    expect(made.told.map((news) => news.channels)).toEqual([
+      [{ channelId: WEST_CHANNEL, messageId: outcome.posted[0]?.messageId }],
+    ]);
+    expect(await made.messages?.messagesOf(outcome.report.id)).toEqual(outcome.posted);
+  });
+
+  it('puts back the hideout an unposted grunt replaced, under a new id (fix R2)', async () => {
+    const made = rocketWith();
+    const changed: string[][] = [];
+    made.reports.listen({ changed: (_server, stops) => changed.push(stops.map((s) => s.key)) });
+    const arlo = await made.report('leader:arlo');
+    if (arlo.kind !== 'reported') throw new Error('not reported');
+    made.failSend.set(WEST_CHANNEL, new Error('503 Service Unavailable'));
+    const outcome = await made.report('grunt:water', WEST, { replacing: arlo.report.id });
+    expect(outcome).toMatchObject({ kind: 'unposted', restored: { subjectKey: 'leader:arlo' } });
+    if (outcome.kind !== 'unposted') return;
+    expect(outcome.lost).toBeUndefined();
+    const standing = await made.reports.standing(FAKE_GUILD_ID);
+    expect(standing).toEqual([outcome.restored]);
+    expect(standing[0]).toMatchObject({
+      reporter: arlo.report.reporter,
+      periodKey: arlo.report.periodKey,
+      endsAt: arlo.report.endsAt,
+      rocket: arlo.report.rocket,
+    });
+    expect(standing[0]?.id).not.toBe(arlo.report.id);
+    // The post is drawn with Arlo again.
+    expect(changed.at(-1)).toEqual([WEST.key]);
+  });
+
+  describe('putting a hideout back (fixes S1, S4)', () => {
+    async function arloThenUnposted(
+      made: ReturnType<typeof rocketWith>,
+      meanwhile?: () => Promise<unknown>,
+    ) {
+      const arlo = await made.report('leader:arlo', WEST, { by: MISTY });
+      if (arlo.kind !== 'reported') throw new Error('not reported');
+      made.failSend.set(WEST_CHANNEL, new Error('503 Service Unavailable'));
+      if (meanwhile) made.hooks.beforeFail = meanwhile;
+      const outcome = await made.report('grunt:water', WEST, { replacing: arlo.report.id });
+      made.failSend.clear();
+      delete made.hooks.beforeFail;
+      return { arlo: arlo.report, outcome };
+    }
+
+    it('tells nobody of the hideout put back', async () => {
+      const made = rocketWith();
+      await arloThenUnposted(made);
+      expect(made.told.map((news) => news.report.subjectKey)).toEqual(['leader:arlo']);
+    });
+
+    it('leaves no moment without a report: one made then meets Arlo', async () => {
+      const made = rocketWith();
+      // A grunt reported as the unposted one is taken off: it finds Arlo back already.
+      let during: ReturnType<typeof made.report> | undefined;
+      made.reports.listen({
+        ended: (reports) => {
+          if (reports.some((one) => one.subjectKey === 'grunt:water')) {
+            during ??= made.report('grunt:fire', WEST);
+          }
+        },
+      });
+      await arloThenUnposted(made);
+      expect(await during).toMatchObject({
+        kind: 'asks',
+        standing: { subjectKey: 'leader:arlo' },
+      });
+    });
+
+    it('puts nothing back where another report came meanwhile: Cliff stands', async () => {
+      const made = rocketWith();
+      const { outcome } = await arloThenUnposted(made, () => made.report('leader:cliff', WEST));
+      expect(outcome).toMatchObject({ kind: 'unposted' });
+      if (outcome.kind !== 'unposted') return;
+      expect(outcome.restored).toBeUndefined();
+      expect((await made.reports.standing(FAKE_GUILD_ID)).map((one) => one.subjectKey)).toEqual([
+        'leader:cliff',
+      ]);
+    });
+
+    it('puts nothing back once the hideout’s day has ended', async () => {
+      const made = rocketWith();
+      const { arlo, outcome } = await arloThenUnposted(made, () => {
+        made.clock.now = rocketDay(REPORT_NOW, 'America/New_York').end + 60_000;
+        return Promise.resolve();
+      });
+      expect(outcome).toMatchObject({ kind: 'unposted' });
+      if (outcome.kind !== 'unposted') return;
+      expect(outcome.restored).toBeUndefined();
+      expect(
+        (await made.reports.standing(FAKE_GUILD_ID)).filter(
+          (one) => one.subjectKey === arlo.subjectKey,
+        ),
+      ).toEqual([]);
+    });
+
+    it('puts the hideout back when finding the channels throws, and passes the error on', async () => {
+      const made = rocketWith();
+      const arlo = await made.report('leader:arlo', WEST, { by: MISTY });
+      if (arlo.kind !== 'reported') throw new Error('not reported');
+      made.hooks.guildsFail = new Error('the database is away');
+      await expect(made.report('grunt:water', WEST, { replacing: arlo.report.id })).rejects.toThrow(
+        'the database is away',
+      );
+      delete made.hooks.guildsFail;
+      const standing = await made.reports.standing(FAKE_GUILD_ID);
+      expect(standing.map((one) => one.subjectKey)).toEqual(['leader:arlo']);
+      expect(standing[0]?.id).not.toBe(arlo.report.id);
+    });
+  });
+
+  it('names the grunt an unposted grunt replaced, which cannot come back (fix R2)', async () => {
+    const made = rocketWith();
+    const fire = await made.report('grunt:fire');
+    if (fire.kind !== 'reported') throw new Error('not reported');
+    made.failSend.set(WEST_CHANNEL, new Error('503 Service Unavailable'));
+    const outcome = await made.report('grunt:water', WEST, { by: MISTY });
+    expect(outcome).toMatchObject({ kind: 'unposted', lost: { id: fire.report.id } });
+    expect(await made.reports.standing(FAKE_GUILD_ID)).toEqual([]);
+  });
+
+  it('takes a grunt back that could be posted nowhere, and tells nobody (fix A5)', async () => {
+    const made = rocketWith();
+    made.failSend.set(WEST_CHANNEL, new Error('503 Service Unavailable'));
+    expect(await made.report('grunt:water')).toEqual({
+      kind: 'unposted',
+      channels: [WEST_CHANNEL],
+    });
+    expect(made.told).toEqual([]);
+    expect(await made.reports.standing(FAKE_GUILD_ID)).toEqual([]);
+    // So it does not stand in the way: the same grunt again is a report.
+    made.failSend.clear();
+    expect(await made.report('grunt:water')).toMatchObject({ kind: 'reported' });
+  });
+
+  it('posts a grunt in the region channels of its stop, then tells who wants it', async () => {
+    const made = rocketWith();
+    const outcome = await made.report('grunt:water');
+    expect(outcome).toMatchObject({ kind: 'reported', channels: [WEST_CHANNEL] });
+    if (outcome.kind !== 'reported') return;
+    const [message] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(outcome.posted).toEqual([{ channelId: WEST_CHANNEL, messageId: message?.id }]);
+    expect(made.gateway.messagesIn(EAST_CHANNEL)).toEqual([]);
+    expect(made.told).toEqual([
+      {
+        serverId: FAKE_GUILD_ID,
+        report: outcome.report,
+        channels: [{ channelId: WEST_CHANNEL, messageId: message?.id }],
+      },
+    ]);
+    expect(outcome.report.rocket).toEqual({
+      name: 'Water-type grunt',
+      catches: feedChoice('grunt:water').catches,
+    });
+  });
+
+  it('answers the same grunt again with its messages, and posts and tells nothing', async () => {
+    const made = rocketWith();
+    const first = await made.report('grunt:water');
+    const again = await made.report('grunt:water', WEST, { by: MISTY });
+    expect(again).toMatchObject({ kind: 'already' });
+    if (first.kind !== 'reported' || again.kind !== 'already') return;
+    expect(again.posted).toEqual(first.posted);
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
+    expect(made.told).toHaveLength(1);
+  });
+
+  it('deletes the message of the grunt another one replaces', async () => {
+    const made = rocketWith();
+    const first = await made.report('grunt:water');
+    await made.report('grunt:fire', WEST, { by: MISTY });
+    await made.messages?.flush();
+    if (first.kind !== 'reported') return;
+    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual(
+      first.posted.map((one) => one.messageId),
+    );
+  });
+
+  it('posts no message for a hideout, and tells of it once a day', async () => {
+    const made = rocketWith();
+    const arlo = await made.report('leader:arlo', EAST);
+    expect(arlo).toMatchObject({ kind: 'reported', posted: [], channels: [EAST_CHANNEL] });
+    expect(made.gateway.messagesIn(EAST_CHANNEL)).toEqual([]);
+    expect(made.told.map((news) => news.channels)).toEqual([
+      [{ channelId: EAST_CHANNEL, messageId: undefined }],
+    ]);
+    await made.report('leader:arlo', EAST, { by: MISTY });
+    expect(made.told).toHaveLength(1);
+  });
+
+  it('asks before a grunt replaces a hideout, and posts nothing then', async () => {
+    const made = rocketWith();
+    const arlo = await made.report('leader:arlo');
+    const asked = await made.report('grunt:water');
+    expect(asked).toMatchObject({ kind: 'asks', standing: { subjectKey: 'leader:arlo' } });
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    if (arlo.kind !== 'reported') return;
+    expect(await made.report('grunt:water', WEST, { replacing: arlo.report.id })).toMatchObject({
+      kind: 'reported',
+      replaced: { subjectKey: 'leader:arlo' },
+    });
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
+  });
+
+  it('posts nothing in rehearsal mode, yet keeps the report and tells of it', async () => {
+    const made = rocketWith({ rehearsal: true });
+    const outcome = await made.report('grunt:water');
+    expect(outcome).toMatchObject({ kind: 'reported', posted: [], channels: [WEST_CHANNEL] });
+    expect(made.gateway.messages).toEqual([]);
+    expect(made.told.map((news) => news.channels)).toEqual([
+      [{ channelId: WEST_CHANNEL, messageId: undefined }],
+    ]);
+    expect(await made.reports.standing(FAKE_GUILD_ID)).toHaveLength(1);
+  });
+});
diff --git a/src/services/rocket-reports.ts b/src/services/rocket-reports.ts
new file mode 100644
index 0000000000000000000000000000000000000000..64589f5902d00dcc86908e4c1b1d88562f0fd4a5
--- /dev/null
+++ b/src/services/rocket-reports.ts
@@ -0,0 +1,177 @@
+import type { Region } from '../db/repositories/region-repository.js';
+import type { RocketChoice } from '../domain/rocket/lineups.js';
+import type { Reporter, ReportedStop, RocketReport } from '../domain/stops/report.js';
+import type { Logger } from '../log.js';
+import type { GruntMessageService, PostedGrunt } from './grunt-messages.js';
+import { regionsAtPoint } from './region-directory.js';
+import { isHideoutReport, type RocketSubject, type StopReportService } from './stop-reports.js';
+
+/**
+ * A Rocket report that is news to members who want it (plan 8R-2; design 7): the report, and
+ * per region channel that holds its stop the grunt's message there (none for a hideout, which
+ * the pinned post shows, and none in rehearsal mode).
+ */
+export interface RocketNews {
+  serverId: string;
+  report: RocketReport;
+  channels: { channelId: string; messageId: string | undefined }[];
+}
+
+/** What came of a Rocket report, with what was posted. */
+export type RocketReported =
+  | {
+      kind: 'reported';
+      report: RocketReport;
+      replaced: RocketReport | undefined;
+      /** The region channels that hold the stop (its posts, its messages). */
+      channels: string[];
+      /** The grunt's messages (none for a hideout, or in rehearsal mode). */
+      posted: PostedGrunt[];
+    }
+  /** The same grunt stands (Matt's answer 4): its messages, for the answer's link. */
+  | { kind: 'already'; standing: RocketReport; posted: PostedGrunt[] }
+  /**
+   * A grunt that could be posted in none of its region channels (all refused, or the bot was
+   * shutting down): taken back, so that it stands in nobody's way unseen (fix A5).
+   */
+  | {
+      kind: 'unposted';
+      channels: string[];
+      /** The hideout it had replaced, put back under a new id (fix R2). */
+      restored?: RocketReport;
+      /** The grunt it had replaced, which cannot come back: its message is gone (fix R2). */
+      lost?: RocketReport;
+    }
+  /** A hideout stands today: the member is asked first (design 5.2). */
+  | { kind: 'asks'; standing: RocketReport };
+
+/** What a choice of the lineups is reported as: its key, its name and catches as they are now. */
+export function rocketSubject(choice: RocketChoice): RocketSubject {
+  return { subjectKey: choice.key, rocket: { name: choice.name, catches: choice.catches } };
+}
+
+export interface RocketServiceOptions {
+  reports: Pick<StopReportService, 'reportRocket' | 'takeBack' | 'restore'>;
+  /** The grunts' messages; none in rehearsal mode, which posts nothing outside party posts. */
+  messages: Pick<GruntMessageService, 'post' | 'messagesOf'> | undefined;
+  regions: { all(): readonly Region[] };
+  /** The row of a server in `Guild` (its regions name it so), by its snowflake. */
+  guilds: { idFor(serverId: string): Promise<number | undefined> };
+  /** Told of every report that is news, once its messages are posted. */
+  notify?: { rocketReported(news: RocketNews): void };
+  log: Logger;
+}
+
+/**
+ * Reporting Team GO Rocket (plan 8R-2; design 5.2), the one way to it for `/rocket` (and the map
+ * of plan 8R-3): the report decided and kept (`StopReportService.reportRocket`), then a grunt's
+ * message posted in each region channel whose outline holds the stop (`GruntMessageService`;
+ * none in rehearsal mode), then the notifier told, so that a DM can link to the message.
+ */
+export class RocketService {
+  constructor(private readonly options: RocketServiceOptions) {}
+
+  /** The region channels of a server whose outlines hold a stop. */
+  async channelsAt(serverId: string, stop: Pick<ReportedStop, 'lat' | 'lon'>): Promise<string[]> {
+    const row = await this.options.guilds.idFor(serverId);
+    if (row === undefined) return [];
+    return regionsAtPoint(this.options.regions.all(), row, stop).map((region) => region.channelId);
+  }
+
+  /**
+   * Reports who of Team GO Rocket a member met at a stop (`replacing`: the hideout the member said
+   * Replace to). Throws only what storing throws, before anything is posted (fix A1): a region
+   * channel where the message fails is passed over (`GruntMessageService.post` never rejects) and
+   * the notifier is told of the channels it was posted in (all of them only in rehearsal mode and
+   * for a hideout; fix R3). Outside rehearsal mode a grunt posted in none of the region channels
+   * of its stop is taken back (`unposted`, fix A5): unseen, it would only answer "Already
+   * reported" without a link for half an hour; a hideout it replaced is put back, a grunt it
+   * replaced is named as lost (fix R2).
+   */
+  async report(input: {
+    serverId: string;
+    stop: ReportedStop;
+    subject: RocketSubject;
+    reporter: Reporter;
+    replacing?: number;
+  }): Promise<RocketReported> {
+    const { messages, notify, log } = this.options;
+    const outcome = await this.options.reports.reportRocket(input);
+    if (outcome.kind === 'asks') return outcome;
+    if (outcome.kind === 'already') {
+      const posted = await (messages?.messagesOf(outcome.standing.id) ?? Promise.resolve([])).catch(
+        (err: unknown) => {
+          log.warn({ err, report: outcome.standing.id }, 'could not find a grunt’s messages');
+          return [];
+        },
+      );
+      return { ...outcome, posted };
+    }
+    const { report } = outcome;
+    const grunt = !isHideoutReport(report);
+    let channels: string[];
+    try {
+      channels = await this.channelsAt(input.serverId, report.stop);
+    } catch (err) {
+      // Nothing is posted yet: the report goes back (and a hideout it replaced comes back), and
+      // the failure is the caller's.
+      await this.undo(report, outcome.replaced);
+      throw err;
+    }
+    const posted = grunt && messages ? await messages.post(report, channels) : [];
+    if (grunt && messages && channels.length > 0 && posted.length === 0) {
+      return { kind: 'unposted', channels, ...(await this.undo(report, outcome.replaced)) };
+    }
+    // Outside rehearsal mode a grunt's DMs name the channels it was posted in (fix R3).
+    const told = grunt && messages ? posted.map((one) => one.channelId) : channels;
+    if (outcome.news) {
+      try {
+        notify?.rocketReported({
+          serverId: input.serverId,
+          report,
+          channels: told.map((channelId) => ({
+            channelId,
+            messageId: posted.find((one) => one.channelId === channelId)?.messageId,
+          })),
+        });
+      } catch (err) {
+        log.error({ err, guild: input.serverId }, 'could not tell of a Rocket report');
+      }
+    }
+    return { kind: 'reported', report, replaced: outcome.replaced, channels, posted };
+  }
+
+  /**
+   * Undoes a grunt that shows nowhere (fix R2): takes it back, and puts back a hideout it replaced
+   * while that stood; a grunt it replaced cannot come back (its message was deleted), and is
+   * named as lost.
+   */
+  private async undo(
+    report: RocketReport,
+    replaced: RocketReport | undefined,
+  ): Promise<{ restored?: RocketReport; lost?: RocketReport }> {
+    if (replaced && replaced.endsAt > report.madeAt && isHideoutReport(replaced)) {
+      // The hideout takes the grunt's place in one step (fix S4).
+      try {
+        const restored = await this.options.reports.restore(replaced, report);
+        if (restored) return { restored };
+      } catch (err) {
+        this.options.log.warn({ err, report: replaced.id }, 'could not put a hideout back');
+      }
+      await this.takeBack(report);
+      return {};
+    }
+    await this.takeBack(report);
+    if (!replaced || replaced.endsAt <= report.madeAt) return {};
+    return { lost: replaced };
+  }
+
+  /** Takes a report back that shows nowhere; a failure is logged (its row ends with its time). */
+  private async takeBack(report: RocketReport): Promise<void> {
+    try {
+      await this.options.reports.takeBack(report.serverId, [report.id], report.reporter.id, true);
+    } catch (err) {
+      this.options.log.warn({ err, report: report.id }, 'could not take back a Rocket report');
+    }
+  }
+}
diff --git a/src/services/stop-reports.ts b/src/services/stop-reports.ts
index 50120d30e2a8cd805f3d4ecd3ed39f4654e5a2a3..5d8ee66d6417563271354d10fa17f5118b15ca03 100644
--- a/src/services/stop-reports.ts
+++ b/src/services/stop-reports.ts
@@ -351,6 +351,38 @@ export class StopReportService {
     return { removed, notYours };
   }
 
+  /**
+   * Puts a hideout back in the place of the grunt that replaced it, where that grunt could be
+   * posted nowhere (fixes R2, S4): the same subject, reporter, day and end under a new id, the
+   * grunt replaced in the same step (told as `ended`), unless the hideout's day has ended or
+   * another report than the grunt stands at the stop by now (then nothing comes back, and the
+   * caller takes the grunt back). The posts are drawn anew. Gives the report put back.
+   */
+  async restore(hideout: RocketReport, grunt: RocketReport): Promise<RocketReport | undefined> {
+    const now = this.now();
+    if (hideout.endsAt <= now) return undefined;
+    const { id: _id, ...again } = hideout;
+    // In one step under the stop's lock (fix S4): the grunt's row becomes the hideout's, so there
+    // is no moment without a report; another report standing there is kept.
+    const outcome = await this.options.store.saveUnless(
+      again,
+      (standing) => standing.id !== grunt.id,
+      now,
+    );
+    if (!outcome.saved || !isRocketReport(outcome.report)) return undefined;
+    const { report } = outcome;
+    if (outcome.replaced) {
+      const gone = outcome.replaced;
+      this.tell((listener) => listener.ended?.([gone]));
+    }
+    this.tell((listener) => listener.changed?.(hideout.serverId, [report.stop]));
+    this.options.log.info(
+      { guild: hideout.serverId, report: report.id, who: report.subjectKey },
+      'a hideout put back',
+    );
+    return report;
+  }
+
   /** Forgets the reports that have ended; gives how many (the hourly upkeep, and at start). */
   sweep(): Promise<number> {
     return this.options.store.removeEnded(this.now());
diff --git a/test/support/rocket-store-cases.ts b/test/support/rocket-store-cases.ts
index 606c0fb1520fece0cea97ed4091a555fbb371db5..9d82dd9ffbfc1f24d11781e56cb78f00c3f7c374 100644
--- a/test/support/rocket-store-cases.ts
+++ b/test/support/rocket-store-cases.ts
@@ -1,4 +1,8 @@
 import { expect, it } from 'vitest';
+import type {
+  GruntMessageRow,
+  GruntMessageStorage,
+} from '../../src/db/repositories/grunt-message-repository.js';
 import type { RocketLineupStorage } from '../../src/db/repositories/rocket-lineup-repository.js';
 import type { RocketChoice } from '../../src/domain/rocket/lineups.js';
 
@@ -21,6 +25,48 @@ export function listedChoice(key: string, overrides: Partial<RocketChoice> = {})
   };
 }
 
+/** A grunt's message (`n` makes another), of report 1 unless said, due at 1,000 + n. */
+export function gruntRow(n: number, overrides: Partial<GruntMessageRow> = {}): GruntMessageRow {
+  return {
+    messageId: `30000000000000000${String(n)}`,
+    channelId: '400000000000000001',
+    serverId: '100000000000000001',
+    reportId: 1,
+    deleteAt: 1_000 + n,
+    ...overrides,
+  };
+}
+
+/** What the grunts' messages do, run against the repository and its twin in memory alike. */
+export function gruntMessageCases(made: () => Promise<GruntMessageStorage>): void {
+  it('keeps a message until it is forgotten, the one due first at the head', async () => {
+    const store = await made();
+    await store.add(gruntRow(2));
+    await store.add(gruntRow(1, { reportId: 2, channelId: '400000000000000002' }));
+    // Kept once.
+    await store.add(gruntRow(2));
+    expect(await store.all()).toEqual([
+      gruntRow(1, { reportId: 2, channelId: '400000000000000002' }),
+      gruntRow(2),
+    ]);
+    await store.remove(gruntRow(1).messageId);
+    await store.remove(gruntRow(1).messageId);
+    expect(await store.all()).toEqual([gruntRow(2)]);
+  });
+
+  it('gives the messages of a report', async () => {
+    const store = await made();
+    await store.add(gruntRow(1));
+    await store.add(gruntRow(2, { channelId: '400000000000000002' }));
+    await store.add(gruntRow(3, { reportId: 2 }));
+    expect(await store.ofReport(1)).toEqual([
+      gruntRow(1),
+      gruntRow(2, { channelId: '400000000000000002' }),
+    ]);
+    expect(await store.ofReport(9)).toEqual([]);
+  });
+}
+
 /** What the kept Rocket lineups do, run against the repository and its twin in memory alike. */
 export function rocketLineupCases(made: () => Promise<RocketLineupStorage>): void {
   it('has no list before the first read', async () => {
diff --git a/test/support/rocket-store.test.ts b/test/support/rocket-store.test.ts
index 38bcfd65218dfea787a94e8340b254f0d1808434..63761a1972350106ed6c20ffe2ff0fdbcdf50dc2 100644
--- a/test/support/rocket-store.test.ts
+++ b/test/support/rocket-store.test.ts
@@ -1,6 +1,10 @@
 import { describe } from 'vitest';
-import { rocketLineupCases } from './rocket-store-cases.js';
-import { MemoryRocketLineups } from './rocket-store.js';
+import { gruntMessageCases, rocketLineupCases } from './rocket-store-cases.js';
+import { MemoryGruntMessages, MemoryRocketLineups } from './rocket-store.js';
+
+describe('MemoryGruntMessages', () => {
+  gruntMessageCases(() => Promise.resolve(new MemoryGruntMessages()));
+});
 
 describe('MemoryRocketLineups', () => {
   rocketLineupCases(() => Promise.resolve(new MemoryRocketLineups()));
diff --git a/test/support/rocket-store.ts b/test/support/rocket-store.ts
index 1e9124d94cb7bad50b59996a0b657c8e627408f0..908f7a10d41db5eb88ad3c985282bd6c9772c928 100644
--- a/test/support/rocket-store.ts
+++ b/test/support/rocket-store.ts
@@ -1,9 +1,62 @@
+import type {
+  GruntMessageRow,
+  GruntMessageStorage,
+} from '../../src/db/repositories/grunt-message-repository.js';
 import type {
   KeptRocketList,
   RocketLineupStorage,
 } from '../../src/db/repositories/rocket-lineup-repository.js';
 import type { RocketChoice } from '../../src/domain/rocket/lineups.js';
 
+/**
+ * The grunts' messages in memory (`GruntMessageStorage`), the twin of `GruntMessageRepository`;
+ * `failing` per method. Like a real query, an answer never comes in the same turn.
+ */
+export class MemoryGruntMessages implements GruntMessageStorage {
+  readonly rows: GruntMessageRow[] = [];
+  readonly failing = new Map<keyof GruntMessageStorage, Error>();
+
+  private attempt<T>(method: keyof GruntMessageStorage, work: () => T): Promise<T> {
+    return new Promise((resolve, reject) => {
+      setImmediate(() => {
+        const err = this.failing.get(method);
+        if (err) reject(err);
+        else resolve(work());
+      });
+    });
+  }
+
+  add(row: GruntMessageRow): Promise<void> {
+    return this.attempt('add', () => {
+      if (!this.rows.some((one) => one.messageId === row.messageId)) this.rows.push({ ...row });
+    });
+  }
+
+  remove(messageId: string): Promise<void> {
+    return this.attempt('remove', () => {
+      const index = this.rows.findIndex((one) => one.messageId === messageId);
+      if (index >= 0) this.rows.splice(index, 1);
+    });
+  }
+
+  all(): Promise<GruntMessageRow[]> {
+    return this.attempt('all', () =>
+      this.rows
+        .map((row) => ({ ...row }))
+        .sort((a, b) => a.deleteAt - b.deleteAt || a.messageId.localeCompare(b.messageId)),
+    );
+  }
+
+  ofReport(reportId: number): Promise<GruntMessageRow[]> {
+    return this.attempt('ofReport', () =>
+      this.rows
+        .filter((row) => row.reportId === reportId)
+        .map((row) => ({ ...row }))
+        .sort((a, b) => a.messageId.localeCompare(b.messageId)),
+    );
+  }
+}
+
 /** The kept Rocket lineups in memory (`RocketLineupStorage`), the twin of `RocketLineupRepository`. */
 export class MemoryRocketLineups implements RocketLineupStorage {
   readonly rows = new Map<
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 6b5a953233ff38beda1d71204d85e9b00c31793c..feb041fab54f41f02436ce8ef9c961682653bfd8 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -14,6 +14,7 @@ import { PineStopService } from '../../src/services/pine-stops.js';
 import { WayspotDirectory } from '../../src/services/wayspot-directory.js';
 import { MemoryPineStops } from './pine-stops.js';
 import { StopReportService } from '../../src/services/stop-reports.js';
+import { RocketService } from '../../src/services/rocket-reports.js';
 import { MemoryStopReports } from './stop-reports.js';
 import type { RaidChangeService } from '../../src/services/raid-change-service.js';
 import type { RegionAdminService } from '../../src/services/region-admin-service.js';
@@ -116,6 +117,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     rocketLineups: rocketLineupsFixture(),
     // Over memory and the context's own research events (below), unless a test passes its own.
     stopReports: undefined as unknown as StopReportService,
+    // Over the context's reports (below), unless a test passes its own.
+    rocket: undefined as unknown as RocketService,
     gyms: gymsFixture(),
     gymAdmin: unavailable<GymAdminService>(
       'gymAdmin',
@@ -287,6 +290,17 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       log,
     });
   }
+  if (overrides.rocket === undefined) {
+    // Over the context's reports, posting no grunt's message (as in rehearsal mode) unless a
+    // test passes its own over a `GruntMessageService` (`rocket.test.ts`).
+    (ctx as { rocket: RocketService }).rocket = new RocketService({
+      reports: ctx.stopReports,
+      messages: undefined,
+      regions: ctx.regions,
+      guilds: ctx.guilds,
+      log,
+    });
+  }
   if (overrides.pineStops === undefined) {
     const { wayspots } = ctx;
     (ctx as { pineStops: PineStopService }).pineStops = new PineStopService({
````

### Task 5: 8R-2 task 5: /rocket report and /rocket remove, the hideout dialog

Prototype commit: `3e403984eb03891cca0f9f958bd459f619239240`

/rocket report who: stop: (and remove stop:, shaped as /research), offered
on every server. who is a choice of the lineups (grunt:water ... giovanni,
each with its catches in short, found by its name or what can be caught;
Giovanni's choice and the help say to report him only once sure, and a
decoy as Decoy grunt), or a name typed in full (water, arlo); a key gone from
the lineups is "The lineups just changed: pick again."; before any lineups
were read every who is offered without catches. The stop as /research reads
it (a choice, a name, the nearest stop to a maps link), refused in Rocket's
words. The guard reads all of it and what stands at the stop, so a refusal
does not count; the throttle is settings.rocket.throttle in a window of its
own.

A grunt where a hideout was reported today opens a dialog (no deferral
before it, the slow-read rule): "Arlo was reported here today, and a
hideout keeps grunts away all day. Replace Arlo's report with the
Water-type grunt?" Its Submit (rocket:<token>:replace) carries on the use
and reports with that hideout's id; another hideout meanwhile reports
nothing and gives the use back. The same grunt standing answers "Already
reported" with a link to its message and posts nothing.

The answer (for the reporter alone): who at which stop, what can be caught,
what it replaced, where it shows (a grunt's channels and when it goes, a
hideout's pinned posts until midnight, in rehearsal mode only until when)
and Take back (rocket:<id>:back). /rocket remove takes back one's own, any
for staff; a grunt's message goes with it.

**Files:**

```
 src/commands/index.ts                   |   2 +
 src/commands/research/research-input.ts |   6 +-
 src/commands/research/research.ts       |   4 +-
 src/commands/rocket/rocket-input.ts     | 157 +++++++++++++++++++++++
 src/commands/rocket/rocket.test.ts      | 498 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/rocket/rocket.ts           | 414 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/components/index.ts                 |   2 +
 src/render/rocket.ts                    | 124 +++++++++++++++++-
 8 files changed, 1200 insertions(+), 7 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/rocket/rocket.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3e403984eb03891cca0f9f958bd459f619239240 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-2 task 5: /rocket report and /rocket remove, the hideout dialog`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/index.ts b/src/commands/index.ts
index 960325186167f163adbac427a31b97c2facc645a..ddc81f602ec384dbcb31c63bf7e5b7cdd6f4da69 100644
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -7,6 +7,7 @@ import { meetup } from './meetups/meetup.js';
 import { places } from './meetups/places.js';
 import { pokestop } from './stops/pokestop.js';
 import { research } from './research/research.js';
+import { rocket } from './rocket/rocket.js';
 import {
   coming,
   done,
@@ -112,6 +113,7 @@ export const commands: readonly CommandModule[] = [
   untargetAll,
   wildCommand,
   research,
+  rocket,
   iam,
   iamnot,
   friendCode,
diff --git a/src/commands/research/research-input.ts b/src/commands/research/research-input.ts
index d8ea6ea109494b74c4101bc2695e636c779ceaa6..bcec5d5d412b330d554089f8b3a3d2a49411f7e5 100644
--- a/src/commands/research/research-input.ts
+++ b/src/commands/research/research-input.ts
@@ -96,15 +96,17 @@ export async function namedStop(
   interaction: LocatedInteraction,
   ctx: AppContext,
   value: string,
+  /** What a place of another kind is refused with (plan 8R-2: `/rocket`'s words). */
+  refusal = NOT_A_STOP,
 ): Promise<ReportedStop> {
   const place = await namedPlace(
     interaction,
     ctx,
     value,
     'or paste a link to it from a maps app',
-    STOPS_ONLY,
+    refusal === NOT_A_STOP ? STOPS_ONLY : { kinds: ['stop'], refusal },
   );
-  if (place === undefined) throw new UserError(NOT_A_STOP);
+  if (place === undefined) throw new UserError(refusal);
   if (place.kind !== 'pin') return reportedStop(place);
   const row = await ctx.guilds.idFor(guildIdOf(interaction));
   const near = row === undefined ? undefined : ctx.placeFinder.nearestStop(row, place);
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index 3a4778a89b8a59c1f8df95341119abf50a1195a6..04613f3e1982d5dbdf6fdfad9f9562b6102872d5 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -67,8 +67,8 @@ export const REPORT_CHANGED =
 /** Said to a member who would take back another's report. */
 export const NOT_YOUR_REPORT = 'Only the member who reported it, or staff, can take that back.';
 
-/** The reporter of a use, by name as shown (cut to what is kept). */
-function reporterOf(interaction: LocatedInteraction): Reporter {
+/** The reporter of a use, by name as shown (cut to what is kept; also `/rocket`'s). */
+export function reporterOf(interaction: LocatedInteraction): Reporter {
   return {
     id: interaction.user.id,
     name: cutWhole(memberInfo(interaction).name ?? interaction.user.username, 100),
diff --git a/src/commands/rocket/rocket-input.ts b/src/commands/rocket/rocket-input.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0bd6aa1e1a176340ab41830bea44614f05f486a3
--- /dev/null
+++ b/src/commands/rocket/rocket-input.ts
@@ -0,0 +1,157 @@
+import type { AppContext } from '../../app-context.js';
+import type { Settings } from '../../config/settings.js';
+import { UserError } from '../../discord/errors.js';
+import { variedThrottleKey } from '../../discord/router.js';
+import type { Throttle } from '../../discord/throttle.js';
+import {
+  catchesInShort,
+  LEADERS,
+  parseRocketKey,
+  rocketKey,
+  rocketName,
+  type RocketChoice,
+  type RocketWho,
+} from '../../domain/rocket/lineups.js';
+import { POKEMON_TYPES } from '../../domain/pogo/types.js';
+import { searchText, searchTokens } from '../../domain/search/text.js';
+import { plain, truncate } from '../../render/text.js';
+import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
+
+/*
+ * What `/rocket report` reads (plan 8R-2; design 5.2): who was met (a choice of the lineups:
+ * `grunt:water`, or its name typed in full) and the stop.
+ */
+
+/** The name `/rocket report` is used and counted under (the router's key of a subcommand). */
+export const ROCKET_REPORT = 'rocket report';
+
+/** Where `/rocket` works, said wherever it does not. */
+export const ROCKET_FROM_A_REGION =
+  'Report Team GO Rocket from the channel of a region, its forum or a post there.';
+
+/** Said of a choice gone from the lineups since it was offered. */
+export const LINEUPS_CHANGED = 'The lineups just changed: pick again.';
+
+/** Said of a place of another kind than a PokéStop. */
+export const NOT_A_ROCKET_STOP =
+  'Team GO Rocket is met at PokéStops: pick a PokéStop from the list that appears while you type.';
+
+/** `/rocket report`'s limit, of the settings (10 reports in 30 minutes unless set). */
+export function rocketThrottle(settings: Pick<Settings, 'rocket'>): Throttle {
+  const { uses, minutes } = settings.rocket.throttle;
+  return { uses, perSeconds: minutes * 60 };
+}
+
+/**
+ * The window `/rocket report` counts in, for the dialog's Submit that carries its use on: its
+ * throttle is a function of the settings, so its window is the varied one (design 9.12: a window
+ * of its own, not `/research`'s).
+ */
+export function rocketWindow(settings: Pick<Settings, 'rocket'>): string {
+  return variedThrottleKey(ROCKET_REPORT, rocketThrottle(settings));
+}
+
+/** What a choice of Giovanni says (design 5.2: report him only once sure it is him). */
+const GIOVANNI_NOTE = ' (only when sure it is him)';
+
+/** A choice as the list offers it: `Water-type grunt · Mudkip, Tentacool, Krabby +2`. */
+export function whoChoice(choice: RocketChoice): Choice {
+  const catches = catchesInShort(choice.catches);
+  const name = `${choice.name}${choice.key === 'giovanni' ? GIOVANNI_NOTE : ''}`;
+  return {
+    name: truncate(catches === '' ? name : `${name} · ${catches}`, CHOICE_NAME),
+    value: choice.key,
+  };
+}
+
+/** Whether every typed word begins a word of a text. */
+function hasWords(text: string, words: readonly string[]): boolean {
+  const own = searchTokens(text);
+  return words.every((word) => own.some((one) => one.startsWith(word)));
+}
+
+/**
+ * Every who of Team GO Rocket, with no catches: what `/rocket` offers while no lineups were ever
+ * read (a new install without the network), so that a report can still be made.
+ */
+function bareChoices(): RocketChoice[] {
+  const every: RocketWho[] = [
+    // In the order the lineups' choices come: grunt types by name first.
+    ...[...POKEMON_TYPES].sort().map((type): RocketWho => ({ kind: 'grunt', type })),
+    { kind: 'grunt', type: null },
+    { kind: 'decoy' },
+    ...LEADERS.map((leader): RocketWho => ({ kind: 'leader', leader })),
+    { kind: 'giovanni' },
+  ];
+  return every.map((who) => ({ key: rocketKey(who), name: rocketName(who), catches: [] }));
+}
+
+/**
+ * The choices of now (fix B5): the grunts of the lineups (every grunt type while there are none),
+ * then the hideouts, the decoy, Cliff, Arlo, Sierra and Giovanni, always, with their catches
+ * where the lineups have them. Only a grunt type is ever missing.
+ */
+export function rocketChoices(ctx: Pick<AppContext, 'rocketLineups'>): readonly RocketChoice[] {
+  const listed = ctx.rocketLineups.choices();
+  const bare = bareChoices();
+  const isGrunt = (choice: RocketChoice): boolean => choice.key.startsWith('grunt:');
+  const grunts = listed.length > 0 ? listed.filter(isGrunt) : bare.filter(isGrunt);
+  const hideouts = bare
+    .filter((choice) => !isGrunt(choice))
+    .map((choice) => listed.find((one) => one.key === choice.key) ?? choice);
+  return [...grunts, ...hideouts];
+}
+
+/**
+ * The choices of the `who` option: those whose name has every typed word (as the beginning of a
+ * word), then those that have them among their catches' names (`noibat` finds the Dragon-type
+ * grunt), each in the list's order.
+ */
+export function whoChoices(ctx: Pick<AppContext, 'rocketLineups'>, typed: string): Choice[] {
+  const words = searchTokens(typed);
+  const choices = rocketChoices(ctx);
+  const byName = choices.filter((choice) => hasWords(choice.name, words));
+  const byCatch = choices.filter(
+    (choice) =>
+      !byName.includes(choice) && hasWords(choice.catches.map((one) => one.name).join(' '), words),
+  );
+  return [...byName, ...byCatch].slice(0, MAX_CHOICES).map(whoChoice);
+}
+
+/** The names a choice is known by, typed: its own, and a grunt's type alone or with `grunt`. */
+function namesOf(choice: RocketChoice): string[] {
+  const who = parseRocketKey(choice.key);
+  const names = [choice.name];
+  if (who?.kind === 'grunt' && who.type !== null) {
+    names.push(who.type, `${who.type} grunt`, `${who.type} type grunt`);
+  }
+  if (who?.kind === 'grunt' && who.type === null) names.push('grunt', 'no type grunt');
+  if (who?.kind === 'decoy') names.push('decoy');
+  return names.map(searchText);
+}
+
+/**
+ * Who `who:` names (design 5.2): a choice of the list (its key; one no longer in the lineups is
+ * `LINEUPS_CHANGED`), or a name typed in full (`Water-type grunt`, `water`, `arlo`); refused
+ * otherwise, with what the list offers for the words.
+ */
+export function readWho(ctx: Pick<AppContext, 'rocketLineups'>, value: string): RocketChoice {
+  const text = value.trim();
+  const choices = rocketChoices(ctx);
+  if (parseRocketKey(text) !== undefined) {
+    const chosen = choices.find((choice) => choice.key === text);
+    if (!chosen) throw new UserError(LINEUPS_CHANGED);
+    return chosen;
+  }
+  const folded = searchText(text);
+  const named = choices.find((choice) => namesOf(choice).includes(folded));
+  if (named) return named;
+  const suggested = whoChoices(ctx, text)
+    .slice(0, 5)
+    .map((choice) => plain(choice.name.split(' · ')[0] ?? choice.name));
+  throw new UserError(
+    `I do not know "${plain(truncate(text, 80))}" in Team GO Rocket’s lineups. ` +
+      (suggested.length === 0 ? '' : `Did you mean ${suggested.join(', ')}? `) +
+      'Pick one from the list that appears while you type.',
+  );
+}
diff --git a/src/commands/rocket/rocket.test.ts b/src/commands/rocket/rocket.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5d2b528786b966f57f7fa262ffd07c7cb6525c24
--- /dev/null
+++ b/src/commands/rocket/rocket.test.ts
@@ -0,0 +1,498 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
+import { shownDialog, dialogText } from '../../../test/support/dialogs.js';
+import { FakePartyGateway } from '../../../test/support/fake-gateway.js';
+import { answerOf, buttonId, buttonsOf, said } from '../../../test/support/gym-commands.js';
+import {
+  fakeAutocomplete,
+  fakeButton,
+  fakeChatInput,
+  fakeModal,
+  FAKE_GUILD_ID,
+  type FakeInteraction,
+  type FakeOptions,
+} from '../../../test/support/fake-interactions.js';
+import { UNBOUNDED_CHANNEL, WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { textOf } from '../../../test/support/messages.js';
+import { feedChoice, rocketLineupsFixture } from '../../../test/support/rocket.js';
+import { MemoryGruntMessages } from '../../../test/support/rocket-store.js';
+import { MemoryStopReports } from '../../../test/support/stop-reports.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
+import { wayspotsWith } from '../../../test/support/wayspots.js';
+import type { WayspotRow } from '../../domain/wayspots/kept.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { Throttles } from '../../discord/throttle.js';
+import { GruntMessageService } from '../../services/grunt-messages.js';
+import { Rehearsal } from '../../services/rehearsal.js';
+import { RocketService } from '../../services/rocket-reports.js';
+import { StopReportService } from '../../services/stop-reports.js';
+import { NO_STOPS_HERE } from '../research/research-input.js';
+import { NOT_YOUR_REPORT } from '../research/research.js';
+import { HIDEOUT_CHANGED, NOTHING_AT_STOP, rocket, rocketControls } from './rocket.js';
+import { LINEUPS_CHANGED, NOT_A_ROCKET_STOP, ROCKET_FROM_A_REGION } from './rocket-input.js';
+
+const ASH = '200000000000000061';
+const MISTY = '200000000000000062';
+
+// Noon in Pittsburgh on 2026-10-22 (fix A2): a report never meets a real midnight.
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 22, 16) });
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+/** Stops in West, and a power spot. */
+const STOPS: WayspotRow[] = [
+  keptRow(1, { title: 'Yellow Mural', lat: 40.06, lon: -80.06, address: null }),
+  keptRow(2, { title: 'Paititi Inti', lat: 40.061, lon: -80.06, address: null }),
+  keptRow(5, { title: 'Library Garden', kind: 'powerspot', lat: 40.0502, lon: -80.0502 }),
+];
+
+async function setup(rows: readonly WayspotRow[] = STOPS) {
+  const { wayspots } = await wayspotsWith(rows);
+  const store = new MemoryStopReports();
+  const gateway = new FakePartyGateway();
+  const { ctx } = createTestContext({ wayspots });
+  const stopReports = new StopReportService({
+    store,
+    events: ctx.raidEvents,
+    zone: ctx.config.settings.timezone,
+    log: ctx.log,
+  });
+  const messages = new GruntMessageService({
+    gateway,
+    store: new MemoryGruntMessages(),
+    reports: stopReports,
+    log: ctx.log,
+    setTimer: () => () => undefined,
+  });
+  Object.assign(ctx, {
+    stopReports,
+    rocket: new RocketService({
+      reports: stopReports,
+      messages,
+      regions: ctx.regions,
+      guilds: ctx.guilds,
+      log: ctx.log,
+    }),
+  });
+  await ctx.placeFinder.built();
+  const throttles = new Throttles();
+  const router = new InteractionRouter(ctx, [rocket], [rocketControls], { throttles });
+  const as = (userId: string): FakeOptions => ({
+    userId,
+    displayName: userId === ASH ? 'Ash' : 'Misty',
+    channelId: WEST_CHANNEL,
+    guildId: FAKE_GUILD_ID,
+  });
+  const handled = async (interaction: FakeInteraction) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  return {
+    ctx,
+    store,
+    gateway,
+    messages,
+    report: (options: Record<string, string>, extra: FakeOptions = {}) =>
+      handled(
+        fakeChatInput({
+          commandName: 'rocket',
+          subcommand: 'report',
+          options,
+          ...as(ASH),
+          ...extra,
+        }),
+      ),
+    remove: (stop: string, extra: FakeOptions = {}) =>
+      handled(
+        fakeChatInput({
+          commandName: 'rocket',
+          subcommand: 'remove',
+          options: { stop },
+          ...as(ASH),
+          ...extra,
+        }),
+      ),
+    press: (customId: string, extra: FakeOptions = {}) =>
+      handled(
+        fakeButton({ customId, v2Message: true, ephemeralMessage: true, ...as(ASH), ...extra }),
+      ),
+    submit: (opener: FakeInteraction, extra: FakeOptions = {}) => {
+      const dialog = shownDialog(opener);
+      return handled(
+        fakeModal({
+          customId: dialog.custom_id,
+          form: dialog,
+          modalFromCommand: true,
+          ...as(ASH),
+          ...extra,
+        }),
+      );
+    },
+    typing: (focusedName: string, focused: string) =>
+      handled(
+        fakeAutocomplete({
+          commandName: 'rocket',
+          subcommand: 'report',
+          focusedName,
+          focused,
+          ...as(ASH),
+        }),
+      ),
+    as,
+  };
+}
+
+const stop = (n: number): string => `stop:${wayspotId(n)}`;
+const posted = (made: Awaited<ReturnType<typeof setup>>) =>
+  made.gateway.messagesIn(WEST_CHANNEL).map(({ message }) => textOf(message));
+
+describe('/rocket report', () => {
+  it('reports a grunt at a stop: its message in the region, the answer with Take back', async () => {
+    const made = await setup();
+    const answer = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
+    expect(said(answer)).toContain('### Team GO Rocket reported');
+    expect(said(answer)).toContain(
+      '**Water-type grunt** at **Yellow Mural** · catch one of Mudkip, Tentacool, Krabby, Magikarp, Feebas',
+    );
+    expect(said(answer)).toMatch(/Posted in <#100000000000000001>; it goes away <t:\d+:R>\./);
+    expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Take back']);
+    expect(posted(made)).toHaveLength(1);
+    expect(posted(made)[0]).toContain('### Water-type grunt');
+  });
+
+  it('answers the same grunt again as reported already, with a link, and posts nothing', async () => {
+    const made = await setup();
+    await made.report({ who: 'grunt:water', stop: stop(1) });
+    const answer = answerOf(await made.report({ who: 'water', stop: stop(1) }, made.as(MISTY)));
+    const [message] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(said(answer)).toContain('Already reported: a **Water-type grunt** at **Yellow Mural**');
+    expect(said(answer)).toContain(
+      `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/${message?.id ?? ''}`,
+    );
+    expect(posted(made)).toHaveLength(1);
+  });
+
+  it('replaces a grunt by another, its message deleted at once', async () => {
+    const made = await setup();
+    await made.report({ who: 'grunt:water', stop: stop(1) });
+    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
+    const answer = answerOf(await made.report({ who: 'grunt:fire', stop: stop(1) }));
+    await made.messages.flush();
+    expect(said(answer)).toContain('(was: Water-type grunt)');
+    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([first?.id]);
+  });
+
+  it('reports a hideout without a message, and asks before a grunt replaces it', async () => {
+    const made = await setup();
+    const arlo = answerOf(await made.report({ who: 'leader:arlo', stop: stop(1) }));
+    expect(said(arlo)).toContain('**Arlo** at **Yellow Mural** · catch Alolan Grimer');
+    expect(said(arlo)).toContain(
+      'In the pinned post "Today at the stops" of <#100000000000000001>, until midnight.',
+    );
+    expect(posted(made)).toEqual([]);
+    const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
+    const dialog = shownDialog(asking);
+    expect(dialog.title).toBe('Replace a hideout?');
+    expect(dialogText(dialog)).toBe(
+      'Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s ' +
+        'report with the Water-type grunt?\n\nSubmit replaces it.',
+    );
+    expect(posted(made)).toEqual([]);
+    const replaced = answerOf(await made.submit(asking));
+    expect(said(replaced)).toContain('**Water-type grunt** at **Yellow Mural**');
+    expect(said(replaced)).toContain('(was: Arlo)');
+    expect(posted(made)).toHaveLength(1);
+  });
+
+  it('reports nothing where another hideout came while the dialog was open', async () => {
+    const made = await setup();
+    await made.report({ who: 'leader:arlo', stop: stop(1) });
+    const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
+    await made.report({ who: 'giovanni', stop: stop(1) }, made.as(MISTY));
+    expect(said(answerOf(await made.submit(asking)))).toBe(HIDEOUT_CHANGED);
+    expect(posted(made)).toEqual([]);
+    expect([...made.store.rows.values()].map((one) => one.subjectKey)).toEqual(['giovanni']);
+  });
+
+  it('refuses before counting: no region, no stops, a choice gone from the lineups, no stop', async () => {
+    const made = await setup();
+    const refused = async (options: Record<string, string>, extra: FakeOptions = {}) =>
+      said(answerOf(await made.report(options, extra)));
+    expect(
+      await refused({ who: 'grunt:water', stop: stop(1) }, { channelId: UNBOUNDED_CHANNEL }),
+    ).toBe(ROCKET_FROM_A_REGION);
+    // The lineups were read anew meanwhile, without the water grunts.
+    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture([feedChoice('decoy')]) });
+    expect(await refused({ who: 'grunt:water', stop: stop(1) })).toBe(LINEUPS_CHANGED);
+    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture() });
+    expect(await refused({ who: 'grunt:water', stop: `powerspot:${wayspotId(5)}` })).toBe(
+      NOT_A_ROCKET_STOP,
+    );
+    expect(await refused({ who: 'someone', stop: stop(1) })).toMatch(
+      /^I do not know "someone" in Team GO Rocket/,
+    );
+    expect(made.store.rows.size).toBe(0);
+    // Nothing counted: the limit is all there.
+    for (let n = 0; n < 10; n++)
+      await made.report({ who: 'grunt:water', stop: stop(n % 2 ? 1 : 2) });
+    expect(said(answerOf(await made.report({ who: 'grunt:fire', stop: stop(1) })))).toMatch(
+      /^You can use \/rocket report again in/,
+    );
+
+    const empty = await setup([]);
+    expect(said(answerOf(await empty.report({ who: 'grunt:water', stop: 'mural' })))).toBe(
+      NO_STOPS_HERE,
+    );
+  });
+
+  it('offers who by name and by what can be caught, Giovanni’s with its warning', async () => {
+    const made = await setup();
+    const choices = async (typed: string) =>
+      (await made.typing('who', typed)).respond.mock.calls[0]?.[0] as {
+        name: string;
+        value: string;
+      }[];
+    expect(await choices('dratini')).toEqual([]);
+    expect((await choices('noibat')).map((one) => one.value)).toEqual(['grunt:dragon']);
+    expect(await choices('water')).toContainEqual({
+      name: 'Water-type grunt · Mudkip, Tentacool, Krabby +2',
+      value: 'grunt:water',
+    });
+    expect(await choices('giov')).toEqual([
+      { name: 'Giovanni (only when sure it is him) · Zekrom', value: 'giovanni' },
+    ]);
+    expect((await choices('')).map((one) => one.value).slice(0, 2)).toEqual([
+      'grunt:bug',
+      'grunt:dark',
+    ]);
+  });
+});
+
+describe('/rocket report’s throttle around the dialog (fix B7)', () => {
+  const refusedLater = /^You can use \/rocket report again in/;
+
+  it('gives the use back when another hideout came while the dialog was open', async () => {
+    const made = await setup();
+    made.ctx.config.settings.rocket.throttle.uses = 2;
+    try {
+      await made.report({ who: 'leader:arlo', stop: stop(1) });
+      const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
+      await made.report({ who: 'giovanni', stop: stop(1) }, made.as(MISTY));
+      expect(said(answerOf(await made.submit(asking)))).toBe(HIDEOUT_CHANGED);
+      // The second use went back: a third report is taken, a fourth is not.
+      expect(said(answerOf(await made.report({ who: 'grunt:fire', stop: stop(2) })))).toContain(
+        '### Team GO Rocket reported',
+      );
+      expect(said(answerOf(await made.report({ who: 'grunt:ice', stop: stop(2) })))).toMatch(
+        refusedLater,
+      );
+    } finally {
+      made.ctx.config.settings.rocket.throttle.uses = 10;
+    }
+  });
+
+  it('counts the dialog’s Submit as the command’s one use', async () => {
+    const made = await setup();
+    made.ctx.config.settings.rocket.throttle.uses = 2;
+    try {
+      await made.report({ who: 'leader:arlo', stop: stop(1) });
+      const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
+      expect(said(answerOf(await made.submit(asking)))).toContain('(was: Arlo)');
+      expect(said(answerOf(await made.report({ who: 'grunt:fire', stop: stop(2) })))).toMatch(
+        refusedLater,
+      );
+    } finally {
+      made.ctx.config.settings.rocket.throttle.uses = 10;
+    }
+  });
+
+  it('opens no dialog after a slow read, and gives the use back', async () => {
+    const made = await setup();
+    made.ctx.config.settings.rocket.throttle.uses = 2;
+    try {
+      await made.report({ who: 'leader:arlo', stop: stop(1) });
+      const late = await made.report(
+        { who: 'grunt:water', stop: stop(1) },
+        { createdTimestamp: Date.now() - DIALOG_READ_MS - 500 },
+      );
+      expect(late.showModal).not.toHaveBeenCalled();
+      expect(said(answerOf(late))).toBe(SLOW_READ);
+      expect(said(answerOf(await made.report({ who: 'grunt:fire', stop: stop(2) })))).toContain(
+        '### Team GO Rocket reported',
+      );
+    } finally {
+      made.ctx.config.settings.rocket.throttle.uses = 10;
+    }
+  });
+
+  it('refuses a grunt where a hideout came between its read and the report, giving the use back', async () => {
+    const made = await setup();
+    made.ctx.config.settings.rocket.throttle.uses = 2;
+    try {
+      await made.report({ who: 'leader:arlo', stop: stop(1) }, made.as(MISTY));
+      // The guard read the stop before Arlo was there.
+      made.ctx.stopReports.rocketAt = () => Promise.resolve(undefined);
+      const answer = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
+      expect(said(answer)).toBe(
+        '**Arlo** was reported at that PokéStop just now, and a hideout keeps grunts away all ' +
+          'day. Use `/rocket report` again to replace it.',
+      );
+      await made.report({ who: 'grunt:fire', stop: stop(2) });
+      expect(said(answerOf(await made.report({ who: 'grunt:ice', stop: stop(2) })))).toContain(
+        '### Team GO Rocket reported',
+      );
+    } finally {
+      made.ctx.config.settings.rocket.throttle.uses = 10;
+    }
+  });
+
+  it('says a grunt was posted nowhere, reports nothing, and gives the use back (fix A5)', async () => {
+    const made = await setup();
+    made.ctx.config.settings.rocket.throttle.uses = 1;
+    try {
+      made.gateway.failing.set('sendMessage', new Error('503 Service Unavailable'));
+      expect(said(answerOf(await made.report({ who: 'grunt:water', stop: stop(1) })))).toBe(
+        `I could not post the grunt in <#${WEST_CHANNEL}>, so nothing was reported. Try again ` +
+          'in a moment.',
+      );
+      expect(made.store.rows.size).toBe(0);
+      made.gateway.failing.delete('sendMessage');
+      expect(said(answerOf(await made.report({ who: 'grunt:water', stop: stop(1) })))).toContain(
+        '### Team GO Rocket reported',
+      );
+    } finally {
+      made.ctx.config.settings.rocket.throttle.uses = 10;
+    }
+  });
+});
+
+describe('a grunt posted nowhere in the place of another report (fix R2)', () => {
+  it('names the grunt it replaced, which is gone', async () => {
+    const made = await setup();
+    await made.report({ who: 'grunt:fire', stop: stop(1) }, made.as(MISTY));
+    made.gateway.failing.set('sendMessage', new Error('503 Service Unavailable'));
+    expect(said(answerOf(await made.report({ who: 'grunt:water', stop: stop(1) })))).toBe(
+      `I could not post the grunt in <#${WEST_CHANNEL}>, so nothing was reported, and the ` +
+        '**Fire-type grunt** reported before was taken off. Try again in a moment.',
+    );
+    expect(made.store.rows.size).toBe(0);
+  });
+
+  it('says the hideout it replaced stands again', async () => {
+    const made = await setup();
+    await made.report({ who: 'leader:arlo', stop: stop(1) }, made.as(MISTY));
+    const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
+    made.gateway.failing.set('sendMessage', new Error('503 Service Unavailable'));
+    expect(said(answerOf(await made.submit(asking)))).toBe(
+      `I could not post the grunt in <#${WEST_CHANNEL}>, so nothing was reported; **Arlo** ` +
+        'stands as before. Try again in a moment.',
+    );
+    expect([...made.store.rows.values()].map((one) => one.subjectKey)).toEqual(['leader:arlo']);
+  });
+});
+
+describe('Take back of a hideout put back under a new id (fix S3)', () => {
+  it('takes back the reporter’s same hideout at the same stop by its meaning', async () => {
+    const made = await setup();
+    const arlo = answerOf(await made.report({ who: 'leader:arlo', stop: stop(1) }, made.as(MISTY)));
+    const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
+    made.gateway.failing.set('sendMessage', new Error('503 Service Unavailable'));
+    await made.submit(asking);
+    made.gateway.failing.delete('sendMessage');
+    const [back] = [...made.store.rows.values()];
+    expect(back?.subjectKey).toBe('leader:arlo');
+    const taken = answerOf(await made.press(buttonId(arlo, 'Take back'), made.as(MISTY)));
+    expect(said(taken)).toBe('Took back **Arlo** at **Yellow Mural**.');
+    expect(made.store.rows.size).toBe(0);
+  });
+
+  it('takes back nothing of another member’s, or of another subject', async () => {
+    const made = await setup();
+    const arlo = answerOf(await made.report({ who: 'leader:arlo', stop: stop(1) }, made.as(MISTY)));
+    await made.report({ who: 'leader:cliff', stop: stop(1) }, made.as(MISTY));
+    const taken = answerOf(await made.press(buttonId(arlo, 'Take back'), made.as(MISTY)));
+    expect(said(taken)).toContain('There was nothing left to take back');
+    expect(made.store.rows.size).toBe(1);
+  });
+});
+
+describe('the hideouts in /rocket report’s choices (fix B5)', () => {
+  it('offers and takes the hideouts whatever the lineups list; a grunt type missing is changed', async () => {
+    const made = await setup();
+    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture([feedChoice('grunt:water')]) });
+    const choices = (await made.typing('who', '')).respond.mock.calls[0]?.[0] ?? [];
+    expect(choices.map((one) => one.value)).toEqual([
+      'grunt:water',
+      'decoy',
+      'leader:cliff',
+      'leader:arlo',
+      'leader:sierra',
+      'giovanni',
+    ]);
+    expect(said(answerOf(await made.report({ who: 'leader:cliff', stop: stop(1) })))).toContain(
+      '**Cliff** at **Yellow Mural**',
+    );
+    expect(said(answerOf(await made.report({ who: 'grunt:fire', stop: stop(2) })))).toBe(
+      LINEUPS_CHANGED,
+    );
+  });
+});
+
+describe('/rocket report before any lineups were read', () => {
+  it('offers every grunt type, the leaders and Giovanni, and reports them without catches', async () => {
+    const made = await setup();
+    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture([], undefined) });
+    const choices = (await made.typing('who', 'fai')).respond.mock.calls[0]?.[0] as {
+      name: string;
+      value: string;
+    }[];
+    expect(choices).toEqual([{ name: 'Fairy-type grunt', value: 'grunt:fairy' }]);
+    const answer = answerOf(await made.report({ who: 'sierra', stop: stop(1) }));
+    expect(said(answer)).toContain('**Sierra** at **Yellow Mural**\n');
+  });
+});
+
+describe('the Take back of /rocket report’s answer and /rocket remove', () => {
+  it('takes back the report of the answer, its message deleted', async () => {
+    const made = await setup();
+    const answer = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
+    const taken = answerOf(await made.press(buttonId(answer, 'Take back')));
+    await made.messages.flush();
+    expect(said(taken)).toBe('Took back **Water-type grunt** at **Yellow Mural**.');
+    expect(made.store.rows.size).toBe(0);
+    expect(made.gateway.deleted).toHaveLength(1);
+  });
+
+  it('takes back one’s own report at a stop, another’s only as staff', async () => {
+    const made = await setup();
+    await made.report({ who: 'leader:cliff', stop: stop(1) });
+    expect(said(answerOf(await made.remove(stop(1), made.as(MISTY))))).toBe(NOT_YOUR_REPORT);
+    expect(
+      said(answerOf(await made.remove(stop(1), { ...made.as(MISTY), roleNames: ['Moderator'] }))),
+    ).toBe('Took back **Cliff** at **Yellow Mural**.');
+    expect(said(answerOf(await made.remove(stop(1))))).toBe(NOTHING_AT_STOP);
+  });
+});
+
+describe('/rocket in rehearsal mode', () => {
+  it('posts no message and names no post: the report stands for its time', async () => {
+    const made = await setup();
+    Object.assign(made.ctx, {
+      rehearsal: new Rehearsal({ allowlist: [ASH], regions: ['west'], staffRoles: [] }),
+      rocket: new RocketService({
+        reports: made.ctx.stopReports,
+        messages: undefined,
+        regions: made.ctx.regions,
+        guilds: made.ctx.guilds,
+        log: made.ctx.log,
+      }),
+    });
+    const answer = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
+    expect(said(answer)).toMatch(/It stands until <t:\d+:t> \(rehearsal mode posts nothing\)\./);
+    expect(posted(made)).toEqual([]);
+  });
+});
diff --git a/src/commands/rocket/rocket.ts b/src/commands/rocket/rocket.ts
new file mode 100644
index 0000000000000000000000000000000000000000..248af487044553def587806020b2c1360a355742
--- /dev/null
+++ b/src/commands/rocket/rocket.ts
@@ -0,0 +1,414 @@
+import {
+  SlashCommandBuilder,
+  SlashCommandSubcommandBuilder,
+  type ChatInputCommandInteraction,
+  type ModalSubmitInteraction,
+  type SlashCommandStringOption,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { ComponentHandler, Guard } from '../../discord/command.js';
+import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
+import { deferSubmit, dialog, readInTime } from '../../discord/dialog.js';
+import { UserError } from '../../discord/errors.js';
+import { guildIdOf, isStaff, regionChannelOf, requireGuild } from '../../discord/guards.js';
+import { answer, showInPlace, v2Answer } from '../../discord/late-reply.js';
+import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
+import { MEMBER_WRITE_THROTTLE, type Throttle } from '../../discord/throttle.js';
+import { isHideout, parseRocketKey, type RocketChoice } from '../../domain/rocket/lineups.js';
+import { rocketDay } from '../../domain/rocket/reports.js';
+import type { ReportedStop, RocketReport } from '../../domain/stops/report.js';
+import { postLink } from '../../render/notify-dm.js';
+import { periodEndWords, reportSubject, stopLine } from '../../render/research.js';
+import {
+  alreadyReported,
+  ROCKET_ACTIONS,
+  ROCKET_COLOUR,
+  ROCKET_KIND,
+  rocketAnswer,
+} from '../../render/rocket.js';
+import { plain } from '../../render/text.js';
+import { textMessage } from '../../render/v2.js';
+import { PendingRequests } from '../../services/pending-requests.js';
+import { rocketSubject } from '../../services/rocket-reports.js';
+import { isHideoutReport } from '../../services/stop-reports.js';
+import { MAX_PLACE_TEXT, nearChoices } from '../place-option.js';
+import { NOT_YOUR_REPORT, REPORT_CHANGED, reporterOf } from '../research/research.js';
+import { namedStop, NO_STOPS_HERE } from '../research/research-input.js';
+import {
+  NOT_A_ROCKET_STOP,
+  readWho,
+  ROCKET_FROM_A_REGION,
+  rocketThrottle,
+  rocketWindow,
+  whoChoices,
+} from './rocket-input.js';
+
+/*
+ * `/rocket` (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.2): Team GO Rocket at
+ * PokéStops, offered on every server (Matt's answer 7). `report who: stop:` reports a grunt (a
+ * message in the region channels for half an hour) or a hideout (the pinned posts, until
+ * midnight), one Rocket report per stop and day; a grunt where a hideout stands asks first, in a
+ * dialog. `remove stop:` takes back the stop's report: one's own, any for staff.
+ */
+
+/** Said where no Rocket report stands at a stop. */
+export const NOTHING_AT_STOP = 'No Team GO Rocket is reported at that PokéStop now.';
+
+/** Said at the dialog's Submit where the hideout it asked about is no longer what stands. */
+export const HIDEOUT_CHANGED =
+  'The report at that PokéStop changed while I asked: nothing was reported. Look again with ' +
+  '`/rocket report`.';
+
+/** What a use's guard read: who, where, and what stands there (a hideout asks first). */
+interface RocketAsk {
+  choice: RocketChoice;
+  stop: ReportedStop;
+  /** The hideout that stands at the stop today, which a grunt asks about first. */
+  hideout: RocketReport | undefined;
+}
+
+/** A question waiting for its Submit: the use it carries on, counted when and where. */
+interface WaitingAsk extends RocketAsk {
+  hideout: RocketReport;
+  countedAt: number;
+  throttle: Throttle;
+  window: string;
+}
+
+/** What each use's guard read: the command takes it (one reading in all). */
+const asked = new WeakMap<ChatInputCommandInteraction, RocketAsk>();
+
+/** The reports that wait for the dialog's Submit. */
+const pending = new PendingRequests<WaitingAsk>();
+
+/**
+ * Refuses what can be known before anything is reported, so that it does not count: no region
+ * here, no stops known, who and the stop (`readWho`, `namedStop`); and reads what stands at the
+ * stop, so that a grunt where a hideout stands opens the dialog (no deferral before it).
+ */
+const requireRocketReport: Guard = async (interaction, ctx) => {
+  if (regionChannelOf(interaction, ctx) === undefined) throw new UserError(ROCKET_FROM_A_REGION);
+  const row = await ctx.guilds.idFor(guildIdOf(interaction));
+  if (row === undefined || !ctx.placeFinder.hasStops(row)) throw new UserError(NO_STOPS_HERE);
+  if (!interaction.isChatInputCommand()) return;
+  const choice = readWho(ctx, interaction.options.getString('who', true));
+  const stop = await namedStop(
+    interaction,
+    ctx,
+    interaction.options.getString('stop', true),
+    NOT_A_ROCKET_STOP,
+  );
+  const who = parseRocketKey(choice.key);
+  const standing = await ctx.stopReports.rocketAt(guildIdOf(interaction), stop.key);
+  const hideout =
+    who !== undefined && !isHideout(who) && standing && isHideoutReport(standing)
+      ? standing
+      : undefined;
+  asked.set(interaction, { choice, stop, hideout });
+};
+
+/** The dialog that asks before a grunt replaces a hideout (design 5.2, 9.4). */
+function replaceDialog(token: string, ask: WaitingAsk) {
+  const there = plain(ask.hideout.rocket.name);
+  return dialog({
+    customId: encodeCustomId({ kind: ROCKET_KIND, id: token, action: ROCKET_ACTIONS.replace }),
+    title: 'Replace a hideout?',
+    text:
+      `${there} was reported here today, and a hideout keeps grunts away all day. Replace ` +
+      `${there}’s report with the ${plain(ask.choice.name)}?\n\nSubmit replaces it.`,
+  });
+}
+
+/**
+ * Reports as the member and answers (`answer`: directly, or the acknowledgement's edit). A
+ * hideout that came between the read and the report is none of the member's doing: the use goes
+ * back.
+ */
+async function report(
+  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
+  ctx: AppContext,
+  ask: RocketAsk,
+  replacing: number | undefined,
+): Promise<void> {
+  const serverId = guildIdOf(interaction);
+  const outcome = await ctx.rocket.report({
+    serverId,
+    stop: ask.stop,
+    subject: rocketSubject(ask.choice),
+    reporter: reporterOf(interaction),
+    ...(replacing === undefined ? {} : { replacing }),
+  });
+  if (outcome.kind === 'asks') {
+    throw new UserError(
+      replacing === undefined
+        ? `**${plain(outcome.standing.rocket.name)}** was reported at that PokéStop just now, ` +
+            'and a hideout keeps grunts away all day. Use `/rocket report` again to replace it.'
+        : HIDEOUT_CHANGED,
+      { givesBack: true },
+    );
+  }
+  if (outcome.kind === 'unposted') {
+    // Taken back by the service (fix A5): none of the member's doing. What it had replaced: a
+    // hideout is back, a grunt is gone for good (fix R2).
+    const before = outcome.restored
+      ? `; **${plain(outcome.restored.rocket.name)}** stands as before`
+      : outcome.lost
+        ? `, and the **${plain(outcome.lost.rocket.name)}** reported before was taken off`
+        : '';
+    throw new UserError(
+      `I could not post the grunt in ${outcome.channels.map((id) => `<#${id}>`).join(', ')}, ` +
+        `so nothing was reported${before}. Try again in a moment.`,
+      { givesBack: true },
+    );
+  }
+  if (outcome.kind === 'already') {
+    const [message] = outcome.posted;
+    const link =
+      message === undefined ? undefined : postLink(serverId, message.channelId, message.messageId);
+    await answer(interaction, { content: alreadyReported(outcome.standing, link) });
+    return;
+  }
+  const hideout = isHideoutReport(outcome.report);
+  await answer(
+    interaction,
+    v2Answer(
+      rocketAnswer({
+        report: outcome.report,
+        replaced: outcome.replaced,
+        hideout,
+        channels: outcome.channels,
+        posted: outcome.posted,
+        rehearsal: ctx.rehearsal !== undefined,
+        until: periodEndWords(outcome.report.endsAt, Date.now(), ctx.config.settings.timezone),
+      }),
+    ),
+  );
+}
+
+/**
+ * The report a Take back means where its id is gone (fix S3): the presser's own Rocket report of
+ * the same who (`args`: the stop's key and the `rocketKey` with `.` for `:`) at the same stop,
+ * standing now in today's period; undefined for none, or a button without them.
+ */
+async function sameReportNow(
+  ctx: AppContext,
+  serverId: string,
+  args: readonly string[],
+  memberId: string,
+): Promise<RocketReport | undefined> {
+  const [stopKey, who] = args;
+  if (stopKey === undefined || who === undefined) return undefined;
+  const standing = await ctx.stopReports.rocketAt(serverId, stopKey);
+  const today = rocketDay(Date.now(), ctx.config.settings.timezone).key;
+  return standing?.subjectKey === who.replace('.', ':') &&
+    standing.reporter.id === memberId &&
+    standing.periodKey === today
+    ? standing
+    : undefined;
+}
+
+/** The `stop` option of both subcommands. */
+const stopOption = (option: SlashCommandStringOption) =>
+  option
+    .setName('stop')
+    .setDescription('The PokéStop: pick from the list, or paste a maps link')
+    .setRequired(true)
+    .setMaxLength(MAX_PLACE_TEXT)
+    .setAutocomplete(true);
+
+/**
+ * `/rocket report who: stop:` (design 5.2): a grunt (its message in the region channels of the
+ * stop for `settings.rocket.gruntMinutes`) or a hideout (the pinned post, until midnight), in the
+ * place of the stop's Rocket report of the day; the same grunt again is reported already; a grunt
+ * where a hideout stands asks first. Its own throttle window (design 9.12).
+ */
+const reportRocket: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName('report')
+    .setDescription('Report a Team GO Rocket grunt, leader or Giovanni at a PokéStop')
+    .addStringOption((option) =>
+      option
+        .setName('who')
+        .setDescription('Who you met: pick from the list (Giovanni only once you are sure)')
+        .setRequired(true)
+        .setMaxLength(100)
+        .setAutocomplete(true),
+    )
+    .addStringOption(stopOption),
+  help: {
+    details: (settings) =>
+      'Reports who of Team GO Rocket is at a PokéStop. Pick them from the list that appears ' +
+      'while you type (it finds them by what can be caught too: `dratini`), and the stop from ' +
+      'theirs (your region’s first), or paste a maps link to a stop. A grunt is posted in the ' +
+      `region’s channel for ${String(settings.rocket.gruntMinutes)} minutes; a leader, Giovanni ` +
+      'or a decoy grunt goes in the pinned post "Today at the stops" until midnight, and keeps ' +
+      'grunts away from the stop all day. Report Giovanni only once you have seen it is really ' +
+      'him: many stops that look like him are decoys, which you report as "Decoy grunt". A ' +
+      'stop has one report: a newer one replaces it (a grunt where a hideout was reported asks ' +
+      'first), and the same grunt twice is answered with the report that stands. Members who ' +
+      'want it get a direct message. Your answer takes the report back. You can make ' +
+      `${String(settings.rocket.throttle.uses)} reports in ` +
+      `${String(settings.rocket.throttle.minutes)} minutes.`,
+    examples: [
+      '/rocket report who:Water-type grunt stop:Yellow Mural',
+      '/rocket report who:Arlo stop:Fountain Square',
+    ],
+  },
+  guards: [requireRocketReport],
+  // The dialog is the first answer where one opens: nothing is deferred before it.
+  defer: (interaction) => (asked.get(interaction)?.hideout ? undefined : 'late'),
+  throttle: (_interaction, ctx) => rocketThrottle(ctx.config.settings),
+  async execute(interaction, ctx) {
+    const ask = asked.get(interaction);
+    if (!ask) throw new UserError('Use `/rocket report` again.');
+    const { hideout } = ask;
+    if (!hideout) {
+      await report(interaction, ctx, ask, undefined);
+      return;
+    }
+    // Nothing more is read for the dialog, but the guard's reads must have left Discord's three
+    // seconds for it (the slow-read rule).
+    await readInTime(ctx.log, interaction, () => Promise.resolve());
+    const { settings } = ctx.config;
+    const waiting: WaitingAsk = {
+      ...ask,
+      hideout,
+      countedAt: whenCounted(interaction) ?? Date.now(),
+      throttle: rocketThrottle(settings),
+      window: rocketWindow(settings),
+    };
+    const token = pending.put(interaction.user.id, waiting);
+    await interaction.showModal(replaceDialog(token, waiting));
+  },
+  autocomplete: async (interaction, ctx) => {
+    const focused = interaction.options.getFocused(true);
+    await interaction.respond(
+      focused.name === 'who'
+        ? whoChoices(ctx, focused.value)
+        : await nearChoices(interaction, ctx, focused.value, ['stop']),
+    );
+  },
+};
+
+/** `/rocket remove stop:`: takes back the Rocket report at a stop; one's own, or any for staff. */
+const removeRocket: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName('remove')
+    .setDescription('Take back the Team GO Rocket report at a PokéStop')
+    .addStringOption(stopOption),
+  help: {
+    details:
+      'Takes back what of Team GO Rocket is reported at a PokéStop: your own report, or any ' +
+      'for staff. A grunt’s message is deleted with it; the report it replaced does not come ' +
+      'back.',
+    examples: ['/rocket remove stop:Yellow Mural'],
+  },
+  guards: [requireGuild],
+  defer: 'late',
+  throttle: MEMBER_WRITE_THROTTLE,
+  async execute(interaction, ctx) {
+    const stop = await namedStop(
+      interaction,
+      ctx,
+      interaction.options.getString('stop', true),
+      NOT_A_ROCKET_STOP,
+    );
+    const serverId = guildIdOf(interaction);
+    const standing = await ctx.stopReports.rocketAt(serverId, stop.key);
+    if (!standing) throw new UserError(NOTHING_AT_STOP);
+    // By its id (a replacement is a report of its own): one replaced since is not taken back.
+    const { removed, notYours } = await ctx.stopReports.takeBack(
+      serverId,
+      [standing.id],
+      interaction.user.id,
+      isStaff(interaction, ctx),
+    );
+    const [gone] = removed;
+    if (!gone) throw new UserError(notYours.length > 0 ? NOT_YOUR_REPORT : REPORT_CHANGED);
+    await answer(interaction, {
+      content: `Took back **${reportSubject(gone)}** at ${stopLine(gone.stop)}.`,
+    });
+  },
+  autocomplete: async (interaction, ctx) => {
+    const focused = interaction.options.getFocused(true);
+    await interaction.respond(await nearChoices(interaction, ctx, focused.value, ['stop']));
+  },
+};
+
+/** `/rocket` (plan 8R-2): Team GO Rocket at PokéStops, offered on every server (Matt's answer 7). */
+export const rocket = commandGroup({
+  data: new SlashCommandBuilder()
+    .setName('rocket')
+    .setDescription('Report Team GO Rocket at PokéStops'),
+  help: { category: 'notifications' },
+  parts: [reportRocket, removeRocket],
+});
+
+/**
+ * The controls of `/rocket report` (kind `rocket`): "Take back" on its answer
+ * (`rocket:<report id>:back`: the presser's own, any for staff, answered in the answer's place)
+ * and the dialog's Submit (`rocket:<token>:replace`: the grunt reported in the place of the
+ * hideout it asked about, decided again; it carries on the use `/rocket report` counted).
+ */
+export const rocketControls: ComponentHandler = {
+  kind: ROCKET_KIND,
+  guards: [requireGuild],
+  throttle: (_interaction, id) =>
+    id.action === ROCKET_ACTIONS.back ? MEMBER_WRITE_THROTTLE : undefined,
+  carriesOn: (interaction, id) => {
+    if (id.action !== ROCKET_ACTIONS.replace) return undefined;
+    const waiting = pending.peek(id.id, interaction.user.id);
+    return typeof waiting === 'object'
+      ? { ...waiting.value.throttle, as: waiting.value.window, countedAt: waiting.value.countedAt }
+      : undefined;
+  },
+  async button(interaction, id, ctx) {
+    if (id.action !== ROCKET_ACTIONS.back || !/^\d{1,10}$/.test(id.id)) {
+      throw new UserError(STALE_COMPONENT);
+    }
+    const serverId = guildIdOf(interaction);
+    const staff = isStaff(interaction, ctx);
+    let { removed, notYours } = await ctx.stopReports.takeBack(
+      serverId,
+      [Number(id.id)],
+      interaction.user.id,
+      staff,
+    );
+    if (removed.length === 0 && notYours.length === 0) {
+      // Gone by its id: a hideout put back under a new id (fix S3) is found by its meaning, the
+      // presser's report of the same who at the same stop and day standing now.
+      const meant = await sameReportNow(ctx, serverId, id.args, interaction.user.id);
+      if (meant) {
+        ({ removed, notYours } = await ctx.stopReports.takeBack(
+          serverId,
+          [meant.id],
+          interaction.user.id,
+          staff,
+        ));
+      }
+    }
+    if (removed.length === 0 && notYours.length > 0) throw new UserError(NOT_YOUR_REPORT);
+    const [first] = removed;
+    await showInPlace(
+      interaction,
+      textMessage(ROCKET_COLOUR, [
+        first === undefined
+          ? 'There was nothing left to take back: the report has ended, was taken back, or was ' +
+            'replaced by a newer one.'
+          : `Took back **${reportSubject(first)}** at ${stopLine(first.stop)}.`,
+      ]),
+    );
+  },
+  async modal(interaction, id, ctx) {
+    if (id.action !== ROCKET_ACTIONS.replace) throw new UserError(STALE_COMPONENT);
+    const taken = pending.take(id.id, interaction.user.id);
+    if (taken === 'not-yours') throw new UserError('That is somebody else’s report.');
+    if (taken === 'expired') {
+      throw new UserError('That question has expired. Use `/rocket report` again.');
+    }
+    await deferSubmit(interaction);
+    const ask = taken.value;
+    await report(interaction, ctx, ask, ask.hideout.id);
+  },
+};
diff --git a/src/components/index.ts b/src/components/index.ts
index 2271b2e3f9c438cf5fd4f958476c7bc672eb3119..9c80f3e10929a1d6aba4c8eab25fcf79ec15ffee 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -10,6 +10,7 @@ import { placeAskControls } from '../commands/meetups/place-ask.js';
 import { placesControls } from '../commands/meetups/places.js';
 import { pokestopControls } from '../commands/stops/pokestop.js';
 import { researchControls } from '../commands/research/research.js';
+import { rocketControls } from '../commands/rocket/rocket.js';
 import {
   targetControls,
   targetListControls,
@@ -70,6 +71,7 @@ export const components: readonly ComponentHandler[] = [
   gymReviewControls,
   pokestopControls,
   researchControls,
+  rocketControls,
   regionControls,
   screenshotControls,
   rankControls,
diff --git a/src/render/rocket.ts b/src/render/rocket.ts
index a3a2979f5d9e106272d876ffe8225da02de8eeac..97f267c07df059cccca348d03f83a185dda85875 100644
--- a/src/render/rocket.ts
+++ b/src/render/rocket.ts
@@ -1,9 +1,17 @@
-import type { APIComponentInContainer } from 'discord.js';
+import {
+  ButtonStyle,
+  ComponentType,
+  type APIButtonComponentWithCustomId,
+  type APIComponentInContainer,
+} from 'discord.js';
+import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
 import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
 import { catchesInShort, type RocketCatch } from '../domain/rocket/lineups.js';
-import type { ReportedStop } from '../domain/stops/report.js';
+import type { ReportedStop, RocketReport } from '../domain/stops/report.js';
 import { wayspotPicture } from '../domain/wayspots/picture.js';
+import { cutText } from './party-post.js';
 import { mapMarkdown } from './raid-post.js';
+import { stopLine } from './research.js';
 import {
   memberByName,
   plain,
@@ -12,7 +20,15 @@ import {
   truncate,
   type NamedMember,
 } from './text.js';
-import { container, GALLERY_ITEMS, mediaGallery, section, textDisplay, thumbnail } from './v2.js';
+import {
+  actionRow,
+  container,
+  GALLERY_ITEMS,
+  mediaGallery,
+  section,
+  textDisplay,
+  thumbnail,
+} from './v2.js';
 
 /*
  * Team GO Rocket's messages (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.2): a
@@ -98,6 +114,108 @@ export function gruntMessage(view: GruntView, goneAt: number): V2Message {
   };
 }
 
+/** The custom-id kind of `/rocket report`'s answer and dialog. */
+export const ROCKET_KIND = 'rocket';
+
+/** The actions: Take back (a button) and Replace (the dialog's Submit). */
+export const ROCKET_ACTIONS = { back: 'back', replace: 'replace' } as const;
+
+/** What the answer of a Rocket report shows. */
+export interface RocketAnswerView {
+  report: RocketReport;
+  /** The Rocket report at the stop it replaced, while that one stood. */
+  replaced: RocketReport | undefined;
+  /** Whether it is a hideout (in the pinned posts), or a grunt (messages of its own). */
+  hideout: boolean;
+  /** The region channels that hold the stop. */
+  channels: readonly string[];
+  /** The channels the grunt's message was posted in. */
+  posted: readonly { channelId: string }[];
+  /** Rehearsal mode: nothing is posted, no pinned post is made. */
+  rehearsal: boolean;
+  /** A hideout's end as a sentence ends (`periodEndWords`: `until midnight`). */
+  until: string;
+}
+
+/**
+ * The answer of a Rocket report (plan 8R-2; design 5.2), for the reporter alone: who, at which
+ * stop, what can be caught, and what it replaced ("was: Arlo"; "again" for the same hideout);
+ * where it shows (a grunt's messages and when they go; a hideout's pinned posts, until
+ * midnight; in rehearsal mode only until when) and "Take back" (`rocket:<id>:back`).
+ */
+export function rocketAnswer(view: RocketAnswerView): V2Message {
+  const { report, replaced } = view;
+  const catches = catchWords(report.rocket.catches);
+  const before =
+    replaced === undefined
+      ? ''
+      : replaced.subjectKey === report.subjectKey
+        ? ' (again)'
+        : ` (was: ${plain(replaced.rocket.name)})`;
+  const head = [
+    '### Team GO Rocket reported',
+    `**${plain(report.rocket.name)}** at ${stopLine(report.stop)}` +
+      `${catches === '' ? '' : ` · catch ${catches}`}${before}`,
+  ].join('\n');
+  const channels = (ids: readonly string[]): string => ids.map((id) => `<#${id}>`).join(', ');
+  let where: string;
+  if (view.hideout) {
+    where = view.rehearsal
+      ? `It stands ${view.until}.`
+      : view.channels.length === 0
+        ? `It lies in no region now, so no post shows it; it stands ${view.until}.`
+        : `In the pinned post "Today at the stops" of ${channels(view.channels)}, ${view.until}.`;
+  } else if (view.rehearsal) {
+    where = `It stands until ${timestamp(report.endsAt, 't')} (rehearsal mode posts nothing).`;
+  } else if (view.posted.length === 0) {
+    where =
+      'It could not be posted in a region channel; it stands until ' +
+      `${timestamp(report.endsAt, 't')}.`;
+  } else {
+    where =
+      `Posted in ${channels(view.posted.map((one) => one.channelId))}; it goes away ` +
+      `${timestamp(report.endsAt, 'R')}.`;
+  }
+  const button: APIButtonComponentWithCustomId = {
+    type: ComponentType.Button,
+    style: ButtonStyle.Danger,
+    // With the stop and who (`:` read as `.`), so that a hideout put back under a new id is still
+    // found by its meaning (fix S3); without them where the id would not fit.
+    custom_id:
+      encodeCustomIdIfFits({
+        kind: ROCKET_KIND,
+        id: String(report.id),
+        action: ROCKET_ACTIONS.back,
+        args: [report.stop.key, report.subjectKey.replace(':', '.')],
+      }) ??
+      encodeCustomId({ kind: ROCKET_KIND, id: String(report.id), action: ROCKET_ACTIONS.back }),
+    label: 'Take back',
+  };
+  return {
+    v2: true,
+    components: [
+      container(ROCKET_COLOUR, [
+        textDisplay(cutText(head, 3_000)),
+        textDisplay(`-# ${where}`),
+        actionRow([button]),
+      ]),
+    ],
+  };
+}
+
+/**
+ * The answer where the same grunt stands at the stop (Matt's answer 4): who reported it and when,
+ * when it goes, and a link to its message (none in rehearsal mode).
+ */
+export function alreadyReported(standing: RocketReport, link: string | undefined): string {
+  return (
+    `Already reported: ${withArticle(standing.rocket.name, `**${plain(standing.rocket.name)}**`)} at ` +
+    `${stopLine(standing.stop)}, by ${memberByName(standing.reporter)} ` +
+    `${timestamp(standing.madeAt, 'R')}; it goes away ${timestamp(standing.endsAt, 'R')}.` +
+    (link === undefined ? '' : ` ${link}`)
+  );
+}
+
 /**
  * A grunt's report where the bot may not post embeds (as `spawnTextMessage`): the same in a
  * sentence or two of classic text, without pictures.
````

### Task 6: 8R-2 task 6: the hideouts in the pinned post "Today at the stops"

Prototype commit: `2775b1eeba14f7e7e61a04cc1ede64c81f5d152e`

The post shows the day's Team GO Rocket hideouts after the research, under
"### Team GO Rocket hideouts": Giovanni, Cliff, Arlo, Sierra and the decoy
grunt, each with what can be caught (its first catch's picture beside it)
and its stops with their address lines and reporters, as the tasks' stops
(whole lines, fifteen at most, the rest counted). Tasks and hideouts are
blocks of one layout within the same limits (three messages, research
first; what does not fit is counted: "...and 4 more tasks and 1 more
hideout"), and the placement names the message holding each hideout by its
rocketKey, for the DMs' links. Plain text where the bot may not embed, as
for research.

A hideout makes the day's post where none is; a grunt is never in it (its
message is its own). Hideouts belong to the day, so an event's window does
not hide them. The head says "field research and Team GO Rocket"; an empty
post names /research report and /rocket report.

**Files:**

```
 src/render/stop-post.test.ts    |  82 +++++++++++++++++++++++++++++++++++++++-
 src/render/stop-post.ts         | 162 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------------------
 src/services/stop-posts.test.ts |  42 +++++++++++++++++++++
 src/services/stop-posts.ts      |  54 +++++++++++++++++++++++----
 4 files changed, 290 insertions(+), 50 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/stop-post.test.ts src/services/stop-posts.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 2775b1eeba14f7e7e61a04cc1ede64c81f5d152e -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-2 task 6: the hideouts in the pinned post "Today at the stops"`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/render/stop-post.test.ts b/src/render/stop-post.test.ts
index 53a41cf302482259b306d61bd6a96b68cb7830c3..8c1567230336619d0088145d91870ab34b5b09c7 100644
--- a/src/render/stop-post.test.ts
+++ b/src/render/stop-post.test.ts
@@ -3,7 +3,8 @@ import { textOf } from '../../test/support/messages.js';
 import { expectV2Sendable } from '../../test/support/post-limits.js';
 import { pageTask } from '../../test/support/research.js';
 import { reportedStop } from '../../test/support/stop-report-cases.js';
-import { stopPostMessages, stopPostText, type PostTask } from './stop-post.js';
+import { feedChoice } from '../../test/support/rocket.js';
+import { stopPostMessages, stopPostText, type PostHideout, type PostTask } from './stop-post.js';
 
 const DRAGON = pageTask('Catch a Dragon-type Pokémon');
 
@@ -86,6 +87,85 @@ describe('the post "Today at the stops"', () => {
     expect(lines(classic?.content ?? '').at(-1)).toMatch(/^- …and \d+ more stops?$/);
   });
 
+  describe('the hideouts of Team GO Rocket (plan 8R-2)', () => {
+    const hideout = (key: string, n: number): PostHideout => ({
+      key,
+      name: feedChoice(key).name,
+      catches: feedChoice(key).catches,
+      stops: Array.from({ length: n }, (_, i) => ({
+        stop: reportedStop(i + 1, { name: `Hideout stop ${String(i + 1)}`, address: null }),
+        reporter: { id: `20000000000000${String(2000 + i)}`, name: `Grunt fan ${String(i)}` },
+      })),
+    });
+
+    it('come after the research, each with what can be caught and its stops', () => {
+      const layout = stopPostMessages({
+        day: 'Saturday, November 21',
+        tasks: [atStops(1)],
+        hideouts: [hideout('giovanni', 1), hideout('leader:arlo', 2)],
+      });
+      const text = textOf(layout.messages[0]);
+      expect(text).toContain('-# Saturday, November 21 · field research and Team GO Rocket');
+      const research = text.indexOf('Catch a Dragon-type Pokémon');
+      const rocket = text.indexOf('### Team GO Rocket hideouts');
+      expect(research).toBeGreaterThan(0);
+      expect(rocket).toBeGreaterThan(research);
+      expect(text.slice(rocket)).toContain(
+        '**Giovanni** · catch Zekrom\n- **Hideout stop 1** · **Grunt fan 0**',
+      );
+      expect(text.slice(rocket)).toContain(
+        '**Arlo** · catch Alolan Grimer\n- **Hideout stop 1** · **Grunt fan 0**\n- **Hideout stop 2** · **Grunt fan 1**',
+      );
+      expect(layout.placement.get('giovanni')).toBe(0);
+      expect(layout.placement.get('leader:arlo')).toBe(0);
+      expectV2Sendable(layout.messages[0]!);
+    });
+
+    it('make the post without research, and say what is reported where nothing is', () => {
+      const [only] = stopPostMessages({
+        day: 'Saturday, November 21',
+        tasks: [],
+        hideouts: [hideout('decoy', 1)],
+      }).messages;
+      expect(textOf(only)).not.toContain('Nothing reported right now.');
+      expect(textOf(only)).toContain('**Decoy grunt** · catch Bellsprout');
+      const [empty] = stopPostMessages({
+        day: 'Saturday, November 21',
+        tasks: [],
+        hideouts: [],
+      }).messages;
+      expect(textOf(empty)).toContain(
+        'Nothing reported right now. `/research report` and `/rocket report` tell the region what a stop has.',
+      );
+    });
+
+    it('spill after a full research into the next messages, counted at the end', () => {
+      const tasks = Array.from({ length: 30 }, (_, i) => atStops(10, `task-${String(i)}`));
+      const hideouts = [hideout('giovanni', 3), hideout('leader:cliff', 3)];
+      for (const layout of [
+        stopPostMessages({ day: 'Saturday, November 21', tasks, hideouts }),
+        stopPostText({ day: 'Saturday, November 21', tasks, hideouts }),
+      ]) {
+        expect(layout.messages).toHaveLength(3);
+        expect(layout.placement.get('giovanni')).toBeUndefined();
+        const last = JSON.stringify(layout.messages[2]);
+        expect(last).toMatch(/…and \d+ more tasks and 2 more hideouts/);
+      }
+    });
+
+    it('is plain text too, after the research', () => {
+      const { messages, placement } = stopPostText({
+        day: 'Saturday, November 21',
+        tasks: [atStops(1)],
+        hideouts: [hideout('leader:sierra', 1)],
+      });
+      expect(messages[0]?.content).toContain(
+        '### Team GO Rocket hideouts\n**Sierra** · catch Pancham\n- **Hideout stop 1** · **Grunt fan 0**',
+      );
+      expect(placement.get('leader:sierra')).toBe(0);
+    });
+  });
+
   it('says which message holds each task, and none for a task counted only', () => {
     const many = Array.from({ length: 30 }, (_, i) => atStops(10, `task-${String(i)}`));
     for (const layout of [
diff --git a/src/render/stop-post.ts b/src/render/stop-post.ts
index 1d521c2bffa4bee5bd143e6c98180d7099e7b72b..462bb6f381cfd12d9508411c221ba5b7fd274c15 100644
--- a/src/render/stop-post.ts
+++ b/src/render/stop-post.ts
@@ -1,17 +1,20 @@
 import type { APIComponentInContainer } from 'discord.js';
 import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
 import type { TaskReward } from '../domain/research/task.js';
+import type { RocketCatch } from '../domain/rocket/lineups.js';
 import type { Reporter, ReportedStop, ResearchDetail } from '../domain/stops/report.js';
 import { cutText, TEXT_BUDGET } from './party-post.js';
 import { RESEARCH_COLOUR, rewardWords, stopLine, taskText } from './research.js';
+import { catchWords } from './rocket.js';
 import { count, memberByName, plain, timestamp } from './text.js';
 import { container, countComponents, section, separator, textDisplay, thumbnail } from './v2.js';
 
 /*
  * The pinned "Today at the stops" post of a region channel (plan 8R-1; design 6, 9.5, 9.7):
- * research grouped by task, each with its rewards and its stops, in components-v2 messages of
- * Discord's limits (40 components, `TEXT_BUDGET` of text), spilling into a second and a third,
- * then "…and N more tasks". Plan 8R-2 adds the hideouts after the research.
+ * research grouped by task, each with its rewards and its stops, then Team GO Rocket's hideouts
+ * (plan 8R-2: Giovanni, Cliff, Arlo, Sierra, the decoy grunt, each with its stops), in
+ * components-v2 messages of Discord's limits (40 components, `TEXT_BUDGET` of text), spilling
+ * into a second and a third, then "…and N more tasks".
  */
 
 /** At most this many messages make one post (design 9.7). */
@@ -21,15 +24,32 @@ export const MAX_POST_MESSAGES = 3;
 const MAX_COMPONENTS = 40;
 const CLASSIC_TEXT = 2_000;
 
-/** How many stops of one task a post names; the rest are counted. */
+/** How many stops of one task or hideout a post names; the rest are counted. */
 const STOPS_SHOWN = 15;
 
+/** A stop of the post with who reported it there. */
+interface PostStop {
+  stop: ReportedStop;
+  reporter: Reporter;
+}
+
 /** A task of the post with the stops it was reported at. */
 export interface PostTask {
   /** What the reports are of (`StopReport.subjectKey`): a DM links to the message holding it. */
   key: string;
   research: ResearchDetail;
-  stops: { stop: ReportedStop; reporter: Reporter }[];
+  stops: PostStop[];
+}
+
+/**
+ * A hideout of the post (plan 8R-2): who (its `rocketKey`, by which a DM finds the message holding
+ * it), by name, what can be caught, and the stops it was reported at today.
+ */
+export interface PostHideout {
+  key: string;
+  name: string;
+  catches: readonly RocketCatch[];
+  stops: PostStop[];
 }
 
 /** What the post shows. */
@@ -38,6 +58,8 @@ export interface StopPostView {
   day: string;
   /** The tasks of the period on now, most stops first. */
   tasks: PostTask[];
+  /** Today's hideouts, Giovanni first, then Cliff, Arlo, Sierra and the decoy (plan 8R-2). */
+  hideouts?: PostHideout[] | undefined;
   /** The event of the period on now, when it is one's (its name). */
   event?: string | undefined;
   /** Under an intra-day event: how many stops' research waits, and until when. */
@@ -49,42 +71,83 @@ export interface StopPostView {
   until?: string | undefined;
 }
 
+/** A part of the post that stays in one message: a task or a hideout. */
+interface Block {
+  key: string;
+  kind: 'task' | 'hideout';
+  /** Its text in at most `room` characters, by whole lines. */
+  body: (room: number) => string;
+  picture: string | undefined;
+}
+
 /** The picture beside a task: its first reward's that has one. */
 function pictureOf(rewards: readonly TaskReward[]): string | undefined {
   return rewards.find((reward) => reward.image !== null)?.image ?? undefined;
 }
 
-/** The line that counts the stops a task's text does not name. */
+/** The line that counts the stops a block's text does not name. */
 function moreStops(left: number): string {
   return `- …and ${count(left, 'more stop')}`;
 }
 
 /**
- * A task as text of at most `room` characters: its line, then a line per stop with who reported
- * it, as many whole lines as fit (`STOPS_SHOWN` at most; each line is made of parts cut before
- * they are escaped, design 9.7, and never cut itself: review B6), then the rest counted.
+ * A head and its stops as text of at most `room` characters: the head, then a line per stop with
+ * who reported it, as many whole lines as fit (`STOPS_SHOWN` at most; each line is made of parts
+ * cut before they are escaped, design 9.7, and never cut itself: review B6), then the rest
+ * counted.
  */
-function taskBody(task: PostTask, room: number): string {
-  const rewards = rewardWords(task.research.rewards);
-  const head = `**${taskText(task.research)}**${rewards === '' ? '' : ` · ${rewards}`}`;
+function stopsBody(head: string, stops: readonly PostStop[], room: number): string {
   const lines: string[] = [];
   let used = head.length;
-  for (const [index, { stop, reporter }] of task.stops.slice(0, STOPS_SHOWN).entries()) {
+  for (const [index, { stop, reporter }] of stops.slice(0, STOPS_SHOWN).entries()) {
     const line = `- ${stopLine(stop)} · ${memberByName(reporter)}`;
-    const left = task.stops.length - index - 1;
+    const left = stops.length - index - 1;
     const tail = left > 0 ? 1 + moreStops(left).length : 0;
     if (used + 1 + line.length + tail > room) break;
     lines.push(line);
     used += 1 + line.length;
   }
-  const more = task.stops.length - lines.length;
+  const more = stops.length - lines.length;
   return [head, ...lines, ...(more > 0 ? [moreStops(more)] : [])].join('\n');
 }
 
+/** The heading of the Rocket section, over its first hideout. */
+const ROCKET_HEADING = '### Team GO Rocket hideouts';
+
+/** The blocks of a view: its tasks, then its hideouts under their heading. */
+function blocksOf(view: StopPostView): Block[] {
+  const tasks = view.tasks.map((task): Block => {
+    const rewards = rewardWords(task.research.rewards);
+    const head = `**${taskText(task.research)}**${rewards === '' ? '' : ` · ${rewards}`}`;
+    return {
+      key: task.key,
+      kind: 'task',
+      body: (room) => stopsBody(head, task.stops, room),
+      picture: pictureOf(task.research.rewards),
+    };
+  });
+  const hideouts = (view.hideouts ?? []).map((hideout, index): Block => {
+    const catches = catchWords(hideout.catches);
+    const head =
+      `${index === 0 ? `${ROCKET_HEADING}\n` : ''}**${plain(hideout.name)}**` +
+      `${catches === '' ? '' : ` · catch ${catches}`}`;
+    return {
+      key: hideout.key,
+      kind: 'hideout',
+      body: (room) => stopsBody(head, hideout.stops, room),
+      picture: hideout.catches.find((one) => one.image !== null)?.image ?? undefined,
+    };
+  });
+  return [...tasks, ...hideouts];
+}
+
 /** The head of the post: its title, the day, an event's line and the waiting line. */
 function headText(view: StopPostView, part: number): string {
   if (part > 0) return `-# Today at the stops, continued (${String(part + 1)})`;
-  const lines = [`## Today at the stops`, `-# ${plain(view.day)} · field research`];
+  const lines = [
+    `## Today at the stops`,
+    `-# ${plain(view.day)} · field research and Team GO Rocket`,
+  ];
   if (view.event !== undefined) {
     lines.push(
       `**${plain(view.event)}**: its tasks${view.until === undefined ? '' : ` ${view.until}`}.`,
@@ -96,34 +159,50 @@ function headText(view: StopPostView, part: number): string {
         `(${count(view.waiting.stops, 'stop')}).`,
     );
   }
-  if (view.tasks.length === 0) {
-    lines.push('Nothing reported right now. `/research report` tells the region what a stop has.');
+  if (view.tasks.length === 0 && (view.hideouts ?? []).length === 0) {
+    lines.push(
+      'Nothing reported right now. `/research report` and `/rocket report` tell the region ' +
+        'what a stop has.',
+    );
   }
   return lines.join('\n');
 }
 
-/** A task as components: its text with its picture beside it, or the text alone. */
-function taskParts(task: PostTask, room: number): APIComponentInContainer[] {
+/** A block as components: its text with its picture beside it, or the text alone. */
+function blockParts(block: Block, room: number): APIComponentInContainer[] {
   // `cutText` only as a backstop: the body fits `room` by whole lines.
-  const body = cutText(taskBody(task, room), room);
-  const picture = pictureOf(task.research.rewards);
-  return [picture === undefined ? textDisplay(body) : section(body, thumbnail(picture))];
+  const body = cutText(block.body(room), room);
+  return [
+    block.picture === undefined ? textDisplay(body) : section(body, thumbnail(block.picture)),
+  ];
+}
+
+/** The line that counts what the post has no room for: `…and 4 more tasks and 1 more hideout`. */
+function leftLine(left: readonly Block[]): string {
+  const tasks = left.filter((block) => block.kind === 'task').length;
+  const hideouts = left.length - tasks;
+  const parts = [
+    ...(tasks > 0 ? [count(tasks, 'more task')] : []),
+    ...(hideouts > 0 ? [count(hideouts, 'more hideout')] : []),
+  ];
+  return `…and ${parts.join(' and ')}`;
 }
 
 /**
- * The post as components-v2 messages (design 6, 9.7): research first (8R-2's hideouts after),
- * the tasks in as many messages as they need of `MAX_POST_MESSAGES`, each a container of the
- * research colour within Discord's limits; a task too long for a message is cut (text cut before
+ * The post as components-v2 messages (design 6, 9.7): research first, then the hideouts (plan
+ * 8R-2), in as many messages as they need of `MAX_POST_MESSAGES`, each a container of the
+ * research colour within Discord's limits; a block too long for a message is cut (text cut before
  * it is escaped: each line is made of escaped parts, cut whole by `cutText` as a backstop); what
- * does not fit the last message is counted there: "…and 4 more tasks".
+ * does not fit the last message is counted there: "…and 4 more tasks and 1 more hideout".
  */
 export function stopPostMessages(view: StopPostView): PostLayout<V2Message> {
   const messages: APIComponentInContainer[][] = [];
   const placement = new Map<string, number>();
   let parts: APIComponentInContainer[] = [textDisplay(headText(view, 0))];
+  const blocks = blocksOf(view);
   let shown = 0;
-  for (const task of view.tasks) {
-    const own = taskParts(task, TEXT_BUDGET - TAIL_ROOM - 200);
+  for (const block of blocks) {
+    const own = blockParts(block, TEXT_BUDGET - TAIL_ROOM - 200);
     const joined = [...parts, separator(), ...own];
     if (fits(joined)) {
       parts = joined;
@@ -132,11 +211,10 @@ export function stopPostMessages(view: StopPostView): PostLayout<V2Message> {
       messages.push(parts);
       parts = [textDisplay(headText(view, messages.length)), ...own];
     }
-    placement.set(task.key, messages.length);
+    placement.set(block.key, messages.length);
     shown += 1;
   }
-  const left = view.tasks.length - shown;
-  if (left > 0) parts.push(textDisplay(`…and ${count(left, 'more task')}`));
+  if (shown < blocks.length) parts.push(textDisplay(leftLine(blocks.slice(shown))));
   messages.push(parts);
   return {
     messages: messages.map((one) => ({ v2: true, components: [container(RESEARCH_COLOUR, one)] })),
@@ -144,14 +222,14 @@ export function stopPostMessages(view: StopPostView): PostLayout<V2Message> {
   };
 }
 
-/** The messages of a post, and which of them holds each task (by its key). */
+/** The messages of a post, and which of them holds each task or hideout (by its key). */
 export interface PostLayout<T> {
   messages: T[];
   placement: Map<string, number>;
 }
 
 /** Room kept in every message for the line "…and N more tasks" and its component. */
-const TAIL_ROOM = 60;
+const TAIL_ROOM = 80;
 
 /** The text of components, as Discord counts it against a message's 4,000 characters. */
 function textOf(parts: readonly object[]): number {
@@ -178,22 +256,22 @@ export function stopPostText(view: StopPostView): PostLayout<ClassicMessage> {
   const messages: string[] = [];
   const placement = new Map<string, number>();
   let current = headText(view, 0);
+  const blocks = blocksOf(view);
   let shown = 0;
-  for (const task of view.tasks) {
-    const block = cutText(taskBody(task, 1_800), 1_800);
-    const joined = `${current}\n\n${block}`;
-    if (joined.length <= CLASSIC_TEXT - 60) {
+  for (const block of blocks) {
+    const text = cutText(block.body(1_800), 1_800);
+    const joined = `${current}\n\n${text}`;
+    if (joined.length <= CLASSIC_TEXT - TAIL_ROOM) {
       current = joined;
     } else {
       if (messages.length + 1 >= MAX_POST_MESSAGES) break;
       messages.push(current);
-      current = block;
+      current = text;
     }
-    placement.set(task.key, messages.length);
+    placement.set(block.key, messages.length);
     shown += 1;
   }
-  const left = view.tasks.length - shown;
-  if (left > 0) current = `${current}\n…and ${count(left, 'more task')}`;
+  if (shown < blocks.length) current = `${current}\n${leftLine(blocks.slice(shown))}`;
   messages.push(current);
   return { messages: messages.map((content) => ({ content })), placement };
 }
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index ddb250a65040995cb2910c903d6c0ff1ae9b6e90..46ce0a097d3b8f83544dc24d9ddfbf8641a18f60 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -8,7 +8,9 @@ import { expectV2Sendable } from '../../test/support/post-limits.js';
 import { pageTask, researchTasksOfPage } from '../../test/support/research.js';
 import { INTO_THE_WILD, PAWNIARD_DAY } from '../../test/support/research-store-cases.js';
 import { MemoryStopPosts } from '../../test/support/research-store.js';
+import { feedChoice } from '../../test/support/rocket.js';
 import { reportedStop } from '../../test/support/stop-report-cases.js';
+import { rocketSubject } from './rocket-reports.js';
 import { MemoryStopReports } from '../../test/support/stop-reports.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import type { ResearchTask } from '../domain/research/task.js';
@@ -134,6 +136,46 @@ describe('StopPostService', () => {
     ]);
   });
 
+  it('shows the hideouts of the day after the research; a grunt makes no post (8R-2)', async () => {
+    made = postsWith();
+    const rocket = (key: string, stop = west(1)) =>
+      made!.reports.reportRocket({
+        serverId: FAKE_GUILD_ID,
+        stop,
+        subject: rocketSubject(feedChoice(key)),
+        reporter: ASH,
+      });
+    await rocket('grunt:water');
+    await made.posts.flush();
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    // A hideout makes the day's post where none is.
+    const arlo = await rocket('leader:arlo', west(2));
+    await made.posts.flush();
+    expect(made.said()[0]).toContain(
+      '### Team GO Rocket hideouts\n**Arlo** · catch Alolan Grimer\n- **Yellow Mural 2** · Market Street · **Ash**',
+    );
+    expect(made.said()[0]).not.toContain('Water-type grunt');
+    const [post] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(await made.posts.messageOf(WEST_CHANNEL, 'leader:arlo')).toBe(post?.id);
+    // Under an event's window the hideouts stand: they belong to the day.
+    await made.report(pageTask('Catch a Dragon-type Pokémon'));
+    made.setEvents([PAWNIARD_DAY]);
+    made.clock.now = at('2026-11-21T15:00');
+    await made.posts.flush();
+    expect(made.said()[0]).toContain('**Arlo** · catch Alolan Grimer');
+    // A grunt in its place takes it out.
+    if (arlo.kind !== 'reported') throw new Error('not reported');
+    await made.reports.reportRocket({
+      serverId: FAKE_GUILD_ID,
+      stop: west(2),
+      subject: rocketSubject(feedChoice('grunt:fire')),
+      reporter: ASH,
+      replacing: arlo.report.id,
+    });
+    await made.posts.flush();
+    expect(made.said()[0]).not.toContain('Arlo');
+  });
+
   it('shows a stop in the post of each region it lies in, and only there', async () => {
     made = postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'), [east]);
diff --git a/src/services/stop-posts.ts b/src/services/stop-posts.ts
index abe08513dd1608c23f3428ca5181fc8cfe97c91e..263338be80256ec048279e7fcc9f81c6d7eba1c0 100644
--- a/src/services/stop-posts.ts
+++ b/src/services/stop-posts.ts
@@ -9,8 +9,10 @@ import {
 } from '../discord/party-gateway.js';
 import {
   isResearchReport,
+  isRocketReport,
   type ReportedStop,
   type ResearchReport,
+  type RocketReport,
 } from '../domain/stops/report.js';
 import { nextPeriodChange } from '../domain/time/research-periods.js';
 import type { Logger } from '../log.js';
@@ -18,6 +20,7 @@ import {
   stopPostMessages,
   stopPostText,
   type PostLayout,
+  type PostHideout,
   type PostTask,
   type StopPostView,
 } from '../render/stop-post.js';
@@ -26,7 +29,7 @@ import { periodEndWords } from '../render/research.js';
 import { Gathered } from './gathered.js';
 import { KeyedLock } from './keyed-lock.js';
 import type { ResearchEventProvider } from './raid-event-service.js';
-import type { StopReportService } from './stop-reports.js';
+import { isHideoutReport, type StopReportService } from './stop-reports.js';
 
 /** How long after the last change of a channel's reports its post is drawn (design 6). */
 export const POST_DELAY_MS = 3_000;
@@ -54,7 +57,9 @@ export interface StopPostServiceOptions {
 
 /**
  * The pinned post "Today at the stops" of every region channel (plan 8R-1; design 6, 9.5–9.7,
- * 9.11): made at the first report of the day in the region, pinned (Discord's notice of the pin
+ * 9.11): the research of the period on, then the day's Team GO Rocket hideouts (plan 8R-2; a
+ * grunt has a message of its own and is not shown here); made at the first report of the day in
+ * the region (research or hideout), pinned (Discord's notice of the pin
  * deleted where the bot may; a channel at the pin limit, or a bot without Pin Messages, gets it
  * unpinned, logged), drawn anew a few seconds after the reports change (`POST_DELAY_MS`,
  * coalesced), spilling into a second and third message as it grows, and unpinned and deleted
@@ -226,14 +231,18 @@ export class StopPostService {
     const inside = containment(region.bounds);
     const now = this.now();
     const period = this.options.reports.period(now);
-    const here = (await this.options.reports.standing(serverId))
-      .filter(isResearchReport)
-      .filter((report) => inside(report.stop));
+    const standing = (await this.options.reports.standing(serverId)).filter((report) =>
+      inside(report.stop),
+    );
+    const here = standing.filter(isResearchReport);
     const shown = here.filter((report) => report.periodKey === period.key);
     const waiting = here.filter((report) => report.periodKey === period.waiting?.key);
+    // Hideouts belong to the day, whatever research period is on (plan 8R-2).
+    const hideouts = standing.filter(isRocketReport).filter(isHideoutReport);
     return {
       day: DateTime.fromMillis(now, { zone: this.options.zone }).toFormat('cccc, LLLL d'),
       tasks: grouped(shown),
+      hideouts: hideoutsOf(hideouts),
       event: period.event?.name,
       until: period.kind === 'day' ? undefined : periodEndWords(period.end, now, this.options.zone),
       waiting:
@@ -254,8 +263,10 @@ export class StopPostService {
     const view = await this.view(channelId, serverId);
     const post = this.posts.get(channelId);
     if (!view) return;
-    // Nothing reported and no post yet: none is made (design 6: at the first report).
-    if (!post && view.tasks.length === 0 && view.waiting === undefined) return;
+    // Nothing reported and no post yet: none is made (design 6: at the first report, research or
+    // hideout).
+    const empty = view.tasks.length === 0 && (view.hideouts ?? []).length === 0;
+    if (!post && empty && view.waiting === undefined) return;
     const layout: PostLayout<OutgoingMessage> = gateway.mayPost(channelId)
       ? stopPostMessages(view)
       : stopPostText(view);
@@ -446,6 +457,35 @@ function payloadHash(message: OutgoingMessage): string {
   return createHash('sha256').update(JSON.stringify(message)).digest('base64');
 }
 
+/** The order of the hideouts in the post (design 6): Giovanni, Cliff, Arlo, Sierra, the decoy. */
+const HIDEOUT_ORDER = ['giovanni', 'leader:cliff', 'leader:arlo', 'leader:sierra', 'decoy'];
+
+/**
+ * Hideout reports grouped by who (plan 8R-2): in `HIDEOUT_ORDER` (one of a later version's last),
+ * each with its stops in the order reported, as the first report of it names it.
+ */
+export function hideoutsOf(reports: readonly RocketReport[]): PostHideout[] {
+  const byWho = new Map<string, PostHideout>();
+  for (const report of reports) {
+    const stop = { stop: report.stop, reporter: report.reporter };
+    const known = byWho.get(report.subjectKey);
+    if (known) known.stops.push(stop);
+    else {
+      byWho.set(report.subjectKey, {
+        key: report.subjectKey,
+        name: report.rocket.name,
+        catches: report.rocket.catches,
+        stops: [stop],
+      });
+    }
+  }
+  const rank = (key: string): number => {
+    const at = HIDEOUT_ORDER.indexOf(key);
+    return at < 0 ? HIDEOUT_ORDER.length : at;
+  };
+  return [...byWho.values()].sort((a, b) => rank(a.key) - rank(b.key));
+}
+
 /** Reports grouped by task: most stops first, then by the first report. */
 export function grouped(reports: readonly ResearchReport[]): PostTask[] {
   const bySubject = new Map<string, PostTask & { first: number }>();
````

### Task 7: 8R-2 task 7: Rocket wants in /want, /wants and /unwant

Prototype commit: `34cbc5d862f098a4a16dc96abc092862eb25d0d2`

TargetWant gains the Rocket targets (design 7, 9.1): grunt:<type>,
grunt:none, decoy, leader:<cliff|arlo|sierra>, leader:any and giovanni, as
tokens, labelled Water-type grunt, Grunt (no type), Decoy grunt, Arlo (Team
GO Rocket leader), Any Team GO Rocket leader, Giovanni (Team GO Rocket
boss); the Stop buttons' arguments rg:<type|none>, rl:<leader|any>, rv, rd.

/want takes them at once, no dialog (a choice, or a name typed in full:
dragon grunt, arlo, any leader, giovanni, decoy), and says that a grunt type
sends at most one DM an hour for each type; its autocomplete offers them
after the Pokemon, sharing the rewards' five places, and offers the Pokemon
of today's lineups the text names before other Pokemon (after the raid
bosses: design 9.9). The Shadow box shows for a Pokemon in today's lineups
too (design 7). /wants lists them after the rewards in the order of
grunts, the decoy, the leaders and Giovanni, with their Remove;
/unwant takes them off; the help texts and /unwant-all's question name
Team GO Rocket.

**Files:**

```
 src/commands/notifications/want-boxes.ts | 109 ++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/commands/notifications/want-input.ts |  16 ++++++++
 src/commands/notifications/wants.test.ts | 142 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---
 src/commands/notifications/wants.ts      |  87 ++++++++++++++++++++++++++++++++++---------
 src/domain/notify/target-wants.test.ts   |  21 ++++++++++-
 src/domain/notify/target-wants.ts        |  54 ++++++++++++++++++++++++++-
 src/domain/pogo/want-boxes.test.ts       |  25 +++++++++++++
 src/domain/pogo/want-boxes.ts            |  35 ++++++++++++++++--
 8 files changed, 454 insertions(+), 35 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/notifications/wants.test.ts src/domain/notify/target-wants.test.ts src/domain/pogo/want-boxes.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 34cbc5d862f098a4a16dc96abc092862eb25d0d2 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-2 task 7: Rocket wants in /want, /wants and /unwant`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/notifications/want-boxes.ts b/src/commands/notifications/want-boxes.ts
index b0cc35f3843c49530d9dd787ce7e009060da20ce..1e093db9a3aa3b71a44ef001910a549f1fe42ad4 100644
--- a/src/commands/notifications/want-boxes.ts
+++ b/src/commands/notifications/want-boxes.ts
@@ -1,9 +1,12 @@
 import type { AppContext } from '../../app-context.js';
 import {
+  ANY_LEADER,
   parseTargetWantToken,
   targetWantToken,
   type TargetWant,
 } from '../../domain/notify/target-wants.js';
+import { POKEMON_TYPES } from '../../domain/pogo/types.js';
+import { LEADERS } from '../../domain/rocket/lineups.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
 import {
   notificationTiers,
@@ -17,6 +20,7 @@ import {
   subjectOf,
   subjectOfTarget,
   sameSubject,
+  rocketTargetLabel,
   targetWantLabel,
   tierBoxes,
   BOX_WORDS,
@@ -27,7 +31,7 @@ import {
 import { appearsInWild } from '../../domain/pogo/wild.js';
 import type { WantList } from '../../domain/pogo/wants.js';
 import { foldTaskText } from '../../domain/research/task.js';
-import { searchTokens } from '../../domain/search/text.js';
+import { searchText, searchTokens } from '../../domain/search/text.js';
 import type { TargetWantList } from '../../db/repositories/target-want-repository.js';
 import { truncate } from '../../render/text.js';
 import { listedRewards } from '../research/research-input.js';
@@ -42,11 +46,83 @@ import { typedWant, wantLabel } from './want-input.js';
  * grouped as the list shows them, one line per target with its boxes.
  */
 
-/** What `/want` and `/unwant` were given: a subject of boxes, IVs, or a research reward. */
+/**
+ * What `/want` and `/unwant` were given: a subject of boxes, IVs, a research reward, or a target
+ * of Team GO Rocket (plan 8R-2: a grunt type, a leader, any leader, Giovanni, the decoy).
+ */
 export type Wanted =
   | { kind: 'subject'; subject: BoxSubject; target: NotificationTarget }
   | { kind: 'iv'; target: NotificationTarget }
-  | { kind: 'reward'; want: TargetWant };
+  | { kind: 'reward'; want: TargetWant }
+  | { kind: 'rocket'; want: TargetWant };
+
+/**
+ * Every target of Team GO Rocket (plan 8R-2; design 7), in the order a list shows them: the grunt
+ * types by name, the untyped grunts, the decoy, any leader, Cliff, Arlo, Sierra, Giovanni.
+ */
+export function rocketTargets(): TargetWant[] {
+  return [
+    ...[...POKEMON_TYPES].sort().map((type) => `grunt:${type}`),
+    'grunt:none',
+    'decoy',
+    ANY_LEADER,
+    ...LEADERS.map((leader) => `leader:${leader}`),
+    'giovanni',
+  ].map((who): TargetWant => ({ kind: 'rocket', who }));
+}
+
+/** The names a Rocket target is known by, typed in full and folded. */
+function rocketNames(want: TargetWant & { kind: 'rocket' }): string[] {
+  const label = rocketTargetLabel(want.who);
+  const names = [label, label.replace(/ \(.*\)$/, '')];
+  const [head, value] = want.who.split(':');
+  if (head === 'grunt' && value !== 'none') names.push(`${value ?? ''} grunt`);
+  if (head === 'grunt' && value === 'none') names.push('grunt', 'no type grunt', 'no type', 'none');
+  if (want.who === 'decoy') names.push('decoy');
+  if (want.who === ANY_LEADER) names.push('any leader', 'leader');
+  return names.map(searchText);
+}
+
+/**
+ * The words that name a Rocket target by themselves (fix B3): a grunt's type, `none` of the
+ * untyped, `decoy`, a leader's name, `any` of any leader, `giovanni`. The rest of a label
+ * (`grunt`, `leader`, `team go rocket`, `boss`) finds nothing alone.
+ */
+function ownWords(who: string): string[] {
+  if (who === 'giovanni' || who === 'decoy') return [who];
+  // "Grunt (no type)": its `no` in full, or `none` (fix R1).
+  if (who === 'grunt:none') return ['no', 'none'];
+  return [who.split(':')[1] ?? ''];
+}
+
+/**
+ * Whether a typed text means a Rocket target: every typed word begins a word of its label or its
+ * own words, and one of them is one of its own words in full or the beginning of one by three
+ * letters or more (`gra` is the Grass-type grunt, `gr` nothing: it begins `grunt` too).
+ */
+function meansRocket(label: string, own: readonly string[], words: readonly string[]): boolean {
+  return (
+    begins(`${label} ${own.join(' ')}`, words) &&
+    words.some((word) =>
+      own.some((one) => one === word || (word.length >= 3 && one.startsWith(word))),
+    )
+  );
+}
+
+/**
+ * The Rocket targets as choices of `/want` (design 9.9): those a typed text means
+ * (`meansRocket`), their value the `TargetWant` token. None while nothing is typed.
+ */
+export function rocketWantChoices(typed: string): Choice[] {
+  const words = searchTokens(typed);
+  return rocketTargets()
+    .map((want) => ({ want, label: rocketTargetLabel(targetWantToken(want)) }))
+    .filter(({ want, label }) => meansRocket(label, ownWords(targetWantToken(want)), words))
+    .map(({ want, label }) => ({
+      name: truncate(label, CHOICE_NAME),
+      value: targetWantToken(want),
+    }));
+}
 
 /** What a subject is called: `Dratini`, `Giratina (every form)`, `Mega Charizard Y`, `T5`. */
 export function subjectLabel(ctx: AppContext, subject: BoxSubject): string {
@@ -105,6 +181,12 @@ export function shownBoxes(ctx: AppContext, subject: BoxSubject): WantBox[] {
     dynamaxListed: maxBosses.some((boss) => boss.tier !== 'G' && fits(boss.entry)),
     gigantamaxListed: maxBosses.some((boss) => boss.tier === 'G' && fits(boss.entry)),
     shadowBoss: ctx.raidBosses.bosses().some((boss) => boss.tier.shadow && fits(boss.entry)),
+    // A catch of today's Rocket lineups (plan 8R-2): its shadow can be caught now.
+    rocketCatch: ctx.rocketLineups
+      .choices()
+      .some((choice) =>
+        choice.catches.some((one) => one.key !== null && fits(catalogue.byKey(one.key))),
+      ),
   });
 }
 
@@ -156,6 +238,13 @@ export function readWanted(ctx: AppContext, value: string, own = false): Wanted
   if (token?.kind === 'research-item' || token?.kind === 'research-energy') {
     return { kind: 'reward', want: token };
   }
+  if (token?.kind === 'rocket') return { kind: 'rocket', want: token };
+  const searched = searchText(value);
+  for (const want of rocketTargets()) {
+    if (want.kind === 'rocket' && rocketNames(want).includes(searched)) {
+      return { kind: 'rocket', want };
+    }
+  }
   const folded = foldTaskText(value);
   const { items, energies } = listedRewards(ctx);
   for (const [item, name] of items) {
@@ -206,9 +295,11 @@ export function wantEntries(
     else ivs.push(want.target);
   }
   const rewards: TargetWant[] = [];
+  const rocket: TargetWant[] = [];
   for (const want of targets.wants) {
     const subject = subjectOfTarget(want);
     if (subject) add(subject);
+    else if (want.kind === 'rocket') rocket.push(want);
     else rewards.push(want);
   }
   const entry = (subject: BoxSubject): WantEntry => ({
@@ -250,7 +341,17 @@ export function wantEntries(
       token: targetWantToken(want),
     }))
     .sort((a, b) => byName(a.label, b.label));
-  return [...pokemon, ...tiers, ...ivEntries, ...rewardEntries];
+  // In the order of `rocketTargets` (plan 8R-2): grunts, the decoy, the leaders, Giovanni.
+  const order = rocketTargets().map(targetWantToken);
+  const rocketEntries = rocket
+    .map((want): WantEntry => ({
+      label: targetWantLabel(ctx.gameData.catalogue, want),
+      boxes: [],
+      remove: { kind: 'target', want },
+      token: targetWantToken(want),
+    }))
+    .sort((a, b) => order.indexOf(a.token) - order.indexOf(b.token));
+  return [...pokemon, ...tiers, ...ivEntries, ...rewardEntries, ...rocketEntries];
 }
 
 /** The boxes in the order a line names them. */
diff --git a/src/commands/notifications/want-input.ts b/src/commands/notifications/want-input.ts
index e9115d0526de067dcbcb5c2f04d4e0da7e975637..98caf40c28081d62f95f72ebc09b8ba9d11ba53b 100644
--- a/src/commands/notifications/want-input.ts
+++ b/src/commands/notifications/want-input.ts
@@ -207,6 +207,22 @@ export function wantChoices(ctx: AppContext, typed: string): Choice[] {
       }
     }
 
+    // 1b. The Pokémon of today's Rocket lineups the text finds by name (plan 8R-2, design 9.9):
+    // their shadows can be caught now. A form that is one of several as that form, with its
+    // species after it, as a boss.
+    const catchKeys = new Set(
+      ctx.rocketLineups
+        .choices()
+        .flatMap((choice) => choice.catches.flatMap((one) => (one.key === null ? [] : [one.key]))),
+    );
+    if (catchKeys.size > 0) {
+      for (const hit of ctx.pokemon.find(typed, { filter: (entry) => catchKeys.has(entry.key) })) {
+        if (!hit.named) continue;
+        if (hasForms(catalogue, hit.entry.dex)) add(entryWant(catalogue, hit.entry));
+        add(pokemonTarget(hit.entry.dex));
+      }
+    }
+
     // 2. The tiers and the IV targets.
     wantWordGuesses(typed).forEach(add);
     for (const target of fixedTargets()) {
diff --git a/src/commands/notifications/wants.test.ts b/src/commands/notifications/wants.test.ts
index f06881c82f9e823bc6361d0bd4843c252b376b04..e0f41eb3797870910ac219aa0e3f0219a5b6b98f 100644
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -60,17 +60,23 @@ import {
 import { boxTarget } from '../../domain/notify/target-wants.js';
 import { wantEntries } from './want-boxes.js';
 import type { ResearchTask } from '../../domain/research/task.js';
+import type { RocketChoice } from '../../domain/rocket/lineups.js';
+import { rocketChoicesOfFeed, rocketLineupsFixture } from '../../../test/support/rocket.js';
 
 const OTHER_GUILD = '499999999999999999';
 
 /**
- * The commands over wants in memory. No task list unless a test gives one (`tasks`): the
- * choices of the Pokémon, tiers and IVs are those of before plan 8R-1, which the rewards of
- * research follow.
+ * The commands over wants in memory. No task list unless a test gives one (`tasks`), and no Rocket
+ * lineups unless a test gives them (`lineups`, plan 8R-2): the choices of the Pokémon, tiers and
+ * IVs are those of before plan 8R-1, which the rewards of research and the Rocket targets follow.
  */
-function setup(tasks: readonly ResearchTask[] = []) {
+function setup(tasks: readonly ResearchTask[] = [], lineups: readonly RocketChoice[] = []) {
   const store = new MemoryWants();
-  const { ctx } = createTestContext({ wants: store, researchTasks: researchTasksFixture(tasks) });
+  const { ctx } = createTestContext({
+    wants: store,
+    researchTasks: researchTasksFixture(tasks),
+    rocketLineups: rocketLineupsFixture(lineups),
+  });
   const router = new InteractionRouter(
     ctx,
     [want, unwant, wants, unwantAll],
@@ -454,6 +460,130 @@ describe('/want', () => {
   });
 });
 
+describe('/want: Team GO Rocket (plan 8R-2)', () => {
+  it('wants a grunt type, a leader, any leader, Giovanni and the decoy at once, by choice or name', async () => {
+    const made = setup([], rocketChoicesOfFeed());
+    expect(await made.answer('want', { target: 'grunt:water' })).toBe(
+      'You will get a DM when a **Water-type grunt** is reported in a region you can see, at ' +
+        'most one an hour for each grunt type. `/unwant` takes it off again.',
+    );
+    expect(await made.answer('want', { target: 'Arlo' })).toBe(
+      'You will get a DM when **Arlo** is reported in a region you can see. `/unwant` takes it ' +
+        'off again.',
+    );
+    for (const target of ['any leader', 'giovanni', 'decoy grunt', 'electric grunt']) {
+      await made.run('want', { target });
+    }
+    expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([
+      { kind: 'rocket', who: 'grunt:water' },
+      { kind: 'rocket', who: 'leader:arlo' },
+      { kind: 'rocket', who: 'leader:any' },
+      { kind: 'rocket', who: 'giovanni' },
+      { kind: 'rocket', who: 'decoy' },
+      { kind: 'rocket', who: 'grunt:electric' },
+    ]);
+    expect(made.rows()).toEqual([]);
+  });
+
+  it('reads the untyped grunts typed as none or no type (fix S2)', async () => {
+    const made = setup([], rocketChoicesOfFeed());
+    for (const target of ['none', 'no type', 'No type grunt', 'grunt (no type)']) {
+      expect(await made.answer('want', { target }), target).toMatch(/\*\*Grunt \(no type\)\*\*/);
+    }
+    expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([
+      { kind: 'rocket', who: 'grunt:none' },
+    ]);
+  });
+
+  it('offers the Rocket targets a text begins, after the Pokémon', async () => {
+    const made = setup([], rocketChoicesOfFeed());
+    expect(await made.choices('want', 'giov')).toEqual([
+      { name: 'Giovanni (Team GO Rocket boss)', value: 'giovanni' },
+    ]);
+    const values = async (typed: string) =>
+      (await made.choices('want', typed)).map((choice) => String(choice.value));
+    const rocketOnly = async (typed: string) =>
+      (await values(typed)).filter((value) => /^(grunt|leader):|^(giovanni|decoy)$/.test(value));
+    // After what the Pokémon search finds.
+    const arlo = await values('arl');
+    expect(arlo.at(-1)).toBe('leader:arlo');
+    expect(arlo.slice(0, -1).every((value) => value.startsWith('pokemon:'))).toBe(true);
+    expect(await rocketOnly('any lead')).toEqual(['leader:any']);
+    expect(await values('water')).toContain('grunt:water');
+    // On what names them alone (fix B3): `grunt`, `leader`, `gr` find no Rocket target.
+    expect(await rocketOnly('leader')).toEqual([]);
+    expect(await rocketOnly('grunt')).toEqual([]);
+    expect(await rocketOnly('gr')).toEqual([]);
+    expect(await rocketOnly('gra')).toEqual(['grunt:grass']);
+    expect(await rocketOnly('dragon grunt')).toEqual(['grunt:dragon']);
+    // The untyped grunts by the words of their label (fix R1).
+    expect(await rocketOnly('no type')).toEqual(['grunt:none']);
+    expect(await rocketOnly('none')).toEqual(['grunt:none']);
+    expect(await rocketOnly('grunt no')).toEqual(['grunt:none']);
+  });
+
+  it('words a grunt type with its article (fix B4)', async () => {
+    const made = setup([], rocketChoicesOfFeed());
+    expect(await made.answer('want', { target: 'grunt:electric' })).toMatch(
+      /^You will get a DM when an \*\*Electric-type grunt\*\* is reported/,
+    );
+  });
+
+  it('offers the lineups’ catches a text names before other Pokémon (design 9.9)', async () => {
+    const without = (await setup().choices('want', 'grim')).map((one) => String(one.value));
+    const made = setup([], rocketChoicesOfFeed());
+    const offered = (await made.choices('want', 'grim')).map((one) => String(one.value));
+    // Alolan Grimer, Arlo's catch, first; without the lineups it is not.
+    expect(offered[0]).toBe('pokemon:88:grimer_alola');
+    expect(without[0]).not.toBe('pokemon:88:grimer_alola');
+  });
+
+  it('shows the Shadow box for a Pokémon in today’s lineups that the game master has as no shadow', async () => {
+    const smeargle = catalogueFixture().byDex(235)[0];
+    if (!smeargle) throw new Error('no Smeargle');
+    const boxes = async (lineups: readonly RocketChoice[]) => {
+      const made = setup([], lineups);
+      const dialog = shownDialog(await made.run('want', { target: 'Smeargle' }));
+      return dialog.components.flatMap((component) => {
+        const inner = (component as { component?: { type?: number; options?: unknown[] } })
+          .component;
+        if (inner?.type !== ComponentType.CheckboxGroup) return [];
+        return (inner.options as { value: string }[]).map((option) => option.value);
+      });
+    };
+    expect(await boxes([])).not.toContain('shadow');
+    const decoy: RocketChoice = {
+      key: 'decoy',
+      name: 'Decoy grunt',
+      catches: [{ name: 'Smeargle', key: smeargle.key, dex: 235, shiny: false, image: null }],
+    };
+    expect(await boxes([decoy])).toContain('shadow');
+  });
+
+  it('lists the Rocket targets in /wants, takes them off with /unwant and Remove', async () => {
+    const made = setup([], rocketChoicesOfFeed());
+    await made.run('want', { target: 'grunt:dragon' });
+    await made.run('want', { target: 'leader:cliff' });
+    const message = asV2(answered(await made.run('wants')));
+    expect(textDisplays(message).slice(1, -1)).toEqual([
+      '**Dragon-type grunt**',
+      '**Cliff** (Team GO Rocket leader)',
+    ]);
+    expect(customIdsOf(message)).toEqual([
+      'wantlist:0:remove:rg:dragon',
+      'wantlist:0:remove:rl:cliff',
+      'wantlist:0:all',
+    ]);
+    expect(await made.answer('unwant', { target: 'Cliff' })).toBe(
+      '**Cliff (Team GO Rocket leader)** is off your list.',
+    );
+    await made.handle(
+      fakeButton({ customId: 'wantlist:0:remove:rg:dragon', userId: ALICE, v2Message: true }),
+    );
+    expect(await made.ctx.targetWants.count(ALICE, FAKE_GUILD_ID)).toBe(0);
+  });
+});
+
 describe('/want: the list of choices', () => {
   it('offers the tiers and the IV targets while nothing is typed', async () => {
     const made = setup();
@@ -1270,7 +1400,7 @@ describe('/unwant-all', () => {
     expect(dialog.title).toBe('Remove all your wants');
     expect(dialogText(dialog)).toBe(
       'Remove all 3 entries of your list for this server? You will get no DMs for Pokémon, ' +
-        'raid tiers or research rewards here any more.\n\nSubmit removes them.',
+        'raid tiers, research rewards or Team GO Rocket here any more.\n\nSubmit removes them.',
     );
     expect(dialogChoices(dialog)).toEqual([]);
     expect(made.store.rows).toHaveLength(5);
diff --git a/src/commands/notifications/wants.ts b/src/commands/notifications/wants.ts
index 4339ccb7b8d690b78e46062bfa183e2aaad3f972..3e82e8bbd0374f06217cd000b1daeaa2da14616e 100644
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -17,12 +17,14 @@ import { isRaidLevel, raidTierLabel } from '../../domain/pogo/raid-tier.js';
 import {
   BOX_DESCRIPTIONS,
   BOX_WORDS,
+  rocketTargetLabel,
   type BoxSubject,
   type PokemonBox,
   type WantBox,
 } from '../../domain/pogo/want-boxes.js';
 import { hasForms, type SetWantOutcome } from '../../domain/pogo/wants.js';
 import type { V2Message } from '../../discord/party-gateway.js';
+import type { TargetWant } from '../../domain/notify/target-wants.js';
 import { stopArgs, type NotifyReason } from '../../domain/notify/reasons.js';
 import { renderMemberList } from '../../render/member-list.js';
 import { count, plain, truncate } from '../../render/text.js';
@@ -37,6 +39,7 @@ import {
   readWanted,
   rewardLabel,
   rewardWantChoices,
+  rocketWantChoices,
   shownBoxes,
   subjectLabel,
   wantEntries,
@@ -47,9 +50,12 @@ import { wantChoices, wantLabel, wantName } from './want-input.js';
 import { answer, v2Answer } from '../../discord/late-reply.js';
 import { searchText, searchTokens } from '../../domain/search/text.js';
 
-/** A name with its article: `a T5`, `an Elite`, `an Articuno`. */
-function withArticle(name: string): string {
-  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
+/**
+ * A name with its article: `a T5`, `an Elite`, `an Articuno`; by the name's first letter, `shown`
+ * as it is shown (in bold).
+ */
+function withArticle(name: string, shown = name): string {
+  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${shown}`;
 }
 
 /** What a want does, as the member is told: when a direct message comes. */
@@ -234,6 +240,26 @@ function rewardAnswer(ctx: AppContext, wanted: Wanted & { kind: 'reward' }): str
   );
 }
 
+/**
+ * What `/want` says of a Rocket target it added (plan 8R-2): a grunt type at most one DM an hour
+ * (Matt's answer 3), a leader, any leader, Giovanni or the decoy whenever reported.
+ */
+function rocketWantAnswer(target: TargetWant): string {
+  const who = target.kind === 'rocket' ? target.who : '';
+  const label = plain(rocketTargetLabel(who).replace(/ \(Team GO Rocket \w+\)$/, ''));
+  const grunt = who.startsWith('grunt:');
+  const named =
+    who === 'leader:any'
+      ? '**any Team GO Rocket leader**'
+      : grunt || who === 'decoy'
+        ? withArticle(label, `**${label}**`)
+        : `**${label}**`;
+  return (
+    `You will get a DM when ${named} is reported in a region you can see` +
+    `${grunt ? ', at most one an hour for each grunt type' : ''}. \`/unwant\` takes it off again.`
+  );
+}
+
 /** What a use of `/want` names, read once per interaction (its deferral reads it first). */
 const wantedRead = new WeakMap<object, Wanted>();
 
@@ -268,11 +294,15 @@ function opensDialog(interaction: ChatInputCommandInteraction, ctx: AppContext):
 export const want: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('want')
-    .setDescription('Get a DM when a Pokémon, a raid tier or a research reward is reported')
+    .setDescription(
+      'Get a DM when a Pokémon, a raid tier, a research reward or Team GO Rocket is reported',
+    )
     .addStringOption((option) =>
       option
         .setName('target')
-        .setDescription('A Pokémon, a raid tier, perfect or zero IVs, an item: pick from the list')
+        .setDescription(
+          'A Pokémon, a raid tier, IVs, an item, a grunt type or leader: pick from the list',
+        )
         .setRequired(true)
         .setMaxLength(100)
         .setAutocomplete(true),
@@ -288,9 +318,17 @@ export const want: SimpleCommand = {
       'it; tick what you want, and untick everything to take it off. A species is wanted in ' +
       'every form; to want one form only, pick it from the list or type its name (`Giratina ' +
       'Origin`, `Alolan Rattata`). A raid tier asks about its raids and its shadow raids. ' +
-      'Wanting something again shows what you ticked. Pick from the list that appears while ' +
-      'you type, or type a name or a tier such as `t5`, `mega`, `elite`, `perfect` or `zero`.',
-    examples: ['/want target:Dratini', '/want target:t5', '/want target:Rare Candy'],
+      'Team GO Rocket is wanted at once: a grunt type (`dragon grunt`; at most one direct ' +
+      'message an hour for each type), Cliff, Arlo, Sierra or any leader, Giovanni, or the ' +
+      'decoy grunt. Wanting something again shows what you ticked. Pick from the list that ' +
+      'appears while you type, or type a name or a tier such as `t5`, `mega`, `elite`, ' +
+      '`perfect` or `zero`.',
+    examples: [
+      '/want target:Dratini',
+      '/want target:t5',
+      '/want target:Rare Candy',
+      '/want target:Dragon-type grunt',
+    ],
   },
   enabled: notificationsEnabled,
   guards: [requireGuild],
@@ -313,6 +351,16 @@ export const want: SimpleCommand = {
       await answer(interaction, { content: rewardAnswer(ctx, wanted) });
       return;
     }
+    if (wanted.kind === 'rocket') {
+      await ctx.targetWants.change(
+        memberId,
+        guildId,
+        { add: [wanted.want], remove: [] },
+        Date.now(),
+      );
+      await answer(interaction, { content: rocketWantAnswer(wanted.want) });
+      return;
+    }
     if (wanted.kind === 'iv') {
       const outcome = await ctx.wants.set(memberId, guildId, wanted.target, 'spawn');
       await answer(interaction, { content: ivAnswer(ctx, outcome) });
@@ -341,9 +389,10 @@ export const want: SimpleCommand = {
 
   async autocomplete(interaction, ctx) {
     const typed = interaction.options.getFocused();
-    // The Pokémon, forms, tiers and IVs first; the items and Mega Energy of the task list fill
-    // what is left, at most `REWARD_ROOM` places where the Pokémon would fill the list (B5).
-    const rewards = rewardWantChoices(ctx, typed);
+    // The Pokémon, forms, tiers and IVs first; Team GO Rocket's targets (plan 8R-2) and the items
+    // and Mega Energy of the task list fill what is left, at most `REWARD_ROOM` places where the
+    // Pokémon would fill the list (B5).
+    const rewards = [...rocketWantChoices(typed), ...rewardWantChoices(ctx, typed)];
     const others = wantChoices(ctx, typed).slice(
       0,
       MAX_CHOICES - Math.min(rewards.length, REWARD_ROOM),
@@ -448,7 +497,7 @@ async function removeEntry(
 
 /** What a line of `Wanted` takes away, and what it is called. */
 function removalOf(ctx: AppContext, wanted: Wanted): { what: WantEntry['remove']; name: string } {
-  if (wanted.kind === 'reward') {
+  if (wanted.kind === 'reward' || wanted.kind === 'rocket') {
     return { what: { kind: 'target', want: wanted.want }, name: rewardLabel(ctx, wanted.want) };
   }
   if (wanted.kind === 'iv') {
@@ -464,7 +513,7 @@ function removalOf(ctx: AppContext, wanted: Wanted): { what: WantEntry['remove']
 export const unwant: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('unwant')
-    .setDescription('Stop the DMs for a Pokémon, a raid tier or a research reward')
+    .setDescription('Stop the DMs for a Pokémon, a raid tier, a research reward or Team GO Rocket')
     .addStringOption((option) =>
       option
         .setName('target')
@@ -476,8 +525,8 @@ export const unwant: SimpleCommand = {
   help: {
     category: 'notifications',
     details:
-      'Takes a Pokémon, a raid tier, perfect or zero IVs or a research reward off your list for ' +
-      'this server, whatever you ticked for it. The list that appears while you type shows what ' +
+      'Takes a Pokémon, a raid tier, perfect or zero IVs, a research reward or a Team GO Rocket ' +
+      'target off your list for this server, whatever you ticked for it. The list that appears while you type shows what ' +
       'is on it; you can also type the name as for `/want`. A species and one of its forms are ' +
       'separate entries: each is taken off by itself. To keep some of what you ticked, use ' +
       '`/want` again instead.',
@@ -611,8 +660,9 @@ export const wants: SimpleCommand = {
     category: 'notifications',
     details:
       'Shows your list for this server, ten to a page: each Pokémon once with what you want it ' +
-      'for (`Dratini: Raids, Research, Shadow`), the raid tiers, perfect or zero IVs, and the ' +
-      'research rewards. Each has a Remove button; "Remove all…" asks before it empties the list.',
+      'for (`Dratini: Raids, Research, Shadow`), the raid tiers, perfect or zero IVs, the ' +
+      'research rewards and Team GO Rocket. Each has a Remove button; "Remove all…" asks before ' +
+      'it empties the list.',
     examples: ['/wants'],
   },
   enabled: notificationsEnabled,
@@ -635,7 +685,8 @@ const allWants = removeAllQuestion({
   none: 'Your list for this server is empty: there is nothing to remove.',
   question: (n) =>
     `Remove ${n === 1 ? 'the one entry' : `all ${String(n)} entries`} of your list for this ` +
-    'server? You will get no DMs for Pokémon, raid tiers or research rewards here any more.',
+    'server? You will get no DMs for Pokémon, raid tiers, research rewards or Team GO Rocket ' +
+    'here any more.',
   removed: (n) => `Removed ${count(n, 'entry', 'entries')}: your list for this server is empty.`,
 });
 
diff --git a/src/domain/notify/target-wants.test.ts b/src/domain/notify/target-wants.test.ts
index 0fe02ec34e00cb26868ca3b4786af2582077f611..1a21ed52f01a954c0d3b905dc4c1f6cfef9c3a4e 100644
--- a/src/domain/notify/target-wants.test.ts
+++ b/src/domain/notify/target-wants.test.ts
@@ -15,6 +15,12 @@ const EVERY: readonly TargetWant[] = [
   { kind: 'research-energy', dex: 6 },
   boxTarget('dynamax', 68),
   boxTarget('gigantamax', 849, 'toxtricity_amped'),
+  { kind: 'rocket', who: 'grunt:dragon' },
+  { kind: 'rocket', who: 'grunt:none' },
+  { kind: 'rocket', who: 'leader:sierra' },
+  { kind: 'rocket', who: 'leader:any' },
+  { kind: 'rocket', who: 'giovanni' },
+  { kind: 'rocket', who: 'decoy' },
 ];
 
 describe('the tokens of TargetWant', () => {
@@ -26,6 +32,12 @@ describe('the tokens of TargetWant', () => {
       'research:energy:6',
       'dynamax:68',
       'gigantamax:849:toxtricity_amped',
+      'grunt:dragon',
+      'grunt:none',
+      'leader:sierra',
+      'leader:any',
+      'giovanni',
+      'decoy',
     ]);
     for (const want of EVERY) expect(parseTargetWantToken(targetWantToken(want))).toEqual(want);
   });
@@ -41,8 +53,10 @@ describe('the tokens of TargetWant', () => {
       'research:energy:6:charizard_mega_x',
       'dynamax',
       'dynamax:abc',
-      'grunt:dragon',
-      'giovanni',
+      'grunt:shadow',
+      'grunt:',
+      'leader:jessie',
+      'giovanni:1',
       'research:pokemon:147:dratini:more',
     ]) {
       expect(parseTargetWantToken(token)).toBeUndefined();
@@ -59,5 +73,8 @@ describe('the tokens of TargetWant', () => {
     expect(readTargetWantArgs(['ri', 'Rare Candy'])).toBeUndefined();
     expect(readTargetWantArgs(['re', '6', 'x'])).toBeUndefined();
     expect(readTargetWantArgs(['zz', '6'])).toBeUndefined();
+    expect(readTargetWantArgs(['rg', 'shadow'])).toBeUndefined();
+    expect(readTargetWantArgs(['rl', 'jessie'])).toBeUndefined();
+    expect(readTargetWantArgs(['rv', 'x'])).toBeUndefined();
   });
 });
diff --git a/src/domain/notify/target-wants.ts b/src/domain/notify/target-wants.ts
index 009bd107a1c5f74cc28924ffa4438c2f06cd4689..9379bf199e3c6d5513885319138c1b4de3aad3d6 100644
--- a/src/domain/notify/target-wants.ts
+++ b/src/domain/notify/target-wants.ts
@@ -1,5 +1,7 @@
 import { isFormKey, isPokedexNumber } from '../pogo/notification-target.js';
 import { isItemKey } from '../research/task.js';
+import { LEADERS, parseRocketKey } from '../rocket/lineups.js';
+import { POKEMON_TYPES } from '../pogo/types.js';
 
 /*
  * The wants that are no `PokemonNotification` row (plan 8R-1; design 9.1): table `TargetWant`,
@@ -17,7 +19,20 @@ export type TargetWant =
   | { kind: 'research-item'; item: string }
   | { kind: 'research-energy'; dex: number }
   | { kind: 'dynamax'; dex: number; form?: string }
-  | { kind: 'gigantamax'; dex: number; form?: string };
+  | { kind: 'gigantamax'; dex: number; form?: string }
+  /**
+   * Team GO Rocket (plan 8R-2; design 7, 9.1): who, as its token, `grunt:<type>`, `grunt:none`,
+   * `decoy`, `leader:<cliff|arlo|sierra>`, `giovanni` (a `rocketKey`), or `leader:any`.
+   */
+  | { kind: 'rocket'; who: string };
+
+/** The Rocket target of any leader (design 7: "any leader"). */
+export const ANY_LEADER = 'leader:any';
+
+/** Whether a text is a Rocket target's `who`: a `rocketKey`, or any leader. */
+export function isRocketWho(text: string): boolean {
+  return text === ANY_LEADER || parseRocketKey(text) !== undefined;
+}
 
 /** The kinds of `TargetWant` that are a Pokémon (a box of `/want`'s dialog). */
 export type PokemonBoxKind = 'research-pokemon' | 'dynamax' | 'gigantamax';
@@ -27,7 +42,7 @@ export function boxTarget(kind: PokemonBoxKind, dex: number, form?: string): Tar
   return { kind, dex, ...(form === undefined ? {} : { form }) };
 }
 
-const PREFIX: Readonly<Record<TargetWant['kind'], string>> = {
+const PREFIX: Readonly<Record<Exclude<TargetWant['kind'], 'rocket'>, string>> = {
   'research-pokemon': 'research:pokemon',
   'research-item': 'research:item',
   'research-energy': 'research:energy',
@@ -42,6 +57,8 @@ const PREFIX: Readonly<Record<TargetWant['kind'], string>> = {
  */
 export function targetWantToken(want: TargetWant): string {
   switch (want.kind) {
+    case 'rocket':
+      return want.who;
     case 'research-item':
       return `${PREFIX[want.kind]}:${want.item}`;
     case 'research-energy':
@@ -62,6 +79,7 @@ function dexOf(text: string | undefined): number | undefined {
  * that cannot be one): such a row is left alone, never deleted on its own.
  */
 export function parseTargetWantToken(token: string): TargetWant | undefined {
+  if (isRocketWho(token)) return { kind: 'rocket', who: token };
   const parts = token.split(':');
   const [head, second] = parts;
   if (head === 'research') {
@@ -102,6 +120,8 @@ export function sameTargetWant(a: TargetWant, b: TargetWant): boolean {
  */
 export function targetWantArgs(want: TargetWant): string[] {
   switch (want.kind) {
+    case 'rocket':
+      return rocketArgs(want.who);
     case 'research-item':
       return ['ri', want.item];
     case 'research-energy':
@@ -121,8 +141,38 @@ const ARG_KINDS: Readonly<Record<string, PokemonBoxKind>> = {
   gx: 'gigantamax',
 };
 
+/**
+ * A Rocket target's arguments (plan 8R-2): `rg:<type|none>` a grunt, `rl:<leader|any>` a leader,
+ * `rv` Giovanni, `rd` the decoy.
+ */
+function rocketArgs(who: string): string[] {
+  if (who === 'giovanni') return ['rv'];
+  if (who === 'decoy') return ['rd'];
+  const [head = '', value = ''] = who.split(':');
+  return [head === 'grunt' ? 'rg' : 'rl', value];
+}
+
+const GRUNT_TYPES: ReadonlySet<string> = new Set([...POKEMON_TYPES, 'none']);
+const LEADER_WORDS: ReadonlySet<string> = new Set([...LEADERS, 'any']);
+
+/** The Rocket target a custom id's arguments spell (`rocketArgs`); undefined for any other. */
+function readRocketArgs(args: readonly string[]): TargetWant | undefined {
+  const [kind, value, ...more] = args;
+  if (more.length > 0) return undefined;
+  if (kind === 'rv' || kind === 'rd') {
+    return value === undefined
+      ? { kind: 'rocket', who: kind === 'rv' ? 'giovanni' : 'decoy' }
+      : undefined;
+  }
+  if (value === undefined) return undefined;
+  if (kind === 'rg' && GRUNT_TYPES.has(value)) return { kind: 'rocket', who: `grunt:${value}` };
+  if (kind === 'rl' && LEADER_WORDS.has(value)) return { kind: 'rocket', who: `leader:${value}` };
+  return undefined;
+}
+
 /** The target a custom id's arguments spell (`targetWantArgs`); undefined for anything else. */
 export function readTargetWantArgs(args: readonly string[]): TargetWant | undefined {
+  if (['rg', 'rl', 'rv', 'rd'].includes(args[0] ?? '')) return readRocketArgs(args);
   const [kind, value, form, ...more] = args;
   if (kind === undefined || value === undefined || more.length > 0) return undefined;
   if (kind === 'ri') {
diff --git a/src/domain/pogo/want-boxes.test.ts b/src/domain/pogo/want-boxes.test.ts
index 82de9ae9c61ee6b657b8279e10d4ce7aeb3cedc2..2289b43bfcd51bb467ab74f4158830bd963592e5 100644
--- a/src/domain/pogo/want-boxes.test.ts
+++ b/src/domain/pogo/want-boxes.test.ts
@@ -1,11 +1,14 @@
 import { describe, expect, it } from 'vitest';
 import { boxTarget } from '../notify/target-wants.js';
 import { pokemonTarget, type Want } from './notification-target.js';
+import { catalogueFixture } from '../../../test/support/game-data.js';
 import {
   heldBoxes,
   planBoxes,
   pokemonBoxes,
   subjectOf,
+  subjectOfTarget,
+  targetWantLabel,
   tierBoxes,
   type BoxFacts,
   type BoxSubject,
@@ -96,10 +99,32 @@ describe('the boxes of /want’s dialog', () => {
     expect(pokemonBoxes(facts({ entries: [{ kind: 'mega', shadow: false, key: 'm' }] }))).toEqual([
       'raids',
     ]);
+    // In today's Rocket lineups (plan 8R-2): Shadow, before the game master may have it.
+    expect(pokemonBoxes(facts({ rocketCatch: true }))).toEqual([
+      'raids',
+      'spawns',
+      'research',
+      'shadow',
+    ]);
     expect(tierBoxes('T5')).toEqual(['raids', 'shadow-raids']);
     expect(tierBoxes('Mega')).toEqual(['raids']);
   });
 
+  it('names the Rocket targets, which have no boxes (plan 8R-2)', () => {
+    const label = (who: string) => targetWantLabel(catalogueFixture(), { kind: 'rocket', who });
+    expect(
+      ['grunt:water', 'grunt:none', 'decoy', 'leader:arlo', 'leader:any', 'giovanni'].map(label),
+    ).toEqual([
+      'Water-type grunt',
+      'Grunt (no type)',
+      'Decoy grunt',
+      'Arlo (Team GO Rocket leader)',
+      'Any Team GO Rocket leader',
+      'Giovanni (Team GO Rocket boss)',
+    ]);
+    expect(subjectOfTarget({ kind: 'rocket', who: 'giovanni' })).toBeUndefined();
+  });
+
   it('takes a shadow want for its Pokémon’s subject, and none of IVs', () => {
     expect(subjectOf(pokemonTarget(645, undefined, true))).toEqual({ kind: 'pokemon', dex: 645 });
     expect(subjectOf({ kind: 'tier', tier: { level: 'T5', shadow: true } })).toEqual(T5);
diff --git a/src/domain/pogo/want-boxes.ts b/src/domain/pogo/want-boxes.ts
index 91ef275756cc9059c18167b4b95dfa0663598695..512975c29988c2c16fa1f01847abf74e6f2514eb 100644
--- a/src/domain/pogo/want-boxes.ts
+++ b/src/domain/pogo/want-boxes.ts
@@ -1,9 +1,11 @@
 import {
+  ANY_LEADER,
   boxTarget,
   sameTargetWant,
   type PokemonBoxKind,
   type TargetWant,
 } from '../notify/target-wants.js';
+import { parseRocketKey, rocketName } from '../rocket/lineups.js';
 import type { PokemonCatalogue } from './catalogue.js';
 import type { PokemonEntry } from './game-master.js';
 import { pokemonWantName, speciesNameOf } from './wants.js';
@@ -81,7 +83,9 @@ export function subjectOf(target: NotificationTarget): BoxSubject | undefined {
 
 /** The subject of a `TargetWant` that is a box of a Pokémon (Research, Dynamax, Gigantamax). */
 export function subjectOfTarget(want: TargetWant): BoxSubject | undefined {
-  if (want.kind === 'research-item' || want.kind === 'research-energy') return undefined;
+  if (want.kind === 'research-item' || want.kind === 'research-energy' || want.kind === 'rocket') {
+    return undefined;
+  }
   return want.form === undefined
     ? { kind: 'pokemon', dex: want.dex }
     : { kind: 'pokemon', dex: want.dex, form: want.form };
@@ -198,13 +202,16 @@ export interface BoxFacts {
   gigantamaxListed: boolean;
   /** Whether it is a shadow raid boss now. */
   shadowBoss: boolean;
+  /** Whether it can be caught from Team GO Rocket today (plan 8R-2: the lineups' catches). */
+  rocketCatch?: boolean;
 }
 
 /**
  * The boxes a Pokémon's dialog shows (design 7: only what can happen): Raids always; Dynamax
  * and Gigantamax where the game master has it so or the max boss list does; Spawns where it is
  * met in the wild; Research for anything but a mega; Shadow where the game master says it can be
- * a shadow or it is a shadow raid boss now (8R-2 adds today's Rocket lineups). A mega: Raids only.
+ * a shadow, it is a shadow raid boss now, or it is in today's Rocket lineups (plan 8R-2: new
+ * shadows of a Takeover are listed before the game master may have them). A mega: Raids only.
  */
 export function pokemonBoxes(facts: BoxFacts): PokemonBox[] {
   const { entries } = facts;
@@ -216,8 +223,13 @@ export function pokemonBoxes(facts: BoxFacts): PokemonBox[] {
   if (facts.gigantamaxListed || any(facts.canGigantamax)) shown.add('gigantamax');
   if (any(facts.wild)) shown.add('spawns');
   if (any((entry) => entry.kind !== 'mega')) shown.add('research');
-  if (facts.shadowBoss || any((entry) => entry.kind !== 'mega' && entry.shadow))
+  if (
+    facts.shadowBoss ||
+    facts.rocketCatch === true ||
+    any((entry) => entry.kind !== 'mega' && entry.shadow)
+  ) {
     shown.add('shadow');
+  }
   return POKEMON_BOXES.filter((box) => shown.has(box));
 }
 
@@ -251,9 +263,26 @@ export function targetWantLabel(
       return `Dynamax ${pokemonWantName(catalogue, pokemonTarget(want.dex, want.form))}`;
     case 'gigantamax':
       return `Gigantamax ${pokemonWantName(catalogue, pokemonTarget(want.dex, want.form))}`;
+    case 'rocket':
+      return rocketTargetLabel(want.who);
   }
 }
 
+/**
+ * What a Rocket target is called (plan 8R-2): `Water-type grunt`, `Grunt (no type)`, `Decoy
+ * grunt`, `Arlo (Team GO Rocket leader)`, `Any Team GO Rocket leader`, `Giovanni (Team GO
+ * Rocket boss)`.
+ */
+export function rocketTargetLabel(who: string): string {
+  if (who === ANY_LEADER) return 'Any Team GO Rocket leader';
+  const parsed = parseRocketKey(who);
+  if (!parsed) return who;
+  const name = rocketName(parsed);
+  if (parsed.kind === 'leader') return `${name} (Team GO Rocket leader)`;
+  if (parsed.kind === 'giovanni') return `${name} (Team GO Rocket boss)`;
+  return name;
+}
+
 /** The boxes a tier's dialog shows: Raids, and Shadow raids where the tier has shadow raids. */
 export function tierBoxes(level: RaidLevel): TierBox[] {
   const shadow = raidTier(level, true);
````

### Task 8: 8R-2 task 8: direct messages of Team GO Rocket

Prototype commit: `e52bbe2e8c6cefd95ed8597866140c2b0978bca2`

NotifyService.rocketReported, told by RocketService once a grunt's
messages are posted: who wants the report is told, one DM per region
channel that holds the stop, when they can view the channel, not the
reporter, only under features.notifications. A report fires a want of its
grunt type, its leader or any leader, Giovanni or the decoy
(rocketTargets, rocketWantsFiring) and a Shadow want of a Pokemon it can
give, the species or the very form (rocketShadowFiring: the shadow row now
means shadow raids and Rocket catches; a raid or spawn want does not).

A grunt goes at the spawn priority, at most one DM an hour per member and
grunt type (in memory, as max battles' hour; the DM's small print says
so), with "Go to report" to its message in that channel; a hideout at the
normal priority, never twice to a member for the same hideout at the same
stop in a day, with "Go to post" to the message of the pinned post holding
it. No link in rehearsal mode. The DM: "A Water-type grunt has been
reported in #west by Rita." (an, a or the leader's name), what can be
caught, the stop with its address line, when it goes or until when it
stands; the Stop buttons of the Rocket targets.

**Files:**

```
 src/app.ts                                 |   2 +
 src/components/dm.test.ts                  |  19 ++++++
 src/domain/notify/reasons.test.ts          |  41 ++++++++++++-
 src/domain/notify/reasons.ts               |  60 ++++++++++++++++++-
 src/render/rocket.test.ts                  |  23 ++++++++
 src/render/rocket.ts                       |  56 ++++++++++++++++++
 src/services/notify-service.rocket.test.ts | 220 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/notify-service.ts             | 151 ++++++++++++++++++++++++++++++++++++++++++++++-
 8 files changed, 569 insertions(+), 3 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/components/dm.test.ts src/domain/notify/reasons.test.ts src/render/rocket.test.ts src/services/notify-service.rocket.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff e52bbe2e8c6cefd95ed8597866140c2b0978bca2 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-2 task 8: direct messages of Team GO Rocket`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 2fa7b9c29fb53f558a1adba4430b3ae55488a493..e4fff99f716bd7cbb3cbee5dd10eed2e517a64b9 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -483,11 +483,13 @@ export async function startApp(
         reports: stopReports,
         log,
       });
+  // Who wants a Rocket report hears of it once its messages are posted (plan 8R-2, design 7).
   const rocket = new RocketService({
     reports: stopReports,
     messages: gruntMessages,
     regions,
     guilds,
+    notify,
     log,
   });
   const lines = new PartyLines({
diff --git a/src/components/dm.test.ts b/src/components/dm.test.ts
index c14a4d6dee20bc753b303fa1aa81fc5ee84e56ca..5cea2ba329257bc0dd38258e83dd3f4d4ba2a9bc 100644
--- a/src/components/dm.test.ts
+++ b/src/components/dm.test.ts
@@ -147,6 +147,25 @@ describe('the "Stop" buttons under a direct message', () => {
     expect(await made.wants.count(ALICE, HOME)).toBe(1);
   });
 
+  it('removes a Team GO Rocket target: a grunt type, any leader (plan 8R-2)', async () => {
+    const made = setup();
+    const grunt: TargetWant = { kind: 'rocket', who: 'grunt:dragon' };
+    const leaders: TargetWant = { kind: 'rocket', who: 'leader:any' };
+    await made.ctx.targetWants.change(ALICE, HOME, { add: [grunt, leaders], remove: [] }, 0);
+    const reasons: NotifyReason[] = [
+      { kind: 'target', want: grunt },
+      { kind: 'target', want: leaders },
+    ];
+    expect(made.said(await made.press(ALICE, reasons[0]!, reasons))).toBe(
+      'Removed **Dragon-type grunt** from your list for that server. `/want` there adds it again.',
+    );
+    expect(made.said(await made.press(ALICE, reasons[1]!, reasons))).toBe(
+      'Removed **Any Team GO Rocket leader** from your list for that server. `/want` there adds ' +
+        'it again.',
+    );
+    expect(await made.ctx.targetWants.count(ALICE, HOME)).toBe(0);
+  });
+
   it('says so when the want it removed was for raids and spawns', async () => {
     const made = setup();
     const dratini = pokemonTarget(147);
diff --git a/src/domain/notify/reasons.test.ts b/src/domain/notify/reasons.test.ts
index ef78fe4a18d7045a7ba3a3b40ce3db3294a85b0c..b289a6451b393f79f4fa6262edd2e44ee4e884ba 100644
--- a/src/domain/notify/reasons.test.ts
+++ b/src/domain/notify/reasons.test.ts
@@ -7,9 +7,13 @@ import {
   type Want,
 } from '../pogo/notification-target.js';
 import type { RaidLevel } from '../pogo/raid-tier.js';
-import { boxTarget } from './target-wants.js';
+import { boxTarget, type TargetWant } from './target-wants.js';
 import type { TaskReward } from '../research/task.js';
 import {
+  rocketShadowFiring,
+  rocketShadowNumbers,
+  rocketTargets,
+  rocketWantsFiring,
   maxTargets,
   maxWantsFiring,
   researchTargets,
@@ -250,6 +254,38 @@ describe('researchWantsFiring (plan 8R-1)', () => {
   });
 });
 
+describe('Rocket wants (plan 8R-2)', () => {
+  it('fires the who of a report, and any leader for a leader', () => {
+    const wants: TargetWant[] = [
+      { kind: 'rocket', who: 'grunt:water' },
+      { kind: 'rocket', who: 'leader:any' },
+      { kind: 'rocket', who: 'leader:arlo' },
+      boxTarget('research-pokemon', 258),
+    ];
+    expect(rocketWantsFiring(wants, 'grunt:water')).toEqual([wants[0]]);
+    expect(rocketWantsFiring(wants, 'leader:arlo')).toEqual([wants[1], wants[2]]);
+    expect(rocketWantsFiring(wants, 'leader:cliff')).toEqual([wants[1]]);
+    expect(rocketWantsFiring(wants, 'giovanni')).toEqual([]);
+    expect(rocketTargets('leader:sierra')).toEqual([
+      { kind: 'rocket', who: 'leader:sierra' },
+      { kind: 'rocket', who: 'leader:any' },
+    ]);
+  });
+
+  it('fires a shadow want of a catch, the species or the very form, nothing else', () => {
+    const grimer = entryOf('grimer_alola');
+    const catches = [grimer, { dex: null, key: null }];
+    expect(rocketShadowNumbers(catches)).toEqual([88]);
+    const shadowSpecies = want(pokemonTarget(88, undefined, true), 'raid');
+    const shadowForm = want(pokemonTarget(88, 'grimer_alola', true), 'raid');
+    const shadowOther = want(pokemonTarget(88, 'grimer', true), 'raid');
+    const plainWant = want(pokemonTarget(88), 'both');
+    expect(
+      rocketShadowFiring(catalogue, [shadowSpecies, shadowForm, shadowOther, plainWant], catches),
+    ).toEqual([shadowSpecies.target, shadowForm.target]);
+  });
+});
+
 describe('reasonKey', () => {
   it('is one text per reason, different for different reasons', () => {
     const keys = [
@@ -294,6 +330,9 @@ describe('stopArgs and parseStopArgs', () => {
     [{ kind: 'target', want: boxTarget('research-pokemon', 147) }, ['rp', '147']],
     [{ kind: 'target', want: boxTarget('dynamax', 68, 'machamp') }, ['dx', '68', 'machamp']],
     [{ kind: 'target', want: { kind: 'research-item', item: 'rare-candy' } }, ['ri', 'rare-candy']],
+    [{ kind: 'target', want: { kind: 'rocket', who: 'grunt:water' } }, ['rg', 'water']],
+    [{ kind: 'target', want: { kind: 'rocket', who: 'leader:any' } }, ['rl', 'any']],
+    [{ kind: 'target', want: { kind: 'rocket', who: 'giovanni' } }, ['rv']],
     [{ kind: 'subject', subject: { kind: 'pokemon', dex: 147 } }, ['sp', '147']],
     [
       { kind: 'subject', subject: { kind: 'pokemon', dex: 37, form: 'vulpix_alola' } },
diff --git a/src/domain/notify/reasons.ts b/src/domain/notify/reasons.ts
index 96b7082bed28fac4fff020a7d79b79113febfb67..86ab42f2b62515ea5c6ac02402013abd3d3d3deb 100644
--- a/src/domain/notify/reasons.ts
+++ b/src/domain/notify/reasons.ts
@@ -14,6 +14,7 @@ import { pokemonWantFits, wantToken } from '../pogo/wants.js';
 import type { BoxSubject } from '../pogo/want-boxes.js';
 import type { TaskReward } from '../research/task.js';
 import {
+  ANY_LEADER,
   boxTarget,
   readTargetWantArgs,
   targetWantArgs,
@@ -217,6 +218,62 @@ export function researchWantsFiring(
   });
 }
 
+/**
+ * The targets a want for a Rocket report may be stored under (`TargetWant`; plan 8R-2, design
+ * 7): its own who (`grunt:water`, `leader:arlo`, `giovanni`, `decoy`), and for a leader any
+ * leader too. What `TargetWantStorage.wanting` is asked for.
+ */
+export function rocketTargets(subjectKey: string): TargetWant[] {
+  const own: TargetWant = { kind: 'rocket', who: subjectKey };
+  return subjectKey.startsWith('leader:') ? [own, { kind: 'rocket', who: ANY_LEADER }] : [own];
+}
+
+/** Those of a member's targets a Rocket report is for (`rocketTargets`). */
+export function rocketWantsFiring(wants: readonly TargetWant[], subjectKey: string): TargetWant[] {
+  const fired = new Set(rocketTargets(subjectKey).map(targetWantToken));
+  return wants.filter((want) => want.kind === 'rocket' && fired.has(targetWantToken(want)));
+}
+
+/** A Pokémon that can be caught from a Rocket report, as the game data has it. */
+export interface RocketCatchEntry {
+  dex: number | null;
+  key: string | null;
+}
+
+/**
+ * The numbers under which a shadow want for a Rocket report's catches may be stored
+ * (`PokemonNotification.pokemon`): the catches' Pokédex numbers. What `WantStorage.wanting` is
+ * asked for; a row found by them is a candidate, which `rocketShadowFiring` judges.
+ */
+export function rocketShadowNumbers(catches: readonly RocketCatchEntry[]): number[] {
+  return [...new Set(catches.flatMap((one) => (one.dex === null ? [] : [one.dex])))];
+}
+
+/**
+ * Those of a member's wants a Rocket report fires (design 7, Matt's answer 1): a shadow want
+ * (Shadow box: shadow raids and Rocket catches) of a Pokémon it can give, the species in any form
+ * or the very form (`pokemonWantFits`, as the shadow row is keyed). Raid and spawn wants are not.
+ */
+export function rocketShadowFiring(
+  catalogue: Pick<PokemonCatalogue, 'byKey'>,
+  wants: readonly Want[],
+  catches: readonly RocketCatchEntry[],
+): NotificationTarget[] {
+  return wants
+    .filter(
+      ({ target }) =>
+        target.kind === 'pokemon' &&
+        target.shadow === true &&
+        catches.some(
+          (one) =>
+            one.dex !== null &&
+            one.key !== null &&
+            pokemonWantFits(catalogue, target, { dex: one.dex, key: one.key }, true),
+        ),
+    )
+    .map((want) => want.target);
+}
+
 /** A reported wild Pokémon as far as wants are matched against it. */
 export interface SpawnSighting {
   /** The catalogue entry that was reported. */
@@ -264,7 +321,8 @@ export function spawnWantsFiring(
  * - `g:<gym id>` a gym target;
  * - `boss` the setting "tell me when my egg gets its boss", `train` the setting for new trains;
  * - a want of `TargetWant` as `targetWantArgs` spells it (`rp:<dex>[:<form>]`, `ri:<item>`,
- *   `re:<dex>`, `dx:<dex>[:<form>]`, `gx:<dex>[:<form>]`; plan 8R-1);
+ *   `re:<dex>`, `dx:<dex>[:<form>]`, `gx:<dex>[:<form>]`; plan 8R-1; and Team GO Rocket's
+ *   `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`; plan 8R-2);
  * - `sp:<dex>[:<form>]`, `st:<level>`: every box of a Pokémon or a tier (a line of `/wants`).
  *
  * A form key may be 64 characters, so with the server's snowflake before it an id can pass
diff --git a/src/render/rocket.test.ts b/src/render/rocket.test.ts
index 92e7c2a53b718bab6a584bc593326d3421ce6989..252cb5b4d4e9435e0332cde74dce7b9320ae4348 100644
--- a/src/render/rocket.test.ts
+++ b/src/render/rocket.test.ts
@@ -4,9 +4,11 @@ import { feedChoice } from '../../test/support/rocket.js';
 import { reportedStop } from '../../test/support/stop-report-cases.js';
 import {
   catchWords,
+  gruntHourNote,
   gruntMessage,
   gruntTextMessage,
   ROCKET_COLOUR,
+  rocketDmSentence,
   type GruntView,
 } from './rocket.js';
 
@@ -73,6 +75,27 @@ describe('gruntTextMessage', () => {
   });
 });
 
+describe('gruntHourNote', () => {
+  it('says the hour without making a plural of the name (fix B4)', () => {
+    expect(gruntHourNote()).toBe("You won't be told about this grunt type again for an hour.");
+  });
+});
+
+describe('rocketDmSentence', () => {
+  it('names a grunt with its article and a leader by name, plain and without links', () => {
+    const reporter = { id: '200000000000000061', name: 'Ash' };
+    const sentence = (name: string, named: boolean) =>
+      rocketDmSentence({ name, named, regionChannelId: '1', reporter });
+    expect(sentence('Electric-type grunt', false)).toBe(
+      'An **Electric-type grunt** has been reported in <#1> by **Ash**.',
+    );
+    expect(sentence('Decoy grunt', false)).toBe(
+      'A **Decoy grunt** has been reported in <#1> by **Ash**.',
+    );
+    expect(sentence('Arlo', true)).toBe('**Arlo** has been reported in <#1> by **Ash**.');
+  });
+});
+
 describe('catchWords', () => {
   it('names one catch alone and several as one of them, the first few and the rest counted', () => {
     expect(catchWords(feedChoice('decoy').catches)).toBe('Bellsprout');
diff --git a/src/render/rocket.ts b/src/render/rocket.ts
index 97f267c07df059cccca348d03f83a185dda85875..e70f1ec51ebbd7a38c77a9c0fff79d8210624f23 100644
--- a/src/render/rocket.ts
+++ b/src/render/rocket.ts
@@ -14,6 +14,7 @@ import { mapMarkdown } from './raid-post.js';
 import { stopLine } from './research.js';
 import {
   memberByName,
+  memberName,
   plain,
   plainNoLinks,
   timestamp,
@@ -216,6 +217,61 @@ export function alreadyReported(standing: RocketReport, link: string | undefined
   );
 }
 
+/**
+ * The first line of a direct message about Team GO Rocket (plan 8R-2; design 7): who, where and
+ * by whom, everything through `plainNoLinks` (it reaches other members' DMs): `A **Water-type
+ * grunt** has been reported in #west by **Rita**.`, `**Arlo** has been reported …`.
+ */
+export function rocketDmSentence(view: {
+  name: string;
+  /** A grunt or the decoy is "a" one; a leader and Giovanni are named. */
+  named: boolean;
+  regionChannelId: string;
+  reporter: NamedMember;
+}): string {
+  const name = `**${plainNoLinks(view.name)}**`;
+  return (
+    `${view.named ? name : capitalised(withArticle(view.name, name))} has been reported in ` +
+    `<#${view.regionChannelId}> by **${memberName(view.reporter)}**.`
+  );
+}
+
+/**
+ * Team GO Rocket in brief, for a direct message (`notifyDm`): what can be caught, the stop with
+ * its address line, and when the report goes (a grunt) or until when it stands (a hideout), with
+ * the first catch's picture and Rocket's colour.
+ */
+export function rocketDmBrief(view: {
+  catches: readonly RocketCatch[];
+  stop: Pick<ReportedStop, 'name' | 'address'>;
+  /** A grunt: when its report goes; a hideout: until when, as a sentence ends it. */
+  ends: { goneAt: number } | { until: string };
+}): { accent: number; picture?: string; lines: string[] } {
+  const picture = view.catches.find((one) => one.image !== null)?.image ?? undefined;
+  const catches = catchWords(view.catches);
+  const ends =
+    'goneAt' in view.ends
+      ? `The report goes away ${timestamp(view.ends.goneAt, 'R')}.`
+      : `${view.ends.until.charAt(0).toUpperCase()}${view.ends.until.slice(1)}.`;
+  return {
+    accent: ROCKET_COLOUR,
+    ...(picture === undefined ? {} : { picture }),
+    lines: [
+      ...(catches === '' ? [] : [`**Catch** ${catches}`]),
+      `- ${rocketStopLine(view.stop)}`,
+      ends,
+    ],
+  };
+}
+
+/**
+ * The note of a grunt's DM (Matt's answer 3): the hour in which no more of the type is told,
+ * without a plural made of the name (fix B4: "Grunt (no type)s").
+ */
+export function gruntHourNote(): string {
+  return "You won't be told about this grunt type again for an hour.";
+}
+
 /**
  * A grunt's report where the bot may not post embeds (as `spawnTextMessage`): the same in a
  * sentence or two of classic text, without pictures.
diff --git a/src/services/notify-service.rocket.test.ts b/src/services/notify-service.rocket.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..399a27e32f16e785924510ecb128877ffc3b4e2f
--- /dev/null
+++ b/src/services/notify-service.rocket.test.ts
@@ -0,0 +1,220 @@
+import { describe, expect, it } from 'vitest';
+import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
+import { dmBrief, dmReasons, dmSentence, linksOf, textOf } from '../../test/support/messages.js';
+import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
+import { partyServiceWith } from '../../test/support/party-service.js';
+import { feedChoice } from '../../test/support/rocket.js';
+import { MemoryGruntMessages } from '../../test/support/rocket-store.js';
+import { reportedStop } from '../../test/support/stop-report-cases.js';
+import { MemoryStopReports } from '../../test/support/stop-reports.js';
+import { watchEachTest } from '../../test/support/timers.js';
+import type { TargetWant } from '../domain/notify/target-wants.js';
+import { pokemonTarget } from '../domain/pogo/notification-target.js';
+import type { ReportedStop } from '../domain/stops/report.js';
+import { postLink } from '../render/notify-dm.js';
+import { DM_PRIORITY } from './dm-sender.js';
+import { GruntMessageService } from './grunt-messages.js';
+import type { NotifyServiceOptions } from './notify-service.js';
+import { MAX_WANT_QUIET_MS } from './notify-service.js';
+import { RocketService, rocketSubject } from './rocket-reports.js';
+import { StopReportService } from './stop-reports.js';
+
+const background = watchEachTest();
+const RITA = { id: REPORTER, name: 'Rita' };
+
+/** Stops in West (40.0–40.1, −80.1–−80.0), one in East, one in both (on their border). */
+const west = (n: number): ReportedStop => reportedStop(n, { lat: 40.05 + n / 1_000, lon: -80.05 });
+const east = reportedStop(90, { lat: 40.05, lon: -79.95 });
+
+const rocketWant = (who: string): TargetWant => ({ kind: 'rocket', who });
+
+/** The notifier of the party tests, told of Rocket reports through the Rocket service. */
+async function rocketWith(notifying: Partial<NotifyServiceOptions> = {}, rehearsal = false) {
+  const made = await partyServiceWith([], { notifying });
+  const reports = new StopReportService({
+    store: new MemoryStopReports(),
+    events: { researchEvents: () => [] },
+    zone: made.settings.timezone,
+    log: made.log,
+    now: () => made.clock.now,
+  });
+  const messages = rehearsal
+    ? undefined
+    : new GruntMessageService({
+        gateway: made.gateway,
+        store: new MemoryGruntMessages(),
+        reports,
+        log: made.log,
+        now: () => made.clock.now,
+        setTimer: () => () => undefined,
+      });
+  const rocket = new RocketService({
+    reports,
+    messages,
+    regions: made.regions,
+    guilds: {
+      idFor: (snowflake) => Promise.resolve(snowflake === made.gateway.guildId ? 1 : undefined),
+    },
+    notify: made.notify,
+    log: made.log,
+  });
+  const want = (memberId: string, ...targets: TargetWant[]) =>
+    made.targetWants.change(memberId, made.gateway.guildId, { add: targets, remove: [] }, 0);
+  const report = async (
+    key: string,
+    stop: ReportedStop = west(1),
+    reporter: { id: string; name: string } = RITA,
+  ) => {
+    const outcome = await rocket.report({
+      serverId: made.gateway.guildId,
+      stop,
+      subject: rocketSubject(feedChoice(key)),
+      reporter,
+    });
+    await made.notify.flush();
+    return outcome;
+  };
+  return { ...made, reports, rocket, want, report };
+}
+
+describe('NotifyService: Team GO Rocket is reported (plan 8R-2, design 7)', () => {
+  it('tells who wants the grunt type, linking to its message, at the spawn priority', async () => {
+    const made = await rocketWith();
+    await made.want(ALICE, rocketWant('grunt:water'));
+    await made.want(BOB, rocketWant('grunt:fire'));
+    await made.want(REPORTER, rocketWant('grunt:water'));
+    const outcome = await made.report('grunt:water');
+    if (outcome.kind !== 'reported') throw new Error('not reported');
+    expect(made.dms.recipients).toEqual([ALICE]);
+    const [message] = made.dms.to(ALICE);
+    expect(dmSentence(message)).toBe(
+      `A **Water-type grunt** has been reported in <#${WEST_CHANNEL}> by **Rita**.`,
+    );
+    expect(dmBrief(message)).toEqual([
+      '**Catch** one of Mudkip, Tentacool, Krabby, Magikarp, Feebas',
+      '- **Yellow Mural 1** · Market Street',
+      `The report goes away <t:${String(Math.floor(outcome.report.endsAt / 1_000))}:R>.`,
+    ]);
+    expect(dmReasons(message)).toEqual(['Water-type grunt']);
+    expect(linksOf(message)).toEqual([
+      `Go to report ${postLink(made.gateway.guildId, WEST_CHANNEL, outcome.posted[0]?.messageId ?? '')}`,
+    ]);
+    expect(textOf(message)).toContain('this grunt type again for an hour');
+    expect(made.dms.jobs[0]).toEqual(
+      expect.objectContaining({ priority: DM_PRIORITY.spawn, expiresAt: outcome.report.endsAt }),
+    );
+  });
+
+  it('tells a member of a grunt type at most once an hour', async () => {
+    const made = await rocketWith();
+    await made.want(ALICE, rocketWant('grunt:water'));
+    await made.report('grunt:water', west(1));
+    await made.report('grunt:water', west(2));
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+    // Another type is another hour.
+    await made.want(ALICE, rocketWant('grunt:fire'));
+    await made.report('grunt:fire', west(3));
+    expect(made.dms.to(ALICE)).toHaveLength(2);
+    made.clock.now += MAX_WANT_QUIET_MS;
+    await made.report('grunt:water', west(4));
+    expect(made.dms.to(ALICE)).toHaveLength(3);
+  });
+
+  it('keeps the hour of a grunt type for reports told at once (fix B1)', async () => {
+    const made = await rocketWith();
+    await made.want(ALICE, rocketWant('grunt:water'));
+    // Two reports of the type, the second before the first is worked off.
+    const report = (stop: ReportedStop) =>
+      made.rocket.report({
+        serverId: made.gateway.guildId,
+        stop,
+        subject: rocketSubject(feedChoice('grunt:water')),
+        reporter: RITA,
+      });
+    await Promise.all([report(west(1)), report(west(2))]);
+    await made.notify.flush();
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+
+  it('tells a Shadow want also where no TargetWant is kept (fix B8)', async () => {
+    const made = await rocketWith({ targetWants: undefined });
+    await made.wants.set(ALICE, made.gateway.guildId, pokemonTarget(258, undefined, true), 'raid');
+    await made.report('grunt:water');
+    expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Shadow Mudkip']]);
+  });
+
+  it('tells who wants a shadow of a catch: the species, or the very form', async () => {
+    const made = await rocketWith();
+    const grimer = feedChoice('leader:arlo').catches[0];
+    await made.wants.set(ALICE, made.gateway.guildId, pokemonTarget(258, undefined, true), 'raid');
+    await made.wants.set(
+      BOB,
+      made.gateway.guildId,
+      pokemonTarget(88, grimer?.key ?? '', true),
+      'raid',
+    );
+    // A raid want of the species, not its shadow, is no Rocket want.
+    await made.wants.set(CAROL, made.gateway.guildId, pokemonTarget(258), 'both');
+    await made.report('grunt:water');
+    await made.report('leader:arlo', west(2));
+    expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Shadow Mudkip']]);
+    expect(made.dms.to(BOB)).toHaveLength(1);
+    expect(made.dms.recipients).not.toContain(CAROL);
+  });
+
+  it('tells of a hideout by its leader or any leader, linking to the post, once a day', async () => {
+    const asked: string[] = [];
+    const made = await rocketWith({
+      researchPosts: {
+        messageOf: (channelId, subjectKey) => {
+          asked.push(`${channelId} ${subjectKey}`);
+          return Promise.resolve('300000000000000077');
+        },
+      },
+    });
+    await made.want(ALICE, rocketWant('leader:arlo'));
+    await made.want(BOB, rocketWant('leader:any'));
+    await made.want(CAROL, rocketWant('giovanni'));
+    await made.report('leader:arlo');
+    expect(made.dms.recipients.sort()).toEqual([ALICE, BOB].sort());
+    const [message] = made.dms.to(ALICE);
+    expect(dmSentence(message)).toBe(
+      `**Arlo** has been reported in <#${WEST_CHANNEL}> by **Rita**.`,
+    );
+    expect(dmBrief(message).at(-1)).toBe('Until midnight.');
+    expect(asked).toEqual([`${WEST_CHANNEL} leader:arlo`]);
+    expect(linksOf(message)).toEqual([
+      `Go to post ${postLink(made.gateway.guildId, WEST_CHANNEL, '300000000000000077')}`,
+    ]);
+    expect(made.dms.jobs[0]?.priority).toBe(DM_PRIORITY.normal);
+    // The same hideout again, or reported anew after being taken back: nobody told twice.
+    await made.report('leader:arlo', west(1), { id: BOB, name: 'Bob' });
+    const standing = await made.reports.rocketAt(made.gateway.guildId, west(1).key);
+    await made.reports.takeBack(made.gateway.guildId, [standing?.id ?? 0], BOB, false);
+    await made.report('leader:arlo');
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+    // Arlo at another stop is news.
+    await made.report('leader:arlo', west(2));
+    expect(made.dms.to(ALICE)).toHaveLength(2);
+  });
+
+  it('tells only who can view the region channel, with no link in rehearsal mode', async () => {
+    const made = await rocketWith({}, true);
+    await made.want(ALICE, rocketWant('grunt:water'));
+    await made.want(BOB, rocketWant('grunt:water'));
+    made.gateway.shutOut(EAST_CHANNEL, BOB);
+    await made.report('grunt:water', east);
+    expect(made.dms.recipients).toEqual([ALICE]);
+    expect(linksOf(made.dms.to(ALICE)[0])).toEqual([]);
+  });
+
+  it('tells nobody where notifications are off', async () => {
+    const made = await rocketWith();
+    made.settings.features.notifications = false;
+    await made.want(ALICE, rocketWant('grunt:water'));
+    await made.report('grunt:water');
+    expect(made.dms.recipients).toEqual([]);
+    made.settings.features.notifications = true;
+    await background.settle();
+  });
+});
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index af139a2280b208ee8757186021fe2313409d753f..6d83a6232ce1818f3040d899393c9e4b05238986 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -19,6 +19,10 @@ import {
   reasonKey,
   researchTargets,
   researchWantsFiring,
+  rocketShadowFiring,
+  rocketShadowNumbers,
+  rocketTargets,
+  rocketWantsFiring,
   spawnNumbers,
   spawnWantsFiring,
   type NotifyReason,
@@ -83,7 +87,9 @@ import type { PartyStore } from './party-store.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 import { regionsAtPoint, type RegionProvider } from './region-directory.js';
 import type { SpawnNews } from './spawn-service.js';
-import type { ResearchNews } from './stop-reports.js';
+import { isHideoutReport, type ResearchNews } from './stop-reports.js';
+import type { RocketNews } from './rocket-reports.js';
+import { gruntHourNote, rocketDmBrief, rocketDmSentence } from '../render/rocket.js';
 import type { StopReport } from '../domain/stops/report.js';
 
 /**
@@ -311,6 +317,16 @@ export class NotifyService implements PartyNotifier {
    * stop in one period (design 7). In memory, lost on a restart.
    */
   private readonly researchTold = new BoundedMap<string, true>(RESEARCH_TOLD_KEPT);
+  /**
+   * When a member was last told of a grunt of a type (`<server> <member> <grunt key>`), for the
+   * hour of Matt's answer 3 (plan 8R-2); in memory, lost on a restart, as `maxHeard`.
+   */
+  private readonly rocketHeard = new BoundedMap<string, number>(MAX_HEARD_KEPT);
+  /**
+   * The hideouts a member was told of (`<server> <member> <day> <who> <stop>`): never twice for
+   * the same hideout at the same stop in a day (plan 8R-2). In memory, lost on a restart.
+   */
+  private readonly rocketTold = new BoundedMap<string, true>(RESEARCH_TOLD_KEPT);
   private readonly lines = new KeyedLock<string>();
   private readonly background = new Set<Promise<void>>();
   private readonly snowflakes = new Map<number, string>();
@@ -818,6 +834,139 @@ export class NotifyService implements PartyNotifier {
     }
   }
 
+  /**
+   * Team GO Rocket was reported (`RocketService`; plan 8R-2, design 7): who wants it is told, one
+   * DM per region channel that holds its stop, when they can view the channel; not the reporter.
+   * A report fires a want of its grunt type, its leader (or any leader), Giovanni or the decoy
+   * (`rocketWantsFiring`), and a Shadow want of a Pokémon it can give (`rocketShadowFiring`: the
+   * shadow row means shadow raids and Rocket catches). A grunt goes at the spawn priority, at
+   * most one an hour per member and grunt type (`MAX_WANT_QUIET_MS`, Matt's answer 3; the DM says
+   * so), linking to its message in that channel; a hideout at the normal priority, never twice to
+   * a member for the same hideout at the same stop in a day (`rocketTold`), linking to the
+   * message of the pinned post that holds it (`researchPosts`). No link in rehearsal mode.
+   */
+  rocketReported(news: RocketNews): void {
+    this.safely('Team GO Rocket', () => {
+      if (!this.enabled || this.closed) return;
+      this.announceRocket(news);
+    });
+  }
+
+  private announceRocket(news: RocketNews): void {
+    const { targetWants, wants, gameData, researchPosts, log, settings } = this.options;
+    const { report } = news;
+    const hideout = isHideoutReport(report);
+    const named = report.subjectKey.startsWith('leader:') || report.subjectKey === 'giovanni';
+    const targets = rocketTargets(report.subjectKey);
+    const numbers = rocketShadowNumbers(report.rocket.catches);
+    // Per member and grunt type (a grunt), or per hideout at the stop in its day (a hideout).
+    const quietKey = (id: string): string => `${news.serverId} ${id} ${report.subjectKey}`;
+    const toldKey = (id: string): string =>
+      `${news.serverId} ${id} ${report.periodKey} ${report.subjectKey} ${report.stop.key}`;
+    for (const { channelId, messageId: posted } of news.channels) {
+      const eventAt = this.now();
+      let messageId = posted;
+      this.announce({
+        // A grunt's line is its type's (fix B1): reports of one type are worked off in order, so
+        // the hour of a type holds for reports made at once; a hideout's line is its report's,
+        // so that the second channel's DM knows whom the first one told.
+        key: hideout
+          ? `rocket:${news.serverId}:${String(report.id)}`
+          : `rocket:${news.serverId}:${report.subjectKey}`,
+        partyId: undefined,
+        guild: news.serverId,
+        channelId,
+        actorId: report.reporter.id,
+        eventAt,
+        expiresAt: report.endsAt,
+        gather: async (guildId) => {
+          const targeted = new Map<string, readonly TargetWant[]>();
+          const shadow = new Map<string, readonly Want[]>();
+          // Without TargetWant only the Shadow wants fire (fix B8).
+          if (targetWants) {
+            try {
+              for (const found of await targetWants.wanting(guildId, targets)) {
+                targeted.set(found.memberId, found.wants);
+              }
+            } catch (err) {
+              log.warn({ err, guild: guildId }, 'could not read who wants Team GO Rocket');
+            }
+          }
+          if (numbers.length > 0) {
+            try {
+              for (const found of await wants.wanting(guildId, numbers)) {
+                shadow.set(found.memberId, found.wants);
+              }
+            } catch (err) {
+              log.warn({ err, guild: guildId }, 'could not read who wants a shadow Pokémon');
+            }
+          }
+          const ids = [...new Set([...targeted.keys(), ...shadow.keys()])];
+          if (hideout && ids.length > 0 && researchPosts) {
+            messageId = await researchPosts
+              .messageOf(channelId, report.subjectKey)
+              .catch((err: unknown) => {
+                log.warn({ err, channel: channelId }, 'could not find the post of the stops');
+                return undefined;
+              });
+          }
+          const now = this.now();
+          const quiet = (id: string): boolean => {
+            if (hideout) return this.rocketTold.has(toldKey(id));
+            const last = this.rocketHeard.get(quietKey(id));
+            return last !== undefined && now - last < MAX_WANT_QUIET_MS;
+          };
+          return {
+            ids: ids.filter((id) => !quiet(id)),
+            reasonsOf: (id) => [
+              ...rocketWantsFiring(targeted.get(id) ?? [], report.subjectKey).map(
+                (want): NotifyReason => ({ kind: 'target', want }),
+              ),
+              ...rocketShadowFiring(
+                gameData.catalogue,
+                shadow.get(id) ?? [],
+                report.rocket.catches,
+              ).map((target): NotifyReason => ({ kind: 'want', target })),
+            ],
+          };
+        },
+        message: (guildId, reasons) =>
+          notifyDm(
+            {
+              sentence: rocketDmSentence({
+                name: report.rocket.name,
+                named,
+                regionChannelId: channelId,
+                reporter: report.reporter,
+              }),
+              brief: rocketDmBrief({
+                catches: report.rocket.catches,
+                stop: report.stop,
+                ends: hideout
+                  ? { until: periodEndWords(report.endsAt, eventAt, settings.timezone) }
+                  : { goneAt: report.endsAt },
+              }),
+              links:
+                messageId === undefined
+                  ? []
+                  : [
+                      hideout
+                        ? postButton(postLink(guildId, channelId, messageId))
+                        : reportButton(postLink(guildId, channelId, messageId)),
+                    ],
+              ...(hideout ? {} : { note: gruntHourNote() }),
+            },
+            reasons.map((reason) => this.shown(guildId, reason)),
+          ),
+        priority: () => (hideout ? DM_PRIORITY.normal : DM_PRIORITY.spawn),
+        sent: (id) => {
+          if (hideout) this.rocketTold.set(toldKey(id), true);
+          else this.rocketHeard.set(quietKey(id), this.now());
+        },
+      });
+    }
+  }
+
   /**
    * The direct message about a time to meet at (worded for a phone's notification), to these members of a party: no
    * reasons, no button, no opt-out, and before everything that is only news.
````

### Task 9: 8R-2 docs: Team GO Rocket at stops, Rocket wants, guides

Prototype commit: `23e58981a7ccb637f92985276df6cb09cc02806c`

stop-reports.md: migration 028, the lineups and settings.rocket, one Rocket
report per stop and day (decideRocket in saveUnless), RocketService, the
grunts' messages, /rocket report and remove with the hideout dialog, the
post's hideouts, the Rocket DMs. notifications-and-dms.md: the Rocket
targets of TargetWant and /want, the Shadow box widened to Rocket catches,
rocketReported, the priorities, the Stop buttons' arguments. testing.md:
the helpers and fakes of 8R-2.

The guides name /rocket and settings.rocket; the official announcement draft
names Team GO Rocket. Follow-ups: "From the 8R-2 prototype".

**Files:**

```
 docs/architecture/notifications-and-dms.md                   | 10 +++++-----
 docs/architecture/stop-reports.md                            | 16 +++++++++++++---
 docs/architecture/testing.md                                 |  3 ++-
 docs/guides/migrating-a-legacy-instance.md                   |  5 +++--
 docs/guides/new-instance.md                                  |  4 ++--
 docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md |  1 +
 docs/superpowers/plans/phase-0-follow-ups.md                 | 11 +++++++++++
 7 files changed, 37 insertions(+), 13 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 23e58981a7ccb637f92985276df6cb09cc02806c -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-2 docs: Team GO Rocket at stops, Rocket wants, guides`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index ec53d6f12c4721fac8d3809f0afaf48f3ba04191..261f597eb3812e8b27ce5828c018442bd2fc7a4f 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -4,8 +4,8 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 ## Wants and gym targets
 
-- A want (`PokemonNotification`) is per member and server and is one of: a species (every form, megas included), one form (`form`, a catalogue key), the shadow raids of either (`shadow`; raids only), a raid tier (raids only), perfect or zero IVs (spawns only); a mega is raids only. The columns are read and written only through the codec (`notification-target.ts`: `readNotification` gives the target and the scope in effect; a row it cannot read is skipped, counted and never deleted on its own) and the pure functions of `src/domain/pogo/wants.ts` (`readWants`, `planSetWant`, `rowsOfWant`: duplicate legacy rows are one want with the union of their scopes, two keys of one catalogue entry are one want, a row is rewritten only when its meaning changes). `ctx.wants` (`WantStorage`: `list`, `set`, `remove`, `removeAll`, `count`) is the repository; `MemoryWants` (`test/support/wants.ts`) is its twin and runs the same functions. `pokemonWantFits(catalogue, target, entry, shadowRaid)` says whether a want is for a boss or a spawn. Since plan 8R-1 a raid scope means raids only (no max battles), and the legacy `!wants` codec and the scope rules (`planSetWant`, `widerScope`) are unchanged.
-- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; 8R-2 adds the Rocket ones), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, or an item or Mega Energy of the task list (its autocomplete offers the Pokémon, forms, tiers and IVs first and the items and Mega Energy after them in what is left, at most five places (`REWARD_ROOM`) where the Pokémon would fill the list, `rewardWantChoices`; the design's "today's rewards first" is not built; `readWanted` reads typed text). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow or a shadow raid boss of now is one (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (`wantbox:p<dex>:set:<shown>[:<form>]`, `wantbox:t:set:<level>:<shown>`, `<shown>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `wantBoxId`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock (`WantBoxStorage.set`, `planBoxes`; `WantBoxRepository`, twin `MemoryWantBoxes`); nothing ticked takes the target off. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
+- A want (`PokemonNotification`) is per member and server and is one of: a species (every form, megas included), one form (`form`, a catalogue key), the shadow raids of either (`shadow`; since plan 8R-2 shadow raids and Team GO Rocket catches, the Shadow box), a raid tier (raids only), perfect or zero IVs (spawns only); a mega is raids only. The columns are read and written only through the codec (`notification-target.ts`: `readNotification` gives the target and the scope in effect; a row it cannot read is skipped, counted and never deleted on its own) and the pure functions of `src/domain/pogo/wants.ts` (`readWants`, `planSetWant`, `rowsOfWant`: duplicate legacy rows are one want with the union of their scopes, two keys of one catalogue entry are one want, a row is rewritten only when its meaning changes). `ctx.wants` (`WantStorage`: `list`, `set`, `remove`, `removeAll`, `count`) is the repository; `MemoryWants` (`test/support/wants.ts`) is its twin and runs the same functions. `pokemonWantFits(catalogue, target, entry, shadowRaid)` says whether a want is for a boss or a spawn. Since plan 8R-1 a raid scope means raids only (no max battles), and the legacy `!wants` codec and the scope rules (`planSetWant`, `widerScope`) are unchanged.
+- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy, written at once with no dialog (`rocketWantAnswer`: a grunt type at most one DM an hour for each type). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1; typed in full, `none` and `no type` are the untyped grunts, fix S2, labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`, one checkbox group `boxes`): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); what can be only one thing (a mega, a tier without shadow raids), IVs and a reward are written at once. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (`wantbox:p<dex>:set:<shown>[:<form>]`, `wantbox:t:set:<level>:<shown>`, `<shown>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `wantBoxId`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock (`WantBoxStorage.set`, `planBoxes`; `WantBoxRepository`, twin `MemoryWantBoxes`); nothing ticked takes the target off. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
 - What a member picked in the `target` option of `/want` or `/unwant` is a want token (`wantToken` / `parseWantToken`: `pokemon:<dex>[:<form>][:shadow]`, `tier:<level>[:shadow]`, `iv:perfect|zero`): the value of an autocomplete choice, never part of a custom id. Text sent without picking never guesses (`readWantText`): it acts only when it is a tier or IV word in full (`wantWord`), exactly a species' name (every form) or exactly one form's own name, with `shadow` before either; anything else is refused with suggestions. A bare number is a tier or IV word, never a Pokédex number.
 - Wants are named in one way everywhere (`wantLabel` / `wantName` in `src/commands/notifications/want-input.ts`): "X (every form)" for a species with several entries, "X (base form)" for its plain entry, "Shadow X", and the scope after " · " in the choices of `/unwant`.
 - Gym targets (`GymNotification`; `gym` holds a gym id as text) are `ctx.gymTargets` (`GymTargetStorage`), with `MemoryGymTargets` as the twin. In code "target" alone is what a want is for; a gym a member wants raids of is a gym target.
@@ -13,13 +13,13 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 ## The notifier
 
-- Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `maxReported` and `maxChanged` (plan 8X-3: a max battle's report, once its post exists, and a boss that is another; who wants the boss, `maxWantsFiring`: since plan 8R-1 the Dynamax box of a Dynamax battle and the Gigantamax box of a Gigantamax one (`TargetWant` `dynamax:` / `gigantamax:`, of the species or of the boss's form; Matt's answer 9 of the stop reports design), never a raid, tier, shadow or spawn want, no gym target; at most one DM an hour per member, boss and kind (a Gigantamax Machamp is told within the hour of a Dynamax one), `MAX_WANT_QUIET_MS`, kept in memory and lost on a restart, read when the members are gathered and written as each message is put in line, so two reports of one boss moments apart at two spots may both reach a member; the DM says so in small print, `maxHourNote`: "You won't be told about more Dynamax Machamp battles for an hour."; the spot's and the boss's names through `plainNoLinks`), `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated` (the DM names a train of max battles by its kind, "A new Gigantamax Train has been announced", plan 8X-4; a raid train "A new train" as before), `meetingTimeChanged` (a group's meeting time in a raid or a max battle, `isBattle`; the DM names `the max battle at <spot>`), `startTimeChanged`, `spawnReported`, `researchReported` (plan 8R-1, `stop-reports.md`, "Wants and DMs": a research report's DM per region channel, with a member's own variant of the stops not told yet, `Announcement.variant`). Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
+- Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `maxReported` and `maxChanged` (plan 8X-3: a max battle's report, once its post exists, and a boss that is another; who wants the boss, `maxWantsFiring`: since plan 8R-1 the Dynamax box of a Dynamax battle and the Gigantamax box of a Gigantamax one (`TargetWant` `dynamax:` / `gigantamax:`, of the species or of the boss's form; Matt's answer 9 of the stop reports design), never a raid, tier, shadow or spawn want, no gym target; at most one DM an hour per member, boss and kind (a Gigantamax Machamp is told within the hour of a Dynamax one), `MAX_WANT_QUIET_MS`, kept in memory and lost on a restart, read when the members are gathered and written as each message is put in line, so two reports of one boss moments apart at two spots may both reach a member; the DM says so in small print, `maxHourNote`: "You won't be told about more Dynamax Machamp battles for an hour."; the spot's and the boss's names through `plainNoLinks`), `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated` (the DM names a train of max battles by its kind, "A new Gigantamax Train has been announced", plan 8X-4; a raid train "A new train" as before), `meetingTimeChanged` (a group's meeting time in a raid or a max battle, `isBattle`; the DM names `the max battle at <spot>`), `startTimeChanged`, `spawnReported`, `researchReported` (plan 8R-1, `stop-reports.md`, "Wants and DMs": a research report's DM per region channel, with a member's own variant of the stops not told yet, `Announcement.variant`), `rocketReported` (plan 8R-2, the same section: a Rocket report's DM per region channel; a grunt at the spawn priority, one an hour per member and grunt type; a hideout once a day per stop). Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
 - New-train DMs are per member and server: `ctx.newTrains` (`NewTrainStorage`: `isOn`, `set`, `wanting(guildId)`; table `NewTrainNotification`; twin `MemoryNewTrains`). The legacy column `User.newTrain` is neither read nor written. Boss-set is still one setting of the member.
 
 ## Sending direct messages
 
-- Direct messages go out only through `DmSender` (`src/services/dm-sender.ts`; the app's is `QueuedDmSender`): `send(job)` puts a message in line and returns, never waits for Discord and never throws. A timer starts at most one send every 100 ms, five on their way at most; priorities are `DM_PRIORITY.urgent` (meeting times, boss-set), `spawn`, `normal` (raid wants, gym targets, new trains, max battles, field research), the oldest event first within one; a job carries `eventAt` and `expiresAt` and is dropped once that has passed. There is no retry (discord.js waits out a 429), a pause of a minute when Discord refuses to open DM channels, an hour's memory of members who take no DMs, and a log line with the numbers of every burst. Never loop over recipients and send: the legacy bot lost its gateway connection that way. Tests use `RecordingDms` or `QueuedDmSender` over `FakeDmGateway` (`test/support/dms.ts`, `pullUntilIdle`). In rehearsal mode the members' sender is `RehearsalDms` over the queue: only the allowlist is written to (`operations.md`).
-- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a `TargetWant` is `target` with `rp`, `ri`, `re`, `dx`, `gx` and a subject's every box `subject` with `sp` / `st`, plan 8R-1; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag).
+- Direct messages go out only through `DmSender` (`src/services/dm-sender.ts`; the app's is `QueuedDmSender`): `send(job)` puts a message in line and returns, never waits for Discord and never throws. A timer starts at most one send every 100 ms, five on their way at most; priorities are `DM_PRIORITY.urgent` (meeting times, boss-set), `spawn` (spawns, Rocket grunts), `normal` (raid wants, gym targets, new trains, max battles, field research, Rocket hideouts), the oldest event first within one; a job carries `eventAt` and `expiresAt` and is dropped once that has passed. There is no retry (discord.js waits out a 429), a pause of a minute when Discord refuses to open DM channels, an hour's memory of members who take no DMs, and a log line with the numbers of every burst. Never loop over recipients and send: the legacy bot lost its gateway connection that way. Tests use `RecordingDms` or `QueuedDmSender` over `FakeDmGateway` (`test/support/dms.ts`, `pullUntilIdle`). In rehearsal mode the members' sender is `RehearsalDms` over the queue: only the allowlist is written to (`operations.md`).
+- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a `TargetWant` is `target` with `rp`, `ri`, `re`, `dx`, `gx` (plan 8R-2: `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`) and a subject's every box `subject` with `sp` / `st`, plan 8R-1; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag).
 - The owner's DM of a request for the Wayspot export tool (plan 8W-P; `web.md`, "The Wayspot export tool"): a new request, or one asked again after a refusal, queues a DM to `OWNER_ID` through `DmSender` (`normal`, expiring after 7 days; the queue is in memory, so a restart loses it and the page is the fallback), only while at most `OPEN_REQUESTS_NOTIFIED` 20 requests are open (any Discord account can ask; the rest wait on the page). It is `accessRequestDm` (`src/render/script-access-dm.ts`): who asks by name (`plainNoLinks`) and id as plain text, no mention, the community line through `plainNoLinks`, when, and **Approve** / **Refuse**, custom ids `scriptaccess:<row id>:approve|refuse:<askedAt in base 36>`. The handler (`scriptAccessControls`, `src/components/script-access.ts`) has a guard that the presser is `OWNER_ID` (a guard refusal counts against no throttle) and `SCRIPT_ACCESS_THROTTLE` 20 a minute; a press decides the request as it is now and for the asking it was drawn for, and edits the DM to what was decided and when without its buttons (`accessDecidedDm`): decided meanwhile, "Decided already: …"; asked again since, "Asked again since, <time>: decide it on its new DM or on the page."; a row gone or a button it cannot read is out of date. No fresh web login is needed for the DM.
 
 ## Spawn reports
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index d52d6f58076900522b5c3d298cc626f25b8e7eba..be5032111ad6bf3508bda2df571c0d541cb46e75 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -1,11 +1,12 @@
 # Reports at stops
 
-What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/2026-10-21-stop-reports-design.md`): stops of Pine's own, the field research task list, research periods, the stop reports and `/research`, the pinned post "Today at the stops", and the research wants and their DMs. Team GO Rocket (plan 8R-2) adds a kind of report and a section of the post; the map (8R-3) a layer. Read before changing anything under `src/domain/stops/`, `src/domain/research/`, `src/commands/research/`, `src/commands/stops/`, or `src/services/` `stop-reports.ts`, `stop-posts.ts`, `research-task-service.ts`, `pine-stops.ts`.
+What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/2026-10-21-stop-reports-design.md`): stops of Pine's own, the field research task list, research periods, the stop reports and `/research`, the pinned post "Today at the stops", and the research wants and their DMs; Team GO Rocket (plan 8R-2): the lineups, `/rocket`, grunts' messages, the post's hideouts, Rocket wants and DMs. The map (8R-3) adds a layer. Read before changing anything under `src/domain/stops/`, `src/domain/research/`, `src/domain/rocket/`, `src/commands/research/`, `src/commands/rocket/`, `src/commands/stops/`, or `src/services/` `stop-reports.ts`, `stop-posts.ts`, `research-task-service.ts`, `rocket-lineup-service.ts`, `rocket-reports.ts`, `grunt-messages.ts`, `pine-stops.ts`.
 
 ## The tables (migration 027)
 
-- One migration for all of 8R-1 (`2026_10_21_027_stop_reports.ts`; 026 at first, renumbered when typescript-migration was merged in, as 8X-4's `026_train_spot_stops` came first), additive and guarded as the others: `PineStop` (a server's own stops: snowflake `serverId`, name, point, address, who made it, when), `StopReport` (one per server, stop key, kind and period: unique `(serverId, stopKey, kind, periodKey)`, `periodKey` up to 220 characters for the feed's longest event id and a day; the stop's snapshot, `subjectKey`, the detail as JSON, the reporter, `endsAt`, `madeAt`; the kind `research` now, `rocket` for 8R-2), `ResearchEvent` (the events of the feed with research: id, name, type, start, end, as last seen), `StopPost` (a region channel's post of a day: channel, local day, server, message ids in order), `TargetWant` (a member's want that is no `PokemonNotification`: server and member by their rows, the target token, unique on the three, indexed by server and token for the notifier) and `ResearchTask` (the last good task list: key, text, category, rewards as JSON, its place on the page, first and last seen, active).
+- One migration for all of 8R-1 (`2026_10_21_027_stop_reports.ts`; 026 at first, renumbered when typescript-migration was merged in, as 8X-4's `026_train_spot_stops` came first), additive and guarded as the others: `PineStop` (a server's own stops: snowflake `serverId`, name, point, address, who made it, when), `StopReport` (one per server, stop key, kind and period: unique `(serverId, stopKey, kind, periodKey)`, `periodKey` up to 220 characters for the feed's longest event id and a day; the stop's snapshot, `subjectKey`, the detail as JSON, the reporter, `endsAt`, `madeAt`; the kinds `research` and, since plan 8R-2, `rocket`: `StopReport` is the union `ResearchReport | RocketReport`, narrowed by `isResearchReport` / `isRocketReport`), `ResearchEvent` (the events of the feed with research: id, name, type, start, end, as last seen), `StopPost` (a region channel's post of a day: channel, local day, server, message ids in order), `TargetWant` (a member's want that is no `PokemonNotification`: server and member by their rows, the target token, unique on the three, indexed by server and token for the notifier) and `ResearchTask` (the last good task list: key, text, category, rewards as JSON, its place on the page, first and last seen, active).
 - Repositories and their twins (each pair runs one set of shared cases, `test/support/*-cases.ts`): `StopReportRepository` / `MemoryStopReports`, `PineStopRepository` / `MemoryPineStops`, `StopPostRepository` / `MemoryStopPosts`, `ResearchEventRepository` and `ResearchTaskRepository` / `test/support/research-store.ts`, `TargetWantRepository` / `MemoryTargetWants`, `WantBoxRepository` / `MemoryWantBoxes`.
+- Migration 028 (plan 8R-2, `2026_10_22_028_rocket.ts`, additive and guarded): `RocketLineup` (the last good list of `/rocket`'s choices, kept as `ResearchTask` keeps the task list: `rocketKey`, name, catches as JSON, `position`, first and last seen, `active`) and `GruntMessage` (a grunt's message in a region channel until it is deleted, as `SpawnReport`: message, channel, server, the `StopReport` row it shows (`reportId`, no foreign key: the message outlives a report replaced or taken back until its delete is done), `deleteAt`; indexed by report and by `deleteAt`). A Rocket report itself is a `StopReport` row of the kind `rocket` (below). Twins `MemoryRocketLineups`, `MemoryGruntMessages` (`test/support/rocket-store.ts`; `rocketLineupCases`, `gruntMessageCases`).
 
 ## Stops of Pine's own
 
@@ -31,13 +32,22 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 - `/research report task: stop: [stop2: … stop5:] [reward:]` and `/research remove stop:` (`src/commands/research/`): from a region's channel, forum or post (`RESEARCH_FROM_A_REGION`); where the server's regions hold no stop, `NO_STOPS_HERE` (Matt's answer 7). `task` is a choice of the list (found by reward words too) or text typed in full (free text, capped at 100 characters, shown through `plainNoLinks`; with `reward:` a Pokémon, item or Mega Energy); a key gone from the list is `TASK_LIST_CHANGED`. A stop is a choice of the stops (`stop:<key>`), typed text naming one, or a maps link (the nearest stop within 50 m, `PlaceFinder.nearestStop`). The guard reads all of it so a refusal does not count; the throttle is `settings.research.throttle` in a window of its own (`researchThrottle`, `researchWindow`); one report of five stops counts once. `defer: 'late'`.
 - The answer (`researchAnswer`, `src/render/research.ts`, for the reporter alone): the task and rewards, each stop (with what it replaced, "again" for the same task), where it shows (in rehearsal mode, which makes no post, only until when) and until when (`periodEndWords`: "until midnight", the time, with its day when it is not today), "Same task at more stops…" (`research:<id>:more`: a menu of up to 25 stops within `MORE_STOPS_METRES` (2 km) of the first without this task in the period, five at once; it counts in `/research report`'s window through the throttle's `as`, gives the use back where the report has ended or was replaced (`REPORT_ENDED`, `givesBack`), and answers apart with its own Take back) and "Take back" (`research:<id>:back[:<id>…]`, as many ids as fit; the rest by `/research remove`).
 
+## Team GO Rocket (plan 8R-2)
+
+- **The lineups.** `settings.rocket` has a default for every key (always on, no switch): `url` (ScrapedDuck's `rocketLineups.min.json`, `ROCKET_LINEUPS_URL`), `refreshHours` 6, `staleAfterHours` 24 (at least two refreshes), `gruntMinutes` 30, `throttle` `{ uses: 10, minutes: 30 }` (`/research`'s numbers in a window of its own, design 9.12). `RocketLineupService` (`ctx.rocketLineups`: `choices()`, `byKey`, `readAt`) reads the feed with Pine's User-Agent and a byte cap (`readLimitedJson`, `MAX_ROCKET_FEED_BYTES`), keeps the last good list in `RocketLineup` and takes it at start without the network, with the guard of the task list (a read of fewer than half the choices is kept out unless the read before agrees or the list is out of date; a feed of no lineup throws, so it never empties the list; out of date said once). `parseRocketLineups` (`src/domain/rocket/lineups.ts`, pure) makes one choice per grunt type (a type of two lineups, the male and female water grunts, is their union), the untyped grunts, the decoy, Cliff, Arlo, Sierra and Giovanni, in that order (grunt types by name); keys `rocketKey`: `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra>`, `giovanni`; names `rocketName` ("Water-type grunt", "Grunt (no type)", "Decoy grunt"). The catches are the Pokémon marked `isEncounter` in any slot (Giovanni's is in the third), named by the catalogue (`identifyBoss` of name and picture), each once; a lineup of an unknown title, leader or type is skipped and counted. `/rocket` always offers and takes the hideouts (the decoy, Cliff, Arlo, Sierra, Giovanni), with their catches where the lineups have them, and the grunt types of the lineups (every type, without catches, before any lineups were ever read; `rocketChoices`, fix B5): only a grunt type gone from the lineups is `LINEUPS_CHANGED`.
+- **One Rocket report per stop and day** (design 5.2, Matt's answer 4). A report is a `StopReport` row of the kind `rocket` (`RocketReport`: the detail is who by name and the catches as the lineups had them; `subjectKey` its `rocketKey`) in the day's period (`rocketDay`: `day:<date>` to local midnight; events change no hideout). Grunt and hideout share the row of the unique `(serverId, stopKey, kind, periodKey)`, so which stands is decided with that row locked: `StopReportStorage.saveUnless(report, keeps)` asks `decideRocket` (`src/domain/rocket/reports.ts`, pure) inside the transaction: nothing standing (or ended), reported; a hideout (a leader, Giovanni, the decoy) replaces whatever stands; the same grunt standing is `already`; another grunt replaces it; a grunt where a hideout stands `asks`, unless the member said Replace to that very hideout (`replacing` its id). `StopReportService.reportRocket` gives the outcome; a grunt stands `gruntMs` (`gruntMinutes`), a hideout until midnight; what it replaced while it stood is told to the listeners as `ended`, a hideout made or replaced draws the posts (`changed`), the same hideout again is no news. The decision holds across midnight (fix A2): `reportRocket` passes `standingAt`, so a Rocket report of another period that still stands at the stop (a grunt of yesterday past midnight) is the one decided against, locked with the rest and replaced (told as `ended`). `rocketAt(serverId, stopKey)` is the stop's Rocket report; `at` is research only. `takeBack` tells what it removed as `ended` too, and `changed` only of research and hideouts (none for a grunt alone, fix A4).
+- **Reporting** goes through `RocketService` (`src/services/rocket-reports.ts`, `ctx.rocket`; the map of 8R-3 will call it): the report (`rocketSubject(choice)`), then for a grunt its message in each region channel whose outline holds the stop (`channelsAt`, `regionsAtPoint`), then `NotifyService.rocketReported` with the messages (`RocketNews`); `already` comes back with the standing grunt's messages (`messagesOf`). Only storing throws, before anything is posted (fix A1): a channel whose message fails is passed over, and the notifier is told of what was posted. Outside rehearsal mode a grunt posted in none of its stop's region channels (all refused, or the bot shutting down) is taken back and answered `unposted` (fix A5: unseen, it would only answer "Already reported" without a link); a hideout it had replaced is put back under a new id in the grunt's place in one step under the stop's lock, so there is no moment without a report (`StopReportService.restore`, fix S4: unless its day has ended or another report than the grunt stands there by then; no new DM; the post is drawn anew), a grunt it had replaced cannot come back (its message is gone) and is named (fix R2); `/rocket` says so and gives the use back. Outside rehearsal mode a grunt's DMs name only the channels it was posted in (fix R3). In rehearsal mode it has no message service: nothing is posted, the report is kept and told.
+- **Grunts' messages** (`GruntMessageService`, `src/services/grunt-messages.ts`): `gruntMessage` (`src/render/rocket.ts`, `ROCKET_COLOUR`): `### Water-type grunt`, `**Catch** one of …`, when it goes away, `**Where**` the stop's line with its maps link and picture, a gallery of the catches' pictures (ten at most), the reporter in the small print (`memberByName`); `gruntTextMessage` where the bot may not embed; a message refused for what it holds is sent once more without pictures; a channel where the send fails for any reason (refused, 5xx, a time-out) is passed over and logged, and a message that cannot be recorded is deleted at once and counts as not posted (`post` never rejects, fix A1); a delete after a report ended early that fails is tried once more a minute later (fix A3). Each message is a `GruntMessage` row until deleted: at the report's end, at once when it ends early (`ended`: replaced, taken back; one still on its way goes as soon as it is there, `endedEarly`), a failed delete once more a minute later, then by `sweep` (the scheduler's `grunts`, hourly and at start) until a day after its time. A shutdown deletes nothing (`close`): the report stands on through a restart, and so does its message (unlike spawn reports).
+- **`/rocket report who: stop:`** and **`/rocket remove stop:`** (`src/commands/rocket/`, every server): `who` a choice (`whoChoices`: by name, then by what can be caught; `Name · catches in short`, Giovanni's "(only when sure it is him)") or a name typed in full (`readWho`: `water`, `water grunt`, `arlo`, `decoy`); a key gone from the lineups is `LINEUPS_CHANGED`. The stop as `/research` reads it (`namedStop` with Rocket's refusal `NOT_A_ROCKET_STOP`). Its guard (`requireRocketReport`: `ROCKET_FROM_A_REGION`, `NO_STOPS_HERE`, who, the stop, and the hideout standing there) runs before the throttle (`rocketThrottle`, `rocketWindow`). A grunt where a hideout stands today opens the dialog "Replace a hideout?" (`defer` none then; `readInTime` with nothing more to read; `PendingRequests`): "Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s report with the Water-type grunt? Submit replaces it." Its Submit (`rocket:<token>:replace`, `carriesOn` the command's use and window) reports with that hideout's id; another hideout meanwhile is `HIDEOUT_CHANGED` and gives the use back; one reported between the guard and the report (no dialog possible then) is refused and gives the use back. `already` answers "Already reported: a **Water-type grunt** at **Stop**, by **Ash** <t:R>; it goes away <t:R>." with a link to its message. The answer (`rocketAnswer`): who at which stop, what can be caught, what it replaced, where it shows (the grunt's channels and when it goes; a hideout's pinned posts until midnight; in rehearsal mode only until when) and Take back (`rocket:<id>:back:<stop key>:<rocketKey with . for :>`, `MEMBER_WRITE_THROTTLE`; where the id is gone it takes back the presser's report of the same who at the same stop standing today, a hideout put back under a new id, fix S3). `/rocket remove` takes back one's own report at a stop, any for staff.
+
 ## The pinned post "Today at the stops"
 
 - `StopPostService` (`src/services/stop-posts.ts`): one post per region channel and local day, made at the first report of the day in the region, pinned (the "pinned a message" notice deleted where the bot may; at Discord's pin limit, or without Pin Messages, it stands unpinned and that is logged once per channel), drawn anew `POST_DELAY_MS` (3 s) after the last change (`Gathered`, coalesced) in one queue per channel (`KeyedLock`), the midnight delete included; reads are done before any Discord call. A change of the reports is drawn only in the regions it touched: `StopReportListener.changed(serverId, stops)` names the stops of the reports made or taken back (a replaced report's too), and only the region channels whose outlines hold one of them are queued; the period changes and the research events draw every post. A message whose payload equals the one last drawn there (a hash per message id, in memory: the first draw after a restart edits) is not edited. An edit that fails is thrown (logged, the post stands, the next change draws it again); a message is deleted and sent anew only when it is gone or changes kind (components v2 to plain text, or back, as `mayPost` changes), and, its kind not known in the first draw after a restart, when Discord refuses its edit for what it holds (`isRefusedBody`); any other failure keeps it there too. A channel with no post in memory reads its kept rows from storage before it draws (a report before `start` has read them, or after that failed, edits the post a restart left; a failed read draws nothing), and `start` keeps what such a draw made, and deletes a post older than its channel's newest (one whose delete failed at its midnight). A timer at `nextPeriodChange` draws every kept post anew (`draw` deletes the post of an ended day and makes today's where reports stand); `start()` does the same for what a restart left (`StopPost` keeps the ids, each message's saved as soon as it is sent, before it is pinned), and sets the timer also when the kept posts cannot be read; a change of the research events (`onResearchChange`) draws the posts anew and sets the timer again (those redraws in a set of their own, which `flush` and `close` wait for and `messageOf` does not: it waits only for its own channel). It is kept, saying "Nothing reported right now.", when every report is taken back. None in rehearsal mode.
-- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task, most stops first, each with its rewards and up to 15 stops (`- **Stop** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"), the reward's picture beside it; within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it), under an intra-day window when the day's research comes back. Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link. 8R-2's hideouts go after the research.
+- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task, most stops first, each with its rewards and up to 15 stops (`- **Stop** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"), the reward's picture beside it; within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it), under an intra-day window when the day's research comes back. Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link. The day's hideouts (plan 8R-2) go after the research under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (the first catch's picture beside it) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
 - `PartyGateway.pinMessage` / `unpinMessage` (`PinOutcome`: `pinned`, `full`, `not-allowed`, `gone`); Pin Messages is optional in `REGION_CHANNEL_NEEDS`, so `cutover-check` warns where it lacks.
 
 ## Wants and DMs
 
 - `/want`'s dialog, `TargetWant` and the matching are in `notifications-and-dms.md` ("Wants and gym targets", "The notifier").
 - A report that is news (`StopReportService`'s `reported`) goes to `NotifyService.researchReported`: who wants a reward of its task (`researchTargets` / `researchWantsFiring`, `src/domain/notify/reasons.ts`: a Pokémon's Research box, the species fitting any form, an item whatever the quantity, a species' Mega Energy) is told at the normal priority, one DM per report and region channel naming that region's stops with their addresses (`researchDmSentence`, `researchDmBrief`: "Field research has been reported in #region by **Name**: **task**.", the rewards, the stops, until when as `periodEndWords` says it; all through `plainNoLinks`), only members who can view the channel, never the reporter, only under `features.notifications`, expiring with the report, with "Go to post" to the message of the pinned post holding the task (`researchPosts`; none in rehearsal mode). A member told of a task at a stop in a period is not told again (`researchTold`, in memory: a restart can repeat one), so a later "Same task at more stops…" names only the new stops. The usual Stop buttons (`target` reasons, `stopArgs` `rp`/`ri`/`re`).
+- A Rocket report that is news goes to `NotifyService.rocketReported` (plan 8R-2, design 7): one DM per region channel holding the stop; a want of its grunt type, its leader or any leader, Giovanni or the decoy (`rocketTargets` / `rocketWantsFiring`, `TargetWant` tokens as `rocketKey` plus `leader:any`) and a Shadow want of a Pokémon it can give (`rocketShadowFiring`, the `PokemonNotification` shadow row of the species or the very form: the Shadow box means shadow raids and Rocket catches). A grunt goes at the spawn priority, at most one DM an hour per member and grunt type (`rocketHeard`, in memory, `MAX_WANT_QUIET_MS`; a grunt's announcement runs in its type's line, `rocket:<server>:<rocketKey>`, so reports of one type made at once keep the hour, fix B1; the small print says so, `gruntHourNote`: "You won't be told about this grunt type again for an hour."; without `TargetWant` the Shadow wants still fire, fix B8), with "Go to report" to its message in that channel; a hideout at the normal priority, never twice to a member for the same hideout at the same stop in a day (`rocketTold`, in memory), with "Go to post" to the message of the pinned post holding it (`researchPosts.messageOf(channel, rocketKey)`); no link in rehearsal mode. `rocketDmSentence` ("A **Water-type grunt** has been reported in #west by **Rita**.", "an" by the name's first letter, a leader by name), `rocketDmBrief` (what can be caught, the stop with its address line, when it goes or until when it stands).
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 19d83ac2e4bca7f56f4d038967aee2953d6b0d79..4ba21662e923c328516a6ace8a47fe85784ae301 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -54,12 +54,13 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 - Wayfarer tests: the import and the queue over gym administration on fakes are `wayfarerImportWith()` (`test/support/wayfarer-import.ts`: `wayfarer`, `wayfarerReview`, `wayfarerStore`, `wayspotStore` (`MemoryWayspots`) and `wayspots` (a `WayspotDirectory` over it, loaded), `admin`, `directory`, `removal`), which `gymCommandsWith()` routes like the bot; `createTestContext`'s own `wayfarer` and `wayfarerReview` throw when used. Exports in tests are built from invented Wayspots at the invented gyms, their cells by `wayfarerCellAt`. Kept Wayspots: `MemoryWayspots` keeps those found gone apart (`goneRows`, plan 8W-3); `keptRow(n, overrides)` and `wayspotId(n)` (`test/support/wayspot-cases.ts`, with `wayspotCases`, which the repository and `MemoryWayspots` both run), `wayspotsWith(rows)` (a loaded directory over the invented regions; pass it as `wayspots` to `createTestContext`, whose own is empty, `noWayspots()`, and whose `placeFinder` is built over its own gyms, Wayspots and regions unless given; a test that searches stops or power spots awaits `placeFinder.built()` first, as the search indexes are built in a turn of their own). Never the real export: it is read only by scratch scripts.
 
-## Reports at stops (plan 8R-1)
+## Reports at stops (plans 8R-1, 8R-2)
 
 - Each repository of `stop-reports.md` and its twin run one set of cases: `stopReportCases` (`test/support/stop-report-cases.ts`, with `reportedStop(n, overrides)` (Yellow Mural `n` at 40.44…, −79.99: outside the invented regions, so a test that needs a region moves it, as `west(n)` in `stop-posts.test.ts`), `researchReport()`, `REPORT_NOW`, `REPORT_SERVER`, `DRATINI`), `pineStopCases` (`newPineStop()`), `researchEventCases`, `researchTaskCases` and `stopPostCases` (`test/support/research-store-cases.ts`, with `INTO_THE_WILD`, `PAWNIARD_DAY`, `listedTask()`; twins `MemoryResearchEvents`, `MemoryResearchTasks`, `MemoryStopPosts` in `test/support/research-store.ts`), `targetWantCases` (its constants of every kind of target), `wantBoxCases`.
 - The task list: `readResearchPage()` (Leek Duck's page of 2026-10-21, `test/fixtures/leekduck-research.html`, unchanged: 58 tasks, 299 rewards), `researchTasksOfPage()` (parsed once, frozen), `pageTask(text)` and `researchTasksFixture(tasks?, readAt?)` (`test/support/research.ts`, a `ResearchTaskProvider`, `ctx.researchTasks` of `createTestContext()`). Research events: `raidEventsFixture(zone, { research })`; the events feed fixture `test/fixtures/max-events.json` holds the two research events of November 2026.
 - `createTestContext()` gives `ctx.stopReports` (a `StopReportService` over `MemoryStopReports` and the context's events), `ctx.pineStops` (none, over memory and the context's Wayspots), `ctx.targetWants` and `ctx.wantBoxes` (`MemoryWantBoxes` over the context's wants and target wants); `partyServiceWith()` gives `targetWants` to the notifier (`made.targetWants`), and `notifying.researchPosts` a test's own links (`notify-service.research.test.ts`).
 - `FakePartyGateway` pins (`pinMessage` / `unpinMessage`): `noPinning` (channels where it is `not-allowed`), `pinLimit`, `pinNotices` (the notices it deleted), `pinnedIn(channelId)`.
+- Team GO Rocket (plan 8R-2): `readRocketFeed()` (ScrapedDuck's `rocketLineups.min.json` of 2026-10-22, `test/fixtures/rocket-lineups.json`, unchanged: 26 lineups, 24 choices), `rocketChoicesOfFeed()` (parsed once, frozen), `feedChoice(key)` and `rocketLineupsFixture(choices?, readAt?)` (`test/support/rocket.ts`, a `RocketLineupProvider`, `ctx.rocketLineups` of `createTestContext()`; `[]` is a list never read). `rocketReport(overrides)` and `MUDKIP` (`stop-report-cases.ts`, a Water-type grunt at stop 1 for half an hour) beside `researchReport`; `rocketLineupCases` (`listedChoice`) and `gruntMessageCases` (`gruntRow`) in `test/support/rocket-store-cases.ts`, twins `MemoryRocketLineups`, `MemoryGruntMessages` (`failing` per method). `createTestContext()` gives `ctx.rocket` (a `RocketService` over the context's reports that posts no message, as in rehearsal mode); a test of grunts' messages passes its own over a `GruntMessageService` on a `FakePartyGateway` (`rocket.test.ts`, `rocket-reports.test.ts`), with `setTimer` to keep or fire the deletes by hand.
 
 ## The Wayspot export tool (plan 8W-P)
 
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index e1a5d01afd99551b8fdf89a40c3cab379e2449cc..2e78e1e1cd0eece74c5d7288efaf5ba4d242ea5d 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -279,7 +279,7 @@ They can take a little while to show up in Discord.
 
 ### 4.10 Check that it works
 
-- In a region channel: a raid (`/raid`), then join it with the buttons in its post; a max battle at a power spot (`/max`; the power spots come from `/gym import` of a Wayfarer export, and without it only a maps link works for `spot:`, as an "Unlisted power spot"); a train (`/train`; `kind:` for a train of Dynamax or Gigantamax battles, whose `/route add stop:` offers the power spots first); a meetup (`/meetup`); field research (`/research report`, which the region's pinned post "Today at the stops" shows).
+- In a region channel: a raid (`/raid`), then join it with the buttons in its post; a max battle at a power spot (`/max`; the power spots come from `/gym import` of a Wayfarer export, and without it only a maps link works for `spot:`, as an "Unlisted power spot"); a train (`/train`; `kind:` for a train of Dynamax or Gigantamax battles, whose `/route add stop:` offers the power spots first); a meetup (`/meetup`); field research (`/research report`, which the region's pinned post "Today at the stops" shows); Team GO Rocket (`/rocket report`: a grunt is a message in the region channel for half an hour, a leader, Giovanni or a decoy goes in the pinned post).
 - A direct message: set a want (`/want`) and have somebody else report that boss.
 - A screenshot of a raid posted with a mention of the bot (the bot itself, not a role of the same name).
 
@@ -293,7 +293,7 @@ It imports the ended legacy parties into the new party history (without member i
 
 ### 4.12 Sponsored stops from a file, once
 
-Wayfarer does not list sponsored PokéStops (a business's stops), so `/research` and `/wild near:` do not know them until staff add them with `/pokestop add`. If you have a list of them as a CSV file with the columns `id,name,lat,lon,region,basis` (Pittsburgh has one, made beside its Wayfarer export: run this once for Pittsburgh), add them all at once, after `/gym import` of your Wayfarer export:
+Wayfarer does not list sponsored PokéStops (a business's stops), so `/research`, `/rocket` and `/wild near:` do not know them until staff add them with `/pokestop add`. If you have a list of them as a CSV file with the columns `id,name,lat,lon,region,basis` (Pittsburgh has one, made beside its Wayfarer export: run this once for Pittsburgh), add them all at once, after `/gym import` of your Wayfarer export:
 
 ```bash
 ./pine seed-stops ~/pine-legacy/sponsored-stops.csv --server <server id>
@@ -336,6 +336,7 @@ The first only says what it would do, line by line: which rows it would add, and
 - **Screenshots** are read when they are posted with a mention of the bot, or attached to `/raid`. The mention must be of the bot itself (picked from the list Discord shows after `@`), not of a role of the same name. A screenshot dropped in a channel without either is not read (that would need Message Content).
 - **Settings and notifications** keep what members set before: wants, gym targets, mentions, auto-status, privacy, friend codes. They are changed through `/settings`, `/want` and `/target`. `/want` asks in a dialog what a Pokémon is wanted for (Raids, Dynamax, Gigantamax, Spawns, Research, Shadow), ticked as the member's wants are.
 - **Field research** is new: `/research report` names a PokéStop's task (up to five stops at once), the region's pinned post "Today at the stops" lists the day's tasks, and members who want a reward get a DM. Sponsored PokéStops, which Wayfarer does not list, are added by staff with `/pokestop add`.
+- **Team GO Rocket** is new too: `/rocket report` names who is at a PokéStop. A grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy grunt goes in the pinned post until midnight. `/want` takes a grunt type (at most one DM an hour for each type), a leader, any leader, Giovanni or the decoy, and the Shadow box of a Pokémon also covers what Team GO Rocket gives.
 - **Unown**: members with the `unown` role get a want for Unown the first time they use the bot, instead of the role being pinged.
 - **The party history**: the bot keeps a history of ended raids, max battles, trains and meetups for statistics. It keeps a member's Discord id only if they opt in with `/settings history enabled:True`; without it they are counted, anonymously.
 - **A map on the web**, if you set up the web pages ([web setup](../web-setup.md)): `/maps` gives members the address and a login button.
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index 889d5204787217575016f2faf2fb1ff8bed7ddd2..153d4d457f10c1978e8efba1a7add5778b5b1a3f 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -121,7 +121,7 @@ The settings that matter first:
 - `roles.unown`: the name of an Unown role the server had before Pine: its holders are given a want for Unown. Leave it as it is if you have none.
 - `raidEvents.weeklyRaidHour`: the weekly Raid Hour, in your time zone.
 
-The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, the trains still to come). Max battles are always on and need no block: `maxBattles` only changes their defaults (the max bosses are read from Pokebattler's `https://fight.pokebattler.com/raids`, `url`, every 6 hours, `refreshMinutes`; `firstBattle` and `lastBattle` are the hours max battles can be fought, 06:00 and 21:00 unless set). Field research is always on too: `research` only changes its defaults (the task list is read from Leek Duck's `https://leekduck.com/research/`, `url`, every hour, `refreshHours`, and said to be out of date in the log after 6 hours without a good read, `staleAfterHours`; `throttle` is how many reports a member may make in how many minutes, 10 in 30). The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
+The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, the trains still to come). Max battles are always on and need no block: `maxBattles` only changes their defaults (the max bosses are read from Pokebattler's `https://fight.pokebattler.com/raids`, `url`, every 6 hours, `refreshMinutes`; `firstBattle` and `lastBattle` are the hours max battles can be fought, 06:00 and 21:00 unless set). Field research is always on too: `research` only changes its defaults (the task list is read from Leek Duck's `https://leekduck.com/research/`, `url`, every hour, `refreshHours`, and said to be out of date in the log after 6 hours without a good read, `staleAfterHours`; `throttle` is how many reports a member may make in how many minutes, 10 in 30). Team GO Rocket is always on as well: `rocket` only changes its defaults (the lineups are read from ScrapedDuck's `https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.min.json`, `url`, every 6 hours, `refreshHours`, out of date after 24, `staleAfterHours`; a grunt's message stands 30 minutes, `gruntMinutes`; `throttle`, 10 reports in 30 minutes). The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
 
 ## 4. Start the bot
 
@@ -173,7 +173,7 @@ Draw the outlines in a map editor such as [Google My Maps](https://www.google.co
 
 Once regions and gyms are in, a staff member runs `/admin setup-forums` in your server: every region gets a forum beside its channel (named after the channel with `-meetups`, the `regionForumSuffix` setting), its tags, and a pinned list of active raids. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again; a region that fails says why (most often the category's permissions for the bot).
 
-Then try it: `/raid` in a region channel, the buttons in the post, `/max` (a max battle at a power spot: the power spots come with the Wayfarer import), `/train` (also `kind:Gigantamax Train`, with power spots as its stops), `/meetup`, `/research report` (the task of a PokéStop: the region's pinned post "Today at the stops" shows it), `/want` and a report of that boss by somebody else. `/help` lists everything.
+Then try it: `/raid` in a region channel, the buttons in the post, `/max` (a max battle at a power spot: the power spots come with the Wayfarer import), `/train` (also `kind:Gigantamax Train`, with power spots as its stops), `/meetup`, `/research report` (the task of a PokéStop: the region's pinned post "Today at the stops" shows it), `/rocket report` (a grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy goes in the pinned post), `/want` and a report of that boss by somebody else. `/help` lists everything.
 
 ## 8. Running it
 
diff --git a/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md b/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
index 91eed2a7e32d41dbd37803ddd48105c857db105b..60584d6cb306cd6904761411b93bb34b018ea667 100644
--- a/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
+++ b/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
@@ -62,6 +62,7 @@ Pine has been rewritten from the ground up:
 - Max battles (`/max`) at power spots, with lobbies of 4 (Dynamax) and 100 (Gigantamax) that Join fills, the bosses from Pokebattler with the event's boss first, and DMs by the Dynamax and Gigantamax boxes of `/want`
 - Trains of max battles (Max Battle Train, Gigantamax Train) with stops at power spots, a Gigantamax Train's groups filled up to its lobby, and a train planned ahead with its start (`/train start:`)
 - Field research: `/research report` at up to five PokéStops, a pinned "Today at the stops" post per region, DMs for wanted rewards; `/pokestop` for sponsored stops
+- Team GO Rocket: `/rocket report` posts a grunt for half an hour and puts leaders, Giovanni and decoys in the pinned post; `/want` a grunt type, a leader or Giovanni, and the Shadow box covers Rocket catches
 - `/counters` for a max battle: the team of three Pokebattler suggests for your role (two attackers and a charger, balanced, all attackers, shielder or healer), with a few others that would do
 - Members report a raid, max battle, train, meetup or single message to your moderators privately (`/report`, or Apps › Report to moderators on a message); `/delete` is for staff and asks whether to archive the post or delete it
 - Gyms imported from Wayfarer (`/gym import`), regions from KML (`/region import`)
diff --git a/docs/superpowers/plans/phase-0-follow-ups.md b/docs/superpowers/plans/phase-0-follow-ups.md
index 73c9f595630a4cbda37b4b97bce93d597dee8893..0b3ed98a02e0e4d4ce255679d911b2c40f30a17a 100644
--- a/docs/superpowers/plans/phase-0-follow-ups.md
+++ b/docs/superpowers/plans/phase-0-follow-ups.md
@@ -1992,3 +1992,14 @@ Plan `2026-10-22-phase-8r1-research.md`, built on `stop-reports` (worktree `.cla
 - **The sponsored stops (for Matt, before the cutover):** `npm run stops:seed -- <csv> --server <id> [--apply]` (`./pine seed-stops`) adds stops of Pine's own from `var/sponsored-export/sponsored-stops.csv` (89 stops ruled sponsored), skipping one within 30 m of a known stop or outside the server's regions; safe to run twice. Run once for Pittsburgh at the cutover (guide `migrating-a-legacy-instance.md`, 4.12). Not run on any database yet.
 - **For Matt (rulings, none blocking):** Pittsburgh's announcement is at 2,000 characters and does not name `/research` (swap one line?); the official announcement's first message is 2,348 characters, over 2,000 (split into the two messages the draft plans?); research DMs' told-once record and the post's unchanged-edit hashes are in memory, so a restart may repeat a DM and edits each post once.
 - **For 8R-2:** the stop report table already has the kind `rocket`; the pinned post's renderer takes a section after research; the Shadow box gains "in today's Rocket lineups"; `/want`'s targets gain grunt types, leaders and Giovanni.
+
+## From the 8R-2 prototype (Team GO Rocket, 2026-10-22)
+
+Prototype on `proto-8r2` (worktree `.claude/worktrees/stop-reports/var/proto-8r2`), eight tasks and the docs; area file `docs/architecture/stop-reports.md` ("Team GO Rocket").
+
+- **Migration 028** (`2026_10_22_028_rocket`): `RocketLineup` and `GruntMessage`. A Rocket report is a `StopReport` row of the kind `rocket` in the day's period, so a grunt and a hideout at a stop share one row and `decideRocket` decides inside the transaction that locks it (`saveUnless`). The brief's `GruntReport` table is named `GruntMessage`: it holds only the messages (one per region channel), the report is the `StopReport` row.
+- **Decided in the prototype (for the review):** a grunt's message is not deleted at shutdown, unlike a spawn report's (its report stands on through a restart; the next start's sweep deletes what is overdue); "Already reported" counts against `/rocket report`'s throttle (a guard refusal would not, but the decision is the transaction's); before any lineups were ever read `/rocket` offers every who without catches; a grunt reported late in the evening stands its half hour past midnight in the day it was made; the hour of a grunt's DMs is per member and grunt type whatever fired it (a type want or a Shadow want); `/want`'s Rocket targets share the rewards' five places in a full list; the lineups' catches come after the raid bosses among the Pokémon of `/want`'s list; `RocketLineupService` repeats `ResearchTaskService`'s refresh and guard rather than sharing a base (a refactor for later if a third list comes).
+- **For staging:** the grunt message's gallery of catches (one catch, the decoy's Bellsprout, is a large picture at full width: a thumbnail may read better); the hideout dialog on Android and iPhone; "Already reported" and its link; a grunt and its DM after a restart; the pinned post with research and hideouts spilling; the DM's hour note.
+- **`cutover-check`:** nothing new: a grunt's message needs Send Messages and Embed Links in the region channel, which spawn reports need already; the post's Pin Messages is 8R-1's.
+- **For 8R-3 (the map):** `ctx.rocket.report` and `channelsAt` are the one way to report; the map's confirm takes the hideout's id as `replacing`; `rocketAt` and the standing reports give the layer its grunts and hideouts.
+- **CLAUDE.md** (Matt or the controller): the area index line of `stop-reports.md` names Team GO Rocket (`/rocket`, grunts' messages, the hideouts, Rocket wants), and the status line 8R-2.
````

