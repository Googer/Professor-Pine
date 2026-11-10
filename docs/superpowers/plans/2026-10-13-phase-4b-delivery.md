# Phase 4B: Delivery (DMs, Stop Buttons, `/wild`, Unown): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The bot sends what plan 4A let members ask for: a direct message when a raid, a boss, a gym or a spawn they want is reported, when a train is announced, when the egg they are signed up for gets its boss, and when a meeting time is set; each such message carries buttons that stop it. With it come the spawn report `/wild`, a picture for every Pokémon, and Unown as an ordinary species.

**Architecture:** Phase 4 (notifications and members) is three plans: 4A (done: what a member sets for themself), 4B (this one) and 4C (self-assigned roles). 4B adds a sender (`DmSender`: a queue on the main thread, pulled by a timer at a fixed rate, three priorities, measured), a batch question to the member directory ("who of these is in this server and can see this channel", over the gateway's request for members by user id, with a REST fallback), and `NotifyService`, which the party services call explicitly (`PartyNotifier`) with whoever acted. Matching is pure (`src/domain/notify/`); the service remembers per party what it told whom, so nobody is told the same thing twice. Production has no privileged intents and nothing here needs one.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely on MySQL, Vitest. No new dependencies. Two additive migrations (the tables `NewTrainNotification` and `UnownWantGift`). One new settings key (`gameData.iconsUrl`).

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: 6.4 (notifications and DMs), 4.2 (the rows `meet` and `spawn`), 3.1, the shutdown paragraph. Where the spec and this plan differ the plan is newer (Matt's decisions of 2026-10-12 and 13, listed below). The design brief is the git-ignored `.superpowers/sdd/phase-4b-design.md`; the rulings on the reviews are `review-rulings.md` and `review-rulings-2.md` in `.superpowers/sdd/2026-10-12-phase-4b-delivery/`; what the legacy bot did is in `.superpowers/sdd/phase-4-legacy-notes.txt`.

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with lint, format, typecheck and the tests clean after every task (3,273 unit tests at the end; the database suite, 207 tests, green on the tip). Two reviewers went through that branch, a third through the fixes and the three pieces added on Matt's word, a fourth through the second fixes (verdict: ready to plan from); what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the plan.

## Decisions made in this plan

1. **Mirror the legacy bot where nothing speaks against it** (Matt). Not copied: a DM to everybody at every change, "by whoever acted" on a boss change, spawn details that could ping.
2. **Sending** (Matt): one bot token, the main thread. `send` only puts a message in line; a timer starts at most one send every 100 ms (ten a second), at most five on their way; no retry on top of discord.js; a message past its time (`expiresAt`) is dropped; a line beyond 10,000 loses its least urgent, oldest message. When Discord refuses to open more DM channels (40003) the sender pauses a minute. The numbers of every burst are logged (sent, closed, failed, dropped, deepest line, delivery time, event-loop delay): they decide later whether a second token is needed; none is built.
3. **Three priorities** (Matt): meeting times and boss-set; then spawns; then raid wants, gym targets and new trains. Within one, the oldest event first.
4. **Who gets a DM.** A recipient must be in the server and able to view the channel of the event (a raid's or train's forum; for a spawn the region's text channel). Asked in batches of 100 through the gateway's request for members by user id (no privileged intent according to Discord's documentation; one request a second and thirty a minute at most; unverified until staging), with single REST look-ups as the fallback and a rest of the gateway that doubles from a minute to six hours while it fails. "Sees" is kept ten minutes, "does not" one. Messages to everybody signed up (meeting times) skip the question.
5. **What fires.** A report: the wants that fit the boss (`pokemonWantFits`), the tier (an egg only its tier; `tier 5` is ordinary tier 5, a shadow tier want is for shadow raids) and the gym's targets. A boss set or corrected: the wants that now fit, and for attendees with boss-set on every boss that differs from the last one they were told. Another gym: its targets, and in another region the wants again for who can now see it. A train: who has new-train on in that server. A spawn: wants with the scope spawn, and with the `iv` option the IV wants. An EX raid is a raid like any other. A raid taken back to an egg tells nobody.
6. **Never twice, never the actor, one DM per event.** Per party the service remembers which reasons it told which member (in memory; shared between the two parties of a move across regions; forgotten at the party's end and at a restart). A member gets one DM per event, which names the reasons that newly fired; whoever caused the event gets none, and their reasons count as told.
7. **Where notifications are switched off** (`settings.features.notifications`) only the meeting-time DM is sent.
8. **Meeting times** (Matt): to the others of the group who are not done (for a meetup or train: everybody signed up, for its start), no opt-out, in the legacy words, also when cancelled; a correction within seconds is one DM; a time the bot itself moved sends none.
9. **Stop buttons.** Each reason of a DM has a button (five at most) with the custom id `dm:<server>:stop:<what>`; pressing it removes that want or gym target in that server or switches the setting off, takes the button off the message and says so. Nothing about it is kept in memory. A want whose id would not fit 100 characters gets no button and the DM names `/unwant`.
10. **New-train is per server** (Matt): the table `NewTrainNotification`; the migration gives everybody with the legacy flag a row for every server; the legacy column is neither read nor written any more. Boss-set stays one setting.
11. **`/wild pokemon [details] [iv]`** (Matt: not `/spawn`): where a region is known; the report goes into the region's text channel and is deleted after 30 minutes (at a graceful shutdown: then); without Embed Links it goes out as text; megas cannot be reported; details are at most 200 characters and cannot ping.
12. **A picture for every Pokémon** (Matt): the bot downloads the list of the game's icon files with the game data (`settings.gameData.iconsUrl`) and picks for a catalogue entry the first candidate that exists; pictures are served by Leek Duck's CDN. The feed's picture of a current boss always wins (it shows the costume). Raid and train posts use the icon where the feed has none.
13. **Unown** (Matt) is an ordinary species; where the server has the sightings channel the report is also posted there and stays. No role is assigned or pinged and nothing is pinned. A member whose interaction shows the old `unown` role and who has no Unown want in that server is given a spawn want for it, once per member and server (table `UnownWantGift`).
14. **The client's caches**: no message is kept for a DM channel; the member cache holds 2,000 per server; DM channels and users stay.
15. **Not in this plan** (to the follow-ups file): a second token; `/admin member-settings`; the review of command names; everything about self-assigned roles (plan 4C).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files (Task 8 adds one key to `data/settings.json`, which is the new bot's). Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure (no `discord.js`, no services, no database). Repositories are the only code that knows column names; a write in several steps goes through `inTransaction`.
- Database changes are additive only: Tasks 2 and 10 have the plan's two migrations. `src/db/types.ts` is generated: its diffs here are what `npm run db:codegen` produces after those migrations; apply them as written.
- **Tests never use the network and never contact Discord.** Discord in tests is the fake interactions, `FakePartyGateway`, `FakeMemberDirectory` and the fake DM gateway of `test/support/dms.ts`. Database tests never use production rows.
- Text a member wrote is shown through `plain()`; a member is named by `memberText` / `memberName`, never by a bare mention in text that does not ping. Custom ids are built and parsed only through `src/discord/custom-id.ts`.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Each task names the commit of the prototype it transcribes (branch `proto/phase-4b` of this repository). `git diff <that commit> -- src test scripts data/settings.json` must print nothing before the task is committed; fix differences by hand, never by checking files out of that commit.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (lint, format check, typecheck, all unit tests; re-run lint after formatting). Check its exit status, not only the end of its output.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path. A commit title must not start with a slash.

## Review Focus

1. Sending must never hold the event loop or flood Discord, whatever the number of recipients: Task 4 (the sender's tests of the rate, the concurrency, the pause and thousands of jobs) and Task 5 (the test of thousands of candidates filtered in batches).
2. Nobody is told twice, nobody is told their own action, and no path of a change is missed: Tasks 5 and 7, `notify-service.test.ts`, `notify-service.parties.test.ts` and `src/commands/notify-paths.test.ts` (`/raid`, `/boss`, the hatch, `/location` within and across regions, `/train`, `/meet`).
3. A notification that fails must never break or delay the change it follows: Task 5, the tests with a notifier whose provider throws (the hatch line, the question, the post line and the answer of `/raid` still happen).
4. A stop button removes only the presser's own want, works after a restart, and survives crafted ids: Task 6, `src/components/dm.test.ts` and the custom-id tests (every catalogue entry, hostile args, two presses at once).
5. Nothing a member typed can ping or break a message, and no message exceeds Discord's limits: Tasks 5, 6 and 9, the tests of `notify-dm.ts` and `spawn.ts` (details, gym names, five buttons, the text fallback without Embed Links).

---

## File Structure

New files (everything else is modified in place; each task lists its files):

```
src/db/migrations/2026_10_12_006_new_train_notifications.ts  (create, task 2)
src/db/repositories/new-train-repository.db.test.ts  (create, task 2)
src/db/repositories/new-train-repository.ts  (create, task 2)
test/support/new-trains.ts  (create, task 2)
src/discord/member-viewers.test.ts  (create, task 3)
src/discord/member-viewers.ts  (create, task 3)
src/discord/dm-gateway.ts  (create, task 4)
src/services/dm-sender.test.ts  (create, task 4)
src/services/dm-sender.ts  (create, task 4)
test/support/dms.ts  (create, task 4)
src/commands/notify-paths.test.ts  (create, task 5)
src/domain/notify/reasons.test.ts  (create, task 5)
src/domain/notify/reasons.ts  (create, task 5)
src/render/notify-dm.test.ts  (create, task 5)
src/render/notify-dm.ts  (create, task 5)
src/services/notify-service.test.ts  (create, task 5)
src/services/notify-service.ts  (create, task 5)
src/components/dm.test.ts  (create, task 6)
src/components/dm.ts  (create, task 6)
src/services/notify-service.parties.test.ts  (create, task 7)
src/domain/pogo/pokemon-icons.test.ts  (create, task 8)
src/domain/pogo/pokemon-icons.ts  (create, task 8)
test/fixtures/pokemon-icons.json  (create, task 8)
src/commands/notifications/wild.test.ts  (create, task 9)
src/commands/notifications/wild.ts  (create, task 9)
src/render/spawn.ts  (create, task 9)
src/services/spawn-service.test.ts  (create, task 9)
src/services/spawn-service.ts  (create, task 9)
src/db/migrations/2026_10_12_007_unown_want_gifts.ts  (create, task 10)
src/db/repositories/unown-gift-repository.db.test.ts  (create, task 10)
src/db/repositories/unown-gift-repository.ts  (create, task 10)
src/services/unown-want-service.test.ts  (create, task 10)
src/services/unown-want-service.ts  (create, task 10)
test/support/unown-gifts.ts  (create, task 10)
```

---

### Task 1: The image cache retries a rename that Windows refuses

**Files:**
- Modify: `src/services/image-cache.test.ts`, `src/services/image-cache.ts`

**Interfaces:**
- Consumes: `ImageCache` (`src/services/image-cache.ts`) and its test.
- Produces: A `rename` of the temporary file that is tried again a few times after a short pause when it fails with EPERM, EBUSY or EACCES (a scanner still holding the file just written), with the rename injectable for the test.

Not part of delivery: a test of this file failed once under load while the prototype was checked, and this is its cause. It comes first so that the checks of the later tasks do not meet it.

Reference commit of the prototype for this task: `3637c78`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/services/image-cache.test.ts`:

```diff
--- a/src/services/image-cache.test.ts
+++ b/src/services/image-cache.test.ts
@@ -1,4 +1,4 @@
-import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
+import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
 import { tmpdir } from 'node:os';
 import path from 'node:path';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
@@ -219,6 +219,53 @@ describe('ImageCache.get', () => {
     expect(log.entries[0]).toMatchObject({ level: 40, msg: 'could not save a picture' });
   });
 
+  /** A rename that is refused with these codes, in turn, before it is really done. */
+  function refusing(codes: string[]) {
+    const attempts: string[] = [];
+    const log = createTestLogger();
+    const cache = new ImageCache({
+      dir,
+      fetch: () => Promise.resolve(response('saved')),
+      log: log.log,
+      renamePauseMs: 1,
+      rename: async (from, to) => {
+        const code = codes[attempts.length];
+        attempts.push(path.basename(to));
+        if (code !== undefined) throw Object.assign(new Error(`${code}: rename`), { code });
+        await rename(from, to);
+      },
+    });
+    return { cache, attempts, entries: log.entries };
+  }
+
+  it.each(['EPERM', 'EBUSY', 'EACCES'])(
+    'tries the rename again when Windows refuses it with %s',
+    async (code) => {
+      const { cache, attempts, entries } = refusing([code, code]);
+      const file = (await cache.get(request())) ?? '';
+      expect(await readFile(file, 'utf8')).toBe('saved');
+      expect(attempts).toHaveLength(3);
+      expect(entries).toEqual([]);
+      expect(await readdir(path.join(dir, 'gyms'))).toEqual([path.basename(file)]);
+    },
+  );
+
+  it('gives up on a rename that is refused every time, and leaves no temporary file', async () => {
+    const { cache, attempts, entries } = refusing(Array<string>(20).fill('EPERM'));
+    expect(await cache.get(request())).toBeUndefined();
+    expect(attempts).toHaveLength(5);
+    expect(entries).toHaveLength(1);
+    expect(entries[0]).toMatchObject({ level: 40, msg: 'could not save a picture' });
+    expect(await readdir(path.join(dir, 'gyms'))).toEqual([]);
+  });
+
+  it('does not try a rename again that fails for another reason', async () => {
+    const { cache, attempts, entries } = refusing(['ENOSPC']);
+    expect(await cache.get(request())).toBeUndefined();
+    expect(attempts).toHaveLength(1);
+    expect(entries).toHaveLength(1);
+  });
+
   it('keeps the variant out of the file name', async () => {
     const { cache } = cacheWith(() => Promise.resolve(response()));
     const file = await cache.get(request({ variant: '../../etc/passwd?key=abc' }));
```

Run: `npx vitest run --project unit src/services/image-cache.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/services/image-cache.ts`:

```diff
--- a/src/services/image-cache.ts
+++ b/src/services/image-cache.ts
@@ -23,6 +23,10 @@ export interface ImageCacheOptions {
   timeoutMs?: number;
   /** A larger download is refused. Default 5 MB. */
   maxBytes?: number;
+  /** Puts the finished download in its place. Default `rename` of `node:fs/promises`; for tests. */
+  rename?: (from: string, to: string) => Promise<void>;
+  /** The pause before a refused rename is tried again. Default 50 ms. */
+  renamePauseMs?: number;
 }
 
 export interface ImageRequest {
@@ -44,8 +48,23 @@ export interface ImageRequest {
 const FOLDER = /^[a-z0-9-]+$/;
 const ID = /^[A-Za-z0-9_-]+$/;
 
+/**
+ * What Windows answers a rename while another program has the file open: a virus scanner or the
+ * search index reads a file the moment it was written, and lets go of it a moment later.
+ */
+const HELD_BY_ANOTHER = new Set(['EPERM', 'EBUSY', 'EACCES']);
+/** How often a rename is tried in all. */
+const RENAME_ATTEMPTS = 5;
+
 let temporaryCounter = 0;
 
+const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
+
+function errorCode(err: unknown): string | undefined {
+  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
+  return typeof err.code === 'string' ? err.code : undefined;
+}
+
 /**
  * Downloads pictures once and keeps them on disk, so they can be attached to messages as files.
  * A picture that cannot be had is never an error for the caller: `get` answers undefined and the
@@ -132,7 +151,7 @@ export class ImageCache {
     try {
       await mkdir(path.dirname(file), { recursive: true });
       await writeFile(temporary, bytes);
-      await rename(temporary, file);
+      await this.moveIntoPlace(temporary, file);
     } catch (err) {
       await rm(temporary, { force: true }).catch(() => undefined);
       this.options.log.warn({ ...what, reason: failureReason(err) }, 'could not save a picture');
@@ -142,6 +161,24 @@ export class ImageCache {
     return file;
   }
 
+  /**
+   * The rename that makes a download the picture. Tried again a few times, after a short pause,
+   * when it is refused the way Windows refuses it while another program holds the file.
+   */
+  private async moveIntoPlace(temporary: string, file: string): Promise<void> {
+    const move = this.options.rename ?? rename;
+    const pauseMs = this.options.renamePauseMs ?? 50;
+    for (let attempt = 1; ; attempt += 1) {
+      try {
+        await move(temporary, file);
+        return;
+      } catch (err) {
+        if (attempt >= RENAME_ATTEMPTS || !HELD_BY_ANOTHER.has(errorCode(err) ?? '')) throw err;
+        await pause(pauseMs);
+      }
+    }
+  }
+
   private async download(request: ImageRequest, signal: AbortSignal): Promise<Buffer> {
     const response = await this.options.fetch(request.url, { signal });
     if (!response.ok) throw new Error(`the server answered ${response.status}`);
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/services/image-cache.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 3637c78 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/services/image-cache.test.ts src/services/image-cache.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/services/image-cache.test.ts src/services/image-cache.ts
git commit -m "The image cache retries a rename that Windows refuses" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 3,026 unit tests.

---

### Task 2: Reads by event: who wants these numbers, who targets this gym, who wants new trains

**Files:**
- Create: `src/db/migrations/2026_10_12_006_new_train_notifications.ts`, `src/db/repositories/new-train-repository.db.test.ts`, `src/db/repositories/new-train-repository.ts`, `test/support/new-trains.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/commands/settings/settings.test.ts`, `src/commands/settings/settings.ts`, `src/db/migrations/index.ts`, `src/db/migrator.db.test.ts`, `src/db/repositories/gym-notification-repository.db.test.ts`, `src/db/repositories/gym-notification-repository.ts`, `src/db/repositories/pokemon-notification-repository.db.test.ts`, `src/db/repositories/pokemon-notification-repository.ts`, `src/db/repositories/user-repository.db.test.ts`, `src/db/repositories/user-repository.ts`, `src/db/types.ts`, `src/domain/pogo/notification-target.test.ts`, `src/domain/pogo/notification-target.ts`, `src/domain/pogo/wants.test.ts`, `src/domain/pogo/wants.ts`, `test/support/gym-targets.ts`, `test/support/test-context.ts`, `test/support/wants.ts`

**Interfaces:**
- Consumes: Plan 4A's `PokemonNotificationRepository` / `MemoryWants` (`WantStorage`), `GymNotificationRepository` / `MemoryGymTargets` (`GymTargetStorage`), the codec of `notification-target.ts`, `readWants` and the form reader, `withMemberLocked`, `UserRepository`, `/settings` (`src/commands/settings/settings.ts`), the migrations of `src/db/migrations/`.
- Produces: `WantStorage.wanting(guildId, numbers)`: the members of a server with a want row for one of these stored numbers, each with their wants read through the codec (`MemberWants`, `wantsByMember`); `GymTargetStorage.targeting(guildId, gymId)` (`membersOfGymTarget`); `tierCode(tier)` and `ivCode(iv)` in the codec, which do not throw; the table `NewTrainNotification` (migration `2026_10_12_006_new_train_notifications`, which copies every user with the legacy `User.newTrain = 1` to a row per `Guild` row), `NewTrainRepository` behind `NewTrainStorage` (`ctx.newTrains`), `MemoryNewTrains` in `test/support/`; `/settings new-train` and `/settings show` per server; `UserSettings.newTrainNotification` is gone and the legacy column is neither read nor written.

`src/db/types.ts` is generated: apply its diff as written. The db tests of the two repositories and of the migrator change, and `new-train-repository.db.test.ts` is new.

Reference commit of the prototype for this task: `323afa0`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/settings/settings.test.ts`:

```diff
--- a/src/commands/settings/settings.test.ts
+++ b/src/commands/settings/settings.test.ts
@@ -1,6 +1,7 @@
 import { InteractionContextType, MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { FAKE_GUILD_ID, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
+import { MemoryNewTrains } from '../../../test/support/new-trains.js';
 import { ALICE } from '../../../test/support/parties.js';
 import { MemoryGymTargets } from '../../../test/support/gym-targets.js';
 import { createTestContext } from '../../../test/support/test-context.js';
@@ -16,7 +17,8 @@ function setup(features: { notifications?: boolean } = {}) {
   const users = new MemoryUsers();
   const wants = new MemoryWants();
   const targets = new MemoryGymTargets();
-  const { ctx } = createTestContext({ users, wants, gymTargets: targets });
+  const newTrains = new MemoryNewTrains();
+  const { ctx } = createTestContext({ users, wants, gymTargets: targets, newTrains });
   ctx.config.settings.features = { ...ctx.config.settings.features, ...features };
   const router = new InteractionRouter(ctx, [settings], []);
   const run = async (
@@ -37,7 +39,7 @@ function setup(features: { notifications?: boolean } = {}) {
   /** What the member was answered. */
   const answer = async (subcommand: string, options: Record<string, string | boolean> = {}) =>
     sent((await run(subcommand, options)).editReply).content;
-  return { users, wants, targets, run, answer };
+  return { users, wants, targets, newTrains, run, answer };
 }
 
 describe('/settings', () => {
@@ -79,7 +81,6 @@ describe('/settings', () => {
     ['mentions-shouts', 'mentionsShouts'],
     ['mentions-train-stops', 'mentionsTrainStops'],
     ['boss-set', 'bossSetNotification'],
-    ['new-train', 'newTrainNotification'],
   ] as const)('%s writes the setting the party code reads', async (subcommand, field) => {
     const made = setup();
     const off = await made.answer(subcommand, { enabled: false });
@@ -93,6 +94,45 @@ describe('/settings', () => {
     expect(await made.answer(subcommand, { enabled: true })).toBe(on);
   });
 
+  it('new-train is for the server it is used in, and for no other', async () => {
+    const made = setup();
+    const AWAY = '412345678901234568';
+    expect(await made.answer('new-train', { enabled: true })).toBe(
+      'You will get a DM when a train is announced in this server, in a region you can see.',
+    );
+    expect(await made.newTrains.wanted(ALICE, FAKE_GUILD_ID)).toBe(true);
+    expect(await made.newTrains.wanted(ALICE, AWAY)).toBe(false);
+    // Setting what is set already answers the same sentence.
+    expect(await made.answer('new-train', { enabled: true })).toMatch(/^You will get a DM/);
+    expect(await made.answer('show')).toContain(
+      '- DM for a new train in this server: **on** · `/settings new-train`',
+    );
+    const elsewhere = await made.run('show', {}, { guildId: AWAY });
+    expect(sent(elsewhere.editReply).content).toContain(
+      '- DM for a new train in this server: **off** · `/settings new-train`',
+    );
+    expect(await made.answer('new-train', { enabled: false })).toBe(
+      'You will no longer get a DM when a train is announced in this server.',
+    );
+    expect(await made.newTrains.wanted(ALICE, FAKE_GUILD_ID)).toBe(false);
+    // It is no setting of the member as a whole any more.
+    expect(DEFAULT_USER_SETTINGS).not.toHaveProperty('newTrainNotification');
+  });
+
+  it('new-train says in a DM with the bot to use it in a server, and sets nothing', async () => {
+    const made = setup();
+    const used = await made.run('new-train', { enabled: true }, { isDm: true });
+    expect(sent(used.editReply).content).toBe(
+      'Whether I tell you about new trains is set per server. Use `/settings new-train` in the ' +
+        'server you mean.',
+    );
+    expect(made.newTrains.rows).toEqual([]);
+    const shown = await made.run('show', {}, { isDm: true });
+    expect(sent(shown.editReply).content).toContain(
+      '- DM for a new train: set per server · `/settings new-train` in a server',
+    );
+  });
+
   it('says what each switch means now', async () => {
     const made = setup();
     expect(await made.answer('mentions-shouts', { enabled: true })).toBe(
@@ -203,7 +243,7 @@ describe('/settings show', () => {
         '- Pings for shouts: **on** · `/settings mentions-shouts`',
         '- Pings when a train moves: **on** · `/settings mentions-train-stops`',
         '- DM when an egg gets its boss: **off** · `/settings boss-set`',
-        '- DM for a new train: **off** · `/settings new-train`',
+        '- DM for a new train in this server: **off** · `/settings new-train`',
         '- Status when you report a raid: **Interested** · `/settings auto-status`',
         '- Raid reports: **Visible** · `/settings privacy`',
         '- Pokémon and raid tiers on your list in this server: **0** · `/wants`',
```

Apply to `src/db/migrator.db.test.ts`:

```diff
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -23,7 +23,13 @@ async function migrate(database: TestDatabase): Promise<void> {
 }
 
 /** The tables the new bot adds to a database it takes over. */
-const ADDED_TABLES = ['RaidBoss', 'RaidBossOverride', 'Party', 'PartyAccessGrant'];
+const ADDED_TABLES = [
+  'RaidBoss',
+  'RaidBossOverride',
+  'Party',
+  'PartyAccessGrant',
+  'NewTrainNotification',
+];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = [
   'Region.forumChannelId',
@@ -105,6 +111,7 @@ describe('runMigrations', () => {
       '2026_10_11_003_raid_boss_image',
       '2026_10_11_004_party_access_grants',
       '2026_10_12_005_pokemon_notification_form',
+      '2026_10_12_006_new_train_notifications',
     ]);
     expect(await describeSchema(database, ADDED_TABLES, ADDED_COLUMNS, ADDED_INDEXES)).toEqual(
       before,
```

Apply to `src/db/repositories/gym-notification-repository.db.test.ts`:

```diff
--- a/src/db/repositories/gym-notification-repository.db.test.ts
+++ b/src/db/repositories/gym-notification-repository.db.test.ts
@@ -152,6 +152,20 @@ describe('GymNotificationRepository', () => {
     expect(await stored()).toHaveLength(12);
   });
 
+  it('finds by event the members who target a gym in a server, each once', async () => {
+    await targets.add(ALICE, HOME, 4);
+    await targets.add(BOB, HOME, 4);
+    await targets.add(BOB, HOME, 41);
+    await targets.add(BOB, AWAY, 4);
+    await legacyRow(ALICE, 1, '4');
+    await legacyRow(ALICE, 1, 'four');
+    expect(await targets.targeting(HOME, 4)).toEqual([ALICE, BOB]);
+    expect(await targets.targeting(HOME, 41)).toEqual([BOB]);
+    expect(await targets.targeting(AWAY, 4)).toEqual([BOB]);
+    expect(await targets.targeting(HOME, 5)).toEqual([]);
+    expect(await targets.targeting('499999999999999999', 4)).toEqual([]);
+  });
+
   it('behaves as its twin in memory does', async () => {
     const memory = new MemoryGymTargets();
     // What the legacy bot may have left: a duplicate, and a row that is no gym id.
@@ -168,6 +182,11 @@ describe('GymNotificationRepository', () => {
       await storage.add(ALICE, HOME, 4),
       await storage.add(ALICE, AWAY, 9),
       await storage.add(BOB, HOME, 5),
+      await storage.add(BOB, HOME, 7),
+      await storage.targeting(HOME, 7),
+      await storage.targeting(HOME, 4),
+      await storage.targeting(AWAY, 9),
+      await storage.targeting(AWAY, 7),
       await storage.list(ALICE, HOME),
       await storage.count(ALICE, AWAY),
       await storage.remove(ALICE, HOME, 5),
```

Create `src/db/repositories/new-train-repository.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { startDatabase } from '../../../test/support/mysql.js';
import { MemoryNewTrains } from '../../../test/support/new-trains.js';
import { createDb } from '../kysely.js';
import { runMigrations } from '../migrator.js';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';
import { NewTrainRepository, type NewTrainStorage } from './new-train-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const CAROL = '312345678901234569';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const NOWHERE = '499999999999999999';
const NOW = 1_800_000_000_000;

describe('NewTrainRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let trains: NewTrainRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    trains = new NewTrainRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Guild').execute();
    await db.deleteFrom('User').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  const stored = () =>
    db
      .selectFrom('NewTrainNotification')
      .select(['guildId', 'memberId', 'createdAt'])
      .orderBy('guildId')
      .orderBy('memberId')
      .execute();

  it('is off for everybody until it is switched on, per member and server', async () => {
    expect(await trains.wanted(ALICE, HOME)).toBe(false);
    expect(await trains.set(ALICE, HOME, true, NOW)).toBe(true);
    expect(await trains.wanted(ALICE, HOME)).toBe(true);
    expect(await trains.wanted(ALICE, AWAY)).toBe(false);
    expect(await trains.wanted(BOB, HOME)).toBe(false);
    expect(await stored()).toEqual([{ guildId: 1, memberId: ALICE, createdAt: String(NOW) }]);
  });

  it('says whether a switch changed anything, and keeps the first row as it is', async () => {
    expect(await trains.set(ALICE, HOME, false, NOW)).toBe(false);
    expect(await trains.set(ALICE, HOME, true, NOW)).toBe(true);
    expect(await trains.set(ALICE, HOME, true, NOW + 5_000)).toBe(false);
    expect(await stored()).toEqual([{ guildId: 1, memberId: ALICE, createdAt: String(NOW) }]);
    expect(await trains.set(ALICE, HOME, false, NOW)).toBe(true);
    expect(await trains.set(ALICE, HOME, false, NOW)).toBe(false);
    expect(await stored()).toEqual([]);
  });

  it('gives who asked in a server, oldest first, and nobody of another server', async () => {
    expect(await trains.wanting(HOME)).toEqual([]);
    await trains.set(BOB, HOME, true, NOW);
    await trains.set(ALICE, HOME, true, NOW + 1);
    await trains.set(CAROL, AWAY, true, NOW + 2);
    await trains.set(ALICE, AWAY, true, NOW + 3);
    expect(await trains.wanting(HOME)).toEqual([BOB, ALICE]);
    expect(await trains.wanting(AWAY)).toEqual([CAROL, ALICE]);
    expect(await trains.wanting(NOWHERE)).toEqual([]);
    await trains.set(BOB, HOME, false, NOW);
    expect(await trains.wanting(HOME)).toEqual([ALICE]);
    // Switching off in one server leaves the other alone.
    expect(await trains.wanted(ALICE, AWAY)).toBe(true);
  });

  it('makes the row of a server that has none when a member switches it on there', async () => {
    expect(await trains.set(ALICE, NOWHERE, false, NOW)).toBe(false);
    expect(await new GuildRepository(db).idFor(NOWHERE)).toBeUndefined();
    expect(await trains.set(ALICE, NOWHERE, true, NOW)).toBe(true);
    expect(await new GuildRepository(db).idFor(NOWHERE)).toBeDefined();
    expect(await trains.wanting(NOWHERE)).toEqual([ALICE]);
  });

  it('makes one row when the same member switches it on many times at once', async () => {
    const changed = await Promise.all(
      Array.from({ length: 8 }, (_unused, n) => trains.set(ALICE, HOME, true, NOW + n)),
    );
    expect(changed.filter(Boolean)).toHaveLength(1);
    expect(await stored()).toHaveLength(1);
  });

  it('loses its rows with the server, and never touches the legacy column', async () => {
    await sql`insert into User (userSnowflake, newTrain) values (${ALICE}, 0)`.execute(db);
    await trains.set(ALICE, HOME, true, NOW);
    const flag = await db.selectFrom('User').select('newTrain').executeTakeFirstOrThrow();
    expect(flag.newTrain).toBe(0);
    await new GuildRepository(db).remove(HOME);
    expect(await stored()).toEqual([]);
  });

  it('behaves as its twin in memory does', async () => {
    const memory = new MemoryNewTrains();
    const script = async (storage: NewTrainStorage) => [
      await storage.wanted(ALICE, HOME),
      await storage.set(ALICE, HOME, false, NOW),
      await storage.set(ALICE, HOME, true, NOW),
      await storage.set(ALICE, HOME, true, NOW + 1),
      await storage.set(BOB, HOME, true, NOW - 1),
      await storage.set(BOB, AWAY, true, NOW),
      await storage.set(CAROL, HOME, true, NOW),
      await storage.wanted(ALICE, HOME),
      await storage.wanted(ALICE, AWAY),
      await storage.wanting(HOME),
      await storage.wanting(AWAY),
      await storage.wanting(NOWHERE),
      await storage.set(BOB, HOME, false, NOW),
      await storage.set(BOB, HOME, false, NOW),
      await storage.wanting(HOME),
    ];
    expect(await script(trains)).toEqual(await script(memory));
  });
});

describe('the migration to new-train notifications per server', () => {
  it('gives everybody with the legacy flag a row for every server, and leaves the flag', async () => {
    const database = await startDatabase({ legacySchema: true });
    const db = createDb<DB>(database.config);
    try {
      await database.query('insert into Guild (id, snowflake) values (1, ?), (2, ?)', [HOME, AWAY]);
      await database.query(
        'insert into User (userSnowflake, newTrain) values (?, 1), (?, 0), (?, 1), (null, 1)',
        [ALICE, BOB, CAROL],
      );
      const before = Date.now();
      await runMigrations(db, pino({ level: 'silent' }));
      const rows = await db
        .selectFrom('NewTrainNotification')
        .select(['guildId', 'memberId', 'createdAt'])
        .orderBy('guildId')
        .orderBy('memberId')
        .execute();
      expect(rows.map(({ guildId, memberId }) => ({ guildId, memberId }))).toEqual([
        { guildId: 1, memberId: ALICE },
        { guildId: 1, memberId: CAROL },
        { guildId: 2, memberId: ALICE },
        { guildId: 2, memberId: CAROL },
      ]);
      for (const row of rows) expect(Number(row.createdAt)).toBeGreaterThanOrEqual(before);
      const trains = new NewTrainRepository(db);
      expect((await trains.wanting(HOME)).sort()).toEqual([ALICE, CAROL]);
      // The legacy bot still reads its column: it is as it was.
      const flags = await database.query<{ newTrain: number }>(
        'select newTrain from User order by id',
      );
      expect(flags.map((row) => Number(row.newTrain))).toEqual([1, 0, 1, 1]);
      // Switching off in the new bot leaves it too.
      await trains.set(ALICE, HOME, false, Date.now());
      const after = await database.query<{ newTrain: number }>(
        'select newTrain from User where userSnowflake = ?',
        [ALICE],
      );
      expect(Number(after[0]?.newTrain)).toBe(1);
    } finally {
      await db.destroy();
      await database.stop();
    }
  });
});
```

Apply to `src/db/repositories/pokemon-notification-repository.db.test.ts`:

```diff
--- a/src/db/repositories/pokemon-notification-repository.db.test.ts
+++ b/src/db/repositories/pokemon-notification-repository.db.test.ts
@@ -518,6 +518,53 @@ describe('PokemonNotificationRepository', () => {
     ]);
   });
 
+  it('finds by event the members with a row of these numbers in this server, with what the rows mean', async () => {
+    await wants.set(ALICE, HOME, species(487), 'both');
+    await wants.set(ALICE, HOME, tier('T5'), 'raid');
+    await wants.set(ALICE, HOME, species(1), 'both');
+    await wants.set(BOB, HOME, ORIGIN, 'raid');
+    await wants.set(BOB, HOME, SHADOW_GIRATINA, 'raid');
+    await wants.set(BOB, AWAY, tier('T5'), 'raid');
+    expect(await wants.wanting(HOME, [487, -5])).toEqual([
+      {
+        memberId: ALICE,
+        wants: [
+          { target: species(487), scope: 'both' },
+          { target: tier('T5'), scope: 'raid' },
+        ],
+      },
+      {
+        memberId: BOB,
+        wants: [
+          { target: ORIGIN, scope: 'raid' },
+          { target: SHADOW_GIRATINA, scope: 'raid' },
+        ],
+      },
+    ]);
+    expect(await wants.wanting(AWAY, [487, -5])).toEqual([
+      { memberId: BOB, wants: [{ target: tier('T5'), scope: 'raid' }] },
+    ]);
+    expect(await wants.wanting(HOME, [])).toEqual([]);
+    expect(await wants.wanting(HOME, [25])).toEqual([]);
+    expect(await wants.wanting('499999999999999999', [487])).toEqual([]);
+  });
+
+  it('reads the rows an event finds through the codec: -6 is a tier or the perfect IVs of 2019', async () => {
+    await legacyRow(ALICE, 1, -6, 'both');
+    await legacyRow(ALICE, 1, -8, 'both');
+    await legacyRow(BOB, 1, -6, 'Raid');
+    // Rows nobody can read, and a row without a member.
+    await legacyRow(BOB, 1, -7, 'spawn');
+    await db
+      .insertInto('PokemonNotification')
+      .values({ guildId: 1, pokemon: -6, type: 'raid' })
+      .execute();
+    expect(await wants.wanting(HOME, [-6, -7])).toEqual([
+      { memberId: ALICE, wants: [{ target: PERFECT, scope: 'spawn' }] },
+      { memberId: BOB, wants: [{ target: tier('MegaLegendary'), scope: 'raid' }] },
+    ]);
+  });
+
   it('behaves as its twin in memory does', async () => {
     const memory = new MemoryWants();
     // What the legacy bot may have left: a duplicate, and a row that cannot be read.
@@ -558,6 +605,9 @@ describe('PokemonNotificationRepository', () => {
       await storage.set(BOB, HOME, pokemonTarget(6, 'charizard_mega_y'), 'both'),
       await storage.set(ALICE, HOME, pokemonTarget(487, 'giratina_altered'), 'both'),
       await storage.list(ALICE, HOME),
+      await storage.wanting(HOME, [487, 150, -5, -6, 2, -7]),
+      await storage.wanting(AWAY, [1, 487]),
+      await storage.wanting(HOME, []),
       await storage.remove(ALICE, HOME, species(2)),
       await storage.remove(ALICE, HOME, tier('T5')),
       await storage.remove(ALICE, HOME, pokemonTarget(487, 'giratina_sky')),
```

Apply to `src/db/repositories/user-repository.db.test.ts`:

```diff
--- a/src/db/repositories/user-repository.db.test.ts
+++ b/src/db/repositories/user-repository.db.test.ts
@@ -51,7 +51,6 @@ describe('UserRepository', () => {
       mentionsShouts: false,
       mentionsTrainStops: false,
       bossSetNotification: true,
-      newTrainNotification: true,
       autoStatus: PartyStatus.Coming,
       raidPrivacy: RaidPrivacy.Anonymous,
       nickname: 'AliceGo',
@@ -65,7 +64,6 @@ describe('UserRepository', () => {
       mentionsShouts: false,
       mentionsTrainStops: false,
       bossSetNotification: true,
-      newTrainNotification: true,
       autoStatus: PartyStatus.Coming,
       raidPrivacy: RaidPrivacy.Anonymous,
       nickname: 'AliceGo',
```

Apply to `src/domain/pogo/notification-target.test.ts`:

```diff
--- a/src/domain/pogo/notification-target.test.ts
+++ b/src/domain/pogo/notification-target.test.ts
@@ -1,6 +1,9 @@
 import { describe, expect, it } from 'vitest';
 import {
   decodeNotification,
+  ivCode,
+  notificationTiers,
+  tierCode,
   encodeNotification,
   isPokedexNumber,
   MAX_POKEDEX_NUMBER,
@@ -388,3 +391,28 @@ describe('notification codec: one form, and shadow raids', () => {
     ).toBe(true);
   });
 });
+
+describe('tierCode and ivCode', () => {
+  it('give the number the codec stores, for every tier that can be wanted', () => {
+    for (const tier of notificationTiers()) {
+      expect(tierCode(tier)).toBe(encodeNotification({ kind: 'tier', tier }, 'raid').pokemon);
+    }
+    expect(tierCode({ level: 'T5', shadow: false })).toBe(-5);
+    expect(tierCode({ level: 'T5', shadow: true })).toBe(-35);
+    expect(tierCode({ level: 'MegaLegendary', shadow: false })).toBe(-6);
+    expect(tierCode({ level: 'EX', shadow: false })).toBe(-21);
+  });
+
+  it('has no number, and does not throw, for a tier the codec has none for', () => {
+    expect(tierCode({ level: 'Mega', shadow: true })).toBeUndefined();
+    expect(tierCode({ level: 'EX', shadow: true })).toBeUndefined();
+  });
+
+  it('gives the numbers of the IV targets', () => {
+    expect(ivCode('perfect')).toBe(-6);
+    expect(ivCode('zero')).toBe(-8);
+    expect(ivCode('perfect')).toBe(
+      encodeNotification({ kind: 'iv', iv: 'perfect' }, 'both').pokemon,
+    );
+  });
+});
```

Apply to `src/domain/pogo/wants.test.ts`:

```diff
--- a/src/domain/pogo/wants.test.ts
+++ b/src/domain/pogo/wants.test.ts
@@ -32,6 +32,7 @@ import {
   wantSpeciesFinder,
   wantWord,
   wantWordGuesses,
+  wantsByMember,
 } from './wants.js';
 
 const tier = (level: RaidLevel, shadow = false): NotificationTarget => ({
@@ -1244,3 +1245,85 @@ describe('wants for one form and for shadow raids, as rows', () => {
     expect(rowsOfWant(rows, shadowOf(487, 'giratina_origin'))).toEqual([]);
   });
 });
+
+describe('wantsByMember', () => {
+  const ALICE = '312345678901234567';
+  const BOB = '312345678901234568';
+  const CAROL = '312345678901234569';
+  const reader = formReader(() => catalogueFixture());
+
+  it('reads the rows of each member as their wants, in the order of the first rows', () => {
+    const found = wantsByMember(
+      [
+        { memberId: BOB, pokemon: -5, type: 'raid' },
+        { memberId: ALICE, pokemon: 487, type: 'Both' },
+        { memberId: BOB, pokemon: 487, type: 'raid', form: 'giratina_origin' },
+        { memberId: ALICE, pokemon: 487, type: 'raid', shadow: true },
+      ],
+      reader,
+    );
+    expect(found).toEqual([
+      {
+        memberId: BOB,
+        wants: [
+          { target: tier('T5'), scope: 'raid' },
+          { target: form(487, 'giratina_origin'), scope: 'raid' },
+        ],
+      },
+      {
+        memberId: ALICE,
+        wants: [
+          { target: species(487), scope: 'both' },
+          { target: shadowOf(487), scope: 'raid' },
+        ],
+      },
+    ]);
+  });
+
+  it('reads a row found by -6 as what it means, not as a tier because of its number', () => {
+    const found = wantsByMember([
+      { memberId: ALICE, pokemon: -6, type: 'both' },
+      { memberId: BOB, pokemon: -6, type: 'raid' },
+      { memberId: CAROL, pokemon: -6, type: 'spawn' },
+    ]);
+    expect(found).toEqual([
+      { memberId: ALICE, wants: [{ target: PERFECT, scope: 'spawn' }] },
+      { memberId: BOB, wants: [{ target: tier('MegaLegendary'), scope: 'raid' }] },
+      { memberId: CAROL, wants: [{ target: PERFECT, scope: 'spawn' }] },
+    ]);
+  });
+
+  it('makes one want of duplicate rows, reads an older key as the entry of today, a mega as raids', () => {
+    const found = wantsByMember(
+      [
+        { memberId: ALICE, pokemon: 150, type: 'raid' },
+        { memberId: ALICE, pokemon: 150, type: 'spawn' },
+        { memberId: ALICE, pokemon: 487, type: 'both', form: 'giratina' },
+        { memberId: ALICE, pokemon: 6, type: 'both', form: 'charizard_mega_y' },
+      ],
+      reader,
+    );
+    expect(found).toEqual([
+      {
+        memberId: ALICE,
+        wants: [
+          { target: species(150), scope: 'both' },
+          { target: form(487, 'giratina_altered'), scope: 'both' },
+          { target: form(6, 'charizard_mega_y'), scope: 'raid' },
+        ],
+      },
+    ]);
+  });
+
+  it('leaves out a member none of whose rows can be read, and is empty for no rows', () => {
+    expect(
+      wantsByMember([
+        { memberId: ALICE, pokemon: -7, type: 'spawn' },
+        { memberId: BOB, pokemon: 150, type: 'nonsense' },
+        { memberId: CAROL, pokemon: 1, type: 'raid' },
+        { memberId: CAROL, pokemon: 0, type: 'raid' },
+      ]),
+    ).toEqual([{ memberId: CAROL, wants: [{ target: species(1), scope: 'raid' }] }]);
+    expect(wantsByMember([])).toEqual([]);
+  });
+});
```

Apply to `test/support/gym-targets.ts`:

```diff
--- a/test/support/gym-targets.ts
+++ b/test/support/gym-targets.ts
@@ -1,4 +1,5 @@
 import {
+  membersOfGymTarget,
   readGymTargets,
   rowsOfGymTarget,
   type GymTargetList,
@@ -61,6 +62,16 @@ export class MemoryGymTargets implements GymTargetStorage {
     });
   }
 
+  targeting(guildId: string, gymId: number): Promise<string[]> {
+    return this.attempt(() =>
+      membersOfGymTarget(
+        // As the repository's query finds them: by the id spelled as this bot writes it.
+        this.rows.filter((row) => row.guildId === guildId && row.gym === String(gymId)),
+        gymId,
+      ),
+    );
+  }
+
   add(memberId: string, guildId: string, gymId: number): Promise<'added' | 'exists'> {
     return this.attempt(() => {
       const [kept, ...duplicates] = rowsOfGymTarget(this.of(memberId, guildId), gymId);
```

Create `test/support/new-trains.ts`:

```ts
import type { NewTrainStorage } from '../../src/db/repositories/new-train-repository.js';

/**
 * Who asked to be told of new trains, kept in memory as `NewTrainRepository` keeps it, whose
 * behaviour new-train-repository.db.test.ts pins down. Set `failing` to make every call reject.
 */
export class MemoryNewTrains implements NewTrainStorage {
  failing: Error | undefined;
  readonly rows: { memberId: string; guildId: string; createdAt: number }[] = [];

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  private index(memberId: string, guildId: string): number {
    return this.rows.findIndex((row) => row.memberId === memberId && row.guildId === guildId);
  }

  wanted(memberId: string, guildId: string): Promise<boolean> {
    return this.attempt(() => this.index(memberId, guildId) >= 0);
  }

  set(memberId: string, guildId: string, on: boolean, now: number): Promise<boolean> {
    return this.attempt(() => {
      const at = this.index(memberId, guildId);
      if (on === at >= 0) return false;
      if (on) this.rows.push({ memberId, guildId, createdAt: now });
      else this.rows.splice(at, 1);
      return true;
    });
  }

  wanting(guildId: string): Promise<string[]> {
    return this.attempt(() =>
      this.rows
        .filter((row) => row.guildId === guildId)
        .sort((a, b) => a.createdAt - b.createdAt || (a.memberId < b.memberId ? -1 : 1))
        .map((row) => row.memberId),
    );
  }
}
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -12,6 +12,7 @@ import type { TrainService } from '../../src/services/train-service.js';
 import { FAKE_GUILD_ID } from './fake-interactions.js';
 import { catalogueFixture } from './game-data.js';
 import { FakeMemberDirectory } from './members.js';
+import { MemoryNewTrains } from './new-trains.js';
 import { noParties } from './parties.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
@@ -60,6 +61,7 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     // Nobody wants or targets anything; a test passes its own stores to fill and read them.
     wants: new MemoryWants(),
     gymTargets: new MemoryGymTargets(),
+    newTrains: new MemoryNewTrains(),
     // Nobody is a member of any server; a test passes its own directory with members.
     members: new FakeMemberDirectory(),
     partyService: unavailable<PartyService>(
```

Apply to `test/support/wants.ts`:

```diff
--- a/test/support/wants.ts
+++ b/test/support/wants.ts
@@ -10,7 +10,9 @@ import {
   readWants,
   rowsOfWant,
   formReader,
+  wantsByMember,
   type FormReader,
+  type MemberWants,
   type SetWantOutcome,
   type WantList,
   type WantRow,
@@ -91,6 +93,15 @@ export class MemoryWants implements WantStorage {
     });
   }
 
+  wanting(guildId: string, numbers: readonly number[]): Promise<MemberWants[]> {
+    return this.attempt(() =>
+      wantsByMember(
+        this.rows.filter((row) => row.guildId === guildId && numbers.includes(row.pokemon)),
+        this.forms,
+      ),
+    );
+  }
+
   set(
     memberId: string,
     guildId: string,
```

Run: `npx vitest run --project unit src/commands/settings/settings.test.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/wants.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -1,6 +1,7 @@
 import type { Kysely } from 'kysely';
 import type { Config } from './config/index.js';
 import type { GymTargetStorage } from './db/repositories/gym-notification-repository.js';
+import type { NewTrainStorage } from './db/repositories/new-train-repository.js';
 import type { WantStorage } from './db/repositories/pokemon-notification-repository.js';
 import type { UserSettingsStore } from './db/repositories/user-repository.js';
 import type { DB } from './db/types.js';
@@ -61,6 +62,8 @@ export interface AppContext {
   readonly wants: WantStorage;
   /** The gyms members want to be notified about, per server. */
   readonly gymTargets: GymTargetStorage;
+  /** Who asked to be told of new trains, per server. */
+  readonly newTrains: NewTrainStorage;
   /** Members of a server other than the one who is acting, looked up one at a time. */
   readonly members: MemberDirectory;
   /** Pokémon by what members type: names, nicknames, forms. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -9,6 +9,7 @@ import { runMigrations } from './db/migrator.js';
 import { AccessGrantRepository } from './db/repositories/access-grant-repository.js';
 import { GuildRepository } from './db/repositories/guild-repository.js';
 import { GymNotificationRepository } from './db/repositories/gym-notification-repository.js';
+import { NewTrainRepository } from './db/repositories/new-train-repository.js';
 import { GymRepository } from './db/repositories/gym-repository.js';
 import { PartyRepository } from './db/repositories/party-repository.js';
 import { PokemonNotificationRepository } from './db/repositories/pokemon-notification-repository.js';
@@ -241,6 +242,7 @@ export async function startApp(
       formReader(() => gameData.catalogue),
     ),
     gymTargets: new GymNotificationRepository(db),
+    newTrains: new NewTrainRepository(db),
     members,
     pokemon,
     maps,
```

Apply to `src/commands/settings/settings.ts`:

```diff
--- a/src/commands/settings/settings.ts
+++ b/src/commands/settings/settings.ts
@@ -13,12 +13,7 @@ import { plain, truncate } from '../../render/text.js';
 
 /** The settings that are switched on or off, as `UserSettings` names them. */
 type Flag =
-  | 'mentions'
-  | 'mentionsGroups'
-  | 'mentionsShouts'
-  | 'mentionsTrainStops'
-  | 'bossSetNotification'
-  | 'newTrainNotification';
+  'mentions' | 'mentionsGroups' | 'mentionsShouts' | 'mentionsTrainStops' | 'bossSetNotification';
 
 interface FlagSetting {
   /** The subcommand: `/settings <name> enabled:<True|False>`. */
@@ -101,19 +96,23 @@ const FLAGS: readonly FlagSetting[] = [
     underMentions: false,
     dm: true,
   },
-  {
-    name: 'new-train',
-    flag: 'newTrainNotification',
-    description: 'Whether I send you a DM when a train is announced',
-    label: 'DM for a new train',
-    on: 'You will get a DM when a train is announced in a region you can see.',
-    off: 'You will no longer get a DM when a train is announced.',
-    details: 'A direct message when somebody announces a raid train in a region you can see.',
-    underMentions: false,
-    dm: true,
-  },
 ];
 
+/**
+ * "Tell me of new trains" is no setting of the member as a whole: it is per server, like the
+ * wants (Matt, 2026-10-12), kept by `ctx.newTrains`.
+ */
+const NEW_TRAIN = {
+  name: 'new-train',
+  label: 'DM for a new train in this server',
+  on: 'You will get a DM when a train is announced in this server, in a region you can see.',
+  off: 'You will no longer get a DM when a train is announced in this server.',
+  /** Said in a DM with the bot, where there is no server to set it for. */
+  inDm:
+    'Whether I tell you about new trains is set per server. Use `/settings new-train` in the ' +
+    'server you mean.',
+} as const;
+
 /** As much of a text a member registered as the overview shows: a legacy value may be long. */
 const SHOWN_VALUE = 60;
 
@@ -173,8 +172,12 @@ function autoStatusName(status: PartyStatus): string {
   return AUTO_STATUS.find((choice) => choice.status === status)?.name ?? 'None';
 }
 
-/** Everything a member has set, each line with the command that changes it. */
-export function settingsLines(settings: UserSettings): string[] {
+/**
+ * Everything a member has set, each line with the command that changes it. `newTrain` is
+ * whether they are told of new trains in the server the command was used in; undefined in a
+ * DM, where the line says that it is set per server.
+ */
+export function settingsLines(settings: UserSettings, newTrain?: boolean): string[] {
   const onOff = (value: boolean): string => (value ? 'on' : 'off');
   const lines = FLAGS.map((setting) => {
     const quiet = setting.underMentions && settings[setting.flag] && !settings.mentions;
@@ -184,6 +187,9 @@ export function settingsLines(settings: UserSettings): string[] {
     );
   });
   lines.push(
+    newTrain === undefined
+      ? `DM for a new train: set per server · \`/settings ${NEW_TRAIN.name}\` in a server`
+      : `${NEW_TRAIN.label}: **${onOff(newTrain)}** · \`/settings ${NEW_TRAIN.name}\``,
     `Status when you report a raid: **${autoStatusName(settings.autoStatus)}** · \`/settings auto-status\``,
     `Raid reports: **${settings.raidPrivacy === RaidPrivacy.Anonymous ? 'Anonymous' : 'Visible'}** · \`/settings privacy\``,
   );
@@ -231,14 +237,17 @@ const show: SubcommandPart = {
     details:
       'Lists your settings for pings and direct messages, the status you get when you report ' +
       'a raid, whether your reports name you, and your friend code and in-game name when ' +
-      'you registered them. In a server it also says how many Pokémon, raid tiers and ' +
-      'gyms you are notified about there.',
+      'you registered them. In a server it also says whether you are told of new trains ' +
+      'there, and how many Pokémon, raid tiers and gyms you are notified about there.',
     examples: ['/settings show'],
   },
   defer: 'ephemeral',
   async execute(interaction, ctx) {
     const settings = await ctx.users.get(interaction.user.id);
-    const lines = [...settingsLines(settings), ...(await listLines(interaction, ctx))];
+    const { guildId } = interaction;
+    const newTrain =
+      guildId === null ? undefined : await ctx.newTrains.wanted(interaction.user.id, guildId);
+    const lines = [...settingsLines(settings, newTrain), ...(await listLines(interaction, ctx))];
     await interaction.editReply({
       content: `**Your settings**\n${lines.map((line) => `- ${line}`).join('\n')}`,
     });
@@ -281,6 +290,38 @@ function flagPart(setting: FlagSetting): SubcommandPart {
   };
 }
 
+const newTrain: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName(NEW_TRAIN.name)
+    .setDescription('Whether I send you a DM when a train is announced in this server')
+    .addBooleanOption((option) =>
+      option.setName('enabled').setDescription('True switches it on').setRequired(true),
+    ),
+  help: {
+    details:
+      'A direct message when somebody announces a raid train in this server, in a region you ' +
+      'can see. It is set per server: use it in the server you mean, not in a DM with me.',
+    examples: [
+      `/settings ${NEW_TRAIN.name} enabled:True`,
+      `/settings ${NEW_TRAIN.name} enabled:False`,
+    ],
+  },
+  defer: 'ephemeral',
+  throttle: MEMBER_WRITE_THROTTLE,
+  async execute(interaction, ctx) {
+    const enabled = interaction.options.getBoolean('enabled', true);
+    const { guildId } = interaction;
+    if (guildId === null) {
+      await interaction.editReply({ content: NEW_TRAIN.inDm });
+      return;
+    }
+    await ctx.newTrains.set(interaction.user.id, guildId, enabled, Date.now());
+    let content: string = enabled ? NEW_TRAIN.on : NEW_TRAIN.off;
+    if (enabled && !ctx.config.settings.features.notifications) content += NOTIFICATIONS_OFF;
+    await interaction.editReply({ content });
+  },
+};
+
 const autoStatus: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('auto-status')
@@ -354,5 +395,5 @@ export const settings = commandGroup({
       '`/settings show` lists it all. Nobody else sees your answers.',
     examples: ['/settings show', '/settings mentions enabled:False'],
   },
-  parts: [show, ...FLAGS.map(flagPart), autoStatus, privacy],
+  parts: [show, ...FLAGS.map(flagPart), newTrain, autoStatus, privacy],
 });
```

Create `src/db/migrations/2026_10_12_006_new_train_notifications.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * "Tell me of new trains" per server (plan 4B; Matt, 2026-10-12).
 *
 * The legacy bot kept this as one flag of a member, `User.newTrain`, and told a member of the
 * trains of every server they were in. The new bot keeps it per member and server, like the
 * wants: `NewTrainNotification` holds one row for each server a member asked for. `guildId` is
 * the row of the server (`Guild.id`), so the rows of a server the bot left go with it; the
 * member is a snowflake, `varchar(30)` as in `Party`.
 *
 * Everybody who has the legacy flag on gets a row for every server the bot knows: that is what
 * the flag meant (every server; whether a member is in one is found out when a train is made).
 * The legacy column stays as it is, for the legacy bot; the new bot neither reads nor writes
 * it from here on.
 *
 * Safe to run again after a failure half-way: the table is created only when it is missing,
 * and a row that exists is left as it is.
 */
export const newTrainNotifications: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists NewTrainNotification (
        guildId int unsigned not null,
        memberId varchar(30) not null,
        createdAt bigint not null,
        primary key (guildId, memberId),
        constraint newtrainnotification_guildid_foreign foreign key (guildId)
          references Guild (id) on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      insert into NewTrainNotification (guildId, memberId, createdAt)
      select g.id, u.userSnowflake, ${String(Date.now())}
      from User u cross join Guild g
      where u.newTrain = 1 and u.userSnowflake is not null
      on duplicate key update memberId = NewTrainNotification.memberId`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
```

Apply to `src/db/migrations/index.ts`:

```diff
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -5,6 +5,7 @@ import { parties } from './2026_10_11_002_parties.js';
 import { raidBossImage } from './2026_10_11_003_raid_boss_image.js';
 import { partyAccessGrants } from './2026_10_11_004_party_access_grants.js';
 import { pokemonNotificationForm } from './2026_10_12_005_pokemon_notification_form.js';
+import { newTrainNotifications } from './2026_10_12_006_new_train_notifications.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -17,4 +18,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_11_003_raid_boss_image': raidBossImage,
   '2026_10_11_004_party_access_grants': partyAccessGrants,
   '2026_10_12_005_pokemon_notification_form': pokemonNotificationForm,
+  '2026_10_12_006_new_train_notifications': newTrainNotifications,
 };
```

Apply to `src/db/repositories/gym-notification-repository.ts`:

```diff
--- a/src/db/repositories/gym-notification-repository.ts
+++ b/src/db/repositories/gym-notification-repository.ts
@@ -31,6 +31,11 @@ export interface GymTargetStorage {
    * read, which `removeAll` would remove with them.
    */
   count(memberId: string, guildId: string): Promise<number>;
+  /**
+   * The read by event: the snowflakes of the members who target this gym in this server, each
+   * once, in the order of their rows.
+   */
+  targeting(guildId: string, gymId: number): Promise<string[]>;
 }
 
 /** A row of `GymNotification` as far as targets need it. */
@@ -60,6 +65,18 @@ export function readGymTargets(rows: readonly GymTargetRow[]): GymTargetList {
   return { gymIds, unreadable };
 }
 
+/** The members of rows that are a target for this gym, each once, in the order of the rows. */
+export function membersOfGymTarget(
+  rows: ReadonlyArray<{ memberId: string | null; gym: string | null }>,
+  gymId: number,
+): string[] {
+  const members = new Set<string>();
+  for (const row of rows) {
+    if (row.memberId !== null && targetGymId(row.gym) === gymId) members.add(row.memberId);
+  }
+  return [...members];
+}
+
 /** The rows that make a gym a target, oldest first. */
 export function rowsOfGymTarget(rows: readonly GymTargetRow[], gymId: number): number[] {
   return rows
@@ -100,6 +117,25 @@ export class GymNotificationRepository implements GymTargetStorage {
     return gymIds.length + unreadable;
   }
 
+  /**
+   * One query over the index `(gym, guildId)`. The column is text and is compared with the id
+   * as text, as the legacy bot and this one write it: against a number MySQL would compare
+   * every row as a double and use no index. A row that spells the id another way (padded)
+   * is a target in the member's own list all the same, and is not found here.
+   */
+  async targeting(guildId: string, gymId: number): Promise<string[]> {
+    const rows = await this.db
+      .selectFrom('GymNotification as n')
+      .innerJoin('Guild as g', 'g.id', 'n.guildId')
+      .innerJoin('User as u', 'u.id', 'n.userId')
+      .select(['u.userSnowflake as memberId', 'n.gym'])
+      .where('g.snowflake', '=', guildId)
+      .where('n.gym', '=', String(gymId))
+      .orderBy('n.id')
+      .execute();
+    return membersOfGymTarget(rows, gymId);
+  }
+
   async add(memberId: string, guildId: string, gymId: number): Promise<'added' | 'exists'> {
     return withMemberLocked(this.db, memberId, guildId, true, async (trx, member) => {
       if (!member) throw new Error(`No rows for member ${memberId} in server ${guildId}`);
```

Create `src/db/repositories/new-train-repository.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { DB } from '../types.js';

/**
 * Who asked to be told of new trains, per member and server (`ctx.newTrains`); lets tests keep
 * it in memory. A member and a server are named by their snowflakes.
 */
export interface NewTrainStorage {
  /** Whether the member asked to be told of new trains in this server. */
  wanted(memberId: string, guildId: string): Promise<boolean>;
  /**
   * Switches it on or off for the member in this server; true when that changed anything
   * (false when it was so already). `now` is when, for a row that is made.
   */
  set(memberId: string, guildId: string, on: boolean, now: number): Promise<boolean>;
  /**
   * The read by event: the snowflakes of the members who asked to be told of new trains in
   * this server, oldest first.
   */
  wanting(guildId: string): Promise<string[]>;
}

/**
 * The `NewTrainNotification` table: a row per member and server that is on, none for off. The
 * primary key is the server's row and the member, so `wanting` reads one server's rows from
 * the key, and two switches at once make one row. The legacy column `User.newTrain` is not
 * touched: the migration that made this table copied it once.
 */
export class NewTrainRepository implements NewTrainStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async wanted(memberId: string, guildId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('NewTrainNotification as n')
      .innerJoin('Guild as g', 'g.id', 'n.guildId')
      .select('n.memberId')
      .where('g.snowflake', '=', guildId)
      .where('n.memberId', '=', memberId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async set(memberId: string, guildId: string, on: boolean, now: number): Promise<boolean> {
    if (!on) {
      const gone = await sql`
        delete n from NewTrainNotification n
        inner join Guild g on g.id = n.guildId
        where g.snowflake = ${guildId} and n.memberId = ${memberId}`.execute(this.db);
      return Number(gone.numAffectedRows ?? 0) > 0;
    }
    // The bot records a server when it joins it; this is for a row that went missing. Looked
    // for first: an insert that finds the row uses up an id all the same.
    const guild = await this.db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', guildId)
      .executeTakeFirst();
    if (!guild) {
      await this.db
        .insertInto('Guild')
        .values({ snowflake: guildId })
        .onDuplicateKeyUpdate({ snowflake: guildId })
        .execute();
    }
    // The server by its row, in the one statement. On already: the row stays as it is and no
    // row counts as changed (`insert ignore`; with `on duplicate key update` the driver, which
    // asks for found rows, counts the row that was there).
    const made = await sql`
      insert ignore into NewTrainNotification (guildId, memberId, createdAt)
      select id, ${memberId}, ${String(now)} from Guild where snowflake = ${guildId}`.execute(
      this.db,
    );
    return Number(made.numAffectedRows ?? 0) > 0;
  }

  async wanting(guildId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('NewTrainNotification as n')
      .innerJoin('Guild as g', 'g.id', 'n.guildId')
      .select('n.memberId')
      .where('g.snowflake', '=', guildId)
      .orderBy('n.createdAt')
      .orderBy('n.memberId')
      .execute();
    return rows.map((row) => row.memberId);
  }
}
```

Apply to `src/db/repositories/pokemon-notification-repository.ts`:

```diff
--- a/src/db/repositories/pokemon-notification-repository.ts
+++ b/src/db/repositories/pokemon-notification-repository.ts
@@ -8,7 +8,9 @@ import {
   planSetWant,
   readWants,
   rowsOfWant,
+  wantsByMember,
   type FormReader,
+  type MemberWants,
   type SetWantOutcome,
   type WantList,
   type WantRow,
@@ -46,6 +48,14 @@ export interface WantStorage {
    * read, which `removeAll` would remove with them.
    */
   count(memberId: string, guildId: string): Promise<number>;
+  /**
+   * The read by event: the members who have, in this server, a row with one of these numbers
+   * (`PokemonNotification.pokemon`: a Pokédex number, the code of a tier or of an IV target),
+   * each with the wants those rows mean. A number says who may want what happened, never that
+   * they do: ask the matcher about each want. Rows that cannot be read are left out, and so is
+   * a row without a member. No numbers ask nothing.
+   */
+  wanting(guildId: string, numbers: readonly number[]): Promise<MemberWants[]>;
 }
 
 /**
@@ -107,6 +117,37 @@ export class PokemonNotificationRepository implements WantStorage {
     return wants.length + unreadable;
   }
 
+  /** One query over the index `(pokemon, guildId)`; the members come by their `User` row. */
+  async wanting(guildId: string, numbers: readonly number[]): Promise<MemberWants[]> {
+    const asked = [...new Set(numbers)].filter((number) => Number.isInteger(number));
+    if (asked.length === 0) return [];
+    const rows = await this.db
+      .selectFrom('PokemonNotification as n')
+      .innerJoin('Guild as g', 'g.id', 'n.guildId')
+      .innerJoin('User as u', 'u.id', 'n.userId')
+      .select(['u.userSnowflake as memberId', 'n.pokemon', 'n.type', 'n.form', 'n.shadow'])
+      .where('g.snowflake', '=', guildId)
+      .where('n.pokemon', 'in', asked)
+      .orderBy('n.id')
+      .execute();
+    return wantsByMember(
+      rows.flatMap((row) =>
+        row.memberId === null
+          ? []
+          : [
+              {
+                memberId: row.memberId,
+                pokemon: row.pokemon ?? 0,
+                type: row.type,
+                form: row.form,
+                shadow: row.shadow !== 0,
+              },
+            ],
+      ),
+      this.forms,
+    );
+  }
+
   async set(
     memberId: string,
     guildId: string,
```

Apply to `src/db/repositories/user-repository.ts`:

```diff
--- a/src/db/repositories/user-repository.ts
+++ b/src/db/repositories/user-repository.ts
@@ -7,7 +7,11 @@ import {
 } from '../../domain/party/status.js';
 import type { DB } from '../types.js';
 
-/** One member's personal settings, as the rest of the bot sees them. */
+/**
+ * One member's personal settings, as the rest of the bot sees them. Whether a member is told
+ * of new trains is not among them: that is per server (`NewTrainStorage`), and the legacy
+ * column `newTrain` is neither read nor written here.
+ */
 export interface UserSettings {
   snowflake: string;
   /** May be @mentioned in party posts at all. */
@@ -20,8 +24,6 @@ export interface UserSettings {
   mentionsTrainStops: boolean;
   /** DM when an egg they are attending gets a boss (column `raidBoss`). */
   bossSetNotification: boolean;
-  /** DM when a train is created (column `newTrain`). */
-  newTrainNotification: boolean;
   /** Status applied to the reporter of a new raid (column `status`). */
   autoStatus: PartyStatus;
   raidPrivacy: RaidPrivacy;
@@ -40,7 +42,6 @@ export const DEFAULT_USER_SETTINGS: Omit<UserSettings, 'snowflake'> = {
   mentionsShouts: true,
   mentionsTrainStops: true,
   bossSetNotification: false,
-  newTrainNotification: false,
   autoStatus: PartyStatus.Interested,
   raidPrivacy: RaidPrivacy.Visible,
   nickname: null,
@@ -57,9 +58,6 @@ function toColumns(patch: UserSettingsPatch): Updateable<DB['User']> {
     columns.trainMovement = Number(patch.mentionsTrainStops);
   }
   if (patch.bossSetNotification !== undefined) columns.raidBoss = Number(patch.bossSetNotification);
-  if (patch.newTrainNotification !== undefined) {
-    columns.newTrain = Number(patch.newTrainNotification);
-  }
   if (patch.autoStatus !== undefined) columns.status = patch.autoStatus;
   if (patch.raidPrivacy !== undefined) columns.raidPrivacy = patch.raidPrivacy;
   if (patch.nickname !== undefined) columns.nickname = patch.nickname;
@@ -101,7 +99,6 @@ function toSettings(snowflake: string, row: Selectable<DB['User']>): UserSetting
     mentionsShouts: row.shouts === 1,
     mentionsTrainStops: row.trainMovement === 1,
     bossSetNotification: row.raidBoss === 1,
-    newTrainNotification: row.newTrain === 1,
     autoStatus: toPartyStatus(row.status),
     raidPrivacy: toRaidPrivacy(row.raidPrivacy),
     nickname: row.nickname,
```

Apply to `src/db/types.ts`:

```diff
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -98,6 +98,12 @@ export interface GymNotification {
   userId: number | null;
 }
 
+export interface NewTrainNotification {
+  createdAt: string;
+  guildId: number;
+  memberId: string;
+}
+
 export interface Party {
   createdAt: string;
   createdById: string;
@@ -227,6 +233,7 @@ export interface DB {
   Gym: Gym;
   GymMeta: GymMeta;
   GymNotification: GymNotification;
+  NewTrainNotification: NewTrainNotification;
   Party: Party;
   PartyAccessGrant: PartyAccessGrant;
   Pokemon: Pokemon;
```

Apply to `src/domain/pogo/notification-target.ts`:

```diff
--- a/src/domain/pogo/notification-target.ts
+++ b/src/domain/pogo/notification-target.ts
@@ -179,18 +179,31 @@ export function encodeNotification(
   }
   const plain = { form: null, shadow: false };
   if (target.kind === 'iv') {
-    const pokemon = target.iv === 'perfect' ? PERFECT_CODE : ZERO_CODE;
-    return { pokemon, type: 'spawn', ...plain };
+    return { pokemon: ivCode(target.iv), type: 'spawn', ...plain };
   }
-  const code = TIER_CODES.find(
-    ([, level, shadow]) => level === target.tier.level && shadow === target.tier.shadow,
-  );
-  if (!code) {
+  const code = tierCode(target.tier);
+  if (code === undefined) {
     throw new RangeError(
       `No notification code for ${target.tier.shadow ? 'shadow ' : ''}${target.tier.level}`,
     );
   }
-  return { pokemon: code[0], type: 'raid', ...plain };
+  return { pokemon: code, type: 'raid', ...plain };
+}
+
+/**
+ * The number a want for this tier is stored under; undefined for a tier that has none (a shadow
+ * raid of a level that has no shadow raids). Never throws: for whoever looks rows up by what
+ * was reported, where a tier without a code simply has no rows.
+ */
+export function tierCode(tier: RaidTier): number | undefined {
+  return TIER_CODES.find(
+    ([, level, shadow]) => level === tier.level && shadow === tier.shadow,
+  )?.[0];
+}
+
+/** The number a want for perfect or zero IVs is stored under. */
+export function ivCode(iv: 'perfect' | 'zero'): number {
+  return iv === 'perfect' ? PERFECT_CODE : ZERO_CODE;
 }
 
 /**
```

Apply to `src/domain/pogo/wants.ts`:

```diff
--- a/src/domain/pogo/wants.ts
+++ b/src/domain/pogo/wants.ts
@@ -737,3 +737,43 @@ export function rowsOfWant(
     })
     .map((row) => row.id);
 }
+
+/** A row of `PokemonNotification` with the member it belongs to, as a read by event gives it. */
+export interface MemberWantRow extends StoredNotification {
+  /** Snowflake of the member. */
+  memberId: string;
+}
+
+/** The wants of one member that a read by event found. */
+export interface MemberWants {
+  /** Snowflake of the member. */
+  memberId: string;
+  /** Each target once (`readWants`); never empty. */
+  wants: Want[];
+}
+
+/**
+ * The rows of several members as the wants they mean, member by member in the order of their
+ * first row: what a read by event answers ("who has a row with one of these numbers in this
+ * server"). The rows were found by number, and a number alone says little (-6 is a tier and the
+ * perfect-IV rows of 2019), so they are read like any others (`readWants`, with the game data);
+ * whether a want is for what happened is the matcher's to say. A member none of whose rows can
+ * be read is left out.
+ */
+export function wantsByMember(
+  rows: readonly MemberWantRow[],
+  reader: FormReader = formAsStored,
+): MemberWants[] {
+  const byMember = new Map<string, MemberWantRow[]>();
+  for (const row of rows) {
+    const known = byMember.get(row.memberId);
+    if (known) known.push(row);
+    else byMember.set(row.memberId, [row]);
+  }
+  const found: MemberWants[] = [];
+  for (const [memberId, own] of byMember) {
+    const { wants } = readWants(own, reader);
+    if (wants.length > 0) found.push({ memberId, wants });
+  }
+  return found;
+}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/settings/settings.test.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/wants.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/migrator.db.test.ts`, `src/db/repositories/gym-notification-repository.db.test.ts`, `src/db/repositories/new-train-repository.db.test.ts`, `src/db/repositories/pokemon-notification-repository.db.test.ts`, `src/db/repositories/user-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/gym-notification-repository.db.test.ts src/db/repositories/new-train-repository.db.test.ts src/db/repositories/pokemon-notification-repository.db.test.ts src/db/repositories/user-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 323afa0 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/app-context.ts src/app.ts src/commands/settings/settings.test.ts src/commands/settings/settings.ts src/db/migrations/2026_10_12_006_new_train_notifications.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/gym-notification-repository.db.test.ts src/db/repositories/gym-notification-repository.ts src/db/repositories/new-train-repository.db.test.ts src/db/repositories/new-train-repository.ts src/db/repositories/pokemon-notification-repository.db.test.ts src/db/repositories/pokemon-notification-repository.ts src/db/repositories/user-repository.db.test.ts src/db/repositories/user-repository.ts src/db/types.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/notification-target.ts src/domain/pogo/wants.test.ts src/domain/pogo/wants.ts test/support/gym-targets.ts test/support/new-trains.ts test/support/test-context.ts test/support/wants.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/app.ts src/commands/settings/settings.test.ts src/commands/settings/settings.ts src/db/migrations/2026_10_12_006_new_train_notifications.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/gym-notification-repository.db.test.ts src/db/repositories/gym-notification-repository.ts src/db/repositories/new-train-repository.db.test.ts src/db/repositories/new-train-repository.ts src/db/repositories/pokemon-notification-repository.db.test.ts src/db/repositories/pokemon-notification-repository.ts src/db/repositories/user-repository.db.test.ts src/db/repositories/user-repository.ts src/db/types.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/notification-target.ts src/domain/pogo/wants.test.ts src/domain/pogo/wants.ts test/support/gym-targets.ts test/support/new-trains.ts test/support/test-context.ts test/support/wants.ts
git commit -m "Reads by event: who wants these numbers, who targets this gym, who wants new trains" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 3,034 unit tests.

---

### Task 3: Members in batches: who of these can see this channel

**Files:**
- Create: `src/discord/member-viewers.test.ts`, `src/discord/member-viewers.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/discord/member-directory.ts`, `test/support/members.ts`

**Interfaces:**
- Consumes: `MemberDirectory`, `CachedMemberDirectory`, `DiscordMemberDirectory`, `fetchGuildMember` (`src/discord/member-directory.ts`); `FakeMemberDirectory`; `DiscordPartyGateway.admitMember`.
- Produces: `MemberDirectory.viewers(guildId, channelId, userIds): Promise<Set<string>>` (who of these is in the server and may view the channel); `src/discord/member-viewers.ts`: `CachedViewers` (one request after the other, answers kept `SEES_MS` ten minutes and `UNSEEN_MS` one, bounded), `RequestBudget` with `MEMBER_REQUEST_BUDGET` (one request a second, thirty a minute), `MEMBERS_PER_REQUEST` (100), `GatewayWithFallback` with `GATEWAY_REST` (the gateway request, on failure single REST look-ups and a rest that doubles from a minute to six hours); the thin discord.js part in `DiscordMemberDirectory` (no unit test); `FakeMemberDirectory` with `viewers`, `holding` and members who are not in the server or cannot see a channel; `admitMember` fetches its member fresh.

Nothing uses `viewers` yet.

Reference commit of the prototype for this task: `4ad0954`.

- [ ] **Step 1: Write the failing tests**

Create `src/discord/member-viewers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  CachedViewers,
  GATEWAY_REST,
  GatewayWithFallback,
  MEMBER_REQUEST_BUDGET,
  MEMBERS_PER_REQUEST,
  RequestBudget,
  SEES_MS,
  UNSEEN_MS,
} from './member-viewers.js';

const GUILD = '100000000000000001';
const FORUM = '500000000000000001';
const CHANNEL = '500000000000000002';

/** A user id of 18 digits for a number. */
const idOf = (n: number): string => String(300_000_000_000_000_000n + BigInt(n));
const ids = (from: number, count: number): string[] =>
  Array.from({ length: count }, (_unused, index) => idOf(from + index));

/** Viewers over a fetch that is recorded, with a clock a test moves. Odd members see nothing. */
function setup(options: { budget?: Pick<RequestBudget, 'take'> } = {}) {
  const requests: string[][] = [];
  const clock = { now: 1_000_000 };
  const state: { failing?: Error; running: number; most: number } = { running: 0, most: 0 };
  const sees = (id: string): boolean => BigInt(id) % 2n === 0n;
  const viewers = new CachedViewers(
    async (_guildId, _channelId, userIds) => {
      requests.push([...userIds]);
      state.running += 1;
      state.most = Math.max(state.most, state.running);
      await new Promise((resolve) => setImmediate(resolve));
      state.running -= 1;
      if (state.failing) throw state.failing;
      return new Set(userIds.filter(sees));
    },
    { now: () => clock.now, ...options },
  );
  return { viewers, requests, clock, state, sees };
}

describe('CachedViewers', () => {
  it('asks for many members in requests of a hundred, one after the other', async () => {
    const made = setup();
    const asked = ids(0, 250);
    const seen = await made.viewers.viewers(GUILD, FORUM, asked);
    expect(made.requests.map((request) => request.length)).toEqual([100, 100, 50]);
    expect(made.requests.flat()).toEqual(asked);
    expect(made.state.most).toBe(1);
    expect([...seen].sort()).toEqual(asked.filter(made.sees).sort());
    expect(MEMBERS_PER_REQUEST).toBe(100);
  });

  it('never runs two requests at once, whoever asks', async () => {
    const made = setup();
    const [first, second] = await Promise.all([
      made.viewers.viewers(GUILD, FORUM, ids(0, 150)),
      made.viewers.viewers(GUILD, CHANNEL, ids(1000, 150)),
    ]);
    expect(made.state.most).toBe(1);
    expect(made.requests).toHaveLength(4);
    expect(first.size).toBe(75);
    expect(second.size).toBe(75);
  });

  it('keeps "sees it" for ten minutes and "cannot see it" for one, per channel', async () => {
    const made = setup();
    const asked = [idOf(1), idOf(2)];
    expect(await made.viewers.viewers(GUILD, FORUM, asked)).toEqual(new Set([idOf(2)]));
    made.clock.now += SEES_MS > UNSEEN_MS ? UNSEEN_MS - 1 : 0;
    expect(await made.viewers.viewers(GUILD, FORUM, asked)).toEqual(new Set([idOf(2)]));
    expect(made.requests).toHaveLength(1);
    // Another channel is another question.
    await made.viewers.viewers(GUILD, CHANNEL, asked);
    expect(made.requests).toHaveLength(2);
    // After a minute who could not see it is asked about again, who could is not.
    made.clock.now += 1;
    expect(await made.viewers.viewers(GUILD, FORUM, [...asked, idOf(4)])).toEqual(
      new Set([idOf(2), idOf(4)]),
    );
    expect(made.requests[2]).toEqual([idOf(1), idOf(4)]);
    made.clock.now += SEES_MS - UNSEEN_MS - 1;
    await made.viewers.viewers(GUILD, FORUM, [idOf(2)]);
    expect(made.requests).toHaveLength(3);
    made.clock.now += 1;
    await made.viewers.viewers(GUILD, FORUM, [idOf(2)]);
    expect(made.requests[3]).toEqual([idOf(2)]);
    expect(SEES_MS).toBe(600_000);
    expect(UNSEEN_MS).toBe(60_000);
  });

  it('asks only for whom it does not know yet', async () => {
    const made = setup();
    await made.viewers.viewers(GUILD, FORUM, ids(0, 10));
    const seen = await made.viewers.viewers(GUILD, FORUM, ids(5, 10));
    expect(made.requests[1]).toEqual(ids(10, 5));
    expect([...seen].sort()).toEqual(ids(5, 10).filter(made.sees).sort());
  });

  it('does not ask again for a member whom a request ahead in the line answers', async () => {
    const made = setup();
    const [first, second] = await Promise.all([
      made.viewers.viewers(GUILD, FORUM, ids(0, 4)),
      made.viewers.viewers(GUILD, FORUM, ids(2, 4)),
    ]);
    expect(made.requests).toEqual([ids(0, 4), ids(4, 2)]);
    expect([...first].sort()).toEqual([idOf(0), idOf(2)]);
    expect([...second].sort()).toEqual([idOf(2), idOf(4)]);
  });

  it('asks once for a member named twice, and never for what is no user id', async () => {
    const made = setup();
    const seen = await made.viewers.viewers(GUILD, FORUM, [idOf(2), idOf(2), '', '12', 'abc']);
    expect(made.requests).toEqual([[idOf(2)]]);
    expect(seen).toEqual(new Set([idOf(2)]));
    expect(await made.viewers.viewers(GUILD, FORUM, [])).toEqual(new Set());
    expect(await made.viewers.viewers(GUILD, FORUM, [''])).toEqual(new Set());
    expect(made.requests).toHaveLength(1);
  });

  it('rejects when a request fails, keeps nothing of it, and goes on with the next call', async () => {
    const made = setup();
    made.state.failing = new Error('Discord is away');
    await expect(made.viewers.viewers(GUILD, FORUM, ids(0, 150))).rejects.toThrow('away');
    delete made.state.failing;
    const seen = await made.viewers.viewers(GUILD, FORUM, ids(0, 4));
    expect([...seen].sort()).toEqual([idOf(0), idOf(2)]);
    expect(made.state.most).toBe(1);
  });

  it('waits for the budget before every request, and not for an answer from memory', async () => {
    let taken = 0;
    const made = setup({
      budget: {
        take: () => {
          taken += 1;
          return Promise.resolve();
        },
      },
    });
    await made.viewers.viewers(GUILD, FORUM, ids(0, 250));
    expect(taken).toBe(3);
    await made.viewers.viewers(GUILD, FORUM, ids(0, 250));
    expect(taken).toBe(3);
  });
});

describe('RequestBudget', () => {
  /** A budget whose sleeping moves the clock, and records how long it slept. */
  function budgetOf(gapMs: number, perMinute: number) {
    const clock = { now: 5_000_000 };
    const slept: number[] = [];
    const budget = new RequestBudget({
      gapMs,
      perMinute,
      now: () => clock.now,
      sleep: (ms) => {
        slept.push(ms);
        clock.now += ms;
        return Promise.resolve();
      },
    });
    return { budget, clock, slept };
  }

  it('lets the first request start at once and spaces the next ones', async () => {
    const { budget, clock, slept } = budgetOf(1_000, 30);
    await budget.take();
    expect(slept).toEqual([]);
    await budget.take();
    expect(slept).toEqual([1_000]);
    clock.now += 400;
    await budget.take();
    expect(slept).toEqual([1_000, 600]);
    clock.now += 5_000;
    await budget.take();
    expect(slept).toHaveLength(2);
  });

  it('lets no more start in any minute than it allows', async () => {
    const { budget, clock } = budgetOf(1_000, 30);
    const starts: number[] = [];
    for (let i = 0; i < 95; i++) {
      await budget.take();
      starts.push(clock.now);
    }
    for (let i = 0; i < starts.length; i++) {
      const within = starts.filter(
        (at) => at >= (starts[i] ?? 0) && at < (starts[i] ?? 0) + 60_000,
      );
      expect(within.length).toBeLessThanOrEqual(30);
      if (i > 0) expect((starts[i] ?? 0) - (starts[i - 1] ?? 0)).toBeGreaterThanOrEqual(1_000);
    }
    // 95 requests need more than three minutes.
    expect((starts.at(-1) ?? 0) - (starts[0] ?? 0)).toBeGreaterThanOrEqual(180_000);
  });

  it('is budgeted far below what the gateway allows in a minute', () => {
    expect(MEMBER_REQUEST_BUDGET.perMinute).toBeLessThanOrEqual(40);
    expect(60_000 / MEMBER_REQUEST_BUDGET.gapMs).toBeLessThanOrEqual(60);
  });
});

describe('GatewayWithFallback', () => {
  /** A gateway that fails while `down`, a fallback that always answers, and a clock. */
  function fallbackOf() {
    const clock = { now: 9_000_000 };
    const { log, entries } = createTestLogger();
    const state: { down?: Error } = {};
    const asked: string[] = [];
    const asking = new GatewayWithFallback({
      now: () => clock.now,
      log,
      retryAfterMs: (err) => (err as { retryAfterMs?: number }).retryAfterMs,
    });
    const ask = () =>
      asking.ask(
        () => {
          asked.push('gateway');
          return state.down ? Promise.reject(state.down) : Promise.resolve('gateway');
        },
        () => {
          asked.push('rest');
          return Promise.resolve('rest');
        },
      );
    const warnings = () => entries.filter((entry) => entry.level === 40);
    const infos = () => entries.filter((entry) => entry.level === 30);
    return { clock, state, asked, ask, warnings, infos, asking };
  }

  it('asks the gateway, and the other way only when that fails', async () => {
    const made = fallbackOf();
    expect(await made.ask()).toBe('gateway');
    expect(made.asked).toEqual(['gateway']);
    made.state.down = new Error('timed out');
    expect(await made.ask()).toBe('rest');
    expect(made.asked).toEqual(['gateway', 'gateway', 'rest']);
  });

  it('leaves the gateway alone for a minute after a failure, and doubles that up to six hours', async () => {
    const made = fallbackOf();
    made.state.down = new Error('timed out');
    const rests: number[] = [];
    for (let failure = 0; failure < 12; failure++) {
      made.asked.length = 0;
      await made.ask();
      expect(made.asked).toEqual(['gateway', 'rest']);
      const rest = made.asking.restsUntil - made.clock.now;
      rests.push(rest);
      // While it rests only the other way is asked.
      made.clock.now += rest - 1;
      made.asked.length = 0;
      expect(await made.ask()).toBe('rest');
      expect(made.asked).toEqual(['rest']);
      made.clock.now += 1;
    }
    expect(rests.slice(0, 4)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(rests.at(-1)).toBe(6 * 3_600_000);
    expect(Math.max(...rests)).toBe(GATEWAY_REST.maxMs);
  });

  it('starts at a minute again after a success', async () => {
    const made = fallbackOf();
    made.state.down = new Error('timed out');
    await made.ask();
    made.clock.now = made.asking.restsUntil;
    await made.ask();
    expect(made.asking.restsUntil - made.clock.now).toBe(120_000);
    made.clock.now = made.asking.restsUntil;
    delete made.state.down;
    expect(await made.ask()).toBe('gateway');
    made.state.down = new Error('again');
    await made.ask();
    expect(made.asking.restsUntil - made.clock.now).toBe(60_000);
  });

  it('rests for as long as Discord says when that is longer', async () => {
    const made = fallbackOf();
    made.state.down = Object.assign(new Error('rate limited'), { retryAfterMs: 300_000 });
    await made.ask();
    expect(made.asking.restsUntil - made.clock.now).toBe(300_000);
  });

  it('warns at the first failure and says when the gateway answers again, nothing between', async () => {
    const made = fallbackOf();
    made.state.down = new Error('timed out');
    for (let failure = 0; failure < 4; failure++) {
      await made.ask();
      made.clock.now = made.asking.restsUntil;
    }
    expect(made.warnings()).toHaveLength(1);
    expect(made.infos()).toHaveLength(0);
    delete made.state.down;
    await made.ask();
    await made.ask();
    expect(made.warnings()).toHaveLength(1);
    expect(made.infos()).toHaveLength(1);
    made.state.down = new Error('timed out');
    await made.ask();
    expect(made.warnings()).toHaveLength(2);
  });

  it('rejects when the other way fails too', async () => {
    const made = fallbackOf();
    made.state.down = new Error('timed out');
    await expect(
      made.asking.ask(
        () => Promise.reject(new Error('gateway')),
        () => Promise.reject(new Error('rest is away')),
      ),
    ).rejects.toThrow('rest is away');
  });
});

describe('FakeMemberDirectory.viewers', () => {
  it('answers for members of the server who can see the channel', async () => {
    const members = new FakeMemberDirectory()
      .add(idOf(1), 'One', GUILD)
      .add(idOf(2), 'Two', GUILD)
      .add(idOf(3), 'Three', '100000000000000009')
      .hide(FORUM, idOf(2));
    expect(await members.viewers(GUILD, FORUM, [idOf(1), idOf(2), idOf(3), idOf(4)])).toEqual(
      new Set([idOf(1)]),
    );
    expect(await members.viewers(GUILD, CHANNEL, [idOf(1), idOf(2)])).toEqual(
      new Set([idOf(1), idOf(2)]),
    );
    members.sees = (_channelId, userId) => userId !== idOf(1);
    expect(await members.viewers(GUILD, CHANNEL, [idOf(1), idOf(2)])).toEqual(new Set([idOf(2)]));
    expect(members.batches).toHaveLength(3);
    members.batchLimit = 1;
    await expect(members.viewers(GUILD, CHANNEL, [idOf(1), idOf(2)])).rejects.toThrow('at once');
    members.failing = new Error('away');
    await expect(members.viewers(GUILD, CHANNEL, [idOf(1)])).rejects.toThrow('away');
  });
});
```

Apply to `test/support/members.ts`:

```diff
--- a/test/support/members.ts
+++ b/test/support/members.ts
@@ -5,11 +5,30 @@ import { FAKE_GUILD_ID } from './fake-interactions.js';
  * The members of servers, for tests: nobody is a member of anything until `add` says so.
  * `asked` records every look-up as `<guild>:<user>`. Set `failing` to make every look-up reject,
  * as Discord being away would.
+ *
+ * A member sees every channel of their server unless `hide` says otherwise, or `sees` (when a
+ * test sets it, for instance to the fake gateway's `canSee`) answers false. `batches` records
+ * every call of `viewers`; like Discord it answers in a later turn of the event loop, and it
+ * refuses more ids in one call than a test allows with `batchLimit`.
  */
 export class FakeMemberDirectory implements MemberDirectory {
   failing: Error | undefined;
   readonly asked: string[] = [];
+  readonly batches: { guildId: string; channelId: string; userIds: string[] }[] = [];
+  /** A call of `viewers` with more ids than this rejects. Unlimited by default. */
+  batchLimit = Number.POSITIVE_INFINITY;
+  /** Asked besides `hide` when set: whether a member can see a channel. */
+  sees: ((channelId: string, userId: string) => boolean) | undefined;
   private readonly members = new Map<string, ServerMember>();
+  private readonly hidden = new Map<string, Set<string>>();
+
+  /** These members cannot see the channel. */
+  hide(channelId: string, ...userIds: string[]): this {
+    const hidden = this.hidden.get(channelId) ?? new Set<string>();
+    for (const id of userIds) hidden.add(id);
+    this.hidden.set(channelId, hidden);
+    return this;
+  }
 
   /** Makes somebody a member of a server (default: the server of the fake interactions). */
   add(userId: string, name: string, guildId = FAKE_GUILD_ID): this {
@@ -28,4 +47,27 @@ export class FakeMemberDirectory implements MemberDirectory {
     const member = this.members.get(`${guildId}:${userId}`);
     return Promise.resolve(member && { ...member });
   }
+
+  viewers(guildId: string, channelId: string, userIds: readonly string[]): Promise<Set<string>> {
+    this.batches.push({ guildId, channelId, userIds: [...userIds] });
+    return new Promise((resolve, reject) => {
+      setImmediate(() => {
+        if (this.failing) reject(this.failing);
+        else if (userIds.length > this.batchLimit) {
+          reject(new Error(`${String(userIds.length)} members were asked for at once`));
+        } else {
+          resolve(
+            new Set(
+              userIds.filter(
+                (id) =>
+                  this.members.has(`${guildId}:${id}`) &&
+                  !this.hidden.get(channelId)?.has(id) &&
+                  (this.sees?.(channelId, id) ?? true),
+              ),
+            ),
+          );
+        }
+      });
+    });
+  }
 }
```

Run: `npx vitest run --project unit src/discord/member-viewers.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -64,7 +64,7 @@ export interface AppContext {
   readonly gymTargets: GymTargetStorage;
   /** Who asked to be told of new trains, per server. */
   readonly newTrains: NewTrainStorage;
-  /** Members of a server other than the one who is acting, looked up one at a time. */
+  /** Members of a server other than the one who is acting: one by id, or who of many can see a channel. */
   readonly members: MemberDirectory;
   /** Pokémon by what members type: names, nicknames, forms. */
   readonly pokemon: PokemonFinder;
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -107,7 +107,7 @@ export async function startApp(
   const regions = new RegionDirectory({ regions: regionRepository, log });
   const parties = new PartyStore({ storage: new PartyRepository(db), log });
   const partyGateway = new DiscordPartyGateway();
-  const members = new DiscordMemberDirectory();
+  const members = new DiscordMemberDirectory({ log });
   // Listens to the store: whoever signs up for a party in a forum they cannot see is let in.
   const access = new AccessService({
     store: parties,
```

Apply to `src/discord/member-directory.ts`:

```diff
--- a/src/discord/member-directory.ts
+++ b/src/discord/member-directory.ts
@@ -1,10 +1,19 @@
 import {
   DiscordAPIError,
+  PermissionFlagsBits,
   RESTJSONErrorCodes,
   type Client,
+  type Collection,
   type Guild,
   type GuildMember,
 } from 'discord.js';
+import type { Logger } from '../log.js';
+import {
+  CachedViewers,
+  GatewayWithFallback,
+  MEMBER_REQUEST_BUDGET,
+  RequestBudget,
+} from './member-viewers.js';
 
 /** A member of a server, as far as the bot needs them outside an interaction of their own. */
 export interface ServerMember {
@@ -14,9 +23,10 @@ export interface ServerMember {
 }
 
 /**
- * Members of a server, looked up one at a time. The bot keeps no member list (that needs the
+ * Members of a server, looked up by id. The bot keeps no member list (that needs the
  * privileged GuildMembers intent, spec 3.1): somebody who is not the member of the interaction
- * at hand is asked for by id. Plan 4B adds here whether a member can see a channel.
+ * at hand is asked for, one at a time (`find`) or many at once with what they can see
+ * (`viewers`).
  */
 export interface MemberDirectory {
   /**
@@ -24,6 +34,16 @@ export interface MemberDirectory {
    * (or no longer), and for a server the bot is not in. Throws for any other failure.
    */
   find(guildId: string, userId: string): Promise<ServerMember | undefined>;
+  /**
+   * Of these user ids, those who are members of the server and can view the channel (a text
+   * channel or a forum of it; a post is seen by whoever sees its forum): who may be told by
+   * direct message about something that happened there. However many are asked for, Discord is
+   * asked in small requests one after the other, so this can take a while; answers are kept
+   * briefly. Rejects when it could not be found out, also for a server or a channel the bot
+   * does not know (at this moment: its cache may lack them for a while after a reconnect), so
+   * that "nobody" is never remembered for what was not asked.
+   */
+  viewers(guildId: string, channelId: string, userIds: readonly string[]): Promise<Set<string>>;
 }
 
 /**
@@ -71,7 +91,7 @@ const USER_ID = /^\d{17,20}$/;
  * user id is nobody and is never asked for: Discord would read an empty id as a request for
  * all members of the server.
  */
-export class CachedMemberDirectory implements MemberDirectory {
+export class CachedMemberDirectory implements Pick<MemberDirectory, 'find'> {
   private readonly known = new Map<string, { member: ServerMember | undefined; until: number }>();
   /** The look-ups that are on their way: a second one for the same member waits for the first. */
   private readonly asking = new Map<string, Promise<ServerMember | undefined>>();
@@ -111,23 +131,97 @@ export class CachedMemberDirectory implements MemberDirectory {
   }
 }
 
+/**
+ * How long one gateway request for members may take before the members are asked for one by
+ * one instead. discord.js waits two minutes by default; an answer normally comes at once.
+ */
+const MEMBER_REQUEST_TIMEOUT_MS = 10_000;
+/** The seconds Discord asks to wait, when `err` is its refusal of a gateway request as rate limited. */
+function gatewayRetryAfterMs(err: unknown): number | undefined {
+  if (!(err instanceof Error) || err.name !== 'GatewayRateLimitError') return undefined;
+  const data = (err as { data?: { retry_after?: unknown } }).data;
+  return typeof data?.retry_after === 'number' ? data.retry_after * 1_000 : undefined;
+}
+
 /**
  * The directory over a discord.js client: thin, and without unit tests like the party gateway
- * (the staging run is its test); what it remembers is `CachedMemberDirectory`'s. The client is
- * handed over once it exists; anything asked before that fails. A look-up that is not answered
- * from memory asks Discord afresh, so that somebody who left is not found in the cache of an
- * earlier interaction.
+ * (the staging run is its test); what it remembers is `CachedMemberDirectory`'s and
+ * `CachedViewers`'. The client is handed over once it exists; anything asked before that fails.
+ * A look-up that is not answered from memory asks Discord afresh, so that somebody who left is
+ * not found in the cache of an earlier interaction.
+ *
+ * `viewers` asks for up to a hundred members in one gateway request (Request Guild Members by
+ * `user_ids`, which Discord documents as needing an intent only for the whole list and for
+ * presences): discord.js builds the answer from the members that request itself brought (each
+ * is put into its cache from the fresh data, roles included), and somebody who is not in the
+ * server is simply not among them. Whether such a member sees the channel is then asked of the
+ * channel as the cache has it; channels, their overwrites and the roles of the server are kept
+ * current by the Guilds intent. When the gateway request fails, times out or is refused as
+ * rate limited, the same members are asked for one at a time over REST (`fetchGuildMember`,
+ * fresh), and the gateway is left alone for a while (`GatewayWithFallback`: a minute, longer
+ * after every further failure, or for as long as Discord said).
  */
 export class DiscordMemberDirectory implements MemberDirectory {
   private current: Client | undefined;
   private readonly cached: CachedMemberDirectory;
+  private readonly seeing: CachedViewers;
+  private readonly members: GatewayWithFallback;
 
-  constructor(now: () => number = () => Date.now()) {
+  constructor(options: { now?: () => number; log?: Logger } = {}) {
+    const now = options.now ?? (() => Date.now());
+    this.members = new GatewayWithFallback({
+      now,
+      ...(options.log ? { log: options.log } : {}),
+      retryAfterMs: gatewayRetryAfterMs,
+    });
     this.cached = new CachedMemberDirectory(async (guildId, userId) => {
       const guild = this.current?.guilds.cache.get(guildId);
       const found = guild && (await fetchGuildMember(guild, userId, true));
       return found && { id: found.id, name: found.displayName };
     }, now);
+    this.seeing = new CachedViewers(
+      async (guildId, channelId, userIds) => {
+        const guild = this.current?.guilds.cache.get(guildId);
+        const channel = guild?.channels.cache.get(channelId);
+        // Thrown, not answered with nobody: an answer is remembered, and a server or channel
+        // the cache lacks at this moment says nothing about who can see it.
+        if (!guild) throw new Error(`The server ${guildId} is not known`);
+        if (!channel || channel.isThread()) {
+          throw new Error(`The channel ${channelId} is not known, or is a thread`);
+        }
+        if (userIds.length === 0) return new Set<string>();
+        const members = await this.freshMembers(guild, userIds);
+        const seeing = new Set<string>();
+        for (const member of members) {
+          if (channel.permissionsFor(member).has(PermissionFlagsBits.ViewChannel)) {
+            seeing.add(member.id);
+          }
+        }
+        return seeing;
+      },
+      { now, budget: new RequestBudget({ ...MEMBER_REQUEST_BUDGET, now }) },
+    );
+  }
+
+  /** Those of these users who are members of the server, as Discord has them now. */
+  private freshMembers(guild: Guild, userIds: readonly string[]): Promise<GuildMember[]> {
+    return this.members.ask(
+      async () => {
+        const found: Collection<string, GuildMember> = await guild.members.fetch({
+          user: [...userIds],
+          time: MEMBER_REQUEST_TIMEOUT_MS,
+        });
+        return [...found.values()];
+      },
+      async () => {
+        const members: GuildMember[] = [];
+        for (const userId of userIds) {
+          const member = await fetchGuildMember(guild, userId, true);
+          if (member) members.push(member);
+        }
+        return members;
+      },
+    );
   }
 
   /** The client to talk through from now on. */
@@ -142,4 +236,9 @@ export class DiscordMemberDirectory implements MemberDirectory {
     if (!this.current.guilds.cache.has(guildId)) return Promise.resolve(undefined);
     return this.cached.find(guildId, userId);
   }
+
+  viewers(guildId: string, channelId: string, userIds: readonly string[]): Promise<Set<string>> {
+    if (!this.current) return Promise.reject(new Error('Discord is not connected yet'));
+    return this.seeing.viewers(guildId, channelId, userIds);
+  }
 }
```

Create `src/discord/member-viewers.ts`:

```ts
import type { Logger } from '../log.js';

/**
 * Of these user ids (at most `MEMBERS_PER_REQUEST`), those who are in the server and can view
 * the channel. Rejects when it could not be found out.
 */
export type ViewersFetch = (
  guildId: string,
  channelId: string,
  userIds: readonly string[],
) => Promise<ReadonlySet<string>>;

/** As many user ids as one gateway request for members may name (Discord's limit). */
export const MEMBERS_PER_REQUEST = 100;

/**
 * What the batch look-up may send over the gateway connection. Discord closes a connection that
 * sends more than 120 events in 60 seconds (close code 4008), whatever the events are; requests
 * for members by user id count against that (reportedly not against the 30 seconds per server
 * of a request for the whole list; unverified until staging). `@discordjs/ws` queues what is
 * sent and sleeps before the 115th event of a minute, so the limit itself is not passed, but a
 * burst of these requests would then hold back everything else the connection sends. So the
 * look-up has a budget of its own, far below the limit: one request after the other, never two
 * at once, at most one a second and thirty in any minute (3,000 members a minute, five times
 * what `DmSender` sends in that time). A request beyond the budget waits for its turn.
 */
export const MEMBER_REQUEST_BUDGET = { gapMs: 1_000, perMinute: 30 } as const;

const MINUTE_MS = 60_000;

export interface RequestBudgetOptions {
  /** The least time between two requests. */
  gapMs: number;
  /** As many requests as may start within any minute. */
  perMinute: number;
  now?: () => number;
  /** Waits; a test passes one that moves its clock. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A budget for requests that are made one after the other: `take()` resolves when the next one
 * may start, and counts it. It is not a queue: whoever uses it must wait for one `take` before
 * asking for the next (`CachedViewers` runs its requests in one chain).
 */
export class RequestBudget {
  /** When the requests of the last minute started, oldest first. */
  private readonly started: number[] = [];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: RequestBudgetOptions) {
    this.now = options.now ?? (() => Date.now());
    this.sleep =
      options.sleep ??
      ((ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms).unref();
        }));
  }

  /** How long the next request has to wait from now; 0 when it may start. */
  waitMs(): number {
    const now = this.now();
    while (this.started.length > 0 && now - (this.started[0] ?? 0) >= MINUTE_MS) {
      this.started.shift();
    }
    const last = this.started.at(-1);
    const forGap = last === undefined ? 0 : last + this.options.gapMs - now;
    const oldest = this.started[this.started.length - this.options.perMinute];
    const forMinute = oldest === undefined ? 0 : oldest + MINUTE_MS - now;
    return Math.max(0, forGap, forMinute);
  }

  /** Resolves when the next request may start, and counts it as started then. */
  async take(): Promise<void> {
    for (let wait = this.waitMs(); wait > 0; wait = this.waitMs()) await this.sleep(wait);
    this.started.push(this.now());
  }
}

/**
 * How long the gateway is left alone after a request for members over it failed: a minute after
 * the first failure, twice as long after every further one in a row, six hours at most.
 */
export const GATEWAY_REST = { firstMs: 60_000, maxMs: 6 * 60 * 60_000 } as const;

export interface GatewayWithFallbackOptions {
  now?: () => number;
  /** Told when the gateway fails for the first time, and when it answers again. */
  log?: Pick<Logger, 'warn' | 'info'>;
  /** How long Discord asks to wait, when `err` is its refusal of a request as rate limited. */
  retryAfterMs?: (err: unknown) => number | undefined;
}

/**
 * Asks over the gateway, and another way when that fails (a request for members that timed
 * out or was refused as rate limited: the same members one by one over REST). After a failure
 * the gateway is left alone, for a minute at first and twice as long after every further
 * failure in a row, up to six hours (or for as long as Discord said, when that is longer); a
 * request that succeeds makes it a minute again. A gateway that stays broken (the request
 * needing an intent the bot lacks after all) so costs one lost request every six hours, not one
 * a minute. It warns when the gateway first fails and says when it answers again, and nothing
 * between: a failure that repeats is one state, not news.
 */
export class GatewayWithFallback {
  private readonly now: () => number;
  /** As many requests over the gateway as failed in a row. */
  private failures = 0;
  private until = 0;

  constructor(private readonly options: GatewayWithFallbackOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  /** Until when only the other way is asked (epoch ms); in the past when the gateway is asked. */
  get restsUntil(): number {
    return this.until;
  }

  async ask<T>(overGateway: () => Promise<T>, otherwise: () => Promise<T>): Promise<T> {
    if (this.now() < this.until) return otherwise();
    let answer: T;
    try {
      answer = await overGateway();
    } catch (err) {
      const doubled = GATEWAY_REST.firstMs * 2 ** Math.min(this.failures, 30);
      const rest = Math.max(
        Math.min(doubled, GATEWAY_REST.maxMs),
        this.options.retryAfterMs?.(err) ?? 0,
      );
      this.failures += 1;
      this.until = this.now() + rest;
      if (this.failures === 1) {
        this.options.log?.warn(
          { err, restMs: rest },
          'the gateway request for members failed; asking for them one by one until it works again',
        );
      }
      return otherwise();
    }
    if (this.failures > 0) {
      this.options.log?.info(
        { failures: this.failures },
        'the gateway request for members works again',
      );
      this.failures = 0;
      this.until = 0;
    }
    return answer;
  }
}

/**
 * How long "this member sees the channel" is good for. Ten minutes: who could see a forum a
 * moment ago nearly always still can, and the next event there (a raid's boss, its gym) asks
 * about the same members again. Somebody who lost the view meanwhile gets one more message.
 */
export const SEES_MS = 10 * 60_000;
/**
 * How long "cannot see it" and "not a member" are good for. A minute, as an answer of
 * `CachedMemberDirectory`: who joins the server or is let into the forum is told of the next
 * event there.
 */
export const UNSEEN_MS = 60_000;
/**
 * As many answers as are remembered at once; the oldest goes first. An answer is a short key
 * and a flag: enough for the recipients of several events in a busy minute.
 */
const CACHE_SIZE = 20_000;
/** What a user id looks like. Anything else is nobody, and is not asked for. */
const USER_ID = /^\d{17,20}$/;

export interface CachedViewersOptions {
  now?: () => number;
  /** Waited for before every request; none by default. */
  budget?: Pick<RequestBudget, 'take'>;
}

/**
 * "Who of these members can see this channel" over a function that asks for at most a hundred
 * (`ViewersFetch`). The members are asked for in requests of `MEMBERS_PER_REQUEST`, all
 * requests of all callers one after the other, each after the budget lets it start. An answer
 * is kept, "sees it" for ten minutes (`SEES_MS`), "cannot see it" and "not a member" for one
 * (`UNSEEN_MS`), so the next event in that channel asks only for whom it does not know; a
 * member whom an earlier request in the line has answered meanwhile is not asked for again. A failure is not kept and rejects the call it
 * belongs to; the requests behind it go on. A text that cannot be a user id is nobody.
 */
export class CachedViewers {
  private readonly known = new Map<string, { sees: boolean; until: number }>();
  /** The request that is last in line; the next one starts when it has settled. */
  private tail: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;

  constructor(
    private readonly fetch: ViewersFetch,
    private readonly options: CachedViewersOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  private cached(key: string): boolean | undefined {
    const found = this.known.get(key);
    return found && found.until > this.now() ? found.sees : undefined;
  }

  private keep(key: string, sees: boolean): void {
    this.known.delete(key);
    while (this.known.size >= CACHE_SIZE) {
      // Oldest first: a Map keeps the order in which entries were added.
      const oldest = this.known.keys().next();
      if (oldest.done) break;
      this.known.delete(oldest.value);
    }
    this.known.set(key, { sees, until: this.now() + (sees ? SEES_MS : UNSEEN_MS) });
  }

  async viewers(
    guildId: string,
    channelId: string,
    userIds: readonly string[],
  ): Promise<Set<string>> {
    const key = (userId: string): string => `${guildId}:${channelId}:${userId}`;
    const asked = [...new Set(userIds)].filter((id) => USER_ID.test(id));
    const unknown = asked.filter((id) => this.cached(key(id)) === undefined);
    const seen = new Set(asked.filter((id) => this.cached(key(id)) === true));
    const requests: Promise<void>[] = [];
    for (let start = 0; start < unknown.length; start += MEMBERS_PER_REQUEST) {
      const chunk = unknown.slice(start, start + MEMBERS_PER_REQUEST);
      const request = this.tail.then(async () => {
        // Answered by a request that was ahead in the line: not asked for again.
        const still: string[] = [];
        for (const id of chunk) {
          const answer = this.cached(key(id));
          if (answer === undefined) still.push(id);
          else if (answer) seen.add(id);
        }
        if (still.length === 0) return;
        await this.options.budget?.take();
        const visible = await this.fetch(guildId, channelId, still);
        for (const id of still) {
          this.keep(key(id), visible.has(id));
          if (visible.has(id)) seen.add(id);
        }
      });
      // The line goes on after a request that failed.
      this.tail = request.catch(() => undefined);
      requests.push(request);
    }
    await Promise.all(requests);
    return seen;
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/discord/member-viewers.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 4ad0954 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/app-context.ts src/app.ts src/discord/member-directory.ts src/discord/member-viewers.test.ts src/discord/member-viewers.ts test/support/members.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/app.ts src/discord/member-directory.ts src/discord/member-viewers.test.ts src/discord/member-viewers.ts test/support/members.ts
git commit -m "Members in batches: who of these can see this channel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 3,052 unit tests.

---

### Task 4: DmSender: a line of direct messages pulled by a timer, measured, drained at shutdown

**Files:**
- Create: `src/discord/dm-gateway.ts`, `src/services/dm-sender.test.ts`, `src/services/dm-sender.ts`, `test/support/dms.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/discord/client.test.ts`, `src/discord/client.ts`, `src/discord/party-gateway.ts`, `test/support/fake-gateway.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: `OutgoingMessage` of the party gateway; `createClient` (`src/discord/client.ts`); the shutdown steps of `src/app.ts`; `createTestContext`.
- Produces: `src/discord/dm-gateway.ts`: `DmGateway.send(userId, message): Promise<DmOutcome>` (`sent`, `closed`, `slow-down`), `DiscordDmGateway` (keeps the DM channel id per user, bounded; no unit test), `isClosedDm`, `isSlowDown`; `src/services/dm-sender.ts`: `DmSender.send(job: DmJob)`, `DM_PRIORITY` (`urgent`, `spawn`, `normal`), `QueuedDmSender` (`pull()`, `drain(maxMs)`, `depth`, `sending`, `idle`), `LoopDelayMeter` / `nodeLoopDelay()`, the constants `DM_RATE_PER_SECOND`, `DM_CONCURRENCY`, `DM_MAX_DEPTH`, `DM_SLOW_DOWN_MS`; `ctx.dms`; `test/support/dms.ts` (`FakeDmGateway`, `RecordingDms`, `FakeLoopDelay`, `pullUntilIdle`); `cacheFactory()` for the client (no messages kept for DM channels, `MEMBER_CACHE_SIZE` members per server).

Nothing sends a DM yet.

Reference commit of the prototype for this task: `4ae9f44`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/discord/client.test.ts`:

```diff
--- a/src/discord/client.test.ts
+++ b/src/discord/client.test.ts
@@ -1,7 +1,21 @@
-import { GatewayIntentBits, type Client } from 'discord.js';
+import {
+  DMMessageManager,
+  GatewayIntentBits,
+  GuildMemberManager,
+  GuildMessageManager,
+  LimitedCollection,
+  MessageManager,
+  type Client,
+} from 'discord.js';
 import { describe, expect, it, vi } from 'vitest';
 import { createTestLogger } from '../../test/support/test-logger.js';
-import { createClient, loginWithFallback, rejectsLongChannelPatchWait } from './client.js';
+import {
+  cacheFactory,
+  createClient,
+  loginWithFallback,
+  MEMBER_CACHE_SIZE,
+  rejectsLongChannelPatchWait,
+} from './client.js';
 
 const disallowed = () => Object.assign(new Error('Used disallowed intents'), { code: 4014 });
 
@@ -145,3 +159,49 @@ describe('rejectsLongChannelPatchWait', () => {
     );
   });
 });
+
+describe('cacheFactory', () => {
+  /** The cache discord.js would make for a manager of this class, as `CachedManager` asks for it. */
+  const cacheOf = (overridden: unknown, manager: unknown): unknown =>
+    (cacheFactory() as unknown as (type: unknown, holds: unknown, manager: unknown) => unknown)(
+      overridden,
+      undefined,
+      manager,
+    );
+
+  it('keeps no messages of DM channels, and the default 200 of a server channel', () => {
+    const dm = cacheOf(MessageManager, DMMessageManager);
+    expect(dm).toBeInstanceOf(LimitedCollection);
+    expect((dm as LimitedCollection<string, unknown>).maxSize).toBe(0);
+    (dm as LimitedCollection<string, unknown>).set('1', {});
+    expect((dm as LimitedCollection<string, unknown>).size).toBe(0);
+    const server = cacheOf(MessageManager, GuildMessageManager);
+    expect((server as LimitedCollection<string, unknown>).maxSize).toBe(200);
+  });
+
+  it('keeps a bounded number of members per server, the bot itself always', () => {
+    const members = cacheOf(GuildMemberManager, GuildMemberManager) as LimitedCollection<
+      string,
+      { id: string; client: { user: { id: string } } }
+    >;
+    expect(members.maxSize).toBe(MEMBER_CACHE_SIZE);
+    const client = { user: { id: 'bot' } };
+    members.set('bot', { id: 'bot', client });
+    for (let n = 0; n < MEMBER_CACHE_SIZE + 10; n++) {
+      members.set(String(n), { id: String(n), client });
+    }
+    expect(members.size).toBe(MEMBER_CACHE_SIZE);
+    expect(members.has('bot')).toBe(true);
+    expect(members.has('0')).toBe(false);
+    expect(members.has(String(MEMBER_CACHE_SIZE + 9))).toBe(true);
+  });
+
+  it('is what the client is made with', () => {
+    const client = createClient([]);
+    const dm = (
+      client.options.makeCache as unknown as (a: unknown, b: unknown, c: unknown) => unknown
+    )(MessageManager, undefined, DMMessageManager);
+    expect((dm as LimitedCollection<string, unknown>).maxSize).toBe(0);
+    void client.destroy();
+  });
+});
```

Create `src/services/dm-sender.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  FakeDmGateway,
  FakeLoopDelay,
  pullUntilIdle,
  RecordingDms,
} from '../../test/support/dms.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  DM_CONCURRENCY,
  DM_PRIORITY,
  DM_RATE_PER_SECOND,
  DM_SLOW_DOWN_MS,
  nodeLoopDelay,
  QueuedDmSender,
  type DmJob,
  type QueuedDmSenderOptions,
} from './dm-sender.js';

const NOW = 1_800_000_000_000;
/** A user id of 18 digits for a number. */
const idOf = (n: number): string => String(300_000_000_000_000_000n + BigInt(n));

/** A sender over the fake gateway whose timer the test holds: nothing goes out without `pull`. */
function setup(options: Partial<QueuedDmSenderOptions> = {}) {
  const gateway = new FakeDmGateway();
  const { log, entries } = createTestLogger();
  const clock = { now: NOW };
  const loopDelay = new FakeLoopDelay();
  const timer: { run?: () => void; ms?: number; starts: number; stops: number } = {
    starts: 0,
    stops: 0,
  };
  const sender = new QueuedDmSender({
    gateway,
    log,
    now: () => clock.now,
    loopDelay,
    startTimer: (run, ms) => {
      timer.run = run;
      timer.ms = ms;
      timer.starts += 1;
      return () => {
        timer.stops += 1;
        delete timer.run;
      };
    },
    ...options,
  });
  const job = (n: number, more: Partial<DmJob> = {}): DmJob => ({
    userId: idOf(n),
    message: { content: `message ${String(n)}` },
    priority: DM_PRIORITY.normal,
    eventAt: clock.now,
    expiresAt: clock.now + 3_600_000,
    ...more,
  });
  const logged = (msg: string) => entries.filter((entry) => entry.msg === msg);
  const turn = () => new Promise((resolve) => setImmediate(resolve));
  return { sender, gateway, entries, clock, loopDelay, timer, job, logged, turn };
}

describe('QueuedDmSender', () => {
  it('sends nothing by itself: a timer pulls the line, one message a turn', async () => {
    const made = setup();
    for (let n = 0; n < 3; n++) made.sender.send(made.job(n));
    expect(made.gateway.sent).toHaveLength(0);
    expect(made.sender.depth).toBe(3);
    expect(made.timer.starts).toBe(1);
    expect(made.timer.ms).toBe(1000 / DM_RATE_PER_SECOND);
    made.sender.pull();
    await made.turn();
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(0)]);
    expect(made.sender.depth).toBe(2);
    expect(await pullUntilIdle(made.sender)).toBe(2);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(0), idOf(1), idOf(2)]);
    // The timer stops with the burst and starts again with the next message.
    expect(made.timer.stops).toBe(1);
    made.sender.send(made.job(3));
    expect(made.timer.starts).toBe(2);
    await pullUntilIdle(made.sender);
  });

  it('starts ten a second by default, and five at once at most', async () => {
    expect(DM_RATE_PER_SECOND).toBe(10);
    expect(DM_CONCURRENCY).toBe(5);
    const made = setup();
    made.gateway.hold = true;
    for (let n = 0; n < 20; n++) made.sender.send(made.job(n));
    for (let pulls = 0; pulls < 12; pulls++) made.sender.pull();
    await made.turn();
    expect(made.sender.sending).toBe(5);
    expect(made.sender.depth).toBe(15);
    made.gateway.release();
    await pullUntilIdle(made.sender);
    expect(made.gateway.most).toBe(5);
    expect(made.gateway.sent).toHaveLength(20);
  });

  it('sends what is urgent first, and within one priority the oldest event first', async () => {
    const made = setup();
    made.sender.send(made.job(1, { eventAt: NOW + 30 }));
    made.sender.send(made.job(2, { eventAt: NOW + 10 }));
    made.sender.send(made.job(3, { priority: DM_PRIORITY.urgent, eventAt: NOW + 40 }));
    made.sender.send(made.job(4, { eventAt: NOW + 20 }));
    made.sender.send(made.job(5, { priority: DM_PRIORITY.urgent, eventAt: NOW + 5 }));
    made.sender.send(made.job(6, { eventAt: NOW + 30 }));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual(
      [5, 3, 2, 4, 1, 6].map((n) => idOf(n)),
    );
  });

  it('has three priorities: what a member waits for, then spawns, then the other news', async () => {
    const made = setup();
    made.sender.send(made.job(1, { eventAt: NOW }));
    made.sender.send(made.job(2, { priority: DM_PRIORITY.spawn, eventAt: NOW + 20 }));
    made.sender.send(made.job(3, { priority: DM_PRIORITY.urgent, eventAt: NOW + 30 }));
    made.sender.send(made.job(4, { priority: DM_PRIORITY.spawn, eventAt: NOW + 10 }));
    made.sender.send(made.job(5, { eventAt: NOW - 10 }));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual(
      [3, 4, 2, 5, 1].map((n) => idOf(n)),
    );
    expect([DM_PRIORITY.urgent, DM_PRIORITY.spawn, DM_PRIORITY.normal]).toEqual([0, 1, 2]);
  });

  it('pauses for a minute when Discord says to slow down, says so once, and drops that message', async () => {
    const made = setup();
    made.gateway.slow.add(idOf(1)).add(idOf(2));
    for (let n = 1; n <= 4; n++) made.sender.send(made.job(n));
    made.sender.pull();
    await made.turn();
    // The message that got the answer is gone; nothing else starts while the pause lasts.
    expect(made.sender.depth).toBe(3);
    made.clock.now += DM_SLOW_DOWN_MS - 1;
    for (let pull = 0; pull < 5; pull++) {
      made.sender.pull();
      await made.turn();
    }
    expect(made.sender.depth).toBe(3);
    expect(made.sender.sending).toBe(0);
    expect(made.gateway.asked).toEqual([idOf(1)]);
    made.clock.now += 1;
    made.sender.pull();
    await made.turn();
    // Told to slow down again: another pause, and not another warning in this burst.
    expect(made.gateway.asked).toEqual([idOf(1), idOf(2)]);
    made.sender.pull();
    await made.turn();
    expect(made.sender.depth).toBe(2);
    made.clock.now += DM_SLOW_DOWN_MS;
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(3), idOf(4)]);
    expect(made.gateway.asked).toEqual([1, 2, 3, 4].map((n) => idOf(n)));
    const warned = made.logged('Discord says to slow down with direct messages; pausing');
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatchObject({ level: 40, pauseMs: DM_SLOW_DOWN_MS });
    expect(made.logged('direct messages sent')[0]).toMatchObject({
      sent: 2,
      failed: 2,
      slowedDown: 2,
    });
    expect(DM_SLOW_DOWN_MS).toBe(60_000);
  });

  it('lets a message expire while it pauses', async () => {
    const made = setup();
    made.gateway.slow.add(idOf(1));
    made.sender.send(made.job(1));
    made.sender.send(made.job(2, { expiresAt: NOW + 30_000 }));
    made.sender.pull();
    await made.turn();
    made.clock.now += DM_SLOW_DOWN_MS;
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent).toHaveLength(0);
    expect(made.logged('direct messages sent')[0]).toMatchObject({ expired: 1, failed: 1 });
  });

  it('ends a burst also when its numbers cannot be read, and says so', async () => {
    const made = setup();
    made.loopDelay.failing = new Error('no histogram');
    made.sender.send(made.job(1));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent).toHaveLength(1);
    expect(made.sender.idle).toBe(true);
    expect(made.timer.stops).toBe(1);
    expect(made.logged('could not log the numbers of a burst of direct messages')).toHaveLength(1);
    delete made.loopDelay.failing;
    made.sender.send(made.job(2));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent).toHaveLength(2);
  });

  it('drops a message whose time has passed when its turn comes', async () => {
    const made = setup();
    made.sender.send(made.job(1, { expiresAt: NOW + 1_000 }));
    made.sender.send(made.job(2));
    made.sender.send(made.job(3, { expiresAt: NOW + 500 }));
    made.clock.now += 1_000;
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(2)]);
    expect(made.logged('direct messages sent')[0]).toMatchObject({ sent: 1, expired: 2 });
  });

  it('walks a long line of stale messages over several pulls, never in one', async () => {
    const made = setup();
    for (let n = 0; n < 1_000; n++) made.sender.send(made.job(n, { expiresAt: NOW + 1 }));
    made.sender.send(made.job(5_000));
    made.clock.now += 10;
    made.sender.pull();
    expect(made.sender.depth).toBe(801);
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(5_000)]);
  });

  it('counts a member who takes no direct messages, at debug, and goes on', async () => {
    const made = setup();
    made.gateway.closed.add(idOf(2));
    for (let n = 1; n <= 3; n++) made.sender.send(made.job(n));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(1), idOf(3)]);
    const [debug] = made.logged('a member takes no direct messages');
    expect(debug).toMatchObject({ level: 20, user: idOf(2) });
    expect(made.logged('direct messages sent')[0]).toMatchObject({ sent: 2, closed: 1, failed: 0 });
  });

  it('logs a send that fails and drops it: nothing is tried twice', async () => {
    const made = setup();
    made.gateway.failing = new Error('Discord is away');
    for (let n = 0; n < 8; n++) made.sender.send(made.job(n));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent).toHaveLength(0);
    // The first few failures of a burst are logged one by one, the rest only counted.
    expect(made.logged('could not send a direct message')).toHaveLength(5);
    expect(made.logged('direct messages sent')[0]).toMatchObject({ sent: 0, failed: 8 });
    delete made.gateway.failing;
    made.sender.send(made.job(9));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent).toHaveLength(1);
  });

  it('refuses nothing and throws nothing for a message Discord would refuse', async () => {
    const made = setup();
    expect(() => {
      made.sender.send(made.job(1, { message: {} }));
      made.sender.send(made.job(2, { message: { content: 'x'.repeat(2_001) } }));
    }).not.toThrow();
    await pullUntilIdle(made.sender);
    expect(made.logged('direct messages sent')[0]).toMatchObject({ failed: 2 });
  });

  it('drops the least urgent, oldest message of a line that is too long, and says so once', async () => {
    const made = setup({ maxDepth: 4 });
    made.sender.send(made.job(1, { priority: DM_PRIORITY.urgent }));
    for (let n = 2; n <= 4; n++) made.sender.send(made.job(n, { eventAt: NOW + n }));
    // Full. The next ones push out the oldest of the normal ones, also when they are urgent.
    made.sender.send(made.job(5, { eventAt: NOW + 5 }));
    made.sender.send(made.job(6, { priority: DM_PRIORITY.urgent, eventAt: NOW + 6 }));
    expect(made.sender.depth).toBe(4);
    expect(
      made.logged('the line of direct messages is full; the least urgent, oldest are dropped'),
    ).toHaveLength(1);
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([1, 6, 4, 5].map((n) => idOf(n)));
    expect(made.logged('direct messages sent')[0]).toMatchObject({
      queued: 6,
      sent: 4,
      overflowed: 2,
      deepest: 4,
    });
    // A new burst says it again.
    for (let n = 10; n < 16; n++) made.sender.send(made.job(n));
    expect(
      made.logged('the line of direct messages is full; the least urgent, oldest are dropped'),
    ).toHaveLength(2);
    await pullUntilIdle(made.sender);
  });

  it('logs the numbers of a burst when it ends: delivery times and the event-loop delay', async () => {
    const made = setup();
    made.loopDelay.measured = { meanMs: 1.5, maxMs: 12 };
    made.sender.send(made.job(1));
    made.sender.send(made.job(2));
    made.sender.send(made.job(3));
    expect(made.loopDelay.running).toBe(true);
    for (const wait of [100, 300, 1_000]) {
      made.clock.now += wait;
      made.sender.pull();
      await made.turn();
    }
    await pullUntilIdle(made.sender);
    expect(made.loopDelay.running).toBe(false);
    const [numbers] = made.logged('direct messages sent');
    expect(numbers).toMatchObject({
      level: 30,
      queued: 3,
      sent: 3,
      closed: 0,
      failed: 0,
      expired: 0,
      overflowed: 0,
      waiting: 0,
      deepest: 3,
      tookMs: 1_400,
      deliveryMedianMs: 400,
      deliveryWorstMs: 1_400,
      loopDelayMeanMs: 1.5,
      loopDelayMaxMs: 12,
    });
    expect(made.logged('direct messages sent')).toHaveLength(1);
  });

  it('logs the numbers so far every minute while a burst lasts', async () => {
    const made = setup();
    for (let n = 0; n < 4; n++) made.sender.send(made.job(n));
    made.sender.pull();
    await made.turn();
    expect(made.logged('direct messages are going out')).toHaveLength(0);
    made.clock.now += 60_000;
    made.sender.pull();
    await made.turn();
    made.sender.pull();
    await made.turn();
    expect(made.logged('direct messages are going out')).toHaveLength(1);
    expect(made.logged('direct messages are going out')[0]).toMatchObject({ sent: 1, waiting: 3 });
    await pullUntilIdle(made.sender);
  });

  it('sends thousands without ever holding the event loop: one send per pull', async () => {
    const made = setup();
    const message = { content: 'A raid for **Yveltal** has been reported.' };
    let beats = 0;
    let beating = true;
    const beat = (): void => {
      beats += 1;
      if (beating) setImmediate(beat);
    };
    setImmediate(beat);
    for (let n = 0; n < 5_000; n++) {
      made.sender.send({
        userId: idOf(n),
        message,
        priority: DM_PRIORITY.normal,
        eventAt: NOW,
        expiresAt: NOW + 3_600_000,
      });
    }
    const pulls = await pullUntilIdle(made.sender);
    beating = false;
    expect(made.gateway.sent).toHaveLength(5_000);
    expect(new Set(made.gateway.sent.map((sent) => sent.userId)).size).toBe(5_000);
    // No pull started more than one send, and the event loop turned between all of them.
    expect(pulls).toBeGreaterThanOrEqual(5_000);
    expect(beats).toBeGreaterThanOrEqual(5_000);
    expect(made.gateway.most).toBeLessThanOrEqual(DM_CONCURRENCY);
    // Every job shares the one message: nothing was rendered or copied per member.
    expect(made.gateway.sent.every((sent) => sent.message === message)).toBe(true);
    expect(made.logged('direct messages sent')[0]).toMatchObject({ sent: 5_000, deepest: 5_000 });
  });

  it('drains at shutdown: what the time allows goes out, the rest is dropped and nothing new is taken', async () => {
    // With the real timer, at a thousand a second.
    const fast = setup({ ratePerSecond: 1_000 });
    const gateway = new FakeDmGateway();
    const { log, entries } = createTestLogger();
    const sender = new QueuedDmSender({
      gateway,
      log,
      ratePerSecond: 1_000,
      loopDelay: fast.loopDelay,
    });
    for (let n = 0; n < 20; n++)
      sender.send({ ...fast.job(n), eventAt: Date.now(), expiresAt: Date.now() + 60_000 });
    await sender.drain(5_000);
    expect(gateway.sent).toHaveLength(20);
    expect(
      entries.some((entry) => entry.msg === 'direct messages were still waiting at shutdown'),
    ).toBe(false);
    sender.send(fast.job(99));
    expect(sender.depth).toBe(0);

    // A line that is not pulled in time is dropped, and the sends on their way are waited for.
    const made = setup();
    made.gateway.hold = true;
    for (let n = 0; n < 10; n++) made.sender.send(made.job(n));
    made.sender.pull();
    made.sender.pull();
    const drained = made.sender.drain(20);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(made.sender.depth).toBe(0);
    expect(made.sender.sending).toBe(2);
    made.gateway.release();
    await drained;
    expect(made.gateway.sent).toHaveLength(2);
    expect(made.logged('direct messages were still waiting at shutdown')[0]).toMatchObject({
      abandoned: 8,
    });
    expect(made.sender.idle).toBe(true);
    expect(made.timer.stops).toBe(1);
  });

  it('goes on draining for a burst that began while it drained', async () => {
    const inner = new FakeDmGateway();
    const { log, entries } = createTestLogger();
    const later: DmJob = {
      userId: idOf(2),
      message: { content: 'later' },
      priority: DM_PRIORITY.normal,
      eventAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    };
    let again = false;
    // Puts one more message in line as soon as the sender is idle again: in the very turn in
    // which the burst ended, before `drain` has looked (so it waits by microtasks, and gives
    // up rather than hold the event loop should the burst never end).
    const whenIdle = async (): Promise<void> => {
      for (let hops = 0; !sender.idle; hops++) {
        if (hops > 10_000) throw new Error('the burst did not end');
        await Promise.resolve();
      }
      sender.send(later);
    };
    const sender: QueuedDmSender = new QueuedDmSender({
      gateway: {
        send: (userId, message) => {
          const sent = inner.send(userId, message);
          if (!again) {
            again = true;
            void sent.then(whenIdle);
          }
          return sent;
        },
      },
      log,
      ratePerSecond: 1_000,
      loopDelay: new FakeLoopDelay(),
    });
    sender.send({ ...later, userId: idOf(1), message: { content: 'first' } });
    await sender.drain(5_000);
    expect(inner.sent.map((sent) => sent.userId)).toEqual([idOf(1), idOf(2)]);
    expect(
      entries.some((entry) => entry.msg === 'direct messages were still waiting at shutdown'),
    ).toBe(false);
    expect(sender.idle).toBe(true);
  });

  it('does not wait at shutdown for a pause that outlasts the time there is', async () => {
    // Paused already when the draining begins.
    const made = setup();
    made.gateway.slow.add(idOf(1));
    for (let n = 1; n <= 3; n++) made.sender.send(made.job(n));
    made.sender.pull();
    await made.turn();
    let began = performance.now();
    await made.sender.drain(2_000);
    expect(performance.now() - began).toBeLessThan(1_000);
    expect(made.logged('direct messages were still waiting at shutdown')[0]).toMatchObject({
      abandoned: 2,
    });
    expect(made.sender.idle).toBe(true);

    // Told to slow down while it drains.
    const other = setup();
    other.gateway.slow.add(idOf(1));
    other.gateway.hold = true;
    for (let n = 1; n <= 3; n++) other.sender.send(other.job(n));
    other.sender.pull();
    began = performance.now();
    const drained = other.sender.drain(2_000);
    await other.turn();
    other.gateway.release();
    await drained;
    expect(performance.now() - began).toBeLessThan(1_000);
    expect(other.gateway.sent).toEqual([]);
    expect(other.sender.idle).toBe(true);

    // A pause that ends in time is waited out.
    const short = setup();
    short.gateway.slow.add(idOf(1));
    short.sender.send(short.job(1));
    short.sender.send(short.job(2));
    short.sender.pull();
    await short.turn();
    short.clock.now += DM_SLOW_DOWN_MS - 10;
    const waiting = short.sender.drain(100);
    await short.turn();
    short.clock.now += 10;
    short.sender.pull();
    await waiting;
    expect(short.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(2)]);
  });

  it('drains at once when nothing waits', async () => {
    const made = setup();
    await made.sender.drain(10_000);
    expect(made.sender.idle).toBe(true);
  });
});

describe('nodeLoopDelay', () => {
  it('measures the delay of the event loop between start and stop', async () => {
    const meter = nodeLoopDelay();
    expect(meter.read()).toEqual({ meanMs: 0, maxMs: 0 });
    meter.start();
    const until = Date.now() + 80;
    while (Date.now() < until) {
      // Hold the loop.
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
    const read = meter.read();
    meter.stop();
    expect(read.maxMs).toBeGreaterThan(20);
    expect(read.meanMs).toBeGreaterThan(0);
  });
});

describe('the fakes of direct messages', () => {
  it('FakeDmGateway is as strict as Discord about a message', async () => {
    const gateway = new FakeDmGateway();
    await expect(gateway.send(idOf(1), {})).rejects.toThrow('content or an embed');
    await expect(gateway.send(idOf(1), { embeds: [{ title: 'x'.repeat(257) }] })).rejects.toThrow(
      'embed title',
    );
    const row = { type: 1 as const, components: [] };
    await expect(
      gateway.send(idOf(1), { content: 'x', components: [row, row, row, row, row, row] }),
    ).rejects.toThrow('5 rows');
    await expect(
      gateway.send(idOf(1), { content: 'x', mention: { users: [idOf(1)] } }),
    ).rejects.toThrow('pings nobody');
    gateway.closed.add(idOf(2));
    expect(await gateway.send(idOf(2), { content: 'x' })).toBe('closed');
    expect(await gateway.send(idOf(1), { content: 'x' })).toBe('sent');
    expect(gateway.to(idOf(1))).toEqual([{ content: 'x' }]);
  });

  it('RecordingDms keeps what was put in line', () => {
    const dms = new RecordingDms();
    const job: DmJob = {
      userId: idOf(1),
      message: { content: 'x' },
      priority: DM_PRIORITY.urgent,
      eventAt: NOW,
      expiresAt: NOW + 1,
    };
    dms.send(job);
    dms.send({ ...job, userId: idOf(2) });
    dms.send(job);
    expect(dms.recipients).toEqual([idOf(1), idOf(2)]);
    expect(dms.to(idOf(1))).toHaveLength(2);
  });
});
```

Create `test/support/dms.ts`:

```ts
import type { DmGateway, DmOutcome } from '../../src/discord/dm-gateway.js';
import type { OutgoingMessage } from '../../src/discord/party-gateway.js';
import type {
  DmJob,
  DmSender,
  LoopDelayMeter,
  QueuedDmSender,
} from '../../src/services/dm-sender.js';
import { FakePartyGateway } from './fake-gateway.js';

/**
 * A `DmGateway` kept in memory. `sent` holds what went out, in order; a member of `closed`
 * takes no direct messages; a member of `slow` gets `slow-down`; `failing` makes every send reject. It is as strict as Discord about
 * what a message may hold (the rules of `FakePartyGateway`: content or an embed, the limits of
 * an embed, five rows of five controls), and a DM pings nobody: a message that names somebody
 * to ping is refused, because nothing that is sent as a DM should try.
 *
 * Like Discord it answers in a later turn of the event loop (`setImmediate`), so a test that
 * needs a fixed time fakes only `Date`. `most` is the largest number of sends that were on
 * their way at once.
 */
export class FakeDmGateway implements DmGateway {
  readonly sent: { userId: string; message: OutgoingMessage }[] = [];
  readonly closed = new Set<string>();
  /** A send to one of these is answered `slow-down`, as when Discord opens no more DM channels. */
  readonly slow = new Set<string>();
  /** Every member a send was started for, in order, whatever came of it. */
  readonly asked: string[] = [];
  failing: Error | undefined;
  /** Sends that wait here are answered only when a test calls `release()`. */
  hold = false;
  most = 0;
  private running = 0;
  private readonly held: (() => void)[] = [];

  /** Answers the sends that `hold` kept waiting. */
  release(): void {
    this.hold = false;
    for (const answer of this.held.splice(0)) answer();
  }

  send(userId: string, message: OutgoingMessage): Promise<DmOutcome> {
    this.asked.push(userId);
    this.running += 1;
    this.most = Math.max(this.most, this.running);
    return new Promise((resolve, reject) => {
      const answer = (): void => {
        this.running -= 1;
        try {
          if (this.failing) throw this.failing;
          FakePartyGateway.checkMessage(message);
          if (message.mention?.users?.length || message.mention?.roles?.length) {
            throw new Error('A direct message pings nobody');
          }
          if (this.slow.has(userId)) {
            resolve('slow-down');
            return;
          }
          if (this.closed.has(userId)) {
            resolve('closed');
            return;
          }
          this.sent.push({ userId, message });
          resolve('sent');
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      if (this.hold) this.held.push(answer);
      else setImmediate(answer);
    });
  }

  /** The messages that went to one member, oldest first. */
  to(userId: string): OutgoingMessage[] {
    return this.sent.filter((sent) => sent.userId === userId).map((sent) => sent.message);
  }
}

/** A `DmSender` that only keeps what was put in line, for tests of what puts it there. */
export class RecordingDms implements DmSender {
  readonly jobs: DmJob[] = [];

  send(job: DmJob): void {
    this.jobs.push(job);
  }

  /** The messages for one member, in the order they were put in line. */
  to(userId: string): OutgoingMessage[] {
    return this.jobs.filter((job) => job.userId === userId).map((job) => job.message);
  }

  /** The members that have a message in line, each once, in order. */
  get recipients(): string[] {
    return [...new Set(this.jobs.map((job) => job.userId))];
  }
}

/** A meter that measures nothing and says what a test sets. */
export class FakeLoopDelay implements LoopDelayMeter {
  running = false;
  starts = 0;
  measured = { meanMs: 0, maxMs: 0 };
  /** While set, reading the measurement throws. */
  failing: Error | undefined;
  start(): void {
    this.running = true;
    this.starts += 1;
  }
  read(): { meanMs: number; maxMs: number } {
    if (this.failing) throw this.failing;
    return this.measured;
  }
  stop(): void {
    this.running = false;
  }
}

/**
 * Pulls a sender whose timer a test holds (`startTimer`) until nothing waits and nothing is on
 * its way, giving the event loop back after every pull as the timer would. Gives the number of
 * pulls it took.
 */
export async function pullUntilIdle(sender: QueuedDmSender): Promise<number> {
  let pulls = 0;
  while (!sender.idle) {
    sender.pull();
    pulls += 1;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return pulls;
}
```

Apply to `test/support/fake-gateway.ts`:

```diff
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -191,7 +191,8 @@ export class FakePartyGateway implements PartyGateway {
     }
   }
 
-  private static checkMessage(message: OutgoingMessage): void {
+  /** Refuses a message that Discord would refuse (see the class comment). */
+  static checkMessage(message: OutgoingMessage): void {
     if ((message.content ?? '').length > 2000)
       throw new Error('A message has at most 2000 characters');
     if ((message.mention?.users?.length ?? 0) > 100)
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -12,6 +12,7 @@ import type { TrainService } from '../../src/services/train-service.js';
 import { FAKE_GUILD_ID } from './fake-interactions.js';
 import { catalogueFixture } from './game-data.js';
 import { FakeMemberDirectory } from './members.js';
+import { RecordingDms } from './dms.js';
 import { MemoryNewTrains } from './new-trains.js';
 import { noParties } from './parties.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
@@ -64,6 +65,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     newTrains: new MemoryNewTrains(),
     // Nobody is a member of any server; a test passes its own directory with members.
     members: new FakeMemberDirectory(),
+    // What is put in line is only recorded; a test passes its own to read it.
+    dms: new RecordingDms(),
     partyService: unavailable<PartyService>(
       'partyService',
       'pass { partyService, parties, regions } from partyServiceWith()',
```

Run: `npx vitest run --project unit src/discord/client.test.ts src/services/dm-sender.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -11,6 +11,7 @@ import type { IntentFlags } from './discord/intents.js';
 import type { MemberDirectory } from './discord/member-directory.js';
 import type { Logger } from './log.js';
 import type { AttendanceService } from './services/attendance-service.js';
+import type { DmSender } from './services/dm-sender.js';
 import type { GameDataProvider } from './services/game-data-service.js';
 import type { GymProvider } from './services/gym-directory.js';
 import type { PartyService } from './services/party-service.js';
@@ -66,6 +67,8 @@ export interface AppContext {
   readonly newTrains: NewTrainStorage;
   /** Members of a server other than the one who is acting: one by id, or who of many can see a channel. */
   readonly members: MemberDirectory;
+  /** Direct messages: put in line, and sent at a fixed rate. */
+  readonly dms: DmSender;
   /** Pokémon by what members type: names, nicknames, forms. */
   readonly pokemon: PokemonFinder;
   /** Map pictures of gyms and regions, as files to attach. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -22,6 +22,7 @@ import type { DB } from './db/types.js';
 import { ClickAnswers } from './discord/click-answers.js';
 import { createClient, loginWithFallback } from './discord/client.js';
 import { enabledCommands } from './discord/command.js';
+import { DiscordDmGateway } from './discord/dm-gateway.js';
 import { attachGatewayHandlers } from './discord/gateway-events.js';
 import { DiscordMemberDirectory } from './discord/member-directory.js';
 import { DiscordPartyGateway } from './discord/party-gateway.js';
@@ -31,6 +32,7 @@ import { formReader } from './domain/pogo/wants.js';
 import { createLogger, type Logger } from './log.js';
 import { AccessService } from './services/access-service.js';
 import { AttendanceService } from './services/attendance-service.js';
+import { QueuedDmSender } from './services/dm-sender.js';
 import { GameDataService } from './services/game-data-service.js';
 import { GymDirectory } from './services/gym-directory.js';
 import { ImageCache } from './services/image-cache.js';
@@ -56,6 +58,8 @@ const MINUTE_MS = 60_000;
 /** How long the party clock waits at start for the first read of the raid events. */
 const EVENTS_WAIT_MS = 15_000;
 const HOUR_MS = 60 * MINUTE_MS;
+/** How long direct messages that wait at shutdown are still sent. */
+const DM_DRAIN_MS = 10_000;
 
 export interface StartOptions {
   /** Called when the gateway closes for good; receives the shutdown to run before exiting. */
@@ -108,6 +112,8 @@ export async function startApp(
   const parties = new PartyStore({ storage: new PartyRepository(db), log });
   const partyGateway = new DiscordPartyGateway();
   const members = new DiscordMemberDirectory({ log });
+  const dmGateway = new DiscordDmGateway();
+  const dms = new QueuedDmSender({ gateway: dmGateway, log });
   // Listens to the store: whoever signs up for a party in a forum they cannot see is let in.
   const access = new AccessService({
     store: parties,
@@ -244,6 +250,7 @@ export async function startApp(
     gymTargets: new GymNotificationRepository(db),
     newTrains: new NewTrainRepository(db),
     members,
+    dms,
     pokemon,
     maps,
     features: requested,
@@ -262,6 +269,7 @@ export async function startApp(
     configure(client) {
       partyGateway.use(client);
       members.use(client);
+      dmGateway.use(client);
       client.once(Events.ClientReady, (ready) => {
         log.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'connected to Discord');
         void syncGuilds(guilds, [...ready.guilds.cache.keys()], log);
@@ -340,6 +348,8 @@ export async function startApp(
       { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
       { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
       { name: 'forum access', timeoutMs: 5_000, run: () => access.flush() },
+      // Direct messages go on at their usual rate for ten seconds (spec 9); the rest is dropped.
+      { name: 'direct messages', timeoutMs: 15_000, run: () => dms.drain(DM_DRAIN_MS) },
       { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
       // A write in flight must finish before the pool closes.
       { name: 'parties', timeoutMs: 5_000, run: () => parties.whenIdle() },
```

Apply to `src/discord/client.ts`:

```diff
--- a/src/discord/client.ts
+++ b/src/discord/client.ts
@@ -1,4 +1,11 @@
-import { Client, Partials, type GatewayIntentBits, type RateLimitData } from 'discord.js';
+import {
+  Client,
+  Options,
+  Partials,
+  type CacheFactory,
+  type GatewayIntentBits,
+  type RateLimitData,
+} from 'discord.js';
 import type { Logger } from '../log.js';
 import {
   fallbackCandidates,
@@ -31,10 +38,52 @@ export function rejectsLongChannelPatchWait(
   );
 }
 
+/**
+ * As many members of one server as the client keeps. Without the GuildMembers intent a member
+ * comes into the cache only when they use the bot or are looked up (`MemberDirectory`), and is
+ * never removed or kept current by Discord; the batch look-ups of plan 4B would let the cache
+ * grow to everybody who was ever asked about. Nothing needs a member to stay: whoever is not
+ * cached is asked for. The oldest go first; the bot's own member always stays (permission
+ * checks read it).
+ */
+export const MEMBER_CACHE_SIZE = 2_000;
+
+/**
+ * What the client keeps in memory, where the defaults of discord.js would grow without bound
+ * for this bot.
+ *
+ * - **Messages of DM channels: none.** A sent message is put into the message cache of its
+ *   channel (`TextBasedChannel.send`), up to 200 per channel by default, embed included; a bot
+ *   that sends direct messages for months would keep the last 200 of every member. Nothing
+ *   reads a message from a cache (posts and messages are edited and deleted by id), and the
+ *   message of a pressed button comes with the interaction. discord.js looks a limit up by the
+ *   name of the manager's class, so `DMMessageManager` limits DM channels alone.
+ * - **Messages of server channels: the default, 200 per channel.** That is bounded by the
+ *   number of channels; the posts of ended parties are archived threads, which the default
+ *   thread sweeper of discord.js removes from the cache four hours after their archiving,
+ *   messages and all.
+ * - **Members: `MEMBER_CACHE_SIZE` per server.**
+ *
+ * DM channels and users stay cached without a limit: each is small, there is one per member
+ * who ever got a direct message, and a cached channel makes the next message one request
+ * instead of two.
+ */
+export function cacheFactory(): CacheFactory {
+  return Options.cacheWithLimits({
+    ...Options.DefaultMakeCacheSettings,
+    DMMessageManager: 0,
+    GuildMemberManager: {
+      maxSize: MEMBER_CACHE_SIZE,
+      keepOverLimit: (member) => member.id === member.client.user.id,
+    },
+  });
+}
+
 export function createClient(intents: GatewayIntentBits[]): Client {
   return new Client({
     intents,
     partials: [Partials.Channel],
+    makeCache: cacheFactory(),
     // Mentions are off unless a send opts in with its own allowedMentions.
     allowedMentions: { parse: [] },
     rest: { rejectOnRateLimit: rejectsLongChannelPatchWait },
```

Create `src/discord/dm-gateway.ts`:

```ts
import { ChannelType, DiscordAPIError, RESTJSONErrorCodes, type Client } from 'discord.js';
import { discordPayload, type OutgoingMessage } from './party-gateway.js';

/**
 * What became of a direct message: `sent` when it went out; `closed` when Discord says this
 * member cannot be written to (they take no direct messages from the server's members, they
 * blocked the bot, they share no server with it any more, or the account is gone); `slow-down`
 * when Discord refused to open another DM channel because the bot opened too many too fast
 * (error 40003): the message did not go out, and whoever sends should pause.
 */
export type DmOutcome = 'sent' | 'closed' | 'slow-down';

/**
 * The one thing direct messages ask of Discord, so that the sender can be tested without it:
 * send this message to this user. Throws for any failure that `DmOutcome` does not name.
 */
export interface DmGateway {
  send(userId: string, message: OutgoingMessage): Promise<DmOutcome>;
}

/** Discord's answers that mean "nobody can write to this member", which no retry changes. */
const CLOSED: ReadonlySet<number | string> = new Set([
  RESTJSONErrorCodes.CannotSendMessagesToThisUser,
  RESTJSONErrorCodes.CannotSendMessagesToThisUserDueToHavingNoMutualGuilds,
  RESTJSONErrorCodes.UnknownUser,
]);

/** Whether Discord refused a direct message because the member takes none (50007 and its kin). */
export function isClosedDm(err: unknown): boolean {
  return err instanceof DiscordAPIError && CLOSED.has(err.code);
}

/** Whether Discord refused to open a DM channel because too many were opened too fast (40003). */
export function isSlowDown(err: unknown): boolean {
  return (
    err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.OpeningDirectMessagesTooFast
  );
}

/**
 * As many members as the gateway remembers the DM channel of; the one remembered longest goes
 * first. A forgotten one only costs the look-up again.
 */
const KNOWN_CHANNELS = 10_000;

/**
 * The gateway over a discord.js client: thin, and without unit tests like the party gateway
 * (the staging run is its test). The client is handed over once it exists; anything asked
 * before that fails.
 *
 * The first message to a member opens their DM channel (`users.createDM`: one REST call, `POST
 * /users/@me/channels`, unless the client has the channel cached) and sends into it (a second
 * call). The channel and its recipient stay cached, so a member's next message is one call; the
 * message itself is not kept (`createClient` gives the message cache of DM channels a limit of
 * zero). discord.js finds a member's cached channel by going through every cached channel
 * (`UserManager.dmChannel`), which with thousands of DM channels would be a walk per message:
 * so the id of a member's channel is remembered here and the channel taken from the cache by
 * id; only a member's first message of a run walks. A send through a remembered channel that
 * fails forgets it, whatever the failure was: the member's next message asks for their channel
 * anew. A 429 is waited out by discord.js itself: nothing here tries again.
 */
export class DiscordDmGateway implements DmGateway {
  private current: Client | undefined;
  /** The DM channel of a member, by user id (see the class comment). */
  private readonly channels = new Map<string, string>();

  /** The client to talk through from now on. */
  use(client: Client): void {
    this.current = client;
  }

  async send(userId: string, message: OutgoingMessage): Promise<DmOutcome> {
    const client = this.current;
    if (!client) throw new Error('Discord is not connected yet');
    const known = this.channels.get(userId);
    try {
      const cached = known === undefined ? undefined : client.channels.cache.get(known);
      const channel =
        cached?.type === ChannelType.DM ? cached : await client.users.createDM(userId);
      this.remember(userId, channel.id);
      await channel.send(discordPayload(message));
      return 'sent';
    } catch (err) {
      // Forgotten before the failure is looked at: whatever it was, the remembered channel is
      // not trusted for the next message (a member who cannot be written to keeps none).
      if (known !== undefined) this.channels.delete(userId);
      if (isClosedDm(err)) return 'closed';
      if (isSlowDown(err)) return 'slow-down';
      throw err;
    }
  }

  private remember(userId: string, channelId: string): void {
    if (this.channels.get(userId) === channelId) return;
    this.channels.delete(userId);
    while (this.channels.size >= KNOWN_CHANNELS) {
      // Oldest first: a Map keeps the order in which entries were added.
      const oldest = this.channels.keys().next();
      if (oldest.done) break;
      this.channels.delete(oldest.value);
    }
    this.channels.set(userId, channelId);
  }
}
```

Apply to `src/discord/party-gateway.ts`:

```diff
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -225,7 +225,8 @@ export function rateLimitWaitMs(err: unknown): number | undefined {
     : undefined;
 }
 
-function payload(message: OutgoingMessage) {
+/** A message as discord.js sends it: nobody is pinged but whom `mention` names. */
+export function discordPayload(message: OutgoingMessage) {
   return {
     content: message.content ?? '',
     embeds: message.embeds ?? [],
@@ -331,7 +332,7 @@ export class DiscordPartyGateway implements PartyGateway {
       forum.threads.create({
         name: post.title,
         autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
-        message: payload(post.message),
+        message: discordPayload(post.message),
         appliedTags: [...post.tagIds],
       }),
     );
@@ -362,7 +363,7 @@ export class DiscordPartyGateway implements PartyGateway {
     // The first message of a forum post has the id of the post.
     return this.done(async () => {
       await this.reopen(post);
-      await post.messages.edit(postId, payload(message));
+      await post.messages.edit(postId, discordPayload(message));
     });
   }
 
@@ -442,7 +443,7 @@ export class DiscordPartyGateway implements PartyGateway {
   async sendMessage(channelId: string, message: OutgoingMessage): Promise<string | undefined> {
     const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
     if (!channel?.isSendable()) return undefined;
-    return this.unlessGone(async () => (await channel.send(payload(message))).id);
+    return this.unlessGone(async () => (await channel.send(discordPayload(message))).id);
   }
 
   async editMessage(
@@ -454,7 +455,7 @@ export class DiscordPartyGateway implements PartyGateway {
     if (!channel?.isTextBased()) return false;
     return this.done(async () => {
       if (channel.isThread()) await this.reopen(channel);
-      await channel.messages.edit(messageId, payload(message));
+      await channel.messages.edit(messageId, discordPayload(message));
     });
   }
 
@@ -511,7 +512,10 @@ export class DiscordPartyGateway implements PartyGateway {
     if (!forum) return false;
     // Somebody whose role may not write in this forum (a muted member, a forum for reading
     // only) is let in to read: a member's own overwrite would beat what the role says.
-    const member = forum.guild.members.cache.get(memberId);
+    // Asked of Discord afresh (`fresh`), never answered from the cache: the cache keeps a
+    // limited number of members as their last interaction left them, so a member who was
+    // muted since would be let in to write, and so would one who is not in it.
+    const member = await fetchGuildMember(forum.guild, memberId, true);
     const muted =
       member !== undefined &&
       DiscordPartyGateway.roleDenies(
```

Create `src/services/dm-sender.ts`:

```ts
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { DmGateway, DmOutcome } from '../discord/dm-gateway.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import type { Logger } from '../log.js';

/**
 * How urgent a direct message is (Matt, 2026-10-12). `urgent` is for what a member is waiting
 * on in a party they are in (a meeting time, the boss of their egg); `spawn` for a wild Pokémon,
 * which is gone in half an hour; `normal` for the other news they asked for (a raid for a want
 * or at a gym, a new train). Everything of one priority goes out before anything of the next.
 */
export const DM_PRIORITY = { urgent: 0, spawn: 1, normal: 2 } as const;
export type DmPriority = (typeof DM_PRIORITY)[keyof typeof DM_PRIORITY];
const PRIORITIES: readonly DmPriority[] = [
  DM_PRIORITY.urgent,
  DM_PRIORITY.spawn,
  DM_PRIORITY.normal,
];

/** One direct message to one member. */
export interface DmJob {
  /** Snowflake of the member. */
  userId: string;
  /**
   * The message, built by the caller once per event: the sender renders nothing, and the jobs
   * of one event may share the object.
   */
  message: OutgoingMessage;
  priority: DmPriority;
  /** When what the message is about happened (epoch ms): delivery time is measured from it. */
  eventAt: number;
  /** From when on the message is not worth sending any more (epoch ms): it is dropped then. */
  expiresAt: number;
}

/**
 * Sends direct messages (`ctx.dms`). `send` only puts the message in line: it never waits for
 * Discord and never throws, and nobody learns what became of one message (the numbers of a
 * burst are logged). A second bot token could implement this later; none is built.
 */
export interface DmSender {
  send(job: DmJob): void;
}

/** The delay of the event loop while a burst went out, behind an interface so a test can fake it. */
export interface LoopDelayMeter {
  /** Starts measuring from nothing. */
  start(): void;
  /** What was measured since `start`, in milliseconds; zeros when nothing was. */
  read(): { meanMs: number; maxMs: number };
  stop(): void;
}

/** The meter over `monitorEventLoopDelay` of `node:perf_hooks`. */
export function nodeLoopDelay(): LoopDelayMeter {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  // The histogram counts nanoseconds, and holds NaN and such while it has no samples.
  const ms = (nanoseconds: number): number =>
    Number.isFinite(nanoseconds) ? Math.round(nanoseconds / 1e4) / 100 : 0;
  return {
    start() {
      histogram.reset();
      histogram.enable();
    },
    read: () =>
      histogram.count === 0
        ? { meanMs: 0, maxMs: 0 }
        : { meanMs: ms(histogram.mean), maxMs: ms(histogram.max) },
    stop() {
      histogram.disable();
    },
  };
}

/**
 * How many direct messages are started in a second: the starting value (Matt, 2026-10-12).
 * Discord's global limit for a bot is 50 requests a second, and a first message to a member is
 * two requests; this leaves the rest to the posts, the answers and the lookups.
 */
export const DM_RATE_PER_SECOND = 10;
/** As many sends as may be on their way at once (spec 6.4: "concurrency ~5"). */
export const DM_CONCURRENCY = 5;
/**
 * As many messages as may wait. At ten a second that is over a quarter of an hour of sending,
 * more than most messages are worth waiting for; beyond it the least urgent, oldest goes.
 */
export const DM_MAX_DEPTH = 10_000;
/**
 * How long nothing is started after Discord refused to open another DM channel
 * (`slow-down`): it limits how fast a bot may write to members it has not written to before,
 * and says neither the limit nor how long to wait.
 */
export const DM_SLOW_DOWN_MS = 60_000;
/** While a burst lasts, its numbers so far are logged this often. */
const REPORT_EVERY_MS = 60_000;
/** As many expired messages as one pull drops before it gives the event loop back. */
const EXPIRED_PER_PULL = 200;
/** As many delivery times as are kept for the median of a burst; the worst is kept apart. */
const MAX_SAMPLES = 10_000;
/** As many failed sends of a burst as are logged one by one; the rest are only counted. */
const FAILURES_LOGGED = 5;

export interface QueuedDmSenderOptions {
  gateway: DmGateway;
  log: Logger;
  now?: () => number;
  ratePerSecond?: number;
  concurrency?: number;
  maxDepth?: number;
  reportEveryMs?: number;
  loopDelay?: LoopDelayMeter;
  /**
   * Starts the timer that pulls the queue every `ms` and gives the function that stops it.
   * Default: `setInterval`, unref'd. A test passes its own and calls `pull()` by hand.
   */
  startTimer?: (run: () => void, ms: number) => () => void;
}

/** A queue of one priority: appended at the end, taken from the head, oldest event first. */
class Line {
  private jobs: DmJob[] = [];
  private head = 0;

  get size(): number {
    return this.jobs.length - this.head;
  }

  peek(): DmJob | undefined {
    return this.jobs[this.head];
  }

  take(): DmJob | undefined {
    const job = this.jobs[this.head];
    if (job === undefined) return undefined;
    this.head += 1;
    // The part that was taken is cut off now and then, so that taking stays cheap.
    if (this.head >= 1_024 && this.head * 2 >= this.jobs.length) {
      this.jobs = this.jobs.slice(this.head);
      this.head = 0;
    }
    return job;
  }

  /** Puts a job where its event belongs: behind every job whose event is not newer. */
  put(job: DmJob): void {
    const last = this.jobs.at(-1);
    if (this.size === 0 || last === undefined || last.eventAt <= job.eventAt) {
      this.jobs.push(job);
      return;
    }
    let low = this.head;
    let high = this.jobs.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((this.jobs[middle]?.eventAt ?? 0) <= job.eventAt) low = middle + 1;
      else high = middle;
    }
    this.jobs.splice(low, 0, job);
  }

  clear(): number {
    const dropped = this.size;
    this.jobs = [];
    this.head = 0;
    return dropped;
  }
}

/** The numbers of a burst: from the first message put in line until the line ran empty. */
interface Burst {
  startedAt: number;
  queued: number;
  sent: number;
  closed: number;
  failed: number;
  /** Of the failed: those Discord answered with "slow down". */
  slowedDown: number;
  saidSlow: boolean;
  expired: number;
  overflowed: number;
  deepest: number;
  samples: number[];
  worstMs: number;
  saidFull: boolean;
  reportedAt: number;
}

/**
 * The sender on the bot's own client: a queue on the main thread, pulled by a timer.
 *
 * `send` puts a job in line and returns. Every `1000 / ratePerSecond` milliseconds the timer
 * starts at most one send, the most urgent first and within one priority the oldest event
 * first, unless `concurrency` sends are still on their way: so no more than the rate goes out
 * however long the line is, and nothing here ever loops over a line of recipients. (The legacy
 * bot once lost its gateway connection sending a popular want in one go on the main thread.)
 * A message whose time has passed (`expiresAt`) is dropped when its turn comes. A line longer
 * than `maxDepth` loses its least urgent, oldest message, which is said once per burst. A send
 * that fails is logged and dropped: discord.js has waited out a rate limit by then, and
 * nothing is tried twice. When Discord refuses to open more DM channels (`slow-down`) that
 * message is dropped too and nothing is started for `DM_SLOW_DOWN_MS`; what waits meanwhile
 * expires by itself when its time passes.
 *
 * A burst is the time from the first message in an empty line until the line is empty and
 * nothing is on its way. When it ends, and every minute while it lasts, one line is logged
 * with what the measurements for a second token need: how many were sent, closed (the member
 * takes no direct messages), failed and dropped, the deepest line, the time from event to
 * delivery (median and worst) and the delay of the event loop.
 */
export class QueuedDmSender implements DmSender {
  private readonly lines = new Map<DmPriority, Line>(
    PRIORITIES.map((priority) => [priority, new Line()]),
  );
  private readonly now: () => number;
  private readonly concurrency: number;
  private readonly maxDepth: number;
  private readonly intervalMs: number;
  private readonly reportEveryMs: number;
  private readonly loopDelay: LoopDelayMeter;
  private readonly startTimer: (run: () => void, ms: number) => () => void;
  private stopTimer: (() => void) | undefined;
  private burst: Burst | undefined;
  private readonly onTheirWay = new Set<Promise<void>>();
  /** Resolved when the burst that is running ends; `drain` waits for it. */
  private ended: { promise: Promise<void>; resolve: () => void } | undefined;
  private closed = false;
  /** Until when nothing is started, after Discord said to slow down. */
  private pausedUntil = 0;
  /** Set while `drain` waits: called when a pause begins, so that it looks again. */
  private onPause: (() => void) | undefined;

  constructor(private readonly options: QueuedDmSenderOptions) {
    this.now = options.now ?? (() => Date.now());
    this.concurrency = options.concurrency ?? DM_CONCURRENCY;
    this.maxDepth = options.maxDepth ?? DM_MAX_DEPTH;
    this.intervalMs = Math.max(
      1,
      Math.round(1_000 / (options.ratePerSecond ?? DM_RATE_PER_SECOND)),
    );
    this.reportEveryMs = options.reportEveryMs ?? REPORT_EVERY_MS;
    this.loopDelay = options.loopDelay ?? nodeLoopDelay();
    this.startTimer =
      options.startTimer ??
      ((run, ms) => {
        const timer = setInterval(run, ms);
        timer.unref();
        return () => {
          clearInterval(timer);
        };
      });
  }

  /** How many messages wait. */
  get depth(): number {
    let depth = 0;
    for (const line of this.lines.values()) depth += line.size;
    return depth;
  }

  /** How many sends are on their way. */
  get sending(): number {
    return this.onTheirWay.size;
  }

  /** Whether nothing waits and nothing is on its way. */
  get idle(): boolean {
    return this.burst === undefined;
  }

  send(job: DmJob): void {
    try {
      this.enqueue(job);
    } catch (err) {
      this.options.log.error({ err }, 'could not put a direct message in line');
    }
  }

  private enqueue(job: DmJob): void {
    // After `drain` the client is about to go: nothing new is taken.
    if (this.closed) return;
    const burst = this.burst ?? this.begin();
    const line = this.lines.get(job.priority) ?? this.lines.get(DM_PRIORITY.normal);
    if (!line) return;
    line.put(job);
    burst.queued += 1;
    if (this.depth > this.maxDepth) this.overflow(burst);
    burst.deepest = Math.max(burst.deepest, this.depth);
  }

  /** Drops the least urgent, oldest message of a line that is too long. */
  private overflow(burst: Burst): void {
    for (const priority of [...PRIORITIES].reverse()) {
      if (this.lines.get(priority)?.take() === undefined) continue;
      burst.overflowed += 1;
      if (!burst.saidFull) {
        burst.saidFull = true;
        this.options.log.warn(
          { depth: this.depth, maxDepth: this.maxDepth },
          'the line of direct messages is full; the least urgent, oldest are dropped',
        );
      }
      return;
    }
  }

  private begin(): Burst {
    const now = this.now();
    this.burst = {
      startedAt: now,
      queued: 0,
      sent: 0,
      closed: 0,
      failed: 0,
      slowedDown: 0,
      saidSlow: false,
      expired: 0,
      overflowed: 0,
      deepest: 0,
      samples: [],
      worstMs: 0,
      saidFull: false,
      reportedAt: now,
    };
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    this.ended = { promise, resolve };
    this.loopDelay.start();
    this.stopTimer = this.startTimer(() => {
      this.pull();
    }, this.intervalMs);
    return this.burst;
  }

  /** The numbers of the burst so far, as they are logged. */
  private numbers(burst: Burst) {
    const sorted = [...burst.samples].sort((a, b) => a - b);
    const loop = this.loopDelay.read();
    return {
      queued: burst.queued,
      sent: burst.sent,
      closed: burst.closed,
      failed: burst.failed,
      slowedDown: burst.slowedDown,
      expired: burst.expired,
      overflowed: burst.overflowed,
      waiting: this.depth,
      deepest: burst.deepest,
      tookMs: this.now() - burst.startedAt,
      deliveryMedianMs: sorted[sorted.length >> 1] ?? 0,
      deliveryWorstMs: burst.worstMs,
      loopDelayMeanMs: loop.meanMs,
      loopDelayMaxMs: loop.maxMs,
    };
  }

  private finish(): void {
    const burst = this.burst;
    if (!burst || this.depth > 0 || this.onTheirWay.size > 0) return;
    const { log } = this.options;
    // Whatever fails here, the burst ends: `drain` waits for it, and the timer must stop.
    try {
      log.info(this.numbers(burst), 'direct messages sent');
    } catch (err) {
      log.error({ err }, 'could not log the numbers of a burst of direct messages');
    }
    this.burst = undefined;
    const ended = this.ended;
    this.ended = undefined;
    try {
      this.stopTimer?.();
      this.loopDelay.stop();
    } catch (err) {
      log.error({ err }, 'could not stop the timer of the direct messages');
    }
    this.stopTimer = undefined;
    ended?.resolve();
  }

  /** `finish` for where nothing may be thrown: the end of a pull, and of a send. */
  private finishSafely(): void {
    try {
      this.finish();
    } catch (err) {
      this.options.log.error({ err }, 'could not end a burst of direct messages');
    }
  }

  /** The next message that is still worth sending, the most urgent first; the expired go. */
  private next(burst: Burst, now: number): DmJob | undefined {
    let dropped = 0;
    for (const priority of PRIORITIES) {
      const line = this.lines.get(priority);
      for (let job = line?.take(); job !== undefined; job = line?.take()) {
        if (job.expiresAt > now) return job;
        burst.expired += 1;
        dropped += 1;
        // A long line of stale messages is not walked in one turn: the next pull goes on.
        if (dropped >= EXPIRED_PER_PULL) return undefined;
      }
    }
    return undefined;
  }

  /**
   * One turn of the timer: starts at most one send, when fewer than `concurrency` are on
   * their way. Never throws. A test with its own timer calls this.
   */
  pull(): void {
    const burst = this.burst;
    if (!burst) return;
    try {
      const now = this.now();
      if (now - burst.reportedAt >= this.reportEveryMs) {
        burst.reportedAt = now;
        this.options.log.info(this.numbers(burst), 'direct messages are going out');
      }
      if (now >= this.pausedUntil && this.onTheirWay.size < this.concurrency) {
        const job = this.next(burst, now);
        if (job) this.start(burst, job);
      }
    } catch (err) {
      this.options.log.error({ err }, 'the line of direct messages failed');
    }
    this.finishSafely();
  }

  private start(burst: Burst, job: DmJob): void {
    const { gateway, log } = this.options;
    // Started in this very turn: the pull that took the job is the pull that sends it.
    let asked: Promise<DmOutcome>;
    try {
      asked = gateway.send(job.userId, job.message);
    } catch (err) {
      asked = Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    const sending: Promise<void> = asked
      .then((outcome) => {
        if (outcome === 'closed') {
          burst.closed += 1;
          log.debug({ user: job.userId }, 'a member takes no direct messages');
          return;
        }
        if (outcome === 'slow-down') {
          // Dropped like a failure, and not tried again: what waits has its own time to expire.
          burst.failed += 1;
          burst.slowedDown += 1;
          this.pausedUntil = this.now() + DM_SLOW_DOWN_MS;
          this.onPause?.();
          if (!burst.saidSlow) {
            burst.saidSlow = true;
            log.warn(
              { user: job.userId, pauseMs: DM_SLOW_DOWN_MS, waiting: this.depth },
              'Discord says to slow down with direct messages; pausing',
            );
          }
          return;
        }
        burst.sent += 1;
        const took = Math.max(0, this.now() - job.eventAt);
        burst.worstMs = Math.max(burst.worstMs, took);
        if (burst.samples.length < MAX_SAMPLES) burst.samples.push(took);
      })
      .catch((err: unknown) => {
        burst.failed += 1;
        if (burst.failed <= FAILURES_LOGGED) {
          log.warn({ err, user: job.userId }, 'could not send a direct message');
        }
      })
      .finally(() => {
        this.onTheirWay.delete(sending);
        // Nothing may be thrown here: nobody waits for this promise but `drain`.
        this.finishSafely();
      });
    this.onTheirWay.add(sending);
  }

  /**
   * For shutdown: goes on sending at the usual rate for `maxMs` at most, also for a burst that
   * begins meanwhile, then drops what still waits (how many is logged) and waits for the sends
   * that are on their way. Nothing is taken from then on. While Discord's "slow down" pauses
   * the line for longer than the time that is left, nothing more would go out: it does not wait
   * for that.
   */
  async drain(maxMs: number): Promise<void> {
    // The time of the timer below, not `now`: a test's clock may stand still.
    const until = performance.now() + maxMs;
    for (let left = maxMs; this.ended && left > 0; left = until - performance.now()) {
      if (this.pausedUntil - this.now() >= left) break;
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        this.ended.promise,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, left);
        }),
        new Promise<void>((resolve) => {
          this.onPause = resolve;
        }),
      ]);
      clearTimeout(timer);
    }
    this.onPause = undefined;
    this.closed = true;
    let abandoned = 0;
    for (const line of this.lines.values()) abandoned += line.clear();
    if (abandoned > 0) {
      this.options.log.warn({ abandoned }, 'direct messages were still waiting at shutdown');
    }
    await Promise.all(this.onTheirWay);
    this.finishSafely();
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/discord/client.test.ts src/services/dm-sender.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 4ae9f44 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/app-context.ts src/app.ts src/discord/client.test.ts src/discord/client.ts src/discord/dm-gateway.ts src/discord/party-gateway.ts src/services/dm-sender.test.ts src/services/dm-sender.ts test/support/dms.ts test/support/fake-gateway.ts test/support/test-context.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/app.ts src/discord/client.test.ts src/discord/client.ts src/discord/dm-gateway.ts src/discord/party-gateway.ts src/services/dm-sender.test.ts src/services/dm-sender.ts test/support/dms.ts test/support/fake-gateway.ts test/support/test-context.ts
git commit -m "DmSender: a line of direct messages pulled by a timer, measured, drained at shutdown" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 3,078 unit tests.

---

### Task 5: NotifyService: raids told to who wants them, once per reason, never to who caused it

**Files:**
- Create: `src/commands/notify-paths.test.ts`, `src/domain/notify/reasons.test.ts`, `src/domain/notify/reasons.ts`, `src/render/notify-dm.test.ts`, `src/render/notify-dm.ts`, `src/services/notify-service.test.ts`, `src/services/notify-service.ts`
- Modify: `src/app.ts`, `src/commands/notifications/want-input.ts`, `src/db/repositories/guild-repository.db.test.ts`, `src/db/repositories/guild-repository.ts`, `src/domain/pogo/wants.ts`, `src/services/party-scheduler.ts`, `src/services/party-service.ts`, `src/services/raid-change-service.ts`, `test/support/members.ts`, `test/support/party-service.ts`

**Interfaces:**
- Consumes: Tasks 2 to 4; `pokemonWantFits` and the wants of plan 4A; `PartyService` (`report`, `relocateNow`), `RaidChangeService.apply`, `PartyScheduler.tickParty`, `PartyStore.onChange`; `renderRaidPost`; `partyServiceWith()`.
- Produces: `src/domain/notify/reasons.ts` (pure): `NotifyReason`, `reasonKey`, `raidNumbers`, `raidWantsFiring`, `spawnNumbers`, `spawnWantsFiring`, `bossId`; `src/render/notify-dm.ts`: `notifyDm`, `raidDmSentence`, `reasonLine`, `postLink`; `src/services/notify-service.ts`: the interface `PartyNotifier` (`raidReported`, `raidChanged(before, after, actorId)`, `raidMoving`, `raidMoved`, …; every method returns at once and never throws) and `NotifyService` (`flush()`, `close()`), which the party services are given (`PartyService.announceTo`); the memory of what was told, per party; `partyServiceWith()` builds a notifier (`notify`, `dms`).

The DMs of this task have no buttons yet (Task 6) and only raids are announced (Task 7 adds trains, boss-set and meeting times; a few types and sentences they need are already here).

Reference commit of the prototype for this task: `81dfa11`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/notify-paths.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeButton,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, asRaid, BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import { components } from '../components/index.js';
import { InteractionRouter } from '../discord/router.js';
import { pokemonTarget, type NotificationTarget } from '../domain/pogo/notification-target.js';
import { commands } from './index.js';

const T5: NotificationTarget = { kind: 'tier', tier: { level: 'T5', shadow: false } };
const YVELTAL = pokemonTarget(717);

/**
 * The commands as the bot runs them, over the services of `partyServiceWith`: every way a
 * member causes something members are told about, to see that the member who did it is the one
 * who is left out.
 */
async function setup(overrides: Parameters<typeof partyServiceWith>[1] = {}) {
  const made = await partyServiceWith([], overrides);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
    wants: made.wants,
    gymTargets: made.gymTargets,
  });
  const router = new InteractionRouter(ctx, commands, components);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  /** A command used in the channel of West. */
  const inRegion = (userId: string, commandName: string, options: Record<string, string>) =>
    handle(
      fakeChatInput({ commandName, channelId: WEST_CHANNEL, userId, displayName: userId, options }),
    );
  /** A command used in the post of a party. */
  const inPost = (
    userId: string,
    postId: string,
    forumId: string,
    commandName: string,
    options: Record<string, string>,
  ) =>
    handle(
      fakeChatInput({
        commandName,
        channelId: postId,
        thread: { parentId: forumId },
        userId,
        displayName: userId,
        options,
      }),
    );
  /** Whoever was told since the last call, in order. */
  let read = 0;
  const told = async (): Promise<string[]> => {
    await made.notify.flush();
    const fresh = made.dms.jobs.slice(read).map((job) => job.userId);
    read = made.dms.jobs.length;
    return fresh;
  };
  /** Everybody in `ids` wants this. */
  const want = async (target: NotificationTarget, ...ids: string[]) => {
    for (const id of ids) await made.wants.set(id, made.gateway.guildId, target, 'raid');
  };
  const target = async (gymId: number, ...ids: string[]) => {
    for (const id of ids) await made.gymTargets.add(id, made.gateway.guildId, gymId);
  };
  /** The one raid, as it is stored. */
  const raid = () => asRaid(made.store.active()[0]);
  return { ...made, ctx, handle, inRegion, inPost, told, want, target, raid };
}

describe('who is told, and who is left out, by every way a member causes it', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('`/raid`: not the reporter', async () => {
    const made = await setup();
    await made.want(T5, ALICE, BOB);
    await made.inRegion(ALICE, 'raid', { boss: 'e:T5:0', gym: 'g:1' });
    expect(made.raid().createdById).toBe(ALICE);
    expect(await made.told()).toEqual([BOB]);
  });

  it('`/raid` answers as ever when the notifier cannot even begin', async () => {
    const made = await setup({
      notifying: {
        raidBosses: {
          bosses: () => {
            throw new Error('the boss list is broken');
          },
        },
      },
    });
    await made.want(T5, BOB);
    const used = await made.inRegion(ALICE, 'raid', { boss: 'e:T5:0', gym: 'g:1' });
    const postId = made.raid().forumPostId ?? '';
    expect(JSON.stringify(sent(used.editReply))).toContain(postId);
    expect(await made.told()).toEqual([]);
    expect(made.entries.some((entry) => entry.msg === 'could not tell members of an event')).toBe(
      true,
    );
  });

  it('`/boss`: not whoever set it', async () => {
    const made = await setup();
    await made.inRegion(CAROL, 'raid', { boss: 'e:T5:0', gym: 'g:1' });
    await made.told();
    await made.want(YVELTAL, ALICE, BOB);
    const postId = made.raid().forumPostId ?? '';
    await made.inPost(ALICE, postId, WEST_FORUM, 'boss', { pokemon: 'b:yveltal:T5:0' });
    expect(made.raid().raid.boss).toEqual({ key: 'yveltal' });
    expect(await made.told()).toEqual([BOB]);
  });

  it('`/location` within the region: not whoever moved it', async () => {
    const made = await setup();
    await made.inRegion(CAROL, 'raid', { boss: 'e:T5:0', gym: 'g:1' });
    await made.told();
    await made.target(2, ALICE, BOB);
    const postId = made.raid().forumPostId ?? '';
    await made.inPost(ALICE, postId, WEST_FORUM, 'location', { gym: 'g:2' });
    expect(made.raid().gymId).toBe(2);
    expect(await made.told()).toEqual([BOB]);
  });

  it('`/location` into another region: not whoever moved it', async () => {
    const made = await setup();
    await made.inRegion(CAROL, 'raid', { boss: 'e:T5:0', gym: 'g:1' });
    await made.told();
    await made.target(7, ALICE, BOB);
    const postId = made.raid().forumPostId ?? '';
    const asked = await made.inPost(ALICE, postId, WEST_FORUM, 'location', { gym: 'g:7' });
    const row = sent(asked.reply).components?.[0] as {
      toJSON(): { components: { custom_id: string }[] };
    };
    await made.handle(
      fakeButton({
        customId: row.toJSON().components[0]?.custom_id ?? '',
        channelId: postId,
        thread: { parentId: WEST_FORUM },
        userId: ALICE,
        displayName: ALICE,
      }),
    );
    expect(made.raid()).toMatchObject({ gymId: 7, forumChannelId: EAST_FORUM });
    expect(await made.told()).toEqual([BOB]);
  });
});
```

Apply to `src/db/repositories/guild-repository.db.test.ts`:

```diff
--- a/src/db/repositories/guild-repository.db.test.ts
+++ b/src/db/repositories/guild-repository.db.test.ts
@@ -40,6 +40,12 @@ describe('GuildRepository', () => {
     expect(await guilds.idFor('999999999999999999')).toBeUndefined();
   });
 
+  it('snowflakeOf gives the server of a row, and nothing for a row that is not there', async () => {
+    const guildId = await guilds.ensure('412345678901234567');
+    expect(await guilds.snowflakeOf(guildId)).toBe('412345678901234567');
+    expect(await guilds.snowflakeOf(guildId + 1)).toBeUndefined();
+  });
+
   it('remove deletes the guild and cascades to its regions', async () => {
     const guildId = await guilds.ensure('412345678901234567');
     await db.insertInto('Region').values({ guildId, channelId: '512345678901234567' }).execute();
```

Create `src/domain/notify/reasons.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import {
  pokemonTarget,
  type NotificationScope,
  type NotificationTarget,
  type Want,
} from '../pogo/notification-target.js';
import type { RaidLevel } from '../pogo/raid-tier.js';
import {
  raidNumbers,
  raidWantsFiring,
  reasonKey,
  spawnNumbers,
  spawnWantsFiring,
  type RaidSighting,
} from './reasons.js';

const catalogue = catalogueFixture();
const entryOf = (key: string): { dex: number; key: string } => {
  const entry = catalogue.byKey(key);
  if (!entry) throw new Error(`the fixture has no ${key}`);
  return { dex: entry.dex, key: entry.key };
};
const tier = (level: RaidLevel, shadow = false): NotificationTarget => ({
  kind: 'tier',
  tier: { level, shadow },
});
const want = (target: NotificationTarget, scope: NotificationScope = 'raid'): Want => ({
  target,
  scope,
});
const raid = (level: RaidLevel, boss?: string, shadow = false): RaidSighting => ({
  tier: { level, shadow },
  boss: boss === undefined ? undefined : entryOf(boss),
});
const PERFECT: NotificationTarget = { kind: 'iv', iv: 'perfect' };
const ZERO: NotificationTarget = { kind: 'iv', iv: 'zero' };

describe('raidNumbers', () => {
  it('names the boss and the tier, and the tier alone for an egg or an unknown boss', () => {
    expect(raidNumbers(raid('T5', 'giratina_origin'))).toEqual([487, -5]);
    expect(raidNumbers(raid('T5'))).toEqual([-5]);
    expect(raidNumbers(raid('T5', 'giratina_origin', true))).toEqual([487, -35]);
    expect(raidNumbers(raid('EX', 'mewtwo'))).toEqual([150, -21]);
    expect(raidNumbers(raid('MegaLegendary'))).toEqual([-6]);
  });

  it('does not throw for a tier without a code', () => {
    expect(raidNumbers({ tier: { level: 'Mega', shadow: true }, boss: undefined })).toEqual([]);
  });
});

describe('raidWantsFiring', () => {
  const firing = (wants: Want[], sighting: RaidSighting) =>
    raidWantsFiring(catalogue, wants, sighting);

  it('fires a want for the species in any form, and a want for one form only for that form', () => {
    const species = pokemonTarget(487);
    const origin = pokemonTarget(487, 'giratina_origin');
    const altered = pokemonTarget(487, 'giratina_altered');
    const wants = [want(species), want(origin), want(altered, 'both')];
    expect(firing(wants, raid('T5', 'giratina_origin'))).toEqual([species, origin]);
    expect(firing(wants, raid('T5', 'giratina_altered'))).toEqual([species, altered]);
    expect(firing(wants, raid('T5', 'yveltal'))).toEqual([]);
  });

  it('fires a want for a species for its mega too, and a want for a mega for that mega', () => {
    const species = pokemonTarget(6);
    const megaY = pokemonTarget(6, 'charizard_mega_y');
    expect(firing([want(species), want(megaY)], raid('Mega', 'charizard_mega_y'))).toEqual([
      species,
      megaY,
    ]);
    expect(firing([want(species), want(megaY)], raid('Mega', 'charizard_mega_x'))).toEqual([
      species,
    ]);
  });

  it('fires a want for shadow raids only for a shadow raid, and a plain want for both', () => {
    const plain = pokemonTarget(487);
    const shadow = pokemonTarget(487, undefined, true);
    expect(firing([want(plain), want(shadow)], raid('T5', 'giratina_origin'))).toEqual([plain]);
    expect(firing([want(plain), want(shadow)], raid('T5', 'giratina_origin', true))).toEqual([
      plain,
      shadow,
    ]);
  });

  it('never fires a want that is for spawns alone', () => {
    expect(firing([want(pokemonTarget(487), 'spawn')], raid('T5', 'giratina_origin'))).toEqual([]);
    expect(firing([want(pokemonTarget(487), 'both')], raid('T5', 'giratina_origin'))).toEqual([
      pokemonTarget(487),
    ]);
  });

  it('fires a tier want for that very tier: T5 for ordinary tier 5, shadow T5 for shadow ones', () => {
    const wants = [want(tier('T5')), want(tier('T5', true)), want(tier('T3'))];
    expect(firing(wants, raid('T5'))).toEqual([tier('T5')]);
    expect(firing(wants, raid('T5', undefined, true))).toEqual([tier('T5', true)]);
    expect(firing(wants, raid('T5', 'yveltal'))).toEqual([tier('T5')]);
    expect(firing(wants, raid('T1'))).toEqual([]);
  });

  it('fires only the tier for an egg and for a boss the game data does not know', () => {
    const wants = [want(pokemonTarget(717)), want(tier('T5'))];
    expect(firing(wants, raid('T5'))).toEqual([tier('T5')]);
    expect(firing(wants, raid('T5', 'yveltal'))).toEqual([pokemonTarget(717), tier('T5')]);
  });

  it('treats EX, elite and mega legendary raids like any other', () => {
    expect(firing([want(tier('EX'))], raid('EX', 'mewtwo'))).toEqual([tier('EX')]);
    expect(firing([want(tier('Elite'))], raid('Elite'))).toEqual([tier('Elite')]);
    expect(firing([want(pokemonTarget(150))], raid('EX', 'mewtwo'))).toEqual([pokemonTarget(150)]);
  });

  it('never fires an IV want, also not the one stored under the number of a tier', () => {
    expect(firing([want(PERFECT, 'spawn'), want(ZERO, 'spawn')], raid('MegaLegendary'))).toEqual(
      [],
    );
    expect(firing([want(tier('MegaLegendary'))], raid('MegaLegendary'))).toEqual([
      tier('MegaLegendary'),
    ]);
  });
});

describe('spawnWantsFiring', () => {
  const firing = (wants: Want[], key: string, iv?: 'perfect' | 'zero') =>
    spawnWantsFiring(catalogue, wants, { pokemon: entryOf(key), iv });

  it('names the Pokédex number, and the IV code when the report says so', () => {
    expect(spawnNumbers({ pokemon: entryOf('dratini') })).toEqual([147]);
    expect(spawnNumbers({ pokemon: entryOf('dratini'), iv: 'perfect' })).toEqual([147, -6]);
    expect(spawnNumbers({ pokemon: entryOf('dratini'), iv: 'zero' })).toEqual([147, -8]);
  });

  it('fires wants for the Pokémon in the wild, never those for raids alone', () => {
    const dratini = pokemonTarget(147);
    expect(firing([want(dratini, 'spawn')], 'dratini')).toEqual([dratini]);
    expect(firing([want(dratini, 'both')], 'dratini')).toEqual([dratini]);
    expect(firing([want(dratini, 'raid')], 'dratini')).toEqual([]);
    expect(firing([want(pokemonTarget(147, undefined, true), 'raid')], 'dratini')).toEqual([]);
    expect(firing([want(tier('T1'))], 'dratini')).toEqual([]);
  });

  it('fires a want for one form only for that form', () => {
    const alolan = pokemonTarget(19, 'rattata_alola');
    const species = pokemonTarget(19);
    const wants = [want(alolan, 'spawn'), want(species, 'both')];
    expect(firing(wants, 'rattata_alola')).toEqual([alolan, species]);
    expect(firing(wants, 'rattata')).toEqual([species]);
  });

  it('fires the IV want the report names, and none without', () => {
    const wants = [want(PERFECT, 'spawn'), want(ZERO, 'spawn'), want(pokemonTarget(147), 'spawn')];
    expect(firing(wants, 'dratini')).toEqual([pokemonTarget(147)]);
    expect(firing(wants, 'dratini', 'perfect')).toEqual([PERFECT, pokemonTarget(147)]);
    expect(firing(wants, 'rattata', 'zero')).toEqual([ZERO]);
  });
});

describe('reasonKey', () => {
  it('is one text per reason, different for different reasons', () => {
    const keys = [
      reasonKey({ kind: 'want', target: pokemonTarget(487) }),
      reasonKey({ kind: 'want', target: pokemonTarget(487, 'giratina_origin') }),
      reasonKey({ kind: 'want', target: pokemonTarget(487, undefined, true) }),
      reasonKey({ kind: 'want', target: tier('T5') }),
      reasonKey({ kind: 'want', target: tier('T5', true) }),
      reasonKey({ kind: 'want', target: PERFECT }),
      reasonKey({ kind: 'gym', gymId: 4 }),
      reasonKey({ kind: 'gym', gymId: 41 }),
      reasonKey({ kind: 'boss-set' }),
      reasonKey({ kind: 'new-train' }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(reasonKey({ kind: 'want', target: pokemonTarget(487) })).toBe(
      reasonKey({ kind: 'want', target: { kind: 'pokemon', dex: 487 } }),
    );
  });
});
```

Create `src/render/notify-dm.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { notifyDm, postLink, raidDmSentence, reasonLine, type RaidDmView } from './notify-dm.js';

const GUILD = '412345678901234567';
const POST = '900000000000000001';
const REGION = '100000000000000001';
const LINK = postLink(GUILD, POST);

const view = (more: Partial<RaidDmView> = {}): RaidDmView => ({
  event: 'reported',
  tier: { level: 'T5', shadow: false },
  boss: 'Yveltal',
  gym: 'The Stacks',
  regionChannelId: REGION,
  reporter: { id: '200000000000000001', name: 'Rhea' },
  link: LINK,
  ...more,
});

describe('postLink', () => {
  it('is the address of a post, or of a message in a channel', () => {
    expect(LINK).toBe(`https://discord.com/channels/${GUILD}/${POST}`);
    expect(postLink(GUILD, REGION, '5')).toBe(`https://discord.com/channels/${GUILD}/${REGION}/5`);
  });
});

describe('raidDmSentence', () => {
  it('says the legacy sentence for a reported raid, naming the reporter by name alone', () => {
    expect(raidDmSentence(view())).toBe(
      `A raid for **Yveltal** has been reported at **The Stacks** (<#${REGION}>) by **Rhea**: ${LINK}`,
    );
  });

  it('calls an egg by its tier, with the right article', () => {
    expect(raidDmSentence(view({ boss: undefined }))).toBe(
      `A T5 egg has been reported at **The Stacks** (<#${REGION}>) by **Rhea**: ${LINK}`,
    );
    expect(
      raidDmSentence(view({ boss: undefined, tier: { level: 'Elite', shadow: false } })),
    ).toMatch(/^An Elite egg has been reported/);
    expect(raidDmSentence(view({ boss: undefined, tier: { level: 'T3', shadow: true } }))).toMatch(
      /^A Shadow T3 egg has been reported/,
    );
  });

  it('names nobody for an anonymous report, and falls back to the mention without a name', () => {
    expect(raidDmSentence(view({ reporter: undefined }))).toBe(
      `A raid for **Yveltal** has been reported at **The Stacks** (<#${REGION}>): ${LINK}`,
    );
    expect(raidDmSentence(view({ reporter: { id: '200000000000000001' } }))).toContain(
      'by **<@200000000000000001>**',
    );
  });

  it('leaves the region out when it is gone', () => {
    expect(raidDmSentence(view({ regionChannelId: undefined, reporter: undefined }))).toBe(
      `A raid for **Yveltal** has been reported at **The Stacks**: ${LINK}`,
    );
  });

  it('says that the raid has its boss, without naming who acted', () => {
    expect(raidDmSentence(view({ event: 'boss' }))).toBe(
      `The raid at **The Stacks** (<#${REGION}>) now has its boss, **Yveltal**: ${LINK}`,
    );
    // Another boss than it had: a correction.
    expect(raidDmSentence(view({ event: 'boss', corrected: true }))).toBe(
      `The boss of the raid at **The Stacks** (<#${REGION}>) is now **Yveltal**: ${LINK}`,
    );
    expect(
      raidDmSentence(
        view({ event: 'boss', boss: undefined, tier: { level: 'T3', shadow: false } }),
      ),
    ).toBe(`The raid at **The Stacks** (<#${REGION}>) is a T3 egg now: ${LINK}`);
  });

  it('says where the raid is when its gym was corrected', () => {
    expect(raidDmSentence(view({ event: 'gym' }))).toBe(
      `The raid for **Yveltal** is at **The Stacks** (<#${REGION}>), not where it was first reported: ${LINK}`,
    );
    expect(raidDmSentence(view({ event: 'gym', boss: undefined }))).toBe(
      `The T5 egg is at **The Stacks** (<#${REGION}>), not where it was first reported: ${LINK}`,
    );
  });

  it('shows what a feed or a member wrote as plain text', () => {
    const sentence = raidDmSentence(
      view({
        boss: '**Boss** @everyone',
        gym: '[gym](https://example.com)',
        reporter: { id: '1', name: '_Rhea_ <@&5>' },
      }),
    );
    expect(sentence).not.toContain('@everyone');
    expect(sentence).not.toContain('](');
    expect(sentence).not.toContain('<@&');
    expect(sentence).toContain('\\_Rhea\\_');
  });
});

describe('reasonLine and notifyDm', () => {
  it('names the reasons in small print', () => {
    expect(reasonLine([{ label: 'Yveltal' }, { label: 'T5 raids' }])).toBe(
      '-# You asked to be told about: Yveltal · T5 raids',
    );
    expect(reasonLine([])).toBe('');
  });

  it('puts the sentence, the reasons and the embed of the post into one message that pings nobody', () => {
    const embed = { title: 'Yveltal at The Stacks' };
    const message = notifyDm('A raid.', [{ label: 'Yveltal' }], embed);
    expect(message).toEqual({
      content: 'A raid.\n-# You asked to be told about: Yveltal',
      embeds: [embed],
    });
    expect(notifyDm('A raid.', [], undefined)).toEqual({ content: 'A raid.' });
  });
});
```

Create `src/services/notify-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
import { partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
import { loadSettings } from '../config/settings.js';
import { PartyStatus } from '../domain/party/status.js';
import { pokemonTarget, type NotificationTarget } from '../domain/pogo/notification-target.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { postLink } from '../render/notify-dm.js';
import { DM_PRIORITY } from './dm-sender.js';

const DORA = '200000000000000005';
const EVE = '200000000000000006';
const T5: NotificationTarget = { kind: 'tier', tier: { level: 'T5', shadow: false } };
const YVELTAL = pokemonTarget(717);
const GIRATINA = pokemonTarget(487);
const HATCH = at('2026-10-13T14:30');

type Made = Awaited<ReturnType<typeof reportedRaid>>;

/** A member who acts, with their name. */
const member = (id: string, name: string) => ({ id, name });
/** The first line of each message for a member. */
const told = (made: Made, userId: string): string[] =>
  made.dms.to(userId).map((message) => (message.content ?? '').split('\n')[0] ?? '');
/** The reasons line of each message for a member. */
const why = (made: Made, userId: string): string[] =>
  made.dms.to(userId).map((message) => (message.content ?? '').split('\n')[1] ?? '');

/**
 * A raid that is reported after `before` has filled the wants and targets: the first event
 * the notifier sees is the report itself.
 */
async function reported(
  before: (made: Awaited<ReturnType<typeof partyServiceWith>>) => Promise<void>,
  report: Parameters<typeof reportedRaid>[0] = {},
  overrides: Parameters<typeof reportedRaid>[1] = {},
): Promise<Made> {
  const kept = await partyServiceWith([], overrides);
  await before(kept);
  const made = await reportedRaid(report, overrides, {
    storage: kept.storage,
    gateway: kept.gateway,
    regions: kept.regions,
    clock: kept.clock,
    tags: kept.tags,
    wants: kept.wants,
    gymTargets: kept.gymTargets,
    userSettings: kept.userSettings,
  });
  await made.notify.flush();
  return made;
}

describe('NotifyService: a raid is reported', () => {
  it('tells who wants the boss, its tier or the gym, once, with the post as it is', async () => {
    const made = await reported(
      async ({ wants, gymTargets, gateway }) => {
        await wants.set(ALICE, gateway.guildId, YVELTAL, 'both');
        await wants.set(BOB, gateway.guildId, T5, 'raid');
        await gymTargets.add(CAROL, gateway.guildId, 1);
        await wants.set(DORA, gateway.guildId, GIRATINA, 'raid');
      },
      { boss: { key: 'yveltal' }, reporter: { name: 'Rhea' } },
    );
    const link = postLink(made.gateway.guildId, made.postId);
    const sentence = `A raid for **Yveltal** has been reported at **The Stacks** (<#${WEST_CHANNEL}>) by **Rhea**: ${link}`;
    expect(made.dms.recipients).toEqual([ALICE, BOB, CAROL]);
    expect(told(made, ALICE)).toEqual([sentence]);
    expect(why(made, ALICE)).toEqual(['-# You asked to be told about: Yveltal']);
    expect(why(made, BOB)).toEqual(['-# You asked to be told about: T5 raids']);
    expect(why(made, CAROL)).toEqual(['-# You asked to be told about: raids at The Stacks']);
    // The embed is that of the post; a DM has none of the post's controls and pings nobody.
    const [message] = made.dms.to(ALICE);
    const post = made.gateway.posts.get(made.postId);
    expect(message?.embeds).toEqual(post?.message.embeds);
    expect(message?.mention).toBeUndefined();
    const [job] = made.dms.jobs;
    expect(job).toMatchObject({ priority: DM_PRIORITY.normal, eventAt: made.clock.now });
    // Without times a message is worth an hour.
    expect(job?.expiresAt).toBe(made.party.lastPossibleTime ?? made.clock.now + 60 * MINUTE);
  });

  it('sends one message to a member for whom several reasons fire, and names them all', async () => {
    const made = await reported(
      async ({ wants, gymTargets, gateway }) => {
        await wants.set(ALICE, gateway.guildId, pokemonTarget(487, 'giratina_origin'), 'raid');
        await wants.set(ALICE, gateway.guildId, T5, 'raid');
        await wants.set(ALICE, gateway.guildId, GIRATINA, 'raid');
        await gymTargets.add(ALICE, gateway.guildId, 1);
      },
      { boss: { key: 'giratina_origin' } },
    );
    expect(made.dms.jobs).toHaveLength(1);
    expect(why(made, ALICE)).toEqual([
      '-# You asked to be told about: Giratina (Origin Forme) · T5 raids · Giratina (every form) · raids at The Stacks',
    ]);
  });

  it('tells only the tier and the gym for an egg, and expires with the raid', async () => {
    const made = await reported(
      async ({ wants, gymTargets, gateway }) => {
        await wants.set(ALICE, gateway.guildId, YVELTAL, 'both');
        await wants.set(BOB, gateway.guildId, T5, 'raid');
        await wants.set(
          BOB,
          gateway.guildId,
          { kind: 'tier', tier: { level: 'T5', shadow: true } },
          'raid',
        );
        await gymTargets.add(CAROL, gateway.guildId, 1);
        await gymTargets.add(DORA, gateway.guildId, 2);
      },
      { time: { hatch: HATCH } },
    );
    expect(made.dms.recipients).toEqual([BOB, CAROL]);
    expect(told(made, BOB)[0]).toMatch(/^A T5 egg has been reported at \*\*The Stacks\*\*/);
    expect(why(made, BOB)).toEqual(['-# You asked to be told about: T5 raids']);
    expect(made.dms.jobs[0]?.expiresAt).toBe(made.party.endTime);
  });

  it('does not tell the reporter, and does not name one who reports anonymously', async () => {
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(REPORTER, gateway.guildId, T5, 'raid');
        await wants.set(ALICE, gateway.guildId, T5, 'raid');
      },
      { anonymous: true, reporter: { name: 'Rhea' } },
    );
    expect(made.dms.recipients).toEqual([ALICE]);
    expect(told(made, ALICE)[0]).toBe(
      `A T5 egg has been reported at **The Stacks** (<#${WEST_CHANNEL}>): ${postLink(made.gateway.guildId, made.postId)}`,
    );
  });

  it('tells only members of the server who can see the forum of the raid', async () => {
    const made = await reported(async ({ wants, gateway }) => {
      for (const id of [ALICE, BOB, CAROL]) await wants.set(id, gateway.guildId, T5, 'raid');
      gateway.shutOut(WEST_FORUM, BOB);
      gateway.leftServer.add(CAROL);
    });
    expect(made.dms.recipients).toEqual([ALICE]);
    expect(made.members.batches[0]).toMatchObject({
      guildId: made.gateway.guildId,
      channelId: WEST_FORUM,
    });
  });

  it('tells nobody about wants of another server', async () => {
    const made = await reported(async ({ wants }) => {
      await wants.set(ALICE, '499999999999999999', T5, 'raid');
    });
    expect(made.dms.jobs).toEqual([]);
  });

  it('tells nobody where notifications are off', async () => {
    const settings = loadSettings(TEST_SETTINGS_PATH);
    const off = { ...settings, features: { ...settings.features, notifications: false } };
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(ALICE, gateway.guildId, T5, 'raid');
      },
      {},
      { settings: off },
    );
    expect(made.dms.jobs).toEqual([]);
    expect(made.members.batches).toEqual([]);
  });

  it('still tells who targets the gym when the wants cannot be read', async () => {
    const made = await reported(async ({ wants, gymTargets, gateway }) => {
      await gymTargets.add(CAROL, gateway.guildId, 1);
      wants.failing = new Error('the database is away');
    });
    expect(made.dms.recipients).toEqual([CAROL]);
    expect(made.entries.some((entry) => entry.msg === 'could not read who wants a raid')).toBe(
      true,
    );
  });

  it('tells nobody it could not ask about, and remembers nothing of it', async () => {
    const made = await reported(async ({ wants, gateway }) => {
      await wants.set(ALICE, gateway.guildId, T5, 'raid');
    });
    expect(made.dms.recipients).toEqual([ALICE]);
    await made.wants.set(BOB, made.gateway.guildId, YVELTAL, 'raid');
    made.members.failing = new Error('Discord is away');
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), {
      tier: { level: 'T5', shadow: false },
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    await made.notify.flush();
    expect(made.dms.recipients).toEqual([ALICE]);
    expect(
      made.entries.some(
        (entry) => entry.msg === 'could not find out who can see an event; they are not told',
      ),
    ).toBe(true);
    // The next event that fires the reason tells them: nothing was remembered.
    made.members.failing = undefined;
    for (const [key, label] of [
      ['giratina_origin', 'Giratina (Origin Forme) (T5)'],
      ['yveltal', 'Yveltal (T5)'],
    ] as const) {
      await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), {
        tier: { level: 'T5', shadow: false },
        boss: { key },
        label,
      });
    }
    await made.notify.flush();
    expect(made.dms.recipients).toEqual([ALICE, BOB]);
  });
});

describe('NotifyService: a raid changes', () => {
  /** An egg at the Library that Alice (T5) and Carol (the gym) were told about. */
  const egg = () =>
    reported(
      async ({ wants, gymTargets, gateway }) => {
        await wants.set(ALICE, gateway.guildId, T5, 'raid');
        await wants.set(BOB, gateway.guildId, YVELTAL, 'raid');
        await wants.set(DORA, gateway.guildId, YVELTAL, 'raid');
        await wants.set(DORA, gateway.guildId, T5, 'raid');
        await gymTargets.add(CAROL, gateway.guildId, 1);
        await gymTargets.add(EVE, gateway.guildId, 2);
      },
      { time: { hatch: HATCH } },
    );
  const setBoss = async (made: Made, by: string, key: string, label: string) => {
    const outcome = await made.raids.setBoss(made.party.id, member(by, 'Somebody'), {
      tier: { level: 'T5', shadow: false },
      boss: { key },
      label,
    });
    await made.notify.flush();
    return outcome;
  };

  it('tells who wants the boss when a member sets it, and nobody a second time', async () => {
    const made = await egg();
    expect(made.dms.recipients).toEqual([ALICE, DORA, CAROL]);
    await setBoss(made, CAROL, 'yveltal', 'Yveltal (T5)');
    // Alice and Carol were told for their only reason; Dora's tier was told, her Yveltal not.
    expect(made.dms.recipients).toEqual([ALICE, DORA, CAROL, BOB]);
    expect(told(made, BOB)).toEqual([
      `The raid at **The Stacks** (<#${WEST_CHANNEL}>) now has its boss, **Yveltal**: ${postLink(made.gateway.guildId, made.postId)}`,
    ]);
    expect(why(made, DORA)).toEqual([
      '-# You asked to be told about: T5 raids',
      '-# You asked to be told about: Yveltal',
    ]);
    expect(JSON.stringify(made.dms.to(BOB)[0]?.embeds)).toContain('Yveltal');
    // The same boss again changes nothing; nobody is told again.
    await setBoss(made, ALICE, 'yveltal', 'Yveltal (T5)');
    expect(made.dms.jobs).toHaveLength(5);
  });

  it('does not tell whoever set the boss, and counts it as told to them', async () => {
    const made = await egg();
    await setBoss(made, BOB, 'yveltal', 'Yveltal (T5)');
    expect(made.dms.to(BOB)).toEqual([]);
    expect(made.dms.to(DORA)).toHaveLength(2);
    // Another boss and back again: Bob knows about Yveltal, Dora was told.
    await setBoss(made, CAROL, 'giratina_origin', 'Giratina (Origin Forme) (T5)');
    await setBoss(made, CAROL, 'yveltal', 'Yveltal (T5)');
    expect(made.dms.to(BOB)).toEqual([]);
    expect(made.dms.to(DORA)).toHaveLength(2);
  });

  it('tells who wants another boss when the boss is corrected', async () => {
    const made = await egg();
    await made.wants.set(EVE, made.gateway.guildId, GIRATINA, 'raid');
    await setBoss(made, CAROL, 'yveltal', 'Yveltal (T5)');
    expect(made.dms.to(EVE)).toEqual([]);
    await setBoss(made, CAROL, 'giratina_origin', 'Giratina (Origin Forme) (T5)');
    expect(why(made, EVE)).toEqual(['-# You asked to be told about: Giratina (every form)']);
    expect(told(made, EVE)).toEqual([
      `The boss of the raid at **The Stacks** (<#${WEST_CHANNEL}>) is now **Giratina (Origin Forme)**: ${postLink(made.gateway.guildId, made.postId)}`,
    ]);
  });

  it('tells nobody when the boss is taken back and the raid is an egg again', async () => {
    const made = await egg();
    await setBoss(made, CAROL, 'yveltal', 'Yveltal (T5)');
    const before = made.dms.jobs.length;
    // Somebody who wants the tier and was not told yet: an egg again is still no news.
    await made.wants.set(EVE, made.gateway.guildId, T5, 'raid');
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), {
      tier: { level: 'T5', shadow: false },
      boss: null,
      label: 'T5 egg',
    });
    await made.notify.flush();
    expect(made.current().raid.boss).toBeNull();
    expect(made.dms.jobs).toHaveLength(before);
    expect(made.members.batches.every((batch) => !batch.userIds.includes(EVE))).toBe(true);
  });

  it('tells who wants the boss when the egg hatches as the only possible one, with nobody left out', async () => {
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(REPORTER, gateway.guildId, YVELTAL, 'raid');
        await wants.set(BOB, gateway.guildId, YVELTAL, 'raid');
      },
      { time: { hatch: HATCH } },
    );
    expect(made.dms.jobs).toEqual([]);
    made.clock.now = HATCH + MINUTE;
    await made.scheduler.tick();
    await made.notify.flush();
    expect(made.current().raid.boss).toEqual({ key: 'yveltal' });
    // The clock has no actor: the reporter wants Yveltal and is told like anybody.
    expect(made.dms.recipients).toEqual([REPORTER, BOB]);
    expect(told(made, BOB)[0]).toMatch(/^The raid at \*\*The Stacks\*\* .* now has its boss/);
    // Later ticks change nothing about the boss and tell nobody.
    made.clock.now += MINUTE;
    await made.scheduler.tick();
    await made.notify.flush();
    expect(made.dms.jobs).toHaveLength(2);
  });

  it('tells who targets the new gym when the raid moves within its region, not the mover', async () => {
    const made = await egg();
    await made.gymTargets.add(BOB, made.gateway.guildId, 2);
    const before = made.dms.jobs.length;
    await made.raids.setGym(made.party.id, member(BOB, 'Bob'), 2);
    await made.notify.flush();
    expect(made.current().gymId).toBe(2);
    expect(made.dms.jobs.slice(before).map((job) => job.userId)).toEqual([EVE]);
    expect(told(made, EVE)).toEqual([
      `The T5 egg is at **Old Stone Fountain** (<#${WEST_CHANNEL}>), not where it was first reported: ${postLink(made.gateway.guildId, made.postId)}`,
    ]);
    expect(why(made, EVE)).toEqual(['-# You asked to be told about: raids at Old Stone Fountain']);
    // Back to the first gym: Carol was told about that one.
    await made.raids.setGym(made.party.id, member(BOB, 'Bob'), 1);
    await made.notify.flush();
    expect(made.dms.jobs).toHaveLength(before + 1);
  });

  it('tells about the raid in its new region: the new gym, and the wants of who sees it only now', async () => {
    const FRED = '200000000000000007';
    const made = await reported(
      async ({ wants, gymTargets, gateway }) => {
        for (const id of [ALICE, BOB, CAROL]) await wants.set(id, gateway.guildId, T5, 'raid');
        await gymTargets.add(DORA, gateway.guildId, 8);
        await gymTargets.add(CAROL, gateway.guildId, 8);
        await gymTargets.add(FRED, gateway.guildId, 8);
        // Bob sees only East, Fred only West.
        gateway.shutOut(WEST_FORUM, BOB);
        gateway.shutOut(EAST_FORUM, FRED);
      },
      { time: { hatch: HATCH } },
    );
    expect(made.dms.recipients).toEqual([ALICE, CAROL]);
    const before = made.dms.jobs.length;
    const outcome = await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 8);
    await made.notify.flush();
    if (outcome.kind !== 'ok') throw new Error(`the raid did not move: ${outcome.kind}`);
    const moved = outcome.party;
    expect(moved.id).not.toBe(made.party.id);
    const after = made.dms.jobs.slice(before);
    // Alice was told about the T5 egg and is not told again; Bob sees it only now; Dora targets
    // the new gym; Carol moved it; Fred cannot see East.
    expect(after.map((job) => job.userId).sort()).toEqual([BOB, DORA].sort());
    const link = postLink(made.gateway.guildId, moved.forumPostId ?? '');
    expect(told(made, BOB)).toEqual([
      `The T5 egg is at **Café Élan Fresco** (<#${EAST_CHANNEL}>), not where it was first reported: ${link}`,
    ]);
    expect(why(made, BOB)).toEqual(['-# You asked to be told about: T5 raids']);
    expect(why(made, DORA)).toEqual(['-# You asked to be told about: raids at Café Élan Fresco']);
    expect(made.members.batches.at(-1)?.channelId).toBe(EAST_FORUM);
    // The old party has ended: what is remembered is about the new one alone.
    expect(made.notify.remembered).toBe(1);
    // In the new region the memory goes on: a boss tells nobody about the tier again.
    await made.raids.setBoss(moved.id, member(CAROL, 'Carol'), {
      tier: { level: 'T5', shadow: false },
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    await made.notify.flush();
    expect(made.dms.jobs).toHaveLength(before + 2);
  });

  it('forgets what it told when the party ends', async () => {
    const made = await egg();
    expect(made.notify.remembered).toBe(1);
    await made.service.end(made.party.id);
    expect(made.notify.remembered).toBe(0);
  });

  it('does not announce a raid that ended meanwhile, and remembers nothing of it', async () => {
    const made = await egg();
    const before = made.dms.jobs.length;
    let release: () => void = () => undefined;
    made.members.holding = new Promise((resolve) => {
      release = resolve;
    });
    const asked = made.members.batches.length;
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), {
      tier: { level: 'T5', shadow: false },
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    while (made.members.batches.length === asked) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    await made.service.end(made.party.id);
    release();
    await made.notify.flush();
    expect(made.dms.jobs).toHaveLength(before);
    expect(made.notify.remembered).toBe(0);
  });
});

describe('NotifyService: what must not go wrong', () => {
  const yveltal = {
    tier: { level: 'T5', shadow: false },
    boss: { key: 'yveltal' },
    label: 'Yveltal (T5)',
  } as const;
  /** Holds the answers about who can see something until `release` is called. */
  function hold(made: Pick<Made, 'members'>): () => void {
    let release: () => void = () => undefined;
    made.members.holding = new Promise((resolve) => {
      release = resolve;
    });
    return () => {
      made.members.holding = undefined;
      release();
    };
  }
  /** Waits until the notifier has asked who can see something once more than `asked` times. */
  async function untilAsked(made: Pick<Made, 'members'>, asked: number): Promise<void> {
    while (made.members.batches.length === asked) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  it('never breaks the report or the change it follows when it cannot even begin', async () => {
    const broken = {
      bosses: (): never => {
        throw new Error('the boss list is broken');
      },
    };
    const made = await reportedRaid(
      { time: { hatch: HATCH } },
      { notifying: { raidBosses: broken } },
    );
    // The raid was reported and has its post although the notifier threw.
    expect(made.gateway.posts.has(made.postId)).toBe(true);
    const failed = () =>
      made.entries.filter((entry) => entry.msg === 'could not tell members of an event');
    expect(failed()).toHaveLength(1);
    expect(failed()[0]).toMatchObject({ level: 50, event: 'a reported raid' });
    // A member's change is stored, shown and said in the post.
    const outcome = await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 2);
    expect(outcome.kind).toBe('ok');
    expect(made.current().gymId).toBe(2);
    await made.attendance.flush();
    expect(made.said().some((line) => line.includes('Old Stone Fountain'))).toBe(true);
    expect(failed()).toHaveLength(2);
    // A move to another region still closes the old post and opens the new one.
    const moved = await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 8);
    if (moved.kind !== 'ok') throw new Error(`the raid did not move: ${moved.kind}`);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.store.get(moved.party.id)).toBeDefined();
    await made.notify.flush();
    expect(made.dms.jobs).toEqual([]);
  });

  it('lets the clock do everything it does at hatch when the notifier throws', async () => {
    const broken = {
      bosses: (): never => {
        throw new Error('the boss list is broken');
      },
    };
    const made = await reportedRaid(
      { time: { hatch: HATCH } },
      { notifying: { raidBosses: broken } },
    );
    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Present);
    made.clock.now = HATCH + MINUTE;
    await made.scheduler.tick();
    await made.attendance.flush();
    await made.service.flush();
    expect(made.current().raid.boss).toEqual({ key: 'yveltal' });
    expect(made.said().some((line) => /hatched/i.test(line))).toBe(true);
    expect(
      made.entries.filter(
        (entry) =>
          entry.msg === 'could not tell members of an event' && entry['event'] === 'a changed raid',
      ),
    ).toHaveLength(1);
    expect(made.entries.some((entry) => entry.msg === 'could not run the clock for a party')).toBe(
      false,
    );
  });

  it('asks nobody about an event whose time has passed', async () => {
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(BOB, gateway.guildId, YVELTAL, 'raid');
      },
      { time: { hatch: HATCH } },
    );
    const release = hold(made);
    const asked = made.members.batches.length;
    // An event for the gym is in flight; the boss waits behind it until the raid is over.
    await made.gymTargets.add(DORA, made.gateway.guildId, 2);
    await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 2);
    await untilAsked(made, asked);
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), yveltal);
    made.clock.now = (made.current().endTime ?? 0) + 1;
    release();
    await made.notify.flush();
    expect(made.members.batches).toHaveLength(asked + 1);
    expect(made.dms.to(BOB)).toEqual([]);
  });

  it('tells a member once when a raid moves to another region while they are being asked about', async () => {
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(BOB, gateway.guildId, YVELTAL, 'raid');
      },
      { time: { hatch: HATCH } },
    );
    const release = hold(made);
    const asked = made.members.batches.length;
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), yveltal);
    await untilAsked(made, asked);
    // The answer for the old party comes while the raid is on its way to the other region.
    const moving = made.notify.raidMoving.bind(made.notify);
    made.notify.raidMoving = (fromId, toId) => {
      moving(fromId, toId);
      release();
    };
    const outcome = await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 8);
    expect(outcome.kind).toBe('ok');
    await made.notify.flush();
    expect(made.dms.to(BOB)).toHaveLength(1);
    expect(made.notify.remembered).toBe(1);
  });

  it('does not count a member as told whose message could not be made', async () => {
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(ALICE, gateway.guildId, T5, 'raid');
        await wants.set(BOB, gateway.guildId, T5, 'raid');
        await wants.set(BOB, gateway.guildId, YVELTAL, 'raid');
      },
      { time: { hatch: HATCH } },
      {
        notifying: {
          regions: {
            byId: (): never => {
              throw new Error('the regions are away');
            },
          },
        },
      },
    );
    expect(made.dms.jobs).toEqual([]);
    const failures = made.entries.filter(
      (entry) => entry.msg === 'could not make the direct message for an event',
    );
    // Once per set of reasons, not once per member.
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ level: 40 });
    expect(made.notify.remembered).toBe(0);
  });

  it('asks nobody at shutdown about an event that was still reading who it is for', async () => {
    let gate: Promise<void> = Promise.resolve();
    let reads = 0;
    const made = await reportedRaid(
      { time: { hatch: HATCH } },
      {
        notifying: {
          gymTargets: {
            targeting: async () => {
              reads += 1;
              await gate;
              return [DORA];
            },
          },
        },
      },
    );
    await made.notify.flush();
    expect(made.dms.to(DORA)).toHaveLength(1);
    const asked = made.members.batches.length;
    let release: () => void = () => undefined;
    gate = new Promise((resolve) => {
      release = resolve;
    });
    await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 2);
    while (reads < 2) await new Promise((resolve) => setImmediate(resolve));
    const closing = made.notify.close();
    await new Promise((resolve) => setImmediate(resolve));
    release();
    await closing;
    expect(made.members.batches).toHaveLength(asked);
    expect(made.dms.to(DORA)).toHaveLength(1);
  });

  it('stops at shutdown: what is in flight puts its hundred in line, nothing more begins', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await made.notify.flush();
    for (let n = 0; n < 250; n++) {
      made.wants.add(
        String(300_000_000_000_000_000n + BigInt(n)),
        made.gateway.guildId,
        -5,
        'raid',
      );
    }
    const release = hold(made);
    await made.raids.setBoss(made.party.id, member(DORA, 'Dora'), yveltal);
    await untilAsked(made, 0);
    const closing = made.notify.close();
    release();
    await closing;
    expect(made.dms.jobs).toHaveLength(100);
    expect(made.members.batches).toHaveLength(1);
    // Nothing is taken from then on.
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), yveltal);
    await made.notify.flush();
    expect(made.members.batches).toHaveLength(1);
  });
});

describe('NotifyService: many recipients', () => {
  /** A user id of 18 digits for a number. */
  const idOf = (n: number): string => String(300_000_000_000_000_000n + BigInt(n));

  it('judges, asks about and puts in line thousands in batches that give the event loop back', async () => {
    const kept = await partyServiceWith();
    for (let n = 0; n < 5_000; n++) kept.wants.add(idOf(n), kept.gateway.guildId, -5, 'raid');
    // Every tenth cannot see the forum.
    kept.gateway.shutOut(
      WEST_FORUM,
      ...Array.from({ length: 500 }, (_unused, index) => idOf(index * 10)),
    );
    let beats = 0;
    let beating = true;
    const beat = (): void => {
      beats += 1;
      if (beating) setImmediate(beat);
    };
    setImmediate(beat);
    const made = await reportedRaid(
      {},
      {},
      {
        storage: kept.storage,
        gateway: kept.gateway,
        regions: kept.regions,
        clock: kept.clock,
        tags: kept.tags,
        wants: kept.wants,
      },
    );
    await made.notify.flush();
    beating = false;
    expect(made.dms.jobs).toHaveLength(4_500);
    expect(new Set(made.dms.jobs.map((job) => job.userId)).size).toBe(4_500);
    // A hundred at a time, each batch asked about in one question.
    expect(made.members.batches).toHaveLength(50);
    expect(made.members.batches.every((batch) => batch.userIds.length === 100)).toBe(true);
    // The event loop turned at least twice per batch: for the answer, and between the batches.
    expect(beats).toBeGreaterThanOrEqual(100);
    // One message was built for all of them.
    expect(new Set(made.dms.jobs.map((job) => job.message)).size).toBe(1);
  });
});
```

Apply to `test/support/members.ts`:

```diff
--- a/test/support/members.ts
+++ b/test/support/members.ts
@@ -17,6 +17,10 @@ export class FakeMemberDirectory implements MemberDirectory {
   readonly batches: { guildId: string; channelId: string; userIds: string[] }[] = [];
   /** A call of `viewers` with more ids than this rejects. Unlimited by default. */
   batchLimit = Number.POSITIVE_INFINITY;
+  /** While set, `viewers` answers only once this has resolved: for what happens meanwhile. */
+  holding: Promise<void> | undefined;
+  /** Everybody is a member of every server, without `add`: for tests about what they can see. */
+  everybody = false;
   /** Asked besides `hide` when set: whether a member can see a channel. */
   sees: ((channelId: string, userId: string) => boolean) | undefined;
   private readonly members = new Map<string, ServerMember>();
@@ -50,8 +54,9 @@ export class FakeMemberDirectory implements MemberDirectory {
 
   viewers(guildId: string, channelId: string, userIds: readonly string[]): Promise<Set<string>> {
     this.batches.push({ guildId, channelId, userIds: [...userIds] });
+    const held = this.holding ?? Promise.resolve();
     return new Promise((resolve, reject) => {
-      setImmediate(() => {
+      const answer = (): void => {
         if (this.failing) reject(this.failing);
         else if (userIds.length > this.batchLimit) {
           reject(new Error(`${String(userIds.length)} members were asked for at once`));
@@ -60,14 +65,15 @@ export class FakeMemberDirectory implements MemberDirectory {
             new Set(
               userIds.filter(
                 (id) =>
-                  this.members.has(`${guildId}:${id}`) &&
+                  (this.everybody || this.members.has(`${guildId}:${id}`)) &&
                   !this.hidden.get(channelId)?.has(id) &&
                   (this.sees?.(channelId, id) ?? true),
               ),
             ),
           );
         }
-      });
+      };
+      void held.then(() => setImmediate(answer));
     });
   }
 }
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -26,7 +26,12 @@ import {
   type RaidReport,
   type TrainRequest,
 } from '../../src/services/party-service.js';
+import { NotifyService, type NotifyServiceOptions } from '../../src/services/notify-service.js';
+import { RecordingDms } from './dms.js';
 import { FakePartyGateway } from './fake-gateway.js';
+import { MemoryGymTargets } from './gym-targets.js';
+import { FakeMemberDirectory } from './members.js';
+import { MemoryWants } from './wants.js';
 import { catalogueFixture } from './game-data.js';
 import {
   EAST_FORUM,
@@ -150,15 +155,26 @@ export interface Outliving {
   userSettings: Map<string, Partial<UserSettings>>;
   /** The routes members saved. */
   routes: MemorySavedRoutes;
+  /** What members want to be told about, and the gyms they target. */
+  wants: MemoryWants;
+  gymTargets: MemoryGymTargets;
   /** The storage the store really uses, when that is not the one in memory (a database test). */
   database: PartyStorage | undefined;
 }
 
+/**
+ * What a test may set differently: the options of the party service, and under `notifying`
+ * those of the notifier alone (a provider of its own that fails, a clock of its own).
+ */
+export type ServiceOverrides = Partial<PartyServiceOptions> & {
+  notifying?: Partial<NotifyServiceOptions>;
+};
+
 /**
  * The services as they are after a restart: new ones, which remember nothing, over the same
  * storage, gateway, regions and clock.
  */
-export function restarted(made: Outliving, overrides: Partial<PartyServiceOptions> = {}) {
+export function restarted(made: Outliving, overrides: ServiceOverrides = {}) {
   return partyServiceWith([], overrides, made);
 }
 
@@ -177,13 +193,19 @@ export function restarted(made: Outliving, overrides: Partial<PartyServiceOption
  * `access` lets members into forums they cannot see (on the fake gateway everybody sees every
  * forum unless `gateway.shutOut` says otherwise); it works on the side, `access.flush()` waits.
  *
+ * `notify` is the notifier over the same store, told by the services as in the bot: who wants
+ * something is in `wants` and `gymTargets` (nobody, until a test says so), everybody is a
+ * member of the server and sees what the fake gateway lets them see (`members`), and what would
+ * be sent is only recorded (`dms`). It works on the side: `notify.flush()` waits.
+ *
  * `kept` is what outlives a restart (see `restarted`).
  */
 export async function partyServiceWith(
   parties: readonly Party[] = [],
-  overrides: Partial<PartyServiceOptions> = {},
+  overrides: ServiceOverrides = {},
   kept?: Partial<Outliving>,
 ) {
+  const { notifying, ...forService } = overrides;
   const clock = kept?.clock ?? { now: PARTY_NOW };
   const now = () => clock.now;
   const storage = kept?.storage ?? new MemoryPartyStorage(parties);
@@ -223,8 +245,33 @@ export async function partyServiceWith(
     // Long enough that nothing runs by itself during a test.
     renderDelayMs: 3_600_000,
     sharedDelayMs: 3_600_000,
-    ...overrides,
+    ...forService,
+  });
+  const wants = kept?.wants ?? new MemoryWants();
+  const gymTargets = kept?.gymTargets ?? new MemoryGymTargets();
+  const members = new FakeMemberDirectory();
+  members.everybody = true;
+  members.sees = (channelId, userId) =>
+    gateway.canSee(channelId, userId) && !gateway.leftServer.has(userId);
+  const dms = new RecordingDms();
+  const notify = new NotifyService({
+    store,
+    posts: service,
+    wants,
+    gymTargets,
+    members,
+    dms,
+    guilds: { snowflakeOf: (id) => Promise.resolve(id === 1 ? gateway.guildId : undefined) },
+    regions,
+    gyms: gymsFixture(),
+    gameData: overrides.gameData ?? { catalogue: catalogueFixture() },
+    raidBosses: overrides.raidBosses ?? raidBossesFixture(),
+    settings: overrides.settings ?? settings,
+    log,
+    now,
+    ...notifying,
   });
+  service.announceTo(notify);
   const lines = new PartyLines({
     gateway,
     active: (postId) => store.byPost(postId) !== undefined,
@@ -249,6 +296,7 @@ export async function partyServiceWith(
     gyms: gymsFixture(),
     regions,
     gameData: { catalogue: catalogueFixture() },
+    notify,
     settings,
     log,
     now,
@@ -290,6 +338,7 @@ export async function partyServiceWith(
     gateway,
     raidBosses,
     users,
+    notify,
     settings,
     log,
     now,
@@ -304,6 +353,11 @@ export async function partyServiceWith(
     trains,
     routes,
     scheduler,
+    notify,
+    wants,
+    gymTargets,
+    members,
+    dms,
     lines,
     users,
     userSettings,
@@ -327,7 +381,7 @@ export async function partyServiceWith(
  */
 export async function reportedRaid(
   report: Partial<RaidReport> = {},
-  overrides: Partial<PartyServiceOptions> = {},
+  overrides: ServiceOverrides = {},
   kept?: Partial<Outliving>,
 ) {
   const made = await partyServiceWith([], overrides, kept);
@@ -364,7 +418,7 @@ export async function reportedRaid(
  */
 export async function createdMeetup(
   request: Partial<MeetupRequest> = {},
-  overrides: Partial<PartyServiceOptions> = {},
+  overrides: ServiceOverrides = {},
   kept?: Partial<Outliving>,
 ) {
   const made = await partyServiceWith([], overrides, kept);
@@ -397,7 +451,7 @@ export async function createdMeetup(
  */
 export async function createdTrain(
   request: Partial<TrainRequest> & { route?: readonly number[] } = {},
-  overrides: Partial<PartyServiceOptions> = {},
+  overrides: ServiceOverrides = {},
   kept?: Partial<Outliving>,
 ) {
   const made = await partyServiceWith([], overrides, kept);
```

Run: `npx vitest run --project unit src/commands/notify-paths.test.ts src/domain/notify/reasons.test.ts src/render/notify-dm.test.ts src/services/notify-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -36,6 +36,7 @@ import { QueuedDmSender } from './services/dm-sender.js';
 import { GameDataService } from './services/game-data-service.js';
 import { GymDirectory } from './services/gym-directory.js';
 import { ImageCache } from './services/image-cache.js';
+import { NotifyService } from './services/notify-service.js';
 import { PartyLines } from './services/party-lines.js';
 import { PartyScheduler } from './services/party-scheduler.js';
 import { PartyService } from './services/party-service.js';
@@ -137,6 +138,29 @@ export async function startApp(
     settings: config.settings,
     log,
   });
+  const wants = new PokemonNotificationRepository(
+    db,
+    formReader(() => gameData.catalogue),
+  );
+  const gymTargets = new GymNotificationRepository(db);
+  const newTrains = new NewTrainRepository(db);
+  // Made after the party service, whose embeds it sends, and told by it from here on.
+  const notify = new NotifyService({
+    store: parties,
+    posts: partyService,
+    wants,
+    gymTargets,
+    members,
+    dms,
+    guilds,
+    regions,
+    gyms,
+    gameData,
+    raidBosses,
+    settings: config.settings,
+    log,
+  });
+  partyService.announceTo(notify);
   const lines = new PartyLines({
     gateway: partyGateway,
     active: (postId) => parties.byPost(postId) !== undefined,
@@ -159,6 +183,7 @@ export async function startApp(
     gyms,
     regions,
     gameData,
+    notify,
     settings: config.settings,
     log,
   });
@@ -191,6 +216,7 @@ export async function startApp(
     gateway: partyGateway,
     raidBosses,
     users,
+    notify,
     settings: config.settings,
     log,
   });
@@ -243,12 +269,9 @@ export async function startApp(
     trains,
     clickAnswers,
     users,
-    wants: new PokemonNotificationRepository(
-      db,
-      formReader(() => gameData.catalogue),
-    ),
-    gymTargets: new GymNotificationRepository(db),
-    newTrains: new NewTrainRepository(db),
+    wants,
+    gymTargets,
+    newTrains,
     members,
     dms,
     pokemon,
@@ -348,6 +371,8 @@ export async function startApp(
       { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
       { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
       { name: 'forum access', timeoutMs: 5_000, run: () => access.flush() },
+      // Whoever is still being looked up for an event is put in line before the line is drained.
+      { name: 'notifications', timeoutMs: 5_000, run: () => notify.close() },
       // Direct messages go on at their usual rate for ten seconds (spec 9); the rest is dropped.
       { name: 'direct messages', timeoutMs: 15_000, run: () => dms.drain(DM_DRAIN_MS) },
       { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
```

Apply to `src/commands/notifications/want-input.ts`:

```diff
--- a/src/commands/notifications/want-input.ts
+++ b/src/commands/notifications/want-input.ts
@@ -12,14 +12,13 @@ import {
   entryWant,
   formReader,
   hasForms,
-  ivWantLabel,
   parseWantToken,
   pokemonWantName,
   raidsOnly,
   readWantText,
   SHADOW_OF,
-  tierWantLabel,
   wantSpeciesFinder,
+  wantTargetLabel,
   wantToken,
   wantWord,
   wantWordGuesses,
@@ -34,19 +33,9 @@ export const SCOPE_WORDS: Readonly<Record<NotificationScope, string>> = {
   spawn: 'spawns',
 };
 
-/**
- * What a target is called in a list: `T5 raids`, `Perfect IV spawns`; a species by its name,
- * with `(every form)` when it has several, so that it cannot be taken for one of the forms that
- * may stand beside it (`Giratina (every form)`, `Dratini`); one form by the name of its entry
- * (`Giratina (Origin Forme)`, `Mega Charizard Y`); shadow raids as `Shadow Landorus`. What the
- * game data does not have (any more) is called by its number or its key (`pokemonWantName`).
- * The name comes from the game data, so it is not made plain here; `plain()` it where it
- * stands in a message.
- */
+/** What a target is called in a list (`wantTargetLabel`), with the game data in use. */
 export function wantLabel(ctx: AppContext, target: NotificationTarget): string {
-  if (target.kind === 'tier') return tierWantLabel(target.tier);
-  if (target.kind === 'iv') return ivWantLabel(target.iv);
-  return pokemonWantName(ctx.gameData.catalogue, target, { everyForm: true });
+  return wantTargetLabel(ctx.gameData.catalogue, target);
 }
 
 /**
```

Apply to `src/db/repositories/guild-repository.ts`:

```diff
--- a/src/db/repositories/guild-repository.ts
+++ b/src/db/repositories/guild-repository.ts
@@ -28,6 +28,16 @@ export class GuildRepository implements GuildStore {
     await this.db.deleteFrom('Guild').where('snowflake', '=', snowflake).execute();
   }
 
+  /** The snowflake of the server with this row id: parties and regions name a server by its row. */
+  async snowflakeOf(id: number): Promise<string | undefined> {
+    const row = await this.db
+      .selectFrom('Guild')
+      .select('snowflake')
+      .where('id', '=', id)
+      .executeTakeFirst();
+    return row?.snowflake ?? undefined;
+  }
+
   async idFor(snowflake: string): Promise<number | undefined> {
     const row = await this.db
       .selectFrom('Guild')
```

Create `src/domain/notify/reasons.ts`:

```ts
import type { PokemonCatalogue } from '../pogo/catalogue.js';
import {
  ivCode,
  tierCode,
  type NotificationTarget,
  type Want,
} from '../pogo/notification-target.js';
import { sameRaidTier, type RaidTier } from '../pogo/raid-tier.js';
import { pokemonWantFits, wantToken } from '../pogo/wants.js';

/**
 * Why a member is told about something by direct message: a want of theirs is for it, the gym
 * is one they target, the egg they are signed up for got its boss and they asked to hear that,
 * or a train was made and they asked to hear of new trains. One message may have several.
 */
export type NotifyReason =
  | { kind: 'want'; target: NotificationTarget }
  | { kind: 'gym'; gymId: number }
  | {
      kind: 'boss-set';
      /**
       * The boss it is about (`bossId`), where a reason is remembered: a member is told
       * whenever it is another than the last boss they were told for the raid (Matt,
       * 2026-10-13). Absent where only the setting matters (the button that switches it off).
       */
      boss?: string;
    }
  | { kind: 'new-train' };

/**
 * A reason as one text, the same for the same reason: what the memory of what was already told
 * goes by. Not for a custom id (`stopArgs` spells a reason for that).
 */
export function reasonKey(reason: NotifyReason): string {
  switch (reason.kind) {
    case 'want':
      return `want:${wantToken(reason.target)}`;
    case 'gym':
      return `gym:${String(reason.gymId)}`;
    case 'boss-set':
      // Per boss: the message for one boss is not the message for another.
      return reason.boss === undefined ? reason.kind : `${reason.kind}:${reason.boss}`;
    case 'new-train':
      return reason.kind;
  }
}

/** A raid's boss as one text, the same for the same boss: what `boss-set` is remembered as. */
export function bossId(boss: { key: string } | { name: string }): string {
  return 'key' in boss ? `key:${boss.key}` : `name:${boss.name}`;
}

/** A raid as far as wants are matched against it. */
export interface RaidSighting {
  tier: RaidTier;
  /**
   * The catalogue entry of the boss. Undefined for an egg, and for a boss the game data does
   * not know: such a raid is for its tier and its gym only.
   */
  boss: { dex: number; key: string } | undefined;
}

/**
 * The numbers under which a want for this raid may be stored (`PokemonNotification.pokemon`):
 * the boss's Pokédex number and the code of the tier. What `WantStorage.wanting` is asked for;
 * a row found by them is a candidate, which `raidWantsFiring` judges.
 */
export function raidNumbers(raid: RaidSighting): number[] {
  const tier = tierCode(raid.tier);
  return [...(raid.boss ? [raid.boss.dex] : []), ...(tier === undefined ? [] : [tier])];
}

/**
 * Those of a member's wants that are for this raid, in their order:
 *
 * - a want for a Pokémon in raids (scope `raid` or `both`) that fits the boss
 *   (`pokemonWantFits`): the species in any form, the one form, and a want for shadow raids
 *   only when the raid is one;
 * - a want for the raid's tier: the very tier, so a want for T5 is for ordinary tier 5 raids
 *   and not for shadow ones, and a want for shadow T5 for those alone (Matt, 2026-10-10). An
 *   egg fires nothing else.
 *
 * EX and elite raids are raids like any other here.
 */
export function raidWantsFiring(
  catalogue: Pick<PokemonCatalogue, 'byKey'>,
  wants: readonly Want[],
  raid: RaidSighting,
): NotificationTarget[] {
  return wants
    .filter((want) => {
      if (want.scope === 'spawn') return false;
      const { target } = want;
      if (target.kind === 'tier') return sameRaidTier(target.tier, raid.tier);
      if (target.kind === 'iv') return false;
      return pokemonWantFits(catalogue, target, raid.boss, raid.tier.shadow);
    })
    .map((want) => want.target);
}

/** A reported wild Pokémon as far as wants are matched against it. */
export interface SpawnSighting {
  /** The catalogue entry that was reported. */
  pokemon: { dex: number; key: string };
  /** Set when the report says its IVs are perfect or zero. */
  iv?: 'perfect' | 'zero' | undefined;
}

/** The numbers under which a want for this spawn may be stored (see `raidNumbers`). */
export function spawnNumbers(spawn: SpawnSighting): number[] {
  return [spawn.pokemon.dex, ...(spawn.iv === undefined ? [] : [ivCode(spawn.iv)])];
}

/**
 * Those of a member's wants that are for this spawn, in their order: a want for the Pokémon in
 * the wild (scope `spawn` or `both`; a want for shadow raids or for a mega is about raids and
 * never fits), and the want for perfect or zero IVs when the report says so.
 */
export function spawnWantsFiring(
  catalogue: Pick<PokemonCatalogue, 'byKey'>,
  wants: readonly Want[],
  spawn: SpawnSighting,
): NotificationTarget[] {
  return wants
    .filter((want) => {
      if (want.scope === 'raid') return false;
      const { target } = want;
      if (target.kind === 'iv') return target.iv === spawn.iv;
      if (target.kind === 'tier') return false;
      return pokemonWantFits(catalogue, target, spawn.pokemon, false);
    })
    .map((want) => want.target);
}
```

Apply to `src/domain/pogo/wants.ts`:

```diff
--- a/src/domain/pogo/wants.ts
+++ b/src/domain/pogo/wants.ts
@@ -85,6 +85,21 @@ export function ivWantLabel(iv: 'perfect' | 'zero'): string {
   return iv === 'perfect' ? 'Perfect IV spawns' : 'Zero IV spawns';
 }
 
+/**
+ * What a target is called in a list: `T5 raids`, `Perfect IV spawns`; a species by its name,
+ * with `(every form)` when it has several, so that it cannot be taken for one of the forms that
+ * may stand beside it (`Giratina (every form)`, `Dratini`); one form by the name of its entry
+ * (`Giratina (Origin Forme)`, `Mega Charizard Y`); shadow raids as `Shadow Landorus`. What the
+ * game data does not have (any more) is called by its number or its key (`pokemonWantName`).
+ * The name comes from the game data, so it is not made plain here; `plain()` it where it
+ * stands in a message. The one name of a want everywhere: lists, answers, direct messages.
+ */
+export function wantTargetLabel(catalogue: PokemonCatalogue, target: NotificationTarget): string {
+  if (target.kind === 'tier') return tierWantLabel(target.tier);
+  if (target.kind === 'iv') return ivWantLabel(target.iv);
+  return pokemonWantName(catalogue, target, { everyForm: true });
+}
+
 /** The number a level has in the game, as members type it. */
 const LEVEL_NUMBERS: Partial<Record<RaidLevel, string>> = {
   T1: '1',
```

Create `src/render/notify-dm.ts`:

```ts
import type { APIEmbed } from 'discord.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import { raidTierLabel, type RaidTier } from '../domain/pogo/raid-tier.js';
import { memberName, plain, type NamedMember } from './text.js';

/**
 * A link to a post, or to a message in a channel, that works in a direct message. A mention
 * (`<#id>`) of a forum post reads "#unknown" in a client that has not opened the forum, and
 * the reader of a DM has usually not; the address always opens the post.
 */
export function postLink(guildId: string, postId: string, messageId?: string): string {
  const message = messageId === undefined ? '' : `/${messageId}`;
  return `https://discord.com/channels/${guildId}/${postId}${message}`;
}

/** A word with its article: `a T5`, `an Elite`, `an EX`. */
function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
}

/** `(#region)` after a gym, or nothing when the region is gone. */
function inRegion(regionChannelId: string | undefined): string {
  return regionChannelId === undefined ? '' : ` (<#${regionChannelId}>)`;
}

/** What a direct message about a raid says in its first line. */
export interface RaidDmView {
  /**
   * What happened: the raid was reported; it got a boss, another boss or another tier; it
   * moved to another gym.
   */
  event: 'reported' | 'boss' | 'gym';
  tier: RaidTier;
  /** The boss's name as the post shows it; undefined for an egg. */
  boss: string | undefined;
  /** For `boss`: the raid had another boss before, so this one is a correction. */
  corrected?: boolean;
  /** The gym's name (its nickname when it has one), as the post's title has it. */
  gym: string;
  /** The text channel of the raid's region; undefined when the region is gone. */
  regionChannelId: string | undefined;
  /** Who reported it, for a report that is not anonymous. Only a report names anybody. */
  reporter: NamedMember | undefined;
  /** The address of the raid's post (`postLink`). */
  link: string;
}

/**
 * The first line of a direct message about a raid: the legacy bot's sentence in today's terms.
 * A member is named by their display name alone: a mention reads "@unknown-user" in a DM,
 * whose reader's client has rarely loaded that member. Nobody is named for a change of the
 * boss or the gym: the legacy bot said "by" whoever acted, as if they had reported the raid.
 * A raid at another gym is said as the correction it nearly always is (a raid does not move),
 * to a reader who hears of it for the first time: where it is, not where it went.
 */
export function raidDmSentence(view: RaidDmView): string {
  const where = `**${plain(view.gym)}**${inRegion(view.regionChannelId)}`;
  const egg = `${raidTierLabel(view.tier)} egg`;
  const what = view.boss === undefined ? egg : `raid for **${plain(view.boss)}**`;
  switch (view.event) {
    case 'reported': {
      const subject = view.boss === undefined ? withArticle(egg) : `A ${what}`;
      const by = view.reporter ? ` by **${memberName(view.reporter)}**` : '';
      const sentence = `${subject} has been reported at ${where}${by}: ${view.link}`;
      return sentence.charAt(0).toUpperCase() + sentence.slice(1);
    }
    case 'boss':
      if (view.boss === undefined) {
        return `The raid at ${where} is ${withArticle(egg)} now: ${view.link}`;
      }
      return view.corrected
        ? `The boss of the raid at ${where} is now **${plain(view.boss)}**: ${view.link}`
        : `The raid at ${where} now has its boss, **${plain(view.boss)}**: ${view.link}`;
    case 'gym':
      return `The ${what} is at ${where}, not where it was first reported: ${view.link}`;
  }
}

/** One reason a direct message came, as it is shown: its label, and the button that stops it. */
export interface ShownReason {
  /** What the member asked for, made plain: `Yveltal`, `T5 raids`, `raids at The Stacks`. */
  label: string;
}

/**
 * The line that says why a direct message came: what the member asked to be told about, in the
 * names their own lists use. In small print (Discord's subtext), below the news itself.
 */
export function reasonLine(reasons: readonly ShownReason[]): string {
  const labels = reasons.map((reason) => reason.label);
  return labels.length === 0 ? '' : `-# You asked to be told about: ${labels.join(' · ')}`;
}

/**
 * A direct message of the notifier: the sentence, the line of reasons, and the embed of the
 * post as it is at that moment, without the post's controls (a DM is not the place to sign up:
 * the sentence links to the post). It pings nobody.
 */
export function notifyDm(
  sentence: string,
  reasons: readonly ShownReason[],
  embed: APIEmbed | undefined,
): OutgoingMessage {
  const line = reasonLine(reasons);
  return {
    content: line === '' ? sentence : `${sentence}\n${line}`,
    ...(embed ? { embeds: [embed] } : {}),
  };
}
```

Create `src/services/notify-service.ts`:

```ts
import type { APIEmbed } from 'discord.js';
import type { Settings } from '../config/settings.js';
import type { GymTargetStorage } from '../db/repositories/gym-notification-repository.js';
import type { WantStorage } from '../db/repositories/pokemon-notification-repository.js';
import type { MemberDirectory } from '../discord/member-directory.js';
import { MEMBERS_PER_REQUEST } from '../discord/member-viewers.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import {
  raidNumbers,
  raidWantsFiring,
  reasonKey,
  type NotifyReason,
  type RaidSighting,
} from '../domain/notify/reasons.js';
import { memberOf, sameBoss, type Party, type RaidParty } from '../domain/party/party.js';
import type { Want } from '../domain/pogo/notification-target.js';
import { sameRaidTier } from '../domain/pogo/raid-tier.js';
import { wantTargetLabel } from '../domain/pogo/wants.js';
import type { Logger } from '../log.js';
import {
  notifyDm,
  postLink,
  raidDmSentence,
  type RaidDmView,
  type ShownReason,
} from '../render/notify-dm.js';
import { gymName, shownBoss, type PostGym } from '../render/raid-post.js';
import { plain } from '../render/text.js';
import { DM_PRIORITY, type DmPriority, type DmSender } from './dm-sender.js';
import type { GameDataProvider } from './game-data-service.js';
import { KeyedLock } from './keyed-lock.js';
import type { PartyStore } from './party-store.js';
import type { RaidBossProvider } from './raid-boss-service.js';
import type { RegionProvider } from './region-directory.js';

/**
 * What the services that change parties tell the notifier, each from the one place that knows
 * who acted (`actorId`; null for the clock): explicit calls, because only the caller knows the
 * actor, and a move to another region is several changes of two parties that only its caller
 * can tell from a new report. Every method returns at once and never throws (`NotifyService`
 * catches and logs whatever goes wrong in it): what follows (reading who wants it, asking who
 * can see it, putting the messages in line) happens on the side. A caller still tells the
 * notifier last, after everything the change itself calls for.
 */
export interface PartyNotifier {
  /** A raid was reported and has its post. */
  raidReported(party: RaidParty, actorId: string): void;
  /**
   * A raid was changed and stored: told of every stored change of a raid by a member or the
   * clock; the notifier looks whether the boss, the tier or the gym is another.
   */
  raidChanged(before: RaidParty, after: RaidParty, actorId: string | null): void;
  /**
   * A raid is about to become another party in another region (`PartyService.relocate`): what
   * was told about the old party counts for the new one. Called before the old party ends.
   */
  raidMoving(fromId: string, toId: string): void;
  /** The move is done: `to` is the raid in its new region, with its post. */
  raidMoved(from: RaidParty, to: RaidParty, actorId: string | null): void;
}

export interface NotifyServiceOptions {
  /** The parties: an ended one is not announced, and what was told about it is forgotten. */
  store: Pick<PartyStore, 'get' | 'onChange'>;
  /** The embed of a party's post as it is now (`PartyService.embedOf`). */
  posts: { embedOf(party: Party): APIEmbed };
  wants: Pick<WantStorage, 'wanting'>;
  gymTargets: Pick<GymTargetStorage, 'targeting'>;
  members: Pick<MemberDirectory, 'viewers'>;
  dms: DmSender;
  /** The snowflake of a server by its row (`GuildRepository.snowflakeOf`). */
  guilds: { snowflakeOf(id: number): Promise<string | undefined> };
  regions: Pick<RegionProvider, 'byId'>;
  gyms: { get(id: number): PostGym | undefined };
  gameData: GameDataProvider;
  raidBosses: Pick<RaidBossProvider, 'bosses'>;
  settings: Settings;
  log: Logger;
  now?: () => number;
}

/**
 * As many members as are judged, asked about and put in line in one go before the event loop
 * gets its turn: what one request for members names.
 */
const BATCH = MEMBERS_PER_REQUEST;
/** A message about a raid without an end time is not worth sending after this long. */
const RAID_NEWS_MS = 60 * 60_000;

/** Who may be told about an event, and why each of them would be. */
interface Candidates {
  /** Snowflakes, each once. */
  ids: string[];
  /** The reasons that fire for one of them; judged when their batch comes. */
  reasonsOf: (id: string) => NotifyReason[];
}

/** One event to tell members about. */
interface Announcement {
  /** Events with one key are worked off one after the other: those of a party, in their order. */
  key: string;
  /** The party it is about; undefined for what is about none (a spawn). */
  partyId: string | undefined;
  /** Row id of the server. */
  guildRowId: number;
  /** The channel a recipient must be able to view. */
  channelId: string;
  /** The member who caused it, who is not told. */
  actorId: string | null;
  eventAt: number;
  expiresAt: number;
  gather(guildId: string): Promise<Candidates>;
  /** The message for a member these reasons fired for; built once per set of reasons. */
  message(guildId: string, reasons: readonly NotifyReason[]): OutgoingMessage;
  priority(reasons: readonly NotifyReason[]): DmPriority;
}

/** What one member was already told about one party. */
interface Told {
  /** The reasons (`reasonKey`) that fired, but for "your egg has its boss". */
  reasons: Set<string>;
  /** The boss (`bossId`) of the last "your egg has its boss" they were told or caused. */
  boss: string | undefined;
}

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Tells members by direct message what they asked to be told about (spec 6.4): raids for their
 * wants and at their gyms. Only where `settings.features.notifications` is on.
 *
 * An event is worked off on the side, in steps that give the event loop back: the members
 * with a row that may fit are read (the reads by event of the storages), then a hundred at a
 * time they are judged (the pure matching of `src/domain/notify`), asked about (who of them is
 * in the server and can view the party's forum: `MemberDirectory.viewers`) and put in line
 * (`DmSender`). Nothing here sends, and nothing loops over all recipients in one turn.
 *
 * **Never twice for one thing.** Per party it is remembered which reasons already fired for
 * which member; a later event of that party tells a member only when a reason fires that had
 * not fired for them, and names that reason alone. The member who caused an event is not told,
 * and what fired for them counts as told. The memory is not stored: a raid that moves to
 * another region shares it with the party it becomes, it is forgotten when the party ends, and
 * it is empty after a restart, which can repeat a message (accepted).
 *
 * **One message per member and event**, whatever number of reasons fire; it names them all.
 */
export class NotifyService implements PartyNotifier {
  private readonly now: () => number;
  /** By party, by member: what they were already told. */
  private readonly told = new Map<string, Map<string, Told>>();
  private readonly lines = new KeyedLock<string>();
  private readonly background = new Set<Promise<void>>();
  private readonly snowflakes = new Map<number, string>();
  /** Set at shutdown (`close`): nothing new is taken, and nothing in flight begins a batch. */
  private closed = false;

  constructor(private readonly options: NotifyServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    options.store.onChange((_before, after) => {
      if (after.status !== 'active') this.told.delete(after.id);
    });
  }

  private get enabled(): boolean {
    return this.options.settings.features.notifications;
  }

  /** How many parties something is remembered about. For tests. */
  get remembered(): number {
    return this.told.size;
  }

  /**
   * Runs what a caller told the notifier, and keeps whatever it throws from the caller: the
   * change that is told about is stored and shown by then, and must not fail for this.
   */
  private safely(event: string, work: () => void): void {
    try {
      work();
    } catch (err) {
      this.options.log.error({ err, event }, 'could not tell members of an event');
    }
  }

  raidReported(party: RaidParty, actorId: string): void {
    this.safely('a reported raid', () => {
      if (!this.enabled) return;
      this.announceRaid(party, 'reported', actorId, { wants: true, gym: true, corrected: false });
    });
  }

  raidChanged(before: RaidParty, after: RaidParty, actorId: string | null): void {
    this.safely('a changed raid', () => {
      if (!this.enabled) return;
      const was = before.raid.boss;
      const is = after.raid.boss;
      const otherBoss = !sameBoss(was, is);
      // A boss that was taken back leaves an egg again: that is news for nobody (who was told
      // of the boss sees it in the post), whatever else changed with it.
      const boss =
        is === null && was !== null
          ? false
          : otherBoss || !sameRaidTier(before.raid.tier, after.raid.tier);
      const gym = before.gymId !== after.gymId;
      // A boss in the place of another one is told as the correction it is.
      const corrected = otherBoss && is !== null && was !== null;
      // A change of both at once is told as the other gym it also is.
      if (gym) {
        this.announceRaid(after, 'gym', actorId, { wants: boss, gym: true, corrected });
      } else if (boss) {
        this.announceRaid(after, 'boss', actorId, { wants: true, gym: false, corrected });
      }
    });
  }

  raidMoving(fromId: string, toId: string): void {
    this.safely('a raid that moves', () => {
      // One memory under both ids, not a copy: an event of the old party that is still being
      // worked off (its members are being asked about) remembers whom it tells for the new
      // party too. When the old party ends only its key goes; when the move is taken back,
      // only the new one.
      const known = this.told.get(fromId) ?? new Map<string, Told>();
      this.told.set(fromId, known);
      this.told.set(toId, known);
    });
  }

  raidMoved(_from: RaidParty, to: RaidParty, actorId: string | null): void {
    this.safely('a moved raid', () => {
      if (!this.enabled) return;
      // In another region other members can see it: the wants are asked again, and whoever was
      // told already is not told a second time.
      this.announceRaid(to, 'gym', actorId, { wants: true, gym: true, corrected: false });
    });
  }

  /** What a want is matched against: the raid's tier, and its boss as the game data has it. */
  private sighting(party: RaidParty): RaidSighting {
    const { gameData, raidBosses } = this.options;
    const entry = shownBoss(party, gameData.catalogue, raidBosses.bosses())?.entry;
    return { tier: party.raid.tier, boss: entry && { dex: entry.dex, key: entry.key } };
  }

  private announceRaid(
    party: RaidParty,
    event: RaidDmView['event'],
    actorId: string | null,
    include: {
      wants: boolean;
      gym: boolean;
      /** The boss took the place of another one. */
      corrected: boolean;
    },
  ): void {
    const { forumChannelId, forumPostId, gymId } = party;
    // A raid is announced only once it has its post: the message links to it.
    if (forumChannelId === null || forumPostId === null) return;
    const { gyms, regions, gameData, raidBosses, wants, gymTargets, posts, log } = this.options;
    const sighting = this.sighting(party);
    const eventAt = this.now();
    let embed: { made?: APIEmbed | undefined } | undefined;
    this.announce({
      key: party.id,
      partyId: party.id,
      guildRowId: party.guildId,
      channelId: forumChannelId,
      actorId,
      eventAt,
      expiresAt: party.endTime ?? party.lastPossibleTime ?? eventAt + RAID_NEWS_MS,
      gather: async (guildId) => {
        const wanting = new Map<string, readonly Want[]>();
        const targeting = new Set<string>();
        // Each read by itself: one that fails does not keep the other's members from being told.
        if (include.wants) {
          try {
            for (const found of await wants.wanting(guildId, raidNumbers(sighting))) {
              wanting.set(found.memberId, found.wants);
            }
          } catch (err) {
            log.warn({ err, party: party.id }, 'could not read who wants a raid');
          }
        }
        if (include.gym && gymId !== null) {
          try {
            for (const id of await gymTargets.targeting(guildId, gymId)) targeting.add(id);
          } catch (err) {
            log.warn({ err, party: party.id }, 'could not read who targets a gym');
          }
        }
        return {
          ids: [...new Set([...wanting.keys(), ...targeting])],
          reasonsOf: (id) => [
            ...raidWantsFiring(gameData.catalogue, wanting.get(id) ?? [], sighting).map(
              (target): NotifyReason => ({ kind: 'want', target }),
            ),
            ...(targeting.has(id) && gymId !== null ? [{ kind: 'gym' as const, gymId }] : []),
          ],
        };
      },
      message: (guildId, reasons) => {
        // The post as it is when the first message is made, for all of them.
        embed ??= { made: this.embedOf(posts, party) };
        const region = party.regionId === null ? undefined : regions.byId(party.regionId);
        const sentence = raidDmSentence({
          event,
          tier: party.raid.tier,
          boss: shownBoss(party, gameData.catalogue, raidBosses.bosses())?.name,
          corrected: include.corrected,
          gym: gymName(gymId === null ? undefined : gyms.get(gymId)),
          regionChannelId: region?.channelId,
          reporter: party.anonymous ? undefined : memberOf(party, party.createdById),
          link: postLink(guildId, forumPostId),
        });
        return notifyDm(
          sentence,
          reasons.map((reason) => this.shown(reason)),
          embed.made,
        );
      },
      priority: () => DM_PRIORITY.normal,
    });
  }

  private embedOf(posts: NotifyServiceOptions['posts'], party: Party): APIEmbed | undefined {
    try {
      return posts.embedOf(party);
    } catch (err) {
      this.options.log.warn({ err, party: party.id }, 'could not show a party in a direct message');
      return undefined;
    }
  }

  /** A reason as the message names it, in the names of the member's own lists. */
  private shown(reason: NotifyReason): ShownReason {
    const { gameData, gyms } = this.options;
    switch (reason.kind) {
      case 'want':
        return { label: plain(wantTargetLabel(gameData.catalogue, reason.target)) };
      case 'gym':
        return { label: `raids at ${plain(gymName(gyms.get(reason.gymId)))}` };
      case 'boss-set':
        return { label: 'the boss of an egg you are signed up for' };
      case 'new-train':
        return { label: 'new trains' };
    }
  }

  /** Has an event worked off on the side, after the earlier ones of its key. */
  private announce(event: Announcement): void {
    if (this.closed) return;
    const work = this.lines
      .run(event.key, () => this.deliver(event))
      .catch((err: unknown) => {
        this.options.log.error({ err, party: event.partyId }, 'could not tell members of an event');
      })
      .finally(() => this.background.delete(work));
    this.background.add(work);
  }

  private async guildSnowflake(rowId: number): Promise<string | undefined> {
    const known = this.snowflakes.get(rowId);
    if (known !== undefined) return known;
    const found = await this.options.guilds.snowflakeOf(rowId);
    if (found !== undefined) this.snowflakes.set(rowId, found);
    return found;
  }

  /** Whether an event is still worth telling: its party, if it has one, has not ended. */
  private alive(event: Announcement): boolean {
    return event.partyId === undefined || this.options.store.get(event.partyId) !== undefined;
  }

  /**
   * Those of the reasons that have not fired for this member in this party before; "your egg
   * has its boss" whenever its boss is another than the last one they were told.
   */
  private unsaid(
    partyId: string | undefined,
    memberId: string,
    reasons: NotifyReason[],
  ): NotifyReason[] {
    const said = partyId === undefined ? undefined : this.told.get(partyId)?.get(memberId);
    if (!said) return reasons;
    return reasons.filter((reason) =>
      reason.kind === 'boss-set'
        ? said.boss === undefined || said.boss !== reason.boss
        : !said.reasons.has(reasonKey(reason)),
    );
  }

  private remember(
    partyId: string | undefined,
    memberId: string,
    reasons: readonly NotifyReason[],
  ): void {
    if (partyId === undefined) return;
    let ofParty = this.told.get(partyId);
    if (!ofParty) {
      ofParty = new Map();
      this.told.set(partyId, ofParty);
    }
    let said = ofParty.get(memberId);
    if (!said) {
      said = { reasons: new Set(), boss: undefined };
      ofParty.set(memberId, said);
    }
    for (const reason of reasons) {
      if (reason.kind === 'boss-set') said.boss = reason.boss;
      else said.reasons.add(reasonKey(reason));
    }
  }

  private async deliver(event: Announcement): Promise<void> {
    const { members, dms, log } = this.options;
    // It waited behind other events of its party: ended, too late or shut down meanwhile.
    if (this.closed || !this.alive(event) || this.now() >= event.expiresAt) return;
    const guildId = await this.guildSnowflake(event.guildRowId);
    if (guildId === undefined) return;
    const { ids, reasonsOf } = await event.gather(guildId);
    /** The message per set of reasons; null for a set whose message could not be made. */
    const messages = new Map<string, OutgoingMessage | null>();
    let told = 0;
    for (let start = 0; start < ids.length; start += BATCH) {
      // The party ended meanwhile: nobody else is told, and nothing more is remembered.
      if (!this.alive(event)) return;
      // Looking members up can take minutes (the look-ups have a budget): a message that
      // would be dropped when its turn to be sent comes is not asked about any more.
      if (this.now() >= event.expiresAt) return;
      // Shutting down: the batch that was being asked about was put in line, no other begins,
      // not even the first of an event that was still reading who it is for.
      if (this.closed) return;
      const firing = new Map<string, NotifyReason[]>();
      for (const id of ids.slice(start, start + BATCH)) {
        const reasons = this.unsaid(event.partyId, id, reasonsOf(id));
        if (reasons.length === 0) continue;
        // Whoever caused it knows: not told, now or for these reasons later.
        if (id === event.actorId) this.remember(event.partyId, id, reasons);
        else firing.set(id, reasons);
      }
      if (firing.size > 0) {
        let seeing: Set<string> | undefined;
        try {
          seeing = await members.viewers(guildId, event.channelId, [...firing.keys()]);
        } catch (err) {
          log.warn(
            { err, party: event.partyId, members: firing.size },
            'could not find out who can see an event; they are not told',
          );
        }
        if (!this.alive(event)) return;
        for (const [id, reasons] of firing) {
          if (!seeing?.has(id)) continue;
          const key = reasons.map(reasonKey).join('\n');
          let message = messages.get(key);
          if (message === undefined) {
            // Made before anything is remembered: a member whose message could not be made
            // was not told, and the next event that fires the reason tells them.
            try {
              message = event.message(guildId, reasons);
            } catch (err) {
              message = null;
              log.warn(
                { err, party: event.partyId, reasons: reasons.map(reasonKey) },
                'could not make the direct message for an event',
              );
            }
            messages.set(key, message);
          }
          if (message === null) continue;
          this.remember(event.partyId, id, reasons);
          dms.send({
            userId: id,
            message,
            priority: event.priority(reasons),
            eventAt: event.eventAt,
            expiresAt: event.expiresAt,
          });
          told += 1;
        }
      }
      // The event loop gets its turn between the batches, whatever the fakes or caches answer.
      await nextTurn();
    }
    log.debug({ party: event.partyId, candidates: ids.length, told }, 'members were told');
  }

  /** Waits for every event that is being worked off. For tests; shutdown uses `close`. */
  async flush(): Promise<void> {
    while (this.background.size > 0) await Promise.all(this.background);
  }

  /**
   * For shutdown: nothing is taken from now on; an event that is being worked off puts the
   * members it is asking about in line and begins no other batch, one that has asked about
   * nobody yet asks about nobody, and one that waits behind another does not begin. Waits for
   * that. (Not part of `flush`, which tests call between events to wait for what is on its
   * way.)
   */
  async close(): Promise<void> {
    this.closed = true;
    while (this.background.size > 0) await Promise.all(this.background);
  }
}
```

Apply to `src/services/party-scheduler.ts`:

```diff
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -13,6 +13,7 @@ import type { Logger } from '../log.js';
 import { archiveWarning } from '../render/activity.js';
 import { fitItems, plain, withMentions } from '../render/text.js';
 import type { AttendanceService } from './attendance-service.js';
+import type { PartyNotifier } from './notify-service.js';
 import { settingsOf } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyService } from './party-service.js';
@@ -36,6 +37,8 @@ export interface PartySchedulerOptions {
   raidBosses: Pick<RaidBossProvider, 'autoset'>;
   /** The members' settings: whether who leads a train or meetup lets the bot ping them. */
   users?: UserSettingsReader;
+  /** Told when the clock changes a raid (an egg that hatches as its only possible boss). */
+  notify?: Pick<PartyNotifier, 'raidChanged'>;
   settings: Settings;
   log: Logger;
   now?: () => number;
@@ -227,8 +230,12 @@ export class PartyScheduler {
   }
 
   private async tickParty(id: string, input: TickInput): Promise<void> {
-    const { store, posts, log } = this.options;
-    const result = await store.update(id, (party) => partyTick(party, input));
+    const { store, posts, notify, log } = this.options;
+    const seen: { before?: Party } = {};
+    const result = await store.update(id, (party) => {
+      seen.before = party;
+      return partyTick(party, input);
+    });
     if (!result) return;
     if (result.render) posts.changed(id);
     for (const effect of result.effects) {
@@ -238,6 +245,12 @@ export class PartyScheduler {
         log.warn({ err, party: id, effect: effect.kind }, 'could not do what the clock asked for');
       }
     }
+    // The clock has no actor: whoever a boss it set is news for is told, nobody is left out.
+    // After everything the clock itself does: telling members must never be in its way.
+    const { before } = seen;
+    if (result.written && before && isRaid(before) && isRaid(result.party)) {
+      notify?.raidChanged(before, result.party, null);
+    }
     if (!result.effects.some((effect) => effect.kind === 'end')) await this.settleWarning(id);
   }
 
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -1,3 +1,4 @@
+import type { APIEmbed } from 'discord.js';
 import type { Settings } from '../config/settings.js';
 import type { Gym } from '../db/repositories/gym-repository.js';
 import type { Region } from '../db/repositories/region-repository.js';
@@ -53,6 +54,7 @@ import { renderTrainPost, trainTitle, type TrainPostView } from '../render/train
 import { Coalescer } from './coalescer.js';
 import type { GameDataProvider } from './game-data-service.js';
 import { KeyedLock } from './keyed-lock.js';
+import type { PartyNotifier } from './notify-service.js';
 import { PartyMirrors } from './party-mirrors.js';
 import { settingsOf } from './party-change.js';
 import type { PartyStore } from './party-store.js';
@@ -242,6 +244,9 @@ export class PartyService {
     { asked: Set<string>; pinged: boolean; tail: Promise<unknown> }
   >();
 
+  /** Told of new raids and of raids that moved to another region (`announceTo`). */
+  private notifier: PartyNotifier | undefined;
+
   constructor(private readonly options: PartyServiceOptions) {
     this.now = options.now ?? (() => Date.now());
     this.mirrors = new PartyMirrors({
@@ -277,6 +282,19 @@ export class PartyService {
     });
   }
 
+  /**
+   * Has `notifier` told of what members may want a direct message about. Set once, at start:
+   * the notifier shows a party as this service does (`embedOf`), so it is made after it.
+   */
+  announceTo(notifier: PartyNotifier): void {
+    this.notifier = notifier;
+  }
+
+  /** The embed of a party's post as it is now, for whoever shows the party elsewhere (a DM). */
+  embedOf(party: Party): APIEmbed {
+    return this.rendered(party).embed;
+  }
+
   /** The durations in effect, with the events known at this moment. */
   rules(): RaidDurationRules {
     return raidDurationRules(this.options.settings, this.options.raidEvents.events());
@@ -517,7 +535,10 @@ export class PartyService {
     }
 
     // The row exists; from here on a failure must not leave an active raid without a post.
-    return this.createTracked(raid, region, rendered);
+    const created = await this.createTracked(raid, region, rendered);
+    // Only now: the message links to the post. The reporter is not told of their own report.
+    if (created.kind === 'created') this.notifier?.raidReported(created.party, report.reporterId);
+    return created;
   }
 
   /**
@@ -647,6 +668,8 @@ export class PartyService {
     const rendered = renderRaidPost(this.view({ ...raid, forumChannelId: forumId }));
     const stored = await store.addRaidUnlessTaken(raid, this.now());
     if (!stored.added) return { kind: 'taken', other: stored.existing };
+    // Before the old party ends: who was told about it is not told again about the new one.
+    this.notifier?.raidMoving(partyId, raid.id);
     // A failure in here ends the new party again and leaves the old one alone.
     const created = await this.createTracked(raid, region, rendered);
     if (created.kind !== 'created') return { kind: 'no-forum' };
@@ -714,6 +737,8 @@ export class PartyService {
     }
     await this.closePost(from, words, said);
     this.changed(raid.id);
+    // Whoever moved it is not told; who targets the new gym, and who can see it only now, is.
+    this.notifier?.raidMoved(from, party, by?.id ?? null);
     return { kind: 'moved', party, from };
   }
 
```

Apply to `src/services/raid-change-service.ts`:

```diff
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -33,6 +33,7 @@ import type { Logger } from '../log.js';
 import { clockOrDate, memberText, plain, timestamp } from '../render/text.js';
 import type { Member } from './attendance-service.js';
 import type { GameDataProvider } from './game-data-service.js';
+import type { PartyNotifier } from './notify-service.js';
 import { storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { RelocateOutcome } from './party-service.js';
@@ -74,6 +75,8 @@ export interface RaidChangeServiceOptions {
   gyms: { get(id: number): Gym | undefined; regionsOf(gymId: number): string[] };
   regions: Pick<RegionProvider, 'byId' | 'byChannel'>;
   gameData: GameDataProvider;
+  /** Told of every stored change of a raid, with the member who made it. */
+  notify?: Pick<PartyNotifier, 'raidChanged'>;
   settings: Settings;
   log: Logger;
   now?: () => number;
@@ -358,7 +361,7 @@ export class RaidChangeService {
     line: (party: RaidParty) => string | undefined,
     targetGym?: number,
   ): Promise<RaidChangeOutcome> {
-    const { store, posts, lines, questions, log } = this.options;
+    const { store, posts, lines, questions, notify, log } = this.options;
     // The raid can be moved to another gym between looking and locking: then look again.
     for (let attempt = 0; attempt < 3; attempt++) {
       const before = store.get(partyId);
@@ -369,7 +372,9 @@ export class RaidChangeService {
       let moved = false;
       let meetings: string[] = [];
       let released = false;
+      const seen: { before?: RaidParty } = {};
       const decide = (party: RaidParty): Decision => {
+        seen.before = party;
         if (party.gymId !== null && !locked.includes(party.gymId)) {
           moved = true;
           return { ok: true, party };
@@ -406,6 +411,8 @@ export class RaidChangeService {
       }
       if (result.written) {
         posts.changed(partyId);
+        // Every change of a raid by a member ends here: the notifier sees what it is about.
+        if (seen.before) notify?.raidChanged(seen.before, result.party, member.id);
         const postId = result.party.forumPostId;
         const text = line(result.party);
         const notices = released
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/notify-paths.test.ts src/domain/notify/reasons.test.ts src/render/notify-dm.test.ts src/services/notify-service.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/repositories/guild-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/repositories/guild-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 81dfa11 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/app.ts src/commands/notifications/want-input.ts src/commands/notify-paths.test.ts src/db/repositories/guild-repository.db.test.ts src/db/repositories/guild-repository.ts src/domain/notify/reasons.test.ts src/domain/notify/reasons.ts src/domain/pogo/wants.ts src/render/notify-dm.test.ts src/render/notify-dm.ts src/services/notify-service.test.ts src/services/notify-service.ts src/services/party-scheduler.ts src/services/party-service.ts src/services/raid-change-service.ts test/support/members.ts test/support/party-service.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app.ts src/commands/notifications/want-input.ts src/commands/notify-paths.test.ts src/db/repositories/guild-repository.db.test.ts src/db/repositories/guild-repository.ts src/domain/notify/reasons.test.ts src/domain/notify/reasons.ts src/domain/pogo/wants.ts src/render/notify-dm.test.ts src/render/notify-dm.ts src/services/notify-service.test.ts src/services/notify-service.ts src/services/party-scheduler.ts src/services/party-service.ts src/services/raid-change-service.ts test/support/members.ts test/support/party-service.ts
git commit -m "NotifyService: raids told to who wants them, once per reason, never to who caused it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 3,134 unit tests.

---

### Task 6: The stop buttons under a direct message: one per reason, pressed in the DM

**Files:**
- Create: `src/components/dm.test.ts`, `src/components/dm.ts`
- Modify: `src/components/index.ts`, `src/discord/custom-id.test.ts`, `src/discord/custom-id.ts`, `src/domain/notify/reasons.test.ts`, `src/domain/notify/reasons.ts`, `src/render/notify-dm.test.ts`, `src/render/notify-dm.ts`, `src/services/notify-service.test.ts`, `src/services/notify-service.ts`, `test/support/fake-interactions.test.ts`, `test/support/fake-interactions.ts`

**Interfaces:**
- Consumes: Task 5's reasons and `notifyDm`; `encodeCustomId` / `parseCustomId`; `ctx.wants`, `ctx.gymTargets`, `ctx.users`, `ctx.newTrains`; `KeyedLock`; `MEMBER_WRITE_THROTTLE`; the fake interactions.
- Produces: In `src/discord/custom-id.ts`: the kind `dm` (`DM_KIND`, `STOP_ACTION`), documented there as `dm:<server>:stop:<what>` with `<what>` one of `p:<dex>[:<form>]`, `ps:…` (shadow), `t:<level>`, `ts:<level>`, `iv:perfect|zero`, `g:<gym>`, `boss`, `train`, and `encodeCustomIdIfFits`; `stopArgs`, `parseStopArgs`, `stopButtonId`, `stopRow`, `stopHint`, `withoutButton` in the DM renderer; the component handler `dmControls` (`src/components/dm.ts`), listed in `src/components/index.ts`; the fake interactions' `fakeMessage()`, `messageRows` and `fetchReply`, and `message` only on buttons, selects and modals.

Reference commit of the prototype for this task: `0c0fdad`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/dm.test.ts`:

```ts
import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeButton,
  fakeMessage,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { MemoryGymTargets } from '../../test/support/gym-targets.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { MemoryNewTrains } from '../../test/support/new-trains.js';
import { createTestContext } from '../../test/support/test-context.js';
import { MemoryUsers } from '../../test/support/users.js';
import { MemoryWants } from '../../test/support/wants.js';
import { decodeCustomId } from '../discord/custom-id.js';
import { InteractionRouter } from '../discord/router.js';
import { MEMBER_WRITE_THROTTLE } from '../discord/throttle.js';
import { parseStopArgs, type NotifyReason } from '../domain/notify/reasons.js';
import { pokemonTarget, type NotificationTarget } from '../domain/pogo/notification-target.js';
import { entryWant } from '../domain/pogo/wants.js';
import { notifyDm, stopButtonId, type ControlRows } from '../render/notify-dm.js';
import { dmControls } from './dm.js';
import { components } from './index.js';

const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const ALICE = '200000000000000002';
const BOB = '200000000000000003';
const T5: NotificationTarget = { kind: 'tier', tier: { level: 'T5', shadow: false } };
const YVELTAL = pokemonTarget(717);
const want = (target: NotificationTarget): NotifyReason => ({ kind: 'want', target });

function setup() {
  const wants = new MemoryWants();
  const gymTargets = new MemoryGymTargets();
  const users = new MemoryUsers();
  const newTrains = new MemoryNewTrains();
  const { ctx, entries } = createTestContext({ wants, gymTargets, users, newTrains });
  const router = new InteractionRouter(ctx, [], [dmControls]);
  /** The rows of a message with a button for each of these reasons. */
  const rows = (reasons: NotifyReason[], guildId = HOME): ControlRows =>
    notifyDm(
      'A raid.',
      reasons.map((reason, index) => ({
        label: `reason ${String(index)}`,
        stop: stopButtonId(guildId, reason),
      })),
      undefined,
    ).components ?? [];
  /** A press, in a DM, of the button for `reason` under a message with buttons for `all`. */
  const press = async (
    userId: string,
    reason: NotifyReason,
    all: NotifyReason[] = [reason],
    guildId = HOME,
  ): Promise<FakeInteraction> => {
    const interaction = fakeButton({
      customId: stopButtonId(guildId, reason) ?? '',
      isDm: true,
      userId,
      messageRows: rows(all, guildId),
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const said = (interaction: FakeInteraction) => sent(interaction.followUp).content;
  /** The custom ids of the buttons a press left on the message. */
  const left = (interaction: FakeInteraction): string[] =>
    (sent(interaction.editReply).components as ControlRows).flatMap((row) =>
      row.components.map((control) => ('custom_id' in control ? control.custom_id : '')),
    );
  return { ctx, entries, router, wants, gymTargets, users, newTrains, press, said, left, rows };
}

describe('the "Stop" buttons under a direct message', () => {
  it('removes the want in the server the button names, answers in the DM, and takes the button off', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    await made.wants.set(ALICE, HOME, YVELTAL, 'both');
    await made.wants.set(ALICE, AWAY, T5, 'raid');
    const pressed = await made.press(ALICE, want(T5), [want(T5), want(YVELTAL)]);
    expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    expect(made.said(pressed)).toBe(
      'Removed **T5 raids** from your list for that server. `/want` there adds it again.',
    );
    // In a DM nothing is hidden from anybody: the answer is an ordinary message.
    expect(sent(pressed.followUp).flags).toBeUndefined();
    expect(made.left(pressed)).toEqual([stopButtonId(HOME, want(YVELTAL))]);
    expect((await made.wants.list(ALICE, HOME)).wants).toEqual([
      { target: YVELTAL, scope: 'both' },
    ]);
    expect(await made.wants.count(ALICE, AWAY)).toBe(1);
  });

  it('is safe to repeat: what is gone already is said to be gone, and the button still goes', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    await made.press(ALICE, want(T5));
    const again = await made.press(ALICE, want(T5));
    expect(made.said(again)).toBe(
      '**T5 raids** was already removed from your list for that server.',
    );
    expect(sent(again.editReply).components).toEqual([]);
  });

  it('says so when the want it removed was for raids and spawns', async () => {
    const made = setup();
    const dratini = pokemonTarget(147);
    await made.wants.set(ALICE, HOME, dratini, 'both');
    expect(made.said(await made.press(ALICE, want(dratini)))).toBe(
      'Removed **Dratini** (raids and spawns) from your list for that server. ' +
        '`/want` there adds it again.',
    );
    await made.wants.set(ALICE, HOME, dratini, 'spawn');
    expect(made.said(await made.press(ALICE, want(dratini)))).toBe(
      'Removed **Dratini** from your list for that server. `/want` there adds it again.',
    );
  });

  it('takes both buttons off when two are pressed at once', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    await made.wants.set(ALICE, HOME, YVELTAL, 'raid');
    await made.gymTargets.add(ALICE, HOME, 1);
    const gym: NotifyReason = { kind: 'gym', gymId: 1 };
    // Three buttons under one message; two presses that both carry it as it was.
    const message = fakeMessage(made.rows([want(T5), want(YVELTAL), gym]));
    const presses = [want(T5), want(YVELTAL)].map((reason) =>
      fakeButton({
        customId: stopButtonId(HOME, reason) ?? '',
        isDm: true,
        userId: ALICE,
        message,
      }),
    );
    await Promise.all(presses.map((pressed) => made.router.handle(pressed as never)));
    expect(await made.wants.count(ALICE, HOME)).toBe(0);
    // Neither press put the other's button back: only the gym's is left.
    expect(
      message.rows.flatMap((row) =>
        row.components.map((control) => ('custom_id' in control ? control.custom_id : '')),
      ),
    ).toEqual([stopButtonId(HOME, gym)]);
    for (const pressed of presses) expect(pressed.fetchReply).toHaveBeenCalledTimes(1);
  });

  it('still answers when the message cannot be read anew or changed, and says so in the log', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    await made.wants.set(ALICE, HOME, YVELTAL, 'raid');
    const answer =
      'Removed **T5 raids** from your list for that server. `/want` there adds it again.';
    // It cannot be read anew: the rows are those the press itself carries.
    const unread = fakeButton({
      customId: stopButtonId(HOME, want(T5)) ?? '',
      isDm: true,
      userId: ALICE,
      messageRows: made.rows([want(T5), want(YVELTAL)]),
    });
    unread.fetchReply.mockImplementationOnce(() => Promise.reject(new Error('Discord is away')));
    await made.router.handle(unread as never);
    expect(made.said(unread)).toBe(answer);
    expect(made.left(unread)).toEqual([stopButtonId(HOME, want(YVELTAL))]);
    expect(
      made.entries.filter(
        (entry) => entry.msg === 'could not read a direct message anew to take a button off',
      ),
    ).toMatchObject([{ level: 40 }]);

    // It cannot be changed: the button stays, the want is gone and the answer says so.
    const unchanged = fakeButton({
      customId: stopButtonId(HOME, want(YVELTAL)) ?? '',
      isDm: true,
      userId: ALICE,
      messageRows: made.rows([want(YVELTAL)]),
    });
    unchanged.editReply.mockImplementationOnce(() => Promise.reject(new Error('Discord is away')));
    await made.router.handle(unchanged as never);
    expect(made.said(unchanged)).toBe(
      'Removed **Yveltal** from your list for that server. `/want` there adds it again.',
    );
    expect(await made.wants.count(ALICE, HOME)).toBe(0);
    expect(
      made.entries.filter((entry) => entry.msg === 'could not take a button off a direct message'),
    ).toMatchObject([{ level: 40 }]);
    expect(made.entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });

  it('removes one form, the shadow raids and an IV want each by itself', async () => {
    const made = setup();
    const origin = pokemonTarget(487, 'giratina_origin');
    const shadow = pokemonTarget(487, undefined, true);
    const perfect: NotificationTarget = { kind: 'iv', iv: 'perfect' };
    for (const target of [pokemonTarget(487), origin, shadow, perfect]) {
      await made.wants.set(ALICE, HOME, target, 'both');
    }
    expect(made.said(await made.press(ALICE, want(origin)))).toContain(
      'Removed **Giratina (Origin Forme)** (raids and spawns) from your list',
    );
    expect(made.said(await made.press(ALICE, want(shadow)))).toContain('**Shadow Giratina**');
    expect(made.said(await made.press(ALICE, want(perfect)))).toContain('**Perfect IV spawns**');
    expect((await made.wants.list(ALICE, HOME)).wants).toEqual([
      { target: pokemonTarget(487), scope: 'both' },
    ]);
  });

  it('removes a gym target', async () => {
    const made = setup();
    await made.gymTargets.add(ALICE, HOME, 1);
    await made.gymTargets.add(ALICE, HOME, 2);
    const pressed = await made.press(ALICE, { kind: 'gym', gymId: 1 });
    expect(made.said(pressed)).toBe(
      'Removed **The Stacks** from your gyms for that server. `/target` there adds it again.',
    );
    expect((await made.gymTargets.list(ALICE, HOME)).gymIds).toEqual([2]);
    expect(made.said(await made.press(ALICE, { kind: 'gym', gymId: 1 }))).toBe(
      '**The Stacks** was already removed from your gyms for that server.',
    );
  });

  it('switches the settings for the boss of an egg and for new trains off', async () => {
    const made = setup();
    await made.users.update(ALICE, { bossSetNotification: true });
    await made.newTrains.set(ALICE, HOME, true, 1);
    await made.newTrains.set(ALICE, AWAY, true, 1);
    expect(made.said(await made.press(ALICE, { kind: 'boss-set' }))).toMatch(
      /^Stopped: I will no longer tell you when an egg you are signed up for gets its boss\./,
    );
    expect(await made.users.get(ALICE)).toMatchObject({ bossSetNotification: false });
    expect(await made.newTrains.wanted(ALICE, HOME)).toBe(true);
    expect(made.said(await made.press(ALICE, { kind: 'boss-set' }))).toBe(
      'That was off already: I do not tell you when an egg you are signed up for gets its boss.',
    );
    expect(made.said(await made.press(ALICE, { kind: 'new-train' }))).toBe(
      'Stopped: I will no longer tell you about new trains in that server. ' +
        '`/settings new-train` there turns it back on.',
    );
    // In the server the button names, and in no other.
    expect(await made.newTrains.wanted(ALICE, HOME)).toBe(false);
    expect(await made.newTrains.wanted(ALICE, AWAY)).toBe(true);
    expect(made.said(await made.press(ALICE, { kind: 'new-train' }))).toBe(
      'That was off already: I do not tell you about new trains in that server.',
    );
  });

  it('removes what the presser has themself, whoever the message was for', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    const pressed = await made.press(BOB, want(T5));
    expect(made.said(pressed)).toBe(
      '**T5 raids** was already removed from your list for that server.',
    );
    expect(await made.wants.count(ALICE, HOME)).toBe(1);
  });

  it('keeps nothing in memory: a button works on a bot that never sent its message', async () => {
    const first = setup();
    await first.wants.set(ALICE, HOME, T5, 'raid');
    const customId = stopButtonId(HOME, want(T5)) ?? '';
    // Another router and context, as after a restart, over the same stored wants.
    const { ctx } = createTestContext({ wants: first.wants });
    const router = new InteractionRouter(ctx, [], components);
    const pressed = fakeButton({ customId, isDm: true, userId: ALICE });
    await router.handle(pressed as never);
    expect(sent(pressed.followUp).content).toMatch(/^Removed \*\*T5 raids\*\*/);
    expect(await first.wants.count(ALICE, HOME)).toBe(0);
  });

  it('answers a button it cannot read as no longer active, and changes nothing', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    for (const customId of [
      `dm:${HOME}:stop:t:T9`,
      `dm:${HOME}:stop:p:0`,
      `dm:${HOME}:stop:x:1`,
      `dm:${HOME}:stop`,
      `dm:${HOME}:start:t:T5`,
      'dm:not-a-server:stop:t:T5',
      `dm:${HOME}:stop:t:T5:extra`,
    ]) {
      const pressed = fakeButton({ customId, isDm: true, userId: ALICE });
      await made.router.handle(pressed as never);
      expect(sent(pressed.reply).content, customId).toBe('This control is no longer active.');
      expect(pressed.deferUpdate).not.toHaveBeenCalled();
    }
    expect(await made.wants.count(ALICE, HOME)).toBe(1);
  });

  it('reports a failure to the member and leaves the button where it is', async () => {
    const made = setup();
    made.wants.failing = new Error('the database is away');
    const pressed = await made.press(ALICE, want(T5));
    expect(pressed.editReply).not.toHaveBeenCalled();
    expect(sent(pressed.followUp).content).toMatch(/^Something went wrong/);
    expect(made.entries.some((entry) => entry.msg === 'interaction failed')).toBe(true);
  });

  it('is throttled like the other writes of a member, and listed with the controls', () => {
    expect(dmControls.throttle).toBe(MEMBER_WRITE_THROTTLE);
    expect(dmControls.guards).toBeUndefined();
    expect(components).toContain(dmControls);
  });

  it('refuses a member who presses more often than the limit allows, through the router', async () => {
    const made = setup();
    for (let use = 0; use < MEMBER_WRITE_THROTTLE.uses; use++) {
      const pressed = await made.press(ALICE, want(T5));
      expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    }
    await made.wants.set(ALICE, HOME, T5, 'raid');
    const refused = await made.press(ALICE, want(T5));
    expect(refused.deferUpdate).not.toHaveBeenCalled();
    expect(sent(refused.reply).content).toMatch(/wait|again in/i);
    expect(await made.wants.count(ALICE, HOME)).toBe(1);
    // Another member is not held back by it.
    expect((await made.press(BOB, want(T5))).deferUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('the custom id of a stop button', () => {
  /** A server with the longest snowflake there can be. */
  const LONGEST_GUILD = '18446744073709551615';
  const catalogue = catalogueFixture();

  it('fits for every entry of the catalogue, as a species, a form and their shadow raids', () => {
    let buttons = 0;
    const leftOut: string[] = [];
    for (const entry of catalogue.all) {
      const targets = [
        pokemonTarget(entry.dex),
        pokemonTarget(entry.dex, entry.key),
        pokemonTarget(entry.dex, undefined, true),
        pokemonTarget(entry.dex, entry.key, true),
        entryWant(catalogue, entry),
      ];
      for (const target of targets) {
        const id = stopButtonId(LONGEST_GUILD, want(target));
        if (id === undefined) {
          leftOut.push(entry.key);
          continue;
        }
        buttons += 1;
        expect(id.length).toBeLessThanOrEqual(100);
        const decoded = decodeCustomId(id);
        expect(decoded).toMatchObject({ kind: 'dm', id: LONGEST_GUILD, action: 'stop' });
        expect(parseStopArgs(decoded?.args ?? [])).toEqual(want(target));
      }
    }
    expect(buttons).toBeGreaterThan(1_000);
    // With the game data of the fixture no key is too long: every want gets its button.
    expect(leftOut).toEqual([]);
  });

  it('is knowingly left out for a form whose key does not fit, and the message names the command', () => {
    const long = pokemonTarget(999_999, 'x'.repeat(64), true);
    expect(stopButtonId(LONGEST_GUILD, want(long))).toBeUndefined();
    const message = notifyDm(
      'A raid.',
      [
        { label: 'Shadow Longname', stop: undefined, command: '/unwant' },
        { label: 'T5 raids', stop: stopButtonId(HOME, want(T5)), command: '/unwant' },
      ],
      undefined,
    );
    expect(message.content).toBe(
      'A raid.\n-# You asked to be told about: Shadow Longname · T5 raids\n' +
        '-# To stop what has no button here, use `/unwant` in the server.',
    );
    expect(message.components).toEqual([
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            custom_id: `dm:${HOME}:stop:t:T5`,
            label: 'Stop: T5 raids',
          },
        ],
      },
    ]);
  });

  it('fits for every tier, both IV targets, a gym and the two settings', () => {
    const reasons: NotifyReason[] = [
      want({ kind: 'tier', tier: { level: 'MegaLegendary', shadow: false } }),
      want({ kind: 'tier', tier: { level: 'T5', shadow: true } }),
      want({ kind: 'iv', iv: 'perfect' }),
      want({ kind: 'iv', iv: 'zero' }),
      { kind: 'gym', gymId: 4_294_967_295 },
      { kind: 'boss-set' },
      { kind: 'new-train' },
    ];
    for (const reason of reasons) {
      const id = stopButtonId(LONGEST_GUILD, reason);
      expect(id).toBeDefined();
      expect(parseStopArgs(decodeCustomId(id ?? '')?.args ?? [])).toEqual(reason);
    }
  });
});
```

Apply to `src/discord/custom-id.test.ts`:

```diff
--- a/src/discord/custom-id.test.ts
+++ b/src/discord/custom-id.test.ts
@@ -1,5 +1,10 @@
 import { describe, expect, it } from 'vitest';
-import { decodeCustomId, encodeCustomId, MAX_CUSTOM_ID_LENGTH } from './custom-id.js';
+import {
+  decodeCustomId,
+  encodeCustomId,
+  encodeCustomIdIfFits,
+  MAX_CUSTOM_ID_LENGTH,
+} from './custom-id.js';
 
 const PARTY = '7f3c2a10-5b6e-4c1d-9a8b-0123456789ab';
 
@@ -76,3 +81,20 @@ describe('custom ids', () => {
     expect(decodeCustomId('p::join')).toBeUndefined();
   });
 });
+
+describe('encodeCustomIdIfFits', () => {
+  it('gives the id when it fits and undefined when it is too long', () => {
+    expect(encodeCustomIdIfFits({ kind: 'dm', id: '1', action: 'stop', args: ['g', '4'] })).toBe(
+      'dm:1:stop:g:4',
+    );
+    expect(encodeCustomIdIfFits({ kind: 'p', id: 'x'.repeat(93), action: 'join' })).toHaveLength(
+      MAX_CUSTOM_ID_LENGTH,
+    );
+    expect(encodeCustomIdIfFits({ kind: 'p', id: 'x'.repeat(94), action: 'join' })).toBeUndefined();
+  });
+
+  it('still throws for a part that is empty or has the separator', () => {
+    expect(() => encodeCustomIdIfFits({ kind: 'p', id: '', action: 'join' })).toThrow(/empty/);
+    expect(() => encodeCustomIdIfFits({ kind: 'p', id: 'a:b', action: 'join' })).toThrow(/":"/);
+  });
+});
```

Apply to `src/domain/notify/reasons.test.ts`:

```diff
--- a/src/domain/notify/reasons.test.ts
+++ b/src/domain/notify/reasons.test.ts
@@ -8,11 +8,14 @@ import {
 } from '../pogo/notification-target.js';
 import type { RaidLevel } from '../pogo/raid-tier.js';
 import {
+  parseStopArgs,
   raidNumbers,
   raidWantsFiring,
   reasonKey,
   spawnNumbers,
   spawnWantsFiring,
+  stopArgs,
+  type NotifyReason,
   type RaidSighting,
 } from './reasons.js';
 
@@ -179,3 +182,65 @@ describe('reasonKey', () => {
     );
   });
 });
+
+describe('stopArgs and parseStopArgs', () => {
+  const reasons: Array<[NotifyReason, string[]]> = [
+    [{ kind: 'want', target: pokemonTarget(487) }, ['p', '487']],
+    [
+      { kind: 'want', target: pokemonTarget(487, 'giratina_origin') },
+      ['p', '487', 'giratina_origin'],
+    ],
+    [{ kind: 'want', target: pokemonTarget(487, undefined, true) }, ['ps', '487']],
+    [
+      { kind: 'want', target: pokemonTarget(487, 'giratina_origin', true) },
+      ['ps', '487', 'giratina_origin'],
+    ],
+    [{ kind: 'want', target: tier('T5') }, ['t', 'T5']],
+    [{ kind: 'want', target: tier('T5', true) }, ['ts', 'T5']],
+    [{ kind: 'want', target: tier('MegaLegendary') }, ['t', 'MegaLegendary']],
+    [{ kind: 'want', target: PERFECT }, ['iv', 'perfect']],
+    [{ kind: 'want', target: ZERO }, ['iv', 'zero']],
+    [{ kind: 'gym', gymId: 12 }, ['g', '12']],
+    [{ kind: 'boss-set' }, ['boss']],
+    [{ kind: 'new-train' }, ['train']],
+  ];
+
+  it('spells every reason without an empty part or a colon, and reads it back', () => {
+    for (const [reason, args] of reasons) {
+      expect(stopArgs(reason)).toEqual(args);
+      expect(parseStopArgs(args)).toEqual(reason);
+      for (const part of args) {
+        expect(part).not.toBe('');
+        expect(part).not.toContain(':');
+      }
+    }
+  });
+
+  it('reads nothing else', () => {
+    for (const args of [
+      [],
+      ['p'],
+      ['p', '0'],
+      ['p', '-5'],
+      ['p', '1000000'],
+      ['p', '487', 'Origin Forme'],
+      ['p', '487', 'giratina_origin', 'more'],
+      ['ps', 'abc'],
+      ['t', 'T9'],
+      ['t', 'T5', 'shadow'],
+      ['ts', 'Mega'],
+      ['ts', 'EX'],
+      ['iv', 'some'],
+      ['iv'],
+      ['g', '0'],
+      ['g', '4x'],
+      ['g', '12345678901'],
+      ['g', '4', '5'],
+      ['boss', 'now'],
+      ['train', '1'],
+      ['pokemon', '150'],
+    ]) {
+      expect(parseStopArgs(args), args.join(':')).toBeUndefined();
+    }
+  });
+});
```

Apply to `src/render/notify-dm.test.ts`:

```diff
--- a/src/render/notify-dm.test.ts
+++ b/src/render/notify-dm.test.ts
@@ -1,5 +1,16 @@
 import { describe, expect, it } from 'vitest';
-import { notifyDm, postLink, raidDmSentence, reasonLine, type RaidDmView } from './notify-dm.js';
+import {
+  notifyDm,
+  postLink,
+  raidDmSentence,
+  reasonLine,
+  stopButtonId,
+  stopHint,
+  stopRow,
+  withoutButton,
+  type RaidDmView,
+  type ShownReason,
+} from './notify-dm.js';
 
 const GUILD = '412345678901234567';
 const POST = '900000000000000001';
@@ -115,3 +126,65 @@ describe('reasonLine and notifyDm', () => {
     expect(notifyDm('A raid.', [], undefined)).toEqual({ content: 'A raid.' });
   });
 });
+
+describe('the stop buttons of a message', () => {
+  const reason = (n: number, more: Partial<ShownReason> = {}): ShownReason => ({
+    label: `reason ${String(n)}`,
+    stop: `dm:${GUILD}:stop:g:${String(n)}`,
+    command: '/untarget',
+    ...more,
+  });
+  const ids = (rows: ReturnType<typeof stopRow>): string[] =>
+    rows.flatMap((row) =>
+      row.components.map((control) => ('custom_id' in control ? control.custom_id : '')),
+    );
+
+  it('spells the id of a button with the server as its id', () => {
+    expect(stopButtonId(GUILD, { kind: 'gym', gymId: 4 })).toBe(`dm:${GUILD}:stop:g:4`);
+    expect(stopButtonId(GUILD, { kind: 'boss-set' })).toBe(`dm:${GUILD}:stop:boss`);
+  });
+
+  it('has one button per reason in one row, labelled with what it stops', () => {
+    const rows = stopRow([reason(1), reason(2, { label: 'Giratina \\(Origin Forme\\) \\_x\\_' })]);
+    expect(rows).toHaveLength(1);
+    expect(rows[0]?.components).toMatchObject([
+      { label: 'Stop: reason 1', custom_id: `dm:${GUILD}:stop:g:1` },
+      // A button shows no Markdown, so the label is the name without its escapes.
+      { label: 'Stop: Giratina (Origin Forme) _x_' },
+    ]);
+  });
+
+  it('has five buttons at most, and names the command for what has none', () => {
+    const many = [1, 2, 3, 4, 5, 6].map((n) => reason(n));
+    expect(ids(stopRow(many))).toHaveLength(5);
+    expect(stopHint(many)).toBe(
+      '-# To stop what has no button here, use `/untarget` in the server.',
+    );
+    expect(stopHint(many.slice(0, 5))).toBe('');
+    const mixed = [reason(1, { stop: undefined, command: '/unwant' }), reason(2)];
+    expect(ids(stopRow(mixed))).toEqual([`dm:${GUILD}:stop:g:2`]);
+    expect(stopHint(mixed)).toBe(
+      '-# To stop what has no button here, use `/unwant` in the server.',
+    );
+  });
+
+  it('has no row and no hint for reasons that cannot be stopped', () => {
+    expect(stopRow([{ label: 'a meeting time' }])).toEqual([]);
+    expect(stopHint([{ label: 'a meeting time' }])).toBe('');
+    expect(notifyDm('News.', [], undefined).components).toBeUndefined();
+  });
+
+  it('cuts a label to what a button holds', () => {
+    const [row] = stopRow([reason(1, { label: 'x'.repeat(200) })]);
+    const [button] = row?.components ?? [];
+    expect(button && 'label' in button ? button.label?.length : 0).toBe(80);
+  });
+
+  it('takes one button off a message and leaves the others; an empty row goes', () => {
+    const rows = stopRow([reason(1), reason(2), reason(3)]);
+    const left = withoutButton(rows, `dm:${GUILD}:stop:g:2`);
+    expect(ids(left)).toEqual([`dm:${GUILD}:stop:g:1`, `dm:${GUILD}:stop:g:3`]);
+    expect(withoutButton(stopRow([reason(1)]), `dm:${GUILD}:stop:g:1`)).toEqual([]);
+    expect(withoutButton(rows, 'dm:other')).toEqual(rows);
+  });
+});
```

Apply to `src/services/notify-service.test.ts`:

```diff
--- a/src/services/notify-service.test.ts
+++ b/src/services/notify-service.test.ts
@@ -1,9 +1,15 @@
 import { describe, expect, it } from 'vitest';
+import { FakeDmGateway } from '../../test/support/dms.js';
+import { fakeButton } from '../../test/support/fake-interactions.js';
+import { gymsFixture } from '../../test/support/providers.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import { components } from '../components/index.js';
+import { InteractionRouter } from '../discord/router.js';
+import { PartyStatus } from '../domain/party/status.js';
 import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
 import { partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
 import { loadSettings } from '../config/settings.js';
-import { PartyStatus } from '../domain/party/status.js';
 import { pokemonTarget, type NotificationTarget } from '../domain/pogo/notification-target.js';
 import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
 import { postLink } from '../render/notify-dm.js';
@@ -214,6 +220,71 @@ describe('NotifyService: a raid is reported', () => {
   });
 });
 
+describe('NotifyService: the buttons that stop a message', () => {
+  it('gives every reason of a message its button, for the server of the raid', async () => {
+    const made = await reported(
+      async ({ wants, gymTargets, gateway }) => {
+        await wants.set(ALICE, gateway.guildId, T5, 'raid');
+        await wants.set(ALICE, gateway.guildId, YVELTAL, 'raid');
+        await gymTargets.add(ALICE, gateway.guildId, 1);
+      },
+      { boss: { key: 'yveltal' } },
+    );
+    const guild = made.gateway.guildId;
+    expect(made.dms.to(ALICE)[0]?.components).toEqual([
+      {
+        type: 1,
+        components: [
+          { type: 2, style: 2, custom_id: `dm:${guild}:stop:t:T5`, label: 'Stop: T5 raids' },
+          { type: 2, style: 2, custom_id: `dm:${guild}:stop:p:717`, label: 'Stop: Yveltal' },
+          {
+            type: 2,
+            style: 2,
+            custom_id: `dm:${guild}:stop:g:1`,
+            label: 'Stop: raids at The Stacks',
+          },
+        ],
+      },
+    ]);
+  });
+
+  it('is a message Discord takes, and a pressed button ends the messages for that reason', async () => {
+    const made = await reported(async ({ wants, gateway }) => {
+      await wants.set(ALICE, gateway.guildId, T5, 'raid');
+    });
+    const [message] = made.dms.to(ALICE);
+    if (!message) throw new Error('Alice was not told');
+    const dmGateway = new FakeDmGateway();
+    expect(await dmGateway.send(ALICE, message)).toBe('sent');
+    // The press, as the router handles it in a DM.
+    const { ctx } = createTestContext({ wants: made.wants, gymTargets: made.gymTargets });
+    const row = message.components?.[0];
+    const button = row?.components[0];
+    const customId = button && 'custom_id' in button ? button.custom_id : '';
+    const pressed = fakeButton({
+      customId,
+      isDm: true,
+      userId: ALICE,
+      messageRows: [row ?? { type: 1, components: [] }],
+    });
+    await new InteractionRouter(ctx, [], components).handle(pressed as never);
+    expect(await made.wants.count(ALICE, made.gateway.guildId)).toBe(0);
+    // The next raid of that tier tells her nothing.
+    const gym = gymsFixture().get(2);
+    if (!gym) throw new Error('no gym 2');
+    await made.service.reportRaid({
+      gym,
+      reporterId: BOB,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: { level: 'T5', shadow: false },
+      boss: null,
+    });
+    await made.notify.flush();
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+});
+
 describe('NotifyService: a raid changes', () => {
   /** An egg at the Library that Alice (T5) and Carol (the gym) were told about. */
   const egg = () =>
```

Apply to `test/support/fake-interactions.test.ts`:

```diff
--- a/test/support/fake-interactions.test.ts
+++ b/test/support/fake-interactions.test.ts
@@ -6,6 +6,7 @@ import {
   fakeAutocomplete,
   fakeButton,
   fakeChatInput,
+  fakeMessage,
   fakeModal,
   fakeSelect,
   sent,
@@ -194,3 +195,33 @@ describe('fake interactions', () => {
     expect([dm.inGuild(), dm.guildId, dm.channel?.isDMBased()]).toEqual([false, null, true]);
   });
 });
+
+describe('the message a control is on', () => {
+  const row = (...ids: string[]) => ({
+    type: 1,
+    components: ids.map((custom_id) => ({ type: 2, custom_id })),
+  });
+
+  it('is there for a button, a select and a modal only', () => {
+    expect('message' in fakeButton({ customId: 'a:1:b' })).toBe(true);
+    expect('message' in fakeSelect({ customId: 'a:1:b' })).toBe(true);
+    expect('message' in fakeModal({ customId: 'a:1:b' })).toBe(true);
+    expect('message' in fakeChatInput()).toBe(false);
+    expect('message' in fakeAutocomplete()).toBe(false);
+  });
+
+  it('is shared by presses on one message: a press sees it as it was, `fetchReply` as it is', async () => {
+    const message = fakeMessage([row('a:1:x', 'a:1:y')]);
+    const first = fakeButton({ customId: 'a:1:x', message });
+    const second = fakeButton({ customId: 'a:1:y', message });
+    await first.deferUpdate();
+    await first.editReply({ components: [row('a:1:y')] });
+    // The second press was made before the edit: it carries the message as it was then.
+    expect(second.message?.components[0]?.toJSON().components).toHaveLength(2);
+    await second.deferUpdate();
+    const fresh = await second.fetchReply();
+    expect(fresh.id).toBe(message.id);
+    expect(fresh.components[0]?.toJSON()).toEqual(row('a:1:y'));
+    await expect(fakeButton({ customId: 'a:1:x' }).fetchReply()).rejects.toThrow();
+  });
+});
```

Apply to `test/support/fake-interactions.ts`:

```diff
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -58,6 +58,37 @@ export interface FakeOptions {
   values?: string[];
   /** Modal: the text typed into each input, by the input's custom id. */
   fields?: Record<string, string>;
+  /**
+   * A control: the rows of controls of the message it is on, as Discord's API has them
+   * (`interaction.message.components`, each with its `toJSON()`).
+   */
+  messageRows?: readonly FakeRow[];
+  /**
+   * A control: the message it is on, for several presses on one message (`fakeMessage`). The
+   * press sees the message as it was when the fake was made, as Discord sends it with the
+   * interaction; `fetchReply` gives it as it is now, and `editReply` after `deferUpdate`
+   * changes its rows. Without it the fake has a message of its own with `messageRows`.
+   */
+  message?: FakeMessage;
+}
+
+/** A row of controls as Discord's API has it. */
+export interface FakeRow {
+  type: number;
+  components: readonly object[];
+}
+
+/** A message with controls that several fake presses can share. */
+export interface FakeMessage {
+  id: string;
+  rows: readonly FakeRow[];
+}
+
+export const FAKE_MESSAGE_ID = '950000000000000001';
+
+/** A message with these rows of controls, for presses that are made on the same message. */
+export function fakeMessage(rows: readonly FakeRow[], id = FAKE_MESSAGE_ID): FakeMessage {
+  return { id, rows };
 }
 
 type Kind = 'chat' | 'autocomplete' | 'button' | 'select' | 'modal';
@@ -143,6 +174,14 @@ function base(kind: Kind, o: FakeOptions) {
   const refuseIfFresh = (): Promise<never> | undefined =>
     interaction.deferred || interaction.replied ? undefined : Promise.reject(notReplied());
 
+  /** The message a control is on; shared by the presses a test makes on one message. */
+  const shown: FakeMessage = o.message ?? fakeMessage(o.messageRows ?? []);
+  const shownMessage = () => ({
+    id: shown.id,
+    components: shown.rows.map((row) => ({ type: row.type, toJSON: () => row })),
+  });
+  /** Whether the interaction was acknowledged with `deferUpdate`. */
+  let updating = false;
   const interaction = {
     id: '900000000000000001',
     type: TYPE[kind],
@@ -177,6 +216,10 @@ function base(kind: Kind, o: FakeOptions) {
             },
           },
     channel: fakeChannel(o, channelId),
+    // As in discord.js, only what comes from a message has one: a control, and a modal.
+    ...(kind === 'button' || kind === 'select' || kind === 'modal'
+      ? { message: shownMessage() }
+      : {}),
     deferred: o.deferred ?? false,
     replied: o.replied ?? false,
     /** As in discord.js: null until a reply or deferral says which. */
@@ -238,12 +281,26 @@ function base(kind: Kind, o: FakeOptions) {
       interaction.ephemeral = isEphemeral(payload);
       return Promise.resolve();
     }),
-    editReply: vi.fn((_payload: SentPayload) => {
+    editReply: vi.fn((payload: SentPayload) => {
       const refused = refuseIfFresh();
       if (refused) return refused;
       interaction.replied = true;
+      // After `deferUpdate` the reply is the message the control is on.
+      if (updating && payload.components !== undefined) {
+        shown.rows = payload.components.map((row) =>
+          typeof (row as { toJSON?: unknown }).toJSON === 'function'
+            ? (row as { toJSON(): FakeRow }).toJSON()
+            : (row as FakeRow),
+        );
+      }
       return Promise.resolve();
     }),
+    /** The reply as it is now: after `deferUpdate`, the message the control is on. */
+    fetchReply: vi.fn(() => {
+      const refused = refuseIfFresh();
+      if (refused) return refused;
+      return Promise.resolve(shownMessage());
+    }),
     deleteReply: vi.fn(() => {
       const refused = refuseIfFresh();
       if (refused) return refused;
@@ -260,6 +317,7 @@ function base(kind: Kind, o: FakeOptions) {
       const refused = refuseIfAcknowledged();
       if (refused) return refused;
       interaction.deferred = true;
+      updating = true;
       return Promise.resolve();
     }),
     update: vi.fn((_payload: SentPayload) => {
```

Run: `npx vitest run --project unit src/components/dm.test.ts src/discord/custom-id.test.ts src/domain/notify/reasons.test.ts src/render/notify-dm.test.ts src/services/notify-service.test.ts test/support/fake-interactions.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Create `src/components/dm.ts`:

```ts
import { ComponentType, type Message } from 'discord.js';
import type { AppContext } from '../app-context.js';
import { SCOPE_WORDS } from '../commands/notifications/want-input.js';
import type { ComponentHandler } from '../discord/command.js';
import { UserError } from '../discord/errors.js';
import { STALE_COMPONENT } from '../discord/router.js';
import { MEMBER_WRITE_THROTTLE } from '../discord/throttle.js';
import { parseStopArgs, type NotifyReason } from '../domain/notify/reasons.js';
import { wantTargetLabel, wantToken } from '../domain/pogo/wants.js';
import { DM_KIND, STOP_ACTION, withoutButton, type ControlRows } from '../render/notify-dm.js';
import { gymName } from '../render/raid-post.js';
import { plain } from '../render/text.js';
import { KeyedLock } from '../services/keyed-lock.js';

/** What a server's snowflake looks like: the id of a stop button must be one. */
const SNOWFLAKE = /^\d{17,20}$/;

/**
 * Stops one reason for the member who pressed, in the server the button names: removes the
 * want or the gym target, or switches the setting off. Gives the sentence that says what came
 * of it. Safe to repeat: what is gone already is said to be gone.
 */
async function stop(
  ctx: AppContext,
  memberId: string,
  guildId: string,
  reason: NotifyReason,
): Promise<string> {
  switch (reason.kind) {
    case 'want': {
      const name = plain(wantTargetLabel(ctx.gameData.catalogue, reason.target));
      // What it was for, read before it goes: a want for raids and spawns ends both, which
      // the member who pressed under a message about a raid may not expect.
      const token = wantToken(reason.target);
      const had = (await ctx.wants.list(memberId, guildId)).wants.find(
        (want) => wantToken(want.target) === token,
      );
      const removed = await ctx.wants.remove(memberId, guildId, reason.target);
      const both = had?.scope === 'both' ? ` (${SCOPE_WORDS.both})` : '';
      return removed
        ? `Removed **${name}**${both} from your list for that server. \`/want\` there adds it again.`
        : `**${name}** was already removed from your list for that server.`;
    }
    case 'gym': {
      const name = plain(gymName(ctx.gyms.get(reason.gymId)));
      const removed = await ctx.gymTargets.remove(memberId, guildId, reason.gymId);
      return removed
        ? `Removed **${name}** from your gyms for that server. \`/target\` there adds it again.`
        : `**${name}** was already removed from your gyms for that server.`;
    }
    case 'boss-set': {
      const { bossSetNotification } = await ctx.users.get(memberId);
      if (!bossSetNotification) {
        return 'That was off already: I do not tell you when an egg you are signed up for gets its boss.';
      }
      await ctx.users.update(memberId, { bossSetNotification: false });
      return (
        'Stopped: I will no longer tell you when an egg you are signed up for gets its boss. ' +
        '`/settings boss-set` in a server turns it back on.'
      );
    }
    case 'new-train': {
      // Per server, like the wants: the button names the server of the train.
      const stopped = await ctx.newTrains.set(memberId, guildId, false, Date.now());
      return stopped
        ? 'Stopped: I will no longer tell you about new trains in that server. ' +
            '`/settings new-train` there turns it back on.'
        : 'That was off already: I do not tell you about new trains in that server.';
    }
  }
}

/** The rows of controls of a message, as Discord's API has them. */
function rowsOf(message: Pick<Message, 'components'>): ControlRows {
  return message.components.flatMap((row) =>
    row.type === ComponentType.ActionRow ? [row.toJSON()] : [],
  );
}

/**
 * The messages whose buttons are being taken off, one press at a time per message: two buttons
 * of one message pressed quickly would each write the rows as its own press saw them, and the
 * second would put the first one's button back.
 */
const messages = new KeyedLock<string>();

/**
 * The buttons under a direct message of the notifier (custom-id kind `dm`; the id is the
 * server's snowflake, see `custom-id.ts`). "Stop: …" stops that one reason for whoever pressed
 * it: nothing is looked up about the message or its recipient, so a press works after a
 * restart and removes only what the presser has themself. The answer comes in the DM, and the
 * button goes from the message while the others stay: the message is read anew for that
 * (`fetchReply`: after `deferUpdate` the reply is the message the button is on), one press
 * after the other, so that a button another press took off meanwhile stays off. What was
 * stopped is stopped by then, so the answer is given whatever becomes of the button: when the
 * message cannot be read anew its rows are those the press carries, and when it cannot be
 * changed the button stays (pressing it again says that it was removed already).
 *
 * It has no guards: a press comes from a DM, where there is no server and no member.
 */
export const dmControls: ComponentHandler = {
  kind: DM_KIND,
  throttle: MEMBER_WRITE_THROTTLE,
  async button(interaction, id, ctx) {
    const reason = id.action === STOP_ACTION ? parseStopArgs(id.args) : undefined;
    if (!reason || !SNOWFLAKE.test(id.id)) throw new UserError(STALE_COMPONENT);
    // The database first: the button goes only once it is known what came of it.
    await interaction.deferUpdate();
    const said = await stop(ctx, interaction.user.id, id.id, reason);
    await messages.run(interaction.message.id, async () => {
      let now: Pick<Message, 'components'> = interaction.message;
      try {
        now = await interaction.fetchReply();
      } catch (err) {
        ctx.log.warn({ err }, 'could not read a direct message anew to take a button off');
      }
      try {
        await interaction.editReply({
          components: withoutButton(rowsOf(now), interaction.customId),
        });
      } catch (err) {
        ctx.log.warn({ err }, 'could not take a button off a direct message');
      }
    });
    await interaction.followUp({ content: said });
  },
};
```

Apply to `src/components/index.ts`:

```diff
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -4,6 +4,7 @@ import { wantControls } from '../commands/notifications/wants.js';
 import { locationControls } from '../commands/raids/location.js';
 import { raidControls } from '../commands/raids/raid.js';
 import type { ComponentHandler } from '../discord/command.js';
+import { dmControls } from './dm.js';
 import { partyButtons } from './party.js';
 
 /** Every handler of buttons, select menus and modals. The router reads this list. */
@@ -15,4 +16,5 @@ export const components: readonly ComponentHandler[] = [
   targetControls,
   targetRemovalControls,
   partyButtons,
+  dmControls,
 ];
```

Apply to `src/discord/custom-id.ts`:

```diff
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -1,3 +1,15 @@
+/**
+ * The custom ids of this bot's controls: `<kind>:<id>:<action>[:<arg>...]`, at most 100
+ * characters, no part empty and none with a `:` in it. The second part is always an id: what
+ * the control is about (a party's id, the token of a pending question).
+ *
+ * The buttons under a direct message have the kind `dm`, and their id is the snowflake of the
+ * server the message is about: a press comes from a DM, which has no server of its own.
+ * `dm:<server>:stop:<reason>` stops one reason the message came for; the reason is spelled as
+ * `stopArgs` (`src/domain/notify/reasons.ts`) says: `p:<dex>[:<form>]`, `ps:…`, `t:<level>`,
+ * `ts:<level>`, `iv:perfect|zero`, `g:<gym id>`, `boss`, `train`. (The spec's example
+ * `dm:stop:pokemon:150` had no id and no server; this replaces it.)
+ */
 export const MAX_CUSTOM_ID_LENGTH = 100;
 const SEPARATOR = ':';
 
@@ -28,6 +40,21 @@ export function encodeCustomId(parts: {
   return raw;
 }
 
+/**
+ * As `encodeCustomId`, but undefined for an id that would be longer than Discord allows: for a
+ * control whose id carries something of varying length (a catalogue key) and that is knowingly
+ * left out when it does not fit. An empty part or a `:` in one still throws.
+ */
+export function encodeCustomIdIfFits(parts: {
+  kind: string;
+  id: string;
+  action: string;
+  args?: string[];
+}): string | undefined {
+  const length = [parts.kind, parts.id, parts.action, ...(parts.args ?? [])].join(SEPARATOR).length;
+  return length > MAX_CUSTOM_ID_LENGTH ? undefined : encodeCustomId(parts);
+}
+
 /** Returns undefined for anything not produced by encodeCustomId. */
 export function decodeCustomId(raw: string): CustomId | undefined {
   const [kind, id, action, ...args] = raw.split(SEPARATOR);
```

Apply to `src/domain/notify/reasons.ts`:

```diff
--- a/src/domain/notify/reasons.ts
+++ b/src/domain/notify/reasons.ts
@@ -1,11 +1,15 @@
 import type { PokemonCatalogue } from '../pogo/catalogue.js';
 import {
+  isFormKey,
+  isNotificationTier,
+  isPokedexNumber,
   ivCode,
+  pokemonTarget,
   tierCode,
   type NotificationTarget,
   type Want,
 } from '../pogo/notification-target.js';
-import { sameRaidTier, type RaidTier } from '../pogo/raid-tier.js';
+import { isRaidLevel, raidTier, sameRaidTier, type RaidTier } from '../pogo/raid-tier.js';
 import { pokemonWantFits, wantToken } from '../pogo/wants.js';
 
 /**
@@ -131,3 +135,78 @@ export function spawnWantsFiring(
     })
     .map((want) => want.target);
 }
+
+/**
+ * A reason as the arguments of a custom id (`dm:<server>:stop:<these>`): what the button under
+ * a direct message carries to stop it. `wantToken` does not fit there: it has `:` in it and an
+ * empty part for the shadow raids of a species, and the custom-id codec takes neither. So the
+ * kind and the shadow flag are one word, and nothing is ever empty:
+ *
+ * - `p:<dex>` a species, `p:<dex>:<form>` one form (its catalogue key);
+ * - `ps:<dex>` and `ps:<dex>:<form>` the shadow raids of either;
+ * - `t:<level>` a raid tier, `ts:<level>` its shadow raids (the level as `RaidLevel` spells it);
+ * - `iv:perfect`, `iv:zero`;
+ * - `g:<gym id>` a gym target;
+ * - `boss` the setting "tell me when my egg gets its boss", `train` the setting for new trains.
+ *
+ * A form key may be 64 characters, so with the server's snowflake before it an id can pass
+ * Discord's 100: whoever builds the button leaves it out then (`encodeCustomIdIfFits`).
+ */
+export function stopArgs(reason: NotifyReason): string[] {
+  switch (reason.kind) {
+    case 'gym':
+      return ['g', String(reason.gymId)];
+    case 'boss-set':
+      return ['boss'];
+    case 'new-train':
+      return ['train'];
+    case 'want': {
+      const { target } = reason;
+      if (target.kind === 'iv') return ['iv', target.iv];
+      if (target.kind === 'tier') return [target.tier.shadow ? 'ts' : 't', target.tier.level];
+      return [
+        target.shadow ? 'ps' : 'p',
+        String(target.dex),
+        ...(target.form === undefined ? [] : [target.form]),
+      ];
+    }
+  }
+}
+
+/**
+ * The reason that arguments of a custom id spell (`stopArgs`); undefined for anything else,
+ * also for a tier that cannot be wanted, a number that is no Pokédex number or gym id, and a
+ * form that cannot be a catalogue key. Whether the Pokémon or the gym exists is not asked: the
+ * button removes what the member has, whatever the game data says today.
+ */
+export function parseStopArgs(args: readonly string[]): NotifyReason | undefined {
+  const [kind, value, extra, ...more] = args;
+  if (more.length > 0) return undefined;
+  if (kind === 'boss' || kind === 'train') {
+    if (value !== undefined) return undefined;
+    return { kind: kind === 'boss' ? 'boss-set' : 'new-train' };
+  }
+  if (value === undefined) return undefined;
+  if (kind === 'p' || kind === 'ps') {
+    if (!/^[1-9]\d*$/.test(value) || !isPokedexNumber(Number(value))) return undefined;
+    if (extra !== undefined && !isFormKey(extra)) return undefined;
+    return { kind: 'want', target: pokemonTarget(Number(value), extra, kind === 'ps') };
+  }
+  if (extra !== undefined) return undefined;
+  if (kind === 'g') {
+    if (!/^[1-9]\d{0,9}$/.test(value)) return undefined;
+    return { kind: 'gym', gymId: Number(value) };
+  }
+  if (kind === 'iv') {
+    return value === 'perfect' || value === 'zero'
+      ? { kind: 'want', target: { kind: 'iv', iv: value } }
+      : undefined;
+  }
+  if ((kind === 't' || kind === 'ts') && isRaidLevel(value)) {
+    const tier = raidTier(value, kind === 'ts');
+    return tier && isNotificationTier(tier)
+      ? { kind: 'want', target: { kind: 'tier', tier } }
+      : undefined;
+  }
+  return undefined;
+}
```

Apply to `src/render/notify-dm.ts`:

```diff
--- a/src/render/notify-dm.ts
+++ b/src/render/notify-dm.ts
@@ -1,7 +1,57 @@
-import type { APIEmbed } from 'discord.js';
+import {
+  ButtonStyle,
+  ComponentType,
+  type APIActionRowComponent,
+  type APIButtonComponentWithCustomId,
+  type APIComponentInMessageActionRow,
+  type APIEmbed,
+} from 'discord.js';
+import { encodeCustomIdIfFits } from '../discord/custom-id.js';
 import type { OutgoingMessage } from '../discord/party-gateway.js';
+import { stopArgs, type NotifyReason } from '../domain/notify/reasons.js';
 import { raidTierLabel, type RaidTier } from '../domain/pogo/raid-tier.js';
-import { memberName, plain, type NamedMember } from './text.js';
+import { memberName, plain, truncate, type NamedMember } from './text.js';
+
+/** The custom-id kind of the buttons under a direct message. */
+export const DM_KIND = 'dm';
+/** The action of a button that stops one reason a direct message came for. */
+export const STOP_ACTION = 'stop';
+/** A row holds five buttons: as many reasons of one message as get a button. */
+const MAX_STOP_BUTTONS = 5;
+/** Discord's limit for the label of a button. */
+const BUTTON_LABEL = 80;
+
+/**
+ * The custom id of the button that stops a reason in a server; undefined when it would not fit
+ * into a custom id (a form with a very long key): the message then has no button for that
+ * reason and names the command instead.
+ */
+export function stopButtonId(guildId: string, reason: NotifyReason): string | undefined {
+  return encodeCustomIdIfFits({
+    kind: DM_KIND,
+    id: guildId,
+    action: STOP_ACTION,
+    args: stopArgs(reason),
+  });
+}
+
+/** A message's rows of controls as Discord's API has them. */
+export type ControlRows = APIActionRowComponent<APIComponentInMessageActionRow>[];
+
+/**
+ * The rows of a message without the button of this custom id; a row that has nothing left
+ * goes too. What a press of a stop button leaves of the message's controls.
+ */
+export function withoutButton(rows: ControlRows, customId: string): ControlRows {
+  return rows
+    .map((row) => ({
+      ...row,
+      components: row.components.filter(
+        (control) => !('custom_id' in control) || control.custom_id !== customId,
+      ),
+    }))
+    .filter((row) => row.components.length > 0);
+}
 
 /**
  * A link to a post, or to a message in a channel, that works in a direct message. A mention
@@ -80,6 +130,54 @@ export function raidDmSentence(view: RaidDmView): string {
 export interface ShownReason {
   /** What the member asked for, made plain: `Yveltal`, `T5 raids`, `raids at The Stacks`. */
   label: string;
+  /**
+   * The custom id of the button that stops it (`stopButtonId`). Left out for a message that
+   * has no opt-out, and undefined for a reason whose id does not fit: `command` is named then.
+   */
+  stop?: string | undefined;
+  /** The command that stops it in the server, as a member types it: `/unwant`. */
+  command?: string;
+}
+
+/**
+ * The buttons that stop the reasons of a message, one row, five at most: "Stop: T5 raids". A
+ * label says what it stops, in the words of the reasons line, without Markdown (a button shows
+ * none). No row when no reason has a button.
+ */
+export function stopRow(reasons: readonly ShownReason[]): ControlRows {
+  const buttons = reasons
+    .flatMap((reason) => (reason.stop === undefined ? [] : [{ ...reason, stop: reason.stop }]))
+    .slice(0, MAX_STOP_BUTTONS)
+    .map((reason): APIButtonComponentWithCustomId => ({
+      type: ComponentType.Button,
+      style: ButtonStyle.Secondary,
+      custom_id: reason.stop,
+      label: truncate(`Stop: ${reason.label.replace(/\\(.)/g, '$1')}`, BUTTON_LABEL),
+    }));
+  return buttons.length === 0 ? [] : [{ type: ComponentType.ActionRow, components: buttons }];
+}
+
+/**
+ * The sentence for the reasons that could be stopped but got no button (their id does not fit,
+ * or there are more than five): which command stops them. Empty when every one has its button.
+ */
+export function stopHint(reasons: readonly ShownReason[]): string {
+  const withButton = new Set(
+    reasons
+      .filter((reason) => reason.stop !== undefined)
+      .slice(0, MAX_STOP_BUTTONS)
+      .map((reason) => reason.label),
+  );
+  const commands = [
+    ...new Set(
+      reasons
+        .filter((reason) => reason.command !== undefined && !withButton.has(reason.label))
+        .map((reason) => `\`${reason.command ?? ''}\``),
+    ),
+  ];
+  return commands.length === 0
+    ? ''
+    : `-# To stop what has no button here, use ${commands.join(' or ')} in the server.`;
 }
 
 /**
@@ -94,16 +192,19 @@ export function reasonLine(reasons: readonly ShownReason[]): string {
 /**
  * A direct message of the notifier: the sentence, the line of reasons, and the embed of the
  * post as it is at that moment, without the post's controls (a DM is not the place to sign up:
- * the sentence links to the post). It pings nobody.
+ * the sentence links to the post). Below it one button per reason that stops that reason. It
+ * pings nobody.
  */
 export function notifyDm(
   sentence: string,
   reasons: readonly ShownReason[],
   embed: APIEmbed | undefined,
 ): OutgoingMessage {
-  const line = reasonLine(reasons);
+  const lines = [sentence, reasonLine(reasons), stopHint(reasons)].filter((line) => line !== '');
+  const rows = stopRow(reasons);
   return {
-    content: line === '' ? sentence : `${sentence}\n${line}`,
+    content: lines.join('\n'),
     ...(embed ? { embeds: [embed] } : {}),
+    ...(rows.length === 0 ? {} : { components: rows }),
   };
 }
```

Apply to `src/services/notify-service.ts`:

```diff
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -21,6 +21,7 @@ import {
   notifyDm,
   postLink,
   raidDmSentence,
+  stopButtonId,
   type RaidDmView,
   type ShownReason,
 } from '../render/notify-dm.js';
@@ -313,7 +314,7 @@ export class NotifyService implements PartyNotifier {
         });
         return notifyDm(
           sentence,
-          reasons.map((reason) => this.shown(reason)),
+          reasons.map((reason) => this.shown(guildId, reason)),
           embed.made,
         );
       },
@@ -330,18 +331,30 @@ export class NotifyService implements PartyNotifier {
     }
   }
 
-  /** A reason as the message names it, in the names of the member's own lists. */
-  private shown(reason: NotifyReason): ShownReason {
+  /**
+   * A reason as the message names it, in the names of the member's own lists, with the button
+   * that stops it in this server and the command that does the same.
+   */
+  private shown(guildId: string, reason: NotifyReason): ShownReason {
     const { gameData, gyms } = this.options;
+    const stop = stopButtonId(guildId, reason);
     switch (reason.kind) {
       case 'want':
-        return { label: plain(wantTargetLabel(gameData.catalogue, reason.target)) };
+        return {
+          label: plain(wantTargetLabel(gameData.catalogue, reason.target)),
+          stop,
+          command: '/unwant',
+        };
       case 'gym':
-        return { label: `raids at ${plain(gymName(gyms.get(reason.gymId)))}` };
+        return {
+          label: `raids at ${plain(gymName(gyms.get(reason.gymId)))}`,
+          stop,
+          command: '/untarget',
+        };
       case 'boss-set':
-        return { label: 'the boss of an egg you are signed up for' };
+        return { label: 'the boss of your eggs', stop, command: '/settings boss-set' };
       case 'new-train':
-        return { label: 'new trains' };
+        return { label: 'new trains', stop, command: '/settings new-train' };
     }
   }
 
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/components/dm.test.ts src/discord/custom-id.test.ts src/domain/notify/reasons.test.ts src/render/notify-dm.test.ts src/services/notify-service.test.ts test/support/fake-interactions.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 0c0fdad -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/components/dm.test.ts src/components/dm.ts src/components/index.ts src/discord/custom-id.test.ts src/discord/custom-id.ts src/domain/notify/reasons.test.ts src/domain/notify/reasons.ts src/render/notify-dm.test.ts src/render/notify-dm.ts src/services/notify-service.test.ts src/services/notify-service.ts test/support/fake-interactions.test.ts test/support/fake-interactions.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/components/dm.test.ts src/components/dm.ts src/components/index.ts src/discord/custom-id.test.ts src/discord/custom-id.ts src/domain/notify/reasons.test.ts src/domain/notify/reasons.ts src/render/notify-dm.test.ts src/render/notify-dm.ts src/services/notify-service.test.ts src/services/notify-service.ts test/support/fake-interactions.test.ts test/support/fake-interactions.ts
git commit -m "The \"Stop\" buttons under a direct message: one per reason, pressed in the DM" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 3,165 unit tests.

---

### Task 7: Direct messages for a new train, the boss of an egg and a meeting time

**Files:**
- Create: `src/services/notify-service.parties.test.ts`
- Modify: `src/app.ts`, `src/commands/notify-paths.test.ts`, `src/render/notify-dm.test.ts`, `src/render/notify-dm.ts`, `src/services/attendance-service.ts`, `src/services/notify-service.ts`, `src/services/party-service.ts`, `src/services/timed-party-service.ts`, `test/support/party-service.ts`

**Interfaces:**
- Consumes: Tasks 2 to 6; `PartyService.createTimed`, `AttendanceService.setMeetingTime`, `TimedPartyService.announceStart`, `Gathered`; `headCount`; `renderTrainPost`.
- Produces: `PartyNotifier` grows `trainCreated`, the meeting-time and start-time calls; `trainDmSentence`, `bossSetSentence`, `meetingDmSentence`; the boss-set reason (an attendee with boss-set on is told every boss that differs from the last one they were told for this raid); meeting and start times to everybody signed up, gathered for a few seconds, on a line of their own, without the visibility question; `src/commands/notify-paths.test.ts` (every path through the real commands and router).

Reference commit of the prototype for this task: `6d08e12`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/notify-paths.test.ts`:

```diff
--- a/src/commands/notify-paths.test.ts
+++ b/src/commands/notify-paths.test.ts
@@ -34,6 +34,7 @@ async function setup(overrides: Parameters<typeof partyServiceWith>[1] = {}) {
     regions: made.regions,
     wants: made.wants,
     gymTargets: made.gymTargets,
+    users: made.users,
   });
   const router = new InteractionRouter(ctx, commands, components);
   const handle = async (interaction: FakeInteraction) => {
@@ -80,7 +81,7 @@ async function setup(overrides: Parameters<typeof partyServiceWith>[1] = {}) {
   };
   /** The one raid, as it is stored. */
   const raid = () => asRaid(made.store.active()[0]);
-  return { ...made, ctx, handle, inRegion, inPost, told, want, target, raid };
+  return { ...made, ctx, users: ctx.users, handle, inRegion, inPost, told, want, target, raid };
 }
 
 describe('who is told, and who is left out, by every way a member causes it', () => {
@@ -164,3 +165,42 @@ describe('who is told, and who is left out, by every way a member causes it', ()
     expect(await made.told()).toEqual([BOB]);
   });
 });
+
+describe('who is told about trains and meeting times, and who is left out', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('`/train`: not who made it', async () => {
+    const made = await setup();
+    for (const id of [ALICE, BOB]) await made.newTrains.set(id, made.gateway.guildId, true, 1);
+    await made.inRegion(ALICE, 'train', { name: 'Saturday legendaries' });
+    expect(made.store.active()[0]).toMatchObject({ type: 'train', createdById: ALICE });
+    expect(await made.told()).toEqual([BOB]);
+  });
+
+  it('`/meet` in a raid: the others of the group, not who set the time', async () => {
+    const made = await setup();
+    await made.inRegion(CAROL, 'raid', { boss: 'yveltal', gym: 'g:1' });
+    const postId = made.raid().forumPostId ?? '';
+    for (const id of [ALICE, BOB]) await made.inPost(id, postId, WEST_FORUM, 'join', {});
+    await made.told();
+    await made.inPost(ALICE, postId, WEST_FORUM, 'meet', { time: '20' });
+    expect(made.raid().groups[0]?.startTime).toBeDefined();
+    expect((await made.told()).sort()).toEqual([BOB, CAROL].sort());
+  });
+
+  it('`/meet` in a train: everybody else who is signed up', async () => {
+    const made = await setup();
+    await made.inRegion(CAROL, 'train', { name: 'Saturday legendaries' });
+    const postId = made.store.active()[0]?.forumPostId ?? '';
+    for (const id of [ALICE, BOB]) await made.inPost(id, postId, WEST_FORUM, 'join', {});
+    await made.told();
+    await made.inPost(ALICE, postId, WEST_FORUM, 'meet', { time: '4pm' });
+    await made.timed.flush();
+    expect((await made.told()).sort()).toEqual([BOB, CAROL].sort());
+  });
+});
```

Apply to `src/render/notify-dm.test.ts`:

```diff
--- a/src/render/notify-dm.test.ts
+++ b/src/render/notify-dm.test.ts
@@ -1,5 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import {
+  bossSetSentence,
+  meetingDmSentence,
   notifyDm,
   postLink,
   raidDmSentence,
@@ -7,6 +9,7 @@ import {
   stopButtonId,
   stopHint,
   stopRow,
+  trainDmSentence,
   withoutButton,
   type RaidDmView,
   type ShownReason,
@@ -188,3 +191,43 @@ describe('the stop buttons of a message', () => {
     expect(withoutButton(rows, 'dm:other')).toEqual(rows);
   });
 });
+
+describe('the sentences for members of a party and for a new train', () => {
+  it('says what an egg hatched into, or what its boss is while it has not hatched', () => {
+    const view = { boss: 'Yveltal', gym: 'The Stacks', regionChannelId: REGION, link: LINK };
+    expect(bossSetSentence({ ...view, hatched: true })).toBe(
+      `The egg at **The Stacks** (<#${REGION}>) hatched into **Yveltal**: ${LINK}`,
+    );
+    expect(bossSetSentence({ ...view, hatched: false })).toBe(
+      `The boss of the egg at **The Stacks** (<#${REGION}>) is **Yveltal**: ${LINK}`,
+    );
+  });
+
+  it('says the legacy sentence for a new train', () => {
+    expect(
+      trainDmSentence({ regionChannelId: REGION, maker: { id: '1', name: 'Rhea' }, link: LINK }),
+    ).toBe(`A new train has been announced in <#${REGION}> by **Rhea**: ${LINK}`);
+    expect(trainDmSentence({ regionChannelId: undefined, maker: { id: '1' }, link: LINK })).toBe(
+      `A new train has been announced by **<@1>**: ${LINK}`,
+    );
+  });
+
+  it('says the legacy sentence for a meeting time, and one of the same kind when it is cancelled', () => {
+    const by = { id: '1', name: 'Rhea' };
+    expect(meetingDmSentence({ what: 'meeting', by, time: '<t:1:t>', heads: 4, link: LINK })).toBe(
+      `**Rhea** set a meeting time of <t:1:t> for ${LINK}. There are currently **4** trainers attending!`,
+    );
+    expect(meetingDmSentence({ what: 'meeting', by, time: '<t:1:t>', heads: 1, link: LINK })).toBe(
+      `**Rhea** set a meeting time of <t:1:t> for ${LINK}. There is currently **1** trainer attending!`,
+    );
+    expect(meetingDmSentence({ what: 'meeting', by, time: null, heads: 4, link: LINK })).toBe(
+      `**Rhea** cancelled the meeting time for ${LINK}.`,
+    );
+    expect(meetingDmSentence({ what: 'start', by, time: '<t:1:f>', heads: 2, link: LINK })).toBe(
+      `**Rhea** set a start time of <t:1:f> for ${LINK}. There are currently **2** trainers attending!`,
+    );
+    expect(meetingDmSentence({ what: 'start', by, time: null, heads: 2, link: LINK })).toBe(
+      `**Rhea** removed the start time of ${LINK}.`,
+    );
+  });
+});
```

Create `src/services/notify-service.parties.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { MemoryNewTrains } from '../../test/support/new-trains.js';
import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
import {
  createdMeetup,
  createdTrain,
  partyServiceWith,
  reportedRaid,
} from '../../test/support/party-service.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { loadSettings } from '../config/settings.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import { PartyStatus } from '../domain/party/status.js';
import { postLink } from '../render/notify-dm.js';
import { DM_PRIORITY } from './dm-sender.js';

const DORA = '200000000000000005';
const HATCH = at('2026-10-13T14:30');
const YVELTAL = pokemonTarget(717);
const member = (id: string, name: string) => ({ id, name });

type Made = Awaited<ReturnType<typeof partyServiceWith>>;
/** The content of each message for a member, line by line. */
const told = (made: Made, userId: string): string[][] =>
  made.dms.to(userId).map((message) => (message.content ?? '').split('\n'));
const stamp = (time: number, style = 't') => `<t:${String(time / 1000)}:${style}>`;

function off() {
  const settings = loadSettings(TEST_SETTINGS_PATH);
  return { ...settings, features: { ...settings.features, notifications: false } };
}

describe('NotifyService: a train is made', () => {
  it('tells who asked to hear of new trains and can see it, but for its maker', async () => {
    const kept = await partyServiceWith();
    const guild = kept.gateway.guildId;
    for (const id of [ALICE, BOB, CAROL, REPORTER]) await kept.newTrains.set(id, guild, true, 1);
    // Dora asked in another server, which is not asking here.
    await kept.newTrains.set(DORA, '499999999999999999', true, 1);
    kept.gateway.shutOut(WEST_FORUM, BOB);
    const made = await createdTrain(
      { creator: { name: 'Rhea' } },
      {},
      {
        storage: kept.storage,
        gateway: kept.gateway,
        regions: kept.regions,
        clock: kept.clock,
        tags: kept.tags,
        newTrains: kept.newTrains,
      },
    );
    await made.notify.flush();
    expect(made.dms.recipients).toEqual([ALICE, CAROL]);
    const link = postLink(made.gateway.guildId, made.postId);
    expect(told(made, ALICE)).toEqual([
      [
        `A new train has been announced in <#${WEST_CHANNEL}> by **Rhea**: ${link}`,
        '-# You asked to be told about: new trains',
      ],
    ]);
    const [message] = made.dms.to(ALICE);
    expect(JSON.stringify(message?.embeds)).toContain('Saturday legendaries');
    expect(message?.components).toEqual([
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 2,
            custom_id: `dm:${made.gateway.guildId}:stop:train`,
            label: 'Stop: new trains',
          },
        ],
      },
    ]);
    expect(made.dms.jobs[0]).toMatchObject({
      priority: DM_PRIORITY.normal,
      expiresAt: made.clock.now + 60 * MINUTE,
    });
  });

  it('tells nobody of a meetup, and nobody of a train where notifications are off', async () => {
    const newTrains = new MemoryNewTrains();
    await newTrains.set(ALICE, '412345678901234567', true, 1);
    const meetup = await createdMeetup({}, {}, { newTrains });
    expect(meetup.gateway.guildId).toBe('412345678901234567');
    await meetup.notify.flush();
    expect(meetup.dms.jobs).toEqual([]);
    const train = await createdTrain({}, { settings: off() }, { newTrains });
    await train.notify.flush();
    expect(train.dms.jobs).toEqual([]);
  });
});

describe('NotifyService: an egg gets its boss', () => {
  /** An egg that Alice and Bob are coming to and Carol is done with; Alice and Carol asked. */
  async function egg(more: Record<string, object> = {}) {
    const userSettings = new Map<string, object>([
      [ALICE, { bossSetNotification: true }],
      [CAROL, { bossSetNotification: true }],
      [DORA, { bossSetNotification: true }],
      ...Object.entries(more),
    ]);
    const made = await reportedRaid({ time: { hatch: HATCH } }, {}, { userSettings });
    for (const [id, name] of [
      [ALICE, 'Alice'],
      [BOB, 'Bob'],
    ] as const) {
      await made.attendance.signUp(made.party.id, member(id, name), PartyStatus.Coming);
    }
    await made.notify.flush();
    return made;
  }
  const BOSSES = {
    yveltal: 'Yveltal (T5)',
    giratina_origin: 'Giratina (Origin Forme) (T5)',
  } as const;
  const setBoss = async (
    made: Awaited<ReturnType<typeof egg>>,
    by: string,
    key: keyof typeof BOSSES | null = 'yveltal',
  ) => {
    await made.raids.setBoss(made.party.id, member(by, 'Somebody'), {
      tier: { level: 'T5', shadow: false },
      boss: key === null ? null : { key },
      label: key === null ? 'T5 egg' : BOSSES[key],
    });
    await made.notify.flush();
  };
  /** The first line of every message for a member, without the link. */
  const heard = (made: Awaited<ReturnType<typeof egg>>, userId: string): string[] =>
    told(made, userId).map((lines) => (lines[0] ?? '').replace(/: https:\S+$/, ''));
  const STACKS = `**The Stacks** (<#${WEST_CHANNEL}>)`;

  it('tells who is signed up and asked to hear it, whether or not they want the boss', async () => {
    const made = await egg();
    await setBoss(made, BOB);
    // Bob set it, and did not ask; Dora asked and is not signed up.
    expect(made.dms.recipients).toEqual([ALICE]);
    const link = postLink(made.gateway.guildId, made.postId);
    expect(told(made, ALICE)).toEqual([
      [
        `The boss of the egg at **The Stacks** (<#${WEST_CHANNEL}>) is **Yveltal**: ${link}`,
        '-# You asked to be told about: the boss of your eggs',
      ],
    ]);
    expect(made.dms.jobs[0]?.priority).toBe(DM_PRIORITY.urgent);
    const [message] = made.dms.to(ALICE);
    expect(message?.components?.[0]?.components).toMatchObject([
      { custom_id: `dm:${made.gateway.guildId}:stop:boss`, label: 'Stop: the boss of your eggs' },
    ]);
  });

  it('says what it hatched into when the clock sets the only possible boss', async () => {
    const made = await egg({ [REPORTER]: { bossSetNotification: true } });
    made.clock.now = HATCH + MINUTE;
    await made.scheduler.tick();
    await made.notify.flush();
    expect(made.dms.recipients.sort()).toEqual([ALICE, REPORTER].sort());
    expect(told(made, ALICE)[0]?.[0]).toBe(
      `The egg at **The Stacks** (<#${WEST_CHANNEL}>) hatched into **Yveltal**: ${postLink(made.gateway.guildId, made.postId)}`,
    );
  });

  it('sends one message to an attendee who also wants the boss, with both reasons', async () => {
    const made = await egg();
    await made.wants.set(ALICE, made.gateway.guildId, YVELTAL, 'raid');
    await made.wants.set(DORA, made.gateway.guildId, YVELTAL, 'raid');
    await setBoss(made, BOB);
    expect(made.dms.to(ALICE)).toHaveLength(1);
    expect(told(made, ALICE)[0]).toEqual([
      expect.stringMatching(/^The boss of the egg at/),
      '-# You asked to be told about: the boss of your eggs · Yveltal',
    ]);
    // Dora is not signed up: for her it is news of a raid she wants.
    expect(told(made, DORA)[0]?.[0]).toMatch(/^The raid at \*\*The Stacks\*\* .* now has its boss/);
    expect(made.dms.jobs.find((job) => job.userId === DORA)?.priority).toBe(DM_PRIORITY.normal);
    // Who is in the raid is put in line first.
    expect(made.dms.recipients).toEqual([ALICE, DORA]);
  });

  it('does not tell who set it', async () => {
    const made = await egg();
    await setBoss(made, ALICE);
    expect(made.dms.jobs).toEqual([]);
  });

  it('tells of a boss that is corrected straight away, in a sentence that says so', async () => {
    const made = await egg();
    await setBoss(made, BOB, 'yveltal');
    await setBoss(made, BOB, 'giratina_origin');
    expect(heard(made, ALICE)).toEqual([
      `The boss of the egg at ${STACKS} is **Yveltal**`,
      `The boss of the raid at ${STACKS} is now **Giratina (Origin Forme)**`,
    ]);
    expect(told(made, ALICE)[1]?.[1]).toBe('-# You asked to be told about: the boss of your eggs');
    expect(made.dms.jobs.map((job) => job.priority)).toEqual([
      DM_PRIORITY.urgent,
      DM_PRIORITY.urgent,
    ]);
  });

  it('tells of the next boss when the raid was an egg again between, and nothing for the egg', async () => {
    const made = await egg();
    await setBoss(made, BOB, 'yveltal');
    await setBoss(made, BOB, null);
    expect(made.dms.to(ALICE)).toHaveLength(1);
    await setBoss(made, BOB, 'giratina_origin');
    expect(heard(made, ALICE)).toEqual([
      `The boss of the egg at ${STACKS} is **Yveltal**`,
      `The boss of the egg at ${STACKS} is **Giratina (Origin Forme)**`,
    ]);
  });

  it('tells of a boss the raid comes back to, so that the last message is never wrong', async () => {
    const made = await egg();
    await setBoss(made, BOB, 'yveltal');
    await setBoss(made, BOB, 'giratina_origin');
    await setBoss(made, BOB, 'yveltal');
    expect(heard(made, ALICE)).toEqual([
      `The boss of the egg at ${STACKS} is **Yveltal**`,
      `The boss of the raid at ${STACKS} is now **Giratina (Origin Forme)**`,
      `The boss of the raid at ${STACKS} is now **Yveltal**`,
    ]);
    // A boss a member set themself is the last one they know of.
    const other = await egg();
    await setBoss(other, ALICE, 'yveltal');
    await setBoss(other, BOB, 'giratina_origin');
    await setBoss(other, BOB, 'yveltal');
    expect(heard(other, ALICE)).toEqual([
      `The boss of the raid at ${STACKS} is now **Giratina (Origin Forme)**`,
      `The boss of the raid at ${STACKS} is now **Yveltal**`,
    ]);
  });

  it('tells of one boss once when it is set again with no other between', async () => {
    const made = await egg();
    await setBoss(made, BOB, 'yveltal');
    await setBoss(made, BOB, null);
    await setBoss(made, BOB, 'yveltal');
    expect(heard(made, ALICE)).toEqual([`The boss of the egg at ${STACKS} is **Yveltal**`]);
    // Set by themself, taken back, set by another: they know it.
    const other = await egg();
    await setBoss(other, ALICE, 'yveltal');
    await setBoss(other, BOB, null);
    await setBoss(other, BOB, 'yveltal');
    expect(other.dms.to(ALICE)).toEqual([]);
  });

  it('tells nobody where notifications are off', async () => {
    const userSettings = new Map([[ALICE, { bossSetNotification: true }]]);
    const made = await reportedRaid(
      { time: { hatch: HATCH } },
      { settings: off() },
      { userSettings },
    );
    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    await made.raids.setBoss(made.party.id, member(BOB, 'Bob'), {
      tier: { level: 'T5', shadow: false },
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    await made.notify.flush();
    expect(made.dms.jobs).toEqual([]);
  });
});

describe('NotifyService: a meeting time', () => {
  const MEET = at('2026-10-13T14:40');

  /** A raid with Alice and Bob coming beside the reporter, and Carol in a group of her own. */
  async function raid(overrides: Parameters<typeof reportedRaid>[1] = {}) {
    const made = await reportedRaid({ boss: { key: 'yveltal' } }, overrides);
    for (const [id, name] of [
      [ALICE, 'Alice'],
      [BOB, 'Bob'],
      [CAROL, 'Carol'],
    ] as const) {
      await made.attendance.signUp(made.party.id, member(id, name), PartyStatus.Coming);
    }
    await made.attendance.newGroup(made.party.id, member(CAROL, 'Carol'));
    await made.notify.flush();
    return made;
  }

  it('tells the others of the group in the legacy words, not who set it, without a button', async () => {
    const made = await raid();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    expect(made.dms.jobs).toEqual([]);
    await made.notify.flush();
    expect(made.dms.recipients.sort()).toEqual([BOB, REPORTER].sort());
    const link = postLink(made.gateway.guildId, made.postId);
    expect(told(made, BOB)).toEqual([
      [
        `**Alice** set a meeting time of ${stamp(MEET)} for ${link}. There are currently **3** trainers attending!`,
      ],
    ]);
    const [message] = made.dms.to(BOB);
    expect(message?.components).toBeUndefined();
    expect(message?.embeds).toBeUndefined();
    expect(made.dms.jobs[0]).toMatchObject({ priority: DM_PRIORITY.urgent, expiresAt: MEET });
  });

  it('counts the trainers as the post does, and says one in the singular', async () => {
    const made = await raid();
    await made.attendance.signUp(made.party.id, member(BOB, 'Bob'), PartyStatus.Coming, {
      number: 3,
    });
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    await made.notify.flush();
    expect(told(made, BOB)[0]?.[0]).toContain('There are currently **5** trainers attending!');
    // Carol is alone in her group: nobody else to tell.
    await made.attendance.setMeetingTime(made.party.id, member(CAROL, 'Carol'), MEET);
    await made.notify.flush();
    expect(made.dms.to(CAROL)).toEqual([]);
    expect(made.dms.jobs).toHaveLength(2);
  });

  it('makes one message of a time that is corrected at once, and none of one that is taken back', async () => {
    const made = await raid();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    await made.attendance.setMeetingTime(made.party.id, member(BOB, 'Bob'), MEET + 5 * MINUTE);
    await made.notify.flush();
    // The last one to change it is who set it, and is not told.
    expect(made.dms.recipients.sort()).toEqual([ALICE, REPORTER].sort());
    expect(told(made, ALICE)).toEqual([
      [expect.stringContaining(`**Bob** set a meeting time of ${stamp(MEET + 5 * MINUTE)}`)],
    ]);
    const before = made.dms.jobs.length;
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET + 5 * MINUTE);
    await made.notify.flush();
    expect(made.dms.jobs).toHaveLength(before);
  });

  it('tells of a cancelled time in a sentence of the same kind', async () => {
    const made = await raid();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    await made.notify.flush();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), null);
    await made.notify.flush();
    expect(told(made, BOB)[1]).toEqual([
      `**Alice** cancelled the meeting time for ${postLink(made.gateway.guildId, made.postId)}.`,
    ]);
    expect(made.dms.jobs.at(-1)?.expiresAt).toBe(made.clock.now + 30 * MINUTE);
  });

  it('is sent where notifications are off, and not to who is done or cannot be reached', async () => {
    const made = await raid({ settings: off() });
    await made.attendance.signUp(made.party.id, member(BOB, 'Bob'), PartyStatus.Present);
    await made.attendance.done(made.party.id, member(BOB, 'Bob'));
    await made.attendance.setMeetingTime(made.party.id, member(CAROL, 'Carol'), MEET);
    await made.attendance.joinGroup(made.party.id, member(DORA, 'Dora'), 'A');
    await made.attendance.setMeetingTime(made.party.id, member(DORA, 'Dora'), MEET);
    await made.notify.flush();
    expect(made.dms.recipients.sort()).toEqual([ALICE, REPORTER].sort());
  });

  it('asks nobody who can see the post: whoever is signed up is told, and nothing is remembered', async () => {
    const made = await raid();
    const asked = made.members.batches.length;
    // Not even Discord being away, or a member who left, keeps the message out of the line:
    // the send itself finds out who cannot be written to.
    made.members.failing = new Error('Discord is away');
    made.gateway.leftServer.add(REPORTER);
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    await made.notify.flush();
    expect(made.dms.recipients.sort()).toEqual([BOB, REPORTER].sort());
    expect(made.members.batches).toHaveLength(asked);
    expect(made.notify.remembered).toBe(0);
  });

  /** Holds the answers about who can see something until the returned function is called. */
  function hold(made: Pick<Made, 'members'>): () => void {
    let release: () => void = () => undefined;
    made.members.holding = new Promise((resolve) => {
      release = resolve;
    });
    return () => {
      made.members.holding = undefined;
      release();
    };
  }
  /** A raid one of whose events is being worked off: who targets its new gym is asked about. */
  async function withEventInFlight() {
    const made = await raid();
    await made.gymTargets.add(DORA, made.gateway.guildId, 2);
    const release = hold(made);
    const asked = made.members.batches.length;
    await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 2);
    while (made.members.batches.length === asked) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    return { made, release };
  }

  it('does not wait behind the look-ups of its own raid', async () => {
    const { made, release } = await withEventInFlight();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    await made.notify.flushMeetings();
    // A few turns for the line to take it; the answer about the gym is still held back.
    for (let turn = 0; turn < 20 && made.dms.jobs.length === 0; turn++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(made.dms.recipients.sort()).toEqual([BOB, REPORTER].sort());
    expect(made.dms.to(DORA)).toEqual([]);
    release();
    await made.notify.flush();
    expect(made.dms.to(DORA)).toHaveLength(1);
  });

  it('still goes out when it was waiting for its delay at shutdown, beside an event in flight', async () => {
    const { made, release } = await withEventInFlight();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    const closing = made.notify.close();
    // Shutdown has begun before the look-up answers.
    await new Promise((resolve) => setImmediate(resolve));
    release();
    await closing;
    expect(told(made, BOB)).toEqual([
      [expect.stringContaining(`**Alice** set a meeting time of ${stamp(MEET)}`)],
    ]);
    expect(made.dms.to(REPORTER)).toHaveLength(1);
  });

  it('sends nothing for a time the bot itself moved because the raid changed', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    await made.attendance.setMeetingTime(
      made.party.id,
      member(REPORTER, 'Rhea'),
      HATCH + 10 * MINUTE,
    );
    await made.notify.flush();
    expect(made.dms.to(ALICE)).toHaveLength(1);
    // The hatch moves by half an hour: the meeting time moves with it, or is cancelled.
    await made.raids.setHatchTime(made.party.id, member(REPORTER, 'Rhea'), HATCH + 30 * MINUTE);
    await made.notify.flush();
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('tells everybody signed up for a train of its start, once it has stood for a moment', async () => {
    const made = await createdTrain();
    for (const [id, name] of [
      [ALICE, 'Alice'],
      [BOB, 'Bob'],
    ] as const) {
      await made.attendance.signUp(made.party.id, member(id, name), PartyStatus.Coming);
    }
    const start = at('2026-10-13T16:00');
    await made.timed.setStartTime(made.party.id, member(ALICE, 'Alice'), start - 30 * MINUTE);
    await made.timed.setStartTime(made.party.id, member(ALICE, 'Alice'), start);
    await made.timed.flush();
    await made.notify.flush();
    expect(made.dms.recipients.sort()).toEqual([BOB, REPORTER].sort());
    const link = postLink(made.gateway.guildId, made.postId);
    expect(told(made, BOB)).toEqual([
      [
        `**Alice** set a start time of ${stamp(start)} for ${link}. There are currently **3** trainers attending!`,
      ],
    ]);
    expect(made.dms.jobs[0]).toMatchObject({ priority: DM_PRIORITY.urgent, expiresAt: start });
    await made.timed.setStartTime(made.party.id, member(BOB, 'Bob'), null);
    await made.timed.flush();
    await made.notify.flush();
    expect(told(made, ALICE)).toEqual([[`**Bob** removed the start time of ${link}.`]]);
  });

  it('says the start in the post also when the notifier cannot even begin', async () => {
    const made = await createdTrain(
      {},
      {
        notifying: {
          now: () => {
            throw new Error('no clock');
          },
        },
      },
    );
    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    const start = at('2026-10-13T16:00');
    await made.timed.setStartTime(made.party.id, member(ALICE, 'Alice'), start);
    await made.timed.flush();
    await made.notify.flush();
    expect(made.said().some((line) => line.includes('set the start of this train'))).toBe(true);
    expect(made.dms.jobs).toEqual([]);
    expect(
      made.entries.filter((entry) => entry.msg === 'could not tell members of an event'),
    ).toHaveLength(2);
    // A meeting time in a raid is stored and said as well.
    const raid = await reportedRaid(
      { boss: { key: 'yveltal' } },
      {
        notifying: {
          now: () => {
            throw new Error('no clock');
          },
        },
      },
    );
    await raid.attendance.signUp(raid.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    const outcome = await raid.attendance.setMeetingTime(
      raid.party.id,
      member(ALICE, 'Alice'),
      at('2026-10-13T14:40'),
    );
    expect(outcome.kind).toBe('ok');
    await raid.notify.flush();
    expect(raid.dms.jobs).toEqual([]);
  });

  it('names another day with its date in the start of a meetup', async () => {
    const made = await createdMeetup();
    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    const start = at('2026-10-17T11:00');
    await made.timed.setStartTime(made.party.id, member(REPORTER, 'Rhea'), start);
    await made.timed.flush();
    await made.notify.flush();
    expect(told(made, ALICE)[0]?.[0]).toContain(`set a start time of ${stamp(start, 'f')} for`);
  });
});
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -31,6 +31,7 @@ import { RecordingDms } from './dms.js';
 import { FakePartyGateway } from './fake-gateway.js';
 import { MemoryGymTargets } from './gym-targets.js';
 import { FakeMemberDirectory } from './members.js';
+import { MemoryNewTrains } from './new-trains.js';
 import { MemoryWants } from './wants.js';
 import { catalogueFixture } from './game-data.js';
 import {
@@ -155,9 +156,10 @@ export interface Outliving {
   userSettings: Map<string, Partial<UserSettings>>;
   /** The routes members saved. */
   routes: MemorySavedRoutes;
-  /** What members want to be told about, and the gyms they target. */
+  /** What members want to be told about, the gyms they target, who hears of new trains. */
   wants: MemoryWants;
   gymTargets: MemoryGymTargets;
+  newTrains: MemoryNewTrains;
   /** The storage the store really uses, when that is not the one in memory (a database test). */
   database: PartyStorage | undefined;
 }
@@ -194,7 +196,7 @@ export function restarted(made: Outliving, overrides: ServiceOverrides = {}) {
  * forum unless `gateway.shutOut` says otherwise); it works on the side, `access.flush()` waits.
  *
  * `notify` is the notifier over the same store, told by the services as in the bot: who wants
- * something is in `wants` and `gymTargets` (nobody, until a test says so), everybody is a
+ * something is in `wants`, `gymTargets` and `newTrains` (nobody, until a test says so), everybody is a
  * member of the server and sees what the fake gateway lets them see (`members`), and what would
  * be sent is only recorded (`dms`). It works on the side: `notify.flush()` waits.
  *
@@ -249,6 +251,7 @@ export async function partyServiceWith(
   });
   const wants = kept?.wants ?? new MemoryWants();
   const gymTargets = kept?.gymTargets ?? new MemoryGymTargets();
+  const newTrains = kept?.newTrains ?? new MemoryNewTrains();
   const members = new FakeMemberDirectory();
   members.everybody = true;
   members.sees = (channelId, userId) =>
@@ -259,6 +262,8 @@ export async function partyServiceWith(
     posts: service,
     wants,
     gymTargets,
+    newTrains,
+    users,
     members,
     dms,
     guilds: { snowflakeOf: (id) => Promise.resolve(id === 1 ? gateway.guildId : undefined) },
@@ -269,6 +274,8 @@ export async function partyServiceWith(
     settings: overrides.settings ?? settings,
     log,
     now,
+    // Long enough that nothing is told by itself during a test: `notify.flush()` does it.
+    meetingDelayMs: 3_600_000,
     ...notifying,
   });
   service.announceTo(notify);
@@ -284,6 +291,7 @@ export async function partyServiceWith(
     posts: service,
     lines,
     users,
+    notify,
     settings,
     log,
     now,
@@ -307,6 +315,7 @@ export async function partyServiceWith(
     posts: service,
     lines,
     users,
+    notify,
     log,
     zone: settings.timezone,
     now,
@@ -356,6 +365,7 @@ export async function partyServiceWith(
     notify,
     wants,
     gymTargets,
+    newTrains,
     members,
     dms,
     lines,
```

Run: `npx vitest run --project unit src/commands/notify-paths.test.ts src/render/notify-dm.test.ts src/services/notify-service.parties.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -150,6 +150,8 @@ export async function startApp(
     posts: partyService,
     wants,
     gymTargets,
+    newTrains,
+    users,
     members,
     dms,
     guilds,
@@ -172,6 +174,7 @@ export async function startApp(
     posts: partyService,
     lines,
     users,
+    notify,
     settings: config.settings,
     log,
   });
@@ -193,6 +196,7 @@ export async function startApp(
     posts: partyService,
     lines,
     users,
+    notify,
     log,
     zone: config.settings.timezone,
   });
```

Apply to `src/render/notify-dm.ts`:

```diff
--- a/src/render/notify-dm.ts
+++ b/src/render/notify-dm.ts
@@ -126,6 +126,70 @@ export function raidDmSentence(view: RaidDmView): string {
   }
 }
 
+/**
+ * The first line for a member who is signed up for an egg that got its boss and asked to hear
+ * that (`/settings boss-set`): what it hatched into, or will, said for them rather than as news
+ * of a raid they may want; and for a boss that took the place of another, that it is now this
+ * one.
+ */
+export function bossSetSentence(view: {
+  boss: string;
+  gym: string;
+  regionChannelId: string | undefined;
+  /** Whether the egg has hatched by now; a boss can be named before. */
+  hatched: boolean;
+  /** The raid had another boss before: this one corrects it. */
+  corrected?: boolean;
+  link: string;
+}): string {
+  const where = `**${plain(view.gym)}**${inRegion(view.regionChannelId)}`;
+  const boss = `**${plain(view.boss)}**`;
+  if (view.corrected) return `The boss of the raid at ${where} is now ${boss}: ${view.link}`;
+  return view.hatched
+    ? `The egg at ${where} hatched into ${boss}: ${view.link}`
+    : `The boss of the egg at ${where} is ${boss}: ${view.link}`;
+}
+
+/** The first line of a direct message about a new train: the legacy bot's sentence. */
+export function trainDmSentence(view: {
+  regionChannelId: string | undefined;
+  /** Who made it. */
+  maker: NamedMember;
+  link: string;
+}): string {
+  const where = view.regionChannelId === undefined ? '' : ` in <#${view.regionChannelId}>`;
+  return `A new train has been announced${where} by **${memberName(view.maker)}**: ${view.link}`;
+}
+
+/** `There are currently **3** trainers attending!`, as the legacy bot ended the sentence. */
+function attending(heads: number): string {
+  return heads === 1
+    ? 'There is currently **1** trainer attending!'
+    : `There are currently **${String(heads)}** trainers attending!`;
+}
+
+/**
+ * The direct message about a time members meet at, in the legacy bot's words: the meeting time
+ * of a raid's group (`what` is `meeting`) or the start of a train or meetup (`start`), set or,
+ * with `time` null, taken away again. `time` is the moment as the sentence shows it (a Discord
+ * timestamp); `heads` is the number of trainers as the post counts them.
+ */
+export function meetingDmSentence(view: {
+  what: 'meeting' | 'start';
+  by: NamedMember;
+  time: string | null;
+  heads: number;
+  link: string;
+}): string {
+  const who = `**${memberName(view.by)}**`;
+  if (view.time === null) {
+    return view.what === 'meeting'
+      ? `${who} cancelled the meeting time for ${view.link}.`
+      : `${who} removed the start time of ${view.link}.`;
+  }
+  return `${who} set a ${view.what} time of ${view.time} for ${view.link}. ${attending(view.heads)}`;
+}
+
 /** One reason a direct message came, as it is shown: its label, and the button that stops it. */
 export interface ShownReason {
   /** What the member asked for, made plain: `Yveltal`, `T5 raids`, `raids at The Stacks`. */
```

Apply to `src/services/attendance-service.ts`:

```diff
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -40,6 +40,7 @@ import type { Logger } from '../log.js';
 import { standingLine } from '../render/activity.js';
 import { completionQuestion, groupWords } from '../render/party-controls.js';
 import { LIMITS, memberText, plain, timestamp, withMentions } from '../render/text.js';
+import type { PartyNotifier } from './notify-service.js';
 import { anyParty, settingsOf, storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
@@ -82,6 +83,8 @@ export interface AttendanceServiceOptions {
   /** Where the public lines go. */
   lines: PartyLines;
   users: UserSettingsReader;
+  /** Told when a member sets or cancels the meeting time of their group. */
+  notify?: Pick<PartyNotifier, 'meetingTimeChanged'>;
   settings: Settings;
   log: Logger;
   now?: () => number;
@@ -280,13 +283,20 @@ export class AttendanceService {
     member: Member,
     time: number | null,
   ): Promise<AttendanceOutcome<{ group: GroupId; others: string[] }>> {
+    const seen: { before?: number | undefined } = {};
     const outcome = await this.apply(
       partyId,
       member,
-      (party) => setMeetingTime(party, member.id, time),
+      (party) => {
+        const group = attendeeOf(party, member.id)?.group;
+        seen.before = group === undefined ? undefined : groupOf(party, group)?.startTime;
+        return setMeetingTime(party, member.id, time);
+      },
       'none',
     );
     if (outcome.kind === 'ok' && outcome.acted) {
+      // The others of the group also get a direct message (always: it is part of the party).
+      this.options.notify?.meetingTimeChanged(partyId, outcome.group, seen.before, member);
       this.inBackground(
         this.announceMeeting(outcome.party, member, outcome.group, outcome.others),
         partyId,
```

Apply to `src/services/notify-service.ts`:

```diff
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -2,33 +2,55 @@ import type { APIEmbed } from 'discord.js';
 import type { Settings } from '../config/settings.js';
 import type { GymTargetStorage } from '../db/repositories/gym-notification-repository.js';
 import type { WantStorage } from '../db/repositories/pokemon-notification-repository.js';
+import type { NewTrainStorage } from '../db/repositories/new-train-repository.js';
+import type { UserSettingsReader } from '../db/repositories/user-repository.js';
 import type { MemberDirectory } from '../discord/member-directory.js';
 import { MEMBERS_PER_REQUEST } from '../discord/member-viewers.js';
 import type { OutgoingMessage } from '../discord/party-gateway.js';
 import {
+  bossId,
   raidNumbers,
   raidWantsFiring,
   reasonKey,
   type NotifyReason,
   type RaidSighting,
 } from '../domain/notify/reasons.js';
-import { memberOf, sameBoss, type Party, type RaidParty } from '../domain/party/party.js';
+import {
+  groupOf,
+  headCount,
+  isRaid,
+  memberOf,
+  membersWhere,
+  sameBoss,
+  type GroupId,
+  type Party,
+  type RaidParty,
+  type TimedParty,
+  type TrainParty,
+} from '../domain/party/party.js';
+import { raidStage } from '../domain/party/raid.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { startTimeOf } from '../domain/party/timed.js';
 import type { Want } from '../domain/pogo/notification-target.js';
 import { sameRaidTier } from '../domain/pogo/raid-tier.js';
 import { wantTargetLabel } from '../domain/pogo/wants.js';
 import type { Logger } from '../log.js';
 import {
+  bossSetSentence,
+  meetingDmSentence,
   notifyDm,
   postLink,
   raidDmSentence,
   stopButtonId,
+  trainDmSentence,
   type RaidDmView,
   type ShownReason,
 } from '../render/notify-dm.js';
 import { gymName, shownBoss, type PostGym } from '../render/raid-post.js';
-import { plain } from '../render/text.js';
+import { clockOrDate, clockOrDay, plain, type NamedMember } from '../render/text.js';
 import { DM_PRIORITY, type DmPriority, type DmSender } from './dm-sender.js';
 import type { GameDataProvider } from './game-data-service.js';
+import { Gathered } from './gathered.js';
 import { KeyedLock } from './keyed-lock.js';
 import type { PartyStore } from './party-store.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
@@ -58,6 +80,23 @@ export interface PartyNotifier {
   raidMoving(fromId: string, toId: string): void;
   /** The move is done: `to` is the raid in its new region, with its post. */
   raidMoved(from: RaidParty, to: RaidParty, actorId: string | null): void;
+  /** A train was made and has its post. */
+  trainCreated(party: TrainParty, actorId: string): void;
+  /**
+   * A member set or cancelled the meeting time of their group in a raid; `before` is the time
+   * the group had. Not for a time the bot itself moved or cancelled because the raid changed.
+   */
+  meetingTimeChanged(
+    partyId: string,
+    groupId: GroupId,
+    before: number | undefined,
+    by: NamedMember,
+  ): void;
+  /**
+   * The start of a train or meetup is another than it was, and has stood for a moment (the
+   * caller has gathered quick corrections into one call).
+   */
+  startTimeChanged(party: TimedParty, by: NamedMember): void;
 }
 
 export interface NotifyServiceOptions {
@@ -67,6 +106,10 @@ export interface NotifyServiceOptions {
   posts: { embedOf(party: Party): APIEmbed };
   wants: Pick<WantStorage, 'wanting'>;
   gymTargets: Pick<GymTargetStorage, 'targeting'>;
+  /** Who asked to hear of new trains, per server. */
+  newTrains: Pick<NewTrainStorage, 'wanting'>;
+  /** The members' settings: who asked to hear of the boss of their egg. */
+  users: UserSettingsReader;
   members: Pick<MemberDirectory, 'viewers'>;
   dms: DmSender;
   /** The snowflake of a server by its row (`GuildRepository.snowflakeOf`). */
@@ -78,6 +121,12 @@ export interface NotifyServiceOptions {
   settings: Settings;
   log: Logger;
   now?: () => number;
+  /**
+   * How long after the last change of a raid group's meeting time its members are told.
+   * Default five seconds, as for the start of a train or meetup: a time that is corrected at
+   * once is one message.
+   */
+  meetingDelayMs?: number;
 }
 
 /**
@@ -87,6 +136,18 @@ export interface NotifyServiceOptions {
 const BATCH = MEMBERS_PER_REQUEST;
 /** A message about a raid without an end time is not worth sending after this long. */
 const RAID_NEWS_MS = 60 * 60_000;
+/** A message about a new train is not worth sending after this long. */
+const TRAIN_NEWS_MS = 60 * 60_000;
+/** A message that a time was taken away is not worth sending after this long. */
+const CANCELLED_NEWS_MS = 30 * 60_000;
+
+/** A meeting time whose message is waiting: what the group had before, and who changed it last. */
+interface PendingMeeting {
+  partyId: string;
+  groupId: GroupId;
+  before: number | undefined;
+  by: NamedMember;
+}
 
 /** Who may be told about an event, and why each of them would be. */
 interface Candidates {
@@ -108,6 +169,14 @@ interface Announcement {
   channelId: string;
   /** The member who caused it, who is not told. */
   actorId: string | null;
+  /**
+   * Set for news that has no reason of the member's own and no opt-out (a meeting time): every
+   * candidate is told, whatever was told before, and nothing is remembered. Nobody is asked
+   * about either: the candidates are signed up for the party, so they could see it a moment
+   * ago, and whoever left the server since cannot be written to, which the send finds out. So
+   * these messages never wait in the line of the look-ups.
+   */
+  toAll?: true;
   eventAt: number;
   expiresAt: number;
   gather(guildId: string): Promise<Candidates>;
@@ -141,7 +210,10 @@ const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(reso
  * not fired for them, and names that reason alone. The member who caused an event is not told,
  * and what fired for them counts as told. The memory is not stored: a raid that moves to
  * another region shares it with the party it becomes, it is forgotten when the party ends, and
- * it is empty after a restart, which can repeat a message (accepted).
+ * it is empty after a restart, which can repeat a message (accepted). "The egg you are signed
+ * up for has its boss" is the exception: a member is told whenever the boss is another than the
+ * last one they were told for this raid, so the last message is never wrong (X, Y, X is three
+ * messages; X, an egg again, X is one. Matt, 2026-10-13).
  *
  * **One message per member and event**, whatever number of reasons fire; it names them all.
  */
@@ -154,9 +226,23 @@ export class NotifyService implements PartyNotifier {
   private readonly snowflakes = new Map<number, string>();
   /** Set at shutdown (`close`): nothing new is taken, and nothing in flight begins a batch. */
   private closed = false;
+  /** The meeting times of raid groups whose message waits for its delay, by party and group. */
+  private readonly meetings: Gathered<PendingMeeting>;
 
   constructor(private readonly options: NotifyServiceOptions) {
     this.now = options.now ?? (() => Date.now());
+    this.meetings = new Gathered({
+      delayMs: options.meetingDelayMs ?? 5_000,
+      send: (_key, pending) => {
+        this.announceMeeting(pending);
+        return Promise.resolve();
+      },
+      // Two changes made one: the time as it was before the older of them.
+      fold: (older, newer) => ({ ...newer, before: older.before }),
+      onError: (err, key) => {
+        options.log.warn({ err, key }, 'could not tell of a meeting time');
+      },
+    });
     options.store.onChange((_before, after) => {
       if (after.status !== 'active') this.told.delete(after.id);
     });
@@ -186,7 +272,12 @@ export class NotifyService implements PartyNotifier {
   raidReported(party: RaidParty, actorId: string): void {
     this.safely('a reported raid', () => {
       if (!this.enabled) return;
-      this.announceRaid(party, 'reported', actorId, { wants: true, gym: true, corrected: false });
+      this.announceRaid(party, 'reported', actorId, {
+        wants: true,
+        gym: true,
+        bossSet: false,
+        corrected: false,
+      });
     });
   }
 
@@ -203,13 +294,15 @@ export class NotifyService implements PartyNotifier {
           ? false
           : otherBoss || !sameRaidTier(before.raid.tier, after.raid.tier);
       const gym = before.gymId !== after.gymId;
-      // A boss in the place of another one is told as the correction it is.
-      const corrected = otherBoss && is !== null && was !== null;
+      // The raid has a boss it did not have: who is signed up and asked to hear that is told,
+      // wanted or not; a boss in the place of another one as the correction it is.
+      const bossSet = is !== null && otherBoss;
+      const corrected = bossSet && was !== null;
       // A change of both at once is told as the other gym it also is.
       if (gym) {
-        this.announceRaid(after, 'gym', actorId, { wants: boss, gym: true, corrected });
+        this.announceRaid(after, 'gym', actorId, { wants: boss, gym: true, bossSet, corrected });
       } else if (boss) {
-        this.announceRaid(after, 'boss', actorId, { wants: true, gym: false, corrected });
+        this.announceRaid(after, 'boss', actorId, { wants: true, gym: false, bossSet, corrected });
       }
     });
   }
@@ -231,7 +324,158 @@ export class NotifyService implements PartyNotifier {
       if (!this.enabled) return;
       // In another region other members can see it: the wants are asked again, and whoever was
       // told already is not told a second time.
-      this.announceRaid(to, 'gym', actorId, { wants: true, gym: true, corrected: false });
+      this.announceRaid(to, 'gym', actorId, {
+        wants: true,
+        gym: true,
+        bossSet: false,
+        corrected: false,
+      });
+    });
+  }
+
+  trainCreated(party: TrainParty, actorId: string): void {
+    this.safely('a new train', () => {
+      this.announceTrain(party, actorId);
+    });
+  }
+
+  private announceTrain(party: TrainParty, actorId: string): void {
+    if (!this.enabled) return;
+    const { forumChannelId, forumPostId } = party;
+    if (forumChannelId === null || forumPostId === null) return;
+    const { newTrains, regions, posts } = this.options;
+    const eventAt = this.now();
+    const reason: NotifyReason = { kind: 'new-train' };
+    let embed: { made?: APIEmbed | undefined } | undefined;
+    this.announce({
+      key: party.id,
+      partyId: party.id,
+      guildRowId: party.guildId,
+      channelId: forumChannelId,
+      actorId,
+      eventAt,
+      expiresAt: eventAt + TRAIN_NEWS_MS,
+      // Who asked in this server (Matt, 2026-10-12: per server, like the wants).
+      gather: async (guildId) => ({
+        ids: await newTrains.wanting(guildId),
+        reasonsOf: () => [reason],
+      }),
+      message: (guildId, reasons) => {
+        embed ??= { made: this.embedOf(posts, party) };
+        const region = party.regionId === null ? undefined : regions.byId(party.regionId);
+        return notifyDm(
+          trainDmSentence({
+            regionChannelId: region?.channelId,
+            maker: memberOf(party, party.createdById),
+            link: postLink(guildId, forumPostId),
+          }),
+          reasons.map((one) => this.shown(guildId, one)),
+          embed.made,
+        );
+      },
+      priority: () => DM_PRIORITY.normal,
+    });
+  }
+
+  meetingTimeChanged(
+    partyId: string,
+    groupId: GroupId,
+    before: number | undefined,
+    by: NamedMember,
+  ): void {
+    this.safely('a meeting time', () => {
+      if (this.closed) return;
+      // Part of parties, not of the notifications a server can switch off: always sent.
+      this.meetings.later(`${partyId}:${groupId}`, (earlier) => ({
+        partyId,
+        groupId,
+        before: earlier ? earlier.before : before,
+        by,
+      }));
+    });
+  }
+
+  /** Tells the group the meeting time it has now, unless that is the one it had before. */
+  private announceMeeting(pending: PendingMeeting): void {
+    const { partyId, groupId, by } = pending;
+    const party = this.options.store.get(partyId);
+    if (!party || !isRaid(party)) return;
+    const time = groupOf(party, groupId)?.startTime;
+    if (time === pending.before) return;
+    const others = membersWhere(
+      party,
+      (attendee, id) =>
+        id !== by.id && attendee.group === groupId && attendee.status !== PartyStatus.Complete,
+    );
+    const now = this.now();
+    this.tellAttendees(party, others, by, {
+      what: 'meeting',
+      time: time === undefined ? null : clockOrDate(time, now),
+      heads: headCount(party, groupId),
+      expiresAt: time ?? now + CANCELLED_NEWS_MS,
+    });
+  }
+
+  startTimeChanged(party: TimedParty, by: NamedMember): void {
+    this.safely('a start time', () => {
+      this.announceStartTime(party, by);
+    });
+  }
+
+  private announceStartTime(party: TimedParty, by: NamedMember): void {
+    const start = startTimeOf(party);
+    const others = membersWhere(
+      party,
+      (attendee, id) => id !== by.id && attendee.status !== PartyStatus.Complete,
+    );
+    const now = this.now();
+    this.tellAttendees(party, others, by, {
+      what: 'start',
+      time: start === null ? null : clockOrDay(start, now, this.options.settings.timezone),
+      heads: headCount(party),
+      expiresAt: start ?? now + CANCELLED_NEWS_MS,
+    });
+  }
+
+  /**
+   * The legacy bot's direct message about a time to meet at, to these members of a party: no
+   * reasons, no button, no opt-out, and before everything that is only news.
+   */
+  private tellAttendees(
+    party: Party,
+    memberIds: readonly string[],
+    by: NamedMember,
+    news: { what: 'meeting' | 'start'; time: string | null; heads: number; expiresAt: number },
+  ): void {
+    const { forumChannelId, forumPostId } = party;
+    if (forumChannelId === null || forumPostId === null || memberIds.length === 0) return;
+    const eventAt = this.now();
+    this.announce({
+      // A line of their own: these read nothing of what was told and ask about nobody, so they
+      // never wait behind an event of their party whose members are still being looked up.
+      key: `${party.id}:times`,
+      partyId: party.id,
+      guildRowId: party.guildId,
+      channelId: forumChannelId,
+      actorId: by.id,
+      toAll: true,
+      eventAt,
+      // A time that has passed by the time the message would go is not worth a message.
+      expiresAt: Math.max(news.expiresAt, eventAt + 60_000),
+      gather: () => Promise.resolve({ ids: [...memberIds], reasonsOf: () => [] }),
+      message: (guildId) =>
+        notifyDm(
+          meetingDmSentence({
+            what: news.what,
+            by,
+            time: news.time,
+            heads: news.heads,
+            link: postLink(guildId, forumPostId),
+          }),
+          [],
+          undefined,
+        ),
+      priority: () => DM_PRIORITY.urgent,
     });
   }
 
@@ -249,16 +493,20 @@ export class NotifyService implements PartyNotifier {
     include: {
       wants: boolean;
       gym: boolean;
-      /** The boss took the place of another one. */
+      /** The raid has a boss it did not have: who is signed up and asked to hear it is told. */
+      bossSet: boolean;
+      /** That boss took the place of another one. */
       corrected: boolean;
     },
   ): void {
     const { forumChannelId, forumPostId, gymId } = party;
     // A raid is announced only once it has its post: the message links to it.
     if (forumChannelId === null || forumPostId === null) return;
-    const { gyms, regions, gameData, raidBosses, wants, gymTargets, posts, log } = this.options;
+    const { gyms, regions, gameData, raidBosses, wants, gymTargets, users, posts, log } =
+      this.options;
     const sighting = this.sighting(party);
     const eventAt = this.now();
+    const bossNow = party.raid.boss;
     let embed: { made?: APIEmbed | undefined } | undefined;
     this.announce({
       key: party.id,
@@ -271,6 +519,7 @@ export class NotifyService implements PartyNotifier {
       gather: async (guildId) => {
         const wanting = new Map<string, readonly Want[]>();
         const targeting = new Set<string>();
+        const awaiting = new Set<string>();
         // Each read by itself: one that fails does not keep the other's members from being told.
         if (include.wants) {
           try {
@@ -288,9 +537,24 @@ export class NotifyService implements PartyNotifier {
             log.warn({ err, party: party.id }, 'could not read who targets a gym');
           }
         }
+        if (include.bossSet && bossNow !== null) {
+          try {
+            const signedUp = membersWhere(party, (a) => a.status !== PartyStatus.Complete);
+            const settings = await users.getMany(signedUp);
+            for (const id of signedUp) {
+              if (settings.get(id)?.bossSetNotification === true) awaiting.add(id);
+            }
+          } catch (err) {
+            log.warn({ err, party: party.id }, 'could not read who waits for the boss of an egg');
+          }
+        }
         return {
-          ids: [...new Set([...wanting.keys(), ...targeting])],
+          // Who is in the raid first: their message goes before the news for everybody else.
+          ids: [...new Set([...awaiting, ...wanting.keys(), ...targeting])],
           reasonsOf: (id) => [
+            ...(awaiting.has(id) && bossNow !== null
+              ? [{ kind: 'boss-set' as const, boss: bossId(bossNow) }]
+              : []),
             ...raidWantsFiring(gameData.catalogue, wanting.get(id) ?? [], sighting).map(
               (target): NotifyReason => ({ kind: 'want', target }),
             ),
@@ -302,23 +566,40 @@ export class NotifyService implements PartyNotifier {
         // The post as it is when the first message is made, for all of them.
         embed ??= { made: this.embedOf(posts, party) };
         const region = party.regionId === null ? undefined : regions.byId(party.regionId);
-        const sentence = raidDmSentence({
-          event,
-          tier: party.raid.tier,
-          boss: shownBoss(party, gameData.catalogue, raidBosses.bosses())?.name,
-          corrected: include.corrected,
-          gym: gymName(gymId === null ? undefined : gyms.get(gymId)),
-          regionChannelId: region?.channelId,
-          reporter: party.anonymous ? undefined : memberOf(party, party.createdById),
-          link: postLink(guildId, forumPostId),
-        });
+        const boss = shownBoss(party, gameData.catalogue, raidBosses.bosses())?.name;
+        const gym = gymName(gymId === null ? undefined : gyms.get(gymId));
+        const link = postLink(guildId, forumPostId);
+        // Who is signed up is told what became of their egg, whatever else fires for them.
+        const theirs = boss !== undefined && reasons.some((reason) => reason.kind === 'boss-set');
+        const sentence = theirs
+          ? bossSetSentence({
+              boss,
+              gym,
+              regionChannelId: region?.channelId,
+              hatched: raidStage(party, eventAt) !== 'egg',
+              corrected: include.corrected,
+              link,
+            })
+          : raidDmSentence({
+              event,
+              tier: party.raid.tier,
+              boss,
+              corrected: include.corrected,
+              gym,
+              regionChannelId: region?.channelId,
+              reporter: party.anonymous ? undefined : memberOf(party, party.createdById),
+              link,
+            });
         return notifyDm(
           sentence,
           reasons.map((reason) => this.shown(guildId, reason)),
           embed.made,
         );
       },
-      priority: () => DM_PRIORITY.normal,
+      priority: (reasons) =>
+        reasons.some((reason) => reason.kind === 'boss-set')
+          ? DM_PRIORITY.urgent
+          : DM_PRIORITY.normal,
     });
   }
 
@@ -425,8 +706,12 @@ export class NotifyService implements PartyNotifier {
 
   private async deliver(event: Announcement): Promise<void> {
     const { members, dms, log } = this.options;
-    // It waited behind other events of its party: ended, too late or shut down meanwhile.
-    if (this.closed || !this.alive(event) || this.now() >= event.expiresAt) return;
+    // It waited behind other events of its party: ended, too late or shut down meanwhile. A
+    // time to meet at is told at shutdown too: `close` announces those that waited for their
+    // delay, and they ask nobody.
+    if ((this.closed && !event.toAll) || !this.alive(event) || this.now() >= event.expiresAt) {
+      return;
+    }
     const guildId = await this.guildSnowflake(event.guildRowId);
     if (guildId === undefined) return;
     const { ids, reasonsOf } = await event.gather(guildId);
@@ -441,9 +726,13 @@ export class NotifyService implements PartyNotifier {
       if (this.now() >= event.expiresAt) return;
       // Shutting down: the batch that was being asked about was put in line, no other begins,
       // not even the first of an event that was still reading who it is for.
-      if (this.closed) return;
+      if (this.closed && !event.toAll) return;
       const firing = new Map<string, NotifyReason[]>();
       for (const id of ids.slice(start, start + BATCH)) {
+        if (event.toAll) {
+          if (id !== event.actorId) firing.set(id, []);
+          continue;
+        }
         const reasons = this.unsaid(event.partyId, id, reasonsOf(id));
         if (reasons.length === 0) continue;
         // Whoever caused it knows: not told, now or for these reasons later.
@@ -451,16 +740,20 @@ export class NotifyService implements PartyNotifier {
         else firing.set(id, reasons);
       }
       if (firing.size > 0) {
-        let seeing: Set<string> | undefined;
-        try {
-          seeing = await members.viewers(guildId, event.channelId, [...firing.keys()]);
-        } catch (err) {
-          log.warn(
-            { err, party: event.partyId, members: firing.size },
-            'could not find out who can see an event; they are not told',
-          );
+        let seeing: ReadonlySet<string> | undefined;
+        if (event.toAll) {
+          seeing = new Set(firing.keys());
+        } else {
+          try {
+            seeing = await members.viewers(guildId, event.channelId, [...firing.keys()]);
+          } catch (err) {
+            log.warn(
+              { err, party: event.partyId, members: firing.size },
+              'could not find out who can see an event; they are not told',
+            );
+          }
+          if (!this.alive(event)) return;
         }
-        if (!this.alive(event)) return;
         for (const [id, reasons] of firing) {
           if (!seeing?.has(id)) continue;
           const key = reasons.map(reasonKey).join('\n');
@@ -480,7 +773,7 @@ export class NotifyService implements PartyNotifier {
             messages.set(key, message);
           }
           if (message === null) continue;
-          this.remember(event.partyId, id, reasons);
+          if (!event.toAll) this.remember(event.partyId, id, reasons);
           dms.send({
             userId: id,
             message,
@@ -497,19 +790,27 @@ export class NotifyService implements PartyNotifier {
     log.debug({ party: event.partyId, candidates: ids.length, told }, 'members were told');
   }
 
+  /** Announces the meeting times that wait for their delay now. For tests and `close`. */
+  async flushMeetings(): Promise<void> {
+    await this.meetings.flush();
+  }
+
   /** Waits for every event that is being worked off. For tests; shutdown uses `close`. */
   async flush(): Promise<void> {
+    await this.meetings.flush();
     while (this.background.size > 0) await Promise.all(this.background);
   }
 
   /**
-   * For shutdown: nothing is taken from now on; an event that is being worked off puts the
-   * members it is asking about in line and begins no other batch, one that has asked about
-   * nobody yet asks about nobody, and one that waits behind another does not begin. Waits for
-   * that. (Not part of `flush`, which tests call between events to wait for what is on its
-   * way.)
+   * For shutdown: the meeting times that wait for their delay are told now (they and the start
+   * times already announced still go out: they ask nobody), and nothing is taken from then on;
+   * an event that is being worked off puts the members it is asking about in line and begins no
+   * other batch, one that has asked about nobody yet asks about nobody, and one that waits
+   * behind another does not begin. Waits for that. (Not part of `flush`, which tests call
+   * between events to wait for what is on its way.)
    */
   async close(): Promise<void> {
+    await this.flushMeetings();
     this.closed = true;
     while (this.background.size > 0) await Promise.all(this.background);
   }
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -588,7 +588,12 @@ export class PartyService {
     const rendered = this.rendered({ ...party, forumChannelId: forumId });
     await store.add(party);
     // The row exists; from here on a failure must not leave an active party without a post.
-    return this.createTracked(party, region, rendered);
+    const created = await this.createTracked(party, region, rendered);
+    // Whoever asked to hear of new trains is told, but for who made this one.
+    if (created.kind === 'created' && isTrain(created.party)) {
+      this.notifier?.trainCreated(created.party, request.creatorId);
+    }
+    return created;
   }
 
   /** `createPostFor`, remembered while it runs: a report of the same gym waits for it. */
```

Apply to `src/services/timed-party-service.ts`:

```diff
--- a/src/services/timed-party-service.ts
+++ b/src/services/timed-party-service.ts
@@ -19,6 +19,7 @@ import type { Logger } from '../log.js';
 import { clockOrDay, LIMITS, memberText, plain, timestamp, withMentions } from '../render/text.js';
 import type { Member } from './attendance-service.js';
 import { Gathered } from './gathered.js';
+import type { PartyNotifier } from './notify-service.js';
 import { settingsOf, storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
@@ -42,6 +43,8 @@ export interface TimedPartyServiceOptions {
   lines: Pick<PartyLines, 'say'>;
   /** The members' settings: who lets the bot ping them. */
   users: UserSettingsReader;
+  /** Told when the start of a party has changed and the post was told. */
+  notify?: Pick<PartyNotifier, 'startTimeChanged'>;
   log: Logger;
   /** IANA zone in which "today" is judged when a time is named (`settings.timezone`). */
   zone: string;
@@ -206,7 +209,13 @@ export class TimedPartyService {
       .slice(0, LIMITS.pings);
     // A message into the post of a party that has ended would open an archived post again.
     if (!store.get(partyId)) return;
-    await gateway.sendMessage(postId, withMentions(said, pingable));
+    try {
+      await gateway.sendMessage(postId, withMentions(said, pingable));
+    } finally {
+      // Everybody else who is signed up also gets a direct message (always, as in a raid),
+      // after the post was told: telling members must never be in the way of that.
+      this.options.notify?.startTimeChanged(party, by);
+    }
   }
 
   /**
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/notify-paths.test.ts src/render/notify-dm.test.ts src/services/notify-service.parties.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 6d08e12 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/app.ts src/commands/notify-paths.test.ts src/render/notify-dm.test.ts src/render/notify-dm.ts src/services/attendance-service.ts src/services/notify-service.parties.test.ts src/services/notify-service.ts src/services/party-service.ts src/services/timed-party-service.ts test/support/party-service.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app.ts src/commands/notify-paths.test.ts src/render/notify-dm.test.ts src/render/notify-dm.ts src/services/attendance-service.ts src/services/notify-service.parties.test.ts src/services/notify-service.ts src/services/party-service.ts src/services/timed-party-service.ts test/support/party-service.ts
git commit -m "Direct messages for a new train, the boss of an egg and a meeting time" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 3,194 unit tests.

---

### Task 8: Pokémon icons: the list of files that exist, the picture of an entry, raid and train posts

**Files:**
- Create: `src/domain/pogo/pokemon-icons.test.ts`, `src/domain/pogo/pokemon-icons.ts`, `test/fixtures/pokemon-icons.json`
- Modify: `data/settings.json`, `scripts/game-data/make-fixtures.ts`, `src/app.ts`, `src/config/settings.test.ts`, `src/config/settings.ts`, `src/render/raid-post.test.ts`, `src/render/raid-post.ts`, `src/services/game-data-service.test.ts`, `src/services/game-data-service.ts`, `src/services/party-service.ts`, `test/fixtures/settings.json`, `test/support/game-data.ts`

**Interfaces:**
- Consumes: `GameDataService` (download, the saved copy `var/game-data-cache.json`, refresh), `settings.gameData`, the feed's file-name reader of `raid-boss-feed.ts`, `shownBoss` / `shownAutoset` of the party service, `scripts/game-data/make-fixtures.ts`.
- Produces: The settings key `gameData.iconsUrl` (schema, `test/fixtures/settings.json`, `data/settings.json`); `src/domain/pogo/pokemon-icons.ts` (pure): `iconNamesOf(listing)`, `isTruncatedListing`, `PokemonIcons`, `iconCandidates`, `iconName(icons, catalogue, entry)`, `iconAddress`, `POKEMON_ICON_BASE`, and `pokemonPicture(source)` (the feed's picture wins, else the icon, else none); `GameDataService` downloads the list with the game data, keeps it in the saved copy, fetches it alone when the saved copy has none and again after a failure, and never lets it fail the game data; raid and train posts show the icon where the feed has no picture; the fixture `test/fixtures/pokemon-icons.json` and `iconsFixture()`.

`data/settings.json` is the new bot's own settings file and is changed here on purpose. The fixture is built by the script from a saved listing in the git-ignored `var/`; the implementer creates the fixture file as written and does not run the script.

Reference commit of the prototype for this task: `b865c25`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/config/settings.test.ts`:

```diff
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -47,7 +47,7 @@ describe('loadSettings', () => {
   });
 
   it('rejects a game data address that is not http or https', () => {
-    for (const key of ['gameMasterUrl', 'textUrl']) {
+    for (const key of ['gameMasterUrl', 'textUrl', 'iconsUrl']) {
       const file = writeSettings((s) => {
         (s.gameData as Record<string, unknown>)[key] = 'file:///etc/passwd';
       });
@@ -55,6 +55,14 @@ describe('loadSettings', () => {
     }
   });
 
+  it('requires the address of the list of Pokémon icons', () => {
+    expect(loadSettings(writeSettings(() => undefined)).gameData.iconsUrl).toMatch(/^https:/);
+    const file = writeSettings((s) => {
+      delete (s.gameData as Record<string, unknown>).iconsUrl;
+    });
+    expect(() => loadSettings(file)).toThrow(/iconsUrl/);
+  });
+
   it('reads the raid boss settings', () => {
     expect(loadSettings(writeSettings(() => undefined)).raidBosses).toEqual({
       url: 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.min.json',
```

Create `src/domain/pogo/pokemon-icons.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture, iconsFixture } from '../../../test/support/game-data.js';
import { feedLookupOf } from './feed-lookup.js';
import type { PokemonEntry } from './game-master.js';
import {
  iconAddress,
  iconCandidates,
  iconName,
  iconNamesOf,
  isTruncatedListing,
  POKEMON_ICON_BASE,
  PokemonIcons,
  pokemonPicture,
} from './pokemon-icons.js';
import { pictureIds } from './raid-boss-feed.js';

const catalogue = catalogueFixture();
const icons = iconsFixture();
const lookup = feedLookupOf(catalogue);

function entry(key: string): PokemonEntry {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`the fixture has no ${key}`);
  return found;
}

describe('iconNamesOf', () => {
  it('keeps the plain and the form icons of a listing, each once, sorted', () => {
    const listing = {
      truncated: false,
      tree: [
        { path: 'pm19.fALOLA.icon.png', type: 'blob' },
        { path: 'pm147.icon.png' },
        { path: 'pm147.icon.png' },
        { path: 'pm147.s.icon.png' },
        { path: 'pm25.cFALL_2019.icon.png' },
        { path: 'pm25.fVS_2019.g2.icon.png' },
        { path: 'pm201.fUNOWN_F.icon.png' },
        { path: 'README.md' },
        { path: '../pm1.icon.png' },
        { path: 7 },
        null,
      ],
    };
    expect(iconNamesOf(listing)).toEqual([
      'pm147.icon.png',
      'pm19.fALOLA.icon.png',
      'pm201.fUNOWN_F.icon.png',
    ]);
    expect(isTruncatedListing(listing)).toBe(false);
    expect(isTruncatedListing({ ...listing, truncated: true })).toBe(true);
  });

  it('refuses what is no listing, and a listing without any icon', () => {
    expect(() => iconNamesOf({ message: 'API rate limit exceeded' })).toThrow('not a tree');
    expect(() => iconNamesOf('pm1.icon.png')).toThrow('not a tree');
    expect(() => iconNamesOf(null)).toThrow('not a tree');
    expect(() => iconNamesOf({ tree: [{ path: 'README.md' }] })).toThrow('names no icon');
  });
});

describe('iconCandidates', () => {
  it('names the plain file for an entry without a form, or with the form NORMAL', () => {
    const plain = ['pm147.icon.png', 'pm147.fNORMAL.icon.png'];
    expect(iconCandidates(entry('dratini'))).toEqual(plain);
    expect(iconCandidates({ ...entry('dratini'), form: 'DRATINI_NORMAL' })).toEqual(plain);
  });

  it('names a form by its id without the species, then by the whole id', () => {
    expect(iconCandidates(entry('rattata_alola'))).toEqual([
      'pm19.fALOLA.icon.png',
      'pm19.fRATTATA_ALOLA.icon.png',
    ]);
    expect(iconCandidates(entry('giratina_altered'))[0]).toBe('pm487.fALTERED.icon.png');
    expect(iconCandidates(entry('giratina_origin'))[0]).toBe('pm487.fORIGIN.icon.png');
    expect(iconCandidates(entry('unown_f'))).toEqual([
      'pm201.fF.icon.png',
      'pm201.fUNOWN_F.icon.png',
    ]);
  });

  it('names a mega by its kind, as the feed does', () => {
    expect(iconCandidates(entry('charizard_mega_x'))[0]).toBe('pm6.fMEGA_X.icon.png');
    expect(iconCandidates(entry('venusaur_mega'))[0]).toBe('pm3.fMEGA.icon.png');
  });
});

describe('iconName', () => {
  it('picks the first candidate that exists', () => {
    expect(iconName(entry('dratini'), icons, catalogue)).toBe('pm147.icon.png');
    expect(iconName(entry('rattata_alola'), icons, catalogue)).toBe('pm19.fALOLA.icon.png');
    expect(iconName(entry('giratina_origin'), icons, catalogue)).toBe('pm487.fORIGIN.icon.png');
    expect(iconName(entry('charizard_mega_x'), icons, catalogue)).toBe('pm6.fMEGA_X.icon.png');
    // Unown's files carry the whole form id.
    expect(iconName(entry('unown_f'), icons, catalogue)).toBe('pm201.fUNOWN_F.icon.png');
  });

  it('gives a species whose files exist per form only the file of its first form in the catalogue', () => {
    expect(icons.has('pm201.icon.png')).toBe(false);
    expect(iconName(entry('unown'), icons, catalogue)).toBe('pm201.fUNOWN_A.icon.png');
    expect(iconName(entry('burmy'), icons, catalogue)).toBe('pm412.fBURMY_PLANT.icon.png');
    expect(iconName(entry('shellos'), icons, catalogue)).toBe('pm422.fEAST_SEA.icon.png');
    // Not where the species has a file of its own named NORMAL.
    expect(icons.has('pm646.icon.png')).toBe(false);
    expect(iconName(entry('kyurem'), icons, catalogue)).toBe('pm646.fNORMAL.icon.png');
  });

  it('prefers the ordinary form where the first in the catalogue is not it', () => {
    expect(catalogue.byDex(718).find((one) => one.kind === 'form')?.key).toBe('zygarde_complete');
    expect(iconName(entry('zygarde'), icons, catalogue)).toBe('pm718.fFIFTY_PERCENT.icon.png');
    expect(iconName(entry('furfrou'), icons, catalogue)).toBe('pm676.fNATURAL.icon.png');
    // The preferred form has no file: the first that has one.
    const without = new PokemonIcons(
      icons.names().filter((name) => name !== 'pm718.fFIFTY_PERCENT.icon.png'),
    );
    expect(iconName(entry('zygarde'), without, catalogue)).toBe('pm718.fCOMPLETE.icon.png');
  });

  it('never shows a whole species as its mega, primal or Gigantamax', () => {
    // Toxtricity has a Gigantamax file, which is no entry of the catalogue.
    expect(icons.has('pm849.fGIGANTAMAX.icon.png')).toBe(true);
    expect(iconName(entry('toxtricity'), icons, catalogue)).toBe('pm849.fAMPED.icon.png');
    const megaOnly = new PokemonIcons(['pm6.fMEGA_X.icon.png', 'pm6.fGIGANTAMAX.icon.png']);
    expect(iconName(entry('charizard'), megaOnly, catalogue)).toBeUndefined();
    expect(iconName(entry('charizard_mega_x'), megaOnly, catalogue)).toBe('pm6.fMEGA_X.icon.png');
    for (const one of catalogue.all) {
      if (one.kind !== 'species') continue;
      expect(iconName(one, icons, catalogue) ?? '', one.key).not.toMatch(
        /\.f(?:MEGA|PRIMAL|GIGANTAMAX)/,
      );
    }
  });

  it('shows a form without a file of its own by the plain file of its species', () => {
    // Scatterbug's patterns only change the look: one file for all of them.
    const pattern = catalogue
      .byDex(664)
      .find((one) => one.kind === 'form' && iconCandidates(one).every((name) => !icons.has(name)));
    expect(pattern).toBeDefined();
    if (pattern) expect(iconName(pattern, icons, catalogue)).toBe('pm664.icon.png');
    const few = new PokemonIcons([
      'pm19.icon.png',
      'pm147.fSOMETHING.icon.png',
      'pm6.icon.png',
      'pm646.fNORMAL.icon.png',
    ]);
    expect(iconName(entry('rattata_alola'), few, catalogue)).toBe('pm19.icon.png');
    expect(iconName(entry('rattata'), few, catalogue)).toBe('pm19.icon.png');
    expect(iconName(entry('kyurem_black'), few, catalogue)).toBe('pm646.fNORMAL.icon.png');
    // Not a mega: it is another Pokémon to look at.
    expect(iconName(entry('charizard_mega_x'), few, catalogue)).toBeUndefined();
  });

  it('gives nothing when no file fits', () => {
    const few = new PokemonIcons(['pm19.icon.png', 'pm147.fSOMETHING.icon.png']);
    // No plain file of the species, and a form is never shown by another form.
    expect(iconName(entry('giratina_origin'), few, catalogue)).toBeUndefined();
    expect(iconName(entry('giratina_origin'), icons, { byDex: () => [] })).toBe(
      'pm487.fORIGIN.icon.png',
    );
    // A file of the number that is no form of the catalogue shows nothing.
    expect(iconName(entry('dratini'), few, catalogue)).toBeUndefined();
    expect(iconName(entry('dratini'), new PokemonIcons([]), catalogue)).toBeUndefined();
  });
});

describe('the icons of the whole catalogue', () => {
  const every = catalogue.all;

  it('names only files the reader of feed pictures can read', () => {
    for (const one of every) {
      for (const name of iconCandidates(one)) {
        expect(
          pictureIds(`${POKEMON_ICON_BASE}${name}`, lookup),
          `${one.key}: ${name}`,
        ).toBeDefined();
      }
    }
  });

  it('is read back by the feed as the same entry, wherever the feed can tell', () => {
    let found = 0;
    const missing: string[] = [];
    const firstForm: string[] = [];
    const bySpecies: string[] = [];
    const unreadable: string[] = [];
    for (const one of every) {
      const address = iconAddress(one, { catalogue, icons });
      if (address === undefined) {
        missing.push(one.key);
        continue;
      }
      found += 1;
      const ids = pictureIds(address, lookup);
      if (!ids) throw new Error(`${one.key}: ${address} is not read`);
      const back = lookup.keyOf(ids.pokemonId, ids.form);
      if (back === one.key) continue;
      // The entry of a whole species shown by one of its forms, or a form shown by the plain
      // file of its species: another entry of the same species.
      if (iconCandidates(one).every((name) => !icons.has(name))) {
        (one.kind === 'species' ? firstForm : bySpecies).push(one.key);
        expect(one.kind, one.key).not.toBe('mega');
        expect(catalogue.byKey(back ?? '')?.dex, one.key).toBe(one.dex);
        continue;
      }
      // What the feed's reader cannot place: ids the catalogue has no entry for under that
      // spelling. Never another Pokémon.
      expect(back, `${one.key}: ${address}`).toBeUndefined();
      unreadable.push(one.key);
    }
    // Measured with the game master of 2026-10-10 and the files of 2026-10-12: 1,272 of 1,431
    // entries have a picture, 41 of them forms shown by the plain file of their species
    // (Scatterbug's and Spewpa's patterns and the like); the 159 without are species and megas
    // that are not released (97 and 13) and forms of species that have no plain file either
    // (49: Silvally's types, Minior's colours, Spinda's later patterns and the like). A refresh
    // of either fixture may move these a little.
    expect(found / every.length).toBeGreaterThan(0.87);
    expect(missing.length).toBeLessThan(every.length * 0.13);
    expect(unreadable).toEqual([]);
    // Whole species that have files per form only: Unown, Burmy, Shellos, Vivillon and so on.
    expect(firstForm).toContain('unown');
    expect(firstForm).not.toContain('kyurem');
    expect(firstForm.length).toBeLessThan(30);
    expect(bySpecies.length).toBeGreaterThan(20);
    expect(bySpecies.length).toBeLessThan(60);
  });
});

describe('pokemonPicture', () => {
  const feed = 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm25.cFALL_2019.icon.png';

  it('is the picture of the feed when there is one: it shows what the boss wears now', () => {
    expect(pokemonPicture(feed, entry('pikachu'), { catalogue, icons })).toBe(feed);
    expect(pokemonPicture(feed, undefined, undefined)).toBe(feed);
  });

  it('is the icon of the catalogue entry when the feed has none', () => {
    expect(pokemonPicture(undefined, entry('dratini'), { catalogue, icons })).toBe(
      'https://cdn.leekduck.com/assets/img/pokemon_icons/pm147.icon.png',
    );
    expect(pokemonPicture(undefined, entry('unown'), { catalogue, icons })).toBe(
      'https://cdn.leekduck.com/assets/img/pokemon_icons/pm201.fUNOWN_A.icon.png',
    );
  });

  it('is nothing without either: no entry, no icon for it, or no list of icons', () => {
    expect(pokemonPicture(undefined, undefined, { catalogue, icons })).toBeUndefined();
    expect(
      pokemonPicture(undefined, entry('dratini'), { catalogue, icons: new PokemonIcons([]) }),
    ).toBeUndefined();
    expect(pokemonPicture(undefined, entry('dratini'), { catalogue })).toBeUndefined();
    expect(pokemonPicture(undefined, entry('dratini'), undefined)).toBeUndefined();
    expect(iconAddress(entry('dratini'), undefined)).toBeUndefined();
  });
});
```

Apply to `src/render/raid-post.test.ts`:

```diff
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -1,5 +1,7 @@
 import type { APIEmbed } from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import { iconsFixture } from '../../test/support/game-data.js';
+import { PokemonIcons } from '../domain/pogo/pokemon-icons.js';
 import { partyControls } from './party-controls.js';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { testGyms } from '../../test/support/gyms.js';
@@ -106,6 +108,37 @@ describe('shownBoss', () => {
     expect(shown?.image).toMatch(/pm717\.icon\.png$/);
   });
 
+  it('gives a boss the list has no picture of the icon of its catalogue entry', () => {
+    const mewtwo = setBoss(egg, { tier: T5, boss: { key: 'mewtwo' } }, rules, PARTY_NOW).party;
+    expect(shownBoss(mewtwo, catalogue, bosses, iconsFixture())?.image).toBe(
+      'https://cdn.leekduck.com/assets/img/pokemon_icons/pm150.icon.png',
+    );
+    // A boss a moderator added by override is in the list without a picture.
+    const added = bosses.map((boss) => {
+      const { image: _image, ...rest } = boss;
+      return rest;
+    });
+    expect(shownBoss(yveltal, catalogue, added, iconsFixture())?.image).toBe(
+      'https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png',
+    );
+  });
+
+  it('keeps the picture of the list when there is one: it shows what the boss wears now', () => {
+    const costume = 'https://example.test/pm717.cFALL_2026.icon.png';
+    const dressed = bosses.map((boss) =>
+      boss.entry?.key === 'yveltal' ? { ...boss, image: costume } : boss,
+    );
+    expect(shownBoss(yveltal, catalogue, dressed, iconsFixture())?.image).toBe(costume);
+  });
+
+  it('shows no picture when neither the list nor the icons have one', () => {
+    const newmon = setBoss(egg, { tier: T5, boss: { name: 'Newmon' } }, rules, PARTY_NOW).party;
+    expect(shownBoss(newmon, catalogue, bosses, iconsFixture())).not.toHaveProperty('image');
+    const mewtwo = setBoss(egg, { tier: T5, boss: { key: 'mewtwo' } }, rules, PARTY_NOW).party;
+    expect(shownBoss(mewtwo, catalogue, bosses, new PokemonIcons([]))).not.toHaveProperty('image');
+    expect(shownBoss(mewtwo, catalogue, bosses, undefined)).not.toHaveProperty('image');
+  });
+
   it('gives a key the catalogue has lost a readable name', () => {
     const gone = setBoss(egg, { tier: T5, boss: { key: 'gone_mon' } }, rules, PARTY_NOW).party;
     expect(shownBoss(gone, catalogue, bosses)).toEqual({ name: 'Gone Mon', shiny: false });
@@ -118,6 +151,16 @@ describe('shownAutoset', () => {
     expect(shownAutoset(T5, t5)?.name).toBe(t5?.name);
     expect(shownAutoset({ level: 'T3', shadow: false }, t5)).toBeUndefined();
     expect(shownAutoset(T5, undefined)).toBeUndefined();
+    // What it will hatch as has its picture by the same rule as a boss.
+    if (!t5) throw new Error('the fixture has no certain T5 boss');
+    const { image: _image, ...bare } = t5;
+    expect(shownAutoset(T5, bare)).not.toHaveProperty('image');
+    const pictures = { catalogue, icons: iconsFixture() };
+    expect(shownAutoset(T5, bare, { catalogue })).not.toHaveProperty('image');
+    expect(shownAutoset(T5, bare, pictures)?.image).toMatch(/pokemon_icons\/pm\d+/);
+    expect(shownAutoset(T5, { ...t5, image: 'https://example.test/x.png' }, pictures)?.image).toBe(
+      'https://example.test/x.png',
+    );
   });
 });
 
```

Apply to `src/services/game-data-service.test.ts`:

```diff
--- a/src/services/game-data-service.test.ts
+++ b/src/services/game-data-service.test.ts
@@ -8,7 +8,19 @@ import { GameDataService, type FetchText } from './game-data-service.js';
 
 const GAME_MASTER_URL = 'https://example.test/latest.json';
 const TEXT_URL = 'https://example.test/English.txt';
+const ICONS_URL = 'https://example.test/trees/icons';
 const HOUR = 3_600_000;
+/** GitHub's listing of the folder of pictures, with three icons the bot can use among others. */
+const iconListing = JSON.stringify({
+  truncated: false,
+  tree: [
+    { path: 'pm147.icon.png' },
+    { path: 'pm147.s.icon.png' },
+    { path: 'pm19.fALOLA.icon.png' },
+    { path: 'pm201.fUNOWN_F.icon.png' },
+    { path: 'pm25.cFALL_2019.icon.png' },
+  ],
+});
 
 const gameMaster = JSON.stringify(readGameMasterSample());
 // The sample text file is a slice; the service wants the first Pokémon's name as proof it is the real one.
@@ -35,7 +47,7 @@ describe('GameDataService', () => {
   let requests: string[];
   let respond: FetchText;
 
-  function service(extra: { timeoutMs?: number; retryMs?: number } = {}) {
+  function service(extra: { timeoutMs?: number; retryMs?: number; iconsUrl?: string } = {}) {
     const { log, entries } = createTestLogger();
     const fetch: FetchText = (url, init) => {
       requests.push(url);
@@ -60,13 +72,207 @@ describe('GameDataService', () => {
     now = Date.UTC(2026, 9, 10, 12);
     clock = () => now;
     requests = [];
-    respond = (url) => Promise.resolve(ok(url === GAME_MASTER_URL ? gameMaster : english));
+    respond = (url) =>
+      Promise.resolve(
+        ok(url === GAME_MASTER_URL ? gameMaster : url === ICONS_URL ? iconListing : english),
+      );
   });
   afterEach(async () => {
     vi.useRealTimers();
     await rm(dir, { recursive: true, force: true });
   });
 
+  describe('the list of icon files', () => {
+    const withIcons = { iconsUrl: ICONS_URL };
+
+    it('is downloaded with the game data, saved with it, and read from the saved copy', async () => {
+      const { gameData } = service(withIcons);
+      expect(gameData.icons).toBeUndefined();
+      await gameData.load();
+      expect(requests.sort()).toEqual([TEXT_URL, ICONS_URL, GAME_MASTER_URL].sort());
+      expect(gameData.icons?.has('pm147.icon.png')).toBe(true);
+      expect(gameData.icons?.has('pm147.s.icon.png')).toBe(false);
+      expect(gameData.icons?.size).toBe(3);
+      const saved = JSON.parse(await readFile(cachePath, 'utf8')) as { icons: string[] };
+      expect(saved.icons).toEqual([
+        'pm147.icon.png',
+        'pm19.fALOLA.icon.png',
+        'pm201.fUNOWN_F.icon.png',
+      ]);
+      requests = [];
+      const again = service(withIcons);
+      await again.gameData.load();
+      expect(requests).toEqual([]);
+      expect(again.gameData.icons?.has('pm201.fUNOWN_F.icon.png')).toBe(true);
+    });
+
+    it('does not keep the game data from loading when it cannot be downloaded', async () => {
+      for (const answer of [
+        () => Promise.reject(new Error('getaddrinfo ENOTFOUND')),
+        () => Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve('') }),
+        () => Promise.resolve(ok('not json')),
+        () => Promise.resolve(ok(JSON.stringify({ message: 'API rate limit exceeded' }))),
+        () => Promise.resolve(ok(JSON.stringify({ tree: [{ path: 'README.md' }] }))),
+      ]) {
+        await rm(cachePath, { force: true });
+        respond = (url) =>
+          url === ICONS_URL
+            ? answer()
+            : Promise.resolve(ok(url === GAME_MASTER_URL ? gameMaster : english));
+        const { gameData, entries } = service(withIcons);
+        await gameData.load();
+        expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
+        expect(gameData.icons).toBeUndefined();
+        const warned = entries.filter(
+          (entry) => entry.msg === 'could not download the list of Pokémon icons',
+        );
+        expect(warned).toHaveLength(1);
+        expect(warned[0]).toMatchObject({ level: 40, kept: 0 });
+        // The game data was saved all the same.
+        const saved = JSON.parse(await readFile(cachePath, 'utf8')) as { icons?: string[] };
+        expect(saved.icons).toBeUndefined();
+      }
+    });
+
+    it('keeps the last list, in use and in the saved copy, when a later download fails', async () => {
+      await service(withIcons).gameData.load();
+      now += 25 * HOUR;
+      respond = (url) =>
+        url === ICONS_URL
+          ? Promise.reject(new Error('getaddrinfo ENOTFOUND'))
+          : Promise.resolve(ok(url === GAME_MASTER_URL ? gameMaster : english));
+      const { gameData, entries } = service(withIcons);
+      await gameData.load();
+      expect(gameData.fetchedAt).toBe(now);
+      expect(gameData.icons?.size).toBe(3);
+      expect(
+        entries.find((entry) => entry.msg === 'could not download the list of Pokémon icons'),
+      ).toMatchObject({ kept: 3 });
+      const saved = JSON.parse(await readFile(cachePath, 'utf8')) as {
+        fetchedAt: number;
+        icons: string[];
+      };
+      expect(saved.fetchedAt).toBe(now);
+      expect(saved.icons).toHaveLength(3);
+    });
+
+    it('takes a newer list on refresh, also when the game data itself could not be refreshed', async () => {
+      const { gameData } = service(withIcons);
+      await gameData.load();
+      respond = (url) =>
+        url === ICONS_URL
+          ? Promise.resolve(ok(JSON.stringify({ tree: [{ path: 'pm1.icon.png' }] })))
+          : Promise.resolve(ok('rubbish'));
+      expect(await gameData.refresh()).toBe(false);
+      expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
+      expect(gameData.icons?.names()).toEqual(['pm1.icon.png']);
+    });
+
+    it('is not asked for where no address is configured', async () => {
+      const { gameData } = service();
+      await gameData.load();
+      expect(requests).toHaveLength(2);
+      expect(gameData.icons).toBeUndefined();
+      requests = [];
+      const again = service();
+      await again.gameData.load();
+      await again.gameData.whenIdle();
+      expect(requests).toEqual([]);
+    });
+
+    it('is fetched alone, on the side, when a fresh saved copy has none', async () => {
+      // A copy saved before the list existed, or while it could not be downloaded.
+      await service().gameData.load();
+      const before = JSON.parse(await readFile(cachePath, 'utf8')) as { fetchedAt: number };
+      requests = [];
+      now += HOUR;
+      let release = () => {};
+      const gate = new Promise<void>((resolve) => {
+        release = resolve;
+      });
+      respond = async (url) => {
+        await gate;
+        return ok(url === ICONS_URL ? iconListing : 'rubbish');
+      };
+      const later = service(withIcons);
+      // The bot starts from the saved copy without waiting for the list.
+      await later.gameData.load();
+      expect(later.gameData.catalogue.byKey('venusaur')).toBeDefined();
+      expect(later.gameData.icons).toBeUndefined();
+      release();
+      await later.gameData.whenIdle();
+      // The game master was not fetched for it.
+      expect(requests).toEqual([ICONS_URL]);
+      expect(later.gameData.icons?.size).toBe(3);
+      // The saved copy has the list now, and is as old as it was.
+      const saved = JSON.parse(await readFile(cachePath, 'utf8')) as {
+        fetchedAt: number;
+        icons: string[];
+        data: { pokemon: unknown[] };
+      };
+      expect(saved.icons).toHaveLength(3);
+      expect(saved.fetchedAt).toBe(before.fetchedAt);
+      expect(saved.data.pokemon.length).toBeGreaterThan(0);
+      expect(later.gameData.fetchedAt).toBe(before.fetchedAt);
+      requests = [];
+      const third = service(withIcons);
+      await third.gameData.load();
+      await third.gameData.whenIdle();
+      expect(requests).toEqual([]);
+      expect(third.gameData.icons?.size).toBe(3);
+    });
+
+    it('never lets a listing that was cut short take names away: both lists are kept', async () => {
+      const { gameData, entries } = service(withIcons);
+      await gameData.load();
+      expect(gameData.icons?.size).toBe(3);
+      respond = (url) =>
+        Promise.resolve(
+          ok(
+            url === ICONS_URL
+              ? JSON.stringify({
+                  truncated: true,
+                  tree: [{ path: 'pm1.icon.png' }, { path: 'pm147.icon.png' }],
+                })
+              : url === GAME_MASTER_URL
+                ? gameMaster
+                : english,
+          ),
+        );
+      expect(await gameData.refresh()).toBe(true);
+      expect(gameData.icons?.names()).toEqual([
+        'pm1.icon.png',
+        'pm147.icon.png',
+        'pm19.fALOLA.icon.png',
+        'pm201.fUNOWN_F.icon.png',
+      ]);
+      expect(entries.some((entry) => entry.msg === 'the list of Pokémon icons was cut short')).toBe(
+        true,
+      );
+      const saved = JSON.parse(await readFile(cachePath, 'utf8')) as { icons: string[] };
+      expect(saved.icons).toHaveLength(4);
+    });
+
+    it('says so when the listing was cut short, and uses what it has', async () => {
+      respond = (url) =>
+        Promise.resolve(
+          ok(
+            url === ICONS_URL
+              ? JSON.stringify({ truncated: true, tree: [{ path: 'pm1.icon.png' }] })
+              : url === GAME_MASTER_URL
+                ? gameMaster
+                : english,
+          ),
+        );
+      const { gameData, entries } = service(withIcons);
+      await gameData.load();
+      expect(gameData.icons?.size).toBe(1);
+      expect(entries.some((entry) => entry.msg === 'the list of Pokémon icons was cut short')).toBe(
+        true,
+      );
+    });
+  });
+
   it('has no catalogue before it is loaded', () => {
     expect(() => service().gameData.catalogue).toThrow(/not been loaded/);
   });
@@ -461,6 +667,67 @@ describe('GameDataService', () => {
       gameData.stop();
     });
 
+    it('asks for the list of icons alone, after the retry period, when its download failed', async () => {
+      fakeClock();
+      const failing: FetchText = (url) =>
+        url === ICONS_URL
+          ? Promise.reject(new Error('getaddrinfo ENOTFOUND'))
+          : Promise.resolve(ok(url === GAME_MASTER_URL ? gameMaster : english));
+      respond = failing;
+      const { gameData, entries } = service({ iconsUrl: ICONS_URL });
+      await gameData.load();
+      expect(gameData.icons).toBeUndefined();
+      requests = [];
+      gameData.startAutoRefresh();
+      await vi.advanceTimersByTimeAsync(RETRY - 1);
+      expect(requests).toEqual([]);
+      await vi.advanceTimersByTimeAsync(1);
+      // The list alone: the game data is fresh.
+      expect(requests).toEqual([ICONS_URL]);
+      await settle(gameData);
+      // Still failing: again a retry period later.
+      await vi.advanceTimersByTimeAsync(RETRY);
+      expect(requests).toEqual([ICONS_URL, ICONS_URL]);
+      await settle(gameData);
+      respond = (url) =>
+        Promise.resolve(
+          ok(url === GAME_MASTER_URL ? gameMaster : url === ICONS_URL ? iconListing : english),
+        );
+      await vi.advanceTimersByTimeAsync(RETRY);
+      expect(requests).toEqual([ICONS_URL, ICONS_URL, ICONS_URL]);
+      await settle(gameData);
+      expect(gameData.icons?.size).toBe(3);
+      const saved = JSON.parse(await readFile(cachePath, 'utf8')) as { icons: string[] };
+      expect(saved.icons).toHaveLength(3);
+      // From then on nothing until the game data is a full period old.
+      await vi.advanceTimersByTimeAsync(24 * HOUR - 3 * RETRY - 1);
+      expect(requests).toHaveLength(3);
+      await vi.advanceTimersByTimeAsync(1);
+      expect(requests).toHaveLength(6);
+      gameData.stop();
+      await settle(gameData);
+      await expectCleanSave(entries);
+    });
+
+    it('asks again for a list that a fresh saved copy lacks and that could not be fetched at the start', async () => {
+      await service().gameData.load();
+      fakeClock(now + HOUR);
+      respond = () => Promise.reject(new Error('offline'));
+      requests = [];
+      const { gameData } = service({ iconsUrl: ICONS_URL });
+      await gameData.load();
+      gameData.startAutoRefresh();
+      await settle(gameData);
+      expect(requests).toEqual([ICONS_URL]);
+      respond = (url) => Promise.resolve(ok(url === ICONS_URL ? iconListing : 'rubbish'));
+      await vi.advanceTimersByTimeAsync(RETRY);
+      await settle(gameData);
+      expect(requests).toEqual([ICONS_URL, ICONS_URL]);
+      expect(gameData.icons?.size).toBe(3);
+      gameData.stop();
+      await settle(gameData);
+    });
+
     it('downloads nothing more once stopped', async () => {
       fakeClock();
       const { gameData } = service();
```

Create `test/fixtures/pokemon-icons.json`:

```
[
"pm1.fFALL_2019.icon.png",
"pm1.icon.png",
"pm10.icon.png",
"pm100.fHISUIAN.icon.png",
"pm100.icon.png",
"pm1000.icon.png",
"pm101.fHISUIAN.icon.png",
"pm101.icon.png",
"pm1011.icon.png",
"pm1012.fARTISAN.icon.png",
"pm1012.fCOUNTERFEIT.icon.png",
"pm1013.fMASTERPIECE.icon.png",
"pm1013.fUNREMARKABLE.icon.png",
"pm1019.icon.png",
"pm102.icon.png",
"pm103.fALOLA.icon.png",
"pm103.icon.png",
"pm104.icon.png",
"pm105.fALOLA.icon.png",
"pm105.icon.png",
"pm106.icon.png",
"pm107.icon.png",
"pm108.icon.png",
"pm109.icon.png",
"pm11.icon.png",
"pm110.fGALARIAN.icon.png",
"pm110.icon.png",
"pm111.icon.png",
"pm112.icon.png",
"pm113.icon.png",
"pm114.icon.png",
"pm115.fMEGA.icon.png",
"pm115.icon.png",
"pm116.icon.png",
"pm117.icon.png",
"pm118.icon.png",
"pm119.icon.png",
"pm12.fGIGANTAMAX.icon.png",
"pm12.icon.png",
"pm120.icon.png",
"pm121.icon.png",
"pm122.fGALARIAN.icon.png",
"pm122.icon.png",
"pm123.icon.png",
"pm124.icon.png",
"pm125.icon.png",
"pm126.icon.png",
"pm127.fMEGA.icon.png",
"pm127.icon.png",
"pm128.fPALDEA_AQUA.icon.png",
"pm128.fPALDEA_BLAZE.icon.png",
"pm128.fPALDEA_COMBAT.icon.png",
"pm128.icon.png",
"pm129.icon.png",
"pm13.icon.png",
"pm130.fMEGA.icon.png",
"pm130.icon.png",
"pm131.fCOSTUME_2020.icon.png",
"pm131.fGIGANTAMAX.icon.png",
"pm131.icon.png",
"pm132.icon.png",
"pm133.fGOFEST_2024_MTIARA.icon.png",
"pm133.fGOFEST_2024_STIARA.icon.png",
"pm133.icon.png",
"pm134.icon.png",
"pm135.icon.png",
"pm136.icon.png",
"pm137.icon.png",
"pm138.icon.png",
"pm139.icon.png",
"pm14.icon.png",
"pm140.icon.png",
"pm141.icon.png",
"pm142.fMEGA.icon.png",
"pm142.fSUMMER_2023.icon.png",
"pm142.icon.png",
"pm143.fGIGANTAMAX.icon.png",
"pm143.fWILDAREA_2024.icon.png",
"pm143.icon.png",
"pm144.fGALARIAN.icon.png",
"pm144.icon.png",
"pm145.fGALARIAN.icon.png",
"pm145.icon.png",
"pm146.fGALARIAN.icon.png",
"pm146.icon.png",
"pm147.icon.png",
"pm148.icon.png",
"pm149.icon.png",
"pm15.fMEGA.icon.png",
"pm15.icon.png",
"pm150.fA.icon.png",
"pm150.icon.png",
"pm151.icon.png",
"pm152.icon.png",
"pm153.icon.png",
"pm154.icon.png",
"pm155.icon.png",
"pm156.icon.png",
"pm157.fHISUIAN.icon.png",
"pm157.icon.png",
"pm158.icon.png",
"pm159.icon.png",
"pm16.icon.png",
"pm160.icon.png",
"pm161.icon.png",
"pm162.icon.png",
"pm163.icon.png",
"pm164.icon.png",
"pm165.icon.png",
"pm166.icon.png",
"pm167.icon.png",
"pm168.icon.png",
"pm169.icon.png",
"pm17.icon.png",
"pm170.icon.png",
"pm171.icon.png",
"pm172.icon.png",
"pm173.icon.png",
"pm174.icon.png",
"pm175.icon.png",
"pm176.icon.png",
"pm177.icon.png",
"pm178.icon.png",
"pm179.icon.png",
"pm18.fMEGA.icon.png",
"pm18.icon.png",
"pm180.icon.png",
"pm181.fMEGA.icon.png",
"pm181.icon.png",
"pm182.icon.png",
"pm183.icon.png",
"pm184.icon.png",
"pm185.icon.png",
"pm186.icon.png",
"pm187.icon.png",
"pm188.icon.png",
"pm189.icon.png",
"pm19.fALOLA.icon.png",
"pm19.icon.png",
"pm190.icon.png",
"pm191.icon.png",
"pm192.icon.png",
"pm193.icon.png",
"pm194.fPALDEA.icon.png",
"pm194.icon.png",
"pm195.icon.png",
"pm196.fGOFEST_2024_SSCARF.icon.png",
"pm196.icon.png",
"pm197.fGOFEST_2024_MSCARF.icon.png",
"pm197.icon.png",
"pm198.icon.png",
"pm199.f2022.icon.png",
"pm199.fGALARIAN.icon.png",
"pm199.icon.png",
"pm2.icon.png",
"pm20.fALOLA.icon.png",
"pm20.icon.png",
"pm200.icon.png",
"pm201.fUNOWN_A.icon.png",
"pm201.fUNOWN_B.icon.png",
"pm201.fUNOWN_C.icon.png",
"pm201.fUNOWN_D.icon.png",
"pm201.fUNOWN_E.icon.png",
"pm201.fUNOWN_EXCLAMATION_POINT.icon.png",
"pm201.fUNOWN_F.icon.png",
"pm201.fUNOWN_G.icon.png",
"pm201.fUNOWN_H.icon.png",
"pm201.fUNOWN_I.icon.png",
"pm201.fUNOWN_J.icon.png",
"pm201.fUNOWN_K.icon.png",
"pm201.fUNOWN_L.icon.png",
"pm201.fUNOWN_M.icon.png",
"pm201.fUNOWN_N.icon.png",
"pm201.fUNOWN_O.icon.png",
"pm201.fUNOWN_P.icon.png",
"pm201.fUNOWN_Q.icon.png",
"pm201.fUNOWN_QUESTION_MARK.icon.png",
"pm201.fUNOWN_R.icon.png",
"pm201.fUNOWN_S.icon.png",
"pm201.fUNOWN_T.icon.png",
"pm201.fUNOWN_U.icon.png",
"pm201.fUNOWN_V.icon.png",
"pm201.fUNOWN_W.icon.png",
"pm201.fUNOWN_X.icon.png",
"pm201.fUNOWN_Y.icon.png",
"pm201.fUNOWN_Z.icon.png",
"pm202.icon.png",
"pm203.icon.png",
"pm204.icon.png",
"pm205.icon.png",
"pm206.icon.png",
"pm207.icon.png",
"pm208.fMEGA.icon.png",
"pm208.icon.png",
"pm209.icon.png",
"pm21.icon.png",
"pm210.icon.png",
"pm211.fHISUIAN.icon.png",
"pm211.icon.png",
"pm212.fMEGA.icon.png",
"pm212.icon.png",
"pm213.icon.png",
"pm214.fMEGA.icon.png",
"pm214.icon.png",
"pm215.fHISUIAN.icon.png",
"pm215.icon.png",
"pm216.icon.png",
"pm217.icon.png",
"pm218.icon.png",
"pm219.icon.png",
"pm22.icon.png",
"pm220.icon.png",
"pm221.icon.png",
"pm222.fGALARIAN.icon.png",
"pm222.icon.png",
"pm223.icon.png",
"pm224.icon.png",
"pm225.fWINTER_2020.icon.png",
"pm225.icon.png",
"pm226.icon.png",
"pm227.icon.png",
"pm228.icon.png",
"pm229.fMEGA.icon.png",
"pm229.icon.png",
"pm23.icon.png",
"pm230.icon.png",
"pm231.icon.png",
"pm232.icon.png",
"pm233.icon.png",
"pm234.icon.png",
"pm235.icon.png",
"pm236.icon.png",
"pm237.icon.png",
"pm238.icon.png",
"pm239.icon.png",
"pm24.icon.png",
"pm240.icon.png",
"pm241.icon.png",
"pm242.icon.png",
"pm243.icon.png",
"pm244.icon.png",
"pm245.icon.png",
"pm246.icon.png",
"pm247.icon.png",
"pm248.fMEGA.icon.png",
"pm248.icon.png",
"pm249.fS.icon.png",
"pm249.icon.png",
"pm25.fADVENTURE_HAT_2020.icon.png",
"pm25.fCOPY_2019.icon.png",
"pm25.fCOSTUME_2020.icon.png",
"pm25.fDIWALI_2024.icon.png",
"pm25.fDOCTOR.icon.png",
"pm25.fFALL_2019.icon.png",
"pm25.fFLYING_01.icon.png",
"pm25.fFLYING_02.icon.png",
"pm25.fFLYING_03.icon.png",
"pm25.fFLYING_04.icon.png",
"pm25.fFLYING_5TH_ANNIV.icon.png",
"pm25.fFLYING_OKINAWA.icon.png",
"pm25.fGOFEST_2022.icon.png",
"pm25.fGOFEST_2024_MTIARA.icon.png",
"pm25.fGOFEST_2024_STIARA.icon.png",
"pm25.fGOFEST_2025_GOGGLES_BLUE.icon.png",
"pm25.fGOFEST_2025_GOGGLES_RED.icon.png",
"pm25.fGOFEST_2025_GOGGLES_YELLOW.icon.png",
"pm25.fGOFEST_2025_MONOCLE_BLUE.icon.png",
"pm25.fGOFEST_2025_MONOCLE_RED.icon.png",
"pm25.fGOFEST_2025_MONOCLE_YELLOW.icon.png",
"pm25.fGOTOUR_2024_A.icon.png",
"pm25.fGOTOUR_2024_A_02.icon.png",
"pm25.fGOTOUR_2024_B.icon.png",
"pm25.fGOTOUR_2024_B_02.icon.png",
"pm25.fGOTOUR_2025_A.icon.png",
"pm25.fGOTOUR_2025_A_02.icon.png",
"pm25.fGOTOUR_2025_B.icon.png",
"pm25.fGOTOUR_2025_B_02.icon.png",
"pm25.fHORIZONS.icon.png",
"pm25.fJEJU.icon.png",
"pm25.fKARIYUSHI.icon.png",
"pm25.fKURTA.icon.png",
"pm25.fPOP_STAR.icon.png",
"pm25.fROCK_STAR.icon.png",
"pm25.fSUMMER_2023_A.icon.png",
"pm25.fSUMMER_2023_B.icon.png",
"pm25.fSUMMER_2023_C.icon.png",
"pm25.fSUMMER_2023_D.icon.png",
"pm25.fSUMMER_2023_E.icon.png",
"pm25.fTSHIRT_01.icon.png",
"pm25.fTSHIRT_02.icon.png",
"pm25.fTSHIRT_03.icon.png",
"pm25.fVS_2019.icon.png",
"pm25.fWCS_2022.icon.png",
"pm25.fWCS_2023.icon.png",
"pm25.fWCS_2024.icon.png",
"pm25.fWCS_2025.icon.png",
"pm25.fWINTER_2020.icon.png",
"pm25.icon.png",
"pm250.fS.icon.png",
"pm250.icon.png",
"pm251.icon.png",
"pm252.icon.png",
"pm253.icon.png",
"pm254.fMEGA.icon.png",
"pm254.icon.png",
"pm255.icon.png",
"pm256.icon.png",
"pm257.fMEGA.icon.png",
"pm257.icon.png",
"pm258.icon.png",
"pm259.icon.png",
"pm26.fALOLA.icon.png",
"pm26.icon.png",
"pm260.fMEGA.icon.png",
"pm260.icon.png",
"pm261.icon.png",
"pm262.icon.png",
"pm263.fGALARIAN.icon.png",
"pm263.icon.png",
"pm264.fGALARIAN.icon.png",
"pm264.icon.png",
"pm265.icon.png",
"pm266.icon.png",
"pm267.icon.png",
"pm268.icon.png",
"pm269.icon.png",
"pm27.fALOLA.icon.png",
"pm27.icon.png",
"pm270.icon.png",
"pm271.icon.png",
"pm272.icon.png",
"pm273.icon.png",
"pm274.icon.png",
"pm275.icon.png",
"pm276.icon.png",
"pm277.icon.png",
"pm278.icon.png",
"pm279.icon.png",
"pm28.fALOLA.icon.png",
"pm28.icon.png",
"pm280.icon.png",
"pm281.icon.png",
"pm282.fMEGA.icon.png",
"pm282.icon.png",
"pm283.icon.png",
"pm284.icon.png",
"pm285.icon.png",
"pm286.icon.png",
"pm287.icon.png",
"pm288.icon.png",
"pm289.icon.png",
"pm29.icon.png",
"pm290.icon.png",
"pm291.icon.png",
"pm292.icon.png",
"pm293.icon.png",
"pm294.icon.png",
"pm295.icon.png",
"pm296.icon.png",
"pm297.icon.png",
"pm298.icon.png",
"pm299.icon.png",
"pm3.fCOPY_2019.icon.png",
"pm3.fGIGANTAMAX.icon.png",
"pm3.fMEGA.icon.png",
"pm3.icon.png",
"pm30.icon.png",
"pm300.icon.png",
"pm301.icon.png",
"pm302.fCOSTUME_2020.icon.png",
"pm302.fMEGA.icon.png",
"pm302.icon.png",
"pm303.fMEGA.icon.png",
"pm303.icon.png",
"pm304.icon.png",
"pm305.icon.png",
"pm306.fMEGA.icon.png",
"pm306.icon.png",
"pm307.icon.png",
"pm308.fMEGA.icon.png",
"pm308.icon.png",
"pm309.icon.png",
"pm31.icon.png",
"pm310.fMEGA.icon.png",
"pm310.icon.png",
"pm311.icon.png",
"pm312.icon.png",
"pm313.icon.png",
"pm314.icon.png",
"pm315.icon.png",
"pm316.icon.png",
"pm317.icon.png",
"pm318.icon.png",
"pm319.fMEGA.icon.png",
"pm319.icon.png",
"pm32.icon.png",
"pm320.icon.png",
"pm321.icon.png",
"pm322.icon.png",
"pm323.fMEGA.icon.png",
"pm323.icon.png",
"pm324.icon.png",
"pm325.icon.png",
"pm326.icon.png",
"pm327.f00.icon.png",
"pm327.f01.icon.png",
"pm327.f02.icon.png",
"pm327.f03.icon.png",
"pm327.f04.icon.png",
"pm327.f05.icon.png",
"pm327.f06.icon.png",
"pm327.f07.icon.png",
"pm327.f08.icon.png",
"pm328.icon.png",
"pm329.icon.png",
"pm33.icon.png",
"pm330.icon.png",
"pm331.icon.png",
"pm332.icon.png",
"pm333.icon.png",
"pm334.fMEGA.icon.png",
"pm334.icon.png",
"pm335.icon.png",
"pm336.icon.png",
"pm337.icon.png",
"pm338.icon.png",
"pm339.icon.png",
"pm34.icon.png",
"pm340.icon.png",
"pm341.icon.png",
"pm342.icon.png",
"pm343.icon.png",
"pm344.icon.png",
"pm345.icon.png",
"pm346.icon.png",
"pm347.icon.png",
"pm348.icon.png",
"pm349.icon.png",
"pm35.icon.png",
"pm350.icon.png",
"pm351.fRAINY.icon.png",
"pm351.fSNOWY.icon.png",
"pm351.fSUNNY.icon.png",
"pm351.icon.png",
"pm352.icon.png",
"pm353.icon.png",
"pm354.fMEGA.icon.png",
"pm354.icon.png",
"pm355.icon.png",
"pm356.icon.png",
"pm357.icon.png",
"pm358.icon.png",
"pm359.fMEGA.icon.png",
"pm359.icon.png",
"pm36.icon.png",
"pm360.icon.png",
"pm361.icon.png",
"pm362.fMEGA.icon.png",
"pm362.icon.png",
"pm363.icon.png",
"pm364.icon.png",
"pm365.icon.png",
"pm366.icon.png",
"pm367.icon.png",
"pm368.icon.png",
"pm369.icon.png",
"pm37.fALOLA.icon.png",
"pm37.icon.png",
"pm370.icon.png",
"pm371.icon.png",
"pm372.icon.png",
"pm373.fMEGA.icon.png",
"pm373.icon.png",
"pm374.icon.png",
"pm375.icon.png",
"pm376.fMEGA.icon.png",
"pm376.icon.png",
"pm377.icon.png",
"pm378.icon.png",
"pm379.icon.png",
"pm38.fALOLA.icon.png",
"pm38.icon.png",
"pm380.fMEGA.icon.png",
"pm380.fS.icon.png",
"pm380.icon.png",
"pm381.fMEGA.icon.png",
"pm381.fS.icon.png",
"pm381.icon.png",
"pm382.fPRIMAL.icon.png",
"pm382.icon.png",
"pm383.fPRIMAL.icon.png",
"pm383.icon.png",
"pm384.fMEGA.icon.png",
"pm384.icon.png",
"pm385.icon.png",
"pm386.fATTACK.icon.png",
"pm386.fDEFENSE.icon.png",
"pm386.fSPEED.icon.png",
"pm386.icon.png",
"pm387.icon.png",
"pm388.icon.png",
"pm389.icon.png",
"pm39.icon.png",
"pm390.icon.png",
"pm391.icon.png",
"pm392.icon.png",
"pm393.icon.png",
"pm394.icon.png",
"pm395.icon.png",
"pm396.icon.png",
"pm397.icon.png",
"pm398.icon.png",
"pm399.icon.png",
"pm4.fFALL_2019.icon.png",
"pm4.icon.png",
"pm40.icon.png",
"pm400.icon.png",
"pm401.icon.png",
"pm402.icon.png",
"pm403.icon.png",
"pm404.icon.png",
"pm405.icon.png",
"pm406.icon.png",
"pm407.icon.png",
"pm408.icon.png",
"pm409.icon.png",
"pm41.icon.png",
"pm410.icon.png",
"pm411.icon.png",
"pm412.fBURMY_PLANT.icon.png",
"pm412.fBURMY_SANDY.icon.png",
"pm412.fBURMY_TRASH.icon.png",
"pm413.fWORMADAM_PLANT.icon.png",
"pm413.fWORMADAM_SANDY.icon.png",
"pm413.fWORMADAM_TRASH.icon.png",
"pm414.icon.png",
"pm415.icon.png",
"pm416.icon.png",
"pm417.icon.png",
"pm418.icon.png",
"pm419.icon.png",
"pm42.icon.png",
"pm420.icon.png",
"pm421.fOVERCAST.icon.png",
"pm421.fSUNNY.icon.png",
"pm422.fEAST_SEA.icon.png",
"pm422.fWEST_SEA.icon.png",
"pm423.fEAST_SEA.icon.png",
"pm423.fWEST_SEA.icon.png",
"pm424.icon.png",
"pm425.icon.png",
"pm426.icon.png",
"pm427.icon.png",
"pm428.fMEGA.icon.png",
"pm428.icon.png",
"pm429.icon.png",
"pm43.icon.png",
"pm430.icon.png",
"pm431.icon.png",
"pm432.icon.png",
"pm433.icon.png",
"pm434.icon.png",
"pm435.icon.png",
"pm436.icon.png",
"pm437.icon.png",
"pm438.icon.png",
"pm439.icon.png",
"pm44.icon.png",
"pm440.icon.png",
"pm441.icon.png",
"pm442.icon.png",
"pm443.icon.png",
"pm444.icon.png",
"pm445.fMEGA.icon.png",
"pm445.icon.png",
"pm446.icon.png",
"pm447.icon.png",
"pm448.fMEGA.icon.png",
"pm448.icon.png",
"pm449.icon.png",
"pm45.icon.png",
"pm450.icon.png",
"pm451.icon.png",
"pm452.icon.png",
"pm453.icon.png",
"pm454.icon.png",
"pm455.icon.png",
"pm456.icon.png",
"pm457.icon.png",
"pm458.icon.png",
"pm459.icon.png",
"pm46.icon.png",
"pm460.fMEGA.icon.png",
"pm460.icon.png",
"pm461.icon.png",
"pm462.icon.png",
"pm463.icon.png",
"pm464.icon.png",
"pm465.icon.png",
"pm466.icon.png",
"pm467.icon.png",
"pm468.icon.png",
"pm469.icon.png",
"pm47.icon.png",
"pm470.icon.png",
"pm471.icon.png",
"pm472.icon.png",
"pm473.icon.png",
"pm474.icon.png",
"pm475.fMEGA.icon.png",
"pm475.icon.png",
"pm476.icon.png",
"pm477.icon.png",
"pm478.icon.png",
"pm479.fFAN.icon.png",
"pm479.fFROST.icon.png",
"pm479.fHEAT.icon.png",
"pm479.fMOW.icon.png",
"pm479.fWASH.icon.png",
"pm479.icon.png",
"pm48.icon.png",
"pm480.icon.png",
"pm481.icon.png",
"pm482.icon.png",
"pm483.fORIGIN.icon.png",
"pm483.icon.png",
"pm484.fORIGIN.icon.png",
"pm484.icon.png",
"pm485.icon.png",
"pm486.icon.png",
"pm487.fALTERED.icon.png",
"pm487.fORIGIN.icon.png",
"pm487.icon.png",
"pm488.icon.png",
"pm489.icon.png",
"pm49.icon.png",
"pm490.icon.png",
"pm491.icon.png",
"pm492.fLAND.icon.png",
"pm492.fSKY.icon.png",
"pm492.icon.png",
"pm493.fBUG.icon.png",
"pm493.fDARK.icon.png",
"pm493.fDRAGON.icon.png",
"pm493.fELECTRIC.icon.png",
"pm493.fFAIRY.icon.png",
"pm493.fFIGHTING.icon.png",
"pm493.fFIRE.icon.png",
"pm493.fFLYING.icon.png",
"pm493.fGHOST.icon.png",
"pm493.fGRASS.icon.png",
"pm493.fGROUND.icon.png",
"pm493.fICE.icon.png",
"pm493.fPOISON.icon.png",
"pm493.fPSYCHIC.icon.png",
"pm493.fROCK.icon.png",
"pm493.fSTEEL.icon.png",
"pm493.fWATER.icon.png",
"pm493.icon.png",
"pm494.icon.png",
"pm495.icon.png",
"pm496.icon.png",
"pm497.icon.png",
"pm498.icon.png",
"pm499.icon.png",
"pm5.icon.png",
"pm50.fALOLA.icon.png",
"pm50.icon.png",
"pm500.icon.png",
"pm501.icon.png",
"pm502.icon.png",
"pm503.fHISUIAN.icon.png",
"pm503.icon.png",
"pm504.icon.png",
"pm505.icon.png",
"pm506.icon.png",
"pm507.icon.png",
"pm508.icon.png",
"pm509.icon.png",
"pm51.fALOLA.icon.png",
"pm51.icon.png",
"pm510.icon.png",
"pm511.icon.png",
"pm512.icon.png",
"pm513.icon.png",
"pm514.icon.png",
"pm515.icon.png",
"pm516.icon.png",
"pm517.icon.png",
"pm518.icon.png",
"pm519.icon.png",
"pm52.fALOLA.icon.png",
"pm52.fGALARIAN.icon.png",
"pm52.icon.png",
"pm520.icon.png",
"pm521.icon.png",
"pm522.icon.png",
"pm523.icon.png",
"pm524.icon.png",
"pm525.icon.png",
"pm526.icon.png",
"pm527.icon.png",
"pm528.icon.png",
"pm529.icon.png",
"pm53.fALOLA.icon.png",
"pm53.icon.png",
"pm530.icon.png",
"pm531.fMEGA.icon.png",
"pm531.icon.png",
"pm532.icon.png",
"pm533.icon.png",
"pm534.icon.png",
"pm535.icon.png",
"pm536.icon.png",
"pm537.icon.png",
"pm538.icon.png",
"pm539.icon.png",
"pm54.fSWIM_2025.icon.png",
"pm54.icon.png",
"pm540.icon.png",
"pm541.icon.png",
"pm542.icon.png",
"pm543.icon.png",
"pm544.icon.png",
"pm545.icon.png",
"pm546.icon.png",
"pm547.icon.png",
"pm548.icon.png",
"pm549.fHISUIAN.icon.png",
"pm549.icon.png",
"pm55.icon.png",
"pm550.fBLUE_STRIPED.icon.png",
"pm550.fRED_STRIPED.icon.png",
"pm550.fWHITE_STRIPED.icon.png",
"pm551.icon.png",
"pm552.icon.png",
"pm553.icon.png",
"pm554.fGALARIAN.icon.png",
"pm554.icon.png",
"pm555.fGALARIAN_STANDARD.icon.png",
"pm555.fGALARIAN_ZEN.icon.png",
"pm555.fSTANDARD.icon.png",
"pm555.fZEN.icon.png",
"pm556.icon.png",
"pm557.icon.png",
"pm558.icon.png",
"pm559.icon.png",
"pm56.icon.png",
"pm560.icon.png",
"pm561.icon.png",
"pm562.fGALARIAN.icon.png",
"pm562.icon.png",
"pm563.icon.png",
"pm564.icon.png",
"pm565.icon.png",
"pm566.icon.png",
"pm567.icon.png",
"pm568.icon.png",
"pm569.icon.png",
"pm57.icon.png",
"pm570.fHISUIAN.icon.png",
"pm570.icon.png",
"pm571.fHISUIAN.icon.png",
"pm571.icon.png",
"pm572.icon.png",
"pm573.icon.png",
"pm574.icon.png",
"pm575.icon.png",
"pm576.icon.png",
"pm577.icon.png",
"pm578.icon.png",
"pm579.icon.png",
"pm58.fHISUIAN.icon.png",
"pm58.icon.png",
"pm580.icon.png",
"pm581.icon.png",
"pm582.icon.png",
"pm583.icon.png",
"pm584.icon.png",
"pm585.fAUTUMN.icon.png",
"pm585.fSPRING.icon.png",
"pm585.fSUMMER.icon.png",
"pm585.fWINTER.icon.png",
"pm586.fAUTUMN.icon.png",
"pm586.fSPRING.icon.png",
"pm586.fSUMMER.icon.png",
"pm586.fWINTER.icon.png",
"pm587.icon.png",
"pm588.icon.png",
"pm589.icon.png",
"pm59.fHISUIAN.icon.png",
"pm59.icon.png",
"pm590.icon.png",
"pm591.icon.png",
"pm592.fFEMALE.icon.png",
"pm592.icon.png",
"pm593.fFEMALE.icon.png",
"pm593.icon.png",
"pm594.icon.png",
"pm595.icon.png",
"pm596.icon.png",
"pm597.icon.png",
"pm598.icon.png",
"pm599.icon.png",
"pm6.fCOPY_2019.icon.png",
"pm6.fGIGANTAMAX.icon.png",
"pm6.fMEGA_X.icon.png",
"pm6.fMEGA_Y.icon.png",
"pm6.icon.png",
"pm60.icon.png",
"pm600.icon.png",
"pm601.icon.png",
"pm602.icon.png",
"pm603.icon.png",
"pm604.icon.png",
"pm605.icon.png",
"pm606.icon.png",
"pm607.icon.png",
"pm608.icon.png",
"pm609.icon.png",
"pm61.icon.png",
"pm610.icon.png",
"pm611.icon.png",
"pm612.icon.png",
"pm613.fWINTER_2020.icon.png",
"pm613.icon.png",
"pm614.fWINTER_2020.icon.png",
"pm614.icon.png",
"pm615.icon.png",
"pm616.icon.png",
"pm617.icon.png",
"pm618.fGALARIAN.icon.png",
"pm618.icon.png",
"pm619.icon.png",
"pm62.icon.png",
"pm620.icon.png",
"pm621.icon.png",
"pm622.icon.png",
"pm623.icon.png",
"pm624.icon.png",
"pm625.icon.png",
"pm626.icon.png",
"pm627.icon.png",
"pm628.fHISUIAN.icon.png",
"pm628.icon.png",
"pm629.icon.png",
"pm63.icon.png",
"pm630.icon.png",
"pm631.icon.png",
"pm632.icon.png",
"pm633.icon.png",
"pm634.icon.png",
"pm635.icon.png",
"pm636.icon.png",
"pm637.icon.png",
"pm638.icon.png",
"pm639.icon.png",
"pm64.icon.png",
"pm640.icon.png",
"pm641.fINCARNATE.icon.png",
"pm641.fTHERIAN.icon.png",
"pm642.fINCARNATE.icon.png",
"pm642.fTHERIAN.icon.png",
"pm643.icon.png",
"pm644.icon.png",
"pm645.fINCARNATE.icon.png",
"pm645.fTHERIAN.icon.png",
"pm646.fBLACK.icon.png",
"pm646.fNORMAL.icon.png",
"pm646.fWHITE.icon.png",
"pm647.fORDINARY.icon.png",
"pm647.fRESOLUTE.icon.png",
"pm648.fARIA.icon.png",
"pm648.fPIROUETTE.icon.png",
"pm648.icon.png",
"pm649.fBURN.icon.png",
"pm649.fCHILL.icon.png",
"pm649.fDOUSE.icon.png",
"pm649.fNORMAL.icon.png",
"pm649.fSHOCK.icon.png",
"pm65.fMEGA.icon.png",
"pm65.icon.png",
"pm650.icon.png",
"pm651.icon.png",
"pm652.icon.png",
"pm653.icon.png",
"pm654.icon.png",
"pm655.icon.png",
"pm656.icon.png",
"pm657.icon.png",
"pm658.icon.png",
"pm659.icon.png",
"pm66.icon.png",
"pm660.icon.png",
"pm661.icon.png",
"pm662.icon.png",
"pm663.icon.png",
"pm664.icon.png",
"pm665.icon.png",
"pm666.fARCHIPELAGO.icon.png",
"pm666.fCONTINENTAL.icon.png",
"pm666.fELEGANT.icon.png",
"pm666.fFANCY.icon.png",
"pm666.fGARDEN.icon.png",
"pm666.fHIGH_PLAINS.icon.png",
"pm666.fICY_SNOW.icon.png",
"pm666.fJUNGLE.icon.png",
"pm666.fMARINE.icon.png",
"pm666.fMEADOW.icon.png",
"pm666.fMODERN.icon.png",
"pm666.fMONSOON.icon.png",
"pm666.fOCEAN.icon.png",
"pm666.fPOKEBALL.icon.png",
"pm666.fPOLAR.icon.png",
"pm666.fRIVER.icon.png",
"pm666.fSANDSTORM.icon.png",
"pm666.fSAVANNA.icon.png",
"pm666.fSUN.icon.png",
"pm666.fTUNDRA.icon.png",
"pm667.icon.png",
"pm668.fFEMALE.icon.png",
"pm668.icon.png",
"pm669.fBLUE.icon.png",
"pm669.fORANGE.icon.png",
"pm669.fRED.icon.png",
"pm669.fWHITE.icon.png",
"pm669.fYELLOW.icon.png",
"pm67.icon.png",
"pm670.fBLUE.icon.png",
"pm670.fORANGE.icon.png",
"pm670.fRED.icon.png",
"pm670.fWHITE.icon.png",
"pm670.fYELLOW.icon.png",
"pm671.fBLUE.icon.png",
"pm671.fORANGE.icon.png",
"pm671.fRED.icon.png",
"pm671.fWHITE.icon.png",
"pm671.fYELLOW.icon.png",
"pm672.icon.png",
"pm673.icon.png",
"pm674.icon.png",
"pm675.icon.png",
"pm676.fDANDY.icon.png",
"pm676.fDEBUTANTE.icon.png",
"pm676.fDIAMOND.icon.png",
"pm676.fHEART.icon.png",
"pm676.fKABUKI.icon.png",
"pm676.fLA_REINE.icon.png",
"pm676.fMATRON.icon.png",
"pm676.fNATURAL.icon.png",
"pm676.fPHARAOH.icon.png",
"pm676.fSTAR.icon.png",
"pm677.icon.png",
"pm678.fFEMALE.icon.png",
"pm678.icon.png",
"pm679.icon.png",
"pm68.fGIGANTAMAX.icon.png",
"pm68.icon.png",
"pm680.icon.png",
"pm681.fBLADE.icon.png",
"pm681.fSHIELD.icon.png",
"pm682.icon.png",
"pm683.icon.png",
"pm684.icon.png",
"pm685.icon.png",
"pm686.icon.png",
"pm687.icon.png",
"pm688.icon.png",
"pm689.icon.png",
"pm69.icon.png",
"pm690.icon.png",
"pm691.icon.png",
"pm692.icon.png",
"pm693.icon.png",
"pm694.icon.png",
"pm695.icon.png",
"pm696.icon.png",
"pm697.icon.png",
"pm698.icon.png",
"pm699.icon.png",
"pm7.fFALL_2019.icon.png",
"pm7.icon.png",
"pm70.icon.png",
"pm700.icon.png",
"pm701.icon.png",
"pm702.icon.png",
"pm703.icon.png",
"pm704.icon.png",
"pm705.fHISUIAN.icon.png",
"pm705.icon.png",
"pm706.fHISUIAN.icon.png",
"pm706.icon.png",
"pm707.icon.png",
"pm708.icon.png",
"pm709.icon.png",
"pm71.icon.png",
"pm710.fAVERAGE.icon.png",
"pm710.fLARGE.icon.png",
"pm710.fSMALL.icon.png",
"pm710.fSUPER.icon.png",
"pm710.icon.png",
"pm711.fAVERAGE.icon.png",
"pm711.fLARGE.icon.png",
"pm711.fSMALL.icon.png",
"pm711.fSUPER.icon.png",
"pm711.icon.png",
"pm712.icon.png",
"pm713.fHISUIAN.icon.png",
"pm713.icon.png",
"pm714.icon.png",
"pm715.icon.png",
"pm716.fNEUTRAL.icon.png",
"pm716.icon.png",
"pm717.icon.png",
"pm718.fCOMPLETE.icon.png",
"pm718.fCOMPLETE_FIFTY_PERCENT.icon.png",
"pm718.fCOMPLETE_TEN_PERCENT.icon.png",
"pm718.fFIFTY_PERCENT.icon.png",
"pm718.fTEN_PERCENT.icon.png",
"pm719.fMEGA.icon.png",
"pm719.icon.png",
"pm72.icon.png",
"pm720.fCONFINED.icon.png",
"pm720.fUNBOUND.icon.png",
"pm720.icon.png",
"pm721.icon.png",
"pm722.icon.png",
"pm723.icon.png",
"pm724.fHISUIAN.icon.png",
"pm724.icon.png",
"pm725.icon.png",
"pm726.icon.png",
"pm727.icon.png",
"pm728.icon.png",
"pm729.icon.png",
"pm73.icon.png",
"pm730.icon.png",
"pm731.icon.png",
"pm732.icon.png",
"pm733.icon.png",
"pm734.icon.png",
"pm735.icon.png",
"pm736.icon.png",
"pm737.icon.png",
"pm738.icon.png",
"pm739.icon.png",
"pm74.fALOLA.icon.png",
"pm74.icon.png",
"pm740.icon.png",
"pm741.fBAILE.icon.png",
"pm741.fPAU.icon.png",
"pm741.fPOMPOM.icon.png",
"pm741.fSENSU.icon.png",
"pm742.icon.png",
"pm743.icon.png",
"pm744.fDUSK.icon.png",
"pm744.icon.png",
"pm745.fDUSK.icon.png",
"pm745.fMIDDAY.icon.png",
"pm745.fMIDNIGHT.icon.png",
"pm747.icon.png",
"pm748.icon.png",
"pm749.icon.png",
"pm75.fALOLA.icon.png",
"pm75.icon.png",
"pm750.icon.png",
"pm751.icon.png",
"pm752.icon.png",
"pm753.icon.png",
"pm754.icon.png",
"pm755.icon.png",
"pm756.icon.png",
"pm757.icon.png",
"pm758.icon.png",
"pm759.icon.png",
"pm76.fALOLA.icon.png",
"pm76.icon.png",
"pm760.icon.png",
"pm761.icon.png",
"pm762.icon.png",
"pm763.icon.png",
"pm764.icon.png",
"pm765.icon.png",
"pm766.icon.png",
"pm767.icon.png",
"pm768.icon.png",
"pm769.icon.png",
"pm77.fGALARIAN.icon.png",
"pm77.icon.png",
"pm770.icon.png",
"pm775.icon.png",
"pm776.icon.png",
"pm777.icon.png",
"pm779.icon.png",
"pm78.fGALARIAN.icon.png",
"pm78.icon.png",
"pm780.icon.png",
"pm781.icon.png",
"pm782.icon.png",
"pm783.icon.png",
"pm784.icon.png",
"pm785.icon.png",
"pm786.icon.png",
"pm787.icon.png",
"pm788.icon.png",
"pm789.icon.png",
"pm79.f2020.icon.png",
"pm79.fGALARIAN.icon.png",
"pm79.icon.png",
"pm790.icon.png",
"pm791.icon.png",
"pm792.icon.png",
"pm793.icon.png",
"pm794.icon.png",
"pm795.icon.png",
"pm796.icon.png",
"pm797.icon.png",
"pm798.icon.png",
"pm799.icon.png",
"pm8.icon.png",
"pm80.f2021.icon.png",
"pm80.fGALARIAN.icon.png",
"pm80.fMEGA.icon.png",
"pm80.icon.png",
"pm800.fDAWN_WINGS.icon.png",
"pm800.fDUSK_MANE.icon.png",
"pm800.icon.png",
"pm802.icon.png",
"pm803.icon.png",
"pm804.icon.png",
"pm805.icon.png",
"pm806.icon.png",
"pm808.icon.png",
"pm809.icon.png",
"pm81.icon.png",
"pm810.icon.png",
"pm811.icon.png",
"pm812.fGIGANTAMAX.icon.png",
"pm812.icon.png",
"pm813.icon.png",
"pm814.icon.png",
"pm815.fGIGANTAMAX.icon.png",
"pm815.icon.png",
"pm816.icon.png",
"pm817.icon.png",
"pm818.fGIGANTAMAX.icon.png",
"pm818.icon.png",
"pm819.icon.png",
"pm82.icon.png",
"pm820.icon.png",
"pm821.icon.png",
"pm822.icon.png",
"pm823.icon.png",
"pm827.icon.png",
"pm828.icon.png",
"pm829.icon.png",
"pm83.fGALARIAN.icon.png",
"pm83.icon.png",
"pm830.icon.png",
"pm831.icon.png",
"pm832.icon.png",
"pm835.icon.png",
"pm836.icon.png",
"pm84.icon.png",
"pm840.icon.png",
"pm841.icon.png",
"pm842.icon.png",
"pm848.icon.png",
"pm849.fAMPED.icon.png",
"pm849.fGIGANTAMAX.icon.png",
"pm849.fLOW_KEY.icon.png",
"pm85.icon.png",
"pm850.icon.png",
"pm851.icon.png",
"pm854.fANTIQUE.icon.png",
"pm854.fPHONY.icon.png",
"pm854.icon.png",
"pm855.fANTIQUE.icon.png",
"pm855.fPHONY.icon.png",
"pm855.icon.png",
"pm856.icon.png",
"pm857.icon.png",
"pm858.icon.png",
"pm859.icon.png",
"pm86.icon.png",
"pm860.icon.png",
"pm861.icon.png",
"pm862.icon.png",
"pm863.icon.png",
"pm864.icon.png",
"pm865.icon.png",
"pm866.icon.png",
"pm867.icon.png",
"pm87.icon.png",
"pm870.fGOFEST_2025_TRAIN_CONDUCTOR.icon.png",
"pm870.icon.png",
"pm872.icon.png",
"pm873.icon.png",
"pm874.icon.png",
"pm876.fFEMALE.icon.png",
"pm876.fMALE.icon.png",
"pm877.fFULL_BELLY.icon.png",
"pm877.fHANGRY.icon.png",
"pm877.icon.png",
"pm88.fALOLA.icon.png",
"pm88.icon.png",
"pm884.icon.png",
"pm885.icon.png",
"pm886.icon.png",
"pm887.icon.png",
"pm888.fCROWNED_SWORD.icon.png",
"pm888.fHERO.icon.png",
"pm888.icon.png",
"pm889.fCROWNED_SHIELD.icon.png",
"pm889.fHERO.icon.png",
"pm889.icon.png",
"pm89.fALOLA.icon.png",
"pm89.icon.png",
"pm890.fETERNAMAX.icon.png",
"pm890.icon.png",
"pm891.icon.png",
"pm892.fRAPID_STRIKE.icon.png",
"pm892.fSINGLE_STRIKE.icon.png",
"pm893.icon.png",
"pm894.icon.png",
"pm895.icon.png",
"pm899.icon.png",
"pm9.fCOPY_2019.icon.png",
"pm9.fGIGANTAMAX.icon.png",
"pm9.fMEGA.icon.png",
"pm9.icon.png",
"pm90.icon.png",
"pm900.icon.png",
"pm901.icon.png",
"pm903.icon.png",
"pm904.icon.png",
"pm905.fINCARNATE.icon.png",
"pm905.fTHERIAN.icon.png",
"pm906.icon.png",
"pm907.icon.png",
"pm908.icon.png",
"pm909.icon.png",
"pm91.icon.png",
"pm910.icon.png",
"pm911.icon.png",
"pm912.icon.png",
"pm913.icon.png",
"pm914.icon.png",
"pm915.icon.png",
"pm916.fFEMALE.icon.png",
"pm916.icon.png",
"pm919.icon.png",
"pm92.icon.png",
"pm920.icon.png",
"pm921.icon.png",
"pm922.icon.png",
"pm923.icon.png",
"pm924.icon.png",
"pm925.fFAMILY_OF_FOUR.icon.png",
"pm925.fFAMILY_OF_THREE.icon.png",
"pm926.icon.png",
"pm927.icon.png",
"pm928.icon.png",
"pm929.icon.png",
"pm93.icon.png",
"pm930.icon.png",
"pm935.icon.png",
"pm936.icon.png",
"pm937.icon.png",
"pm938.icon.png",
"pm939.icon.png",
"pm94.fCOSTUME_2020.icon.png",
"pm94.fGIGANTAMAX.icon.png",
"pm94.fMEGA.icon.png",
"pm94.icon.png",
"pm944.icon.png",
"pm945.icon.png",
"pm948.icon.png",
"pm949.icon.png",
"pm95.icon.png",
"pm957.icon.png",
"pm958.icon.png",
"pm959.icon.png",
"pm96.icon.png",
"pm960.icon.png",
"pm961.icon.png",
"pm962.icon.png",
"pm965.icon.png",
"pm966.icon.png",
"pm97.icon.png",
"pm971.icon.png",
"pm972.icon.png",
"pm974.icon.png",
"pm975.icon.png",
"pm977.icon.png",
"pm978.fCURLY.icon.png",
"pm978.fDROOPY.icon.png",
"pm978.fSTRETCHY.icon.png",
"pm979.icon.png",
"pm98.icon.png",
"pm980.icon.png",
"pm982.fTHREE.icon.png",
"pm982.fTWO.icon.png",
"pm983.icon.png",
"pm99.fGIGANTAMAX.icon.png",
"pm99.icon.png",
"pm996.icon.png",
"pm997.icon.png",
"pm998.icon.png",
"pm999.fCOIN_A1.icon.png",
"pm999.icon.png"
]
```

Apply to `test/fixtures/settings.json`:

```diff
--- a/test/fixtures/settings.json
+++ b/test/fixtures/settings.json
@@ -86,6 +86,7 @@
   "gameData": {
     "gameMasterUrl": "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json",
     "textUrl": "https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/English.txt",
+    "iconsUrl": "https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master:Images/Pokemon/Addressable%20Assets",
     "refreshHours": 24
   },
   "raidBosses": {
```

Apply to `test/support/game-data.ts`:

```diff
--- a/test/support/game-data.ts
+++ b/test/support/game-data.ts
@@ -2,6 +2,7 @@ import { readFileSync } from 'node:fs';
 import path from 'node:path';
 import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
 import type { GameData } from '../../src/domain/pogo/game-master.js';
+import { PokemonIcons } from '../../src/domain/pogo/pokemon-icons.js';
 
 const fixtures = path.resolve(import.meta.dirname, '../fixtures');
 
@@ -36,3 +37,16 @@ export function gameDataFixture(): GameData {
 export function catalogueFixture(): PokemonCatalogue {
   return new PokemonCatalogue(gameDataFixture());
 }
+
+let icons: PokemonIcons | undefined;
+
+/**
+ * The game's icon files that exist, as the listing of 2026-10-12 named them (the fixture
+ * pokemon-icons.json; see scripts/game-data/make-fixtures.ts). Shared between tests.
+ */
+export function iconsFixture(): PokemonIcons {
+  icons ??= new PokemonIcons(
+    JSON.parse(readFileSync(path.join(fixtures, 'pokemon-icons.json'), 'utf8')) as string[],
+  );
+  return icons;
+}
```

Run: `npx vitest run --project unit src/config/settings.test.ts src/domain/pogo/pokemon-icons.test.ts src/render/raid-post.test.ts src/services/game-data-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `data/settings.json`:

```diff
--- a/data/settings.json
+++ b/data/settings.json
@@ -86,6 +86,7 @@
   "gameData": {
     "gameMasterUrl": "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json",
     "textUrl": "https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/English.txt",
+    "iconsUrl": "https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master:Images/Pokemon/Addressable%20Assets",
     "refreshHours": 24
   },
   "raidBosses": {
```

Apply to `scripts/game-data/make-fixtures.ts`:

```diff
--- a/scripts/game-data/make-fixtures.ts
+++ b/scripts/game-data/make-fixtures.ts
@@ -3,10 +3,12 @@
  * - test/fixtures/game-master-sample.json: the raw items for a few species, for parser tests
  * - test/fixtures/english-sample.txt: the text entries those items need
  * - test/fixtures/game-data.json: the whole game master parsed, for catalogue and parity tests
+ * - test/fixtures/pokemon-icons.json: the names of the game's icon files that exist, from the
+ *   listing of PokeMiners' picture files (see src/domain/pogo/pokemon-icons.ts)
  *
- * Run it with `npm run fixtures:game-data`. It reuses the files var/game-data-source/gamemaster.json
- * and English.txt; `npm run fixtures:game-data -- --download` fetches fresh ones first, overwriting
- * them (and is the only way they are fetched).
+ * Run it with `npm run fixtures:game-data`. It reuses the files var/game-data-source/gamemaster.json,
+ * English.txt and pokemon-icons-tree.json; `npm run fixtures:game-data -- --download` fetches fresh
+ * ones first, overwriting them (and is the only way they are fetched).
  *
  * After refreshing to a newer game master: tests that assert exact stats, move lists or names of
  * real Pokémon (in game-master.test.ts, catalogue.test.ts, cp.test.ts) and the lists in
@@ -18,6 +20,7 @@ import { existsSync } from 'node:fs';
 import { mkdir, readFile, writeFile } from 'node:fs/promises';
 import path from 'node:path';
 import { parseGameMaster } from '../../src/domain/pogo/game-master.js';
+import { iconNamesOf } from '../../src/domain/pogo/pokemon-icons.js';
 import { parseTextFile } from '../../src/domain/pogo/text.js';
 
 const GAME_MASTER_URL =
@@ -49,6 +52,10 @@ const SAMPLE_SPECIES = [
   'GENGAR', // a temporary-evolution element with no id
 ];
 
+/** GitHub's listing of the folder with the game's pictures of Pokémon (about 1 MB). */
+const ICONS_URL =
+  'https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master:Images/Pokemon/Addressable%20Assets';
+
 const repoRoot = path.resolve(import.meta.dirname, '../..');
 const sourceDir = path.join(repoRoot, 'var/game-data-source');
 const fixtureDir = path.join(repoRoot, 'test/fixtures');
@@ -141,7 +148,13 @@ await writeFile(snapshotPath, `{\n${lines.join(',\n')}\n}\n`);
 if (JSON.stringify(JSON.parse(await readFile(snapshotPath, 'utf8'))) !== JSON.stringify(parsed)) {
   throw new Error('game-data.json does not parse back to the parsed game master');
 }
+// One name per line, sorted, so a refresh gives a reviewable diff.
+const icons = iconNamesOf(JSON.parse(await source('pokemon-icons-tree.json', ICONS_URL)));
+await writeFile(
+  path.join(fixtureDir, 'pokemon-icons.json'),
+  `[\n${icons.map((name) => JSON.stringify(name)).join(',\n')}\n]\n`,
+);
 for (const message of warnings) process.stdout.write(`Warning: ${message}\n`);
 process.stdout.write(
-  `Wrote ${sample.length} sample items, ${sampleText.split('RESOURCE ID').length - 1} texts and the parsed snapshot to ${fixtureDir}\n`,
+  `Wrote ${sample.length} sample items, ${sampleText.split('RESOURCE ID').length - 1} texts, the parsed snapshot and ${icons.length} icon names to ${fixtureDir}\n`,
 );
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -81,6 +81,7 @@ export async function startApp(
   const gameData = new GameDataService({
     gameMasterUrl: config.settings.gameData.gameMasterUrl,
     textUrl: config.settings.gameData.textUrl,
+    iconsUrl: config.settings.gameData.iconsUrl,
     cachePath: GAME_DATA_CACHE,
     maxAgeMs: config.settings.gameData.refreshHours * HOUR_MS,
     fetch: (url, init) => fetch(url, init),
```

Apply to `src/config/settings.ts`:

```diff
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -76,6 +76,13 @@ export const settingsSchema = z.strictObject({
   gameData: z.strictObject({
     gameMasterUrl: z.url({ protocol: /^https?$/ }),
     textUrl: z.url({ protocol: /^https?$/ }),
+    /**
+     * Address of the listing of the game's picture files (GitHub's tree of PokeMiners'
+     * `pogo_assets`, folder `Images/Pokemon/Addressable Assets`): which icons of Pokémon exist.
+     * Downloaded with the game data; an unauthenticated address of GitHub's API answers 60
+     * times an hour.
+     */
+    iconsUrl: z.url({ protocol: /^https?$/ }),
     refreshHours: z.number().int().min(1).max(168),
   }),
   raidBosses: z
```

Create `src/domain/pogo/pokemon-icons.ts`:

```ts
import type { PokemonCatalogue } from './catalogue.js';
import { bossIdsOf } from './feed-lookup.js';
import type { PokemonEntry } from './game-master.js';
import { formTokens } from './raid-boss-feed.js';

/**
 * Where the game's icons of Pokémon are served from: Leek Duck's CDN, under the game's own file
 * names. The pictures of the raid boss feed are addresses of the same kind, so what
 * `pictureIds` (raid-boss-feed.ts) reads from a feed picture is what `iconCandidates` writes.
 */
export const POKEMON_ICON_BASE = 'https://cdn.leekduck.com/assets/img/pokemon_icons/';

/**
 * An icon file as this module uses it: `pm<dex>.icon.png` or `pm<dex>.f<FORM>.icon.png`. The
 * files with more parts (`.c<COSTUME>`, `.s` for shiny, `.g<n>` for a gender) show something a
 * catalogue entry does not say, and are left out.
 */
const ICON_NAME = /^pm(\d{1,5})(?:\.f([A-Z0-9_]+))?\.icon\.png$/;

/** As many names as a listing may give; the game had some 3,500 files in 2026. */
const MAX_ICONS = 50_000;

/**
 * The icon names in a listing of the game's picture files: GitHub's answer for the tree of
 * PokeMiners' `pogo_assets`, `Images/Pokemon/Addressable Assets` (`{ tree: [{ path }] }`).
 * Only the names this module can use are kept, each once, sorted. Throws when the document is
 * no such listing or names no icon, so that a broken download never replaces a good list.
 */
export function iconNamesOf(listing: unknown): string[] {
  const tree =
    typeof listing === 'object' && listing !== null
      ? (listing as { tree?: unknown }).tree
      : undefined;
  if (!Array.isArray(tree)) throw new Error('The icon listing is not a tree of files');
  const names = new Set<string>();
  for (const file of tree as unknown[]) {
    const name =
      typeof file === 'object' && file !== null ? (file as { path?: unknown }).path : undefined;
    if (typeof name === 'string' && ICON_NAME.test(name)) names.add(name);
    if (names.size >= MAX_ICONS) break;
  }
  if (names.size === 0) throw new Error('The icon listing names no icon of a Pokémon');
  return [...names].sort();
}

/** Whether GitHub cut the listing short (`truncated`): icons may be missing from it then. */
export function isTruncatedListing(listing: unknown): boolean {
  return (
    typeof listing === 'object' &&
    listing !== null &&
    (listing as { truncated?: unknown }).truncated === true
  );
}

/** The icon files that exist, by name. */
export class PokemonIcons {
  private readonly all: Set<string>;

  /** `names` are icon names as `iconNamesOf` gives them; anything else is ignored. */
  constructor(names: Iterable<string>) {
    this.all = new Set([...names].filter((name) => ICON_NAME.test(name)).sort());
  }

  get size(): number {
    return this.all.size;
  }

  has(name: string): boolean {
    return this.all.has(name);
  }

  /** Every name, sorted: what is saved between runs. */
  names(): string[] {
    return [...this.all];
  }

  /** A list with the names of both: what is kept when a newer listing was cut short. */
  with(other: PokemonIcons): PokemonIcons {
    return new PokemonIcons([...this.all, ...other.all]);
  }
}

/**
 * What the picture of a Pokémon is looked up in: the icon files that exist (none while no list
 * could be downloaded) and the catalogue, for the other entries of a species. The game data
 * (`GameDataProvider`) is one.
 */
export interface PictureSource {
  catalogue: Pick<PokemonCatalogue, 'byDex'>;
  icons?: PokemonIcons | undefined;
}

/**
 * The file names under which the icon of a catalogue entry may exist, the likeliest first: the
 * inverse of how a feed picture is read (`pictureIds`). The form part of a file is the form id
 * without its species (`pm19.fALOLA`, `pm487.fORIGIN`, `pm6.fMEGA_X` for the ids
 * `RATTATA_ALOLA`, `GIRATINA_ORIGIN`, `CHARIZARD_MEGA_X`), for some species the whole form id
 * (`pm201.fUNOWN_F`). An entry without a form, or with the form `NORMAL`, has the file without
 * a form part (`pm147.icon.png`), and where the species has other forms sometimes one named
 * `NORMAL` (`pm646.fNORMAL` is Kyurem), which the feed's reader takes for no form as well.
 * Which of them exists cannot be told from the game master: `iconName` asks the list of files.
 */
export function iconCandidates(entry: PokemonEntry): string[] {
  const { pokemonId, form } = bossIdsOf(entry);
  const named = (part: string): string => `pm${String(entry.dex)}.f${part}.icon.png`;
  const plain = [`pm${String(entry.dex)}.icon.png`, named('NORMAL')];
  if (form === null) return plain;
  const suffix = formTokens(pokemonId, form).join('_');
  if (suffix === 'NORMAL' || suffix === '') return plain;
  return suffix === form ? [named(form)] : [named(suffix), named(form)];
}

/**
 * The form that shows a whole species whose files exist per form only, by Pokédex number, where
 * the first form of the catalogue (they are in the order of their keys) is not the ordinary
 * one: the catalogue key of the form to try first.
 */
const PREFERRED_FORM: Readonly<Record<number, string>> = {
  // Before `furfrou_dandy`: the untrimmed one.
  676: 'furfrou_natural',
  // Before `zygarde_complete`: the 50% form is the one that is met.
  718: 'zygarde_fifty_percent',
  // Before `dudunsparce_three`.
  982: 'dudunsparce_two',
  // Before `poltchageist_artisan` and `sinistcha_masterpiece`: the common ones.
  1012: 'poltchageist_counterfeit',
  1013: 'sinistcha_unremarkable',
};

/** A file that shows a mega, a primal or a Gigantamax Pokémon: never the picture of a species. */
const TRANSFORMED = /\.f(?:[A-Z0-9_]+_)?(?:MEGA(?:_[A-Z])?|PRIMAL|GIGANTAMAX)\.icon\.png$/;

/** The file of the entry itself: the first of its candidates that exists. */
function ownIcon(entry: PokemonEntry, icons: PokemonIcons): string | undefined {
  return iconCandidates(entry).find((name) => icons.has(name));
}

/**
 * The icon file of a catalogue entry: the first of its candidates that exists, or else
 *
 * - for a form (or a regional form) without a file of its own, the plain file of its species
 *   when that exists: such forms only change the look (Scatterbug's patterns), and every
 *   spawn report should have its picture (Matt, 2026-10-13). Never for a mega;
 * - for an entry that stands for a whole species whose files exist per form only (Unown has no
 *   `pm201.icon.png`), the file of one of its forms: the preferred one (`PREFERRED_FORM`),
 *   else the first in catalogue order that has a file (`pm201.fUNOWN_A.icon.png`). Only the
 *   catalogue's entries of kind `form` are asked, so never a mega, a primal or a Gigantamax.
 *
 * Undefined when no file fits: a species or a mega that is not released yet, a form of a
 * species that has no plain file.
 */
export function iconName(
  entry: PokemonEntry,
  icons: PokemonIcons,
  catalogue: Pick<PokemonCatalogue, 'byDex'>,
): string | undefined {
  const found = ownIcon(entry, icons);
  if (found !== undefined) return found;
  if (entry.kind === 'mega' || entry.tempEvolution !== null) return undefined;
  if (bossIdsOf(entry).form !== null) {
    return ownIcon({ ...entry, form: null }, icons);
  }
  if (entry.kind !== 'species') return undefined;
  const forms = catalogue.byDex(entry.dex).filter((one) => one.kind === 'form');
  const preferred = PREFERRED_FORM[entry.dex];
  const first = forms.find((one) => one.key === preferred);
  for (const form of first ? [first, ...forms] : forms) {
    const file = ownIcon(form, icons);
    if (file !== undefined && !TRANSFORMED.test(file)) return file;
  }
  return undefined;
}

/**
 * The address of the icon of a catalogue entry; undefined when the list of files has none for
 * it, or there is no list (it could not be downloaded yet). Nothing is asked of the network: a
 * file the list names is taken to be served.
 */
export function iconAddress(
  entry: PokemonEntry,
  source: PictureSource | undefined,
): string | undefined {
  const name = source?.icons && iconName(entry, source.icons, source.catalogue);
  return name === undefined ? undefined : `${POKEMON_ICON_BASE}${name}`;
}

/**
 * The picture of a Pokémon wherever one is shown (the post of a raid or train, a spawn
 * report): the one place that decides. The raid boss feed's picture wins when there is one: it
 * shows the costume the boss wears just now. Otherwise the icon of its catalogue entry (a boss
 * a moderator added by override, a train's boss that is no raid boss now, any wild Pokémon),
 * and nothing for a Pokémon the game data does not know or that has no icon.
 */
export function pokemonPicture(
  feedImage: string | undefined,
  entry: PokemonEntry | undefined,
  source: PictureSource | undefined,
): string | undefined {
  return feedImage ?? (entry && iconAddress(entry, source));
}
```

Apply to `src/render/raid-post.ts`:

```diff
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -12,6 +12,11 @@ import {
 import { raidStage } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
+import {
+  pokemonPicture,
+  type PictureSource,
+  type PokemonIcons,
+} from '../domain/pogo/pokemon-icons.js';
 import type { PokemonEntry } from '../domain/pogo/game-master.js';
 import type { RaidBoss } from '../domain/pogo/raid-bosses.js';
 import { raidTierLabel, sameRaidTier, type RaidTier } from '../domain/pogo/raid-tier.js';
@@ -85,11 +90,14 @@ export interface RaidPostView {
  * The boss a party's reference stands for (`bossOf`: what a raid is against, what a train is
  * after), with what the boss list knows about it (shiny, picture): the list's boss of the same
  * Pokémon in the raid's tier, or else in any tier. A train has no tier: the first listed counts.
+ * Its picture is the list's, or else the icon of its catalogue entry when `icons` has one
+ * (`pokemonPicture`): a boss a moderator added, a train's boss that is no raid boss now.
  */
 export function shownBoss(
   party: Party,
   catalogue: PokemonCatalogue,
   bosses: readonly RaidBoss[],
+  icons?: PokemonIcons,
 ): ShownBoss | undefined {
   const ref = bossOf(party);
   if (ref === null) return undefined;
@@ -99,32 +107,42 @@ export function shownBoss(
     // A boss the game master knew only after the party was made has an entry by now.
     const named = bosses.filter((boss) => boss.name === ref.name);
     const listed = named.find(inTier) ?? named[0];
+    const image = pokemonPicture(listed?.image, listed?.entry, { catalogue, icons });
     return {
       name: listed?.entry?.name ?? ref.name,
       ...(listed?.entry ? { entry: listed.entry } : {}),
       shiny: listed?.shiny ?? false,
-      ...(listed?.image === undefined ? {} : { image: listed.image }),
+      ...(image === undefined ? {} : { image }),
     };
   }
   const entry = catalogue.byKey(ref.key);
   const same = bosses.filter((boss) => boss.entry !== undefined && boss.entry.key === entry?.key);
   const listed = same.find(inTier) ?? same[0];
+  const image = pokemonPicture(listed?.image, entry, { catalogue, icons });
   return {
     name: entry?.name ?? titleCase(ref.key),
     ...(entry ? { entry } : {}),
     shiny: listed?.shiny ?? false,
-    ...(listed?.image === undefined ? {} : { image: listed.image }),
+    ...(image === undefined ? {} : { image }),
   };
 }
 
-/** What an egg of the raid's tier is sure to hatch as, from the boss list. */
-export function shownAutoset(tier: RaidTier, autoset: RaidBoss | undefined): ShownBoss | undefined {
+/**
+ * What an egg of the raid's tier is sure to hatch as, from the boss list; its picture by the
+ * same rule as a boss's, when `pictures` (the game data) is given.
+ */
+export function shownAutoset(
+  tier: RaidTier,
+  autoset: RaidBoss | undefined,
+  pictures?: PictureSource,
+): ShownBoss | undefined {
   if (!autoset || !sameRaidTier(autoset.tier, tier)) return undefined;
+  const image = pokemonPicture(autoset.image, autoset.entry, pictures);
   return {
     name: autoset.name,
     ...(autoset.entry ? { entry: autoset.entry } : {}),
     shiny: autoset.shiny,
-    ...(autoset.image === undefined ? {} : { image: autoset.image }),
+    ...(image === undefined ? {} : { image }),
   };
 }
 
```

Apply to `src/services/game-data-service.ts`:

```diff
--- a/src/services/game-data-service.ts
+++ b/src/services/game-data-service.ts
@@ -2,6 +2,7 @@ import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
 import path from 'node:path';
 import { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import { GAME_DATA_VERSION, parseGameMaster, type GameData } from '../domain/pogo/game-master.js';
+import { iconNamesOf, isTruncatedListing, PokemonIcons } from '../domain/pogo/pokemon-icons.js';
 import { parseTextFile } from '../domain/pogo/text.js';
 import type { Logger } from '../log.js';
 import { failureReason } from './failure-reason.js';
@@ -22,6 +23,12 @@ interface CacheFile {
   version: number;
   fetchedAt: number;
   data: GameData;
+  /**
+   * The names of the game's icon files that exist, as last downloaded (`PokemonIcons`). Absent
+   * in a copy saved before there was a list, or while none could be downloaded: such a copy is
+   * as good as any other.
+   */
+  icons?: string[];
 }
 
 /** The part of `fetch` this service needs. */
@@ -33,6 +40,12 @@ export type FetchText = (
 export interface GameDataOptions {
   gameMasterUrl: string;
   textUrl: string;
+  /**
+   * The listing of the game's picture files (GitHub's tree of PokeMiners' `pogo_assets`,
+   * `Images/Pokemon/Addressable Assets`); downloaded with the game data. Without it no list of
+   * icons is kept.
+   */
+  iconsUrl?: string;
   /** Where the parsed data is kept between runs, e.g. `var/game-data-cache.json`. */
   cachePath: string;
   /** A cache older than this is refreshed when the bot starts, and the data is refreshed this often. */
@@ -46,9 +59,15 @@ export interface GameDataOptions {
   retryMs?: number;
 }
 
-/** What handlers need: the current catalogue. */
+/** What handlers need: the current catalogue, and the icons of Pokémon that exist. */
 export interface GameDataProvider {
   readonly catalogue: PokemonCatalogue;
+  /**
+   * The game's icon files that exist, for the picture of a Pokémon the raid boss feed has none
+   * of (`pokemonPicture`). Undefined while no list could be downloaded: only the feed's
+   * pictures are shown then.
+   */
+  readonly icons?: PokemonIcons | undefined;
 }
 
 let temporaryCounter = 0;
@@ -56,14 +75,29 @@ let temporaryCounter = 0;
 /**
  * Downloads the game master and English text file, parses them and keeps the result on disk,
  * so the bot still starts when the download fails. Nothing happens until `load` is called.
+ *
+ * With them it downloads the list of the game's icon files (`iconsUrl`) and keeps the icon
+ * names in the same saved copy. That list is an extra: when it cannot be downloaded or read
+ * the game data is used and saved all the same, with the list of the last time, or none.
+ * A list that is owed (the saved copy the bot started from has none, or its last download
+ * failed) is asked for alone, without the game master: on the side when the bot starts from a
+ * fresh copy, and `retryMs` after a failure while the automatic refresh runs; the saved copy is
+ * then written again with it. A listing that GitHub cut short never takes names away: the list
+ * in use is kept and the new names are added.
  */
 export class GameDataService implements GameDataProvider {
   private current: PokemonCatalogue | undefined;
+  private iconList: PokemonIcons | undefined;
+  /** Whether the last download of the list of icons failed: it is asked for again alone. */
+  private iconsFailed = false;
+  /** The copy in use as it was saved, or would be: written again when a list arrives alone. */
+  private saved: CacheFile | undefined;
   private loadedAt = 0;
   private readonly now: () => number;
   private readonly timeoutMs: number;
   private readonly retryMs: number;
   private inFlight: Promise<boolean> | undefined;
+  private iconsInFlight: Promise<boolean> | undefined;
   private lastFailure: string | undefined;
   private timer: NodeJS.Timeout | undefined;
   private stopped = false;
@@ -80,6 +114,11 @@ export class GameDataService implements GameDataProvider {
     return this.current;
   }
 
+  /** The icon files that exist, as last downloaded or saved; undefined when there is no list. */
+  get icons(): PokemonIcons | undefined {
+    return this.iconList;
+  }
+
   /** When the data in use was downloaded (epoch ms); 0 before `load`. */
   get fetchedAt(): number {
     return this.loadedAt;
@@ -91,10 +130,16 @@ export class GameDataService implements GameDataProvider {
    */
   async load(): Promise<void> {
     const cached = await this.readCache();
+    // The saved list of icons is the last one there is, however old the copy: it stays in use
+    // (and is saved again) when the download that follows brings none.
+    if (cached?.icons) this.iconList = cached.icons;
     // A copy dated in the future (the clock went back) is out of date but still usable.
     const age = cached ? this.now() - cached.cache.fetchedAt : 0;
     if (cached && age >= 0 && age < this.options.maxAgeMs) {
-      this.use(cached.cache, cached.catalogue);
+      this.use(cached.cache, cached.catalogue, cached.icons);
+      // A copy without a list (saved before there was one, or while it could not be had): the
+      // list is fetched now, alone and on the side. The bot does not wait for it.
+      if (this.iconsOwed) void this.refreshIcons();
       return;
     }
     if (await this.refresh()) return;
@@ -107,7 +152,7 @@ export class GameDataService implements GameDataProvider {
       { fetchedAt: new Date(cached.cache.fetchedAt).toISOString() },
       `using the saved game data, which is out of date; retry in ${Math.round(this.retryMs / MINUTE_MS)} minutes`,
     );
-    this.use(cached.cache, cached.catalogue);
+    this.use(cached.cache, cached.catalogue, cached.icons);
   }
 
   /**
@@ -122,16 +167,59 @@ export class GameDataService implements GameDataProvider {
     return this.inFlight;
   }
 
+  /**
+   * Whether the list of icons should be asked for by itself: an address is configured, and
+   * there is no list or its last download failed.
+   */
+  private get iconsOwed(): boolean {
+    return this.options.iconsUrl !== undefined && (this.iconList === undefined || this.iconsFailed);
+  }
+
+  /**
+   * Downloads the list of icons alone, without the game data, and writes the saved copy again
+   * with it. False, keeping what was in use, when the download or the listing is bad. Never
+   * rejects; calls made while one is running share its result.
+   */
+  refreshIcons(): Promise<boolean> {
+    this.iconsInFlight ??= this.refreshIconsOnce()
+      .catch((err: unknown) => {
+        this.options.log.warn({ err }, 'could not keep the list of Pokémon icons');
+        return false;
+      })
+      .finally(() => {
+        this.iconsInFlight = undefined;
+      });
+    return this.iconsInFlight;
+  }
+
+  private async refreshIconsOnce(): Promise<boolean> {
+    const icons = await this.downloadIcons();
+    if (!icons) return false;
+    this.iconList = icons;
+    // A refresh of the game data that is running saves the list itself when it ends.
+    await this.inFlight?.catch(() => undefined);
+    const saved = this.saved;
+    if (saved && this.iconList === icons) {
+      saved.icons = icons.names();
+      await this.writeCache(saved);
+    }
+    this.options.log.info({ icons: icons.size }, 'the list of Pokémon icons was downloaded');
+    return true;
+  }
+
   /** Resolves once no refresh is in flight (at once when none is). Never rejects. For shutdown and tests. */
   async whenIdle(): Promise<void> {
-    while (this.inFlight) {
-      await this.inFlight.catch(() => undefined);
+    while (this.inFlight || this.iconsInFlight) {
+      await this.inFlight?.catch(() => undefined);
+      await this.iconsInFlight?.catch(() => undefined);
     }
   }
 
   /**
    * Schedules the next refresh: when the data in use reaches `maxAgeMs`, or `retryMs` from now
    * when it is already older or the last attempt failed; and again after every attempt.
+   * While the list of icons is owed and the data itself is fresh, the list alone is asked for
+   * `retryMs` from now (or when the data is due, if that is sooner).
    * Calling it again while a refresh is scheduled changes nothing.
    */
   startAutoRefresh(): void {
@@ -147,15 +235,33 @@ export class GameDataService implements GameDataProvider {
     this.timer = undefined;
   }
 
-  private schedule(): void {
-    if (this.timer) clearTimeout(this.timer);
+  /** How long until the data in use is a full period old; undefined when it is due or failed. */
+  private freshFor(): number | undefined {
     const age = this.now() - this.loadedAt;
     const fresh =
       this.lastFailure === undefined && this.loadedAt > 0 && age < this.options.maxAgeMs;
-    const delay = Math.min(fresh ? this.options.maxAgeMs - age : this.retryMs, MAX_TIMER_MS);
+    return fresh ? this.options.maxAgeMs - age : undefined;
+  }
+
+  /** What the timer does: the whole refresh when the data is due, else the list when owed. */
+  private due(): Promise<boolean> {
+    if (this.freshFor() === undefined) return this.refresh();
+    return this.iconsOwed ? this.refreshIcons() : Promise.resolve(true);
+  }
+
+  private schedule(): void {
+    if (this.timer) clearTimeout(this.timer);
+    const freshFor = this.freshFor();
+    const wait =
+      freshFor === undefined
+        ? this.retryMs
+        : this.iconsOwed
+          ? Math.min(freshFor, this.retryMs)
+          : freshFor;
+    const delay = Math.min(wait, MAX_TIMER_MS);
     this.timer = setTimeout(() => {
       this.timer = undefined;
-      void this.refresh()
+      void this.due()
         .catch((err: unknown) => {
           this.lastFailure = err instanceof Error ? err.message : String(err);
           try {
@@ -174,6 +280,8 @@ export class GameDataService implements GameDataProvider {
   private async refreshOnce(): Promise<boolean> {
     let cache: CacheFile;
     let catalogue: PokemonCatalogue;
+    // Beside the game data, and never in its way: it resolves with a list or with nothing.
+    const listed = this.downloadIcons();
     try {
       const [gameMaster, textFile] = await Promise.all([
         this.download(this.options.gameMasterUrl),
@@ -192,10 +300,14 @@ export class GameDataService implements GameDataProvider {
     } catch (err) {
       this.lastFailure = err instanceof Error ? err.message : String(err);
       this.options.log.error({ err }, 'could not refresh the game data');
+      // A newer list of icons is used all the same; it is saved with the next good refresh.
+      this.iconList = (await listed) ?? this.iconList;
       return false;
     }
     this.lastFailure = undefined;
-    this.use(cache, catalogue);
+    this.use(cache, catalogue, await listed);
+    // The list in use is saved with the data: the new one, or the one of the last time.
+    if (this.iconList) cache.icons = this.iconList.names();
     this.options.log.info(
       { pokemon: cache.data.pokemon.length, moves: cache.data.moves.length },
       'game data refreshed',
@@ -225,9 +337,43 @@ export class GameDataService implements GameDataProvider {
     }
   }
 
-  private use(cache: CacheFile, catalogue: PokemonCatalogue): void {
+  private use(cache: CacheFile, catalogue: PokemonCatalogue, icons?: PokemonIcons): void {
     this.current = catalogue;
+    this.saved = cache;
     this.loadedAt = cache.fetchedAt;
+    // Without a list of its own (the download failed, an older saved copy) the one in use stays.
+    if (icons) this.iconList = icons;
+  }
+
+  /**
+   * Downloads the list of icon files. Never rejects: undefined when no address is configured,
+   * and when the download or the listing is bad, which is logged as a warning (the bot then
+   * shows the pictures it showed before) and remembered (`iconsFailed`: it is asked for again).
+   * A listing that was cut short is said, and gives the list in use with its names added:
+   * names that are missing from it are not taken to be gone.
+   */
+  private async downloadIcons(): Promise<PokemonIcons | undefined> {
+    const { iconsUrl, log } = this.options;
+    if (iconsUrl === undefined) return undefined;
+    try {
+      const listing = JSON.parse(await this.download(iconsUrl)) as unknown;
+      const listed = new PokemonIcons(iconNamesOf(listing));
+      this.iconsFailed = false;
+      if (!isTruncatedListing(listing)) return listed;
+      const icons = this.iconList ? this.iconList.with(listed) : listed;
+      log.warn(
+        { listed: listed.size, icons: icons.size },
+        'the list of Pokémon icons was cut short',
+      );
+      return icons;
+    } catch (err) {
+      this.iconsFailed = true;
+      log.warn(
+        { err, kept: this.iconList?.size ?? 0 },
+        'could not download the list of Pokémon icons',
+      );
+      return undefined;
+    }
   }
 
   private async download(url: string): Promise<string> {
@@ -254,7 +400,7 @@ export class GameDataService implements GameDataProvider {
 
   /** A saved copy is usable only if it has the current version, is complete and builds a catalogue. */
   private async readCache(): Promise<
-    { cache: CacheFile; catalogue: PokemonCatalogue } | undefined
+    { cache: CacheFile; catalogue: PokemonCatalogue; icons: PokemonIcons | undefined } | undefined
   > {
     try {
       const cache = JSON.parse(
@@ -279,7 +425,18 @@ export class GameDataService implements GameDataProvider {
       ) {
         return undefined;
       }
-      return { cache: cache as CacheFile, catalogue: new PokemonCatalogue(data as GameData) };
+      // The list of icons is an extra: a copy without one, or with one that is no list of
+      // names, is used without it.
+      const names: unknown = cache.icons;
+      const icons =
+        Array.isArray(names) && names.every((name) => typeof name === 'string')
+          ? new PokemonIcons(names)
+          : undefined;
+      return {
+        cache: cache as CacheFile,
+        catalogue: new PokemonCatalogue(data as GameData),
+        icons: icons && icons.size > 0 ? icons : undefined,
+      };
     } catch {
       return undefined;
     }
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -322,10 +322,10 @@ export class PartyService {
   view(party: RaidParty): RaidPostView {
     const { gyms, raidBosses, gameData, settings } = this.options;
     const catalogue = gameData.catalogue;
-    const boss = shownBoss(party, catalogue, raidBosses.bosses());
+    const boss = shownBoss(party, catalogue, raidBosses.bosses(), gameData.icons);
     const hatchesAs = boss
       ? undefined
-      : shownAutoset(party.raid.tier, raidBosses.autoset(party.raid.tier));
+      : shownAutoset(party.raid.tier, raidBosses.autoset(party.raid.tier), gameData);
     return {
       party,
       now: this.now(),
@@ -361,7 +361,7 @@ export class PartyService {
     return {
       ...this.timedView(party),
       gym: (id) => gyms.get(id),
-      boss: shownBoss(party, catalogue, raidBosses.bosses()),
+      boss: shownBoss(party, catalogue, raidBosses.bosses(), gameData.icons),
       catalogue,
     };
   }
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/config/settings.test.ts src/domain/pogo/pokemon-icons.test.ts src/render/raid-post.test.ts src/services/game-data-service.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff b865c25 -- src test scripts data/settings.json   # must print nothing
npx prettier --check data/settings.json scripts/game-data/make-fixtures.ts src/app.ts src/config/settings.test.ts src/config/settings.ts src/domain/pogo/pokemon-icons.test.ts src/domain/pogo/pokemon-icons.ts src/render/raid-post.test.ts src/render/raid-post.ts src/services/game-data-service.test.ts src/services/game-data-service.ts src/services/party-service.ts test/fixtures/pokemon-icons.json test/fixtures/settings.json test/support/game-data.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add data/settings.json scripts/game-data/make-fixtures.ts src/app.ts src/config/settings.test.ts src/config/settings.ts src/domain/pogo/pokemon-icons.test.ts src/domain/pogo/pokemon-icons.ts src/render/raid-post.test.ts src/render/raid-post.ts src/services/game-data-service.test.ts src/services/game-data-service.ts src/services/party-service.ts test/fixtures/pokemon-icons.json test/fixtures/settings.json test/support/game-data.ts
git commit -m "Pokémon icons: the list of files that exist, the picture of an entry, raid and train posts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 3,224 unit tests.

---

### Task 9: The spawn report: the wild command, its removal after half an hour, and the Unown channel

**Files:**
- Create: `src/commands/notifications/wild.test.ts`, `src/commands/notifications/wild.ts`, `src/render/spawn.ts`, `src/services/spawn-service.test.ts`, `src/services/spawn-service.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/commands/index.ts`, `src/services/notify-service.ts`, `test/support/fake-gateway.ts`, `test/support/party-service.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: Tasks 3 to 8; `regionChannelOf`; `ctx.pokemon`; `PartyGateway` (`sendMessage`, `deleteMessage`, `findChannel`, `mayPost`); `settings.channels.unown`.
- Produces: `src/render/spawn.ts`: `spawnSentence`, `spawnEmbed`, `spawnMessage`, `spawnTextMessage`, `sightingMessage`, `SPAWN_WARNING`, `SPAWN_FOOTER`; `src/services/spawn-service.ts`: `SpawnService.report(report): Promise<SpawnOutcome>`, `flush()`, the constants `SPAWN_MINUTES`, `DELETE_AGAIN_MS` (`ctx.spawns`); `PartyNotifier.spawnReported`; the command `/wild pokemon [details] [iv]` (`src/commands/notifications/wild.ts`: `wildCommand`, `wildChoices`, `wildPokemon`, `WILD_THROTTLE`, `MAX_DETAILS`), listed in `src/commands/index.ts`; the shutdown step for the reports still standing.

Reference commit of the prototype for this task: `a00cd38`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/notifications/wild.test.ts`:

```ts
import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeAutocomplete,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, CAROL, PARTY_NOW } from '../../../test/support/parties.js';
import { partyServiceWith, reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
import { loadSettings } from '../../config/settings.js';
import { InteractionRouter } from '../../discord/router.js';
import { pokemonTarget, type NotificationTarget } from '../../domain/pogo/notification-target.js';
import { postLink } from '../../render/notify-dm.js';
import { DM_PRIORITY } from '../../services/dm-sender.js';
import { SPAWN_FOOTER, SPAWN_WARNING } from '../../render/spawn.js';
import { commands } from '../index.js';
import { MAX_DETAILS, WILD_THROTTLE, wildCommand } from './wild.js';

const SIGHTINGS = '100000000000000031';
const PERFECT: NotificationTarget = { kind: 'iv', iv: 'perfect' };

async function setup(overrides: Parameters<typeof partyServiceWith>[1] = {}) {
  const made = await partyServiceWith([], overrides);
  const { ctx } = createTestContext({
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    spawns: made.spawns,
    wants: made.wants,
  });
  const router = new InteractionRouter(ctx, [wildCommand], []);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const run = (options: Record<string, string>, extra: object = {}) =>
    handle(
      fakeChatInput({
        commandName: 'wild',
        channelId: WEST_CHANNEL,
        userId: ALICE,
        displayName: 'Alice',
        options,
        ...extra,
      }),
    );
  const offered = async (focused: string) => {
    const interaction = await handle(
      fakeAutocomplete({
        commandName: 'wild',
        channelId: WEST_CHANNEL,
        focusedName: 'pokemon',
        focused,
      }),
    );
    return interaction.respond.mock.calls[0]?.[0];
  };
  /** The reports that stand in a channel. */
  const reports = (channelId = WEST_CHANNEL) => made.gateway.messagesIn(channelId);
  const want = async (target: NotificationTarget, ...ids: string[]) => {
    for (const id of ids) await made.wants.set(id, made.gateway.guildId, target, 'both');
  };
  const told = async (userId: string): Promise<string[][]> => {
    await made.notify.flush();
    return made.dms.to(userId).map((message) => (message.content ?? '').split('\n'));
  };
  return { ...made, ctx, handle, run, offered, reports, want, told };
}

describe('/wild', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts the report in the region channel, publicly, and answers privately with a link', async () => {
    const made = await setup();
    const used = await made.run({ pokemon: 'dratini', details: 'by the fountain' });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const [report] = made.reports();
    expect(report?.message).toEqual({
      content: `A wild **Dratini** has been reported by **Alice** (<@${ALICE}>):`,
      embeds: [
        {
          color: 0x2ecc71,
          description: `by the fountain\n\n${SPAWN_WARNING}`,
          footer: { text: SPAWN_FOOTER },
        },
      ],
    });
    expect(sent(used.editReply).content).toBe(
      `Reported: a wild Dratini in <#${WEST_CHANNEL}>. ` +
        `${postLink(made.gateway.guildId, WEST_CHANNEL, report?.id ?? '')}\n` +
        'The report is removed in 30 minutes.',
    );
  });

  it('posts in the text channel of the region also when used in its forum or a post there', async () => {
    const made = await setup();
    await made.run({ pokemon: 'dratini' }, { channelId: WEST_FORUM });
    const raid = await reportedRaid({}, {}, made);
    await made.run(
      { pokemon: 'dratini' },
      { channelId: raid.postId, thread: { parentId: WEST_FORUM } },
    );
    // The link line of the raid is the third message there.
    expect(made.reports().filter((message) => message.message.embeds?.length)).toHaveLength(2);
    expect(made.gateway.messagesIn(raid.postId)).toEqual([]);
  });

  it('is refused outside a region, with a sentence, and counts nothing against the limit', async () => {
    const made = await setup();
    const used = await made.run({ pokemon: 'dratini' }, { channelId: '600000000000000099' });
    expect(sent(used.reply)).toEqual({
      content: 'Report a wild Pokémon from the channel of a region, its forum or a post there.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.reports()).toEqual([]);
  });

  it('shows the picture of a Pokémon that is a raid boss, and the IVs when they are said', async () => {
    const made = await setup();
    await made.run({ pokemon: 'gastly', iv: 'perfect' });
    const [report] = made.reports();
    expect(report?.message.content).toBe(
      `A wild **Gastly** with 100% IVs has been reported by **Alice** (<@${ALICE}>):`,
    );
    // The private answer says the IVs again: the member sees what was reported.
    const used = await made.run({ pokemon: 'dratini', iv: 'zero' });
    expect(sent(used.editReply).content).toMatch(
      /^Reported: a wild Dratini with 0% IVs in <#\d+>\. https:/,
    );
    expect(report?.message.embeds?.[0]).toMatchObject({
      description: SPAWN_WARNING,
      thumbnail: { url: expect.stringContaining('pm92.icon.png') as string },
    });
  });

  it('shows the details as plain text: nothing in them pings or links', async () => {
    const made = await setup();
    await made.run({
      pokemon: 'dratini',
      details: '@everyone <@&5> [here](https://example.com) **now**',
    });
    const description = made.reports()[0]?.message.embeds?.[0]?.description ?? '';
    expect(description).not.toContain('@everyone');
    expect(description).not.toContain('<@&');
    expect(description).not.toContain('](');
    expect(description).toContain('\\*\\*now\\*\\*');
    expect(made.reports()[0]?.message.mention).toBeUndefined();
  });

  it('limits the details to 200 characters', () => {
    const details = wildCommand.data
      .toJSON()
      .options?.find((option) => option.name === 'details') as { max_length?: number };
    expect(MAX_DETAILS).toBe(200);
    expect(details.max_length).toBe(200);
  });

  it('takes a form as that form, a species by its key or name, and refuses a mega', async () => {
    const made = await setup();
    await made.run({ pokemon: 'rattata_alola' });
    await made.run({ pokemon: 'Alolan Rattata' });
    await made.run({ pokemon: 'Unown' });
    await made.run({ pokemon: 'unown_f' });
    expect(made.reports().map((report) => report.message.content?.split(' has ')[0])).toEqual([
      'A wild **Alolan Rattata**',
      'A wild **Alolan Rattata**',
      'A wild **Unown**',
      'A wild **Unown (F)**',
    ]);
    const mega = await made.run({ pokemon: 'charizard_mega_y' });
    expect(sent(mega.reply).content).toBe(
      'Mega Charizard Y is a mega: those are met in raids, not in the wild.',
    );
    expect(made.reports()).toHaveLength(4);
  });

  it('never guesses at text that names no Pokémon outright: it suggests', async () => {
    const made = await setup();
    const used = await made.run({ pokemon: 'chariz' });
    expect(sent(used.reply).content).toBe(
      'I do not know "chariz" as a Pokémon. Did you mean Charizard? ' +
        'Pick one from the list that appears while you type.',
    );
    const nothing = await made.run({ pokemon: 'zzzzqqq' });
    expect(sent(nothing.reply).content).toBe(
      'I do not know "zzzzqqq" as a Pokémon. Pick one from the list that appears while you type.',
    );
    expect(made.reports()).toEqual([]);
  });

  it('offers every Pokémon while typing, a form as a form, and no megas', async () => {
    const made = await setup();
    expect(await made.offered('')).toEqual([]);
    expect(await made.offered('chariz')).toEqual([{ name: 'Charizard', value: 'charizard' }]);
    const rattata = (await made.offered('rattata')) ?? [];
    expect(rattata.map((choice) => choice.value)).toEqual(
      expect.arrayContaining(['rattata', 'rattata_alola']),
    );
    expect(((await made.offered('a')) ?? []).length).toBeLessThanOrEqual(25);
  });

  it('allows 15 reports in 15 minutes, as the legacy bot did; a refused use does not count', async () => {
    expect(WILD_THROTTLE).toEqual({ uses: 15, perSeconds: 900 });
    expect(wildCommand.throttle).toBe(WILD_THROTTLE);
    const made = await setup();
    for (let n = 0; n < 5; n++) await made.run({ pokemon: 'zzzzqqq' });
    for (let n = 0; n < 15; n++) await made.run({ pokemon: 'dratini' });
    expect(made.reports()).toHaveLength(15);
    const late = await made.run({ pokemon: 'dratini' });
    expect(sent(late.reply).content).toBe('You can use /wild again in 15 minutes.');
  });

  it('deletes the report after 30 minutes, and at a graceful shutdown what still waits', async () => {
    const made = await setup();
    await made.run({ pokemon: 'dratini' });
    await made.run({ pokemon: 'gastly' });
    expect(made.spawnTimers.map((timer) => timer.ms)).toEqual([30 * 60_000, 30 * 60_000]);
    expect(made.spawns.pending).toBe(2);
    // The timer alone deletes the first: nothing is flushed.
    made.spawnTimers[0]?.run();
    for (let turn = 0; turn < 100 && made.gateway.deleted.length === 0; turn++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(made.gateway.deleted).toHaveLength(1);
    expect(made.reports()).toHaveLength(1);
    expect(made.spawns.pending).toBe(1);
    // The second because the bot stops.
    await made.spawns.flush();
    expect(made.reports()).toEqual([]);
    expect(made.spawns.pending).toBe(0);
    expect(made.spawnTimers[1]?.cancelled).toBe(true);
    expect(made.gateway.deleted).toHaveLength(2);
  });

  it('tells who wants the Pokémon in the wild and can see the region channel, not the reporter', async () => {
    const made = await setup();
    await made.want(pokemonTarget(147), ALICE, BOB, CAROL);
    await made.wants.set('200000000000000005', made.gateway.guildId, pokemonTarget(147), 'raid');
    made.members.hide(WEST_CHANNEL, CAROL);
    await made.run({ pokemon: 'dratini', details: 'by the fountain' });
    expect(await made.told(BOB)).toEqual([
      [
        `A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **Alice**: ` +
          postLink(made.gateway.guildId, WEST_CHANNEL, made.reports()[0]?.id ?? ''),
        '-# You asked to be told about: Dratini',
      ],
    ]);
    expect(made.dms.recipients).toEqual([BOB]);
    // After the messages for who is in a party, before the other news.
    expect(made.dms.jobs[0]?.priority).toBe(DM_PRIORITY.spawn);
    const [message] = made.dms.to(BOB);
    expect(message?.embeds).toEqual([
      { color: 0x2ecc71, description: `by the fountain\n\n${SPAWN_WARNING}` },
    ]);
    expect(message?.components?.[0]?.components).toMatchObject([
      { custom_id: `dm:${made.gateway.guildId}:stop:p:147`, label: 'Stop: Dratini' },
    ]);
    expect(made.members.batches.at(-1)).toMatchObject({ channelId: WEST_CHANNEL });
    expect(made.dms.jobs[0]?.expiresAt).toBe(PARTY_NOW + 30 * 60_000);
    // A spawn is no party: the next report is news again.
    await made.run({ pokemon: 'dratini' });
    expect(await made.told(BOB)).toHaveLength(2);
  });

  it('tells who asked for perfect IVs when the report says so, with the Pokémon they may also want', async () => {
    const made = await setup();
    await made.want(PERFECT, BOB);
    await made.want(pokemonTarget(147), BOB, CAROL);
    await made.run({ pokemon: 'dratini', iv: 'perfect' });
    expect(await made.told(BOB)).toEqual([
      [
        expect.stringMatching(
          /^A wild \*\*Dratini\*\* with 100% IVs has been reported in <#\d+> by \*\*Alice\*\*: https:/,
        ),
        '-# You asked to be told about: Perfect IV spawns · Dratini',
      ],
    ]);
    expect(await made.told(CAROL)).toHaveLength(1);
    await made.run({ pokemon: 'gastly' });
    expect(await made.told(BOB)).toHaveLength(1);
  });

  it('posts the report where notifications are off, and sends no direct message', async () => {
    const settings = loadSettings(TEST_SETTINGS_PATH);
    const made = await setup({
      settings: { ...settings, features: { ...settings.features, notifications: false } },
    });
    await made.want(pokemonTarget(147), BOB);
    await made.run({ pokemon: 'dratini' });
    expect(made.reports()).toHaveLength(1);
    expect(await made.told(BOB)).toEqual([]);
    expect(wildCommand.enabled).toBeUndefined();
  });

  it('says that the channel of the region is gone, and that a moderator should know', async () => {
    const made = await setup();
    made.gateway.gone.add(WEST_CHANNEL);
    const used = await made.run({ pokemon: 'dratini' });
    expect(sent(used.followUp).content).toBe(
      'The channel of this region is gone, so I cannot post the report. Tell a moderator.',
    );
  });

  it('says that it may not post there when Discord refuses, without an error to look up', async () => {
    const made = await setup();
    made.gateway.failing.set(
      'sendMessage',
      new DiscordAPIError(
        { code: RESTJSONErrorCodes.MissingPermissions, message: 'Missing Permissions' },
        RESTJSONErrorCodes.MissingPermissions,
        403,
        'POST',
        '/x',
        {},
      ),
    );
    const used = await made.run({ pokemon: 'dratini' });
    expect(sent(used.followUp).content).toBe(
      `I am not allowed to post in <#${WEST_CHANNEL}>, so the report was not made. Tell a moderator.`,
    );
    expect(made.entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });

  it('posts where the bot may not post embeds, as text', async () => {
    const made = await setup();
    made.gateway.noEmbeds.add(WEST_CHANNEL);
    const used = await made.run({ pokemon: 'dratini', details: 'by the fountain' });
    const [report] = made.reports();
    expect(report?.message.embeds).toBeUndefined();
    expect(report?.message.content).toContain(`by the fountain\n\n${SPAWN_WARNING}`);
    expect(sent(used.editReply).content).toMatch(/^Reported: a wild Dratini/);
  });

  it('asks to report again once the bot is shutting down', async () => {
    const made = await setup();
    await made.spawns.flush();
    const used = await made.run({ pokemon: 'dratini' });
    expect(sent(used.followUp).content).toBe(
      'I am restarting just now, so the report was not made. Report it again in a minute.',
    );
    expect(made.reports()).toEqual([]);
  });

  it('is listed with the commands, filed under notifications', () => {
    expect(commands).toContain(wildCommand);
    expect(wildCommand.help.category).toBe('notifications');
    expect(commands.some((command) => command.data.name === 'spawn')).toBe(false);
  });
});

describe('/wild: Unown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a species like any other: the region message and the direct messages', async () => {
    const made = await setup();
    await made.want(pokemonTarget(201), BOB);
    await made.run({ pokemon: 'unown_f', details: 'at the library' });
    expect(made.reports()).toHaveLength(1);
    expect(await made.told(BOB)).toEqual([
      [
        expect.stringMatching(
          /^A wild \*\*Unown \(F\)\*\* has been reported in <#\d+> by \*\*Alice\*\*: https:/,
        ),
        '-# You asked to be told about: Unown (every form)',
      ],
    ]);
  });

  it('is also posted in the sightings channel where the server has one, and stays there', async () => {
    const made = await setup();
    made.gateway.channelNames.set(SIGHTINGS, made.settings.channels.unown);
    await made.run({ pokemon: 'unown_f', details: 'at the library' });
    expect(made.gateway.messagesIn(SIGHTINGS).map((message) => message.message)).toEqual([
      {
        content: `A wild **Unown (F)** has been reported in <#${WEST_CHANNEL}> by **Alice**:`,
        embeds: [{ color: 0x2ecc71, description: `at the library\n\n${SPAWN_WARNING}` }],
      },
    ]);
    // Nobody is pinged and no role is named.
    expect(JSON.stringify(made.gateway.messagesIn(SIGHTINGS))).not.toContain('<@&');
    // Only the region message waits for its deletion.
    expect(made.spawns.pending).toBe(1);
    await made.spawns.flush();
    expect(made.reports()).toEqual([]);
    expect(made.gateway.messagesIn(SIGHTINGS)).toHaveLength(1);
    // Another Pokémon is not posted there.
    await made.run({ pokemon: 'dratini' });
    expect(made.gateway.messagesIn(SIGHTINGS)).toHaveLength(1);
  });

  it('is not posted there when the bot may not post embeds in that channel, and the report still stands', async () => {
    const made = await setup();
    made.gateway.channelNames.set(SIGHTINGS, made.settings.channels.unown);
    made.gateway.noEmbeds.add(SIGHTINGS);
    await made.run({ pokemon: 'unown' });
    expect(made.gateway.messagesIn(SIGHTINGS)).toEqual([]);
    expect(made.reports()).toHaveLength(1);
  });

  it('reports in the region all the same when the sightings channel refuses', async () => {
    const made = await setup();
    made.gateway.channelNames.set(SIGHTINGS, made.settings.channels.unown);
    await made.run({ pokemon: 'dratini' }, { channelId: EAST_CHANNEL });
    const failing = made.gateway.sendMessage.bind(made.gateway);
    made.gateway.sendMessage = (channelId, message) =>
      channelId === SIGHTINGS
        ? Promise.reject(new Error('Missing Access'))
        : failing(channelId, message);
    const used = await made.run({ pokemon: 'unown' });
    expect(sent(used.editReply).content).toMatch(/^Reported: a wild Unown/);
    expect(made.entries.some((entry) => entry.msg === 'could not post an Unown sighting')).toBe(
      true,
    );
  });
});
```

Create `src/services/spawn-service.test.ts`:

```ts
import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { catalogueFixture, iconsFixture } from '../../test/support/game-data.js';
import { WEST_CHANNEL } from '../../test/support/gyms.js';
import { ALICE } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { raidBossesFixture } from '../../test/support/raid-bosses.js';
import { postLink } from '../render/notify-dm.js';
import {
  sightingMessage,
  SPAWN_FOOTER,
  SPAWN_MINUTES,
  SPAWN_WARNING,
  spawnEmbed,
  spawnMessage,
  spawnSentence,
  type SpawnView,
} from '../render/spawn.js';
import { DELETE_AGAIN_MS, SpawnService, UNOWN_DEX, type SpawnReport } from './spawn-service.js';

const report = (guildId: string, more: Partial<SpawnReport> = {}): SpawnReport => ({
  guildId,
  regionChannelId: WEST_CHANNEL,
  pokemon: { dex: 147, key: 'dratini', name: 'Dratini' },
  details: 'by the fountain',
  reporter: { id: ALICE, name: 'Alice' },
  ...more,
});

function refusal(code: number): DiscordAPIError {
  return new DiscordAPIError({ code, message: 'Missing' }, code, 403, 'POST', '/x', {});
}

/** Waits for something the fake gateway does a few turns of the event loop later. */
async function until(done: () => boolean): Promise<void> {
  for (let turn = 0; turn < 1_000 && !done(); turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (!done()) throw new Error('it never happened');
}

describe('SpawnService', () => {
  it('answers that the channel is gone, and tells nobody', async () => {
    const made = await partyServiceWith();
    const sent: string[] = [];
    const service = new SpawnService({
      gateway: {
        sendMessage: (channelId) => {
          sent.push(channelId);
          return Promise.resolve(undefined);
        },
        deleteMessage: () => Promise.resolve(),
        findChannel: () => undefined,
        mayPost: () => true,
      },
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      notify: {
        spawnReported: () => {
          throw new Error('nobody should be told');
        },
      },
      settings: made.settings,
      log: made.log,
    });
    expect(await service.report(report(made.gateway.guildId))).toEqual({ kind: 'no-channel' });
    expect(sent).toEqual([WEST_CHANNEL]);
    expect(service.pending).toBe(0);
  });

  it('rejects when the report cannot be sent, and has nothing to delete then', async () => {
    const made = await partyServiceWith();
    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
    await expect(made.spawns.report(report(made.gateway.guildId))).rejects.toThrow('away');
    expect(made.spawns.pending).toBe(0);
    await made.notify.flush();
    expect(made.dms.jobs).toEqual([]);
  });

  it('answers that it was refused when the bot may not post there, and says so at warn', async () => {
    for (const code of [RESTJSONErrorCodes.MissingPermissions, RESTJSONErrorCodes.MissingAccess]) {
      const made = await partyServiceWith();
      made.gateway.failing.set('sendMessage', refusal(code));
      expect(await made.spawns.report(report(made.gateway.guildId))).toEqual({ kind: 'refused' });
      expect(made.spawns.pending).toBe(0);
      const said = made.entries.filter(
        (entry) => entry.msg === 'the bot may not post a spawn report in the channel of a region',
      );
      expect(said).toHaveLength(1);
      expect(said[0]).toMatchObject({ level: 40, channel: WEST_CHANNEL });
      await made.notify.flush();
      expect(made.dms.jobs).toEqual([]);
    }
  });

  it('posts the report as text where the bot may not post embeds: details and warning, no picture', async () => {
    const made = await partyServiceWith();
    made.gateway.noEmbeds.add(WEST_CHANNEL);
    const outcome = await made.spawns.report(
      report(made.gateway.guildId, { pokemon: { dex: 92, key: 'gastly', name: 'Gastly' } }),
    );
    expect(outcome.kind).toBe('posted');
    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(posted?.message).toEqual({
      content:
        `A wild **Gastly** has been reported by **Alice** (<@${ALICE}>):\n` +
        `by the fountain\n\n${SPAWN_WARNING}\n-# ${SPAWN_FOOTER}`,
    });
    // It is deleted like any other report.
    expect(made.spawns.pending).toBe(1);
  });

  it('tries once more a minute later to delete a report it could not delete, then forgets it', async () => {
    const made = await partyServiceWith();
    await made.spawns.report(report(made.gateway.guildId));
    made.gateway.failing.set('deleteMessage', new Error('Discord is away'));
    made.spawnTimers[0]?.run();
    await until(() => made.spawnTimers.length === 2);
    expect(made.spawnTimers[1]?.ms).toBe(DELETE_AGAIN_MS);
    expect(DELETE_AGAIN_MS).toBe(60_000);
    // It still counts as waiting: a shutdown meanwhile would try as well.
    expect(made.spawns.pending).toBe(1);
    made.spawnTimers[1]?.run();
    await until(() => made.spawns.pending === 0);
    await made.spawns.flush();
    expect(made.spawnTimers).toHaveLength(2);
    expect(
      made.entries.filter((entry) => entry.msg === 'could not delete a spawn report'),
    ).toHaveLength(1);
    // The second try works when Discord is back.
    const other = await partyServiceWith();
    await other.spawns.report(report(other.gateway.guildId));
    other.gateway.failing.set('deleteMessage', new Error('Discord is away'));
    other.spawnTimers[0]?.run();
    await until(() => other.spawnTimers.length === 2);
    other.gateway.failing.delete('deleteMessage');
    other.spawnTimers[1]?.run();
    await until(() => other.gateway.deleted.length === 1);
    expect(other.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('takes no report once it is shut down, and says how many reports it could not remove', async () => {
    const made = await partyServiceWith();
    await made.spawns.report(report(made.gateway.guildId));
    await made.spawns.report(report(made.gateway.guildId));
    made.gateway.failing.set('deleteMessage', new Error('Discord is away'));
    await made.spawns.flush();
    expect(
      made.entries.filter(
        (entry) => entry.msg === 'spawn reports could not be removed at shutdown and stay',
      ),
    ).toMatchObject([{ level: 40, standing: 2 }]);
    made.gateway.failing.delete('deleteMessage');
    const before = made.gateway.messagesIn(WEST_CHANNEL).length;
    expect(await made.spawns.report(report(made.gateway.guildId))).toEqual({ kind: 'closed' });
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(before);
    expect(made.spawns.pending).toBe(0);
  });

  /**
   * A service over the fake gateway whose sends and deletions wait until `release` is called,
   * and whose timers the test fires.
   */
  async function held() {
    const made = await partyServiceWith();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const timers: (() => void)[] = [];
    const told: unknown[] = [];
    const waited = { sends: 0, deletions: 0 };
    const service = new SpawnService({
      gateway: {
        sendMessage: async (channelId, message) => {
          waited.sends += 1;
          await gate;
          return made.gateway.sendMessage(channelId, message);
        },
        deleteMessage: async (channelId, messageId) => {
          waited.deletions += 1;
          await gate;
          return made.gateway.deleteMessage(channelId, messageId);
        },
        findChannel: (near, name) => made.gateway.findChannel(near, name),
        mayPost: (channelId) => made.gateway.mayPost(channelId),
      },
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      notify: { spawnReported: (news) => told.push(news) },
      settings: made.settings,
      log: made.log,
      setTimer: (run) => {
        timers.push(run);
        return () => undefined;
      },
    });
    return { made, service, release, timers, told, waited };
  }

  it('deletes at once a report whose send was on its way at shutdown, and answers that it is closed', async () => {
    const { made, service, release, timers, told, waited } = await held();
    const reporting = service.report(report(made.gateway.guildId));
    await until(() => waited.sends === 1);
    const flushing = service.flush();
    release();
    expect(await reporting).toEqual({ kind: 'closed' });
    await flushing;
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(made.gateway.deleted).toHaveLength(1);
    expect(service.pending).toBe(0);
    expect(timers).toEqual([]);
    expect(told).toEqual([]);
  });

  it('says so when a deletion that was on its way at shutdown fails', async () => {
    const { made, service, release, timers, waited } = await held();
    release();
    await service.report(report(made.gateway.guildId));
    // The deletion at its time is on its way when the bot shuts down, and fails.
    let fail: () => void = () => undefined;
    const failing = new Promise<void>((resolve) => {
      fail = resolve;
    });
    const deleteMessage = made.gateway.deleteMessage.bind(made.gateway);
    made.gateway.deleteMessage = async () => {
      await failing;
      throw new Error('Discord is away');
    };
    timers[0]?.();
    await until(() => waited.deletions === 1);
    const flushing = service.flush();
    fail();
    await flushing;
    made.gateway.deleteMessage = deleteMessage;
    expect(
      made.entries.filter((entry) => entry.msg === 'could not delete a spawn report'),
    ).toMatchObject([{ level: 40, channel: WEST_CHANNEL }]);
    // Nothing is tried a minute later: the bot is gone by then.
    expect(timers).toHaveLength(1);
    expect(service.pending).toBe(0);
  });

  it('deletes a report by its own timer, after the time it is given', async () => {
    const made = await partyServiceWith();
    const service = new SpawnService({
      gateway: made.gateway,
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      settings: made.settings,
      log: made.log,
      deleteAfterMs: 20,
    });
    await service.report(report(made.gateway.guildId));
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
    expect(service.pending).toBe(1);
    // Nothing but the timer deletes it: no flush.
    await new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const look = (): void => {
        if (made.gateway.deleted.length === 1) resolve();
        else if (Date.now() - started > 5_000) reject(new Error('the report was never deleted'));
        else setTimeout(look, 5);
      };
      look();
    });
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(service.pending).toBe(0);
    expect(SPAWN_MINUTES).toBe(30);
  });

  it('shows the picture of the raid boss feed for a current boss, and the icon of any other Pokémon', async () => {
    const made = await partyServiceWith();
    const service = new SpawnService({
      gateway: made.gateway,
      raidBosses: raidBossesFixture(),
      gameData: { catalogue: catalogueFixture(), icons: iconsFixture() },
      settings: made.settings,
      log: made.log,
      setTimer: () => () => undefined,
    });
    const boss = raidBossesFixture()
      .bosses()
      .find((one) => one.entry?.key === 'gastly');
    expect(boss?.image).toBeDefined();
    await service.report(
      report(made.gateway.guildId, { pokemon: { dex: 92, key: 'gastly', name: 'Gastly' } }),
    );
    await service.report(report(made.gateway.guildId));
    await service.report(
      report(made.gateway.guildId, { pokemon: { dex: 201, key: 'unown_f', name: 'Unown (F)' } }),
    );
    await service.report(
      report(made.gateway.guildId, { pokemon: { dex: 99_999, key: 'nomon', name: 'Nomon' } }),
    );
    const pictures = made.gateway
      .messagesIn(WEST_CHANNEL)
      .map((posted) => posted.message.embeds?.[0]?.thumbnail?.url);
    expect(pictures).toEqual([
      boss?.image,
      'https://cdn.leekduck.com/assets/img/pokemon_icons/pm147.icon.png',
      'https://cdn.leekduck.com/assets/img/pokemon_icons/pm201.fUNOWN_F.icon.png',
      undefined,
    ]);
    // Without a list of icons only the feed's pictures are known, as before.
    const bare = new SpawnService({
      gateway: made.gateway,
      raidBosses: raidBossesFixture(),
      gameData: { catalogue: catalogueFixture() },
      settings: made.settings,
      log: made.log,
      setTimer: () => () => undefined,
    });
    await bare.report(report(made.gateway.guildId));
    expect(made.gateway.messagesIn(WEST_CHANNEL).at(-1)?.message.embeds?.[0]?.thumbnail).toBe(
      undefined,
    );
  });

  it('hands the notifier what it posted, with the time of the report', async () => {
    const made = await partyServiceWith();
    const told: unknown[] = [];
    const service = new SpawnService({
      gateway: made.gateway,
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      notify: { spawnReported: (news) => told.push(news) },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
    });
    await service.report(report(made.gateway.guildId, { iv: 'zero' }));
    expect(told).toEqual([
      {
        ...report(made.gateway.guildId, { iv: 'zero' }),
        messageId: made.gateway.messagesIn(WEST_CHANNEL)[0]?.id,
        eventAt: made.clock.now,
        view: {
          pokemon: 'Dratini',
          iv: 'zero',
          details: 'by the fountain',
          reporter: { id: ALICE, name: 'Alice' },
          image: undefined,
        },
      },
    ]);
    await service.flush();
    expect(UNOWN_DEX).toBe(201);
  });
});

describe('the messages of a spawn report', () => {
  const view: SpawnView = {
    pokemon: 'Dratini',
    details: null,
    reporter: { id: ALICE, name: 'Alice' },
  };

  it('has the warning alone when nothing was said about where', () => {
    expect(spawnEmbed(view)).toEqual({ color: 0x2ecc71, description: SPAWN_WARNING });
    expect(spawnEmbed({ ...view, details: '   ' }).description).toBe(SPAWN_WARNING);
  });

  it('names the reporter with the mention in the server and by name alone elsewhere', () => {
    expect(spawnMessage(view).content).toBe(
      `A wild **Dratini** has been reported by **Alice** (<@${ALICE}>):`,
    );
    expect(spawnMessage(view).embeds?.[0]?.footer).toEqual({ text: SPAWN_FOOTER });
    expect(spawnSentence({ ...view, iv: 'zero' }, WEST_CHANNEL)).toBe(
      `A wild **Dratini** with 0% IVs has been reported in <#${WEST_CHANNEL}> by **Alice**:`,
    );
    // A direct message ends with the address of the report instead.
    const link = postLink('412345678901234567', WEST_CHANNEL, '900000000000000001');
    expect(spawnSentence({ ...view, iv: 'perfect' }, WEST_CHANNEL, link)).toBe(
      `A wild **Dratini** with 100% IVs has been reported in <#${WEST_CHANNEL}> by **Alice**: ${link}`,
    );
    expect(sightingMessage(view, WEST_CHANNEL).embeds?.[0]?.footer).toBeUndefined();
  });

  it('shows the picture when there is one', () => {
    expect(spawnEmbed({ ...view, image: 'https://example.com/pm147.png' }).thumbnail).toEqual({
      url: 'https://example.com/pm147.png',
    });
  });
});
```

Apply to `test/support/fake-gateway.ts`:

```diff
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -471,10 +471,13 @@ export class FakePartyGateway implements PartyGateway {
     return this.channelNames.get(channelId);
   }
 
-  /** Every channel of the fake is in the one server: the channel named so in `channelNames`. */
+  /**
+   * Every channel of the fake is in the one server: the channel named so in `channelNames`,
+   * and like the real gateway only one in which the bot may post embeds (`noEmbeds`).
+   */
   findChannel(_nearChannelId: string, name: string): string | undefined {
     for (const [id, known] of this.channelNames) {
-      if (known === name && !this.gone.has(id)) return id;
+      if (known === name && !this.gone.has(id) && !this.noEmbeds.has(id)) return id;
     }
     return undefined;
   }
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -27,6 +27,7 @@ import {
   type TrainRequest,
 } from '../../src/services/party-service.js';
 import { NotifyService, type NotifyServiceOptions } from '../../src/services/notify-service.js';
+import { SpawnService } from '../../src/services/spawn-service.js';
 import { RecordingDms } from './dms.js';
 import { FakePartyGateway } from './fake-gateway.js';
 import { MemoryGymTargets } from './gym-targets.js';
@@ -198,7 +199,9 @@ export function restarted(made: Outliving, overrides: ServiceOverrides = {}) {
  * `notify` is the notifier over the same store, told by the services as in the bot: who wants
  * something is in `wants`, `gymTargets` and `newTrains` (nobody, until a test says so), everybody is a
  * member of the server and sees what the fake gateway lets them see (`members`), and what would
- * be sent is only recorded (`dms`). It works on the side: `notify.flush()` waits.
+ * be sent is only recorded (`dms`). It works on the side: `notify.flush()` waits. `spawns` is
+ * the service of `/wild` over the same gateway; its deletion timers never run by themselves
+ * (`spawnTimers`).
  *
  * `kept` is what outlives a restart (see `restarted`).
  */
@@ -279,6 +282,24 @@ export async function partyServiceWith(
     ...notifying,
   });
   service.announceTo(notify);
+  /** The timers of the spawn reports that wait for their deletion: a test fires them by hand. */
+  const spawnTimers: { run: () => void; ms: number; cancelled: boolean }[] = [];
+  const spawns = new SpawnService({
+    gateway,
+    raidBosses: overrides.raidBosses ?? raidBossesFixture(),
+    gameData: overrides.gameData ?? { catalogue: catalogueFixture() },
+    notify,
+    settings: overrides.settings ?? settings,
+    log,
+    now,
+    setTimer: (run, ms) => {
+      const timer = { run, ms, cancelled: false };
+      spawnTimers.push(timer);
+      return () => {
+        timer.cancelled = true;
+      };
+    },
+  });
   const lines = new PartyLines({
     gateway,
     active: (postId) => store.byPost(postId) !== undefined,
@@ -363,6 +384,8 @@ export async function partyServiceWith(
     routes,
     scheduler,
     notify,
+    spawns,
+    spawnTimers,
     wants,
     gymTargets,
     newTrains,
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -7,6 +7,7 @@ import type { DB } from '../../src/db/types.js';
 import type { AttendanceService } from '../../src/services/attendance-service.js';
 import type { PartyService } from '../../src/services/party-service.js';
 import type { RaidChangeService } from '../../src/services/raid-change-service.js';
+import type { SpawnService } from '../../src/services/spawn-service.js';
 import type { TimedPartyService } from '../../src/services/timed-party-service.js';
 import type { TrainService } from '../../src/services/train-service.js';
 import { FAKE_GUILD_ID } from './fake-interactions.js';
@@ -87,6 +88,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'trains',
       'pass { trains, partyService, parties, regions } from partyServiceWith()',
     ),
+    spawns: unavailable<SpawnService>(
+      'spawns',
+      'pass { spawns } from partyServiceWith(), or a SpawnService over a fake gateway',
+    ),
     // Every click is answered by itself; a test of bursts passes its own with a window.
     clickAnswers: new ClickAnswers({ log, windowMs: 0 }),
     // Searches the catalogue of the context's own game data, built when first used.
```

Run: `npx vitest run --project unit src/commands/notifications/wild.test.ts src/services/spawn-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -21,6 +21,7 @@ import type { RaidBossProvider } from './services/raid-boss-service.js';
 import type { RaidChangeService } from './services/raid-change-service.js';
 import type { RaidEventProvider } from './services/raid-event-service.js';
 import type { RegionProvider } from './services/region-directory.js';
+import type { SpawnService } from './services/spawn-service.js';
 import type { MapProvider } from './services/static-maps.js';
 import type { TimedPartyService } from './services/timed-party-service.js';
 import type { TrainService } from './services/train-service.js';
@@ -67,6 +68,8 @@ export interface AppContext {
   readonly newTrains: NewTrainStorage;
   /** Members of a server other than the one who is acting: one by id, or who of many can see a channel. */
   readonly members: MemberDirectory;
+  /** Reports of wild Pokémon: the message in the region's channel and its removal. */
+  readonly spawns: SpawnService;
   /** Direct messages: put in line, and sent at a fixed rate. */
   readonly dms: DmSender;
   /** Pokémon by what members type: names, nicknames, forms. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -48,6 +48,7 @@ import { TimedPartyService } from './services/timed-party-service.js';
 import { TrainService } from './services/train-service.js';
 import { RaidEventService } from './services/raid-event-service.js';
 import { RegionDirectory } from './services/region-directory.js';
+import { SpawnService } from './services/spawn-service.js';
 import { StaticMaps } from './services/static-maps.js';
 import { createShutdown } from './shutdown.js';
 
@@ -164,6 +165,14 @@ export async function startApp(
     log,
   });
   partyService.announceTo(notify);
+  const spawns = new SpawnService({
+    gateway: partyGateway,
+    raidBosses,
+    gameData,
+    notify,
+    settings: config.settings,
+    log,
+  });
   const lines = new PartyLines({
     gateway: partyGateway,
     active: (postId) => parties.byPost(postId) !== undefined,
@@ -278,6 +287,7 @@ export async function startApp(
     gymTargets,
     newTrains,
     members,
+    spawns,
     dms,
     pokemon,
     maps,
@@ -376,6 +386,8 @@ export async function startApp(
       { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
       { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
       { name: 'forum access', timeoutMs: 5_000, run: () => access.flush() },
+      // The spawn reports that wait for their half hour are deleted now: they would stay for good.
+      { name: 'spawn reports', timeoutMs: 5_000, run: () => spawns.flush() },
       // Whoever is still being looked up for an event is put in line before the line is drained.
       { name: 'notifications', timeoutMs: 5_000, run: () => notify.close() },
       // Direct messages go on at their usual rate for ten seconds (spec 9); the rest is dropped.
```

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -10,6 +10,7 @@ import { cancelMeet, meet } from './parties/meet.js';
 import { name } from './parties/name.js';
 import { target, targets, untarget, untargetAll } from './notifications/targets.js';
 import { unwant, unwantAll, want, wants } from './notifications/wants.js';
+import { wildCommand } from './notifications/wild.js';
 import { shout } from './parties/shout.js';
 import { status, where } from './parties/status.js';
 import { boss, moveset } from './raids/boss.js';
@@ -67,6 +68,7 @@ export const commands: readonly CommandModule[] = [
   untarget,
   targets,
   untargetAll,
+  wildCommand,
   friendCode,
   nickname,
   admin,
```

Create `src/commands/notifications/wild.ts`:

```ts
import { SlashCommandBuilder } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Guard, SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import type { Throttle } from '../../discord/throttle.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import { postLink } from '../../render/notify-dm.js';
import { IV_WORDS, SPAWN_MINUTES } from '../../render/spawn.js';
import { plain, truncate } from '../../render/text.js';
import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';

/** Where `/wild` works, said wherever it does not. */
export const FROM_A_REGION =
  'Report a wild Pokémon from the channel of a region, its forum or a post there.';

/** Said when the text channel of the region no longer exists. */
export const CHANNEL_GONE =
  'The channel of this region is gone, so I cannot post the report. Tell a moderator.';

/** Said for a report that comes while the bot shuts down. */
export const RESTARTING =
  'I am restarting just now, so the report was not made. Report it again in a minute.';

/** As the legacy bot allowed. */
export const WILD_THROTTLE: Throttle = { uses: 15, perSeconds: 900 };

/** As much as a member may say about where it is. */
export const MAX_DETAILS = 200;

const IV_CHOICES = [
  { name: 'Perfect (100%)', value: 'perfect' },
  { name: 'Zero (0%)', value: 'zero' },
] as const;

/** As many Pokémon as a refusal suggests. */
const SUGGESTIONS = 5;

/** "A, B or C". */
function orList(names: readonly string[]): string {
  const rest = [...names];
  const last = rest.pop() ?? '';
  return rest.length === 0 ? last : `${rest.join(', ')} or ${last}`;
}

/** Whether an entry can be met in the wild at all: a mega cannot. */
const wild = (entry: PokemonEntry): boolean => entry.kind !== 'mega';

/**
 * The Pokémon the `pokemon` option names: a choice of the list (the key of its entry), or text
 * that names one entry outright (`ctx.pokemon.exact`). Any Pokémon the game data has can be
 * reported, a form as that form; a mega is refused. Text that names nothing outright is never
 * guessed at: what it may have meant is only suggested.
 */
export function wildPokemon(ctx: AppContext, value: string): PokemonEntry {
  const text = value.trim();
  const picked = /^[a-z0-9_]+$/i.test(text)
    ? ctx.gameData.catalogue.byKey(text.toLowerCase())
    : undefined;
  const entry = picked ?? ctx.pokemon.exact(text);
  if (entry && !wild(entry)) {
    throw new UserError(`${plain(entry.name)} is a mega: those are met in raids, not in the wild.`);
  }
  if (entry) return entry;
  const names = ctx.pokemon
    .search(text, { limit: SUGGESTIONS * 4 })
    .filter(wild)
    .slice(0, SUGGESTIONS)
    .map((found) => plain(found.name));
  throw new UserError(
    `I do not know "${plain(truncate(text, 80))}" as a Pokémon. ` +
      (names.length === 0 ? '' : `Did you mean ${orList(names)}? `) +
      'Pick one from the list that appears while you type.',
  );
}

/** The choices for the `pokemon` option: what the search finds, megas left out. */
export function wildChoices(ctx: AppContext, typed: string): Choice[] {
  if (typed.trim() === '') return [];
  return ctx.pokemon
    .search(typed, { limit: MAX_CHOICES * 2 })
    .filter(wild)
    .slice(0, MAX_CHOICES)
    .map((entry) => ({ name: truncate(entry.name, CHOICE_NAME), value: entry.key }));
}

/**
 * What can be known before anything is posted is refused here, so that a use that came to
 * nothing does not count against the limit: the place, and the Pokémon.
 */
const requireSpawnReport: Guard = (interaction, ctx) => {
  if (regionChannelOf(interaction, ctx) === undefined) throw new UserError(FROM_A_REGION);
  if (interaction.isChatInputCommand()) {
    wildPokemon(ctx, interaction.options.getString('pokemon', true));
  }
};

/**
 * `/wild` (spec 4.2, there still `/spawn`; the legacy `!spawn`, `!wild`): reports a wild
 * Pokémon in the region the command is used in. The report is a public message in the region's
 * text channel, also when the command is used in the region's forum or a post there, which is
 * deleted after half an hour; who wants that Pokémon is told by direct message where
 * notifications are on.
 */
export const wildCommand: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('wild')
    .setDescription('Report a wild Pokémon in this region')
    .addStringOption((option) =>
      option
        .setName('pokemon')
        .setDescription('The Pokémon: pick from the list that appears while you type')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('details')
        .setDescription('Where it is: a street corner, a park, a gym nearby')
        .setMaxLength(MAX_DETAILS),
    )
    .addStringOption((option) =>
      option
        .setName('iv')
        .setDescription('Only if you checked: its IVs are perfect or zero')
        .addChoices(IV_CHOICES.map(({ name, value }) => ({ name, value }))),
    ),
  help: {
    category: 'notifications',
    details:
      'Tells the region about a Pokémon you met in the wild. Use it in the channel of a ' +
      'region (or in its forum or a post there): the report goes into the region’s channel ' +
      `and is removed after ${String(SPAWN_MINUTES)} minutes, because spawns do not last. ` +
      'Members who put that Pokémon on their list with `/want` get a direct message. Any ' +
      'Pokémon can be reported, a form as that form (`Alolan Rattata`). `details` says where ' +
      'it is; `iv` says that you checked it and its IVs are perfect or zero, which also ' +
      'tells the members who asked for those.',
    examples: [
      '/wild pokemon:Dratini details:by the fountain on Market Street',
      '/wild pokemon:Larvitar details:Riverside Park iv:Perfect (100%)',
    ],
  },
  guards: [requireGuild, requireSpawnReport],
  defer: 'ephemeral',
  throttle: WILD_THROTTLE,

  async execute(interaction, ctx) {
    const regionChannelId = regionChannelOf(interaction, ctx);
    if (regionChannelId === undefined) throw new UserError(FROM_A_REGION);
    const entry = wildPokemon(ctx, interaction.options.getString('pokemon', true));
    const details = interaction.options.getString('details')?.trim() ?? '';
    const picked = interaction.options.getString('iv');
    const iv = IV_CHOICES.find((choice) => choice.value === picked)?.value;
    const guildId = guildIdOf(interaction);
    const outcome = await ctx.spawns.report({
      guildId,
      regionChannelId,
      pokemon: { dex: entry.dex, key: entry.key, name: entry.name },
      details: details === '' ? null : truncate(details, MAX_DETAILS),
      iv,
      reporter: { id: interaction.user.id, name: memberInfo(interaction).name },
    });
    if (outcome.kind === 'no-channel') throw new UserError(CHANNEL_GONE);
    if (outcome.kind === 'refused') {
      throw new UserError(
        `I am not allowed to post in <#${regionChannelId}>, so the report was not made. ` +
          'Tell a moderator.',
      );
    }
    if (outcome.kind === 'closed') throw new UserError(RESTARTING);
    // What was reported, IVs included: the member sees whether the choice was taken.
    const ivs = iv === undefined ? '' : ` with ${IV_WORDS[iv]}`;
    await interaction.editReply({
      content:
        `Reported: a wild ${plain(entry.name)}${ivs} in <#${regionChannelId}>. ` +
        `${postLink(guildId, outcome.channelId, outcome.messageId)}\n` +
        `The report is removed in ${String(SPAWN_MINUTES)} minutes.`,
    });
  },

  async autocomplete(interaction, ctx) {
    await interaction.respond(wildChoices(ctx, interaction.options.getFocused()));
  },
};
```

Create `src/render/spawn.ts`:

```ts
import type { APIEmbed } from 'discord.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import { memberName, memberText, plain, type NamedMember } from './text.js';

/** The colour of a spawn report, as the legacy bot's. */
export const SPAWN_COLOUR = 0x2ecc71;

/** How long a spawn report stays in the region's channel. */
export const SPAWN_MINUTES = 30;

/** The legacy bot's sentence about what a report of a spawn is worth. */
export const SPAWN_WARNING =
  '**Warning: Spawns are user-reported. There is no way to know exactly how long a Pokémon ' +
  'will be there. Most spawns are 30 min. Use your discretion when chasing them.**';

/** What the public message has in the place of the legacy bot's second line about `!want`. */
export const SPAWN_FOOTER = '/want tells you of spawns like this one · /wild reports one';

/** A reported wild Pokémon as it is shown. */
export interface SpawnView {
  /** The Pokémon's name as the game data has it. */
  pokemon: string;
  /** Set when the reporter says its IVs are perfect or zero. */
  iv?: 'perfect' | 'zero' | undefined;
  /** Where it is, as the member typed it; null when they said nothing. */
  details: string | null;
  reporter: NamedMember;
  /** The address of the Pokémon's picture, when one is known. */
  image?: string | undefined;
}

/** How the IVs a reporter checked are said: `100% IVs`, `0% IVs`. */
export const IV_WORDS = { perfect: '100% IVs', zero: '0% IVs' } as const;

/** `**Dratini**`, `**Dratini** with 100% IVs`. */
function spawnName(view: Pick<SpawnView, 'pokemon' | 'iv'>): string {
  const ivs = view.iv === undefined ? '' : ` with ${IV_WORDS[view.iv]}`;
  return `**${plain(view.pokemon)}**${ivs}`;
}

/**
 * The embed of a spawn report: where it is, in the member's words made plain (the legacy bot
 * posted them raw, and they could ping), the warning, and the Pokémon's picture.
 */
export function spawnEmbed(view: SpawnView, footer?: string): APIEmbed {
  const details = view.details === null ? '' : plain(view.details);
  return {
    color: SPAWN_COLOUR,
    description: details === '' ? SPAWN_WARNING : `${details}\n\n${SPAWN_WARNING}`,
    ...(view.image === undefined ? {} : { thumbnail: { url: view.image } }),
    ...(footer === undefined ? {} : { footer: { text: footer } }),
  };
}

/**
 * The public message in the region's text channel: who reported what, in a sentence that pings
 * nobody, with the embed. It is deleted after `SPAWN_MINUTES`.
 */
export function spawnMessage(view: SpawnView): OutgoingMessage {
  return {
    content: `A wild ${spawnName(view)} has been reported by ${memberText(view.reporter)}:`,
    embeds: [spawnEmbed(view, SPAWN_FOOTER)],
  };
}

/**
 * The public message for a channel in which the bot may not post embeds (Discord would show
 * the message without its embed, and the report without where it is): everything as text, the
 * footer in small print, no picture.
 */
export function spawnTextMessage(view: SpawnView): OutgoingMessage {
  const { content = '' } = spawnMessage(view);
  const { description = '' } = spawnEmbed(view);
  return { content: `${content}\n${description}\n-# ${SPAWN_FOOTER}` };
}

/**
 * The sentence where the region has to be named: in a direct message, and in the channel for
 * Unown sightings. The reporter is named by name alone, as in every direct message. With
 * `link` (the address of the report in the region's channel, for a direct message) it ends
 * with that; without, with the colon the embed follows.
 */
export function spawnSentence(view: SpawnView, regionChannelId: string, link?: string): string {
  return (
    `A wild ${spawnName(view)} has been reported in <#${regionChannelId}> ` +
    `by **${memberName(view.reporter)}**:${link === undefined ? '' : ` ${link}`}`
  );
}

/** The message in the server's channel for Unown sightings, which stays. */
export function sightingMessage(view: SpawnView, regionChannelId: string): OutgoingMessage {
  return { content: spawnSentence(view, regionChannelId), embeds: [spawnEmbed(view)] };
}
```

Apply to `src/services/notify-service.ts`:

```diff
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -12,6 +12,8 @@ import {
   raidNumbers,
   raidWantsFiring,
   reasonKey,
+  spawnNumbers,
+  spawnWantsFiring,
   type NotifyReason,
   type RaidSighting,
 } from '../domain/notify/reasons.js';
@@ -47,6 +49,7 @@ import {
   type ShownReason,
 } from '../render/notify-dm.js';
 import { gymName, shownBoss, type PostGym } from '../render/raid-post.js';
+import { SPAWN_MINUTES, spawnEmbed, spawnSentence } from '../render/spawn.js';
 import { clockOrDate, clockOrDay, plain, type NamedMember } from '../render/text.js';
 import { DM_PRIORITY, type DmPriority, type DmSender } from './dm-sender.js';
 import type { GameDataProvider } from './game-data-service.js';
@@ -55,6 +58,7 @@ import { KeyedLock } from './keyed-lock.js';
 import type { PartyStore } from './party-store.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 import type { RegionProvider } from './region-directory.js';
+import type { SpawnNews } from './spawn-service.js';
 
 /**
  * What the services that change parties tell the notifier, each from the one place that knows
@@ -163,8 +167,8 @@ interface Announcement {
   key: string;
   /** The party it is about; undefined for what is about none (a spawn). */
   partyId: string | undefined;
-  /** Row id of the server. */
-  guildRowId: number;
+  /** The server: its row id (a party names it so), or its snowflake where that is known. */
+  guild: number | string;
   /** The channel a recipient must be able to view. */
   channelId: string;
   /** The member who caused it, who is not told. */
@@ -226,6 +230,8 @@ export class NotifyService implements PartyNotifier {
   private readonly snowflakes = new Map<number, string>();
   /** Set at shutdown (`close`): nothing new is taken, and nothing in flight begins a batch. */
   private closed = false;
+  /** Counts the spawn reports: each is an event of its own, none waits for another. */
+  private spawns = 0;
   /** The meeting times of raid groups whose message waits for its delay, by party and group. */
   private readonly meetings: Gathered<PendingMeeting>;
 
@@ -350,7 +356,7 @@ export class NotifyService implements PartyNotifier {
     this.announce({
       key: party.id,
       partyId: party.id,
-      guildRowId: party.guildId,
+      guild: party.guildId,
       channelId: forumChannelId,
       actorId,
       eventAt,
@@ -437,6 +443,60 @@ export class NotifyService implements PartyNotifier {
     });
   }
 
+  /**
+   * A wild Pokémon was reported (`SpawnService`): who wants it in the wild, and with perfect
+   * or zero IVs who asked for those, is told when they can view the region's text channel;
+   * not the reporter. A spawn is no party: nothing is remembered, every report is news.
+   */
+  spawnReported(news: SpawnNews): void {
+    this.safely('a spawn', () => {
+      this.announceSpawn(news);
+    });
+  }
+
+  private announceSpawn(news: SpawnNews): void {
+    if (!this.enabled) return;
+    const { wants, gameData } = this.options;
+    const spawn = { pokemon: news.pokemon, iv: news.iv };
+    const embed = spawnEmbed(news.view);
+    this.spawns += 1;
+    this.announce({
+      key: `spawn:${String(this.spawns)}`,
+      partyId: undefined,
+      guild: news.guildId,
+      channelId: news.regionChannelId,
+      actorId: news.reporter.id,
+      eventAt: news.eventAt,
+      // The report itself is gone from the channel by then.
+      expiresAt: news.eventAt + SPAWN_MINUTES * 60_000,
+      gather: async (guildId) => {
+        const wanting = new Map<string, readonly Want[]>();
+        for (const found of await wants.wanting(guildId, spawnNumbers(spawn))) {
+          wanting.set(found.memberId, found.wants);
+        }
+        return {
+          ids: [...wanting.keys()],
+          reasonsOf: (id) =>
+            spawnWantsFiring(gameData.catalogue, wanting.get(id) ?? [], spawn).map(
+              (target): NotifyReason => ({ kind: 'want', target }),
+            ),
+        };
+      },
+      message: (guildId, reasons) =>
+        notifyDm(
+          // It ends with the address of the report: the place to look, and to answer.
+          spawnSentence(
+            news.view,
+            news.regionChannelId,
+            postLink(guildId, news.regionChannelId, news.messageId),
+          ),
+          reasons.map((reason) => this.shown(guildId, reason)),
+          embed,
+        ),
+      priority: () => DM_PRIORITY.spawn,
+    });
+  }
+
   /**
    * The legacy bot's direct message about a time to meet at, to these members of a party: no
    * reasons, no button, no opt-out, and before everything that is only news.
@@ -455,7 +515,7 @@ export class NotifyService implements PartyNotifier {
       // never wait behind an event of their party whose members are still being looked up.
       key: `${party.id}:times`,
       partyId: party.id,
-      guildRowId: party.guildId,
+      guild: party.guildId,
       channelId: forumChannelId,
       actorId: by.id,
       toAll: true,
@@ -511,7 +571,7 @@ export class NotifyService implements PartyNotifier {
     this.announce({
       key: party.id,
       partyId: party.id,
-      guildRowId: party.guildId,
+      guild: party.guildId,
       channelId: forumChannelId,
       actorId,
       eventAt,
@@ -712,7 +772,8 @@ export class NotifyService implements PartyNotifier {
     if ((this.closed && !event.toAll) || !this.alive(event) || this.now() >= event.expiresAt) {
       return;
     }
-    const guildId = await this.guildSnowflake(event.guildRowId);
+    const guildId =
+      typeof event.guild === 'string' ? event.guild : await this.guildSnowflake(event.guild);
     if (guildId === undefined) return;
     const { ids, reasonsOf } = await event.gather(guildId);
     /** The message per set of reasons; null for a set whose message could not be made. */
```

Create `src/services/spawn-service.ts`:

```ts
import type { Settings } from '../config/settings.js';
import { isMissingPermission, type PartyGateway } from '../discord/party-gateway.js';
import type { Logger } from '../log.js';
import {
  sightingMessage,
  SPAWN_MINUTES,
  spawnMessage,
  spawnTextMessage,
  type SpawnView,
} from '../render/spawn.js';
import type { NamedMember } from '../render/text.js';
import { pokemonPicture } from '../domain/pogo/pokemon-icons.js';
import type { GameDataProvider } from './game-data-service.js';
import type { RaidBossProvider } from './raid-boss-service.js';

/** The Pokédex number of Unown, whose sightings a server may collect in a channel of their own. */
export const UNOWN_DEX = 201;

/** A wild Pokémon as a member reported it with `/wild`. */
export interface SpawnReport {
  /** Snowflake of the server. */
  guildId: string;
  /** The text channel of the region it was reported in. */
  regionChannelId: string;
  /** The catalogue entry that was reported. */
  pokemon: { dex: number; key: string; name: string };
  /** Where it is, as typed; null when nothing was said. */
  details: string | null;
  iv?: 'perfect' | 'zero' | undefined;
  reporter: NamedMember;
}

/** What members are told about a spawn (`NotifyService.spawnReported`). */
export interface SpawnNews extends SpawnReport {
  view: SpawnView;
  /** The report in the region's channel: a direct message links to it. */
  messageId: string;
  eventAt: number;
}

export type SpawnOutcome =
  /** The report stands in the region's channel, as this message. */
  | { kind: 'posted'; channelId: string; messageId: string }
  /** The region's channel is gone. */
  | { kind: 'no-channel' }
  /** Discord refused the message: the bot may not post in the region's channel, or not see it. */
  | { kind: 'refused' }
  /** The bot is shutting down: nothing is posted any more. */
  | { kind: 'closed' };

/** How long after a deletion that failed at its time it is tried once more. */
export const DELETE_AGAIN_MS = 60_000;

export interface SpawnServiceOptions {
  /**
   * The few things spawn reports ask of Discord are all things the party gateway does (send
   * and delete a message, find a channel by name where the bot may post embeds, ask whether it
   * may post embeds in one), with a fake that is as strict: no port of their own.
   */
  gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage' | 'findChannel' | 'mayPost'>;
  /** The pictures of the Pokémon that are raid bosses now: what the feed shows wins. */
  raidBosses: Pick<RaidBossProvider, 'bosses'>;
  /** The catalogue and the icon files that exist: the picture of every other Pokémon. */
  gameData: GameDataProvider;
  /** Told of every report that was posted, to tell who wants that Pokémon. */
  notify?: { spawnReported(news: SpawnNews): void };
  settings: Settings;
  log: Logger;
  now?: () => number;
  /** How long a report stands before it is deleted. Default `SPAWN_MINUTES`. */
  deleteAfterMs?: number;
  /**
   * Starts the timer that deletes a report and gives the function that cancels it. Default:
   * `setTimeout`, unref'd. A test passes its own to fire the timer by hand.
   */
  setTimer?: (run: () => void, ms: number) => () => void;
}

/**
 * Reports of wild Pokémon (`/wild`): a public message in the text channel of the region, which
 * is deleted after half an hour (a spawn is gone by then), and the direct messages to who wants
 * that Pokémon, which the notifier sends. Where the bot may not post embeds the report goes out
 * as text.
 *
 * The messages that wait for their deletion are kept in memory only. A graceful shutdown
 * deletes them at once (`flush`) and takes no report from then on (one whose message was on
 * its way to Discord just then is deleted as soon as it is there, and answered as closed);
 * after a crash they stay, which is accepted. A deletion that fails at its time is tried once
 * more a minute later, unless the bot shuts down meanwhile: then the failure is said.
 *
 * Unown is a species like any other (Matt, 2026-10-12): the region message and the direct
 * messages as for every Pokémon. Where the server has the channel for Unown sightings
 * (`settings.channels.unown`, found by name, only where the bot may post embeds) the report
 * is also posted there, and stays. No role is assigned or pinged and nothing is pinned.
 */
export class SpawnService {
  private readonly now: () => number;
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  /** The reports that wait for their deletion, by message. */
  private readonly waiting = new Map<string, { channelId: string; cancel: () => void }>();
  private readonly deleting = new Set<Promise<boolean>>();
  /** The reports that are being posted: a shutdown waits for them. */
  private readonly posting = new Set<Promise<SpawnOutcome>>();
  private readonly deleteAfterMs: number;
  /** Set at shutdown (`flush`): a report made later would stand for good. */
  private closed = false;

  constructor(private readonly options: SpawnServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.deleteAfterMs = options.deleteAfterMs ?? SPAWN_MINUTES * 60_000;
    this.setTimer =
      options.setTimer ??
      ((run, ms) => {
        const timer = setTimeout(run, ms);
        timer.unref();
        return () => {
          clearTimeout(timer);
        };
      });
  }

  /** How many reports wait for their deletion. */
  get pending(): number {
    return this.waiting.size;
  }

  /**
   * The picture of a Pokémon (`pokemonPicture`): that of the raid boss feed when it is a boss
   * now, otherwise the icon of its catalogue entry; none when neither is known. A report goes
   * out without its picture rather than not at all.
   */
  private pictureOf(key: string): string | undefined {
    const { raidBosses, gameData, log } = this.options;
    try {
      const feed = raidBosses.bosses().find((boss) => boss.entry?.key === key)?.image;
      return pokemonPicture(feed, gameData.catalogue.byKey(key), gameData);
    } catch (err) {
      log.warn({ err, pokemon: key }, 'could not find the picture of a Pokémon');
      return undefined;
    }
  }

  /**
   * Posts a report in the region's channel and has it deleted later; for Unown also in the
   * sightings channel. Throws when the region message cannot be sent for another reason than
   * the outcomes name; what fails after that is logged.
   */
  report(report: SpawnReport): Promise<SpawnOutcome> {
    if (this.closed) return Promise.resolve({ kind: 'closed' });
    const posting: Promise<SpawnOutcome> = this.post(report).finally(() =>
      this.posting.delete(posting),
    );
    this.posting.add(posting);
    return posting;
  }

  private async post(report: SpawnReport): Promise<SpawnOutcome> {
    const { gateway, notify, settings, log } = this.options;
    const view: SpawnView = {
      pokemon: report.pokemon.name,
      iv: report.iv,
      details: report.details,
      reporter: report.reporter,
      image: this.pictureOf(report.pokemon.key),
    };
    const eventAt = this.now();
    // Without the permission to embed Discord would show the sentence alone: as text then.
    const message = gateway.mayPost(report.regionChannelId)
      ? spawnMessage(view)
      : spawnTextMessage(view);
    let messageId: string | undefined;
    try {
      messageId = await gateway.sendMessage(report.regionChannelId, message);
    } catch (err) {
      if (!isMissingPermission(err)) throw err;
      log.warn(
        { err, guild: report.guildId, channel: report.regionChannelId },
        'the bot may not post a spawn report in the channel of a region',
      );
      return { kind: 'refused' };
    }
    if (messageId === undefined) return { kind: 'no-channel' };
    if (this.closed) {
      // The bot began to shut down while the message was on its way: nothing would delete it
      // later, so it goes at once, and nobody is told of it.
      await this.remove(report.regionChannelId, messageId, true);
      return { kind: 'closed' };
    }
    this.deleteLater(report.regionChannelId, messageId, this.deleteAfterMs, true);
    if (report.pokemon.dex === UNOWN_DEX) {
      try {
        const sightings = gateway.findChannel(report.regionChannelId, settings.channels.unown);
        if (sightings !== undefined && sightings !== report.regionChannelId) {
          await gateway.sendMessage(sightings, sightingMessage(view, report.regionChannelId));
        }
      } catch (err) {
        log.warn({ err, guild: report.guildId }, 'could not post an Unown sighting');
      }
    }
    notify?.spawnReported({ ...report, view, messageId, eventAt });
    return { kind: 'posted', channelId: report.regionChannelId, messageId };
  }

  /**
   * Has a report deleted after `ms`. One whose deletion fails then is tried once more
   * `DELETE_AGAIN_MS` later (`again`), and until then still waits: a shutdown tries it too.
   */
  private deleteLater(channelId: string, messageId: string, ms: number, again: boolean): void {
    const cancel = this.setTimer(() => {
      this.waiting.delete(messageId);
      void this.remove(channelId, messageId, !again).then((removed) => {
        if (removed || !again) return;
        if (!this.closed) {
          this.deleteLater(channelId, messageId, DELETE_AGAIN_MS, false);
          return;
        }
        // The bot began to shut down while the deletion was on its way: there is no minute
        // later, and `flush` did not count this report (it no longer waited).
        this.options.log.warn(
          { channel: channelId, message: messageId },
          'could not delete a spawn report',
        );
      });
    }, ms);
    this.waiting.set(messageId, { channelId, cancel });
  }

  /** Deletes a report; false when that failed, which is logged when `last` says nothing follows. */
  private remove(channelId: string, messageId: string, last: boolean): Promise<boolean> {
    const removal: Promise<boolean> = this.options.gateway
      .deleteMessage(channelId, messageId)
      .then(
        () => true,
        (err: unknown) => {
          if (last) {
            this.options.log.warn({ err, channel: channelId }, 'could not delete a spawn report');
          }
          return false;
        },
      )
      .finally(() => this.deleting.delete(removal));
    this.deleting.add(removal);
    return removal;
  }

  /**
   * For shutdown: takes no report from now on, deletes the reports that still wait, now, and
   * waits for every deletion, also that of a report that was being posted. A report that
   * stayed would stand in its channel for good: how many could not be removed is said.
   */
  async flush(): Promise<void> {
    this.closed = true;
    // A report on its way deletes its own message; a send that fails is its caller's to hear.
    await Promise.allSettled(this.posting);
    const removals: Promise<boolean>[] = [];
    for (const [messageId, { channelId, cancel }] of [...this.waiting]) {
      cancel();
      this.waiting.delete(messageId);
      removals.push(this.remove(channelId, messageId, true));
    }
    const standing = (await Promise.all(removals)).filter((removed) => !removed).length;
    if (standing > 0) {
      this.options.log.warn(
        { standing },
        'spawn reports could not be removed at shutdown and stay',
      );
    }
    while (this.deleting.size > 0) await Promise.all(this.deleting);
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/notifications/wild.test.ts src/services/spawn-service.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff a00cd38 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/app-context.ts src/app.ts src/commands/index.ts src/commands/notifications/wild.test.ts src/commands/notifications/wild.ts src/render/spawn.ts src/services/notify-service.ts src/services/spawn-service.test.ts src/services/spawn-service.ts test/support/fake-gateway.ts test/support/party-service.ts test/support/test-context.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/app.ts src/commands/index.ts src/commands/notifications/wild.test.ts src/commands/notifications/wild.ts src/render/spawn.ts src/services/notify-service.ts src/services/spawn-service.test.ts src/services/spawn-service.ts test/support/fake-gateway.ts test/support/party-service.ts test/support/test-context.ts
git commit -m "The spawn report `/wild`, its removal after half an hour, and the Unown channel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 3,261 unit tests.

---

### Task 10: An Unown want for holders of the old role, once per member and server

**Files:**
- Create: `src/db/migrations/2026_10_12_007_unown_want_gifts.ts`, `src/db/repositories/unown-gift-repository.db.test.ts`, `src/db/repositories/unown-gift-repository.ts`, `src/services/unown-want-service.test.ts`, `src/services/unown-want-service.ts`, `test/support/unown-gifts.ts`
- Modify: `src/app.ts`, `src/db/migrations/index.ts`, `src/db/migrator.db.test.ts`, `src/db/types.ts`

**Interfaces:**
- Consumes: Task 2's storages; `ctx.wants`; `memberInfo` and the role names of an interaction; `settings.roles.unown`; the interaction hook of `src/app.ts`.
- Produces: The table `UnownWantGift` (migration `2026_10_12_007_unown_want_gifts`), `UnownGiftRepository` behind `UnownGiftStorage`, `MemoryUnownGifts`; `UnownWantService` (`noticed(interaction)`: synchronous, never throws, costs nothing after a member's first interaction of a run; the want first, the record after; `MET_MEMBERS`, `UNOWN_DEX`); the hook in `src/app.ts` and the shutdown step.

`src/db/types.ts` is generated: apply its diff as written. `migrator.db.test.ts` changes and `unown-gift-repository.db.test.ts` is new.

Reference commit of the prototype for this task: `74c12b0`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/db/migrator.db.test.ts`:

```diff
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -29,6 +29,7 @@ const ADDED_TABLES = [
   'Party',
   'PartyAccessGrant',
   'NewTrainNotification',
+  'UnownWantGift',
 ];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = [
@@ -112,6 +113,7 @@ describe('runMigrations', () => {
       '2026_10_11_004_party_access_grants',
       '2026_10_12_005_pokemon_notification_form',
       '2026_10_12_006_new_train_notifications',
+      '2026_10_12_007_unown_want_gifts',
     ]);
     expect(await describeSchema(database, ADDED_TABLES, ADDED_COLUMNS, ADDED_INDEXES)).toEqual(
       before,
```

Create `src/db/repositories/unown-gift-repository.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { MemoryUnownGifts } from '../../../test/support/unown-gifts.js';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';
import { UnownGiftRepository, type UnownGiftStorage } from './unown-gift-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const NOWHERE = '499999999999999999';
const NOW = 1_800_000_000_000;

describe('UnownGiftRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let gifts: UnownGiftRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    gifts = new UnownGiftRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  const stored = () =>
    db
      .selectFrom('UnownWantGift')
      .select(['guildId', 'memberId', 'createdAt'])
      .orderBy('guildId')
      .orderBy('memberId')
      .execute();

  it('records once per member and server, and keeps the first record as it is', async () => {
    expect(await gifts.given(ALICE, HOME)).toBe(false);
    await gifts.record(ALICE, HOME, NOW);
    await gifts.record(ALICE, HOME, NOW + 5_000);
    expect(await gifts.given(ALICE, HOME)).toBe(true);
    expect(await gifts.given(ALICE, AWAY)).toBe(false);
    expect(await gifts.given(BOB, HOME)).toBe(false);
    expect(await stored()).toEqual([{ guildId: 1, memberId: ALICE, createdAt: String(NOW) }]);
  });

  it('keeps members and servers apart', async () => {
    await gifts.record(ALICE, HOME, NOW);
    await gifts.record(ALICE, AWAY, NOW + 1);
    await gifts.record(BOB, AWAY, NOW + 2);
    expect(await stored()).toEqual([
      { guildId: 1, memberId: ALICE, createdAt: String(NOW) },
      { guildId: 2, memberId: ALICE, createdAt: String(NOW + 1) },
      { guildId: 2, memberId: BOB, createdAt: String(NOW + 2) },
    ]);
  });

  it('records nothing for a server the bot has no row for', async () => {
    await gifts.record(ALICE, NOWHERE, NOW);
    expect(await gifts.given(ALICE, NOWHERE)).toBe(false);
    expect(await stored()).toEqual([]);
  });

  it('makes one row when the same member is recorded many times at once', async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_unused, n) => gifts.record(ALICE, HOME, NOW + n)),
    );
    expect(await stored()).toHaveLength(1);
  });

  it('loses its rows with the server', async () => {
    await gifts.record(ALICE, HOME, NOW);
    await new GuildRepository(db).remove(HOME);
    expect(await stored()).toEqual([]);
  });

  it('behaves as its twin in memory does', async () => {
    const memory = new MemoryUnownGifts(new Set([HOME, AWAY]));
    const script = async (storage: UnownGiftStorage) => [
      await storage.given(ALICE, HOME),
      await storage.record(ALICE, HOME, NOW),
      await storage.record(ALICE, HOME, NOW + 1),
      await storage.record(BOB, AWAY, NOW),
      await storage.record(BOB, NOWHERE, NOW),
      await storage.given(ALICE, HOME),
      await storage.given(ALICE, AWAY),
      await storage.given(BOB, AWAY),
      await storage.given(BOB, NOWHERE),
    ];
    expect(await script(gifts)).toEqual(await script(memory));
  });
});
```

Create `src/services/unown-want-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { MemoryUnownGifts } from '../../test/support/unown-gifts.js';
import { MemoryWants } from '../../test/support/wants.js';
import { loadSettings, type Settings } from '../config/settings.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import { MET_MEMBERS, UnownWantService } from './unown-want-service.js';

const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const ALICE = '200000000000000002';
const BOB = '200000000000000003';
const UNOWN = pokemonTarget(201);
const NOW = 1_800_000_000_000;

function setup(
  change: (settings: Settings) => Settings = (settings) => settings,
  more: { maxMet?: number } = {},
) {
  const wants = new MemoryWants();
  const gifts = new MemoryUnownGifts(new Set([HOME, AWAY]));
  const { log, entries } = createTestLogger();
  const options = {
    wants,
    gifts,
    gameData: { catalogue: catalogueFixture() },
    settings: change(loadSettings(TEST_SETTINGS_PATH)),
    log,
    now: () => NOW,
    ...more,
  };
  const service = new UnownWantService(options);
  /** A service as after a restart: it remembers nobody, over the same database. */
  const restarted = () => new UnownWantService(options);
  /** A member uses the bot; gives how often their roles were read. */
  const reads = { count: 0 };
  const meet = (on: UnownWantService, memberId: string, roles: string[], guildId = HOME): void => {
    on.noticed(guildId, memberId, () => {
      reads.count += 1;
      return roles;
    });
  };
  const wantsOf = async (memberId: string, guildId = HOME) =>
    (await wants.list(memberId, guildId)).wants;
  return { service, restarted, wants, gifts, entries, meet, reads, wantsOf };
}

describe('UnownWantService', () => {
  it('gives a holder of the role a want for the spawns of Unown, and records it', async () => {
    const made = setup();
    made.meet(made.service, ALICE, ['Valor', 'unown']);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toEqual([{ target: UNOWN, scope: 'spawn' }]);
    expect(made.gifts.rows).toEqual([{ memberId: ALICE, guildId: HOME, createdAt: NOW }]);
  });

  it('reads the role by its name as the team is read: whatever its letter case', async () => {
    const made = setup();
    made.meet(made.service, ALICE, [' Unown ']);
    made.meet(made.service, BOB, ['unown-hunters', 'Mystic']);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toHaveLength(1);
    expect(await made.wantsOf(BOB)).toEqual([]);
    expect(made.gifts.rows.map((row) => row.memberId)).toEqual([ALICE]);
  });

  it('gives it once: a member who removed the want keeps it removed, also after a restart', async () => {
    const made = setup();
    made.meet(made.service, ALICE, ['unown']);
    await made.service.flush();
    await made.wants.remove(ALICE, HOME, UNOWN);
    made.meet(made.service, ALICE, ['unown']);
    await made.service.flush();
    const again = made.restarted();
    made.meet(again, ALICE, ['unown']);
    await again.flush();
    expect(await made.wantsOf(ALICE)).toEqual([]);
    expect(made.gifts.rows).toHaveLength(1);
  });

  it('leaves a member who has a want for Unown as they are, and records that it is settled', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, pokemonTarget(201, 'unown_f'), 'both');
    await made.wants.set(BOB, HOME, UNOWN, 'raid');
    made.meet(made.service, ALICE, ['unown']);
    made.meet(made.service, BOB, ['unown']);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toEqual([
      { target: pokemonTarget(201, 'unown_f'), scope: 'both' },
    ]);
    expect(await made.wantsOf(BOB)).toEqual([{ target: UNOWN, scope: 'raid' }]);
    expect(made.gifts.rows.map((row) => row.memberId).sort()).toEqual([ALICE, BOB].sort());
  });

  it('is per server', async () => {
    const made = setup();
    made.meet(made.service, ALICE, ['unown'], HOME);
    made.meet(made.service, ALICE, [], AWAY);
    await made.service.flush();
    expect(await made.wantsOf(ALICE, HOME)).toHaveLength(1);
    expect(await made.wantsOf(ALICE, AWAY)).toEqual([]);
  });

  it('costs one look into a set after the first interaction of a member, role or not', async () => {
    const made = setup();
    for (let n = 0; n < 5; n++) {
      made.meet(made.service, ALICE, ['unown']);
      made.meet(made.service, BOB, ['Valor']);
    }
    expect(made.reads.count).toBe(2);
    expect(made.service.seen).toBe(2);
    await made.service.flush();
    expect(made.gifts.rows).toHaveLength(1);
  });

  it('returns at once: nothing is read or written before the interaction goes on', async () => {
    const made = setup();
    made.meet(made.service, ALICE, ['unown']);
    expect(made.wants.rows).toEqual([]);
    expect(made.gifts.rows).toEqual([]);
    await made.service.flush();
    expect(made.wants.rows).toHaveLength(1);
  });

  it('does nothing where notifications are off', async () => {
    const made = setup((settings) => ({
      ...settings,
      features: { ...settings.features, notifications: false },
    }));
    made.meet(made.service, ALICE, ['unown']);
    await made.service.flush();
    expect(made.reads.count).toBe(0);
    expect(made.wants.rows).toEqual([]);
    expect(made.gifts.rows).toEqual([]);
  });

  it('never throws, logs what fails, and tries again with the member’s next interaction', async () => {
    const made = setup();
    made.wants.failing = new Error('the database is away');
    expect(() => {
      made.meet(made.service, ALICE, ['unown']);
    }).not.toThrow();
    await made.service.flush();
    expect(made.gifts.rows).toEqual([]);
    expect(made.entries.some((entry) => entry.msg === 'could not give an Unown want')).toBe(true);
    made.wants.failing = undefined;
    made.meet(made.service, ALICE, ['unown']);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toHaveLength(1);
    expect(made.gifts.rows).toHaveLength(1);
    // Roles that cannot be read are no reason to fail either.
    expect(() => {
      made.service.noticed(HOME, BOB, () => {
        throw new Error('no roles');
      });
    }).not.toThrow();
  });

  it('gives nothing twice when the record could not be written after the want', async () => {
    const made = setup();
    made.gifts.failing = new Error('the database is away');
    made.meet(made.service, ALICE, ['unown']);
    await made.service.flush();
    // The first read of the record failed: nothing was given.
    expect(made.wants.rows).toEqual([]);
    made.gifts.failing = undefined;
    const real = made.gifts.record.bind(made.gifts);
    made.gifts.record = () => Promise.reject(new Error('lost'));
    made.meet(made.service, ALICE, ['unown']);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toHaveLength(1);
    expect(made.gifts.rows).toEqual([]);
    // The next try finds the want and only records.
    made.gifts.record = real;
    made.meet(made.service, ALICE, ['unown']);
    await made.service.flush();
    expect(made.wants.rows).toHaveLength(1);
    expect(made.gifts.rows).toHaveLength(1);
  });

  it('retries only the record when that failed: a want the member removed meanwhile stays removed', async () => {
    const made = setup();
    const real = made.gifts.record.bind(made.gifts);
    made.gifts.record = () => Promise.reject(new Error('lost'));
    made.meet(made.service, ALICE, ['unown']);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toHaveLength(1);
    expect(made.gifts.rows).toEqual([]);
    // She does not want it: with the record still owed, her next interaction must not give
    // it back.
    await made.wants.remove(ALICE, HOME, UNOWN);
    made.gifts.record = real;
    made.meet(made.service, ALICE, ['unown']);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toEqual([]);
    expect(made.gifts.rows).toEqual([{ memberId: ALICE, guildId: HOME, createdAt: NOW }]);
    // And a record that fails again is owed again.
    const other = setup();
    other.gifts.record = () => Promise.reject(new Error('lost'));
    other.meet(other.service, ALICE, ['unown']);
    await other.service.flush();
    await other.wants.remove(ALICE, HOME, UNOWN);
    other.meet(other.service, ALICE, ['unown']);
    await other.service.flush();
    other.meet(other.service, ALICE, ['unown']);
    await other.service.flush();
    expect(await other.wantsOf(ALICE)).toEqual([]);
    expect(
      other.entries.filter((entry) => entry.msg === 'could not give an Unown want'),
    ).toHaveLength(3);
  });

  it('remembers a limited number of members: the one met longest ago is looked at again', () => {
    const made = setup(undefined, { maxMet: 3 });
    const idOf = (n: number): string => String(300_000_000_000_000_000n + BigInt(n));
    for (let n = 0; n < 4; n++) made.meet(made.service, idOf(n), []);
    expect(made.service.seen).toBe(3);
    expect(made.reads.count).toBe(4);
    // The three newest are known; the first is met anew.
    for (let n = 1; n < 4; n++) made.meet(made.service, idOf(n), []);
    expect(made.reads.count).toBe(4);
    made.meet(made.service, idOf(0), []);
    expect(made.reads.count).toBe(5);
    expect(made.service.seen).toBe(3);
    expect(MET_MEMBERS).toBeGreaterThanOrEqual(10_000);
  });
});
```

Create `test/support/unown-gifts.ts`:

```ts
import type { UnownGiftStorage } from '../../src/db/repositories/unown-gift-repository.js';

/**
 * The record of settled Unown wants kept in memory as `UnownGiftRepository` keeps it, whose
 * behaviour unown-gift-repository.db.test.ts pins down. `guilds` are the servers the bot has a
 * row for (the fakes' server by default): for any other nothing is recorded. Set `failing` to
 * make every call reject.
 */
export class MemoryUnownGifts implements UnownGiftStorage {
  failing: Error | undefined;
  readonly rows: { memberId: string; guildId: string; createdAt: number }[] = [];

  constructor(readonly guilds = new Set(['412345678901234567'])) {}

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  given(memberId: string, guildId: string): Promise<boolean> {
    return this.attempt(() =>
      this.rows.some((row) => row.memberId === memberId && row.guildId === guildId),
    );
  }

  record(memberId: string, guildId: string, now: number): Promise<void> {
    return this.attempt(() => {
      const known = this.rows.some((row) => row.memberId === memberId && row.guildId === guildId);
      if (!known && this.guilds.has(guildId)) this.rows.push({ memberId, guildId, createdAt: now });
    });
  }
}
```

Run: `npx vitest run --project unit src/services/unown-want-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -17,6 +17,7 @@ import { PokemonRepository } from './db/repositories/pokemon-repository.js';
 import { RaidBossRepository } from './db/repositories/raid-boss-repository.js';
 import { RegionRepository } from './db/repositories/region-repository.js';
 import { SavedRouteRepository } from './db/repositories/saved-route-repository.js';
+import { UnownGiftRepository } from './db/repositories/unown-gift-repository.js';
 import { UserRepository } from './db/repositories/user-repository.js';
 import type { DB } from './db/types.js';
 import { ClickAnswers } from './discord/click-answers.js';
@@ -46,6 +47,7 @@ import { RaidBossService } from './services/raid-boss-service.js';
 import { RaidChangeService } from './services/raid-change-service.js';
 import { TimedPartyService } from './services/timed-party-service.js';
 import { TrainService } from './services/train-service.js';
+import { UnownWantService } from './services/unown-want-service.js';
 import { RaidEventService } from './services/raid-event-service.js';
 import { RegionDirectory } from './services/region-directory.js';
 import { SpawnService } from './services/spawn-service.js';
@@ -165,6 +167,14 @@ export async function startApp(
     log,
   });
   partyService.announceTo(notify);
+  // Holders of the old Unown role get a want for Unown when the bot first meets them.
+  const unownWants = new UnownWantService({
+    wants,
+    gifts: new UnownGiftRepository(db),
+    gameData,
+    settings: config.settings,
+    log,
+  });
   const spawns = new SpawnService({
     gateway: partyGateway,
     raidBosses,
@@ -323,7 +333,16 @@ export async function startApp(
           .remove(guild.id)
           .catch((err: unknown) => log.error({ err, guild: guild.id }, 'could not remove guild'));
       });
-      client.on(Events.InteractionCreate, (interaction) => void router.handle(interaction));
+      client.on(Events.InteractionCreate, (interaction) => {
+        // What the interaction shows of the member's roles; never in the way of the interaction.
+        if (interaction.inCachedGuild()) {
+          const { member } = interaction;
+          unownWants.noticed(interaction.guildId, interaction.user.id, () =>
+            member.roles.cache.map((role) => role.name),
+          );
+        }
+        void router.handle(interaction);
+      });
       // Only that a member wrote, and where: the archive warning of a busy post is said again.
       // Bots (this one, others, webhooks) do not count.
       client.on(Events.MessageCreate, (message) => {
@@ -393,6 +412,7 @@ export async function startApp(
       // Direct messages go on at their usual rate for ten seconds (spec 9); the rest is dropped.
       { name: 'direct messages', timeoutMs: 15_000, run: () => dms.drain(DM_DRAIN_MS) },
       { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
+      { name: 'unown wants', timeoutMs: 5_000, run: () => unownWants.flush() },
       // A write in flight must finish before the pool closes.
       { name: 'parties', timeoutMs: 5_000, run: () => parties.whenIdle() },
       { name: 'database', timeoutMs: 5_000, run: () => db.destroy() },
```

Create `src/db/migrations/2026_10_12_007_unown_want_gifts.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Unown wants for holders of the old `unown` role (plan 4B).
 *
 * The legacy bot gave members who wanted Unown a role instead of a row in
 * `PokemonNotification`. The new bot gives such a member a want for Unown the first time it
 * sees them with that role, and `UnownWantGift` holds one row per member and server for whom
 * that was settled, so that it happens once: a member who then removes the want keeps it
 * removed. `guildId` is the row of the server (`Guild.id`), so the rows of a server the bot
 * left go with it; the member is a snowflake, `varchar(30)` as in `Party`.
 *
 * Safe to run again after a failure half-way: the table is created only when it is missing.
 */
export const unownWantGifts: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists UnownWantGift (
        guildId int unsigned not null,
        memberId varchar(30) not null,
        createdAt bigint not null,
        primary key (guildId, memberId),
        constraint unownwantgift_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
```

Apply to `src/db/migrations/index.ts`:

```diff
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -6,6 +6,7 @@ import { raidBossImage } from './2026_10_11_003_raid_boss_image.js';
 import { partyAccessGrants } from './2026_10_11_004_party_access_grants.js';
 import { pokemonNotificationForm } from './2026_10_12_005_pokemon_notification_form.js';
 import { newTrainNotifications } from './2026_10_12_006_new_train_notifications.js';
+import { unownWantGifts } from './2026_10_12_007_unown_want_gifts.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -19,4 +20,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_11_004_party_access_grants': partyAccessGrants,
   '2026_10_12_005_pokemon_notification_form': pokemonNotificationForm,
   '2026_10_12_006_new_train_notifications': newTrainNotifications,
+  '2026_10_12_007_unown_want_gifts': unownWantGifts,
 };
```

Create `src/db/repositories/unown-gift-repository.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { DB } from '../types.js';

/**
 * For which members of which servers the Unown want of the old role was settled (see
 * `UnownWantService`); lets tests keep it in memory. A member and a server are named by their
 * snowflakes.
 */
export interface UnownGiftStorage {
  /** Whether it was settled for this member in this server. */
  given(memberId: string, guildId: string): Promise<boolean>;
  /**
   * Records that it was settled. Once recorded it stays as it is; for a server the bot has no
   * row for, nothing is recorded (and nothing was given there).
   */
  record(memberId: string, guildId: string, now: number): Promise<void>;
}

/** The `UnownWantGift` table. */
export class UnownGiftRepository implements UnownGiftStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async given(memberId: string, guildId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('UnownWantGift as gift')
      .innerJoin('Guild as g', 'g.id', 'gift.guildId')
      .select('gift.memberId')
      .where('g.snowflake', '=', guildId)
      .where('gift.memberId', '=', memberId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async record(memberId: string, guildId: string, now: number): Promise<void> {
    // The server by its row, in the one statement; recorded already: the row stays as it is.
    await sql`
      insert into UnownWantGift (guildId, memberId, createdAt)
      select id, ${memberId}, ${String(now)} from Guild where snowflake = ${guildId}
      on duplicate key update memberId = UnownWantGift.memberId`.execute(this.db);
  }
}
```

Apply to `src/db/types.ts`:

```diff
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -206,6 +206,12 @@ export interface SavedRoutes {
   userId: number | null;
 }
 
+export interface UnownWantGift {
+  createdAt: string;
+  guildId: number;
+  memberId: string;
+}
+
 export interface User {
   friendcode: string | null;
   groups: Generated<number>;
@@ -243,5 +249,6 @@ export interface DB {
   Region: Region;
   Role: Role;
   SavedRoutes: SavedRoutes;
+  UnownWantGift: UnownWantGift;
   User: User;
 }
```

Create `src/services/unown-want-service.ts`:

```ts
import type { Settings } from '../config/settings.js';
import type { WantStorage } from '../db/repositories/pokemon-notification-repository.js';
import type { UnownGiftStorage } from '../db/repositories/unown-gift-repository.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import type { Logger } from '../log.js';
import type { GameDataProvider } from './game-data-service.js';
import { UNOWN_DEX } from './spawn-service.js';

export interface UnownWantServiceOptions {
  wants: Pick<WantStorage, 'list' | 'set'>;
  gifts: UnownGiftStorage;
  gameData: GameDataProvider;
  settings: Settings;
  log: Logger;
  now?: () => number;
  /** As many members as are remembered as met. Default `MET_MEMBERS`. */
  maxMet?: number;
}

/**
 * As many members (per server) as are remembered as met in a run of the bot; beyond that the
 * one met longest ago is forgotten and looked at again with their next interaction, which for a
 * member without the role costs reading the names of their roles once more. A key is some
 * forty characters: this bounds the set at a few megabytes however long the bot runs.
 */
export const MET_MEMBERS = 50_000;

/**
 * Unown wants for holders of the old role (Matt, 2026-10-12). The legacy bot answered `!want
 * unown` with a role (`settings.roles.unown`) and pinged that role for a sighting; this bot
 * tells who has a want for Unown, as for any other Pokémon. The holders of a role cannot be
 * listed without the Server Members intent, so they are met one by one: a member whose
 * interaction shows a role of that name, and who has no want for Unown in that server, is
 * given one for its spawns (the species, every letter). Once per member and server, recorded in
 * the database (`UnownWantGift`), so that a member who removes the want keeps it removed. Only
 * where notifications are on.
 *
 * It is in nobody's way: `noticed` returns at once and never throws; after the first
 * interaction of a member in a server during a run of the bot it is one look into a set (also
 * for a member without the role: one who gets the role later is met after the next start, or
 * once `MET_MEMBERS` others were met since); everything else happens on the side, and what fails
 * is logged and tried again with that member's next interaction. When only the record could
 * not be written after the want, only the record is tried again: the member may have removed
 * the want meanwhile, and must not get it back.
 */
export class UnownWantService {
  private readonly now: () => number;
  /** The members met in this run of the bot, as `<server>:<member>`. */
  private readonly met = new Set<string>();
  /** The members whose want is settled and whose record could not be written yet. */
  private readonly owed = new Set<string>();
  private readonly maxMet: number;
  private readonly background = new Set<Promise<void>>();

  constructor(private readonly options: UnownWantServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.maxMet = Math.max(1, options.maxMet ?? MET_MEMBERS);
  }

  /** Remembers a member as met; the one met longest ago goes when there are too many. */
  private remember(key: string): void {
    while (this.met.size >= this.maxMet) {
      // Oldest first: a Set keeps the order in which entries were added.
      const oldest = this.met.values().next();
      if (oldest.done) break;
      this.met.delete(oldest.value);
    }
    this.met.add(key);
  }

  /** How many members were met in this run. For tests. */
  get seen(): number {
    return this.met.size;
  }

  /**
   * A member used the bot in a server. `roleNames` gives the names of their roles as the
   * interaction shows them, and is asked only at a member's first interaction of this run.
   */
  noticed(guildId: string, memberId: string, roleNames: () => Iterable<string>): void {
    const { settings, log } = this.options;
    if (!settings.features.notifications) return;
    const key = `${guildId}:${memberId}`;
    if (this.met.has(key)) return;
    this.remember(key);
    try {
      // As a team is read from the roles: by name, whatever its letter case.
      const role = settings.roles.unown.trim().toLowerCase();
      const holds = [...roleNames()].some((name) => name.trim().toLowerCase() === role);
      if (!holds) return;
    } catch (err) {
      log.warn({ err, guild: guildId }, 'could not read the roles of a member');
      return;
    }
    const work = this.settle(key, guildId, memberId)
      .catch((err: unknown) => {
        // Not settled: their next interaction tries again.
        this.met.delete(key);
        log.warn({ err, guild: guildId, member: memberId }, 'could not give an Unown want');
      })
      .finally(() => this.background.delete(work));
    this.background.add(work);
  }

  private async settle(key: string, guildId: string, memberId: string): Promise<void> {
    const { wants, gifts, gameData, log } = this.options;
    if (!this.owed.has(key)) {
      if (await gifts.given(memberId, guildId)) return;
      // A game master without Unown has nothing to want; asked again after the next start.
      if (!gameData.catalogue.species(UNOWN_DEX)) return;
      const { wants: own } = await wants.list(memberId, guildId);
      const has = own.some(
        (want) => want.target.kind === 'pokemon' && want.target.dex === UNOWN_DEX,
      );
      // The want first, the record after it: a stop between the two gives nothing twice, since
      // the member then has the want. Recorded also for a member who had one already.
      if (!has) {
        await wants.set(memberId, guildId, pokemonTarget(UNOWN_DEX), 'spawn');
        log.info(
          { guild: guildId, member: memberId },
          'a holder of the Unown role got a want for Unown',
        );
      }
      // From here on only the record is owed: should it fail, the next try writes the record
      // alone and never looks at the wants again (the member may have removed theirs).
      this.owed.add(key);
    }
    await gifts.record(memberId, guildId, this.now());
    this.owed.delete(key);
  }

  /** Waits for what is on its way. For shutdown and for tests. */
  async flush(): Promise<void> {
    while (this.background.size > 0) await Promise.all(this.background);
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/services/unown-want-service.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/migrator.db.test.ts`, `src/db/repositories/unown-gift-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/unown-gift-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 74c12b0 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/app.ts src/db/migrations/2026_10_12_007_unown_want_gifts.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/unown-gift-repository.db.test.ts src/db/repositories/unown-gift-repository.ts src/db/types.ts src/services/unown-want-service.test.ts src/services/unown-want-service.ts test/support/unown-gifts.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app.ts src/db/migrations/2026_10_12_007_unown_want_gifts.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/unown-gift-repository.db.test.ts src/db/repositories/unown-gift-repository.ts src/db/types.ts src/services/unown-want-service.test.ts src/services/unown-want-service.ts test/support/unown-gifts.ts
git commit -m "An Unown want for holders of the old role, once per member and server" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 3,273 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto/phase-4b HEAD -- src test scripts data/settings.json` prints nothing; `npm run test:db` once, complete; `npm run build`.
2. Whole-branch review (Opus, high effort) of the ten commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and conventions for `ctx.dms` (`DmSender`, priorities, never a loop over recipients), `MemberDirectory.viewers`, `PartyNotifier` / `NotifyService` (explicit calls with the actor, the memory, never throws, `close()`), the reasons and the `dm` custom-id kind, new-train per server (`ctx.newTrains`), `ctx.spawns` and `/wild`, the icons (`pokemonPicture`, `settings.gameData.iconsUrl`), Unown, `cacheFactory`, the test twins (`FakeDmGateway`, `RecordingDms`, `MemoryNewTrains`, `MemoryUnownGifts`).
4. `docs/superpowers/plans/phase-0-follow-ups.md`: a "From Phase 4B" section (what staging must verify about the gateway request and the sender's numbers, what is left open, the rollback note for the two tables). The spec ("as built" for 6.4), the Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord. Each step needs Matt's go-ahead; the bot is started by Matt. `npm run deploy-commands` comes first (one new command, `/wild`; `/settings new-train` changed). The local database gets two migrations when the bot starts. **Delete `var/game-data-cache.json` before the start, or check in the log that the icon list was fetched on the side.** The second ordinary account is needed for nearly all of it: nobody is sent a DM about what they did themselves.

The member look-up (the one thing no test can show):

- [ ] The first raid report that somebody else wants: in the log, the gateway request for members is answered (no "falling back" warning, no close of the gateway connection; watch the shard's close codes). If it falls back to REST, note the message and code: the plan's assumption that the request by user id needs no privileged intent was wrong, and the fallback is then the way.
- [ ] A member who cannot see the region's forum gets no DM for a raid there; after being let in (signing up from elsewhere is not possible, so by a role) they get the next one within ten minutes at most (the kept answer).

Raid DMs (account B wants, account A acts):

- [ ] B: `/want` a tier, a species, a gym target. A: `/raid` for that tier at that gym. B gets one DM naming all the reasons, with the embed of the post, a link that opens the post, and one "Stop: …" button per reason. A gets none.
- [ ] A sets the boss to the wanted species: B gets a second DM naming only the species. A sets the same boss again: nothing. A corrects it to another boss and back: nothing for a want that was already told.
- [ ] B is signed up for an egg with `/settings boss-set` on: A sets the boss, B gets "The boss … is"; A corrects it to another boss: "is now"; back to the first: told again. The hatch by the clock of an egg with one possible boss tells B too.
- [ ] A moves the raid with `/location` to a gym B targets: one DM for the gym. Across regions: no DM repeated for what B was already told.
- [ ] B presses a stop button: the want is gone (`/wants`), the button disappears, the others stay, the answer names what was removed. Two buttons pressed quickly: neither comes back. After a restart of the bot an old DM's button still works. A button for boss-set or new trains switches the setting off (`/settings show`).
- [ ] With `features.notifications` off: no want DMs; the meeting-time DM still comes.

Trains and meeting times:

- [ ] B: `/settings new-train` on in the test server; A: `/train`. B gets the train DM with its stop button. In the bot's DM, `/settings new-train` says to use it in a server.
- [ ] A and B signed up for a raid in one group: A uses `/meet`; B gets "**A** set a meeting time of … There are currently **2** trainers attending!", A gets none; corrected within seconds: one DM; `/cancel-meet`: the cancellation. A member who is done gets none. The same for the start time of a meetup and a train.

`/wild`:

- [ ] `/wild` in a region channel, its forum and a post: the report appears in the region's text channel with details, the warning and a picture; A's private answer links to it. From a channel without a region: the sentence. A mega typed: refused. Details with `@everyone` and a masked link: shown as text, nobody pinged.
- [ ] B wants the Pokémon for spawns: the DM comes before any raid DM waiting (priority), with the link to the report. With `iv: Perfect` and a perfect-IV want: the IV reason.
- [ ] The report is gone after 30 minutes; a report standing at a graceful stop of the bot is removed then.
- [ ] With Embed Links taken from the bot in that channel: the report goes out as text.
- [ ] Unown: where the server has the channel named by `settings.channels.unown`, the report is also there and stays; no role is pinged.
- [ ] A member with the role named by `settings.roles.unown` and no Unown want: after any interaction, `/wants` shows Unown (spawns). After `/unwant` it does not come back at the next interaction.

Pictures:

- [ ] Five spawn reports show the right picture, among them Unown (the species: form A), Kyurem, a regional form, and a Scatterbug pattern (the plain picture). A raid boss from the feed still shows the feed's picture; a train with a boss that is no current raid boss shows the icon.

To note down for the follow-ups:

- [ ] The sender's log line after each burst ("direct messages sent"): the delivery times and the event-loop delay. These are the numbers that decide about a second token; the first busy day after cutover gives the real ones.
- [ ] Whether the reasons line in small print and the link to a forum post read well in a DM on a phone.
