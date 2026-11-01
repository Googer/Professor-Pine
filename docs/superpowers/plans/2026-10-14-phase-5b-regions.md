# Phase 5B: Region Administration (`/region`, KML, `/bounds`): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff give channels their outlines from a KML file (one or many at once; what is missing, the channel, its category and its forum, is created in the same go), look at the server's regions and what is wrong with them, export the outlines as KML, and remove a region explicitly; members see the area of their region with `/bounds`.

**Architecture:** Phase 5 (admin) is three plans: 5A (gyms, done), 5B (this one) and 5C (boss overrides, member settings, the role-authorization export). `/region` is a command group of its own, registered like `/gym` (Manage Server by default, `requireBotManagement` on top, every answer private). KML is read by a small XML reader of our own and pure functions in `src/domain/geo/` and `src/domain/regions/` (outlines checked and tidied, the plan of an import worked out against the server's channels, regions and gyms). Everything a command changes goes through `RegionAdminService` (`ctx.regionAdmin`) under the `AdminLock` it shares with the gym administration: an import creates channels first, writes all outlines in one transaction, reloads both directories and sets up forums; a removal closes the region to new parties (`PartyStore.closeRegion`), ends its parties, deletes the row and keeps or deletes the forum. Attachments are downloaded through a port (`AttachmentGateway`) restricted to Discord's hosts.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely on MySQL, Vitest. No new dependencies. One migration (011): a unique key on `Region.channelId` where no channel is shared, and an index on `Party (guildId, forumChannelId)`.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: row 205 of 4.2 and the line on `default_member_permissions` under it. Where the spec and this plan differ the plan is newer. The design brief is the git-ignored `.superpowers/sdd/phase-5b-design.md` (with Matt's three changes in the ledger); the reviews and their rulings are `review-a-rulings.md` and `review-b-rulings.md` in `.superpowers/sdd/2026-10-13-phase-5b-regions/`; what the legacy bot did is `.superpowers/sdd/phase-5-legacy-notes.txt` (section 4).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto/phase-5b`), one commit per task, with the typecheck and the tests of each task clean and the full check, build and database suite clean on the tip (about 4,350 unit tests; the database suite, 287 tests; after the closing fix wave 4,369 and 287). Two reviewers went through that branch and a third through the fixes; what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the plan.

## Decisions made in this plan

1. **Who and where.** `/region import|list|export|remove` is offered by Discord only to members with Manage Server, with `requireBotManagement` on top, tied to no channel, every answer private; its autocomplete runs the command guards. Staff touch only their own server's regions and channels; a channel whose region row belongs to another server is left out of an import. `/bounds` is an ordinary members' command (Matt): in a region's channel, its forum or a post there, the picture of the area and the gym count, privately.
2. **The import creates what is missing, all at once** (Matt). An area matched to no channel becomes a new text channel in the category its placemark's description names (or one named after the area; an existing category of that name, without case, is used). Then all outlines are written in one transaction, then every imported region without a forum gets one (the code of `/admin setup-forums`). With `channel:` the file's one area becomes that channel's outline and no channel is created.
3. **A preview first.** Nothing is created or written before staff press "Import" (its label counts what is created). The preview names every channel, category and forum it would create, flags a new channel whose name is within two letters of an existing one ("did you mean"), puts the riskiest lines first, counts gyms inside and gyms that would lie in no region of the server afterwards, warns of a category that would pass 50 channels, says that regions not in the file stay as they are, and attaches `preview.txt` with every line when a list had to be cut. A press shows "Importing…" at once, then the outcome.
4. **Reading KML.** A small XML reader of our own (no package): linear, never throws, DOCTYPE refused, depth 64. Placemarks anywhere in the document, the outer ring of a polygon (holes are ignored and said), a multi-geometry with one polygon; at most 200 areas and 20,000 corners in a file, 5,000 in one outline (Matt: traced boundaries); an outline that crosses itself or has fewer than three corners is left out with its reason. KMZ is refused with how to get KML from Google My Maps. The channel a name stands for follows the legacy rule (lower case, spaces to hyphens, other characters dropped; runs of hyphens collapsed).
5. **Export.** `/region export [region]` gives one region's outline, or every region of the server in one file that imports again unchanged ("All regions", or used outside a region channel).
6. **List.** `/region list`: every region with its gyms (and elite raid gyms), its active raids, trains and meetups, and what is wrong (no outline, channel gone, no forum, forum gone); the gyms that lie in no region; forums that party rows name and no region has (also named by `/admin setup-forums`).
7. **Removal** (Matt: explicit, never at start, and it must say what becomes of the forum). A question counts the active parties (ended), the gyms left in no region of the server, the members' saved routes of the region (deleted with it by the legacy foreign key); "Remove, keep the forum", "Remove and delete the forum" (only when it exists; deleting it deletes every post), "Cancel". On a press the region is closed to new parties, its parties are ended ("This region is being removed…"), the row is deleted (the forum and summary ids taken from the row deleted), both directories are reloaded (once more on failure, and the answer says so if it still fails), the summary post deleted, the forum kept or deleted. The text channel and the gyms are never touched.
8. **Locks.** Region and gym administration share one `AdminLock`; forum set-up after an import runs inside it. Lock order: the admin lock, a gym's lock, a party's.
9. **Pictures.** The stored outline is never simplified; the picture of a region is drawn from a simplified outline when the map address would pass 15,000 characters.
10. **Known and left** (to the follow-ups file): a question whose service call throws something other than a `UserError` after it was marked answered stays dead, as in `/gym`; the cache checks of the real gateway (`channelKind`, a deleted category) and how Discord renames created channels are proved only by staging.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure. Repositories are the only code that knows column names; a write in several steps goes through `inTransaction`; geometry is latitude first.
- **Tests never use the network and never contact Discord or Google.** Database tests never use production rows.
- Text from a file or typed by staff is shown through `plain()`. Custom ids are built and parsed only through `src/discord/custom-id.ts`. A party changes only through its services.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto/phase-5b` of this repository). Apply it exactly; `git diff <that commit> -- src test scripts` must print nothing before the task is committed; fix differences by hand, never by checking files out of that commit.
- Inside the plan a task needs the typecheck and its own tests green (and whatever else its change could have broken); the full `npm run check` must be green after the last task. `npx prettier --write <files you touched>` before every commit.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path. A commit title must not start with a slash.

## Review Focus

1. A typo in a file must be seen before anything exists on the server: Task 5, `src/commands/regions/import.test.ts` (the near-miss "did you mean", the riskiest lines first, `preview.txt` when cut, the hostile file of 200 areas).
2. A region removed while parties are being made: Task 3, `src/services/region-admin-service.test.ts` and `src/services/party-store.regions.test.ts` (a report racing the removal answers "no region"; nothing is stored with the id of a deleted region).
3. A file cannot stall or break the bot: Task 1, `src/domain/geo/xml.test.ts`, `kml.test.ts`, `outline.test.ts` (250,000 siblings, DOCTYPE, the 1 MB timing, the crossing check), and the timing of `planImport` and of the gym directory with traced outlines.
4. The download cannot be pointed elsewhere and never logs its address: Task 2, `attachment-gateway.test.ts`.
5. Everything fits Discord's limits whatever the file holds: Tasks 4 to 6 (56 and 200 areas, 60 regions).

---

### Task 1: Regions from KML: reading a file, outlines, the plan of an import

Prototype commit: `5f26abcd2c9c97b7f7469a1914c3ace2f3babcd0`

Pure parts of plan 5B (regions), and its migration.

- xml.ts: a small reader for well-formed XML, enough for KML: linear in
  the length of the text, bounded in depth, refuses a DOCTYPE, never
  throws.
- kml.ts: readKml gives the areas of a file (placemarks with a polygon:
  name, description, outer ring) and what it skipped and why; kmlText
  decodes the bytes (a zip is a KMZ); writeKml writes what readKml reads
  back to the same outlines.
- outline.ts: tidies and checks an outline (closed, no repeated points,
  in range, simple, at most 5,000 corners; every pair of sides is
  compared, about a tenth of a second at that size).
- static-map.ts: the picture of a region with a long outline is asked for
  with a simplified one (simplify.ts), so that the address fits; the
  stored outline is never simplified.
- region-import.ts: the channel name an area stands for, the category of
  a new channel, and the plan of an import: which area goes to which
  channel, which channels and categories would be created, what is left
  out and why, and what the new outlines mean for gyms and raids.
- Migration 011: a unique key on Region.channelId, added only where no
  two rows share a channel.


**Files:**

```
 src/db/migrations/2026_10_13_011_region_channel_unique.db.test.ts | 112 +++++++++++++++++++++++++++++++++
 src/db/migrations/2026_10_13_011_region_channel_unique.ts         |  55 +++++++++++++++++
 src/db/migrations/index.ts                                        |   2 +
 src/db/migrator.db.test.ts                                        |  15 ++++-
 src/domain/geo/kml.limits.test.ts                                 |  48 +++++++++++++++
 src/domain/geo/kml.test.ts                                        | 252 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/geo/kml.ts                                             | 286 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/geo/outline.test.ts                                    | 131 +++++++++++++++++++++++++++++++++++++++
 src/domain/geo/outline.ts                                         | 156 ++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/geo/region-membership.speed.test.ts                    |  31 ++++++++++
 src/domain/geo/region-membership.ts                               |  45 +++++++++++++-
 src/domain/geo/simplify.ts                                        |  51 +++++++++++++++
 src/domain/geo/static-map.test.ts                                 |  63 ++++++++++++++++++-
 src/domain/geo/static-map.ts                                      |  28 ++++++++-
 src/domain/geo/xml.test.ts                                        | 113 ++++++++++++++++++++++++++++++++++
 src/domain/geo/xml.ts                                             | 236 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/regions/region-import.more.test.ts                     | 148 ++++++++++++++++++++++++++++++++++++++++++++
 src/domain/regions/region-import.test.ts                          | 329 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/regions/region-import.ts                               | 426 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 19 files changed, 2518 insertions(+), 9 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `Regions from KML: reading a file, outlines, the plan of an import`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/src/db/migrations/2026_10_13_011_region_channel_unique.db.test.ts b/src/db/migrations/2026_10_13_011_region_channel_unique.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..743ed669fb26091679a0ea26781521db8d1a8576
--- /dev/null
+++ b/src/db/migrations/2026_10_13_011_region_channel_unique.db.test.ts
@@ -0,0 +1,112 @@
+import { sql, type Kysely } from 'kysely';
+import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import { RegionRepository } from '../repositories/region-repository.js';
+import type { DB } from '../types.js';
+import {
+  PARTY_FORUM_INDEX,
+  REGION_CHANNEL_KEY,
+  regionChannelUnique,
+} from './2026_10_13_011_region_channel_unique.js';
+
+const HOME = '412345678901234567';
+const WEST = '1234567890123456788';
+const EAST = '1234567890123456789';
+
+describe('migration 011: one region per channel', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+
+  beforeAll(async () => {
+    ({ db, stop } = await startMigratedDatabase());
+    await sql`insert into Guild (id, snowflake) values (1, ${HOME})`.execute(db);
+  });
+  afterAll(async () => {
+    await stop();
+  });
+  beforeEach(async () => {
+    await db.deleteFrom('Region').execute();
+  });
+
+  const hasKey = async (): Promise<boolean> => {
+    const found = await sql<{ unique: number }>`
+      select max(1 - non_unique) as \`unique\` from information_schema.statistics
+      where table_schema = database() and table_name = 'Region'
+        and index_name = ${REGION_CHANNEL_KEY}`.execute(db);
+    return Number(found.rows[0]?.unique ?? 0) === 1;
+  };
+  const dropKey = () =>
+    sql`alter table Region drop index ${sql.ref(REGION_CHANNEL_KEY)}`.execute(db);
+  const insert = (channelId: string | null) =>
+    sql`insert into Region (guildId, channelId) values (1, ${channelId})`.execute(db);
+  const migrate = () => regionChannelUnique.up(db);
+
+  it('has given a database without regions the key', async () => {
+    expect(await hasKey()).toBe(true);
+  });
+
+  it('indexes the forums of the parties of a server, once', async () => {
+    const columns = async () => {
+      const found = await sql<{ c: string }>`
+        select column_name as c from information_schema.statistics
+        where table_schema = database() and table_name = 'Party'
+          and index_name = ${PARTY_FORUM_INDEX} order by seq_in_index`.execute(db);
+      return found.rows.map((row) => row.c);
+    };
+    expect(await columns()).toEqual(['guildId', 'forumChannelId']);
+    await migrate();
+    expect(await columns()).toEqual(['guildId', 'forumChannelId']);
+  });
+
+  it('adds the key where no two rows share a channel, whatever else the rows hold', async () => {
+    await dropKey();
+    await insert(WEST);
+    await insert(EAST);
+    // Rows without a channel are no obstacle, however many.
+    await insert(null);
+    await insert(null);
+    await migrate();
+    expect(await hasKey()).toBe(true);
+    // The key holds from now on, and still allows rows without a channel.
+    await expect(insert(WEST)).rejects.toThrow(/Duplicate entry/u);
+    await insert(null);
+    // What the legacy bot does (look, then insert) and what this bot does keep working.
+    const regions = new RegionRepository(db);
+    expect((await regions.findByChannel(WEST))?.channelId).toBe(WEST);
+    expect((await regions.listAll()).map((region) => region.channelId)).toEqual([WEST, EAST]);
+  });
+
+  it('leaves the key out where two rows share a channel, and everything works as before', async () => {
+    await dropKey();
+    await insert(WEST);
+    await insert(WEST);
+    await insert(EAST);
+    await migrate();
+    expect(await hasKey()).toBe(false);
+    // The oldest row of a channel counts, as it always did.
+    const regions = new RegionRepository(db);
+    const rows = await db.selectFrom('Region').select('id').orderBy('id').execute();
+    expect((await regions.findByChannel(WEST))?.id).toBe(rows[0]?.id);
+    const ring = [
+      { lat: 40, lon: -80 },
+      { lat: 40.1, lon: -80 },
+      { lat: 40.1, lon: -79.9 },
+      { lat: 40, lon: -80 },
+    ];
+    expect((await regions.saveBounds(1, WEST, ring)).id).toBe(rows[0]?.id);
+    // Put right by hand, a second run adds it.
+    await db
+      .deleteFrom('Region')
+      .where('id', '=', rows[1]?.id ?? 0)
+      .execute();
+    await migrate();
+    expect(await hasKey()).toBe(true);
+  });
+
+  it('does nothing when the key is there', async () => {
+    await insert(WEST);
+    await migrate();
+    await migrate();
+    expect(await hasKey()).toBe(true);
+  });
+});
diff --git a/src/db/migrations/2026_10_13_011_region_channel_unique.ts b/src/db/migrations/2026_10_13_011_region_channel_unique.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ddce5955345d2acef7a0d2f82c6302616c062618
--- /dev/null
+++ b/src/db/migrations/2026_10_13_011_region_channel_unique.ts
@@ -0,0 +1,55 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/** The name of the unique key on a region's channel. */
+export const REGION_CHANNEL_KEY = 'region_channelid_unique';
+/** The name of the index by which the forums of a server's parties are listed. */
+export const PARTY_FORUM_INDEX = 'party_guildid_forumchannelid_index';
+
+/**
+ * One region per channel (plan 5B; Matt, 2026-10-13): a unique key on `Region.channelId`.
+ *
+ * A region is its channel, and nothing ever kept two rows from naming the same one. Everything
+ * that looks a region up by its channel takes the oldest row (`orderBy('id')`), so a duplicate
+ * was harmless but never meant. The key is added only where no two rows share a channel
+ * (production: 28 rows, no duplicate; looked at on 2026-10-13). Where duplicates exist the key
+ * is left out and everything works as before: a migration must not decide which of two regions
+ * to drop. Rows without a channel are no obstacle: a unique key allows any number of NULLs.
+ *
+ * The legacy bot's `insertIfAbsent('Region', { channelId, guildId })` looks before it inserts
+ * and keeps working under the key.
+ *
+ * With it, an index on `Party (guildId, forumChannelId)`: the forums that the parties of a
+ * server name are listed by it (`PartyRepository.partyForums`), also for a forum whose region
+ * is gone.
+ *
+ * Safe to run again after a failure half-way: a key or an index that exists is left alone.
+ */
+export const regionChannelUnique: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    const has = async (table: string, index: string): Promise<boolean> => {
+      const found = await sql<{ n: number }>`
+        select count(*) as n from information_schema.statistics
+        where table_schema = database() and table_name = ${table}
+          and index_name = ${index}`.execute(db);
+      return Number(found.rows[0]?.n ?? 0) > 0;
+    };
+    if (!(await has('Party', PARTY_FORUM_INDEX))) {
+      await sql`alter table Party add index ${sql.ref(PARTY_FORUM_INDEX)} (guildId, forumChannelId)`.execute(
+        db,
+      );
+    }
+    if (await has('Region', REGION_CHANNEL_KEY)) return;
+    const shared = await sql<{ channelId: string }>`
+      select channelId from Region where channelId is not null
+      group by channelId having count(*) > 1 limit 1`.execute(db);
+    if (shared.rows.length > 0) return;
+    await sql`alter table Region add unique key ${sql.ref(REGION_CHANNEL_KEY)} (channelId)`.execute(
+      db,
+    );
+  },
+  async down() {
+    // Additive only: the key stays.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index b33436f665215c70a4b475492778b3c0062b6229..c85c688d094aeba19f5154d6479c08d84eb9f0ad 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -10,6 +10,7 @@ import { unownWantGifts } from './2026_10_12_007_unown_want_gifts.js';
 import { selfRoleGroups } from './2026_10_13_008_self_role_groups.js';
 import { exWantsToElite } from './2026_10_13_009_ex_wants_to_elite.js';
 import { spawnReports } from './2026_10_13_010_spawn_reports.js';
+import { regionChannelUnique } from './2026_10_13_011_region_channel_unique.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -27,4 +28,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_13_008_self_role_groups': selfRoleGroups,
   '2026_10_13_009_ex_wants_to_elite': exWantsToElite,
   '2026_10_13_010_spawn_reports': spawnReports,
+  '2026_10_13_011_region_channel_unique': regionChannelUnique,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index f7ce6a1d6a1d4b7b16256b373f0b4c726b2c1028..5a32b5e1d4e187f47144959084946769458cd957 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -45,11 +45,17 @@ const ADDED_COLUMNS = [
 /** The indexes it adds to tables of the legacy bot, as `Table.index`. */
 const ADDED_INDEXES = [
   'Region.region_forumchannelid_unique',
+  'Region.region_channelid_unique',
   'Role.role_guildid_rolesnowflake_unique',
   'Role.role_groupid_foreign',
 ];
 /** The foreign keys it adds to tables of the legacy bot, as `Table.constraint`. */
 const ADDED_FOREIGN_KEYS = ['Role.role_groupid_foreign'];
+/**
+ * The columns of the legacy bot that an added index covers: MySQL then describes the column
+ * itself differently (its key marker), which is no change of the column.
+ */
+const NEWLY_KEYED_COLUMNS = ['Region.channelId'];
 
 /**
  * Everything about the Pine tables that a new install must reproduce exactly. `except` leaves
@@ -61,14 +67,15 @@ async function describeSchema(
   exceptColumns: readonly string[] = [],
   exceptIndexes: readonly string[] = [],
   exceptForeignKeys: readonly string[] = [],
+  newlyKeyed: readonly string[] = [],
 ) {
   const kept = <Row extends { t: string }>(rows: Row[]): Row[] =>
     rows.filter((row) => !except.includes(row.t));
   const described = await describeTables(database);
   return {
-    columns: kept(described.columns).filter(
-      (row) => !exceptColumns.includes(`${row.t}.${String(row.c)}`),
-    ),
+    columns: kept(described.columns)
+      .filter((row) => !exceptColumns.includes(`${row.t}.${String(row.c)}`))
+      .map((row) => (newlyKeyed.includes(`${row.t}.${String(row.c)}`) ? { ...row, k: '' } : row)),
     indexes: kept(described.indexes).filter(
       (row) => !exceptIndexes.includes(`${row.t}.${String(row.i)}`),
     ),
@@ -130,6 +137,7 @@ describe('runMigrations', () => {
       '2026_10_13_008_self_role_groups',
       '2026_10_13_009_ex_wants_to_elite',
       '2026_10_13_010_spawn_reports',
+      '2026_10_13_011_region_channel_unique',
     ]);
     expect(
       await describeSchema(
@@ -138,6 +146,7 @@ describe('runMigrations', () => {
         ADDED_COLUMNS,
         ADDED_INDEXES,
         ADDED_FOREIGN_KEYS,
+        NEWLY_KEYED_COLUMNS,
       ),
     ).toEqual(before);
     const columns = await database.query<{
diff --git a/src/domain/geo/kml.limits.test.ts b/src/domain/geo/kml.limits.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b5de620d9d2d4e55c8cfc06eb7a352b64b13d4dd
--- /dev/null
+++ b/src/domain/geo/kml.limits.test.ts
@@ -0,0 +1,48 @@
+import { describe, expect, it } from 'vitest';
+import { MAX_KML_CORNERS, readKml, writeKml } from './kml.js';
+import type { LatLon } from './lat-lon.js';
+import { MAX_OUTLINE_CORNERS } from './outline.js';
+
+/** A traced boundary: a circle of many corners with a wobble, so that few lie on a line. */
+function traced(corners: number, lat = 40, lon = -80): LatLon[] {
+  const ring = Array.from({ length: corners }, (_unused, i) => {
+    const angle = (2 * Math.PI * i) / corners;
+    const radius = 0.2 + 0.01 * Math.sin(angle * 97);
+    return { lat: lat + radius * Math.sin(angle), lon: lon + radius * Math.cos(angle) };
+  });
+  return [...ring, ring[0] ?? { lat: 0, lon: 0 }];
+}
+
+describe('readKml: what a file may cost', () => {
+  it('never throws, also for a file of a quarter of a million siblings', () => {
+    const placemarks = `<kml>${'<Placemark/>'.repeat(250_000)}</kml>`;
+    expect(() => readKml(placemarks)).not.toThrow();
+    expect(readKml(placemarks)).toEqual({ ok: false, reason: 'no-areas' });
+    const folders = `<kml><Document>${'<Folder/>'.repeat(250_000)}</Document></kml>`;
+    expect(readKml(folders)).toEqual({ ok: false, reason: 'no-areas' });
+    const geometries = `<kml><Placemark><MultiGeometry>${'<Point/>'.repeat(250_000)}</MultiGeometry></Placemark></kml>`;
+    expect(readKml(geometries)).toEqual({ ok: false, reason: 'no-areas' });
+  });
+
+  it('refuses a file with more corners in all than it reads, before it reads them', () => {
+    const areas = (count: number, corners: number) =>
+      Array.from({ length: count }, (_unused, i) => ({
+        name: `R${i}`,
+        description: null,
+        outline: traced(corners, 40 + i),
+      }));
+    // Four outlines of the most corners one may have are as much as a file may hold.
+    expect(MAX_KML_CORNERS).toBe(4 * MAX_OUTLINE_CORNERS);
+    const most = writeKml(areas(4, MAX_OUTLINE_CORNERS));
+    const started = performance.now();
+    const reading = readKml(most);
+    // About a megabyte, read in well under a second.
+    expect(most.length).toBeGreaterThan(700_000);
+    expect(performance.now() - started).toBeLessThan(1_000);
+    expect(reading.ok && reading.areas.length).toBe(4);
+    expect(readKml(writeKml(areas(5, MAX_OUTLINE_CORNERS)))).toEqual({
+      ok: false,
+      reason: 'too-many-corners',
+    });
+  });
+});
diff --git a/src/domain/geo/kml.test.ts b/src/domain/geo/kml.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2514520e66292af3550a54f21db737751150c74c
--- /dev/null
+++ b/src/domain/geo/kml.test.ts
@@ -0,0 +1,252 @@
+import { describe, expect, it } from 'vitest';
+import { kmlText, MAX_KML_AREAS, readKml, writeKml, type KmlArea } from './kml.js';
+import type { LatLon } from './lat-lon.js';
+
+const p = (lat: number, lon: number): LatLon => ({ lat, lon });
+/** A square as KML writes it: longitude first, closed. */
+const SQUARE = '-80.1,40.0,0 -80.1,40.1,0 -80.0,40.1,0 -80.0,40.0,0 -80.1,40.0,0';
+const SQUARE_RING = [p(40, -80.1), p(40.1, -80.1), p(40.1, -80), p(40, -80), p(40, -80.1)];
+
+const polygon = (coordinates: string, inner = '') =>
+  `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinates}</coordinates>` +
+  `</LinearRing></outerBoundaryIs>${inner}</Polygon>`;
+const placemark = (name: string, geometry: string) =>
+  `<Placemark><name>${name}</name>${geometry}</Placemark>`;
+const kml = (body: string) =>
+  `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">` +
+  `<Document><name>Regions</name>${body}</Document></kml>`;
+
+function read(text: string) {
+  const reading = readKml(text);
+  if (!reading.ok) throw new Error(`not read: ${reading.reason}`);
+  return reading;
+}
+
+describe('readKml', () => {
+  it('reads the areas of a file: the placemarks with a polygon, by name', () => {
+    const reading = read(
+      kml(placemark('West End', polygon(SQUARE)) + placemark(' East  Side\n', polygon(SQUARE))),
+    );
+    expect(reading.areas).toEqual([
+      { name: 'West End', outline: SQUARE_RING, holes: false, description: null },
+      { name: 'East Side', outline: SQUARE_RING, holes: false, description: null },
+    ]);
+    expect(reading.skipped).toEqual([]);
+    expect(reading.others).toBe(0);
+  });
+
+  it('finds placemarks in nested folders and directly under the root', () => {
+    const nested = read(
+      kml(
+        `<Folder><name>A</name><Folder>${placemark('Deep', polygon(SQUARE))}</Folder></Folder>` +
+          placemark('Top', polygon(SQUARE)),
+      ),
+    );
+    expect(nested.areas.map((area) => area.name)).toEqual(['Deep', 'Top']);
+    const bare = read(`<kml>${placemark('Bare', polygon(SQUARE))}</kml>`);
+    expect(bare.areas.map((area) => area.name)).toEqual(['Bare']);
+  });
+
+  it('reads tuples without an altitude and separated by any white space', () => {
+    const reading = read(
+      kml(placemark('A', polygon('\n  -80.1,40.0\n\t-80.1,40.1\r\n -80.0,40.1   -80.0,40.0\n'))),
+    );
+    expect(reading.areas[0]?.outline).toEqual(SQUARE_RING);
+  });
+
+  it('ignores inner rings and says that the area had some', () => {
+    const hole =
+      '<innerBoundaryIs><LinearRing><coordinates>-80.06,40.04 -80.06,40.06 -80.04,40.06 ' +
+      '-80.06,40.04</coordinates></LinearRing></innerBoundaryIs>';
+    const reading = read(kml(placemark('Ring', polygon(SQUARE, hole))));
+    expect(reading.areas).toEqual([
+      { name: 'Ring', outline: SQUARE_RING, holes: true, description: null },
+    ]);
+  });
+
+  it('takes a MultiGeometry with one polygon as that polygon, and skips one with several', () => {
+    const reading = read(
+      kml(
+        placemark(
+          'One',
+          `<MultiGeometry><Point><coordinates>-80,40</coordinates></Point>${polygon(SQUARE)}</MultiGeometry>`,
+        ) +
+          placemark(
+            'Two',
+            `<MultiGeometry>${polygon(SQUARE)}<MultiGeometry>${polygon(SQUARE)}</MultiGeometry></MultiGeometry>`,
+          ),
+      ),
+    );
+    expect(reading.areas.map((area) => area.name)).toEqual(['One']);
+    expect(reading.skipped).toEqual([{ name: 'Two', reason: { kind: 'several-areas' } }]);
+  });
+
+  it('counts placemarks without a polygon and does not list them', () => {
+    const reading = read(
+      kml(
+        placemark('Pin', '<Point><coordinates>-80,40,0</coordinates></Point>') +
+          placemark('Path', '<LineString><coordinates>-80,40 -81,41</coordinates></LineString>') +
+          placemark('Area', polygon(SQUARE)),
+      ),
+    );
+    expect(reading.areas.map((area) => area.name)).toEqual(['Area']);
+    expect(reading.skipped).toEqual([]);
+    expect(reading.others).toBe(2);
+  });
+
+  it('skips an area whose outline cannot be one, with the reason', () => {
+    const reading = read(
+      kml(
+        placemark('Bow', polygon('0,0 1,1 0,1 1,0')) +
+          placemark('Line', polygon('0,0 1,1')) +
+          placemark('Far', polygon('0,0 0,91 1,1')) +
+          placemark('Words', polygon('0,0 north,east 1,1')) +
+          placemark('Lonely', polygon('0,0 1 1,1')) +
+          placemark('Empty', '<Polygon><outerBoundaryIs/></Polygon>') +
+          placemark('Good', polygon(SQUARE)),
+      ),
+    );
+    expect(reading.areas.map((area) => area.name)).toEqual(['Good']);
+    expect(reading.skipped).toEqual([
+      { name: 'Bow', reason: { kind: 'outline', problem: { kind: 'crosses-itself' } } },
+      { name: 'Line', reason: { kind: 'outline', problem: { kind: 'too-few' } } },
+      { name: 'Far', reason: { kind: 'outline', problem: { kind: 'out-of-range' } } },
+      { name: 'Words', reason: { kind: 'outline', problem: { kind: 'not-a-number' } } },
+      { name: 'Lonely', reason: { kind: 'outline', problem: { kind: 'not-a-number' } } },
+      { name: 'Empty', reason: { kind: 'no-outline' } },
+    ]);
+  });
+
+  it('reads a file whose areas are all skipped, so that the reasons can be told', () => {
+    const reading = read(kml(placemark('Bow', polygon('0,0 1,1 0,1 1,0'))));
+    expect(reading.areas).toEqual([]);
+    expect(reading.skipped).toHaveLength(1);
+  });
+
+  it('gives a placemark without a name an empty one, and reads entities and CDATA in names', () => {
+    const reading = read(
+      kml(
+        `<Placemark>${polygon(SQUARE)}</Placemark>` +
+          placemark('Tom &amp; Jerry&apos;s', polygon(SQUARE)) +
+          placemark('<![CDATA[<b>Bold</b>]]>', polygon(SQUARE)),
+      ),
+    );
+    expect(reading.areas.map((area) => area.name)).toEqual(['', "Tom & Jerry's", '<b>Bold</b>']);
+  });
+
+  it('reads KML with namespace prefixes', () => {
+    const text =
+      '<kml:kml xmlns:kml="http://www.opengis.net/kml/2.2"><kml:Placemark><kml:name>P</kml:name>' +
+      `<kml:Polygon><kml:outerBoundaryIs><kml:LinearRing><kml:coordinates>${SQUARE}` +
+      '</kml:coordinates></kml:LinearRing></kml:outerBoundaryIs></kml:Polygon></kml:Placemark></kml:kml>';
+    expect(read(text).areas).toEqual([
+      { name: 'P', outline: SQUARE_RING, holes: false, description: null },
+    ]);
+  });
+
+  it('says what a text is that is no KML with areas', () => {
+    expect(readKml('PK\u0003\u0004 zipped')).toEqual({ ok: false, reason: 'kmz' });
+    expect(readKml('hello')).toEqual({ ok: false, reason: 'not-xml' });
+    expect(readKml('<kml><Document></kml>')).toEqual({ ok: false, reason: 'not-xml' });
+    expect(readKml('<!DOCTYPE kml><kml/>')).toEqual({ ok: false, reason: 'doctype' });
+    expect(readKml(`${'<a>'.repeat(100)}${'</a>'.repeat(100)}`)).toEqual({
+      ok: false,
+      reason: 'too-deep',
+    });
+    expect(readKml('<gpx><trk/></gpx>')).toEqual({ ok: false, reason: 'not-kml' });
+    expect(readKml(kml(''))).toEqual({ ok: false, reason: 'no-areas' });
+    expect(readKml(kml(placemark('Pin', '<Point><coordinates>1,2</coordinates></Point>')))).toEqual(
+      { ok: false, reason: 'no-areas' },
+    );
+  });
+
+  it('refuses a file with more areas than any server has regions', () => {
+    const many = (n: number) =>
+      kml(Array.from({ length: n }, (_unused, i) => placemark(`R${i}`, polygon(SQUARE))).join(''));
+    expect(read(many(MAX_KML_AREAS)).areas).toHaveLength(MAX_KML_AREAS);
+    expect(readKml(many(MAX_KML_AREAS + 1))).toEqual({ ok: false, reason: 'too-many-areas' });
+  });
+});
+
+describe('the description of an area', () => {
+  it('is the placemark’s description as plain text, tidied; null without one', () => {
+    const reading = read(
+      kml(
+        `<Placemark><name>A</name><description>  North\n side </description>${polygon(SQUARE)}</Placemark>` +
+          `<Placemark><name>B</name><description> </description>${polygon(SQUARE)}</Placemark>` +
+          `<Placemark><name>C</name><description><![CDATA[Tom & Jerry]]></description>${polygon(SQUARE)}</Placemark>`,
+      ),
+    );
+    expect(reading.areas.map((area) => area.description)).toEqual([
+      'North side',
+      null,
+      'Tom & Jerry',
+    ]);
+  });
+});
+
+describe('kmlText', () => {
+  const bytes = (text: string) => new TextEncoder().encode(text);
+
+  it('decodes UTF-8, with or without a byte order mark', () => {
+    expect(kmlText(bytes('<kml>é</kml>'))).toEqual({ ok: true, text: '<kml>é</kml>' });
+    expect(kmlText(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('<kml/>')]))).toEqual({
+      ok: true,
+      text: '<kml/>',
+    });
+  });
+
+  it('knows a zip by its first bytes: that is a KMZ', () => {
+    expect(kmlText(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe]))).toEqual({
+      ok: false,
+      reason: 'kmz',
+    });
+  });
+
+  it('refuses bytes that are no UTF-8 text', () => {
+    expect(kmlText(new Uint8Array([0x3c, 0xff, 0xfe, 0x3e]))).toEqual({
+      ok: false,
+      reason: 'not-text',
+    });
+    // UTF-16, as some editors save XML.
+    expect(kmlText(new Uint8Array([0xff, 0xfe, 0x3c, 0x00, 0x6b, 0x00]))).toEqual({
+      ok: false,
+      reason: 'not-text',
+    });
+    expect(kmlText(new Uint8Array([]))).toEqual({ ok: true, text: '' });
+  });
+});
+
+describe('writeKml', () => {
+  it('writes named polygons that readKml reads back to the same outlines', () => {
+    const areas: KmlArea[] = [
+      { name: 'West End', outline: SQUARE_RING, holes: false, description: null },
+      {
+        name: 'Tom & Jerry\'s <"best"> ]]> region',
+        outline: [
+          p(40.123456789012, -79.987654321098),
+          p(-33.8568, 151.2153),
+          p(1e-7, -1e-7),
+          p(40.123456789012, -79.987654321098),
+        ],
+        holes: false,
+        description: 'North & <east> of the river',
+      },
+    ];
+    const text = writeKml(areas);
+    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
+    expect(read(text).areas).toEqual(areas);
+    expect(read(text).skipped).toEqual([]);
+  });
+
+  it('writes longitude first, as KML has it', () => {
+    expect(writeKml([{ name: 'A', outline: SQUARE_RING, description: null }])).toContain(
+      '<coordinates>-80.1,40,0 -80.1,40.1,0 -80,40.1,0 -80,40,0 -80.1,40,0</coordinates>',
+    );
+  });
+
+  it('leaves out what XML cannot hold in a name', () => {
+    const text = writeKml([{ name: 'A\u0000B\u0008C', outline: SQUARE_RING, description: null }]);
+    expect(read(text).areas[0]?.name).toBe('ABC');
+  });
+});
diff --git a/src/domain/geo/kml.ts b/src/domain/geo/kml.ts
new file mode 100644
index 0000000000000000000000000000000000000000..460114126f572f1a49ca5f80e0a024b2f7bcfba4
--- /dev/null
+++ b/src/domain/geo/kml.ts
@@ -0,0 +1,286 @@
+import type { LatLon } from './lat-lon.js';
+import { MAX_OUTLINE_CORNERS, tidyOutline, type OutlineProblem } from './outline.js';
+import { childNamed, childrenNamed, readXml, type XmlElement } from './xml.js';
+
+/**
+ * How many areas one file may hold. A server has tens of regions (56 in one file is a real
+ * case); a file with thousands of polygons is something else than a set of regions.
+ */
+export const MAX_KML_AREAS = 200;
+
+/**
+ * How many corners the outlines of one file may have in all: four of the longest outline
+ * there may be. Every outline is checked for crossings, and every gym is placed in every new
+ * outline, on the one thread the bot has: this keeps a file to well under a second of that.
+ */
+export const MAX_KML_CORNERS = 4 * MAX_OUTLINE_CORNERS;
+
+/** How long the name and the description of an area are kept at most. */
+const MAX_TEXT = 200;
+
+/** An area of a KML file: a placemark with one polygon. */
+export interface KmlArea {
+  /** The placemark's `<name>`, white space tidied; empty when it has none. */
+  name: string;
+  /** The placemark's `<description>` as plain text, white space tidied; null when it has none. */
+  description: string | null;
+  /** The outer ring, tidied and closed (`tidyOutline`). */
+  outline: LatLon[];
+  /** Whether the polygon had inner rings (holes), which are ignored. */
+  holes: boolean;
+}
+
+/** Why a placemark with a polygon is no area. */
+export type KmlSkipReason =
+  /** A `MultiGeometry` with several polygons: one region is one area. */
+  | { kind: 'several-areas' }
+  /** The polygon has no outer ring with coordinates. */
+  | { kind: 'no-outline' }
+  /** The outer ring cannot be the outline of a region (`tidyOutline`). */
+  | { kind: 'outline'; problem: OutlineProblem };
+
+export interface KmlSkipped {
+  name: string;
+  reason: KmlSkipReason;
+}
+
+/**
+ * Why a text is no KML to read areas from. `kmz`: a zip archive (it starts with `PK`);
+ * `not-xml`: not well-formed XML; `doctype`: it declares a document type, which is never read;
+ * `too-deep`: nested deeper than any KML; `not-kml`: its root is not `kml`; `no-areas`: no
+ * placemark has a polygon; `too-many-areas`: more than `MAX_KML_AREAS` have one;
+ * `too-many-corners`: their outlines have more than `MAX_KML_CORNERS` corners in all.
+ */
+export type KmlProblem =
+  | 'kmz'
+  | 'not-xml'
+  | 'doctype'
+  | 'too-deep'
+  | 'not-kml'
+  | 'no-areas'
+  | 'too-many-areas'
+  | 'too-many-corners';
+
+export type KmlReading =
+  | {
+      ok: true;
+      areas: KmlArea[];
+      /** The placemarks with a polygon that are no area, each with the reason. */
+      skipped: KmlSkipped[];
+      /** How many placemarks have no polygon (points, lines). */
+      others: number;
+    }
+  | { ok: false; reason: KmlProblem };
+
+/** Text of a file with its white space tidied: runs of it are one blank, none at the ends. */
+function tidy(text: string): string {
+  return text.split(/\s+/u).filter(Boolean).join(' ').slice(0, MAX_TEXT);
+}
+
+/** A decimal number as KML writes one; anything else is no number. */
+const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u;
+/** No number of a coordinate is longer than this. */
+const MAX_NUMBER_LENGTH = 40;
+
+function numberOf(text: string): number {
+  return text.length <= MAX_NUMBER_LENGTH && NUMBER.test(text) ? Number(text) : Number.NaN;
+}
+
+/**
+ * The points of a `<coordinates>` text: `lon,lat[,alt]` tuples separated by white space. A
+ * tuple that is none becomes a point that is no number, which `tidyOutline` refuses.
+ */
+function pointsOf(coordinates: string): LatLon[] {
+  return coordinates
+    .split(/\s+/u)
+    .filter(Boolean)
+    .map((tuple) => {
+      const parts = tuple.split(',');
+      if (parts.length < 2 || parts.length > 3) return { lat: Number.NaN, lon: Number.NaN };
+      return { lat: numberOf(parts[1] ?? ''), lon: numberOf(parts[0] ?? '') };
+    });
+}
+
+/** The polygons of a placemark: its own, and those of its `MultiGeometry`, however nested. */
+function polygonsOf(placemark: XmlElement): XmlElement[] {
+  const found: XmlElement[] = [];
+  const pending = [placemark];
+  for (let next = pending.pop(); next; next = pending.pop()) {
+    // One at a time, never spread into a call: a file may have more siblings than a call
+    // takes arguments.
+    for (const child of next.children) if (child.name === 'Polygon') found.push(child);
+    // In reverse, so that they are looked at in the order of the file.
+    for (let i = next.children.length - 1; i >= 0; i--) {
+      const child = next.children[i];
+      if (child?.name === 'MultiGeometry') pending.push(child);
+    }
+  }
+  return found;
+}
+
+/** Every placemark of a document, in the order of the file, wherever it is nested. */
+function placemarksOf(root: XmlElement): XmlElement[] {
+  const found: XmlElement[] = [];
+  const pending = [root];
+  for (let next = pending.pop(); next; next = pending.pop()) {
+    if (next.name === 'Placemark') {
+      found.push(next);
+      continue;
+    }
+    for (let i = next.children.length - 1; i >= 0; i--) {
+      const child = next.children[i];
+      if (child) pending.push(child);
+    }
+  }
+  return found;
+}
+
+/**
+ * Reads the areas of a KML file. An area is a `Placemark` with a `Polygon`, wherever it stands
+ * (in the `Document`, in nested `Folder`s); its name is the placemark's `<name>`, its outline
+ * the polygon's outer ring, tidied and checked (`tidyOutline`). Inner rings are ignored, and the
+ * area says that it had some. A `MultiGeometry` with one polygon is that polygon; with several,
+ * the placemark is skipped. A placemark with a polygon that is no area is listed in `skipped`
+ * with the reason; placemarks without a polygon are only counted. A file whose placemarks with
+ * a polygon were all skipped is read all the same (`areas` is empty), so that the reasons can
+ * be told.
+ */
+export function readKml(text: string): KmlReading {
+  if (text.startsWith('PK')) return { ok: false, reason: 'kmz' };
+  const xml = readXml(text);
+  if (!xml.ok) {
+    return { ok: false, reason: xml.reason === 'malformed' ? 'not-xml' : xml.reason };
+  }
+  if (xml.root.name !== 'kml') return { ok: false, reason: 'not-kml' };
+  const areas: KmlArea[] = [];
+  const skipped: KmlSkipped[] = [];
+  let others = 0;
+  /**
+   * The placemarks with a polygon, in the order of the file: with the points of the outer ring
+   * to check, or why they are no area.
+   */
+  const found: (
+    { name: string; placemark: XmlElement; polygon: XmlElement; points: LatLon[] } | KmlSkipped
+  )[] = [];
+  let corners = 0;
+  for (const placemark of placemarksOf(xml.root)) {
+    const polygons = polygonsOf(placemark);
+    const [polygon] = polygons;
+    if (!polygon) {
+      others++;
+      continue;
+    }
+    if (found.length >= MAX_KML_AREAS) {
+      return { ok: false, reason: 'too-many-areas' };
+    }
+    const name = tidy(childNamed(placemark, 'name')?.text ?? '');
+    if (polygons.length > 1) {
+      found.push({ name, reason: { kind: 'several-areas' } });
+      continue;
+    }
+    const outer = childNamed(polygon, 'outerBoundaryIs');
+    const ring = outer && childNamed(outer, 'LinearRing');
+    const coordinates = ring && childNamed(ring, 'coordinates');
+    if (!coordinates) {
+      found.push({ name, reason: { kind: 'no-outline' } });
+      continue;
+    }
+    const points = pointsOf(coordinates.text);
+    const first = points[0];
+    const last = points[points.length - 1];
+    const closed = first && last && first.lat === last.lat && first.lon === last.lon;
+    corners += points.length - (closed && points.length > 1 ? 1 : 0);
+    // Counted before any outline is checked: the check is what costs.
+    if (corners > MAX_KML_CORNERS) return { ok: false, reason: 'too-many-corners' };
+    found.push({ name, placemark, polygon, points });
+  }
+  for (const one of found) {
+    if ('reason' in one) {
+      skipped.push(one);
+      continue;
+    }
+    const { name, placemark, polygon, points } = one;
+    const outline = tidyOutline(points);
+    if (!outline.ok) {
+      skipped.push({ name, reason: { kind: 'outline', problem: outline.problem } });
+      continue;
+    }
+    const described = childNamed(placemark, 'description');
+    const description = described ? tidy(described.text) : '';
+    areas.push({
+      name,
+      description: description === '' ? null : description,
+      outline: outline.ring,
+      holes: childrenNamed(polygon, 'innerBoundaryIs').length > 0,
+    });
+  }
+  if (areas.length === 0 && skipped.length === 0) return { ok: false, reason: 'no-areas' };
+  return { ok: true, areas, skipped, others };
+}
+
+/**
+ * The text of a file that should be KML, from its bytes. A zip archive (the bytes `PK`) is a
+ * KMZ; anything that is not UTF-8 is no text this reader knows.
+ */
+export function kmlText(
+  bytes: Uint8Array,
+): { ok: true; text: string } | { ok: false; reason: 'kmz' | 'not-text' } {
+  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return { ok: false, reason: 'kmz' };
+  try {
+    // `fatal`: bytes that are no UTF-8 are refused, not replaced. The decoder drops a byte
+    // order mark by itself.
+    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
+  } catch {
+    return { ok: false, reason: 'not-text' };
+  }
+}
+
+/** Text as the content of an XML element: escaped, and without what XML cannot hold. */
+function xmlText(text: string): string {
+  let escaped = '';
+  for (const char of text) {
+    const code = char.codePointAt(0) ?? 0;
+    if (code < 0x20 && code !== 0x9 && code !== 0xa && code !== 0xd) continue;
+    if (code === 0xfffe || code === 0xffff) continue;
+    if (char === '&') escaped += '&amp;';
+    else if (char === '<') escaped += '&lt;';
+    else if (char === '>') escaped += '&gt;';
+    else escaped += char;
+  }
+  return escaped;
+}
+
+/**
+ * A KML document of named polygons, which `readKml` reads back to the same names, descriptions
+ * and outlines: longitude first, the numbers as JavaScript writes them (which it reads back to
+ * the very same numbers).
+ */
+export function writeKml(
+  areas: readonly Pick<KmlArea, 'name' | 'description' | 'outline'>[],
+): string {
+  const placemarks = areas.map(({ name, description, outline }) => {
+    const coordinates = outline.map(({ lat, lon }) => `${lon},${lat},0`).join(' ');
+    return [
+      '    <Placemark>',
+      `      <name>${xmlText(name)}</name>`,
+      ...(description === null ? [] : [`      <description>${xmlText(description)}</description>`]),
+      '      <Polygon>',
+      '        <outerBoundaryIs>',
+      '          <LinearRing>',
+      `            <coordinates>${coordinates}</coordinates>`,
+      '          </LinearRing>',
+      '        </outerBoundaryIs>',
+      '      </Polygon>',
+      '    </Placemark>',
+    ].join('\n');
+  });
+  return [
+    '<?xml version="1.0" encoding="UTF-8"?>',
+    '<kml xmlns="http://www.opengis.net/kml/2.2">',
+    '  <Document>',
+    ...placemarks,
+    '  </Document>',
+    '</kml>',
+    '',
+  ].join('\n');
+}
diff --git a/src/domain/geo/outline.test.ts b/src/domain/geo/outline.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d048b8f05a1f06afddf90fcabe1f04fccc2fe93d
--- /dev/null
+++ b/src/domain/geo/outline.test.ts
@@ -0,0 +1,131 @@
+import { describe, expect, it } from 'vitest';
+import { isClosedRing, type LatLon } from './lat-lon.js';
+import { MAX_OUTLINE_CORNERS, tidyOutline } from './outline.js';
+
+const p = (lat: number, lon: number): LatLon => ({ lat, lon });
+const SQUARE = [p(0, 0), p(1, 0), p(1, 1), p(0, 1)];
+
+function ring(points: readonly LatLon[]): LatLon[] {
+  const tidy = tidyOutline(points);
+  if (!tidy.ok) throw new Error(`refused: ${tidy.problem.kind}`);
+  return tidy.ring;
+}
+
+describe('tidyOutline', () => {
+  it('keeps a closed ring as it is', () => {
+    expect(ring([...SQUARE, p(0, 0)])).toEqual([...SQUARE, p(0, 0)]);
+  });
+
+  it('closes an open ring', () => {
+    const closed = ring(SQUARE);
+    expect(closed).toEqual([...SQUARE, p(0, 0)]);
+    expect(isClosedRing(closed)).toBe(true);
+  });
+
+  it('accepts either winding', () => {
+    const reversed = [...SQUARE].reverse();
+    expect(ring(reversed)).toEqual([...reversed, reversed[0]]);
+  });
+
+  it('drops points that repeat the one before, also around the closing point', () => {
+    expect(
+      ring([p(0, 0), p(0, 0), p(1, 0), p(1, 0), p(1, 0), p(1, 1), p(0, 1), p(0, 0), p(0, 0)]),
+    ).toEqual([...SQUARE, p(0, 0)]);
+  });
+
+  it('accepts a triangle and a shape that is not convex', () => {
+    expect(ring([p(0, 0), p(1, 0), p(0, 1)])).toHaveLength(4);
+    // An L.
+    expect(ring([p(0, 0), p(2, 0), p(2, 1), p(1, 1), p(1, 2), p(0, 2)])).toHaveLength(7);
+  });
+
+  it('refuses fewer than three distinct corners', () => {
+    for (const points of [
+      [],
+      [p(0, 0)],
+      [p(0, 0), p(1, 1)],
+      [p(0, 0), p(1, 1), p(0, 0)],
+      [p(0, 0), p(0, 0), p(0, 0), p(0, 0)],
+      [p(0, 0), p(1, 1), p(0, 0), p(1, 1), p(0, 0)],
+    ]) {
+      expect(tidyOutline(points)).toEqual({ ok: false, problem: { kind: 'too-few' } });
+    }
+  });
+
+  it('refuses a coordinate that is no number', () => {
+    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
+      expect(tidyOutline([...SQUARE, p(bad, 0)])).toEqual({
+        ok: false,
+        problem: { kind: 'not-a-number' },
+      });
+      expect(tidyOutline([...SQUARE, p(0, bad)])).toEqual({
+        ok: false,
+        problem: { kind: 'not-a-number' },
+      });
+    }
+  });
+
+  it('refuses a latitude or a longitude out of range, and accepts the ends of the ranges', () => {
+    expect(tidyOutline([p(0, 0), p(90.01, 0), p(1, 1)])).toEqual({
+      ok: false,
+      problem: { kind: 'out-of-range' },
+    });
+    expect(tidyOutline([p(0, 0), p(1, -180.01), p(1, 1)])).toEqual({
+      ok: false,
+      problem: { kind: 'out-of-range' },
+    });
+    expect(tidyOutline([p(-90, -180), p(90, -180), p(90, 180), p(-90, 180)]).ok).toBe(true);
+  });
+
+  it('refuses more corners than a hand-drawn region has, and says how many', () => {
+    // A circle of points: simple, only too fine.
+    const circle = (corners: number) =>
+      Array.from({ length: corners }, (_unused, i) => {
+        const angle = (2 * Math.PI * i) / corners;
+        return p(40 + Math.sin(angle), -80 + Math.cos(angle));
+      });
+    expect(tidyOutline(circle(MAX_OUTLINE_CORNERS)).ok).toBe(true);
+    expect(tidyOutline(circle(MAX_OUTLINE_CORNERS + 1))).toEqual({
+      ok: false,
+      problem: { kind: 'too-many', corners: MAX_OUTLINE_CORNERS + 1 },
+    });
+    // Counted before anything dear is done: a ring of a hundred thousand points is refused at once.
+    const started = performance.now();
+    expect(tidyOutline(circle(100_000)).ok).toBe(false);
+    expect(performance.now() - started).toBeLessThan(1_000);
+  });
+
+  it('checks the longest outline it accepts for crossings in well under a second', () => {
+    // A traced boundary: a comb of 2,500 teeth, whose sides all lie in the same narrow band
+    // (the worst case for looking only at sides that are near each other).
+    const comb: LatLon[] = [];
+    const teeth = (MAX_OUTLINE_CORNERS - 2) / 2;
+    for (let i = 0; i < teeth; i++) comb.push(p(40 + (i % 2), -80 + i * 0.0001));
+    comb.push(p(42, -80 + teeth * 0.0001), p(42, -80.0001));
+    const started = performance.now();
+    expect(tidyOutline(comb).ok).toBe(true);
+    const took = performance.now() - started;
+    expect(took).toBeLessThan(1_000);
+    // One crossing at the very end is still found.
+    const crossed = [...comb.slice(0, -1), p(39, -80.00005)];
+    expect(tidyOutline(crossed)).toEqual({ ok: false, problem: { kind: 'crosses-itself' } });
+  });
+
+  it.each([
+    ['a bow tie', [p(0, 0), p(1, 1), p(1, 0), p(0, 1)]],
+    [
+      'a figure of eight that meets in a corner',
+      [p(0, 0), p(1, 0), p(1, 1), p(2, 1), p(2, 2), p(1, 2), p(1, 1), p(0, 1)],
+    ],
+    ['a corner that lies on another side', [p(0, 0), p(2, 0), p(2, 2), p(1, 0), p(0, 2)]],
+    ['a spike that folds back on itself', [p(0, 0), p(2, 0), p(1, 0), p(1, 1)]],
+    ['corners all on one line', [p(0, 0), p(1, 1), p(2, 2)]],
+    ['a side that runs along another', [p(0, 0), p(3, 0), p(3, 1), p(2, 0), p(1, 0), p(0, 1)]],
+  ])('refuses %s as an outline that crosses itself', (_what, points) => {
+    expect(tidyOutline(points)).toEqual({ ok: false, problem: { kind: 'crosses-itself' } });
+  });
+
+  it('does not take corners on one line along a side for a crossing', () => {
+    expect(ring([p(0, 0), p(0.5, 0), p(1, 0), p(1, 1), p(0, 1)])).toHaveLength(6);
+  });
+});
diff --git a/src/domain/geo/outline.ts b/src/domain/geo/outline.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5d13a5941219390fa3aa1b1dd7f1b862ed9bd498
--- /dev/null
+++ b/src/domain/geo/outline.ts
@@ -0,0 +1,156 @@
+import type { LatLon } from './lat-lon.js';
+
+/**
+ * How many corners the outline of a region may have. A region drawn by hand has tens; one
+ * traced along a boundary (a township line) has thousands (Matt, 2026-10-13: those must be
+ * accepted). The check for crossings compares only sides whose spans of longitude overlap (a
+ * sweep, see `isSimple`): an outline this long is checked in milliseconds (outline.test.ts
+ * holds the longest under a second).
+ */
+export const MAX_OUTLINE_CORNERS = 5_000;
+
+/** Why a list of points cannot be the outline of a region. */
+export type OutlineProblem =
+  /** A latitude or longitude that is no finite number. */
+  | { kind: 'not-a-number' }
+  /** A latitude outside -90..90 or a longitude outside -180..180. */
+  | { kind: 'out-of-range' }
+  /** Fewer than three distinct corners: no area. */
+  | { kind: 'too-few' }
+  /** More corners than `MAX_OUTLINE_CORNERS`. */
+  | { kind: 'too-many'; corners: number }
+  /** Two sides cross, touch or run along each other. */
+  | { kind: 'crosses-itself' };
+
+export type TidyOutline = { ok: true; ring: LatLon[] } | { ok: false; problem: OutlineProblem };
+
+const same = (a: LatLon, b: LatLon): boolean => a.lat === b.lat && a.lon === b.lon;
+
+/** Twice the signed area of the triangle a, b, c: zero when the three lie on one line. */
+function turn(a: LatLon, b: LatLon, c: LatLon): number {
+  return (b.lat - a.lat) * (c.lon - a.lon) - (b.lon - a.lon) * (c.lat - a.lat);
+}
+
+/** Whether c, known to lie on the line through a and b, lies between them (ends included). */
+function between(a: LatLon, b: LatLon, c: LatLon): boolean {
+  return (
+    Math.min(a.lat, b.lat) <= c.lat &&
+    c.lat <= Math.max(a.lat, b.lat) &&
+    Math.min(a.lon, b.lon) <= c.lon &&
+    c.lon <= Math.max(a.lon, b.lon)
+  );
+}
+
+/** Whether the segments a-b and c-d have a point in common, their ends included. */
+function meet(a: LatLon, b: LatLon, c: LatLon, d: LatLon): boolean {
+  const abc = turn(a, b, c);
+  const abd = turn(a, b, d);
+  const cda = turn(c, d, a);
+  const cdb = turn(c, d, b);
+  if (
+    ((abc > 0 && abd < 0) || (abc < 0 && abd > 0)) &&
+    ((cda > 0 && cdb < 0) || (cda < 0 && cdb > 0))
+  )
+    return true;
+  return (
+    (abc === 0 && between(a, b, c)) ||
+    (abd === 0 && between(a, b, d)) ||
+    (cda === 0 && between(c, d, a)) ||
+    (cdb === 0 && between(c, d, b))
+  );
+}
+
+/**
+ * Whether two sides that share the corner `shared` run back along each other: `before` and
+ * `after` (their other ends) lie on one line with it, on the same side of it.
+ */
+function foldsBack(before: LatLon, shared: LatLon, after: LatLon): boolean {
+  if (turn(before, shared, after) !== 0) return false;
+  const dot =
+    (before.lat - shared.lat) * (after.lat - shared.lat) +
+    (before.lon - shared.lon) * (after.lon - shared.lon);
+  return dot > 0;
+}
+
+/**
+ * Whether a ring of distinct neighbouring corners (open: the last joins the first) is simple.
+ * Neighbouring sides must not run back along each other; any other two sides must not meet.
+ * Only sides whose spans of longitude overlap can meet: the sides are taken in the order of
+ * where they begin in longitude, and each is compared only with those still open there (a
+ * sweep), and of those only with sides whose span of latitude overlaps its own. A traced
+ * boundary of thousands of corners is so checked in milliseconds.
+ */
+function isSimple(corners: readonly LatLon[]): boolean {
+  const n = corners.length;
+  const at = (i: number): LatLon => corners[i % n] as LatLon;
+  for (let i = 0; i < n; i++) {
+    // The sides i and i + 1 share corner i + 1.
+    if (foldsBack(at(i), at(i + 1), at(i + 2))) return false;
+  }
+  const west = new Float64Array(n);
+  const east = new Float64Array(n);
+  const south = new Float64Array(n);
+  const north = new Float64Array(n);
+  for (let i = 0; i < n; i++) {
+    const a = at(i);
+    const b = at(i + 1);
+    west[i] = Math.min(a.lon, b.lon);
+    east[i] = Math.max(a.lon, b.lon);
+    south[i] = Math.min(a.lat, b.lat);
+    north[i] = Math.max(a.lat, b.lat);
+  }
+  const order = Array.from({ length: n }, (_unused, i) => i).sort(
+    (a, b) => (west[a] ?? 0) - (west[b] ?? 0),
+  );
+  const open: number[] = [];
+  for (const i of order) {
+    const from = west[i] ?? 0;
+    // The sides that end west of this one are closed: dropped in place, without a new list.
+    let kept = 0;
+    for (const j of open) if ((east[j] ?? 0) >= from) open[kept++] = j;
+    open.length = kept;
+    for (const j of open) {
+      // Neighbours share a corner, and were looked at above.
+      const apart = Math.abs(i - j);
+      if (apart === 1 || apart === n - 1) continue;
+      if ((north[i] ?? 0) < (south[j] ?? 0) || (north[j] ?? 0) < (south[i] ?? 0)) continue;
+      if (meet(at(i), at(i + 1), at(j), at(j + 1))) return false;
+    }
+    open.push(i);
+  }
+  return true;
+}
+
+/**
+ * Makes the outline of a region of the points of a ring, or says why they are none. Points that
+ * repeat the one before are dropped, and the ring is closed (its first point is also its last),
+ * as `RegionRepository` stores it. Refused: a coordinate that is no number or out of range,
+ * fewer than three distinct corners, more than `MAX_OUTLINE_CORNERS`, and an outline that
+ * crosses or touches itself (by a sweep over the sides in the order of their longitude, which
+ * compares only sides that are near each other: `isSimple`): MySQL's `ST_Contains` and
+ * `ringContains` are only sure to agree on a simple polygon. Either
+ * winding is accepted and kept. Latitude and longitude are taken as flat coordinates, as
+ * everywhere regions are compared with gyms.
+ */
+export function tidyOutline(points: readonly LatLon[]): TidyOutline {
+  const refused = (problem: OutlineProblem): TidyOutline => ({ ok: false, problem });
+  const corners: LatLon[] = [];
+  for (const { lat, lon } of points) {
+    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return refused({ kind: 'not-a-number' });
+    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return refused({ kind: 'out-of-range' });
+    const last = corners[corners.length - 1];
+    if (!last || !same(last, { lat, lon })) corners.push({ lat, lon });
+  }
+  // The closing point of a closed ring repeats the first: the corners are the open ring.
+  const first = corners[0];
+  while (corners.length > 1 && first && same(first, corners[corners.length - 1] as LatLon)) {
+    corners.pop();
+  }
+  const distinct = new Set(corners.map(({ lat, lon }) => `${lat} ${lon}`)).size;
+  if (distinct < 3) return refused({ kind: 'too-few' });
+  if (corners.length > MAX_OUTLINE_CORNERS) {
+    return refused({ kind: 'too-many', corners: corners.length });
+  }
+  if (!isSimple(corners)) return refused({ kind: 'crosses-itself' });
+  return { ok: true, ring: [...corners, { ...(first as LatLon) }] };
+}
diff --git a/src/domain/geo/region-membership.speed.test.ts b/src/domain/geo/region-membership.speed.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d80cbb1343d60abd3d455669a13518b819ee25f7
--- /dev/null
+++ b/src/domain/geo/region-membership.speed.test.ts
@@ -0,0 +1,31 @@
+import { describe, expect, it } from 'vitest';
+import type { LatLon } from './lat-lon.js';
+import { gymsByRegion } from './region-membership.js';
+
+function traced(corners: number, lat: number, lon: number): LatLon[] {
+  const ring = Array.from({ length: corners }, (_unused, i) => {
+    const angle = (2 * Math.PI * i) / corners;
+    const r = 0.05 * (1 + 0.05 * Math.sin(angle * 97));
+    return { lat: lat + r * Math.sin(angle), lon: lon + r * Math.cos(angle) };
+  });
+  return [...ring, ring[0] ?? { lat: 0, lon: 0 }];
+}
+
+describe('gymsByRegion: long outlines', () => {
+  it('sorts thousands of gyms into thirty regions of 5,000 corners in well under a second', () => {
+    const gyms = Array.from({ length: 3_000 }, (_unused, i) => ({
+      id: i + 1,
+      lat: 40 + (i % 60) * 0.1,
+      lon: -80 + Math.floor(i / 60) * 0.1,
+    }));
+    const regions = Array.from({ length: 30 }, (_unused, i) => ({
+      channelId: `c${i}`,
+      bounds: traced(5_000, 40 + (i % 6), -80 + Math.floor(i / 6)),
+    }));
+    const started = performance.now();
+    const sorted = gymsByRegion(regions, gyms);
+    expect(performance.now() - started).toBeLessThan(1_000);
+    // The gym at the middle of the first region is its own.
+    expect(sorted.get('c0')?.local.has(1)).toBe(true);
+  });
+});
diff --git a/src/domain/geo/region-membership.ts b/src/domain/geo/region-membership.ts
index 2b7747c22bd913e49d4f6de16ff4b94739c6cf15..c3a7e22712361cbe902e8d85d9e1847fa7aa5ce7 100644
--- a/src/domain/geo/region-membership.ts
+++ b/src/domain/geo/region-membership.ts
@@ -22,6 +22,44 @@ export function ringContains(ring: readonly LatLon[], point: LatLon): boolean {
   return inside;
 }
 
+/** The smallest box of latitudes and longitudes that holds an outline. */
+export interface Box {
+  south: number;
+  north: number;
+  west: number;
+  east: number;
+}
+
+export function boxOf(ring: readonly LatLon[]): Box {
+  const box = { south: Infinity, north: -Infinity, west: Infinity, east: -Infinity };
+  for (const { lat, lon } of ring) {
+    if (lat < box.south) box.south = lat;
+    if (lat > box.north) box.north = lat;
+    if (lon < box.west) box.west = lon;
+    if (lon > box.east) box.east = lon;
+  }
+  return box;
+}
+
+/** Whether a point lies in a box (on its edge counts). */
+export function inBox(box: Box, point: LatLon): boolean {
+  return (
+    point.lat >= box.south &&
+    point.lat <= box.north &&
+    point.lon >= box.west &&
+    point.lon <= box.east
+  );
+}
+
+/**
+ * A test of points against one outline: `ringContains`, asked only of points in the outline's
+ * box. An outline may have thousands of corners, and most points lie far from it.
+ */
+export function containment(ring: readonly LatLon[]): (point: LatLon) => boolean {
+  const box = boxOf(ring);
+  return (point) => inBox(box, point) && ringContains(ring, point);
+}
+
 /**
  * The outline blown up around its middle (the mean of its corners), so that it also covers the
  * edge of the neighbouring regions. The east-west stretch is not corrected for latitude; at the
@@ -62,10 +100,11 @@ export function gymsByRegion(
     const membership: RegionGyms = { local: new Set(), neighbouring: new Set() };
     result.set(region.channelId, membership);
     if (!region.bounds) continue;
-    const enlarged = enlargeRing(region.bounds);
+    const local = containment(region.bounds);
+    const near = containment(enlargeRing(region.bounds));
     for (const gym of gyms) {
-      if (ringContains(region.bounds, gym)) membership.local.add(gym.id);
-      else if (ringContains(enlarged, gym)) membership.neighbouring.add(gym.id);
+      if (local(gym)) membership.local.add(gym.id);
+      else if (near(gym)) membership.neighbouring.add(gym.id);
     }
   }
   return result;
diff --git a/src/domain/geo/simplify.ts b/src/domain/geo/simplify.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8ab0f69c7442e8d5610545a4ba76583d9c6d890a
--- /dev/null
+++ b/src/domain/geo/simplify.ts
@@ -0,0 +1,51 @@
+import type { LatLon } from './lat-lon.js';
+
+/** How far `point` lies from the segment a-b, in degrees taken as flat coordinates. */
+function distance(point: LatLon, a: LatLon, b: LatLon): number {
+  const dLat = b.lat - a.lat;
+  const dLon = b.lon - a.lon;
+  const length = dLat * dLat + dLon * dLon;
+  // A segment without length (the closing point of a ring is its first): the distance to it.
+  const along =
+    length === 0
+      ? 0
+      : Math.min(
+          1,
+          Math.max(0, ((point.lat - a.lat) * dLat + (point.lon - a.lon) * dLon) / length),
+        );
+  return Math.hypot(point.lat - (a.lat + along * dLat), point.lon - (a.lon + along * dLon));
+}
+
+/**
+ * A line with fewer points that stays within `tolerance` (degrees) of the line given
+ * (Douglas-Peucker): its first and last point are kept, and every point kept is one of the
+ * line's own, in their order. It works on a list of stretches, never by calling itself, so a
+ * long line cannot exhaust the stack. A closed ring stays closed.
+ */
+export function simplifyLine(points: readonly LatLon[], tolerance: number): LatLon[] {
+  if (points.length <= 2) return [...points];
+  const keep = new Array<boolean>(points.length).fill(false);
+  keep[0] = true;
+  keep[points.length - 1] = true;
+  const stretches: [number, number][] = [[0, points.length - 1]];
+  for (let stretch = stretches.pop(); stretch; stretch = stretches.pop()) {
+    const [from, to] = stretch;
+    const a = points[from];
+    const b = points[to];
+    if (!a || !b) continue;
+    let farthest = -1;
+    let most = tolerance;
+    for (let i = from + 1; i < to; i++) {
+      const point = points[i];
+      const away = point ? distance(point, a, b) : 0;
+      if (away > most) {
+        most = away;
+        farthest = i;
+      }
+    }
+    if (farthest < 0) continue;
+    keep[farthest] = true;
+    stretches.push([from, farthest], [farthest, to]);
+  }
+  return points.filter((_point, i) => keep[i]);
+}
diff --git a/src/domain/geo/static-map.test.ts b/src/domain/geo/static-map.test.ts
index ae06a150d2239de2b8dfb8da3668ac5455e1aaf0..3fc5962a02b98c769bdadd166b5d1c1ebe216fd0 100644
--- a/src/domain/geo/static-map.test.ts
+++ b/src/domain/geo/static-map.test.ts
@@ -1,6 +1,12 @@
 import { describe, expect, it } from 'vitest';
 import { encodePolyline } from './polyline.js';
-import { STATIC_MAP_ENDPOINT, gymMap, regionMap, staticMapQuery } from './static-map.js';
+import {
+  MAX_STATIC_MAP_QUERY,
+  STATIC_MAP_ENDPOINT,
+  gymMap,
+  regionMap,
+  staticMapQuery,
+} from './static-map.js';
 
 const square = [
   { lat: 40, lon: -80.1 },
@@ -96,3 +102,58 @@ describe('staticMapQuery', () => {
     );
   });
 });
+
+describe('regionMap with a long outline', () => {
+  /** A traced boundary: a circle of many corners with a wobble, so that few lie on a line. */
+  const traced = (corners: number) => {
+    const ring = Array.from({ length: corners }, (_unused, i) => {
+      const angle = (2 * Math.PI * i) / corners;
+      const radius = 0.2 + 0.01 * Math.sin(angle * 97);
+      return { lat: 40 + radius * Math.sin(angle), lon: -80 + radius * Math.cos(angle) };
+    });
+    return [...ring, ring[0] ?? { lat: 0, lon: 0 }];
+  };
+
+  it('leaves an outline as it is while its picture can be asked for', () => {
+    const outline = traced(300);
+    expect(regionMap(outline).paths?.[0]?.points).toEqual(outline);
+  });
+
+  it('simplifies an outline of 5,000 corners for the picture, so that the address fits', () => {
+    const outline = traced(5_000);
+    // As it is, the address would be longer than Google takes.
+    expect(staticMapQuery({ paths: [{ points: outline, fill: true }] }).length).toBeGreaterThan(
+      MAX_STATIC_MAP_QUERY,
+    );
+    const started = performance.now();
+    const map = regionMap(outline);
+    expect(performance.now() - started).toBeLessThan(1_000);
+    const points = map.paths?.[0]?.points ?? [];
+    expect(staticMapQuery(map).length).toBeLessThanOrEqual(MAX_STATIC_MAP_QUERY);
+    // Still the same shape: closed, made of corners of the outline in their order, and many.
+    expect(points.length).toBeGreaterThan(200);
+    expect(points[0]).toEqual(outline[0]);
+    expect(points[points.length - 1]).toEqual(outline[0]);
+    let from = 0;
+    for (const point of points.slice(0, -1)) {
+      const found = outline.indexOf(point, from);
+      expect(found).toBeGreaterThanOrEqual(from);
+      from = found + 1;
+    }
+    // The same outline gives the same picture.
+    expect(staticMapQuery(regionMap(outline))).toBe(staticMapQuery(map));
+    // The outline itself is not touched.
+    expect(outline).toHaveLength(5_001);
+  });
+
+  it('gets an outline that no tolerance shortens enough under the limit all the same', () => {
+    // Corners that jump across the whole world: every one of them matters.
+    const wild = Array.from({ length: 2_000 }, (_unused, i) => ({
+      lat: i % 2 === 0 ? -80 + (i % 7) : 80 - (i % 5),
+      lon: -170 + (i * 340) / 2_000,
+    }));
+    const map = regionMap([...wild, wild[0] ?? { lat: 0, lon: 0 }]);
+    expect(staticMapQuery(map).length).toBeLessThanOrEqual(MAX_STATIC_MAP_QUERY);
+    expect(map.paths?.[0]?.points.length).toBeGreaterThan(3);
+  });
+});
diff --git a/src/domain/geo/static-map.ts b/src/domain/geo/static-map.ts
index a86812dca3ca54f1db37532b1c453fd83b8729db..07612d1c4d35b5f275161cfc2b6c467f25101ed2 100644
--- a/src/domain/geo/static-map.ts
+++ b/src/domain/geo/static-map.ts
@@ -1,8 +1,17 @@
 import type { LatLon } from './lat-lon.js';
 import { encodePolyline } from './polyline.js';
+import { simplifyLine } from './simplify.js';
 
 export const STATIC_MAP_ENDPOINT = 'https://maps.googleapis.com/maps/api/staticmap';
 
+/**
+ * How long the query of a picture may be. Google takes an address of 16,384 characters; this
+ * leaves room for the endpoint, the key and a signature.
+ */
+export const MAX_STATIC_MAP_QUERY = 15_000;
+/** The finest simplification tried for a picture: a hundred-thousandth of a degree, about a metre. */
+const FINEST_TOLERANCE = 1e-5;
+
 /** A line or outline drawn on the map in red; `fill` shades the inside of a closed outline. */
 export interface MapPath {
   points: readonly LatLon[];
@@ -40,7 +49,22 @@ export function gymMap(gym: LatLon): StaticMap {
   return { markers: [{ lat: gym.lat, lon: gym.lon }], zoom: 15 };
 }
 
-/** The map of a region: its outline, shaded. */
+/**
+ * The map of a region: its outline, shaded. The outline of a region may have thousands of
+ * corners (a traced boundary), more than the address of a picture holds: such an outline is
+ * simplified, for the picture only (the stored outline never is), by the smallest tolerance
+ * with which the address fits, doubled from about a metre. A picture is 1,280 points wide,
+ * so what goes is not seen. An outline that fits is drawn as it is.
+ */
 export function regionMap(bounds: readonly LatLon[]): StaticMap {
-  return { paths: [{ points: bounds, fill: true }] };
+  const mapOf = (points: readonly LatLon[]): StaticMap => ({ paths: [{ points, fill: true }] });
+  const fits = (map: StaticMap): boolean => staticMapQuery(map).length <= MAX_STATIC_MAP_QUERY;
+  const whole = mapOf(bounds);
+  if (fits(whole)) return whole;
+  for (let tolerance = FINEST_TOLERANCE; tolerance < 360; tolerance *= 2) {
+    const map = mapOf(simplifyLine(bounds, tolerance));
+    if (fits(map)) return map;
+  }
+  // No tolerance left more than the two ends of the line, and they still do not fit: cannot be.
+  return mapOf(bounds.slice(0, 1));
 }
diff --git a/src/domain/geo/xml.test.ts b/src/domain/geo/xml.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ea996bfe4b9ebf4a637967a9a316ec5d2613b471
--- /dev/null
+++ b/src/domain/geo/xml.test.ts
@@ -0,0 +1,113 @@
+import { describe, expect, it } from 'vitest';
+import { childrenNamed, MAX_XML_DEPTH, readXml, type XmlElement } from './xml.js';
+
+function root(text: string): XmlElement {
+  const read = readXml(text);
+  if (!read.ok) throw new Error(`not read: ${read.reason}`);
+  return read.root;
+}
+
+describe('readXml', () => {
+  it('reads elements, their text and their children in order', () => {
+    const doc = root('<a><b>one</b><c/><b>two</b>tail</a>');
+    expect(doc.name).toBe('a');
+    expect(doc.children.map((child) => child.name)).toEqual(['b', 'c', 'b']);
+    expect(childrenNamed(doc, 'b').map((child) => child.text)).toEqual(['one', 'two']);
+    // The text of an element is its own, not that of its children.
+    expect(doc.text).toBe('tail');
+    expect(doc.children[1]).toEqual({ name: 'c', text: '', children: [] });
+  });
+
+  it('skips the declaration, comments and processing instructions', () => {
+    const doc = root(
+      '\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<!-- a > comment -->\n' +
+        '<a><!-- <b>not an element</b> -->x<?pi <c/> ?>y</a>\n<!-- after -->\n',
+    );
+    expect(doc).toEqual({ name: 'a', text: 'xy', children: [] });
+  });
+
+  it('reads CDATA as text, as it stands', () => {
+    expect(root('<a>1 <![CDATA[<b> & ]] > ]]> 2</a>').text).toBe('1 <b> & ]] >  2');
+  });
+
+  it('reads the five entities and numeric character references', () => {
+    expect(root('<a>&lt;&gt;&amp;&quot;&apos; &#65;&#x42;&#x1F600;</a>').text).toBe(
+      '<>&"\' AB\u{1F600}',
+    );
+  });
+
+  it('parses attributes and drops them, whatever their quotes hold', () => {
+    const doc = root(`<a x="1" y='>' z = "a/>b"><b k="v"/><c q='"'>t</c></a>`);
+    expect(doc.children.map((child) => child.name)).toEqual(['b', 'c']);
+    expect(doc.children[1]?.text).toBe('t');
+  });
+
+  it('strips namespace prefixes from element names', () => {
+    const doc = root('<kml:kml xmlns:kml="http://www.opengis.net/kml/2.2"><kml:Doc/></kml:kml>');
+    expect(doc.name).toBe('kml');
+    expect(doc.children[0]?.name).toBe('Doc');
+  });
+
+  it('refuses a DOCTYPE outright: no entity is ever expanded', () => {
+    const bomb =
+      '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]>' +
+      '<lolz>&lol2;</lolz>';
+    expect(readXml(bomb)).toEqual({ ok: false, reason: 'doctype' });
+    expect(readXml('<!doctype html><html></html>')).toEqual({ ok: false, reason: 'doctype' });
+  });
+
+  it('refuses an entity it does not know, and a reference to no character', () => {
+    expect(readXml('<a>&nbsp;</a>')).toEqual({ ok: false, reason: 'malformed' });
+    expect(readXml('<a>&#0;</a>')).toEqual({ ok: false, reason: 'malformed' });
+    expect(readXml('<a>&#x110000;</a>')).toEqual({ ok: false, reason: 'malformed' });
+    expect(readXml('<a>&#xD800;</a>')).toEqual({ ok: false, reason: 'malformed' });
+    expect(readXml('<a>& b</a>')).toEqual({ ok: false, reason: 'malformed' });
+    expect(readXml('<a>&amp</a>')).toEqual({ ok: false, reason: 'malformed' });
+  });
+
+  it.each([
+    ['nothing', ''],
+    ['only white space', '  \n'],
+    ['text without an element', 'hello'],
+    ['an element that is not closed', '<a><b></b>'],
+    ['a closing tag that does not match', '<a><b></a></b>'],
+    ['a closing tag without an opening one', '</a>'],
+    ['a second root', '<a/><b/>'],
+    ['text after the root', '<a/>tail'],
+    ['a tag that never ends', '<a><b'],
+    ['a comment that never ends', '<a><!-- x</a>'],
+    ['CDATA that never ends', '<a><![CDATA[x</a>'],
+    ['an instruction that never ends', '<?xml version="1.0"<a/>'],
+    ['an attribute without a value', '<a x></a>'],
+    ['an attribute without quotes', '<a x=1></a>'],
+    ['an attribute whose quote never ends', '<a x="1></a>'],
+    ['a tag without a name', '<><a/>'],
+    ['a name that is only a prefix', '<kml:/>'],
+    ['CDATA outside the root', '<![CDATA[x]]><a/>'],
+    ['a stray declaration inside', '<a><!ELEMENT b></a>'],
+  ])('answers malformed for %s', (_what, text) => {
+    expect(readXml(text)).toEqual({ ok: false, reason: 'malformed' });
+  });
+
+  it('reads as deep as the limit and refuses anything deeper', () => {
+    const nested = (depth: number) => `${'<a>'.repeat(depth)}${'</a>'.repeat(depth)}`;
+    expect(readXml(nested(MAX_XML_DEPTH)).ok).toBe(true);
+    expect(readXml(nested(MAX_XML_DEPTH + 1))).toEqual({ ok: false, reason: 'too-deep' });
+    // Far beyond any stack: it never throws.
+    expect(readXml('<a>'.repeat(200_000))).toEqual({ ok: false, reason: 'too-deep' });
+  });
+
+  it('stays quick on text made to make a careless reader slow', () => {
+    const started = performance.now();
+    // A megabyte each of: opening angle brackets, ampersands, unfinished comments, white
+    // space inside a tag, and one long attribute.
+    expect(readXml('<'.repeat(1_000_000)).ok).toBe(false);
+    expect(readXml(`<a>${'&'.repeat(1_000_000)}</a>`).ok).toBe(false);
+    expect(readXml(`<a>${'<!--'.repeat(250_000)}</a>`).ok).toBe(false);
+    expect(readXml(`<a${' '.repeat(1_000_000)}`).ok).toBe(false);
+    expect(readXml(`<a x="${'y'.repeat(1_000_000)}"/>`).ok).toBe(true);
+    expect(readXml(`<a>${'<b/>'.repeat(250_000)}</a>`).ok).toBe(true);
+    expect(readXml(`<a>${'x &amp; '.repeat(125_000)}</a>`).ok).toBe(true);
+    expect(performance.now() - started).toBeLessThan(5_000);
+  });
+});
diff --git a/src/domain/geo/xml.ts b/src/domain/geo/xml.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3582ac21901978487caefc16320058edeb93d4fb
--- /dev/null
+++ b/src/domain/geo/xml.ts
@@ -0,0 +1,236 @@
+/**
+ * A small reader for well-formed XML: enough for KML and nothing more. It knows elements, text,
+ * CDATA, the five predefined entities and numeric character references; it skips comments and
+ * processing instructions (the XML declaration is one), and it parses attributes only to step
+ * over them. A DOCTYPE is refused outright, so no entity is ever defined or expanded. It reads
+ * in one pass with `indexOf` and never with a regular expression over the text, so its time is
+ * linear in the length of the text; nesting is bounded (`MAX_XML_DEPTH`) and kept on a list,
+ * not on the call stack. It answers a reason for anything it cannot read and never throws.
+ */
+
+/** How deep elements may be nested. KML of a map editor is five or six deep. */
+export const MAX_XML_DEPTH = 64;
+
+/** An element: its name without a namespace prefix, its own text, and its child elements. */
+export interface XmlElement {
+  name: string;
+  /** The text directly inside the element (not that of its children), entities resolved. */
+  text: string;
+  children: XmlElement[];
+}
+
+/**
+ * Why a text was not read. `doctype`: it declares a document type, which is never read;
+ * `too-deep`: elements nested deeper than `MAX_XML_DEPTH`; `malformed`: anything else that is
+ * not well-formed XML as this reader knows it.
+ */
+export type XmlProblem = 'doctype' | 'too-deep' | 'malformed';
+
+export type XmlReading = { ok: true; root: XmlElement } | { ok: false; reason: XmlProblem };
+
+/** The child elements of an element that have this name, in order. */
+export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
+  return element.children.filter((child) => child.name === name);
+}
+
+/** The first child element with this name. */
+export function childNamed(element: XmlElement, name: string): XmlElement | undefined {
+  return element.children.find((child) => child.name === name);
+}
+
+const ENTITIES: Readonly<Record<string, string>> = {
+  lt: '<',
+  gt: '>',
+  amp: '&',
+  quot: '"',
+  apos: "'",
+};
+
+/** The longest reference there is: `&#x10FFFF;`. */
+const MAX_REFERENCE = 10;
+
+function isSpace(char: string | undefined): boolean {
+  return char === ' ' || char === '\n' || char === '\t' || char === '\r';
+}
+
+/** Whether a number is a character XML allows, as a code point. */
+function isXmlChar(code: number): boolean {
+  return (
+    code === 0x9 ||
+    code === 0xa ||
+    code === 0xd ||
+    (code >= 0x20 && code <= 0xd7ff) ||
+    (code >= 0xe000 && code <= 0xfffd) ||
+    (code >= 0x10000 && code <= 0x10ffff)
+  );
+}
+
+/** The character a reference names (what stands between `&` and `;`); undefined for none. */
+function referenced(name: string): string | undefined {
+  if (!name.startsWith('#')) return ENTITIES[name];
+  const hex = name.startsWith('#x');
+  const digits = name.slice(hex ? 2 : 1);
+  if (digits === '') return undefined;
+  for (const digit of digits) {
+    const known = hex ? '0123456789abcdefABCDEF' : '0123456789';
+    if (!known.includes(digit)) return undefined;
+  }
+  const code = Number.parseInt(digits, hex ? 16 : 10);
+  return isXmlChar(code) ? String.fromCodePoint(code) : undefined;
+}
+
+/** Text with its references resolved; undefined when one of them is none. */
+function decoded(raw: string): string | undefined {
+  let at = raw.indexOf('&');
+  if (at < 0) return raw;
+  const parts: string[] = [];
+  let from = 0;
+  while (at >= 0) {
+    // A reference is short: the `;` is looked for only that far, so a text full of `&`
+    // costs no more than its length.
+    const end = raw.indexOf(';', at + 1);
+    if (end < 0 || end - at - 1 > MAX_REFERENCE) return undefined;
+    const char = referenced(raw.slice(at + 1, end));
+    if (char === undefined) return undefined;
+    parts.push(raw.slice(from, at), char);
+    from = end + 1;
+    at = raw.indexOf('&', from);
+  }
+  parts.push(raw.slice(from));
+  return parts.join('');
+}
+
+/** An element name without its namespace prefix; undefined for what is no name. */
+function localName(raw: string): string | undefined {
+  const name = raw.slice(raw.lastIndexOf(':') + 1);
+  if (name === '') return undefined;
+  for (const char of name) {
+    if (char === '<' || char === '&' || char === '=' || char === '"' || char === "'") {
+      return undefined;
+    }
+  }
+  return name;
+}
+
+/** An element that is being read: the raw name of its tag, and its text in pieces. */
+interface Open {
+  raw: string;
+  element: XmlElement;
+  text: string[];
+}
+
+/**
+ * Steps over the attributes of a start tag, from `at` (just after its name). Gives where the
+ * tag ends (the index after its `>`) and whether it closed itself (`/>`); undefined for a tag
+ * that is not well formed. Every character is looked at once.
+ */
+function endOfTag(text: string, start: number): { next: number; empty: boolean } | undefined {
+  let at = start;
+  for (;;) {
+    while (isSpace(text[at])) at++;
+    const char = text[at];
+    if (char === undefined) return undefined;
+    if (char === '>') return { next: at + 1, empty: false };
+    if (char === '/') return text[at + 1] === '>' ? { next: at + 2, empty: true } : undefined;
+    // An attribute: a name, `=`, and a value in quotes.
+    const nameStart = at;
+    while (at < text.length) {
+      const now = text[at];
+      if (now === '=' || now === '>' || now === '/' || now === '<' || isSpace(now)) break;
+      if (now === '"' || now === "'") return undefined;
+      at++;
+    }
+    if (at === nameStart) return undefined;
+    while (isSpace(text[at])) at++;
+    if (text[at] !== '=') return undefined;
+    at++;
+    while (isSpace(text[at])) at++;
+    const quote = text[at];
+    if (quote !== '"' && quote !== "'") return undefined;
+    const close = text.indexOf(quote, at + 1);
+    if (close < 0) return undefined;
+    at = close + 1;
+  }
+}
+
+/** Reads a text as XML. See the head of this file for what it knows and what it refuses. */
+export function readXml(input: string): XmlReading {
+  const malformed: XmlReading = { ok: false, reason: 'malformed' };
+  const text = input.startsWith('\uFEFF') ? input.slice(1) : input;
+  const stack: Open[] = [];
+  let root: XmlElement | undefined;
+  let at = 0;
+
+  while (at < text.length) {
+    const top = stack[stack.length - 1];
+    if (text[at] !== '<') {
+      const next = text.indexOf('<', at);
+      const end = next < 0 ? text.length : next;
+      const raw = text.slice(at, end);
+      if (top) {
+        const value = decoded(raw);
+        if (value === undefined) return malformed;
+        top.text.push(value);
+      } else if (raw.trim() !== '') {
+        return malformed;
+      }
+      at = end;
+      continue;
+    }
+    if (text.startsWith('<?', at)) {
+      const end = text.indexOf('?>', at + 2);
+      if (end < 0) return malformed;
+      at = end + 2;
+      continue;
+    }
+    if (text.startsWith('<!--', at)) {
+      const end = text.indexOf('-->', at + 4);
+      if (end < 0) return malformed;
+      at = end + 3;
+      continue;
+    }
+    if (text.startsWith('<![CDATA[', at)) {
+      const end = text.indexOf(']]>', at + 9);
+      if (end < 0 || !top) return malformed;
+      top.text.push(text.slice(at + 9, end));
+      at = end + 3;
+      continue;
+    }
+    if (text[at + 1] === '!') {
+      const declared = text.slice(at + 2, at + 9).toUpperCase();
+      return declared === 'DOCTYPE' ? { ok: false, reason: 'doctype' } : malformed;
+    }
+    if (text[at + 1] === '/') {
+      const end = text.indexOf('>', at + 2);
+      if (end < 0 || !top) return malformed;
+      if (text.slice(at + 2, end).trimEnd() !== top.raw) return malformed;
+      top.element.text = top.text.join('');
+      stack.pop();
+      at = end + 1;
+      continue;
+    }
+    // A start tag: its name runs to the first white space, `/` or `>`.
+    let nameEnd = at + 1;
+    while (nameEnd < text.length) {
+      const char = text[nameEnd];
+      if (char === '>' || char === '/' || isSpace(char)) break;
+      nameEnd++;
+    }
+    const raw = text.slice(at + 1, nameEnd);
+    const name = localName(raw);
+    if (name === undefined) return malformed;
+    const tag = endOfTag(text, nameEnd);
+    if (!tag) return malformed;
+    const element: XmlElement = { name, text: '', children: [] };
+    if (top) top.element.children.push(element);
+    else if (root) return malformed;
+    else root = element;
+    if (!tag.empty) {
+      if (stack.length >= MAX_XML_DEPTH) return { ok: false, reason: 'too-deep' };
+      stack.push({ raw, element, text: [] });
+    }
+    at = tag.next;
+  }
+  if (stack.length > 0 || !root) return malformed;
+  return { ok: true, root };
+}
diff --git a/src/domain/regions/region-import.more.test.ts b/src/domain/regions/region-import.more.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ae3b8e72d5f13bead4568e5a979e6480bb18c5a5
--- /dev/null
+++ b/src/domain/regions/region-import.more.test.ts
@@ -0,0 +1,148 @@
+import { describe, expect, it } from 'vitest';
+import type { KmlArea } from '../geo/kml.js';
+import type { LatLon } from '../geo/lat-lon.js';
+import {
+  categoryNameFor,
+  planImport,
+  type ImportInput,
+  type ServerChannel,
+} from './region-import.js';
+
+function square(south: number, west: number, north: number, east: number): LatLon[] {
+  return [
+    { lat: south, lon: west },
+    { lat: north, lon: west },
+    { lat: north, lon: east },
+    { lat: south, lon: east },
+    { lat: south, lon: west },
+  ];
+}
+
+/** A traced boundary of many corners around a point. */
+function traced(corners: number, lat: number, lon: number, radius = 0.05): LatLon[] {
+  const ring = Array.from({ length: corners }, (_unused, i) => {
+    const angle = (2 * Math.PI * i) / corners;
+    const r = radius * (1 + 0.05 * Math.sin(angle * 97));
+    return { lat: lat + r * Math.sin(angle), lon: lon + r * Math.cos(angle) };
+  });
+  return [...ring, ring[0] ?? { lat: 0, lon: 0 }];
+}
+
+const WEST = square(40, -80.1, 40.1, -80);
+const area = (name: string, outline = WEST, more: Partial<KmlArea> = {}): KmlArea => ({
+  name,
+  description: null,
+  outline,
+  holes: false,
+  ...more,
+});
+const text = (id: string, name: string, categoryId: string | null = null): ServerChannel => ({
+  id,
+  name,
+  kind: 'text',
+  categoryId,
+});
+
+function plan(input: Partial<ImportInput> & Pick<ImportInput, 'areas'>) {
+  return planImport({
+    channels: [],
+    regions: [],
+    guildId: 1,
+    gyms: [],
+    raids: [],
+    mayCreate: true,
+    ...input,
+  });
+}
+
+describe('categoryNameFor: the #', () => {
+  it('strips one leading # only', () => {
+    expect(categoryNameFor(area('##Odd'))).toBe('#Odd');
+    expect(categoryNameFor(area('C#'))).toBe('C#');
+  });
+});
+
+describe('planImport: what staff should look at twice', () => {
+  it('flags a new channel whose name is close to an existing channel or another area', () => {
+    const made = plan({
+      areas: [
+        area('Nort Hills'),
+        area('South Side', square(41, -81, 41.1, -80.9)),
+        area('Soth Sde', square(42, -81, 42.1, -80.9)),
+        area('Far Away', square(43, -81, 43.1, -80.9)),
+      ],
+      channels: [text('c1', 'north-hills')],
+    });
+    expect(made.imports.map((one) => [one.channelName, one.nearMiss])).toEqual([
+      ['nort-hills', 'north-hills'],
+      ['south-side', 'soth-sde'],
+      ['soth-sde', 'south-side'],
+      ['far-away', undefined],
+    ]);
+  });
+
+  it('marks an outline that is the same as before', () => {
+    const made = plan({
+      areas: [area('West'), area('East', square(40, -80, 40.1, -79.9))],
+      channels: [text('c1', 'west'), text('c2', 'east')],
+      regions: [
+        { id: 1, guildId: 1, channelId: 'c1', forumChannelId: 'f1', bounds: WEST },
+        { id: 2, guildId: 1, channelId: 'c2', forumChannelId: null, bounds: WEST },
+      ],
+    });
+    expect(made.imports.map((one) => [one.name, one.unchanged])).toEqual([
+      ['West', true],
+      ['East', false],
+    ]);
+  });
+
+  it('counts the forums an import would make: one for every region that has none', () => {
+    const made = plan({
+      areas: [area('West'), area('East'), area('New', square(41, -81, 41.1, -80.9))],
+      channels: [text('c1', 'west'), text('c2', 'east')],
+      regions: [{ id: 1, guildId: 1, channelId: 'c1', forumChannelId: 'f1', bounds: null }],
+    });
+    // West has a forum; East is a new region, New a new channel: two forums.
+    expect(made.imports.map((one) => one.hasForum)).toEqual([true, false, false]);
+    expect(made.newForums).toBe(2);
+  });
+
+  it('warns of a category that would hold more channels than Discord allows', () => {
+    const channels: ServerChannel[] = [
+      { id: 'k1', name: 'Full', kind: 'category', categoryId: null },
+      ...Array.from({ length: 47 }, (_unused, i) => text(`c${i}`, `old-${i}`, 'k1')),
+    ];
+    const areas = [
+      area('One', square(41, -81, 41.1, -80.9), { description: 'Full' }),
+      area('Two', square(42, -81, 42.1, -80.9), { description: 'full' }),
+      area('Three', square(43, -81, 43.1, -80.9), { description: 'Roomy' }),
+    ];
+    const made = plan({ areas, channels });
+    // 47 there, 2 new channels and their 2 forums.
+    expect(made.crowded).toEqual([{ name: 'Full', channels: 51 }]);
+    expect(plan({ areas: areas.slice(1), channels }).crowded).toEqual([]);
+  });
+
+  it('plans an import of large outlines over many gyms in well under a second', () => {
+    const gyms = Array.from({ length: 3_000 }, (_unused, i) => ({
+      id: i + 1,
+      lat: 40 + (i % 60) * 0.1,
+      lon: -80 + Math.floor(i / 60) * 0.1,
+    }));
+    const regions = Array.from({ length: 30 }, (_unused, i) => ({
+      id: i + 1,
+      guildId: 1,
+      channelId: `c${i}`,
+      forumChannelId: null,
+      bounds: traced(5_000, 40 + (i % 6), -80 + Math.floor(i / 6)),
+    }));
+    const channels = regions.map((region, i) => text(region.channelId, `r-${i}`));
+    const areas = Array.from({ length: 4 }, (_unused, i) =>
+      area(`r-${i}`, traced(5_000, 40.02 + (i % 6), -80 + Math.floor(i / 6))),
+    );
+    const started = performance.now();
+    const made = plan({ areas, channels, regions, gyms });
+    expect(performance.now() - started).toBeLessThan(1_000);
+    expect(made.imports).toHaveLength(4);
+  });
+});
diff --git a/src/domain/regions/region-import.test.ts b/src/domain/regions/region-import.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1e939469c8b6bf314a699b8db5be44ee57dedf7f
--- /dev/null
+++ b/src/domain/regions/region-import.test.ts
@@ -0,0 +1,329 @@
+import { describe, expect, it } from 'vitest';
+import type { KmlArea } from '../geo/kml.js';
+import type { LatLon } from '../geo/lat-lon.js';
+import {
+  categoryNameFor,
+  channelKey,
+  channelNameFor,
+  planImport,
+  type ImportInput,
+  type ServerChannel,
+} from './region-import.js';
+
+function square(south: number, west: number, north: number, east: number): LatLon[] {
+  return [
+    { lat: south, lon: west },
+    { lat: north, lon: west },
+    { lat: north, lon: east },
+    { lat: south, lon: east },
+    { lat: south, lon: west },
+  ];
+}
+
+const WEST = square(40, -80.1, 40.1, -80);
+const EAST = square(40, -80, 40.1, -79.9);
+const area = (name: string, outline = WEST, more: Partial<KmlArea> = {}): KmlArea => ({
+  name,
+  description: null,
+  outline,
+  holes: false,
+  ...more,
+});
+const text = (id: string, name: string, categoryId: string | null = null): ServerChannel => ({
+  id,
+  name,
+  kind: 'text',
+  categoryId,
+});
+const category = (id: string, name: string): ServerChannel => ({
+  id,
+  name,
+  kind: 'category',
+  categoryId: null,
+});
+
+const GYMS = [
+  { id: 1, lat: 40.05, lon: -80.05 },
+  { id: 2, lat: 40.06, lon: -80.06 },
+  { id: 3, lat: 40.05, lon: -79.95 },
+  { id: 4, lat: 41, lon: -79 },
+];
+
+function plan(input: Partial<ImportInput> & Pick<ImportInput, 'areas'>) {
+  return planImport({
+    channels: [],
+    regions: [],
+    guildId: 1,
+    gyms: GYMS,
+    raids: [],
+    mayCreate: true,
+    ...input,
+  });
+}
+
+describe('channelNameFor', () => {
+  it.each([
+    ['West End', 'west-end'],
+    ['#west-end', 'west-end'],
+    ['  North  Side ', 'north-side'],
+    ['Mt. Lebanon / Dormont', 'mt-lebanon-dormont'],
+    ['snake_case_99', 'snake_case_99'],
+    ['Café Zürich', 'café-zürich'],
+    ['東京 タワー', '東京-タワー'],
+    ['--Odd--Name--', 'odd-name'],
+    ['!!!', ''],
+    ['', ''],
+  ])('makes %j the channel name %j', (name, channel) => {
+    expect(channelNameFor(name)).toBe(channel);
+  });
+
+  it('never gives a name longer than Discord takes', () => {
+    expect(channelNameFor('a'.repeat(300))).toHaveLength(100);
+  });
+
+  it('compares names as the rule writes them, whatever else a channel is called', () => {
+    expect(channelKey('🔥-West-End')).toBe(channelKey('west end'));
+    expect(channelKey('west_end')).not.toBe(channelKey('west-end'));
+  });
+});
+
+describe('categoryNameFor', () => {
+  it('is the description, or else the name of the area without its #', () => {
+    expect(categoryNameFor(area('#West End', WEST, { description: '  North Hills ' }))).toBe(
+      'North Hills',
+    );
+    expect(categoryNameFor(area(' #West End '))).toBe('West End');
+    expect(categoryNameFor(area('x', WEST, { description: 'c'.repeat(150) }))).toHaveLength(100);
+    expect(categoryNameFor(area('#'))).toBeNull();
+  });
+});
+
+describe('planImport', () => {
+  it('matches every area to the text channel its name stands for', () => {
+    const made = plan({
+      areas: [area('West End'), area('East Side', EAST, { holes: true })],
+      channels: [text('c1', 'west-end'), text('c2', 'east-side'), text('c3', 'general')],
+      regions: [{ id: 7, guildId: 1, channelId: 'c1', forumChannelId: 'f1', bounds: EAST }],
+    });
+    expect(made.leftOut).toEqual([]);
+    expect(made.imports).toMatchObject([
+      {
+        name: 'West End',
+        channelName: 'west-end',
+        channel: { id: 'c1' },
+        regionId: 7,
+        hasForum: true,
+        // The Library and the Fountain lie in the new outline; before, it held gym 3.
+        gyms: 2,
+        gymsBefore: 1,
+        holes: false,
+      },
+      {
+        name: 'East Side',
+        channelName: 'east-side',
+        channel: { id: 'c2' },
+        regionId: null,
+        hasForum: false,
+        gyms: 1,
+        gymsBefore: null,
+        holes: true,
+      },
+    ]);
+    expect(made.newChannels).toEqual([]);
+    expect(made.newCategories).toEqual([]);
+    // Gym 3 lay in West End and now lies in East Side: nothing is left without a region.
+    expect(made.stranded).toBe(0);
+  });
+
+  it('plans a new channel for a name no channel has, in the category the area names', () => {
+    const made = plan({
+      areas: [
+        area('West End', WEST, { description: 'north hills' }),
+        area('East Side', EAST, { description: 'North Hills' }),
+        area('Downtown', EAST, { description: 'City' }),
+        area('Lone Pine'),
+      ],
+      channels: [category('k1', 'North Hills'), category('k2', 'lone pine'), text('c9', 'general')],
+    });
+    expect(made.leftOut).toEqual([]);
+    expect(made.imports.map((planned) => [planned.channelName, planned.channel])).toEqual([
+      ['west-end', { create: { category: { id: 'k1', name: 'North Hills' } } }],
+      ['east-side', { create: { category: { id: 'k1', name: 'North Hills' } } }],
+      ['downtown', { create: { category: { create: 'City' } } }],
+      // Without a description: a category named after the area, and the one that exists is used.
+      ['lone-pine', { create: { category: { id: 'k2', name: 'lone pine' } } }],
+    ]);
+    expect(made.newChannels).toEqual(['west-end', 'east-side', 'downtown', 'lone-pine']);
+    expect(made.newCategories).toEqual(['City']);
+  });
+
+  it('lets two new areas share one new category, named as the first of them writes it', () => {
+    const made = plan({
+      areas: [
+        area('A', WEST, { description: 'South Side' }),
+        area('B', EAST, { description: 'south side' }),
+        area('Solo', EAST),
+      ],
+    });
+    expect(made.imports.map((planned) => planned.channel)).toEqual([
+      { create: { category: { create: 'South Side' } } },
+      { create: { category: { create: 'South Side' } } },
+      { create: { category: { create: 'Solo' } } },
+    ]);
+    expect(made.newCategories).toEqual(['South Side', 'Solo']);
+  });
+
+  it('leaves out what needs a channel when it may not create one', () => {
+    const made = plan({
+      areas: [area('West End'), area('New Place', EAST)],
+      channels: [text('c1', 'west-end')],
+      mayCreate: false,
+    });
+    expect(made.imports.map((planned) => planned.name)).toEqual(['West End']);
+    expect(made.leftOut).toEqual([
+      { name: 'New Place', channelName: 'new-place', reason: 'cannot-create' },
+    ]);
+    expect(made.newChannels).toEqual([]);
+  });
+
+  it('leaves out an area whose name is not one channel’s, each with its reason', () => {
+    const made = plan({
+      areas: [
+        area('Twice'),
+        area('Double'),
+        area('double'),
+        area('Voice'),
+        area('!!!'),
+        area(''),
+        area('Theirs'),
+        area('Fine', EAST),
+      ],
+      channels: [
+        text('c1', 'twice'),
+        text('c2', 'Twice'),
+        text('c3', 'double'),
+        { id: 'v1', name: 'voice', kind: 'other', categoryId: null },
+        text('c5', 'theirs'),
+        text('c6', 'fine'),
+      ],
+      regions: [{ id: 3, guildId: 2, channelId: 'c5', forumChannelId: null, bounds: null }],
+    });
+    expect(made.imports.map((planned) => planned.name)).toEqual(['Fine']);
+    expect(made.leftOut).toEqual([
+      { name: 'Twice', channelName: 'twice', reason: 'several-channels' },
+      { name: 'Double', channelName: 'double', reason: 'several-areas' },
+      { name: 'double', channelName: 'double', reason: 'several-areas' },
+      { name: 'Voice', channelName: 'voice', reason: 'not-text' },
+      { name: '!!!', channelName: '', reason: 'no-name' },
+      { name: '', channelName: '', reason: 'no-name' },
+      { name: 'Theirs', channelName: 'theirs', reason: 'foreign' },
+    ]);
+  });
+
+  it('leaves out two new areas of one name, and creates nothing for them', () => {
+    const made = plan({ areas: [area('New'), area('new', EAST)] });
+    expect(made.imports).toEqual([]);
+    expect(made.leftOut.map((left) => left.reason)).toEqual(['several-areas', 'several-areas']);
+    expect(made.newChannels).toEqual([]);
+    expect(made.newCategories).toEqual([]);
+  });
+
+  it('does not take a category or a forum of the name for the channel', () => {
+    const made = plan({
+      areas: [area('West End')],
+      channels: [
+        category('k1', 'west-end'),
+        { id: 'f1', name: 'west-end', kind: 'forum', categoryId: null },
+      ],
+    });
+    // A forum of that name stands in the way; a category does not.
+    expect(made.leftOut).toEqual([
+      { name: 'West End', channelName: 'west-end', reason: 'not-text' },
+    ]);
+    const free = plan({ areas: [area('West End')], channels: [category('k1', 'WEST END')] });
+    expect(free.imports[0]?.channel).toEqual({
+      create: { category: { id: 'k1', name: 'WEST END' } },
+    });
+  });
+
+  describe('for one channel', () => {
+    const channels = [text('c1', 'west-end'), text('c2', 'east-side')];
+    const target = { id: 'c1', name: 'west-end' };
+
+    it('takes the one area of a file, whatever its name', () => {
+      const made = plan({ areas: [area('Anything at all')], channels, target });
+      expect(made.problem).toBeUndefined();
+      expect(made.imports).toMatchObject([{ name: 'Anything at all', channel: { id: 'c1' } }]);
+      expect(made.leftOut).toEqual([]);
+    });
+
+    it('takes the one area whose name stands for the channel, and leaves the others out', () => {
+      const made = plan({
+        areas: [area('East Side', EAST), area('West End'), area('Elsewhere')],
+        channels,
+        target,
+      });
+      expect(made.imports).toMatchObject([{ name: 'West End', channel: { id: 'c1' } }]);
+      expect(made.leftOut).toEqual([
+        { name: 'East Side', channelName: 'east-side', reason: 'other-channel' },
+        { name: 'Elsewhere', channelName: 'elsewhere', reason: 'other-channel' },
+      ]);
+      // Nothing is ever created for one channel.
+      expect(made.newChannels).toEqual([]);
+    });
+
+    it('says when none or several of several areas stand for the channel', () => {
+      expect(plan({ areas: [area('A'), area('B')], channels, target })).toMatchObject({
+        imports: [],
+        problem: 'none-for-channel',
+      });
+      expect(
+        plan({ areas: [area('West End'), area('west end', EAST)], channels, target }),
+      ).toMatchObject({ imports: [], problem: 'several-for-channel' });
+    });
+
+    it('does not take a channel that is another server’s region', () => {
+      const made = plan({
+        areas: [area('x')],
+        channels,
+        target,
+        regions: [{ id: 3, guildId: 2, channelId: 'c1', forumChannelId: null, bounds: null }],
+      });
+      expect(made.imports).toEqual([]);
+      expect(made.leftOut).toEqual([{ name: 'x', channelName: 'west-end', reason: 'foreign' }]);
+    });
+  });
+
+  it('counts the gyms that would lie in no region of this server any more', () => {
+    // West End shrinks to a corner without gyms; East Side stays as it is and keeps gym 3.
+    const made = plan({
+      areas: [area('West End', square(40.09, -80.1, 40.1, -80.09))],
+      channels: [text('c1', 'west-end'), text('c2', 'east-side')],
+      regions: [
+        { id: 1, guildId: 1, channelId: 'c1', forumChannelId: null, bounds: WEST },
+        { id: 2, guildId: 1, channelId: 'c2', forumChannelId: null, bounds: EAST },
+        // Another server's region over the same ground does not keep a gym in this server.
+        { id: 9, guildId: 2, channelId: 'x9', forumChannelId: null, bounds: WEST },
+      ],
+    });
+    expect(made.imports).toMatchObject([{ gyms: 0, gymsBefore: 2, stranded: 2 }]);
+    expect(made.stranded).toBe(2);
+  });
+
+  it('counts the raids of a changed region whose gym would lie outside it', () => {
+    const made = plan({
+      areas: [area('West End', square(40.055, -80.1, 40.1, -80))],
+      channels: [text('c1', 'west-end')],
+      regions: [{ id: 1, guildId: 1, channelId: 'c1', forumChannelId: null, bounds: WEST }],
+      raids: [
+        { regionId: 1, gymId: 1 },
+        { regionId: 1, gymId: 2 },
+        { regionId: 2, gymId: 1 },
+        { regionId: 1, gymId: 99 },
+      ],
+    });
+    // Gym 1 (latitude 40.05) falls out; gym 2 stays in; the raid of another region does not
+    // count, nor one at a gym that is gone.
+    expect(made.raidsOutside).toBe(1);
+  });
+});
diff --git a/src/domain/regions/region-import.ts b/src/domain/regions/region-import.ts
new file mode 100644
index 0000000000000000000000000000000000000000..bd476ed6e54f4f5d0a22172e1500cd8daa7df447
--- /dev/null
+++ b/src/domain/regions/region-import.ts
@@ -0,0 +1,426 @@
+import type { KmlArea } from '../geo/kml.js';
+import type { LatLon } from '../geo/lat-lon.js';
+import { distance } from 'fastest-levenshtein';
+import { containment } from '../geo/region-membership.js';
+
+/** How long Discord lets the name of a channel or a category be. */
+export const MAX_CHANNEL_NAME = 100;
+
+/**
+ * The channel name the name of an area stands for, by the legacy bot's rule, so that old files
+ * keep working: lower case, white space to hyphens, everything but letters, digits, `_` and `-`
+ * removed (a leading `#` goes with that). Letters and digits of any script stay: Discord's
+ * channel names may have them. Beyond the legacy rule, runs of hyphens become one and hyphens
+ * at the ends go ("Mt. Lebanon / Dormont" is `mt-lebanon-dormont`), so that the name is one a
+ * channel can be created with. Empty when nothing of the name is left.
+ */
+export function channelNameFor(areaName: string): string {
+  const name = areaName
+    .normalize('NFC')
+    .toLowerCase()
+    .replace(/\s/gu, '-')
+    .replace(/[^\p{L}\p{N}_-]/gu, '')
+    .replace(/-{2,}/gu, '-')
+    .replace(/^-|-$/gu, '');
+  return [...name].slice(0, MAX_CHANNEL_NAME).join('').replace(/-$/u, '');
+}
+
+/**
+ * By what the name of an area and the name of a channel are compared: `channelNameFor` of
+ * either. So a channel whose name has more than the rule keeps (an emoji in front) is still
+ * found by the name without it, and the name of a channel always stands for that channel.
+ */
+export function channelKey(name: string): string {
+  return channelNameFor(name);
+}
+
+/**
+ * The category a new channel for an area goes into: the area's description, or else its name
+ * without a leading `#` (the legacy rule), cut to what Discord takes. Null when neither says
+ * anything.
+ */
+export function categoryNameFor(area: Pick<KmlArea, 'name' | 'description'>): string | null {
+  const wanted = (area.description ?? area.name.trim().replace(/^#/u, '')).trim();
+  const name = [...wanted].slice(0, MAX_CHANNEL_NAME).join('').trim();
+  return name === '' ? null : name;
+}
+
+/** How many channels (forums included) Discord lets a category hold. */
+export const MAX_CATEGORY_CHANNELS = 50;
+/** How far the name of a new channel may be from another name to be asked about. */
+const NEAR_MISS = 2;
+
+/** By what two category names are the same: without case. */
+const categoryKey = (name: string): string => name.normalize('NFC').toLowerCase();
+
+/** A channel of the server as the plan needs it. `other`: voice, announcements, a stage. */
+export interface ServerChannel {
+  id: string;
+  name: string;
+  kind: 'text' | 'category' | 'forum' | 'other';
+  /** The category it is in. */
+  categoryId: string | null;
+}
+
+/** A region as the plan needs it. */
+export interface PlannedRegion {
+  id: number;
+  guildId: number | null;
+  channelId: string;
+  forumChannelId: string | null;
+  bounds: readonly LatLon[] | null;
+}
+
+export interface ImportInput {
+  areas: readonly KmlArea[];
+  /** Every channel of the server, in the order the oldest of a name should win. */
+  channels: readonly ServerChannel[];
+  /** Every region, of any server: one of another server on a channel here is not touched. */
+  regions: readonly PlannedRegion[];
+  /** The row of the server (`Guild.id`). */
+  guildId: number;
+  gyms: readonly { id: number; lat: number; lon: number }[];
+  /** The active raids: the region each is in and its gym. */
+  raids: readonly { regionId: number | null; gymId: number | null }[];
+  /** Whether the bot may create channels in the server. */
+  mayCreate: boolean;
+  /** `/region import` with a channel: the one channel that gets an outline. Nothing is created. */
+  target?: { id: string; name: string };
+}
+
+/** The category of a channel that is to be created: one that exists, or one to create. */
+export type PlannedCategory = { id: string; name: string } | { create: string } | null;
+
+/** Where an area goes: a channel that exists, or one to create. */
+export type PlannedChannel = { id: string } | { create: { category: PlannedCategory } };
+
+/** An area that would be imported. */
+export interface PlannedImport {
+  /** The name of the area in the file. */
+  name: string;
+  /** The channel name it stands for (for a given channel: that channel's name). */
+  channelName: string;
+  channel: PlannedChannel;
+  outline: LatLon[];
+  /** The region of the channel whose outline is replaced; null for a new region. */
+  regionId: number | null;
+  /** Whether that region has a forum. */
+  hasForum: boolean;
+  /** How many gyms lie in the outline. */
+  gyms: number;
+  /** How many lie in the outline it replaces; null for a new region or one without an outline. */
+  gymsBefore: number | null;
+  /** How many gyms of the replaced outline would lie in no region of this server any more. */
+  stranded: number;
+  /** Whether the area had holes, which are ignored. */
+  holes: boolean;
+  /** Whether the outline is exactly the one the region has now. */
+  unchanged: boolean;
+  /**
+   * For a channel that would be created: the name of a text channel of the server, or of the
+   * channel of another area of the file, that is within two letters of its name. A typo in the
+   * file would make a second channel; this is what it may have meant.
+   */
+  nearMiss?: string;
+}
+
+/**
+ * Why an area is left out. `no-name`: its name gives no channel name; `several-channels`:
+ * several text channels have that name; `several-areas`: several areas of the file stand for
+ * one channel; `not-text`: the name is that of a channel that is no ordinary text channel;
+ * `foreign`: the channel is the region of another server; `cannot-create`: no channel has the
+ * name and the bot may not create one; `other-channel`: the import is for one channel, and this
+ * area stands for another.
+ */
+export type LeftOutReason =
+  | 'no-name'
+  | 'several-channels'
+  | 'several-areas'
+  | 'not-text'
+  | 'foreign'
+  | 'cannot-create'
+  | 'other-channel';
+
+export interface LeftOut {
+  name: string;
+  channelName: string;
+  reason: LeftOutReason;
+}
+
+export interface ImportPlan {
+  imports: PlannedImport[];
+  leftOut: LeftOut[];
+  /** The names of the channels that would be created, in the order of the file. */
+  newChannels: string[];
+  /** The names of the categories that would be created, each once. */
+  newCategories: string[];
+  /** How many gyms lie in a region of this server now and would lie in none afterwards. */
+  stranded: number;
+  /** How many active raids of a changed region are at a gym that would lie outside it. */
+  raidsOutside: number;
+  /** How many forums would be made: one for every region written that has none. */
+  newForums: number;
+  /**
+   * The categories that would hold more channels than Discord allows
+   * (`MAX_CATEGORY_CHANNELS`, forums included), with how many: what they have, the channels
+   * that would be created in them, and the forums of the regions whose channel is in them.
+   */
+  crowded: { name: string; channels: number }[];
+  /**
+   * With a `target`: none of several areas stands for the channel, or several do. Nothing
+   * is imported then.
+   */
+  problem?: 'none-for-channel' | 'several-for-channel';
+}
+
+/** Whether two outlines are the very same ring. */
+function sameRing(a: readonly LatLon[] | null, b: readonly LatLon[]): boolean {
+  return (
+    a !== null &&
+    a.length === b.length &&
+    a.every((point, i) => point.lat === b[i]?.lat && point.lon === b[i]?.lon)
+  );
+}
+
+/** An area with the channel it goes to, before the counts. */
+interface Placed {
+  area: KmlArea;
+  channelName: string;
+  channel: PlannedChannel;
+}
+
+/**
+ * What an import of these areas into this server would do, without doing any of it: which
+ * area becomes the outline of which channel, which channels and categories would be created
+ * for the names no channel has, what is left out and why, and what the new outlines mean for
+ * the gyms. Pure: the caller gives the server's channels, the regions, the gyms and the raids
+ * as they are now, and shows or carries out what comes back.
+ *
+ * An area goes to the text channel whose name its name stands for (`channelKey` of both). Two
+ * such channels, two areas for one channel, a namesake that is no text channel: left out.
+ * No channel of the name: one is planned, in the category `categoryNameFor` names (one that
+ * exists, without case, or a new one, which areas of one category share), unless the bot may
+ * not create channels. With `target` the file is for that one channel: its only area, or the
+ * one area whose name stands for the channel; nothing is created.
+ */
+export function planImport(input: ImportInput): ImportPlan {
+  const { areas, channels, regions, guildId, gyms, raids, target } = input;
+  const leftOut: LeftOut[] = [];
+  const placed: Placed[] = [];
+  let problem: ImportPlan['problem'];
+
+  if (target) {
+    const named = areas.filter((area) => channelKey(area.name) === channelKey(target.name));
+    const [only] = areas.length === 1 ? areas : named;
+    if (areas.length !== 1 && named.length !== 1) {
+      problem = named.length === 0 ? 'none-for-channel' : 'several-for-channel';
+    } else if (only) {
+      placed.push({ area: only, channelName: target.name, channel: { id: target.id } });
+      for (const area of areas) {
+        if (area === only) continue;
+        leftOut.push({
+          name: area.name,
+          channelName: channelNameFor(area.name),
+          reason: 'other-channel',
+        });
+      }
+    }
+  } else {
+    const byKey = new Map<string, ServerChannel[]>();
+    for (const channel of channels) {
+      if (channel.kind === 'category') continue;
+      const key = channelKey(channel.name);
+      byKey.set(key, [...(byKey.get(key) ?? []), channel]);
+    }
+    const categories = channels.filter((channel) => channel.kind === 'category');
+    const areasOf = new Map<string, number>();
+    for (const area of areas) {
+      const key = channelNameFor(area.name);
+      areasOf.set(key, (areasOf.get(key) ?? 0) + 1);
+    }
+    /** The categories that would be created, by key: areas of one category share it. */
+    const planned = new Map<string, string>();
+    for (const area of areas) {
+      const channelName = channelNameFor(area.name);
+      const leave = (reason: LeftOutReason): void => {
+        leftOut.push({ name: area.name, channelName, reason });
+      };
+      if (channelName === '') {
+        leave('no-name');
+        continue;
+      }
+      if ((areasOf.get(channelName) ?? 0) > 1) {
+        leave('several-areas');
+        continue;
+      }
+      const namesakes = byKey.get(channelName) ?? [];
+      const texts = namesakes.filter((channel) => channel.kind === 'text');
+      const [channel] = texts;
+      if (texts.length > 1) {
+        leave('several-channels');
+      } else if (channel) {
+        placed.push({ area, channelName: channel.name, channel: { id: channel.id } });
+      } else if (namesakes.length > 0) {
+        leave('not-text');
+      } else if (!input.mayCreate) {
+        leave('cannot-create');
+      } else {
+        const wanted = categoryNameFor(area);
+        let category: PlannedCategory = null;
+        if (wanted !== null) {
+          const key = categoryKey(wanted);
+          const existing = categories.find((candidate) => categoryKey(candidate.name) === key);
+          if (existing) {
+            category = { id: existing.id, name: existing.name };
+          } else {
+            if (!planned.has(key)) planned.set(key, wanted);
+            category = { create: planned.get(key) ?? wanted };
+          }
+        }
+        placed.push({ area, channelName, channel: { create: { category } } });
+      }
+    }
+  }
+
+  // The regions of this server as they are, and which of them get another outline.
+  const own = regions.filter((region) => region.guildId === guildId);
+  const imports: PlannedImport[] = [];
+  const accepted: { placed: Placed; region: PlannedRegion | undefined }[] = [];
+  for (const one of placed) {
+    const channelId = 'id' in one.channel ? one.channel.id : undefined;
+    const region =
+      channelId === undefined ? undefined : regions.find((row) => row.channelId === channelId);
+    if (region && region.guildId !== guildId) {
+      leftOut.push({ name: one.area.name, channelName: one.channelName, reason: 'foreign' });
+      continue;
+    }
+    accepted.push({ placed: one, region });
+  }
+  // Every outline is tested through its box first: outlines may have thousands of corners.
+  const tests = new Map<readonly LatLon[], (point: LatLon) => boolean>();
+  const contains = (outline: readonly LatLon[], point: LatLon): boolean => {
+    let test = tests.get(outline);
+    if (!test) {
+      test = containment(outline);
+      tests.set(outline, test);
+    }
+    return test(point);
+  };
+  const replaced = new Map<number, readonly LatLon[]>();
+  for (const { placed: one, region } of accepted) {
+    if (region) replaced.set(region.id, one.area.outline);
+  }
+  const outlinesAfter: (readonly LatLon[])[] = [
+    ...own.flatMap((region) => {
+      const bounds = replaced.get(region.id) ?? region.bounds;
+      return bounds ? [bounds] : [];
+    }),
+    ...accepted.filter(({ region }) => !region).map(({ placed: one }) => one.area.outline),
+  ];
+  const keptAfter = (gym: LatLon): boolean =>
+    outlinesAfter.some((outline) => contains(outline, gym));
+  const within = (outline: readonly LatLon[]) => gyms.filter((gym) => contains(outline, gym));
+
+  // The names a new channel may have been meant as: the server's text channels, and the
+  // channels of the other areas.
+  const known = [
+    ...channels.filter((channel) => channel.kind === 'text').map((channel) => channel.name),
+    ...accepted.map(({ placed: one }) => one.channelName),
+  ];
+  const nearMissOf = (name: string): string | undefined => {
+    let best: { name: string; away: number } | undefined;
+    for (const other of known) {
+      if (channelKey(other) === channelKey(name)) continue;
+      const away = distance(channelKey(other), channelKey(name));
+      if (away <= NEAR_MISS && (!best || away < best.away)) best = { name: other, away };
+    }
+    return best?.name;
+  };
+
+  for (const { placed: one, region } of accepted) {
+    const before = region?.bounds ? within(region.bounds) : undefined;
+    const nearMiss = 'create' in one.channel ? nearMissOf(one.channelName) : undefined;
+    imports.push({
+      name: one.area.name,
+      channelName: one.channelName,
+      channel: one.channel,
+      outline: one.area.outline,
+      regionId: region?.id ?? null,
+      hasForum: (region?.forumChannelId ?? null) !== null,
+      gyms: within(one.area.outline).length,
+      gymsBefore: before ? before.length : null,
+      stranded: before ? before.filter((gym) => !keptAfter(gym)).length : 0,
+      holes: one.area.holes,
+      unchanged: sameRing(region?.bounds ?? null, one.area.outline),
+      ...(nearMiss === undefined ? {} : { nearMiss }),
+    });
+  }
+
+  const inServerNow = (gym: LatLon): boolean =>
+    own.some((region) => region.bounds !== null && contains(region.bounds, gym));
+  const gymById = new Map(gyms.map((gym) => [gym.id, gym]));
+  const raidsOutside = raids.filter((raid) => {
+    const outline = raid.regionId === null ? undefined : replaced.get(raid.regionId);
+    const gym = raid.gymId === null ? undefined : gymById.get(raid.gymId);
+    return outline !== undefined && gym !== undefined && !contains(outline, gym);
+  }).length;
+
+  const creating = imports.flatMap((planned) =>
+    'create' in planned.channel ? [{ name: planned.channelName, ...planned.channel.create }] : [],
+  );
+  const newCategories = [
+    ...new Set(
+      creating.flatMap(({ category }) =>
+        category && 'create' in category ? [category.create] : [],
+      ),
+    ),
+  ];
+
+  // How full each category would be: what it holds, the channels created in it, and a forum
+  // for every region written without one (a forum goes where the region's channel is).
+  const fill = new Map<string, { name: string; channels: number }>();
+  const add = (key: string, name: string, more: number): void => {
+    const now = fill.get(key) ?? { name, channels: 0 };
+    now.channels += more;
+    fill.set(key, now);
+  };
+  for (const channel of channels) {
+    if (channel.kind === 'category') add(channel.id, channel.name, 0);
+  }
+  for (const channel of channels) {
+    if (channel.kind !== 'category' && channel.categoryId !== null) {
+      add(channel.categoryId, fill.get(channel.categoryId)?.name ?? '', 1);
+    }
+  }
+  for (const planned of imports) {
+    const forum = planned.hasForum ? 0 : 1;
+    if ('create' in planned.channel) {
+      const { category } = planned.channel.create;
+      if (category === null) continue;
+      if ('create' in category) {
+        add(`new:${categoryKey(category.create)}`, category.create, 1 + forum);
+      } else {
+        add(category.id, category.name, 1 + forum);
+      }
+    } else {
+      const { id } = planned.channel;
+      const categoryId = channels.find((channel) => channel.id === id)?.categoryId ?? null;
+      if (categoryId !== null && forum > 0) add(categoryId, fill.get(categoryId)?.name ?? '', 1);
+    }
+  }
+  const crowded = [...fill.values()].filter(
+    (category) => category.channels > MAX_CATEGORY_CHANNELS,
+  );
+
+  return {
+    imports,
+    leftOut,
+    newChannels: creating.map(({ name }) => name),
+    newCategories,
+    stranded: gyms.filter((gym) => inServerNow(gym) && !keptAfter(gym)).length,
+    raidsOutside,
+    newForums: imports.filter((planned) => !planned.hasForum).length,
+    crowded,
+    ...(problem === undefined ? {} : { problem }),
+  };
+}
````

---

### Task 2: Regions: downloading an attachment, the channels of a server, storage

Prototype commit: `b2dffe01d966e3a773ea2b539e4a0fb966b6006e`

Ports and storage of plan 5B.

- AttachmentGateway (attachment-gateway.ts): downloads a file attached
  to a command: https only, Discord's attachment hosts only, no redirect,
  the body read with a hard limit, a time limit; it answers a value or a
  reason, never throws and never logs the address. FakeAttachments for
  tests.
- PartyGateway: the channels of a server with kind and category, whether
  the bot may create channels, creating a category and a text channel
  (a refusal staff can act on is an answer). The fake refuses as Discord
  does (name length, 500 channels, 50 in a category) and deletes a forum
  with its posts.
- RegionRepository: saveOutlines (several channels in one transaction,
  all or none) and remove (the row, with the count of the saved routes
  that go with it); SavedRouteRepository.countInRegion;
  PartyRepository.partyForums (the forums that party rows name), also
  through PartyStore. In-memory twins for all of them.


**Files:**

```
 src/db/repositories/party-repository.db.test.ts       |  25 +++++++++++++++++++
 src/db/repositories/party-repository.ts               |  29 ++++++++++++++++++++++
 src/db/repositories/region-repository.db.test.ts      | 136 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/db/repositories/region-repository.ts              | 105 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/db/repositories/saved-route-repository.db.test.ts |  11 +++++++++
 src/db/repositories/saved-route-repository.ts         |  14 +++++++++++
 src/discord/party-gateway.ts                          | 118 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/attachment-gateway.test.ts               | 183 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/attachment-gateway.ts                    | 126 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/party-store.ts                           |  11 ++++++++-
 test/support/attachments.ts                           |  49 +++++++++++++++++++++++++++++++++++++
 test/support/fake-gateway.test.ts                     | 121 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/fake-gateway.ts                          | 113 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 test/support/parties.ts                               |  28 ++++++++++++++++++++-
 test/support/party-service.ts                         |  83 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 test/support/saved-routes.ts                          |  14 +++++++++++
 16 files changed, 1160 insertions(+), 6 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `Regions: downloading an attachment, the channels of a server, storage`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/src/db/repositories/party-repository.db.test.ts b/src/db/repositories/party-repository.db.test.ts
index ac85228254ce708be4cd74a370608a6f3ecca388..dfd16da8ed0f3c9cb614baedce29efca4724e383 100644
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -545,4 +545,29 @@ describe('PartyRepository', () => {
     await expect(parties.endedPosts([post])).resolves.toEqual([post]);
     await expect(parties.delete(ended.id)).resolves.toBe(true);
   });
+
+  it('lists the forums that parties name, each once per server, ended parties too', async () => {
+    await sql`insert ignore into Guild (id, snowflake) values (2, '412345678901234568')`.execute(
+      db,
+    );
+    const posted = (n: number, forum: string | null, guildId = 1): RaidParty => ({
+      ...testRaid({ id: ID(n), guildId }),
+      forumChannelId: forum,
+      forumPostId: forum === null ? null : String(BigInt(POST) + BigInt(n)),
+    });
+    await expect(parties.partyForums()).resolves.toEqual([]);
+    await parties.insert(posted(1, FORUM));
+    await parties.insert(endParty(posted(2, FORUM)));
+    await parties.insert(endParty(posted(3, '1234567890123456701')));
+    await parties.insert(posted(4, null));
+    await parties.insert(posted(5, FORUM, 2));
+    await expect(parties.partyForums()).resolves.toEqual([
+      { forumChannelId: FORUM, guildId: 1 },
+      { forumChannelId: '1234567890123456701', guildId: 1 },
+      { forumChannelId: FORUM, guildId: 2 },
+    ]);
+    // Those of one server, by the index on both columns.
+    await expect(parties.partyForums(2)).resolves.toEqual([{ forumChannelId: FORUM, guildId: 2 }]);
+    await expect(parties.partyForums(3)).resolves.toEqual([]);
+  });
 });
diff --git a/src/db/repositories/party-repository.ts b/src/db/repositories/party-repository.ts
index 4840b84cb485c59c787748e2f5dbb4708a58ec6c..6ac1b130b181c1e23a8e06bae0b0e20cb2023339 100644
--- a/src/db/repositories/party-repository.ts
+++ b/src/db/repositories/party-repository.ts
@@ -34,6 +34,18 @@ export interface PartyStorage {
   listActive(): Promise<PartyList>;
   /** Those of these forum posts that are the post of a party that has ended. */
   endedPosts(forumPostIds: readonly string[]): Promise<string[]>;
+  /**
+   * Every forum that a party, active or ended, has or had its post in, each once per server:
+   * by this a forum is still found when its region is gone. `guildId` (a row id) narrows it to
+   * the parties of one server.
+   */
+  partyForums(guildId?: number): Promise<PartyForum[]>;
+}
+
+/** A forum that parties name, with the server (its row id) of those parties. */
+export interface PartyForum {
+  forumChannelId: string;
+  guildId: number;
 }
 
 const epoch = (value: string | null): number | null => (value === null ? null : Number(value));
@@ -195,6 +207,23 @@ export class PartyRepository implements PartyStorage {
     return rows.map((row) => row.forumPostId).filter((id): id is string => id !== null);
   }
 
+  async partyForums(guildId?: number): Promise<PartyForum[]> {
+    let query = this.db
+      .selectFrom('Party')
+      .select(['forumChannelId', 'guildId'])
+      .where('forumChannelId', 'is not', null);
+    // By the index on (guildId, forumChannelId) of migration 011.
+    if (guildId !== undefined) query = query.where('guildId', '=', guildId);
+    const rows = await query
+      .groupBy(['forumChannelId', 'guildId'])
+      .orderBy('guildId')
+      .orderBy('forumChannelId')
+      .execute();
+    return rows.flatMap(({ forumChannelId, guildId }) =>
+      forumChannelId === null ? [] : [{ forumChannelId, guildId }],
+    );
+  }
+
   /** Removes a party for good. Returns false when there was none. */
   async delete(id: string): Promise<boolean> {
     const result = await this.db.deleteFrom('Party').where('id', '=', id).executeTakeFirst();
diff --git a/src/db/repositories/region-repository.db.test.ts b/src/db/repositories/region-repository.db.test.ts
index bfb58d11de305549490bae5f0aad1110c40e1a16..0ef8e013ad0195882d2b7500b0847aae32bb02c0 100644
--- a/src/db/repositories/region-repository.db.test.ts
+++ b/src/db/repositories/region-repository.db.test.ts
@@ -1,4 +1,4 @@
-import type { Kysely } from 'kysely';
+import { sql, type Kysely } from 'kysely';
 import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
 import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
 import type { LatLon } from '../../domain/geo/lat-lon.js';
@@ -232,4 +232,138 @@ describe('RegionRepository', () => {
       forumChannelId: FORUM,
     });
   });
+
+  describe('saveOutlines', () => {
+    it('gives several channels their outlines: a new region for one, a new outline for another', async () => {
+      const existing = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
+      await regions.setForum(existing.id, FORUM);
+      const saved = await regions.saveOutlines(guildId, [
+        { channelId: DOWNTOWN, ring: NORTH_RING },
+        { channelId: NORTH, ring: DOWNTOWN_RING },
+      ]);
+      expect(saved).toEqual([
+        { channelId: DOWNTOWN, regionId: existing.id, created: false },
+        { channelId: NORTH, regionId: expect.any(Number) as number, created: true },
+      ]);
+      // The replaced outline keeps its row, its forum and its server.
+      await expect(regions.findByChannel(DOWNTOWN)).resolves.toMatchObject({
+        id: existing.id,
+        guildId,
+        bounds: NORTH_RING,
+        forumChannelId: FORUM,
+      });
+      await expect(regions.findByChannel(NORTH)).resolves.toMatchObject({
+        id: saved[1]?.regionId,
+        guildId,
+        bounds: DOWNTOWN_RING,
+        forumChannelId: null,
+      });
+      await expect(regions.saveOutlines(guildId, [])).resolves.toEqual([]);
+    });
+
+    it('writes all or none: a channel of another server fails the whole call', async () => {
+      await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
+      await regions.saveBounds(otherGuildId, OTHER, DOWNTOWN_RING);
+      await expect(
+        regions.saveOutlines(guildId, [
+          { channelId: DOWNTOWN, ring: NORTH_RING },
+          { channelId: NORTH, ring: NORTH_RING },
+          { channelId: OTHER, ring: NORTH_RING },
+        ]),
+      ).rejects.toThrow(/another server/u);
+      await expect(regions.findByChannel(DOWNTOWN)).resolves.toMatchObject({
+        bounds: DOWNTOWN_RING,
+      });
+      await expect(regions.findByChannel(NORTH)).resolves.toBeUndefined();
+      await expect(regions.findByChannel(OTHER)).resolves.toMatchObject({
+        guildId: otherGuildId,
+        bounds: DOWNTOWN_RING,
+      });
+    });
+
+    it('writes none when one outline is no closed ring', async () => {
+      await expect(
+        regions.saveOutlines(guildId, [
+          { channelId: DOWNTOWN, ring: DOWNTOWN_RING },
+          { channelId: NORTH, ring: NORTH_RING.slice(0, -1) },
+        ]),
+      ).rejects.toThrow(/closed ring/u);
+      await expect(regions.listAll()).resolves.toEqual([]);
+    });
+
+    it('keeps an outline of five thousand corners exactly', async () => {
+      const corners = 5_000;
+      const ring = Array.from({ length: corners }, (_unused, i) => {
+        const angle = (2 * Math.PI * i) / corners;
+        return { lat: 40 + 0.2 * Math.sin(angle), lon: -80 + 0.2 * Math.cos(angle) };
+      });
+      const closed = [...ring, ring[0] ?? { lat: 0, lon: 0 }];
+      await regions.saveOutlines(guildId, [{ channelId: DOWNTOWN, ring: closed }]);
+      const read = await regions.findByChannel(DOWNTOWN);
+      expect(read?.bounds).toEqual(closed);
+      // MySQL and the membership in memory agree on it.
+      await expect(regions.channelsContaining({ lat: 40, lon: -80 }, guildId)).resolves.toEqual([
+        DOWNTOWN,
+      ]);
+      await expect(regions.channelsContaining({ lat: 40.3, lon: -80 }, guildId)).resolves.toEqual(
+        [],
+      );
+    });
+  });
+
+  describe('remove', () => {
+    it('removes a region of the server with its saved routes, and frees its parties', async () => {
+      const going = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
+      const staying = await regions.saveBounds(guildId, NORTH, NORTH_RING);
+      await regions.setForum(going.id, FORUM);
+      await regions.setSummaryMessage(going.id, FORUM, SUMMARY);
+      await db.deleteFrom('SavedRoutes').execute();
+      await db.deleteFrom('Party').execute();
+      await db
+        .insertInto('SavedRoutes')
+        .values([
+          { region: going.id, name: 'Loop', gyms: '1,2' },
+          { region: going.id, name: 'Other', gyms: '3' },
+          { region: staying.id, name: 'Stays', gyms: '4' },
+        ])
+        .execute();
+      await sql`
+        insert into Party (id, guildId, type, status, regionId, forumChannelId, mirrorMessages,
+          createdById, state, createdAt, updatedAt)
+        values ('p1', ${guildId}, 'raid', 'ended', ${going.id}, ${FORUM}, '[]', '1', '{}', 1, 1)`.execute(
+        db,
+      );
+
+      // With the forum and the list of active raids of the row as it was locked and deleted.
+      await expect(regions.remove(going.id, guildId)).resolves.toEqual({
+        removed: true,
+        routes: 2,
+        forumChannelId: FORUM,
+        summaryMessageId: SUMMARY,
+      });
+
+      await expect(regions.findById(going.id)).resolves.toBeUndefined();
+      await expect(regions.findById(staying.id)).resolves.toBeDefined();
+      const routes = await db.selectFrom('SavedRoutes').select('name').execute();
+      expect(routes.map((row) => row.name)).toEqual(['Stays']);
+      // The row of the party stays, without its region and with its forum: by that the forum
+      // is still found.
+      const party = await db
+        .selectFrom('Party')
+        .select(['regionId', 'forumChannelId'])
+        .executeTakeFirstOrThrow();
+      expect(party).toEqual({ regionId: null, forumChannelId: FORUM });
+      await db.deleteFrom('Party').execute();
+      await db.deleteFrom('SavedRoutes').execute();
+    });
+
+    it('removes nothing for another server, or for a region that is not there', async () => {
+      const region = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
+      await expect(regions.remove(region.id, otherGuildId)).resolves.toEqual({ removed: false });
+      await expect(regions.remove(region.id + 1000, guildId)).resolves.toEqual({
+        removed: false,
+      });
+      await expect(regions.findById(region.id)).resolves.toBeDefined();
+    });
+  });
 });
diff --git a/src/db/repositories/region-repository.ts b/src/db/repositories/region-repository.ts
index 4c23002f9efa149dace4e01c8aee8cad4b4435e4..f92a804e4e38369bea60aba0b01b21edef725687 100644
--- a/src/db/repositories/region-repository.ts
+++ b/src/db/repositories/region-repository.ts
@@ -19,6 +19,39 @@ export interface Region {
   summaryMessageId: string | null;
 }
 
+/** A channel and the outline it gets: a closed ring. */
+export interface RegionOutline {
+  channelId: string;
+  ring: readonly LatLon[];
+}
+
+/** What a channel is after its outline was written: its region, and whether that is new. */
+export interface SavedOutline {
+  channelId: string;
+  regionId: number;
+  created: boolean;
+}
+
+/**
+ * What came of removing a region: nothing, or the region is gone with the saved routes of
+ * members that went with it, and its forum and list of active raids as its row had them when it
+ * was locked and deleted (what to delete or keep on Discord).
+ */
+export type RemovedRegion =
+  | { removed: false }
+  | {
+      removed: true;
+      routes: number;
+      forumChannelId: string | null;
+      summaryMessageId: string | null;
+    };
+
+/** What region administration writes; lets tests keep the regions in memory. */
+export interface RegionAdminStorage {
+  saveOutlines(guildId: number, outlines: readonly RegionOutline[]): Promise<SavedOutline[]>;
+  remove(id: number, guildId: number): Promise<RemovedRegion>;
+}
+
 interface RegionRow {
   id: number;
   guildId: number | null;
@@ -62,7 +95,7 @@ function isDuplicateEntry(error: unknown): boolean {
 }
 
 /** The Region table. All spatial SQL for regions lives here. */
-export class RegionRepository {
+export class RegionRepository implements RegionAdminStorage {
   constructor(private readonly db: Kysely<DB>) {}
 
   async findByChannel(channelId: string): Promise<Region | undefined> {
@@ -195,6 +228,76 @@ export class RegionRepository {
     return saved;
   }
 
+  /**
+   * Gives several channels of one server their outlines, all or none (`/region import`): a
+   * channel that is a region of that server gets the new outline, a channel that is none
+   * becomes a region. A channel that is the region of another server (or of none) fails the
+   * whole call: nothing is written then. Every ring must be closed. Answers what each channel
+   * is now, in the order given.
+   */
+  async saveOutlines(guildId: number, outlines: readonly RegionOutline[]): Promise<SavedOutline[]> {
+    return inTransaction(this.db, async (trx) => {
+      const saved: SavedOutline[] = [];
+      for (const { channelId, ring } of outlines) {
+        const bounds = sql<Polygon>`ST_PolygonFromText(${polygonWkt(ring)})`;
+        const existing = await trx
+          .selectFrom('Region')
+          .select(['id', 'guildId'])
+          .where('channelId', '=', snowflakeParam(channelId))
+          .orderBy('id')
+          .forUpdate()
+          .executeTakeFirst();
+        if (existing && existing.guildId !== guildId) {
+          throw new Error(`Region ${existing.id} of channel ${channelId} is another server's`);
+        }
+        if (existing) {
+          await trx.updateTable('Region').set({ bounds }).where('id', '=', existing.id).execute();
+          saved.push({ channelId, regionId: existing.id, created: false });
+        } else {
+          const inserted = await trx
+            .insertInto('Region')
+            .values({ guildId, channelId, bounds })
+            .executeTakeFirstOrThrow();
+          saved.push({ channelId, regionId: Number(inserted.insertId), created: true });
+        }
+      }
+      return saved;
+    });
+  }
+
+  /**
+   * Removes a region of a server (`/region remove`). With its row go the saved routes of that
+   * region, by their foreign key, and the parties that were in it lose their region
+   * (`Party.regionId` becomes null); its channel, its forum and the gyms are not touched.
+   * `removed` is false when the server has no such region: nothing was changed. `routes` is
+   * how many saved routes went with it; the forum and the list of active raids are those of the
+   * row as it was locked, whatever the directory in memory says.
+   */
+  async remove(id: number, guildId: number): Promise<RemovedRegion> {
+    return inTransaction(this.db, async (trx) => {
+      const row = await trx
+        .selectFrom('Region')
+        .select(['id', 'forumChannelId', 'summaryMessageId'])
+        .where('id', '=', id)
+        .where('guildId', '=', guildId)
+        .forUpdate()
+        .executeTakeFirst();
+      if (!row) return { removed: false };
+      const counted = await trx
+        .selectFrom('SavedRoutes')
+        .select((eb) => eb.fn.countAll<string>().as('n'))
+        .where('region', '=', id)
+        .executeTakeFirstOrThrow();
+      await trx.deleteFrom('Region').where('id', '=', id).execute();
+      return {
+        removed: true,
+        routes: Number(counted.n),
+        forumChannelId: row.forumChannelId,
+        summaryMessageId: row.summaryMessageId,
+      };
+    });
+  }
+
   /** Returns false when the channel is not a region. */
   async setDescription(channelId: string, description: string | null): Promise<boolean> {
     const existing = await this.findByChannel(channelId);
diff --git a/src/db/repositories/saved-route-repository.db.test.ts b/src/db/repositories/saved-route-repository.db.test.ts
index 80baa0a261720c417df14e5f033b052d7ca820e5..7af3aaf0d5b8cd778150941c7abc83304e301ab3 100644
--- a/src/db/repositories/saved-route-repository.db.test.ts
+++ b/src/db/repositories/saved-route-repository.db.test.ts
@@ -288,6 +288,17 @@ describe('SavedRouteRepository', () => {
     expect(await routes.list(ALICE, EAST)).toMatchObject([{ name: 'Changed', gyms: [8, 9] }]);
     expect(await routes.list(BOB, WEST)).toMatchObject([{ name: 'Untouched', gyms: [2] }]);
   });
+
+  it('counts the routes of a region, of all members', async () => {
+    expect(await routes.countInRegion(WEST)).toBe(0);
+    await routes.save(ALICE, WEST, 'Loop', [1, 2]);
+    await routes.save(ALICE, WEST, 'Other', [3]);
+    await routes.save(BOB, WEST, 'Loop', [1]);
+    await routes.save(BOB, EAST, 'East', [7]);
+    expect(await routes.countInRegion(WEST)).toBe(3);
+    expect(await routes.countInRegion(EAST)).toBe(1);
+    expect(await routes.countInRegion(99)).toBe(0);
+  });
 });
 
 describe('routeGyms', () => {
diff --git a/src/db/repositories/saved-route-repository.ts b/src/db/repositories/saved-route-repository.ts
index 1cfe30e71688d521a980f785d5542fe8bfa47870..433a6ca0399ebec70cfe51a7109b68bd170d4377 100644
--- a/src/db/repositories/saved-route-repository.ts
+++ b/src/db/repositories/saved-route-repository.ts
@@ -53,6 +53,11 @@ export interface SavedRouteUpkeep {
    * `changed` counts the routes that lost the stop and remain, `removed` those that went.
    */
   removeGym(gymId: number): Promise<{ changed: number; removed: number }>;
+  /**
+   * How many saved routes, of all members, belong to this region: they go with the region when
+   * it is removed (the table's foreign key deletes them).
+   */
+  countInRegion(regionId: number): Promise<number>;
 }
 
 /**
@@ -208,6 +213,15 @@ export class SavedRouteRepository implements SavedRouteStorage, SavedRouteUpkeep
     return rows.filter((row) => routeGyms(row.gyms).includes(gymId)).length;
   }
 
+  async countInRegion(regionId: number): Promise<number> {
+    const counted = await this.db
+      .selectFrom('SavedRoutes')
+      .select((eb) => eb.fn.countAll<string>().as('n'))
+      .where('region', '=', regionId)
+      .executeTakeFirstOrThrow();
+    return Number(counted.n);
+  }
+
   /**
    * The rows that may have the gym are listed without a lock; each of them is then read again
    * by its key with a lock, and decided by what it holds at that moment: a route that a member
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index 973eaf23cda2c981496da71a7e2cb3662578ff6f..c8b1e06caba3457bcda31b0f984ed6fe6d250d96 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -15,6 +15,7 @@ import {
   type AnyThreadChannel,
   type GuildMember,
 } from 'discord.js';
+import type { ServerChannel } from '../domain/regions/region-import.js';
 import { fetchGuildMember } from './member-directory.js';
 
 /** A message this bot sends or edits. Nobody is pinged unless `mention` names them. */
@@ -167,8 +168,47 @@ export interface PartyGateway {
    * From the cache; undefined when the server has none of that name.
    */
   emoji(channelId: string, name: string): string | undefined;
+  /**
+   * Every channel of a server (by its snowflake) with its name, its kind and its category,
+   * oldest first, from the cache (which follows the server with the Guilds intent). Threads
+   * are no channels here. Undefined when the bot is not in that server.
+   */
+  serverChannels(guildId: string): ServerChannel[] | undefined;
+  /**
+   * What kind of channel an id is, from the cache (which follows every channel of the bot's
+   * servers with the Guilds intent); undefined for one the bot does not know (gone, or never
+   * seen). Threads are `other`.
+   */
+  channelKind(channelId: string): ServerChannel['kind'] | undefined;
+  /** Whether the bot may create channels in a server (Manage Channels), from the cache. */
+  mayCreateChannels(guildId: string): boolean;
+  /**
+   * Creates a category in a server (`/region import`, for the channel of a new region). A
+   * refusal for a reason staff can do something about is an answer; anything else is thrown.
+   */
+  createCategory(guildId: string, name: string): Promise<CreatedChannel>;
+  /**
+   * Creates an ordinary text channel in a server, in this category (which gives it its
+   * permissions) or in none. Answers and throws as `createCategory`.
+   */
+  createTextChannel(
+    guildId: string,
+    name: string,
+    categoryId: string | null,
+  ): Promise<CreatedChannel>;
 }
 
+/**
+ * What came of creating a channel: the channel as Discord made it (it may write the name
+ * differently), or why not. `no-permission`: the bot lacks Manage Channels (in the server, or
+ * in the category); `limit`: the server has as many channels as Discord allows (500), or the
+ * category has (50); `bad-name`: Discord does not take the name; `no-server`: the bot is not
+ * in that server, or the category is gone.
+ */
+export type CreatedChannel =
+  | { ok: true; id: string; name: string }
+  | { ok: false; reason: 'no-permission' | 'limit' | 'bad-name' | 'no-server' };
+
 /** What the bot needs in a channel to put a copy of a party's message there. */
 const CAN_POST = [
   PermissionFlagsBits.ViewChannel,
@@ -657,4 +697,82 @@ export class DiscordPartyGateway implements PartyGateway {
     if (!channel || channel.isDMBased()) return undefined;
     return channel.guild.emojis.cache.find((candidate) => candidate.name === name)?.toString();
   }
+
+  serverChannels(guildId: string): ServerChannel[] | undefined {
+    const guild = this.client.guilds.cache.get(guildId);
+    if (!guild) return undefined;
+    return [...guild.channels.cache.values()]
+      .filter((channel) => !channel.isThread())
+      .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0))
+      .map((channel) => ({
+        id: channel.id,
+        name: channel.name,
+        kind: DiscordPartyGateway.kindOf(channel.type),
+        categoryId: channel.type === ChannelType.GuildCategory ? null : channel.parentId,
+      }));
+  }
+
+  channelKind(channelId: string): ServerChannel['kind'] | undefined {
+    const channel = this.client.channels.cache.get(channelId);
+    if (!channel) return undefined;
+    return DiscordPartyGateway.kindOf(channel.type);
+  }
+
+  private static kindOf(type: ChannelType): ServerChannel['kind'] {
+    return type === ChannelType.GuildText
+      ? 'text'
+      : type === ChannelType.GuildCategory
+        ? 'category'
+        : type === ChannelType.GuildForum
+          ? 'forum'
+          : 'other';
+  }
+
+  mayCreateChannels(guildId: string): boolean {
+    const me = this.client.guilds.cache.get(guildId)?.members.me;
+    return me?.permissions.has(PermissionFlagsBits.ManageChannels) ?? false;
+  }
+
+  createCategory(guildId: string, name: string): Promise<CreatedChannel> {
+    return this.createChannel(guildId, name, ChannelType.GuildCategory, null);
+  }
+
+  createTextChannel(
+    guildId: string,
+    name: string,
+    categoryId: string | null,
+  ): Promise<CreatedChannel> {
+    return this.createChannel(guildId, name, ChannelType.GuildText, categoryId);
+  }
+
+  private async createChannel(
+    guildId: string,
+    name: string,
+    type: ChannelType.GuildCategory | ChannelType.GuildText,
+    parent: string | null,
+  ): Promise<CreatedChannel> {
+    const guild = this.client.guilds.cache.get(guildId);
+    if (!guild) return { ok: false, reason: 'no-server' };
+    // A category deleted meanwhile is refused by Discord as a bad form, which reads like a
+    // full one: asked of the cache first.
+    if (parent !== null && guild.channels.cache.get(parent)?.type !== ChannelType.GuildCategory) {
+      return { ok: false, reason: 'no-server' };
+    }
+    try {
+      const made = await guild.channels.create({ name, type, parent, reason: 'For a region' });
+      return { ok: true, id: made.id, name: made.name };
+    } catch (err) {
+      if (isMissingPermission(err)) return { ok: false, reason: 'no-permission' };
+      if (hasCode(err, RESTJSONErrorCodes.MaximumNumberOfGuildChannelsReached)) {
+        return { ok: false, reason: 'limit' };
+      }
+      if (isGone(err)) return { ok: false, reason: 'no-server' };
+      if (isRefusedBody(err)) {
+        // A full category is refused as a bad form, with the parent named as what is wrong.
+        const full = err instanceof DiscordAPIError && /MAX_CHANNELS|parent_id/iu.test(err.message);
+        return { ok: false, reason: full ? 'limit' : 'bad-name' };
+      }
+      throw err;
+    }
+  }
 }
diff --git a/src/services/attachment-gateway.test.ts b/src/services/attachment-gateway.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9efafb0cbde4c9d383336c757f1f505b5a0a5739
--- /dev/null
+++ b/src/services/attachment-gateway.test.ts
@@ -0,0 +1,183 @@
+import { describe, expect, it } from 'vitest';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import {
+  FetchAttachments,
+  type AttachmentFetch,
+  type AttachmentResponse,
+} from './attachment-gateway.js';
+
+const URL_OK = 'https://cdn.discordapp.com/attachments/1/2/regions.kml?ex=abc&is=def&hm=secret';
+const LIMITS = { maxBytes: 10, timeoutMs: 50 };
+
+/** An answer whose body comes in these pieces; `cancelled` counts how often it was given up. */
+function answer(
+  pieces: (Uint8Array | Error)[],
+  more: { status?: number; length?: string } = {},
+): AttachmentResponse & { cancelled: number; read: number } {
+  const left = [...pieces];
+  const response = {
+    status: more.status ?? 200,
+    headers: {
+      get: (name: string) => (name === 'content-length' ? (more.length ?? null) : null),
+    },
+    cancelled: 0,
+    read: 0,
+    body: {
+      getReader: () => ({
+        read: () => {
+          const next = left.shift();
+          if (next instanceof Error) return Promise.reject(next);
+          if (next) response.read += 1;
+          return Promise.resolve(next ? { done: false, value: next } : { done: true });
+        },
+        cancel: () => {
+          response.cancelled += 1;
+          return Promise.resolve();
+        },
+      }),
+    },
+  };
+  return response;
+}
+
+/** A `fetch` that gives this answer and records what it was asked. Nothing leaves the test. */
+function gatewayWith(response: AttachmentResponse | Error | 'hang') {
+  const calls: { url: string; init: Parameters<AttachmentFetch>[1] }[] = [];
+  const fetch: AttachmentFetch = (url, init) => {
+    calls.push({ url, init });
+    if (response instanceof Error) return Promise.reject(response);
+    if (response === 'hang') {
+      return new Promise((_resolve, reject) => {
+        init.signal.addEventListener('abort', () => {
+          reject(new Error('The operation was aborted'));
+        });
+      });
+    }
+    return Promise.resolve(response);
+  };
+  const { log, entries } = createTestLogger();
+  return { gateway: new FetchAttachments({ fetch, log }), calls, entries };
+}
+
+const bytes = (...values: number[]) => new Uint8Array(values);
+
+describe('FetchAttachments', () => {
+  it('downloads an attachment in pieces and gives its bytes', async () => {
+    const { gateway, calls } = gatewayWith(answer([bytes(1, 2, 3), bytes(), bytes(4, 5)]));
+    await expect(gateway.download(URL_OK, LIMITS)).resolves.toEqual({
+      ok: true,
+      bytes: bytes(1, 2, 3, 4, 5),
+    });
+    expect(calls).toHaveLength(1);
+    expect(calls[0]?.url).toBe(URL_OK);
+    expect(calls[0]?.init).toMatchObject({ method: 'GET', redirect: 'manual' });
+  });
+
+  it('accepts Discord’s other attachment host', async () => {
+    const { gateway } = gatewayWith(answer([bytes(1)]));
+    const outcome = await gateway.download(
+      'https://media.discordapp.net/attachments/1/2/regions.kml',
+      LIMITS,
+    );
+    expect(outcome.ok).toBe(true);
+  });
+
+  it.each([
+    ['plain http', 'http://cdn.discordapp.com/attachments/1/2/a.kml'],
+    ['another host', 'https://example.com/attachments/1/2/a.kml'],
+    ['a host that only ends like Discord’s', 'https://evilcdn.discordapp.com.example/a.kml'],
+    ['a subdomain', 'https://x.cdn.discordapp.com/a.kml'],
+    ['a port', 'https://cdn.discordapp.com:8443/a.kml'],
+    ['a user in the address', 'https://user@cdn.discordapp.com/a.kml'],
+    ['a password in the address', 'https://user:pw@cdn.discordapp.com/a.kml'],
+    ['an address inside the machine', 'https://127.0.0.1/a.kml'],
+    ['a file address', 'file:///etc/passwd'],
+    ['no address at all', 'regions.kml'],
+  ])('asks nothing of %s', async (_what, url) => {
+    const { gateway, calls } = gatewayWith(answer([bytes(1)]));
+    await expect(gateway.download(url, LIMITS)).resolves.toEqual({
+      ok: false,
+      reason: 'refused-address',
+    });
+    expect(calls).toEqual([]);
+  });
+
+  it('gives up before reading when the answer says it is too long', async () => {
+    const response = answer([bytes(1)], { length: '11' });
+    const { gateway } = gatewayWith(response);
+    await expect(gateway.download(URL_OK, LIMITS)).resolves.toEqual({
+      ok: false,
+      reason: 'too-large',
+    });
+    expect(response.read).toBe(0);
+    expect(response.cancelled).toBe(1);
+  });
+
+  it('gives up the moment the body passes the limit, whatever its length was said to be', async () => {
+    const response = answer([bytes(1, 2, 3, 4, 5, 6), bytes(7, 8, 9, 10, 11), bytes(12)], {
+      length: '3',
+    });
+    const { gateway } = gatewayWith(response);
+    await expect(gateway.download(URL_OK, LIMITS)).resolves.toEqual({
+      ok: false,
+      reason: 'too-large',
+    });
+    // The third piece was never asked for.
+    expect(response.read).toBe(2);
+    expect(response.cancelled).toBe(1);
+  });
+
+  it('takes a body of exactly the limit', async () => {
+    const { gateway } = gatewayWith(answer([bytes(1, 2, 3, 4, 5), bytes(6, 7, 8, 9, 10)]));
+    const outcome = await gateway.download(URL_OK, LIMITS);
+    expect(outcome.ok && outcome.bytes.byteLength).toBe(10);
+  });
+
+  it('follows no redirect and takes no status but 200', async () => {
+    for (const status of [301, 302, 204, 403, 404, 500]) {
+      const response = answer([bytes(1)], { status });
+      const { gateway, calls } = gatewayWith(response);
+      await expect(gateway.download(URL_OK, LIMITS)).resolves.toEqual({
+        ok: false,
+        reason: 'failed',
+      });
+      expect(calls).toHaveLength(1);
+      expect(response.read).toBe(0);
+    }
+  });
+
+  it('answers a failure for a connection that breaks, before or during the body', async () => {
+    const refused = gatewayWith(new TypeError('fetch failed', { cause: new Error('ECONNRESET') }));
+    await expect(refused.gateway.download(URL_OK, LIMITS)).resolves.toEqual({
+      ok: false,
+      reason: 'failed',
+    });
+    const broken = gatewayWith(answer([bytes(1), new Error('socket hang up')]));
+    await expect(broken.gateway.download(URL_OK, LIMITS)).resolves.toEqual({
+      ok: false,
+      reason: 'failed',
+    });
+    const empty = gatewayWith({ status: 200, headers: { get: () => null }, body: null });
+    await expect(empty.gateway.download(URL_OK, LIMITS)).resolves.toEqual({
+      ok: false,
+      reason: 'failed',
+    });
+  });
+
+  it('gives up after its time', async () => {
+    const { gateway, calls } = gatewayWith('hang');
+    await expect(gateway.download(URL_OK, LIMITS)).resolves.toEqual({
+      ok: false,
+      reason: 'failed',
+    });
+    expect(calls[0]?.init.signal.aborted).toBe(true);
+  });
+
+  it('never logs the address, which carries a signature', async () => {
+    const { gateway, entries } = gatewayWith(answer([], { status: 404 }));
+    await gateway.download(URL_OK, LIMITS);
+    expect(entries).toHaveLength(1);
+    expect(entries[0]).toMatchObject({ host: 'cdn.discordapp.com', reason: 'status 404' });
+    expect(JSON.stringify(entries)).not.toMatch(/secret|hm=|attachments/u);
+  });
+});
diff --git a/src/services/attachment-gateway.ts b/src/services/attachment-gateway.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8036848c58094b97e8a4bb3ddd82073d62857e62
--- /dev/null
+++ b/src/services/attachment-gateway.ts
@@ -0,0 +1,126 @@
+import type { Logger } from '../log.js';
+import { failureReason } from './failure-reason.js';
+
+/** The hosts Discord serves the attachments of interactions from. */
+const ATTACHMENT_HOSTS: ReadonlySet<string> = new Set([
+  'cdn.discordapp.com',
+  'media.discordapp.net',
+]);
+
+/**
+ * What came of downloading an attachment. `refused-address`: not an `https` address of one of
+ * Discord's attachment hosts; nothing was asked. `too-large`: longer than the limit; what came
+ * until then is thrown away. `failed`: anything else (a status that is not 200, a redirect, a
+ * broken connection, the time limit); it was logged.
+ */
+export type Download =
+  | { ok: true; bytes: Uint8Array }
+  | { ok: false; reason: 'refused-address' | 'too-large' | 'failed' };
+
+export interface DownloadLimits {
+  /** The download is given up when it has more bytes than this. */
+  maxBytes: number;
+  /** How long the whole download may take. */
+  timeoutMs: number;
+}
+
+/**
+ * Downloads a file a member attached to a command (`/region import`; Phase 7 will read
+ * screenshots through it). It never throws: a failure is an answer. Tests use
+ * `FakeAttachments` (`test/support/attachments.ts`); nothing in a test touches the network.
+ */
+export interface AttachmentGateway {
+  download(url: string, limits: DownloadLimits): Promise<Download>;
+}
+
+/** What is used of an answer: its status, what it says of its length, and its body in pieces. */
+export interface AttachmentResponse {
+  status: number;
+  headers: { get(name: string): string | null };
+  body: {
+    getReader(): {
+      read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>;
+      cancel(): Promise<void>;
+    };
+  } | null;
+}
+
+export type AttachmentFetch = (
+  url: string,
+  init: { method: 'GET'; redirect: 'manual'; signal: AbortSignal },
+) => Promise<AttachmentResponse>;
+
+/** The address as one an attachment may be downloaded from; undefined for any other. */
+function requestable(address: string): URL | undefined {
+  let url: URL;
+  try {
+    url = new URL(address);
+  } catch {
+    return undefined;
+  }
+  const plain = url.protocol === 'https:' && url.port === '' && url.username === '';
+  return plain && url.password === '' && ATTACHMENT_HOSTS.has(url.hostname) ? url : undefined;
+}
+
+/**
+ * The gateway over `fetch`: `https` only, only Discord's attachment hosts, no redirect followed
+ * (an attachment is served where its address says), the body read piece by piece and given up
+ * the moment it passes the limit, whatever the answer said of its length. The address of an
+ * attachment carries a signature and is never logged; a failure is logged by its host and why.
+ */
+export class FetchAttachments implements AttachmentGateway {
+  constructor(private readonly options: { fetch: AttachmentFetch; log: Logger }) {}
+
+  async download(address: string, limits: DownloadLimits): Promise<Download> {
+    const { fetch, log } = this.options;
+    const url = requestable(address);
+    if (!url) return { ok: false, reason: 'refused-address' };
+    const failed = (why: string): Download => {
+      log.warn({ host: url.hostname, reason: why }, 'could not download an attachment');
+      return { ok: false, reason: 'failed' };
+    };
+    try {
+      const response = await fetch(url.href, {
+        method: 'GET',
+        redirect: 'manual',
+        signal: AbortSignal.timeout(limits.timeoutMs),
+      });
+      const reader = response.body?.getReader();
+      const giveUp = (): void => {
+        void reader?.cancel().catch(() => undefined);
+      };
+      if (response.status !== 200) {
+        giveUp();
+        return failed(`status ${response.status}`);
+      }
+      const declared = Number(response.headers.get('content-length') ?? '');
+      if (Number.isFinite(declared) && declared > limits.maxBytes) {
+        giveUp();
+        return { ok: false, reason: 'too-large' };
+      }
+      if (!reader) return failed('an answer without a body');
+      const pieces: Uint8Array[] = [];
+      let length = 0;
+      for (;;) {
+        const { done, value } = await reader.read();
+        if (done) break;
+        if (!value) continue;
+        length += value.byteLength;
+        if (length > limits.maxBytes) {
+          giveUp();
+          return { ok: false, reason: 'too-large' };
+        }
+        pieces.push(value);
+      }
+      const bytes = new Uint8Array(length);
+      let at = 0;
+      for (const piece of pieces) {
+        bytes.set(piece, at);
+        at += piece.byteLength;
+      }
+      return { ok: true, bytes };
+    } catch (err) {
+      return failed(failureReason(err));
+    }
+  }
+}
diff --git a/src/services/party-store.ts b/src/services/party-store.ts
index ae5255a2c78ba621b4f44db97713ff04f6adec3c..25ed16459f12dcab67af884ea3a187048bb3b706 100644
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -1,4 +1,4 @@
-import type { PartyStorage } from '../db/repositories/party-repository.js';
+import type { PartyForum, PartyStorage } from '../db/repositories/party-repository.js';
 import { isRaid, type Party, type RaidParty } from '../domain/party/party.js';
 import { blocksNewRaid, raidKindOf } from '../domain/party/raid.js';
 import type { RaidKind } from '../domain/time/party-time.js';
@@ -243,6 +243,15 @@ export class PartyStore implements PartyProvider {
     return this.options.storage.endedPosts(forumPostIds);
   }
 
+  /**
+   * Every forum that a party, active or ended, has or had its post in, from the database: by
+   * this a forum is still found when its region is gone. `guildId` (a row id) narrows it to
+   * the parties of one server.
+   */
+  partyForums(guildId?: number): Promise<PartyForum[]> {
+    return this.options.storage.partyForums(guildId);
+  }
+
   /** Resolves once every change and add in flight or waiting has finished (for shutdown). */
   async whenIdle(): Promise<void> {
     await Promise.all([this.locks.whenIdle(), this.gymLocks.whenIdle()]);
diff --git a/test/support/attachments.ts b/test/support/attachments.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9fd16274a63819ad46ad5a054dcf17539278f730
--- /dev/null
+++ b/test/support/attachments.ts
@@ -0,0 +1,49 @@
+import type {
+  AttachmentGateway,
+  Download,
+  DownloadLimits,
+} from '../../src/services/attachment-gateway.js';
+
+/** The address of an attachment of a fake interaction, as Discord would give it. */
+export function attachmentUrl(name: string): string {
+  return `https://cdn.discordapp.com/attachments/1/2/${encodeURIComponent(name)}`;
+}
+
+/**
+ * The attachments of a test, kept in memory: nothing leaves the process. `files` holds what
+ * each address gives (text is given as its UTF-8 bytes); an address it does not know fails,
+ * as does every address while `failing` is set. Like the real one it never throws, never
+ * answers in the same turn of the event loop, and refuses what is longer than the limit.
+ * `asked` records every download with its limits.
+ */
+export class FakeAttachments implements AttachmentGateway {
+  readonly files = new Map<string, Uint8Array | string>();
+  failing = false;
+  readonly asked: { url: string; limits: DownloadLimits }[] = [];
+
+  /** Puts a file under the address of an attachment with this name, and gives the address. */
+  add(name: string, content: Uint8Array | string): string {
+    const url = attachmentUrl(name);
+    this.files.set(url, content);
+    return url;
+  }
+
+  download(url: string, limits: DownloadLimits): Promise<Download> {
+    this.asked.push({ url, limits });
+    return new Promise((resolve) => {
+      setImmediate(() => {
+        const found = this.files.get(url);
+        if (this.failing || found === undefined) {
+          resolve({ ok: false, reason: 'failed' });
+          return;
+        }
+        const bytes = typeof found === 'string' ? new TextEncoder().encode(found) : found;
+        resolve(
+          bytes.byteLength > limits.maxBytes
+            ? { ok: false, reason: 'too-large' }
+            : { ok: true, bytes },
+        );
+      });
+    });
+  }
+}
diff --git a/test/support/fake-gateway.test.ts b/test/support/fake-gateway.test.ts
index 0d36163dded20dc0f813108fdec91331a24ca1ad..e788003278f308c58341c191c6f0e730511cbdd8 100644
--- a/test/support/fake-gateway.test.ts
+++ b/test/support/fake-gateway.test.ts
@@ -181,3 +181,124 @@ describe('FakePartyGateway: a channel in which the bot may not post embeds', ()
     expect(fake.messagesIn(CHANNEL)[0]?.message.embeds).toEqual([embed]);
   });
 });
+
+describe('FakePartyGateway: the channels of a server', () => {
+  const OTHER_GUILD = '412345678901234568';
+
+  it('lists the channels a server was given, and the forums of its own server', () => {
+    const fake = new FakePartyGateway();
+    fake.addForum(WEST_FORUM, [], 'west-meetups');
+    fake.addChannel('c1', 'west');
+    fake.addChannel('k1', 'North', { kind: 'category' });
+    fake.addChannel('c2', 'east', { categoryId: 'k1' });
+    fake.addChannel('x1', 'north', { guildId: OTHER_GUILD });
+    expect(fake.serverChannels(fake.guildId)).toEqual([
+      { id: 'c1', name: 'west', kind: 'text', categoryId: null },
+      { id: 'k1', name: 'North', kind: 'category', categoryId: null },
+      { id: 'c2', name: 'east', kind: 'text', categoryId: 'k1' },
+      { id: WEST_FORUM, name: 'west-meetups', kind: 'forum', categoryId: null },
+    ]);
+    expect(fake.serverChannels(OTHER_GUILD)).toEqual([
+      { id: 'x1', name: 'north', kind: 'text', categoryId: null },
+    ]);
+    expect(fake.serverChannels('999')).toBeUndefined();
+    expect(fake.channelName('c1')).toBe('west');
+    // A channel that somebody deleted is no longer listed.
+    fake.gone.add('c1');
+    expect(fake.serverChannels(fake.guildId)?.map((channel) => channel.id)).not.toContain('c1');
+  });
+
+  it('creates categories and text channels, and writes a text channel’s name as Discord does', async () => {
+    const fake = new FakePartyGateway();
+    const category = await fake.createCategory(fake.guildId, 'North Hills');
+    if (!category.ok) throw new Error('no category');
+    expect(category.name).toBe('North Hills');
+    const channel = await fake.createTextChannel(fake.guildId, 'West End', category.id);
+    expect(channel).toEqual({ ok: true, id: expect.any(String) as string, name: 'west-end' });
+    expect(fake.serverChannels(fake.guildId)).toEqual([
+      { id: category.id, name: 'North Hills', kind: 'category', categoryId: null },
+      {
+        id: channel.ok ? channel.id : '',
+        name: 'west-end',
+        kind: 'text',
+        categoryId: category.id,
+      },
+    ]);
+    expect(fake.createdChannels).toHaveLength(2);
+    expect(fake.calls).toEqual(['createCategory North Hills', 'createTextChannel West End']);
+  });
+
+  it('refuses as Discord does: no permission, a bad name, a full category, a full server', async () => {
+    const fake = new FakePartyGateway();
+    expect(fake.mayCreateChannels(fake.guildId)).toBe(true);
+    fake.noCreating.add(fake.guildId);
+    expect(fake.mayCreateChannels(fake.guildId)).toBe(false);
+    expect(await fake.createTextChannel(fake.guildId, 'a', null)).toEqual({
+      ok: false,
+      reason: 'no-permission',
+    });
+    fake.noCreating.clear();
+    expect(await fake.createTextChannel(fake.guildId, '', null)).toEqual({
+      ok: false,
+      reason: 'bad-name',
+    });
+    expect(await fake.createCategory(fake.guildId, 'x'.repeat(101))).toEqual({
+      ok: false,
+      reason: 'bad-name',
+    });
+    expect((await fake.createCategory(fake.guildId, 'x'.repeat(100))).ok).toBe(true);
+    expect(await fake.createTextChannel(fake.guildId, 'a', 'no-such-category')).toEqual({
+      ok: false,
+      reason: 'no-server',
+    });
+    expect(await fake.createTextChannel('999', 'a', null)).toEqual({
+      ok: false,
+      reason: 'no-server',
+    });
+    fake.addChannel('k1', 'Full', { kind: 'category' });
+    for (let i = 0; i < 50; i++) fake.addChannel(`in${i}`, `in-${i}`, { categoryId: 'k1' });
+    expect(await fake.createTextChannel(fake.guildId, 'one-more', 'k1')).toEqual({
+      ok: false,
+      reason: 'limit',
+    });
+    expect((await fake.createTextChannel(fake.guildId, 'one-more', null)).ok).toBe(true);
+    for (let i = 0; i < 500; i++) fake.addChannel(`many${i}`, `many-${i}`);
+    expect(await fake.createTextChannel(fake.guildId, 'too-many', null)).toEqual({
+      ok: false,
+      reason: 'limit',
+    });
+  });
+
+  it('says what kind of channel an id is, from what it knows', () => {
+    const fake = new FakePartyGateway();
+    fake.addForum(WEST_FORUM);
+    fake.addChannel('c1', 'west');
+    fake.addChannel('k1', 'Town', { kind: 'category' });
+    expect(fake.channelKind(WEST_FORUM)).toBe('forum');
+    expect(fake.channelKind('c1')).toBe('text');
+    expect(fake.channelKind('k1')).toBe('category');
+    expect(fake.channelKind('nothing')).toBeUndefined();
+    fake.gone.add(WEST_FORUM);
+    expect(fake.channelKind(WEST_FORUM)).toBeUndefined();
+    // Looking is not a call to Discord.
+    expect(fake.calls).toEqual([]);
+  });
+
+  it('deletes a forum with its posts, and a channel', async () => {
+    const fake = new FakePartyGateway();
+    fake.addForum(WEST_FORUM);
+    fake.addChannel('c1', 'west');
+    const postId = await fake.createPost(WEST_FORUM, {
+      title: 'A raid',
+      message: { content: 'x' },
+      tagIds: [],
+    });
+    await fake.deleteChannel(WEST_FORUM);
+    await fake.deleteChannel('c1');
+    await fake.deleteChannel('never-there');
+    expect(fake.deletedChannels).toEqual([WEST_FORUM, 'c1']);
+    expect(fake.serverChannels(fake.guildId)).toEqual([]);
+    expect(await fake.postInfo(postId ?? '')).toBeUndefined();
+    expect(await fake.openPosts(WEST_FORUM)).toBeUndefined();
+  });
+});
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index 9859a1f33f8eddd67d877ebe331ba5cd85bc228f..e0d413abcd0819d0840df1eb10ea74e48455bb22 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -1,5 +1,7 @@
 import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
+import type { ServerChannel } from '../../src/domain/regions/region-import.js';
 import type {
+  CreatedChannel,
   MemberAccess,
   NewPost,
   OutgoingMessage,
@@ -56,6 +58,11 @@ type Method = keyof PartyGateway;
  * alone and answers false. `memberAccess` only looks (in discord.js it reads the cache), so it
  * is not listed in `calls`.
  *
+ * A server has the channels a test gives it (`addChannel`) and those created through the
+ * gateway, which refuses as Discord does: without Manage Channels (`noCreating`), a name that
+ * is not 1 to 100 characters, a server with 500 channels, a category with 50. A forum that is
+ * deleted takes its posts along.
+ *
  * Its answers come on `setImmediate`, so a test that needs a fixed time must fake only `Date`
  * (`vi.useFakeTimers({ toFake: ['Date'] })`), never all timers.
  */
@@ -112,6 +119,15 @@ export class FakePartyGateway implements PartyGateway {
   readonly leftServer = new Set<string>();
   /** The server of every channel (the fakes' `FAKE_GUILD_ID`). */
   guildId = '412345678901234567';
+  /** The channels of servers as `serverChannels` lists them (`addChannel`). */
+  readonly channels = new Map<
+    string,
+    { name: string; kind: ServerChannel['kind']; categoryId: string | null; guildId: string }
+  >();
+  /** The servers (by snowflake) in which the bot may not create channels. */
+  readonly noCreating = new Set<string>();
+  /** The ids of the channels and categories that were created, in order. */
+  readonly createdChannels: string[] = [];
   private next = 1;
 
   private id(): string {
@@ -418,7 +434,10 @@ export class FakePartyGateway implements PartyGateway {
 
   deleteChannel(channelId: string) {
     return this.attempt('deleteChannel', channelId, () => {
-      if (this.forums.delete(channelId)) this.deletedChannels.push(channelId);
+      // Its posts go with a forum, for good.
+      for (const post of this.postsIn(channelId)) this.posts.delete(post.id);
+      const known = this.forums.delete(channelId);
+      if (this.channels.delete(channelId) || known) this.deletedChannels.push(channelId);
     });
   }
 
@@ -515,6 +534,98 @@ export class FakePartyGateway implements PartyGateway {
     return this.emojis.get(name);
   }
 
+  /**
+   * Gives a server a channel (`serverChannels`): an ordinary text channel of the fakes' own
+   * server unless told otherwise. Its name is also what `channelName` answers.
+   */
+  addChannel(
+    id: string,
+    name: string,
+    more: { kind?: ServerChannel['kind']; categoryId?: string | null; guildId?: string } = {},
+  ): void {
+    this.channels.set(id, {
+      name,
+      kind: more.kind ?? 'text',
+      categoryId: more.categoryId ?? null,
+      guildId: more.guildId ?? this.guildId,
+    });
+    this.channelNames.set(id, name);
+  }
+
+  /**
+   * The channels of a server: those given with `addChannel` or made with `createCategory` and
+   * `createTextChannel`, in that order, then the forums (those of the fake are in its own
+   * server). Undefined for a server that has none of either and is not the fakes' own.
+   */
+  serverChannels(guildId: string): ServerChannel[] | undefined {
+    const listed: ServerChannel[] = [];
+    for (const [id, channel] of this.channels) {
+      if (channel.guildId !== guildId || this.gone.has(id)) continue;
+      const { name, kind, categoryId } = channel;
+      listed.push({ id, name: this.channelNames.get(id) ?? name, kind, categoryId });
+    }
+    if (guildId === this.guildId) {
+      for (const [id, forum] of this.forums) {
+        if (this.gone.has(id) || this.channels.has(id)) continue;
+        listed.push({ id, name: forum.name, kind: 'forum', categoryId: null });
+      }
+    }
+    return listed.length === 0 && guildId !== this.guildId ? undefined : listed;
+  }
+
+  /** A forum of the fake, a channel given with `addChannel`; none that is gone. */
+  channelKind(channelId: string): ServerChannel['kind'] | undefined {
+    if (this.gone.has(channelId)) return undefined;
+    if (this.forums.has(channelId)) return 'forum';
+    return this.channels.get(channelId)?.kind;
+  }
+
+  mayCreateChannels(guildId: string): boolean {
+    return !this.noCreating.has(guildId);
+  }
+
+  createCategory(guildId: string, name: string): Promise<CreatedChannel> {
+    return this.attempt('createCategory', name, () =>
+      this.createChannel(guildId, name, 'category', null),
+    );
+  }
+
+  createTextChannel(
+    guildId: string,
+    name: string,
+    categoryId: string | null,
+  ): Promise<CreatedChannel> {
+    return this.attempt('createTextChannel', name, () =>
+      this.createChannel(guildId, name, 'text', categoryId),
+    );
+  }
+
+  /** As Discord: Manage Channels, a name of 1 to 100 characters, 500 channels, 50 in a category. */
+  private createChannel(
+    guildId: string,
+    name: string,
+    kind: 'category' | 'text',
+    categoryId: string | null,
+  ): CreatedChannel {
+    const existing = this.serverChannels(guildId);
+    if (existing === undefined) return { ok: false, reason: 'no-server' };
+    if (this.noCreating.has(guildId)) return { ok: false, reason: 'no-permission' };
+    if ([...name].length < 1 || [...name].length > 100) return { ok: false, reason: 'bad-name' };
+    if (categoryId !== null) {
+      const category = existing.find((channel) => channel.id === categoryId);
+      if (category?.kind !== 'category') return { ok: false, reason: 'no-server' };
+      const inside = existing.filter((channel) => channel.categoryId === categoryId).length;
+      if (inside >= 50) return { ok: false, reason: 'limit' };
+    }
+    if (existing.length >= 500) return { ok: false, reason: 'limit' };
+    const id = this.id();
+    // Discord writes the name of a text channel its own way.
+    const written = kind === 'text' ? name.toLowerCase().replace(/\s+/gu, '-') : name;
+    this.addChannel(id, written, { kind, categoryId, guildId });
+    this.createdChannels.push(id);
+    return { ok: true, id, name: written };
+  }
+
   /** Like a real call, the answer never comes in the same turn of the event loop. */
   private attempt<T>(method: Method, id: string, work: () => T, listed = true): Promise<T> {
     return new Promise((resolve, reject) => {
diff --git a/test/support/parties.ts b/test/support/parties.ts
index 78d130db00dfb10233a8da5dd42a9ff6fc494d11..59105d5900823ce4f48938e123d99daafbe80929 100644
--- a/test/support/parties.ts
+++ b/test/support/parties.ts
@@ -1,7 +1,11 @@
 import { isDeepStrictEqual } from 'node:util';
 import { DateTime } from 'luxon';
 import { loadSettings } from '../../src/config/settings.js';
-import type { PartyList, PartyStorage } from '../../src/db/repositories/party-repository.js';
+import type {
+  PartyForum,
+  PartyList,
+  PartyStorage,
+} from '../../src/db/repositories/party-repository.js';
 import { partyFromStored, partyMirrors, partyState } from '../../src/domain/party/party-state.js';
 import { createMeetup, type NewMeetup } from '../../src/domain/party/meetup.js';
 import type {
@@ -249,6 +253,28 @@ export class MemoryPartyStorage implements PartyStorage {
     );
   }
 
+  partyForums(only?: number): Promise<PartyForum[]> {
+    return this.attempt(() => {
+      const seen = new Map<string, PartyForum>();
+      for (const { forumChannelId, guildId } of this.rows.values()) {
+        if (forumChannelId !== null && (only === undefined || guildId === only)) {
+          seen.set(`${guildId}:${forumChannelId}`, { forumChannelId, guildId });
+        }
+      }
+      return [...seen.values()];
+    });
+  }
+
+  /**
+   * What the table's foreign key does when a region's row is deleted: the rows of its parties
+   * lose their region. The parties a store holds in memory are not touched, as in the bot.
+   */
+  dropRegion(regionId: number): void {
+    for (const [id, party] of this.rows) {
+      if (party.regionId === regionId) this.rows.set(id, { ...party, regionId: null });
+    }
+  }
+
   listActive(): Promise<PartyList> {
     return this.attempt(() => ({
       parties: [...this.rows.values()]
diff --git a/test/support/party-service.ts b/test/support/party-service.ts
index 392a0ac3cd40a779e4842ac3eee67b8e0c041c6a..440d6bea5116d0c9c7993ca8648edecdaeeec32c 100644
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -4,7 +4,13 @@ import type {
   AccessGrantStorage,
 } from '../../src/db/repositories/access-grant-repository.js';
 import type { PartyStorage } from '../../src/db/repositories/party-repository.js';
-import type { Region } from '../../src/db/repositories/region-repository.js';
+import type {
+  Region,
+  RegionOutline,
+  RemovedRegion,
+  SavedOutline,
+} from '../../src/db/repositories/region-repository.js';
+import { isClosedRing } from '../../src/domain/geo/lat-lon.js';
 import type { UserSettings } from '../../src/db/repositories/user-repository.js';
 import { AccessService } from '../../src/services/access-service.js';
 import { PartyLines } from '../../src/services/party-lines.js';
@@ -90,6 +96,81 @@ export class TestRegions {
     region.summaryMessageId = messageId;
     return Promise.resolve(true);
   };
+  /** Makes `saveOutlines` and `remove` reject, with nothing changed. */
+  failing: Error | undefined;
+  /**
+   * What goes with a region's row by the foreign keys of the database, when a test has them:
+   * the saved routes of the region, and the region of its parties' rows.
+   */
+  cascade: { routes?: MemorySavedRoutes; parties?: MemoryPartyStorage } = {};
+
+  private answer<T>(work: () => T): Promise<T> {
+    return new Promise((resolve, reject) => {
+      setImmediate(() => {
+        try {
+          if (this.failing) throw this.failing;
+          resolve(work());
+        } catch (err) {
+          reject(err instanceof Error ? err : new Error(String(err)));
+        }
+      });
+    });
+  }
+
+  /**
+   * What `RegionRepository.saveOutlines` does (region-repository.db.test.ts pins it down), on
+   * the rows above: all or none, a new row for a channel that has none, and a channel of
+   * another server fails the call.
+   */
+  saveOutlines = (guildId: number, outlines: readonly RegionOutline[]): Promise<SavedOutline[]> =>
+    this.answer(() => {
+      for (const { channelId, ring } of outlines) {
+        if (!isClosedRing(ring)) throw new Error('A region outline must be a closed ring');
+        const existing = this.rows.find((row) => row.channelId === channelId);
+        if (existing && existing.guildId !== guildId) {
+          throw new Error(`Region ${existing.id} of channel ${channelId} is another server's`);
+        }
+      }
+      return outlines.map(({ channelId, ring }) => {
+        const existing = this.rows.find((row) => row.channelId === channelId);
+        if (existing) {
+          // A new object: what holds the old row keeps the old outline, as with the database.
+          this.rows[this.rows.indexOf(existing)] = { ...existing, bounds: [...ring] };
+          return { channelId, regionId: existing.id, created: false };
+        }
+        const id = Math.max(0, this.lastId, ...this.rows.map((row) => row.id)) + 1;
+        this.lastId = id;
+        this.rows.push({
+          id,
+          guildId,
+          channelId,
+          description: null,
+          bounds: [...ring],
+          forumChannelId: null,
+          summaryMessageId: null,
+        });
+        return { channelId, regionId: id, created: true };
+      });
+    });
+  /** The highest id ever given: the id of a removed region is not given again. */
+  private lastId = 0;
+
+  /** What `RegionRepository.remove` does, on the rows above, with what `cascade` names. */
+  remove = (id: number, guildId: number): Promise<RemovedRegion> =>
+    this.answer(() => {
+      const index = this.rows.findIndex((row) => row.id === id && row.guildId === guildId);
+      const row = this.rows[index];
+      if (!row) return { removed: false as const };
+      this.lastId = Math.max(this.lastId, ...this.rows.map((one) => one.id));
+      this.rows.splice(index, 1);
+      this.cascade.parties?.dropRegion(id);
+      return {
+        removed: true as const,
+        routes: this.cascade.routes?.dropRegion(id) ?? 0,
+        forumChannelId: row.forumChannelId,
+        summaryMessageId: row.summaryMessageId,
+      };
+    });
 }
 
 /**
diff --git a/test/support/saved-routes.ts b/test/support/saved-routes.ts
index 9dc83e92c9c4aeed4102cfd78d844c72795b9429..2c2ff090e771a9d3014b42b5690f16e478332662 100644
--- a/test/support/saved-routes.ts
+++ b/test/support/saved-routes.ts
@@ -95,6 +95,20 @@ export class MemorySavedRoutes implements SavedRouteStorage, SavedRouteUpkeep {
     return this.attempt(() => this.rows.filter((row) => row.gyms.includes(gymId)).length);
   }
 
+  countInRegion(regionId: number): Promise<number> {
+    return this.attempt(() => this.rows.filter((row) => row.regionId === regionId).length);
+  }
+
+  /**
+   * What the table's foreign key does when a region's row is deleted: its routes go. At once,
+   * as part of that deletion; gives how many went.
+   */
+  dropRegion(regionId: number): number {
+    const mine = this.rows.filter((row) => row.regionId === regionId);
+    for (const row of mine) this.rows.splice(this.rows.indexOf(row), 1);
+    return mine.length;
+  }
+
   removeGym(gymId: number): Promise<{ changed: number; removed: number }> {
     return this.attempt(() => {
       let changed = 0;
````

---

### Task 3: Region administration: import, list, export and removal as a service

Prototype commit: `45118494f8917023d2d1bc64a2cc19f4023158f3`

RegionAdminService (ctx.regionAdmin), under the lock gym administration
runs under (AdminLock, shared by both):

- preview: what an import of the areas of a file would do, nothing
  changed.
- import: every channel is looked at again; channels and categories
  that are missing are created; all outlines are written in one
  transaction; the directories are loaded; then every region written
  that has no forum gets one (PartyService.setupForums, which can now be
  asked for some regions only). What cannot be done is answered with its
  reason, and a channel created for nothing is named.
- list: the regions of a server with what is wrong with each, the gyms
  in no region of any server, the forums that parties name and no
  region has.
- exported: the outlines as areas that import again as they are.
- remove: the region is closed to new parties, its parties are ended,
  the row is deleted, the directories are loaded, the list of active
  raids goes, and the forum is deleted or kept.

PartyStore.closeRegion keeps a party from being stored for a region
that is being removed or is gone (its row could never be written again);
PartyService answers such a report, meetup, train or move as it does
where there is no region. sweepPosts also looks after the forums that
party rows name and no region has, so a kept forum is swept as before.


**Files:**

```
 src/app-context.ts                             |   6 ++
 src/app.ts                                     |  24 +++++
 src/services/admin-lock.ts                     |  23 +++++
 src/services/gym-admin-service.ts              |  23 +++--
 src/services/party-service.ts                  | 107 +++++++++++++++++----
 src/services/party-store.regions.test.ts       |  62 ++++++++++++
 src/services/party-store.ts                    |  67 ++++++++++++-
 src/services/region-admin-service.more.test.ts | 202 +++++++++++++++++++++++++++++++++++++++
 src/services/region-admin-service.test.ts      | 701 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/region-admin-service.ts           | 764 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/gym-admin.ts                      |   6 +-
 test/support/region-admin.ts                   |  84 ++++++++++++++++
 test/support/test-context.ts                   |   8 ++
 13 files changed, 2050 insertions(+), 27 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `Region administration: import, list, export and removal as a service`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index 8830690c932ca4146a053756af2603474eb1e5f1..869d013c12be4f530824d7445a78035f7e4b1d7f 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -10,6 +10,7 @@ import type { CommandModule } from './discord/command.js';
 import type { IntentFlags } from './discord/intents.js';
 import type { MemberDirectory } from './discord/member-directory.js';
 import type { Logger } from './log.js';
+import type { AttachmentGateway } from './services/attachment-gateway.js';
 import type { AttendanceService } from './services/attendance-service.js';
 import type { DmSender } from './services/dm-sender.js';
 import type { GameDataProvider } from './services/game-data-service.js';
@@ -21,6 +22,7 @@ import type { PokemonFinder } from './services/pokemon-search-service.js';
 import type { RaidBossProvider } from './services/raid-boss-service.js';
 import type { RaidChangeService } from './services/raid-change-service.js';
 import type { RaidEventProvider } from './services/raid-event-service.js';
+import type { RegionAdminService } from './services/region-admin-service.js';
 import type { RegionProvider } from './services/region-directory.js';
 import type { SelfRoleService } from './services/self-role-service.js';
 import type { SpawnService } from './services/spawn-service.js';
@@ -46,6 +48,10 @@ export interface AppContext {
   readonly gymAdmin: GymAdminService;
   /** The regions: by id, by text channel and by forum. */
   readonly regions: RegionProvider;
+  /** Region administration (`/region`): outlines from a file, the list, the export, removal. */
+  readonly regionAdmin: RegionAdminService;
+  /** The files members attach to a command, downloaded with a limit. */
+  readonly attachments: AttachmentGateway;
   /** The row of a server (`Guild.id`), by which regions and parties say whose they are. */
   readonly guilds: { idFor(snowflake: string): Promise<number | undefined> };
   /** The raids, trains and meetups that have not ended. */
diff --git a/src/app.ts b/src/app.ts
index e63a644b82c70f921ea91e9ecf4fc20682668e67..4c7548861421d21179023113ffd6acc80b9f9ff1 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -38,6 +38,8 @@ import { InteractionRouter } from './discord/router.js';
 import { formReader } from './domain/pogo/wants.js';
 import { createLogger, type Logger } from './log.js';
 import { AccessService } from './services/access-service.js';
+import { AdminLock } from './services/admin-lock.js';
+import { FetchAttachments } from './services/attachment-gateway.js';
 import { AttendanceService } from './services/attendance-service.js';
 import { QueuedDmSender } from './services/dm-sender.js';
 import { GameDataService } from './services/game-data-service.js';
@@ -58,6 +60,7 @@ import { TimedPartyService } from './services/timed-party-service.js';
 import { TrainService } from './services/train-service.js';
 import { UnownWantService } from './services/unown-want-service.js';
 import { RaidEventService } from './services/raid-event-service.js';
+import { RegionAdminService } from './services/region-admin-service.js';
 import { RegionDirectory } from './services/region-directory.js';
 import { SelfRoleService } from './services/self-role-service.js';
 import { SpawnService } from './services/spawn-service.js';
@@ -273,7 +276,10 @@ export async function startApp(
     posts: partyService,
     log,
   });
+  // Gym administration and region administration exclude each other: one lock for both.
+  const adminLock = new AdminLock();
   const gymAdmin = new GymAdminService({
+    lock: adminLock,
     gyms: gymRepository,
     removal: new GymRemovalRepository(db),
     directory: gyms,
@@ -288,6 +294,20 @@ export async function startApp(
     settings: config.settings,
     log,
   });
+  const regionAdmin = new RegionAdminService({
+    lock: adminLock,
+    storage: regionRepository,
+    regions,
+    gyms,
+    store: parties,
+    posts: partyService,
+    routes: savedRoutes,
+    gateway: partyGateway,
+    settings: config.settings,
+    log,
+  });
+  // Files that members attach to a command, downloaded from Discord's own hosts only.
+  const attachments = new FetchAttachments({ fetch: (url, init) => fetch(url, init), log });
   const scheduler = new PartyScheduler({
     store: parties,
     posts: partyService,
@@ -344,6 +364,8 @@ export async function startApp(
     gyms,
     gymAdmin,
     regions,
+    regionAdmin,
+    attachments,
     guilds,
     parties,
     partyService,
@@ -475,6 +497,8 @@ export async function startApp(
       // The line of gyms that wait for their places is forgotten; what is being written finishes.
       { name: 'gym upkeep', timeoutMs: 5_000, run: () => gymUpkeep.stop() },
       { name: 'gym announcements', timeoutMs: 3_000, run: () => gymAdmin.flush() },
+      // A change of gyms or regions that has begun is finished while the database is open.
+      { name: 'gym and region changes', timeoutMs: 5_000, run: () => adminLock.whenIdle() },
       { name: 'train moves', timeoutMs: 5_000, run: () => trains.flush() },
       { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
       { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
diff --git a/src/services/admin-lock.ts b/src/services/admin-lock.ts
new file mode 100644
index 0000000000000000000000000000000000000000..96274613fbe51d3be76df83dbbd892d82b8269a5
--- /dev/null
+++ b/src/services/admin-lock.ts
@@ -0,0 +1,23 @@
+import { KeyedLock } from './keyed-lock.js';
+
+/**
+ * The one lock of the administration of gyms and regions: what runs under it runs alone. Gym
+ * administration decides under it what a server's staff may touch by the regions' rows, and
+ * measures from gym to gym; region administration changes those rows under it. So the two
+ * exclude each other, and neither needs to look out for the other.
+ *
+ * Lock order: this lock, then a gym's (`PartyStore.withGymLock`), then a party's. It is not
+ * re-entrant: work that asks for it again from inside never finishes.
+ */
+export class AdminLock {
+  private readonly lock = new KeyedLock<'admin'>();
+
+  run<T>(work: () => T | Promise<T>): Promise<T> {
+    return this.lock.run('admin', work);
+  }
+
+  /** Resolves once nothing runs or waits under the lock. For shutdown and for tests. */
+  whenIdle(): Promise<void> {
+    return this.lock.whenIdle();
+  }
+}
diff --git a/src/services/gym-admin-service.ts b/src/services/gym-admin-service.ts
index f576b7d8d6d319584f67aa5b75a3bbfaa010703c..bc454eadf536124b135202f6a48700b118d255fb 100644
--- a/src/services/gym-admin-service.ts
+++ b/src/services/gym-admin-service.ts
@@ -17,7 +17,7 @@ import { gymAnnouncement, gymLabel, gymRemovedLine } from '../render/gym-view.js
 import type { Member } from './attendance-service.js';
 import type { GeoGateway } from './geo-gateway.js';
 import type { GymRefresh, GymsInMemory, GymUpkeep } from './gym-upkeep.js';
-import { KeyedLock } from './keyed-lock.js';
+import { AdminLock } from './admin-lock.js';
 import type { PartyStore } from './party-store.js';
 import { gymRegionsInGuild, type RegionProvider } from './region-directory.js';
 import type { TrainService } from './train-service.js';
@@ -132,6 +132,11 @@ export interface GymAdminOptions {
   gateway: Pick<PartyGateway, 'findChannel' | 'sendMessage'>;
   settings: Settings;
   log: Logger;
+  /**
+   * The lock that adding, moving and deleting run under. The bot gives the one it also gives
+   * region administration, so that the two exclude each other; without it, one of its own.
+   */
+  lock?: AdminLock;
 }
 
 /**
@@ -151,7 +156,9 @@ export interface GymAdminOptions {
  *
  * Adding, moving and deleting run one at a time (one lock): the question "is another gym
  * within ten metres" and the bookkeeping of nearest gyms assume that nothing else changes where
- * gyms are meanwhile. Changing texts or the elite flag needs no lock.
+ * gyms are meanwhile. Changing texts or the elite flag needs no lock. The lock is the one
+ * region administration changes regions under (`AdminLock`): what a server's staff may touch
+ * is decided by the regions' rows, which therefore do not change while it is held.
  *
  * A deletion and a raid at the gym exclude each other: the deletion holds the lock a report of
  * that gym takes (`PartyStore.withGymLock`) from its check for a raid until the directory no
@@ -159,10 +166,12 @@ export interface GymAdminOptions {
  * still exists.
  */
 export class GymAdminService {
-  private readonly lock = new KeyedLock<'gyms'>();
+  private readonly lock: AdminLock;
   private readonly announcing = new Set<Promise<unknown>>();
 
-  constructor(private readonly options: GymAdminOptions) {}
+  constructor(private readonly options: GymAdminOptions) {
+    this.lock = options.lock ?? new AdminLock();
+  }
 
   /** Whether address and nearby places are fetched at all (a Google API key is configured). */
   get fetches(): boolean {
@@ -285,7 +294,7 @@ export class GymAdminService {
    */
   add(gym: NewGym, place: StaffPlace, knownNearIds: readonly number[] = []): Promise<AddOutcome> {
     const { gyms, upkeep, directory, log } = this.options;
-    return this.lock.run('gyms', async () => {
+    return this.lock.run(async () => {
       if (!this.mayPlace(gym, place.guildId)) return { kind: 'foreign' };
       const near = this.near(gym);
       if (near.some((found) => !knownNearIds.includes(found.gym.id))) return { kind: 'near', near };
@@ -382,7 +391,7 @@ export class GymAdminService {
   ): Promise<MoveOutcome | undefined> {
     const { gyms, upkeep, directory, log } = this.options;
     const { staffId } = staff;
-    return this.lock.run('gyms', async () => {
+    return this.lock.run(async () => {
       const before = directory.get(id);
       if (!before || !this.mayTouch(id, staff.guildId)) return undefined;
       if (!this.mayPlace(point, staff.guildId)) return { kind: 'foreign' };
@@ -449,7 +458,7 @@ export class GymAdminService {
    */
   delete(id: number, by: Member, place: StaffPlace): Promise<DeleteOutcome> {
     const { directory, removal, store, upkeep, log } = this.options;
-    return this.lock.run('gyms', async () => {
+    return this.lock.run(async () => {
       const removed = await store.withGymLock(id, async () => {
         const gym = directory.get(id);
         if (!gym || !this.mayTouch(id, place.guildId)) return { kind: 'gone' as const };
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index c236423774f48f02385f302b4d7a2d1463d289ff..131307a609764f5163dff09709e8b7babbc19b27 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -57,7 +57,7 @@ import { KeyedLock } from './keyed-lock.js';
 import type { PartyNotifier } from './notify-service.js';
 import { PartyMirrors } from './party-mirrors.js';
 import { settingsOf } from './party-change.js';
-import type { PartyStore } from './party-store.js';
+import { RegionClosedError, type PartyStore } from './party-store.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 import type { RaidEventProvider } from './raid-event-service.js';
 import { gymRegionsInGuild, type RegionProvider } from './region-directory.js';
@@ -533,7 +533,14 @@ export class PartyService {
     // The view does not depend on the stored row, so a renderer that fails stores nothing.
     const rendered = renderRaidPost(this.view({ ...raid, forumChannelId: forumId }));
 
-    const stored = await store.addRaidUnlessTaken(raid, now, () => this.gymExists(gym.id));
+    let stored: Awaited<ReturnType<PartyStore['addRaidUnlessTaken']>>;
+    try {
+      stored = await store.addRaidUnlessTaken(raid, now, () => this.gymExists(gym.id));
+    } catch (err) {
+      // The region was removed while the report was on its way: it is no region any more.
+      if (err instanceof RegionClosedError) return { kind: 'no-region' };
+      throw err;
+    }
     if (!stored.added) {
       if (!stored.existing) return { kind: 'gym-gone' };
       const existingId = stored.existing.id;
@@ -563,7 +570,10 @@ export class PartyService {
     }
 
     // The row exists; from here on a failure must not leave an active raid without a post.
-    const created = await this.createTracked(raid, region, rendered);
+    const created = await this.unlessRegionClosed(region, () =>
+      this.createTracked(raid, region, rendered),
+    );
+    if (created === undefined) return { kind: 'no-region' };
     // Only now: the message links to the post. The reporter is not told of their own report.
     if (created.kind === 'created') this.notifier?.raidReported(created.party, report.reporterId);
     return created;
@@ -622,9 +632,18 @@ export class PartyService {
     const party = noteMember(made.party, request.creatorId, request.creator ?? {});
     // The view does not depend on the stored row, so a renderer that fails stores nothing.
     const rendered = this.rendered({ ...party, forumChannelId: forumId });
-    await store.add(party);
+    try {
+      await store.add(party);
+    } catch (err) {
+      // The region was removed while this was on its way: it is no region any more.
+      if (err instanceof RegionClosedError) return { kind: 'no-region' };
+      throw err;
+    }
     // The row exists; from here on a failure must not leave an active party without a post.
-    const created = await this.createTracked(party, region, rendered);
+    const created = await this.unlessRegionClosed(region, () =>
+      this.createTracked(party, region, rendered),
+    );
+    if (created === undefined) return { kind: 'no-region' };
     // Whoever asked to hear of new trains is told, but for who made this one.
     if (created.kind === 'created' && isTrain(created.party)) {
       this.notifier?.trainCreated(created.party, request.creatorId);
@@ -632,6 +651,30 @@ export class PartyService {
     return created;
   }
 
+  /**
+   * Runs the making of a post; undefined when it failed because the region was closed for its
+   * removal meanwhile (`PartyStore.closeRegion`), which ended the party under it: whoever
+   * made it is told what is true by then, that there is no region (its post was taken back).
+   * What failed is logged all the same.
+   */
+  private async unlessRegionClosed<T>(
+    region: Region,
+    work: () => Promise<T>,
+  ): Promise<T | undefined> {
+    try {
+      return await work();
+    } catch (err) {
+      if (!this.options.store.isRegionClosed(region.id)) throw err;
+      // Mostly the removal ending the party under it; but a failure of its own in that moment
+      // (Discord, the database) must not go unseen.
+      this.options.log.info(
+        { err, region: region.id },
+        'a post was not made: its region is being removed',
+      );
+      return undefined;
+    }
+  }
+
   /** `createPostFor`, remembered while it runs: a report of the same gym waits for it. */
   private async createTracked<P extends Party>(
     party: P,
@@ -707,15 +750,24 @@ export class PartyService {
       gymId: gym.id,
     });
     const rendered = renderRaidPost(this.view({ ...raid, forumChannelId: forumId }));
-    const stored = await store.addRaidUnlessTaken(raid, this.now(), () => this.gymExists(gym.id));
+    let stored: Awaited<ReturnType<PartyStore['addRaidUnlessTaken']>>;
+    try {
+      stored = await store.addRaidUnlessTaken(raid, this.now(), () => this.gymExists(gym.id));
+    } catch (err) {
+      // The region it should move to was removed meanwhile: it has no forum to move into.
+      if (err instanceof RegionClosedError) return { kind: 'no-forum' };
+      throw err;
+    }
     if (!stored.added) {
       return stored.existing ? { kind: 'taken', other: stored.existing } : { kind: 'gym-gone' };
     }
     // Before the old party ends: who was told about it is not told again about the new one.
     this.notifier?.raidMoving(partyId, raid.id);
     // A failure in here ends the new party again and leaves the old one alone.
-    const created = await this.createTracked(raid, region, rendered);
-    if (created.kind !== 'created') return { kind: 'no-forum' };
+    const created = await this.unlessRegionClosed(region, () =>
+      this.createTracked(raid, region, rendered),
+    );
+    if (created?.kind !== 'created') return { kind: 'no-forum' };
     const postId = created.party.forumPostId;
 
     // The word goes into the old post now, while everybody who is in the raid can still see it.
@@ -1246,9 +1298,22 @@ export class PartyService {
   async sweepPosts(): Promise<number> {
     const { gateway, regions, store, log } = this.options;
     let archived = 0;
+    // The forums of the regions, and the forums that party rows name and no region has: one
+    // whose region was removed and that was kept (`/region remove`) is looked after as before.
+    const forums = new Map<string, number | null>();
     for (const region of regions.all()) {
-      const forumId = region.forumChannelId;
-      if (forumId === null) continue;
+      if (region.forumChannelId !== null) forums.set(region.forumChannelId, region.id);
+    }
+    try {
+      for (const { forumChannelId } of await store.partyForums()) {
+        if (!forums.has(forumChannelId)) forums.set(forumChannelId, null);
+      }
+    } catch (err) {
+      log.warn({ err }, 'could not list the forums that parties name');
+    }
+    for (const [forumId, regionId] of forums) {
+      // Only what the bot still knows as a forum: a forum deleted by hand is asked nothing.
+      if (gateway.channelKind(forumId) !== 'forum') continue;
       try {
         const open = (await gateway.openPosts(forumId)) ?? [];
         for (const postId of await store.endedPosts(open)) {
@@ -1257,13 +1322,16 @@ export class PartyService {
           if (await gateway.archivePost(postId)) {
             archived++;
             log.info(
-              { post: postId, region: region.id },
+              { post: postId, region: regionId, forum: forumId },
               'archived the open post of an ended party',
             );
           }
         }
       } catch (err) {
-        log.warn({ err, region: region.id }, 'could not look for open posts of ended parties');
+        log.warn(
+          { err, region: regionId, forum: forumId },
+          'could not look for open posts of ended parties',
+        );
       }
     }
     return archived;
@@ -1684,15 +1752,17 @@ export class PartyService {
    * (created when the region has none, or when the one it had was deleted), the tags, and the
    * pinned summary post. Safe to run again: what is there is left alone. A region that fails is
    * reported as such and does not stop the others. The server's regions are those of its row
-   * (`Region.guildId`), whether or not their channels are still in the channel cache.
+   * (`Region.guildId`), whether or not their channels are still in the channel cache. `only`
+   * names the regions (by row id) to do it for, of that server: what an import made or changed
+   * (`RegionAdminService.import`).
    */
-  setupForums(guildId: string): Promise<ForumSetup[]> {
+  setupForums(guildId: string, only?: readonly number[]): Promise<ForumSetup[]> {
     // One run at a time per server: a second call waits for the first and finds all ready.
     this.setupCounts.set(guildId, (this.setupCounts.get(guildId) ?? 0) + 1);
     const previous = this.setupChains.get(guildId) ?? Promise.resolve();
     const run = previous
       .catch(() => undefined)
-      .then(() => this.runSetup(guildId))
+      .then(() => this.runSetup(guildId, only))
       .finally(() => {
         const left = (this.setupCounts.get(guildId) ?? 1) - 1;
         if (left > 0) {
@@ -1711,12 +1781,15 @@ export class PartyService {
     return this.setupCounts.has(guildId);
   }
 
-  private async runSetup(guildId: string): Promise<ForumSetup[]> {
+  private async runSetup(guildId: string, only?: readonly number[]): Promise<ForumSetup[]> {
     const { regions, guilds } = this.options;
     const row = await guilds.idFor(guildId);
     if (row === undefined) return [];
     const results: ForumSetup[] = [];
-    for (const before of regions.all().filter((region) => region.guildId === row)) {
+    const wanted = regions
+      .all()
+      .filter((region) => region.guildId === row && (only?.includes(region.id) ?? true));
+    for (const before of wanted) {
       try {
         results.push(await this.setupForum(before));
       } catch (err) {
diff --git a/src/services/party-store.regions.test.ts b/src/services/party-store.regions.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8204a5a661564e8cea04c4e7a033c63b38cb6afe
--- /dev/null
+++ b/src/services/party-store.regions.test.ts
@@ -0,0 +1,62 @@
+import { describe, expect, it } from 'vitest';
+import { PARTY_NOW, partyStoreWith, testMeetup, testRaid } from '../../test/support/parties.js';
+import { RegionClosedError } from './party-store.js';
+
+const ID = (n: number): string => `00000000-0000-4000-8000-00000000000${String(n)}`;
+
+describe('PartyStore: a region that is closed to new parties', () => {
+  it('refuses a new party of a closed region, before anything is written', async () => {
+    const { store, storage } = await partyStoreWith();
+    await store.closeRegion(1);
+    await expect(store.add(testRaid({ id: ID(1), regionId: 1 }))).rejects.toThrow(
+      RegionClosedError,
+    );
+    await expect(
+      store.addRaidUnlessTaken(testRaid({ id: ID(2), regionId: 1 }), PARTY_NOW),
+    ).rejects.toThrow(RegionClosedError);
+    expect(storage.writes).toEqual([]);
+    expect(store.active()).toEqual([]);
+    // Another region is as open as ever.
+    await expect(store.add(testMeetup({ id: ID(3), regionId: 2 }))).resolves.toBeDefined();
+  });
+
+  it('lets what was under way finish before it says that the region is closed', async () => {
+    const { store } = await partyStoreWith();
+    const order: string[] = [];
+    const first = store.add(testRaid({ id: ID(1), regionId: 1 })).then(() => order.push('added'));
+    const closing = store.closeRegion(1).then(() => order.push('closed'));
+    // Asked for after the closing: refused, although the first is still on its way.
+    const late = store.add(testRaid({ id: ID(2), regionId: 1, gymId: 2 }));
+    await expect(late).rejects.toThrow(RegionClosedError);
+    await Promise.all([first, closing]);
+    expect(order).toEqual(['added', 'closed']);
+    // What the closer finds now is all there will ever be.
+    expect(store.inRegion(1).map((party) => party.id)).toEqual([ID(1)]);
+  });
+
+  it('does not wait for a party that could not be stored', async () => {
+    const { store, storage } = await partyStoreWith();
+    storage.failing = new Error('connection lost');
+    const failed = store.add(testRaid({ id: ID(1), regionId: 1 }));
+    await store.closeRegion(1);
+    await expect(failed).rejects.toThrow('connection lost');
+    expect(store.inRegion(1)).toEqual([]);
+  });
+
+  it('closes at once when nothing is under way, and opens again', async () => {
+    const { store } = await partyStoreWith();
+    await store.closeRegion(7);
+    store.reopenRegion(7);
+    await expect(store.add(testRaid({ id: ID(1), regionId: 7 }))).resolves.toBeDefined();
+  });
+
+  it('still changes and ends the parties of a closed region', async () => {
+    const { store } = await partyStoreWith([testRaid({ id: ID(1), regionId: 1 })]);
+    await store.closeRegion(1);
+    const ended = await store.update(ID(1), (party) => ({
+      party: { ...party, status: 'ended' as const },
+    }));
+    expect(ended?.written).toBe(true);
+    expect(store.inRegion(1)).toEqual([]);
+  });
+});
diff --git a/src/services/party-store.ts b/src/services/party-store.ts
index 25ed16459f12dcab67af884ea3a187048bb3b706..809bd7ff84de1db61061656c52781739f0f5bb83 100644
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -29,6 +29,14 @@ export interface PartyStoreOptions {
   now?: () => number;
 }
 
+/** Why `add` refused a party: its region is being removed, or is gone (`closeRegion`). */
+export class RegionClosedError extends Error {
+  constructor(readonly regionId: number) {
+    super(`Region ${regionId} takes no new parties`);
+    this.name = 'RegionClosedError';
+  }
+}
+
 /**
  * Told about every stored change: the party as it was (undefined for one that was just added)
  * and as it is stored now, which for a party that ended has the status `ended`.
@@ -45,6 +53,10 @@ export class PartyStore implements PartyProvider {
   private readonly locks = new KeyedLock<string>();
   private readonly gymLocks = new KeyedLock<number>();
   private readonly listeners: PartyListener[] = [];
+  /** The regions that take no new party (`closeRegion`). */
+  private readonly closed = new Set<number>();
+  /** By region: the `add`s that are under way. */
+  private readonly adding = new Map<number, Set<Promise<void>>>();
   private readonly now: () => number;
   private loaded = false;
 
@@ -134,15 +146,66 @@ export class PartyStore implements PartyProvider {
       );
   }
 
-  /** Stores a new party. Rejects when the row cannot be written (its id or post already exists). */
+  /**
+   * Stores a new party. Rejects when the row cannot be written (its id or post already exists),
+   * and with a `RegionClosedError`, before anything is written, for a party of a region that
+   * is closed (`closeRegion`).
+   */
   async add(party: Party): Promise<Party> {
     const parties = this.all;
-    return this.locks.run(party.id, async () => {
+    const { regionId } = party;
+    // Decided now, in the same turn in which it is remembered as under way (below): a region
+    // is either closed before this add, which is then refused, or its closing waits for it.
+    if (regionId !== null && this.closed.has(regionId)) throw new RegionClosedError(regionId);
+    const adding = this.locks.run(party.id, async () => {
       await this.options.storage.insert(party);
       if (party.status === 'active') parties.set(party.id, party);
       this.announce(undefined, party);
       return party;
     });
+    if (regionId !== null) {
+      // Remembered while it runs: whoever closes the region waits for it.
+      const settled = adding.then(
+        () => undefined,
+        () => undefined,
+      );
+      const underWay = this.adding.get(regionId) ?? new Set<Promise<void>>();
+      underWay.add(settled);
+      this.adding.set(regionId, underWay);
+      void settled.then(() => {
+        underWay.delete(settled);
+        if (underWay.size === 0 && this.adding.get(regionId) === underWay) {
+          this.adding.delete(regionId);
+        }
+      });
+    }
+    return adding;
+  }
+
+  /**
+   * Closes a region to new parties, for its removal (`RegionAdminService.remove`): from now on
+   * `add` refuses a party of that region, and the promise resolves once every `add` for it
+   * that was under way has finished. After that the active parties of the region are all there
+   * are, and whoever ends them all can delete the region's row: a party stored with the id of
+   * a region that is gone could never be written again (the row's foreign key). It stays closed
+   * for good unless `reopenRegion` says otherwise, so that whatever held the region across the
+   * removal is refused too.
+   */
+  async closeRegion(regionId: number): Promise<void> {
+    this.closed.add(regionId);
+    while ((this.adding.get(regionId)?.size ?? 0) > 0) {
+      await Promise.all([...(this.adding.get(regionId) ?? [])]);
+    }
+  }
+
+  /** Whether a region takes no new parties (`closeRegion`). */
+  isRegionClosed(regionId: number): boolean {
+    return this.closed.has(regionId);
+  }
+
+  /** Opens a region again whose removal did not happen after all. */
+  reopenRegion(regionId: number): void {
+    this.closed.delete(regionId);
   }
 
   /**
diff --git a/src/services/region-admin-service.more.test.ts b/src/services/region-admin-service.more.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3fca87ae687d63f4af79f988e296bdf1cc6a7925
--- /dev/null
+++ b/src/services/region-admin-service.more.test.ts
@@ -0,0 +1,202 @@
+import { describe, expect, it } from 'vitest';
+import { EAST_FORUM, WEST_FORUM } from '../../test/support/gyms.js';
+import { REPORTER, testRaid } from '../../test/support/parties.js';
+import {
+  kmlArea,
+  REGION_STAFF,
+  regionAdminWith,
+  SOUTH_CHANNEL,
+  SOUTH_RING,
+} from '../../test/support/region-admin.js';
+import { PartyStatus } from '../domain/party/status.js';
+
+type Made = Awaited<ReturnType<typeof regionAdminWith>>;
+
+async function reported(made: Made, gymId: number) {
+  const gym = made.directory.get(gymId);
+  if (!gym) throw new Error(`no gym ${gymId}`);
+  const outcome = await made.service.reportRaid({
+    gym,
+    reporterId: REPORTER,
+    anonymous: false,
+    autoStatus: PartyStatus.Interested,
+    tier: { level: 'T5', shadow: false },
+    boss: null,
+  });
+  if (outcome.kind !== 'created') throw new Error(`not created: ${outcome.kind}`);
+  await made.service.flush();
+  return { party: outcome.party, postId: outcome.party.forumPostId ?? '' };
+}
+
+/** Makes the next `times` loads of the gym directory fail. */
+function failLoads(made: Made, times: number): void {
+  const load = made.directory.load.bind(made.directory);
+  let left = times;
+  made.directory.load = () => {
+    if (left > 0) {
+      left--;
+      return Promise.reject(new Error('connection lost'));
+    }
+    return load();
+  };
+}
+
+describe('RegionAdminService: what review A asked for', () => {
+  it('says in its post that the region is being removed', async () => {
+    const made = await regionAdminWith();
+    const raid = await reported(made, 1);
+    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
+    expect(made.gateway.messagesIn(raid.postId).map((one) => one.message.content)).toContain(
+      'This region is being removed, so this raid was closed.',
+    );
+  });
+
+  it('deletes the forum and the list the row had when it was deleted, not what memory says', async () => {
+    const made = await regionAdminWith();
+    const remove = made.regions.remove;
+    // The row in the database names East's forum (memory had not caught up with a change).
+    made.regions.remove = async (id, guildId) => {
+      const removed = await remove(id, guildId);
+      return removed.removed ? { ...removed, forumChannelId: EAST_FORUM } : removed;
+    };
+    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'delete');
+    expect(outcome).toMatchObject({
+      kind: 'removed',
+      forum: 'deleted',
+      forumChannelId: EAST_FORUM,
+    });
+    expect(made.gateway.deletedChannels).toEqual([EAST_FORUM]);
+  });
+
+  it('answers gone when the row was gone already, after loading the regions again', async () => {
+    const made = await regionAdminWith();
+    made.regions.remove = () => Promise.resolve({ removed: false });
+    let loads = 0;
+    const load = made.directory.load.bind(made.directory);
+    made.directory.load = () => {
+      loads++;
+      return load();
+    };
+    expect(await made.regionAdmin.remove(1, REGION_STAFF, 'delete')).toEqual({ kind: 'gone' });
+    expect(loads).toBe(1);
+    expect(made.gateway.deletedChannels).toEqual([]);
+  });
+
+  it('counts a forum of a server the bot does not know as gone, and deletes nothing', async () => {
+    const made = await regionAdminWith();
+    const outcome = await made.regionAdmin.remove(
+      1,
+      { ...REGION_STAFF, server: '999999999999999999' },
+      'delete',
+    );
+    expect(outcome).toMatchObject({ kind: 'removed', forum: 'gone' });
+    expect(made.gateway.deletedChannels).toEqual([]);
+  });
+
+  it('loads the regions once more when that fails, and says when it failed twice', async () => {
+    const once = await regionAdminWith();
+    failLoads(once, 1);
+    const preview = once.regionAdmin.preview(REGION_STAFF, [kmlArea('South', SOUTH_RING)]);
+    const imported = await once.regionAdmin.import(REGION_STAFF, preview.imports);
+    expect(imported.reloaded).toBe(true);
+    expect(once.directory.isRegion(SOUTH_CHANNEL)).toBe(true);
+
+    const twice = await regionAdminWith();
+    failLoads(twice, 2);
+    const again = twice.regionAdmin.preview(REGION_STAFF, [kmlArea('South', SOUTH_RING)]);
+    expect((await twice.regionAdmin.import(REGION_STAFF, again.imports)).reloaded).toBe(false);
+
+    const removing = await regionAdminWith();
+    failLoads(removing, 2);
+    expect(await removing.regionAdmin.remove(3, REGION_STAFF, 'keep')).toMatchObject({
+      kind: 'removed',
+      reloaded: false,
+    });
+  });
+
+  it('sets up the forums under the lock, so that gym administration waits for them', async () => {
+    const made = await regionAdminWith();
+    // The forum is made only when the test says so.
+    let release: () => void = () => undefined;
+    const held = new Promise<void>((resolve) => {
+      release = resolve;
+    });
+    let asked = false;
+    const createForum = made.gateway.createForum.bind(made.gateway);
+    made.gateway.createForum = async (...args) => {
+      asked = true;
+      await held;
+      return createForum(...args);
+    };
+    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('South', SOUTH_RING)]);
+    const importing = made.regionAdmin.import(REGION_STAFF, preview.imports);
+    const turns = async (n: number) => {
+      for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve));
+    };
+    while (!asked) await turns(1);
+    // The outlines are written; the forum is on its way. A gym added now waits for it.
+    let added = false;
+    const adding = made.admin
+      .add(
+        { name: 'New Gym', lat: 40.015, lon: -80.015 },
+        { staffId: '1', guildId: 1, channelIds: [] },
+      )
+      .then(() => {
+        added = true;
+      });
+    await turns(50);
+    expect(added).toBe(false);
+    release();
+    await Promise.all([importing, adding]);
+    expect(added).toBe(true);
+    expect(made.regions.byChannel(SOUTH_CHANNEL)?.forumChannelId).toEqual(expect.any(String));
+  });
+
+  it('answers a report that races the removal as one in no region', async () => {
+    const made = await regionAdminWith();
+    const gym = made.directory.get(1);
+    if (!gym) throw new Error('no gym 1');
+    const reporting = made.service.reportRaid({
+      gym,
+      reporterId: REPORTER,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: { level: 'T5', shadow: false },
+      boss: null,
+    });
+    const removing = made.regionAdmin.remove(1, REGION_STAFF, 'keep');
+    const [outcome] = await Promise.all([reporting, removing]);
+    expect(outcome.kind).toBe('no-region');
+    expect(made.store.active()).toEqual([]);
+    expect(made.entries.filter((entry) => Number(entry.level) >= 50)).toEqual([]);
+    // Said in the log all the same, with why: a genuine failure in that moment is not lost.
+    expect(
+      made.entries.filter(
+        (entry) => entry.msg === 'a post was not made: its region is being removed',
+      ),
+    ).toMatchObject([{ region: 1, err: { message: expect.any(String) as string } }]);
+  });
+});
+
+describe('PartyService.sweepPosts: forums no region has', () => {
+  it('looks only at forums the gateway still knows as forums', async () => {
+    const made = await regionAdminWith([
+      {
+        ...testRaid(),
+        status: 'ended',
+        forumChannelId: '100000000000000777',
+        forumPostId: '900000000000001111',
+      },
+      {
+        ...testRaid({ id: '00000000-0000-4000-8000-000000000009' }),
+        status: 'ended',
+        forumChannelId: WEST_FORUM,
+        forumPostId: '900000000000001112',
+      },
+    ]);
+    await made.service.sweepPosts();
+    const asked = made.gateway.calls.filter((call) => call.startsWith('openPosts'));
+    expect(asked).toContain(`openPosts ${WEST_FORUM}`);
+    expect(asked).not.toContain('openPosts 100000000000000777');
+  });
+});
diff --git a/src/services/region-admin-service.test.ts b/src/services/region-admin-service.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..29d7e95b96e5f31fc668835d079ddda7f728aae9
--- /dev/null
+++ b/src/services/region-admin-service.test.ts
@@ -0,0 +1,701 @@
+import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { STAFF_PLACE, withOtherServer } from '../../test/support/gym-admin.js';
+import {
+  EAST_CHANNEL,
+  EAST_FORUM,
+  NORTH_CHANNEL,
+  UNBOUNDED_CHANNEL,
+  WEST_CHANNEL,
+  WEST_FORUM,
+} from '../../test/support/gyms.js';
+import { ALICE, REPORTER, testTrain } from '../../test/support/parties.js';
+import {
+  kmlArea,
+  OTHER_REGION_STAFF,
+  REGION_STAFF,
+  regionAdminWith,
+  SOUTH_CHANNEL,
+  SOUTH_RING,
+  squareRing,
+  TOWN_CATEGORY,
+  WEST_HALF_RING,
+  WEST_RING,
+} from '../../test/support/region-admin.js';
+import type { KmlArea } from '../domain/geo/kml.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { RaidReport } from './party-service.js';
+
+type Made = Awaited<ReturnType<typeof regionAdminWith>>;
+
+/** Lets everything that is under way go out. */
+async function settled(made: Made): Promise<void> {
+  await made.attendance.flush();
+  await made.access.flush();
+  await made.service.flush();
+}
+
+const report = (made: Made, gymId: number, more: Partial<RaidReport> = {}): RaidReport => {
+  const gym = made.directory.get(gymId);
+  if (!gym) throw new Error(`no gym ${gymId}`);
+  return {
+    gym,
+    reporterId: REPORTER,
+    anonymous: false,
+    autoStatus: PartyStatus.Interested,
+    tier: { level: 'T5', shadow: false },
+    boss: null,
+    ...more,
+  };
+};
+
+/** Reports a raid and gives it with its post. */
+async function reported(made: Made, gymId: number) {
+  const outcome = await made.service.reportRaid(report(made, gymId));
+  if (outcome.kind !== 'created') throw new Error(`not created: ${outcome.kind}`);
+  await made.service.flush();
+  return { party: outcome.party, postId: outcome.party.forumPostId ?? '' };
+}
+
+/** Previews these areas and imports what the preview would. */
+async function imported(made: Made, areas: KmlArea[]) {
+  const preview = made.regionAdmin.preview(REGION_STAFF, areas);
+  return made.regionAdmin.import(REGION_STAFF, preview.imports);
+}
+
+const regionOf = (made: Made, channelId: string) => made.regions.byChannel(channelId);
+
+function missingPermissions(): DiscordAPIError {
+  const code = RESTJSONErrorCodes.MissingPermissions;
+  return new DiscordAPIError(
+    { code, message: 'Missing Permissions' },
+    code,
+    403,
+    'DELETE',
+    '/x',
+    {},
+  );
+}
+
+describe('RegionAdminService.preview', () => {
+  it('says what an import would do, and changes nothing', async () => {
+    const made = await regionAdminWith();
+    const before = JSON.stringify(made.regions.rows);
+    const preview = made.regionAdmin.preview(REGION_STAFF, [
+      kmlArea('West', WEST_HALF_RING),
+      kmlArea('South', SOUTH_RING, { holes: true }),
+      kmlArea('Brand New', SOUTH_RING, { description: 'town' }),
+    ]);
+    expect(preview.mayCreate).toBe(true);
+    expect(preview.imports).toMatchObject([
+      // West holds gyms 1 to 6, 11 and 12; its western half loses the Bridge, the Mosaic and
+      // the Post Office.
+      { name: 'West', channel: { id: WEST_CHANNEL }, regionId: 1, gyms: 5, gymsBefore: 8 },
+      { name: 'South', channel: { id: SOUTH_CHANNEL }, regionId: null, gyms: 0, holes: true },
+      {
+        name: 'Brand New',
+        channelName: 'brand-new',
+        channel: { create: { category: { id: TOWN_CATEGORY, name: 'Town' } } },
+      },
+    ]);
+    expect(preview.newChannels).toEqual(['brand-new']);
+    expect(preview.stranded).toBe(3);
+    expect(JSON.stringify(made.regions.rows)).toBe(before);
+    expect(made.gateway.calls).toEqual([]);
+  });
+
+  it('plans no creation where the bot may not create channels', async () => {
+    const made = await regionAdminWith();
+    made.gateway.noCreating.add(made.gateway.guildId);
+    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('Brand New', SOUTH_RING)]);
+    expect(preview.mayCreate).toBe(false);
+    expect(preview.imports).toEqual([]);
+    expect(preview.leftOut).toMatchObject([{ name: 'Brand New', reason: 'cannot-create' }]);
+  });
+
+  it('knows a text channel of the server, and nothing else, as what can be a region', async () => {
+    const made = await regionAdminWith();
+    expect(made.regionAdmin.textChannel(REGION_STAFF, SOUTH_CHANNEL)).toEqual({
+      id: SOUTH_CHANNEL,
+      name: 'south',
+    });
+    expect(made.regionAdmin.textChannel(REGION_STAFF, WEST_FORUM)).toBeUndefined();
+    expect(made.regionAdmin.textChannel(REGION_STAFF, TOWN_CATEGORY)).toBeUndefined();
+    expect(made.regionAdmin.textChannel(OTHER_REGION_STAFF, SOUTH_CHANNEL)).toBeUndefined();
+    expect(made.regionAdmin.textChannel(REGION_STAFF, '1')).toBeUndefined();
+  });
+
+  it('does not offer a channel that is another server’s region', async () => {
+    const made = await regionAdminWith();
+    made.regions.rows.push({
+      id: 9,
+      guildId: 2,
+      channelId: SOUTH_CHANNEL,
+      description: null,
+      bounds: null,
+      forumChannelId: null,
+      summaryMessageId: null,
+    });
+    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('South', SOUTH_RING)]);
+    expect(preview.imports).toEqual([]);
+    expect(preview.leftOut).toMatchObject([{ name: 'South', reason: 'foreign' }]);
+  });
+});
+
+describe('RegionAdminService.import', () => {
+  it('gives an existing region its new outline and makes a channel a region, with its forum', async () => {
+    const made = await regionAdminWith();
+    const outcome = await imported(made, [
+      kmlArea('West', WEST_HALF_RING),
+      kmlArea('South', SOUTH_RING),
+    ]);
+    expect(outcome.notImported).toEqual([]);
+    expect(outcome.categoriesCreated).toEqual([]);
+    const south = regionOf(made, SOUTH_CHANNEL);
+    expect(outcome.imported).toEqual([
+      {
+        name: 'West',
+        channelId: WEST_CHANNEL,
+        regionId: 1,
+        newRegion: false,
+        channelCreated: false,
+        gyms: 5,
+        forum: 'had',
+      },
+      {
+        name: 'South',
+        channelId: SOUTH_CHANNEL,
+        regionId: south?.id,
+        newRegion: true,
+        channelCreated: false,
+        gyms: 0,
+        forum: 'created',
+      },
+    ]);
+    // The rows, and both directories: the Bridge (gym 4) lies in no region of West any more.
+    expect(regionOf(made, WEST_CHANNEL)).toMatchObject({ bounds: WEST_HALF_RING, guildId: 1 });
+    expect(south).toMatchObject({ bounds: SOUTH_RING, guildId: 1 });
+    expect(made.directory.regionsOf(1)).toEqual([WEST_CHANNEL]);
+    expect(made.directory.regionsOf(4)).toEqual([]);
+    expect(made.directory.isRegion(SOUTH_CHANNEL)).toBe(true);
+    // The new region has its forum, named after its channel, with the list of active raids.
+    const forumId = south?.forumChannelId ?? '';
+    expect(made.gateway.forums.get(forumId)).toMatchObject({
+      name: `south${made.settings.regionForumSuffix}`,
+      regionChannelId: SOUTH_CHANNEL,
+    });
+    expect(south?.summaryMessageId).not.toBeNull();
+    // West kept its forum: nothing was made for it.
+    expect(regionOf(made, WEST_CHANNEL)?.forumChannelId).toBe(WEST_FORUM);
+  });
+
+  it('notes who imported what in the log, by numbers', async () => {
+    const made = await regionAdminWith();
+    await imported(made, [kmlArea('West', WEST_HALF_RING), kmlArea('South', SOUTH_RING)]);
+    const line = made.entries.find(
+      (entry) => entry.msg === 'the outlines of regions were imported',
+    );
+    expect(line).toMatchObject({
+      staff: REGION_STAFF.staffId,
+      guild: 1,
+      created: 1,
+      replaced: 1,
+      channelsCreated: 0,
+      corners: [4, 4],
+    });
+  });
+
+  it('creates the channel and the category of an area no channel has, and all at once', async () => {
+    const made = await regionAdminWith();
+    const outcome = await imported(made, [
+      kmlArea('Riverside', SOUTH_RING, { description: 'River Towns' }),
+      kmlArea('Hill Top', squareRing(41, -81, 41.1, -80.9), { description: 'river towns' }),
+      kmlArea('Old Town', squareRing(42, -81, 42.1, -80.9), { description: 'TOWN' }),
+    ]);
+    expect(outcome.notImported).toEqual([]);
+    expect(outcome.categoriesCreated).toEqual(['River Towns']);
+    const channels = made.gateway.serverChannels(made.gateway.guildId) ?? [];
+    const category = channels.find((channel) => channel.name === 'River Towns');
+    expect(category?.kind).toBe('category');
+    for (const [name, categoryId] of [
+      ['riverside', category?.id],
+      ['hill-top', category?.id],
+      // A category of that name existed (whatever its case): it is used.
+      ['old-town', TOWN_CATEGORY],
+    ] as const) {
+      const channel = channels.find((one) => one.name === name);
+      expect(channel).toMatchObject({ kind: 'text', categoryId });
+      const region = regionOf(made, channel?.id ?? '');
+      expect(region).toMatchObject({ guildId: 1 });
+      // One command gives channel, outline and forum.
+      expect(made.gateway.forums.get(region?.forumChannelId ?? '')?.name).toBe(
+        `${name}${made.settings.regionForumSuffix}`,
+      );
+    }
+    expect(
+      outcome.imported.map((region) => [region.channelCreated, region.newRegion, region.forum]),
+    ).toEqual([
+      [true, true, 'created'],
+      [true, true, 'created'],
+      [true, true, 'created'],
+    ]);
+    // One category was made, not two.
+    expect(made.gateway.calls.filter((call) => call.startsWith('createCategory'))).toEqual([
+      'createCategory River Towns',
+    ]);
+  });
+
+  it('leaves out an area whose channel was deleted since the preview, and imports the rest', async () => {
+    const made = await regionAdminWith();
+    const preview = made.regionAdmin.preview(REGION_STAFF, [
+      kmlArea('South', SOUTH_RING),
+      kmlArea('West', WEST_HALF_RING),
+    ]);
+    made.gateway.gone.add(SOUTH_CHANNEL);
+    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
+    expect(outcome.notImported).toEqual([
+      { name: 'South', channelName: 'south', reason: 'channel-gone' },
+    ]);
+    expect(outcome.imported.map((region) => region.name)).toEqual(['West']);
+    expect(regionOf(made, SOUTH_CHANNEL)).toBeUndefined();
+  });
+
+  it('takes a channel of the name that was made since the preview, and creates none', async () => {
+    const made = await regionAdminWith();
+    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('Riverside', SOUTH_RING)]);
+    made.gateway.addChannel('c-new', 'riverside');
+    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
+    expect(outcome.imported).toMatchObject([{ channelId: 'c-new', channelCreated: false }]);
+    expect(made.gateway.createdChannels).toEqual([]);
+  });
+
+  it('leaves out what Discord refuses to create, with the reason, and imports the rest', async () => {
+    const made = await regionAdminWith();
+    const preview = made.regionAdmin.preview(REGION_STAFF, [
+      kmlArea('Riverside', SOUTH_RING),
+      kmlArea('West', WEST_HALF_RING),
+    ]);
+    made.gateway.noCreating.add(made.gateway.guildId);
+    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
+    expect(outcome.notImported).toEqual([
+      { name: 'Riverside', channelName: 'riverside', reason: 'no-permission' },
+    ]);
+    expect(outcome.imported.map((region) => region.name)).toEqual(['West']);
+    expect(regionOf(made, WEST_CHANNEL)?.bounds).toEqual(WEST_HALF_RING);
+  });
+
+  it('answers a failure for a creation that throws, and goes on', async () => {
+    const made = await regionAdminWith();
+    const preview = made.regionAdmin.preview(REGION_STAFF, [
+      kmlArea('Riverside', SOUTH_RING),
+      kmlArea('West', WEST_HALF_RING),
+    ]);
+    made.gateway.failing.set('createTextChannel', new Error('Discord is down'));
+    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
+    expect(outcome.notImported).toMatchObject([{ name: 'Riverside', reason: 'failed' }]);
+    expect(outcome.imported.map((region) => region.name)).toEqual(['West']);
+  });
+
+  it('writes all outlines or none, and names the channels it had created for nothing', async () => {
+    const made = await regionAdminWith();
+    const preview = made.regionAdmin.preview(REGION_STAFF, [
+      kmlArea('West', WEST_HALF_RING),
+      kmlArea('Riverside', SOUTH_RING),
+    ]);
+    made.regions.failing = new Error('connection lost');
+    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
+    made.regions.failing = undefined;
+    const [createdId] = made.gateway.createdChannels.slice(-1);
+    expect(outcome.imported).toEqual([]);
+    expect(outcome.notImported).toEqual([
+      { name: 'West', channelName: 'west', reason: 'not-written' },
+      {
+        name: 'Riverside',
+        channelName: 'riverside',
+        reason: 'not-written',
+        createdChannelId: createdId,
+      },
+    ]);
+    // Nothing is a region that was none, and West is as it was.
+    expect(regionOf(made, WEST_CHANNEL)?.bounds).toEqual(WEST_RING);
+    expect(regionOf(made, createdId ?? '')).toBeUndefined();
+    expect(made.gateway.forums.size).toBe(2);
+  });
+
+  it('imports a region although its forum cannot be made, and says why it has none', async () => {
+    const made = await regionAdminWith();
+    made.gateway.failing.set('createForum', missingPermissions());
+    const outcome = await imported(made, [kmlArea('South', SOUTH_RING)]);
+    expect(outcome.imported).toMatchObject([
+      {
+        name: 'South',
+        forum: 'none',
+        forumReason: expect.stringContaining('Manage Channels') as string,
+      },
+    ]);
+    expect(regionOf(made, SOUTH_CHANNEL)).toMatchObject({
+      bounds: SOUTH_RING,
+      forumChannelId: null,
+    });
+  });
+
+  it('leaves a raid in its post when the outline changes under it', async () => {
+    const made = await regionAdminWith();
+    // The Bridge (gym 4) falls out of West.
+    const raid = await reported(made, 4);
+    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('West', WEST_HALF_RING)]);
+    expect(preview.raidsOutside).toBe(1);
+    await made.regionAdmin.import(REGION_STAFF, preview.imports);
+    await settled(made);
+    expect(made.store.get(raid.party.id)).toMatchObject({ regionId: 1, forumPostId: raid.postId });
+    expect(made.gateway.posts.get(raid.postId)?.archived).toBe(false);
+  });
+
+  it('runs under the lock of gym administration', async () => {
+    const made = await regionAdminWith();
+    const order: string[] = [];
+    // A gym is being added at a place that the import takes out of West.
+    const place = { lat: 40.05, lon: -80.02 };
+    const adding = made.admin.add({ name: 'New Gym', ...place }, STAFF_PLACE).then((outcome) => {
+      order.push(`gym ${outcome.kind}`);
+    });
+    const importing = imported(made, [kmlArea('West', WEST_HALF_RING)]).then(() => {
+      order.push('import');
+    });
+    await Promise.all([adding, importing]);
+    // The gym was added by the regions as they were; only then did they change.
+    expect(order).toEqual(['gym added', 'import']);
+  });
+
+  it('shows the active trains anew, whose copies go by the regions', async () => {
+    const made = await regionAdminWith([
+      { ...testTrain(), forumChannelId: WEST_FORUM, forumPostId: null },
+    ]);
+    const changed: string[] = [];
+    const original = made.service.changed.bind(made.service);
+    made.service.changed = (id: string) => {
+      changed.push(id);
+      original(id);
+    };
+    await imported(made, [kmlArea('South', SOUTH_RING)]);
+    expect(changed).toContain(testTrain().id);
+  });
+});
+
+describe('RegionAdminService.list and exported', () => {
+  it('lists the regions of the server with what is wrong with each', async () => {
+    const made = await regionAdminWith();
+    await withOtherServer(made);
+    await reported(made, 1);
+    made.gateway.gone.add(EAST_CHANNEL);
+    made.gateway.gone.add(EAST_FORUM);
+    const list = await made.regionAdmin.list(REGION_STAFF);
+    expect(list.regions).toMatchObject([
+      { region: { id: 1 }, channel: 'there', forum: 'there', gyms: 8, parties: 1 },
+      { region: { id: 2 }, channel: 'gone', forum: 'gone', gyms: 3, parties: 0 },
+      { region: { id: 3, bounds: null }, channel: 'there', forum: 'none', gyms: 0, parties: 0 },
+    ]);
+    // The Trailhead (gym 10) lies in no region of any server; the gym of the other server does.
+    expect(list.unplacedGyms).toBe(1);
+    expect(list.orphanForums).toEqual([]);
+    // The other server sees its own region only.
+    const other = await made.regionAdmin.list(OTHER_REGION_STAFF);
+    expect(other.regions.map((line) => line.region.channelId)).toEqual([NORTH_CHANNEL]);
+  });
+
+  it('counts the elite raid gyms of a region', async () => {
+    const made = await regionAdminWith();
+    await made.admin.setElite(2, true, REGION_STAFF.staffId);
+    const list = await made.regionAdmin.list(REGION_STAFF);
+    expect(list.regions.map((line) => line.elite)).toEqual([1, 0, 0]);
+  });
+
+  it('exports the outlines so that an import finds every channel again', async () => {
+    const made = await regionAdminWith();
+    const all = made.regionAdmin.exported(REGION_STAFF);
+    expect(all.areas).toEqual([
+      { name: 'west', description: 'Town', outline: WEST_RING },
+      { name: 'east', description: 'Town', outline: squareRing(40.0, -80.0, 40.1, -79.9) },
+    ]);
+    // The region without an outline is left out and counted.
+    expect(all.skipped).toBe(1);
+    // What was exported imports again as it is: nothing new, nothing left out.
+    const preview = made.regionAdmin.preview(
+      REGION_STAFF,
+      all.areas.map((area) => ({ ...area, holes: false })),
+    );
+    expect(preview.leftOut).toEqual([]);
+    expect(preview.newChannels).toEqual([]);
+    expect(preview.imports.map((one) => one.regionId)).toEqual([1, 2]);
+    expect(preview.stranded).toBe(0);
+  });
+
+  it('exports one region, also one whose channel is gone', async () => {
+    const made = await regionAdminWith();
+    made.gateway.gone.add(WEST_CHANNEL);
+    expect(made.regionAdmin.exported(REGION_STAFF, 1)).toEqual({
+      areas: [{ name: `deleted-channel-${WEST_CHANNEL}`, description: null, outline: WEST_RING }],
+      skipped: 0,
+    });
+    expect(made.regionAdmin.exported(REGION_STAFF, 3)).toEqual({ areas: [], skipped: 1 });
+    // Of all regions, the one without a channel is left out: no name would find it again.
+    expect(made.regionAdmin.exported(REGION_STAFF).areas.map((area) => area.name)).toEqual([
+      'east',
+    ]);
+    // Another server's region is none.
+    expect(made.regionAdmin.exported(OTHER_REGION_STAFF, 1)).toEqual({ areas: [], skipped: 0 });
+  });
+});
+
+describe('RegionAdminService.remove', () => {
+  it('says beforehand what the removal does', async () => {
+    const made = await regionAdminWith();
+    await reported(made, 1);
+    await reported(made, 7);
+    made.routes.add(ALICE, 1, 'Loop', [1, 2]);
+    made.routes.add(ALICE, 2, 'East loop', [7]);
+    expect(await made.regionAdmin.removalQuestion(1, REGION_STAFF)).toMatchObject({
+      region: { id: 1 },
+      channel: 'there',
+      forum: 'there',
+      parties: 1,
+      strandedGyms: 8,
+      routes: 1,
+    });
+    expect(await made.regionAdmin.removalQuestion(1, OTHER_REGION_STAFF)).toBeUndefined();
+    expect(await made.regionAdmin.removalQuestion(99, REGION_STAFF)).toBeUndefined();
+  });
+
+  it('ends the parties, deletes the list and the row, and keeps the forum as history', async () => {
+    const made = await regionAdminWith();
+    const west = regionOf(made, WEST_CHANNEL);
+    if (!west) throw new Error('no West');
+    await made.service.ensureSummary(west);
+    const summaryId = regionOf(made, WEST_CHANNEL)?.summaryMessageId ?? '';
+    const raid = await reported(made, 1);
+    const elsewhere = await reported(made, 7);
+    made.routes.add(ALICE, 1, 'Loop', [1, 2]);
+    made.routes.add(ALICE, 2, 'East loop', [7]);
+
+    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
+    await settled(made);
+
+    expect(outcome).toMatchObject({
+      kind: 'removed',
+      region: { id: 1 },
+      ended: 1,
+      routes: 1,
+      strandedGyms: 8,
+      forum: 'kept',
+    });
+    // The raid is over, its post says why and is archived; the raid of East goes on.
+    expect(made.store.get(raid.party.id)).toBeUndefined();
+    const post = made.gateway.posts.get(raid.postId);
+    expect(post).toMatchObject({ archived: true, locked: true });
+    expect(
+      made.gateway.messagesIn(raid.postId).map((message) => message.message.content),
+    ).toContain('This region is being removed, so this raid was closed.');
+    expect(made.store.get(elsewhere.party.id)).toBeDefined();
+    // The list of active raids is gone, the forum and its posts stay.
+    expect(made.gateway.deletedPosts).toContain(summaryId);
+    expect(made.gateway.forums.has(WEST_FORUM)).toBe(true);
+    expect(made.gateway.deletedChannels).toEqual([]);
+    // The row, its routes, and what the directories know.
+    expect(made.regions.byId(1)).toBeUndefined();
+    expect(made.routes.rows.map((row) => row.name)).toEqual(['East loop']);
+    expect(made.directory.isRegion(WEST_CHANNEL)).toBe(false);
+    expect(made.directory.regionsOf(1)).toEqual([]);
+    // The gyms are all still there, and so is the channel.
+    expect(made.directory.get(1)).toBeDefined();
+    expect(made.gateway.serverChannels(made.gateway.guildId)?.map((one) => one.id)).toContain(
+      WEST_CHANNEL,
+    );
+    const line = made.entries.find((entry) => entry.msg === 'a region was removed');
+    expect(line).toMatchObject({ staff: REGION_STAFF.staffId, region: 1, ended: 1, forum: 'kept' });
+  });
+
+  it('deletes the forum when asked, with every post in it', async () => {
+    const made = await regionAdminWith();
+    const raid = await reported(made, 1);
+    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'delete');
+    await settled(made);
+    expect(outcome).toMatchObject({ kind: 'removed', forum: 'deleted', ended: 1 });
+    expect(made.gateway.deletedChannels).toEqual([WEST_FORUM]);
+    expect(made.gateway.posts.has(raid.postId)).toBe(false);
+    // The party ended before its post went: nothing is left active without a post.
+    expect(made.store.active()).toEqual([]);
+  });
+
+  it('removes the region although its forum cannot be deleted, and says so', async () => {
+    const made = await regionAdminWith();
+    made.gateway.failing.set('deleteChannel', missingPermissions());
+    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'delete');
+    expect(outcome).toMatchObject({ kind: 'removed', forum: 'not-deleted', forumDenied: true });
+    expect(made.regions.byId(1)).toBeUndefined();
+    expect(made.gateway.forums.has(WEST_FORUM)).toBe(true);
+  });
+
+  it('says of a region without a forum, or whose forum is gone, that there is none to keep', async () => {
+    const made = await regionAdminWith();
+    expect(await made.regionAdmin.remove(3, REGION_STAFF, 'delete')).toMatchObject({
+      kind: 'removed',
+      forum: 'none',
+      strandedGyms: 0,
+    });
+    made.gateway.gone.add(EAST_FORUM);
+    expect(await made.regionAdmin.remove(2, REGION_STAFF, 'delete')).toMatchObject({
+      kind: 'removed',
+      forum: 'gone',
+    });
+    expect(made.gateway.calls.filter((call) => call.startsWith('deleteChannel'))).toEqual([]);
+  });
+
+  it('is no region for the staff of another server, nor one that is gone', async () => {
+    const made = await regionAdminWith();
+    expect(await made.regionAdmin.remove(1, OTHER_REGION_STAFF, 'delete')).toEqual({
+      kind: 'gone',
+    });
+    expect(made.regions.byId(1)).toBeDefined();
+    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
+    expect(await made.regionAdmin.remove(1, REGION_STAFF, 'keep')).toEqual({ kind: 'gone' });
+  });
+
+  it('does nothing more when a party cannot be ended, and takes parties again', async () => {
+    const made = await regionAdminWith();
+    const raid = await reported(made, 1);
+    made.storage.failing = new Error('connection lost');
+    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'delete');
+    made.storage.failing = undefined;
+    expect(outcome).toMatchObject({ kind: 'stuck', ended: 0, party: { id: raid.party.id } });
+    expect(made.regions.byId(1)).toBeDefined();
+    expect(made.gateway.forums.has(WEST_FORUM)).toBe(true);
+    expect(made.store.get(raid.party.id)).toBeDefined();
+    // The region is open again: a raid can be reported in it.
+    await expect(reported(made, 2)).resolves.toBeDefined();
+  });
+
+  it('leaves the region as it was when its row cannot be deleted', async () => {
+    const made = await regionAdminWith();
+    await reported(made, 1);
+    made.regions.failing = new Error('connection lost');
+    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'delete');
+    made.regions.failing = undefined;
+    await settled(made);
+    expect(outcome).toEqual({ kind: 'failed', ended: 1 });
+    expect(made.regions.byId(1)).toBeDefined();
+    expect(made.gateway.forums.has(WEST_FORUM)).toBe(true);
+    expect(made.directory.isRegion(WEST_CHANNEL)).toBe(true);
+    await expect(reported(made, 2)).resolves.toBeDefined();
+  });
+
+  it('ends a party that was being stored while the removal began', async () => {
+    const made = await regionAdminWith();
+    // Both in one turn: the report is on its way to the database when the removal starts.
+    const reporting = made.service.reportRaid(report(made, 1)).then(
+      (reportOutcome) => reportOutcome.kind,
+      // Its raid was ended under it while its post was being made: the report says there is
+      // no region (its post is taken back); anything else is a failure.
+      (err: unknown) => (err instanceof Error ? err.message : 'failed'),
+    );
+    const removing = made.regionAdmin.remove(1, REGION_STAFF, 'keep');
+    const [reportOutcome, outcome] = await Promise.all([reporting, removing]);
+    await settled(made);
+    expect(outcome).toMatchObject({ kind: 'removed', ended: 1 });
+    expect(reportOutcome).toBe('no-region');
+    // Never an active party of a region that is gone, and no post left behind for it.
+    expect(made.store.active()).toEqual([]);
+    expect(made.gateway.postsIn(WEST_FORUM).filter((post) => !post.archived)).toEqual([]);
+    expect(made.regions.byId(1)).toBeUndefined();
+  });
+
+  it('refuses whoever still holds the region after it is gone', async () => {
+    const made = await regionAdminWith();
+    const held = regionOf(made, WEST_CHANNEL);
+    if (!held) throw new Error('no West');
+    const raid = await reported(made, 7);
+    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
+    // A report, a meetup and a train in what was the channel of West.
+    expect((await made.service.reportRaid(report(made, 1))).kind).toBe('no-region');
+    expect(
+      (
+        await made.service.createMeetup({
+          name: 'Picnic',
+          creatorId: REPORTER,
+          regionChannelId: WEST_CHANNEL,
+        })
+      ).kind,
+    ).toBe('no-region');
+    // A raid of East that is moved into the region somebody still holds: it stays where it is.
+    const gym = made.directory.get(1);
+    if (!gym) throw new Error('no gym 1');
+    expect((await made.service.relocate(raid.party.id, gym, held)).kind).toBe('no-forum');
+    expect(made.store.get(raid.party.id)).toMatchObject({ regionId: 2 });
+    expect(
+      made.storage.writes.every((party) => party.regionId !== 1 || party.status === 'ended'),
+    ).toBe(true);
+  });
+
+  it('keeps the sweeps working for a forum that no region has', async () => {
+    const made = await regionAdminWith();
+    made.gateway.shutOut(WEST_FORUM, ALICE);
+    const raid = await reported(made, 1);
+    await made.attendance.signUp(raid.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
+    await settled(made);
+    expect(made.access.has(WEST_FORUM, ALICE)).toBe(true);
+
+    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
+    await settled(made);
+    // Her access went with the party, as at any end.
+    expect(made.access.has(WEST_FORUM, ALICE)).toBe(false);
+    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
+
+    // The forum is one that parties name and no region has.
+    expect(await made.regionAdmin.orphanForums(REGION_STAFF)).toEqual([WEST_FORUM]);
+    expect((await made.regionAdmin.list(REGION_STAFF)).orphanForums).toEqual([WEST_FORUM]);
+    expect(await made.regionAdmin.orphanForums(OTHER_REGION_STAFF)).toEqual([]);
+
+    // A late message opens the archived post again: the hourly sweep archives it as before.
+    await made.gateway.sendMessage(raid.postId, { content: 'late' });
+    expect(made.gateway.posts.get(raid.postId)?.archived).toBe(false);
+    expect(await made.service.sweepPosts()).toBe(1);
+    expect(made.gateway.posts.get(raid.postId)?.archived).toBe(true);
+    // And the sweep of forum access copes with a grant in such a forum.
+    expect(await made.access.sweep()).toBe(0);
+    await made.service.checkSummaries();
+
+    // Once the forum is deleted by hand it is no orphan any more, and the sweep is not troubled.
+    made.gateway.gone.add(WEST_FORUM);
+    expect(await made.regionAdmin.orphanForums(REGION_STAFF)).toEqual([]);
+    expect(await made.service.sweepPosts()).toBe(0);
+  });
+
+  it('takes back a grant of access to a forum whose region is gone', async () => {
+    const made = await regionAdminWith();
+    made.gateway.shutOut(WEST_FORUM, ALICE);
+    // What a stop of the process left behind: a recorded grant that nothing calls for.
+    await made.grants.add({
+      forumChannelId: WEST_FORUM,
+      memberId: ALICE,
+      guildId: 1,
+      createdAt: 1,
+    });
+    await made.access.load();
+    await made.gateway.admitMember(WEST_FORUM, ALICE);
+    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
+    expect(await made.access.sweep()).toBe(1);
+    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
+    expect(await made.grants.list()).toEqual([]);
+  });
+
+  it('leaves the gyms of an overlapping region of the server in that region', async () => {
+    const made = await regionAdminWith();
+    // South is given the outline of West: every gym of West lies in both.
+    await imported(made, [kmlArea('South', WEST_RING)]);
+    const question = await made.regionAdmin.removalQuestion(1, REGION_STAFF);
+    expect(question?.strandedGyms).toBe(0);
+    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
+    expect(outcome).toMatchObject({ kind: 'removed', strandedGyms: 0 });
+    expect(made.directory.regionsOf(1)).toEqual([SOUTH_CHANNEL]);
+    expect(regionOf(made, UNBOUNDED_CHANNEL)).toBeDefined();
+  });
+});
diff --git a/src/services/region-admin-service.ts b/src/services/region-admin-service.ts
new file mode 100644
index 0000000000000000000000000000000000000000..973cb2107c762271876c5e4ddab60e379968ae73
--- /dev/null
+++ b/src/services/region-admin-service.ts
@@ -0,0 +1,764 @@
+import type { Settings } from '../config/settings.js';
+import type { Gym } from '../db/repositories/gym-repository.js';
+import type { Region, RegionAdminStorage } from '../db/repositories/region-repository.js';
+import type { SavedRouteUpkeep } from '../db/repositories/saved-route-repository.js';
+import { isMissingPermission, type PartyGateway } from '../discord/party-gateway.js';
+import type { KmlArea } from '../domain/geo/kml.js';
+import type { LatLon } from '../domain/geo/lat-lon.js';
+import { isTrain, partyWord, type Party } from '../domain/party/party.js';
+import { isEliteGym } from '../domain/party/raid.js';
+import {
+  channelKey,
+  planImport,
+  type ImportPlan,
+  type PlannedCategory,
+  type PlannedImport,
+  type ServerChannel,
+} from '../domain/regions/region-import.js';
+import type { Logger } from '../log.js';
+import type { AdminLock } from './admin-lock.js';
+import type { PartyService } from './party-service.js';
+import type { PartyStore } from './party-store.js';
+import type { RegionProvider } from './region-directory.js';
+
+/**
+ * The staff member a change of regions is made by: their snowflake (the log says who changed
+ * what), the row of their server (`Guild.id`), whose regions alone they touch, and that
+ * server's snowflake, by which its channels are found.
+ */
+export interface RegionStaff {
+  staffId: string;
+  guildId: number;
+  server: string;
+}
+
+/** What an import would do (`planImport`), and whether the bot may create channels at all. */
+export type ImportPreview = ImportPlan & { mayCreate: boolean };
+
+/** A region an import wrote. */
+export interface ImportedRegion {
+  /** The name of the area in the file. */
+  name: string;
+  channelId: string;
+  regionId: number;
+  /** Whether the channel was no region before. */
+  newRegion: boolean;
+  /** Whether the channel was created by this import. */
+  channelCreated: boolean;
+  /** How many gyms lie in it now. */
+  gyms: number;
+  /**
+   * Its forum: it `had` one, one was `created` now, or it has `none` because that failed
+   * (`forumReason` says why, when that is known).
+   */
+  forum: 'had' | 'created' | 'none';
+  forumReason?: string;
+}
+
+/**
+ * Why an area that was to be imported was not, in the end. `channel-gone`: its channel was
+ * deleted since the preview, or is no text channel any more; `foreign`: it is another server's
+ * region now; `name-taken`: its channel was to be created, and channels of that name exist now
+ * that are not one text channel; `no-permission`, `limit`, `bad-name`, `no-server`: Discord
+ * refused to create its channel or its category (`CreatedChannel`); `failed`: that failed for
+ * another reason (logged); `not-written`: the outlines could not be written (nothing was).
+ */
+export type ImportFailure =
+  | 'channel-gone'
+  | 'foreign'
+  | 'name-taken'
+  | 'no-permission'
+  | 'limit'
+  | 'bad-name'
+  | 'no-server'
+  | 'failed'
+  | 'not-written';
+
+export interface NotImported {
+  name: string;
+  channelName: string;
+  reason: ImportFailure;
+  /** The channel this import created for it, which exists although it is no region. */
+  createdChannelId?: string;
+}
+
+export interface ImportOutcome {
+  imported: ImportedRegion[];
+  notImported: NotImported[];
+  /** The names of the categories this import created. */
+  categoriesCreated: string[];
+  /**
+   * False when what was written could not be loaded again (tried twice): the outlines are
+   * stored, but members see them only after the next load (a restart, or another change).
+   */
+  reloaded: boolean;
+}
+
+/** How a region's channel or forum stands on Discord. */
+export type ChannelState = 'there' | 'gone';
+
+/** A region as `/region list` shows it. */
+export interface RegionLine {
+  region: Region;
+  /** Its text channel: `gone` when the server has no such channel any more. */
+  channel: ChannelState;
+  /** Its forum: `none` while it has none yet. */
+  forum: ChannelState | 'none';
+  gyms: number;
+  /** How many of them are elite raid gyms. */
+  elite: number;
+  /** Its active parties. */
+  parties: number;
+}
+
+export interface RegionList {
+  regions: RegionLine[];
+  /** How many gyms lie in no region of any server: anybody's staff may touch those. */
+  unplacedGyms: number;
+  /** The forums that parties of this server name and no region has, and that still exist. */
+  orphanForums: string[];
+}
+
+/** What removing a region would do. */
+export interface RemovalQuestion {
+  region: Region;
+  channel: ChannelState;
+  forum: ChannelState | 'none';
+  /** Its active parties, which are ended. */
+  parties: number;
+  /** The gyms that will lie in no region of this server afterwards. */
+  strandedGyms: number;
+  /** The saved routes of members that go with it. */
+  routes: number;
+}
+
+export type RemovalOutcome =
+  /** The server has no such region (any more). */
+  | { kind: 'gone' }
+  /**
+   * A party of the region could not be ended: nothing else happened, the region is as it was
+   * but for the `ended` parties that are over.
+   */
+  | { kind: 'stuck'; ended: number; party: Party }
+  /** The row could not be deleted: the region is as it was but for its ended parties. */
+  | { kind: 'failed'; ended: number }
+  | {
+      kind: 'removed';
+      region: Region;
+      /** The parties that were ended. */
+      ended: number;
+      /** The saved routes that went with it. */
+      routes: number;
+      /** The gyms that lie in no region of this server now. */
+      strandedGyms: number;
+      /**
+       * What became of the forum: it had `none`, it was `gone` already, it was `kept` or
+       * `deleted` as asked, or it could not be deleted (`not-deleted`; `forumDenied` when for
+       * lack of a permission).
+       */
+      forum: 'none' | 'gone' | 'kept' | 'deleted' | 'not-deleted';
+      /** The forum that was decided about: the one the row had when it was deleted. */
+      forumChannelId: string | null;
+      forumDenied?: boolean;
+      /** False when the regions could not be loaded again (as for `ImportOutcome`). */
+      reloaded: boolean;
+    };
+
+/** An area of an export: named so that an import finds its channel again. */
+export type ExportedArea = Pick<KmlArea, 'name' | 'description' | 'outline'>;
+
+export interface RegionAdminOptions {
+  /** The lock gym administration runs under too (`AdminLock`). */
+  lock: AdminLock;
+  storage: RegionAdminStorage;
+  regions: RegionProvider & { load(): Promise<void> };
+  gyms: {
+    all(): Gym[];
+    inRegion(channelId: string): Gym[];
+    regionsOf(gymId: number): string[];
+    load(): Promise<void>;
+  };
+  store: Pick<PartyStore, 'active' | 'inRegion' | 'partyForums' | 'closeRegion' | 'reopenRegion'>;
+  posts: Pick<PartyService, 'end' | 'changed' | 'setupForums' | 'forgetTags'>;
+  routes: Pick<SavedRouteUpkeep, 'countInRegion'>;
+  gateway: Pick<
+    PartyGateway,
+    | 'serverChannels'
+    | 'mayCreateChannels'
+    | 'createCategory'
+    | 'createTextChannel'
+    | 'deletePost'
+    | 'deleteChannel'
+  >;
+  settings: Settings;
+  log: Logger;
+}
+
+/** How often the parties of a region are looked for again while they are being ended. */
+const END_ROUNDS = 3;
+
+const categoryKey = (name: string): string => name.normalize('NFC').toLowerCase();
+
+/** An area that is ready to be written: its channel exists. */
+interface Ready {
+  planned: PlannedImport;
+  channelId: string;
+  channelCreated: boolean;
+}
+
+/**
+ * Region administration (`/region`): giving channels their outlines from a file, listing and
+ * exporting the regions of a server, and removing one. A server's staff touch only the regions
+ * whose row belongs to their server and the channels of their server: a region of another
+ * server is, for them, no region.
+ *
+ * Every change runs under the lock of gym administration (`AdminLock`), which decides by the
+ * regions' rows what staff may touch. After every change both directories that hold the
+ * regions are loaded again (`RegionDirectory`, `GymDirectory`) and the active trains are shown
+ * anew (their copies stand in the channels of the regions of their route). Every change is
+ * noted in the log with who made it, which regions and what, by numbers: never a file's text.
+ *
+ * Regions are never removed by themselves: not at start, not when a channel is gone. The only
+ * removal is `remove`.
+ */
+export class RegionAdminService {
+  constructor(private readonly options: RegionAdminOptions) {}
+
+  /** The regions of a server (by its row id), oldest first. */
+  regionsOf(guildId: number): Region[] {
+    return this.options.regions.all().filter((region) => region.guildId === guildId);
+  }
+
+  /** The region with this row id, when it is the server's. */
+  regionOf(regionId: number, guildId: number): Region | undefined {
+    const region = this.options.regions.byId(regionId);
+    return region?.guildId === guildId ? region : undefined;
+  }
+
+  /** The channels of the staff member's server; none when the bot does not know the server. */
+  private channelsOf(staff: Pick<RegionStaff, 'server'>): ServerChannel[] {
+    return this.options.gateway.serverChannels(staff.server) ?? [];
+  }
+
+  /** An ordinary text channel of the server by its id: what can be a region. */
+  textChannel(
+    staff: Pick<RegionStaff, 'server'>,
+    channelId: string,
+  ): { id: string; name: string } | undefined {
+    const found = this.channelsOf(staff).find((channel) => channel.id === channelId);
+    return found?.kind === 'text' ? { id: found.id, name: found.name } : undefined;
+  }
+
+  /**
+   * What an import of these areas would do (`planImport`), by the channels, regions, gyms and
+   * raids as they are now. Nothing is changed. With `target` the file is for that one channel
+   * (which the caller has checked with `textChannel`).
+   */
+  preview(
+    staff: RegionStaff,
+    areas: readonly KmlArea[],
+    target?: { id: string; name: string },
+  ): ImportPreview {
+    const { regions, gyms, store, gateway } = this.options;
+    const mayCreate = gateway.mayCreateChannels(staff.server);
+    const plan = planImport({
+      areas,
+      channels: this.channelsOf(staff),
+      regions: regions.all(),
+      guildId: staff.guildId,
+      gyms: gyms.all(),
+      raids: store.active().map(({ regionId, gymId }) => ({ regionId, gymId })),
+      mayCreate,
+      ...(target ? { target } : {}),
+    });
+    return { ...plan, mayCreate };
+  }
+
+  /**
+   * Carries out what a preview showed (`planned`: its `imports`), as far as it still holds:
+   *
+   * 1. under the lock, every channel is looked at again. A channel that is gone, or no text
+   *    channel any more, or another server's region now, leaves its area out. A channel that
+   *    was to be created is created, in its category, which is created first when it does
+   *    not exist (areas of one category share it); when a text channel of that name has
+   *    appeared meanwhile, that one is taken. What Discord refuses leaves that area out;
+   * 2. all outlines are written in one transaction, all or none. When that fails nothing is a
+   *    region that was none, and the channels created in step 1 are named as such;
+   * 3. the directories are loaded (tried once more when that fails) and the trains shown anew;
+   * 4. every region written that has no forum gets one, with its tags and its list of active
+   *    raids (`PartyService.setupForums`, as `/admin setup-forums` does it), still under the
+   *    lock: gym administration decides by the regions, and waits until they are complete. A
+   *    forum that cannot be made leaves the region as it is, with the reason.
+   *
+   * Active parties stay where they are when an outline changes under them. Never rejects.
+   */
+  async import(staff: RegionStaff, planned: readonly PlannedImport[]): Promise<ImportOutcome> {
+    const { lock } = this.options;
+    return lock.run(async () => {
+      const outcome = await this.write(staff, planned);
+      await this.setUpForums(staff, outcome);
+      return outcome;
+    });
+  }
+
+  /** Step 4 of `import`: the forums of the regions written that have none. */
+  private async setUpForums(staff: RegionStaff, outcome: ImportOutcome): Promise<void> {
+    const { posts, regions, log } = this.options;
+    const needForum = outcome.imported.filter((region) => region.forum === 'none');
+    if (needForum.length === 0) return;
+    try {
+      const results = await posts.setupForums(
+        staff.server,
+        needForum.map((region) => region.regionId),
+      );
+      for (const result of results) {
+        const region = needForum.find((one) => one.regionId === result.region.id);
+        if (!region) continue;
+        if (regions.byId(region.regionId)?.forumChannelId) region.forum = 'created';
+        else if (result.reason !== undefined) region.forumReason = result.reason;
+      }
+    } catch (err) {
+      log.error({ err, staff: staff.staffId }, 'could not set up the forums of imported regions');
+    }
+  }
+
+  /** Steps 1 to 3 of `import`, under the lock. */
+  private async write(
+    staff: RegionStaff,
+    planned: readonly PlannedImport[],
+  ): Promise<ImportOutcome> {
+    const { storage, regions, gyms, log } = this.options;
+    const ready: Ready[] = [];
+    const notImported: NotImported[] = [];
+    const categoriesCreated: string[] = [];
+    /** The categories made in this run, by name without case: the cache may not have them yet. */
+    const madeCategories = new Map<string, string>();
+    const taken = new Set<string>();
+    for (const one of planned) {
+      const leave = (reason: ImportFailure, createdChannelId?: string): void => {
+        notImported.push({
+          name: one.name,
+          channelName: one.channelName,
+          reason,
+          ...(createdChannelId === undefined ? {} : { createdChannelId }),
+        });
+      };
+      const channels = this.channelsOf(staff);
+      let channelId: string;
+      let channelCreated = false;
+      if ('id' in one.channel) {
+        const { id } = one.channel;
+        if (channels.find((channel) => channel.id === id)?.kind !== 'text') {
+          leave('channel-gone');
+          continue;
+        }
+        channelId = id;
+      } else {
+        // Looked at again: a channel of the name may have been made since the preview.
+        const key = channelKey(one.channelName);
+        const namesakes = channels.filter(
+          (channel) => channel.kind !== 'category' && channelKey(channel.name) === key,
+        );
+        const [namesake] = namesakes;
+        if (namesake) {
+          if (namesakes.length > 1 || namesake.kind !== 'text') {
+            leave('name-taken');
+            continue;
+          }
+          channelId = namesake.id;
+        } else {
+          const made = await this.createChannel(
+            staff,
+            one.channelName,
+            one.channel.create.category,
+            channels,
+            madeCategories,
+            categoriesCreated,
+          );
+          if (!made.ok) {
+            leave(made.reason);
+            continue;
+          }
+          channelId = made.id;
+          channelCreated = true;
+        }
+      }
+      const existing = regions.byChannel(channelId);
+      if (existing && existing.guildId !== staff.guildId) {
+        leave('foreign', channelCreated ? channelId : undefined);
+        continue;
+      }
+      if (taken.has(channelId)) {
+        leave('name-taken', channelCreated ? channelId : undefined);
+        continue;
+      }
+      taken.add(channelId);
+      ready.push({ planned: one, channelId, channelCreated });
+    }
+    if (ready.length === 0) {
+      return { imported: [], notImported, categoriesCreated, reloaded: true };
+    }
+
+    let saved: Awaited<ReturnType<RegionAdminStorage['saveOutlines']>>;
+    try {
+      saved = await storage.saveOutlines(
+        staff.guildId,
+        ready.map(({ planned: one, channelId }) => ({ channelId, ring: one.outline })),
+      );
+    } catch (err) {
+      log.error({ err, staff: staff.staffId }, 'could not write the outlines of regions');
+      for (const { planned: one, channelId, channelCreated } of ready) {
+        notImported.push({
+          name: one.name,
+          channelName: one.channelName,
+          reason: 'not-written',
+          ...(channelCreated ? { createdChannelId: channelId } : {}),
+        });
+      }
+      return { imported: [], notImported, categoriesCreated, reloaded: true };
+    }
+    log.info(
+      {
+        staff: staff.staffId,
+        guild: staff.guildId,
+        regions: saved.map((one) => one.regionId),
+        created: saved.filter((one) => one.created).length,
+        replaced: saved.filter((one) => !one.created).length,
+        channelsCreated: ready.filter((one) => one.channelCreated).length,
+        categoriesCreated: categoriesCreated.length,
+        corners: ready.map(({ planned: one }) => one.outline.length - 1),
+      },
+      'the outlines of regions were imported',
+    );
+    const reloaded = await this.reload();
+    const imported = ready.flatMap(({ planned: one, channelId, channelCreated }) => {
+      const written = saved.find((row) => row.channelId === channelId);
+      if (!written) return [];
+      const region: ImportedRegion = {
+        name: one.name,
+        channelId,
+        regionId: written.regionId,
+        newRegion: written.created,
+        channelCreated,
+        gyms: gyms.inRegion(channelId).length,
+        forum: regions.byId(written.regionId)?.forumChannelId ? 'had' : 'none',
+      };
+      return [region];
+    });
+    return { imported, notImported, categoriesCreated, reloaded };
+  }
+
+  /**
+   * Creates the text channel of a new region, in its category, which is created first when
+   * the server has none of that name (looked for again, and among those this run made).
+   */
+  private async createChannel(
+    staff: RegionStaff,
+    name: string,
+    category: PlannedCategory,
+    channels: readonly ServerChannel[],
+    madeCategories: Map<string, string>,
+    categoriesCreated: string[],
+  ): Promise<{ ok: true; id: string } | { ok: false; reason: ImportFailure }> {
+    const { gateway, log } = this.options;
+    try {
+      let categoryId: string | null = null;
+      if (category !== null) {
+        const wanted = 'create' in category ? category.create : category.name;
+        const key = categoryKey(wanted);
+        const existing = channels.find(
+          (channel) => channel.kind === 'category' && categoryKey(channel.name) === key,
+        );
+        categoryId = existing?.id ?? madeCategories.get(key) ?? null;
+        if (categoryId === null) {
+          const made = await gateway.createCategory(staff.server, wanted);
+          if (!made.ok) return made;
+          madeCategories.set(key, made.id);
+          categoriesCreated.push(made.name);
+          categoryId = made.id;
+        }
+      }
+      const made = await gateway.createTextChannel(staff.server, name, categoryId);
+      return made.ok ? { ok: true, id: made.id } : made;
+    } catch (err) {
+      log.error({ err, staff: staff.staffId }, 'could not create the channel of a region');
+      return { ok: false, reason: 'failed' };
+    }
+  }
+
+  /**
+   * After regions changed: both directories read them again (once more when that fails), and
+   * the active trains are shown anew. False when both tries failed: that is logged, and what is
+   * in memory then is what was there before.
+   */
+  private async reload(): Promise<boolean> {
+    const { regions, gyms, store, posts, log } = this.options;
+    let loaded = false;
+    for (let attempt = 1; attempt <= 2 && !loaded; attempt++) {
+      try {
+        await regions.load();
+        await gyms.load();
+        loaded = true;
+      } catch (err) {
+        log.error({ err, attempt }, 'regions changed, but they could not be read again');
+      }
+    }
+    for (const party of store.active()) {
+      if (isTrain(party)) posts.changed(party.id);
+    }
+    return loaded;
+  }
+
+  private static state(
+    channels: readonly ServerChannel[] | undefined,
+    id: string,
+    kind: ServerChannel['kind'],
+  ): ChannelState {
+    // A server the bot cannot list the channels of: nothing is known to be gone.
+    if (channels === undefined) return 'there';
+    return channels.find((channel) => channel.id === id)?.kind === kind ? 'there' : 'gone';
+  }
+
+  private forumState(
+    channels: readonly ServerChannel[] | undefined,
+    region: Region,
+  ): ChannelState | 'none' {
+    return region.forumChannelId === null
+      ? 'none'
+      : RegionAdminService.state(channels, region.forumChannelId, 'forum');
+  }
+
+  /** Whether a gym lies in a region of any server. */
+  private placed(gymId: number): boolean {
+    const { gyms, regions } = this.options;
+    return gyms
+      .regionsOf(gymId)
+      .some((channelId) => (regions.byChannel(channelId)?.guildId ?? null) !== null);
+  }
+
+  /** The gyms of a region that lie in no other region of its server. */
+  private onlyIn(region: Region): Gym[] {
+    const { gyms, regions } = this.options;
+    return gyms.inRegion(region.channelId).filter(
+      (gym) =>
+        !gyms.regionsOf(gym.id).some((channelId) => {
+          const other = regions.byChannel(channelId);
+          return other !== undefined && other.id !== region.id && other.guildId === region.guildId;
+        }),
+    );
+  }
+
+  /**
+   * The forums that parties of this server name and no region has, and that still exist: the
+   * forums of regions that were removed (and kept), or deleted outside the bot.
+   */
+  async orphanForums(staff: Pick<RegionStaff, 'guildId' | 'server'>): Promise<string[]> {
+    const { store, regions, gateway } = this.options;
+    const channels = gateway.serverChannels(staff.server);
+    const named = await store.partyForums();
+    return [
+      ...new Set(
+        named
+          .filter(({ guildId }) => guildId === staff.guildId)
+          .map(({ forumChannelId }) => forumChannelId),
+      ),
+    ].filter(
+      (forumId) =>
+        regions.byForum(forumId) === undefined &&
+        channels?.find((channel) => channel.id === forumId)?.kind === 'forum',
+    );
+  }
+
+  /** The regions of the server with what is wrong with each, and what belongs to none. */
+  async list(staff: Pick<RegionStaff, 'guildId' | 'server'>): Promise<RegionList> {
+    const { gyms, store, gateway, log } = this.options;
+    const channels = gateway.serverChannels(staff.server);
+    const lines = this.regionsOf(staff.guildId).map((region): RegionLine => {
+      const inside = gyms.inRegion(region.channelId);
+      return {
+        region,
+        channel: RegionAdminService.state(channels, region.channelId, 'text'),
+        forum: this.forumState(channels, region),
+        gyms: inside.length,
+        elite: inside.filter(isEliteGym).length,
+        parties: store.inRegion(region.id).length,
+      };
+    });
+    let orphanForums: string[] = [];
+    try {
+      orphanForums = await this.orphanForums(staff);
+    } catch (err) {
+      log.warn({ err }, 'could not list the forums that parties name');
+    }
+    return {
+      regions: lines,
+      unplacedGyms: gyms.all().filter((gym) => !this.placed(gym.id)).length,
+      orphanForums,
+    };
+  }
+
+  /**
+   * The outlines of the server's regions as areas to write to a file (`writeKml`) that imports
+   * again as it is: each is named by its channel (the name stands for the channel), and its
+   * description is the name of the category the channel is in now. `only` gives one region.
+   * `skipped` counts the regions left out: those without an outline, and (of several) those
+   * whose channel is gone, which no name would find again.
+   */
+  exported(
+    staff: Pick<RegionStaff, 'guildId' | 'server'>,
+    only?: number,
+  ): { areas: ExportedArea[]; skipped: number } {
+    const channels = this.options.gateway.serverChannels(staff.server) ?? [];
+    const wanted = this.regionsOf(staff.guildId).filter(
+      (region) => only === undefined || region.id === only,
+    );
+    const areas: ExportedArea[] = [];
+    for (const region of wanted) {
+      const channel = channels.find((one) => one.id === region.channelId);
+      if (region.bounds === null || (!channel && only === undefined)) continue;
+      const category = channels.find(
+        (one) => one.kind === 'category' && one.id === channel?.categoryId,
+      );
+      areas.push({
+        name: channel?.name ?? `deleted-channel-${region.channelId}`,
+        description: category?.name ?? null,
+        outline: region.bounds.map(({ lat, lon }): LatLon => ({ lat, lon })),
+      });
+    }
+    return { areas, skipped: wanted.length - areas.length };
+  }
+
+  /** What removing a region would do now; undefined when the server has no such region. */
+  async removalQuestion(
+    regionId: number,
+    staff: Pick<RegionStaff, 'guildId' | 'server'>,
+  ): Promise<RemovalQuestion | undefined> {
+    const { store, routes, gateway } = this.options;
+    const region = this.regionOf(regionId, staff.guildId);
+    if (!region) return undefined;
+    const channels = gateway.serverChannels(staff.server);
+    return {
+      region,
+      channel: RegionAdminService.state(channels, region.channelId, 'text'),
+      forum: this.forumState(channels, region),
+      parties: store.inRegion(region.id).length,
+      strandedGyms: this.onlyIn(region).length,
+      routes: await routes.countInRegion(region.id),
+    };
+  }
+
+  /**
+   * Removes a region. Everything is decided now, whatever a question said minutes ago. Under
+   * the lock, in this order:
+   *
+   * 1. the region is closed to new parties (`PartyStore.closeRegion`), and every active party
+   *    of it is ended (`PartyService.end`), its post saying why. When one cannot be ended,
+   *    nothing more happens (`stuck`) and the region takes parties again;
+   * 2. the row is deleted (`failed` when it cannot be: the region is as it was, without its
+   *    parties). With it go the saved routes of the region, and its parties' rows lose their
+   *    region; its text channel and the gyms are never touched;
+   * 3. the directories are loaded: from here on the channel is no region for anybody. The
+   *    region stays closed, so that whoever held it across this is refused as well;
+   * 4. the list of active raids in its forum is deleted (after the row, so that nothing makes
+   *    it anew), and the forum is deleted or kept, as asked. A kept forum stays as history:
+   *    its posts are archived and locked, and the hourly sweeps go on by the party rows. A
+   *    forum that cannot be deleted is said in the answer; the region is gone all the same.
+   */
+  remove(regionId: number, staff: RegionStaff, forum: 'keep' | 'delete'): Promise<RemovalOutcome> {
+    const { lock, storage, store, posts, gateway, log } = this.options;
+    return lock.run(async (): Promise<RemovalOutcome> => {
+      const region = this.regionOf(regionId, staff.guildId);
+      if (!region) return { kind: 'gone' };
+      await store.closeRegion(region.id);
+      let ended = 0;
+      let stuck: Party | undefined;
+      for (let round = 0; round < END_ROUNDS && !stuck; round++) {
+        const parties = store.inRegion(region.id);
+        if (parties.length === 0) break;
+        for (const party of parties) {
+          try {
+            const lastWords = `This region is being removed, so this ${partyWord(party)} was closed.`;
+            if (await posts.end(party.id, undefined, { lastWords })) ended++;
+          } catch (err) {
+            log.error({ err, party: party.id, region: region.id }, 'could not end a party');
+            stuck = party;
+            break;
+          }
+        }
+      }
+      stuck ??= store.inRegion(region.id)[0];
+      if (stuck) {
+        store.reopenRegion(region.id);
+        return { kind: 'stuck', ended, party: stuck };
+      }
+      const strandedGyms = this.onlyIn(region).length;
+      let removed: Awaited<ReturnType<RegionAdminStorage['remove']>>;
+      try {
+        removed = await storage.remove(region.id, staff.guildId);
+      } catch (err) {
+        log.error({ err, region: region.id }, 'could not remove a region');
+        store.reopenRegion(region.id);
+        return { kind: 'failed', ended };
+      }
+      const reloaded = await this.reload();
+      // Somebody else removed it in the same moment: memory has caught up now.
+      if (!removed.removed) return { kind: 'gone' };
+      const { routes } = removed;
+      // What the row had when it was locked and deleted, whatever memory said.
+      const forumId = removed.forumChannelId;
+      if (removed.summaryMessageId !== null) {
+        try {
+          await gateway.deletePost(removed.summaryMessageId);
+        } catch (err) {
+          log.warn({ err, region: region.id }, 'could not delete the list of a removed region');
+        }
+      }
+      let forumOutcome: Extract<RemovalOutcome, { kind: 'removed' }>['forum'] = 'none';
+      let forumDenied = false;
+      if (forumId !== null) {
+        posts.forgetTags(forumId);
+        // A server the bot does not know (it left it) has no forum left to delete.
+        const channels = gateway.serverChannels(staff.server);
+        const there =
+          channels !== undefined &&
+          RegionAdminService.state(channels, forumId, 'forum') === 'there';
+        if (!there) forumOutcome = 'gone';
+        else if (forum === 'keep') forumOutcome = 'kept';
+        else {
+          try {
+            await gateway.deleteChannel(forumId);
+            forumOutcome = 'deleted';
+          } catch (err) {
+            log.warn({ err, forum: forumId }, 'could not delete the forum of a removed region');
+            forumOutcome = 'not-deleted';
+            forumDenied = isMissingPermission(err);
+          }
+        }
+      }
+      log.info(
+        {
+          staff: staff.staffId,
+          guild: staff.guildId,
+          region: region.id,
+          channel: region.channelId,
+          ended,
+          routes,
+          strandedGyms,
+          forum: forumOutcome,
+        },
+        'a region was removed',
+      );
+      return {
+        kind: 'removed',
+        region,
+        ended,
+        routes,
+        strandedGyms,
+        forum: forumOutcome,
+        forumChannelId: forumId,
+        ...(forumDenied ? { forumDenied } : {}),
+        reloaded,
+      };
+    });
+  }
+}
diff --git a/test/support/gym-admin.ts b/test/support/gym-admin.ts
index 53837ff16f0da0dd177df973e9c3595882971851..bb546062476acd23f22d17ff2bc08052a9db9d31 100644
--- a/test/support/gym-admin.ts
+++ b/test/support/gym-admin.ts
@@ -1,4 +1,5 @@
 import type { GymRemoval, RemovedGym } from '../../src/db/repositories/gym-removal-repository.js';
+import { AdminLock } from '../../src/services/admin-lock.js';
 import { GymAdminService, type StaffPlace } from '../../src/services/gym-admin-service.js';
 import { GymUpkeep } from '../../src/services/gym-upkeep.js';
 import type { Party } from '../../src/domain/party/party.js';
@@ -105,7 +106,10 @@ export async function gymAdminWith(parties: readonly Party[] = [], kept?: Partia
     setTimer: () => () => undefined,
   });
   const removal = new MemoryGymRemoval(gymStore, made.routes, made.gymTargets);
+  // The one lock of gym and region administration, as in the bot.
+  const lock = new AdminLock();
   const admin = new GymAdminService({
+    lock,
     gyms: gymStore,
     removal,
     directory,
@@ -120,5 +124,5 @@ export async function gymAdminWith(parties: readonly Party[] = [], kept?: Partia
     settings: made.settings,
     log: made.log,
   });
-  return { ...made, admin, upkeep, geo, gymStore, removal, directory };
+  return { ...made, admin, upkeep, geo, gymStore, removal, directory, lock };
 }
diff --git a/test/support/region-admin.ts b/test/support/region-admin.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9e5a2ed6c16665475da180f5a3cd9cba449eaefe
--- /dev/null
+++ b/test/support/region-admin.ts
@@ -0,0 +1,84 @@
+import type { KmlArea } from '../../src/domain/geo/kml.js';
+import type { LatLon } from '../../src/domain/geo/lat-lon.js';
+import type { Party } from '../../src/domain/party/party.js';
+import { RegionAdminService, type RegionStaff } from '../../src/services/region-admin-service.js';
+import { gymAdminWith, OTHER_STAFF, STAFF } from './gym-admin.js';
+import {
+  EAST_CHANNEL,
+  OTHER_GUILD_ID,
+  OTHER_GUILD_ROW,
+  UNBOUNDED_CHANNEL,
+  WEST_CHANNEL,
+} from './gyms.js';
+import type { Outliving } from './party-service.js';
+
+/** A text channel of the fakes' server that is no region, and the category it is in. */
+export const SOUTH_CHANNEL = '100000000000000005';
+export const TOWN_CATEGORY = '100000000000000041';
+
+/** A staff member of the fakes' server (the guild of row 1). */
+export const REGION_STAFF: RegionStaff = {
+  staffId: STAFF,
+  guildId: 1,
+  server: '412345678901234567',
+};
+/** A staff member of the second server (the guild of row 2). */
+export const OTHER_REGION_STAFF: RegionStaff = {
+  staffId: OTHER_STAFF,
+  guildId: OTHER_GUILD_ROW,
+  server: OTHER_GUILD_ID,
+};
+
+/** A closed square, as the invented regions are. */
+export function squareRing(south: number, west: number, north: number, east: number): LatLon[] {
+  return [
+    { lat: south, lon: west },
+    { lat: north, lon: west },
+    { lat: north, lon: east },
+    { lat: south, lon: east },
+    { lat: south, lon: west },
+  ];
+}
+
+/** The outline of West as it is, and of a strip south of West and East that holds no gym. */
+export const WEST_RING = squareRing(40.0, -80.1, 40.1, -80.0);
+export const SOUTH_RING = squareRing(39.9, -80.1, 40.0, -79.9);
+/** The western half of West: the Library (gym 1) lies in it, the Bridge (gym 4) does not. */
+export const WEST_HALF_RING = squareRing(40.0, -80.1, 40.1, -80.045);
+
+/** An area of a file, as `readKml` gives it. */
+export function kmlArea(name: string, outline: LatLon[], more: Partial<KmlArea> = {}): KmlArea {
+  return { name, description: null, outline, holes: false, ...more };
+}
+
+/**
+ * Region administration over fakes, with everything `gymAdminWith` gives over the same gyms,
+ * regions and lock: the invented regions West, East and the one without an outline, whose
+ * channels the fake server has as `west`, `east` and `unbounded` (in the category `Town`), a
+ * text channel `south` that is no region, and the forums of West and East. What goes with a
+ * region's row in the database (its saved routes, the region of its parties' rows) goes with
+ * it here too.
+ */
+export async function regionAdminWith(parties: readonly Party[] = [], kept?: Partial<Outliving>) {
+  const made = await gymAdminWith(parties, kept);
+  const { gateway, regions } = made;
+  gateway.addChannel(TOWN_CATEGORY, 'Town', { kind: 'category' });
+  gateway.addChannel(WEST_CHANNEL, 'west', { categoryId: TOWN_CATEGORY });
+  gateway.addChannel(EAST_CHANNEL, 'east', { categoryId: TOWN_CATEGORY });
+  gateway.addChannel(UNBOUNDED_CHANNEL, 'unbounded', { categoryId: TOWN_CATEGORY });
+  gateway.addChannel(SOUTH_CHANNEL, 'south');
+  regions.cascade = { routes: made.routes, parties: made.storage };
+  const regionAdmin = new RegionAdminService({
+    lock: made.lock,
+    storage: regions,
+    regions,
+    gyms: made.directory,
+    store: made.store,
+    posts: made.service,
+    routes: made.routes,
+    gateway,
+    settings: made.settings,
+    log: made.log,
+  });
+  return { ...made, regionAdmin };
+}
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 819210d05a88e8ca1ed22fd9f878eb58915f2a65..7417fa3b1e4182f9f66dd475441fa7c08da1257c 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -8,9 +8,11 @@ import type { AttendanceService } from '../../src/services/attendance-service.js
 import type { GymAdminService } from '../../src/services/gym-admin-service.js';
 import type { PartyService } from '../../src/services/party-service.js';
 import type { RaidChangeService } from '../../src/services/raid-change-service.js';
+import type { RegionAdminService } from '../../src/services/region-admin-service.js';
 import type { SpawnService } from '../../src/services/spawn-service.js';
 import type { TimedPartyService } from '../../src/services/timed-party-service.js';
 import type { TrainService } from '../../src/services/train-service.js';
+import { FakeAttachments } from './attachments.js';
 import { FAKE_GUILD_ID } from './fake-interactions.js';
 import { catalogueFixture } from './game-data.js';
 import { FakeMemberDirectory } from './members.js';
@@ -61,6 +63,12 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'pass { gymAdmin: admin, gyms: directory, … } from gymAdminWith()',
     ),
     regions: regionsFixture(),
+    regionAdmin: unavailable<RegionAdminService>(
+      'regionAdmin',
+      'pass { regionAdmin, regions, gyms: directory, … } from regionAdminWith()',
+    ),
+    // No attachment can be downloaded; a test passes its own with files.
+    attachments: new FakeAttachments(),
     // The invented regions belong to the guild of row 1, the server of the fake interactions.
     guilds: { idFor: (snowflake) => Promise.resolve(snowflake === FAKE_GUILD_ID ? 1 : undefined) },
     parties: noParties(),
````

---

### Task 4: The region commands: list and export for staff, bounds for members

Prototype commit: `ee3e79c7fe41b87c09275b96cfc914f75a05dd4b`

- /region is a command group of its own, registered like /gym (Manage
  Server, admins, moderators and bot developers, every answer private).
  Its region option is free text with the server's regions while typing
  (a region whose channel is gone is offered as "deleted channel"), and
  takes a choice, a mention, a channel id or a channel's exact name;
  without it, the region of the channel the command is used in.
- /region list: every region with its gyms, its active parties and what
  is wrong with it; the gyms in no region of any server; the forums
  whose region is gone. It fits Discord's limits with sixty regions.
- /region export: the outline of one region as a KML file, or all
  regions of the server in one file that imports again as it is.
- /bounds, for every member (Matt, 2026-10-13): the picture of the
  region of the channel and how many gyms lie in it.
- The handler of the buttons of /region (custom-id kind region), which
  the import and the removal use.


**Files:**

```
 src/commands/index.ts                    |   4 ++
 src/commands/regions/bounds.ts           |  60 +++++++++++++++++++++++++
 src/commands/regions/controls.ts         |  94 +++++++++++++++++++++++++++++++++++++++
 src/commands/regions/export.ts           |  86 ++++++++++++++++++++++++++++++++++++
 src/commands/regions/index.ts            |  26 +++++++++++
 src/commands/regions/list.ts             |  93 +++++++++++++++++++++++++++++++++++++++
 src/commands/regions/region-option.ts    | 150 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/regions/region.more.test.ts |  72 ++++++++++++++++++++++++++++++
 src/commands/regions/region.test.ts      | 362 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/regions/shared.ts           | 149 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/components/index.ts                  |   2 +
 src/services/region-admin-service.ts     |   2 +-
 test/support/fake-interactions.test.ts   |  23 ++++++++++
 test/support/fake-interactions.ts        |  20 ++++++++-
 test/support/region-commands.ts          | 138 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 15 files changed, 1278 insertions(+), 3 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `The region commands: list and export for staff, bounds for members`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/src/commands/index.ts b/src/commands/index.ts
index 875c7bae75d05d8d2d56c7b8e1b2ee0ea0861131..ef54386310a35ffbaddb1853003f9b8d693f60df 100644
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -18,6 +18,8 @@ import { boss, moveset } from './raids/boss.js';
 import { location } from './raids/location.js';
 import { duration, end, hatch } from './raids/change.js';
 import { raid } from './raids/raid.js';
+import { bounds } from './regions/bounds.js';
+import { region } from './regions/index.js';
 import { iam, iamnot } from './roles/iam.js';
 import { settings } from './settings/settings.js';
 import { conductor } from './trains/conductor.js';
@@ -45,6 +47,7 @@ export const commands: readonly CommandModule[] = [
   cancelMeet,
   status,
   where,
+  bounds,
   shout,
   deleteParty,
   hatch,
@@ -77,4 +80,5 @@ export const commands: readonly CommandModule[] = [
   nickname,
   admin,
   gym,
+  region,
 ];
diff --git a/src/commands/regions/bounds.ts b/src/commands/regions/bounds.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f1fcf7b873748dcc6ddcd590baec0ddd8103c26a
--- /dev/null
+++ b/src/commands/regions/bounds.ts
@@ -0,0 +1,60 @@
+import { basename } from 'node:path';
+import { SlashCommandBuilder, type APIEmbed } from 'discord.js';
+import type { SimpleCommand } from '../../discord/command.js';
+import { UserError } from '../../discord/errors.js';
+import { regionChannelOf, requireGuild } from '../../discord/guards.js';
+import type { Throttle } from '../../discord/throttle.js';
+
+/** A picture is attached to every answer: a member looks at a region now and then, not often. */
+export const BOUNDS_THROTTLE: Throttle = { uses: 5, perSeconds: 60 };
+
+/** How many gyms a region has, as the legacy bot said it. */
+export function gymCountSentence(gyms: number): string {
+  if (gyms === 0) return 'There are currently no gyms within this region.';
+  return gyms === 1
+    ? 'There is 1 gym within this region.'
+    : `There are ${gyms} gyms within this region.`;
+}
+
+/**
+ * `/bounds`: what area a region covers, for any member (Matt, 2026-10-13: ordinary members
+ * used the legacy command). In the channel of a region, its forum or a post in it: a picture
+ * of the outline and how many gyms lie in it, for the member alone. Without a picture (no map
+ * key, or the download failed) the answer goes out all the same.
+ */
+export const bounds: SimpleCommand = {
+  data: new SlashCommandBuilder()
+    .setName('bounds')
+    .setDescription('Show the area the region of this channel covers'),
+  help: {
+    category: 'util',
+    details:
+      'Use it in the channel of a region, in its forum or in a post there: I show you a map ' +
+      'with the outline of the region and say how many gyms lie in it.',
+    examples: ['/bounds'],
+  },
+  guards: [requireGuild],
+  defer: 'ephemeral',
+  throttle: BOUNDS_THROTTLE,
+  async execute(interaction, ctx) {
+    const channelId = regionChannelOf(interaction, ctx);
+    const region = channelId === undefined ? undefined : ctx.regions.byChannel(channelId);
+    if (!region) {
+      throw new UserError(
+        'This channel is not a region. Use /bounds in the channel of a region, in its forum or ' +
+          'in a post there.',
+      );
+    }
+    const map = await ctx.maps.region(region).catch((err: unknown) => {
+      ctx.log.warn({ err, region: region.id }, 'could not get the map of a region');
+      return undefined;
+    });
+    const embed: APIEmbed = {
+      title: 'This channel covers the following area',
+      description:
+        `<#${region.channelId}>\n` + gymCountSentence(ctx.gyms.inRegion(region.channelId).length),
+      ...(map === undefined ? {} : { image: { url: `attachment://${basename(map)}` } }),
+    };
+    await interaction.editReply({ embeds: [embed], files: map === undefined ? [] : [map] });
+  },
+};
diff --git a/src/commands/regions/controls.ts b/src/commands/regions/controls.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4e8c212734813c55cdbbb6ff253b4c9043f1a12e
--- /dev/null
+++ b/src/commands/regions/controls.ts
@@ -0,0 +1,94 @@
+import type { ComponentHandler } from '../../discord/command.js';
+import { UserError } from '../../discord/errors.js';
+import { requireBotManagement } from '../../discord/guards.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
+import { count } from '../../render/text.js';
+import {
+  EXPIRED,
+  markAnswered,
+  NOT_YOURS,
+  pendingRegions,
+  REGION_KIND,
+  wasAnswered,
+  type ButtonAnswer,
+  type PendingRegion,
+} from './shared.js';
+
+/** What a question says once it was answered with Cancel. */
+const CANCELLED: Readonly<Record<PendingRegion['what'], string>> = {
+  import: 'Nothing was imported.',
+  remove: 'The region was kept.',
+};
+
+/**
+ * What a question says while its answer is being carried out, which may take a while (an
+ * import creates channels and forums): the buttons go at once, so that nobody presses again.
+ */
+function working(request: PendingRegion): string {
+  return request.what === 'import'
+    ? `Importing ${count(request.imports.length, 'area')}… this message changes when it is done.`
+    : 'Removing the region… this message changes when it is done.';
+}
+
+/**
+ * What the buttons of `/region` do, by what their request is about and their action
+ * (`import:import`, `remove:keep`); each subcommand brings its own.
+ */
+const ANSWERS: Readonly<Record<string, ButtonAnswer>> = {};
+
+/**
+ * The buttons of `/region` (custom-id kind `region`): each belongs to a pending request of the
+ * staff member who used the command, by the token in its custom id, and nobody else may answer
+ * it. The guard of `/region` applies here as well: a control can be pressed by whoever sees
+ * it, and a custom id can be sent by anybody.
+ *
+ * A question is answered once. A second press on it (a double click) is only acknowledged, so
+ * that it does not write over the answer of the first; a press on a question that is older
+ * than the bot remembers says that it has expired. The answer takes the place of the question,
+ * also when it is a refusal: buttons that no longer do anything must not stay under it.
+ */
+export const regionControls: ComponentHandler = {
+  kind: REGION_KIND,
+  guards: [requireBotManagement],
+
+  async button(interaction, id, ctx) {
+    const found = pendingRegions.take(id.id, interaction.user.id);
+    if (found === 'not-yours') throw new UserError(NOT_YOURS);
+    if (found === 'expired') {
+      if (wasAnswered(id.id)) await interaction.deferUpdate();
+      else
+        await interaction.update({ content: EXPIRED, embeds: [], components: [], attachments: [] });
+      return;
+    }
+    const request = found.value;
+    markAnswered(id.id);
+    if (id.action === 'cancel') {
+      await interaction.update({
+        content: CANCELLED[request.what],
+        embeds: [],
+        components: [],
+        attachments: [],
+      });
+      return;
+    }
+    const answer = ANSWERS[`${request.what}:${id.action}`];
+    if (!answer) throw new UserError(STALE_COMPONENT);
+    await interaction.update({
+      content: working(request),
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+    try {
+      await answer(interaction, ctx, request);
+    } catch (err) {
+      if (!(err instanceof UserError)) throw err;
+      await interaction.editReply({
+        content: err.message,
+        embeds: [],
+        components: [],
+        attachments: [],
+      });
+    }
+  },
+};
diff --git a/src/commands/regions/export.ts b/src/commands/regions/export.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d22f37ed5239fd0ab7aa1ce211a9c88dcb51cb54
--- /dev/null
+++ b/src/commands/regions/export.ts
@@ -0,0 +1,86 @@
+import { AttachmentBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import { UserError } from '../../discord/errors.js';
+import { writeKml } from '../../domain/geo/kml.js';
+import { count } from '../../render/text.js';
+import {
+  allRegionsAsked,
+  chosenRegion,
+  respondWithRegionsOrAll,
+  withRegionOption,
+} from './region-option.js';
+import { regionInSentence, regionLabel, regionStaff } from './shared.js';
+
+/** The name of the file `/region export` attaches for all regions of a server. */
+export const EXPORT_FILE = 'regions.kml';
+
+/**
+ * `/region export`: the outline of a region as a KML file, to change it in a map editor and
+ * import it again; or, without a region and outside a region's channel, the outlines of all
+ * regions of the server in one file, as a backup that imports again as it is.
+ */
+export const exportRegions: SubcommandPart = {
+  data: withRegionOption(
+    new SlashCommandSubcommandBuilder()
+      .setName('export')
+      .setDescription('Get the outline of a region, or of all regions, as a KML file'),
+    'The region, or "all"; without it, the region of this channel, or all regions',
+    false,
+  ),
+  help: {
+    details:
+      `With a region, or in the channel of one: the outline of that region as a file. Anywhere ` +
+      `else: all regions of this server in one file, \`${EXPORT_FILE}\`. Each area is named ` +
+      'after its channel, with the category of the channel as its description, so that ' +
+      '`/region import` puts every outline back where it was. Open the file in a map editor ' +
+      '(Google My Maps: Import) to change an outline. A region without an outline is left out.',
+    examples: ['/region export', '/region export region:#north-hills'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const staff = await regionStaff(interaction, ctx);
+    const region = allRegionsAsked(interaction) ? undefined : chosenRegion(interaction, ctx, staff);
+    const channels = ctx.regionAdmin.channelsOf(staff);
+    if (region) {
+      const { areas } = ctx.regionAdmin.exported(staff, region.id);
+      const [area] = areas;
+      if (!area) {
+        throw new UserError(
+          `${regionLabel(region, channels)} has no outline yet, so there is nothing to export.`,
+        );
+      }
+      const gone = !channels.some((channel) => channel.id === region.channelId);
+      await interaction.editReply({
+        content: gone
+          ? `The outline of ${regionInSentence(region, channels)}. Its channel is gone: to give ` +
+            'the outline to another channel, use `/region import` with `channel:`.'
+          : `The outline of ${regionLabel(region, channels)}.`,
+        files: [
+          new AttachmentBuilder(Buffer.from(writeKml(areas), 'utf8'), {
+            name: `${area.name}.kml`,
+          }),
+        ],
+      });
+      return;
+    }
+    const { areas, skipped } = ctx.regionAdmin.exported(staff);
+    if (areas.length === 0) {
+      throw new UserError(
+        skipped === 0
+          ? 'This server has no regions yet.'
+          : 'No region of this server has both an outline and a channel, so there is nothing ' +
+              'to export. `/region list` shows what each one lacks.',
+      );
+    }
+    await interaction.editReply({
+      content:
+        `The outlines of ${count(areas.length, 'region')} of this server.` +
+        (skipped > 0
+          ? ` ${count(skipped, 'region')} without an outline or without a channel ` +
+            `${skipped === 1 ? 'is' : 'are'} left out (\`/region list\` shows which).`
+          : ''),
+      files: [new AttachmentBuilder(Buffer.from(writeKml(areas), 'utf8'), { name: EXPORT_FILE })],
+    });
+  },
+  autocomplete: respondWithRegionsOrAll,
+};
diff --git a/src/commands/regions/index.ts b/src/commands/regions/index.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1d973e2a7ccfa02b67663f75d1a86ac173f17d98
--- /dev/null
+++ b/src/commands/regions/index.ts
@@ -0,0 +1,26 @@
+import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
+import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
+import { requireBotManagement } from '../../discord/guards.js';
+import { exportRegions } from './export.js';
+import { listRegions } from './list.js';
+
+/** The subcommands of `/region`, each in a file of its own in this folder. */
+const parts: readonly SubcommandPart[] = [listRegions, exportRegions];
+
+/**
+ * `/region`: the regions of a server, for staff. Discord offers it only to members who may
+ * manage the server (or to whom a server admin grants it), and the bot's own check applies on
+ * top: admins, moderators and bot developers. It is tied to no channel, and every answer is
+ * for the staff member alone. Staff touch only the regions whose row belongs to their server
+ * and the channels of their server (`RegionAdminService`). What members ask about a region is
+ * `/bounds`.
+ */
+export const region = commandGroup({
+  data: new SlashCommandBuilder()
+    .setName('region')
+    .setDescription('Look after the regions of this server')
+    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
+  help: { category: 'admin' },
+  guards: [requireBotManagement],
+  parts,
+});
diff --git a/src/commands/regions/list.ts b/src/commands/regions/list.ts
new file mode 100644
index 0000000000000000000000000000000000000000..75089e522aab34d7808da9c2634aac9024a7dc60
--- /dev/null
+++ b/src/commands/regions/list.ts
@@ -0,0 +1,93 @@
+import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import type { ServerChannel } from '../../domain/regions/region-import.js';
+import { count, fitItems, fitMessages, LIMITS } from '../../render/text.js';
+import type { RegionLine } from '../../services/region-admin-service.js';
+import { regionLabel, regionStaff } from './shared.js';
+
+/** One region as a line of the list: its channel, what it holds, and what is wrong with it. */
+export function regionLine(line: RegionLine, channels: readonly ServerChannel[]): string {
+  const { region } = line;
+  const holds = [
+    line.elite > 0
+      ? `${count(line.gyms, 'gym')} (${count(line.elite, 'elite raid gym')})`
+      : count(line.gyms, 'gym'),
+    ...(line.parties > 0
+      ? [count(line.parties, 'active raid, train or meetup', 'active raids, trains and meetups')]
+      : []),
+  ];
+  const wrong = [
+    ...(line.channel === 'gone' ? ['its channel is gone'] : []),
+    ...(region.bounds === null ? ['no outline'] : []),
+    ...(line.forum === 'none' ? ['no forum yet'] : []),
+    ...(line.forum === 'gone' ? ['its forum is gone'] : []),
+  ];
+  const problems = wrong.length === 0 ? '' : ` · **${wrong.join(', ')}**`;
+  return `- ${regionLabel(region, channels)} · ${holds.join(' · ')}${problems}`;
+}
+
+/**
+ * `/region list`: every region of the server on a line, with its gyms, its active parties and
+ * what is wrong with it; then the gyms that lie in no region of any server, and the forums
+ * that parties name and no region has.
+ */
+export const listRegions: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName('list')
+    .setDescription('List the regions of this server, with what is wrong with any of them'),
+  help: {
+    details:
+      'A line per region: its channel, how many gyms lie in it (and how many of them are ' +
+      'elite raid gyms), its active raids, trains and meetups, and what is wrong with it: no ' +
+      'outline, a channel or a forum that is gone, no forum yet. Below that: how many gyms ' +
+      'lie in no region of any server, and the forums whose region is gone. A region whose ' +
+      'channel is gone stays until you remove it with `/region remove`.',
+    examples: ['/region list'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const staff = await regionStaff(interaction, ctx);
+    const channels = ctx.regionAdmin.channelsOf(staff);
+    const list = await ctx.regionAdmin.list(staff);
+    const lines =
+      list.regions.length === 0
+        ? ['This server has no regions yet. Give a channel its outline with `/region import`.']
+        : [
+            `**${count(list.regions.length, 'region')}**`,
+            ...list.regions.map((line) => regionLine(line, channels)),
+          ];
+    // Only a region whose channel exists can be given a forum.
+    const needsForums = list.regions.filter(
+      (line) => line.forum !== 'there' && line.channel === 'there',
+    ).length;
+    const closing = [
+      ...(needsForums > 0
+        ? [
+            needsForums === 1
+              ? '`/admin setup-forums` gives 1 region the forum it lacks.'
+              : `\`/admin setup-forums\` gives ${needsForums} regions the forum they lack.`,
+          ]
+        : []),
+      ...(list.unplacedGyms > 0
+        ? [
+            list.unplacedGyms === 1
+              ? '1 gym lies in no region of any server.'
+              : `${list.unplacedGyms} gyms lie in no region of any server.`,
+          ]
+        : []),
+      ...(list.orphanForums.length > 0
+        ? [
+            `Forums whose region is gone: ${fitItems(
+              list.orphanForums.map((id) => `<#${id}>`),
+              LIMITS.content - 200,
+            )}. They are kept as history; delete one by hand if it is not wanted.`,
+          ]
+        : []),
+    ];
+    const [first = '', ...rest] = fitMessages([...lines, ...closing]);
+    await interaction.editReply({ content: first });
+    for (const more of rest) {
+      await interaction.followUp({ content: more, flags: MessageFlags.Ephemeral });
+    }
+  },
+};
diff --git a/src/commands/regions/region-option.ts b/src/commands/regions/region-option.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ec1cb5c002ff50d54ec3a16abbbf6e280aec487b
--- /dev/null
+++ b/src/commands/regions/region-option.ts
@@ -0,0 +1,150 @@
+import type {
+  AutocompleteInteraction,
+  ChatInputCommandInteraction,
+  SlashCommandSubcommandBuilder,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { Region } from '../../db/repositories/region-repository.js';
+import { UserError } from '../../discord/errors.js';
+import type { ServerChannel } from '../../domain/regions/region-import.js';
+import { plain, truncate } from '../../render/text.js';
+import type { RegionStaff } from '../../services/region-admin-service.js';
+import { beginningFirst, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
+import { regionHere, regionStaff } from './shared.js';
+
+/** The name of the option by which a subcommand of `/region` takes a region. */
+export const REGION_OPTION = 'region';
+
+/** A choice of the list: the row id of the region. */
+const CHOSEN = /^id:(\d{1,10})$/iu;
+/** A channel as Discord writes a mention of it, or its bare id. */
+const CHANNEL = /^(?:<#(\d{15,22})>|(\d{15,22}))$/u;
+
+/** Adds the `region` option to a subcommand: free text, with the server's regions while typing. */
+export function withRegionOption(
+  builder: SlashCommandSubcommandBuilder,
+  description: string,
+  required: boolean,
+): SlashCommandSubcommandBuilder {
+  return builder.addStringOption((option) =>
+    option
+      .setName(REGION_OPTION)
+      .setDescription(description)
+      .setRequired(required)
+      .setMaxLength(100)
+      .setAutocomplete(true),
+  );
+}
+
+/**
+ * A region as the list shows it: the name of its channel, or "deleted channel" with the id
+ * for a region whose channel is gone, so that such a region can still be picked.
+ */
+function shownName(region: Region, channels: readonly ServerChannel[]): string {
+  const channel = channels.find((one) => one.id === region.channelId);
+  return channel ? `#${channel.name}` : `deleted channel ${region.channelId}`;
+}
+
+/**
+ * Answers the list of the server's regions for the `region` option: those whose name has what
+ * was typed, the ones that begin with it first. Only the regions of the server the command is
+ * used in: another server's are neither offered nor accepted.
+ */
+export async function respondWithRegions(
+  interaction: AutocompleteInteraction,
+  ctx: AppContext,
+): Promise<void> {
+  await interaction.respond(await regionChoices(interaction, ctx));
+}
+
+/** The value of the choice "All regions" (`/region export`), which may also be typed. */
+export const ALL_REGIONS = 'all';
+
+/**
+ * `respondWithRegions` with "All regions" first, while what was typed may still be the
+ * beginning of it (`/region export`).
+ */
+export async function respondWithRegionsOrAll(
+  interaction: AutocompleteInteraction,
+  ctx: AppContext,
+): Promise<void> {
+  const typed = interaction.options.getFocused().trim().toLowerCase();
+  const all: Choice[] = 'all regions'.startsWith(typed)
+    ? [{ name: 'All regions', value: ALL_REGIONS }]
+    : [];
+  const choices = await regionChoices(interaction, ctx);
+  await interaction.respond([...all, ...choices].slice(0, MAX_CHOICES));
+}
+
+/** Whether the `region` option asks for all regions (the choice, or `all` typed). */
+export function allRegionsAsked(interaction: ChatInputCommandInteraction): boolean {
+  return interaction.options.getString(REGION_OPTION)?.trim().toLowerCase() === ALL_REGIONS;
+}
+
+async function regionChoices(
+  interaction: AutocompleteInteraction,
+  ctx: AppContext,
+): Promise<Choice[]> {
+  const staff = await regionStaff(interaction, ctx);
+  const channels = ctx.regionAdmin.channelsOf(staff);
+  const typed = interaction.options.getFocused().trim().toLowerCase().replace(/^#/u, '');
+  const choices: Choice[] = ctx.regionAdmin
+    .regionsOf(staff.guildId)
+    .map((region) => ({
+      name: truncate(shownName(region, channels), CHOICE_NAME),
+      value: `id:${region.id}`,
+    }))
+    .filter((choice) => choice.name.toLowerCase().includes(typed))
+    .sort((a, b) => beginningFirst(typed)({ name: a.name.slice(1) }, { name: b.name.slice(1) }))
+    .slice(0, MAX_CHOICES);
+  return choices;
+}
+
+/**
+ * The region the `region` option names, among the regions of this server: a choice of the list
+ * (`id:<n>`), a mention of its channel or the channel's id, or the channel's exact name (with
+ * or without `#`, without case). Without the option: the region of the channel the command is
+ * used in (`regionHere`), or undefined when that is none, which the caller answers. Throws a
+ * `UserError` for text that names no one region.
+ */
+export function chosenRegion(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  staff: RegionStaff,
+): Region | undefined {
+  const typed = interaction.options.getString(REGION_OPTION)?.trim() ?? '';
+  if (typed === '') return regionHere(interaction, ctx, staff.guildId);
+  const none = new UserError(
+    `"${plain(truncate(typed, 80))}" is no region of this server. Pick one from the list; ` +
+      '`/region list` shows them all.',
+  );
+  const chosen = CHOSEN.exec(typed);
+  if (chosen) {
+    const region = ctx.regionAdmin.regionOf(Number(chosen[1]), staff.guildId);
+    if (!region) throw none;
+    return region;
+  }
+  const own = ctx.regionAdmin.regionsOf(staff.guildId);
+  const mentioned = CHANNEL.exec(typed);
+  if (mentioned) {
+    const channelId = mentioned[1] ?? mentioned[2];
+    const region = own.find((one) => one.channelId === channelId);
+    if (!region) throw none;
+    return region;
+  }
+  const channels = ctx.regionAdmin.channelsOf(staff);
+  const wanted = typed.replace(/^#/u, '').toLowerCase();
+  const named = own.filter(
+    (region) =>
+      channels.find((channel) => channel.id === region.channelId)?.name.toLowerCase() === wanted,
+  );
+  const [region] = named;
+  if (!region) throw none;
+  if (named.length > 1) {
+    throw new UserError(
+      `Several regions of this server have a channel called "${plain(truncate(typed, 80))}". ` +
+        'Pick the one you mean from the list.',
+    );
+  }
+  return region;
+}
diff --git a/src/commands/regions/region.more.test.ts b/src/commands/regions/region.more.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..96e11a27cda0ee3ab73b05e17dc46946cff9fbfa
--- /dev/null
+++ b/src/commands/regions/region.more.test.ts
@@ -0,0 +1,72 @@
+import { describe, expect, it } from 'vitest';
+import { answerOf } from '../../../test/support/gym-commands.js';
+import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { SOUTH_CHANNEL } from '../../../test/support/region-admin.js';
+import { attachedText, regionCommandsWith } from '../../../test/support/region-commands.js';
+import { readKml } from '../../domain/geo/kml.js';
+
+const choices = (interaction: { respond: { mock: { calls: unknown[][] } } }) =>
+  interaction.respond.mock.calls[0]?.[0] as { name: string; value: string }[];
+
+describe('/region export: all regions, by name', () => {
+  it('offers all regions as the first choice, and takes "all" typed', async () => {
+    const made = await regionCommandsWith();
+    expect(choices(await made.typing('export', ''))[0]).toEqual({
+      name: 'All regions',
+      value: 'all',
+    });
+    expect(choices(await made.typing('export', 'al'))[0]).toEqual({
+      name: 'All regions',
+      value: 'all',
+    });
+    expect(choices(await made.typing('export', 'west'))).toEqual([
+      { name: '#west', value: 'id:1' },
+    ]);
+    // Of the other subcommands it is no choice.
+    expect(choices(await made.typing('remove', ''))[0]?.value).not.toBe('all');
+    // In the channel of a region, "all" still means all of them.
+    for (const typed of ['all', 'ALL']) {
+      const used = await made.use('export', { region: typed }, { channelId: WEST_CHANNEL });
+      const reading = readKml(attachedText(answerOf(used), 'regions.kml'));
+      expect(reading.ok && reading.areas.map((area) => area.name)).toEqual(['west', 'east']);
+    }
+  });
+
+  it('says how to give the outline of a region whose channel is gone to a channel', async () => {
+    const made = await regionCommandsWith();
+    made.gateway.gone.add(EAST_CHANNEL);
+    const used = await made.use('export', { region: 'id:2' });
+    expect(answerOf(used).content).toBe(
+      `The outline of the region of the deleted channel ${EAST_CHANNEL}. Its channel is gone: ` +
+        'to give the outline to another channel, use `/region import` with `channel:`.',
+    );
+  });
+});
+
+describe('/region list: what it counts', () => {
+  it('points to /admin setup-forums only for a region whose channel exists', async () => {
+    const made = await regionCommandsWith();
+    // East's forum is gone, and so is its channel: setting up a forum cannot help it.
+    made.gateway.gone.add(EAST_FORUM);
+    made.gateway.gone.add(EAST_CHANNEL);
+    made.regions.rows.splice(2, 1);
+    const used = await made.use('list');
+    expect(answerOf(used).content).not.toContain('/admin setup-forums');
+    // A region whose channel exists and that has no forum is helped by it.
+    const other = await regionCommandsWith();
+    expect(answerOf(await other.use('list')).content).toContain(
+      '`/admin setup-forums` gives 1 region the forum it lacks.',
+    );
+  });
+});
+
+describe('/bounds elsewhere', () => {
+  it('says what to do outside a region', async () => {
+    const made = await regionCommandsWith();
+    const used = await made.run('bounds', { channelId: SOUTH_CHANNEL });
+    expect(answerOf(used).content).toBe(
+      'This channel is not a region. Use /bounds in the channel of a region, in its forum or ' +
+        'in a post there.',
+    );
+  });
+});
diff --git a/src/commands/regions/region.test.ts b/src/commands/regions/region.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..430d2666ac03550a0b7d0a255cc54333110ade42
--- /dev/null
+++ b/src/commands/regions/region.test.ts
@@ -0,0 +1,362 @@
+import { MessageFlags } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { answerOf, embedOf } from '../../../test/support/gym-commands.js';
+import { withOtherServer } from '../../../test/support/gym-admin.js';
+import {
+  EAST_CHANNEL,
+  EAST_FORUM,
+  UNBOUNDED_CHANNEL,
+  WEST_CHANNEL,
+  WEST_FORUM,
+} from '../../../test/support/gyms.js';
+import { testRaid } from '../../../test/support/parties.js';
+import {
+  kmlArea,
+  REGION_STAFF,
+  SOUTH_CHANNEL,
+  SOUTH_RING,
+  WEST_RING,
+} from '../../../test/support/region-admin.js';
+import {
+  attachedText,
+  MEMBER,
+  OTHER_SERVER,
+  regionCommandsWith,
+} from '../../../test/support/region-commands.js';
+import { readKml } from '../../domain/geo/kml.js';
+import type { Region } from '../../db/repositories/region-repository.js';
+import { bounds } from './bounds.js';
+import { region } from './index.js';
+
+const choices = (interaction: { respond: { mock: { calls: unknown[][] } } }) =>
+  interaction.respond.mock.calls[0]?.[0] as { name: string; value: string }[];
+
+const textOf = (interaction: Parameters<typeof answerOf>[0]): string =>
+  answerOf(interaction).content ?? '';
+
+/** Every text a command answered with, the follow-ups too, in order. */
+function allTexts(interaction: Awaited<ReturnType<typeof regionCommandsWith>>['staff'] & object) {
+  const fake = interaction as unknown as {
+    editReply: { mock: { calls: [{ content?: string }][] } };
+    followUp: { mock: { calls: [{ content?: string }][] } };
+  };
+  return [...fake.editReply.mock.calls, ...fake.followUp.mock.calls].map(
+    ([payload]) => payload.content ?? '',
+  );
+}
+
+describe('/region: who may use it', () => {
+  it('is shown to staff only, tied to no channel, and has its subcommands', () => {
+    const json = region.data.toJSON();
+    expect(json.default_member_permissions).toBe('32');
+    expect(region.guards).toHaveLength(1);
+    expect([...region.subcommands.keys()]).toEqual(['list', 'export']);
+  });
+
+  it('refuses a member who is not staff, whatever Discord let through', async () => {
+    const made = await regionCommandsWith();
+    const used = await made.use('list', {}, { userId: MEMBER, roleNames: [] });
+    expect(used.reply).toHaveBeenCalledWith({
+      content: 'Only admins, moderators and bot developers can do that.',
+      flags: MessageFlags.Ephemeral,
+    });
+    const typed = await made.typing('export', 'w', { userId: MEMBER, roleNames: [] });
+    expect(choices(typed)).toEqual([]);
+  });
+});
+
+describe('/region: the region option', () => {
+  it('offers the regions of this server by the names of their channels', async () => {
+    const made = await regionCommandsWith();
+    await withOtherServer(made);
+    expect(choices(await made.typing('export', ''))).toEqual([
+      { name: 'All regions', value: 'all' },
+      { name: '#east', value: 'id:2' },
+      { name: '#unbounded', value: 'id:3' },
+      { name: '#west', value: 'id:1' },
+    ]);
+    expect(choices(await made.typing('export', 'ES'))).toEqual([{ name: '#west', value: 'id:1' }]);
+    expect(choices(await made.typing('export', '#un'))).toEqual([
+      { name: '#unbounded', value: 'id:3' },
+    ]);
+    // The other server is offered its own region only.
+    made.gateway.addChannel('100000000000000004', 'north', { guildId: OTHER_SERVER.guildId ?? '' });
+    expect(choices(await made.typing('export', '', OTHER_SERVER))).toEqual([
+      { name: 'All regions', value: 'all' },
+      { name: '#north', value: 'id:4' },
+    ]);
+  });
+
+  it('offers a region whose channel is gone as a deleted channel, so that it can be picked', async () => {
+    const made = await regionCommandsWith();
+    made.gateway.gone.add(EAST_CHANNEL);
+    expect(choices(await made.typing('export', 'deleted'))).toEqual([
+      { name: `deleted channel ${EAST_CHANNEL}`, value: 'id:2' },
+    ]);
+  });
+
+  it.each([
+    ['a choice of the list', 'id:2'],
+    ['a mention of its channel', `<#${EAST_CHANNEL}>`],
+    ['the id of its channel', EAST_CHANNEL],
+    ['the name of its channel', 'east'],
+    ['the name with its sign, in any case', '#EAST'],
+  ])('takes %s', async (_what, typed) => {
+    const made = await regionCommandsWith();
+    const used = await made.use('export', { region: typed });
+    expect(textOf(used)).toBe(`The outline of <#${EAST_CHANNEL}>.`);
+  });
+
+  it('refuses what names no region of this server, and says where to look', async () => {
+    const made = await regionCommandsWith();
+    await withOtherServer(made);
+    for (const typed of [
+      'id:99',
+      'id:4',
+      '<#100000000000000004>',
+      'nowhere',
+      'eas',
+      SOUTH_CHANNEL,
+    ]) {
+      const used = await made.use('export', { region: typed });
+      expect(textOf(used)).toContain('is no region of this server');
+      expect(textOf(used)).toContain('`/region list`');
+    }
+    // What is typed is shown as text, whatever it holds.
+    const used = await made.use('export', { region: '**@everyone**' });
+    expect(textOf(used)).toContain('"\\*\\*@');
+    expect(textOf(used)).not.toContain('@everyone');
+  });
+
+  it('takes the region of the channel, of its forum or of a post in it when none is named', async () => {
+    const made = await regionCommandsWith();
+    expect(textOf(await made.use('export', {}, { channelId: EAST_CHANNEL }))).toBe(
+      `The outline of <#${EAST_CHANNEL}>.`,
+    );
+    expect(textOf(await made.use('export', {}, { channelId: EAST_FORUM }))).toBe(
+      `The outline of <#${EAST_CHANNEL}>.`,
+    );
+    const inPost = await made.use(
+      'export',
+      {},
+      { channelId: '900000000000009999', thread: { parentId: WEST_FORUM } },
+    );
+    expect(textOf(inPost)).toBe(`The outline of <#${WEST_CHANNEL}>.`);
+  });
+});
+
+describe('/region list', () => {
+  it('lists every region with its gyms, its parties and what is wrong with it', async () => {
+    const made = await regionCommandsWith([
+      { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: '900000000000001234' },
+    ]);
+    await made.admin.setElite(2, true, REGION_STAFF.staffId);
+    made.gateway.gone.add(EAST_FORUM);
+    const used = await made.use('list');
+    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(textOf(used).split('\n')).toEqual([
+      '**3 regions**',
+      `- <#${WEST_CHANNEL}> · 8 gyms (1 elite raid gym) · 1 active raid, train or meetup`,
+      `- <#${EAST_CHANNEL}> · 3 gyms · **its forum is gone**`,
+      `- <#${UNBOUNDED_CHANNEL}> · 0 gyms · **no outline, no forum yet**`,
+      '`/admin setup-forums` gives 2 regions the forum they lack.',
+      '1 gym lies in no region of any server.',
+    ]);
+  });
+
+  it('names a region whose channel is gone by the id of the channel', async () => {
+    const made = await regionCommandsWith();
+    made.gateway.gone.add(WEST_CHANNEL);
+    const used = await made.use('list');
+    expect(textOf(used)).toContain(
+      `- deleted channel ${WEST_CHANNEL} · 8 gyms · **its channel is gone**`,
+    );
+  });
+
+  it('names the forums whose region is gone', async () => {
+    const made = await regionCommandsWith([
+      { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: '900000000000001234' },
+    ]);
+    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
+    await made.settle();
+    const used = await made.use('list');
+    expect(textOf(used)).toContain(
+      `Forums whose region is gone: <#${WEST_FORUM}>. They are kept as history`,
+    );
+    expect(textOf(used)).toContain('**2 regions**');
+  });
+
+  it('says so when the server has no regions', async () => {
+    const made = await regionCommandsWith();
+    const used = await made.use('list', {}, OTHER_SERVER);
+    expect(textOf(used)).toContain('This server has no regions yet.');
+  });
+
+  it('fits Discord’s limits with sixty regions', async () => {
+    const made = await regionCommandsWith();
+    for (let i = 0; i < 57; i++) {
+      const channelId = `10000000000000${String(1000 + i)}`;
+      made.gateway.addChannel(channelId, `a-rather-long-region-channel-name-number-${i}`);
+      made.regions.rows.push({
+        id: 100 + i,
+        guildId: 1,
+        channelId,
+        description: null,
+        bounds: null,
+        forumChannelId: null,
+        summaryMessageId: null,
+      } satisfies Region);
+    }
+    await made.directory.load();
+    const used = await made.use('list');
+    const texts = allTexts(used as never);
+    expect(texts.length).toBeGreaterThan(1);
+    for (const text of texts) expect(text.length).toBeLessThanOrEqual(2000);
+    const lines = texts.join('\n').split('\n');
+    expect(lines[0]).toBe('**60 regions**');
+    expect(lines.filter((line) => line.startsWith('- '))).toHaveLength(60);
+    // Every further message is for the staff member alone too.
+    for (const [payload] of used.followUp.mock.calls) {
+      expect(payload.flags).toBe(MessageFlags.Ephemeral);
+    }
+  });
+});
+
+describe('/region export', () => {
+  it('attaches the outline of one region as a file that reads back to it', async () => {
+    const made = await regionCommandsWith();
+    const used = await made.use('export', { region: 'id:1' });
+    const reading = readKml(attachedText(answerOf(used), 'west.kml'));
+    expect(reading).toMatchObject({
+      ok: true,
+      areas: [{ name: 'west', description: 'Town', outline: WEST_RING, holes: false }],
+    });
+  });
+
+  it('says of a region without an outline that there is nothing to export', async () => {
+    const made = await regionCommandsWith();
+    const used = await made.use('export', { region: 'id:3' });
+    expect(textOf(used)).toBe(
+      `<#${UNBOUNDED_CHANNEL}> has no outline yet, so there is nothing to export.`,
+    );
+    expect(answerOf(used).files ?? []).toEqual([]);
+  });
+
+  it('gives all regions of the server in one file outside a region, which imports again as it is', async () => {
+    const made = await regionCommandsWith();
+    const used = await made.use('export', {}, { channelId: SOUTH_CHANNEL });
+    expect(textOf(used)).toBe(
+      'The outlines of 2 regions of this server. 1 region without an outline or without a ' +
+        'channel is left out (`/region list` shows which).',
+    );
+    const reading = readKml(attachedText(answerOf(used), 'regions.kml'));
+    if (!reading.ok) throw new Error(reading.reason);
+    expect(reading.areas.map((area) => [area.name, area.description])).toEqual([
+      ['west', 'Town'],
+      ['east', 'Town'],
+    ]);
+    const preview = made.regionAdmin.preview(REGION_STAFF, reading.areas);
+    expect(preview.imports.map((one) => [one.regionId, one.gyms, one.gymsBefore])).toEqual([
+      [1, 8, 8],
+      [2, 3, 3],
+    ]);
+    expect(preview.leftOut).toEqual([]);
+    expect(preview.newChannels).toEqual([]);
+  });
+
+  it('exports an outline that was imported, corner for corner', async () => {
+    const made = await regionCommandsWith();
+    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('South', SOUTH_RING)]);
+    await made.regionAdmin.import(REGION_STAFF, preview.imports);
+    const used = await made.use('export', { region: 'south' });
+    const reading = readKml(attachedText(answerOf(used), 'south.kml'));
+    expect(reading).toMatchObject({ ok: true, areas: [{ name: 'south', outline: SOUTH_RING }] });
+  });
+
+  it('says so when the server has nothing to export', async () => {
+    const made = await regionCommandsWith();
+    const used = await made.use('export', {}, OTHER_SERVER);
+    expect(textOf(used)).toBe('This server has no regions yet.');
+  });
+});
+
+describe('/bounds', () => {
+  it('is a command for every member, in servers', () => {
+    const json = bounds.data.toJSON();
+    expect(json.default_member_permissions).toBeUndefined();
+    expect(json.options ?? []).toEqual([]);
+    expect(bounds.help.category).toBe('util');
+    expect(bounds.throttle).toEqual({ uses: 5, perSeconds: 60 });
+  });
+
+  it('shows a member the area of the region they are in, for them alone', async () => {
+    const made = await regionCommandsWith([], {
+      maps: {
+        enabled: true,
+        gym: () => Promise.resolve(undefined),
+        region: (asked) => Promise.resolve(`var/images/regions/${asked.id}-abc.png`),
+        clear: () => Promise.resolve(0),
+      },
+    });
+    const used = await made.run('bounds', { userId: MEMBER, roleNames: [] });
+    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    const answer = answerOf(used);
+    expect(embedOf(answer)).toEqual({
+      title: 'This channel covers the following area',
+      description: `<#${WEST_CHANNEL}>\nThere are 8 gyms within this region.`,
+      image: { url: 'attachment://1-abc.png' },
+    });
+    expect(answer.files).toEqual(['var/images/regions/1-abc.png']);
+    expect(answer.content).toBeUndefined();
+  });
+
+  it('answers without a picture when there is none, or the picture fails', async () => {
+    const made = await regionCommandsWith();
+    const used = await made.run('bounds', { userId: MEMBER, roleNames: [], channelId: EAST_FORUM });
+    expect(embedOf(answerOf(used))).toEqual({
+      title: 'This channel covers the following area',
+      description: `<#${EAST_CHANNEL}>\nThere are 3 gyms within this region.`,
+    });
+    expect(answerOf(used).files).toEqual([]);
+
+    const failing = await regionCommandsWith([], {
+      maps: {
+        enabled: true,
+        gym: () => Promise.resolve(undefined),
+        region: () => Promise.reject(new Error('disk full')),
+        clear: () => Promise.resolve(0),
+      },
+    });
+    const again = await failing.run('bounds', { userId: MEMBER, roleNames: [] });
+    expect(embedOf(answerOf(again)).image).toBeUndefined();
+  });
+
+  it('works in a post of the region’s forum', async () => {
+    const made = await regionCommandsWith();
+    const used = await made.run('bounds', {
+      userId: MEMBER,
+      roleNames: [],
+      channelId: '900000000000009999',
+      thread: { parentId: WEST_FORUM },
+    });
+    expect(embedOf(answerOf(used)).description).toContain(`<#${WEST_CHANNEL}>`);
+  });
+
+  it('says where there is no region: elsewhere, and in a region without an outline', async () => {
+    const made = await regionCommandsWith();
+    for (const channelId of [SOUTH_CHANNEL, UNBOUNDED_CHANNEL]) {
+      const used = await made.run('bounds', { userId: MEMBER, roleNames: [], channelId });
+      expect(textOf(used)).toBe(
+        'This channel is not a region. Use /bounds in the channel of a region, in its forum or ' +
+          'in a post there.',
+      );
+    }
+  });
+
+  it('words the number of gyms as the legacy bot did', async () => {
+    const { gymCountSentence } = await import('./bounds.js');
+    expect(gymCountSentence(0)).toBe('There are currently no gyms within this region.');
+    expect(gymCountSentence(1)).toBe('There is 1 gym within this region.');
+    expect(gymCountSentence(12)).toBe('There are 12 gyms within this region.');
+  });
+});
diff --git a/src/commands/regions/shared.ts b/src/commands/regions/shared.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2d26c1298ac9c60ea69607f71da3376c96709f01
--- /dev/null
+++ b/src/commands/regions/shared.ts
@@ -0,0 +1,149 @@
+import { ButtonBuilder, type ButtonInteraction, type ButtonStyle } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import { BoundedMap } from '../../bounded-map.js';
+import type { Region } from '../../db/repositories/region-repository.js';
+import { channelContext } from '../../discord/channel-context.js';
+import type { LocatedInteraction } from '../../discord/command.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
+import { UserError } from '../../discord/errors.js';
+import { guildIdOf } from '../../discord/guards.js';
+import type { PlannedImport, ServerChannel } from '../../domain/regions/region-import.js';
+import { LIMITS, truncate } from '../../render/text.js';
+import { PendingRequests } from '../../services/pending-requests.js';
+import type { RegionStaff } from '../../services/region-admin-service.js';
+
+/** The custom-id kind of the controls of `/region` (documented in `custom-id.ts`). */
+export const REGION_KIND = 'region';
+
+/** What a question of `/region` waits with until the staff member answers. */
+export type PendingRegion =
+  /** `/region import`: what the preview said would be imported, as it was planned. */
+  | { what: 'import'; imports: readonly PlannedImport[] }
+  /** `/region remove`: the region. */
+  | { what: 'remove'; regionId: number };
+
+/**
+ * How long a question of `/region` can be answered. A preview is looked through before it is
+ * confirmed, but what it says goes stale: half an hour. The requests are few (an import holds
+ * its outlines), so their number is bounded tightly.
+ */
+export const PENDING_MINUTES = 30;
+
+/** The questions of `/region` that wait for their answer, by the token of their controls. */
+export const pendingRegions = new PendingRequests<PendingRegion>({
+  ttlMs: PENDING_MINUTES * 60_000,
+  max: 50,
+});
+
+/**
+ * The tokens of the questions that were answered a while ago: a second press on a button of
+ * such a question is only acknowledged, so that it does not write "That has expired" over the
+ * answer the first press is showing.
+ */
+const answered = new BoundedMap<string, true>(200);
+
+export function markAnswered(token: string): void {
+  answered.set(token, true);
+}
+
+export function wasAnswered(token: string): boolean {
+  return answered.has(token);
+}
+
+/** What runs for a button of a question, by what the question is about and the button. */
+export type ButtonAnswer = (
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  request: PendingRegion,
+) => Promise<void>;
+
+export const EXPIRED = 'That has expired. Use the command again.';
+export const NOT_YOURS = 'That is somebody else’s question.';
+/** Also what is said of a region of another server: for this server's staff it is none. */
+export const REGION_GONE = 'That region no longer exists.';
+
+/** A button of a question of `/region`: `region:<token>:<action>`. */
+export function button(
+  token: string,
+  action: string,
+  label: string,
+  style: ButtonStyle,
+): ButtonBuilder {
+  return new ButtonBuilder()
+    .setCustomId(encodeCustomId({ kind: REGION_KIND, id: token, action }))
+    .setLabel(label)
+    .setStyle(style);
+}
+
+/**
+ * Who the staff member is and whose regions they touch (`RegionStaff`): the row of their
+ * server, and its snowflake. Refused for a server the bot has no row of yet.
+ */
+export async function regionStaff(
+  interaction: LocatedInteraction,
+  ctx: AppContext,
+): Promise<RegionStaff> {
+  const server = guildIdOf(interaction);
+  const guildId = await ctx.guilds.idFor(server);
+  if (guildId === undefined) {
+    throw new UserError('I do not know this server yet. Try again in a moment.');
+  }
+  return { staffId: interaction.user.id, guildId, server };
+}
+
+/**
+ * The region an interaction happened in, of this server: its text channel or a thread in it,
+ * or its forum or a post in it. Also a region that has no outline yet (which `regionChannelOf`
+ * does not count as one). Undefined anywhere else.
+ */
+export function regionHere(
+  interaction: LocatedInteraction,
+  ctx: AppContext,
+  guildId: number,
+): Region | undefined {
+  const { baseChannelId } = channelContext(interaction);
+  if (baseChannelId === undefined) return undefined;
+  const region = ctx.regions.byChannel(baseChannelId) ?? ctx.regions.byForum(baseChannelId);
+  return region?.guildId === guildId ? region : undefined;
+}
+
+/**
+ * A region as an answer names it: its channel as a mention, or, when the channel is gone,
+ * "deleted channel" with its id (a mention of a channel that is gone shows as nothing).
+ */
+export function regionLabel(region: Region, channels: readonly ServerChannel[]): string {
+  return channels.some((channel) => channel.id === region.channelId)
+    ? `<#${region.channelId}>`
+    : `deleted channel ${region.channelId}`;
+}
+
+/**
+ * A region as a sentence names it: "the region <#…>", or "the region of the deleted channel
+ * 1234" when its channel is gone.
+ */
+export function regionInSentence(region: Region, channels: readonly ServerChannel[]): string {
+  return channels.some((channel) => channel.id === region.channelId)
+    ? `the region <#${region.channelId}>`
+    : `the region of the deleted channel ${region.channelId}`;
+}
+
+/** Lines as the text of one message: never longer than Discord takes. */
+export function content(lines: readonly (string | undefined)[]): string {
+  return truncate(
+    lines.filter((line): line is string => line !== undefined).join('\n'),
+    LIMITS.content,
+  );
+}
+
+/**
+ * What staff are reminded of after a region was made or removed, where members give themselves
+ * roles: a region usually has a role of its own. Undefined where that feature is off.
+ */
+export function selfRoleReminder(ctx: AppContext, what: 'new' | 'removed'): string | undefined {
+  if (!ctx.config.settings.features.roles) return undefined;
+  return what === 'new'
+    ? 'If members give themselves a role for a region, add the role of a new region with ' +
+        '`/admin self-roles add`.'
+    : 'If members gave themselves a role for this region, take it off the list with ' +
+        '`/admin self-roles remove`.';
+}
diff --git a/src/components/index.ts b/src/components/index.ts
index d630b1a380559586c5f0e25ced2ab50f504ca0ad..c22f45d562f86a34e6ad2477a9414c28f323841a 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -1,4 +1,5 @@
 import { gymControls } from '../commands/gyms/controls.js';
+import { regionControls } from '../commands/regions/controls.js';
 import { infoControls } from '../commands/meetups/info.js';
 import { targetControls, targetRemovalControls } from '../commands/notifications/targets.js';
 import { wantControls } from '../commands/notifications/wants.js';
@@ -21,4 +22,5 @@ export const components: readonly ComponentHandler[] = [
   dmControls,
   roleControls,
   gymControls,
+  regionControls,
 ];
diff --git a/src/services/region-admin-service.ts b/src/services/region-admin-service.ts
index 973cb2107c762271876c5e4ddab60e379968ae73..6e52460889d590dce9498ad7d0c60417bfbf0846 100644
--- a/src/services/region-admin-service.ts
+++ b/src/services/region-admin-service.ts
@@ -236,7 +236,7 @@ export class RegionAdminService {
   }
 
   /** The channels of the staff member's server; none when the bot does not know the server. */
-  private channelsOf(staff: Pick<RegionStaff, 'server'>): ServerChannel[] {
+  channelsOf(staff: Pick<RegionStaff, 'server'>): ServerChannel[] {
     return this.options.gateway.serverChannels(staff.server) ?? [];
   }
 
diff --git a/test/support/fake-interactions.test.ts b/test/support/fake-interactions.test.ts
index 4669c4ff522f13b2dbf6798e18ca27043985d1d3..06900b677dc2e9be8a5901db4ca6277da528b925 100644
--- a/test/support/fake-interactions.test.ts
+++ b/test/support/fake-interactions.test.ts
@@ -273,3 +273,26 @@ describe('the message a control is on', () => {
     await expect(fakeButton({ customId: 'a:1:x' }).fetchReply()).rejects.toThrow();
   });
 });
+
+describe('the files of the message a control is on', () => {
+  it('are kept by an edit unless it says which stay, as in Discord', async () => {
+    const kept = fakeButton({ customId: 'a:1:x', message: fakeMessage([], undefined, '', ['f1']) });
+    await kept.update({ content: 'changed' });
+    expect((await kept.fetchReply()).attachments).toEqual(['f1']);
+
+    const cleared = fakeButton({
+      customId: 'a:1:x',
+      message: fakeMessage([], undefined, '', ['f1']),
+    });
+    await cleared.update({ content: 'changed', attachments: [] });
+    expect((await cleared.fetchReply()).attachments).toEqual([]);
+
+    const added = fakeButton({
+      customId: 'a:1:x',
+      message: fakeMessage([], undefined, '', ['f1']),
+    });
+    await added.deferUpdate();
+    await added.editReply({ content: 'changed', files: ['f2'] });
+    expect((await added.fetchReply()).attachments).toEqual(['f1', 'f2']);
+  });
+});
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index bcb639ab7d47e9c42b2ab88d0258d4db90a95069..aa6e928d46f108399278c2d409cda84d9f723ff2 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -8,6 +8,8 @@ export interface SentPayload {
   embeds?: ReadonlyArray<{ toJSON(): APIEmbed }>;
   components?: readonly unknown[];
   files?: readonly unknown[];
+  /** The files of the message that stay (an edit without it keeps them all). */
+  attachments?: readonly unknown[];
 }
 
 type OptionValue = string | number | boolean | null;
@@ -116,6 +118,12 @@ export interface FakeMessage {
   rows: readonly FakeRow[];
   /** Its text: `interaction.message.content`. */
   content: string;
+  /**
+   * The files attached to it: `interaction.message.attachments`. As in Discord, an edit
+   * (`update`, or `editReply` after `deferUpdate`) keeps them unless it says which stay
+   * (`attachments`), and adds its own `files`.
+   */
+  files?: readonly unknown[];
 }
 
 export const FAKE_MESSAGE_ID = '950000000000000001';
@@ -128,8 +136,9 @@ export function fakeMessage(
   rows: readonly FakeRow[],
   id = FAKE_MESSAGE_ID,
   content = '',
+  files: readonly unknown[] = [],
 ): FakeMessage {
-  return { id, rows, content };
+  return { id, rows, content, files };
 }
 
 type Kind = 'chat' | 'autocomplete' | 'button' | 'select' | 'modal';
@@ -217,9 +226,14 @@ function base(kind: Kind, o: FakeOptions) {
 
   /** The message a control is on; shared by the presses a test makes on one message. */
   const shown: FakeMessage = o.message ?? fakeMessage(o.messageRows ?? []);
+  /** What an edit of the message does to its files (see `FakeMessage.files`). */
+  const editFiles = (payload: SentPayload): void => {
+    shown.files = [...(payload.attachments ?? shown.files ?? []), ...(payload.files ?? [])];
+  };
   const shownMessage = () => ({
     id: shown.id,
     content: shown.content,
+    attachments: shown.files ?? [],
     components: shown.rows.map((row) => ({ type: row.type, toJSON: () => row })),
   });
   /** Whether the interaction was acknowledged with `deferUpdate`. */
@@ -345,6 +359,7 @@ function base(kind: Kind, o: FakeOptions) {
       interaction.replied = true;
       // After `deferUpdate` the reply is the message the control is on.
       if (updating && payload.content !== undefined) shown.content = payload.content;
+      if (updating) editFiles(payload);
       if (updating && payload.components !== undefined) {
         shown.rows = payload.components.map((row) =>
           typeof (row as { toJSON?: unknown }).toJSON === 'function'
@@ -379,10 +394,11 @@ function base(kind: Kind, o: FakeOptions) {
       updating = true;
       return Promise.resolve();
     }),
-    update: vi.fn((_payload: SentPayload) => {
+    update: vi.fn((payload: SentPayload) => {
       const refused = refuseIfAcknowledged();
       if (refused) return refused;
       interaction.replied = true;
+      editFiles(payload);
       return Promise.resolve();
     }),
     showModal: vi.fn((_modal: unknown) => {
diff --git a/test/support/region-commands.ts b/test/support/region-commands.ts
new file mode 100644
index 0000000000000000000000000000000000000000..658ebfe451b9c9eb4819b4f32d80e144a30bbdbf
--- /dev/null
+++ b/test/support/region-commands.ts
@@ -0,0 +1,138 @@
+import { admin } from '../../src/commands/admin/index.js';
+import { bounds } from '../../src/commands/regions/bounds.js';
+import { regionControls } from '../../src/commands/regions/controls.js';
+import { region } from '../../src/commands/regions/index.js';
+import { pendingRegions } from '../../src/commands/regions/shared.js';
+import { InteractionRouter } from '../../src/discord/router.js';
+import type { Party } from '../../src/domain/party/party.js';
+import type { MapProvider } from '../../src/services/static-maps.js';
+import { FakeAttachments } from './attachments.js';
+import {
+  fakeAutocomplete,
+  fakeButton,
+  fakeChatInput,
+  type FakeInteraction,
+  type FakeOptions,
+} from './fake-interactions.js';
+import { OTHER_STAFF } from './gym-admin.js';
+import { MEMBER, MODERATOR } from './gym-commands.js';
+import { NORTH_CHANNEL, OTHER_GUILD_ID, OTHER_GUILD_ROW, WEST_CHANNEL } from './gyms.js';
+import { regionAdminWith } from './region-admin.js';
+import { createTestContext } from './test-context.js';
+
+export { MEMBER, MODERATOR };
+
+/** A moderator of the second server, in the channel of its region North. */
+export const OTHER_SERVER: FakeOptions = {
+  userId: OTHER_STAFF,
+  displayName: 'Noor',
+  guildId: OTHER_GUILD_ID,
+  channelId: NORTH_CHANNEL,
+};
+
+/** The text of a file that an answer attached, by its name. */
+export function attachedText(payload: { files?: readonly unknown[] }, name: string): string {
+  for (const file of payload.files ?? []) {
+    const one = file as { name?: string; attachment?: unknown };
+    if (one.name === name && Buffer.isBuffer(one.attachment)) {
+      return one.attachment.toString('utf8');
+    }
+  }
+  throw new Error(`no file "${name}" among ${JSON.stringify(payload.files)}`);
+}
+
+/**
+ * `/region`, `/bounds` and `/admin` over the fakes of `regionAdminWith`, routed like in the
+ * bot, used by a moderator in the channel of West unless a call says otherwise. `use` runs a
+ * subcommand of `/region`, `typing` asks for the list of its `region` option, `press` presses
+ * a button; each goes through the router and answers the fake interaction to read back.
+ * `file` puts a file where an attachment option finds it (`attachments`).
+ */
+export async function regionCommandsWith(
+  parties: readonly Party[] = [],
+  overrides: { maps?: MapProvider } = {},
+) {
+  const made = await regionAdminWith(parties);
+  const attachments = new FakeAttachments();
+  const { ctx, entries } = createTestContext({
+    // The two servers of the fakes: the usual one (row 1) and the second (row 2).
+    guilds: {
+      idFor: (snowflake) =>
+        Promise.resolve(
+          snowflake === made.gateway.guildId
+            ? 1
+            : snowflake === OTHER_GUILD_ID
+              ? OTHER_GUILD_ROW
+              : undefined,
+        ),
+    },
+    regionAdmin: made.regionAdmin,
+    gymAdmin: made.admin,
+    gyms: made.directory,
+    regions: made.regions,
+    parties: made.store,
+    partyService: made.service,
+    attendance: made.attendance,
+    raids: made.raids,
+    trains: made.trains,
+    attachments,
+    ...(overrides.maps ? { maps: overrides.maps } : {}),
+  });
+  const router = new InteractionRouter(ctx, [region, bounds, admin], [regionControls]);
+  const staff: FakeOptions = {
+    userId: MODERATOR,
+    roleNames: ['Moderator'],
+    displayName: 'Morgan',
+    channelId: WEST_CHANNEL,
+    guildId: made.gateway.guildId,
+  };
+  const handled = async (interaction: FakeInteraction): Promise<FakeInteraction> => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  return {
+    ...made,
+    ctx,
+    logged: entries,
+    router,
+    attachments,
+    staff,
+    /** An attachment as an option resolves it: a file of this name with this content. */
+    file: (name: string, fileContent: Uint8Array | string, size?: number) => {
+      const url = attachments.add(name, fileContent);
+      const length =
+        typeof fileContent === 'string' ? Buffer.byteLength(fileContent) : fileContent.byteLength;
+      return { name, url, size: size ?? length };
+    },
+    use: (
+      subcommand: string,
+      options: Record<string, string | boolean> = {},
+      extra: FakeOptions = {},
+    ) => handled(fakeChatInput({ commandName: 'region', subcommand, options, ...staff, ...extra })),
+    /** Runs a command that has no subcommands (`/bounds`). */
+    run: (commandName: string, extra: FakeOptions = {}) =>
+      handled(fakeChatInput({ commandName, ...staff, ...extra })),
+    typing: (subcommand: string, focused: string, extra: FakeOptions = {}) =>
+      handled(
+        fakeAutocomplete({
+          commandName: 'region',
+          subcommand,
+          focused,
+          focusedName: 'region',
+          ...staff,
+          ...extra,
+        }),
+      ),
+    press: (customId: string, extra: FakeOptions = {}) =>
+      handled(fakeButton({ customId, ...staff, ...extra })),
+    /** Lets everything that is under way go out. */
+    settle: async () => {
+      await made.trains.flush();
+      await made.attendance.flush();
+      await made.access.flush();
+      await made.service.flush();
+    },
+    /** How many questions of `/region` wait for their answer, over all tests. */
+    pending: () => pendingRegions.size,
+  };
+}
````

---

### Task 5: Importing regions from a KML file, with a preview first

Prototype commit: `cea34fd154b76931860aee1f70dd2a38262dcf49`

The subcommand import of /region: the file is an attachment, downloaded
with a limit of 1 MB, read as KML, and nothing is changed before the
staff member has seen what would be done and pressed Import.

- Without a channel every area goes to the text channel its name stands
  for; for a name no channel has, the channel is created, in the
  category the area's description names. The preview names every
  channel and category it would create, and the button says how many
  ("Import and create 3 channels"). Where the bot may not create
  channels it says so and offers what needs none.
- With a channel the file gives that one channel its outline, and
  nothing is created.
- The preview says, area by area: the channel, new region or new
  outline, the gyms in it (and before), the gyms that would lie in no
  region of the server, holes that are ignored; then what is left out
  with the reason, and what the file holds that is no area. It fits
  Discord's limits with any file.
- A KMZ, bytes that are no text, XML that is no KML, a file without
  areas and a file that is too large each get their own sentence.
- On Import the service does it all at once (channels, outlines,
  forums) and the answer says what was done and what was not.


**Files:**

```
 src/commands/regions/controls.ts         |   3 +-
 src/commands/regions/import.more.test.ts | 304 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/regions/import.test.ts      | 509 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/regions/import.ts           | 616 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/regions/index.ts            |   3 +-
 src/commands/regions/region.test.ts      |   2 +-
 6 files changed, 1434 insertions(+), 3 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `Importing regions from a KML file, with a preview first`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/src/commands/regions/controls.ts b/src/commands/regions/controls.ts
index 4e8c212734813c55cdbbb6ff253b4c9043f1a12e..6c2505d4f4ff075efe1543264af6404d0cd1a7e3 100644
--- a/src/commands/regions/controls.ts
+++ b/src/commands/regions/controls.ts
@@ -3,6 +3,7 @@ import { UserError } from '../../discord/errors.js';
 import { requireBotManagement } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { count } from '../../render/text.js';
+import { importAnswers } from './import.js';
 import {
   EXPIRED,
   markAnswered,
@@ -34,7 +35,7 @@ function working(request: PendingRegion): string {
  * What the buttons of `/region` do, by what their request is about and their action
  * (`import:import`, `remove:keep`); each subcommand brings its own.
  */
-const ANSWERS: Readonly<Record<string, ButtonAnswer>> = {};
+const ANSWERS: Readonly<Record<string, ButtonAnswer>> = { ...importAnswers };
 
 /**
  * The buttons of `/region` (custom-id kind `region`): each belongs to a pending request of the
diff --git a/src/commands/regions/import.more.test.ts b/src/commands/regions/import.more.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..40bf525cd2fa6991b559cacc0d695229a0c982e5
--- /dev/null
+++ b/src/commands/regions/import.more.test.ts
@@ -0,0 +1,304 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { FakePartyGateway } from '../../../test/support/fake-gateway.js';
+import { fakeMessage, type SentPayload } from '../../../test/support/fake-interactions.js';
+import { answerOf, buttonId, buttonsOf, embedOf } from '../../../test/support/gym-commands.js';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
+import {
+  SOUTH_CHANNEL,
+  SOUTH_RING,
+  squareRing,
+  WEST_RING,
+} from '../../../test/support/region-admin.js';
+import { attachedText, regionCommandsWith } from '../../../test/support/region-commands.js';
+import { writeKml } from '../../domain/geo/kml.js';
+import type { LatLon } from '../../domain/geo/lat-lon.js';
+import { MAX_KML_CORNERS } from '../../domain/geo/kml.js';
+
+type Made = Awaited<ReturnType<typeof regionCommandsWith>>;
+
+const area = (name: string, outline: LatLon[], description: string | null = null) => ({
+  name,
+  description,
+  outline,
+});
+
+async function importing(
+  made: Made,
+  file: Parameters<typeof writeKml>[0] | string,
+  more: { channel?: string } = {},
+) {
+  const used = await made.use(
+    'import',
+    {},
+    {
+      resolved: {
+        file: made.file('regions.kml', typeof file === 'string' ? file : writeKml(file)),
+        ...(more.channel === undefined ? {} : { channel: { id: more.channel } }),
+      },
+    },
+  );
+  return { used, answer: answerOf(used) };
+}
+
+function embedText(embed: unknown): string {
+  const json = (
+    typeof (embed as { toJSON?: unknown }).toJSON === 'function'
+      ? (embed as { toJSON(): unknown }).toJSON()
+      : embed
+  ) as { title?: string; description?: string };
+  return `${json.title ?? ''}\n${json.description ?? ''}`;
+}
+
+function listed(answer: SentPayload, title: string): string[] {
+  for (const embed of answer.embeds ?? []) {
+    const text = embedText(embed);
+    if (text.startsWith(`${title}\n`)) return text.split('\n').slice(1);
+  }
+  throw new Error(`no embed "${title}"`);
+}
+
+const far = (i: number) => squareRing(41 + i * 0.01, -81, 41.005 + i * 0.01, -80.9);
+
+describe('/region import: the preview, as review B asked', () => {
+  it('names the forums it makes, and counts everything it creates on the button', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [
+      area('South', SOUTH_RING),
+      area('River Side', far(1), 'River Towns'),
+    ]);
+    expect(listed(answer, 'Would be imported')).toEqual([
+      '- River Side → **new channel** `#river-side` in the new category `River Towns` · 0 gyms · gets a forum',
+      `- South → <#${SOUTH_CHANNEL}> · new region · 0 gyms · gets a forum`,
+    ]);
+    expect(answer.content).toContain(
+      'I would **create 2 forums**, one for each region that has none.',
+    );
+    expect(buttonsOf(answer)[0]?.[0]).toBe('Import and create 1 channel, 1 category, 2 forums');
+  });
+
+  it('says on the button how many things it creates when the list is too long for it', async () => {
+    const made = await regionCommandsWith();
+    const areas = Array.from({ length: 30 }, (_unused, i) =>
+      area(`Place ${String.fromCharCode(97 + (i % 26))}${i}`, far(i), `Cat ${i}`),
+    );
+    const { answer } = await importing(made, areas);
+    // 30 channels, 30 categories and 30 forums: "Import and create 30 channels, 30 categories,
+    // 30 forums" would still fit; with more it would not. So both forms are checked.
+    const label = buttonsOf(answer)[0]?.[0] ?? '';
+    expect(label.length).toBeLessThanOrEqual(80);
+    expect(label).toBe('Import and create 30 channels, 30 categories, 30 forums');
+  });
+
+  it('flags a new channel whose name is close to another, and puts the risky lines first', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [
+      area('West', WEST_RING),
+      area('Eastt', far(1)),
+      area('Brand New', far(2)),
+    ]);
+    expect(listed(answer, 'Would be imported')).toEqual([
+      '- Eastt → **new channel** `#eastt` in the new category `Eastt` · 0 gyms · gets a forum · **did you mean `#east`?**',
+      '- Brand New → **new channel** `#brand-new` in the new category `Brand New` · 0 gyms · gets a forum',
+      `- West → <#${WEST_CHANNEL}> · outline unchanged · 8 gyms`,
+    ]);
+    expect(answer.content).toContain(
+      '**1 new channel has a name close to another**: is it a typo in the file?',
+    );
+  });
+
+  it('marks and counts outlines that stay as they are, and says that other regions stay', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [area('West', WEST_RING), area('South', SOUTH_RING)]);
+    expect((answer.content ?? '').split('\n').slice(0, 2)).toEqual([
+      'This file would give 1 new region and leave 1 outline as it is. Nothing is changed yet.',
+      'Regions that are not in this file stay as they are.',
+    ]);
+  });
+
+  it('says for one channel that no channel is created', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [area('x', SOUTH_RING)], { channel: SOUTH_CHANNEL });
+    expect(answer.content?.split('\n')[0]).toBe(
+      'This file would give 1 new region. Nothing is changed yet (no channel is created).',
+    );
+    expect(answer.content).not.toContain('Regions that are not in this file');
+  });
+
+  it('warns of a category that would hold more than Discord allows', async () => {
+    const made = await regionCommandsWith();
+    made.gateway.addChannel('k9', 'Full', { kind: 'category' });
+    for (let i = 0; i < 49; i++)
+      made.gateway.addChannel(`full${i}`, `full-${i}`, { categoryId: 'k9' });
+    const { answer } = await importing(made, [area('One More', far(1), 'Full')]);
+    expect(answer.content).toContain(
+      'The category `Full` would hold 51 channels and forums, and Discord allows 50: what is ' +
+        'more is refused. Put some of these areas into another category.',
+    );
+  });
+
+  it('attaches every line as a file when a list had to be cut', async () => {
+    const made = await regionCommandsWith();
+    const areas = Array.from({ length: 56 }, (_unused, i) =>
+      area(`A rather long name of a region number ${i} ${'x'.repeat(60)}`, far(i), 'Cat'),
+    );
+    const { answer } = await importing(made, areas);
+    expect(listed(answer, 'Would be imported').at(-1)).toMatch(/^…and \d+ more$/u);
+    const text = attachedText(answer, 'preview.txt');
+    expect(text.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(56);
+    expect(answer.content).toContain('Every line is in the attached file.');
+    // The file is for reading: channels by their names, no Markdown.
+    expect(text).not.toContain('**');
+    expect(text).not.toMatch(/<#\d+>/u);
+    const withWest = await importing(made, [area('West', WEST_RING), ...areas]);
+    const westLine = attachedText(withWest.answer, 'preview.txt')
+      .split('\n')
+      .find((line) => line.startsWith('- West'));
+    expect(westLine).toBe('- West → #west · outline unchanged · 8 gyms');
+    // A preview that fits has no file.
+    const small = await importing(made, [area('South', SOUTH_RING)]);
+    expect(small.answer.files ?? []).toEqual([]);
+  });
+
+  it('takes the file away with the preview, whatever is pressed', async () => {
+    const made = await regionCommandsWith();
+    const areas = Array.from({ length: 56 }, (_unused, i) =>
+      area(`A rather long name of a region number ${i} ${'x'.repeat(60)}`, far(i), 'Cat'),
+    );
+    for (const label of ['Cancel', 'Import']) {
+      const { answer } = await importing(made, areas);
+      const id =
+        label === 'Cancel' ? buttonId(answer, 'Cancel') : (buttonsOf(answer)[0]?.[1] ?? '');
+      const message = fakeMessage([], undefined, answer.content ?? '', answer.files ?? []);
+      const pressed = await made.press(id, { message });
+      expect((await pressed.fetchReply()).attachments).toEqual([]);
+    }
+    // An answer for an expired question takes it away too.
+    const { answer } = await importing(made, areas);
+    const expired = await made.press('region:0123456789abcdef:import', {
+      message: fakeMessage([], undefined, answer.content ?? '', answer.files ?? []),
+    });
+    expect((await expired.fetchReply()).attachments).toEqual([]);
+  });
+
+  it('fits Discord with a hostile file of 200 areas', async () => {
+    const made = await regionCommandsWith();
+    const hostile = [
+      '@everyone',
+      '<@123456789012345678>',
+      '**bold** __under__ `code`',
+      '[link](https://example.com)',
+      '# heading',
+      'x'.repeat(250),
+      '<#123456789012345678>',
+      '\u202Eevil',
+    ];
+    const areas = Array.from({ length: 200 }, (_unused, i) =>
+      area(
+        `${hostile[i % hostile.length] ?? ''} ${i}`,
+        far(i % 50),
+        hostile[(i + 3) % hostile.length] ?? null,
+      ),
+    );
+    const { answer } = await importing(made, areas);
+    expect(() => {
+      FakePartyGateway.checkMessage({
+        content: answer.content ?? '',
+        embeds: (answer.embeds ?? []).map((embed) => embedOf({ embeds: [embed] })),
+      });
+    }).not.toThrow();
+    expect(answer.content).not.toContain('@everyone');
+    expect(buttonsOf(answer).length).toBe(2);
+  });
+
+  it('refuses a file with too many corners in all, with a sentence', async () => {
+    const made = await regionCommandsWith();
+    const corners = MAX_KML_CORNERS / 4;
+    const ring = (lat: number) => {
+      const points = Array.from({ length: corners }, (_unused, i) => ({
+        lat: lat + 0.1 * Math.sin((2 * Math.PI * i) / corners),
+        lon: -80 + 0.1 * Math.cos((2 * Math.PI * i) / corners),
+      }));
+      return [...points, points[0] ?? { lat: 0, lon: 0 }];
+    };
+    const { answer } = await importing(
+      made,
+      Array.from({ length: 5 }, (_unused, i) => area(`R${i}`, ring(40 + i))),
+    );
+    expect(answer.content).toBe(
+      `The outlines of that file have more than ${MAX_KML_CORNERS} corners in all. Import ` +
+        'the regions in several files, or simplify the shapes.',
+    );
+  });
+});
+
+describe('/region import: pressing', () => {
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('shows at once that it is working, then what it did, forum-less regions first', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [
+      area('West', squareRing(40.0, -80.1, 40.1, -80.05)),
+      area('South', SOUTH_RING),
+      area('River Side', far(1)),
+    ]);
+    made.gateway.failing.set('createForum', new Error('Discord is down'));
+    const pressed = await made.press(
+      buttonId(answer, 'Import and create 1 channel, 1 category, 2 forums'),
+    );
+    expect(pressed.update).toHaveBeenCalledWith({
+      content: 'Importing 3 areas… this message changes when it is done.',
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+    const done = answerOf(pressed);
+    expect(done.content).toContain(
+      '2 of them have no forum, so nothing can be reported there yet:',
+    );
+    const lines = listed(done, 'Imported');
+    expect(lines[0]).toContain('**no forum**: something went wrong (see the log)');
+    expect(lines[1]).toContain('**no forum**: something went wrong (see the log)');
+    expect(lines[2]).toBe(`- <#${WEST_CHANNEL}> · new outline · 4 gyms`);
+  });
+
+  it('says when the regions could not be loaded again', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
+    made.directory.load = () => Promise.reject(new Error('connection lost'));
+    const done = answerOf(await made.press(buttonId(answer, 'Import and create 1 forum')));
+    expect(done.content).toContain(
+      'The outlines are stored, but I could not load them again: members see them after the ' +
+        'next restart.',
+    );
+  });
+
+  it('forgets a question after half an hour', async () => {
+    vi.useFakeTimers({ toFake: ['Date'] });
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
+    vi.setSystemTime(Date.now() + 31 * 60_000);
+    const pressed = await made.press(buttonId(answer, 'Import and create 1 forum'));
+    expect(pressed.update).toHaveBeenCalledWith({
+      content: 'That has expired. Use the command again.',
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+    expect(made.regions.byChannel(SOUTH_CHANNEL)).toBeUndefined();
+  });
+
+  it('forgets the oldest question when fifty more are waiting', async () => {
+    const made = await regionCommandsWith();
+    const first = await importing(made, [area('South', SOUTH_RING)]);
+    for (let i = 0; i < 50; i++) await importing(made, [area('South', SOUTH_RING)]);
+    const pressed = await made.press(buttonId(first.answer, 'Import and create 1 forum'));
+    expect(pressed.update).toHaveBeenCalledWith({
+      content: 'That has expired. Use the command again.',
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+  });
+});
diff --git a/src/commands/regions/import.test.ts b/src/commands/regions/import.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..69634cbb46905ba516880d51e9b76242bdfdfb78
--- /dev/null
+++ b/src/commands/regions/import.test.ts
@@ -0,0 +1,509 @@
+import { MessageFlags } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { FakePartyGateway } from '../../../test/support/fake-gateway.js';
+import { answerOf, buttonId, buttonsOf, embedOf } from '../../../test/support/gym-commands.js';
+import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
+import { testRaid } from '../../../test/support/parties.js';
+import {
+  SOUTH_CHANNEL,
+  SOUTH_RING,
+  squareRing,
+  TOWN_CATEGORY,
+  WEST_HALF_RING,
+  WEST_RING,
+} from '../../../test/support/region-admin.js';
+import { MEMBER, regionCommandsWith } from '../../../test/support/region-commands.js';
+import type { SentPayload } from '../../../test/support/fake-interactions.js';
+import { writeKml } from '../../domain/geo/kml.js';
+import type { LatLon } from '../../domain/geo/lat-lon.js';
+import { MAX_KML_BYTES } from './import.js';
+import { PENDING_MINUTES, pendingRegions } from './shared.js';
+
+type Made = Awaited<ReturnType<typeof regionCommandsWith>>;
+
+const area = (name: string, outline: LatLon[], description: string | null = null) => ({
+  name,
+  description,
+  outline,
+});
+
+/** Uses `/region import` with a file of these areas (or this text), and gives the answer. */
+async function importing(
+  made: Made,
+  file: Parameters<typeof writeKml>[0] | string | Uint8Array,
+  more: { channel?: string; name?: string; size?: number } = {},
+) {
+  const fileContent =
+    typeof file === 'string' || file instanceof Uint8Array ? file : writeKml(file);
+  const used = await made.use(
+    'import',
+    {},
+    {
+      resolved: {
+        file: made.file(more.name ?? 'regions.kml', fileContent, more.size),
+        ...(more.channel === undefined ? {} : { channel: { id: more.channel } }),
+      },
+    },
+  );
+  return { used, answer: answerOf(used) };
+}
+
+/** The custom id of the first button under an answer: Import, whatever it creates. */
+const importButton = (answer: SentPayload): string => buttonsOf(answer)[0]?.[1] ?? '';
+
+const texts = (answer: SentPayload): string =>
+  [answer.content ?? '', ...(answer.embeds ?? []).map((embed) => embedText(embed))].join('\n');
+
+function embedText(embed: unknown): string {
+  const json = (
+    typeof (embed as { toJSON?: unknown }).toJSON === 'function'
+      ? (embed as { toJSON(): unknown }).toJSON()
+      : embed
+  ) as { title?: string; description?: string };
+  return `${json.title ?? ''}\n${json.description ?? ''}`;
+}
+
+/** The embed of an answer with this title, as lines. */
+function listed(answer: SentPayload, title: string): string[] {
+  for (const embed of answer.embeds ?? []) {
+    const text = embedText(embed);
+    if (text.startsWith(`${title}\n`)) return text.split('\n').slice(1);
+  }
+  throw new Error(`no embed "${title}" in ${texts(answer)}`);
+}
+
+describe('/region import: the preview', () => {
+  it('shows what would be imported and changes nothing until Import is pressed', async () => {
+    const made = await regionCommandsWith([
+      // A raid at the Bridge (gym 4), which the new outline of West leaves outside.
+      { ...testRaid({ gymId: 4 }), forumChannelId: WEST_FORUM, forumPostId: '900000000000001234' },
+    ]);
+    const before = JSON.stringify(made.regions.rows);
+    const { used, answer } = await importing(made, [
+      area('West', WEST_HALF_RING),
+      area('South', SOUTH_RING),
+    ]);
+    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect((answer.content ?? '').split('\n')).toEqual([
+      'This file would give 1 new region and 1 new outline. Nothing is changed yet.',
+      'Regions that are not in this file stay as they are.',
+      'I would **create 1 forum**, one for each region that has none.',
+      '3 gyms would then lie in no region of this server any more: no raid can be reported there.',
+      '1 active raid is at a gym that would lie outside its region. It stays in its post.',
+    ]);
+    expect(listed(answer, 'Would be imported')).toEqual([
+      `- West → <#${WEST_CHANNEL}> · new outline · 5 gyms (8 before) · 3 gyms would lie in no region of this server any more`,
+      `- South → <#${SOUTH_CHANNEL}> · new region · 0 gyms · gets a forum`,
+    ]);
+    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
+      'Import and create 1 forum',
+      'Cancel',
+    ]);
+    expect(JSON.stringify(made.regions.rows)).toBe(before);
+    expect(made.gateway.calls).toEqual([]);
+    // The file was asked for with its limits.
+    expect(made.attachments.asked).toEqual([
+      { url: expect.any(String) as string, limits: { maxBytes: 1_000_000, timeoutMs: 10_000 } },
+    ]);
+  });
+
+  it('names every channel and category it would create, and says so on the button', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [
+      area('River Side', SOUTH_RING, 'River Towns'),
+      area('Hill Top', squareRing(41, -81, 41.1, -80.9), 'river towns'),
+      area('Old Town', squareRing(42, -81, 42.1, -80.9), 'Town'),
+      area('Lonely', squareRing(43, -81, 43.1, -80.9)),
+    ]);
+    expect((answer.content ?? '').split('\n')).toEqual([
+      'This file would give 4 new regions. Nothing is changed yet.',
+      'Regions that are not in this file stay as they are.',
+      'I would **create 4 channels**: `#river-side`, `#hill-top`, `#old-town`, `#lonely`. Check the ' +
+        'names: a typo in the file makes a channel of that name.',
+      'I would **create 2 categories**: `River Towns`, `Lonely`.',
+      'I would **create 4 forums**, one for each region that has none.',
+    ]);
+    expect(listed(answer, 'Would be imported')).toEqual([
+      '- River Side → **new channel** `#river-side` in the new category `River Towns` · 0 gyms · gets a forum',
+      '- Hill Top → **new channel** `#hill-top` in the new category `River Towns` · 0 gyms · gets a forum',
+      '- Old Town → **new channel** `#old-town` in the category `Town` · 0 gyms · gets a forum',
+      '- Lonely → **new channel** `#lonely` in the new category `Lonely` · 0 gyms · gets a forum',
+    ]);
+    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
+      'Import and create 4 channels, 2 categories, 4 forums',
+      'Cancel',
+    ]);
+    expect(made.gateway.createdChannels).toEqual([]);
+  });
+
+  it('offers only what needs no creation where it may not create channels, and says why', async () => {
+    const made = await regionCommandsWith();
+    made.gateway.noCreating.add(made.gateway.guildId);
+    const { answer } = await importing(made, [
+      area('South', SOUTH_RING),
+      area('River Side', SOUTH_RING),
+    ]);
+    expect(answer.content).toContain('This file would give 1 new region.');
+    expect(answer.content).toContain(
+      'I may not create channels in this server (I lack Manage Channels)',
+    );
+    expect(listed(answer, 'Left out')).toEqual([
+      '- River Side: there is no channel `#river-side`, and I may not create one',
+    ]);
+    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
+      'Import and create 1 forum',
+      'Cancel',
+    ]);
+  });
+
+  it('lists what is left out, each with its reason, and counts what is no area', async () => {
+    const made = await regionCommandsWith();
+    made.gateway.addChannel('c-a', 'twin');
+    made.gateway.addChannel('c-b', 'twin');
+    made.gateway.addChannel('v-1', 'lounge', { kind: 'other' });
+    const polygon = (coordinates: string) =>
+      `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinates}</coordinates>` +
+      '</LinearRing></outerBoundaryIs></Polygon>';
+    const square = '-80.1,39.9 -80.1,40 -79.9,40 -79.9,39.9 -80.1,39.9';
+    const placemark = (name: string, geometry: string) =>
+      `<Placemark><name>${name}</name>${geometry}</Placemark>`;
+    const file =
+      '<?xml version="1.0"?><kml><Document>' +
+      placemark('South', polygon(square)) +
+      placemark('Twin', polygon(square)) +
+      placemark('East', polygon(square)) +
+      placemark('east', polygon(square)) +
+      placemark('Lounge', polygon(square)) +
+      placemark('!!!', polygon(square)) +
+      placemark('Bow **tie**', polygon('0,0 1,1 0,1 1,0')) +
+      placemark('Islands', `<MultiGeometry>${polygon(square)}${polygon(square)}</MultiGeometry>`) +
+      placemark('A pin', '<Point><coordinates>-80,40</coordinates></Point>') +
+      placemark('A path', '<LineString><coordinates>-80,40 -81,41</coordinates></LineString>') +
+      '</Document></kml>';
+    const { answer } = await importing(made, file);
+    expect(listed(answer, 'Would be imported')).toEqual([
+      `- South → <#${SOUTH_CHANNEL}> · new region · 0 gyms · gets a forum`,
+    ]);
+    expect(listed(answer, 'Left out')).toEqual([
+      '- Twin: several channels are called `#twin`',
+      '- East: several areas of the file stand for `#east`',
+      '- east: several areas of the file stand for `#east`',
+      '- Lounge: `#lounge` is not a text channel',
+      '- !!!: its name gives no channel name',
+      '- Bow \\*\\*tie\\*\\*: its outline crosses or touches itself',
+      '- Islands: it has several areas, and a region is one',
+    ]);
+    expect(answer.content).toContain(
+      '2 placemarks of the file are no areas (points, lines) and are ignored.',
+    );
+  });
+
+  it('shows no button when nothing can be imported', async () => {
+    const made = await regionCommandsWith();
+    const size = made.pending();
+    const { answer } = await importing(made, [area('!!!', SOUTH_RING)]);
+    expect(answer.content).toBe('Nothing in this file can be imported.');
+    expect(buttonsOf(answer)).toEqual([]);
+    expect(made.pending()).toBe(size);
+  });
+
+  it('says that the holes of an area are ignored', async () => {
+    const made = await regionCommandsWith();
+    const file =
+      '<kml><Placemark><name>South</name><Polygon><outerBoundaryIs><LinearRing><coordinates>' +
+      '-80.1,39.9 -80.1,40 -79.9,40 -79.9,39.9</coordinates></LinearRing></outerBoundaryIs>' +
+      '<innerBoundaryIs><LinearRing><coordinates>-80,39.94 -80,39.96 -79.98,39.96</coordinates>' +
+      '</LinearRing></innerBoundaryIs></Polygon></Placemark></kml>';
+    const { answer } = await importing(made, file);
+    expect(listed(answer, 'Would be imported')).toEqual([
+      `- South → <#${SOUTH_CHANNEL}> · new region · 0 gyms · its holes are ignored · gets a forum`,
+    ]);
+  });
+
+  it('fits Discord’s limits with a file of fifty-six regions, most of them new', async () => {
+    const made = await regionCommandsWith();
+    const areas = Array.from({ length: 56 }, (_unused, i) =>
+      area(
+        `A rather long name of a region number ${i} ${'x'.repeat(60)}`,
+        squareRing(41 + i * 0.01, -81, 41.005 + i * 0.01, -80.9),
+        `A category with a long name, number ${i % 9} ${'y'.repeat(50)}`,
+      ),
+    );
+    const { answer } = await importing(made, areas);
+    // The fake gateway refuses what Discord would refuse.
+    expect(() => {
+      FakePartyGateway.checkMessage({
+        content: answer.content ?? '',
+        embeds: (answer.embeds ?? []).map((embed) => embedOf({ embeds: [embed] })),
+      });
+    }).not.toThrow();
+    expect(answer.content).toContain('This file would give 56 new regions.');
+    expect(answer.content).toContain('I would **create 56 channels**');
+    expect(answer.content).toMatch(/…and \d+ more/u);
+    expect(listed(answer, 'Would be imported').at(-1)).toMatch(/^…and \d+ more$/u);
+    expect(buttonsOf(answer)[0]?.[0]).toBe(
+      'Import and create 56 channels, 9 categories, 56 forums',
+    );
+  });
+});
+
+describe('/region import: what is no file of regions', () => {
+  const refusal = async (file: string | Uint8Array, more: { size?: number } = {}) => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, file, more);
+    expect(buttonsOf(answer)).toEqual([]);
+    return answer.content ?? '';
+  };
+
+  it('says how to get KML when the file is a KMZ', async () => {
+    const text = await refusal(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]));
+    expect(text).toBe(
+      'That is a KMZ file (a zipped KML), and I read KML only. In Google My Maps choose ' +
+        '"Export to KML/KMZ" and tick "Export as KML instead of KMZ".',
+    );
+  });
+
+  it.each([
+    ['bytes that are no text', new Uint8Array([0x3c, 0xff, 0xfe, 0x3e]), 'saved as UTF-8'],
+    ['text that is no XML', 'name,lat,lon\nWest,40,-80', 'not well-formed XML'],
+    ['XML that is no KML', '<gpx><trk/></gpx>', 'its outermost element must be `kml`'],
+    ['KML without an area', '<kml><Document/></kml>', 'That file has no areas.'],
+    ['a document type', '<!DOCTYPE kml [<!ENTITY a "b">]><kml/>', 'DOCTYPE'],
+  ])('says what is wrong with %s', async (_what, file, said) => {
+    expect(await refusal(file)).toContain(said);
+  });
+
+  it('refuses a file that says it is larger than a megabyte, before any download', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, '<kml/>', { size: MAX_KML_BYTES + 1 });
+    expect(answer.content).toContain('larger than 1 MB');
+    expect(made.attachments.asked).toEqual([]);
+  });
+
+  it('refuses a file that turns out larger than it said', async () => {
+    const text = await refusal(`<kml>${' '.repeat(MAX_KML_BYTES)}</kml>`, { size: 10 });
+    expect(text).toContain('larger than 1 MB');
+  });
+
+  it('says so when the file cannot be downloaded', async () => {
+    const made = await regionCommandsWith();
+    made.attachments.failing = true;
+    const { answer } = await importing(made, '<kml/>');
+    expect(answer.content).toBe(
+      'I could not download that file from Discord. Try again in a moment.',
+    );
+  });
+});
+
+describe('/region import: for one channel', () => {
+  it('gives the channel the one area of the file, whatever its name, and creates nothing', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [area('Whatever I called it', SOUTH_RING)], {
+      channel: SOUTH_CHANNEL,
+    });
+    expect(listed(answer, 'Would be imported')).toEqual([
+      `- Whatever I called it → <#${SOUTH_CHANNEL}> · new region · 0 gyms · gets a forum`,
+    ]);
+    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
+      'Import and create 1 forum',
+      'Cancel',
+    ]);
+    await made.press(importButton(answer));
+    expect(made.regions.byChannel(SOUTH_CHANNEL)).toMatchObject({ bounds: SOUTH_RING });
+    expect(made.gateway.createdChannels).toEqual([]);
+  });
+
+  it('takes the area named after the channel from a file with several', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(
+      made,
+      [area('East', SOUTH_RING), area('West', WEST_HALF_RING), area('Brand New', SOUTH_RING)],
+      { channel: WEST_CHANNEL },
+    );
+    expect(listed(answer, 'Would be imported')).toEqual([
+      `- West → <#${WEST_CHANNEL}> · new outline · 5 gyms (8 before) · 3 gyms would lie in no region of this server any more`,
+    ]);
+    expect(listed(answer, 'Left out')).toEqual([
+      '- East: it stands for another channel',
+      '- Brand New: it stands for another channel',
+    ]);
+    expect(answer.content).toContain('(no channel is created)');
+    expect(answer.content).not.toContain('I would **create');
+  });
+
+  it('refuses a file of several areas of which none, or more than one, is the channel’s', async () => {
+    const made = await regionCommandsWith();
+    const none = await importing(made, [area('A', SOUTH_RING), area('B', SOUTH_RING)], {
+      channel: SOUTH_CHANNEL,
+    });
+    expect(none.answer.content).toBe(
+      `The file has 2 areas, and none of them is named after <#${SOUTH_CHANNEL}>. Use a file ` +
+        'with that area alone, or name exactly one area after the channel.',
+    );
+    const several = await importing(made, [area('South', SOUTH_RING), area('south', WEST_RING)], {
+      channel: SOUTH_CHANNEL,
+    });
+    expect(several.answer.content).toContain('several of them are named after');
+    expect(buttonsOf(several.answer)).toEqual([]);
+  });
+
+  it('refuses a channel that cannot be a region', async () => {
+    const made = await regionCommandsWith();
+    for (const channel of [WEST_FORUM, TOWN_CATEGORY, '100000000000009999']) {
+      const { answer } = await importing(made, [area('x', SOUTH_RING)], { channel });
+      expect(answer.content).toBe(
+        'Only an ordinary text channel of this server can be a region: not a thread, a ' +
+          'forum, a voice or an announcement channel.',
+      );
+    }
+    expect(made.attachments.asked).toEqual([]);
+  });
+});
+
+describe('/region import: Import and Cancel', () => {
+  it('imports on Import: outlines, new channels, forums, and says what it did', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [
+      area('West', WEST_HALF_RING),
+      area('South', SOUTH_RING),
+      area('River Side', squareRing(41, -81, 41.1, -80.9), 'River Towns'),
+    ]);
+    const pressed = await made.press(importButton(answer));
+    expect(pressed.update).toHaveBeenCalled();
+    const done = answerOf(pressed);
+    const created = made.gateway
+      .serverChannels(made.gateway.guildId)
+      ?.find((channel) => channel.name === 'river-side');
+    expect((done.content ?? '').split('\n')).toEqual([
+      'Imported 3 regions, and created 1 channel for them.',
+      'Created 1 category: `River Towns`.',
+      'If members give themselves a role for a region, add the role of a new region with ' +
+        '`/admin self-roles add`.',
+    ]);
+    expect(listed(done, 'Imported')).toEqual([
+      `- <#${SOUTH_CHANNEL}> · new region · 0 gyms · forum created`,
+      `- <#${created?.id ?? ''}> · new region · channel created · 0 gyms · forum created`,
+      `- <#${WEST_CHANNEL}> · new outline · 5 gyms`,
+    ]);
+    expect(done.components).toEqual([]);
+    expect(made.regions.byChannel(WEST_CHANNEL)?.bounds).toEqual(WEST_HALF_RING);
+    expect(made.regions.byChannel(created?.id ?? '')?.forumChannelId).not.toBeNull();
+    expect(made.directory.isRegion(SOUTH_CHANNEL)).toBe(true);
+  });
+
+  it('says nothing of roles where members do not give themselves any', async () => {
+    const made = await regionCommandsWith();
+    made.ctx.config.settings.features.roles = false;
+    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
+    const done = answerOf(await made.press(importButton(answer)));
+    expect(done.content).toBe('Imported 1 region.');
+    made.ctx.config.settings.features.roles = true;
+  });
+
+  it('says what could not be done, and names a channel it created for nothing', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [
+      area('South', SOUTH_RING),
+      area('River Side', squareRing(41, -81, 41.1, -80.9)),
+    ]);
+    made.gateway.gone.add(SOUTH_CHANNEL);
+    made.regions.failing = new Error('connection lost');
+    const done = answerOf(await made.press(importButton(answer)));
+    made.regions.failing = undefined;
+    const [createdId] = made.gateway.createdChannels.slice(-1);
+    expect(done.content).toContain('Nothing was imported.');
+    expect(listed(done, 'Not imported')).toEqual([
+      '- South: its channel is gone, or is no text channel any more.',
+      `- River Side: the outlines could not be written (the log says why). I had created ` +
+        `<#${createdId ?? ''}> for it: it exists, but is no region. Import again, or delete it.`,
+    ]);
+  });
+
+  it('says of a region whose forum could not be made what to do', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
+    made.gateway.failing.set('createForum', new Error('Discord is down'));
+    const done = answerOf(await made.press(importButton(answer)));
+    expect(done.content).toContain('run `/admin setup-forums`');
+    expect(listed(done, 'Imported')).toEqual([
+      `- <#${SOUTH_CHANNEL}> · new region · 0 gyms · **no forum**: something went wrong (see the log)`,
+    ]);
+  });
+
+  it('imports nothing on Cancel', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
+    const pressed = await made.press(buttonId(answer, 'Cancel'));
+    expect(pressed.update).toHaveBeenCalledWith({
+      content: 'Nothing was imported.',
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+    expect(made.regions.byChannel(SOUTH_CHANNEL)).toBeUndefined();
+  });
+
+  it('answers a question once: a second press is only acknowledged', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
+    const id = importButton(answer);
+    await made.press(id);
+    const calls = made.gateway.calls.length;
+    const again = await made.press(id);
+    expect(again.deferUpdate).toHaveBeenCalled();
+    expect(again.editReply).not.toHaveBeenCalled();
+    expect(again.update).not.toHaveBeenCalled();
+    expect(made.gateway.calls).toHaveLength(calls);
+  });
+
+  it('lets only the member who asked press, and only staff', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
+    const id = importButton(answer);
+    const other = await made.press(id, { userId: '200000000000000007' });
+    expect(other.reply).toHaveBeenCalledWith({
+      content: 'That is somebody else’s question.',
+      flags: MessageFlags.Ephemeral,
+    });
+    const member = await made.press(id, { userId: MEMBER, roleNames: [] });
+    expect(member.reply).toHaveBeenCalledWith({
+      content: 'Only admins, moderators and bot developers can do that.',
+      flags: MessageFlags.Ephemeral,
+    });
+    expect(made.regions.byChannel(SOUTH_CHANNEL)).toBeUndefined();
+    // The question is still hers to answer.
+    await made.press(id);
+    expect(made.regions.byChannel(SOUTH_CHANNEL)).toBeDefined();
+  });
+
+  it('says that a question has expired that the bot no longer remembers', async () => {
+    const made = await regionCommandsWith();
+    const pressed = await made.press('region:0123456789abcdef:import');
+    expect(pressed.update).toHaveBeenCalledWith({
+      content: 'That has expired. Use the command again.',
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+    expect(PENDING_MINUTES).toBe(30);
+    expect(pendingRegions.size).toBeLessThanOrEqual(50);
+  });
+
+  it('keeps another server out of this server’s channels', async () => {
+    const made = await regionCommandsWith();
+    // East is a channel of the first server: for the second it is no channel at all.
+    const used = await made.use(
+      'import',
+      {},
+      {
+        userId: '200000000000000007',
+        guildId: '412345678901234568',
+        resolved: {
+          file: made.file('r.kml', writeKml([area('x', SOUTH_RING)])),
+          channel: { id: EAST_CHANNEL },
+        },
+      },
+    );
+    expect(answerOf(used).content).toContain('Only an ordinary text channel of this server');
+  });
+});
diff --git a/src/commands/regions/import.ts b/src/commands/regions/import.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8e2eb69f616168e176bc24606f37e0cd43feadc0
--- /dev/null
+++ b/src/commands/regions/import.ts
@@ -0,0 +1,616 @@
+import {
+  ActionRowBuilder,
+  AttachmentBuilder,
+  ButtonStyle,
+  ChannelType,
+  SlashCommandSubcommandBuilder,
+  type APIEmbed,
+  type ButtonBuilder,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import { UserError } from '../../discord/errors.js';
+import {
+  kmlText,
+  MAX_KML_AREAS,
+  MAX_KML_CORNERS,
+  readKml,
+  type KmlProblem,
+  type KmlSkipped,
+  type KmlSkipReason,
+} from '../../domain/geo/kml.js';
+import { MAX_OUTLINE_CORNERS } from '../../domain/geo/outline.js';
+import {
+  MAX_CATEGORY_CHANNELS,
+  type LeftOut,
+  type LeftOutReason,
+  type PlannedImport,
+} from '../../domain/regions/region-import.js';
+import { count, fitItems, plain, truncate } from '../../render/text.js';
+import type {
+  ImportedRegion,
+  ImportFailure,
+  ImportOutcome,
+  ImportPreview,
+  NotImported,
+} from '../../services/region-admin-service.js';
+import {
+  button,
+  content,
+  pendingRegions,
+  regionStaff,
+  selfRoleReminder,
+  type ButtonAnswer,
+} from './shared.js';
+
+/** A file of regions is tens of kilobytes; anything beyond this is something else. */
+export const MAX_KML_BYTES = 1_000_000;
+/** How long the download of the file may take. */
+const DOWNLOAD_MS = 10_000;
+/** How much of a name from a file is shown. */
+const NAME_SHOWN = 40;
+/** How much room the list of what would be imported, and of what is left out, may take. */
+const IMPORT_LIST = 3_600;
+const LEFT_OUT_LIST = 1_500;
+/** How much of a message the names of new channels or categories may take. */
+const NAMES_SHOWN = 500;
+
+const HOW_TO_KML =
+  'In Google My Maps choose "Export to KML/KMZ" and tick "Export as KML instead of KMZ".';
+
+/** Why a file cannot be read as KML, as a sentence. */
+function kmlProblemText(problem: KmlProblem): string {
+  switch (problem) {
+    case 'kmz':
+      return `That is a KMZ file (a zipped KML), and I read KML only. ${HOW_TO_KML}`;
+    case 'not-xml':
+      return 'That file is not well-formed XML, so I cannot read it as KML.';
+    case 'doctype':
+      return (
+        'That file declares a document type (DOCTYPE), which I never read. A KML file from a ' +
+        'map editor has none.'
+      );
+    case 'too-deep':
+      return 'That file is nested deeper than any KML I know, so I did not read it.';
+    case 'not-kml':
+      return 'That file is XML, but not KML: its outermost element must be `kml`.';
+    case 'no-areas':
+      return (
+        'That file has no areas. I look for placemarks with a polygon: draw each region as a ' +
+        'shape and name it after its channel.'
+      );
+    case 'too-many-areas':
+      return `That file has more than ${MAX_KML_AREAS} areas. Import the regions in several files.`;
+    case 'too-many-corners':
+      return (
+        `The outlines of that file have more than ${MAX_KML_CORNERS} corners in all. Import ` +
+        'the regions in several files, or simplify the shapes.'
+      );
+  }
+}
+
+/** Why a placemark with a polygon is no area, in a few words. */
+function skipText(reason: KmlSkipReason): string {
+  if (reason.kind === 'several-areas') return 'it has several areas, and a region is one';
+  if (reason.kind === 'no-outline') return 'its polygon has no outline';
+  switch (reason.problem.kind) {
+    case 'not-a-number':
+      return 'a coordinate of its outline is no number';
+    case 'out-of-range':
+      return 'a coordinate of its outline is no place on earth';
+    case 'too-few':
+      return 'its outline has fewer than three corners';
+    case 'too-many':
+      return (
+        `its outline has ${reason.problem.corners} corners, more than the ` +
+        `${MAX_OUTLINE_CORNERS} I take: simplify the shape`
+      );
+    case 'crosses-itself':
+      return 'its outline crosses or touches itself';
+  }
+}
+
+/** A name the bot made of a file (a channel or a category), as an answer shows it: as code. */
+function derived(name: string): string {
+  return `\`${name.replace(/`/gu, '')}\``;
+}
+
+/** Why an area of the file is left out of the plan, in a few words. */
+function leftOutText(left: LeftOut): string {
+  const channel = derived(`#${left.channelName}`);
+  const reasons: Readonly<Record<LeftOutReason, string>> = {
+    'no-name': 'its name gives no channel name',
+    'several-channels': `several channels are called ${channel}`,
+    'several-areas': `several areas of the file stand for ${channel}`,
+    'not-text': `${channel} is not a text channel`,
+    foreign: `${channel} cannot be a region of this server`,
+    'cannot-create': `there is no channel ${channel}, and I may not create one`,
+    'other-channel': 'it stands for another channel',
+  };
+  return reasons[left.reason];
+}
+
+/** A name from a file as an answer shows it: as text, cut, never empty. */
+function shown(name: string): string {
+  return name === '' ? '(no name)' : plain(truncate(name, NAME_SHOWN));
+}
+
+/** One area that would be imported, as a line of the preview. */
+function plannedLine(planned: PlannedImport): string {
+  let where: string;
+  if ('id' in planned.channel) {
+    const what =
+      planned.regionId === null
+        ? 'new region'
+        : planned.unchanged
+          ? 'outline unchanged'
+          : 'new outline';
+    where = `<#${planned.channel.id}> · ${what}`;
+  } else {
+    const { category } = planned.channel.create;
+    const inCategory =
+      category === null
+        ? 'without a category'
+        : 'create' in category
+          ? `in the new category ${derived(category.create)}`
+          : `in the category ${derived(category.name)}`;
+    where = `**new channel** ${derived(`#${planned.channelName}`)} ${inCategory}`;
+  }
+  const gyms =
+    planned.gymsBefore === null || planned.unchanged
+      ? count(planned.gyms, 'gym')
+      : `${count(planned.gyms, 'gym')} (${planned.gymsBefore} before)`;
+  const notes = [
+    ...(planned.stranded > 0
+      ? [`${count(planned.stranded, 'gym')} would lie in no region of this server any more`]
+      : []),
+    ...(planned.holes ? ['its holes are ignored'] : []),
+    ...(planned.hasForum ? [] : ['gets a forum']),
+    ...(planned.nearMiss === undefined
+      ? []
+      : [`**did you mean ${derived(`#${planned.nearMiss}`)}?**`]),
+  ];
+  return [`- ${shown(planned.name)} → ${where}`, gyms, ...notes].join(' · ');
+}
+
+/**
+ * How risky a line is, for the order of the list: a new channel that may be a typo first, then
+ * new channels, then outlines that leave gyms without a region, then the rest.
+ */
+function risk(planned: PlannedImport): number {
+  if (planned.nearMiss !== undefined) return 0;
+  if ('create' in planned.channel) return 1;
+  if (planned.stranded > 0) return 2;
+  return planned.unchanged ? 4 : 3;
+}
+
+/** The longest label Discord shows on a button. */
+const MAX_LABEL = 80;
+
+/** What an import would create, as words: "1 channel, 2 categories, 3 forums". */
+function creations(preview: ImportPreview): { words: string; things: number } {
+  const parts = [
+    [preview.newChannels.length, 'channel', 'channels'],
+    [preview.newCategories.length, 'category', 'categories'],
+    [preview.newForums, 'forum', 'forums'],
+  ] as const;
+  const made = parts.filter(([n]) => n > 0);
+  return {
+    words: made.map(([n, one, many]) => count(n, one, many)).join(', '),
+    things: made.reduce((sum, [n]) => sum + n, 0),
+  };
+}
+
+/** The label of the button that carries an import out: it says what it will create. */
+function importLabel(preview: ImportPreview): string {
+  const { words, things } = creations(preview);
+  if (things === 0) return 'Import';
+  const label = `Import and create ${words}`;
+  return label.length <= MAX_LABEL ? label : `Import and create ${count(things, 'thing')}`;
+}
+
+const names = (items: readonly string[], sign: string): string =>
+  fitItems(
+    items.map((name) => derived(`${sign}${name}`)),
+    NAMES_SHOWN,
+  );
+
+/** The first line of a preview: what the file would do, counted. */
+function summaryLine(preview: ImportPreview, oneChannel: boolean): string {
+  const { imports } = preview;
+  const fresh = imports.filter((one) => one.regionId === null).length;
+  const changed = imports.filter((one) => one.regionId !== null && !one.unchanged).length;
+  const same = imports.filter((one) => one.unchanged).length;
+  const gives = [
+    ...(fresh > 0 ? [count(fresh, 'new region')] : []),
+    ...(changed > 0 ? [count(changed, 'new outline')] : []),
+  ];
+  const doing = [
+    ...(gives.length > 0 ? [`give ${gives.join(' and ')}`] : []),
+    ...(same > 0
+      ? [`leave ${count(same, 'outline')} as ${same === 1 ? 'it is' : 'they are'}`]
+      : []),
+  ];
+  return (
+    `This file would ${doing.join(' and ')}. Nothing is changed yet` +
+    (oneChannel ? ' (no channel is created).' : '.')
+  );
+}
+
+/**
+ * The preview of an import: what would be imported, area by area (the lines to look at twice
+ * first), what would be created, what is left out and why, and what the new outlines mean for
+ * gyms and raids. It fits Discord's limits with any file: lists that do not fit are cut with a
+ * count, and then every line is also in an attached file (`preview.txt`), written for reading
+ * in a text editor: channels by their names (`channelNames`, by id), and no bold.
+ */
+export function renderPreview(
+  preview: ImportPreview,
+  skipped: readonly KmlSkipped[],
+  others: number,
+  oneChannel = false,
+  channelNames: ReadonlyMap<string, string> = new Map(),
+): { content: string; embeds: APIEmbed[]; files: AttachmentBuilder[] } {
+  const { imports, leftOut, newChannels, newCategories } = preview;
+  const lines: string[] = [];
+  if (imports.length === 0) {
+    lines.push('Nothing in this file can be imported.');
+  } else {
+    lines.push(summaryLine(preview, oneChannel));
+    if (!oneChannel) lines.push('Regions that are not in this file stay as they are.');
+  }
+  const close = imports.filter((one) => one.nearMiss !== undefined).length;
+  if (close > 0) {
+    lines.push(
+      close === 1
+        ? '**1 new channel has a name close to another**: is it a typo in the file?'
+        : `**${close} new channels have names close to others**: are they typos in the file?`,
+    );
+  }
+  if (newChannels.length > 0) {
+    lines.push(
+      `I would **create ${count(newChannels.length, 'channel')}**: ${names(newChannels, '#')}. ` +
+        'Check the names: a typo in the file makes a channel of that name.',
+    );
+  }
+  if (newCategories.length > 0) {
+    lines.push(
+      `I would **create ${count(newCategories.length, 'category', 'categories')}**: ` +
+        `${names(newCategories, '')}.`,
+    );
+  }
+  if (preview.newForums > 0) {
+    lines.push(
+      `I would **create ${count(preview.newForums, 'forum')}**, one for each region that has none.`,
+    );
+  }
+  for (const crowded of preview.crowded) {
+    lines.push(
+      `The category ${derived(crowded.name)} would hold ${crowded.channels} channels and ` +
+        `forums, and Discord allows ${MAX_CATEGORY_CHANNELS}: what is more is refused. Put ` +
+        'some of these areas into another category.',
+    );
+  }
+  if (preview.stranded > 0) {
+    lines.push(
+      `${count(preview.stranded, 'gym')} would then lie in no region of this server any ` +
+        'more: no raid can be reported there.',
+    );
+  }
+  if (preview.raidsOutside > 0) {
+    lines.push(
+      preview.raidsOutside === 1
+        ? '1 active raid is at a gym that would lie outside its region. It stays in its post.'
+        : `${preview.raidsOutside} active raids are at gyms that would lie outside their ` +
+            'region. They stay in their posts.',
+    );
+  }
+  if (leftOut.some((left) => left.reason === 'cannot-create')) {
+    lines.push(
+      'I may not create channels in this server (I lack Manage Channels), so areas without a ' +
+        'channel are left out. Give me that permission, or create the channels yourself, and ' +
+        'import again.',
+    );
+  }
+  if (others > 0) {
+    lines.push(
+      others === 1
+        ? '1 placemark of the file is no area (a point or a line) and is ignored.'
+        : `${others} placemarks of the file are no areas (points, lines) and are ignored.`,
+    );
+  }
+  const planned = [...imports]
+    .map((one, index) => ({ one, index }))
+    .sort((a, b) => risk(a.one) - risk(b.one) || a.index - b.index)
+    .map(({ one }) => plannedLine(one));
+  const out = [
+    ...leftOut.map((left) => `- ${shown(left.name)}: ${leftOutText(left)}`),
+    ...skipped.map((skip) => `- ${shown(skip.name)}: ${skipText(skip.reason)}`),
+  ];
+  const embeds: APIEmbed[] = [];
+  let cut = false;
+  const fitted = (items: readonly string[], limit: number): string => {
+    const text = fitItems(items, limit, '\n');
+    if (text !== items.join('\n')) cut = true;
+    return text;
+  };
+  if (planned.length > 0) {
+    embeds.push({ title: 'Would be imported', description: fitted(planned, IMPORT_LIST) });
+  }
+  if (out.length > 0) {
+    embeds.push({ title: 'Left out', description: fitted(out, LEFT_OUT_LIST) });
+  }
+  const text = content(lines);
+  if (text !== lines.join('\n')) cut = true;
+  if (!cut) return { content: text, embeds, files: [] };
+  const whole = [
+    ...lines,
+    '',
+    ...(planned.length > 0 ? ['Would be imported:', ...planned, ''] : []),
+    ...(out.length > 0 ? ['Left out:', ...out] : []),
+  ]
+    .join('\n')
+    .replace(/<#(\d+)>/gu, (_mention, id: string) => `#${channelNames.get(id) ?? id}`)
+    .replace(/\*\*/gu, '');
+  return {
+    content: content([
+      ...lines.slice(0, 1),
+      'Every line is in the attached file.',
+      ...lines.slice(1),
+    ]),
+    embeds,
+    files: [new AttachmentBuilder(Buffer.from(whole, 'utf8'), { name: PREVIEW_FILE })],
+  };
+}
+
+/** The name of the file a preview attaches when its lists had to be cut. */
+export const PREVIEW_FILE = 'preview.txt';
+
+/** Why an area was not imported in the end, in a few words. */
+function failureText(failed: NotImported): string {
+  const channel = derived(`#${failed.channelName}`);
+  const reasons: Readonly<Record<ImportFailure, string>> = {
+    'channel-gone': 'its channel is gone, or is no text channel any more',
+    foreign: `${channel} cannot be a region of this server`,
+    'name-taken': `channels called ${channel} have appeared that are not one text channel`,
+    'no-permission': `I may not create ${channel} (I lack Manage Channels)`,
+    limit: `${channel} could not be created: the server or the category is full`,
+    'bad-name': `Discord does not take ${channel} as a channel name`,
+    'no-server': `${channel} could not be created: its category is gone`,
+    failed: `${channel} could not be created (the log says why)`,
+    'not-written': 'the outlines could not be written (the log says why)',
+  };
+  const created =
+    failed.createdChannelId === undefined
+      ? ''
+      : ` I had created <#${failed.createdChannelId}> for it: it exists, but is no region. ` +
+        'Import again, or delete it.';
+  return `${reasons[failed.reason]}.${created}`;
+}
+
+/** A reason as a part of a line: lower case at first, without its full stop. */
+function asPart(reason: string): string {
+  const trimmed = reason.trim().replace(/\.$/u, '');
+  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
+}
+
+function importedLine(region: ImportedRegion): string {
+  const what = [
+    region.newRegion ? 'new region' : 'new outline',
+    ...(region.channelCreated ? ['channel created'] : []),
+    count(region.gyms, 'gym'),
+    ...(region.forum === 'created' ? ['forum created'] : []),
+    ...(region.forum === 'none'
+      ? [
+          region.forumReason === undefined
+            ? '**no forum**'
+            : `**no forum**: ${asPart(region.forumReason)}`,
+        ]
+      : []),
+  ];
+  return `- <#${region.channelId}> · ${what.join(' · ')}`;
+}
+
+/** The order of the lines of an outcome: without a forum first, then with a new one. */
+const FORUM_ORDER: Readonly<Record<ImportedRegion['forum'], number>> = {
+  none: 0,
+  created: 1,
+  had: 2,
+};
+
+/** What an import did, as the answer that takes the place of the preview. */
+export function renderOutcome(
+  ctx: AppContext,
+  outcome: ImportOutcome,
+): { content: string; embeds: APIEmbed[] } {
+  const { imported, notImported, categoriesCreated } = outcome;
+  const lines: string[] = [];
+  if (imported.length === 0) {
+    lines.push('Nothing was imported.');
+  } else {
+    const created = imported.filter((region) => region.channelCreated).length;
+    lines.push(
+      `Imported ${count(imported.length, 'region')}` +
+        (created > 0 ? `, and created ${count(created, 'channel')} for them.` : '.'),
+    );
+  }
+  if (!outcome.reloaded) {
+    lines.push(
+      'The outlines are stored, but I could not load them again: members see them after the ' +
+        'next restart.',
+    );
+  }
+  if (categoriesCreated.length > 0) {
+    lines.push(
+      `Created ${count(categoriesCreated.length, 'category', 'categories')}: ` +
+        `${names(categoriesCreated, '')}.`,
+    );
+  }
+  const forumless = imported.filter((region) => region.forum === 'none').length;
+  if (forumless > 0) {
+    lines.push(
+      `${forumless === 1 ? '1 of them has' : `${forumless} of them have`} no forum, so ` +
+        'nothing can be reported there yet: put right what is said below, then run ' +
+        '`/admin setup-forums`.',
+    );
+  }
+  if (imported.some((region) => region.newRegion)) {
+    const reminder = selfRoleReminder(ctx, 'new');
+    if (reminder !== undefined) lines.push(reminder);
+  }
+  const embeds: APIEmbed[] = [];
+  if (imported.length > 0) {
+    const ordered = imported
+      .map((region, index) => ({ region, index }))
+      .sort(
+        (a, b) => FORUM_ORDER[a.region.forum] - FORUM_ORDER[b.region.forum] || a.index - b.index,
+      )
+      .map(({ region }) => importedLine(region));
+    embeds.push({ title: 'Imported', description: fitItems(ordered, IMPORT_LIST, '\n') });
+  }
+  if (notImported.length > 0) {
+    embeds.push({
+      title: 'Not imported',
+      description: fitItems(
+        notImported.map((failed) => `- ${shown(failed.name)}: ${failureText(failed)}`),
+        LEFT_OUT_LIST,
+        '\n',
+      ),
+    });
+  }
+  return { content: content(lines), embeds };
+}
+
+/**
+ * `/region import`: gives channels their outlines from a KML file. Without `channel`, every
+ * area of the file goes to the text channel its name stands for, and a channel that is missing
+ * is created (with its category); with `channel`, the file gives that one channel its outline
+ * and nothing is created. Nothing is changed before the staff member has seen what would be
+ * done and pressed Import.
+ */
+export const importRegions: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName('import')
+    .setDescription('Give channels their outlines from a KML file')
+    .addAttachmentOption((option) =>
+      option.setName('file').setDescription('The KML file with the areas').setRequired(true),
+    )
+    .addChannelOption((option) =>
+      option
+        .setName('channel')
+        .setDescription('Give this one channel the outline of the file (nothing is created)')
+        .addChannelTypes(ChannelType.GuildText),
+    ),
+  help: {
+    details:
+      'Draw each region as a shape in a map editor such as Google My Maps, and name it after ' +
+      'its channel ("North ' +
+      `Hills" stands for #north-hills). ${HOW_TO_KML} Attach the file, and I show what the ` +
+      'import would do before anything is changed: which channels get a new outline, which ' +
+      'become regions, how many gyms lie in each, and what is left out and why. For a name ' +
+      'that no channel has I create the channel, in the category the shape’s description ' +
+      'names (or one named after the shape); the preview lists every channel and category ' +
+      'it would create, and the button says how many. Every region that has no forum gets ' +
+      'one. With `channel`, the file is for that one channel: its only shape, or the one ' +
+      `named after the channel. An outline may have up to ${MAX_OUTLINE_CORNERS} corners and ` +
+      'must not cross itself; holes are ignored. `/region export` gives the outlines back as ' +
+      'a file.',
+    examples: ['/region import file:regions.kml', '/region import file:north.kml channel:#north'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const staff = await regionStaff(interaction, ctx);
+    const file = interaction.options.getAttachment('file', true);
+    const given = interaction.options.getChannel('channel');
+    const target = given === null ? undefined : ctx.regionAdmin.textChannel(staff, given.id);
+    if (given !== null && !target) {
+      throw new UserError(
+        'Only an ordinary text channel of this server can be a region: not a thread, a forum, ' +
+          'a voice or an announcement channel.',
+      );
+    }
+    if (file.size > MAX_KML_BYTES) {
+      throw new UserError(
+        'That file is larger than 1 MB, and a file of regions is far smaller. Export only the ' +
+          'layer with the regions.',
+      );
+    }
+    const download = await ctx.attachments.download(file.url, {
+      maxBytes: MAX_KML_BYTES,
+      timeoutMs: DOWNLOAD_MS,
+    });
+    if (!download.ok) {
+      throw new UserError(
+        download.reason === 'too-large'
+          ? 'That file is larger than 1 MB, and a file of regions is far smaller. Export only ' +
+              'the layer with the regions.'
+          : 'I could not download that file from Discord. Try again in a moment.',
+      );
+    }
+    const text = kmlText(download.bytes);
+    if (!text.ok) {
+      throw new UserError(
+        text.reason === 'kmz'
+          ? kmlProblemText('kmz')
+          : 'That file is not text I can read: it must be a KML file, saved as UTF-8.',
+      );
+    }
+    const reading = readKml(text.text);
+    if (!reading.ok) throw new UserError(kmlProblemText(reading.reason));
+    const preview = ctx.regionAdmin.preview(staff, reading.areas, target);
+    if (preview.problem !== undefined && target) {
+      throw new UserError(
+        `The file has ${count(reading.areas.length, 'area')}, and ` +
+          (preview.problem === 'none-for-channel' ? 'none' : 'several') +
+          ` of them ${preview.problem === 'none-for-channel' ? 'is' : 'are'} named after ` +
+          `<#${target.id}>. Use a file with that area alone, or name exactly one area after ` +
+          'the channel.',
+      );
+    }
+    const channelNames = new Map(
+      ctx.regionAdmin.channelsOf(staff).map((channel) => [channel.id, channel.name]),
+    );
+    const rendered = renderPreview(
+      preview,
+      reading.skipped,
+      reading.others,
+      target !== undefined,
+      channelNames,
+    );
+    if (preview.imports.length === 0) {
+      await interaction.editReply({ ...rendered, components: [] });
+      return;
+    }
+    const token = pendingRegions.put(interaction.user.id, {
+      what: 'import',
+      imports: preview.imports,
+    });
+    await interaction.editReply({
+      ...rendered,
+      components: [
+        new ActionRowBuilder<ButtonBuilder>().addComponents(
+          button(token, 'import', importLabel(preview), ButtonStyle.Primary),
+          button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
+        ),
+      ],
+    });
+  },
+};
+
+/**
+ * Import was pressed under the preview. Everything is looked at again by the service (the
+ * preview may be minutes old), and the answer says what was really done; it takes the place of
+ * the preview.
+ */
+export const importAnswers: Readonly<Record<string, ButtonAnswer>> = {
+  'import:import': async (interaction, ctx, request) => {
+    if (request.what !== 'import') return;
+    const staff = await regionStaff(interaction, ctx);
+    const outcome = await ctx.regionAdmin.import(staff, request.imports);
+    await interaction.editReply({
+      ...renderOutcome(ctx, outcome),
+      components: [],
+      attachments: [],
+    });
+  },
+};
diff --git a/src/commands/regions/index.ts b/src/commands/regions/index.ts
index 1d973e2a7ccfa02b67663f75d1a86ac173f17d98..d559b0984c8c59bbdf865648dcc2ee4fed8d19bc 100644
--- a/src/commands/regions/index.ts
+++ b/src/commands/regions/index.ts
@@ -2,10 +2,11 @@ import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
 import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
 import { requireBotManagement } from '../../discord/guards.js';
 import { exportRegions } from './export.js';
+import { importRegions } from './import.js';
 import { listRegions } from './list.js';
 
 /** The subcommands of `/region`, each in a file of its own in this folder. */
-const parts: readonly SubcommandPart[] = [listRegions, exportRegions];
+const parts: readonly SubcommandPart[] = [importRegions, listRegions, exportRegions];
 
 /**
  * `/region`: the regions of a server, for staff. Discord offers it only to members who may
diff --git a/src/commands/regions/region.test.ts b/src/commands/regions/region.test.ts
index 430d2666ac03550a0b7d0a255cc54333110ade42..f5a26384d66f5c4b928c632ae08ecfd458bc4864 100644
--- a/src/commands/regions/region.test.ts
+++ b/src/commands/regions/region.test.ts
@@ -50,7 +50,7 @@ describe('/region: who may use it', () => {
     const json = region.data.toJSON();
     expect(json.default_member_permissions).toBe('32');
     expect(region.guards).toHaveLength(1);
-    expect([...region.subcommands.keys()]).toEqual(['list', 'export']);
+    expect([...region.subcommands.keys()]).toEqual(['import', 'list', 'export']);
   });
 
   it('refuses a member who is not staff, whatever Discord let through', async () => {
````

---

### Task 6: Removing a region, and the forums whose region is gone

Prototype commit: `53673d6fd9ae3223512ddfc6f788f9a926c00a0f`

- /region remove asks first, with what the removal does, counted: the
  active parties that are ended, the gyms that will lie in no region of
  the server, the saved routes that go with it. With a forum that
  exists it offers "Remove, keep the forum" and "Remove and delete the
  forum" (deleting it deletes every post in it for good); the answer
  says what was really done, and why not when nothing was. A region
  whose channel is gone can be picked and removed. The self-role
  reminder follows a removal where members give themselves roles.
- PartyService.orphanForums: the forums of a server that party rows
  name and no region has, and that still exist. /region list and
  /admin setup-forums name them; setup-forums still only adds.
- The custom ids of /region are documented in custom-id.ts.


**Files:**

```
 src/commands/admin/setup-forums.test.ts |  30 +++++++++++++++++
 src/commands/admin/setup-forums.ts      |  32 ++++++++++++++++---
 src/commands/regions/controls.ts        |   3 +-
 src/commands/regions/index.ts           |   3 +-
 src/commands/regions/region.test.ts     |   2 +-
 src/commands/regions/remove.test.ts     | 267 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/regions/remove.ts          | 213 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/discord/custom-id.ts                |   6 ++++
 src/services/party-service.ts           |  20 ++++++++++++
 src/services/region-admin-service.ts    |  21 +++---------
 10 files changed, 573 insertions(+), 24 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `Removing a region, and the forums whose region is gone`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/src/commands/admin/setup-forums.test.ts b/src/commands/admin/setup-forums.test.ts
index de2d5c33178d2f6e3f0aa1cd1e5ad57c0ab1026e..9ce8035a2dd57729a28e093b885a44959cdbe87e 100644
--- a/src/commands/admin/setup-forums.test.ts
+++ b/src/commands/admin/setup-forums.test.ts
@@ -8,7 +8,9 @@ import {
   WEST_CHANNEL,
   WEST_FORUM,
 } from '../../../test/support/gyms.js';
+import { testRaid } from '../../../test/support/parties.js';
 import { partyServiceWith } from '../../../test/support/party-service.js';
+import { endParty } from '../../domain/party/party.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
 import { loadSettings, type Settings } from '../../config/settings.js';
@@ -300,6 +302,34 @@ describe('/admin setup-forums', () => {
     expect(forum?.name).toBe(`${'n'.repeat(92)}-meetups`);
   });
 
+  it('names the forums whose region is gone, and leaves them as they are', async () => {
+    const made = await setup();
+    const ORPHAN = '100000000000000099';
+    made.gateway.addForum(ORPHAN, [], 'old-meetups');
+    await made.storage.insert(
+      endParty({ ...testRaid(), forumChannelId: ORPHAN, forumPostId: '900000000000004321' }),
+    );
+    // A forum that a party names and that is a region's own is none of them.
+    await made.storage.insert(
+      endParty({
+        ...testRaid({ id: '00000000-0000-4000-8000-000000000009' }),
+        forumChannelId: WEST_FORUM,
+        forumPostId: '900000000000004322',
+      }),
+    );
+    const interaction = await made.run();
+    const text = sent(interaction.editReply).content ?? '';
+    expect(text.split(NEWLINE).at(-1)).toBe(
+      `A forum whose region is gone: <#${ORPHAN}>. I left it as it is (history); delete by ` +
+        'hand what is not wanted.',
+    );
+    expect(made.gateway.calls.filter((call) => call.endsWith(ORPHAN))).toEqual([]);
+    // Once it is deleted by hand it is not named any more.
+    made.gateway.gone.add(ORPHAN);
+    const again = await made.run();
+    expect(sent(again.editReply).content).not.toContain(ORPHAN);
+  });
+
   it('is for staff only', async () => {
     const { run, gateway } = await setup();
     const interaction = await run(['Member']);
diff --git a/src/commands/admin/setup-forums.ts b/src/commands/admin/setup-forums.ts
index 5cb575b07c21449f899d01dcbbc680a00ef55027..998173d460fc84cd840510f50e6ede68b7ab9831 100644
--- a/src/commands/admin/setup-forums.ts
+++ b/src/commands/admin/setup-forums.ts
@@ -1,7 +1,7 @@
 import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { UserError } from '../../discord/errors.js';
-import { fitMessages, plain } from '../../render/text.js';
+import { fitItems, fitMessages, LIMITS, plain } from '../../render/text.js';
 import type { ForumSetup } from '../../services/party-service.js';
 
 function line(result: ForumSetup): string {
@@ -33,6 +33,22 @@ function line(result: ForumSetup): string {
   return `<#${region.channelId}>: ${what.join(', ')}.${open}`;
 }
 
+/**
+ * The closing line about the forums whose region is gone (Matt, 2026-10-13: they can be found
+ * from the party rows): the command only adds, so they are named and left as they are.
+ */
+function orphanLine(forumIds: readonly string[]): string {
+  const forums = fitItems(
+    forumIds.map((id) => `<#${id}>`),
+    LIMITS.content - 300,
+  );
+  return (
+    `${forumIds.length === 1 ? 'A forum' : 'Forums'} whose region is gone: ${forums}. I left ` +
+    `${forumIds.length === 1 ? 'it' : 'them'} as ${forumIds.length === 1 ? 'it is' : 'they are'}` +
+    ' (history); delete by hand what is not wanted.'
+  );
+}
+
 /** `/admin setup-forums`: every region of this server gets its forum, tags and summary post. */
 export const setupForums: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
@@ -44,7 +60,8 @@ export const setupForums: SubcommandPart = {
     details:
       'For each region of this server: creates the forum for its raid posts next to the ' +
       "region's channel if it has none, adds the tags that are missing, and posts and pins the " +
-      'list of active raids. It changes nothing that is already there, so it is safe to run again.',
+      'list of active raids. It changes nothing that is already there, so it is safe to run ' +
+      'again. A forum whose region is gone is named and left alone.',
     examples: ['/admin setup-forums'],
   },
   defer: 'ephemeral',
@@ -55,11 +72,18 @@ export const setupForums: SubcommandPart = {
       throw new UserError('A setup is already running for this server.');
     }
     const results = await ctx.partyService.setupForums(guildId);
+    const orphans = await ctx.partyService.orphanForums(guildId).catch((err: unknown) => {
+      ctx.log.warn({ err }, 'could not list the forums that parties name');
+      return [];
+    });
+    const closing = orphans.length === 0 ? [] : [orphanLine(orphans)];
     if (results.length === 0) {
-      await interaction.editReply({ content: 'This server has no regions yet.' });
+      await interaction.editReply({
+        content: ['This server has no regions yet.', ...closing].join('\n'),
+      });
       return;
     }
-    const [first = '', ...rest] = fitMessages(results.map(line));
+    const [first = '', ...rest] = fitMessages([...results.map(line), ...closing]);
     await interaction.editReply({ content: first });
     for (const content of rest) {
       await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
diff --git a/src/commands/regions/controls.ts b/src/commands/regions/controls.ts
index 6c2505d4f4ff075efe1543264af6404d0cd1a7e3..d37f05ff7ec422683aca6334a82e8a64c8594394 100644
--- a/src/commands/regions/controls.ts
+++ b/src/commands/regions/controls.ts
@@ -4,6 +4,7 @@ import { requireBotManagement } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { count } from '../../render/text.js';
 import { importAnswers } from './import.js';
+import { removeAnswers } from './remove.js';
 import {
   EXPIRED,
   markAnswered,
@@ -35,7 +36,7 @@ function working(request: PendingRegion): string {
  * What the buttons of `/region` do, by what their request is about and their action
  * (`import:import`, `remove:keep`); each subcommand brings its own.
  */
-const ANSWERS: Readonly<Record<string, ButtonAnswer>> = { ...importAnswers };
+const ANSWERS: Readonly<Record<string, ButtonAnswer>> = { ...importAnswers, ...removeAnswers };
 
 /**
  * The buttons of `/region` (custom-id kind `region`): each belongs to a pending request of the
diff --git a/src/commands/regions/index.ts b/src/commands/regions/index.ts
index d559b0984c8c59bbdf865648dcc2ee4fed8d19bc..30da1d4811223ace03d9e82b0b69faedf7050c11 100644
--- a/src/commands/regions/index.ts
+++ b/src/commands/regions/index.ts
@@ -4,9 +4,10 @@ import { requireBotManagement } from '../../discord/guards.js';
 import { exportRegions } from './export.js';
 import { importRegions } from './import.js';
 import { listRegions } from './list.js';
+import { removeRegion } from './remove.js';
 
 /** The subcommands of `/region`, each in a file of its own in this folder. */
-const parts: readonly SubcommandPart[] = [importRegions, listRegions, exportRegions];
+const parts: readonly SubcommandPart[] = [importRegions, listRegions, exportRegions, removeRegion];
 
 /**
  * `/region`: the regions of a server, for staff. Discord offers it only to members who may
diff --git a/src/commands/regions/region.test.ts b/src/commands/regions/region.test.ts
index f5a26384d66f5c4b928c632ae08ecfd458bc4864..5c9dbfb6eafc984a9054c3949ce24f60e9fe9165 100644
--- a/src/commands/regions/region.test.ts
+++ b/src/commands/regions/region.test.ts
@@ -50,7 +50,7 @@ describe('/region: who may use it', () => {
     const json = region.data.toJSON();
     expect(json.default_member_permissions).toBe('32');
     expect(region.guards).toHaveLength(1);
-    expect([...region.subcommands.keys()]).toEqual(['import', 'list', 'export']);
+    expect([...region.subcommands.keys()]).toEqual(['import', 'list', 'export', 'remove']);
   });
 
   it('refuses a member who is not staff, whatever Discord let through', async () => {
diff --git a/src/commands/regions/remove.test.ts b/src/commands/regions/remove.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5bc7ffd6b3832ca2e512cffc22162da9b1a1003f
--- /dev/null
+++ b/src/commands/regions/remove.test.ts
@@ -0,0 +1,267 @@
+import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { answerOf, buttonId, buttonsOf } from '../../../test/support/gym-commands.js';
+import {
+  EAST_CHANNEL,
+  EAST_FORUM,
+  UNBOUNDED_CHANNEL,
+  WEST_CHANNEL,
+  WEST_FORUM,
+} from '../../../test/support/gyms.js';
+import { ALICE, REPORTER } from '../../../test/support/parties.js';
+import { MEMBER, regionCommandsWith } from '../../../test/support/region-commands.js';
+import { PartyStatus } from '../../domain/party/status.js';
+
+type Made = Awaited<ReturnType<typeof regionCommandsWith>>;
+
+/** Reports a raid at a gym and gives its post. */
+async function reported(made: Made, gymId: number): Promise<string> {
+  const gym = made.directory.get(gymId);
+  if (!gym) throw new Error(`no gym ${gymId}`);
+  const outcome = await made.service.reportRaid({
+    gym,
+    reporterId: REPORTER,
+    anonymous: false,
+    autoStatus: PartyStatus.Interested,
+    tier: { level: 'T5', shadow: false },
+    boss: null,
+  });
+  if (outcome.kind !== 'created') throw new Error(outcome.kind);
+  await made.service.flush();
+  return outcome.party.forumPostId ?? '';
+}
+
+function missingPermissions(): DiscordAPIError {
+  const code = RESTJSONErrorCodes.MissingPermissions;
+  return new DiscordAPIError(
+    { code, message: 'Missing Permissions' },
+    code,
+    403,
+    'DELETE',
+    '/x',
+    {},
+  );
+}
+
+describe('/region remove: the question', () => {
+  it('says what the removal does, counted, and offers both ways with the forum', async () => {
+    const made = await regionCommandsWith();
+    await reported(made, 1);
+    made.routes.add(ALICE, 1, 'Loop', [1, 2]);
+    made.routes.add(ALICE, 1, 'Other', [3]);
+    const used = await made.use('remove', { region: 'id:1' });
+    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    const answer = answerOf(used);
+    expect((answer.content ?? '').split('\n')).toEqual([
+      `Remove the region <#${WEST_CHANNEL}>? This cannot be undone.`,
+      '- 1 active raid, train or meetup will be ended; its post says why',
+      '- 8 gyms will lie in no region of this server: no raid can be reported there until a ' +
+        'region covers them',
+      '- 2 saved routes of members will go with it',
+      'Its text channel stays as it is, and no gym is deleted.',
+      `Its forum <#${WEST_FORUM}> can stay as history (its posts are archived and locked), or ` +
+        'be deleted. **Deleting the forum deletes every post in it for good.**',
+    ]);
+    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
+      'Remove, keep the forum',
+      'Remove and delete the forum',
+      'Cancel',
+    ]);
+    // Nothing has happened yet.
+    expect(made.regions.byId(1)).toBeDefined();
+    expect(made.store.inRegion(1)).toHaveLength(1);
+  });
+
+  it('offers only to remove where there is no forum to keep or delete', async () => {
+    const made = await regionCommandsWith();
+    const used = await made.use('remove', { region: 'unbounded' });
+    const answer = answerOf(used);
+    expect((answer.content ?? '').split('\n')).toEqual([
+      `Remove the region <#${UNBOUNDED_CHANNEL}>? This cannot be undone.`,
+      'Nothing goes with it.',
+      'Its text channel stays as it is, and no gym is deleted.',
+      'It has no forum.',
+    ]);
+    expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Remove', 'Cancel']);
+    made.gateway.gone.add(EAST_FORUM);
+    made.gateway.gone.add(EAST_CHANNEL);
+    const east = answerOf(await made.use('remove', { region: 'id:2' }));
+    expect(east.content).toContain(`Remove the region of the deleted channel ${EAST_CHANNEL}?`);
+    expect(east.content).toContain('Its forum is gone already.');
+    expect(east.content).not.toContain('text channel stays');
+  });
+
+  it('refuses a region of another server, or none', async () => {
+    const made = await regionCommandsWith();
+    for (const typed of ['id:99', 'nowhere']) {
+      const used = await made.use('remove', { region: typed });
+      expect(answerOf(used).content).toContain('is no region of this server');
+    }
+  });
+});
+
+describe('/region remove: the answers', () => {
+  it('says how many of its parties were ended when one could not be', async () => {
+    const made = await regionCommandsWith();
+    await reported(made, 1);
+    await reported(made, 2);
+    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    // The raid that is ended second cannot be ended: its row is gone from under it. (Both were
+    // made in the same millisecond, so which is second is the store's order, by id.)
+    const [, second] = made.store.inRegion(1);
+    if (!second) throw new Error('no second raid');
+    const post = second.forumPostId ?? '';
+    made.storage.rows.delete(second.id);
+    const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
+    expect(answerOf(pressed).content).toBe(
+      `I could not end <#${post}>, so the region was not removed. Try again in a moment; the ` +
+        'log says what failed.\n1 of its raids, trains and meetups was ended already.',
+    );
+  });
+
+  it('says when the regions could not be loaded again', async () => {
+    const made = await regionCommandsWith();
+    const question = answerOf(await made.use('remove', { region: 'id:3' }));
+    made.directory.load = () => Promise.reject(new Error('connection lost'));
+    const pressed = await made.press(buttonId(question, 'Remove'));
+    expect(answerOf(pressed).content).toContain(
+      'The region is removed, but I could not load the regions again: members see the change ' +
+        'after the next restart.',
+    );
+  });
+
+  it('names the forum the row had when it was removed, not what memory said', async () => {
+    const made = await regionCommandsWith();
+    const remove = made.regions.remove;
+    made.regions.remove = async (id, guildId) => {
+      const removed = await remove(id, guildId);
+      return removed.removed ? { ...removed, forumChannelId: EAST_FORUM } : removed;
+    };
+    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
+    expect(answerOf(pressed).content).toContain(`Its forum <#${EAST_FORUM}> stays as history.`);
+    // A row without a forum names none, whatever memory said.
+    const other = await regionCommandsWith();
+    other.regions.remove = async (id, guildId) => {
+      const removed = await remove.call(other.regions, id, guildId);
+      return removed.removed ? { ...removed, forumChannelId: null } : removed;
+    };
+    const asked = answerOf(await other.use('remove', { region: 'id:1' }));
+    const done = answerOf(await other.press(buttonId(asked, 'Remove, keep the forum')));
+    expect(done.content).not.toContain('<#>');
+    expect(done.content).not.toContain('Its forum');
+  });
+
+  it('removes the region and keeps the forum as history', async () => {
+    const made = await regionCommandsWith();
+    const post = await reported(made, 1);
+    made.routes.add(ALICE, 1, 'Loop', [1, 2]);
+    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
+    await made.settle();
+    expect(pressed.update).toHaveBeenCalledWith({
+      content: 'Removing the region… this message changes when it is done.',
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+    expect((answerOf(pressed).content ?? '').split('\n')).toEqual([
+      `Removed the region <#${WEST_CHANNEL}>.`,
+      '- 1 active raid, train or meetup was ended; its post says why',
+      '- 8 gyms now lie in no region of this server: no raid can be reported there until a ' +
+        'region covers them',
+      '- 1 saved route of members went with it',
+      `Its forum <#${WEST_FORUM}> stays as history.`,
+      'If members gave themselves a role for this region, take it off the list with ' +
+        '`/admin self-roles remove`.',
+    ]);
+    expect(answerOf(pressed).components).toEqual([]);
+    expect(made.regions.byId(1)).toBeUndefined();
+    expect(made.gateway.posts.get(post)).toMatchObject({ archived: true, locked: true });
+    expect(made.gateway.forums.has(WEST_FORUM)).toBe(true);
+    // The channel is no region now: a member asking there is told so.
+    const asked = await made.run('bounds', { userId: MEMBER, roleNames: [] });
+    expect(answerOf(asked).content).toContain('This channel is not a region.');
+  });
+
+  it('removes the region and deletes its forum when asked', async () => {
+    const made = await regionCommandsWith();
+    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    const pressed = await made.press(buttonId(question, 'Remove and delete the forum'));
+    expect(answerOf(pressed).content).toContain('Its forum was deleted, with every post in it.');
+    expect(made.gateway.deletedChannels).toEqual([WEST_FORUM]);
+  });
+
+  it('says when the forum could not be deleted, and that the region is gone all the same', async () => {
+    const made = await regionCommandsWith();
+    made.gateway.failing.set('deleteChannel', missingPermissions());
+    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    const pressed = await made.press(buttonId(question, 'Remove and delete the forum'));
+    expect(answerOf(pressed).content).toContain(
+      `I could not delete its forum <#${WEST_FORUM}> (I need Manage Channels there): delete it ` +
+        'by hand. The region is gone all the same.',
+    );
+    expect(made.regions.byId(1)).toBeUndefined();
+  });
+
+  it('says that nothing was removed when a party could not be ended', async () => {
+    const made = await regionCommandsWith();
+    const post = await reported(made, 1);
+    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    made.storage.failing = new Error('connection lost');
+    const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
+    made.storage.failing = undefined;
+    expect(answerOf(pressed).content).toBe(
+      `I could not end <#${post}>, so the region was not removed. Try again in a moment; the ` +
+        'log says what failed.',
+    );
+    expect(made.regions.byId(1)).toBeDefined();
+  });
+
+  it('says that the region is still there when its row could not be deleted', async () => {
+    const made = await regionCommandsWith();
+    await reported(made, 1);
+    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    made.regions.failing = new Error('connection lost');
+    const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
+    made.regions.failing = undefined;
+    expect((answerOf(pressed).content ?? '').split('\n')).toEqual([
+      'I could not remove the region, and it is still there (the log says what failed). Try ' +
+        'again in a moment.',
+      '1 of its raids, trains and meetups was ended before that.',
+    ]);
+  });
+
+  it('says that the region is gone when somebody removed it in between', async () => {
+    const made = await regionCommandsWith();
+    const first = answerOf(await made.use('remove', { region: 'id:3' }));
+    const second = answerOf(await made.use('remove', { region: 'id:3' }));
+    await made.press(buttonId(first, 'Remove'));
+    const late = await made.press(buttonId(second, 'Remove'));
+    expect(answerOf(late).content).toBe('That region no longer exists.');
+  });
+
+  it('keeps the region on Cancel', async () => {
+    const made = await regionCommandsWith();
+    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    const pressed = await made.press(buttonId(question, 'Cancel'));
+    expect(pressed.update).toHaveBeenCalledWith({
+      content: 'The region was kept.',
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+    expect(made.regions.byId(1)).toBeDefined();
+  });
+
+  it('ends a party that was made between the question and the press', async () => {
+    const made = await regionCommandsWith();
+    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    const post = await reported(made, 2);
+    const pressed = await made.press(buttonId(question, 'Remove, keep the forum'));
+    expect(answerOf(pressed).content).toContain(
+      '- 1 active raid, train or meetup was ended; its post says why',
+    );
+    expect(made.gateway.posts.get(post)?.archived).toBe(true);
+  });
+});
diff --git a/src/commands/regions/remove.ts b/src/commands/regions/remove.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7c8381ca32bed466e67ed93f1f94dd5643d1bc19
--- /dev/null
+++ b/src/commands/regions/remove.ts
@@ -0,0 +1,213 @@
+import {
+  ActionRowBuilder,
+  ButtonStyle,
+  SlashCommandSubcommandBuilder,
+  type ButtonBuilder,
+} from 'discord.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import { UserError } from '../../discord/errors.js';
+import { partyWord } from '../../domain/party/party.js';
+import { count } from '../../render/text.js';
+import type { RemovalOutcome } from '../../services/region-admin-service.js';
+import { chosenRegion, respondWithRegions, withRegionOption } from './region-option.js';
+import {
+  button,
+  content,
+  pendingRegions,
+  REGION_GONE,
+  regionInSentence,
+  regionStaff,
+  selfRoleReminder,
+  type ButtonAnswer,
+} from './shared.js';
+
+const parties = (n: number): string =>
+  count(n, 'active raid, train or meetup', 'active raids, trains and meetups');
+
+/** "1 of its raids, trains and meetups was", "2 of … were". */
+const ofIts = (n: number): string =>
+  `${n} of its raids, trains and meetups ${n === 1 ? 'was' : 'were'}`;
+
+/** What goes with a region, as lines; `tense` words them for the question or for the answer. */
+function goesWith(
+  counted: { parties: number; strandedGyms: number; routes: number },
+  tense: 'will' | 'did',
+): string[] {
+  const will = tense === 'will';
+  return [
+    ...(counted.parties > 0
+      ? [
+          `- ${parties(counted.parties)} ` +
+            `${will ? 'will be' : counted.parties === 1 ? 'was' : 'were'} ended; ` +
+            `${counted.parties === 1 ? 'its post says' : 'their posts say'} why`,
+        ]
+      : []),
+    ...(counted.strandedGyms > 0
+      ? [
+          `- ${count(counted.strandedGyms, 'gym')} ${will ? 'will lie' : 'now lie'} in no ` +
+            'region of this server: no raid can be reported there until a region covers ' +
+            `${counted.strandedGyms === 1 ? 'it' : 'them'}`,
+        ]
+      : []),
+    ...(counted.routes > 0
+      ? [
+          `- ${count(counted.routes, 'saved route')} of members ` +
+            `${will ? 'will go' : 'went'} with it`,
+        ]
+      : []),
+  ];
+}
+
+/**
+ * `/region remove`: takes a region off the server, explicitly (a region is never removed by
+ * itself). The staff member is asked first, with what the removal does, counted, and what
+ * becomes of the region's forum is theirs to choose.
+ */
+export const removeRegion: SubcommandPart = {
+  data: withRegionOption(
+    new SlashCommandSubcommandBuilder()
+      .setName('remove')
+      .setDescription('Remove a region, with what goes with it'),
+    'The region: pick it from the list, or name its channel',
+    true,
+  ),
+  help: {
+    details:
+      'For a region that is given up, or whose channel was deleted. I ask first and say what ' +
+      'goes with it: its active raids, trains and meetups are ended (their posts say why), ' +
+      'the routes members saved for it are deleted, and its gyms lie in no region of this ' +
+      'server afterwards (they are never deleted). Its text channel is not touched. You ' +
+      'choose what becomes of its forum: it can stay as history, with its posts archived and ' +
+      'locked, or be deleted with every post in it. A region is never removed by itself, ' +
+      'also not when its channel is gone: `/region list` shows such a region as a deleted ' +
+      'channel, and it can be picked here.',
+    examples: ['/region remove region:#north-hills'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const staff = await regionStaff(interaction, ctx);
+    const region = chosenRegion(interaction, ctx, staff);
+    const question = region && (await ctx.regionAdmin.removalQuestion(region.id, staff));
+    if (!question) throw new UserError(REGION_GONE);
+    const channels = ctx.regionAdmin.channelsOf(staff);
+    const label = regionInSentence(question.region, channels);
+    const going = goesWith(question, 'will');
+    const forumId = question.region.forumChannelId;
+    const token = pendingRegions.put(interaction.user.id, {
+      what: 'remove',
+      regionId: question.region.id,
+    });
+    const hasForum = question.forum === 'there' && forumId !== null;
+    await interaction.editReply({
+      content: content([
+        `Remove ${label}? This cannot be undone.`,
+        ...(going.length === 0 ? ['Nothing goes with it.'] : going),
+        question.channel === 'there'
+          ? 'Its text channel stays as it is, and no gym is deleted.'
+          : 'No gym is deleted.',
+        ...(hasForum
+          ? [
+              `Its forum <#${forumId}> can stay as history (its posts are archived and ` +
+                'locked), or be deleted. **Deleting the forum deletes every post in it for ' +
+                'good.**',
+            ]
+          : [question.forum === 'gone' ? 'Its forum is gone already.' : 'It has no forum.']),
+      ]),
+      components: [
+        new ActionRowBuilder<ButtonBuilder>().addComponents(
+          ...(hasForum
+            ? [
+                button(token, 'keep', 'Remove, keep the forum', ButtonStyle.Danger),
+                button(token, 'delete', 'Remove and delete the forum', ButtonStyle.Danger),
+              ]
+            : [button(token, 'keep', 'Remove', ButtonStyle.Danger)]),
+          button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
+        ),
+      ],
+    });
+  },
+  autocomplete: respondWithRegions,
+};
+
+/** What a removal did, as lines. */
+function outcomeLines(
+  outcome: Exclude<RemovalOutcome, { kind: 'gone' }>,
+  label: string,
+  reminder: string | undefined,
+): string[] {
+  if (outcome.kind === 'stuck') {
+    const post = outcome.party.forumPostId;
+    const which =
+      post === null ? `a ${partyWord(outcome.party)} that has no post yet` : `<#${post}>`;
+    return [
+      `I could not end ${which}, so the region was not removed. Try again in a moment; the ` +
+        'log says what failed.',
+      ...(outcome.ended > 0 ? [`${ofIts(outcome.ended)} ended already.`] : []),
+    ];
+  }
+  if (outcome.kind === 'failed') {
+    return [
+      'I could not remove the region, and it is still there (the log says what failed). Try ' +
+        'again in a moment.',
+      ...(outcome.ended > 0 ? [`${ofIts(outcome.ended)} ended before that.`] : []),
+    ];
+  }
+  // The forum of the row as it was deleted: what the service decided about.
+  const forumId = outcome.forumChannelId;
+  const forumName = forumId === null ? 'its forum' : `its forum <#${forumId}>`;
+  const forum: Readonly<Record<typeof outcome.forum, string | undefined>> = {
+    none: undefined,
+    gone: undefined,
+    kept: forumId === null ? undefined : `Its forum <#${forumId}> stays as history.`,
+    deleted: 'Its forum was deleted, with every post in it.',
+    'not-deleted':
+      `I could not delete ${forumName}` +
+      (outcome.forumDenied === true ? ' (I need Manage Channels there)' : ' (the log says why)') +
+      ': delete it by hand. The region is gone all the same.',
+  };
+  return [
+    `Removed ${label}.`,
+    ...(outcome.reloaded
+      ? []
+      : [
+          'The region is removed, but I could not load the regions again: members see the ' +
+            'change after the next restart.',
+        ]),
+    ...goesWith({ ...outcome, parties: outcome.ended }, 'did'),
+    forum[outcome.forum],
+    reminder,
+  ].filter((line): line is string => line !== undefined);
+}
+
+/**
+ * A button under the question was pressed. Everything is decided again now (the question may
+ * be minutes old), by the service, and what the answer counts is what really went; the answer
+ * takes the place of the question.
+ */
+const removal =
+  (forum: 'keep' | 'delete'): ButtonAnswer =>
+  async (interaction, ctx, request) => {
+    if (request.what !== 'remove') return;
+    const staff = await regionStaff(interaction, ctx);
+    const before = ctx.regionAdmin.regionOf(request.regionId, staff.guildId);
+    // Named by what the server has before the removal: the channel does not go with it.
+    const label = before
+      ? regionInSentence(before, ctx.regionAdmin.channelsOf(staff))
+      : 'that region';
+    const outcome = await ctx.regionAdmin.remove(request.regionId, staff, forum);
+    const lines =
+      outcome.kind === 'gone'
+        ? [REGION_GONE]
+        : outcomeLines(outcome, label, selfRoleReminder(ctx, 'removed'));
+    await interaction.editReply({
+      content: content(lines),
+      embeds: [],
+      components: [],
+      attachments: [],
+    });
+  };
+
+export const removeAnswers: Readonly<Record<string, ButtonAnswer>> = {
+  'remove:keep': removal('keep'),
+  'remove:delete': removal('delete'),
+};
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 5df03c1f1a5912301eab7d87362b85c7c174ced8..17205914c7183106c19e2b41c2939813c269fef8 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -25,6 +25,12 @@
  * either form: `gym:<token>:reopen`, which opens the form again with what was typed. Under the question of
  * `/gym move`: `gym:<token>:move` and `gym:<token>:cancel`; under that of `/gym delete`:
  * `gym:<token>:delete` and `gym:<token>:cancel`.
+ *
+ * The controls of `/region` have the kind `region` (`src/commands/regions/controls.ts`), with
+ * the token of a pending request as the id, as for `/gym`. Under the preview of `/region
+ * import`: `region:<token>:import` and `region:<token>:cancel`; under the question of `/region
+ * remove`: `region:<token>:keep` (remove, keep the forum), `region:<token>:delete` (remove and
+ * delete the forum) and `region:<token>:cancel`.
  */
 export const MAX_CUSTOM_ID_LENGTH = 100;
 const SEPARATOR = ':';
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 131307a609764f5163dff09709e8b7babbc19b27..228591f48d8d4d8ca073d0d4b062a6df274acf28 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -1337,6 +1337,26 @@ export class PartyService {
     return archived;
   }
 
+  /**
+   * The forums of a server (by its snowflake) that parties name and no region has, and that
+   * still exist: the forums of regions that were removed and kept as history, or deleted
+   * outside the bot. Nothing is ever done to them but the sweep of `sweepPosts`; staff are
+   * told of them (`/region list`, `/admin setup-forums`).
+   */
+  async orphanForums(guildId: string): Promise<string[]> {
+    const { store, regions, guilds, gateway } = this.options;
+    const row = await guilds.idFor(guildId);
+    if (row === undefined) return [];
+    const channels = gateway.serverChannels(guildId);
+    // Asked of the database for this server alone (by the index of migration 011).
+    const named = (await store.partyForums(row)).map((forum) => forum.forumChannelId);
+    return [...new Set(named)].filter(
+      (forumId) =>
+        regions.byForum(forumId) === undefined &&
+        channels?.find((channel) => channel.id === forumId)?.kind === 'forum',
+    );
+  }
+
   /**
    * Makes sure every region that has a forum has its summary post (one deleted by hand is
    * noticed here at the latest) and has each brought up to date. Never rejects.
diff --git a/src/services/region-admin-service.ts b/src/services/region-admin-service.ts
index 6e52460889d590dce9498ad7d0c60417bfbf0846..0b58363c7a5aab4cae5dc49b1d075bb0b64fe7d9 100644
--- a/src/services/region-admin-service.ts
+++ b/src/services/region-admin-service.ts
@@ -178,8 +178,8 @@ export interface RegionAdminOptions {
     regionsOf(gymId: number): string[];
     load(): Promise<void>;
   };
-  store: Pick<PartyStore, 'active' | 'inRegion' | 'partyForums' | 'closeRegion' | 'reopenRegion'>;
-  posts: Pick<PartyService, 'end' | 'changed' | 'setupForums' | 'forgetTags'>;
+  store: Pick<PartyStore, 'active' | 'inRegion' | 'closeRegion' | 'reopenRegion'>;
+  posts: Pick<PartyService, 'end' | 'changed' | 'setupForums' | 'forgetTags' | 'orphanForums'>;
   routes: Pick<SavedRouteUpkeep, 'countInRegion'>;
   gateway: Pick<
     PartyGateway,
@@ -552,21 +552,8 @@ export class RegionAdminService {
    * The forums that parties of this server name and no region has, and that still exist: the
    * forums of regions that were removed (and kept), or deleted outside the bot.
    */
-  async orphanForums(staff: Pick<RegionStaff, 'guildId' | 'server'>): Promise<string[]> {
-    const { store, regions, gateway } = this.options;
-    const channels = gateway.serverChannels(staff.server);
-    const named = await store.partyForums();
-    return [
-      ...new Set(
-        named
-          .filter(({ guildId }) => guildId === staff.guildId)
-          .map(({ forumChannelId }) => forumChannelId),
-      ),
-    ].filter(
-      (forumId) =>
-        regions.byForum(forumId) === undefined &&
-        channels?.find((channel) => channel.id === forumId)?.kind === 'forum',
-    );
+  orphanForums(staff: Pick<RegionStaff, 'server'>): Promise<string[]> {
+    return this.options.posts.orphanForums(staff.server);
   }
 
   /** The regions of the server with what is wrong with each, and what belongs to none. */
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto/phase-5b HEAD -- src test scripts` prints nothing; `npm run check`, `npm run build` and `npm run test:db`, each once and one after the other.
2. Whole-branch review (Opus, high effort) of the six commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and conventions for `ctx.regionAdmin` (`RegionAdminService`, `AdminLock`, the order of an import and of a removal, `PartyStore.closeRegion`), the KML readers, `AttachmentGateway`, `/bounds`, the custom-id kind `region`, the test twins.
4. `docs/superpowers/plans/phase-0-follow-ups.md`: a "From Phase 5B" section (what staging must verify, what is left open, the items for Phase 8: Manage Channels for the import, the unique key's condition). The Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord. Each step needs Matt's go-ahead; the bot is started by Matt. `npm run deploy-commands -- --guild <test server>` comes first (two new commands, `/region` and `/bounds`). One migration (011). The bot needs Manage Channels for an import that creates channels.

What no test can show (try these first):

- [ ] A KML file exported from Google My Maps with two areas, one named after an existing channel and one new: the preview names the new channel and its category; "Import and create…": the channel, the category and the forum exist, named as the preview said (note how Discord changed any name).
- [ ] The same file with a typo in the existing area's name: "did you mean". A KMZ file: the sentence on how to export KML.
- [ ] `/region export` (All regions), then import that file unchanged: every outline "unchanged".
- [ ] `/bounds` in a region channel, in its forum and in a post there (the second account): the picture and the gym count; in another channel the refusal.
- [ ] With the second account (not staff): `/region` is not offered.

Staff:

- [ ] `/region import file channel:#x` with a one-area file: a new outline for `#x`; `/region list` shows it.
- [ ] `/region list` on the test server: the problems shown are true (delete a test channel first to see "channel gone").
- [ ] `/region remove` of a test region with an active raid: the question counts it; "Remove, keep the forum": the raid's post says why it closed, the forum stays, `/region list` names it as a forum no region has, `/admin setup-forums` too. A second removal test with "Remove and delete the forum": the forum is gone.
- [ ] Take Manage Channels from the bot: the preview says so and offers only what needs no creation.

To note down: how long an import of several new regions takes, and whether gym commands wait meanwhile.
