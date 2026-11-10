# Phase 8R-9F: The Region's Board Takes Commands: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** members report where they see what is already reported: the board post "Today and coming up" is open to commands, and Pine keeps it tidy (design agreed with Matt and reviewed, 2026-10-27).

- **Task 1, the board open and kept tidy:** the board unlocked once (at creation, take-over, the first draw of a board 8R-9 locked, `/admin setup-forums`) with 6 hours of slowmode, which is also Pine's mark; a moderator's later lock left alone. `BoardKeeper` deletes what members write there (moderators with Manage Messages kept), with a DM at most once a day per member, and sweeps the boards at start and on reconnect; the pin checked after a delete. The board's permissions split into writing, pinning and cleaning; Manage Messages missing is a `cutover-check` warning.
- **Task 2, screenshots in the board:** a mention (or, where `ocr.passive` is on, a passive) screenshot in the board is downloaded, its message taken out, then read by the same decisions as in the channel; the answer is one plain DM, worded by whether the message was deleted, kept or could not be deleted, pointing to `/raid screenshot:` or `/max screenshot:` where the reader was unsure.
- **Task 3, the stops' cap, M1 and M2:** "Today’s Stops" spills into up to ten messages instead of three; Coming up names a party's kind once ("Meetup · …", "Gigantamax Train · …"); a text-channel line that finds a deleted board waits for the remade board's message (once, until the day's end, and not across a restart).
- **Task 4, words and docs:** `/research`'s and `/rocket`'s help, the guides and the runbook (Manage Messages in the forum), the area docs, and the staging checklist `2026-10-27-phase-8r9f-staging.md`.

**Tech stack:** TypeScript 6.0, Node 24, discord.js 14, Kysely, Vitest. No new dependency, no migration, no command option changed (no deploy needed).

**Spec:** `docs/superpowers/specs/2026-10-27-region-board-commands-design.md` (its Review B1–B11, Matt's answers Q1, Q2 and R1–R3), and the brief `.superpowers/sdd/region-board-commands/brief.md` (git-ignored).

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-boardf` (tip `2b394a8f`), one commit per task, on typescript-migration `ba399791`. Each commit typechecks and passes its tests; on the tip the full check passes (10,152 tests), the build passes and the database suite passes (611 tests).

**Reviews:**

- **The prototype:** an Opus reviewer (F1: the screenshot DM said the message was taken out when it was kept or could not be deleted; F2: any slowmode read as Pine's mark, so a forum's default post slowmode kept an 8R-9 board locked for good; seven Minor: downloads one after another, waiting lines kept across a restart, a sweep test with one board, a DM cut inside a link, a silent shutdown, stale comments, "Gigantamax Train · Train"). Folded into the four commits.
- **The fix round:** an Opus re-review, ready; one Minor left for the follow-ups (a message already gone asks no pin check).

**Conventions:** read `CLAUDE.md` and `docs/architecture/stop-reports.md`, `parties-and-posts.md`, `screenshots.md`, `discord-framework.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck and its own test files. The full check, the build and the database suite run once on the tip. Work in `.claude/worktrees/region-board-commands` on `region-board-commands`; never commit in the main checkout.

## Review Focus

- A board locked by 8R-9, by a forum's default slowmode, or by a moderator: only the first two are opened (task 1, `party-service.test`).
- A member's message, a moderator's, the bot's and a system message in the board, live and in the sweep after a restart: only the member's goes, with one DM a day (task 1, `board-keeper.test`).
- A screenshot in the board: downloaded before the delete, the DM by outcome, no reply or reaction in the board (task 2, `mention.board.test`).
- A busy day of more than three messages of stops: order kept by the send log, hideouts not cut (task 3, `stop-post.test`, `stop-posts.test`).
- A report that finds a deleted board: its line sent once the board is drawn again, let go at the day's end or at shutdown (task 3, `stop-lines.test`).

---

## Tasks


### Task 1: 8R-9F task 1: the board open to members and kept tidy

Prototype commit: `5e2fd666d8de77246436a19304494a35113219ec`

The region's board is no longer locked: made, taken over and drawn open
once (R2), with six hours of slowmode, which also marks a board Pine has
opened; a moderator's later lock is left alone and setup-forums says so.
BoardKeeper deletes what anybody but the bot writes in the board (other
applications too, Discord's own messages kept, a member with Manage
Messages kept, Q1), tells the member by DM once a local day (Q2), asks
the summary's pin check after a delete (B7), and sweeps each board's
newest hundred messages at start and on reconnect (B6, bulk delete).
Writing in the open board needs Send Messages in Threads only (B5);
Manage Messages in the forum is an optional need (cutover-check warns,
R3), and setup-forums says where it is missing.

**Files:**

```
 src/app.ts                               |  29 ++++++++-
 src/commands/admin/setup-forums.test.ts  |  63 ++++++++++++-------
 src/commands/admin/setup-forums.ts       |  92 +++++++++++++++++-----------
 src/config/settings.ts                   |   2 +-
 src/db/repositories/region-repository.ts |   6 +-
 src/discord/board-message.ts             |  25 ++++++++
 src/discord/party-gateway.test.ts        | 162 ++++++++++++++++++++++++++++++++++++++++++++++++
 src/discord/party-gateway.ts             | 147 ++++++++++++++++++++++++++++++++++++++------
 src/ops/cutover-check.test.ts            |  20 ++++++
 src/ops/permissions.ts                   |  19 +++++-
 src/render/board-words.ts                |  16 +++++
 src/render/research.ts                   |   2 +-
 src/render/summary.ts                    |   3 +-
 src/services/board-keeper.test.ts        | 190 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/board-keeper.ts             | 238 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/party-service.test.ts       | 119 +++++++++++++++++++++++++++---------
 src/services/party-service.ts            | 124 +++++++++++++++++++++++--------------
 src/services/stop-posts.test.ts          |  17 +++++-
 src/services/stop-posts.ts               |   4 +-
 test/support/fake-gateway.ts             | 118 ++++++++++++++++++++++++++++++++---
 20 files changed, 1221 insertions(+), 175 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/admin/setup-forums.test.ts src/discord/party-gateway.test.ts src/ops/cutover-check.test.ts src/services/board-keeper.test.ts src/services/party-service.test.ts src/services/stop-posts.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 5e2fd666d8de77246436a19304494a35113219ec -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md docs/superpowers/plans/2026-10-27-phase-8r9f-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-9F task 1: the board open to members and kept tidy`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index c960a6b0..a21af091 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -52,6 +52,8 @@ import { DiscordWebMembers } from './discord/web-members.js';
 import { Throttles } from './discord/throttle.js';
 import { DiscordRoleGateway } from './discord/role-gateway.js';
 import { postedMessage } from './discord/screenshot-message.js';
+import { postedBoardMessage } from './discord/board-message.js';
+import { BoardKeeper } from './services/board-keeper.js';
 import { DiscordApplicationEmoji } from './discord/application-emoji.js';
 import { DiscordPartyGateway } from './discord/party-gateway.js';
 import { syncGuilds } from './discord/guild-sync.js';
@@ -988,6 +990,18 @@ export async function startApp(
   });
   // Screenshots posted in a region channel with a mention of the bot (or, passive, without).
   const screenshotTrigger = new ScreenshotTrigger({ ctx });
+  // The region's board is open to members' commands, and what they write there is deleted
+  // (plan 8R-9F); after a delete the summary checks its pin (B7).
+  const boardKeeper = new BoardKeeper({
+    regions,
+    gateway: partyGateway,
+    dms: memberDms,
+    zone: config.settings.timezone,
+    log,
+    changed: (regionId) => {
+      partyService.summaryChanged(regionId, true);
+    },
+  });
   // Resolved by the client that ends up connected (the login may try several).
   let markConnected: () => void = () => undefined;
   const connected = new Promise<void>((resolve) => {
@@ -1070,6 +1084,13 @@ export async function startApp(
       // Only that a member wrote, and where: the archive warning of a busy post is said again.
       // Bots (this one, others, webhooks) do not count.
       client.on(Events.MessageCreate, (message) => {
+        // The board first, before the bot filter (plan 8R-9F, B3): other applications' and
+        // webhooks' messages go too. Nothing of a board's message goes further.
+        try {
+          if (boardKeeper.posted(postedBoardMessage(message)) !== 'elsewhere') return;
+        } catch (err) {
+          log.error({ err }, 'could not look at a message in the board');
+        }
         if (message.author.bot) return;
         scheduler.activity(message.channelId);
         // Only a message with an attachment can be a screenshot; the trigger decides the rest.
@@ -1122,7 +1143,7 @@ export async function startApp(
         zone: config.settings.timezone,
         log,
         // The region's summary links the post with its counts (plan 8X-G); a draw in the board
-        // may have opened it, so its pin and lock are checked too (plan 8R-9, B4).
+        // may have opened it, so its pin is checked too (plan 8R-9, B4).
         changed: (channelId) => {
           const region = regions.byChannel(channelId);
           if (region) partyService.summaryChanged(region.id, true);
@@ -1170,6 +1191,8 @@ export async function startApp(
       ...(stopPosts ? [{ name: 'stop posts', run: () => stopPosts.catchUp().then(done) }] : []),
       // The lines of ended days whose delete failed meanwhile (plan 8R-9, review P1).
       ...(stopLines ? [{ name: 'stop lines', run: () => stopLines.sweep().then(done) }] : []),
+      // What members wrote in the boards while the gateway was away (plan 8R-9F, B6).
+      { name: 'boards', run: () => boardKeeper.sweep().then(done) },
       { name: 'raid bosses', run: () => raidBosses.catchUp() },
       { name: 'max bosses', run: () => maxBosses.catchUp() },
       { name: 'events', run: () => raidEvents.catchUp() },
@@ -1188,6 +1211,10 @@ export async function startApp(
       ?.start()
       .catch((err: unknown) => log.error({ err }, 'could not start the posts of the stops')),
   );
+  // What members wrote in the boards while the bot was stopped (plan 8R-9F, B6).
+  void connected.then(() =>
+    boardKeeper.sweep().catch((err: unknown) => log.error({ err }, 'could not tidy the boards')),
+  );
   void connected.then(() =>
     stopLines
       ?.start()
diff --git a/src/commands/admin/setup-forums.test.ts b/src/commands/admin/setup-forums.test.ts
index 17c2c8e3..32203940 100644
--- a/src/commands/admin/setup-forums.test.ts
+++ b/src/commands/admin/setup-forums.test.ts
@@ -68,7 +68,7 @@ describe('/admin setup-forums', () => {
     expect(gateway.hidden.has(north)).toBe(true);
     expect(gateway.hidden.has(WEST_FORUM)).toBe(false);
     expect(sent(interaction.editReply).content?.split(NEWLINE)).toEqual([
-      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted, pinned and locked the board, hid it from all but staff and the testers.`,
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the board, hid it from all but staff and the testers.`,
       'Rehearsal mode: only the regions north get a forum, which only staff and the testers see.',
     ]);
   });
@@ -116,9 +116,9 @@ describe('/admin setup-forums', () => {
     }
     expect(interaction.deferReply).toHaveBeenCalled();
     expect(sent(interaction.editReply).content?.split('\n')).toEqual([
-      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted, pinned and locked the board.`,
-      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted, pinned and locked the board.`,
-      `<#${UNBOUNDED_CHANNEL}>: created <#${north?.forumChannelId}>, closed it to posts by members, posted, pinned and locked the board.`,
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and pinned the board.`,
+      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted and pinned the board.`,
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north?.forumChannelId}>, closed it to posts by members, posted and pinned the board.`,
     ]);
   });
 
@@ -171,7 +171,7 @@ describe('/admin setup-forums', () => {
     const interaction = await run();
     const lines = sent(interaction.editReply).content?.split(NEWLINE) ?? [];
     expect(lines[0]).toBe(
-      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, posted, pinned and locked the board. ` +
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, posted and pinned the board. ` +
         'I could not close it to posts by members (I need Manage Permissions and Send Messages there; see the log).',
     );
     expect(lines[1]).toContain('closed it to posts by members');
@@ -282,7 +282,7 @@ describe('/admin setup-forums', () => {
     const text = sent((await run()).editReply).content ?? '';
     expect(text).toContain(
       `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted the ` +
-        'board (I could not pin or lock it: give me Manage Posts there).',
+        'board (I could not pin it or open it to members: give me Manage Posts there).',
     );
     expect(
       gateway.posts.get(regions.byChannel(WEST_CHANNEL)?.summaryMessageId ?? ''),
@@ -304,8 +304,8 @@ describe('/admin setup-forums', () => {
     gateway.refusePosts.set(EAST_FORUM, ['Create Posts']);
     const text = sent((await run()).editReply).content ?? '';
     expect(text).toContain(
-      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted, ` +
-        'pinned and locked the board.',
+      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted and ` +
+        'pinned the board.',
     );
     expect(gateway.posts.has(regions.byChannel(EAST_CHANNEL)?.summaryMessageId ?? '')).toBe(true);
   });
@@ -314,38 +314,57 @@ describe('/admin setup-forums', () => {
     const { run, gateway } = await setup();
     gateway.failing.set('pinPost', new Error('Discord is away'));
     expect(sent((await run()).editReply).content).toContain(
-      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and ` +
-        'locked the board (I could not pin it; see the log).',
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted ` +
+        'the board (I could not pin it; see the log).',
     );
   });
 
-  it('says so when the board could not be locked (review P12)', async () => {
+  it('says so when the board could not be opened to members (review P12; plan 8R-9F)', async () => {
     const { run, gateway } = await setup();
-    gateway.failing.set('lockPost', new Error('Discord is away'));
+    gateway.failing.set('openBoard', new Error('Discord is away'));
     expect(sent((await run()).editReply).content).toContain(
       `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and ` +
-        'pinned the board (I could not lock it; see the log).',
+        'pinned the board (I could not open it to members; see the log).',
     );
   });
 
-  it('locks a board that stands, and says so when it could not (review W3)', async () => {
+  it('opens a board plan 8R-9 locked, and says when it could not or a moderator locked it (R2)', async () => {
     const { run, gateway, regions } = await setup();
     await run();
     const board = gateway.posts.get(regions.byChannel(WEST_CHANNEL)?.summaryMessageId ?? '')!;
-    board.locked = false;
-    gateway.failing.set('lockPost', missingPermissions('PATCH'));
+    // As plan 8R-9 left it: locked, without slowmode.
+    board.locked = true;
+    board.slowmode = 0;
+    gateway.failing.set('openBoard', missingPermissions('PATCH'));
     expect(sent((await run()).editReply).content).toContain(
-      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, the board is not locked (I could not lock ` +
-        'it: give me Manage Posts there).',
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, the board is not open to members (I could ` +
+        'not open it: give me Manage Posts there).',
     );
-    // Locked again where it may: nothing more is said.
+    // Opened where it may: nothing more is said.
     gateway.failing.clear();
     expect(sent((await run()).editReply).content).toContain(
       `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready.`,
     );
+    expect(board).toMatchObject({ locked: false, slowmode: 21_600 });
+    // A moderator locks it: left so, and said.
+    board.locked = true;
+    expect(sent((await run()).editReply).content).toContain(
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, the board is locked, so members cannot use ` +
+        'commands in it (a moderator locked it; unlock it to let them).',
+    );
     expect(board.locked).toBe(true);
   });
 
+  it('says where it may not delete what members write in the board (plan 8R-9F)', async () => {
+    const { run, gateway } = await setup();
+    gateway.noManaging.add(WEST_FORUM);
+    expect(sent((await run()).editReply).content).toContain(
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and ` +
+        'pinned the board, but I may not delete what members write in it (give me Manage ' +
+        'Messages there).',
+    );
+  });
+
   it('reports a forum that already belongs to another region', async () => {
     const { run, regions } = await setup();
     regions.setForum = () => Promise.resolve('forum-taken' as const);
@@ -497,7 +516,7 @@ describe('/admin setup-forums', () => {
     const interaction = await run(['Admin', 'Moderator']);
     const north = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
     expect(sent(interaction.editReply).content?.split(NEWLINE)[0]).toBe(
-      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted, pinned and locked the board, it is hidden from all but staff and the testers (without Use External Emojis there, which only its category gives me; see the log).`,
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the board, it is hidden from all but staff and the testers (without Use External Emojis there, which only its category gives me; see the log).`,
     );
   });
 
@@ -517,7 +536,7 @@ describe('/admin setup-forums', () => {
     gateway.noHiding.add(WEST_FORUM);
     const first = sent((await run(['Admin', 'Moderator'])).editReply).content?.split(NEWLINE)[0];
     expect(first).toBe(
-      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted, pinned and locked the board, it was already hidden from members (Discord refused to set its permissions; see the log).`,
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and pinned the board, it was already hidden from members (Discord refused to set its permissions; see the log).`,
     );
   });
 
@@ -552,7 +571,7 @@ describe('/admin setup-forums', () => {
     const interaction = await run(['Admin', 'Moderator']);
     const north = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
     expect(sent(interaction.editReply).content?.split(NEWLINE)).toEqual([
-      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted, pinned and locked the board, hid it from all but staff and the testers.`,
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the board, hid it from all but staff and the testers.`,
       'Rehearsal mode: only the regions north get a forum, which only staff and the testers see.',
       'I could not check that every region of settings.rehearsal.regions names a region channel of this server (see the log).',
     ]);
diff --git a/src/commands/admin/setup-forums.ts b/src/commands/admin/setup-forums.ts
index 52a8f890..7b9800b9 100644
--- a/src/commands/admin/setup-forums.ts
+++ b/src/commands/admin/setup-forums.ts
@@ -31,46 +31,51 @@ const HIDE_BY_HAND =
   '(my member or my own role), the staff roles (those settings.rehearsal.staffRoles names, and ' +
   'every role with Manage Server or Administrator) and the testers.';
 
+/** Why the board could not be pinned or opened: the permission, or the log (review P12). */
+function whyNot({ unpinned, closed }: Pick<ForumSetup, 'unpinned' | 'closed'>): string {
+  return unpinned === 'refused' || closed === 'refused'
+    ? ': give me Manage Posts there'
+    : '; see the log';
+}
+
 /**
- * A new board (plan 8R-9: the summary post, locked), and whether it could be pinned and locked
- * (review P12; Discord refuses both without Manage Posts): what was done, then what was not and
- * why (`refused`: the permission; `failed`: see the log).
+ * A new board (plan 8R-9: the summary post; open to members since plan 8R-9F), and whether it
+ * could be pinned and opened (review P12; Discord refuses both without Manage Posts): what was
+ * done, then what was not and why.
  */
-function summaryWords({ unpinned, unlocked }: Pick<ForumSetup, 'unpinned' | 'unlocked'>): string {
-  const done = [
-    'posted',
-    ...(unpinned === undefined ? ['pinned'] : []),
-    ...(unlocked === undefined ? ['locked'] : []),
-  ];
-  const didWords =
-    done.length < 3
-      ? done.join(' and ')
-      : `${done.slice(0, -1).join(', ')} and ${done.at(-1) ?? ''}`;
-  const not = [...(unpinned ? ['pin'] : []), ...(unlocked ? ['lock'] : [])];
+function summaryWords(result: Pick<ForumSetup, 'unpinned' | 'closed'>): string {
+  const { unpinned, closed } = result;
+  const didWords = unpinned === undefined ? 'posted and pinned' : 'posted';
+  const not = [...(unpinned ? ['pin it'] : []), ...(closed ? ['open it to members'] : [])];
   if (not.length === 0) return `${didWords} the board`;
-  const why =
-    unpinned === 'refused' || unlocked === 'refused'
-      ? ': give me Manage Posts there'
-      : '; see the log';
-  return `${didWords} the board (I could not ${not.join(' or ')} it${why})`;
+  return `${didWords} the board (I could not ${not.join(' or ')}${whyNot(result)})`;
 }
 
 /**
- * A board that stood and could not be pinned or locked again (review W3: a moderator unpinned or
- * unlocked it); nothing where it is both, or was made so now.
+ * A board that stood and could not be pinned or opened (review W3: a moderator unpinned it; plan
+ * 8R-9F, R2: one plan 8R-9 locked), or that a moderator locked after Pine opened it (left so);
+ * nothing where it is pinned and open.
  */
-function standingBoardWords({
-  unpinned,
-  unlocked,
-}: Pick<ForumSetup, 'unpinned' | 'unlocked'>): string[] {
-  const not = [...(unpinned ? ['pin'] : []), ...(unlocked ? ['lock'] : [])];
-  if (not.length === 0) return [];
-  const state = [...(unpinned ? ['pinned'] : []), ...(unlocked ? ['locked'] : [])];
-  const why =
-    unpinned === 'refused' || unlocked === 'refused'
-      ? ': give me Manage Posts there'
-      : '; see the log';
-  return [`the board is not ${state.join(' or ')} (I could not ${not.join(' or ')} it${why})`];
+function standingBoardWords(result: Pick<ForumSetup, 'unpinned' | 'closed'>): string[] {
+  const { unpinned, closed } = result;
+  return [
+    ...(unpinned ? [`the board is not pinned (I could not pin it${whyNot(result)})`] : []),
+    ...(closed === 'locked'
+      ? [
+          'the board is locked, so members cannot use commands in it (a moderator locked it; ' +
+            'unlock it to let them)',
+        ]
+      : closed
+        ? [`the board is not open to members (I could not open it${whyNot(result)})`]
+        : []),
+  ];
+}
+
+/** Where the bot may not delete what members write in the board (plan 8R-9F). */
+function cleaningWords({ cleaning }: Pick<ForumSetup, 'cleaning'>): string {
+  return cleaning === false
+    ? ', but I may not delete what members write in it (give me Manage Messages there)'
+    : '';
 }
 
 function line(result: ForumSetup): string {
@@ -104,7 +109,17 @@ function line(result: ForumSetup): string {
         ]),
     ...(result.renamed ? ['renamed it'] : []),
     ...(result.posting === 'reserved' ? ['closed it to posts by members'] : []),
-    ...(result.summary ? [summaryWords(result)] : standingBoardWords(result)),
+    ...(result.summary
+      ? [`${summaryWords(result)}${cleaningWords(result)}`]
+      : [
+          ...standingBoardWords(result),
+          ...(result.cleaning === false
+            ? [
+                'I may not delete what members write in the board (give me Manage Messages ' +
+                  'there)',
+              ]
+            : []),
+        ]),
     ...(result.hidden === 'hidden'
       ? [
           result.refused === undefined
@@ -174,9 +189,12 @@ export const setupForums: SubcommandPart = {
       'For each region of this server: creates the forum for its raids, max battles, trains ' +
       "and meetups next to the region's channel if it has none (named after the channel, " +
       '`-board`; a forum of another one-word ending is renamed), adds the tags that are missing, ' +
-      'and posts, pins and locks the board ("Today and coming up", with "Today’s Stops" below ' +
-      'it). It changes nothing else that is already there, so it is safe to run again. A forum ' +
-      'whose region is gone is named and left alone.',
+      'and posts and pins the board ("Today and coming up", with "Today’s Stops" below it). ' +
+      'Members can use commands in the board; what they write there is deleted (I need Manage ' +
+      'Messages in the forum). A board that stands is pinned again, and one locked before ' +
+      'members could use it is opened once; a lock a moderator sets later stays. Nothing else ' +
+      'that is already there changes, so it is safe to run again. A forum whose region is gone ' +
+      'is named and left alone.',
     examples: ['/admin setup-forums'],
   },
   defer: 'ephemeral',
diff --git a/src/config/settings.ts b/src/config/settings.ts
index c728f737..6d621765 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -235,7 +235,7 @@ const settingsObject = z.strictObject({
   /**
    * What the name of a region's forum adds to the name of the region's channel (`north` gets
    * the forum `north-board`; `-meetups` before plan 8R-9): the forum is the region's board, with
-   * the raids, max battles, trains and meetups of the region and its locked post "Today and coming
+   * the raids, max battles, trains and meetups of the region and its pinned post "Today and coming
    * up". `/admin setup-forums` and `/region import` name new forums so, and rename a forum whose
    * name is the region's with another one-word ending (`north-meetups`); a name chosen by hand
    * stays.
diff --git a/src/db/repositories/region-repository.ts b/src/db/repositories/region-repository.ts
index 3fcd99d8..7de1c087 100644
--- a/src/db/repositories/region-repository.ts
+++ b/src/db/repositories/region-repository.ts
@@ -17,9 +17,9 @@ export interface Region {
   /** The forum that holds the region's party posts; null until `/admin setup-forums` made one. */
   forumChannelId: string | null;
   /**
-   * The region's board in that forum (plan 8R-9): the locked, pinned post "Today and coming up"
-   * ("Going on now" before plan 8R-9, "Active raids" before plan 8X-G), with "Today’s Stops" under
-   * it.
+   * The region's board in that forum (plan 8R-9): the pinned post "Today and coming up" ("Going
+   * on now" before plan 8R-9, "Active raids" before plan 8X-G), with "Today’s Stops" under it;
+   * open to members' commands since plan 8R-9F.
    */
   summaryMessageId: string | null;
 }
diff --git a/src/discord/board-message.ts b/src/discord/board-message.ts
new file mode 100644
index 00000000..16d1f1d5
--- /dev/null
+++ b/src/discord/board-message.ts
@@ -0,0 +1,25 @@
+import type { Message } from 'discord.js';
+import type { PostedBoardMessage } from '../services/board-keeper.js';
+
+/**
+ * A message as the board's keeper sees it (plan 8R-9F, `BoardKeeper.posted`), over discord.js:
+ * where, by whom (this bot, another application or a webhook, a member) and whether it is
+ * Discord's own. `GuildMessages` gives all of it without Message Content. Like
+ * `screenshot-message.ts` it has no unit tests: the staging run is its test.
+ */
+export function postedBoardMessage(message: Message): PostedBoardMessage {
+  return {
+    id: message.id,
+    channelId: message.channelId,
+    guildId: message.guildId,
+    authorId: message.author.id,
+    by:
+      message.author.id === message.client.user.id
+        ? 'me'
+        : message.author.bot || message.webhookId !== null
+          ? 'bot'
+          : 'member',
+    system: message.system,
+    createdAt: message.createdTimestamp,
+  };
+}
diff --git a/src/discord/party-gateway.test.ts b/src/discord/party-gateway.test.ts
index 3bf83d91..12f23e28 100644
--- a/src/discord/party-gateway.test.ts
+++ b/src/discord/party-gateway.test.ts
@@ -1177,6 +1177,168 @@ describe('DiscordPartyGateway: the region’s locked board post (plan 8R-9)', ()
   });
 });
 
+describe('DiscordPartyGateway: the region’s open board (plan 8R-9F)', () => {
+  const ALL =
+    PermissionFlagsBits.ViewChannel |
+    PermissionFlagsBits.SendMessagesInThreads |
+    PermissionFlagsBits.ManageThreads |
+    PermissionFlagsBits.ManageMessages |
+    PermissionFlagsBits.EmbedLinks;
+  /** A message of the board as discord.js gives it: by this bot, another bot, a webhook, a member. */
+  interface Written {
+    id: string;
+    author: string;
+    bot?: boolean;
+    webhook?: boolean;
+    system?: boolean;
+    createdTimestamp?: number;
+  }
+  /**
+   * The board post (a thread) in a forum that gives the bot `has`: archived or not, locked or
+   * not, with a slowmode, the messages written in it (newest first, as Discord gives them) and
+   * the members of its server, each with Manage Messages there or not.
+   */
+  function board({
+    has = ALL,
+    archived = false,
+    locked = false,
+    slowmode = 0,
+    written = [] as Written[],
+    managers = [] as string[],
+  } = {}) {
+    const calls: string[] = [];
+    const me = { id: 'bot' };
+    const thread = {
+      id: 'p',
+      name: 'Today and coming up',
+      appliedTags: [] as string[],
+      flags: { has: () => true },
+      archived,
+      locked,
+      rateLimitPerUser: slowmode,
+      guild: {
+        members: {
+          me,
+          fetch: ({ user, force }: { user: string; force: boolean }) => {
+            calls.push(`member ${user}${force ? ' fresh' : ''}`);
+            if (user === 'gone') return Promise.reject(apiError(RESTJSONErrorCodes.UnknownMember));
+            return Promise.resolve({ id: user });
+          },
+        },
+      },
+      parent: {
+        permissionsFor: (member: unknown) => (member === me ? new PermissionsBitField(has) : null),
+      },
+      permissionsFor: (member: { id: string }) =>
+        new PermissionsBitField(
+          managers.includes(member.id) ? PermissionFlagsBits.ManageMessages : 0n,
+        ),
+      isTextBased: () => true,
+      isThread: () => true,
+      setArchived: (value: boolean) => {
+        calls.push(`archived ${String(value)}`);
+        thread.archived = value;
+        return Promise.resolve(thread);
+      },
+      edit: (options: Record<string, unknown>) => {
+        if (thread.archived)
+          return Promise.reject(apiError(RESTJSONErrorCodes.InvalidActionOnArchivedThread));
+        calls.push(`edit ${JSON.stringify(options)}`);
+        return Promise.resolve(thread);
+      },
+      messages: {
+        fetch: ({ limit }: { limit: number }) => {
+          calls.push(`fetch ${String(limit)}`);
+          return Promise.resolve(
+            new Map(
+              written.slice(0, limit).map((one) => [
+                one.id,
+                {
+                  id: one.id,
+                  author: { id: one.author, bot: one.bot === true || one.author === 'bot' },
+                  webhookId: one.webhook === true ? 'w' : null,
+                  system: one.system === true,
+                  createdTimestamp: one.createdTimestamp ?? 0,
+                },
+              ]),
+            ),
+          );
+        },
+      },
+      bulkDelete: (ids: string[]) => {
+        calls.push(`bulk ${ids.join(',')}`);
+        return Promise.resolve(new Map(ids.map((id) => [id, {}])));
+      },
+    };
+    const gateway = new DiscordPartyGateway();
+    gateway.use({
+      channels: { fetch: () => Promise.resolve(thread), cache: new Map([['p', thread]]) },
+      user: me,
+    } as unknown as Client);
+    return { gateway, calls, thread };
+  }
+
+  it('opens the board to members once: unlocked, with six hours of slowmode, opened first where archived (R2, B4)', async () => {
+    const { gateway, calls } = board({ archived: true, locked: true });
+    await expect(gateway.openBoard('p')).resolves.toBe(true);
+    expect(calls).toEqual([
+      'archived false',
+      `edit ${JSON.stringify({ locked: false, rateLimitPerUser: 21_600 })}`,
+    ]);
+  });
+
+  it('says whether the board is locked and its slowmode (R2)', async () => {
+    await expect(board({ locked: true, slowmode: 21_600 }).gateway.postInfo('p')).resolves.toEqual({
+      title: 'Today and coming up',
+      tagIds: [],
+      pinned: true,
+      locked: true,
+      slowmode: 21_600,
+    });
+  });
+
+  it('writes in an open board without Manage Posts, in a locked one only with it (B5)', async () => {
+    const without = ALL & ~PermissionFlagsBits.ManageThreads;
+    expect(await board({ has: without }).gateway.postAccess('p')).toBe('v2');
+    expect(await board({ has: without, locked: true }).gateway.postAccess('p')).toBe('refused');
+    expect(await board({ locked: true }).gateway.postAccess('p')).toBe('v2');
+  });
+
+  it('reads the board’s newest messages, by whom, and which are Discord’s own (B6)', async () => {
+    const { gateway, calls } = board({
+      written: [
+        { id: '5', author: 'member', createdTimestamp: 50 },
+        { id: '4', author: 'other-app', bot: true },
+        { id: '3', author: 'hook', webhook: true },
+        { id: '2', author: 'bot', system: true },
+        { id: '1', author: 'bot' },
+      ],
+    });
+    await expect(gateway.boardMessages('p', 100)).resolves.toEqual([
+      { id: '5', authorId: 'member', by: 'member', system: false, createdAt: 50 },
+      { id: '4', authorId: 'other-app', by: 'bot', system: false, createdAt: 0 },
+      { id: '3', authorId: 'hook', by: 'bot', system: false, createdAt: 0 },
+      { id: '2', authorId: 'bot', by: 'me', system: true, createdAt: 0 },
+      { id: '1', authorId: 'bot', by: 'me', system: false, createdAt: 0 },
+    ]);
+    expect(calls).toEqual(['fetch 100']);
+  });
+
+  it('deletes many members’ messages at once (B6)', async () => {
+    const { gateway, calls } = board();
+    await expect(gateway.bulkDelete('p', ['7', '8'])).resolves.toBe('deleted');
+    expect(calls).toEqual(['bulk 7,8']);
+  });
+
+  it('says whether a member may manage messages in the board, fetched afresh where asked (Q1)', async () => {
+    const { gateway, calls } = board({ managers: ['mod'] });
+    await expect(gateway.managesMessages('p', 'mod', true)).resolves.toBe(true);
+    await expect(gateway.managesMessages('p', 'member', false)).resolves.toBe(false);
+    await expect(gateway.managesMessages('p', 'gone', true)).resolves.toBe(false);
+    expect(calls).toEqual(['member mod fresh', 'member member', 'member gone fresh']);
+  });
+});
+
 describe('DiscordPartyGateway: a post where the bot may not make one', () => {
   const post = { title: 't', message: { content: 'x' }, tagIds: ['1'] };
 
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index 1dba7aaf..7f574463 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -108,6 +108,35 @@ export interface DeleteOptions {
  */
 export type PostAccess = 'v2' | 'plain' | 'refused';
 
+/** A post as Discord has it (`PartyGateway.postInfo`). */
+export interface PostInfo {
+  title: string;
+  tagIds: string[];
+  pinned: boolean;
+  locked: boolean;
+  /** Its slowmode (`rate_limit_per_user`) in seconds; 0 where it has none. */
+  slowmode: number;
+}
+
+/**
+ * The slowmode of the region's board (plan 8R-9F, B4): six hours, Discord's most. A member can
+ * write there that seldom at all (Pine deletes it at once); slash commands and bots are not held
+ * by it. Exactly this slowmode is Pine's mark of a board it opened (R2, review F2:
+ * `PartyService.openOnce`; a forum may give its posts another by default).
+ */
+export const BOARD_SLOWMODE_SECONDS = 6 * 60 * 60;
+
+/** A message of a post as `PartyGateway.boardMessages` reads it (plan 8R-9F, B6). */
+export interface BoardMessage {
+  id: string;
+  authorId: string;
+  /** `me`: this bot; `bot`: another application or a webhook; `member`: anybody else. */
+  by: 'me' | 'bot' | 'member';
+  /** Discord's own message (a title's change, a pin): it cannot be deleted. */
+  system: boolean;
+  createdAt: number;
+}
+
 /**
  * How a member stands to a forum. `visible`: they can see it. `hidden`: they cannot, and nothing
  * says that they in particular should not. `barred`: they cannot, and somebody set that on
@@ -177,12 +206,10 @@ export interface PartyGateway {
   /** Creates a post and gives its id (the id of the thread). Undefined when the forum is gone. */
   createPost(forumId: string, post: NewPost): Promise<string | undefined>;
   /**
-   * The post's title, applied tags and whether it is pinned and locked, as Discord has them.
-   * Undefined when it is gone.
+   * The post's title, applied tags, whether it is pinned and locked, and its slowmode in seconds
+   * (0: none), as Discord has them. Undefined when it is gone.
    */
-  postInfo(
-    postId: string,
-  ): Promise<{ title: string; tagIds: string[]; pinned: boolean; locked: boolean } | undefined>;
+  postInfo(postId: string): Promise<PostInfo | undefined>;
   /**
    * Replaces the post's first message. False when the post is gone, and also when only its first
    * message was deleted (the thread may still exist: `postInfo` still answers then).
@@ -206,11 +233,12 @@ export interface PartyGateway {
    */
   pinPost(postId: string): Promise<boolean>;
   /**
-   * Locks a post without archiving it (plan 8R-9: the region's board, in which only the bot and
-   * moderators write), opening it first where it is archived. Needs Manage Threads. False when it
-   * is gone.
+   * Opens the region's board to members (plan 8R-9F, R2): unlocked, so that they can use commands
+   * in it, with a slowmode of `BOARD_SLOWMODE_SECONDS` (B4: a member can write there that seldom;
+   * commands and bots are not held by it), opening it first where it is archived. Needs Manage
+   * Threads. False when it is gone.
    */
-  lockPost(postId: string): Promise<boolean>;
+  openBoard(postId: string): Promise<boolean>;
   /**
    * Archives and locks a post: it leaves the forum's list of active posts and members can no
    * longer write in it. False when it is gone. Anything sent or edited in it afterwards would
@@ -266,10 +294,38 @@ export interface PartyGateway {
   unpinMessage(channelId: string, messageId: string): Promise<boolean>;
   /**
    * What the bot may write in a post (plan 8R-9, B6: the region's board), by its permissions in
-   * the post's forum; the post is fetched (review P3), and one gone or whose permissions are not
-   * known counts as `v2`, so that Discord decides.
+   * the post's forum: View Channel and Send Messages in Threads, and Manage Threads where the post
+   * is locked (plan 8R-9F, B5: a moderator may lock the open board; Discord's 160005); the post
+   * is fetched (review P3), and one gone or whose permissions are not known counts as `v2`, so
+   * that Discord decides.
    */
   postAccess(postId: string): Promise<PostAccess>;
+  /**
+   * The newest messages of a post (plan 8R-9F, B6: the board's catch-up), at most `limit` (100,
+   * Discord's most at once), newest first: who wrote each (`me`, this bot; `bot`, another
+   * application or a webhook; `member`) and whether it is Discord's own (a title's change, which
+   * cannot be deleted). Undefined when the post is gone.
+   */
+  boardMessages(postId: string, limit: number): Promise<BoardMessage[] | undefined>;
+  /**
+   * Deletes 2 to 100 messages of a channel younger than 14 days in one request (Discord's bulk
+   * delete; plan 8R-9F, B6), as `deleteReported` answers. One that is gone is no failure.
+   */
+  bulkDelete(
+    channelId: string,
+    messageIds: readonly string[],
+  ): Promise<'deleted' | 'gone' | 'not-allowed'>;
+  /**
+   * Whether a member has Manage Messages in a post (plan 8R-9F, Q1: a moderator's message in the
+   * board is kept); `fresh` asks Discord rather than the cache (a message read over REST carries
+   * no member). False for one not in the server or a post that is gone.
+   */
+  managesMessages(postId: string, memberId: string, fresh: boolean): Promise<boolean>;
+  /**
+   * Whether the bot may delete what members write in a forum's posts (Manage Messages there; plan
+   * 8R-9F), from the cache: a forum or a member not in it counts as allowed.
+   */
+  mayDeleteMessages(forumId: string): boolean;
   /**
    * Deletes a message somebody else wrote (a reported one, plan 8S-2): `deleted`, `gone` when it
    * (or its channel) was gone already, `not-allowed` when the bot lacks Manage Messages there (in
@@ -572,13 +628,12 @@ const CAN_POST = [
 ];
 
 /**
- * What the bot needs in a forum to write in its locked board post (plan 8R-9, B6): writing in a
- * locked post takes Manage Posts (Discord's 160005 without it).
+ * What the bot needs in a forum to write in its board post (plan 8R-9, B6; plan 8R-9F, B5: the
+ * board is open, so no Manage Posts unless a moderator locked it, `postAccess`).
  */
 const WRITES_IN_BOARD = [
   PermissionFlagsBits.ViewChannel,
   PermissionFlagsBits.SendMessagesInThreads,
-  PermissionFlagsBits.ManageThreads,
 ];
 
 const GONE: ReadonlySet<number | string> = new Set([
@@ -1205,9 +1260,7 @@ export class DiscordPartyGateway implements PartyGateway {
     return thread?.id;
   }
 
-  async postInfo(
-    postId: string,
-  ): Promise<{ title: string; tagIds: string[]; pinned: boolean; locked: boolean } | undefined> {
+  async postInfo(postId: string): Promise<PostInfo | undefined> {
     const post = await this.post(postId);
     return post
       ? {
@@ -1215,6 +1268,7 @@ export class DiscordPartyGateway implements PartyGateway {
           tagIds: [...post.appliedTags],
           pinned: post.flags.has(ChannelFlags.Pinned),
           locked: post.locked === true,
+          slowmode: post.rateLimitPerUser ?? 0,
         }
       : undefined;
   }
@@ -1283,13 +1337,13 @@ export class DiscordPartyGateway implements PartyGateway {
     });
   }
 
-  async lockPost(postId: string): Promise<boolean> {
+  async openBoard(postId: string): Promise<boolean> {
     const post = await this.post(postId);
     if (!post) return false;
     return this.done(async () => {
-      // Discord changes nothing but `archived` on an archived thread: open it to lock it.
+      // Discord changes nothing but `archived` on an archived thread: open it first.
       await this.reopen(post);
-      await post.setLocked(true);
+      await post.edit({ locked: false, rateLimitPerUser: BOARD_SLOWMODE_SECONDS });
     });
   }
 
@@ -1420,9 +1474,62 @@ export class DiscordPartyGateway implements PartyGateway {
     // Unknown counts as allowed: Discord decides.
     if (!has) return 'v2';
     if (!has.has(WRITES_IN_BOARD)) return 'refused';
+    // A locked post takes Manage Posts to write in (160005): a moderator may lock the board.
+    if (post.locked === true && !has.has(PermissionFlagsBits.ManageThreads)) return 'refused';
     return has.has(PermissionFlagsBits.EmbedLinks) ? 'v2' : 'plain';
   }
 
+  async boardMessages(postId: string, limit: number): Promise<BoardMessage[] | undefined> {
+    const post = await this.post(postId);
+    if (!post) return undefined;
+    const fetched = await this.unlessGone(() => post.messages.fetch({ limit }));
+    if (!fetched) return undefined;
+    const me = this.client.user?.id;
+    return [...fetched.values()].map((message) => ({
+      id: message.id,
+      authorId: message.author.id,
+      by:
+        message.author.id === me
+          ? 'me'
+          : message.author.bot || message.webhookId !== null
+            ? 'bot'
+            : 'member',
+      system: message.system,
+      createdAt: message.createdTimestamp,
+    }));
+  }
+
+  async bulkDelete(
+    channelId: string,
+    messageIds: readonly string[],
+  ): Promise<'deleted' | 'gone' | 'not-allowed'> {
+    try {
+      const post = await this.post(channelId);
+      if (!post) return 'gone';
+      // `true`: one older than 14 days is passed over rather than refusing the whole request.
+      return (await this.done(() => post.bulkDelete([...messageIds], true))) ? 'deleted' : 'gone';
+    } catch (err) {
+      if (isMissingPermission(err)) return 'not-allowed';
+      throw err;
+    }
+  }
+
+  async managesMessages(postId: string, memberId: string, fresh: boolean): Promise<boolean> {
+    const post = await this.post(postId);
+    if (!post) return false;
+    const member = await fetchGuildMember(post.guild, memberId, fresh);
+    return (
+      member !== undefined && post.permissionsFor(member).has(PermissionFlagsBits.ManageMessages)
+    );
+  }
+
+  mayDeleteMessages(forumId: string): boolean {
+    const forum = this.client.channels.cache.get(forumId);
+    if (forum?.type !== ChannelType.GuildForum) return true;
+    const me = forum.guild.members.me;
+    return me === null || forum.permissionsFor(me).has(PermissionFlagsBits.ManageMessages);
+  }
+
   async unpinMessage(channelId: string, messageId: string): Promise<boolean> {
     const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
     if (!channel?.isTextBased() || channel.isDMBased()) return true;
diff --git a/src/ops/cutover-check.test.ts b/src/ops/cutover-check.test.ts
index 72be24bf..72bbe100 100644
--- a/src/ops/cutover-check.test.ts
+++ b/src/ops/cutover-check.test.ts
@@ -650,6 +650,26 @@ describe('cutoverCheck', () => {
       );
     });
 
+    it('warns where the bot may not delete what members write in the board (plan 8R-9F, R3)', async () => {
+      const forum = api.addChannel(shape.guild, 'north-board', {
+        type: ChannelType.GuildForum,
+        parentId: shape.category.id,
+        overwrites: [overwrite(shape.botRole, [], [P.ManageMessages])],
+      });
+      store.regions = [
+        {
+          guild: shape.guild.id,
+          channelId: shape.north.id,
+          forumChannelId: forum.id,
+          summaryMessageId: '900000000000000001',
+        },
+      ];
+      expect((await check()).find((one) => one.what === 'region')).toMatchObject({
+        status: 'warn',
+        text: 'region #north: the bot could use Manage Messages in the forum #north-board',
+      });
+    });
+
     it('warns, from the database, of the regions with a forum but no board (plan 8R-9, P11)', async () => {
       store.regions = [
         {
diff --git a/src/ops/permissions.ts b/src/ops/permissions.ts
index 09f36da2..6838c932 100644
--- a/src/ops/permissions.ts
+++ b/src/ops/permissions.ts
@@ -113,13 +113,23 @@ const MANAGE_ROLES = need(
 const MANAGE_THREADS = need(
   P.ManageThreads,
   'Manage Threads',
-  'archiving, locking, renaming and pinning posts; writing in the locked board (plan 8R-9)',
+  'archiving, locking, renaming and pinning posts; pinning and opening the board (plan 8R-9F)',
 );
 const THREADS = need(
   P.SendMessagesInThreads,
   'Send Messages in Threads',
   'messages in posts; "Today’s Stops" in the board',
 );
+/**
+ * Deleting what members write in the board (plan 8R-9F, B5): without it the board works and
+ * members' messages stay there, so a warning (R3).
+ */
+const CLEANS_BOARD = need(
+  P.ManageMessages,
+  'Manage Messages',
+  'deleting what members write in the board (plan 8R-9F)',
+  true,
+);
 const REACT = need(P.AddReactions, 'Add Reactions', 'the marks on a screenshot it reads', true);
 const EXTERNAL = need(
   P.UseExternalEmojis,
@@ -178,8 +188,10 @@ export const MODERATION_NEEDS: readonly Need[] = [VIEW, SEND, EMBED];
 /**
  * What it needs in a region's forum, and in the category the forum is made in (a new forum
  * takes the category's overwrites): posts, their messages, archiving them, who may see them, and
- * since plan 8R-9 the region's locked board with "Today’s Stops" in it (Send Messages in Threads,
- * Embed Links and Manage Threads, `PartyGateway.postAccess`).
+ * since plan 8R-9 the region's board with "Today’s Stops" in it. Since plan 8R-9F (B5) the board
+ * is open to members: writing in it takes Send Messages in Threads and Embed Links
+ * (`PartyGateway.postAccess`), pinning and opening it Manage Threads, and deleting what members
+ * write there Manage Messages (optional, R3).
  */
 export const FORUM_NEEDS: readonly Need[] = [
   VIEW,
@@ -191,6 +203,7 @@ export const FORUM_NEEDS: readonly Need[] = [
   MANAGE_CHANNELS,
   MANAGE_ROLES,
   MANAGE_THREADS,
+  CLEANS_BOARD,
 ];
 
 /**
diff --git a/src/render/board-words.ts b/src/render/board-words.ts
new file mode 100644
index 00000000..93676e69
--- /dev/null
+++ b/src/render/board-words.ts
@@ -0,0 +1,16 @@
+/**
+ * The words about the region's board that go to a member (plan 8R-9F): the board keeps only the
+ * bot's lists, and what a member writes there is deleted.
+ */
+
+/**
+ * The direct message to a member whose message in the board was deleted (plan 8R-9F, Q2): at
+ * most once a day. Plain text: a DM that only says something.
+ */
+export function boardDeletedDm(boardId: string, regionChannelId: string): string {
+  return (
+    `I deleted your message in <#${boardId}>: the board keeps only my lists of what is on. ` +
+    `Chat in <#${regionChannelId}>, or report with a command such as \`/raid\`, \`/research\` ` +
+    'or `/rocket`, there or in the board.'
+  );
+}
diff --git a/src/render/research.ts b/src/render/research.ts
index d736e8bf..fb051b72 100644
--- a/src/render/research.ts
+++ b/src/render/research.ts
@@ -231,7 +231,7 @@ export function researchWords(
 
 /**
  * Where the post of the stops shows a report (plan 8R-9): `In "Today’s Stops" on the board of
- * #west`, the region channels as the caller names them; the board is the region's forum's locked
+ * #west`, the region channels as the caller names them; the board is the region's forum's pinned
  * post, which the words name by its region's channel.
  */
 export function boardWords(channels: readonly string[]): string {
diff --git a/src/render/summary.ts b/src/render/summary.ts
index 4cc7dabf..8739d22b 100644
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -30,7 +30,8 @@ import { count, plain, timestamp } from './text.js';
 import { container, LIST_COLOUR, separator, textDisplay } from './v2.js';
 
 /**
- * The title of the region's board (plan 8R-9): its locked pinned post that lists the region's
+ * The title of the region's board (plan 8R-9; open to members' commands since plan 8R-9F): its
+ * pinned post that lists the region's
  * raids, max battles, trains and meetups, today's and those coming up (spec 5.1; plan 8X-G, Matt
  * 2026-10-22: every kind of party), with "Today’s Stops" below. Inside the region's forum the
  * title needs no region name.
diff --git a/src/services/board-keeper.test.ts b/src/services/board-keeper.test.ts
new file mode 100644
index 00000000..d06aaa23
--- /dev/null
+++ b/src/services/board-keeper.test.ts
@@ -0,0 +1,190 @@
+import { describe, expect, it } from 'vitest';
+import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { partyServiceWith } from '../../test/support/party-service.js';
+import { BoardKeeper } from './board-keeper.js';
+
+const MEMBER = '300000000000000001';
+const OTHER = '300000000000000002';
+const MODERATOR = '300000000000000003';
+const DAY = 24 * 60 * 60 * 1000;
+
+/**
+ * A board on the fake gateway (the west region's, made by the party service) and its keeper,
+ * which tells the regions whose board it deleted in (`changed`).
+ */
+async function keeping() {
+  const made = await partyServiceWith();
+  const west = made.regions.rows[0]!;
+  await made.service.ensureSummary(west);
+  const board = west.summaryMessageId ?? '';
+  const changed: number[] = [];
+  const keeper = new BoardKeeper({
+    regions: made.regions,
+    gateway: made.gateway,
+    dms: made.dms,
+    zone: 'America/New_York',
+    log: made.log,
+    changed: (regionId) => changed.push(regionId),
+    now: () => made.clock.now,
+  });
+  /** A message written in a channel, as `MessageCreate` gives it to the keeper. */
+  const posted = (
+    channelId: string,
+    authorId: string,
+    more: { by?: 'me' | 'bot' | 'member'; system?: boolean } = {},
+  ) => {
+    const id = made.gateway.write(channelId, authorId, { ...more, createdAt: made.clock.now });
+    return {
+      id,
+      outcome: keeper.posted({
+        id,
+        channelId,
+        guildId: made.gateway.guildId,
+        authorId,
+        by: more.by ?? 'member',
+        system: more.system === true,
+        createdAt: made.clock.now,
+      }),
+    };
+  };
+  const deletedIn = (channelId: string) =>
+    made.gateway.deleted.filter((one) => one.channelId === channelId).map((one) => one.messageId);
+  return { ...made, west, board, keeper, changed, posted, deletedIn };
+}
+
+describe('BoardKeeper: what members write in the board (plan 8R-9F)', () => {
+  it('deletes a member’s message in the board and tells them once a day by DM (Q2)', async () => {
+    const { keeper, board, posted, deletedIn, dms, changed, clock, west } = await keeping();
+    const first = posted(board, MEMBER);
+    expect(first.outcome).toBe('taken');
+    await keeper.flush();
+    expect(deletedIn(board)).toEqual([first.id]);
+    // The pin check, for a member's message reopens an archived board unpinned (B7).
+    expect(changed).toEqual([west.id]);
+    expect(dms.recipients).toEqual([MEMBER]);
+    expect(dms.to(MEMBER)[0]?.content).toBe(
+      `I deleted your message in <#${board}>: the board keeps only my lists of what is on. ` +
+        `Chat in <#${WEST_CHANNEL}>, or report with a command such as \`/raid\`, \`/research\` ` +
+        'or `/rocket`, there or in the board.',
+    );
+    // Again the same day: deleted, no second DM; the next day, told again.
+    const second = posted(board, MEMBER);
+    await keeper.flush();
+    expect(deletedIn(board)).toEqual([first.id, second.id]);
+    expect(dms.to(MEMBER)).toHaveLength(1);
+    clock.now += DAY;
+    posted(board, MEMBER);
+    await keeper.flush();
+    expect(dms.to(MEMBER)).toHaveLength(2);
+  });
+
+  it('keeps its own messages, Discord’s, and a moderator’s; deletes another app’s untold (Q1, B3)', async () => {
+    const { keeper, board, posted, deletedIn, dms, gateway } = await keeping();
+    gateway.managers.add(MODERATOR);
+    expect(posted(board, 'bot-self', { by: 'me' }).outcome).toBe('kept');
+    expect(posted(board, MEMBER, { system: true }).outcome).toBe('kept');
+    const moderator = posted(board, MODERATOR);
+    const app = posted(board, '400000000000000001', { by: 'bot' });
+    expect(app.outcome).toBe('taken');
+    await keeper.flush();
+    expect(moderator.outcome).toBe('taken');
+    expect(deletedIn(board)).toEqual([app.id]);
+    // The moderator asked for from the cache: the message just put them there.
+    expect(gateway.memberAsks).toEqual([{ memberId: MODERATOR, fresh: false }]);
+    expect(dms.jobs).toEqual([]);
+  });
+
+  it('leaves alone what is written outside a board', async () => {
+    const { keeper, posted, gateway } = await keeping();
+    expect(posted(WEST_CHANNEL, MEMBER).outcome).toBe('elsewhere');
+    expect(posted(WEST_FORUM, MEMBER).outcome).toBe('elsewhere');
+    await keeper.flush();
+    expect(gateway.deleted).toEqual([]);
+  });
+
+  it('says once per board that it may not delete there, and counts a message gone as deleted', async () => {
+    const { keeper, board, posted, gateway, entries, dms, changed } = await keeping();
+    gateway.noManaging.add(WEST_FORUM);
+    posted(board, MEMBER);
+    posted(board, OTHER);
+    await keeper.flush();
+    expect(gateway.deleted).toEqual([]);
+    expect(
+      entries.filter((entry) => entry.msg === 'could not delete a message in the board'),
+    ).toHaveLength(1);
+    expect(dms.jobs).toEqual([]);
+    expect(changed).toEqual([]);
+    // Allowed again, then a message somebody deleted already (Discord's 10008): no word, no DM.
+    gateway.noManaging.delete(WEST_FORUM);
+    const gone = posted(board, MEMBER);
+    gateway.gone.add(gone.id);
+    await keeper.flush();
+    expect(dms.jobs).toEqual([]);
+    gateway.failing.set('deleteReported', new Error('Discord is away'));
+    posted(board, MEMBER);
+    posted(board, OTHER);
+    await keeper.flush();
+    expect(
+      entries.filter((entry) => entry.msg === 'could not delete a message in the board'),
+    ).toHaveLength(2);
+  });
+});
+
+describe('BoardKeeper: the catch-up (plan 8R-9F, B6)', () => {
+  it('deletes what members wrote while it was away in one request, each author asked once afresh', async () => {
+    const { keeper, board, gateway, deletedIn, dms, changed, west, clock } = await keeping();
+    gateway.managers.add(MODERATOR);
+    const at = { createdAt: clock.now - 60_000 };
+    const one = gateway.write(board, MEMBER, at);
+    const two = gateway.write(board, MEMBER, at);
+    gateway.write(board, MODERATOR, at);
+    const app = gateway.write(board, '400000000000000001', { ...at, by: 'bot' });
+    gateway.write(board, 'bot-self', { ...at, system: true });
+    await keeper.sweep();
+    expect(gateway.bulkDeleted).toEqual([[app, two, one]]);
+    expect(deletedIn(board)).toEqual([app, two, one]);
+    expect(gateway.memberAsks).toEqual([
+      { memberId: MODERATOR, fresh: true },
+      { memberId: MEMBER, fresh: true },
+    ]);
+    expect(dms.recipients).toEqual([MEMBER]);
+    expect(changed).toEqual([west.id]);
+    // Nothing left: nothing more is asked or deleted.
+    await keeper.sweep();
+    expect(gateway.bulkDeleted).toHaveLength(1);
+    expect(changed).toEqual([west.id]);
+  });
+
+  it('deletes one at a time a single message, and one older than 14 days', async () => {
+    const { keeper, board, gateway, deletedIn, clock } = await keeping();
+    const old = gateway.write(board, MEMBER, { createdAt: clock.now - 15 * DAY });
+    const fresh = gateway.write(board, OTHER, { createdAt: clock.now - DAY });
+    await keeper.sweep();
+    expect(gateway.bulkDeleted).toEqual([]);
+    expect(deletedIn(board)).toEqual([fresh, old]);
+  });
+
+  it('reads at most a hundred messages of each board', async () => {
+    const { keeper, board, gateway } = await keeping();
+    for (let n = 0; n < 120; n++) gateway.write(board, MEMBER, { createdAt: 0 });
+    await keeper.sweep();
+    expect(gateway.deleted).toHaveLength(100);
+  });
+
+  it('goes on with the next board after one it cannot read (review F5)', async () => {
+    const { keeper, board, gateway, entries, service, regions, deletedIn } = await keeping();
+    const east = regions.rows[1]!;
+    await service.ensureSummary(east);
+    const eastBoard = east.summaryMessageId ?? '';
+    gateway.write(board, MEMBER, { createdAt: 0 });
+    const there = gateway.write(eastBoard, MEMBER, { createdAt: 0 });
+    // West's board, read first, cannot be read; East's can.
+    const read = gateway.boardMessages.bind(gateway);
+    gateway.boardMessages = (postId, limit) =>
+      postId === board ? Promise.reject(new Error('Discord is away')) : read(postId, limit);
+    await keeper.sweep();
+    expect(entries.filter((entry) => entry.msg === 'could not read the board')).toHaveLength(1);
+    expect(deletedIn(board)).toEqual([]);
+    expect(deletedIn(eastBoard)).toEqual([there]);
+  });
+});
diff --git a/src/services/board-keeper.ts b/src/services/board-keeper.ts
new file mode 100644
index 00000000..c84564aa
--- /dev/null
+++ b/src/services/board-keeper.ts
@@ -0,0 +1,238 @@
+import { DateTime } from 'luxon';
+import type { Logger } from 'pino';
+import { BoundedMap } from '../bounded-map.js';
+import type { Region } from '../db/repositories/region-repository.js';
+import type { BoardMessage, PartyGateway } from '../discord/party-gateway.js';
+import { boardDeletedDm } from '../render/board-words.js';
+import { DM_PRIORITY, type DmSender } from './dm-sender.js';
+import type { RegionProvider } from './region-directory.js';
+
+/** As many messages of a board as the catch-up reads (Discord's most at once; B6). */
+export const BOARD_READ_LIMIT = 100;
+/** Discord's bulk delete takes messages younger than 14 days; a minute is kept in hand. */
+const BULK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 - 60_000;
+/** As many members as are remembered as told today (Q2); a restart may repeat one DM. */
+const TOLD_MEMBERS = 10_000;
+/** How long the DM waits in line before it is not worth sending. */
+const DM_EXPIRES_MS = 60 * 60 * 1000;
+
+/** A message as `MessageCreate` gives it (plan 8R-9F): where, by whom, and when. */
+export interface PostedBoardMessage extends BoardMessage {
+  channelId: string;
+  guildId: string | null;
+}
+
+/**
+ * What `BoardKeeper.posted` makes of a message: `elsewhere`, not in a board; `kept`, the bot's
+ * own or Discord's; `taken`, the keeper deletes it unless its author may manage messages there.
+ */
+export type BoardOutcome = 'elsewhere' | 'kept' | 'taken';
+
+export interface BoardKeeperOptions {
+  regions: Pick<RegionProvider, 'all'>;
+  gateway: Pick<
+    PartyGateway,
+    'deleteReported' | 'boardMessages' | 'bulkDelete' | 'managesMessages'
+  >;
+  dms: DmSender;
+  /** `settings.timezone`: a member is told once per local day (Q2). */
+  zone: string;
+  log: Logger;
+  /**
+   * Told after a delete in a region's board (B7: a member's message reopens an archived board
+   * unpinned; `PartyService.summaryChanged(region, true)` checks the pin).
+   */
+  changed: (regionId: number) => void;
+  now?: () => number;
+}
+
+/**
+ * Keeps the region's board for the bot's lists (plan 8R-9F; design
+ * `2026-10-27-region-board-commands-design.md`): the board is open to members, so that they can
+ * use commands there, and what anybody but the bot writes in it is deleted at once (B3: other
+ * applications and webhooks too; Discord's own messages are left, as they cannot be deleted).
+ * A member with Manage Messages in it keeps their message (Q1). A member whose message went is
+ * told by DM once a local day (Q2). At start and in the catch-up on reconnect `sweep` deletes
+ * what was written while the bot was away (B6).
+ */
+export class BoardKeeper {
+  private readonly now: () => number;
+  /** Each member's last day told, by `<server>:<member>`. */
+  private readonly told = new BoundedMap<string, string>(TOLD_MEMBERS);
+  /** The boards where a delete failed, said once until one works again. */
+  private readonly failedIn = new Set<string>();
+  private readonly working = new Set<Promise<void>>();
+
+  constructor(private readonly options: BoardKeeperOptions) {
+    this.now = options.now ?? (() => Date.now());
+  }
+
+  /** The region whose board a channel is, if any. */
+  regionOfBoard(channelId: string): Region | undefined {
+    return this.options.regions.all().find((region) => region.summaryMessageId === channelId);
+  }
+
+  /**
+   * A message was written (`MessageCreate`, before its bot filter, B3). One in a board that is
+   * neither the bot's own nor Discord's is deleted in the background (`flush` waits for it).
+   */
+  posted(message: PostedBoardMessage): BoardOutcome {
+    const region = this.regionOfBoard(message.channelId);
+    if (!region) return 'elsewhere';
+    if (message.by === 'me' || message.system) return 'kept';
+    this.track(this.take(region, message));
+    return 'taken';
+  }
+
+  /**
+   * Deletes a message of the board unless a moderator wrote it (Q1), and tells its member; for
+   * the screenshot flow (plan 8R-9F, B2) it is called once the pictures are downloaded. Never
+   * throws.
+   */
+  async take(region: Region, message: BoardMessage): Promise<void> {
+    const boardId = region.summaryMessageId;
+    if (boardId === null) return;
+    try {
+      // From the cache: the message just put its member there.
+      if (
+        message.by === 'member' &&
+        (await this.options.gateway.managesMessages(boardId, message.authorId, false))
+      ) {
+        return;
+      }
+    } catch (err) {
+      this.options.log.warn({ err, region: region.id }, 'could not tell who wrote in the board');
+      return;
+    }
+    const deleted = await this.deleteOne(region, message.id);
+    if (deleted) this.deletedFrom(region, [message]);
+  }
+
+  /**
+   * Deletes what was written in every board while the bot was away (B6): the newest
+   * `BOARD_READ_LIMIT` messages of each, each author asked for afresh once (a message read over
+   * REST carries no member, Q1), in one request where two or more are younger than 14 days.
+   */
+  async sweep(): Promise<void> {
+    for (const region of this.options.regions.all()) {
+      if (region.summaryMessageId === null) continue;
+      try {
+        await this.sweepBoard(region, region.summaryMessageId);
+      } catch (err) {
+        this.options.log.warn({ err, region: region.id }, 'could not read the board');
+      }
+    }
+  }
+
+  /** Waits for the deletes on their way. */
+  async flush(): Promise<void> {
+    while (this.working.size > 0) await Promise.all([...this.working]);
+  }
+
+  private async sweepBoard(region: Region, boardId: string): Promise<void> {
+    const { gateway } = this.options;
+    const read = await gateway.boardMessages(boardId, BOARD_READ_LIMIT);
+    if (!read) return;
+    const keeps = new Map<string, boolean>();
+    const taken: BoardMessage[] = [];
+    for (const message of read) {
+      if (message.by === 'me' || message.system) continue;
+      if (message.by === 'member') {
+        let keep = keeps.get(message.authorId);
+        if (keep === undefined) {
+          keep = await gateway.managesMessages(boardId, message.authorId, true);
+          keeps.set(message.authorId, keep);
+        }
+        if (keep) continue;
+      }
+      taken.push(message);
+    }
+    if (taken.length === 0) return;
+    const youngAfter = this.now() - BULK_MAX_AGE_MS;
+    const young = taken.filter((message) => message.createdAt > youngAfter);
+    const old = taken.filter((message) => message.createdAt <= youngAfter);
+    const deleted: BoardMessage[] = [];
+    if (young.length >= 2) {
+      const answer = await this.attempt(region, () =>
+        gateway.bulkDelete(
+          boardId,
+          young.map((message) => message.id),
+        ),
+      );
+      if (answer === 'deleted') deleted.push(...young);
+    } else {
+      old.unshift(...young);
+    }
+    for (const message of old) {
+      if (await this.deleteOne(region, message.id)) deleted.push(message);
+    }
+    if (deleted.length > 0) this.deletedFrom(region, deleted);
+  }
+
+  /** Deletes one message of the board: whether it was there and is deleted now. */
+  private async deleteOne(region: Region, messageId: string): Promise<boolean> {
+    const boardId = region.summaryMessageId;
+    if (boardId === null) return false;
+    const answer = await this.attempt(region, () =>
+      this.options.gateway.deleteReported(boardId, messageId),
+    );
+    return answer === 'deleted';
+  }
+
+  /**
+   * Runs a delete; a refusal or a failure is said once per board until one works again (a
+   * message gone already counts as working).
+   */
+  private async attempt(
+    region: Region,
+    work: () => Promise<'deleted' | 'gone' | 'not-allowed'>,
+  ): Promise<'deleted' | 'gone' | 'failed'> {
+    const boardId = region.summaryMessageId ?? '';
+    let answer: 'deleted' | 'gone' | 'not-allowed';
+    let err: unknown;
+    try {
+      answer = await work();
+    } catch (failure) {
+      answer = 'not-allowed';
+      err = failure;
+    }
+    if (answer !== 'not-allowed') {
+      this.failedIn.delete(boardId);
+      return answer;
+    }
+    if (!this.failedIn.has(boardId)) {
+      this.failedIn.add(boardId);
+      this.options.log.warn(
+        { ...(err === undefined ? {} : { err }), region: region.id, board: boardId },
+        'could not delete a message in the board',
+      );
+    }
+    return 'failed';
+  }
+
+  /** After a delete: the summary checks the pin (B7), and each member is told once a day. */
+  private deletedFrom(region: Region, messages: readonly BoardMessage[]): void {
+    this.options.changed(region.id);
+    const boardId = region.summaryMessageId ?? '';
+    const day = DateTime.fromMillis(this.now(), { zone: this.options.zone }).toISODate() ?? '';
+    for (const message of messages) {
+      if (message.by !== 'member') continue;
+      const key = `${String(region.guildId)}:${message.authorId}`;
+      if (this.told.get(key) === day) continue;
+      this.told.set(key, day);
+      const now = this.now();
+      this.options.dms.send({
+        userId: message.authorId,
+        message: { content: boardDeletedDm(boardId, region.channelId) },
+        priority: DM_PRIORITY.normal,
+        eventAt: now,
+        expiresAt: now + DM_EXPIRES_MS,
+      });
+    }
+  }
+
+  private track(work: Promise<void>): void {
+    const running = work.finally(() => this.working.delete(running));
+    this.working.add(running);
+  }
+}
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index ca21106b..c31e8a25 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -478,84 +478,144 @@ describe('PartyService: the summary and tidying up', () => {
     expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
   });
 
-  it('locks the board when it makes it, and pins and locks it again whenever it is drawn (plan 8R-9, B4)', async () => {
+  it('makes the board open, with its slowmode, and pins it again whenever it is drawn (plan 8R-9F, R2, B4)', async () => {
     const made = await partyServiceWith();
     const { service, gateway, regions } = made;
     const west = regions.rows[0]!;
     await service.ensureSummary(west);
     const board = gateway.posts.get(west.summaryMessageId ?? '')!;
-    expect(board).toMatchObject({ pinned: true, locked: true });
-    // A moderator unlocked it, and a week without messages archived it (unpinned on opening).
-    board.locked = false;
+    expect(board).toMatchObject({ pinned: true, locked: false, slowmode: 21_600 });
+    // A week without messages archived it (unpinned on opening).
     board.archived = true;
     board.pinned = false;
-    // The stops were drawn in it (opening it): the summary's text is the same, yet both are back.
+    // The stops were drawn in it (opening it): the summary's text is the same, yet it is pinned.
     service.summaryChanged(west.id, true);
     await service.flush();
-    expect(board).toMatchObject({ pinned: true, locked: true });
-    // A change of the text: the same after its edit.
-    board.locked = false;
+    expect(board).toMatchObject({ pinned: true, locked: false });
+  });
+
+  it('opens a board that plan 8R-9 locked once, and leaves a moderator’s later lock alone (R2)', async () => {
+    const made = await partyServiceWith();
+    const { service, gateway, regions } = made;
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
+    // As plan 8R-9 left it: locked, without slowmode.
+    board.locked = true;
+    board.slowmode = 0;
     await addQuietRaid(made);
     service.summaryChanged(west.id);
     await service.flush();
     expect(textOf(board.message)).toMatch(/1 raid/);
+    expect(board).toMatchObject({ locked: false, slowmode: 21_600 });
+    // A moderator locks it now: drawn again, it stays locked.
+    board.locked = true;
+    await addQuietRaid(made, { id: '00000000-0000-4000-8000-000000000002', gymId: 2 });
+    service.summaryChanged(west.id);
+    service.summaryChanged(west.id, true);
+    await service.flush();
+    expect(textOf(board.message)).toMatch(/2 raids/);
     expect(board.locked).toBe(true);
+    expect(gateway.calls.filter((call) => call.startsWith('openBoard'))).toHaveLength(2);
+  });
+
+  it('opens a locked board whose forum gives posts a slowmode of its own: only six hours is its mark (review F2)', async () => {
+    const made = await partyServiceWith();
+    const { service, gateway, regions } = made;
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
+    // Plan 8R-9 locked it, in a forum whose posts get a minute of slowmode by default.
+    board.locked = true;
+    board.slowmode = 60;
+    service.summaryChanged(west.id, true);
+    await service.flush();
+    expect(board).toMatchObject({ locked: false, slowmode: 21_600 });
+  });
+
+  it('opens again a board a moderator locked and took the slowmode from, and leaves an open board’s own slowmode (review F2)', async () => {
+    const made = await partyServiceWith();
+    const { service, gateway, regions } = made;
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
+    // Locked and its slowmode cleared: Discord keeps no mark of Pine's opening, so it is opened.
+    board.locked = true;
+    board.slowmode = 0;
+    service.summaryChanged(west.id, true);
+    await service.flush();
+    expect(board).toMatchObject({ locked: false, slowmode: 21_600 });
+    // Open, with a slowmode a moderator chose: left as it is.
+    board.slowmode = 300;
+    const opened = gateway.calls.filter((call) => call.startsWith('openBoard')).length;
+    service.summaryChanged(west.id, true);
+    await service.flush();
+    expect(board).toMatchObject({ locked: false, slowmode: 300 });
+    expect(gateway.calls.filter((call) => call.startsWith('openBoard'))).toHaveLength(opened);
+    // Open without any: given its slowmode.
+    board.slowmode = 0;
+    service.summaryChanged(west.id, true);
+    await service.flush();
+    expect(board.slowmode).toBe(21_600);
   });
 
-  it('says once that it may not lock the board, and pins it all the same (B4)', async () => {
+  it('says once that it may not open the board, and pins it all the same (B4)', async () => {
     const { service, gateway, regions, entries } = await partyServiceWith();
     const west = regions.rows[0]!;
-    gateway.failing.set('lockPost', missingPermissions('PATCH'));
+    gateway.failing.set('openBoard', missingPermissions('PATCH'));
     await service.ensureSummary(west);
     service.summaryChanged(west.id, true);
     await service.flush();
     expect(gateway.posts.get(west.summaryMessageId ?? '')).toMatchObject({
       pinned: true,
-      locked: false,
+      slowmode: 0,
     });
-    expect(entries.filter((entry) => entry.msg === 'could not lock the board post')).toHaveLength(
+    expect(entries.filter((entry) => entry.msg === 'could not open the board post')).toHaveLength(
       1,
     );
   });
 
-  it('says in the setup that the board could not be locked, and why (review P12)', async () => {
+  it('says in the setup that the board could not be opened, and why (review P12)', async () => {
     const { service, gateway } = await partyServiceWith();
-    gateway.failing.set('lockPost', missingPermissions('PATCH'));
+    gateway.failing.set('openBoard', missingPermissions('PATCH'));
     const results = await service.setupForums(gateway.guildId);
     expect(results.find((one) => one.region.channelId === WEST_CHANNEL)).toMatchObject({
       summary: true,
-      unlocked: 'refused',
+      closed: 'refused',
     });
-    gateway.failing.set('lockPost', new Error('Discord is away'));
+    gateway.failing.set('openBoard', new Error('Discord is away'));
     gateway.posts.clear();
     const again = await service.setupForums(gateway.guildId);
     expect(again.find((one) => one.region.channelId === WEST_CHANNEL)).toMatchObject({
-      unlocked: 'failed',
+      closed: 'failed',
     });
   });
 
-  it('pins and locks a board that stands in the setup, and says when it could not (review W3)', async () => {
+  it('opens a board plan 8R-9 locked in the setup, and says a moderator’s lock stands (R2, W3)', async () => {
     const { service, gateway, regions } = await partyServiceWith();
     const west = regions.rows[0]!;
     await service.ensureSummary(west);
     const board = gateway.posts.get(west.summaryMessageId ?? '')!;
-    // A moderator unpinned and unlocked it.
+    // Unpinned, and locked as plan 8R-9 left it.
     board.pinned = false;
-    board.locked = false;
+    board.locked = true;
+    board.slowmode = 0;
     const results = await service.setupForums(gateway.guildId);
     const mine = results.find((one) => one.region.channelId === WEST_CHANNEL);
-    expect(mine).toMatchObject({ summary: false });
-    expect(mine?.unlocked).toBeUndefined();
+    expect(mine).toMatchObject({ summary: false, cleaning: true });
+    expect(mine?.closed).toBeUndefined();
     expect(mine?.unpinned).toBeUndefined();
-    expect(board).toMatchObject({ pinned: true, locked: true });
-    // Unlocked again, and the bot may not lock it now.
-    board.locked = false;
-    gateway.failing.set('lockPost', missingPermissions('PATCH'));
+    expect(board).toMatchObject({ pinned: true, locked: false, slowmode: 21_600 });
+    // A moderator locked it since, and the bot may not delete members' messages there.
+    board.locked = true;
+    gateway.noManaging.add(WEST_FORUM);
     const again = await service.setupForums(gateway.guildId);
     expect(again.find((one) => one.region.channelId === WEST_CHANNEL)).toMatchObject({
       summary: false,
-      unlocked: 'refused',
+      closed: 'locked',
+      cleaning: false,
     });
+    expect(board.locked).toBe(true);
   });
 
   it('makes the board anew when it was deleted while its text stood (review P2)', async () => {
@@ -570,7 +630,8 @@ describe('PartyService: the summary and tidying up', () => {
     expect(west.summaryMessageId).not.toBe(old);
     expect(gateway.posts.get(west.summaryMessageId ?? '')).toMatchObject({
       pinned: true,
-      locked: true,
+      locked: false,
+      slowmode: 21_600,
     });
   });
 
@@ -586,7 +647,7 @@ describe('PartyService: the summary and tidying up', () => {
     expect(west.summaryMessageId).toBe(old);
     await addQuietRaid(made);
     await service.flush();
-    expect(gateway.posts.get(old)).toMatchObject({ title: 'Today and coming up', locked: true });
+    expect(gateway.posts.get(old)).toMatchObject({ title: 'Today and coming up', locked: false });
   });
 
   it('lists what starts after midnight under Coming up, and the stops as below it (B8)', async () => {
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 709e6f61..6d995473 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -5,6 +5,7 @@ import type { Gym } from '../db/repositories/gym-repository.js';
 import type { Region } from '../db/repositories/region-repository.js';
 import type { UserSettingsReader } from '../db/repositories/user-repository.js';
 import {
+  BOARD_SLOWMODE_SECONDS,
   channelLimitOf,
   isMissingPermission,
   isRefusedBody,
@@ -16,6 +17,7 @@ import {
   type MemberAccess,
   type NewPost,
   type PartyGateway,
+  type PostInfo,
   type TagIds,
   type V2Message,
 } from '../discord/party-gateway.js';
@@ -530,13 +532,20 @@ class HiddenForumRefused extends Error {
 type SummaryPin = 'pinned' | 'refused' | 'failed';
 
 /**
- * Whether a summary post was made, and why it is not pinned or locked (plan 8R-9, review P12)
- * where it could not be.
+ * Whether the region's board is open to members (plan 8R-9F, R2): `open`; `locked`, a moderator
+ * locked it after Pine opened it, and it is left so; `refused`, Pine could not open it for want
+ * of Manage Posts; `failed`, for anything else (logged).
+ */
+type BoardOpen = 'open' | 'locked' | 'refused' | 'failed';
+
+/**
+ * Whether a summary post was made, and why it is not pinned or open (plan 8R-9, review P12; plan
+ * 8R-9F) where it is not.
  */
 interface SummaryMade {
   made: boolean;
   unpinned?: Exclude<SummaryPin, 'pinned'>;
-  unlocked?: Exclude<SummaryPin, 'pinned'>;
+  closed?: Exclude<BoardOpen, 'open'>;
 }
 
 /** What `/admin setup-forums` did for one region. */
@@ -569,11 +578,16 @@ export interface ForumSetup {
    */
   unpinned?: Exclude<SummaryPin, 'pinned'>;
   /**
-   * Set when a new board, or one that stood unlocked (review W3), could not be locked (plan 8R-9,
-   * review P12): `refused` where the bot lacks Manage Posts in the forum, `failed` for anything
-   * else (logged).
+   * Set when the board is not open to members (plan 8R-9F, R2): `locked`, a moderator locked it
+   * after Pine opened it (left so); `refused`, Pine could not open it for want of Manage Posts in
+   * the forum; `failed`, for anything else (logged).
+   */
+  closed?: Exclude<BoardOpen, 'open'>;
+  /**
+   * Whether the bot may delete what members write in the board (Manage Messages in the forum,
+   * plan 8R-9F); absent where the region has no board.
    */
-  unlocked?: Exclude<SummaryPin, 'pinned'>;
+  cleaning?: boolean;
   /**
    * Whether the making of posts in the forum was left to the bot now (`reserved`), or could
    * not be (`not-allowed`: the bot may not change the permissions of the forum); absent when
@@ -719,10 +733,10 @@ export class PartyService {
 
   /** The regions whose summary post Discord refused to rename, said once in the log. */
   private readonly renameRefused = new Set<number>();
-  /** The regions whose board Discord refused to lock (plan 8R-9), said once in the log. */
-  private readonly lockRefused = new Set<number>();
+  /** The regions whose board Discord refused to open (plan 8R-9F), said once in the log. */
+  private readonly openRefused = new Set<number>();
   /**
-   * The regions whose board's pin and lock are checked at the summary's next draw, whether or not
+   * The regions whose board's pin (and opening, plan 8R-9F) is checked at the summary's next draw, whether or not
    * its text changed (plan 8R-9, B4: the stops were drawn in it, which opens it if archived).
    */
   private readonly boardChecks = new Set<number>();
@@ -3298,9 +3312,10 @@ export class PartyService {
     const text = JSON.stringify(message);
     const last = this.summarySent.get(regionId);
     if (last?.postId === failed && last.text === text) {
-      // The text stands; the board may have been opened by the stops' messages (B4).
-      // A board gone meanwhile (review P2): asked for again, so that the edit replaces it.
-      if (check && !(await this.pinAndLock(regionId, failed))) {
+      // The text stands; the board may have been opened by the stops' messages or a member's
+      // (B4; plan 8R-9F, B7). A board gone meanwhile (review P2): asked for again, so that the
+      // edit replaces it.
+      if (check && !(await this.pinAndOpen(regionId, failed))) {
         this.summarySent.delete(regionId);
         this.summaries.request(regionId);
       }
@@ -3327,8 +3342,8 @@ export class PartyService {
     // For the staging: which regions' summaries a change edited (final review F5).
     log.debug({ region: regionId, post: failed }, 'edited the summary post');
     // A post that was archived and opened again comes back unpinned; and it is the region's
-    // locked board (plan 8R-9, B4).
-    const info = await this.pinAndLock(regionId, failed);
+    // board, opened to members once (plan 8R-9F, R2).
+    const info = await this.pinAndOpen(regionId, failed);
     if (!info) return;
     // The text is sent: a request with the same text edits nothing (review r1, R1-6).
     this.summarySent.set(regionId, { postId: failed, text });
@@ -3395,42 +3410,56 @@ export class PartyService {
   }
 
   /**
-   * Pins and locks the region's board where Discord says it is not (plan 8R-9, B4: an archived
-   * post opened again comes back unpinned; a moderator may have unlocked it); gives what Discord
-   * said of it, undefined where it is gone.
+   * Pins the region's board where Discord says it is not (plan 8R-9, B4: an archived post opened
+   * again comes back unpinned) and opens it to members where Pine never did (`openOnce`); gives
+   * what Discord said of it, undefined where it is gone.
    */
-  private async pinAndLock(
-    regionId: number,
-    postId: string,
-  ): Promise<{ title: string; pinned: boolean; locked: boolean } | undefined> {
+  private async pinAndOpen(regionId: number, postId: string): Promise<PostInfo | undefined> {
     const info = await this.options.gateway.postInfo(postId);
     if (!info) return undefined;
     if (!info.pinned) await this.pinSummary(regionId, postId);
-    if (!info.locked) await this.lockSummary(regionId, postId);
+    await this.openOnce(regionId, postId, info);
     return info;
   }
 
   /**
-   * Locks the region's board (plan 8R-9): only the bot and moderators write in it. A refused
-   * permission (Manage Posts, as for the pin) is said once per region until a lock works again;
-   * any other failure is a warning, and the next draw tries again.
+   * Opens the region's board to members once (plan 8R-9F, R2). Pine's mark is a slowmode of
+   * exactly `BOARD_SLOWMODE_SECONDS` (review F2: a forum may give its posts a slowmode of its own):
+   * - six hours and locked: Pine opened it, and the lock is a moderator's, left (`locked`);
+   * - locked with any other slowmode: Pine never opened it (plan 8R-9 locked it, whatever the
+   *   forum's default), so it is unlocked and given its slowmode (`PartyGateway.openBoard`); a
+   *   moderator who locks it and also clears its slowmode has it opened again (Discord keeps no
+   *   other mark; no migration);
+   * - open without slowmode: given it (made before plan 8R-9F unlocked, or an opening that failed);
+   * - open with another slowmode: a moderator's choice, left.
+   */
+  private async openOnce(regionId: number, postId: string, info: PostInfo): Promise<BoardOpen> {
+    if (info.slowmode === BOARD_SLOWMODE_SECONDS) return info.locked ? 'locked' : 'open';
+    if (!info.locked && info.slowmode > 0) return 'open';
+    return this.openBoard(regionId, postId);
+  }
+
+  /**
+   * Opens the region's board to members (plan 8R-9F): unlocked, with its slowmode. A refused
+   * permission (Manage Posts, as for the pin) is said once per region until an opening works
+   * again; any other failure is a warning, and the next draw tries again.
    */
-  private async lockSummary(regionId: number, postId: string): Promise<SummaryPin> {
+  private async openBoard(regionId: number, postId: string): Promise<BoardOpen> {
     const { gateway, log } = this.options;
     try {
-      if (await gateway.lockPost(postId)) {
-        this.lockRefused.delete(regionId);
-        return 'pinned';
+      if (await gateway.openBoard(postId)) {
+        this.openRefused.delete(regionId);
+        return 'open';
       }
       return 'failed';
     } catch (err) {
       if (!isMissingPermission(err)) {
-        log.warn({ err, region: regionId, post: postId }, 'could not lock the board post');
+        log.warn({ err, region: regionId, post: postId }, 'could not open the board post');
         return 'failed';
       }
-      if (!this.lockRefused.has(regionId)) {
-        this.lockRefused.add(regionId);
-        log.warn({ err, region: regionId, post: postId }, 'could not lock the board post');
+      if (!this.openRefused.has(regionId)) {
+        this.openRefused.add(regionId);
+        log.warn({ err, region: regionId, post: postId }, 'could not open the board post');
       }
       return 'refused';
     }
@@ -3501,15 +3530,15 @@ export class PartyService {
     const postId = region.summaryMessageId;
     const info = postId === null ? undefined : await gateway.postInfo(postId);
     if (postId !== null && info) {
-      // A board that stands is pinned and locked where it is not (review W3: a moderator may
-      // have unpinned or unlocked it), and says so where it could not be.
+      // A board that stands is pinned where it is not (review W3: a moderator may have unpinned
+      // it) and opened where Pine never did (plan 8R-9F, R2), and says so where it is not.
       const pin = info.pinned ? 'pinned' : await this.pinSummary(region.id, postId);
-      const lock = info.locked ? 'pinned' : await this.lockSummary(region.id, postId);
+      const open = await this.openOnce(region.id, postId, info);
       this.summaries.request(region.id);
       return {
         made: false,
         ...(pin === 'pinned' ? {} : { unpinned: pin }),
-        ...(lock === 'pinned' ? {} : { unlocked: lock }),
+        ...(open === 'open' ? {} : { closed: open }),
       };
     }
     const taken = await this.takeOverSummary(region, region.forumChannelId);
@@ -3585,10 +3614,10 @@ export class PartyService {
       tagIds: [],
     });
     if (postId === undefined) throw new Error(`The forum of region ${region.id} is gone`);
-    // A moderator can pin it by hand, so the post is recorded whether or not this works; locked
-    // as the region's board (plan 8R-9), only the bot and moderators write in it.
+    // A moderator can pin it by hand, so the post is recorded whether or not this works; opened
+    // to members as the region's board (plan 8R-9F): its slowmode marks it so (R2).
     const pin = await this.pinSummary(region.id, postId);
-    const lock = await this.lockSummary(region.id, postId);
+    const open = await this.openBoard(region.id, postId);
     if (!(await regionStore.setSummaryMessage(region.id, forumId, postId))) {
       log.warn({ region: region.id, post: postId }, 'the forum of a region changed meanwhile');
       try {
@@ -3605,7 +3634,7 @@ export class PartyService {
     return {
       made: true,
       ...(pin === 'pinned' ? {} : { unpinned: pin }),
-      ...(lock === 'pinned' ? {} : { unlocked: lock }),
+      ...(open === 'open' ? {} : { closed: open }),
     };
   }
 
@@ -3853,16 +3882,21 @@ export class PartyService {
     }
     const renamed = forum === 'ready' && (await this.renameForum(region));
     const posting = await this.reservePosts(region);
-    const { made: summary, unpinned, unlocked } = await this.summaryMade(region);
+    const { made: summary, unpinned, closed } = await this.summaryMade(region);
+    const after = regions.byId(before.id) ?? region;
     return {
-      region: regions.byId(before.id) ?? region,
+      region: after,
       forum,
       tagsAdded,
       ...(tagsRemoved > 0 ? { tagsRemoved } : {}),
       ...(tagsMissing.length > 0 ? { tagsMissing } : {}),
       summary,
       ...(unpinned === undefined ? {} : { unpinned }),
-      ...(unlocked === undefined ? {} : { unlocked }),
+      ...(closed === undefined ? {} : { closed }),
+      // Whether members' messages in the board can be deleted (plan 8R-9F).
+      ...(after.forumChannelId === null || after.summaryMessageId === null
+        ? {}
+        : { cleaning: gateway.mayDeleteMessages(after.forumChannelId) }),
       ...(renamed ? { renamed } : {}),
       ...(posting === undefined ? {} : { posting }),
       ...(hiding === undefined ? {} : { hidden: hiding }),
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index ee5969e3..1e3c18ef 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -689,11 +689,26 @@ describe('StopPostService', () => {
     expect(message?.message.v2).not.toBe(true);
   });
 
-  it('writes nothing where the bot may not write in the locked board, said once (B6)', async () => {
+  it('writes in the open board without Manage Posts, and not in one a moderator locked (plan 8R-9F, B5)', async () => {
     made = await postsWith();
     made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
+    expect(made.gateway.messagesIn(made.west)).toHaveLength(1);
+    made.gateway.posts.get(made.west)!.locked = true;
+    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
+    await made.posts.flush();
+    expect(made.said()[0]).not.toContain('Catch 7 Pokémon');
+    expect(
+      made.entries.filter((entry) => entry.msg === 'the bot may not write in the board post'),
+    ).toHaveLength(1);
+  });
+
+  it('writes nothing where the bot may not write in the board, said once (B6)', async () => {
+    made = await postsWith();
+    made.gateway.refusePosts.set(WEST_FORUM, ['Send Messages in Posts']);
+    await made.report(pageTask('Catch a Dragon-type Pokémon'));
+    await made.posts.flush();
     await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
     await made.posts.flush();
     expect(made.gateway.messagesIn(made.west)).toEqual([]);
diff --git a/src/services/stop-posts.ts b/src/services/stop-posts.ts
index bbb1535f..8f85ca64 100644
--- a/src/services/stop-posts.ts
+++ b/src/services/stop-posts.ts
@@ -97,7 +97,7 @@ export interface StopPostServiceOptions {
  * The post "Today’s Stops" of every region channel (plan 8R-1; design 6, 9.5–9.7, 9.11): the
  * research of the period on, then the day's Team GO Rocket hideouts (plan 8R-2; a grunt has a
  * message of its own and is not shown here); made at the first report of the day in the region
- * (research or hideout), in the region's board (plan 8R-9: its locked summary post, the thread of
+ * (research or hideout), in the region's board (plan 8R-9: its summary post, the thread of
  * `Region.summaryMessageId`), below the summary, sent without notifying anybody (B13); drawn
  * anew a few seconds after the reports change (`POST_DELAY_MS`, coalesced), spilling into a
  * second and third message as it grows, and deleted once its day has ended. One queue per
@@ -445,7 +445,7 @@ export class StopPostService {
     // no longer the region's.
     const before = kept?.threadId === threadId ? kept.messageIds : [];
     // Set once a message is sent anew in its place: those after it are deleted, and sent anew
-    // below it (B5: in a locked post only the bot writes, so a message sent lands last).
+    // below it (B5: a message sent lands last, below any a moderator kept, plan 8R-9F).
     let anew = false;
     // The messages drawn so far, then those of the post not reached yet.
     const sofar = (): StopPostRecord => ({
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index a97a382a..4dde94d8 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -10,6 +10,7 @@ import {
 import { channelPermissions, type ApiOverwrite } from '../../src/ops/permissions.js';
 import type { ServerChannel } from '../../src/domain/regions/region-import.js';
 import type {
+  BoardMessage,
   CreatedChannel,
   EditOptions,
   ForumAccess,
@@ -28,6 +29,7 @@ import {
   hiddenForumOverwrites,
   isHiddenForum,
   MAX_FORUM_TAGS,
+  BOARD_SLOWMODE_SECONDS,
   PostsRefusedError,
 } from '../../src/discord/party-gateway.js';
 import { postNeeds } from '../../src/domain/party/post-permissions.js';
@@ -90,6 +92,8 @@ export interface FakePost {
   /** Archived and locked by `archivePost`; anything sent or edited in the post opens it again. */
   archived: boolean;
   locked: boolean;
+  /** Its slowmode in seconds (`openBoard` sets the board's, plan 8R-9F); 0 where none. */
+  slowmode: number;
   /** How often something opened the post again after it was archived. */
   reopened: number;
   /** How often the first message was edited, the title changed, the tags set. */
@@ -1153,6 +1157,7 @@ export class FakePartyGateway implements PartyGateway {
         pinned: false,
         archived: false,
         locked: false,
+        slowmode: 0,
         reopened: 0,
         edits: 0,
         renames: 0,
@@ -1179,6 +1184,7 @@ export class FakePartyGateway implements PartyGateway {
         tagIds: [...post.tagIds],
         pinned: post.pinned,
         locked: post.locked,
+        slowmode: post.slowmode,
       };
     });
   }
@@ -1250,20 +1256,110 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
-  /** Locks a post (plan 8R-9), opening it first; refused as a pin is without Manage Posts. */
-  lockPost(postId: string) {
-    return this.attempt('lockPost', postId, () => {
+  /**
+   * Opens the board to members (plan 8R-9F): unlocked, with the board's slowmode, opening it
+   * first; refused as a pin is without Manage Posts.
+   */
+  openBoard(postId: string) {
+    return this.attempt('openBoard', postId, () => {
       const post = this.posts.get(postId);
       if (!post || this.gone.has(postId)) return false;
       if (this.refusePosts.get(post.forumId)?.includes('Manage Posts')) {
         throw missingPermissions('PATCH');
       }
       FakePartyGateway.reopen(post);
-      post.locked = true;
+      post.locked = false;
+      post.slowmode = BOARD_SLOWMODE_SECONDS;
       return true;
     });
   }
 
+  /**
+   * Somebody writes in a channel or post (plan 8R-9F): a member unless `by` says another
+   * application (or this bot), `system` one of Discord's own; `createdAt` by default the time
+   * nothing (0). A message in a post opens it, as Discord does. Gives its id.
+   */
+  write(
+    channelId: string,
+    authorId: string,
+    more: { by?: BoardMessage['by']; system?: boolean; createdAt?: number } = {},
+  ): string {
+    const id = this.id();
+    let list = this.written.get(channelId);
+    if (!list) this.written.set(channelId, (list = []));
+    list.push({
+      id,
+      authorId,
+      by: more.by ?? 'member',
+      system: more.system === true,
+      createdAt: more.createdAt ?? 0,
+    });
+    const post = this.posts.get(channelId);
+    if (post) FakePartyGateway.reopen(post);
+    return id;
+  }
+
+  /**
+   * What others wrote in each channel (`write`), oldest first; deleted ones are in `deleted` and
+   * left out by `boardMessages`.
+   */
+  readonly written = new Map<string, BoardMessage[]>();
+  /** The members with Manage Messages (in every channel; plan 8R-9F, Q1). */
+  readonly managers = new Set<string>();
+  /** The members `managesMessages` asked for, each with whether afresh. */
+  readonly memberAsks: { memberId: string; fresh: boolean }[] = [];
+  /** The ids `bulkDelete` deleted, a list per request. */
+  readonly bulkDeleted: string[][] = [];
+
+  /**
+   * The newest messages of a post, newest first: what others wrote (`write`) and what this bot
+   * sent there, without what was deleted.
+   */
+  boardMessages(postId: string, limit: number) {
+    return this.attempt('boardMessages', postId, () => {
+      if (!this.posts.has(postId) || this.gone.has(postId)) return undefined;
+      const deleted = new Set(
+        this.deleted.filter((one) => one.channelId === postId).map((one) => one.messageId),
+      );
+      const mine: BoardMessage[] = this.messages
+        .filter((one) => one.channelId === postId)
+        .map((one) => ({ id: one.id, authorId: 'bot', by: 'me', system: false, createdAt: 0 }));
+      return [...(this.written.get(postId) ?? []), ...mine]
+        .filter((one) => !deleted.has(one.id))
+        .sort((a, b) => (a.id < b.id ? 1 : -1))
+        .slice(0, limit);
+    });
+  }
+
+  /** Deletes many messages at once, refused where the bot may not manage them (`noManaging`). */
+  bulkDelete(channelId: string, messageIds: readonly string[]) {
+    return this.attempt('bulkDelete', channelId, (): 'deleted' | 'gone' | 'not-allowed' => {
+      if (this.gone.has(channelId)) return 'gone';
+      const forumId = this.posts.get(channelId)?.forumId;
+      if (this.noManaging.has(channelId) || (forumId !== undefined && this.noManaging.has(forumId)))
+        return 'not-allowed';
+      if (messageIds.length < 2 || messageIds.length > 100) {
+        throw new Error('A bulk delete takes 2 to 100 messages');
+      }
+      this.bulkDeleted.push([...messageIds]);
+      for (const messageId of messageIds) this.deleted.push({ channelId, messageId });
+      return 'deleted';
+    });
+  }
+
+  /** Whether a member has Manage Messages (`managers`); one who left the server has none. */
+  managesMessages(postId: string, memberId: string, fresh: boolean) {
+    return this.attempt('managesMessages', postId, () => {
+      this.memberAsks.push({ memberId, fresh });
+      return !this.leftServer.has(memberId) && this.managers.has(memberId);
+    });
+  }
+
+  /** Whether the bot may delete members' messages in a forum: not where it is in `noManaging`. */
+  mayDeleteMessages(forumId: string): boolean {
+    return !this.noManaging.has(forumId);
+  }
+
   archivePost(postId: string) {
     return this.attempt('archivePost', postId, () => {
       const post = this.posts.get(postId);
@@ -1477,8 +1573,8 @@ export class FakePartyGateway implements PartyGateway {
   }
 
   /**
-   * What the bot may write in a post (plan 8R-9): nothing where its forum (or the post) is in
-   * `noManaging`, or `refusePosts` names Send Messages in Posts or Manage Posts there; plain text
+   * What the bot may write in a post (plan 8R-9): nothing where `refusePosts` names Send Messages
+   * in Posts there, or Manage Posts while the post is locked (plan 8R-9F, B5); plain text
    * where the post or its forum is in `noEmbeds`; else messages with components.
    */
   postAccess(postId: string): Promise<PostAccess> {
@@ -1486,12 +1582,16 @@ export class FakePartyGateway implements PartyGateway {
   }
 
   private accessTo(postId: string): PostAccess {
-    const forumId = this.posts.get(postId)?.forumId;
+    const post = this.posts.get(postId);
+    const forumId = post?.forumId;
     const where = forumId === undefined ? [postId] : [postId, forumId];
     const lacking = forumId === undefined ? [] : (this.refusePosts.get(forumId) ?? []);
+    // An open board takes no Manage Posts to write in, a locked one does (plan 8R-9F, B5).
     if (
-      where.some((id) => this.noManaging.has(id)) ||
-      lacking.some((name) => name === 'Send Messages in Posts' || name === 'Manage Posts')
+      lacking.some(
+        (name) =>
+          name === 'Send Messages in Posts' || (name === 'Manage Posts' && post?.locked === true),
+      )
     ) {
       return 'refused';
     }
````

### Task 2: 8R-9F task 2: screenshots in the board, answered by DM

Prototype commit: `06788efb002e1475697ede7343f890d41c030621`

A message of pictures in a region's board goes to the screenshot trigger
first: every picture is downloaded (ScreenshotService.fetch, within
MAX_SCREENSHOT_BYTES), the keeper deletes the message (B2), then the
bytes are read as a message of the region's channel and decided by the
same functions as a mention or a passive read. The answer is one plain
DM (R1): what each picture made or joined, why not, a picture not read,
and where it was unsure (a gym or Power Spot not clear, a place in
another region) the command that asks privately, /raid screenshot: or
/max screenshot:. Nothing is replied, reacted or asked in the board
(B11). A message the trigger does not take is deleted by the keeper.

**Files:**

```
 src/app.ts                                     |  14 ++-
 src/commands/screenshots/mention.board.test.ts | 338 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/screenshots/mention.ts            | 296 ++++++++++++++++++++++++++++++++++++++++++++++++++++++---
 src/services/board-keeper.test.ts              |  42 ++++++++
 src/services/board-keeper.ts                   |  51 ++++++----
 src/services/screenshot-service.test.ts        |  22 +++++
 src/services/screenshot-service.ts             |  48 ++++++++--
 7 files changed, 768 insertions(+), 43 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/screenshots/mention.board.test.ts src/services/board-keeper.test.ts src/services/screenshot-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 06788efb002e1475697ede7343f890d41c030621 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md docs/superpowers/plans/2026-10-27-phase-8r9f-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-9F task 2: screenshots in the board, answered by DM`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index a21af091..dc7b15bd 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -988,8 +988,6 @@ export async function startApp(
   const router = new InteractionRouter(ctx, [...commands, ...messageCommands], components, {
     throttles,
   });
-  // Screenshots posted in a region channel with a mention of the bot (or, passive, without).
-  const screenshotTrigger = new ScreenshotTrigger({ ctx });
   // The region's board is open to members' commands, and what they write there is deleted
   // (plan 8R-9F); after a delete the summary checks its pin (B7).
   const boardKeeper = new BoardKeeper({
@@ -1002,6 +1000,9 @@ export async function startApp(
       partyService.summaryChanged(regionId, true);
     },
   });
+  // Screenshots posted in a region channel with a mention of the bot (or, passive, without),
+  // and in a region's board (plan 8R-9F), which the keeper deletes once they are downloaded.
+  const screenshotTrigger = new ScreenshotTrigger({ ctx, board: boardKeeper });
   // Resolved by the client that ends up connected (the login may try several).
   let markConnected: () => void = () => undefined;
   const connected = new Promise<void>((resolve) => {
@@ -1085,9 +1086,14 @@ export async function startApp(
       // Bots (this one, others, webhooks) do not count.
       client.on(Events.MessageCreate, (message) => {
         // The board first, before the bot filter (plan 8R-9F, B3): other applications' and
-        // webhooks' messages go too. Nothing of a board's message goes further.
+        // webhooks' messages go too. Nothing of a board's message goes further; one with
+        // attachments is the screenshot trigger's first, which downloads before the delete (B2).
         try {
-          if (boardKeeper.posted(postedBoardMessage(message)) !== 'elsewhere') return;
+          const shots =
+            message.attachments.size > 0
+              ? () => screenshotTrigger.handle(postedMessage(message))
+              : undefined;
+          if (boardKeeper.posted(postedBoardMessage(message), shots) !== 'elsewhere') return;
         } catch (err) {
           log.error({ err }, 'could not look at a message in the board');
         }
diff --git a/src/commands/screenshots/mention.board.test.ts b/src/commands/screenshots/mention.board.test.ts
new file mode 100644
index 00000000..3c1d838c
--- /dev/null
+++ b/src/commands/screenshots/mention.board.test.ts
@@ -0,0 +1,338 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { EAST_CHANNEL, testGym, WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
+import { PARTY_NOW, TEST_SPOT } from '../../../test/support/parties.js';
+import { partyServiceWith } from '../../../test/support/party-service.js';
+import { AUTHOR, OTHER, posted } from '../../../test/support/posted-message.js';
+import { gymsFixture } from '../../../test/support/providers.js';
+import { screenshotsWith } from '../../../test/support/screenshot-service.js';
+import { eggReading, maxReading, readingOf } from '../../../test/support/screenshots.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { keptRow } from '../../../test/support/wayspot-cases.js';
+import type { RecordingDms } from '../../../test/support/dms.js';
+import type { AppContext } from '../../app-context.js';
+import type { Gym } from '../../db/repositories/gym-repository.js';
+import type { Region } from '../../db/repositories/region-repository.js';
+import type { BoardMessage } from '../../discord/party-gateway.js';
+import type { TakeOutcome } from '../../services/board-keeper.js';
+import { boardDmText, ScreenshotTrigger } from './mention.js';
+
+/*
+ * Screenshots posted in the region's board (plan 8R-9F, design item 4 with B1, B2, B11 and R1):
+ * every picture downloaded, the message taken out of the board, then read as a message of the
+ * region's channel, and answered by DM only: nothing in the board.
+ */
+
+/** The board post (a thread) of the west region in these tests. */
+const BOARD = '850000000000000001';
+const CLOCK = { hour: 13, minute: 59 };
+const egg = () => eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60);
+
+/** What the board's keeper was asked to take, with what was downloaded and read by then. */
+interface Taken {
+  region: number;
+  message: BoardMessage;
+  tell: boolean;
+  downloads: number;
+  reads: number;
+}
+
+/** The board of the west region, handed to the trigger, which records what it takes. */
+function boardOf(
+  west: Region,
+  shots: ReturnType<typeof screenshotsWith>,
+): {
+  taken: Taken[];
+  /** What the keeper answers (review F1): deleted unless a test says kept or failed. */
+  outcome: { is: TakeOutcome };
+  board: ConstructorParameters<typeof ScreenshotTrigger>[0]['board'];
+} {
+  const taken: Taken[] = [];
+  const outcome: { is: TakeOutcome } = { is: 'deleted' };
+  return {
+    taken,
+    outcome,
+    board: {
+      regionOfBoard: (channelId) => (channelId === BOARD ? west : undefined),
+      take: (region, message, tell) => {
+        taken.push({
+          region: region.id,
+          message,
+          tell,
+          downloads: shots.attachments.asked.length,
+          reads: shots.reader.reads,
+        });
+        return Promise.resolve(outcome.is);
+      },
+    },
+  };
+}
+
+async function setup(options: { gyms?: Gym[]; passive?: boolean } = {}) {
+  const gyms = gymsFixture(options.gyms ?? []);
+  const made = await partyServiceWith([], { gyms });
+  const shots = screenshotsWith(createTestContext({ gyms }).ctx);
+  const { ctx: base } = createTestContext({
+    gyms,
+    partyService: made.service,
+    parties: made.store,
+    regions: made.regions,
+    screenshots: shots.screenshots,
+  });
+  const passive = options.passive ?? false;
+  const ctx: AppContext = {
+    ...base,
+    config: {
+      ...base.config,
+      settings: {
+        ...base.config.settings,
+        ocr: { ...base.config.settings.ocr, passive, enabled: true },
+      },
+    },
+    features: { ocrPassive: passive, autoAssignRole: false },
+  };
+  const west = made.regions.byChannel(WEST_CHANNEL)!;
+  const { taken, board, outcome } = boardOf(west, shots);
+  const trigger = new ScreenshotTrigger({ ctx, board });
+  const dms = ctx.dms as RecordingDms;
+  const said = () => dms.to(AUTHOR).map((message) => message.content);
+  return { ...shots, ...made, ctx, trigger, taken, outcome, dms, said };
+}
+
+describe('screenshots posted in the region’s board (plan 8R-9F)', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('downloads every picture, takes the message out of the board, then reads them, and answers by DM (B2, R1)', async () => {
+    const made = await setup();
+    const cat = readingOf({ gym: 'Old Stone Fountain' });
+    const { message, did, replies } = posted(
+      [made.screenshot('a.png', egg()), made.screenshot('b.png', cat)],
+      { channelId: BOARD, inThread: true },
+    );
+    await expect(made.trigger.handle(message)).resolves.toBe(true);
+    // Downloaded both, read none, when it was taken; as a member's, untold by the keeper.
+    expect(made.taken).toEqual([
+      {
+        region: 1,
+        message: {
+          id: message.id,
+          authorId: AUTHOR,
+          by: 'member',
+          system: false,
+          createdAt: message.createdAt,
+        },
+        tell: false,
+        downloads: 2,
+        reads: 0,
+      },
+    ]);
+    // Read as a message of the region's channel: the raid is West's, its reporter the author.
+    expect(made.store.active()[0]).toMatchObject({ gymId: 2, regionId: 1, createdById: AUTHOR });
+    // Nothing in the board: no reaction, no reply, no delete of its own (B11).
+    expect(did).toEqual([]);
+    expect(replies).toEqual([]);
+    expect(made.said()).toEqual([
+      `From your screenshots in <#${BOARD}> (the board keeps only my lists, so I took your ` +
+        'message out of it):\n' +
+        `- 1: Reported the raid at Old Stone Fountain: <#${made.store.active()[0]?.forumPostId ?? ''}>.\n` +
+        '- 2: This does not look like the screen of a raid, so I made nothing of it.',
+    ]);
+  });
+
+  it('says the message was left where a moderator wrote it, and nothing of the board where the delete failed (review F1)', async () => {
+    const made = await setup();
+    made.outcome.is = 'kept';
+    await made.trigger.handle(
+      posted([made.screenshot('a.png', egg())], { channelId: BOARD, inThread: true }).message,
+    );
+    expect(made.said()[0]).toMatch(
+      new RegExp(
+        `^From your screenshot in <#${BOARD}> \\(I left your message in the board\\):\\n- `,
+      ),
+    );
+    made.outcome.is = 'failed';
+    await made.trigger.handle(
+      posted([made.screenshot('b.png', egg())], { channelId: BOARD, inThread: true }).message,
+    );
+    expect(made.said()[1]).toMatch(new RegExp(`^From your screenshot in <#${BOARD}>:\\n- `));
+  });
+
+  it('downloads every picture at once before the message goes (review F3)', async () => {
+    const made = await setup();
+    let onTheirWay = 0;
+    let most = 0;
+    const download = made.attachments.download.bind(made.attachments);
+    made.attachments.download = async (url, limits) => {
+      onTheirWay++;
+      most = Math.max(most, onTheirWay);
+      try {
+        return await download(url, limits);
+      } finally {
+        onTheirWay--;
+      }
+    };
+    const pictures = Array.from({ length: 4 }, (_, n) =>
+      made.screenshot(`${String(n)}.png`, readingOf({ gym: 'Old Stone Fountain' })),
+    );
+    await made.trigger.handle(posted(pictures, { channelId: BOARD, inThread: true }).message);
+    expect(most).toBe(4);
+    expect(made.taken[0]?.downloads).toBe(4);
+  });
+
+  it('points to /raid screenshot: where it is not sure of the gym, and asks nothing in the board', async () => {
+    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
+    const made = await setup({ gyms: [twin] });
+    const { message, replies } = posted([made.screenshot('a.png', egg())], {
+      channelId: BOARD,
+      inThread: true,
+    });
+    await made.trigger.handle(message);
+    expect(made.store.active()).toEqual([]);
+    expect(replies).toEqual([]);
+    expect(made.said()[0]).toContain(
+      'I could not tell which gym this is: report it with `/raid screenshot:`, which asks you ' +
+        'privately.',
+    );
+    // A clear gym of another region: pointed there too, nothing reported.
+    const lighthouse = posted(
+      [made.screenshot('b.png', eggReading('Harbor Lighthouse Mural', 5, CLOCK, 20 * 60))],
+      { channelId: BOARD, inThread: true },
+    );
+    await made.trigger.handle(lighthouse.message);
+    expect(made.store.active()).toEqual([]);
+    expect(made.said()[1]).toContain(
+      `Harbor Lighthouse Mural is in <#${EAST_CHANNEL}>: report it with \`/raid screenshot:\`, ` +
+        'which asks you whether to report it there.',
+    );
+  });
+
+  it('joins a raid that exists and names a picture it could not download (B2)', async () => {
+    const made = await setup();
+    await made.trigger.handle(
+      posted([made.screenshot('a.png', egg())], {
+        channelId: BOARD,
+        inThread: true,
+        authorId: OTHER,
+      }).message,
+    );
+    await made.service.flush();
+    const lost = made.screenshot('lost.png', egg());
+    made.attachments.files.delete(lost.url);
+    const { message } = posted([made.screenshot('b.png', egg()), lost], {
+      channelId: BOARD,
+      inThread: true,
+    });
+    await made.trigger.handle(message);
+    expect(made.store.active()).toHaveLength(1);
+    expect(made.store.active()[0]?.attendees[AUTHOR]).toBeDefined();
+    const [dm] = made.said();
+    expect(dm).toMatch(/- 1: There is already a raid at Old Stone Fountain: <#\d+>\./);
+    expect(dm).toContain(
+      '- 2: I could not download that screenshot from Discord. Try again in a moment.',
+    );
+  });
+
+  it('reads a board’s picture passively where passive reading is on, and leaves the rest to the keeper', async () => {
+    const off = await setup();
+    const quiet = posted([off.screenshot('a.png', egg())], {
+      channelId: BOARD,
+      inThread: true,
+      mentionsBot: false,
+    });
+    // Not taken: the keeper deletes it as any member's message.
+    await expect(off.trigger.handle(quiet.message)).resolves.toBe(false);
+    expect(off.taken).toEqual([]);
+    const on = await setup({ passive: true });
+    const read = posted([on.screenshot('a.png', egg())], {
+      channelId: BOARD,
+      inThread: true,
+      mentionsBot: false,
+    });
+    await expect(on.trigger.handle(read.message)).resolves.toBe(true);
+    expect(on.store.active()).toHaveLength(1);
+    // No picture at all, or another post than a board: not the trigger's.
+    const text = posted([], { channelId: BOARD, inThread: true });
+    await expect(on.trigger.handle(text.message)).resolves.toBe(false);
+    const elsewhere = posted([on.screenshot('c.png', egg())], {
+      channelId: '850000000000000009',
+      inThread: true,
+    });
+    await expect(on.trigger.handle(elsewhere.message)).resolves.toBe(false);
+  });
+});
+
+describe('boardDmText (review F6)', () => {
+  it('keeps whole lines within a DM and counts those that do not fit', () => {
+    const lines = Array.from(
+      { length: 10 },
+      (_, n) => `- ${String(n + 1)}: ${'x'.repeat(300)} <#${String(800000000000000000 + n)}>`,
+    );
+    const text = boardDmText('From your screenshots:', lines);
+    expect(text.length).toBeLessThanOrEqual(2_000);
+    const kept = text.split('\n');
+    expect(kept[0]).toBe('From your screenshots:');
+    expect(kept.slice(1, -1)).toEqual(lines.slice(0, kept.length - 2));
+    expect(kept.at(-1)).toBe(`…and ${String(lines.length - (kept.length - 2))} more`);
+    // Every line fits: all of them, nothing counted.
+    expect(boardDmText('Head:', ['- a', '- b'])).toBe('Head:\n- a\n- b');
+  });
+});
+
+describe('a max battle’s screenshot posted in the region’s board (plan 8R-9F)', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('points to /max screenshot: where the Power Spot is not clear, and reports a clear one', async () => {
+    const pond = keptRow(2, {
+      id: 'c0ffee00c0ffee00c0ffee00c0ffee01.16',
+      kind: 'powerspot',
+      title: 'Gazebo of the Pond',
+      lat: TEST_SPOT.lat + 0.0001,
+      lon: TEST_SPOT.lon,
+    });
+    const made = await maxReportingWith({ moderation: null }, [pond]);
+    const shots = screenshotsWith(made.ctx);
+    const ctx: AppContext = {
+      ...made.ctx,
+      screenshots: shots.screenshots,
+      config: {
+        ...made.ctx.config,
+        settings: {
+          ...made.ctx.config.settings,
+          ocr: { ...made.ctx.config.settings.ocr, enabled: true },
+        },
+      },
+    };
+    const west = made.ctx.regions.byChannel(WEST_CHANNEL)!;
+    const trigger = new ScreenshotTrigger({ ctx, board: boardOf(west, shots).board });
+    const dms = ctx.dms as RecordingDms;
+    const unsure = posted([shots.screenshot('a.png', maxReading('GAZEBO OF THE P'))], {
+      channelId: BOARD,
+      inThread: true,
+    });
+    await trigger.handle(unsure.message);
+    expect(made.store.active()).toEqual([]);
+    expect(unsure.replies).toEqual([]);
+    expect(dms.to(AUTHOR)[0]?.content).toContain(
+      'I could not tell which Power Spot this is: report it with `/max screenshot:`, which asks ' +
+        'you privately.',
+    );
+    const clear = posted([shots.screenshot('b.png', maxReading())], {
+      channelId: BOARD,
+      inThread: true,
+    });
+    await trigger.handle(clear.message);
+    await made.service.flush();
+    expect(made.store.active()).toHaveLength(1);
+    expect(dms.to(AUTHOR)[1]?.content).toMatch(/Reported|max battle/);
+  });
+});
diff --git a/src/commands/screenshots/mention.ts b/src/commands/screenshots/mention.ts
index 6cf27373..fb39a28f 100644
--- a/src/commands/screenshots/mention.ts
+++ b/src/commands/screenshots/mention.ts
@@ -10,6 +10,10 @@ import {
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
+import type { Region } from '../../db/repositories/region-repository.js';
+import type { BoardMessage } from '../../discord/party-gateway.js';
+import { DM_PRIORITY } from '../../services/dm-sender.js';
+import type { TakeOutcome } from '../../services/board-keeper.js';
 import { BoundedMap } from '../../bounded-map.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
@@ -37,6 +41,7 @@ import { PendingRequests } from '../../services/pending-requests.js';
 import {
   screenshotsOf,
   unreadWords,
+  type FetchedScreenshot,
   type ScreenshotOutcome,
   type ScreenshotSource,
 } from '../../services/screenshot-service.js';
@@ -137,6 +142,11 @@ interface Batch {
   done: boolean;
   /** Called when one more image made or joined a raid: the message goes when all have. */
   finish: () => Promise<void>;
+  /**
+   * Read from the region's board (plan 8R-9F): nothing is asked; where a mention would ask, the
+   * words point to the command that asks privately (R1), and what is made is said too.
+   */
+  board?: true;
 }
 
 /** What came of one image: a raid made or joined, a question asked, why not, or a reader that cannot read. */
@@ -269,8 +279,66 @@ const answeredShots = new BoundedMap<string, true>(1_000);
 /** The questions of the trigger, for the controls of the kind `shot` that answer them. */
 export const pendingShots = new PendingRequests<PendingShot>({ ttlMs: QUESTION_MS + 60_000 });
 
+/**
+ * The region's board as the trigger needs it (plan 8R-9F; `BoardKeeper`): which region a board
+ * post is, and taking a message out of it once its pictures are downloaded (B2).
+ */
+export interface BoardTaker {
+  regionOfBoard(channelId: string): Region | undefined;
+  /** What came of the message (review F1): the DM's opening says it. */
+  take(region: Region, message: BoardMessage, tell: boolean): Promise<TakeOutcome>;
+}
+
+/** A DM holds this many characters. */
+const DM_LIMIT = 2_000;
+
+/**
+ * The board's DM (plan 8R-9F, review F6): the opening, then as many whole lines as fit in a DM,
+ * the rest counted (`…and N more`), so that no channel or link is cut.
+ */
+export function boardDmText(head: string, lines: readonly string[]): string {
+  const all = [head, ...lines].join('\n');
+  if (all.length <= DM_LIMIT) return all;
+  const kept: string[] = [head];
+  let length = head.length;
+  for (const [index, line] of lines.entries()) {
+    const more = `…and ${String(lines.length - index)} more`;
+    if (length + 1 + line.length + 1 + more.length > DM_LIMIT) {
+      kept.push(more);
+      break;
+    }
+    kept.push(line);
+    length += 1 + line.length;
+  }
+  return kept.join('\n');
+}
+
+/** Said in the board's DM where a raid's gym is not clear (R1): `/raid` asks privately. */
+export const RAID_UNSURE_IN_BOARD =
+  'I could not tell which gym this is: report it with `/raid screenshot:`, which asks you privately.';
+/** Said in the board's DM where a max battle's Power Spot is not clear (R1). */
+export const MAX_UNSURE_IN_BOARD =
+  'I could not tell which Power Spot this is: report it with `/max screenshot:`, which asks you ' +
+  'privately.';
+/** Said in the board's DM of a max battle's screen read passively without a countdown. */
+const MAX_NO_COUNTDOWN_IN_BOARD =
+  'That max battle’s screen shows no countdown: report it with `/max screenshot:`.';
+
+/** A clear place of another region, in the board's DM (R1): the command asks whether. */
+function elsewhereInBoard(place: string, regionChannelId: string, command: string): string {
+  return (
+    `${place} is in <#${regionChannelId}>: report it with \`${command}\`, which asks you ` +
+    'whether to report it there.'
+  );
+}
+
+/** How long the board's DM waits in line before it is not worth sending. */
+const BOARD_DM_EXPIRES_MS = 60 * 60_000;
+
 export interface ScreenshotTriggerOptions {
   ctx: AppContext;
+  /** The region's boards (plan 8R-9F): without it a picture in any post is left alone. */
+  board?: BoardTaker;
   /** How long a reply stays (`settings.messageCleanupDelayError`). */
   replyMs?: number;
   /** How long a question stays unanswered (`QUESTION_MS`). */
@@ -289,12 +357,17 @@ export class ScreenshotTrigger {
     this.now = options.now ?? Date.now;
   }
 
-  /** Handles one posted message; never throws (what fails is logged). */
-  async handle(message: PostedMessage): Promise<void> {
+  /**
+   * Handles one posted message; never throws (what fails is logged). True where it took a
+   * message of the region's board (plan 8R-9F): it had it deleted and answers by DM; false
+   * leaves a board's message to the keeper.
+   */
+  async handle(message: PostedMessage): Promise<boolean> {
     try {
-      await this.handleNow(message);
+      return await this.handleNow(message);
     } catch (err) {
       this.options.ctx.log.error({ err }, 'could not read the screenshots of a message');
+      return false;
     }
   }
 
@@ -310,21 +383,26 @@ export class ScreenshotTrigger {
     await Promise.all(replies.map((reply) => reply.delete().catch(() => undefined)));
   }
 
-  private async handleNow(message: PostedMessage): Promise<void> {
+  private async handleNow(message: PostedMessage): Promise<boolean> {
     const { ctx } = this.options;
-    if (this.closed || !ctx.config.settings.ocr.enabled) return;
-    if (message.authorBot || message.guildId === null || message.inThread) return;
+    if (this.closed || !ctx.config.settings.ocr.enabled) return false;
+    if (message.authorBot || message.guildId === null) return false;
     // Off in rehearsal mode: it reacts to and answers in a region channel, where every member
     // would see it. The testers report from a screenshot with /raid, answered privately.
-    if (ctx.rehearsal) return;
+    if (ctx.rehearsal) return false;
     const passive = !message.mentionsBot;
-    if (passive && !(ctx.config.settings.ocr.passive && ctx.features.ocrPassive)) return;
+    if (passive && !(ctx.config.settings.ocr.passive && ctx.features.ocrPassive)) return false;
+    // A post is read only where it is the region's board (plan 8R-9F).
+    if (message.inThread) {
+      const board = this.options.board?.regionOfBoard(message.channelId);
+      return board ? this.readBoard(message, board, passive) : false;
+    }
     const region = ctx.regions.byChannel(message.channelId);
-    if (!region) return;
+    if (!region) return false;
     const images = screenshotsOf(message.attachments);
-    if (images.length === 0) return;
+    if (images.length === 0) return false;
     const guildRow = await ctx.guilds.idFor(message.guildId);
-    if (guildRow === undefined) return;
+    if (guildRow === undefined) return false;
     const batch: Batch = {
       message,
       images: images.length,
@@ -342,7 +420,7 @@ export class ScreenshotTrigger {
     let reacted = false;
     try {
       for (const image of images) {
-        if (this.closed) return;
+        if (this.closed) return false;
         // The reader cannot read just now: the rest of the message waits for nothing.
         if (stopped) break;
         const countedAt = this.now();
@@ -409,6 +487,133 @@ export class ScreenshotTrigger {
       await this.say(message, { content: truncate(content, 2_000), ping: message.authorId });
     }
     await this.finished(batch);
+    return false;
+  }
+
+  /**
+   * Screenshots posted in the region's board (plan 8R-9F, design item 4): every picture is
+   * downloaded first, then the message is taken out of the board (`BoardTaker.take`, the keeper's
+   * delete; B2: reading one after the other would leave it there for minutes), then the bytes
+   * are read as a message of the region's channel, decided by the very functions of a mention,
+   * passive or not. The answer is a DM of what each picture made or joined, why not, or where it
+   * was unsure (a gym or Power Spot not clear, a place of another region) the command that asks
+   * privately (R1); nothing is said, asked or marked in the board (B11). A member whose DMs are
+   * closed hears nothing (the board shows what was made). False where there is no picture.
+   */
+  private async readBoard(
+    posted: PostedMessage,
+    region: Region,
+    passive: boolean,
+  ): Promise<boolean> {
+    const { ctx } = this.options;
+    const images = screenshotsOf(posted.attachments);
+    if (images.length === 0 || posted.guildId === null) return false;
+    const guildRow = await ctx.guilds.idFor(posted.guildId);
+    if (guildRow === undefined) return false;
+    const said: string[] = [];
+    const counted: { index: number; image: ScreenshotSource; countedAt: number }[] = [];
+    for (const [index, image] of images.entries()) {
+      const countedAt = this.now();
+      const until = this.throttles.use('screenshot', posted.authorId, MENTION_THROTTLE, countedAt);
+      if (until !== undefined) {
+        said[index] =
+          `You have sent many screenshots just now, so I did not read this one. Try again in ${waitText(until)}.`;
+        continue;
+      }
+      counted.push({ index, image, countedAt });
+    }
+    // All at once (review F3; ten at most, `screenshotsOf`): the message goes after the slowest.
+    const had = await Promise.all(counted.map(({ image }) => ctx.screenshots.fetch(image)));
+    const fetched: { index: number; image: FetchedScreenshot; countedAt: number }[] = [];
+    for (const [n, { index, countedAt }] of counted.entries()) {
+      const one = had[n];
+      if (one?.kind === 'fetched') fetched.push({ index, image: one.screenshot, countedAt });
+      else if (one) said[index] = unreadWords(one);
+    }
+    const taken = await this.options.board?.take(
+      region,
+      {
+        id: posted.id,
+        authorId: posted.authorId,
+        by: 'member',
+        system: false,
+        createdAt: posted.createdAt,
+      },
+      false,
+    );
+    // Read as a message of the region's channel; nothing of it is done in the board.
+    const nothing = (): Promise<void> => Promise.resolve();
+    const message: PostedMessage = {
+      ...posted,
+      channelId: region.channelId,
+      inThread: false,
+      bare: false,
+      react: nothing,
+      unreact: nothing,
+      reply: () => Promise.resolve(undefined),
+      delete: nothing,
+    };
+    const batch: Batch = {
+      message,
+      images: images.length,
+      made: 0,
+      done: true,
+      finish: nothing,
+      board: true,
+    };
+    let stopped: Exclude<ScreenshotOutcome, { kind: 'read' }> | undefined;
+    for (const { index, image, countedAt } of fetched) {
+      if (this.closed) break;
+      if (stopped) {
+        said[index] = unreadWords(stopped);
+        continue;
+      }
+      const giveBack = (): void =>
+        this.throttles.giveBack(
+          'screenshot',
+          posted.authorId,
+          MENTION_THROTTLE,
+          this.now(),
+          countedAt,
+        );
+      const result = await this.readOne(batch, image, guildRow, passive, giveBack);
+      if (result.kind === 'stopped') {
+        stopped = result.outcome;
+        said[index] = unreadWords(stopped);
+      } else if (result.kind === 'made') {
+        said[index] = result.exists ?? 'Reported it.';
+      } else if (result.kind === 'refused' || result.kind === 'told') {
+        said[index] = result.words;
+      } else if (result.kind === 'ignored') {
+        said[index] = MAX_NO_COUNTDOWN_IN_BOARD;
+      }
+    }
+    // Closed after the delete (review F7): the shutdown leaves the member without the DM, as it
+    // leaves every answer on its way; accepted (the board shows what was made).
+    if (this.closed) return true;
+    // Every picture has its line (one the board flow left unsaid is one it was unsure of).
+    const lines = images.map((_, index) => {
+      const words = said[index] ?? RAID_UNSURE_IN_BOARD;
+      return images.length === 1 ? `- ${words}` : `- ${String(index + 1)}: ${words}`;
+    });
+    // The opening says what became of the message (review F1): taken out, left (a moderator's,
+    // Q1), or nothing where the delete failed.
+    const where = `From your ${images.length === 1 ? 'screenshot' : 'screenshots'} in <#${posted.channelId}>`;
+    const head =
+      taken === 'deleted'
+        ? `${where} (the board keeps only my lists, so I took your message out of it):`
+        : taken === 'kept'
+          ? `${where} (I left your message in the board):`
+          : `${where}:`;
+    const now = this.now();
+    ctx.dms.send({
+      userId: posted.authorId,
+      message: { content: boardDmText(head, lines) },
+      priority: DM_PRIORITY.normal,
+      eventAt: now,
+      expiresAt: now + BOARD_DM_EXPIRES_MS,
+    });
+    return true;
   }
 
   /**
@@ -457,16 +662,34 @@ export class ScreenshotTrigger {
         screenshotId: id,
       });
       if (reported.kind === 'exists') return { kind: 'made', exists: outcomeWords(reported, gym) };
-      if (reported.kind === 'created') return { kind: 'made' };
+      // A new raid is said by its link line in the channel; from the board, by DM too.
+      if (reported.kind === 'created') {
+        return batch.board
+          ? { kind: 'made', exists: outcomeWords(reported, gym) }
+          : { kind: 'made' };
+      }
       if (noPostMade(reported)) giveBack();
       return refused(outcomeWords(reported, gym));
     }
     if (passive) {
       // Read passively, a clear gym of another region (Matt, 2026-10-22): a raid there is joined
       // unasked; else its author is asked, Yes or No, whether to report it there.
-      if (decision.kind !== 'report') return { kind: 'asked' };
+      if (decision.kind !== 'report') {
+        return batch.board ? refused(RAID_UNSURE_IN_BOARD) : { kind: 'asked' };
+      }
       return this.elsewhere(batch, guildRow, decision.raid, id, giveBack);
     }
+    // From the board nothing is asked (R1): a clear gym of another region, or one not clear,
+    // is pointed to `/raid screenshot:`, which asks privately.
+    if (batch.board) {
+      const gym = decision.kind === 'report' ? ctx.gyms.get(decision.raid.gymId) : undefined;
+      const there = gym && ctx.partyService.regionFor(gym, message.channelId).region;
+      return refused(
+        gym && there
+          ? elsewhereInBoard(plain(gym.nickname || gym.name), there.channelId, '/raid screenshot:')
+          : RAID_UNSURE_IN_BOARD,
+      );
+    }
     const gyms = gymCandidates(ctx, message.channelId, guildRow, report.gym);
     const [first] = gyms;
     const assumed =
@@ -547,6 +770,12 @@ export class ScreenshotTrigger {
     // Asked only where a raid could be reported: a region of the server with a forum (review A3).
     const { region: there } = ctx.partyService.regionFor(gym, message.channelId);
     if (!there) return refused(refusalWords('no-gym'));
+    // From the board nothing is asked (R1).
+    if (batch.board) {
+      return refused(
+        elsewhereInBoard(plain(gym.nickname || gym.name), there.channelId, '/raid screenshot:'),
+      );
+    }
     const pending: PendingShot = {
       kind: 'gym',
       raid,
@@ -612,6 +841,7 @@ export class ScreenshotTrigger {
     }
     if (decision.kind === 'ask' && decision.about === 'tier') return refused(MAX_TIER_UNKNOWN);
     if (decision.kind === 'ask') {
+      if (batch.board && !passive) return refused(MAX_UNSURE_IN_BOARD);
       return passive
         ? told(MAX_SPOT_UNTOLD)
         : this.askSpot(batch, outcome, decision.spots, guildRow, giveBack);
@@ -620,6 +850,21 @@ export class ScreenshotTrigger {
     // A clear spot of this region is reported unasked; one of another region is asked about
     // with a mention, and joined there or asked Yes or No about read passively (Matt's M1).
     const local = match.kind === 'clear' && match.spot.local;
+    if (!local && !passive && batch.board) {
+      // From the board nothing is asked (R1): pointed to `/max screenshot:`.
+      const request =
+        match.kind === 'clear'
+          ? maxShotRequest(
+              ctx,
+              guildRow,
+              decision.battle,
+              report.boss?.name ?? '',
+              message.channelId,
+              id,
+            )
+          : undefined;
+      return refused(request ? this.spotElsewhereWords(request) : MAX_UNSURE_IN_BOARD);
+    }
     if (!local && !passive) {
       return this.askSpot(
         batch,
@@ -652,8 +897,23 @@ export class ScreenshotTrigger {
     const words = maxShotWords(ctx, answer, request);
     if (!maxShotMade(answer)) return refused(words);
     // A new battle is said by its link line in the region channel; anything else in the reply.
+    // From the board everything is said, by DM.
     const created = answer.kind === 'reported' && answer.result.outcome.kind === 'created';
-    return created ? { kind: 'made' } : { kind: 'made', exists: words };
+    return created && !batch.board ? { kind: 'made' } : { kind: 'made', exists: words };
+  }
+
+  /**
+   * A clear Power Spot of another region, in the board's DM (R1): the command asks whether to
+   * report it there; where it lies in no region of the server with a forum, as not clear.
+   */
+  private spotElsewhereWords(request: MaxShotRequest): string {
+    const { region: there } = this.options.ctx.partyService.regionForSpot(
+      request.spot,
+      request.regionChannelId,
+    );
+    return there
+      ? elsewhereInBoard(plain(maxSpotName(request.spot)), there.channelId, '/max screenshot:')
+      : MAX_UNSURE_IN_BOARD;
   }
 
   /**
@@ -726,6 +986,12 @@ export class ScreenshotTrigger {
     const { message } = batch;
     const { region: there } = ctx.partyService.regionForSpot(request.spot, message.channelId);
     if (!there || request.spot.kind !== 'powerspot') return refused(SPOT_GONE);
+    // From the board nothing is asked (R1).
+    if (batch.board) {
+      return refused(
+        elsewhereInBoard(plain(maxSpotName(request.spot)), there.channelId, '/max screenshot:'),
+      );
+    }
     const pending: PendingShot = {
       kind: 'spot',
       spotIds: [request.spot.id],
diff --git a/src/services/board-keeper.test.ts b/src/services/board-keeper.test.ts
index d06aaa23..e84d31a3 100644
--- a/src/services/board-keeper.test.ts
+++ b/src/services/board-keeper.test.ts
@@ -94,6 +94,48 @@ describe('BoardKeeper: what members write in the board (plan 8R-9F)', () => {
     expect(dms.jobs).toEqual([]);
   });
 
+  it('leaves to the screenshot reader a message it takes, and deletes one it does not (plan 8R-9F, B2)', async () => {
+    const { keeper, board, gateway, dms } = await keeping();
+    const message = (id: string) => ({
+      id,
+      channelId: board,
+      guildId: gateway.guildId,
+      authorId: MEMBER,
+      by: 'member' as const,
+      system: false,
+      createdAt: 0,
+    });
+    const asked: string[] = [];
+    keeper.posted(message(gateway.write(board, MEMBER)), () => {
+      asked.push('read');
+      return Promise.resolve(true);
+    });
+    await keeper.flush();
+    expect(asked).toEqual(['read']);
+    expect(gateway.deleted).toEqual([]);
+    const plain = gateway.write(board, MEMBER);
+    keeper.posted(message(plain), () => Promise.resolve(false));
+    await keeper.flush();
+    expect(gateway.deleted.map((one) => one.messageId)).toEqual([plain]);
+    expect(dms.recipients).toEqual([MEMBER]);
+  });
+
+  it('says what came of a message it was asked to take: deleted, kept, failed (review F1)', async () => {
+    const { keeper, board, gateway, west } = await keeping();
+    gateway.managers.add(MODERATOR);
+    const message = (authorId: string) => ({
+      id: gateway.write(board, authorId),
+      authorId,
+      by: 'member' as const,
+      system: false,
+      createdAt: 0,
+    });
+    await expect(keeper.take(west, message(MEMBER), false)).resolves.toBe('deleted');
+    await expect(keeper.take(west, message(MODERATOR), false)).resolves.toBe('kept');
+    gateway.noManaging.add(WEST_FORUM);
+    await expect(keeper.take(west, message(OTHER), false)).resolves.toBe('failed');
+  });
+
   it('leaves alone what is written outside a board', async () => {
     const { keeper, posted, gateway } = await keeping();
     expect(posted(WEST_CHANNEL, MEMBER).outcome).toBe('elsewhere');
diff --git a/src/services/board-keeper.ts b/src/services/board-keeper.ts
index c84564aa..c6a49d74 100644
--- a/src/services/board-keeper.ts
+++ b/src/services/board-keeper.ts
@@ -28,6 +28,12 @@ export interface PostedBoardMessage extends BoardMessage {
  */
 export type BoardOutcome = 'elsewhere' | 'kept' | 'taken';
 
+/**
+ * What `BoardKeeper.take` made of a message (review F1): `deleted` (or gone already), `kept` (a
+ * moderator's, Q1), `failed` (the delete refused or failed, or who wrote it not known).
+ */
+export type TakeOutcome = 'deleted' | 'kept' | 'failed';
+
 export interface BoardKeeperOptions {
   regions: Pick<RegionProvider, 'all'>;
   gateway: Pick<
@@ -76,36 +82,45 @@ export class BoardKeeper {
    * A message was written (`MessageCreate`, before its bot filter, B3). One in a board that is
    * neither the bot's own nor Discord's is deleted in the background (`flush` waits for it).
    */
-  posted(message: PostedBoardMessage): BoardOutcome {
+  posted(message: PostedBoardMessage, readShots?: () => Promise<boolean>): BoardOutcome {
     const region = this.regionOfBoard(message.channelId);
     if (!region) return 'elsewhere';
     if (message.by === 'me' || message.system) return 'kept';
-    this.track(this.take(region, message));
+    // A message of pictures goes to the screenshot reader first (B2): one it takes, it downloads
+    // and has deleted (`take`) before it reads; one it does not is deleted here.
+    this.track(
+      (async () => {
+        if (readShots && (await readShots().catch(() => false))) return;
+        await this.take(region, message);
+      })(),
+    );
     return 'taken';
   }
 
   /**
-   * Deletes a message of the board unless a moderator wrote it (Q1), and tells its member; for
-   * the screenshot flow (plan 8R-9F, B2) it is called once the pictures are downloaded. Never
-   * throws.
+   * Deletes a message of the board unless a moderator wrote it (Q1), and tells its member once a
+   * day where `tell`; the screenshot flow (B2) calls it once the pictures are downloaded, without
+   * `tell`, as its own DM says what became of them. Never throws.
    */
-  async take(region: Region, message: BoardMessage): Promise<void> {
+  async take(region: Region, message: BoardMessage, tell = true): Promise<TakeOutcome> {
     const boardId = region.summaryMessageId;
-    if (boardId === null) return;
+    if (boardId === null) return 'failed';
     try {
       // From the cache: the message just put its member there.
       if (
         message.by === 'member' &&
         (await this.options.gateway.managesMessages(boardId, message.authorId, false))
       ) {
-        return;
+        return 'kept';
       }
     } catch (err) {
       this.options.log.warn({ err, region: region.id }, 'could not tell who wrote in the board');
-      return;
+      return 'failed';
     }
-    const deleted = await this.deleteOne(region, message.id);
-    if (deleted) this.deletedFrom(region, [message]);
+    const answer = await this.deleteOne(region, message.id);
+    if (answer === 'deleted') this.deletedFrom(region, tell ? [message] : []);
+    // A message gone already is out of the board as well (review F1).
+    return answer === 'failed' ? 'failed' : 'deleted';
   }
 
   /**
@@ -164,19 +179,19 @@ export class BoardKeeper {
       old.unshift(...young);
     }
     for (const message of old) {
-      if (await this.deleteOne(region, message.id)) deleted.push(message);
+      if ((await this.deleteOne(region, message.id)) === 'deleted') deleted.push(message);
     }
     if (deleted.length > 0) this.deletedFrom(region, deleted);
   }
 
   /** Deletes one message of the board: whether it was there and is deleted now. */
-  private async deleteOne(region: Region, messageId: string): Promise<boolean> {
+  private async deleteOne(
+    region: Region,
+    messageId: string,
+  ): Promise<'deleted' | 'gone' | 'failed'> {
     const boardId = region.summaryMessageId;
-    if (boardId === null) return false;
-    const answer = await this.attempt(region, () =>
-      this.options.gateway.deleteReported(boardId, messageId),
-    );
-    return answer === 'deleted';
+    if (boardId === null) return 'failed';
+    return this.attempt(region, () => this.options.gateway.deleteReported(boardId, messageId));
   }
 
   /**
diff --git a/src/services/screenshot-service.test.ts b/src/services/screenshot-service.test.ts
index aa5f7095..fe749ead 100644
--- a/src/services/screenshot-service.test.ts
+++ b/src/services/screenshot-service.test.ts
@@ -195,6 +195,28 @@ describe('ScreenshotService', () => {
     expect(attachments.asked).toEqual([]);
   });
 
+  it('downloads a screenshot ahead and reads it later without downloading again (plan 8R-9F, B2)', async () => {
+    const { screenshots, screenshot, attachments, reader } = screenshotsWith();
+    const source = screenshot('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
+    const fetched = await screenshots.fetch(source);
+    if (fetched.kind !== 'fetched') throw new Error(fetched.kind);
+    expect(attachments.asked).toHaveLength(1);
+    expect(reader.reads).toBe(0);
+    attachments.failing = true;
+    expect(await screenshots.read(fetched.screenshot, where())).toMatchObject({
+      kind: 'read',
+      report: { gym: { gymId: 2 } },
+    });
+    expect(attachments.asked).toHaveLength(1);
+    // What keeps it from being had: too large, the download.
+    expect(await screenshots.fetch(screenshot('x.png', { kind: 'busy' }))).toEqual({
+      kind: 'download-failed',
+    });
+    expect(await screenshots.fetch({ ...source, size: MAX_SCREENSHOT_BYTES + 1 })).toEqual({
+      kind: 'too-large',
+    });
+  });
+
   it('tells who waits how many are ahead', async () => {
     const { screenshots, screenshot, reader } = screenshotsWith();
     reader.ahead = 2;
diff --git a/src/services/screenshot-service.ts b/src/services/screenshot-service.ts
index 31325506..e7ce4408 100644
--- a/src/services/screenshot-service.ts
+++ b/src/services/screenshot-service.ts
@@ -156,9 +156,29 @@ export type ScreenshotOutcome =
   | { kind: 'unavailable' }
   | { kind: 'failed' };
 
+/**
+ * A screenshot downloaded ahead of its reading (plan 8R-9F, B2: a picture posted in the region's
+ * board is downloaded, its message deleted, then read from these bytes).
+ */
+export interface FetchedScreenshot extends ScreenshotSource {
+  bytes: Uint8Array;
+}
+
+/** What `Screenshots.fetch` had of a screenshot. */
+export type FetchOutcome =
+  | { kind: 'fetched'; screenshot: FetchedScreenshot }
+  | { kind: 'too-large' }
+  | { kind: 'download-failed' };
+
 /** Screenshots on Discord: read, reported on, kept, and what members say of them. */
 export interface Screenshots {
-  read(source: ScreenshotSource, where: ScreenshotWhere): Promise<ScreenshotOutcome>;
+  /** Reads a screenshot, downloaded now, or ahead by `fetch` (then not again). */
+  read(
+    source: ScreenshotSource | FetchedScreenshot,
+    where: ScreenshotWhere,
+  ): Promise<ScreenshotOutcome>;
+  /** Downloads a screenshot to be read later (plan 8R-9F, B2), within `MAX_SCREENSHOT_BYTES`. */
+  fetch(source: ScreenshotSource): Promise<FetchOutcome>;
   /** The kept screenshot; `gone` when its file vanished. */
   get(id: string): Promise<KeptScreenshot | 'gone' | undefined>;
   /** A raid's post shows the screenshot: it is kept while the raid lasts. */
@@ -210,18 +230,34 @@ export type ScreenshotContext = Pick<
 export class ScreenshotService implements Screenshots {
   constructor(private readonly options: ScreenshotServiceOptions) {}
 
-  async read(source: ScreenshotSource, where: ScreenshotWhere): Promise<ScreenshotOutcome> {
-    const { attachments, reader, store, context } = this.options;
+  async fetch(source: ScreenshotSource): Promise<FetchOutcome> {
     if (source.size > MAX_SCREENSHOT_BYTES) return { kind: 'too-large' };
-    // Nothing is downloaded that the reader would turn away.
-    if (reader.full()) return { kind: 'busy' };
-    const download = await attachments.download(source.url, {
+    const download = await this.options.attachments.download(source.url, {
       maxBytes: MAX_SCREENSHOT_BYTES,
       timeoutMs: DOWNLOAD_MS,
     });
     if (!download.ok) {
       return download.reason === 'too-large' ? { kind: 'too-large' } : { kind: 'download-failed' };
     }
+    return { kind: 'fetched', screenshot: { ...source, bytes: download.bytes } };
+  }
+
+  async read(
+    source: ScreenshotSource | FetchedScreenshot,
+    where: ScreenshotWhere,
+  ): Promise<ScreenshotOutcome> {
+    const { reader, store, context } = this.options;
+    if (source.size > MAX_SCREENSHOT_BYTES) return { kind: 'too-large' };
+    // Nothing is downloaded that the reader would turn away.
+    if (reader.full()) return { kind: 'busy' };
+    let download: { bytes: Uint8Array };
+    if ('bytes' in source) {
+      download = source;
+    } else {
+      const fetched = await this.fetch(source);
+      if (fetched.kind !== 'fetched') return fetched;
+      download = fetched.screenshot;
+    }
     const outcome = await reader.read(download.bytes, {
       ...(where.onQueued ? { onQueued: where.onQueued } : {}),
       ...(where.startBy === undefined ? {} : { startBy: where.startBy }),
````

### Task 3: 8R-9F task 3: the stops' cap of ten, Coming up's kind once, a line kept for its board

Prototype commit: `a97859ddca347c4e81990bfff2ff775dbfb14e6b`

MAX_POST_MESSAGES goes from 3 to 10 (Matt: a sanity limit, so a busy
day spills rather than cuts and a hideout is never what is lost); the
tests that filled three messages take data that fills ten, and B5's
order is checked over ten messages by the fake's send log.

M1 (B8): Coming up names a party's kind once. A meetup's and a raid
train's titles start with their kind (MEETUP_TITLE_KIND,
TRAIN_TITLE_KIND), so the line leaves it out ("Passing through" for a
raid train passing through); a train of another kind keeps its kind's
words. The tests use the real titles.

M2 (B9): a report whose board's message is not found though the region
has a board keeps its line's claim and waits for that channel's next
full draw (StopPostService.onDrawn, never told of a draw whose send
failed); tried once more then, let go if still nothing or at the day's
end; a region without a board lets go at once.

**Files:**

```
 src/render/meetup-post.ts          |   8 +++++-
 src/render/stop-post.test.ts       |  57 ++++++++++++++++++++++++++----------------
 src/render/stop-post.ts            |   7 ++++--
 src/render/summary.test.ts         |  43 ++++++++++++++++++++++----------
 src/render/summary.ts              |  62 ++++++++++++++++++++++++++++++++++-----------
 src/render/train-post.ts           |   8 +++++-
 src/services/party-service.test.ts |   2 +-
 src/services/stop-lines.test.ts    | 105 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/services/stop-lines.ts         |  82 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++----
 src/services/stop-posts.test.ts    |  98 +++++++++++++++++++++++++++++++++++++++++++++++++++--------------------
 src/services/stop-posts.ts         |  15 +++++++++++
 11 files changed, 401 insertions(+), 86 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/stop-post.test.ts src/render/summary.test.ts src/services/party-service.test.ts src/services/stop-lines.test.ts src/services/stop-posts.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff a97859ddca347c4e81990bfff2ff775dbfb14e6b -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md docs/superpowers/plans/2026-10-27-phase-8r9f-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-9F task 3: the stops' cap of ten, Coming up's kind once, a line kept for its board`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/render/meetup-post.ts b/src/render/meetup-post.ts
index f24cfae9..d5f235bd 100644
--- a/src/render/meetup-post.ts
+++ b/src/render/meetup-post.ts
@@ -164,9 +164,15 @@ function briefPlace(view: MeetupPostView): { line: string; map: string } | undef
   };
 }
 
+/**
+ * The kind word a meetup's title starts with (plan 8R-9F, M1: a list that shows the title does not
+ * say the kind again).
+ */
+export const MEETUP_TITLE_KIND = 'Meetup';
+
 /** `Meetup · Community Day picnic`: the title of the post, which is also how lists name it. */
 export function meetupTitle(party: MeetupParty): string {
-  return tidyTitle(truncate(tidyTitle(`Meetup · ${nameOf(party)}`), LIMITS.title));
+  return tidyTitle(truncate(tidyTitle(`${MEETUP_TITLE_KIND} · ${nameOf(party)}`), LIMITS.title));
 }
 
 /** What it is, and that it has ended once it is over. */
diff --git a/src/render/stop-post.test.ts b/src/render/stop-post.test.ts
index b2800a6b..36bdac55 100644
--- a/src/render/stop-post.test.ts
+++ b/src/render/stop-post.test.ts
@@ -18,6 +18,7 @@ import { StopPictures } from '../services/stop-pictures.js';
 import {
   BLOCK_ROOM,
   CLASSIC_BLOCK_ROOM,
+  MAX_POST_MESSAGES,
   postPictures,
   stopPostMessages,
   stopPostText,
@@ -191,22 +192,22 @@ describe('the post "Today’s Stops"', () => {
   it('keeps many tasks of several versions within Discord’s limits', () => {
     const view = {
       day: 'Saturday, November 21',
-      tasks: Array.from({ length: 30 }, (_, n) => versioned(n, 4)),
+      tasks: Array.from({ length: 100 }, (_, n) => versioned(n, 4)),
     };
     const { messages } = stopPostMessages(view);
-    expect(messages).toHaveLength(3);
+    expect(messages).toHaveLength(MAX_POST_MESSAGES);
     for (const message of messages) expectV2Sendable(message);
-    expect(textOf(messages[2])).toMatch(/…and \d+ more tasks$/);
+    expect(textOf(messages.at(-1))).toMatch(/…and \d+ more tasks$/);
     const classic = stopPostText(view).messages;
     for (const message of classic) expect(message.content?.length).toBeLessThanOrEqual(2_000);
   });
 
   it('is classic text of at most 2,000 characters a message, three at most', () => {
-    const many = Array.from({ length: 30 }, () => atStops(10));
+    const many = Array.from({ length: 100 }, () => atStops(10));
     const { messages } = stopPostText({ day: 'Saturday, November 21', tasks: many });
-    expect(messages).toHaveLength(3);
+    expect(messages).toHaveLength(MAX_POST_MESSAGES);
     for (const message of messages) expect(message.content?.length).toBeLessThanOrEqual(2_000);
-    expect(messages[2]?.content).toMatch(/…and \d+ more tasks$/);
+    expect(messages.at(-1)?.content).toMatch(/…and \d+ more tasks$/);
   });
 
   it('names whole stop lines only, counting those that do not fit (B6)', () => {
@@ -434,19 +435,33 @@ describe('the post "Today’s Stops"', () => {
     });
 
     it('spill after a full research into the next messages, counted at the end', () => {
-      const tasks = Array.from({ length: 30 }, (_, i) => atStops(10, `task-${String(i)}`));
+      const tasks = Array.from({ length: 100 }, (_, i) => atStops(10, `task-${String(i)}`));
       const hideouts = [hideout('giovanni', 3), hideout('leader:cliff', 3)];
       for (const layout of [
         stopPostMessages({ day: 'Saturday, November 21', tasks, hideouts }),
         stopPostText({ day: 'Saturday, November 21', tasks, hideouts }),
       ]) {
-        expect(layout.messages).toHaveLength(3);
+        expect(layout.messages).toHaveLength(MAX_POST_MESSAGES);
         expect(layout.placement.get('giovanni')).toBeUndefined();
-        const last = JSON.stringify(layout.messages[2]);
+        const last = JSON.stringify(layout.messages.at(-1));
         expect(last).toMatch(/…and \d+ more tasks and 2 more hideouts/);
       }
     });
 
+    it('spill a busy day into as many as ten messages rather than cut a hideout (plan 8R-9F)', () => {
+      const tasks = Array.from({ length: 6 }, (_, i) => atStops(10, `task-${String(i)}`));
+      const hideouts = [hideout('giovanni', 3), hideout('leader:cliff', 3)];
+      for (const layout of [
+        stopPostMessages({ day: 'Saturday, November 21', tasks, hideouts }),
+        stopPostText({ day: 'Saturday, November 21', tasks, hideouts }),
+      ]) {
+        expect(layout.messages.length).toBeGreaterThan(3);
+        expect(layout.messages.length).toBeLessThanOrEqual(10);
+        expect(layout.placement.get('giovanni')).toBe(layout.messages.length - 1);
+        expect(JSON.stringify(layout.messages)).not.toMatch(/…and \d+ more (tasks|hideout)/);
+      }
+    });
+
     it('is plain text too, after the research', () => {
       const { messages, placement } = stopPostText({
         day: 'Saturday, November 21',
@@ -809,7 +824,7 @@ describe('the pictures of the post (plan 8R-6)', () => {
     });
 
     it('lets the item and Mega Energy pictures go first, and keeps the Pokémon’s', () => {
-      const tasks = mixedTasks(15);
+      const tasks = mixedTasks(50);
       const layout = placingEvery(tasks);
       expect(picturesIn(layout.messages)).toEqual(tasks.map((_, t) => own(t).image));
       // The same input, the same layout: redraws do not flicker.
@@ -817,7 +832,7 @@ describe('the pictures of the post (plan 8R-6)', () => {
     });
 
     it('then keeps one picture per task, its first pictured line', () => {
-      const tasks = pokemonTasks(12, 3, 2);
+      const tasks = pokemonTasks(40, 3, 2);
       const { messages } = placingEvery(tasks);
       expect(picturesIn(messages)).toEqual(tasks.map((_, t) => own(t, 0).image));
       // Its first line by the order of the six: a Pokémon before an item listed above it.
@@ -827,13 +842,13 @@ describe('the pictures of the post (plan 8R-6)', () => {
     });
 
     it('then shows no picture rather than cut a task', () => {
-      expect(picturesIn(placingEvery(pokemonTasks(20, 3, 1)).messages)).toEqual([]);
+      expect(picturesIn(placingEvery(pokemonTasks(70, 3, 1)).messages)).toEqual([]);
     });
 
     it('spills and counts tasks away, without pictures, only when even that does not place every task', () => {
-      const tasks = pokemonTasks(60, 3, 1);
+      const tasks = pokemonTasks(250, 3, 1);
       const { messages, placement } = stopPostMessages({ day: DAY, tasks });
-      expect(messages).toHaveLength(3);
+      expect(messages).toHaveLength(MAX_POST_MESSAGES);
       for (const message of messages) expectV2Sendable(message);
       expect(textOf(messages.at(-1))).toMatch(/…and \d+ more tasks/);
       expect(tasks.filter((task) => placement.has(task.key)).length).toBeLessThan(tasks.length);
@@ -843,7 +858,7 @@ describe('the pictures of the post (plan 8R-6)', () => {
     // Review W5 of 8R-7: pictures cost components, not text, so on a day limited by text dropping
     // them places no more tasks; Matt's rule is about tasks.
     it('keeps every picture on a day limited by text, tasks spilling as they must', () => {
-      const tasks: PostTask[] = Array.from({ length: 6 }, (_, t) => ({
+      const tasks: PostTask[] = Array.from({ length: 20 }, (_, t) => ({
         key: `long${String(t)}`,
         research: { text: `Task long${String(t)}`, category: null, rewards: [], typed: false },
         versions: [
@@ -875,9 +890,9 @@ describe('the pictures of the post (plan 8R-6)', () => {
     it('asks `prepare` only for what the chosen layout shows, with the same lookup', () => {
       for (const tasks of [
         mixedTasks(10),
-        mixedTasks(15),
-        pokemonTasks(12, 3, 2),
-        pokemonTasks(20, 3, 1),
+        mixedTasks(50),
+        pokemonTasks(40, 3, 2),
+        pokemonTasks(70, 3, 1),
       ]) {
         const view = { day: DAY, tasks };
         // Each source once.
@@ -886,7 +901,7 @@ describe('the pictures of the post (plan 8R-6)', () => {
         ]);
       }
       // One picture per task: a source gone gives its place to the task’s next line, both asked for.
-      const tasks = pokemonTasks(12, 3, 2);
+      const tasks = pokemonTasks(40, 3, 2);
       const gone = (source: string) => (source === own(0, 0).image ? undefined : source);
       const view = { day: DAY, tasks };
       expect(postPictures(view, gone)).toEqual([
@@ -932,7 +947,7 @@ describe('the pictures of the post (plan 8R-6)', () => {
   });
 
   it('cuts only the day’s research waiting on a busy event day, the hideouts placed', () => {
-    const waiting = Array.from({ length: 30 }, (_, n) =>
+    const waiting = Array.from({ length: 100 }, (_, n) =>
       taskOf(`day${String(n)}`, [[LILEEP!], [ANORITH!], [item('Rare Candy')]], 5),
     );
     const hideouts: PostHideout[] = [
@@ -955,7 +970,7 @@ describe('the pictures of the post (plan 8R-6)', () => {
       hideouts,
     };
     for (const layout of [stopPostMessages(view), stopPostText(view)]) {
-      expect(layout.messages).toHaveLength(3);
+      expect(layout.messages).toHaveLength(MAX_POST_MESSAGES);
       for (const key of ['window', ...hideouts.map((hideout) => hideout.key)]) {
         expect(layout.placement.has(key)).toBe(true);
       }
diff --git a/src/render/stop-post.ts b/src/render/stop-post.ts
index 32a060b6..8fcc87e7 100644
--- a/src/render/stop-post.ts
+++ b/src/render/stop-post.ts
@@ -27,8 +27,11 @@ import { container, countComponents, section, separator, textDisplay, thumbnail
  * stays in the post below the window's, without pictures.
  */
 
-/** At most this many messages make one post (design 9.7). */
-export const MAX_POST_MESSAGES = 3;
+/**
+ * At most this many messages make one post (design 9.7: three; plan 8R-9F, Matt: a sanity limit
+ * of ten, so that a busy day spills rather than cuts, and a hideout is never what is lost).
+ */
+export const MAX_POST_MESSAGES = 10;
 
 /** Discord's limits of a message: 40 components; classic text 2,000 characters. */
 const MAX_COMPONENTS = 40;
diff --git a/src/render/summary.test.ts b/src/render/summary.test.ts
index efbc551f..52f97712 100644
--- a/src/render/summary.test.ts
+++ b/src/render/summary.test.ts
@@ -20,6 +20,8 @@ import type { MeetupParty, RaidParty, TrainParty } from '../domain/party/party.j
 import { setEndTime, setHatchTime } from '../domain/party/raid.js';
 import { endParty } from '../domain/party/party.js';
 import { TEXT_BUDGET } from './party-post.js';
+import { meetupTitle } from './meetup-post.js';
+import { trainTitle } from './train-post.js';
 import { LIST_COLOUR } from './v2.js';
 import { RAID_LEVELS, SHADOW_RAID_LEVELS } from '../domain/pogo/raid-tier.js';
 import type { MaxTier } from '../domain/pogo/max-tier.js';
@@ -657,17 +659,21 @@ describe('renderSummary: today and coming up (plan 8R-9)', () => {
       forumPostId: post(),
       timed: { ...made.timed, startTime: start },
     };
-    return { party, title: `Meetup · ${party.timed.name}` };
+    return { party, title: meetupTitle(party) };
   };
-  const trainAt = (order: number, start: number | null): ListedTrain => {
+  const trainAt = (
+    order: number,
+    start: number | null,
+    kind: TrainParty['train']['kind'] = 'raid',
+  ): ListedTrain => {
     const made = testTrain({ id: ID(900 + order), now: PARTY_NOW + order * MINUTE });
     const party: TrainParty = {
       ...made,
       forumPostId: post(),
       timed: { ...made.timed, startTime: start },
-      train: { ...made.train, route: stops(4) },
+      train: { ...made.train, route: stops(4), kind },
     };
-    return { party, title: `Train · ${party.timed.name}`, at: 'The Stacks' };
+    return { party, title: trainTitle(party), at: 'The Stacks' };
   };
   const link = (listed: { party: { forumPostId: string | null } }) =>
     `<#${listed.party.forumPostId ?? ''}>`;
@@ -677,11 +683,15 @@ describe('renderSummary: today and coming up (plan 8R-9)', () => {
     expect(LEGACY_SUMMARY_TITLES).toEqual(['Active raids', 'Going on now']);
   });
 
-  it('lists what starts after midnight under Coming up, one list by start, its kind first (B8)', () => {
+  it('lists what starts after midnight under Coming up, one list by start, its kind once (B8; plan 8R-9F, M1)', () => {
     const today = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
     const tonight = meetupAt(1, at('2026-10-13T22:00'));
     const saturday = meetupAt(2, at('2026-10-17T13:00'));
     const tomorrow = trainAt(3, at('2026-10-14T10:00'));
+    // A max battle train's title says "Train" only: its kind is named before it, "Train" once
+    // (review F9: `Max Battle <#post>` reads "Max Battle Train · …").
+    const maxTrain = trainAt(5, at('2026-10-16T09:00'), 'dynamax');
+    const giant = { ...trainAt(6, at('2026-10-16T12:00'), 'gigantamax'), copyUrl: POST };
     const elite = listed(
       setHatchTime(
         testRaid({ id: ID(2), tier: { level: 'Elite', shadow: false } }),
@@ -693,20 +703,27 @@ describe('renderSummary: today and coming up (plan 8R-9)', () => {
       '300000000000000002',
     );
     const passing = { ...trainAt(4, at('2026-10-14T18:00')), copyUrl: POST };
-    const message = renderSummary([today, elite], PARTY_NOW, [tonight, saturday], [tomorrow], [], {
-      passing: [passing],
-      zone: PARTY_ZONE,
-    });
+    const message = renderSummary(
+      [today, elite],
+      PARTY_NOW,
+      [tonight, saturday],
+      [tomorrow, maxTrain],
+      [],
+      { passing: [passing, giant], zone: PARTY_ZONE },
+    );
     expect(textDisplays(message)).toEqual([
-      '### Today and coming up\n1 raid · 1 meetup today · 4 coming up',
+      '### Today and coming up\n1 raid · 1 meetup today · 6 coming up',
       '**Level 5**\n<#300000000000000001> · no time set · 1 trainer',
       `**Meetups**\n${link(tonight)} · starts <t:${at('2026-10-13T22:00') / 1000}:R> · 1 trainer`,
       '**Coming up**\n' +
         [
-          `Train · ${link(tomorrow)} · ${dated(at('2026-10-14T10:00'))} · 1 trainer`,
-          `Train passing through · [Train · ${passing.party.timed.name}](<${POST}>) · ${dated(at('2026-10-14T18:00'))} · 1 trainer`,
+          // The posts' titles say "Train · …" and "Meetup · …": the kind is not said again.
+          `${link(tomorrow)} · ${dated(at('2026-10-14T10:00'))} · 1 trainer`,
+          `Passing through · [Train · ${passing.party.timed.name}](<${POST}>) · ${dated(at('2026-10-14T18:00'))} · 1 trainer`,
           `Elite raid · <#300000000000000002> · ${dated(at('2026-10-15T11:00'))} · 1 trainer`,
-          `Meetup · ${link(saturday)} · ${dated(at('2026-10-17T13:00'))} · 1 trainer`,
+          `Max Battle ${link(maxTrain)} · ${dated(at('2026-10-16T09:00'))} · 1 trainer`,
+          `Passing through · Gigantamax [Train · ${giant.party.timed.name}](<${POST}>) · ${dated(at('2026-10-16T12:00'))} · 1 trainer`,
+          `${link(saturday)} · ${dated(at('2026-10-17T13:00'))} · 1 trainer`,
         ].join('\n'),
     ]);
   });
diff --git a/src/render/summary.ts b/src/render/summary.ts
index 8739d22b..be8157ab 100644
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -11,6 +11,8 @@ import {
 } from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
 import { TRAIN_KIND_WORDS } from './train-words.js';
+import { MEETUP_TITLE_KIND } from './meetup-post.js';
+import { TRAIN_TITLE_KIND } from './train-post.js';
 import {
   RAID_LEVELS,
   raidTier,
@@ -231,7 +233,9 @@ interface Later {
 /**
  * A line of Coming up (plan 8R-9): its kind first, its post (a train passing through: its copy
  * here), the full date and time of its start (`f`, each reader's own zone) and how many come:
- * `Meetup · <post> · <t:…:f> · 7 trainers`.
+ * `Elite raid · <post> · <t:…:f> · 7 trainers`. The kind is left out where the post's title, which
+ * the post's link shows, says it already (plan 8R-9F, M1: `<post> · …` for a meetup titled
+ * "Meetup · …"); `kind` empty then.
  */
 function laterLine(
   kind: string,
@@ -242,13 +246,32 @@ function laterLine(
   return {
     start,
     createdAt: party.createdAt,
-    line: `${kind} · ${post} · ${timestamp(start, 'f')} · ${trainerCount(party)}`,
+    line: [...(kind === '' ? [] : [kind]), post, timestamp(start, 'f'), trainerCount(party)].join(
+      ' · ',
+    ),
   };
 }
 
-/** What a train is called under Coming up: `Train`, or its kind's words (plan 8X-4). */
-function trainWord(party: TrainParty): string {
-  return party.train.kind === 'raid' ? 'Train' : TRAIN_KIND_WORDS[party.train.kind];
+/** Whether a post's title starts with a kind word (`Meetup · …`, `Train · …`; plan 8R-9F, M1). */
+function titleSays(title: string, word: string): boolean {
+  return title.startsWith(`${word} · `);
+}
+
+/**
+ * How a train is named under Coming up (plan 8R-9F, M1, review F9), as `kind` (a part of its own
+ * before the post) and `lead` (words just before the post): where its title says "Train", a raid
+ * train says nothing more, and a train of another kind its kind's words without the "Train" the
+ * title says (`Gigantamax <#post>`, which reads "Gigantamax Train · …"); where its title does not,
+ * its kind's words as a part (`Train`, `Gigantamax Train`; plan 8X-4). `TRAIN_KIND_WORDS` stay.
+ */
+function trainNaming(party: TrainParty, title: string): { kind: string; lead: string } {
+  const words = party.train.kind === 'raid' ? TRAIN_TITLE_KIND : TRAIN_KIND_WORDS[party.train.kind];
+  if (!titleSays(title, TRAIN_TITLE_KIND)) return { kind: words, lead: '' };
+  if (party.train.kind === 'raid') return { kind: '', lead: '' };
+  const ending = ` ${TRAIN_TITLE_KIND}`;
+  return words.endsWith(ending)
+    ? { kind: '', lead: `${words.slice(0, -ending.length)} ` }
+    : { kind: words, lead: '' };
 }
 
 /** The heading of the trains in a region's list, under its raids and above its meetups. */
@@ -402,22 +425,33 @@ export function renderSummary(
       ),
     ...allTrains
       .filter(({ party }) => !today(party))
-      .map(({ party, title }) =>
-        laterLine(trainWord(party), postOf(party, title), startOf(party), party),
-      ),
+      .map(({ party, title }) => {
+        const { kind, lead } = trainNaming(party, title);
+        return laterLine(kind, `${lead}${postOf(party, title)}`, startOf(party), party);
+      }),
     ...allPassing
       .filter(({ party }) => !today(party))
-      .map(({ party, title, copyUrl }) =>
+      .map(({ party, title, copyUrl }) => {
+        const { kind, lead } = trainNaming(party, title);
+        const post =
+          copyUrl === undefined ? postOf(party, title) : `[${linkTextOf(title)}](<${copyUrl}>)`;
+        return laterLine(
+          kind === '' ? 'Passing through' : `${kind} passing through`,
+          `${lead}${post}`,
+          startOf(party),
+          party,
+        );
+      }),
+    ...allMeetups
+      .filter(({ party }) => !today(party))
+      .map(({ party, title }) =>
         laterLine(
-          `${trainWord(party)} passing through`,
-          copyUrl === undefined ? postOf(party, title) : `[${linkTextOf(title)}](<${copyUrl}>)`,
+          titleSays(title, MEETUP_TITLE_KIND) ? '' : MEETUP_TITLE_KIND,
+          postOf(party, title),
           startOf(party),
           party,
         ),
       ),
-    ...allMeetups
-      .filter(({ party }) => !today(party))
-      .map(({ party, title }) => laterLine('Meetup', postOf(party, title), startOf(party), party)),
   ].sort((a, b) => a.start - b.start || a.createdAt - b.createdAt);
   const stops = stopsLine(more.stops, more.stopsBelow === true);
   const todayCounts = [
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index be7d4eb9..013309ca 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -52,9 +52,15 @@ export interface TrainPostView extends TimedPostView<TrainParty>, TrainPlaces {
   catalogue: PokemonCatalogue;
 }
 
+/**
+ * The kind word a train's title starts with, whatever its kind (plan 8R-9F, M1: a list that
+ * shows the title says "Train" no second time; a train of max battles still says its kind).
+ */
+export const TRAIN_TITLE_KIND = 'Train';
+
 /** `Train · Saturday legendaries`: the title of the post, which is also how lists name it. */
 export function trainTitle(party: TrainParty): string {
-  return tidyTitle(truncate(tidyTitle(`Train · ${nameOf(party)}`), LIMITS.title));
+  return tidyTitle(truncate(tidyTitle(`${TRAIN_TITLE_KIND} · ${nameOf(party)}`), LIMITS.title));
 }
 
 /**
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index c31e8a25..c27f367d 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -657,7 +657,7 @@ describe('PartyService: the summary and tidying up', () => {
     const texts = textDisplays(service.summaryMessage(1, 'board'));
     expect(texts[0]).toBe('### Today and coming up\n1 coming up');
     expect(texts.at(-1)).toBe(
-      `**Coming up**\nMeetup · <#${tomorrow.postId}> · <t:${at('2026-10-14T18:00') / 1000}:f> · 1 trainer`,
+      `**Coming up**\n<#${tomorrow.postId}> · <t:${at('2026-10-14T18:00') / 1000}:f> · 1 trainer`,
     );
     service.setStopPosts({
       summaryOf: () => ({
diff --git a/src/services/stop-lines.test.ts b/src/services/stop-lines.test.ts
index e3cc8bde..a40590be 100644
--- a/src/services/stop-lines.test.ts
+++ b/src/services/stop-lines.test.ts
@@ -53,6 +53,8 @@ function linesWith() {
   const asked: string[] = [];
   /** What `messageOf` and the sends wait for while set (a moment held across midnight). */
   const gates: { messageOf?: Promise<void>; send?: Promise<void>; onSend?: () => void } = {};
+  /** Who hears of a channel's board drawn in full (plan 8R-9F, M2): `drawn` tells them. */
+  const drawnListeners: ((channelId: string) => void)[] = [];
   const posts = {
     messageOf: async (channelId: string, key: string): Promise<PostLink | undefined> => {
       asked.push(`${channelId} ${key}`);
@@ -62,7 +64,21 @@ function linesWith() {
         ? undefined
         : { channelId: board, messageId: String(key.length) };
     },
+    onDrawn: (listener: (channelId: string) => void) => {
+      drawnListeners.push(listener);
+    },
+  };
+  const drawn = (channelId: string) => {
+    for (const listener of drawnListeners) listener(channelId);
   };
+  /** The regions, West's board recorded where `boarded` names it (a board of its own, M2). */
+  const boarded = new Set<string>();
+  const regions = () =>
+    testRegions().map((region) =>
+      boarded.has(region.channelId)
+        ? { ...region, summaryMessageId: BOARDS[region.channelId] ?? null }
+        : region,
+    );
   const held = {
     sendMessage: async (...args: Parameters<FakePartyGateway['sendMessage']>) => {
       gates.onSend?.();
@@ -77,7 +93,7 @@ function linesWith() {
       storage,
       reports,
       posts,
-      regions: { all: () => testRegions() },
+      regions: { all: regions },
       guilds: { idFor: (id) => Promise.resolve(id === FAKE_GUILD_ID ? 1 : undefined) },
       gateway: held,
       zone: ZONE,
@@ -123,6 +139,8 @@ function linesWith() {
     asked,
     gates,
     entries,
+    drawn,
+    boarded,
   };
 }
 
@@ -203,6 +221,91 @@ describe('StopLineService (plan 8R-9, B9)', () => {
     expect(made.said(EAST_CHANNEL)).toHaveLength(1);
   });
 
+  it('keeps the line of a report that finds its board gone, and sends it once the board is drawn again (plan 8R-9F, M2)', async () => {
+    made = linesWith();
+    made.boarded.add(WEST_CHANNEL);
+    // A moderator deleted the board: its draw failed, so nothing holds the task yet.
+    made.noBoard.add(WEST_CHANNEL);
+    const task = pageTask('Catch 7 Pokémon');
+    await made.report(task, [west(1)]);
+    await made.lines.flush();
+    expect(made.said()).toEqual([]);
+    // The claim stands: a second report meanwhile says nothing either.
+    await made.report(task, [west(2)]);
+    await made.lines.flush();
+    expect(made.said()).toEqual([]);
+    expect(made.storage.rows.size).toBe(1);
+    // The board is made anew and the stops drawn in it: the line is sent, linking it.
+    made.noBoard.delete(WEST_CHANNEL);
+    made.drawn(WEST_CHANNEL);
+    await made.lines.flush();
+    expect(made.said()).toEqual([
+      `Research: **Catch 7 Pokémon** (one of Magikarp, Stufful, Wimpod) → ${link(WEST_CHANNEL, task.key)}`,
+    ]);
+    // Drawn again: nothing more.
+    made.drawn(WEST_CHANNEL);
+    await made.lines.flush();
+    expect(made.said()).toHaveLength(1);
+  });
+
+  it('tries a waiting line once after the draw, then lets it go for a later report (M2, B9)', async () => {
+    made = linesWith();
+    made.boarded.add(WEST_CHANNEL);
+    made.noBoard.add(WEST_CHANNEL);
+    const task = pageTask('Catch 7 Pokémon');
+    await made.report(task, [west(1)]);
+    await made.lines.flush();
+    // Drawn, yet the board's message is still not found: the claim goes.
+    made.drawn(WEST_CHANNEL);
+    await made.lines.flush();
+    expect(made.storage.rows.size).toBe(0);
+    made.noBoard.delete(WEST_CHANNEL);
+    await made.report(task, [west(2)]);
+    await made.lines.flush();
+    expect(made.said()).toHaveLength(1);
+  });
+
+  it('forgets a waiting line at the day’s end, and lets go at once where the region has no board (M2)', async () => {
+    made = linesWith();
+    made.boarded.add(WEST_CHANNEL);
+    made.noBoard.add(WEST_CHANNEL);
+    await made.report(pageTask('Catch 7 Pokémon'), [west(1)]);
+    await made.lines.flush();
+    made.clock.now = at('2026-11-22T00:00:01');
+    await made.lines.sweep();
+    expect(made.storage.rows.size).toBe(0);
+    made.noBoard.delete(WEST_CHANNEL);
+    made.drawn(WEST_CHANNEL);
+    await made.lines.flush();
+    expect(made.said()).toEqual([]);
+    // East has no board recorded: its claim is let go at once (B9).
+    made.noBoard.add(EAST_CHANNEL);
+    await made.report(pageTask('Catch 7 Pokémon'), [east]);
+    await made.lines.flush();
+    expect(made.storage.rows.size).toBe(0);
+  });
+
+  it('lets the waiting claims go at shutdown, so a report after the restart says its line (review F4)', async () => {
+    made = linesWith();
+    made.boarded.add(WEST_CHANNEL);
+    made.noBoard.add(WEST_CHANNEL);
+    const task = pageTask('Catch 7 Pokémon');
+    await made.report(task, [west(1)]);
+    await made.lines.flush();
+    expect(made.storage.rows.size).toBe(1);
+    await made.lines.close();
+    expect(made.storage.rows.size).toBe(0);
+    // A draw told after the close sends nothing.
+    made.noBoard.delete(WEST_CHANNEL);
+    made.drawn(WEST_CHANNEL);
+    await made.lines.flush();
+    expect(made.said()).toEqual([]);
+    made.lines = made.make();
+    await made.report(task, [west(2)]);
+    await made.lines.flush();
+    expect(made.said()).toHaveLength(1);
+  });
+
   it('says a line once when two reports come at once, and not again after a restart', async () => {
     made = linesWith();
     const task = pageTask('Catch 7 Pokémon');
diff --git a/src/services/stop-lines.ts b/src/services/stop-lines.ts
index a4bd7af6..23e5c645 100644
--- a/src/services/stop-lines.ts
+++ b/src/services/stop-lines.ts
@@ -15,6 +15,13 @@ import type { ResearchNews, StopReportService } from './stop-reports.js';
 /** The longest delay `setTimeout` accepts. */
 const MAX_TIMER_MS = 2 ** 31 - 1;
 
+/** A claimed line waiting for its board's message (plan 8R-9F, M2). */
+interface Waiting {
+  claimed: StopLineKey & { createdAt: number };
+  subjectKey: string;
+  text: (link: string) => string;
+}
+
 export interface StopLineServiceOptions {
   storage: StopLineStorage;
   /** The reports at stops: research that is news, and hideouts reported (`hideoutReported`). */
@@ -23,7 +30,14 @@ export interface StopLineServiceOptions {
    * The posts of the stops (`StopPostService.messageOf`): the message of the board that holds a
    * task or a hideout, once what waits is drawn; undefined where the region has no board.
    */
-  posts: { messageOf(channelId: string, subjectKey: string): Promise<PostLink | undefined> };
+  posts: {
+    messageOf(channelId: string, subjectKey: string): Promise<PostLink | undefined>;
+    /**
+     * Tells of a channel's post of the stops drawn in full in its board (`StopPostService.onDrawn`,
+     * plan 8R-9F, M2): the lines that waited for it are tried once more.
+     */
+    onDrawn?(listener: (channelId: string) => void): void;
+  };
   regions: { all(): readonly Region[] };
   /** The row of a server in `Guild` (its regions name it so), by its snowflake. */
   guilds: { idFor(serverId: string): Promise<number | undefined> };
@@ -40,7 +54,9 @@ export interface StopLineServiceOptions {
  * reported at a stop in a region, a short line in the region's channel links the message of the
  * region's board that holds it (`researchLine`, `hideoutLine`), as a new party's line links its
  * post. A line is claimed by its row first (`StopLineStorage.claim`), then sent, never edited; a
- * region without a board gets none (its claim is let go, so a later report there tries again). No
+ * region without a board gets none (its claim is let go, so a later report there tries again),
+ * and one whose board is being made anew keeps its claim until that board is drawn (plan 8R-9F,
+ * M2: tried once more then, or let go at the day's end). No
  * line for a decoy or a grunt; a narrowing is the same task. At each local midnight the lines of
  * the day before are deleted, and at start those of days before (a restart over a midnight); one
  * whose delete failed is tried again in the catch-up and before the next line is sent (W2). None
@@ -60,9 +76,21 @@ export class StopLineService {
    */
   private stale = false;
   private closed = false;
+  /**
+   * The lines claimed whose board's message was not there although the region has a board (plan
+   * 8R-9F, M2, B9: a moderator deleted it, and it is being made anew), by region channel: tried
+   * once more after the next full draw of that channel's post, let go at the day's end.
+   */
+  private readonly waiting = new Map<string, Waiting[]>();
 
   constructor(private readonly options: StopLineServiceOptions) {
     this.now = options.now ?? (() => Date.now());
+    options.posts.onDrawn?.((channelId) => {
+      if (this.closed) return;
+      const lines = this.waiting.get(channelId) ?? [];
+      this.waiting.delete(channelId);
+      for (const one of lines) this.track(this.deliver(one, true));
+    });
     options.reports.listen({
       reported: (news) => {
         this.track(this.research(news));
@@ -143,7 +171,7 @@ export class StopLineService {
     subjectKey: string,
     text: (link: string) => string,
   ): Promise<void> {
-    const { storage, posts, gateway, log } = this.options;
+    const { storage, log } = this.options;
     if (this.stale) {
       this.stale = false;
       await this.sweep().catch((err: unknown) => {
@@ -153,17 +181,43 @@ export class StopLineService {
     }
     const claimed = { ...line, createdAt: this.now() };
     if (!(await storage.claim(claimed))) return;
+    await this.deliver({ claimed, subjectKey, text }, false);
+  }
+
+  /**
+   * Sends a claimed line with its link. Where the board's message is not found though the region
+   * has a board (plan 8R-9F, M2: the board was deleted and is being made anew), the claim is kept
+   * and the line waits for the next full draw of that channel's post (`retry` then: tried once,
+   * let go if still nothing). Otherwise a line not sent lets its claim go.
+   */
+  private async deliver(one: Waiting, retry: boolean): Promise<void> {
+    const { storage, posts, gateway, log, regions } = this.options;
+    const { claimed, subjectKey, text } = one;
+    const line: StopLineKey = claimed;
     let sent: string | undefined;
+    // Whether the board held the line's message (or a send was tried and failed).
+    let found: boolean;
     try {
       const held = await posts.messageOf(line.regionChannelId, subjectKey);
+      found = held !== undefined;
       if (held !== undefined && this.dayOf(this.now()) === line.day) {
         const link = postLink(line.serverId, held.channelId, held.messageId);
         sent = await gateway.sendMessage(line.regionChannelId, { content: text(link) });
       }
     } catch (err) {
       log.warn({ err, channel: line.regionChannelId }, 'could not send the line of a new report');
+      found = true;
     }
     if (sent === undefined) {
+      const boarded = regions
+        .all()
+        .some((region) => region.channelId === line.regionChannelId && region.summaryMessageId);
+      if (!found && !retry && boarded && !this.closed && this.dayOf(this.now()) === line.day) {
+        const list = this.waiting.get(line.regionChannelId) ?? [];
+        list.push(one);
+        this.waiting.set(line.regionChannelId, list);
+        return;
+      }
       await storage.forget(line);
       return;
     }
@@ -179,7 +233,14 @@ export class StopLineService {
    */
   async sweep(): Promise<void> {
     const { storage, gateway, log } = this.options;
-    for (const line of await storage.before(this.dayOf(this.now()))) {
+    const today = this.dayOf(this.now());
+    // A line that waited for its board through the day's end is let go (M2): its row below.
+    for (const [channelId, lines] of this.waiting) {
+      const kept = lines.filter((one) => one.claimed.day === today);
+      if (kept.length > 0) this.waiting.set(channelId, kept);
+      else this.waiting.delete(channelId);
+    }
+    for (const line of await storage.before(today)) {
       if (line.messageId !== null) {
         try {
           await gateway.deleteMessage(line.regionChannelId, line.messageId);
@@ -237,11 +298,22 @@ export class StopLineService {
     while (this.pending.size > 0) await Promise.all(this.pending);
   }
 
-  /** Stops the timer; what is on its way is finished first. */
+  /**
+   * Stops the timer; what is on its way is finished first, and the claims of the lines still
+   * waiting for their board are let go (review F4), so that a report after a restart that day
+   * can claim them again.
+   */
   async close(): Promise<void> {
     this.closed = true;
     if (this.timer) clearTimeout(this.timer);
     this.timer = undefined;
     await this.flush();
+    const waiting = [...this.waiting.values()].flat();
+    this.waiting.clear();
+    for (const { claimed } of waiting) {
+      await this.options.storage.forget(claimed).catch((err: unknown) => {
+        this.options.log.warn({ err }, 'could not let go of the line of a report');
+      });
+    }
   }
 }
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index 1e3c18ef..5c69af23 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -32,6 +32,7 @@ import type { TaskVersion } from '../domain/research/versions.js';
 import type { ResearchEvent } from '../domain/time/research-events.js';
 import type { PictureMaker } from './stop-pictures.js';
 import { StopPostService } from './stop-posts.js';
+import { MAX_POST_MESSAGES } from '../render/stop-post.js';
 import { StopReportService } from './stop-reports.js';
 
 const ZONE = 'America/New_York';
@@ -297,18 +298,22 @@ describe('StopPostService', () => {
     const tasks = researchTasksOfPage();
     const spread = (k: number) =>
       reportedStop(k, { lat: 40.01 + (k % 80) / 1_000, lon: -80.09 + Math.floor(k / 80) / 1_000 });
+    // Every task of the page at fifteen stops of its own (plan 8R-9F: ten messages to fill),
+    // reported five at a time.
     for (const [n, task] of tasks.entries()) {
-      await made.report(
-        task,
-        Array.from({ length: 5 }, (_, i) => spread(n * 5 + i)),
-      );
+      for (let at = 0; at < 15; at += 5) {
+        await made.report(
+          task,
+          Array.from({ length: 5 }, (_, i) => spread(n * 15 + at + i)),
+        );
+      }
     }
     // The event's task at one stop, reported last.
-    await made.report(eventTask('Make 3 Splash Throws'), [spread(tasks.length * 5)]);
+    await made.report(eventTask('Make 3 Splash Throws'), [spread(tasks.length * 15)]);
     await made.posts.flush();
     const said = made.said();
-    expect(said).toHaveLength(3);
-    expect(said[2]).toMatch(/…and \d+ more tasks$/);
+    expect(said).toHaveLength(MAX_POST_MESSAGES);
+    expect(said.at(-1)).toMatch(/…and \d+ more tasks$/);
     expect(said[0]).toContain('**Make 3 Splash Throws**');
     expect(said[0]?.indexOf('**Make 3 Splash Throws**')).toBeLessThan(
       said[0]?.indexOf(`**${tasks[0]?.text ?? ''}**`) ?? 0,
@@ -557,27 +562,31 @@ describe('StopPostService', () => {
     expect(made.said().at(-1)).toContain('**Catch 7 Pokémon**');
   });
 
-  it('spills into a second and a third message, then counts what is left', async () => {
+  it('spills into further messages, ten at most (plan 8R-9F), then counts what is left', async () => {
     made = await postsWith();
     const tasks = researchTasksOfPage();
-    // At five stops of their own each, the page's tasks do not fit three messages even without
+    // At fifteen stops of their own each, the page's tasks do not fit ten messages even without
     // pictures (plan 8R-6: no task is cut for pictures).
     const spread = (k: number) =>
       reportedStop(k, { lat: 40.01 + (k % 80) / 1_000, lon: -80.09 + Math.floor(k / 80) / 1_000 });
+    // Every task of the page at fifteen stops of its own (plan 8R-9F: ten messages to fill),
+    // reported five at a time.
     for (const [n, task] of tasks.entries()) {
-      await made.report(
-        task,
-        Array.from({ length: 5 }, (_, i) => spread(n * 5 + i)),
-      );
+      for (let at = 0; at < 15; at += 5) {
+        await made.report(
+          task,
+          Array.from({ length: 5 }, (_, i) => spread(n * 15 + at + i)),
+        );
+      }
     }
     await made.posts.flush();
     const messages = made.gateway.messagesIn(made.west);
-    expect(messages).toHaveLength(3);
+    expect(messages).toHaveLength(MAX_POST_MESSAGES);
     for (const { message } of messages) {
       if (!message.v2) throw new Error('the post is components v2 here');
       expectV2Sendable(message);
     }
-    expect(made.said()[2]).toMatch(/…and \d+ more tasks$/);
+    expect(made.said().at(-1)).toMatch(/…and \d+ more tasks$/);
     expect(made.said()[1]).toMatch(/^-# Today’s Stops, continued \(2\)/);
     // A DM of a task links to the message that holds it; none for a task only counted.
     const shownIn = (n: number) =>
@@ -589,9 +598,11 @@ describe('StopPostService', () => {
       channelId: made.west,
       messageId: messages[0]?.id,
     });
-    expect(await made.posts.messageOf(WEST_CHANNEL, shownIn(2)?.key ?? '')).toEqual({
+    expect(
+      await made.posts.messageOf(WEST_CHANNEL, shownIn(MAX_POST_MESSAGES - 1)?.key ?? ''),
+    ).toEqual({
       channelId: made.west,
-      messageId: messages[2]?.id,
+      messageId: messages.at(-1)?.id,
     });
     expect(await made.posts.messageOf(EAST_CHANNEL, shownIn(0)?.key ?? '')).toBeUndefined();
     expect(unshown).toBeDefined();
@@ -769,6 +780,26 @@ describe('StopPostService', () => {
     expect(made.changes).toContain(WEST_CHANNEL);
   });
 
+  it('tells who listens of a post drawn in full, never of one whose send failed (plan 8R-9F, M2)', async () => {
+    made = await postsWith();
+    const drawn: string[] = [];
+    made.posts.onDrawn((channelId) => drawn.push(channelId));
+    await made.report(pageTask('Catch 7 Pokémon'));
+    await made.posts.flush();
+    expect(drawn).toEqual([WEST_CHANNEL]);
+    // The board deleted by hand: the send finds no thread, and nothing is told.
+    made.gateway.gone.add(made.west);
+    await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(2)]);
+    await made.posts.flush();
+    expect(drawn).toEqual([WEST_CHANNEL]);
+    // The board made anew: drawn in full there, told.
+    const westRegion = made.regions.find((region) => region.channelId === WEST_CHANNEL)!;
+    westRegion.summaryMessageId = await made.board(WEST_FORUM);
+    made.posts.boardChanged(WEST_CHANNEL);
+    await made.posts.flush();
+    expect(drawn).toEqual([WEST_CHANNEL, WEST_CHANNEL]);
+  });
+
   it('sends every message anew into a board that replaced the one it was drawn in (B2)', async () => {
     made = await postsWith();
     const tasks = researchTasksOfPage();
@@ -818,26 +849,39 @@ describe('StopPostService', () => {
     const tasks = researchTasksOfPage();
     const spread = (k: number) =>
       reportedStop(k, { lat: 40.01 + (k % 80) / 1_000, lon: -80.09 + Math.floor(k / 80) / 1_000 });
+    // Every task of the page at fifteen stops of its own (plan 8R-9F: ten messages to fill),
+    // reported five at a time.
     for (const [n, task] of tasks.entries()) {
-      await made.report(
-        task,
-        Array.from({ length: 5 }, (_, i) => spread(n * 5 + i)),
-      );
+      for (let at = 0; at < 15; at += 5) {
+        await made.report(
+          task,
+          Array.from({ length: 5 }, (_, i) => spread(n * 15 + at + i)),
+        );
+      }
     }
     await made.posts.flush();
-    const [first, second, third] = made.gateway.messagesIn(made.west).map((one) => one.id);
-    expect(third).toBeDefined();
+    const [first, second, ...after] = made.gateway.messagesIn(made.west).map((one) => one.id);
+    expect(after).toHaveLength(MAX_POST_MESSAGES - 2);
     await made.posts.close();
     // The second message was deleted by hand while the bot was down.
     made.gateway.gone.add(second ?? '');
+    const sentBefore = made.gateway.messages.length;
     made.posts = made.make();
     await made.posts.start();
     const now = made.gateway.messagesIn(made.west).filter((one) => !made?.gateway.gone.has(one.id));
     expect(now.map((one) => one.id)[0]).toBe(first);
-    expect(now).toHaveLength(3);
-    expect(now.map((one) => one.id)).not.toContain(third);
-    expect(made.gateway.deleted.map((one) => one.messageId)).toContain(third);
-    expect(made.said()[1]).toContain('Today’s Stops, continued (2)');
+    expect(now).toHaveLength(MAX_POST_MESSAGES);
+    // Every message after it deleted, and the nine sent anew in order below the first, by the
+    // fake's send log (B10: up to nine deletes and nine sends).
+    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual(expect.arrayContaining(after));
+    const resent = made.gateway.messages.slice(sentBefore);
+    expect(resent.map((one) => one.id)).toEqual(now.slice(1).map((one) => one.id));
+    expect(resent.map((one) => textOf(one.message).split('\n')[0])).toEqual(
+      Array.from(
+        { length: MAX_POST_MESSAGES - 1 },
+        (_, i) => `-# Today’s Stops, continued (${String(i + 2)})`,
+      ),
+    );
   });
 
   it('moves a pinned post of the text channel into the board at start, older days’ too (B11)', async () => {
diff --git a/src/services/stop-posts.ts b/src/services/stop-posts.ts
index 8f85ca64..58f55871 100644
--- a/src/services/stop-posts.ts
+++ b/src/services/stop-posts.ts
@@ -148,6 +148,8 @@ export class StopPostService {
   private readonly leftovers = new Map<string, StopPostRecord>();
   /** Channels where Discord refused a delete for good (review R1), said once each. */
   private readonly deleteRefusalsTold = new Set<string>();
+  /** Who hears of a post drawn in full (`onDrawn`, plan 8R-9F, M2). */
+  private readonly drawnListeners: ((channelId: string) => void)[] = [];
 
   constructor(private readonly options: StopPostServiceOptions) {
     this.now = options.now ?? (() => Date.now());
@@ -208,6 +210,15 @@ export class StopPostService {
     }
   }
 
+  /**
+   * Tells `listener` of each channel whose post was drawn in full in its board, every message
+   * there (plan 8R-9F, M2: the lines of new reports that found no message wait for it); never of
+   * a draw whose send failed (a board gone).
+   */
+  onDrawn(listener: (channelId: string) => void): void {
+    this.drawnListeners.push(listener);
+  }
+
   /**
    * The region of this channel has another board post, or one at last (plan 8R-9, B2: the party
    * service made its summary, or took one over): its post is drawn anew there, every message
@@ -447,6 +458,8 @@ export class StopPostService {
     // Set once a message is sent anew in its place: those after it are deleted, and sent anew
     // below it (B5: a message sent lands last, below any a moderator kept, plan 8R-9F).
     let anew = false;
+    // Whether every message is there (M2): a send that found no thread leaves it false.
+    let complete = true;
     // The messages drawn so far, then those of the post not reached yet.
     const sofar = (): StopPostRecord => ({
       channelId,
@@ -482,6 +495,7 @@ export class StopPostService {
             { channel: channelId, post: threadId },
             'the post of the stops could not be sent',
           );
+          complete = false;
           break;
         }
         this.drawn.set(sent, now);
@@ -525,6 +539,7 @@ export class StopPostService {
     );
     await storage.save(record);
     this.options.changed?.(channelId);
+    if (complete) for (const listener of this.drawnListeners) listener(channelId);
   }
 
   /**
````

### Task 4: 8R-9F task 4: words and docs of the board that takes commands

Prototype commit: `2b394a8f84cf27d3c0fd939494089e740daea854`

The help of /research report and /rocket report no longer calls the
board locked and says that members can report from it. The guides say
that members use commands in the board, what they write there is
deleted (Manage Messages in the forum, a cutover-check warning without
it) and told by DM, a moderator's message stays, the slowmode, and that
a moderator's lock stays. The cutover runbook's permission lines ask
for Manage Messages. stop-reports.md, parties-and-posts.md and
screenshots.md describe the open board, the keeper, screenshots in the
board, the cap of ten, M1 and M2. A staging checklist for 8R-9F.

**Files:**

```
 docs/architecture/parties-and-posts.md                        |  2 +-
 docs/architecture/screenshots.md                              |  2 +-
 docs/architecture/stop-reports.md                             |  8 +++---
 docs/guides/migrating-a-legacy-instance.md                    |  4 +--
 docs/guides/new-instance.md                                   |  6 ++---
 docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md |  8 +++---
 docs/superpowers/plans/2026-10-27-phase-8r9f-staging.md       | 70 +++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/research/research.test.ts                        |  3 +++
 src/commands/research/research.ts                             |  3 ++-
 src/commands/rocket/rocket.test.ts                            |  2 ++
 src/commands/rocket/rocket.ts                                 |  3 ++-
 11 files changed, 94 insertions(+), 17 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/research/research.test.ts src/commands/rocket/rocket.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 2b394a8f84cf27d3c0fd939494089e740daea854 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md docs/superpowers/plans/2026-10-27-phase-8r9f-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-9F task 4: words and docs of the board that takes commands`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 86906116..4e38f52e 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -68,7 +68,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else; a forum it cannot look through for a refusal of Discord's is warned of by name, the other failures (the network away) once per sweep with how many forums (plan 8X-H), and each sweep says at debug what it archived. A closing of which a part failed for the network or a rate limit (the link line, a copy, its last showing, a leftover's deletion, the last words, the tags, the archiving, a moderator's deletion; `worthRedoing`, review r0 B2, B5: a refusal of Discord's such as Missing Access would fail again and is not kept, and a post that is gone drops it whatever else failed) is kept in memory (`undoneClosings`, a `BoundedMap` of `UNDONE_CLOSINGS_MAX`, the party as it ended, its last words and whether they were said, `delete` where a moderator chose to delete the post and the deletion failed for the network, review r0 B3: meanwhile it is closed and archived as usual, `endAs` says `deleting` (review r1 C1: the moderator is told that it is archived for now and will be deleted within the hour, and the report keeps `delete`), and the redo deletes it; Discord refusing the deletion leaves it archived and `archived`, as before; a post that is gone is `archived`) and done again by `redoClosings()`, the first step of the hourly upkeep and so of the catch-up on reconnect (plan 8X-H, Matt 2026-10-23: such a post kept its live controls, and the sweep only archives; review r0 B4), for a day after the party ended (`UNDONE_CLOSING_KEPT_MS`: no post opened and archived again days later); a redo (`closePost`'s `redo`) sets the tags of the last showing for every kind of party, also a raid the clock ended, whose showing with Ended may have failed in the same outage (review F2), and, where the post is to be archived, shows it first, before the copy in it and the leftovers are deleted: the post may be archived already, and Discord refuses a deletion in an archived post (50083) until something opens it (review F4); ending between parties with the clock's stop and with the first closing that fails again (one probe a run while the network is away: a request that is black-holed takes about a minute, review r1 C2); it logs `closed ended parties again` with how many were redone and failed again. A restart forgets them, and the sweep archives what is left open as before. Accepted risk (review r0 B12): last words that Discord received but whose answer the network lost are said again by the redo, so they may stand twice in the post. `redrawPosts()` shows every active post anew as `emojiChanged` does, paced (it only queues them, one party every `EMOJI_RENDER_GAP_MS`, so N posts take N × 250 ms, beside the upkeep and the feeds, review r0 B10): an edit that failed leaves its post stale until something shows it anew (`showPost` forgot what it sent before trying), and a current post makes no edit. The updates of a post or a summary that failed for the network are warnings (`isNetworkError`, `src/services/network-error.ts`), errors otherwise (operations.md, "The catch-up on reconnect").
 - `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Today and coming up` (`SUMMARY_TITLE`; plan 8R-9, the region's board: "Going on now" before it, and `Active raids` before plan 8X-G, every kind of party since; `NOTHING_GOING` "Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.") with a count of the kinds there are today and of those coming up (the board's paragraph below), today's parties in these sections (every party that starts after the next local midnight is under **Coming up** instead, `isToday`, below): the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the max battles under **Max battles** (plan 8X-3: those whose end has not come, 5 stars down to 1, Gigantamax last, the soonest end first in each), then the trains, then **Passing through** (plan 8X-G, review R9: the trains of other regions of the server with a stop in this region, as their copies go, `stopRegionsInGuild`; each linked to its copy in this region's channel, a message link by the server's snowflake, `guilds.snowflakeOf`, read once, else to its post; counted in the head as `N trains passing through`; a train's change, and its end, ask for every summary of its server, an unchanged one not edited, and a copy recorded for its region's, `PartyMirrorsOptions.copied`), then the meetups (a timed party's start or end more than a day ahead as Discord's date and time, `<t:…:f>`, which each reader's client shows in their own time zone with daylight saving; within a day the relative stamp, which Discord rounds, "in 4 days" for 3 days and 15 hours: plan 8X-H, Matt 2026-10-23; the switch comes with the next draw, at the latest the hourly upkeep), one text display per tier and section, then **Coming up** (below), and last, after a line, the region's post of the stops today, in its board under the summary, with its counts (`[Today’s Stops](<link>) (below): 6 tasks · 2 hideouts` in the board, without "(below)" in `/status` in the region's channel, and under an event's window the day's research waiting named apart, last as in the post, `· 13 tasks back at <t:…:t>`, so a window with only the day's research still links the post, plan 8R-6; `StopsLine`, from `StopPostService.summaryOf` set with `setStopPosts`; nothing where nothing is reported, none in rehearsal mode; `stop-reports.md`), all within `TEXT_BUDGET` (`SECTION_ROOM` for the max battles, the trains, the trains passing through and the meetups each, a heading and a count line for every tier, "…and N more", the stops' line kept from the start). A train counts as passing through a region while it will still reach a stop there (`stopsStillReached`, review r0 C4, Matt 2026-10-22): one that finishes the stops from its current one on, one that loops or turns back every stop (a turn-back keeps its mode and comes back), a finished route none. The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. Where the record of a region's summary is gone or empty, a `Today and coming up` post the bot made in the forum, or one it made as `Going on now` or `Active raids` before (`LEGACY_SUMMARY_TITLES`, B12; renamed with its next edit, `renameSummary`, by Discord's rename limit; the text is recorded as sent, so a request with the same text edits nothing while the rename waits, and the wait is a timer of its own that renames and edits nothing, `renameSummaryLater`, review r1 R1-6; a refused permission is warned of once per region until a rename works again, the next change of the text trying it again, and any other failure is tried again after the rename window, review r0 C1, r1 R1-5), is recorded and edited instead of making a second one, which Discord would not pin beside it (30047: one pinned post per forum; `takeOverSummary`, staging of 2026-10-16): the pinned one, else the oldest open one, pinned with its next edit (`openPosts` lists open posts only: an archived one is not found). A forum that changed meanwhile gets no post; a failed look makes a new post, with a warning. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
-- **The region's board** (plan 8R-9; design `docs/superpowers/specs/2026-10-25-region-board-design.md`): the summary post is the forum's locked pinned post "Today and coming up", with "Today’s Stops" posted under it (`stop-reports.md`). **Locked** when made (`createSummary`: `PartyGateway.lockPost` after the pin), and pinned and locked again wherever Discord says it is not (`postInfo`'s `pinned` and `locked`, `pinAndLock`): after each edit of the summary, and after each draw of the stops in it whether or not the summary's text changed (`summaryChanged(region, true)`, B4: their messages open an archived board, which comes back unpinned); a refused lock (Manage Posts, as for the pin) is said once per region (`could not lock the board post`), and `/admin setup-forums` says whether a board it made could be pinned and locked, and why not (`ForumSetup.unlocked`, review P12); a board that stood is pinned and locked there too where Discord says it is not (`makeSummary`), and the answer says when it could not be (`the board is not locked (I could not lock it: give me Manage Posts there)`, review W3). A board gone while the summary's text stood (the stops' draw checks it, `pinAndLock` finds no post) is asked for again, so that the next edit replaces it (review P2). **By day** (B8): `isToday` (`src/domain/party/board-day.ts`, pure, the one rule of the board and `/status`): a party that has started (`partyStart`: a train's or meetup's start, a raid's hatch, none for a max battle), starts before the next local midnight (`nextLocalMidnight`, `src/domain/time/local-day.ts`, Luxon in `settings.timezone`) or has no time is today's, under the headings as before; every other party, of any kind (an elite egg days ahead, a train passing through), is one list under `**Coming up**` (`COMING_UP_HEADING`) by start, its kind first (`Meetup`, `Train`, a train kind's words, `… passing through`, a raid's `raidWords`), its post (a train passing through: its copy here), the full date and time (`<t:…:f>`, each reader's zone) and its count, sure of `SECTION_ROOM` and counting what does not fit (`renderSummary`'s `more.zone`; without it everything is today's). The head counts today's (" today" after the last where something is coming up), `N coming up`, then the stops as their line counts them (`3 raids · 1 train today · 2 coming up · 4 tasks · 2 hideouts`); `NOTHING_GOING` only where there is neither a party nor a stop (review P7). The stops' line stays last: `[Today’s Stops](<link>) (below): 4 tasks · 2 hideouts` in the board (`summaryMessage(region, 'board')`, `more.stopsBelow`), without "(below)" in `/status` in the region's channel, linking the first message of the stops in the board. **At midnight** (B7) `watchMidnight` (started once Discord is there, in rehearsal mode too) draws every region's summary anew a second after each local midnight (review P10) (`setTimer`), and `redrawPosts` (the catch-up on reconnect) draws every summary anew as well; an unchanged one is not edited. `createSummary` and `takeOverSummary` tell the posts of the stops `boardChanged(channelId)` (B2). B12's other half needs no code: `makeSummary` keeps a recorded post whatever its archived state (`postInfo` answers for an archived thread), so `takeOverSummary` runs only where the record is gone, and an archived summary the record lost is not found (`openPosts` lists open posts only).
+- **The region's board** (plan 8R-9; design `docs/superpowers/specs/2026-10-25-region-board-design.md`): the summary post is the forum's pinned post "Today and coming up", with "Today’s Stops" posted under it (`stop-reports.md`). **Open to members** since plan 8R-9F (design `2026-10-27-region-board-commands-design.md`, R2): made unlocked with a slowmode of six hours (`createSummary`: `PartyGateway.openBoard` after the pin; `BOARD_SLOWMODE_SECONDS`, Discord's most: members write there that seldom, commands and bots are not held by it), and pinned again wherever Discord says it is not (`postInfo`'s `pinned`, `pinAndOpen`): after each edit of the summary, and after each draw of the stops in it whether or not the summary's text changed (`summaryChanged(region, true)`, B4: their messages open an archived board, which comes back unpinned), and after each delete of a member's message (B7). A board is opened **once** (`openOnce`, review F2): Pine's mark is a slowmode of exactly `BOARD_SLOWMODE_SECONDS` (a forum may give its posts a slowmode of its own by default, so any other value is no mark). At its next draw, its take-over or `/admin setup-forums`: a board with the mark that is locked was locked by a moderator and stays so (`BoardOpen` `locked`); a locked board with any other slowmode was never opened by Pine (plan 8R-9 locked it) and is unlocked and given the mark; an open board without slowmode is given the mark (made before plan 8R-9F unlocked, or an opening that failed); an open board with another slowmode keeps it (a moderator's choice). A moderator who locks the board and also clears its slowmode has it opened again at the next draw: Discord keeps no other mark (accepted, no migration); a moderator who wants it locked leaves its slowmode. A refused opening (Manage Posts, as for the pin) is said once per region (`could not open the board post`), and `/admin setup-forums` says whether a board it made could be pinned and opened, and why not (`ForumSetup.closed`, review P12), that a moderator's lock stands (`the board is locked, so members cannot use commands in it (a moderator locked it; unlock it to let them)`), and where the bot may not delete what members write there (`ForumSetup.cleaning`, Manage Messages in the forum, `PartyGateway.mayDeleteMessages`). A board gone while the summary's text stood (the stops' draw checks it, `pinAndOpen` finds no post) is asked for again, so that the next edit replaces it (review P2). **By day** (B8): `isToday` (`src/domain/party/board-day.ts`, pure, the one rule of the board and `/status`): a party that has started (`partyStart`: a train's or meetup's start, a raid's hatch, none for a max battle), starts before the next local midnight (`nextLocalMidnight`, `src/domain/time/local-day.ts`, Luxon in `settings.timezone`) or has no time is today's, under the headings as before; every other party, of any kind (an elite egg days ahead, a train passing through), is one list under `**Coming up**` (`COMING_UP_HEADING`) by start, its kind first where the post's title does not say it (plan 8R-9F, M1, B8: a meetup's title starts `Meetup · `, `MEETUP_TITLE_KIND`, and a raid train's `Train · `, `TRAIN_TITLE_KIND`, so neither names its kind again, `Passing through · <copy>` for a raid train passing through; a train of another kind its kind's words without the title's "Train", just before its post, review F9: `Gigantamax <#post>`, which reads "Gigantamax Train · …", and `Passing through · Gigantamax <copy>`; `TRAIN_KIND_WORDS` unchanged, and a title without "Train · " keeps the kind's words as a part of its own; a raid's `raidWords`), its post (a train passing through: its copy here), the full date and time (`<t:…:f>`, each reader's zone) and its count, sure of `SECTION_ROOM` and counting what does not fit (`renderSummary`'s `more.zone`; without it everything is today's). The head counts today's (" today" after the last where something is coming up), `N coming up`, then the stops as their line counts them (`3 raids · 1 train today · 2 coming up · 4 tasks · 2 hideouts`); `NOTHING_GOING` only where there is neither a party nor a stop (review P7). The stops' line stays last: `[Today’s Stops](<link>) (below): 4 tasks · 2 hideouts` in the board (`summaryMessage(region, 'board')`, `more.stopsBelow`), without "(below)" in `/status` in the region's channel, linking the first message of the stops in the board. **At midnight** (B7) `watchMidnight` (started once Discord is there, in rehearsal mode too) draws every region's summary anew a second after each local midnight (review P10) (`setTimer`), and `redrawPosts` (the catch-up on reconnect) draws every summary anew as well; an unchanged one is not edited. `createSummary` and `takeOverSummary` tell the posts of the stops `boardChanged(channelId)` (B2). **What members write in the board** (plan 8R-9F; `BoardKeeper`, `src/services/board-keeper.ts`): `MessageCreate` hands every message to `BoardKeeper.posted` before its bot filter (B3; `postedBoardMessage`, `src/discord/board-message.ts`, untested glue as `screenshot-message.ts`): a message in a recorded board (`regionOfBoard`, a region's `summaryMessageId`) that is neither the bot's own nor Discord's (`system`, a title's change, which cannot be deleted) is deleted (`deleteReported`, which opens an archived post for it; a message gone counts as deleted, 10008), unless its author has Manage Messages there (Q1, `managesMessages`, from the cache: the message put its member there), other applications' and webhooks' too; a failed or refused delete is said once per board until one works (`could not delete a message in the board`). A member whose message went is told by DM once a local day (Q2, `boardDeletedDm`, `src/render/board-words.ts`, through `DmSender`, remembered per server and member in a `BoundedMap` of 10,000: a restart may repeat one), never another application. A message with attachments goes to the screenshot trigger first (`readShots`; `screenshots.md`, "In the board"): one it takes, it has deleted itself once its pictures are downloaded (`take(region, message, false)`, without the daily DM; `take` answers `TakeOutcome`, `deleted` (or gone already), `kept` (Q1) or `failed`, review F1), one it does not the keeper deletes. At start and in the catch-up on reconnect (job `boards`), `sweep` reads each board's newest `BOARD_READ_LIMIT` (100) messages (`boardMessages`; all of them, not only those after the bot's last, as the stops' draw at start may send before the sweep), asks each member author once afresh (`managesMessages(…, true)`: a message read over REST carries no member), and deletes the rest in one `bulkDelete` where two or more are younger than 14 days (less a minute), one at a time otherwise. No migration. B12's other half needs no code: `makeSummary` keeps a recorded post whatever its archived state (`postInfo` answers for an archived thread), so `takeOverSummary` runs only where the record is gone, and an archived summary the record lost is not found (`openPosts` lists open posts only).
 - Staff for raid moderation are admins, moderators and the owner (`isStaff`, `requireManagement`, `managementRoleIds` in `guards.ts`): `/delete` and `/admin save-party` are theirs; the rest of `/admin` also admits bot developers (`requireBotManagement`). `/delete` (Manage Messages since plan 8S-2; it asks in a dialog whether to archive the post or delete it, plan 8Q, `moderation.md`) has no throttle: it is the staff's manual clean-up and must always work; the post of a raid it closed says so in the place of the times (`RaidPostView.closed`). `/admin save-party` outside a post lists the kept posts. `/shout` is for members who are signed up.
 - The forum of a region holds its raids, max battles, trains and meetups and is named `<region channel>` + `settings.regionForumSuffix` (default `-board` since plan 8R-9, `-meetups` before: an old forum is renamed by the next `/admin setup-forums` or `/region import`). `/admin setup-forums` creates it, renames one whose name is the region's with another one-word ending (a name chosen by hand stays), and leaves the making of posts to the bot (`PartyGateway.reservePosts`: Send Messages denied to everyone and to every role the forum allows it, allowed to the bot; writing in posts is untouched). In rehearsal mode it makes forums only for the rehearsed regions, a new one hidden from its first moment (`createForum(…, hidden)`) and one that is there hidden before anything is posted in it (`PartyGateway.hideForum`, `hiddenForumOverwrites`); a forum that cannot be hidden gets nothing posted (`operations.md`, "Rehearsal mode").
 - `RegionRepository.setForum` gives a region its forum (one forum per region, enforced by a unique key); `setSummaryMessage` names the forum the summary post was made in.
diff --git a/docs/architecture/screenshots.md b/docs/architecture/screenshots.md
index 84024768..0d7b2068 100644
--- a/docs/architecture/screenshots.md
+++ b/docs/architecture/screenshots.md
@@ -24,6 +24,6 @@ Reading raid screenshots: the models in a child process of low priority, the pur
 ## On Discord
 
 - `/max screenshot:` (plan 8X-S; `src/commands/max/max-screenshot.ts`; review R1, R6, R7): `/max` is `forConfig` on `ocr.enabled` as `/raid` (the attachment option last, `boss:` and `spot:` optional with it, both required without it); without a screenshot a guard refuses a missing boss or spot ("Give the boss and the spot of the max battle (or attach a screenshot of it)."), with one it reads nothing before the screenshot but an `end:` that is no time (refused at once); always deferred privately with a screenshot. What was typed is read first (`boss:`, `spot:` by `readSpot`, a pin too, `end:`) and stands in the place of what was read, put in and decided by `ScreenshotService` (`ScreenshotWhere.maxTyped`, a function of the max report; the outcome's `report` has it in, its `read` is the reader's own, which "This is what I read" shows; review S-5) (`withMaxTyped` in `max-decision.ts`: the spot as `withSpot`, the boss as a listed one, the end instead of the countdown, then no clean read of a rotation's end); with `boss:` or `spot:` typed the moment counts as no sure one (`maxShotRequest`), so a battle there of another boss is refused as `/max` refuses it and one of the same boss is joined without its end moved or its time confirmed: only a boss and a Power Spot the screen itself showed change a battle (review S-2, Matt 2026-10-23); a typed boss on no list without `tier:` takes the screen's tier (its heads, or Gigantamax by its form), else `WHICH_TIER`; `tier:` typed without `boss:` is the tier of a boss read that is on no list, when it is of the screen's kind (`MaxTyped.tier`, settling `tier-unknown`; a listed boss keeps the list's, review r4 B1). A screenshot that cannot be read at all, beside a typed boss and spot, reports those as `/max` does with "I could not read the screenshot, so I used what you typed." (no ending-soon question); otherwise `unreadWords(outcome, 'max')` (naming `/max`, review R14). A raid's screen is refused, also beside typed values: "That is a raid: use `/raid screenshot:`, or post it with a mention." (`RAID_SCREEN_FOR_MAX`). A Power Spot not clear is asked with a menu (`max:<token>:spot`, the region's first, another region's named; `maxControls.select`, the record's `pickedSpot`), a clear one of another region read (not typed) confirmed as `/raid` confirms a gym ("<spot> is in <#region>, not in this region. Report the max battle there?", `max:<token>:yes` / `:no`); both wait in a store of their own that `maxControls.carriesOn` reads, so a battle refused for none of the member's doing (no post, the battle there ended twice) gives the use back from them too, and so does a pin typed beside the screenshot by a member blocked from meetups (`pin-blocked`, as `/max`'s guard refuses it uncounted; `maxShotGivesBack`, review r4 B3), and so does a battle there of another boss or kind that refuses it, also what was typed alone beside a screenshot that could not be read (`refusedAtBattle`, `taken`; as `/max`'s guard refuses another boss uncounted; review F-1; a mention's use is not given back for it). A refusal says why (`maxRefusalWords`, a missing Power Spot read surely telling the moderators as a mention does), "Nothing was reported. This is what I read:" and `maxReadingLines`, with the feedback row; a report goes through `reportMaxShot` (the forum bar, the battle there joined, changed or refused) and answers with `maxShotWords`, what the screenshot left unsure (`maxDoubtLines`) and `showRow` (R6: as `/raid` answers); `/max`'s throttle counts it.
-- Three ways to report a raid from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes, given back when its raid's post could not be made, the bot not allowed to make posts in the forum or the post lost while it was made (plan 8S-3; also once its gym question is answered: `PendingShot.giveBack`); a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a clear gym of another region (Matt, 2026-10-22, as legacy Pine asked): a raid there is joined unasked as one of this region (a report that may only join, `RaidReport.joinOnly`, decided under the gym's lock: `addRaidUnlessTaken` with `mayAdd: false`, `none-there` for a free gym), and with none there yet, when the gym lies in a region of the server with a forum (else nothing is said), the reply that pings the author asks "<gym> is in <#region>. Report it there?" (`elsewhereQuestion`, written for any place, a Power Spot too) with Yes and No only the author can answer, no dialog; Yes reports it as a gym picked in the mention's question does (`answerShot`: the forum bar, the use given back, the question becoming the answer), not recorded as `picked`; No or no answer makes nothing, and the question goes as the mention's does; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). A max battle's screenshot posted with a mention or read passively goes the max way (plan 8X-S; `readMax` in `ScreenshotTrigger.readOne`, which shares the loop, the throttle, the reactions, the replies and `finished` with raids): a clear Power Spot of the message's own region is reported unasked through `reportMaxShot` (`src/commands/max/max-shot.ts`, shared with `/max screenshot:`: the forum bar `maxBarred` first, `unknown-access` while Discord cannot say; then `reportMaxShotAs`: a battle there joined, its boss changed by a newer sure screenshot, or refused, else a new battle; the screenshot kept while its post shows it; no pin, so a member blocked from meetups is not refused; the per-image `screenshot` throttle, not `/max`'s), its words (`maxShotWords`: `/max`'s where it says the same, "Changed the boss of the max battle at <spot> to <boss> from your screenshot, until <end>.", an end moved later "Its end is now <end>, from your screenshot.") in the message's reply unless a new battle was made; a refusal by the decision is said in `maxRefusalWords` (`src/render/screenshot-reading.ts`); a Power Spot not clear, or a clear one of another region, is asked about with a menu of Power Spots (`shot:<token>:spot`, `PendingShot` of kind `spot` with `withSpot`; the region's first, another region's named under it; `chooseShotSpot` → `answerSpot`, the record's `pickedSpot`), as the gym question; a Power Spot it does not know is refused "I do not know a Power Spot called "<name>" here: use `/max spot:`." and, for a name read surely on a screen with a countdown (`missingSpotName` in `max-decision.ts`: an event's picture of a boss has none; review S-1, Matt 2026-10-23), the moderators told (`ModerationReports.missingSpot`, `moderation.md`), which the refusal then says ("I have let the staff know Pine may be missing this Power Spot."). Read passively a max screen without a countdown is left alone, whatever it shows: nothing reported, said or kept (review S-1). Read passively it never asks which Power Spot nor tells the moderators (Matt, 2026-10-22): a Power Spot not clear or unknown gets the reply that pings the author, "I could not tell which Power Spot this is: use `/max screenshot:`." (`told`, said beside the raids that exist); a boss changed or a battle joined is said there too; a clear Power Spot of another region is joined there unasked (`reportMaxShot` with `joinOnly`), or with none there yet asked Yes or No as a gym is (`elsewhereSpot`, `elsewhereQuestion`; only where that region has a forum); every other refusal is silent (review R12). `/read-screenshot` only reads. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question and Power Spot question (`spot`); the passive reading's Yes, `yes`, its No the question's `cancel`); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
+- Three ways to report a raid from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when the boss or the gym is missing and there is no screenshot; a screenshot that cannot be read at all or is no raid screen, beside a typed boss and gym, reports what was typed with a note; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes, given back when its raid's post could not be made, the bot not allowed to make posts in the forum or the post lost while it was made (plan 8S-3; also once its gym question is answered: `PendingShot.giveBack`); a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer, that becomes the answer once answered (no private follow-up: it would point at a deleted question) and goes after two minutes; either way a report that would put the author in a forum somebody keeps them out of is refused first, as `/raid` and the map refuse it (`reportBarred` in `reportShot`, plan 8M-6): `REPORT_BARRED` in the message's reply, or as the question's answer once a gym is picked; when Discord cannot say, it is logged and answered "Discord cannot be reached just now, so nothing was reported. Try again in a moment."; a pick stops the question's own time at once (it then stays as an answer does, `ReplyKeep.answered`, also while the raid is reported); a question answered while Discord cannot say stays, its menu too, with `ASK_AGAIN` below its text and a question's time again (`askAgain`), and its gym can be picked again, unless its time was up meanwhile or somebody deleted it, and it is gone: nothing brings it back, and the author is told privately (plan 8W-3); the report itself asks once more when it would join a raid already at the gym whose forum the first check did not see (`mayJoinNoting`, below `reportBarred`, `parties-and-posts.md`); the posts of raids that exist and what made nothing are said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports and a raid that exists, said in a reply that pings the author; a clear gym of another region (Matt, 2026-10-22, as legacy Pine asked): a raid there is joined unasked as one of this region (a report that may only join, `RaidReport.joinOnly`, decided under the gym's lock: `addRaidUnlessTaken` with `mayAdd: false`, `none-there` for a free gym), and with none there yet, when the gym lies in a region of the server with a forum (else nothing is said), the reply that pings the author asks "<gym> is in <#region>. Report it there?" (`elsewhereQuestion`, written for any place, a Power Spot too) with Yes and No only the author can answer, no dialog; Yes reports it as a gym picked in the mention's question does (`answerShot`: the forum bar, the use given back, the question becoming the answer), not recorded as `picked`; No or no answer makes nothing, and the question goes as the mention's does; a message of nothing but screenshots that all made or joined raids is deleted, one with text is marked ✅). A max battle's screenshot posted with a mention or read passively goes the max way (plan 8X-S; `readMax` in `ScreenshotTrigger.readOne`, which shares the loop, the throttle, the reactions, the replies and `finished` with raids): a clear Power Spot of the message's own region is reported unasked through `reportMaxShot` (`src/commands/max/max-shot.ts`, shared with `/max screenshot:`: the forum bar `maxBarred` first, `unknown-access` while Discord cannot say; then `reportMaxShotAs`: a battle there joined, its boss changed by a newer sure screenshot, or refused, else a new battle; the screenshot kept while its post shows it; no pin, so a member blocked from meetups is not refused; the per-image `screenshot` throttle, not `/max`'s), its words (`maxShotWords`: `/max`'s where it says the same, "Changed the boss of the max battle at <spot> to <boss> from your screenshot, until <end>.", an end moved later "Its end is now <end>, from your screenshot.") in the message's reply unless a new battle was made; a refusal by the decision is said in `maxRefusalWords` (`src/render/screenshot-reading.ts`); a Power Spot not clear, or a clear one of another region, is asked about with a menu of Power Spots (`shot:<token>:spot`, `PendingShot` of kind `spot` with `withSpot`; the region's first, another region's named under it; `chooseShotSpot` → `answerSpot`, the record's `pickedSpot`), as the gym question; a Power Spot it does not know is refused "I do not know a Power Spot called "<name>" here: use `/max spot:`." and, for a name read surely on a screen with a countdown (`missingSpotName` in `max-decision.ts`: an event's picture of a boss has none; review S-1, Matt 2026-10-23), the moderators told (`ModerationReports.missingSpot`, `moderation.md`), which the refusal then says ("I have let the staff know Pine may be missing this Power Spot."). Read passively a max screen without a countdown is left alone, whatever it shows: nothing reported, said or kept (review S-1). Read passively it never asks which Power Spot nor tells the moderators (Matt, 2026-10-22): a Power Spot not clear or unknown gets the reply that pings the author, "I could not tell which Power Spot this is: use `/max screenshot:`." (`told`, said beside the raids that exist); a boss changed or a battle joined is said there too; a clear Power Spot of another region is joined there unasked (`reportMaxShot` with `joinOnly`), or with none there yet asked Yes or No as a gym is (`elsewhereSpot`, `elsewhereQuestion`; only where that region has a forum); every other refusal is silent (review R12). `/read-screenshot` only reads. **In the board** (plan 8R-9F, design `2026-10-27-region-board-commands-design.md` item 4, B1, B2, B11, R1): the trigger reads no thread but a region's recorded board (`ScreenshotTriggerOptions.board`, the `BoardKeeper`'s `regionOfBoard`; any other post is left alone, as before). A message with attachments there goes to `ScreenshotTrigger.handle` before the keeper deletes it (`BoardKeeper.posted`'s `readShots`; `handle` answers true where it took the message): with a mention, or passively where `ocr.passive` is on, with pictures, outside rehearsal mode (anything else is the keeper's, deleted with its daily DM). `readBoard` downloads every picture first, all at once (review F3: ten at most; `ScreenshotService.fetch`, within `MAX_SCREENSHOT_BYTES`; each one use of the member's throttle), then has the message deleted (`BoardTaker.take(region, message, false)`: a moderator's message stays, Q1; no daily DM), then reads the bytes one after the other (`read` takes a `FetchedScreenshot` without downloading again; B2: reading first would leave the picture in the board for minutes) as a message of the region's channel (the wrapper gives `region.channelId` as `channelId`; react, unreact, reply and delete do nothing). Each is decided by the very functions of a mention or a passive read (`readOne`, `readMax`, `Batch.board`): one path for every fact; only the answers differ. Nothing is asked, replied or marked in the board (B11): where a mention would ask which gym or Power Spot, or about a place of another region, the words point to the command that asks privately (`RAID_UNSURE_IN_BOARD`, `MAX_UNSURE_IN_BOARD`, `elsewhereInBoard`: "<gym> is in #region: report it with `/raid screenshot:`, which asks you whether to report it there."), and a raid or battle made is said too (in the channel only its link line says it). The answer is one plain DM through `DmSender` (R1): its opening by what `take` answered (review F1): "From your screenshot(s) in #board (the board keeps only my lists, so I took your message out of it):" where it was deleted, "(I left your message in the board):" where a moderator wrote it (Q1), nothing about the board where the delete failed; then a line per picture (`- 2: …` where there are several), a picture not read (download, size, the reader busy, the throttle) named, whole lines within the DM's 2,000 characters and the rest counted, `…and N more` (`boardDmText`, review F6); a member whose DMs are closed hears nothing (the board shows what was made), nor does one whose message was taken just before a shutdown (review F7, accepted). A passive max screen without a countdown, left alone in a channel, is answered there (`MAX_NO_COUNTDOWN_IN_BOARD`), as the message is gone. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question and Power Spot question (`spot`); the passive reading's Yes, `yes`, its No the question's `cancel`); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
 - A max battle's screenshot (plan 8X-S, review R6) is shown by `/read-screenshot` and by its "Screenshot feedback" button (`showScreenshot`, for a record with `max`) through `maxScreenshotMessage`: `maxReadingLines` (the Power Spot as read and as matched, the clock and countdown with the end it gives, the heads and the form with the tier, the boss's name as read and the boss), its doubts in small print (`maxDoubtWords`), and what a mention or `/max` would do (`maxDecisionWords`: report, ask which Power Spot, the tier not told, or the refusal in `maxRefusalWords`; `/read-screenshot` tells no moderator of a Power Spot it only shows). Its "Something is wrong" carries the argument `max` (`shot:<id>:wrong:max`, its form `shot:<id>:form:max`) and offers a max battle's elements (`MAX_FEEDBACK_ELEMENTS`: Power Spot, time, tier, boss; `spot` is in `FEEDBACK_ELEMENTS`); a button without the argument, every one made before, is a raid's (`RAID_FEEDBACK_ELEMENTS`), and a form's Submit keeps only the elements its kind offers. The refusals of `/raid` and `/max` that read a max screen carry the max row (`feedbackRow(id, true)`). `npm run ocr:review` heads the rest "raid screenshots and other pictures" and counts max battles' records apart (`reviewSummary`'s `max`: by use, decision, the max report's own doubts, and each element said wrong by where, `maxWrongAt`, but one typed beside `/max screenshot:`, as a raid's typed elements, `maxTyped`: the spot, the boss with its tier, the tier, the end as the time; review F-4); their members' corrections are listed with the raids'.
 - `/read-screenshot` and "Screenshot feedback" answer with `screenshotMessage` (`src/render/screenshot-reading.ts`, `SHOT_COLOUR`): what was read (`readingLines(…, { doubts: false })`) beside the screenshot as a thumbnail (the member's upload by its https address; the kept file as `attachment://<file>`, sent with the answer), the doubts in small print (`-# Not sure: …`), a line, the decision and the question, "All right" / "Something is wrong" (`feedbackButtons`) inside. The line that says a screenshot waits is sent as its answer will be (`WaitAs`: v2 for `/read-screenshot`, plain for `/raid`, whose answers stay plain text, as do the mention's); when `/read-screenshot` could not read the screenshot after that line, the line becomes the refusal, v2.
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index 3030220f..0b6a2a9a 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -55,11 +55,11 @@ Design `docs/superpowers/specs/2026-10-23-research-rewards-apart-design.md` (its
 
 ## "Today’s Stops" on the region's board (plan 8R-9)
 
-Design `docs/superpowers/specs/2026-10-25-region-board-design.md` (its review B1–B14 and Matt's three answers). Until plan 8R-9 the post was pinned in the region's text channel; it is now posted in the region's board, the forum's locked summary post "Today and coming up" (`parties-and-posts.md`), below the summary.
+Design `docs/superpowers/specs/2026-10-25-region-board-design.md` (its review B1–B14 and Matt's three answers). Until plan 8R-9 the post was pinned in the region's text channel; it is now posted in the region's board, the forum's summary post "Today and coming up", open to members' commands since plan 8R-9F (what they write there is deleted, `parties-and-posts.md`, "The region's board") (`parties-and-posts.md`), below the summary.
 
-- `StopPostService` (`src/services/stop-posts.ts`): one post per region channel and local day, made at the first report of the day in the region, in the region's board: the thread of `Region.summaryMessageId`, read anew at each draw (B2), its messages sent with `SuppressNotifications` (`SendOptions.silent`, B13: a follower of the board is not notified of each; edits never notify). No pin: in a locked post only the bot (and moderators) write, so every message it sends lands below the ones before; the summary stays the post's first message. Drawn anew `POST_DELAY_MS` (3 s) after the last change (`Gathered`, coalesced) in one queue per channel (`KeyedLock`), the midnight delete included; reads are done before any Discord call. A change of the reports is drawn only in the regions it touched: `StopReportListener.changed(serverId, stops)` names the stops of the reports made or taken back (a replaced report's too), and only the region channels whose outlines hold one of them are queued; the period changes and the research events draw every post. A message whose payload equals the one last drawn there (a hash per message id, in memory: the first draw after a restart edits) is not edited. An edit that fails is thrown (logged, the post stands, the next change draws it again); a message is deleted and sent anew only when it is gone or changes kind (components v2 to plain text, or back, as the board's `postAccess` changes), and, its kind not known in the first draw after a restart, when Discord refuses its edit for what it holds (`isRefusedBody`); any other failure keeps it there too. **A message sent anew in its place takes every message after it along** (B5): messages i to n are deleted and sent again below it, so the order stays (a moderator writing in the locked post between the bot's messages is accepted). **Where the board is not** (B10: the region has no forum or no summary post): nothing is drawn, the summary's counts and the links are forgotten, and `the region has no board post` is said once per channel until it draws again; no fallback to the text channel. The next turn-over (the period timer, the research events, the catch-up) draws such a region again (review P6, its server by `serverOf`); a send into a board that is gone tells the summary (`changed`), whose next edit makes the board anew (review P2). **Where the bot may not write in it** (B6, `PartyGateway.postAccess`, the post fetched (review P3), on the post's forum: View Channel, Send Messages in Threads and Manage Threads, which writing in a locked post takes, Discord's 160005): nothing is drawn, said once (`the bot may not write in the board post`); without Embed Links the post is plain text (`stopPostText`). **A board replaced or taken over** (B2: `replaceSummary` deletes the whole thread, `takeOverSummary` may record another post): the `StopPost` row keeps the board it was drawn in (`threadId`, migration 031); a draw in another board deletes the old board's messages first (review P5: a post taken over must not keep a second copy; a thread gone is fine), never opening it (review R2: an archived old board refuses with 50083, which is logged and accepted) and sends every message anew there, and `PartyService` tells `boardChanged(channelId)` when it makes or takes over a summary, which draws the region's post (its server by the kept post, else by the region's row, `guilds.snowflakeOf`). The gateway opens an archived board before it sends or deletes in it where asked (B3: Discord refuses either in an archived locked post, 50083; an edit opened it already; review P4: `SendOptions.reopen` and `DeleteOptions.reopen`, asked only by the posts of the stops, every other send and delete as before), and the summary checks the board's pin and lock after each draw of the stops (`changed` → `PartyService.summaryChanged(region, true)`, B4). **The first switch** (B11): a row without `threadId` is a post the bot before plan 8R-9 pinned in the region's channel, read as messages of that channel still to delete (`fromStorage`, `StopPostRecord.leftover`, column `leftoverIds` of migration 031); the first draw unpins and deletes them there (`clear`), `start` the older days' rows too (`remove`), and today's post is drawn in the board. **A delete that fails** (review P1, the network away) is never forgotten: a message of the region's channel stays in `leftover` of the day's row (with the board post, or in a row of its own while none is drawn) and is tried again at each draw; a post of an ended day whose delete fails keeps its row with what is left (`leftovers` in memory), deleted again at the channel's next draw (review W2, in its queue, before anything else of the draw), at the next turn-over and, after a restart, at `start`; a message gone counts as deleted, and a delete Discord refuses for good (50001, 50013, review R1) is said once per channel and forgotten (DMs and answers sent earlier that day point at deleted messages: accepted). A channel with no post in memory reads its kept rows from storage before it draws (a report before `start` has read them, or after that failed, edits the post a restart left; a failed read draws nothing), and `start` keeps what such a draw made, and deletes a post older than its channel's newest (one whose delete failed at its midnight). A timer at `nextPeriodChange` draws every kept post anew (`draw` deletes the post of an ended day and makes today's where reports stand); `start()` does the same for what a restart left (`StopPost` keeps the ids, each message's saved as soon as it is sent), and sets the timer also when the kept posts cannot be read; a change of the research events (`onResearchChange`) draws the posts anew and sets the timer again (those redraws in a set of their own, which `flush` and `close` wait for and `messageOf` does not: it waits only for its own channel). It is kept, saying "Nothing reported right now.", when every report is taken back. None in rehearsal mode. **Links** (B1): `messageOf` (once what waits is drawn) and `linkOf` (as last drawn) give a `PostLink`, the message that holds the subject or else the post's first message (review P9: a task only counted), `{ channelId, messageId }` with the board's thread as the channel, and every caller links it so (`https://discord.com/channels/<server>/<thread>/<message>`): the research and Rocket DMs' "Go to post", "Already reported" (`postLinkOf`), the map's links (`stop-routes.ts`) and the lines of the region channels. The region's summary links the post (plan 8X-G, `parties-and-posts.md`): `summaryOf(channelId)` gives the server, the board's thread, the first message of the stops and how many tasks and hideouts it shows as last drawn (the hideouts as the post counts them, one per leader or decoy whatever its stops, review r0 C2), and under an event's window how many tasks of the day's research wait below it and when they come back (`waiting`, plan 8R-6: the summary says `· 13 tasks back at <t:…:t>`), undefined without a post of today drawn since the start; `changed(channelId)` (`StopPostServiceOptions`, `app.ts`: `PartyService.summaryChanged(region, true)`) is told after each draw and each delete, so the summary is drawn anew after every draw of the post, edited where the counts changed, and its pin and lock checked. A member kept out of the region's forum (`memberAccess`) no longer sees the stops, though they see the text channel's lines (Matt's answer: accepted).
-- **The lines of the region channels** (B9; `StopLineService`, `src/services/stop-lines.ts`, `src/render/stop-lines.ts`): the first time in a local day that a research task (any version of it, "one of" too; research waiting under an event's window counts, its task placed in the post) or a leader or Giovanni is reported at a stop in a region, a line in the region's channel links the board's message that holds it: `Research: **Catch 25 Pokémon** (Rare Candy) → <link>` (its text and its reward as first reported, `one of …` for a "one of", nothing for a typed task without one; `researchLine`) and `Team GO Rocket: **Arlo** at **Yellow Mural** → <link>` (`hideoutLine`); names through `plain()`. The line is claimed first by its row (`StopLine`, migration 031, unique `(serverId, regionChannelId, day, lineKey)`; keys `research:<task key>` and `rocket:<leader:… | giovanni>`; `StopLineRepository` and its twin `MemoryStopLines`, `stopLineCases`), then the board's draw is waited for (`messageOf`), then it is sent and its message kept; where the region has no board (or the send fails) nothing is sent and the claim is let go, so a later report there tries again. A line whose day ended while its board message was looked for (midnight's sweep may have forgotten its claim, and the link would be today's post) is not sent and its claim is let go (review W1); a line sent while a sweep forgot its claim is kept all the same (`StopLineStorage.sent` is an upsert), so a sweep deletes it. Later reports of the same task or leader that day post nothing, and the line is never edited; a task whose only report is taken back keeps its line (Matt's answer). No line for a decoy, a grunt or a narrowing (the same task's key). It hears research news (`reported`) and hideouts (`StopReportListener.hideoutReported`, told by `reportRocket` for every hideout reported, the same one again too, not for one put back). At each local midnight (`nextLocalMidnight`, Luxon) the lines of the days before are deleted, and at `start` those a restart left; a line whose delete fails keeps its row for the next sweep, unless Discord refused it for good (50001, 50013: said once and forgotten, review R1) (review P1: midnight, start, and the catch-up on reconnect, whose job `stop lines` runs `sweep`; and, where a line of a day that ended was kept, a delete failed or a line was sent as its day ended, before the next line is sent, review W2, rather than by a timer of its own). Two losses are accepted: a process that stops between the claim and the send leaves a claimed row without a message, so that task or leader gets no line that day; a line sent whose message id could not be stored is not deleted at midnight. None in rehearsal mode (nor where the region has no board); at shutdown it is closed before the posts of the stops, in their step (`stopReportSteps`).
-- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task (`grouped`, `stop-posts.ts`), an event's tasks first (plan 8R-8: `isEventCategory` of the report's category; a typed task never is one), then the rest, each part most stops first and then by the first report, so a busy day cuts an event's task last (plan 8R-5, R9: one block per task, counted as tasks; a task of one version with its rewards beside it, of several a line of each version's rewards before its stops (`reward not said` for a typed task's version without its reward, review R1), the rewards' versions first and "one of" last, a picture per reward line (plan 8R-6, "Pictures at the stops"); the versions as the decision sees them (`grouped` by `StopReportService.versionOf`, review R2: a report of before plan 8R-5 of a task of one reward under that reward's version, R10; "one of" before and now one group), each in the words of its newest report; the task's key and every version placed, so a DM of any version links the block), each with its rewards and up to 15 stops (`- **[Stop](<maps>)** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"; since plan 8R-7, E1, every stop's name is the link to its place on Google Maps, `stopMapLine`, `src/render/research.ts`: `stopMapsUrl` of `raid-post.ts`, the address `gymMapsUrl` makes with the coordinates rounded to five decimals, in angle brackets so that it unfurls no preview, the name cut to 80 before it is made plain, always without a working address (`plainNoLinks`: a stop named `https://…` would show one address and link another), and its brackets escaped by `linkTextOf`; a task's, a version's, a hideout's and the day's research under a window alike, the plain text too; `fill` counts each line whole with its link, so a link is never cut and a busy day shows fewer stops a block by the same rules, `STOPS_SHOWN` and `MAX_POST_MESSAGES` unchanged; Matt's choice, R6: the party posts' Where keeps its name plain bold with a `[Map]` word, and so does a grunt's message); within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it); under an intra-day window (or a big event's daily hours) the day's research waiting stays below the window's tasks (plan 8R-6, Matt: `StopPostView.waiting.tasks`, under `### Back at <t:…:t>, after <event>`, in the same blocks without pictures, after the hideouts, so that a busy event day counts it away before any hideout (Matt, 2026-10-24); the line "The day's research comes back at" is gone; it counts in the layout and the busy day as any block, and the placement keeps the window's message for a key both have). Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research (before the day's research waiting under a window) under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (its picture by the rule beside it, plan 8R-6: a leader's or Giovanni's portrait) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
+- `StopPostService` (`src/services/stop-posts.ts`): one post per region channel and local day, made at the first report of the day in the region, in the region's board: the thread of `Region.summaryMessageId`, read anew at each draw (B2), its messages sent with `SuppressNotifications` (`SendOptions.silent`, B13: a follower of the board is not notified of each; edits never notify). No pin: every message the bot sends lands below the ones before (a member's message between them is deleted at once, plan 8R-9F; a moderator's kept message stays where it is); the summary stays the post's first message. Drawn anew `POST_DELAY_MS` (3 s) after the last change (`Gathered`, coalesced) in one queue per channel (`KeyedLock`), the midnight delete included; reads are done before any Discord call. A change of the reports is drawn only in the regions it touched: `StopReportListener.changed(serverId, stops)` names the stops of the reports made or taken back (a replaced report's too), and only the region channels whose outlines hold one of them are queued; the period changes and the research events draw every post. A message whose payload equals the one last drawn there (a hash per message id, in memory: the first draw after a restart edits) is not edited. An edit that fails is thrown (logged, the post stands, the next change draws it again); a message is deleted and sent anew only when it is gone or changes kind (components v2 to plain text, or back, as the board's `postAccess` changes), and, its kind not known in the first draw after a restart, when Discord refuses its edit for what it holds (`isRefusedBody`); any other failure keeps it there too. **A message sent anew in its place takes every message after it along** (B5): messages i to n are deleted and sent again below it, so the order stays (a moderator's message kept between the bot's messages stays above any re-sent stops: accepted, plan 8R-9F, B11). **Where the board is not** (B10: the region has no forum or no summary post): nothing is drawn, the summary's counts and the links are forgotten, and `the region has no board post` is said once per channel until it draws again; no fallback to the text channel. The next turn-over (the period timer, the research events, the catch-up) draws such a region again (review P6, its server by `serverOf`); a send into a board that is gone tells the summary (`changed`), whose next edit makes the board anew (review P2). **Where the bot may not write in it** (B6, `PartyGateway.postAccess`, the post fetched (review P3), on the post's forum: View Channel and Send Messages in Threads, and Manage Threads only where a moderator locked the board, which writing in a locked post takes, Discord's 160005; plan 8R-9F, B5): nothing is drawn, said once (`the bot may not write in the board post`); without Embed Links the post is plain text (`stopPostText`). **A board replaced or taken over** (B2: `replaceSummary` deletes the whole thread, `takeOverSummary` may record another post): the `StopPost` row keeps the board it was drawn in (`threadId`, migration 031); a draw in another board deletes the old board's messages first (review P5: a post taken over must not keep a second copy; a thread gone is fine), never opening it (review R2: an archived old board refuses with 50083, which is logged and accepted) and sends every message anew there, and `PartyService` tells `boardChanged(channelId)` when it makes or takes over a summary, which draws the region's post (its server by the kept post, else by the region's row, `guilds.snowflakeOf`). The gateway opens an archived board before it sends or deletes in it where asked (B3: Discord refuses either in an archived locked post, 50083; an edit opened it already; review P4: `SendOptions.reopen` and `DeleteOptions.reopen`, asked only by the posts of the stops, every other send and delete as before), and the summary checks the board's pin and lock after each draw of the stops (`changed` → `PartyService.summaryChanged(region, true)`, B4). **The first switch** (B11): a row without `threadId` is a post the bot before plan 8R-9 pinned in the region's channel, read as messages of that channel still to delete (`fromStorage`, `StopPostRecord.leftover`, column `leftoverIds` of migration 031); the first draw unpins and deletes them there (`clear`), `start` the older days' rows too (`remove`), and today's post is drawn in the board. **A delete that fails** (review P1, the network away) is never forgotten: a message of the region's channel stays in `leftover` of the day's row (with the board post, or in a row of its own while none is drawn) and is tried again at each draw; a post of an ended day whose delete fails keeps its row with what is left (`leftovers` in memory), deleted again at the channel's next draw (review W2, in its queue, before anything else of the draw), at the next turn-over and, after a restart, at `start`; a message gone counts as deleted, and a delete Discord refuses for good (50001, 50013, review R1) is said once per channel and forgotten (DMs and answers sent earlier that day point at deleted messages: accepted). A channel with no post in memory reads its kept rows from storage before it draws (a report before `start` has read them, or after that failed, edits the post a restart left; a failed read draws nothing), and `start` keeps what such a draw made, and deletes a post older than its channel's newest (one whose delete failed at its midnight). A timer at `nextPeriodChange` draws every kept post anew (`draw` deletes the post of an ended day and makes today's where reports stand); `start()` does the same for what a restart left (`StopPost` keeps the ids, each message's saved as soon as it is sent), and sets the timer also when the kept posts cannot be read; a change of the research events (`onResearchChange`) draws the posts anew and sets the timer again (those redraws in a set of their own, which `flush` and `close` wait for and `messageOf` does not: it waits only for its own channel). It is kept, saying "Nothing reported right now.", when every report is taken back. None in rehearsal mode. **Links** (B1): `messageOf` (once what waits is drawn) and `linkOf` (as last drawn) give a `PostLink`, the message that holds the subject or else the post's first message (review P9: a task only counted), `{ channelId, messageId }` with the board's thread as the channel, and every caller links it so (`https://discord.com/channels/<server>/<thread>/<message>`): the research and Rocket DMs' "Go to post", "Already reported" (`postLinkOf`), the map's links (`stop-routes.ts`) and the lines of the region channels. The region's summary links the post (plan 8X-G, `parties-and-posts.md`): `summaryOf(channelId)` gives the server, the board's thread, the first message of the stops and how many tasks and hideouts it shows as last drawn (the hideouts as the post counts them, one per leader or decoy whatever its stops, review r0 C2), and under an event's window how many tasks of the day's research wait below it and when they come back (`waiting`, plan 8R-6: the summary says `· 13 tasks back at <t:…:t>`), undefined without a post of today drawn since the start; `changed(channelId)` (`StopPostServiceOptions`, `app.ts`: `PartyService.summaryChanged(region, true)`) is told after each draw and each delete, so the summary is drawn anew after every draw of the post, edited where the counts changed, and its pin checked (and a board never opened, opened once: `parties-and-posts.md`). A member kept out of the region's forum (`memberAccess`) no longer sees the stops, though they see the text channel's lines (Matt's answer: accepted).
+- **The lines of the region channels** (B9; `StopLineService`, `src/services/stop-lines.ts`, `src/render/stop-lines.ts`): the first time in a local day that a research task (any version of it, "one of" too; research waiting under an event's window counts, its task placed in the post) or a leader or Giovanni is reported at a stop in a region, a line in the region's channel links the board's message that holds it: `Research: **Catch 25 Pokémon** (Rare Candy) → <link>` (its text and its reward as first reported, `one of …` for a "one of", nothing for a typed task without one; `researchLine`) and `Team GO Rocket: **Arlo** at **Yellow Mural** → <link>` (`hideoutLine`); names through `plain()`. The line is claimed first by its row (`StopLine`, migration 031, unique `(serverId, regionChannelId, day, lineKey)`; keys `research:<task key>` and `rocket:<leader:… | giovanni>`; `StopLineRepository` and its twin `MemoryStopLines`, `stopLineCases`), then the board's draw is waited for (`messageOf`), then it is sent and its message kept; where the region has no board recorded (or the send fails) nothing is sent and the claim is let go, so a later report there tries again; where it has one but the board's message is not found (a moderator deleted the board, which is being made anew: plan 8R-9F, M2, B9) the claim is kept and the line waits for that channel's next full draw (`StopPostService.onDrawn`, never told of a draw whose send failed), tried once more then and let go if still nothing, or at the day's end, or at shutdown (`close` lets every waiting claim go, review F4, so that a report after a restart that day can claim it; a draw told after the close sends nothing). A line whose day ended while its board message was looked for (midnight's sweep may have forgotten its claim, and the link would be today's post) is not sent and its claim is let go (review W1); a line sent while a sweep forgot its claim is kept all the same (`StopLineStorage.sent` is an upsert), so a sweep deletes it. Later reports of the same task or leader that day post nothing, and the line is never edited; a task whose only report is taken back keeps its line (Matt's answer). No line for a decoy, a grunt or a narrowing (the same task's key). It hears research news (`reported`) and hideouts (`StopReportListener.hideoutReported`, told by `reportRocket` for every hideout reported, the same one again too, not for one put back). At each local midnight (`nextLocalMidnight`, Luxon) the lines of the days before are deleted, and at `start` those a restart left; a line whose delete fails keeps its row for the next sweep, unless Discord refused it for good (50001, 50013: said once and forgotten, review R1) (review P1: midnight, start, and the catch-up on reconnect, whose job `stop lines` runs `sweep`; and, where a line of a day that ended was kept, a delete failed or a line was sent as its day ended, before the next line is sent, review W2, rather than by a timer of its own). Two losses are accepted: a process that stops between the claim and the send leaves a claimed row without a message, so that task or leader gets no line that day; a line sent whose message id could not be stored is not deleted at midnight. None in rehearsal mode (nor where the region has no board); at shutdown it is closed before the posts of the stops, in their step (`stopReportSteps`).
+- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task (`grouped`, `stop-posts.ts`), an event's tasks first (plan 8R-8: `isEventCategory` of the report's category; a typed task never is one), then the rest, each part most stops first and then by the first report, so a busy day cuts an event's task last (plan 8R-5, R9: one block per task, counted as tasks; a task of one version with its rewards beside it, of several a line of each version's rewards before its stops (`reward not said` for a typed task's version without its reward, review R1), the rewards' versions first and "one of" last, a picture per reward line (plan 8R-6, "Pictures at the stops"); the versions as the decision sees them (`grouped` by `StopReportService.versionOf`, review R2: a report of before plan 8R-5 of a task of one reward under that reward's version, R10; "one of" before and now one group), each in the words of its newest report; the task's key and every version placed, so a DM of any version links the block), each with its rewards and up to 15 stops (`- **[Stop](<maps>)** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"; since plan 8R-7, E1, every stop's name is the link to its place on Google Maps, `stopMapLine`, `src/render/research.ts`: `stopMapsUrl` of `raid-post.ts`, the address `gymMapsUrl` makes with the coordinates rounded to five decimals, in angle brackets so that it unfurls no preview, the name cut to 80 before it is made plain, always without a working address (`plainNoLinks`: a stop named `https://…` would show one address and link another), and its brackets escaped by `linkTextOf`; a task's, a version's, a hideout's and the day's research under a window alike, the plain text too; `fill` counts each line whole with its link, so a link is never cut and a busy day shows fewer stops a block by the same rules, `STOPS_SHOWN` unchanged; Matt's choice, R6: the party posts' Where keeps its name plain bold with a `[Map]` word, and so does a grunt's message); within 40 components and `TEXT_BUDGET` a message, spilling into further messages, ten at most (`MAX_POST_MESSAGES`: three before plan 8R-9F; Matt, a sanity limit, so a busy day spills rather than cuts and a hideout is never what is lost; a re-send of messages i to n is then up to nine deletes and nine sends inside the channel's queue, B10), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it); under an intra-day window (or a big event's daily hours) the day's research waiting stays below the window's tasks (plan 8R-6, Matt: `StopPostView.waiting.tasks`, under `### Back at <t:…:t>, after <event>`, in the same blocks without pictures, after the hideouts, so that a busy event day counts it away before any hideout (Matt, 2026-10-24); the line "The day's research comes back at" is gone; it counts in the layout and the busy day as any block, and the placement keeps the window's message for a key both have). Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research (before the day's research waiting under a window) under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (its picture by the rule beside it, plan 8R-6: a leader's or Giovanni's portrait) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
 
 ## Wants and DMs
 
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index 68f3b66c..102d1fc6 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -221,7 +221,7 @@ It reads the database and, with the bot's token, Discord's API (reading only; it
 - **application**: `DISCORD_APP_ID` must be the token's application. A `FAIL` names the right one.
 - **intents**: the settings ask for none, so this passes.
 - **emoji**: warns until you upload the game's icons as the application's emoji (below).
-- **servers**, **server …** and the region lines: whether the bot is in the database's server, and the permissions its role lacks in the server, in each region's channel and in the category where its forum will be. A missing required one is a `FAIL` that says what it is for; give the bot's role that permission in Server Settings → Roles (or fix the category's overwrites), and run the check again. In a region's forum the line names the permissions as the forum's settings do: Manage Posts (Manage Threads), without which the bot makes no post with its tags there, Create Posts (Send Messages), Send Messages in Posts. Pin Messages is no longer asked for: "Today’s Stops" is posted in the region's board, the locked post "Today and coming up" of its forum, where writing takes Manage Posts (Manage Threads) and Send Messages in Posts.
+- **servers**, **server …** and the region lines: whether the bot is in the database's server, and the permissions its role lacks in the server, in each region's channel and in the category where its forum will be. A missing required one is a `FAIL` that says what it is for; give the bot's role that permission in Server Settings → Roles (or fix the category's overwrites), and run the check again. In a region's forum the line names the permissions as the forum's settings do: Manage Posts (Manage Threads), without which the bot makes no post with its tags there, Create Posts (Send Messages), Send Messages in Posts. Pin Messages is no longer asked for: "Today’s Stops" is posted in the region's board, the post "Today and coming up" of its forum, where writing takes Send Messages in Posts and pinning Manage Posts (Manage Threads). Manage Messages missing in a forum is a `WARN`: the board works, but what members write there stays instead of being deleted.
 - **forums**: every region without a forum warns. That is expected: step 4.9 makes them.
 - **names**: channels, a category or a role the settings name that your server does not have. Fix `pine-settings.json` or the server.
 - **announcements**: whether the bot may post in the channels it announces in (bot updates, the moderators' channel, Unown sightings, the elite and remote raid channels).
@@ -274,7 +274,7 @@ They can take a little while to show up in Discord.
 ### 4.9 The admin's part, in Discord
 
 1. **The bot's role**: whatever `cutover-check` said it still lacks.
-2. **`/admin setup-forums`**: every region gets a forum next to its channel, its board (named after the channel with `-board`, the `regionForumSuffix` setting), with its tags and a pinned and locked post "Today and coming up" (its raids, max battles, trains and meetups of today, then what is coming up on later days, and "Today’s Stops" below it). An installation that ran the bot before the board (forums ending in `-meetups`, a pinned "Going on now", "Today’s Stops" pinned in the region channels) runs it once after the update: it renames the forums and the post, locks the post, and the bot moves "Today’s Stops" into it at its next start. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again. A region that fails says why (most often the category's permissions).
+2. **`/admin setup-forums`**: every region gets a forum next to its channel, its board (named after the channel with `-board`, the `regionForumSuffix` setting), with its tags and a pinned post "Today and coming up" (its raids, max battles, trains and meetups of today, then what is coming up on later days, and "Today’s Stops" below it). Members can use commands in it; what they write there is deleted (Manage Messages in the forum) and they are told by DM once a day, a moderator's message stays, and it has a slowmode of six hours. An installation that ran the bot before the board (forums ending in `-meetups`, a pinned "Going on now", "Today’s Stops" pinned in the region channels) runs it once after the update: it renames the forums and the post, and the bot moves "Today’s Stops" into it at its next start. A board an earlier build locked is opened once (at its next draw or by this command); a lock a moderator sets later stays, and this command says so. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again. A region that fails says why (most often the category's permissions).
 3. **The regions' borders** (when the web pages are set up, `docs/web-setup.md`): `/region edit` opens the region editor, whose list shows the overlaps and gaps between the regions as the legacy map drew them. **Fix all slivers…** settles the thin ones (it asks only where a gym or stop would change region), and **Save** writes the new outlines straight into the database: no KML export or `/region import` is needed. What is no sliver is listed to be drawn by hand. Members' parties stay where they are.
 4. **`/admin cleanup-legacy`**: deletes the channels of the legacy raids. It first only **lists** them: the raid channels the legacy files name, and leftover legacy party channels that no file names (found by their names and the legacy bot's own first message). Channels it is not sure of are listed apart as "Not deleted", for a person to judge. The channels of the trains and meetups that are still open, and of any party saved with `!save-party`, are **not deleted**: many are long-lived discussion channels. They are listed under their own "Not deleted" heading with the party's name, the day it was made and how many signed up; delete by hand the ones that are dead, and the rest stay as plain channels (their old status message stays, and nothing answers it any more). New trains and meetups start with `/train` and `/meetup`. Nothing is deleted until you press "Delete these n channels" (within ten minutes). One run deletes at most 400 channels; run the command again for the rest.
 
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index 3bca4ee7..c8947f54 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -28,9 +28,9 @@ In the [Discord Developer Portal](https://discord.com/developers/applications):
    - View Channels, Send Messages, Send Messages in Threads, Embed Links, Attach Files, Read Message History
    - Manage Channels (the forums, and the channels `/region import` creates)
    - Manage Roles (self-assigned roles, and who may see a forum)
-   - Manage Threads (archiving, locking, renaming and pinning posts, the tags of a post, and writing in the region's locked board; in a forum's own permissions Discord calls it **Manage Posts**, and without it there the bot makes no post at all and tells the member so)
+   - Manage Threads (archiving, locking, renaming and pinning posts, the tags of a post, and pinning and opening the region's board; in a forum's own permissions Discord calls it **Manage Posts**, and without it there the bot makes no post at all and tells the member so)
    - Add Reactions and Use External Emojis (optional)
-   - Manage Messages (optional: taking a screenshot away once it became a raid, and deleting a message the moderators delete from a report)
+   - Manage Messages (optional: taking a screenshot away once it became a raid, deleting a message the moderators delete from a report, and deleting what members write in the region's board; without it in the forums, members' messages stay in the board and `cutover-check` warns)
 
    As a number for the link's `permissions=`, that is `292326599760`. `./pine cutover-check` (section 4) checks the bot's role against these.
 
@@ -171,7 +171,7 @@ Draw the outlines in a map editor such as [Google My Maps](https://www.google.co
 
 ## 7. Forums
 
-Once regions and gyms are in, a staff member runs `/admin setup-forums` in your server: every region gets a forum beside its channel, its board (named after the channel with `-board`, the `regionForumSuffix` setting), its tags, and a pinned and locked post "Today and coming up" (its raids, max battles, trains and meetups of today, then what is coming up on later days), under which the bot posts "Today’s Stops" (the day's field research and Team GO Rocket hideouts). Only the bot and moderators write in that post. The region's channel gets a short line the first time a task, a leader or Giovanni is reported there in a day, deleted at midnight. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again; a region that fails says why (most often the category's permissions for the bot).
+Once regions and gyms are in, a staff member runs `/admin setup-forums` in your server: every region gets a forum beside its channel, its board (named after the channel with `-board`, the `regionForumSuffix` setting), its tags, and a pinned post "Today and coming up" (its raids, max battles, trains and meetups of today, then what is coming up on later days), under which the bot posts "Today’s Stops" (the day's field research and Team GO Rocket hideouts). Members can use commands in that post (report research or Team GO Rocket where they see what is reported), but it keeps only the bot's lists: what a member writes there is deleted at once (the bot needs Manage Messages in the forum), and the member is told by DM once a day; a screenshot posted there is read first and answered by DM. A member with Manage Messages there (a moderator) keeps their message. The post has a slowmode of six hours (members write there that seldom; commands and the bot are not held by it). A moderator may lock it; the bot leaves a lock alone, and `/admin setup-forums` says so. The region's channel gets a short line the first time a task, a leader or Giovanni is reported there in a day, deleted at midnight. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again; a region that fails says why (most often the category's permissions for the bot).
 
 Then try it: `/raid` in a region channel, the buttons in the post, `/max` (a max battle at a Power Spot: the Power Spots come with the Wayfarer import), `/train` (also `kind:Gigantamax Train`, with Power Spots as its stops), `/meetup`, `/research report` (the task of a PokéStop: "Today’s Stops" in the region's board shows it, and a task new that day gets a line in the region's channel), `/rocket report` (a grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy goes in "Today’s Stops" in the board), `/want` and a report of that boss by somebody else. `/help` lists everything.
 
diff --git a/docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md b/docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md
index 16d02352..c5248a55 100644
--- a/docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md
+++ b/docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md
@@ -11,7 +11,7 @@ Words used below:
 
 ## Before anything
 
-- [ ] Matt checks in the server that the bot's role has Manage Channels, Manage Roles and Manage Threads (the cutover check lists all it needs, with why).
+- [ ] Matt checks in the server that the bot's role has Manage Channels, Manage Roles, Manage Threads and Manage Messages (the last optional, for tidying the boards, plan 8R-9F; the cutover check lists all it needs, with why).
 - [ ] An admin with Manage Server is on hand for the rehearsal's window and for the night (Integrations, `/admin setup-forums`, `/admin cleanup-legacy`).
 - [ ] O1 (where the rehearsal runs): Matt's PC with Docker Desktop unless Matt names a Linux box; the steps below are for his PC and work the same on Linux.
 - [ ] O3 (the legacy intents patch): by default it ships with the first push and nothing goes to the old host before the night.
@@ -33,8 +33,8 @@ A bot cannot give command access to single members. During the rehearsal the com
 - [ ] First, on the test server with the dev application (Matt's go-ahead; nothing of production), with a scratch settings file and never the tracked `data/settings.json`: copy it to `var/stage/rehearsal-settings.json`, add a `rehearsal` block, and run each command below with `SETTINGS_PATH=var/stage/rehearsal-settings.json`. The dev application's global commands show to everybody whatever the server's copies say, so take them away first for this check (register them again afterwards with `--global` from the ordinary staging settings). Deploy with `npm run deploy-commands -- --rehearsal`. Then under Server Settings → Integrations → the application, set "Roles & Members" of the application as a whole: @everyone off, the test account Tester on. Check: Tester is offered `/raid`, and not `/admin` until it is added to `/admin` itself on the same page; a second account outside that list (or Tester after taking it off the list again) is offered no Professor Pine command. End with `npm run deploy-commands -- --clear-guild` (same `SETTINGS_PATH`), give @everyone the application back, and register the global commands again: the test server is as it was.
 - [ ] Also on the test server, before R5, a hidden forum made by a bot that is no administrator (production's role may not be one):
   1. In the scratch settings, rehearse one region of the test server that has no forum (`settings.rehearsal.regions`, its channel's name as written). If every region has one, note one region's forum id and clear its forum in the dev database as in step 5 (the old forum stays in Discord, untouched).
-  2. Server Settings → Roles → the dev bot's role: take Administrator off, and make sure the role itself gives Manage Channels, Manage Roles, Manage Threads, View Channel, Send Messages, Send Messages in Threads, Embed Links, Attach Files, Read Message History and Add Reactions (from the role, not through a category: a creation may give only what the bot has in the server).
-  3. Start the bot in rehearsal mode (scratch settings as above) and run `/admin setup-forums`: the region's line says "created", "hid it from all but staff and the testers" and "posted, pinned and locked the board". A forum that is not made says why ("I could not make this forum hidden from members…").
+  2. Server Settings → Roles → the dev bot's role: take Administrator off, and make sure the role itself gives Manage Channels, Manage Roles, Manage Threads, Manage Messages, View Channel, Send Messages, Send Messages in Threads, Embed Links, Attach Files, Read Message History and Add Reactions (from the role, not through a category: a creation may give only what the bot has in the server).
+  3. Start the bot in rehearsal mode (scratch settings as above) and run `/admin setup-forums`: the region's line says "created", "hid it from all but staff and the testers" and "posted and pinned the board" (plan 8R-9F: open to members' commands; "but I may not delete what members write in it" where the forum withholds Manage Messages). A forum that is not made says why ("I could not make this forum hidden from members…").
   4. Check the forum is hidden: a test account without a staff role and outside the allowlist does not see it; the forum's Permissions page shows View Channel denied to @everyone. If the category gives the bot something its role does not, the log may warn "a new hidden forum stays as it was made: Discord refused the bot … there, which only the category gives it": the forum is still hidden; note what it names (a finding for the night).
   5. Undo it: stop the bot; delete the new forum in Discord; clear the region's forum in the dev database (`docker exec -it pine-dev-mysql mysql -u <user> -p <schema> -e "UPDATE Region SET forumChannelId = NULL WHERE channelId = <region channel id>"`, or the noted forum id instead of `NULL` for a region that had one); give the dev bot's role Administrator again.
 
@@ -151,7 +151,7 @@ A bot cannot give command access to single members. During the rehearsal the com
 
 - [ ] Server Settings → Integrations → Professor Pine: lift the rehearsal's restriction (R1): @everyone on again for the application, so that members see the commands. Matt's entries on `/admin`, `/gym` and `/region` may stay (they let him use the staff commands without Manage Server).
 - [ ] The bot's role: what the cutover check asked for, if anything is still missing.
-- [ ] `/admin setup-forums`: every region gets its forum (`<channel>-board`), its tags and its board, the locked pinned post "Today and coming up" with "Today’s Stops" below it. A region that fails says why (most often a category's overwrites: Manage Channels, Manage Threads).
+- [ ] `/admin setup-forums`: every region gets its forum (`<channel>-board`), its tags and its board, the pinned post "Today and coming up" with "Today’s Stops" below it, open to members' commands (plan 8R-9F). A region that fails says why (most often a category's overwrites: Manage Channels, Manage Threads); one whose forum withholds Manage Messages says the bot may not delete what members write in the board (a warning in `cutover-check` too).
 - [ ] `/region edit` → **Fix all slivers…** (take the midline unless a moderator knows better) → **Save**: the outlines are written to the database at once (no KML round trip); the list then holds only what must be drawn by hand. Staged on the test server with Pittsburgh's 28 outlines on 2026-10-18 (71 stretches fixed, no gap left, 2 s for the server's check).
 - [ ] `/admin cleanup-legacy`: read the list. "To delete" holds the raid channels of the legacy files and the orphans; "Not deleted" is for a person (delete by hand what should go). The legacy trains, meetups and saved parties are listed apart and stay (Matt, 2026-10-21): delete by hand the dead ones (the list gives each one's name, the day it was made and how many signed up); the rest stay as plain channels for discussion ("Wayfarer Discussion and Planning", the PokéStop submission threads, tourney signups), their old status post unanswered. Then "Delete these n channels" within ten minutes; the answer says what was deleted, what was gone and what failed. More than 400 channels go in runs of 400 ("Delete 400 of these n"): run `/admin cleanup-legacy` again for the rest.
 
diff --git a/docs/superpowers/plans/2026-10-27-phase-8r9f-staging.md b/docs/superpowers/plans/2026-10-27-phase-8r9f-staging.md
new file mode 100644
index 00000000..0f23f1bc
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-27-phase-8r9f-staging.md
@@ -0,0 +1,70 @@
+# Phase 8R-9F staging checklist: the region's board takes commands (draft)
+
+Every step needs Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab.
+
+- **Accounts:** Googer (owner, staff) and Tester (a member, without Manage Messages).
+- **Plan:** `2026-10-27-phase-8r9f-region-board-commands.md`.
+- **Design:** `docs/superpowers/specs/2026-10-27-region-board-commands-design.md` (its review B1–B11, Matt's Q1–Q3 and the answers R1–R3).
+- **Conventions:** `docs/architecture/parties-and-posts.md`, "The region's board" and "What members write in the board"; `docs/architecture/stop-reports.md`, "Today’s Stops" on the region's board; `docs/architecture/screenshots.md`, "In the board".
+
+The steps use two regions of the test server, called West and East below (note which). West's board is the one 8R-9's staging left (locked, without slowmode). Note the tasks, times and messages used.
+
+## Before
+
+1. **The commands.** `/research` and `/rocket` changed their help only, and `/admin setup-forums` its words and help (not its description): no deploy is needed. If one is made anyway:
+
+   ```
+   set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global
+   ```
+
+2. **The database.** No migration. Check `var/stage/TEST-SERVER-STATE.md` and note that 8R-9F is being staged.
+3. **What the switch meets.** Before the new build starts, note that West's and East's boards are locked (Discord's "This post is locked" line), with no slowmode (the post's settings), as 8R-9 left them.
+4. **Permissions.** The bot's role has Manage Messages in the server (or in the regions' forums); note where it comes from (step 21 takes it away).
+
+## Opened once (R2)
+
+5. Start the new build. The first draw of West's summary (a report there, or the midnight or catch-up redraw) unlocks West's board and gives it a slowmode of 6 hours (the post's settings: "Slowmode: 6h"); it stays pinned.
+6. `/admin setup-forums` as Googer: East's board (still locked if nothing drew it) is opened the same way; each region's line says its forum is ready and nothing about the board.
+6b. **A forum's own slowmode** (review F2): give East's forum a default post slowmode (the forum's settings, "Default slowmode", say 1 minute) before step 6 if East's board was made after it; a locked board with that slowmode is opened all the same and given 6 hours. A moderator who locks West's board and also clears its slowmode has it opened again at the next draw (accepted: keep the slowmode to keep it locked).
+7. **A moderator's lock stays.** Googer locks West's board by hand. A report in West draws the stops (and edits the summary): the board stays locked, and the stops are drawn as before (the bot has Manage Posts). `/admin setup-forums`: West's line says `the board is locked, so members cannot use commands in it (a moderator locked it; unlock it to let them)`. Googer unlocks it again; nothing more is said.
+8. **A new board.** Googer deletes East's board post. The next report in East makes it anew: pinned, unlocked, slowmode 6 hours; the stops are drawn in it.
+
+## Commands in the board
+
+9. **Slash commands.** Tester, in West's board: `/research report` of a task at a West stop, `/rocket report` of a leader, `/status`, `/help`. Each answers privately as in the region's channel; the board shows the task and the hideout in "Today’s Stops" within a few seconds. `/research` and `/rocket` find the region through the forum.
+10. **Slowmode does not hold commands or the bot** (B4): Tester uses three commands in a row in the board within a minute: none is held. The bot's stops messages are sent and edited as before. Tester writes a message, then another within the 6 hours: Discord holds the second (its own slowmode countdown in the message box).
+11. **Public answers** (B11): no command used in the board posts anything there; `/wild` from the board posts its spawn report in West's text channel.
+
+## What members write in the board
+
+12. **Deleted at once** (B3): Tester writes "hello" in West's board. It is gone within a second or two. Tester gets a DM: `I deleted your message in #…: the board keeps only my lists of what is on. Chat in #west, or report with a command such as /raid, /research or /rocket, there or in the board.`
+13. **Once a day** (Q2): Tester writes again (after the slowmode, or from a second test account without Manage Messages): deleted, no second DM the same day. A DM again after midnight (with steps of the next day, optional).
+14. **A moderator's message stays** (Q1): Googer writes a message in West's board: it stays. A report that sends a stops message anew (the post growing a message) sends it below Googer's: Googer's message stays above the re-sent stops (B5, accepted).
+15. **Another application.** A webhook or another bot of the test server (if one is at hand) writes in the board: deleted, no DM (B3).
+16. **Discord's own messages** (a title change, a pin note): left alone; nothing in the log about them.
+17. **The pin check** (B7): Googer archives West's board; Tester writes in it (which opens it, unpinned). The message is deleted and the board is pinned again within a few seconds.
+18. **A stopped bot** (B6): stop the bot. Tester writes two messages in West's board (wait out the slowmode, or use a second account). Start the bot: both are deleted at start (one bulk delete in the log's REST, if visible), Tester gets one DM. Then cut the network for a minute (as in 8X-H's staging) while Tester writes a message; once the gateway is back, the catch-up's `boards` job deletes it.
+
+## Screenshots in the board (R1, B2)
+
+19. **With a mention.** Tester posts a raid screenshot of a West gym in West's board with a mention of the bot. The message is gone within a second or two (before the reading: watch it go while the bot still reads); no 🤔 or ✅ and no reply in the board. The raid's post is made in West's forum and listed on the board; Tester gets one DM: `From your screenshot in #… (the board keeps only my lists, so I took your message out of it):` and `- Reported the raid at …: #post.` Googer (Manage Messages) posts one too: the message stays, and the DM opens `From your screenshot in #… (I left your message in the board):` (Q1, review F1). With Manage Messages denied in the forum (step 27), Tester's screenshot stays and the DM's opening says nothing about the board.
+20. **Unsure.** A screenshot of a gym with a twin name (or a cut-off name), and one of a gym in East: nothing is reported, nothing asked in the board; the DM points to `/raid screenshot:` (`I could not tell which gym this is: …` and `… is in #east: report it with /raid screenshot:, which asks you whether to report it there.`). A max battle's screenshot of a Power Spot not clear: the DM points to `/max screenshot:`.
+21. **Two pictures, one not a screenshot.** A message of a raid screenshot and a photo: the DM has two lines, `- 1: Reported …` and `- 2: This does not look like the screen of a raid, …`.
+22. **Passive.** With `ocr.passive` on: a screenshot in the board without a mention is read the same way; with it off, the message is deleted as any member's (step 12's DM).
+23. **Closed DMs.** Tester closes DMs from the server's members and posts a screenshot: the raid is made and listed on the board; no reply anywhere (R1, accepted).
+
+## "Today’s Stops": ten messages, M1, M2
+
+24. **Ten messages** (Matt's sanity limit): report enough tasks at enough West stops (`var/stage/seed-8r9.mjs`, `spread-8r9.mjs`, dev database only) that the post grows past three messages: it spills into a fourth and more, in order below the summary, and a Giovanni or leader reported last is shown (not cut). A re-send (a message turned from components to plain text, or deleted by hand) sends every message after it anew, in order (up to nine deletes and nine sends: note how long it takes).
+25. **Coming up says a kind once** (M1): a meetup tomorrow is listed as `#Meetup · … · <date> · 1 trainer` with no "Meetup ·" before it; a raid train tomorrow likewise; a Max Battle Train tomorrow reads `Max Battle Train · <name> · <date> · …` (`Max Battle` before its post, "Train" once, review F9); a raid train of East passing through West tomorrow is `Passing through · …`.
+26. **A line waits for its board** (M2): Googer deletes West's board post. Tester reports a task new today in West at once: no line yet; the board is made anew, the stops drawn in it, and the line follows, linking the new board's message. A second report of the same task meanwhile adds no second line.
+
+## Permissions
+
+27. **Manage Messages taken** (R3): deny the bot Manage Messages in West's forum. Tester writes in the board: the message stays; the log says `could not delete a message in the board` once. `/admin setup-forums`: West's line ends `I may not delete what members write in the board (give me Manage Messages there)`. `cutover-check` (only when Matt asks: it reads Discord's REST API with the token): West's region line warns `the bot could use Manage Messages in the forum #west-board`. Give it back: the next message is deleted, and the log is quiet.
+28. **Writing without Manage Posts** (B5): take Manage Threads (Manage Posts) from the bot in West's forum only. The stops are drawn in the open board as before; Googer locks it: nothing more is drawn (`the bot may not write in the board post` once). Unlock and give the permission back.
+
+## After
+
+29. Delete the test messages left, end every party made here, put the permissions back (and the slowmode as the bot set it), and note in `var/stage/TEST-SERVER-STATE.md` what was staged.
+30. Note the results in the follow-ups file, under "From the staging run of 8R-9F".
diff --git a/src/commands/research/research.test.ts b/src/commands/research/research.test.ts
index 2b6afeb8..7be2193d 100644
--- a/src/commands/research/research.test.ts
+++ b/src/commands/research/research.test.ts
@@ -957,6 +957,9 @@ describe('/research report and the versions of a task (plan 8R-5)', () => {
     // Where the reports show since plan 8R-9: the region's board, and a line for a new task.
     expect(details).toContain('"Today’s Stops" on the region’s board');
     expect(details).toContain('a line in the region’s channel');
+    // Open to commands since plan 8R-9F: no longer "locked".
+    expect(details).toContain('where you can report too');
+    expect(details).not.toContain('locked');
     expect(details).not.toMatch(/…$/);
     const report = research.data.toJSON().options?.find((option) => option.name === 'report');
     const reward =
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index 8aaded79..196ad767 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -464,7 +464,8 @@ const reportResearch: SubcommandPart = {
       'your own at a stop today, and a "one of" by one of its Pokémon. Another member’s report ' +
       'is asked about first: tick the stops whose report you replace. The same report again, ' +
       'or one that says less, is "Already reported". "Today’s Stops" on the region’s board ' +
-      '(its forum’s locked post) shows every task of the day, a task new today gets a line in ' +
+      '(its forum’s pinned post, where you can report too) shows every task of the day, a ' +
+      'task new today gets a line in ' +
       'the region’s channel, and members who want a reward get a direct message. A task ' +
       'missing from the list can be typed in full, with its ' +
       '`reward`. Your answer offers the same task at more stops nearby and takes the report ' +
diff --git a/src/commands/rocket/rocket.test.ts b/src/commands/rocket/rocket.test.ts
index 04ff5a58..17380523 100644
--- a/src/commands/rocket/rocket.test.ts
+++ b/src/commands/rocket/rocket.test.ts
@@ -881,5 +881,7 @@ describe('/rocket report’s help (plan 8R-9)', () => {
     const [details = ''] = textDisplays(message);
     expect(details).toContain('goes in "Today’s Stops" on the region’s board until midnight');
     expect(details).toContain('a line in the region’s channel');
+    // The board is open to commands since plan 8R-9F.
+    expect(details).toContain('you can report from the board too');
   });
 });
diff --git a/src/commands/rocket/rocket.ts b/src/commands/rocket/rocket.ts
index 9c8c8b84..4361a3dc 100644
--- a/src/commands/rocket/rocket.ts
+++ b/src/commands/rocket/rocket.ts
@@ -246,7 +246,8 @@ const reportRocket: SubcommandPart = {
       'theirs (your region’s first), or paste a maps link to a stop. A grunt is posted in the ' +
       `region’s channel for ${String(settings.rocket.gruntMinutes)} minutes; a leader, Giovanni ` +
       'or a decoy grunt goes in "Today’s Stops" on the region’s board until midnight (a ' +
-      'leader or Giovanni new today with a line in the region’s channel), and keeps grunts ' +
+      'leader or Giovanni new today with a line in the region’s channel; you can report from ' +
+      'the board too), and keeps grunts ' +
       `away from the stop all day. ${GIOVANNI_ONLY_WHEN_SURE} A ` +
       'stop has one report: a newer one replaces it (a grunt where a hideout was reported asks ' +
       'first), and the same grunt twice is answered with the report that stands. Members who ' +
````
