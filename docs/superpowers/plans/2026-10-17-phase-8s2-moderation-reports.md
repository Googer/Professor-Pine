# Phase 8S-2: Reports to the Moderators: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members report a party or a single message to the moderators privately, with a reason, and the moderators act on it from a post in their channel. In detail:

- `/report` in a party's post, and "Report to moderators" in Discord's Apps menu on any message.
- `/delete` becomes staff only, with a choice between archiving the post and deleting it.
- A place refused for good can be asked about after 14 days.
- `/places` shows the rulings and everything open, with undo and lift.
- Block member works on refused and expired requests, and a gym's official name shows in the moderators' posts.

**Architecture:**

- **Reports** are `ModerationReports` (`src/services/moderation-reports.ts`, `ctx.reports`).
  - There is one open report per party or message (an `openKey`). Reasons gather on it under a row lock.
  - The moderators' post is redrawn one edit at a time per report, from storage.
  - A decision is a conditional claim, so the first press wins; the report is reopened if a step after the claim fails.
  - A sweep ends the reports of parties that are over and discards reports whose post was never made.
- **Ending a party** goes through `PartyService.endAs`, which says whether the post was deleted or archived.
- **Message commands** are new in the framework: `MessageCommand` in a `messageCommands` list beside `commands`, routed, deployed (at most five) and listed in `/help`.
- **Asks about refused places** extend `MeetupSafety`: stateless `mplace:` controls, one open ask per place, Allow place and Keep refused, and expiry in the appeals' sweep.
- **`/places`** is a staff command (Manage Messages, `requireManagement` inside) with a lookup by place and a paged list.
- **Storage:** migration 022 adds the tables `ModerationReport`, `ModerationReportReason` and `MeetupPlaceAsk`. It also adds the ruling's name, place and source columns to `MeetupPlaceRuling`, and `MeetupBlock.memberName`. The repositories have memory twins and shared cases.
- **Rehearsal:** the moderators' posts go through meetup safety's rehearsal gateway, and Delete message works only in rehearsed posts.

**Tech Stack:**

- TypeScript 6.0, Node 24, discord.js v14 components-v2, Kysely on MySQL 8.4, Vitest. No new dependency.
- **Migration 022** `2026_10_17_022_moderation_reports` (additive; renumber it if another plan takes 022 first).
- The party state document stays at version 11.
- New commands (`/report`, `/places`, the Apps-menu entry) and `/delete`'s new permission need `npm run deploy-commands -- --global` at staging.

**Spec:** `docs/superpowers/specs/2026-10-17-moderation-reports-design.md`, approved by Matt on 2026-10-17. The brief is `.superpowers/sdd/2026-10-17-phase-8s2-moderation-reports/design.md` (git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8s2`, tip `4a21751f`), one commit per task, rebased onto typescript-migration eeaa8013 (with 8T-F and 8M-6). Each commit typechecks. On the tip the full check, the build and the database suite are clean. The two database tests that wait on a real lock passed ten runs in a row.

**Reviews:** three Opus reviewers went through the prototype (tasks 1–3, 4–5, 6–8), and a fourth through fix round 1. Every finding of both rounds (33, then 7) is folded into the commits below.

## Decisions in this plan

These were made while prototyping and reviewing, for Matt to look at:

1. **Limits:**
   - A member may send five reports an hour.
   - Reasons are required, at most 1,000 characters, and white space alone is refused.
   - One report per member per party or message.
   - A member keeps one pending message report at a time; a newer form expires the older one.
2. **The forms:** "Report this meetup to the moderators" (its kind's word), with the field "What is wrong?". A form of the old member `/delete` still open across the deploy is taken as a report.
3. **Without a moderators' channel:** `/report` writes today's public line in the post, the reason cut to 500 characters.
4. **Who appears in the report:** the post names a raid's reporter even when they asked to stay anonymous in public, because the post is staff only.
5. **Closing from a report:**
   - Every action that ends the party asks the moderator first whether to archive or delete the post.
   - Block maker blocks first and ends the reported meetup last, as the moderator chose. The maker's other meetups are archived.
   - When Discord refuses a deletion, the post is archived instead. Both the answer and the report say so.
6. **Failures:**
   - A step that fails after the claim reopens the report. The moderator is told what was done and what was not.
   - Refuse place on a meetup that has moved to a pin answers that nothing changed.
7. **Delete message:**
   - It claims the report first, then deletes.
   - In an archived post it unarchives, deletes and archives again, keeping the post's lock as it was.
   - In rehearsal mode it works only in rehearsed posts.
8. **Asks about places:**
   - The ask uses the place as the ruling recorded it.
   - Keep refused leaves the refusal and records `keptAt`; the 14 days count from the later of the two.
   - Undo ruling closes an open ask as `undone`, with no DM.
9. **`/places`:**
   - Ten entries a page.
   - Blocked members are named by the name stored with the block, else the member, else a mention.
   - Lift block also closes an open appeal, with one DM.
   - The place option takes power spots too, so an old ruling can be undone.
10. **`/help`:** a member who asks for `delete` is told to use `/report`. "Report to moderators" is listed as an Apps-menu entry.
11. **`cutover-check`:** a `reports` line warns when the bot lacks Manage Messages in a region's channel or forum, or Manage Threads in its forum. It never fails.
12. **Accepted:**
    - Reasons carried over from a failed report are kept in memory and lost on a restart.
    - The web map's refusal of a place now adds a pointer to `/meetup` (`src/web/meetup-routes.ts`; the wayfarer session was told).

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, with `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment justifying it.
- `src/domain/` stays pure. **Tests never use the network** and never wait on real time, except the two lock tests named above (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8s2`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock). Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **First press wins:** every claim (reports, asks, appeals, `/places`' lifts) is a conditional update; reasons join only an open report under a row lock.
2. **Nothing stuck or false:**
   - a report of a party that ended;
   - a report whose post was never made;
   - a decision whose steps failed;
   - a deletion Discord refused;
   - an ask or appeal after Undo or Lift.
3. **Across servers:** every new control checks that its party, report, place or member belongs to the presser's server.
4. **Privacy:** nothing public when the moderators' channel is set, and no outcome to the reporter. Members' words go through `plain` / `plainNoLinks`, and members are named, never a bare mention in text.
5. **Discord limits:** the message copy and the reasons fit the post (4,000 characters); message commands are at most five, with names of at most 32 characters.
6. **Rehearsal:** the moderators' posts get through; Delete message works only in rehearsed posts.

### Task 1: Plan 8S-2 T1: Reports, asks about places and the ruling's source in the database

Prototype commit: `0e71a6a429c42f9c66710af830a00edd7a5c507d`

Migration 022 adds ModerationReport with ModerationReportReason (one open report per party
or message, a reason per reporter), MeetupPlaceAsk (one open ask per place) and, on
MeetupPlaceRuling, who ruled by name, the place, the post the ruling came from and when a
refusal was last kept. ReportRepository and MemoryReports run reportCases; the meetup
safety store gains the ruling's record, Undo ruling and the asks (allowed and kept in one
step with their ruling), run by both twins.

**Files:**

```
 src/db/migrations/2026_10_17_022_moderation_reports.ts  | 122 +++++++++++++++++++
 src/db/migrations/index.ts                              |   2 +
 src/db/migrator.db.test.ts                              |   4 +
 src/db/repositories/meetup-safety-repository.db.test.ts |   1 +
 src/db/repositories/meetup-safety-repository.ts         | 367 +++++++++++++++++++++++++++++++++++++++++++++++++++++---
 src/db/repositories/report-repository.db.test.ts        | 132 ++++++++++++++++++++
 src/db/repositories/report-repository.ts                | 276 ++++++++++++++++++++++++++++++++++++++++++
 src/db/table-names.ts                                   |   3 +
 src/db/types.ts                                         |  57 +++++++++
 src/domain/meetups/records.ts                           | 132 +++++++++++++++++++-
 src/domain/moderation/reports.ts                        | 198 ++++++++++++++++++++++++++++++
 src/render/meetup-safety.test.ts                        |   1 +
 test/support/meetup-safety-cases.ts                     | 190 ++++++++++++++++++++++++++++-
 test/support/meetup-safety.ts                           | 203 +++++++++++++++++++++++++++++--
 test/support/report-cases.ts                            | 228 +++++++++++++++++++++++++++++++++++
 test/support/reports.test.ts                            |   7 ++
 test/support/reports.ts                                 | 136 +++++++++++++++++++++
 17 files changed, 2026 insertions(+), 33 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/meetup-safety.test.ts test/support/reports.test.ts`, `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/meetup-safety-repository.db.test.ts src/db/repositories/report-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 0e71a6a429c42f9c66710af830a00edd7a5c507d -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-2 T1: Reports, asks about places and the ruling's source in the database`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/db/migrations/2026_10_17_022_moderation_reports.ts b/src/db/migrations/2026_10_17_022_moderation_reports.ts
new file mode 100644
index 00000000..ee4d25ef
--- /dev/null
+++ b/src/db/migrations/2026_10_17_022_moderation_reports.ts
@@ -0,0 +1,122 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * Reports to the moderators and asks about refused places (plan 8S-2; spec
+ * `2026-10-17-moderation-reports-design.md`). Servers and members are snowflakes without a
+ * foreign key, times epoch milliseconds, as in 019.
+ *
+ * - `ModerationReport`: a report of a party (`kind` `party`, `partyId`) or of one message (`kind`
+ *   `message`, `targetChannelId`, `targetMessageId`), with what the moderators' post shows of it
+ *   (`subject`, JSON: the party's title, lines, place and maker, or the message's author, time,
+ *   text and attachment names, so that the post can be drawn again once the party or the message
+ *   is gone), its `status` (`open`, `closed`, `refused`, `blocked`, `deleted`, `dismissed`,
+ *   `ended`, `gone`), how a party's post went (`removal`: `archive` or `delete`), the moderators'
+ *   post (`channelId`, `messageId`: null until it is sent) and who decided. `openKey`
+ *   (`party <id>` or `message <channel> <message>` while open, null once decided) is unique: one
+ *   open report per party and per message.
+ * - `ModerationReportReason`: the reasons of a report, one per reporter (`reporterId`, the name
+ *   they had, `text`, when).
+ * - `MeetupPlaceAsk`: a member's ask to allow a refused place (`placeKind`, `placeId`, the place
+ *   as JSON for the post), their words, `open`, `allowed`, `kept` or `expired`, its post and who
+ *   decided. `openKey` (`<server> <kind> <id>` while open) is unique: one open ask per place.
+ * - `MeetupPlaceRuling` gains what `/places` and an ask show of a ruling: who made it by name
+ *   (`ruledByName`), the place (`place`, JSON), the post it came from (`sourceKind` `request`,
+ *   `report` or `ask`, `sourceId`, `sourceChannelId`, `sourceMessageId`) and when a moderator
+ *   last kept a refusal on an ask (`keptAt`: members may ask again 14 days after the later of it
+ *   and `ruledAt`). A ruling of 019 has them null.
+ * - `MeetupBlock` gains the blocked member's name (`memberName`: the request's or the reported
+ *   party's maker), for the lists of `/places`; null for a block of 019.
+ *
+ * 022: after 8M-5M's `021_meetup_request_source`; renumbered at the merge if another branch took
+ * it first.
+ *
+ * Safe to run again after a failure half-way: each table is created only when it is missing,
+ * each column added only when it is missing.
+ */
+export const moderationReports: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    await sql`
+      create table if not exists ModerationReport (
+        id char(36) not null,
+        serverId varchar(30) not null,
+        kind varchar(8) not null,
+        partyId char(36) default null,
+        targetChannelId varchar(30) default null,
+        targetMessageId varchar(30) default null,
+        subject json not null,
+        createdAt bigint not null,
+        status varchar(10) not null,
+        openKey varchar(80) default null,
+        removal varchar(8) default null,
+        channelId varchar(30) default null,
+        messageId varchar(30) default null,
+        decidedBy varchar(30) default null,
+        decidedByName varchar(100) default null,
+        decidedAt bigint default null,
+        primary key (id),
+        unique key moderationreport_openkey_unique (openKey),
+        key moderationreport_server_status_index (serverId, status),
+        key moderationreport_party_index (partyId, status)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists ModerationReportReason (
+        reportId char(36) not null,
+        reporterId varchar(30) not null,
+        reporterName varchar(100) default null,
+        text text not null,
+        createdAt bigint not null,
+        primary key (reportId, reporterId)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists MeetupPlaceAsk (
+        id char(36) not null,
+        serverId varchar(30) not null,
+        placeKind varchar(10) not null,
+        placeId varchar(64) not null,
+        place json not null,
+        memberId varchar(30) not null,
+        memberName varchar(100) default null,
+        text text not null,
+        createdAt bigint not null,
+        status varchar(8) not null,
+        openKey varchar(120) default null,
+        channelId varchar(30) default null,
+        messageId varchar(30) default null,
+        decidedBy varchar(30) default null,
+        decidedByName varchar(100) default null,
+        decidedAt bigint default null,
+        primary key (id),
+        unique key meetupplaceask_openkey_unique (openKey),
+        key meetupplaceask_server_status_index (serverId, status)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    const columns: [string, string][] = [
+      ['ruledByName', 'varchar(100) default null'],
+      ['place', 'json default null'],
+      ['sourceKind', 'varchar(8) default null'],
+      ['sourceId', 'char(36) default null'],
+      ['sourceChannelId', 'varchar(30) default null'],
+      ['sourceMessageId', 'varchar(30) default null'],
+      ['keptAt', 'bigint default null'],
+    ];
+    const added: [string, string, string][] = [
+      ...columns.map(([name, type]): [string, string, string] => ['MeetupPlaceRuling', name, type]),
+      ['MeetupBlock', 'memberName', 'varchar(100) default null'],
+    ];
+    for (const [table, name, type] of added) {
+      const existing = await sql<{ n: number }>`
+        select count(*) as n from information_schema.columns
+        where table_schema = database() and table_name = ${table}
+          and column_name = ${name}`.execute(db);
+      if (Number(existing.rows[0]?.n ?? 0) === 0) {
+        await sql`alter table ${sql.raw(table)} add column ${sql.raw(name)} ${sql.raw(type)}`.execute(
+          db,
+        );
+      }
+    }
+  },
+  async down() {
+    // Additive only: nothing is ever dropped.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index b4d30551..cb77f3dd 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -20,6 +20,7 @@ import { partyHistory } from './2026_10_16_018_party_history.js';
 import { meetupSafety } from './2026_10_17_019_meetup_safety.js';
 import { trainSplit } from './2026_10_17_020_train_split.js';
 import { meetupRequestSource } from './2026_10_17_021_meetup_request_source.js';
+import { moderationReports } from './2026_10_17_022_moderation_reports.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -47,4 +48,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_17_019_meetup_safety': meetupSafety,
   '2026_10_17_020_train_split': trainSplit,
   '2026_10_17_021_meetup_request_source': meetupRequestSource,
+  '2026_10_17_022_moderation_reports': moderationReports,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index f71e2e12..2c713701 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -52,6 +52,9 @@ const ADDED_TABLES = [
   'MeetupPlaceRuling',
   'MeetupBlock',
   'MeetupAppeal',
+  'ModerationReport',
+  'ModerationReportReason',
+  'MeetupPlaceAsk',
 ];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = [
@@ -168,6 +171,7 @@ describe('runMigrations', () => {
       '2026_10_17_019_meetup_safety',
       '2026_10_17_020_train_split',
       '2026_10_17_021_meetup_request_source',
+      '2026_10_17_022_moderation_reports',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/meetup-safety-repository.db.test.ts b/src/db/repositories/meetup-safety-repository.db.test.ts
index ace825fb..591437a4 100644
--- a/src/db/repositories/meetup-safety-repository.db.test.ts
+++ b/src/db/repositories/meetup-safety-repository.db.test.ts
@@ -33,6 +33,7 @@ describe('MeetupSafetyRepository', () => {
       'MeetupPlaceRuling',
       'MeetupBlock',
       'MeetupAppeal',
+      'MeetupPlaceAsk',
     ] as const) {
       await db.deleteFrom(table).execute();
     }
diff --git a/src/db/repositories/meetup-safety-repository.ts b/src/db/repositories/meetup-safety-repository.ts
index 839cccf3..93140b4e 100644
--- a/src/db/repositories/meetup-safety-repository.ts
+++ b/src/db/repositories/meetup-safety-repository.ts
@@ -3,6 +3,7 @@ import { REQUEST_DECISIONS } from '../../domain/meetups/records.js';
 import type {
   ApprovalOutcome,
   AppealStatus,
+  AskStatus,
   Decider,
   MeetupAppeal,
   MeetupBlock,
@@ -10,15 +11,26 @@ import type {
   MeetupSafetyStore,
   NewMeetupAppeal,
   NewMeetupRequest,
+  NewPlaceAsk,
+  PlaceAskRecord,
+  PlaceRulingRecord,
   RequestDecision,
   RequestStatus,
+  RulingMore,
+  RulingSource,
 } from '../../domain/meetups/records.js';
 import type { PlaceRuling, RulingKey } from '../../domain/meetups/safety.js';
 import { placeDocument } from '../../domain/party/party-state.js';
 import { TEAMS, type Team } from '../../domain/party/party.js';
 import type { Logger } from '../../log.js';
 import { inTransaction } from '../transaction.js';
-import type { DB, MeetupAppeal as AppealRow, MeetupRequest as RequestRow } from '../types.js';
+import type {
+  DB,
+  MeetupAppeal as AppealRow,
+  MeetupPlaceAsk as AskRow,
+  MeetupPlaceRuling as RulingRow,
+  MeetupRequest as RequestRow,
+} from '../types.js';
 import { isDuplicateEntry } from '../errors.js';
 
 const STATUSES: readonly RequestStatus[] = [
@@ -57,25 +69,240 @@ export class MeetupSafetyRepository implements MeetupSafetyStore {
     return row?.ruling === 'allow' || row?.ruling === 'refuse' ? row.ruling : undefined;
   }
 
-  async rule(serverId: string, key: RulingKey, ruling: PlaceRuling, by: Decider): Promise<void> {
+  async rulingRecord(serverId: string, key: RulingKey): Promise<PlaceRulingRecord | undefined> {
+    const row = await this.db
+      .selectFrom('MeetupPlaceRuling')
+      .selectAll()
+      .where('serverId', '=', serverId)
+      .where('placeKind', '=', key.kind)
+      .where('placeId', '=', key.id)
+      .executeTakeFirst();
+    return row && readRuling(row);
+  }
+
+  rule(
+    serverId: string,
+    key: RulingKey,
+    ruling: PlaceRuling,
+    by: Decider,
+    more: RulingMore = {},
+  ): Promise<void> {
+    return ruleIn(this.db, serverId, key, ruling, by, more);
+  }
+
+  undoRuling(
+    serverId: string,
+    key: RulingKey,
+  ): Promise<{ ruling: PlaceRulingRecord; ask: PlaceAskRecord | undefined } | undefined> {
+    return inTransaction(this.db, async (trx) => {
+      const row = await trx
+        .selectFrom('MeetupPlaceRuling')
+        .selectAll()
+        .where('serverId', '=', serverId)
+        .where('placeKind', '=', key.kind)
+        .where('placeId', '=', key.id)
+        .forUpdate()
+        .executeTakeFirst();
+      if (!row) return undefined;
+      await trx
+        .deleteFrom('MeetupPlaceRuling')
+        .where('serverId', '=', serverId)
+        .where('placeKind', '=', key.kind)
+        .where('placeId', '=', key.id)
+        .execute();
+      const ruling = readRuling(row);
+      if (!ruling) return undefined;
+      // Nothing is left to ask about: the place's open ask is closed with the ruling.
+      const open = await trx
+        .selectFrom('MeetupPlaceAsk')
+        .select('id')
+        .where('openKey', '=', askKey(serverId, key))
+        .executeTakeFirst();
+      if (open) await decideAskIn(trx, open.id, 'undone', null);
+      const asked = open
+        ? await trx
+            .selectFrom('MeetupPlaceAsk')
+            .selectAll()
+            .where('id', '=', open.id)
+            .executeTakeFirst()
+        : undefined;
+      return { ruling, ask: asked && this.readAsk(asked) };
+    });
+  }
+
+  async addAsk(ask: NewPlaceAsk): Promise<'added' | 'open'> {
+    try {
+      await this.db
+        .insertInto('MeetupPlaceAsk')
+        .values({
+          id: ask.id,
+          serverId: ask.serverId,
+          placeKind: ask.key.kind,
+          placeId: ask.key.id,
+          place: JSON.stringify(ask.place),
+          memberId: ask.memberId,
+          memberName: ask.memberName,
+          text: ask.text,
+          createdAt: String(ask.createdAt),
+          status: 'open',
+          openKey: askKey(ask.serverId, ask.key),
+        })
+        .execute();
+      return 'added';
+    } catch (err) {
+      if (isDuplicateEntry(err, 'meetupplaceask_openkey_unique')) return 'open';
+      throw err;
+    }
+  }
+
+  async discardAsk(id: string): Promise<void> {
+    await this.db.deleteFrom('MeetupPlaceAsk').where('id', '=', id).execute();
+  }
+
+  async setAskPost(id: string, channelId: string, messageId: string): Promise<void> {
     await this.db
-      .insertInto('MeetupPlaceRuling')
-      .values({
-        serverId,
-        placeKind: key.kind,
-        placeId: key.id,
-        ruling,
-        ruledBy: by.id,
-        ruledAt: String(by.at),
-      })
-      .onDuplicateKeyUpdate({ ruling, ruledBy: by.id, ruledAt: String(by.at) })
+      .updateTable('MeetupPlaceAsk')
+      .set({ channelId, messageId })
+      .where('id', '=', id)
+      .execute();
+  }
+
+  async ask(id: string): Promise<PlaceAskRecord | undefined> {
+    const row = await this.db
+      .selectFrom('MeetupPlaceAsk')
+      .selectAll()
+      .where('id', '=', id)
+      .executeTakeFirst();
+    return row && this.readAsk(row);
+  }
+
+  async openAsk(serverId: string, key: RulingKey): Promise<PlaceAskRecord | undefined> {
+    const row = await this.db
+      .selectFrom('MeetupPlaceAsk')
+      .selectAll()
+      .where('openKey', '=', askKey(serverId, key))
+      .executeTakeFirst();
+    return row && this.readAsk(row);
+  }
+
+  expireAsk(id: string): Promise<boolean> {
+    return decideAskIn(this.db, id, 'expired', null);
+  }
+
+  allowOnAsk(ask: PlaceAskRecord, by: Decider): Promise<boolean> {
+    return inTransaction(this.db, async (trx) => {
+      if (!(await decideAskIn(trx, ask.id, 'allowed', by))) return false;
+      const posted = await trx
+        .selectFrom('MeetupPlaceAsk')
+        .select(['channelId', 'messageId'])
+        .where('id', '=', ask.id)
+        .executeTakeFirst();
+      const source =
+        posted?.channelId && posted.messageId
+          ? {
+              kind: 'ask' as const,
+              id: ask.id,
+              channelId: posted.channelId,
+              messageId: posted.messageId,
+            }
+          : undefined;
+      await ruleIn(trx, ask.serverId, ask.key, 'allow', by, {
+        place: ask.place,
+        ...(source === undefined ? {} : { source }),
+      });
+      return true;
+    });
+  }
+
+  keepOnAsk(ask: PlaceAskRecord, by: Decider): Promise<'kept' | 'not-open' | 'not-refused'> {
+    return inTransaction(this.db, async (trx) => {
+      // The ruling first, locked: an Undo ruling or an allowance at the same moment waits.
+      const ruling = await trx
+        .selectFrom('MeetupPlaceRuling')
+        .select('ruling')
+        .where('serverId', '=', ask.serverId)
+        .where('placeKind', '=', ask.key.kind)
+        .where('placeId', '=', ask.key.id)
+        .forUpdate()
+        .executeTakeFirst();
+      const open = await trx
+        .selectFrom('MeetupPlaceAsk')
+        .select('status')
+        .where('id', '=', ask.id)
+        .executeTakeFirst();
+      if (open?.status !== 'open') return 'not-open';
+      if (ruling?.ruling !== 'refuse') return 'not-refused';
+      if (!(await decideAskIn(trx, ask.id, 'kept', by))) return 'not-open';
+      await trx
+        .updateTable('MeetupPlaceRuling')
+        .set({ keptAt: String(by.at) })
+        .where('serverId', '=', ask.serverId)
+        .where('placeKind', '=', ask.key.kind)
+        .where('placeId', '=', ask.key.id)
+        .execute();
+      return 'kept';
+    });
+  }
+
+  async staleAsks(stale: {
+    unpostedBefore: number;
+    openedBefore: number;
+  }): Promise<PlaceAskRecord[]> {
+    const rows = await this.db
+      .selectFrom('MeetupPlaceAsk')
+      .selectAll()
+      .where('status', '=', 'open')
+      .where((eb) =>
+        eb.or([
+          eb.and([
+            eb('messageId', 'is', null),
+            eb('createdAt', '<=', String(stale.unpostedBefore)),
+          ]),
+          eb('createdAt', '<=', String(stale.openedBefore)),
+        ]),
+      )
+      .orderBy('createdAt')
+      .orderBy('id')
       .execute();
+    return rows.flatMap((row) => {
+      const ask = this.readAsk(row);
+      return ask ? [ask] : [];
+    });
+  }
+
+  /** An ask as it was stored; undefined (logged) for one whose place does not read. */
+  private readAsk(row: Selectable<AskRow>): PlaceAskRecord | undefined {
+    const place = placeDocument.safeParse(
+      typeof row.place === 'string' ? JSON.parse(row.place) : row.place,
+    );
+    const kind = PLACE_KINDS.find((one) => one === row.placeKind);
+    if (!place.success || place.data.kind === 'pin' || kind === undefined) {
+      this.log?.error({ ask: row.id }, 'an ask about a place cannot be read; it is left alone');
+      return undefined;
+    }
+    return {
+      id: row.id,
+      serverId: row.serverId,
+      key: { kind, id: row.placeId },
+      place: place.data,
+      memberId: row.memberId,
+      memberName: row.memberName,
+      text: row.text,
+      createdAt: Number(row.createdAt),
+      // A status the code does not know is read as decided: it is never offered again.
+      status: ASK_STATUSES.find((one) => one === row.status) ?? 'kept',
+      channelId: row.channelId,
+      messageId: row.messageId,
+      decidedBy: row.decidedBy,
+      decidedByName: row.decidedByName,
+      decidedAt: epoch(row.decidedAt),
+    };
   }
 
   async block(serverId: string, memberId: string): Promise<MeetupBlock | undefined> {
     const row = await this.db
       .selectFrom('MeetupBlock')
-      .select(['serverId', 'memberId', 'blockedBy', 'blockedByName', 'blockedAt'])
+      .select(['serverId', 'memberId', 'memberName', 'blockedBy', 'blockedByName', 'blockedAt'])
       .where('serverId', '=', serverId)
       .where('memberId', '=', memberId)
       .where('liftedAt', 'is', null)
@@ -83,12 +310,17 @@ export class MeetupSafetyRepository implements MeetupSafetyStore {
     return row && { ...row, blockedAt: Number(row.blockedAt) };
   }
 
-  addBlock(serverId: string, memberId: string, by: Decider): Promise<boolean> {
-    return blockIn(this.db, serverId, memberId, by);
+  addBlock(
+    serverId: string,
+    memberId: string,
+    by: Decider,
+    memberName?: string | null,
+  ): Promise<boolean> {
+    return blockIn(this.db, serverId, memberId, by, memberName ?? null);
   }
 
   blockMaker(
-    request: Pick<MeetupRequestRecord, 'id' | 'serverId' | 'makerId'>,
+    request: Pick<MeetupRequestRecord, 'id' | 'serverId' | 'makerId' | 'makerName'>,
     by: Decider,
   ): Promise<{ decided: boolean; newBlock: boolean }> {
     // Read committed: the block's row may not be there yet, and gap locks on it would deadlock
@@ -111,7 +343,7 @@ export class MeetupSafetyRepository implements MeetupSafetyStore {
         if (Number(result?.numUpdatedRows ?? 0) === 0) return { decided: false, newBlock: false };
         return {
           decided: true,
-          newBlock: await blockIn(trx, request.serverId, request.makerId, by),
+          newBlock: await blockIn(trx, request.serverId, request.makerId, by, request.makerName),
         };
       },
       { isolation: 'read committed' },
@@ -431,8 +663,14 @@ async function blockIn(
   serverId: string,
   memberId: string,
   by: Decider,
+  memberName: string | null,
 ): Promise<boolean> {
-  const blocked = { blockedBy: by.id, blockedByName: by.name, blockedAt: String(by.at) };
+  const blocked = {
+    memberName,
+    blockedBy: by.id,
+    blockedByName: by.name,
+    blockedAt: String(by.at),
+  };
   const [renewed] = await db
     .updateTable('MeetupBlock')
     .set({ ...blocked, liftedBy: null, liftedByName: null, liftedAt: null })
@@ -466,6 +704,99 @@ async function liftIn(
   return Number(result?.numUpdatedRows ?? 0) > 0;
 }
 
+/** Rules a place, in place of a ruling it had (whose kept refusal goes with it). */
+async function ruleIn(
+  db: Kysely<DB>,
+  serverId: string,
+  key: RulingKey,
+  ruling: PlaceRuling,
+  by: Decider,
+  more: RulingMore,
+): Promise<void> {
+  const made = {
+    ruling,
+    ruledBy: by.id,
+    ruledByName: by.name,
+    ruledAt: String(by.at),
+    place: more.place === undefined ? null : JSON.stringify(more.place),
+    sourceKind: more.source?.kind ?? null,
+    sourceId: more.source?.id ?? null,
+    sourceChannelId: more.source?.channelId ?? null,
+    sourceMessageId: more.source?.messageId ?? null,
+    keptAt: null,
+  };
+  await db
+    .insertInto('MeetupPlaceRuling')
+    .values({ serverId, placeKind: key.kind, placeId: key.id, ...made })
+    .onDuplicateKeyUpdate(made)
+    .execute();
+}
+
+/** Decides an open ask, the first press winning; false when it was not open. */
+async function decideAskIn(
+  db: Kysely<DB>,
+  id: string,
+  status: Exclude<AskStatus, 'open'>,
+  by: Decider | null,
+): Promise<boolean> {
+  const [result] = await db
+    .updateTable('MeetupPlaceAsk')
+    .set({
+      status,
+      openKey: null,
+      decidedBy: by?.id ?? null,
+      decidedByName: by?.name ?? null,
+      decidedAt: by === null ? null : String(by.at),
+    })
+    .where('id', '=', id)
+    .where('status', '=', 'open')
+    .execute();
+  return Number(result?.numUpdatedRows ?? 0) > 0;
+}
+
+/** The unique key of an open ask: one per place and server. */
+function askKey(serverId: string, key: RulingKey): string {
+  return `${serverId} ${key.kind} ${key.id}`;
+}
+
+const PLACE_KINDS = ['gym', 'stop', 'powerspot'] as const;
+const ASK_STATUSES: readonly AskStatus[] = ['open', 'allowed', 'kept', 'expired', 'undone'];
+const SOURCE_KINDS: readonly RulingSource['kind'][] = ['request', 'report', 'ask'];
+
+/** A ruling as it is kept; a place that does not read (or a pin) is left out of it. */
+function readRuling(row: Selectable<RulingRow>): PlaceRulingRecord | undefined {
+  const kind = PLACE_KINDS.find((one) => one === row.placeKind);
+  if (kind === undefined || (row.ruling !== 'allow' && row.ruling !== 'refuse')) return undefined;
+  const parsed =
+    row.place === null
+      ? undefined
+      : placeDocument.safeParse(typeof row.place === 'string' ? JSON.parse(row.place) : row.place);
+  const place = parsed?.success && parsed.data.kind !== 'pin' ? parsed.data : null;
+  const sourceKind = SOURCE_KINDS.find((one) => one === row.sourceKind);
+  return {
+    serverId: row.serverId,
+    key: { kind, id: row.placeId },
+    ruling: row.ruling,
+    ruledBy: row.ruledBy,
+    ruledByName: row.ruledByName,
+    ruledAt: Number(row.ruledAt),
+    place,
+    source:
+      sourceKind !== undefined &&
+      row.sourceId !== null &&
+      row.sourceChannelId !== null &&
+      row.sourceMessageId !== null
+        ? {
+            kind: sourceKind,
+            id: row.sourceId,
+            channelId: row.sourceChannelId,
+            messageId: row.sourceMessageId,
+          }
+        : null,
+    keptAt: epoch(row.keptAt),
+  };
+}
+
 function teamOf(text: string | null): Team | null {
   return TEAMS.find((team) => team === text) ?? null;
 }
diff --git a/src/db/repositories/report-repository.db.test.ts b/src/db/repositories/report-repository.db.test.ts
new file mode 100644
index 00000000..98837b22
--- /dev/null
+++ b/src/db/repositories/report-repository.db.test.ts
@@ -0,0 +1,132 @@
+import { sql, type Kysely } from 'kysely';
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
+import { requestId, SAFETY_NOW } from '../../../test/support/meetup-safety-cases.js';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import type { TestDatabase } from '../../../test/support/mysql.js';
+import { createDb } from '../kysely.js';
+import {
+  messageSubject,
+  newReport,
+  OTHER_REPORTER,
+  reason,
+  REPORTER,
+  reportCases,
+} from '../../../test/support/report-cases.js';
+import { createTestLogger } from '../../../test/support/test-logger.js';
+import type { DB } from '../types.js';
+import { ReportRepository } from './report-repository.js';
+
+describe('ReportRepository', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+  let database: TestDatabase;
+
+  beforeAll(async () => {
+    ({ db, stop, database } = await startMigratedDatabase());
+  });
+  afterAll(async () => {
+    await stop();
+  });
+
+  const fresh = async () => {
+    await db.deleteFrom('ModerationReportReason').execute();
+    await db.deleteFrom('ModerationReport').execute();
+    return new ReportRepository(db);
+  };
+
+  reportCases(fresh);
+
+  it('opens one report when two report the same message at the same moment', async () => {
+    const store = await fresh();
+    const subject = messageSubject();
+    const both = await Promise.all([
+      store.addReport(newReport(1, subject), reason(REPORTER)),
+      store.addReport(newReport(2, subject), reason(OTHER_REPORTER, { at: SAFETY_NOW + 1 })),
+    ]);
+    expect(both.map((one) => one.kind).sort()).toEqual(['added', 'opened']);
+    const reports = await db.selectFrom('ModerationReport').select('id').execute();
+    expect(reports).toHaveLength(1);
+    const [only] = reports;
+    expect((await store.report(only?.id ?? ''))?.reasons).toHaveLength(2);
+  });
+
+  it('adds a reason only to an open report: one decided meanwhile is followed by a new one', async () => {
+    const store = await fresh();
+    await store.addReport(newReport(1), reason(REPORTER));
+    const other = createDb<DB>(database.config);
+    try {
+      let release = (): void => undefined;
+      const held = new Promise<void>((resolve) => {
+        release = resolve;
+      });
+      let locked = (): void => undefined;
+      const isLocked = new Promise<void>((resolve) => {
+        locked = resolve;
+      });
+      // A moderator's decision holds the report's row while a second reason comes.
+      let otherId = 0;
+      const deciding = other.transaction().execute(async (trx) => {
+        const own = await sql<{ id: number | string }>`select connection_id() as id`.execute(trx);
+        otherId = Number(own.rows[0]?.id);
+        await trx
+          .selectFrom('ModerationReport')
+          .select('id')
+          .where('id', '=', requestId(201))
+          .forUpdate()
+          .execute();
+        locked();
+        await held;
+        await trx
+          .updateTable('ModerationReport')
+          .set({ status: 'dismissed', openKey: null })
+          .where('id', '=', requestId(201))
+          .execute();
+      });
+      await isLocked;
+      const adding = store.addReport(newReport(2), reason(OTHER_REPORTER, { at: SAFETY_NOW + 1 }));
+      // The reason's transaction waits for the decision's lock: a transaction of this database's
+      // user (the server is shared), not the decision's own, in LOCK WAIT. Asked until it is, or
+      // until the deadline: a real MySQL tells nobody when a statement begins to wait.
+      const waiting = async () => {
+        const rows = await sql<{ waits: number | string }>`
+          select count(*) as waits
+          from information_schema.innodb_trx t
+          join information_schema.processlist p on p.id = t.trx_mysql_thread_id
+          where t.trx_state = 'LOCK WAIT' and t.trx_mysql_thread_id <> ${otherId}
+            and p.user = substring_index(current_user(), '@', 1)`.execute(db);
+        return Number(rows.rows[0]?.waits);
+      };
+      const deadline = Date.now() + 10_000;
+      let waits = await waiting();
+      while (waits === 0 && Date.now() < deadline) {
+        // InnoDB fills `innodb_trx` anew only once it has not been read for 0.1 seconds: asked
+        // more often, it would show the same moment for ever.
+        // eslint-disable-next-line no-restricted-syntax -- a real MySQL: polled until the statement waits
+        await new Promise((resolve) => setTimeout(resolve, 150));
+        waits = await waiting();
+      }
+      expect(waits).toBe(1);
+      release();
+      await deciding;
+      expect(await adding).toMatchObject({ kind: 'opened', report: { id: requestId(202) } });
+      expect((await store.report(requestId(201)))?.reasons).toHaveLength(1);
+    } finally {
+      await other.destroy();
+    }
+  });
+
+  it('leaves a report whose subject does not read alone, and says so', async () => {
+    await fresh();
+    const { log, entries } = createTestLogger();
+    const store = new ReportRepository(db, log);
+    await store.addReport(newReport(1), reason());
+    await db
+      .updateTable('ModerationReport')
+      .set({ subject: JSON.stringify({ kind: 'castle' }) })
+      .execute();
+    expect(await store.report(requestId(201))).toBeUndefined();
+    expect(
+      entries.filter((entry) => entry.msg === 'a report cannot be read; it is left alone'),
+    ).toHaveLength(1);
+  });
+});
diff --git a/src/db/repositories/report-repository.ts b/src/db/repositories/report-repository.ts
new file mode 100644
index 00000000..d6bd856b
--- /dev/null
+++ b/src/db/repositories/report-repository.ts
@@ -0,0 +1,276 @@
+import type { Kysely, Selectable } from 'kysely';
+import type { Decider } from '../../domain/meetups/records.js';
+import {
+  REPORT_STATUSES,
+  reportSubject,
+  reportTargetKey,
+  type ModerationReport,
+  type NewReport,
+  type PostRemoval,
+  type ReasonAdded,
+  type ReportReason,
+  type ReportStatus,
+  type ReportStore,
+  type ReportSubject,
+} from '../../domain/moderation/reports.js';
+import type { Logger } from '../../log.js';
+import { isDuplicateEntry } from '../errors.js';
+import { inTransaction } from '../transaction.js';
+import type { DB, ModerationReport as ReportRow } from '../types.js';
+
+const epoch = (value: string | null): number | null => (value === null ? null : Number(value));
+
+/** How often a reason tries to open or join a report while others decide or open it meanwhile. */
+const ADD_TRIES = 3;
+
+/**
+ * Reports to the moderators (plan 8S-2), in the tables of migration 022: `ModerationReport` and
+ * `ModerationReportReason`. Its twin in memory is `MemoryReports`; both run `reportCases`
+ * (`test/support/report-cases.ts`). A report whose subject does not read is logged and left
+ * alone, as if it were not there.
+ */
+export class ReportRepository implements ReportStore {
+  constructor(
+    private readonly db: Kysely<DB>,
+    private readonly log?: Logger,
+  ) {}
+
+  async addReport(report: NewReport, reason: ReportReason): Promise<ReasonAdded> {
+    // A subject that would not read back is refused before anything is kept.
+    reportSubject.parse(report.subject);
+    const openKey = reportTargetKey(report.subject);
+    for (let attempt = 0; attempt < ADD_TRIES; attempt++) {
+      // The open report locked, then the reason: a reason joins a report only while it is open
+      // (a decision at the same moment waits, or comes first and the reason opens a new one).
+      // Read committed: no gap lock where there is no open report, so two first reasons of one
+      // subject do not deadlock; the second meets the unique key and joins the first.
+      const outcome = await inTransaction(
+        this.db,
+        async (trx): Promise<{ kind: ReasonAdded['kind']; id: string } | undefined> => {
+          // Found by its key, locked by its id (a lock on the key's index as well would deadlock
+          // with a decision, which changes the key), and still open once locked.
+          const found = await trx
+            .selectFrom('ModerationReport')
+            .select('id')
+            .where('openKey', '=', openKey)
+            .executeTakeFirst();
+          const open =
+            found &&
+            (await trx
+              .selectFrom('ModerationReport')
+              .select('id')
+              .where('id', '=', found.id)
+              .where('status', '=', 'open')
+              .forUpdate()
+              .executeTakeFirst());
+          // Decided while this waited: the next try opens a report anew.
+          if (found && !open) return undefined;
+          if (open) {
+            try {
+              await insertReason(trx, open.id, reason);
+              return { kind: 'added', id: open.id };
+            } catch (err) {
+              if (isDuplicateEntry(err, 'PRIMARY')) return { kind: 'already', id: open.id };
+              throw err;
+            }
+          }
+          if (!(await this.open(trx, report, openKey))) return undefined;
+          // The report and its first reason in one step: a report never has none.
+          await insertReason(trx, report.id, reason);
+          return { kind: 'opened', id: report.id };
+        },
+        { isolation: 'read committed' },
+      );
+      // Opened by another reason meanwhile: the next try joins it.
+      if (outcome) return { kind: outcome.kind, report: await this.reportOrThrow(outcome.id) };
+    }
+    throw new Error('a reason found its report decided and opened again too often');
+  }
+
+  /** Opens a report; false when one of its subject was opened meanwhile (the unique key). */
+  private async open(trx: Kysely<DB>, report: NewReport, openKey: string): Promise<boolean> {
+    try {
+      await trx
+        .insertInto('ModerationReport')
+        .values({
+          id: report.id,
+          serverId: report.serverId,
+          kind: report.subject.kind,
+          partyId: report.subject.kind === 'party' ? report.subject.partyId : null,
+          targetChannelId: report.subject.kind === 'message' ? report.subject.channelId : null,
+          targetMessageId: report.subject.kind === 'message' ? report.subject.messageId : null,
+          subject: JSON.stringify(report.subject),
+          createdAt: String(report.createdAt),
+          status: 'open',
+          openKey,
+        })
+        .execute();
+    } catch (err) {
+      if (isDuplicateEntry(err, 'moderationreport_openkey_unique')) return false;
+      throw err;
+    }
+    return true;
+  }
+
+  async report(id: string): Promise<ModerationReport | undefined> {
+    const row = await this.db
+      .selectFrom('ModerationReport')
+      .selectAll()
+      .where('id', '=', id)
+      .executeTakeFirst();
+    if (!row) return undefined;
+    return (await this.readAll([row]))[0];
+  }
+
+  private async reportOrThrow(id: string): Promise<ModerationReport> {
+    const found = await this.report(id);
+    if (!found) throw new Error(`report ${id} cannot be read`);
+    return found;
+  }
+
+  async setReportPost(id: string, channelId: string, messageId: string): Promise<void> {
+    await this.db
+      .updateTable('ModerationReport')
+      .set({ channelId, messageId })
+      .where('id', '=', id)
+      .execute();
+  }
+
+  async setSubject(id: string, subject: ReportSubject): Promise<void> {
+    reportSubject.parse(subject);
+    await this.db
+      .updateTable('ModerationReport')
+      .set({ subject: JSON.stringify(subject) })
+      .where('id', '=', id)
+      .execute();
+  }
+
+  async discardReport(id: string): Promise<void> {
+    await inTransaction(this.db, async (trx) => {
+      await trx.deleteFrom('ModerationReportReason').where('reportId', '=', id).execute();
+      await trx.deleteFrom('ModerationReport').where('id', '=', id).execute();
+    });
+  }
+
+  async decideReport(
+    id: string,
+    status: Exclude<ReportStatus, 'open'>,
+    removal: PostRemoval | null,
+    by: Decider | null,
+  ): Promise<boolean> {
+    const [result] = await this.db
+      .updateTable('ModerationReport')
+      .set({
+        status,
+        removal,
+        openKey: null,
+        decidedBy: by?.id ?? null,
+        decidedByName: by?.name ?? null,
+        decidedAt: by === null ? null : String(by.at),
+      })
+      .where('id', '=', id)
+      .where('status', '=', 'open')
+      .execute();
+    return Number(result?.numUpdatedRows ?? 0) > 0;
+  }
+
+  async openReportsOfParty(partyId: string): Promise<ModerationReport[]> {
+    const rows = await this.db
+      .selectFrom('ModerationReport')
+      .selectAll()
+      .where('partyId', '=', partyId)
+      .where('status', '=', 'open')
+      .orderBy('createdAt')
+      .orderBy('id')
+      .execute();
+    return this.readAll(rows);
+  }
+
+  async openReports(serverId: string): Promise<ModerationReport[]> {
+    const rows = await this.db
+      .selectFrom('ModerationReport')
+      .selectAll()
+      .where('serverId', '=', serverId)
+      .where('status', '=', 'open')
+      .orderBy('createdAt')
+      .orderBy('id')
+      .execute();
+    return this.readAll(rows);
+  }
+
+  async unpostedReports(before: number): Promise<ModerationReport[]> {
+    const rows = await this.db
+      .selectFrom('ModerationReport')
+      .selectAll()
+      .where('status', '=', 'open')
+      .where('messageId', 'is', null)
+      .where('createdAt', '<=', String(before))
+      .orderBy('createdAt')
+      .orderBy('id')
+      .execute();
+    return this.readAll(rows);
+  }
+
+  /** The reports of these rows with their reasons; a row that does not read is logged and left out. */
+  private async readAll(rows: Selectable<ReportRow>[]): Promise<ModerationReport[]> {
+    if (rows.length === 0) return [];
+    const reasons = await this.db
+      .selectFrom('ModerationReportReason')
+      .selectAll()
+      .where(
+        'reportId',
+        'in',
+        rows.map((row) => row.id),
+      )
+      .orderBy('createdAt')
+      .orderBy('reporterId')
+      .execute();
+    return rows.flatMap((row) => {
+      const subject = reportSubject.safeParse(
+        typeof row.subject === 'string' ? JSON.parse(row.subject) : row.subject,
+      );
+      const status = REPORT_STATUSES.find((one) => one === row.status);
+      if (!subject.success || status === undefined) {
+        this.log?.error({ report: row.id }, 'a report cannot be read; it is left alone');
+        return [];
+      }
+      return [
+        {
+          id: row.id,
+          serverId: row.serverId,
+          subject: subject.data,
+          createdAt: Number(row.createdAt),
+          status,
+          removal: row.removal === 'archive' || row.removal === 'delete' ? row.removal : null,
+          channelId: row.channelId,
+          messageId: row.messageId,
+          decidedBy: row.decidedBy,
+          decidedByName: row.decidedByName,
+          decidedAt: epoch(row.decidedAt),
+          reasons: reasons
+            .filter((one) => one.reportId === row.id)
+            .map((one) => ({
+              reporterId: one.reporterId,
+              reporterName: one.reporterName,
+              text: one.text,
+              at: Number(one.createdAt),
+            })),
+        },
+      ];
+    });
+  }
+}
+
+function reasonRow(reportId: string, reason: ReportReason) {
+  return {
+    reportId,
+    reporterId: reason.reporterId,
+    reporterName: reason.reporterName,
+    text: reason.text,
+    createdAt: String(reason.at),
+  };
+}
+
+async function insertReason(db: Kysely<DB>, reportId: string, reason: ReportReason): Promise<void> {
+  await db.insertInto('ModerationReportReason').values(reasonRow(reportId, reason)).execute();
+}
diff --git a/src/db/table-names.ts b/src/db/table-names.ts
index 7e12fc8a..2a358d56 100644
--- a/src/db/table-names.ts
+++ b/src/db/table-names.ts
@@ -22,8 +22,11 @@ export const PINE_TABLES: readonly string[] = [
   'HistoryOptIn',
   'MeetupAppeal',
   'MeetupBlock',
+  'MeetupPlaceAsk',
   'MeetupPlaceRuling',
   'MeetupRequest',
+  'ModerationReport',
+  'ModerationReportReason',
   'NewTrainNotification',
   'Party',
   'PartyAccessGrant',
diff --git a/src/db/types.ts b/src/db/types.ts
index b757d8a8..9c70133b 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -170,16 +170,43 @@ export interface MeetupBlock {
   liftedBy: string | null;
   liftedByName: string | null;
   memberId: string;
+  memberName: string | null;
   serverId: string;
 }
 
+export interface MeetupPlaceAsk {
+  channelId: string | null;
+  createdAt: string;
+  decidedAt: string | null;
+  decidedBy: string | null;
+  decidedByName: string | null;
+  id: string;
+  memberId: string;
+  memberName: string | null;
+  messageId: string | null;
+  openKey: string | null;
+  place: Json;
+  placeId: string;
+  placeKind: string;
+  serverId: string;
+  status: string;
+  text: string;
+}
+
 export interface MeetupPlaceRuling {
+  keptAt: string | null;
+  place: Json | null;
   placeId: string;
   placeKind: string;
   ruledAt: string;
   ruledBy: string;
+  ruledByName: string | null;
   ruling: string;
   serverId: string;
+  sourceChannelId: string | null;
+  sourceId: string | null;
+  sourceKind: string | null;
+  sourceMessageId: string | null;
 }
 
 export interface MeetupRequest {
@@ -206,6 +233,33 @@ export interface MeetupRequest {
   status: string;
 }
 
+export interface ModerationReport {
+  channelId: string | null;
+  createdAt: string;
+  decidedAt: string | null;
+  decidedBy: string | null;
+  decidedByName: string | null;
+  id: string;
+  kind: string;
+  messageId: string | null;
+  openKey: string | null;
+  partyId: string | null;
+  removal: string | null;
+  serverId: string;
+  status: string;
+  subject: Json;
+  targetChannelId: string | null;
+  targetMessageId: string | null;
+}
+
+export interface ModerationReportReason {
+  createdAt: string;
+  reporterId: string;
+  reporterName: string | null;
+  reportId: string;
+  text: string;
+}
+
 export interface NewTrainNotification {
   createdAt: string;
   guildId: number;
@@ -499,8 +553,11 @@ export interface DB {
   HistoryOptIn: HistoryOptIn;
   MeetupAppeal: MeetupAppeal;
   MeetupBlock: MeetupBlock;
+  MeetupPlaceAsk: MeetupPlaceAsk;
   MeetupPlaceRuling: MeetupPlaceRuling;
   MeetupRequest: MeetupRequest;
+  ModerationReport: ModerationReport;
+  ModerationReportReason: ModerationReportReason;
   NewTrainNotification: NewTrainNotification;
   Party: Party;
   PartyAccessGrant: PartyAccessGrant;
diff --git a/src/domain/meetups/records.ts b/src/domain/meetups/records.ts
index 48609e68..f065f816 100644
--- a/src/domain/meetups/records.ts
+++ b/src/domain/meetups/records.ts
@@ -1,4 +1,4 @@
-import type { Place } from '../geo/place.js';
+import type { KnownPlace, Place } from '../geo/place.js';
 import type { Team } from '../party/party.js';
 import type { PlaceRuling, RulingKey } from './safety.js';
 
@@ -88,6 +88,11 @@ export interface Decider {
 export interface MeetupBlock {
   serverId: string;
   memberId: string;
+  /**
+   * The member's name when they were blocked (plan 8S-2: the request's or the reported party's
+   * maker), for the lists of `/places`; null for a block of 8S-1, or where none was known.
+   */
+  memberName: string | null;
   blockedBy: string;
   blockedByName: string | null;
   blockedAt: number;
@@ -124,12 +129,99 @@ export type NewMeetupAppeal = Pick<
   'id' | 'serverId' | 'memberId' | 'memberName' | 'text' | 'createdAt'
 >;
 
+/**
+ * The moderators' post a ruling came from (plan 8S-2): a request's (Approve, Refuse from now
+ * on), a report's (Refuse place…) or an ask's (Allow place).
+ */
+export interface RulingSource {
+  kind: 'request' | 'report' | 'ask';
+  id: string;
+  channelId: string;
+  messageId: string;
+}
+
+/** A server's ruling of a place as it is kept, with who made it, when and from where. */
+export interface PlaceRulingRecord {
+  serverId: string;
+  key: RulingKey;
+  ruling: PlaceRuling;
+  ruledBy: string;
+  ruledByName: string | null;
+  ruledAt: number;
+  /** The place as it was ruled; null for a ruling made before plan 8S-2. */
+  place: KnownPlace | null;
+  source: RulingSource | null;
+  /** When a moderator last kept the refusal on an ask: members may ask again 14 days later. */
+  keptAt: number | null;
+}
+
+/** What else a ruling keeps besides the decision: the place and the post it came from. */
+export interface RulingMore {
+  place?: KnownPlace;
+  source?: RulingSource;
+}
+
+/**
+ * Where an ask about a refused place stands (plan 8S-2): with the moderators; allowed (the
+ * place is allowed from now on); kept (refused still, the 14 days begin again); or expired
+ * (nobody decided in seven days, or its post was never made); undone (a moderator undid the
+ * place's ruling on `/places`: there is nothing to ask about any more).
+ */
+export type AskStatus = 'open' | 'allowed' | 'kept' | 'expired' | 'undone';
+
+/** As much as an ask says. */
+export const MAX_ASK = 1000;
+
+/** A member's ask to allow meetups at a place the moderators refused for good. */
+export interface PlaceAskRecord {
+  /** A UUID, in the custom ids of its post. */
+  id: string;
+  serverId: string;
+  key: RulingKey;
+  /** The place as the member named it. */
+  place: KnownPlace;
+  memberId: string;
+  memberName: string | null;
+  text: string;
+  createdAt: number;
+  status: AskStatus;
+  channelId: string | null;
+  messageId: string | null;
+  decidedBy: string | null;
+  decidedByName: string | null;
+  decidedAt: number | null;
+}
+
+export type NewPlaceAsk = Pick<
+  PlaceAskRecord,
+  'id' | 'serverId' | 'key' | 'place' | 'memberId' | 'memberName' | 'text' | 'createdAt'
+>;
+
 /** What meetup safety keeps: `MeetupSafetyRepository`, and `MemoryMeetupSafety` in tests. */
 export interface MeetupSafetyStore {
   /** A server's ruling of a place; undefined for none. */
   ruling(serverId: string, key: RulingKey): Promise<PlaceRuling | undefined>;
-  /** Rules a place for good, in place of a ruling it had. */
-  rule(serverId: string, key: RulingKey, ruling: PlaceRuling, by: Decider): Promise<void>;
+  /** A server's ruling of a place as it is kept; undefined for none. */
+  rulingRecord(serverId: string, key: RulingKey): Promise<PlaceRulingRecord | undefined>;
+  /**
+   * Rules a place for good, in place of a ruling it had (whose kept refusal, `keptAt`, goes with
+   * it), with the place and the post it came from when given.
+   */
+  rule(
+    serverId: string,
+    key: RulingKey,
+    ruling: PlaceRuling,
+    by: Decider,
+    more?: RulingMore,
+  ): Promise<void>;
+  /**
+   * Removes a place's ruling (Undo ruling), and closes the place's open ask as `undone` in the
+   * same step (no decider): the ruling that was removed and the ask closed, undefined for none.
+   */
+  undoRuling(
+    serverId: string,
+    key: RulingKey,
+  ): Promise<{ ruling: PlaceRulingRecord; ask: PlaceAskRecord | undefined } | undefined>;
 
   /** The member's block in a server, while it stands. */
   block(serverId: string, memberId: string): Promise<MeetupBlock | undefined>;
@@ -137,7 +229,12 @@ export interface MeetupSafetyStore {
    * Blocks a member; false when they are blocked already (the first block stands). A block
    * lifted before is blocked again in its place: only the last lift is kept.
    */
-  addBlock(serverId: string, memberId: string, by: Decider): Promise<boolean>;
+  addBlock(
+    serverId: string,
+    memberId: string,
+    by: Decider,
+    memberName?: string | null,
+  ): Promise<boolean>;
   /**
    * Block member on a request, in one step: the request, while pending, is refused (`decision`
    * `block`), and its maker blocked in its server. `decided` false: it was not pending any more
@@ -146,7 +243,7 @@ export interface MeetupSafetyStore {
    * caller's, and throws when asked to (`inTransaction`).
    */
   blockMaker(
-    request: Pick<MeetupRequestRecord, 'id' | 'serverId' | 'makerId'>,
+    request: Pick<MeetupRequestRecord, 'id' | 'serverId' | 'makerId' | 'makerName'>,
     by: Decider,
   ): Promise<{ decided: boolean; newBlock: boolean }>;
   /** Lifts a member's block, keeping who lifted it (the last lift); false when none stood. */
@@ -215,4 +312,29 @@ export interface MeetupSafetyStore {
    * `unpostedBefore` or earlier, or that were made at `openedBefore` or earlier. Oldest first.
    */
   staleAppeals(stale: { unpostedBefore: number; openedBefore: number }): Promise<MeetupAppeal[]>;
+
+  /** Stores a new ask, open; `open` when the place has one open already in that server. */
+  addAsk(ask: NewPlaceAsk): Promise<'added' | 'open'>;
+  discardAsk(id: string): Promise<void>;
+  setAskPost(id: string, channelId: string, messageId: string): Promise<void>;
+  ask(id: string): Promise<PlaceAskRecord | undefined>;
+  /** The open ask of a place in a server. */
+  openAsk(serverId: string, key: RulingKey): Promise<PlaceAskRecord | undefined>;
+  /** Expires an open ask (nobody decided in time); false when it was not open. */
+  expireAsk(id: string): Promise<boolean>;
+  /**
+   * Allow place on an ask, in one step: the ask, while open, is decided `allowed`, and the place
+   * allowed for good (its source the ask's post). False when it was not open (the first press
+   * won): nothing is ruled.
+   */
+  allowOnAsk(ask: PlaceAskRecord, by: Decider): Promise<boolean>;
+  /**
+   * Keep refused on an ask, in one step: the ask, while open, is decided `kept`, and the place's
+   * refusal kept (`keptAt`: the 14 days begin again). `not-open` when it was not open (the first
+   * press won); `not-refused` when no refusal of the place stands (undone or allowed meanwhile):
+   * nothing is decided or kept.
+   */
+  keepOnAsk(ask: PlaceAskRecord, by: Decider): Promise<'kept' | 'not-open' | 'not-refused'>;
+  /** The open asks that are stale (as `staleAppeals`), oldest first. */
+  staleAsks(stale: { unpostedBefore: number; openedBefore: number }): Promise<PlaceAskRecord[]>;
 }
diff --git a/src/domain/moderation/reports.ts b/src/domain/moderation/reports.ts
new file mode 100644
index 00000000..27411331
--- /dev/null
+++ b/src/domain/moderation/reports.ts
@@ -0,0 +1,198 @@
+import { z } from 'zod';
+import type { Place } from '../geo/place.js';
+import type { Decider } from '../meetups/records.js';
+import type { PartyType } from '../party/party.js';
+import { placeDocument } from '../party/party-state.js';
+
+/**
+ * Reports to the moderators (plan 8S-2; spec `2026-10-17-moderation-reports-design.md`): a
+ * member reports a party (`/report`, or "Report to moderators" in the Apps menu of its post) or
+ * a single message, privately, with a reason; the moderators decide on the report's post in
+ * their channel. Reports of one party or one message gather on one open report, a reason per
+ * reporter. Kept in the database (`ReportRepository`), so that a press on an old post works
+ * after a restart.
+ */
+
+/**
+ * Where a report stands: open; for a party, `closed` (ended by a moderator), `refused` (a
+ * meetup ended and its place refused for good), `blocked` (a meetup ended and its maker
+ * blocked), `ended` (the party ended by itself first); for a message, `deleted` (a moderator
+ * deleted it) or `gone` (it was deleted before); `dismissed` for either.
+ */
+export const REPORT_STATUSES = [
+  'open',
+  'closed',
+  'refused',
+  'blocked',
+  'deleted',
+  'dismissed',
+  'ended',
+  'gone',
+] as const;
+export type ReportStatus = (typeof REPORT_STATUSES)[number];
+
+/** How a party's post went when a moderator ended the party: archived and locked, or deleted. */
+export type PostRemoval = 'archive' | 'delete';
+
+/** As much as a reason says. */
+export const MAX_REPORT_REASON = 1000;
+
+/** What the moderators' post shows of a reported party: as it was when it was last reported. */
+export interface PartySubject {
+  kind: 'party';
+  partyId: string;
+  partyType: PartyType;
+  /** The post's title. */
+  title: string;
+  /** What the party is and when, as a direct message's brief says it (`PartyBrief.lines`). */
+  lines: string[];
+  /** The region's text channel; null for a party whose region is gone. */
+  regionChannelId: string | null;
+  postId: string | null;
+  /** Where it is: a raid's gym, a train's stop, a meetup's place; null for none. */
+  place: Place | null;
+  /** A gym's official name when its post shows another (its nickname). */
+  officialName: string | null;
+  makerId: string;
+  makerName: string | null;
+  /** What a meetup's members wrote about it. */
+  information: string | null;
+}
+
+/** What the moderators' post shows of a reported message: a copy, kept when it is deleted. */
+export interface MessageSubject {
+  kind: 'message';
+  channelId: string;
+  messageId: string;
+  authorId: string;
+  authorName: string | null;
+  /** When it was written. */
+  sentAt: number;
+  /** Its text, cut to `MESSAGE_COPY_ROOM`. */
+  text: string;
+  /** The names of its attachments (Discord deletes the files of a deleted message). */
+  attachments: string[];
+  /** The party whose post it is in, when it is: named in the moderators' post. */
+  partyTitle: string | null;
+}
+
+export type ReportSubject = PartySubject | MessageSubject;
+
+/** As much of a reported message's text as is kept and shown. */
+export const MESSAGE_COPY_ROOM = 1500;
+
+/** As many of a reported message's attachments as are named. */
+export const MAX_ATTACHMENT_NAMES = 10;
+
+const snowflake = z.string().min(1).max(30);
+const text = (max: number) => z.string().max(max);
+
+/** The subject as it is stored (`ModerationReport.subject`), checked when it is read. */
+export const reportSubject = z.discriminatedUnion('kind', [
+  z.object({
+    kind: z.literal('party'),
+    partyId: z.string().min(1).max(36),
+    partyType: z.enum(['raid', 'meetup', 'train']),
+    title: text(200),
+    lines: z.array(text(1000)).max(10),
+    regionChannelId: snowflake.nullable(),
+    postId: snowflake.nullable(),
+    place: placeDocument.nullable(),
+    officialName: text(255).nullable(),
+    makerId: snowflake,
+    makerName: text(100).nullable(),
+    information: text(2000).nullable(),
+  }),
+  z.object({
+    kind: z.literal('message'),
+    channelId: snowflake,
+    messageId: snowflake,
+    authorId: snowflake,
+    authorName: text(100).nullable(),
+    sentAt: z.number().int().nonnegative(),
+    text: text(MESSAGE_COPY_ROOM),
+    attachments: z.array(text(255)).max(MAX_ATTACHMENT_NAMES),
+    partyTitle: text(200).nullable(),
+  }),
+]);
+
+/** One member's reason. */
+export interface ReportReason {
+  reporterId: string;
+  reporterName: string | null;
+  text: string;
+  at: number;
+}
+
+/** A report to the moderators, with its reasons in the order they came. */
+export interface ModerationReport {
+  /** A UUID, in the custom ids of its post. */
+  id: string;
+  serverId: string;
+  subject: ReportSubject;
+  createdAt: number;
+  status: ReportStatus;
+  /** How a party's post went, once a moderator ended the party. */
+  removal: PostRemoval | null;
+  /** The moderators' post: null until it is sent. */
+  channelId: string | null;
+  messageId: string | null;
+  decidedBy: string | null;
+  decidedByName: string | null;
+  decidedAt: number | null;
+  reasons: ReportReason[];
+}
+
+/** A report as it is first stored: open, without its post. */
+export type NewReport = Pick<ModerationReport, 'id' | 'serverId' | 'subject' | 'createdAt'>;
+
+/** What came of a reason given (`ReportStore.addReport`). */
+export type ReasonAdded =
+  /** A new report, with this reason as its first. */
+  | { kind: 'opened'; report: ModerationReport }
+  /** The reason joined the open report of the same party or message. */
+  | { kind: 'added'; report: ModerationReport }
+  /** This member has a reason in the open report already. */
+  | { kind: 'already'; report: ModerationReport };
+
+/**
+ * The key of what a report is about, which one open report at a time may have: `party <id>`,
+ * `message <channel> <message>`.
+ */
+export function reportTargetKey(subject: ReportSubject): string {
+  return subject.kind === 'party'
+    ? `party ${subject.partyId}`
+    : `message ${subject.channelId} ${subject.messageId}`;
+}
+
+/** What is kept of reports: `ReportRepository`, and `MemoryReports` in tests. */
+export interface ReportStore {
+  /**
+   * A member's reason: it opens a report of its subject (with `report`'s id), or joins the open
+   * report of the same party or message (`added`), unless this member has a reason there already
+   * (`already`). Opening one and its first reason are one step.
+   */
+  addReport(report: NewReport, reason: ReportReason): Promise<ReasonAdded>;
+  report(id: string): Promise<ModerationReport | undefined>;
+  setReportPost(id: string, channelId: string, messageId: string): Promise<void>;
+  /** What the post shows of the subject, as it is now (a party changed since it was reported). */
+  setSubject(id: string, subject: ReportSubject): Promise<void>;
+  /** Forgets a report whose post could not be sent, with its reasons. */
+  discardReport(id: string): Promise<void>;
+  /**
+   * Decides an open report, the first decision winning: false when it was not open (or is gone).
+   * `by` is null for what nobody decided (`ended`, `gone` found by the sweep).
+   */
+  decideReport(
+    id: string,
+    status: Exclude<ReportStatus, 'open'>,
+    removal: PostRemoval | null,
+    by: Decider | null,
+  ): Promise<boolean>;
+  /** The open reports of a party (one at most, but a stale one may linger), oldest first. */
+  openReportsOfParty(partyId: string): Promise<ModerationReport[]>;
+  /** The open reports of a server, oldest first. */
+  openReports(serverId: string): Promise<ModerationReport[]>;
+  /** The open reports whose post was never recorded and that were made at `before` or earlier. */
+  unpostedReports(before: number): Promise<ModerationReport[]>;
+}
diff --git a/src/render/meetup-safety.test.ts b/src/render/meetup-safety.test.ts
index 5dc93232..f2660ac6 100644
--- a/src/render/meetup-safety.test.ts
+++ b/src/render/meetup-safety.test.ts
@@ -137,6 +137,7 @@ describe('appealMessage', () => {
   const block = {
     serverId: appeal.serverId,
     memberId: appeal.memberId,
+    memberName: 'Alice',
     blockedBy: '200000000000000009',
     blockedByName: 'Mod',
     blockedAt: SAFETY_NOW,
diff --git a/test/support/meetup-safety-cases.ts b/test/support/meetup-safety-cases.ts
index f704caf0..878ac1d3 100644
--- a/test/support/meetup-safety-cases.ts
+++ b/test/support/meetup-safety-cases.ts
@@ -5,6 +5,8 @@ import type {
   MeetupSafetyStore,
   NewMeetupAppeal,
   NewMeetupRequest,
+  NewPlaceAsk,
+  PlaceAskRecord,
 } from '../../src/domain/meetups/records.js';
 
 export const SAFETY_SERVER = '412345678901234567';
@@ -73,6 +75,34 @@ export function newAppeal(n: number, overrides: Partial<NewMeetupAppeal> = {}):
 
 export const MOD: Decider = { id: MODERATOR, name: 'Mod', at: SAFETY_NOW + HOUR };
 
+/** Alice's ask to allow meetups at the Little Free Library again, made at `SAFETY_NOW`. */
+export function newAsk(n: number, overrides: Partial<NewPlaceAsk> = {}): NewPlaceAsk {
+  return {
+    id: requestId(300 + n),
+    serverId: SAFETY_SERVER,
+    key: { kind: 'stop', id: LIBRARY.id },
+    place: LIBRARY,
+    memberId: MAKER,
+    memberName: 'Alice',
+    text: 'It is a public park now.',
+    createdAt: SAFETY_NOW,
+    ...overrides,
+  };
+}
+
+/** That ask as it is kept while open, without its post. */
+export function newAskRecord(n: number, overrides: Partial<NewPlaceAsk> = {}): PlaceAskRecord {
+  return {
+    ...newAsk(n, overrides),
+    status: 'open',
+    channelId: null,
+    messageId: null,
+    decidedBy: null,
+    decidedByName: null,
+    decidedAt: null,
+  };
+}
+
 /**
  * What meetup safety keeps, run against the repository and its twin in memory alike. `made`
  * gives a fresh, empty store.
@@ -94,14 +124,169 @@ export function meetupSafetyCases(made: () => Promise<MeetupSafetyStore>): void
     expect(await store.ruling(SAFETY_SERVER, { kind: 'gym', id: '7' })).toBe('allow');
   });
 
+  it('keeps who ruled a place, the place and the post the ruling came from', async () => {
+    const store = await made();
+    const key = { kind: 'stop' as const, id: LIBRARY.id };
+    expect(await store.rulingRecord(SAFETY_SERVER, key)).toBeUndefined();
+    // A ruling without more, as 8S-1 made them.
+    await store.rule(SAFETY_SERVER, key, 'allow', MOD);
+    expect(await store.rulingRecord(SAFETY_SERVER, key)).toEqual({
+      serverId: SAFETY_SERVER,
+      key,
+      ruling: 'allow',
+      ruledBy: MODERATOR,
+      ruledByName: 'Mod',
+      ruledAt: MOD.at,
+      place: null,
+      source: null,
+      keptAt: null,
+    });
+    const source = {
+      kind: 'report' as const,
+      id: requestId(201),
+      channelId: '600000000000000001',
+      messageId: '600000000000000005',
+    };
+    const later = { ...MOD, name: null, at: MOD.at + HOUR };
+    await store.rule(SAFETY_SERVER, key, 'refuse', later, { place: LIBRARY, source });
+    expect(await store.rulingRecord(SAFETY_SERVER, key)).toEqual({
+      serverId: SAFETY_SERVER,
+      key,
+      ruling: 'refuse',
+      ruledBy: MODERATOR,
+      ruledByName: null,
+      ruledAt: later.at,
+      place: LIBRARY,
+      source,
+      keptAt: null,
+    });
+    expect(await store.rulingRecord(OTHER_SERVER, key)).toBeUndefined();
+    expect(await store.undoRuling(SAFETY_SERVER, key)).toMatchObject({
+      ruling: { ruling: 'refuse', source },
+      ask: undefined,
+    });
+    expect(await store.undoRuling(SAFETY_SERVER, key)).toBeUndefined();
+    expect(await store.ruling(SAFETY_SERVER, key)).toBeUndefined();
+  });
+
+  it('keeps one open ask per place and server, and decides it once', async () => {
+    const store = await made();
+    const key = { kind: 'stop' as const, id: LIBRARY.id };
+    await store.rule(SAFETY_SERVER, key, 'refuse', MOD, { place: LIBRARY });
+    expect(await store.addAsk(newAsk(1))).toBe('added');
+    expect(await store.addAsk(newAsk(2, { memberId: MODERATOR }))).toBe('open');
+    expect(await store.addAsk(newAsk(3, { serverId: OTHER_SERVER }))).toBe('added');
+    expect(await store.addAsk(newAsk(4, { key: { kind: 'gym', id: '7' } }))).toBe('added');
+    expect(await store.openAsk(SAFETY_SERVER, key)).toMatchObject({
+      id: requestId(301),
+      key,
+      place: LIBRARY,
+      memberId: MAKER,
+      memberName: 'Alice',
+      text: 'It is a public park now.',
+      status: 'open',
+      channelId: null,
+    });
+    await store.setAskPost(requestId(301), '600000000000000001', '600000000000000006');
+    expect(await store.ask(requestId(301))).toMatchObject({ messageId: '600000000000000006' });
+    const kept = { ...MOD, at: MOD.at + HOUR };
+    expect(await store.keepOnAsk(newAskRecord(1), kept)).toBe('kept');
+    expect(await store.allowOnAsk(newAskRecord(1), kept)).toBe(false);
+    expect(await store.ask(requestId(301))).toMatchObject({
+      status: 'kept',
+      decidedBy: MODERATOR,
+      decidedAt: kept.at,
+    });
+    expect(await store.rulingRecord(SAFETY_SERVER, key)).toMatchObject({
+      ruling: 'refuse',
+      ruledAt: MOD.at,
+      keptAt: kept.at,
+    });
+    expect(await store.openAsk(SAFETY_SERVER, key)).toBeUndefined();
+    // Asked again, and allowed: the ruling is the ask's, the kept refusal gone with it.
+    expect(await store.addAsk(newAsk(5))).toBe('added');
+    await store.setAskPost(requestId(305), '600000000000000001', '600000000000000007');
+    const allowed = { ...MOD, at: MOD.at + 2 * HOUR };
+    const asked = {
+      ...newAskRecord(5),
+      channelId: '600000000000000001',
+      messageId: '600000000000000007',
+    };
+    expect(await store.allowOnAsk(asked, allowed)).toBe(true);
+    expect(await store.keepOnAsk(asked, allowed)).toBe('not-open');
+    expect(await store.rulingRecord(SAFETY_SERVER, key)).toEqual({
+      serverId: SAFETY_SERVER,
+      key,
+      ruling: 'allow',
+      ruledBy: MODERATOR,
+      ruledByName: 'Mod',
+      ruledAt: allowed.at,
+      place: LIBRARY,
+      source: {
+        kind: 'ask',
+        id: requestId(305),
+        channelId: '600000000000000001',
+        messageId: '600000000000000007',
+      },
+      keptAt: null,
+    });
+    await store.discardAsk(requestId(303));
+    expect(await store.ask(requestId(303))).toBeUndefined();
+    expect(await store.addAsk(newAsk(6, { serverId: OTHER_SERVER }))).toBe('added');
+  });
+
+  it('closes the open ask of a place whose ruling is undone, and keeps only a refusal', async () => {
+    const store = await made();
+    const key = { kind: 'stop' as const, id: LIBRARY.id };
+    await store.rule(SAFETY_SERVER, key, 'refuse', MOD, { place: LIBRARY });
+    await store.addAsk(newAsk(1));
+    const undone = await store.undoRuling(SAFETY_SERVER, key);
+    expect(undone?.ask).toMatchObject({ id: requestId(301), status: 'undone', decidedBy: null });
+    expect(await store.ask(requestId(301))).toMatchObject({ status: 'undone' });
+    expect(await store.openAsk(SAFETY_SERVER, key)).toBeUndefined();
+    // Keep refused without a refusal standing (undone, or allowed meanwhile) keeps nothing.
+    expect(await store.addAsk(newAsk(2))).toBe('added');
+    expect(await store.keepOnAsk(newAskRecord(2), MOD)).toBe('not-refused');
+    expect(await store.ask(requestId(302))).toMatchObject({ status: 'open' });
+    await store.rule(SAFETY_SERVER, key, 'allow', MOD);
+    expect(await store.keepOnAsk(newAskRecord(2), MOD)).toBe('not-refused');
+    expect(await store.rulingRecord(SAFETY_SERVER, key)).toMatchObject({ keptAt: null });
+  });
+
+  it('expires an open ask without a decider, and lists those that are stale', async () => {
+    const store = await made();
+    await store.addAsk(newAsk(1, { createdAt: SAFETY_NOW - 10 * HOUR }));
+    await store.addAsk(
+      newAsk(2, { key: { kind: 'gym', id: '7' }, createdAt: SAFETY_NOW - 9 * 24 * HOUR }),
+    );
+    await store.setAskPost(requestId(302), '600000000000000001', '600000000000000003');
+    await store.addAsk(newAsk(3, { serverId: OTHER_SERVER }));
+    await store.setAskPost(requestId(303), '600000000000000001', '600000000000000004');
+    const stale = { unpostedBefore: SAFETY_NOW - HOUR, openedBefore: SAFETY_NOW - 7 * 24 * HOUR };
+    expect((await store.staleAsks(stale)).map((one) => one.id)).toEqual([
+      requestId(302),
+      requestId(301),
+    ]);
+    expect(await store.expireAsk(requestId(301))).toBe(true);
+    expect(await store.expireAsk(requestId(301))).toBe(false);
+    expect(await store.ask(requestId(301))).toMatchObject({
+      status: 'expired',
+      decidedBy: null,
+      decidedAt: null,
+    });
+    expect(await store.addAsk(newAsk(4))).toBe('added');
+    expect((await store.staleAsks(stale)).map((one) => one.id)).toEqual([requestId(302)]);
+  });
+
   it('blocks a member per server until the block is lifted, and blocks again afterwards', async () => {
     const store = await made();
     expect(await store.block(SAFETY_SERVER, MAKER)).toBeUndefined();
-    expect(await store.addBlock(SAFETY_SERVER, MAKER, MOD)).toBe(true);
+    expect(await store.addBlock(SAFETY_SERVER, MAKER, MOD, 'Alice')).toBe(true);
     expect(await store.addBlock(SAFETY_SERVER, MAKER, { ...MOD, id: MAKER, at: 1 })).toBe(false);
     expect(await store.block(SAFETY_SERVER, MAKER)).toEqual({
       serverId: SAFETY_SERVER,
       memberId: MAKER,
+      memberName: 'Alice',
       blockedBy: MODERATOR,
       blockedByName: 'Mod',
       blockedAt: MOD.at,
@@ -115,6 +300,7 @@ export function meetupSafetyCases(made: () => Promise<MeetupSafetyStore>): void
     expect(await store.block(SAFETY_SERVER, MAKER)).toMatchObject({
       blockedAt: later.at,
       blockedByName: null,
+      memberName: null,
     });
   });
 
@@ -298,6 +484,8 @@ export function meetupSafetyCases(made: () => Promise<MeetupSafetyStore>): void
     await store.addRequest(newRequest(1));
     await store.addRequest(newRequest(2));
     expect(await store.blockMaker(newRequest(1), MOD)).toEqual({ decided: true, newBlock: true });
+    // The maker's name as they asked, for the lists of `/places`.
+    expect(await store.block(SAFETY_SERVER, MAKER)).toMatchObject({ memberName: 'Alice' });
     expect(await store.request(requestId(1))).toMatchObject({
       status: 'refused',
       decision: 'block',
diff --git a/test/support/meetup-safety.ts b/test/support/meetup-safety.ts
index 85bff5b3..a5cae6d7 100644
--- a/test/support/meetup-safety.ts
+++ b/test/support/meetup-safety.ts
@@ -1,6 +1,7 @@
 import type {
   ApprovalOutcome,
   AppealStatus,
+  AskStatus,
   Decider,
   MeetupAppeal,
   MeetupBlock,
@@ -8,11 +9,20 @@ import type {
   MeetupSafetyStore,
   NewMeetupAppeal,
   NewMeetupRequest,
+  NewPlaceAsk,
+  PlaceAskRecord,
+  PlaceRulingRecord,
   RequestDecision,
   RequestStatus,
+  RulingMore,
 } from '../../src/domain/meetups/records.js';
 import type { PlaceRuling, RulingKey } from '../../src/domain/meetups/safety.js';
 
+/** The key of a ruling in memory. */
+function rulingId(serverId: string, key: RulingKey): string {
+  return `${serverId} ${key.kind} ${key.id}`;
+}
+
 /** A block as it is kept: while it stands, and who lifted it last once lifted. */
 type KeptBlock = MeetupBlock & {
   liftedBy: string | null;
@@ -25,7 +35,8 @@ type KeptBlock = MeetupBlock & {
  * both). `failing` makes every method of that name reject.
  */
 export class MemoryMeetupSafety implements MeetupSafetyStore {
-  readonly rulings = new Map<string, PlaceRuling>();
+  readonly rulings = new Map<string, PlaceRulingRecord>();
+  readonly asks = new Map<string, PlaceAskRecord>();
   readonly blocks = new Map<string, KeptBlock>();
   readonly requests = new Map<string, MeetupRequestRecord>();
   readonly appeals = new Map<string, MeetupAppeal>();
@@ -39,12 +50,174 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
 
   async ruling(serverId: string, key: RulingKey) {
     await this.check('ruling');
-    return this.rulings.get(`${serverId} ${key.kind} ${key.id}`);
+    return this.rulings.get(rulingId(serverId, key))?.ruling;
+  }
+
+  async rulingRecord(serverId: string, key: RulingKey) {
+    await this.check('rulingRecord');
+    const found = this.rulings.get(rulingId(serverId, key));
+    return found && structuredClone(found);
   }
 
-  async rule(serverId: string, key: RulingKey, ruling: PlaceRuling, _by: Decider) {
+  async rule(
+    serverId: string,
+    key: RulingKey,
+    ruling: PlaceRuling,
+    by: Decider,
+    more: RulingMore = {},
+  ) {
     await this.check('rule');
-    this.rulings.set(`${serverId} ${key.kind} ${key.id}`, ruling);
+    this.ruleNow(serverId, key, ruling, by, more);
+  }
+
+  private ruleNow(
+    serverId: string,
+    key: RulingKey,
+    ruling: PlaceRuling,
+    by: Decider,
+    more: RulingMore,
+  ): void {
+    this.rulings.set(rulingId(serverId, key), {
+      serverId,
+      key: { ...key },
+      ruling,
+      ruledBy: by.id,
+      ruledByName: by.name,
+      ruledAt: by.at,
+      place: more.place === undefined ? null : structuredClone(more.place),
+      source: more.source === undefined ? null : { ...more.source },
+      keptAt: null,
+    });
+  }
+
+  async undoRuling(serverId: string, key: RulingKey) {
+    await this.check('undoRuling');
+    const id = rulingId(serverId, key);
+    const found = this.rulings.get(id);
+    if (!found) return undefined;
+    this.rulings.delete(id);
+    const open = [...this.asks.values()].find(
+      (one) =>
+        one.serverId === serverId &&
+        one.key.kind === key.kind &&
+        one.key.id === key.id &&
+        one.status === 'open',
+    );
+    if (open) this.decideAskNow(open.id, 'undone', null);
+    const ask = open && this.asks.get(open.id);
+    return { ruling: structuredClone(found), ask: ask && structuredClone(ask) };
+  }
+
+  async addAsk(ask: NewPlaceAsk) {
+    await this.check('addAsk');
+    const open = [...this.asks.values()].some(
+      (one) =>
+        one.serverId === ask.serverId &&
+        one.key.kind === ask.key.kind &&
+        one.key.id === ask.key.id &&
+        one.status === 'open',
+    );
+    if (open) return 'open' as const;
+    this.asks.set(ask.id, {
+      ...structuredClone(ask),
+      status: 'open',
+      channelId: null,
+      messageId: null,
+      decidedBy: null,
+      decidedByName: null,
+      decidedAt: null,
+    });
+    return 'added' as const;
+  }
+
+  async discardAsk(id: string) {
+    await this.check('discardAsk');
+    this.asks.delete(id);
+  }
+
+  async setAskPost(id: string, channelId: string, messageId: string) {
+    await this.check('setAskPost');
+    const found = this.asks.get(id);
+    if (found) this.asks.set(id, { ...found, channelId, messageId });
+  }
+
+  async ask(id: string) {
+    await this.check('ask');
+    const found = this.asks.get(id);
+    return found && structuredClone(found);
+  }
+
+  async openAsk(serverId: string, key: RulingKey) {
+    await this.check('openAsk');
+    const found = [...this.asks.values()].find(
+      (one) =>
+        one.serverId === serverId &&
+        one.key.kind === key.kind &&
+        one.key.id === key.id &&
+        one.status === 'open',
+    );
+    return found && structuredClone(found);
+  }
+
+  private decideAskNow(id: string, status: Exclude<AskStatus, 'open'>, by: Decider | null) {
+    const found = this.asks.get(id);
+    if (!found || found.status !== 'open') return false;
+    this.asks.set(id, {
+      ...found,
+      status,
+      decidedBy: by?.id ?? null,
+      decidedByName: by?.name ?? null,
+      decidedAt: by?.at ?? null,
+    });
+    return true;
+  }
+
+  async expireAsk(id: string) {
+    await this.check('expireAsk');
+    return this.decideAskNow(id, 'expired', null);
+  }
+
+  async allowOnAsk(ask: PlaceAskRecord, by: Decider) {
+    await this.check('allowOnAsk');
+    if (!this.decideAskNow(ask.id, 'allowed', by)) return false;
+    const posted = this.asks.get(ask.id);
+    const source =
+      posted?.channelId && posted.messageId
+        ? {
+            kind: 'ask' as const,
+            id: ask.id,
+            channelId: posted.channelId,
+            messageId: posted.messageId,
+          }
+        : undefined;
+    this.ruleNow(ask.serverId, ask.key, 'allow', by, {
+      place: ask.place,
+      ...(source === undefined ? {} : { source }),
+    });
+    return true;
+  }
+
+  async keepOnAsk(ask: PlaceAskRecord, by: Decider) {
+    await this.check('keepOnAsk');
+    const ruling = this.rulings.get(rulingId(ask.serverId, ask.key));
+    if (this.asks.get(ask.id)?.status !== 'open') return 'not-open' as const;
+    if (ruling?.ruling !== 'refuse') return 'not-refused' as const;
+    this.decideAskNow(ask.id, 'kept', by);
+    ruling.keptAt = by.at;
+    return 'kept' as const;
+  }
+
+  async staleAsks(stale: { unpostedBefore: number; openedBefore: number }) {
+    await this.check('staleAsks');
+    return [...this.asks.values()]
+      .filter(
+        (one) =>
+          one.status === 'open' &&
+          ((one.messageId === null && one.createdAt <= stale.unpostedBefore) ||
+            one.createdAt <= stale.openedBefore),
+      )
+      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
+      .map((one) => structuredClone(one));
   }
 
   async block(serverId: string, memberId: string) {
@@ -55,18 +228,24 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
     return block;
   }
 
-  async addBlock(serverId: string, memberId: string, by: Decider) {
+  async addBlock(serverId: string, memberId: string, by: Decider, memberName?: string | null) {
     await this.check('addBlock');
-    return this.blockNow(serverId, memberId, by);
+    return this.blockNow(serverId, memberId, by, memberName ?? null);
   }
 
-  private blockNow(serverId: string, memberId: string, by: Decider): boolean {
+  private blockNow(
+    serverId: string,
+    memberId: string,
+    by: Decider,
+    memberName: string | null,
+  ): boolean {
     const key = `${serverId} ${memberId}`;
     const found = this.blocks.get(key);
     if (found && found.liftedAt === null) return false;
     this.blocks.set(key, {
       serverId,
       memberId,
+      memberName,
       blockedBy: by.id,
       blockedByName: by.name,
       blockedAt: by.at,
@@ -77,7 +256,10 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
     return true;
   }
 
-  async blockMaker(request: Pick<MeetupRequestRecord, 'id' | 'serverId' | 'makerId'>, by: Decider) {
+  async blockMaker(
+    request: Pick<MeetupRequestRecord, 'id' | 'serverId' | 'makerId' | 'makerName'>,
+    by: Decider,
+  ) {
     await this.check('blockMaker');
     const found = this.requests.get(request.id);
     if (!found || found.status !== 'pending') return { decided: false, newBlock: false };
@@ -89,7 +271,10 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
       decidedByName: by.name,
       decidedAt: by.at,
     });
-    return { decided: true, newBlock: this.blockNow(request.serverId, request.makerId, by) };
+    return {
+      decided: true,
+      newBlock: this.blockNow(request.serverId, request.makerId, by, request.makerName),
+    };
   }
 
   async liftBlock(serverId: string, memberId: string, by: Decider) {
diff --git a/test/support/report-cases.ts b/test/support/report-cases.ts
new file mode 100644
index 00000000..74d8c05f
--- /dev/null
+++ b/test/support/report-cases.ts
@@ -0,0 +1,228 @@
+import { expect, it } from 'vitest';
+import type {
+  MessageSubject,
+  NewReport,
+  PartySubject,
+  ReportReason,
+  ReportStore,
+} from '../../src/domain/moderation/reports.js';
+import {
+  LIBRARY,
+  MOD,
+  OTHER_SERVER,
+  requestId,
+  SAFETY_NOW,
+  SAFETY_SERVER,
+} from './meetup-safety-cases.js';
+
+export const REPORTER = '200000000000000011';
+export const OTHER_REPORTER = '200000000000000012';
+export const REPORTED_PARTY = '00000000-0000-4000-8000-0000000000aa';
+const HOUR = 3_600_000;
+
+/** What the moderators' post shows of Alice's book swap at the Little Free Library. */
+export function partySubject(overrides: Partial<PartySubject> = {}): PartySubject {
+  return {
+    kind: 'party',
+    partyId: REPORTED_PARTY,
+    partyType: 'meetup',
+    title: 'Book swap',
+    lines: ['**Book swap**', 'Starts <t:1792086400:t>'],
+    regionChannelId: '100000000000000001',
+    postId: '700000000000000123',
+    place: LIBRARY,
+    officialName: null,
+    makerId: '200000000000000002',
+    makerName: 'Alice',
+    information: 'Bring a book.',
+    ...overrides,
+  };
+}
+
+/** A message of Bob's in a region channel. */
+export function messageSubject(overrides: Partial<MessageSubject> = {}): MessageSubject {
+  return {
+    kind: 'message',
+    channelId: '100000000000000001',
+    messageId: '800000000000000001',
+    authorId: '200000000000000003',
+    authorName: 'Bob',
+    sentAt: SAFETY_NOW - HOUR,
+    text: 'Zoë 🌲 <b>\nline two',
+    attachments: ['map.png'],
+    partyTitle: null,
+    ...overrides,
+  };
+}
+
+/** A report numbered `n` of `subject`, made at `SAFETY_NOW`. */
+export function newReport(
+  n: number,
+  subject: PartySubject | MessageSubject = partySubject(),
+  overrides: Partial<NewReport> = {},
+): NewReport {
+  return {
+    id: requestId(200 + n),
+    serverId: SAFETY_SERVER,
+    subject,
+    createdAt: SAFETY_NOW,
+    ...overrides,
+  };
+}
+
+export function reason(reporterId = REPORTER, overrides: Partial<ReportReason> = {}): ReportReason {
+  return {
+    reporterId,
+    reporterName: reporterId === REPORTER ? 'Carol' : 'Dave',
+    text: 'It is somebody’s front yard.',
+    at: SAFETY_NOW,
+    ...overrides,
+  };
+}
+
+/** What is kept of reports, run against the repository and its twin in memory alike. */
+export function reportCases(made: () => Promise<ReportStore>): void {
+  it('opens a report with its first reason, and keeps its subject as it was given', async () => {
+    const store = await made();
+    const subject = messageSubject();
+    const added = await store.addReport(newReport(1, subject), reason());
+    expect(added.kind).toBe('opened');
+    expect(await store.report(requestId(201))).toEqual({
+      id: requestId(201),
+      serverId: SAFETY_SERVER,
+      subject,
+      createdAt: SAFETY_NOW,
+      status: 'open',
+      removal: null,
+      channelId: null,
+      messageId: null,
+      decidedBy: null,
+      decidedByName: null,
+      decidedAt: null,
+      reasons: [reason()],
+    });
+    expect(added.report).toEqual(await store.report(requestId(201)));
+    expect(await store.report(requestId(209))).toBeUndefined();
+  });
+
+  it('gathers the reasons of one party or message on its open report, one per reporter', async () => {
+    const store = await made();
+    await store.addReport(newReport(1), reason());
+    const second = await store.addReport(
+      newReport(2),
+      reason(OTHER_REPORTER, { at: SAFETY_NOW + 1, text: 'A home.' }),
+    );
+    expect(second.kind).toBe('added');
+    expect(second.report.id).toBe(requestId(201));
+    expect(second.report.reasons.map((one) => one.reporterId)).toEqual([REPORTER, OTHER_REPORTER]);
+    const again = await store.addReport(newReport(3), reason(REPORTER, { text: 'Again' }));
+    expect(again.kind).toBe('already');
+    expect(again.report.reasons).toHaveLength(2);
+    expect(await store.report(requestId(202))).toBeUndefined();
+    // Another message, another party: reports of their own.
+    expect((await store.addReport(newReport(4, messageSubject()), reason())).kind).toBe('opened');
+    expect(
+      (
+        await store.addReport(
+          newReport(5, messageSubject({ messageId: '800000000000000002' })),
+          reason(),
+        )
+      ).kind,
+    ).toBe('opened');
+    expect(
+      (await store.addReport(newReport(6, partySubject({ partyId: requestId(77) })), reason()))
+        .kind,
+    ).toBe('opened');
+  });
+
+  it('decides an open report once, and opens a new one of the same party afterwards', async () => {
+    const store = await made();
+    await store.addReport(newReport(1), reason());
+    await store.setReportPost(requestId(201), '600000000000000001', '600000000000000005');
+    expect(await store.decideReport(requestId(201), 'closed', 'delete', MOD)).toBe(true);
+    expect(await store.decideReport(requestId(201), 'dismissed', null, MOD)).toBe(false);
+    expect(await store.report(requestId(201))).toMatchObject({
+      status: 'closed',
+      removal: 'delete',
+      decidedBy: MOD.id,
+      decidedByName: 'Mod',
+      decidedAt: MOD.at,
+      channelId: '600000000000000001',
+      messageId: '600000000000000005',
+    });
+    const anew = await store.addReport(newReport(2), reason());
+    expect(anew).toMatchObject({ kind: 'opened', report: { id: requestId(202) } });
+    expect(await store.decideReport(requestId(202), 'ended', null, null)).toBe(true);
+    expect(await store.report(requestId(202))).toMatchObject({
+      status: 'ended',
+      decidedBy: null,
+      decidedAt: null,
+    });
+    expect(await store.decideReport(requestId(209), 'dismissed', null, MOD)).toBe(false);
+  });
+
+  it('lists the open reports of a server and of a party, and those never posted', async () => {
+    const store = await made();
+    await store.addReport(newReport(1, partySubject(), { createdAt: SAFETY_NOW + 2 }), reason());
+    await store.addReport(newReport(2, messageSubject(), { createdAt: SAFETY_NOW + 1 }), reason());
+    await store.addReport(
+      newReport(3, messageSubject({ messageId: '800000000000000003' }), {
+        serverId: OTHER_SERVER,
+      }),
+      reason(),
+    );
+    await store.addReport(
+      newReport(4, messageSubject({ messageId: '800000000000000004' })),
+      reason(),
+    );
+    await store.decideReport(requestId(204), 'dismissed', null, MOD);
+    await store.setReportPost(requestId(201), '600000000000000001', '600000000000000005');
+    expect((await store.openReports(SAFETY_SERVER)).map((one) => one.id)).toEqual([
+      requestId(202),
+      requestId(201),
+    ]);
+    expect((await store.openReportsOfParty(REPORTED_PARTY)).map((one) => one.id)).toEqual([
+      requestId(201),
+    ]);
+    expect((await store.unpostedReports(SAFETY_NOW + 1)).map((one) => one.id)).toEqual([
+      requestId(203),
+      requestId(202),
+    ]);
+  });
+
+  it('refuses a subject that would not read back, before keeping anything', async () => {
+    const store = await made();
+    const bad = messageSubject({ text: 'x'.repeat(5000) });
+    await expect(store.addReport(newReport(1, bad), reason())).rejects.toThrow();
+    expect(await store.report(requestId(201))).toBeUndefined();
+    await store.addReport(newReport(2), reason());
+    await expect(
+      store.setSubject(requestId(202), partySubject({ title: 'x'.repeat(500) })),
+    ).rejects.toThrow();
+  });
+
+  it('gives the reasons in the order they came, the reporter breaking a tie', async () => {
+    const store = await made();
+    await store.addReport(newReport(1), reason(OTHER_REPORTER, { at: SAFETY_NOW + 5 }));
+    await store.addReport(newReport(2), reason(REPORTER, { at: SAFETY_NOW + 5 }));
+    await store.addReport(newReport(3), reason('200000000000000010', { at: SAFETY_NOW + 1 }));
+    expect((await store.report(requestId(201)))?.reasons.map((one) => one.reporterId)).toEqual([
+      '200000000000000010',
+      REPORTER,
+      OTHER_REPORTER,
+    ]);
+  });
+
+  it('changes what a report shows, and forgets one with its reasons', async () => {
+    const store = await made();
+    await store.addReport(newReport(1), reason());
+    const changed = partySubject({ title: 'Book swap and tea', information: null });
+    await store.setSubject(requestId(201), changed);
+    expect((await store.report(requestId(201)))?.subject).toEqual(changed);
+    await store.discardReport(requestId(201));
+    expect(await store.report(requestId(201))).toBeUndefined();
+    // Forgotten: the next reason opens a report anew, the same reporter too.
+    expect((await store.addReport(newReport(2), reason())).kind).toBe('opened');
+    expect((await store.report(requestId(202)))?.reasons).toHaveLength(1);
+  });
+}
diff --git a/test/support/reports.test.ts b/test/support/reports.test.ts
new file mode 100644
index 00000000..bd2e947e
--- /dev/null
+++ b/test/support/reports.test.ts
@@ -0,0 +1,7 @@
+import { describe } from 'vitest';
+import { reportCases } from './report-cases.js';
+import { MemoryReports } from './reports.js';
+
+describe('MemoryReports', () => {
+  reportCases(() => Promise.resolve(new MemoryReports()));
+});
diff --git a/test/support/reports.ts b/test/support/reports.ts
new file mode 100644
index 00000000..e5553fb1
--- /dev/null
+++ b/test/support/reports.ts
@@ -0,0 +1,136 @@
+import type { Decider } from '../../src/domain/meetups/records.js';
+import {
+  reportSubject,
+  reportTargetKey,
+  type ModerationReport,
+  type NewReport,
+  type PostRemoval,
+  type ReasonAdded,
+  type ReportReason,
+  type ReportStatus,
+  type ReportStore,
+  type ReportSubject,
+} from '../../src/domain/moderation/reports.js';
+
+/**
+ * `ReportRepository` in memory, for tests: the same answers (`reportCases` runs on both).
+ * `failing` makes every method of that name reject.
+ */
+export class MemoryReports implements ReportStore {
+  readonly reports = new Map<string, ModerationReport>();
+  readonly failing = new Set<keyof ReportStore>();
+
+  private check(method: keyof ReportStore): Promise<void> {
+    return this.failing.has(method)
+      ? Promise.reject(new Error(`the database refused ${method}`))
+      : Promise.resolve();
+  }
+
+  /** A copy, its reasons in the repository's order: by time, then by reporter. */
+  private copy(report: ModerationReport): ModerationReport {
+    const copied = structuredClone(report);
+    copied.reasons.sort((a, b) => a.at - b.at || a.reporterId.localeCompare(b.reporterId));
+    return copied;
+  }
+
+  async addReport(report: NewReport, reason: ReportReason): Promise<ReasonAdded> {
+    await this.check('addReport');
+    // As the repository: a subject that would not read back is refused before anything is kept.
+    reportSubject.parse(report.subject);
+    const key = reportTargetKey(report.subject);
+    const open = [...this.reports.values()].find(
+      (one) => one.status === 'open' && reportTargetKey(one.subject) === key,
+    );
+    if (open) {
+      if (open.reasons.some((one) => one.reporterId === reason.reporterId)) {
+        return { kind: 'already', report: this.copy(open) };
+      }
+      open.reasons.push({ ...reason });
+      return { kind: 'added', report: this.copy(open) };
+    }
+    const made: ModerationReport = {
+      ...structuredClone(report),
+      status: 'open',
+      removal: null,
+      channelId: null,
+      messageId: null,
+      decidedBy: null,
+      decidedByName: null,
+      decidedAt: null,
+      reasons: [{ ...reason }],
+    };
+    this.reports.set(report.id, made);
+    return { kind: 'opened', report: this.copy(made) };
+  }
+
+  async report(id: string) {
+    await this.check('report');
+    const found = this.reports.get(id);
+    return found && this.copy(found);
+  }
+
+  async setReportPost(id: string, channelId: string, messageId: string) {
+    await this.check('setReportPost');
+    const found = this.reports.get(id);
+    if (found) this.reports.set(id, { ...found, channelId, messageId });
+  }
+
+  async setSubject(id: string, subject: ReportSubject) {
+    await this.check('setSubject');
+    reportSubject.parse(subject);
+    const found = this.reports.get(id);
+    if (found) this.reports.set(id, { ...found, subject: structuredClone(subject) });
+  }
+
+  async discardReport(id: string) {
+    await this.check('discardReport');
+    this.reports.delete(id);
+  }
+
+  async decideReport(
+    id: string,
+    status: Exclude<ReportStatus, 'open'>,
+    removal: PostRemoval | null,
+    by: Decider | null,
+  ) {
+    await this.check('decideReport');
+    const found = this.reports.get(id);
+    if (!found || found.status !== 'open') return false;
+    this.reports.set(id, {
+      ...found,
+      status,
+      removal,
+      decidedBy: by?.id ?? null,
+      decidedByName: by?.name ?? null,
+      decidedAt: by?.at ?? null,
+    });
+    return true;
+  }
+
+  async openReportsOfParty(partyId: string) {
+    await this.check('openReportsOfParty');
+    return this.sorted(
+      (one) =>
+        one.status === 'open' && one.subject.kind === 'party' && one.subject.partyId === partyId,
+    );
+  }
+
+  async openReports(serverId: string) {
+    await this.check('openReports');
+    return this.sorted((one) => one.status === 'open' && one.serverId === serverId);
+  }
+
+  async unpostedReports(before: number) {
+    await this.check('unpostedReports');
+    return this.sorted(
+      (one) => one.status === 'open' && one.messageId === null && one.createdAt <= before,
+    );
+  }
+
+  private sorted(which: (report: ModerationReport) => boolean): ModerationReport[] {
+    return [...this.reports.values()]
+      .filter(which)
+      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
+      .map((one) => this.copy(one));
+  }
+}
````

### Task 2: Plan 8S-2 T2: Message commands in the framework: router, deploy, help

Prototype commit: `3853b6ae250cd936c81ae2e31f2a97e720871089`

A MessageCommand is an entry of Discord's Apps menu on a message, listed in
messageCommands beside the slash commands. The router routes it by the name the menu
shows (guards, throttle under that name, a private acknowledgement, run); the deploy
script registers it after the slash commands, in servers only, five at most; /help lists
it under its name in its group and explains how to reach the menu. The list is empty
until the report of plan 8S-2; tests use fakeMessageCommand.

**Files:**

```
 docs/architecture/discord-framework.md |   1 +
 docs/architecture/testing.md           |   2 +-
 src/app-context.ts                     |   4 ++-
 src/app.ts                             |  13 +++++++--
 src/commands/index.ts                  |   8 +++++-
 src/commands/util/help-render.ts       |  91 ++++++++++++++++++++++++++++++++++++++++++++++++------------
 src/commands/util/help.test.ts         |  64 +++++++++++++++++++++++++++++++++++++++++-
 src/commands/util/help.ts              |  50 ++++++++++++++++++++++++++++-----
 src/discord/command.ts                 |  55 +++++++++++++++++++++++++++++++++++-
 src/discord/deploy-cli.ts              |   9 ++++--
 src/discord/deploy.test.ts             |  26 ++++++++++++++++-
 src/discord/deploy.ts                  |  53 +++++++++++++++++++++++------------
 src/discord/late-reply.ts              |   6 +++-
 src/discord/router.test.ts             | 111 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/discord/router.ts                  |  76 ++++++++++++++++++++++++++++++++++++++++++--------
 test/support/fake-interactions.ts      |  73 ++++++++++++++++++++++++++++++++++++++++++++++--
 test/support/test-context.ts           |   1 +
 17 files changed, 574 insertions(+), 69 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/util/help.test.ts src/discord/deploy.test.ts src/discord/router.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3853b6ae250cd936c81ae2e31f2a97e720871089 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-2 T2: Message commands in the framework: router, deploy, help`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index fb61cab2..b995e5d6 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -7,6 +7,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 - Every slash command is a `CommandModule` listed in `src/commands/index.ts`; the router and the deploy script both read that list. A command with another name is listed under both: `alsoAs(command, name)` (`src/discord/command.ts`; `/hmm` of `/interested`, `/coming` of `/join`) gives the same guards, handlers, throttle and help under another name, and a short form (`/little`, `/great`, `/ultra`, `/master`: `/rank` in that league) is a command of its own with `formOf`. The uses of a form count as the command's (the router's throttle key), "You can use /x again" names the name typed, and `/help` lists a form beside the command's name on its line and explains it as the command's.
 - A command with subcommands is built with `commandGroup({ data, help, guards, groups, parts })` (`src/discord/command-group.ts`): each part carries its own subcommand builder, `guards`, `execute` and `autocomplete`. The router refuses to start when the definition and the handlers differ. Command guards run before the subcommand's.
 - Commands are offered in servers only, and for server installs only, unless the definition sets its own `contexts` (`/help` adds the bot DM). A command that depends on a setting has `enabled(config)`; `enabledCommands()` filters the list for the router, `/help` and the deploy script alike.
+- A message command (plan 8S-2: an entry of Discord's Apps menu on a message, a right-click or a long press, such as "Report to moderators") is a `MessageCommand` (`src/discord/command.ts`: `target: 'message'`, its `data` a `ContextMenuCommandBuilder` of type Message, `help` with a `description` of its own, `guards`, `throttle`, `defer: 'ephemeral'` or none, and `run(interaction, ctx)`), listed in `messageCommands` beside `commands` in `src/commands/index.ts` (Discord allows five, `MAX_MESSAGE_COMMANDS`). Discord sends the message it was used on with the interaction, its text included, without any intent (`interaction.targetMessage`). The router takes both lists in one (`new InteractionRouter(ctx, [...commands, ...messageCommands], …)`; a name twice among the message commands is refused, and their names are apart from the slash commands'), runs guards, throttle (counted under the name the menu shows: "You can use Report to moderators again in …"), the private acknowledgement and `run`; guards take it (`LocatedInteraction`), as `answer` and `answerApart` do. `enabledMessageCommands(list, config)` filters it as `enabledCommands` does; `buildCommandPayload(commands, messageCommands)` registers them after the slash commands, offered in servers and installed to servers only. `ctx.messageCommands` is what `/help` lists: under its name in its group (`**Report to moderators** (Apps menu)`, after the slash commands), its page by that name however typed (`/help command:report to moderators`, offered while typed), its usage the way to the menu (`messageCommandUsage`). Tests use `fakeMessageCommand({ targetMessage })` (`test/support/fake-interactions.ts`; `FAKE_BOT_ID` is the bot's own user, `interaction.client.user.id`).
 - A part of a `commandGroup` may have `enabled(config)` (`SubcommandPart.enabled`): `enabledCommands()` then narrows the command to the subcommands its settings offer, for the router, `/help` and the deploy script alike (`/admin self-roles` exists only where `features.roles` is on).
 - For a command with `default_member_permissions` the router runs the command-level guards also for an autocomplete interaction and answers an empty list when one refuses; such a guard must cope with an autocomplete interaction and read no options. Ordinary commands' autocomplete runs no guards.
 - `/admin` is a `commandGroup` whose parts are listed in `src/commands/admin/index.ts`: a new subcommand is a file there, appended to that list. `/raid` reads what a member picked or typed through `src/commands/raids/raid-input.ts` (`reportedBoss`, `reportedGym`, `reportedTime`); a question to the member (a menu, a confirmation) keeps its values in a `PendingRequests` store under a token that is the id of the controls' custom id. The custom-id kind `raid` belongs to `/raid`'s own controls.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 75da2806..14232547 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -24,7 +24,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Fake interactions
 
-- Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options and checkbox groups of 1 to 10, values unique, `min_values` / `max_values` within the options, no more defaults than may be chosen). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus) and `checked` (checkbox groups, `fields.getCheckboxGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`), needs a value for a required menu and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
+- Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `fakeMessageCommand` with the `targetMessage` it was used on, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options and checkbox groups of 1 to 10, values unique, `min_values` / `max_values` within the options, no more defaults than may be chosen). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus) and `checked` (checkbox groups, `fields.getCheckboxGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`), needs a value for a required menu and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
 
 ## Parties
 
diff --git a/src/app-context.ts b/src/app-context.ts
index 82c91aef..2ca5a183 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -7,7 +7,7 @@ import type { WantStorage } from './db/repositories/pokemon-notification-reposit
 import type { UserSettingsStore } from './db/repositories/user-repository.js';
 import type { DB } from './db/types.js';
 import type { ClickAnswers } from './discord/click-answers.js';
-import type { CommandModule } from './discord/command.js';
+import type { CommandModule, MessageCommand } from './discord/command.js';
 import type { IntentFlags } from './discord/intents.js';
 import type { MemberDirectory } from './discord/member-directory.js';
 import type { Logger } from './log.js';
@@ -51,6 +51,8 @@ export interface AppContext {
   readonly log: Logger;
   readonly db: Kysely<DB>;
   readonly commands: readonly CommandModule[];
+  /** The message commands (Discord's Apps menu on a message) this installation offers. */
+  readonly messageCommands: readonly MessageCommand[];
   /** Pokémon, moves and type data from the game master. */
   readonly gameData: GameDataProvider;
   /** The raid bosses in effect: the feed's list with the moderators' overrides. */
diff --git a/src/app.ts b/src/app.ts
index 4fbb408a..4aad6356 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,7 +1,10 @@
 import { Events, type Client } from 'discord.js';
 import { sql } from 'kysely';
 import type { AppContext } from './app-context.js';
-import { commands as allCommands } from './commands/index.js';
+import {
+  commands as allCommands,
+  messageCommands as allMessageCommands,
+} from './commands/index.js';
 import { wildExceptionsOf } from './commands/notifications/wild.js';
 import { components } from './components/index.js';
 import { ScreenshotTrigger } from './commands/screenshots/mention.js';
@@ -36,7 +39,7 @@ import { MeetupSafetyRepository } from './db/repositories/meetup-safety-reposito
 import type { DB } from './db/types.js';
 import { ClickAnswers } from './discord/click-answers.js';
 import { createClient, loginWithFallback } from './discord/client.js';
-import { enabledCommands } from './discord/command.js';
+import { enabledCommands, enabledMessageCommands } from './discord/command.js';
 import { DiscordDmGateway } from './discord/dm-gateway.js';
 import { attachGatewayHandlers } from './discord/gateway-events.js';
 import { DiscordMemberDirectory } from './discord/member-directory.js';
@@ -625,11 +628,13 @@ export async function startApp(
     autoAssignRole: config.settings.autoAssignRole,
   };
   const commands = enabledCommands(allCommands, config);
+  const messageCommands = enabledMessageCommands(allMessageCommands, config);
   const ctx: AppContext = {
     config,
     log,
     db,
     commands,
+    messageCommands,
     gameData,
     raidBosses,
     raidBossAdmin: raidBosses,
@@ -699,7 +704,9 @@ export async function startApp(
   // The uses of commands and controls, counted by the router and by the live map, whose presses
   // of a party's buttons count as clicks on the post (plan 8M-3).
   const throttles = new Throttles();
-  const router = new InteractionRouter(ctx, commands, components, { throttles });
+  const router = new InteractionRouter(ctx, [...commands, ...messageCommands], components, {
+    throttles,
+  });
   // Screenshots posted in a region channel with a mention of the bot (or, passive, without).
   const screenshotTrigger = new ScreenshotTrigger({ ctx });
   // Resolved by the client that ends up connected (the login may try several).
diff --git a/src/commands/index.ts b/src/commands/index.ts
index 6f18c85b..d13a8f77 100644
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -1,4 +1,4 @@
-import type { CommandModule } from '../discord/command.js';
+import type { CommandModule, MessageCommand } from '../discord/command.js';
 import { admin } from './admin/index.js';
 import { friendCode, nickname } from './friends/friends.js';
 import { gym } from './gyms/index.js';
@@ -47,6 +47,12 @@ import { maps } from './util/maps.js';
 import { request } from './util/request.js';
 import { leagueRanks, rank } from './util/rank.js';
 
+/**
+ * Every message command (Discord's Apps menu on a message; plan 8S-2), five at most. The router,
+ * the deploy script and `/help` read this list beside `commands`.
+ */
+export const messageCommands: readonly MessageCommand[] = [];
+
 /** Every slash command. The router and the deploy script both read this list. */
 export const commands: readonly CommandModule[] = [
   help,
diff --git a/src/commands/util/help-render.ts b/src/commands/util/help-render.ts
index d516649f..78728d67 100644
--- a/src/commands/util/help-render.ts
+++ b/src/commands/util/help-render.ts
@@ -9,7 +9,12 @@ import {
   type APIStringSelectComponent,
 } from 'discord.js';
 import type { Settings } from '../../config/settings.js';
-import { subcommandPath, type CommandHelp, type CommandModule } from '../../discord/command.js';
+import {
+  subcommandPath,
+  type CommandHelp,
+  type CommandModule,
+  type MessageCommand,
+} from '../../discord/command.js';
 import { encodeCustomIdIfFits } from '../../discord/custom-id.js';
 import type { V2Message } from '../../discord/party-gateway.js';
 import { cutText, TEXT_BUDGET } from '../../render/party-post.js';
@@ -78,15 +83,26 @@ export function fitLines(lines: readonly string[], limit: number): string {
 }
 
 /** A command in a category outside `settings.helpGroups` is for staff. */
-export function isStaffCommand(command: CommandModule, helpGroups: readonly string[]): boolean {
+export function isStaffCommand(
+  command: CommandModule | MessageCommand,
+  helpGroups: readonly string[],
+): boolean {
   return !helpGroups.includes(command.help.category);
 }
 
-/** A command as a help page lists it: by its name and its other forms (`/hmm` of `/interested`). */
+/**
+ * A command as a help page lists it: a slash command by its name and its other forms (`/hmm` of
+ * `/interested`), a message command (plan 8S-2) by the name its menu shows.
+ */
 export interface HelpEntry {
-  command: CommandModule;
+  /** What `/help command:` takes and a menu's value: the command's name. */
+  name: string;
   /** The command's name first, then its other forms. */
   names: string[];
+  /** What it does, as the group's line says it. */
+  description: string;
+  /** A message command: named without a slash, as the Apps menu shows it. */
+  onMessage: boolean;
 }
 
 /** A group of commands: a help category with what is filed under it. */
@@ -97,8 +113,9 @@ export interface HelpGroup {
   entries: HelpEntry[];
 }
 
+/** The slash commands by name, then the message commands by name. */
 const byName = (a: HelpEntry, b: HelpEntry) =>
-  a.command.data.name.localeCompare(b.command.data.name);
+  Number(a.onMessage) - Number(b.onMessage) || a.name.localeCompare(b.name);
 
 /**
  * The groups of commands a member sees, in the order of `helpGroups` and then, for staff, the
@@ -108,6 +125,7 @@ export function helpGroupsOf(
   commands: readonly CommandModule[],
   helpGroups: readonly string[],
   includeStaff: boolean,
+  messageCommands: readonly MessageCommand[] = [],
 ): HelpGroup[] {
   const byCategory = new Map<HelpCategory, HelpEntry[]>();
   const forms = new Map<string, string[]>();
@@ -118,7 +136,22 @@ export function helpGroupsOf(
       continue;
     }
     const list = byCategory.get(command.help.category) ?? [];
-    list.push({ command, names: [command.data.name] });
+    list.push({
+      name: command.data.name,
+      names: [command.data.name],
+      description: command.data.toJSON().description,
+      onMessage: false,
+    });
+    byCategory.set(command.help.category, list);
+  }
+  for (const command of messageCommands) {
+    const list = byCategory.get(command.help.category) ?? [];
+    list.push({
+      name: command.data.name,
+      names: [command.data.name],
+      description: command.help.description,
+      onMessage: true,
+    });
     byCategory.set(command.help.category, list);
   }
   const categories = [...byCategory.keys()];
@@ -132,14 +165,17 @@ export function helpGroupsOf(
     entries: (byCategory.get(category) ?? [])
       .map((entry) => ({
         ...entry,
-        names: [...entry.names, ...(forms.get(entry.command.data.name) ?? [])],
+        names: entry.onMessage ? entry.names : [...entry.names, ...(forms.get(entry.name) ?? [])],
       }))
       .sort(byName),
   }));
 }
 
-/** `` `/interested` `/hmm` ``. */
-const namesOf = (entry: HelpEntry): string => entry.names.map((name) => `\`/${name}\``).join(' ');
+/** `` `/interested` `/hmm` ``, or `**Report to moderators** (Apps menu)`. */
+const namesOf = (entry: HelpEntry): string =>
+  entry.onMessage
+    ? `**${entry.name}** (Apps menu)`
+    : entry.names.map((name) => `\`/${name}\``).join(' ');
 
 function select(
   customId: string,
@@ -240,9 +276,7 @@ export function renderHelpOverview(groups: readonly HelpGroup[]): V2Message {
  */
 export function renderGroupHelp(group: HelpGroup): V2Message {
   const head = `### ${group.label}\n${count(group.entries.length, 'command')}`;
-  const lines = group.entries.map(
-    (entry) => `${namesOf(entry)} ${entry.command.data.toJSON().description}`,
-  );
+  const lines = group.entries.map((entry) => `${namesOf(entry)} ${entry.description}`);
   const parts: APIComponentInContainer[] = [textDisplay(head), separator()];
   if (lines.length > 0) parts.push(textDisplay(fitLines(lines, TEXT_BUDGET - head.length)));
   const menus = [
@@ -262,11 +296,7 @@ export function renderGroupHelp(group: HelpGroup): V2Message {
           id,
           index === 0 ? 'Details of a command…' : 'Details of a command (more)…',
           menu.entries.map((entry) =>
-            option(
-              `/${entry.command.data.name}`,
-              entry.command.data.name,
-              entry.command.data.toJSON().description,
-            ),
+            option(entry.onMessage ? entry.name : `/${entry.name}`, entry.name, entry.description),
           ),
         ),
       ),
@@ -406,6 +436,33 @@ export function renderCommandHelp(command: CommandModule, settings: Settings): V
   );
 }
 
+/** How a message command is reached: the Apps menu of a message. */
+export function messageCommandUsage(name: string): string {
+  return (
+    'In the Apps menu of a message: a right-click on a computer, a long press on a phone, then ' +
+    `**Apps** › **${name}**.`
+  );
+}
+
+/**
+ * Help for a message command (plan 8S-2): what it does, how it is reached (`messageCommandUsage`),
+ * its examples, and "◀" to its group of commands.
+ */
+export function renderMessageCommandHelp(command: MessageCommand, settings: Settings): V2Message {
+  const { name } = command.data;
+  return helpPage(
+    name,
+    command.help.description,
+    command.help,
+    [messageCommandUsage(name)],
+    settings,
+    {
+      path: name.toLowerCase(),
+      back: CATEGORY_LABELS[command.help.category],
+    },
+  );
+}
+
 /**
  * Help for one subcommand (`create`, `boss add`), or for a group of subcommands (`boss`: each
  * of its subcommands with what it does), with "◀" to the command; undefined when the command has
diff --git a/src/commands/util/help.test.ts b/src/commands/util/help.test.ts
index 5d8d671c..97ae4d1f 100644
--- a/src/commands/util/help.test.ts
+++ b/src/commands/util/help.test.ts
@@ -1,4 +1,6 @@
 import {
+  ApplicationCommandType,
+  ContextMenuCommandBuilder,
   MessageFlags,
   SlashCommandBuilder,
   SlashCommandSubcommandBuilder,
@@ -18,7 +20,12 @@ import {
 import { buttonsOf, selectsOf, textDisplays } from '../../../test/support/messages.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { commandGroup } from '../../discord/command-group.js';
-import { alsoAs, type CommandModule, type SimpleCommand } from '../../discord/command.js';
+import {
+  alsoAs,
+  type CommandModule,
+  type MessageCommand,
+  type SimpleCommand,
+} from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import type { V2Message } from '../../discord/party-gateway.js';
 import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
@@ -100,6 +107,61 @@ describe('/help: a command with another name', () => {
   });
 });
 
+describe('/help: a message command (the Apps menu on a message)', () => {
+  const onMessage: MessageCommand = {
+    target: 'message',
+    data: new ContextMenuCommandBuilder()
+      .setName('Report to moderators')
+      .setType(ApplicationCommandType.Message),
+    help: {
+      category: 'util',
+      description: 'Tell the moderators about a message',
+      details: 'Only they see it.',
+    },
+    run: noop,
+  };
+  const withMenu = createTestContext({ commands: [help, maybe], messageCommands: [onMessage] }).ctx;
+  const router = new InteractionRouter(withMenu, [help], [helpControls]);
+
+  it('lists it under its name in its group, beside the slash commands', async () => {
+    const overview = await ask({}, withMenu);
+    expect(textDisplays(overview)).toContain(
+      '**Utility**\n`/help` · `/interested` · **Report to moderators** (Apps menu)',
+    );
+    const pick = fakeSelect({
+      customId: 'help:overview:group',
+      values: ['util'],
+      ephemeralMessage: true,
+    });
+    await router.handle(pick as never);
+    const group = asV2(sent(pick.update));
+    expect(textDisplays(group)[1]).toContain(
+      '**Report to moderators** (Apps menu) Tell the moderators about a message',
+    );
+    expect(
+      selectsOf(group)[0]?.options.map((option) => [option.label, option.value]),
+    ).toContainEqual(['Report to moderators', 'Report to moderators']);
+  });
+
+  it('explains it by its name, however typed, and offers it while it is typed', async () => {
+    const page = await ask({ options: { command: 'report TO moderators' } }, withMenu);
+    expect(textDisplays(page)[0]).toBe(
+      '### Report to moderators\nTell the moderators about a message\n\nOnly they see it.',
+    );
+    expect(textDisplays(page)[1]).toBe(
+      '**Usage**\nIn the Apps menu of a message: a right-click on a computer, a long press on a ' +
+        'phone, then **Apps** › **Report to moderators**.',
+    );
+    expect(await choices('rep', {}, withMenu)).toEqual(['Report to moderators']);
+    const back = fakeButton({
+      customId: 'help:command:report to moderators:back',
+      ephemeralMessage: true,
+    });
+    await router.handle(back as never);
+    expect(titleOf(asV2(sent(back.update)))).toBe('### Utility');
+  });
+});
+
 describe('/help', () => {
   it('answers privately with the overview', async () => {
     expect(groupsOf(await ask())).toEqual(['Trains', 'Utility']);
diff --git a/src/commands/util/help.ts b/src/commands/util/help.ts
index 6d3d8830..ad6dbba3 100644
--- a/src/commands/util/help.ts
+++ b/src/commands/util/help.ts
@@ -9,6 +9,7 @@ import {
   declaredSubcommands,
   type CommandModule,
   type ComponentHandler,
+  type MessageCommand,
   type SimpleCommand,
 } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
@@ -26,6 +27,7 @@ import {
   renderCommandHelp,
   renderGroupHelp,
   renderHelpOverview,
+  renderMessageCommandHelp,
   renderSubcommandHelp,
   type HelpGroup,
 } from './help-render.js';
@@ -54,6 +56,22 @@ function visibleCommands(staff: boolean, ctx: AppContext): readonly CommandModul
     : ctx.commands.filter((c) => !isStaffCommand(c, ctx.config.settings.helpGroups));
 }
 
+/** The message commands a member may read about: staff ones are shown to staff only. */
+function visibleMessageCommands(staff: boolean, ctx: AppContext): readonly MessageCommand[] {
+  return staff
+    ? ctx.messageCommands
+    : ctx.messageCommands.filter((c) => !isStaffCommand(c, ctx.config.settings.helpGroups));
+}
+
+/** The message command of this name (`normalise`d, as `/help` reads what was typed). */
+function messageCommandNamed(
+  path: string,
+  staff: boolean,
+  ctx: AppContext,
+): MessageCommand | undefined {
+  return visibleMessageCommands(staff, ctx).find((c) => normalise(c.data.name) === path);
+}
+
 /** What a member is told of a command they cannot see or that does not exist. */
 const noCommand = (asked: string): UserError => new UserError(`There is no /${asked} command.`);
 
@@ -63,6 +81,8 @@ const noCommand = (asked: string): UserError => new UserError(`There is no /${as
  * as one that does not exist.
  */
 function commandPage(path: string, staff: boolean, ctx: AppContext): V2Message {
+  const onMessage = messageCommandNamed(normalise(path), staff, ctx);
+  if (onMessage) return renderMessageCommandHelp(onMessage, ctx.config.settings);
   const [name = '', ...rest] = path.split(' ');
   const command = visibleCommands(staff, ctx).find((c) => c.data.name === name);
   const page =
@@ -76,7 +96,12 @@ function commandPage(path: string, staff: boolean, ctx: AppContext): V2Message {
 
 /** The groups of commands the member sees. */
 function groupsFor(staff: boolean, ctx: AppContext): HelpGroup[] {
-  return helpGroupsOf(visibleCommands(staff, ctx), ctx.config.settings.helpGroups, staff);
+  return helpGroupsOf(
+    visibleCommands(staff, ctx),
+    ctx.config.settings.helpGroups,
+    staff,
+    visibleMessageCommands(staff, ctx),
+  );
 }
 
 /** The page of one group of commands, if the member sees it. */
@@ -124,7 +149,8 @@ export const help: SimpleCommand = {
 
   async autocomplete(interaction, ctx) {
     const typed = normalise(interaction.options.getFocused());
-    const names = visibleCommands(isStaff(interaction, ctx), ctx).flatMap((command) => {
+    const staff = isStaff(interaction, ctx);
+    const slashNames = visibleCommands(staff, ctx).flatMap((command) => {
       const { options } = command.data.toJSON();
       const groups = (options ?? []).flatMap((option) =>
         option.type === ApplicationCommandOptionType.SubcommandGroup ? [option.name] : [],
@@ -136,13 +162,20 @@ export const help: SimpleCommand = {
         ),
       ];
     });
-    const startsFirst = (a: string, b: string) =>
-      Number(!a.startsWith(typed)) - Number(!b.startsWith(typed)) || a.localeCompare(b);
+    // A message command by the name its menu shows, without a slash.
+    const names = [
+      ...slashNames.map((name) => ({ name: `/${name}`, value: name })),
+      ...visibleMessageCommands(staff, ctx).map((c) => ({ name: c.data.name, value: c.data.name })),
+    ];
+    const key = (choice: { value: string }) => normalise(choice.value);
+    const startsFirst = (a: { value: string }, b: { value: string }) =>
+      Number(!key(a).startsWith(typed)) - Number(!key(b).startsWith(typed)) ||
+      key(a).localeCompare(key(b));
     const choices = names
-      .filter((n) => n.includes(typed))
+      .filter((choice) => key(choice).includes(typed))
       .sort(startsFirst)
       .slice(0, MAX_CHOICES);
-    await interaction.respond(choices.map((n) => ({ name: `/${n}`, value: n })));
+    await interaction.respond(choices);
   },
 };
 
@@ -162,9 +195,12 @@ export const helpControls: ComponentHandler = {
     if (control === HELP_CONTROLS.overview) {
       page = renderHelpOverview(groupsFor(staff, ctx));
     } else if (id.id === HELP_PAGES.command && control === HELP_CONTROLS.back) {
+      const onMessage = messageCommandNamed(id.action, staff, ctx);
       const words = id.action.split(' ');
       const [name = ''] = words;
-      if (words.length > 1) {
+      if (onMessage) {
+        page = groupPage(onMessage.help.category, staff, ctx);
+      } else if (words.length > 1) {
         // One level up: `/admin boss add` to `/admin boss`, `/route add` to `/route`.
         page = commandPage(words.slice(0, -1).join(' '), staff, ctx);
       } else {
diff --git a/src/discord/command.ts b/src/discord/command.ts
index 82209d2d..80cad0bb 100644
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -6,8 +6,10 @@ import {
   type ButtonInteraction,
   type ChatInputCommandInteraction,
   type MessageComponentInteraction,
+  type MessageContextMenuCommandInteraction,
   type ModalSubmitInteraction,
   type RESTPostAPIChatInputApplicationCommandsJSONBody,
+  type RESTPostAPIContextMenuApplicationCommandsJSONBody,
 } from 'discord.js';
 import type { AppContext } from '../app-context.js';
 import type { HelpCategory } from '../commands/categories.js';
@@ -20,7 +22,8 @@ export type GuardableInteraction =
   ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;
 
 /** Any interaction, for code that only reads where it came from and who sent it. */
-export type LocatedInteraction = GuardableInteraction | AutocompleteInteraction;
+export type LocatedInteraction =
+  GuardableInteraction | AutocompleteInteraction | MessageContextMenuCommandInteraction;
 
 /** A precondition. Throw a UserError to refuse; return normally to allow. */
 export type Guard = (interaction: LocatedInteraction, ctx: AppContext) => void | Promise<void>;
@@ -133,6 +136,56 @@ export interface GroupedCommand extends CommandBase {
 
 export type CommandModule = SimpleCommand | GroupedCommand;
 
+/** A ContextMenuCommandBuilder of type Message (or anything with the same shape). */
+export interface MessageCommandData {
+  readonly name: string;
+  toJSON(): RESTPostAPIContextMenuApplicationCommandsJSONBody;
+}
+
+/**
+ * A message command (plan 8S-2): an entry of Discord's Apps menu on a message (a right-click, or
+ * a long press on a phone), which Discord sends with the message it was used on, text included,
+ * without any intent. Listed in `messageCommands` (`src/commands/index.ts`) beside the slash
+ * commands; the router, the deploy script and `/help` read both lists. Offered in servers only
+ * and for server installs only. Its name is what the menu shows (`Report to moderators`), and
+ * its throttle and its uses are counted under that name.
+ */
+export interface MessageCommand {
+  target: 'message';
+  data: MessageCommandData;
+  /** `/help` lists it under its name; a message command has no description of its own. */
+  help: CommandHelp & { description: string };
+  enabled?: (config: Config) => boolean;
+  guards?: readonly Guard[];
+  /**
+   * How it is acknowledged before it runs (`ephemeral`), or not at all (it answers within three
+   * seconds itself, or opens a form, which must come first).
+   */
+  defer?:
+    | 'ephemeral'
+    | ((
+        interaction: MessageContextMenuCommandInteraction,
+        ctx: AppContext,
+      ) => 'ephemeral' | undefined);
+  throttle?: Throttle;
+  run(interaction: MessageContextMenuCommandInteraction, ctx: AppContext): Promise<void>;
+}
+
+/** Whether a command of the router's list is a message command. */
+export function isMessageCommand(
+  command: CommandModule | MessageCommand,
+): command is MessageCommand {
+  return 'target' in command && command.target === 'message';
+}
+
+/** The message commands this installation offers. */
+export function enabledMessageCommands(
+  commands: readonly MessageCommand[],
+  config: Config,
+): MessageCommand[] {
+  return commands.filter((command) => command.enabled?.(config) ?? true);
+}
+
 /**
  * The command under another name as well (`/hmm` for `/interested`): the same guards, handlers,
  * throttle and help, its own name, and its own description when one is given. Both names are
diff --git a/src/discord/deploy-cli.ts b/src/discord/deploy-cli.ts
index b1bf218e..f69f4d0a 100644
--- a/src/discord/deploy-cli.ts
+++ b/src/discord/deploy-cli.ts
@@ -1,11 +1,11 @@
 import { REST, Routes } from 'discord.js';
-import { commands } from '../commands/index.js';
+import { commands, messageCommands } from '../commands/index.js';
 import { loadConfig } from '../config/index.js';
 import { dbConfigFrom } from '../db/db-config.js';
 import { createDb } from '../db/kysely.js';
 import { CutoverRepository } from '../db/repositories/cutover-repository.js';
 import { servedSettings } from '../services/rehearsal.js';
-import { enabledCommands } from './command.js';
+import { enabledCommands, enabledMessageCommands } from './command.js';
 import {
   buildCommandPayload,
   deployPlan,
@@ -54,7 +54,10 @@ async function servers(): Promise<string[]> {
 
 const plan = deployPlan(target, {
   appId: env.DISCORD_APP_ID,
-  body: buildCommandPayload(enabledCommands(commands, config)),
+  body: buildCommandPayload(
+    enabledCommands(commands, config),
+    enabledMessageCommands(messageCommands, config),
+  ),
   rehearsal: config.settings.rehearsal !== undefined,
   servers: await servers(),
 });
diff --git a/src/discord/deploy.test.ts b/src/discord/deploy.test.ts
index 0a4e08a3..2e34293c 100644
--- a/src/discord/deploy.test.ts
+++ b/src/discord/deploy.test.ts
@@ -1,12 +1,14 @@
 import {
+  ApplicationCommandType,
   ApplicationIntegrationType,
+  ContextMenuCommandBuilder,
   InteractionContextType,
   SlashCommandBuilder,
 } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { createTestContext } from '../../test/support/test-context.js';
 import { commands } from '../commands/index.js';
-import { enabledCommands, type CommandModule } from './command.js';
+import { enabledCommands, type CommandModule, type MessageCommand } from './command.js';
 import {
   buildCommandPayload,
   deployPlan,
@@ -54,6 +56,28 @@ describe('buildCommandPayload', () => {
     expect(rank?.integration_types).toEqual([ApplicationIntegrationType.UserInstall]);
   });
 
+  it('registers the message commands beside them, in servers only, five at most', () => {
+    const onMessage = (name: string): MessageCommand => ({
+      target: 'message',
+      data: new ContextMenuCommandBuilder().setName(name).setType(ApplicationCommandType.Message),
+      help: { category: 'util', description: name },
+      run: () => Promise.resolve(),
+    });
+    const body = buildCommandPayload([stub('raid')], [onMessage('Report to moderators')]);
+    expect(body.map((one) => [one.name, one.type ?? ApplicationCommandType.ChatInput])).toEqual([
+      ['raid', ApplicationCommandType.ChatInput],
+      ['Report to moderators', ApplicationCommandType.Message],
+    ]);
+    const [, report] = body;
+    expect(report?.contexts).toEqual([InteractionContextType.Guild]);
+    expect(report?.integration_types).toEqual([ApplicationIntegrationType.GuildInstall]);
+    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(onMessage);
+    expect(() => buildCommandPayload([], six)).toThrow(/6 message commands; Discord allows 5/);
+    expect(() => buildCommandPayload([], [onMessage('a'), onMessage('a')])).toThrow(
+      /Duplicate command a/,
+    );
+  });
+
   it('offers /help in a DM with the bot as well', () => {
     const help = buildCommandPayload(commands).find((c) => c.name === 'help');
     expect(help?.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
diff --git a/src/discord/deploy.ts b/src/discord/deploy.ts
index c0e573b8..c7c86625 100644
--- a/src/discord/deploy.ts
+++ b/src/discord/deploy.ts
@@ -2,9 +2,9 @@ import {
   ApplicationIntegrationType,
   InteractionContextType,
   Routes,
-  type RESTPostAPIChatInputApplicationCommandsJSONBody,
+  type RESTPostAPIApplicationCommandsJSONBody,
 } from 'discord.js';
-import type { CommandModule } from './command.js';
+import type { CommandModule, MessageCommand } from './command.js';
 
 export const MAX_COMMANDS = 100;
 /**
@@ -14,30 +14,49 @@ export const MAX_COMMANDS = 100;
  */
 export const MAX_COMMAND_CHARACTERS = 8_000;
 
+/** Discord allows an application this many message commands (the Apps menu on a message). */
+export const MAX_MESSAGE_COMMANDS = 5;
+
 /**
- * What is sent to Discord to register the commands. A command that does not say where it may
- * be used is offered in servers only, and installed to servers only: Discord's own default would
- * also offer it in DMs.
+ * What is sent to Discord to register the commands: the slash commands, then the message
+ * commands (plan 8S-2). A command that does not say where it may be used is offered in servers
+ * only, and installed to servers only: Discord's own default would also offer it in DMs.
  */
 export function buildCommandPayload(
   commands: readonly CommandModule[],
-): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
+  messageCommands: readonly MessageCommand[] = [],
+): RESTPostAPIApplicationCommandsJSONBody[] {
   if (commands.length > MAX_COMMANDS) {
     throw new Error(`${commands.length} commands; Discord allows ${MAX_COMMANDS} per application`);
   }
+  if (messageCommands.length > MAX_MESSAGE_COMMANDS) {
+    throw new Error(
+      `${messageCommands.length} message commands; Discord allows ${MAX_MESSAGE_COMMANDS}`,
+    );
+  }
+  const where = <T extends { contexts?: unknown; integration_types?: unknown }>(json: T) => ({
+    ...json,
+    contexts: json.contexts ?? [InteractionContextType.Guild],
+    // Without this, an application with User Install enabled would offer the commands in
+    // servers the bot is not in.
+    integration_types: json.integration_types ?? [ApplicationIntegrationType.GuildInstall],
+  });
   const seen = new Set<string>();
-  return commands.map((command) => {
+  const slash = commands.map((command) => {
     const json = command.data.toJSON();
     if (seen.has(json.name)) throw new Error(`Duplicate command /${json.name}`);
     seen.add(json.name);
-    return {
-      ...json,
-      contexts: json.contexts ?? [InteractionContextType.Guild],
-      // Without this, an application with User Install enabled would offer the commands in
-      // servers the bot is not in.
-      integration_types: json.integration_types ?? [ApplicationIntegrationType.GuildInstall],
-    };
+    return where(json);
+  });
+  // Discord keeps the names of message commands apart from those of slash commands.
+  const named = new Set<string>();
+  const onMessages = messageCommands.map((command) => {
+    const json = command.data.toJSON();
+    if (named.has(json.name)) throw new Error(`Duplicate command ${json.name}`);
+    named.add(json.name);
+    return where(json);
   });
+  return [...slash, ...onMessages];
 }
 
 /**
@@ -120,7 +139,7 @@ export async function sendDeploy(
 /** One registration: where, what, and what the deploy script says of it. */
 export interface DeployRequest {
   route: `/${string}`;
-  body: RESTPostAPIChatInputApplicationCommandsJSONBody[];
+  body: RESTPostAPIApplicationCommandsJSONBody[];
   what: string;
 }
 
@@ -135,13 +154,13 @@ export function deployPlan(
   target: DeployTarget,
   options: {
     appId: string;
-    body: RESTPostAPIChatInputApplicationCommandsJSONBody[];
+    body: RESTPostAPIApplicationCommandsJSONBody[];
     rehearsal: boolean;
     servers: readonly string[];
   },
 ): { ok: true; requests: DeployRequest[] } | { ok: false; refusal: string } {
   const { appId, body, rehearsal, servers } = options;
-  const inServers = (commands: RESTPostAPIChatInputApplicationCommandsJSONBody[]) =>
+  const inServers = (commands: RESTPostAPIApplicationCommandsJSONBody[]) =>
     servers.length === 0
       ? ({ ok: false, refusal: 'The database names no server.' } as const)
       : ({
diff --git a/src/discord/late-reply.ts b/src/discord/late-reply.ts
index efc4b2f6..9ba59ab0 100644
--- a/src/discord/late-reply.ts
+++ b/src/discord/late-reply.ts
@@ -5,6 +5,7 @@ import {
   type Message,
   type InteractionReplyOptions,
   type MessageComponentInteraction,
+  type MessageContextMenuCommandInteraction,
   type ModalSubmitInteraction,
 } from 'discord.js';
 import type { MessageFile, V2Message } from './party-gateway.js';
@@ -44,7 +45,10 @@ export function v2Answer(message: V2Message): {
 }
 
 type Answerable =
-  ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;
+  | ChatInputCommandInteraction
+  | MessageContextMenuCommandInteraction
+  | MessageComponentInteraction
+  | ModalSubmitInteraction;
 
 interface Waiting {
   /** Stops the acknowledgement that has not begun. */
diff --git a/src/discord/router.test.ts b/src/discord/router.test.ts
index a4a1403d..2c2303b9 100644
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -1,6 +1,8 @@
 import {
+  ApplicationCommandType,
   ButtonStyle,
   ComponentType,
+  ContextMenuCommandBuilder,
   MessageFlags,
   PermissionFlagsBits,
   SlashCommandBuilder,
@@ -12,13 +14,20 @@ import {
   fakeAutocomplete,
   fakeButton,
   fakeChatInput,
+  fakeMessageCommand,
   fakeModal,
   fakeSelect,
   sent,
 } from '../../test/support/fake-interactions.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import { commandGroup, type SubcommandPart } from './command-group.js';
-import { alsoAs, type ComponentHandler, type Guard, type SimpleCommand } from './command.js';
+import {
+  alsoAs,
+  type ComponentHandler,
+  type Guard,
+  type MessageCommand,
+  type SimpleCommand,
+} from './command.js';
 import { UserError } from './errors.js';
 import { answer } from './late-reply.js';
 import { controlThrottleKey, InteractionRouter, STALE_COMPONENT } from './router.js';
@@ -1137,6 +1146,106 @@ describe('InteractionRouter', () => {
   });
 });
 
+describe('InteractionRouter and message commands', () => {
+  function onMessage(overrides: Partial<MessageCommand> = {}): MessageCommand {
+    return {
+      target: 'message',
+      data: new ContextMenuCommandBuilder()
+        .setName('Report to moderators')
+        .setType(ApplicationCommandType.Message),
+      help: { category: 'util', description: 'Tell the moderators about a message' },
+      run: vi.fn(() => Promise.resolve()),
+      ...overrides,
+    };
+  }
+  const used = (o: Parameters<typeof fakeMessageCommand>[0] = {}) =>
+    fakeMessageCommand({ targetMessage: { id: '800000000000000001', authorId: '1' }, ...o });
+
+  it('runs the guards, then the command used on a message, by its name', async () => {
+    const { ctx } = createTestContext();
+    const order: string[] = [];
+    const run = vi.fn((interaction: { targetMessage: { id: string } }) => {
+      order.push(`run ${interaction.targetMessage.id}`);
+      return Promise.resolve();
+    });
+    const reported = onMessage({ guards: [() => void order.push('guard')], run });
+    const otherRun = ran();
+    const other = onMessage({
+      data: new ContextMenuCommandBuilder()
+        .setName('Something else')
+        .setType(ApplicationCommandType.Message),
+      run: otherRun,
+    });
+    const router = new InteractionRouter(ctx, [command(), reported, other], []);
+    await router.handle(asInteraction(used()));
+    expect(order).toEqual(['guard', 'run 800000000000000001']);
+    expect(otherRun).not.toHaveBeenCalled();
+  });
+
+  it('answers a refusal privately, and counts only what the guards let through', async () => {
+    const { ctx } = createTestContext();
+    let refuse = true;
+    const run = ran();
+    const router = new InteractionRouter(
+      ctx,
+      [
+        onMessage({
+          guards: [
+            () => {
+              if (refuse) throw new UserError('Nothing to report there.');
+            },
+          ],
+          throttle: { uses: 1, perSeconds: 3600 },
+          run,
+        }),
+      ],
+      [],
+    );
+    const refused = used();
+    await router.handle(asInteraction(refused));
+    expect(refused.reply).toHaveBeenCalledWith({
+      content: 'Nothing to report there.',
+      flags: MessageFlags.Ephemeral,
+    });
+    refuse = false;
+    await router.handle(asInteraction(used()));
+    const again = used();
+    await router.handle(asInteraction(again));
+    expect(run).toHaveBeenCalledTimes(1);
+    expect(again.reply).toHaveBeenCalledWith({
+      content: 'You can use Report to moderators again in 60 minutes.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it('acknowledges privately first when the command asks for it', async () => {
+    const { ctx } = createTestContext();
+    const i = used();
+    const run = vi.fn(() => {
+      expect(i.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+      return Promise.resolve();
+    });
+    await new InteractionRouter(ctx, [onMessage({ defer: 'ephemeral', run })], []).handle(
+      asInteraction(i),
+    );
+    expect(run).toHaveBeenCalled();
+  });
+
+  it('answers a message command it does not know, and refuses two of one name', async () => {
+    const { ctx, entries } = createTestContext();
+    const i = used({ commandName: 'Gone' });
+    await new InteractionRouter(ctx, [onMessage()], []).handle(asInteraction(i));
+    expect(i.reply).toHaveBeenCalledWith({
+      content: 'That command is not available.',
+      flags: MessageFlags.Ephemeral,
+    });
+    expect(entries.some((entry) => entry.msg === 'no handler for command')).toBe(true);
+    expect(() => new InteractionRouter(ctx, [onMessage(), onMessage()], [])).toThrow(
+      /Duplicate command Report to moderators/,
+    );
+  });
+});
+
 describe('InteractionRouter in rehearsal mode', () => {
   const MATT = '412345678901234501';
   const rehearsing = () =>
diff --git a/src/discord/router.ts b/src/discord/router.ts
index 4484ef81..114013be 100644
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -5,11 +5,13 @@ import {
   type ChatInputCommandInteraction,
   type Interaction,
   type MessageComponentInteraction,
+  type MessageContextMenuCommandInteraction,
   type ModalSubmitInteraction,
 } from 'discord.js';
 import type { AppContext } from '../app-context.js';
 import {
   declaredSubcommands,
+  isMessageCommand,
   subcommandPath,
   type CommandHandler,
   type CommandModule,
@@ -18,6 +20,7 @@ import {
   type Guard,
   type GuardableInteraction,
   type LocatedInteraction,
+  type MessageCommand,
 } from './command.js';
 import { channelContext } from './channel-context.js';
 import { decodeCustomId, type CustomId } from './custom-id.js';
@@ -27,6 +30,9 @@ import { Throttles, waitText, type Throttle } from './throttle.js';
 import { REHEARSAL_REFUSAL } from '../services/rehearsal.js';
 
 export const STALE_COMPONENT = 'This control is no longer active.';
+
+/** What the router answers: a command (slash or message) or a control. */
+type Answered = GuardableInteraction | MessageContextMenuCommandInteraction;
 const UNKNOWN_COMMAND = 'That command is not available.';
 /** Discord refuses a message longer than this. */
 const MESSAGE_LIMIT = 2000;
@@ -37,10 +43,7 @@ const genericError = (ref: string) => `Something went wrong (ref \`${ref}\`).`;
  * deferral with no answer yet, the "thinking…" message is removed first: the first follow-up
  * would take its place and be as public as the deferral.
  */
-export async function replyEphemeral(
-  interaction: GuardableInteraction,
-  content: string,
-): Promise<void> {
+export async function replyEphemeral(interaction: Answered, content: string): Promise<void> {
   const payload = {
     content: content.length > MESSAGE_LIMIT ? `${content.slice(0, MESSAGE_LIMIT - 1)}…` : content,
     flags: MessageFlags.Ephemeral,
@@ -119,6 +122,8 @@ export function variedThrottleKey(key: string, throttle: Throttle): string {
 
 export class InteractionRouter {
   private readonly commands = new Map<string, CommandModule>();
+  /** The message commands (Discord's Apps menu on a message), by the name the menu shows. */
+  private readonly messageCommands = new Map<string, MessageCommand>();
   private readonly components = new Map<string, ComponentHandler>();
   private readonly throttles: Throttles;
   /** The commands Discord shows to staff only (`default_member_permissions`), by name. */
@@ -127,9 +132,13 @@ export class InteractionRouter {
   private readonly lateDeferMs: number;
   private readonly setTimer: RouterOptions['setTimer'];
 
+  /**
+   * `commands` are the slash commands and the message commands (`MessageCommand`) alike; a
+   * name used twice among either is refused.
+   */
   constructor(
     private readonly ctx: AppContext,
-    commands: readonly CommandModule[],
+    commands: readonly (CommandModule | MessageCommand)[],
     components: readonly ComponentHandler[],
     options: RouterOptions = {},
   ) {
@@ -138,6 +147,12 @@ export class InteractionRouter {
     this.setTimer = options.setTimer;
     this.throttles = options.throttles ?? new Throttles();
     for (const command of commands) {
+      if (isMessageCommand(command)) {
+        if (this.messageCommands.has(command.data.name))
+          throw new Error(`Duplicate command ${command.data.name}`);
+        this.messageCommands.set(command.data.name, command);
+        continue;
+      }
       if (this.commands.has(command.data.name))
         throw new Error(`Duplicate command /${command.data.name}`);
       assertHandlersMatch(command);
@@ -167,7 +182,9 @@ export class InteractionRouter {
     const lateMs = Date.now() - interaction.createdTimestamp;
     let deferMs: number | undefined;
     if (interaction.isChatInputCommand()) deferMs = await this.handleCommand(interaction);
-    else if (interaction.isMessageComponent() || interaction.isModalSubmit())
+    else if (interaction.isMessageContextMenuCommand()) {
+      deferMs = await this.handleMessageCommand(interaction);
+    } else if (interaction.isMessageComponent() || interaction.isModalSubmit())
       await this.handleComponent(interaction);
     else return;
     this.ctx.log.debug(
@@ -205,6 +222,7 @@ export class InteractionRouter {
     if (!rehearsal || interaction.isAutocomplete() || !interaction.inGuild()) return interaction;
     if (
       !interaction.isChatInputCommand() &&
+      !interaction.isMessageContextMenuCommand() &&
       !interaction.isMessageComponent() &&
       !interaction.isModalSubmit()
     ) {
@@ -227,6 +245,7 @@ export class InteractionRouter {
       if (interaction.isAutocomplete()) await interaction.respond([]);
       else if (
         interaction.isChatInputCommand() ||
+        interaction.isMessageContextMenuCommand() ||
         interaction.isMessageComponent() ||
         interaction.isModalSubmit()
       ) {
@@ -301,6 +320,42 @@ export class InteractionRouter {
     return deferMs;
   }
 
+  /**
+   * A message command (the Apps menu on a message): guards, throttle (counted under the name the
+   * menu shows), the private acknowledgement it asks for, then the command. Answers how long the
+   * acknowledgement took, for one that was acknowledged.
+   */
+  private async handleMessageCommand(
+    interaction: MessageContextMenuCommandInteraction,
+  ): Promise<number | undefined> {
+    const command = this.messageCommands.get(interaction.commandName);
+    let deferMs: number | undefined;
+    await this.guarded(interaction, async () => {
+      if (!command) {
+        this.ctx.log.warn({ interaction: describe(interaction) }, 'no handler for command');
+        throw new UserError(UNKNOWN_COMMAND);
+      }
+      await runGuards(command.guards ?? [], interaction, this.ctx);
+      const { throttle } = command;
+      if (throttle) {
+        const name = command.data.name;
+        const wait = this.throttles.use(name, interaction.user.id, throttle, this.now());
+        if (wait !== undefined) {
+          throw new UserError(`You can use ${name} again in ${waitText(wait)}.`);
+        }
+      }
+      const defer =
+        typeof command.defer === 'function' ? command.defer(interaction, this.ctx) : command.defer;
+      if (defer === 'ephemeral') {
+        const before = performance.now();
+        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+        deferMs = Math.round(performance.now() - before);
+      }
+      await command.run(interaction, this.ctx);
+    });
+    return deferMs;
+  }
+
   /**
    * Answers the list of an option while it is typed. For a command that is for staff
    * (`default_member_permissions`) the guards of the command run first, and whoever they refuse
@@ -402,10 +457,7 @@ export class InteractionRouter {
     });
   }
 
-  private async guarded(
-    interaction: GuardableInteraction,
-    run: () => Promise<void>,
-  ): Promise<void> {
+  private async guarded(interaction: Answered, run: () => Promise<void>): Promise<void> {
     try {
       await run();
     } catch (err) {
@@ -475,7 +527,7 @@ function assertHandlersMatch(command: CommandModule): void {
   }
 }
 
-function subcommandOf(interaction: Interaction | GuardableInteraction): string | undefined {
+function subcommandOf(interaction: Interaction | Answered): string | undefined {
   if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) return undefined;
   const path = subcommandPath(
     interaction.options.getSubcommandGroup(false),
@@ -484,7 +536,7 @@ function subcommandOf(interaction: Interaction | GuardableInteraction): string |
   return path === '' ? undefined : path;
 }
 
-function describe(interaction: Interaction | GuardableInteraction) {
+function describe(interaction: Interaction | Answered) {
   return {
     id: interaction.id,
     type: interaction.type,
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index 6b433357..a4289064 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -177,6 +177,54 @@ export interface FakeOptions {
    * when its rows are more than rows of controls.
    */
   v2Message?: boolean;
+  /**
+   * A message command (Discord's Apps menu on a message): the message it was used on, as Discord
+   * sends it with the interaction (`interaction.targetMessage`, `targetId`).
+   */
+  targetMessage?: FakeTargetMessage;
+}
+
+/** The bot's own user id in the fakes: `interaction.client.user.id`. */
+export const FAKE_BOT_ID = '700000000000000999';
+
+/** The message a message command was used on, as Discord sends it with the interaction. */
+export interface FakeTargetMessage {
+  id: string;
+  /** Its channel (a thread's own id for a message in a post); the interaction's by default. */
+  channelId?: string;
+  content?: string;
+  authorId: string;
+  /** The author's name in the server (`member.displayName`); none for a member who left. */
+  authorName?: string;
+  /** The author's account name (`author.username`). */
+  authorUsername?: string;
+  /** Whether the author is a bot (`author.bot`); the bot itself when `authorId` is `FAKE_BOT_ID`. */
+  authorBot?: boolean;
+  /** When it was written (`createdTimestamp`). */
+  createdTimestamp?: number;
+  /** The names of its attachments. */
+  attachments?: readonly string[];
+}
+
+/** The message a fake message command carries, as discord.js gives `targetMessage`. */
+function targetOf(target: FakeTargetMessage, channelId: string, guildId: string | null) {
+  return {
+    id: target.id,
+    channelId: target.channelId ?? channelId,
+    guildId,
+    content: target.content ?? '',
+    createdTimestamp: target.createdTimestamp ?? Date.now(),
+    author: {
+      id: target.authorId,
+      bot: target.authorBot ?? target.authorId === FAKE_BOT_ID,
+      username: target.authorUsername ?? 'someone',
+      globalName: null,
+    },
+    member: target.authorName === undefined ? null : { displayName: target.authorName },
+    attachments: new Collection(
+      (target.attachments ?? []).map((name, i) => [String(i), { id: String(i), name }]),
+    ),
+  };
 }
 
 /** A row of controls as Discord's API has it. */
@@ -214,9 +262,16 @@ export function fakeMessage(
   return { id, rows, content, files };
 }
 
-type Kind = 'chat' | 'autocomplete' | 'button' | 'select' | 'modal';
+type Kind = 'chat' | 'autocomplete' | 'button' | 'select' | 'modal' | 'message';
 
-const TYPE: Record<Kind, number> = { chat: 2, autocomplete: 4, button: 3, select: 3, modal: 5 };
+const TYPE: Record<Kind, number> = {
+  chat: 2,
+  autocomplete: 4,
+  button: 3,
+  select: 3,
+  modal: 5,
+  message: 2,
+};
 export const FAKE_GUILD_ID = '412345678901234567';
 export const FAKE_CHANNEL_ID = '600000000000000001';
 export const FAKE_PARENT_ID = '600000000000000002';
@@ -634,9 +689,18 @@ function base(kind: Kind, o: FakeOptions) {
       ? null
       : new PermissionsBitField(o.memberPermissions ?? o.permissions ?? 0n).freeze(),
     commandName: o.commandName,
+    /** Discord's `ApplicationCommandType`: 1 for a slash command, 3 for a message command. */
+    commandType: kind === 'message' ? 3 : kind === 'chat' || kind === 'autocomplete' ? 1 : null,
     customId: o.customId,
     guildId,
     channelId,
+    client: { user: { id: FAKE_BOT_ID } },
+    ...(kind === 'message' && o.targetMessage
+      ? {
+          targetId: o.targetMessage.id,
+          targetMessage: targetOf(o.targetMessage, channelId, guildId),
+        }
+      : {}),
     user: {
       id: o.userId ?? FAKE_USER_ID,
       ...(o.username === undefined ? {} : { username: o.username }),
@@ -680,6 +744,8 @@ function base(kind: Kind, o: FakeOptions) {
     responded: false,
     values: o.values ?? [],
     isChatInputCommand: () => kind === 'chat',
+    isMessageContextMenuCommand: () => kind === 'message',
+    isContextMenuCommand: () => kind === 'message',
     isAutocomplete: () => kind === 'autocomplete',
     isMessageComponent: () => kind === 'button' || kind === 'select',
     isButton: () => kind === 'button',
@@ -839,6 +905,9 @@ export const fakeAutocomplete = (o: FakeOptions = {}) =>
 export const fakeButton = (o: FakeOptions = {}) => base('button', o);
 export const fakeSelect = (o: FakeOptions = {}) => base('select', o);
 export const fakeModal = (o: FakeOptions = {}) => base('modal', o);
+/** A message command used on `o.targetMessage` (Discord's Apps menu on a message). */
+export const fakeMessageCommand = (o: FakeOptions = {}) =>
+  base('message', { commandName: 'Report to moderators', ...o });
 export type FakeInteraction = ReturnType<typeof base>;
 
 /**
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 8ee896ef..af9c624b 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -71,6 +71,7 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     log,
     db: {} as Kysely<DB>,
     commands: [],
+    messageCommands: [],
     gameData,
     raidBosses: raidBossesFixture(),
     raidBossAdmin: unavailable<RaidBossAdmin>(
````

### Task 3: Plan 8S-2 T3: Party reports to the moderators, and /delete for staff only

Prototype commit: `a038c27e94d81adeb8423d075652f6b32de69069`

/report opens a form for the reason; the report goes to the moderators' channel as a post
(ModerationReports, the reasons of one party gathered on its one open report), nothing is
said in the party's post, five reports an hour counted on the form. Without the channel it
goes into the post as a member's /delete did. A reported party that ends by itself ends its
report. /delete is for staff (Manage Messages, requireManagement) and asks privately whether
to archive the post or delete it; PartyService.end deletes the post on request. /help tells
members looking for /delete to use /report.

**Files:**

```
 src/app-context.ts                            |   6 +
 src/app.ts                                    |  35 +++++-
 src/commands/index.ts                         |   2 +
 src/commands/parties/delete.test.ts           | 454 ++++++++++++++++++++++++++++--------------------------------------
 src/commands/parties/delete.ts                | 159 ++++++++++++++++++-----
 src/commands/parties/in-meetup.test.ts        |  62 ++++++---
 src/commands/parties/in-train.test.ts         |  64 +++++++---
 src/commands/parties/report.test.ts           | 179 ++++++++++++++++++++++++++
 src/commands/parties/report.ts                | 188 +++++++++++++++++++++++++++
 src/commands/util/help.test.ts                |  15 +++
 src/commands/util/help.ts                     |  15 ++-
 src/components/index.ts                       |   4 +
 src/components/party.ts                       |  44 +------
 src/db/repositories/report-repository.ts      |  12 ++
 src/discord/custom-id.ts                      |   7 ++
 src/discord/party-gateway.ts                  |  15 +++
 src/domain/moderation/reports.ts              |   2 +
 src/render/meetup-post.test.ts                |   2 +
 src/render/meetup-post.ts                     |   1 +
 src/render/meetup-safety.ts                   |  23 ++--
 src/render/moderation.test.ts                 | 230 +++++++++++++++++++++++++++++++++
 src/render/moderation.ts                      | 276 ++++++++++++++++++++++++++++++++++++++++
 src/render/party-controls.test.ts             |  18 ---
 src/render/party-controls.ts                  |  48 +------
 src/render/party-post.ts                      |   5 +
 src/render/spawn.ts                           |   9 +-
 src/render/train-post.test.ts                 |   1 +
 src/render/train-post.ts                      |   1 +
 src/services/moderation-reports.posts.test.ts | 150 ++++++++++++++++++++++
 src/services/moderation-reports.test.ts       | 194 ++++++++++++++++++++++++++++
 src/services/moderation-reports.ts            | 403 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/party-service.meetup.test.ts     |  47 +++++++
 src/services/party-service.ts                 |  84 ++++++++++++-
 test/support/fake-gateway.ts                  |  12 ++
 test/support/report-cases.ts                  |   1 +
 test/support/reports-service.ts               |  36 ++++++
 test/support/reports.ts                       |   5 +
 test/support/test-context.ts                  |  21 ++++
 38 files changed, 2383 insertions(+), 447 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/parties/delete.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/in-train.test.ts src/commands/parties/report.test.ts src/commands/util/help.test.ts src/render/meetup-post.test.ts src/render/moderation.test.ts src/render/party-controls.test.ts src/render/train-post.test.ts src/services/moderation-reports.posts.test.ts src/services/moderation-reports.test.ts src/services/party-service.meetup.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff a038c27e94d81adeb8423d075652f6b32de69069 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-2 T3: Party reports to the moderators, and /delete for staff only`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index 2ca5a183..b652878b 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -44,6 +44,7 @@ import type { Rehearsal } from './services/rehearsal.js';
 import type { LegacyCleanup } from './services/legacy-cleanup.js';
 import type { LoginLinks } from './web/login-links.js';
 import type { MeetupSafety } from './services/meetup-safety.js';
+import type { ModerationReports } from './services/moderation-reports.js';
 
 /** Everything a handler may use. Later phases add services here. */
 export interface AppContext {
@@ -99,6 +100,11 @@ export interface AppContext {
    * moderators and their decisions, blocks and appeals. Off without `settings.channels.moderation`.
    */
   readonly meetupSafety: MeetupSafety;
+  /**
+   * Reports to the moderators (plan 8S-2): of parties and messages, in the moderators' channel of
+   * meetup safety; without it a party's report goes into its post.
+   */
+  readonly reports: ModerationReports;
   /** What members change about a meetup or a train: its name, its times, what a meetup says. */
   readonly timedParties: TimedPartyService;
   /** What members change about a train as such: its route, where it is, its conductor, its boss. */
diff --git a/src/app.ts b/src/app.ts
index 4aad6356..3c910a88 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -98,6 +98,8 @@ import { RegionDirectory } from './services/region-directory.js';
 import { SelfRoleService } from './services/self-role-service.js';
 import { SpawnService } from './services/spawn-service.js';
 import { MeetupSafety } from './services/meetup-safety.js';
+import { ModerationReports } from './services/moderation-reports.js';
+import { ReportRepository } from './db/repositories/report-repository.js';
 import { StaticMaps } from './services/static-maps.js';
 import { LegacyCleanup } from './services/legacy-cleanup.js';
 import {
@@ -532,12 +534,13 @@ export async function startApp(
   // with the clock. In rehearsal mode its requests and appeals go into the moderators' channel
   // (Matt, 2026-10-17): through a gateway of its own, so that nothing else of the bot does.
   const moderation = config.settings.channels.moderation;
+  const moderatorsGateway =
+    rehearsal && moderation !== undefined
+      ? rehearsalModeratorsGateway(partyGateway, discordGateway, moderation, log)
+      : partyGateway;
   const meetupSafety = new MeetupSafety({
     storage: new MeetupSafetyRepository(db, log),
-    gateway:
-      rehearsal && moderation !== undefined
-        ? rehearsalModeratorsGateway(partyGateway, discordGateway, moderation, log)
-        : partyGateway,
+    gateway: moderatorsGateway,
     gyms,
     parties: partyService,
     dms: memberDms,
@@ -546,10 +549,30 @@ export async function startApp(
     settings: config.settings,
     log,
   });
+  // Reports to the moderators (plan 8S-2): their posts go into meetup safety's channel, through
+  // its gateway (also in rehearsal mode); a reported party's report ends with the party.
+  const reports = new ModerationReports({
+    storage: new ReportRepository(db, log),
+    gateway: moderatorsGateway,
+    parties: partyService,
+    store: parties,
+    regions,
+    gyms,
+    settings: config.settings,
+    log,
+  });
+  reports.watch(parties);
   const scheduler = new PartyScheduler({
     store: parties,
     history: partyHistory,
-    requests: meetupSafety,
+    // The expiry of meetup safety and, with it, the sweep of the reports (plan 8S-2).
+    requests: {
+      expire: async () => {
+        const expired = await meetupSafety.expire();
+        await reports.sweep();
+        return expired;
+      },
+    },
     posts: partyService,
     attendance,
     access,
@@ -656,6 +679,7 @@ export async function startApp(
     raids,
     timedParties,
     meetupSafety,
+    reports,
     trains,
     clickAnswers,
     users,
@@ -964,6 +988,7 @@ export async function startApp(
       { name: 'gym and region changes', timeoutMs: 5_000, run: () => adminLock.whenIdle() },
       { name: 'train moves', timeoutMs: 5_000, run: () => trains.flush() },
       { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
+      { name: 'reports', timeoutMs: 5_000, run: () => reports.flush() },
       { name: 'party posts', timeoutMs: 5_000, run: () => partyService.close() },
       { name: 'forum access', timeoutMs: 5_000, run: () => access.flush() },
       // A member's roles are changed one request after the other: a change that has begun is
diff --git a/src/commands/index.ts b/src/commands/index.ts
index d13a8f77..e7334870 100644
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -18,6 +18,7 @@ import {
 } from './parties/attendance.js';
 import { group } from './parties/group.js';
 import { deleteParty } from './parties/delete.js';
+import { report } from './parties/report.js';
 import { cancelMeet, meet } from './parties/meet.js';
 import { name } from './parties/name.js';
 import { target, targets, untarget, untargetAll } from './notifications/targets.js';
@@ -77,6 +78,7 @@ export const commands: readonly CommandModule[] = [
   where,
   bounds,
   shout,
+  report,
   deleteParty,
   hatch,
   end,
diff --git a/src/commands/parties/delete.test.ts b/src/commands/parties/delete.test.ts
index b8e49fbd..7cb8c27b 100644
--- a/src/commands/parties/delete.test.ts
+++ b/src/commands/parties/delete.test.ts
@@ -1,39 +1,31 @@
-import { MessageFlags } from 'discord.js';
+import { MessageFlags, PermissionFlagsBits } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import {
+  answered,
+  asV2,
   fakeButton,
   fakeChatInput,
-  fakeModal,
   sent,
   type FakeInteraction,
 } from '../../../test/support/fake-interactions.js';
-import { REMOTE_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
-import { ALICE, BOB, CAROL } from '../../../test/support/parties.js';
+import {
+  OTHER_GUILD_ID,
+  REMOTE_CHANNEL,
+  WEST_CHANNEL,
+  WEST_FORUM,
+} from '../../../test/support/gyms.js';
+import { missingPermissions } from '../../../test/support/fake-gateway.js';
+import { ALICE, BOB } from '../../../test/support/parties.js';
 import { gatewayWithMirrorChannels, reportedRaid } from '../../../test/support/party-service.js';
 import { TEST_ENV } from '../../../test/support/test-env.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { partyButtons } from '../../components/party.js';
-import { decodeCustomId } from '../../discord/custom-id.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { PartyStatus } from '../../domain/party/status.js';
-import {
-  DELETE_REASON_INPUT,
-  deletionForm,
-  MAX_DELETE_REASON,
-} from '../../render/party-controls.js';
-import { deleteParty } from './delete.js';
+import { closeControls, deleteParty } from './delete.js';
 import { accentOf, buttonsOf, header, textOf } from '../../../test/support/messages.js';
 
 const yveltal = { boss: { key: 'yveltal' } } as const;
-const ADMIN_ROLE = '800000000000000001';
-const MODERATOR_ROLE = '800000000000000002';
-const guildRoleNames = {
-  [ADMIN_ROLE]: 'Admin',
-  [MODERATOR_ROLE]: 'moderator',
-  '800000000000000003': 'Valor',
-};
-/** The zero-width space `plain()` puts where text would otherwise read as a mention. */
-const ZW = String.fromCharCode(0x200b);
 
 async function setup() {
   const made = await reportedRaid(yveltal, {}, { gateway: gatewayWithMirrorChannels() });
@@ -43,8 +35,8 @@ async function setup() {
     parties: made.store,
     regions: made.regions,
   });
-  const router = new InteractionRouter(ctx, [deleteParty], [partyButtons]);
-  const handle = async (interaction: FakeInteraction) => {
+  const router = new InteractionRouter(ctx, [deleteParty], [partyButtons, closeControls]);
+  const handle = async <I extends FakeInteraction>(interaction: I) => {
     await router.handle(interaction as never);
     return interaction;
   };
@@ -52,29 +44,66 @@ async function setup() {
   /** `/delete` in the raid's post, by Alice with these roles. */
   const run = (roleNames: string[] = [], extra: object = {}) =>
     handle(fakeChatInput({ commandName: 'delete', userId: ALICE, roleNames, ...inPost, ...extra }));
-  /** The form of `/delete`, sent from the raid's post by Alice with this reason. */
-  const submit = (reason: string, extra: object = {}) =>
+  /** The answer to the question of `/delete`: Archive post or Delete post. */
+  const press = (removal: string, roleNames = ['Moderator'], extra: object = {}) =>
     handle(
-      fakeModal({
-        customId: deletionForm(made.party).custom_id,
+      fakeButton({
+        customId: `pclose:${made.party.id}:${removal}`,
         userId: ALICE,
-        fields: { [DELETE_REASON_INPUT]: reason },
-        guildRoleNames,
+        roleNames,
+        ephemeralMessage: true,
+        v2Message: true,
         ...inPost,
         ...extra,
       }),
     );
-  /** The requests in the post: the messages that say which roles they may ping. */
-  const requests = () =>
-    made.gateway
-      .messagesIn(made.postId)
-      .map((message) => message.message)
-      .filter((message) => message.mention?.roles !== undefined);
-  return { ...made, ctx, run, submit, handle, requests };
+  /** What a press made of the question: its edit after the acknowledgement, or its update. */
+  const shown = (pressed: FakeInteraction) =>
+    textOf(
+      asV2(
+        pressed.editReply.mock.calls.length > 0
+          ? sent(pressed.editReply, pressed.editReply.mock.calls.length - 1)
+          : sent(pressed.update),
+      ),
+    );
+  return { ...made, ctx, run, press, shown, handle };
 }
 
-describe('/delete from staff', () => {
-  it('closes the raid at once: the post says who did it and is archived and locked', async () => {
+describe('/delete', () => {
+  it('is for staff alone, and hidden from the others by Manage Messages', async () => {
+    expect(deleteParty.data.toJSON().default_member_permissions).toBe(
+      String(PermissionFlagsBits.ManageMessages),
+    );
+    expect(deleteParty.help.category).toBe('admin');
+    const made = await setup();
+    for (const roleNames of [['Valor'], ['Bot Developer']]) {
+      const used = await made.run(roleNames);
+      expect(sent(used.reply)).toEqual({
+        content: 'Only admins and moderators can do that.',
+        flags: MessageFlags.Ephemeral,
+      });
+    }
+    const pressed = await made.press('archive', ['Valor']);
+    expect(sent(pressed.reply).content).toBe('Only admins and moderators can do that.');
+    expect(made.store.get(made.party.id)).toBeDefined();
+  });
+
+  it('asks staff privately whether to archive the post or delete it, and changes nothing yet', async () => {
+    for (const who of [{ roleNames: ['ADMIN'] }, { userId: TEST_ENV.OWNER_ID }]) {
+      const made = await setup();
+      const used = await made.run(who.roleNames ?? [], who.userId ? { userId: who.userId } : {});
+      const question = asV2(answered(used));
+      expect((answered(used).flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
+      expect(textOf(question)).toContain('Close this raid?');
+      expect(buttonsOf(question).map(({ label, customId }) => [label, customId])).toEqual([
+        ['Archive post', `pclose:${made.party.id}:archive`],
+        ['Delete post', `pclose:${made.party.id}:delete`],
+      ]);
+      expect(made.store.get(made.party.id)).toBeDefined();
+    }
+  });
+
+  it('archives: the post says who closed it, and is archived and locked', async () => {
     const made = await setup();
     const { gateway, store, postId } = made;
     await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
@@ -82,10 +111,8 @@ describe('/delete from staff', () => {
     await made.service.flush();
     expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
 
-    const used = await made.run(['Moderator']);
-    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
-    expect(used.showModal).not.toHaveBeenCalled();
-    expect(sent(used.editReply).content).toBe(
+    const pressed = await made.press('archive');
+    expect(made.shown(pressed)).toBe(
       'This raid is closed: its gym is free for a new report, and I am archiving and locking its post.',
     );
     expect(store.get(made.party.id)).toBeUndefined();
@@ -93,59 +120,66 @@ describe('/delete from staff', () => {
     expect(made.history.records).toEqual([
       expect.objectContaining({ partyId: made.party.id, ending: 'cancelled' }),
     ]);
-    expect(made.storage.rows.has(made.party.id)).toBe(false);
     expect(made.said().at(-1)).toBe(`This raid was closed by **Member** (<@${ALICE}>).`);
     const post = gateway.posts.get(postId);
     expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
     expect(buttonsOf(post?.message)).toEqual([]);
+    expect(header(post?.message)[1]).toBe(`This raid was closed by **Member** (<@${ALICE}>).`);
+    expect(accentOf(post?.message)).toBe(0xe74c3c);
     expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
     expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
     expect(gateway.calls.at(-1)).toBe(`archivePost ${postId}`);
   });
 
-  it('does not say of a kept raid it closed that the post is kept open', async () => {
+  it('deletes: the post goes with everything in it, and the copies and link line with it', async () => {
     const made = await setup();
-    await made.service.keep(made.party.id, true, { id: ALICE });
+    const { gateway, postId } = made;
     await made.service.flush();
-    const kept = textOf(made.gateway.posts.get(made.postId)?.message);
-    expect(kept).toContain('Kept open by a moderator');
-    await made.run(['Moderator']);
-    const closed = textOf(made.gateway.posts.get(made.postId)?.message);
-    expect(closed).toContain('This raid was closed by');
-    expect(closed).not.toContain('Kept open');
+    const pressed = await made.press('delete');
+    expect(made.shown(pressed)).toBe(
+      'This raid is closed: its gym is free for a new report, and I am deleting its post.',
+    );
+    expect(made.store.get(made.party.id)).toBeUndefined();
+    expect(gateway.deletedPosts).toEqual([postId]);
+    expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(made.history.records).toEqual([
+      expect.objectContaining({ partyId: made.party.id, ending: 'cancelled' }),
+    ]);
   });
 
-  it('shows in the archived post itself that the raid was closed', async () => {
+  it('refuses to delete where the bot may not, before anything ends', async () => {
     const made = await setup();
-    await made.run(['Moderator']);
-    const post = made.gateway.posts.get(made.postId);
-    // In the place of the times: a closed raid neither hatches nor ends "in 20 minutes".
-    expect(header(post?.message)[1]).toBe(`This raid was closed by **Member** (<@${ALICE}>).`);
-    expect(textOf(post?.message)).not.toContain('No time has been set');
-    expect(accentOf(post?.message)).toBe(0xe74c3c);
-    const tags = made.tags[WEST_FORUM];
-    expect([...(post?.tagIds ?? [])].sort()).toEqual([tags.Ended, tags.T5].sort());
+    made.gateway.noManaging.add(WEST_FORUM);
+    const pressed = await made.press('delete');
+    expect(made.shown(pressed)).toBe(
+      `I can't delete posts in <#${WEST_FORUM}> (Manage Threads is missing there). Archive it, or ` +
+        'delete it yourself.',
+    );
+    expect(made.store.get(made.party.id)).toBeDefined();
+    expect(made.gateway.deletedPosts).toEqual([]);
   });
 
   it('answers the moderator before anything is done to the post', async () => {
     const made = await setup();
-    const interaction = fakeChatInput({
-      commandName: 'delete',
+    const pressed = fakeButton({
+      customId: `pclose:${made.party.id}:archive`,
       userId: ALICE,
       roleNames: ['Admin'],
+      ephemeralMessage: true,
+      v2Message: true,
       channelId: made.postId,
       thread: { parentId: WEST_FORUM },
     });
     let callsWhenAnswered = -1;
     let activeWhenAnswered = true;
     const before = made.gateway.calls.length;
-    interaction.editReply.mockImplementation(() => {
+    pressed.editReply.mockImplementation(() => {
       callsWhenAnswered = made.gateway.calls.length - before;
       activeWhenAnswered = made.store.get(made.party.id) !== undefined;
       return Promise.resolve();
     });
-    await made.handle(interaction);
-    expect(interaction.editReply).toHaveBeenCalledTimes(1);
+    await made.handle(pressed);
+    expect(pressed.editReply).toHaveBeenCalledTimes(1);
     // The party had left the store, and Discord had not been asked for anything yet.
     expect(activeWhenAnswered).toBe(false);
     expect(callsWhenAnswered).toBe(0);
@@ -154,35 +188,58 @@ describe('/delete from staff', () => {
 
   it('closes the raid although the answer cannot be given', async () => {
     const made = await setup();
-    const interaction = fakeChatInput({
-      commandName: 'delete',
+    const pressed = fakeButton({
+      customId: `pclose:${made.party.id}:archive`,
       userId: ALICE,
       roleNames: ['Admin'],
-      channelId: made.postId,
-      thread: { parentId: WEST_FORUM },
+      ephemeralMessage: true,
+      v2Message: true,
     });
-    interaction.editReply.mockImplementation(() =>
-      Promise.reject(new Error('Unknown interaction')),
-    );
-    await made.handle(interaction);
+    pressed.editReply.mockImplementation(() => Promise.reject(new Error('Unknown interaction')));
+    await made.handle(pressed);
     expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
   });
 
-  it('is for admins, moderators and the owner of the bot, not for bot developers', async () => {
-    for (const who of [{ roleNames: ['ADMIN'] }, { userId: TEST_ENV.OWNER_ID }]) {
-      const made = await setup();
-      const used = await made.run(who.roleNames ?? [], who.userId ? { userId: who.userId } : {});
-      expect(used.showModal).not.toHaveBeenCalled();
-      expect(made.store.get(made.party.id)).toBeUndefined();
-    }
+  it('takes no press for a party of another server', async () => {
     const made = await setup();
-    const developer = await made.run(['Bot Developer']);
-    expect(developer.showModal).toHaveBeenCalled();
+    const pressed = await made.press('delete', ['Moderator'], { guildId: OTHER_GUILD_ID });
+    expect(sent(pressed.reply).content).toBe('This control is no longer active.');
     expect(made.store.get(made.party.id)).toBeDefined();
+    expect(made.gateway.deletedPosts).toEqual([]);
+  });
+
+  it('says that the post was archived where Discord refused to delete it', async () => {
+    const made = await setup();
+    made.gateway.failing.set('deletePost', missingPermissions('MANAGE_THREADS'));
+    expect(made.shown(await made.press('delete'))).toBe(
+      'This raid is closed: its gym is free for a new report, and its post is archived: ' +
+        'Discord refused to delete it; delete it yourself.',
+    );
+    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true });
+  });
+
+  it('deletes the post of a raid that ended a moment before, when Delete post was chosen', async () => {
+    const made = await setup();
+    const endAs = made.service.endAs.bind(made.service);
+    // The raid ends between the press and the closing.
+    made.service.endAs = async (...args) => {
+      await endAs(made.party.id);
+      return endAs(...args);
+    };
+    expect(made.shown(await made.press('delete'))).toBe(
+      'This raid was over already; I deleted its post.',
+    );
+    expect(made.gateway.deletedPosts).toEqual([made.postId]);
   });
 
-  it('has no limit: a moderator tidying up closes as many raids as there are', async () => {
+  it('has no limit on the command; its question takes twenty presses a minute', async () => {
     expect(deleteParty.throttle).toBeUndefined();
+    const made = await setup();
+    for (let i = 0; i < 20; i++) await made.press('archive');
+    expect(sent((await made.press('archive')).reply).content).toMatch(/^That was a lot of clicks/);
+  });
+
+  it('closes as many raids as there are, one after the other', async () => {
     const made = await setup();
     for (const gymId of [2, 3]) {
       const gym = made.ctx.gyms.get(gymId);
@@ -196,15 +253,24 @@ describe('/delete from staff', () => {
         boss: null,
       });
       if (outcome.kind !== 'created') throw new Error(outcome.kind);
-      const used = await made.run(['Moderator'], { channelId: outcome.party.forumPostId });
-      expect(sent(used.editReply).content).toMatch(/^This raid is closed/);
+      await made.run(['Moderator'], { channelId: outcome.party.forumPostId });
+      const pressed = await made.handle(
+        fakeButton({
+          customId: `pclose:${outcome.party.id}:archive`,
+          userId: ALICE,
+          roleNames: ['Moderator'],
+          ephemeralMessage: true,
+          v2Message: true,
+        }),
+      );
+      expect(made.shown(pressed)).toMatch(/^This raid is closed/);
       expect(made.store.get(outcome.party.id)).toBeUndefined();
     }
   });
 
   it('frees the gym for a new report', async () => {
     const made = await setup();
-    await made.run(['Admin']);
+    await made.press('archive', ['Admin']);
     const gym = made.ctx.gyms.get(1);
     if (!gym) throw new Error('no gym 1');
     const again = await made.service.reportRaid({
@@ -218,167 +284,22 @@ describe('/delete from staff', () => {
     expect(again.kind).toBe('created');
   });
 
-  it('says that the raid is over when somebody else closed it a moment before', async () => {
-    const made = await setup();
-    const end = made.service.end.bind(made.service);
-    // The raid ends between the guard and the closing.
-    made.service.end = async (...args) => {
-      await end(made.party.id);
-      return end(...args);
-    };
-    const used = await made.run(['Moderator']);
-    expect(used.editReply).not.toHaveBeenCalled();
-    expect(used.followUp).toHaveBeenCalledWith({
-      content: 'This raid is over.',
-      flags: MessageFlags.Ephemeral,
-    });
-  });
-});
-
-describe('/delete from anybody else', () => {
-  it('opens a form for the reason and changes nothing', async () => {
-    const made = await setup();
-    const used = await made.run(['Valor']);
-    expect(used.deferReply).not.toHaveBeenCalled();
-    const form = used.showModal.mock.calls[0]?.[0] as ReturnType<typeof deletionForm>;
-    expect(decodeCustomId(form.custom_id)).toMatchObject({
-      kind: 'party',
-      id: made.party.id,
-      action: 'delete',
-    });
-    expect(made.store.get(made.party.id)).toBeDefined();
-    expect(made.gateway.messagesIn(made.postId)).toEqual([]);
-  });
-
-  it('puts the reason into the post and pings the admin and moderator roles', async () => {
-    const made = await setup();
-    const sentForm = await made.submit('  Reported by mistake, the gym has no raid  ');
-    expect(sentForm.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
-    expect(sent(sentForm.editReply).content).toBe(
-      'I have put your request into the post, for the moderators.',
-    );
-    expect(made.requests()).toEqual([
-      {
-        content:
-          `<@&${ADMIN_ROLE}> <@&${MODERATOR_ROLE}>: **Member** (<@${ALICE}>) asks for this raid to be deleted.\n` +
-          '> Reported by mistake, the gym has no raid',
-        mention: { roles: [ADMIN_ROLE, MODERATOR_ROLE] },
-      },
-    ]);
-    expect(made.store.get(made.party.id)).toBeDefined();
-  });
-
-  it('takes one request per member, and pings the roles only for the first of a raid', async () => {
+  it('says that the raid is over when somebody else closed it first', async () => {
     const made = await setup();
-    await made.submit('A duplicate');
-    const again = await made.submit('Really, a duplicate');
-    expect(sent(again.editReply).content).toBe(
-      'You have already asked the moderators to delete this raid.',
-    );
-    expect(made.requests()).toHaveLength(1);
-
-    const carol = await made.submit('I think so too', { userId: CAROL });
-    expect(sent(carol.editReply).content).toBe(
-      'I have put your request into the post, for the moderators.',
-    );
-    expect(made.requests().at(-1)).toEqual({
-      content: `**Member** (<@${CAROL}>) asks for this raid to be deleted.\n> I think so too`,
-      mention: { roles: [] },
-    });
-  });
-
-  it('lets a member ask again whose request could not be put into the post', async () => {
-    const made = await setup();
-    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
-    await made.submit('A duplicate');
-    made.gateway.failing.clear();
-    const again = await made.submit('A duplicate');
-    expect(sent(again.editReply).content).toBe(
-      'I have put your request into the post, for the moderators.',
-    );
-    expect(made.requests()).toHaveLength(1);
-    expect(made.requests()[0]?.mention).toEqual({ roles: [ADMIN_ROLE, MODERATOR_ROLE] });
-  });
-
-  it('takes the form only from the post of that raid', async () => {
-    const made = await setup();
-    const elsewhere = await made.submit('From the region channel', {
-      channelId: WEST_CHANNEL,
-      thread: undefined,
-    });
-    expect(sent(elsewhere.reply).content).toBe('This control is no longer active.');
-    expect(elsewhere.deferReply).not.toHaveBeenCalled();
-    expect(made.requests()).toEqual([]);
-  });
-
-  it('puts the request into the post also when the server has no such role', async () => {
-    const made = await setup();
-    await made.submit('A duplicate', { guildRoleNames: {} });
-    expect(made.requests()).toEqual([
-      {
-        content: `**Member** (<@${ALICE}>) asks for this raid to be deleted.\n> A duplicate`,
-        mention: { roles: [] },
-      },
-    ]);
-  });
-
-  it('shows the reason as text, on one line, and pings no member with it', async () => {
-    const made = await setup();
-    await made.submit(`@everyone <@&${ADMIN_ROLE}>\nThis raid was closed by <@1>. **now**`, {
-      guildRoleNames: {},
-    });
-    expect(made.requests()).toEqual([
-      {
-        content:
-          `**Member** (<@${ALICE}>) asks for this raid to be deleted.\n` +
-          `> @${ZW}everyone <${ZW}@&${ADMIN_ROLE}> This raid was closed by <${ZW}@1>. \\*\\*now\\*\\*`,
-        mention: { roles: [] },
-      },
-    ]);
-  });
-
-  it('refuses an empty reason, and a form for a raid that has ended', async () => {
-    const made = await setup();
-    const empty = await made.submit('   ');
-    expect(sent(empty.reply).content).toBe('Say why the raid should be deleted.');
     await made.service.end(made.party.id);
-    const late = await made.submit('Too late');
-    expect(sent(late.reply).content).toBe('This control is no longer active.');
-    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
-  });
-
-  it('has no button: a control with that action is no longer active', async () => {
-    const made = await setup();
-    const click = await made.handle(
-      fakeButton({ customId: `party:${made.party.id}:delete`, userId: ALICE }),
-    );
-    expect(sent(click.reply).content).toBe('This control is no longer active.');
-  });
-
-  it('forgets who asked once the raid has ended', async () => {
-    const made = await setup();
-    await made.submit('A duplicate');
-    expect(made.service.deletionRequestsTracked).toBe(1);
-    await made.service.end(made.party.id);
-    expect(made.service.deletionRequestsTracked).toBe(0);
-    expect(await made.service.requestDeletion(made.party.id, { id: ALICE }, 'again', [])).toBe(
-      'gone',
-    );
-  });
-
-  it('forgets who asked once the raid has ended because its post is gone', async () => {
-    const made = await setup();
-    await made.submit('A duplicate');
-    expect(made.service.deletionRequestsTracked).toBe(1);
-    made.gateway.gone.add(made.postId);
-    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
-    await made.service.flush();
-    expect(made.store.get(made.party.id)).toBeUndefined();
-    expect(made.service.deletionRequestsTracked).toBe(0);
+    expect(made.shown(await made.press('archive'))).toBe('This has ended.');
+    const made2 = await setup();
+    const endAs = made2.service.endAs.bind(made2.service);
+    // The raid ends between the press and the closing.
+    made2.service.endAs = async (...args) => {
+      await endAs(made2.party.id);
+      return endAs(...args);
+    };
+    expect(made2.shown(await made2.press('archive'))).toBe('This raid is over.');
   });
 });
 
-describe('requests to delete a raid: what can go wrong on the way', () => {
+describe('requests to delete a raid in its post (reports without a moderators’ channel)', () => {
   /** Makes the next `sendMessage` into the post fail, once. */
   function failNextSend(made: Awaited<ReturnType<typeof setup>>): void {
     const send = made.gateway.sendMessage.bind(made.gateway);
@@ -391,9 +312,17 @@ describe('requests to delete a raid: what can go wrong on the way', () => {
       return send(channelId, message);
     };
   }
-  const pinging = (made: Awaited<ReturnType<typeof setup>>) =>
-    made.requests().filter((message) => (message.mention?.roles?.length ?? 0) > 0);
+  const ADMIN_ROLE = '800000000000000001';
+  const MODERATOR_ROLE = '800000000000000002';
   const roles = [ADMIN_ROLE, MODERATOR_ROLE];
+  /** The requests in the post: the messages that say which roles they may ping. */
+  const requests = (made: Awaited<ReturnType<typeof setup>>) =>
+    made.gateway
+      .messagesIn(made.postId)
+      .map((message) => message.message)
+      .filter((message) => message.mention?.roles !== undefined);
+  const pinging = (made: Awaited<ReturnType<typeof setup>>) =>
+    requests(made).filter((message) => (message.mention?.roles?.length ?? 0) > 0);
 
   it('pings the roles with the next request when the first could not be sent', async () => {
     const made = await setup();
@@ -405,7 +334,7 @@ describe('requests to delete a raid: what can go wrong on the way', () => {
       'asked',
     );
     expect(pinging(made)).toHaveLength(1);
-    expect(made.requests()[0]?.content).toContain(`<@${BOB}>`);
+    expect(requests(made)[0]?.content).toContain(`<@${BOB}>`);
   });
 
   it('pings the roles with the second of two requests at once when the first fails', async () => {
@@ -417,7 +346,7 @@ describe('requests to delete a raid: what can go wrong on the way', () => {
     ]);
     expect(outcomes.map((outcome) => outcome.status)).toEqual(['rejected', 'fulfilled']);
     expect(pinging(made)).toHaveLength(1);
-    expect(made.requests()).toHaveLength(1);
+    expect(requests(made)).toHaveLength(1);
   });
 
   it('puts exactly one message with roles into the post for two requests at once', async () => {
@@ -427,7 +356,7 @@ describe('requests to delete a raid: what can go wrong on the way', () => {
       made.service.requestDeletion(made.party.id, { id: BOB }, 'two', roles),
     ]);
     expect(outcomes).toEqual(['asked', 'asked']);
-    expect(made.requests()).toHaveLength(2);
+    expect(requests(made)).toHaveLength(2);
     expect(pinging(made)).toHaveLength(1);
   });
 
@@ -440,8 +369,8 @@ describe('requests to delete a raid: what can go wrong on the way', () => {
     ]);
     expect(outcomes.map((outcome) => outcome.status)).toEqual(['rejected', 'fulfilled']);
     expect(outcomes[1]).toEqual({ status: 'fulfilled', value: 'asked' });
-    expect(made.requests()).toHaveLength(1);
-    expect(made.requests()[0]?.content).toContain('one again');
+    expect(requests(made)).toHaveLength(1);
+    expect(requests(made)[0]?.content).toContain('one again');
   });
 
   it('says that a request is gone when the raid ended while it waited', async () => {
@@ -453,19 +382,22 @@ describe('requests to delete a raid: what can go wrong on the way', () => {
     expect(await second).toBe('gone');
     expect(made.service.deletionRequestsTracked).toBe(0);
   });
-});
 
-describe('deletionForm', () => {
-  it('stays within what Discord allows for a form', () => {
-    const form = deletionForm({ id: '00000000-0000-4000-8000-000000000001', type: 'raid' });
-    expect(form.title.length).toBeLessThanOrEqual(45);
-    expect(form.custom_id.length).toBeLessThanOrEqual(100);
-    const rows = form.components as unknown as {
-      components: { custom_id: string; max_length: number; label: string; placeholder: string }[];
-    }[];
-    const input = rows[0]?.components[0];
-    expect(input).toMatchObject({ custom_id: DELETE_REASON_INPUT, max_length: MAX_DELETE_REASON });
-    expect((input?.label ?? '').length).toBeLessThanOrEqual(45);
-    expect((input?.placeholder ?? '').length).toBeLessThanOrEqual(100);
+  it('forgets who asked once the raid has ended, also because its post is gone', async () => {
+    const made = await setup();
+    await made.service.requestDeletion(made.party.id, { id: ALICE }, 'A duplicate', roles);
+    expect(made.service.deletionRequestsTracked).toBe(1);
+    await made.service.end(made.party.id);
+    expect(made.service.deletionRequestsTracked).toBe(0);
+    expect(await made.service.requestDeletion(made.party.id, { id: ALICE }, 'again', [])).toBe(
+      'gone',
+    );
+    const other = await setup();
+    await other.service.requestDeletion(other.party.id, { id: ALICE }, 'A duplicate', roles);
+    other.gateway.gone.add(other.postId);
+    await other.attendance.signUp(other.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+    await other.service.flush();
+    expect(other.store.get(other.party.id)).toBeUndefined();
+    expect(other.service.deletionRequestsTracked).toBe(0);
   });
 });
diff --git a/src/commands/parties/delete.ts b/src/commands/parties/delete.ts
index eb95b7b7..45ce3c16 100644
--- a/src/commands/parties/delete.ts
+++ b/src/commands/parties/delete.ts
@@ -1,56 +1,147 @@
-import { SlashCommandBuilder } from 'discord.js';
-import type { SimpleCommand } from '../../discord/command.js';
+import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
+import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
-import { isStaff, requireParty } from '../../discord/guards.js';
-import { isRaid, partyWord } from '../../domain/party/party.js';
-import { deletionForm } from '../../render/party-controls.js';
+import { guildIdOf, requireGuild, requireManagement, requireParty } from '../../discord/guards.js';
+import { answer, v2Answer } from '../../discord/late-reply.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
+import type { Throttle } from '../../discord/throttle.js';
+import type { PostRemoval } from '../../domain/moderation/reports.js';
+import { partyWord, type Party } from '../../domain/party/party.js';
+import { APPROVED_ACCENT, EXPIRED_ACCENT, REFUSED_ACCENT } from '../../render/meetup-safety.js';
+import { removalQuestion } from '../../render/moderation.js';
 import { memberText } from '../../render/text.js';
+import { textMessage } from '../../render/v2.js';
 import { actingMember, commandParty, partyOver } from './reply.js';
 
 /**
- * `/delete` (spec 4.2), for every kind of party alike; what follows says "raid".
- * From an admin, a moderator or the bot's owner it ends the raid at once:
- * the post says who closed it and is archived and locked, the copies and the link line go, and
- * the gym is free for a new report. It is the tool for what the clock does not tidy up by itself
- * (a raid reported by mistake, a duplicate, a post in a state nobody foresaw), so it works on any
- * raid that is still active, whatever its state, and as often as staff need it: it has no
- * throttle. From anybody else it opens a form for the reason, which is put into the post for the
- * moderators; nothing else happens, and what limits that is in `PartyService.requestDeletion`.
+ * The custom-id kind of the private question of `/delete` (plan 8S-2): `pclose:<party id>:archive`
+ * and `pclose:<party id>:delete`.
+ */
+export const CLOSE_KIND = 'pclose';
+
+/** How often one member of staff may answer the questions of `/delete`: a clean-up is many. */
+export const CLOSE_THROTTLE: Throttle = { uses: 20, perSeconds: 60 };
+
+/** What a moderator is told of a party they closed, as its post goes. */
+export function closedWords(party: Pick<Party, 'type'>, removal: PostRemoval): string {
+  const post =
+    removal === 'delete' ? 'I am deleting its post.' : 'I am archiving and locking its post.';
+  return party.type === 'raid'
+    ? `This raid is closed: its gym is free for a new report, and ${post}`
+    : `This ${partyWord(party)} is closed: ${post}`;
+}
+
+/** What a moderator is told whose Delete post Discord refused: the post is archived instead. */
+export function refusedDeletion(party: Pick<Party, 'type'>): string {
+  const archived = 'its post is archived: Discord refused to delete it; delete it yourself.';
+  return party.type === 'raid'
+    ? `This raid is closed: its gym is free for a new report, and ${archived}`
+    : `This ${partyWord(party)} is closed, and ${archived}`;
+}
+
+/** What a moderator is told who chose to delete a post the bot may not delete. */
+export function mayNotDelete(forumId: string | null): string {
+  const where = forumId === null ? 'its forum' : `<#${forumId}>`;
+  return (
+    `I can't delete posts in ${where} (Manage Threads is missing there). Archive it, or ` +
+    'delete it yourself.'
+  );
+}
+
+/**
+ * `/delete` (spec 4.2; plan 8S-2: for staff only, Manage Messages): closes the raid, train or
+ * meetup of the post it is used in, after a private question: archive its post (it stays
+ * readable, locked) or delete it with everything in it (the command has no throttle; the
+ * question's buttons `CLOSE_THROTTLE`). The post says who closed it (when it is
+ * kept), the copies and the link line go, and a raid's gym is free for a new report. It is the
+ * tool for what the clock does not tidy up by itself, so it works on any party that is still
+ * active and has no throttle. Members report with `/report`; `/help` tells a member who asks for
+ * `/delete` so.
  */
 export const deleteParty: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('delete')
-    .setDescription('Close this raid, train or meetup (moderators), or ask the moderators to'),
+    .setDescription('Close this raid, train or meetup (moderators)')
+    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
   help: {
-    category: 'raid-crud',
+    category: 'admin',
     details:
-      'Admins and moderators: closes the raid, train or meetup at once; its post is archived and ' +
-      'locked and stays readable. Everybody else: asks why it should be deleted and puts that ' +
-      'into the post for the moderators. What nobody comes to needs no deleting: it goes away ' +
-      'by itself after it ends. Use it in the post of the raid, train or meetup.',
+      'For admins and moderators: closes the raid, train or meetup of the post you use it in. ' +
+      'It asks first whether to archive its post (it stays readable and locked) or to delete ' +
+      'the post with everything written in it. Members tell the moderators with `/report`. ' +
+      'Server Settings › Integrations decide who sees it (Manage Messages by default).',
     examples: ['/delete'],
   },
-  guards: [requireParty],
-  // A form cannot follow an acknowledgement, and closing a raid takes several calls to Discord.
-  defer: (interaction, ctx) => (isStaff(interaction, ctx) ? 'ephemeral' : undefined),
+  guards: [requireParty, requireManagement],
+  defer: 'late',
   async execute(interaction, ctx) {
     const party = commandParty(interaction, ctx);
-    if (!isStaff(interaction, ctx)) {
-      await interaction.showModal(deletionForm(party));
+    await answer(
+      interaction,
+      v2Answer(
+        removalQuestion(`Close this ${partyWord(party)}?`, (removal) =>
+          encodeCustomId({ kind: CLOSE_KIND, id: party.id, action: removal }),
+        ),
+      ),
+    );
+  },
+};
+
+/**
+ * The answers to the question of `/delete` (kind `pclose`), for staff: the party ends as
+ * `/delete` ended it before (`PartyService.end` with who closed it as the post's last words),
+ * its post archived or deleted (`removal`); a deletion the bot may not make is refused before
+ * anything ends. The question is edited to the outcome before anything is done to the post.
+ */
+export const closeControls: ComponentHandler = {
+  kind: CLOSE_KIND,
+  guards: [requireGuild, requireManagement],
+  throttle: CLOSE_THROTTLE,
+  async button(interaction, id, ctx) {
+    const removal = id.action;
+    if (removal !== 'archive' && removal !== 'delete') throw new UserError(STALE_COMPONENT);
+    const party = ctx.parties.get(id.id);
+    const say = (accent: number, text: string) => v2Answer(textMessage(accent, [text]));
+    if (!party) {
+      await interaction.update(say(EXPIRED_ACCENT, partyOver()));
       return;
     }
+    // A custom id can be sent from anywhere: a party of another server is none here.
+    if ((await ctx.guilds.idFor(guildIdOf(interaction))) !== party.guildId) {
+      throw new UserError(STALE_COMPONENT);
+    }
+    if (removal === 'delete' && !ctx.partyService.mayDeletePost(party.id)) {
+      await interaction.update(say(REFUSED_ACCENT, mayNotDelete(party.forumChannelId)));
+      return;
+    }
+    await interaction.deferUpdate();
     const word = partyWord(party);
-    const closed = await ctx.partyService.end(party.id, undefined, {
+    const closed = await ctx.partyService.endAs(party.id, undefined, {
       lastWords: `This ${word} was closed by ${memberText(actingMember(interaction))}.`,
-      // The answer goes out before the post is archived and locked: nothing may follow that.
-      left: () =>
-        interaction.editReply({
-          content: isRaid(party)
-            ? 'This raid is closed: its gym is free for a new report, and I am archiving and ' +
-              'locking its post.'
-            : `This ${word} is closed: I am archiving and locking its post.`,
-        }),
+      removal,
+      // The answer goes out before the post is archived or deleted: nothing may follow that.
+      left: () => interaction.editReply(say(APPROVED_ACCENT, closedWords(party, removal))),
     });
-    if (!closed) throw new UserError(partyOver(party));
+    if (closed === false) {
+      // Over a moment before: Delete post deletes the post all the same.
+      const postId = party.forumPostId;
+      const deleted =
+        removal === 'delete' && postId !== null
+          ? await ctx.partyService.deletePostOf(postId)
+          : undefined;
+      await interaction.editReply(
+        deleted === 'deleted'
+          ? say(APPROVED_ACCENT, `This ${word} was over already; I deleted its post.`)
+          : say(EXPIRED_ACCENT, partyOver(party)),
+      );
+      return;
+    }
+    if (removal === 'delete' && closed === 'archived') {
+      // An answer in a private message of its own, which opens no archived post again.
+      await interaction
+        .editReply(say(REFUSED_ACCENT, refusedDeletion(party)))
+        .catch(() => undefined);
+    }
   },
 };
diff --git a/src/commands/parties/in-meetup.test.ts b/src/commands/parties/in-meetup.test.ts
index 4af8df14..94bebefd 100644
--- a/src/commands/parties/in-meetup.test.ts
+++ b/src/commands/parties/in-meetup.test.ts
@@ -1,5 +1,6 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
+  answered,
   asV2,
   fakeAutocomplete,
   fakeButton,
@@ -22,16 +23,16 @@ import { createdMeetup } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { partyButtons } from '../../components/party.js';
 import type { CommandModule } from '../../discord/command.js';
-import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
+import { InteractionRouter } from '../../discord/router.js';
 import { attendeeOf } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
-import { DELETE_REASON_INPUT, deletionForm } from '../../render/party-controls.js';
 import { admin } from '../admin/index.js';
 import { info, INFO_INPUT, infoControls, infoForm } from '../meetups/info.js';
 import { meetup } from '../meetups/meetup.js';
 import { end } from '../raids/change.js';
 import { done, here, interested, join, leave, local, notHere, remote } from './attendance.js';
-import { deleteParty } from './delete.js';
+import { closeControls, deleteParty } from './delete.js';
+import { partyReportForm, report, REPORT_REASON_INPUT, reportControls } from './report.js';
 import { group } from './group.js';
 import { cancelMeet, meet } from './meet.js';
 import { name } from './name.js';
@@ -56,6 +57,7 @@ const all: CommandModule[] = [
   where,
   shout,
   deleteParty,
+  report,
   name,
   info,
   meetup,
@@ -86,7 +88,12 @@ async function setup() {
     parties: made.store,
     regions: made.regions,
   });
-  const router = new InteractionRouter(ctx, all, [partyButtons, infoControls]);
+  const router = new InteractionRouter(ctx, all, [
+    partyButtons,
+    infoControls,
+    reportControls,
+    closeControls,
+  ]);
   /** Everything a member was told in this test, to look for words that do not belong. */
   const told: string[] = [];
   const handle = async (interaction: FakeInteraction) => {
@@ -641,9 +648,23 @@ describe('the other commands in the post of a meetup', () => {
     ]);
   });
 
-  it('/delete from staff closes the meetup: the post says who did it and is archived', async () => {
+  it('/delete from staff asks first, and Archive post closes the meetup: the post says who did it', async () => {
     const made = await setup();
-    expect(await made.answer('delete', {}, { roleNames: ['Moderator'] })).toBe(
+    const used = await made.run('delete', {}, { roleNames: ['Moderator'] });
+    expect(textOf(asV2(answered(used)))).toContain('Close this meetup?');
+    expect(made.store.get(made.party.id)).toBeDefined();
+    const pressed = await made.handle(
+      fakeButton({
+        customId: `pclose:${made.party.id}:archive`,
+        userId: ALICE,
+        displayName: 'Alice',
+        roleNames: ['Moderator'],
+        ephemeralMessage: true,
+        v2Message: true,
+        ...made.where,
+      }),
+    );
+    expect(textOf(asV2(sent(pressed.editReply)))).toBe(
       'This meetup is closed: I am archiving and locking its post.',
     );
     expect(made.store.get(made.party.id)).toBeUndefined();
@@ -656,33 +677,35 @@ describe('the other commands in the post of a meetup', () => {
     );
   });
 
-  it('/delete from anybody else asks why, and puts the request into the post as a meetup', async () => {
+  it('/report asks what is wrong, and puts it into the post without a moderators’ channel', async () => {
     const made = await setup();
-    const used = await made.run('delete');
-    expect(used.showModal).toHaveBeenCalledWith(deletionForm(made.party));
+    const used = await made.run('report');
+    expect(used.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
     const submit = (reason: string, userId = ALICE) =>
       made.handle(
         fakeModal({
-          customId: deletionForm(made.party).custom_id,
+          customId: partyReportForm(made.party).custom_id,
           userId,
-          fields: { [DELETE_REASON_INPUT]: reason },
+          fields: { [REPORT_REASON_INPUT]: reason },
           guildRoleNames: { [ADMIN_ROLE]: 'Admin' },
           ...made.where,
         }),
       );
-    expect(sent((await submit('   ')).reply).content).toBe('Say why the meetup should be deleted.');
+    expect(sent((await submit('   ')).reply).content).toBe(
+      'Say what is wrong, so that the moderators know what to look at.',
+    );
     expect(sent((await submit('Made twice')).editReply).content).toBe(
-      'I have put your request into the post, for the moderators.',
+      'I have put your report into the post, for the moderators.',
     );
     expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
       content: `<@&${ADMIN_ROLE}>: **Member** (<@${ALICE}>) asks for this meetup to be deleted.\n> Made twice`,
       mention: { roles: [ADMIN_ROLE] },
     });
     expect(sent((await submit('Again')).editReply).content).toBe(
-      'You have already asked the moderators to delete this meetup.',
+      'You have already asked the moderators about this meetup.',
     );
     await made.service.end(made.party.id);
-    expect(sent((await submit('Too late', CAROL)).reply).content).toBe(STALE_COMPONENT);
+    expect(sent((await submit('Too late', CAROL)).reply).content).toBe('This has ended.');
   });
 
   it('/admin save-party keeps the post of a meetup and lets it go again', async () => {
@@ -758,6 +781,15 @@ describe('what a member of a meetup is told', () => {
       );
     }
     await made.run('delete', {}, { roleNames: ['Admin'] });
+    await made.handle(
+      fakeButton({
+        customId: `pclose:${made.party.id}:archive`,
+        userId: ALICE,
+        roleNames: ['Admin'],
+        ephemeralMessage: true,
+        v2Message: true,
+      }),
+    );
     // A form that was still open when the meetup was closed.
     await made.handle(
       fakeModal({
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index 3d74d376..ba6a28c6 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -1,6 +1,7 @@
 import { ComponentType, MessageFlags } from 'discord.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
+  answered,
   asV2,
   fakeAutocomplete,
   fakeButton,
@@ -16,10 +17,10 @@ import { createdTrain } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { partyButtons } from '../../components/party.js';
 import type { CommandModule } from '../../discord/command.js';
-import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
+import { InteractionRouter } from '../../discord/router.js';
 import { attendeeOf } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
-import { DELETE_REASON_INPUT, deletionForm, TIME_INPUT } from '../../render/party-controls.js';
+import { TIME_INPUT } from '../../render/party-controls.js';
 import { trainPanel } from '../../render/train-panel.js';
 import { admin } from '../admin/index.js';
 import { info, infoControls } from '../meetups/info.js';
@@ -31,7 +32,8 @@ import { finish, next, previous, skip } from '../trains/move.js';
 import { route } from '../trains/route.js';
 import { train } from '../trains/train.js';
 import { done, here, interested, join, leave, local, notHere, remote } from './attendance.js';
-import { deleteParty } from './delete.js';
+import { closeControls, deleteParty } from './delete.js';
+import { partyReportForm, report, REPORT_REASON_INPUT, reportControls } from './report.js';
 import { group } from './group.js';
 import { cancelMeet, meet } from './meet.js';
 import { name } from './name.js';
@@ -67,6 +69,7 @@ const all: CommandModule[] = [
   where,
   shout,
   deleteParty,
+  report,
   name,
   info,
   boss,
@@ -117,7 +120,13 @@ async function setup(route: readonly number[] = [4, 1, 7]) {
     parties: made.store,
     regions: made.regions,
   });
-  const router = new InteractionRouter(ctx, all, [partyButtons, infoControls, locationControls]);
+  const router = new InteractionRouter(ctx, all, [
+    partyButtons,
+    infoControls,
+    locationControls,
+    reportControls,
+    closeControls,
+  ]);
   /** Everything a member was told in this test, to look for words that do not belong. */
   const told: string[] = [];
   const handle = async (interaction: FakeInteraction) => {
@@ -624,9 +633,23 @@ describe('the other commands in the post of a train', () => {
     ]);
   });
 
-  it('/delete from staff closes the train: the post says who did it and is archived', async () => {
+  it('/delete from staff asks first, and Archive post closes the train: the post says who did it', async () => {
     const made = await setup();
-    expect(await made.answer('delete', {}, { roleNames: ['Moderator'] })).toBe(
+    const used = await made.run('delete', {}, { roleNames: ['Moderator'] });
+    expect(textOf(asV2(answered(used)))).toContain('Close this train?');
+    expect(made.store.get(made.party.id)).toBeDefined();
+    const pressed = await made.handle(
+      fakeButton({
+        customId: `pclose:${made.party.id}:archive`,
+        userId: ALICE,
+        displayName: 'Alice',
+        roleNames: ['Moderator'],
+        ephemeralMessage: true,
+        v2Message: true,
+        ...made.inPost,
+      }),
+    );
+    expect(textOf(asV2(sent(pressed.editReply)))).toBe(
       'This train is closed: I am archiving and locking its post.',
     );
     expect(made.store.get(made.party.id)).toBeUndefined();
@@ -637,33 +660,35 @@ describe('the other commands in the post of a train', () => {
     expect(buttonsOf(post?.message)).toEqual([]);
   });
 
-  it('/delete from anybody else asks why, and puts the request into the post as a train', async () => {
+  it('/report asks what is wrong, and puts it into the post without a moderators’ channel', async () => {
     const made = await setup();
-    const used = await made.run('delete');
-    expect(used.showModal).toHaveBeenCalledWith(deletionForm(made.party));
+    const used = await made.run('report');
+    expect(used.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
     const submit = (reason: string, userId = ALICE) =>
       made.handle(
         fakeModal({
-          customId: deletionForm(made.party).custom_id,
+          customId: partyReportForm(made.party).custom_id,
           userId,
-          fields: { [DELETE_REASON_INPUT]: reason },
+          fields: { [REPORT_REASON_INPUT]: reason },
           guildRoleNames: { [ADMIN_ROLE]: 'Admin' },
           ...made.inPost,
         }),
       );
-    expect(sent((await submit('   ')).reply).content).toBe('Say why the train should be deleted.');
+    expect(sent((await submit('   ')).reply).content).toBe(
+      'Say what is wrong, so that the moderators know what to look at.',
+    );
     expect(sent((await submit('Made twice')).editReply).content).toBe(
-      'I have put your request into the post, for the moderators.',
+      'I have put your report into the post, for the moderators.',
     );
     expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
       content: `<@&${ADMIN_ROLE}>: **Member** (<@${ALICE}>) asks for this train to be deleted.\n> Made twice`,
       mention: { roles: [ADMIN_ROLE] },
     });
     expect(sent((await submit('Again')).editReply).content).toBe(
-      'You have already asked the moderators to delete this train.',
+      'You have already asked the moderators about this train.',
     );
     await made.service.end(made.party.id);
-    expect(sent((await submit('Too late', CAROL)).reply).content).toBe(STALE_COMPONENT);
+    expect(sent((await submit('Too late', CAROL)).reply).content).toBe('This has ended.');
   });
 
   it('/admin save-party keeps the post of a train and lets it go again', async () => {
@@ -840,6 +865,15 @@ describe('what a member of a train is told', () => {
     await made.click('leave');
     for (const action of panel.slice(0, 3)) await made.click(action);
     await made.run('delete', {}, { roleNames: ['Admin'] });
+    await made.handle(
+      fakeButton({
+        customId: `pclose:${made.party.id}:archive`,
+        userId: ALICE,
+        roleNames: ['Admin'],
+        ephemeralMessage: true,
+        v2Message: true,
+      }),
+    );
     for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'group:A', 'leave']) {
       // The train is closed by now: a control that is still on screen says so, without a kind.
       await made.click(action);
diff --git a/src/commands/parties/report.test.ts b/src/commands/parties/report.test.ts
new file mode 100644
index 00000000..015c5050
--- /dev/null
+++ b/src/commands/parties/report.test.ts
@@ -0,0 +1,179 @@
+import { MessageFlags } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import {
+  fakeChatInput,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+} from '../../../test/support/fake-interactions.js';
+import { OTHER_GUILD_ID, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
+import { LIBRARY } from '../../../test/support/meetup-safety-cases.js';
+import { MOD_CHANNEL, type SafetyOptions } from '../../../test/support/meetup-safety-service.js';
+import { textOf } from '../../../test/support/messages.js';
+import { ALICE, BOB, CAROL, PARTY_NOW } from '../../../test/support/parties.js';
+import { reportsWith } from '../../../test/support/reports-service.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { partyButtons } from '../../components/party.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { MAX_REPORT_REASON } from '../../domain/moderation/reports.js';
+import {
+  partyReportForm,
+  report,
+  REPORT_ALREADY,
+  REPORT_REASON_INPUT,
+  REPORT_SENT,
+  reportControls,
+} from './report.js';
+
+const ADMIN_ROLE = '800000000000000001';
+
+/** A meetup of Alice's, `/report` and its form routed as the bot routes them. */
+async function setup(options: SafetyOptions = {}) {
+  const made = await reportsWith(options);
+  const outcome = await made.service.createMeetup({
+    name: 'Book swap',
+    creatorId: ALICE,
+    creator: { name: 'Alice' },
+    regionChannelId: WEST_CHANNEL,
+    place: LIBRARY,
+    startTime: PARTY_NOW + 24 * 3_600_000,
+    description: 'Bring a book.',
+  });
+  if (outcome.kind !== 'created') throw new Error(outcome.kind);
+  const party = outcome.party;
+  const postId = party.forumPostId ?? '';
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    parties: made.store,
+    regions: made.regions,
+    reports: made.reports,
+    meetupSafety: made.safety,
+  });
+  let now = PARTY_NOW;
+  const router = new InteractionRouter(ctx, [report], [reportControls, partyButtons], {
+    now: () => now,
+  });
+  const handle = async <I extends FakeInteraction>(interaction: I) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const inPost = { channelId: postId, thread: { parentId: WEST_FORUM } };
+  /** The form of a report of the meetup, sent by `userId` with this reason. */
+  const submit = (reason: string, userId = BOB, extra: object = {}) =>
+    handle(
+      fakeModal({
+        customId: partyReportForm(party).custom_id,
+        form: partyReportForm(party),
+        userId,
+        displayName: userId === BOB ? 'Bob' : 'Carol',
+        fields: { [REPORT_REASON_INPUT]: reason },
+        guildRoleNames: { [ADMIN_ROLE]: 'Admin' },
+        ...inPost,
+        ...extra,
+      }),
+    );
+  return {
+    ...made,
+    party,
+    postId,
+    inPost,
+    handle,
+    submit,
+    later: (ms: number) => (now += ms),
+  };
+}
+
+describe('/report', () => {
+  it('opens a form that asks what is wrong, in the post of a party, and changes nothing', async () => {
+    const made = await setup();
+    const used = await made.handle(
+      fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost }),
+    );
+    expect(used.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
+    expect(partyReportForm(made.party).title).toBe('Report this meetup to the moderators');
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
+    const elsewhere = await made.handle(
+      fakeChatInput({ commandName: 'report', userId: BOB, channelId: WEST_CHANNEL }),
+    );
+    expect(sent(elsewhere.reply).content).toBe(
+      'Use this in the post of a raid, train or meetup that is still active.',
+    );
+  });
+
+  it('sends the reason to the moderators privately, and tells the member who reported twice', async () => {
+    const made = await setup();
+    const first = await made.submit('A home address.');
+    expect(first.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(sent(first.editReply).content).toBe(REPORT_SENT);
+    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain('A home address.');
+    expect(made.gateway.messagesIn(made.postId)).toEqual([]);
+    expect(sent((await made.submit('Again.')).editReply).content).toBe(REPORT_ALREADY);
+    expect(sent((await made.submit('Mine.', CAROL)).editReply).content).toBe(REPORT_SENT);
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
+  });
+
+  it('refuses a reason of white space alone, without counting it', async () => {
+    const made = await setup();
+    for (let i = 0; i < 6; i++) {
+      const blank = await made.submit('  \n ');
+      expect(sent(blank.reply).content).toBe(
+        'Say what is wrong, so that the moderators know what to look at.',
+      );
+      expect(blank.deferReply).not.toHaveBeenCalled();
+    }
+    expect(sent((await made.submit('Real.')).editReply).content).toBe(REPORT_SENT);
+  });
+
+  it('takes five reports an hour of a member, the Apps menu’s forms too', async () => {
+    const made = await setup();
+    for (let i = 0; i < 5; i++) await made.submit(`Reason ${String(i)}`);
+    const sixth = await made.submit('Six.');
+    expect(sent(sixth.reply).content).toMatch(/^You can use \/report again in /);
+    made.later(3_600_000);
+    expect((await made.submit('Seven.')).editReply).toHaveBeenCalled();
+  });
+
+  it('takes no form for a party of another server, nor one that has ended', async () => {
+    const made = await setup();
+    const foreign = await made.submit('Elsewhere.', BOB, { guildId: OTHER_GUILD_ID });
+    expect(sent(foreign.reply).content).toBe('This control is no longer active.');
+    await made.service.end(made.party.id);
+    const late = await made.submit('Too late.');
+    expect(sent(late.reply).content).toBe('This has ended.');
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
+  });
+
+  it('puts the report into the post without a moderators’ channel, as a member’s /delete did', async () => {
+    const made = await setup({ moderation: null });
+    const first = await made.submit('Made twice\n**now**');
+    expect(sent(first.editReply).content).toBe(
+      'I have put your report into the post, for the moderators.',
+    );
+    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
+      content: `<@&${ADMIN_ROLE}>: **Bob** (<@${BOB}>) asks for this meetup to be deleted.\n> Made twice \\*\\*now\\*\\*`,
+      mention: { roles: [ADMIN_ROLE] },
+    });
+    expect(sent((await made.submit('Again.')).editReply).content).toBe(
+      'You have already asked the moderators about this meetup.',
+    );
+    // A long reason is quoted in part: the message keeps within what Discord takes.
+    await made.submit('*'.repeat(MAX_REPORT_REASON), CAROL);
+    const quoted = made.gateway.messagesIn(made.postId).at(-1)?.message.content ?? '';
+    expect(quoted.length).toBeLessThan(2000);
+  });
+
+  it('takes a form of the old /delete, opened before it was for staff alone, as a report', async () => {
+    const made = await setup();
+    const old = await made.handle(
+      fakeModal({
+        customId: `party:${made.party.id}:delete`,
+        userId: BOB,
+        fields: { [REPORT_REASON_INPUT]: 'From an old form.' },
+        ...made.inPost,
+      }),
+    );
+    expect(sent(old.editReply).content).toBe(REPORT_SENT);
+    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain('From an old form.');
+  });
+});
diff --git a/src/commands/parties/report.ts b/src/commands/parties/report.ts
new file mode 100644
index 00000000..fb9e34d3
--- /dev/null
+++ b/src/commands/parties/report.ts
@@ -0,0 +1,188 @@
+import {
+  ComponentType,
+  MessageFlags,
+  SlashCommandBuilder,
+  TextInputStyle,
+  type APIModalInteractionResponseCallbackData,
+  type ModalSubmitInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { ComponentHandler, Guard, SimpleCommand } from '../../discord/command.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
+import { UserError } from '../../discord/errors.js';
+import { guildIdOf, managementRoleIds, requireGuild, requireParty } from '../../discord/guards.js';
+import { memberInfo } from '../../discord/member-info.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
+import type { Throttle } from '../../discord/throttle.js';
+import { MAX_REPORT_REASON } from '../../domain/moderation/reports.js';
+import { partyWord, type Party } from '../../domain/party/party.js';
+import type { ReportOutcome } from '../../services/moderation-reports.js';
+import { commandParty, partyOver } from './reply.js';
+
+/** The name of `/report`, in whose window every report is counted (the Apps menu's too). */
+export const REPORT_COMMAND = 'report';
+
+/** How often a member may report: five an hour (a post in the moderators' channel each). */
+export const REPORT_THROTTLE: Throttle = { uses: 5, perSeconds: 3600 };
+
+/**
+ * The custom-id kind of a report's form (plan 8S-2): `report:<party id>:party` (`/report`, and
+ * the Apps menu on a party's post, a copy or its link line), `report:<token>:message` (the Apps
+ * menu on any other message, the message kept under the token).
+ */
+export const REPORT_FORM_KIND = 'report';
+
+/** The id of the one input of a report's form: why (as the form of the old `/delete` had it). */
+export const REPORT_REASON_INPUT = 'reason';
+
+/** What a member is told whose report reached the moderators (the design's words). */
+export const REPORT_SENT = 'Sent to the moderators.';
+/** What a member is told who reported the same party or message before (the design's words). */
+export const REPORT_ALREADY = 'You already reported this.';
+const REPORT_NOT_SENT = 'I could not send your report to the moderators. Try again later.';
+const NO_REASON = 'Say what is wrong, so that the moderators know what to look at.';
+
+/** The form that asks why, for a party (`what`: `raid`, `train`, `meetup`) or a message. */
+function reasonForm(customId: string, what: string): APIModalInteractionResponseCallbackData {
+  return {
+    custom_id: customId,
+    // A title has at most 45 characters: "Report this meetup to the moderators" has 36.
+    title: `Report this ${what} to the moderators`,
+    components: [
+      {
+        type: ComponentType.ActionRow,
+        components: [
+          {
+            type: ComponentType.TextInput,
+            custom_id: REPORT_REASON_INPUT,
+            label: 'What is wrong?',
+            style: TextInputStyle.Paragraph,
+            required: true,
+            max_length: MAX_REPORT_REASON,
+            placeholder: 'Only the moderators read this.',
+          },
+        ],
+      },
+    ],
+  };
+}
+
+/** The form of a report of a party. */
+export function partyReportForm(
+  party: Pick<Party, 'id' | 'type'>,
+): APIModalInteractionResponseCallbackData {
+  return reasonForm(
+    encodeCustomId({ kind: REPORT_FORM_KIND, id: party.id, action: 'party' }),
+    partyWord(party),
+  );
+}
+
+/** The form of a report of a message, its message kept under `token`. */
+export function messageReportForm(token: string): APIModalInteractionResponseCallbackData {
+  return reasonForm(
+    encodeCustomId({ kind: REPORT_FORM_KIND, id: token, action: 'message' }),
+    'message',
+  );
+}
+
+/**
+ * The answer to a report, or the refusal it is (`UserError`). `word` names the party for an
+ * answer of the old way, without a moderators' channel.
+ */
+export function reportAnswer(outcome: ReportOutcome, word: string): string {
+  switch (outcome.kind) {
+    case 'sent':
+      return REPORT_SENT;
+    case 'already':
+      return REPORT_ALREADY;
+    case 'asked':
+      return 'I have put your report into the post, for the moderators.';
+    case 'asked-before':
+      return `You have already asked the moderators about this ${word}.`;
+    case 'gone':
+      throw new UserError(partyOver());
+    case 'no-reason':
+      throw new UserError(NO_REASON);
+    case 'not-sent':
+      throw new UserError(REPORT_NOT_SENT);
+  }
+}
+
+/** A reason of white space alone is refused before the report counts against the limit. */
+const requireReason: Guard = (interaction) => {
+  if (!interaction.isModalSubmit()) return;
+  if (interaction.fields.getTextInputValue(REPORT_REASON_INPUT).trim() === '') {
+    throw new UserError(NO_REASON);
+  }
+};
+
+/**
+ * A report of a party from its form (`/report`, the Apps menu, and a form of the old `/delete`
+ * opened before it was for staff only): the party by its id, in the presser's server only, the
+ * reason to the moderators (`ModerationReports.reportParty`), the member told privately.
+ */
+export async function submitPartyReport(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  partyId: string,
+): Promise<void> {
+  const party = ctx.parties.get(partyId);
+  const serverId = guildIdOf(interaction);
+  if (!party) throw new UserError(partyOver());
+  // A custom id can be sent from anywhere: a party of another server is none here.
+  if ((await ctx.guilds.idFor(serverId)) !== party.guildId) throw new UserError(STALE_COMPONENT);
+  const reason = interaction.fields.getTextInputValue(REPORT_REASON_INPUT);
+  // Acknowledged first: the report is a message to Discord, which can take its time.
+  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+  const outcome = await ctx.reports.reportParty({
+    serverId,
+    partyId,
+    reporter: { id: interaction.user.id, name: memberInfo(interaction).name },
+    reason,
+    roleIds: managementRoleIds(interaction),
+  });
+  await interaction.editReply({ content: reportAnswer(outcome, partyWord(party)) });
+}
+
+/**
+ * `/report` (plan 8S-2): a member tells the moderators privately what is wrong with the raid,
+ * train or meetup of the post it is used in. It opens a form for the reason; the report goes to
+ * the moderators' channel, where reports of the same party gather on one post, and nothing is
+ * said in the party's post (without that channel, the reason goes into the post and the staff
+ * roles are pinged once, as a member's `/delete` did). Every member may use it, staff and the
+ * party's maker too; it counts on the form's submit, five an hour (`REPORT_THROTTLE`).
+ */
+export const report: SimpleCommand = {
+  data: new SlashCommandBuilder()
+    .setName(REPORT_COMMAND)
+    .setDescription('Tell the moderators privately what is wrong with this raid, train or meetup'),
+  help: {
+    category: 'raid-crud',
+    details:
+      'Use it in the post of the raid, train or meetup. A form asks what is wrong (a meetup at ' +
+      "somebody's home, a duplicate raid, something hurtful); only the moderators read it, and " +
+      'they decide what to do. To report one message, use **Report to moderators** in the Apps ' +
+      'menu of the message. It takes the place of `/delete`, which is for moderators now. What ' +
+      'nobody comes to needs no report: it goes away by itself after it ends.',
+    examples: ['/report'],
+  },
+  guards: [requireParty],
+  async execute(interaction, ctx) {
+    await interaction.showModal(partyReportForm(commandParty(interaction, ctx)));
+  },
+};
+
+/**
+ * The forms of reports (kind `report`): a party's (`report:<party id>:party`). Five an hour,
+ * counted in `/report`'s window whichever way the form was opened (`as`); a reason of white
+ * space alone is refused uncounted.
+ */
+export const reportControls: ComponentHandler = {
+  kind: REPORT_FORM_KIND,
+  guards: [requireGuild, requireReason],
+  throttle: () => ({ ...REPORT_THROTTLE, as: REPORT_COMMAND }),
+  async modal(interaction, id, ctx) {
+    if (id.action === 'party') return submitPartyReport(interaction, ctx, id.id);
+    throw new UserError(STALE_COMPONENT);
+  },
+};
diff --git a/src/commands/util/help.test.ts b/src/commands/util/help.test.ts
index 97ae4d1f..1322dd3c 100644
--- a/src/commands/util/help.test.ts
+++ b/src/commands/util/help.test.ts
@@ -190,6 +190,21 @@ describe('/help', () => {
     );
   });
 
+  it('knows no command by a name every object has', async () => {
+    for (const command of ['constructor', '__proto__', 'valueof']) {
+      await expect(ask({ options: { command } })).rejects.toThrow(
+        `There is no /${command} command.`,
+      );
+    }
+  });
+
+  it('tells a member who looks for /delete to use /report', async () => {
+    await expect(ask({ options: { command: '/delete' } })).rejects.toThrow(
+      'There is no /delete command for members: to tell the moderators about a raid, train or ' +
+        'meetup, use `/report` in its post.',
+    );
+  });
+
   it('tells other members that a staff command does not exist, and explains it to staff', async () => {
     await expect(ask({ options: { command: 'gym' } })).rejects.toThrow('There is no /gym command.');
     await expect(ask({ options: { command: 'gym create' } })).rejects.toThrow(
diff --git a/src/commands/util/help.ts b/src/commands/util/help.ts
index ad6dbba3..883bc813 100644
--- a/src/commands/util/help.ts
+++ b/src/commands/util/help.ts
@@ -73,7 +73,20 @@ function messageCommandNamed(
 }
 
 /** What a member is told of a command they cannot see or that does not exist. */
-const noCommand = (asked: string): UserError => new UserError(`There is no /${asked} command.`);
+const noCommand = (asked: string): UserError =>
+  new UserError(TOLD_INSTEAD.get(asked) ?? `There is no /${asked} command.`);
+
+/**
+ * What a member is told who asks for a command that is no longer theirs (plan 8S-2: `/delete` is
+ * for staff, members use `/report`), without saying that it exists for others.
+ */
+const TOLD_INSTEAD: ReadonlyMap<string, string> = new Map([
+  [
+    'delete',
+    'There is no /delete command for members: to tell the moderators about a raid, train or ' +
+      'meetup, use `/report` in its post.',
+  ],
+]);
 
 /**
  * The page of a command, a subcommand or a group of subcommands (`raid`, `route add`, `admin
diff --git a/src/components/index.ts b/src/components/index.ts
index 40e1cb05..17e9168c 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -1,4 +1,6 @@
 import { cleanupControls } from '../commands/admin/cleanup-legacy.js';
+import { closeControls } from '../commands/parties/delete.js';
+import { reportControls } from '../commands/parties/report.js';
 import { gymControls } from '../commands/gyms/controls.js';
 import { gymViewControls } from '../commands/gyms/view-controls.js';
 import { regionControls } from '../commands/regions/controls.js';
@@ -38,6 +40,8 @@ export const components: readonly ComponentHandler[] = [
   targetRemovalControls,
   targetListControls,
   partyButtons,
+  reportControls,
+  closeControls,
   dmControls,
   roleControls,
   gymControls,
diff --git a/src/components/party.ts b/src/components/party.ts
index 719b170f..08f8a957 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -1,4 +1,3 @@
-import { MessageFlags } from 'discord.js';
 import {
   ACTION_THROTTLE,
   actingMember,
@@ -10,8 +9,8 @@ import {
   type PressAnswerer,
 } from '../commands/parties/reply.js';
 import { changeTime, timesAlready } from '../commands/raids/change.js';
-import { memberInfo } from '../discord/member-info.js';
 import { showScreenshot } from '../commands/screenshots/feedback.js';
+import { submitPartyReport } from '../commands/parties/report.js';
 import {
   openTrainPanel,
   pressAtEnd,
@@ -23,17 +22,11 @@ import { showWholeRoute } from '../commands/trains/route.js';
 import { cancelSplit, openSplit, pickSplit, pressSplit } from '../commands/trains/split.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { UserError } from '../discord/errors.js';
-import { managementRoleIds, notARaid, partyOf, requireGuild } from '../discord/guards.js';
+import { notARaid, requireGuild } from '../discord/guards.js';
 import { STALE_COMPONENT } from '../discord/router.js';
-import { isGroupId, isRaid, partyWord } from '../domain/party/party.js';
+import { isGroupId, isRaid } from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
-import {
-  DELETE_REASON_INPUT,
-  isPartyAction,
-  PARTY_KIND,
-  TIME_INPUT,
-  timeForm,
-} from '../render/party-controls.js';
+import { isPartyAction, PARTY_KIND, TIME_INPUT, timeForm } from '../render/party-controls.js';
 
 /**
  * The controls of a party's post (spec 4.1): its buttons, the two answers under a completion
@@ -179,35 +172,10 @@ export const partyButtons: ComponentHandler = {
 
   /**
    * The "Set time" form: what was typed is the hatch or the end time, as the form asked. The
-   * form of `/delete`: the reason goes into the post, for the moderators.
+   * form of a member's `/delete` opened before it was for staff only (plan 8S-2) is a report.
    */
   async modal(interaction, id, ctx) {
-    if (id.action === 'delete') {
-      // The form opens only in the raid's own post, and its answer belongs there: a custom id
-      // can be sent from anywhere, for any party.
-      const here = partyOf(interaction, ctx);
-      if (here?.id !== id.id) throw new UserError(STALE_COMPONENT);
-      const word = partyWord(here);
-      const reason = interaction.fields.getTextInputValue(DELETE_REASON_INPUT).trim();
-      if (reason === '') throw new UserError(`Say why the ${word} should be deleted.`);
-      // Acknowledged first: the request is a message to Discord, which can take its time.
-      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
-      const roles = managementRoleIds(interaction);
-      const asked = await ctx.partyService.requestDeletion(
-        id.id,
-        { id: interaction.user.id, ...memberInfo(interaction) },
-        reason,
-        roles,
-      );
-      if (asked === 'gone') throw new UserError(partyOver(here));
-      await interaction.editReply({
-        content:
-          asked === 'already'
-            ? `You have already asked the moderators to delete this ${word}.`
-            : 'I have put your request into the post, for the moderators.',
-      });
-      return;
-    }
+    if (id.action === 'delete') return submitPartyReport(interaction, ctx, id.id);
     const [parameter] = id.args;
     if (id.action !== 'time' || (parameter !== 'hatch' && parameter !== 'end')) {
       throw new UserError(STALE_COMPONENT);
diff --git a/src/db/repositories/report-repository.ts b/src/db/repositories/report-repository.ts
index d6bd856b..bdfcb208 100644
--- a/src/db/repositories/report-repository.ts
+++ b/src/db/repositories/report-repository.ts
@@ -186,6 +186,18 @@ export class ReportRepository implements ReportStore {
     return this.readAll(rows);
   }
 
+  async openPartyReports(): Promise<ModerationReport[]> {
+    const rows = await this.db
+      .selectFrom('ModerationReport')
+      .selectAll()
+      .where('kind', '=', 'party')
+      .where('status', '=', 'open')
+      .orderBy('createdAt')
+      .orderBy('id')
+      .execute();
+    return this.readAll(rows);
+  }
+
   async openReports(serverId: string): Promise<ModerationReport[]> {
     const rows = await this.db
       .selectFrom('ModerationReport')
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 27e235de..a344d2be 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -109,6 +109,13 @@
  * (the server's snowflake), Lift block and Keep block on the moderators' post of an appeal
  * `mappeal:<appeal id>:lift|keep` (its UUID).
  *
+ * Reports to the moderators (plan 8S-2): the form of a report is `report:<party id>:party`
+ * (`/report`, the Apps menu on a party's post) or `report:<token>:message` (the Apps menu on
+ * another message, kept under the token); the buttons of a report's post in the moderators'
+ * channel are `mreport:<report id>:close|refuse|block|delete|dismiss` (its UUID), and the private
+ * question of an action that ends a party `mreport:<report id>:<action>:archive|delete`. The
+ * private question of staff's `/delete` is `pclose:<party id>:archive|delete`.
+ *
  * "Change options…" under an answer of `/counters` is `counters:<token>:options`, and the dialog
  * it opens `counters:<token>:dialog`: the token is that of the answer's options, kept for a day
  * (`keptCounters`, `src/commands/util/counters.ts`).
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index 1e8fa586..55082736 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -171,6 +171,12 @@ export interface PartyGateway {
   openPosts(forumId: string): Promise<string[] | undefined>;
   /** Deletes a post (its thread); one that is already gone is fine. */
   deletePost(postId: string): Promise<void>;
+  /**
+   * Whether the bot may delete a post (Manage Threads in its forum), from the cache: a
+   * moderator's choice to delete one (plan 8S-2) is refused before the party ends where it may
+   * not. A post or a member that is not in the cache counts as allowed: Discord decides.
+   */
+  mayDeletePost(postId: string): boolean;
   /**
    * Deletes a channel, such as a forum made a moment ago; one that is already gone is fine.
    * `reason` is what the server's audit log says of it (who asked for it).
@@ -1116,6 +1122,15 @@ export class DiscordPartyGateway implements PartyGateway {
     await this.done(() => post.delete());
   }
 
+  mayDeletePost(postId: string): boolean {
+    const post = this.client.channels.cache.get(postId);
+    if (!post?.isThread()) return true;
+    const me = post.guild.members.me;
+    return (
+      me === null || (post.permissionsFor(me)?.has(PermissionFlagsBits.ManageThreads) ?? false)
+    );
+  }
+
   async deleteChannel(channelId: string, reason?: string): Promise<void> {
     const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
     if (!channel) return;
diff --git a/src/domain/moderation/reports.ts b/src/domain/moderation/reports.ts
index 27411331..0e981f63 100644
--- a/src/domain/moderation/reports.ts
+++ b/src/domain/moderation/reports.ts
@@ -191,6 +191,8 @@ export interface ReportStore {
   ): Promise<boolean>;
   /** The open reports of a party (one at most, but a stale one may linger), oldest first. */
   openReportsOfParty(partyId: string): Promise<ModerationReport[]>;
+  /** The open reports of parties, of every server, oldest first (the sweep). */
+  openPartyReports(): Promise<ModerationReport[]>;
   /** The open reports of a server, oldest first. */
   openReports(serverId: string): Promise<ModerationReport[]>;
   /** The open reports whose post was never recorded and that were made at `before` or earlier. */
diff --git a/src/render/meetup-post.test.ts b/src/render/meetup-post.test.ts
index c4a47965..14b504e4 100644
--- a/src/render/meetup-post.test.ts
+++ b/src/render/meetup-post.test.ts
@@ -506,6 +506,8 @@ describe('the Where of a meetup post', () => {
         'Near **Fountain Square** (PokéStop) · 20 Market Street, Pinewood',
         '1 trainer',
       ],
+      // The line of where, which a report to the moderators leaves out (plan 8S-2).
+      whereLine: 'Near **Fountain Square** (PokéStop) · 20 Market Street, Pinewood',
       map: 'https://www.google.com/maps/search/?api=1&query=40.0601%2C-80.0601',
     });
     expect(brief(placed(pin(null, 'see https://evil.example')))).toMatchObject({
diff --git a/src/render/meetup-post.ts b/src/render/meetup-post.ts
index da257e25..1aa005b9 100644
--- a/src/render/meetup-post.ts
+++ b/src/render/meetup-post.ts
@@ -236,6 +236,7 @@ function meetupBrief(view: MeetupPostView): PartyBrief {
       ...(place === undefined ? [] : [place.line]),
       trainerCount(party),
     ],
+    ...(place === undefined ? {} : { whereLine: place.line }),
     ...(place?.map === undefined ? {} : { map: place.map }),
   };
 }
diff --git a/src/render/meetup-safety.ts b/src/render/meetup-safety.ts
index d350ef20..8cd5b56f 100644
--- a/src/render/meetup-safety.ts
+++ b/src/render/meetup-safety.ts
@@ -61,14 +61,23 @@ export function decisionsFor(place: Place): RequestDecision[] {
   );
 }
 
-/** A place as the moderators' post shows it: title and address cut, the information never. */
-function placeLine(place: Place): string {
+/**
+ * A place as the moderators' posts show it (a request's, a report's, an ask's): title and address
+ * cut, the information never; a gym's official name beside its nickname when the two differ
+ * (`officialName`, plan 8S-2: "(gym; officially **Frog Fountain**)").
+ */
+export function placeLine(place: Place, officialName?: string | null): string {
   if (place.kind === 'pin') return nearLine(place);
-  return nearLine({
-    ...place,
-    title: truncate(place.title, TITLE_ROOM),
-    address: place.address === null ? null : truncate(place.address, ADDRESS_ROOM),
-  });
+  return nearLine(
+    {
+      ...place,
+      title: truncate(place.title, TITLE_ROOM),
+      address: place.address === null ? null : truncate(place.address, ADDRESS_ROOM),
+    },
+    officialName === undefined || officialName === null || officialName === place.title
+      ? undefined
+      : truncate(officialName, TITLE_ROOM),
+  );
 }
 
 /** Who decided, as a sentence names them. */
diff --git a/src/render/moderation.test.ts b/src/render/moderation.test.ts
new file mode 100644
index 00000000..c228c817
--- /dev/null
+++ b/src/render/moderation.test.ts
@@ -0,0 +1,230 @@
+import { ButtonStyle } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import {
+  LIBRARY,
+  MOD,
+  requestId,
+  SAFETY_NOW,
+  SAFETY_PIN,
+  SAFETY_SERVER,
+} from '../../test/support/meetup-safety-cases.js';
+import { accentOf, buttonsOf, linksOf, textDisplays, textOf } from '../../test/support/messages.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
+import {
+  messageSubject,
+  partySubject,
+  reason,
+  OTHER_REPORTER,
+  REPORTER,
+} from '../../test/support/report-cases.js';
+import {
+  MAX_REPORT_REASON,
+  type ModerationReport,
+  type ReportSubject,
+} from '../domain/moderation/reports.js';
+import { PENDING_ACCENT } from './meetup-safety.js';
+import { removalQuestion, reportMessage } from './moderation.js';
+import { plain, plainLines } from './text.js';
+
+const HOUR = 3_600_000;
+
+function open(subject: ReportSubject = partySubject(), more: Partial<ModerationReport> = {}) {
+  return {
+    id: requestId(201),
+    serverId: SAFETY_SERVER,
+    subject,
+    createdAt: SAFETY_NOW,
+    status: 'open',
+    removal: null,
+    channelId: '600000000000000777',
+    messageId: '600000000000000005',
+    decidedBy: null,
+    decidedByName: null,
+    decidedAt: null,
+    reasons: [reason()],
+    ...more,
+  } satisfies ModerationReport;
+}
+
+const actions = (report: ModerationReport) =>
+  buttonsOf(reportMessage(report)).map(({ label, customId, style }) => [label, customId, style]);
+
+describe('reportMessage of a party', () => {
+  it('shows the meetup, who made it, where, its information and the reasons with reporters', () => {
+    const message = reportMessage(
+      open(partySubject(), {
+        reasons: [
+          reason(REPORTER, { text: 'It is a **home** [x](https://e.vil)' }),
+          reason(OTHER_REPORTER, { at: SAFETY_NOW + HOUR, text: 'Private.' }),
+        ],
+      }),
+    );
+    expect(accentOf(message)).toBe(PENDING_ACCENT);
+    expect(textDisplays(message)[0]).toMatch(/^### Reported meetup\n\*\*Book swap\*\*\n/);
+    const text = textOf(message);
+    expect(text).toContain('Starts <t:1792086400:t>');
+    expect(text).toContain('Created by **Alice** (<@200000000000000002>) in <#100000000000000001>');
+    expect(text).toContain(
+      '**Where**\nNear **Little Free Library** (PokéStop) · 12 Market Street · [Map](<',
+    );
+    expect(text).toContain('**Information**\nBring a book.');
+    expect(text).toContain(
+      '**Reasons** (2)\n' +
+        `**Carol** (<@${REPORTER}>) <t:${String(SAFETY_NOW / 1000)}:R>: ` +
+        `${plain('It is a **home** [x](https://e.vil)')}\n` +
+        `**Dave** (<@${OTHER_REPORTER}>) <t:${String((SAFETY_NOW + HOUR) / 1000)}:R>: Private.`,
+    );
+    expect(actions(open())).toEqual([
+      ['Close…', `mreport:${requestId(201)}:close`, ButtonStyle.Danger],
+      ['Refuse place…', `mreport:${requestId(201)}:refuse`, ButtonStyle.Danger],
+      ['Block maker…', `mreport:${requestId(201)}:block`, ButtonStyle.Danger],
+      ['Dismiss', `mreport:${requestId(201)}:dismiss`, ButtonStyle.Secondary],
+      ['Go to post', undefined, ButtonStyle.Link],
+    ]);
+    expect(linksOf(message)).toEqual([
+      `Go to post https://discord.com/channels/${SAFETY_SERVER}/700000000000000123`,
+    ]);
+  });
+
+  it('offers a raid or train Close… and Dismiss alone, and a meetup at a pin no ruling', () => {
+    const raid = open(
+      partySubject({ partyType: 'raid', title: 'T5 Yveltal at Frog Fountain', information: null }),
+    );
+    expect(actions(raid).map(([label]) => label)).toEqual(['Close…', 'Dismiss', 'Go to post']);
+    expect(textDisplays(reportMessage(raid))[0]).toMatch(/^### Reported raid\n/);
+    expect(textOf(reportMessage(raid))).toContain('Reported by **Alice**');
+    const train = open(partySubject({ partyType: 'train', information: null }));
+    expect(actions(train).map(([label]) => label)).toEqual(['Close…', 'Dismiss', 'Go to post']);
+    const atPin = open(partySubject({ place: SAFETY_PIN }));
+    expect(actions(atPin).map(([label]) => label)).toEqual([
+      'Close…',
+      'Block maker…',
+      'Dismiss',
+      'Go to post',
+    ]);
+  });
+
+  it('names a gym’s official name beside the nickname its post shows', () => {
+    const gym = { ...LIBRARY, kind: 'gym' as const, id: '7', title: 'Plaza Fountain' };
+    const text = textOf(
+      reportMessage(open(partySubject({ place: gym, officialName: 'Frog Fountain' }))),
+    );
+    expect(text).toContain('Near **Plaza Fountain** (gym; officially **Frog Fountain**) ·');
+  });
+
+  it('shows what was decided, by whom and when, without buttons but the way to the post', () => {
+    const decided = (more: Partial<ModerationReport>) =>
+      reportMessage(
+        open(partySubject(), {
+          decidedBy: MOD.id,
+          decidedByName: 'Mod',
+          decidedAt: MOD.at,
+          ...more,
+        }),
+      );
+    const by = `by **Mod** (<@${MOD.id}>) <t:${String(MOD.at / 1000)}:R>`;
+    const closed = decided({ status: 'closed', removal: 'archive' });
+    expect(textOf(closed)).toContain(`**Closed** ${by}: its post is archived.`);
+    expect(buttonsOf(closed).map((button) => button.label)).toEqual(['Go to post']);
+    const deleted = decided({ status: 'closed', removal: 'delete' });
+    expect(textOf(deleted)).toContain(`**Closed** ${by}: its post is deleted.`);
+    expect(buttonsOf(deleted)).toEqual([]);
+    expect(textOf(decided({ status: 'refused', removal: 'archive' }))).toContain(
+      `**Place refused** ${by}: no meetup can be held there from now on. The meetup is closed ` +
+        'and its post archived.',
+    );
+    expect(textOf(decided({ status: 'blocked', removal: 'delete' }))).toContain(
+      `**Maker blocked** ${by} from creating meetups here. The meetup is closed and its post ` +
+        'deleted.',
+    );
+    expect(textOf(decided({ status: 'dismissed' }))).toContain(`**Dismissed** ${by}.`);
+    const ended = reportMessage(open(partySubject(), { status: 'ended' }));
+    expect(textOf(ended)).toContain('**Ended**: the meetup was over before a moderator decided.');
+    expect(buttonsOf(ended).map((button) => button.label)).toEqual(['Go to post']);
+  });
+
+  it('keeps every reason it can within what a message holds, and says how many it left out', () => {
+    const many = Array.from({ length: 12 }, (_, i) =>
+      reason(String(200000000000000100 + i), {
+        reporterName: 'Z'.repeat(32),
+        text: '_'.repeat(MAX_REPORT_REASON),
+        at: SAFETY_NOW + i,
+      }),
+    );
+    const message = reportMessage(
+      open(partySubject({ information: '*'.repeat(1000), title: '_'.repeat(100) }), {
+        reasons: many,
+      }),
+    );
+    expectV2Sendable(message);
+    expect(textOf(message)).toMatch(/…and \d+ more reasons/);
+    expect(textOf(message)).toContain('**Reasons** (12)');
+  });
+});
+
+describe('reportMessage of a message', () => {
+  it('shows who wrote it, where and when, a copy of what it said and its attachments', () => {
+    const message = reportMessage(open(messageSubject({ attachments: ['map.png', 'b*d.gif'] })));
+    expect(textDisplays(message)[0]).toBe(
+      '### Reported message\n' +
+        `Written by **Bob** (<@200000000000000003>) in <#100000000000000001> ` +
+        `<t:${String((SAFETY_NOW - HOUR) / 1000)}:F>`,
+    );
+    const text = textOf(message);
+    expect(text).toContain(`**What it said**\n${plainLines('Zoë 🌲 <b>\nline two')}`);
+    expect(text).toContain('**Attachments**: map.png, b\\*d.gif');
+    expect(actions(open(messageSubject()))).toEqual([
+      ['Delete message', `mreport:${requestId(201)}:delete`, ButtonStyle.Danger],
+      ['Dismiss', `mreport:${requestId(201)}:dismiss`, ButtonStyle.Secondary],
+      ['Go to message', undefined, ButtonStyle.Link],
+    ]);
+    expect(linksOf(message)).toEqual([
+      `Go to message https://discord.com/channels/${SAFETY_SERVER}/100000000000000001/800000000000000001`,
+    ]);
+  });
+
+  it('names the party whose post it is in, and says when there was no text', () => {
+    const text = textOf(
+      reportMessage(open(messageSubject({ partyTitle: 'Book swap', text: '', attachments: [] }))),
+    );
+    expect(text).toContain('in the post of **Book swap**');
+    expect(text).toContain('**What it said**\n(no text)');
+    expect(text).not.toContain('**Attachments**');
+  });
+
+  it('shows a deletion and a message gone first', () => {
+    const by = `by **Mod** (<@${MOD.id}>) <t:${String(MOD.at / 1000)}:R>`;
+    const deleted = reportMessage(
+      open(messageSubject(), {
+        status: 'deleted',
+        decidedBy: MOD.id,
+        decidedByName: 'Mod',
+        decidedAt: MOD.at,
+      }),
+    );
+    expect(textOf(deleted)).toContain(`**Message deleted** ${by}.`);
+    expect(buttonsOf(deleted)).toEqual([]);
+    const gone = reportMessage(
+      open(messageSubject(), {
+        status: 'gone',
+        decidedBy: MOD.id,
+        decidedByName: 'Mod',
+        decidedAt: MOD.at,
+      }),
+    );
+    expect(textOf(gone)).toContain(
+      `**Gone**: the message was deleted before a moderator did (found ${by}).`,
+    );
+  });
+});
+
+describe('removalQuestion', () => {
+  it('asks whether to archive the post or delete it, with a button for each', () => {
+    const message = removalQuestion('Close this meetup?', (removal) => `x:1:${removal}`);
+    expect(textOf(message)).toContain('Close this meetup?');
+    expect(buttonsOf(message).map(({ label, customId }) => [label, customId])).toEqual([
+      ['Archive post', 'x:1:archive'],
+      ['Delete post', 'x:1:delete'],
+    ]);
+  });
+});
diff --git a/src/render/moderation.ts b/src/render/moderation.ts
new file mode 100644
index 00000000..415e5585
--- /dev/null
+++ b/src/render/moderation.ts
@@ -0,0 +1,276 @@
+import {
+  ButtonStyle,
+  ComponentType,
+  type APIButtonComponent,
+  type APIComponentInContainer,
+} from 'discord.js';
+import { encodeCustomId } from '../discord/custom-id.js';
+import type { V2Message } from '../discord/party-gateway.js';
+import type {
+  MessageSubject,
+  ModerationReport,
+  PartySubject,
+  PostRemoval,
+  ReportReason,
+} from '../domain/moderation/reports.js';
+import { partyWord } from '../domain/party/party.js';
+import { APPROVED_ACCENT, EXPIRED_ACCENT, PENDING_ACCENT, placeLine } from './meetup-safety.js';
+import { postLink } from './notify-dm.js';
+import { TEXT_BUDGET } from './party-post.js';
+import { memberText, plain, plainLines, plainNoLinks, timestamp } from './text.js';
+import { actionRow, container, linkButton, textDisplay, textMessage } from './v2.js';
+
+/**
+ * The custom-id kind of the buttons of a report's post (plan 8S-2): `mreport:<report id>:<action>`
+ * (`ReportAction`), and under the private question of an action that ends a party
+ * `mreport:<report id>:<action>:archive|delete`.
+ */
+export const REPORT_KIND = 'mreport';
+
+/**
+ * What a moderator may do on a report's post: end the party (`close`), and for a meetup also
+ * refuse its place for good (`refuse`, a gym or PokéStop only) or block its maker (`block`); delete
+ * a reported message (`delete`); or do nothing (`dismiss`).
+ */
+export type ReportAction = 'close' | 'refuse' | 'block' | 'delete' | 'dismiss';
+
+export const REPORT_ACTIONS: readonly ReportAction[] = [
+  'close',
+  'refuse',
+  'block',
+  'delete',
+  'dismiss',
+];
+
+/** The actions that end a party, and ask first whether to archive its post or delete it. */
+export const ENDING_ACTIONS: readonly ReportAction[] = ['close', 'refuse', 'block'];
+
+const LABELS: Record<ReportAction, string> = {
+  close: 'Close…',
+  refuse: 'Refuse place…',
+  block: 'Block maker…',
+  delete: 'Delete message',
+  dismiss: 'Dismiss',
+};
+
+/** The actions a report's post offers while it is open. */
+export function reportActions(report: Pick<ModerationReport, 'subject'>): ReportAction[] {
+  const { subject } = report;
+  if (subject.kind === 'message') return ['delete', 'dismiss'];
+  if (subject.partyType !== 'meetup') return ['close', 'dismiss'];
+  // A pin has no ruling (8S-1): its place cannot be refused for good.
+  const ruled = subject.place !== null && subject.place.kind !== 'pin';
+  return ruled ? ['close', 'refuse', 'block', 'dismiss'] : ['close', 'block', 'dismiss'];
+}
+
+/** Who decided, in a sentence. */
+function decider(report: ModerationReport): string {
+  const who =
+    report.decidedBy === null
+      ? 'a moderator'
+      : memberText({ id: report.decidedBy, name: report.decidedByName ?? undefined });
+  const when = report.decidedAt === null ? '' : ` ${timestamp(report.decidedAt, 'R')}`;
+  return `${who}${when}`;
+}
+
+const REMOVED: Record<PostRemoval, string> = { archive: 'archived', delete: 'deleted' };
+
+/** What came of a report that is no longer open, as the post's last line. */
+function outcomeLine(report: ModerationReport): string {
+  const by = `by ${decider(report)}`;
+  const post = REMOVED[report.removal ?? 'archive'];
+  const word =
+    report.subject.kind === 'party' ? partyWord({ type: report.subject.partyType }) : 'message';
+  switch (report.status) {
+    case 'closed':
+      return `**Closed** ${by}: its post is ${post}.`;
+    case 'refused':
+      return (
+        `**Place refused** ${by}: no meetup can be held there from now on. The meetup is ` +
+        `closed and its post ${post}.`
+      );
+    case 'blocked':
+      return (
+        `**Maker blocked** ${by} from creating meetups here. The meetup is closed and its ` +
+        `post ${post}.`
+      );
+    case 'dismissed':
+      return `**Dismissed** ${by}.`;
+    case 'ended':
+      return `**Ended**: the ${word} was over before a moderator decided.`;
+    case 'deleted':
+      return `**Message deleted** ${by}.`;
+    case 'gone':
+      return `**Gone**: the message was deleted before a moderator did (found ${by}).`;
+    case 'open':
+      return '';
+  }
+}
+
+/** The edge of a report's post: amber while open, green once acted on, grey otherwise. */
+function accentOf(report: ModerationReport): number {
+  switch (report.status) {
+    case 'open':
+      return PENDING_ACCENT;
+    case 'closed':
+    case 'refused':
+    case 'blocked':
+    case 'deleted':
+      return APPROVED_ACCENT;
+    default:
+      return EXPIRED_ACCENT;
+  }
+}
+
+/** One reason: who gave it, when, and what they said (`plain`, one line). */
+function reasonLine(reason: ReportReason): string {
+  const who = memberText({ id: reason.reporterId, name: reason.reporterName ?? undefined });
+  return `${who} ${timestamp(reason.at, 'R')}: ${plain(reason.text)}`;
+}
+
+/**
+ * The reasons, as many whole ones as fit in `room` (the oldest first), then how many were left
+ * out; the first is cut when even it alone does not fit.
+ */
+function reasonsText(reasons: readonly ReportReason[], room: number): string {
+  const head = `**Reasons** (${String(reasons.length)})`;
+  const lines = reasons.map(reasonLine);
+  let kept = lines.length;
+  const text = (n: number) =>
+    [
+      head,
+      ...lines.slice(0, n),
+      ...(n < lines.length ? [`…and ${String(lines.length - n)} more reasons`] : []),
+    ].join('\n');
+  while (kept > 1 && text(kept).length > room) kept--;
+  const shown = text(kept);
+  return shown.length <= room ? shown : `${shown.slice(0, Math.max(0, room - 1))}…`;
+}
+
+/** The head of a party's report: what it is, its lines, who made it and in which region. */
+function partyHead(subject: PartySubject): string {
+  const maker = memberText({ id: subject.makerId, name: subject.makerName ?? undefined });
+  const madeBy = subject.partyType === 'raid' ? 'Reported by' : 'Created by';
+  const region = subject.regionChannelId === null ? '' : ` in <#${subject.regionChannelId}>`;
+  return [
+    `### Reported ${partyWord({ type: subject.partyType })}`,
+    ...subject.lines,
+    `${madeBy} ${maker}${region}`,
+  ].join('\n');
+}
+
+/** The head of a message's report: who wrote it, where, when, in which party's post. */
+function messageHead(subject: MessageSubject): string {
+  const author = memberText({ id: subject.authorId, name: subject.authorName ?? undefined });
+  const party =
+    subject.partyTitle === null ? '' : `, in the post of **${plain(subject.partyTitle)}**`;
+  return (
+    `### Reported message\nWritten by ${author} in <#${subject.channelId}>${party} ` +
+    timestamp(subject.sentAt, 'F')
+  );
+}
+
+/** The texts of a report's subject besides its head and its reasons. */
+function subjectTexts(subject: PartySubject | MessageSubject): string[] {
+  if (subject.kind === 'message') {
+    const said = subject.text.trim() === '' ? '(no text)' : plainLines(subject.text);
+    const attachments =
+      subject.attachments.length === 0
+        ? []
+        : [`**Attachments**: ${subject.attachments.map(plainNoLinks).join(', ')}`];
+    return [`**What it said**\n${said}`, ...attachments];
+  }
+  return [
+    ...(subject.place === null
+      ? []
+      : [`**Where**\n${placeLine(subject.place, subject.officialName)}`]),
+    ...(subject.information === null
+      ? []
+      : [`**Information**\n${plainLines(subject.information)}`]),
+  ];
+}
+
+/** The address a report leads to: the party's post, or the reported message. */
+function targetLink(report: ModerationReport): APIButtonComponent | undefined {
+  const { subject } = report;
+  if (subject.kind === 'message') {
+    // A message deleted is gone, and so is the way to it.
+    if (report.status === 'deleted' || report.status === 'gone') return undefined;
+    return linkButton(
+      'Go to message',
+      undefined,
+      postLink(report.serverId, subject.channelId, subject.messageId),
+    );
+  }
+  if (subject.postId === null || report.removal === 'delete') return undefined;
+  return linkButton('Go to post', undefined, postLink(report.serverId, subject.postId));
+}
+
+/**
+ * The moderators' post of a report (plan 8S-2): what is reported (a party: what it is and when,
+ * who made it, in which region, where, a meetup's information; a message: who wrote it, where,
+ * when, a copy of its text and the names of its attachments), every reason with its reporter
+ * (`memberText`; the words through `plain`), and while it is open the buttons of
+ * `reportActions`, else what came of it; a link to the post or message while it is there. Text
+ * members wrote goes through `plain` and `plainLines`, names through `plainNoLinks`.
+ */
+export function reportMessage(report: ModerationReport): V2Message {
+  const { subject } = report;
+  const head = subject.kind === 'party' ? partyHead(subject) : messageHead(subject);
+  const texts = [head, ...subjectTexts(subject)];
+  const outcome = report.status === 'open' ? undefined : outcomeLine(report);
+  const used = texts.reduce((sum, text) => sum + text.length, 0) + (outcome?.length ?? 0);
+  const components: APIComponentInContainer[] = [
+    ...texts.map((text) => textDisplay(text)),
+    textDisplay(reasonsText(report.reasons, Math.max(200, TEXT_BUDGET - used))),
+  ];
+  const link = targetLink(report);
+  if (report.status === 'open') {
+    const buttons: APIButtonComponent[] = reportActions(report).map((action) => ({
+      type: ComponentType.Button,
+      style: action === 'dismiss' ? ButtonStyle.Secondary : ButtonStyle.Danger,
+      label: LABELS[action],
+      custom_id: encodeCustomId({ kind: REPORT_KIND, id: report.id, action }),
+    }));
+    components.push(actionRow(link === undefined ? buttons : [...buttons, link]));
+  } else {
+    components.push(textDisplay(outcome ?? ''));
+    if (link !== undefined) components.push(actionRow([link]));
+  }
+  return { v2: true, components: [container(accentOf(report), components)] };
+}
+
+/**
+ * The private question before a party is ended by a moderator (a report's Close…, Refuse place…
+ * and Block maker…, and staff's `/delete`): archive the post, which stays readable, or delete it
+ * with everything in it. `idOf` gives each button's custom id.
+ */
+export function removalQuestion(
+  question: string,
+  idOf: (removal: PostRemoval) => string,
+): V2Message {
+  return textMessage(
+    PENDING_ACCENT,
+    [
+      question,
+      '**Archive post** keeps it readable and locked. **Delete post** removes it with ' +
+        'everything written in it: for what nobody should keep reading, such as a home address.',
+    ],
+    [
+      actionRow([
+        {
+          type: ComponentType.Button,
+          style: ButtonStyle.Primary,
+          label: 'Archive post',
+          custom_id: idOf('archive'),
+        },
+        {
+          type: ComponentType.Button,
+          style: ButtonStyle.Danger,
+          label: 'Delete post',
+          custom_id: idOf('delete'),
+        },
+      ]),
+    ],
+  );
+}
diff --git a/src/render/party-controls.test.ts b/src/render/party-controls.test.ts
index 2f865dfa..016c594d 100644
--- a/src/render/party-controls.test.ts
+++ b/src/render/party-controls.test.ts
@@ -16,7 +16,6 @@ import { setHatchTime } from '../domain/party/raid.js';
 import {
   bottomControls,
   completionQuestion,
-  deletionForm,
   joinGroupButton,
   moveTrainButton,
   statusButton,
@@ -237,23 +236,6 @@ describe('groupWords', () => {
   });
 });
 
-describe('deletionForm', () => {
-  it('names the kind of party it asks about, within the 45 characters of a title', () => {
-    const raid = deletionForm({ id: '00000000-0000-4000-8000-000000000001', type: 'raid' });
-    expect(raid.title).toBe('Ask the moderators to delete this raid');
-    const meetup = deletionForm({ id: '00000000-0000-4000-8000-000000000002', type: 'meetup' });
-    expect(meetup.title).toBe('Ask the moderators to delete this meetup');
-    expect(meetup.title.length).toBeLessThanOrEqual(45);
-    expect(JSON.stringify(meetup)).not.toMatch(/raid/i);
-    expect(decodeCustomId(meetup.custom_id)).toEqual({
-      kind: PARTY_KIND,
-      id: '00000000-0000-4000-8000-000000000002',
-      action: 'delete',
-      args: [],
-    });
-  });
-});
-
 describe('bottomControls', () => {
   /** Label, emoji and action (or address) of every button, row by row. */
   const rows = (party: Party, groups: boolean, emoji: ControlIcons = NO_ICONS) =>
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index f1b97b92..80aedab3 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -10,13 +10,7 @@ import {
 } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
 import type { ControlIconName } from '../domain/pogo/game-icons.js';
-import {
-  isRaid,
-  partyWord,
-  remoteAllowed,
-  type Party,
-  type PartyGroup,
-} from '../domain/party/party.js';
+import { isRaid, remoteAllowed, type Party, type PartyGroup } from '../domain/party/party.js';
 import type { PostButton, PostEmoji } from './party-post.js';
 import { fitItems, plain } from './text.js';
 
@@ -27,7 +21,8 @@ export const PARTY_KIND = 'party';
  * What a control of a post does: the action part of its custom id. `group` carries the group's
  * letter as its argument, `answer` carries `yes` or `no` (the completion question). `time` is
  * the "Set time" button, and the form it opens, which carries `hatch` or `end`. `delete` is the
- * form of `/delete` for members who are not staff; no button has it. `move` is the button
+ * form a member's `/delete` opened before it was for staff only (plan 8S-2), taken as a report
+ * (`/report`'s form is `report:<party id>:party`); no button has it. `move` is the button
  * "Move train…" of a train's post, which opens the panel whose buttons are `next`, `previous`,
  * `skip` and `finish` (`train-panel.ts`). `route` is "Whole route" of a train's post, which
  * shows the route privately. `shot` is "Screenshot feedback" of a raid reported from a
@@ -388,43 +383,6 @@ export function timeForm(
   };
 }
 
-/** The id of the one input of the form that asks why a raid should be deleted. */
-export const DELETE_REASON_INPUT = 'reason';
-/** A reason is quoted in the post, in one message with the pings. */
-export const MAX_DELETE_REASON = 500;
-
-/**
- * The form `/delete` opens for a member who is not staff: why the party should be deleted. What
- * they write is put into the post for the moderators, who decide.
- */
-export function deletionForm(
-  party: Pick<Party, 'id' | 'type'>,
-): APIModalInteractionResponseCallbackData {
-  const word = partyWord(party);
-  return {
-    custom_id: encodeCustomId({ kind: PARTY_KIND, id: party.id, action: 'delete' }),
-    // A title has at most 45 characters.
-    title: `Ask the moderators to delete this ${word}`,
-    components: [
-      {
-        type: ComponentType.ActionRow,
-        components: [
-          {
-            type: ComponentType.TextInput,
-            custom_id: DELETE_REASON_INPUT,
-            label: 'Why should it be deleted?',
-            style: TextInputStyle.Paragraph,
-            required: true,
-            min_length: 3,
-            max_length: MAX_DELETE_REASON,
-            placeholder: `A ${word} nobody comes to is no reason: it goes away by itself.`,
-          },
-        ],
-      },
-    ],
-  };
-}
-
 /** A group's label as text for a sentence: `group B` or `group B (park side)`. */
 export function groupWords(group: { id: string; label?: string }): string {
   return group.label ? `group ${group.id} (${plain(group.label)})` : `group ${group.id}`;
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index 8da9ff49..3d77b65e 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -110,6 +110,11 @@ export interface PartyBrief {
   /** The file `picture` names when it is one of the message (an egg's), which the DM carries. */
   pictureFile?: MessageFile;
   lines: string[];
+  /**
+   * The one of `lines` that says where the party is (a meetup's place, a train's stop), which a
+   * report to the moderators leaves out: its own Where says it with more (plan 8S-2).
+   */
+  whereLine?: string;
   map?: string;
 }
 
diff --git a/src/render/spawn.ts b/src/render/spawn.ts
index 6c18186c..4ce3fafd 100644
--- a/src/render/spawn.ts
+++ b/src/render/spawn.ts
@@ -53,11 +53,16 @@ const NO_PLACE_ADDRESS = '(no address available)';
  * the place's maps link. A pin is `pinLine` (the report's details are its own line):
  * `📍 Near **Fountain Square** (PokéStop) · [Map](<…>)`, `📍 Dropped pin · [Map](<…>)`.
  */
-export function nearLine(place: SpawnPlace): string {
+export function nearLine(place: SpawnPlace, officially?: string): string {
   if (place.kind === 'pin') return pinLine(place, plainNoLinks);
   const address = place.address === null || place.address === '' ? '' : plainNoLinks(place.address);
+  // The moderators' posts (plan 8S-2) name a gym's official name beside the nickname it shows.
+  const kind =
+    officially === undefined
+      ? PLACE_KIND_WORDS[place.kind]
+      : `${PLACE_KIND_WORDS[place.kind]}; officially **${plainNoLinks(officially)}**`;
   return (
-    `Near **${plainNoLinks(place.title)}** (${PLACE_KIND_WORDS[place.kind]}) · ` +
+    `Near **${plainNoLinks(place.title)}** (${kind}) · ` +
     `${address === '' ? NO_PLACE_ADDRESS : address} · ${mapMarkdown(place)}`
   );
 }
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index 99943bf5..dfb1fa90 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -199,6 +199,7 @@ describe('renderTrainPost', () => {
     expect(post.brief).toEqual({
       accent: 0x3498db,
       lines: ['**Raid Train: Saturday legendaries**', 'No route yet', NO_TIME, '1 trainer'],
+      whereLine: 'No route yet',
     });
   });
 
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index b8aca479..85be05a1 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -348,6 +348,7 @@ function trainBrief(view: TrainPostView): PartyBrief {
       view.closed ?? describeTimes(view),
       trainerCount(party),
     ],
+    whereLine: placeLine(view),
   };
 }
 
diff --git a/src/services/moderation-reports.posts.test.ts b/src/services/moderation-reports.posts.test.ts
new file mode 100644
index 00000000..61b0fad0
--- /dev/null
+++ b/src/services/moderation-reports.posts.test.ts
@@ -0,0 +1,150 @@
+import { describe, expect, it } from 'vitest';
+import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import { LIBRARY } from '../../test/support/meetup-safety-cases.js';
+import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
+import { buttonsOf, textOf } from '../../test/support/messages.js';
+import { ALICE, BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
+import { reportsWith } from '../../test/support/reports-service.js';
+import type { OutgoingMessage } from '../discord/party-gateway.js';
+import { partySubject, newReport, reason } from '../../test/support/report-cases.js';
+
+const SERVER = '412345678901234567';
+const DAVE = '200000000000000005';
+
+/** Alice's meetup at the Little Free Library, and a report of it by a member. */
+async function setup() {
+  const made = await reportsWith();
+  const outcome = await made.service.createMeetup({
+    name: 'Book swap',
+    creatorId: ALICE,
+    creator: { name: 'Alice' },
+    regionChannelId: WEST_CHANNEL,
+    place: LIBRARY,
+    startTime: PARTY_NOW + 24 * 3_600_000,
+    description: 'Bring a book.',
+  });
+  if (outcome.kind !== 'created') throw new Error(outcome.kind);
+  const party = outcome.party;
+  const report = (reporterId: string, name: string, text = 'A home.') =>
+    made.reports.reportParty({
+      serverId: SERVER,
+      partyId: party.id,
+      reporter: { id: reporterId, name },
+      reason: text,
+      roleIds: [],
+    });
+  const post = () => made.gateway.messagesIn(MOD_CHANNEL)[0]?.message;
+  /** Holds the gateway's next call of `method` into the moderators' channel until released. */
+  const hold = (method: 'sendMessage' | 'editMessage') => {
+    const original = made.gateway[method].bind(made.gateway) as (
+      ...args: unknown[]
+    ) => Promise<unknown>;
+    let release = (): void => undefined;
+    const released = new Promise<void>((resolve) => {
+      release = resolve;
+    });
+    let reached = (): void => undefined;
+    const isReached = new Promise<void>((resolve) => {
+      reached = resolve;
+    });
+    let held = false;
+    (made.gateway as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => {
+      if (!held && args[0] === MOD_CHANNEL) {
+        held = true;
+        reached();
+        await released;
+      }
+      return original(...args);
+    };
+    return { release, reached: isReached };
+  };
+  return { ...made, party, report, post, hold };
+}
+
+const reasonsShown = (message: OutgoingMessage | undefined) =>
+  /\*\*Reasons\*\* \((\d+)\)/.exec(textOf(message))?.[1];
+
+describe('ModerationReports: the report’s post as it is now', () => {
+  it('shows every reason, whatever order the edits of two reasons arrive in', async () => {
+    const made = await setup();
+    await made.report(BOB, 'Bob');
+    const first = made.hold('editMessage');
+    const carol = made.report(CAROL, 'Carol');
+    await first.reached;
+    const dave = made.report(DAVE, 'Dave');
+    first.release();
+    await Promise.all([carol, dave]);
+    expect(reasonsShown(made.post())).toBe('3');
+  });
+
+  it('shows a report ended while its post was on its way as ended, without buttons', async () => {
+    const made = await setup();
+    const sending = made.hold('sendMessage');
+    const reported = made.report(BOB, 'Bob');
+    await sending.reached;
+    await made.service.end(made.party.id);
+    await made.reports.flush();
+    sending.release();
+    expect((await reported).kind).toBe('sent');
+    await made.reports.flush();
+    expect(textOf(made.post())).toContain('**Ended**');
+    expect(buttonsOf(made.post()).map((button) => button.label)).toEqual(['Go to post']);
+  });
+
+  it('shows the reasons that joined while the post was on its way', async () => {
+    const made = await setup();
+    const sending = made.hold('sendMessage');
+    const bob = made.report(BOB, 'Bob');
+    await sending.reached;
+    await made.report(CAROL, 'Carol');
+    sending.release();
+    await bob;
+    expect(reasonsShown(made.post())).toBe('2');
+  });
+
+  it('names the place once: in Where, with the brief’s line of it left out', async () => {
+    const made = await setup();
+    await made.report(BOB, 'Bob');
+    expect(textOf(made.post()).split('Little Free Library')).toHaveLength(2);
+  });
+});
+
+describe('ModerationReports: the sweep', () => {
+  it('ends the open reports of parties that are over, and forgets reports never posted', async () => {
+    const made = await setup();
+    await made.report(BOB, 'Bob');
+    // The bot stopped before the listener could end the report of a party that ended.
+    const ended = partySubject({ partyId: '00000000-0000-4000-8000-0000000000ee' });
+    await made.reportStore.addReport(newReport(1, ended), reason(CAROL));
+    await made.reportStore.setReportPost(newReport(1).id, MOD_CHANNEL, '600000000000000099');
+    // And before the post of another was sent.
+    const unposted = partySubject({ partyId: '00000000-0000-4000-8000-0000000000ef' });
+    await made.reportStore.addReport(
+      newReport(2, unposted, { createdAt: PARTY_NOW - 10 * 60_000 }),
+      reason(DAVE),
+    );
+    await made.reports.sweep();
+    expect((await made.reportStore.report(newReport(1).id))?.status).toBe('ended');
+    expect(await made.reportStore.report(newReport(2).id)).toBeUndefined();
+    // The report of the meetup still going stays open.
+    expect(
+      [...made.reportStore.reports.values()].filter((one) => one.status === 'open'),
+    ).toHaveLength(1);
+  });
+
+  it('carries the reasons of a report left without its post over to the one opened anew', async () => {
+    const made = await setup();
+    await made.reportStore.addReport(
+      {
+        id: '00000000-0000-4000-8000-000000000099',
+        serverId: SERVER,
+        subject: made.reports.subjectOf(made.party),
+        createdAt: PARTY_NOW - 10 * 60_000,
+      },
+      { reporterId: CAROL, reporterName: 'Carol', text: 'Old.', at: PARTY_NOW - 10 * 60_000 },
+    );
+    expect((await made.report(BOB, 'Bob')).kind).toBe('sent');
+    expect(reasonsShown(made.post())).toBe('2');
+    expect(textOf(made.post())).toContain('Old.');
+  });
+});
diff --git a/src/services/moderation-reports.test.ts b/src/services/moderation-reports.test.ts
new file mode 100644
index 00000000..903c61bd
--- /dev/null
+++ b/src/services/moderation-reports.test.ts
@@ -0,0 +1,194 @@
+import { describe, expect, it } from 'vitest';
+import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
+import { buttonsOf, textOf } from '../../test/support/messages.js';
+import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
+import { gymsFixture } from '../../test/support/providers.js';
+import { reportsWith } from '../../test/support/reports-service.js';
+import type { SafetyOptions } from '../../test/support/meetup-safety-service.js';
+import { MAX_REPORT_REASON } from '../domain/moderation/reports.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { LIBRARY } from '../../test/support/meetup-safety-cases.js';
+
+const SERVER = '412345678901234567';
+
+/** A meetup of Alice's at the Little Free Library, with the reports' services. */
+async function reportedMeetup(options: SafetyOptions = {}) {
+  const made = await reportsWith(options);
+  const outcome = await made.service.createMeetup({
+    name: 'Book swap',
+    creatorId: ALICE,
+    creator: { name: 'Alice' },
+    regionChannelId: WEST_CHANNEL,
+    place: LIBRARY,
+    startTime: PARTY_NOW + 24 * 3_600_000,
+    description: 'Bring a book.',
+  });
+  if (outcome.kind !== 'created') throw new Error(outcome.kind);
+  const party = outcome.party;
+  const postId = party.forumPostId ?? '';
+  const report = (reporterId = BOB, reason = 'It is somebody’s front yard.', name = 'Bob') =>
+    made.reports.reportParty({
+      serverId: SERVER,
+      partyId: party.id,
+      reporter: { id: reporterId, name },
+      reason,
+      roleIds: ['300000000000000001'],
+    });
+  return { ...made, party, postId, report };
+}
+
+describe('ModerationReports: a party reported', () => {
+  it('sends it privately to the moderators’ channel, and says nothing in the post', async () => {
+    const made = await reportedMeetup();
+    const outcome = await made.report();
+    expect(outcome.kind).toBe('sent');
+    const sent = made.gateway.messagesIn(MOD_CHANNEL)[0];
+    const post = sent?.message;
+    expect(textOf(post)).toContain('### Reported meetup');
+    expect(textOf(post)).toContain('Created by **Alice** (<@200000000000000002>)');
+    expect(textOf(post)).toContain(
+      `**Bob** (<@${BOB}>) <t:${String(PARTY_NOW / 1000)}:R>: It is somebody’s front yard.`,
+    );
+    expect(textOf(post)).toContain('**Information**\nBring a book.');
+    expect(buttonsOf(post).map((button) => button.label)).toEqual([
+      'Close…',
+      'Refuse place…',
+      'Block maker…',
+      'Dismiss',
+      'Go to post',
+    ]);
+    // No public trace: the post of the meetup and the region's channel hear nothing.
+    await made.service.flush();
+    expect(made.gateway.messagesIn(made.postId)).toEqual([]);
+    expect(made.gateway.messagesIn(WEST_CHANNEL).map((one) => one.id)).toEqual([
+      made.party.regionLinkMessageId,
+    ]);
+    expect([...made.reportStore.reports.values()]).toMatchObject([
+      {
+        status: 'open',
+        channelId: MOD_CHANNEL,
+        messageId: sent?.id,
+        subject: { kind: 'party', partyId: made.party.id, makerId: ALICE },
+      },
+    ]);
+  });
+
+  it('gathers more reporters on the one post, and knows who reported already', async () => {
+    const made = await reportedMeetup();
+    await made.report();
+    made.clock.now += 60_000;
+    expect((await made.report(CAROL, 'A private home.', 'Carol')).kind).toBe('sent');
+    expect((await made.report(BOB, 'Again.')).kind).toBe('already');
+    const posts = made.gateway.messagesIn(MOD_CHANNEL);
+    expect(posts).toHaveLength(1);
+    expect(textOf(posts[0]?.message)).toContain('**Reasons** (2)');
+    expect(textOf(posts[0]?.message)).toContain(`**Carol** (<@${CAROL}>)`);
+    expect(textOf(posts[0]?.message)).not.toContain('Again.');
+  });
+
+  it('refuses a reason of white space or one too long, and a party that is over', async () => {
+    const made = await reportedMeetup();
+    expect((await made.report(BOB, ' \n ')).kind).toBe('no-reason');
+    expect((await made.report(BOB, 'x'.repeat(MAX_REPORT_REASON + 1))).kind).toBe('no-reason');
+    await made.service.end(made.party.id);
+    expect((await made.report()).kind).toBe('gone');
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
+  });
+
+  it('keeps nothing when the moderators’ channel is not there', async () => {
+    const made = await reportedMeetup({ channel: false });
+    expect((await made.report()).kind).toBe('not-sent');
+    expect(made.reportStore.reports.size).toBe(0);
+  });
+
+  it('puts the report into the post and pings the staff once without a moderators’ channel', async () => {
+    const made = await reportedMeetup({ moderation: null });
+    expect((await made.report()).kind).toBe('asked');
+    expect((await made.report()).kind).toBe('asked-before');
+    expect((await made.report(CAROL, 'Private.', 'Carol')).kind).toBe('asked');
+    const said = made.gateway.messagesIn(made.postId).map((one) => one.message.content);
+    expect(said).toEqual([
+      `<@&300000000000000001>: **Bob** (<@${BOB}>) asks for this meetup to be deleted.\n> It is somebody’s front yard.`,
+      `**Carol** (<@${CAROL}>) asks for this meetup to be deleted.\n> Private.`,
+    ]);
+    expect(made.reportStore.reports.size).toBe(0);
+  });
+
+  it('ends the report with its party when the party ends by itself', async () => {
+    const made = await reportedMeetup();
+    await made.report();
+    await made.service.end(made.party.id);
+    await made.reports.flush();
+    const [report] = made.reportStore.reports.values();
+    expect(report?.status).toBe('ended');
+    const post = made.reportPostOf(report ?? { messageId: null });
+    expect(textOf(post)).toContain('**Ended**: the meetup was over before a moderator decided.');
+    expect(buttonsOf(post).map((button) => button.label)).toEqual(['Go to post']);
+    // A new reason now opens no report: the party is over.
+    expect((await made.report(CAROL)).kind).toBe('gone');
+  });
+
+  it('names a raid’s gym by the name its post shows, and its official name beside it', async () => {
+    const made = await reportsWith();
+    const gym = gymsFixture().get(1);
+    if (!gym) throw new Error('no gym 1');
+    const raid = await made.service.reportRaid({
+      gym,
+      reporterId: REPORTER,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: { level: 'T5', shadow: false },
+      boss: null,
+    });
+    if (raid.kind !== 'created') throw new Error(raid.kind);
+    await made.reports.reportParty({
+      serverId: SERVER,
+      partyId: raid.party.id,
+      reporter: { id: BOB, name: 'Bob' },
+      reason: 'Duplicate.',
+      roleIds: [],
+    });
+    const post = made.gateway.messagesIn(MOD_CHANNEL)[0]?.message;
+    expect(textOf(post)).toContain('### Reported raid');
+    expect(textOf(post)).toContain(
+      'Near **The Stacks** (gym; officially **Pinewood Public Library**) · ',
+    );
+    expect(buttonsOf(post).map((button) => button.label)).toEqual([
+      'Close…',
+      'Dismiss',
+      'Go to post',
+    ]);
+  });
+
+  it('opens anew a report whose post was never made', async () => {
+    const made = await reportedMeetup();
+    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
+    // The post fails: the report is forgotten.
+    expect((await made.report()).kind).toBe('not-sent');
+    expect(made.reportStore.reports.size).toBe(0);
+    made.gateway.failing.delete('sendMessage');
+    // A report left without its post (the bot stopped in between) is opened anew.
+    await made.reportStore.addReport(
+      {
+        id: '00000000-0000-4000-8000-000000000099',
+        serverId: SERVER,
+        subject: made.reports.subjectOf(made.party),
+        createdAt: PARTY_NOW - 10 * 60_000,
+      },
+      { reporterId: CAROL, reporterName: 'Carol', text: 'Old.', at: PARTY_NOW - 10 * 60_000 },
+    );
+    expect((await made.report()).kind).toBe('sent');
+    expect(await made.reportStore.openReports(SERVER)).toMatchObject([
+      // Carol was told it was sent: her reason is carried over.
+      {
+        status: 'open',
+        channelId: MOD_CHANNEL,
+        reasons: [{ reporterId: CAROL }, { reporterId: BOB }],
+      },
+    ]);
+    expect(
+      made.entries.some((entry) => String(entry.msg).startsWith('a report never got its post')),
+    ).toBe(true);
+  });
+});
diff --git a/src/services/moderation-reports.ts b/src/services/moderation-reports.ts
new file mode 100644
index 00000000..df6c9e66
--- /dev/null
+++ b/src/services/moderation-reports.ts
@@ -0,0 +1,403 @@
+import { randomUUID } from 'node:crypto';
+import type { Settings } from '../config/settings.js';
+import type { Gym } from '../db/repositories/gym-repository.js';
+import type { PartyGateway } from '../discord/party-gateway.js';
+import { addressLine } from '../domain/geo/google.js';
+import { cutWhole, type Place } from '../domain/geo/place.js';
+import {
+  MAX_REPORT_REASON,
+  type ModerationReport,
+  reportTargetKey,
+  type PartySubject,
+  type ReportReason,
+  type ReportStore,
+} from '../domain/moderation/reports.js';
+import { isMeetup, isTrain, type Party } from '../domain/party/party.js';
+import { currentStop } from '../domain/party/train.js';
+import { BoundedMap } from '../bounded-map.js';
+import type { Logger } from '../log.js';
+import { reportMessage } from '../render/moderation.js';
+import type { NamedMember } from '../render/text.js';
+import type { GymProvider } from './gym-directory.js';
+import type { PartyService } from './party-service.js';
+import type { PartyListener, PartyProvider } from './party-store.js';
+import type { RegionProvider } from './region-directory.js';
+
+/** A member's report of a party, as `/report` (or the Apps menu) gives it. */
+export interface PartyReportAsk {
+  /** The server's snowflake. */
+  serverId: string;
+  partyId: string;
+  reporter: NamedMember;
+  /** As typed: trimmed here. */
+  reason: string;
+  /** The staff roles to ping where there is no moderators' channel (`requestDeletion`). */
+  roleIds: readonly string[];
+}
+
+/** What came of a report. */
+export type ReportOutcome =
+  /** With the moderators: a new report, or a reason more on the open one. */
+  | { kind: 'sent'; report: ModerationReport }
+  /** This member reported it already, and the report is still open. */
+  | { kind: 'already' }
+  /** The party has ended (or is not there). */
+  | { kind: 'gone' }
+  /** The moderators' channel is not there, or Discord refused the post: nothing is kept. */
+  | { kind: 'not-sent' }
+  /** A reason of nothing but white space, or longer than `MAX_REPORT_REASON`. */
+  | { kind: 'no-reason' }
+  /**
+   * Without a moderators' channel (`settings.channels.moderation`): put into the party's post,
+   * the staff roles pinged once (`PartyService.requestDeletion`, as a member's `/delete` before),
+   * or asked by this member before.
+   */
+  | { kind: 'asked' }
+  | { kind: 'asked-before' };
+
+export interface ModerationReportsOptions {
+  storage: ReportStore;
+  /** Meetup safety's gateway (its own in rehearsal mode): the moderators' posts go through it. */
+  gateway: Pick<PartyGateway, 'findChannel' | 'sendMessage' | 'editMessage' | 'deleteMessage'>;
+  parties: Pick<PartyService, 'requestDeletion' | 'briefOf' | 'postTitle' | 'placeOf'>;
+  /** The active parties. */
+  store: Pick<PartyProvider, 'get'>;
+  regions: Pick<RegionProvider, 'byId'>;
+  /** The gyms, for a raid's and a train's place and a gym's official name. */
+  gyms?: Pick<GymProvider, 'get'>;
+  settings: Settings;
+  log: Logger;
+  now?: () => number;
+}
+
+/**
+ * How old a report must be whose post was never recorded (the bot stopped between keeping it and
+ * sending its post) before a new reason opens one anew in its place.
+ */
+const STRANDED_MS = 5 * 60_000;
+
+/**
+ * As much of a reason as is quoted in a party's post where there is no moderators' channel: in
+ * one message with the pings, escaped (`plain` may double it), within Discord's 2,000.
+ */
+const PUBLIC_REASON_ROOM = 500;
+
+/** As many of a party's brief lines as a report keeps, and as much of each. */
+const MAX_LINES = 10;
+const LINE_ROOM = 1000;
+
+/**
+ * Reports to the moderators (plan 8S-2; spec `2026-10-17-moderation-reports-design.md`): a
+ * member's report of a party (`/report`, the Apps menu on its post) or of a message goes to the
+ * moderators' channel (`settings.channels.moderation`, meetup safety's) as a post with what is
+ * reported and every reporter's reason, where the moderators decide. Reports are kept in the
+ * database (`ReportStore`), so that a press on an old post works after a restart; reasons of one
+ * party or message gather on its one open report. Without the moderators' channel a party's
+ * report goes into its post for all to read, as a member's `/delete` did (`requestDeletion`).
+ */
+export class ModerationReports {
+  private readonly now: () => number;
+  /** The work done on the side (a party that ended), for `flush`. */
+  private readonly pending = new Set<Promise<void>>();
+  /** By report: the edit of its post under way, after which the next one waits. */
+  private readonly showing = new BoundedMap<string, Promise<void>>(1_000);
+  /** By subject (`reportTargetKey`): reasons of reports that are gone, for the next one opened. */
+  private readonly orphans = new BoundedMap<string, ReportReason[]>(1_000);
+
+  constructor(private readonly options: ModerationReportsOptions) {
+    this.now = options.now ?? (() => Date.now());
+  }
+
+  /** Whether reports go to the moderators: the settings name their channel. */
+  get on(): boolean {
+    return this.options.settings.channels.moderation !== undefined;
+  }
+
+  /**
+   * Follows the parties: when a reported party ends without a moderator (the clock, its maker,
+   * a move, staff's `/delete`), its open report ends with it, its post edited without buttons.
+   */
+  watch(store: { onChange(listener: PartyListener): void }): void {
+    store.onChange((before, after) => {
+      if (after.status === 'ended' && before?.status !== 'ended') {
+        this.aside(this.partyEnded(after.id), { party: after.id });
+      }
+    });
+  }
+
+  /** Waits for the work done on the side and the edits of posts. For tests and shutdown. */
+  async flush(): Promise<void> {
+    while (this.pending.size > 0) await Promise.all([...this.pending]);
+    for (const key of this.showing.keys()) await this.showing.get(key);
+  }
+
+  private aside(work: Promise<void>, about: Record<string, string>): void {
+    const tracked = work
+      .catch((err: unknown) => {
+        this.options.log.error({ err, ...about }, 'could not end the report of a party');
+      })
+      .finally(() => {
+        this.pending.delete(tracked);
+      });
+    this.pending.add(tracked);
+  }
+
+  /**
+   * A member's report of a party: kept and sent to the moderators' channel of its server with
+   * the reason (a new post), or added to the open report of the party (its post edited), unless
+   * the member reported it already (`already`). Without the moderators' channel it goes into the
+   * party's post (`asked`). Never public otherwise: nothing is said in the party's post, nobody
+   * pinged.
+   */
+  async reportParty(ask: PartyReportAsk): Promise<ReportOutcome> {
+    const reason = ask.reason.trim();
+    if (reason === '' || reason.length > MAX_REPORT_REASON) return { kind: 'no-reason' };
+    const party = this.options.store.get(ask.partyId);
+    if (!party?.forumPostId) return { kind: 'gone' };
+    if (!this.on) {
+      const asked = await this.options.parties.requestDeletion(
+        party.id,
+        ask.reporter,
+        // Quoted in one message with the pings, which Discord keeps to 2,000 characters.
+        cutWhole(reason, PUBLIC_REASON_ROOM),
+        ask.roleIds,
+      );
+      return { kind: asked === 'asked' ? 'asked' : asked === 'already' ? 'asked-before' : 'gone' };
+    }
+    const subject = this.subjectOf(party);
+    const nearChannelId = subject.regionChannelId;
+    if (nearChannelId === null) return { kind: 'gone' };
+    return this.report({ serverId: ask.serverId, subject }, ask.reporter, reason, nearChannelId);
+  }
+
+  /**
+   * Opens a report with the reason or adds the reason to the open one of the same subject, and
+   * shows it in the moderators' channel. A report whose post was never made (stranded) is
+   * forgotten and opened anew, its reasons carried over; so are the reasons of a report whose post
+   * failed or that the sweep forgot (`orphans`): nobody told "Sent" loses their reason.
+   */
+  private async report(
+    what: { serverId: string; subject: ModerationReport['subject'] },
+    reporter: NamedMember,
+    reason: string,
+    nearChannelId: string,
+    carried: readonly ReportReason[] = [],
+  ): Promise<ReportOutcome> {
+    const { storage, log } = this.options;
+    const now = this.now();
+    const newReport = () => ({
+      id: randomUUID(),
+      serverId: what.serverId,
+      subject: what.subject,
+      createdAt: now,
+    });
+    const added = await storage.addReport(newReport(), {
+      reporterId: reporter.id,
+      reporterName: reporter.name ?? null,
+      text: reason,
+      at: now,
+    });
+    const { report } = added;
+    if (added.kind !== 'opened' && report.messageId === null && carried.length === 0) {
+      if (report.createdAt <= now - STRANDED_MS) {
+        log.warn({ report: report.id }, 'a report never got its post; it is opened anew');
+        await storage.discardReport(report.id);
+        return this.report(what, reporter, reason, nearChannelId, report.reasons);
+      }
+    }
+    if (added.kind === 'already') return { kind: 'already' };
+    if (added.kind === 'added') {
+      // What the post shows of a party is what it is now.
+      await storage.setSubject(report.id, what.subject).catch((err: unknown) => {
+        log.warn({ err, report: report.id }, 'could not keep what a report shows');
+      });
+      // A post on its way shows it once it is recorded (`post` draws it anew).
+      await this.show(report.id);
+      return { kind: 'sent', report };
+    }
+    const key = reportTargetKey(what.subject);
+    const others = [...carried, ...(this.orphans.get(key) ?? [])].filter(
+      (one) => one.reporterId !== reporter.id,
+    );
+    this.orphans.delete(key);
+    for (const other of others) {
+      await storage.addReport(newReport(), other).catch((err: unknown) => {
+        log.warn({ err, report: report.id }, 'could not carry a reason over to a report');
+      });
+    }
+    return this.post(report.id, nearChannelId, reporter.id);
+  }
+
+  /**
+   * Sends the post of a report just opened and records it; then draws it anew when anything
+   * changed while it was on its way (a reason more, its party ended: the party is looked at once
+   * more). Whatever fails leaves nothing behind (`not-sent`; a post sent is taken back); the
+   * reasons of others that had joined are kept for the report opened next (`orphans`).
+   */
+  private async post(
+    reportId: string,
+    nearChannelId: string,
+    openerId: string,
+  ): Promise<ReportOutcome> {
+    const { storage, gateway, settings, store, log } = this.options;
+    const report = await storage.report(reportId);
+    if (!report) return { kind: 'not-sent' };
+    const name = settings.channels.moderation;
+    const channelId = name === undefined ? undefined : gateway.findChannel(nearChannelId, name);
+    const sentMessage = reportMessage(report);
+    let messageId: string | undefined;
+    try {
+      if (channelId === undefined) {
+        throw new Error(`the moderators' channel #${name ?? ''} is not there`);
+      }
+      messageId = await gateway.sendMessage(channelId, sentMessage);
+      if (messageId === undefined) throw new Error('the moderators’ channel is gone');
+      await storage.setReportPost(report.id, channelId, messageId);
+    } catch (err) {
+      log.warn({ err, report: report.id }, 'could not send a report to the moderators');
+      if (channelId !== undefined && messageId !== undefined) {
+        await gateway.deleteMessage(channelId, messageId).catch((deleteErr: unknown) => {
+          log.warn({ err: deleteErr }, 'could not take back the post of a report');
+        });
+      }
+      const now = await storage.report(report.id).catch(() => undefined);
+      await storage.discardReport(report.id).catch((discardErr: unknown) => {
+        log.error({ err: discardErr, report: report.id }, 'could not forget a report');
+      });
+      this.orphan(
+        report.subject,
+        (now ?? report).reasons.filter((one) => one.reporterId !== openerId),
+      );
+      return { kind: 'not-sent' };
+    }
+    // Its party ended while the post was on its way, before the listener could see the post.
+    const { subject } = report;
+    if (subject.kind === 'party' && !store.get(subject.partyId)) {
+      await storage.decideReport(report.id, 'ended', null, null).catch((err: unknown) => {
+        log.warn({ err, report: report.id }, 'could not end the report of a party that ended');
+      });
+    }
+    const now = await storage.report(report.id).catch(() => undefined);
+    if (now && JSON.stringify(reportMessage(now)) !== JSON.stringify(sentMessage)) {
+      await this.show(report.id);
+    }
+    return { kind: 'sent', report: now ?? { ...report, channelId, messageId } };
+  }
+
+  /** Keeps reasons of a report that is gone for the next report of the same subject. */
+  private orphan(subject: ModerationReport['subject'], reasons: readonly ReportReason[]): void {
+    if (reasons.length === 0) return;
+    const key = reportTargetKey(subject);
+    this.orphans.set(key, [...(this.orphans.get(key) ?? []), ...reasons]);
+  }
+
+  /**
+   * The sweep (at start and with the appeals' sweep, `PartySchedulerOptions.requests`): the open
+   * reports of parties that are over end (their posts edited; the bot stopped before the listener
+   * saw the end), and a report never posted for `STRANDED_MS` is forgotten, its reasons kept for
+   * the next report of its subject. Never throws (logged).
+   */
+  async sweep(): Promise<void> {
+    const { storage, store, log } = this.options;
+    try {
+      for (const report of await storage.unpostedReports(this.now() - STRANDED_MS)) {
+        await storage.discardReport(report.id);
+        this.orphan(report.subject, report.reasons);
+        log.warn({ report: report.id }, 'a report never got its post; it is forgotten');
+      }
+      for (const report of await storage.openPartyReports()) {
+        if (report.subject.kind !== 'party' || store.get(report.subject.partyId)) continue;
+        if (await storage.decideReport(report.id, 'ended', null, null)) await this.show(report.id);
+      }
+    } catch (err) {
+      log.error({ err }, 'could not sweep the reports');
+    }
+  }
+
+  /** What the moderators' post shows of a party, as it is now. */
+  subjectOf(party: Party): PartySubject {
+    const { parties, regions } = this.options;
+    const place = this.placeOfParty(party);
+    const gym = place?.kind === 'gym' ? this.gym(place.id) : undefined;
+    const official =
+      gym?.nickname !== null && gym?.nickname !== undefined && gym.nickname !== gym.name
+        ? gym.name
+        : null;
+    const region = party.regionId === null ? undefined : regions.byId(party.regionId);
+    const brief = parties.briefOf(party);
+    return {
+      kind: 'party',
+      partyId: party.id,
+      partyType: party.type,
+      title: cutWhole(parties.postTitle(party), 200),
+      // Where is the post's own section (with a gym's official name): not the brief's line of it.
+      lines: brief.lines
+        .filter((line) => line !== brief.whereLine)
+        .slice(0, MAX_LINES)
+        .map((line) => cutWhole(line, LINE_ROOM)),
+      regionChannelId: region?.channelId ?? null,
+      postId: party.forumPostId,
+      place,
+      officialName: official,
+      makerId: party.createdById,
+      makerName: party.makerName ?? null,
+      information: isMeetup(party) ? party.meetup.description : null,
+    };
+  }
+
+  /** Where a party is: a raid's gym, a train's current stop, a meetup's place as it is now. */
+  private placeOfParty(party: Party): Place | null {
+    if (isMeetup(party)) return this.options.parties.placeOf(party);
+    const gymId = isTrain(party) ? currentStop(party) : party.gymId;
+    const gym = gymId === undefined || gymId === null ? undefined : this.options.gyms?.get(gymId);
+    return gym === undefined ? null : gymPlace(gym);
+  }
+
+  private gym(id: string): Gym | undefined {
+    return /^\d+$/u.test(id) ? this.options.gyms?.get(Number(id)) : undefined;
+  }
+
+  /** A party ended without a moderator: its open reports end with it. */
+  private async partyEnded(partyId: string): Promise<void> {
+    const { storage } = this.options;
+    for (const report of await storage.openReportsOfParty(partyId)) {
+      if (await storage.decideReport(report.id, 'ended', null, null)) await this.show(report.id);
+    }
+  }
+
+  /**
+   * Shows a report in its post as it is kept now: read just before the edit, one edit at a time
+   * per report (so that an older edit never lands after a newer one). A failure is logged.
+   */
+  private show(reportId: string): Promise<void> {
+    const tail = (this.showing.get(reportId) ?? Promise.resolve()).then(() =>
+      this.redraw(reportId),
+    );
+    this.showing.set(reportId, tail);
+    return tail;
+  }
+
+  private async redraw(reportId: string): Promise<void> {
+    const { storage, gateway, log } = this.options;
+    try {
+      const report = await storage.report(reportId);
+      if (!report || report.channelId === null || report.messageId === null) return;
+      await gateway.editMessage(report.channelId, report.messageId, reportMessage(report));
+    } catch (err) {
+      log.warn({ err, report: reportId }, 'could not show a report as it is now');
+    }
+  }
+}
+
+/** A gym as a place (its nickname first, as its post names it). */
+function gymPlace(gym: Gym): Place {
+  return {
+    kind: 'gym',
+    id: String(gym.id),
+    title: gym.nickname || gym.name,
+    lat: gym.lat,
+    lon: gym.lon,
+    address: addressLine(gym.geodata) || null,
+    image: gym.imageUrl,
+  };
+}
diff --git a/src/services/party-service.meetup.test.ts b/src/services/party-service.meetup.test.ts
index 1065cd52..b1d9d0f4 100644
--- a/src/services/party-service.meetup.test.ts
+++ b/src/services/party-service.meetup.test.ts
@@ -20,6 +20,7 @@ import {
   testMeetup,
 } from '../../test/support/parties.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
+import { missingPermissions } from '../../test/support/fake-gateway.js';
 import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
 import { wayspotsWith } from '../../test/support/wayspots.js';
 import type { KnownPlace } from '../domain/geo/place.js';
@@ -472,6 +473,52 @@ describe('PartyService: ending a meetup', () => {
     expect(post).toMatchObject({ archived: true, locked: true });
   });
 
+  it('deletes the post in place of archiving it when asked, after the link line', async () => {
+    const made = await createdMeetup();
+    await made.service.showStatus(made.party.id);
+    await made.service.flush();
+    const statusCopy = made.gateway.messagesIn(made.postId)[0]?.id;
+    let answered = false;
+    expect(
+      await made.service.end(made.party.id, undefined, {
+        lastWords: 'Closed by the moderators.',
+        removal: 'delete',
+        left: () => {
+          answered = true;
+          return Promise.resolve();
+        },
+      }),
+    ).toBe(true);
+    expect(answered).toBe(true);
+    expect(made.gateway.posts.has(made.postId)).toBe(false);
+    expect(made.gateway.deletedPosts).toEqual([made.postId]);
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(await made.service.endAs(made.party.id)).toBe(false);
+    // Nothing is said in the post or done to it after it is gone; the history records the end.
+    expect(made.gateway.calls.filter((call) => call.endsWith(` ${made.postId}`)).at(-1)).toBe(
+      `deletePost ${made.postId}`,
+    );
+    expect(made.gateway.deleted.map((one) => one.messageId)).toContain(statusCopy);
+    expect(made.history.records.map((record) => record.partyId)).toEqual([made.party.id]);
+  });
+
+  it('archives the post when Discord refuses to delete it', async () => {
+    const made = await createdMeetup();
+    made.gateway.failing.set('deletePost', missingPermissions('MANAGE_THREADS'));
+    // It says how the post went: archived, as Discord refused the deletion.
+    expect(
+      await made.service.endAs(made.party.id, undefined, {
+        lastWords: 'Closed.',
+        removal: 'delete',
+      }),
+    ).toBe('archived');
+    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
+    expect(made.said()).toEqual(['Closed.']);
+    expect(made.entries.some((entry) => entry.msg === 'could not delete the post of a party')).toBe(
+      true,
+    );
+  });
+
   it('ends only when the condition holds for the meetup as it is stored then', async () => {
     const made = await createdMeetup();
     expect(await made.service.end(made.party.id, (party) => party.saved)).toBe(false);
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index c8e074e7..b4c679e8 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -17,6 +17,7 @@ import {
   type V2Message,
 } from '../discord/party-gateway.js';
 import type { PartyEnd } from '../domain/history/party-history.js';
+import type { PostRemoval } from '../domain/moderation/reports.js';
 import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
 import { createMeetup, tidyDescription } from '../domain/party/meetup.js';
 import {
@@ -141,6 +142,17 @@ const CHECK_EVERY_MS = 10 * MINUTE;
  */
 export const EMOJI_RENDER_GAP_MS = 250;
 
+/** How a party is ended by `end`: why, what is said last, and the post archived or deleted. */
+export interface PartyClosing {
+  lastWords?: string;
+  left?: () => Promise<unknown>;
+  ended?: PartyEnd;
+  removal?: PostRemoval;
+}
+
+/** How the post of a party went when it ended (`endAs`). */
+export type PostRemoved = 'archived' | 'deleted';
+
 export interface RaidReport {
   gym: Gym;
   /** Snowflake of the reporter. */
@@ -526,6 +538,21 @@ export class PartyService {
     return this.rendered(party).brief;
   }
 
+  /**
+   * Whether the bot may delete the post of an active party (`PartyGateway.mayDeletePost`): a
+   * moderator's choice to delete it (plan 8S-2) is refused before the party ends where it may
+   * not. True for a party without a post.
+   */
+  mayDeletePost(partyId: string): boolean {
+    const postId = this.options.store.get(partyId)?.forumPostId;
+    return postId === null || postId === undefined || this.options.gateway.mayDeletePost(postId);
+  }
+
+  /** The title of the party's post as it is now (a report names the party by it, plan 8S-2). */
+  postTitle(party: Party): string {
+    return this.rendered(party).title;
+  }
+
   /** The durations in effect, with the events known at this moment. */
   rules(): RaidDurationRules {
     return raidDurationRules(this.options.settings, this.options.raidEvents.events());
@@ -1732,6 +1759,10 @@ export class PartyService {
    * there, not after the archiving. It is waited for three seconds at most (`ANSWER_WAIT_MS`);
    * what it throws, also later, is logged. `closing.ended` is why it ends, for the party
    * history: the scheduler says `clock`; anybody else ends it as a person (`cancelled`).
+   * `closing.removal` `delete` (a moderator's choice, plan 8S-2) deletes the post with everything
+   * in it in the place of its last showing and the archiving (its copies and link line go as on
+   * any end); a deletion Discord refuses archives it as usual. Whoever asks for it checks first
+   * that the bot may (`PartyGateway.mayDeletePost`).
    *
    * What fails on Discord's side after the party has ended is logged and not tried again here;
    * a post that stayed open is archived by `sweepPosts`.
@@ -1739,8 +1770,21 @@ export class PartyService {
   async end(
     partyId: string,
     onlyIf?: (party: Party) => boolean,
-    closing: { lastWords?: string; left?: () => Promise<unknown>; ended?: PartyEnd } = {},
+    closing: PartyClosing = {},
   ): Promise<boolean> {
+    return (await this.endAs(partyId, onlyIf, closing)) !== false;
+  }
+
+  /**
+   * `end`, saying how the post went (plan 8S-2): `deleted` (`closing.removal` `delete` and Discord
+   * deleted it), `archived` (as usual, also where Discord refused the deletion), or false when
+   * there was no such active party (nothing was done).
+   */
+  async endAs(
+    partyId: string,
+    onlyIf?: (party: Party) => boolean,
+    closing: PartyClosing = {},
+  ): Promise<PostRemoved | false> {
     const ended: PartyEnd = closing.ended ?? { how: 'cancelled' };
     const result = await this.options.store.update(partyId, (party) =>
       onlyIf && !onlyIf(party) ? {} : { party: endParty(party), ended },
@@ -1749,8 +1793,21 @@ export class PartyService {
     const party = result.party;
     this.ended(party);
     if (closing.left) await this.answerBeforeClosing(partyId, closing.left);
-    await this.closePost(party, closing.lastWords);
-    return true;
+    return this.closePost(party, closing.lastWords, false, closing.removal);
+  }
+
+  /**
+   * Deletes the post of a party that ended without it (plan 8S-2: Delete post chosen as the party
+   * ended by itself). `deleted`, or `refused` (logged) where Discord would not.
+   */
+  async deletePostOf(postId: string): Promise<'deleted' | 'refused'> {
+    try {
+      await this.options.gateway.deletePost(postId);
+      return 'deleted';
+    } catch (err) {
+      this.options.log.warn({ err, post: postId }, 'could not delete the post of a party');
+      return 'refused';
+    }
   }
 
   /**
@@ -1887,7 +1944,12 @@ export class PartyService {
    * post, unless they were `said` there already, and stand in the post's own message in the
    * place of the times. Never rejects.
    */
-  private async closePost(party: Party, lastWords?: string, said = false): Promise<void> {
+  private async closePost(
+    party: Party,
+    lastWords?: string,
+    said = false,
+    removal: PostRemoval = 'archive',
+  ): Promise<PostRemoved> {
     const { gateway, log } = this.options;
     const postId = party.forumPostId;
     const attempt = async (what: string, work: () => Promise<unknown>): Promise<void> => {
@@ -1904,7 +1966,16 @@ export class PartyService {
     await this.posts.idle(party.id);
     await this.mirrors.idle(party.id);
     await this.mirrors.remove(party);
-    if (postId === null) return;
+    if (postId === null) return 'archived';
+    if (removal === 'delete') {
+      try {
+        // The post goes with everything in it: nothing is said in it or done to it any more.
+        await gateway.deletePost(postId);
+        return 'deleted';
+      } catch (err) {
+        log.warn({ err, party: party.id, post: postId }, 'could not delete the post of a party');
+      }
+    }
     const leftovers = [
       ...party.prompts.completion.map((question) => question.id),
       ...(party.prompts.warning === null ? [] : [party.prompts.warning]),
@@ -1928,7 +1999,7 @@ export class PartyService {
     });
     if (!there) {
       log.info({ party: party.id, post: postId }, 'the post of an ended party is gone');
-      return;
+      return 'archived';
     }
     const forumId = party.forumChannelId;
     if (forumId !== null && (lastWords !== undefined || !isRaid(party))) {
@@ -1940,6 +2011,7 @@ export class PartyService {
       );
     }
     await attempt('archive the post of an ended party', () => gateway.archivePost(postId));
+    return 'archived';
   }
 
   /**
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index 4524f46b..767b4254 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -302,6 +302,12 @@ export class FakePartyGateway implements PartyGateway {
    * message sent or edited there all the same is kept without its embeds.
    */
   readonly noEmbeds = new Set<string>();
+  /**
+   * Channels, forums and posts where the bot may not delete what others wrote (Manage Messages,
+   * Manage Threads; plan 8S-2): `mayDeletePost` answers false for a post there, and a reported
+   * message there is not deleted (`deleteReported` answers `not-allowed`).
+   */
+  readonly noManaging = new Set<string>();
   /** The forums in which only the bot makes posts (`reservePosts`). */
   readonly reserved = new Set<string>();
   /** The forums whose permissions the bot may not change. */
@@ -1135,6 +1141,12 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
+  /** The bot may delete posts but in the forums (or posts) of `noManaging`. */
+  mayDeletePost(postId: string): boolean {
+    const forumId = this.posts.get(postId)?.forumId;
+    return !this.noManaging.has(postId) && (forumId === undefined || !this.noManaging.has(forumId));
+  }
+
   deleteChannel(channelId: string, reason?: string) {
     return this.attempt('deleteChannel', channelId, () => {
       if (reason !== undefined) this.auditReasons.set(channelId, reason);
diff --git a/test/support/report-cases.ts b/test/support/report-cases.ts
index 74d8c05f..0c329e87 100644
--- a/test/support/report-cases.ts
+++ b/test/support/report-cases.ts
@@ -184,6 +184,7 @@ export function reportCases(made: () => Promise<ReportStore>): void {
     expect((await store.openReportsOfParty(REPORTED_PARTY)).map((one) => one.id)).toEqual([
       requestId(201),
     ]);
+    expect((await store.openPartyReports()).map((one) => one.id)).toEqual([requestId(201)]);
     expect((await store.unpostedReports(SAFETY_NOW + 1)).map((one) => one.id)).toEqual([
       requestId(203),
       requestId(202),
diff --git a/test/support/reports-service.ts b/test/support/reports-service.ts
new file mode 100644
index 00000000..3f86e163
--- /dev/null
+++ b/test/support/reports-service.ts
@@ -0,0 +1,36 @@
+import type { ModerationReport } from '../../src/domain/moderation/reports.js';
+import type { Party } from '../../src/domain/party/party.js';
+import { ModerationReports } from '../../src/services/moderation-reports.js';
+import { meetupSafetyWith, MOD_CHANNEL, type SafetyOptions } from './meetup-safety-service.js';
+import type { ServiceOverrides } from './party-service.js';
+import { MemoryReports } from './reports.js';
+
+/**
+ * Reports to the moderators over the services of `meetupSafetyWith` (the fake gateway with the
+ * moderators' channel `MOD_CHANNEL`, the party service and store, meetup safety, the clock) and
+ * `MemoryReports` (`reportStore`), following the store's parties as the bot does (`watch`).
+ * `reportPostOf(report)` is the message of the moderators' post of a report as it is now.
+ */
+export async function reportsWith(
+  options: SafetyOptions = {},
+  parties: readonly Party[] = [],
+  overrides: ServiceOverrides = {},
+) {
+  const made = await meetupSafetyWith(options, parties, overrides);
+  const reportStore = new MemoryReports();
+  const reports = new ModerationReports({
+    storage: reportStore,
+    gateway: made.gateway,
+    parties: made.service,
+    store: made.store,
+    regions: made.regions,
+    gyms: made.gyms,
+    settings: made.settings,
+    log: made.log,
+    now: () => made.clock.now,
+  });
+  reports.watch(made.store);
+  const reportPostOf = (report: Pick<ModerationReport, 'messageId'>) =>
+    made.gateway.messagesIn(MOD_CHANNEL).find((sent) => sent.id === report.messageId)?.message;
+  return { ...made, reportStore, reports, reportPostOf };
+}
diff --git a/test/support/reports.ts b/test/support/reports.ts
index e5553fb1..43c316fa 100644
--- a/test/support/reports.ts
+++ b/test/support/reports.ts
@@ -115,6 +115,11 @@ export class MemoryReports implements ReportStore {
     );
   }
 
+  async openPartyReports() {
+    await this.check('openPartyReports');
+    return this.sorted((one) => one.status === 'open' && one.subject.kind === 'party');
+  }
+
   async openReports(serverId: string) {
     await this.check('openReports');
     return this.sorted((one) => one.status === 'open' && one.serverId === serverId);
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index af9c624b..e07ef4b7 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -46,6 +46,8 @@ import { LoginLinks } from '../../src/web/login-links.js';
 import { MeetupSafety } from '../../src/services/meetup-safety.js';
 import type { PartyGateway } from '../../src/discord/party-gateway.js';
 import { MemoryMeetupSafety } from './meetup-safety.js';
+import { ModerationReports } from '../../src/services/moderation-reports.js';
+import { MemoryReports } from './reports.js';
 
 export { TEST_SETTINGS_PATH };
 
@@ -149,6 +151,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     // Off, as the test settings have no moderators' channel; a test of meetup safety passes its
     // own from meetupSafetyWith().
     meetupSafety: undefined as unknown as MeetupSafety,
+    // Over the context's own party service (below), unless a test passes its own.
+    reports: undefined as unknown as ModerationReports,
     // Every click is answered by itself; a test of bursts passes its own with a window.
     clickAnswers: new ClickAnswers({ log, windowMs: 0 }),
     // Searches the catalogue of the context's own game data, built when first used.
@@ -194,6 +198,23 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       log,
     });
   }
+  if (overrides.reports === undefined) {
+    // Off, as the test settings have no moderators' channel: a party's report goes into its
+    // post. A test of reports to the moderators passes its own from reportsWith().
+    (ctx as { reports: ModerationReports }).reports = new ModerationReports({
+      storage: new MemoryReports(),
+      gateway: unavailable<PartyGateway>(
+        'gateway for reports',
+        'pass { reports } from reportsWith()',
+      ),
+      parties: ctx.partyService,
+      store: ctx.parties,
+      regions: ctx.regions,
+      gyms: ctx.gyms,
+      settings: ctx.config.settings,
+      log,
+    });
+  }
   if (overrides.placeFinder === undefined) {
     (ctx as { placeFinder: PlaceFinder }).placeFinder = new PlaceFinder({
       gyms: ctx.gyms,
````

### Task 4: Plan 8S-2 T4: The moderators decide a party report: Close, Refuse place, Block maker, Dismiss

Prototype commit: `90a9538da7359e720c336c0593b4e487c50af061`

The buttons of a report's post are for staff, with the throttle of the moderators' posts;
the first press wins (one conditional change). Close…, Refuse place… and Block maker… ask
privately whether to archive the post or delete it, then end the party as /delete does
(history cancelled); Refuse place refuses the place for good with the report's post as its
source (a place that is now a pin or none changes nothing, and says so), Block maker blocks
as Block member does (MeetupSafety.blockMember, the maker's other meetups archived, one DM).
Deleting where the bot may not is refused before anything ends. Where a step fails, the
report is opened again and the moderator told what was done before it and whether the
report is open again; a deletion Discord refused leaves the post archived, kept as such
(removal denied) and said in the report's post.

**Files:**

```
 src/app.ts                                     |   1 +
 src/components/index.ts                        |   2 +
 src/components/moderation-reports.test.ts      | 172 ++++++++++++++++++++++++++++++++++++++++
 src/components/moderation-reports.ts           | 234 ++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/db/repositories/report-repository.ts       |  33 +++++++-
 src/domain/moderation/reports.ts               |  16 +++-
 src/render/moderation.ts                       |   7 +-
 src/services/meetup-safety.ts                  |  80 ++++++++++++++++---
 src/services/moderation-reports.decide.test.ts | 279 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/moderation-reports.test.ts        |  36 ++-------
 src/services/moderation-reports.ts             | 224 +++++++++++++++++++++++++++++++++++++++++++++++++++-
 test/support/report-cases.ts                   |  20 +++++
 test/support/reports-service.ts                |  36 +++++++++
 test/support/reports.ts                        |  27 +++++++
 test/support/test-context.ts                   |   1 +
 15 files changed, 1120 insertions(+), 48 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/components/moderation-reports.test.ts src/services/moderation-reports.decide.test.ts src/services/moderation-reports.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 90a9538da7359e720c336c0593b4e487c50af061 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-2 T4: The moderators decide a party report: Close, Refuse place, Block maker, Dismiss`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 3c910a88..a744362a 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -555,6 +555,7 @@ export async function startApp(
     storage: new ReportRepository(db, log),
     gateway: moderatorsGateway,
     parties: partyService,
+    safety: meetupSafety,
     store: parties,
     regions,
     gyms,
diff --git a/src/components/index.ts b/src/components/index.ts
index 17e9168c..8112ef84 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -24,6 +24,7 @@ import { dmControls } from './dm.js';
 import { gymReviewControls } from './gym-review.js';
 import { meetupAppealControls } from './meetup-appeal.js';
 import { meetupSafetyControls } from './meetup-safety.js';
+import { reportDecisionControls } from './moderation-reports.js';
 import { partyButtons } from './party.js';
 
 /** Every handler of buttons, select menus and modals. The router reads this list. */
@@ -34,6 +35,7 @@ export const components: readonly ComponentHandler[] = [
   meetupFormControls,
   meetupSafetyControls,
   meetupAppealControls,
+  reportDecisionControls,
   wantControls,
   wantListControls,
   targetControls,
diff --git a/src/components/moderation-reports.test.ts b/src/components/moderation-reports.test.ts
new file mode 100644
index 00000000..fedb29e8
--- /dev/null
+++ b/src/components/moderation-reports.test.ts
@@ -0,0 +1,172 @@
+import { MessageFlags } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import {
+  asV2,
+  fakeButton,
+  sent,
+  type FakeInteraction,
+} from '../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../test/support/gyms.js';
+import { SAFETY_PIN } from '../../test/support/meetup-safety-cases.js';
+import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
+import { buttonsOf, textOf } from '../../test/support/messages.js';
+import { reportedMeetup } from '../../test/support/reports-service.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import { InteractionRouter } from '../discord/router.js';
+import { reportDecisionControls } from './moderation-reports.js';
+
+async function setup() {
+  const made = await reportedMeetup();
+  const outcome = await made.report();
+  if (outcome.kind !== 'sent') throw new Error(outcome.kind);
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    parties: made.store,
+    regions: made.regions,
+    reports: made.reports,
+    meetupSafety: made.safety,
+  });
+  const router = new InteractionRouter(ctx, [], [reportDecisionControls]);
+  const id = outcome.report.id;
+  const press = async (action: string, extra: object = {}): Promise<FakeInteraction> => {
+    const interaction = fakeButton({
+      customId: `mreport:${id}:${action}`,
+      userId: '200000000000000009',
+      displayName: 'Mod',
+      roleNames: ['Moderator'],
+      channelId: MOD_CHANNEL,
+      v2Message: true,
+      ...extra,
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  return { ...made, id, press };
+}
+
+describe('the buttons of a report’s post', () => {
+  it('ask privately whether to archive or delete before an action that ends the party', async () => {
+    const made = await setup();
+    const asked = await made.press('close');
+    const question = asV2(sent(asked.reply));
+    expect((sent(asked.reply).flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
+    expect(textOf(question)).toContain('Close this meetup?');
+    expect(buttonsOf(question).map((button) => button.customId)).toEqual([
+      `mreport:${made.id}:close:archive`,
+      `mreport:${made.id}:close:delete`,
+    ]);
+    expect(textOf(asV2(sent((await made.press('refuse')).reply)))).toContain(
+      'Refuse this place for good, and close this meetup?',
+    );
+    expect(textOf(asV2(sent((await made.press('block')).reply)))).toContain(
+      'Block its maker from creating meetups here, and close this meetup?',
+    );
+    expect(made.store.get(made.party.id)).toBeDefined();
+  });
+
+  it('carry out the choice in the place of the question', async () => {
+    const made = await setup();
+    const chosen = await made.press('close:archive', { ephemeralMessage: true });
+    expect(chosen.deferUpdate).toHaveBeenCalled();
+    expect(textOf(asV2(sent(chosen.editReply)))).toBe(
+      'Closed: the meetup is over, and its post archived.',
+    );
+    expect(made.store.get(made.party.id)).toBeUndefined();
+    const again = await made.press('dismiss');
+    expect(sent(again.editReply).content).toMatch(
+      /^\*\*Mod\*\* \(<@200000000000000009>\) decided this already <t:\d+:R>: closed\.$/,
+    );
+  });
+
+  it('dismiss, and say where the bot may not delete', async () => {
+    const made = await setup();
+    made.gateway.noManaging.add(WEST_FORUM);
+    const refused = await made.press('close:delete', { ephemeralMessage: true });
+    expect(textOf(asV2(sent(refused.editReply)))).toBe(
+      `I can't delete posts in <#${WEST_FORUM}> (Manage Threads is missing there). Archive it, or ` +
+        'delete it yourself.',
+    );
+    const dismissed = await made.press('dismiss');
+    expect(dismissed.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(sent(dismissed.editReply).content).toBe('Dismissed: nothing else changes.');
+  });
+
+  it('answer an action that ends a party at once when the report is decided already', async () => {
+    const made = await setup();
+    await made.press('dismiss');
+    const again = await made.press('close');
+    expect(sent(again.reply).content).toMatch(/decided this already .*: dismissed\.$/);
+  });
+
+  it('keep Archive post where the bot may not delete the post', async () => {
+    const made = await setup();
+    made.gateway.noManaging.add(WEST_FORUM);
+    const refused = await made.press('close:delete', { ephemeralMessage: true });
+    const shown = asV2(sent(refused.editReply));
+    expect(buttonsOf(shown).map((button) => [button.label, button.customId])).toEqual([
+      ['Archive post', `mreport:${made.id}:close:archive`],
+    ]);
+  });
+
+  it('say it could not be done, the report open, where a step failed', async () => {
+    const made = await setup();
+    made.storage.failing.add('addBlock');
+    const failed = await made.press('block:archive', { ephemeralMessage: true });
+    expect(textOf(asV2(sent(failed.editReply)))).toBe(
+      'That could not be done: nothing changed, and the report is still open. Try again.',
+    );
+  });
+
+  it('say what was done where a later step failed, and whether the report is open again', async () => {
+    const made = await setup();
+    made.service.endAs = () => Promise.reject(new Error('the database is away'));
+    const blocked = await made.press('block:archive', { ephemeralMessage: true });
+    expect(textOf(asV2(sent(blocked.editReply)))).toBe(
+      'That could not be finished: its maker is blocked, but the meetup is not closed. The ' +
+        'report is open again: try again.',
+    );
+    made.reportStore.failing.add('reopenReport');
+    const stuck = await made.press('close:archive', { ephemeralMessage: true });
+    expect(textOf(asV2(sent(stuck.editReply)))).toBe(
+      'That could not be finished: the meetup is not closed, and the report could not be ' +
+        'opened again. Close the meetup with /delete.',
+    );
+  });
+
+  it('say that a place that is now a pin cannot be refused', async () => {
+    const made = await setup();
+    made.service.placeOf = () => SAFETY_PIN;
+    const refused = await made.press('refuse:archive', { ephemeralMessage: true });
+    expect(textOf(asV2(sent(refused.editReply)))).toBe(
+      'The meetup’s place is now a dropped pin or none, which cannot be refused: nothing ' +
+        'changed, and the report is still open.',
+    );
+  });
+
+  it('say that Discord refused to delete the post, which is archived', async () => {
+    const made = await setup();
+    made.gateway.failing.set('deletePost', new Error('Missing Permissions'));
+    const chosen = await made.press('close:delete', { ephemeralMessage: true });
+    expect(textOf(asV2(sent(chosen.editReply)))).toBe(
+      'Closed: the meetup is over, and its post archived: Discord refused to delete it; delete ' +
+        'it yourself.',
+    );
+  });
+
+  it('take twenty presses a minute of a moderator', async () => {
+    const made = await setup();
+    for (let i = 0; i < 20; i++) await made.press('close');
+    expect(sent((await made.press('close')).reply).content).toMatch(/^That was a lot of clicks/);
+  });
+
+  it('are for staff alone, a refusal uncounted', async () => {
+    const made = await setup();
+    for (let i = 0; i < 25; i++) {
+      const refused = await made.press('dismiss', { roleNames: ['Valor'] });
+      expect(sent(refused.reply).content).toBe('Only admins and moderators can do that.');
+    }
+    expect(sent((await made.press('dismiss')).editReply).content).toBe(
+      'Dismissed: nothing else changes.',
+    );
+  });
+});
diff --git a/src/components/moderation-reports.ts b/src/components/moderation-reports.ts
new file mode 100644
index 00000000..1e1b2c2a
--- /dev/null
+++ b/src/components/moderation-reports.ts
@@ -0,0 +1,234 @@
+import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
+import { mayNotDelete } from '../commands/parties/delete.js';
+import type { ComponentHandler } from '../discord/command.js';
+import { UserError } from '../discord/errors.js';
+import { guildIdOf, requireGuild, requireManagement } from '../discord/guards.js';
+import { answerApart, v2Answer } from '../discord/late-reply.js';
+import { memberInfo } from '../discord/member-info.js';
+import { STALE_COMPONENT } from '../discord/router.js';
+import type { ModerationReport, ReportRemoval } from '../domain/moderation/reports.js';
+import { partyWord } from '../domain/party/party.js';
+import { APPROVED_ACCENT, REFUSED_ACCENT } from '../render/meetup-safety.js';
+import {
+  ENDING_ACTIONS,
+  REPORT_ACTIONS,
+  REPORT_KIND,
+  removalQuestion,
+  type ReportAction,
+} from '../render/moderation.js';
+import { count, memberText, timestamp } from '../render/text.js';
+import { encodeCustomId } from '../discord/custom-id.js';
+import { actionRow, textMessage } from '../render/v2.js';
+import type { ReportDecision } from '../services/moderation-reports.js';
+import { SAFETY_THROTTLE } from './meetup-safety.js';
+
+/** What a report's decision was, for a press that came second. */
+function decidedAs(report: ModerationReport): string {
+  switch (report.status) {
+    case 'closed':
+      return 'closed';
+    case 'refused':
+      return 'the place refused, and the meetup closed';
+    case 'blocked':
+      return 'its maker blocked, and the meetup closed';
+    case 'deleted':
+      return 'the message deleted';
+    case 'dismissed':
+      return 'dismissed';
+    case 'gone':
+      return 'the message was gone';
+    case 'ended':
+    case 'open':
+      return 'it was over';
+  }
+}
+
+/** What the word of a report's subject is: `meetup`, `raid`, `train`, `message`. */
+function wordOf(report: ModerationReport): string {
+  return report.subject.kind === 'party'
+    ? partyWord({ type: report.subject.partyType })
+    : 'message';
+}
+
+const REMOVED: Record<ReportRemoval, string> = {
+  archive: 'archived',
+  delete: 'deleted',
+  denied: 'archived: Discord refused to delete it',
+};
+
+/** What the moderator who pressed is told, privately. */
+export function reportDecisionWords(outcome: ReportDecision): string {
+  switch (outcome.kind) {
+    case 'gone':
+    case 'not-offered':
+      return STALE_COMPONENT;
+    case 'may-not-delete':
+      return mayNotDelete(outcome.forumId);
+    case 'no-place':
+      return (
+        'The meetup’s place is now a dropped pin or none, which cannot be refused: nothing ' +
+        'changed, and the report is still open.'
+      );
+    case 'failed': {
+      const { word } = outcome;
+      const done = [
+        ...(outcome.placeRefused ? ['the place is refused for good'] : []),
+        ...(outcome.blocked ? ['its maker is blocked'] : []),
+      ];
+      if (done.length === 0 && outcome.reopened) {
+        return 'That could not be done: nothing changed, and the report is still open. Try again.';
+      }
+      const notClosed = `${done.length === 0 ? '' : `${done.join(' and ')}, but `}the ${word} is not closed`;
+      return outcome.reopened
+        ? `That could not be finished: ${notClosed}. The report is open again: try again.`
+        : `That could not be finished: ${notClosed}, and the report could not be opened again. ` +
+            `Close the ${word} with /delete.`;
+    }
+    case 'decided-before': {
+      const { report } = outcome;
+      if (report.status === 'ended') {
+        return `This ${wordOf(report)} was over before anybody decided: the report is closed.`;
+      }
+      const who =
+        report.decidedBy === null
+          ? 'A moderator'
+          : memberText({ id: report.decidedBy, name: report.decidedByName ?? undefined });
+      const when = report.decidedAt === null ? '' : ` ${timestamp(report.decidedAt, 'R')}`;
+      return `${who} decided this already${when}: ${decidedAs(report)}.`;
+    }
+    case 'done': {
+      const { report } = outcome;
+      const word = wordOf(report);
+      const post = outcome.refusedDeletion
+        ? 'archived: Discord refused to delete it; delete it yourself'
+        : REMOVED[report.removal ?? 'archive'];
+      switch (report.status) {
+        case 'closed':
+          return `Closed: the ${word} is over, and its post ${post}.`;
+        case 'refused':
+          return (
+            `Refused: no meetup can be held at this place from now on. The meetup is closed, ` +
+            `and its post ${post}.`
+          );
+        case 'blocked': {
+          const closed = `The meetup is closed, and its post ${post}.`;
+          if (outcome.newBlock === false) return `Its maker was blocked already. ${closed}`;
+          const others = outcome.closed ?? 0;
+          const withdrawn = outcome.withdrawn ?? 0;
+          const meetups = others === 0 ? 'no other meetup' : count(others, 'other meetup');
+          const requests = withdrawn === 0 ? 'no request' : count(withdrawn, 'request');
+          return (
+            `Blocked: its maker can no longer create meetups here (${meetups} closed, ` +
+            `${requests} withdrawn). ${closed} They are told, and may appeal.`
+          );
+        }
+        case 'deleted':
+          return 'Deleted: the message is gone.';
+        case 'gone':
+          return 'The message was gone already.';
+        default:
+          return 'Dismissed: nothing else changes.';
+      }
+    }
+  }
+}
+
+/** The private question before an action that ends a party, by the action. */
+function questionOf(action: ReportAction, word: string): string {
+  switch (action) {
+    case 'refuse':
+      return `Refuse this place for good, and close this ${word}?`;
+    case 'block':
+      return `Block its maker from creating meetups here, and close this ${word}?`;
+    default:
+      return `Close this ${word}?`;
+  }
+}
+
+/**
+ * The buttons of a report's post in the moderators' channel (plan 8S-2; custom-id kind
+ * `mreport`): `mreport:<report id>:close|refuse|block|delete|dismiss`, and on the private question
+ * an action that ends a party asks first `mreport:<report id>:<action>:archive|delete`. For staff
+ * alone (`requireManagement`; others are refused privately, uncounted), with the throttle of the
+ * moderators' posts. The report is read from the database, so a post from before a restart
+ * works; the decision is the service's (`ModerationReports.decide`, the first press wins), which
+ * edits the post for everybody; the presser is told privately, in the place of the question.
+ */
+export const reportDecisionControls: ComponentHandler = {
+  kind: REPORT_KIND,
+  guards: [requireGuild, requireManagement],
+  throttle: SAFETY_THROTTLE,
+
+  async button(interaction, id, ctx) {
+    const action = REPORT_ACTIONS.find((one) => one === id.action);
+    if (action === undefined) throw new UserError(STALE_COMPONENT);
+    const [chosen] = id.args;
+    const ending = ENDING_ACTIONS.includes(action);
+    if (ending && chosen === undefined) {
+      // The question first, privately: nothing changes until the moderator chooses.
+      const report = await ctx.reports.reportOf(id.id);
+      if (!report || report.serverId !== guildIdOf(interaction))
+        throw new UserError(STALE_COMPONENT);
+      // Decided already: said at once, no question.
+      if (report.status !== 'open') {
+        throw new UserError(reportDecisionWords({ kind: 'decided-before', report }));
+      }
+      const word = wordOf(report);
+      await interaction.reply({
+        ...v2Answer(
+          removalQuestion(questionOf(action, word), (removal) =>
+            encodeCustomId({ kind: REPORT_KIND, id: id.id, action, args: [removal] }),
+          ),
+        ),
+        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
+      });
+      return;
+    }
+    const removal = chosen === 'archive' || chosen === 'delete' ? chosen : null;
+    if (chosen !== undefined && removal === null) throw new UserError(STALE_COMPONENT);
+    // Ending a party and editing posts take longer than Discord waits for an answer.
+    if (ending) await interaction.deferUpdate();
+    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+    const outcome = await ctx.reports.decide(
+      id.id,
+      action,
+      removal,
+      { id: interaction.user.id, name: memberInfo(interaction).name },
+      guildIdOf(interaction),
+      interaction.guild?.name,
+    );
+    const words = reportDecisionWords(outcome);
+    if (outcome.kind === 'may-not-delete') {
+      // Archive post stays: the moderator may still choose it.
+      await answerApart(
+        interaction,
+        textMessage(
+          REFUSED_ACCENT,
+          [words],
+          [
+            actionRow([
+              {
+                type: ComponentType.Button,
+                style: ButtonStyle.Primary,
+                label: 'Archive post',
+                custom_id: encodeCustomId({
+                  kind: REPORT_KIND,
+                  id: id.id,
+                  action,
+                  args: ['archive'],
+                }),
+              },
+            ]),
+          ],
+        ),
+      );
+      return;
+    }
+    if (ending) {
+      const accent = outcome.kind === 'done' ? APPROVED_ACCENT : REFUSED_ACCENT;
+      await interaction.editReply(v2Answer(textMessage(accent, [words])));
+    } else {
+      await interaction.editReply({ content: words });
+    }
+  },
+};
diff --git a/src/db/repositories/report-repository.ts b/src/db/repositories/report-repository.ts
index bdfcb208..eb56aef5 100644
--- a/src/db/repositories/report-repository.ts
+++ b/src/db/repositories/report-repository.ts
@@ -7,6 +7,7 @@ import {
   type ModerationReport,
   type NewReport,
   type PostRemoval,
+  type ReportRemoval,
   type ReasonAdded,
   type ReportReason,
   type ReportStatus,
@@ -186,6 +187,33 @@ export class ReportRepository implements ReportStore {
     return this.readAll(rows);
   }
 
+  async reopenReport(id: string): Promise<boolean> {
+    const found = await this.report(id);
+    if (!found) return false;
+    try {
+      const [result] = await this.db
+        .updateTable('ModerationReport')
+        .set({
+          status: 'open',
+          openKey: reportTargetKey(found.subject),
+          removal: null,
+          decidedBy: null,
+          decidedByName: null,
+          decidedAt: null,
+        })
+        .where('id', '=', id)
+        .execute();
+      return Number(result?.numUpdatedRows ?? 0) > 0;
+    } catch (err) {
+      if (isDuplicateEntry(err, 'moderationreport_openkey_unique')) return false;
+      throw err;
+    }
+  }
+
+  async setRemoval(id: string, removal: ReportRemoval): Promise<void> {
+    await this.db.updateTable('ModerationReport').set({ removal }).where('id', '=', id).execute();
+  }
+
   async openPartyReports(): Promise<ModerationReport[]> {
     const rows = await this.db
       .selectFrom('ModerationReport')
@@ -253,7 +281,10 @@ export class ReportRepository implements ReportStore {
           subject: subject.data,
           createdAt: Number(row.createdAt),
           status,
-          removal: row.removal === 'archive' || row.removal === 'delete' ? row.removal : null,
+          removal:
+            row.removal === 'archive' || row.removal === 'delete' || row.removal === 'denied'
+              ? row.removal
+              : null,
           channelId: row.channelId,
           messageId: row.messageId,
           decidedBy: row.decidedBy,
diff --git a/src/domain/moderation/reports.ts b/src/domain/moderation/reports.ts
index 0e981f63..e9fdc4d8 100644
--- a/src/domain/moderation/reports.ts
+++ b/src/domain/moderation/reports.ts
@@ -34,6 +34,12 @@ export type ReportStatus = (typeof REPORT_STATUSES)[number];
 /** How a party's post went when a moderator ended the party: archived and locked, or deleted. */
 export type PostRemoval = 'archive' | 'delete';
 
+/**
+ * How a party's post went, as a decided report keeps it: as chosen, or `denied` where Delete
+ * post was chosen and Discord refused to delete it (the post archived instead).
+ */
+export type ReportRemoval = PostRemoval | 'denied';
+
 /** As much as a reason says. */
 export const MAX_REPORT_REASON = 1000;
 
@@ -133,7 +139,7 @@ export interface ModerationReport {
   createdAt: number;
   status: ReportStatus;
   /** How a party's post went, once a moderator ended the party. */
-  removal: PostRemoval | null;
+  removal: ReportRemoval | null;
   /** The moderators' post: null until it is sent. */
   channelId: string | null;
   messageId: string | null;
@@ -191,6 +197,14 @@ export interface ReportStore {
   ): Promise<boolean>;
   /** The open reports of a party (one at most, but a stale one may linger), oldest first. */
   openReportsOfParty(partyId: string): Promise<ModerationReport[]>;
+  /**
+   * Opens a decided report again (a moderator's decision whose work failed, plan 8S-2): open, its
+   * decision forgotten. False when another report of its subject was opened meanwhile (it stays
+   * decided).
+   */
+  reopenReport(id: string): Promise<boolean>;
+  /** How a decided report's party post really went (Discord refused a deletion). */
+  setRemoval(id: string, removal: ReportRemoval): Promise<void>;
   /** The open reports of parties, of every server, oldest first (the sweep). */
   openPartyReports(): Promise<ModerationReport[]>;
   /** The open reports of a server, oldest first. */
diff --git a/src/render/moderation.ts b/src/render/moderation.ts
index 415e5585..4776d645 100644
--- a/src/render/moderation.ts
+++ b/src/render/moderation.ts
@@ -11,6 +11,7 @@ import type {
   ModerationReport,
   PartySubject,
   PostRemoval,
+  ReportRemoval,
   ReportReason,
 } from '../domain/moderation/reports.js';
 import { partyWord } from '../domain/party/party.js';
@@ -73,7 +74,11 @@ function decider(report: ModerationReport): string {
   return `${who}${when}`;
 }
 
-const REMOVED: Record<PostRemoval, string> = { archive: 'archived', delete: 'deleted' };
+const REMOVED: Record<ReportRemoval, string> = {
+  archive: 'archived',
+  delete: 'deleted',
+  denied: 'archived: Discord refused to delete it',
+};
 
 /** What came of a report that is no longer open, as the post's last line. */
 function outcomeLine(report: ModerationReport): string {
diff --git a/src/services/meetup-safety.ts b/src/services/meetup-safety.ts
index d46271ef..d737c26f 100644
--- a/src/services/meetup-safety.ts
+++ b/src/services/meetup-safety.ts
@@ -1,7 +1,7 @@
 import { randomUUID } from 'node:crypto';
 import type { Settings } from '../config/settings.js';
 import type { PartyGateway } from '../discord/party-gateway.js';
-import type { Place } from '../domain/geo/place.js';
+import type { KnownPlace, Place } from '../domain/geo/place.js';
 import type {
   Decider,
   MeetupAppeal,
@@ -10,6 +10,7 @@ import type {
   MeetupSafetyStore,
   RequestDecision,
   RequestSource,
+  RulingSource,
 } from '../domain/meetups/records.js';
 import { isMeetup, type MeetupParty } from '../domain/party/party.js';
 import {
@@ -597,11 +598,36 @@ export class MeetupSafety {
     newBlock: boolean,
     serverName: string | undefined,
   ): Promise<DecideOutcome> {
+    const swept = await this.afterBlock(
+      request.serverId,
+      request.makerId,
+      by,
+      newBlock,
+      serverName,
+    );
+    await this.show(request);
+    return { kind: 'done', request, ...swept };
+  }
+
+  /**
+   * What follows a block, also one from a report's Block maker… (plan 8S-2): the member's
+   * pending requests in the server are withdrawn (their posts edited, nobody told), their active
+   * meetups there closed as `/delete` closes one (archived, with the moderators' line), and they
+   * are told by DM, once (`newBlock`), that they may appeal with `/meetup`. Each step is caught
+   * and logged, so that the DM always comes. `closed` and `withdrawn` count what went.
+   */
+  private async afterBlock(
+    serverId: string,
+    memberId: string,
+    by: Decider,
+    newBlock: boolean,
+    serverName: string | undefined,
+    except?: string,
+  ): Promise<{ closed: number; withdrawn: number }> {
     const { storage, parties, guilds, dms, log } = this.options;
-    // The block is kept: what follows is caught and logged, so the post and the DM always come.
     let withdrawn = 0;
     try {
-      for (const other of await storage.pendingOf(request.serverId, request.makerId)) {
+      for (const other of await storage.pendingOf(serverId, memberId)) {
         if (!(await storage.decideRequest(other.id, 'withdrawn', null, by))) continue;
         withdrawn += 1;
         await this.show({
@@ -614,14 +640,14 @@ export class MeetupSafety {
       }
     } catch (err) {
       log.error(
-        { err, request: request.id },
+        { err, member: memberId },
         'could not withdraw the other requests of a blocked member',
       );
     }
     let closed = 0;
     try {
-      const row = await guilds.idFor(request.serverId);
-      for (const party of this.meetupsOf(row, request.makerId)) {
+      const row = await guilds.idFor(serverId);
+      for (const party of this.meetupsOf(row, memberId).filter((one) => one.id !== except)) {
         try {
           const ended = await parties.end(party.id, undefined, {
             lastWords: CLOSED_BY_MODERATORS,
@@ -632,20 +658,54 @@ export class MeetupSafety {
         }
       }
     } catch (err) {
-      log.error({ err, request: request.id }, 'could not close the meetups of a blocked member');
+      log.error({ err, member: memberId }, 'could not close the meetups of a blocked member');
     }
-    await this.show(request);
     if (newBlock) {
       const now = this.now();
       dms.send({
-        userId: request.makerId,
+        userId: memberId,
         message: blockedDm(serverName),
         priority: DM_PRIORITY.normal,
         eventAt: now,
         expiresAt: now + DAY,
       });
     }
-    return { kind: 'done', request, closed, withdrawn };
+    return { closed, withdrawn };
+  }
+
+  /**
+   * Blocks a member from making meetups in a server outside a request (a report's Block maker…,
+   * plan 8S-2): as Block member on a request does (`afterBlock`), the member's name kept for
+   * `/places`, their meetup `except` left to the caller (a report's, ended as the moderator chose).
+   * `newBlock` false when a block stood already (then nobody is told again). Throws when the
+   * block cannot be kept.
+   */
+  async blockMember(
+    serverId: string,
+    member: { id: string; name: string | null },
+    by: Decider,
+    more: { serverName?: string; except?: string } = {},
+  ): Promise<{ newBlock: boolean; closed: number; withdrawn: number }> {
+    const newBlock = await this.options.storage.addBlock(serverId, member.id, by, member.name);
+    return {
+      newBlock,
+      ...(await this.afterBlock(serverId, member.id, by, newBlock, more.serverName, more.except)),
+    };
+  }
+
+  /**
+   * Refuses a place for good outside a request (a report's Refuse place…, plan 8S-2), with the
+   * post it came from: as Refuse from now on does. Throws when it cannot be kept.
+   */
+  async refusePlace(
+    serverId: string,
+    place: KnownPlace,
+    by: Decider,
+    source: RulingSource,
+  ): Promise<void> {
+    const key = rulingKeyOf(place);
+    if (key !== undefined)
+      await this.options.storage.rule(serverId, key, 'refuse', by, { place, source });
   }
 
   /**
diff --git a/src/services/moderation-reports.decide.test.ts b/src/services/moderation-reports.decide.test.ts
new file mode 100644
index 00000000..c5366415
--- /dev/null
+++ b/src/services/moderation-reports.decide.test.ts
@@ -0,0 +1,279 @@
+import { describe, expect, it } from 'vitest';
+import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { LIBRARY, MODERATOR, SAFETY_PIN } from '../../test/support/meetup-safety-cases.js';
+import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
+import { buttonsOf, textOf } from '../../test/support/messages.js';
+import { ALICE, PARTY_NOW } from '../../test/support/parties.js';
+import { REPORT_SERVER, reportedMeetup } from '../../test/support/reports-service.js';
+import type { ModerationReport } from '../domain/moderation/reports.js';
+import type { ReportAction } from '../render/moderation.js';
+import type { PostRemoval } from '../domain/moderation/reports.js';
+
+const mod = { id: MODERATOR, name: 'Mod' };
+
+/** Alice's meetup, reported by Bob, and a moderator's decision of the report. */
+async function reported() {
+  const made = await reportedMeetup();
+  const outcome = await made.report();
+  if (outcome.kind !== 'sent') throw new Error(outcome.kind);
+  const decide = (
+    action: ReportAction,
+    removal: PostRemoval | null = 'archive',
+    server = REPORT_SERVER,
+  ) => made.reports.decide(outcome.report.id, action, removal, mod, server, 'Pine Town');
+  const stored = async (): Promise<ModerationReport | undefined> =>
+    made.reportStore.report(outcome.report.id);
+  const post = () => made.reportPostOf(outcome.report);
+  return { ...made, decide, stored, post };
+}
+
+describe('ModerationReports: a moderator decides a report of a party', () => {
+  it('closes the meetup and archives its post, saying so in the report’s post', async () => {
+    const made = await reported();
+    const outcome = await made.decide('close', 'archive');
+    expect(outcome).toMatchObject({ kind: 'done' });
+    expect(made.store.get(made.party.id)).toBeUndefined();
+    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
+    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.content).toBe(
+      'This meetup was closed by the moderators.',
+    );
+    expect(made.history.records).toEqual([
+      expect.objectContaining({ partyId: made.party.id, ending: 'cancelled' }),
+    ]);
+    expect(await made.stored()).toMatchObject({
+      status: 'closed',
+      removal: 'archive',
+      decidedBy: MODERATOR,
+      decidedByName: 'Mod',
+    });
+    expect(textOf(made.post())).toContain('**Closed** by **Mod**');
+    expect(buttonsOf(made.post()).map((button) => button.label)).toEqual(['Go to post']);
+  });
+
+  it('deletes the post when asked to, with its link line', async () => {
+    const made = await reported();
+    await made.decide('close', 'delete');
+    expect(made.gateway.deletedPosts).toEqual([made.postId]);
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(textOf(made.post())).toContain('its post is deleted.');
+    expect(buttonsOf(made.post())).toEqual([]);
+  });
+
+  it('refuses the place for good, from the report’s post, and closes the meetup', async () => {
+    const made = await reported();
+    await made.decide('refuse', 'delete');
+    const report = await made.stored();
+    expect(report).toMatchObject({ status: 'refused', removal: 'delete' });
+    expect(
+      await made.storage.rulingRecord(REPORT_SERVER, { kind: 'stop', id: LIBRARY.id }),
+    ).toMatchObject({
+      ruling: 'refuse',
+      ruledBy: MODERATOR,
+      ruledByName: 'Mod',
+      place: LIBRARY,
+      source: {
+        kind: 'report',
+        id: report?.id,
+        channelId: MOD_CHANNEL,
+        messageId: report?.messageId,
+      },
+    });
+    expect(made.store.get(made.party.id)).toBeUndefined();
+    expect(made.gateway.deletedPosts).toEqual([made.postId]);
+  });
+
+  it('blocks the maker: this meetup as chosen, their other meetups archived, one DM', async () => {
+    const made = await reported();
+    const other = await made.service.createMeetup({
+      name: 'Second swap',
+      creatorId: ALICE,
+      creator: { name: 'Alice' },
+      regionChannelId: WEST_CHANNEL,
+      startTime: PARTY_NOW + 48 * 3_600_000,
+    });
+    if (other.kind !== 'created') throw new Error(other.kind);
+    const outcome = await made.decide('block', 'delete');
+    expect(outcome).toMatchObject({ kind: 'done', closed: 1 });
+    expect(await made.storage.block(REPORT_SERVER, ALICE)).toMatchObject({ blockedBy: MODERATOR });
+    expect(made.gateway.deletedPosts).toEqual([made.postId]);
+    expect(made.gateway.posts.get(other.party.forumPostId ?? '')).toMatchObject({ archived: true });
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+    expect(textOf(made.dms.to(ALICE)[0])).toContain('**Pine Town**');
+    expect((await made.stored())?.status).toBe('blocked');
+  });
+
+  it('dismisses: nothing else changes', async () => {
+    const made = await reported();
+    expect(await made.decide('dismiss', null)).toMatchObject({ kind: 'done' });
+    expect(made.store.get(made.party.id)).toBeDefined();
+    expect((await made.stored())?.status).toBe('dismissed');
+    expect(textOf(made.post())).toContain('**Dismissed** by **Mod**');
+  });
+
+  it('lets the first decision win, and tells a later one what it was', async () => {
+    const made = await reported();
+    await made.decide('dismiss', null);
+    const later = await made.decide('close', 'archive');
+    expect(later).toMatchObject({ kind: 'decided-before', report: { status: 'dismissed' } });
+    expect(made.store.get(made.party.id)).toBeDefined();
+  });
+
+  it('keeps the report open where the bot may not delete the post', async () => {
+    const made = await reported();
+    made.gateway.noManaging.add(WEST_FORUM);
+    expect(await made.decide('close', 'delete')).toEqual({
+      kind: 'may-not-delete',
+      forumId: WEST_FORUM,
+    });
+    expect(made.store.get(made.party.id)).toBeDefined();
+    expect((await made.stored())?.status).toBe('open');
+    // Archiving works there.
+    expect(await made.decide('close', 'archive')).toMatchObject({ kind: 'done' });
+  });
+
+  it('says that the party ended first, and takes no report of another server', async () => {
+    const made = await reported();
+    expect(await made.decide('close', 'archive', '412345678901234599')).toEqual({ kind: 'gone' });
+    await made.service.end(made.party.id);
+    await made.reports.flush();
+    expect(await made.decide('close', 'archive')).toMatchObject({
+      kind: 'decided-before',
+      report: { status: 'ended' },
+    });
+  });
+
+  it('lets one of two decisions at the same moment win', async () => {
+    const made = await reported();
+    const both = await Promise.all([made.decide('close', 'archive'), made.decide('dismiss', null)]);
+    expect(both.map((one) => one.kind).sort()).toEqual(['decided-before', 'done']);
+  });
+
+  it('keeps the report open, and says so, when refusing the place fails', async () => {
+    const made = await reported();
+    made.storage.failing.add('rule');
+    expect(await made.decide('refuse', 'archive')).toEqual({
+      kind: 'failed',
+      word: 'meetup',
+      placeRefused: false,
+      blocked: false,
+      reopened: true,
+    });
+    expect(await made.stored()).toMatchObject({ status: 'open', removal: null, decidedBy: null });
+    expect(made.store.get(made.party.id)).toBeDefined();
+    expect(buttonsOf(made.post()).map((button) => button.label)).toContain('Refuse place…');
+    made.storage.failing.delete('rule');
+    expect(await made.decide('refuse', 'archive')).toMatchObject({ kind: 'done' });
+  });
+
+  it('keeps the report open when blocking the maker fails, and when closing the party fails', async () => {
+    const made = await reported();
+    made.storage.failing.add('addBlock');
+    expect(await made.decide('block', 'archive')).toEqual({
+      kind: 'failed',
+      word: 'meetup',
+      placeRefused: false,
+      blocked: false,
+      reopened: true,
+    });
+    expect((await made.stored())?.status).toBe('open');
+    expect(made.store.get(made.party.id)).toBeDefined();
+    made.storage.failing.delete('addBlock');
+    const endAs = made.service.endAs.bind(made.service);
+    made.service.endAs = () => Promise.reject(new Error('the database is away'));
+    expect(await made.decide('close', 'archive')).toEqual({
+      kind: 'failed',
+      word: 'meetup',
+      placeRefused: false,
+      blocked: false,
+      reopened: true,
+    });
+    expect((await made.stored())?.status).toBe('open');
+    made.service.endAs = endAs;
+  });
+
+  it('says what was done where a later step failed, the report open again', async () => {
+    const made = await reported();
+    made.service.endAs = () => Promise.reject(new Error('the database is away'));
+    expect(await made.decide('block', 'archive')).toEqual({
+      kind: 'failed',
+      word: 'meetup',
+      placeRefused: false,
+      blocked: true,
+      reopened: true,
+    });
+    expect(await made.storage.block(REPORT_SERVER, ALICE)).toBeDefined();
+    expect((await made.stored())?.status).toBe('open');
+    expect(await made.decide('refuse', 'archive')).toEqual({
+      kind: 'failed',
+      word: 'meetup',
+      placeRefused: true,
+      blocked: false,
+      reopened: true,
+    });
+  });
+
+  it('says so where the report could not be opened again', async () => {
+    const made = await reported();
+    made.service.endAs = () => Promise.reject(new Error('the database is away'));
+    made.reportStore.failing.add('reopenReport');
+    expect(await made.decide('close', 'archive')).toEqual({
+      kind: 'failed',
+      word: 'meetup',
+      placeRefused: false,
+      blocked: false,
+      reopened: false,
+    });
+  });
+
+  it('refuses no place where the meetup’s place is now a pin, and changes nothing', async () => {
+    const made = await reported();
+    made.service.placeOf = () => SAFETY_PIN;
+    expect(await made.decide('refuse', 'archive')).toEqual({ kind: 'no-place' });
+    expect((await made.stored())?.status).toBe('open');
+    expect(made.store.get(made.party.id)).toBeDefined();
+    expect(await made.storage.rulingRecord(REPORT_SERVER, { kind: 'stop', id: LIBRARY.id })).toBe(
+      undefined,
+    );
+  });
+
+  it('deletes the post of a party that ended between the press and the closing', async () => {
+    const made = await reported();
+    const endAs = made.service.endAs.bind(made.service);
+    made.service.endAs = async (...args) => {
+      await endAs(made.party.id);
+      return endAs(...args);
+    };
+    expect(await made.decide('close', 'delete')).toMatchObject({
+      kind: 'done',
+      report: { status: 'closed', removal: 'delete' },
+    });
+    expect(made.gateway.deletedPosts).toEqual([made.postId]);
+  });
+
+  it('keeps that the post was archived where Discord refused to delete it', async () => {
+    const made = await reported();
+    made.gateway.failing.set('deletePost', new Error('Missing Permissions'));
+    expect(await made.decide('close', 'delete')).toMatchObject({
+      kind: 'done',
+      report: { removal: 'denied' },
+      refusedDeletion: true,
+    });
+    expect((await made.stored())?.removal).toBe('denied');
+    expect(textOf(made.post())).toContain('its post is archived: Discord refused to delete it.');
+    expect(buttonsOf(made.post()).map((button) => button.label)).toEqual(['Go to post']);
+  });
+
+  it('says whether the block is new, and refuses the place as it is now', async () => {
+    const made = await reported();
+    await made.storage.addBlock(REPORT_SERVER, ALICE, { id: MODERATOR, name: 'Mod', at: 1 });
+    expect(await made.decide('block', 'archive')).toMatchObject({ kind: 'done', newBlock: false });
+    expect(made.dms.to(ALICE)).toEqual([]);
+  });
+
+  it('refuses what a report does not offer', async () => {
+    const made = await reported();
+    expect(await made.decide('delete', null)).toEqual({ kind: 'not-offered' });
+    expect(await made.decide('close', null)).toEqual({ kind: 'not-offered' });
+    expect((await made.stored())?.status).toBe('open');
+  });
+});
diff --git a/src/services/moderation-reports.test.ts b/src/services/moderation-reports.test.ts
index 903c61bd..1427feda 100644
--- a/src/services/moderation-reports.test.ts
+++ b/src/services/moderation-reports.test.ts
@@ -4,39 +4,13 @@ import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
 import { buttonsOf, textOf } from '../../test/support/messages.js';
 import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
 import { gymsFixture } from '../../test/support/providers.js';
-import { reportsWith } from '../../test/support/reports-service.js';
-import type { SafetyOptions } from '../../test/support/meetup-safety-service.js';
+import {
+  REPORT_SERVER as SERVER,
+  reportedMeetup,
+  reportsWith,
+} from '../../test/support/reports-service.js';
 import { MAX_REPORT_REASON } from '../domain/moderation/reports.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { LIBRARY } from '../../test/support/meetup-safety-cases.js';
-
-const SERVER = '412345678901234567';
-
-/** A meetup of Alice's at the Little Free Library, with the reports' services. */
-async function reportedMeetup(options: SafetyOptions = {}) {
-  const made = await reportsWith(options);
-  const outcome = await made.service.createMeetup({
-    name: 'Book swap',
-    creatorId: ALICE,
-    creator: { name: 'Alice' },
-    regionChannelId: WEST_CHANNEL,
-    place: LIBRARY,
-    startTime: PARTY_NOW + 24 * 3_600_000,
-    description: 'Bring a book.',
-  });
-  if (outcome.kind !== 'created') throw new Error(outcome.kind);
-  const party = outcome.party;
-  const postId = party.forumPostId ?? '';
-  const report = (reporterId = BOB, reason = 'It is somebody’s front yard.', name = 'Bob') =>
-    made.reports.reportParty({
-      serverId: SERVER,
-      partyId: party.id,
-      reporter: { id: reporterId, name },
-      reason,
-      roleIds: ['300000000000000001'],
-    });
-  return { ...made, party, postId, report };
-}
 
 describe('ModerationReports: a party reported', () => {
   it('sends it privately to the moderators’ channel, and says nothing in the post', async () => {
diff --git a/src/services/moderation-reports.ts b/src/services/moderation-reports.ts
index df6c9e66..9779759d 100644
--- a/src/services/moderation-reports.ts
+++ b/src/services/moderation-reports.ts
@@ -9,17 +9,26 @@ import {
   type ModerationReport,
   reportTargetKey,
   type PartySubject,
+  type PostRemoval,
   type ReportReason,
+  type ReportStatus,
   type ReportStore,
 } from '../domain/moderation/reports.js';
-import { isMeetup, isTrain, type Party } from '../domain/party/party.js';
+import type { Decider } from '../domain/meetups/records.js';
+import { isMeetup, isTrain, partyWord, type Party } from '../domain/party/party.js';
 import { currentStop } from '../domain/party/train.js';
 import { BoundedMap } from '../bounded-map.js';
 import type { Logger } from '../log.js';
-import { reportMessage } from '../render/moderation.js';
+import {
+  ENDING_ACTIONS,
+  reportActions,
+  reportMessage,
+  type ReportAction,
+} from '../render/moderation.js';
+import type { MeetupSafety } from './meetup-safety.js';
 import type { NamedMember } from '../render/text.js';
 import type { GymProvider } from './gym-directory.js';
-import type { PartyService } from './party-service.js';
+import type { PartyService, PostRemoved } from './party-service.js';
 import type { PartyListener, PartyProvider } from './party-store.js';
 import type { RegionProvider } from './region-directory.js';
 
@@ -35,6 +44,37 @@ export interface PartyReportAsk {
   roleIds: readonly string[];
 }
 
+/** What came of a moderator's decision of a report. */
+export type ReportDecision =
+  /** No such report in the presser's server. */
+  | { kind: 'gone' }
+  /** Somebody decided it first, or its party ended: the report as it is. */
+  | { kind: 'decided-before'; report: ModerationReport }
+  /** Not an action this report offers. */
+  | { kind: 'not-offered' }
+  /** Delete post chosen where the bot may not delete posts (Manage Threads): nothing changed. */
+  | { kind: 'may-not-delete'; forumId: string | null }
+  /** Refuse place… where the party's place is now a pin or none: nothing changed. */
+  | { kind: 'no-place' }
+  /**
+   * A step of its work failed (logged): the party not closed; whether its place was refused or
+   * its maker blocked before that, and whether the report is open again (its buttons back).
+   */
+  | { kind: 'failed'; word: string; placeRefused: boolean; blocked: boolean; reopened: boolean }
+  /**
+   * Decided; for Block maker…, whether the block is new and how many other meetups were closed
+   * and requests withdrawn; `refusedDeletion` where Discord refused to delete the post, which is
+   * archived instead.
+   */
+  | {
+      kind: 'done';
+      report: ModerationReport;
+      newBlock?: boolean;
+      closed?: number;
+      withdrawn?: number;
+      refusedDeletion?: boolean;
+    };
+
 /** What came of a report. */
 export type ReportOutcome =
   /** With the moderators: a new report, or a reason more on the open one. */
@@ -59,7 +99,18 @@ export interface ModerationReportsOptions {
   storage: ReportStore;
   /** Meetup safety's gateway (its own in rehearsal mode): the moderators' posts go through it. */
   gateway: Pick<PartyGateway, 'findChannel' | 'sendMessage' | 'editMessage' | 'deleteMessage'>;
-  parties: Pick<PartyService, 'requestDeletion' | 'briefOf' | 'postTitle' | 'placeOf'>;
+  parties: Pick<
+    PartyService,
+    | 'requestDeletion'
+    | 'briefOf'
+    | 'postTitle'
+    | 'placeOf'
+    | 'endAs'
+    | 'mayDeletePost'
+    | 'deletePostOf'
+  >;
+  /** Meetup safety: a place refused for good, a maker blocked (Refuse place…, Block maker…). */
+  safety: Pick<MeetupSafety, 'refusePlace' | 'blockMember'>;
   /** The active parties. */
   store: Pick<PartyProvider, 'get'>;
   regions: Pick<RegionProvider, 'byId'>;
@@ -314,6 +365,171 @@ export class ModerationReports {
     }
   }
 
+  /**
+   * A moderator's decision of a report (a press on its post, or on the private question of an
+   * action that ends a party): one conditional change of the stored report, so the first press
+   * wins (`decided-before`, with the report as it was decided). `close` ends the party, `refuse`
+   * also refuses its place for good (as Refuse from now on, with the report's post as the ruling's
+   * source), `block` also blocks its maker as Block member does (their other meetups archived, one
+   * DM); the party's post is archived or deleted as `removal` says (deleting where the bot may
+   * not is refused before anything changes: `may-not-delete`), and the history records the end
+   * as `/delete`'s (`cancelled`). `dismiss` changes nothing else. The report's post is edited
+   * to the outcome without its buttons. A party that ended first ends the report (`ended`). A
+   * report of another server than the presser's is `gone`; an action it does not offer, or an
+   * ending one without `removal`, `not-offered`; Refuse place… where the place is now a pin or
+   * none, `no-place`. Where a step of the work fails the report is opened again, and `failed`
+   * says what was done before it (a ruling and a block stay) and whether it is open again.
+   * Discord refusing to delete the post leaves it archived, kept as removal `denied`.
+   */
+  async decide(
+    reportId: string,
+    action: ReportAction,
+    removal: PostRemoval | null,
+    moderator: NamedMember,
+    serverId: string,
+    serverName?: string,
+  ): Promise<ReportDecision> {
+    const { storage, parties, store, log } = this.options;
+    const report = await storage.report(reportId);
+    if (!report || report.serverId !== serverId) return { kind: 'gone' };
+    if (report.status !== 'open') return { kind: 'decided-before', report };
+    const ending = ENDING_ACTIONS.includes(action);
+    if (!reportActions(report).includes(action) || (ending && removal === null)) {
+      return { kind: 'not-offered' };
+    }
+    const { subject } = report;
+    const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: this.now() };
+    if (action === 'dismiss') return this.settle(report, 'dismissed', null, by);
+    if (subject.kind !== 'party' || removal === null) return { kind: 'not-offered' };
+    const party = store.get(subject.partyId);
+    if (!party) {
+      // Over before anybody decided, and the listener has not said so yet.
+      await this.partyEnded(subject.partyId);
+      return this.decidedBefore(report);
+    }
+    if (removal === 'delete' && !parties.mayDeletePost(party.id)) {
+      return { kind: 'may-not-delete', forumId: party.forumChannelId };
+    }
+    // What the post shows of the party, and the place refused, as they are now.
+    const now = this.subjectOf(party);
+    // A place that became a pin (or none) since the report has no ruling to make.
+    if (action === 'refuse' && (now.place === null || now.place.kind === 'pin')) {
+      return { kind: 'no-place' };
+    }
+    const status = action === 'refuse' ? 'refused' : action === 'block' ? 'blocked' : 'closed';
+    // The first press wins: the decision is kept first. Its work follows; where a step of it
+    // fails, the report is opened again (its buttons back) and the moderator told.
+    if (!(await storage.decideReport(report.id, status, removal, by))) {
+      return this.decidedBefore(report);
+    }
+    await storage.setSubject(report.id, now).catch((err: unknown) => {
+      log.warn({ err, report: report.id }, 'could not keep what a report shows');
+    });
+    let blocked: { newBlock: boolean; closed: number; withdrawn: number } | undefined;
+    let removed: PostRemoved | false;
+    let placeRefused = false;
+    try {
+      if (action === 'refuse' && now.place !== null && now.place.kind !== 'pin') {
+        const { channelId, messageId } = report;
+        if (channelId === null || messageId === null) throw new Error('the report has no post');
+        await this.options.safety.refusePlace(serverId, now.place, by, {
+          kind: 'report',
+          id: report.id,
+          channelId,
+          messageId,
+        });
+        placeRefused = true;
+      }
+      if (action === 'block') {
+        // The maker's other meetups are closed archived; this one as the moderator chose.
+        blocked = await this.options.safety.blockMember(
+          serverId,
+          { id: now.makerId, name: now.makerName },
+          by,
+          { ...(serverName === undefined ? {} : { serverName }), except: party.id },
+        );
+      }
+      removed = await parties.endAs(party.id, undefined, {
+        lastWords: `This ${partyWord(party)} was closed by the moderators.`,
+        removal,
+      });
+    } catch (err) {
+      log.error({ err, report: report.id }, 'could not carry out a decision of a report');
+      // Opened again for another try (what was done stays: a ruling and a block are kept once).
+      const reopened = await storage.reopenReport(report.id).catch((reopenErr: unknown) => {
+        log.error({ err: reopenErr, report: report.id }, 'could not open a report again');
+        return false;
+      });
+      await this.show(report.id);
+      return {
+        kind: 'failed',
+        word: partyWord(party),
+        placeRefused,
+        blocked: blocked !== undefined,
+        reopened,
+      };
+    }
+    // Over between the press and the closing: Delete post deletes the post all the same.
+    if (removed === false && removal === 'delete' && now.postId !== null) {
+      removed = (await parties.deletePostOf(now.postId)) === 'deleted' ? 'deleted' : 'archived';
+    }
+    const refusedDeletion = removal === 'delete' && removed === 'archived';
+    if (refusedDeletion) {
+      await storage.setRemoval(report.id, 'denied').catch((err: unknown) => {
+        log.warn({ err, report: report.id }, 'could not keep how a reported post went');
+      });
+    }
+    await this.show(report.id);
+    const decided: ModerationReport = {
+      ...report,
+      subject: now,
+      status,
+      removal: refusedDeletion ? 'denied' : removal,
+      decidedBy: by.id,
+      decidedByName: by.name,
+      decidedAt: by.at,
+    };
+    return {
+      kind: 'done',
+      report: decided,
+      ...(blocked ?? {}),
+      ...(refusedDeletion ? { refusedDeletion } : {}),
+    };
+  }
+
+  /** Decides a report that needs nothing else (Dismiss), and shows it. */
+  private async settle(
+    report: ModerationReport,
+    status: Exclude<ReportStatus, 'open'>,
+    removal: PostRemoval | null,
+    by: Decider,
+  ): Promise<ReportDecision> {
+    if (!(await this.options.storage.decideReport(report.id, status, removal, by))) {
+      return this.decidedBefore(report);
+    }
+    const decided: ModerationReport = {
+      ...report,
+      status,
+      removal,
+      decidedBy: by.id,
+      decidedByName: by.name,
+      decidedAt: by.at,
+    };
+    await this.show(report.id);
+    return { kind: 'done', report: decided };
+  }
+
+  /** A decision that came second: the report as the first one left it. */
+  private async decidedBefore(report: ModerationReport): Promise<ReportDecision> {
+    const now = await this.options.storage.report(report.id);
+    return now ? { kind: 'decided-before', report: now } : { kind: 'gone' };
+  }
+
+  /** A report as it is kept; undefined for none. */
+  reportOf(id: string): Promise<ModerationReport | undefined> {
+    return this.options.storage.report(id);
+  }
+
   /** What the moderators' post shows of a party, as it is now. */
   subjectOf(party: Party): PartySubject {
     const { parties, regions } = this.options;
diff --git a/test/support/report-cases.ts b/test/support/report-cases.ts
index 0c329e87..9c44c3db 100644
--- a/test/support/report-cases.ts
+++ b/test/support/report-cases.ts
@@ -161,6 +161,26 @@ export function reportCases(made: () => Promise<ReportStore>): void {
     expect(await store.decideReport(requestId(209), 'dismissed', null, MOD)).toBe(false);
   });
 
+  it('opens a decided report again unless another of its subject is open, and keeps its removal', async () => {
+    const store = await made();
+    await store.addReport(newReport(1), reason());
+    await store.decideReport(requestId(201), 'closed', 'delete', MOD);
+    await store.setRemoval(requestId(201), 'denied');
+    expect(await store.report(requestId(201))).toMatchObject({ removal: 'denied' });
+    expect(await store.reopenReport(requestId(201))).toBe(true);
+    expect(await store.report(requestId(201))).toMatchObject({
+      status: 'open',
+      removal: null,
+      decidedBy: null,
+    });
+    // Open again: a reason joins it.
+    expect((await store.addReport(newReport(2), reason(OTHER_REPORTER))).kind).toBe('added');
+    await store.decideReport(requestId(201), 'dismissed', null, MOD);
+    await store.addReport(newReport(3), reason());
+    expect(await store.reopenReport(requestId(201))).toBe(false);
+    expect((await store.report(requestId(201)))?.status).toBe('dismissed');
+  });
+
   it('lists the open reports of a server and of a party, and those never posted', async () => {
     const store = await made();
     await store.addReport(newReport(1, partySubject(), { createdAt: SAFETY_NOW + 2 }), reason());
diff --git a/test/support/reports-service.ts b/test/support/reports-service.ts
index 3f86e163..69244b54 100644
--- a/test/support/reports-service.ts
+++ b/test/support/reports-service.ts
@@ -4,6 +4,9 @@ import { ModerationReports } from '../../src/services/moderation-reports.js';
 import { meetupSafetyWith, MOD_CHANNEL, type SafetyOptions } from './meetup-safety-service.js';
 import type { ServiceOverrides } from './party-service.js';
 import { MemoryReports } from './reports.js';
+import { WEST_CHANNEL } from './gyms.js';
+import { LIBRARY } from './meetup-safety-cases.js';
+import { ALICE, BOB, PARTY_NOW } from './parties.js';
 
 /**
  * Reports to the moderators over the services of `meetupSafetyWith` (the fake gateway with the
@@ -22,6 +25,7 @@ export async function reportsWith(
     storage: reportStore,
     gateway: made.gateway,
     parties: made.service,
+    safety: made.safety,
     store: made.store,
     regions: made.regions,
     gyms: made.gyms,
@@ -34,3 +38,35 @@ export async function reportsWith(
     made.gateway.messagesIn(MOD_CHANNEL).find((sent) => sent.id === report.messageId)?.message;
   return { ...made, reportStore, reports, reportPostOf };
 }
+
+/** The server of the fakes, as the reports name it. */
+export const REPORT_SERVER = '412345678901234567';
+
+/**
+ * `reportsWith`, and a meetup of Alice's at the Little Free Library (a PokéStop) a day ahead,
+ * with `report(reporterId?, reason?, name?)`, a member's report of it (Bob's by default).
+ */
+export async function reportedMeetup(options: SafetyOptions = {}) {
+  const made = await reportsWith(options);
+  const outcome = await made.service.createMeetup({
+    name: 'Book swap',
+    creatorId: ALICE,
+    creator: { name: 'Alice' },
+    regionChannelId: WEST_CHANNEL,
+    place: LIBRARY,
+    startTime: PARTY_NOW + 24 * 3_600_000,
+    description: 'Bring a book.',
+  });
+  if (outcome.kind !== 'created') throw new Error(outcome.kind);
+  const party = outcome.party;
+  const postId = party.forumPostId ?? '';
+  const report = (reporterId = BOB, reason = 'It is somebody’s front yard.', name = 'Bob') =>
+    made.reports.reportParty({
+      serverId: REPORT_SERVER,
+      partyId: party.id,
+      reporter: { id: reporterId, name },
+      reason,
+      roleIds: ['300000000000000001'],
+    });
+  return { ...made, party, postId, report };
+}
diff --git a/test/support/reports.ts b/test/support/reports.ts
index 43c316fa..4f5a5670 100644
--- a/test/support/reports.ts
+++ b/test/support/reports.ts
@@ -5,6 +5,7 @@ import {
   type ModerationReport,
   type NewReport,
   type PostRemoval,
+  type ReportRemoval,
   type ReasonAdded,
   type ReportReason,
   type ReportStatus,
@@ -115,6 +116,32 @@ export class MemoryReports implements ReportStore {
     );
   }
 
+  async reopenReport(id: string) {
+    await this.check('reopenReport');
+    const found = this.reports.get(id);
+    if (!found) return false;
+    const key = reportTargetKey(found.subject);
+    const taken = [...this.reports.values()].some(
+      (one) => one.id !== id && one.status === 'open' && reportTargetKey(one.subject) === key,
+    );
+    if (taken) return false;
+    this.reports.set(id, {
+      ...found,
+      status: 'open',
+      removal: null,
+      decidedBy: null,
+      decidedByName: null,
+      decidedAt: null,
+    });
+    return true;
+  }
+
+  async setRemoval(id: string, removal: ReportRemoval) {
+    await this.check('setRemoval');
+    const found = this.reports.get(id);
+    if (found) this.reports.set(id, { ...found, removal });
+  }
+
   async openPartyReports() {
     await this.check('openPartyReports');
     return this.sorted((one) => one.status === 'open' && one.subject.kind === 'party');
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index e07ef4b7..7007fe94 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -208,6 +208,7 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
         'pass { reports } from reportsWith()',
       ),
       parties: ctx.partyService,
+      safety: ctx.meetupSafety,
       store: ctx.parties,
       regions: ctx.regions,
       gyms: ctx.gyms,
````

### Task 5: Plan 8S-2 T5: Report to moderators in the Apps menu: parties and single messages

Prototype commit: `de7c762bafc8001197a49d466202d21bef4427c4`

The message command reports the party of a post, a copy of it or its link line with
/report's form; the bot's other messages have nothing to report; any other message is
reported alone, with a copy of its text, its attachments' names, its author, channel and
time (the party named when it is in a party's post). Delete message claims the report
first, then deletes the message (gone when it was deleted first; where the bot lacks Manage
Messages, or the deletion fails, the report is opened again); an archived post is archived
again as it was, also when the deletion fails. Refused without a moderators' channel.

**Files:**

```
 src/commands/index.ts                           |   3 +-
 src/commands/parties/report-message.test.ts     | 132 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/parties/report-message.ts          | 144 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/parties/report.ts                  |   9 +++-
 src/components/moderation-reports.test.ts       |  61 ++++++++++++++++++++++++---
 src/components/moderation-reports.ts            |  15 ++++---
 src/db/repositories/report-repository.ts        |   9 ++++
 src/discord/party-gateway.test.ts               |  73 ++++++++++++++++++++++++++++++++
 src/discord/party-gateway.ts                    |  31 ++++++++++++++
 src/domain/moderation/reports.ts                |   5 +++
 src/render/moderation.test.ts                   |  21 ++++++++++
 src/render/moderation.ts                        |  29 +++++++++++--
 src/services/moderation-reports.message.test.ts | 144 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/moderation-reports.ts              | 117 +++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/services/rehearsal.test.ts                  |  13 ++++++
 src/services/rehearsal.ts                       |  14 ++++++-
 test/support/fake-gateway.ts                    |  20 +++++++++
 test/support/report-cases.ts                    |  10 +++++
 test/support/reports.ts                         |   6 +++
 19 files changed, 838 insertions(+), 18 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/parties/report-message.test.ts src/components/moderation-reports.test.ts src/discord/party-gateway.test.ts src/render/moderation.test.ts src/services/moderation-reports.message.test.ts src/services/rehearsal.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff de7c762bafc8001197a49d466202d21bef4427c4 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-2 T5: Report to moderators in the Apps menu: parties and single messages`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/commands/index.ts b/src/commands/index.ts
index e7334870..9a1e711c 100644
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -19,6 +19,7 @@ import {
 import { group } from './parties/group.js';
 import { deleteParty } from './parties/delete.js';
 import { report } from './parties/report.js';
+import { reportMessageCommand } from './parties/report-message.js';
 import { cancelMeet, meet } from './parties/meet.js';
 import { name } from './parties/name.js';
 import { target, targets, untarget, untargetAll } from './notifications/targets.js';
@@ -52,7 +53,7 @@ import { leagueRanks, rank } from './util/rank.js';
  * Every message command (Discord's Apps menu on a message; plan 8S-2), five at most. The router,
  * the deploy script and `/help` read this list beside `commands`.
  */
-export const messageCommands: readonly MessageCommand[] = [];
+export const messageCommands: readonly MessageCommand[] = [reportMessageCommand];
 
 /** Every slash command. The router and the deploy script both read this list. */
 export const commands: readonly CommandModule[] = [
diff --git a/src/commands/parties/report-message.test.ts b/src/commands/parties/report-message.test.ts
new file mode 100644
index 00000000..5cc8193e
--- /dev/null
+++ b/src/commands/parties/report-message.test.ts
@@ -0,0 +1,132 @@
+import { MessageFlags } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import {
+  FAKE_BOT_ID,
+  fakeMessageCommand,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+  type FakeTargetMessage,
+} from '../../../test/support/fake-interactions.js';
+import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
+import { MOD_CHANNEL, type SafetyOptions } from '../../../test/support/meetup-safety-service.js';
+import { textOf } from '../../../test/support/messages.js';
+import { BOB } from '../../../test/support/parties.js';
+import { reportedMeetup } from '../../../test/support/reports-service.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { decodeCustomId } from '../../discord/custom-id.js';
+import { EXPIRED } from '../../services/pending-requests.js';
+import { partyReportForm, REPORT_REASON_INPUT, REPORT_SENT, reportControls } from './report.js';
+import { NOTHING_TO_REPORT, reportMessageCommand } from './report-message.js';
+
+const DAVE = '200000000000000005';
+
+async function setup(options: SafetyOptions = {}) {
+  const made = await reportedMeetup(options);
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    parties: made.store,
+    regions: made.regions,
+    reports: made.reports,
+    meetupSafety: made.safety,
+  });
+  const router = new InteractionRouter(ctx, [reportMessageCommand], [reportControls]);
+  const handle = async <I extends FakeInteraction>(interaction: I) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  /** The Apps menu's entry used by Bob on this message, in its channel. */
+  const use = (target: FakeTargetMessage, extra: object = {}) =>
+    handle(
+      fakeMessageCommand({
+        userId: BOB,
+        displayName: 'Bob',
+        channelId: target.channelId ?? WEST_CHANNEL,
+        targetMessage: target,
+        ...extra,
+      }),
+    );
+  /** The form the entry opened, sent by Bob with this reason. */
+  const submit = (opened: FakeInteraction, reason: string, userId = BOB) => {
+    const form = opened.showModal.mock.calls[0]?.[0] as { custom_id: string };
+    return handle(
+      fakeModal({
+        customId: form.custom_id,
+        form,
+        userId,
+        displayName: 'Bob',
+        fields: { [REPORT_REASON_INPUT]: reason },
+      }),
+    );
+  };
+  return { ...made, use, submit, handle };
+}
+
+describe('Report to moderators (the Apps menu of a message)', () => {
+  it('reports the party of its post, of a copy of it, and of its link line', async () => {
+    const made = await setup();
+    await made.service.showStatus(made.party.id);
+    await made.service.flush();
+    const copy = made.store.get(made.party.id)?.mirrorMessages[0];
+    if (!copy) throw new Error('no copy');
+    const targets: FakeTargetMessage[] = [
+      { id: made.postId, channelId: made.postId, authorId: FAKE_BOT_ID },
+      { id: copy.messageId, channelId: copy.channelId, authorId: FAKE_BOT_ID },
+      { id: made.party.regionLinkMessageId ?? '', channelId: WEST_CHANNEL, authorId: FAKE_BOT_ID },
+    ];
+    for (const target of targets) {
+      const used = await made.use(target);
+      expect(used.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
+    }
+  });
+
+  it('has nothing to report on another message of the bot', async () => {
+    const made = await setup();
+    const used = await made.use({ id: '800000000000000009', authorId: FAKE_BOT_ID });
+    expect(sent(used.reply)).toEqual({ content: NOTHING_TO_REPORT, flags: MessageFlags.Ephemeral });
+  });
+
+  it('keeps one message a member is about to report: their newer form replaces the older', async () => {
+    const made = await setup();
+    const first = await made.use({ id: '800000000000000001', authorId: DAVE, content: 'One.' });
+    const second = await made.use({ id: '800000000000000002', authorId: DAVE, content: 'Two.' });
+    expect(sent((await made.submit(first, 'Old form.')).reply).content).toBe(EXPIRED);
+    expect(sent((await made.submit(second, 'New form.')).editReply).content).toBe(REPORT_SENT);
+    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain('Two.');
+  });
+
+  it('reports a member’s message with a copy of it, also one in a party’s post', async () => {
+    const made = await setup();
+    const used = await made.use(
+      {
+        id: '800000000000000001',
+        channelId: made.postId,
+        authorId: DAVE,
+        authorName: 'Dave',
+        content: 'Come to my house, 12 Elm Street.',
+        attachments: ['door.jpg'],
+      },
+      { thread: { parentId: WEST_FORUM } },
+    );
+    const form = used.showModal.mock.calls[0]?.[0] as { custom_id: string; title: string };
+    expect(decodeCustomId(form.custom_id)).toMatchObject({ kind: 'report', action: 'message' });
+    expect(form.title).toBe('Report this message to the moderators');
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
+    const submitted = await made.submit(used, 'A home address.');
+    expect(sent(submitted.editReply).content).toBe(REPORT_SENT);
+    const text = textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message);
+    expect(text).toContain(`Written by **Dave** (<@${DAVE}>) in <#${made.postId}>, in the post of`);
+    expect(text).toContain('Come to my house, 12 Elm Street.');
+    expect(text).toContain('**Attachments**: door.jpg');
+    // The form is used once.
+    expect(sent((await made.submit(used, 'Again.')).reply).content).toBe(EXPIRED);
+  });
+
+  it('refuses a message where the server has no moderators’ channel', async () => {
+    const made = await setup({ moderation: null });
+    const used = await made.use({ id: '800000000000000001', authorId: DAVE });
+    expect(sent(used.reply).content).toBe("This server has no moderators' channel.");
+  });
+});
diff --git a/src/commands/parties/report-message.ts b/src/commands/parties/report-message.ts
new file mode 100644
index 00000000..e7c7d32f
--- /dev/null
+++ b/src/commands/parties/report-message.ts
@@ -0,0 +1,144 @@
+import {
+  ApplicationCommandType,
+  ContextMenuCommandBuilder,
+  MessageFlags,
+  type ModalSubmitInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import { BoundedMap } from '../../bounded-map.js';
+import { channelContext } from '../../discord/channel-context.js';
+import type { MessageCommand } from '../../discord/command.js';
+import { UserError } from '../../discord/errors.js';
+import { guildIdOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
+import { memberInfo } from '../../discord/member-info.js';
+import type { Party } from '../../domain/party/party.js';
+import type { MessageReportAsk } from '../../services/moderation-reports.js';
+import type { PartyProvider } from '../../services/party-store.js';
+import { EXPIRED, PendingRequests } from '../../services/pending-requests.js';
+import {
+  messageReportForm,
+  NO_MODERATORS,
+  partyReportForm,
+  REPORT_REASON_INPUT,
+  reportAnswer,
+} from './report.js';
+
+/** The name of the entry in the Apps menu of a message (the design's words). */
+export const REPORT_MESSAGE_NAME = 'Report to moderators';
+
+/** What a member is told who uses it on a message of the bot that is no party's (the design's words). */
+export const NOTHING_TO_REPORT = 'Nothing to report there.';
+
+/** How long the form of a message's report may stay open: the message is kept that long. */
+const FORM_MS = 30 * 60_000;
+
+/** A reported message, kept between the Apps menu and its form. */
+type PendingMessage = Omit<MessageReportAsk, 'reporter' | 'reason'>;
+
+const pending = new PendingRequests<PendingMessage>({ ttlMs: FORM_MS });
+
+/**
+ * By member: the token of the message they are about to report. One each: a member's newer form
+ * replaces the older, so that one member cannot push everybody else's out of `pending`.
+ */
+const tokens = new BoundedMap<string, string>(1_000);
+
+/**
+ * The party a message stands for: the first message of its post (whose id is the post's), a
+ * copy of it in another channel (`mirrorMessages`), or the line in its region's channel that
+ * links to it. Undefined for any other message.
+ */
+export function partyOfMessage(
+  parties: Pick<PartyProvider, 'active'>,
+  channelId: string,
+  messageId: string,
+): Party | undefined {
+  return parties
+    .active()
+    .find(
+      (party) =>
+        (party.forumPostId === messageId && channelId === messageId) ||
+        party.regionLinkMessageId === messageId ||
+        party.mirrorMessages.some(
+          (copy) => copy.channelId === channelId && copy.messageId === messageId,
+        ),
+    );
+}
+
+/**
+ * "Report to moderators" in the Apps menu of a message (plan 8S-2): on a party's post, a copy of
+ * it or its link line, the party's report (`/report`'s form); on any other message of the bot,
+ * `NOTHING_TO_REPORT`; on anybody else's (also a member's in a party's post), a report of that
+ * message alone, kept for its form under a token for half an hour. Discord sends the message,
+ * text included, with the interaction: no intent is needed. Without a moderators' channel a
+ * message cannot be reported (`NO_MODERATORS`). Counted on the form's submit, in `/report`'s
+ * window (`reportControls`).
+ */
+export const reportMessageCommand: MessageCommand = {
+  target: 'message',
+  data: new ContextMenuCommandBuilder()
+    .setName(REPORT_MESSAGE_NAME)
+    .setType(ApplicationCommandType.Message),
+  help: {
+    category: 'raid-crud',
+    description: 'Tell the moderators privately about a message, or about a raid, train or meetup',
+    details:
+      'On the post of a raid, train or meetup (or its copy, or its line in the region channel) ' +
+      'it reports that party, as `/report` does. On any other message it reports that message ' +
+      'alone: the moderators see who wrote it, where and when, and a copy of what it said. A ' +
+      'form asks what is wrong; only the moderators read it.',
+  },
+  guards: [requireGuild],
+  async run(interaction, ctx) {
+    const target = interaction.targetMessage;
+    const party = partyOfMessage(ctx.parties, target.channelId, target.id);
+    if (party) {
+      await interaction.showModal(partyReportForm(party));
+      return;
+    }
+    if (target.author.id === interaction.client.user.id) throw new UserError(NOTHING_TO_REPORT);
+    if (!ctx.reports.on) throw new UserError(NO_MODERATORS);
+    const inPost = ctx.parties.byPost(target.channelId);
+    const where = channelContext(interaction);
+    // The member's older form, if any, expires.
+    const older = tokens.get(interaction.user.id);
+    if (older !== undefined) pending.take(older, interaction.user.id);
+    const token = pending.put(interaction.user.id, {
+      serverId: guildIdOf(interaction),
+      message: {
+        channelId: target.channelId,
+        messageId: target.id,
+        authorId: target.author.id,
+        authorName:
+          target.member?.displayName ?? target.author.globalName ?? target.author.username,
+        sentAt: target.createdTimestamp,
+        text: target.content,
+        attachments: [...target.attachments.values()].map((attachment) => attachment.name),
+      },
+      partyTitle: inPost ? ctx.partyService.postTitle(inPost) : null,
+      nearChannelId: regionChannelOf(interaction, ctx) ?? where.baseChannelId ?? target.channelId,
+    });
+    tokens.set(interaction.user.id, token);
+    await interaction.showModal(messageReportForm(token));
+  },
+};
+
+/** The form of a message's report: the message kept under its token goes to the moderators. */
+export async function submitMessageReport(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  token: string,
+): Promise<void> {
+  const reason = interaction.fields.getTextInputValue(REPORT_REASON_INPUT);
+  const taken = pending.take(token, interaction.user.id);
+  if (taken === 'expired' || taken === 'not-yours') throw new UserError(EXPIRED);
+  // A custom id can be sent from anywhere: a message of another server is none here.
+  if (taken.value.serverId !== guildIdOf(interaction)) throw new UserError(EXPIRED);
+  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+  const outcome = await ctx.reports.reportMessage({
+    ...taken.value,
+    reporter: { id: interaction.user.id, name: memberInfo(interaction).name },
+    reason,
+  });
+  await interaction.editReply({ content: reportAnswer(outcome, 'message') });
+}
diff --git a/src/commands/parties/report.ts b/src/commands/parties/report.ts
index fb9e34d3..541352c3 100644
--- a/src/commands/parties/report.ts
+++ b/src/commands/parties/report.ts
@@ -17,6 +17,7 @@ import type { Throttle } from '../../discord/throttle.js';
 import { MAX_REPORT_REASON } from '../../domain/moderation/reports.js';
 import { partyWord, type Party } from '../../domain/party/party.js';
 import type { ReportOutcome } from '../../services/moderation-reports.js';
+import { submitMessageReport } from './report-message.js';
 import { commandParty, partyOver } from './reply.js';
 
 /** The name of `/report`, in whose window every report is counted (the Apps menu's too). */
@@ -39,6 +40,8 @@ export const REPORT_REASON_INPUT = 'reason';
 export const REPORT_SENT = 'Sent to the moderators.';
 /** What a member is told who reported the same party or message before (the design's words). */
 export const REPORT_ALREADY = 'You already reported this.';
+/** Said of a message reported where the server has no moderators' channel (the design's words). */
+export const NO_MODERATORS = "This server has no moderators' channel.";
 const REPORT_NOT_SENT = 'I could not send your report to the moderators. Try again later.';
 const NO_REASON = 'Say what is wrong, so that the moderators know what to look at.';
 
@@ -105,6 +108,8 @@ export function reportAnswer(outcome: ReportOutcome, word: string): string {
       throw new UserError(NO_REASON);
     case 'not-sent':
       throw new UserError(REPORT_NOT_SENT);
+    case 'no-channel':
+      throw new UserError(NO_MODERATORS);
   }
 }
 
@@ -173,7 +178,8 @@ export const report: SimpleCommand = {
 };
 
 /**
- * The forms of reports (kind `report`): a party's (`report:<party id>:party`). Five an hour,
+ * The forms of reports (kind `report`): a party's (`report:<party id>:party`) and a message's
+ * (`report:<token>:message`). Five an hour,
  * counted in `/report`'s window whichever way the form was opened (`as`); a reason of white
  * space alone is refused uncounted.
  */
@@ -183,6 +189,7 @@ export const reportControls: ComponentHandler = {
   throttle: () => ({ ...REPORT_THROTTLE, as: REPORT_COMMAND }),
   async modal(interaction, id, ctx) {
     if (id.action === 'party') return submitPartyReport(interaction, ctx, id.id);
+    if (id.action === 'message') return submitMessageReport(interaction, ctx, id.id);
     throw new UserError(STALE_COMPONENT);
   },
 };
diff --git a/src/components/moderation-reports.test.ts b/src/components/moderation-reports.test.ts
index fedb29e8..8b7f1120 100644
--- a/src/components/moderation-reports.test.ts
+++ b/src/components/moderation-reports.test.ts
@@ -6,14 +6,14 @@ import {
   sent,
   type FakeInteraction,
 } from '../../test/support/fake-interactions.js';
-import { WEST_FORUM } from '../../test/support/gyms.js';
 import { SAFETY_PIN } from '../../test/support/meetup-safety-cases.js';
+import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
 import { buttonsOf, textOf } from '../../test/support/messages.js';
 import { reportedMeetup } from '../../test/support/reports-service.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import { InteractionRouter } from '../discord/router.js';
-import { reportDecisionControls } from './moderation-reports.js';
+import { reportDecisionControls, reportDecisionWords } from './moderation-reports.js';
 
 async function setup() {
   const made = await reportedMeetup();
@@ -28,9 +28,13 @@ async function setup() {
   });
   const router = new InteractionRouter(ctx, [], [reportDecisionControls]);
   const id = outcome.report.id;
-  const press = async (action: string, extra: object = {}): Promise<FakeInteraction> => {
+  const pressOn = async (
+    reportId: string,
+    action: string,
+    extra: object = {},
+  ): Promise<FakeInteraction> => {
     const interaction = fakeButton({
-      customId: `mreport:${id}:${action}`,
+      customId: `mreport:${reportId}:${action}`,
       userId: '200000000000000009',
       displayName: 'Mod',
       roleNames: ['Moderator'],
@@ -41,7 +45,8 @@ async function setup() {
     await router.handle(interaction as never);
     return interaction;
   };
-  return { ...made, id, press };
+  const press = (action: string, extra: object = {}) => pressOn(id, action, extra);
+  return { ...made, id, press, pressOn };
 }
 
 describe('the buttons of a report’s post', () => {
@@ -133,6 +138,22 @@ describe('the buttons of a report’s post', () => {
     );
   });
 
+  it('say that a message could not be deleted, and whether its report is open again', () => {
+    const failed = {
+      kind: 'failed',
+      word: 'message',
+      placeRefused: false,
+      blocked: false,
+    } as const;
+    expect(reportDecisionWords({ ...failed, reopened: true })).toBe(
+      'That could not be done: nothing changed, and the report is still open. Try again.',
+    );
+    expect(reportDecisionWords({ ...failed, reopened: false })).toBe(
+      'That could not be finished: the message is not deleted, and the report could not be ' +
+        'opened again. Delete the message yourself.',
+    );
+  });
+
   it('say that a place that is now a pin cannot be refused', async () => {
     const made = await setup();
     made.service.placeOf = () => SAFETY_PIN;
@@ -159,6 +180,36 @@ describe('the buttons of a report’s post', () => {
     expect(sent((await made.press('close')).reply).content).toMatch(/^That was a lot of clicks/);
   });
 
+  it('delete a reported message, and say where the bot may not', async () => {
+    const made = await setup();
+    const reported = await made.reports.reportMessage({
+      serverId: made.gateway.guildId,
+      message: {
+        channelId: WEST_CHANNEL,
+        messageId: '800000000000000001',
+        authorId: '200000000000000005',
+        authorName: 'Dave',
+        sentAt: 1,
+        text: 'Hurtful.',
+        attachments: [],
+      },
+      partyTitle: null,
+      nearChannelId: WEST_CHANNEL,
+      reporter: { id: '200000000000000003', name: 'Bob' },
+      reason: 'Rude.',
+    });
+    if (reported.kind !== 'sent') throw new Error(reported.kind);
+    made.gateway.noManaging.add(WEST_CHANNEL);
+    const refused = await made.pressOn(reported.report.id, 'delete');
+    expect(sent(refused.editReply).content).toBe(
+      `I can't delete messages in <#${WEST_CHANNEL}>; delete it yourself.`,
+    );
+    made.gateway.noManaging.delete(WEST_CHANNEL);
+    const deleted = await made.pressOn(reported.report.id, 'delete');
+    expect(sent(deleted.editReply).content).toBe('Deleted: the message is gone.');
+    expect(made.gateway.deleted.map((one) => one.messageId)).toContain('800000000000000001');
+  });
+
   it('are for staff alone, a refusal uncounted', async () => {
     const made = await setup();
     for (let i = 0; i < 25; i++) {
diff --git a/src/components/moderation-reports.ts b/src/components/moderation-reports.ts
index 1e1b2c2a..11531b66 100644
--- a/src/components/moderation-reports.ts
+++ b/src/components/moderation-reports.ts
@@ -78,12 +78,17 @@ export function reportDecisionWords(outcome: ReportDecision): string {
       if (done.length === 0 && outcome.reopened) {
         return 'That could not be done: nothing changed, and the report is still open. Try again.';
       }
-      const notClosed = `${done.length === 0 ? '' : `${done.join(' and ')}, but `}the ${word} is not closed`;
-      return outcome.reopened
-        ? `That could not be finished: ${notClosed}. The report is open again: try again.`
-        : `That could not be finished: ${notClosed}, and the report could not be opened again. ` +
-            `Close the ${word} with /delete.`;
+      const message = word === 'message';
+      const but = done.length === 0 ? '' : `${done.join(' and ')}, but `;
+      const left = `${but}the ${word} is not ${message ? 'deleted' : 'closed'}`;
+      if (outcome.reopened) {
+        return `That could not be finished: ${left}. The report is open again: try again.`;
+      }
+      const yourself = message ? 'Delete the message yourself.' : `Close the ${word} with /delete.`;
+      return `That could not be finished: ${left}, and the report could not be opened again. ${yourself}`;
     }
+    case 'may-not-delete-message':
+      return `I can't delete messages in <#${outcome.channelId}>; delete it yourself.`;
     case 'decided-before': {
       const { report } = outcome;
       if (report.status === 'ended') {
diff --git a/src/db/repositories/report-repository.ts b/src/db/repositories/report-repository.ts
index eb56aef5..e3b20c1d 100644
--- a/src/db/repositories/report-repository.ts
+++ b/src/db/repositories/report-repository.ts
@@ -210,6 +210,15 @@ export class ReportRepository implements ReportStore {
     }
   }
 
+  async markGone(id: string): Promise<void> {
+    await this.db
+      .updateTable('ModerationReport')
+      .set({ status: 'gone' })
+      .where('id', '=', id)
+      .where('status', '=', 'deleted')
+      .execute();
+  }
+
   async setRemoval(id: string, removal: ReportRemoval): Promise<void> {
     await this.db.updateTable('ModerationReport').set({ removal }).where('id', '=', id).execute();
   }
diff --git a/src/discord/party-gateway.test.ts b/src/discord/party-gateway.test.ts
index 97b7b026..b6030b40 100644
--- a/src/discord/party-gateway.test.ts
+++ b/src/discord/party-gateway.test.ts
@@ -881,3 +881,76 @@ describe('DiscordPartyGateway: an overwrite of a member that keeps them out of a
     await expect(away.ownViewDenied('c', ALICE)).rejects.toThrow('Discord is away');
   });
 });
+
+describe('DiscordPartyGateway: a reported message deleted', () => {
+  function gatewayOver(fetch: () => Promise<unknown>) {
+    const gateway = new DiscordPartyGateway();
+    gateway.use({ channels: { fetch } } as unknown as Client);
+    return gateway;
+  }
+  /** A post (a thread) with one message, locked when archived unless said otherwise. */
+  function post(archived: boolean, locked = archived, refusal?: RESTJSONErrorCodes) {
+    const calls: string[] = [];
+    const thread = {
+      archived,
+      locked,
+      isTextBased: () => true,
+      isThread: () => true,
+      setArchived: (value: boolean) => {
+        calls.push(`archived ${String(value)}`);
+        thread.archived = value;
+        return Promise.resolve(thread);
+      },
+      edit: (options: { archived?: boolean; locked?: boolean }) => {
+        calls.push(`edit ${JSON.stringify(options)}`);
+        return Promise.resolve(thread);
+      },
+      messages: {
+        delete: () => {
+          if (thread.archived) return Promise.reject(apiError(RESTJSONErrorCodes.ThreadLocked));
+          if (refusal !== undefined) return Promise.reject(apiError(refusal));
+          calls.push('delete');
+          return Promise.resolve();
+        },
+      },
+    };
+    return { thread, calls };
+  }
+
+  it('opens an archived post for the deletion and archives and locks it again', async () => {
+    const { thread, calls } = post(true);
+    const gateway = gatewayOver(() => Promise.resolve(thread));
+    await expect(gateway.deleteReported('p', 'm')).resolves.toBe('deleted');
+    expect(calls).toEqual(['archived false', 'delete', 'edit {"locked":true,"archived":true}']);
+  });
+
+  it('archives a post again as it was, unlocked, and also where Discord refuses the deletion', async () => {
+    const unlocked = post(true, false);
+    await expect(
+      gatewayOver(() => Promise.resolve(unlocked.thread)).deleteReported('p', 'm'),
+    ).resolves.toBe('deleted');
+    expect(unlocked.calls).toEqual([
+      'archived false',
+      'delete',
+      'edit {"locked":false,"archived":true}',
+    ]);
+    const refused = post(true, true, RESTJSONErrorCodes.MissingPermissions);
+    await expect(
+      gatewayOver(() => Promise.resolve(refused.thread)).deleteReported('p', 'm'),
+    ).resolves.toBe('not-allowed');
+    expect(refused.calls).toEqual(['archived false', 'edit {"locked":true,"archived":true}']);
+  });
+
+  it('deletes in an open post without touching it otherwise', async () => {
+    const { thread, calls } = post(false);
+    await expect(gatewayOver(() => Promise.resolve(thread)).deleteReported('p', 'm')).resolves.toBe(
+      'deleted',
+    );
+    expect(calls).toEqual(['delete']);
+  });
+
+  it('answers not-allowed where the bot cannot even see the channel', async () => {
+    const hidden = gatewayOver(() => Promise.reject(apiError(RESTJSONErrorCodes.MissingAccess)));
+    await expect(hidden.deleteReported('c', 'm')).resolves.toBe('not-allowed');
+  });
+});
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index 55082736..5c82f32a 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -196,6 +196,12 @@ export interface PartyGateway {
   ): Promise<boolean>;
   /** Deletes a message; one that is already gone is fine. */
   deleteMessage(channelId: string, messageId: string): Promise<void>;
+  /**
+   * Deletes a message somebody else wrote (a reported one, plan 8S-2): `deleted`, `gone` when it
+   * (or its channel) was gone already, `not-allowed` when the bot lacks Manage Messages there.
+   * Anything else is thrown.
+   */
+  deleteReported(channelId: string, messageId: string): Promise<'deleted' | 'gone' | 'not-allowed'>;
   /**
    * Whether a member of the server can see a forum (and with it the posts in it), by their
    * roles and the forum's permission overwrites. Undefined when the forum is gone or the member
@@ -1172,6 +1178,31 @@ export class DiscordPartyGateway implements PartyGateway {
     await this.done(() => channel.messages.delete(messageId));
   }
 
+  async deleteReported(
+    channelId: string,
+    messageId: string,
+  ): Promise<'deleted' | 'gone' | 'not-allowed'> {
+    try {
+      const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
+      if (!channel?.isTextBased()) return 'gone';
+      // An archived post refuses a deletion (50083): opened for it, and archived again as it was
+      // (locked or not) whether the deletion worked or not.
+      const archived = channel.isThread() && channel.archived === true;
+      const locked = channel.isThread() && channel.locked === true;
+      if (!archived)
+        return (await this.done(() => channel.messages.delete(messageId))) ? 'deleted' : 'gone';
+      await channel.setArchived(false);
+      try {
+        return (await this.done(() => channel.messages.delete(messageId))) ? 'deleted' : 'gone';
+      } finally {
+        await channel.edit({ locked, archived: true });
+      }
+    } catch (err) {
+      if (isMissingPermission(err)) return 'not-allowed';
+      throw err;
+    }
+  }
+
   async memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> {
     const forum = await this.forum(forumId);
     if (!forum) return undefined;
diff --git a/src/domain/moderation/reports.ts b/src/domain/moderation/reports.ts
index e9fdc4d8..54edba38 100644
--- a/src/domain/moderation/reports.ts
+++ b/src/domain/moderation/reports.ts
@@ -203,6 +203,11 @@ export interface ReportStore {
    * decided).
    */
   reopenReport(id: string): Promise<boolean>;
+  /**
+   * A report decided as `deleted` whose message was found deleted already: `gone` (Delete message
+   * claims the report first, then deletes).
+   */
+  markGone(id: string): Promise<void>;
   /** How a decided report's party post really went (Discord refused a deletion). */
   setRemoval(id: string, removal: ReportRemoval): Promise<void>;
   /** The open reports of parties, of every server, oldest first (the sweep). */
diff --git a/src/render/moderation.test.ts b/src/render/moderation.test.ts
index c228c817..238636e6 100644
--- a/src/render/moderation.test.ts
+++ b/src/render/moderation.test.ts
@@ -183,6 +183,27 @@ describe('reportMessage of a message', () => {
     ]);
   });
 
+  it('cuts the copy after escaping it, and bounds the attachments, within what a message holds', () => {
+    const many = Array.from({ length: 12 }, (_, i) =>
+      reason(`2000000000000001${String(i).padStart(2, '0')}`, {
+        reporterName: 'Z'.repeat(32),
+        text: '_'.repeat(MAX_REPORT_REASON),
+      }),
+    );
+    const message = reportMessage(
+      open(
+        messageSubject({
+          text: '_'.repeat(1500),
+          attachments: Array.from({ length: 10 }, (_, i) => `${String(i)}${'*'.repeat(254)}`),
+          partyTitle: '_'.repeat(200),
+        }),
+        { reasons: many },
+      ),
+    );
+    expectV2Sendable(message);
+    expect(textOf(message)).toContain('…');
+  });
+
   it('names the party whose post it is in, and says when there was no text', () => {
     const text = textOf(
       reportMessage(open(messageSubject({ partyTitle: 'Book swap', text: '', attachments: [] }))),
diff --git a/src/render/moderation.ts b/src/render/moderation.ts
index 4776d645..cfb80ce4 100644
--- a/src/render/moderation.ts
+++ b/src/render/moderation.ts
@@ -18,7 +18,15 @@ import { partyWord } from '../domain/party/party.js';
 import { APPROVED_ACCENT, EXPIRED_ACCENT, PENDING_ACCENT, placeLine } from './meetup-safety.js';
 import { postLink } from './notify-dm.js';
 import { TEXT_BUDGET } from './party-post.js';
-import { memberText, plain, plainLines, plainNoLinks, timestamp } from './text.js';
+import {
+  fitItems,
+  memberText,
+  plain,
+  plainLines,
+  plainNoLinks,
+  timestamp,
+  truncate,
+} from './text.js';
 import { actionRow, container, linkButton, textDisplay, textMessage } from './v2.js';
 
 /**
@@ -127,6 +135,12 @@ function accentOf(report: ModerationReport): number {
   }
 }
 
+/** As much of a reported message's text as its post shows, once escaped. */
+const COPY_ROOM = 1_500;
+/** As much of its attachments' names as it shows, each and all of them. */
+const NAME_ROOM = 100;
+const ATTACHMENTS_ROOM = 600;
+
 /** One reason: who gave it, when, and what they said (`plain`, one line). */
 function reasonLine(reason: ReportReason): string {
   const who = memberText({ id: reason.reporterId, name: reason.reporterName ?? undefined });
@@ -149,7 +163,7 @@ function reasonsText(reasons: readonly ReportReason[], room: number): string {
     ].join('\n');
   while (kept > 1 && text(kept).length > room) kept--;
   const shown = text(kept);
-  return shown.length <= room ? shown : `${shown.slice(0, Math.max(0, room - 1))}…`;
+  return truncate(shown, room);
 }
 
 /** The head of a party's report: what it is, its lines, who made it and in which region. */
@@ -178,11 +192,18 @@ function messageHead(subject: MessageSubject): string {
 /** The texts of a report's subject besides its head and its reasons. */
 function subjectTexts(subject: PartySubject | MessageSubject): string[] {
   if (subject.kind === 'message') {
-    const said = subject.text.trim() === '' ? '(no text)' : plainLines(subject.text);
+    // Cut after escaping: an escaped text may be twice as long as it was.
+    const said =
+      subject.text.trim() === '' ? '(no text)' : truncate(plainLines(subject.text), COPY_ROOM);
     const attachments =
       subject.attachments.length === 0
         ? []
-        : [`**Attachments**: ${subject.attachments.map(plainNoLinks).join(', ')}`];
+        : [
+            `**Attachments**: ${fitItems(
+              subject.attachments.map((name) => truncate(plainNoLinks(name), NAME_ROOM)),
+              ATTACHMENTS_ROOM,
+            )}`,
+          ];
     return [`**What it said**\n${said}`, ...attachments];
   }
   return [
diff --git a/src/services/moderation-reports.message.test.ts b/src/services/moderation-reports.message.test.ts
new file mode 100644
index 00000000..22a03a71
--- /dev/null
+++ b/src/services/moderation-reports.message.test.ts
@@ -0,0 +1,144 @@
+import { describe, expect, it } from 'vitest';
+import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import { MODERATOR } from '../../test/support/meetup-safety-cases.js';
+import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
+import { buttonsOf, textOf } from '../../test/support/messages.js';
+import { BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
+import { REPORT_SERVER, reportsWith } from '../../test/support/reports-service.js';
+import type { SafetyOptions } from '../../test/support/meetup-safety-service.js';
+import { MESSAGE_COPY_ROOM } from '../domain/moderation/reports.js';
+
+const DAVE = '200000000000000005';
+const MESSAGE = '800000000000000001';
+const mod = { id: MODERATOR, name: 'Mod' };
+
+async function setup(options: SafetyOptions = {}) {
+  const made = await reportsWith(options);
+  const report = (reporterId = BOB, text = 'You are all idiots.', reason = 'Hurtful.') =>
+    made.reports.reportMessage({
+      serverId: REPORT_SERVER,
+      message: {
+        channelId: WEST_CHANNEL,
+        messageId: MESSAGE,
+        authorId: DAVE,
+        authorName: 'Dave',
+        sentAt: PARTY_NOW - 60_000,
+        text,
+        attachments: ['meme.png'],
+      },
+      partyTitle: null,
+      nearChannelId: WEST_CHANNEL,
+      reporter: { id: reporterId, name: reporterId === BOB ? 'Bob' : 'Carol' },
+      reason,
+    });
+  return { ...made, report };
+}
+
+describe('ModerationReports: a message reported', () => {
+  it('sends a copy of it to the moderators, and gathers more reporters on the one post', async () => {
+    const made = await setup();
+    const sent = await made.report();
+    expect(sent.kind).toBe('sent');
+    expect((await made.report(CAROL, 'You are all idiots.', 'Rude.')).kind).toBe('sent');
+    expect((await made.report()).kind).toBe('already');
+    const posts = made.gateway.messagesIn(MOD_CHANNEL);
+    expect(posts).toHaveLength(1);
+    const text = textOf(posts[0]?.message);
+    expect(text).toContain(`Written by **Dave** (<@${DAVE}>) in <#${WEST_CHANNEL}>`);
+    expect(text).toContain('**What it said**\nYou are all idiots.');
+    expect(text).toContain('**Attachments**: meme.png');
+    expect(text).toContain('**Reasons** (2)');
+    expect(buttonsOf(posts[0]?.message).map((button) => button.label)).toEqual([
+      'Delete message',
+      'Dismiss',
+      'Go to message',
+    ]);
+  });
+
+  it('keeps as much of a long message as it shows', async () => {
+    const made = await setup();
+    await made.report(BOB, 'x'.repeat(4000));
+    const [report] = made.reportStore.reports.values();
+    expect(report?.subject.kind === 'message' && report.subject.text.length).toBe(
+      MESSAGE_COPY_ROOM,
+    );
+  });
+
+  it('is refused without a moderators’ channel', async () => {
+    const made = await setup({ moderation: null });
+    expect((await made.report()).kind).toBe('no-channel');
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+  });
+
+  it('deletes the message on Delete message, and says so in the report’s post', async () => {
+    const made = await setup();
+    const sent = await made.report();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    const outcome = await made.reports.decide(sent.report.id, 'delete', null, mod, REPORT_SERVER);
+    expect(outcome).toMatchObject({ kind: 'done', report: { status: 'deleted' } });
+    expect(made.gateway.deleted).toContainEqual({ channelId: WEST_CHANNEL, messageId: MESSAGE });
+    const post = made.reportPostOf(sent.report);
+    expect(textOf(post)).toContain('**Message deleted** by **Mod**');
+    expect(buttonsOf(post)).toEqual([]);
+  });
+
+  it('settles the report as gone when the message was deleted before', async () => {
+    const made = await setup();
+    const sent = await made.report();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    made.gateway.gone.add(MESSAGE);
+    const outcome = await made.reports.decide(sent.report.id, 'delete', null, mod, REPORT_SERVER);
+    expect(outcome).toMatchObject({ kind: 'done', report: { status: 'gone' } });
+    expect(textOf(made.reportPostOf(sent.report))).toContain(
+      '**Gone**: the message was deleted before a moderator did',
+    );
+  });
+
+  it('keeps the report open where the bot may not delete messages', async () => {
+    const made = await setup();
+    const sent = await made.report();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    made.gateway.noManaging.add(WEST_CHANNEL);
+    expect(await made.reports.decide(sent.report.id, 'delete', null, mod, REPORT_SERVER)).toEqual({
+      kind: 'may-not-delete-message',
+      channelId: WEST_CHANNEL,
+    });
+    expect((await made.reportStore.report(sent.report.id))?.status).toBe('open');
+  });
+
+  it('deletes nothing where a Dismiss at the same moment wins', async () => {
+    const made = await setup();
+    const sent = await made.report();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    const decide = (action: 'delete' | 'dismiss') =>
+      made.reports.decide(sent.report.id, action, null, mod, REPORT_SERVER);
+    const [deleting, dismissing] = await Promise.all([decide('delete'), decide('dismiss')]);
+    const status = (await made.reportStore.report(sent.report.id))?.status;
+    if (dismissing.kind === 'done') {
+      expect(deleting.kind).toBe('decided-before');
+      expect(status).toBe('dismissed');
+      expect(made.gateway.deleted).toEqual([]);
+    } else {
+      expect(deleting).toMatchObject({ kind: 'done' });
+      expect(status).toBe('deleted');
+    }
+  });
+
+  it('opens the report again, and says so, where deleting the message fails', async () => {
+    const made = await setup();
+    const sent = await made.report();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    made.gateway.failing.set('deleteReported', new Error('Discord is away'));
+    expect(await made.reports.decide(sent.report.id, 'delete', null, mod, REPORT_SERVER)).toEqual({
+      kind: 'failed',
+      word: 'message',
+      placeRefused: false,
+      blocked: false,
+      reopened: true,
+    });
+    expect((await made.reportStore.report(sent.report.id))?.status).toBe('open');
+    expect(buttonsOf(made.reportPostOf(sent.report)).map((button) => button.label)).toContain(
+      'Delete message',
+    );
+  });
+});
diff --git a/src/services/moderation-reports.ts b/src/services/moderation-reports.ts
index 9779759d..fc2f3cb4 100644
--- a/src/services/moderation-reports.ts
+++ b/src/services/moderation-reports.ts
@@ -5,7 +5,10 @@ import type { PartyGateway } from '../discord/party-gateway.js';
 import { addressLine } from '../domain/geo/google.js';
 import { cutWhole, type Place } from '../domain/geo/place.js';
 import {
+  MAX_ATTACHMENT_NAMES,
   MAX_REPORT_REASON,
+  MESSAGE_COPY_ROOM,
+  type MessageSubject,
   type ModerationReport,
   reportTargetKey,
   type PartySubject,
@@ -44,6 +47,27 @@ export interface PartyReportAsk {
   roleIds: readonly string[];
 }
 
+/** A member's report of one message, as the Apps menu gives it. */
+export interface MessageReportAsk {
+  serverId: string;
+  /** The message as Discord sent it with the interaction. */
+  message: {
+    channelId: string;
+    messageId: string;
+    authorId: string;
+    authorName: string | null;
+    sentAt: number;
+    text: string;
+    attachments: readonly string[];
+  };
+  /** The title of the party whose post the message is in; null for none. */
+  partyTitle: string | null;
+  /** A channel of the server, by which its moderators' channel is found. */
+  nearChannelId: string;
+  reporter: NamedMember;
+  reason: string;
+}
+
 /** What came of a moderator's decision of a report. */
 export type ReportDecision =
   /** No such report in the presser's server. */
@@ -61,6 +85,8 @@ export type ReportDecision =
    * its maker blocked before that, and whether the report is open again (its buttons back).
    */
   | { kind: 'failed'; word: string; placeRefused: boolean; blocked: boolean; reopened: boolean }
+  /** Delete message where the bot may not delete messages (Manage Messages): it stays open. */
+  | { kind: 'may-not-delete-message'; channelId: string }
   /**
    * Decided; for Block maker…, whether the block is new and how many other meetups were closed
    * and requests withdrawn; `refusedDeletion` where Discord refused to delete the post, which is
@@ -87,6 +113,8 @@ export type ReportOutcome =
   | { kind: 'not-sent' }
   /** A reason of nothing but white space, or longer than `MAX_REPORT_REASON`. */
   | { kind: 'no-reason' }
+  /** A message reported where the server has no moderators' channel. */
+  | { kind: 'no-channel' }
   /**
    * Without a moderators' channel (`settings.channels.moderation`): put into the party's post,
    * the staff roles pinged once (`PartyService.requestDeletion`, as a member's `/delete` before),
@@ -98,7 +126,10 @@ export type ReportOutcome =
 export interface ModerationReportsOptions {
   storage: ReportStore;
   /** Meetup safety's gateway (its own in rehearsal mode): the moderators' posts go through it. */
-  gateway: Pick<PartyGateway, 'findChannel' | 'sendMessage' | 'editMessage' | 'deleteMessage'>;
+  gateway: Pick<
+    PartyGateway,
+    'findChannel' | 'sendMessage' | 'editMessage' | 'deleteMessage' | 'deleteReported'
+  >;
   parties: Pick<
     PartyService,
     | 'requestDeletion'
@@ -221,6 +252,39 @@ export class ModerationReports {
     return this.report({ serverId: ask.serverId, subject }, ask.reporter, reason, nearChannelId);
   }
 
+  /**
+   * A member's report of one message (the Apps menu on any message but the bot's own; plan
+   * 8S-2): a copy of it (its text cut to `MESSAGE_COPY_ROOM`, the names of its attachments, who
+   * wrote it where and when, the party whose post it is in) goes to the moderators as a party's
+   * report does, reports of one message gathering on one post. Refused without a moderators'
+   * channel (`no-channel`): a message has no post of its own to put it into.
+   */
+  async reportMessage(ask: MessageReportAsk): Promise<ReportOutcome> {
+    const reason = ask.reason.trim();
+    if (reason === '' || reason.length > MAX_REPORT_REASON) return { kind: 'no-reason' };
+    if (!this.on) return { kind: 'no-channel' };
+    const { message } = ask;
+    const subject: MessageSubject = {
+      kind: 'message',
+      channelId: message.channelId,
+      messageId: message.messageId,
+      authorId: message.authorId,
+      authorName: message.authorName === null ? null : cutWhole(message.authorName, 100),
+      sentAt: message.sentAt,
+      text: cutWhole(message.text, MESSAGE_COPY_ROOM),
+      attachments: message.attachments
+        .slice(0, MAX_ATTACHMENT_NAMES)
+        .map((name) => cutWhole(name, 255)),
+      partyTitle: ask.partyTitle === null ? null : cutWhole(ask.partyTitle, 200),
+    };
+    return this.report(
+      { serverId: ask.serverId, subject },
+      ask.reporter,
+      reason,
+      ask.nearChannelId,
+    );
+  }
+
   /**
    * Opens a report with the reason or adds the reason to the open one of the same subject, and
    * shows it in the moderators' channel. A report whose post was never made (stranded) is
@@ -400,6 +464,9 @@ export class ModerationReports {
     const { subject } = report;
     const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: this.now() };
     if (action === 'dismiss') return this.settle(report, 'dismissed', null, by);
+    if (subject.kind === 'message') {
+      return this.deleteMessage(report, subject, by);
+    }
     if (subject.kind !== 'party' || removal === null) return { kind: 'not-offered' };
     const party = store.get(subject.partyId);
     if (!party) {
@@ -497,6 +564,54 @@ export class ModerationReports {
     };
   }
 
+  /**
+   * Delete message: the report claimed first (the first press wins, so a Dismiss at the same
+   * moment leaves the message), then the message deleted. Where the bot may not delete it, or
+   * deleting fails, the report is opened again; a message deleted already makes it `gone`.
+   */
+  private async deleteMessage(
+    report: ModerationReport,
+    subject: MessageSubject,
+    by: Decider,
+  ): Promise<ReportDecision> {
+    const { storage, gateway, log } = this.options;
+    if (!(await storage.decideReport(report.id, 'deleted', null, by))) {
+      return this.decidedBefore(report);
+    }
+    let deleted: Awaited<ReturnType<typeof gateway.deleteReported>> | undefined;
+    try {
+      deleted = await gateway.deleteReported(subject.channelId, subject.messageId);
+    } catch (err) {
+      log.error({ err, report: report.id }, 'could not delete a reported message');
+    }
+    if (deleted === undefined || deleted === 'not-allowed') {
+      const reopened = await storage.reopenReport(report.id).catch((err: unknown) => {
+        log.error({ err, report: report.id }, 'could not open a report again');
+        return false;
+      });
+      await this.show(report.id);
+      if (deleted === 'not-allowed' && reopened) {
+        return { kind: 'may-not-delete-message', channelId: subject.channelId };
+      }
+      return { kind: 'failed', word: 'message', placeRefused: false, blocked: false, reopened };
+    }
+    const status = deleted === 'deleted' ? 'deleted' : 'gone';
+    if (status === 'gone') {
+      await storage.markGone(report.id).catch((err: unknown) => {
+        log.warn({ err, report: report.id }, 'could not keep that a reported message was gone');
+      });
+    }
+    await this.show(report.id);
+    const decided: ModerationReport = {
+      ...report,
+      status,
+      decidedBy: by.id,
+      decidedByName: by.name,
+      decidedAt: by.at,
+    };
+    return { kind: 'done', report: decided };
+  }
+
   /** Decides a report that needs nothing else (Dismiss), and shows it. */
   private async settle(
     report: ModerationReport,
diff --git a/src/services/rehearsal.test.ts b/src/services/rehearsal.test.ts
index bbbf7001..a0975af4 100644
--- a/src/services/rehearsal.test.ts
+++ b/src/services/rehearsal.test.ts
@@ -196,6 +196,19 @@ describe('rehearsalGateway', () => {
     expect(fake.messagesIn('100000000000000099')).toEqual([]);
   });
 
+  it('deletes a reported message only in the post of a rehearsed party', async () => {
+    const { service, gateway, fake, entries } = await rehearsed();
+    const outcome = await service.reportRaid(report(1));
+    if (outcome.kind !== 'created') throw new Error(outcome.kind);
+    const postId = outcome.party.forumPostId ?? '';
+    expect(await gateway.deleteReported(postId, '800000000000000001')).toBe('deleted');
+    expect(await gateway.deleteReported(WEST_CHANNEL, '800000000000000002')).toBe('not-allowed');
+    expect(fake.deleted.map((one) => one.messageId)).not.toContain('800000000000000002');
+    expect(entries.map((entry) => entry.msg)).toContain(
+      'rehearsal: no member’s message is deleted outside the posts of parties',
+    );
+  });
+
   it('lets the moderators’ posts of meetup safety into their channel, and nothing else beside', async () => {
     const { log } = createTestLogger();
     const fake = new FakePartyGateway();
diff --git a/src/services/rehearsal.ts b/src/services/rehearsal.ts
index e1cbe4e9..e97701a3 100644
--- a/src/services/rehearsal.ts
+++ b/src/services/rehearsal.ts
@@ -167,7 +167,8 @@ type GuardedMethod =
   | 'createForum'
   | 'createCategory'
   | 'createTextChannel'
-  | 'deleteChannel';
+  | 'deleteChannel'
+  | 'deleteReported';
 const GUARDED: ReadonlySet<string> = new Set<GuardedMethod>([
   'sendMessage',
   'createPost',
@@ -175,6 +176,7 @@ const GUARDED: ReadonlySet<string> = new Set<GuardedMethod>([
   'createCategory',
   'createTextChannel',
   'deleteChannel',
+  'deleteReported',
 ]);
 
 /**
@@ -235,6 +237,16 @@ export function rehearsalGateway<G extends PartyGateway>(
       log.info({ channel: channelId }, 'rehearsal: no channel is deleted but a forum it made');
       return Promise.resolve();
     },
+    // A report's Delete message (plan 8S-2): a real member's message is never deleted, but in
+    // the post of a rehearsed party, which only staff and the testers see.
+    deleteReported(channelId, messageId) {
+      if (posts.mayPostIn(channelId)) return inner.deleteReported(channelId, messageId);
+      log.info(
+        { channel: channelId },
+        'rehearsal: no member’s message is deleted outside the posts of parties',
+      );
+      return Promise.resolve('not-allowed' as const);
+    },
   };
   return new Proxy(inner, {
     get(target, key) {
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index 767b4254..6cb52d46 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -1208,6 +1208,26 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
+  /**
+   * A reported message deleted (plan 8S-2): `gone` for one in `gone` (or deleted before) or in a
+   * channel that is gone, `not-allowed` in a channel, post or forum of `noManaging`.
+   */
+  deleteReported(channelId: string, messageId: string) {
+    return this.attempt('deleteReported', messageId, (): 'deleted' | 'gone' | 'not-allowed' => {
+      if (this.gone.has(channelId) || this.gone.has(messageId)) return 'gone';
+      if (this.deleted.some((one) => one.messageId === messageId)) return 'gone';
+      const post = this.posts.get(channelId);
+      const forumId = post?.forumId;
+      if (this.noManaging.has(channelId) || (forumId !== undefined && this.noManaging.has(forumId)))
+        return 'not-allowed';
+      // As Discord: an archived post refuses a deletion (50083) until it is opened for it, and is
+      // archived and locked again afterwards, as the gateway does.
+      if (post?.archived) post.reopened += 1;
+      this.deleted.push({ channelId, messageId });
+      return 'deleted';
+    });
+  }
+
   memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> {
     return this.attempt(
       'memberAccess',
diff --git a/test/support/report-cases.ts b/test/support/report-cases.ts
index 9c44c3db..5f240d06 100644
--- a/test/support/report-cases.ts
+++ b/test/support/report-cases.ts
@@ -161,6 +161,16 @@ export function reportCases(made: () => Promise<ReportStore>): void {
     expect(await store.decideReport(requestId(209), 'dismissed', null, MOD)).toBe(false);
   });
 
+  it('marks a report decided as deleted gone, and no other', async () => {
+    const store = await made();
+    await store.addReport(newReport(1, messageSubject()), reason());
+    await store.markGone(requestId(201));
+    expect((await store.report(requestId(201)))?.status).toBe('open');
+    await store.decideReport(requestId(201), 'deleted', null, MOD);
+    await store.markGone(requestId(201));
+    expect(await store.report(requestId(201))).toMatchObject({ status: 'gone', decidedBy: MOD.id });
+  });
+
   it('opens a decided report again unless another of its subject is open, and keeps its removal', async () => {
     const store = await made();
     await store.addReport(newReport(1), reason());
diff --git a/test/support/reports.ts b/test/support/reports.ts
index 4f5a5670..39da577c 100644
--- a/test/support/reports.ts
+++ b/test/support/reports.ts
@@ -136,6 +136,12 @@ export class MemoryReports implements ReportStore {
     return true;
   }
 
+  async markGone(id: string) {
+    await this.check('markGone');
+    const found = this.reports.get(id);
+    if (found?.status === 'deleted') this.reports.set(id, { ...found, status: 'gone' });
+  }
+
   async setRemoval(id: string, removal: ReportRemoval) {
     await this.check('setRemoval');
     const found = this.reports.get(id);
````

### Task 6: Plan 8S-2 T6: Ask the moderators about a place refused for good

Prototype commit: `3ff75f6ac7e8056edc45ae1c4ff3a354eed7fbbc`

/meetup's refusal of a refused place gets Ask the moderators once the refusal (or its last
Keep refused) is fourteen days old, counted per place; while an ask of the place is open
members hear it is with the moderators. The form's ask is posted to the moderators' channel
with the place (its official name too), its ruling (who, when, from which post) and the
member's words, with Allow place and Keep refused (staff, the first press wins, the member
told by DM). An ask nobody decides expires after seven days in the appeals' sweep. Rulings
made on requests now keep their place and post; the record type is PlaceAskRecord.

**Files:**

```
 src/app.ts                              |   1 +
 src/commands/meetups/meetup.ts          |   9 +++
 src/commands/meetups/place-ask.test.ts  | 171 ++++++++++++++++++++++++++++++++++++++++++++
 src/commands/meetups/place-ask.ts       | 235 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/components/index.ts                 |   2 +
 src/domain/meetups/safety.test.ts       |   8 +++
 src/domain/meetups/safety.ts            |  11 +++
 src/render/place-asks.ts                | 139 ++++++++++++++++++++++++++++++++++++
 src/services/meetup-safety.asks.test.ts | 198 +++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/meetup-safety.ts           | 279 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/meetup-make.test.ts             |  10 +++
 src/web/meetup-routes.ts                |  12 ++++
 12 files changed, 1073 insertions(+), 2 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/meetups/place-ask.test.ts src/domain/meetups/safety.test.ts src/services/meetup-safety.asks.test.ts src/web/meetup-make.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3ff75f6ac7e8056edc45ae1c4ff3a354eed7fbbc -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-2 T6: Ask the moderators about a place refused for good`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/app.ts b/src/app.ts
index a744362a..81b2bafe 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -542,6 +542,7 @@ export async function startApp(
     storage: new MeetupSafetyRepository(db, log),
     gateway: moderatorsGateway,
     gyms,
+    wayspots,
     parties: partyService,
     dms: memberDms,
     store: parties,
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index 1d0ad026..c00dd706 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -32,6 +32,7 @@ import { MAX_PLACE_TEXT, namedPlace, nearChoices, type PlaceKindsOnly } from '..
 import { MEETUP_PLACE_KINDS } from '../../services/place-finder.js';
 import { DISCORD_NAMES, type ReportNames } from '../raids/report.js';
 import { INFO_INPUT, infoInput, refusedWithText } from './info.js';
+import { placeRefusal } from './place-ask.js';
 
 /** Where `/meetup` works, said wherever it does not. */
 export const FROM_A_REGION = 'Create a meetup from a region channel.';
@@ -52,6 +53,10 @@ const MEETUP_PLACES: PlaceKindsOnly = { kinds: MEETUP_PLACE_KINDS, refusal: NO_P
 /** Said of a place a moderator refused for good (plan 8S-1; the design's words). */
 export const NO_MEETUP_HERE = "A meetup can't be held there.";
 
+/** Said on the live map of a refused place members may ask the moderators about (plan 8S-2). */
+export const ASK_ON_DISCORD =
+  'You can ask the moderators about it with /meetup on Discord: its answer has Ask the moderators.';
+
 /** Said to a member blocked from making meetups in the server (the design's words). */
 export const NO_MEETUPS_FOR_YOU = "You can't create meetups on this server.";
 
@@ -175,6 +180,10 @@ async function readAsked(
     blocked: false,
   });
   const refusal = refusalOf(verdict, typed.at, now);
+  if (refusal === NO_MEETUP_HERE && place.kind !== 'pin') {
+    // With Ask the moderators once the refusal is old enough (plan 8S-2).
+    throw await placeRefusal(ctx, serverId, place, makerId, NO_MEETUP_HERE);
+  }
   if (refusal !== undefined) throw new UserError(refusal);
   return { place, startTime: typed.at, verdict };
 }
diff --git a/src/commands/meetups/place-ask.test.ts b/src/commands/meetups/place-ask.test.ts
new file mode 100644
index 00000000..9761f2cc
--- /dev/null
+++ b/src/commands/meetups/place-ask.test.ts
@@ -0,0 +1,171 @@
+import { MessageFlags } from 'discord.js';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import {
+  asV2,
+  fakeButton,
+  fakeChatInput,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+} from '../../../test/support/fake-interactions.js';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { MOD, MODERATOR } from '../../../test/support/meetup-safety-cases.js';
+import { meetupSafetyWith, MOD_CHANNEL } from '../../../test/support/meetup-safety-service.js';
+import { buttonsOf, textOf } from '../../../test/support/messages.js';
+import { ALICE, BOB, PARTY_NOW } from '../../../test/support/parties.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { meetup, meetupFormControls, NO_MEETUP_HERE } from './meetup.js';
+import { ASK_INPUT, ASK_SENT, placeAskControls } from './place-ask.js';
+
+const DAY = 24 * 3_600_000;
+const KEY = { kind: 'gym' as const, id: '2' };
+
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'] });
+  vi.setSystemTime(PARTY_NOW);
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+/** Gym 2 refused for good `daysAgo` days ago, `/meetup` there and the ask's controls routed. */
+async function setup(daysAgo: number) {
+  const made = await meetupSafetyWith();
+  await made.storage.rule(made.gateway.guildId, KEY, 'refuse', {
+    ...MOD,
+    at: PARTY_NOW - daysAgo * DAY,
+  });
+  made.clock.now = PARTY_NOW;
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    timedParties: made.timed,
+    parties: made.store,
+    regions: made.regions,
+    meetupSafety: made.safety,
+  });
+  const router = new InteractionRouter(ctx, [meetup], [meetupFormControls, placeAskControls]);
+  const handle = async <I extends FakeInteraction>(interaction: I) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const run = (userId = ALICE) =>
+    handle(
+      fakeChatInput({
+        commandName: 'meetup',
+        channelId: WEST_CHANNEL,
+        userId,
+        displayName: userId === ALICE ? 'Alice' : 'Bob',
+        options: { name: 'Picnic', near: 'gym:2', start: '6pm' },
+      }),
+    );
+  /** The refusal's Ask the moderators, pressed by the member it answered. */
+  const ask = async (refused: FakeInteraction, userId = ALICE) => {
+    const answer = asV2(sent(refused.reply));
+    const customId = buttonsOf(answer)[0]?.customId ?? '';
+    return handle(
+      fakeButton({
+        customId,
+        userId,
+        channelId: WEST_CHANNEL,
+        ephemeralMessage: true,
+        v2Message: true,
+      }),
+    );
+  };
+  const submit = (opened: FakeInteraction, text: string, userId = ALICE) => {
+    const form = opened.showModal.mock.calls[0]?.[0] as { custom_id: string };
+    return handle(
+      fakeModal({
+        customId: form.custom_id,
+        form,
+        userId,
+        displayName: 'Alice',
+        channelId: WEST_CHANNEL,
+        fields: { [ASK_INPUT]: text },
+      }),
+    );
+  };
+  const decide = (action: string, roleNames = ['Moderator']) => {
+    const post = made.gateway.messagesIn(MOD_CHANNEL).at(-1)?.message;
+    const customId =
+      buttonsOf(post).find((button) => button.customId?.endsWith(`:${action}`))?.customId ?? '';
+    return handle(
+      fakeButton({
+        customId,
+        userId: MODERATOR,
+        displayName: 'Mod',
+        roleNames,
+        channelId: MOD_CHANNEL,
+      }),
+    );
+  };
+  return { ...made, run, ask, submit, decide };
+}
+
+describe('Ask the moderators (a place refused for good)', () => {
+  it('is not offered in the first fourteen days', async () => {
+    const made = await setup(13);
+    const refused = await made.run();
+    expect(sent(refused.reply)).toEqual({ content: NO_MEETUP_HERE, flags: MessageFlags.Ephemeral });
+  });
+
+  it('is offered afterwards, opens a form and sends the ask to the moderators', async () => {
+    const made = await setup(14);
+    const refused = await made.run();
+    const answer = asV2(sent(refused.reply));
+    expect(textOf(answer)).toBe(NO_MEETUP_HERE);
+    expect(buttonsOf(answer).map((button) => button.label)).toEqual(['Ask the moderators']);
+    const opened = await made.ask(refused);
+    const form = opened.showModal.mock.calls[0]?.[0] as { title: string };
+    expect(form.title).toBe('Ask about this place');
+    const submitted = await made.submit(opened, 'It is a public park now.');
+    expect(sent(submitted.editReply).content).toBe(ASK_SENT);
+    const post = made.gateway.messagesIn(MOD_CHANNEL).at(-1)?.message;
+    expect(textOf(post)).toContain('It is a public park now.');
+    // While it is open, others hear that it is with the moderators.
+    const other = await made.run(BOB);
+    expect(sent(other.reply).content).toBe(`${NO_MEETUP_HERE} It is with the moderators already.`);
+  });
+
+  it('lets staff alone decide, and tells the member', async () => {
+    const made = await setup(20);
+    await made.submit(await made.ask(await made.run()), 'A park.');
+    const refused = await made.decide('allow', ['Valor']);
+    expect(sent(refused.reply).content).toBe('Only admins and moderators can do that.');
+    const allowed = await made.decide('allow');
+    expect(sent(allowed.editReply).content).toBe(
+      'Allowed: meetups can be held there from now on. The member is told.',
+    );
+    expect(await made.storage.ruling(made.gateway.guildId, KEY)).toBe('allow');
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+
+  it('has a button that works after a restart: it names the place, not something kept', async () => {
+    const made = await setup(20);
+    const refused = await made.run();
+    const customId = buttonsOf(asV2(sent(refused.reply)))[0]?.customId;
+    expect(customId).toBe('mplace:gym:open:2');
+  });
+
+  it('refuses a member blocked since the refusal, with Appeal', async () => {
+    const made = await setup(20);
+    const refused = await made.run();
+    await made.storage.addBlock(made.gateway.guildId, ALICE, MOD);
+    const pressed = await made.ask(refused);
+    const answer = asV2(sent(pressed.reply));
+    expect(textOf(answer)).toBe("You can't create meetups on this server.");
+    expect(buttonsOf(answer).map((button) => button.label)).toEqual(['Appeal']);
+  });
+
+  it('takes the button from any member, and says when the ask was sent already', async () => {
+    const made = await setup(20);
+    const refused = await made.run();
+    const other = await made.ask(refused, BOB);
+    expect(other.showModal).toHaveBeenCalled();
+    await made.submit(await made.ask(refused), 'A park.');
+    const again = await made.ask(refused);
+    expect(sent(again.reply).content).toBe('It is with the moderators already.');
+  });
+});
diff --git a/src/commands/meetups/place-ask.ts b/src/commands/meetups/place-ask.ts
new file mode 100644
index 00000000..e2ed91f4
--- /dev/null
+++ b/src/commands/meetups/place-ask.ts
@@ -0,0 +1,235 @@
+import {
+  ButtonStyle,
+  ComponentType,
+  MessageFlags,
+  TextInputStyle,
+  type APIModalInteractionResponseCallbackData,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import { SAFETY_THROTTLE } from '../../components/meetup-safety.js';
+import { APPEAL_THROTTLE } from '../../components/meetup-appeal.js';
+import type { ComponentHandler, ControlThrottle, Guard } from '../../discord/command.js';
+import { decodeCustomId, encodeCustomId, type CustomId } from '../../discord/custom-id.js';
+import { UserError } from '../../discord/errors.js';
+import { guildIdOf, requireGuild, requireManagement } from '../../discord/guards.js';
+import { memberInfo } from '../../discord/member-info.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
+import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
+import type { KnownPlace } from '../../domain/geo/place.js';
+import { MAX_ASK } from '../../domain/meetups/records.js';
+import { PLACE_ASK_WAIT_DAYS, rulingKeyOf, type RulingKey } from '../../domain/meetups/safety.js';
+import type { PlaceKind } from '../../domain/search/place-merge.js';
+import { blockedAnswer, REFUSED_ACCENT } from '../../render/meetup-safety.js';
+import { ASK_KIND } from '../../render/place-asks.js';
+import { memberText, timestamp } from '../../render/text.js';
+import { actionRow, textMessage } from '../../render/v2.js';
+import type { AskDecision, AskOutcome } from '../../services/meetup-safety.js';
+import { refusedWithText } from './info.js';
+import { NO_MEETUPS_FOR_YOU } from './meetup.js';
+
+/** The id of the one input of the form of an ask. */
+export const ASK_INPUT = 'text';
+
+/** What a member is told whose ask reached the moderators. */
+export const ASK_SENT =
+  'Your question is with the moderators. I will tell you by direct message what they decide.';
+
+const ALREADY_OPEN = 'It is with the moderators already.';
+const NOT_SENT = 'I could not send your question to the moderators. Try again later.';
+const NOT_REFUSED = 'Meetups can be held there now: use `/meetup` again.';
+
+const PLACE_KINDS: readonly PlaceKind[] = ['gym', 'stop', 'powerspot'];
+
+/**
+ * The place a control of an ask names (`mplace:<kind>:open|form:<place id>`): nothing is kept
+ * for it, so that Ask the moderators works after a restart; undefined for anything else.
+ */
+function placeOf(id: CustomId): RulingKey | undefined {
+  const kind = PLACE_KINDS.find((one) => one === id.id);
+  const [placeId] = id.args;
+  return kind === undefined || placeId === undefined ? undefined : { kind, id: placeId };
+}
+
+/**
+ * The refusal of a place refused for good (`text`: `/meetup`'s `NO_MEETUP_HERE`; plan 8S-2), as
+ * a `UserError` the router shows privately: with Ask the moderators once the refusal is
+ * `PLACE_ASK_WAIT_DAYS` old (`MeetupSafety.askState`), saying it is with the moderators while an
+ * ask of the place is open, plain otherwise (a ruling that cannot be read too).
+ */
+export async function placeRefusal(
+  ctx: Pick<AppContext, 'meetupSafety'>,
+  serverId: string,
+  place: KnownPlace,
+  memberId: string,
+  text: string,
+): Promise<UserError> {
+  const key = rulingKeyOf(place);
+  const state =
+    key === undefined
+      ? undefined
+      : await ctx.meetupSafety.askState(serverId, key, memberId).catch(() => undefined);
+  if (state?.kind === 'open') return new UserError(`${text} ${ALREADY_OPEN}`);
+  if (key === undefined || state?.kind !== 'may') return new UserError(text);
+  return new UserError(text, {
+    answer: textMessage(
+      REFUSED_ACCENT,
+      [text],
+      [
+        actionRow([
+          {
+            type: ComponentType.Button,
+            style: ButtonStyle.Secondary,
+            label: 'Ask the moderators',
+            custom_id: encodeCustomId({
+              kind: ASK_KIND,
+              id: key.kind,
+              action: 'open',
+              args: [key.id],
+            }),
+          },
+        ]),
+      ],
+    ),
+  });
+}
+
+/** The form of an ask (plan 8S-2): one paragraph, required. */
+export function askForm(key: RulingKey): APIModalInteractionResponseCallbackData {
+  return {
+    custom_id: encodeCustomId({ kind: ASK_KIND, id: key.kind, action: 'form', args: [key.id] }),
+    title: 'Ask about this place',
+    components: [
+      {
+        type: ComponentType.ActionRow,
+        components: [
+          {
+            type: ComponentType.TextInput,
+            custom_id: ASK_INPUT,
+            label: 'Why should meetups be allowed here?',
+            style: TextInputStyle.Paragraph,
+            required: true,
+            min_length: 5,
+            max_length: MAX_ASK,
+          },
+        ],
+      },
+    ],
+  };
+}
+
+/** What a member is told who may not ask now, or of an ask that was not sent. */
+function askWords(outcome: AskOutcome): string {
+  switch (outcome.kind) {
+    case 'sent':
+      return ASK_SENT;
+    case 'open':
+      return ALREADY_OPEN;
+    case 'wait':
+      return `You can ask about this place ${timestamp(outcome.until, 'R')}.`;
+    case 'not-refused':
+      return NOT_REFUSED;
+    case 'not-sent':
+      return NOT_SENT;
+    case 'blocked':
+      return NO_MEETUPS_FOR_YOU;
+  }
+}
+
+/** What a moderator who pressed Allow place or Keep refused is told. */
+function decisionWords(outcome: AskDecision): string {
+  switch (outcome.kind) {
+    case 'gone':
+      return STALE_COMPONENT;
+    case 'decided-before': {
+      const { ask } = outcome;
+      if (ask.status === 'expired') return 'This ask has expired: nobody decided in time.';
+      const who =
+        ask.decidedBy === null
+          ? 'A moderator'
+          : memberText({ id: ask.decidedBy, name: ask.decidedByName ?? undefined });
+      const when = ask.decidedAt === null ? '' : ` ${timestamp(ask.decidedAt, 'R')}`;
+      return `${who} decided this already${when}: ${ask.status === 'allowed' ? 'allowed' : 'kept refused'}.`;
+    }
+    case 'done':
+      return outcome.ask.status === 'allowed'
+        ? 'Allowed: meetups can be held there from now on. The member is told.'
+        : `Kept refused: members can ask again in ${String(PLACE_ASK_WAIT_DAYS)} days. The ` +
+            'member is told.';
+    case 'not-refused':
+      return (
+        'No refusal of this place stands any more (it was undone or allowed meanwhile): there is ' +
+        'nothing to keep. The ask stays open.'
+      );
+  }
+}
+
+/** Allow place and Keep refused are for staff (admins, moderators, the owner). */
+const requireStaffToDecide: Guard = (interaction, ctx) => {
+  if (!interaction.isButton()) return;
+  const id = decodeCustomId(interaction.customId);
+  if (id?.action === 'allow' || id?.action === 'keep') return requireManagement(interaction, ctx);
+};
+
+/**
+ * Asks about a refused place (plan 8S-2; custom-id kind `mplace`): Ask the moderators under
+ * `/meetup`'s refusal (`mplace:<kind>:open:<place id>`, the server the presser's, nothing kept, so
+ * that it works after a restart) opens the form (`mplace:<kind>:form:<place id>`) unless the
+ * member may not ask now (a block since: the block's refusal with Appeal); the form sends the ask
+ * (`MeetupSafety.askAboutPlace`, the appeal's throttle; the presses of Ask count as reading).
+ * Allow place and Keep refused on its post (`mplace:<ask id>:allow|keep`) are for staff, the
+ * first press winning; the member is told by DM, the server named.
+ */
+export const placeAskControls: ComponentHandler = {
+  kind: ASK_KIND,
+  guards: [requireGuild, requireStaffToDecide],
+  throttle: (_interaction, id): ControlThrottle | undefined =>
+    id.action === 'form'
+      ? APPEAL_THROTTLE
+      : id.action === 'allow' || id.action === 'keep'
+        ? SAFETY_THROTTLE
+        : MEMBER_READ_THROTTLE,
+
+  async button(interaction, id, ctx) {
+    if (id.action === 'open') {
+      const key = placeOf(id);
+      if (key === undefined) throw new UserError(STALE_COMPONENT);
+      const serverId = guildIdOf(interaction);
+      const state = await ctx.meetupSafety.askState(serverId, key, interaction.user.id);
+      if (state.kind === 'blocked') {
+        throw new UserError(NO_MEETUPS_FOR_YOU, {
+          answer: blockedAnswer(NO_MEETUPS_FOR_YOU, serverId),
+        });
+      }
+      if (state.kind !== 'may') throw new UserError(askWords(state));
+      await interaction.showModal(askForm(key));
+      return;
+    }
+    if (id.action !== 'allow' && id.action !== 'keep') throw new UserError(STALE_COMPONENT);
+    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+    const outcome = await ctx.meetupSafety.decideAsk(
+      id.id,
+      id.action,
+      { id: interaction.user.id, name: memberInfo(interaction).name },
+      guildIdOf(interaction),
+      interaction.guild?.name,
+    );
+    await interaction.editReply({ content: decisionWords(outcome) });
+  },
+
+  async modal(interaction, id, ctx) {
+    if (id.action !== 'form') throw new UserError(STALE_COMPONENT);
+    const text = interaction.fields.getTextInputValue(ASK_INPUT);
+    const key = placeOf(id);
+    if (key === undefined) throw new UserError(refusedWithText(STALE_COMPONENT, text));
+    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+    const outcome = await ctx.meetupSafety.askAboutPlace({
+      serverId: guildIdOf(interaction),
+      nearChannelId: interaction.channelId ?? '',
+      member: { id: interaction.user.id, name: memberInfo(interaction).name },
+      key,
+      text,
+    });
+    if (outcome.kind !== 'sent') throw new UserError(refusedWithText(askWords(outcome), text));
+    await interaction.editReply({ content: ASK_SENT });
+  },
+};
diff --git a/src/components/index.ts b/src/components/index.ts
index 8112ef84..095bbbf6 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -6,6 +6,7 @@ import { gymViewControls } from '../commands/gyms/view-controls.js';
 import { regionControls } from '../commands/regions/controls.js';
 import { infoControls } from '../commands/meetups/info.js';
 import { meetupFormControls } from '../commands/meetups/meetup.js';
+import { placeAskControls } from '../commands/meetups/place-ask.js';
 import {
   targetControls,
   targetListControls,
@@ -35,6 +36,7 @@ export const components: readonly ComponentHandler[] = [
   meetupFormControls,
   meetupSafetyControls,
   meetupAppealControls,
+  placeAskControls,
   reportDecisionControls,
   wantControls,
   wantListControls,
diff --git a/src/domain/meetups/safety.test.ts b/src/domain/meetups/safety.test.ts
index db21d4bc..64ad8fc8 100644
--- a/src/domain/meetups/safety.test.ts
+++ b/src/domain/meetups/safety.test.ts
@@ -1,6 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import type { DroppedPin, KnownPlace } from '../geo/place.js';
 import {
+  askableAt,
   DEFAULT_FLAGGED_WORDS,
   flaggedWordIn,
   flaggedWordsOf,
@@ -169,3 +170,10 @@ describe('requestExpiry', () => {
     expect(mayRequestReview(NOW, NOW + 30 * 24 * HOUR)).toBe(true);
   });
 });
+
+describe('askableAt', () => {
+  it('lets members ask fourteen days after the refusal, or after the last Keep refused', () => {
+    expect(askableAt({ ruledAt: NOW, keptAt: null })).toBe(NOW + 14 * 24 * HOUR);
+    expect(askableAt({ ruledAt: NOW, keptAt: NOW + 20 * 24 * HOUR })).toBe(NOW + 34 * 24 * HOUR);
+  });
+});
diff --git a/src/domain/meetups/safety.ts b/src/domain/meetups/safety.ts
index 71fd6a88..ccf1fd4d 100644
--- a/src/domain/meetups/safety.ts
+++ b/src/domain/meetups/safety.ts
@@ -146,6 +146,17 @@ export type MeetupVerdict = ReturnType<typeof meetupPlaceVerdict>;
 
 const HOUR = 3_600_000;
 
+/**
+ * How long a place stays refused before members may ask the moderators about it (plan 8S-2;
+ * Matt asked for "a week or two"): counted per place, from the refusal or the last Keep refused.
+ */
+export const PLACE_ASK_WAIT_DAYS = 14;
+
+/** When members may first ask about a place refused at `ruledAt` and last kept at `keptAt`. */
+export function askableAt(ruling: { ruledAt: number; keptAt: number | null }): number {
+  return Math.max(ruling.ruledAt, ruling.keptAt ?? 0) + PLACE_ASK_WAIT_DAYS * 24 * HOUR;
+}
+
 /** How long a request waits at most for a moderator. */
 export const REQUEST_HOURS = 48;
 
diff --git a/src/render/place-asks.ts b/src/render/place-asks.ts
new file mode 100644
index 00000000..8254b7ab
--- /dev/null
+++ b/src/render/place-asks.ts
@@ -0,0 +1,139 @@
+import { ButtonStyle, ComponentType, type APIComponentInContainer } from 'discord.js';
+import { encodeCustomId } from '../discord/custom-id.js';
+import type { V2Message } from '../discord/party-gateway.js';
+import type { PlaceAskRecord, PlaceRulingRecord, RulingSource } from '../domain/meetups/records.js';
+import { askableAt } from '../domain/meetups/safety.js';
+import {
+  APPROVED_ACCENT,
+  EXPIRED_ACCENT,
+  PENDING_ACCENT,
+  REFUSED_ACCENT,
+  placeLine,
+} from './meetup-safety.js';
+import { postLink } from './notify-dm.js';
+import { memberText, plainLines, plainNoLinks, timestamp } from './text.js';
+import { actionRow, container, textDisplay, textMessage } from './v2.js';
+
+/**
+ * The custom-id kind of asks about refused places (plan 8S-2): `mplace:<token>:open` (Ask the
+ * moderators under `/meetup`'s refusal of a place; the token keeps the server and the place for
+ * half an hour), `mplace:<token>:form` (its form), and `mplace:<ask id>:allow|keep` on the
+ * moderators' post of an ask.
+ */
+export const ASK_KIND = 'mplace';
+
+/** How long an ask waits for a moderator before it expires (as an appeal). */
+export const ASK_OPEN_DAYS = 7;
+
+const SOURCE_WORDS: Record<RulingSource['kind'], string> = {
+  request: 'a meetup request',
+  report: 'a report',
+  ask: 'an ask',
+};
+
+/** Who ruled a place, when, and from which post: `Refused by **Mod** (<@…>) <t:…:F>, from […]`. */
+export function rulingLine(ruling: PlaceRulingRecord, serverId: string): string {
+  const who = memberText({ id: ruling.ruledBy, name: ruling.ruledByName ?? undefined });
+  const verb = ruling.ruling === 'refuse' ? 'Refused' : 'Allowed';
+  const from =
+    ruling.source === null
+      ? ''
+      : `, from [${SOURCE_WORDS[ruling.source.kind]}](<${postLink(
+          serverId,
+          ruling.source.channelId,
+          ruling.source.messageId,
+        )}>)`;
+  const kept = ruling.keptAt === null ? '' : `; kept refused ${timestamp(ruling.keptAt, 'F')}`;
+  return `${verb} by ${who} ${timestamp(ruling.ruledAt, 'F')}${from}${kept}`;
+}
+
+/**
+ * The moderators' post of an ask about a refused place (plan 8S-2): the member (`memberText`),
+ * the place (its official name too), its ruling (who, when, from which post), their words
+ * (`plainLines`, never cut), with Allow place and Keep refused while it is open, and what came of
+ * it afterwards.
+ */
+export function askMessage(
+  ask: PlaceAskRecord,
+  ruling: PlaceRulingRecord | undefined,
+  officialName?: string | null,
+): V2Message {
+  const member = memberText({ id: ask.memberId, name: ask.memberName ?? undefined });
+  const components: APIComponentInContainer[] = [
+    textDisplay(
+      `### Ask to allow a refused place\n${member} asks for meetups to be allowed at this place again.`,
+    ),
+    textDisplay(`**Where**\n${placeLine(ask.place, officialName)}`),
+    ...(ruling === undefined
+      ? []
+      : [textDisplay(`**Ruling**\n${rulingLine(ruling, ask.serverId)}`)]),
+    textDisplay(`**Their words**\n${plainLines(ask.text)}`),
+  ];
+  let accent = PENDING_ACCENT;
+  if (ask.status === 'open') {
+    const expires = ask.createdAt + ASK_OPEN_DAYS * 86_400_000;
+    components.push(
+      textDisplay(`-# Expires ${timestamp(expires, 'R')} unless a moderator decides first.`),
+      actionRow(
+        (
+          [
+            ['allow', 'Allow place', ButtonStyle.Success],
+            ['keep', 'Keep refused', ButtonStyle.Danger],
+          ] as const
+        ).map(([action, label, style]) => ({
+          type: ComponentType.Button,
+          style,
+          label,
+          custom_id: encodeCustomId({ kind: ASK_KIND, id: ask.id, action }),
+        })),
+      ),
+    );
+  } else {
+    const by =
+      ask.decidedBy === null
+        ? 'a moderator'
+        : memberText({ id: ask.decidedBy, name: ask.decidedByName ?? undefined });
+    const when = ask.decidedAt === null ? '' : ` ${timestamp(ask.decidedAt, 'R')}`;
+    accent =
+      ask.status === 'allowed'
+        ? APPROVED_ACCENT
+        : ask.status === 'expired'
+          ? EXPIRED_ACCENT
+          : REFUSED_ACCENT;
+    const again = askableAt({ ruledAt: 0, keptAt: ask.decidedAt ?? ask.createdAt });
+    components.push(
+      textDisplay(
+        ask.status === 'allowed'
+          ? `**Allowed** by ${by}${when}: meetups can be held there from now on.`
+          : ask.status === 'expired'
+            ? '**Expired**: no moderator decided in time. Members can ask again.'
+            : `**Kept refused** by ${by}${when}: members can ask again ${timestamp(again, 'R')}.`,
+      ),
+    );
+  }
+  return { v2: true, components: [container(accent, components)] };
+}
+
+/**
+ * What a member is told of their ask, naming the place and the server (`serverName`, when
+ * known): allowed, kept refused, or expired (nobody decided in time). Without links (a DM).
+ */
+export function askOutcomeDm(ask: PlaceAskRecord, serverName?: string): V2Message {
+  const place = `**${plainNoLinks(ask.place.title)}**`;
+  const on = serverName === undefined ? '' : ` on **${plainNoLinks(serverName)}**`;
+  if (ask.status === 'allowed') {
+    return textMessage(APPROVED_ACCENT, [
+      `A moderator allowed meetups at ${place}${on}: use \`/meetup\` there again.`,
+    ]);
+  }
+  if (ask.status === 'expired') {
+    return textMessage(EXPIRED_ACCENT, [
+      `No moderator decided on your ask about ${place}${on} in time. You can ask again: use ` +
+        '`/meetup` there and press Ask the moderators.',
+    ]);
+  }
+  return textMessage(REFUSED_ACCENT, [
+    `A moderator kept meetups refused at ${place}${on}. Members can ask again ` +
+      `${timestamp(askableAt({ ruledAt: 0, keptAt: ask.decidedAt ?? ask.createdAt }), 'R')}.`,
+  ]);
+}
diff --git a/src/services/meetup-safety.asks.test.ts b/src/services/meetup-safety.asks.test.ts
new file mode 100644
index 00000000..3a7c2817
--- /dev/null
+++ b/src/services/meetup-safety.asks.test.ts
@@ -0,0 +1,198 @@
+import { describe, expect, it } from 'vitest';
+import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import { LIBRARY, MODERATOR } from '../../test/support/meetup-safety-cases.js';
+import { meetupSafetyWith, MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
+import { buttonsOf, textOf } from '../../test/support/messages.js';
+import { BOB, CAROL } from '../../test/support/parties.js';
+import type { RulingSource } from '../domain/meetups/records.js';
+
+const DAY = 24 * 3_600_000;
+const SERVER = '412345678901234567';
+const KEY = { kind: 'stop' as const, id: LIBRARY.id };
+const mod = { id: MODERATOR, name: 'Mod' };
+
+/** Meetup safety with the Little Free Library refused by a moderator from a request's post. */
+async function refused() {
+  const made = await meetupSafetyWith();
+  const source: RulingSource = {
+    kind: 'request',
+    id: '00000000-0000-4000-8000-000000000001',
+    channelId: MOD_CHANNEL,
+    messageId: '600000000000000042',
+  };
+  const ruledAt = made.clock.now;
+  await made.storage.rule(
+    SERVER,
+    KEY,
+    'refuse',
+    { ...mod, at: ruledAt },
+    { place: LIBRARY, source },
+  );
+  const ask = (memberId = BOB, text = 'It is a public park now.') =>
+    made.safety.askAboutPlace({
+      serverId: SERVER,
+      nearChannelId: WEST_CHANNEL,
+      member: { id: memberId, name: memberId === BOB ? 'Bob' : 'Carol' },
+      key: KEY,
+      text,
+    });
+  const askPost = () => made.gateway.messagesIn(MOD_CHANNEL).at(-1);
+  return { ...made, ruledAt, source, ask, askPost };
+}
+
+describe('MeetupSafety: asks about a refused place', () => {
+  it('lets members ask fourteen days after the refusal, not before', async () => {
+    const made = await refused();
+    expect(await made.safety.askState(SERVER, KEY, BOB)).toEqual({
+      kind: 'wait',
+      until: made.ruledAt + 14 * DAY,
+    });
+    expect(await made.ask()).toEqual({ kind: 'wait', until: made.ruledAt + 14 * DAY });
+    made.clock.now = made.ruledAt + 14 * DAY;
+    expect(await made.safety.askState(SERVER, KEY, BOB)).toMatchObject({ kind: 'may' });
+    expect(await made.safety.askState(SERVER, { kind: 'stop', id: 'another.16' }, BOB)).toEqual({
+      kind: 'not-refused',
+    });
+  });
+
+  it('posts the ask with the place, its ruling and the member’s words, one at a time', async () => {
+    const made = await refused();
+    made.clock.now = made.ruledAt + 15 * DAY;
+    expect(await made.ask()).toMatchObject({ kind: 'sent' });
+    const post = made.askPost()?.message;
+    const text = textOf(post);
+    expect(text).toContain('### Ask to allow a refused place');
+    expect(text).toContain(
+      `**Bob** (<@${BOB}>) asks for meetups to be allowed at this place again.`,
+    );
+    expect(text).toContain('Near **Little Free Library** (PokéStop)');
+    expect(text).toContain(
+      `Refused by **Mod** (<@${MODERATOR}>) <t:${String(made.ruledAt / 1000)}:F>, from ` +
+        `[a meetup request](<https://discord.com/channels/${SERVER}/${MOD_CHANNEL}/600000000000000042>)`,
+    );
+    expect(text).toContain('**Their words**\nIt is a public park now.');
+    expect(buttonsOf(post).map((button) => button.label)).toEqual(['Allow place', 'Keep refused']);
+    expect(await made.ask(CAROL)).toEqual({ kind: 'open' });
+    expect(await made.safety.askState(SERVER, KEY, BOB)).toEqual({ kind: 'open' });
+  });
+
+  it('allows the place on Allow place, once, and tells the member by DM', async () => {
+    const made = await refused();
+    made.clock.now = made.ruledAt + 15 * DAY;
+    const sent = await made.ask();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    const decided = await made.safety.decideAsk(sent.ask.id, 'allow', mod, SERVER, 'Pine Town');
+    expect(decided).toMatchObject({ kind: 'done', ask: { status: 'allowed' } });
+    expect(await made.storage.ruling(SERVER, KEY)).toBe('allow');
+    expect(textOf(made.askPost()?.message)).toContain('**Allowed** by **Mod**');
+    expect(buttonsOf(made.askPost()?.message)).toEqual([]);
+    expect(textOf(made.dms.to(BOB)[0])).toContain(
+      'A moderator allowed meetups at **Little Free Library** on **Pine Town**',
+    );
+    expect(
+      await made.safety.decideAsk(sent.ask.id, 'keep', mod, SERVER, 'Pine Town'),
+    ).toMatchObject({ kind: 'decided-before', ask: { status: 'allowed' } });
+    expect(await made.safety.decideAsk(sent.ask.id, 'keep', mod, '412345678901234599')).toEqual({
+      kind: 'gone',
+    });
+  });
+
+  it('keeps the refusal on Keep refused: the fourteen days begin again', async () => {
+    const made = await refused();
+    made.clock.now = made.ruledAt + 15 * DAY;
+    const sent = await made.ask();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    await made.safety.decideAsk(sent.ask.id, 'keep', mod, SERVER, 'Pine Town');
+    expect(await made.storage.ruling(SERVER, KEY)).toBe('refuse');
+    expect(await made.safety.askState(SERVER, KEY, BOB)).toEqual({
+      kind: 'wait',
+      until: made.clock.now + 14 * DAY,
+    });
+    expect(textOf(made.askPost()?.message)).toContain('**Kept refused** by **Mod**');
+    expect(textOf(made.dms.to(BOB)[0])).toContain(
+      'A moderator kept meetups refused at **Little Free Library** on **Pine Town**',
+    );
+  });
+
+  it('expires an ask nobody decided in seven days, and the member may ask again', async () => {
+    const made = await refused();
+    made.clock.now = made.ruledAt + 15 * DAY;
+    await made.ask();
+    made.clock.now += 7 * DAY;
+    await made.safety.expire();
+    expect(textOf(made.askPost()?.message)).toContain('**Expired**: no moderator decided in time.');
+    expect(textOf(made.dms.to(BOB)[0])).toContain('You can ask again');
+    expect(await made.safety.askState(SERVER, KEY, BOB)).toMatchObject({ kind: 'may' });
+  });
+
+  it('refuses a blocked member before it looks at the place', async () => {
+    const made = await refused();
+    made.clock.now = made.ruledAt + 15 * DAY;
+    await made.storage.addBlock(SERVER, BOB, { ...mod, at: made.clock.now });
+    expect(await made.safety.askState(SERVER, KEY, BOB)).toEqual({ kind: 'blocked' });
+    expect(await made.ask()).toEqual({ kind: 'blocked' });
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
+  });
+
+  it('says nothing is kept refused where the ruling was undone meanwhile', async () => {
+    const made = await refused();
+    made.clock.now = made.ruledAt + 15 * DAY;
+    const sent = await made.ask();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    await made.storage.rule(SERVER, KEY, 'allow', { ...mod, at: made.clock.now });
+    expect(await made.safety.decideAsk(sent.ask.id, 'keep', mod, SERVER)).toEqual({
+      kind: 'not-refused',
+    });
+    expect(made.dms.to(BOB)).toEqual([]);
+  });
+
+  it('lets one of two decisions of an ask win, and takes one of two asks at once', async () => {
+    const made = await refused();
+    made.clock.now = made.ruledAt + 15 * DAY;
+    const both = await Promise.all([made.ask(BOB), made.ask(CAROL)]);
+    expect(both.map((one) => one.kind).sort()).toEqual(['open', 'sent']);
+    const sent = both.find((one) => one.kind === 'sent');
+    if (sent?.kind !== 'sent') throw new Error('none sent');
+    const decided = await Promise.all([
+      made.safety.decideAsk(sent.ask.id, 'allow', mod, SERVER),
+      made.safety.decideAsk(sent.ask.id, 'keep', mod, SERVER),
+    ]);
+    expect(decided.map((one) => one.kind).sort()).toEqual(['decided-before', 'done']);
+    expect(made.dms.jobs).toHaveLength(1);
+  });
+
+  it('closes an ask that went astray when it is looked at, so that it may be asked again', async () => {
+    const made = await refused();
+    made.clock.now = made.ruledAt + 15 * DAY;
+    await made.ask();
+    made.clock.now += 8 * DAY;
+    expect(await made.safety.askState(SERVER, KEY, CAROL)).toMatchObject({ kind: 'may' });
+    expect([...made.storage.asks.values()].map((one) => one.status)).toEqual(['expired']);
+  });
+
+  it('keeps nothing when the moderators’ channel is not there', async () => {
+    const made = await refused();
+    made.clock.now = made.ruledAt + 15 * DAY;
+    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
+    expect(await made.ask()).toEqual({ kind: 'not-sent' });
+    made.gateway.failing.delete('sendMessage');
+    expect(await made.safety.askState(SERVER, KEY, BOB)).toMatchObject({ kind: 'may' });
+  });
+
+  it('keeps where a ruling of a request came from', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    await made.safety.decide(request.id, 'refuse-forever', mod, SERVER);
+    expect(await made.storage.rulingRecord(SERVER, KEY)).toMatchObject({
+      ruling: 'refuse',
+      ruledByName: 'Mod',
+      place: LIBRARY,
+      source: {
+        kind: 'request',
+        id: request.id,
+        channelId: MOD_CHANNEL,
+        messageId: request.messageId,
+      },
+    });
+  });
+});
diff --git a/src/services/meetup-safety.ts b/src/services/meetup-safety.ts
index d737c26f..3d61230b 100644
--- a/src/services/meetup-safety.ts
+++ b/src/services/meetup-safety.ts
@@ -11,9 +11,12 @@ import type {
   RequestDecision,
   RequestSource,
   RulingSource,
+  PlaceAskRecord,
+  PlaceRulingRecord,
 } from '../domain/meetups/records.js';
 import { isMeetup, type MeetupParty } from '../domain/party/party.js';
 import {
+  askableAt,
   flaggedWordsOf,
   mayRequestReview,
   meetupPlaceVerdict,
@@ -21,6 +24,7 @@ import {
   rulingKeyOf,
   type MeetupVerdict,
   type PlaceRuling,
+  type RulingKey,
 } from '../domain/meetups/safety.js';
 import type { MemberInfo } from '../domain/party/attendance.js';
 import { tidyDescription } from '../domain/party/meetup.js';
@@ -35,9 +39,12 @@ import {
   requestOutcomeDm,
 } from '../render/meetup-safety.js';
 import { postLink } from '../render/notify-dm.js';
+import { ASK_OPEN_DAYS, askMessage, askOutcomeDm } from '../render/place-asks.js';
 import { DM_PRIORITY, type DmSender } from './dm-sender.js';
 import type { MeetupOutcome, PartyService } from './party-service.js';
 import type { GymProvider } from './gym-directory.js';
+import type { WayspotProvider } from './wayspot-directory.js';
+import { addressLine } from '../domain/geo/google.js';
 import type { PartyProvider } from './party-store.js';
 
 /** Who asks for a check of a place: the maker, in a server, and whether they are staff. */
@@ -146,6 +153,8 @@ export interface MeetupSafetyOptions {
   dms: DmSender;
   /** The gyms, by which a gym is checked by its official name and its nickname alike. */
   gyms?: Pick<GymProvider, 'get'>;
+  /** The kept Wayspots: a PokéStop asked about whose ruling kept no place (one of 8S-1). */
+  wayspots?: Pick<WayspotProvider, 'byId'>;
   settings: Settings;
   log: Logger;
   now?: () => number;
@@ -580,8 +589,18 @@ export class MeetupSafety {
     ruling: PlaceRuling,
     by: Decider,
   ): Promise<void> {
-    const key = rulingKeyOf(request.place);
-    if (key !== undefined) await this.options.storage.rule(request.serverId, key, ruling, by);
+    const { place } = request;
+    const key = rulingKeyOf(place);
+    if (key === undefined || place.kind === 'pin') return;
+    await this.options.storage.rule(request.serverId, key, ruling, by, {
+      place,
+      source: {
+        kind: 'request',
+        id: request.id,
+        channelId: request.channelId,
+        messageId: request.messageId,
+      },
+    });
   }
 
   /**
@@ -912,6 +931,235 @@ export class MeetupSafety {
     return { kind: 'done', appeal: decided };
   }
 
+  /**
+   * Whether a member may ask the moderators about a place now (plan 8S-2): `may` (with its
+   * ruling), `not-refused` (no refusal of it stands), `open` (an ask of it is with the
+   * moderators), or `wait` until `PLACE_ASK_WAIT_DAYS` after the refusal or its last Keep
+   * refused. An open ask that went astray (never posted, or nobody decided in time) is closed
+   * first.
+   */
+  async askState(serverId: string, key: RulingKey, memberId: string): Promise<AskState> {
+    const { storage } = this.options;
+    // A blocked member is refused by the block before the place is looked at (8S-1's order).
+    if (await this.blocked(serverId, memberId, false)) return { kind: 'blocked' };
+    const ruling = await storage.rulingRecord(serverId, key);
+    if (ruling?.ruling !== 'refuse') return { kind: 'not-refused' };
+    const open = await storage.openAsk(serverId, key);
+    if (open && !(this.isStaleAsk(open) && (await this.expireAsk(open, false)))) {
+      return { kind: 'open' };
+    }
+    const until = askableAt(ruling);
+    return this.now() < until ? { kind: 'wait', until } : { kind: 'may', ruling };
+  }
+
+  /**
+   * A member's ask to allow a place refused for good (Ask the moderators under `/meetup`'s
+   * refusal; plan 8S-2): kept (open, one per place: `open` for the member who comes second) and
+   * posted in the moderators' channel with the place, its ruling and their words, with Allow
+   * place and Keep refused. Refused while it may not be asked (`askState`). A post that fails
+   * leaves nothing behind (`not-sent`, logged).
+   */
+  async askAboutPlace(ask: {
+    serverId: string;
+    nearChannelId: string;
+    member: { id: string; name?: string | undefined };
+    key: RulingKey;
+    text: string;
+  }): Promise<AskOutcome> {
+    const { storage, gateway, log } = this.options;
+    const state = await this.askState(ask.serverId, ask.key, ask.member.id);
+    if (state.kind !== 'may') return state;
+    // The place as it was ruled; a ruling of 8S-1 kept none: the gym or Wayspot as it is now.
+    const place = state.ruling.place ?? this.placeNow(ask.key);
+    if (place === undefined) {
+      log.warn({ server: ask.serverId, place: ask.key }, 'an ask names a place that is gone');
+      return { kind: 'not-sent' };
+    }
+    const name = this.channelName;
+    const channelId = name === undefined ? undefined : gateway.findChannel(ask.nearChannelId, name);
+    if (channelId === undefined) {
+      log.warn(
+        { server: ask.serverId, channel: name },
+        `the moderators' channel #${name ?? ''} is not there: an ask about a place was not sent`,
+      );
+      return { kind: 'not-sent' };
+    }
+    const record: PlaceAskRecord = {
+      id: randomUUID(),
+      serverId: ask.serverId,
+      key: state.ruling.key,
+      place,
+      memberId: ask.member.id,
+      memberName: ask.member.name ?? null,
+      text: ask.text.trim(),
+      createdAt: this.now(),
+      status: 'open',
+      channelId,
+      messageId: null,
+      decidedBy: null,
+      decidedByName: null,
+      decidedAt: null,
+    };
+    if ((await storage.addAsk(record)) === 'open') return { kind: 'open' };
+    let messageId: string | undefined;
+    try {
+      messageId = await gateway.sendMessage(
+        channelId,
+        askMessage(record, state.ruling, this.officialName(place)),
+      );
+      if (messageId === undefined) throw new Error('the moderators’ channel is gone');
+      await storage.setAskPost(record.id, channelId, messageId);
+    } catch (err) {
+      log.warn({ err, ask: record.id }, 'could not send an ask about a place to the moderators');
+      if (messageId !== undefined) {
+        await gateway.deleteMessage(channelId, messageId).catch((deleteErr: unknown) => {
+          log.warn({ err: deleteErr }, 'could not take back the post of an ask');
+        });
+      }
+      await storage.discardAsk(record.id).catch((discardErr: unknown) => {
+        log.error({ err: discardErr, ask: record.id }, 'could not forget an ask');
+      });
+      return { kind: 'not-sent' };
+    }
+    return { kind: 'sent', ask: { ...record, messageId } };
+  }
+
+  /**
+   * A moderator's decision of an ask: Allow place allows the place for good (the ask the
+   * ruling's source), Keep refused keeps it refused and the 14 days begin again; one step each,
+   * the first press winning (`decided-before`). The post is edited to the outcome and the member
+   * told by DM, the server named. An ask of another server is `gone`.
+   */
+  async decideAsk(
+    askId: string,
+    decision: 'allow' | 'keep',
+    moderator: { id: string; name?: string | undefined },
+    serverId: string,
+    serverName?: string,
+  ): Promise<AskDecision> {
+    const { storage, gateway, dms, log } = this.options;
+    const ask = await storage.ask(askId);
+    if (!ask || ask.serverId !== serverId) return { kind: 'gone' };
+    if (ask.status !== 'open') return { kind: 'decided-before', ask };
+    const now = this.now();
+    const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: now };
+    const kept = decision === 'keep' ? await storage.keepOnAsk(ask, by) : undefined;
+    // Undone or allowed meanwhile: nothing is kept refused, nobody told.
+    if (kept === 'not-refused') return { kind: 'not-refused' };
+    const decidedNow = kept === undefined ? await storage.allowOnAsk(ask, by) : kept === 'kept';
+    if (!decidedNow) {
+      const later = await storage.ask(ask.id);
+      return later ? { kind: 'decided-before', ask: later } : { kind: 'gone' };
+    }
+    const decided: PlaceAskRecord = {
+      ...ask,
+      status: decision === 'allow' ? 'allowed' : 'kept',
+      decidedBy: by.id,
+      decidedByName: by.name,
+      decidedAt: by.at,
+    };
+    await this.showAsk(decided);
+    dms.send({
+      userId: ask.memberId,
+      message: askOutcomeDm(decided, serverName ?? gateway.guildName(ask.serverId)),
+      priority: DM_PRIORITY.normal,
+      eventAt: now,
+      expiresAt: now + DAY,
+    });
+    log.info({ ask: ask.id, decision, moderator: by.id }, 'an ask about a place was decided');
+    return { kind: 'done', ask: decided };
+  }
+
+  /** Shows an ask in its post as it is now, with its ruling; a failure is logged. */
+  private async showAsk(ask: PlaceAskRecord): Promise<void> {
+    const { storage, gateway, log } = this.options;
+    if (ask.channelId === null || ask.messageId === null) return;
+    try {
+      const ruling = await storage.rulingRecord(ask.serverId, ask.key);
+      await gateway.editMessage(
+        ask.channelId,
+        ask.messageId,
+        askMessage(ask, ruling, this.officialName(ask.place)),
+      );
+    } catch (err) {
+      log.warn({ err, ask: ask.id }, 'could not show the outcome of an ask');
+    }
+  }
+
+  /** Whether an open ask is stale: never posted after a while, or open too long. */
+  private isStaleAsk(ask: PlaceAskRecord): boolean {
+    const { unpostedBefore, openedBefore } = this.staleAskBounds();
+    return (
+      (ask.messageId === null && ask.createdAt <= unpostedBefore) || ask.createdAt <= openedBefore
+    );
+  }
+
+  private staleAskBounds(): { unpostedBefore: number; openedBefore: number } {
+    const now = this.now();
+    return { unpostedBefore: now - STRANDED_MS, openedBefore: now - ASK_OPEN_DAYS * DAY };
+  }
+
+  /**
+   * Closes a stale open ask as expired (false when it was decided meanwhile): its post says so,
+   * and with `tell` the member hears they may ask again.
+   */
+  private async expireAsk(ask: PlaceAskRecord, tell: boolean): Promise<boolean> {
+    const { storage, gateway, dms } = this.options;
+    if (!(await storage.expireAsk(ask.id))) return false;
+    const expired: PlaceAskRecord = { ...ask, status: 'expired' };
+    const shown = this.showAsk(expired);
+    if (tell) {
+      await shown;
+      const now = this.now();
+      dms.send({
+        userId: ask.memberId,
+        message: askOutcomeDm(expired, gateway.guildName(ask.serverId)),
+        priority: DM_PRIORITY.normal,
+        eventAt: now,
+        expiresAt: now + DAY,
+      });
+    }
+    return true;
+  }
+
+  /** A ruled place as it is now, where its ruling kept none: the gym or the kept Wayspot. */
+  private placeNow(key: RulingKey): KnownPlace | undefined {
+    if (key.kind === 'gym') {
+      const gym = /^\d+$/u.test(key.id) ? this.options.gyms?.get(Number(key.id)) : undefined;
+      return (
+        gym && {
+          kind: 'gym',
+          id: key.id,
+          title: gym.nickname || gym.name,
+          lat: gym.lat,
+          lon: gym.lon,
+          address: addressLine(gym.geodata) || null,
+          image: gym.imageUrl,
+        }
+      );
+    }
+    const wayspot = this.options.wayspots?.byId(key.id);
+    return (
+      wayspot && {
+        kind: key.kind,
+        id: wayspot.id,
+        title: wayspot.title,
+        lat: wayspot.lat,
+        lon: wayspot.lon,
+        address: null,
+        image: null,
+      }
+    );
+  }
+
+  /** A gym's official name where its title (the nickname first) shows another; else null. */
+  officialName(place: Place): string | null {
+    if (place.kind !== 'gym' || !/^\d+$/u.test(place.id)) return null;
+    const gym = this.options.gyms?.get(Number(place.id));
+    if (!gym?.nickname || gym.nickname === gym.name) return null;
+    return gym.name;
+  }
+
   /**
    * Expires the pending requests whose time is up (with the clock's tick): each is marked
    * expired, its post edited and its maker told. Answers how many. Also while the safety is off:
@@ -938,6 +1186,13 @@ export class MeetupSafety {
         log.error({ err, appeal: appeal.id }, 'could not close an appeal nobody decided');
       }
     }
+    for (const ask of await storage.staleAsks(this.staleAskBounds())) {
+      try {
+        await this.expireAsk(ask, true);
+      } catch (err) {
+        log.error({ err, ask: ask.id }, 'could not close an ask nobody decided');
+      }
+    }
     for (const request of await storage.strandedApprovals(now - STRANDED_MS)) {
       try {
         await this.settleStranded(request);
@@ -1095,6 +1350,26 @@ const APPEAL_OPEN_DAYS = 7;
 /** What the post of a meetup closed because its maker was blocked says last. */
 export const CLOSED_BY_MODERATORS = 'This meetup was closed by the moderators.';
 
+/** Whether a member may ask the moderators about a refused place now (`askState`). */
+export type AskState =
+  | { kind: 'may'; ruling: PlaceRulingRecord }
+  | { kind: 'blocked' }
+  | { kind: 'not-refused' }
+  | { kind: 'open' }
+  | { kind: 'wait'; until: number };
+
+/** What came of an ask about a place. */
+export type AskOutcome =
+  Exclude<AskState, { kind: 'may' }> | { kind: 'sent'; ask: PlaceAskRecord } | { kind: 'not-sent' };
+
+/** What came of a moderator's press on an ask's post. */
+export type AskDecision =
+  | { kind: 'gone' }
+  | { kind: 'decided-before'; ask: PlaceAskRecord }
+  /** Keep refused where no refusal stands any more (undone or allowed meanwhile). */
+  | { kind: 'not-refused' }
+  | { kind: 'done'; ask: PlaceAskRecord };
+
 /** Whether a member may appeal their block now. */
 export type AppealState =
   | { kind: 'may'; block: MeetupBlock }
diff --git a/src/web/meetup-make.test.ts b/src/web/meetup-make.test.ts
index 73548e9f..801304d9 100644
--- a/src/web/meetup-make.test.ts
+++ b/src/web/meetup-make.test.ts
@@ -32,6 +32,7 @@ import {
   MEETUP_TOO_SOON,
   NO_INFORMATION,
   NO_MEETUP_HERE,
+  ASK_ON_DISCORD,
 } from '../commands/meetups/meetup.js';
 import { Throttles } from '../discord/throttle.js';
 import { isMeetup, type MeetupParty } from '../domain/party/party.js';
@@ -218,6 +219,15 @@ describe('making a meetup on the map', () => {
     await map.made.storage.rule(FAKE_GUILD_ID, { kind: 'gym', id: '2' }, 'refuse', MOD);
     const refused = await map.make(asked({ kind: 'gym', id: '2' }));
     expect(refused).toMatchObject({ status: 422, json: { ok: false, text: NO_MEETUP_HERE } });
+    // Refused long enough ago: the members may ask the moderators, on Discord.
+    await map.made.storage.rule(FAKE_GUILD_ID, { kind: 'gym', id: '2' }, 'refuse', {
+      ...MOD,
+      at: PARTY_NOW - 15 * 24 * 3_600_000,
+    });
+    expect((await map.make(asked({ kind: 'gym', id: '2' }))).json).toEqual({
+      ok: false,
+      text: `${NO_MEETUP_HERE} ${ASK_ON_DISCORD}`,
+    });
     const soon = await map.make(asked({ lat: 40.08, lon: -80.08 }, { start: 'in 30' }));
     expect(soon).toMatchObject({ status: 422, json: { ok: false, text: MEETUP_TOO_SOON } });
     const unread = await map.make(asked({ kind: 'gym', id: '1' }, { start: 'whenever' }));
diff --git a/src/web/meetup-routes.ts b/src/web/meetup-routes.ts
index 9a8a055f..503ab302 100644
--- a/src/web/meetup-routes.ts
+++ b/src/web/meetup-routes.ts
@@ -3,9 +3,11 @@ import { z } from 'zod';
 import type { AppContext } from '../app-context.js';
 import { describeAs } from '../commands/meetups/info.js';
 import {
+  ASK_ON_DISCORD,
   makeMeetupAs,
   MEETUP_THROTTLE,
   NO_INFORMATION,
+  NO_MEETUP_HERE,
   NO_MEETUPS_FOR_YOU,
   refusalOf,
 } from '../commands/meetups/meetup.js';
@@ -29,6 +31,7 @@ import { UserError } from '../discord/errors.js';
 import type { MemberStanding } from '../discord/member-directory.js';
 import type { MemberAccess } from '../discord/party-gateway.js';
 import type { Place } from '../domain/geo/place.js';
+import { rulingKeyOf } from '../domain/meetups/safety.js';
 import { tidyDescription } from '../domain/party/meetup.js';
 import {
   isMeetup,
@@ -306,6 +309,15 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
       blocked: false,
     });
     const refusal = refusalOf(verdict, startTime, now);
+    if (refusal === NO_MEETUP_HERE) {
+      // The map has no Ask the moderators: it says where to find it (plan 8S-2).
+      const key = rulingKeyOf(where.place);
+      const state =
+        key === undefined
+          ? undefined
+          : await ctx.meetupSafety.askState(guild, key, userId).catch(() => undefined);
+      return refuse(reply, 422, state?.kind === 'may' ? `${refusal} ${ASK_ON_DISCORD}` : refusal);
+    }
     if (refusal !== undefined) return refuse(reply, 422, refusal);
     if (tidyDescription(body.data.info) === null) return refuse(reply, 422, NO_INFORMATION);
     const throttled = throttledOnTheMap(
````

### Task 7: Plan 8S-2 T7: The places' list for staff, and two leftovers of 8S-1

Prototype commit: `0e06aaa12be06c7cdfd9ff0d6da77954d5f2e8a6`

/places (Manage Messages, requireManagement) with a place shows its ruling, who made it,
when and from which post, with Undo ruling (logged, nobody told); without one it lists the
refused and allowed places, pending requests, open asks, blocked members with Lift block (as
an appeal's, with its DM), open appeals and open reports, each with the way to its post,
paged with arrows. A request refused or expired keeps Block member while its maker is not
blocked (8S-1 review W7), and the moderators' posts name a gym's official name beside its
nickname.

**Files:**

```
 src/commands/index.ts                                   |   2 +
 src/commands/meetups/places.test.ts                     | 237 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/meetups/places.ts                          | 195 ++++++++++++++++++++++++++++++++++++++++++++++
 src/components/index.ts                                 |   2 +
 src/components/meetup-appeal.ts                         |   2 +
 src/components/meetup-safety.ts                         |  13 ++++
 src/db/repositories/meetup-safety-repository.db.test.ts |  44 ++++++++++-
 src/db/repositories/meetup-safety-repository.ts         | 115 +++++++++++++++++++++++++++
 src/db/repositories/report-repository.db.test.ts        |  30 ++-----
 src/domain/meetups/records.ts                           |  20 +++++
 src/render/meetup-safety.ts                             |  54 ++++++++++++-
 src/render/moderation.test.ts                           |   2 +-
 src/render/place-asks.ts                                |   8 +-
 src/render/places.test.ts                               |  45 +++++++++++
 src/render/places.ts                                    | 232 ++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/meetup-safety.leftovers.test.ts            |  85 ++++++++++++++++++++
 src/services/meetup-safety.test.ts                      |   7 +-
 src/services/meetup-safety.ts                           | 182 ++++++++++++++++++++++++++++++++++++++++++-
 src/services/moderation-reports.ts                      |   5 ++
 test/support/lock-waits.ts                              |  35 +++++++++
 test/support/meetup-safety-cases.ts                     |  51 ++++++++++++
 test/support/meetup-safety.ts                           |  85 ++++++++++++++++----
 22 files changed, 1399 insertions(+), 52 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/meetups/places.test.ts src/render/moderation.test.ts src/render/places.test.ts src/services/meetup-safety.leftovers.test.ts src/services/meetup-safety.test.ts`, `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/repositories/meetup-safety-repository.db.test.ts src/db/repositories/report-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 0e06aaa12be06c7cdfd9ff0d6da77954d5f2e8a6 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-2 T7: The places' list for staff, and two leftovers of 8S-1`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/commands/index.ts b/src/commands/index.ts
index 9a1e711c..770c12b6 100644
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -4,6 +4,7 @@ import { friendCode, nickname } from './friends/friends.js';
 import { gym } from './gyms/index.js';
 import { info } from './meetups/info.js';
 import { meetup } from './meetups/meetup.js';
+import { places } from './meetups/places.js';
 import {
   coming,
   done,
@@ -62,6 +63,7 @@ export const commands: readonly CommandModule[] = [
   readScreenshot,
   train,
   meetup,
+  places,
   join,
   coming,
   interested,
diff --git a/src/commands/meetups/places.test.ts b/src/commands/meetups/places.test.ts
new file mode 100644
index 00000000..619718a1
--- /dev/null
+++ b/src/commands/meetups/places.test.ts
@@ -0,0 +1,237 @@
+import { MessageFlags, PermissionFlagsBits } from 'discord.js';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import {
+  answered,
+  asV2,
+  fakeButton,
+  fakeChatInput,
+  sent,
+  type FakeInteraction,
+} from '../../../test/support/fake-interactions.js';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { MOD, MODERATOR, newAppeal } from '../../../test/support/meetup-safety-cases.js';
+import { MOD_CHANNEL } from '../../../test/support/meetup-safety-service.js';
+import { buttonsOf, textOf } from '../../../test/support/messages.js';
+import { BOB, CAROL, PARTY_NOW } from '../../../test/support/parties.js';
+import { reportedMeetup } from '../../../test/support/reports-service.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { FakeMemberDirectory } from '../../../test/support/members.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { places, placesControls } from './places.js';
+
+const KEY = { kind: 'gym' as const, id: '2' };
+
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'] });
+  vi.setSystemTime(PARTY_NOW);
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+async function setup() {
+  const made = await reportedMeetup();
+  const members = new FakeMemberDirectory();
+  const { ctx } = createTestContext({
+    members,
+    partyService: made.service,
+    attendance: made.attendance,
+    parties: made.store,
+    regions: made.regions,
+    reports: made.reports,
+    meetupSafety: made.safety,
+  });
+  const router = new InteractionRouter(ctx, [places], [placesControls]);
+  const handle = async <I extends FakeInteraction>(interaction: I) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const run = (options: Record<string, string> = {}, roleNames = ['Moderator']) =>
+    handle(
+      fakeChatInput({
+        commandName: 'places',
+        userId: MODERATOR,
+        displayName: 'Mod',
+        roleNames,
+        channelId: WEST_CHANNEL,
+        options,
+      }),
+    );
+  const shown = (used: FakeInteraction): V2Message => asV2(answered(used));
+  const press = (customId: string) =>
+    handle(
+      fakeButton({
+        customId,
+        userId: MODERATOR,
+        displayName: 'Mod',
+        roleNames: ['Moderator'],
+        ephemeralMessage: true,
+        v2Message: true,
+      }),
+    );
+  return { ...made, members, run, shown, press };
+}
+
+describe('/places', () => {
+  it('is for staff alone, hidden from the others by Manage Messages', async () => {
+    expect(places.data.toJSON().default_member_permissions).toBe(
+      String(PermissionFlagsBits.ManageMessages),
+    );
+    const made = await setup();
+    const used = await made.run({}, ['Valor']);
+    expect(sent(used.reply)).toEqual({
+      content: 'Only admins and moderators can do that.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it('shows a place’s ruling, who made it, when and from where, and undoes it', async () => {
+    const made = await setup();
+    const held = await made.held({
+      place: {
+        kind: 'gym',
+        id: '2',
+        title: 'Old Stone Fountain',
+        lat: 40.06,
+        lon: -80.06,
+        address: null,
+        image: null,
+      },
+    });
+    await made.safety.decide(
+      held.id,
+      'refuse-forever',
+      { id: MODERATOR, name: 'Mod' },
+      made.gateway.guildId,
+    );
+    const page = made.shown(await made.run({ place: 'gym:2' }));
+    const text = textOf(page);
+    expect(text).toContain('### Old Stone Fountain');
+    expect(text).toContain(`Refused by **Mod** (<@${MODERATOR}>)`);
+    expect(text).toContain(`[a meetup request](<https://discord.com/channels/`);
+    expect(buttonsOf(page).map((button) => [button.label, button.customId])).toEqual([
+      ['Undo ruling', 'places:gym:undo:2'],
+    ]);
+    const undone = await made.press('places:gym:undo:2');
+    expect(textOf(asV2(sent(undone.editReply)))).toContain(
+      `Undone by **Mod** (<@${MODERATOR}>): a meetup there is checked by its name again.`,
+    );
+    expect(await made.storage.ruling(made.gateway.guildId, KEY)).toBeUndefined();
+    expect(made.entries.some((entry) => entry.msg === 'a ruling of a place was undone')).toBe(true);
+    expect(textOf(made.shown(await made.run({ place: 'gym:2' })))).toContain(
+      'No ruling: a meetup there is checked by its name.',
+    );
+  });
+
+  it('lists the rulings and everything open, each with the way to its post', async () => {
+    const made = await setup();
+    const server = made.gateway.guildId;
+    await made.storage.rule(server, KEY, 'refuse', MOD);
+    await made.storage.rule(server, { kind: 'gym', id: '3' }, 'allow', MOD);
+    await made.held();
+    await made.storage.addBlock(server, BOB, MOD);
+    await made.storage.addAppeal(newAppeal(1, { serverId: server, memberId: BOB }));
+    await made.report();
+    const page = made.shown(await made.run());
+    const text = textOf(page);
+    for (const section of [
+      '**Refused places** (1)',
+      '**Allowed places** (1)',
+      '**Pending requests** (1)',
+      '**Blocked members** (1)',
+      '**Open appeals** (1)',
+      '**Open reports** (1)',
+    ]) {
+      expect(text).toContain(section);
+    }
+    expect(text).toContain('**Old Stone Fountain** (gym)');
+    expect(text).toContain(`[post](<https://discord.com/channels/${server}/${MOD_CHANNEL}/`);
+    expect(buttonsOf(page).map((button) => button.label)).toContain('Lift block');
+  });
+
+  it('names a blocked member by the name they had, else as the server knows them now', async () => {
+    const made = await setup();
+    await made.storage.addBlock(made.gateway.guildId, CAROL, MOD, 'Carol');
+    await made.storage.addBlock(made.gateway.guildId, BOB, MOD);
+    made.members.add(BOB, 'Bob Now');
+    const text = textOf(made.shown(await made.run()));
+    expect(text).toContain(`**Carol** (<@${CAROL}>) blocked by`);
+    expect(text).toContain(`**Bob Now** (<@${BOB}>) blocked by`);
+  });
+
+  it('lifts a block from the list, closes their open appeal, tells the member once', async () => {
+    const made = await setup();
+    await made.storage.addBlock(made.gateway.guildId, CAROL, MOD);
+    const appealed = await made.safety.appeal({
+      serverId: made.gateway.guildId,
+      nearChannelId: WEST_CHANNEL,
+      member: { id: CAROL, name: 'Carol' },
+      text: 'Please lift it.',
+    });
+    if (appealed.kind !== 'sent') throw new Error(appealed.kind);
+    const page = made.shown(await made.run());
+    const lift = buttonsOf(page).find((button) => button.label === 'Lift block')?.customId ?? '';
+    expect(lift).toBe(`places:${CAROL}:lift:0`);
+    const lifted = await made.press(lift);
+    // Acknowledged before the work, the list shown again in its place.
+    expect(lifted.deferUpdate).toHaveBeenCalled();
+    expect(textOf(asV2(sent(lifted.editReply)))).not.toContain('**Blocked members**');
+    expect(await made.storage.appeal(appealed.appeal.id)).toMatchObject({ status: 'lifted' });
+    const appealPost = made.gateway
+      .messagesIn(MOD_CHANNEL)
+      .find((one) => one.id === appealed.appeal.messageId)?.message;
+    expect(textOf(appealPost)).toContain('**Lifted**');
+    expect(made.dms.to(CAROL)).toHaveLength(1);
+    expect(await made.storage.block(made.gateway.guildId, CAROL)).toBeUndefined();
+    expect(textOf(made.dms.to(CAROL)[0])).toContain('A moderator lifted your block');
+  });
+
+  it('pages a long list with arrows', async () => {
+    const made = await setup();
+    for (let id = 1; id <= 12; id++) {
+      await made.storage.rule(made.gateway.guildId, { kind: 'gym', id: String(id) }, 'refuse', {
+        ...MOD,
+        at: MOD.at + id,
+      });
+    }
+    const first = made.shown(await made.run());
+    expect(textOf(first)).toContain('Page 1 of 2');
+    expect(buttonsOf(first).map((button) => [button.label, button.customId])).toEqual([
+      ['Next ▶', 'places:list:page:1'],
+    ]);
+    const second = asV2(sent((await made.press('places:list:page:1')).editReply));
+    expect(textOf(second)).toContain('Page 2 of 2');
+    expect(buttonsOf(second).map((button) => [button.label, button.customId])).toEqual([
+      ['◀ Previous', 'places:list:page:0'],
+    ]);
+  });
+
+  it('closes the place’s open ask when its ruling is undone, telling nobody', async () => {
+    const made = await setup();
+    const server = made.gateway.guildId;
+    const KEY = { kind: 'gym' as const, id: '2' };
+    await made.storage.rule(server, KEY, 'refuse', { ...MOD, at: PARTY_NOW - 20 * 86_400_000 });
+    const asked = await made.safety.askAboutPlace({
+      serverId: server,
+      nearChannelId: WEST_CHANNEL,
+      member: { id: BOB, name: 'Bob' },
+      key: KEY,
+      text: 'A park.',
+    });
+    if (asked.kind !== 'sent') throw new Error(asked.kind);
+    await made.press('places:gym:undo:2');
+    expect(await made.storage.ask(asked.ask.id)).toMatchObject({ status: 'undone' });
+    const askPost = made.gateway
+      .messagesIn(MOD_CHANNEL)
+      .find((one) => one.id === asked.ask.messageId)?.message;
+    expect(textOf(askPost)).toContain('**Ruling undone**');
+    expect(made.dms.to(BOB)).toEqual([]);
+  });
+
+  it('says that the place option names a pin, which has no ruling', async () => {
+    const made = await setup();
+    const used = await made.run({ place: '40.05,-80.05' });
+    expect(textOf(made.shown(used))).toContain('A pin has no ruling');
+  });
+});
diff --git a/src/commands/meetups/places.ts b/src/commands/meetups/places.ts
new file mode 100644
index 00000000..79994a72
--- /dev/null
+++ b/src/commands/meetups/places.ts
@@ -0,0 +1,195 @@
+import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import { SAFETY_THROTTLE } from '../../components/meetup-safety.js';
+import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
+import { UserError } from '../../discord/errors.js';
+import { guildIdOf, requireGuild, requireManagement } from '../../discord/guards.js';
+import { showInPlace, v2Answer } from '../../discord/late-reply.js';
+import { memberInfo } from '../../discord/member-info.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { addressLine } from '../../domain/geo/google.js';
+import type { KnownPlace } from '../../domain/geo/place.js';
+import type { PlaceRulingRecord } from '../../domain/meetups/records.js';
+import type { RulingKey } from '../../domain/meetups/safety.js';
+import type { PlaceKind } from '../../domain/search/place-merge.js';
+import { PLACE_KIND_WORDS } from '../../render/place.js';
+import { PLACES_KIND, placePage, placesList } from '../../render/places.js';
+import { memberText } from '../../render/text.js';
+import { LIST_COLOUR, textMessage } from '../../render/v2.js';
+import { MAX_PLACE_TEXT, namedPlace, nearChoices } from '../place-option.js';
+
+const PLACE_KINDS: readonly PlaceKind[] = ['gym', 'stop', 'powerspot'];
+
+/** A ruled place as it is now, when its ruling kept none (8S-1's): the gym or the Wayspot. */
+function placeNow(ctx: AppContext, key: RulingKey): KnownPlace | undefined {
+  if (key.kind === 'gym') {
+    const gym = /^\d+$/u.test(key.id) ? ctx.gyms.get(Number(key.id)) : undefined;
+    return (
+      gym && {
+        kind: 'gym',
+        id: key.id,
+        title: gym.nickname || gym.name,
+        lat: gym.lat,
+        lon: gym.lon,
+        address: addressLine(gym.geodata) || null,
+        image: gym.imageUrl,
+      }
+    );
+  }
+  const wayspot = ctx.wayspots.byId(key.id);
+  return (
+    wayspot && {
+      kind: key.kind,
+      id: wayspot.id,
+      title: wayspot.title,
+      lat: wayspot.lat,
+      lon: wayspot.lon,
+      address: null,
+      image: null,
+    }
+  );
+}
+
+/** The name a ruled place is listed by. */
+function titleOf(ctx: AppContext, ruling: PlaceRulingRecord): string {
+  return (
+    ruling.place?.title ??
+    placeNow(ctx, ruling.key)?.title ??
+    `${PLACE_KIND_WORDS[ruling.key.kind]} ${ruling.key.id}`
+  );
+}
+
+/** The list of `/places` at a page, read anew. */
+async function listPage(ctx: AppContext, serverId: string, page: number): Promise<V2Message> {
+  const [overview, reports] = await Promise.all([
+    ctx.meetupSafety.overview(serverId),
+    ctx.reports.openReports(serverId),
+  ]);
+  // A block of 8S-1 kept no name: the member as the server knows them now, else the mention.
+  const blocks = await Promise.all(
+    overview.blocks.map(async (block) =>
+      block.memberName !== null
+        ? block
+        : {
+            ...block,
+            memberName:
+              (await ctx.members.find(serverId, block.memberId).catch(() => undefined))?.name ??
+              null,
+          },
+    ),
+  );
+  return placesList(
+    { serverId, ...overview, blocks, reports, titleOf: (ruling) => titleOf(ctx, ruling) },
+    page,
+  );
+}
+
+/**
+ * `/places [place]` (plan 8S-2; Matt: a command of its own, for staff, hidden from the others by
+ * Manage Messages as `/delete` is): with a place (a gym, PokéStop or power spot, as `/meetup
+ * near:` finds it) its ruling, who made it, when and from which post, with Undo ruling (the place
+ * is checked by its name again; logged, nobody told); without, the rulings of the server and
+ * everything open (pending requests, asks about places, blocks with Lift block, appeals,
+ * reports), each with the way to its post, paged with arrows. Answered privately.
+ */
+export const places: SimpleCommand = {
+  data: new SlashCommandBuilder()
+    .setName('places')
+    .setDescription('Rulings of places, and what waits for the moderators (moderators)')
+    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
+    .addStringOption((option) =>
+      option
+        .setName('place')
+        .setDescription('A gym or PokéStop: its ruling (pick from the list)')
+        .setMaxLength(MAX_PLACE_TEXT)
+        .setAutocomplete(true),
+    ),
+  help: {
+    category: 'admin',
+    details:
+      'For admins and moderators. With a place: whether meetups there are allowed or refused ' +
+      'for good, who decided, when and from which post, with Undo ruling (a meetup there is ' +
+      'then checked by its name again; nobody is told). Without: refused and allowed places, ' +
+      'pending meetup requests, asks about places, blocked members (with Lift block), open ' +
+      'appeals and open reports, each with a link to its post in the moderators’ channel. ' +
+      'Server Settings › Integrations decide who sees it (Manage Messages by default).',
+    examples: ['/places', '/places place:Riverside Park Gazebo'],
+  },
+  guards: [requireGuild, requireManagement],
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const serverId = guildIdOf(interaction);
+    const typed = interaction.options.getString('place');
+    if (typed === null) {
+      await interaction.editReply(v2Answer(await listPage(ctx, serverId, 0)));
+      return;
+    }
+    const place = await namedPlace(interaction, ctx, typed, 'or pick it from the list');
+    if (place === undefined) throw new UserError('Say which place.');
+    const ruling = await ctx.meetupSafety.rulingOf(serverId, place);
+    await interaction.editReply(
+      v2Answer(
+        placePage(place, ruling, serverId, { officialName: ctx.meetupSafety.officialName(place) }),
+      ),
+    );
+  },
+  async autocomplete(interaction, ctx) {
+    const focused = interaction.options.getFocused(true);
+    await interaction.respond(
+      focused.name === 'place' ? await nearChoices(interaction, ctx, focused.value) : [],
+    );
+  },
+};
+
+/**
+ * The controls of `/places` (kind `places`), for staff: the list's arrows, Lift block (as an
+ * appeal's Lift block: the member is told by DM; the list is shown again) and Undo ruling. Each
+ * press reads the server's lists anew and shows the page in the place of the answer.
+ */
+export const placesControls: ComponentHandler = {
+  kind: PLACES_KIND,
+  guards: [requireGuild, requireManagement],
+  throttle: SAFETY_THROTTLE,
+  async button(interaction, id, ctx) {
+    const serverId = guildIdOf(interaction);
+    const moderator = { id: interaction.user.id, name: memberInfo(interaction).name };
+    const [arg = ''] = id.args;
+    const page = Number(arg);
+    const kind = PLACE_KINDS.find((one) => one === id.id);
+    const listing = id.action === 'page' || id.action === 'lift';
+    if (
+      listing
+        ? !Number.isInteger(page) || page < 0
+        : id.action !== 'undo' || kind === undefined || arg === ''
+    ) {
+      throw new UserError(STALE_COMPONENT);
+    }
+    // The lists are read anew and a lift or an undo written first: acknowledged before that.
+    await interaction.deferUpdate();
+    if (listing) {
+      if (id.action === 'lift') {
+        await ctx.meetupSafety.liftBlock(serverId, id.id, moderator, interaction.guild?.name);
+      }
+      await showInPlace(interaction, await listPage(ctx, serverId, page));
+      return;
+    }
+    if (kind === undefined) throw new UserError(STALE_COMPONENT);
+    const key = { kind, id: arg };
+    const undone = await ctx.meetupSafety.undoRuling(serverId, key, moderator);
+    const place = undone?.place ?? placeNow(ctx, key);
+    const said =
+      undone === undefined
+        ? 'It had no ruling any more.'
+        : `Undone by ${memberText(moderator)}: a meetup there is checked by its name again.`;
+    await showInPlace(
+      interaction,
+      place === undefined
+        ? textMessage(LIST_COLOUR, [said])
+        : placePage(place, undefined, serverId, {
+            officialName: ctx.meetupSafety.officialName(place),
+            said,
+          }),
+    );
+  },
+};
diff --git a/src/components/index.ts b/src/components/index.ts
index 095bbbf6..76f366f2 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -7,6 +7,7 @@ import { regionControls } from '../commands/regions/controls.js';
 import { infoControls } from '../commands/meetups/info.js';
 import { meetupFormControls } from '../commands/meetups/meetup.js';
 import { placeAskControls } from '../commands/meetups/place-ask.js';
+import { placesControls } from '../commands/meetups/places.js';
 import {
   targetControls,
   targetListControls,
@@ -37,6 +38,7 @@ export const components: readonly ComponentHandler[] = [
   meetupSafetyControls,
   meetupAppealControls,
   placeAskControls,
+  placesControls,
   reportDecisionControls,
   wantControls,
   wantListControls,
diff --git a/src/components/meetup-appeal.ts b/src/components/meetup-appeal.ts
index 1be1d696..14f5d35b 100644
--- a/src/components/meetup-appeal.ts
+++ b/src/components/meetup-appeal.ts
@@ -91,6 +91,8 @@ function decisionWords(outcome: AppealDecision): string {
       if (appeal.status === 'expired') return 'This appeal has expired: nobody decided in time.';
       return `${who} decided this already${when}: ${appeal.status === 'lifted' ? 'lifted' : 'kept'}.`;
     }
+    case 'no-block':
+      return `${memberOf(outcome.appeal)} is not blocked any more: the appeal is closed.`;
     case 'done':
       return outcome.appeal.status === 'lifted'
         ? `Lifted: ${memberOf(outcome.appeal)} can create meetups again. They are told.`
diff --git a/src/components/meetup-safety.ts b/src/components/meetup-safety.ts
index ae28dd68..f235383e 100644
--- a/src/components/meetup-safety.ts
+++ b/src/components/meetup-safety.ts
@@ -41,6 +41,19 @@ export function decisionWords(outcome: DecideOutcome): string {
   switch (outcome.kind) {
     case 'gone':
       return STALE_COMPONENT;
+    case 'blocked-later': {
+      const maker = memberText({
+        id: outcome.request.makerId,
+        name: outcome.request.makerName ?? undefined,
+      });
+      if (!outcome.newBlock) return `${maker} is blocked already.`;
+      const meetups = outcome.closed === 0 ? 'no meetup' : count(outcome.closed, 'meetup');
+      const requests = outcome.withdrawn === 0 ? 'no request' : count(outcome.withdrawn, 'request');
+      return (
+        `${maker} is blocked from creating meetups here (${requests} withdrawn, ${meetups} ` +
+        'closed). They are told, and may appeal.'
+      );
+    }
     case 'not-for-a-pin':
       return 'A pin has no ruling: approve it or refuse it for this meetup alone.';
     case 'expired':
diff --git a/src/db/repositories/meetup-safety-repository.db.test.ts b/src/db/repositories/meetup-safety-repository.db.test.ts
index 591437a4..b3da0e95 100644
--- a/src/db/repositories/meetup-safety-repository.db.test.ts
+++ b/src/db/repositories/meetup-safety-repository.db.test.ts
@@ -11,17 +11,21 @@ import {
   SAFETY_NOW,
   SAFETY_SERVER,
 } from '../../../test/support/meetup-safety-cases.js';
+import { connectionId, lockWaits } from '../../../test/support/lock-waits.js';
 import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import type { TestDatabase } from '../../../test/support/mysql.js';
 import { createTestLogger } from '../../../test/support/test-logger.js';
+import { createDb } from '../kysely.js';
 import type { DB } from '../types.js';
 import { MeetupSafetyRepository } from './meetup-safety-repository.js';
 
 describe('MeetupSafetyRepository', () => {
   let stop: () => Promise<void>;
   let db: Kysely<DB>;
+  let database: TestDatabase;
 
   beforeAll(async () => {
-    ({ db, stop } = await startMigratedDatabase());
+    ({ db, stop, database } = await startMigratedDatabase());
   });
   afterAll(async () => {
     await stop();
@@ -83,6 +87,44 @@ describe('MeetupSafetyRepository', () => {
     ).toHaveLength(1);
   });
 
+  it('lifts a block without the appeal a moderator decided meanwhile', async () => {
+    const store = await fresh();
+    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
+    await store.addAppeal(newAppeal(1));
+    const other = createDb<DB>(database.config);
+    try {
+      let release = (): void => undefined;
+      const held = new Promise<void>((resolve) => {
+        release = resolve;
+      });
+      let kept = (): void => undefined;
+      const isKept = new Promise<void>((resolve) => {
+        kept = resolve;
+      });
+      // A moderator keeps the block on the appeal, and holds the appeal's row while it is lifted.
+      let holder = 0;
+      const keeping = other.transaction().execute(async (trx) => {
+        holder = await connectionId(trx);
+        await trx
+          .updateTable('MeetupAppeal')
+          .set({ status: 'kept', openKey: null, decidedBy: MODERATOR, decidedAt: String(MOD.at) })
+          .where('id', '=', requestId(101))
+          .execute();
+        kept();
+        await held;
+      });
+      await isKept;
+      const lifting = store.liftWithAppeal(SAFETY_SERVER, MAKER, { ...MOD, at: MOD.at + 1 });
+      expect(await lockWaits(db, holder)).toBe(1);
+      release();
+      await keeping;
+      expect(await lifting).toEqual({ lifted: true, appeal: undefined });
+      expect((await store.appeal(requestId(101)))?.status).toBe('kept');
+    } finally {
+      await other.destroy();
+    }
+  });
+
   it('decides a request once when two decide it at the same moment', async () => {
     const store = await fresh();
     await store.addRequest(newRequest(1));
diff --git a/src/db/repositories/meetup-safety-repository.ts b/src/db/repositories/meetup-safety-repository.ts
index 93140b4e..aab66d9c 100644
--- a/src/db/repositories/meetup-safety-repository.ts
+++ b/src/db/repositories/meetup-safety-repository.ts
@@ -270,6 +270,71 @@ export class MeetupSafetyRepository implements MeetupSafetyStore {
     });
   }
 
+  async rulings(serverId: string): Promise<PlaceRulingRecord[]> {
+    const rows = await this.db
+      .selectFrom('MeetupPlaceRuling')
+      .selectAll()
+      .where('serverId', '=', serverId)
+      .orderBy('ruledAt')
+      .orderBy('placeId')
+      .execute();
+    return rows.flatMap((row) => {
+      const ruling = readRuling(row);
+      return ruling ? [ruling] : [];
+    });
+  }
+
+  async pendingIn(serverId: string): Promise<MeetupRequestRecord[]> {
+    const rows = await this.db
+      .selectFrom('MeetupRequest')
+      .selectAll()
+      .where('serverId', '=', serverId)
+      .where('status', '=', 'pending')
+      .orderBy('createdAt')
+      .orderBy('id')
+      .execute();
+    return this.readRequests(rows);
+  }
+
+  async openAsks(serverId: string): Promise<PlaceAskRecord[]> {
+    const rows = await this.db
+      .selectFrom('MeetupPlaceAsk')
+      .selectAll()
+      .where('serverId', '=', serverId)
+      .where('status', '=', 'open')
+      .orderBy('createdAt')
+      .orderBy('id')
+      .execute();
+    return rows.flatMap((row) => {
+      const ask = this.readAsk(row);
+      return ask ? [ask] : [];
+    });
+  }
+
+  async blocks(serverId: string): Promise<MeetupBlock[]> {
+    const rows = await this.db
+      .selectFrom('MeetupBlock')
+      .select(['serverId', 'memberId', 'memberName', 'blockedBy', 'blockedByName', 'blockedAt'])
+      .where('serverId', '=', serverId)
+      .where('liftedAt', 'is', null)
+      .orderBy('blockedAt')
+      .orderBy('memberId')
+      .execute();
+    return rows.map((row) => ({ ...row, blockedAt: Number(row.blockedAt) }));
+  }
+
+  async openAppeals(serverId: string): Promise<MeetupAppeal[]> {
+    const rows = await this.db
+      .selectFrom('MeetupAppeal')
+      .selectAll()
+      .where('serverId', '=', serverId)
+      .where('status', '=', 'open')
+      .orderBy('createdAt')
+      .orderBy('id')
+      .execute();
+    return rows.map(readAppeal);
+  }
+
   /** An ask as it was stored; undefined (logged) for one whose place does not read. */
   private readAsk(row: Selectable<AskRow>): PlaceAskRecord | undefined {
     const place = placeDocument.safeParse(
@@ -377,6 +442,56 @@ export class MeetupSafetyRepository implements MeetupSafetyStore {
     return liftIn(this.db, serverId, memberId, by);
   }
 
+  liftWithAppeal(
+    serverId: string,
+    memberId: string,
+    by: Decider,
+  ): Promise<{ lifted: boolean; appeal: MeetupAppeal | undefined }> {
+    return inTransaction(this.db, async (trx) => {
+      if (!(await liftIn(trx, serverId, memberId, by))) return { lifted: false, appeal: undefined };
+      // Found by its key, locked by its id (a lock on the key's index as well could deadlock with
+      // a decision, which changes the key), and still open once locked: an appeal a moderator
+      // decided meanwhile is left as decided.
+      const found = await trx
+        .selectFrom('MeetupAppeal')
+        .select('id')
+        .where('openKey', '=', `${serverId} ${memberId}`)
+        .executeTakeFirst();
+      const open =
+        found &&
+        (await trx
+          .selectFrom('MeetupAppeal')
+          .selectAll()
+          .where('id', '=', found.id)
+          .where('status', '=', 'open')
+          .forUpdate()
+          .executeTakeFirst());
+      if (!open) return { lifted: true, appeal: undefined };
+      await trx
+        .updateTable('MeetupAppeal')
+        .set({
+          status: 'lifted',
+          openKey: null,
+          decidedBy: by.id,
+          decidedByName: by.name,
+          decidedAt: String(by.at),
+        })
+        .where('id', '=', open.id)
+        .where('status', '=', 'open')
+        .execute();
+      return {
+        lifted: true,
+        appeal: {
+          ...readAppeal(open),
+          status: 'lifted',
+          decidedBy: by.id,
+          decidedByName: by.name,
+          decidedAt: by.at,
+        },
+      };
+    });
+  }
+
   async addRequest(request: NewMeetupRequest): Promise<void> {
     await this.db
       .insertInto('MeetupRequest')
diff --git a/src/db/repositories/report-repository.db.test.ts b/src/db/repositories/report-repository.db.test.ts
index 98837b22..ada43915 100644
--- a/src/db/repositories/report-repository.db.test.ts
+++ b/src/db/repositories/report-repository.db.test.ts
@@ -1,6 +1,7 @@
-import { sql, type Kysely } from 'kysely';
+import type { Kysely } from 'kysely';
 import { afterAll, beforeAll, describe, expect, it } from 'vitest';
 import { requestId, SAFETY_NOW } from '../../../test/support/meetup-safety-cases.js';
+import { connectionId, lockWaits } from '../../../test/support/lock-waits.js';
 import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
 import type { TestDatabase } from '../../../test/support/mysql.js';
 import { createDb } from '../kysely.js';
@@ -66,8 +67,7 @@ describe('ReportRepository', () => {
       // A moderator's decision holds the report's row while a second reason comes.
       let otherId = 0;
       const deciding = other.transaction().execute(async (trx) => {
-        const own = await sql<{ id: number | string }>`select connection_id() as id`.execute(trx);
-        otherId = Number(own.rows[0]?.id);
+        otherId = await connectionId(trx);
         await trx
           .selectFrom('ModerationReport')
           .select('id')
@@ -84,28 +84,8 @@ describe('ReportRepository', () => {
       });
       await isLocked;
       const adding = store.addReport(newReport(2), reason(OTHER_REPORTER, { at: SAFETY_NOW + 1 }));
-      // The reason's transaction waits for the decision's lock: a transaction of this database's
-      // user (the server is shared), not the decision's own, in LOCK WAIT. Asked until it is, or
-      // until the deadline: a real MySQL tells nobody when a statement begins to wait.
-      const waiting = async () => {
-        const rows = await sql<{ waits: number | string }>`
-          select count(*) as waits
-          from information_schema.innodb_trx t
-          join information_schema.processlist p on p.id = t.trx_mysql_thread_id
-          where t.trx_state = 'LOCK WAIT' and t.trx_mysql_thread_id <> ${otherId}
-            and p.user = substring_index(current_user(), '@', 1)`.execute(db);
-        return Number(rows.rows[0]?.waits);
-      };
-      const deadline = Date.now() + 10_000;
-      let waits = await waiting();
-      while (waits === 0 && Date.now() < deadline) {
-        // InnoDB fills `innodb_trx` anew only once it has not been read for 0.1 seconds: asked
-        // more often, it would show the same moment for ever.
-        // eslint-disable-next-line no-restricted-syntax -- a real MySQL: polled until the statement waits
-        await new Promise((resolve) => setTimeout(resolve, 150));
-        waits = await waiting();
-      }
-      expect(waits).toBe(1);
+      // The reason's transaction waits for the decision's lock.
+      expect(await lockWaits(db, otherId)).toBe(1);
       release();
       await deciding;
       expect(await adding).toMatchObject({ kind: 'opened', report: { id: requestId(202) } });
diff --git a/src/domain/meetups/records.ts b/src/domain/meetups/records.ts
index f065f816..ad33a002 100644
--- a/src/domain/meetups/records.ts
+++ b/src/domain/meetups/records.ts
@@ -253,6 +253,15 @@ export interface MeetupSafetyStore {
    * member's block in its server lifted. False when it was not open any more (the first press
    * won): nothing is lifted.
    */
+  /**
+   * Lift block from `/places` (plan 8S-2), in one step: the member's block lifted (who lifted it
+   * kept), and their open appeal, if any, decided `lifted`. `lifted` false when no block stood.
+   */
+  liftWithAppeal(
+    serverId: string,
+    memberId: string,
+    by: Decider,
+  ): Promise<{ lifted: boolean; appeal: MeetupAppeal | undefined }>;
   liftOnAppeal(
     appeal: Pick<MeetupAppeal, 'id' | 'serverId' | 'memberId'>,
     by: Decider,
@@ -337,4 +346,15 @@ export interface MeetupSafetyStore {
   keepOnAsk(ask: PlaceAskRecord, by: Decider): Promise<'kept' | 'not-open' | 'not-refused'>;
   /** The open asks that are stale (as `staleAppeals`), oldest first. */
   staleAsks(stale: { unpostedBefore: number; openedBefore: number }): Promise<PlaceAskRecord[]>;
+
+  /** What `/places` lists of a server (plan 8S-2), each oldest first: its rulings, */
+  rulings(serverId: string): Promise<PlaceRulingRecord[]>;
+  /** its pending requests, */
+  pendingIn(serverId: string): Promise<MeetupRequestRecord[]>;
+  /** its open asks, */
+  openAsks(serverId: string): Promise<PlaceAskRecord[]>;
+  /** the blocks that stand, */
+  blocks(serverId: string): Promise<MeetupBlock[]>;
+  /** and its open appeals. */
+  openAppeals(serverId: string): Promise<MeetupAppeal[]>;
 }
diff --git a/src/render/meetup-safety.ts b/src/render/meetup-safety.ts
index 8cd5b56f..040caf6b 100644
--- a/src/render/meetup-safety.ts
+++ b/src/render/meetup-safety.ts
@@ -180,6 +180,17 @@ export function blockedDm(serverName: string | undefined): V2Message {
   ]);
 }
 
+/**
+ * The direct message of a member whose block a moderator lifted from `/places` (plan 8S-2), the
+ * server named when known.
+ */
+export function blockLiftedDm(serverName: string | undefined): V2Message {
+  const on = serverName === undefined ? '' : ` on **${plainNoLinks(serverName)}**`;
+  return textMessage(APPROVED_ACCENT, [
+    `A moderator lifted your block${on}: you can create meetups ${on === '' ? 'again' : 'there again'}.`,
+  ]);
+}
+
 /**
  * The moderators' post of an appeal: the member (`memberText`), who blocked them and when
  * (`block`, while it stands), their words (`plainLines`, never cut), with Lift block and Keep
@@ -328,7 +339,16 @@ export function requestOutcomeDm(
  */
 export function requestMessage(
   request: MeetupRequestRecord,
-  more: { postId?: string } = {},
+  more: {
+    postId?: string;
+    /** A gym's official name, shown beside the nickname its title has (plan 8S-2). */
+    officialName?: string | null;
+    /**
+     * Of a request refused or expired without a block: its maker's block, if one stands (who
+     * blocked them is said); none, Block member stays on the post (8S-1 review W7).
+     */
+    makerBlock?: MeetupBlock | null;
+  } = {},
 ): V2Message {
   const waiting = request.status === 'pending';
   const outcome = outcomeOf(request, more.postId);
@@ -339,7 +359,7 @@ export function requestMessage(
     `Starts ${timestamp(request.startTime, 'F')} (${timestamp(request.startTime, 'R')})`,
     `Asked by ${maker}${request.source === 'map' ? ' on the map' : ''} in <#${request.regionChannelId}>`,
   ].join('\n');
-  const where = `**Where**\n${placeLine(request.place)}`;
+  const where = `**Where**\n${placeLine(request.place, more.officialName)}`;
   const picture = request.place.kind === 'pin' ? undefined : wayspotPicture(request.place.image);
   const components: APIComponentInContainer[] = [
     textDisplay(head),
@@ -366,6 +386,36 @@ export function requestMessage(
     );
   } else {
     components.push(textDisplay(outcome.line));
+    if (blockableLater(request) && more.makerBlock !== undefined) {
+      const block = more.makerBlock;
+      if (block === null) {
+        components.push(
+          actionRow([
+            {
+              type: ComponentType.Button,
+              style: ButtonStyle.Danger,
+              label: 'Block member',
+              custom_id: encodeCustomId({ kind: SAFETY_KIND, id: request.id, action: 'block' }),
+            },
+          ]),
+        );
+      } else {
+        const by = memberText({ id: block.blockedBy, name: block.blockedByName ?? undefined });
+        components.push(
+          textDisplay(`Its maker was blocked by ${by} ${timestamp(block.blockedAt, 'R')}.`),
+        );
+      }
+    }
   }
   return { v2: true, components: [container(outcome.accent, components)] };
 }
+
+/**
+ * Whether a decided request may still block its maker (8S-1 review W7): one refused (not by a
+ * block) or expired.
+ */
+export function blockableLater(request: Pick<MeetupRequestRecord, 'status' | 'decision'>): boolean {
+  return (
+    (request.status === 'refused' && request.decision !== 'block') || request.status === 'expired'
+  );
+}
diff --git a/src/render/moderation.test.ts b/src/render/moderation.test.ts
index 238636e6..2185c6de 100644
--- a/src/render/moderation.test.ts
+++ b/src/render/moderation.test.ts
@@ -145,7 +145,7 @@ describe('reportMessage of a party', () => {
 
   it('keeps every reason it can within what a message holds, and says how many it left out', () => {
     const many = Array.from({ length: 12 }, (_, i) =>
-      reason(String(200000000000000100 + i), {
+      reason(`2000000000000001${String(i).padStart(2, '0')}`, {
         reporterName: 'Z'.repeat(32),
         text: '_'.repeat(MAX_REPORT_REASON),
         at: SAFETY_NOW + i,
diff --git a/src/render/place-asks.ts b/src/render/place-asks.ts
index 8254b7ab..ad46872f 100644
--- a/src/render/place-asks.ts
+++ b/src/render/place-asks.ts
@@ -105,9 +105,11 @@ export function askMessage(
       textDisplay(
         ask.status === 'allowed'
           ? `**Allowed** by ${by}${when}: meetups can be held there from now on.`
-          : ask.status === 'expired'
-            ? '**Expired**: no moderator decided in time. Members can ask again.'
-            : `**Kept refused** by ${by}${when}: members can ask again ${timestamp(again, 'R')}.`,
+          : ask.status === 'undone'
+            ? '**Ruling undone** on `/places`: a meetup there is checked by its name again.'
+            : ask.status === 'expired'
+              ? '**Expired**: no moderator decided in time. Members can ask again.'
+              : `**Kept refused** by ${by}${when}: members can ask again ${timestamp(again, 'R')}.`,
       ),
     );
   }
diff --git a/src/render/places.test.ts b/src/render/places.test.ts
new file mode 100644
index 00000000..bb97244a
--- /dev/null
+++ b/src/render/places.test.ts
@@ -0,0 +1,45 @@
+import { describe, expect, it } from 'vitest';
+import { MOD, newRequest, SAFETY_SERVER } from '../../test/support/meetup-safety-cases.js';
+import { componentCount, textOf } from '../../test/support/messages.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
+import { MAX_PARTY_NAME } from '../domain/party/party.js';
+import { PLACES_PAGE, placesList } from './places.js';
+
+const none = {
+  serverId: SAFETY_SERVER,
+  rulings: [],
+  pending: [],
+  asks: [],
+  blocks: [],
+  appeals: [],
+  reports: [],
+  titleOf: () => 'x',
+};
+
+describe('placesList', () => {
+  it('says when there is nothing, and holds a page of blocks within what a message holds', () => {
+    expect(textOf(placesList(none, 0))).toContain('No rulings, and nothing open.');
+    const blocks = Array.from({ length: 25 }, (_, i) => ({
+      serverId: SAFETY_SERVER,
+      memberId: `2000000000000001${String(i).padStart(2, '0')}`,
+      memberName: '_'.repeat(32),
+      blockedBy: MOD.id,
+      blockedByName: '_'.repeat(32),
+      blockedAt: MOD.at,
+    }));
+    const page = placesList({ ...none, blocks }, 0);
+    expectV2Sendable(page);
+    expect(componentCount(page)).toBeLessThanOrEqual(40);
+    // Past the end: the last page.
+    expect(textOf(placesList({ ...none, blocks }, 9))).toContain('Page 3 of 3');
+    const pending = Array.from(
+      { length: PLACES_PAGE },
+      (_, i) =>
+        ({
+          ...newRequest(i + 1, { name: '*'.repeat(MAX_PARTY_NAME) }),
+          status: 'pending',
+        }) as never,
+    );
+    expectV2Sendable(placesList({ ...none, pending }, 0));
+  });
+});
diff --git a/src/render/places.ts b/src/render/places.ts
new file mode 100644
index 00000000..4d0a30dc
--- /dev/null
+++ b/src/render/places.ts
@@ -0,0 +1,232 @@
+import {
+  ButtonStyle,
+  ComponentType,
+  type APIButtonComponent,
+  type APIComponentInContainer,
+} from 'discord.js';
+import { encodeCustomId } from '../discord/custom-id.js';
+import type { V2Message } from '../discord/party-gateway.js';
+import type { Place } from '../domain/geo/place.js';
+import type {
+  MeetupAppeal,
+  MeetupBlock,
+  MeetupRequestRecord,
+  PlaceAskRecord,
+  PlaceRulingRecord,
+} from '../domain/meetups/records.js';
+import type { ModerationReport } from '../domain/moderation/reports.js';
+import { partyWord } from '../domain/party/party.js';
+import { placeLine } from './meetup-safety.js';
+import { postLink } from './notify-dm.js';
+import { PLACE_KIND_WORDS } from './place.js';
+import { rulingLine } from './place-asks.js';
+import { memberText, plain, plainNoLinks, timestamp } from './text.js';
+import { actionRow, container, LIST_COLOUR, section, textDisplay } from './v2.js';
+
+/**
+ * The custom-id kind of the controls of `/places` (plan 8S-2): `places:list:page:<n>` (the
+ * list's arrows), `places:<member id>:lift:<page>` (Lift block), `places:<kind>:undo:<place id>`
+ * (Undo ruling on a place's page). Nothing is kept: a press reads the server's lists anew.
+ */
+export const PLACES_KIND = 'places';
+
+/** As many entries as a page of the list shows. */
+export const PLACES_PAGE = 10;
+
+/** What `/places` lists of a server, each oldest first. */
+export interface PlacesView {
+  serverId: string;
+  rulings: PlaceRulingRecord[];
+  pending: MeetupRequestRecord[];
+  asks: PlaceAskRecord[];
+  blocks: MeetupBlock[];
+  appeals: MeetupAppeal[];
+  reports: ModerationReport[];
+  /** The name a ruled place is shown by (its kept snapshot, else the gym as it is now). */
+  titleOf(ruling: PlaceRulingRecord): string;
+}
+
+/** One line of the list, in its section; a block has Lift block beside it. */
+interface Entry {
+  section: string;
+  text: string;
+  lift?: string;
+}
+
+/** ` · [post](<…>)`: the way to a moderators' post, where its buttons are. */
+function postOf(serverId: string, channelId: string | null, messageId: string | null): string {
+  return channelId === null || messageId === null
+    ? ''
+    : ` · [post](<${postLink(serverId, channelId, messageId)}>)`;
+}
+
+function by(id: string, name: string | null): string {
+  return memberText({ id, name: name ?? undefined });
+}
+
+/** Every entry of the list, section by section, in the order the page shows them. */
+function entriesOf(view: PlacesView): Entry[] {
+  const { serverId } = view;
+  const ruled = (ruling: PlaceRulingRecord): string =>
+    `**${plainNoLinks(view.titleOf(ruling))}** (${PLACE_KIND_WORDS[ruling.key.kind]}) · by ` +
+    `${by(ruling.ruledBy, ruling.ruledByName)} ${timestamp(ruling.ruledAt, 'R')}` +
+    (ruling.source === null
+      ? ''
+      : postOf(serverId, ruling.source.channelId, ruling.source.messageId));
+  return [
+    ...view.rulings
+      .filter((one) => one.ruling === 'refuse')
+      .map((one) => ({ section: 'Refused places', text: ruled(one) })),
+    ...view.rulings
+      .filter((one) => one.ruling === 'allow')
+      .map((one) => ({ section: 'Allowed places', text: ruled(one) })),
+    ...view.pending.map((one) => ({
+      section: 'Pending requests',
+      text:
+        `**${plain(one.name)}** by ${by(one.makerId, one.makerName)} ` +
+        `${timestamp(one.createdAt, 'R')}${postOf(serverId, one.channelId, one.messageId)}`,
+    })),
+    ...view.asks.map((one) => ({
+      section: 'Open asks about places',
+      text:
+        `**${plainNoLinks(one.place.title)}** asked by ${by(one.memberId, one.memberName)} ` +
+        `${timestamp(one.createdAt, 'R')}${postOf(serverId, one.channelId, one.messageId)}`,
+    })),
+    ...view.blocks.map((one) => ({
+      section: 'Blocked members',
+      text:
+        `${by(one.memberId, one.memberName)} blocked by ${by(one.blockedBy, one.blockedByName)} ` +
+        timestamp(one.blockedAt, 'R'),
+      lift: one.memberId,
+    })),
+    ...view.appeals.map((one) => ({
+      section: 'Open appeals',
+      text:
+        `${by(one.memberId, one.memberName)} ${timestamp(one.createdAt, 'R')}` +
+        postOf(serverId, one.channelId, one.messageId),
+    })),
+    ...view.reports.map((one) => {
+      const { subject } = one;
+      const what =
+        subject.kind === 'party'
+          ? `${partyWord({ type: subject.partyType })} **${plain(subject.title)}**`
+          : `message by ${by(subject.authorId, subject.authorName)}`;
+      const reasons =
+        one.reasons.length === 1 ? '1 reason' : `${String(one.reasons.length)} reasons`;
+      return {
+        section: 'Open reports',
+        text:
+          `Reported ${what} · ${reasons} ${timestamp(one.createdAt, 'R')}` +
+          postOf(serverId, one.channelId, one.messageId),
+      };
+    }),
+  ];
+}
+
+const button = (
+  label: string,
+  customId: string,
+  style: ButtonStyle.Secondary | ButtonStyle.Danger,
+): APIButtonComponent => ({
+  type: ComponentType.Button,
+  style,
+  label,
+  custom_id: customId,
+});
+
+/**
+ * The list of `/places` (plan 8S-2), for the staff member alone: how many of each there are,
+ * then a page of `PLACES_PAGE` entries under their sections (refused places, allowed places,
+ * pending requests, open asks, blocked members with Lift block, open appeals, open reports),
+ * each with the way to its moderators' post, and the arrows. `page` is cut to the last there is.
+ */
+export function placesList(view: PlacesView, page: number): V2Message {
+  const entries = entriesOf(view);
+  const pages = Math.max(1, Math.ceil(entries.length / PLACES_PAGE));
+  const shown = Math.min(Math.max(0, page), pages - 1);
+  const counts = new Map<string, number>();
+  for (const entry of entries) counts.set(entry.section, (counts.get(entry.section) ?? 0) + 1);
+  const head =
+    entries.length === 0
+      ? '### Places and what waits for the moderators\nNo rulings, and nothing open.'
+      : `### Places and what waits for the moderators\nPage ${String(shown + 1)} of ${String(pages)}`;
+  const components: APIComponentInContainer[] = [textDisplay(head)];
+  const onPage = entries.slice(shown * PLACES_PAGE, (shown + 1) * PLACES_PAGE);
+  let current: string | undefined;
+  let lines: string[] = [];
+  const flush = () => {
+    if (lines.length > 0) components.push(textDisplay(lines.join('\n')));
+    lines = [];
+  };
+  for (const entry of onPage) {
+    if (entry.section !== current) {
+      flush();
+      current = entry.section;
+      lines.push(`**${entry.section}** (${String(counts.get(entry.section) ?? 0)})`);
+    }
+    if (entry.lift === undefined) {
+      lines.push(entry.text);
+    } else {
+      flush();
+      components.push(
+        section(
+          entry.text,
+          button(
+            'Lift block',
+            encodeCustomId({
+              kind: PLACES_KIND,
+              id: entry.lift,
+              action: 'lift',
+              args: [String(shown)],
+            }),
+            ButtonStyle.Secondary,
+          ),
+        ),
+      );
+    }
+  }
+  flush();
+  const arrows: APIButtonComponent[] = [];
+  const to = (n: number) =>
+    encodeCustomId({ kind: PLACES_KIND, id: 'list', action: 'page', args: [String(n)] });
+  if (shown > 0) arrows.push(button('◀ Previous', to(shown - 1), ButtonStyle.Secondary));
+  if (shown < pages - 1) arrows.push(button('Next ▶', to(shown + 1), ButtonStyle.Secondary));
+  if (arrows.length > 0) components.push(actionRow(arrows));
+  return { v2: true, components: [container(LIST_COLOUR, components)] };
+}
+
+/**
+ * The page of one place (`/places place:`, plan 8S-2): where it is (its official name too), its
+ * ruling (who, when, from which post) with Undo ruling, or that it has none; `said` a line of what
+ * was just done (an undone ruling).
+ */
+export function placePage(
+  place: Place,
+  ruling: PlaceRulingRecord | undefined,
+  serverId: string,
+  more: { officialName?: string | null; said?: string } = {},
+): V2Message {
+  const title = place.kind === 'pin' ? 'A pin' : plainNoLinks(place.title);
+  const texts = [
+    `### ${title}\n${placeLine(place, more.officialName)}`,
+    place.kind === 'pin'
+      ? 'A pin has no ruling: each meetup at one waits for a moderator.'
+      : ruling === undefined
+        ? 'No ruling: a meetup there is checked by its name.'
+        : `**Ruling**\n${rulingLine(ruling, serverId)}`,
+    ...(more.said === undefined ? [] : [more.said]),
+  ];
+  const components: APIComponentInContainer[] = texts.map((text) => textDisplay(text));
+  if (ruling !== undefined && place.kind !== 'pin') {
+    components.push(
+      actionRow([
+        button(
+          'Undo ruling',
+          encodeCustomId({ kind: PLACES_KIND, id: place.kind, action: 'undo', args: [place.id] }),
+          ButtonStyle.Danger,
+        ),
+      ]),
+    );
+  }
+  return { v2: true, components: [container(LIST_COLOUR, components)] };
+}
diff --git a/src/services/meetup-safety.leftovers.test.ts b/src/services/meetup-safety.leftovers.test.ts
new file mode 100644
index 00000000..3b9e6b45
--- /dev/null
+++ b/src/services/meetup-safety.leftovers.test.ts
@@ -0,0 +1,85 @@
+import { describe, expect, it } from 'vitest';
+import { LIBRARY, MAKER, MODERATOR } from '../../test/support/meetup-safety-cases.js';
+import { meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
+import { buttonsOf, textOf } from '../../test/support/messages.js';
+import { gymsFixture } from '../../test/support/providers.js';
+
+const SERVER = '412345678901234567';
+const mod = { id: MODERATOR, name: 'Mod' };
+
+describe('MeetupSafety: Block member on a request decided before (8S-1 review W7)', () => {
+  it('keeps Block member on a refused request while its maker is not blocked, and blocks', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    await made.safety.decide(request.id, 'refuse', mod, SERVER);
+    expect(buttonsOf(made.postOf(request)?.message).map((button) => button.label)).toEqual([
+      'Block member',
+    ]);
+    const outcome = await made.safety.decide(request.id, 'block', mod, SERVER, 'Pine Town');
+    expect(outcome).toMatchObject({ kind: 'blocked-later', newBlock: true });
+    expect(await made.storage.block(SERVER, MAKER)).toMatchObject({ blockedBy: MODERATOR });
+    const post = made.postOf(request)?.message;
+    expect(buttonsOf(post)).toEqual([]);
+    expect(textOf(post)).toContain(`Its maker was blocked by **Mod** (<@${MODERATOR}>)`);
+    expect(made.dms.to(MAKER).length).toBe(2);
+    // Blocked already: nothing more.
+    expect(await made.safety.decide(request.id, 'block', mod, SERVER)).toMatchObject({
+      kind: 'blocked-later',
+      newBlock: false,
+    });
+  });
+
+  it('offers it on an expired request, and not once the maker is blocked otherwise', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    made.clock.now = request.expiresAt;
+    await made.safety.expire();
+    expect(buttonsOf(made.postOf(request)?.message).map((button) => button.label)).toEqual([
+      'Block member',
+    ]);
+    const second = await made.held({ startTime: made.clock.now + 30 * 3_600_000 });
+    await made.safety.decide(second.id, 'block', mod, SERVER);
+    // The first request's post is shown anew only when it is decided again; a press says so.
+    expect(await made.safety.decide(request.id, 'block', mod, SERVER)).toMatchObject({
+      kind: 'blocked-later',
+      newBlock: false,
+    });
+    expect(buttonsOf(made.postOf(request)?.message)).toEqual([]);
+  });
+
+  it('closes an appeal whose block was lifted otherwise, and tells nobody of a block kept', async () => {
+    const made = await meetupSafetyWith();
+    await made.storage.addBlock(SERVER, MAKER, { ...mod, at: 1 });
+    const appealed = await made.safety.appeal({
+      serverId: SERVER,
+      nearChannelId: '100000000000000001',
+      member: { id: MAKER, name: 'Alice' },
+      text: 'Please.',
+    });
+    if (appealed.kind !== 'sent') throw new Error(appealed.kind);
+    await made.storage.liftBlock(SERVER, MAKER, { ...mod, at: 2 });
+    expect(await made.safety.decideAppeal(appealed.appeal.id, 'keep', mod, SERVER)).toMatchObject({
+      kind: 'no-block',
+    });
+    expect(await made.storage.appeal(appealed.appeal.id)).toMatchObject({ status: 'lifted' });
+    expect(made.dms.to(MAKER)).toEqual([]);
+  });
+
+  it('keeps the name of a maker blocked from a decided request', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    await made.safety.decide(request.id, 'refuse', mod, SERVER);
+    await made.safety.decide(request.id, 'block', mod, SERVER);
+    expect(await made.storage.block(SERVER, MAKER)).toMatchObject({ memberName: 'Alice' });
+  });
+
+  it('names a gym’s official name beside its nickname in the request’s post', async () => {
+    const made = await meetupSafetyWith();
+    const gym = gymsFixture().get(1);
+    if (!gym) throw new Error('no gym 1');
+    const request = await made.held({
+      place: { ...LIBRARY, kind: 'gym', id: '1', title: 'The Stacks Little Free Library' },
+    });
+    expect(textOf(made.postOf(request)?.message)).toContain(`(gym; officially **${gym.name}**)`);
+  });
+});
diff --git a/src/services/meetup-safety.test.ts b/src/services/meetup-safety.test.ts
index 22fe60d4..86d82004 100644
--- a/src/services/meetup-safety.test.ts
+++ b/src/services/meetup-safety.test.ts
@@ -320,7 +320,7 @@ describe('MeetupSafety.decide', () => {
       (await made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SERVER)).kind,
     ).toBe('done');
     expect(made.store.active().filter((one) => one.type === 'meetup')).toHaveLength(1);
-    expect(made.storage.rulings.size).toBe(0);
+    expect(made.storage.rulingRows.size).toBe(0);
     expect(textOf(made.postOf(request)?.message)).toContain('**Approved once** by **Mod**');
   });
 
@@ -329,7 +329,7 @@ describe('MeetupSafety.decide', () => {
     const once = await made.held();
     const forGood = await made.held({ name: 'Book swap two' });
     await made.safety.decide(once.id, 'refuse', MODERATOR_MEMBER, SERVER);
-    expect(made.storage.rulings.size).toBe(0);
+    expect(made.storage.rulingRows.size).toBe(0);
     await made.safety.decide(forGood.id, 'refuse-forever', MODERATOR_MEMBER, SERVER);
     expect(await made.storage.ruling(SERVER, { kind: 'stop', id: LIBRARY.id })).toBe('refuse');
     expect(made.store.active().filter((one) => one.type === 'meetup')).toEqual([]);
@@ -475,7 +475,8 @@ describe('MeetupSafety.expire', () => {
     expect(made.storage.requests.get(soon.id)?.status).toBe('expired');
     expect(made.storage.requests.get(later.id)?.status).toBe('pending');
     expect(textOf(made.postOf(soon)?.message)).toContain('**Expired**');
-    expect(buttonLabels(made.postOf(soon)?.message)).toEqual([]);
+    // Its maker is not blocked: Block member stays (8S-1 review W7).
+    expect(buttonLabels(made.postOf(soon)?.message)).toEqual(['Block member']);
     expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
       'No moderator decided on your meetup **Book swap** in time, so it is not posted. Use ' +
         '`/meetup` again with a later start.',
diff --git a/src/services/meetup-safety.ts b/src/services/meetup-safety.ts
index 3d61230b..c990bbc1 100644
--- a/src/services/meetup-safety.ts
+++ b/src/services/meetup-safety.ts
@@ -33,8 +33,10 @@ import type { Logger } from '../log.js';
 import {
   APPEAL_WAIT_DAYS,
   appealMessage,
+  blockableLater,
   appealOutcomeDm,
   blockedDm,
+  blockLiftedDm,
   requestMessage,
   requestOutcomeDm,
 } from '../render/meetup-safety.js';
@@ -372,7 +374,10 @@ export class MeetupSafety {
     };
     let messageId: string | undefined;
     try {
-      messageId = await gateway.sendMessage(channelId, requestMessage(request));
+      messageId = await gateway.sendMessage(
+        channelId,
+        requestMessage(request, { officialName: this.officialName(request.place) }),
+      );
       if (messageId === undefined) throw new Error('the moderators’ channel is gone');
       await storage.addRequest({ ...request, messageId });
     } catch (err) {
@@ -434,7 +439,11 @@ export class MeetupSafety {
     const { storage, log } = this.options;
     const request = await storage.request(requestId);
     if (!request || request.serverId !== serverId) return { kind: 'gone' };
-    if (request.status !== 'pending') return { kind: 'decided-before', request };
+    if (request.status !== 'pending') {
+      return decision === 'block' && blockableLater(request)
+        ? this.blockLater(request, moderator, serverName)
+        : { kind: 'decided-before', request };
+    }
     const now = this.now();
     if (request.expiresAt <= now) {
       return (await this.expireOne(request)) ? { kind: 'expired' } : this.decidedBefore(request);
@@ -628,6 +637,30 @@ export class MeetupSafety {
     return { kind: 'done', request, ...swept };
   }
 
+  /**
+   * Block member on a request refused or expired before (8S-1 review W7): its maker is blocked
+   * as from a pending request (`afterBlock`: their pending requests withdrawn, meetups closed,
+   * one DM), unless a block stands already (`newBlock` false); the post loses its button.
+   */
+  private async blockLater(
+    request: MeetupRequestRecord,
+    moderator: { id: string; name?: string | undefined },
+    serverName: string | undefined,
+  ): Promise<DecideOutcome> {
+    const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: this.now() };
+    const newBlock = await this.options.storage.addBlock(
+      request.serverId,
+      request.makerId,
+      by,
+      request.makerName,
+    );
+    const swept = newBlock
+      ? await this.afterBlock(request.serverId, request.makerId, by, true, serverName)
+      : { closed: 0, withdrawn: 0 };
+    await this.show(request);
+    return { kind: 'blocked-later', request, newBlock, ...swept };
+  }
+
   /**
    * What follows a block, also one from a report's Block maker… (plan 8S-2): the member's
    * pending requests in the server are withdrawn (their posts edited, nobody told), their active
@@ -894,6 +927,35 @@ export class MeetupSafety {
       log.warn({ err, appeal: appeal.id }, 'could not read the block of an appeal');
       return undefined;
     });
+    // No block stands any more (lifted from `/places` or otherwise): the appeal is closed as
+    // lifted, nobody told (a Keep would tell of a block that is not there).
+    if (
+      block === undefined &&
+      (await storage.block(appeal.serverId, appeal.memberId).then(
+        (found) => found === undefined,
+        () => false,
+      ))
+    ) {
+      if (!(await storage.decideAppeal(appeal.id, 'lifted', by))) {
+        const later = await storage.appeal(appeal.id);
+        return later ? { kind: 'decided-before', appeal: later } : { kind: 'gone' };
+      }
+      const closed: MeetupAppeal = {
+        ...appeal,
+        status: 'lifted',
+        decidedBy: by.id,
+        decidedByName: by.name,
+        decidedAt: by.at,
+      };
+      if (closed.channelId !== null && closed.messageId !== null) {
+        await gateway
+          .editMessage(closed.channelId, closed.messageId, appealMessage(closed, undefined))
+          .catch((err: unknown) => {
+            log.warn({ err, appeal: appeal.id }, 'could not show the outcome of an appeal');
+          });
+      }
+      return { kind: 'no-block', appeal: closed };
+    }
     // Lift block decides the appeal and lifts the block in one step.
     const decidedNow =
       decision === 'lift'
@@ -1152,6 +1214,85 @@ export class MeetupSafety {
     );
   }
 
+  /**
+   * What `/places` lists of a server (plan 8S-2): its rulings, pending requests, open asks,
+   * blocks and open appeals, each oldest first.
+   */
+  async overview(serverId: string): Promise<SafetyOverview> {
+    const { storage } = this.options;
+    const [rulings, pending, asks, blocks, appeals] = await Promise.all([
+      storage.rulings(serverId),
+      storage.pendingIn(serverId),
+      storage.openAsks(serverId),
+      storage.blocks(serverId),
+      storage.openAppeals(serverId),
+    ]);
+    return { rulings, pending, asks, blocks, appeals };
+  }
+
+  /** A place's ruling as it is kept (`/places place:`); undefined for none or a pin. */
+  async rulingOf(serverId: string, place: Place): Promise<PlaceRulingRecord | undefined> {
+    const key = rulingKeyOf(place);
+    return key === undefined ? undefined : this.options.storage.rulingRecord(serverId, key);
+  }
+
+  /**
+   * Undo ruling (`/places`, plan 8S-2): the place's ruling is removed, so that a meetup there is
+   * checked by its name again; logged with the moderator, nobody told. The ruling removed, or
+   * undefined when none stood.
+   */
+  async undoRuling(
+    serverId: string,
+    key: RulingKey,
+    moderator: { id: string; name?: string | undefined },
+  ): Promise<PlaceRulingRecord | undefined> {
+    const undone = await this.options.storage.undoRuling(serverId, key);
+    if (!undone) return undefined;
+    this.options.log.info(
+      { server: serverId, place: key, ruling: undone.ruling.ruling, moderator: moderator.id },
+      'a ruling of a place was undone',
+    );
+    // The place's open ask closed with it: its post says so; nobody is told.
+    if (undone.ask) await this.showAsk(undone.ask);
+    return undone.ruling;
+  }
+
+  /**
+   * Lift block from `/places` (plan 8S-2): as an appeal's Lift block, the member may make meetups
+   * again (who lifted it is kept) and is told by DM, the server named. False when no block stood.
+   */
+  async liftBlock(
+    serverId: string,
+    memberId: string,
+    moderator: { id: string; name?: string | undefined },
+    serverName?: string,
+  ): Promise<boolean> {
+    const { storage, gateway, log } = this.options;
+    const now = this.now();
+    const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: now };
+    // Read before it is lifted: the appeal's post keeps saying who blocked them and when.
+    const block = await storage.block(serverId, memberId).catch(() => undefined);
+    const lifted = await storage.liftWithAppeal(serverId, memberId, by);
+    if (!lifted.lifted) return false;
+    // Their open appeal is decided with it (one DM, this one): its post says so.
+    const { appeal } = lifted;
+    if (appeal?.channelId && appeal.messageId) {
+      await gateway
+        .editMessage(appeal.channelId, appeal.messageId, appealMessage(appeal, block))
+        .catch((err: unknown) => {
+          log.warn({ err, appeal: appeal.id }, 'could not show the outcome of an appeal');
+        });
+    }
+    this.options.dms.send({
+      userId: memberId,
+      message: blockLiftedDm(serverName ?? this.options.gateway.guildName(serverId)),
+      priority: DM_PRIORITY.normal,
+      eventAt: now,
+      expiresAt: now + DAY,
+    });
+    return true;
+  }
+
   /** A gym's official name where its title (the nickname first) shows another; else null. */
   officialName(place: Place): string | null {
     if (place.kind !== 'gym' || !/^\d+$/u.test(place.id)) return null;
@@ -1319,9 +1460,20 @@ export class MeetupSafety {
 
   /** Shows what came of a request in its post, without buttons; a failure is logged. */
   private async show(request: MeetupRequestRecord, postId?: string): Promise<void> {
-    const { gateway, log } = this.options;
+    const { gateway, storage, log } = this.options;
     if (request.channelId === null || request.messageId === null) return;
-    const shown = requestMessage(request, postId === undefined ? {} : { postId });
+    // Block member stays on a refused or expired request while its maker is not blocked.
+    const makerBlock = blockableLater(request)
+      ? await storage.block(request.serverId, request.makerId).then(
+          (block) => block ?? null,
+          () => undefined,
+        )
+      : undefined;
+    const shown = requestMessage(request, {
+      ...(postId === undefined ? {} : { postId }),
+      officialName: this.officialName(request.place),
+      ...(makerBlock === undefined ? {} : { makerBlock }),
+    });
     try {
       await gateway.editMessage(request.channelId, request.messageId, shown);
     } catch (err) {
@@ -1350,6 +1502,15 @@ const APPEAL_OPEN_DAYS = 7;
 /** What the post of a meetup closed because its maker was blocked says last. */
 export const CLOSED_BY_MODERATORS = 'This meetup was closed by the moderators.';
 
+/** What `/places` lists of meetup safety in a server (`MeetupSafety.overview`). */
+export interface SafetyOverview {
+  rulings: PlaceRulingRecord[];
+  pending: MeetupRequestRecord[];
+  asks: PlaceAskRecord[];
+  blocks: MeetupBlock[];
+  appeals: MeetupAppeal[];
+}
+
 /** Whether a member may ask the moderators about a refused place now (`askState`). */
 export type AskState =
   | { kind: 'may'; ruling: PlaceRulingRecord }
@@ -1386,6 +1547,8 @@ export type AppealOutcome =
 /** What came of a moderator's press on an appeal's post. */
 export type AppealDecision =
   | { kind: 'gone' }
+  /** No block stood any more: the appeal is closed as lifted, nobody told. */
+  | { kind: 'no-block'; appeal: MeetupAppeal }
   | { kind: 'decided-before'; appeal: MeetupAppeal }
   | { kind: 'done'; appeal: MeetupAppeal };
 
@@ -1408,6 +1571,17 @@ export type DecideOutcome =
   | { kind: 'expired' }
   /** Approve and Refuse from now on are not for a pin. */
   | { kind: 'not-for-a-pin' }
+  /**
+   * Block member on a request decided before: its maker blocked now (`newBlock`), or blocked
+   * already; how many meetups were closed and requests withdrawn.
+   */
+  | {
+      kind: 'blocked-later';
+      request: MeetupRequestRecord;
+      newBlock: boolean;
+      closed: number;
+      withdrawn: number;
+    }
   /**
    * Decided: `postId` the meetup's post, `failure` why an approved one could not be made; of a
    * block, how many active meetups of the maker were `closed` and pending requests `withdrawn`.
diff --git a/src/services/moderation-reports.ts b/src/services/moderation-reports.ts
index fc2f3cb4..9822fa42 100644
--- a/src/services/moderation-reports.ts
+++ b/src/services/moderation-reports.ts
@@ -640,6 +640,11 @@ export class ModerationReports {
     return now ? { kind: 'decided-before', report: now } : { kind: 'gone' };
   }
 
+  /** The open reports of a server, oldest first (`/places`). */
+  openReports(serverId: string): Promise<ModerationReport[]> {
+    return this.options.storage.openReports(serverId);
+  }
+
   /** A report as it is kept; undefined for none. */
   reportOf(id: string): Promise<ModerationReport | undefined> {
     return this.options.storage.report(id);
diff --git a/test/support/lock-waits.ts b/test/support/lock-waits.ts
new file mode 100644
index 00000000..1b50d9ac
--- /dev/null
+++ b/test/support/lock-waits.ts
@@ -0,0 +1,35 @@
+import { sql, type QueryExecutorProvider } from 'kysely';
+
+/** The id of the connection a database handle or transaction runs on (`connection_id()`). */
+export async function connectionId(db: QueryExecutorProvider): Promise<number> {
+  const own = await sql<{ id: number | string }>`select connection_id() as id`.execute(db);
+  return Number(own.rows[0]?.id);
+}
+
+/**
+ * How many transactions of this database's user (the test server is shared), other than the one
+ * on connection `holder` (the one holding the lock), wait for a lock: asked until one does, or
+ * until `deadline` milliseconds have passed. A real MySQL tells nobody when a statement begins to
+ * wait, so `information_schema.innodb_trx` is asked; InnoDB fills it anew only once it has not
+ * been read for 0.1 seconds, so it is asked every 150 milliseconds (asked more often, it would show
+ * the same moment for ever).
+ */
+export async function lockWaits(db: QueryExecutorProvider, holder: number, deadline = 10_000) {
+  const waiting = async () => {
+    const rows = await sql<{ waits: number | string }>`
+      select count(*) as waits
+      from information_schema.innodb_trx t
+      join information_schema.processlist p on p.id = t.trx_mysql_thread_id
+      where t.trx_state = 'LOCK WAIT' and t.trx_mysql_thread_id <> ${holder}
+        and p.user = substring_index(current_user(), '@', 1)`.execute(db);
+    return Number(rows.rows[0]?.waits);
+  };
+  const end = Date.now() + deadline;
+  let waits = await waiting();
+  while (waits === 0 && Date.now() < end) {
+    // eslint-disable-next-line no-restricted-syntax -- a real MySQL: asked until the statement waits
+    await new Promise((resolve) => setTimeout(resolve, 150));
+    waits = await waiting();
+  }
+  return waits;
+}
diff --git a/test/support/meetup-safety-cases.ts b/test/support/meetup-safety-cases.ts
index 878ac1d3..d47cc4cc 100644
--- a/test/support/meetup-safety-cases.ts
+++ b/test/support/meetup-safety-cases.ts
@@ -450,6 +450,28 @@ export function meetupSafetyCases(made: () => Promise<MeetupSafetyStore>): void
     expect((await store.staleAppeals(stale)).map((one) => one.id)).toEqual([requestId(102)]);
   });
 
+  it('lifts a block and closes the member’s open appeal in one step', async () => {
+    const store = await made();
+    expect(await store.liftWithAppeal(SAFETY_SERVER, MAKER, MOD)).toEqual({
+      lifted: false,
+      appeal: undefined,
+    });
+    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
+    await store.addAppeal(newAppeal(1));
+    const later = { ...MOD, at: MOD.at + HOUR };
+    expect(await store.liftWithAppeal(SAFETY_SERVER, MAKER, later)).toMatchObject({
+      lifted: true,
+      appeal: { id: requestId(101), status: 'lifted', decidedAt: later.at },
+    });
+    expect(await store.block(SAFETY_SERVER, MAKER)).toBeUndefined();
+    expect(await store.openAppeal(SAFETY_SERVER, MAKER)).toBeUndefined();
+    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
+    expect(await store.liftWithAppeal(SAFETY_SERVER, MAKER, later)).toEqual({
+      lifted: true,
+      appeal: undefined,
+    });
+  });
+
   it('lifts a block on an open appeal in one step, once', async () => {
     const store = await made();
     await store.addBlock(SAFETY_SERVER, MAKER, MOD);
@@ -548,6 +570,35 @@ export function meetupSafetyCases(made: () => Promise<MeetupSafetyStore>): void
       requestId(4),
     ]);
   });
+
+  it('lists what a server has: rulings, pending requests, open asks, blocks, open appeals', async () => {
+    const store = await made();
+    await store.rule(SAFETY_SERVER, { kind: 'stop', id: LIBRARY.id }, 'refuse', MOD, {
+      place: LIBRARY,
+    });
+    await store.rule(SAFETY_SERVER, { kind: 'gym', id: '7' }, 'allow', { ...MOD, at: MOD.at + 1 });
+    await store.rule(OTHER_SERVER, { kind: 'gym', id: '8' }, 'allow', MOD);
+    await store.addRequest(newRequest(1));
+    await store.addRequest(newRequest(2, { serverId: OTHER_SERVER }));
+    await store.addRequest(newRequest(3));
+    await store.decideRequest(requestId(3), 'refused', 'refuse', MOD);
+    await store.addAsk(newAsk(1));
+    await store.addAsk(newAsk(2, { key: { kind: 'gym', id: '7' } }));
+    await store.expireAsk(requestId(302));
+    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
+    await store.addBlock(SAFETY_SERVER, MODERATOR, MOD);
+    await store.liftBlock(SAFETY_SERVER, MODERATOR, MOD);
+    await store.addAppeal(newAppeal(1));
+    expect((await store.rulings(SAFETY_SERVER)).map((one) => [one.key.id, one.ruling])).toEqual([
+      [LIBRARY.id, 'refuse'],
+      ['7', 'allow'],
+    ]);
+    expect((await store.pendingIn(SAFETY_SERVER)).map((one) => one.id)).toEqual([requestId(1)]);
+    expect((await store.openAsks(SAFETY_SERVER)).map((one) => one.id)).toEqual([requestId(301)]);
+    expect((await store.blocks(SAFETY_SERVER)).map((one) => one.memberId)).toEqual([MAKER]);
+    expect((await store.openAppeals(SAFETY_SERVER)).map((one) => one.id)).toEqual([requestId(101)]);
+    expect(await store.openAppeals(OTHER_SERVER)).toEqual([]);
+  });
 }
 
 const PARTY = '00000000-0000-4000-8000-00000000aaaa';
diff --git a/test/support/meetup-safety.ts b/test/support/meetup-safety.ts
index a5cae6d7..eb5925b0 100644
--- a/test/support/meetup-safety.ts
+++ b/test/support/meetup-safety.ts
@@ -35,9 +35,9 @@ type KeptBlock = MeetupBlock & {
  * both). `failing` makes every method of that name reject.
  */
 export class MemoryMeetupSafety implements MeetupSafetyStore {
-  readonly rulings = new Map<string, PlaceRulingRecord>();
+  readonly rulingRows = new Map<string, PlaceRulingRecord>();
   readonly asks = new Map<string, PlaceAskRecord>();
-  readonly blocks = new Map<string, KeptBlock>();
+  readonly blockRows = new Map<string, KeptBlock>();
   readonly requests = new Map<string, MeetupRequestRecord>();
   readonly appeals = new Map<string, MeetupAppeal>();
   readonly failing = new Set<keyof MeetupSafetyStore>();
@@ -50,12 +50,12 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
 
   async ruling(serverId: string, key: RulingKey) {
     await this.check('ruling');
-    return this.rulings.get(rulingId(serverId, key))?.ruling;
+    return this.rulingRows.get(rulingId(serverId, key))?.ruling;
   }
 
   async rulingRecord(serverId: string, key: RulingKey) {
     await this.check('rulingRecord');
-    const found = this.rulings.get(rulingId(serverId, key));
+    const found = this.rulingRows.get(rulingId(serverId, key));
     return found && structuredClone(found);
   }
 
@@ -77,7 +77,7 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
     by: Decider,
     more: RulingMore,
   ): void {
-    this.rulings.set(rulingId(serverId, key), {
+    this.rulingRows.set(rulingId(serverId, key), {
       serverId,
       key: { ...key },
       ruling,
@@ -93,9 +93,9 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
   async undoRuling(serverId: string, key: RulingKey) {
     await this.check('undoRuling');
     const id = rulingId(serverId, key);
-    const found = this.rulings.get(id);
+    const found = this.rulingRows.get(id);
     if (!found) return undefined;
-    this.rulings.delete(id);
+    this.rulingRows.delete(id);
     const open = [...this.asks.values()].find(
       (one) =>
         one.serverId === serverId &&
@@ -199,7 +199,7 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
 
   async keepOnAsk(ask: PlaceAskRecord, by: Decider) {
     await this.check('keepOnAsk');
-    const ruling = this.rulings.get(rulingId(ask.serverId, ask.key));
+    const ruling = this.rulingRows.get(rulingId(ask.serverId, ask.key));
     if (this.asks.get(ask.id)?.status !== 'open') return 'not-open' as const;
     if (ruling?.ruling !== 'refuse') return 'not-refused' as const;
     this.decideAskNow(ask.id, 'kept', by);
@@ -207,6 +207,43 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
     return 'kept' as const;
   }
 
+  async rulings(serverId: string) {
+    await this.check('rulings');
+    return [...this.rulingRows.values()]
+      .filter((one) => one.serverId === serverId)
+      .sort((a, b) => a.ruledAt - b.ruledAt || a.key.id.localeCompare(b.key.id))
+      .map((one) => structuredClone(one));
+  }
+
+  async pendingIn(serverId: string) {
+    await this.check('pendingIn');
+    return this.sorted((one) => one.serverId === serverId && one.status === 'pending');
+  }
+
+  async openAsks(serverId: string) {
+    await this.check('openAsks');
+    return [...this.asks.values()]
+      .filter((one) => one.serverId === serverId && one.status === 'open')
+      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
+      .map((one) => structuredClone(one));
+  }
+
+  async blocks(serverId: string) {
+    await this.check('blocks');
+    return [...this.blockRows.values()]
+      .filter((one) => one.serverId === serverId && one.liftedAt === null)
+      .sort((a, b) => a.blockedAt - b.blockedAt || a.memberId.localeCompare(b.memberId))
+      .map(({ liftedBy: _by, liftedByName: _name, liftedAt: _at, ...block }) => block);
+  }
+
+  async openAppeals(serverId: string) {
+    await this.check('openAppeals');
+    return [...this.appeals.values()]
+      .filter((one) => one.serverId === serverId && one.status === 'open')
+      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
+      .map((one) => ({ ...one }));
+  }
+
   async staleAsks(stale: { unpostedBefore: number; openedBefore: number }) {
     await this.check('staleAsks');
     return [...this.asks.values()]
@@ -222,7 +259,7 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
 
   async block(serverId: string, memberId: string) {
     await this.check('block');
-    const found = this.blocks.get(`${serverId} ${memberId}`);
+    const found = this.blockRows.get(`${serverId} ${memberId}`);
     if (!found || found.liftedAt !== null) return undefined;
     const { liftedBy: _by, liftedByName: _name, liftedAt: _at, ...block } = found;
     return block;
@@ -240,9 +277,9 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
     memberName: string | null,
   ): boolean {
     const key = `${serverId} ${memberId}`;
-    const found = this.blocks.get(key);
+    const found = this.blockRows.get(key);
     if (found && found.liftedAt === null) return false;
-    this.blocks.set(key, {
+    this.blockRows.set(key, {
       serverId,
       memberId,
       memberName,
@@ -279,7 +316,7 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
 
   async liftBlock(serverId: string, memberId: string, by: Decider) {
     await this.check('liftBlock');
-    const found = this.blocks.get(`${serverId} ${memberId}`);
+    const found = this.blockRows.get(`${serverId} ${memberId}`);
     if (!found || found.liftedAt !== null) return false;
     found.liftedBy = by.id;
     found.liftedByName = by.name;
@@ -287,6 +324,28 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
     return true;
   }
 
+  async liftWithAppeal(serverId: string, memberId: string, by: Decider) {
+    await this.check('liftWithAppeal');
+    const found = this.blockRows.get(`${serverId} ${memberId}`);
+    if (!found || found.liftedAt !== null) return { lifted: false, appeal: undefined };
+    found.liftedBy = by.id;
+    found.liftedByName = by.name;
+    found.liftedAt = by.at;
+    const open = [...this.appeals.values()].find(
+      (one) => one.serverId === serverId && one.memberId === memberId && one.status === 'open',
+    );
+    if (!open) return { lifted: true, appeal: undefined };
+    const decided: MeetupAppeal = {
+      ...open,
+      status: 'lifted',
+      decidedBy: by.id,
+      decidedByName: by.name,
+      decidedAt: by.at,
+    };
+    this.appeals.set(open.id, decided);
+    return { lifted: true, appeal: { ...decided } };
+  }
+
   async liftOnAppeal(appeal: Pick<MeetupAppeal, 'id' | 'serverId' | 'memberId'>, by: Decider) {
     await this.check('liftOnAppeal');
     const found = this.appeals.get(appeal.id);
@@ -298,7 +357,7 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
       decidedByName: by.name,
       decidedAt: by.at,
     });
-    const block = this.blocks.get(`${appeal.serverId} ${appeal.memberId}`);
+    const block = this.blockRows.get(`${appeal.serverId} ${appeal.memberId}`);
     if (block && block.liftedAt === null) {
       block.liftedBy = by.id;
       block.liftedByName = by.name;
````

### Task 8: Plan 8S-2 T8: Cutover check of the reports' permissions, docs and staging checklist

Prototype commit: `4a21751f4faec1ab321904913deecb1e9ffb55d2`

cutover-check warns (never fails), where the moderators' channel is set, of regions whose
channel or forum lacks Manage Messages or whose forum lacks Manage Threads: the moderators
then delete reported messages and posts themselves. moderation.md describes reports, /delete
and /places; meetup-safety.md the asks about places, Block member on decided requests and
official names; the guides say members report with /report and that Manage Messages offers
/delete and /places; a draft staging checklist.

**Files:**

```
 docs/architecture/meetup-safety.md                     | 11 +++++++++--
 docs/architecture/moderation.md                        | 28 ++++++++++++++++++++++++++
 docs/architecture/operations.md                        |  2 +-
 docs/architecture/parties-and-posts.md                 |  4 ++--
 docs/architecture/testing.md                           |  6 +++++-
 docs/guides/migrating-a-legacy-instance.md             |  1 +
 docs/guides/new-instance.md                            |  4 ++--
 docs/superpowers/plans/2026-10-17-phase-8s2-staging.md | 62 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/ops/cutover-check.test.ts                          | 19 ++++++++++++++++++
 src/ops/cutover-check.ts                               | 55 +++++++++++++++++++++++++++++++++++++++++++++++++++
 src/render/place-asks.ts                               |  7 ++++---
 11 files changed, 188 insertions(+), 11 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/ops/cutover-check.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4a21751f4faec1ab321904913deecb1e9ffb55d2 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-2 T8: Cutover check of the reports' permissions, docs and staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/docs/architecture/meetup-safety.md b/docs/architecture/meetup-safety.md
index ed890b57..d34b3f1a 100644
--- a/docs/architecture/meetup-safety.md
+++ b/docs/architecture/meetup-safety.md
@@ -26,9 +26,16 @@ A meetup at a place that might be private is held for a moderator before anythin
 ## Blocks and appeals
 
 - Block member refuses the request (`decision` `block`) and blocks its maker in that server in one transaction (`blockMaker`, read committed: no gap locks, so two Blocks of one maker never deadlock; it never joins a caller's transaction: `inTransaction` throws when an isolation level is asked for inside one; `MeetupBlock`, one row per server and member, blocked again in place of a lifted one: only the last lift is kept, `liftedBy`, `liftedByName`, `liftedAt`), then, each step caught and logged so that the post and the DM always come, withdraws their other pending requests there (status `withdrawn`, posts edited, no DM each), closes their active meetups there as `/delete` does with `CLOSED_BY_MODERATORS` ("This meetup was closed by the moderators.", `PartyService.end` with `lastWords`), and DMs them (`blockedDm`) that they may appeal with `/meetup`, only when the block is new (`newBlock`): two Blocks give one DM.
-- A blocked member's `/meetup` answers with Appeal (`mappeal:<server>:open`), which opens the form of an appeal (`appealForm`, "Why should the block be lifted?", `mappeal:<server>:form`) unless the member may not appeal now (`appealState`: not blocked, one appeal open, or within `APPEAL_WAIT_DAYS` (7) after a block was kept); an open appeal that is stale (its post never recorded after five minutes, or open for seven days) is closed as `expired` then (its post edited without waiting: the form must open within three seconds), and by the sweep (which edits its post and DMs the member, the server named through `PartyGateway.guildName`, that they may appeal again). The presses of Appeal count as reading (`MEMBER_READ_THROTTLE`); the submit (three an hour, `APPEAL_THROTTLE`) stores the appeal (one open per member and server: a unique `openKey`) and posts it to the moderators' channel (`appealMessage`: the member, who blocked them and when, their words) with Lift block and Keep block (`mappeal:<appeal id>:lift|keep`, staff only, first press wins; Lift block decides the appeal and lifts the block in one transaction, `liftOnAppeal`); the seven days are checked again once the appeal is stored (a keep that came in between discards it). The post keeps who blocked them after a Lift (the block is read before it is lifted) and says when they may appeal again after a Keep; the member is told by DM, the server named (`appealOutcomeDm`). Lifting never restores refused requests or closed meetups.
+- A blocked member's `/meetup` answers with Appeal (`mappeal:<server>:open`), which opens the form of an appeal (`appealForm`, "Why should the block be lifted?", `mappeal:<server>:form`) unless the member may not appeal now (`appealState`: not blocked, one appeal open, or within `APPEAL_WAIT_DAYS` (7) after a block was kept); an open appeal that is stale (its post never recorded after five minutes, or open for seven days) is closed as `expired` then (its post edited without waiting: the form must open within three seconds), and by the sweep (which edits its post and DMs the member, the server named through `PartyGateway.guildName`, that they may appeal again). The presses of Appeal count as reading (`MEMBER_READ_THROTTLE`); the submit (three an hour, `APPEAL_THROTTLE`) stores the appeal (one open per member and server: a unique `openKey`) and posts it to the moderators' channel (`appealMessage`: the member, who blocked them and when, their words) with Lift block and Keep block (`mappeal:<appeal id>:lift|keep`, staff only, first press wins; Lift block decides the appeal and lifts the block in one transaction, `liftOnAppeal`); the seven days are checked again once the appeal is stored (a keep that came in between discards it). The post keeps who blocked them after a Lift (the block is read before it is lifted) and says when they may appeal again after a Keep; the member is told by DM, the server named (`appealOutcomeDm`). Lifting never restores refused requests or closed meetups. An appeal pressed when no block stands any more (lifted otherwise) is closed as lifted, nobody told (`no-block`).
+
+- Block member stays on the post of a request refused (not by a block) or expired while its maker is not blocked (`blockableLater`, 8S-1 review W7; the post reads the maker's block each time it is drawn, `makerBlock`): a press blocks them as from a pending request (`addBlock` and the same sweep, `afterBlock`, one DM; `blocked-later`, or blocked already), and the post then says who blocked them. Every moderators' post names a gym's official name beside the nickname its title shows (`officialName`, `placeLine`: "(gym; officially **Frog Fountain**)").
+
+## Asks about refused places
+
+- A place refused for good (`NO_MEETUP_HERE`) gets **Ask the moderators** under `/meetup`'s refusal (`placeRefusal`, `src/commands/meetups/place-ask.ts`; the guard's refusal only, a ruling that came while the form was open is said plainly) once the refusal, or its last Keep refused, is `PLACE_ASK_WAIT_DAYS` (14) old (`askableAt`, counted per place, `keptAt`); while an ask of the place is open the refusal adds "It is with the moderators already."; a blocked member is refused by the block first (`askState` and `askAboutPlace` read the block before the place: `blocked`, the block's refusal with Appeal). The web map's refusal has no button: when the place may be asked about it says to ask with `/meetup` on Discord (`ASK_ON_DISCORD`). The button (`mplace:<kind>:open:<place id>`, stateless: the server the presser's, the place by its key, so that it works after a restart; read as reading) opens the form "Why should meetups be allowed here?" (`mplace:<kind>:form:<place id>`, the appeal's throttle) unless `askState` says otherwise (`wait`, `open`, `not-refused`); the place of the ask is the ruling's (a ruling of 8S-1 kept none: the gym or kept Wayspot as it is now, `MeetupSafetyOptions.wayspots`). `MeetupSafety.askAboutPlace` keeps the ask (`PlaceAskRecord`, one open per server and place: a unique `openKey`) and posts it (`askMessage`, `src/render/place-asks.ts`: the member, the place with its official name, the ruling (`rulingLine`: who, when, from which request, report or ask), their words) with Allow place and Keep refused (`mplace:<ask id>:allow|keep`, staff, first press wins; `allowOnAsk` decides and rules allow in one step, the ask the ruling's source; `keepOnAsk` decides and sets `keptAt` only while a refusal stands, locked: undone or allowed meanwhile it keeps nothing, `not-refused`, nobody told); the member is told by DM, the server named (`askOutcomeDm`). An ask nobody decides in `ASK_OPEN_DAYS` (7), or never posted, expires in the sweep of `expire()` (post edited, DM: they may ask again).
+- A ruling keeps who made it by name, the place, the post it came from (`RulingSource`: a request's on Approve and Refuse from now on, a report's on Refuse place…, an ask's on Allow place) and `keptAt` (`PlaceRulingRecord`, `rulingRecord`); `/places` shows it and undoes it (`moderation.md`).
 
 ## Storage
 
-- Migration 019 (`MeetupRequest`, `MeetupPlaceRuling`, `MeetupBlock`, `MeetupAppeal`): servers and members by snowflake without a foreign key, times in epoch milliseconds, a request's place as JSON read through `placeDocument` (`party-state.ts`; a row that does not read is logged and left alone, a due one failed), its post (`channelId`, `messageId`) never null. `isDuplicateEntry(err, key)` (`src/db/errors.ts`) tells the open-appeal key's duplicate from others. `MeetupSafetyRepository` and its twin `MemoryMeetupSafety` (`test/support/meetup-safety.ts`) run the same cases (`meetupSafetyCases`).
+- Migration 019 (`MeetupRequest`, `MeetupPlaceRuling`, `MeetupBlock`, `MeetupAppeal`): servers and members by snowflake without a foreign key, times in epoch milliseconds, a request's place as JSON read through `placeDocument` (`party-state.ts`; a row that does not read is logged and left alone, a due one failed), its post (`channelId`, `messageId`) never null. `isDuplicateEntry(err, key)` (`src/db/errors.ts`) tells the open-appeal key's duplicate from others. `MeetupSafetyRepository` and its twin `MemoryMeetupSafety` (`test/support/meetup-safety.ts`; its maps `rulingRows`, `blockRows`, `requests`, `appeals`, `asks`) run the same cases (`meetupSafetyCases`). Migration 022 (plan 8S-2) adds `MeetupPlaceAsk` and, on `MeetupPlaceRuling`, `ruledByName`, `place`, `sourceKind`, `sourceId`, `sourceChannelId`, `sourceMessageId` and `keptAt` (null for a ruling of 019), besides the reports' tables (`moderation.md`); the store lists a server's rulings, pending requests, open asks, blocks and open appeals for `/places`.
 - Tests of the service and the controls build it with `meetupSafetyWith(options)` (`test/support/meetup-safety-service.ts`): the services of `partyServiceWith`, the moderators' channel `MODERATION` as `MOD_CHANNEL` on the fake gateway (`moderation: null` for the safety off, `channel: false` for a server without it), `held(ask?)` for a request of Alice's at the Little Free Library a day ahead, `postOf(request)`. `createTestContext`'s own `meetupSafety` is off (the test settings name no moderators' channel).
diff --git a/docs/architecture/moderation.md b/docs/architecture/moderation.md
new file mode 100644
index 00000000..cc41bf4f
--- /dev/null
+++ b/docs/architecture/moderation.md
@@ -0,0 +1,28 @@
+# Moderation: reports, /delete and /places
+
+Members report a party or a single message to the moderators privately, the moderators decide on the report's post, `/delete` is staff's, and `/places` lists the rulings of places and everything that waits for a moderator (plan 8S-2; spec `docs/superpowers/specs/2026-10-17-moderation-reports-design.md`, Matt, 2026-10-17). The moderators' channel and meetup safety's requests, rulings, blocks, appeals and asks about places are in `meetup-safety.md`. Read before changing `/report`, "Report to moderators", `/delete`, `/places` or anything under `src/services/moderation-reports.ts`, `src/components/moderation-reports.ts`, `src/render/moderation.ts`, `src/render/places.ts`.
+
+## Reporting
+
+- `/report` (every member, staff and the party's maker too; in a party's post, `requireParty`) opens a form for the reason (`partyReportForm`, "What is wrong?", required, at most `MAX_REPORT_REASON` 1,000; `report:<party id>:party`). "Report to moderators" is a message command (`reportMessageCommand`, `src/commands/parties/report-message.ts`; `discord-framework.md`): on a party's post, a copy of it (`mirrorMessages`) or its link line in the region's channel (`partyOfMessage`) it opens the same form; on any other message of the bot it answers `NOTHING_TO_REPORT` ("Nothing to report there."); on anybody else's message (a member's chat in a party's post too) it keeps what Discord sent of the message under a token for half an hour (`PendingRequests`) and opens `report:<token>:message`. The forms' handler is `reportControls` (`src/commands/parties/report.ts`): a reason of white space alone is refused by a guard, uncounted; every submit counts in `/report`'s window (`REPORT_THROTTLE`, five an hour, `as: 'report'`), whichever way the form was opened. A form of the member's old `/delete` (`party:<id>:delete`), open across the deploy, is taken as a report.
+- `ModerationReports` (`src/services/moderation-reports.ts`, `ctx.reports`) keeps reports in `ReportStore` (`ReportRepository`, migration 022; twin `MemoryReports`, both run `reportCases`). `reportParty` / `reportMessage`: one open report per party and per message (`reportTargetKey`, the unique `openKey`): a reason opens it, or joins the open one (`added`; its post edited, never sent again), unless the member has one there (`already`: "You already reported this."). A reason joins a report only while it is open: the repository finds the open report by its key and locks it by its id (a lock on the key's index too would deadlock with a decision, which changes the key), then inserts the reason (a second one of the same member is `already`); a report decided meanwhile is followed by a new one. A report opened is posted first, then recorded (`setReportPost`), then drawn anew when anything changed while the post was on its way (a reason more; its party ended, looked at once more); a post that fails takes the report back (`not-sent`). The post is always drawn from the report as it is kept: `show(reportId)` reads it just before each edit, one edit at a time per report (a promise tail in a `BoundedMap`), so that an older edit never lands after a newer one. A report left without its post for five minutes (the bot stopped in between) is opened anew by the next reason; the reasons of a report that is gone (stranded, its post failed, or forgotten by the sweep) are carried over to the next report of its subject (`orphans`, in memory: a restart loses them, which is accepted), so that nobody told "Sent" loses their reason while the bot runs. The sweep (`ModerationReports.sweep`, with the appeals' sweep of `PartySchedulerOptions.requests`, so also at start) forgets reports never posted for five minutes and ends the open reports of parties that are over (the bot stopped before the listener saw the end). The subject is checked against its schema before it is kept (`reportSubject`). The reporter is told "Sent to the moderators." and nothing more; nothing is said in the party's post and nobody is pinged. What the post shows of the party is a snapshot (`PartySubject`: the post's title, the brief's lines but its line of where, `PartyBrief.whereLine`, since the post's own **Where** says it with the official name; the region, the place, a gym's official name, the maker, a meetup's information), renewed with every reason and at a decision; of a message a copy (`MessageSubject`: author, channel, time, its text cut to `MESSAGE_COPY_ROOM`, its attachments' names, the party whose post it is in), kept when the message is gone, and shown cut after escaping (1,500 characters of text, a name 100 and all names 600). A member's message form keeps one message per member (a newer form expires the older), so that one member cannot push the others out of the store.
+- Without `settings.channels.moderation` a party's report goes into its post as a member's `/delete` did (`PartyService.requestDeletion`: the public line, the staff roles pinged by the first that is sent, the reason cut to 500 so that the message with its pings stays within 2,000), and a message cannot be reported (`NO_MODERATORS`).
+
+## The moderators' post and its decisions
+
+- `reportMessage(report)` (`src/render/moderation.ts`): `### Reported meetup` (raid, train, message), what it is and when, who made it and where, **Where** (`placeLine`, a gym's official name beside its nickname), a meetup's **Information**, **Reasons** with every reporter (`memberText`, the words through `plain`; as many whole ones as fit, then "…and N more reasons"), and while open the buttons of `reportActions`: a raid or train Close… and Dismiss; a meetup Close…, Refuse place… (a gym or PokéStop, never a pin), Block maker… and Dismiss; a message Delete message and Dismiss; with Go to post / Go to message while it is there. Decided, it shows who decided what and when, without buttons.
+- `reportDecisionControls` (kind `mreport`, `src/components/moderation-reports.ts`): staff alone (`requireManagement`, refused uncounted), `SAFETY_THROTTLE`. An action that ends a party asks first, privately, "Archive the post or delete it?" (`removalQuestion`, `mreport:<id>:<action>:archive|delete`); the answer is carried out in the place of the question. `ModerationReports.decide`: one conditional change of the report (`decideReport`, the first press wins; a later one is told who decided what; a question of an action pressed on a decided report says so at once), then its work with the party as it is now (its subject renewed): Refuse place… refuses the place for good with the report's post as the ruling's source (`MeetupSafety.refusePlace`), Block maker… blocks as Block member does (`MeetupSafety.blockMember`: the maker's name kept, one DM only for a new block, the maker's other meetups closed archived, this one left to the end, their pending requests withdrawn), then the party ends as `/delete` ends it (`PartyService.endAs` with "This meetup was closed by the moderators.", `removal`; the history records `cancelled`). Refuse place… on a meetup whose place is now a pin or none changes nothing (`no-place`, said so). Where a step of the work fails, the report is opened again (`reopenReport`: its buttons back) and `failed` tells the moderator what was done before it (a place refused, a maker blocked: they stay, and a second try finds them done) and whether the report is open again (if not, to close the party with `/delete`). `endAs` says how the post went: a deletion Discord refused archives it, which the report keeps as removal `denied` (`setRemoval`; the post says "archived: Discord refused to delete it") and the moderator is told ("archived: Discord refused to delete it; delete it yourself"); a party over between the press and the closing has its post deleted all the same when Delete post was chosen (`PartyService.deletePostOf`). Delete post where the bot lacks Manage Threads (`PartyGateway.mayDeletePost`, from the cache) is refused before anything changes (`may-not-delete`), the question shown again with Archive post alone. Delete message claims the report first (`decideReport` as `deleted`, so a Dismiss at the same moment wins or loses before anything is deleted), then deletes the message (`PartyGateway.deleteReported`: an archived post is opened for the deletion and archived again as it was, locked or not, also when the deletion fails; a channel the bot cannot see, Missing Access, is `not-allowed`): `deleted`, `gone` when it was deleted first (`markGone`; the post says so); without Manage Messages the report is opened again and the moderator told to delete it themselves, and a deletion that fails opens it again too (`failed`). In rehearsal mode the rehearsal's gateway deletes a member's message only in the post of a rehearsed party (else `not-allowed`, logged).
+- A reported party that ends without a moderator (the clock, its maker, a move, `/delete`) ends its open report (`watch`: a listener of the store, the work on the side, `flush()` in tests): the post says it was over, without buttons.
+- In rehearsal mode the reports' posts go through meetup safety's gateway (`rehearsalModeratorsGateway`).
+
+## /delete
+
+- `/delete` is for staff (`default_member_permissions` Manage Messages, `requireManagement`, help category `admin`): it asks privately whether to archive the post or delete it (`pclose:<party id>:archive|delete`, `closeControls`), then ends the party as before, the post saying who closed it (`PartyService.end` with `removal`: `delete` deletes the post with everything in it in the place of its last showing and the archiving; a deletion Discord refuses archives it). The command has no throttle; its question's buttons have `CLOSE_THROTTLE` (twenty a minute) and take no party of another server. A deletion Discord refuses is said to the moderator as for a report. `/help` tells a member who asks for `/delete` to use `/report` (`TOLD_INSTEAD`, without saying that the command exists).
+
+## /places
+
+- `/places [place]` (`src/commands/meetups/places.ts`): Manage Messages, `requireManagement`, answered privately. With a place (`namedPlace`, every kind, a pin has no ruling): its ruling (`rulingLine`: who, when, from which post), Undo ruling (`places:<kind>:undo:<place id>`: the ruling removed, logged with the moderator, nobody told; the place's open ask closed in the same step as `undone`, its post saying so). Without: `placesList` (`src/render/places.ts`) of `MeetupSafety.overview` and the open reports: refused places, allowed places, pending requests, open asks about places, blocked members (by the name they had, `MeetupBlock.memberName`, else as the server knows them now, else the mention; each a section with Lift block, `places:<member>:lift:<page>`: as an appeal's Lift block, their open appeal closed in the same step, `liftWithAppeal`, its post edited, one DM, `blockLiftedDm`), open appeals, open reports, each with the way to its post, `PLACES_PAGE` (10) to a page with arrows (`places:list:page:<n>`); a press is acknowledged first (`deferUpdate`), reads the lists anew and shows the page in place (`showInPlace`).
+
+## Tests
+
+- `reportsWith(options)` (`test/support/reports-service.ts`) is `meetupSafetyWith` with `ModerationReports` over `MemoryReports` (`reportStore`), following the store as the bot does; `reportPostOf(report)` is the message of a report's post; `reportedMeetup()` adds Alice's meetup at the Little Free Library and `report(reporterId?, reason?)`. `createTestContext`'s own `reports` is off (no moderators' channel: a report goes into the post). The fake gateway's `noManaging` (channels, forums, posts) refuses deleting there (`mayDeletePost`, `deleteReported`).
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
index 66fe7b92..e2437a80 100644
--- a/docs/architecture/operations.md
+++ b/docs/architecture/operations.md
@@ -70,7 +70,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 The tools of the cutover, for every legacy instance (Pittsburgh's night: `docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md`).
 
 - `./pine convert-settings <legacy data folder> [--out <folder>] [--force]` (`npm run settings:convert -- …` on a checkout; `convertSettings` / `convertInstallation`, `src/ops/convert-settings.ts`): reads the legacy `settings.json` and `private-settings.json` and writes `pine-settings.json` and `env-from-legacy.txt` beside `compose.yaml` (or into `--out`), never `.env` itself, and neither file when either exists unless `--force`. The settings start from the repository's `data/settings.json` (the new keys' defaults: the timezone, the screen reader, the feeds), and every key the new bot reads takes the legacy value; renamed keys are mapped (`RENAMED`: `channels.ex-gym-raids` to `channels.elite-gym-raids`), help groups the new bot does not have are dropped from `helpGroups`, every key nothing reads (the EX durations, `commandPrefix`, the reactions) is dropped and named, and a feature flag the legacy file lacks is off (`offByAbsence`: the legacy bot read it as undefined); the result must pass the bot's own schema, or nothing is written. `regionMapLink` comes from the private settings. The private settings map to `.env` (`PRIVATE_TO_ENV`: the token, the owner, the database, the picture address (`POKEMON_IMAGE_BASE`, optional: nothing reads it any more, so it is never asked for by hand), Google, GitHub's token and repository); secrets are copied as written (never trimmed; a snowflake written as a JSON number is refused: it has lost digits); both files go to temporary files first (the fragment owner-only from its creation) and are renamed into place only when both were written; the fragment lists what the operator adds by hand (`DISCORD_APP_ID`, which the legacy bot never had, `DB_ROOT_PASSWORD`, `BACKUP_DIR`, written as `./backups` meanwhile, since a blank one switches the backups off; a `DB_USER` of `root`, which the stack cannot make). A file that starts with a byte order mark is read. It prints names and "set" / "empty", never a value. In the stack it runs without Compose (Compose refuses `compose.yaml` without `.env`): `docker build` under a tag of its own (`professor-pine:convert-settings`: under a stack's tag it would re-tag the image that stack runs), then `docker run` of that image as the operator's own user with the legacy folder mounted read-only and the output folder writable; a folder is handed to Docker as `docker_folder` makes it (`pwd -W` in Git Bash).
-- `./pine cutover-check` (`npm run cutover:check` on a checkout against the configured database; `cutoverCheck`, `src/ops/cutover-check.ts`) is the go / no-go of a cutover, read only: the database in a read-only transaction (`CutoverRepository`, which reads a legacy database as a Pine one, `migrationPlan` and the legacy restriction tables), Discord through its REST API with the bot's token, GETs only (`DiscordRead`; no gateway login, so the legacy bot keeps running). It prints `PASS` / `WARN` / `FAIL` lines and exits 1 when any fails: the database (what the migrator would do, in its own words: `migrationPlan`, `src/db/migrator.ts`, shares the refusals with `runMigrations`, and the pending migrations come from Kysely's own list, which writes nothing); the application (`DISCORD_APP_ID` must be the token's), the privileged intents the settings ask for against those it has, the game's icons it lacks as emoji; in rehearsal mode the application's global commands (a warning: every member sees them; one that cannot be read is a warning too, and the rest is still checked) and, per server, what the bot's own roles must give it to make a hidden forum (`HIDDEN_FORUM_NEEDS`: Manage Channels, Manage Roles, View Channel, Send Messages, Read Message History, Send Messages in Threads and Add Reactions, all required; one FAIL line names those missing: a hidden forum's creation may give only what the bot has in the server, so a category's overwrite does not count; the server's warning of optional permissions leaves out what that line names, so one problem gives one line); the servers of `Guild` the bot is in (a FAIL when it is in none of them, and when a legacy or Pine database names no server or has no regions: the wrong copy; a warning for a new install); per server the bot's roles and the permissions it needs (`SERVER_NEEDS`), per region those in its channel (`REGION_CHANNEL_NEEDS`) and in its category and forum (`FORUM_NEEDS`), computed from the roles and overwrites as Discord does (`src/ops/permissions.ts`; the lists name what the code asks of Discord, a missing optional one is a warning); the regions without a forum; the channels, the category and the role the settings name that the server lacks; rows of the legacy restriction tables, listed as `role-auth-export` lists them; whether the bot may post in the channels it announces in (`ANNOUNCE_NEEDS`: bot-updates, the moderators' channel, Unown sightings, the elite and remote channels); meetup safety's moderators' channel (`moderation`, plan 8S-1: a warning when `settings.channels.moderation` is unset, so the safety is off, when the server has no text channel of that name, when the bot lacks what it needs there (`MODERATION_NEEDS`: View Channel, Send Messages, Embed Links), or when everyone can see it, or a role that is no staff role (neither named as one, `isStaffRoleName`, nor with Manage Server or Administrator; the bot's own roles left out) lets its holders see it, those roles named (it must be staff-only); a pass otherwise); the self-assigned roles of `Role` that sit at or above the bot's highest role, which it cannot give (by snowflake, or by name where a legacy row has none; names compared trimmed and lower case, as the bot compares them). Manage Messages in a region channel is optional (the screenshot it read is taken away). `migrationPlan` also refuses what Kysely's `migrateToLatest` would (a migration run that the bot does not know, migrations run out of order), in its words. Each section of the database that cannot be read (`databaseStore`, `src/ops/cutover-store.ts`, reads a database of any shape and gives nothing for a table it lacks) and each server that cannot be read is a FAIL line of its own, and the rest is still checked; `/users/@me/guilds` is read unpaginated (the first 200 servers). A new permission the bot needs goes into those lists.
+- `./pine cutover-check` (`npm run cutover:check` on a checkout against the configured database; `cutoverCheck`, `src/ops/cutover-check.ts`) is the go / no-go of a cutover, read only: the database in a read-only transaction (`CutoverRepository`, which reads a legacy database as a Pine one, `migrationPlan` and the legacy restriction tables), Discord through its REST API with the bot's token, GETs only (`DiscordRead`; no gateway login, so the legacy bot keeps running). It prints `PASS` / `WARN` / `FAIL` lines and exits 1 when any fails: the database (what the migrator would do, in its own words: `migrationPlan`, `src/db/migrator.ts`, shares the refusals with `runMigrations`, and the pending migrations come from Kysely's own list, which writes nothing); the application (`DISCORD_APP_ID` must be the token's), the privileged intents the settings ask for against those it has, the game's icons it lacks as emoji; in rehearsal mode the application's global commands (a warning: every member sees them; one that cannot be read is a warning too, and the rest is still checked) and, per server, what the bot's own roles must give it to make a hidden forum (`HIDDEN_FORUM_NEEDS`: Manage Channels, Manage Roles, View Channel, Send Messages, Read Message History, Send Messages in Threads and Add Reactions, all required; one FAIL line names those missing: a hidden forum's creation may give only what the bot has in the server, so a category's overwrite does not count; the server's warning of optional permissions leaves out what that line names, so one problem gives one line); the servers of `Guild` the bot is in (a FAIL when it is in none of them, and when a legacy or Pine database names no server or has no regions: the wrong copy; a warning for a new install); per server the bot's roles and the permissions it needs (`SERVER_NEEDS`), per region those in its channel (`REGION_CHANNEL_NEEDS`) and in its category and forum (`FORUM_NEEDS`), computed from the roles and overwrites as Discord does (`src/ops/permissions.ts`; the lists name what the code asks of Discord, a missing optional one is a warning); the regions without a forum; the channels, the category and the role the settings name that the server lacks; rows of the legacy restriction tables, listed as `role-auth-export` lists them; whether the bot may post in the channels it announces in (`ANNOUNCE_NEEDS`: bot-updates, the moderators' channel, Unown sightings, the elite and remote channels); meetup safety's moderators' channel (`moderation`, plan 8S-1: a warning when `settings.channels.moderation` is unset, so the safety is off, when the server has no text channel of that name, when the bot lacks what it needs there (`MODERATION_NEEDS`: View Channel, Send Messages, Embed Links), or when everyone can see it, or a role that is no staff role (neither named as one, `isStaffRoleName`, nor with Manage Server or Administrator; the bot's own roles left out) lets its holders see it, those roles named (it must be staff-only); a pass otherwise); with the moderators' channel set, whether the bot may delete what reports are about in every region (`reports`, plan 8S-2: Manage Messages in the region's channel and forum, Manage Threads in the forum; a warning, never a failure: the moderators then delete them themselves; it overlaps on purpose with the region line's optional Manage Messages, which says what the screenshots lack, and it looks at the regions alone: a message reported in another channel may still find the bot without Manage Messages, which Delete message then says); the self-assigned roles of `Role` that sit at or above the bot's highest role, which it cannot give (by snowflake, or by name where a legacy row has none; names compared trimmed and lower case, as the bot compares them). Manage Messages in a region channel is optional (the screenshot it read is taken away). `migrationPlan` also refuses what Kysely's `migrateToLatest` would (a migration run that the bot does not know, migrations run out of order), in its words. Each section of the database that cannot be read (`databaseStore`, `src/ops/cutover-store.ts`, reads a database of any shape and gives nothing for a table it lacks) and each server that cannot be read is a FAIL line of its own, and the rest is still checked; `/users/@me/guilds` is read unpaginated (the first 200 servers). A new permission the bot needs goes into those lists.
 - `/admin cleanup-legacy` (staff, `defer: 'ephemeral'`; `src/commands/admin/cleanup-legacy.ts`, `LegacyCleanup` in `src/services/legacy-cleanup.ts`, the rules in `src/ops/legacy-cleanup.ts`) deletes the legacy bot's party channels in two steps. The list, read only through Discord's REST API (the client's own `rest`; `cleanupList`): the text channels the legacy `active/` files name (`readLegacyActive`, `src/ops/legacy-parties.ts`: only the channel, the kind and the region channel are taken, never the members), and orphans: text channels in a scanned category (those of the region channels and of the channels the files name; never the channels in no category, the server's own, where a region channel without a category also sits) whose name is a legacy party name (`legacyNameOf`: `train-…`, `meetup-…`, `egg-<tier>-…`, `boss-<tier>-…`, `expired-…`, `ex-raid-…`, `elite-raid-…` are sure) and whose oldest message (`GET /channels/{id}/messages?after=0&limit=1`) is the bot's. A hatched raid's `<pokemon>-<gym words>` is any name of two words: it is deleted only when its first message is the legacy bot's status (`LEGACY_STATUS`: "Use #region to return to this raid's regional channel.", as `getSourceChannelMessageHeader` of the legacy `app/raid.js`, `train.js`, `meetup.js` wrote it), and listed apart when the bot wrote something else first. Never listed, whatever a file says: a region channel, a region's forum, a channel the settings name (`settings.channels`). A channel with a sure name whose first message is not the bot's (a member's, none, unreadable), or one with the bot first and no legacy name, is listed apart as "Not deleted" for a person. The answer is a components-v2 message (the whole list as `legacy-cleanup.txt` when it does not fit), with "Delete these n channels" and Cancel, which only the one who asked may press within `CLEANUP_MINUTES` (10; `PendingRequests`); the deletion goes one channel at a time, a second apart (discord.js waits out a 429 besides; `LegacyCleanup` takes a `wait`, which tests pass), logs each, shows how far it is every ten channels in the answer (so that a long run says something before the interaction's quarter of an hour ends), counts what was gone already and says what failed (by whole lines, then "…and n more"); a second press meanwhile is only acknowledged. One press deletes at most `CLEANUP_PER_RUN` (400) channels, so that the run ends while the press's quarter of an hour still lets it say so: the button then reads "Delete 400 of these n" and the answer says to run the command again for the rest. The legacy files come from `LEGACY_PARTIES_DIR`, a folder the stack mounts read-only at `/legacy-parties` (blank: none; the list is then made of orphans alone, which the legacy active parties' channels also are when the bot wrote first); `./pine up`, `restart` and `update` refuse a `LEGACY_PARTIES_DIR` without `active/`. A folder rather than attachments: the same reading serves `cutover-check`, nineteen files need no upload, and the files' member ids never go to Discord. `./pine cutover-check --legacy-parties <folder>` mounts that folder for the check alone and counts the list without deleting.
 - **Rehearsal mode** (`settings.rehearsal`: `allowlist` of member ids, `regions` by their channels' names as written, a leading `#` refused, and those no region channel of the server has named in the answer of `/admin setup-forums` (a failure to compare them is a line of that answer and a warning in the log), `staffRoles` by name; `src/services/rehearsal.ts`) runs the bot with a production token against a copy of the production database while the legacy bot is off for a short while, and nothing of it may reach members (spec 2, anti-goals). While it is set: `RehearsalDms` passes direct messages to the allowlist only (the others are dropped, and one line a minute says how many); `rehearsalGateway` wraps the party gateway so that a message goes only into the post of a party in a rehearsed forum (meetup safety alone gets a gateway of its own over it, `rehearsalModeratorsGateway`, that lets its requests and appeals into the text channel `settings.channels.moderation` names, so that they reach the staff who rehearse; Matt, 2026-10-17; whatever else of the bot sends there goes through the rehearsal's gateway and is dropped, and the settings refuse a moderators' channel named as another of `settings.channels`), a post only into such a forum and a forum only beside a rehearsed region's channel (everything else is dropped and logged: the boss list's announcements and staleness warnings, the gym and Wayfarer announcements, the link to a new post in its region's channel, the copies in the remote and elite channels, spawn reports and their Unown copies, so also any announcement added later), no forum is made but a hidden one, no category or text channel is made (answered as a refused permission) and no channel is deleted but a forum made through it; the count of dropped direct messages is logged once more at shutdown, after the client is down (`RehearsalDms.flush`); the router answers only the allowlist and staff (Manage Server, Administrator or a role of `staffRoles`, a name compared trimmed and in any case, `staffRoleKey`, as the hidden forums compare it) and everybody else with `REHEARSAL_REFUSAL`; outside the posts of the rehearsed forums every answer is private (`answeredInRehearsal`: each reply, deferral and follow-up gets the Ephemeral flag), so that no channel shows a command's answer; `/request` is refused (`REQUEST_IN_REHEARSAL`: it would file a real GitHub issue); the screenshot trigger reads nothing (it reacts and answers in the channel; the testers use `/raid` with a screenshot); `/admin setup-forums` makes forums only for the rehearsed regions and hides them before anything is posted in them: a new forum is made hidden (`createForum` with `hidden`; a forum that cannot be made so is not made), one that is there gets its overwrites set as a whole (`PartyGateway.hideForum`, `hiddenForumOverwrites`: every overwrite it had, also those taken over from its category, replaced; View Channel and Send Messages denied to everyone, the bot allowed (and, on its own overwrite, every permission of a forum it has where Discord checks the set, but Manage Roles, which only an administrator may set in a channel and the bot keeps through its role: in the server for a new forum, whose creation may give only that, then in the category when `setupForum` hides the new forum once more; a forum Discord refuses to make hidden is said as `HIDDEN_FORUM_REFUSED`, which no other refusal is; a refusal of the second hide leaves the new forum hidden as it was made and set up all the same, with a warning in the log and a parenthesis in the answer that name what only the category would have given the bot (`categoryOnlyPermissions`); a forum that was there and whose hide is refused is set up the same way only when its own overwrites hide it already (`isHiddenForum`: View Channel denied to everyone, everyone's own server permissions counted, and allowed only to the bot (its member, or the role Discord made for it, `role.tags.botId`), the staff roles by the same rule and the allowlist), and its answer says "it was already hidden from members (Discord refused to set its permissions…)", without naming a cause; else it gets nothing posted: a refusal alone never counts as hidden, since production's forums are there too), the staff roles by name and every role that may manage the server allowed, and each allowlisted member with one permission more than an admission, so that `dismissMember` leaves it), and a forum that cannot be hidden gets nothing posted, its answer saying how to hide it by hand so that a second run accepts it: View Channel denied to @everyone, and allowed only to Professor Pine itself (its member or its own role), the staff roles (those `settings.rehearsal.staffRoles` names, and every role with Manage Server or Administrator) and the testers; the fake gateway computes who sees a forum from its overwrites and the members' roles (`src/ops/permissions.ts`); `/admin cleanup-legacy` only lists. `./pine deploy-commands --rehearsal` registers the commands as the commands of the servers of `Guild` that the bot is in (`GET /users/@me/guilds`; each named before anything is sent, those it is not in left out; a registration that fails is said and the others go on, `sendDeploy`), each command as it is (the staff commands with their Manage Server default); the admin restricts the application to staff and the testers under Server Settings > Integrations (@everyone off for the application as a whole) and adds a tester without Manage Server to `/admin`, `/gym` and `/region` one by one, since an allow for the application does not beat a command's default permission (staging 2026-10-16; runbook R1). It refuses `--global` / `--guild` while the mode is on; `--clear-guild` takes them away at the end (`deployPlan`, `src/discord/deploy.ts`). The start logs a warning, the heartbeat carries `rehearsal: true` and every health line (so `./pine status`) ends with "REHEARSAL MODE IS ON", and the owner gets an alert (`REHEARSAL_ALERT`) at a start (as every alert of a kind, not again within fifteen minutes: `minIntervalMs`). The web pages stay off (`servedSettings` drops `settings.web`, for the bot and for the commands `deploy-commands` registers; `configWarnings` says so): the rehearsal's `.env` sets no `COMPOSE_PROFILES=tunnel`. `/region` makes, renames, moves or deletes no channel (`REHEARSAL_CHANNELS`, `src/commands/regions/shared.ts`): an import that would create a channel, and a removal that would delete the forum, are refused with that sentence; outlines alone and a removal that keeps the forum go on. The Unown want a holder of the old role is given (`UnownWantService.noticed`) is still given to a member the rehearsal does not answer: it is written to the copy of the database only, which the night replaces with a fresh dump.
 
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 6c13d1a8..1ab9a569 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -53,8 +53,8 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else.
-- `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Active raids` with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the trains and the meetups, one text display per tier and section, all within `TEXT_BUDGET` (`SECTION_ROOM` for trains and meetups, a heading and a count line for every tier, "…and N more"). The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving). `requestDeletion` puts a member's reason into the post (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
-- Staff for raid moderation are admins, moderators and the owner (`isStaff`, `requireManagement`, `managementRoleIds` in `guards.ts`): `/delete` and `/admin save-party` are theirs; the rest of `/admin` also admits bot developers (`requireBotManagement`). `/delete` has no throttle: it is the staff's manual clean-up and must always work; the post of a raid it closed says so in the place of the times (`RaidPostView.closed`). `/admin save-party` outside a post lists the kept posts. `/shout` is for members who are signed up.
+- `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Active raids` with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the trains and the meetups, one text display per tier and section, all within `TEXT_BUDGET` (`SECTION_ROOM` for trains and meetups, a heading and a count line for every tier, "…and N more"). The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
+- Staff for raid moderation are admins, moderators and the owner (`isStaff`, `requireManagement`, `managementRoleIds` in `guards.ts`): `/delete` and `/admin save-party` are theirs; the rest of `/admin` also admits bot developers (`requireBotManagement`). `/delete` (Manage Messages since plan 8S-2; it asks privately whether to archive the post or delete it, `moderation.md`) has no throttle: it is the staff's manual clean-up and must always work; the post of a raid it closed says so in the place of the times (`RaidPostView.closed`). `/admin save-party` outside a post lists the kept posts. `/shout` is for members who are signed up.
 - The forum of a region holds its raids, trains and meetups and is named `<region channel>` + `settings.regionForumSuffix` (default `-meetups`). `/admin setup-forums` creates it, renames one whose name is the region's with another one-word ending (a name chosen by hand stays), and leaves the making of posts to the bot (`PartyGateway.reservePosts`: Send Messages denied to everyone and to every role the forum allows it, allowed to the bot; writing in posts is untouched). In rehearsal mode it makes forums only for the rehearsed regions, a new one hidden from its first moment (`createForum(…, hidden)`) and one that is there hidden before anything is posted in it (`PartyGateway.hideForum`, `hiddenForumOverwrites`); a forum that cannot be hidden gets nothing posted (`operations.md`, "Rehearsal mode").
 - `RegionRepository.setForum` gives a region its forum (one forum per region, enforced by a unique key); `setSummaryMessage` names the forum the summary post was made in.
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 14232547..80bb00ca 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -4,7 +4,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## The database and the network
 
-- Tests are colocated: `*.test.ts` (unit, no Docker) and `*.db.test.ts` (needs Docker). Test against real MySQL and real pino loggers (`test/support/`) rather than mocks. A run of the database suite starts one MySQL container (`test/support/mysql-global-setup.ts`); `startDatabase()` (`test/support/mysql.ts`) gives each caller a database and a user of its own in it and drops both at `stop()`. The user also has `PROCESS`, to see the server's transactions: a test that has a statement wait for a lock asserts the wait (`information_schema.innodb_trx`, joined to `processlist` on its own user, since the server is shared).
+- Tests are colocated: `*.test.ts` (unit, no Docker) and `*.db.test.ts` (needs Docker). Test against real MySQL and real pino loggers (`test/support/`) rather than mocks. A run of the database suite starts one MySQL container (`test/support/mysql-global-setup.ts`); `startDatabase()` (`test/support/mysql.ts`) gives each caller a database and a user of its own in it and drops both at `stop()`. The user also has `PROCESS`, to see the server's transactions: a test that has a statement wait for a lock asserts the wait (`information_schema.innodb_trx`, joined to `processlist` on its own user, since the server is shared): `lockWaits(db, holder)` (`test/support/lock-waits.ts`) asks until a transaction other than the holder's (`connectionId(trx)`) waits, every 150 ms (InnoDB fills the table anew only once it has not been read for 0.1 seconds), with a deadline of ten seconds.
 - Tests never use the network. Game data in tests comes from the fixtures built by `scripts/game-data/make-fixtures.ts` (`catalogueFixture()`, `gameDataFixture()`); raid bosses come from `test/support/raid-bosses.ts` (`readRaidBossFeed()`, `raidBossesFixture()`, and `MemoryRaidBossStore` for the service).
 - Gyms and regions in tests are the invented ones of `test/support/gyms.ts` (never production rows); `createTestContext()` provides `ctx.gyms`, `ctx.pokemon` and `ctx.maps` from `test/support/providers.ts`.
 
@@ -36,6 +36,10 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 - `MeetupSafetyRepository` and `MemoryMeetupSafety` (`test/support/meetup-safety.ts`, `failing` per method) run the same cases (`meetupSafetyCases`, `test/support/meetup-safety-cases.ts`, with `LIBRARY`, `SAFETY_PIN`, `newRequest`, `newAppeal`, `MOD`). The service and the controls are tested over `meetupSafetyWith(options)` (`test/support/meetup-safety-service.ts`; `meetup-safety.md`); `createTestContext`'s own `meetupSafety` is off.
 
+## Reports to the moderators
+
+- `ReportRepository` and `MemoryReports` (`test/support/reports.ts`, `failing` per method) run the same cases (`reportCases`, `test/support/report-cases.ts`, with `partySubject`, `messageSubject`, `newReport`, `reason`). The service, its decisions and the controls are tested over `reportsWith(options)` and `reportedMeetup()` (`test/support/reports-service.ts`; `moderation.md`); the fake gateway's `noManaging` refuses deleting posts and messages there, and a reported message deleted in an archived post counts a reopening of it. The edits of a report's post in their order are tested by holding the gateway's `sendMessage` or `editMessage` into the moderators' channel (`hold`, `moderation-reports.posts.test.ts`); a reason racing a decision against real MySQL waits for the row lock (`report-repository.db.test.ts`, a real-time wait, so this plan runs its changed test files ten times).
+
 ## The party history
 
 - `partyServiceWith()` records every party that ends into `history` (`MemoryHistory`, `test/support/history.ts`: `records`, `steps`, `posts`, `optIn(guildRow, member)`, `failing`; it shares the memory storage's rows and deletes a recorded party's, as the repository does, so a test of an ended party reads `history.records`, not `storage.rows`), through `recorder` (`PartyHistory`, whose tries of what failed run only on `recorder.flush()`; over a database, `kept.historyStorage` takes them); `MemoryPartyStorage` writes each write's note into it as `PartyRepository` does. A `PartyRepository` in a test that expects no failure of the history takes `HISTORY_MUST_NOT_FAIL`. The recorder's `sweep()` reads the memory storage's rows (`storage.unreadable` names rows that read back unreadable) and runs with the scheduler's upkeep; `historySweepProgressEvery` sets how often it says how far it got. `MemoryHistoryOptIns` is `ctx.historyOptIns` for `/settings history` (`named(member, server, n)` says in how many parties opting out takes them out of). The legacy import's db test reads the invented folder `test/fixtures/legacy-parties/`; the queries of `history.md` are run from the doc by `history-queries.db.test.ts`.
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index 47fbf6a1..207c3b6d 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -326,6 +326,7 @@ It imports the ended legacy parties into the new party history (without member i
 - **The party history**: the bot keeps a history of ended raids, trains and meetups for statistics. It keeps a member's Discord id only if they opt in with `/settings history enabled:True`; without it they are counted, anonymously.
 - **A map on the web**, if you set up the web pages ([web setup](../web-setup.md)): `/maps` gives members the address and a login button.
 - **Raids that were active at the move are not carried over.** They end with the legacy bot, and `/admin cleanup-legacy` deletes their channels. Members report them again if they are still on.
+- Members no longer delete: `/report` (or **Report to moderators** in the Apps menu of a message) tells the moderators privately, in the moderators' channel; `/delete` and `/places` are staff commands offered to members with Manage Messages.
 - Staff commands (`/admin`, `/gym`, `/region`) are offered only to members with Manage Server, and the bot answers them only for members who also have a role named `admin`, `moderator` or `bot developer`, or for its owner (`OWNER_ID`). An admin can let another member see a staff command under Server Settings → Integrations → Professor Pine, on that command's own entry: an allowance for the application as a whole does not beat the Manage Server default (tried on a test server in October 2026).
 
 ## 6. After the move
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index 92452384..5aae30da 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -30,13 +30,13 @@ In the [Discord Developer Portal](https://discord.com/developers/applications):
    - Manage Roles (self-assigned roles, and who may see a forum)
    - Manage Threads (archiving, locking, renaming and pinning posts)
    - Add Reactions and Use External Emojis (optional)
-   - Manage Messages (optional: taking a screenshot away once it became a raid)
+   - Manage Messages (optional: taking a screenshot away once it became a raid, and deleting a message the moderators delete from a report)
 
    As a number for the link's `permissions=`, that is `292326599760`. `./pine cutover-check` (section 4) checks the bot's role against these.
 
 The bot's role must sit above the roles members may give themselves with `/iam`.
 
-**Staff.** The staff commands (`/admin`, `/gym`, `/region`) are offered to members with **Manage Server**, and the bot answers them only for members who also have a role named `admin`, `moderator` or `bot developer` (any capitals), or who are the bot's owner (`OWNER_ID` below). Give your staff such a role. You can let another member see a staff command under Server Settings → Integrations → Professor Pine, on that command's own entry (an allowance for the application as a whole does not beat the Manage Server default); they still need one of those roles for the bot to answer.
+**Staff.** The staff commands (`/admin`, `/gym`, `/region`) are offered to members with **Manage Server**, and the bot answers them only for members who also have a role named `admin`, `moderator` or `bot developer` (any capitals), or who are the bot's owner (`OWNER_ID` below). Give your staff such a role. `/delete` and `/places` are offered to members with **Manage Messages** instead, so that moderators without Manage Server have them; members tell the moderators what is wrong with `/report`, or with **Report to moderators** in the Apps menu of a message, and the reports go to the moderators' channel (`channels.moderation`, staff-only). You can let another member see a staff command under Server Settings → Integrations → Professor Pine, on that command's own entry (an allowance for the application as a whole does not beat the Manage Server default); they still need one of those roles for the bot to answer.
 
 Note your own Discord user ID too (User Settings → Advanced → Developer Mode, then right-click your name → Copy User ID): it becomes `OWNER_ID`, who counts as an admin everywhere and gets the bot's alerts.
 
diff --git a/docs/superpowers/plans/2026-10-17-phase-8s2-staging.md b/docs/superpowers/plans/2026-10-17-phase-8s2-staging.md
new file mode 100644
index 00000000..8a7f5809
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-17-phase-8s2-staging.md
@@ -0,0 +1,62 @@
+# Phase 8S-2 staging checklist: reports to the moderators, asks about places, /places (draft)
+
+Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: a member without staff roles (the reporter), a second member (the maker of meetups and author of a message), a moderator (Admin or Moderator role; a second moderator without Manage Server for step 4). The moderators' channel `meetup-review` of 8S-1 is set (`channels.moderation`) and staff-only. The design is `docs/superpowers/specs/2026-10-17-moderation-reports-design.md`; the conventions `docs/architecture/moderation.md` and `meetup-safety.md`.
+
+## Before
+
+1. Migration 022 (`ModerationReport`, `ModerationReportReason`, `MeetupPlaceAsk`, new columns of `MeetupPlaceRuling`) runs at the start, additive only; check `kysely_migration` for its name (renumbered at the merge if another branch took 022).
+2. New commands: `/report`, `/places`, the message command "Report to moderators", and `/delete` now with Manage Messages. Register them, only on Matt's go-ahead: `npm run deploy-commands -- --global`. A client may need Ctrl+R.
+3. As the member: `/delete` is not offered; "Report to moderators" is in the Apps menu of a message (right-click; a long press on a phone); `/help command:delete` says to use `/report`; `/help` lists "Report to moderators" under its name.
+4. As the moderator without Manage Server but with Manage Messages: `/delete` and `/places` are offered (`/admin` is not).
+
+## Party reports
+
+5. As the reporter, `/report` in a meetup's post: a form "Report this meetup to the moderators". Send it: "Sent to the moderators."; nothing in the meetup's post, nobody pinged. In `#meetup-review`: "Reported meetup" with its lines, who created it, Where (with Map), its information, the reason with the reporter, and Close…, Refuse place…, Block maker…, Dismiss, Go to post.
+6. As the second member, report the same meetup: the same post shows two reasons (not a second post). The reporter again: "You already reported this."
+7. The Apps menu on the meetup's post, on its line in the region channel, and on its copy (`/status` in the post): each opens the same form, and the reason joins the same report. On a raid's post: the report shows Close… and Dismiss alone; at a gym with a nickname, "officially …" beside it.
+8. On another message of the bot (a summary post, an answer): "Nothing to report there."
+9. Six reports within the hour: the sixth "You can use /report again in …"; a form of white space alone is refused and not counted.
+
+## Decisions
+
+10. As the reporter (non-staff) press Dismiss: "Only admins and moderators can do that."
+11. As the moderator, Close… on a meetup's report: privately "Close this meetup?" with Archive post / Delete post. Archive: the meetup's post says "This meetup was closed by the moderators." and is archived; the report's post "Closed by …: its post is archived." without buttons.
+12. Close… → Delete post on another report: the forum post is gone, with its link line; the report says "its post is deleted."
+13. Refuse place… → Archive on a meetup at a PokéStop: the place is refused (a `/meetup` there says "A meetup can't be held there."); `/places place:<stop>` shows the ruling "from a report" with a link to the report's post.
+14. Block maker… → Delete post: the maker gets one DM, their other meetups are archived with the moderators' line, `/meetup` answers them with Appeal.
+15. Deny the bot Manage Threads in the region's forum, then Close… → Delete post: "I can't delete posts in #… (Manage Threads is missing there)…", the report stays open; Archive works. Put it back.
+16. A reported meetup ended by its maker (`/end` in the past) or by staff's `/delete`: the report's post says "Ended: the meetup was over before a moderator decided." without buttons.
+17. Restart with a report open: its buttons still work; two moderators pressing at once: the second is told who decided.
+
+## Message reports
+
+18. As the reporter, the Apps menu on the second member's message in the region channel (with a picture attached): a form "Report this message to the moderators"; the post shows who wrote it, where and when, a copy of its text, the attachment's name, Go to message, Delete message and Dismiss. On a member's message inside a party's post: "in the post of …".
+19. Delete message: the message is gone; the post says "Message deleted by …". On another report, delete the message by hand first, then press Delete message: "Gone: the message was deleted before a moderator did".
+20. Deny the bot Manage Messages in the channel, Delete message: "I can't delete messages in #…; delete it yourself.", the report stays open. Put it back.
+21. Without `channels.moderation` (restart with it blank): `/report` puts the reason into the post and pings the staff roles once (as the old `/delete`); a message report is refused "This server has no moderators' channel." Put it back.
+
+## /delete
+
+22. As the moderator, `/delete` in a raid's post: the private question; Archive post closes it as before ("This raid was closed by …", archived, the gym free); on another, Delete post deletes the post.
+
+## Asks about refused places
+
+23. Refuse a stop for good (Refuse from now on on a request). As the maker, `/meetup` there at once: "A meetup can't be held there." without a button. Set the ruling's `ruledAt` 15 days back in the dev database (staging tool), `/meetup` there again: the refusal has Ask the moderators; it opens "Ask about this place"; send it: "Your question is with the moderators…". In `#meetup-review`: the place, the ruling with a link to the request's post, the words, Allow place and Keep refused.
+24. As another member, `/meetup` there: "… It is with the moderators already."
+25. Keep refused: the maker's DM says it stays refused and when they may ask again; `/meetup` there has no button. Set `keptAt` back 15 days, ask again, Allow place: the DM says meetups are allowed; `/meetup` there posts at once.
+26. An ask left open eight days (set `createdAt` back): the next tick expires it, its post says so, the maker is told they may ask again.
+
+## /places and the leftovers
+
+27. `/places`: refused and allowed places, pending requests, open asks, blocked members with Lift block, open appeals, open reports, each with a link to its post; arrows with more than ten entries. Lift block: the member is told by DM and can make meetups again.
+28. `/places place:<the refused stop>`: its ruling; Undo ruling: "Undone by …"; the log has "a ruling of a place was undone"; the stop is checked by its name again.
+29. Refuse a request (plain Refuse): its post keeps Block member; press it: the maker is blocked, one DM, the post says who blocked them. An expired request keeps it too.
+30. A request at a gym with a nickname: the post shows "(gym; officially …)".
+
+## Rehearsal
+
+31. In rehearsal mode (the reporter on the allowlist), a report goes into `meetup-review`, as requests and appeals do.
+
+## After
+
+32. `./pine cutover-check` (Matt's go-ahead: it reads Discord's REST API) shows a `reports` line: a pass, or a warning naming where the bot lacks Manage Messages or Manage Threads.
diff --git a/src/ops/cutover-check.test.ts b/src/ops/cutover-check.test.ts
index 61b0310a..7a0ad15c 100644
--- a/src/ops/cutover-check.test.ts
+++ b/src/ops/cutover-check.test.ts
@@ -309,6 +309,25 @@ describe('cutoverCheck', () => {
       expect(line(await check(), 'moderation')).toMatchObject({ status: 'pass' });
     });
 
+    it('warns where the bot could not delete a reported message or post, with the channel set', async () => {
+      expect(line(await check(), 'reports')).toEqual({
+        what: 'reports',
+        status: 'pass',
+        text: 'reports: in Pittsburgh the bot may delete reported messages and posts in every region',
+      });
+      shape.north.overwrites = [overwrite(shape.botRole, [], [P.ManageMessages])];
+      expect(line(await check(), 'reports')).toEqual({
+        what: 'reports',
+        status: 'warn',
+        text:
+          'reports: in Pittsburgh the bot lacks Manage Messages in #north: the moderators delete ' +
+          'reported messages and posts there themselves',
+      });
+      const { moderation: _unset, ...channels } = settings.channels;
+      settings = { ...settings, channels };
+      expect((await check()).filter((one) => one.what === 'reports')).toEqual([]);
+    });
+
     it("takes a text channel alone as the moderators' channel", async () => {
       const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
       if (review) review.type = ChannelType.GuildAnnouncement;
diff --git a/src/ops/cutover-check.ts b/src/ops/cutover-check.ts
index 6d7fb2cf..86da7f44 100644
--- a/src/ops/cutover-check.ts
+++ b/src/ops/cutover-check.ts
@@ -65,6 +65,7 @@ export interface CheckLine {
     | 'cleanup'
     | 'announcements'
     | 'moderation'
+    | 'reports'
     | 'roles'
     | 'discord';
   status: CheckStatus;
@@ -267,6 +268,8 @@ async function serverLines(
   const permissionsIn = (channel: ApiChannel) =>
     channelPermissions(base, guild.id, me, channel.permission_overwrites ?? []);
   const withoutForum: string[] = [];
+  // Where the bot could not delete what a report is about (plan 8S-2).
+  const reportGaps: string[] = [];
   for (const region of regions) {
     const channel = byId.get(region.channelId);
     if (!channel) {
@@ -293,6 +296,16 @@ async function serverLines(
     if (forum)
       places.push({ place: `the forum #${forum.name}`, channel: forum, needs: FORUM_NEEDS });
     else withoutForum.push(`#${channel.name}`);
+    const reportPlaces = [
+      { place: `#${channel.name}`, channel, needs: REPORT_CHANNEL_NEEDS },
+      ...(forum
+        ? [{ place: `the forum #${forum.name}`, channel: forum, needs: REPORT_FORUM_NEEDS }]
+        : []),
+    ];
+    for (const one of reportPlaces) {
+      const gap = missingNeeds(permissionsIn(one.channel), one.needs).required;
+      if (gap.length > 0) reportGaps.push(`${needNames(gap)} in ${one.place}`);
+    }
     const lacks: string[] = [];
     const wants: string[] = [];
     for (const one of places) {
@@ -357,6 +370,7 @@ async function serverLines(
       .map((role) => role.name);
   };
   lines.push(moderationLine(guild.name, channels, settings, permissionsIn, seenBy));
+  if (settings.channels.moderation !== undefined) lines.push(reportsLine(guild.name, reportGaps));
   const rolesCheck = rolesLine(guild.name, guild.roles, member.roles, selfRoles);
   if (rolesCheck) lines.push(rolesCheck);
   return { lines, withoutForum };
@@ -470,6 +484,47 @@ function moderationLine(
   };
 }
 
+/** What Delete message of a report needs in a region's channel (plan 8S-2). */
+const REPORT_CHANNEL_NEEDS: readonly Need[] = [
+  {
+    flag: PermissionFlagsBits.ManageMessages,
+    name: 'Manage Messages',
+    why: "a report's Delete message deletes what a member wrote",
+  },
+];
+
+/** What Delete message and Delete post of a report need in a region's forum (plan 8S-2). */
+const REPORT_FORUM_NEEDS: readonly Need[] = [
+  ...REPORT_CHANNEL_NEEDS,
+  {
+    flag: PermissionFlagsBits.ManageThreads,
+    name: 'Manage Threads',
+    why: "a report's Delete post deletes a party's post",
+  },
+];
+
+/**
+ * Reports to the moderators (plan 8S-2), only where the moderators' channel is set: whether
+ * the bot may delete a reported message in the regions' channels and forums (Manage Messages)
+ * and a party's post (Manage Threads). A warning, never a failure: the moderators then delete
+ * them themselves.
+ */
+function reportsLine(server: string, gaps: readonly string[]): CheckLine {
+  return gaps.length === 0
+    ? {
+        what: 'reports',
+        status: 'pass',
+        text: `reports: in ${server} the bot may delete reported messages and posts in every region`,
+      }
+    : {
+        what: 'reports',
+        status: 'warn',
+        text:
+          `reports: in ${server} the bot lacks ${gaps.join(', ')}: the moderators delete ` +
+          'reported messages and posts there themselves',
+      };
+}
+
 /** A role's name as the bot compares it (`unown-want-service.ts`): trimmed, lower case. */
 const roleKey = (name: string) => name.trim().toLowerCase();
 
diff --git a/src/render/place-asks.ts b/src/render/place-asks.ts
index ad46872f..22ad5120 100644
--- a/src/render/place-asks.ts
+++ b/src/render/place-asks.ts
@@ -15,9 +15,10 @@ import { memberText, plainLines, plainNoLinks, timestamp } from './text.js';
 import { actionRow, container, textDisplay, textMessage } from './v2.js';
 
 /**
- * The custom-id kind of asks about refused places (plan 8S-2): `mplace:<token>:open` (Ask the
- * moderators under `/meetup`'s refusal of a place; the token keeps the server and the place for
- * half an hour), `mplace:<token>:form` (its form), and `mplace:<ask id>:allow|keep` on the
+ * The custom-id kind of asks about refused places (plan 8S-2): `mplace:<kind>:open:<place id>`
+ * (Ask the moderators under `/meetup`'s refusal of a place; the server is the presser's, nothing
+ * is kept, so it works after a restart), `mplace:<kind>:form:<place id>` (its form), and
+ * `mplace:<ask id>:allow|keep` on the
  * moderators' post of an ask.
  */
 export const ASK_KIND = 'mplace';
````

