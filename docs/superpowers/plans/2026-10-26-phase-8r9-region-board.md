# Phase 8R-9: The Region's Board: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** all the bot's lists of a region in one locked forum post, the region's board (design approved by Matt and reviewed, 2026-10-25).

- **Task 1, the stops in the board:** "Today’s Stops" posted under the summary in the region's board post instead of pinned in the text channel; links to the board's thread everywhere; archived posts opened on request; order kept; old pinned posts removed; failed deletes retried.
- **Task 2, the summary:** "Today and coming up", locked, split into Today and one Coming up list by one domain rule (`isToday`), redrawn at local midnight; the forum ending `-board`.
- **Task 3, the lines:** a short line in the region's text channel the first time a day a research task, a leader or Giovanni is reported, linking the board; deleted at midnight.
- **Task 4, words, permissions and docs:** the answers and help name the board; Pin Messages leaves the needs; `cutover-check` warns of regions without a board; `/admin setup-forums` says whether it could pin and lock; guides, runbook and area docs.

**Tech stack:** TypeScript 6.0, Node 24, discord.js 14, Kysely, Vitest. No new dependency. Migration 031 (additive: `StopPost.threadId`, `StopPost.leftoverIds`, table `StopLine`). No command option changed, but `/admin setup-forums`' description did (it names the board): deploy the commands before the staging. `settings.regionForumSuffix` defaults to `-board`.

**Spec:** `docs/superpowers/specs/2026-10-25-region-board-design.md` (its Review B1–B14 and Matt's three answers), and the brief `.superpowers/sdd/region-board/brief.md` (git-ignored).

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-board` (tip `4a94b4ad`), one commit per task, on typescript-migration `2bc77025`. Each commit typechecks and passes its tests; on the tip the full check passes (9,855 tests), the build passes and the database suite passes (600 tests).

**Reviews:**

- **The prototype:** an Opus reviewer (P1–P13: failed deletes forgot their rows, a deleted board never replaced, the reopen applied to every thread, and ten Minor), fix round 1 with a rebase onto `2bc77025`.
- **The fix round:** an Opus re-review (R1–R5: a permanent refusal kept for good, an old board reopened, the fake more lenient than Discord, a bad stored value, words), fix round 2. Folded into the four commits.

**Conventions:** read `CLAUDE.md` and `docs/architecture/stop-reports.md`, `parties-and-posts.md`, `discord-framework.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck and its own test files. The full check, the build and the database suite run once on the tip. Work in `.claude/worktrees/region-board` on `region-board`; never commit in the main checkout.

## Review Focus

- A board deleted by a moderator, or replaced: the stops follow to the new board, the old one's messages deleted without reopening it (tasks 1 and 2).
- The network away at midnight: no line and no old stop message stays for good; the catch-up deletes them (tasks 1 and 3).
- A locked, archived board: the stops' sends and deletes open it; nothing else does (task 1, `party-gateway.test`, the fake).
- A meetup on Saturday: under "Coming up" with its date, moved to Today by the midnight redraw (task 2, `board-day.test`, `summary.test`).
- A task reported twice and narrowed: one line in the text channel, deleted at midnight (task 3, `stop-lines.test`).

---

## Tasks

### Task 1: 8R-9 task 1: Today's Stops posted in the region's board

Prototype commit: `d9e97aa1ccaa2a94c68966c628987d763b0ade67`

"Today's Stops" is posted in the region's board post (the summary's
thread, Region.summaryMessageId), below the summary, instead of pinned
in the region's text channel (design 2026-10-25-region-board-design.md).

- StopPost gains a nullable threadId (migration 031). A draw reads the
  region's board each time; another board than the one drawn in (the
  summary replaced or taken over) has every message sent anew there (B2),
  and PartyService asks for a redraw when it makes or takes over a summary.
- Links to the post's messages are { channelId, messageId } in the board
  (messageOf, linkOf, summaryOf): research and Rocket DMs, "Already
  reported", the map and the summary's stops line link the thread (B1).
- The gateway opens an archived post before it sends or deletes in it (B3),
  sends with SuppressNotifications where asked (B13: the stops' messages),
  and says what the bot may write in a post (postAccess, B6: Send Messages
  in Threads, Manage Threads and Embed Links in its forum).
- A message sent anew in its place takes every message after it along, so
  the order stays (B5). No board, or no right to write in it: nothing is
  drawn, said once (B10, B6).
- A post the bot before this pinned in the text channel is unpinned and
  deleted at the first draw, older days' at start (B11). pinMessage is
  gone; Pin Messages leaves REGION_CHANNEL_NEEDS.
- A delete that fails keeps what is left (StopPost.leftoverIds, a row of
  an ended day), deleted again at the next draw, start or turn-over (P1).
  Opening an archived post is opt-in (SendOptions.reopen, DeleteOptions),
  asked only by the stops (P4); postAccess fetches the post (P3). A board
  replaced has the old one's messages deleted first (P5); regions not
  drawn are drawn at the next turn-over (P6); messageOf falls back to the
  first message as linkOf (P9); the summary links through postLink (P8).
  A delete Discord refuses for good (50001, 50013) is said once and
  forgotten (R1); an old board is cleared without opening it (R2); the
  fake refuses a message in an archived, locked post unless it is to be
  opened (R3); a leftover column that is no JSON reads as none (R4).

**Files:**

```
 src/app-context.ts                                   |  11 +-
 src/commands/research/research-report.ts             |   9 +-
 src/commands/research/research.test.ts               |   8 +-
 src/db/migrations/2026_10_25_031_region_board.ts     |  39 ++++
 src/db/migrations/index.ts                           |   2 +
 src/db/migrator.db.test.ts                           |   1 +
 src/db/repositories/research-repositories.db.test.ts |   2 +
 src/db/repositories/stop-post-repository.test.ts     |  12 ++
 src/db/repositories/stop-post-repository.ts          |  46 ++++-
 src/db/types.ts                                      |   2 +
 src/discord/party-gateway.test.ts                    | 127 ++++++++++++-
 src/discord/party-gateway.ts                         | 151 ++++++++++-----
 src/ops/cutover-check.test.ts                        |   7 +-
 src/ops/permissions.test.ts                          |   7 +-
 src/ops/permissions.ts                               |   9 +-
 src/services/notify-service.research.test.ts         |   8 +-
 src/services/notify-service.rocket.test.ts           |   8 +-
 src/services/notify-service.ts                       |  37 ++--
 src/services/party-scheduler.test.ts                 |   2 +-
 src/services/party-service.end.test.ts               |   2 +-
 src/services/party-service.test.ts                   |  34 +++-
 src/services/party-service.ts                        |  30 ++-
 src/services/region-admin-service.test.ts            |   2 +-
 src/services/rehearsal.test.ts                       |  15 +-
 src/services/rehearsal.ts                            |  15 +-
 src/services/stop-posts.test.ts                      | 586 ++++++++++++++++++++++++++++++++++++++++++++---------------
 src/services/stop-posts.ts                           | 461 +++++++++++++++++++++++++++++++++++-----------
 src/web/stop-reports.test.ts                         |  35 +++-
 src/web/stop-routes.ts                               |   9 +-
 test/support/fake-gateway.ts                         |  77 +++++---
 test/support/research-store-cases.ts                 |  19 +-
 test/support/research-store.ts                       |   8 +-
 32 files changed, 1344 insertions(+), 437 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/research/research.test.ts src/db/repositories/stop-post-repository.test.ts src/discord/party-gateway.test.ts src/ops/cutover-check.test.ts src/ops/permissions.test.ts src/services/notify-service.research.test.ts src/services/notify-service.rocket.test.ts src/services/party-scheduler.test.ts src/services/party-service.end.test.ts src/services/party-service.test.ts src/services/region-admin-service.test.ts src/services/rehearsal.test.ts src/services/stop-posts.test.ts src/web/stop-reports.test.ts`, `npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/research-repositories.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff d9e97aa1ccaa2a94c68966c628987d763b0ade67 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-9 task 1: Today's Stops posted in the region's board`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index 4cbd7f56..e3cbb874 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -26,6 +26,7 @@ import type { PineStopService } from './services/pine-stops.js';
 import type { ResearchTaskProvider } from './services/research-task-service.js';
 import type { RocketLineupProvider } from './services/rocket-lineup-service.js';
 import type { StopReportService } from './services/stop-reports.js';
+import type { PostLink } from './services/stop-posts.js';
 import type { RocketService } from './services/rocket-reports.js';
 import type { PlaceFinder } from './services/place-finder.js';
 import type { PlaceSearch } from './services/place-search.js';
@@ -97,11 +98,13 @@ export interface AppContext {
   /** Reports at stops (plan 8R-1): field research, in research periods. */
   readonly stopReports: StopReportService;
   /**
-   * The message of a region channel's pinned post "Today’s Stops" that holds a subject, as
-   * last drawn (`StopPostService.linkOf`; plan 8R-5: "Already reported" links it); none in
-   * rehearsal mode, which makes no posts.
+   * The message of a region channel's post "Today’s Stops" that holds a subject, in its board
+   * post, as last drawn (`StopPostService.linkOf`; plan 8R-5: "Already reported" links it; plan
+   * 8R-9, B1: the thread and the message); none in rehearsal mode, which makes no posts.
    */
-  readonly stopPostLinks: { linkOf(channelId: string, subjectKey: string): string | undefined };
+  readonly stopPostLinks: {
+    linkOf(channelId: string, subjectKey: string): PostLink | undefined;
+  };
   /**
    * Reporting Team GO Rocket (plan 8R-2): the report, the grunt's messages (none in rehearsal
    * mode), the notifier.
diff --git a/src/commands/research/research-report.ts b/src/commands/research/research-report.ts
index 450f9d21..2a48febf 100644
--- a/src/commands/research/research-report.ts
+++ b/src/commands/research/research-report.ts
@@ -201,8 +201,9 @@ export function replaceQuestion(
 }
 
 /**
- * The link to the message of the pinned post that holds a report (R8), in the first region
- * channel its stop lies in; undefined where none holds it (rehearsal mode: no posts).
+ * The link to the message of the post "Today’s Stops" that holds a report (R8), in the board of
+ * the first region channel its stop lies in (plan 8R-9, B1); undefined where none holds it
+ * (rehearsal mode: no posts).
  */
 export async function postLinkOf(
   ctx: Pick<AppContext, 'guilds' | 'regions' | 'wayspots' | 'stopPostLinks'>,
@@ -211,8 +212,8 @@ export async function postLinkOf(
 ): Promise<string | undefined> {
   const [channelId] = await postChannels(ctx, serverId, [report.stop]);
   if (channelId === undefined) return undefined;
-  const messageId = ctx.stopPostLinks.linkOf(channelId, report.subjectKey);
-  return messageId === undefined ? undefined : postLink(serverId, channelId, messageId);
+  const link = ctx.stopPostLinks.linkOf(channelId, report.subjectKey);
+  return link === undefined ? undefined : postLink(serverId, link.channelId, link.messageId);
 }
 
 /** What a report taken back was: `Took back **Catch 7 Pokémon** at **Yellow Mural**.` */
diff --git a/src/commands/research/research.test.ts b/src/commands/research/research.test.ts
index 010cd6b4..80912882 100644
--- a/src/commands/research/research.test.ts
+++ b/src/commands/research/research.test.ts
@@ -467,11 +467,15 @@ describe('/research report and the versions of a task (plan 8R-5)', () => {
 
   it('answers a version that stands already with its post, and nothing to take back', async () => {
     const made = await setup();
-    Object.assign(made.ctx, { stopPostLinks: { linkOf: () => '300000000000000077' } });
+    Object.assign(made.ctx, {
+      stopPostLinks: {
+        linkOf: () => ({ channelId: '300000000000000099', messageId: '300000000000000077' }),
+      },
+    });
     await made.report({ task: GIBLE, stop: stop(1) }, made.as(MISTY));
     const answer = answerOf(await made.report({ task: THROWS.key, stop: stop(1) }));
     expect(said(answer)).toMatch(
-      /^Already reported: \*\*Make 3 Excellent Throws in a row\*\* · Gible at \*\*Yellow Mural\*\*, by \*\*Misty\*\* <t:\d+:R>\. https:\/\/discord\.com\/channels\/\d+\/\d+\/300000000000000077$/,
+      /^Already reported: \*\*Make 3 Excellent Throws in a row\*\* · Gible at \*\*Yellow Mural\*\*, by \*\*Misty\*\* <t:\d+:R>\. https:\/\/discord\.com\/channels\/\d+\/300000000000000099\/300000000000000077$/,
     );
     expect(buttonsOf(answer)).toEqual([]);
     expect(selectsOf(asV2(answer))).toEqual([]);
diff --git a/src/db/migrations/2026_10_25_031_region_board.ts b/src/db/migrations/2026_10_25_031_region_board.ts
new file mode 100644
index 00000000..ef8410ed
--- /dev/null
+++ b/src/db/migrations/2026_10_25_031_region_board.ts
@@ -0,0 +1,39 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * The region's board (plan 8R-9; design `2026-10-25-region-board-design.md`): "Today’s Stops"
+ * is posted in the region's locked summary post instead of pinned in its text channel.
+ *
+ * - `StopPost.threadId`: the board post (the summary's thread) the post of a day was drawn in;
+ *   null for a post the bot before plan 8R-9 pinned in the region's channel, which the first
+ *   draw unpins and deletes. The row stays keyed by the region's channel and the day (review B2:
+ *   a summary replaced or taken over is another thread, and the post is drawn anew in it).
+ * - `StopPost.leftoverIds`: the messages of such a pinned post in the region's channel whose
+ *   delete failed (JSON, null for none; review P1): kept with the day's board post, which has the
+ *   same channel and day, and deleted at the next draw or catch-up.
+ *
+ * Safe to run again after a failure half-way: a column is added only when it is missing.
+ */
+export const regionBoard: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    const existing = await sql<{ n: number }>`
+      select count(*) as n from information_schema.columns
+      where table_schema = database() and table_name = 'StopPost'
+        and column_name = 'threadId'`.execute(db);
+    if (Number(existing.rows[0]?.n ?? 0) === 0) {
+      await sql`alter table StopPost add column threadId varchar(30) null`.execute(db);
+    }
+    const leftover = await sql<{ n: number }>`
+      select count(*) as n from information_schema.columns
+      where table_schema = database() and table_name = 'StopPost'
+        and column_name = 'leftoverIds'`.execute(db);
+    if (Number(leftover.rows[0]?.n ?? 0) === 0) {
+      await sql`alter table StopPost add column leftoverIds json null`.execute(db);
+    }
+  },
+  async down() {
+    // Additive only: nothing is ever dropped.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index 903d6c60..7ec51018 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -29,6 +29,7 @@ import { stopReports } from './2026_10_21_027_stop_reports.js';
 import { rocket } from './2026_10_22_028_rocket.js';
 import { maxEvents } from './2026_10_22_029_max_events.js';
 import { costumedWants } from './2026_10_22_030_costumed_wants.js';
+import { regionBoard } from './2026_10_25_031_region_board.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -65,4 +66,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_22_028_rocket': rocket,
   '2026_10_22_029_max_events': maxEvents,
   '2026_10_22_030_costumed_wants': costumedWants,
+  '2026_10_25_031_region_board': regionBoard,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index 87d20a6b..e7db1106 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -191,6 +191,7 @@ describe('runMigrations', () => {
       '2026_10_22_028_rocket',
       '2026_10_22_029_max_events',
       '2026_10_22_030_costumed_wants',
+      '2026_10_25_031_region_board',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/research-repositories.db.test.ts b/src/db/repositories/research-repositories.db.test.ts
index f93fd342..fe73199f 100644
--- a/src/db/repositories/research-repositories.db.test.ts
+++ b/src/db/repositories/research-repositories.db.test.ts
@@ -48,7 +48,9 @@ describe('the repositories of reports at stops', () => {
         channelId: '1',
         day: '2026-10-21',
         serverId: '2',
+        threadId: '3',
         messageIds: [],
+        leftover: ['4'],
         updatedAt: 1,
       };
       await store.save(post);
diff --git a/src/db/repositories/stop-post-repository.test.ts b/src/db/repositories/stop-post-repository.test.ts
new file mode 100644
index 00000000..1ea268da
--- /dev/null
+++ b/src/db/repositories/stop-post-repository.test.ts
@@ -0,0 +1,12 @@
+import { describe, expect, it } from 'vitest';
+import { idsOf } from './stop-post-repository.js';
+
+describe('idsOf (review R4)', () => {
+  it('reads a list of ids as MySQL gives it, and none for anything else', () => {
+    expect(idsOf('["1","2"]')).toEqual(['1', '2']);
+    expect(idsOf(['3'])).toEqual(['3']);
+    expect(idsOf(null)).toEqual([]);
+    expect(idsOf('not json')).toEqual([]);
+    expect(idsOf('{"a":1}')).toEqual([]);
+  });
+});
diff --git a/src/db/repositories/stop-post-repository.ts b/src/db/repositories/stop-post-repository.ts
index 5937e856..64ff9980 100644
--- a/src/db/repositories/stop-post-repository.ts
+++ b/src/db/repositories/stop-post-repository.ts
@@ -3,20 +3,31 @@ import { z } from 'zod';
 import type { DB } from '../types.js';
 
 /**
- * The pinned "Today’s Stops" post of a region channel and a local day (plan 8R-1; design
- * 6, 9.5): its messages in order (the first, and those it spilled into), and the server.
+ * The post "Today’s Stops" of a region channel and a local day (plan 8R-1; design 6, 9.5): its
+ * messages in order (the first, and those it spilled into), the server, and the board post they
+ * are in (plan 8R-9).
  */
 export interface StopPostRecord {
   channelId: string;
   /** The local day, `yyyy-mm-dd` in `settings.timezone`. */
   day: string;
   serverId: string;
+  /**
+   * The region's board post (its summary's thread) the messages are in (plan 8R-9); null for a
+   * post the bot before it pinned in the region's channel, which is removed and drawn anew.
+   */
+  threadId: string | null;
   messageIds: string[];
+  /**
+   * Messages in the region's channel still to unpin and delete (review P1): a post the bot before
+   * plan 8R-9 pinned there, whose delete failed; none for most posts.
+   */
+  leftover: string[];
   updatedAt: number;
 }
 
 /**
- * Where the pinned posts are kept (table `StopPost` of migration 027), so that a restart draws
+ * Where the posts are kept (table `StopPost` of migration 027), so that a restart draws
  * the day's anew and deletes those of days that have ended; twin `MemoryStopPosts`
  * (`test/support/stop-posts.ts`), both running `stopPostCases`.
  */
@@ -31,6 +42,24 @@ export interface StopPostStorage {
 
 const ids = z.array(z.string());
 
+/**
+ * A JSON list of message ids as MySQL gives it (text or parsed); none for null, text that is no
+ * JSON (review R4) or anything else.
+ */
+export function idsOf(value: unknown): string[] {
+  if (value === null || value === undefined) return [];
+  let read: unknown = value;
+  if (typeof value === 'string') {
+    try {
+      read = JSON.parse(value);
+    } catch {
+      return [];
+    }
+  }
+  const parsed = ids.safeParse(read);
+  return parsed.success ? parsed.data : [];
+}
+
 /** The `StopPost` table. */
 export class StopPostRepository implements StopPostStorage {
   constructor(private readonly db: Kysely<DB>) {}
@@ -50,7 +79,9 @@ export class StopPostRepository implements StopPostStorage {
         channelId: row.channelId,
         day: row.day,
         serverId: row.serverId,
+        threadId: row.threadId,
         messageIds: parsed.success ? parsed.data : [],
+        leftover: idsOf(row.leftoverIds),
         updatedAt: Number(row.updatedAt),
       };
     });
@@ -59,10 +90,13 @@ export class StopPostRepository implements StopPostStorage {
   async save(post: StopPostRecord): Promise<void> {
     // MySQL's row alias (`AS new`), never `VALUES()`, deprecated since 8.0.20.
     await sql`
-      insert into StopPost (channelId, day, serverId, messageIds, updatedAt)
-      values (${post.channelId}, ${post.day}, ${post.serverId}, ${JSON.stringify(post.messageIds)},
+      insert into StopPost (channelId, day, serverId, threadId, messageIds, leftoverIds, updatedAt)
+      values (${post.channelId}, ${post.day}, ${post.serverId}, ${post.threadId},
+        ${JSON.stringify(post.messageIds)},
+        ${post.leftover.length === 0 ? null : JSON.stringify(post.leftover)},
         ${String(post.updatedAt)}) as new
-      on duplicate key update serverId = new.serverId, messageIds = new.messageIds,
+      on duplicate key update serverId = new.serverId, threadId = new.threadId,
+        messageIds = new.messageIds, leftoverIds = new.leftoverIds,
         updatedAt = new.updatedAt`.execute(this.db);
   }
 
diff --git a/src/db/types.ts b/src/db/types.ts
index b5f3f343..aa1235bd 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -565,8 +565,10 @@ export interface SpawnReport {
 export interface StopPost {
   channelId: string;
   day: string;
+  leftoverIds: Json | null;
   messageIds: Json;
   serverId: string;
+  threadId: string | null;
   updatedAt: string;
 }
 
diff --git a/src/discord/party-gateway.test.ts b/src/discord/party-gateway.test.ts
index b8cb3483..3bf83d91 100644
--- a/src/discord/party-gateway.test.ts
+++ b/src/discord/party-gateway.test.ts
@@ -496,6 +496,22 @@ describe('FakePartyGateway', () => {
       const { gateway } = forumWithTags(0);
       await expect(gateway.sendMessage('f', { content: 'x' })).resolves.toBeUndefined();
     });
+
+    it('refuses a message in an archived, locked post unless it is to be opened (review R3)', async () => {
+      const gateway = new FakePartyGateway();
+      gateway.addForum('f');
+      const postId =
+        (await gateway.createPost('f', { title: 't', message: { content: 'x' }, tagIds: [] })) ??
+        '';
+      await gateway.archivePost(postId);
+      await expect(gateway.sendMessage(postId, { content: 'late' })).rejects.toMatchObject({
+        code: RESTJSONErrorCodes.InvalidActionOnArchivedThread,
+      });
+      await expect(
+        gateway.sendMessage(postId, { content: 'late' }, { reopen: true }),
+      ).resolves.toBeDefined();
+      expect(gateway.posts.get(postId)).toMatchObject({ archived: false, reopened: 1 });
+    });
   });
 });
 
@@ -982,7 +998,8 @@ describe('DiscordPartyGateway: a reported message deleted', () => {
       },
       messages: {
         delete: () => {
-          if (thread.archived) return Promise.reject(apiError(RESTJSONErrorCodes.ThreadLocked));
+          if (thread.archived)
+            return Promise.reject(apiError(RESTJSONErrorCodes.InvalidActionOnArchivedThread));
           if (refusal !== undefined) return Promise.reject(apiError(refusal));
           calls.push('delete');
           return Promise.resolve();
@@ -1052,6 +1069,114 @@ describe('DiscordPartyGateway: a reported message deleted', () => {
   });
 });
 
+describe('DiscordPartyGateway: the region’s locked board post (plan 8R-9)', () => {
+  /**
+   * The board post (a thread), archived and locked as a week without messages leaves it: Discord
+   * refuses a message or a deletion in it until it is opened (50083). Its forum gives the bot
+   * `has`; the post is in the cache unless `cached` is false (then fetched).
+   */
+  function board(has: bigint, cached = true) {
+    const calls: string[] = [];
+    const me = { id: 'bot' };
+    const thread = {
+      id: 'p',
+      archived: true,
+      locked: true,
+      guild: { members: { me } },
+      parent: {
+        permissionsFor: (member: unknown) => (member === me ? new PermissionsBitField(has) : null),
+      },
+      isTextBased: () => true,
+      isThread: () => true,
+      isSendable: () => true,
+      setArchived: (value: boolean) => {
+        calls.push(`archived ${String(value)}`);
+        thread.archived = value;
+        return Promise.resolve(thread);
+      },
+      send: (payload: { flags?: unknown }) => {
+        if (thread.archived)
+          return Promise.reject(apiError(RESTJSONErrorCodes.InvalidActionOnArchivedThread));
+        calls.push(`send ${JSON.stringify(payload.flags)}`);
+        return Promise.resolve({ id: 'm' });
+      },
+      messages: {
+        delete: () => {
+          if (thread.archived)
+            return Promise.reject(apiError(RESTJSONErrorCodes.InvalidActionOnArchivedThread));
+          calls.push('delete');
+          return Promise.resolve();
+        },
+      },
+    };
+    const gateway = new DiscordPartyGateway();
+    gateway.use({
+      channels: {
+        fetch: () => Promise.resolve(thread),
+        cache: new Map(cached ? [['p', thread]] : []),
+      },
+    } as unknown as Client);
+    return { gateway, calls, thread };
+  }
+  const ALL =
+    PermissionFlagsBits.ViewChannel |
+    PermissionFlagsBits.SendMessagesInThreads |
+    PermissionFlagsBits.ManageThreads |
+    PermissionFlagsBits.EmbedLinks;
+
+  it('opens the archived post before it sends where asked, and sends silently where asked (B3, B13; P4)', async () => {
+    const { gateway, calls, thread } = board(ALL);
+    // Not asked to open it: Discord refuses the message in the archived locked post, as before.
+    await expect(gateway.sendMessage('p', { content: 'A line' })).rejects.toMatchObject({
+      code: RESTJSONErrorCodes.InvalidActionOnArchivedThread,
+    });
+    expect(calls).toEqual([]);
+    await expect(
+      gateway.sendMessage(
+        'p',
+        { v2: true, components: [{ type: ComponentType.TextDisplay, content: 'Stops' }] },
+        { silent: true, reopen: true },
+      ),
+    ).resolves.toBe('m');
+    expect(calls).toEqual([
+      'archived false',
+      `send ${JSON.stringify(['IsComponentsV2', 'SuppressNotifications'])}`,
+    ]);
+    // Without `silent` a message notifies as before (no flag of its own where it is classic).
+    await gateway.sendMessage('p', { content: 'A line' });
+    expect(calls.at(-1)).toBe('send undefined');
+    expect(thread.archived).toBe(false);
+  });
+
+  it('opens the archived post before it deletes a message in it where asked (B3; P4)', async () => {
+    const refused = board(ALL);
+    await expect(refused.gateway.deleteMessage('p', 'm')).rejects.toMatchObject({
+      code: RESTJSONErrorCodes.InvalidActionOnArchivedThread,
+    });
+    const { gateway, calls } = board(ALL);
+    await gateway.deleteMessage('p', 'm', { reopen: true });
+    expect(calls).toEqual(['archived false', 'delete']);
+  });
+
+  it('says what the bot may write in the post by its forum’s permissions (B6)', async () => {
+    expect(await board(ALL).gateway.postAccess('p')).toBe('v2');
+    expect(await board(ALL & ~PermissionFlagsBits.EmbedLinks).gateway.postAccess('p')).toBe(
+      'plain',
+    );
+    expect(await board(ALL & ~PermissionFlagsBits.ManageThreads).gateway.postAccess('p')).toBe(
+      'refused',
+    );
+    expect(
+      await board(ALL & ~PermissionFlagsBits.SendMessagesInThreads).gateway.postAccess('p'),
+    ).toBe('refused');
+  });
+
+  it('fetches a post that is not in the cache to say what the bot may write in it (P3)', async () => {
+    const { gateway } = board(ALL & ~PermissionFlagsBits.ManageThreads, false);
+    expect(await gateway.postAccess('p')).toBe('refused');
+  });
+});
+
 describe('DiscordPartyGateway: a post where the bot may not make one', () => {
   const post = { title: 't', message: { content: 'x' }, tagIds: ['1'] };
 
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index 6f36ddbc..53bf76c0 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -3,7 +3,6 @@ import {
   ChannelType,
   DiscordAPIError,
   MessageFlags,
-  MessageType,
   OverwriteType,
   PermissionFlagsBits,
   RESTJSONErrorCodes,
@@ -78,8 +77,36 @@ export type MessageFile = string | { attachment: Buffer; name: string };
 /** A message this bot sends or edits. Nobody is pinged unless `mention` names them. */
 export type OutgoingMessage = ClassicMessage | V2Message;
 
-/** What came of pinning a message (`PartyGateway.pinMessage`). */
-export type PinOutcome = 'pinned' | 'not-allowed' | 'full' | 'gone';
+/** How a message is sent (`PartyGateway.sendMessage`). */
+export interface SendOptions {
+  /**
+   * Sent with Discord's `SuppressNotifications` (plan 8R-9, B13): nobody, a follower of the post
+   * included, is notified of it. Edits never notify.
+   */
+  silent?: boolean;
+  /**
+   * An archived post is opened first (plan 8R-9, B3: Discord refuses a message in an archived
+   * locked post, 50083). Only the posts of the stops ask for it (review P4); every other send
+   * stays as it was.
+   */
+  reopen?: boolean;
+}
+
+/** How a message is deleted (`PartyGateway.deleteMessage`). */
+export interface DeleteOptions {
+  /**
+   * An archived post is opened first (plan 8R-9, B3: Discord refuses a deletion in an archived
+   * post, 50083); only the posts of the stops ask for it (review P4).
+   */
+  reopen?: boolean;
+}
+
+/**
+ * What the bot may write in a post of a forum (plan 8R-9, B6; `PartyGateway.postAccess`): `v2`,
+ * messages with components; `plain`, plain text only (no Embed Links); `refused`, nothing (no
+ * View Channel, Send Messages in Posts or Manage Posts: a locked post takes Manage Posts).
+ */
+export type PostAccess = 'v2' | 'plain' | 'refused';
 
 /**
  * How a member stands to a forum. `visible`: they can see it. `hidden`: they cannot, and nothing
@@ -202,8 +229,15 @@ export interface PartyGateway {
    * `reason` is what the server's audit log says of it (who asked for it).
    */
   deleteChannel(channelId: string, reason?: string): Promise<void>;
-  /** Sends a message into a text channel or a post; gives its id. */
-  sendMessage(channelId: string, message: OutgoingMessage): Promise<string | undefined>;
+  /**
+   * Sends a message into a text channel or a post; gives its id. An archived post is opened again
+   * first where `options.reopen` asks (plan 8R-9, B3).
+   */
+  sendMessage(
+    channelId: string,
+    message: OutgoingMessage,
+    options?: SendOptions,
+  ): Promise<string | undefined>;
   /**
    * Replaces a message this bot sent, in a text channel or a post. False when the message or its
    * channel is gone.
@@ -214,17 +248,22 @@ export interface PartyGateway {
     message: OutgoingMessage,
     options?: EditOptions,
   ): Promise<boolean>;
-  /** Deletes a message; one that is already gone is fine. */
-  deleteMessage(channelId: string, messageId: string): Promise<void>;
   /**
-   * Pins a message of the bot in a text channel (plan 8R-1: the post "Today’s Stops"),
-   * and deletes Discord's notice "… pinned a message" where the bot may: `pinned`;
-   * `not-allowed` without Pin Messages; `full` when the channel has Discord's most pins;
-   * `gone` for a message or channel that is gone. Anything else is thrown.
+   * Deletes a message; one that is already gone is fine. An archived post is opened again first
+   * where `options.reopen` asks (plan 8R-9, B3); otherwise Discord refuses it there (50083).
+   */
+  deleteMessage(channelId: string, messageId: string, options?: DeleteOptions): Promise<void>;
+  /**
+   * Unpins a message; one gone or not pinned is fine. False when the bot may not. (Plan 8R-9:
+   * only for the post "Today’s Stops" that the bot before it pinned in a region's channel.)
    */
-  pinMessage(channelId: string, messageId: string): Promise<PinOutcome>;
-  /** Unpins a message; one gone or not pinned is fine. False when the bot may not. */
   unpinMessage(channelId: string, messageId: string): Promise<boolean>;
+  /**
+   * What the bot may write in a post (plan 8R-9, B6: the region's board), by its permissions in
+   * the post's forum; the post is fetched (review P3), and one gone or whose permissions are not
+   * known counts as `v2`, so that Discord decides.
+   */
+  postAccess(postId: string): Promise<PostAccess>;
   /**
    * Deletes a message somebody else wrote (a reported one, plan 8S-2): `deleted`, `gone` when it
    * (or its channel) was gone already, `not-allowed` when the bot lacks Manage Messages there (in
@@ -526,6 +565,16 @@ const CAN_POST = [
   PermissionFlagsBits.EmbedLinks,
 ];
 
+/**
+ * What the bot needs in a forum to write in its locked board post (plan 8R-9, B6): writing in a
+ * locked post takes Manage Posts (Discord's 160005 without it).
+ */
+const WRITES_IN_BOARD = [
+  PermissionFlagsBits.ViewChannel,
+  PermissionFlagsBits.SendMessagesInThreads,
+  PermissionFlagsBits.ManageThreads,
+];
+
 const GONE: ReadonlySet<number | string> = new Set([
   RESTJSONErrorCodes.UnknownChannel,
   RESTJSONErrorCodes.UnknownMessage,
@@ -710,6 +759,21 @@ export function discordPayload(message: OutgoingMessage) {
   };
 }
 
+/**
+ * A message as discord.js sends it, as `discordPayload` makes it, and with `SuppressNotifications`
+ * where `options.silent` asks (plan 8R-9, B13); only a send takes the flag.
+ */
+export function sendPayload(message: OutgoingMessage, options?: SendOptions) {
+  const payload = discordPayload(message);
+  if (options?.silent !== true) return payload;
+  return {
+    ...payload,
+    flags: message.v2
+      ? (['IsComponentsV2', 'SuppressNotifications'] as const)
+      : (['SuppressNotifications'] as const),
+  };
+}
+
 /**
  * The body of the edit that makes a classic message (a post made before the posts were v2) a
  * components-v2 message, as the API takes it: content and embeds cleared (`null` stays `null`
@@ -1280,10 +1344,18 @@ export class DiscordPartyGateway implements PartyGateway {
     await this.done(() => channel.delete(reason));
   }
 
-  async sendMessage(channelId: string, message: OutgoingMessage): Promise<string | undefined> {
+  async sendMessage(
+    channelId: string,
+    message: OutgoingMessage,
+    options?: SendOptions,
+  ): Promise<string | undefined> {
     const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
     if (!channel?.isSendable()) return undefined;
-    const id = await this.unlessGone(async () => (await channel.send(discordPayload(message))).id);
+    const id = await this.unlessGone(async () => {
+      // An archived locked post refuses a message (50083) until it is opened (plan 8R-9, B3).
+      if (options?.reopen === true && channel.isThread()) await this.reopen(channel);
+      return (await channel.send(sendPayload(message, options))).id;
+    });
     this.noteSent(id, message);
     return id;
   }
@@ -1309,40 +1381,29 @@ export class DiscordPartyGateway implements PartyGateway {
     });
   }
 
-  async deleteMessage(channelId: string, messageId: string): Promise<void> {
+  async deleteMessage(
+    channelId: string,
+    messageId: string,
+    options?: DeleteOptions,
+  ): Promise<void> {
     const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
     if (!channel?.isTextBased()) return;
-    await this.done(() => channel.messages.delete(messageId));
+    await this.done(async () => {
+      // An archived post refuses a deletion (50083) until it is opened (plan 8R-9, B3).
+      if (options?.reopen === true && channel.isThread()) await this.reopen(channel);
+      await channel.messages.delete(messageId);
+    });
   }
 
-  async pinMessage(channelId: string, messageId: string): Promise<PinOutcome> {
-    const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
-    if (!channel?.isTextBased() || channel.isDMBased()) return 'gone';
-    try {
-      await channel.messages.pin(messageId);
-    } catch (err) {
-      if (isMissingPermission(err)) return 'not-allowed';
-      if (hasCode(err, RESTJSONErrorCodes.MaximumNumberOfPinsReachedForTheChannel)) {
-        return 'full';
-      }
-      if (isGone(err)) return 'gone';
-      throw err;
-    }
-    // Discord says "Professor Pine pinned a message" below it: that notice is the bot's own
-    // message, deleted where the bot may read the channel's newest messages.
-    try {
-      const recent = await channel.messages.fetch({ limit: 5 });
-      const notice = recent.find(
-        (one) =>
-          one.type === MessageType.ChannelPinnedMessage &&
-          one.reference?.messageId === messageId &&
-          one.author.id === this.client.user?.id,
-      );
-      if (notice) await this.done(() => notice.delete());
-    } catch (err) {
-      this.log?.debug({ err, channel: channelId }, 'could not delete the notice of a pin');
-    }
-    return 'pinned';
+  async postAccess(postId: string): Promise<PostAccess> {
+    const post = await this.post(postId);
+    if (!post) return 'v2';
+    const me = post.guild.members.me;
+    const has = me === null ? null : post.parent?.permissionsFor(me);
+    // Unknown counts as allowed: Discord decides.
+    if (!has) return 'v2';
+    if (!has.has(WRITES_IN_BOARD)) return 'refused';
+    return has.has(PermissionFlagsBits.EmbedLinks) ? 'v2' : 'plain';
   }
 
   async unpinMessage(channelId: string, messageId: string): Promise<boolean> {
diff --git a/src/ops/cutover-check.test.ts b/src/ops/cutover-check.test.ts
index be37e762..3429ee67 100644
--- a/src/ops/cutover-check.test.ts
+++ b/src/ops/cutover-check.test.ts
@@ -534,12 +534,9 @@ describe('cutoverCheck', () => {
       });
     });
 
-    it('wants Pin Messages in a region channel, to pin "Today’s Stops" (plan 8R-1)', async () => {
+    it('no longer asks Pin Messages in a region channel: nothing is pinned there (plan 8R-9)', async () => {
       shape.north.overwrites = [overwrite(shape.botRole, [], [P.PinMessages])];
-      expect((await check()).find((one) => one.what === 'region')).toMatchObject({
-        status: 'warn',
-        text: 'region #north: the bot could use Pin Messages in the channel',
-      });
+      expect((await check()).find((one) => one.what === 'region')?.status).toBe('pass');
     });
 
     it('names only what a missing View Channels or Send Messages leaves out', async () => {
diff --git a/src/ops/permissions.test.ts b/src/ops/permissions.test.ts
index 5b26e236..34ef58e2 100644
--- a/src/ops/permissions.test.ts
+++ b/src/ops/permissions.test.ts
@@ -86,11 +86,8 @@ describe('missingNeeds', () => {
       'Attach Files',
       'Read Message History',
     ]);
-    expect(missing.optional.map((need) => need.name)).toEqual([
-      'Add Reactions',
-      'Manage Messages',
-      'Pin Messages',
-    ]);
+    // Nothing is pinned in a region's channel since plan 8R-9: Pin Messages is not asked.
+    expect(missing.optional.map((need) => need.name)).toEqual(['Add Reactions', 'Manage Messages']);
   });
 
   it('finds nothing missing for an administrator', () => {
diff --git a/src/ops/permissions.ts b/src/ops/permissions.ts
index 5bf0284d..8f75f503 100644
--- a/src/ops/permissions.ts
+++ b/src/ops/permissions.ts
@@ -141,7 +141,8 @@ export const SERVER_NEEDS: readonly Need[] = [
 
 /**
  * What it needs in a region's channel: the link to a new post, spawn reports, screenshot replies,
- * the pinned post "Today’s Stops" (plan 8R-1: without Pin Messages it stands unpinned).
+ * the lines of new tasks and leaders (plan 8R-9). "Today’s Stops" is in the region's board since
+ * plan 8R-9, so nothing is pinned here.
  */
 export const REGION_CHANNEL_NEEDS: readonly Need[] = [
   VIEW,
@@ -156,12 +157,6 @@ export const REGION_CHANNEL_NEEDS: readonly Need[] = [
     'taking a screenshot away once it is a raid (src/discord/screenshot-message.ts)',
     true,
   ),
-  need(
-    P.PinMessages,
-    'Pin Messages',
-    'pinning the post "Today’s Stops" (plan 8R-1; src/services/stop-posts.ts)',
-    true,
-  ),
 ];
 
 /**
diff --git a/src/services/notify-service.research.test.ts b/src/services/notify-service.research.test.ts
index 1440f267..434d6e5f 100644
--- a/src/services/notify-service.research.test.ts
+++ b/src/services/notify-service.research.test.ts
@@ -156,7 +156,11 @@ describe('NotifyService: field research is reported (plan 8R-1, design 7)', () =
       researchPosts: {
         messageOf: (channelId, subjectKey) => {
           asked.push(`${channelId} ${subjectKey}`);
-          return Promise.resolve('300000000000000077');
+          // The board post (plan 8R-9, B1) and the message in it.
+          return Promise.resolve({
+            channelId: '300000000000000099',
+            messageId: '300000000000000077',
+          });
         },
       },
     });
@@ -164,7 +168,7 @@ describe('NotifyService: field research is reported (plan 8R-1, design 7)', () =
     await made.report(DRAGON, [west(1)]);
     expect(asked).toEqual([`${WEST_CHANNEL} ${DRAGON.key}`]);
     expect(linksOf(made.dms.to(ALICE)[0])).toEqual([
-      `Go to post ${postLink(made.gateway.guildId, WEST_CHANNEL, '300000000000000077')}`,
+      `Go to post ${postLink(made.gateway.guildId, '300000000000000099', '300000000000000077')}`,
     ]);
   });
 
diff --git a/src/services/notify-service.rocket.test.ts b/src/services/notify-service.rocket.test.ts
index 19b5b826..056550bb 100644
--- a/src/services/notify-service.rocket.test.ts
+++ b/src/services/notify-service.rocket.test.ts
@@ -341,7 +341,11 @@ describe('NotifyService: Team GO Rocket is reported (plan 8R-2, design 7)', () =
       researchPosts: {
         messageOf: (channelId, subjectKey) => {
           asked.push(`${channelId} ${subjectKey}`);
-          return Promise.resolve('300000000000000077');
+          // The board post (plan 8R-9, B1) and the message in it.
+          return Promise.resolve({
+            channelId: '300000000000000099',
+            messageId: '300000000000000077',
+          });
         },
       },
     });
@@ -357,7 +361,7 @@ describe('NotifyService: Team GO Rocket is reported (plan 8R-2, design 7)', () =
     expect(dmBrief(message).at(-1)).toBe('Until midnight.');
     expect(asked).toEqual([`${WEST_CHANNEL} leader:arlo`]);
     expect(linksOf(message)).toEqual([
-      `Go to post ${postLink(made.gateway.guildId, WEST_CHANNEL, '300000000000000077')}`,
+      `Go to post ${postLink(made.gateway.guildId, '300000000000000099', '300000000000000077')}`,
     ]);
     expect(made.dms.jobs[0]?.priority).toBe(DM_PRIORITY.normal);
     // The same hideout again, or reported anew after being taken back: nobody told twice.
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index 5efa799c..948e3caf 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -108,6 +108,7 @@ import { researchPicture, rocketPicture, type PictureLookup } from '../domain/st
 import type { StopReport } from '../domain/stops/report.js';
 import { isOneOf, researchSubjectOf, taskOfSubject } from '../domain/research/reports.js';
 import type { TaskReward } from '../domain/research/task.js';
+import type { PostLink } from './stop-posts.js';
 
 /**
  * Change… of a reason (plan 8R-4, design 4): a want of a Pokémon in raids, spawns or as a shadow
@@ -252,12 +253,12 @@ export interface NotifyServiceOptions {
   };
   regions: Pick<RegionProvider, 'byId' | 'all'>;
   /**
-   * The message of a region channel's pinned post "Today’s Stops" that holds a task
-   * (`StopPostService.messageOf`), for a research DM's link (plan 8R-1); none in rehearsal
-   * mode, which makes no posts: the DM has no link then.
+   * The message of a region channel's post "Today’s Stops" that holds a task, in its board post
+   * (`StopPostService.messageOf`; plan 8R-9, B1: the thread and the message), for a research DM's
+   * link (plan 8R-1); none in rehearsal mode, which makes no posts: the DM has no link then.
    */
   researchPosts?: {
-    messageOf(channelId: string, subjectKey: string): Promise<string | undefined>;
+    messageOf(channelId: string, subjectKey: string): Promise<PostLink | undefined>;
   };
   /**
    * The research reports as they are kept now (`StopReportService.kept`; plan 8R-5, R6): a "one
@@ -972,7 +973,7 @@ export class NotifyService implements PartyNotifier {
     };
     return [...byChannel].map(([channelId, reported]): Announcement => {
       const eventAt = reportedAt;
-      let messageId: string | undefined;
+      let link: PostLink | undefined;
       const untold = (memberId: string): StopReport[] =>
         reported.filter((report) => isNews(memberId, report));
       return {
@@ -990,12 +991,10 @@ export class NotifyService implements PartyNotifier {
           }
           standing = await standingNow();
           if (wanting.size > 0 && researchPosts && reported.some(({ id }) => standing.has(id))) {
-            messageId = await researchPosts
-              .messageOf(channelId, subjectKey)
-              .catch((err: unknown) => {
-                log.warn({ err, channel: channelId }, 'could not find the post of the stops');
-                return undefined;
-              });
+            link = await researchPosts.messageOf(channelId, subjectKey).catch((err: unknown) => {
+              log.warn({ err, channel: channelId }, 'could not find the post of the stops');
+              return undefined;
+            });
           }
           const ids = [...wanting.keys()].filter((id) => untold(id).length > 0);
           // The DM's picture made first (plan 8R-6): a reward's own, "one of"'s the encounter's.
@@ -1022,7 +1021,9 @@ export class NotifyService implements PartyNotifier {
           const stops = untold(memberId).map((report) => report.stop);
           const until = periodEndWords(news.period.end, eventAt, this.options.settings.timezone);
           const links =
-            messageId === undefined ? [] : [postButton(postLink(guildId, channelId, messageId))];
+            link === undefined
+              ? []
+              : [postButton(postLink(guildId, link.channelId, link.messageId))];
           const shown = reasons.map((reason) => this.shown(guildId, reason));
           if (confirms(memberId)) {
             return notifyDm(
@@ -1103,7 +1104,9 @@ export class NotifyService implements PartyNotifier {
     const actors = [report.reporter.id, ...(news.alsoActors ?? [])];
     for (const { channelId, messageId: posted } of news.channels) {
       const eventAt = this.now();
-      let messageId = posted;
+      // A grunt's message in the channel; a hideout's message of the board (plan 8R-9, B1).
+      let link: PostLink | undefined =
+        posted === undefined ? undefined : { channelId, messageId: posted };
       this.announce({
         // A grunt's line is its type's (fix B1): reports of one type are worked off in order, so
         // the hour of a type holds for reports made at once; a hideout's line is its report's,
@@ -1144,7 +1147,7 @@ export class NotifyService implements PartyNotifier {
           const picture = rocketPicture(report.subjectKey, report.rocket.catches);
           if (ids.length > 0 && picture) await pictures?.prepare([picture.source]);
           if (hideout && ids.length > 0 && researchPosts) {
-            messageId = await researchPosts
+            link = await researchPosts
               .messageOf(channelId, report.subjectKey)
               .catch((err: unknown) => {
                 log.warn({ err, channel: channelId }, 'could not find the post of the stops');
@@ -1195,12 +1198,12 @@ export class NotifyService implements PartyNotifier {
                 this.pictureLookup,
               ),
               links:
-                messageId === undefined
+                link === undefined
                   ? []
                   : [
                       hideout
-                        ? postButton(postLink(guildId, channelId, messageId))
-                        : reportButton(postLink(guildId, channelId, messageId)),
+                        ? postButton(postLink(guildId, link.channelId, link.messageId))
+                        : reportButton(postLink(guildId, link.channelId, link.messageId)),
                     ],
               ...(hideout ? {} : { note: gruntHourNote() }),
             },
diff --git a/src/services/party-scheduler.test.ts b/src/services/party-scheduler.test.ts
index 9bf19e9d..f7b8fac2 100644
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -1004,6 +1004,6 @@ async function endedButOpen(made: Made): Promise<string> {
   if (outcome.kind !== 'created') throw new Error(outcome.kind);
   const postId = outcome.party.forumPostId ?? '';
   await made.service.end(outcome.party.id);
-  await made.gateway.sendMessage(postId, { content: 'late' });
+  await made.gateway.sendMessage(postId, { content: 'late' }, { reopen: true });
   return postId;
 }
diff --git a/src/services/party-service.end.test.ts b/src/services/party-service.end.test.ts
index 36d4b64c..a65eeffc 100644
--- a/src/services/party-service.end.test.ts
+++ b/src/services/party-service.end.test.ts
@@ -242,7 +242,7 @@ describe('PartyService.sweepPosts', () => {
     if (second.kind !== 'created') throw new Error(second.kind);
     const ended = second.party.forumPostId ?? '';
     await service.end(second.party.id);
-    await gateway.sendMessage(ended, { content: 'late' });
+    await gateway.sendMessage(ended, { content: 'late' }, { reopen: true });
     expect(gateway.posts.get(ended)).toMatchObject({ archived: false, reopened: 1 });
 
     expect(await service.sweepPosts()).toBe(1);
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index 9c03f714..6f6b2fa8 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -607,14 +607,23 @@ describe('PartyService: the summary and tidying up', () => {
   it('links the region’s post of the stops today, with its counts (plan 8X-G)', async () => {
     const { service, gateway } = await partyServiceWith();
     expect(textDisplays(service.summaryMessage(1))).toHaveLength(1);
+    // The post is in the region's board, the summary's own post (plan 8R-9, B1).
+    const board = '1700000000000000009';
     service.setStopPosts({
       summaryOf: (channelId) =>
         channelId === WEST_CHANNEL
-          ? { serverId: gateway.guildId, messageId: '1700000000000000001', tasks: 3, hideouts: 1 }
+          ? {
+              serverId: gateway.guildId,
+              threadId: board,
+              messageId: '1700000000000000001',
+              tasks: 3,
+              hideouts: 1,
+            }
           : undefined,
+      boardChanged: () => undefined,
     });
     expect(textDisplays(service.summaryMessage(1)).at(-1)).toBe(
-      `[Today’s Stops](<https://discord.com/channels/${gateway.guildId}/${WEST_CHANNEL}/` +
+      `[Today’s Stops](<https://discord.com/channels/${gateway.guildId}/${board}/` +
         '1700000000000000001>): 3 tasks · 1 hideout',
     );
     expect(textDisplays(service.summaryMessage(2))).toHaveLength(1);
@@ -623,18 +632,37 @@ describe('PartyService: the summary and tidying up', () => {
     service.setStopPosts({
       summaryOf: () => ({
         serverId: gateway.guildId,
+        threadId: board,
         messageId: '1700000000000000001',
         tasks: 0,
         hideouts: 0,
         waiting: { tasks: 4, at },
       }),
+      boardChanged: () => undefined,
     });
     expect(textDisplays(service.summaryMessage(1)).at(-1)).toBe(
-      `[Today’s Stops](<https://discord.com/channels/${gateway.guildId}/${WEST_CHANNEL}/` +
+      `[Today’s Stops](<https://discord.com/channels/${gateway.guildId}/${board}/` +
         `1700000000000000001>): 4 tasks back at <t:${String(at / 1_000)}:t>`,
     );
   });
 
+  it('has the region’s stops drawn in its board once the summary is made or taken over (plan 8R-9, B2)', async () => {
+    const { service, gateway, regions } = await partyServiceWith();
+    const asked: string[] = [];
+    service.setStopPosts({
+      summaryOf: () => undefined,
+      boardChanged: (channelId) => asked.push(channelId),
+    });
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    expect(asked).toEqual([WEST_CHANNEL]);
+    // Its record lost: the post is taken over, and the stops drawn in it again.
+    gateway.posts.get(west.summaryMessageId ?? '')!.pinned = false;
+    west.summaryMessageId = null;
+    await service.ensureSummary(west);
+    expect(asked).toEqual([WEST_CHANNEL, WEST_CHANNEL]);
+  });
+
   it('takes over an unpinned summary post left over and pins it', async () => {
     const { service, gateway, regions } = await partyServiceWith();
     const west = regions.rows[0]!;
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index b872b885..0571da21 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -108,6 +108,7 @@ import {
   type RaidPostView,
 } from '../render/raid-post.js';
 import { summaryRefusedWords } from '../render/activity.js';
+import { postLink } from '../render/notify-dm.js';
 import {
   maxTitle,
   renderMaxPost,
@@ -480,19 +481,25 @@ export type SplitOutcome =
       moved: readonly string[];
     };
 
-/** What the party service needs of the region table. */
 /**
- * What the summary reads of the pinned post "Today’s Stops" of a region's channel (plan
- * 8X-G; `StopPostService.summaryOf`): its server and first message, and how many tasks and
- * hideouts it names (and, under an event's window, the day's research waiting: plan 8R-6);
- * undefined where the channel has no post today.
+ * What the summary reads of the post "Today’s Stops" of a region's channel (plan 8X-G;
+ * `StopPostService.summaryOf`): its server, the board post it is in (plan 8R-9: the summary's
+ * own) and its first message, and how many tasks and hideouts it names (and, under an event's
+ * window, the day's research waiting: plan 8R-6); undefined where the channel has no post today.
+ * `boardChanged` is told when the region's board post is made or taken over (plan 8R-9, B2), so
+ * that the stops are drawn in it.
  */
 export interface StopPostsForSummary {
   summaryOf(
     channelId: string,
-  ): ({ serverId: string; messageId: string } & Omit<StopsLine, 'url'>) | undefined;
+  ):
+    | ({ serverId: string; threadId: string; messageId: string } & Omit<StopsLine, 'url'>)
+    | undefined;
+  boardChanged(channelId: string): void;
 }
 
+/** What the party service needs of the region table. */
+
 export interface SummaryStore {
   setForum(id: number, forumChannelId: string | null): Promise<'set' | 'no-region' | 'forum-taken'>;
   setSummaryMessage(id: number, forumChannelId: string, messageId: string | null): Promise<boolean>;
@@ -3152,12 +3159,15 @@ export class PartyService {
       });
   }
 
-  /** The line of the region's pinned post of the stops today, where there is one (plan 8X-G). */
+  /**
+   * The line of the region's post of the stops today, where there is one (plan 8X-G), linking its
+   * first message in the board post (plan 8R-9, B1).
+   */
   private stopsLine(region: Region): StopsLine | undefined {
     const post = this.stopPosts?.summaryOf(region.channelId);
     if (!post) return undefined;
     return {
-      url: `https://discord.com/channels/${post.serverId}/${region.channelId}/${post.messageId}`,
+      url: postLink(post.serverId, post.threadId, post.messageId),
       tasks: post.tasks,
       hideouts: post.hideouts,
       waiting: post.waiting,
@@ -3389,6 +3399,8 @@ export class PartyService {
     this.summarySent.delete(region.id);
     await regions.load();
     this.summaries.request(region.id);
+    // The stops are drawn in the board it is now (plan 8R-9, B2).
+    this.stopPosts?.boardChanged(region.channelId);
     return 'taken';
   }
 
@@ -3420,6 +3432,8 @@ export class PartyService {
     }
     this.summarySent.set(region.id, { postId, text: JSON.stringify(message) });
     await regions.load();
+    // The stops are drawn in the new board (plan 8R-9, B2).
+    this.stopPosts?.boardChanged(region.channelId);
     return pin === 'pinned' ? { made: true } : { made: true, unpinned: pin };
   }
 
diff --git a/src/services/region-admin-service.test.ts b/src/services/region-admin-service.test.ts
index ab89e7dd..42eebd5f 100644
--- a/src/services/region-admin-service.test.ts
+++ b/src/services/region-admin-service.test.ts
@@ -657,7 +657,7 @@ describe('RegionAdminService.remove', () => {
     expect(await made.regionAdmin.orphanForums(OTHER_REGION_STAFF)).toEqual([]);
 
     // A late message opens the archived post again: the hourly sweep archives it as before.
-    await made.gateway.sendMessage(raid.postId, { content: 'late' });
+    await made.gateway.sendMessage(raid.postId, { content: 'late' }, { reopen: true });
     expect(made.gateway.posts.get(raid.postId)?.archived).toBe(false);
     expect(await made.service.sweepPosts()).toBe(1);
     expect(made.gateway.posts.get(raid.postId)?.archived).toBe(true);
diff --git a/src/services/rehearsal.test.ts b/src/services/rehearsal.test.ts
index 8a7a1c39..157f549f 100644
--- a/src/services/rehearsal.test.ts
+++ b/src/services/rehearsal.test.ts
@@ -209,27 +209,22 @@ describe('rehearsalGateway', () => {
     );
   });
 
-  it('pins and unpins only in the post of a rehearsed party', async () => {
+  it('unpins only in the post of a rehearsed party', async () => {
     const { service, gateway, fake, entries } = await rehearsed();
     const outcome = await service.reportRaid(report(1));
     if (outcome.kind !== 'created') throw new Error(outcome.kind);
     const postId = outcome.party.forumPostId ?? '';
     const inPost = (await fake.sendMessage(postId, { content: 'Raid is starting' })) ?? '';
-    expect(await gateway.pinMessage(postId, inPost)).toBe('pinned');
+    fake.pin(postId, inPost);
     expect(await gateway.unpinMessage(postId, inPost)).toBe(true);
     expect(fake.pinnedIn(postId)).toEqual([]);
     // A member's message in the region channel, pinned by somebody else.
-    const outside = (await fake.sendMessage(WEST_CHANNEL, { content: 'Welcome' })) ?? '';
     const other = (await fake.sendMessage(WEST_CHANNEL, { content: 'Rules' })) ?? '';
-    await fake.pinMessage(WEST_CHANNEL, other);
-    expect(await gateway.pinMessage(WEST_CHANNEL, outside)).toBe('not-allowed');
+    fake.pin(WEST_CHANNEL, other);
     expect(await gateway.unpinMessage(WEST_CHANNEL, other)).toBe(false);
     expect(fake.pinnedIn(WEST_CHANNEL)).toEqual([other]);
-    expect(entries.map((entry) => entry.msg)).toEqual(
-      expect.arrayContaining([
-        'rehearsal: no message is pinned outside the posts',
-        'rehearsal: no message is unpinned outside the posts',
-      ]),
+    expect(entries.map((entry) => entry.msg)).toContain(
+      'rehearsal: no message is unpinned outside the posts',
     );
   });
 
diff --git a/src/services/rehearsal.ts b/src/services/rehearsal.ts
index 7da8fab1..ff068146 100644
--- a/src/services/rehearsal.ts
+++ b/src/services/rehearsal.ts
@@ -169,7 +169,6 @@ type GuardedMethod =
   | 'createTextChannel'
   | 'deleteChannel'
   | 'deleteReported'
-  | 'pinMessage'
   | 'unpinMessage';
 
 /**
@@ -178,7 +177,7 @@ type GuardedMethod =
  * everything else goes to `inner` as it is. So no announcement reaches a channel (the boss list,
  * gyms and Wayfarer imports, the link to a new post in its region's channel, copies in the
  * remote and elite channels, spawn reports and their Unown copies), whoever sends it. No
- * category or text channel is made (answered as a refused permission), no message pinned or
+ * category or text channel is made (answered as a refused permission), no message
  * unpinned outside the posts of parties (refused the same way), and no channel deleted
  * but a forum made through this gateway.
  */
@@ -192,8 +191,8 @@ export function rehearsalGateway<G extends PartyGateway>(
   const made = new Set<string>();
   const refused: CreatedChannel = { ok: false, reason: 'no-permission' };
   const guarded: Pick<PartyGateway, GuardedMethod> = {
-    sendMessage(channelId, message) {
-      if (posts.mayPostIn(channelId)) return inner.sendMessage(channelId, message);
+    sendMessage(channelId, message, options) {
+      if (posts.mayPostIn(channelId)) return inner.sendMessage(channelId, message, options);
       log.info({ channel: channelId }, 'rehearsal: no message outside the posts of parties');
       return Promise.resolve(undefined);
     },
@@ -231,13 +230,7 @@ export function rehearsalGateway<G extends PartyGateway>(
       log.info({ channel: channelId }, 'rehearsal: no channel is deleted but a forum it made');
       return Promise.resolve();
     },
-    // A pin outside the posts of parties (plan 8R-1's post, which rehearsal mode never makes).
-    pinMessage(channelId, messageId) {
-      if (posts.mayPostIn(channelId)) return inner.pinMessage(channelId, messageId);
-      log.info({ channel: channelId }, 'rehearsal: no message is pinned outside the posts');
-      return Promise.resolve('not-allowed' as const);
-    },
-    // Nor is a message unpinned there (answered as a refused permission).
+    // No message is unpinned outside the posts of parties (answered as a refused permission).
     unpinMessage(channelId, messageId) {
       if (posts.mayPostIn(channelId)) return inner.unpinMessage(channelId, messageId);
       log.info({ channel: channelId }, 'rehearsal: no message is unpinned outside the posts');
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index b3cc8dd1..6af867c5 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -1,8 +1,18 @@
 import { DateTime } from 'luxon';
 import { afterEach, describe, expect, it, vi } from 'vitest';
-import { FakePartyGateway, networkAway } from '../../test/support/fake-gateway.js';
+import {
+  FakePartyGateway,
+  missingPermissions,
+  networkAway,
+} from '../../test/support/fake-gateway.js';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
-import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from '../../test/support/gyms.js';
+import {
+  EAST_CHANNEL,
+  EAST_FORUM,
+  testRegions,
+  WEST_CHANNEL,
+  WEST_FORUM,
+} from '../../test/support/gyms.js';
 import { textOf } from '../../test/support/messages.js';
 import { expectV2Sendable } from '../../test/support/post-limits.js';
 import {
@@ -36,10 +46,30 @@ const westLine = (n: number): string =>
   `- **[Yellow Mural ${String(n)}](<https://www.google.com/maps/search/?api=1&query=` +
   `${String((40_050 + n) / 1_000)}%2C-80.05>)** · Market Street · **Ash**`;
 
-function postsWith(initial: ResearchEvent[] = [], pictures?: PictureMaker) {
+async function postsWith(initial: ResearchEvent[] = [], pictures?: PictureMaker) {
   const clock = { now: at('2026-11-21T10:00') };
   const { log, entries } = createTestLogger();
   const gateway = new FakePartyGateway();
+  // The regions' boards (plan 8R-9): the summary posts of their forums, "Today’s Stops" below.
+  gateway.addForum(WEST_FORUM);
+  gateway.addForum(EAST_FORUM);
+  const board = async (forumId: string): Promise<string> =>
+    (await gateway.createPost(forumId, {
+      title: 'Today and coming up',
+      message: { content: 'The summary' },
+      tagIds: [],
+    })) ?? '';
+  const westBoard = await board(WEST_FORUM);
+  const eastBoard = await board(EAST_FORUM);
+  const regions = testRegions().map((region) => ({
+    ...region,
+    summaryMessageId:
+      region.channelId === WEST_CHANNEL
+        ? westBoard
+        : region.channelId === EAST_CHANNEL
+          ? eastBoard
+          : null,
+  }));
   const storage = new MemoryStopPosts();
   // The reports; saved here directly, a report no listener hears of.
   const reportStore = new MemoryStopReports();
@@ -71,8 +101,11 @@ function postsWith(initial: ResearchEvent[] = [], pictures?: PictureMaker) {
       storage,
       reports,
       events: provider,
-      regions: { all: () => testRegions() },
-      guilds: { idFor: (id) => Promise.resolve(id === FAKE_GUILD_ID ? 1 : undefined) },
+      regions: { all: () => regions },
+      guilds: {
+        idFor: (id) => Promise.resolve(id === FAKE_GUILD_ID ? 1 : undefined),
+        snowflakeOf: (row) => Promise.resolve(row === 1 ? FAKE_GUILD_ID : undefined),
+      },
       gateway,
       zone: ZONE,
       log,
@@ -107,13 +140,17 @@ function postsWith(initial: ResearchEvent[] = [], pictures?: PictureMaker) {
       },
       reporter: ASH,
     });
-  const said = (channelId = WEST_CHANNEL) =>
+  const said = (channelId = westBoard) =>
     gateway
       .messagesIn(channelId)
       .map(({ message }) => (message.v2 ? textOf(message) : (message.content ?? '')));
   return {
     clock,
     gateway,
+    west: westBoard,
+    east: eastBoard,
+    regions,
+    board,
     storage,
     reportStore,
     reports,
@@ -129,47 +166,50 @@ function postsWith(initial: ResearchEvent[] = [], pictures?: PictureMaker) {
 }
 
 describe('StopPostService', () => {
-  let made: ReturnType<typeof postsWith> | undefined;
+  let made: Awaited<ReturnType<typeof postsWith>> | undefined;
   afterEach(async () => {
     vi.useRealTimers();
     await made?.posts.close();
     made = undefined;
   });
 
-  it('makes the post at the first report of the day in a region, pins it, and edits it after', async () => {
-    made = postsWith();
+  it('posts in the region’s board at the first report of the day, silently, and edits it after (plan 8R-9)', async () => {
+    made = await postsWith();
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(made.gateway.messagesIn(made.west)).toEqual([]);
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
+    const [first] = made.gateway.messagesIn(made.west);
     expect(made.said()[0]).toContain('## Today’s Stops');
     expect(made.said()[0]).toContain('Saturday, November 21');
     expect(made.said()[0]).toContain(
       `**Catch a Dragon-type Pokémon** · one of Dratini, Bagon, Axew +4\n${westLine(1)}`,
     );
-    expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual([first?.id]);
-    expect(made.gateway.pinNotices).toBe(1);
+    // No follower of the board is pinged by it (B13); nothing in the text channel, no pin.
+    expect(first?.silent).toBe(true);
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(made.gateway.pinnedIn(made.west)).toEqual([]);
     // East has no report: no post.
-    expect(made.gateway.messagesIn(EAST_CHANNEL)).toEqual([]);
+    expect(made.gateway.messagesIn(made.east)).toEqual([]);
 
     await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL).map((one) => one.id)).toEqual([first?.id]);
-    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits).toBe(1);
+    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual([first?.id]);
+    expect(made.gateway.messagesIn(made.west)[0]?.edits).toBe(1);
     expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
     expect([...made.storage.rows.values()]).toEqual([
       expect.objectContaining({
         channelId: WEST_CHANNEL,
         day: '2026-11-21',
         serverId: FAKE_GUILD_ID,
+        threadId: made.west,
         messageIds: [first?.id],
       }),
     ]);
   });
 
   it('puts every version of a task in its one block, linked by each (plan 8R-5, R9)', async () => {
-    made = postsWith();
+    made = await postsWith();
     const throws = pageTask('Make 3 Excellent Throws in a row');
     const versions = researchTasksFixture().versions(throws);
     const version = (label: string) => {
@@ -202,10 +242,14 @@ describe('StopPostService', () => {
     expect(made.said()[0]?.indexOf('Make 3 Excellent')).toBeLessThan(
       made.said()[0]?.indexOf('Catch 7') ?? 0,
     );
-    // Every version and the task's key alone link the block's message; the tasks are counted.
-    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
+    // Every version and the task's key alone link the block's message, in the board post (B1);
+    // the tasks are counted.
+    const [first] = made.gateway.messagesIn(made.west);
     for (const key of [throws.key, version('Gible').value, version('Beldum').value]) {
-      expect(await made.posts.messageOf(WEST_CHANNEL, key)).toBe(first?.id);
+      expect(await made.posts.messageOf(WEST_CHANNEL, key)).toEqual({
+        channelId: made.west,
+        messageId: first?.id,
+      });
     }
     expect(made.posts.summaryOf(WEST_CHANNEL)?.tasks).toBe(2);
   });
@@ -219,7 +263,7 @@ describe('StopPostService', () => {
   });
 
   it('puts an event’s tasks first, then the rest, each by most stops (plan 8R-8)', async () => {
-    made = postsWith();
+    made = await postsWith();
     const typedText = 'Win 3 raids in the rain';
     // A typed task (no category of the page) is not an event's, reported before them all.
     await made.reports.reportResearch({
@@ -249,7 +293,7 @@ describe('StopPostService', () => {
   });
 
   it('cuts the ordinary tasks of a busy day before an event’s (plan 8R-8)', async () => {
-    made = postsWith();
+    made = await postsWith();
     const tasks = researchTasksOfPage();
     const spread = (k: number) =>
       reportedStop(k, { lat: 40.01 + (k % 80) / 1_000, lon: -80.09 + Math.floor(k / 80) / 1_000 });
@@ -272,7 +316,7 @@ describe('StopPostService', () => {
   });
 
   it('groups a report of before plan 8R-5 under the version it is (review R2)', async () => {
-    made = postsWith();
+    made = await postsWith();
     const excellent = pageTask('Make 2 Excellent Throws');
     const great = pageTask('Make 3 Great Throws in a row');
     const versionOf = (task: ResearchTask, label: string) => {
@@ -307,7 +351,7 @@ describe('StopPostService', () => {
 
   it('tells the summary what its post holds and when it changes, and when it goes (plan 8X-G)', async () => {
     vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
-    made = postsWith();
+    made = await postsWith();
     await made.posts.start();
     expect(made.posts.summaryOf(WEST_CHANNEL)).toBeUndefined();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
@@ -322,10 +366,11 @@ describe('StopPostService', () => {
       });
     }
     await made.posts.flush();
-    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
+    const [first] = made.gateway.messagesIn(made.west);
     expect(made.said()[0]).toMatch(/\*\*Arlo\*\*[^\n]*\n- \*\*[^\n]+\n- \*\*/);
     expect(made.posts.summaryOf(WEST_CHANNEL)).toEqual({
       serverId: FAKE_GUILD_ID,
+      threadId: made.west,
       messageId: first?.id,
       tasks: 2,
       hideouts: 1,
@@ -338,13 +383,13 @@ describe('StopPostService', () => {
     made.clock.now = at('2026-11-22T00:00:01');
     await vi.advanceTimersByTimeAsync(at('2026-11-22T00:00:02') - at('2026-11-21T10:00'));
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(made.gateway.messagesIn(made.west)).toEqual([]);
     expect(made.posts.summaryOf(WEST_CHANNEL)).toBeUndefined();
     expect(made.changes).toContain(WEST_CHANNEL);
   });
 
   it('shows the hideouts of the day after the research; a grunt makes no post (8R-2)', async () => {
-    made = postsWith();
+    made = await postsWith();
     const rocket = (key: string, stop = west(1)) =>
       made!.reports.reportRocket({
         serverId: FAKE_GUILD_ID,
@@ -354,7 +399,7 @@ describe('StopPostService', () => {
       });
     await rocket('grunt:water');
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(made.gateway.messagesIn(made.west)).toEqual([]);
     // A hideout makes the day's post where none is.
     const arlo = await rocket('leader:arlo', west(2));
     await made.posts.flush();
@@ -362,8 +407,11 @@ describe('StopPostService', () => {
       `### Team GO Rocket hideouts\n**Arlo** · catch Alolan Grimer\n${westLine(2)}`,
     );
     expect(made.said()[0]).not.toContain('Water-type grunt');
-    const [post] = made.gateway.messagesIn(WEST_CHANNEL);
-    expect(await made.posts.messageOf(WEST_CHANNEL, 'leader:arlo')).toBe(post?.id);
+    const [post] = made.gateway.messagesIn(made.west);
+    expect(await made.posts.messageOf(WEST_CHANNEL, 'leader:arlo')).toEqual({
+      channelId: made.west,
+      messageId: post?.id,
+    });
     // Under an event's window the hideouts stand: they belong to the day.
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     made.setEvents([PAWNIARD_DAY]);
@@ -384,34 +432,32 @@ describe('StopPostService', () => {
   });
 
   it('shows a stop in the post of each region it lies in, and only there', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'), [east]);
     await made.posts.flush();
-    expect(made.said(WEST_CHANNEL)).toEqual([]);
-    expect(made.said(EAST_CHANNEL)[0]).toContain('Yellow Mural 90');
+    expect(made.said(made.west)).toEqual([]);
+    expect(made.said(made.east)[0]).toContain('Yellow Mural 90');
   });
 
   it('draws only the posts of the regions a report’s stops lie in (F2)', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(1), east]);
     await made.posts.flush();
-    const [westPost] = made.gateway.messagesIn(WEST_CHANNEL);
-    const [eastPost] = made.gateway.messagesIn(EAST_CHANNEL);
+    const [westPost] = made.gateway.messagesIn(made.west);
+    const [eastPost] = made.gateway.messagesIn(made.east);
     // A report in East, and one taken back there: West's post is left alone.
     const { saved } = await made.report(pageTask('Catch 7 Pokémon'), [east]);
     await made.posts.flush();
     await made.reports.takeBack(FAKE_GUILD_ID, [saved[0]!.report.id], ASH.id, false);
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits).toBe(0);
-    expect(made.gateway.calls.filter((call) => call.includes(westPost?.id ?? '-'))).toEqual([
-      `pinMessage ${westPost?.id ?? ''}`,
-    ]);
-    expect(made.gateway.messagesIn(EAST_CHANNEL)[0]?.id).toBe(eastPost?.id);
-    expect(made.gateway.messagesIn(EAST_CHANNEL)[0]?.edits).toBe(2);
+    expect(made.gateway.messagesIn(made.west)[0]?.edits).toBe(0);
+    expect(made.gateway.calls.filter((call) => call.includes(westPost?.id ?? '-'))).toEqual([]);
+    expect(made.gateway.messagesIn(made.east)[0]?.id).toBe(eastPost?.id);
+    expect(made.gateway.messagesIn(made.east)[0]?.edits).toBe(2);
   });
 
   it('makes no edit where a redraw would show the same (F2)', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
     // An event that ended days ago changes nothing of today's post, though every post is drawn.
@@ -420,35 +466,34 @@ describe('StopPostService', () => {
     // The same task again at the same stop: its report is replaced, the post reads the same.
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits).toBe(0);
+    expect(made.gateway.messagesIn(made.west)[0]?.edits).toBe(0);
     await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits).toBe(1);
+    expect(made.gateway.messagesIn(made.west)[0]?.edits).toBe(1);
   });
 
   it('keeps its message when an edit fails, and draws it at the next change (F3)', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
+    const [first] = made.gateway.messagesIn(made.west);
     made.gateway.failing.set('editMessage', new Error('503 Service Unavailable'));
     await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
     await made.posts.flush();
     expect(made.gateway.deleted).toEqual([]);
-    expect(made.gateway.messagesIn(WEST_CHANNEL).map((one) => one.id)).toEqual([first?.id]);
+    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual([first?.id]);
     expect(
       made.entries.filter((entry) => entry.msg === 'could not draw the post of the stops'),
     ).toHaveLength(1);
     made.gateway.failing.delete('editMessage');
     await made.report(pageTask('Catch 7 Pokémon'), [west(3)]);
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL).map((one) => one.id)).toEqual([first?.id]);
+    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual([first?.id]);
     expect(made.said()[0]).toContain('Yellow Mural 3');
-    expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual([first?.id]);
   });
 
   it('draws on a catch-up a post whose edit failed while the network was away (plan 8X-H)', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
     made.gateway.failing.set('editMessage', new Error('getaddrinfo ENOTFOUND discord.com'));
@@ -459,34 +504,33 @@ describe('StopPostService', () => {
     await made.posts.catchUp();
     expect(made.said()[0]).toContain('Yellow Mural 2');
     // A post that is current is not edited again.
-    const edits = made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits;
+    const edits = made.gateway.messagesIn(made.west)[0]?.edits;
     await made.posts.catchUp();
-    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits).toBe(edits);
+    expect(made.gateway.messagesIn(made.west)[0]?.edits).toBe(edits);
   });
 
   it('sends a message anew whose edit Discord refuses after a restart, its kind not known (F3)', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
+    const [first] = made.gateway.messagesIn(made.west);
     await made.posts.close();
     // While the bot was down it lost Embed Links: the v2 message cannot be made plain.
-    made.gateway.noEmbeds.add(WEST_CHANNEL);
+    made.gateway.noEmbeds.add(made.west);
     made.posts = made.make();
     await made.posts.start();
     expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([first?.id]);
-    const ids = made.gateway.messagesIn(WEST_CHANNEL).map((one) => one.id);
+    const ids = made.gateway.messagesIn(made.west).map((one) => one.id);
     expect(ids).toHaveLength(1);
     expect(ids[0]).not.toBe(first?.id);
-    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.message.v2).not.toBe(true);
-    expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual(ids);
+    expect(made.gateway.messagesIn(made.west)[0]?.message.v2).not.toBe(true);
   });
 
   it('keeps its message when an edit fails after a restart for another reason (G1)', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
+    const [first] = made.gateway.messagesIn(made.west);
     await made.posts.close();
     made.gateway.failing.set('editMessage', new Error('503 Service Unavailable'));
     made.posts = made.make();
@@ -495,28 +539,26 @@ describe('StopPostService', () => {
     expect(made.gateway.deleted).toEqual([]);
     await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL).map((one) => one.id)).toEqual([first?.id]);
+    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual([first?.id]);
     expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
-    expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual([first?.id]);
   });
 
   it('sends the post anew as plain text once the bot may no longer embed (F3)', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
-    made.gateway.noEmbeds.add(WEST_CHANNEL);
+    const [first] = made.gateway.messagesIn(made.west);
+    made.gateway.noEmbeds.add(made.west);
     await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
     await made.posts.flush();
     expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([first?.id]);
-    const [plain] = made.gateway.messagesIn(WEST_CHANNEL).filter((one) => one.id !== first?.id);
+    const [plain] = made.gateway.messagesIn(made.west).filter((one) => one.id !== first?.id);
     expect(plain?.message.v2).not.toBe(true);
-    expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual([plain?.id]);
     expect(made.said().at(-1)).toContain('**Catch 7 Pokémon**');
   });
 
-  it('spills into a second and a third message, pinned too, then counts what is left', async () => {
-    made = postsWith();
+  it('spills into a second and a third message, then counts what is left', async () => {
+    made = await postsWith();
     const tasks = researchTasksOfPage();
     // At five stops of their own each, the page's tasks do not fit three messages even without
     // pictures (plan 8R-6: no task is cut for pictures).
@@ -529,13 +571,12 @@ describe('StopPostService', () => {
       );
     }
     await made.posts.flush();
-    const messages = made.gateway.messagesIn(WEST_CHANNEL);
+    const messages = made.gateway.messagesIn(made.west);
     expect(messages).toHaveLength(3);
     for (const { message } of messages) {
       if (!message.v2) throw new Error('the post is components v2 here');
       expectV2Sendable(message);
     }
-    expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual(messages.map((one) => one.id));
     expect(made.said()[2]).toMatch(/…and \d+ more tasks$/);
     expect(made.said()[1]).toMatch(/^-# Today’s Stops, continued \(2\)/);
     // A DM of a task links to the message that holds it; none for a task only counted.
@@ -544,15 +585,25 @@ describe('StopPostService', () => {
     const unshown = tasks.find(
       (task) => made?.said().every((text) => !text.includes(`**${task.text}**`)) === true,
     );
-    expect(await made.posts.messageOf(WEST_CHANNEL, shownIn(0)?.key ?? '')).toBe(messages[0]?.id);
-    expect(await made.posts.messageOf(WEST_CHANNEL, shownIn(2)?.key ?? '')).toBe(messages[2]?.id);
+    expect(await made.posts.messageOf(WEST_CHANNEL, shownIn(0)?.key ?? '')).toEqual({
+      channelId: made.west,
+      messageId: messages[0]?.id,
+    });
+    expect(await made.posts.messageOf(WEST_CHANNEL, shownIn(2)?.key ?? '')).toEqual({
+      channelId: made.west,
+      messageId: messages[2]?.id,
+    });
     expect(await made.posts.messageOf(EAST_CHANNEL, shownIn(0)?.key ?? '')).toBeUndefined();
     expect(unshown).toBeDefined();
-    expect(await made.posts.messageOf(WEST_CHANNEL, unshown?.key ?? '')).toBeUndefined();
+    // A task only counted: the post's first message, as `linkOf` (P9).
+    expect(await made.posts.messageOf(WEST_CHANNEL, unshown?.key ?? '')).toEqual({
+      channelId: made.west,
+      messageId: messages[0]?.id,
+    });
   });
 
   it('answers for one channel while another channel’s redraw is still on its way (R2)', async () => {
-    made = postsWith();
+    made = await postsWith();
     const task = pageTask('Catch a Dragon-type Pokémon');
     await made.report(task, [west(1), east]);
     await made.posts.flush();
@@ -560,8 +611,9 @@ describe('StopPostService', () => {
     let release = (): void => undefined;
     let eastHangs = false;
     const edit = made.gateway.editMessage.bind(made.gateway);
+    const eastBoard = made.east;
     made.gateway.editMessage = (channelId, messageId, message, options) => {
-      if (channelId !== EAST_CHANNEL) return edit(channelId, messageId, message, options);
+      if (channelId !== eastBoard) return edit(channelId, messageId, message, options);
       eastHangs = true;
       return new Promise((resolve) => {
         release = () => {
@@ -576,35 +628,41 @@ describe('StopPostService', () => {
     await made.reportStore.save({ ...shown, stop: reportedStop(91, { lat: 40.06, lon: -79.95 }) });
     made.setEvents([INTO_THE_WILD]);
     // Answered while East's redraw still waits (a hang here is the fault).
-    const id = await made.posts.messageOf(WEST_CHANNEL, task.key);
-    expect(id).toBe(made.gateway.messagesIn(WEST_CHANNEL)[0]?.id);
+    const link = await made.posts.messageOf(WEST_CHANNEL, task.key);
+    expect(link?.messageId).toBe(made.gateway.messagesIn(made.west)[0]?.id);
     expect(eastHangs).toBe(true);
     release();
     await made.posts.flush();
   });
 
   it('answers which message holds a task once the change that waits is drawn', async () => {
-    made = postsWith();
+    made = await postsWith();
     const task = pageTask('Catch a Dragon-type Pokémon');
     await made.report(task);
     // Not flushed: `messageOf` draws what waits for the channel first.
-    const id = await made.posts.messageOf(WEST_CHANNEL, task.key);
-    expect(id).toBe(made.gateway.messagesIn(WEST_CHANNEL)[0]?.id);
-    expect(id).toBeDefined();
+    const link = await made.posts.messageOf(WEST_CHANNEL, task.key);
+    expect(link?.messageId).toBe(made.gateway.messagesIn(made.west)[0]?.id);
+    expect(link?.messageId).toBeDefined();
   });
 
   it('says which message holds a task as last drawn, drawing nothing itself (plan 8R-3)', async () => {
-    made = postsWith();
+    made = await postsWith();
     const task = pageTask('Catch a Dragon-type Pokémon');
     await made.report(task);
     // Not drawn yet, and asking draws nothing: the map asks on every poll.
     expect(made.posts.linkOf(WEST_CHANNEL, task.key)).toBeUndefined();
-    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(made.gateway.messagesIn(made.west)).toEqual([]);
     await made.posts.flush();
-    const [post] = made.gateway.messagesIn(WEST_CHANNEL);
-    expect(made.posts.linkOf(WEST_CHANNEL, task.key)).toBe(post?.id);
+    const [post] = made.gateway.messagesIn(made.west);
+    expect(made.posts.linkOf(WEST_CHANNEL, task.key)).toEqual({
+      channelId: made.west,
+      messageId: post?.id,
+    });
     // A task the post does not hold (one counted only): its first message.
-    expect(made.posts.linkOf(WEST_CHANNEL, 'nothing')).toBe(post?.id);
+    expect(made.posts.linkOf(WEST_CHANNEL, 'nothing')).toEqual({
+      channelId: made.west,
+      messageId: post?.id,
+    });
     expect(made.posts.linkOf(EAST_CHANNEL, task.key)).toBeUndefined();
     // Past midnight, before the timer draws the posts anew: yesterday's post is no link.
     made.clock.now = at('2026-11-22T00:00:01');
@@ -613,35 +671,247 @@ describe('StopPostService', () => {
   });
 
   it('is plain text where the bot may not post embeds', async () => {
-    made = postsWith();
-    made.gateway.noEmbeds.add(WEST_CHANNEL);
+    made = await postsWith();
+    made.gateway.noEmbeds.add(made.west);
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    const [message] = made.gateway.messagesIn(WEST_CHANNEL);
+    const [message] = made.gateway.messagesIn(made.west);
     expect(message?.message.v2).not.toBe(true);
     expect(made.said()[0]).toContain('**Catch a Dragon-type Pokémon**');
   });
 
-  it('stands unpinned where the bot may not pin, said once in the log', async () => {
-    made = postsWith();
-    made.gateway.noPinning.add(WEST_CHANNEL);
+  it('is plain text where the bot may not embed in the board’s forum (B6)', async () => {
+    made = await postsWith();
+    made.gateway.noEmbeds.add(WEST_FORUM);
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    made.gateway.noPinning.delete(WEST_CHANNEL);
-    made.gateway.pinLimit = 0;
-    for (let n = 0; n < 30; n++) await made.report(researchTasksOfPage()[n]!, [west(n)]);
+    const [message] = made.gateway.messagesIn(made.west);
+    expect(message?.message.v2).not.toBe(true);
+  });
+
+  it('writes nothing where the bot may not write in the locked board, said once (B6)', async () => {
+    made = await postsWith();
+    made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL).length).toBeGreaterThan(1);
-    expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual([]);
+    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
+    await made.posts.flush();
+    expect(made.gateway.messagesIn(made.west)).toEqual([]);
+    expect(made.posts.summaryOf(WEST_CHANNEL)).toBeUndefined();
+    expect(await made.posts.messageOf(WEST_CHANNEL, pageTask('Catch 7 Pokémon').key)).toBe(
+      undefined,
+    );
     expect(
-      made.entries.filter((entry) =>
-        String(entry.msg).includes('the post of the stops stands unpinned'),
-      ),
+      made.entries.filter((entry) => entry.msg === 'the bot may not write in the board post'),
+    ).toHaveLength(1);
+    // Allowed again: the post is drawn at the next change.
+    made.gateway.refusePosts.delete(WEST_FORUM);
+    await made.report(pageTask('Catch 7 Pokémon'), [west(3)]);
+    await made.posts.flush();
+    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
+  });
+
+  it('draws nothing while the region has no board, said once, and draws it when it comes (B10)', async () => {
+    made = await postsWith();
+    const westRegion = made.regions.find((region) => region.channelId === WEST_CHANNEL)!;
+    westRegion.summaryMessageId = null;
+    await made.report(pageTask('Catch a Dragon-type Pokémon'));
+    await made.posts.flush();
+    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
+    await made.posts.flush();
+    expect(made.gateway.messages).toEqual([]);
+    expect(
+      made.entries.filter((entry) => entry.msg === 'the region has no board post'),
     ).toHaveLength(1);
+    // The board is there again: a turn-over (here the catch-up) draws the region told as
+    // undrawn (P6), without a report or a word from the party service.
+    westRegion.summaryMessageId = made.west;
+    await made.posts.catchUp();
+    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
+  });
+
+  it('draws the region’s post when the party service makes its board (B2)', async () => {
+    made = await postsWith();
+    const westRegion = made.regions.find((region) => region.channelId === WEST_CHANNEL)!;
+    westRegion.summaryMessageId = null;
+    await made.report(pageTask('Catch 7 Pokémon'));
+    await made.posts.flush();
+    westRegion.summaryMessageId = made.west;
+    made.posts.boardChanged(WEST_CHANNEL);
+    await made.posts.flush();
+    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
+  });
+
+  it('tells the summary when the board is gone, so that it is made anew (P2)', async () => {
+    made = await postsWith();
+    await made.report(pageTask('Catch 7 Pokémon'));
+    await made.posts.flush();
+    // The board was deleted by hand: the edit finds no message, the send no thread.
+    made.gateway.gone.add(made.west);
+    made.changes.length = 0;
+    await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(2)]);
+    await made.posts.flush();
+    expect(made.changes).toContain(WEST_CHANNEL);
+  });
+
+  it('sends every message anew into a board that replaced the one it was drawn in (B2)', async () => {
+    made = await postsWith();
+    const tasks = researchTasksOfPage();
+    for (let n = 0; n < 30; n++) await made.report(tasks[n]!, [west(n)]);
+    await made.posts.flush();
+    const old = made.gateway.messagesIn(made.west).map((one) => one.id);
+    expect(old.length).toBeGreaterThan(1);
+    // The summary post was replaced (deleted with its thread, a new one made).
+    const westRegion = made.regions.find((region) => region.channelId === WEST_CHANNEL)!;
+    const replaced = await made.board(WEST_FORUM);
+    westRegion.summaryMessageId = replaced;
+    made.posts.boardChanged(WEST_CHANNEL);
+    await made.posts.flush();
+    expect(made.gateway.messagesIn(replaced)).toHaveLength(old.length);
+    expect(made.said(replaced)[0]).toContain('## Today’s Stops');
+    // The old board's messages went (P5): a post taken over must not keep a second copy.
+    expect(made.gateway.messagesIn(made.west)).toEqual([]);
+    expect([...made.storage.rows.values()]).toEqual([
+      expect.objectContaining({
+        threadId: replaced,
+        messageIds: made.gateway.messagesIn(replaced).map((one) => one.id),
+      }),
+    ]);
+    expect((await made.posts.messageOf(WEST_CHANNEL, tasks[0]!.key))?.channelId).toBe(replaced);
+  });
+
+  it('never opens an archived old board to clear it (review R2)', async () => {
+    made = await postsWith();
+    await made.report(pageTask('Catch 7 Pokémon'));
+    await made.posts.flush();
+    // The old board was archived (a post taken over left it), and another one recorded.
+    await made.gateway.archivePost(made.west);
+    const westRegion = made.regions.find((region) => region.channelId === WEST_CHANNEL)!;
+    const replaced = await made.board(WEST_FORUM);
+    westRegion.summaryMessageId = replaced;
+    made.posts.boardChanged(WEST_CHANNEL);
+    await made.posts.flush();
+    expect(made.gateway.posts.get(made.west)).toMatchObject({ archived: true, reopened: 0 });
+    expect(made.said(replaced)[0]).toContain('**Catch 7 Pokémon**');
+    expect([...made.storage.rows.values()]).toEqual([
+      expect.objectContaining({ threadId: replaced }),
+    ]);
+  });
+
+  it('sends a message anew with every message after it, so the order stays (B5)', async () => {
+    made = await postsWith();
+    const tasks = researchTasksOfPage();
+    const spread = (k: number) =>
+      reportedStop(k, { lat: 40.01 + (k % 80) / 1_000, lon: -80.09 + Math.floor(k / 80) / 1_000 });
+    for (const [n, task] of tasks.entries()) {
+      await made.report(
+        task,
+        Array.from({ length: 5 }, (_, i) => spread(n * 5 + i)),
+      );
+    }
+    await made.posts.flush();
+    const [first, second, third] = made.gateway.messagesIn(made.west).map((one) => one.id);
+    expect(third).toBeDefined();
+    await made.posts.close();
+    // The second message was deleted by hand while the bot was down.
+    made.gateway.gone.add(second ?? '');
+    made.posts = made.make();
+    await made.posts.start();
+    const now = made.gateway.messagesIn(made.west).filter((one) => !made?.gateway.gone.has(one.id));
+    expect(now.map((one) => one.id)[0]).toBe(first);
+    expect(now).toHaveLength(3);
+    expect(now.map((one) => one.id)).not.toContain(third);
+    expect(made.gateway.deleted.map((one) => one.messageId)).toContain(third);
+    expect(made.said()[1]).toContain('Today’s Stops, continued (2)');
+  });
+
+  it('moves a pinned post of the text channel into the board at start, older days’ too (B11)', async () => {
+    made = await postsWith();
+    await made.posts.close();
+    // What the bot before plan 8R-9 left: today's post pinned in the text channel, and
+    // yesterday's, whose delete failed.
+    const today = (await made.gateway.sendMessage(WEST_CHANNEL, { content: 'Old post' })) ?? '';
+    const yesterday = (await made.gateway.sendMessage(WEST_CHANNEL, { content: 'Older' })) ?? '';
+    made.gateway.pin(WEST_CHANNEL, today);
+    made.gateway.pin(WEST_CHANNEL, yesterday);
+    for (const [day, id] of [
+      ['2026-11-20', yesterday],
+      ['2026-11-21', today],
+    ] as const) {
+      await made.storage.save({
+        channelId: WEST_CHANNEL,
+        day,
+        serverId: FAKE_GUILD_ID,
+        threadId: null,
+        messageIds: [id],
+        leftover: [],
+        updatedAt: at(`${day}T09:00`),
+      });
+    }
+    await made.report(pageTask('Catch 7 Pokémon'));
+    made.posts = made.make();
+    await made.posts.start();
+    expect(made.gateway.deleted.map((one) => one.messageId).sort()).toEqual(
+      [today, yesterday].sort(),
+    );
+    expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual([]);
+    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
+    expect([...made.storage.rows.values()]).toEqual([
+      expect.objectContaining({ day: '2026-11-21', threadId: made.west }),
+    ]);
+  });
+
+  it('keeps an old post whose delete fails, and deletes it at the next catch-up (P1)', async () => {
+    made = await postsWith();
+    await made.posts.close();
+    const old = (await made.gateway.sendMessage(WEST_CHANNEL, { content: 'Old post' })) ?? '';
+    await made.storage.save({
+      channelId: WEST_CHANNEL,
+      day: '2026-11-21',
+      serverId: FAKE_GUILD_ID,
+      threadId: null,
+      messageIds: [old],
+      leftover: [],
+      updatedAt: at('2026-11-21T09:00'),
+    });
+    await made.report(pageTask('Catch 7 Pokémon'));
+    made.gateway.failing.set('deleteMessage', networkAway());
+    made.posts = made.make();
+    await made.posts.start();
+    // Today's post is drawn in the board all the same; the old message stays kept with it.
+    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
+    expect([...made.storage.rows.values()]).toEqual([
+      expect.objectContaining({ threadId: made.west, leftover: [old] }),
+    ]);
+    made.gateway.failing.clear();
+    await made.posts.catchUp();
+    expect(made.gateway.deleted.map((one) => one.messageId)).toContain(old);
+    expect([...made.storage.rows.values()]).toEqual([
+      expect.objectContaining({ threadId: made.west, leftover: [] }),
+    ]);
+  });
+
+  it('keeps yesterday’s row when its delete fails at midnight, and deletes it at start (P1)', async () => {
+    made = await postsWith();
+    await made.report(pageTask('Catch 7 Pokémon'));
+    await made.posts.flush();
+    const [first] = made.gateway.messagesIn(made.west);
+    await made.posts.close();
+    made.clock.now = at('2026-11-22T08:00');
+    made.gateway.failing.set('deleteMessage', networkAway());
+    made.posts = made.make();
+    await made.posts.start();
+    expect([...made.storage.rows.values()].map((row) => row.day)).toEqual(['2026-11-21']);
+    made.gateway.failing.clear();
+    await made.posts.close();
+    made.posts = made.make();
+    await made.posts.start();
+    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([first?.id]);
+    expect(made.storage.rows.size).toBe(0);
   });
 
   it('under an intra-day event, shows its tasks, then the day’s research and when it comes back', async () => {
-    made = postsWith([PAWNIARD_DAY]);
+    made = await postsWith([PAWNIARD_DAY]);
     await made.report(pageTask('Catch 7 Pokémon'), [west(1), west(2)]);
     made.clock.now = at('2026-11-21T15:00');
     await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(3)]);
@@ -657,7 +927,7 @@ describe('StopPostService', () => {
   });
 
   it('tells the summary of the day’s research waiting under a window, and when it comes back', async () => {
-    made = postsWith([PAWNIARD_DAY]);
+    made = await postsWith([PAWNIARD_DAY]);
     await made.report(pageTask('Catch 7 Pokémon'), [west(1), west(2)]);
     await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(3)]);
     // Drawn under the window: only the day's research, waiting; the summary links it all the same.
@@ -675,11 +945,11 @@ describe('StopPostService', () => {
     const prepared: { sources: string[]; sentBefore: number }[] = [];
     const looked = (source: string) =>
       `https://map.example.test/pictures/${String(source.length)}.png`;
-    made = postsWith([], {
+    made = await postsWith([], {
       prepare: (sources) => {
         prepared.push({
           sources: [...sources],
-          sentBefore: made?.gateway.messagesIn(WEST_CHANNEL).length ?? -1,
+          sentBefore: made?.gateway.messagesIn(made.west).length ?? -1,
         });
         return Promise.resolve();
       },
@@ -692,13 +962,13 @@ describe('StopPostService', () => {
     await made.posts.flush();
     const source = lileep.rewards[0]?.image ?? '';
     expect(prepared).toEqual([{ sources: [source], sentBefore: 0 }]);
-    const [post] = made.gateway.messagesIn(WEST_CHANNEL);
+    const [post] = made.gateway.messagesIn(made.west);
     expect(JSON.stringify(post?.message)).toContain(looked(source));
     expect(JSON.stringify(post?.message)).not.toContain(source);
   });
 
   it('says a multi-day event’s tasks hold until midnight, and its last day’s until its hour (B7)', async () => {
-    made = postsWith([INTO_THE_WILD]);
+    made = await postsWith([INTO_THE_WILD]);
     made.clock.now = at('2026-11-10T12:00');
     await made.report(pageTask('Catch 7 Pokémon'));
     await made.posts.flush();
@@ -711,42 +981,65 @@ describe('StopPostService', () => {
     );
   });
 
-  it('unpins and deletes the post once its day has ended, and at start one a restart left', async () => {
-    made = postsWith();
+  it('deletes the post once its day has ended, and at start one a restart left', async () => {
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
+    const [first] = made.gateway.messagesIn(made.west);
     await made.posts.close();
-    // A restart after midnight: the post of yesterday goes.
+    // A restart after midnight: the post of yesterday goes, from the board.
     made.clock.now = at('2026-11-22T08:00');
     made.posts = made.make();
     await made.posts.start();
-    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([first?.id]);
-    expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual([]);
+    expect(made.gateway.deleted).toEqual([{ channelId: made.west, messageId: first?.id }]);
+    expect(made.storage.rows.size).toBe(0);
+  });
+
+  it('forgets a post whose delete Discord refuses for good, said once (review R1)', async () => {
+    made = await postsWith();
+    await made.report(pageTask('Catch a Dragon-type Pokémon'));
+    await made.posts.flush();
+    await made.posts.close();
+    // An old message pinned in the text channel too, which the bot may not delete either.
+    const old = (await made.gateway.sendMessage(WEST_CHANNEL, { content: 'Old post' })) ?? '';
+    const [row] = [...made.storage.rows.values()];
+    if (!row) throw new Error('no row');
+    await made.storage.save({ ...row, leftover: [old] });
+    made.gateway.failing.set('deleteMessage', missingPermissions('DELETE'));
+    made.clock.now = at('2026-11-22T08:00');
+    made.posts = made.make();
+    await made.posts.start();
+    await made.posts.catchUp();
     expect(made.storage.rows.size).toBe(0);
+    expect(
+      made.entries.filter(
+        (entry) => entry.msg === 'the bot may not delete a message of the post of the stops',
+      ),
+    ).toHaveLength(1);
+    made.gateway.failing.clear();
   });
 
   it('deletes the post at midnight by its timer, computed in the zone', async () => {
     vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
-    made = postsWith();
+    made = await postsWith();
     await made.posts.start();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
+    expect(made.gateway.messagesIn(made.west)).toHaveLength(1);
     await vi.advanceTimersByTimeAsync(at('2026-11-22T00:00') - made.clock.now - 1_000);
     expect(made.gateway.deleted).toEqual([]);
     made.clock.now = at('2026-11-22T00:00:01');
     await vi.advanceTimersByTimeAsync(2_000);
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(made.gateway.messagesIn(made.west)).toEqual([]);
     expect(made.storage.rows.size).toBe(0);
   });
 
   it('draws today’s post at start where yesterday’s stood (A2)', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    const [yesterday] = made.gateway.messagesIn(WEST_CHANNEL);
+    const [yesterday] = made.gateway.messagesIn(made.west);
     await made.posts.close();
     // After midnight, a report stands while no post service listened (a restart).
     made.clock.now = at('2026-11-22T08:00');
@@ -760,7 +1053,7 @@ describe('StopPostService', () => {
 
   it('draws the posts anew when the research events change, and keeps its timer (A5)', async () => {
     vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
-    made = postsWith();
+    made = await postsWith();
     await made.posts.start();
     await made.report(pageTask('Catch 7 Pokémon'));
     await made.posts.flush();
@@ -779,7 +1072,7 @@ describe('StopPostService', () => {
 
   it('warns, not errs, when the network fails the turn-over at a period change (review F5)', async () => {
     vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
-    made = postsWith();
+    made = await postsWith();
     await made.posts.start();
     await made.report(pageTask('Catch 7 Pokémon'));
     await made.posts.flush();
@@ -799,33 +1092,34 @@ describe('StopPostService', () => {
 
   it('keeps its timer when its start cannot read the kept posts (A5)', async () => {
     vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
-    made = postsWith();
+    made = await postsWith();
     made.storage.failing.set('all', new Error('database is down'));
     await expect(made.posts.start()).rejects.toThrow('database is down');
     expect(vi.getTimerCount()).toBe(1);
     made.storage.failing.clear();
   });
 
-  it('keeps a message of the post before it pins it (A9)', async () => {
-    made = postsWith();
+  it('keeps each message of the post as soon as it is sent (A9)', async () => {
+    made = await postsWith();
     const kept: string[][] = [];
-    const pin = made.gateway.pinMessage.bind(made.gateway);
+    const send = made.gateway.sendMessage.bind(made.gateway);
     const { storage } = made;
-    made.gateway.pinMessage = (channelId, messageId) => {
+    made.gateway.sendMessage = (channelId, message, options) => {
       kept.push([...storage.rows.values()].flatMap((row) => row.messageIds));
-      return pin(channelId, messageId);
+      return send(channelId, message, options);
     };
-    await made.report(pageTask('Catch a Dragon-type Pokémon'));
+    for (let n = 0; n < 30; n++) await made.report(researchTasksOfPage()[n]!, [west(n)]);
     await made.posts.flush();
-    const [message] = made.gateway.messagesIn(WEST_CHANNEL);
-    expect(kept).toEqual([[message?.id]]);
+    const [first] = made.gateway.messagesIn(made.west);
+    // The second message is sent with the first one kept already.
+    expect(kept.slice(0, 2)).toEqual([[], [first?.id]]);
   });
 
   it('draws the kept post, not a second one, at a report after a failed start (F6)', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
+    const [first] = made.gateway.messagesIn(made.west);
     await made.posts.close();
     made.posts = made.make();
     made.storage.failing.set('all', new Error('database is down'));
@@ -833,15 +1127,15 @@ describe('StopPostService', () => {
     made.storage.failing.clear();
     await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
     await made.posts.flush();
-    expect(made.gateway.messagesIn(WEST_CHANNEL).map((one) => one.id)).toEqual([first?.id]);
+    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual([first?.id]);
     expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
   });
 
   it('draws the kept post, not a second one, at a report while the start reads (F6)', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
+    const [first] = made.gateway.messagesIn(made.west);
     await made.posts.close();
     // The start's read of the kept posts is slow: what it read (one message) comes after the
     // reports have been drawn, the post spilling into a second message meanwhile.
@@ -864,50 +1158,50 @@ describe('StopPostService', () => {
       await made.report(task, [west(n + 2)]);
     }
     await made.posts.messageOf(WEST_CHANNEL, '');
-    const drawn = made.gateway.messagesIn(WEST_CHANNEL).map((one) => one.id);
+    const drawn = made.gateway.messagesIn(made.west).map((one) => one.id);
     expect(drawn.length).toBeGreaterThan(1);
     expect(drawn[0]).toBe(first?.id);
     release();
     await started;
     await made.posts.flush();
     // The stale read did not take the place of what was drawn: no message sent again.
-    expect(made.gateway.messagesIn(WEST_CHANNEL).map((one) => one.id)).toEqual(drawn);
-    expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual(drawn);
+    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual(drawn);
     expect([...made.storage.rows.values()].map((row) => row.messageIds)).toEqual([drawn]);
     expect(made.gateway.deleted).toEqual([]);
   });
 
   it('deletes at start an older post of a channel beside a newer one (G3)', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
-    const [today] = made.gateway.messagesIn(WEST_CHANNEL);
+    const [today] = made.gateway.messagesIn(made.west);
     await made.posts.close();
     // A post of the day before whose row a failed delete left, beside today's.
-    const older = (await made.gateway.sendMessage(WEST_CHANNEL, { content: 'Older post' })) ?? '';
-    await made.gateway.pinMessage(WEST_CHANNEL, older);
+    const older = (await made.gateway.sendMessage(made.west, { content: 'Older post' })) ?? '';
     await made.storage.save({
       channelId: WEST_CHANNEL,
       day: '2026-11-20',
       serverId: FAKE_GUILD_ID,
+      threadId: made.west,
       messageIds: [older],
+      leftover: [],
       updatedAt: at('2026-11-20T12:00'),
     });
     made.posts = made.make();
     await made.posts.start();
     expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([older]);
-    expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual([today?.id]);
+    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual([today?.id]);
     expect([...made.storage.rows.values()].map((row) => row.day)).toEqual(['2026-11-21']);
   });
 
   it('draws today’s post anew at start', async () => {
-    made = postsWith();
+    made = await postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
     await made.posts.close();
     made.posts = made.make();
     await made.posts.start();
-    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
-    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits).toBe(1);
+    expect(made.gateway.messagesIn(made.west)).toHaveLength(1);
+    expect(made.gateway.messagesIn(made.west)[0]?.edits).toBe(1);
   });
 });
diff --git a/src/services/stop-posts.ts b/src/services/stop-posts.ts
index 924409d9..d6622c85 100644
--- a/src/services/stop-posts.ts
+++ b/src/services/stop-posts.ts
@@ -3,6 +3,7 @@ import { DateTime } from 'luxon';
 import { containment } from '@pine/wayspot-core/region-membership';
 import type { StopPostRecord, StopPostStorage } from '../db/repositories/stop-post-repository.js';
 import {
+  isMissingPermission,
   isRefusedBody,
   type OutgoingMessage,
   type PartyGateway,
@@ -42,6 +43,15 @@ import { isHideoutReport, type StopReportService } from './stop-reports.js';
 /** How long after the last change of a channel's reports its post is drawn (design 6). */
 export const POST_DELAY_MS = 3_000;
 
+/**
+ * Where a message of the post is (plan 8R-9, B1): the board post (a thread) and the message in
+ * it. A link to it is `https://discord.com/channels/<server>/<channelId>/<messageId>`.
+ */
+export interface PostLink {
+  channelId: string;
+  messageId: string;
+}
+
 /** The longest delay `setTimeout` accepts. */
 const MAX_TIMER_MS = 2 ** 31 - 1;
 
@@ -51,11 +61,17 @@ export interface StopPostServiceOptions {
   reports: Pick<StopReportService, 'standing' | 'period' | 'listen' | 'versionOf'>;
   events: ResearchEventProvider;
   regions: { all(): readonly Region[] };
-  /** The row of a server in `Guild` (its regions name it so), by its snowflake. */
-  guilds: { idFor(serverId: string): Promise<number | undefined> };
+  /**
+   * The row of a server in `Guild` (its regions name it so), by its snowflake, and the snowflake
+   * by the row (a board made for a region with no post yet, plan 8R-9).
+   */
+  guilds: {
+    idFor(serverId: string): Promise<number | undefined>;
+    snowflakeOf(id: number): Promise<string | undefined>;
+  };
   gateway: Pick<
     PartyGateway,
-    'sendMessage' | 'editMessage' | 'deleteMessage' | 'pinMessage' | 'unpinMessage' | 'mayPost'
+    'sendMessage' | 'editMessage' | 'deleteMessage' | 'unpinMessage' | 'postAccess'
   >;
   /** `settings.timezone`: the local day and its midnight. */
   zone: string;
@@ -76,19 +92,21 @@ export interface StopPostServiceOptions {
 }
 
 /**
- * The pinned post "Today’s Stops" of every region channel (plan 8R-1; design 6, 9.5–9.7,
- * 9.11): the research of the period on, then the day's Team GO Rocket hideouts (plan 8R-2; a
- * grunt has a message of its own and is not shown here); made at the first report of the day in
- * the region (research or hideout), pinned (Discord's notice of the pin
- * deleted where the bot may; a channel at the pin limit, or a bot without Pin Messages, gets it
- * unpinned, logged), drawn anew a few seconds after the reports change (`POST_DELAY_MS`,
- * coalesced), spilling into a second and third message as it grows, and unpinned and deleted
- * once its day has ended. One queue per channel does all of it, the midnight delete included;
- * nothing is sent to Discord while a database lock is held (the reads are done first). A
- * timer at the next period change (midnight, an event's start or end: `nextPeriodChange`, with
- * Luxon in `settings.timezone`) draws the posts anew and deletes those of a day that ended;
- * `start` does the same for what a restart left. Where the bot may not post embeds the post is
- * plain text, as `spawnTextMessage`. Rehearsal mode makes none: the bot does not start it.
+ * The post "Today’s Stops" of every region channel (plan 8R-1; design 6, 9.5–9.7, 9.11): the
+ * research of the period on, then the day's Team GO Rocket hideouts (plan 8R-2; a grunt has a
+ * message of its own and is not shown here); made at the first report of the day in the region
+ * (research or hideout), in the region's board (plan 8R-9: its locked summary post, the thread of
+ * `Region.summaryMessageId`), below the summary, sent without notifying anybody (B13); drawn
+ * anew a few seconds after the reports change (`POST_DELAY_MS`, coalesced), spilling into a
+ * second and third message as it grows, and deleted once its day has ended. One queue per
+ * channel does all of it, the midnight delete included; nothing is sent to Discord while a
+ * database lock is held (the reads are done first). A timer at the next period change (midnight,
+ * an event's start or end: `nextPeriodChange`, with Luxon in `settings.timezone`) draws the
+ * posts anew and deletes those of a day that ended; `start` does the same for what a restart
+ * left. Where the bot may not embed in the board's forum the post is plain text, as
+ * `spawnTextMessage`; where it may not write there at all (`postAccess`, B6), or the region has
+ * no board (B10), nothing is drawn and that is said once. Rehearsal mode makes none: the bot
+ * does not start it.
  */
 export class StopPostService {
   private readonly now: () => number;
@@ -115,8 +133,18 @@ export class StopPostService {
   private readonly asking = new Set<Promise<void>>();
   /** The redraws of every post a change of the research events started (`flush` waits). */
   private readonly redraws = new Set<Promise<void>>();
-  /** Channels where pinning was refused, said once each in the log. */
-  private readonly pinRefusalsTold = new Set<string>();
+  /**
+   * Channels whose post could not be drawn for want of a board (B10) or of the permissions to
+   * write in it (B6), said once each in the log until it is drawn again.
+   */
+  private readonly undrawnTold = new Map<string, 'no-board' | 'refused'>();
+  /**
+   * Posts of ended days whose delete failed (review P1), by `<channel> <day>`: their rows stay,
+   * and the next turn-over (the timer, the catch-up) deletes them again.
+   */
+  private readonly leftovers = new Map<string, StopPostRecord>();
+  /** Channels where Discord refused a delete for good (review R1), said once each. */
+  private readonly deleteRefusalsTold = new Set<string>();
 
   constructor(private readonly options: StopPostServiceOptions) {
     this.now = options.now ?? (() => Date.now());
@@ -131,8 +159,7 @@ export class StopPostService {
     });
     options.reports.listen({
       changed: (serverId, stops) => {
-        const asking = this.changed(serverId, stops).finally(() => this.asking.delete(asking));
-        this.asking.add(asking);
+        this.ask(this.changed(serverId, stops));
       },
     });
     // Another event, or one moved or gone (review A5): the timer and every post follow.
@@ -149,6 +176,12 @@ export class StopPostService {
     });
   }
 
+  /** Keeps a change on its way to the queue, for `messageOf` and `flush` to wait for. */
+  private ask(asking: Promise<void>): void {
+    const kept = asking.finally(() => this.asking.delete(kept));
+    this.asking.add(kept);
+  }
+
   /** The local day of a moment, `yyyy-mm-dd`. */
   private dayOf(time: number): string {
     return DateTime.fromMillis(time, { zone: this.options.zone }).toISODate() ?? '';
@@ -172,6 +205,32 @@ export class StopPostService {
     }
   }
 
+  /**
+   * The region of this channel has another board post, or one at last (plan 8R-9, B2: the party
+   * service made its summary, or took one over): its post is drawn anew there, every message
+   * sent again where the board changed; a region with nothing reported today gets none.
+   */
+  boardChanged(channelId: string): void {
+    if (this.closed) return;
+    this.ask(
+      (async () => {
+        const serverId = await this.serverOf(channelId);
+        if (serverId !== undefined) this.gathered.later(channelId, () => serverId);
+      })().catch((err: unknown) => {
+        this.options.log.warn({ err, channel: channelId }, 'could not find the post of the stops');
+      }),
+    );
+  }
+
+  /** The server of a region channel: its kept post's, else its region's by the row. */
+  private async serverOf(channelId: string): Promise<string | undefined> {
+    const kept = this.posts.get(channelId);
+    if (kept) return kept.serverId;
+    const region = this.options.regions.all().find((one) => one.channelId === channelId);
+    if (region?.guildId === null || region?.guildId === undefined) return undefined;
+    return this.options.guilds.snowflakeOf(region.guildId);
+  }
+
   /**
    * At start: the kept posts read, every one drawn as things stand now (a day that has ended
    * deleted, today's made where reports stand); then the timer of the next period change, which
@@ -188,13 +247,14 @@ export class StopPostService {
     // The last of each channel (they come by day); a channel a report has drawn meanwhile
     // keeps what it drew (review F6).
     const read = new Map<string, StopPostRecord>();
-    for (const post of rows) read.set(post.channelId, post);
+    for (const post of rows.map(fromStorage)) read.set(post.channelId, post);
     for (const [channelId, post] of read) {
       if (!this.posts.has(channelId)) this.posts.set(channelId, post);
     }
-    // A post older than its channel's newest (one whose delete failed at its midnight) is
-    // deleted now, or its messages would stand pinned for good (review G3).
-    const older = rows.filter((post) => {
+    // A post older than its channel's newest (one whose delete failed at its midnight, or one
+    // the bot before plan 8R-9 pinned in the channel, B11) is deleted now, or its messages would
+    // stand for good (review G3).
+    const older = rows.map(fromStorage).filter((post) => {
       const newest = this.posts.get(post.channelId);
       return newest !== undefined && post.day < newest.day;
     });
@@ -215,16 +275,31 @@ export class StopPostService {
 
   /**
    * Draws every kept post as things stand now (review A2: `draw` deletes the post of a day that
-   * ended and makes today's where reports stand, none where nothing does), and waits for the
-   * next change.
+   * ended and makes today's where reports stand, none where nothing does), and the regions told
+   * as undrawn (review P6: no board, or no right to write in it, then); deletes again the posts of
+   * ended days whose delete failed (review P1); and waits for the next change.
    */
   private async turnOver(): Promise<void> {
     try {
-      await Promise.all(
-        [...this.posts.values()].map((post) =>
+      const undrawn = [...this.undrawnTold.keys()].filter(
+        (channelId) => !this.posts.has(channelId),
+      );
+      await Promise.all([
+        ...[...this.posts.values()].map((post) =>
           this.queue.run(post.channelId, () => this.draw(post.channelId, post.serverId)),
         ),
-      );
+        ...[...this.leftovers.values()].map((post) =>
+          this.queue.run(post.channelId, async () => {
+            await this.remove(post);
+          }),
+        ),
+        ...undrawn.map(async (channelId) => {
+          const serverId = await this.serverOf(channelId);
+          if (serverId !== undefined) {
+            await this.queue.run(channelId, () => this.draw(channelId, serverId));
+          }
+        }),
+      ]);
     } finally {
       this.schedule();
     }
@@ -256,9 +331,8 @@ export class StopPostService {
   }
 
   /** The view of a channel's post: the reports of the period on now whose stop lies in its region. */
-  private async view(channelId: string, serverId: string): Promise<StopPostView | undefined> {
-    const region = this.options.regions.all().find((one) => one.channelId === channelId);
-    if (!region?.bounds) return undefined;
+  private async view(region: Region, serverId: string): Promise<StopPostView | undefined> {
+    if (!region.bounds) return undefined;
     const inside = containment(region.bounds);
     const now = this.now();
     const period = this.options.reports.period(now);
@@ -287,27 +361,72 @@ export class StopPostService {
     };
   }
 
+  /**
+   * The post is not drawn (B6, B10): what the summary and the links read of it is forgotten, and
+   * why is said once in the log while it lasts.
+   */
+  private undrawn(channelId: string, why: 'no-board' | 'refused', threadId?: string): void {
+    const shown = this.counts.delete(channelId) || this.holding.delete(channelId);
+    this.holding.delete(channelId);
+    if (shown) this.options.changed?.(channelId);
+    if (this.undrawnTold.get(channelId) === why) return;
+    this.undrawnTold.set(channelId, why);
+    if (why === 'no-board') {
+      this.options.log.warn({ channel: channelId }, 'the region has no board post');
+    } else {
+      this.options.log.warn(
+        { channel: channelId, post: threadId },
+        'the bot may not write in the board post',
+      );
+    }
+  }
+
   /** Draws a channel's post as its reports are now; in the channel's queue. */
   private async draw(channelId: string, serverId: string): Promise<void> {
     const { gateway, storage, log } = this.options;
     const day = this.dayOf(this.now());
-    const kept = this.posts.get(channelId) ?? (await this.recall(channelId, day));
+    let kept = this.posts.get(channelId) ?? (await this.recall(channelId, day));
+    // A post of a day that ended goes (its row stays where a delete failed, review P1).
     if (kept && kept.day !== day) {
       await this.remove(kept);
+      kept = undefined;
     }
-    const view = await this.view(channelId, serverId);
-    const post = this.posts.get(channelId);
-    if (!view) return;
+    // The messages of a post the bot before plan 8R-9 pinned in the region's channel (B11), and
+    // those whose delete failed before (P1): deleted now, those that fail again kept with the post.
+    const held = kept?.leftover ?? [];
+    const leftover = held.length === 0 ? [] : await this.clear(channelId, held);
+    // A row of such messages alone (no board post drawn yet) is no post.
+    if (kept?.threadId === null) kept = undefined;
+    const region = this.options.regions.all().find((one) => one.channelId === channelId);
+    const view = region ? await this.view(region, serverId) : undefined;
     // Nothing reported and no post yet: none is made (design 6: at the first report, research or
     // hideout).
     const empty =
-      view.tasks.length === 0 &&
-      (view.hideouts ?? []).length === 0 &&
-      (view.waiting?.tasks ?? []).length === 0;
-    if (!post && empty) return;
+      view === undefined ||
+      (view.tasks.length === 0 &&
+        (view.hideouts ?? []).length === 0 &&
+        (view.waiting?.tasks ?? []).length === 0);
+    const threadId =
+      region === undefined || region.forumChannelId === null ? null : region.summaryMessageId;
+    const access = threadId === null ? undefined : await gateway.postAccess(threadId);
+    if (!view || (!kept && empty) || threadId === null || access === 'refused') {
+      await this.keepLeftover(channelId, day, serverId, held, leftover);
+      if (!view || (!kept && empty)) return;
+      if (threadId === null) this.undrawn(channelId, 'no-board');
+      else this.undrawn(channelId, 'refused', threadId);
+      return;
+    }
+    this.undrawnTold.delete(channelId);
     const { pictures } = this.options;
     let layout: PostLayout<OutgoingMessage>;
-    if (gateway.mayPost(channelId)) {
+    // A board replaced or taken over (B2): the old one's messages go first (review P5: a post
+    // taken over must not keep a second copy; a thread that is gone is fine).
+    if (kept?.threadId && kept.threadId !== threadId) {
+      // Never opened for it (review R2): an archived old board refuses the delete (50083), which
+      // is logged and accepted, so that no old board is left open.
+      await this.deleteAll(kept.threadId, kept.messageIds, false);
+    }
+    if (access === 'v2') {
       // The pictures made first (plan 8R-6): one not ready names the feed's address till the next.
       // Both laid out with the same lookup: a source gone frees its place for the next picture.
       const lookup = pictures ? (source: string) => pictures.url(source) : undefined;
@@ -318,40 +437,54 @@ export class StopPostService {
     }
     const { messages } = layout;
     const ids: string[] = [];
-    const before = post?.messageIds ?? [];
+    // Another board than the one drawn in (B2: the summary replaced or taken over): every
+    // message is sent anew there; the old ones went with their thread, or stay in a post that is
+    // no longer the region's.
+    const before = kept?.threadId === threadId ? kept.messageIds : [];
+    // Set once a message is sent anew in its place: those after it are deleted, and sent anew
+    // below it (B5: in a locked post only the bot writes, so a message sent lands last).
+    let anew = false;
     // The messages drawn so far, then those of the post not reached yet.
     const sofar = (): StopPostRecord => ({
       channelId,
       day,
       serverId,
-      messageIds: [...ids, ...before.slice(ids.length)],
+      threadId,
+      messageIds: anew ? [...ids] : [...ids, ...before.slice(ids.length)],
+      leftover,
       updatedAt: this.now(),
     });
     try {
       for (const [index, message] of messages.entries()) {
-        const id = before[index];
+        const id = anew ? undefined : before[index];
         const drawn = id === undefined ? undefined : this.drawn.get(id);
         const now = { hash: payloadHash(message), v2: message.v2 === true };
         if (id !== undefined && drawn?.hash === now.hash) {
           ids.push(id);
           continue;
         }
-        if (id !== undefined && (await this.edit(channelId, id, message, drawn))) {
+        if (id !== undefined && (await this.edit(threadId, id, message, drawn))) {
           this.drawn.set(id, now);
           ids.push(id);
           continue;
         }
-        if (id !== undefined) this.drawn.delete(id);
-        const sent = await gateway.sendMessage(channelId, message);
+        if (id !== undefined) {
+          this.drawn.delete(id);
+          anew = true;
+          await this.deleteAll(threadId, before.slice(index + 1));
+        }
+        const sent = await gateway.sendMessage(threadId, message, { silent: true, reopen: true });
         if (sent === undefined) {
-          log.warn({ channel: channelId }, 'the post of the stops could not be sent');
+          log.warn(
+            { channel: channelId, post: threadId },
+            'the post of the stops could not be sent',
+          );
           break;
         }
         this.drawn.set(sent, now);
         ids.push(sent);
-        // Kept before it is pinned (review A9): a message sent is never lost to the storage.
+        // Kept at once (review A9): a message sent is never lost to the storage.
         await storage.save(sofar());
-        await this.pin(channelId, sent);
       }
     } catch (err) {
       // An edit Discord failed (review F3): the post stands as it is, with what was sent, and
@@ -360,22 +493,14 @@ export class StopPostService {
       await storage.save(sofar()).catch(() => undefined);
       throw err;
     }
-    for (const extra of before.slice(ids.length)) {
-      if (ids.includes(extra)) continue;
-      this.drawn.delete(extra);
-      await gateway.unpinMessage(channelId, extra).catch(() => false);
-      await gateway.deleteMessage(channelId, extra).catch((err: unknown) => {
-        log.warn(
-          { err, channel: channelId },
-          'could not delete a message of the post of the stops',
-        );
-      });
-    }
+    if (!anew) await this.deleteAll(threadId, before.slice(ids.length));
     const record: StopPostRecord = {
       channelId,
       day,
       serverId,
+      threadId,
       messageIds: ids,
+      leftover,
       updatedAt: this.now(),
     };
     this.posts.set(channelId, record);
@@ -399,22 +524,48 @@ export class StopPostService {
     this.options.changed?.(channelId);
   }
 
+  /** Deletes messages of the post that are not drawn any more; a failure is logged. */
+  private async deleteAll(
+    threadId: string,
+    messageIds: readonly string[],
+    reopen = true,
+  ): Promise<void> {
+    for (const id of messageIds) {
+      this.drawn.delete(id);
+      await this.options.gateway.deleteMessage(threadId, id, { reopen }).catch((err: unknown) => {
+        this.options.log.warn(
+          { err, post: threadId },
+          'could not delete a message of the post of the stops',
+        );
+      });
+    }
+  }
+
   /**
-   * What the summary of the channel's region shows of its post (plan 8X-G): the server, the first
-   * message (the link), and how many tasks and hideouts it shows, as last drawn, with the day's
-   * research waiting under an event's window and when it comes back (plan 8R-6); undefined where
-   * the channel has no post of today drawn since the start.
+   * What the summary of the channel's region shows of its post (plan 8X-G): the server, the board
+   * post and its first message of the stops (the link, plan 8R-9), and how many tasks and
+   * hideouts it shows, as last drawn, with the day's research waiting under an event's window
+   * and when it comes back (plan 8R-6); undefined where the channel has no post of today drawn
+   * since the start.
    */
   summaryOf(
     channelId: string,
-  ): ({ serverId: string; messageId: string } & Omit<StopsLine, 'url'>) | undefined {
+  ):
+    | ({ serverId: string; threadId: string; messageId: string } & Omit<StopsLine, 'url'>)
+    | undefined {
     const post = this.posts.get(channelId);
     const counts = this.counts.get(channelId);
     const [messageId] = post?.messageIds ?? [];
-    if (!post || !counts || messageId === undefined || post.day !== this.dayOf(this.now())) {
+    if (
+      !post ||
+      !counts ||
+      post.threadId === null ||
+      messageId === undefined ||
+      post.day !== this.dayOf(this.now())
+    ) {
       return undefined;
     }
-    return { serverId: post.serverId, messageId, ...counts };
+    return { serverId: post.serverId, threadId: post.threadId, messageId, ...counts };
   }
 
   /**
@@ -424,7 +575,9 @@ export class StopPostService {
    * today's is kept in memory and given. Throws what reading throws, so nothing is drawn then.
    */
   private async recall(channelId: string, day: string): Promise<StopPostRecord | undefined> {
-    const rows = (await this.options.storage.all()).filter((row) => row.channelId === channelId);
+    const rows = (await this.options.storage.all())
+      .map(fromStorage)
+      .filter((row) => row.channelId === channelId);
     for (const row of rows) if (row.day !== day) await this.remove(row);
     const today = rows.find((row) => row.day === day);
     if (today) this.posts.set(channelId, today);
@@ -440,87 +593,170 @@ export class StopPostService {
    * v2 message made plain), and only then (review G1).
    */
   private async edit(
-    channelId: string,
+    threadId: string,
     messageId: string,
     message: OutgoingMessage,
     drawn: { v2: boolean } | undefined,
   ): Promise<boolean> {
     const { gateway, log } = this.options;
     if (drawn !== undefined && drawn.v2 !== (message.v2 === true)) {
-      await gateway.deleteMessage(channelId, messageId).catch(() => undefined);
+      await gateway.deleteMessage(threadId, messageId, { reopen: true }).catch(() => undefined);
       return false;
     }
     try {
-      return await gateway.editMessage(channelId, messageId, message);
+      return await gateway.editMessage(threadId, messageId, message);
     } catch (err) {
       if (drawn !== undefined || !isRefusedBody(err)) throw err;
-      log.warn({ err, channel: channelId }, 'the post of the stops is sent anew');
-      await gateway.deleteMessage(channelId, messageId).catch(() => undefined);
+      log.warn({ err, post: threadId }, 'the post of the stops is sent anew');
+      await gateway.deleteMessage(threadId, messageId, { reopen: true }).catch(() => undefined);
       return false;
     }
   }
 
-  private async pin(channelId: string, messageId: string): Promise<void> {
-    const outcome = await this.options.gateway
-      .pinMessage(channelId, messageId)
-      .catch((err: unknown) => {
-        this.options.log.warn({ err, channel: channelId }, 'could not pin the post of the stops');
-        return 'failed' as const;
-      });
-    if ((outcome === 'not-allowed' || outcome === 'full') && !this.pinRefusalsTold.has(channelId)) {
-      this.pinRefusalsTold.add(channelId);
-      this.options.log.warn(
-        { channel: channelId, why: outcome },
-        outcome === 'full'
-          ? 'the channel has as many pins as Discord allows: the post of the stops stands unpinned'
-          : 'the bot may not pin in the channel: the post of the stops stands unpinned',
-      );
-    }
-  }
-
-  /** Unpins and deletes a post of a day that ended, and forgets it; in its channel's queue. */
-  private async remove(post: StopPostRecord): Promise<void> {
+  /**
+   * Deletes a post of a day that ended (its messages in the board, and any left in the region's
+   * channel by the bot before plan 8R-9, unpinned first: B11), and forgets it once every delete
+   * resolved (a message gone counts); where one fails its row stays with what is left (review P1)
+   * and the next turn-over deletes it again. In its channel's queue. True when it is gone.
+   */
+  private async remove(post: StopPostRecord): Promise<boolean> {
     const { gateway, storage, log } = this.options;
+    const key = `${post.channelId} ${post.day}`;
+    const failed: string[] = [];
     for (const id of post.messageIds) {
       this.drawn.delete(id);
-      await gateway.unpinMessage(post.channelId, id).catch(() => false);
-      await gateway.deleteMessage(post.channelId, id).catch((err: unknown) => {
+      if (post.threadId === null) continue;
+      try {
+        await gateway.deleteMessage(post.threadId, id, { reopen: true });
+      } catch (err) {
+        if (this.refusedForGood(err, post.channelId)) continue;
         log.warn({ err, channel: post.channelId }, 'could not delete the post of the stops');
-      });
+        failed.push(id);
+      }
     }
+    const leftover = await this.clear(post.channelId, post.leftover);
     if (this.posts.get(post.channelId) === post) {
       this.posts.delete(post.channelId);
       this.holding.delete(post.channelId);
       this.counts.delete(post.channelId);
     }
+    if (failed.length > 0 || leftover.length > 0) {
+      const kept = { ...post, messageIds: failed, leftover, updatedAt: this.now() };
+      this.leftovers.set(key, kept);
+      await storage.save(kept);
+      return false;
+    }
+    this.leftovers.delete(key);
     await storage.remove(post.channelId, post.day);
     this.options.changed?.(post.channelId);
+    return true;
+  }
+
+  /**
+   * Unpins and deletes messages the bot before plan 8R-9 pinned in a region's channel (B11), or
+   * whose delete failed before (P1); gives those whose delete failed again.
+   */
+  private async clear(channelId: string, messageIds: readonly string[]): Promise<string[]> {
+    const { gateway, log } = this.options;
+    const failed: string[] = [];
+    for (const id of messageIds) {
+      await gateway.unpinMessage(channelId, id).catch(() => false);
+      try {
+        await gateway.deleteMessage(channelId, id);
+      } catch (err) {
+        if (this.refusedForGood(err, channelId)) continue;
+        log.warn({ err, channel: channelId }, 'could not delete the post of the stops');
+        failed.push(id);
+      }
+    }
+    return failed;
+  }
+
+  /**
+   * Whether Discord refused a delete for good (review R1: Missing Access or Missing Permissions,
+   * 50001 or 50013): the message is forgotten, as trying again would meet the same refusal, and
+   * that is said once per channel while the bot runs.
+   */
+  private refusedForGood(err: unknown, channelId: string): boolean {
+    if (!isMissingPermission(err)) return false;
+    if (!this.deleteRefusalsTold.has(channelId)) {
+      this.deleteRefusalsTold.add(channelId);
+      this.options.log.warn(
+        { err, channel: channelId },
+        'the bot may not delete a message of the post of the stops',
+      );
+    }
+    return true;
   }
 
   /**
-   * The message of a channel's post that holds a task, once what waits is drawn (a DM of the task
-   * links to it: design 9.7); undefined where no post holds it.
+   * Where no post is drawn: the messages of the region's channel still to delete are kept in a
+   * row of their own (P1), forgotten once none are left.
    */
-  async messageOf(channelId: string, subjectKey: string): Promise<string | undefined> {
+  private async keepLeftover(
+    channelId: string,
+    day: string,
+    serverId: string,
+    held: readonly string[],
+    leftover: string[],
+  ): Promise<void> {
+    if (held.length === 0) return;
+    const kept = this.posts.get(channelId);
+    if (kept && kept.threadId !== null) {
+      // A board post of today stands: what is left goes with it.
+      const record = { ...kept, leftover, updatedAt: this.now() };
+      this.posts.set(channelId, record);
+      await this.options.storage.save(record);
+      return;
+    }
+    if (leftover.length === 0) {
+      this.posts.delete(channelId);
+      await this.options.storage.remove(channelId, day);
+      return;
+    }
+    const record: StopPostRecord = {
+      channelId,
+      day,
+      serverId,
+      threadId: null,
+      messageIds: [],
+      leftover,
+      updatedAt: this.now(),
+    };
+    this.posts.set(channelId, record);
+    await this.options.storage.save(record);
+  }
+
+  /**
+   * The message of a channel's post that holds a task, in its board post, once what waits is
+   * drawn (a DM of the task links to it: design 9.7; plan 8R-9, B1); undefined where no post
+   * holds it.
+   */
+  async messageOf(channelId: string, subjectKey: string): Promise<PostLink | undefined> {
     // Only this channel is drawn at once; the others keep their delay.
     await Promise.all(this.asking);
     await this.gathered.flushKey(channelId);
     await this.queue.run(channelId, () => Promise.resolve());
-    return this.holding.get(channelId)?.get(subjectKey);
+    // Else the post's first message, for a task only counted (review P9, as `linkOf`).
+    return this.linkOf(channelId, subjectKey);
   }
 
   /**
    * The message of a channel's post that holds a task or a hideout as the post was last drawn,
-   * else its first message (one counted only, "…and N more"); undefined where the channel has no
-   * post of today drawn (past midnight, before the posts are drawn anew, yesterday's is none).
-   * Read only (plan 8R-3: the map asks on every poll): unlike `messageOf` it draws nothing and
-   * waits for nothing, so a change still gathering shows at the next poll.
+   * else its first message (one counted only, "…and N more"), in its board post (B1); undefined
+   * where the channel has no post of today drawn (past midnight, before the posts are drawn
+   * anew, yesterday's is none). Read only (plan 8R-3: the map asks on every poll): unlike
+   * `messageOf` it draws nothing and waits for nothing, so a change still gathering shows at the
+   * next poll.
    */
-  linkOf(channelId: string, subjectKey: string): string | undefined {
+  linkOf(channelId: string, subjectKey: string): PostLink | undefined {
     const held = this.holding.get(channelId);
     const post = this.posts.get(channelId);
-    if (held === undefined || post?.day !== this.dayOf(this.now())) return undefined;
-    return held.get(subjectKey) ?? post.messageIds[0];
+    if (held === undefined || post?.day !== this.dayOf(this.now()) || post.threadId === null) {
+      return undefined;
+    }
+    const messageId = held.get(subjectKey) ?? post.messageIds[0];
+    return messageId === undefined ? undefined : { channelId: post.threadId, messageId };
   }
 
   /** Draws what waits now, and waits for every draw. For tests and shutdown. */
@@ -551,6 +787,15 @@ export class StopPostService {
   }
 }
 
+/**
+ * A kept row as the service reads it: a post the bot before plan 8R-9 pinned in the region's
+ * channel (no board post, B11) is messages of that channel still to delete, as `leftover`.
+ */
+function fromStorage(row: StopPostRecord): StopPostRecord {
+  if (row.threadId !== null || row.messageIds.length === 0) return row;
+  return { ...row, messageIds: [], leftover: [...row.leftover, ...row.messageIds] };
+}
+
 /** A message's payload as a short hash: the same payload, the same hash (files included). */
 function payloadHash(message: OutgoingMessage): string {
   return createHash('sha256').update(JSON.stringify(message)).digest('base64');
diff --git a/src/web/stop-reports.test.ts b/src/web/stop-reports.test.ts
index e7ed48a5..364e423a 100644
--- a/src/web/stop-reports.test.ts
+++ b/src/web/stop-reports.test.ts
@@ -36,7 +36,10 @@ const ALICE_AS = { id: ALICE, name: 'Alice' };
  */
 async function setup(
   postsOf: (made: Awaited<ReturnType<typeof stopReportingWith>>) => StopWebDeps['posts'] = () => ({
-    linkOf: (channelId: string, key: string) => `${channelId.slice(-2)}${key.length}`,
+    linkOf: (channelId: string, key: string) => ({
+      channelId,
+      messageId: `${channelId.slice(-2)}${key.length}`,
+    }),
   }),
   pictures?: WebDeps['pictures'],
 ) {
@@ -240,15 +243,27 @@ describe('the reports at stops on the map', () => {
     expect(all.mock.calls.length).toBe(once);
   });
 
-  it('reads the pinned posts as last drawn, and never draws one itself', async () => {
+  it('reads the posts of the stops as last drawn, and never draws one itself', async () => {
     let posts: StopPostService | undefined;
+    // West's board post (plan 8R-9), made once the gateway is there.
+    let board: string | null = null;
     const made = await setup((reporting) => {
       posts = new StopPostService({
         storage: new MemoryStopPosts(),
         reports: reporting.ctx.stopReports,
         events: reporting.ctx.raidEvents,
-        regions: reporting.ctx.regions,
-        guilds: reporting.ctx.guilds,
+        regions: {
+          all: () =>
+            reporting.ctx.regions
+              .all()
+              .map((region) =>
+                region.channelId === WEST_CHANNEL ? { ...region, summaryMessageId: board } : region,
+              ),
+        },
+        guilds: {
+          ...reporting.ctx.guilds,
+          snowflakeOf: (row) => Promise.resolve(row === 1 ? FAKE_GUILD_ID : undefined),
+        },
         gateway: reporting.made.gateway,
         zone: reporting.ctx.config.settings.timezone,
         log: reporting.ctx.log,
@@ -260,16 +275,24 @@ describe('the reports at stops on the map', () => {
     });
     web = made.web;
     if (!posts) throw new Error('no posts');
+    const forum = made.ctx.regions.all().find((one) => one.channelId === WEST_CHANNEL);
+    made.made.gateway.addForum(forum?.forumChannelId ?? '');
+    board =
+      (await made.made.gateway.createPost(forum?.forumChannelId ?? '', {
+        title: 'Today and coming up',
+        message: { content: 'The summary' },
+        tagIds: [],
+      })) ?? null;
     try {
       await made.research([wayspotId(1)]);
       await posts.flush();
-      const [post] = made.made.gateway.messagesIn(WEST_CHANNEL);
+      const [post] = made.made.gateway.messagesIn(board ?? '');
       const calls = [...made.made.gateway.calls];
       // A change still gathering: the poll shows the post as drawn, and draws nothing.
       await made.rocket('leader:arlo', wayspotId(2));
       const view = (await made.ask()).json<StopReportsView>();
       expect(view.research[0]?.link).toBe(
-        `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/${post?.id ?? ''}`,
+        `https://discord.com/channels/${FAKE_GUILD_ID}/${board ?? ''}/${post?.id ?? ''}`,
       );
       expect(view.hideouts).toHaveLength(1);
       expect(made.made.gateway.calls).toEqual(calls);
diff --git a/src/web/stop-routes.ts b/src/web/stop-routes.ts
index a2d3e2e6..951e73b2 100644
--- a/src/web/stop-routes.ts
+++ b/src/web/stop-routes.ts
@@ -93,8 +93,9 @@ export interface StopWebDeps {
   /** A channel's name as the bot sees it now: a region's, which an answer names. */
   channelName(channelId: string): string | undefined;
   /**
-   * Which message of a region channel's pinned post holds a task or a hideout, as last drawn
-   * (`StopPostService.linkOf`: read only, never a draw); undefined in rehearsal mode (no posts).
+   * Which message of a region channel's post "Today’s Stops" holds a task or a hideout, in its
+   * board post, as last drawn (`StopPostService.linkOf`: read only, never a draw); undefined in
+   * rehearsal mode (no posts).
    */
   posts: Pick<StopPostService, 'linkOf'> | undefined;
   /** The grunts' messages, read for many reports at once; undefined in rehearsal mode. */
@@ -172,8 +173,8 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
         return message && postLink(guild, message.channelId, message.messageId);
       }
       for (const channelId of channels) {
-        const messageId = stops.posts?.linkOf(channelId, report.subjectKey);
-        if (messageId !== undefined) return postLink(guild, channelId, messageId);
+        const held = stops.posts?.linkOf(channelId, report.subjectKey);
+        if (held !== undefined) return postLink(guild, held.channelId, held.messageId);
       }
       return undefined;
     };
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index c3777295..26ee1d3a 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -18,7 +18,9 @@ import type {
   NewPost,
   OutgoingMessage,
   PartyGateway,
-  PinOutcome,
+  DeleteOptions,
+  PostAccess,
+  SendOptions,
   TagIds,
 } from '../../src/discord/party-gateway.js';
 import {
@@ -104,6 +106,8 @@ export interface FakeMessage {
   attachments: string[];
   /** How often the message was edited. */
   edits: number;
+  /** Sent without notifying anybody (`SendOptions.silent`, plan 8R-9). */
+  silent?: boolean;
 }
 
 /** The names of the files a message carries (by their base names), or undefined: it names none. */
@@ -242,7 +246,7 @@ interface V2Component {
  * is 1 to 100 characters, a post has at most five tags, all of the forum, a forum has one pinned
  * post, and nothing can be sent into a forum. Like Discord, it opens an archived post again for
  * anything that is edited or sent in it, and refuses a deletion in it (`archivedThread`, 50083)
- * until then. A message that was deleted, or whose id is in `gone`,
+ * until then, unless the deletion asks the gateway to open it (`reopen`, plan 8R-9). A message that was deleted, or whose id is in `gone`,
  * cannot be edited. In a channel of `noEmbeds` a message is kept without its embeds, which is
  * what Discord does to a message of a bot that lacks Embed Links: it refuses nothing.
  *
@@ -317,14 +321,10 @@ export class FakePartyGateway implements PartyGateway {
   refuseFiles = false;
   /** How many sends and edits `refuseFiles` refused. */
   filesRefused = 0;
-  /** The messages pinned per channel (`pinMessage`, plan 8R-1). */
+  /** The messages pinned per channel (`pin`, plan 8R-1's post before plan 8R-9). */
   private readonly pins = new Map<string, Set<string>>();
-  /** Channels where the bot may not pin (no Pin Messages). */
+  /** Channels where the bot may not unpin (no Pin Messages). */
   readonly noPinning = new Set<string>();
-  /** How many pins a channel holds at most (Discord's limit). */
-  pinLimit = 250;
-  /** How many notices of a pin were deleted. */
-  pinNotices = 0;
 
   /** Refuses a message that uploads files while `refuseFiles` says so. */
   private checkFiles(message: OutgoingMessage): void {
@@ -1286,13 +1286,16 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
-  sendMessage(channelId: string, message: OutgoingMessage) {
+  sendMessage(channelId: string, message: OutgoingMessage, options?: SendOptions) {
     return this.attempt('sendMessage', channelId, () => {
       if (this.gone.has(channelId) || this.forums.has(channelId)) return undefined;
       FakePartyGateway.checkMessage(message, this.textLimit);
       this.checkFiles(message);
       this.checkPicture(message);
       const post = this.posts.get(channelId);
+      // As Discord: an archived, locked post refuses a message until it is opened (50083); the
+      // gateway opens it where asked (plan 8R-9, review R3).
+      if (post?.archived && post.locked && options?.reopen !== true) throw archivedThread('POST');
       if (post) FakePartyGateway.reopen(post);
       const id = this.id();
       this.messages.push({
@@ -1301,6 +1304,7 @@ export class FakePartyGateway implements PartyGateway {
         message: this.kept(channelId, message),
         attachments: filesOf(message) ?? [],
         edits: 0,
+        ...(options?.silent === true ? { silent: true } : {}),
       });
       return id;
     });
@@ -1331,33 +1335,26 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
-  deleteMessage(channelId: string, messageId: string) {
+  deleteMessage(channelId: string, messageId: string, options?: DeleteOptions) {
     return this.attempt('deleteMessage', messageId, () => {
-      // As Discord: an archived post refuses a deletion until something opens it (8X-H, F4).
-      if (this.posts.get(channelId)?.archived) throw archivedThread();
+      // As Discord: an archived post refuses a deletion until something opens it (8X-H, F4);
+      // the gateway opens it where asked (plan 8R-9, B3, review P4).
+      const post = this.posts.get(channelId);
+      if (post?.archived && options?.reopen !== true) throw archivedThread();
+      if (post) FakePartyGateway.reopen(post);
       this.deleted.push({ channelId, messageId });
       this.pins.get(channelId)?.delete(messageId);
     });
   }
 
   /**
-   * Pins a message (plan 8R-1): refused in a channel of `noPinning` (`not-allowed`), `full`
-   * where the channel has `pinLimit` pins, `gone` for a message not there; Discord's notice of
-   * the pin is deleted at once, as the gateway does where it may (`pinNotices` counts them).
+   * Pins a message as the bot before plan 8R-9 pinned the post "Today’s Stops" in a region's
+   * channel (a test's own setup: no code pins a message any more).
    */
-  pinMessage(channelId: string, messageId: string) {
-    return this.attempt('pinMessage', messageId, (): PinOutcome => {
-      if (this.gone.has(channelId) || this.gone.has(messageId)) return 'gone';
-      if (!this.messagesIn(channelId).some((sent) => sent.id === messageId)) return 'gone';
-      if (this.noPinning.has(channelId)) return 'not-allowed';
-      let pinned = this.pins.get(channelId);
-      if (!pinned) this.pins.set(channelId, (pinned = new Set()));
-      if (pinned.has(messageId)) return 'pinned';
-      if (pinned.size >= this.pinLimit) return 'full';
-      pinned.add(messageId);
-      this.pinNotices += 1;
-      return 'pinned';
-    });
+  pin(channelId: string, messageId: string): void {
+    let pinned = this.pins.get(channelId);
+    if (!pinned) this.pins.set(channelId, (pinned = new Set()));
+    pinned.add(messageId);
   }
 
   unpinMessage(channelId: string, messageId: string) {
@@ -1368,7 +1365,7 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
-  /** The messages pinned in a channel (`pinMessage`), in the order pinned. */
+  /** The messages pinned in a channel (`pin`), in the order pinned. */
   pinnedIn(channelId: string): string[] {
     return [...(this.pins.get(channelId) ?? [])];
   }
@@ -1460,6 +1457,28 @@ export class FakePartyGateway implements PartyGateway {
     return undefined;
   }
 
+  /**
+   * What the bot may write in a post (plan 8R-9): nothing where its forum (or the post) is in
+   * `noManaging`, or `refusePosts` names Send Messages in Posts or Manage Posts there; plain text
+   * where the post or its forum is in `noEmbeds`; else messages with components.
+   */
+  postAccess(postId: string): Promise<PostAccess> {
+    return Promise.resolve(this.accessTo(postId));
+  }
+
+  private accessTo(postId: string): PostAccess {
+    const forumId = this.posts.get(postId)?.forumId;
+    const where = forumId === undefined ? [postId] : [postId, forumId];
+    const lacking = forumId === undefined ? [] : (this.refusePosts.get(forumId) ?? []);
+    if (
+      where.some((id) => this.noManaging.has(id)) ||
+      lacking.some((name) => name === 'Send Messages in Posts' || name === 'Manage Posts')
+    ) {
+      return 'refused';
+    }
+    return where.some((id) => this.noEmbeds.has(id)) ? 'plain' : 'v2';
+  }
+
   /** The bot may post embeds everywhere but in the channels of `noEmbeds`. */
   mayPost(channelId: string): boolean {
     return !this.noEmbeds.has(channelId);
diff --git a/test/support/research-store-cases.ts b/test/support/research-store-cases.ts
index f6fd01ec..92911b51 100644
--- a/test/support/research-store-cases.ts
+++ b/test/support/research-store-cases.ts
@@ -50,20 +50,25 @@ export function stopPostCases(made: () => Promise<StopPostStorage>): void {
       channelId: '300000000000000001',
       day: '2026-10-21',
       serverId: '100000000000000001',
+      threadId: '300000000000000009',
       messageIds: ['400000000000000001'],
+      leftover: [],
       updatedAt: 1,
     };
     await store.save(post);
-    await store.save({ ...post, day: '2026-10-20' });
-    await store.save({
+    // A post of before plan 8R-9, pinned in the channel: no board post.
+    await store.save({ ...post, day: '2026-10-20', threadId: null });
+    // Drawn anew in another board post (a summary replaced, plan 8R-9).
+    const moved = {
       ...post,
+      threadId: '300000000000000010',
+      // An old pinned post's message whose delete failed, kept with it (review P1).
+      leftover: ['400000000000000009'],
       messageIds: ['400000000000000001', '400000000000000002'],
       updatedAt: 2,
-    });
-    expect(await store.all()).toEqual([
-      { ...post, day: '2026-10-20' },
-      { ...post, messageIds: ['400000000000000001', '400000000000000002'], updatedAt: 2 },
-    ]);
+    };
+    await store.save(moved);
+    expect(await store.all()).toEqual([{ ...post, day: '2026-10-20', threadId: null }, moved]);
     await store.remove(post.channelId, '2026-10-20');
     await store.remove(post.channelId, '2026-10-19');
     expect((await store.all()).map((one) => one.day)).toEqual(['2026-10-21']);
diff --git a/test/support/research-store.ts b/test/support/research-store.ts
index eb227e68..e1924ed6 100644
--- a/test/support/research-store.ts
+++ b/test/support/research-store.ts
@@ -28,13 +28,17 @@ export class MemoryStopPosts implements StopPostStorage {
     return Promise.resolve(
       [...this.rows.values()]
         .sort((a, b) => a.day.localeCompare(b.day) || a.channelId.localeCompare(b.channelId))
-        .map((row) => ({ ...row, messageIds: [...row.messageIds] })),
+        .map((row) => ({ ...row, messageIds: [...row.messageIds], leftover: [...row.leftover] })),
     );
   }
 
   save(post: StopPostRecord): Promise<void> {
     this.fail('save');
-    this.rows.set(`${post.channelId} ${post.day}`, { ...post, messageIds: [...post.messageIds] });
+    this.rows.set(`${post.channelId} ${post.day}`, {
+      ...post,
+      messageIds: [...post.messageIds],
+      leftover: [...post.leftover],
+    });
     return Promise.resolve();
   }
 
````

### Task 2: 8R-9 task 2: The board's summary, Today and coming up, locked

Prototype commit: `7b4c5f7647edbdc26b056325bc288b1606b73142`

The region's pinned summary post is its board (design
2026-10-25-region-board-design.md):

- Titled "Today and coming up"; a post titled "Active raids" or "Going on
  now" is taken over and renamed (LEGACY_SUMMARY_TITLES, B12).
- Locked when made, and pinned and locked again wherever Discord says it
  is not, after each edit and after each draw of the stops in it, whose
  messages open an archived board (B4; PartyGateway.lockPost, postInfo's
  locked; a refused lock said once per region).
- Split by day by one rule (isToday, src/domain/party/board-day.ts, B8):
  a party that has started, starts before the next local midnight or has
  no time is today's, under the headings as before; the rest, every kind,
  trains passing through too, is one list under "Coming up" by start, its
  kind first and the full date and time, sure of SECTION_ROOM. The head
  counts today's ("today" after them where something is coming up), what
  is coming up and the stops; the stops' line says "(below)" in the board
  and links the first message of the stops in it.
- A timer at each local midnight draws every summary anew (Luxon, DST
  safe, also in rehearsal mode), and the catch-up on reconnect draws them
  too (B7).
- A board deleted while the summary's text stood is made anew (the next
  edit replaces it, P2); the head joins the parties' and the stops'
  counts, NOTHING_GOING only where both are none (P7); the midnight timer
  fires a second after midnight (P10); the setup is told whether the new
  board could be locked (ForumSetup.unlocked, P12).
- settings.regionForumSuffix defaults to "-board"; renameForum renames a
  forum of the old ending at the next /admin setup-forums or /region import.

**Files:**

```
 data/settings.json                        |   2 +-
 src/app.ts                                |  10 +++-
 src/commands/admin/setup-forums.test.ts   |   2 +-
 src/commands/parties/in-meetup.test.ts    |   2 +-
 src/commands/parties/in-train.test.ts     |   2 +-
 src/commands/parties/status.test.ts       |   6 +-
 src/config/settings.test.ts               |   8 +++
 src/config/settings.ts                    |  10 ++--
 src/discord/party-gateway.ts              |  25 +++++++--
 src/domain/party/board-day.test.ts        |  65 ++++++++++++++++++++++
 src/domain/party/board-day.ts             |  33 +++++++++++
 src/render/summary.test.ts                | 145 ++++++++++++++++++++++++++++++++++++++++++------
 src/render/summary.ts                     | 212 ++++++++++++++++++++++++++++++++++++++++++++++++++++++----------------
 src/services/party-service.max.test.ts    |   2 +-
 src/services/party-service.meetup.test.ts |  10 ++--
 src/services/party-service.test.ts        | 207 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----
 src/services/party-service.train.test.ts  |  12 ++--
 src/services/party-service.ts             | 169 +++++++++++++++++++++++++++++++++++++++++++++++++-------
 test/support/fake-gateway.ts              |  21 ++++++-
 19 files changed, 817 insertions(+), 126 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/admin/setup-forums.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/in-train.test.ts src/commands/parties/status.test.ts src/config/settings.test.ts src/domain/party/board-day.test.ts src/render/summary.test.ts src/services/party-service.max.test.ts src/services/party-service.meetup.test.ts src/services/party-service.test.ts src/services/party-service.train.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 7b4c5f7647edbdc26b056325bc288b1606b73142 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-9 task 2: The board's summary, Today and coming up, locked`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/data/settings.json b/data/settings.json
index 8274baca..045ce385 100644
--- a/data/settings.json
+++ b/data/settings.json
@@ -65,7 +65,7 @@
     "util"
   ],
   "wildSpawnExceptions": ["Uxie", "Mesprit", "Azelf"],
-  "regionForumSuffix": "-meetups",
+  "regionForumSuffix": "-board",
   "blacklistWords": [
     "ex",
     "raid",
diff --git a/src/app.ts b/src/app.ts
index 0333222e..af1abb87 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1085,10 +1085,11 @@ export async function startApp(
         gateway: partyGateway,
         zone: config.settings.timezone,
         log,
-        // The region's summary links the post with its counts (plan 8X-G).
+        // The region's summary links the post with its counts (plan 8X-G); a draw in the board
+        // may have opened it, so its pin and lock are checked too (plan 8R-9, B4).
         changed: (channelId) => {
           const region = regions.byChannel(channelId);
-          if (region) partyService.summaryChanged(region.id);
+          if (region) partyService.summaryChanged(region.id, true);
         },
         pictures: stopPictures,
       });
@@ -1125,6 +1126,11 @@ export async function startApp(
       { name: 'game data', run: () => gameData.catchUp() },
     ],
   });
+  // Every summary drawn anew at local midnight (plan 8R-9, B7: Coming up turns into today), in
+  // rehearsal mode too.
+  void connected.then(() => {
+    partyService.watchMidnight();
+  });
   void connected.then(() =>
     stopPosts
       ?.start()
diff --git a/src/commands/admin/setup-forums.test.ts b/src/commands/admin/setup-forums.test.ts
index 91045cbe..b17bac9d 100644
--- a/src/commands/admin/setup-forums.test.ts
+++ b/src/commands/admin/setup-forums.test.ts
@@ -109,7 +109,7 @@ describe('/admin setup-forums', () => {
     for (const region of regions.all()) {
       const summary = gateway.posts.get(region.summaryMessageId ?? '');
       expect(summary).toMatchObject({
-        title: 'Going on now',
+        title: 'Today and coming up',
         pinned: true,
         forumId: region.forumChannelId,
       });
diff --git a/src/commands/parties/in-meetup.test.ts b/src/commands/parties/in-meetup.test.ts
index 559e4f05..9a60108c 100644
--- a/src/commands/parties/in-meetup.test.ts
+++ b/src/commands/parties/in-meetup.test.ts
@@ -644,7 +644,7 @@ describe('the other commands in the post of a meetup', () => {
     const made = await setup();
     const used = await made.run('status', {}, { channelId: WEST_CHANNEL, thread: undefined });
     expect(textDisplays(asV2(sent(used.editReply)))).toEqual([
-      '### Going on now\n1 meetup',
+      '### Today and coming up\n1 meetup',
       `**Meetups**\n<#${made.postId}> · no time set · 1 trainer`,
     ]);
   });
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index 4a17d662..010f6d69 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -651,7 +651,7 @@ describe('the other commands in the post of a train', () => {
     const made = await setup();
     const used = await made.run('status', {}, { channelId: WEST_CHANNEL, thread: undefined });
     expect(textDisplays(asV2(sent(used.editReply)))).toEqual([
-      '### Going on now\n1 train',
+      '### Today and coming up\n1 train',
       `**Trains**\n<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
     ]);
   });
diff --git a/src/commands/parties/status.test.ts b/src/commands/parties/status.test.ts
index cffed430..65a7d750 100644
--- a/src/commands/parties/status.test.ts
+++ b/src/commands/parties/status.test.ts
@@ -61,7 +61,7 @@ describe('/status', () => {
   it('lists the raids of the region in its channel and in its forum, for the member alone', async () => {
     const made = await setup(yveltal);
     const listed = [
-      '### Going on now\n1 raid',
+      '### Today and coming up\n1 raid',
       `**Level 5**\n<#${made.postId}> · no time set · 1 trainer`,
     ];
     const shown = (used: { editReply: Parameters<typeof sent>[0] }) =>
@@ -78,7 +78,7 @@ describe('/status', () => {
 
     const elsewhere = await made.run('status', { channelId: EAST_CHANNEL });
     expect(shown(elsewhere)).toEqual([
-      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     ]);
   });
 
@@ -87,7 +87,7 @@ describe('/status', () => {
     await made.service.end(made.party.id);
     const used = await made.run('status');
     expect(textDisplays(asV2(sent(used.editReply)))).toEqual([
-      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     ]);
     expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
   });
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index 66ba6a3a..f8a235d6 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -484,6 +484,14 @@ describe('loadSettings', () => {
     });
   });
 
+  it('names a region’s forum its board by default (plan 8R-9), as the repository’s file does', () => {
+    expect(loadSettings(REPO_SETTINGS).regionForumSuffix).toBe('-board');
+    const without = writeSettings((s) => {
+      delete s.regionForumSuffix;
+    });
+    expect(loadSettings(without).regionForumSuffix).toBe('-board');
+  });
+
   it('takes the lobby sizes, each with its default, and all of them for a file without any', () => {
     const defaults = { raid: 20, dynamax: 4, gigantamax: 100 };
     expect(loadSettings(REPO_SETTINGS).lobbies).toEqual(defaults);
diff --git a/src/config/settings.ts b/src/config/settings.ts
index 68b60f9e..2fe7cffb 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -227,14 +227,16 @@ export const settingsSchema = z.strictObject({
   wildSpawnExceptions: z.array(z.string().min(1)).default(['Uxie', 'Mesprit', 'Azelf']),
   /**
    * What the name of a region's forum adds to the name of the region's channel (`north` gets
-   * the forum `north-meetups`): the forum holds the raids, the trains and the meetups of the
-   * region. `/admin setup-forums` names new forums so, and renames a forum whose name is the
-   * region's with another one-word ending (`north-raids`); a name chosen by hand stays.
+   * the forum `north-board`; `-meetups` before plan 8R-9): the forum is the region's board, with
+   * the raids, max battles, trains and meetups of the region and its locked post "Today and coming
+   * up". `/admin setup-forums` and `/region import` name new forums so, and rename a forum whose
+   * name is the region's with another one-word ending (`north-meetups`); a name chosen by hand
+   * stays.
    */
   regionForumSuffix: z
     .string()
     .regex(/^-[\p{L}\p{N}_-]{1,30}$/u, { message: 'must be a hyphen and up to 30 letters' })
-    .default('-meetups'),
+    .default('-board'),
   /**
    * Address of a map of all regions, which `/maps` gives members; without it the command is
    * not offered. A setting, not the environment variable `REGION_MAP_LINK` the spec named: it is
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index 53bf76c0..1dba7aaf 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -177,12 +177,12 @@ export interface PartyGateway {
   /** Creates a post and gives its id (the id of the thread). Undefined when the forum is gone. */
   createPost(forumId: string, post: NewPost): Promise<string | undefined>;
   /**
-   * The post's title, applied tags and whether it is pinned, as Discord has them. Undefined when
-   * it is gone.
+   * The post's title, applied tags and whether it is pinned and locked, as Discord has them.
+   * Undefined when it is gone.
    */
   postInfo(
     postId: string,
-  ): Promise<{ title: string; tagIds: string[]; pinned: boolean } | undefined>;
+  ): Promise<{ title: string; tagIds: string[]; pinned: boolean; locked: boolean } | undefined>;
   /**
    * Replaces the post's first message. False when the post is gone, and also when only its first
    * message was deleted (the thread may still exist: `postInfo` still answers then).
@@ -205,6 +205,12 @@ export interface PartyGateway {
    * Pins the post in its forum (a forum has one pinned post). Needs Manage Threads.
    */
   pinPost(postId: string): Promise<boolean>;
+  /**
+   * Locks a post without archiving it (plan 8R-9: the region's board, in which only the bot and
+   * moderators write), opening it first where it is archived. Needs Manage Threads. False when it
+   * is gone.
+   */
+  lockPost(postId: string): Promise<boolean>;
   /**
    * Archives and locks a post: it leaves the forum's list of active posts and members can no
    * longer write in it. False when it is gone. Anything sent or edited in it afterwards would
@@ -1201,13 +1207,14 @@ export class DiscordPartyGateway implements PartyGateway {
 
   async postInfo(
     postId: string,
-  ): Promise<{ title: string; tagIds: string[]; pinned: boolean } | undefined> {
+  ): Promise<{ title: string; tagIds: string[]; pinned: boolean; locked: boolean } | undefined> {
     const post = await this.post(postId);
     return post
       ? {
           title: post.name,
           tagIds: [...post.appliedTags],
           pinned: post.flags.has(ChannelFlags.Pinned),
+          locked: post.locked === true,
         }
       : undefined;
   }
@@ -1276,6 +1283,16 @@ export class DiscordPartyGateway implements PartyGateway {
     });
   }
 
+  async lockPost(postId: string): Promise<boolean> {
+    const post = await this.post(postId);
+    if (!post) return false;
+    return this.done(async () => {
+      // Discord changes nothing but `archived` on an archived thread: open it to lock it.
+      await this.reopen(post);
+      await post.setLocked(true);
+    });
+  }
+
   async archivePost(postId: string): Promise<boolean> {
     const post = await this.post(postId);
     if (!post) return false;
diff --git a/src/domain/party/board-day.test.ts b/src/domain/party/board-day.test.ts
new file mode 100644
index 00000000..c8480fb6
--- /dev/null
+++ b/src/domain/party/board-day.test.ts
@@ -0,0 +1,65 @@
+import { describe, expect, it } from 'vitest';
+import {
+  at,
+  PARTY_NOW,
+  PARTY_ZONE,
+  testMax,
+  testMeetup,
+  testRaid,
+  testRaidRules,
+  testTrain,
+} from '../../../test/support/parties.js';
+import { isToday, nextLocalMidnight, partyStart } from './board-day.js';
+import type { MeetupParty } from './party.js';
+import { setHatchTime } from './raid.js';
+
+const HOUR = 60 * 60_000;
+
+/** A meetup with these times. */
+function meetupAt(times: { start?: number; end?: number }): MeetupParty {
+  const made = testMeetup();
+  return {
+    ...made,
+    endTime: times.end ?? null,
+    timed: { ...made.timed, startTime: times.start ?? null },
+  };
+}
+
+describe('nextLocalMidnight', () => {
+  it('is the next midnight of the zone, a day of a change of the clocks included', () => {
+    expect(nextLocalMidnight(at('2026-10-13T14:00'), PARTY_ZONE)).toBe(at('2026-10-14T00:00'));
+    // The night the clocks go back (2026-11-01 in New York): the day has 25 hours.
+    expect(nextLocalMidnight(at('2026-11-01T00:30'), PARTY_ZONE)).toBe(at('2026-11-02T00:00'));
+    expect(at('2026-11-02T00:00') - at('2026-11-01T00:00')).toBe(25 * HOUR);
+    // At midnight itself: the next one.
+    expect(nextLocalMidnight(at('2026-10-14T00:00'), PARTY_ZONE)).toBe(at('2026-10-15T00:00'));
+  });
+});
+
+describe('partyStart and isToday (plan 8R-9, B8)', () => {
+  const rules = testRaidRules();
+
+  it('starts a train or meetup at its start, a raid at its hatch, a max battle never', () => {
+    const meetup = meetupAt({ start: PARTY_NOW + HOUR });
+    expect(partyStart(meetup)).toBe(PARTY_NOW + HOUR);
+    const egg = setHatchTime(testRaid(), PARTY_NOW + HOUR, rules, PARTY_NOW);
+    expect(partyStart(egg)).toBe(PARTY_NOW + HOUR);
+    expect(partyStart(testMax())).toBeNull();
+    expect(partyStart(testTrain())).toBe(testTrain().timed.startTime);
+  });
+
+  it('is today when it started, starts before midnight, or has no time; coming up after', () => {
+    const tonight = meetupAt({ start: at('2026-10-13T23:30') });
+    const tomorrow = meetupAt({ start: at('2026-10-14T00:00') });
+    const started = meetupAt({ start: PARTY_NOW - 3 * HOUR, end: PARTY_NOW + HOUR });
+    const untimed = meetupAt({});
+    expect(isToday(tonight, PARTY_NOW, PARTY_ZONE)).toBe(true);
+    expect(isToday(tomorrow, PARTY_NOW, PARTY_ZONE)).toBe(false);
+    expect(isToday(started, PARTY_NOW, PARTY_ZONE)).toBe(true);
+    expect(isToday(untimed, PARTY_NOW, PARTY_ZONE)).toBe(true);
+    // An elite raid's egg days ahead is coming up too; a max battle is always today.
+    const elite = setHatchTime(testRaid(), at('2026-10-15T11:00'), rules, PARTY_NOW);
+    expect(isToday(elite, PARTY_NOW, PARTY_ZONE)).toBe(false);
+    expect(isToday(testMax(), PARTY_NOW, PARTY_ZONE)).toBe(true);
+  });
+});
diff --git a/src/domain/party/board-day.ts b/src/domain/party/board-day.ts
new file mode 100644
index 00000000..9d898386
--- /dev/null
+++ b/src/domain/party/board-day.ts
@@ -0,0 +1,33 @@
+import { DateTime } from 'luxon';
+import { isRaid, isTimed, type Party } from './party.js';
+import { startTimeOf } from './timed.js';
+
+/**
+ * The next local midnight after `now` in `zone` (Luxon: a day of a change of the clocks has 23 or
+ * 25 hours), at midnight itself the one after it: when the region's board turns its coming up
+ * into today (plan 8R-9, B7).
+ */
+export function nextLocalMidnight(now: number, zone: string): number {
+  return DateTime.fromMillis(now, { zone }).startOf('day').plus({ days: 1 }).toMillis();
+}
+
+/**
+ * When a party starts, as the region's board sorts it into today and coming up (plan 8R-9, B8):
+ * a train's or meetup's start, a raid's hatch; null where it has none (a max battle, which is
+ * always on now, or a raid or meetup without a time).
+ */
+export function partyStart(party: Party): number | null {
+  if (isRaid(party)) return party.hatchTime;
+  if (isTimed(party)) return startTimeOf(party);
+  return null;
+}
+
+/**
+ * Whether a party is under today on the region's board (plan 8R-9, B8): it has started, starts
+ * before the next local midnight, or has no time set; anything else is coming up, every kind (an
+ * elite raid's egg days ahead too). The one rule of the board and of `/status` alike.
+ */
+export function isToday(party: Party, now: number, zone: string): boolean {
+  const start = partyStart(party);
+  return start === null || start < nextLocalMidnight(now, zone);
+}
diff --git a/src/render/summary.test.ts b/src/render/summary.test.ts
index 049f675b..efbc551f 100644
--- a/src/render/summary.test.ts
+++ b/src/render/summary.test.ts
@@ -5,6 +5,7 @@ import {
   at,
   MINUTE,
   PARTY_NOW,
+  PARTY_ZONE,
   testMax,
   testMeetup,
   testRaid,
@@ -23,10 +24,12 @@ import { LIST_COLOUR } from './v2.js';
 import { RAID_LEVELS, SHADOW_RAID_LEVELS } from '../domain/pogo/raid-tier.js';
 import type { MaxTier } from '../domain/pogo/max-tier.js';
 import {
+  LEGACY_SUMMARY_TITLES,
   NOTHING_GOING,
   renderRegionLink,
   renderSummary,
   SUMMARY_TIERS,
+  SUMMARY_TITLE,
   tierHeading,
   type ListedMax,
   type ListedMeetup,
@@ -52,7 +55,7 @@ function linesUnder(message: V2Message, heading: string): string[] {
   return block.split('\n').slice(1);
 }
 
-const NOTHING = `### Going on now\n${NOTHING_GOING}`;
+const NOTHING = `### Today and coming up\n${NOTHING_GOING}`;
 
 describe('renderSummary', () => {
   it('says so when there is nothing, in one container', () => {
@@ -81,7 +84,7 @@ describe('renderSummary', () => {
       PARTY_NOW,
     );
     expect(textDisplays(message)).toEqual([
-      '### Going on now\n3 raids',
+      '### Today and coming up\n3 raids',
       [
         '**Level 5**',
         `<#300000000000000002> · ends <t:${at('2026-10-13T14:20') / 1000}:R> · 4 trainers`,
@@ -103,7 +106,7 @@ describe('renderSummary', () => {
       );
     const message = renderSummary(raids, PARTY_NOW);
     expect(textDisplays(message).map((text) => text.split('\n')[0])).toEqual([
-      '### Going on now',
+      '### Today and coming up',
       '**Elite**',
       '**Level 5**',
       '**Shadow Level 5**',
@@ -169,7 +172,7 @@ describe('renderSummary', () => {
     const message = renderSummary(many, PARTY_NOW);
     expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
     expect(textLength(message)).toBeGreaterThan(TEXT_BUDGET - 100);
-    expect(textDisplays(message)[0]).toBe('### Going on now\n200 raids');
+    expect(textDisplays(message)[0]).toBe('### Today and coming up\n200 raids');
     const lines = linesUnder(message, '**Level 5**');
     const last = lines.at(-1);
     expect(last).toMatch(/^…and \d+ more$/);
@@ -200,13 +203,13 @@ describe('renderSummary', () => {
     // Every tier is there, if only to say how many it has, and so are the trains and meetups.
     const headings = textDisplays(message).map((text) => text.split('\n')[0]);
     expect(headings).toEqual([
-      '### Going on now',
+      '### Today and coming up',
       ...SUMMARY_TIERS.map(tierHeading),
       '**Trains**',
       '**Meetups**',
     ]);
     expect(textDisplays(message)[0]).toBe(
-      `### Going on now\n${String(raids.length)} raids · 30 trains · 30 meetups`,
+      `### Today and coming up\n${String(raids.length)} raids · 30 trains · 30 meetups`,
     );
     for (const heading of ['**Trains**', '**Meetups**']) {
       expect(linesUnder(message, heading).length).toBeGreaterThan(1);
@@ -247,7 +250,7 @@ describe('renderSummary with meetups', () => {
     const picnic = meetup(1, { start: PARTY_NOW + 2 * HOUR });
     const message = renderSummary([raid], PARTY_NOW, [picnic]);
     expect(textDisplays(message)).toEqual([
-      '### Going on now\n1 raid · 1 meetup',
+      '### Today and coming up\n1 raid · 1 meetup',
       '**Level 5**\n<#300000000000000001> · no time set · 1 trainer',
       `**Meetups**\n${link(picnic)} · starts ${stamp(PARTY_NOW + 2 * HOUR)} · 1 trainer`,
     ]);
@@ -261,7 +264,7 @@ describe('renderSummary with meetups', () => {
   it('counts only the meetups when there are only meetups', () => {
     const picnic = meetup(1);
     expect(textDisplays(renderSummary([], PARTY_NOW, [picnic]))).toEqual([
-      '### Going on now\n1 meetup',
+      '### Today and coming up\n1 meetup',
       `**Meetups**\n${link(picnic)} · no time set · 1 trainer`,
     ]);
   });
@@ -416,13 +419,13 @@ describe('renderSummary with trains', () => {
     );
     const picnic = { party: testMeetup(), title: 'Meetup · Community Day picnic' };
     expect(textDisplays(renderSummary([raid], PARTY_NOW, [picnic], [rolling]))).toEqual([
-      '### Going on now\n1 raid · 1 train · 1 meetup',
+      '### Today and coming up\n1 raid · 1 train · 1 meetup',
       '**Level 5**\n<#300000000000000001> · no time set · 1 trainer',
       `**Trains**\n${link(rolling)} · at The Stacks · starts ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
       '**Meetups**\n**Meetup · Community Day picnic** · no time set · 1 trainer',
     ]);
     expect(textDisplays(renderSummary([], PARTY_NOW, [], [rolling]))[0]).toBe(
-      '### Going on now\n1 train',
+      '### Today and coming up\n1 train',
     );
   });
 
@@ -504,7 +507,7 @@ describe('renderSummary with trains', () => {
       passing: [{ ...visiting, copyUrl: copy }, elsewhere],
     });
     expect(textDisplays(message)).toEqual([
-      '### Going on now\n1 train · 2 trains passing through',
+      '### Today and coming up\n1 train · 2 trains passing through',
       `**Trains**\n${link(own)} · at The Stacks · no time set · 1 trainer`,
       '**Passing through**\n' +
         `[Train · ${visiting.party.timed.name}](<${copy}>) · at Harbor Lighthouse Mural · no time set · 1 trainer\n` +
@@ -513,7 +516,7 @@ describe('renderSummary with trains', () => {
     // Passing through alone is something going on.
     expect(
       textDisplays(renderSummary([], PARTY_NOW, [], [], [], { passing: [elsewhere] }))[0],
-    ).toBe('### Going on now\n1 train passing through');
+    ).toBe('### Today and coming up\n1 train passing through');
   });
 
   it('keeps brackets in the name of a train linked to its copy from breaking the link (final review F3)', () => {
@@ -555,7 +558,7 @@ describe('renderSummary: "Today’s Stops" (plan 8X-G)', () => {
       textDisplays(
         renderSummary([], PARTY_NOW, [], [], [], { stops: { url: POST, tasks: 1, hideouts: 0 } }),
       ),
-    ).toEqual([NOTHING, `[Today’s Stops](<${POST}>): 1 task`]);
+    ).toEqual(['### Today and coming up\n1 task', `[Today’s Stops](<${POST}>): 1 task`]);
   });
 
   it('counts the day’s research waiting under an event’s window apart, with when it comes back (plan 8R-6)', () => {
@@ -567,7 +570,10 @@ describe('renderSummary: "Today’s Stops" (plan 8X-G)', () => {
           stops: { url: POST, tasks: 2, hideouts: 1, waiting: { tasks: 13, at } },
         }),
       ),
-    ).toEqual([NOTHING, `[Today’s Stops](<${POST}>): 2 tasks · 1 hideout · ${back}`]);
+    ).toEqual([
+      `### Today and coming up\n2 tasks · 1 hideout · ${back}`,
+      `[Today’s Stops](<${POST}>): 2 tasks · 1 hideout · ${back}`,
+    ]);
     // Only the day's research, waiting: the post is linked all the same.
     expect(
       textDisplays(
@@ -575,7 +581,7 @@ describe('renderSummary: "Today’s Stops" (plan 8X-G)', () => {
           stops: { url: POST, tasks: 0, hideouts: 0, waiting: { tasks: 13, at } },
         }),
       ),
-    ).toEqual([NOTHING, `[Today’s Stops](<${POST}>): ${back}`]);
+    ).toEqual([`### Today and coming up\n${back}`, `[Today’s Stops](<${POST}>): ${back}`]);
   });
 
   it('says nothing of the stops where nothing is reported', () => {
@@ -611,7 +617,7 @@ describe('renderSummary: max battles (plan 8X-3)', () => {
       ],
     );
     const texts = textDisplays(message);
-    expect(texts[0]).toBe('### Going on now\n1 raid · 4 max battles');
+    expect(texts[0]).toBe('### Today and coming up\n1 raid · 4 max battles');
     expect(linesUnder(message, '**Max battles**')).toEqual([
       `<#300000000000000703> · Dynamax 5★ · ends <t:${at('2026-10-13T14:30') / 1000}:R> · 1 trainer`,
       `**Battle 4** · Dynamax 2★ · ends <t:${at('2026-10-13T16:00') / 1000}:R> · 1 trainer`,
@@ -630,7 +636,7 @@ describe('renderSummary: max battles (plan 8X-3)', () => {
       [],
       [max(1, 'D2', '2026-10-13T21:00')],
     );
-    expect(textDisplays(over)[0]).toBe(`### Going on now\n${NOTHING_GOING}`);
+    expect(textDisplays(over)[0]).toBe(`### Today and coming up\n${NOTHING_GOING}`);
     const many = Array.from({ length: 150 }, (_unused, n) => max(n, 'D1', '2026-10-13T20:00'));
     const message = renderSummary([], PARTY_NOW, [], [], many);
     expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
@@ -638,3 +644,108 @@ describe('renderSummary: max battles (plan 8X-3)', () => {
     expectV2Sendable(message);
   });
 });
+
+describe('renderSummary: today and coming up (plan 8R-9)', () => {
+  const dated = (time: number) => `<t:${time / 1000}:f>`;
+  const POST = 'https://discord.com/channels/1/2/3';
+  let posts = 0;
+  const post = (): string => `3000000000000009${String(posts++).padStart(2, '0')}`;
+  const meetupAt = (order: number, start: number | null): ListedMeetup => {
+    const made = testMeetup({ id: ID(800 + order), now: PARTY_NOW + order * MINUTE });
+    const party: MeetupParty = {
+      ...made,
+      forumPostId: post(),
+      timed: { ...made.timed, startTime: start },
+    };
+    return { party, title: `Meetup · ${party.timed.name}` };
+  };
+  const trainAt = (order: number, start: number | null): ListedTrain => {
+    const made = testTrain({ id: ID(900 + order), now: PARTY_NOW + order * MINUTE });
+    const party: TrainParty = {
+      ...made,
+      forumPostId: post(),
+      timed: { ...made.timed, startTime: start },
+      train: { ...made.train, route: stops(4) },
+    };
+    return { party, title: `Train · ${party.timed.name}`, at: 'The Stacks' };
+  };
+  const link = (listed: { party: { forumPostId: string | null } }) =>
+    `<#${listed.party.forumPostId ?? ''}>`;
+
+  it('is titled "Today and coming up", the titles of before kept for taking a post over', () => {
+    expect(SUMMARY_TITLE).toBe('Today and coming up');
+    expect(LEGACY_SUMMARY_TITLES).toEqual(['Active raids', 'Going on now']);
+  });
+
+  it('lists what starts after midnight under Coming up, one list by start, its kind first (B8)', () => {
+    const today = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
+    const tonight = meetupAt(1, at('2026-10-13T22:00'));
+    const saturday = meetupAt(2, at('2026-10-17T13:00'));
+    const tomorrow = trainAt(3, at('2026-10-14T10:00'));
+    const elite = listed(
+      setHatchTime(
+        testRaid({ id: ID(2), tier: { level: 'Elite', shadow: false } }),
+        at('2026-10-15T11:00'),
+        rules,
+        PARTY_NOW,
+      ),
+      'Elite egg · Lost',
+      '300000000000000002',
+    );
+    const passing = { ...trainAt(4, at('2026-10-14T18:00')), copyUrl: POST };
+    const message = renderSummary([today, elite], PARTY_NOW, [tonight, saturday], [tomorrow], [], {
+      passing: [passing],
+      zone: PARTY_ZONE,
+    });
+    expect(textDisplays(message)).toEqual([
+      '### Today and coming up\n1 raid · 1 meetup today · 4 coming up',
+      '**Level 5**\n<#300000000000000001> · no time set · 1 trainer',
+      `**Meetups**\n${link(tonight)} · starts <t:${at('2026-10-13T22:00') / 1000}:R> · 1 trainer`,
+      '**Coming up**\n' +
+        [
+          `Train · ${link(tomorrow)} · ${dated(at('2026-10-14T10:00'))} · 1 trainer`,
+          `Train passing through · [Train · ${passing.party.timed.name}](<${POST}>) · ${dated(at('2026-10-14T18:00'))} · 1 trainer`,
+          `Elite raid · <#300000000000000002> · ${dated(at('2026-10-15T11:00'))} · 1 trainer`,
+          `Meetup · ${link(saturday)} · ${dated(at('2026-10-17T13:00'))} · 1 trainer`,
+        ].join('\n'),
+    ]);
+  });
+
+  it('counts the stops in the head and links them below, last (plan 8R-9)', () => {
+    const today = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
+    const texts = textDisplays(
+      renderSummary([today], PARTY_NOW, [meetupAt(1, at('2026-10-14T10:00'))], [], [], {
+        stops: { url: POST, tasks: 4, hideouts: 2 },
+        stopsBelow: true,
+        zone: PARTY_ZONE,
+      }),
+    );
+    expect(texts[0]).toBe(
+      '### Today and coming up\n1 raid today · 1 coming up · 4 tasks · 2 hideouts',
+    );
+    expect(texts.at(-1)).toBe(`[Today’s Stops](<${POST}>) (below): 4 tasks · 2 hideouts`);
+    // Elsewhere (`/status` in the region's channel) the stops are not below.
+    expect(
+      textDisplays(
+        renderSummary([today], PARTY_NOW, [], [], [], {
+          stops: { url: POST, tasks: 4, hideouts: 2 },
+        }),
+      ).at(-1),
+    ).toBe(`[Today’s Stops](<${POST}>): 4 tasks · 2 hideouts`);
+  });
+
+  it('keeps Coming up within the message beside many raids, counting what does not fit', () => {
+    const raids = Array.from({ length: 120 }, (_unused, n) =>
+      listed(testRaid({ id: ID(n) }), 'T5 egg', `3000000000000${String(n).padStart(5, '0')}`),
+    );
+    const later = Array.from({ length: 60 }, (_unused, n) =>
+      meetupAt(n, at('2026-10-15T10:00') + n * MINUTE),
+    );
+    const message = renderSummary(raids, PARTY_NOW, later, [], [], { zone: PARTY_ZONE });
+    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
+    const lines = linesUnder(message, '**Coming up**');
+    expect(lines.at(-1)).toMatch(/^…and \d+ more$/);
+    expect(lines.length).toBeGreaterThan(5);
+    expectV2Sendable(message);
+  });
+});
diff --git a/src/render/summary.ts b/src/render/summary.ts
index 2ede3019..8c073bab 100644
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -21,6 +21,7 @@ import {
 } from '../domain/pogo/raid-tier.js';
 import type { APIComponentInContainer } from 'discord.js';
 import type { V2Message } from '../discord/party-gateway.js';
+import { isToday, partyStart } from '../domain/party/board-day.js';
 import { startTimeOf, timedOver } from '../domain/party/timed.js';
 import { routeFinished } from '../domain/party/train.js';
 import { TEXT_BUDGET, trainerCount } from './party-post.js';
@@ -29,16 +30,19 @@ import { count, plain, timestamp } from './text.js';
 import { container, LIST_COLOUR, separator, textDisplay } from './v2.js';
 
 /**
- * The title of the pinned post that lists what goes on in a region: its raids, max battles,
- * trains and meetups (spec 5.1; plan 8X-G, Matt 2026-10-22: every kind of party, not raids alone).
+ * The title of the region's board (plan 8R-9): its locked pinned post that lists the region's
+ * raids, max battles, trains and meetups, today's and those coming up (spec 5.1; plan 8X-G, Matt
+ * 2026-10-22: every kind of party), with "Today’s Stops" below. Inside the region's forum the
+ * title needs no region name.
  */
-export const SUMMARY_TITLE = 'Going on now';
+export const SUMMARY_TITLE = 'Today and coming up';
 
 /**
- * The title the summary post had before plan 8X-G: a post of this title the bot made is taken
- * over as the region's summary (`takeOverSummary`) and renamed with its next edit.
+ * The titles the summary post had before (B12): "Active raids" before plan 8X-G, "Going on now"
+ * before plan 8R-9. A post of one of them the bot made is taken over as the region's summary
+ * (`takeOverSummary`) and renamed with its next edit.
  */
-export const LEGACY_SUMMARY_TITLE = 'Active raids';
+export const LEGACY_SUMMARY_TITLES: readonly string[] = ['Active raids', 'Going on now'];
 
 /** A raid for a list: the party and the title its post has. */
 export interface ListedRaid {
@@ -125,7 +129,8 @@ function timedWhen(party: TimedParty, now: number): string {
   return start === null ? 'no time set' : `started ${timestamp(start, 'R')}`;
 }
 
-function postOf(party: TimedParty, title: string): string {
+/** A party's post in a list, or its title while it has none. */
+function postOf(party: { forumPostId: string | null }, title: string): string {
   return party.forumPostId === null ? `**${plain(title)}**` : `<#${party.forumPostId}>`;
 }
 
@@ -170,26 +175,79 @@ export interface StopsLine {
 export interface SummaryMore {
   /** Trains of other regions of the server with a stop in this one. */
   passing?: readonly ListedTrain[];
-  /** The region's pinned post of the stops today; undefined where there is none. */
+  /** The region's post of the stops today; undefined where there is none. */
   stops?: StopsLine | undefined;
+  /**
+   * Whether the stops are below this message, in the region's board (plan 8R-9: the board post
+   * itself, not `/status` in the region's channel): their line says "(below)".
+   */
+  stopsBelow?: boolean;
+  /**
+   * `settings.timezone` (plan 8R-9, B8): what starts after the next local midnight is listed
+   * under Coming up (`isToday`). Without it everything is today's.
+   */
+  zone?: string;
 }
 
 /**
- * The line of the stops: `[Today’s Stops](<link>): 6 tasks · 2 hideouts`, in the post's order,
- * and under an event's window the day's research waiting named apart, last as in the post:
- * `· 13 tasks back at 5:00 PM` (plan 8R-6); undefined where nothing is reported.
+ * The counts of the stops, in the post's order: `6 tasks · 2 hideouts`, and under an event's
+ * window the day's research waiting named apart, last as in the post: `13 tasks back at 5:00 PM`
+ * (plan 8R-6); none where nothing is reported.
  */
-function stopsLine(stops: StopsLine | undefined): string | undefined {
-  if (stops === undefined) return undefined;
+function stopCounts(stops: StopsLine | undefined): string[] {
+  if (stops === undefined) return [];
   const waiting = stops.waiting;
-  const counts = [
+  return [
     ...(stops.tasks > 0 ? [count(stops.tasks, 'task')] : []),
     ...(stops.hideouts > 0 ? [count(stops.hideouts, 'hideout')] : []),
     ...(waiting !== undefined && waiting.tasks > 0
       ? [`${count(waiting.tasks, 'task')} back at ${timestamp(waiting.at, 't')}`]
       : []),
   ];
-  return counts.length === 0 ? undefined : `[Today’s Stops](<${stops.url}>): ${counts.join(' · ')}`;
+}
+
+/**
+ * The line of the stops: `[Today’s Stops](<link>): 6 tasks · 2 hideouts`, with "(below)" after
+ * the link in the board itself (plan 8R-9: the link goes to the first message of the stops under
+ * the summary); undefined where nothing is reported.
+ */
+function stopsLine(stops: StopsLine | undefined, below: boolean): string | undefined {
+  const counts = stopCounts(stops);
+  if (stops === undefined || counts.length === 0) return undefined;
+  return `[Today’s Stops](<${stops.url}>)${below ? ' (below)' : ''}: ${counts.join(' · ')}`;
+}
+
+/** The heading of what starts after the next local midnight (plan 8R-9, B8). */
+export const COMING_UP_HEADING = '**Coming up**';
+
+/** A party of the list under Coming up: its kind first, its post, its date and time, its count. */
+interface Later {
+  start: number;
+  createdAt: number;
+  line: string;
+}
+
+/**
+ * A line of Coming up (plan 8R-9): its kind first, its post (a train passing through: its copy
+ * here), the full date and time of its start (`f`, each reader's own zone) and how many come:
+ * `Meetup · <post> · <t:…:f> · 7 trainers`.
+ */
+function laterLine(
+  kind: string,
+  post: string,
+  start: number,
+  party: TimedParty | RaidParty,
+): Later {
+  return {
+    start,
+    createdAt: party.createdAt,
+    line: `${kind} · ${post} · ${timestamp(start, 'f')} · ${trainerCount(party)}`,
+  };
+}
+
+/** What a train is called under Coming up: `Train`, or its kind's words (plan 8X-4). */
+function trainWord(party: TrainParty): string {
+  return party.train.kind === 'raid' ? 'Train' : TRAIN_KIND_WORDS[party.train.kind];
 }
 
 /** The heading of the trains in a region's list, under its raids and above its meetups. */
@@ -280,25 +338,28 @@ export function tierHeading(tier: RaidTier): string {
 const sureRoom = (heading: string): number => heading.length + 1 + 20;
 
 /**
- * The summary of a region as a components-v2 message (the draft "In the channels"): one
- * container, `### Going on now` (`SUMMARY_TITLE`) with a count of what is going on (`5 raids · 2
- * trains · 1 meetup · 1 train passing through`, only the kinds there are; `NOTHING_GOING` when there
- * is nothing), then the raids that
+ * The summary of a region as a components-v2 message (the draft "In the channels"; plan 8R-9:
+ * the region's board): one container, `### Today and coming up` (`SUMMARY_TITLE`) with a count of
+ * what is on (`3 raids · 1 train today · 2 coming up · 4 tasks · 2 hideouts`, only the kinds there
+ * are, " today" after today's where something is coming up, the stops as their line counts them;
+ * `NOTHING_GOING` when no party is listed), then today's (`isToday` in `more.zone`): the raids that
  * have not ended by the clock under a bold heading per tier (`SUMMARY_TIERS`, the soonest end
  * first in each; a raid that has ended but whose post is still open is left out), then the max
  * battles whose end has not come (plan 8X-3, `MAX_BATTLES_HEADING`: 5 stars down to 1,
  * Gigantamax last, the soonest end first in each), then the trains, the trains of other regions
  * passing through (plan 8X-G, `PASSING_HEADING`, `more.passing`: each linked to its copy in this
  * region's channel where it has one, `copyUrl`) and the meetups, each under its heading: those
- * that are not over, by their start, then those without one in the order they were made; last,
- * after a line, the region's post of the stops today with its counts (`more.stops`, `stopsLine`;
- * nothing where nothing is reported). One text display per tier and section, so the component
- * count stays small whatever is listed.
+ * that are not over, by their start, then those without one in the order they were made; then,
+ * after a line, what starts after the next local midnight, every kind in one list by start under
+ * `COMING_UP_HEADING` (plan 8R-9, B8: `laterLine`); last, after a line, the region's post of the
+ * stops today with its counts (`more.stops`, `stopsLine`, "(below)" in the board itself; nothing
+ * where nothing is reported). One text display per tier and section, so the component count stays
+ * small whatever is listed.
  *
- * All of it keeps within `TEXT_BUDGET`: the max battles, the trains, the trains passing through
- * and the meetups are each sure of some room
- * (`SECTION_ROOM`), every tier below another of its heading and a line, and each has all that is
- * left over what the ones after it are sure of; what does not fit is counted (`…and N more`).
+ * All of it keeps within `TEXT_BUDGET`: the max battles, the trains, the trains passing through,
+ * the meetups and Coming up are each sure of some room (`SECTION_ROOM`), every tier below another
+ * of its heading and a line, and each has all that is left over what the ones after it are sure
+ * of; what does not fit is counted (`…and N more`).
  */
 export function renderSummary(
   raids: readonly ListedRaid[],
@@ -308,6 +369,10 @@ export function renderSummary(
   maxBattles: readonly ListedMax[] = [],
   more: SummaryMore = {},
 ): V2Message {
+  const { zone } = more;
+  // Today's, by the one rule of the board (plan 8R-9, B8); everything without a zone.
+  const today = (party: RaidParty | TimedParty): boolean =>
+    zone === undefined || isToday(party, now, zone);
   const going = raids
     .filter(({ party }) => party.status === 'active' && raidStage(party, now) !== 'ended')
     .sort((a, b) => endOf(a.party) - endOf(b.party) || a.party.createdAt - b.party.createdAt);
@@ -319,18 +384,58 @@ export function renderSummary(
         (a.party.endTime ?? 0) - (b.party.endTime ?? 0) ||
         a.party.createdAt - b.party.createdAt,
     );
-  const plannedTrains = planned(trains, now);
-  const plannedMeetups = planned(meetups, now);
-  const passing = planned(more.passing ?? [], now);
-  const stops = stopsLine(more.stops);
-  const counts = [
-    ...(going.length > 0 ? [count(going.length, 'raid')] : []),
+  const allTrains = planned(trains, now);
+  const allMeetups = planned(meetups, now);
+  const allPassing = planned(more.passing ?? [], now);
+  const raidsToday = going.filter(({ party }) => today(party));
+  const trainsToday = allTrains.filter(({ party }) => today(party));
+  const meetupsToday = allMeetups.filter(({ party }) => today(party));
+  const passingToday = allPassing.filter(({ party }) => today(party));
+  // What starts after midnight has a start (no start is today's): one list by it.
+  const startOf = (party: RaidParty | TimedParty): number => partyStart(party) ?? now;
+  const comingUp: Later[] = [
+    ...going
+      .filter(({ party }) => !today(party))
+      .map(({ party, title }) =>
+        laterLine(raidWords(party.raid.tier), postOf(party, title), startOf(party), party),
+      ),
+    ...allTrains
+      .filter(({ party }) => !today(party))
+      .map(({ party, title }) =>
+        laterLine(trainWord(party), postOf(party, title), startOf(party), party),
+      ),
+    ...allPassing
+      .filter(({ party }) => !today(party))
+      .map(({ party, title, copyUrl }) =>
+        laterLine(
+          `${trainWord(party)} passing through`,
+          copyUrl === undefined ? postOf(party, title) : `[${linkTextOf(title)}](<${copyUrl}>)`,
+          startOf(party),
+          party,
+        ),
+      ),
+    ...allMeetups
+      .filter(({ party }) => !today(party))
+      .map(({ party, title }) => laterLine('Meetup', postOf(party, title), startOf(party), party)),
+  ].sort((a, b) => a.start - b.start || a.createdAt - b.createdAt);
+  const stops = stopsLine(more.stops, more.stopsBelow === true);
+  const todayCounts = [
+    ...(raidsToday.length > 0 ? [count(raidsToday.length, 'raid')] : []),
     ...(maxOn.length > 0 ? [count(maxOn.length, 'max battle')] : []),
-    ...(plannedTrains.length > 0 ? [count(plannedTrains.length, 'train')] : []),
-    ...(plannedMeetups.length > 0 ? [count(plannedMeetups.length, 'meetup')] : []),
-    ...(passing.length > 0 ? [`${count(passing.length, 'train')} passing through`] : []),
+    ...(trainsToday.length > 0 ? [count(trainsToday.length, 'train')] : []),
+    ...(meetupsToday.length > 0 ? [count(meetupsToday.length, 'meetup')] : []),
+    ...(passingToday.length > 0 ? [`${count(passingToday.length, 'train')} passing through`] : []),
+  ];
+  // " today" after the last of today's where something is coming up, so the two read apart.
+  const counts = [
+    ...todayCounts.map((text, index) =>
+      comingUp.length > 0 && index === todayCounts.length - 1 ? `${text} today` : text,
+    ),
+    ...(comingUp.length > 0 ? [`${String(comingUp.length)} coming up`] : []),
   ];
-  const head = `### ${SUMMARY_TITLE}\n${counts.length === 0 ? NOTHING_GOING : counts.join(' · ')}`;
+  // The parties' counts and the stops' together; `NOTHING_GOING` only where both are none (P7).
+  const all = [...counts, ...stopCounts(more.stops)];
+  const head = `### ${SUMMARY_TITLE}\n${all.length === 0 ? NOTHING_GOING : all.join(' · ')}`;
   // The line of the stops is last, after a line, and its room is kept from the start.
   const tail: APIComponentInContainer[] =
     stops === undefined ? [] : [separator(), textDisplay(stops)];
@@ -342,33 +447,46 @@ export function renderSummary(
     texts.reduce((sum, text) => sum + text.length + 1, 0);
   const tiers = SUMMARY_TIERS.map((tier) => ({
     heading: tierHeading(tier),
-    lines: going
+    lines: raidsToday
       .filter(({ party }) => sameRaidTier(party.raid.tier, tier))
       .map((raid) => raidLine(raid, now)),
-    raid: true,
+    group: 'raids',
     // A tier is sure of its heading and the line that counts what does not fit.
     sure: (heading: string) => sureRoom(heading),
   }));
   const timed = [
-    { heading: MAX_BATTLES_HEADING, lines: maxOn.map((battle) => maxLine(battle)) },
-    { heading: TRAINS_HEADING, lines: plannedTrains.map((train) => trainLine(train, now)) },
-    { heading: PASSING_HEADING, lines: passing.map((train) => trainLine(train, now)) },
-    { heading: MEETUPS_HEADING, lines: plannedMeetups.map((meetup) => meetupLine(meetup, now)) },
+    { heading: MAX_BATTLES_HEADING, lines: maxOn.map((battle) => maxLine(battle)), group: 'today' },
+    {
+      heading: TRAINS_HEADING,
+      lines: trainsToday.map((train) => trainLine(train, now)),
+      group: 'today',
+    },
+    {
+      heading: PASSING_HEADING,
+      lines: passingToday.map((train) => trainLine(train, now)),
+      group: 'today',
+    },
+    {
+      heading: MEETUPS_HEADING,
+      lines: meetupsToday.map((meetup) => meetupLine(meetup, now)),
+      group: 'today',
+    },
+    { heading: COMING_UP_HEADING, lines: comingUp.map((later) => later.line), group: 'later' },
   ].map((section) => ({
     ...section,
-    raid: false,
     sure: (heading: string) => Math.min(heading.length + 1 + size(section.lines), SECTION_ROOM),
   }));
   const sections = [...tiers, ...timed]
     .filter((section) => section.lines.length > 0)
-    .map(({ heading, lines, raid, sure }) => ({ heading, lines, raid, room: sure(heading) }));
+    .map(({ heading, lines, group, sure }) => ({ heading, lines, group, room: sure(heading) }));
   const reserved = (from: number): number =>
     sections.slice(from).reduce((sum, section) => sum + section.room, 0);
   let used = head.length + tailRoom;
   const parts: APIComponentInContainer[] = [textDisplay(head)];
   for (const [index, section] of sections.entries()) {
-    // A line under the count, and one between the raids and what follows them.
-    if (index === 0 || section.raid !== sections[index - 1]?.raid) parts.push(separator());
+    // A line under the count, one between the raids and what follows them, and one above what
+    // is coming up.
+    if (index === 0 || section.group !== sections[index - 1]?.group) parts.push(separator());
     const room = TEXT_BUDGET - used - reserved(index + 1) - section.heading.length - 1;
     const text = [section.heading, ...fitLines(section.lines, room)].join('\n');
     used += text.length;
diff --git a/src/services/party-service.max.test.ts b/src/services/party-service.max.test.ts
index 19f7c569..dd0ad854 100644
--- a/src/services/party-service.max.test.ts
+++ b/src/services/party-service.max.test.ts
@@ -226,7 +226,7 @@ describe('PartyService.reportMax (plan 8X-3)', () => {
   it('lists it in the summary of its region, after the raids', async () => {
     const made = await reportedMax();
     const texts = textDisplays(made.service.summaryMessage(1));
-    expect(texts[0]).toBe('### Going on now\n1 max battle');
+    expect(texts[0]).toBe('### Today and coming up\n1 max battle');
     expect(texts).toContainEqual(
       `**Max battles**\n<#${made.postId}> · Dynamax 2★ · ends <t:${END / 1000}:R> · 1 trainer`,
     );
diff --git a/src/services/party-service.meetup.test.ts b/src/services/party-service.meetup.test.ts
index 04e34b2b..383d1ad3 100644
--- a/src/services/party-service.meetup.test.ts
+++ b/src/services/party-service.meetup.test.ts
@@ -372,11 +372,11 @@ describe('PartyService: the post of a meetup', () => {
   it('lists the meetup in the summary of its region, under the raids', async () => {
     const made = await createdMeetup();
     expect(textDisplays(made.service.summaryMessage(1))).toEqual([
-      '### Going on now\n1 meetup',
+      '### Today and coming up\n1 meetup',
       `**Meetups**\n<#${made.postId}> · no time set · 1 trainer`,
     ]);
     expect(textDisplays(made.service.summaryMessage(2))).toEqual([
-      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     ]);
     const gym = gymsFixture().get(1);
     if (!gym) throw new Error('no gym');
@@ -390,7 +390,7 @@ describe('PartyService: the post of a meetup', () => {
     });
     if (raid.kind !== 'created') throw new Error(raid.kind);
     expect(textDisplays(made.service.summaryMessage(1))).toEqual([
-      '### Going on now\n1 raid · 1 meetup',
+      '### Today and coming up\n1 raid · 1 meetup',
       `**Level 5**\n<#${raid.party.forumPostId ?? ''}> · no time set · 1 trainer`,
       `**Meetups**\n<#${made.postId}> · no time set · 1 trainer`,
     ]);
@@ -404,7 +404,7 @@ describe('PartyService: the post of a meetup', () => {
     const summaryId = before.regions.byId(1)?.summaryMessageId ?? '';
     const text = () => textOf(before.gateway.posts.get(summaryId)?.message);
     expect(text()).toBe(
-      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     );
 
     const outcome = await before.service.createMeetup({
@@ -423,7 +423,7 @@ describe('PartyService: the post of a meetup', () => {
     await before.service.end(outcome.party.id);
     await before.service.flush();
     expect(text()).toBe(
-      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     );
   });
 });
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index 6f6b2fa8..9c326e4d 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -5,7 +5,11 @@ import { loadSettings } from '../config/settings.js';
 import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
 import { EGG_FOLDER, EggPictures } from './egg-pictures.js';
 import { describe, expect, it, vi } from 'vitest';
-import { FakePartyGateway, missingPermissions } from '../../test/support/fake-gateway.js';
+import {
+  FakePartyGateway,
+  missingPermissions,
+  networkAway,
+} from '../../test/support/fake-gateway.js';
 import {
   EAST_CHANNEL,
   EAST_FORUM,
@@ -58,6 +62,22 @@ const SUPER_MEGA = { level: 'SuperMega', shadow: false } as const;
 const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });
 
 /** Changes the text of region 1 summary without any call to Discord: a raid that has no post yet. */
+/** A meetup made through the service, starting at `startTime`: its post. */
+async function addMeetup(
+  made: Awaited<ReturnType<typeof partyServiceWith>>,
+  startTime: number,
+): Promise<{ postId: string }> {
+  const outcome = await made.service.createMeetup({
+    name: 'Community Day picnic',
+    creatorId: REPORTER,
+    regionChannelId: WEST_CHANNEL,
+    startTime,
+  });
+  if (outcome.kind !== 'created') throw new Error(outcome.kind);
+  await made.service.flush();
+  return { postId: outcome.party.forumPostId ?? '' };
+}
+
 async function addQuietRaid(
   made: Awaited<ReturnType<typeof partyServiceWith>>,
   overrides: Parameters<typeof testRaid>[0] = {},
@@ -447,9 +467,9 @@ describe('PartyService: the summary and tidying up', () => {
     const west = regions.rows[0]!;
     await expect(service.ensureSummary(west)).resolves.toBe(true);
     const [summary] = gateway.postsIn(WEST_FORUM);
-    expect(summary).toMatchObject({ title: 'Going on now', pinned: true, tagIds: [] });
+    expect(summary).toMatchObject({ title: 'Today and coming up', pinned: true, tagIds: [] });
     expect(textOf(summary?.message)).toBe(
-      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     );
     expect(regions.summaries).toEqual([
       { id: 1, forumChannelId: WEST_FORUM, messageId: summary?.id },
@@ -458,6 +478,167 @@ describe('PartyService: the summary and tidying up', () => {
     expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
   });
 
+  it('locks the board when it makes it, and pins and locks it again whenever it is drawn (plan 8R-9, B4)', async () => {
+    const made = await partyServiceWith();
+    const { service, gateway, regions } = made;
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
+    expect(board).toMatchObject({ pinned: true, locked: true });
+    // A moderator unlocked it, and a week without messages archived it (unpinned on opening).
+    board.locked = false;
+    board.archived = true;
+    board.pinned = false;
+    // The stops were drawn in it (opening it): the summary's text is the same, yet both are back.
+    service.summaryChanged(west.id, true);
+    await service.flush();
+    expect(board).toMatchObject({ pinned: true, locked: true });
+    // A change of the text: the same after its edit.
+    board.locked = false;
+    await addQuietRaid(made);
+    service.summaryChanged(west.id);
+    await service.flush();
+    expect(textOf(board.message)).toMatch(/1 raid/);
+    expect(board.locked).toBe(true);
+  });
+
+  it('says once that it may not lock the board, and pins it all the same (B4)', async () => {
+    const { service, gateway, regions, entries } = await partyServiceWith();
+    const west = regions.rows[0]!;
+    gateway.failing.set('lockPost', missingPermissions('PATCH'));
+    await service.ensureSummary(west);
+    service.summaryChanged(west.id, true);
+    await service.flush();
+    expect(gateway.posts.get(west.summaryMessageId ?? '')).toMatchObject({
+      pinned: true,
+      locked: false,
+    });
+    expect(entries.filter((entry) => entry.msg === 'could not lock the board post')).toHaveLength(
+      1,
+    );
+  });
+
+  it('says in the setup that the board could not be locked, and why (review P12)', async () => {
+    const { service, gateway } = await partyServiceWith();
+    gateway.failing.set('lockPost', missingPermissions('PATCH'));
+    const results = await service.setupForums(gateway.guildId);
+    expect(results.find((one) => one.region.channelId === WEST_CHANNEL)).toMatchObject({
+      summary: true,
+      unlocked: 'refused',
+    });
+    gateway.failing.set('lockPost', new Error('Discord is away'));
+    gateway.posts.clear();
+    const again = await service.setupForums(gateway.guildId);
+    expect(again.find((one) => one.region.channelId === WEST_CHANNEL)).toMatchObject({
+      unlocked: 'failed',
+    });
+  });
+
+  it('makes the board anew when it was deleted while its text stood (review P2)', async () => {
+    const { service, gateway, regions } = await partyServiceWith();
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    const old = west.summaryMessageId ?? '';
+    // Deleted by hand; the stops were drawn (or tried to be) in it: the text is the same.
+    gateway.gone.add(old);
+    service.summaryChanged(west.id, true);
+    await service.flush();
+    expect(west.summaryMessageId).not.toBe(old);
+    expect(gateway.posts.get(west.summaryMessageId ?? '')).toMatchObject({
+      pinned: true,
+      locked: true,
+    });
+  });
+
+  it('takes over a post titled "Going on now", as before plan 8R-9, and renames it (B12)', async () => {
+    const made = await partyServiceWith();
+    const { service, gateway, regions } = made;
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    const old = west.summaryMessageId ?? '';
+    gateway.posts.get(old)!.title = 'Going on now';
+    west.summaryMessageId = null;
+    await expect(service.ensureSummary(west)).resolves.toBe(false);
+    expect(west.summaryMessageId).toBe(old);
+    await addQuietRaid(made);
+    await service.flush();
+    expect(gateway.posts.get(old)).toMatchObject({ title: 'Today and coming up', locked: true });
+  });
+
+  it('lists what starts after midnight under Coming up, and the stops as below it (B8)', async () => {
+    const made = await partyServiceWith();
+    const { service, gateway } = made;
+    const tomorrow = await addMeetup(made, at('2026-10-14T18:00'));
+    const texts = textDisplays(service.summaryMessage(1, 'board'));
+    expect(texts[0]).toBe('### Today and coming up\n1 coming up');
+    expect(texts.at(-1)).toBe(
+      `**Coming up**\nMeetup · <#${tomorrow.postId}> · <t:${at('2026-10-14T18:00') / 1000}:f> · 1 trainer`,
+    );
+    service.setStopPosts({
+      summaryOf: () => ({
+        serverId: gateway.guildId,
+        threadId: '1700000000000000009',
+        messageId: '1700000000000000001',
+        tasks: 2,
+        hideouts: 0,
+      }),
+      boardChanged: () => undefined,
+    });
+    // In the board the stops are below; in `/status` in the region's channel they are not.
+    expect(textDisplays(service.summaryMessage(1, 'board')).at(-1)).toMatch(
+      /^\[Today’s Stops\]\(<[^>]+>\) \(below\): 2 tasks$/,
+    );
+    expect(textDisplays(service.summaryMessage(1)).at(-1)).toMatch(
+      /^\[Today’s Stops\]\(<[^>]+>\): 2 tasks$/,
+    );
+  });
+
+  it('draws every summary anew at local midnight, so tomorrow’s parties become today’s (B7)', async () => {
+    const timers: { run: () => void; ms: number }[] = [];
+    const made = await partyServiceWith([], {
+      setTimer: (run, ms) => {
+        timers.push({ run, ms });
+        return () => undefined;
+      },
+    });
+    const { service, regions, gateway, clock } = made;
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    await addMeetup(made, at('2026-10-14T18:00'));
+    await service.flush();
+    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
+    expect(textOf(board.message)).toMatch(/^### Today and coming up\n1 coming up/);
+    service.watchMidnight();
+    // A second after midnight, as the other timers (review P10).
+    const midnight = timers.find(
+      (timer) => timer.ms === at('2026-10-14T00:00') - clock.now + 1_000,
+    );
+    expect(midnight).toBeDefined();
+    clock.now = at('2026-10-14T00:00:01');
+    midnight?.run();
+    await service.flush();
+    expect(textOf(board.message)).toMatch(/^### Today and coming up\n1 meetup/);
+    // And the next midnight is waited for.
+    expect(timers.at(-1)?.ms).toBe(at('2026-10-15T00:00') - at('2026-10-14T00:00:01') + 1_000);
+  });
+
+  it('draws the summaries anew on a catch-up (B7)', async () => {
+    const made = await partyServiceWith();
+    const { service, regions, gateway } = made;
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    // An edit the network failed: the summary stands as it was.
+    gateway.failing.set('editPost', networkAway());
+    await addQuietRaid(made);
+    await service.flush();
+    gateway.failing.delete('editPost');
+    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
+    expect(textOf(board.message)).not.toMatch(/1 raid/);
+    service.redrawPosts();
+    await service.flush();
+    expect(textOf(board.message)).toMatch(/^### Today and coming up\n1 raid/);
+  });
+
   it('makes a new summary post when the old one was deleted', async () => {
     const { service, gateway, regions } = await partyServiceWith();
     const west = regions.rows[0]!;
@@ -489,10 +670,12 @@ describe('PartyService: the summary and tidying up', () => {
     expect(entries.filter((entry) => entry.msg === 'could not pin the summary post')).toEqual([]);
     // The post taken over shows the region's list as it is now.
     await service.flush();
-    expect(textOf(gateway.posts.get(pinned ?? '')?.message)).toMatch(/^### Going on now\n1 raid/);
+    expect(textOf(gateway.posts.get(pinned ?? '')?.message)).toMatch(
+      /^### Today and coming up\n1 raid/,
+    );
   });
 
-  it('takes over a summary post made as "Active raids" and renames it "Going on now" (plan 8X-G)', async () => {
+  it('takes over a summary post made as "Active raids" and renames it "Today and coming up" (plan 8X-G)', async () => {
     const made = await partyServiceWith();
     const { service, gateway, regions } = made;
     const west = regions.rows[0]!;
@@ -505,8 +688,8 @@ describe('PartyService: the summary and tidying up', () => {
     await expect(service.ensureSummary(west)).resolves.toBe(false);
     expect(west.summaryMessageId).toBe(old);
     await service.flush();
-    expect(gateway.posts.get(old)).toMatchObject({ title: 'Going on now', renames: 1 });
-    expect(textOf(gateway.posts.get(old)?.message)).toMatch(/^### Going on now\n1 raid/);
+    expect(gateway.posts.get(old)).toMatchObject({ title: 'Today and coming up', renames: 1 });
+    expect(textOf(gateway.posts.get(old)?.message)).toMatch(/^### Today and coming up\n1 raid/);
     // Its record kept, a later render renames nothing more.
     service.summaryChanged(west.id);
     await service.flush();
@@ -545,7 +728,7 @@ describe('PartyService: the summary and tidying up', () => {
     expect(due).toBeDefined();
     due?.run();
     await service.flush();
-    expect(post.title).toBe('Going on now');
+    expect(post.title).toBe('Today and coming up');
     expect(post.edits).toBe(edits);
   });
 
@@ -575,7 +758,7 @@ describe('PartyService: the summary and tidying up', () => {
     }));
     service.summaryChanged(west.id);
     await service.flush();
-    expect(post.title).toBe('Going on now');
+    expect(post.title).toBe('Today and coming up');
   });
 
   it('tries a rename that failed otherwise again after the rename window (review r1, R1-5)', async () => {
@@ -601,7 +784,7 @@ describe('PartyService: the summary and tidying up', () => {
     expect(due).toBeDefined();
     due?.run();
     await service.flush();
-    expect(post.title).toBe('Going on now');
+    expect(post.title).toBe('Today and coming up');
   });
 
   it('links the region’s post of the stops today, with its counts (plan 8X-G)', async () => {
@@ -1191,7 +1374,7 @@ describe('PartyService: renders, tags and the summary', () => {
     made.service.ended(ended?.party ?? made.party);
     await made.service.flush();
     expect(summary()).toBe(
-      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     );
   });
 
@@ -1237,7 +1420,7 @@ describe('PartyService: renders, tags and the summary', () => {
     await made.service.flush();
     expect(made.gateway.converted).toEqual([{ id: summaryId, direct: false }]);
     expect(textOf(made.gateway.posts.get(summaryId)?.message)).toMatch(
-      /^### Going on now\n2 raids/,
+      /^### Today and coming up\n2 raids/,
     );
   });
 
diff --git a/src/services/party-service.train.test.ts b/src/services/party-service.train.test.ts
index 22665784..0fe969aa 100644
--- a/src/services/party-service.train.test.ts
+++ b/src/services/party-service.train.test.ts
@@ -201,7 +201,7 @@ describe('PartyService: the post of a train', () => {
     const made = await createdTrain({ route: [4, 1] });
     const trainLine = () => textDisplays(made.service.summaryMessage(1))[1]?.split('\n')[1];
     expect(textDisplays(made.service.summaryMessage(1))).toEqual([
-      '### Going on now\n1 train',
+      '### Today and coming up\n1 train',
       `**Trains**\n<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
     ]);
     await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
@@ -210,7 +210,7 @@ describe('PartyService: the post of a train', () => {
     await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
     expect(trainLine()).toBe(`<#${made.postId}> · route finished · no time set · 1 trainer`);
     expect(textDisplays(made.service.summaryMessage(2))).toEqual([
-      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     ]);
   });
 });
@@ -232,12 +232,14 @@ describe('PartyService: a train passing through another region (plan 8X-G)', ()
     const summary = () => textOf(made.gateway.posts.get(east.summaryMessageId ?? '')?.message);
     const url = `https://discord.com/channels/${made.gateway.guildId}/${EAST_CHANNEL}/${copy.messageId}`;
     expect(summary()).toBe(
-      '### Going on now\n1 train passing through\n' +
+      '### Today and coming up\n1 train passing through\n' +
         `**Passing through**\n[Train · Saturday legendaries](<${url}>) · at Veterans Memorial ` +
         'Bridge · no time set · 1 trainer',
     );
     // Its own region lists it as its train, not as passing through.
-    expect(textDisplays(made.service.summaryMessage(1))[0]).toBe('### Going on now\n1 train');
+    expect(textDisplays(made.service.summaryMessage(1))[0]).toBe(
+      '### Today and coming up\n1 train',
+    );
     // A move of the train is shown in East's summary too.
     await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
     await made.service.flush();
@@ -246,7 +248,7 @@ describe('PartyService: a train passing through another region (plan 8X-G)', ()
     await made.trains.removeStop(made.party.id, { id: REPORTER }, 2);
     await made.service.flush();
     expect(summary()).toBe(
-      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     );
   });
 });
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 0571da21..135a5ead 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -109,6 +109,7 @@ import {
 } from '../render/raid-post.js';
 import { summaryRefusedWords } from '../render/activity.js';
 import { postLink } from '../render/notify-dm.js';
+import { nextLocalMidnight } from '../domain/party/board-day.js';
 import {
   maxTitle,
   renderMaxPost,
@@ -117,7 +118,7 @@ import {
   spotNow,
 } from '../render/max-post.js';
 import {
-  LEGACY_SUMMARY_TITLE,
+  LEGACY_SUMMARY_TITLES,
   renderRegionLink,
   renderSummary,
   SUMMARY_TITLE,
@@ -527,10 +528,14 @@ class HiddenForumRefused extends Error {
 /** Whether a summary post was pinned (`refused`: the bot lacks Manage Posts; `failed`: else). */
 type SummaryPin = 'pinned' | 'refused' | 'failed';
 
-/** Whether a summary post was made, and why it is not pinned where it could not be. */
+/**
+ * Whether a summary post was made, and why it is not pinned or locked (plan 8R-9, review P12)
+ * where it could not be.
+ */
 interface SummaryMade {
   made: boolean;
   unpinned?: Exclude<SummaryPin, 'pinned'>;
+  unlocked?: Exclude<SummaryPin, 'pinned'>;
 }
 
 /** What `/admin setup-forums` did for one region. */
@@ -561,6 +566,11 @@ export interface ForumSetup {
    * in the forum, `failed` for anything else (logged). It is made and kept all the same.
    */
   unpinned?: Exclude<SummaryPin, 'pinned'>;
+  /**
+   * Set when a new board could not be locked (plan 8R-9, review P12): `refused` where the bot
+   * lacks Manage Posts in the forum, `failed` for anything else (logged).
+   */
+  unlocked?: Exclude<SummaryPin, 'pinned'>;
   /**
    * Whether the making of posts in the forum was left to the bot now (`reserved`), or could
    * not be (`not-allowed`: the bot may not change the permissions of the forum); absent when
@@ -699,6 +709,15 @@ export class PartyService {
 
   /** The regions whose summary post Discord refused to rename, said once in the log. */
   private readonly renameRefused = new Set<number>();
+  /** The regions whose board Discord refused to lock (plan 8R-9), said once in the log. */
+  private readonly lockRefused = new Set<number>();
+  /**
+   * The regions whose board's pin and lock are checked at the summary's next draw, whether or not
+   * its text changed (plan 8R-9, B4: the stops were drawn in it, which opens it if archived).
+   */
+  private readonly boardChecks = new Set<number>();
+  /** Cancels the timer of the next local midnight (plan 8R-9, B7); none until `watchMidnight`. */
+  private midnightTimer: (() => void) | undefined;
   /** The timers that try a summary post's rename again, by region (review r1, R1-6). */
   private readonly summaryRenameTimers = new Map<number, { cancel: () => void }>();
   /** The renames those timers have under way, which `flush` waits for. */
@@ -2284,9 +2303,14 @@ export class PartyService {
     this.showAllAnew();
   }
 
-  /** Every active post shown anew, paced (`emojiChanged`, `redrawPosts`). */
+  /**
+   * Every active post shown anew, paced (`emojiChanged`, `redrawPosts`), and every summary drawn
+   * anew (plan 8R-9, B7: a midnight passed while the network was away); one that reads the same
+   * is not edited.
+   */
   private showAllAnew(): void {
     if (this.closed) return;
+    this.allSummaries();
     this.emojiQueue = this.options.store
       .active()
       .filter((party) => party.forumPostId !== null)
@@ -2328,11 +2352,45 @@ export class PartyService {
     if (party.type === 'train' && party.guildId !== undefined) this.serverSummaries(party.guildId);
   }
 
-  /** The summary of a region is brought up to date shortly. */
-  summaryChanged(regionId: number): void {
+  /**
+   * The summary of a region is brought up to date shortly; with `checkBoard` its post's pin and
+   * lock are checked too, whether or not its text changed (plan 8R-9, B4: told after each draw of
+   * the stops in it, which opens an archived board).
+   */
+  summaryChanged(regionId: number, checkBoard = false): void {
+    if (checkBoard) this.boardChecks.add(regionId);
     this.summaries.request(regionId);
   }
 
+  /**
+   * Draws every region's summary anew at each local midnight from now on (plan 8R-9, B7: what
+   * starts tomorrow moves from Coming up to today), also in rehearsal mode. Luxon's midnight in
+   * `settings.timezone`, so a day of a change of the clocks is 23 or 25 hours long. A summary
+   * that reads the same is not edited. Nothing after `close`.
+   */
+  watchMidnight(): void {
+    if (this.closed) return;
+    this.midnightTimer?.();
+    const now = this.now();
+    this.midnightTimer = this.setTimer(
+      () => {
+        this.midnightTimer = undefined;
+        if (this.closed) return;
+        this.allSummaries();
+        this.watchMidnight();
+      },
+      // A second after midnight, as the other timers: the day after it is today (review P10).
+      nextLocalMidnight(now, this.options.settings.timezone) - now + 1_000,
+    );
+  }
+
+  /** Asks for the summary of every region that has a forum. */
+  private allSummaries(): void {
+    for (const region of this.options.regions.all()) {
+      if (region.forumChannelId !== null) this.summaries.request(region.id);
+    }
+  }
+
   /**
    * Ends a party: it leaves the store first, so nothing shows or says anything in its post any
    * more; then the messages the bot would otherwise leave behind are deleted (open completion
@@ -2850,6 +2908,8 @@ export class PartyService {
   /** For shutdown: shows nothing anew from now on (`emojiChanged`), then `flush`. */
   async close(): Promise<void> {
     this.closed = true;
+    this.midnightTimer?.();
+    this.midnightTimer = undefined;
     await this.flush();
   }
 
@@ -3094,10 +3154,11 @@ export class PartyService {
   }
 
   /**
-   * The list of a region's raids, and under them its trains and its meetups, as its summary
-   * post shows it (also for `/status` in the region's channel): a components-v2 message.
+   * The list of a region's raids, and under them its trains and its meetups, today's and those
+   * coming up (plan 8R-9), as its summary post shows it (`board`: the stops are below it) and
+   * `/status` in the region's channel (`channel`): a components-v2 message.
    */
-  summaryMessage(regionId: number): V2Message {
+  summaryMessage(regionId: number, where: 'board' | 'channel' = 'channel'): V2Message {
     const { store } = this.options;
     const now = this.now();
     const parties = store.inRegion(regionId);
@@ -3117,6 +3178,8 @@ export class PartyService {
     return renderSummary(raids, now, meetups, trains, maxBattles, {
       passing: region === undefined ? [] : this.passingThrough(region),
       stops: region === undefined ? undefined : this.stopsLine(region),
+      stopsBelow: where === 'board',
+      zone: this.options.settings.timezone,
     });
   }
 
@@ -3193,11 +3256,20 @@ export class PartyService {
     if (!region?.forumChannelId || !region.summaryMessageId) return;
     const failed = region.summaryMessageId;
     const { gateway, log } = this.options;
+    const check = this.boardChecks.delete(regionId);
     await this.knowSnowflake(region.guildId);
-    const message = this.summaryMessage(regionId);
+    const message = this.summaryMessage(regionId, 'board');
     const text = JSON.stringify(message);
     const last = this.summarySent.get(regionId);
-    if (last?.postId === failed && last.text === text) return;
+    if (last?.postId === failed && last.text === text) {
+      // The text stands; the board may have been opened by the stops' messages (B4).
+      // A board gone meanwhile (review P2): asked for again, so that the edit replaces it.
+      if (check && !(await this.pinAndLock(regionId, failed))) {
+        this.summarySent.delete(regionId);
+        this.summaries.request(regionId);
+      }
+      return;
+    }
     // Forgotten before anything is tried: a failure must not hide an edit that is still needed.
     this.summarySent.delete(regionId);
     let edited: boolean;
@@ -3218,10 +3290,10 @@ export class PartyService {
     }
     // For the staging: which regions' summaries a change edited (final review F5).
     log.debug({ region: regionId, post: failed }, 'edited the summary post');
-    // A post that was archived and opened again comes back unpinned.
-    const info = await gateway.postInfo(failed);
+    // A post that was archived and opened again comes back unpinned; and it is the region's
+    // locked board (plan 8R-9, B4).
+    const info = await this.pinAndLock(regionId, failed);
     if (!info) return;
-    if (!info.pinned) await this.pinSummary(regionId, failed);
     // The text is sent: a request with the same text edits nothing (review r1, R1-6).
     this.summarySent.set(regionId, { postId: failed, text });
     // A post made as "Active raids" before plan 8X-G is renamed, by the rename limit as a party's
@@ -3286,6 +3358,48 @@ export class PartyService {
     }
   }
 
+  /**
+   * Pins and locks the region's board where Discord says it is not (plan 8R-9, B4: an archived
+   * post opened again comes back unpinned; a moderator may have unlocked it); gives what Discord
+   * said of it, undefined where it is gone.
+   */
+  private async pinAndLock(
+    regionId: number,
+    postId: string,
+  ): Promise<{ title: string; pinned: boolean; locked: boolean } | undefined> {
+    const info = await this.options.gateway.postInfo(postId);
+    if (!info) return undefined;
+    if (!info.pinned) await this.pinSummary(regionId, postId);
+    if (!info.locked) await this.lockSummary(regionId, postId);
+    return info;
+  }
+
+  /**
+   * Locks the region's board (plan 8R-9): only the bot and moderators write in it. A refused
+   * permission (Manage Posts, as for the pin) is said once per region until a lock works again;
+   * any other failure is a warning, and the next draw tries again.
+   */
+  private async lockSummary(regionId: number, postId: string): Promise<SummaryPin> {
+    const { gateway, log } = this.options;
+    try {
+      if (await gateway.lockPost(postId)) {
+        this.lockRefused.delete(regionId);
+        return 'pinned';
+      }
+      return 'failed';
+    } catch (err) {
+      if (!isMissingPermission(err)) {
+        log.warn({ err, region: regionId, post: postId }, 'could not lock the board post');
+        return 'failed';
+      }
+      if (!this.lockRefused.has(regionId)) {
+        this.lockRefused.add(regionId);
+        log.warn({ err, region: regionId, post: postId }, 'could not lock the board post');
+      }
+      return 'refused';
+    }
+  }
+
   /**
    * Pins a summary post; a failure is a warning, as a moderator can pin it by hand. Answers
    * whether it was pinned: `refused` where the bot lacks the permission (Manage Posts), `failed`
@@ -3358,8 +3472,9 @@ export class PartyService {
   }
 
   /**
-   * Records as the region's summary a "Going on now" post the bot made in the forum (or one made
-   * as "Active raids" before plan 8X-G, `LEGACY_SUMMARY_TITLE`), where the
+   * Records as the region's summary a "Today and coming up" post the bot made in the forum (or
+   * one made under an old title, `LEGACY_SUMMARY_TITLES`: "Active raids" before plan 8X-G, "Going
+   * on now" before plan 8R-9), where the
    * record lost it (the record points at a post that is gone, or at none: a forum put back by
    * hand): the pinned one, else the oldest left over (it is pinned with its next edit). A second
    * post would not get the forum's one pin (Discord's 30047). `changed` when the region's forum
@@ -3377,8 +3492,13 @@ export class PartyService {
       // Open posts come oldest first.
       for (const postId of (await gateway.openPosts(forumId)) ?? []) {
         const info = await gateway.postInfo(postId);
-        // Also one made as "Active raids" before plan 8X-G, renamed with its next edit.
-        if (info?.title !== SUMMARY_TITLE && info?.title !== LEGACY_SUMMARY_TITLE) continue;
+        // Also one made under an old title (B12), renamed with its next edit.
+        if (
+          info === undefined ||
+          (info.title !== SUMMARY_TITLE && !LEGACY_SUMMARY_TITLES.includes(info.title))
+        ) {
+          continue;
+        }
         if (info.pinned) {
           found = postId;
           break;
@@ -3410,7 +3530,7 @@ export class PartyService {
     const forumId = region.forumChannelId;
     if (forumId === null) throw new Error(`Region ${region.id} has no forum`);
     await this.knowSnowflake(region.guildId);
-    const message = this.summaryMessage(region.id);
+    const message = this.summaryMessage(region.id, 'board');
     this.summarySent.delete(region.id);
     // As a party's post: v2 as the first message where Discord takes it, edited in otherwise.
     const postId = await this.createPost(`summary-${String(region.id)}`, forumId, {
@@ -3419,8 +3539,10 @@ export class PartyService {
       tagIds: [],
     });
     if (postId === undefined) throw new Error(`The forum of region ${region.id} is gone`);
-    // A moderator can pin it by hand, so the post is recorded whether or not this works.
+    // A moderator can pin it by hand, so the post is recorded whether or not this works; locked
+    // as the region's board (plan 8R-9), only the bot and moderators write in it.
     const pin = await this.pinSummary(region.id, postId);
+    const lock = await this.lockSummary(region.id, postId);
     if (!(await regionStore.setSummaryMessage(region.id, forumId, postId))) {
       log.warn({ region: region.id, post: postId }, 'the forum of a region changed meanwhile');
       try {
@@ -3434,7 +3556,11 @@ export class PartyService {
     await regions.load();
     // The stops are drawn in the new board (plan 8R-9, B2).
     this.stopPosts?.boardChanged(region.channelId);
-    return pin === 'pinned' ? { made: true } : { made: true, unpinned: pin };
+    return {
+      made: true,
+      ...(pin === 'pinned' ? {} : { unpinned: pin }),
+      ...(lock === 'pinned' ? {} : { unlocked: lock }),
+    };
   }
 
   /** Forgets what is remembered about a forum's tags (after `/admin setup-forums` changed them). */
@@ -3681,7 +3807,7 @@ export class PartyService {
     }
     const renamed = forum === 'ready' && (await this.renameForum(region));
     const posting = await this.reservePosts(region);
-    const { made: summary, unpinned } = await this.summaryMade(region);
+    const { made: summary, unpinned, unlocked } = await this.summaryMade(region);
     return {
       region: regions.byId(before.id) ?? region,
       forum,
@@ -3690,6 +3816,7 @@ export class PartyService {
       ...(tagsMissing.length > 0 ? { tagsMissing } : {}),
       summary,
       ...(unpinned === undefined ? {} : { unpinned }),
+      ...(unlocked === undefined ? {} : { unlocked }),
       ...(renamed ? { renamed } : {}),
       ...(posting === undefined ? {} : { posting }),
       ...(hiding === undefined ? {} : { hidden: hiding }),
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index 26ee1d3a..a97a382a 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -1174,7 +1174,12 @@ export class FakePartyGateway implements PartyGateway {
     return this.attempt('postInfo', postId, () => {
       const post = this.posts.get(postId);
       if (!post || this.gone.has(postId)) return undefined;
-      return { title: post.title, tagIds: [...post.tagIds], pinned: post.pinned };
+      return {
+        title: post.title,
+        tagIds: [...post.tagIds],
+        pinned: post.pinned,
+        locked: post.locked,
+      };
     });
   }
 
@@ -1245,6 +1250,20 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
+  /** Locks a post (plan 8R-9), opening it first; refused as a pin is without Manage Posts. */
+  lockPost(postId: string) {
+    return this.attempt('lockPost', postId, () => {
+      const post = this.posts.get(postId);
+      if (!post || this.gone.has(postId)) return false;
+      if (this.refusePosts.get(post.forumId)?.includes('Manage Posts')) {
+        throw missingPermissions('PATCH');
+      }
+      FakePartyGateway.reopen(post);
+      post.locked = true;
+      return true;
+    });
+  }
+
   archivePost(postId: string) {
     return this.attempt('archivePost', postId, () => {
       const post = this.posts.get(postId);
````

### Task 3: 8R-9 task 3: A line in the region's channel per new task and leader

Prototype commit: `0b7266c1d22de0a0d89440ee88849e9e679fed4d`

The first time in a local day that a research task (any version of it)
or a leader or Giovanni is reported in a region, a short line in the
region's text channel links the board's message that holds it (B9):
"Research: **Catch 25 Pokémon** (Rare Candy) → <link>",
"Team GO Rocket: **Arlo** at **Yellow Mural** → <link>".

- StopLine (migration 031, and in PINE_TABLES for ./pine restore): one row
  per server, region channel, day and key, unique; a line is claimed by its row, then sent, its message kept,
  so two reports at once or a restart never post it twice.
- StopLineService hears research news and hideouts reported
  (StopReportListener.hideoutReported), waits for the board's draw
  (messageOf) and sends the line; without a board it sends nothing and
  lets the claim go. No line for a decoy, a grunt or a narrowing (the same
  task). Names through plain(); the reward as first reported, "one of …".
- At each local midnight the day's lines are deleted, and at start those
  of days before; a line whose delete fails keeps its row for the next
  sweep, also the catch-up's on reconnect (P1); one Discord refuses for
  good (50001, 50013) is said once and forgotten (R1). A test over the real
  posts of the stops links a task, one under a window and a leader (P9). None in rehearsal mode; closed before the posts of the
  stops at shutdown, in their step.

**Files:**

```
 src/app-wiring.test.ts                               |   7 +-
 src/app-wiring.ts                                    |   8 +-
 src/app.ts                                           |  30 ++++-
 src/db/migrations/2026_10_25_031_region_board.ts     |  21 +++-
 src/db/migrator.db.test.ts                           |   1 +
 src/db/repositories/research-repositories.db.test.ts |   9 ++
 src/db/repositories/stop-line-repository.ts          | 101 +++++++++++++++++
 src/db/table-names.ts                                |   1 +
 src/db/types.ts                                      |  11 ++
 src/render/stop-lines.test.ts                        |  34 ++++++
 src/render/stop-lines.ts                             |  26 +++++
 src/services/stop-lines.test.ts                      | 358 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/stop-lines.ts                           | 226 +++++++++++++++++++++++++++++++++++++
 src/services/stop-posts.test.ts                      |   6 +
 src/services/stop-reports.ts                         |   6 +
 test/support/research-store.test.ts                  |   6 +
 test/support/stop-line-cases.ts                      |  59 ++++++++++
 test/support/stop-lines.ts                           |  61 ++++++++++
 18 files changed, 965 insertions(+), 6 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/app-wiring.test.ts src/render/stop-lines.test.ts src/services/stop-lines.test.ts src/services/stop-posts.test.ts test/support/research-store.test.ts`, `npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/research-repositories.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 0b7266c1d22de0a0d89440ee88849e9e679fed4d -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-9 task 3: A line in the region's channel per new task and leader`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app-wiring.test.ts b/src/app-wiring.test.ts
index 1d66cd23..c6731349 100644
--- a/src/app-wiring.test.ts
+++ b/src/app-wiring.test.ts
@@ -13,7 +13,7 @@ describe('the wiring of the pictures and the reports at stops (plan 8R-6)', () =
     expect(told).toEqual(['eggs', 'stops']);
   });
 
-  it('closes the pictures of the stops before the grunts’ messages and the posts of the stops', async () => {
+  it('closes the pictures of the stops before the grunts’ messages, the lines and the posts of the stops', async () => {
     const { log, entries } = createTestLogger();
     const closed: string[] = [];
     const closing = (name: string) => ({
@@ -22,10 +22,12 @@ describe('the wiring of the pictures and the reports at stops (plan 8R-6)', () =
     const steps = stopReportSteps({
       pictures: closing('pictures'),
       grunts: closing('grunts'),
+      // The lines of the region channels (plan 8R-9) wait for the posts' links: closed first.
+      lines: closing('lines'),
       posts: closing('posts'),
     });
     await createShutdown(steps, log)();
-    expect(closed).toEqual(['pictures', 'grunts', 'posts']);
+    expect(closed).toEqual(['pictures', 'grunts', 'lines', 'posts']);
     expect(
       entries.filter((entry) => entry.msg === 'shutdown step finished').map((e) => e.step),
     ).toEqual(['pictures of the stops', 'grunt reports', 'posts of the stops']);
@@ -40,6 +42,7 @@ describe('the wiring of the pictures and the reports at stops (plan 8R-6)', () =
       stopReportSteps({
         pictures: { close: () => Promise.resolve(void closed.push('pictures')) },
         grunts: undefined,
+        lines: undefined,
         posts: undefined,
       }),
       log,
diff --git a/src/app-wiring.ts b/src/app-wiring.ts
index 3f1a793a..c24625cd 100644
--- a/src/app-wiring.ts
+++ b/src/app-wiring.ts
@@ -30,12 +30,15 @@ export function picturesServed(pictures: { eggs: ServedPictures; stops: ServedPi
  * pictures first, so that no picture is fetched any more (the fetches on their way are aborted,
  * and what is drawn from then on names the pictures made or the feeds' addresses); then the
  * grunts' messages, which stand on with their reports (the next start's sweep deletes them); then
- * what waits to be drawn in the pinned posts of the stops. Ten seconds in all (the stack's limits
- * add up to 145 s, `operations.md`). The grunts' messages and the posts are none in rehearsal mode.
+ * the lines of the region channels on their way (plan 8R-9, which wait for the posts' links) and
+ * what waits to be drawn in the posts of the stops, in one step. Ten seconds in all (the stack's
+ * limits add up to 145 s, `operations.md`). The grunts' messages, the lines and the posts are none
+ * in rehearsal mode.
  */
 export function stopReportSteps(parts: {
   pictures: Closing;
   grunts: Closing | undefined;
+  lines: Closing | undefined;
   posts: Closing | undefined;
 }): ShutdownStep[] {
   return [
@@ -51,6 +54,7 @@ export function stopReportSteps(parts: {
       name: 'posts of the stops',
       timeoutMs: 5_000,
       run: async () => {
+        await parts.lines?.close();
         await parts.posts?.close();
       },
     },
diff --git a/src/app.ts b/src/app.ts
index af1abb87..ab95c09e 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -88,7 +88,9 @@ import { StopReportRepository } from './db/repositories/stop-report-repository.j
 import { StopReportService } from './services/stop-reports.js';
 import { rewardHash } from './domain/research/versions.js';
 import { StopPostService } from './services/stop-posts.js';
+import { StopLineService } from './services/stop-lines.js';
 import { StopPostRepository } from './db/repositories/stop-post-repository.js';
+import { StopLineRepository } from './db/repositories/stop-line-repository.js';
 import { PineStopRepository } from './db/repositories/pine-stop-repository.js';
 import { GymUpkeep } from './services/gym-upkeep.js';
 import { GymLookupRepository } from './db/repositories/gym-lookup-repository.js';
@@ -1095,6 +1097,20 @@ export async function startApp(
       });
   researchPostLinks.posts = stopPosts;
   if (stopPosts) partyService.setStopPosts(stopPosts);
+  // The lines of new tasks and leaders in the region channels (plan 8R-9, B9), linking the
+  // board's messages; none in rehearsal mode, which makes no posts of the stops.
+  const stopLines = stopPosts
+    ? new StopLineService({
+        storage: new StopLineRepository(db),
+        reports: stopReports,
+        posts: stopPosts,
+        regions,
+        guilds,
+        gateway: partyGateway,
+        zone: config.settings.timezone,
+        log,
+      })
+    : undefined;
   // The catch-up on reconnect (plan 8X-H; Matt, 2026-10-23: catch up, not restart): when the
   // gateway is back after a real disconnect, what failed meanwhile runs at once, one job after
   // another; first what waits an hour or for good (review R1), then the feeds, each only when its
@@ -1118,6 +1134,8 @@ export async function startApp(
         run: () => scheduler.catchUp().then((ran) => (ran ? 'done' : 'not-owed')),
       },
       ...(stopPosts ? [{ name: 'stop posts', run: () => stopPosts.catchUp().then(done) }] : []),
+      // The lines of ended days whose delete failed meanwhile (plan 8R-9, review P1).
+      ...(stopLines ? [{ name: 'stop lines', run: () => stopLines.sweep().then(done) }] : []),
       { name: 'raid bosses', run: () => raidBosses.catchUp() },
       { name: 'max bosses', run: () => maxBosses.catchUp() },
       { name: 'events', run: () => raidEvents.catchUp() },
@@ -1136,6 +1154,11 @@ export async function startApp(
       ?.start()
       .catch((err: unknown) => log.error({ err }, 'could not start the posts of the stops')),
   );
+  void connected.then(() =>
+    stopLines
+      ?.start()
+      .catch((err: unknown) => log.error({ err }, 'could not start the lines of new reports')),
+  );
   // The new trains of splits that a stop left pending (plan 8T: their post made, the split's
   // write never committed): taken back once Discord is there, for taking one back deletes its
   // post (one left pending in the process goes with the clock's upkeep).
@@ -1379,7 +1402,12 @@ export async function startApp(
       { name: 'spawn reports', timeoutMs: 5_000, run: () => spawns.flush() },
       // The pictures of the stops (no more fetched), the grunts' messages (they stand on), then
       // what waits to be drawn in the pinned posts of the stops: in this order, ten seconds.
-      ...stopReportSteps({ pictures: stopPictures, grunts: gruntMessages, posts: stopPosts }),
+      ...stopReportSteps({
+        pictures: stopPictures,
+        grunts: gruntMessages,
+        lines: stopLines,
+        posts: stopPosts,
+      }),
       // The catch-up's job under way (plan 8X-H): a feed's read ended by the feeds' steps above,
       // the stops' pinned posts drawn by the step before this one (review r1 C3).
       {
diff --git a/src/db/migrations/2026_10_25_031_region_board.ts b/src/db/migrations/2026_10_25_031_region_board.ts
index ef8410ed..3dc51ae1 100644
--- a/src/db/migrations/2026_10_25_031_region_board.ts
+++ b/src/db/migrations/2026_10_25_031_region_board.ts
@@ -12,8 +12,14 @@ import type { Migration } from 'kysely/migration';
  * - `StopPost.leftoverIds`: the messages of such a pinned post in the region's channel whose
  *   delete failed (JSON, null for none; review P1): kept with the day's board post, which has the
  *   same channel and day, and deleted at the next draw or catch-up.
+ * - `StopLine`: the lines of the region channels (B9), one per server, region channel, local day
+ *   and key (`research:<task key>`, `rocket:<leader:… | giovanni>`), unique on the four: claimed
+ *   by its row before it is sent, so two reports at once or a restart never post a line twice;
+ *   the message id once sent (null till then), so that the day's lines are deleted at midnight,
+ *   also after a restart; when it was claimed.
  *
- * Safe to run again after a failure half-way: a column is added only when it is missing.
+ * Safe to run again after a failure half-way: a column is added only when it is missing, the
+ * table made only when it is missing.
  */
 export const regionBoard: Migration = {
   // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
@@ -32,6 +38,19 @@ export const regionBoard: Migration = {
     if (Number(leftover.rows[0]?.n ?? 0) === 0) {
       await sql`alter table StopPost add column leftoverIds json null`.execute(db);
     }
+    await sql`
+      create table if not exists StopLine (
+        id int unsigned not null auto_increment,
+        serverId varchar(30) not null,
+        regionChannelId varchar(30) not null,
+        day varchar(10) not null,
+        lineKey varchar(80) not null,
+        messageId varchar(30) null,
+        createdAt bigint not null,
+        primary key (id),
+        unique key stopline_line_unique (serverId, regionChannelId, day, lineKey),
+        key stopline_day_index (day)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
   },
   async down() {
     // Additive only: nothing is ever dropped.
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index e7db1106..7156ff01 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -65,6 +65,7 @@ const ADDED_TABLES = [
   'RocketLineup',
   'GruntMessage',
   'MaxEvent',
+  'StopLine',
 ];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = [
diff --git a/src/db/repositories/research-repositories.db.test.ts b/src/db/repositories/research-repositories.db.test.ts
index fe73199f..fa441f5b 100644
--- a/src/db/repositories/research-repositories.db.test.ts
+++ b/src/db/repositories/research-repositories.db.test.ts
@@ -15,6 +15,8 @@ import { PineStopRepository } from './pine-stop-repository.js';
 import { ResearchEventRepository } from './research-event-repository.js';
 import { ResearchTaskRepository } from './research-task-repository.js';
 import { StopPostRepository } from './stop-post-repository.js';
+import { StopLineRepository } from './stop-line-repository.js';
+import { stopLineCases } from '../../../test/support/stop-line-cases.js';
 
 /** The smaller tables of plan 8R-1: stops of Pine's own, pinned posts, research events, tasks. */
 describe('the repositories of reports at stops', () => {
@@ -58,6 +60,13 @@ describe('the repositories of reports at stops', () => {
     });
   });
 
+  describe('StopLineRepository', () => {
+    stopLineCases(async () => {
+      await db.deleteFrom('StopLine').execute();
+      return new StopLineRepository(db);
+    });
+  });
+
   describe('ResearchEventRepository', () => {
     researchEventCases(async () => {
       await db.deleteFrom('ResearchEvent').execute();
diff --git a/src/db/repositories/stop-line-repository.ts b/src/db/repositories/stop-line-repository.ts
new file mode 100644
index 00000000..8e827221
--- /dev/null
+++ b/src/db/repositories/stop-line-repository.ts
@@ -0,0 +1,101 @@
+import type { Kysely } from 'kysely';
+import type { DB } from '../types.js';
+import { isDuplicateEntry } from '../errors.js';
+
+/** Which line it is (plan 8R-9, B9): of a server's region channel, a local day and a key. */
+export interface StopLineKey {
+  serverId: string;
+  regionChannelId: string;
+  /** The local day, `yyyy-mm-dd` in `settings.timezone`. */
+  day: string;
+  /** `research:<task key>`, `rocket:<leader:… | giovanni>`. */
+  key: string;
+}
+
+/** A line of a region channel as kept: which, its message once sent, when it was claimed. */
+export interface StopLineRecord extends StopLineKey {
+  messageId: string | null;
+  createdAt: number;
+}
+
+/**
+ * Where the lines of the region channels are kept (table `StopLine` of migration 031, plan 8R-9):
+ * a line is claimed by its row before it is sent, so two reports at once, or a restart, never send
+ * it twice; its message is kept so the day's lines are deleted at midnight, after a restart too.
+ * Twin `MemoryStopLines` (`test/support/stop-lines.ts`); both run `stopLineCases`.
+ */
+export interface StopLineStorage {
+  /** Claims a line: true when it was not claimed before (this caller sends it), false else. */
+  claim(line: StopLineKey & { createdAt: number }): Promise<boolean>;
+  /** Keeps the message a claimed line was sent as. */
+  sent(line: StopLineKey, messageId: string): Promise<void>;
+  /** Forgets a line (sent nowhere, or deleted); nothing happens for one not kept. */
+  forget(line: StopLineKey): Promise<void>;
+  /** The lines of the days before `day`, oldest first. */
+  before(day: string): Promise<StopLineRecord[]>;
+}
+
+/** The `StopLine` table. */
+export class StopLineRepository implements StopLineStorage {
+  constructor(private readonly db: Kysely<DB>) {}
+
+  async claim(line: StopLineKey & { createdAt: number }): Promise<boolean> {
+    try {
+      await this.db
+        .insertInto('StopLine')
+        .values({
+          serverId: line.serverId,
+          regionChannelId: line.regionChannelId,
+          day: line.day,
+          lineKey: line.key,
+          messageId: null,
+          createdAt: String(line.createdAt),
+        })
+        .execute();
+      return true;
+    } catch (err) {
+      if (isDuplicateEntry(err)) return false;
+      throw err;
+    }
+  }
+
+  async sent(line: StopLineKey, messageId: string): Promise<void> {
+    await this.where(this.db.updateTable('StopLine').set({ messageId }), line).execute();
+  }
+
+  async forget(line: StopLineKey): Promise<void> {
+    await this.where(this.db.deleteFrom('StopLine'), line).execute();
+  }
+
+  async before(day: string): Promise<StopLineRecord[]> {
+    const rows = await this.db
+      .selectFrom('StopLine')
+      .selectAll()
+      .where('day', '<', day)
+      .orderBy('day')
+      .orderBy('createdAt')
+      .orderBy('id')
+      .execute();
+    return rows.map((row) => ({
+      serverId: row.serverId,
+      regionChannelId: row.regionChannelId,
+      day: row.day,
+      key: row.lineKey,
+      messageId: row.messageId,
+      createdAt: Number(row.createdAt),
+    }));
+  }
+
+  /** The row of a line, by its unique key. */
+  private where<
+    Q extends {
+      where(column: 'serverId' | 'regionChannelId' | 'day' | 'lineKey', op: '=', value: string): Q;
+    },
+  >(query: Q, line: StopLineKey): Q {
+    return query
+      .where('serverId', '=', line.serverId)
+      .where('regionChannelId', '=', line.regionChannelId)
+      .where('day', '=', line.day)
+      .where('lineKey', '=', line.key);
+  }
+}
diff --git a/src/db/table-names.ts b/src/db/table-names.ts
index b6c6ad8a..c0410264 100644
--- a/src/db/table-names.ts
+++ b/src/db/table-names.ts
@@ -46,6 +46,7 @@ export const PINE_TABLES: readonly string[] = [
   'RoleGroup',
   'ScriptAccess',
   'SpawnReport',
+  'StopLine',
   'StopPost',
   'StopReport',
   'TargetWant',
diff --git a/src/db/types.ts b/src/db/types.ts
index aa1235bd..522715ec 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -562,6 +562,16 @@ export interface SpawnReport {
   messageId: string;
 }
 
+export interface StopLine {
+  createdAt: string;
+  day: string;
+  id: Generated<number>;
+  lineKey: string;
+  messageId: string | null;
+  regionChannelId: string;
+  serverId: string;
+}
+
 export interface StopPost {
   channelId: string;
   day: string;
@@ -702,6 +712,7 @@ export interface DB {
   SavedRoutes: SavedRoutes;
   ScriptAccess: ScriptAccess;
   SpawnReport: SpawnReport;
+  StopLine: StopLine;
   StopPost: StopPost;
   StopReport: StopReport;
   TargetWant: TargetWant;
diff --git a/src/render/stop-lines.test.ts b/src/render/stop-lines.test.ts
new file mode 100644
index 00000000..4817e64a
--- /dev/null
+++ b/src/render/stop-lines.test.ts
@@ -0,0 +1,34 @@
+import { describe, expect, it } from 'vitest';
+import { researchTasksFixture, pageTask } from '../../test/support/research.js';
+import { reportedStop } from '../../test/support/stop-report-cases.js';
+import { hideoutLine, researchLine } from './stop-lines.js';
+
+const LINK = 'https://discord.com/channels/1/2/3';
+
+describe('the lines of the region channels (plan 8R-9)', () => {
+  it('names a task with its reward as first reported, and links its place in the board', () => {
+    const task = pageTask('Catch 7 Pokémon');
+    const [version] = researchTasksFixture().versions(task);
+    if (!version) throw new Error('no version');
+    expect(researchLine({ text: task.text, typed: false, rewards: version.rewards }, LINK)).toBe(
+      `Research: **Catch 7 Pokémon** (${version.label}) → ${LINK}`,
+    );
+    // "One of" its encounters, as the task was first reported.
+    expect(researchLine({ text: task.text, typed: false, rewards: task.rewards }, LINK)).toBe(
+      `Research: **Catch 7 Pokémon** (one of Magikarp, Stufful, Wimpod) → ${LINK}`,
+    );
+    // A task typed without its reward; its text made plain, without a working address.
+    expect(researchLine({ text: 'Win *3* raids', typed: true, rewards: [] }, LINK)).toBe(
+      `Research: **Win \\*3\\* raids** → ${LINK}`,
+    );
+    expect(
+      researchLine({ text: 'See https://x.example', typed: true, rewards: [] }, LINK),
+    ).not.toContain('https://x.example');
+  });
+
+  it('names a leader or Giovanni and the stop, made plain', () => {
+    expect(hideoutLine('Arlo', reportedStop(2, { name: 'Yellow *Mural*' }), LINK)).toBe(
+      `Team GO Rocket: **Arlo** at **Yellow \\*Mural\\*** → ${LINK}`,
+    );
+  });
+});
diff --git a/src/render/stop-lines.ts b/src/render/stop-lines.ts
new file mode 100644
index 00000000..b9496682
--- /dev/null
+++ b/src/render/stop-lines.ts
@@ -0,0 +1,26 @@
+import type { ReportedStop, ResearchDetail } from '../domain/stops/report.js';
+import { rewardWords, taskText } from './research.js';
+import { plain, truncate } from './text.js';
+
+/**
+ * The line of a new task of the day in a region's channel (plan 8R-9, B9; design "The text
+ * channel"): its text and its reward as first reported (`one of …` for a "one of", nothing for a
+ * task typed without one), and the link to the message of the board that holds it:
+ * `Research: **Catch 25 Pokémon** (Rare Candy) → <link>`. Plain text, never edited.
+ */
+export function researchLine(
+  research: Pick<ResearchDetail, 'text' | 'typed' | 'rewards'>,
+  link: string,
+): string {
+  const rewards = rewardWords(research.rewards);
+  return `Research: **${taskText(research)}**${rewards === '' ? '' : ` (${rewards})`} → ${link}`;
+}
+
+/**
+ * The line of a leader or Giovanni reported in a region today (plan 8R-9, B9), the stop by its
+ * name and the link to the message of the board that holds the hideout:
+ * `Team GO Rocket: **Arlo** at **Yellow Mural** → <link>`.
+ */
+export function hideoutLine(name: string, stop: Pick<ReportedStop, 'name'>, link: string): string {
+  return `Team GO Rocket: **${plain(name)}** at **${plain(truncate(stop.name, 80))}** → ${link}`;
+}
diff --git a/src/services/stop-lines.test.ts b/src/services/stop-lines.test.ts
new file mode 100644
index 00000000..e010b70c
--- /dev/null
+++ b/src/services/stop-lines.test.ts
@@ -0,0 +1,358 @@
+import { DateTime } from 'luxon';
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import {
+  FakePartyGateway,
+  missingPermissions,
+  networkAway,
+} from '../../test/support/fake-gateway.js';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { EAST_CHANNEL, testRegions, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { PAWNIARD_DAY } from '../../test/support/research-store-cases.js';
+import { MemoryStopPosts } from '../../test/support/research-store.js';
+import { pageTask, researchTasksFixture } from '../../test/support/research.js';
+import { feedChoice } from '../../test/support/rocket.js';
+import { reportedStop } from '../../test/support/stop-report-cases.js';
+import { MemoryStopLines } from '../../test/support/stop-lines.js';
+import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import type { ResearchTask } from '../domain/research/task.js';
+import type { TaskVersion } from '../domain/research/versions.js';
+import { rocketSubject } from './rocket-reports.js';
+import { StopLineService } from './stop-lines.js';
+import { StopPostService, type PostLink } from './stop-posts.js';
+import { StopReportService } from './stop-reports.js';
+
+const ZONE = 'America/New_York';
+const at = (local: string): number => DateTime.fromISO(local, { zone: ZONE }).toMillis();
+const ASH = { id: '200000000000000061', name: 'Ash' };
+const west = (n: number) => reportedStop(n, { lat: 40.05 + n / 1_000, lon: -80.05 });
+const east = reportedStop(90, { lat: 40.05, lon: -79.95 });
+/** West's and East's board posts, as the posts of the stops link them. */
+const BOARDS: Record<string, string> = {
+  [WEST_CHANNEL]: '500000000000000001',
+  [EAST_CHANNEL]: '500000000000000002',
+};
+const link = (channelId: string, key: string): string =>
+  `https://discord.com/channels/${FAKE_GUILD_ID}/${BOARDS[channelId] ?? ''}/${String(key.length)}`;
+
+function linesWith() {
+  const clock = { now: at('2026-11-21T10:00') };
+  const { log, entries } = createTestLogger();
+  const gateway = new FakePartyGateway();
+  const storage = new MemoryStopLines();
+  const reports = new StopReportService({
+    rewardHash: fixtureRewardHash,
+    store: new MemoryStopReports(),
+    events: { researchEvents: () => [] },
+    zone: ZONE,
+    log,
+    now: () => clock.now,
+  });
+  /** The board of a region has the post of the stops; East none while `noBoard` says so. */
+  const noBoard = new Set<string>();
+  const asked: string[] = [];
+  const posts = {
+    messageOf: (channelId: string, key: string): Promise<PostLink | undefined> => {
+      asked.push(`${channelId} ${key}`);
+      const board = BOARDS[channelId];
+      return Promise.resolve(
+        board === undefined || noBoard.has(channelId)
+          ? undefined
+          : { channelId: board, messageId: String(key.length) },
+      );
+    },
+  };
+  const make = () =>
+    new StopLineService({
+      storage,
+      reports,
+      posts,
+      regions: { all: () => testRegions() },
+      guilds: { idFor: (id) => Promise.resolve(id === FAKE_GUILD_ID ? 1 : undefined) },
+      gateway,
+      zone: ZONE,
+      log,
+      now: () => clock.now,
+    });
+  const lines = make();
+  const report = (task: ResearchTask, stops = [west(1)], version?: TaskVersion) =>
+    reports.reportResearch({
+      serverId: FAKE_GUILD_ID,
+      stops,
+      subject: {
+        subjectKey: version?.value ?? task.key,
+        research: {
+          text: task.text,
+          category: task.category,
+          rewards: version?.rewards ?? task.rewards,
+          typed: false,
+        },
+      },
+      reporter: ASH,
+    });
+  const rocket = (key: string, stop = west(1)) =>
+    reports.reportRocket({
+      serverId: FAKE_GUILD_ID,
+      stop,
+      subject: rocketSubject(feedChoice(key)),
+      reporter: ASH,
+    });
+  const said = (channelId = WEST_CHANNEL) =>
+    gateway.messagesIn(channelId).map(({ message }) => message.content ?? '');
+  return {
+    clock,
+    gateway,
+    storage,
+    reports,
+    lines,
+    make,
+    report,
+    rocket,
+    said,
+    noBoard,
+    asked,
+    entries,
+  };
+}
+
+describe('StopLineService (plan 8R-9, B9)', () => {
+  let made: ReturnType<typeof linesWith> | undefined;
+  afterEach(async () => {
+    vi.useRealTimers();
+    await made?.lines.close();
+    made = undefined;
+  });
+
+  it('says each new task of the day once in the region’s channel, linking its place in the board', async () => {
+    made = linesWith();
+    const task = pageTask('Make 3 Excellent Throws in a row');
+    const [gible] = researchTasksFixture().versions(task);
+    if (!gible) throw new Error('no version');
+    await made.report(task, [west(1)], gible);
+    await made.lines.flush();
+    expect(made.said()).toEqual([
+      `Research: **Make 3 Excellent Throws in a row** (${gible.label}) → ${link(WEST_CHANNEL, task.key)}`,
+    ]);
+    // The same task again, another version, more stops: nothing more.
+    await made.report(task, [west(2), west(3)]);
+    await made.report(task, [west(4)], gible);
+    await made.lines.flush();
+    expect(made.said()).toHaveLength(1);
+    // Another task: a line of its own; East heard of neither.
+    await made.report(pageTask('Catch 7 Pokémon'), [west(5)]);
+    await made.lines.flush();
+    expect(made.said()[1]).toBe(
+      `Research: **Catch 7 Pokémon** (one of Magikarp, Stufful, Wimpod) → ${link(WEST_CHANNEL, pageTask('Catch 7 Pokémon').key)}`,
+    );
+    expect(made.said(EAST_CHANNEL)).toEqual([]);
+    expect([...made.storage.rows.values()].map((row) => row.messageId)).toEqual(
+      made.gateway.messagesIn(WEST_CHANNEL).map((one) => one.id),
+    );
+  });
+
+  it('says a leader or Giovanni, not a decoy or a grunt', async () => {
+    made = linesWith();
+    await made.rocket('grunt:water', west(1));
+    await made.rocket('decoy', west(2));
+    await made.rocket('leader:arlo', west(3));
+    await made.rocket('leader:arlo', west(4));
+    await made.rocket('giovanni', west(5));
+    await made.lines.flush();
+    expect(made.said()).toEqual([
+      `Team GO Rocket: **Arlo** at **Yellow Mural 3** → ${link(WEST_CHANNEL, 'leader:arlo')}`,
+      `Team GO Rocket: **Giovanni** at **Yellow Mural 5** → ${link(WEST_CHANNEL, 'giovanni')}`,
+    ]);
+  });
+
+  it('says nothing where the region has no board, and says it once the board is there', async () => {
+    made = linesWith();
+    made.noBoard.add(EAST_CHANNEL);
+    await made.report(pageTask('Catch 7 Pokémon'), [east]);
+    await made.lines.flush();
+    expect(made.said(EAST_CHANNEL)).toEqual([]);
+    made.noBoard.delete(EAST_CHANNEL);
+    await made.report(pageTask('Catch 7 Pokémon'), [reportedStop(91, { lat: 40.06, lon: -79.95 })]);
+    await made.lines.flush();
+    expect(made.said(EAST_CHANNEL)).toHaveLength(1);
+  });
+
+  it('says a line once when two reports come at once, and not again after a restart', async () => {
+    made = linesWith();
+    const task = pageTask('Catch 7 Pokémon');
+    await Promise.all([made.report(task, [west(1)]), made.report(task, [west(2)])]);
+    await made.lines.flush();
+    expect(made.said()).toHaveLength(1);
+    await made.lines.close();
+    made.lines = made.make();
+    await made.lines.start();
+    await made.report(task, [west(3)]);
+    await made.lines.flush();
+    expect(made.said()).toHaveLength(1);
+  });
+
+  it('deletes the day’s lines at midnight, and at start those of days before', async () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    made = linesWith();
+    await made.lines.start();
+    await made.report(pageTask('Catch 7 Pokémon'));
+    await made.lines.flush();
+    const [line] = made.gateway.messagesIn(WEST_CHANNEL);
+    made.clock.now = at('2026-11-22T00:00:01');
+    await vi.advanceTimersByTimeAsync(at('2026-11-22T00:00:02') - at('2026-11-21T10:00'));
+    await made.lines.flush();
+    expect(made.gateway.deleted).toEqual([{ channelId: WEST_CHANNEL, messageId: line?.id }]);
+    expect(made.storage.rows.size).toBe(0);
+    // A new day: the task is new again.
+    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
+    await made.lines.flush();
+    expect(made.said()).toHaveLength(1);
+    // A restart after the next midnight deletes yesterday's line at start.
+    await made.lines.close();
+    made.clock.now = at('2026-11-23T08:00');
+    made.lines = made.make();
+    await made.lines.start();
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(made.storage.rows.size).toBe(0);
+  });
+
+  it('forgets a line whose delete Discord refuses for good, said once (review R1)', async () => {
+    made = linesWith();
+    await made.report(pageTask('Catch 7 Pokémon'));
+    await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(2)]);
+    await made.lines.flush();
+    made.gateway.failing.set('deleteMessage', missingPermissions('DELETE'));
+    made.clock.now = at('2026-11-22T08:00');
+    await made.lines.sweep();
+    expect(made.storage.rows.size).toBe(0);
+    expect(
+      made.entries.filter((entry) => entry.msg === 'the bot may not delete the line of a report'),
+    ).toHaveLength(1);
+    made.gateway.failing.clear();
+  });
+
+  it('keeps a line whose delete fails at midnight, and deletes it at the next sweep (review P1)', async () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    made = linesWith();
+    await made.lines.start();
+    await made.report(pageTask('Catch 7 Pokémon'));
+    await made.lines.flush();
+    const [line] = made.gateway.messagesIn(WEST_CHANNEL);
+    made.gateway.failing.set('deleteMessage', networkAway());
+    made.clock.now = at('2026-11-22T00:00:01');
+    await vi.advanceTimersByTimeAsync(at('2026-11-22T00:00:02') - at('2026-11-21T10:00'));
+    await made.lines.flush();
+    expect(made.storage.rows.size).toBe(1);
+    // The network is back: the catch-up's sweep deletes it.
+    made.gateway.failing.clear();
+    await made.lines.sweep();
+    expect(made.gateway.deleted).toEqual([{ channelId: WEST_CHANNEL, messageId: line?.id }]);
+    expect(made.storage.rows.size).toBe(0);
+  });
+});
+
+describe('StopLineService over the posts of the stops (review P9)', () => {
+  let posts: StopPostService | undefined;
+  let lines: StopLineService | undefined;
+  afterEach(async () => {
+    await lines?.close();
+    await posts?.close();
+    posts = undefined;
+    lines = undefined;
+  });
+
+  it('links each line to the board’s message that holds it: a task, one under a window, a leader', async () => {
+    const clock = { now: at('2026-11-21T10:00') };
+    const { log } = createTestLogger();
+    const gateway = new FakePartyGateway();
+    gateway.addForum(WEST_FORUM);
+    const board =
+      (await gateway.createPost(WEST_FORUM, {
+        title: 'Today and coming up',
+        message: { content: 'The summary' },
+        tagIds: [],
+      })) ?? '';
+    const regions = testRegions().map((region) =>
+      region.channelId === WEST_CHANNEL ? { ...region, summaryMessageId: board } : region,
+    );
+    const events = { researchEvents: () => [PAWNIARD_DAY] };
+    const reports = new StopReportService({
+      rewardHash: fixtureRewardHash,
+      store: new MemoryStopReports(),
+      events,
+      zone: ZONE,
+      log,
+      now: () => clock.now,
+    });
+    const guilds = {
+      idFor: (id: string) => Promise.resolve(id === FAKE_GUILD_ID ? 1 : undefined),
+      snowflakeOf: (row: number) => Promise.resolve(row === 1 ? FAKE_GUILD_ID : undefined),
+    };
+    posts = new StopPostService({
+      storage: new MemoryStopPosts(),
+      reports,
+      events,
+      regions: { all: () => regions },
+      guilds,
+      gateway,
+      zone: ZONE,
+      log,
+      now: () => clock.now,
+      delayMs: 0,
+    });
+    lines = new StopLineService({
+      storage: new MemoryStopLines(),
+      reports,
+      posts,
+      regions: { all: () => regions },
+      guilds,
+      gateway,
+      zone: ZONE,
+      log,
+      now: () => clock.now,
+    });
+    const report = (task: ResearchTask, stop: ReturnType<typeof west>) =>
+      reports.reportResearch({
+        serverId: FAKE_GUILD_ID,
+        stops: [stop],
+        subject: {
+          subjectKey: task.key,
+          research: {
+            text: task.text,
+            category: task.category,
+            rewards: task.rewards,
+            typed: false,
+          },
+        },
+        reporter: ASH,
+      });
+    const said = () => gateway.messagesIn(WEST_CHANNEL).map(({ message }) => message.content ?? '');
+    const boardLink = () => {
+      const [first] = gateway.messagesIn(board);
+      return `https://discord.com/channels/${FAKE_GUILD_ID}/${board}/${first?.id ?? ''}`;
+    };
+    // A task of the day.
+    await report(pageTask('Catch 7 Pokémon'), west(1));
+    await lines.flush();
+    expect(said()).toEqual([expect.stringMatching(/^Research: \*\*Catch 7 Pokémon\*\*/)]);
+    expect(said()[0]).toContain(`→ ${boardLink()}`);
+    // Under Pawniard Community Day's window: the day's task waits below it, and is still held by
+    // a message of the board; a task of the window gets its line too.
+    clock.now = at('2026-11-21T15:00');
+    await report(pageTask('Catch a Dragon-type Pokémon'), west(2));
+    await lines.flush();
+    expect(said()[1]).toMatch(/^Research: \*\*Catch a Dragon-type Pokémon\*\*/);
+    expect(said()[1]).toContain(`→ ${boardLink()}`);
+    expect((await posts.messageOf(WEST_CHANNEL, pageTask('Catch 7 Pokémon').key))?.channelId).toBe(
+      board,
+    );
+    // A leader.
+    await reports.reportRocket({
+      serverId: FAKE_GUILD_ID,
+      stop: west(3),
+      subject: rocketSubject(feedChoice('leader:arlo')),
+      reporter: ASH,
+    });
+    await lines.flush();
+    expect(said()[2]).toBe(`Team GO Rocket: **Arlo** at **Yellow Mural 3** → ${boardLink()}`);
+  });
+});
diff --git a/src/services/stop-lines.ts b/src/services/stop-lines.ts
new file mode 100644
index 00000000..3036acb0
--- /dev/null
+++ b/src/services/stop-lines.ts
@@ -0,0 +1,226 @@
+import { DateTime } from 'luxon';
+import { containment } from '@pine/wayspot-core/region-membership';
+import type { Region } from '../db/repositories/region-repository.js';
+import type { StopLineKey, StopLineStorage } from '../db/repositories/stop-line-repository.js';
+import { isMissingPermission, type PartyGateway } from '../discord/party-gateway.js';
+import { nextLocalMidnight } from '../domain/party/board-day.js';
+import { taskOfSubject } from '../domain/research/reports.js';
+import type { ReportedStop, RocketReport } from '../domain/stops/report.js';
+import type { Logger } from '../log.js';
+import { postLink } from '../render/notify-dm.js';
+import { hideoutLine, researchLine } from '../render/stop-lines.js';
+import type { PostLink } from './stop-posts.js';
+import type { ResearchNews, StopReportService } from './stop-reports.js';
+
+/** The longest delay `setTimeout` accepts. */
+const MAX_TIMER_MS = 2 ** 31 - 1;
+
+export interface StopLineServiceOptions {
+  storage: StopLineStorage;
+  /** The reports at stops: research that is news, and hideouts reported (`hideoutReported`). */
+  reports: Pick<StopReportService, 'listen'>;
+  /**
+   * The posts of the stops (`StopPostService.messageOf`): the message of the board that holds a
+   * task or a hideout, once what waits is drawn; undefined where the region has no board.
+   */
+  posts: { messageOf(channelId: string, subjectKey: string): Promise<PostLink | undefined> };
+  regions: { all(): readonly Region[] };
+  /** The row of a server in `Guild` (its regions name it so), by its snowflake. */
+  guilds: { idFor(serverId: string): Promise<number | undefined> };
+  gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
+  /** `settings.timezone`: the local day and its midnight. */
+  zone: string;
+  log: Logger;
+  now?: () => number;
+}
+
+/**
+ * The lines of a region's channel (plan 8R-9, B9; design "The text channel"): the first time in a
+ * local day that a research task (any version of it, "one of" too) or a leader or Giovanni is
+ * reported at a stop in a region, a short line in the region's channel links the message of the
+ * region's board that holds it (`researchLine`, `hideoutLine`), as a new party's line links its
+ * post. A line is claimed by its row first (`StopLineStorage.claim`), then sent, never edited; a
+ * region without a board gets none (its claim is let go, so a later report there tries again). No
+ * line for a decoy or a grunt; a narrowing is the same task. At each local midnight the lines of
+ * the day before are deleted, and at start those of days before (a restart over a midnight). None
+ * in rehearsal mode: the bot does not make it.
+ */
+export class StopLineService {
+  private readonly now: () => number;
+  /** The announcements on their way (`flush` and `close` wait for them). */
+  private readonly pending = new Set<Promise<void>>();
+  private timer: NodeJS.Timeout | undefined;
+  /** Channels where Discord refused a delete for good (review R1), said once each. */
+  private readonly deleteRefusalsTold = new Set<string>();
+  private closed = false;
+
+  constructor(private readonly options: StopLineServiceOptions) {
+    this.now = options.now ?? (() => Date.now());
+    options.reports.listen({
+      reported: (news) => {
+        this.track(this.research(news));
+      },
+      hideoutReported: (report) => {
+        this.track(this.hideout(report));
+      },
+    });
+  }
+
+  private track(work: Promise<void>): void {
+    const kept = work
+      .catch((err: unknown) => {
+        this.options.log.warn({ err }, 'could not say a new report in its region’s channel');
+      })
+      .finally(() => this.pending.delete(kept));
+    this.pending.add(kept);
+  }
+
+  /** The local day of a moment, `yyyy-mm-dd`. */
+  private dayOf(time: number): string {
+    return DateTime.fromMillis(time, { zone: this.options.zone }).toISODate() ?? '';
+  }
+
+  /** The region channels of a server whose outlines hold any of these stops. */
+  private async channelsAt(serverId: string, stops: readonly ReportedStop[]): Promise<string[]> {
+    const row = await this.options.guilds.idFor(serverId);
+    if (row === undefined) return [];
+    return this.options.regions
+      .all()
+      .filter((region) => region.guildId === row && region.bounds !== null)
+      .filter((region) => stops.some(containment(region.bounds ?? [])))
+      .map((region) => region.channelId);
+  }
+
+  /** Research that is news: its task's line in each region channel of its stops, once a day. */
+  private async research(news: ResearchNews): Promise<void> {
+    const [first] = news.reports;
+    if (this.closed || first === undefined) return;
+    const task = taskOfSubject(first.subjectKey);
+    const day = this.dayOf(this.now());
+    const channels = await this.channelsAt(
+      news.serverId,
+      news.reports.map((report) => report.stop),
+    );
+    for (const regionChannelId of channels) {
+      await this.announce(
+        { serverId: news.serverId, regionChannelId, day, key: `research:${task}` },
+        task,
+        (link) => researchLine(first.research, link),
+      );
+    }
+  }
+
+  /** A hideout reported: a leader's or Giovanni's line in each region channel, once a day. */
+  private async hideout(report: RocketReport): Promise<void> {
+    const who = report.subjectKey;
+    if (this.closed || !(who.startsWith('leader:') || who === 'giovanni')) return;
+    const day = this.dayOf(this.now());
+    for (const regionChannelId of await this.channelsAt(report.serverId, [report.stop])) {
+      await this.announce(
+        { serverId: report.serverId, regionChannelId, day, key: `rocket:${who}` },
+        who,
+        (link) => hideoutLine(report.rocket.name, report.stop, link),
+      );
+    }
+  }
+
+  /**
+   * Claims a line, then sends it with the link to the board's message that holds `subjectKey`;
+   * where there is none (no board) or the send fails, the claim is let go.
+   */
+  private async announce(
+    line: StopLineKey,
+    subjectKey: string,
+    text: (link: string) => string,
+  ): Promise<void> {
+    const { storage, posts, gateway, log } = this.options;
+    if (!(await storage.claim({ ...line, createdAt: this.now() }))) return;
+    let sent: string | undefined;
+    try {
+      const held = await posts.messageOf(line.regionChannelId, subjectKey);
+      if (held !== undefined) {
+        const link = postLink(line.serverId, held.channelId, held.messageId);
+        sent = await gateway.sendMessage(line.regionChannelId, { content: text(link) });
+      }
+    } catch (err) {
+      log.warn({ err, channel: line.regionChannelId }, 'could not send the line of a new report');
+    }
+    if (sent === undefined) {
+      await storage.forget(line);
+      return;
+    }
+    await storage.sent(line, sent);
+  }
+
+  /**
+   * Deletes the lines of the days before today, and forgets each once its delete resolved (a
+   * message gone counts); one whose delete fails stays for the next sweep (review P1): at
+   * midnight, at start, and in the catch-up on reconnect.
+   */
+  async sweep(): Promise<void> {
+    const { storage, gateway, log } = this.options;
+    for (const line of await storage.before(this.dayOf(this.now()))) {
+      if (line.messageId !== null) {
+        try {
+          await gateway.deleteMessage(line.regionChannelId, line.messageId);
+        } catch (err) {
+          if (isMissingPermission(err)) {
+            // Refused for good (review R1: 50001, 50013): forgotten, said once per channel.
+            if (!this.deleteRefusalsTold.has(line.regionChannelId)) {
+              this.deleteRefusalsTold.add(line.regionChannelId);
+              log.warn(
+                { err, channel: line.regionChannelId },
+                'the bot may not delete the line of a report',
+              );
+            }
+          } else {
+            // Kept (review P1): the next sweep (midnight, start, the catch-up) tries again.
+            log.warn(
+              { err, channel: line.regionChannelId },
+              'could not delete the line of a report',
+            );
+            continue;
+          }
+        }
+      }
+      await storage.forget(line);
+    }
+  }
+
+  /** At start: the lines of days before deleted, and the timer of the next local midnight set. */
+  async start(): Promise<void> {
+    try {
+      await this.sweep();
+    } finally {
+      this.schedule();
+    }
+  }
+
+  private schedule(): void {
+    if (this.closed) return;
+    if (this.timer) clearTimeout(this.timer);
+    const now = this.now();
+    this.timer = setTimeout(
+      () => {
+        this.timer = undefined;
+        this.track(this.sweep().finally(() => this.schedule()));
+      },
+      // A moment after midnight: the day after it is today.
+      Math.min(nextLocalMidnight(now, this.options.zone) - now + 1_000, MAX_TIMER_MS),
+    );
+    this.timer.unref();
+  }
+
+  /** Waits for every announcement and delete on its way. For tests and shutdown. */
+  async flush(): Promise<void> {
+    while (this.pending.size > 0) await Promise.all(this.pending);
+  }
+
+  /** Stops the timer; what is on its way is finished first. */
+  async close(): Promise<void> {
+    this.closed = true;
+    if (this.timer) clearTimeout(this.timer);
+    this.timer = undefined;
+    await this.flush();
+  }
+}
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index 6af867c5..172e9876 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -939,6 +939,12 @@ describe('StopPostService', () => {
       hideouts: 0,
       waiting: { tasks: 2, at: PAWNIARD_DAY.end },
     });
+    // A task waiting below the window is held by its message too: its line links it (plan 8R-9).
+    const [message] = made.gateway.messagesIn(made.west);
+    expect(await made.posts.messageOf(WEST_CHANNEL, pageTask('Catch 7 Pokémon').key)).toEqual({
+      channelId: made.west,
+      messageId: message?.id,
+    });
   });
 
   it('has the post’s pictures made before it is drawn, and names each as the pictures give it (plan 8R-6)', async () => {
diff --git a/src/services/stop-reports.ts b/src/services/stop-reports.ts
index 6d5aa964..2a3b04cf 100644
--- a/src/services/stop-reports.ts
+++ b/src/services/stop-reports.ts
@@ -96,6 +96,11 @@ export interface StopReportListener {
   changed?(serverId: string, stops: readonly ReportedStop[]): void;
   /** Research reports that are news (`ResearchNews`). */
   reported?(news: ResearchNews): void;
+  /**
+   * A hideout (a leader, Giovanni, the decoy) was reported (plan 8R-9: the region channels' lines
+   * of new leaders), also the same one again; not one put back (`restore`).
+   */
+  hideoutReported?(report: RocketReport): void;
   /**
    * Reports that ended before their time (plan 8R-2): taken back, or replaced while they stood.
    * A grunt's message goes with it.
@@ -473,6 +478,7 @@ export class StopReportService {
       const stops = stood ? [report.stop, stood.stop] : [report.stop];
       this.tell((listener) => listener.changed?.(input.serverId, stops));
     }
+    if (hideout) this.tell((listener) => listener.hideoutReported?.(report));
     this.options.log.info(
       {
         guild: input.serverId,
diff --git a/test/support/research-store.test.ts b/test/support/research-store.test.ts
index 0b4a167f..17612dcc 100644
--- a/test/support/research-store.test.ts
+++ b/test/support/research-store.test.ts
@@ -3,11 +3,17 @@ import { pineStopCases } from './pine-stop-cases.js';
 import { MemoryPineStops } from './pine-stops.js';
 import { researchEventCases, researchTaskCases, stopPostCases } from './research-store-cases.js';
 import { MemoryResearchEvents, MemoryResearchTasks, MemoryStopPosts } from './research-store.js';
+import { stopLineCases } from './stop-line-cases.js';
+import { MemoryStopLines } from './stop-lines.js';
 
 describe('MemoryStopPosts', () => {
   stopPostCases(() => Promise.resolve(new MemoryStopPosts()));
 });
 
+describe('MemoryStopLines', () => {
+  stopLineCases(() => Promise.resolve(new MemoryStopLines()));
+});
+
 describe('MemoryResearchEvents', () => {
   researchEventCases(() => Promise.resolve(new MemoryResearchEvents()));
 });
diff --git a/test/support/stop-line-cases.ts b/test/support/stop-line-cases.ts
new file mode 100644
index 00000000..4640ee51
--- /dev/null
+++ b/test/support/stop-line-cases.ts
@@ -0,0 +1,59 @@
+import { expect, it } from 'vitest';
+import type { StopLineStorage } from '../../src/db/repositories/stop-line-repository.js';
+
+/** A line of a region channel of a server and a day (plan 8R-9), not sent yet. */
+export function newStopLine(
+  overrides: Partial<{ serverId: string; regionChannelId: string; day: string; key: string }> = {},
+) {
+  return {
+    serverId: '100000000000000001',
+    regionChannelId: '300000000000000001',
+    day: '2026-11-21',
+    key: 'research:0123456789abcdef',
+    createdAt: 1,
+    ...overrides,
+  };
+}
+
+/** What the lines' storage does, for the repository and its twin (`MemoryStopLines`). */
+export function stopLineCases(made: () => Promise<StopLineStorage>): void {
+  it('claims a line once per server, region channel, day and key', async () => {
+    const store = await made();
+    const line = newStopLine();
+    expect(await store.claim(line)).toBe(true);
+    expect(await store.claim({ ...line, createdAt: 2 })).toBe(false);
+    // Another day, channel, server or key is another line.
+    expect(await store.claim({ ...line, day: '2026-11-22' })).toBe(true);
+    expect(await store.claim({ ...line, regionChannelId: '300000000000000002' })).toBe(true);
+    expect(await store.claim({ ...line, serverId: '100000000000000002' })).toBe(true);
+    expect(await store.claim({ ...line, key: 'rocket:leader:arlo' })).toBe(true);
+  });
+
+  it('keeps the message of a line, and gives the lines of the days before a day', async () => {
+    const store = await made();
+    await store.claim(newStopLine({ day: '2026-11-20' }));
+    await store.claim(newStopLine());
+    await store.claim(newStopLine({ day: '2026-11-19', key: 'rocket:giovanni' }));
+    await store.sent(newStopLine({ day: '2026-11-20' }), '400000000000000001');
+    expect(await store.before('2026-11-21')).toEqual([
+      expect.objectContaining({ day: '2026-11-19', key: 'rocket:giovanni', messageId: null }),
+      expect.objectContaining({
+        day: '2026-11-20',
+        key: 'research:0123456789abcdef',
+        regionChannelId: '300000000000000001',
+        serverId: '100000000000000001',
+        messageId: '400000000000000001',
+      }),
+    ]);
+  });
+
+  it('forgets a line, which may be claimed again then', async () => {
+    const store = await made();
+    const line = newStopLine();
+    await store.claim(line);
+    await store.forget(line);
+    await store.forget(newStopLine({ key: 'never' }));
+    expect(await store.before('2026-11-22')).toEqual([]);
+    expect(await store.claim(line)).toBe(true);
+  });
+}
diff --git a/test/support/stop-lines.ts b/test/support/stop-lines.ts
new file mode 100644
index 00000000..7cdd28f1
--- /dev/null
+++ b/test/support/stop-lines.ts
@@ -0,0 +1,61 @@
+import type {
+  StopLineKey,
+  StopLineRecord,
+  StopLineStorage,
+} from '../../src/db/repositories/stop-line-repository.js';
+
+/**
+ * The lines of the region channels in memory (`StopLineStorage`, plan 8R-9), the twin of
+ * `StopLineRepository`; `rows` by `<server> <channel> <day> <key>`, `failing` per method.
+ */
+export class MemoryStopLines implements StopLineStorage {
+  readonly rows = new Map<string, StopLineRecord>();
+  readonly failing = new Map<keyof StopLineStorage, Error>();
+
+  private fail(method: keyof StopLineStorage): void {
+    const err = this.failing.get(method);
+    if (err) throw err;
+  }
+
+  private static keyOf(line: StopLineKey): string {
+    return `${line.serverId} ${line.regionChannelId} ${line.day} ${line.key}`;
+  }
+
+  claim(line: StopLineKey & { createdAt: number }): Promise<boolean> {
+    this.fail('claim');
+    const key = MemoryStopLines.keyOf(line);
+    if (this.rows.has(key)) return Promise.resolve(false);
+    this.rows.set(key, {
+      serverId: line.serverId,
+      regionChannelId: line.regionChannelId,
+      day: line.day,
+      key: line.key,
+      messageId: null,
+      createdAt: line.createdAt,
+    });
+    return Promise.resolve(true);
+  }
+
+  sent(line: StopLineKey, messageId: string): Promise<void> {
+    this.fail('sent');
+    const row = this.rows.get(MemoryStopLines.keyOf(line));
+    if (row) row.messageId = messageId;
+    return Promise.resolve();
+  }
+
+  forget(line: StopLineKey): Promise<void> {
+    this.fail('forget');
+    this.rows.delete(MemoryStopLines.keyOf(line));
+    return Promise.resolve();
+  }
+
+  before(day: string): Promise<StopLineRecord[]> {
+    this.fail('before');
+    return Promise.resolve(
+      [...this.rows.values()]
+        .filter((row) => row.day < day)
+        .sort((a, b) => a.day.localeCompare(b.day) || a.createdAt - b.createdAt)
+        .map((row) => ({ ...row })),
+    );
+  }
+}
````

### Task 4: 8R-9 task 4: The board's words, permissions and docs

Prototype commit: `4a94b4adade99bfef444449ffd21a26586a30b44`

- The answers of /research report and /rocket report (and the map's)
  say where a report shows as 'In "Today’s Stops" on the board of #west'
  (boardWords, "boards" for several regions).
- The help of /research report and /rocket report names the board and
  the line in the region's channel; /admin setup-forums speaks of the
  board ("Today and coming up") it posts, pins and locks, the forum's
  -board ending and the rename of an old one.
- permissions.ts: Manage Threads and Send Messages in Threads say what the
  board needs of them.
- Guides: no Pin Messages in the invite (its number back to
  292326599760), the board and its lines, and /admin setup-forums run
  once after the update.
- cutover-check warns of regions with a forum but no board recorded in
  the database, in one line naming them #name as its other lines (P11,
  R5); /admin setup-forums says whether the
  board could be pinned and locked, and why not (P12).
- Comments and test names that said "pinned post" of the stops set right
  (R5); the cutover
  runbook names the board and -board (P13).
- stop-reports.md, parties-and-posts.md and testing.md describe the
  board, the lines and the fakes, the fix round's rules and the two
  accepted line losses.

**Files:**

```
 docs/architecture/parties-and-posts.md                        |  5 +++--
 docs/architecture/stop-reports.md                             | 18 ++++++++++--------
 docs/architecture/testing.md                                  |  4 ++--
 docs/guides/migrating-a-legacy-instance.md                    |  7 ++++---
 docs/guides/new-instance.md                                   |  7 +++----
 docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md |  6 +++---
 src/app.ts                                                    | 16 ++++++++--------
 src/commands/admin/setup-forums.test.ts                       | 39 ++++++++++++++++++++++++---------------
 src/commands/admin/setup-forums.ts                            | 42 ++++++++++++++++++++++++++++++------------
 src/commands/research/research-report.test.ts                 |  4 ++--
 src/commands/research/research-report.ts                      |  6 +++---
 src/commands/research/research.test.ts                        |  9 ++++++---
 src/commands/research/research.ts                             |  9 +++++----
 src/commands/rocket/rocket.test.ts                            | 16 ++++++++++++++--
 src/commands/rocket/rocket.ts                                 |  9 +++++----
 src/db/repositories/cutover-repository.db.test.ts             |  8 ++++----
 src/db/repositories/cutover-repository.ts                     | 14 ++++++++++++--
 src/db/repositories/research-repositories.db.test.ts          |  2 +-
 src/domain/research/reports.ts                                |  2 +-
 src/domain/stops/pictures.ts                                  |  4 ++--
 src/domain/time/research-periods.ts                           |  2 +-
 src/domain/web/stop-report-data.ts                            |  6 +++---
 src/domain/web/stop-report-view.test.ts                       |  2 +-
 src/domain/web/stop-report-view.ts                            |  4 ++--
 src/ops/cutover-check.test.ts                                 | 42 ++++++++++++++++++++++++++++++++++++++----
 src/ops/cutover-check.ts                                      | 33 ++++++++++++++++++++++++++++++---
 src/ops/permissions.ts                                        | 12 +++++++++---
 src/render/activity.ts                                        |  4 ++--
 src/render/research.test.ts                                   |  4 ++--
 src/render/research.ts                                        | 19 ++++++++++++++-----
 src/render/rocket.test.ts                                     |  4 ++--
 src/render/rocket.ts                                          | 16 +++++++++++-----
 src/render/stop-post.ts                                       |  2 +-
 src/render/summary.ts                                         |  2 +-
 src/services/notify-service.ts                                |  4 ++--
 src/services/party-service.ts                                 |  4 ++--
 src/services/raid-event-service.ts                            |  2 +-
 src/services/rocket-reports.ts                                |  2 +-
 src/services/stop-reports.ts                                  |  2 +-
 src/web/server.ts                                             |  2 +-
 src/web/stop-report-post.test.ts                              |  2 +-
 src/web/stop-reports.test.ts                                  |  6 +++---
 src/web/stop-routes.ts                                        |  2 +-
 43 files changed, 272 insertions(+), 133 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/admin/setup-forums.test.ts src/commands/research/research-report.test.ts src/commands/research/research.test.ts src/commands/rocket/rocket.test.ts src/domain/web/stop-report-view.test.ts src/ops/cutover-check.test.ts src/render/research.test.ts src/render/rocket.test.ts src/web/stop-report-post.test.ts src/web/stop-reports.test.ts`, `npx vitest run --project db src/db/repositories/cutover-repository.db.test.ts src/db/repositories/research-repositories.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4a94b4adade99bfef444449ffd21a26586a30b44 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-9 task 4: The board's words, permissions and docs`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index f3944b6b..1559183c 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -65,9 +65,10 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Where the bot may not make posts (plan 8S-3, staging of 8S-2: without Manage Threads, "Manage Posts" in a forum's settings, Discord refused a post with the forum's moderated tag as Missing Access; archiving, locking, pins and tags need it too, so a post without its tag would still break at its end), `DiscordPartyGateway.createPost` refuses before asking Discord, from the cache, where the bot lacks what the post needs there (`postNeeds`, `src/domain/party/post-permissions.ts`, names only, which the render reads without discord.js: View Channel, Create Posts, and Manage Posts only for a post with a moderated tag, as the forum lists its tags (Pine makes its tags moderated), so that a region's summary, which has none, is made without it as before and only its pin warns; not Send Messages in Posts, which Discord does not ask to start a post, though the bot needs it to write in its posts later and `cutover-check` asks it of every forum), and takes Missing Access as the same refusal (`PostsRefusedError`, with what it lacks; none known for Discord's answer); `PartyService` keeps nothing, answers `no-post` with `refused` (`NoPost`; raids, meetups, trains, moves, splits) and logs a warning once per forum while it runs, and the member is told `noPostWords` ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me."; a move, `posts-refused` with `refused`, `postsRefusedMoveWords`; an approved meetup, `postsRefusedFailure`; `/admin setup-forums` for the summary, `summaryRefusedWords`, and for a summary made but not pinned "posted the list of active raids (I could not pin it: give me Manage Posts there)", or "…; see the log)" for another failure: `ForumSetup.unpinned`). Every `no-post`, refused or a post lost while it was made, is none of the member's doing and leaves the use uncounted (`UserError` `givesBack`: `/meetup`, `/train`, `/raid` and its menu, the map's meetups, trains and raids, a screenshot's image: `screenshots.md`; the Submit of a split's dialog (Split… and `/group split`), said in its private answer, and the Submit of the dialog of `/location`, said in its private answer, both `said`); `/raid` says it in its own answer, in place of its menu or with the screenshot's feedback button (`said`). Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else; a forum it cannot look through for a refusal of Discord's is warned of by name, the other failures (the network away) once per sweep with how many forums (plan 8X-H), and each sweep says at debug what it archived. A closing of which a part failed for the network or a rate limit (the link line, a copy, its last showing, a leftover's deletion, the last words, the tags, the archiving, a moderator's deletion; `worthRedoing`, review r0 B2, B5: a refusal of Discord's such as Missing Access would fail again and is not kept, and a post that is gone drops it whatever else failed) is kept in memory (`undoneClosings`, a `BoundedMap` of `UNDONE_CLOSINGS_MAX`, the party as it ended, its last words and whether they were said, `delete` where a moderator chose to delete the post and the deletion failed for the network, review r0 B3: meanwhile it is closed and archived as usual, `endAs` says `deleting` (review r1 C1: the moderator is told that it is archived for now and will be deleted within the hour, and the report keeps `delete`), and the redo deletes it; Discord refusing the deletion leaves it archived and `archived`, as before; a post that is gone is `archived`) and done again by `redoClosings()`, the first step of the hourly upkeep and so of the catch-up on reconnect (plan 8X-H, Matt 2026-10-23: such a post kept its live controls, and the sweep only archives; review r0 B4), for a day after the party ended (`UNDONE_CLOSING_KEPT_MS`: no post opened and archived again days later); a redo (`closePost`'s `redo`) sets the tags of the last showing for every kind of party, also a raid the clock ended, whose showing with Ended may have failed in the same outage (review F2), and, where the post is to be archived, shows it first, before the copy in it and the leftovers are deleted: the post may be archived already, and Discord refuses a deletion in an archived post (50083) until something opens it (review F4); ending between parties with the clock's stop and with the first closing that fails again (one probe a run while the network is away: a request that is black-holed takes about a minute, review r1 C2); it logs `closed ended parties again` with how many were redone and failed again. A restart forgets them, and the sweep archives what is left open as before. Accepted risk (review r0 B12): last words that Discord received but whose answer the network lost are said again by the redo, so they may stand twice in the post. `redrawPosts()` shows every active post anew as `emojiChanged` does, paced (it only queues them, one party every `EMOJI_RENDER_GAP_MS`, so N posts take N × 250 ms, beside the upkeep and the feeds, review r0 B10): an edit that failed leaves its post stale until something shows it anew (`showPost` forgot what it sent before trying), and a current post makes no edit. The updates of a post or a summary that failed for the network are warnings (`isNetworkError`, `src/services/network-error.ts`), errors otherwise (operations.md, "The catch-up on reconnect").
-- `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Going on now` (`SUMMARY_TITLE`; plan 8X-G, Matt 2026-10-22: every kind of party, `Active raids` before; `NOTHING_GOING` "Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.") with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the max battles under **Max battles** (plan 8X-3: those whose end has not come, 5 stars down to 1, Gigantamax last, the soonest end first in each), then the trains, then **Passing through** (plan 8X-G, review R9: the trains of other regions of the server with a stop in this region, as their copies go, `stopRegionsInGuild`; each linked to its copy in this region's channel, a message link by the server's snowflake, `guilds.snowflakeOf`, read once, else to its post; counted in the head as `N trains passing through`; a train's change, and its end, ask for every summary of its server, an unchanged one not edited, and a copy recorded for its region's, `PartyMirrorsOptions.copied`), then the meetups (a timed party's start or end more than a day ahead as Discord's date and time, `<t:…:f>`, which each reader's client shows in their own time zone with daylight saving; within a day the relative stamp, which Discord rounds, "in 4 days" for 3 days and 15 hours: plan 8X-H, Matt 2026-10-23; the switch comes with the next draw, at the latest the hourly upkeep), one text display per tier and section, and last, after a line, the region's pinned post of the stops today with its counts (`[Today’s Stops](<link>): 6 tasks · 2 hideouts`, and under an event's window the day's research waiting named apart, last as in the post, `· 13 tasks back at <t:…:t>`, so a window with only the day's research still links the post, plan 8R-6; `StopsLine`, from `StopPostService.summaryOf` set with `setStopPosts`; nothing where nothing is reported, none in rehearsal mode; `stop-reports.md`), all within `TEXT_BUDGET` (`SECTION_ROOM` for the max battles, the trains, the trains passing through and the meetups each, a heading and a count line for every tier, "…and N more", the stops' line kept from the start). A train counts as passing through a region while it will still reach a stop there (`stopsStillReached`, review r0 C4, Matt 2026-10-22): one that finishes the stops from its current one on, one that loops or turns back every stop (a turn-back keeps its mode and comes back), a finished route none. The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. Where the record of a region's summary is gone or empty, a `Going on now` post the bot made in the forum, or one it made as `Active raids` before plan 8X-G (`LEGACY_SUMMARY_TITLE`; renamed with its next edit, `renameSummary`, by Discord's rename limit; the text is recorded as sent, so a request with the same text edits nothing while the rename waits, and the wait is a timer of its own that renames and edits nothing, `renameSummaryLater`, review r1 R1-6; a refused permission is warned of once per region until a rename works again, the next change of the text trying it again, and any other failure is tried again after the rename window, review r0 C1, r1 R1-5), is recorded and edited instead of making a second one, which Discord would not pin beside it (30047: one pinned post per forum; `takeOverSummary`, staging of 2026-10-16): the pinned one, else the oldest open one, pinned with its next edit (`openPosts` lists open posts only: an archived one is not found). A forum that changed meanwhile gets no post; a failed look makes a new post, with a warning. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
+- `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Today and coming up` (`SUMMARY_TITLE`; plan 8R-9, the region's board: "Going on now" before it, and `Active raids` before plan 8X-G, every kind of party since; `NOTHING_GOING` "Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.") with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the max battles under **Max battles** (plan 8X-3: those whose end has not come, 5 stars down to 1, Gigantamax last, the soonest end first in each), then the trains, then **Passing through** (plan 8X-G, review R9: the trains of other regions of the server with a stop in this region, as their copies go, `stopRegionsInGuild`; each linked to its copy in this region's channel, a message link by the server's snowflake, `guilds.snowflakeOf`, read once, else to its post; counted in the head as `N trains passing through`; a train's change, and its end, ask for every summary of its server, an unchanged one not edited, and a copy recorded for its region's, `PartyMirrorsOptions.copied`), then the meetups (a timed party's start or end more than a day ahead as Discord's date and time, `<t:…:f>`, which each reader's client shows in their own time zone with daylight saving; within a day the relative stamp, which Discord rounds, "in 4 days" for 3 days and 15 hours: plan 8X-H, Matt 2026-10-23; the switch comes with the next draw, at the latest the hourly upkeep), one text display per tier and section, and last, after a line, the region's pinned post of the stops today with its counts (`[Today’s Stops](<link>): 6 tasks · 2 hideouts`, and under an event's window the day's research waiting named apart, last as in the post, `· 13 tasks back at <t:…:t>`, so a window with only the day's research still links the post, plan 8R-6; `StopsLine`, from `StopPostService.summaryOf` set with `setStopPosts`; nothing where nothing is reported, none in rehearsal mode; `stop-reports.md`), all within `TEXT_BUDGET` (`SECTION_ROOM` for the max battles, the trains, the trains passing through and the meetups each, a heading and a count line for every tier, "…and N more", the stops' line kept from the start). A train counts as passing through a region while it will still reach a stop there (`stopsStillReached`, review r0 C4, Matt 2026-10-22): one that finishes the stops from its current one on, one that loops or turns back every stop (a turn-back keeps its mode and comes back), a finished route none. The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. Where the record of a region's summary is gone or empty, a `Today and coming up` post the bot made in the forum, or one it made as `Going on now` or `Active raids` before (`LEGACY_SUMMARY_TITLES`, B12; renamed with its next edit, `renameSummary`, by Discord's rename limit; the text is recorded as sent, so a request with the same text edits nothing while the rename waits, and the wait is a timer of its own that renames and edits nothing, `renameSummaryLater`, review r1 R1-6; a refused permission is warned of once per region until a rename works again, the next change of the text trying it again, and any other failure is tried again after the rename window, review r0 C1, r1 R1-5), is recorded and edited instead of making a second one, which Discord would not pin beside it (30047: one pinned post per forum; `takeOverSummary`, staging of 2026-10-16): the pinned one, else the oldest open one, pinned with its next edit (`openPosts` lists open posts only: an archived one is not found). A forum that changed meanwhile gets no post; a failed look makes a new post, with a warning. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
+- **The region's board** (plan 8R-9; design `docs/superpowers/specs/2026-10-25-region-board-design.md`): the summary post is the forum's locked pinned post "Today and coming up", with "Today’s Stops" posted under it (`stop-reports.md`). **Locked** when made (`createSummary`: `PartyGateway.lockPost` after the pin), and pinned and locked again wherever Discord says it is not (`postInfo`'s `pinned` and `locked`, `pinAndLock`): after each edit of the summary, and after each draw of the stops in it whether or not the summary's text changed (`summaryChanged(region, true)`, B4: their messages open an archived board, which comes back unpinned); a refused lock (Manage Posts, as for the pin) is said once per region (`could not lock the board post`), and `/admin setup-forums` says whether a board it made could be pinned and locked, and why not (`ForumSetup.unlocked`, review P12). A board gone while the summary's text stood (the stops' draw checks it, `pinAndLock` finds no post) is asked for again, so that the next edit replaces it (review P2). **By day** (B8): `isToday` (`src/domain/party/board-day.ts`, pure, the one rule of the board and `/status`): a party that has started (`partyStart`: a train's or meetup's start, a raid's hatch, none for a max battle), starts before the next local midnight (`nextLocalMidnight`, Luxon in `settings.timezone`) or has no time is today's, under the headings as before; every other party, of any kind (an elite egg days ahead, a train passing through), is one list under `**Coming up**` (`COMING_UP_HEADING`) by start, its kind first (`Meetup`, `Train`, a train kind's words, `… passing through`, a raid's `raidWords`), its post (a train passing through: its copy here), the full date and time (`<t:…:f>`, each reader's zone) and its count, sure of `SECTION_ROOM` and counting what does not fit (`renderSummary`'s `more.zone`; without it everything is today's). The head counts today's (" today" after the last where something is coming up), `N coming up`, then the stops as their line counts them (`3 raids · 1 train today · 2 coming up · 4 tasks · 2 hideouts`); `NOTHING_GOING` only where there is neither a party nor a stop (review P7). The stops' line stays last: `[Today’s Stops](<link>) (below): 4 tasks · 2 hideouts` in the board (`summaryMessage(region, 'board')`, `more.stopsBelow`), without "(below)" in `/status` in the region's channel, linking the first message of the stops in the board. **At midnight** (B7) `watchMidnight` (started once Discord is there, in rehearsal mode too) draws every region's summary anew a second after each local midnight (review P10) (`setTimer`), and `redrawPosts` (the catch-up on reconnect) draws every summary anew as well; an unchanged one is not edited. `createSummary` and `takeOverSummary` tell the posts of the stops `boardChanged(channelId)` (B2). B12's other half needs no code: `makeSummary` keeps a recorded post whatever its archived state (`postInfo` answers for an archived thread), so `takeOverSummary` runs only where the record is gone, and an archived summary the record lost is not found (`openPosts` lists open posts only).
 - Staff for raid moderation are admins, moderators and the owner (`isStaff`, `requireManagement`, `managementRoleIds` in `guards.ts`): `/delete` and `/admin save-party` are theirs; the rest of `/admin` also admits bot developers (`requireBotManagement`). `/delete` (Manage Messages since plan 8S-2; it asks in a dialog whether to archive the post or delete it, plan 8Q, `moderation.md`) has no throttle: it is the staff's manual clean-up and must always work; the post of a raid it closed says so in the place of the times (`RaidPostView.closed`). `/admin save-party` outside a post lists the kept posts. `/shout` is for members who are signed up.
-- The forum of a region holds its raids, max battles, trains and meetups and is named `<region channel>` + `settings.regionForumSuffix` (default `-meetups`). `/admin setup-forums` creates it, renames one whose name is the region's with another one-word ending (a name chosen by hand stays), and leaves the making of posts to the bot (`PartyGateway.reservePosts`: Send Messages denied to everyone and to every role the forum allows it, allowed to the bot; writing in posts is untouched). In rehearsal mode it makes forums only for the rehearsed regions, a new one hidden from its first moment (`createForum(…, hidden)`) and one that is there hidden before anything is posted in it (`PartyGateway.hideForum`, `hiddenForumOverwrites`); a forum that cannot be hidden gets nothing posted (`operations.md`, "Rehearsal mode").
+- The forum of a region holds its raids, max battles, trains and meetups and is named `<region channel>` + `settings.regionForumSuffix` (default `-board` since plan 8R-9, `-meetups` before: an old forum is renamed by the next `/admin setup-forums` or `/region import`). `/admin setup-forums` creates it, renames one whose name is the region's with another one-word ending (a name chosen by hand stays), and leaves the making of posts to the bot (`PartyGateway.reservePosts`: Send Messages denied to everyone and to every role the forum allows it, allowed to the bot; writing in posts is untouched). In rehearsal mode it makes forums only for the rehearsed regions, a new one hidden from its first moment (`createForum(…, hidden)`) and one that is there hidden before anything is posted in it (`PartyGateway.hideForum`, `hiddenForumOverwrites`); a forum that cannot be hidden gets nothing posted (`operations.md`, "Rehearsal mode").
 - `RegionRepository.setForum` gives a region its forum (one forum per region, enforced by a unique key); `setSummaryMessage` names the forum the summary post was made in.
 
 ## Attendance, lines and the completion question
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index 5e5bfc7c..9ac1ce8c 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -1,10 +1,10 @@
 # Reports at stops
 
-What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/2026-10-21-stop-reports-design.md`): stops of Pine's own, the field research task list, research periods, the stop reports and `/research`, the pinned post "Today’s Stops", and the research wants and their DMs; Team GO Rocket (plan 8R-2): the lineups, `/rocket`, grunts' messages, the post's hideouts, Rocket wants and DMs. The map's server side (plan 8R-3) is in `web.md`, "Reports at stops on the map": it shares the code paths below. Their pictures (plan 8R-6) are under "Pictures at the stops" below. Read before changing anything under `src/domain/stops/`, `src/domain/research/`, `src/domain/rocket/`, `src/commands/research/`, `src/commands/rocket/`, `src/commands/stops/`, or `src/services/` `stop-reports.ts`, `stop-posts.ts`, `research-task-service.ts`, `rocket-lineup-service.ts`, `rocket-reports.ts`, `grunt-messages.ts`, `pine-stops.ts`.
+What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/2026-10-21-stop-reports-design.md`): stops of Pine's own, the field research task list, research periods, the stop reports and `/research`, the post "Today’s Stops" (in the region's board since plan 8R-9) and the lines of the region channels, and the research wants and their DMs; Team GO Rocket (plan 8R-2): the lineups, `/rocket`, grunts' messages, the post's hideouts, Rocket wants and DMs. The map's server side (plan 8R-3) is in `web.md`, "Reports at stops on the map": it shares the code paths below. Their pictures (plan 8R-6) are under "Pictures at the stops" below. Read before changing anything under `src/domain/stops/`, `src/domain/research/`, `src/domain/rocket/`, `src/commands/research/`, `src/commands/rocket/`, `src/commands/stops/`, or `src/services/` `stop-reports.ts`, `stop-posts.ts`, `research-task-service.ts`, `rocket-lineup-service.ts`, `rocket-reports.ts`, `grunt-messages.ts`, `pine-stops.ts`.
 
 ## The tables (migration 027)
 
-- One migration for all of 8R-1 (`2026_10_21_027_stop_reports.ts`; 026 at first, renumbered when typescript-migration was merged in, as 8X-4's `026_train_spot_stops` came first), additive and guarded as the others: `PineStop` (a server's own stops: snowflake `serverId`, name, point, address, who made it, when), `StopReport` (one per server, stop key, kind and period: unique `(serverId, stopKey, kind, periodKey)`, `periodKey` up to 220 characters for the feed's longest event id and a day; the stop's snapshot, `subjectKey`, the detail as JSON, the reporter, `endsAt`, `madeAt`; the kinds `research` and, since plan 8R-2, `rocket`: `StopReport` is the union `ResearchReport | RocketReport`, narrowed by `isResearchReport` / `isRocketReport`), `ResearchEvent` (the events of the feed with research: id, name, type, start, end, as last seen), `StopPost` (a region channel's post of a day: channel, local day, server, message ids in order), `TargetWant` (a member's want that is no `PokemonNotification`: server and member by their rows, the target token, unique on the three, indexed by server and token for the notifier) and `ResearchTask` (the last good task list: key, text, category, rewards as JSON, its place on the page, first and last seen, active).
+- One migration for all of 8R-1 (`2026_10_21_027_stop_reports.ts`; 026 at first, renumbered when typescript-migration was merged in, as 8X-4's `026_train_spot_stops` came first), additive and guarded as the others: `PineStop` (a server's own stops: snowflake `serverId`, name, point, address, who made it, when), `StopReport` (one per server, stop key, kind and period: unique `(serverId, stopKey, kind, periodKey)`, `periodKey` up to 220 characters for the feed's longest event id and a day; the stop's snapshot, `subjectKey`, the detail as JSON, the reporter, `endsAt`, `madeAt`; the kinds `research` and, since plan 8R-2, `rocket`: `StopReport` is the union `ResearchReport | RocketReport`, narrowed by `isResearchReport` / `isRocketReport`), `ResearchEvent` (the events of the feed with research: id, name, type, start, end, as last seen), `StopPost` (a region channel's post of a day: channel, local day, server, message ids in order; since migration 031 the board post it is in, `threadId`), `TargetWant` (a member's want that is no `PokemonNotification`: server and member by their rows, the target token, unique on the three, indexed by server and token for the notifier) and `ResearchTask` (the last good task list: key, text, category, rewards as JSON, its place on the page, first and last seen, active).
 - Repositories and their twins (each pair runs one set of shared cases, `test/support/*-cases.ts`): `StopReportRepository` / `MemoryStopReports`, `PineStopRepository` / `MemoryPineStops`, `StopPostRepository` / `MemoryStopPosts`, `ResearchEventRepository` and `ResearchTaskRepository` / `test/support/research-store.ts`, `TargetWantRepository` / `MemoryTargetWants`, `WantBoxRepository` / `MemoryWantBoxes`.
 - Migration 028 (plan 8R-2, `2026_10_22_028_rocket.ts`, additive and guarded): `RocketLineup` (the last good list of `/rocket`'s choices, kept as `ResearchTask` keeps the task list: `rocketKey`, name, catches as JSON, `position`, first and last seen, `active`) and `GruntMessage` (a grunt's message in a region channel until it is deleted, as `SpawnReport`: message, channel, server, the `StopReport` row it shows (`reportId`, no foreign key: the message outlives a report replaced or taken back until its delete is done), `deleteAt`; indexed by report and by `deleteAt`). A Rocket report itself is a `StopReport` row of the kind `rocket` (below). Twins `MemoryRocketLineups`, `MemoryGruntMessages` (`test/support/rocket-store.ts`; `rocketLineupCases`, `gruntMessageCases`).
 
@@ -53,17 +53,19 @@ Design `docs/superpowers/specs/2026-10-23-research-rewards-apart-design.md` (its
 - **Grunts' messages** (`GruntMessageService`, `src/services/grunt-messages.ts`): `gruntMessage` (`src/render/rocket.ts`, `ROCKET_COLOUR`): `### Water-type grunt`, `**Catch** one of …`, when it goes away, with one picture beside them by the rule (plan 8R-6, `GruntView.picture`; no gallery), `**Where**` the stop's line with its maps link and picture, the reporter in the small print (`memberByName`); `gruntTextMessage` where the bot may not embed; a message refused for what it holds is sent once more without pictures; a channel where the send fails for any reason (refused, 5xx, a time-out) is passed over and logged, and a message that cannot be recorded is deleted at once and counts as not posted (`post` never rejects, fix A1); a delete after a report ended early that fails is tried once more a minute later (fix A3). A report's posting, refines and end run in turn per report id (`KeyedLock`, review R1): a refine edits every message its posting sent, and an end deletes what a refine kept. A grunt refined in place (plan 8R-4L, `refine`) has each of its messages edited where it stands as the kind it was sent as (`sentAs`, review R6: components v2, or plain text, never by what the bot may do in the channel by then; where Discord refuses the edit for what it holds, components v2 once more without pictures; a message known to be components v2 is never edited as plain text, one sent as plain text is tried as components v2 after; a message of an earlier process, whose kind is not known, is guessed by the rule `send` used, `mayPost`, then tried as the other kind, fix round 2, F4), keeping the message ids; it gives the messages that stand and whether it looked at every one (`RefinedGrunt`, F2: `complete` false for five causes, fix wave K3: `messagesOf` failed, read once more and failed again, L-5, `unread`; a newer version is shown already; the service closed on the way; the report ended on the way; a delete of one of its messages was on its way); a refine older (`madeAt`) than what the messages show already edits nothing (`shown`, review R2), and one whose report ended while an edit was on its way retimes and keeps nothing (review R4); a message whose edit fails stays as it was and is logged, one gone is forgotten; each one's delete follows the new `endsAt` (`GruntMessageStorage.retime`, the timer set anew). The heading stays the type's name (`### Water-type grunt`), never the gender. `messagesOfReports(ids)` reads the messages of many reports at once (`GruntMessageStorage.ofReports`; the map's list, plan 8R-3). Each message is a `GruntMessage` row until deleted: at the report's end, at once when it ends early (`ended`: replaced, taken back; one still on its way goes as soon as it is there, `endedEarly`, and `post` sends nothing more of it, fix F3), a failed delete once more a minute later, then by `sweep` (the scheduler's `grunts`, hourly and at start) until a day after its time. A shutdown deletes nothing (`close`): the report stands on through a restart, and so does its message (unlike spawn reports); it posts and edits no more, sets no timer, and waits for the postings, refines and ends on their way (`KeyedLock.whenIdle`, fix round 2, F5): an edit made meanwhile is recorded with its new end, which the next start's sweep keeps.
 - **`/rocket report who: stop:`** and **`/rocket remove stop:`** (`src/commands/rocket/`, every server): `who` a choice (`whoChoices`: by name, then by what can be caught; `Name · catches in short`, Giovanni's "(only when sure it is him)") or a name typed in full (`readWho`: `water`, `water grunt`, `arlo`, `decoy`); a key gone from the lineups is `LINEUPS_CHANGED`. Plan 8R-4L (S8, S11, B3–B5, B14): once the typed words find something, a grunt type of two lineups is three choices, each lineup by its first slot (`Water-type grunt · Magikarp, Feebas`, value `lineupValue`) in the feed's order, then `Water-type grunt · not sure which` (`NOT_SURE_WHICH`, the type's key and both lineups' catches), while the whole list fits 25, else one choice per type; with nothing typed one per type (24 today; 28 with the lineups); "Did you mean" names each type once. `readWho` takes `<lineup key>#<fingerprint>` while the type's lineups hold that lineup with that fingerprint (a rotation that changed it, or a type that lost its second lineup, is `LINEUPS_CHANGED`), as it does a lineup's key without `#`, a merged key with one and a `#` value of no key; a name typed is the merged choice. The report's `subjectKey` is the lineup's key and its catches the lineup's (`rocketSubject`, with `RocketDetail.lineup` the first slot in short); its name stays the type's in the grunt's message, the DMs and the pinned post. A grunt is named with its lineup where it is named apart from its catches (`rocketLabel`: `Water-type grunt · Magikarp, Feebas`): the answer's "was" line (a grunt of the same type without one as "Water-type grunt, not sure which"), "Already reported", the hideout question and the map's view. The stop as `/research` reads it (`namedStop` with Rocket's refusal `NOT_A_ROCKET_STOP`). Its guard (`requireRocketReport`: `ROCKET_FROM_A_REGION`, `NO_STOPS_HERE`, who, the stop, and the hideout standing there) runs before the throttle (`rocketThrottle`, `rocketWindow`). A grunt where a hideout stands today opens the dialog "Replace a hideout?" (`defer` none then; `readInTime` with nothing more to read; `PendingRequests`): "Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s report with the Water-type grunt? Submit replaces it." Its Submit (`rocket:<token>:replace`, `carriesOn` the command's use and window) reports with that hideout's id; another hideout meanwhile is `HIDEOUT_CHANGED` and gives the use back; one reported between the guard and the report (no dialog possible then) is refused and gives the use back. `already` answers "Already reported: a **Water-type grunt** at **Stop**, by **Ash** <t:R>; it goes away <t:R>." with a link to its message, and gives the use back (plan 8R-6). The answer (`rocketAnswer`): who at which stop, what can be caught, what it replaced ("again" only where its key and its `rocket.lineup` are the new one's, fix wave, L-3; else "was:" with its `rocketLabel`, so a lineup whose first slot rotated is named as it was), where it shows (the grunt's channels and when it goes, `Posted in #…`, or `Changed in #…` for a grunt refined in place, plan 8R-6, `RocketReported.changed`; a hideout's posts until midnight, `In the post "Today’s Stops" of #…`; in rehearsal mode only until when) and Take back (`rocket:<id>:back:<stop key>:<rocketKey with . for every :>:<madeAt in base 36>`, taking back that version only, review L1: a report refined in place since answers `REPORT_CHANGED` to anyone, its first reporter and staff too; `replaceAll` both ways since plan 8R-4L (S9), a fourth argument refused; the longest Wayfarer key with `grunt.electric.female` and a ten-digit id is 90 characters; the bare `rocket:<id>:back` where that would pass 100 characters; `MEMBER_WRITE_THROTTLE`; where the id is gone it takes back the presser's report of the same who at the same stop made at the same moment and standing now, a hideout put back under a new id, which keeps its `madeAt` (fix S3), never a newer report of the same who (fix F1)). `/rocket remove` takes back one's own report at a stop, any for staff.
 
-## The pinned post "Today’s Stops"
+## "Today’s Stops" on the region's board (plan 8R-9)
 
-- `StopPostService` (`src/services/stop-posts.ts`): one post per region channel and local day, made at the first report of the day in the region, pinned (the "pinned a message" notice deleted where the bot may; at Discord's pin limit, or without Pin Messages, it stands unpinned and that is logged once per channel), drawn anew `POST_DELAY_MS` (3 s) after the last change (`Gathered`, coalesced) in one queue per channel (`KeyedLock`), the midnight delete included; reads are done before any Discord call. A change of the reports is drawn only in the regions it touched: `StopReportListener.changed(serverId, stops)` names the stops of the reports made or taken back (a replaced report's too), and only the region channels whose outlines hold one of them are queued; the period changes and the research events draw every post. A message whose payload equals the one last drawn there (a hash per message id, in memory: the first draw after a restart edits) is not edited. An edit that fails is thrown (logged, the post stands, the next change draws it again); a message is deleted and sent anew only when it is gone or changes kind (components v2 to plain text, or back, as `mayPost` changes), and, its kind not known in the first draw after a restart, when Discord refuses its edit for what it holds (`isRefusedBody`); any other failure keeps it there too. A channel with no post in memory reads its kept rows from storage before it draws (a report before `start` has read them, or after that failed, edits the post a restart left; a failed read draws nothing), and `start` keeps what such a draw made, and deletes a post older than its channel's newest (one whose delete failed at its midnight). A timer at `nextPeriodChange` draws every kept post anew (`draw` deletes the post of an ended day and makes today's where reports stand); `start()` does the same for what a restart left (`StopPost` keeps the ids, each message's saved as soon as it is sent, before it is pinned), and sets the timer also when the kept posts cannot be read; a change of the research events (`onResearchChange`) draws the posts anew and sets the timer again (those redraws in a set of their own, which `flush` and `close` wait for and `messageOf` does not: it waits only for its own channel). It is kept, saying "Nothing reported right now.", when every report is taken back. None in rehearsal mode. The region's summary post links it (plan 8X-G, `parties-and-posts.md`): `summaryOf(channelId)` gives the server, the post's first message and how many tasks and hideouts it shows as last drawn (the hideouts as the post counts them, one per leader or decoy whatever its stops, review r0 C2), and under an event's window how many tasks of the day's research wait below it and when they come back (`waiting`, plan 8R-6: the summary says `· 13 tasks back at <t:…:t>`), undefined without a post of today drawn since the start; `changed(channelId)` (`StopPostServiceOptions`, `app.ts`: `PartyService.summaryChanged` of the channel's region) is told after each draw and each delete, so the summary is drawn anew after every draw of the post and edited where the counts changed. Where the post lives, the region's channel or its forum, is open until the 8R staging.
+Design `docs/superpowers/specs/2026-10-25-region-board-design.md` (its review B1–B14 and Matt's three answers). Until plan 8R-9 the post was pinned in the region's text channel; it is now posted in the region's board, the forum's locked summary post "Today and coming up" (`parties-and-posts.md`), below the summary.
+
+- `StopPostService` (`src/services/stop-posts.ts`): one post per region channel and local day, made at the first report of the day in the region, in the region's board: the thread of `Region.summaryMessageId`, read anew at each draw (B2), its messages sent with `SuppressNotifications` (`SendOptions.silent`, B13: a follower of the board is not notified of each; edits never notify). No pin: in a locked post only the bot (and moderators) write, so every message it sends lands below the ones before; the summary stays the post's first message. Drawn anew `POST_DELAY_MS` (3 s) after the last change (`Gathered`, coalesced) in one queue per channel (`KeyedLock`), the midnight delete included; reads are done before any Discord call. A change of the reports is drawn only in the regions it touched: `StopReportListener.changed(serverId, stops)` names the stops of the reports made or taken back (a replaced report's too), and only the region channels whose outlines hold one of them are queued; the period changes and the research events draw every post. A message whose payload equals the one last drawn there (a hash per message id, in memory: the first draw after a restart edits) is not edited. An edit that fails is thrown (logged, the post stands, the next change draws it again); a message is deleted and sent anew only when it is gone or changes kind (components v2 to plain text, or back, as the board's `postAccess` changes), and, its kind not known in the first draw after a restart, when Discord refuses its edit for what it holds (`isRefusedBody`); any other failure keeps it there too. **A message sent anew in its place takes every message after it along** (B5): messages i to n are deleted and sent again below it, so the order stays (a moderator writing in the locked post between the bot's messages is accepted). **Where the board is not** (B10: the region has no forum or no summary post): nothing is drawn, the summary's counts and the links are forgotten, and `the region has no board post` is said once per channel until it draws again; no fallback to the text channel. The next turn-over (the period timer, the research events, the catch-up) draws such a region again (review P6, its server by `serverOf`); a send into a board that is gone tells the summary (`changed`), whose next edit makes the board anew (review P2). **Where the bot may not write in it** (B6, `PartyGateway.postAccess`, the post fetched (review P3), on the post's forum: View Channel, Send Messages in Threads and Manage Threads, which writing in a locked post takes, Discord's 160005): nothing is drawn, said once (`the bot may not write in the board post`); without Embed Links the post is plain text (`stopPostText`). **A board replaced or taken over** (B2: `replaceSummary` deletes the whole thread, `takeOverSummary` may record another post): the `StopPost` row keeps the board it was drawn in (`threadId`, migration 031); a draw in another board deletes the old board's messages first (review P5: a post taken over must not keep a second copy; a thread gone is fine), never opening it (review R2: an archived old board refuses with 50083, which is logged and accepted) and sends every message anew there, and `PartyService` tells `boardChanged(channelId)` when it makes or takes over a summary, which draws the region's post (its server by the kept post, else by the region's row, `guilds.snowflakeOf`). The gateway opens an archived board before it sends or deletes in it where asked (B3: Discord refuses either in an archived locked post, 50083; an edit opened it already; review P4: `SendOptions.reopen` and `DeleteOptions.reopen`, asked only by the posts of the stops, every other send and delete as before), and the summary checks the board's pin and lock after each draw of the stops (`changed` → `PartyService.summaryChanged(region, true)`, B4). **The first switch** (B11): a row without `threadId` is a post the bot before plan 8R-9 pinned in the region's channel, read as messages of that channel still to delete (`fromStorage`, `StopPostRecord.leftover`, column `leftoverIds` of migration 031); the first draw unpins and deletes them there (`clear`), `start` the older days' rows too (`remove`), and today's post is drawn in the board. **A delete that fails** (review P1, the network away) is never forgotten: a message of the region's channel stays in `leftover` of the day's row (with the board post, or in a row of its own while none is drawn) and is tried again at each draw; a post of an ended day whose delete fails keeps its row with what is left (`leftovers` in memory), deleted again at the next turn-over and, after a restart, at `start`; a message gone counts as deleted, and a delete Discord refuses for good (50001, 50013, review R1) is said once per channel and forgotten (DMs and answers sent earlier that day point at deleted messages: accepted). A channel with no post in memory reads its kept rows from storage before it draws (a report before `start` has read them, or after that failed, edits the post a restart left; a failed read draws nothing), and `start` keeps what such a draw made, and deletes a post older than its channel's newest (one whose delete failed at its midnight). A timer at `nextPeriodChange` draws every kept post anew (`draw` deletes the post of an ended day and makes today's where reports stand); `start()` does the same for what a restart left (`StopPost` keeps the ids, each message's saved as soon as it is sent), and sets the timer also when the kept posts cannot be read; a change of the research events (`onResearchChange`) draws the posts anew and sets the timer again (those redraws in a set of their own, which `flush` and `close` wait for and `messageOf` does not: it waits only for its own channel). It is kept, saying "Nothing reported right now.", when every report is taken back. None in rehearsal mode. **Links** (B1): `messageOf` (once what waits is drawn) and `linkOf` (as last drawn) give a `PostLink`, the message that holds the subject or else the post's first message (review P9: a task only counted), `{ channelId, messageId }` with the board's thread as the channel, and every caller links it so (`https://discord.com/channels/<server>/<thread>/<message>`): the research and Rocket DMs' "Go to post", "Already reported" (`postLinkOf`), the map's links (`stop-routes.ts`) and the lines of the region channels. The region's summary links the post (plan 8X-G, `parties-and-posts.md`): `summaryOf(channelId)` gives the server, the board's thread, the first message of the stops and how many tasks and hideouts it shows as last drawn (the hideouts as the post counts them, one per leader or decoy whatever its stops, review r0 C2), and under an event's window how many tasks of the day's research wait below it and when they come back (`waiting`, plan 8R-6: the summary says `· 13 tasks back at <t:…:t>`), undefined without a post of today drawn since the start; `changed(channelId)` (`StopPostServiceOptions`, `app.ts`: `PartyService.summaryChanged(region, true)`) is told after each draw and each delete, so the summary is drawn anew after every draw of the post, edited where the counts changed, and its pin and lock checked. A member kept out of the region's forum (`memberAccess`) no longer sees the stops, though they see the text channel's lines (Matt's answer: accepted).
+- **The lines of the region channels** (B9; `StopLineService`, `src/services/stop-lines.ts`, `src/render/stop-lines.ts`): the first time in a local day that a research task (any version of it, "one of" too; research waiting under an event's window counts, its task placed in the post) or a leader or Giovanni is reported at a stop in a region, a line in the region's channel links the board's message that holds it: `Research: **Catch 25 Pokémon** (Rare Candy) → <link>` (its text and its reward as first reported, `one of …` for a "one of", nothing for a typed task without one; `researchLine`) and `Team GO Rocket: **Arlo** at **Yellow Mural** → <link>` (`hideoutLine`); names through `plain()`. The line is claimed first by its row (`StopLine`, migration 031, unique `(serverId, regionChannelId, day, lineKey)`; keys `research:<task key>` and `rocket:<leader:… | giovanni>`; `StopLineRepository` and its twin `MemoryStopLines`, `stopLineCases`), then the board's draw is waited for (`messageOf`), then it is sent and its message kept; where the region has no board (or the send fails) nothing is sent and the claim is let go, so a later report there tries again. Later reports of the same task or leader that day post nothing, and the line is never edited; a task whose only report is taken back keeps its line (Matt's answer). No line for a decoy, a grunt or a narrowing (the same task's key). It hears research news (`reported`) and hideouts (`StopReportListener.hideoutReported`, told by `reportRocket` for every hideout reported, the same one again too, not for one put back). At each local midnight (`nextLocalMidnight`, Luxon) the lines of the days before are deleted, and at `start` those a restart left; a line whose delete fails keeps its row for the next sweep, unless Discord refused it for good (50001, 50013: said once and forgotten, review R1) (review P1: midnight, start, and the catch-up on reconnect, whose job `stop lines` runs `sweep`). Two losses are accepted: a process that stops between the claim and the send leaves a claimed row without a message, so that task or leader gets no line that day; a line sent whose message id could not be stored is not deleted at midnight. None in rehearsal mode (nor where the region has no board); at shutdown it is closed before the posts of the stops, in their step (`stopReportSteps`).
 - `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task (`grouped`, `stop-posts.ts`), an event's tasks first (plan 8R-8: `isEventCategory` of the report's category; a typed task never is one), then the rest, each part most stops first and then by the first report, so a busy day cuts an event's task last (plan 8R-5, R9: one block per task, counted as tasks; a task of one version with its rewards beside it, of several a line of each version's rewards before its stops (`reward not said` for a typed task's version without its reward, review R1), the rewards' versions first and "one of" last, a picture per reward line (plan 8R-6, "Pictures at the stops"); the versions as the decision sees them (`grouped` by `StopReportService.versionOf`, review R2: a report of before plan 8R-5 of a task of one reward under that reward's version, R10; "one of" before and now one group), each in the words of its newest report; the task's key and every version placed, so a DM of any version links the block), each with its rewards and up to 15 stops (`- **[Stop](<maps>)** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"; since plan 8R-7, E1, every stop's name is the link to its place on Google Maps, `stopMapLine`, `src/render/research.ts`: `stopMapsUrl` of `raid-post.ts`, the address `gymMapsUrl` makes with the coordinates rounded to five decimals, in angle brackets so that it unfurls no preview, the name cut to 80 before it is made plain, always without a working address (`plainNoLinks`: a stop named `https://…` would show one address and link another), and its brackets escaped by `linkTextOf`; a task's, a version's, a hideout's and the day's research under a window alike, the plain text too; `fill` counts each line whole with its link, so a link is never cut and a busy day shows fewer stops a block by the same rules, `STOPS_SHOWN` and `MAX_POST_MESSAGES` unchanged; Matt's choice, R6: the party posts' Where keeps its name plain bold with a `[Map]` word, and so does a grunt's message); within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it); under an intra-day window (or a big event's daily hours) the day's research waiting stays below the window's tasks (plan 8R-6, Matt: `StopPostView.waiting.tasks`, under `### Back at <t:…:t>, after <event>`, in the same blocks without pictures, after the hideouts, so that a busy event day counts it away before any hideout (Matt, 2026-10-24); the line "The day's research comes back at" is gone; it counts in the layout and the busy day as any block, and the placement keeps the window's message for a key both have). Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research (before the day's research waiting under a window) under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (its picture by the rule beside it, plan 8R-6: a leader's or Giovanni's portrait) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
-- `PartyGateway.pinMessage` / `unpinMessage` (`PinOutcome`: `pinned`, `full`, `not-allowed`, `gone`); Pin Messages is optional in `REGION_CHANNEL_NEEDS`, so `cutover-check` warns where it lacks.
 
 ## Wants and DMs
 
 - `/want`'s dialog, `TargetWant` and the matching are in `notifications-and-dms.md` ("Wants and gym targets", "The notifier"). "Grunt (no type)" is typed as `no type`, `no type grunt` or `grunt (no type)`; `none` typed in full is zero IVs, the legacy word (fix F4), and the list of choices offers both for it.
-- A report that is news (`StopReportService`'s `reported`) goes to `NotifyService.researchReported`: who wants a reward of its task (`researchTargets` / `researchWantsFiring`, `src/domain/notify/reasons.ts`: a Pokémon's Research box, the species fitting any form, an item whatever the quantity, a species' Mega Energy) is told at the normal priority (plan 8R-5: a "one of" by any of its encounters, its DM naming the member's reward first; see `notifications-and-dms.md`, "Research by version"), one DM per report and region channel naming that region's stops with their addresses (`researchDmSentence`, `researchDmBrief`: "Field research has been reported in #region by **Name**: **task**.", the rewards, the stops, each name the link to its place since plan 8R-7 (`stopMapLine`, as in the post; ten at most, whole lines while they fit 2,400 characters with the line "- …and N more stops" that counts the rest, review W2; the confirmation's sentence, `researchConfirmSentence`, makes each stop's name in bold the link to its place, without the address, since plan 8R-8 (`stopMapLink`, to which `stopMapLine` adds the address; Matt, 2026-10-25), ten at most and while they fit the same 2,400 characters with the words that count the rest), until when as `periodEndWords` says it; all through `plainNoLinks`, the link's text too), only members who can view the channel, never the reporter, only under `features.notifications`, expiring with the report, with "Go to post" to the message of the pinned post holding the task (`researchPosts`; none in rehearsal mode). A member told of a task at a stop in a period is not told again (`researchTold`, in memory: a restart can repeat one), so a later "Same task at more stops…" names only the new stops. The usual Stop buttons (`target` reasons, `stopArgs` `rp`/`ri`/`re`).
-- A Rocket report that is news goes to `NotifyService.rocketReported` (plan 8R-2, design 7): one DM per region channel holding the stop; a want of its grunt type, its leader or any leader, Giovanni or the decoy (`rocketTargets` / `rocketWantsFiring`, `TargetWant` tokens as `rocketKey` plus `leader:any`; a lineup's report by its type, `typeKeyOf`, plan 8R-4L: wants stay by type, `grunt:water` fires on both lineups and on "not sure which", and a lineup's key is never a want, `isRocketWho`) and a Shadow want of a Pokémon it can give (`rocketShadowFiring`, the `PokemonNotification` shadow row of the species or the very form: the Shadow box means shadow raids and Rocket catches; judged by the report's own catches, so a Shadow Magikarp fires on the lineup that gives it and on "not sure which", not on the other lineup: a Shadow want is how a lineup's catch is wanted). A grunt goes at the spawn priority, at most one DM an hour per member and grunt type (`rocketHeard`, in memory, `MAX_WANT_QUIET_MS`, keyed by the type's key; a grunt's announcement runs in its type's line, `rocket:<server>:<type key>`, so reports of one type made at once keep the hour, fix B1; the small print says so, `gruntHourNote`: "You won't be told about this grunt type again for an hour."; without `TargetWant` the Shadow wants still fire, fix B8), with "Go to report" to its message in that channel. A grunt's reporter, and on a refine in place the reporter of the grunt it changed (`RocketNews.alsoActors`, review R3), are never told of it and have heard of its type for the hour. A refine changes no DM sent already (as with a grunt taken back early, B2): a DM of "not sure which" or of the other lineup can point at a lineup without the catch it named (review R7). A hideout goes at the normal priority, never twice to a member for the same hideout at the same stop in a day (`rocketTold`, in memory), with "Go to post" to the message of the pinned post holding it (`researchPosts.messageOf(channel, rocketKey)`); no link in rehearsal mode. `rocketDmSentence` ("A **Water-type grunt** has been reported in #west by **Rita**.", "an" by the name's first letter, a leader by name), `rocketDmBrief` (what can be caught, the stop with its address line, its name the link to its place since plan 8R-7, `stopMapLine`, when it goes or until when it stands; a grunt's message in the channel keeps its Where with `[Map]`, `rocketStopLine`). Since plan 8R-4 the Rocket wants are made in one dialog (`/want rocket`, `notifications-and-dms.md`), and a Rocket reason's button is Change… of that dialog.
+- A report that is news (`StopReportService`'s `reported`) goes to `NotifyService.researchReported`: who wants a reward of its task (`researchTargets` / `researchWantsFiring`, `src/domain/notify/reasons.ts`: a Pokémon's Research box, the species fitting any form, an item whatever the quantity, a species' Mega Energy) is told at the normal priority (plan 8R-5: a "one of" by any of its encounters, its DM naming the member's reward first; see `notifications-and-dms.md`, "Research by version"), one DM per report and region channel naming that region's stops with their addresses (`researchDmSentence`, `researchDmBrief`: "Field research has been reported in #region by **Name**: **task**.", the rewards, the stops, each name the link to its place since plan 8R-7 (`stopMapLine`, as in the post; ten at most, whole lines while they fit 2,400 characters with the line "- …and N more stops" that counts the rest, review W2; the confirmation's sentence, `researchConfirmSentence`, makes each stop's name in bold the link to its place, without the address, since plan 8R-8 (`stopMapLink`, to which `stopMapLine` adds the address; Matt, 2026-10-25), ten at most and while they fit the same 2,400 characters with the words that count the rest), until when as `periodEndWords` says it; all through `plainNoLinks`, the link's text too), only members who can view the channel, never the reporter, only under `features.notifications`, expiring with the report, with "Go to post" to the message of "Today’s Stops" in the board holding the task (`researchPosts`, a `PostLink`; none in rehearsal mode). A member told of a task at a stop in a period is not told again (`researchTold`, in memory: a restart can repeat one), so a later "Same task at more stops…" names only the new stops. The usual Stop buttons (`target` reasons, `stopArgs` `rp`/`ri`/`re`).
+- A Rocket report that is news goes to `NotifyService.rocketReported` (plan 8R-2, design 7): one DM per region channel holding the stop; a want of its grunt type, its leader or any leader, Giovanni or the decoy (`rocketTargets` / `rocketWantsFiring`, `TargetWant` tokens as `rocketKey` plus `leader:any`; a lineup's report by its type, `typeKeyOf`, plan 8R-4L: wants stay by type, `grunt:water` fires on both lineups and on "not sure which", and a lineup's key is never a want, `isRocketWho`) and a Shadow want of a Pokémon it can give (`rocketShadowFiring`, the `PokemonNotification` shadow row of the species or the very form: the Shadow box means shadow raids and Rocket catches; judged by the report's own catches, so a Shadow Magikarp fires on the lineup that gives it and on "not sure which", not on the other lineup: a Shadow want is how a lineup's catch is wanted). A grunt goes at the spawn priority, at most one DM an hour per member and grunt type (`rocketHeard`, in memory, `MAX_WANT_QUIET_MS`, keyed by the type's key; a grunt's announcement runs in its type's line, `rocket:<server>:<type key>`, so reports of one type made at once keep the hour, fix B1; the small print says so, `gruntHourNote`: "You won't be told about this grunt type again for an hour."; without `TargetWant` the Shadow wants still fire, fix B8), with "Go to report" to its message in that channel. A grunt's reporter, and on a refine in place the reporter of the grunt it changed (`RocketNews.alsoActors`, review R3), are never told of it and have heard of its type for the hour. A refine changes no DM sent already (as with a grunt taken back early, B2): a DM of "not sure which" or of the other lineup can point at a lineup without the catch it named (review R7). A hideout goes at the normal priority, never twice to a member for the same hideout at the same stop in a day (`rocketTold`, in memory), with "Go to post" to the message of "Today’s Stops" in the board holding it (`researchPosts.messageOf(channel, rocketKey)`, a `PostLink`); no link in rehearsal mode. `rocketDmSentence` ("A **Water-type grunt** has been reported in #west by **Rita**.", "an" by the name's first letter, a leader by name), `rocketDmBrief` (what can be caught, the stop with its address line, its name the link to its place since plan 8R-7, `stopMapLine`, when it goes or until when it stands; a grunt's message in the channel keeps its Where with `[Map]`, `rocketStopLine`). Since plan 8R-4 the Rocket wants are made in one dialog (`/want rocket`, `notifications-and-dms.md`), and a Rocket reason's button is Change… of that dialog.
 
 ## Pictures at the stops (plan 8R-6)
 
@@ -80,7 +82,7 @@ Design `docs/superpowers/specs/2026-10-23-stop-pictures-design.md` and its mocku
 ## The 8R staging's small fixes (plan 8R-6)
 
 - A DM's reason for an item or Mega Energy is `Rare Candy · Research`, `Charizard Mega Energy · Research` (`targetReasonLabel`, `src/domain/pogo/want-boxes.ts`), the shape of `Gible · Research`; lists and answers keep `targetWantLabel`.
-- No answer says "pinned": `In the post "Today’s Stops" of #…` (`researchWords`, `rocketWords`); the bot cannot know whether the post will be pinned when it answers. The post is "Today’s Stops" (Matt, 2026-10-23) in its heading (`## Today’s Stops`, `-# Today’s Stops, continued (n)`), every answer, the summary's link, the help and the permission check's words; nothing finds a post by its title.
+- No answer says "pinned": since plan 8R-9 `In "Today’s Stops" on the board of #…` (`boardWords`, shared by `researchWords` and `rocketWords`; "boards" for several regions), the board named by its region's channel; the help of `/research report` and `/rocket report` says the same and names the line in the region's channel. The post is "Today’s Stops" (Matt, 2026-10-23) in its heading (`## Today’s Stops`, `-# Today’s Stops, continued (n)`), every answer, the summary's link, the help and the permission check's words; nothing finds a post by its title.
 - A grunt refined in place is answered `Changed in #…` (above).
 - `/want`'s list puts the choices of Team GO Rocket, items and Mega Energy that hold every typed word as a whole word before the first Pokémon that is only a near match (`wholeWordsBeforeGuesses`, `src/commands/choices.ts`): `rocket` gives Team GO Rocket before Rowlet; the order of the Pokémon, tiers and IVs among themselves is unchanged.
 - The task search finds a "one of" choice by the words `one of` too (`taskChoices`).
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index cd3c3f4c..362ff25d 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -31,7 +31,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 ## Parties
 
 - Party tests build raids with `testRaid()` / `withAttendees()` and a store with `partyStoreWith()` (`test/support/parties.ts`); max battles (plan 8X-3) with `testMax()` (a Dynamax Machamp at `TEST_SPOT` until 21:00), `TEST_PIN`, `asMax()`, and through the service with `reportedMax()` (`test/support/party-service.ts`; `made.maxes` is the `MaxChangeService`, `ctx.maxBattles`); `raidEventsFixture(zone, { max, big })` gives max and big events, none by default, and `NO_MAX_BOSSES` (`test/support/test-context.ts`) a provider of no max boss; its in-memory storage rejects a party that would not survive the real state document. Raid events in tests come from `test/support/raid-events.ts`.
-- Service tests use `partyServiceWith()` (`test/support/party-service.ts`: a service over the fake gateway, the invented regions and a clock, with `attendance`, `raids`, `scheduler` and `lines` over the same store); command tests pass `{ partyService, attendance, raids, parties, regions }` from it to `createTestContext`, whose own `partyService`, `attendance` and `raids` throw when used. `restarted(made)` gives new services over the same storage, gateway and clock, as after a restart; the fake gateway keeps `archived`, `locked` and `reopened` per post, and refuses `deleteMessage` in an archived post as Discord does (`archivedThread()`, 50083; plan 8X-H). A server with the two channels for copies is `gatewayWithMirrorChannels()` (pass it as `kept.gateway`; `REMOTE_CHANNEL`, `EX_CHANNEL`); without it, as in most tests, a raid has no copies. A test that needs renders to run by themselves passes `{ renderDelayMs: 0, sharedDelayMs: 0 }`. The fake interactions take `guildRoleNames`. On the fake gateway everybody sees every forum unless `gateway.shutOut(forumId, ...members)` says otherwise, or the forum has overwrites (`forumOverwrites`: given by a test, taken over from `categoryOverwrites` when a forum is made in that category, or set by `hideForum` / `createForum` with `hidden` through `hiddenForumOverwrites`): then `canSee` computes them as Discord does, with `serverRoles` and `memberRoles`; `noHiding` refuses the hiding of a forum (or of one made beside that region channel; `hideForum` then says whether the forum's overwrites hide it already, `isHiddenForum`) (`canSee`, `admitted`, `barred`, `leftServer`); `botPermissions` is what the bot has in the server (everything, an administrator, unless a test gives fewer), and with the bot's own overwrite of a category (`categoryOverwrites`, `FakePartyGateway.BOT_ID`) the fake computes what it has where a forum is made or hidden, as Discord does: a creation without Manage Channels there is refused, and one in a category of 50 channels or a server of 500 as Discord refuses it (Invalid Form Body naming `parent_id`, `CHANNEL_PARENT_MAX_CHANNELS`; `serverFull()`, 30013), as `createTextChannel` answers `category-full` and `server-full` (plan 8S-4); `createCategory` with `like` (a category that continues another) copies that one's `categoryOverwrites` to the new category and records where it was placed (`placedAfter`, by id), answers `base-gone` when that one is not there (or in `gone`), and `refuseCopies` has it refused as `no-permission`, as Discord refuses a bot that may not set those overwrites, a new hidden forum's overwrites are set with the bot's permissions in the server and its second hide (`hideForum`) with those in the category, and a hiding is refused as Discord refuses a bot that is no administrator (no Manage Roles there, a permission it lacks there, Manage Roles in any overwrite); `unsettable` has Discord refuse such permissions in a set all the same (the second hide of a new forum refused); a post and a message keep the names of their files (`attachments`: those sent, replaced by an edit whose message names its files, none too, kept by one that does not, and a thumbnail `attachment://` must name one of them), and `refuseFiles` refuses any send or edit that uploads a file with Missing Permissions (50013), as Discord answers a bot without Attach Files, counting each refusal in `filesRefused` (plan 8D-F), `rejectThumbnails` and `rejectCustomEmoji` refuse a thumbnail or a button's custom emoji with Invalid Form Body naming the field as Discord does (`….accessory.media.url`; `….emoji.id[COMPONENT_INVALID_EMOJI]`, which `refusedPart` reads), and `deletedEmojiIds` refuses only the custom emoji of those ids, as for an emoji deleted from the application (plan 8D-H); `partyServiceWith` also gives `access` (the access service over the same store) and `grants` (`MemoryAccessGrants`). `reportedRaid(report?, overrides?, kept?)` gives all of that with a raid reported through the service (`party`, `postId`, `current()`, `said()`); `userSettings` holds what differs from the default member settings. Lines go out only on `attendance.flush()`, post edits only on `service.flush()`. A party with a lobby size before max battles exist (plan 8X-1): the override `{ lobbySize: () => 4 }` of `partyServiceWith`, `reportedRaid` or `createdTrain` gives every party of the test that size, for the party service (posts, `applyAutoStatus`) and the attendance service (Join's `chooseGroup`) alike; without it the settings' `lobbySize`, none for any party of today.
+- Service tests use `partyServiceWith()` (`test/support/party-service.ts`: a service over the fake gateway, the invented regions and a clock, with `attendance`, `raids`, `scheduler` and `lines` over the same store); command tests pass `{ partyService, attendance, raids, parties, regions }` from it to `createTestContext`, whose own `partyService`, `attendance` and `raids` throw when used. `restarted(made)` gives new services over the same storage, gateway and clock, as after a restart; the fake gateway keeps `archived`, `locked` and `reopened` per post, and refuses `deleteMessage` in an archived post as Discord does (`archivedThread()`, 50083; plan 8X-H) unless the delete asks to open it (`{ reopen: true }`, plan 8R-9, review P4: only the posts of the stops ask), and a message in an archived, locked post the same way (review R3; a test that has a late message open an ended party's post passes `{ reopen: true }`); `lockPost` locks a post (opening it first, refused as a pin is where `refusePosts` names Manage Posts), `postInfo` says `locked` too, a message sent with `{ silent: true }` is `FakeMessage.silent`, and `postAccess(postId)` (a promise, review P3) says what the bot may write in a post (`refused` where its forum or the post is in `noManaging` or `refusePosts` names Send Messages in Posts or Manage Posts there, `plain` where the post or its forum is in `noEmbeds`). A server with the two channels for copies is `gatewayWithMirrorChannels()` (pass it as `kept.gateway`; `REMOTE_CHANNEL`, `EX_CHANNEL`); without it, as in most tests, a raid has no copies. A test that needs renders to run by themselves passes `{ renderDelayMs: 0, sharedDelayMs: 0 }`. The fake interactions take `guildRoleNames`. On the fake gateway everybody sees every forum unless `gateway.shutOut(forumId, ...members)` says otherwise, or the forum has overwrites (`forumOverwrites`: given by a test, taken over from `categoryOverwrites` when a forum is made in that category, or set by `hideForum` / `createForum` with `hidden` through `hiddenForumOverwrites`): then `canSee` computes them as Discord does, with `serverRoles` and `memberRoles`; `noHiding` refuses the hiding of a forum (or of one made beside that region channel; `hideForum` then says whether the forum's overwrites hide it already, `isHiddenForum`) (`canSee`, `admitted`, `barred`, `leftServer`); `botPermissions` is what the bot has in the server (everything, an administrator, unless a test gives fewer), and with the bot's own overwrite of a category (`categoryOverwrites`, `FakePartyGateway.BOT_ID`) the fake computes what it has where a forum is made or hidden, as Discord does: a creation without Manage Channels there is refused, and one in a category of 50 channels or a server of 500 as Discord refuses it (Invalid Form Body naming `parent_id`, `CHANNEL_PARENT_MAX_CHANNELS`; `serverFull()`, 30013), as `createTextChannel` answers `category-full` and `server-full` (plan 8S-4); `createCategory` with `like` (a category that continues another) copies that one's `categoryOverwrites` to the new category and records where it was placed (`placedAfter`, by id), answers `base-gone` when that one is not there (or in `gone`), and `refuseCopies` has it refused as `no-permission`, as Discord refuses a bot that may not set those overwrites, a new hidden forum's overwrites are set with the bot's permissions in the server and its second hide (`hideForum`) with those in the category, and a hiding is refused as Discord refuses a bot that is no administrator (no Manage Roles there, a permission it lacks there, Manage Roles in any overwrite); `unsettable` has Discord refuse such permissions in a set all the same (the second hide of a new forum refused); a post and a message keep the names of their files (`attachments`: those sent, replaced by an edit whose message names its files, none too, kept by one that does not, and a thumbnail `attachment://` must name one of them), and `refuseFiles` refuses any send or edit that uploads a file with Missing Permissions (50013), as Discord answers a bot without Attach Files, counting each refusal in `filesRefused` (plan 8D-F), `rejectThumbnails` and `rejectCustomEmoji` refuse a thumbnail or a button's custom emoji with Invalid Form Body naming the field as Discord does (`….accessory.media.url`; `….emoji.id[COMPONENT_INVALID_EMOJI]`, which `refusedPart` reads), and `deletedEmojiIds` refuses only the custom emoji of those ids, as for an emoji deleted from the application (plan 8D-H); `partyServiceWith` also gives `access` (the access service over the same store) and `grants` (`MemoryAccessGrants`). `reportedRaid(report?, overrides?, kept?)` gives all of that with a raid reported through the service (`party`, `postId`, `current()`, `said()`); `userSettings` holds what differs from the default member settings. Lines go out only on `attendance.flush()`, post edits only on `service.flush()`. A party with a lobby size before max battles exist (plan 8X-1): the override `{ lobbySize: () => 4 }` of `partyServiceWith`, `reportedRaid` or `createdTrain` gives every party of the test that size, for the party service (posts, `applyAutoStatus`) and the attendance service (Join's `chooseGroup`) alike; without it the settings' `lobbySize`, none for any party of today.
 - Meetups in tests: `testMeetup()` (which takes `place`), `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`; a meetup with a place passes `place`, and a directory of kept Wayspots as the override `wayspots`, `wayspotsWith`). A meetup's post shows its place as it is now from `MeetupPostView.gym` and `.wayspot`; a test of the renderer passes them to see a place as it is now, and leaves them out for the snapshot. The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary`, the menus of a message with `selectsOf` (`test/support/messages.ts`).
 
 ## Screenshots
@@ -67,7 +67,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - The task list: `readResearchPage()` (Leek Duck's page of 2026-10-21, `test/fixtures/leekduck-research.html`, unchanged: 58 tasks, 299 rewards), `researchTasksOfPage()` (parsed once, frozen), `pageTask(text)` and `researchTasksFixture(tasks?, readAt?, staleAfterHours?)` (`test/support/research.ts`, a `ResearchTaskProvider` with the versions of its tasks, plan 8R-5, `versions(task)` and `byVersion`, `readAt` `null` for a list never read, out of date `staleAfterHours` (6) after `readAt`, `ctx.researchTasks` of `createTestContext()`). Events with spawns (plan 8R-4): `readSpawnEventFeed()` (ScrapedDuck's whole `events.json` of 2026-10-22, `test/fixtures/scrapedduck-events-2026-10-22.json`) and `readEventPage(file)` (Leek Duck's Halloween 2026 Part I and Teddiursa Spotlight Hour pages, cut to the sections read), `test/support/spawn-events.ts`; `createTestContext()` gives `ctx.eventSpawns` with no spawns, and `partyServiceWith([], { spawnCostumes })` a `SpawnService` that asks `spawnCostumes.sightingsAt`. Research events: `raidEventsFixture(zone, { research })`; the events feed fixture `test/fixtures/max-events.json` holds the two research events of November 2026.
 - `createTestContext()` gives `ctx.stopReports` (a `StopReportService` over `MemoryStopReports` and the context's events, rewards hashed with the fixture's catalogue; a test that makes its own passes `rewardHash: fixtureRewardHash`, `test/support/stop-reports.ts`, the option being required), `ctx.stopPostLinks` (no post holds anything: a test of "Already reported" passes its own `linkOf`, plan 8R-5), `ctx.pineStops` (none, over memory and the context's Wayspots), `ctx.targetWants` and `ctx.wantBoxes` (`MemoryWantBoxes` over the context's wants and target wants); `partyServiceWith()` gives `targetWants` to the notifier (`made.targetWants`), and `notifying.researchPosts` a test's own links (`notify-service.research.test.ts`).
 - Everyone's events (plan 8R-7): `readEveryoneFeed()` (`test/support/event-reach.ts`; nine items of ScrapedDuck's feed of 2026-10-24, `test/fixtures/scrapedduck-events-2026-10-24.json`, cut to the fields the readers read, values unchanged: the Boston City Safari, Night Out Los Angeles, Wild Area Mexico City and Global, Into the Wild, Pawniard Community Day, GO Tour Alola's Kaohsiung, Los Angeles and Global) runs through every reader of the events feed in `event-reach.test.ts` (research, big events and spawns read their items; the max events and the raid events find none of theirs, asserted so). `MAX_FINALE` (the same file) is GO Fest 2025's Max Finale as the feed listed it: local times, research and spawns, no "global" in its id or name, read by every reader since Matt's rule of 2026-10-24.
-- `FakePartyGateway` pins (`pinMessage` / `unpinMessage`): `noPinning` (channels where it is `not-allowed`), `pinLimit`, `pinNotices` (the notices it deleted), `pinnedIn(channelId)`.
+- `FakePartyGateway` pins: `pin(channelId, messageId)` (a test's own setup since plan 8R-9: what the bot before it pinned in a region's channel; no code pins a message), `unpinMessage` (refused in a channel of `noPinning`), `pinnedIn(channelId)`. The posts of the stops are tested in a board: `stop-posts.test.ts`'s `postsWith` makes West's and East's summary posts in their forums (`made.west`, `made.east`, `made.board(forum)` for another) and gives the regions their `summaryMessageId`. The lines of the region channels (plan 8R-9): `stopLineCases` (`test/support/stop-line-cases.ts`, `newStopLine`) run on `StopLineRepository` and its twin `MemoryStopLines` (`test/support/stop-lines.ts`, `failing` per method); `stop-lines.test.ts` gives the service posts of its own (`messageOf` by the board of each region).
 - Team GO Rocket (plan 8R-2): `readRocketFeed()` (ScrapedDuck's `rocketLineups.min.json` of 2026-10-22, `test/fixtures/rocket-lineups.json`, unchanged: 26 lineups, 24 choices), `rocketChoicesOfFeed()` (parsed once, frozen), `feedChoice(key)` and `rocketLineupsFixture(choices?, readAt?, staleAfterHours?)` (`test/support/rocket.ts`, a `RocketLineupProvider`, `readAt` and `staleAfterHours` (24) as the task list's, `ctx.rocketLineups` of `createTestContext()`; `[]` is a list never read). `rocketReport(overrides)` and `MUDKIP` (`stop-report-cases.ts`, a Water-type grunt at stop 1 for half an hour) beside `researchReport`; `rocketLineupCases` (`listedChoice`) and `gruntMessageCases` (`gruntRow`) in `test/support/rocket-store-cases.ts`, twins `MemoryRocketLineups`, `MemoryGruntMessages` (`failing` per method). Two lineups of a grunt type (plan 8R-4L): the fixture's water and untyped grunts have them (`feedChoice('grunt:water').lineups`: Mudkip's, then Magikarp's; `lineupChoice` and `lineupValue` make a choice and its picked value of one); `magikarpLineup(overrides)` and `MAGIKARP` (`stop-report-cases.ts`: the Magikarp lineup by Misty a minute after `REPORT_NOW`), `waterWithLineups()` (`rocket-store-cases.ts`, a short choice with both lineups and their fingerprints); a row of before (a bare list) and unreadable lineups are tested only against the repository, by a raw write (`rocket-repositories.db.test.ts`). A grunt's messages refined in place are edited on the fake gateway (`FakeMessage.edits`); `grunt-messages.test.ts` fails an edit per channel (`failEdit`) and holds a send or an edit (`hold(kind, channel)`, `rocket-reports.test.ts` `holdSend(channel)`: a `HeldCall` of `test/support/held-call.ts`, named by `heldCall(what)`, whose `reached` the test awaits to act while the call is on its way, then `release()`; review R1; `reached` gives up after `TALLY_LIMIT_MS`, naming the call, as `Tally.reached` does, fix round 2, F8), and records each edit's kind as it is asked for (`tried`: that nothing more was asked while an edit is held, after `settle()`, and the kinds a refine tries). The notifier of a restarted process, which remembers nothing it told, is `new NotifyService(made.notifyOptions)` over the same stores and `dms` (`partyServiceWith`; `notify-service.rocket.test.ts`'s `restart()`). A Take back whose id is gone is tested by moving the report's row of `MemoryStopReports` to another id, as a report put back would be (`rocket.test.ts`). `createTestContext()` gives `ctx.rocket` (a `RocketService` over the context's reports that posts no message, as in rehearsal mode); a test of grunts' messages passes its own over a `GruntMessageService` on a `FakePartyGateway` (`rocket.test.ts`, `rocket-reports.test.ts`), with `setTimer` to keep or fire the deletes by hand.
 
 ## The Wayspot export tool (plan 8W-P)
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index 6fd1d02a..e466a13d 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -228,6 +228,7 @@ It reads the database and, with the bot's token, Discord's API (reading only; it
 - **moderation**: meetup safety's channel: a warning while `channels.moderation` is not set (the safety is off), when the server has no such text channel, when the bot may not see it, send or embed links there, when everyone can see it (make it staff-only), or when a staff role (a role named `admin` or `moderator`) cannot see it (let every staff role see it).
 - **restrictions**: rows of the legacy `!require-role` restrictions. The new bot does not use them; `./pine role-auth-export` lists them as the new commands, and an admin sets the same under Server Settings → Integrations → Professor Pine.
 - **roles**: self-assigned roles at or above the bot's highest role, which the bot cannot give. Move the bot's role above them.
+- **boards**: the regions that have a forum but no board recorded in the database; `/admin setup-forums` makes it.
 - **cleanup**: how many legacy channels `/admin cleanup-legacy` would delete, how many trains, meetups and saved parties stay, and which channels it would leave to a person.
 
 Fix every `FAIL` and run it again. Warnings are for you to judge.
@@ -273,7 +274,7 @@ They can take a little while to show up in Discord.
 ### 4.9 The admin's part, in Discord
 
 1. **The bot's role**: whatever `cutover-check` said it still lacks.
-2. **`/admin setup-forums`**: every region gets a forum next to its channel (named after the channel with `-meetups`, the `regionForumSuffix` setting), with its tags and a pinned list of what is going on ("Going on now": its raids, max battles, trains and meetups). It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again. A region that fails says why (most often the category's permissions).
+2. **`/admin setup-forums`**: every region gets a forum next to its channel, its board (named after the channel with `-board`, the `regionForumSuffix` setting), with its tags and a pinned and locked post "Today and coming up" (its raids, max battles, trains and meetups of today, then what is coming up on later days, and "Today’s Stops" below it). An installation that ran the bot before the board (forums ending in `-meetups`, a pinned "Going on now", "Today’s Stops" pinned in the region channels) runs it once after the update: it renames the forums and the post, locks the post, and the bot moves "Today’s Stops" into it at its next start. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again. A region that fails says why (most often the category's permissions).
 3. **The regions' borders** (when the web pages are set up, `docs/web-setup.md`): `/region edit` opens the region editor, whose list shows the overlaps and gaps between the regions as the legacy map drew them. **Fix all slivers…** settles the thin ones (it asks only where a gym or stop would change region), and **Save** writes the new outlines straight into the database: no KML export or `/region import` is needed. What is no sliver is listed to be drawn by hand. Members' parties stay where they are.
 4. **`/admin cleanup-legacy`**: deletes the channels of the legacy raids. It first only **lists** them: the raid channels the legacy files name, and leftover legacy party channels that no file names (found by their names and the legacy bot's own first message). Channels it is not sure of are listed apart as "Not deleted", for a person to judge. The channels of the trains and meetups that are still open, and of any party saved with `!save-party`, are **not deleted**: many are long-lived discussion channels. They are listed under their own "Not deleted" heading with the party's name, the day it was made and how many signed up; delete by hand the ones that are dead, and the rest stay as plain channels (their old status message stays, and nothing answers it any more). New trains and meetups start with `/train` and `/meetup`. Nothing is deleted until you press "Delete these n channels" (within ten minutes). One run deletes at most 400 channels; run the command again for the rest.
 
@@ -335,8 +336,8 @@ The first only says what it would do, line by line: which rows it would add, and
 
 - **Screenshots** are read when they are posted with a mention of the bot, or attached to `/raid`. The mention must be of the bot itself (picked from the list Discord shows after `@`), not of a role of the same name. A screenshot dropped in a channel without either is not read (that would need Message Content).
 - **Settings and notifications** keep what members set before: wants, gym targets, mentions, auto-status, privacy, friend codes. They are changed through `/settings`, `/want` and `/target`. `/want` asks in a dialog what a Pokémon is wanted for (Raids, Dynamax, Gigantamax, Spawns, Research, Shadow), ticked as the member's wants are.
-- **Field research** is new: `/research report` names a PokéStop's task (up to five stops at once), the region's pinned post "Today’s Stops" lists the day's tasks, and members who want a reward get a DM. Sponsored PokéStops, which Wayfarer does not list, are added by staff with `/pokestop add`.
-- **Team GO Rocket** is new too: `/rocket report` names who is at a PokéStop. A grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy grunt goes in the pinned post until midnight. `/want` takes a grunt type (at most one DM an hour for each type), a leader, any leader, Giovanni or the decoy, and the Shadow box of a Pokémon also covers what Team GO Rocket gives.
+- **Field research** is new: `/research report` names a PokéStop's task (up to five stops at once), "Today’s Stops" in the region's board lists the day's tasks, a task new today gets a short line in the region channel, and members who want a reward get a DM. Sponsored PokéStops, which Wayfarer does not list, are added by staff with `/pokestop add`.
+- **Team GO Rocket** is new too: `/rocket report` names who is at a PokéStop. A grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy grunt goes in "Today’s Stops" on the board until midnight (a leader or Giovanni new today with a line in the region channel). `/want` takes a grunt type (at most one DM an hour for each type), a leader, any leader, Giovanni or the decoy, and the Shadow box of a Pokémon also covers what Team GO Rocket gives.
 - **Unown**: members with the `unown` role get a want for Unown the first time they use the bot, instead of the role being pinged.
 - **The party history**: the bot keeps a history of ended raids, max battles, trains and meetups for statistics. It keeps a member's Discord id only if they opt in with `/settings history enabled:True`; without it they are counted, anonymously.
 - **A map on the web**, if you set up the web pages ([web setup](../web-setup.md)): `/maps` gives members the address and a login button.
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index e4c2709e..602f93e6 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -28,12 +28,11 @@ In the [Discord Developer Portal](https://discord.com/developers/applications):
    - View Channels, Send Messages, Send Messages in Threads, Embed Links, Attach Files, Read Message History
    - Manage Channels (the forums, and the channels `/region import` creates)
    - Manage Roles (self-assigned roles, and who may see a forum)
-   - Manage Threads (archiving, locking, renaming and pinning posts, and the tags of a post; in a forum's own permissions Discord calls it **Manage Posts**, and without it there the bot makes no post at all and tells the member so)
+   - Manage Threads (archiving, locking, renaming and pinning posts, the tags of a post, and writing in the region's locked board; in a forum's own permissions Discord calls it **Manage Posts**, and without it there the bot makes no post at all and tells the member so)
    - Add Reactions and Use External Emojis (optional)
    - Manage Messages (optional: taking a screenshot away once it became a raid, and deleting a message the moderators delete from a report)
-   - Pin Messages (optional: pinning the post "Today’s Stops" of a region channel; without it the post stands unpinned)
 
-   As a number for the link's `permissions=`, that is `2252092140285008`. `./pine cutover-check` (section 4) checks the bot's role against these.
+   As a number for the link's `permissions=`, that is `292326599760`. `./pine cutover-check` (section 4) checks the bot's role against these.
 
 The bot's role must sit above the roles members may give themselves with `/iam`.
 
@@ -172,7 +171,7 @@ Draw the outlines in a map editor such as [Google My Maps](https://www.google.co
 
 ## 7. Forums
 
-Once regions and gyms are in, a staff member runs `/admin setup-forums` in your server: every region gets a forum beside its channel (named after the channel with `-meetups`, the `regionForumSuffix` setting), its tags, and a pinned list of what is going on ("Going on now": its raids, max battles, trains and meetups). It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again; a region that fails says why (most often the category's permissions for the bot).
+Once regions and gyms are in, a staff member runs `/admin setup-forums` in your server: every region gets a forum beside its channel, its board (named after the channel with `-board`, the `regionForumSuffix` setting), its tags, and a pinned and locked post "Today and coming up" (its raids, max battles, trains and meetups of today, then what is coming up on later days), under which the bot posts "Today’s Stops" (the day's field research and Team GO Rocket hideouts). Only the bot and moderators write in that post. The region's channel gets a short line the first time a task, a leader or Giovanni is reported there in a day, deleted at midnight. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again; a region that fails says why (most often the category's permissions for the bot).
 
 Then try it: `/raid` in a region channel, the buttons in the post, `/max` (a max battle at a Power Spot: the Power Spots come with the Wayfarer import), `/train` (also `kind:Gigantamax Train`, with Power Spots as its stops), `/meetup`, `/research report` (the task of a PokéStop: the region's pinned post "Today’s Stops" shows it), `/rocket report` (a grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy goes in the pinned post), `/want` and a report of that boss by somebody else. `/help` lists everything.
 
diff --git a/docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md b/docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md
index 67f41454..4d27659f 100644
--- a/docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md
+++ b/docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md
@@ -34,7 +34,7 @@ A bot cannot give command access to single members. During the rehearsal the com
 - [ ] Also on the test server, before R5, a hidden forum made by a bot that is no administrator (production's role may not be one):
   1. In the scratch settings, rehearse one region of the test server that has no forum (`settings.rehearsal.regions`, its channel's name as written). If every region has one, note one region's forum id and clear its forum in the dev database as in step 5 (the old forum stays in Discord, untouched).
   2. Server Settings → Roles → the dev bot's role: take Administrator off, and make sure the role itself gives Manage Channels, Manage Roles, Manage Threads, View Channel, Send Messages, Send Messages in Threads, Embed Links, Attach Files, Read Message History and Add Reactions (from the role, not through a category: a creation may give only what the bot has in the server).
-  3. Start the bot in rehearsal mode (scratch settings as above) and run `/admin setup-forums`: the region's line says "created", "hid it from all but staff and the testers" and "posted and pinned the list of active raids". A forum that is not made says why ("I could not make this forum hidden from members…").
+  3. Start the bot in rehearsal mode (scratch settings as above) and run `/admin setup-forums`: the region's line says "created", "hid it from all but staff and the testers" and "posted, pinned and locked the board". A forum that is not made says why ("I could not make this forum hidden from members…").
   4. Check the forum is hidden: a test account without a staff role and outside the allowlist does not see it; the forum's Permissions page shows View Channel denied to @everyone. If the category gives the bot something its role does not, the log may warn "a new hidden forum stays as it was made: Discord refused the bot … there, which only the category gives it": the forum is still hidden; note what it names (a finding for the night).
   5. Undo it: stop the bot; delete the new forum in Discord; clear the region's forum in the dev database (`docker exec -it pine-dev-mysql mysql -u <user> -p <schema> -e "UPDATE Region SET forumChannelId = NULL WHERE channelId = <region channel id>"`, or the noted forum id instead of `NULL` for a region that had one); give the dev bot's role Administrator again.
 
@@ -90,7 +90,7 @@ A bot cannot give command access to single members. During the rehearsal the com
 ### R6. The end of the window
 
 - [ ] `./pine deploy-commands --clear-guild`: the server's commands go (the night registers them globally; both at once would show each command twice). It names each server first and says each removal or failure.
-- [ ] The admin deletes the rehearsal's forum (`squirrelbreeze-meetups`) by hand: the night's database knows nothing of it.
+- [ ] The admin deletes the rehearsal's forum (`squirrelbreeze-board`; `-meetups` before plan 8R-9) by hand: the night's database knows nothing of it.
 - [ ] `./pine down` (after the removal, which starts the database for its list of servers), then `./pine status`: nothing of the rehearsal runs. (A stack left up would come back with Docker Desktop, `restart: unless-stopped`, and log in with the production token beside the legacy bot.)
 - [ ] After the last rehearsal: the rehearsal's volumes hold a copy of production's members: `docker volume ls --filter name=pine-rehearsal`, then `docker volume rm` each of them (`pine-rehearsal_mysql-data` and the others it lists), and delete `C:\Users\<you>\pine-backups\rehearsal\` and `var/rehearsal/`.
 - [ ] Start the legacy bot on the old host again, and let it restart itself again as before. The Integrations restriction stays until the night (the legacy bot has no slash commands).
@@ -150,7 +150,7 @@ A bot cannot give command access to single members. During the rehearsal the com
 
 - [ ] Server Settings → Integrations → Professor Pine: lift the rehearsal's restriction (R1): @everyone on again for the application, so that members see the commands. Matt's entries on `/admin`, `/gym` and `/region` may stay (they let him use the staff commands without Manage Server).
 - [ ] The bot's role: what the cutover check asked for, if anything is still missing.
-- [ ] `/admin setup-forums`: every region gets its forum, its tags and its pinned list. A region that fails says why (most often a category's overwrites: Manage Channels, Manage Threads).
+- [ ] `/admin setup-forums`: every region gets its forum (`<channel>-board`), its tags and its board, the locked pinned post "Today and coming up" with "Today’s Stops" below it. A region that fails says why (most often a category's overwrites: Manage Channels, Manage Threads).
 - [ ] `/region edit` → **Fix all slivers…** (take the midline unless a moderator knows better) → **Save**: the outlines are written to the database at once (no KML round trip); the list then holds only what must be drawn by hand. Staged on the test server with Pittsburgh's 28 outlines on 2026-10-18 (71 stretches fixed, no gap left, 2 s for the server's check).
 - [ ] `/admin cleanup-legacy`: read the list. "To delete" holds the raid channels of the legacy files and the orphans; "Not deleted" is for a person (delete by hand what should go). The legacy trains, meetups and saved parties are listed apart and stay (Matt, 2026-10-21): delete by hand the dead ones (the list gives each one's name, the day it was made and how many signed up); the rest stay as plain channels for discussion ("Wayfarer Discussion and Planning", the PokéStop submission threads, tourney signups), their old status post unanswered. Then "Delete these n channels" within ten minutes; the answer says what was deleted, what was gone and what failed. More than 400 channels go in runs of 400 ("Delete 400 of these n"): run `/admin cleanup-legacy` again for the rest.
 
diff --git a/src/app.ts b/src/app.ts
index ab95c09e..20989d4e 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -456,7 +456,7 @@ export async function startApp(
   );
   const gymTargets = new GymNotificationRepository(db, rowIds);
   const newTrains = new NewTrainRepository(db);
-  // The pinned posts of the stops, for the links of research DMs: set once they are made below.
+  // The posts of the stops, for the links of research DMs: set once they are made below.
   const researchPostLinks: { posts?: StopPostService | undefined } = {};
   // Made after the party service, whose briefs of parties it sends, and told by it from here on.
   const notify = new NotifyService({
@@ -477,7 +477,7 @@ export async function startApp(
     raidBosses,
     settings: config.settings,
     log,
-    // The pinned posts are made once Discord is there (below); a DM asks them only then.
+    // The posts of the stops are made once Discord is there (below); a DM asks them only then.
     researchPosts: {
       messageOf: (channelId, subjectKey) =>
         researchPostLinks.posts?.messageOf(channelId, subjectKey) ?? Promise.resolve(undefined),
@@ -857,7 +857,7 @@ export async function startApp(
     eventSpawns,
     rocketLineups,
     stopReports,
-    // The pinned posts made below (none in rehearsal mode), as last drawn.
+    // The posts of the stops made below (none in rehearsal mode), as last drawn.
     stopPostLinks: {
       linkOf: (channelId, subjectKey) => researchPostLinks.posts?.linkOf(channelId, subjectKey),
     },
@@ -1073,7 +1073,7 @@ export async function startApp(
     ),
   );
   log.info({ features }, 'optional features');
-  // The pinned posts "Today’s Stops" (plan 8R-1), once Discord is there: those of a day
+  // The posts "Today’s Stops" (plan 8R-1), once Discord is there: those of a day
   // that ended deleted, today's drawn anew. None in rehearsal mode (nothing is posted outside
   // party posts there; design 6).
   const stopPosts = rehearsal
@@ -1261,7 +1261,7 @@ export async function startApp(
       // Max battles on the map (plan 8X-5): what /max reads and calls.
       maxes: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
       // Reports at stops on the map (plan 8R-3): what /research and /rocket read and call, the
-      // pinned posts' messages as last drawn, and the grunts' messages (none in rehearsal mode,
+      // messages of the posts of the stops as last drawn, and the grunts' messages (none in rehearsal mode,
       // which leaves the web server off anyway).
       stops: {
         ctx,
@@ -1307,7 +1307,7 @@ export async function startApp(
       // The catch-up starts no job more (plan 8X-H); the clock's stop waits for the upkeep it may
       // have started, which starts no step more and whose closings end between parties. A job of
       // the catch-up's under way that reads a feed ends with that feed's stop below, one that
-      // draws the stops' pinned posts with theirs (review r0 B6). The steps add up to 145 s, 5 s
+      // draws the posts of the stops with theirs (review r0 B6). The steps add up to 145 s, 5 s
       // within the stop's 2m30s (review r1 C4: 6 s here and 12 s for the direct messages; plan
       // 8R-6: the reports at stops' ten, `stopReportSteps`, the pictures' second taken from the
       // grunts' messages).
@@ -1401,7 +1401,7 @@ export async function startApp(
       // The spawn reports that wait for their half hour are deleted now: they would stay for good.
       { name: 'spawn reports', timeoutMs: 5_000, run: () => spawns.flush() },
       // The pictures of the stops (no more fetched), the grunts' messages (they stand on), then
-      // what waits to be drawn in the pinned posts of the stops: in this order, ten seconds.
+      // what waits to be drawn in the posts of the stops: in this order, ten seconds.
       ...stopReportSteps({
         pictures: stopPictures,
         grunts: gruntMessages,
@@ -1409,7 +1409,7 @@ export async function startApp(
         posts: stopPosts,
       }),
       // The catch-up's job under way (plan 8X-H): a feed's read ended by the feeds' steps above,
-      // the stops' pinned posts drawn by the step before this one (review r1 C3).
+      // the posts of the stops drawn by the step before this one (review r1 C3).
       {
         name: 'catch-up',
         timeoutMs: 2_000,
diff --git a/src/commands/admin/setup-forums.test.ts b/src/commands/admin/setup-forums.test.ts
index b17bac9d..22a2ccd8 100644
--- a/src/commands/admin/setup-forums.test.ts
+++ b/src/commands/admin/setup-forums.test.ts
@@ -68,7 +68,7 @@ describe('/admin setup-forums', () => {
     expect(gateway.hidden.has(north)).toBe(true);
     expect(gateway.hidden.has(WEST_FORUM)).toBe(false);
     expect(sent(interaction.editReply).content?.split(NEWLINE)).toEqual([
-      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the list of what is going on, hid it from all but staff and the testers.`,
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted, pinned and locked the board, hid it from all but staff and the testers.`,
       'Rehearsal mode: only the regions north get a forum, which only staff and the testers see.',
     ]);
   });
@@ -116,9 +116,9 @@ describe('/admin setup-forums', () => {
     }
     expect(interaction.deferReply).toHaveBeenCalled();
     expect(sent(interaction.editReply).content?.split('\n')).toEqual([
-      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and pinned the list of what is going on.`,
-      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted and pinned the list of what is going on.`,
-      `<#${UNBOUNDED_CHANNEL}>: created <#${north?.forumChannelId}>, closed it to posts by members, posted and pinned the list of what is going on.`,
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted, pinned and locked the board.`,
+      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted, pinned and locked the board.`,
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north?.forumChannelId}>, closed it to posts by members, posted, pinned and locked the board.`,
     ]);
   });
 
@@ -171,7 +171,7 @@ describe('/admin setup-forums', () => {
     const interaction = await run();
     const lines = sent(interaction.editReply).content?.split(NEWLINE) ?? [];
     expect(lines[0]).toBe(
-      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, posted and pinned the list of what is going on. ` +
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, posted, pinned and locked the board. ` +
         'I could not close it to posts by members (I need Manage Permissions and Send Messages there; see the log).',
     );
     expect(lines[1]).toContain('closed it to posts by members');
@@ -282,18 +282,18 @@ describe('/admin setup-forums', () => {
     const text = sent((await run()).editReply).content ?? '';
     expect(text).toContain(
       `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted the ` +
-        'list of what is going on (I could not pin it: give me Manage Posts there).',
+        'board (I could not pin or lock it: give me Manage Posts there).',
     );
     expect(
       gateway.posts.get(regions.byChannel(WEST_CHANNEL)?.summaryMessageId ?? ''),
     ).toMatchObject({ pinned: false });
     expect(text).toContain(
-      `<#${EAST_CHANNEL}>: I am not allowed to post the list of what is going on in <#${EAST_FORUM}>: ` +
+      `<#${EAST_CHANNEL}>: I am not allowed to post the board in <#${EAST_FORUM}>: ` +
         'I lack the permission Create Posts there. Give it to me and run this again.',
     );
     gateway.refusePosts.set(EAST_FORUM, []);
     expect(sent((await run()).editReply).content).toContain(
-      `<#${EAST_CHANNEL}>: Discord does not let me post the list of what is going on in <#${EAST_FORUM}>. ` +
+      `<#${EAST_CHANNEL}>: Discord does not let me post the board in <#${EAST_FORUM}>. ` +
         'Check that I have View Channel, Create Posts, Send Messages in Posts and Manage Posts ' +
         'there, and run this again.',
     );
@@ -304,8 +304,8 @@ describe('/admin setup-forums', () => {
     gateway.refusePosts.set(EAST_FORUM, ['Create Posts']);
     const text = sent((await run()).editReply).content ?? '';
     expect(text).toContain(
-      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted and ` +
-        'pinned the list of what is going on.',
+      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted, ` +
+        'pinned and locked the board.',
     );
     expect(gateway.posts.has(regions.byChannel(EAST_CHANNEL)?.summaryMessageId ?? '')).toBe(true);
   });
@@ -314,8 +314,17 @@ describe('/admin setup-forums', () => {
     const { run, gateway } = await setup();
     gateway.failing.set('pinPost', new Error('Discord is away'));
     expect(sent((await run()).editReply).content).toContain(
-      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted the ` +
-        'list of what is going on (I could not pin it; see the log).',
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and ` +
+        'locked the board (I could not pin it; see the log).',
+    );
+  });
+
+  it('says so when the board could not be locked (review P12)', async () => {
+    const { run, gateway } = await setup();
+    gateway.failing.set('lockPost', new Error('Discord is away'));
+    expect(sent((await run()).editReply).content).toContain(
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and ` +
+        'pinned the board (I could not lock it; see the log).',
     );
   });
 
@@ -470,7 +479,7 @@ describe('/admin setup-forums', () => {
     const interaction = await run(['Admin', 'Moderator']);
     const north = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
     expect(sent(interaction.editReply).content?.split(NEWLINE)[0]).toBe(
-      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the list of what is going on, it is hidden from all but staff and the testers (without Use External Emojis there, which only its category gives me; see the log).`,
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted, pinned and locked the board, it is hidden from all but staff and the testers (without Use External Emojis there, which only its category gives me; see the log).`,
     );
   });
 
@@ -490,7 +499,7 @@ describe('/admin setup-forums', () => {
     gateway.noHiding.add(WEST_FORUM);
     const first = sent((await run(['Admin', 'Moderator'])).editReply).content?.split(NEWLINE)[0];
     expect(first).toBe(
-      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and pinned the list of what is going on, it was already hidden from members (Discord refused to set its permissions; see the log).`,
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted, pinned and locked the board, it was already hidden from members (Discord refused to set its permissions; see the log).`,
     );
   });
 
@@ -525,7 +534,7 @@ describe('/admin setup-forums', () => {
     const interaction = await run(['Admin', 'Moderator']);
     const north = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
     expect(sent(interaction.editReply).content?.split(NEWLINE)).toEqual([
-      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the list of what is going on, hid it from all but staff and the testers.`,
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted, pinned and locked the board, hid it from all but staff and the testers.`,
       'Rehearsal mode: only the regions north get a forum, which only staff and the testers see.',
       'I could not check that every region of settings.rehearsal.regions names a region channel of this server (see the log).',
     ]);
diff --git a/src/commands/admin/setup-forums.ts b/src/commands/admin/setup-forums.ts
index cf4243b8..d516ab66 100644
--- a/src/commands/admin/setup-forums.ts
+++ b/src/commands/admin/setup-forums.ts
@@ -31,12 +31,28 @@ const HIDE_BY_HAND =
   '(my member or my own role), the staff roles (those settings.rehearsal.staffRoles names, and ' +
   'every role with Manage Server or Administrator) and the testers.';
 
-/** A new summary post, and whether it could be pinned (Discord refuses a pin without Manage Posts). */
-function summaryWords(unpinned: ForumSetup['unpinned']): string {
-  if (unpinned === undefined) return 'posted and pinned the list of what is going on';
-  return unpinned === 'refused'
-    ? 'posted the list of what is going on (I could not pin it: give me Manage Posts there)'
-    : 'posted the list of what is going on (I could not pin it; see the log)';
+/**
+ * A new board (plan 8R-9: the summary post, locked), and whether it could be pinned and locked
+ * (review P12; Discord refuses both without Manage Posts): what was done, then what was not and
+ * why (`refused`: the permission; `failed`: see the log).
+ */
+function summaryWords({ unpinned, unlocked }: Pick<ForumSetup, 'unpinned' | 'unlocked'>): string {
+  const done = [
+    'posted',
+    ...(unpinned === undefined ? ['pinned'] : []),
+    ...(unlocked === undefined ? ['locked'] : []),
+  ];
+  const didWords =
+    done.length < 3
+      ? done.join(' and ')
+      : `${done.slice(0, -1).join(', ')} and ${done.at(-1) ?? ''}`;
+  const not = [...(unpinned ? ['pin'] : []), ...(unlocked ? ['lock'] : [])];
+  if (not.length === 0) return `${didWords} the board`;
+  const why =
+    unpinned === 'refused' || unlocked === 'refused'
+      ? ': give me Manage Posts there'
+      : '; see the log';
+  return `${didWords} the board (I could not ${not.join(' or ')} it${why})`;
 }
 
 function line(result: ForumSetup): string {
@@ -70,7 +86,7 @@ function line(result: ForumSetup): string {
         ]),
     ...(result.renamed ? ['renamed it'] : []),
     ...(result.posting === 'reserved' ? ['closed it to posts by members'] : []),
-    ...(result.summary ? [summaryWords(result.unpinned)] : []),
+    ...(result.summary ? [summaryWords(result)] : []),
     ...(result.hidden === 'hidden'
       ? [
           result.refused === undefined
@@ -133,14 +149,16 @@ export const setupForums: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('setup-forums')
     .setDescription(
-      'Create the raid forum, its tags and the list of what is going on for every region',
+      'Create the forum, its tags and the board (Today and coming up) for every region',
     ),
   help: {
     details:
-      'For each region of this server: creates the forum for its raid posts next to the ' +
-      "region's channel if it has none, adds the tags that are missing, and posts and pins the " +
-      'list of what is going on ("Going on now"). It changes nothing that is already there, so it is safe to run ' +
-      'again. A forum whose region is gone is named and left alone.',
+      'For each region of this server: creates the forum for its raids, max battles, trains ' +
+      "and meetups next to the region's channel if it has none (named after the channel, " +
+      '`-board`; a forum of another one-word ending is renamed), adds the tags that are missing, ' +
+      'and posts, pins and locks the board ("Today and coming up", with "Today’s Stops" below ' +
+      'it). It changes nothing else that is already there, so it is safe to run again. A forum ' +
+      'whose region is gone is named and left alone.',
     examples: ['/admin setup-forums'],
   },
   defer: 'ephemeral',
diff --git a/src/commands/research/research-report.test.ts b/src/commands/research/research-report.test.ts
index ef9aeefb..8479211e 100644
--- a/src/commands/research/research-report.test.ts
+++ b/src/commands/research/research-report.test.ts
@@ -112,12 +112,12 @@ describe('reportResearchAs', () => {
     ]);
     expect(reported.view).toMatchObject({ channels: [WEST_CHANNEL], until: 'until midnight' });
     expect(researchWords(reported.view, () => '#west').where).toBe(
-      'In the post "Today’s Stops" of #west, until midnight.',
+      'In "Today’s Stops" on the board of #west, until midnight.',
     );
     expect(store.rows.size).toBe(2);
   });
 
-  it('names no pinned post in rehearsal mode, which makes none', async () => {
+  it('names no post of the stops in rehearsal mode, which makes none', async () => {
     const { ctx } = await setup();
     Object.assign(ctx, {
       rehearsal: new Rehearsal({ allowlist: [ASH.id], regions: ['west'], staffRoles: [] }),
diff --git a/src/commands/research/research-report.ts b/src/commands/research/research-report.ts
index 2a48febf..890c7579 100644
--- a/src/commands/research/research-report.ts
+++ b/src/commands/research/research-report.ts
@@ -114,7 +114,7 @@ export async function stopsByKey(
   });
 }
 
-/** The channels of this server's regions the stops lie in, whose pinned posts show them. */
+/** The channels of this server's regions the stops lie in, whose posts of the stops show them. */
 async function postChannels(
   ctx: Pick<AppContext, 'guilds' | 'regions' | 'wayspots'>,
   serverId: string,
@@ -147,7 +147,7 @@ export interface ResearchReported {
 
 /**
  * `/research report` as the member (plan 8R-3: the command, "Same task at more stops…" and the
- * map): the task at the stops (`StopReportService.reportResearch`, which tells the pinned posts
+ * map): the task at the stops (`StopReportService.reportResearch`, which tells the posts of the stops
  * and who wants a reward), and the view of the answer's words (`researchWords`): the region
  * channels whose posts show it (none named in rehearsal mode, which makes no post) and until
  * when. Throws what storing throws.
@@ -175,7 +175,7 @@ export async function reportResearchAs(
       already,
       channels: await postChannels(ctx, serverId, stops),
       until: periodEndWords(outcome.period.end, Date.now(), ctx.config.settings.timezone),
-      // Rehearsal mode makes no pinned post (B10).
+      // Rehearsal mode makes no post of the stops (B10).
       posts: ctx.rehearsal === undefined,
       also,
     },
diff --git a/src/commands/research/research.test.ts b/src/commands/research/research.test.ts
index 80912882..0fd8fae5 100644
--- a/src/commands/research/research.test.ts
+++ b/src/commands/research/research.test.ts
@@ -182,7 +182,7 @@ describe('/research report', () => {
     );
     expect(said(answer)).toContain('- **Yellow Mural**\n- **Paititi Inti**');
     expect(said(answer)).toContain(
-      `-# In the post "Today’s Stops" of <#${WEST_CHANNEL}>, until midnight.`,
+      `-# In "Today’s Stops" on the board of <#${WEST_CHANNEL}>, until midnight.`,
     );
     // Within 2 km and without the task: Little Bench, not Far Stop nor the power spot.
     const [menu] = selectsOf(asV2(answer));
@@ -377,13 +377,13 @@ describe('/research remove', () => {
 });
 
 describe('/research in rehearsal mode', () => {
-  it('names no pinned post in its answer: rehearsal mode makes none (B10)', async () => {
+  it('names no post of the stops in its answer: rehearsal mode makes none (B10)', async () => {
     const made = await setup();
     Object.assign(made.ctx, {
       rehearsal: new Rehearsal({ allowlist: [ASH], regions: ['west'], staffRoles: [] }),
     });
     const answer = answerOf(await made.report({ task: DRAGON.key, stop: stop(1) }));
-    expect(said(answer)).not.toContain('pinned post');
+    expect(said(answer)).not.toContain('Today’s Stops');
     expect(said(answer)).toContain('-# It stands until midnight.');
   });
 });
@@ -952,6 +952,9 @@ describe('/research report and the versions of a task (plan 8R-5)', () => {
     expect(details).toContain('"one of" its Pokémon');
     expect(details).toContain('Another member’s report is asked about first');
     expect(details).toContain('or one that says less, is "Already reported"');
+    // Where the reports show since plan 8R-9: the region's board, and a line for a new task.
+    expect(details).toContain('"Today’s Stops" on the region’s board');
+    expect(details).toContain('a line in the region’s channel');
     expect(details).not.toMatch(/…$/);
     const report = research.data.toJSON().options?.find((option) => option.name === 'report');
     const reward =
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index 6f8bbdc2..8aaded79 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -427,7 +427,7 @@ async function researchChoices(interaction: AutocompleteInteraction, ctx: AppCon
 /**
  * `/research report task: stop: [stop2:] … [stop5:] [reward:]` (plan 8R-1; design 4.3): a task
  * at up to five PokéStops, each in the place of the stop's report of the period. No message of
- * its own: the pinned post of the region shows it, and who wants a reward is told by DM.
+ * its own: the post of the stops of the region shows it, and who wants a reward is told by DM.
  */
 const reportResearch: SubcommandPart = {
   data: (() => {
@@ -463,9 +463,10 @@ const reportResearch: SubcommandPart = {
       'from theirs (your region’s first), or paste a maps link to a stop. A report replaces ' +
       'your own at a stop today, and a "one of" by one of its Pokémon. Another member’s report ' +
       'is asked about first: tick the stops whose report you replace. The same report again, ' +
-      'or one that says less, is "Already reported". Nothing is posted: the post "Today’s ' +
-      'Stops" of the region shows every task of the day, and members who want a reward ' +
-      'get a direct message. A task missing from the list can be typed in full, with its ' +
+      'or one that says less, is "Already reported". "Today’s Stops" on the region’s board ' +
+      '(its forum’s locked post) shows every task of the day, a task new today gets a line in ' +
+      'the region’s channel, and members who want a reward get a direct message. A task ' +
+      'missing from the list can be typed in full, with its ' +
       '`reward`. Your answer offers the same task at more stops nearby and takes the report ' +
       `back. You can make ${String(settings.research.throttle.uses)} reports in ` +
       `${String(settings.research.throttle.minutes)} minutes; up to ` +
diff --git a/src/commands/rocket/rocket.test.ts b/src/commands/rocket/rocket.test.ts
index 6c9dce14..8e0c4cb8 100644
--- a/src/commands/rocket/rocket.test.ts
+++ b/src/commands/rocket/rocket.test.ts
@@ -13,7 +13,8 @@ import {
   type FakeOptions,
 } from '../../../test/support/fake-interactions.js';
 import { UNBOUNDED_CHANNEL, WEST_CHANNEL } from '../../../test/support/gyms.js';
-import { textOf } from '../../../test/support/messages.js';
+import { textDisplays, textOf } from '../../../test/support/messages.js';
+import { renderSubcommandHelp } from '../util/help-render.js';
 import {
   feedChoice,
   rocketChoicesOfFeed,
@@ -197,7 +198,7 @@ describe('/rocket report', () => {
     const arlo = answerOf(await made.report({ who: 'leader:arlo', stop: stop(1) }));
     expect(said(arlo)).toContain('**Arlo** at **Yellow Mural** · catch Alolan Grimer');
     expect(said(arlo)).toContain(
-      'In the post "Today’s Stops" of <#100000000000000001>, until midnight.',
+      'In "Today’s Stops" on the board of <#100000000000000001>, until midnight.',
     );
     expect(posted(made)).toEqual([]);
     const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
@@ -869,3 +870,14 @@ describe('/rocket in rehearsal mode', () => {
     expect(posted(made)).toEqual([]);
   });
 });
+
+describe('/rocket report’s help (plan 8R-9)', () => {
+  it('says that a hideout goes in "Today’s Stops" on the region’s board, a leader with a line', () => {
+    const { ctx } = createTestContext();
+    const message = renderSubcommandHelp(rocket, 'report', ctx.config.settings);
+    if (!message) throw new Error('no help');
+    const [details = ''] = textDisplays(message);
+    expect(details).toContain('goes in "Today’s Stops" on the region’s board until midnight');
+    expect(details).toContain('a line in the region’s channel');
+  });
+});
diff --git a/src/commands/rocket/rocket.ts b/src/commands/rocket/rocket.ts
index 9ff917d5..9c8c8b84 100644
--- a/src/commands/rocket/rocket.ts
+++ b/src/commands/rocket/rocket.ts
@@ -55,7 +55,7 @@ import {
 /*
  * `/rocket` (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.2): Team GO Rocket at
  * PokéStops, offered on every server (Matt's answer 7). `report who: stop:` reports a grunt (a
- * message in the region channels for half an hour) or a hideout (the pinned posts, until
+ * message in the region channels for half an hour) or a hideout (the posts of the stops, until
  * midnight), one Rocket report per stop and day; a grunt where a hideout stands asks first, in a
  * dialog. `remove stop:` takes back the stop's report: one's own, any for staff.
  */
@@ -222,7 +222,7 @@ const stopOption = (option: SlashCommandStringOption) =>
 
 /**
  * `/rocket report who: stop:` (design 5.2): a grunt (its message in the region channels of the
- * stop for `settings.rocket.gruntMinutes`) or a hideout (the pinned post, until midnight), in the
+ * stop for `settings.rocket.gruntMinutes`) or a hideout (the post of the stops, until midnight), in the
  * place of the stop's Rocket report of the day; the same grunt again is reported already; a grunt
  * where a hideout stands asks first. Its own throttle window (design 9.12).
  */
@@ -245,8 +245,9 @@ const reportRocket: SubcommandPart = {
       'while you type (it finds them by what can be caught too: `dratini`), and the stop from ' +
       'theirs (your region’s first), or paste a maps link to a stop. A grunt is posted in the ' +
       `region’s channel for ${String(settings.rocket.gruntMinutes)} minutes; a leader, Giovanni ` +
-      'or a decoy grunt goes in the post "Today’s Stops" until midnight, and keeps ' +
-      `grunts away from the stop all day. ${GIOVANNI_ONLY_WHEN_SURE} A ` +
+      'or a decoy grunt goes in "Today’s Stops" on the region’s board until midnight (a ' +
+      'leader or Giovanni new today with a line in the region’s channel), and keeps grunts ' +
+      `away from the stop all day. ${GIOVANNI_ONLY_WHEN_SURE} A ` +
       'stop has one report: a newer one replaces it (a grunt where a hideout was reported asks ' +
       'first), and the same grunt twice is answered with the report that stands. Members who ' +
       'want it get a direct message. Your answer takes the report back. You can make ' +
diff --git a/src/db/repositories/cutover-repository.db.test.ts b/src/db/repositories/cutover-repository.db.test.ts
index b8108330..4a89508a 100644
--- a/src/db/repositories/cutover-repository.db.test.ts
+++ b/src/db/repositories/cutover-repository.db.test.ts
@@ -51,8 +51,8 @@ describe('CutoverRepository', () => {
     await withServers(database);
     expect(await read(database, (repository) => repository.servers())).toEqual([HOME, AWAY]);
     expect(await read(database, (repository) => repository.regions())).toEqual([
-      { guild: HOME, channelId: NORTH, forumChannelId: null },
-      { guild: HOME, channelId: SOUTH, forumChannelId: null },
+      { guild: HOME, channelId: NORTH, forumChannelId: null, summaryMessageId: null },
+      { guild: HOME, channelId: SOUTH, forumChannelId: null, summaryMessageId: null },
     ]);
   });
 
@@ -70,8 +70,8 @@ describe('CutoverRepository', () => {
       NORTH,
     ]);
     expect(await read(database, (repository) => repository.regions())).toEqual([
-      { guild: HOME, channelId: NORTH, forumChannelId: FORUM },
-      { guild: HOME, channelId: SOUTH, forumChannelId: null },
+      { guild: HOME, channelId: NORTH, forumChannelId: FORUM, summaryMessageId: null },
+      { guild: HOME, channelId: SOUTH, forumChannelId: null, summaryMessageId: null },
     ]);
   });
 
diff --git a/src/db/repositories/cutover-repository.ts b/src/db/repositories/cutover-repository.ts
index 5cb50658..9aac3429 100644
--- a/src/db/repositories/cutover-repository.ts
+++ b/src/db/repositories/cutover-repository.ts
@@ -8,6 +8,8 @@ export interface CutoverRegion {
   channelId: string;
   /** Its forum; null where it has none, and in a legacy database, which has no forums yet. */
   forumChannelId: string | null;
+  /** Its board, the forum's summary post (plan 8R-9); null where none is recorded. */
+  summaryMessageId: string | null;
 }
 
 /** A self-assigned role as the cutover check reads it. */
@@ -80,9 +82,16 @@ export class CutoverRepository {
   async regions(): Promise<CutoverRegion[]> {
     if (!(await this.hasTable('Region')) || !(await this.hasTable('Guild'))) return [];
     const forums = await this.hasColumn('Region', 'forumChannelId');
-    const rows = await sql<{ guild: string; channelId: string; forumChannelId: string | null }>`
+    const boards = await this.hasColumn('Region', 'summaryMessageId');
+    const rows = await sql<{
+      guild: string;
+      channelId: string;
+      forumChannelId: string | null;
+      summaryMessageId: string | null;
+    }>`
       select g.snowflake as guild, r.channelId as channelId,
-        ${forums ? sql`r.forumChannelId` : sql`null`} as forumChannelId
+        ${forums ? sql`r.forumChannelId` : sql`null`} as forumChannelId,
+        ${boards ? sql`r.summaryMessageId` : sql`null`} as summaryMessageId
       from Region r join Guild g on g.id = r.guildId
       where g.snowflake is not null and r.channelId is not null
       order by r.id`.execute(this.db);
@@ -90,6 +99,7 @@ export class CutoverRepository {
       guild: String(row.guild),
       channelId: String(row.channelId),
       forumChannelId: row.forumChannelId === null ? null : String(row.forumChannelId),
+      summaryMessageId: row.summaryMessageId === null ? null : String(row.summaryMessageId),
     }));
   }
 }
diff --git a/src/db/repositories/research-repositories.db.test.ts b/src/db/repositories/research-repositories.db.test.ts
index fa441f5b..18ae9041 100644
--- a/src/db/repositories/research-repositories.db.test.ts
+++ b/src/db/repositories/research-repositories.db.test.ts
@@ -18,7 +18,7 @@ import { StopPostRepository } from './stop-post-repository.js';
 import { StopLineRepository } from './stop-line-repository.js';
 import { stopLineCases } from '../../../test/support/stop-line-cases.js';
 
-/** The smaller tables of plan 8R-1: stops of Pine's own, pinned posts, research events, tasks. */
+/** The smaller tables of plan 8R-1: stops of Pine's own, posts of the stops, research events, tasks. */
 describe('the repositories of reports at stops', () => {
   let stop: () => Promise<void>;
   let db: Kysely<DB>;
diff --git a/src/domain/research/reports.ts b/src/domain/research/reports.ts
index 0604528d..2cd96927 100644
--- a/src/domain/research/reports.ts
+++ b/src/domain/research/reports.ts
@@ -72,7 +72,7 @@ export type ResearchDecision = 'new' | 'narrow' | 'less' | 'again' | 'asks' | 'c
  * A report's version as the decision sees it: its task, its reward's hash, or none where it
  * stands for its task's rewards together. A task's key alone with one reward in its detail is
  * that reward's version (R10: a report of before, of a task of one reward); with none or two
- * or more it is open ("one of", a typed task without its reward). The pinned post groups by it
+ * or more it is open ("one of", a typed task without its reward). The post of the stops groups by it
  * too (review R2).
  */
 export function versionOf(report: ResearchAt): ResearchSubjectKey | undefined {
diff --git a/src/domain/stops/pictures.ts b/src/domain/stops/pictures.ts
index 0f18fa13..aa74d418 100644
--- a/src/domain/stops/pictures.ts
+++ b/src/domain/stops/pictures.ts
@@ -5,7 +5,7 @@ import { GIOVANNI_PORTRAIT, LEADER_PORTRAITS } from '../rocket/portraits.js';
 
 /*
  * Which picture a report at a stop shows (plan 8R-6; design `2026-10-23-stop-pictures-design.md`,
- * "The rule for every picture"), in the pinned post, the DMs and a grunt's message alike: when
+ * "The rule for every picture"), in the post of the stops, the DMs and a grunt's message alike: when
  * the Pokémon is known, its picture; while it is not (a "one of", a grunt whose catch is open),
  * the game's encounter picture; an item or Mega Energy its own; a leader or Giovanni the
  * portrait; none where there is none. The address given is the source (a feed's, or one of the
@@ -22,7 +22,7 @@ export const ENCOUNTER_PICTURE =
   'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Quests/QuestPokemonReward.png';
 
 /**
- * What a picture is of, for the busy day of the pinned post (design, "The post's layout"): the
+ * What a picture is of, for the busy day of the post of the stops (design, "The post's layout"): the
  * pictures of items and Mega Energy go first; the encounter picture and the portraits count as
  * Pokémon.
  */
diff --git a/src/domain/time/research-periods.ts b/src/domain/time/research-periods.ts
index 5ec90e20..89fe5489 100644
--- a/src/domain/time/research-periods.ts
+++ b/src/domain/time/research-periods.ts
@@ -186,7 +186,7 @@ export function periodAt(
 
 /**
  * When the period may next change after `time`: the next local midnight, or the start or end of
- * an event's window or rotation before it. The pinned post is drawn anew then.
+ * an event's window or rotation before it. The post of the stops is drawn anew then.
  */
 export function nextPeriodChange(
   events: readonly ResearchEvent[],
diff --git a/src/domain/web/stop-report-data.ts b/src/domain/web/stop-report-data.ts
index 5ed79268..9b29df7e 100644
--- a/src/domain/web/stop-report-data.ts
+++ b/src/domain/web/stop-report-data.ts
@@ -53,7 +53,7 @@ interface MapStopReportBase {
   /** Whether this member may take it back here: their own, or any for staff; never read-only. */
   mayTakeBack: boolean;
   /**
-   * Where it is on Discord: the message of the pinned post "Today’s Stops" that holds a
+   * Where it is on Discord: the message of the post "Today’s Stops" in the board that holds a
    * task or a hideout, a grunt's own message; absent where there is none the member may see.
    */
   link?: string;
@@ -95,7 +95,7 @@ export interface MapGrunt extends MapStopReportBase {
 
 /**
  * A hideout reported at a stop for the day (a leader, Giovanni, the decoy): who (`leader:arlo`,
- * `giovanni`, `decoy`), its name, the catches, and its picture as the pinned post shows it beside
+ * `giovanni`, `decoy`), its name, the catches, and its picture as the post of the stops shows it beside
  * the hideout (plan 8R-6: a leader's or Giovanni's portrait, a decoy's one catch or the encounter
  * picture; only from `pictureOrigins`).
  */
@@ -110,7 +110,7 @@ export interface MapHideout extends MapStopReportBase {
  * Today's reports at the stops of a server as the member may see them
  * (`GET /s/<guild>/api/stop-reports`): the research of the period on now (`event`: the research
  * event whose tasks these are, null on an ordinary day), how many of the day's research reports
- * wait under an intra-day event's window and when they come back (`waiting`, as the pinned post
+ * wait under an intra-day event's window and when they come back (`waiting`, as the post of the stops
  * says it), the grunts standing, the day's hideouts; the posts' zone.
  */
 export interface StopReportsView {
diff --git a/src/domain/web/stop-report-view.test.ts b/src/domain/web/stop-report-view.test.ts
index d6286a9a..f0067c38 100644
--- a/src/domain/web/stop-report-view.test.ts
+++ b/src/domain/web/stop-report-view.test.ts
@@ -137,7 +137,7 @@ describe('stopReportView', () => {
       ],
     });
     expect(view.grunts[0]?.catches[0]?.image).toBe(MUDKIP.image);
-    // A leader's picture is the portrait, as the pinned post shows it (plan 8R-6).
+    // A leader's picture is the portrait, as the post of the stops shows it (plan 8R-6).
     expect(view.hideouts[0]).toMatchObject({
       who: 'leader:arlo',
       name: 'Arlo',
diff --git a/src/domain/web/stop-report-view.ts b/src/domain/web/stop-report-view.ts
index 2cfa020d..90336686 100644
--- a/src/domain/web/stop-report-view.ts
+++ b/src/domain/web/stop-report-view.ts
@@ -41,7 +41,7 @@ export interface StopReportViewInput {
   /** The origins the page may load pictures from (`pictureOrigins`). */
   pictureOrigins: readonly string[];
   /**
-   * The address of a hideout's picture as the pinned post names it (plan 8R-6,
+   * The address of a hideout's picture as the post of the stops names it (plan 8R-6,
    * `StopPictures.url`: the square picture Pine serves, none where the source is gone); the
    * source itself without it.
    */
@@ -147,7 +147,7 @@ function mapGrunt(report: RocketReport, input: StopReportViewInput): MapGrunt {
 }
 
 /**
- * A hideout as the map shows it; its picture as the pinned post's (plan 8R-6, `rocketPicture`): a
+ * A hideout as the map shows it; its picture as the post's (plan 8R-6, `rocketPicture`): a
  * leader's or Giovanni's portrait, a decoy's one catch or the encounter picture, named as the post
  * names it (`picture`: none where it is gone), only from a host the page may load.
  */
diff --git a/src/ops/cutover-check.test.ts b/src/ops/cutover-check.test.ts
index 3429ee67..72be24bf 100644
--- a/src/ops/cutover-check.test.ts
+++ b/src/ops/cutover-check.test.ts
@@ -110,8 +110,8 @@ function server(api: FakeDiscordApi, store: MemoryCutoverStore): Server {
   api.emoji = [...GAME_ICON_NAMES];
   store.servers = [guild.id];
   store.regions = [
-    { guild: guild.id, channelId: north.id, forumChannelId: null },
-    { guild: guild.id, channelId: south.id, forumChannelId: null },
+    { guild: guild.id, channelId: north.id, forumChannelId: null, summaryMessageId: null },
+    { guild: guild.id, channelId: south.id, forumChannelId: null, summaryMessageId: null },
   ];
   return { guild, botRole, category, north, south };
 }
@@ -624,11 +624,22 @@ describe('cutoverCheck', () => {
         parentId: shape.category.id,
       });
       store.regions = [
-        { guild: shape.guild.id, channelId: shape.north.id, forumChannelId: forum.id },
-        { guild: shape.guild.id, channelId: shape.south.id, forumChannelId: other.id },
+        {
+          guild: shape.guild.id,
+          channelId: shape.north.id,
+          forumChannelId: forum.id,
+          summaryMessageId: '900000000000000001',
+        },
+        {
+          guild: shape.guild.id,
+          channelId: shape.south.id,
+          forumChannelId: other.id,
+          summaryMessageId: '900000000000000002',
+        },
       ];
       const lines = await check();
       expect(line(lines, 'forums')).toMatchObject({ status: 'pass' });
+      expect(lines.find((one) => one.what === 'boards')).toBeUndefined();
       expect(lines.find((one) => one.what === 'region')).toMatchObject({
         status: 'fail',
         text: 'region #north: the bot lacks Manage Posts (Manage Threads) in the forum #north-meetups',
@@ -639,6 +650,29 @@ describe('cutoverCheck', () => {
       );
     });
 
+    it('warns, from the database, of the regions with a forum but no board (plan 8R-9, P11)', async () => {
+      store.regions = [
+        {
+          guild: shape.guild.id,
+          channelId: shape.north.id,
+          forumChannelId: '800000000000000001',
+          summaryMessageId: null,
+        },
+        {
+          guild: shape.guild.id,
+          channelId: shape.south.id,
+          forumChannelId: '800000000000000002',
+          summaryMessageId: null,
+        },
+      ];
+      expect(line(await check(), 'boards')).toMatchObject({
+        status: 'warn',
+        text:
+          'boards: 2 of 2 regions with a forum have no board yet (#north, #south): ' +
+          "'/admin setup-forums' makes it",
+      });
+    });
+
     it('warns of the regions without a forum, by name', async () => {
       expect(line(await check(), 'forums')).toMatchObject({
         status: 'warn',
diff --git a/src/ops/cutover-check.ts b/src/ops/cutover-check.ts
index fa72db05..b3eef65e 100644
--- a/src/ops/cutover-check.ts
+++ b/src/ops/cutover-check.ts
@@ -62,6 +62,7 @@ export interface CheckLine {
     | 'region'
     | 'names'
     | 'forums'
+    | 'boards'
     | 'restrictions'
     | 'cleanup'
     | 'announcements'
@@ -197,7 +198,7 @@ async function serverLines(
   regions: readonly CutoverRegion[],
   settings: Settings,
   selfRoles: readonly CutoverSelfRole[],
-): Promise<{ lines: CheckLine[]; withoutForum: string[] }> {
+): Promise<{ lines: CheckLine[]; withoutForum: string[]; withoutBoard: string[] }> {
   const lines: CheckLine[] = [];
   const guild = (await discord.get(Routes.guild(guildId))) as {
     id: string;
@@ -214,7 +215,7 @@ async function serverLines(
       status: 'fail',
       text: `server ${guild.name}: the bot's member could not be read: ${failureReason(err)}`,
     });
-    return { lines, withoutForum: [] };
+    return { lines, withoutForum: [], withoutBoard: [] };
   }
   const channels = (await discord.get(Routes.guildChannels(guildId))) as ApiChannel[];
   const me: ApiMember = { id: bot.id, roleIds: member.roles };
@@ -269,6 +270,8 @@ async function serverLines(
   const permissionsIn = (channel: ApiChannel) =>
     channelPermissions(base, guild.id, me, channel.permission_overwrites ?? []);
   const withoutForum: string[] = [];
+  // The regions with a forum but no board recorded (plan 8R-9, review P11, R5).
+  const withoutBoard: string[] = [];
   // Where the bot could not delete what a report is about (plan 8S-2).
   const reportGaps: string[] = [];
   for (const region of regions) {
@@ -301,6 +304,9 @@ async function serverLines(
         needs: inForum(FORUM_NEEDS),
       });
     else withoutForum.push(`#${channel.name}`);
+    if (region.forumChannelId !== null && region.summaryMessageId === null) {
+      withoutBoard.push(`#${channel.name}`);
+    }
     const reportPlaces = [
       { place: `#${channel.name}`, channel, needs: REPORT_CHANNEL_NEEDS },
       ...(forum
@@ -390,7 +396,7 @@ async function serverLines(
   if (settings.channels.moderation !== undefined) lines.push(reportsLine(guild.name, reportGaps));
   const rolesCheck = rolesLine(guild.name, guild.roles, member.roles, selfRoles);
   if (rolesCheck) lines.push(rolesCheck);
-  return { lines, withoutForum };
+  return { lines, withoutForum, withoutBoard };
 }
 
 /** The channels the bot announces in or copies posts to, as the settings name them. */
@@ -854,6 +860,7 @@ async function discordLines(
       });
     }
     const withoutForum: string[] = [];
+    const withoutBoard: string[] = [];
     for (const guildId of guildIds.filter((id) => joinedIds.has(id))) {
       const ofServer = regions.filter((one) => one.guild === guildId);
       // A server that cannot be read is a failure of its own; the others are still checked.
@@ -868,6 +875,7 @@ async function discordLines(
         );
         lines.push(...server.lines);
         withoutForum.push(...server.withoutForum);
+        withoutBoard.push(...server.withoutBoard);
       } catch (err) {
         const name = joined.find((one) => one.id === guildId)?.name ?? guildId;
         lines.push({
@@ -876,6 +884,11 @@ async function discordLines(
           text: `server ${name}: it could not be read: ${failureReason(err)}`,
         });
         withoutForum.push(...ofServer.map((one) => one.channelId));
+        withoutBoard.push(
+          ...ofServer
+            .filter((one) => one.forumChannelId !== null && one.summaryMessageId === null)
+            .map((one) => one.channelId),
+        );
       }
       if (options.legacyParties !== undefined) {
         const name = joined.find((one) => one.id === guildId)?.name ?? guildId;
@@ -914,6 +927,20 @@ async function discordLines(
               text: `forums: ${withoutForum.length} of ${counted} regions have no forum yet (${withoutForum.join(', ')}): '/admin setup-forums' makes them`,
             },
     );
+    // The regions with a forum but no board recorded in the database (plan 8R-9, review P11,
+    // R5): their "Today and coming up" and "Today’s Stops" wait for /admin setup-forums.
+    if (withoutBoard.length > 0) {
+      const withForum = regions.filter(
+        (one) => joinedIds.has(one.guild) && one.forumChannelId !== null,
+      ).length;
+      lines.push({
+        what: 'boards',
+        status: 'warn',
+        text:
+          `boards: ${String(withoutBoard.length)} of ${String(withForum)} regions with a forum ` +
+          `have no board yet (${withoutBoard.join(', ')}): '/admin setup-forums' makes it`,
+      });
+    }
   } catch (err) {
     lines.push({
       what: 'discord',
diff --git a/src/ops/permissions.ts b/src/ops/permissions.ts
index 8f75f503..09f36da2 100644
--- a/src/ops/permissions.ts
+++ b/src/ops/permissions.ts
@@ -113,9 +113,13 @@ const MANAGE_ROLES = need(
 const MANAGE_THREADS = need(
   P.ManageThreads,
   'Manage Threads',
-  'archiving, locking, renaming and pinning posts',
+  'archiving, locking, renaming and pinning posts; writing in the locked board (plan 8R-9)',
+);
+const THREADS = need(
+  P.SendMessagesInThreads,
+  'Send Messages in Threads',
+  'messages in posts; "Today’s Stops" in the board',
 );
-const THREADS = need(P.SendMessagesInThreads, 'Send Messages in Threads', 'messages in posts');
 const REACT = need(P.AddReactions, 'Add Reactions', 'the marks on a screenshot it reads', true);
 const EXTERNAL = need(
   P.UseExternalEmojis,
@@ -173,7 +177,9 @@ export const MODERATION_NEEDS: readonly Need[] = [VIEW, SEND, EMBED];
 
 /**
  * What it needs in a region's forum, and in the category the forum is made in (a new forum
- * takes the category's overwrites): posts, their messages, archiving them, who may see them.
+ * takes the category's overwrites): posts, their messages, archiving them, who may see them, and
+ * since plan 8R-9 the region's locked board with "Today’s Stops" in it (Send Messages in Threads,
+ * Embed Links and Manage Threads, `PartyGateway.postAccess`).
  */
 export const FORUM_NEEDS: readonly Need[] = [
   VIEW,
diff --git a/src/render/activity.ts b/src/render/activity.ts
index 2a229586..d0795f05 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -327,13 +327,13 @@ export function summaryRefusedWords(refused: PostsRefused): string {
   const { missing } = refused;
   if (missing.length === 0) {
     return (
-      `Discord does not let me post the list of what is going on in ${forum}. Check that I have ` +
+      `Discord does not let me post the board in ${forum}. Check that I have ` +
       `${andList(POST_PERMISSIONS)} there, and run this again.`
     );
   }
   const one = missing.length === 1;
   return (
-    `I am not allowed to post the list of what is going on in ${forum}: I lack the ` +
+    `I am not allowed to post the board in ${forum}: I lack the ` +
     `permission${one ? '' : 's'} ${andList(missing)} there. Give ${one ? 'it' : 'them'} to me ` +
     'and run this again.'
   );
diff --git a/src/render/research.test.ts b/src/render/research.test.ts
index c472d3c5..bce3cca6 100644
--- a/src/render/research.test.ts
+++ b/src/render/research.test.ts
@@ -63,7 +63,7 @@ describe('researchAnswer', () => {
                 "type": 10,
               },
               {
-                "content": "-# In the post "Today’s Stops" of <#100000000000000011>, <#100000000000000012>, until midnight.",
+                "content": "-# In "Today’s Stops" on the boards of <#100000000000000011>, <#100000000000000012>, until midnight.",
                 "type": 10,
               },
               {
@@ -146,7 +146,7 @@ describe('researchWords', () => {
         '- **Yellow Mural 1** · Market Street (was: Catch 7 \\*Pokémon\\*)\n' +
         '- **Yellow Mural 2** · Market Street',
     );
-    expect(words.where).toBe('In the post "Today’s Stops" of #west, #east, until midnight.');
+    expect(words.where).toBe('In "Today’s Stops" on the boards of #west, #east, until midnight.');
   });
 });
 
diff --git a/src/render/research.ts b/src/render/research.ts
index 1f23561b..29cfd6a3 100644
--- a/src/render/research.ts
+++ b/src/render/research.ts
@@ -116,7 +116,7 @@ export interface MoreStop {
 
 /**
  * A stop where a report stands already (plan 8R-5, R8): the report, the link to the message of
- * the pinned post that holds it, and the reporter as the caller names them (the map: by name).
+ * the post of the stops that holds it, and the reporter as the caller names them (the map: by name).
  */
 export interface AlreadyAt {
   report: ResearchReport;
@@ -160,13 +160,13 @@ export interface ResearchWordsView {
   saved: readonly { report: ResearchReport; replaced: ResearchReport | undefined }[];
   /** The stops where a report stood already (plan 8R-5, R8): said after those reported. */
   already?: readonly AlreadyAt[];
-  /** The region channels whose pinned posts show them. */
+  /** The region channels whose posts of the stops show them. */
   channels: readonly string[];
   /** When they end, as shown (`periodEndWords`). */
   until: string;
   /** `also`: the answer of "Same task at more stops…", which says "Also reported". */
   also?: boolean;
-  /** Whether pinned posts are made (not in rehearsal mode: then none is named). */
+  /** Whether posts of the stops are made (not in rehearsal mode: then none is named). */
   posts?: boolean;
 }
 
@@ -218,10 +218,19 @@ export function researchWords(
       ? `It stands ${view.until}.`
       : view.channels.length === 0
         ? `It lies in no region now, so no post shows it; it stands ${view.until}.`
-        : `In the post "Today’s Stops" of ${view.channels.map(channel).join(', ')}, ${view.until}.`;
+        : `${boardWords(view.channels.map(channel))}, ${view.until}.`;
   return { head, where };
 }
 
+/**
+ * Where the post of the stops shows a report (plan 8R-9): `In "Today’s Stops" on the board of
+ * #west`, the region channels as the caller names them; the board is the region's forum's locked
+ * post, which the words name by its region's channel.
+ */
+export function boardWords(channels: readonly string[]): string {
+  return `In "Today’s Stops" on the board${channels.length > 1 ? 's' : ''} of ${channels.join(', ')}`;
+}
+
 /**
  * The answer of a research report (plan 8R-1; design 4.3), for the reporter alone: the task and
  * its rewards, each stop (with the task it replaced: "was: Catch 7 Pokémon"; "again" for the
@@ -302,7 +311,7 @@ const dmMoreStops = (left: number): string => `- …and ${count(left, 'more stop
 
 /**
  * A research DM's stop lines (`stopMapLine`): whole lines while they fit `DM_STOP_ROOM` with the
- * line that would count the rest (as `fill` of the pinned post), `DM_STOPS_SHOWN` at most.
+ * line that would count the rest (as `fill` of the post of the stops), `DM_STOPS_SHOWN` at most.
  */
 function dmStopLines(
   stops: readonly Pick<ReportedStop, 'name' | 'address' | 'lat' | 'lon'>[],
diff --git a/src/render/rocket.test.ts b/src/render/rocket.test.ts
index 59d09745..78f3106e 100644
--- a/src/render/rocket.test.ts
+++ b/src/render/rocket.test.ts
@@ -228,7 +228,7 @@ describe('rocketAnswer', () => {
                 "type": 10,
               },
               {
-                "content": "-# In the post "Today’s Stops" of <#100000000000000011>, <#100000000000000012>, until midnight.",
+                "content": "-# In "Today’s Stops" on the boards of <#100000000000000011>, <#100000000000000012>, until midnight.",
                 "type": 10,
               },
               {
@@ -382,7 +382,7 @@ describe('rocketWords', () => {
       where: 'Posted in #west, #east; it goes away <t:1792593000:R>.',
     });
     expect(rocketWords(hideout, named).where).toBe(
-      'In the post "Today’s Stops" of #west, #east, until midnight.',
+      'In "Today’s Stops" on the boards of #west, #east, until midnight.',
     );
   });
 });
diff --git a/src/render/rocket.ts b/src/render/rocket.ts
index 58efd6fd..d07545b9 100644
--- a/src/render/rocket.ts
+++ b/src/render/rocket.ts
@@ -7,7 +7,13 @@ import type { ReportedStop, RocketDetail, RocketReport } from '../domain/stops/r
 import { wayspotPicture } from '../domain/wayspots/picture.js';
 import { cutText } from './party-post.js';
 import { mapMarkdown } from './raid-post.js';
-import { DISCORD_CHANNEL, stopLine, stopMapLine, type ChannelNamer } from './research.js';
+import {
+  boardWords,
+  DISCORD_CHANNEL,
+  stopLine,
+  stopMapLine,
+  type ChannelNamer,
+} from './research.js';
 import {
   memberByName,
   memberName,
@@ -137,13 +143,13 @@ export interface RocketAnswerView {
   report: RocketReport;
   /** The Rocket report at the stop it replaced, while that one stood. */
   replaced: RocketReport | undefined;
-  /** Whether it is a hideout (in the pinned posts), or a grunt (messages of its own). */
+  /** Whether it is a hideout (in the posts of the stops), or a grunt (messages of its own). */
   hideout: boolean;
   /** The region channels that hold the stop. */
   channels: readonly string[];
   /** The channels the grunt's message was posted in. */
   posted: readonly { channelId: string }[];
-  /** Rehearsal mode: nothing is posted, no pinned post is made. */
+  /** Rehearsal mode: nothing is posted, no post of the stops is made. */
   rehearsal: boolean;
   /** A hideout's end as a sentence ends (`periodEndWords`: `until midnight`). */
   until: string;
@@ -154,7 +160,7 @@ export interface RocketAnswerView {
 /**
  * The answer of a Rocket report (plan 8R-2; design 5.2), for the reporter alone: who, at which
  * stop, what can be caught, and what it replaced ("was: Arlo"; "again" for the same hideout);
- * where it shows (a grunt's messages and when they go; a hideout's pinned posts, until
+ * where it shows (a grunt's messages and when they go; a hideout's posts of the stops, until
  * midnight; in rehearsal mode only until when) and "Take back"
  * (`rocket:<id>:back:<stop key>:<who>:<made at>`).
  */
@@ -219,7 +225,7 @@ export function rocketWords(
       ? `It stands ${view.until}.`
       : view.channels.length === 0
         ? `It lies in no region now, so no post shows it; it stands ${view.until}.`
-        : `In the post "Today’s Stops" of ${channels(view.channels)}, ${view.until}.`;
+        : `${boardWords(view.channels.map(channel))}, ${view.until}.`;
   } else if (view.rehearsal) {
     where = `It stands until ${timestamp(report.endsAt, 't')} (rehearsal mode posts nothing).`;
   } else if (view.posted.length === 0) {
diff --git a/src/render/stop-post.ts b/src/render/stop-post.ts
index 81acb63c..32a060b6 100644
--- a/src/render/stop-post.ts
+++ b/src/render/stop-post.ts
@@ -17,7 +17,7 @@ import { count, memberByName, plain, timestamp } from './text.js';
 import { container, countComponents, section, separator, textDisplay, thumbnail } from './v2.js';
 
 /*
- * The pinned "Today’s Stops" post of a region channel (plan 8R-1; design 6, 9.5, 9.7):
+ * The post "Today’s Stops" (in the region's board) of a region channel (plan 8R-1; design 6, 9.5, 9.7):
  * research grouped by task, each with its rewards and its stops, then Team GO Rocket's hideouts
  * (plan 8R-2: Giovanni, Cliff, Arlo, Sierra, the decoy grunt, each with its stops), in
  * components-v2 messages of Discord's limits (40 components, `TEXT_BUDGET` of text), spilling
diff --git a/src/render/summary.ts b/src/render/summary.ts
index 8c073bab..4cc7dabf 100644
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -156,7 +156,7 @@ export interface ListedTrain {
 export const PASSING_HEADING = '**Passing through**';
 
 /**
- * The pinned post "Today’s Stops" of the region's channel (plan 8R-1), for its line in the
+ * The post "Today’s Stops" in the board of the region's channel (plan 8R-1), for its line in the
  * summary (plan 8X-G): the address of its first message, and how many tasks and hideouts it
  * names, as it names them.
  */
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index 948e3caf..83867b69 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -828,7 +828,7 @@ export class NotifyService implements PartyNotifier {
    * region, when they can view the channel; not the reporter. A member told of the task at a stop
    * in the period is not told of it there again (`researchTold`): a later report of the task at
    * more stops names only the new ones. The DM ends with the report and links to the message of
-   * the pinned post that holds the task (`researchPosts`; none in rehearsal mode).
+   * the post of the stops that holds the task (`researchPosts`; none in rehearsal mode).
    *
    * The task's line (R3) and the DMs' time (`eventAt`, and the start of `periodEndWords`; review
    * F6) are taken here, as the report is made (review R6): what is read before
@@ -1079,7 +1079,7 @@ export class NotifyService implements PartyNotifier {
    * most one an hour per member and grunt type (`MAX_WANT_QUIET_MS`, Matt's answer 3; the DM says
    * so), linking to its message in that channel; a hideout at the normal priority, never twice to
    * a member for the same hideout at the same stop in a day (`rocketTold`), linking to the
-   * message of the pinned post that holds it (`researchPosts`). No link in rehearsal mode.
+   * message of the post of the stops that holds it (`researchPosts`). No link in rehearsal mode.
    */
   rocketReported(news: RocketNews): void {
     this.safely('Team GO Rocket', () => {
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 135a5ead..9cfa36f4 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -726,7 +726,7 @@ export class PartyService {
   /** The snowflakes of the servers by their rows, as far as known (`guilds.snowflakeOf`). */
   private readonly snowflakes = new Map<number, string>();
 
-  /** The pinned posts of the stops (`StopPostService`), for the summary's line; none until set. */
+  /** The posts of the stops (`StopPostService`), for the summary's line; none until set. */
   private stopPosts: StopPostsForSummary | undefined;
   /** The parties whose posts wait to be shown with other emoji, and the timer of the next. */
   private emojiQueue: string[] = [];
@@ -2274,7 +2274,7 @@ export class PartyService {
   }
 
   /**
-   * The pinned posts of the stops (plan 8X-G): the summary links the post of its region's channel
+   * The posts of the stops (plan 8X-G): the summary links the post of its region's channel
    * today, with its counts. Set by the app once the service of the stops is made (none in
    * rehearsal mode); it tells `summaryChanged` when a post changes.
    */
diff --git a/src/services/raid-event-service.ts b/src/services/raid-event-service.ts
index 92f4aacb..b3c44d20 100644
--- a/src/services/raid-event-service.ts
+++ b/src/services/raid-event-service.ts
@@ -118,7 +118,7 @@ export interface ResearchEventProvider {
   researchEvents(): readonly ResearchEvent[];
   /**
    * Calls `listener` whenever the research events change (a read, the kept ones loaded): the
-   * pinned posts' timer and their periods follow (review A5). A listener must not throw.
+   * posts' timer and their periods follow (review A5). A listener must not throw.
    */
   onResearchChange?(listener: () => void): void;
 }
diff --git a/src/services/rocket-reports.ts b/src/services/rocket-reports.ts
index 267f6469..4ad4e309 100644
--- a/src/services/rocket-reports.ts
+++ b/src/services/rocket-reports.ts
@@ -14,7 +14,7 @@ import { isHideoutReport, type RocketSubject, type StopReportService } from './s
 /**
  * A Rocket report that is news to members who want it (plan 8R-2; design 7): the report, and
  * per region channel that holds its stop the grunt's message there (none for a hideout, which
- * the pinned post shows, and none in rehearsal mode).
+ * the post of the stops shows, and none in rehearsal mode).
  */
 export interface RocketNews {
   serverId: string;
diff --git a/src/services/stop-reports.ts b/src/services/stop-reports.ts
index 2a3b04cf..07faad2c 100644
--- a/src/services/stop-reports.ts
+++ b/src/services/stop-reports.ts
@@ -90,7 +90,7 @@ export type RocketOutcome =
 export interface StopReportListener {
   /**
    * Reports were made or taken back in a server, at these stops (and where a report replaced
-   * another, that one's stop too): the pinned posts of the regions they lie in are drawn anew.
+   * another, that one's stop too): the posts of the stops of the regions they lie in are drawn anew.
    * Not told of grunts, which no post shows.
    */
   changed?(serverId: string, stops: readonly ReportedStop[]): void;
diff --git a/src/web/server.ts b/src/web/server.ts
index 0d5be93f..82e92f57 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -75,7 +75,7 @@ export interface WebDeps {
   tool: ToolWebDeps;
   /**
    * The square pictures of the reports at stops (plan 8R-6, `StopPictures`): `/pictures/`, and
-   * the address of a hideout's picture on the map, as the pinned post names it.
+   * the address of a hideout's picture on the map, as the post of the stops names it.
    */
   pictures: Pick<StopPictures, 'read' | 'url'>;
   now: () => number;
diff --git a/src/web/stop-report-post.test.ts b/src/web/stop-report-post.test.ts
index 4bdf24ef..11d15489 100644
--- a/src/web/stop-report-post.test.ts
+++ b/src/web/stop-report-post.test.ts
@@ -352,7 +352,7 @@ describe('reports at stops from the map', () => {
       expect(answer.json.text).toBe(
         'Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew\n' +
           '- Yellow Mural\n- Paititi Inti\n' +
-          'In the post "Today’s Stops" of #west, until midnight.',
+          'In "Today’s Stops" on the board of #west, until midnight.',
       );
       expect(
         answer.json.research?.map((one) => [one.stop.name, one.reporter, one.mayTakeBack]),
diff --git a/src/web/stop-reports.test.ts b/src/web/stop-reports.test.ts
index 364e423a..5342d516 100644
--- a/src/web/stop-reports.test.ts
+++ b/src/web/stop-reports.test.ts
@@ -31,7 +31,7 @@ const ALICE_AS = { id: ALICE, name: 'Alice' };
 
 /**
  * The map of the fakes' server over the stop reports' services, Alice and Bob members, the clock
- * at `STOP_NOON` (Date faked to it too); the pinned posts hold every task in a message of their
+ * at `STOP_NOON` (Date faked to it too); the posts of the stops hold every task in a message of their
  * own (`posts`), unless `posts` makes the real ones of the context.
  */
 async function setup(
@@ -108,7 +108,7 @@ describe('the reports at stops on the map', () => {
       ['Yellow Mural', DRAGON.text, 'Alice', true],
       ['East Fountain', DRAGON.text, 'Alice', true],
     ]);
-    // The pinned post's message that holds the task, in the region the stop lies in.
+    // The board's message that holds the task, in the region the stop lies in.
     expect(view.research[0]?.link).toBe(
       `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/01${String(DRAGON.key.length)}`,
     );
@@ -129,7 +129,7 @@ describe('the reports at stops on the map', () => {
     ]);
   });
 
-  it('names a hideout’s picture as the pinned post does, none where it is gone (plan 8R-6)', async () => {
+  it('names a hideout’s picture as the post of the stops does, none where it is gone (plan 8R-6)', async () => {
     const made = await setup(undefined, {
       read: () => Promise.resolve(undefined),
       url: (source) => (source === LEADER_PORTRAITS.arlo ? undefined : source),
diff --git a/src/web/stop-routes.ts b/src/web/stop-routes.ts
index 951e73b2..3157375c 100644
--- a/src/web/stop-routes.ts
+++ b/src/web/stop-routes.ts
@@ -143,7 +143,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
 
   /**
    * The view of a member (`stopReportView`): each report in the regions the member sees, with
-   * its link there (the message of the pinned post that holds a task or a hideout; a grunt's own
+   * its link there (the message of the post of the stops that holds a task or a hideout; a grunt's own
    * message, every grunt's read in one go).
    */
   const viewFor = async (
````

