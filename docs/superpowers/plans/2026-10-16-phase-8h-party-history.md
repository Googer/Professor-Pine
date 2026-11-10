# Phase 8H: Party History: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pine keeps a history of every party, in relational tables that answer statistics questions with plain SQL: every party that ends from now on is recorded once, legacy Pine's seven years of parties are imported from its `parties/` folder, and a member's id is kept only if that member opted in (`/settings history`, per server) — anonymous attendance still counts in every aggregate.

**Architecture:** The third plan of the cutover work (`docs/superpowers/specs/2026-10-16-cutover-docker-history-design.md`, section 4.3). Migration 018 adds `PartyHistory` (one row per ended party, the server by its snowflake with no foreign key, so the history outlives the server's `Guild` row), `PartyHistoryAttendee`, `PartyHistoryGroup`, `PartyHistoryStop`, `PartyHistoryStep` (what an active party's model does not keep: who did what when), `HistoryOptIn` and `EndedPartyPost`. `PartyStore` hands every write a note (`PartyHistory`, pure part in `src/domain/history/`); when a write ends a party, `PartyRepository` writes the record in the same transaction behind a savepoint and deletes the live `Party` row (which holds every attendee's id), keeping only the post and forum ids in `EndedPartyPost`; a failed record is retried and swept, never blocking the party's end. A moved raid is recorded once, with the steps of every party it went on from. `npm run history:import` / `./pine import-history` imports the legacy folder best effort and idempotently, never with a member id. `docs/architecture/history.md` documents the tables and 14 questions as SQL, which a database test runs from the doc's own text.

**Tech Stack:** TypeScript 6.0, Node 24, Kysely on MySQL 8.4 (savepoints, `forShare()`, `convert_tz` with named zones), Vitest, POSIX `sh`. No new dependency. **One migration (018)**; `/settings` gains the `history` subcommand (the commands are registered again at staging).

**Spec:** the design brief `.superpowers/sdd/2026-10-16-phase-8h-party-history/design.md` (git-ignored; T1–T6) and the design document above; Matt's answers of 2026-10-16: store all data, relational, private at first; opt-in per member (per server) for ids, anonymous rows count; everyone starts from zero (legacy aggregate-only); best-effort import; the history outlives the server; the live row is deleted once the record exists.

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8h`), one commit per task, each commit typechecked with its own unit and database tests green, and the full check (6,508 unit tests), the build and the database suite (405) clean on the tip. The import was measured on a copy of Pittsburgh's legacy folder in MySQL 8.4: 253,533 parties read, 253,188 imported, 340 duplicates, 5 skipped, 81 s; a second run writes nothing in 20 s; no member id stored. Two Opus reviewers went through the prototype (T1–T3, T4–T6), a third through the fixes, which are folded into the commits below. The third review's findings (8H-1 to 8H-8) are the final fix wave, after the last task.

## Decisions in this plan

Matt's: listed under Spec above.

Made while prototyping, for Matt to look at:

1. **The opt-in is per server** (`/settings history enabled:`), like new-train notifications; opting out takes the member's id out of every record of that server already kept (the rows stay and still count).
2. **Endings:** `completed` when somebody completed the raid (or was at the train or meetup), whatever closed it; `expired`; `cancelled` (closed before anyone got there); `cutover` (legacy active parties); `unknown` (the sweep, legacy without evidence).
3. **What is kept while a party is going on:** every member's id (as the live party itself holds them); after it ends only opted-in ids. The help text says so.
4. **The import** matches regions by the legacy region channel, the server from the regions that matched (or `--server`), gyms by id only on a database taken over from the legacy bot, bosses through the catalogue; free text is scrubbed of mentions; one bad record never ends the run.
5. **The first start on an existing database** records (as `unknown`) and deletes every ended party already there; their posts stay archivable through `EndedPartyPost`. On the dev database this happens at the first staging start.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS or the legacy `data/*.json` files. Never read, print or stage `.env`. The legacy parties copy (member data) never enters the repository.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure. **Tests never use the network** and never wait on real time (`docs/architecture/testing.md`; one documented 300 ms MySQL lock wait).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8h`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed. `pine` stays mode 755.
- A task needs the typecheck and its own tests green; the full `npm run check`, the build and `npm run test:db` after the last task, through the npm scripts (the suite lock). `npx prettier --write` on touched files. `src/db/types.ts` is generated (it is in the diffs as generated).
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. No member id of a member who did not opt in survives a party's end anywhere (history tables, steps, the live row, ended-post table, free text).
2. Every ended party recorded exactly once; recording never blocks or breaks a party's end.
3. The history outlives the server; the queries answer Matt's questions correctly (local time, opt-in respected).
4. The legacy import: idempotent, best effort, no member id, correct matching.
5. The migration is additive and safe to run again; `PINE_TABLES` lists every new table.

### Task 1: Plan 8H T1: the party history tables (migration 018)

Prototype commit: `7b9955296bec86d29a83e49503e28e0947c8d5aa`

PartyHistory (a row per ended party, live or from the legacy files, with
its counts), PartyHistoryAttendee, PartyHistoryGroup, PartyHistoryStop,
HistoryOptIn (per member and server), PartyHistoryStep (what happens to
an active party that the live model does not keep, folded into its
history when it ends) and EndedPartyPost (the post and forum of a party
whose row was deleted once its history was written, for the archiving of
reopened posts and the forums parties named; no member, no party id).

The server is its snowflake and region and gym carry no foreign key: the
history and the opt-ins outlive a server's Guild row, a region or a gym
(Matt, 2026-10-16). Indexes for the questions, and on createdById and
conductorId for an opt-out. Additive and safe to run again; types
regenerated, the restore's table list and the migrator test extended.

**Files:**

```
 src/db/migrations/2026_10_16_018_party_history.db.test.ts | 126 +++++++++++++++++++++++
 src/db/migrations/2026_10_16_018_party_history.ts         | 181 ++++++++++++++++++++++++++++++++++
 src/db/migrations/index.ts                                |   2 +
 src/db/migrator.db.test.ts                                |   8 ++
 src/db/table-names.ts                                     |   7 ++
 src/db/types.ts                                           | 113 +++++++++++++++++++++
 6 files changed, 437 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/migrations/2026_10_16_018_party_history.db.test.ts src/db/migrator.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 7b9955296bec86d29a83e49503e28e0947c8d5aa -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8h-party-history.md'` prints nothing (and file modes match: `pine` is 100755).
- [ ] **Step 5: Commit** with the title `Plan 8H T1: the party history tables (migration 018)`, the body above and the trailer, staging exactly
  `src/db/migrations/2026_10_16_018_party_history.db.test.ts src/db/migrations/2026_10_16_018_party_history.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/table-names.ts src/db/types.ts`.

````diff
diff --git a/src/db/migrations/2026_10_16_018_party_history.db.test.ts b/src/db/migrations/2026_10_16_018_party_history.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0753810a3d840dd24cea23c482b89307285c1183
--- /dev/null
+++ b/src/db/migrations/2026_10_16_018_party_history.db.test.ts
@@ -0,0 +1,126 @@
+import { sql, type Kysely } from 'kysely';
+import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import type { DB } from '../types.js';
+import { partyHistory } from './2026_10_16_018_party_history.js';
+
+const HOME = '412345678901234567';
+const PARTY = '00000000-0000-4000-8000-000000000001';
+const MEMBER = '200000000000000002';
+
+describe('migration 018: the party history', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+
+  beforeAll(async () => {
+    ({ db, stop } = await startMigratedDatabase());
+  });
+  afterAll(async () => {
+    await stop();
+  });
+  beforeEach(async () => {
+    await sql`delete from Guild`.execute(db);
+    await sql`delete from Gym`.execute(db);
+    // The history and the opt-ins outlive the servers' rows: cleared by hand.
+    await sql`delete from PartyHistory`.execute(db);
+    await sql`delete from HistoryOptIn`.execute(db);
+    await sql`insert into Guild (id, snowflake) values (1, ${HOME})`.execute(db);
+    await sql`insert into Region (id, guildId, channelId) values (5, 1, 1234567890123456789)`.execute(
+      db,
+    );
+    await sql`insert into Gym (id, lat, lon, name) values (7, 40.4, -79.9, 'Library')`.execute(db);
+  });
+
+  const count = async (table: string): Promise<number> => {
+    const rows = await sql<{ n: number }>`select count(*) as n from ${sql.table(table)}`.execute(
+      db,
+    );
+    return Number(rows.rows[0]?.n ?? 0);
+  };
+  const insertHistory = (values: { partyId?: string; legacyKey?: string; gymId?: number }) =>
+    sql`insert into PartyHistory
+          (source, partyId, legacyKey, kind, serverId, regionId, gymId, createdAt, ending)
+        values (${values.partyId ? 'live' : 'legacy'}, ${values.partyId ?? null},
+                ${values.legacyKey ?? null}, 'raid', ${HOME}, 5, ${values.gymId ?? null}, 1000,
+                'completed')`.execute(db);
+  const historyId = async (): Promise<number> => {
+    const rows = await sql<{ id: number }>`select max(id) as id from PartyHistory`.execute(db);
+    return Number(rows.rows[0]?.id);
+  };
+
+  it('keeps a live party once and a party of the legacy files once', async () => {
+    await insertHistory({ partyId: PARTY });
+    await expect(insertHistory({ partyId: PARTY })).rejects.toThrow(/Duplicate entry/u);
+    await insertHistory({ legacyKey: '300000000000000001:1500000000000' });
+    await expect(insertHistory({ legacyKey: '300000000000000001:1500000000000' })).rejects.toThrow(
+      /Duplicate entry/u,
+    );
+    expect(await count('PartyHistory')).toBe(2);
+  });
+
+  it('keeps the gym and region of a party when they are deleted later', async () => {
+    await insertHistory({ partyId: PARTY, gymId: 7 });
+    await sql`delete from Gym where id = 7`.execute(db);
+    await sql`delete from Region where id = 5`.execute(db);
+    const rows = await sql<{
+      gymId: number;
+      regionId: number;
+    }>`select gymId, regionId from PartyHistory`.execute(db);
+    expect(rows.rows).toEqual([{ gymId: 7, regionId: 5 }]);
+  });
+
+  it('takes the attendees, groups and stops of a party with it', async () => {
+    await insertHistory({ partyId: PARTY });
+    const id = await historyId();
+    await sql`insert into PartyHistoryAttendee (historyId, seq, memberId, status, furthest)
+              values (${id}, 0, ${MEMBER}, 'done', 'done'), (${id}, 1, null, null, 'joined')`.execute(
+      db,
+    );
+    await sql`insert into PartyHistoryGroup (historyId, groupId, members, heads)
+              values (${id}, 'A', 2, 3)`.execute(db);
+    await sql`insert into PartyHistoryStop (historyId, seq, gymId) values (${id}, 0, 7)`.execute(
+      db,
+    );
+    await sql`delete from PartyHistory where id = ${id}`.execute(db);
+    expect(await count('PartyHistoryAttendee')).toBe(0);
+    expect(await count('PartyHistoryGroup')).toBe(0);
+    expect(await count('PartyHistoryStop')).toBe(0);
+  });
+
+  it("keeps a server's history and opt-ins when its Guild row goes (Matt, 2026-10-16)", async () => {
+    await insertHistory({ partyId: PARTY });
+    await sql`insert into HistoryOptIn (serverId, memberId, createdAt)
+              values (${HOME}, ${MEMBER}, 1000)`.execute(db);
+    await sql`insert into EndedPartyPost (forumPostId, forumChannelId, guildId, endedAt)
+              values ('900000000000000001', '900000000000000002', 1, 1000)`.execute(db);
+    await sql`delete from Guild where id = 1`.execute(db);
+    expect(await count('PartyHistory')).toBe(1);
+    expect(await count('HistoryOptIn')).toBe(1);
+    // What stands in for an ended party's row goes with its server, as the row would.
+    expect(await count('EndedPartyPost')).toBe(0);
+  });
+
+  it('indexes who made a party and who led it, for an opt-out', async () => {
+    const indexed = await sql<{ c: string }>`
+      select distinct column_name as c from information_schema.statistics
+      where table_schema = database() and table_name = 'PartyHistory'
+        and column_name in ('createdById', 'conductorId') and seq_in_index = 1`.execute(db);
+    expect(indexed.rows.map((row) => row.c).sort()).toEqual(['conductorId', 'createdById']);
+  });
+
+  it('keeps the steps of an active party only as long as the party', async () => {
+    await sql`insert into Party (id, guildId, type, mirrorMessages, createdById, state, createdAt,
+                                 updatedAt)
+              values (${PARTY}, 1, 'raid', '[]', ${MEMBER}, '{}', 1000, 1000)`.execute(db);
+    await sql`insert into PartyHistoryStep (partyId, at, kind, subject, value)
+              values (${PARTY}, 1000, 'status', ${MEMBER}, 1)`.execute(db);
+    await sql`delete from Party where id = ${PARTY}`.execute(db);
+    expect(await count('PartyHistoryStep')).toBe(0);
+  });
+
+  it('can run again over what it made, keeping every row', async () => {
+    await insertHistory({ partyId: PARTY });
+    await partyHistory.up(db);
+    expect(await count('PartyHistory')).toBe(1);
+  });
+});
diff --git a/src/db/migrations/2026_10_16_018_party_history.ts b/src/db/migrations/2026_10_16_018_party_history.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ba329e6c509f720990e526b067397dd0e9349990
--- /dev/null
+++ b/src/db/migrations/2026_10_16_018_party_history.ts
@@ -0,0 +1,181 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * The party history (plan 8H; spec `2026-10-16-cutover-docker-history-design.md`, 4.3): a row
+ * for every party that ended, in tables that plain SQL can count and group, beside the live
+ * `Party` table, which stays as it is.
+ *
+ * - `PartyHistory`: one row per ended party, of the live bot (`source` `live`, `partyId` the
+ *   `Party.id`, unique) or imported from the legacy bot's files (`source` `legacy`, `legacyKey`
+ *   unique: `<channel id>:<creation time>`). What it was (`kind`, `tier`, the boss), where
+ *   (`serverId`, `regionId`, `gymId`), when (`createdAt`, `hatchTime`, `startTime`, `endTime`,
+ *   `endedAt`, epoch milliseconds), how it ended (`ending`), and the counts of its attendees by
+ *   the furthest status each reached. `createdById` and `conductorId` hold a member only with
+ *   their opt-in (`HistoryOptIn`). The server is its snowflake, and region and gym carry no
+ *   foreign key: the history outlives a server's `Guild` row (a kick and a new invite neither
+ *   delete nor split it; Matt, 2026-10-16) and keeps a region or gym that is deleted later.
+ * - `PartyHistoryAttendee`: a row per member who signed up (`seq` in the order they did),
+ *   whether or not they stayed; `memberId` only with their opt-in, otherwise null.
+ * - `PartyHistoryGroup`: a row per group of the party.
+ * - `PartyHistoryStop`: a row per stop a train made, in the order it made them.
+ * - `HistoryOptIn`: a row per member and server (by snowflake, no foreign key, like the history)
+ *   who asked for their id to be kept (`/settings history`).
+ * - `PartyHistoryStep`: what happened to a party while it is active (a member's status, a member
+ *   leaving, a train's stop, a group's meeting time, the party it moved from), which the live
+ *   model does not keep; read into the party's history when it ends, then deleted. It goes with
+ *   its `Party` row.
+ * - `EndedPartyPost`: the post and forum of a party whose `Party` row was deleted once its
+ *   history was written (the row holds the ids of its maker and members; Matt, 2026-10-16), for
+ *   what still reads them: the hourly archiving of reopened posts and the forums parties named.
+ *   No member and no party id; it goes with the server's `Guild` row, as `Party` rows do.
+ *
+ * 018: after 8W-2's `017_wayspot`, which is merged first (the migrator refuses a migration
+ * that sorts before one that has run); 016 stays unused.
+ *
+ * Safe to run again after a failure half-way: each table is created only when it is missing.
+ */
+export const partyHistory: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    await sql`
+      create table if not exists PartyHistory (
+        id int unsigned not null auto_increment,
+        source varchar(8) not null,
+        partyId char(36) default null,
+        legacyKey varchar(64) default null,
+        kind varchar(8) not null,
+        serverId varchar(30) not null,
+        regionId int unsigned default null,
+        gymId int unsigned default null,
+        legacyGymId int unsigned default null,
+        name varchar(100) default null,
+        description text default null,
+        tier varchar(16) default null,
+        shadow tinyint(1) not null default 0,
+        mega tinyint(1) not null default 0,
+        elite tinyint(1) not null default 0,
+        ex tinyint(1) not null default 0,
+        shiny tinyint(1) default null,
+        bossKey varchar(64) default null,
+        bossDex smallint unsigned default null,
+        bossSpecies varchar(64) default null,
+        bossForm varchar(64) default null,
+        bossName varchar(100) default null,
+        fastMove varchar(64) default null,
+        chargedMove varchar(64) default null,
+        createdAt bigint not null,
+        hatchTime bigint default null,
+        startTime bigint default null,
+        endTime bigint default null,
+        endedAt bigint default null,
+        ending varchar(10) not null,
+        createdById varchar(30) default null,
+        conductorId varchar(30) default null,
+        anonymous tinyint(1) not null default 0,
+        routeStops smallint unsigned default null,
+        attendees smallint unsigned not null default 0,
+        interested smallint unsigned not null default 0,
+        joined smallint unsigned not null default 0,
+        here smallint unsigned not null default 0,
+        done smallint unsigned not null default 0,
+        interestedHeads smallint unsigned not null default 0,
+        joinedHeads smallint unsigned not null default 0,
+        hereHeads smallint unsigned not null default 0,
+        doneHeads smallint unsigned not null default 0,
+        extras smallint unsigned not null default 0,
+        remote smallint unsigned not null default 0,
+        departed smallint unsigned not null default 0,
+        primary key (id),
+        unique key partyhistory_partyid_unique (partyId),
+        unique key partyhistory_legacykey_unique (legacyKey),
+        key partyhistory_server_kind_createdat_index (serverId, kind, createdAt),
+        key partyhistory_gymid_index (gymId),
+        key partyhistory_regionid_index (regionId),
+        key partyhistory_bosskey_index (bossKey),
+        key partyhistory_createdbyid_index (createdById),
+        key partyhistory_conductorid_index (conductorId)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists PartyHistoryAttendee (
+        historyId int unsigned not null,
+        seq smallint unsigned not null,
+        memberId varchar(30) default null,
+        status varchar(10) default null,
+        furthest varchar(10) not null,
+        groupId char(1) default null,
+        extras tinyint unsigned not null default 0,
+        remote tinyint(1) not null default 0,
+        team varchar(8) default null,
+        signedUpAt bigint default null,
+        joinedAt bigint default null,
+        hereAt bigint default null,
+        doneAt bigint default null,
+        leftAt bigint default null,
+        primary key (historyId, seq),
+        key partyhistoryattendee_memberid_index (memberId),
+        constraint partyhistoryattendee_historyid_foreign foreign key (historyId)
+          references PartyHistory (id) on delete cascade
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists PartyHistoryGroup (
+        historyId int unsigned not null,
+        groupId char(1) not null,
+        label varchar(100) default null,
+        meetingTime bigint default null,
+        members smallint unsigned not null default 0,
+        heads smallint unsigned not null default 0,
+        primary key (historyId, groupId),
+        constraint partyhistorygroup_historyid_foreign foreign key (historyId)
+          references PartyHistory (id) on delete cascade
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists PartyHistoryStop (
+        historyId int unsigned not null,
+        seq smallint unsigned not null,
+        gymId int unsigned default null,
+        legacyGymId int unsigned default null,
+        arrivedAt bigint default null,
+        leftAt bigint default null,
+        primary key (historyId, seq),
+        key partyhistorystop_gymid_index (gymId),
+        constraint partyhistorystop_historyid_foreign foreign key (historyId)
+          references PartyHistory (id) on delete cascade
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists HistoryOptIn (
+        serverId varchar(30) not null,
+        memberId varchar(30) not null,
+        createdAt bigint not null,
+        primary key (serverId, memberId)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists PartyHistoryStep (
+        id bigint unsigned not null auto_increment,
+        partyId char(36) not null,
+        at bigint not null,
+        kind varchar(8) not null,
+        subject varchar(36) not null,
+        value bigint default null,
+        primary key (id),
+        key partyhistorystep_partyid_at_index (partyId, at),
+        key partyhistorystep_kind_subject_index (kind, subject),
+        constraint partyhistorystep_partyid_foreign foreign key (partyId) references Party (id)
+          on delete cascade
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists EndedPartyPost (
+        forumPostId varchar(30) not null,
+        forumChannelId varchar(30) not null,
+        guildId int unsigned not null,
+        endedAt bigint not null,
+        primary key (forumPostId),
+        key endedpartypost_guildid_forumchannelid_index (guildId, forumChannelId),
+        constraint endedpartypost_guildid_foreign foreign key (guildId) references Guild (id)
+          on delete cascade
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+  },
+  async down() {
+    // Additive only: nothing is ever dropped.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index 6673223154f225df1a282143b1a1db64eb6794dc..f91aa4c0ab672fc15fbee730c2a236898c49d367 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -16,6 +16,7 @@ import { savedRouteAtEnd } from './2026_10_16_013_saved_route_at_end.js';
 import { gymLookups } from './2026_10_16_014_gym_lookups.js';
 import { webSession } from './2026_10_16_015_web_session.js';
 import { wayspot } from './2026_10_16_017_wayspot.js';
+import { partyHistory } from './2026_10_16_018_party_history.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -39,4 +40,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_16_014_gym_lookups': gymLookups,
   '2026_10_16_015_web_session': webSession,
   '2026_10_16_017_wayspot': wayspot,
+  '2026_10_16_018_party_history': partyHistory,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index c3d49f3d8dc06aa41f9c71d31aae601593319b06..9ca2c62a813c23b34c58e8a17677ad1c99f9000f 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -40,6 +40,13 @@ const ADDED_TABLES = [
   'GymLookupDay',
   'WebSession',
   'Wayspot',
+  'PartyHistory',
+  'PartyHistoryAttendee',
+  'PartyHistoryGroup',
+  'PartyHistoryStop',
+  'HistoryOptIn',
+  'PartyHistoryStep',
+  'EndedPartyPost',
 ];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = [
@@ -152,6 +159,7 @@ describe('runMigrations', () => {
       '2026_10_16_014_gym_lookups',
       '2026_10_16_015_web_session',
       '2026_10_16_017_wayspot',
+      '2026_10_16_018_party_history',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/table-names.ts b/src/db/table-names.ts
index 79a682f64169ca60aca556834400ec25651aee20..bd94fbcfd5151f64d74fc200a344ef620b106ae7 100644
--- a/src/db/table-names.ts
+++ b/src/db/table-names.ts
@@ -18,9 +18,16 @@ export const PINE_TABLES: readonly string[] = [
   'GymLookupDay',
   'GymReview',
   'GymWayfarer',
+  'EndedPartyPost',
+  'HistoryOptIn',
   'NewTrainNotification',
   'Party',
   'PartyAccessGrant',
+  'PartyHistory',
+  'PartyHistoryAttendee',
+  'PartyHistoryGroup',
+  'PartyHistoryStep',
+  'PartyHistoryStop',
   'RaidBoss',
   'RaidBossOverride',
   'RoleGroup',
diff --git a/src/db/types.ts b/src/db/types.ts
index ed28c777d0e69cbd211939b0a4e7cf37b8043423..e02dbf77cd145a529afe247066a963b9f307d494 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -63,6 +63,13 @@ export interface CommandRoles {
   roleSnowflakeId: string | null;
 }
 
+export interface EndedPartyPost {
+  endedAt: string;
+  forumChannelId: string;
+  forumPostId: string;
+  guildId: number;
+}
+
 export interface Guild {
   id: Generated<number>;
   snowflake: string | null;
@@ -133,6 +140,12 @@ export interface GymWayfarer {
   notInWayfarerBy: string | null;
 }
 
+export interface HistoryOptIn {
+  createdAt: string;
+  memberId: string;
+  serverId: string;
+}
+
 export interface NewTrainNotification {
   createdAt: string;
   guildId: number;
@@ -168,6 +181,99 @@ export interface PartyAccessGrant {
   memberId: string;
 }
 
+export interface PartyHistory {
+  anonymous: Generated<number>;
+  attendees: Generated<number>;
+  bossDex: number | null;
+  bossForm: string | null;
+  bossKey: string | null;
+  bossName: string | null;
+  bossSpecies: string | null;
+  chargedMove: string | null;
+  conductorId: string | null;
+  createdAt: string;
+  createdById: string | null;
+  departed: Generated<number>;
+  description: string | null;
+  done: Generated<number>;
+  doneHeads: Generated<number>;
+  elite: Generated<number>;
+  endedAt: string | null;
+  ending: string;
+  endTime: string | null;
+  ex: Generated<number>;
+  extras: Generated<number>;
+  fastMove: string | null;
+  gymId: number | null;
+  hatchTime: string | null;
+  here: Generated<number>;
+  hereHeads: Generated<number>;
+  id: Generated<number>;
+  interested: Generated<number>;
+  interestedHeads: Generated<number>;
+  joined: Generated<number>;
+  joinedHeads: Generated<number>;
+  kind: string;
+  legacyGymId: number | null;
+  legacyKey: string | null;
+  mega: Generated<number>;
+  name: string | null;
+  partyId: string | null;
+  regionId: number | null;
+  remote: Generated<number>;
+  routeStops: number | null;
+  serverId: string;
+  shadow: Generated<number>;
+  shiny: number | null;
+  source: string;
+  startTime: string | null;
+  tier: string | null;
+}
+
+export interface PartyHistoryAttendee {
+  doneAt: string | null;
+  extras: Generated<number>;
+  furthest: string;
+  groupId: string | null;
+  hereAt: string | null;
+  historyId: number;
+  joinedAt: string | null;
+  leftAt: string | null;
+  memberId: string | null;
+  remote: Generated<number>;
+  seq: number;
+  signedUpAt: string | null;
+  status: string | null;
+  team: string | null;
+}
+
+export interface PartyHistoryGroup {
+  groupId: string;
+  heads: Generated<number>;
+  historyId: number;
+  label: string | null;
+  meetingTime: string | null;
+  members: Generated<number>;
+}
+
+export interface PartyHistoryStep {
+  at: string;
+  id: Generated<string>;
+  kind: string;
+  partyId: string;
+  subject: string;
+  value: string | null;
+}
+
+export interface PartyHistoryStop {
+  arrivedAt: string | null;
+  gymId: number | null;
+  historyId: number;
+  leftAt: string | null;
+  legacyGymId: number | null;
+  seq: number;
+}
+
 export interface Pokemon {
   elite: Generated<number | null>;
   exclusive: Generated<number | null>;
@@ -319,6 +425,7 @@ export interface DB {
   AutosetPokemon: AutosetPokemon;
   CommandRoleAuthorization: CommandRoleAuthorization;
   CommandRoles: CommandRoles;
+  EndedPartyPost: EndedPartyPost;
   Guild: Guild;
   Gym: Gym;
   GymLookup: GymLookup;
@@ -327,9 +434,15 @@ export interface DB {
   GymNotification: GymNotification;
   GymReview: GymReview;
   GymWayfarer: GymWayfarer;
+  HistoryOptIn: HistoryOptIn;
   NewTrainNotification: NewTrainNotification;
   Party: Party;
   PartyAccessGrant: PartyAccessGrant;
+  PartyHistory: PartyHistory;
+  PartyHistoryAttendee: PartyHistoryAttendee;
+  PartyHistoryGroup: PartyHistoryGroup;
+  PartyHistoryStep: PartyHistoryStep;
+  PartyHistoryStop: PartyHistoryStop;
   Pokemon: Pokemon;
   PokemonNotification: PokemonNotification;
   RaidBoss: RaidBoss;
````

### Task 2: Plan 8H T2: members opt in to be named in the party history

Prototype commit: `fca37947a79476698108eb723dad17671ab204cb`

/settings history enabled:True|False, per server like new-train (the
history of a server is that server's): on keeps the member's Discord id
with what they do in that server's parties from then on; off takes it
out of every party kept so far (attendee, maker, conductor), leaving the
rows to count without it, and says from how many. /settings show has the
line; in a DM it says the setting is per server. The help says what is
kept and that the legacy history is never tied to anybody.

HistoryRepository (opt-ins for now) as ctx.historyOptIns;
MemoryHistoryOptIns in test/support/history.ts.

**Files:**

```
 src/app-context.ts                                |   3 ++
 src/app.ts                                        |   3 ++
 src/commands/admin/member-settings.test.ts        |   6 ++-
 src/commands/admin/member-settings.ts             |   5 +-
 src/commands/round-trips.db.test.ts               |   8 ++-
 src/commands/settings/settings.test.ts            |  67 ++++++++++++++++++++++++-
 src/commands/settings/settings.ts                 |  95 ++++++++++++++++++++++++++++++++---
 src/db/repositories/history-repository.db.test.ts | 113 ++++++++++++++++++++++++++++++++++++++++++
 src/db/repositories/history-repository.ts         | 100 +++++++++++++++++++++++++++++++++++++
 test/support/history.ts                           |  59 ++++++++++++++++++++++
 test/support/test-context.ts                      |   3 ++
 11 files changed, 447 insertions(+), 15 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/admin/member-settings.test.ts src/commands/settings/settings.test.ts`,
  `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/commands/round-trips.db.test.ts src/db/repositories/history-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff fca37947a79476698108eb723dad17671ab204cb -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8h-party-history.md'` prints nothing (and file modes match: `pine` is 100755).
- [ ] **Step 5: Commit** with the title `Plan 8H T2: members opt in to be named in the party history`, the body above and the trailer, staging exactly
  `src/app-context.ts src/app.ts src/commands/admin/member-settings.test.ts src/commands/admin/member-settings.ts src/commands/round-trips.db.test.ts src/commands/settings/settings.test.ts src/commands/settings/settings.ts src/db/repositories/history-repository.db.test.ts src/db/repositories/history-repository.ts test/support/history.ts test/support/test-context.ts`.

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index 101ef309aa8c52bf277635999562d2553599cbaf..5759699d056088394cf5b66c843f24621c4319e0 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -1,6 +1,7 @@
 import type { Kysely } from 'kysely';
 import type { Config } from './config/index.js';
 import type { GymTargetStorage } from './db/repositories/gym-notification-repository.js';
+import type { HistoryOptIns } from './db/repositories/history-repository.js';
 import type { NewTrainStorage } from './db/repositories/new-train-repository.js';
 import type { WantStorage } from './db/repositories/pokemon-notification-repository.js';
 import type { UserSettingsStore } from './db/repositories/user-repository.js';
@@ -100,6 +101,8 @@ export interface AppContext {
   readonly gymTargets: GymTargetStorage;
   /** Who asked to be told of new trains, per server. */
   readonly newTrains: NewTrainStorage;
+  /** Who is named in the party history of a server (`/settings history`). */
+  readonly historyOptIns: HistoryOptIns;
   /** Members of a server other than the one who is acting: one by id, or who of many can see a channel. */
   readonly members: MemberDirectory;
   /** The roles members give themselves: what a server offers, and giving and taking them. */
diff --git a/src/app.ts b/src/app.ts
index 8ec968cf1c10580f1ffb812b4bc0c126a3d2a2f2..8b804fbec726cf89fbd70bb168b9263ddf8e126e 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -16,6 +16,7 @@ import { GymNotificationRepository } from './db/repositories/gym-notification-re
 import { GymRemovalRepository } from './db/repositories/gym-removal-repository.js';
 import { NewTrainRepository } from './db/repositories/new-train-repository.js';
 import { GymRepository } from './db/repositories/gym-repository.js';
+import { HistoryRepository } from './db/repositories/history-repository.js';
 import { PartyRepository } from './db/repositories/party-repository.js';
 import { PokemonNotificationRepository } from './db/repositories/pokemon-notification-repository.js';
 import { PokemonRepository } from './db/repositories/pokemon-repository.js';
@@ -259,6 +260,7 @@ export async function startApp(
   );
   const gymTargets = new GymNotificationRepository(db, rowIds);
   const newTrains = new NewTrainRepository(db);
+  const history = new HistoryRepository(db);
   // Made after the party service, whose briefs of parties it sends, and told by it from here on.
   const notify = new NotifyService({
     store: parties,
@@ -550,6 +552,7 @@ export async function startApp(
     wants,
     gymTargets,
     newTrains,
+    historyOptIns: history,
     members,
     selfRoles,
     spawns,
diff --git a/src/commands/admin/member-settings.test.ts b/src/commands/admin/member-settings.test.ts
index ed8de2c4e10775d53a90b2fc86f1f75359ed0c69..7d28c6cf6398b913d259d67700084673ce22c241 100644
--- a/src/commands/admin/member-settings.test.ts
+++ b/src/commands/admin/member-settings.test.ts
@@ -2,6 +2,7 @@ import { describe, expect, it } from 'vitest';
 import { bossCommandsWith, MEMBER, textsOf } from '../../../test/support/boss-commands.js';
 import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
 import { MemoryGymTargets } from '../../../test/support/gym-targets.js';
+import { MemoryHistoryOptIns } from '../../../test/support/history.js';
 import { MemoryNewTrains } from '../../../test/support/new-trains.js';
 import { MemoryUsers } from '../../../test/support/users.js';
 import { MemoryWants } from '../../../test/support/wants.js';
@@ -37,7 +38,9 @@ async function setup() {
   await gymTargets.add(ASH, FAKE_GUILD_ID, 999);
   const newTrains = new MemoryNewTrains();
   await newTrains.set(ASH, FAKE_GUILD_ID, true, Date.now());
-  return bossCommandsWith({ context: { users, wants, gymTargets, newTrains } });
+  const historyOptIns = new MemoryHistoryOptIns();
+  await historyOptIns.optIn(ASH, FAKE_GUILD_ID, Date.now());
+  return bossCommandsWith({ context: { users, wants, gymTargets, newTrains, historyOptIns } });
 }
 
 const ash = (more: object = {}) => ({
@@ -62,6 +65,7 @@ describe('/admin member-settings', () => {
       '- Pings when a train moves: **on** (quiet while all pings are off)',
       '- DM when an egg gets its boss: **off**',
       '- DM for a new train in this server: **on**',
+      "- Named in this server's party history: **on**",
       '- Status when they report a raid or make a train: **Coming**',
       '- Raid reports and trains: **Anonymous**',
       '- Friend code: **1234 5678 9012**',
diff --git a/src/commands/admin/member-settings.ts b/src/commands/admin/member-settings.ts
index ded556dd1e539d712537d231f6f20cb7a9d2b8e7..5465f9c0561bfe2a65fafb9fa7895d6fc097161f 100644
--- a/src/commands/admin/member-settings.ts
+++ b/src/commands/admin/member-settings.ts
@@ -34,9 +34,10 @@ export async function memberSettingsLines(
   memberId: string,
   guildId: string,
 ): Promise<string[]> {
-  const [settings, newTrain, wants, targets] = await Promise.all([
+  const [settings, newTrain, history, wants, targets] = await Promise.all([
     ctx.users.get(memberId),
     ctx.newTrains.isOn(memberId, guildId),
+    ctx.historyOptIns.isOptedIn(memberId, guildId),
     ctx.wants.list(memberId, guildId),
     ctx.gymTargets.list(memberId, guildId),
   ]);
@@ -45,7 +46,7 @@ export async function memberSettingsLines(
     return gym ? plain(gym.name) : `gym #${String(id)} (gone)`;
   });
   return [
-    ...settingsLines(settings, newTrain, { commands: false }),
+    ...settingsLines(settings, newTrain, { commands: false, history }),
     listLine(
       'Wants in this server',
       wants.wants.map((want) => plain(wantLabel(ctx, want.target))),
diff --git a/src/commands/round-trips.db.test.ts b/src/commands/round-trips.db.test.ts
index f12b9fb71a738b1b1cda70e94cbafa651cd3c3a9..cd1c7a438a4cbb60552dc99cab049f27a0d5fd5e 100644
--- a/src/commands/round-trips.db.test.ts
+++ b/src/commands/round-trips.db.test.ts
@@ -17,6 +17,7 @@ import { fixtureForms } from '../../test/support/wants.js';
 import { AccessGrantRepository } from '../db/repositories/access-grant-repository.js';
 import { GuildRepository } from '../db/repositories/guild-repository.js';
 import { GymNotificationRepository } from '../db/repositories/gym-notification-repository.js';
+import { HistoryRepository } from '../db/repositories/history-repository.js';
 import { NewTrainRepository } from '../db/repositories/new-train-repository.js';
 import { PartyRepository } from '../db/repositories/party-repository.js';
 import { PokemonNotificationRepository } from '../db/repositories/pokemon-notification-repository.js';
@@ -91,6 +92,7 @@ describe('round trips to the database per command', () => {
     const wants = new PokemonNotificationRepository(db, fixtureForms(), rowIds);
     const gymTargets = new GymNotificationRepository(db, rowIds);
     const newTrains = new NewTrainRepository(db);
+    const historyOptIns = new HistoryRepository(db);
     const made = await partyServiceWith(
       [],
       { users, guilds, notifying: { users, guilds, wants, gymTargets, newTrains } },
@@ -102,6 +104,7 @@ describe('round trips to the database per command', () => {
       wants,
       gymTargets,
       newTrains,
+      historyOptIns,
       partyService: made.service,
       attendance: made.attendance,
       raids: made.raids,
@@ -302,8 +305,9 @@ describe('round trips to the database per command', () => {
     const limits: Record<string, { answered: number; settled: number }> = {
       // One statement: the row is written, or made, in one.
       '/settings mentions': { answered: 1, settled: 1 },
-      // The settings, the new-train row, the member's wants and their gyms: one read each.
-      '/settings show': { answered: 4, settled: 4 },
+      // The settings, the new-train row, the history opt-in, the member's wants and their gyms:
+      // one read each.
+      '/settings show': { answered: 5, settled: 5 },
       // begin, the lock on the member's row, their rows, the insert, commit.
       '/want': { answered: 5, settled: 5 },
       '/want, a second': { answered: 5, settled: 5 },
diff --git a/src/commands/settings/settings.test.ts b/src/commands/settings/settings.test.ts
index 8b53cfa11722acb163763abdc748928dbce54dc8..0d0d4ea4ac2b95d582674a128f44092402df6f27 100644
--- a/src/commands/settings/settings.test.ts
+++ b/src/commands/settings/settings.test.ts
@@ -6,6 +6,7 @@ import {
   sent,
   answered,
 } from '../../../test/support/fake-interactions.js';
+import { MemoryHistoryOptIns } from '../../../test/support/history.js';
 import { MemoryNewTrains } from '../../../test/support/new-trains.js';
 import { ALICE } from '../../../test/support/parties.js';
 import { MemoryGymTargets } from '../../../test/support/gym-targets.js';
@@ -23,7 +24,14 @@ function setup(features: { notifications?: boolean } = {}) {
   const wants = new MemoryWants();
   const targets = new MemoryGymTargets();
   const newTrains = new MemoryNewTrains();
-  const { ctx } = createTestContext({ users, wants, gymTargets: targets, newTrains });
+  const history = new MemoryHistoryOptIns();
+  const { ctx } = createTestContext({
+    users,
+    wants,
+    gymTargets: targets,
+    newTrains,
+    historyOptIns: history,
+  });
   ctx.config.settings.features = { ...ctx.config.settings.features, ...features };
   const router = new InteractionRouter(ctx, [settings], []);
   const run = async (
@@ -44,7 +52,7 @@ function setup(features: { notifications?: boolean } = {}) {
   /** What the member was answered. */
   const answer = async (subcommand: string, options: Record<string, string | boolean> = {}) =>
     answered(await run(subcommand, options)).content;
-  return { users, wants, targets, newTrains, run, answer };
+  return { users, wants, targets, newTrains, history, run, answer };
 }
 
 describe('/settings', () => {
@@ -59,6 +67,7 @@ describe('/settings', () => {
       'mentions-train-stops',
       'boss-set',
       'new-train',
+      'history',
       'auto-status',
       'privacy',
       'pokebattler-id',
@@ -140,6 +149,59 @@ describe('/settings', () => {
     );
   });
 
+  it('history keeps the member named in the history of this server only, from now on', async () => {
+    const made = setup();
+    const AWAY = '412345678901234568';
+    expect(await made.answer('history', { enabled: true })).toBe(
+      'From now on the party history of this server keeps your Discord id with what you sign up ' +
+        'for and how far you get. `/settings history enabled:False` takes it out again.',
+    );
+    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(true);
+    expect(await made.history.isOptedIn(ALICE, AWAY)).toBe(false);
+    expect(await made.answer('show')).toContain(
+      "- Named in this server's party history: **on** · `/settings history`",
+    );
+    const elsewhere = await made.run('show', {}, { guildId: AWAY });
+    expect(answered(elsewhere).content).toContain(
+      "- Named in this server's party history: **off** · `/settings history`",
+    );
+  });
+
+  it('history takes the member out of what the history of this server already keeps', async () => {
+    const made = setup();
+    await made.run('history', { enabled: true });
+    made.history.named(ALICE, FAKE_GUILD_ID, 3);
+    expect(await made.answer('history', { enabled: false })).toBe(
+      'The party history of this server no longer keeps your Discord id. It was taken out of ' +
+        'the 3 raids, trains and meetups kept with it so far, which still count, without it.',
+    );
+    expect(await made.history.isOptedIn(ALICE, FAKE_GUILD_ID)).toBe(false);
+    expect(made.history.namedIn(ALICE, FAKE_GUILD_ID)).toBe(0);
+    expect(await made.answer('history', { enabled: false })).toBe(
+      'The party history of this server no longer keeps your Discord id.',
+    );
+  });
+
+  it('history says in a DM with the bot to use it in a server, and sets nothing', async () => {
+    const made = setup();
+    const used = await made.run('history', { enabled: true }, { isDm: true });
+    expect(answered(used).content).toBe(
+      'Whether the party history keeps your Discord id is set per server. Use ' +
+        '`/settings history` in the server you mean.',
+    );
+    expect(made.history.rows).toEqual([]);
+    const shown = await made.run('show', {}, { isDm: true });
+    expect(answered(shown).content).toContain(
+      '- Named in the party history: set per server · `/settings history` in a server',
+    );
+  });
+
+  it('history says what is kept, and that the legacy history is never tied to anybody', () => {
+    const details = settings.subcommands.get('history')?.help?.details ?? '';
+    expect(details).toContain('You always count in it, without your name.');
+    expect(details).toContain('never tied to you');
+  });
+
   it('says what each switch means now', async () => {
     const made = setup();
     expect(await made.answer('mentions-shouts', { enabled: true })).toBe(
@@ -251,6 +313,7 @@ describe('/settings show', () => {
         '- Pings when a train moves: **on** · `/settings mentions-train-stops`',
         '- DM when an egg gets its boss: **off** · `/settings boss-set`',
         '- DM for a new train in this server: **off** · `/settings new-train`',
+        "- Named in this server's party history: **off** · `/settings history`",
         '- Status when you report a raid or make a train: **Interested** · `/settings auto-status`',
         '- Raid reports and trains: **Visible** · `/settings privacy`',
         '- Pokémon and raid tiers on your list in this server: **0** · `/wants`',
diff --git a/src/commands/settings/settings.ts b/src/commands/settings/settings.ts
index 25e7719f5101755e080190e3e47b98b752f06047..f783ebadc36baecebb2fe3e27c0b5a39971b712f 100644
--- a/src/commands/settings/settings.ts
+++ b/src/commands/settings/settings.ts
@@ -115,6 +115,33 @@ const NEW_TRAIN = {
     'server you mean.',
 } as const;
 
+/**
+ * Whether the party history keeps the member's id: per server, like new trains (plan 8H; the
+ * history of a server is that server's).
+ */
+const HISTORY = {
+  name: 'history',
+  label: "Named in this server's party history",
+  on:
+    'From now on the party history of this server keeps your Discord id with what you sign up ' +
+    'for and how far you get. `/settings history enabled:False` takes it out again.',
+  off: 'The party history of this server no longer keeps your Discord id.',
+  /** Said in a DM with the bot, where there is no server to set it for. */
+  inDm:
+    'Whether the party history keeps your Discord id is set per server. Use `/settings history` ' +
+    'in the server you mean.',
+} as const;
+
+/** What opting out adds when the history named the member somewhere. */
+function forgottenIn(parties: number): string {
+  const what =
+    parties === 1
+      ? 'the raid, train or meetup'
+      : `the ${String(parties)} raids, trains and meetups`;
+  const count = parties === 1 ? 'which still counts' : 'which still count';
+  return ` It was taken out of ${what} kept with it so far, ${count}, without it.`;
+}
+
 /** As much of a text a member registered as the overview shows: a legacy value may be long. */
 const SHOWN_VALUE = 60;
 
@@ -176,14 +203,15 @@ function autoStatusName(status: PartyStatus): string {
 
 /**
  * Everything a member has set, each line with the command that changes it. `newTrain` is
- * whether they are told of new trains in the server the command was used in; undefined in a
- * DM, where the line says that it is set per server. With `commands: false` the lines leave the
- * commands out, for staff who look at another member's settings (`/admin member-settings`).
+ * whether they are told of new trains in the server the command was used in, and `history`
+ * whether that server's party history keeps their id; undefined in a DM, where the lines say
+ * that they are set per server. With `commands: false` the lines leave the commands out, for
+ * staff who look at another member's settings (`/admin member-settings`).
  */
 export function settingsLines(
   settings: UserSettings,
   newTrain?: boolean,
-  options: { commands?: boolean } = {},
+  options: { commands?: boolean; history?: boolean } = {},
 ): string[] {
   const commands = options.commands ?? true;
   const via = (command: string): string => (commands ? ` · \`${command}\`` : '');
@@ -199,6 +227,9 @@ export function settingsLines(
     newTrain === undefined
       ? `DM for a new train: set per server${via(`/settings ${NEW_TRAIN.name}`)}${commands ? ' in a server' : ''}`
       : `${NEW_TRAIN.label}: **${onOff(newTrain)}**${via(`/settings ${NEW_TRAIN.name}`)}`,
+    options.history === undefined
+      ? `Named in the party history: set per server${via(`/settings ${HISTORY.name}`)}${commands ? ' in a server' : ''}`
+      : `${HISTORY.label}: **${onOff(options.history)}**${via(`/settings ${HISTORY.name}`)}`,
     `Status when ${commands ? 'you report' : 'they report'} a raid or make a train: **${autoStatusName(settings.autoStatus)}**${via('/settings auto-status')}`,
     `Raid reports and trains: **${settings.raidPrivacy === RaidPrivacy.Anonymous ? 'Anonymous' : 'Visible'}**${via('/settings privacy')}`,
   );
@@ -259,9 +290,17 @@ const show: SubcommandPart = {
   async execute(interaction, ctx) {
     const settings = await ctx.users.get(interaction.user.id);
     const { guildId } = interaction;
-    const newTrain =
-      guildId === null ? undefined : await ctx.newTrains.isOn(interaction.user.id, guildId);
-    const lines = [...settingsLines(settings, newTrain), ...(await listLines(interaction, ctx))];
+    const [newTrain, history] =
+      guildId === null
+        ? [undefined, undefined]
+        : await Promise.all([
+            ctx.newTrains.isOn(interaction.user.id, guildId),
+            ctx.historyOptIns.isOptedIn(interaction.user.id, guildId),
+          ]);
+    const lines = [
+      ...settingsLines(settings, newTrain, history === undefined ? {} : { history }),
+      ...(await listLines(interaction, ctx)),
+    ];
     await answer(interaction, {
       content: `**Your settings**\n${lines.map((line) => `- ${line}`).join('\n')}`,
     });
@@ -336,6 +375,46 @@ const newTrain: SubcommandPart = {
   },
 };
 
+const history: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName(HISTORY.name)
+    .setDescription("Whether this server's party history keeps your Discord id with what you do")
+    .addBooleanOption((option) =>
+      option.setName('enabled').setDescription('True keeps it from now on').setRequired(true),
+    ),
+  help: {
+    details:
+      'Professor Pine keeps a history of every raid, train and meetup of this server that has ' +
+      'ended: what it was, where and when, and how many signed up, came and completed it. You ' +
+      'always count in it, without your name. With this on, your Discord id is kept as well with ' +
+      'what you do from now on (what you sign up for, when, and how far you get), for statistics ' +
+      'of your own later. Off takes your id out of everything kept so far: it all still counts, ' +
+      'without it. It is set per server: use it in the server you mean, not in a DM with me. The ' +
+      'history of the old bot, from before this one, is never tied to you.',
+    examples: [`/settings ${HISTORY.name} enabled:True`, `/settings ${HISTORY.name} enabled:False`],
+  },
+  defer: 'late',
+  throttle: MEMBER_WRITE_THROTTLE,
+  async execute(interaction, ctx) {
+    const enabled = interaction.options.getBoolean('enabled', true);
+    const { guildId } = interaction;
+    if (guildId === null) {
+      await answer(interaction, { content: HISTORY.inDm });
+      return;
+    }
+    const memberId = interaction.user.id;
+    if (enabled) {
+      await ctx.historyOptIns.optIn(memberId, guildId, Date.now());
+      await answer(interaction, { content: HISTORY.on });
+      return;
+    }
+    const { forgotten } = await ctx.historyOptIns.optOut(memberId, guildId);
+    await answer(interaction, {
+      content: forgotten > 0 ? HISTORY.off + forgottenIn(forgotten) : HISTORY.off,
+    });
+  },
+};
+
 const autoStatus: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('auto-status')
@@ -449,5 +528,5 @@ export const settings = commandGroup({
       '`/settings show` lists it all. Nobody else sees your answers.',
     examples: ['/settings show', '/settings mentions enabled:False'],
   },
-  parts: [show, ...FLAGS.map(flagPart), newTrain, autoStatus, privacy, pokebattlerId],
+  parts: [show, ...FLAGS.map(flagPart), newTrain, history, autoStatus, privacy, pokebattlerId],
 });
diff --git a/src/db/repositories/history-repository.db.test.ts b/src/db/repositories/history-repository.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..31593e8f9b81c823a6b4d88952f8b002bb7c1384
--- /dev/null
+++ b/src/db/repositories/history-repository.db.test.ts
@@ -0,0 +1,113 @@
+import { sql, type Kysely } from 'kysely';
+import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import type { DB } from '../types.js';
+import { HistoryRepository } from './history-repository.js';
+
+const ALICE = '312345678901234567';
+const BOB = '312345678901234568';
+const HOME = '412345678901234567';
+const AWAY = '412345678901234568';
+const NOWHERE = '499999999999999999';
+const NOW = 1_800_000_000_000;
+
+describe('HistoryRepository: who is named in the history', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+  let history: HistoryRepository;
+
+  beforeAll(async () => {
+    ({ db, stop } = await startMigratedDatabase());
+    history = new HistoryRepository(db);
+  });
+  afterAll(async () => {
+    await stop();
+  });
+  beforeEach(async () => {
+    await db.deleteFrom('PartyHistory').execute();
+    await db.deleteFrom('HistoryOptIn').execute();
+  });
+
+  /** A party of the history in a server (by snowflake), made by `creator`, with these attendees. */
+  const kept = async (server: string, creator: string | null, members: (string | null)[]) => {
+    await sql`insert into PartyHistory (source, kind, serverId, createdAt, ending, createdById,
+                                        conductorId)
+              values ('live', 'train', ${server}, ${NOW}, 'completed', ${creator},
+                      ${creator})`.execute(db);
+    const id = Number(
+      (await sql<{ id: number }>`select max(id) as id from PartyHistory`.execute(db)).rows[0]?.id,
+    );
+    for (const [seq, member] of members.entries()) {
+      await sql`insert into PartyHistoryAttendee (historyId, seq, memberId, status, furthest)
+                values (${id}, ${seq}, ${member}, 'here', 'here')`.execute(db);
+    }
+    return id;
+  };
+  const named = async () => {
+    const parties = await db
+      .selectFrom('PartyHistory')
+      .select(['id', 'serverId', 'createdById', 'conductorId'])
+      .orderBy('id')
+      .execute();
+    const attendees = await db
+      .selectFrom('PartyHistoryAttendee')
+      .select(['historyId', 'seq', 'memberId'])
+      .orderBy('historyId')
+      .orderBy('seq')
+      .execute();
+    return { parties, attendees };
+  };
+
+  it('names nobody until a member opts in, per server', async () => {
+    expect(await history.isOptedIn(ALICE, HOME)).toBe(false);
+    expect(await history.optIn(ALICE, HOME, NOW)).toBe(true);
+    expect(await history.optIn(ALICE, HOME, NOW + 1)).toBe(false);
+    expect(await history.isOptedIn(ALICE, HOME)).toBe(true);
+    expect(await history.isOptedIn(ALICE, AWAY)).toBe(false);
+    expect(await history.isOptedIn(BOB, HOME)).toBe(false);
+  });
+
+  it('keeps an opt-in by the server alone: no Guild row is needed or made', async () => {
+    expect(await history.optIn(ALICE, NOWHERE, NOW)).toBe(true);
+    expect(await history.isOptedIn(ALICE, NOWHERE)).toBe(true);
+    expect(
+      await db.selectFrom('Guild').select('id').where('snowflake', '=', NOWHERE).execute(),
+    ).toEqual([]);
+  });
+
+  it('forgets a member who opts out in every party of that server, and only there', async () => {
+    await history.optIn(ALICE, HOME, NOW);
+    await history.optIn(ALICE, AWAY, NOW);
+    const first = await kept(HOME, ALICE, [ALICE, null, BOB]);
+    const second = await kept(HOME, BOB, [BOB, ALICE]);
+    const elsewhere = await kept(AWAY, ALICE, [ALICE]);
+
+    // Named as maker, conductor and attendee of the first party: it counts once.
+    expect(await history.optOut(ALICE, HOME)).toEqual({ changed: true, forgotten: 2 });
+    expect(await history.isOptedIn(ALICE, HOME)).toBe(false);
+    expect(await history.isOptedIn(ALICE, AWAY)).toBe(true);
+    // The rows stay, without her id; the other server and the other member keep theirs.
+    expect(await named()).toEqual({
+      parties: [
+        { id: first, serverId: HOME, createdById: null, conductorId: null },
+        { id: second, serverId: HOME, createdById: BOB, conductorId: BOB },
+        { id: elsewhere, serverId: AWAY, createdById: ALICE, conductorId: ALICE },
+      ],
+      attendees: [
+        { historyId: first, seq: 0, memberId: null },
+        { historyId: first, seq: 1, memberId: null },
+        { historyId: first, seq: 2, memberId: BOB },
+        { historyId: second, seq: 0, memberId: BOB },
+        { historyId: second, seq: 1, memberId: null },
+        { historyId: elsewhere, seq: 0, memberId: ALICE },
+      ],
+    });
+  });
+
+  it('forgets a member who opts out even when they were not opted in, or the server left', async () => {
+    const id = await kept(NOWHERE, null, [ALICE]);
+    expect(await history.optOut(ALICE, NOWHERE)).toEqual({ changed: false, forgotten: 1 });
+    expect((await named()).attendees).toEqual([{ historyId: id, seq: 0, memberId: null }]);
+    expect(await history.optOut(ALICE, HOME)).toEqual({ changed: false, forgotten: 0 });
+  });
+});
diff --git a/src/db/repositories/history-repository.ts b/src/db/repositories/history-repository.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4683cbf6a937de894107ebea51dabb2e2d5da210
--- /dev/null
+++ b/src/db/repositories/history-repository.ts
@@ -0,0 +1,100 @@
+import { sql, type Kysely } from 'kysely';
+import { inTransaction } from '../transaction.js';
+import type { DB } from '../types.js';
+
+/**
+ * Who is named in the party history of a server (`ctx.historyOptIns`, `/settings history`). A
+ * member and a server are named by their snowflakes. Nobody is, until they opt in: from then on
+ * the history keeps their id with what they do in that server's parties; opting out takes it
+ * out of everything kept already.
+ */
+export interface HistoryOptIns {
+  /** Whether the member asked to be named in the history of this server. */
+  isOptedIn(memberId: string, guildId: string): Promise<boolean>;
+  /** Opts the member in for this server; true when that changed anything. `now` is when. */
+  optIn(memberId: string, guildId: string, now: number): Promise<boolean>;
+  /**
+   * Opts the member out for this server and takes their id out of every party of its history
+   * (as an attendee, as who made it, as its conductor): the rows stay, without it. `changed`:
+   * they were opted in; `forgotten`: in how many parties the history named them.
+   */
+  optOut(memberId: string, guildId: string): Promise<{ changed: boolean; forgotten: number }>;
+}
+
+/**
+ * The party history: `PartyHistory` and its attendees, groups and stops, the steps of active
+ * parties that become it (`PartyHistoryStep`) and who may be named in it (`HistoryOptIn`, a row
+ * per member and server that is on, none for off). A server is its snowflake, never a `Guild`
+ * row: the history outlives the row. See migration 018 and docs/architecture/history.md.
+ *
+ * The opt-in rows are a member's rows of a server but hang on no `User` row, so they are written
+ * without `withMemberLocked`, as `NewTrainRepository` writes its rows: an opt-in and an opt-out
+ * of one member at once end as whichever committed last, and an opt-out takes the id out of
+ * what is kept under the lock its statements take.
+ */
+export class HistoryRepository implements HistoryOptIns {
+  constructor(private readonly db: Kysely<DB>) {}
+
+  async isOptedIn(memberId: string, guildId: string): Promise<boolean> {
+    const row = await this.db
+      .selectFrom('HistoryOptIn')
+      .select('memberId')
+      .where('serverId', '=', guildId)
+      .where('memberId', '=', memberId)
+      .executeTakeFirst();
+    return row !== undefined;
+  }
+
+  async optIn(memberId: string, guildId: string, now: number): Promise<boolean> {
+    // On already: the row stays as it was (`insert ignore`), and nothing counts as changed.
+    const made = await sql`
+      insert ignore into HistoryOptIn (serverId, memberId, createdAt)
+      values (${guildId}, ${memberId}, ${String(now)})`.execute(this.db);
+    return Number(made.numAffectedRows ?? 0) > 0;
+  }
+
+  /**
+   * One transaction: the opt-in goes, and the member's id goes from every party of the
+   * server's history, also where no opt-in row says it should be there. The parties are counted
+   * from three lookups by index (maker, conductor, attendee), so that neither the count nor the
+   * updates scan the server's history.
+   */
+  optOut(memberId: string, guildId: string): Promise<{ changed: boolean; forgotten: number }> {
+    return inTransaction(this.db, async (trx) => {
+      const gone = await trx
+        .deleteFrom('HistoryOptIn')
+        .where('serverId', '=', guildId)
+        .where('memberId', '=', memberId)
+        .executeTakeFirst();
+      const named = await sql<{ n: number }>`
+        select count(distinct n.id) as n from (
+          select id from PartyHistory where createdById = ${memberId} and serverId = ${guildId}
+          union all
+          select id from PartyHistory where conductorId = ${memberId} and serverId = ${guildId}
+          union all
+          select a.historyId as id from PartyHistoryAttendee a
+          join PartyHistory h on h.id = a.historyId
+          where a.memberId = ${memberId} and h.serverId = ${guildId}) n`.execute(trx);
+      await sql`
+        update PartyHistoryAttendee a inner join PartyHistory h on h.id = a.historyId
+        set a.memberId = null
+        where a.memberId = ${memberId} and h.serverId = ${guildId}`.execute(trx);
+      await trx
+        .updateTable('PartyHistory')
+        .set({ createdById: null })
+        .where('createdById', '=', memberId)
+        .where('serverId', '=', guildId)
+        .execute();
+      await trx
+        .updateTable('PartyHistory')
+        .set({ conductorId: null })
+        .where('conductorId', '=', memberId)
+        .where('serverId', '=', guildId)
+        .execute();
+      return {
+        changed: gone.numDeletedRows > 0n,
+        forgotten: Number(named.rows[0]?.n ?? 0),
+      };
+    });
+  }
+}
diff --git a/test/support/history.ts b/test/support/history.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1cf97c4df9c4bc69ddff06cd1d6d83d333734ac6
--- /dev/null
+++ b/test/support/history.ts
@@ -0,0 +1,59 @@
+import type { HistoryOptIns } from '../../src/db/repositories/history-repository.js';
+
+/**
+ * Who is named in the party history, kept in memory as `HistoryRepository` keeps it, whose
+ * behaviour history-repository.db.test.ts pins down. A server is named by its snowflake. `named`
+ * says in how many parties of a server the history already names a member (what opting out
+ * takes them out of). Set `failing` to make every call reject.
+ */
+export class MemoryHistoryOptIns implements HistoryOptIns {
+  failing: Error | undefined;
+  readonly rows: { memberId: string; guildId: string; createdAt: number }[] = [];
+  private readonly naming = new Map<string, number>();
+
+  private attempt<T>(work: () => T): Promise<T> {
+    return new Promise((resolve, reject) => {
+      // Like a real query, the answer never comes in the same turn of the event loop.
+      setImmediate(() => {
+        if (this.failing) reject(this.failing);
+        else resolve(work());
+      });
+    });
+  }
+
+  private index(memberId: string, guildId: string): number {
+    return this.rows.findIndex((row) => row.memberId === memberId && row.guildId === guildId);
+  }
+
+  /** The history of this server names the member in this many parties. */
+  named(memberId: string, guildId: string, parties: number): void {
+    this.naming.set(`${guildId}:${memberId}`, parties);
+  }
+
+  /** In how many parties of this server the history names the member. */
+  namedIn(memberId: string, guildId: string): number {
+    return this.naming.get(`${guildId}:${memberId}`) ?? 0;
+  }
+
+  isOptedIn(memberId: string, guildId: string): Promise<boolean> {
+    return this.attempt(() => this.index(memberId, guildId) >= 0);
+  }
+
+  optIn(memberId: string, guildId: string, now: number): Promise<boolean> {
+    return this.attempt(() => {
+      if (this.index(memberId, guildId) >= 0) return false;
+      this.rows.push({ memberId, guildId, createdAt: now });
+      return true;
+    });
+  }
+
+  optOut(memberId: string, guildId: string): Promise<{ changed: boolean; forgotten: number }> {
+    return this.attempt(() => {
+      const at = this.index(memberId, guildId);
+      if (at >= 0) this.rows.splice(at, 1);
+      const forgotten = this.namedIn(memberId, guildId);
+      this.naming.delete(`${guildId}:${memberId}`);
+      return { changed: at >= 0, forgotten };
+    });
+  }
+}
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index be4e61fe3be5aa50f05f964c7f37112422824c00..34bab97a9a5f488f336d331020755518abef991d 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -23,6 +23,7 @@ import { FAKE_GUILD_ID } from './fake-interactions.js';
 import { catalogueFixture } from './game-data.js';
 import { FakeMemberDirectory } from './members.js';
 import { RecordingDms } from './dms.js';
+import { MemoryHistoryOptIns } from './history.js';
 import { MemoryNewTrains } from './new-trains.js';
 import { noParties } from './parties.js';
 import { FakeIssues } from './issues.js';
@@ -104,6 +105,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     wants: new MemoryWants(),
     gymTargets: new MemoryGymTargets(),
     newTrains: new MemoryNewTrains(),
+    // Nobody is named in the party history; a test passes its own to opt members in.
+    historyOptIns: new MemoryHistoryOptIns(),
     // Nobody is a member of any server; a test passes its own directory with members.
     members: new FakeMemberDirectory(),
     // No server offers any role; a test passes { selfRoles } from selfRolesWith().
````

### Task 3: Plan 8H T3: every party that ends is recorded in the party history

Prototype commit: `db1af46c402ebfe6db0ec19c85bf6ebd4ead8def`

The store asks PartyHistory for what each write adds (a HistoryNote):
the steps the live model does not keep (who reached which status when,
who left, where a train is, a group's meeting time, the raid a party
went on from), written to PartyHistoryStep after the party's row (one
insert: a click costs one round trip more); and when the write ends the
party, its record, written in the same transaction behind a savepoint,
with the opt-ins read under a shared lock. Then the party's row, which
holds its maker's and members' ids, is deleted (its post and forum kept
in EndedPartyPost for the archiving of reopened posts): once a party is
recorded no id of a member who did not opt in is left (Matt, 2026-10-16).

A record that fails is rolled back alone and the end stands (also after a
deadlock that takes the whole transaction: the party's write is run
again alone); it is tried again three times (1, 10, 60 minutes, and once
at shutdown). At start a sweep records every ended party that still has
its row (failed, interrupted, or ended before the history), as ending
unknown. Unique on the party id, so never twice; a late step of an ended
party is dropped.

How it ended: completed whenever it took place (somebody completed the
raid, or was at the train or meetup), however it was closed; otherwise
expired by the clock, cancelled by a person (/delete, a region removed, a
deleted post), unknown when nobody said. A raid that moved to another
region is recorded once, as the party it went on as, which takes the old
party's steps and row along; a party that never got its post is dropped.
Members, the maker and the conductor are named only with their opt-in.

The server is its snowflake. PartyRepository needs historyFailed and the
pool. Pure part in src/domain/history/party-history.ts; MemoryHistory and
the memory storage follow the repository; the round-trips bound of /raid
raised by the one insert; the opt-in's help says what is kept.

**Files:**

```
 src/app.ts                                       |  28 ++-
 src/commands/parties/delete.test.ts              |   6 +-
 src/commands/round-trips.db.test.ts              |  14 +-
 src/commands/settings/settings.ts                |   6 +-
 src/db/repositories/history-recording.db.test.ts | 427 +++++++++++++++++++++++++++++++++++++++
 src/db/repositories/history-repository.ts        | 344 ++++++++++++++++++++++++++++++-
 src/db/repositories/party-repository.db.test.ts  |   3 +-
 src/db/repositories/party-repository.ts          | 197 ++++++++++++++----
 src/domain/history/party-history.test.ts         | 354 ++++++++++++++++++++++++++++++++
 src/domain/history/party-history.ts              | 467 +++++++++++++++++++++++++++++++++++++++++++
 src/services/party-history.test.ts               | 345 ++++++++++++++++++++++++++++++++
 src/services/party-history.ts                    | 205 +++++++++++++++++++
 src/services/party-lifecycle.db.test.ts          |  50 +++--
 src/services/party-scheduler.ts                  |   1 +
 src/services/party-service.end.test.ts           |   4 +-
 src/services/party-service.meetup.test.ts        |   8 +-
 src/services/party-service.train.test.ts         |   4 +-
 src/services/party-service.ts                    |  34 +++-
 src/services/party-store.ts                      |  50 ++++-
 test/support/history.ts                          | 171 +++++++++++++++-
 test/support/parties.ts                          |  46 ++++-
 test/support/party-service.ts                    |  27 ++-
 22 files changed, 2697 insertions(+), 94 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/parties/delete.test.ts src/domain/history/party-history.test.ts src/services/party-history.test.ts src/services/party-service.end.test.ts src/services/party-service.meetup.test.ts src/services/party-service.train.test.ts`,
  `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/commands/round-trips.db.test.ts src/db/repositories/history-recording.db.test.ts src/db/repositories/party-repository.db.test.ts src/services/party-lifecycle.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff db1af46c402ebfe6db0ec19c85bf6ebd4ead8def -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8h-party-history.md'` prints nothing (and file modes match: `pine` is 100755).
- [ ] **Step 5: Commit** with the title `Plan 8H T3: every party that ends is recorded in the party history`, the body above and the trailer, staging exactly
  `src/app.ts src/commands/parties/delete.test.ts src/commands/round-trips.db.test.ts src/commands/settings/settings.ts src/db/repositories/history-recording.db.test.ts src/db/repositories/history-repository.ts src/db/repositories/party-repository.db.test.ts src/db/repositories/party-repository.ts src/domain/history/party-history.test.ts src/domain/history/party-history.ts src/services/party-history.test.ts src/services/party-history.ts src/services/party-lifecycle.db.test.ts src/services/party-scheduler.ts src/services/party-service.end.test.ts src/services/party-service.meetup.test.ts src/services/party-service.train.test.ts src/services/party-service.ts src/services/party-store.ts test/support/history.ts test/support/parties.ts test/support/party-service.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index 8b804fbec726cf89fbd70bb168b9263ddf8e126e..9c395dfd9a737d81b57b52a28e8766f06d07c4ef 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -71,6 +71,7 @@ import { ScreenshotService } from './services/screenshot-service.js';
 import { ScreenshotStore } from './services/screenshot-store.js';
 import { PartyLines } from './services/party-lines.js';
 import { ApplicationEmoji, emojiFinder } from './services/application-emoji.js';
+import { PartyHistory } from './services/party-history.js';
 import { PartyScheduler } from './services/party-scheduler.js';
 import { PartyService } from './services/party-service.js';
 import { PartyStore } from './services/party-store.js';
@@ -196,7 +197,15 @@ export async function startApp(
   // The kept Wayspots of the Wayfarer imports, placed in the regions by their outlines.
   const wayspotRepository = new WayspotRepository(db);
   const wayspots = new WayspotDirectory({ wayspots: wayspotRepository, regions, log });
-  const parties = new PartyStore({ storage: new PartyRepository(db), log });
+  const history = new HistoryRepository(db);
+  // Every party that ends is kept in the party history (plan 8H), with what the store writes.
+  const partyHistory = new PartyHistory({ storage: history, gameData, raidBosses, log });
+  const partyRepository = new PartyRepository(db, {
+    historyFailed: (note, err) => {
+      partyHistory.failed(note, err);
+    },
+  });
+  const parties = new PartyStore({ storage: partyRepository, log, history: partyHistory });
   const partyGateway = new DiscordPartyGateway(log);
   // The bot's own emoji (types, weather, teams), looked for before a server's.
   const appEmojiSource = new DiscordApplicationEmoji();
@@ -260,7 +269,6 @@ export async function startApp(
   );
   const gymTargets = new GymNotificationRepository(db, rowIds);
   const newTrains = new NewTrainRepository(db);
-  const history = new HistoryRepository(db);
   // Made after the party service, whose briefs of parties it sends, and told by it from here on.
   const notify = new NotifyService({
     store: parties,
@@ -508,6 +516,12 @@ export async function startApp(
     // What a stop between storing a raid and creating its post left behind: only the store is
     // needed, and reports can arrive as soon as the bot has logged in.
     await partyService.endPartiesWithoutPost();
+    // A party that ended without its record (its tries failed, or the bot stopped first) is
+    // recorded now; the game data, which names its boss, is loaded by here.
+    await partyHistory.sweep(async (id) => {
+      const stored = await partyRepository.findById(id);
+      return stored?.ok ? stored.party : undefined;
+    });
     await pokemon.reloadNicknames();
     checkpoint();
   } catch (err) {
@@ -805,6 +819,16 @@ export async function startApp(
       { name: 'unown wants', timeoutMs: 5_000, run: () => unownWants.flush() },
       // A write in flight must finish before the pool closes.
       { name: 'parties', timeoutMs: 5_000, run: () => parties.whenIdle() },
+      // A record of the party history that waits for another try gets it now, while the
+      // database is open; what still fails is logged and given up.
+      {
+        name: 'party history',
+        timeoutMs: 3_000,
+        run: async () => {
+          await partyHistory.flush();
+          partyHistory.close();
+        },
+      },
       // The heartbeat asks the database: it stops first. A clean exit leaves no crash marker.
       { name: 'heartbeat', timeoutMs: 1_000, run: () => heartbeat.stop() },
       { name: 'database', timeoutMs: 5_000, run: () => db.destroy() },
diff --git a/src/commands/parties/delete.test.ts b/src/commands/parties/delete.test.ts
index c5417c332a49bf536667d13ee059659d2e8fb91c..43939d7ea25a2a29ad2128a35ba373edb8a48128 100644
--- a/src/commands/parties/delete.test.ts
+++ b/src/commands/parties/delete.test.ts
@@ -89,7 +89,11 @@ describe('/delete from staff', () => {
       'This raid is closed: its gym is free for a new report, and I am archiving and locking its post.',
     );
     expect(store.get(made.party.id)).toBeUndefined();
-    expect(made.storage.rows.get(made.party.id)?.status).toBe('ended');
+    // Recorded in the history as closed, and its row (with its members' ids) deleted.
+    expect(made.history.records).toEqual([
+      expect.objectContaining({ partyId: made.party.id, ending: 'cancelled' }),
+    ]);
+    expect(made.storage.rows.has(made.party.id)).toBe(false);
     expect(made.said().at(-1)).toBe(`This raid was closed by **Member** (<@${ALICE}>).`);
     const post = gateway.posts.get(postId);
     expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
diff --git a/src/commands/round-trips.db.test.ts b/src/commands/round-trips.db.test.ts
index cd1c7a438a4cbb60552dc99cab049f27a0d5fd5e..b37b76e4609a294827d95cb8c56d95e624ae6c4d 100644
--- a/src/commands/round-trips.db.test.ts
+++ b/src/commands/round-trips.db.test.ts
@@ -12,6 +12,7 @@ import { textOf } from '../../test/support/messages.js';
 import { startMigratedDatabase } from '../../test/support/migrated-db.js';
 import { ALICE, BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
+import { HISTORY_MUST_NOT_FAIL } from '../../test/support/history.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import { fixtureForms } from '../../test/support/wants.js';
 import { AccessGrantRepository } from '../db/repositories/access-grant-repository.js';
@@ -96,7 +97,11 @@ describe('round trips to the database per command', () => {
     const made = await partyServiceWith(
       [],
       { users, guilds, notifying: { users, guilds, wants, gymTargets, newTrains } },
-      { database: new PartyRepository(db), grants: new AccessGrantRepository(db) },
+      {
+        database: new PartyRepository(db, HISTORY_MUST_NOT_FAIL),
+        historyStorage: historyOptIns,
+        grants: new AccessGrantRepository(db),
+      },
     );
     const { ctx } = createTestContext({
       users,
@@ -321,9 +326,10 @@ describe('round trips to the database per command', () => {
       // The report is a message; who wants the Pokémon is read on the side, in one query.
       '/wild': { answered: 0, settled: 1 },
       '/gym show, typing': { answered: 0, settled: 0 },
-      // The reporter's settings, the party's row, and its post and its link line written to it
-      // as each exists; on the side, who wants the boss and who the gym.
-      '/raid': { answered: 4, settled: 6 },
+      // The reporter's settings, the party's row, the steps of its party history (who signed up
+      // when: one insert, plan 8H), and its post and its link line written to it as each exists;
+      // on the side, who wants the boss and who the gym.
+      '/raid': { answered: 5, settled: 7 },
     };
     expect(Object.keys(measured).sort()).toEqual(Object.keys(limits).sort());
     for (const [name, limit] of Object.entries(limits)) {
diff --git a/src/commands/settings/settings.ts b/src/commands/settings/settings.ts
index f783ebadc36baecebb2fe3e27c0b5a39971b712f..4191e12a539ec2c533da67859eae284dd6c47a61 100644
--- a/src/commands/settings/settings.ts
+++ b/src/commands/settings/settings.ts
@@ -389,8 +389,10 @@ const history: SubcommandPart = {
       'always count in it, without your name. With this on, your Discord id is kept as well with ' +
       'what you do from now on (what you sign up for, when, and how far you get), for statistics ' +
       'of your own later. Off takes your id out of everything kept so far: it all still counts, ' +
-      'without it. It is set per server: use it in the server you mean, not in a DM with me. The ' +
-      'history of the old bot, from before this one, is never tied to you.',
+      'without it. While a raid, train or meetup is still going on, I keep who signed up and ' +
+      'when, as I must to run it; when it ends, only the ids of members who opted in are kept, ' +
+      'and the rest is deleted. It is set per server: use it in the server you mean, not in a DM ' +
+      'with me. The history of the old bot, from before this one, is never tied to you.',
     examples: [`/settings ${HISTORY.name} enabled:True`, `/settings ${HISTORY.name} enabled:False`],
   },
   defer: 'late',
diff --git a/src/db/repositories/history-recording.db.test.ts b/src/db/repositories/history-recording.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fc5f59605288977763cd340e5f59cb9aebbb8114
--- /dev/null
+++ b/src/db/repositories/history-recording.db.test.ts
@@ -0,0 +1,427 @@
+import { sql, type Kysely } from 'kysely';
+import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
+import { HISTORY_SERVER } from '../../../test/support/history.js';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import {
+  ALICE,
+  BOB,
+  MINUTE,
+  PARTY_NOW,
+  REPORTER,
+  testRaid,
+  testTrain,
+  withAttendees,
+} from '../../../test/support/parties.js';
+import type { TestDatabase } from '../../../test/support/mysql.js';
+import {
+  historyMembers,
+  historyOfParty,
+  partySteps,
+  type HistoryNote,
+  type HistoryNoteEnd,
+} from '../../domain/history/party-history.js';
+import { endParty, type Party } from '../../domain/party/party.js';
+import { PartyStatus } from '../../domain/party/status.js';
+import { createDb } from '../kysely.js';
+import type { DB } from '../types.js';
+import { HistoryRepository } from './history-repository.js';
+import { PartyRepository } from './party-repository.js';
+
+const T = PARTY_NOW;
+const MOVED = '00000000-0000-4000-8000-000000000009';
+const POST = '900000000000000001';
+const FORUM = '900000000000000002';
+
+/** A record end, as the party history service makes it; `broken` throws while building it. */
+function recordOf(after: Party, broken?: 'build' | 'insert'): HistoryNoteEnd {
+  return {
+    kind: 'record',
+    members: (stored) => historyMembers(after, stored),
+    build: (stored, optedIn) => {
+      if (broken === 'build') throw new Error('the record could not be made');
+      const record = historyOfParty(after, {
+        end: { how: 'clock' },
+        steps: stored,
+        optedIn,
+        describeBoss: () => ({ name: 'Somebody' }),
+        shiny: null,
+      });
+      // A group id the table cannot hold: its insert fails after the party's row is written.
+      return broken === 'insert'
+        ? {
+            ...record,
+            groups: [
+              {
+                ...record.groups[0],
+                groupId: 'AB',
+                label: null,
+                meetingTime: null,
+                members: 0,
+                heads: 0,
+              },
+            ],
+          }
+        : record;
+    },
+  };
+}
+
+/** The note of a write, as the service makes it (a record when it ended). */
+function noteOf(before: Party | undefined, after: Party, end?: HistoryNoteEnd): HistoryNote {
+  const steps = partySteps(before, after, after.updatedAt);
+  if (after.status !== 'ended') return { partyId: after.id, guildId: after.guildId, steps };
+  return { partyId: after.id, guildId: after.guildId, steps, end: end ?? recordOf(after) };
+}
+
+describe('the party history, written with the parties', () => {
+  let stop: () => Promise<void>;
+  let database: TestDatabase;
+  let db: Kysely<DB>;
+  let failures: { note: HistoryNote; err: unknown }[];
+  let parties: PartyRepository;
+  let history: HistoryRepository;
+  const historyFailed = (note: HistoryNote, err: unknown) => {
+    failures.push({ note, err });
+  };
+
+  beforeAll(async () => {
+    ({ database, db, stop } = await startMigratedDatabase());
+    await sql`insert into Guild (id, snowflake) values (1, ${HISTORY_SERVER})`.execute(db);
+    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788)`.execute(
+      db,
+    );
+    await sql`insert into Gym (id, name) values (1, 'Fountain'), (11, 'A'), (12, 'B')`.execute(db);
+    parties = new PartyRepository(db, { historyFailed });
+    history = new HistoryRepository(db);
+  });
+  afterAll(async () => {
+    await stop();
+  });
+  beforeEach(async () => {
+    failures = [];
+    await db.deleteFrom('Party').execute();
+    await db.deleteFrom('PartyHistory').execute();
+    await db.deleteFrom('HistoryOptIn').execute();
+    await db.deleteFrom('EndedPartyPost').execute();
+  });
+
+  const stepsOf = (partyId: string) =>
+    db
+      .selectFrom('PartyHistoryStep')
+      .select(['kind', 'subject', 'value', 'at'])
+      .where('partyId', '=', partyId)
+      .orderBy('id')
+      .execute();
+  const kept = () => db.selectFrom('PartyHistory').selectAll().execute();
+  const rowOf = (partyId: string) =>
+    db.selectFrom('Party').select('status').where('id', '=', partyId).executeTakeFirst();
+  const attendees = () =>
+    db
+      .selectFrom('PartyHistoryAttendee')
+      .select(['seq', 'memberId', 'status', 'furthest', 'extras', 'joinedAt', 'doneAt'])
+      .orderBy('seq')
+      .execute();
+  const optIn = (member: string) =>
+    sql`insert into HistoryOptIn (serverId, memberId, createdAt)
+        values (${HISTORY_SERVER}, ${member}, 0)`.execute(db);
+
+  /** Writes a party's life one write after another, the first an insert, each a minute later. */
+  async function live(writes: Party[], extra: { from?: string } = {}): Promise<Party> {
+    let before: Party | undefined;
+    for (const [n, party] of writes.entries()) {
+      const after = { ...party, updatedAt: T + n * MINUTE };
+      if (before === undefined) {
+        const note = noteOf(undefined, after);
+        const from = extra.from;
+        const steps =
+          from === undefined
+            ? note.steps
+            : [
+                ...note.steps,
+                {
+                  partyId: after.id,
+                  at: after.updatedAt,
+                  kind: 'from' as const,
+                  subject: from,
+                  value: null,
+                },
+              ];
+        await parties.insert(after, { ...note, steps });
+      } else expect(await parties.save(after, noteOf(before, after))).toBe(true);
+      before = after;
+    }
+    return before as Party;
+  }
+  const ending = (party: Party, at: number): Party => ({ ...endParty(party), updatedAt: at });
+
+  it('makes the steps of a party its record when it ends, then deletes its row', async () => {
+    await optIn(ALICE);
+    const raid = { ...testRaid(), forumChannelId: FORUM, forumPostId: POST };
+    const ended = await live([
+      raid,
+      withAttendees(raid, { [ALICE]: { status: PartyStatus.Coming, number: 3 } }),
+      withAttendees(raid, { [ALICE]: { status: PartyStatus.Complete, number: 3 } }),
+    ]);
+    expect(await stepsOf(raid.id)).toEqual([
+      { kind: 'status', subject: REPORTER, value: '0', at: String(T) },
+      { kind: 'status', subject: ALICE, value: '1', at: String(T + MINUTE) },
+      { kind: 'status', subject: ALICE, value: '4', at: String(T + 2 * MINUTE) },
+    ]);
+    expect(await kept()).toEqual([]);
+
+    const last = ending(ended, T + 3 * MINUTE);
+    expect(await parties.save(last, noteOf(ended, last))).toBe(true);
+    expect(await stepsOf(raid.id)).toEqual([]);
+    expect(await kept()).toEqual([
+      expect.objectContaining({
+        source: 'live',
+        partyId: raid.id,
+        kind: 'raid',
+        serverId: HISTORY_SERVER,
+        regionId: 1,
+        gymId: 1,
+        tier: 'T5',
+        createdAt: String(T),
+        endedAt: String(T + 3 * MINUTE),
+        ending: 'completed',
+        createdById: null,
+        attendees: 2,
+        interested: 1,
+        done: 1,
+        doneHeads: 3,
+        extras: 2,
+      }),
+    ]);
+    expect(await attendees()).toEqual([
+      {
+        seq: 0,
+        memberId: null,
+        status: 'interested',
+        furthest: 'interested',
+        extras: 0,
+        joinedAt: null,
+        doneAt: null,
+      },
+      {
+        seq: 1,
+        memberId: ALICE,
+        status: 'done',
+        furthest: 'done',
+        extras: 2,
+        joinedAt: String(T + MINUTE),
+        doneAt: String(T + 2 * MINUTE),
+      },
+    ]);
+    // Its row is gone; what the archiving of reopened posts needs is kept, without a member.
+    expect(await rowOf(raid.id)).toBeUndefined();
+    expect(await parties.endedPosts([POST])).toEqual([POST]);
+    expect(await parties.partyForums(1)).toEqual([{ forumChannelId: FORUM, guildId: 1 }]);
+    expect(failures).toEqual([]);
+  });
+
+  it('leaves no id of a member who did not opt in anywhere once a party is recorded', async () => {
+    await optIn(ALICE);
+    const raid = testRaid();
+    const ended = await live([
+      raid,
+      withAttendees(raid, { [ALICE]: { status: PartyStatus.Coming } }),
+      withAttendees(raid, { [ALICE]: { status: PartyStatus.Coming }, [BOB]: {} }),
+      withAttendees(raid, { [ALICE]: { status: PartyStatus.Complete } }),
+    ]);
+    await parties.save(ending(ended, T + 5 * MINUTE), noteOf(ended, ending(ended, T + 5 * MINUTE)));
+    const everything = JSON.stringify(
+      await Promise.all(
+        [
+          'Party',
+          'PartyHistoryStep',
+          'PartyHistory',
+          'PartyHistoryAttendee',
+          'PartyHistoryGroup',
+          'PartyHistoryStop',
+          'EndedPartyPost',
+        ].map(async (table) => (await sql`select * from ${sql.table(table)}`.execute(db)).rows),
+      ),
+    );
+    expect(everything).not.toContain(REPORTER);
+    expect(everything).not.toContain(BOB);
+    expect(everything).toContain(ALICE);
+  });
+
+  it('keeps the stops and groups of a train', async () => {
+    const made = testTrain();
+    const on = (stop: number): Party => ({
+      ...made,
+      train: { ...made.train, route: [11, 12], stop },
+    });
+    const ended = await live([made, on(0), on(1), on(2)]);
+    await parties.save(ending(ended, T + 4 * MINUTE), noteOf(ended, ending(ended, T + 4 * MINUTE)));
+    expect(
+      await db
+        .selectFrom('PartyHistoryStop')
+        .select(['seq', 'gymId', 'arrivedAt', 'leftAt'])
+        .orderBy('seq')
+        .execute(),
+    ).toEqual([
+      { seq: 0, gymId: 11, arrivedAt: String(T + MINUTE), leftAt: String(T + 2 * MINUTE) },
+      { seq: 1, gymId: 12, arrivedAt: String(T + 2 * MINUTE), leftAt: String(T + 3 * MINUTE) },
+    ]);
+    expect(await db.selectFrom('PartyHistoryGroup').selectAll().execute()).toEqual([
+      expect.objectContaining({ groupId: 'A', members: 1, heads: 1 }),
+    ]);
+    expect(await kept()).toEqual([
+      expect.objectContaining({ kind: 'train', name: 'Saturday legendaries', routeStops: 2 }),
+    ]);
+  });
+
+  it('records a party once, whatever is written again, and drops a late step', async () => {
+    const raid = testRaid();
+    const ended = await live([raid]);
+    const last = ending(ended, T + MINUTE);
+    const note = noteOf(ended, last);
+    await parties.save(last, note);
+    await history.write(note, { retry: true });
+    await history.write(note);
+    expect(await kept()).toHaveLength(1);
+    expect(await attendees()).toHaveLength(1);
+    await history.write(noteOf(raid, withAttendees(raid, { [BOB]: {} })), { retry: true });
+    expect(await stepsOf(raid.id)).toEqual([]);
+  });
+
+  it('records a raid that moved once, as the party it went on as, with the steps of both', async () => {
+    const old = { ...testRaid(), forumChannelId: FORUM, forumPostId: POST };
+    const before = await live([old, withAttendees(old, { [ALICE]: {} })]);
+    const moved = await live([{ ...testRaid(), id: MOVED }], { from: old.id });
+    const left = ending(before, T + 2 * MINUTE);
+    await parties.save(left, noteOf(before, left, { kind: 'move', to: MOVED }));
+    expect(await kept()).toEqual([]);
+    // Left to the new party: the sweep records no such party by itself.
+    expect(await history.unrecorded()).toEqual([{ partyId: old.id, movedTo: MOVED }]);
+    // A late step of the old party is no step any more.
+    await history.write(noteOf(before, withAttendees(before, { [BOB]: {} })), { retry: true });
+    expect((await stepsOf(old.id)).map((step) => step.subject)).toEqual([REPORTER, ALICE]);
+
+    await parties.save(ending(moved, T + 9 * MINUTE), noteOf(moved, ending(moved, T + 9 * MINUTE)));
+    expect(await kept()).toEqual([expect.objectContaining({ partyId: MOVED })]);
+    // Who signed up before the move did so when they did.
+    expect((await attendees()).map((row) => row.joinedAt)).toEqual([null, String(T + MINUTE)]);
+    expect(await rowOf(old.id)).toBeUndefined();
+    expect(await rowOf(MOVED)).toBeUndefined();
+    expect(await stepsOf(old.id)).toEqual([]);
+    expect(await parties.endedPosts([POST])).toEqual([POST]);
+    expect(await history.unrecorded()).toEqual([]);
+  });
+
+  it('knows where a raid moved also when only the end of the old one said so', async () => {
+    const old = testRaid();
+    const before = await live([old]);
+    await live([{ ...testRaid(), id: MOVED }]);
+    const left = ending(before, T + 2 * MINUTE);
+    await parties.save(left, noteOf(before, left, { kind: 'move', to: MOVED }));
+    expect(await history.unrecorded()).toEqual([{ partyId: old.id, movedTo: MOVED }]);
+  });
+
+  it('drops a party that never was one: its steps and row go, nothing is recorded', async () => {
+    const ended = await live([testRaid()]);
+    await parties.save(
+      ending(ended, T + MINUTE),
+      noteOf(ended, ending(ended, T + MINUTE), { kind: 'drop' }),
+    );
+    expect(await kept()).toEqual([]);
+    expect(await rowOf(ended.id)).toBeUndefined();
+    expect(await history.unrecorded()).toEqual([]);
+  });
+
+  it('ends the party although its record cannot be made, and says so after', async () => {
+    const ended = await live([testRaid()]);
+    const last = ending(ended, T + MINUTE);
+    const note = noteOf(ended, last, recordOf(last, 'build'));
+    expect(await parties.save(last, note)).toBe(true);
+    expect(await parties.findById(last.id)).toEqual({ ok: true, party: last });
+    expect(await kept()).toEqual([]);
+    // Its steps and its row stay for a later try, or the sweep at start.
+    expect(await stepsOf(last.id)).toHaveLength(1);
+    expect(await history.unrecorded()).toEqual([{ partyId: last.id, movedTo: null }]);
+    expect(failures).toEqual([{ note, err: new Error('the record could not be made') }]);
+  });
+
+  it('undoes what the record wrote before it failed, and keeps the end', async () => {
+    const ended = await live([testRaid()]);
+    const last = ending(ended, T + MINUTE);
+    await parties.save(last, noteOf(ended, last, recordOf(last, 'insert')));
+    expect(await kept()).toEqual([]);
+    expect(await rowOf(last.id)).toEqual({ status: 'ended' });
+    expect(failures).toHaveLength(1);
+  });
+
+  it('ends the party alone when the record took its whole transaction with it', async () => {
+    const killing = new PartyRepository(db, {
+      historyFailed,
+      // A deadlock: MySQL rolls the whole transaction back, the savepoint with it.
+      history: (on) => ({
+        write: async () => {
+          await sql`rollback`.execute(on);
+          throw new Error('Deadlock found when trying to get lock');
+        },
+      }),
+    });
+    const ended = await live([testRaid()]);
+    const last = ending(ended, T + MINUTE);
+    expect(await killing.save(last, noteOf(ended, last))).toBe(true);
+    expect(await rowOf(last.id)).toEqual({ status: 'ended' });
+    expect(failures.map((failure) => String(failure.err))).toEqual([
+      'Error: Deadlock found when trying to get lock',
+    ]);
+  });
+
+  it('names nobody who opted out while the party ended (the opt-ins are read under a lock)', async () => {
+    await optIn(ALICE);
+    const raid = testRaid();
+    const ended = await live([raid, withAttendees(raid, { [ALICE]: {} })]);
+    const other = createDb<DB>(database.config);
+    try {
+      let release = (): void => undefined;
+      const held = new Promise<void>((resolve) => {
+        release = resolve;
+      });
+      let deleted = (): void => undefined;
+      const isDeleted = new Promise<void>((resolve) => {
+        deleted = resolve;
+      });
+      const optingOut = other.transaction().execute(async (trx) => {
+        await trx.deleteFrom('HistoryOptIn').where('memberId', '=', ALICE).execute();
+        deleted();
+        await held;
+      });
+      await isDeleted;
+      const last = ending(ended, T + 2 * MINUTE);
+      const saving = parties.save(last, noteOf(ended, last));
+      // eslint-disable-next-line no-restricted-syntax -- a real MySQL: nothing tells when the statement waits for the lock
+      await new Promise((resolve) => setTimeout(resolve, 300));
+      release();
+      await optingOut;
+      await saving;
+    } finally {
+      await other.destroy();
+    }
+    expect((await attendees()).map((row) => row.memberId)).toEqual([null, null]);
+  });
+
+  it('keeps the write of a party whose steps cannot be written, and says so', async () => {
+    const raid = testRaid();
+    const note: HistoryNote = {
+      partyId: raid.id,
+      guildId: 1,
+      steps: [{ partyId: raid.id, at: T, kind: 'status', subject: 'x'.repeat(40), value: 0 }],
+    };
+    await parties.insert(raid, note);
+    expect(await parties.findById(raid.id)).toEqual({ ok: true, party: raid });
+    expect(failures.map((failure) => failure.note)).toEqual([note]);
+    expect(failures[0]?.err).toBeInstanceOf(Error);
+  });
+
+  it('writes a party without a note as before', async () => {
+    const raid = testRaid();
+    await parties.insert(raid);
+    expect(await stepsOf(raid.id)).toEqual([]);
+  });
+});
diff --git a/src/db/repositories/history-repository.ts b/src/db/repositories/history-repository.ts
index 4683cbf6a937de894107ebea51dabb2e2d5da210..a5dabe9d3a7fdf55672816cd855d1fa21eabe2b7 100644
--- a/src/db/repositories/history-repository.ts
+++ b/src/db/repositories/history-repository.ts
@@ -1,4 +1,10 @@
-import { sql, type Kysely } from 'kysely';
+import { sql, type Insertable, type Kysely } from 'kysely';
+import {
+  historyCounts,
+  type HistoryNote,
+  type HistoryRecord,
+  type HistoryStep,
+} from '../../domain/history/party-history.js';
 import { inTransaction } from '../transaction.js';
 import type { DB } from '../types.js';
 
@@ -21,6 +27,147 @@ export interface HistoryOptIns {
   optOut(memberId: string, guildId: string): Promise<{ changed: boolean; forgotten: number }>;
 }
 
+/** An ended party whose row is still there: nothing recorded it, dropped it or took it along. */
+export interface UnrecordedParty {
+  partyId: string;
+  /** The party it moved to and goes on as, whose record will take it along; null if none. */
+  movedTo: string | null;
+}
+
+/** What the party history service writes besides the store (a retry, the sweep at start). */
+export interface HistoryStorage {
+  /**
+   * Writes a note (see `HistoryNote`): its steps, and what becomes of the party when it ended.
+   * `retry`: a write after the party's own, which writes no step for a party that has ended (a
+   * late step would otherwise stay behind for good) and nothing for one whose row is gone.
+   */
+  write(note: HistoryNote, options?: { retry?: boolean }): Promise<void>;
+  /** The ended parties still waiting for their record (`PartyHistory.sweep`), oldest first. */
+  unrecorded(): Promise<UnrecordedParty[]>;
+}
+
+/** What `insertRecords` did: rows it wrote, and records it found there already. */
+export interface RecordsWritten {
+  inserted: number;
+  existing: number;
+}
+
+/** As many rows as one insert of children takes (MySQL takes 65,535 placeholders at most). */
+const ROWS_PER_INSERT = 2_000;
+/** What the varchar(100) columns of names and labels hold. */
+const NAME_ROOM = 100;
+
+const flag = (value: boolean): number => (value ? 1 : 0);
+const epoch = (value: number | null): string | null => (value === null ? null : String(value));
+const clip = (value: string | null): string | null =>
+  value === null ? null : [...value].slice(0, NAME_ROOM).join('');
+
+function historyRow(record: HistoryRecord): Insertable<DB['PartyHistory']> {
+  const { boss } = record;
+  const known = boss !== null && 'key' in boss ? boss : undefined;
+  return {
+    source: record.source,
+    partyId: record.partyId,
+    legacyKey: record.legacyKey,
+    kind: record.kind,
+    serverId: record.serverId,
+    regionId: record.regionId,
+    gymId: record.gymId,
+    legacyGymId: record.legacyGymId,
+    name: clip(record.name),
+    description: record.description,
+    tier: record.tier,
+    shadow: flag(record.shadow),
+    mega: flag(record.mega),
+    elite: flag(record.elite),
+    ex: flag(record.ex),
+    shiny: record.shiny === null ? null : flag(record.shiny),
+    bossKey: known?.key ?? null,
+    bossDex: known?.dex ?? null,
+    bossSpecies: known?.species ?? null,
+    bossForm: known?.form ?? null,
+    bossName: boss !== null && 'name' in boss ? clip(boss.name) : null,
+    fastMove: record.fastMove,
+    chargedMove: record.chargedMove,
+    createdAt: String(record.createdAt),
+    hatchTime: epoch(record.hatchTime),
+    startTime: epoch(record.startTime),
+    endTime: epoch(record.endTime),
+    endedAt: epoch(record.endedAt),
+    ending: record.ending,
+    createdById: record.createdById,
+    conductorId: record.conductorId,
+    anonymous: flag(record.anonymous),
+    routeStops: record.routeStops,
+    ...historyCounts(record.attendees),
+  };
+}
+
+/** The key that makes a record unique: the live party, or the legacy file's raid. */
+const keyOf = (record: HistoryRecord): string => record.partyId ?? record.legacyKey ?? '';
+
+/** Writes steps of active parties; nothing for none. */
+async function insertSteps(db: Kysely<DB>, steps: readonly HistoryStep[]): Promise<void> {
+  if (steps.length === 0) return;
+  await db
+    .insertInto('PartyHistoryStep')
+    .values(
+      steps.map((step) => ({
+        partyId: step.partyId,
+        at: String(step.at),
+        kind: step.kind,
+        subject: step.subject,
+        value: step.value === null ? null : String(step.value),
+      })),
+    )
+    .execute();
+}
+
+/**
+ * The party and every party it went on from (its `from` steps, and theirs), itself first: what
+ * its record takes along.
+ */
+async function partiesOf(db: Kysely<DB>, partyId: string): Promise<string[]> {
+  const found = [partyId];
+  let frontier = [partyId];
+  while (frontier.length > 0) {
+    const rows = await db
+      .selectFrom('PartyHistoryStep')
+      .select('subject')
+      .where('kind', '=', 'from')
+      .where('partyId', 'in', frontier)
+      .execute();
+    frontier = [...new Set(rows.map((row) => row.subject))].filter((id) => !found.includes(id));
+    found.push(...frontier);
+  }
+  return found;
+}
+
+/**
+ * Deletes the rows of these parties, which hold their makers' and members' ids, once nothing of
+ * them is waiting for the history (their steps go with them). Their posts and forums are kept in
+ * `EndedPartyPost`, for the hourly archiving of reopened posts and the forums parties named.
+ */
+async function forget(db: Kysely<DB>, partyIds: readonly string[]): Promise<void> {
+  if (partyIds.length === 0) return;
+  await sql`
+    insert ignore into EndedPartyPost (forumPostId, forumChannelId, guildId, endedAt)
+    select forumPostId, forumChannelId, guildId, updatedAt from Party
+    where id in (${sql.join(partyIds)})
+      and forumPostId is not null and forumChannelId is not null`.execute(db);
+  await db
+    .deleteFrom('Party')
+    .where('id', 'in', [...partyIds])
+    .execute();
+}
+
+/** Inserts rows in chunks that one statement takes. */
+async function insertChunked<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
+  for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
+    await insert(rows.slice(start, start + ROWS_PER_INSERT));
+  }
+}
+
 /**
  * The party history: `PartyHistory` and its attendees, groups and stops, the steps of active
  * parties that become it (`PartyHistoryStep`) and who may be named in it (`HistoryOptIn`, a row
@@ -32,9 +179,202 @@ export interface HistoryOptIns {
  * of one member at once end as whichever committed last, and an opt-out takes the id out of
  * what is kept under the lock its statements take.
  */
-export class HistoryRepository implements HistoryOptIns {
+export class HistoryRepository implements HistoryOptIns, HistoryStorage {
   constructor(private readonly db: Kysely<DB>) {}
 
+  async unrecorded(): Promise<UnrecordedParty[]> {
+    const rows = await sql<{ partyId: string; movedTo: string | null }>`
+      select p.id as partyId,
+             (select s.partyId from PartyHistoryStep s
+              where s.kind = 'from' and s.subject = p.id limit 1) as movedTo
+      from Party p
+      where p.status = 'ended'
+        and not exists (select 1 from PartyHistory h where h.partyId = p.id)
+      order by p.updatedAt, p.id`.execute(this.db);
+    return rows.rows.map((row) => ({ partyId: row.partyId, movedTo: row.movedTo }));
+  }
+
+  async write(note: HistoryNote, options: { retry?: boolean } = {}): Promise<void> {
+    // Steps alone, the first time: one statement, no transaction (what every click writes).
+    if (note.end === undefined && !options.retry) {
+      await insertSteps(this.db, note.steps);
+      return;
+    }
+    await inTransaction(this.db, async (trx) => {
+      const { partyId, end } = note;
+      // Locked: a retry and the party's own end, or the sweep, take turns.
+      const row = await trx
+        .selectFrom('Party')
+        .select(['status', 'updatedAt'])
+        .where('id', '=', partyId)
+        .forUpdate()
+        .executeTakeFirst();
+      if (end === undefined) {
+        // A late step of a party that has ended (or is gone) is no step any more.
+        if (row?.status === 'active') await insertSteps(trx, note.steps);
+        return;
+      }
+      // Recorded, dropped or taken along already: its row went with it.
+      if (!row) return;
+      await insertSteps(trx, note.steps);
+      if (end.kind === 'move') {
+        // Lazy: the new party's record takes this one's steps and row. Said again here, in
+        // case the new party's own step did not make it.
+        const to = await trx
+          .selectFrom('Party')
+          .select('id')
+          .where('id', '=', end.to)
+          .executeTakeFirst();
+        if (to) {
+          await insertSteps(trx, [
+            {
+              partyId: end.to,
+              at: Number(row.updatedAt),
+              kind: 'from',
+              subject: partyId,
+              value: null,
+            },
+          ]);
+        }
+        return;
+      }
+      if (end.kind === 'drop') {
+        await forget(trx, [partyId]);
+        return;
+      }
+      const lineage = await partiesOf(trx, partyId);
+      const rows = await trx
+        .selectFrom('PartyHistoryStep')
+        .select(['partyId', 'at', 'kind', 'subject', 'value'])
+        .where('partyId', 'in', lineage)
+        .orderBy('at')
+        .orderBy('id')
+        .execute();
+      const steps = rows.map((step): HistoryStep => ({
+        partyId: step.partyId,
+        at: Number(step.at),
+        kind: step.kind as HistoryStep['kind'],
+        subject: step.subject,
+        value: step.value === null ? null : Number(step.value),
+      }));
+      const server = await trx
+        .selectFrom('Guild')
+        .select('snowflake')
+        .where('id', '=', note.guildId)
+        .executeTakeFirst();
+      if (!server?.snowflake) throw new Error(`Party ${partyId} has no server to record it in`);
+      const members = end.members(steps);
+      // Read under a shared lock: an opt-out of one of them that is under way finishes first,
+      // or waits for this record and then takes the id out of it.
+      const optedIn =
+        members.length === 0
+          ? []
+          : await trx
+              .selectFrom('HistoryOptIn')
+              .select('memberId')
+              .where('serverId', '=', server.snowflake)
+              .where('memberId', 'in', members)
+              .forShare()
+              .execute();
+      const record = end.build(steps, new Set(optedIn.map((opted) => opted.memberId)));
+      await new HistoryRepository(trx).insertRecords([{ ...record, serverId: server.snowflake }]);
+      await forget(trx, lineage);
+    });
+  }
+
+  /**
+   * Writes records with their attendees, groups and stops, in one transaction (or the
+   * caller's); a record whose party (or legacy key) is there already is left as it is.
+   */
+  insertRecords(records: readonly HistoryRecord[]): Promise<RecordsWritten> {
+    return inTransaction(this.db, async (trx) => {
+      const keys = (column: 'partyId' | 'legacyKey') =>
+        records.map((record) => record[column]).filter((key): key is string => key !== null);
+      const known = async (column: 'partyId' | 'legacyKey', wanted: string[]) => {
+        if (wanted.length === 0) return new Map<string, number>();
+        const rows = await trx
+          .selectFrom('PartyHistory')
+          .select(['id', column])
+          .where(column, 'in', wanted)
+          .execute();
+        return new Map(rows.map((row) => [row[column] ?? '', row.id]));
+      };
+      const ids = async () =>
+        new Map([
+          ...(await known('partyId', keys('partyId'))),
+          ...(await known('legacyKey', keys('legacyKey'))),
+        ]);
+      const there = await ids();
+      const seen = new Set<string>();
+      const fresh = records.filter((record) => {
+        const key = keyOf(record);
+        if (there.has(key) || seen.has(key)) return false;
+        seen.add(key);
+        return true;
+      });
+      if (fresh.length === 0) return { inserted: 0, existing: records.length };
+      await insertChunked(fresh.map(historyRow), (rows) =>
+        trx.insertInto('PartyHistory').values(rows).execute(),
+      );
+      const made = await ids();
+      const attendees: Insertable<DB['PartyHistoryAttendee']>[] = [];
+      const groups: Insertable<DB['PartyHistoryGroup']>[] = [];
+      const stops: Insertable<DB['PartyHistoryStop']>[] = [];
+      for (const record of fresh) {
+        const historyId = made.get(keyOf(record));
+        if (historyId === undefined) throw new Error(`No history row for ${keyOf(record)}`);
+        for (const [seq, attendee] of record.attendees.entries()) {
+          attendees.push({
+            historyId,
+            seq,
+            memberId: attendee.memberId,
+            status: attendee.status,
+            furthest: attendee.furthest,
+            groupId: attendee.groupId,
+            extras: Math.min(255, attendee.extras),
+            remote: flag(attendee.remote),
+            team: attendee.team,
+            signedUpAt: epoch(attendee.signedUpAt),
+            joinedAt: epoch(attendee.joinedAt),
+            hereAt: epoch(attendee.hereAt),
+            doneAt: epoch(attendee.doneAt),
+            leftAt: epoch(attendee.leftAt),
+          });
+        }
+        for (const group of record.groups) {
+          groups.push({
+            historyId,
+            groupId: group.groupId,
+            label: clip(group.label),
+            meetingTime: epoch(group.meetingTime),
+            members: group.members,
+            heads: group.heads,
+          });
+        }
+        for (const [seq, stop] of record.stops.entries()) {
+          stops.push({
+            historyId,
+            seq,
+            gymId: stop.gymId,
+            legacyGymId: stop.legacyGymId,
+            arrivedAt: epoch(stop.arrivedAt),
+            leftAt: epoch(stop.leftAt),
+          });
+        }
+      }
+      await insertChunked(attendees, (rows) =>
+        trx.insertInto('PartyHistoryAttendee').values(rows).execute(),
+      );
+      await insertChunked(groups, (rows) =>
+        trx.insertInto('PartyHistoryGroup').values(rows).execute(),
+      );
+      await insertChunked(stops, (rows) =>
+        trx.insertInto('PartyHistoryStop').values(rows).execute(),
+      );
+      return { inserted: fresh.length, existing: records.length - fresh.length };
+    });
+  }
+
   async isOptedIn(memberId: string, guildId: string): Promise<boolean> {
     const row = await this.db
       .selectFrom('HistoryOptIn')
diff --git a/src/db/repositories/party-repository.db.test.ts b/src/db/repositories/party-repository.db.test.ts
index 5ea3db74d56ba544cbb72d31c894b1e8110e8652..3140de4b0175c09697b236dfca4f5aeb4a56da89 100644
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -12,6 +12,7 @@ import {
   testTrain,
   withAttendees,
 } from '../../../test/support/parties.js';
+import { HISTORY_MUST_NOT_FAIL } from '../../../test/support/history.js';
 import { createTestLogger } from '../../../test/support/test-logger.js';
 import { endParty } from '../../domain/party/party.js';
 import type { MeetupParty, RaidParty, TrainParty } from '../../domain/party/party.js';
@@ -32,7 +33,7 @@ describe('PartyRepository', () => {
 
   beforeAll(async () => {
     ({ db, stop } = await startMigratedDatabase());
-    parties = new PartyRepository(db);
+    parties = new PartyRepository(db, HISTORY_MUST_NOT_FAIL);
     await sql`insert into Guild (id, snowflake) values (1, '412345678901234567')`.execute(db);
     await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788)`.execute(
       db,
diff --git a/src/db/repositories/party-repository.ts b/src/db/repositories/party-repository.ts
index 6ac1b130b181c1e23a8e06bae0b0e20cb2023339..1d5bf9619ebc8a98ad6981e8273cc79be5d6c245 100644
--- a/src/db/repositories/party-repository.ts
+++ b/src/db/repositories/party-repository.ts
@@ -1,4 +1,5 @@
-import type { Kysely, Selectable } from 'kysely';
+import { sql, type Kysely, type Selectable } from 'kysely';
+import type { HistoryNote } from '../../domain/history/party-history.js';
 import {
   partyFromStored,
   partyMirrors,
@@ -7,7 +8,9 @@ import {
   type StoredParty,
 } from '../../domain/party/party-state.js';
 import type { Party } from '../../domain/party/party.js';
+import { inTransaction } from '../transaction.js';
 import type { DB, Party as PartyTable } from '../types.js';
+import { HistoryRepository } from './history-repository.js';
 
 /**
  * A row of `Party` that could not be read as a party; it is left as it is. The columns of its
@@ -27,9 +30,16 @@ export interface PartyList {
 
 /** What the party store needs from storage. */
 export interface PartyStorage {
-  insert(party: Party): Promise<void>;
-  /** Writes everything that can change. Returns false when there is no such row. */
-  save(party: Party): Promise<boolean>;
+  /**
+   * Writes a new party; with `note` what it adds to the party history (`HistoryNote`), in the
+   * same transaction where the storage can.
+   */
+  insert(party: Party, note?: HistoryNote): Promise<void>;
+  /**
+   * Writes everything that can change, and `note` as `insert` does. Returns false when there is
+   * no such row (and writes no note).
+   */
+  save(party: Party, note?: HistoryNote): Promise<boolean>;
   /** Every party that has not ended, oldest first. */
   listActive(): Promise<PartyList>;
   /** Those of these forum posts that are the post of a party that has ended. */
@@ -118,38 +128,125 @@ function listOf(rows: Selectable<PartyTable>[]): PartyList {
  * The `Party` table. What the scheduler and the duplicate check search by is in columns; the
  * rest of a party is the JSON document `state` (see `party-state.ts`).
  */
+/** What writes a note of the party history: `HistoryRepository`, over the connection given. */
+export type HistoryWriter = (db: Kysely<DB>) => { write(note: HistoryNote): Promise<void> };
+
+export interface PartyRepositoryOptions {
+  /**
+   * Told, once the party's own write has committed, of a note of the party history that could
+   * not be written with it (the party's write stands): `PartyHistory.failed`, which tries it
+   * again. Never told of a write that did not commit, which the store does not keep either.
+   */
+  historyFailed: (note: HistoryNote, err: unknown) => void;
+  /** Who writes the notes; `HistoryRepository` (a test gives one that fails as it needs). */
+  history?: HistoryWriter;
+}
+
 export class PartyRepository implements PartyStorage {
-  constructor(private readonly db: Kysely<DB>) {}
-
-  async insert(party: Party): Promise<void> {
-    await this.db
-      .insertInto('Party')
-      .values({
-        id: party.id,
-        guildId: party.guildId,
-        type: party.type,
-        createdById: party.createdById,
-        createdAt: String(party.createdAt),
-        ...changeable(party),
-      })
-      .execute();
+  private readonly history: HistoryWriter;
+
+  /**
+   * `db` is the pool, never a caller's transaction: the note of a party's end is written behind
+   * a savepoint of a transaction of its own, which may have to be run again alone.
+   */
+  constructor(
+    private readonly db: Kysely<DB>,
+    private readonly options: PartyRepositoryOptions,
+  ) {
+    if (db.isTransaction) throw new Error('PartyRepository needs the pool, not a transaction');
+    this.history = options.history ?? ((on) => new HistoryRepository(on));
   }
 
-  async save(party: Party): Promise<boolean> {
-    const result = await this.db
-      .updateTable('Party')
-      .set(changeable(party))
-      .where('id', '=', party.id)
-      .executeTakeFirst();
-    // The driver reports matched rows, so an unchanged row already counts; the look-up only
-    // tells a missing row from a present one when the count is zero.
-    if (result.numUpdatedRows > 0n) return true;
-    const row = await this.db
-      .selectFrom('Party')
-      .select('id')
-      .where('id', '=', party.id)
-      .executeTakeFirst();
-    return row !== undefined;
+  async insert(party: Party, note?: HistoryNote): Promise<void> {
+    await this.withNote(note, async (db) => {
+      await db
+        .insertInto('Party')
+        .values({
+          id: party.id,
+          guildId: party.guildId,
+          type: party.type,
+          createdById: party.createdById,
+          createdAt: String(party.createdAt),
+          ...changeable(party),
+        })
+        .execute();
+      return true;
+    });
+  }
+
+  save(party: Party, note?: HistoryNote): Promise<boolean> {
+    return this.withNote(note, async (db) => {
+      const result = await db
+        .updateTable('Party')
+        .set(changeable(party))
+        .where('id', '=', party.id)
+        .executeTakeFirst();
+      // The driver reports matched rows, so an unchanged row already counts; the look-up only
+      // tells a missing row from a present one when the count is zero.
+      if (result.numUpdatedRows > 0n) return true;
+      const row = await db
+        .selectFrom('Party')
+        .select('id')
+        .where('id', '=', party.id)
+        .executeTakeFirst();
+      return row !== undefined;
+    });
+  }
+
+  /**
+   * Runs the party's own write, and the note after it. A note that ends the party is written in
+   * the same transaction, behind a savepoint: one that fails is rolled back alone and handed to
+   * `historyFailed` once the party's write has committed. When the failure took the whole
+   * transaction with it (a deadlock, a lock wait that rolls back: the savepoint is gone), the
+   * party's write is run again alone, so that the party ends all the same. A note of steps alone
+   * (what a click adds) follows the party's write in one statement of its own, without a
+   * transaction: a click costs one round trip more, not five, and a step that fails is tried
+   * again the same way.
+   */
+  private async withNote(
+    note: HistoryNote | undefined,
+    write: (db: Kysely<DB>) => Promise<boolean>,
+  ): Promise<boolean> {
+    if (note === undefined || (note.steps.length === 0 && note.end === undefined)) {
+      return write(this.db);
+    }
+    const { historyFailed } = this.options;
+    if (note.end === undefined) {
+      if (!(await write(this.db))) return false;
+      try {
+        await this.history(this.db).write(note);
+      } catch (err) {
+        historyFailed(note, err);
+      }
+      return true;
+    }
+    let failure: { err: unknown } | undefined;
+    let lost = false;
+    let written: boolean;
+    try {
+      written = await inTransaction(this.db, async (trx) => {
+        if (!(await write(trx))) return false;
+        await sql`savepoint party_history`.execute(trx);
+        try {
+          await this.history(trx).write(note);
+          await sql`release savepoint party_history`.execute(trx);
+        } catch (err) {
+          failure = { err };
+          try {
+            await sql`rollback to savepoint party_history`.execute(trx);
+          } catch {
+            lost = true;
+            throw err;
+          }
+        }
+        return true;
+      });
+    } catch (err) {
+      if (!lost) throw err;
+      written = await write(this.db);
+    }
+    if (failure && written) historyFailed(note, failure.err);
+    return written;
   }
 
   /** The party with this id, whatever its status; undefined when there is none. */
@@ -196,6 +293,7 @@ export class PartyRepository implements PartyStorage {
     return listOf(rows);
   }
 
+  /** From the rows of ended parties, and from what stands in for those deleted once recorded. */
   async endedPosts(forumPostIds: readonly string[]): Promise<string[]> {
     if (forumPostIds.length === 0) return [];
     const rows = await this.db
@@ -204,9 +302,16 @@ export class PartyRepository implements PartyStorage {
       .where('status', '=', 'ended')
       .where('forumPostId', 'in', [...forumPostIds])
       .execute();
-    return rows.map((row) => row.forumPostId).filter((id): id is string => id !== null);
+    const kept = await this.db
+      .selectFrom('EndedPartyPost')
+      .select('forumPostId')
+      .where('forumPostId', 'in', [...forumPostIds])
+      .execute();
+    const ids = [...rows.map((row) => row.forumPostId), ...kept.map((row) => row.forumPostId)];
+    return [...new Set(ids.filter((id): id is string => id !== null))];
   }
 
+  /** From the rows of parties, and from what stands in for those deleted once recorded. */
   async partyForums(guildId?: number): Promise<PartyForum[]> {
     let query = this.db
       .selectFrom('Party')
@@ -214,13 +319,23 @@ export class PartyRepository implements PartyStorage {
       .where('forumChannelId', 'is not', null);
     // By the index on (guildId, forumChannelId) of migration 011.
     if (guildId !== undefined) query = query.where('guildId', '=', guildId);
-    const rows = await query
-      .groupBy(['forumChannelId', 'guildId'])
-      .orderBy('guildId')
-      .orderBy('forumChannelId')
-      .execute();
-    return rows.flatMap(({ forumChannelId, guildId }) =>
-      forumChannelId === null ? [] : [{ forumChannelId, guildId }],
+    let kept = this.db.selectFrom('EndedPartyPost').select(['forumChannelId', 'guildId']);
+    // By the index on (guildId, forumChannelId) of migration 018.
+    if (guildId !== undefined) kept = kept.where('guildId', '=', guildId);
+    const rows = [
+      ...(await query.groupBy(['forumChannelId', 'guildId']).execute()),
+      ...(await kept.groupBy(['forumChannelId', 'guildId']).execute()),
+    ];
+    const forums = new Map<string, PartyForum>();
+    for (const { forumChannelId, guildId: guild } of rows) {
+      if (forumChannelId !== null) {
+        forums.set(`${String(guild)}:${forumChannelId}`, { forumChannelId, guildId: guild });
+      }
+    }
+    return [...forums.values()].sort(
+      (a, b) =>
+        a.guildId - b.guildId ||
+        (a.forumChannelId < b.forumChannelId ? -1 : a.forumChannelId > b.forumChannelId ? 1 : 0),
     );
   }
 
diff --git a/src/domain/history/party-history.test.ts b/src/domain/history/party-history.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0f6a1d360c0ca3a67525849554cdd4f5349bdab7
--- /dev/null
+++ b/src/domain/history/party-history.test.ts
@@ -0,0 +1,354 @@
+import { describe, expect, it } from 'vitest';
+import {
+  ALICE,
+  BOB,
+  CAROL,
+  MINUTE,
+  PARTY_NOW,
+  REPORTER,
+  testMeetup,
+  testRaid,
+  testTrain,
+  withAttendees,
+} from '../../../test/support/parties.js';
+import { endParty, type Party, type RaidBossRef, type TrainParty } from '../party/party.js';
+import { PartyStatus } from '../party/status.js';
+import {
+  historyCounts,
+  historyMembers,
+  historyOfParty,
+  partySteps,
+  type HistoryBoss,
+  type HistoryStep,
+} from './party-history.js';
+
+const T = PARTY_NOW;
+const describeBoss = (ref: RaidBossRef): HistoryBoss =>
+  'key' in ref ? { key: ref.key, dex: 717, species: 'YVELTAL', form: null } : { name: ref.name };
+
+/** The steps of a party's life, one write after another, each `MINUTE` after the last. */
+function stepsOf(writes: Party[]): HistoryStep[] {
+  const steps: HistoryStep[] = [];
+  let before: Party | undefined;
+  for (const [n, after] of writes.entries()) {
+    steps.push(...partySteps(before, after, T + n * MINUTE));
+    before = after;
+  }
+  return steps;
+}
+
+function train(stop: number, route: number[] = [11, 12, 13]): TrainParty {
+  const made = testTrain();
+  return { ...made, train: { ...made.train, route, stop } };
+}
+
+describe('partySteps', () => {
+  it('notes the members a new party starts with', () => {
+    expect(partySteps(undefined, testRaid(), T)).toEqual([
+      { partyId: testRaid().id, at: T, kind: 'status', subject: REPORTER, value: 0 },
+    ]);
+  });
+
+  it('notes a changed status, a member who left, and nothing that stayed', () => {
+    const before = withAttendees(testRaid(), { [ALICE]: {}, [BOB]: {} });
+    const { [BOB]: _bob, ...rest } = withAttendees(before, {
+      [ALICE]: { status: PartyStatus.Present },
+    }).attendees;
+    const after = { ...before, attendees: rest };
+    expect(
+      partySteps(before, after, T).map(({ kind, subject, value }) => [kind, subject, value]),
+    ).toEqual([
+      ['status', ALICE, PartyStatus.Present],
+      ['left', BOB, null],
+    ]);
+    expect(partySteps(after, { ...after }, T)).toEqual([]);
+  });
+
+  it('notes a meeting time when it is set or moved, not when it is cleared', () => {
+    const raid = testRaid();
+    const set = { ...raid, groups: [{ id: 'A' as const, startTime: T + 30 * MINUTE }] };
+    const moved = { ...raid, groups: [{ id: 'A' as const, startTime: T + 40 * MINUTE }] };
+    expect(partySteps(raid, set, T)).toEqual([
+      { partyId: raid.id, at: T, kind: 'meet', subject: 'A', value: T + 30 * MINUTE },
+    ]);
+    expect(partySteps(set, moved, T)[0]?.value).toBe(T + 40 * MINUTE);
+    expect(partySteps(moved, raid, T)).toEqual([]);
+  });
+
+  it('notes where a train is whenever that changes', () => {
+    const empty = testTrain();
+    const steps = partySteps(empty, train(0), T);
+    expect(steps).toEqual([{ partyId: empty.id, at: T, kind: 'stop', subject: '11', value: 11 }]);
+    expect(partySteps(train(0), train(1), T)[0]).toMatchObject({ subject: '12', value: 12 });
+    expect(partySteps(train(2), train(3), T)[0]).toMatchObject({ subject: 'end', value: null });
+    // A route edited around the train leaves it where it is.
+    expect(partySteps(train(1), train(0, [12, 13]), T)).toEqual([]);
+  });
+});
+
+describe('historyOfParty', () => {
+  it('keeps a raid with its attendees in the order they came, their times and how far they got', () => {
+    const made = withAttendees(testRaid({ boss: { key: 'yveltal' } }), {
+      [ALICE]: { status: PartyStatus.Interested, number: 2, remote: true, team: 'mystic' },
+    });
+    const writes: Party[] = [
+      made,
+      withAttendees(made, { [ALICE]: { status: PartyStatus.Coming, number: 2, remote: true } }),
+      withAttendees(made, { [ALICE]: { status: PartyStatus.Present, number: 2, remote: true } }),
+      withAttendees(made, {
+        [ALICE]: { status: PartyStatus.Complete, number: 2, remote: true, team: 'mystic' },
+        [BOB]: { status: PartyStatus.Coming },
+      }),
+    ];
+    const last = writes.at(-1) as Party;
+    const ended = { ...endParty(last), updatedAt: T + 9 * MINUTE };
+    const record = historyOfParty(ended, {
+      end: { how: 'clock' },
+      steps: stepsOf(writes),
+      optedIn: new Set([ALICE]),
+      describeBoss,
+      shiny: true,
+    });
+    expect(record).toMatchObject({
+      source: 'live',
+      partyId: ended.id,
+      legacyKey: null,
+      kind: 'raid',
+      regionId: 1,
+      gymId: 1,
+      tier: 'T5',
+      shadow: false,
+      mega: false,
+      elite: false,
+      ex: false,
+      shiny: true,
+      boss: { key: 'yveltal', dex: 717, species: 'YVELTAL', form: null },
+      createdAt: T,
+      endedAt: T + 9 * MINUTE,
+      ending: 'completed',
+      createdById: null,
+      anonymous: false,
+    });
+    expect(record.attendees).toEqual([
+      {
+        memberId: null,
+        status: 'interested',
+        furthest: 'interested',
+        groupId: 'A',
+        extras: 0,
+        remote: false,
+        team: null,
+        signedUpAt: T,
+        joinedAt: null,
+        hereAt: null,
+        doneAt: null,
+        leftAt: null,
+      },
+      {
+        memberId: ALICE,
+        status: 'done',
+        furthest: 'done',
+        groupId: 'A',
+        extras: 1,
+        remote: true,
+        team: 'mystic',
+        signedUpAt: T,
+        joinedAt: T + MINUTE,
+        hereAt: T + 2 * MINUTE,
+        doneAt: T + 3 * MINUTE,
+        leftAt: null,
+      },
+      expect.objectContaining({ memberId: null, status: 'joined', joinedAt: T + 3 * MINUTE }),
+    ]);
+    expect(record.groups).toEqual([
+      { groupId: 'A', label: null, meetingTime: null, members: 3, heads: 4 },
+    ]);
+    expect(historyCounts(record.attendees)).toEqual({
+      attendees: 3,
+      interested: 1,
+      joined: 1,
+      here: 0,
+      done: 1,
+      interestedHeads: 1,
+      joinedHeads: 1,
+      hereHeads: 0,
+      doneHeads: 2,
+      extras: 1,
+      remote: 1,
+      departed: 0,
+    });
+  });
+
+  it('counts how far a member got, also when they went back or left', () => {
+    const made = withAttendees(testRaid(), { [ALICE]: {}, [BOB]: {} });
+    const back = withAttendees(made, {
+      [ALICE]: { status: PartyStatus.Present },
+      [BOB]: { status: PartyStatus.Present },
+    });
+    const { [BOB]: _bob, ...stayed } = withAttendees(back, {
+      [ALICE]: { status: PartyStatus.Coming },
+    }).attendees;
+    const writes: Party[] = [made, back, { ...back, attendees: stayed }];
+    const record = historyOfParty(endParty(writes.at(-1) as Party), {
+      end: { how: 'clock' },
+      steps: stepsOf(writes),
+      optedIn: new Set([BOB]),
+      describeBoss,
+      shiny: null,
+    });
+    expect(record.ending).toBe('expired');
+    expect(record.attendees.slice(1)).toEqual([
+      expect.objectContaining({ memberId: null, status: 'joined', furthest: 'here' }),
+      expect.objectContaining({
+        memberId: BOB,
+        status: null,
+        furthest: 'here',
+        groupId: null,
+        hereAt: T + MINUTE,
+        leftAt: T + 2 * MINUTE,
+      }),
+    ]);
+    expect(historyCounts(record.attendees)).toMatchObject({ here: 2, departed: 1 });
+  });
+
+  it('names the member who made it and the conductor only with their opt-in', () => {
+    const made = testTrain();
+    const led = withAttendees(
+      { ...made, train: { ...made.train, conductorId: ALICE } },
+      { [ALICE]: {} },
+    );
+    const record = (optedIn: string[]) =>
+      historyOfParty(endParty(led), {
+        end: { how: 'cancelled' },
+        steps: [],
+        optedIn: new Set(optedIn),
+        describeBoss,
+        shiny: null,
+      });
+    expect(record([])).toMatchObject({ createdById: null, conductorId: null, ending: 'cancelled' });
+    expect(record([REPORTER, ALICE])).toMatchObject({ createdById: REPORTER, conductorId: ALICE });
+    expect(historyMembers(led, [])).toEqual([REPORTER, ALICE]);
+  });
+
+  it('keeps the members of the steps and of the party for the opt-in', () => {
+    const made = withAttendees(testRaid(), { [ALICE]: {} });
+    const steps: HistoryStep[] = [
+      { partyId: made.id, at: T, kind: 'status', subject: CAROL, value: 0 },
+      { partyId: made.id, at: T, kind: 'left', subject: CAROL, value: null },
+    ];
+    expect(historyMembers(made, steps)).toEqual([CAROL, REPORTER, ALICE]);
+  });
+
+  it('keeps the meeting time of a group after the clock cleared it', () => {
+    const raid = testRaid();
+    const set = { ...raid, groups: [{ id: 'A' as const, label: 'Bus', startTime: T + MINUTE }] };
+    const cleared = { ...raid, groups: [{ id: 'A' as const, label: 'Bus' }] };
+    const record = historyOfParty(endParty(cleared), {
+      end: { how: 'clock' },
+      steps: stepsOf([raid, set, cleared]),
+      optedIn: new Set(),
+      describeBoss,
+      shiny: null,
+    });
+    expect(record.groups).toEqual([
+      { groupId: 'A', label: 'Bus', meetingTime: T + MINUTE, members: 1, heads: 1 },
+    ]);
+  });
+
+  it('says how a party ended: by the clock, by somebody, or not known', () => {
+    const ended = (party: Party, how?: 'clock' | 'cancelled') =>
+      historyOfParty(endParty(party), {
+        end: how === undefined ? undefined : { how },
+        steps: [],
+        optedIn: new Set(),
+        describeBoss,
+        shiny: null,
+      }).ending;
+    const here = withAttendees(testMeetup(), { [ALICE]: { status: PartyStatus.Present } });
+    expect(ended(here, 'clock')).toBe('completed');
+    expect(ended(testMeetup(), 'clock')).toBe('expired');
+    // A raid is completed when somebody completed it, not when somebody was there.
+    expect(
+      ended(withAttendees(testRaid(), { [ALICE]: { status: PartyStatus.Present } }), 'clock'),
+    ).toBe('expired');
+    expect(ended(testRaid(), 'cancelled')).toBe('cancelled');
+    expect(ended(testRaid())).toBe('unknown');
+    // Closed by somebody, or for a reason not known, after it took place: completed all the same.
+    const done = withAttendees(testRaid(), { [ALICE]: { status: PartyStatus.Complete } });
+    expect(ended(done, 'cancelled')).toBe('completed');
+    expect(ended(done)).toBe('completed');
+    const rode = withAttendees(testTrain(), { [ALICE]: { status: PartyStatus.Present } });
+    expect(ended(rode, 'cancelled')).toBe('completed');
+  });
+
+  it('keeps a meetup with its name and words, at no gym', () => {
+    const meetup = testMeetup();
+    const record = historyOfParty(
+      endParty({ ...meetup, meetup: { description: 'Bring snacks' } }),
+      { end: { how: 'clock' }, steps: [], optedIn: new Set(), describeBoss, shiny: null },
+    );
+    expect(record).toMatchObject({
+      kind: 'meetup',
+      name: 'Community Day picnic',
+      description: 'Bring snacks',
+      gymId: null,
+      tier: null,
+      boss: null,
+      stops: [],
+      routeStops: null,
+    });
+  });
+
+  it('keeps the stops a train made, when it got there and when it left', () => {
+    // The first stop was laid before the start: the train got there at its start.
+    const start = T + 1.5 * MINUTE;
+    const timed = (party: TrainParty): TrainParty => ({
+      ...party,
+      timed: { ...party.timed, startTime: start },
+    });
+    const writes: Party[] = [
+      timed(testTrain()),
+      timed(train(0)),
+      timed(train(1)),
+      timed(train(0)),
+      timed(train(1)),
+      timed(train(3)),
+    ];
+    const record = historyOfParty(endParty(writes.at(-1) as Party), {
+      end: { how: 'clock' },
+      steps: stepsOf(writes),
+      optedIn: new Set(),
+      describeBoss,
+      shiny: null,
+    });
+    expect(record.routeStops).toBe(3);
+    expect(record.stops).toEqual([
+      { gymId: 11, legacyGymId: null, arrivedAt: start, leftAt: T + 2 * MINUTE },
+      { gymId: 12, legacyGymId: null, arrivedAt: T + 2 * MINUTE, leftAt: T + 3 * MINUTE },
+      { gymId: 11, legacyGymId: null, arrivedAt: T + 3 * MINUTE, leftAt: T + 4 * MINUTE },
+      { gymId: 12, legacyGymId: null, arrivedAt: T + 4 * MINUTE, leftAt: T + 5 * MINUTE },
+    ]);
+  });
+
+  it('keeps the stops of a train it saw no steps of as far as the route says, without times', () => {
+    const record = (party: TrainParty) =>
+      historyOfParty(endParty(party), {
+        end: { how: 'clock' },
+        steps: [],
+        optedIn: new Set(),
+        describeBoss,
+        shiny: null,
+      }).stops.map((stop) => stop.gymId);
+    expect(record(train(3))).toEqual([11, 12, 13]);
+    expect(record(train(1))).toEqual([11, 12]);
+    // At its first stop: there once it started, not before.
+    expect(record(train(0))).toEqual([]);
+    const started = train(0);
+    expect(
+      record({ ...started, timed: { ...started.timed, startTime: started.updatedAt - MINUTE } }),
+    ).toEqual([11]);
+    expect(
+      record({ ...started, timed: { ...started.timed, startTime: started.updatedAt + MINUTE } }),
+    ).toEqual([]);
+  });
+});
diff --git a/src/domain/history/party-history.ts b/src/domain/history/party-history.ts
new file mode 100644
index 0000000000000000000000000000000000000000..47981307d1b3ca8cc7dbdfdc2c841d52abb780d2
--- /dev/null
+++ b/src/domain/history/party-history.ts
@@ -0,0 +1,467 @@
+import {
+  attendeeOf,
+  isRaid,
+  isTimed,
+  isTrain,
+  type Attendee,
+  type Party,
+  type RaidBossRef,
+  type Team,
+} from '../party/party.js';
+import { PartyStatus } from '../party/status.js';
+import { currentStop, placeOf } from '../party/train.js';
+
+/*
+ * The party history (plan 8H): what a party was and what became of it, as plain rows that SQL
+ * can count, written once when the party ends (docs/architecture/history.md). This module is
+ * the pure part: the steps an active party leaves (`partySteps`), and the record a party that
+ * ended becomes (`historyOfParty`). Members are named in it only with their opt-in.
+ */
+
+export type HistoryKind = 'raid' | 'train' | 'meetup';
+
+/** How far a member got, as the history says it (an attendee's status, worded for SQL). */
+export const HISTORY_STATUSES = ['interested', 'joined', 'here', 'done'] as const;
+export type HistoryStatus = (typeof HISTORY_STATUSES)[number];
+
+/**
+ * How a party ended: `completed` (by the clock, after somebody completed the raid, or was at
+ * the train or meetup), `expired` (by the clock, without that), `cancelled` (somebody closed it:
+ * `/delete`, its region removed, its post deleted), `cutover` (a party of the legacy bot that
+ * was still going on when the bot was replaced), `unknown` (the legacy files do not say).
+ */
+export const PARTY_ENDINGS = ['completed', 'expired', 'cancelled', 'cutover', 'unknown'] as const;
+export type PartyEnding = (typeof PARTY_ENDINGS)[number];
+
+/**
+ * A raid's tier as the history keeps it: the bot's levels, and the legacy bot's that the game
+ * has dropped (`T2`, `T4`, `EX`).
+ */
+export type HistoryTier =
+  'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'Mega' | 'MegaLegendary' | 'SuperMega' | 'Elite' | 'EX';
+
+/**
+ * Why a live party ended, as whoever ended it tells the store (`PartyStore.update`'s `ended`):
+ * the clock, a person (`cancelled`), a move to another region that goes on as the party `to`,
+ * or a failure before it had a post. A party that moved or failed is no party of its own in the
+ * history: the one it moved to is, and one that failed never was.
+ */
+export type PartyEnd =
+  { how: 'clock' } | { how: 'cancelled' } | { how: 'moved'; to: string } | { how: 'failed' };
+
+/** A boss the catalogue knows, by its ids; or the name it was given, when it does not. */
+export type HistoryBoss =
+  { key: string; dex: number; species: string; form: string | null } | { name: string };
+
+export interface HistoryAttendee {
+  /** Only with the member's opt-in; null otherwise (the row still counts). */
+  memberId: string | null;
+  /** At the end; null for a member who left before it. */
+  status: HistoryStatus | null;
+  furthest: HistoryStatus;
+  groupId: string | null;
+  /** The +1s: who they brought besides themself. */
+  extras: number;
+  remote: boolean;
+  team: Team | null;
+  signedUpAt: number | null;
+  joinedAt: number | null;
+  hereAt: number | null;
+  doneAt: number | null;
+  leftAt: number | null;
+}
+
+export interface HistoryGroup {
+  groupId: string;
+  label: string | null;
+  meetingTime: number | null;
+  /** Its members at the end, and with their +1s. */
+  members: number;
+  heads: number;
+}
+
+/** A stop a train made, in the order it made them (a loop makes a gym's stop more than once). */
+export interface HistoryStop {
+  gymId: number | null;
+  /** The legacy file's gym where it is not (or no longer) in the gym list. */
+  legacyGymId: number | null;
+  arrivedAt: number | null;
+  leftAt: number | null;
+}
+
+/** A party as the history keeps it. Times are epoch milliseconds. */
+export interface HistoryRecord {
+  source: 'live' | 'legacy';
+  partyId: string | null;
+  legacyKey: string | null;
+  kind: HistoryKind;
+  /** The server's snowflake: the history outlives its `Guild` row. */
+  serverId: string;
+  regionId: number | null;
+  gymId: number | null;
+  legacyGymId: number | null;
+  name: string | null;
+  description: string | null;
+  tier: HistoryTier | null;
+  shadow: boolean;
+  mega: boolean;
+  elite: boolean;
+  ex: boolean;
+  /** Whether the boss could be shiny; null where that is not known. */
+  shiny: boolean | null;
+  boss: HistoryBoss | null;
+  fastMove: string | null;
+  chargedMove: string | null;
+  createdAt: number;
+  hatchTime: number | null;
+  startTime: number | null;
+  endTime: number | null;
+  endedAt: number | null;
+  ending: PartyEnding;
+  createdById: string | null;
+  conductorId: string | null;
+  anonymous: boolean;
+  /** The stops of a train's route at the end; null for other parties. */
+  routeStops: number | null;
+  attendees: readonly HistoryAttendee[];
+  groups: readonly HistoryGroup[];
+  stops: readonly HistoryStop[];
+}
+
+/** The counts kept with a party, so that the common questions need no join. */
+export interface HistoryCounts {
+  attendees: number;
+  /** Members by the furthest status they reached, and the same with their +1s. */
+  interested: number;
+  joined: number;
+  here: number;
+  done: number;
+  interestedHeads: number;
+  joinedHeads: number;
+  hereHeads: number;
+  doneHeads: number;
+  extras: number;
+  remote: number;
+  /** Members who left before the end. */
+  departed: number;
+}
+
+export function historyCounts(attendees: readonly HistoryAttendee[]): HistoryCounts {
+  const counts: HistoryCounts = {
+    attendees: attendees.length,
+    interested: 0,
+    joined: 0,
+    here: 0,
+    done: 0,
+    interestedHeads: 0,
+    joinedHeads: 0,
+    hereHeads: 0,
+    doneHeads: 0,
+    extras: 0,
+    remote: 0,
+    departed: 0,
+  };
+  for (const attendee of attendees) {
+    counts[attendee.furthest] += 1;
+    counts[`${attendee.furthest}Heads`] += 1 + attendee.extras;
+    counts.extras += attendee.extras;
+    if (attendee.remote) counts.remote += 1;
+    if (attendee.status === null) counts.departed += 1;
+  }
+  return counts;
+}
+
+/**
+ * What happened to an active party that its model does not keep: a member's status (`value`,
+ * a `PartyStatus`), a member who left, where a train is (`subject` its place, `value` the gym,
+ * null at the end of the route or without one), a group's meeting time (`subject` the group),
+ * and the party it goes on from (`from`: `subject` the id of a raid that moved and became this
+ * party; the record of this party takes that party's steps and its row with it).
+ */
+export interface HistoryStep {
+  partyId: string;
+  at: number;
+  kind: 'status' | 'left' | 'stop' | 'meet' | 'from';
+  subject: string;
+  value: number | null;
+}
+
+/** The steps from one stored form of a party to the next (`before` undefined: a new party). */
+export function partySteps(before: Party | undefined, after: Party, at: number): HistoryStep[] {
+  const steps: HistoryStep[] = [];
+  const step = (kind: HistoryStep['kind'], subject: string, value: number | null) => {
+    steps.push({ partyId: after.id, at, kind, subject, value });
+  };
+  for (const [memberId, attendee] of Object.entries(after.attendees)) {
+    const was = before === undefined ? undefined : attendeeOf(before, memberId);
+    if (was?.status !== attendee.status) step('status', memberId, attendee.status);
+  }
+  for (const memberId of Object.keys(before?.attendees ?? {})) {
+    if (attendeeOf(after, memberId) === undefined) step('left', memberId, null);
+  }
+  for (const group of after.groups) {
+    if (group.startTime === undefined) continue;
+    const was = before?.groups.find((other) => other.id === group.id)?.startTime;
+    if (was !== group.startTime) step('meet', group.id, group.startTime);
+  }
+  if (isTrain(after)) {
+    const place = placeOf(after);
+    const was = before !== undefined && isTrain(before) ? placeOf(before) : 'none';
+    if (place !== was) step('stop', place, currentStop(after) ?? null);
+  }
+  return steps;
+}
+
+/** Everybody the record of a party can name, for the look-up of their opt-ins. */
+export function historyMembers(party: Party, steps: readonly HistoryStep[]): string[] {
+  const members = new Set<string>();
+  for (const step of steps) {
+    if (step.kind === 'status' || step.kind === 'left') members.add(step.subject);
+  }
+  for (const memberId of Object.keys(party.attendees)) members.add(memberId);
+  members.add(party.createdById);
+  if (isTrain(party) && party.train.conductorId !== null) members.add(party.train.conductorId);
+  return [...members];
+}
+
+/** How far each status gets, in the order of `HISTORY_STATUSES`. A pending answer is here. */
+function reach(status: number): number {
+  switch (status) {
+    case PartyStatus.Interested:
+      return 0;
+    case PartyStatus.Coming:
+      return 1;
+    case PartyStatus.Present:
+    case PartyStatus.CompletePending:
+      return 2;
+    case PartyStatus.Complete:
+      return 3;
+    default:
+      return 0;
+  }
+}
+
+function word(level: number): HistoryStatus {
+  return HISTORY_STATUSES[level] ?? 'interested';
+}
+
+function attendeeRecord(
+  memberId: string,
+  steps: readonly HistoryStep[],
+  final: Attendee | undefined,
+  optedIn: ReadonlySet<string>,
+): HistoryAttendee {
+  const own = steps.filter(
+    (step) => step.subject === memberId && (step.kind === 'status' || step.kind === 'left'),
+  );
+  const firstAt = (level: number): number | null =>
+    own.find((step) => step.kind === 'status' && reach(step.value ?? 0) >= level)?.at ?? null;
+  const levels = own.filter((step) => step.kind === 'status').map((step) => reach(step.value ?? 0));
+  if (final) levels.push(reach(final.status));
+  const furthest = Math.max(0, ...levels);
+  return {
+    memberId: optedIn.has(memberId) ? memberId : null,
+    status: final ? word(reach(final.status)) : null,
+    furthest: word(furthest),
+    groupId: final?.group ?? null,
+    extras: final ? Math.max(0, final.number - 1) : 0,
+    remote: final?.remote ?? false,
+    team: final?.team ?? null,
+    signedUpAt: own.find((step) => step.kind === 'status')?.at ?? null,
+    joinedAt: firstAt(1),
+    hereAt: firstAt(2),
+    doneAt: firstAt(3),
+    leftAt: final ? null : (own.findLast((step) => step.kind === 'left')?.at ?? null),
+  };
+}
+
+/**
+ * The stops a train made as far as its route and current stop say, without times: the whole
+ * route once finished; up to the current stop once it started (moved on, or its start time had
+ * come by `at`); none before. For a train of which no step was seen, live or legacy alike.
+ */
+export function stopsByRoute(
+  route: readonly number[],
+  stop: number,
+  startTime: number | null,
+  at: number,
+): number[] {
+  if (route.length > 0 && stop >= route.length) return [...route];
+  const started = stop > 0 || (startTime !== null && startTime <= at);
+  return started ? route.slice(0, stop + 1) : [];
+}
+
+/** The stops a train made, from the steps of its place; from its route where there are none. */
+function trainStops(party: Party, steps: readonly HistoryStep[]): HistoryStop[] {
+  if (!isTrain(party)) return [];
+  const places = steps.filter((step) => step.kind === 'stop');
+  if (places.length === 0) {
+    const { route, stop } = party.train;
+    return stopsByRoute(route, stop, party.timed.startTime, party.updatedAt).map((gymId) => ({
+      gymId,
+      legacyGymId: null,
+      arrivedAt: null,
+      leftAt: null,
+    }));
+  }
+  const stops: HistoryStop[] = [];
+  for (const place of places) {
+    const last = stops.at(-1);
+    if (last && last.leftAt === null) {
+      if (place.value === last.gymId) continue;
+      last.leftAt = place.at;
+    }
+    if (place.value !== null) {
+      stops.push({ gymId: place.value, legacyGymId: null, arrivedAt: place.at, leftAt: null });
+    }
+  }
+  // A first stop laid before the start was reached at the start.
+  const first = stops[0];
+  const start = party.timed.startTime;
+  if (
+    first?.arrivedAt != null &&
+    start !== null &&
+    start > first.arrivedAt &&
+    (first.leftAt === null || start <= first.leftAt)
+  ) {
+    first.arrivedAt = start;
+  }
+  return stops;
+}
+
+/**
+ * How a party ended: completed whenever it took place (somebody completed the raid, or was at
+ * the train or meetup), however it was closed; otherwise as whoever closed it says.
+ */
+function endingOf(
+  party: Party,
+  end: PartyEnd | undefined,
+  attendees: readonly HistoryAttendee[],
+): PartyEnding {
+  const took = isRaid(party)
+    ? attendees.some((attendee) => attendee.furthest === 'done')
+    : attendees.some((attendee) => attendee.furthest === 'here' || attendee.furthest === 'done');
+  if (took) return 'completed';
+  if (end === undefined) return 'unknown';
+  return end.how === 'clock' ? 'expired' : 'cancelled';
+}
+
+export interface HistoryInput {
+  /** How it ended; undefined when whoever ended it did not say. */
+  end: { how: 'clock' } | { how: 'cancelled' } | undefined;
+  /** Its steps, oldest first. */
+  steps: readonly HistoryStep[];
+  /** The members who opted in to be named in the history of its server. */
+  optedIn: ReadonlySet<string>;
+  describeBoss: (ref: RaidBossRef) => HistoryBoss;
+  /** Whether its boss could be shiny, when that is known. */
+  shiny: boolean | null;
+}
+
+/** The record of a live party before the storage adds its server (`serverId`), which it reads. */
+export type LiveRecord = Omit<HistoryRecord, 'serverId'>;
+
+/**
+ * The record of a live party that ended (`party` as it was stored at its end, `updatedAt` the
+ * moment it ended). Attendees in the order they first signed up, then those the steps never saw.
+ */
+export function historyOfParty(party: Party, input: HistoryInput): LiveRecord {
+  const { steps, optedIn } = input;
+  const order: string[] = [];
+  for (const step of steps) {
+    if (step.kind === 'status' && !order.includes(step.subject)) order.push(step.subject);
+  }
+  for (const memberId of Object.keys(party.attendees)) {
+    if (!order.includes(memberId)) order.push(memberId);
+  }
+  const attendees = order.map((memberId) =>
+    attendeeRecord(memberId, steps, attendeeOf(party, memberId), optedIn),
+  );
+  const groups = party.groups.map((group): HistoryGroup => {
+    const members = attendees.filter((a) => a.status !== null && a.groupId === group.id);
+    const meetings = steps.filter((step) => step.kind === 'meet' && step.subject === group.id);
+    return {
+      groupId: group.id,
+      label: group.label ?? null,
+      meetingTime: group.startTime ?? meetings.at(-1)?.value ?? null,
+      members: members.length,
+      heads: members.reduce((sum, a) => sum + 1 + a.extras, 0),
+    };
+  });
+  const named = (id: string | null): string | null => (id !== null && optedIn.has(id) ? id : null);
+  const raid = isRaid(party) ? party.raid : undefined;
+  const level = raid?.tier.level;
+  const boss = isRaid(party) ? party.raid.boss : isTrain(party) ? party.train.boss : null;
+  return {
+    source: 'live',
+    partyId: party.id,
+    legacyKey: null,
+    kind: party.type,
+    regionId: party.regionId,
+    gymId: party.gymId,
+    legacyGymId: null,
+    name: isTimed(party) ? party.timed.name : null,
+    description: party.type === 'meetup' ? party.meetup.description : null,
+    tier: level ?? null,
+    shadow: raid?.tier.shadow ?? false,
+    mega: level === 'Mega' || level === 'MegaLegendary' || level === 'SuperMega',
+    elite: level === 'Elite',
+    ex: false,
+    shiny: input.shiny,
+    boss: boss === null ? null : input.describeBoss(boss),
+    fastMove: raid?.fastMove ?? null,
+    chargedMove: raid?.chargedMove ?? null,
+    createdAt: party.createdAt,
+    hatchTime: party.hatchTime,
+    startTime: isTimed(party) ? party.timed.startTime : null,
+    endTime: party.endTime,
+    endedAt: party.updatedAt,
+    ending: endingOf(party, input.end, attendees),
+    createdById: named(party.createdById),
+    conductorId: isTrain(party) ? named(party.train.conductorId) : null,
+    anonymous: party.anonymous,
+    routeStops: isTrain(party) ? party.train.route.length : null,
+    attendees,
+    groups,
+    stops: trainStops(party, steps),
+  };
+}
+
+/**
+ * What a write of a party adds to the history (`PartyStore` asks `noteOf` for each write and
+ * the storage writes it with the party): its steps, and when the write ended the party, what
+ * becomes of it:
+ * - `record`: its record (`build`, given its steps and those of the parties it went on from, and
+ *   the members of `members` who opted in), written once; then its row and theirs are deleted
+ *   (their posts kept in `EndedPartyPost`), so that no member id stays behind.
+ * - `move`: it goes on as the party `to`, whose record will take its steps and its row; a `from`
+ *   step under `to` says so (written again here, in case the new party's own did not make it).
+ * - `drop`: it never was a party (no post): its steps and its row go, nothing is recorded.
+ */
+export interface HistoryNote {
+  partyId: string;
+  /** Row id of the server (`Party.guildId`); the storage reads its snowflake. */
+  guildId: number;
+  steps: readonly HistoryStep[];
+  end?: HistoryNoteEnd;
+}
+
+export type HistoryNoteEnd =
+  | {
+      kind: 'record';
+      members: (steps: readonly HistoryStep[]) => string[];
+      build: (steps: readonly HistoryStep[], optedIn: ReadonlySet<string>) => LiveRecord;
+    }
+  | { kind: 'move'; to: string }
+  | { kind: 'drop' };
+
+/**
+ * A write of a party, as the store makes it: as it was (undefined: new), as it is, why it ended,
+ * and for a new party the raid it goes on from (`movedFrom`: a move to another region).
+ */
+export interface PartyWrite {
+  before: Party | undefined;
+  after: Party;
+  ended?: PartyEnd;
+  movedFrom?: string;
+}
diff --git a/src/services/party-history.test.ts b/src/services/party-history.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9b5cf8b906857d82b01118b4496b4690c6bd1bc4
--- /dev/null
+++ b/src/services/party-history.test.ts
@@ -0,0 +1,345 @@
+import { describe, expect, it } from 'vitest';
+import { ALICE, at, BOB, MINUTE, REPORTER, testRaid } from '../../test/support/parties.js';
+import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { endParty } from '../domain/party/party.js';
+import { HISTORY_SERVER } from '../../test/support/history.js';
+import { REGION_STAFF, regionAdminWith } from '../../test/support/region-admin.js';
+import { gymsFixture } from '../../test/support/providers.js';
+import {
+  createdMeetup,
+  createdTrain,
+  partyServiceWith,
+  reportedRaid,
+} from '../../test/support/party-service.js';
+import { watchEachTest } from '../../test/support/timers.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { Member } from './attendance-service.js';
+
+const alice: Member = { id: ALICE, name: 'Alice' };
+const bob: Member = { id: BOB, name: 'Bob' };
+const HATCH = at('2026-10-13T14:30');
+const END = at('2026-10-13T15:15');
+
+watchEachTest();
+
+type Made = Awaited<ReturnType<typeof reportedRaid>>;
+
+/** Runs the clock at a time and lets everything it started go out. */
+async function tickAt(
+  made: Pick<Made, 'clock' | 'scheduler' | 'attendance' | 'service'>,
+  time: number,
+) {
+  made.clock.now = time;
+  await made.scheduler.tick();
+  await made.scheduler.whenIdle();
+  await made.attendance.flush();
+  await made.service.flush();
+}
+
+/** Lets the clock end the party from `after` on: the warning first, then its end (some ticks). */
+async function endedByClock(
+  made: Pick<Made, 'clock' | 'scheduler' | 'attendance' | 'service' | 'store'> & {
+    party: { id: string };
+  },
+  after: number,
+) {
+  for (let n = 0; n < 10 && made.store.get(made.party.id); n++) {
+    await tickAt(made, after + n * 30 * MINUTE);
+  }
+}
+
+describe('the party history of live parties', () => {
+  it('records a raid the clock ended, naming only who opted in', async () => {
+    const made = await reportedRaid({ boss: { key: 'yveltal' }, time: { hatch: HATCH } });
+    made.history.optIn(1, ALICE);
+    made.clock.now = HATCH + MINUTE;
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 2 });
+    made.clock.now = HATCH + 5 * MINUTE;
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
+    await made.attendance.signUp(made.party.id, bob, PartyStatus.Interested);
+    made.clock.now = HATCH + 20 * MINUTE;
+    await made.attendance.done(made.party.id, alice);
+    await endedByClock(made, END + 6 * MINUTE);
+    expect(made.store.get(made.party.id)).toBeUndefined();
+
+    expect(made.history.records).toHaveLength(1);
+    const [record] = made.history.records;
+    expect(record).toMatchObject({
+      source: 'live',
+      partyId: made.party.id,
+      kind: 'raid',
+      serverId: HISTORY_SERVER,
+      gymId: 1,
+      tier: 'T5',
+      boss: { key: 'yveltal', dex: 717, species: 'YVELTAL', form: null },
+      hatchTime: HATCH,
+      endTime: END,
+      ending: 'completed',
+      createdById: null,
+    });
+    expect(record?.attendees).toEqual([
+      expect.objectContaining({
+        memberId: null,
+        status: 'interested',
+        signedUpAt: made.party.createdAt,
+      }),
+      expect.objectContaining({
+        memberId: ALICE,
+        status: 'done',
+        extras: 1,
+        joinedAt: HATCH + MINUTE,
+        hereAt: HATCH + 5 * MINUTE,
+        doneAt: HATCH + 20 * MINUTE,
+      }),
+      expect.objectContaining({ memberId: null, status: 'interested' }),
+    ]);
+    // Nothing of the party is left to become history twice.
+    expect(made.history.steps).toEqual([]);
+  });
+
+  it('names the member who reported it once they opted in, and nobody before', async () => {
+    const made = await reportedRaid({ time: { hatch: HATCH } });
+    made.history.optIn(1, REPORTER);
+    await endedByClock(made, END + 6 * MINUTE);
+    expect(made.history.records[0]).toMatchObject({
+      createdById: REPORTER,
+      ending: 'expired',
+      attendees: [expect.objectContaining({ memberId: REPORTER })],
+    });
+  });
+
+  it('records a party that somebody closed as cancelled', async () => {
+    const made = await reportedRaid();
+    expect(await made.service.end(made.party.id)).toBe(true);
+    expect(made.history.records.map((record) => record.ending)).toEqual(['cancelled']);
+  });
+
+  it('records a party whose post somebody deleted as cancelled', async () => {
+    const made = await reportedRaid();
+    made.gateway.gone.add(made.postId);
+    // The next render finds it gone.
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
+    await made.service.flush();
+    expect(made.store.get(made.party.id)).toBeUndefined();
+    expect(made.history.records.map((record) => record.ending)).toEqual(['cancelled']);
+  });
+
+  it('records nothing of a raid that never got its post', async () => {
+    const made = await reportedRaid();
+    made.gateway.failing.set('createPost', new Error('no post today'));
+    const gym = gymsFixture().get(2);
+    if (!gym) throw new Error('no gym 2');
+    await expect(
+      made.service.reportRaid({
+        gym,
+        reporterId: ALICE,
+        anonymous: false,
+        autoStatus: PartyStatus.Interested,
+        tier: { level: 'T3', shadow: false },
+        boss: null,
+      }),
+    ).rejects.toThrow('no post today');
+    expect(made.history.records).toEqual([]);
+    expect(made.history.steps.filter((step) => step.subject === ALICE)).toEqual([]);
+  });
+
+  it('records a raid that moved to another region once, as the party it went on as', async () => {
+    const made = await reportedRaid({ boss: { key: 'yveltal' } });
+    made.clock.now += MINUTE;
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
+    const cafe = gymsFixture().get(8);
+    const east = made.regions.byId(2);
+    if (!cafe || !east) throw new Error('no café in East');
+    made.clock.now += MINUTE;
+    const outcome = await made.service.relocate(made.party.id, cafe, east);
+    if (outcome.kind !== 'moved') throw new Error(`not moved: ${outcome.kind}`);
+    await made.service.flush();
+    expect(made.history.records).toEqual([]);
+
+    expect(await made.service.end(outcome.party.id)).toBe(true);
+    expect(made.history.records).toHaveLength(1);
+    expect(made.history.records[0]).toMatchObject({
+      partyId: outcome.party.id,
+      gymId: 8,
+      regionId: 2,
+      createdAt: made.party.createdAt,
+    });
+    // Who signed up before the move did so when they did.
+    expect(made.history.records[0]?.attendees[1]).toMatchObject({
+      status: 'joined',
+      joinedAt: made.party.createdAt + MINUTE,
+    });
+  });
+
+  it('records a train with the stops it made', async () => {
+    const made = await createdTrain({ route: [1, 2, 3] });
+    made.history.optIn(1, REPORTER);
+    await made.attendance.signUp(
+      made.party.id,
+      { id: REPORTER, name: 'Reporter' },
+      PartyStatus.Present,
+    );
+    const start = made.clock.now;
+    made.clock.now = start + 10 * MINUTE;
+    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
+    made.clock.now = start + 20 * MINUTE;
+    await made.trains.move(made.party.id, { id: REPORTER }, 'finish', false);
+    expect(await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } })).toBe(
+      true,
+    );
+    const [record] = made.history.records;
+    expect(record).toMatchObject({
+      kind: 'train',
+      name: 'Saturday legendaries',
+      ending: 'completed',
+      routeStops: 3,
+      createdById: REPORTER,
+    });
+    expect(record?.stops).toEqual([
+      { gymId: 1, legacyGymId: null, arrivedAt: start, leftAt: start + 10 * MINUTE },
+      {
+        gymId: 2,
+        legacyGymId: null,
+        arrivedAt: start + 10 * MINUTE,
+        leftAt: start + 20 * MINUTE,
+      },
+    ]);
+  });
+
+  it('records a meetup the clock ended', async () => {
+    const made = await createdMeetup();
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
+    await endedByClock(made, made.party.createdAt + 25 * 60 * MINUTE);
+    expect(made.history.records).toEqual([
+      expect.objectContaining({
+        kind: 'meetup',
+        name: 'Community Day picnic',
+        ending: 'completed',
+      }),
+    ]);
+  });
+
+  it('ends the party when its record cannot be written, and writes it once later', async () => {
+    const made = await reportedRaid();
+    made.history.failing = new Error('the history is down');
+    expect(await made.service.end(made.party.id)).toBe(true);
+    expect(made.store.get(made.party.id)).toBeUndefined();
+    expect(made.history.records).toEqual([]);
+    expect(made.entries).toContainEqual(
+      expect.objectContaining({ msg: 'could not write the party history; trying again later' }),
+    );
+    made.history.failing = undefined;
+    await made.recorder.flush();
+    await made.recorder.flush();
+    expect(made.history.records.map((record) => record.partyId)).toEqual([made.party.id]);
+  });
+
+  it('records at start a party that ended without its record, and leaves active ones alone', async () => {
+    const made = await reportedRaid();
+    const other = await made.service.createMeetup({
+      name: 'Still on',
+      creatorId: ALICE,
+      regionChannelId: WEST_CHANNEL,
+    });
+    if (other.kind !== 'created') throw new Error('no meetup');
+    made.history.failing = new Error('the history is down');
+    await made.service.end(made.party.id);
+    for (let n = 0; n < 5; n++) await made.recorder.flush();
+    made.history.failing = undefined;
+    expect(made.history.records).toEqual([]);
+
+    // As after a restart: what is left of it is found and recorded, its steps dropped.
+    expect(await made.recorder.sweep((id) => Promise.resolve(made.storage.rows.get(id)))).toBe(1);
+    expect(made.history.records).toEqual([
+      expect.objectContaining({ partyId: made.party.id, ending: 'unknown' }),
+    ]);
+    expect(made.history.steps.map((step) => step.partyId)).toEqual([other.party.id]);
+    expect(await made.recorder.sweep((id) => Promise.resolve(made.storage.rows.get(id)))).toBe(0);
+  });
+
+  it('drops at start the steps of a party that is gone, and logs a sweep that fails', async () => {
+    const made = await reportedRaid();
+    made.history.failing = new Error('the history is down');
+    await made.service.end(made.party.id);
+    made.history.failing = undefined;
+    expect(await made.recorder.sweep(() => Promise.resolve(undefined))).toBe(0);
+    expect(made.history.steps).toEqual([]);
+    expect(made.history.records).toEqual([]);
+
+    made.history.failing = new Error('still down');
+    expect(await made.recorder.sweep(() => Promise.resolve(undefined))).toBe(0);
+    expect(made.entries).toContainEqual(
+      expect.objectContaining({ msg: 'could not look for parties left without their history' }),
+    );
+  });
+
+  it('deletes the row of a party once it is recorded, and keeps its post for the archiving', async () => {
+    const made = await reportedRaid();
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
+    expect(await made.service.end(made.party.id)).toBe(true);
+    expect(made.storage.rows.has(made.party.id)).toBe(false);
+    expect(made.history.steps).toEqual([]);
+    // A reopened post is still archived by the hourly sweep.
+    expect(await made.store.endedPosts([made.postId])).toEqual([made.postId]);
+  });
+
+  it('records a raid closed by somebody after it took place as completed', async () => {
+    const made = await reportedRaid({ boss: { key: 'yveltal' }, time: { hatch: HATCH } });
+    made.clock.now = HATCH + 5 * MINUTE;
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
+    await made.attendance.done(made.party.id, alice);
+    await made.service.end(made.party.id);
+    expect(made.history.records.map((record) => record.ending)).toEqual(['completed']);
+  });
+
+  it('records the parties of a region that is removed as cancelled', async () => {
+    const made = await regionAdminWith();
+    const gym = gymsFixture().get(1);
+    if (!gym) throw new Error('no gym 1');
+    const reported = await made.service.reportRaid({
+      gym,
+      reporterId: REPORTER,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: { level: 'T5', shadow: false },
+      boss: null,
+    });
+    if (reported.kind !== 'created') throw new Error('no raid');
+    await made.service.flush();
+    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
+    expect(outcome).toMatchObject({ kind: 'removed', ended: 1 });
+    expect(made.history.records).toEqual([
+      expect.objectContaining({ partyId: reported.party.id, ending: 'cancelled' }),
+    ]);
+  });
+
+  it('records at start a party that ended without any step, and drops one without a post', async () => {
+    // Rows of parties that ended before the history was kept: no step, no record.
+    const posted = {
+      ...endParty(testRaid()),
+      forumChannelId: WEST_FORUM,
+      forumPostId: '900000000000000001',
+    };
+    const unposted = endParty({ ...testRaid(), id: '00000000-0000-4000-8000-000000000008' });
+    const made = await partyServiceWith([posted, unposted]);
+    const read = (id: string) => Promise.resolve(made.storage.rows.get(id));
+    expect(await made.recorder.sweep(read)).toBe(1);
+    expect(made.history.records).toEqual([
+      expect.objectContaining({ partyId: posted.id, ending: 'unknown' }),
+    ]);
+    expect(made.storage.rows.size).toBe(0);
+    expect(await made.store.endedPosts(['900000000000000001'])).toEqual(['900000000000000001']);
+    expect(await made.recorder.sweep(read)).toBe(0);
+  });
+
+  it('gives up on a record after its last try, and says so', async () => {
+    const made = await reportedRaid();
+    made.history.failing = new Error('the history is down');
+    await made.service.end(made.party.id);
+    for (let n = 0; n < 5; n++) await made.recorder.flush();
+    expect(made.history.records).toEqual([]);
+    expect(made.entries).toContainEqual(
+      expect.objectContaining({ msg: 'gave up writing the party history of a party' }),
+    );
+  });
+});
diff --git a/src/services/party-history.ts b/src/services/party-history.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7e743992dc21796f13e59d0a485c095068667548
--- /dev/null
+++ b/src/services/party-history.ts
@@ -0,0 +1,205 @@
+import type { HistoryStorage, UnrecordedParty } from '../db/repositories/history-repository.js';
+import {
+  historyMembers,
+  historyOfParty,
+  partySteps,
+  type HistoryBoss,
+  type HistoryNote,
+  type HistoryNoteEnd,
+  type PartyEnd,
+  type PartyWrite,
+} from '../domain/history/party-history.js';
+import { isRaid, type Party, type RaidBossRef } from '../domain/party/party.js';
+import type { Logger } from '../log.js';
+import type { GameDataProvider } from './game-data-service.js';
+import type { RaidBossProvider } from './raid-boss-service.js';
+
+/** How long the tries of a note that failed wait, one after the other: then it is given up. */
+export const HISTORY_RETRY_DELAYS_MS: readonly number[] = [60_000, 10 * 60_000, 60 * 60_000];
+
+export interface PartyHistoryOptions {
+  /** Where a note that could not be written with its party is written later. */
+  storage: HistoryStorage;
+  gameData: GameDataProvider;
+  raidBosses: RaidBossProvider;
+  log: Logger;
+  retryDelaysMs?: readonly number[];
+  setTimer?: (run: () => void, ms: number) => () => void;
+}
+
+/**
+ * The party history of live parties (plan 8H, docs/architecture/history.md). The store asks it
+ * for what each write of a party adds (`noteOf`): the steps the party's model does not keep (who
+ * reached which status when, who left, where a train was, a group's meeting time), and when the
+ * write ended the party, its record, which the storage writes in the same transaction. A note
+ * the storage could not write is tried again later (`failed`), a few times, then given up and
+ * logged; it never keeps a party from ending. Members are named only with their opt-in, as it is
+ * when the record is written.
+ */
+export class PartyHistory {
+  private readonly setTimer: (run: () => void, ms: number) => () => void;
+  private readonly delays: readonly number[];
+  /** The tries that wait, with what cancels their timer. */
+  private readonly waiting = new Map<
+    () => Promise<void>,
+    { cancel: () => void; note: HistoryNote }
+  >();
+
+  constructor(private readonly options: PartyHistoryOptions) {
+    this.delays = options.retryDelaysMs ?? HISTORY_RETRY_DELAYS_MS;
+    this.setTimer =
+      options.setTimer ??
+      ((run, ms) => {
+        const timer = setTimeout(run, ms);
+        timer.unref();
+        return () => {
+          clearTimeout(timer);
+        };
+      });
+  }
+
+  noteOf(write: PartyWrite): HistoryNote | undefined {
+    const { before, after, movedFrom } = write;
+    const steps = partySteps(before, after, after.updatedAt);
+    // A raid that moved goes on as this party: its record takes the old one along.
+    if (movedFrom !== undefined) {
+      steps.push({
+        partyId: after.id,
+        at: after.updatedAt,
+        kind: 'from',
+        subject: movedFrom,
+        value: null,
+      });
+    }
+    const ends = after.status === 'ended' && before?.status !== 'ended';
+    const end = ends ? this.endOf(after, write.ended) : undefined;
+    if (steps.length === 0 && end === undefined) return undefined;
+    return { partyId: after.id, guildId: after.guildId, steps, ...(end ? { end } : {}) };
+  }
+
+  private endOf(party: Party, ended: PartyEnd | undefined): HistoryNoteEnd {
+    if (ended?.how === 'moved') return { kind: 'move', to: ended.to };
+    if (ended?.how === 'failed') return { kind: 'drop' };
+    // Decided now, from the boss list as it is when the party ends.
+    const shiny = this.shinyOf(party);
+    return {
+      kind: 'record',
+      members: (steps) => historyMembers(party, steps),
+      build: (steps, optedIn) =>
+        historyOfParty(party, {
+          end: ended,
+          steps,
+          optedIn,
+          describeBoss: (ref) => this.describeBoss(ref),
+          shiny,
+        }),
+    };
+  }
+
+  /** A boss by the catalogue's ids; one it does not know (any more) by its name or key. */
+  private describeBoss(ref: RaidBossRef): HistoryBoss {
+    if ('name' in ref) return { name: ref.name };
+    const entry = this.options.gameData.catalogue.byKey(ref.key);
+    if (!entry) return { name: ref.key };
+    const form =
+      entry.form ?? (entry.tempEvolution ? `${entry.pokemonId}_${entry.tempEvolution}` : null);
+    return { key: entry.key, dex: entry.dex, species: entry.pokemonId, form };
+  }
+
+  /** Whether the boss list says a raid's boss can be shiny; null where it does not know. */
+  private shinyOf(party: Party): boolean | null {
+    if (!isRaid(party) || party.raid.boss === null || !('key' in party.raid.boss)) return null;
+    const { key } = party.raid.boss;
+    const boss = this.options.raidBosses.bossesOf(party.raid.tier).find((b) => b.key === key);
+    return boss?.shiny ?? null;
+  }
+
+  /**
+   * A note could not be written with its party (the storage says so once the party's write has
+   * committed): it is tried again later, alone.
+   */
+  failed(note: HistoryNote, err: unknown): void {
+    this.options.log.warn(
+      { err, party: note.partyId },
+      'could not write the party history; trying again later',
+    );
+    this.later(note, 0);
+  }
+
+  private later(note: HistoryNote, attempt: number): void {
+    const delay = this.delays[attempt];
+    if (delay === undefined) {
+      this.options.log.error(
+        { party: note.partyId, steps: note.steps.length, ends: note.end?.kind },
+        'gave up writing the party history of a party',
+      );
+      return;
+    }
+    const run = async (): Promise<void> => {
+      this.waiting.delete(run);
+      try {
+        await this.options.storage.write(note, { retry: true });
+      } catch (err) {
+        this.options.log.warn({ err, party: note.partyId }, 'could not write the party history');
+        this.later(note, attempt + 1);
+      }
+    };
+    this.waiting.set(run, { cancel: this.setTimer(() => void run(), delay), note });
+  }
+
+  /** Runs the tries that wait now, and waits for them (for tests). */
+  async flush(): Promise<void> {
+    const runs = [...this.waiting];
+    for (const [, { cancel }] of runs) cancel();
+    await Promise.all(runs.map(([run]) => run()));
+  }
+
+  /**
+   * At start, once the parties and the game data are loaded: every party that ended and still
+   * has its row (its record failed every try, the bot stopped before them, or it ended before the
+   * history existed, with or without steps) is recorded now from that row, as ended for a reason
+   * not known, and its row and steps go. A raid that moved is left to the party it goes on as;
+   * a party without a post (it never was one) and one whose row cannot be read are dropped.
+   * Active parties are left alone. Answers how many were recorded; never rejects.
+   */
+  async sweep(read: (partyId: string) => Promise<Party | undefined>): Promise<number> {
+    const { storage, log } = this.options;
+    let parties: UnrecordedParty[];
+    try {
+      parties = await storage.unrecorded();
+    } catch (err) {
+      log.error({ err }, 'could not look for parties left without their history');
+      return 0;
+    }
+    let recorded = 0;
+    for (const { partyId, movedTo } of parties) {
+      if (movedTo !== null) continue;
+      try {
+        const party = await read(partyId);
+        const note: HistoryNote =
+          party && party.forumPostId !== null
+            ? { partyId, guildId: party.guildId, steps: [], end: this.endOf(party, undefined) }
+            : { partyId, guildId: party?.guildId ?? 0, steps: [], end: { kind: 'drop' } };
+        await storage.write(note, { retry: true });
+        if (note.end?.kind === 'record') recorded += 1;
+      } catch (err) {
+        log.warn({ err, party: partyId }, 'could not record a party left without its history');
+      }
+    }
+    if (recorded > 0)
+      log.info({ parties: recorded }, 'recorded parties left without their history');
+    return recorded;
+  }
+
+  /** Cancels the tries that wait (at shutdown: what was not written is lost, as logged). */
+  close(): void {
+    for (const { cancel, note } of this.waiting.values()) {
+      cancel();
+      this.options.log.warn(
+        { party: note.partyId },
+        'a write of the party history was given up at shutdown',
+      );
+    }
+    this.waiting.clear();
+  }
+}
diff --git a/src/services/party-lifecycle.db.test.ts b/src/services/party-lifecycle.db.test.ts
index 040f9bb7991b7f40525e20a2b8e4cefd7f6e38fc..3bb01ae2b02f50ad20e00925e82716c667b0be41 100644
--- a/src/services/party-lifecycle.db.test.ts
+++ b/src/services/party-lifecycle.db.test.ts
@@ -10,7 +10,9 @@ import {
 } from '../../test/support/party-service.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import { AccessGrantRepository } from '../db/repositories/access-grant-repository.js';
+import { HistoryRepository } from '../db/repositories/history-repository.js';
 import { PartyRepository } from '../db/repositories/party-repository.js';
+import { HISTORY_MUST_NOT_FAIL } from '../../test/support/history.js';
 import type { DB } from '../db/types.js';
 import { attendeeOf } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
@@ -52,11 +54,15 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
   });
 
   it('hatches, asks, catches up after the restart, warns and archives', async () => {
-    const repository = new PartyRepository(db);
+    const repository = new PartyRepository(db, HISTORY_MUST_NOT_FAIL);
     const first = await partyServiceWith(
       [],
       {},
-      { database: repository, gateway: gatewayWithMirrorChannels() },
+      {
+        database: repository,
+        historyStorage: new HistoryRepository(db),
+        gateway: gatewayWithMirrorChannels(),
+      },
     );
     const gym = gymsFixture().get(1);
     if (!gym) throw new Error('no gym');
@@ -144,8 +150,16 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
     const deleted = second.gateway.deleted.map((gone) => gone.messageId);
     for (const copy of copies) expect(deleted).toContain(copy.messageId);
     expect(second.gateway.posts.get(postId)?.reopened).toBe(0);
-    const row = await repository.findById(id);
-    expect(row).toMatchObject({ ok: true, party: { status: 'ended', forumPostId: postId } });
+    // Recorded in the history; its row (with its members' ids) deleted, its post kept.
+    expect(await repository.findById(id)).toBeUndefined();
+    expect(
+      await db
+        .selectFrom('PartyHistory')
+        .select(['partyId', 'ending'])
+        .where('partyId', '=', id)
+        .execute(),
+    ).toEqual([{ partyId: id, ending: 'completed' }]);
+    expect(await repository.endedPosts([postId])).toEqual([postId]);
 
     // Nothing is left for a third start to do.
     const third = await restarted(second);
@@ -153,9 +167,13 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
   });
 
   it('lets a member of another region in, moves the raid to another region, and tidies up after a restart', async () => {
-    const repository = new PartyRepository(db);
+    const repository = new PartyRepository(db, HISTORY_MUST_NOT_FAIL);
     const grants = new AccessGrantRepository(db);
-    const first = await partyServiceWith([], {}, { database: repository, grants });
+    const first = await partyServiceWith(
+      [],
+      {},
+      { database: repository, historyStorage: new HistoryRepository(db), grants },
+    );
     first.gateway.shutOut(WEST_FORUM, ALICE);
     first.gateway.shutOut(EAST_FORUM, ALICE, BOB);
     const gym = gymsFixture().get(1);
@@ -235,8 +253,12 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
   });
 
   it('keeps a meetup from /meetup to the archived post, over a restart', async () => {
-    const repository = new PartyRepository(db);
-    const first = await partyServiceWith([], {}, { database: repository });
+    const repository = new PartyRepository(db, HISTORY_MUST_NOT_FAIL);
+    const first = await partyServiceWith(
+      [],
+      {},
+      { database: repository, historyStorage: new HistoryRepository(db) },
+    );
     const outcome = await first.service.createMeetup({
       name: 'Community Day picnic 🧺',
       creatorId: REPORTER,
@@ -297,9 +319,13 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
     await second.scheduler.stop();
     expect(second.store.active()).toEqual([]);
     expect(second.gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true });
-    expect(await repository.findById(id)).toMatchObject({
-      ok: true,
-      party: { status: 'ended', type: 'meetup' },
-    });
+    expect(await repository.findById(id)).toBeUndefined();
+    expect(
+      await db
+        .selectFrom('PartyHistory')
+        .select(['partyId', 'kind'])
+        .where('partyId', '=', id)
+        .execute(),
+    ).toEqual([{ partyId: id, kind: 'meetup' }]);
   });
 });
diff --git a/src/services/party-scheduler.ts b/src/services/party-scheduler.ts
index 46e441bf5db40d4bfc4db7490789743cf4dd004c..151dcc236efea0e8b04114e9e7a911d9379cd20a 100644
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -320,6 +320,7 @@ export class PartyScheduler {
           party.id,
           (current) =>
             !current.saved && current.deletionTime !== null && this.now() >= current.deletionTime,
+          { ended: { how: 'clock' } },
         );
         if (postId !== null) this.sinceWarning.delete(postId);
         return;
diff --git a/src/services/party-service.end.test.ts b/src/services/party-service.end.test.ts
index 144ea50f7bb4921daa1da1c29ecf55b7a5ffeda1..844567ec4fb70668b57c99fe90579a8f017e790a 100644
--- a/src/services/party-service.end.test.ts
+++ b/src/services/party-service.end.test.ts
@@ -25,7 +25,9 @@ describe('PartyService.end', () => {
     expect(await service.end(made.party.id)).toBe(true);
 
     expect(store.get(made.party.id)).toBeUndefined();
-    expect(made.storage.rows.get(made.party.id)?.status).toBe('ended');
+    // Recorded in the history, and its row (with its members' ids) deleted.
+    expect(made.history.records.map((record) => record.partyId)).toEqual([made.party.id]);
+    expect(made.storage.rows.has(made.party.id)).toBe(false);
     const post = gateway.posts.get(postId);
     expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
     expect(buttonsOf(post?.message)).toEqual([]);
diff --git a/src/services/party-service.meetup.test.ts b/src/services/party-service.meetup.test.ts
index 3a7fc566204d39b04de6046486597220f955c8ea..12133160e2863c51049f160f09f0a089221f4449 100644
--- a/src/services/party-service.meetup.test.ts
+++ b/src/services/party-service.meetup.test.ts
@@ -167,7 +167,9 @@ describe('PartyService.createMeetup', () => {
       }),
     ).rejects.toThrow('Discord is down');
     expect(made.store.active()).toEqual([]);
-    expect([...made.storage.rows.values()].map((row) => row.status)).toEqual(['ended']);
+    // It never was a meetup: nothing recorded, its row gone.
+    expect([...made.storage.rows.values()]).toEqual([]);
+    expect(made.history.records).toEqual([]);
     expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
   });
 
@@ -356,7 +358,9 @@ describe('PartyService: ending a meetup', () => {
     expect(await service.end(made.party.id)).toBe(true);
 
     expect(store.get(made.party.id)).toBeUndefined();
-    expect(made.storage.rows.get(made.party.id)?.status).toBe('ended');
+    // Recorded in the history, and its row (with its members' ids) deleted.
+    expect(made.history.records.map((record) => record.partyId)).toEqual([made.party.id]);
+    expect(made.storage.rows.has(made.party.id)).toBe(false);
     const post = gateway.posts.get(postId);
     expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
     expect(buttonsOf(post?.message)).toEqual([]);
diff --git a/src/services/party-service.train.test.ts b/src/services/party-service.train.test.ts
index a5c391502c0628cd6d5f0ed80162c4d4e202e1ad..a942d68a1d5696ddb736f09746d6a12c7d252513 100644
--- a/src/services/party-service.train.test.ts
+++ b/src/services/party-service.train.test.ts
@@ -132,7 +132,9 @@ describe('PartyService.createTrain', () => {
       }),
     ).rejects.toThrow('Discord is down');
     expect(made.store.active()).toEqual([]);
-    expect([...made.storage.rows.values()].map((row) => row.status)).toEqual(['ended']);
+    // It never was a train: nothing recorded, its row gone.
+    expect([...made.storage.rows.values()]).toEqual([]);
+    expect(made.history.records).toEqual([]);
   });
 });
 
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 25ea64801adab2ab2e925c4b844a13da4a048f31..520ca4a917883999c6aff3f7ef9f2737c440e704 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -14,6 +14,7 @@ import {
   type TagIds,
   type V2Message,
 } from '../discord/party-gateway.js';
+import type { PartyEnd } from '../domain/history/party-history.js';
 import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
 import { createMeetup } from '../domain/party/meetup.js';
 import {
@@ -833,7 +834,9 @@ export class PartyService {
     const rendered = renderRaidPost(this.view({ ...raid, forumChannelId: forumId }));
     let stored: Awaited<ReturnType<PartyStore['addRaidUnlessTaken']>>;
     try {
-      stored = await store.addRaidUnlessTaken(raid, this.now(), () => this.gymExists(gym.id));
+      stored = await store.addRaidUnlessTaken(raid, this.now(), () => this.gymExists(gym.id), {
+        movedFrom: partyId,
+      });
     } catch (err) {
       // The region it should move to was removed meanwhile: it has no forum to move into.
       if (err instanceof RegionClosedError) return { kind: 'no-forum' };
@@ -877,12 +880,14 @@ export class PartyService {
 
     // The old party ends inside the store: what it is at that moment is what moves.
     const seen: { last?: RaidParty } = {};
+    // The history keeps the raid once, as the party it goes on as.
+    const movedTo: PartyEnd = { how: 'moved', to: raid.id };
     let ended;
     try {
       ended = await store.update(partyId, (party) => {
         const raid = asKindOf(old, party);
         seen.last = raid;
-        return { party: endParty(raid) };
+        return { party: endParty(raid), ended: movedTo };
       });
     } catch (err) {
       // Both would stay active, one raid in two places: the new one goes again.
@@ -1167,13 +1172,22 @@ export class PartyService {
   /**
    * Ends a party that cannot be shown, so that a raid does not block its gym. Gives the party as
    * it was when it ended; undefined when it could not be ended (it stays active) or was not active.
+   * `how` is why, for the party history: one that never had a post failed; one whose post was
+   * deleted was closed by whoever deleted it.
    */
-  private async abandon(partyId: string, failure: string): Promise<Party | undefined> {
+  private async abandon(
+    partyId: string,
+    failure: string,
+    how: PartyEnd = { how: 'failed' },
+  ): Promise<Party | undefined> {
     const { store, log } = this.options;
     const postId = store.get(partyId)?.forumPostId;
     let ended: Party | undefined;
     try {
-      const result = await store.update(partyId, (party) => ({ party: endParty(party) }));
+      const result = await store.update(partyId, (party) => ({
+        party: endParty(party),
+        ended: how,
+      }));
       if (result?.written) ended = result.party;
     } catch (err) {
       log.error({ err, party: partyId }, failure);
@@ -1279,7 +1293,8 @@ export class PartyService {
    * not the clock (`/delete`). `closing.left` is called once the party has left the store and
    * before anything is done to its post: an answer to an interaction in that post must be given
    * there, not after the archiving. It is waited for three seconds at most (`ANSWER_WAIT_MS`);
-   * what it throws, also later, is logged.
+   * what it throws, also later, is logged. `closing.ended` is why it ends, for the party
+   * history: the scheduler says `clock`; anybody else ends it as a person (`cancelled`).
    *
    * What fails on Discord's side after the party has ended is logged and not tried again here;
    * a post that stayed open is archived by `sweepPosts`.
@@ -1287,10 +1302,11 @@ export class PartyService {
   async end(
     partyId: string,
     onlyIf?: (party: Party) => boolean,
-    closing: { lastWords?: string; left?: () => Promise<unknown> } = {},
+    closing: { lastWords?: string; left?: () => Promise<unknown>; ended?: PartyEnd } = {},
   ): Promise<boolean> {
+    const ended: PartyEnd = closing.ended ?? { how: 'cancelled' };
     const result = await this.options.store.update(partyId, (party) =>
-      onlyIf && !onlyIf(party) ? {} : { party: endParty(party) },
+      onlyIf && !onlyIf(party) ? {} : { party: endParty(party), ended },
     );
     if (!result?.written || !result.party) return false;
     const party = result.party;
@@ -1685,7 +1701,9 @@ export class PartyService {
   private async postGone(party: Party, postId: string): Promise<void> {
     const { gateway, log } = this.options;
     log.warn({ party: party.id, post: postId }, 'a party post is gone; ending the party');
-    const ended = await this.abandon(party.id, 'could not end a party whose post is gone');
+    const ended = await this.abandon(party.id, 'could not end a party whose post is gone', {
+      how: 'cancelled',
+    });
     this.ended(party);
     // Only of a party that has really ended: one that stays active keeps its copies.
     if (ended) {
diff --git a/src/services/party-store.ts b/src/services/party-store.ts
index 809bd7ff84de1db61061656c52781739f0f5bb83..0c786fff524ae43b6582b84cc408fc23406f49ff 100644
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -1,4 +1,5 @@
 import type { PartyForum, PartyStorage } from '../db/repositories/party-repository.js';
+import type { HistoryNote, PartyEnd, PartyWrite } from '../domain/history/party-history.js';
 import { isRaid, type Party, type RaidParty } from '../domain/party/party.js';
 import { blocksNewRaid, raidKindOf } from '../domain/party/raid.js';
 import type { RaidKind } from '../domain/time/party-time.js';
@@ -27,6 +28,11 @@ export interface PartyStoreOptions {
   storage: PartyStorage;
   log: Logger;
   now?: () => number;
+  /**
+   * The party history (`PartyHistory`): asked for what each write adds to it, which the storage
+   * writes with the party. Without it nothing is recorded.
+   */
+  history?: { noteOf(write: PartyWrite): HistoryNote | undefined };
 }
 
 /** Why `add` refused a party: its region is being removed, or is gone (`closeRegion`). */
@@ -149,16 +155,23 @@ export class PartyStore implements PartyProvider {
   /**
    * Stores a new party. Rejects when the row cannot be written (its id or post already exists),
    * and with a `RegionClosedError`, before anything is written, for a party of a region that
-   * is closed (`closeRegion`).
+   * is closed (`closeRegion`). `movedFrom`: the raid it goes on as after a move to another
+   * region, for the party history.
    */
-  async add(party: Party): Promise<Party> {
+  async add(party: Party, options: { movedFrom?: string } = {}): Promise<Party> {
     const parties = this.all;
     const { regionId } = party;
     // Decided now, in the same turn in which it is remembered as under way (below): a region
     // is either closed before this add, which is then refused, or its closing waits for it.
     if (regionId !== null && this.closed.has(regionId)) throw new RegionClosedError(regionId);
     const adding = this.locks.run(party.id, async () => {
-      await this.options.storage.insert(party);
+      const { movedFrom } = options;
+      const note = this.noteOf({
+        before: undefined,
+        after: party,
+        ...(movedFrom === undefined ? {} : { movedFrom }),
+      });
+      await this.options.storage.insert(party, note);
       if (party.status === 'active') parties.set(party.id, party);
       this.announce(undefined, party);
       return party;
@@ -227,8 +240,11 @@ export class PartyStore implements PartyProvider {
    * queued behind the scheduler will meet. Only what can change is written: `guildId`,
    * `createdById` and `createdAt` must not be altered by a change, and one that alters `type`
    * throws: a party is of one kind for good, which `asKindOf` relies on.
+   *
+   * A change that ends the party says why with `ended` (the party history keeps it: the clock,
+   * a person, a move); without it the history says it does not know.
    */
-  async update<R extends { party?: Party }>(
+  async update<R extends { party?: Party; ended?: PartyEnd }>(
     id: string,
     change: (party: Party) => R,
   ): Promise<(R & { written: boolean }) | undefined> {
@@ -244,7 +260,12 @@ export class PartyStore implements PartyProvider {
       if (changed.type !== current.type)
         throw new Error(`A change of ${current.type} ${id} returned a ${changed.type}`);
       const stamped: Party = { ...changed, updatedAt: Math.max(this.now(), current.updatedAt) };
-      if (!(await this.options.storage.save(stamped))) {
+      const note = this.noteOf({
+        before: current,
+        after: stamped,
+        ...(result.ended ? { ended: result.ended } : {}),
+      });
+      if (!(await this.options.storage.save(stamped, note))) {
         parties.delete(id);
         throw new Error(`Party ${id} is no longer in the database`);
       }
@@ -255,6 +276,22 @@ export class PartyStore implements PartyProvider {
     });
   }
 
+  /**
+   * What a write adds to the party history; nothing when there is no history, or when making
+   * the note fails (logged: the party's own write goes on).
+   */
+  private noteOf(write: PartyWrite): HistoryNote | undefined {
+    try {
+      return this.options.history?.noteOf(write);
+    } catch (err) {
+      this.options.log.error(
+        { err, party: write.after.id },
+        'could not note a party for its history',
+      );
+      return undefined;
+    }
+  }
+
   /**
    * Stores a reported raid unless the gym already has a raid of its kind that has not ended by
    * the clock, in which case that raid is returned and nothing is stored. The check and the
@@ -270,6 +307,7 @@ export class PartyStore implements PartyProvider {
     party: RaidParty,
     now: number,
     gymExists: () => boolean = () => true,
+    options: { movedFrom?: string } = {},
   ): Promise<
     | { added: true; party: RaidParty }
     | { added: false; existing: RaidParty }
@@ -281,7 +319,7 @@ export class PartyStore implements PartyProvider {
       if (!gymExists()) return { added: false, existing: undefined };
       const existing = this.raidAt(gymId, raidKindOf(party), now);
       if (existing) return { added: false, existing };
-      await this.add(party);
+      await this.add(party, options);
       return { added: true, party };
     });
   }
diff --git a/test/support/history.ts b/test/support/history.ts
index 1cf97c4df9c4bc69ddff06cd1d6d83d333734ac6..c077034d5978a210af4d852656e6da9fd582bfc7 100644
--- a/test/support/history.ts
+++ b/test/support/history.ts
@@ -1,4 +1,173 @@
-import type { HistoryOptIns } from '../../src/db/repositories/history-repository.js';
+import type {
+  HistoryOptIns,
+  HistoryStorage,
+  UnrecordedParty,
+} from '../../src/db/repositories/history-repository.js';
+import type {
+  HistoryNote,
+  HistoryRecord,
+  HistoryStep,
+} from '../../src/domain/history/party-history.js';
+import type { Party } from '../../src/domain/party/party.js';
+
+/**
+ * The options of a `PartyRepository` in a test that expects no note of the history to fail: a
+ * failure throws (after the party's write), so the test sees it.
+ */
+export const HISTORY_MUST_NOT_FAIL = {
+  historyFailed: (_note: HistoryNote, err: unknown): never => {
+    throw err instanceof Error ? err : new Error(String(err));
+  },
+};
+
+/** The server of the invented parties (row 1), as the fake gateway names it. */
+export const HISTORY_SERVER = '412345678901234567';
+
+/** What stands in for an ended party's row once it was recorded (`EndedPartyPost`). */
+export interface KeptPost {
+  forumChannelId: string;
+  guildId: number;
+}
+
+/**
+ * The party history kept in memory as `HistoryRepository` keeps it (history-recording.db.test.ts
+ * pins that down): the steps of active parties, the records of those that ended, who opted in
+ * (by server snowflake), and the posts of parties whose rows were deleted. `parties` are the
+ * rows of the party storage it sits beside (`MemoryPartyStorage` sets them): a record deletes
+ * the rows of its party and of those it went on from, as the repository does. `apply` writes a
+ * note all or nothing, as the storage does in its transaction. Set `failing` to make every write
+ * throw (reject, through `write`).
+ */
+export class MemoryHistory implements HistoryStorage {
+  failing: Error | undefined;
+  readonly records: HistoryRecord[] = [];
+  readonly posts = new Map<string, KeptPost>();
+  /** The rows of the parties; empty until a storage sets its own. */
+  parties = new Map<string, Party>();
+  /** The snowflakes of the servers, by row. */
+  readonly servers = new Map<number, string>([[1, HISTORY_SERVER]]);
+  private kept: HistoryStep[] = [];
+  private readonly opted = new Set<string>();
+
+  /** The steps of the parties that have no record yet, oldest first. */
+  get steps(): readonly HistoryStep[] {
+    return this.kept;
+  }
+
+  /** The member opted in to be named in the history of the server of this row. */
+  optIn(guildId: number, memberId: string): void {
+    this.opted.add(`${this.servers.get(guildId) ?? String(guildId)}:${memberId}`);
+  }
+
+  /** The party and every party it went on from, itself first. */
+  private lineage(partyId: string): string[] {
+    const found = [partyId];
+    for (let at = 0; at < found.length; at++) {
+      for (const step of this.kept) {
+        if (step.kind === 'from' && step.partyId === found[at] && !found.includes(step.subject)) {
+          found.push(step.subject);
+        }
+      }
+    }
+    return found;
+  }
+
+  private forget(partyIds: readonly string[]): void {
+    for (const id of partyIds) {
+      const row = this.parties.get(id);
+      if (row?.forumPostId && row.forumChannelId) {
+        this.posts.set(row.forumPostId, {
+          forumChannelId: row.forumChannelId,
+          guildId: row.guildId,
+        });
+      }
+      this.parties.delete(id);
+    }
+    this.kept = this.kept.filter((step) => !partyIds.includes(step.partyId));
+  }
+
+  apply(note: HistoryNote, options: { retry?: boolean } = {}): void {
+    if (this.failing) throw this.failing;
+    const { partyId, end } = note;
+    const row = this.parties.get(partyId);
+    if (end === undefined) {
+      if (!options.retry || row?.status === 'active') this.kept = [...this.kept, ...note.steps];
+      return;
+    }
+    if (!row) return;
+    const before = this.kept;
+    this.kept = [...this.kept, ...note.steps];
+    try {
+      if (end.kind === 'move') {
+        if (this.parties.has(end.to)) {
+          this.kept.push({
+            partyId: end.to,
+            at: row.updatedAt,
+            kind: 'from',
+            subject: partyId,
+            value: null,
+          });
+        }
+        return;
+      }
+      if (end.kind === 'drop') {
+        this.forget([partyId]);
+        return;
+      }
+      const lineage = this.lineage(partyId);
+      const own = this.kept
+        .filter((step) => lineage.includes(step.partyId))
+        .sort((a, b) => a.at - b.at);
+      const serverId = this.servers.get(note.guildId);
+      if (serverId === undefined) throw new Error(`Party ${partyId} has no server`);
+      const optedIn = new Set(end.members(own).filter((id) => this.opted.has(`${serverId}:${id}`)));
+      const record = { ...end.build(own, optedIn), serverId };
+      if (!this.records.some((kept) => kept.partyId === record.partyId)) this.records.push(record);
+      this.forget(lineage);
+    } catch (err) {
+      // All or nothing, as behind the savepoint.
+      this.kept = before;
+      throw err;
+    }
+  }
+
+  unrecorded(): Promise<UnrecordedParty[]> {
+    return new Promise((resolve, reject) => {
+      setImmediate(() => {
+        if (this.failing) {
+          reject(this.failing);
+          return;
+        }
+        const recorded = new Set(this.records.map((record) => record.partyId));
+        resolve(
+          [...this.parties.values()]
+            .filter((party) => party.status === 'ended' && !recorded.has(party.id))
+            .sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id))
+            .map((party) => ({
+              partyId: party.id,
+              movedTo:
+                this.kept.find((step) => step.kind === 'from' && step.subject === party.id)
+                  ?.partyId ?? null,
+            })),
+        );
+      });
+    });
+  }
+
+  write(note: HistoryNote, options: { retry?: boolean } = {}): Promise<void> {
+    return new Promise((resolve, reject) => {
+      // Like a real query, the answer never comes in the same turn of the event loop.
+      setImmediate(() => {
+        try {
+          this.apply(note, options);
+          resolve();
+        } catch (err) {
+          reject(err instanceof Error ? err : new Error(String(err)));
+        }
+      });
+    });
+  }
+}
 
 /**
  * Who is named in the party history, kept in memory as `HistoryRepository` keeps it, whose
diff --git a/test/support/parties.ts b/test/support/parties.ts
index 59105d5900823ce4f48938e123d99daafbe80929..cf6ac0ae6cc7d16f1ab32c57fe92fe511104cdbe 100644
--- a/test/support/parties.ts
+++ b/test/support/parties.ts
@@ -6,6 +6,7 @@ import type {
   PartyList,
   PartyStorage,
 } from '../../src/db/repositories/party-repository.js';
+import type { HistoryNote } from '../../src/domain/history/party-history.js';
 import { partyFromStored, partyMirrors, partyState } from '../../src/domain/party/party-state.js';
 import { createMeetup, type NewMeetup } from '../../src/domain/party/meetup.js';
 import type {
@@ -21,6 +22,7 @@ import { createTrain, type NewTrain } from '../../src/domain/party/train.js';
 import { PartyStatus } from '../../src/domain/party/status.js';
 import { raidDurationRules, type RaidDurationRules } from '../../src/domain/time/raid-durations.js';
 import { PartyStore, type PartyProvider } from '../../src/services/party-store.js';
+import type { MemoryHistory } from './history.js';
 import { raidEventsFixture } from './raid-events.js';
 import { createTestLogger } from './test-logger.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
@@ -195,6 +197,10 @@ export class MemoryPartyStorage implements PartyStorage {
   readonly rows = new Map<string, Party>();
   /** Every party written, in order: `insert` and `save` calls. */
   readonly writes: Party[] = [];
+  /** Where the notes of the party history go, as `PartyRepository` writes them with the party. */
+  history: MemoryHistory | undefined;
+  /** Told of a note that could not be written, as `PartyRepository`'s `historyFailed`. */
+  historyFailed: ((note: HistoryNote, err: unknown) => void) | undefined;
 
   constructor(parties: readonly Party[] = []) {
     for (const party of parties) this.rows.set(party.id, party);
@@ -224,39 +230,61 @@ export class MemoryPartyStorage implements PartyStorage {
     );
   }
 
-  insert(party: Party): Promise<void> {
+  insert(party: Party, note?: HistoryNote): Promise<void> {
     return this.attempt(() => {
       survivesStorage(party);
       if (this.rows.has(party.id) || this.postTaken(party)) throw new Error('Duplicate entry');
       this.rows.set(party.id, party);
       this.writes.push(party);
+      this.noted(note);
     });
   }
 
-  save(party: Party): Promise<boolean> {
+  save(party: Party, note?: HistoryNote): Promise<boolean> {
     return this.attempt(() => {
       if (!this.rows.has(party.id)) return false;
       survivesStorage(party);
       if (this.postTaken(party)) throw new Error('Duplicate entry');
       this.rows.set(party.id, party);
       this.writes.push(party);
+      this.noted(note);
       return true;
     });
   }
 
+  /** Writes a note after its party, as the repository does behind a savepoint. */
+  private noted(note: HistoryNote | undefined): void {
+    if (note === undefined || this.history === undefined) return;
+    try {
+      this.history.apply(note);
+    } catch (err) {
+      if (!this.historyFailed) throw err;
+      this.historyFailed(note, err);
+    }
+  }
+
+  /** As the repository: the rows of ended parties, and the posts of those deleted once recorded. */
   endedPosts(forumPostIds: readonly string[]): Promise<string[]> {
-    return this.attempt(() =>
-      [...this.rows.values()]
-        .filter((party) => party.status === 'ended' && party.forumPostId !== null)
-        .map((party) => party.forumPostId ?? '')
-        .filter((id) => forumPostIds.includes(id)),
-    );
+    return this.attempt(() => [
+      ...new Set(
+        [
+          ...[...this.rows.values()]
+            .filter((party) => party.status === 'ended' && party.forumPostId !== null)
+            .map((party) => party.forumPostId ?? ''),
+          ...(this.history?.posts.keys() ?? []),
+        ].filter((id) => forumPostIds.includes(id)),
+      ),
+    ]);
   }
 
   partyForums(only?: number): Promise<PartyForum[]> {
     return this.attempt(() => {
       const seen = new Map<string, PartyForum>();
-      for (const { forumChannelId, guildId } of this.rows.values()) {
+      const forums = [
+        ...this.rows.values(),
+        ...(this.history ? [...this.history.posts.values()] : []),
+      ];
+      for (const { forumChannelId, guildId } of forums) {
         if (forumChannelId !== null && (only === undefined || guildId === only)) {
           seen.set(`${guildId}:${forumChannelId}`, { forumChannelId, guildId });
         }
diff --git a/test/support/party-service.ts b/test/support/party-service.ts
index cee8e073b812e2e3d434c852a835bda7cbf5c269..4e034a5572b8267e628dead4563df48247aff4a5 100644
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -3,6 +3,7 @@ import type {
   AccessGrant,
   AccessGrantStorage,
 } from '../../src/db/repositories/access-grant-repository.js';
+import type { HistoryStorage } from '../../src/db/repositories/history-repository.js';
 import type { PartyStorage } from '../../src/db/repositories/party-repository.js';
 import type {
   Region,
@@ -37,6 +38,7 @@ import { SpawnService } from '../../src/services/spawn-service.js';
 import { RecordingDms } from './dms.js';
 import { FakePartyGateway } from './fake-gateway.js';
 import { MemoryGymTargets } from './gym-targets.js';
+import { MemoryHistory } from './history.js';
 import { FakeMemberDirectory } from './members.js';
 import { MemoryNewTrains } from './new-trains.js';
 import { MemoryWants } from './wants.js';
@@ -57,6 +59,7 @@ import { MemorySavedRoutes } from './saved-routes.js';
 import { createTestLogger } from './test-logger.js';
 import { MemoryUsers } from './users.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
+import { PartyHistory } from '../../src/services/party-history.js';
 import { PartyStore } from '../../src/services/party-store.js';
 import { RaidChangeService } from '../../src/services/raid-change-service.js';
 import { TimedPartyService } from '../../src/services/timed-party-service.js';
@@ -242,8 +245,12 @@ export interface Outliving {
   wants: MemoryWants;
   gymTargets: MemoryGymTargets;
   newTrains: MemoryNewTrains;
+  /** The party history: the steps of active parties, the records of ended ones, the opt-ins. */
+  history: MemoryHistory;
   /** The storage the store really uses, when that is not the one in memory (a database test). */
   database: PartyStorage | undefined;
+  /** With `database`: the history the retries of what failed go to (`HistoryRepository`). */
+  historyStorage: HistoryStorage | undefined;
 }
 
 /**
@@ -299,7 +306,22 @@ export async function partyServiceWith(
   const storage = kept?.storage ?? new MemoryPartyStorage(parties);
   const { log, entries } = createTestLogger();
   const database = kept?.database;
-  const store = new PartyStore({ storage: database ?? storage, log, now });
+  const history = kept?.history ?? new MemoryHistory();
+  history.parties = storage.rows;
+  // Its tries of what failed never run by themselves: `recorder.flush()` runs them. Over the
+  // database, they go to the database's history as the notes do.
+  const recorder = new PartyHistory({
+    storage: kept?.historyStorage ?? history,
+    gameData: overrides.gameData ?? { catalogue: catalogueFixture() },
+    raidBosses: overrides.raidBosses ?? raidBossesFixture(),
+    log,
+    setTimer: () => () => undefined,
+  });
+  storage.history = history;
+  storage.historyFailed = (note, err) => {
+    recorder.failed(note, err);
+  };
+  const store = new PartyStore({ storage: database ?? storage, log, now, history: recorder });
   await store.load();
   const gateway = kept?.gateway ?? new FakePartyGateway();
   const grants = kept?.grants ?? new MemoryAccessGrants();
@@ -485,7 +507,10 @@ export async function partyServiceWith(
     gyms,
     store,
     storage,
+    history,
+    recorder,
     database,
+    historyStorage: kept?.historyStorage,
     gateway,
     regions,
     tags,
````

### Task 4: Plan 8H T4: the legacy parties folder imported into the history

Prototype commit: `8b7f6ab7c91661cd145f25141538feb237f6f9cd`

npm run history:import -- <folder> [--server <id>] and ./pine
import-history <folder> [--server <id>] (the folder mounted read-only
into a one-off container after the migrations; the bot is not started).
The command is importStep: the folder is checked before the game data is
loaded, a database without the history tables is refused, and it exits
1 when no file could be read or a record could not be written.

Reads complete/ (a file per gym, a list of ended raids) before active/
(parties going on at the cutover, recorded as ended "cutover" when they
have a maker, a creation time and an attendee). Two passes: the first
learns the region channels the files name and, of a party stored twice,
the copy deleted last (the one taken); the second writes batches of
1,000, one transaction each, keyed by <channel>:<creation time>, so a
second run writes nothing twice. A batch the database refuses is written
record by record; what it still refuses is counted and left.

No member id is ever kept: mentions and bare ids in names, descriptions
and labels become @member. The server is a snowflake: the region's, else
--server, else the one server of the regions the files named (counted).
Gyms are matched by id only on a database taken over from the legacy bot;
bosses by number and form, the name members search for, the legacy name
or the number, else kept as given (eggs and the placeholders pokemon,
egg, mega, elite have none); tiers of every era; one group of each name;
a train's stops as far as route, current stop and start say. Counts what
it read, imported, found there already or twice, skipped per reason,
could not write or match; read errors are said apart from bad JSON.

On Pittsburgh's copy, into a scratch MySQL: see the plan's report.

src/ops/legacy-parties.ts is the folder reader that plan 8C's reader of
active/ can join.

**Files:**

```
 package.json                                                    |   1 +
 pine                                                            |  36 +++
 src/domain/history/legacy-party.test.ts                         | 364 ++++++++++++++++++++++++++++
 src/domain/history/legacy-party.ts                              | 343 ++++++++++++++++++++++++++
 src/domain/history/party-history.ts                             |   8 +
 src/ops/history-import-cli.ts                                   |  53 ++++
 src/ops/history-import.db.test.ts                               | 284 ++++++++++++++++++++++
 src/ops/history-import.ts                                       | 327 +++++++++++++++++++++++++
 src/ops/legacy-parties.ts                                       |  71 ++++++
 src/services/party-history.ts                                   |   5 +-
 .../complete/0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f                   |   1 +
 .../legacy-parties/active/3d4e5f60718293a4b5c6d7e8f90a1b2c      |   1 +
 .../legacy-parties/active/4e5f60718293a4b5c6d7e8f90a1b2c3d      |   1 +
 .../legacy-parties/active/5f60718293a4b5c6d7e8f90a1b2c3d4e      |   1 +
 .../legacy-parties/active/60718293a4b5c6d7e8f90a1b2c3d4e5f      |   1 +
 .../legacy-parties/active/718293a4b5c6d7e8f90a1b2c3d4e5f60      |   1 +
 .../legacy-parties/complete/0a1b2c3d4e5f60718293a4b5c6d7e8f9    |   1 +
 .../legacy-parties/complete/1b2c3d4e5f60718293a4b5c6d7e8f90a    |   1 +
 .../legacy-parties/complete/2c3d4e5f60718293a4b5c6d7e8f90a1b    |   1 +
 19 files changed, 1498 insertions(+), 3 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/domain/history/legacy-party.test.ts`,
  `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/ops/history-import.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 8b7f6ab7c91661cd145f25141538feb237f6f9cd -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8h-party-history.md'` prints nothing (and file modes match: `pine` is 100755).
- [ ] **Step 5: Commit** with the title `Plan 8H T4: the legacy parties folder imported into the history`, the body above and the trailer, staging exactly
  `package.json pine src/domain/history/legacy-party.test.ts src/domain/history/legacy-party.ts src/domain/history/party-history.ts src/ops/history-import-cli.ts src/ops/history-import.db.test.ts src/ops/history-import.ts src/ops/legacy-parties.ts src/services/party-history.ts test/fixtures/legacy-parties-broken/complete/0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f test/fixtures/legacy-parties/active/3d4e5f60718293a4b5c6d7e8f90a1b2c test/fixtures/legacy-parties/active/4e5f60718293a4b5c6d7e8f90a1b2c3d test/fixtures/legacy-parties/active/5f60718293a4b5c6d7e8f90a1b2c3d4e test/fixtures/legacy-parties/active/60718293a4b5c6d7e8f90a1b2c3d4e5f test/fixtures/legacy-parties/active/718293a4b5c6d7e8f90a1b2c3d4e5f60 test/fixtures/legacy-parties/complete/0a1b2c3d4e5f60718293a4b5c6d7e8f9 test/fixtures/legacy-parties/complete/1b2c3d4e5f60718293a4b5c6d7e8f90a test/fixtures/legacy-parties/complete/2c3d4e5f60718293a4b5c6d7e8f90a1b`.

````diff
diff --git a/package.json b/package.json
index 13f5857212048ac638b9562a2b105c58ed2b4e16..f089d89bf93c6e5c54a54ea178694b89217df78a 100644
--- a/package.json
+++ b/package.json
@@ -12,6 +12,7 @@
     "start": "node --env-file-if-exists=.env --enable-source-maps dist/index.js",
     "dev": "tsx watch --env-file-if-exists=.env src/index.ts",
     "migrate": "tsx --env-file-if-exists=.env src/db/migrate-cli.ts",
+    "history:import": "tsx --env-file-if-exists=.env src/ops/history-import-cli.ts",
     "deploy-commands": "tsx --env-file-if-exists=.env src/discord/deploy-cli.ts",
     "db:legacy-fixture": "tsx scripts/legacy-schema/generate.ts",
     "fixtures:game-data": "tsx scripts/game-data/make-fixtures.ts",
diff --git a/pine b/pine
index 25fbd4a3e9a92a1b038caa5967ebc0c40383bf15..d2081e10c25154c3ec8a7eb125d9f8e3062912f7 100755
--- a/pine
+++ b/pine
@@ -113,6 +113,10 @@ Usage: ./pine <command>
   update             back up the database, then fetch the newest code (git pull), rebuild
                      and restart what changed (nothing when there is nothing new)
   shell              a shell in the bot's container
+  import-history <folder> [--server <server id>]
+                     import the legacy bot's parties folder into the party history (reads the
+                     folder only; once per instance, and safe to run again); --server names the
+                     server of parties whose region is gone
   help               this list
 EOF
 }
@@ -289,6 +293,38 @@ cmd_shell() {
   fi
 }
 
+# A folder the operator gave (as seen from where they ran ./pine), as Docker takes it for a bind
+# mount: absolute, and in Git Bash in its Windows form (C:/...), which Docker Desktop takes.
+mount_folder() {
+  dir=$(from_caller "$1")
+  [ -d "$dir" ] || fail "There is no folder $dir."
+  (cd "$dir" && { pwd -W 2>/dev/null || pwd; })
+}
+
+cmd_import_history() {
+  need_stack
+  usage_import="Usage: ./pine import-history <folder> [--server <server id>]"
+  case $# in
+    1) server= ;;
+    3)
+      [ "$2" = --server ] || fail "$usage_import"
+      server=$3
+      ;;
+    *) fail "$usage_import" ;;
+  esac
+  folder=$(mount_folder "$1")
+  [ -d "$folder/complete" ] || [ -d "$folder/active" ] ||
+    fail "$folder has neither active/ nor complete/: name the legacy bot's parties folder."
+  build_image
+  start_database
+  say "Bringing the database up to date first (the bot does not start, Discord is not contacted)."
+  run run --rm --no-deps pine node --enable-source-maps dist/db/migrate-cli.js
+  say "Importing the legacy parties of $folder into the party history (the folder is only read; a large one takes minutes)."
+  run run --rm --no-deps -v "$folder:/legacy-history:ro" pine \
+    node --enable-source-maps dist/ops/history-import-cli.js /legacy-history \
+    ${server:+--server "$server"}
+}
+
 # The database half of a restore, in a one-off container of the bot's image (src/ops/restore-cli.ts).
 restore_step() {
   run run --rm --no-deps pine node --enable-source-maps dist/ops/restore-cli.js "$@"
diff --git a/src/domain/history/legacy-party.test.ts b/src/domain/history/legacy-party.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1f30847bcd4c41abe9064bca19cbef1dd908b096
--- /dev/null
+++ b/src/domain/history/legacy-party.test.ts
@@ -0,0 +1,364 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import { legacyBossResolver, legacyRecord, type LegacyContext } from './legacy-party.js';
+
+// Invented ids: channels, members, gyms. Nothing here comes from a real server.
+const REGION_CHANNEL = '300000000000000001';
+const OTHER_CHANNEL = '300000000000000002';
+const RAID_CHANNEL = '310000000000000001';
+const MEMBER_A = '320000000000000001';
+const MEMBER_B = '320000000000000002';
+const SERVER = '400000000000000002';
+const CREATED = 1_600_000_000_000;
+const MINUTE = 60_000;
+
+const boss = legacyBossResolver(catalogueFixture());
+
+function context(overrides: Partial<LegacyContext> = {}): LegacyContext {
+  return {
+    part: 'complete',
+    regionOf: (channelId) =>
+      channelId === REGION_CHANNEL ? { regionId: 4, serverId: SERVER } : undefined,
+    fallbackServerId: SERVER,
+    gymExists: (id) => id === 17,
+    boss,
+    now: CREATED + 600 * MINUTE,
+    ...overrides,
+  };
+}
+
+/** A raid as the legacy bot kept it in `complete/` in its later years. */
+function raid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
+  return {
+    type: 'raid',
+    channelId: RAID_CHANNEL,
+    sourceChannelId: REGION_CHANNEL,
+    createdById: MEMBER_A,
+    originallyCreatedBy: MEMBER_A,
+    creationTime: CREATED,
+    gymId: 17,
+    isExclusive: false,
+    hatchTime: CREATED + 30 * MINUTE,
+    endTime: CREATED + 75 * MINUTE,
+    lastPossibleTime: CREATED + 75 * MINUTE,
+    deletionTime: CREATED + 90 * MINUTE,
+    pokemon: { name: 'Giratina', form: 'altered', number: 487, tier: 5, shiny: true },
+    defaultGroupId: 'B',
+    groups: [{ id: 'A' }, { id: 'B', label: 'After work', startTime: CREATED + 40 * MINUTE }],
+    attendees: {
+      [MEMBER_A]: { number: 2, status: 4, group: 'A', remote: true },
+      [MEMBER_B]: { number: '1', status: 1, group: 'B' },
+    },
+    ...overrides,
+  };
+}
+
+describe('legacyRecord', () => {
+  it('reads a raid of the later years, with no member id anywhere', () => {
+    const read = legacyRecord(raid(), context());
+    expect(read).toEqual({
+      ok: true,
+      byFallback: false,
+      record: {
+        source: 'legacy',
+        partyId: null,
+        legacyKey: `${RAID_CHANNEL}:${String(CREATED)}`,
+        kind: 'raid',
+        serverId: SERVER,
+        regionId: 4,
+        gymId: 17,
+        legacyGymId: 17,
+        name: null,
+        description: null,
+        tier: 'T5',
+        shadow: false,
+        mega: false,
+        elite: false,
+        ex: false,
+        shiny: true,
+        boss: { key: 'giratina_altered', dex: 487, species: 'GIRATINA', form: 'GIRATINA_ALTERED' },
+        fastMove: null,
+        chargedMove: null,
+        createdAt: CREATED,
+        hatchTime: CREATED + 30 * MINUTE,
+        startTime: null,
+        endTime: CREATED + 75 * MINUTE,
+        endedAt: CREATED + 90 * MINUTE,
+        ending: 'completed',
+        createdById: null,
+        conductorId: null,
+        anonymous: false,
+        routeStops: null,
+        attendees: [
+          {
+            memberId: null,
+            status: 'done',
+            furthest: 'done',
+            groupId: 'A',
+            extras: 1,
+            remote: true,
+            team: null,
+            signedUpAt: null,
+            joinedAt: null,
+            hereAt: null,
+            doneAt: null,
+            leftAt: null,
+          },
+          expect.objectContaining({ memberId: null, status: 'joined', groupId: 'B', extras: 0 }),
+        ],
+        groups: [
+          { groupId: 'A', label: null, meetingTime: null, members: 1, heads: 2 },
+          {
+            groupId: 'B',
+            label: 'After work',
+            meetingTime: CREATED + 40 * MINUTE,
+            members: 1,
+            heads: 1,
+          },
+        ],
+        stops: [],
+      },
+    });
+    expect(JSON.stringify(read)).not.toContain(MEMBER_A);
+    expect(JSON.stringify(read)).not.toContain(MEMBER_B);
+  });
+
+  it('reads an early egg: tier alone, no groups, an end time that was never set', () => {
+    const read = legacyRecord(
+      raid({
+        pokemon: { egg: true, tier: 3, weakness: [] },
+        endTime: 'unset',
+        hatchTime: undefined,
+        deletionTime: undefined,
+        groups: undefined,
+        defaultGroupId: undefined,
+        attendees: { [MEMBER_A]: { number: 1, status: 0 } },
+      }),
+      context(),
+    );
+    expect(read.ok && read.record).toMatchObject({
+      tier: 'T3',
+      boss: null,
+      shiny: null,
+      endTime: null,
+      hatchTime: null,
+      endedAt: CREATED + 75 * MINUTE,
+      ending: 'unknown',
+      groups: [],
+      attendees: [expect.objectContaining({ status: 'interested', groupId: null })],
+    });
+  });
+
+  it('reads the tiers and flags of every era', () => {
+    const tierOf = (pokemon: object, flags: object = {}) => {
+      const read = legacyRecord(raid({ pokemon, ...flags }), context());
+      return read.ok
+        ? [read.record.tier, read.record.mega, read.record.elite, read.record.ex]
+        : read.reason;
+    };
+    expect(tierOf({ tier: 4 })).toEqual(['T4', false, false, false]);
+    expect(tierOf({ tier: 2 })).toEqual(['T2', false, false, false]);
+    expect(tierOf({ tier: 5 }, { isExclusive: true })).toEqual(['EX', false, false, true]);
+    expect(tierOf({ tier: 5 }, { isElite: true })).toEqual(['Elite', false, true, false]);
+    expect(tierOf({ name: 'mega', mega: true }, { isMega: true })).toEqual([
+      'Mega',
+      true,
+      false,
+      false,
+    ]);
+    expect(tierOf({ tier: 6, mega: true }, { isMega: true })).toEqual([
+      'MegaLegendary',
+      true,
+      false,
+      false,
+    ]);
+    expect(tierOf({ name: 'pokemon', tier: '????', placeholder: true })).toEqual([
+      null,
+      false,
+      false,
+      false,
+    ]);
+    expect(tierOf({ tier: 7, name: 'ditto' })).toEqual([null, false, false, false]);
+    expect(tierOf({ backupTier: 1, name: 'magikarp' })).toEqual(['T1', false, false, false]);
+  });
+
+  it('keeps a raid at a gym that is gone, of a region that is gone, in the only server', () => {
+    const read = legacyRecord(raid({ gymId: '23', sourceChannelId: OTHER_CHANNEL }), context());
+    expect(read.ok && read.byFallback).toBe(true);
+    expect(read.ok && read.record).toMatchObject({
+      gymId: null,
+      legacyGymId: 23,
+      regionId: null,
+      serverId: SERVER,
+    });
+    expect(
+      legacyRecord(
+        raid({ sourceChannelId: OTHER_CHANNEL }),
+        context({ fallbackServerId: undefined }),
+      ),
+    ).toEqual({ ok: false, reason: 'no-server' });
+  });
+
+  it('keeps no gym id that cannot be one, and one group of each name', () => {
+    const read = legacyRecord(
+      raid({
+        gymId: -4,
+        groups: [{ id: 'A' }, { id: 'A', label: 'again' }, { id: 'AB', label: 'cut to A' }],
+      }),
+      context(),
+    );
+    expect(read.ok && read.record).toMatchObject({ gymId: null, legacyGymId: null });
+    expect(read.ok && read.record.groups.map((group) => group.groupId)).toEqual(['A']);
+  });
+
+  it('writes @member for every member a name, a description or a label of the files names', () => {
+    const read = legacyRecord(
+      {
+        type: 'meet-up',
+        channelId: RAID_CHANNEL,
+        sourceChannelId: REGION_CHANNEL,
+        createdById: MEMBER_A,
+        creationTime: CREATED,
+        meetupName: `Picnic with <@${MEMBER_B}>`,
+        description: `Ask <@!${MEMBER_A}> or ${MEMBER_B} <:pine:123456789012345678>`,
+        defaultGroupId: 'A',
+        groups: [{ id: 'A', label: `Ride with <@${MEMBER_B}>` }],
+        attendees: { [MEMBER_A]: { number: 1, status: 0, group: 'A' } },
+      },
+      context({ part: 'active' }),
+    );
+    expect(read.ok && read.record).toMatchObject({
+      name: 'Picnic with @member',
+      description: 'Ask @member or @member <:pine:123456789012345678>',
+      groups: [expect.objectContaining({ label: 'Ride with @member' })],
+    });
+    expect(JSON.stringify(read)).not.toContain(MEMBER_A);
+    expect(JSON.stringify(read)).not.toContain(MEMBER_B);
+  });
+
+  it('counts the first stop of a train that started, also at its first stop', () => {
+    const train = (startTime: number) =>
+      legacyRecord(
+        {
+          type: 'raid train',
+          channelId: RAID_CHANNEL,
+          sourceChannelId: REGION_CHANNEL,
+          createdById: MEMBER_A,
+          creationTime: CREATED,
+          startTime,
+          trainName: 'Early',
+          route: [17, 23],
+          currentGym: 0,
+          attendees: { [MEMBER_A]: { number: 1, status: 1, group: 'A' } },
+        },
+        context({ part: 'active' }),
+      );
+    const started = train(CREATED + MINUTE);
+    expect(started.ok && started.record.stops.map((stop) => stop.legacyGymId)).toEqual([17]);
+    const ahead = train(CREATED + 9_999 * MINUTE);
+    expect(ahead.ok && ahead.record.stops).toEqual([]);
+  });
+
+  it('skips what is no party, and says why', () => {
+    const skip = (value: unknown, part: 'active' | 'complete' = 'complete') => {
+      const read = legacyRecord(value, context({ part }));
+      return read.ok ? 'read' : read.reason;
+    };
+    expect(skip('a string')).toBe('not-a-party');
+    expect(skip(raid({ type: 'potluck' }))).toBe('unknown-kind');
+    expect(skip(raid({ creationTime: 'yesterday' }))).toBe('no-creation-time');
+    expect(skip(raid({ channelId: undefined }))).toBe('no-channel');
+    // An ended raid counts however little it has; one still going on needs a maker and a member.
+    expect(skip(raid({ attendees: {} }))).toBe('read');
+    expect(skip(raid({ attendees: {} }), 'active')).toBe('no-attendees');
+    expect(skip(raid({ createdById: undefined }), 'active')).toBe('no-creator');
+  });
+
+  it('reads a train that was still going on as ended by the cutover, with the stops it made', () => {
+    const read = legacyRecord(
+      {
+        type: 'raid train',
+        channelId: RAID_CHANNEL,
+        sourceChannelId: REGION_CHANNEL,
+        createdById: MEMBER_A,
+        creationTime: CREATED,
+        startTime: CREATED + 60 * MINUTE,
+        trainName: 'Sunday legendaries',
+        route: [17, 23, 31],
+        currentGym: 1,
+        conductor: null,
+        defaultGroupId: 'A',
+        groups: [{ id: 'A' }],
+        attendees: { [MEMBER_A]: { number: 1, status: 2, group: 'A' } },
+      },
+      context({ part: 'active' }),
+    );
+    expect(read.ok && read.record).toMatchObject({
+      kind: 'train',
+      name: 'Sunday legendaries',
+      startTime: CREATED + 60 * MINUTE,
+      ending: 'cutover',
+      endedAt: null,
+      routeStops: 3,
+      stops: [
+        { gymId: 17, legacyGymId: 17, arrivedAt: null, leftAt: null },
+        { gymId: null, legacyGymId: 23, arrivedAt: null, leftAt: null },
+      ],
+      attendees: [expect.objectContaining({ status: 'here', memberId: null })],
+    });
+  });
+
+  it('reads a meetup with what it said about itself', () => {
+    const read = legacyRecord(
+      {
+        type: 'meet-up',
+        channelId: RAID_CHANNEL,
+        sourceChannelId: REGION_CHANNEL,
+        createdById: MEMBER_A,
+        creationTime: CREATED,
+        meetupName: 'Picnic',
+        description: 'At the park',
+        defaultGroupId: 'A',
+        groups: [{ id: 'A' }],
+        attendees: { [MEMBER_A]: { number: 1, status: 0, group: 'A' } },
+      },
+      context({ part: 'active' }),
+    );
+    expect(read.ok && read.record).toMatchObject({
+      kind: 'meetup',
+      name: 'Picnic',
+      description: 'At the park',
+      gymId: null,
+      tier: null,
+      ending: 'cutover',
+    });
+  });
+});
+
+describe('legacyBossResolver', () => {
+  const key = (pokemon: object) => {
+    const found = boss(pokemon);
+    return found === null ? null : 'key' in found ? found.key : { raw: found.name };
+  };
+
+  it('finds the bosses as the legacy bot named them over the years', () => {
+    expect(key({ name: 'rayquaza', form: 'normal', number: 384 })).toBe('rayquaza');
+    expect(key({ name: 'Giratina', form: 'altered', number: 487 })).toBe('giratina_altered');
+    expect(key({ name: 'Giratina - Origin', form: 'origin', number: '487' })).toBe(
+      'giratina_origin',
+    );
+    expect(key({ name: 'Alolan Marowak', form: 'alola', number: 105 })).toBe('marowak_alola');
+    expect(key({ name: 'ho-oh' })).toBe('ho_oh');
+    expect(key({ name: 'Mega Charizard X', mega: true })).toBe('charizard_mega_x');
+    expect(key({ name: 'Deoxys - Normal', form: 'normal', number: 386 })).toBe('deoxys');
+  });
+
+  it('keeps a name it does not know as it was given, and finds no boss in an egg', () => {
+    expect(key({ name: 'Unheardofmon' })).toEqual({ raw: 'Unheardofmon' });
+    expect(key({ egg: true, tier: 5 })).toBeNull();
+    expect(key({ name: 'pokemon', tier: '????', placeholder: true })).toBeNull();
+    expect(key({ name: 'mega', mega: true })).toBeNull();
+    expect(key({ name: 'elite', elite: true })).toBeNull();
+    expect(key({ name: 'egg', tier: '????' })).toBeNull();
+  });
+});
diff --git a/src/domain/history/legacy-party.ts b/src/domain/history/legacy-party.ts
new file mode 100644
index 0000000000000000000000000000000000000000..13bd9d76e3907ffd1894b47e3e90cb1af547d983
--- /dev/null
+++ b/src/domain/history/legacy-party.ts
@@ -0,0 +1,343 @@
+import type { PokemonCatalogue } from '../pogo/catalogue.js';
+import { keyForLegacyName } from '../pogo/legacy-names.js';
+import { PokemonSearch } from '../pogo/pokemon-search.js';
+import { PartyStatus } from '../party/status.js';
+import {
+  historyBoss,
+  stopsByRoute,
+  type HistoryAttendee,
+  type HistoryBoss,
+  type HistoryGroup,
+  type HistoryKind,
+  type HistoryRecord,
+  type HistoryStatus,
+  type HistoryStop,
+  type HistoryTier,
+} from './party-history.js';
+
+/*
+ * The legacy bot's parties, as its `parties/` folder kept them (node-persist: a file per key,
+ * `{ key, value }`), read into records of the party history. `complete/` holds one file per gym
+ * whose value is the list of every raid that ended there; `active/` a file per party that had
+ * not ended (raids, trains, meetups). The fields came and went from 2018 to 2026; what this
+ * reads is listed in docs/architecture/history.md. Nothing of a member is kept: the history of
+ * the legacy bot serves counts only (everyone starts from zero; Matt, 2026-10-16).
+ */
+
+/** Why a party of the files is not imported. */
+export const LEGACY_SKIPS = [
+  'not-a-party',
+  'unknown-kind',
+  'no-creation-time',
+  'no-channel',
+  'no-creator',
+  'no-attendees',
+  'no-server',
+] as const;
+export type LegacySkip = (typeof LEGACY_SKIPS)[number];
+
+export interface LegacyContext {
+  /** Which folder the party is from: `complete` (ended) or `active` (going on at the cutover). */
+  part: 'active' | 'complete';
+  /** The region, and its server's snowflake, of a region channel by its snowflake. */
+  regionOf(channelId: string): { regionId: number; serverId: string } | undefined;
+  /**
+   * The server of a party whose region is not known (`--server`, or the one server of every
+   * region the files named that is known); undefined when there is none.
+   */
+  fallbackServerId: string | undefined;
+  /**
+   * Whether the gym list still has a gym of this id: the legacy bot's ids, on a database taken
+   * over from it; never on another one, whose ids are not the files'.
+   */
+  gymExists(id: number): boolean;
+  /** The boss of a raid from what the file kept of it (`legacyBossResolver`). */
+  boss(pokemon: unknown): HistoryBoss | null;
+  /** When the import runs: a train still going on had started when its start time was past. */
+  now: number;
+}
+
+/** A record of the files; `byFallback`: its server is the fallback, not its region's. */
+export type LegacyRead =
+  { ok: true; record: HistoryRecord; byFallback: boolean } | { ok: false; reason: LegacySkip };
+
+type Raw = Record<string, unknown>;
+
+/** A Discord id as the files wrote it (the domain does not reach for `src/db`'s check). */
+const SNOWFLAKE = /^\d{15,20}$/u;
+const isSnowflake = (value: string): boolean => SNOWFLAKE.test(value);
+
+function isRaw(value: unknown): value is Raw {
+  return typeof value === 'object' && value !== null && !Array.isArray(value);
+}
+
+/** A whole number from 0 up, also from a string of digits (both were written); else none. */
+function numberOf(value: unknown): number | undefined {
+  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
+  if (typeof value === 'string' && /^\d{1,15}$/u.test(value.trim())) return Number(value.trim());
+  return undefined;
+}
+
+function timeOf(value: unknown): number | null {
+  const time = numberOf(value);
+  return time !== undefined && time > 0 ? time : null;
+}
+
+/** A member named by a mention, or by a bare id (17 to 20 digits) outside an emoji's tag. */
+const MENTION = /<@!?\d+>|<a?:\w+:\d+>|(?<![\d])\d{17,20}(?![\d])/gu;
+
+/**
+ * Text of the files (a name, a description, a label), tidied and cut to `room`, with every
+ * member it names written `@member`: the legacy history keeps nobody (an emoji stays).
+ */
+function textOf(value: unknown, room = 100): string | null {
+  if (typeof value !== 'string') return null;
+  const text = value
+    .replace(MENTION, (found) =>
+      found.startsWith('<a:') || found.startsWith('<:') ? found : '@member',
+    )
+    .trim();
+  return text === '' ? null : [...text].slice(0, room).join('');
+}
+
+const KINDS: Readonly<Record<string, HistoryKind>> = {
+  raid: 'raid',
+  'raid train': 'train',
+  'meet-up': 'meetup',
+};
+
+const STATUS_WORDS: Readonly<Record<number, HistoryStatus>> = {
+  [PartyStatus.Interested]: 'interested',
+  [PartyStatus.Coming]: 'joined',
+  [PartyStatus.Present]: 'here',
+  [PartyStatus.CompletePending]: 'here',
+  [PartyStatus.Complete]: 'done',
+};
+
+/**
+ * The tier of a legacy raid: EX and elite by the raid's flags, a mega by its flags (tier 6 a
+ * mega legendary), otherwise the number, tier 1 to 5 (the game had 2 and 4 until 2020). What the
+ * files hold besides (`????` of a raid whose tier was not set, 7) is no tier.
+ */
+function tierOf(raid: Raw, pokemon: Raw): HistoryTier | null {
+  if (raid.isExclusive === true || pokemon.exclusive === true) return 'EX';
+  if (raid.isElite === true || pokemon.elite === true) return 'Elite';
+  const level = numberOf(pokemon.tier) ?? numberOf(pokemon.backupTier);
+  if (raid.isMega === true || pokemon.mega === true) return level === 6 ? 'MegaLegendary' : 'Mega';
+  if (level === 6) return 'MegaLegendary';
+  if (level !== undefined && level >= 1 && level <= 5) return `T${String(level)}` as HistoryTier;
+  return null;
+}
+
+function attendeesOf(raw: Raw): HistoryAttendee[] {
+  const attendees = isRaw(raw.attendees) ? Object.values(raw.attendees) : [];
+  return attendees.flatMap((value): HistoryAttendee[] => {
+    if (!isRaw(value)) return [];
+    const status = STATUS_WORDS[numberOf(value.status) ?? -1];
+    if (status === undefined) return [];
+    const number = numberOf(value.number) ?? 1;
+    return [
+      {
+        memberId: null,
+        status,
+        furthest: status,
+        groupId: typeof value.group === 'string' ? value.group.slice(0, 1) : null,
+        extras: Math.min(255, Math.max(0, number - 1)),
+        remote: value.remote === true,
+        team: null,
+        signedUpAt: null,
+        joinedAt: null,
+        hereAt: null,
+        doneAt: null,
+        leftAt: null,
+      },
+    ];
+  });
+}
+
+/** The groups of a party, each id once (the first of a name: two ids can cut to one letter). */
+function groupsOf(raw: Raw, attendees: readonly HistoryAttendee[]): HistoryGroup[] {
+  const groups = Array.isArray(raw.groups) ? raw.groups : [];
+  const seen = new Set<string>();
+  return groups.flatMap((group): HistoryGroup[] => {
+    if (!isRaw(group) || typeof group.id !== 'string' || group.id === '') return [];
+    const groupId = group.id.slice(0, 1);
+    if (seen.has(groupId)) return [];
+    seen.add(groupId);
+    const members = attendees.filter((attendee) => attendee.groupId === groupId);
+    return [
+      {
+        groupId,
+        label: textOf(group.label),
+        // Both spellings were written.
+        meetingTime: timeOf(group.startTime) ?? timeOf(group.start_time),
+        members: members.length,
+        heads: members.reduce((sum, attendee) => sum + 1 + attendee.extras, 0),
+      },
+    ];
+  });
+}
+
+/**
+ * The stops a legacy train made, as far as its route and current stop say (`currentGym`, past
+ * the end once finished), without times: as for a live train of which no step was seen. A skip
+ * cannot be told from a stop made: the files keep only where the train was.
+ */
+function stopsOf(raw: Raw, context: LegacyContext): HistoryStop[] {
+  const route = (Array.isArray(raw.route) ? raw.route : [])
+    .map(numberOf)
+    .filter((id): id is number => id !== undefined);
+  const at = numberOf(raw.currentGym) ?? 0;
+  const made = stopsByRoute(route, at, timeOf(raw.startTime), context.now);
+  return made.map((id) => ({
+    gymId: context.gymExists(id) ? id : null,
+    legacyGymId: id,
+    arrivedAt: null,
+    leftAt: null,
+  }));
+}
+
+/**
+ * What the import's first pass reads of a party: its key (as `legacyRecord` makes it), when it
+ * was deleted (0 when the file does not say: of two copies of a party the later deletion wins)
+ * and its region channel. Undefined for what has no key.
+ */
+export function legacyIdentity(
+  raw: unknown,
+): { key: string; deletionTime: number; sourceChannelId: string | null } | undefined {
+  if (!isRaw(raw)) return undefined;
+  const createdAt = timeOf(raw.creationTime);
+  const channelId = typeof raw.channelId === 'string' ? raw.channelId : '';
+  if (createdAt === null || !isSnowflake(channelId)) return undefined;
+  const source = typeof raw.sourceChannelId === 'string' ? raw.sourceChannelId : '';
+  return {
+    key: `${channelId}:${String(createdAt)}`,
+    deletionTime: timeOf(raw.deletionTime) ?? 0,
+    sourceChannelId: isSnowflake(source) ? source : null,
+  };
+}
+
+/**
+ * The record of a party of the legacy files, or why it is skipped. Its key is its channel and
+ * creation time (`<channel>:<ms>`): a raid the files hold twice is one raid, and a second import
+ * finds it there already.
+ */
+export function legacyRecord(raw: unknown, context: LegacyContext): LegacyRead {
+  if (!isRaw(raw)) return { ok: false, reason: 'not-a-party' };
+  const kind = typeof raw.type === 'string' ? KINDS[raw.type] : undefined;
+  if (kind === undefined) return { ok: false, reason: 'unknown-kind' };
+  const createdAt = timeOf(raw.creationTime);
+  if (createdAt === null) return { ok: false, reason: 'no-creation-time' };
+  const channelId = typeof raw.channelId === 'string' ? raw.channelId : '';
+  if (!isSnowflake(channelId)) return { ok: false, reason: 'no-channel' };
+  const attendees = attendeesOf(raw);
+  if (context.part === 'active') {
+    const creator = raw.createdById;
+    if (!(typeof creator === 'string' && isSnowflake(creator)) && typeof creator !== 'number') {
+      return { ok: false, reason: 'no-creator' };
+    }
+    if (attendees.length === 0) return { ok: false, reason: 'no-attendees' };
+  }
+  const source = typeof raw.sourceChannelId === 'string' ? raw.sourceChannelId : '';
+  const region = isSnowflake(source) ? context.regionOf(source) : undefined;
+  const serverId = region?.serverId ?? context.fallbackServerId;
+  if (serverId === undefined) return { ok: false, reason: 'no-server' };
+
+  const pokemon = isRaw(raw.pokemon) ? raw.pokemon : {};
+  const raid = kind === 'raid';
+  const tier = raid ? tierOf(raw, pokemon) : null;
+  const legacyGymId = raid ? (numberOf(raw.gymId) ?? null) : null;
+  const ended =
+    context.part === 'active'
+      ? 'cutover'
+      : attendees.some((attendee) => attendee.status === 'done')
+        ? 'completed'
+        : 'unknown';
+  return {
+    ok: true,
+    byFallback: region === undefined,
+    record: {
+      source: 'legacy',
+      partyId: null,
+      legacyKey: `${channelId}:${String(createdAt)}`,
+      kind,
+      serverId,
+      regionId: region?.regionId ?? null,
+      gymId: legacyGymId !== null && context.gymExists(legacyGymId) ? legacyGymId : null,
+      legacyGymId,
+      name:
+        kind === 'train'
+          ? textOf(raw.trainName)
+          : kind === 'meetup'
+            ? textOf(raw.meetupName)
+            : null,
+      description: kind === 'meetup' ? textOf(raw.description, 4000) : null,
+      tier,
+      shadow: false,
+      mega: tier === 'Mega' || tier === 'MegaLegendary',
+      elite: tier === 'Elite',
+      ex: tier === 'EX',
+      shiny: pokemon.shiny === true ? true : null,
+      boss: raid || isRaw(raw.pokemon) ? context.boss(raw.pokemon) : null,
+      fastMove: textOf(raw.quickMove, 64),
+      chargedMove: textOf(raw.cinematicMove, 64),
+      createdAt,
+      hatchTime: raid ? timeOf(raw.hatchTime) : null,
+      startTime: raid ? null : timeOf(raw.startTime),
+      endTime: timeOf(raw.endTime),
+      endedAt:
+        context.part === 'active'
+          ? null
+          : (timeOf(raw.deletionTime) ?? timeOf(raw.lastPossibleTime)),
+      ending: ended,
+      createdById: null,
+      conductorId: null,
+      anonymous: false,
+      routeStops: kind === 'train' ? (Array.isArray(raw.route) ? raw.route.length : 0) : null,
+      attendees,
+      groups: groupsOf(raw, attendees),
+      stops: kind === 'train' ? stopsOf(raw, context) : [],
+    },
+  };
+}
+
+/** Names the legacy bot gave an egg or a raid whose boss nobody had named. */
+const NO_BOSS = new Set(['pokemon', 'egg', 'mega', 'elite']);
+
+/**
+ * The boss of a legacy raid, from what its file kept (`pokemon`: a name as the bot spelled it in
+ * its year, a form word, the Pokédex number): by number and form where both are there, else by
+ * the name as members search for it, the legacy name, and the number; a name none of these finds
+ * is kept as it was. An egg has none. The answers are remembered: the files name a few hundred
+ * bosses a quarter of a million times.
+ */
+export function legacyBossResolver(
+  catalogue: PokemonCatalogue,
+): (pokemon: unknown) => HistoryBoss | null {
+  const search = new PokemonSearch(catalogue);
+  const known = new Map<string, HistoryBoss | null>();
+  const find = (name: string, form: string | null, dex: number | undefined): HistoryBoss => {
+    if (dex !== undefined && form !== null && form !== 'normal') {
+      const entry = catalogue
+        .byDex(dex)
+        .find((e) => e.form?.toLowerCase() === `${e.pokemonId}_${form}`.toLowerCase());
+      if (entry) return historyBoss(entry);
+    }
+    const entry =
+      search.exact(name) ??
+      catalogue.byKey(keyForLegacyName(name).replace(/[^a-z0-9]+/gu, '_')) ??
+      catalogue.byKey(keyForLegacyName(name)) ??
+      (dex === undefined ? undefined : catalogue.species(dex));
+    return entry ? historyBoss(entry) : { name: [...name].slice(0, 100).join('') };
+  };
+  return (pokemon) => {
+    if (!isRaw(pokemon) || typeof pokemon.name !== 'string') return null;
+    const name = pokemon.name.trim();
+    if (name === '' || NO_BOSS.has(name.toLowerCase())) return null;
+    const form = typeof pokemon.form === 'string' ? pokemon.form.trim().toLowerCase() : null;
+    const dex = numberOf(pokemon.number);
+    const memo = `${name}|${form ?? ''}|${String(dex ?? '')}`;
+    if (!known.has(memo)) known.set(memo, find(name, form, dex));
+    return known.get(memo) ?? null;
+  };
+}
diff --git a/src/domain/history/party-history.ts b/src/domain/history/party-history.ts
index 47981307d1b3ca8cc7dbdfdc2c841d52abb780d2..c22272e72bafa59b4b5840a0cc5211b7e4378ea5 100644
--- a/src/domain/history/party-history.ts
+++ b/src/domain/history/party-history.ts
@@ -9,6 +9,7 @@ import {
   type Team,
 } from '../party/party.js';
 import { PartyStatus } from '../party/status.js';
+import type { PokemonEntry } from '../pogo/game-master.js';
 import { currentStop, placeOf } from '../party/train.js';
 
 /*
@@ -53,6 +54,13 @@ export type PartyEnd =
 export type HistoryBoss =
   { key: string; dex: number; species: string; form: string | null } | { name: string };
 
+/** A catalogue entry as the history keeps a boss: a mega's form is its species and evolution. */
+export function historyBoss(entry: PokemonEntry): HistoryBoss {
+  const form =
+    entry.form ?? (entry.tempEvolution ? `${entry.pokemonId}_${entry.tempEvolution}` : null);
+  return { key: entry.key, dex: entry.dex, species: entry.pokemonId, form };
+}
+
 export interface HistoryAttendee {
   /** Only with the member's opt-in; null otherwise (the row still counts). */
   memberId: string | null;
diff --git a/src/ops/history-import-cli.ts b/src/ops/history-import-cli.ts
new file mode 100644
index 0000000000000000000000000000000000000000..733624a635baba21f5d4099db9b696e5599af629
--- /dev/null
+++ b/src/ops/history-import-cli.ts
@@ -0,0 +1,53 @@
+import { ConfigError, loadConfig, type Config } from '../config/index.js';
+import { dbConfigFrom } from '../db/db-config.js';
+import { createDb } from '../db/kysely.js';
+import type { DB } from '../db/types.js';
+import { createLogger } from '../log.js';
+import { GameDataService } from '../services/game-data-service.js';
+import { importStep } from './history-import.js';
+
+// The import of the legacy bot's parties into the party history (plan 8H):
+//   npm run history:import -- <legacy parties folder> [--server <server id>]
+//   ./pine import-history <legacy parties folder> [--server <server id>]   (mounted read-only)
+// It reads the folder and writes the history tables; it never logs in to Discord. The game data
+// (for the bosses) is the bot's saved copy, downloaded as the bot does when there is none. The
+// logic, and its exit codes, are `importStep`.
+
+/** Where the bot keeps its parsed game data (`src/app.ts`). */
+const GAME_DATA_CACHE = 'var/game-data-cache.json';
+const HOUR_MS = 3_600_000;
+
+let config: Config;
+try {
+  config = loadConfig(process.env);
+} catch (err) {
+  process.stderr.write(`${err instanceof ConfigError ? err.message : String(err)}\n`);
+  process.exit(1);
+}
+const log = createLogger({ level: config.env.LOG_LEVEL, pretty: false });
+const db = createDb<DB>(dbConfigFrom(config.env));
+const gameData = new GameDataService({
+  gameMasterUrl: config.settings.gameData.gameMasterUrl,
+  textUrl: config.settings.gameData.textUrl,
+  iconsUrl: config.settings.gameData.iconsUrl,
+  cachePath: GAME_DATA_CACHE,
+  maxAgeMs: config.settings.gameData.refreshHours * HOUR_MS,
+  fetch: (url, init) => fetch(url, init),
+  log,
+});
+try {
+  process.exitCode = await importStep(process.argv.slice(2), {
+    db,
+    loadCatalogue: async () => {
+      await gameData.load();
+      return gameData.catalogue;
+    },
+    say: (line) => process.stdout.write(`${line}\n`),
+  });
+} catch (err) {
+  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
+  process.exitCode = 1;
+} finally {
+  gameData.stop();
+  await db.destroy();
+}
diff --git a/src/ops/history-import.db.test.ts b/src/ops/history-import.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..23751fb86423cf0bc64fb59c426dabf0acdd2955
--- /dev/null
+++ b/src/ops/history-import.db.test.ts
@@ -0,0 +1,284 @@
+import path from 'node:path';
+import { sql, type Kysely } from 'kysely';
+import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../test/support/game-data.js';
+import { startMigratedDatabase } from '../../test/support/migrated-db.js';
+import { HistoryRepository } from '../db/repositories/history-repository.js';
+import type { DB } from '../db/types.js';
+import type { HistoryRecord } from '../domain/history/party-history.js';
+import { importLegacyHistory, importReport, importStep } from './history-import.js';
+
+/** Invented legacy files: three of `complete/` (one broken), five of `active/`. */
+const FIXTURE = path.resolve(import.meta.dirname, '../../test/fixtures/legacy-parties');
+const HOME = '412345678901234567';
+const AWAY = '412345678901234568';
+/** The members the fixtures name: none of them may be kept anywhere. */
+const MEMBERS = [1, 2, 3, 4, 5].map((n) => `32000000000000000${String(n)}`);
+
+describe('the import of the legacy parties into the history', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+
+  beforeAll(async () => {
+    ({ db, stop } = await startMigratedDatabase());
+  });
+  afterAll(async () => {
+    await stop();
+  });
+  beforeEach(async () => {
+    await db.deleteFrom('PartyHistory').execute();
+    await db.deleteFrom('Guild').execute();
+    await db.deleteFrom('Gym').execute();
+    // Two servers, as after the new bot joined another: the files' regions are all HOME's.
+    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
+    await sql`insert into Region (id, guildId, channelId) values (3, 1, 300000000000000001)`.execute(
+      db,
+    );
+    await sql`insert into Gym (id, name) values (1, 'Fountain'), (2, 'Library')`.execute(db);
+  });
+
+  const run = (more: Partial<Parameters<typeof importLegacyHistory>[0]> = {}) =>
+    importLegacyHistory({ dir: FIXTURE, db, catalogue: catalogueFixture(), batchSize: 2, ...more });
+  const imported = () =>
+    db
+      .selectFrom('PartyHistory')
+      .select(['kind', 'ending', 'serverId', 'tier', 'bossKey', 'bossName', 'gymId', 'legacyGymId'])
+      .orderBy('createdAt')
+      .execute();
+
+  it('imports what it can read, once, and counts what it could not', async () => {
+    const first = await run();
+    expect(first).toEqual({
+      files: { complete: 3, active: 5, unreadable: { 'not JSON': 1 } },
+      read: 10,
+      imported: 6,
+      alreadyThere: 0,
+      duplicates: 2,
+      skipped: { 'no-attendees': 1, 'no-creator': 1 },
+      writeFailed: 0,
+      withoutRegion: 1,
+      byFallback: 1,
+      gymsGone: 3,
+      bossesByName: 1,
+      bossNames: ['Unheardofmon'],
+    });
+    const second = await run({ batchSize: 100 });
+    expect(second).toMatchObject({ read: 10, imported: 0, alreadyThere: 6, duplicates: 2 });
+    expect(await imported()).toEqual([
+      // 2018: an egg of tier 3 (its copy left in active/ is the same raid), how it ended unknown.
+      {
+        kind: 'raid',
+        ending: 'unknown',
+        serverId: HOME,
+        tier: 'T3',
+        bossKey: null,
+        bossName: null,
+        gymId: 1,
+        legacyGymId: 1,
+      },
+      // Its region is gone: the server is the one of every region the files named.
+      {
+        kind: 'raid',
+        ending: 'unknown',
+        serverId: HOME,
+        tier: null,
+        bossKey: null,
+        bossName: 'Unheardofmon',
+        gymId: null,
+        legacyGymId: 999,
+      },
+      {
+        kind: 'raid',
+        ending: 'completed',
+        serverId: HOME,
+        tier: 'Mega',
+        bossKey: 'charizard_mega_x',
+        bossName: null,
+        gymId: null,
+        legacyGymId: 999,
+      },
+      // The later of its two copies: the one deleted last.
+      {
+        kind: 'raid',
+        ending: 'completed',
+        serverId: HOME,
+        tier: 'T5',
+        bossKey: 'giratina_altered',
+        bossName: null,
+        gymId: 1,
+        legacyGymId: 1,
+      },
+      {
+        kind: 'meetup',
+        ending: 'cutover',
+        serverId: HOME,
+        tier: null,
+        bossKey: null,
+        bossName: null,
+        gymId: null,
+        legacyGymId: null,
+      },
+      {
+        kind: 'train',
+        ending: 'cutover',
+        serverId: HOME,
+        tier: null,
+        bossKey: null,
+        bossName: null,
+        gymId: null,
+        legacyGymId: null,
+      },
+    ]);
+  });
+
+  it('keeps no member of the legacy files in any column of the history', async () => {
+    await run();
+    const rows = await Promise.all(
+      ['PartyHistory', 'PartyHistoryAttendee', 'PartyHistoryGroup', 'PartyHistoryStop'].map(
+        async (table) => (await sql`select * from ${sql.table(table)}`.execute(db)).rows,
+      ),
+    );
+    const everything = JSON.stringify(rows);
+    for (const member of MEMBERS) expect(everything).not.toContain(member);
+    expect(everything).toContain('Ask @member or @member.');
+    expect(everything).toContain('Ride with @member');
+  });
+
+  it('keeps the groups and the stops the files tell of', async () => {
+    await run();
+    const groups = await db
+      .selectFrom('PartyHistoryGroup as g')
+      .innerJoin('PartyHistory as h', 'h.id', 'g.historyId')
+      .select(['g.groupId', 'g.label', 'g.meetingTime', 'g.members', 'g.heads'])
+      .where('h.bossKey', 'in', ['giratina_altered', 'charizard_mega_x'])
+      .orderBy('h.createdAt')
+      .orderBy('g.groupId')
+      .execute();
+    expect(groups).toEqual([
+      { groupId: 'A', label: null, meetingTime: '1600002000000', members: 2, heads: 4 },
+      { groupId: 'A', label: null, meetingTime: null, members: 2, heads: 3 },
+      { groupId: 'B', label: 'After work', meetingTime: '1650002400000', members: 1, heads: 1 },
+    ]);
+    expect(
+      await db
+        .selectFrom('PartyHistoryStop')
+        .select(['seq', 'gymId', 'legacyGymId'])
+        .orderBy('seq')
+        .execute(),
+    ).toEqual([
+      { seq: 0, gymId: 1, legacyGymId: 1 },
+      { seq: 1, gymId: null, legacyGymId: 999 },
+    ]);
+  });
+
+  it('takes the server it is told, and refuses one the database does not know', async () => {
+    const told = await run({ server: AWAY });
+    expect(told.byFallback).toBe(1);
+    expect((await imported()).map((row) => row.serverId)).toContain(AWAY);
+    await expect(run({ server: '499999999999999999' })).rejects.toThrow(
+      /no server 499999999999999999 in the database/u,
+    );
+  });
+
+  it("matches no gym on a database that was not the legacy bot's", async () => {
+    await sql`drop table knex_migrations`.execute(db);
+    try {
+      await run();
+      expect((await imported()).map((row) => row.gymId)).toEqual([
+        null,
+        null,
+        null,
+        null,
+        null,
+        null,
+      ]);
+    } finally {
+      await sql`create table knex_migrations (id int unsigned not null auto_increment primary key,
+                name varchar(255), batch int, migration_time timestamp null)`.execute(db);
+    }
+  });
+
+  it('goes on past a batch it cannot write, record by record, and a second run finishes it', async () => {
+    const history = new HistoryRepository(db);
+    let refused = 0;
+    const failing = {
+      insertRecords: async (records: readonly HistoryRecord[]) => {
+        if (records.some((record) => record.kind === 'meetup')) {
+          refused++;
+          throw new Error('the database is busy');
+        }
+        return history.insertRecords(records);
+      },
+    };
+    const first = await run({ history: failing });
+    expect(first).toMatchObject({ imported: 5, writeFailed: 1 });
+    expect(refused).toBe(2);
+    const second = await run();
+    expect(second).toMatchObject({ imported: 1, alreadyThere: 5, writeFailed: 0 });
+  });
+
+  it('says what it did in a few lines', async () => {
+    expect(importReport(await run(), 12_345)).toEqual([
+      'Read 3 files of complete/ and 5 of active/; 1 could not be read (1 not JSON).',
+      'Parties read: 10. Imported: 6. Already there: 0. In the files twice: 2. Not written: 0.',
+      'Skipped: 1 without a maker (active/), 1 without attendees (active/).',
+      'Without their region: 1 (put in the server of the other regions: 1). At a gym no longer in the gym list: 3. Boss kept by its name: 1 (1 name).',
+      'Took 12.3 s.',
+    ]);
+  });
+});
+
+describe('importStep: the command', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+  let lines: string[];
+  let loads: number;
+  const say = (line: string) => {
+    lines.push(line);
+  };
+  const loadCatalogue = () => {
+    loads++;
+    return Promise.resolve(catalogueFixture());
+  };
+
+  beforeAll(async () => {
+    ({ db, stop } = await startMigratedDatabase());
+    await sql`insert into Guild (id, snowflake) values (1, ${HOME})`.execute(db);
+  });
+  afterAll(async () => {
+    await stop();
+  });
+  beforeEach(() => {
+    lines = [];
+    loads = 0;
+  });
+
+  it('imports a folder and says how it went', async () => {
+    expect(await importStep([FIXTURE], { db, loadCatalogue, say })).toBe(0);
+    expect(lines[0]).toBe(`Importing the legacy parties of ${FIXTURE} into the party history.`);
+    expect(lines.at(-1)).toMatch(/^Took \d+\.\d s\.$/u);
+  });
+
+  it('asks for a folder, and refuses one that is no parties folder before it loads anything', async () => {
+    expect(await importStep([], { db, loadCatalogue, say })).toBe(2);
+    expect(await importStep([path.join(FIXTURE, 'active')], { db, loadCatalogue, say })).toBe(1);
+    expect(lines.at(-1)).toMatch(/has neither active\/ nor complete\//u);
+    expect(loads).toBe(0);
+  });
+
+  it('fails when it could read no file at all', async () => {
+    const broken = path.resolve(FIXTURE, '../legacy-parties-broken');
+    expect(await importStep([broken], { db, loadCatalogue, say })).toBe(1);
+    expect(lines.at(-1)).toBe('No file of the folder could be read: nothing was imported.');
+  });
+
+  it('refuses a database without the history tables', async () => {
+    await sql`drop table PartyHistoryAttendee, PartyHistoryGroup, PartyHistoryStop, PartyHistory`.execute(
+      db,
+    );
+    expect(await importStep([FIXTURE], { db, loadCatalogue, say })).toBe(1);
+    expect(lines.at(-1)).toBe(
+      'The database has no party history yet: run the migrations first (./pine migrate, or npm run migrate).',
+    );
+  });
+});
diff --git a/src/ops/history-import.ts b/src/ops/history-import.ts
new file mode 100644
index 0000000000000000000000000000000000000000..67a8d6b28324be20ec7df8249b5f17d4ae0b9e07
--- /dev/null
+++ b/src/ops/history-import.ts
@@ -0,0 +1,327 @@
+import { sql, type Kysely } from 'kysely';
+import { HistoryRepository, type RecordsWritten } from '../db/repositories/history-repository.js';
+import type { DB } from '../db/types.js';
+import {
+  LEGACY_SKIPS,
+  legacyBossResolver,
+  legacyIdentity,
+  legacyRecord,
+  type LegacyContext,
+  type LegacySkip,
+} from '../domain/history/legacy-party.js';
+import type { HistoryRecord } from '../domain/history/party-history.js';
+import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
+import { legacyFolderProblem, legacyPartyFiles } from './legacy-parties.js';
+
+/** As many records as one transaction writes. */
+const BATCH = 1_000;
+/** How often the import says how far it got, in parties read. */
+const PROGRESS_EVERY = 25_000;
+
+/** What an import did, in counts (it never says anything of a party itself). */
+export interface ImportCounts {
+  /** Files read, and those that could not be, by why. */
+  files: { complete: number; active: number; unreadable: Record<string, number> };
+  /** Parties in the files that could be read. */
+  read: number;
+  imported: number;
+  /** Found in the history already (an import before this one). */
+  alreadyThere: number;
+  /** The same party a second time in the files (the legacy bot stored some twice). */
+  duplicates: number;
+  skipped: Partial<Record<LegacySkip, number>>;
+  /** Records the database refused, also one by one (their batch failed). */
+  writeFailed: number;
+  /** Imported without a region: their region channel is no region now. */
+  withoutRegion: number;
+  /** Of those, put in the fallback server (`--server`, or the one of the other regions). */
+  byFallback: number;
+  /** Imported raids and train stops at a gym the gym list no longer has (or not matched). */
+  gymsGone: number;
+  /** Imported raids whose boss the catalogue did not find, kept by the name the file gave. */
+  bossesByName: number;
+  /** Those names, each once, sorted. */
+  bossNames: string[];
+}
+
+/** Where the records go (`HistoryRepository`; a test gives one that fails as it needs). */
+export interface RecordWriter {
+  insertRecords(records: readonly HistoryRecord[]): Promise<RecordsWritten>;
+}
+
+export interface ImportOptions {
+  /** The legacy bot's `parties/` folder (with `active/` and `complete/`). */
+  dir: string;
+  db: Kysely<DB>;
+  catalogue: PokemonCatalogue;
+  /** The server (snowflake) of a party whose region is gone; else the one of the files' regions. */
+  server?: string;
+  batchSize?: number;
+  /** Told how far it got now and then. */
+  progress?: (line: string) => void;
+  history?: RecordWriter;
+  now?: number;
+}
+
+/** Whether the database is one taken over from the legacy bot, whose gym ids the files name. */
+async function takenOver(db: Kysely<DB>): Promise<boolean> {
+  const found = await sql<{ n: number }>`
+    select count(*) as n from information_schema.tables
+    where table_schema = database() and table_name = 'knex_migrations'`.execute(db);
+  return Number(found.rows[0]?.n ?? 0) > 0;
+}
+
+/**
+ * Imports the legacy bot's parties into the party history (plan 8H, T4): the ended raids of
+ * `complete/` and the parties of `active/` that were going on at the cutover (`legacyRecord`),
+ * without any member id. Best effort and idempotent: what cannot be read is counted and left,
+ * and a party the history has already (by its key) is not written again.
+ *
+ * Two passes over the folder: the first learns which region channels the files name (the
+ * fallback server is the one server of those that are regions now, unless `server` says) and,
+ * of a party the files hold twice, which copy was deleted last; the second writes, in batches of
+ * one transaction each, so a stop half-way leaves whole batches that a second run skips. A batch
+ * the database refuses is written again record by record, and a record it still refuses is
+ * counted (`writeFailed`) and left for a later run.
+ */
+export async function importLegacyHistory(options: ImportOptions): Promise<ImportCounts> {
+  const { dir, db } = options;
+  const problem = legacyFolderProblem(dir);
+  if (problem !== undefined) throw new Error(problem);
+  const batchSize = options.batchSize ?? BATCH;
+  const history = options.history ?? new HistoryRepository(db);
+
+  const regions = new Map<string, { regionId: number; serverId: string }>();
+  const rows = await db
+    .selectFrom('Region as r')
+    .innerJoin('Guild as g', 'g.id', 'r.guildId')
+    .select(['r.id', 'r.channelId', 'g.snowflake'])
+    .execute();
+  for (const row of rows) {
+    if (row.channelId !== null && row.snowflake !== null) {
+      regions.set(row.channelId, { regionId: row.id, serverId: row.snowflake });
+    }
+  }
+  if (options.server !== undefined) {
+    const known = await db
+      .selectFrom('Guild')
+      .select('id')
+      .where('snowflake', '=', options.server)
+      .executeTakeFirst();
+    if (!known) throw new Error(`There is no server ${options.server} in the database.`);
+  }
+  const gyms = (await takenOver(db))
+    ? new Set((await db.selectFrom('Gym').select('id').execute()).map((row) => row.id))
+    : new Set<number>();
+
+  // The first pass: the regions the files name, and the copy of a party that was deleted last.
+  const named = new Set<string>();
+  const latest = new Map<string, number>();
+  for (const file of legacyPartyFiles(dir)) {
+    if ('unreadable' in file) continue;
+    for (const party of file.parties) {
+      const identity = legacyIdentity(party);
+      if (!identity) continue;
+      if (identity.sourceChannelId !== null) named.add(identity.sourceChannelId);
+      latest.set(identity.key, Math.max(latest.get(identity.key) ?? -1, identity.deletionTime));
+    }
+  }
+  const servers = new Set(
+    [...named].flatMap((channelId) => {
+      const region = regions.get(channelId);
+      return region ? [region.serverId] : [];
+    }),
+  );
+  const fallbackServerId = options.server ?? (servers.size === 1 ? [...servers][0] : undefined);
+
+  const boss = legacyBossResolver(options.catalogue);
+  const counts: ImportCounts = {
+    files: { complete: 0, active: 0, unreadable: {} },
+    read: 0,
+    imported: 0,
+    alreadyThere: 0,
+    duplicates: 0,
+    skipped: {},
+    writeFailed: 0,
+    withoutRegion: 0,
+    byFallback: 0,
+    gymsGone: 0,
+    bossesByName: 0,
+    bossNames: [],
+  };
+  const names = new Set<string>();
+  const taken = new Set<string>();
+  let batch: HistoryRecord[] = [];
+  /** Writes the batch and counts what it did; a refused batch record by record. */
+  const flush = async () => {
+    if (batch.length === 0) return;
+    const records = batch;
+    batch = [];
+    try {
+      const written = await history.insertRecords(records);
+      counts.imported += written.inserted;
+      counts.alreadyThere += written.existing;
+    } catch {
+      for (const record of records) {
+        try {
+          const written = await history.insertRecords([record]);
+          counts.imported += written.inserted;
+          counts.alreadyThere += written.existing;
+        } catch {
+          counts.writeFailed += 1;
+        }
+      }
+    }
+  };
+
+  for (const file of legacyPartyFiles(dir)) {
+    counts.files[file.part] += 1;
+    if ('unreadable' in file) {
+      counts.files.unreadable[file.unreadable] =
+        (counts.files.unreadable[file.unreadable] ?? 0) + 1;
+      continue;
+    }
+    const context: LegacyContext = {
+      part: file.part,
+      regionOf: (channelId) => regions.get(channelId),
+      fallbackServerId,
+      gymExists: (id) => gyms.has(id),
+      boss,
+      now: options.now ?? Date.now(),
+    };
+    for (const party of file.parties) {
+      counts.read += 1;
+      if (counts.read % PROGRESS_EVERY === 0) {
+        options.progress?.(`… ${counts.read.toLocaleString('en-US')} parties read`);
+      }
+      const identity = legacyIdentity(party);
+      if (identity) {
+        // Of two copies of a party only the one deleted last is taken (the first such).
+        if (taken.has(identity.key) || identity.deletionTime !== latest.get(identity.key)) {
+          counts.duplicates += 1;
+          continue;
+        }
+      }
+      const read = legacyRecord(party, context);
+      if (!read.ok) {
+        counts.skipped[read.reason] = (counts.skipped[read.reason] ?? 0) + 1;
+        continue;
+      }
+      const { record } = read;
+      taken.add(record.legacyKey ?? '');
+      if (record.regionId === null) counts.withoutRegion += 1;
+      if (read.byFallback) counts.byFallback += 1;
+      if (record.legacyGymId !== null && record.gymId === null) counts.gymsGone += 1;
+      counts.gymsGone += record.stops.filter((stop) => stop.gymId === null).length;
+      if (record.boss !== null && 'name' in record.boss) {
+        counts.bossesByName += 1;
+        names.add(record.boss.name);
+      }
+      batch.push(record);
+      if (batch.length >= batchSize) await flush();
+    }
+  }
+  await flush();
+  counts.bossNames = [...names].sort();
+  return counts;
+}
+
+const SKIP_WORDS: Readonly<Record<LegacySkip, string>> = {
+  'not-a-party': 'not a party',
+  'unknown-kind': 'of a kind it does not know',
+  'no-creation-time': 'without a creation time',
+  'no-channel': 'without a channel',
+  'no-creator': 'without a maker (active/)',
+  'no-attendees': 'without attendees (active/)',
+  'no-server': 'of no known server',
+};
+
+const n = (value: number): string => value.toLocaleString('en-US');
+
+/** What an import did, in a few lines for the operator. `ms`: how long it took. */
+export function importReport(counts: ImportCounts, ms: number): string[] {
+  const skipped = LEGACY_SKIPS.filter((reason) => (counts.skipped[reason] ?? 0) > 0).map(
+    (reason) => `${n(counts.skipped[reason] ?? 0)} ${SKIP_WORDS[reason]}`,
+  );
+  const unreadable = Object.entries(counts.files.unreadable);
+  const failed = unreadable.reduce((sum, [, count]) => sum + count, 0);
+  const why = unreadable.map(([reason, count]) => `${n(count)} ${reason}`).join(', ');
+  const named = counts.bossNames.length;
+  return [
+    `Read ${n(counts.files.complete)} files of complete/ and ${n(counts.files.active)} of active/; ${n(failed)} could not be read${failed > 0 ? ` (${why})` : ''}.`,
+    `Parties read: ${n(counts.read)}. Imported: ${n(counts.imported)}. Already there: ${n(counts.alreadyThere)}. In the files twice: ${n(counts.duplicates)}. Not written: ${n(counts.writeFailed)}.`,
+    skipped.length === 0 ? 'Skipped: none.' : `Skipped: ${skipped.join(', ')}.`,
+    `Without their region: ${n(counts.withoutRegion)} (put in the server of the other regions: ${n(counts.byFallback)}). At a gym no longer in the gym list: ${n(counts.gymsGone)}. Boss kept by its name: ${n(counts.bossesByName)} (${n(named)} ${named === 1 ? 'name' : 'names'}).`,
+    `Took ${(ms / 1000).toFixed(1)} s.`,
+  ];
+}
+
+export interface ImportStepDeps {
+  db: Kysely<DB>;
+  /** The game data's catalogue, loaded only once the folder and the database are known good. */
+  loadCatalogue: () => Promise<PokemonCatalogue>;
+  say: (line: string) => void;
+  now?: () => number;
+}
+
+const USAGE = "Usage: history-import <the legacy bot's parties folder> [--server <server id>]";
+
+/**
+ * The command (`npm run history:import`, `./pine import-history`): `<folder> [--server <id>]`.
+ * Answers its exit code: 0 done, 1 refused or failed (said why), 2 used wrongly.
+ */
+export async function importStep(args: readonly string[], deps: ImportStepDeps): Promise<number> {
+  const { db, say } = deps;
+  const now = deps.now ?? (() => Date.now());
+  const [dir, ...rest] = args;
+  let server: string | undefined;
+  if (rest.length === 2 && rest[0] === '--server' && /^\d{15,20}$/u.test(rest[1] ?? '')) {
+    server = rest[1];
+  } else if (rest.length > 0) {
+    say(USAGE);
+    return 2;
+  }
+  if (dir === undefined || dir.startsWith('-')) {
+    say(USAGE);
+    return 2;
+  }
+  const problem = legacyFolderProblem(dir);
+  if (problem !== undefined) {
+    say(problem);
+    return 1;
+  }
+  const tables = await sql<{ n: number }>`
+    select count(*) as n from information_schema.tables
+    where table_schema = database() and table_name = 'PartyHistory'`.execute(db);
+  if (Number(tables.rows[0]?.n ?? 0) === 0) {
+    say(
+      'The database has no party history yet: run the migrations first (./pine migrate, or npm run migrate).',
+    );
+    return 1;
+  }
+  const catalogue = await deps.loadCatalogue();
+  say(`Importing the legacy parties of ${dir} into the party history.`);
+  const started = now();
+  let counts: ImportCounts;
+  try {
+    counts = await importLegacyHistory({
+      dir,
+      db,
+      catalogue,
+      ...(server === undefined ? {} : { server }),
+      progress: say,
+      now: started,
+    });
+  } catch (err) {
+    say(err instanceof Error ? err.message : String(err));
+    return 1;
+  }
+  for (const line of importReport(counts, now() - started)) say(line);
+  const files = counts.files.complete + counts.files.active;
+  const unreadable = Object.values(counts.files.unreadable).reduce((sum, count) => sum + count, 0);
+  if (files > 0 && unreadable === files) {
+    say('No file of the folder could be read: nothing was imported.');
+    return 1;
+  }
+  return counts.writeFailed > 0 ? 1 : 0;
+}
diff --git a/src/ops/legacy-parties.ts b/src/ops/legacy-parties.ts
new file mode 100644
index 0000000000000000000000000000000000000000..94ad71e15480bcc54757a0cfcaddd82e2bc12835
--- /dev/null
+++ b/src/ops/legacy-parties.ts
@@ -0,0 +1,71 @@
+import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
+import path from 'node:path';
+
+/*
+ * The legacy bot's `parties/` folder (node-persist): `active/` holds a file per party that had
+ * not ended, `complete/` a file per gym with the list of every raid that ended there. Each file
+ * is JSON, `{ key, value }`, without an extension. The files hold member ids and names: what
+ * reads them keeps only what it needs (the party history keeps no member; the cleanup of plan 8C
+ * the channel ids) and never prints a party.
+ *
+ * Plan 8C's reader of `active/` for the cleanup of legacy channels (`readLegacyActive`) belongs
+ * here too and can go over `legacyPartyFiles`; the two plans were prototyped side by side.
+ */
+
+export type LegacyPart = 'active' | 'complete';
+
+/**
+ * A file of the folder: the parties in it, or why it could not be read (`not JSON`, `not a
+ * record`, or the file system's code: `cannot be read (EACCES)`).
+ */
+export type LegacyPartyFile =
+  | { part: LegacyPart; file: string; parties: unknown[] }
+  | { part: LegacyPart; file: string; unreadable: string };
+
+function isFolder(dir: string): boolean {
+  return existsSync(dir) && statSync(dir).isDirectory();
+}
+
+/** Why a folder is not the legacy bot's `parties/` folder; undefined when it is. */
+export function legacyFolderProblem(dir: string): string | undefined {
+  if (isFolder(path.join(dir, 'active')) || isFolder(path.join(dir, 'complete'))) return undefined;
+  return `${dir} has neither active/ nor complete/: name the legacy bot's parties folder.`;
+}
+
+/**
+ * The files of the folder, `complete/` first (a party the legacy bot had written to `complete/`
+ * but not yet taken out of `active/` is the ended one), each folder in the order of its names,
+ * one file at a time (the folder of a large server is hundreds of megabytes). A value that is a
+ * list (`complete/`) gives its items; any other value is one party.
+ */
+export function* legacyPartyFiles(dir: string): Generator<LegacyPartyFile> {
+  for (const part of ['complete', 'active'] as const) {
+    const folder = path.join(dir, part);
+    if (!isFolder(folder)) continue;
+    for (const file of readdirSync(folder).sort()) {
+      const full = path.join(folder, file);
+      let text: string;
+      try {
+        if (!statSync(full).isFile()) continue;
+        text = readFileSync(full, 'utf8');
+      } catch (err) {
+        const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
+        yield { part, file, unreadable: `cannot be read (${code})` };
+        continue;
+      }
+      let content: unknown;
+      try {
+        content = JSON.parse(text);
+      } catch {
+        yield { part, file, unreadable: 'not JSON' };
+        continue;
+      }
+      if (typeof content !== 'object' || content === null || !('value' in content)) {
+        yield { part, file, unreadable: 'not a record' };
+        continue;
+      }
+      const { value } = content;
+      yield { part, file, parties: Array.isArray(value) ? value : [value] };
+    }
+  }
+}
diff --git a/src/services/party-history.ts b/src/services/party-history.ts
index 7e743992dc21796f13e59d0a485c095068667548..36542d249c9a01e586a86c00b3e43d302d9ffd90 100644
--- a/src/services/party-history.ts
+++ b/src/services/party-history.ts
@@ -1,5 +1,6 @@
 import type { HistoryStorage, UnrecordedParty } from '../db/repositories/history-repository.js';
 import {
+  historyBoss,
   historyMembers,
   historyOfParty,
   partySteps,
@@ -101,9 +102,7 @@ export class PartyHistory {
     if ('name' in ref) return { name: ref.name };
     const entry = this.options.gameData.catalogue.byKey(ref.key);
     if (!entry) return { name: ref.key };
-    const form =
-      entry.form ?? (entry.tempEvolution ? `${entry.pokemonId}_${entry.tempEvolution}` : null);
-    return { key: entry.key, dex: entry.dex, species: entry.pokemonId, form };
+    return historyBoss(entry);
   }
 
   /** Whether the boss list says a raid's boss can be shiny; null where it does not know. */
diff --git a/test/fixtures/legacy-parties-broken/complete/0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f b/test/fixtures/legacy-parties-broken/complete/0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f
new file mode 100644
index 0000000000000000000000000000000000000000..5c4d03c9ccad78be07e7c32219f535879d676998
--- /dev/null
+++ b/test/fixtures/legacy-parties-broken/complete/0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f
@@ -0,0 +1 @@
+this is no JSON
diff --git a/test/fixtures/legacy-parties/active/3d4e5f60718293a4b5c6d7e8f90a1b2c b/test/fixtures/legacy-parties/active/3d4e5f60718293a4b5c6d7e8f90a1b2c
new file mode 100644
index 0000000000000000000000000000000000000000..dfb4fff838247b10cc0282e1090a4086bb6b63a2
--- /dev/null
+++ b/test/fixtures/legacy-parties/active/3d4e5f60718293a4b5c6d7e8f90a1b2c
@@ -0,0 +1 @@
+{"key":"310000000000000005","value":{"type":"raid train","channelId":"310000000000000005","sourceChannelId":"300000000000000001","createdById":"320000000000000001","creationTime":1780000000000,"startTime":1780003600000,"trainName":"Sunday legendaries","route":[1,999,2],"currentGym":1,"conductor":null,"nextLastRun":1780000000000,"defaultGroupId":"A","groups":[{"id":"A","label":"Ride with <@!320000000000000001>"}],"attendees":{"320000000000000001":{"number":1,"status":2,"group":"A"},"320000000000000002":{"number":2,"status":1,"group":"A","remote":true}},"messages":["310000000000000005:330000000000000001"]}}
diff --git a/test/fixtures/legacy-parties/active/4e5f60718293a4b5c6d7e8f90a1b2c3d b/test/fixtures/legacy-parties/active/4e5f60718293a4b5c6d7e8f90a1b2c3d
new file mode 100644
index 0000000000000000000000000000000000000000..97fee6f8df8593c6a5f65be1885b106a678506f3
--- /dev/null
+++ b/test/fixtures/legacy-parties/active/4e5f60718293a4b5c6d7e8f90a1b2c3d
@@ -0,0 +1 @@
+{"key":"310000000000000006","value":{"type":"meet-up","channelId":"310000000000000006","sourceChannelId":"300000000000000001","createdById":"320000000000000003","creationTime":1700000000000,"meetupName":"Picnic in the park","description":"Bring something to share. Ask <@320000000000000003> or 320000000000000004.","defaultGroupId":"A","groups":[{"id":"A"}],"attendees":{"320000000000000003":{"number":1,"status":0,"group":"A"}},"messages":[]}}
diff --git a/test/fixtures/legacy-parties/active/5f60718293a4b5c6d7e8f90a1b2c3d4e b/test/fixtures/legacy-parties/active/5f60718293a4b5c6d7e8f90a1b2c3d4e
new file mode 100644
index 0000000000000000000000000000000000000000..3bec5741cb8675dbaf15c8af3f84f5035b916353
--- /dev/null
+++ b/test/fixtures/legacy-parties/active/5f60718293a4b5c6d7e8f90a1b2c3d4e
@@ -0,0 +1 @@
+{"key":"310000000000000007","value":{"type":"meet-up","channelId":"310000000000000007","sourceChannelId":"300000000000000001","createdById":"320000000000000003","creationTime":1560000000000,"meetupName":"Nobody came","defaultGroupId":"A","groups":[{"id":"A"}],"attendees":{},"messages":[]}}
diff --git a/test/fixtures/legacy-parties/active/60718293a4b5c6d7e8f90a1b2c3d4e5f b/test/fixtures/legacy-parties/active/60718293a4b5c6d7e8f90a1b2c3d4e5f
new file mode 100644
index 0000000000000000000000000000000000000000..616fe1a3c8881ed0f3db2d428c3d8c3c5fa2d752
--- /dev/null
+++ b/test/fixtures/legacy-parties/active/60718293a4b5c6d7e8f90a1b2c3d4e5f
@@ -0,0 +1 @@
+{"key":"310000000000000008","value":{"type":"raid train","channelId":"310000000000000008","sourceChannelId":"300000000000000001","creationTime":1590000000000,"trainName":"Who made this","defaultGroupId":"A","groups":[{"id":"A"}],"attendees":{"320000000000000002":{"number":1,"status":0,"group":"A"}},"messages":[]}}
diff --git a/test/fixtures/legacy-parties/active/718293a4b5c6d7e8f90a1b2c3d4e5f60 b/test/fixtures/legacy-parties/active/718293a4b5c6d7e8f90a1b2c3d4e5f60
new file mode 100644
index 0000000000000000000000000000000000000000..8d39dfd8e4bd9fab945c19c41d8936397cce291d
--- /dev/null
+++ b/test/fixtures/legacy-parties/active/718293a4b5c6d7e8f90a1b2c3d4e5f60
@@ -0,0 +1 @@
+{"key":"310000000000000002","value":{"type":"raid","channelId":"310000000000000002","sourceChannelId":"300000000000000001","createdById":"320000000000000002","creationTime":1530000000000,"gymId":1,"isExclusive":false,"endTime":"unset","pokemon":{"egg":true,"tier":3},"defaultGroupId":"A","groups":[{"id":"A"}],"attendees":{"320000000000000002":{"number":1,"status":1,"group":"A"}},"messages":[]}}
diff --git a/test/fixtures/legacy-parties/complete/0a1b2c3d4e5f60718293a4b5c6d7e8f9 b/test/fixtures/legacy-parties/complete/0a1b2c3d4e5f60718293a4b5c6d7e8f9
new file mode 100644
index 0000000000000000000000000000000000000000..53e010db48fc90909615495943a3cdf8198348e2
--- /dev/null
+++ b/test/fixtures/legacy-parties/complete/0a1b2c3d4e5f60718293a4b5c6d7e8f9
@@ -0,0 +1 @@
+{"key":"1","value":[{"type":"raid","channelId":"310000000000000001","sourceChannelId":"300000000000000001","createdById":"320000000000000001","originallyCreatedBy":"320000000000000001","creationTime":1650000000000,"gymId":1,"isExclusive":false,"hatchTime":1650001800000,"endTime":1650004500000,"lastPossibleTime":1650004500000,"deletionTime":1650005400000,"pokemon":{"name":"Giratina","form":"altered","formName":"Altered","number":487,"tier":5,"shiny":true,"weakness":[{"type":"ghost","multiplier":1.6}]},"defaultGroupId":"A","groups":[{"id":"A"},{"id":"B","label":"After work"}],"attendees":{"320000000000000001":{"number":2,"status":2,"group":"A","remote":true}}},{"type":"raid","channelId":"310000000000000002","sourceChannelId":"300000000000000001","createdById":"320000000000000002","creationTime":1530000000000,"gymId":1,"isExclusive":false,"endTime":"unset","lastPossibleTime":1530006300000,"pokemon":{"egg":true,"tier":3,"weakness":[]},"attendees":{"320000000000000002":{"number":1,"status":0}}},{"type":"raid","channelId":"310000000000000001","sourceChannelId":"300000000000000001","createdById":"320000000000000001","originallyCreatedBy":"320000000000000001","creationTime":1650000000000,"gymId":1,"isExclusive":false,"hatchTime":1650001800000,"endTime":1650004500000,"lastPossibleTime":1650004500000,"deletionTime":1650006000000,"pokemon":{"name":"Giratina","form":"altered","formName":"Altered","number":487,"tier":5,"shiny":true},"defaultGroupId":"A","groups":[{"id":"A"},{"id":"B","label":"After work","startTime":1650002400000}],"attendees":{"320000000000000001":{"number":2,"status":4,"group":"A","remote":true},"320000000000000002":{"number":1,"status":1,"group":"B"},"320000000000000003":{"number":1,"status":0,"group":"A"}}}]}
diff --git a/test/fixtures/legacy-parties/complete/1b2c3d4e5f60718293a4b5c6d7e8f90a b/test/fixtures/legacy-parties/complete/1b2c3d4e5f60718293a4b5c6d7e8f90a
new file mode 100644
index 0000000000000000000000000000000000000000..312ff51bfbb07e8d2f61e5dec89bea14ae2dc9a5
--- /dev/null
+++ b/test/fixtures/legacy-parties/complete/1b2c3d4e5f60718293a4b5c6d7e8f90a
@@ -0,0 +1 @@
+{"key":"999","value":[{"type":"raid","channelId":"310000000000000003","sourceChannelId":"300000000000000001","createdById":320000000000000000,"creationTime":1600000000000,"gymId":"999","isExclusive":false,"isMega":true,"hatchTime":1600001800000,"endTime":1600004500000,"lastPossibleTime":1600004500000,"timeWarn":true,"pokemon":{"name":"Mega Charizard X","number":"6","mega":true,"backupTier":4},"defaultGroupId":"A","groups":[{"id":"A","start_time":1600002000000}],"attendees":{"320000000000000004":{"number":"3","status":4,"group":"A"},"320000000000000005":{"number":1,"status":2,"group":"A","remote":false}}},{"type":"raid","channelId":"310000000000000004","sourceChannelId":"300000000000000099","createdById":"320000000000000004","creationTime":1570000000000,"gymId":999,"isExclusive":false,"endTime":1570004500000,"lastPossibleTime":1570004500000,"pokemon":{"name":"Unheardofmon","tier":7},"defaultGroupId":"A","groups":[{"id":"A"}],"attendees":{"320000000000000004":{"number":1,"status":3,"group":"A"}}}]}
diff --git a/test/fixtures/legacy-parties/complete/2c3d4e5f60718293a4b5c6d7e8f90a1b b/test/fixtures/legacy-parties/complete/2c3d4e5f60718293a4b5c6d7e8f90a1b
new file mode 100644
index 0000000000000000000000000000000000000000..b8339d27ac6ffa2c4e3e70027a4eeeec72a00e47
--- /dev/null
+++ b/test/fixtures/legacy-parties/complete/2c3d4e5f60718293a4b5c6d7e8f90a1b
@@ -0,0 +1 @@
+{"key":"7","value":[{"type":"raid","channelId":
````

### Task 5: Plan 8H T5: the party history's questions as SQL, tested from the doc

Prototype commit: `46c480787fd21ff9ec8bb94be28383511aface01`

docs/architecture/history.md: the tables, how live parties are recorded
(and their rows deleted once recorded, with what still reads ended
parties), the opt-in, the legacy import and the shapes of its files, and
Matt's questions as fourteen named queries (most active members; raids
per gym, region, boss and tier; which bosses drew the largest groups;
raids by hour, weekday, month and season in the server's time zone; how
fast groups filled; who signed up but never came; trains by length; the
busiest gyms for the map), with a setup that names the server by its
snowflake and the zone.

history-queries.db.test.ts reads every named block of the doc and runs
it as written against a small history (live and legacy, two servers),
checking each answer; an sql block without a name, or a query without
its answer here, fails it.

**Files:**

```
 docs/architecture/history.md                   | 215 +++++++++++++++++++++++++++++++
 src/db/repositories/history-queries.db.test.ts | 307 +++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 522 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/repositories/history-queries.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 46c480787fd21ff9ec8bb94be28383511aface01 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8h-party-history.md'` prints nothing (and file modes match: `pine` is 100755).
- [ ] **Step 5: Commit** with the title `Plan 8H T5: the party history's questions as SQL, tested from the doc`, the body above and the trailer, staging exactly
  `docs/architecture/history.md src/db/repositories/history-queries.db.test.ts`.

````diff
diff --git a/docs/architecture/history.md b/docs/architecture/history.md
new file mode 100644
index 0000000000000000000000000000000000000000..379d4cebd4fe83d70d6c134a69152ad972444728
--- /dev/null
+++ b/docs/architecture/history.md
@@ -0,0 +1,215 @@
+# The party history
+
+Every party that ends is kept in relational tables beside the live `Party` table (plan 8H; spec `2026-10-16-cutover-docker-history-design.md`, 4.3): what it was, where and when, how it ended and how many took part, in a form that plain SQL counts and groups. The legacy bot's parties are imported once from its files. Members are named only with their opt-in. Read before changing the history, its recording, the opt-in or the import, or before writing a statistic over it.
+
+## The tables (migration 018)
+
+- `PartyHistory`: one row per ended party. `source` is `live` (with `partyId`, the `Party.id`, unique) or `legacy` (with `legacyKey`, `<channel>:<creation ms>`, unique). `kind` is `raid`, `train` or `meetup`. Where: `serverId` (the server's snowflake), `regionId`, `gymId`, `legacyGymId` (the legacy file's gym, kept also when the gym list no longer has it). None of them carries a foreign key: the history outlives a server's `Guild` row (a kick and a new invite neither delete it nor split it; Matt, 2026-10-16), and a region or gym deleted later stays named by its id. What: `name` and `description` (trains and meetups), `tier` (`T1` to `T5`, `Mega`, `MegaLegendary`, `SuperMega`, `Elite`, and the legacy `T2`, `T4`, `EX`; null where not known), `shadow`, `mega`, `elite`, `ex`, `shiny` (null: not known), the boss as the catalogue knows it (`bossKey`, `bossDex`, `bossSpecies`, `bossForm`; a mega's form is `<SPECIES>_<MEGA…>`) or, where it does not, by the name it was given (`bossName`), `fastMove`, `chargedMove`. When (epoch ms): `createdAt`, `hatchTime`, `startTime` (trains and meetups), `endTime`, `endedAt` (null for the legacy parties of the cutover). How it ended: `ending` (below). Who: `createdById`, `conductorId`, only with that member's opt-in, else null; `anonymous` (the reporter asked not to be named in the post). Counts, so that the common questions need no join: `attendees` (members who signed up, also those who left), `interested`, `joined`, `here`, `done` (members by the furthest status they reached), the same with their +1s (`interestedHeads` …), `extras` (all +1s), `remote`, `departed` (left before the end); `routeStops` (a train's route at the end).
+- `PartyHistoryAttendee`: a row per member who signed up, in the order they did (`seq`): `memberId` only with their opt-in, else null (the row still counts); `status` at the end (null: they left before it), `furthest` (`interested`, `joined`, `here`, `done`; asked whether they completed it counts as `here`), `groupId`, `extras`, `remote`, `team`, and the times the bot saw (`signedUpAt`, `joinedAt`: first coming or further, `hereAt`, `doneAt`, `leftAt`; null in the legacy history).
+- `PartyHistoryGroup`: a row per group: `label`, `meetingTime` (the last one set, also after the clock cleared it), `members` and `heads` at the end.
+- `PartyHistoryStop`: a row per stop a train made, in order (`seq`; a loop makes a gym's stop twice): `gymId` (null where the gym list no longer has it, with `legacyGymId`), `arrivedAt`, `leftAt` (null where not known: the first stop is reached at the train's start when it was laid earlier; a legacy train's stops have no times).
+- `HistoryOptIn`: a row per member and server (by snowflake, no foreign key) who opted in.
+- `PartyHistoryStep`: what happens to an active party that its model does not keep (a member's status, a member who left, where a train is, a group's meeting time, the raid it went on from after a move), read into the party's record when it ends and then deleted; it goes with its `Party` row. It holds the ids of everybody in an active party, as the party's own row does, until the party ends.
+- `EndedPartyPost`: the post and forum of a party whose `Party` row was deleted once its record was written, for what still reads them (below): no member, no party id.
+
+How a party ended (`ending`): `completed` whenever it took place (somebody completed the raid, or was at the train or meetup), however it was closed; otherwise `expired` (the clock), `cancelled` (`/delete`, its region removed, its post deleted by hand), `cutover` (a legacy party still going on at the cutover), `unknown` (nobody said: a legacy raid nobody completed, whose files do not say whether it ran out or was deleted; a party the sweep at start recorded).
+
+## Recording live parties
+
+- `PartyStore` asks `PartyHistory` (`src/services/party-history.ts`) for a note of every write (`noteOf`, pure: `partySteps` and `historyOfParty` in `src/domain/history/party-history.ts`), which the storage writes with the party. Steps alone (every click) follow the party's write in one insert of their own, no transaction (`round-trips.db.test.ts` counts it); a late step of a party that has ended is dropped. A write that ends the party writes its record in the same transaction, behind a savepoint, reading the opt-ins under a shared lock (an opt-out under way finishes first). A record that fails is rolled back alone and the end stands; when the failure took the whole transaction (a deadlock), the party's write is run again alone. `PartyRepository` (over the pool, never a caller's transaction) hands the note to `historyFailed` once the party's write has committed: `PartyHistory.failed` tries it again after 1, 10 and 60 minutes (and once at shutdown), then gives up with an error in the log.
+- Once the record is written, in the same transaction, the party's `Party` row is deleted (Matt, 2026-10-16): it holds its maker's and every member's id. What still reads ended parties is the hourly `sweepPosts` (`endedPosts`: the posts of ended parties, to archive one a late message reopened) and the forums parties named (`partyForums`: `/region list`, `/admin setup-forums`); both read `EndedPartyPost` beside the rows of parties not yet recorded. Nothing else reads an ended row: the post's controls find a party in the store's memory, the copies and the post's last showing use the party in memory, access grants follow the store, and `listEndedBefore` / `delete` are used by nobody. So once a party is recorded, no id of a member who did not opt in is left in any table (`history-recording.db.test.ts` checks every one).
+- At start, once the parties and the game data are loaded, `PartyHistory.sweep` records every ended party whose row is still there (its record failed every try, the bot stopped first, or it ended before the history existed, with steps or without) as `unknown`, then deletes its row; a party with no post (it never was one) or an unreadable row is dropped; a raid that moved is left to the party it goes on as. `partyId` is unique: a party is never recorded twice.
+- A change that ends a party says why with `ended` in its result (`PartyEnd`): the scheduler `clock`; `PartyService.end` `cancelled` unless told otherwise; a deleted post `cancelled`; a raid that moved to another region `moved`; a party that never had its post `failed`, which is dropped. A change that says nothing is recorded as `unknown`. A raid that moved goes on as a new party whose first step (`from`) names the old one (and the old one's end writes it again): the new party's record takes the old one's steps and row along (one record, with the times from before the move; `createdAt` stays), and nothing records the old one by itself.
+- Members, the maker and the conductor are named as their opt-ins are when the record is written.
+- Tests: `partyServiceWith()` records into `MemoryHistory` (`history`: `records`, `steps`, `posts`, `optIn(guildRow, member)`, `failing`; it shares the memory storage's rows and deletes them as the repository does) through `recorder` (`flush()` runs the tries that wait; over the database its tries go to `kept.historyStorage`); `history-recording.db.test.ts` pins the repository; a `PartyRepository` in a test that expects no failure takes `HISTORY_MUST_NOT_FAIL`.
+
+## The opt-in
+
+- `/settings history enabled:True|False` (`ctx.historyOptIns`, `HistoryRepository`), per server like new trains (Matt, 2026-10-16): the history of a server is that server's, and the opt-in is kept by the server's snowflake. On: the member's id is kept with what they do in that server's parties from then on. Off: it is taken out of every party of that server already kept (attendee, maker, conductor; counted from three lookups by index), the rows stay and count without it, and the answer says from how many. `/settings show` and `/admin member-settings` show it. The help says what is kept: every member's id while a party is going on (as the party itself needs), only opted-in ids once it ended.
+- The opt-in rows hang on no `User` row, so they are written without `withMemberLocked`, as `NewTrainNotification` rows are: an opt-in and an opt-out of one member at once end as whichever committed last.
+- The legacy history never has a member id: everyone starts from zero, and it serves counts only.
+
+## The legacy import
+
+- `npm run history:import -- <folder> [--server <id>]` or `./pine import-history <folder> [--server <id>]` (the folder mounted read-only into a one-off container of the bot's image after `migrate-cli`; the bot is not started): `importStep` in `src/ops/history-import.ts` (exit 0; 1 refused or failed, said why; 2 used wrongly) over `src/ops/legacy-parties.ts` (the folder, file by file) and `legacyRecord` / `legacyBossResolver` (`src/domain/history/legacy-party.ts`). The folder is checked before the game data is loaded; a database without the history tables is refused. It reads `complete/` (a file per gym, the list of the raids that ended there) before `active/` (a party each; imported as ended `cutover` when it has a maker, a creation time and an attendee): a party the legacy bot had written to both is the ended one. Two passes: the first learns the region channels the files name and, of a party stored twice, the copy deleted last (the one taken); the second writes batches of 1,000 records, one transaction each, keyed by `legacyKey`: running it again writes nothing twice, and a run stopped half-way is finished by the next. A batch the database refuses is written record by record, and what it still refuses is counted ("not written", exit 1) and left for a later run. It prints counts only: files (and why one could not be read: `not JSON`, `not a record`, `cannot be read (EACCES)`), parties read, imported, already there, twice in the files, not written, skipped per reason, without their region (and of those, put in the fallback server), at a gym no longer in the gym list, bosses kept by their name.
+- Region by the party's region channel (`sourceChannelId`); server (a snowflake) by the region, else `--server` (which must be a known server), else the one server of all the regions the files named that are regions now; otherwise skipped (`no-server`). Gym by id where the gym list still has it, and only on a database taken over from the legacy bot (`knex_migrations` there): another database's ids are not the files'. Boss by number and form, else the name members search for, the legacy name, the number; else kept as given. No boss for an egg and for the legacy placeholders (`pokemon`, `egg`, `mega`, `elite`). A mention or a bare id (17 to 20 digits) in a name, a description or a label is written `@member` (an emoji's tag stays). A train's stops are its route up to its current stop once it started (past its start time at the import, or moved on); a skip cannot be told from a stop made.
+- What the files hold, 2018 to 2026 (138 shapes of raid): the tier as a number (1 to 5; 6 a mega legendary; `????` and 7 are no tier) or only `backupTier`; mega, elite and EX by the raid's flags; `endTime` the text `unset`; numbers as text (a boss's number, a head count); attendees without a group, raids without a groups list; a group's meeting time as `startTime` or `start_time`; a raid stored twice (counted, the copy deleted last imported). Trains keep their route and current stop (`currentGym`, past the end when finished), no times.
+
+## The questions as SQL
+
+Each question as a query: `history-queries.db.test.ts` reads every block below by its name and checks its answer on a small history, so a change here is a change there. Run the setup first, in the same session: the server (by its snowflake, in the tables' collation, or MySQL refuses to compare it with the column) and its time zone (the stack's MySQL has the zone tables; another server may need `mysql_tzinfo_to_sql`). Times are turned into the server's local time from epoch milliseconds as `convert_tz('1970-01-01' + interval <ms> div 1000 second, '+00:00', @zone)`, which does not depend on the session's time zone.
+
+```sql setup
+set @guild = '<server id>' collate utf8mb4_0900_ai_ci, @zone = 'America/New_York'
+```
+
+The most active members (only those who opted in have an id): parties they were at, and raids they completed.
+
+```sql most-active-members
+select a.memberId, count(*) as parties, sum(h.kind = 'raid' and a.furthest = 'done') as completed
+from PartyHistoryAttendee a
+join PartyHistory h on h.id = a.historyId
+where h.serverId = @guild and a.memberId is not null and a.furthest in ('here', 'done')
+group by a.memberId
+order by parties desc, a.memberId
+limit 20
+```
+
+Raids per gym (the name is the gym list's, HTML-encoded as the legacy bot stores it; a gym deleted since has none).
+
+```sql raids-per-gym
+select h.gymId, g.name, count(*) as raids
+from PartyHistory h
+left join Gym g on g.id = h.gymId
+where h.serverId = @guild and h.kind = 'raid' and h.gymId is not null
+group by h.gymId, g.name
+order by raids desc, h.gymId
+limit 20
+```
+
+Raids per region (by its channel: the region's name is its channel's on Discord).
+
+```sql raids-per-region
+select h.regionId, r.channelId, count(*) as raids
+from PartyHistory h
+left join Region r on r.id = h.regionId
+where h.serverId = @guild and h.kind = 'raid' and h.regionId is not null
+group by h.regionId, r.channelId
+order by raids desc, h.regionId
+```
+
+Raids per boss (the catalogue's key, or the name a boss the catalogue does not know was given).
+
+```sql raids-per-boss
+select coalesce(h.bossKey, h.bossName) as boss, count(*) as raids
+from PartyHistory h
+where h.serverId = @guild and h.kind = 'raid' and coalesce(h.bossKey, h.bossName) is not null
+group by boss
+order by raids desc, boss
+```
+
+Raids per tier.
+
+```sql raids-per-tier
+select h.tier, count(*) as raids
+from PartyHistory h
+where h.serverId = @guild and h.kind = 'raid' and h.tier is not null
+group by h.tier
+order by raids desc, h.tier
+```
+
+Which bosses drew the largest groups: who came (here or done) with their +1s, on average and at most.
+
+```sql largest-groups
+select coalesce(h.bossKey, h.bossName) as boss, count(*) as raids,
+       round(avg(h.hereHeads + h.doneHeads), 1) as averageCame,
+       max(h.hereHeads + h.doneHeads) as mostCame
+from PartyHistory h
+where h.serverId = @guild and h.kind = 'raid' and coalesce(h.bossKey, h.bossName) is not null
+group by boss
+order by averageCame desc, boss
+```
+
+Raids by hour of the day, local time: of the hatch, or of the report where there is no hatch time.
+
+```sql raids-by-hour
+select hour(t.local) as hour, count(*) as raids
+from (select convert_tz('1970-01-01' + interval coalesce(h.hatchTime, h.createdAt) div 1000 second,
+                        '+00:00', @zone) as local
+      from PartyHistory h
+      where h.serverId = @guild and h.kind = 'raid') t
+group by hour
+order by hour
+```
+
+Raids by day of the week.
+
+```sql raids-by-weekday
+select dayname(min(t.local)) as weekday, count(*) as raids
+from (select convert_tz('1970-01-01' + interval coalesce(h.hatchTime, h.createdAt) div 1000 second,
+                        '+00:00', @zone) as local
+      from PartyHistory h
+      where h.serverId = @guild and h.kind = 'raid') t
+group by weekday(t.local)
+order by weekday(t.local)
+```
+
+Raids by month.
+
+```sql raids-by-month
+select date_format(t.local, '%Y-%m') as month, count(*) as raids
+from (select convert_tz('1970-01-01' + interval h.createdAt div 1000 second, '+00:00', @zone)
+               as local
+      from PartyHistory h
+      where h.serverId = @guild and h.kind = 'raid') t
+group by month
+order by month
+```
+
+Raids by season (meteorological: winter is December to February).
+
+```sql raids-by-season
+select case when month(t.local) in (12, 1, 2) then 'winter'
+            when month(t.local) in (3, 4, 5) then 'spring'
+            when month(t.local) in (6, 7, 8) then 'summer'
+            else 'autumn' end as season,
+       count(*) as raids
+from (select convert_tz('1970-01-01' + interval h.createdAt div 1000 second, '+00:00', @zone)
+               as local
+      from PartyHistory h
+      where h.serverId = @guild and h.kind = 'raid') t
+group by season
+order by field(season, 'winter', 'spring', 'summer', 'autumn')
+```
+
+How fast groups filled: minutes from the report until the third member said they were coming (live raids only: the legacy history has no times). Change `nth = 3` for another count.
+
+```sql how-fast-groups-filled
+select count(*) as raids, round(avg(t.minutes), 1) as averageMinutes
+from (select (a.joinedAt - h.createdAt) / 60000 as minutes,
+             row_number() over (partition by h.id order by a.joinedAt, a.seq) as nth
+      from PartyHistory h
+      join PartyHistoryAttendee a on a.historyId = h.id
+      where h.serverId = @guild and h.kind = 'raid' and a.joinedAt is not null) t
+where t.nth = 3
+```
+
+Who was interested or said they were coming but never came, in raids that took place.
+
+```sql signed-up-never-came
+select a.furthest, count(*) as members
+from PartyHistoryAttendee a
+join PartyHistory h on h.id = a.historyId
+where h.serverId = @guild and h.kind = 'raid' and h.ending = 'completed'
+  and a.furthest in ('interested', 'joined')
+group by a.furthest
+order by field(a.furthest, 'interested', 'joined')
+```
+
+Trains by length: stops on the route, stops made, gyms, and minutes from the first arrival to the last departure.
+
+```sql trains-by-length
+select h.name, h.routeStops, count(s.seq) as stopsMade, count(distinct s.gymId) as gyms,
+       round((max(s.leftAt) - min(s.arrivedAt)) / 60000) as minutes
+from PartyHistory h
+left join PartyHistoryStop s on s.historyId = h.id
+where h.serverId = @guild and h.kind = 'train'
+group by h.id, h.name, h.routeStops
+order by stopsMade desc, h.id
+```
+
+The busiest gyms, for hot spots on the map: raids there and train stops made there, with where the gym is.
+
+```sql busiest-gyms
+select g.id as gymId, g.name, g.lat, g.lon, count(*) as visits
+from (select h.gymId from PartyHistory h
+      where h.serverId = @guild and h.kind = 'raid' and h.gymId is not null
+      union all
+      select s.gymId from PartyHistoryStop s
+      join PartyHistory h on h.id = s.historyId
+      where h.serverId = @guild and s.gymId is not null) v
+join Gym g on g.id = v.gymId
+group by g.id, g.name, g.lat, g.lon
+order by visits desc, g.id
+limit 50
+```
diff --git a/src/db/repositories/history-queries.db.test.ts b/src/db/repositories/history-queries.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4ae76b60e3ced529d43f9eb65ba775843b0c2e9a
--- /dev/null
+++ b/src/db/repositories/history-queries.db.test.ts
@@ -0,0 +1,307 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { sql, type Kysely } from 'kysely';
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import { ALICE, at, BOB } from '../../../test/support/parties.js';
+import type {
+  HistoryAttendee,
+  HistoryRecord,
+  HistoryStatus,
+} from '../../domain/history/party-history.js';
+import type { DB } from '../types.js';
+import { HistoryRepository } from './history-repository.js';
+
+/**
+ * The questions of docs/architecture/history.md, asked of a small history: every ```sql block
+ * there with a name is run as it is written (after the doc's own `set` of `@guild` and `@zone`),
+ * and its answer checked here. The doc is where the queries live; a query added there needs its
+ * answer here.
+ */
+const DOC = path.resolve(import.meta.dirname, '../../../docs/architecture/history.md');
+
+function documentedQueries(): Map<string, string> {
+  const text = readFileSync(DOC, 'utf8').replace(/\r\n/gu, '\n');
+  const queries = new Map<string, string>();
+  for (const match of text.matchAll(/```sql (\S+)\n([\s\S]*?)```/gu)) {
+    const [, name, query] = match;
+    if (name !== undefined && query !== undefined) queries.set(name, query.trim());
+  }
+  return queries;
+}
+
+const MINUTE = 60_000;
+
+function attendee(furthest: HistoryStatus, more: Partial<HistoryAttendee> = {}): HistoryAttendee {
+  return {
+    memberId: null,
+    status: furthest,
+    furthest,
+    groupId: 'A',
+    extras: 0,
+    remote: false,
+    team: null,
+    signedUpAt: null,
+    joinedAt: null,
+    hereAt: null,
+    doneAt: null,
+    leftAt: null,
+    ...more,
+  };
+}
+
+let next = 0;
+function record(more: Partial<HistoryRecord>): HistoryRecord {
+  next += 1;
+  return {
+    source: 'live',
+    partyId: `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
+    legacyKey: null,
+    kind: 'raid',
+    serverId: '412345678901234567',
+    regionId: 1,
+    gymId: 1,
+    legacyGymId: null,
+    name: null,
+    description: null,
+    tier: 'T5',
+    shadow: false,
+    mega: false,
+    elite: false,
+    ex: false,
+    shiny: null,
+    boss: null,
+    fastMove: null,
+    chargedMove: null,
+    createdAt: at('2026-07-04T18:00'),
+    hatchTime: null,
+    startTime: null,
+    endTime: null,
+    endedAt: null,
+    ending: 'completed',
+    createdById: null,
+    conductorId: null,
+    anonymous: false,
+    routeStops: null,
+    attendees: [],
+    groups: [],
+    stops: [],
+    ...more,
+  };
+}
+
+const mewtwo = { key: 'mewtwo', dex: 150, species: 'MEWTWO', form: null };
+
+/** The history the questions are asked of (all in New York time). */
+function history(): HistoryRecord[] {
+  const july = at('2026-07-04T18:00'); // a Saturday in summer
+  const january = at('2026-01-10T12:00'); // a Saturday in winter
+  return [
+    record({
+      boss: mewtwo,
+      createdAt: july,
+      hatchTime: july + 30 * MINUTE,
+      attendees: [
+        attendee('done', { memberId: ALICE, extras: 1, joinedAt: july + 5 * MINUTE }),
+        attendee('here', { joinedAt: july + 10 * MINUTE }),
+        attendee('interested'),
+        attendee('joined', { joinedAt: july + 20 * MINUTE }),
+      ],
+    }),
+    record({
+      boss: mewtwo,
+      createdAt: january,
+      hatchTime: january + 20 * MINUTE,
+      attendees: [
+        attendee('done', { memberId: ALICE, joinedAt: january + MINUTE }),
+        attendee('done', { extras: 2, joinedAt: january + 2 * MINUTE }),
+        attendee('done', { joinedAt: january + 30 * MINUTE }),
+      ],
+    }),
+    // From the legacy files: a tier 3 boss the catalogue does not know, reported on a Tuesday.
+    record({
+      source: 'legacy',
+      partyId: null,
+      legacyKey: '310000000000000001:1554207300000',
+      regionId: 2,
+      gymId: 2,
+      legacyGymId: 2,
+      tier: 'T3',
+      boss: { name: 'Unheardofmon' },
+      createdAt: at('2019-04-02T08:15'),
+      ending: 'unknown',
+      attendees: [attendee('interested')],
+    }),
+    // Nobody came: Alice said she would.
+    record({
+      regionId: 2,
+      gymId: 2,
+      tier: 'Mega',
+      mega: true,
+      boss: { key: 'charizard_mega_x', dex: 6, species: 'CHARIZARD', form: 'CHARIZARD_MEGA_X' },
+      createdAt: at('2026-10-14T17:45'),
+      hatchTime: at('2026-10-14T18:00'),
+      ending: 'expired',
+      attendees: [attendee('joined', { memberId: ALICE, joinedAt: at('2026-10-14T17:50') })],
+    }),
+    record({
+      kind: 'train',
+      gymId: null,
+      tier: null,
+      name: 'Saturday legendaries',
+      createdAt: at('2026-10-16T20:00'),
+      startTime: at('2026-10-17T10:00'),
+      routeStops: 2,
+      attendees: [attendee('here', { memberId: ALICE })],
+      stops: [
+        {
+          gymId: 1,
+          legacyGymId: null,
+          arrivedAt: at('2026-10-17T10:00'),
+          leftAt: at('2026-10-17T10:20'),
+        },
+        {
+          gymId: 2,
+          legacyGymId: null,
+          arrivedAt: at('2026-10-17T10:30'),
+          leftAt: at('2026-10-17T10:50'),
+        },
+        { gymId: 1, legacyGymId: null, arrivedAt: at('2026-10-17T11:00'), leftAt: null },
+      ],
+    }),
+    // A meetup Alice was at: a party she took part in, but no raid she completed.
+    record({
+      kind: 'meetup',
+      gymId: null,
+      tier: null,
+      name: 'Picnic',
+      createdAt: at('2026-10-18T12:00'),
+      attendees: [attendee('done', { memberId: ALICE })],
+    }),
+    // Another server: in no answer.
+    record({
+      serverId: '412345678901234568',
+      regionId: 3,
+      boss: mewtwo,
+      attendees: [attendee('done', { memberId: BOB })],
+    }),
+  ];
+}
+
+/** Numbers as numbers (MySQL gives counts and sums as text); ids and dates stay as they are. */
+function plainRow(row: Record<string, unknown>): Record<string, unknown> {
+  return Object.fromEntries(
+    Object.entries(row).map(([key, value]) => [
+      key,
+      typeof value === 'string' && /^-?\d{1,12}(\.\d+)?$/u.test(value) ? Number(value) : value,
+    ]),
+  );
+}
+
+const ANSWERS: Record<string, Record<string, unknown>[]> = {
+  'most-active-members': [{ memberId: ALICE, parties: 4, completed: 2 }],
+  'raids-per-gym': [
+    { gymId: 1, name: 'Library', raids: 2 },
+    { gymId: 2, name: 'Fountain', raids: 2 },
+  ],
+  'raids-per-region': [
+    { regionId: 1, channelId: '1234567890123456788', raids: 2 },
+    { regionId: 2, channelId: '1234567890123456789', raids: 2 },
+  ],
+  'raids-per-boss': [
+    { boss: 'mewtwo', raids: 2 },
+    { boss: 'charizard_mega_x', raids: 1 },
+    { boss: 'Unheardofmon', raids: 1 },
+  ],
+  'raids-per-tier': [
+    { tier: 'T5', raids: 2 },
+    { tier: 'Mega', raids: 1 },
+    { tier: 'T3', raids: 1 },
+  ],
+  'largest-groups': [
+    { boss: 'mewtwo', raids: 2, averageCame: 4, mostCame: 5 },
+    { boss: 'charizard_mega_x', raids: 1, averageCame: 0, mostCame: 0 },
+    { boss: 'Unheardofmon', raids: 1, averageCame: 0, mostCame: 0 },
+  ],
+  'raids-by-hour': [
+    { hour: 8, raids: 1 },
+    { hour: 12, raids: 1 },
+    { hour: 18, raids: 2 },
+  ],
+  'raids-by-weekday': [
+    { weekday: 'Tuesday', raids: 1 },
+    { weekday: 'Wednesday', raids: 1 },
+    { weekday: 'Saturday', raids: 2 },
+  ],
+  'raids-by-month': [
+    { month: '2019-04', raids: 1 },
+    { month: '2026-01', raids: 1 },
+    { month: '2026-07', raids: 1 },
+    { month: '2026-10', raids: 1 },
+  ],
+  'raids-by-season': [
+    { season: 'winter', raids: 1 },
+    { season: 'spring', raids: 1 },
+    { season: 'summer', raids: 1 },
+    { season: 'autumn', raids: 1 },
+  ],
+  'how-fast-groups-filled': [{ raids: 2, averageMinutes: 25 }],
+  'signed-up-never-came': [
+    { furthest: 'interested', members: 1 },
+    { furthest: 'joined', members: 1 },
+  ],
+  'trains-by-length': [
+    { name: 'Saturday legendaries', routeStops: 2, stopsMade: 3, gyms: 2, minutes: 50 },
+  ],
+  'busiest-gyms': [
+    { gymId: 1, name: 'Library', lat: 40.44, lon: -79.95, visits: 4 },
+    { gymId: 2, name: 'Fountain', lat: 40.45, lon: -79.96, visits: 3 },
+  ],
+};
+
+describe('the questions of docs/architecture/history.md', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+
+  beforeAll(async () => {
+    ({ db, stop } = await startMigratedDatabase());
+    await sql`insert into Guild (id, snowflake)
+              values (1, '412345678901234567'), (2, '412345678901234568')`.execute(db);
+    await sql`insert into Region (id, guildId, channelId)
+              values (1, 1, 1234567890123456788), (2, 1, 1234567890123456789),
+                     (3, 2, 1234567890123456790)`.execute(db);
+    await sql`insert into Gym (id, name, lat, lon)
+              values (1, 'Library', 40.44, -79.95), (2, 'Fountain', 40.45, -79.96)`.execute(db);
+    await new HistoryRepository(db).insertRecords(history());
+  });
+  afterAll(async () => {
+    await stop();
+  });
+
+  const queries = documentedQueries();
+
+  it('has a name for every sql block there, so that none goes untested', () => {
+    const text = readFileSync(DOC, 'utf8');
+    const fences = text.match(/```sql\b[^\n]*/gu) ?? [];
+    expect(fences.filter((fence) => !/^```sql \S+$/u.test(fence.trimEnd()))).toEqual([]);
+    expect(fences).toHaveLength(queries.size);
+  });
+
+  it('has an answer here for every question there', () => {
+    expect([...queries.keys()].filter((name) => name !== 'setup').sort()).toEqual(
+      Object.keys(ANSWERS).sort(),
+    );
+  });
+
+  it.each(Object.entries(ANSWERS))('answers %s', async (name, answer) => {
+    const setup = queries.get('setup');
+    const query = queries.get(name);
+    if (setup === undefined || query === undefined) throw new Error(`no query ${name}`);
+    // The doc's own setup, with the server of these rows: one connection for both.
+    const rows = await db.connection().execute(async (connection) => {
+      await sql.raw(setup.replace("'<server id>'", "'412345678901234567'")).execute(connection);
+      return (await sql.raw<Record<string, unknown>>(query).execute(connection)).rows;
+    });
+    expect(rows.map(plainRow)).toEqual(answer);
+  });
+});
````

### Task 6: Plan 8H T6: docs for the party history

Prototype commit: `562e90d220ff0fa3f1ebfe173ee1946b339e8b5d`

CLAUDE.md: the status, history:import and ./pine import-history (with
--server) among the commands, history.md in the area index.
operations.md: the import command, its one-off CLI and its exit codes,
the shutdown step of the party history in the sum of limits. testing.md:
MemoryHistory (it shares and deletes the memory storage's rows), the
recorder, HISTORY_MUST_NOT_FAIL, the opt-in fake, the legacy fixture
folders, the doc's queries, and the fourth real-MySQL lock wait.
parties-and-posts.md: ended in a store change, and ended rows deleted
once recorded; members-and-roles.md: the opt-in is per server.

**Files:**

```
 CLAUDE.md                              | 5 ++++-
 docs/architecture/members-and-roles.md | 1 +
 docs/architecture/operations.md        | 8 ++++++--
 docs/architecture/parties-and-posts.md | 1 +
 docs/architecture/testing.md           | 6 +++++-
 5 files changed, 17 insertions(+), 4 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 562e90d220ff0fa3f1ebfe173ee1946b339e8b5d -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8h-party-history.md'` prints nothing (and file modes match: `pine` is 100755).
- [ ] **Step 5: Commit** with the title `Plan 8H T6: docs for the party history`, the body above and the trailer, staging exactly
  `CLAUDE.md docs/architecture/members-and-roles.md docs/architecture/operations.md docs/architecture/parties-and-posts.md docs/architecture/testing.md`.

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 18cb4afa2698b9c354807f4a67cceb1a6232d7e1..a9f9d5cb50111925465754a7b7db7c45ffcc7b2e 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -44,7 +44,7 @@ A row without dates is drawn right of the now line, so a done task must be dated
 ## Status
 
 - Phases 0 to 7 are built and staged on Discord; 8A (posts as components-v2 messages, application emoji) is built and staged. 8B-1 to 8B-4 (every other message as components-v2; no code builds an embed) are complete, their staging checklists (`docs/superpowers/plans/*-staging.md`) not yet run. 8W-1 (the Wayfarer export, `/gym import`, `/gym review`) is merged; 8W-1R (the refinements after the first full scan: blank map, progress map, outlines in the export, one summary post, the Google line in the database, the bulk delete beyond a finished scan) is complete on `wayfarer`, its staging checklist not yet run; 8M-1 (the web server in the bot, Discord login and login links, the public map of regions and gyms; `docs/web-setup.md`) and 8W-2 (every Wayspot kept, the gym's Wayfarer picture and address in posts, `/wild near:`) are complete, their staging checklists not yet run; the Wayfarer and web map work (plans 8M-1 to 8M-5, spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`) goes on in the session of `../Professor-Pine-wayfarer`.
-- 9A (the Docker stack, `./pine`, `docs/architecture/operations.md`) is merged; the cutover design is `docs/superpowers/specs/2026-10-16-cutover-docker-history-design.md`. Next: 8C (cutover tools), 8H (party history), 8L-2 (guides), the rehearsal. About 2026-11-11 the production application loses its privileged intents, which the legacy bot depends on (follow-ups, "Needs Matt").
+- 9A (the Docker stack, `./pine`, `docs/architecture/operations.md`) is merged; the cutover design is `docs/superpowers/specs/2026-10-16-cutover-docker-history-design.md`. 8H (the party history: every ended party recorded in relational tables, `/settings history` opt-in, the legacy import; `docs/architecture/history.md`) is built. Next: 8C (cutover tools), 8L-2 (guides), the rehearsal. About 2026-11-11 the production application loses its privileged intents, which the legacy bot depends on (follow-ups, "Needs Matt").
 - Every contact with Discord needs Matt's go-ahead. It uses the test application "Professor Pine (Dev instance)" (registered globally only: deploy with `--global`) and its test server (`TEST_GUILD_ID` in `.env`), with the local database in the Docker container `pine-dev-mysql`; Matt starts the bot in a terminal, and staging tools are in the git-ignored `var/stage/`.
 - The history is in the plans, the Gantt chart and the follow-ups file (`docs/superpowers/plans/phase-0-follow-ups.md`, a "From …" section per plan and staging run): read the follow-ups before planning a phase, and add to them when a phase ends.
 
@@ -62,6 +62,7 @@ npm run raid-bosses:check    # download the raid boss feed and print the list Pi
 npm run role-auth:export     # print the legacy role authorization per server, mapped to the new commands (reads only; --json)
 npm run emoji:upload         # upload the game's type, weather and team icons the bot's application lacks as its emoji (a dry run; --apply uploads)
 npm run migrate        # run Kysely migrations against the configured database
+npm run history:import -- <legacy parties folder> [--server <id>]   # import the legacy bot's parties/ folder into the party history (no member ids; safe to run again)
 npm run ocr:check -- <folder> [--labels <file>] [--baseline <file>] [--write-baseline <file>] [--bosses <file>] [--write-bosses <file>] [--device cpu|cuda|directml] [--threads n] [--priority low|normal]   # read screenshots with the real models; scores (also of a review folder), clocks' confidence and time
 npm run ocr:review -- <folder> [--show-text]   # triage of a review folder: what members said was wrong, and where (their texts and ids only with --show-text)
@@ -77,6 +78,7 @@ The Docker stack (`compose.yaml`; a host needs only Docker and git) is run with
 ./pine restore <dump> --no-start [--replace [--no-backup]]   # load a legacy or Pine dump (.sql or .sql.gz), lower-case tables renamed; without --no-start on a terminal, or with --start, it logs the bot in
 ./pine deploy-commands [--global | --guild <id>]   # contacts Discord: only when Matt asks
 ./pine update | shell        # backup, git pull, rebuild, restart (logs the bot in: only when Matt asks); a shell in the bot's container
+./pine import-history <folder> [--server <id>]   # the migrations, then the legacy parties/ folder (mounted read-only) into the party history; no Discord
 ```
 
 Format the files you touch with `npx prettier --write <files>`; `format:check` is part of `check`.
@@ -147,6 +149,7 @@ Each file under `docs/architecture/` holds the conventions of one subsystem. Rea
 - `gyms-and-regions.md`: gym search and ownership, gym administration and views, Google, maps, regions, KML, `/bounds`, `/find-region`. Read before changing gyms, regions or maps.
 - `screenshots.md`: the OCR reader and its worker, the report and the decision, the store and review folder, the screenshot flows on Discord. Read before changing screenshot reading.
 - `wayfarer.md`: the export file, S2 cells, the scan, the userscript, matching, `/gym import` and `/gym review`. Read before changing the Wayfarer work.
+- `history.md`: the party history (its tables, how ended parties are recorded, the opt-in, the legacy import) and the statistics questions as tested SQL. Read before changing the history or writing a query over it.
 - `members-and-roles.md`: member settings and rows, member lookups and viewers, self-assigned roles. Read before changing members or roles.
 - `utilities.md`: game data, the catalogue, Pokémon search, raid tiers and bosses, nicknames, pictures, emoji, `/rank`, `/counters`, `/find-gym`, `/request`, `/maps`, `/help`. Read before changing any of these.
 - `web.md`: the web server in the bot, its settings and secrets, sessions, CSRF, logging in (Discord, the links of `/maps`), rate limits, the map's data and page, the CSP, how to add a route. Read before changing anything under `src/web/`.
diff --git a/docs/architecture/members-and-roles.md b/docs/architecture/members-and-roles.md
index ab44e62c7da882932c12737dcb92aa77a4728059..ac74a40a512f714c2133509edb70ddc487324437 100644
--- a/docs/architecture/members-and-roles.md
+++ b/docs/architecture/members-and-roles.md
@@ -5,6 +5,7 @@ What the bot knows of members without a member list: their settings and rows, on
 ## Settings and rows
 
 - Member settings are read through `ctx.users` (`get`, `getMany`, `update`, `withNickname`). Whoever is about to ping several members reads them in one go with `settingsOf(users, ids, log)` (`src/services/party-change.ts`): a member without a row has the defaults, and a read that fails is logged and pings nobody. Tests use `MemoryUsers` (`test/support/users.ts`).
+- Whether a member is named in the party history is per server (`ctx.historyOptIns`, `/settings history`; `history.md`), like new trains; it is no column of `User`.
 - A repository method that changes one member's rows of a server runs inside `withMemberLocked` (`src/db/repositories/member-rows.ts`): the member's `User` row is locked first, by snowflake, and the rows are read after the lock. The row ids of servers and members are remembered per process in `RowIds` (`row-ids.ts`; one made in `src/app.ts` and given to the repositories of guilds, users, wants and gym targets; `RowIds.none` remembers nothing): a row made inside a transaction is remembered only after its commit, never inside a caller's transaction, and a remembered row that is gone is forgotten and the change run once more (the legacy bot deletes `Guild` rows). `src/commands/round-trips.db.test.ts` pins how many round trips the common commands make.
 
 ## Looking members up
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
index b1e8cabb097b4b0f6d85eef8597f52a62d4e30fb..031e3974b0ad42d52792de59facab089763f5262 100644
--- a/docs/architecture/operations.md
+++ b/docs/architecture/operations.md
@@ -15,7 +15,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 - `Dockerfile`: multi-stage on `node:24-slim`. The build stage runs `npm ci --ignore-scripts` and `npm run build`; the runtime stage has the production dependencies (also without install scripts: none is needed for the CPU, as in the checkout), `dist/`, `package.json` (it says the files are ES modules) and the default `data/settings.json`. onnxruntime-node keeps its library for the image's platform only (`TARGETARCH`: linux x64, or arm64; arm64 is untested). Runs as `node`, `NODE_ENV=production`, `node --enable-source-maps dist/index.js`, `STOPSIGNAL SIGTERM`. About 490 MB unpacked.
 - The runtime reads from disk only its settings and what it keeps under `var/`: no `assets/`, `lang-data/` (the legacy bot's tesseract data) or the other `data/*.json`, and no legacy JavaScript. `.dockerignore` lets in only what the build needs (never `.env`, `var/`, `.git`, `node_modules`).
 - `var/` is a volume (`pine-var`), writable by `node` because the image's folder is: the game data cache, map pictures, the screen reader's models (downloaded at first use) and screenshots, and the health files.
-- The one-off commands run in the same image: `dist/db/migrate-cli.js`, `dist/discord/deploy-cli.js`, `dist/ops/restore-cli.js`, `dist/ops/health-cli.js`, and the watchdog `dist/ops/watchdog-cli.js`. The tsx scripts of `scripts/` are not in the image (see "Open items").
+- The one-off commands run in the same image: `dist/db/migrate-cli.js`, `dist/discord/deploy-cli.js`, `dist/ops/restore-cli.js`, `dist/ops/health-cli.js`, `dist/ops/history-import-cli.js`, and the watchdog `dist/ops/watchdog-cli.js`. The tsx scripts of `scripts/` are not in the image (see "Open items").
 
 ## The stack
 
@@ -23,7 +23,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 - `lower_case_table_names=0` (Linux's default, set explicitly; it can only be set when the data directory is made): table names are case sensitive, the bot's are mixed case (`Guild`, `GymMeta`), and a dump of the stack loads unchanged into any server that keeps case (the test containers, another Linux host). A dump from MySQL on Windows has lower-case names; `./pine restore` renames them, and the migrator refuses such a database on a case-sensitive server before writing anything.
 - There is no profile for an external MySQL (spec 9.2's is dropped): an instance restores its dump into the stack instead.
 - `.env` is read by Compose for the values of `compose.yaml` and handed whole to the bot (`env_file`). Inside the stack the bot reaches MySQL as `mysql:3306` whatever `.env` says (`DB_HOST`, `DB_PORT` are set by the compose file); `DB_USER`, `DB_PASSWORD`, `DB_SCHEMA` also create the user and the database on MySQL's first start, `DB_ROOT_PASSWORD` is root's and is blanked for the bot. `pine-settings.json` is mounted read-only.
-- `pine` waits for a healthy `mysql`, runs under `init: true` (tini hands it SIGTERM and reaps the screen reader's process), restarts `unless-stopped`, and has `stop_grace_period: 2m30s`: the shutdown steps of `src/app.ts` have limits that add up to two minutes (the queued DMs alone fifteen seconds). A new step there means checking that sum, and the watchdog's restart (`?t=150`).
+- `pine` waits for a healthy `mysql`, runs under `init: true` (tini hands it SIGTERM and reaps the screen reader's process), restarts `unless-stopped`, and has `stop_grace_period: 2m30s`: the shutdown steps of `src/app.ts` have limits that add up to about two minutes (the queued DMs alone fifteen seconds; plan 8H added three seconds for the party history's last try of a record that failed). A new step there means checking that sum, and the watchdog's restart (`?t=150`).
 - A new install is `./pine up` on empty volumes: the migrator's new-install path creates the schema.
 
 ## Health
@@ -61,6 +61,10 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 - `restoreStep` (`src/ops/restore.ts`) is the CLI's logic, tested against MySQL with its exit codes. `PINE_TABLES` lists every table the bot knows (the legacy ones from the generated baseline); a migration that adds a table adds it there, or `restore.db.test.ts` fails.
 - `./pine migrate` runs the migrations in a one-off container without starting the bot: no Discord. It is how a restored copy is checked without logging in.
 
+## The party history import
+
+- `./pine import-history <folder> [--server <server id>]` imports the legacy bot's `parties/` folder into the party history (`history.md`): it builds the image, starts `mysql`, runs the migrations as `migrate` does, then `dist/ops/history-import-cli.js` in a one-off container with the folder mounted read-only (`mount_folder`: absolute, in Git Bash its Windows form). No Discord, the bot is not started. Once per instance, whenever convenient after the cutover (not on its critical path); running it again writes nothing twice, and finishes what a run that failed or stopped left. `--server` names the server of parties whose region is gone (by default the one server of the regions the files named). It prints counts only, and fails (exit 1) when no file could be read or a record could not be written. The folder stays where the operator keeps it: it is the only copy of the legacy history with member ids, never copied into the stack.
+
 ## Open items
 
 - The tsx scripts `emoji:upload` and `role-auth:export` are not in the image, so a host without Node cannot run them: plan 8C makes them compiled CLIs with `./pine` commands.
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index d1e8a9391456d417bff752b644f5427404eefe0e..4b57e6b9e6e0a7b9eeaebcceb4603a25c049eaf9 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -8,6 +8,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - `Party` is a union, `RaidParty | MeetupParty | TrainParty`. Code that is about a raid narrows: `isRaid` in the domain and services, the guard `requireRaid` with `commandRaid(interaction, ctx)` in a handler, `raidOf` elsewhere; likewise `isTimed` / `requireTimed` / `commandTimed` and `isMeetup` / `requireMeetup` / `commandMeetup`. A change inside `PartyStore.update` keeps the kind (`asKindOf(original, changed)`; the store throws when the kind changes). Never cast to a kind.
 - What the clock does is `partyTick(party, input)` (`tick.ts`; it dispatches to `raidTick` or `timedTick`): it returns the party as it should be now, `effects` (`stage`, `ask-complete`, `completed`, `warn`, `end`) and `render`. It is idempotent and catches up after downtime by itself. `end` comes alone and repeats until the caller has ended the party with `endParty`.
 - A party changes only through `PartyStore.update(id, change)` (`src/services/party-store.ts`): one change at a time per party, written to the database first, then replaced in memory. `change` is synchronous and decides inside the callback (a `get` made earlier may be stale); the result has `written`. A reported raid is stored only through `addRaidUnlessTaken`. Handlers read through `ctx.parties` (`get`, `byPost`, `active`, `inRegion`, `raidAt`).
+- Every party that ends is recorded in the party history (`history.md`): the store asks `PartyHistory` for a note of each write, which the storage writes with the party, and a change that ends a party says why with `ended` in its result (`PartyEnd`: the scheduler `clock`, `PartyService.end` `cancelled` by default, a move `moved`, a party that never had its post `failed`). Once recorded, an ended party's `Party` row is deleted (it holds its members' ids; Matt, 2026-10-16): what reads ended parties (`endedPosts`, `partyForums`) also reads `EndedPartyPost`, and nothing may count on an ended row being there.
 - `PartyStore.onChange(listener)` tells of every added party and every stored change, `(before, after)`, right after memory was replaced; a listener decides and returns (never `async`), and what takes time it does on the side. It is for what follows from a change whoever made it.
 - A raid's boss is stored as a reference, `{ key }` (catalogue key) or `{ name }` (a boss the game master does not know): make it with `raidBossRef(boss)` from a `RaidBoss` of `ctx.raidBosses`, never by passing that object itself. An egg has no boss; `raid.reportedHatched` says whether a raid without times was seen hatched.
 - `PartyRepository` keeps what is searched by in columns and the rest in one versioned JSON document (`party-state.ts`), checked when written and when read; a row it cannot read is reported and left alone. Attendees are a list there, because MySQL sorts the keys of a JSON object. Any new field in the document is a new version with a reader for the old one.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index cfa9f60dba4c807de3786373da330a7344e8ac65..b598620d62d0d20a62dee6c340e52ce39e1a6529 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -10,7 +10,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Waiting for work in the background
 
-- No test waits on real time or on a fixed number of turns of the event loop: no `vi.waitFor` / `vi.waitUntil` / `expect.poll`, no sleep, no loop that polls a condition. Lint (`eslint.config.js`, in `*.test.ts` and `test/support/`) refuses `vi.waitFor`, `vi.waitUntil` and `expect.poll`; a `setTimeout` or `setInterval` (by its bare name or as a property, `globalThis.setTimeout`) inside `new Promise` with any delay but a literal `0`; a bare `setTimeout(n)` with a number; and `setTimeout` / `scheduler` of `node:timers/promises`. It does not see a sleep hidden in a helper of another name or a loop over turns: a turn counted by hand (`await new Promise((r) => setImmediate(r))` as a wait) or a polling loop is refused in review. A test that truly needs real time disables the rule on its line with the reason; they are: the reading process of `ocr-service.test.ts` (a real child process, two), the measurement of the event loop in `dm-sender.test.ts`, and the lock waits of real MySQL in three `*.db.test.ts`. One more check measures the wall clock on purpose, without a sleep: the budget of `placeMap` in `static-map.test.ts` (1 s, against a slowdown by an order of magnitude). So a plan runs its new and changed test files ten times in a row only when it adds a test that must use real time.
+- No test waits on real time or on a fixed number of turns of the event loop: no `vi.waitFor` / `vi.waitUntil` / `expect.poll`, no sleep, no loop that polls a condition. Lint (`eslint.config.js`, in `*.test.ts` and `test/support/`) refuses `vi.waitFor`, `vi.waitUntil` and `expect.poll`; a `setTimeout` or `setInterval` (by its bare name or as a property, `globalThis.setTimeout`) inside `new Promise` with any delay but a literal `0`; a bare `setTimeout(n)` with a number; and `setTimeout` / `scheduler` of `node:timers/promises`. It does not see a sleep hidden in a helper of another name or a loop over turns: a turn counted by hand (`await new Promise((r) => setImmediate(r))` as a wait) or a polling loop is refused in review. A test that truly needs real time disables the rule on its line with the reason; they are: the reading process of `ocr-service.test.ts` (a real child process, two), the measurement of the event loop in `dm-sender.test.ts`, and the lock waits of real MySQL in four `*.db.test.ts` (the fourth: an opt-out under way while a party's record reads the opt-ins, `history-recording.db.test.ts`). One more check measures the wall clock on purpose, without a sleep: the budget of `placeMap` in `static-map.test.ts` (1 s, against a slowdown by an order of magnitude). So a plan runs its new and changed test files ten times in a row only when it adds a test that must use real time.
 - A test awaits the work itself. In this order: the service's own `flush()` / `idle()` / `whenIdle()`; else a count the fake keeps of what it saw (`Tally`, `test/support/tally.ts`: `add()` when it happens, `reached(n)` resolves once it happened `n` times in all, and rejects after `TALLY_LIMIT_MS` with what it waited for and the count it saw, so a broken behaviour fails readably), such as `FakePartyGateway.postEdits(postId)`, `FakeRoleGateway.requests`, `FakeScreenshotReader.readsBegun`, or a named `Tally` in the test's own wrapper of a fake; the timers of the work by `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` and `vi.advanceTimersByTime*`.
 - A test that must see what a run left behind at its end (a timer it asked for, or none), or that nothing has happened while something is held, settles the background (`test/support/timers.ts`): `watchBackground()` fakes `setTimeout` and watches the immediates until the test ends, `watchForTest()` only watches them, `watchEachTest()` (called in a file or a `describe`) watches those of every test, and `watchImmediates()` is the bare watch (`restore()` afterwards); then `await settle()`, which resolves once no `setImmediate` callback (on which the fakes answer) waits any more. It sees only the global `setImmediate` / `clearImmediate` from the moment the watch began: I/O, timers that are not faked and `setImmediate` imported from `node:timers` are invisible to it, so "nothing happened" after `settle()` means something only where the work answers on the global `setImmediate` and `setTimeout` is faked.
 - A time limit made with `AbortSignal.timeout` (downloads, requests) is faked by `fakeTimeoutSignals()`: its signals abort only on `expire()` (and are aborted already when made afterwards, so a retry with a fresh limit cannot be tested with it), so a fake that stalls rejects at once for a signal that is aborted, as `fetch` does. A delay that is a setting and is not the subject of the test is 0 (`renamePauseMs`). Time measured with `performance.now()` of `node:perf_hooks` is not reached by vi's `performance` fake: spy on `performance.now` to follow the faked `Date` (`dm-sender.test.ts`, the drain).
@@ -26,6 +26,10 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Service tests use `partyServiceWith()` (`test/support/party-service.ts`: a service over the fake gateway, the invented regions and a clock, with `attendance`, `raids`, `scheduler` and `lines` over the same store); command tests pass `{ partyService, attendance, raids, parties, regions }` from it to `createTestContext`, whose own `partyService`, `attendance` and `raids` throw when used. `restarted(made)` gives new services over the same storage, gateway and clock, as after a restart; the fake gateway keeps `archived`, `locked` and `reopened` per post. A server with the two channels for copies is `gatewayWithMirrorChannels()` (pass it as `kept.gateway`; `REMOTE_CHANNEL`, `EX_CHANNEL`); without it, as in most tests, a raid has no copies. A test that needs renders to run by themselves passes `{ renderDelayMs: 0, sharedDelayMs: 0 }`. The fake interactions take `guildRoleNames`. On the fake gateway everybody sees every forum unless `gateway.shutOut(forumId, ...members)` says otherwise (`canSee`, `admitted`, `barred`, `leftServer`); `partyServiceWith` also gives `access` (the access service over the same store) and `grants` (`MemoryAccessGrants`). `reportedRaid(report?, overrides?, kept?)` gives all of that with a raid reported through the service (`party`, `postId`, `current()`, `said()`); `userSettings` holds what differs from the default member settings. Lines go out only on `attendance.flush()`, post edits only on `service.flush()`.
 - Meetups in tests: `testMeetup()`, `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`). The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary`, the menus of a message with `selectsOf` (`test/support/messages.ts`).
 
+## The party history
+
+- `partyServiceWith()` records every party that ends into `history` (`MemoryHistory`, `test/support/history.ts`: `records`, `steps`, `posts`, `optIn(guildRow, member)`, `failing`; it shares the memory storage's rows and deletes a recorded party's, as the repository does, so a test of an ended party reads `history.records`, not `storage.rows`), through `recorder` (`PartyHistory`, whose tries of what failed run only on `recorder.flush()`; over a database, `kept.historyStorage` takes them); `MemoryPartyStorage` writes each write's note into it as `PartyRepository` does. A `PartyRepository` in a test that expects no failure of the history takes `HISTORY_MUST_NOT_FAIL`. `MemoryHistoryOptIns` is `ctx.historyOptIns` for `/settings history` (`named(member, server, n)` says in how many parties opting out takes them out of). The legacy import's db test reads the invented folder `test/fixtures/legacy-parties/`; the queries of `history.md` are run from the doc by `history-queries.db.test.ts`.
+
 ## Trains
 
 - Trains in tests: `testTrain()`, `asTrain()` (`test/support/parties.ts`), `createdTrain()` and `trains` of `partyServiceWith()` (`test/support/party-service.ts`), `MemorySavedRoutes` (`test/support/saved-routes.ts`). Lines and the movement announcement go out on `attendance.flush()` and `trains.flush()`.
````

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8h HEAD -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8h-party-history.md'` prints nothing; `npm run check`, `npm run build`, `npm run test:db`, one after the other through the npm scripts.
2. The final fix wave: the third review's 8H-1 to 8H-8 (`.superpowers/sdd/2026-10-16-phase-8h-party-history/rereview-findings.md`): mentions scrubbed from live free text (8H-1, Important), a record never takes an active predecessor (8H-2, Important), unreadable rows logged and left, the sweep hourly, the first start's progress logged, dead code removed, doc notes.
3. Whole-branch review (Opus, high effort); one more fix wave if it finds something.
4. `CLAUDE.md` status line, the follow-ups ("From Phase 8H"), the Gantt chart and memory.

## Staging checklist

On the dev application and the test server, each step with Matt's go-ahead; the commands are registered again (`/settings history`). Never run migration 018 on the dev database before this plan is merged into `typescript-migration` (the migrator refuses unordered migrations; 017 Wayspot comes first).

1. Start the bot on the dev database: the first-start sweep logs how many ended parties it records and deletes; their posts stay archived.
2. A raid with two members, one opted in (`/settings history enabled:True`): it ends; the history has one record, the opted-in member named, the other anonymous; no `Party` row left.
3. A train with stops, a meetup with a description mentioning a member: recorded, the mention scrubbed.
4. A raid moved to another region: one record.
5. `/settings history enabled:False`: the answer says from how many parties the id was taken.
6. `./pine import-history` on a copy of a legacy folder (or the fixtures) into a scratch stack: counts as expected; a second run writes nothing.
7. The queries of `docs/architecture/history.md` against the dev database.
