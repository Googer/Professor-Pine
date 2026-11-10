# Phase 8X-H: The 8X-G Staging's Findings and the Catch-Up on Reconnect: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the findings of the 8X-G staging run of 2026-10-23 and build Matt's decision on outages (follow-ups, "From the staging run of 8X-G"):

- **The catch-up on reconnect** (Matt: catch up, not restart): when the gateway is back after a real disconnect (away 30 s or more, a missed heartbeat, shard errors, or a new session; not a routine resume), Pine redraws every active post, runs the hourly upkeep (sweep, summaries, emoji and the rest), turns the stops' pinned posts over, and reads again the feeds whose last read failed. A party whose closing failed for the network or a rate limit is closed again in the hourly upkeep (controls removed, Ended tag, leftovers, last words, a moderator's deletion), within a day.
- **Quieter outages in the log:** shard errors of one kind once, then a count a minute; a network failure is a warning, not an ERROR (boss feeds, game data, post and summary edits); the sweep warns once per sweep; debug lines when a feed, the sweep and the emoji read succeed.
- **`/counters`:** the refusal of a moveset Pokebattler does not simulate names ten and "and N more." (G1, cut by Matt: Mew is never a boss); Pokebattler's 503 reads "still working this out: try again in a minute." (G6).
- **Trains:** Move…'s Previous at a turn-back end is the undo, "Previous: back to X (undo)" (G2, Matt); a finished route's words said once and as each surface takes the train back (G3).
- **The summary:** a start or end more than a day ahead as Discord's date and time, in each reader's time zone (G4, Matt).
- **Docs and the staging checklist** `2026-10-23-phase-8xh-staging.md` (no command change: no deploy).

**Architecture:** `src/discord/gateway-events.ts` (`GatewayWatch`, shard errors' runs), `src/services/catch-up.ts` (`CatchUp`), `catchUp()` on `PartyScheduler`, `StopPostService`, `BossFeedService`, `RaidEventService`, `ResearchTaskService`, `RocketLineupService`, `GameDataService`; `PartyService.redrawPosts` and `redoClosings` (undone closings in a `BoundedMap`), `PostRemoved` `'deleting'` in `/delete` and the moderators' reports; `src/services/network-error.ts` (`isNetworkError`); `src/app.ts` wiring and the shutdown steps; `src/commands/util/counters*.ts`; `src/render/train-dialogs.ts`, `train-words.ts` (`TrainSurface`); `src/render/summary.ts`.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14 (14.27.0, @discordjs/ws 1.2.3), Kysely, Vitest. No new dependency, no migration, no party state change, no command change.

**Spec:** the follow-ups' "From the staging run of 8X-G" and Matt's answers of 2026-10-23; the brief `.superpowers/sdd/8x-h-staging-fixes/design.md` (its review R1–R17 folded in), the fix rounds `fix-r1.md` and `fix-r2.md`, and the ledger (git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8xh`, tip `c64d2efb`), one commit per task, on `max-battles` 3622adf1. Each commit typechecks and its tests pass; on the tip the full check (9,296 tests), the build and the database suite (597) are clean.

**Reviews:** a fresh Opus reviewer read the brief before any code (one Blocker: the rule of a real disconnect, not from shard errors or the heartbeat; Important: what really waits after an outage, stale posts, closings lost in an outage, the stops' posts, jobs that never fail, concurrency and shutdown, G2's Previous is an undo); two Opus reviewers read the prototype (A: Discord's REST abort not counted as network; B: a third of routine resumes counted real, link lines and copies, a moderator's deletion, closings tied to the gateway, only network failures kept, shutdown, the checklist's timings; and Minor ones), then a fix review (C1: a pending deletion told as refused; five Minor). All folded in.

## Decisions in this plan

Made while prototyping and reviewing, for Matt to look at (his own answers are marked):

1. **G4 (Matt):** `<t:…:f>` beyond 24 hours, for starts and ends alike; the relative stamp within a day (the switch comes at the next summary draw).
2. **G2 (Matt):** Previous stays at a turn-back end as the undo of a mistaken Next; left out only where it is Next's very move (a two-stop loop).
3. **G3:** typed commands "`/previous` takes it back", the post's dialogs "Move… takes it back", the map "Previous takes it back".
4. **G1 (Matt cut it):** the menu unchanged; the refusal names ten and "and N more."
5. **A real disconnect:** armed after the login; away from the first `ShardReconnecting`, or from the last heartbeat ack when it is more than 60 s older (a sleep or a zombie); real at 30 s away, any shard error while away, or a new session. One shard (`createClient` sets none).
6. **The catch-up:** posts redrawn (queued, 250 ms apart), the upkeep, the stops' posts, then the feeds owed; one at a time, once more if the gateway came back meanwhile; the event pages with spawns left out (they retry within the hour).
7. **Closings redone (Matt):** only parts that failed for the network or a rate limit; in the hourly upkeep before the sweep, one probe per run while the network is away; dropped after a day or when the post is gone. Last words sent but unanswered may be said twice (accepted). A moderator's deletion is redone as a deletion, the moderator told "archived for now … I will try again within the hour".
8. **Network failures:** Node's and undici's network codes and timeouts, Discord REST's abort and its 5xx; never a MySQL error.
9. **Shutdown:** the party clock 6 s, a catch-up step 2 s after the stops' posts, direct messages 12 s: every step within 150 s, 5 s to spare.

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8xh`). Apply it exactly with `git apply`, never retype; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock), one at a time. Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/`, `.superpowers/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **The real-disconnect rule** against discord.js 14.27 as installed: routine resumes never count; a slept laptop and a zombie do.
2. **The catch-up's concurrency and shutdown:** one at a time, the feeds' timers cleared and rescheduled once, nothing started after close, every step's limit.
3. **Closings redone:** what is repeated and what must not be (last words, a reopened party, a gone post), their lifetime, a moderator's deletion and its words.
4. **The network check's edges** and every log line an outage writes.
5. **Words** members and moderators see, and the checklist against every change.

## Tasks

### Task 1: 8X-H 1: Counters: a shorter list of simulated movesets, a 503 as still working

Prototype commit: `26ce7dcc496443e5a16e2ce8e7c1a85e192adb33`

G1: the refusal of a boss moveset Pokebattler does not simulate names ten of
those it does (`SIMULATED_NAMED`) and ends ", and N more." (review r0 A5);
the dialog's moveset menu stays as it is (Matt, 2026-10-23: Mew, the one boss
with more movesets than the menu holds, is never a raid or max boss).
G6: a 503 is said as a timeout is ("still working this out").

**Files:**

```
 src/commands/util/counters-words.ts | 17 ++++++++++++-----
 src/commands/util/counters.test.ts  | 49 +++++++++++++++++++++++++++++++++++++++++++++++--
 src/commands/util/counters.ts       | 13 ++++++++++++-
 test/support/pokebattler.ts         | 25 +++++++++++++++++++++++++
 4 files changed, 96 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/util/counters.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 26ce7dcc496443e5a16e2ce8e7c1a85e192adb33 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-23-phase-8xh-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-H 1: Counters: a shorter list of simulated movesets, a 503 as still working`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/util/counters-words.ts b/src/commands/util/counters-words.ts
index aefd7a676010c7ef4d921cf7c3b91b842569bdbc..0e96a6baf46f2ad73d97c541549a98ca7f5c7f16 100644
--- a/src/commands/util/counters-words.ts
+++ b/src/commands/util/counters-words.ts
@@ -2,20 +2,27 @@ import { UserError } from '../../discord/errors.js';
 import { plain } from '../../render/text.js';
 import type { PokebattlerFailure } from '../../services/pokebattler-gateway.js';
 
+/** A query Pokebattler has not worked out lately: the next try is often answered at once. */
+export const STILL_WORKING = 'Pokebattler is still working this out: try again in a minute.';
+
 /**
  * What a member is told when Pokebattler gave nothing for a reason that is not about the boss
  * (no answer, too many asking, an answer that could not be read): the same for the raid counters
  * and the max battle teams. Undefined for `unknown` and `empty`, which each says in its own words.
+ * A 503 is a query Pokebattler is still computing (the staging of 8X-G: the same query a minute
+ * later was answered at once), said as a timeout is (plan 8X-H).
  */
-export function troubleText(reason: PokebattlerFailure['reason']): string | undefined {
-  switch (reason) {
+export function troubleText(outcome: PokebattlerFailure): string | undefined {
+  switch (outcome.reason) {
     case 'unknown':
     case 'empty':
       return undefined;
     case 'timeout':
-      // A query Pokebattler has not worked out lately: the next try is often answered at once.
-      return 'Pokebattler is still working this out: try again in a minute.';
+      return STILL_WORKING;
     case 'refused':
+      return outcome.status === 503
+        ? STILL_WORKING
+        : 'Pokebattler did not answer just now. Please try again later.';
     case 'unreachable':
     case 'unavailable':
       return 'Pokebattler did not answer just now. Please try again later.';
@@ -59,6 +66,6 @@ export function troubleError(
     outcome.reason === 'too-large'
       ? `Pokebattler’s answer for ${plain(bossTitle)} is too large for me to read. See the ` +
         `[full results on Pokebattler](<${fullResults}>).`
-      : (troubleText(outcome.reason) ?? fallback);
+      : (troubleText(outcome) ?? fallback);
   return new UserError(text, { givesBack: givesBackFor(outcome) });
 }
diff --git a/src/commands/util/counters.test.ts b/src/commands/util/counters.test.ts
index 773fd2c6c0e59a3fe11b87825447ed716be15394..3da1b881124932118e4044ce18963ddbedf22d03 100644
--- a/src/commands/util/counters.test.ts
+++ b/src/commands/util/counters.test.ts
@@ -22,14 +22,18 @@ import { maxBossServiceWith } from '../../../test/support/max-boss-service.js';
 import { expectV2Sendable } from '../../../test/support/post-limits.js';
 import { ALICE } from '../../../test/support/parties.js';
 import { createdTrain, reportedMax, reportedRaid } from '../../../test/support/party-service.js';
-import { FakePokebattler, recordedTeam } from '../../../test/support/pokebattler.js';
+import {
+  answerSimulating,
+  FakePokebattler,
+  recordedTeam,
+} from '../../../test/support/pokebattler.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryUsers } from '../../../test/support/users.js';
 import type { V2Message } from '../../discord/party-gateway.js';
 import { InteractionRouter } from '../../discord/router.js';
 import type { MaxTier } from '../../domain/pogo/max-tier.js';
 import type { MaxBossProvider } from '../../services/max-boss-service.js';
-import { counters } from './counters.js';
+import { bossMovesets, counters, SIMULATED_NAMED } from './counters.js';
 
 function setup(overrides: Parameters<typeof createTestContext>[0] = {}) {
   const pokebattler = new FakePokebattler();
@@ -233,6 +237,31 @@ describe('/counters: elsewhere than in a raid post', () => {
     );
   });
 
+  it('names a handful of the many movesets Pokebattler simulates, and how many more', async () => {
+    const made = setup();
+    const mew = made.ctx.gameData.catalogue.byKey('mew');
+    if (!mew) throw new Error('no mew');
+    const all = bossMovesets(made.ctx.gameData.catalogue, mew);
+    // Pokebattler simulates the last 30 of the game master's (Mew: some 100 of 350).
+    const simulated = all.slice(-30).reverse();
+    made.pokebattler.answer = answerSimulating(
+      simulated.map((each) => ({ fast: each.fast.id, charged: each.charged.id })),
+    );
+    const [first] = all;
+    if (!first) throw new Error('no moveset');
+    const text = told(
+      await made.run({ boss: 'mew', tier: 'T5', moveset: `${first.fast.id}/${first.charged.id}` }),
+    );
+    const named = simulated
+      .slice(0, SIMULATED_NAMED)
+      .map((each) => `${each.fast.name} / ${each.charged.name}`)
+      .join(', ');
+    expect(text).toBe(
+      `Pokebattler has no results for Mew with ${first.fast.name} / ${first.charged.name}. ` +
+        `It simulates ${named}, and ${String(30 - SIMULATED_NAMED)} more.`,
+    );
+  });
+
   it('refuses what it can before Pokebattler is asked, without counting it', async () => {
     const made = setup();
     expect(told(await made.run({}))).toBe(
@@ -300,6 +329,22 @@ describe('/counters: elsewhere than in a raid post', () => {
     );
   });
 
+  it('says a 503 is Pokebattler still working the query out, for raids and max battles', async () => {
+    const made = setup();
+    made.pokebattler.failing = { ok: false, reason: 'refused', status: 503 };
+    expect(told(await made.run({ boss: 'yveltal' }))).toBe(
+      'Pokebattler is still working this out: try again in a minute.',
+    );
+    expect(told(await made.run({ boss: 'uxie', tier: 'D5' }))).toBe(
+      'Pokebattler is still working this out: try again in a minute.',
+    );
+    // Another of Pokebattler's own errors is as before.
+    made.pokebattler.failing = { ok: false, reason: 'refused', status: 500 };
+    expect(told(await made.run({ boss: 'yveltal' }))).toBe(
+      'Pokebattler did not answer just now. Please try again later.',
+    );
+  });
+
   it('says plainly when the answer is too large, with the full results on Pokebattler’s site', async () => {
     const made = setup();
     made.pokebattler.failing = { ok: false, reason: 'too-large' };
diff --git a/src/commands/util/counters.ts b/src/commands/util/counters.ts
index 8e6521383b8887e5fb9b87974a08313b7e627ff1..9b2f1f7b66cfee6b8feae69ab77ade4e54d1d900 100644
--- a/src/commands/util/counters.ts
+++ b/src/commands/util/counters.ts
@@ -513,10 +513,21 @@ function countersFor(
   );
   throw new UserError(
     `Pokebattler has no results for ${plain(entry.name)} with ${plain(movesetName(moveset))}.` +
-      (simulated.length === 0 ? '' : ` It simulates ${plain(simulated.join(', '))}.`),
+      simulatedSentence(simulated),
   );
 }
 
+/** At most so many simulated movesets are named in the refusal (Mew has some 100: plan 8X-H). */
+export const SIMULATED_NAMED = 10;
+
+/** ` It simulates A, B, and 20 more.`, or nothing when the answer simulates none. */
+function simulatedSentence(simulated: readonly string[]): string {
+  if (simulated.length === 0) return '';
+  const named = plain(simulated.slice(0, SIMULATED_NAMED).join(', '));
+  const more = simulated.length - SIMULATED_NAMED;
+  return more > 0 ? ` It simulates ${named}, and ${String(more)} more.` : ` It simulates ${named}.`;
+}
+
 const names = new WeakMap<PokemonCatalogue, (pokemonId: string) => string>();
 function namesOf(catalogue: PokemonCatalogue): (pokemonId: string) => string {
   let found = names.get(catalogue);
diff --git a/test/support/pokebattler.ts b/test/support/pokebattler.ts
index 1a8903547f37e647705a2428b05aa686d87ca624..7c1b3af6a7fefab9dc7132ff75237e2c3472e05b 100644
--- a/test/support/pokebattler.ts
+++ b/test/support/pokebattler.ts
@@ -164,6 +164,31 @@ export function mewtwoAnswer(): CounterAnswer {
   return answer;
 }
 
+/**
+ * An answer that simulates these boss movesets, in this order (plan 8X-H: Pokebattler simulates
+ * some 100 of Mew's 350), each with the same one counter, and their average.
+ */
+export function answerSimulating(
+  movesets: readonly { fast: string; charged: string }[],
+): CounterAnswer {
+  const counter: SampleCounter = {
+    pokemonId: 'TYRANITAR',
+    byMove: [{ move1: 'BITE_FAST', move2: 'BRUTAL_SWING', seconds: 120, estimator: 2.6 }],
+  };
+  const answer = readCounterAnswer(
+    pokebattlerAnswer({
+      byMove: movesets.map((moveset) => ({
+        move1: moveset.fast,
+        move2: moveset.charged,
+        defenders: [counter],
+      })),
+      average: [counter],
+    }),
+  );
+  if (!answer) throw new Error('the sample answer could not be read');
+  return answer;
+}
+
 /**
  * Pokebattler as a test wants it: nothing leaves the process. Every request is recorded in
  * `asked`; it is answered with `answer` (by default `mewtwoAnswer()`) for any boss name of
````

### Task 2: 8X-H 2: Trains: Move… tells Next and Previous apart, a finished route's words

Prototype commit: `96e72604a2fb20b38d3a76de6a792d9e042e894b`

G2: at the last stop of a turn-back route Move… keeps Previous, as
"Previous: back to X (undo)" with what it does in its description, beside
"Next: turn back to X" (Matt, 2026-10-23); Previous is left out only where it
is the very move Next is (a loop of two stops).
G3: Move… on a finished route says it is finished once and where Submit takes
it, without naming Previous; `whereText` names what takes a finished route
back where the member moved it: `/previous` for a command, Move… for the
post's dialogs, Previous for the map's panel.

**Files:**

```
 src/commands/trains/manage-dialog.test.ts |  2 +-
 src/commands/trains/move-dialog.test.ts   | 13 +++++++++++++
 src/commands/trains/move.test.ts          |  4 ++--
 src/commands/trains/move.ts               |  6 ++++--
 src/commands/trains/train-changes.ts      | 17 +++++++++++++----
 src/render/train-dialogs.test.ts          | 53 +++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/render/train-dialogs.ts               | 68 ++++++++++++++++++++++++++++++++++++++++++++++++++------------------
 src/render/train-post.test.ts             | 36 ++++++++++++++++++++++++++++--------
 src/render/train-words.ts                 | 35 +++++++++++++++++++++++++++--------
 src/web/train-routes.ts                   | 13 +++++++++++--
 10 files changed, 200 insertions(+), 47 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/trains/manage-dialog.test.ts src/commands/trains/move-dialog.test.ts src/commands/trains/move.test.ts src/render/train-dialogs.test.ts src/render/train-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 96e72604a2fb20b38d3a76de6a792d9e042e894b -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-23-phase-8xh-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-H 2: Trains: Move… tells Next and Previous apart, a finished route's words`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/trains/manage-dialog.test.ts b/src/commands/trains/manage-dialog.test.ts
index a06926a434b80054590b21015512b52491836d01..dde674b6445f8c540ee1124bb395eb562c9ceb24 100644
--- a/src/commands/trains/manage-dialog.test.ts
+++ b/src/commands/trains/manage-dialog.test.ts
@@ -148,7 +148,7 @@ describe('Manage… of a train’s post (plan 8X-G)', () => {
     const finished = await made.submit(fresh, { route: 'finish' });
     expect(made.current().train.stop).toBe(4);
     expect(made.answerOf(finished)).toMatch(
-      /^The route is finished\. The train has finished its route of 4 stops\./,
+      /^The route is finished\. The train has finished its route of 4 stops\. Move… takes it back to stop 2: /,
     );
   });
 
diff --git a/src/commands/trains/move-dialog.test.ts b/src/commands/trains/move-dialog.test.ts
index 083a934af7f5da0509c153df111d97a9b5df441d..eff8dbe03e89da6e6507704311b5cd413d90c90c 100644
--- a/src/commands/trains/move-dialog.test.ts
+++ b/src/commands/trains/move-dialog.test.ts
@@ -22,6 +22,7 @@ const maps = (id: number): string => {
 };
 const STACKS = `[The Stacks](<${maps(1)}>)`;
 const MURAL = `[Harbor Lighthouse Mural](<${maps(7)}>)`;
+const FOUNTAIN = `[Old Stone Fountain](<${maps(2)}>)`;
 
 beforeEach(() => {
   vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
@@ -138,6 +139,18 @@ describe('Move… of a train’s post (plan 8X-G)', () => {
     expect(made.answerOf(late)).toMatch(/conductor/);
   });
 
+  it('says Move… takes a route finished by its Next back, the post having no Previous', async () => {
+    const made = await setup();
+    await made.trains.move(made.party.id, { id: ALICE }, 'skip', false);
+    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
+    const dialog = shownDialog(await made.open());
+    const submitted = await made.submit(dialog, choiceOf(dialog, 'Next'));
+    expect(made.answerOf(submitted)).toBe(
+      `The train has finished its route of 4 stops. Move… takes it back to stop 4: ${FOUNTAIN}. ` +
+        'I am telling the others.',
+    );
+  });
+
   it('takes a mistaken Finish back from a finished route, the move in the dialog’s id', async () => {
     const made = await setup();
     await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
diff --git a/src/commands/trains/move.test.ts b/src/commands/trains/move.test.ts
index dc4506728362f9385e563b459403e8953b9b9a71..3f6858f1ddf8c0a9cc9b444e335afd3f307581a8 100644
--- a/src/commands/trains/move.test.ts
+++ b/src/commands/trains/move.test.ts
@@ -118,7 +118,7 @@ describe('/next, /previous, /skip and /finish', () => {
       `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
     );
     expect(await made.answer('finish')).toBe(
-      `The train has finished its route of 4 stops. Previous takes it back to stop 2: ${STACKS}. ` +
+      `The train has finished its route of 4 stops. \`/previous\` takes it back to stop 2: ${STACKS}. ` +
         'I am telling the others.',
     );
     // Back from the end, the train is where it was when the route was finished.
@@ -131,7 +131,7 @@ describe('/next, /previous, /skip and /finish', () => {
     );
     // From the last stop, next finishes the route.
     expect(await made.answer('next')).toBe(
-      `The train has finished its route of 4 stops. Previous takes it back to stop 4: ${FOUNTAIN}. ` +
+      `The train has finished its route of 4 stops. \`/previous\` takes it back to stop 4: ${FOUNTAIN}. ` +
         'I am telling the others.',
     );
     expect(made.current()).toMatchObject({ status: 'active', train: { stop: 4 } });
diff --git a/src/commands/trains/move.ts b/src/commands/trains/move.ts
index 8ef39c608e64682a092f5ce70dcc0799be171efa..b4ed0e6fe2d3f1c2d83e6188e4fd59c7db25228b 100644
--- a/src/commands/trains/move.ts
+++ b/src/commands/trains/move.ts
@@ -63,6 +63,7 @@ async function moveByCommand(
     actingMember(interaction),
     move,
     isStaff(interaction, ctx),
+    'command',
   );
   if (answer.kind !== 'ok') throw new UserError(answer.text);
   await interaction.reply({ content: answer.text, flags: MessageFlags.Ephemeral });
@@ -224,7 +225,7 @@ function submitRefusal(
 ): string {
   const now = ctx.parties.get(partyId);
   if (reason !== undefined && STALE_MOVES.has(reason) && now && isTrain(now)) {
-    return `${MOVED_ON}${whereText(trainPlaces(ctx, now))}`;
+    return `${MOVED_ON}${whereText(trainPlaces(ctx, now), 'post')}`;
   }
   return text;
 }
@@ -255,6 +256,7 @@ export async function submitMove(
     actingMember(interaction),
     asked.move,
     isStaff(interaction, ctx),
+    'post',
     asked.from,
     asked.target,
   );
@@ -319,7 +321,7 @@ function managedWords(
     done.route === 'reversed' ? 'The route is reversed.' : undefined,
     done.route === 'finished' ? 'The route is finished.' : undefined,
     done.atEndSet ? atEndSentence(party.train.atEnd) : undefined,
-    done.route === undefined ? undefined : whereText(trainPlaces(ctx, party)),
+    done.route === undefined ? undefined : whereText(trainPlaces(ctx, party), 'post'),
   ].filter((sentence) => sentence !== undefined);
   return said.length === 0 ? NOTHING_CHANGED : said.join(' ');
 }
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index 1d7b989797185eccade8ba72a01167c10d103086..7973520afe69a7f968ddd13488844214087bfbd3 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -21,7 +21,12 @@ import { groupWords } from '../../render/party-controls.js';
 import { stopInWords, stopsFrom } from '../../render/train-stops.js';
 import { count, memberText, plain } from '../../render/text.js';
 import type { TrainPlaces } from '../../render/train-post.js';
-import { atEndSentence, trainKindSentence, whereText } from '../../render/train-words.js';
+import {
+  atEndSentence,
+  trainKindSentence,
+  whereText,
+  type TrainSurface,
+} from '../../render/train-words.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { TrainOutcome } from '../../services/party-service.js';
 import type { TrainChangeOutcome } from '../../services/train-service.js';
@@ -371,7 +376,9 @@ export async function forgetRouteAs(
 
 /**
  * Moves the train along its route (`/next`, `/previous`, `/skip`, `/finish`, the map) and says
- * where it is now. `from` and `target` are for a control drawn at a place (the map's panel).
+ * where it is now. `surface` is where the member moved it (a command, Move… of the post, the
+ * map), so that a finished route names what takes it back there; `from` and `target` are for a
+ * control drawn at a place (Move…, the map's panel).
  */
 export async function moveTrainAs(
   ctx: TrainChanging,
@@ -379,13 +386,15 @@ export async function moveTrainAs(
   member: Member,
   move: TrainMove,
   staff: boolean,
+  surface: TrainSurface,
   from?: string,
   target?: string,
 ): Promise<TrainAnswer> {
   const outcome = await ctx.trains.move(party.id, member, move, staff, from, target);
   return answerOf(ctx, outcome, (ok) => {
     const others = membersWhere(ok.party, (_attendee, id) => id !== member.id).length > 0;
-    return `${whereText(trainPlaces(ctx, ok.party))}${others ? ' I am telling the others.' : ''}`;
+    const where = whereText(trainPlaces(ctx, ok.party), surface);
+    return `${where}${others ? ' I am telling the others.' : ''}`;
   });
 }
 
@@ -406,7 +415,7 @@ export async function reverseRouteAs(
   return answerOf(
     ctx,
     outcome,
-    (ok) => `The route is reversed. ${whereText(trainPlaces(ctx, ok.party))}`,
+    (ok) => `The route is reversed. ${whereText(trainPlaces(ctx, ok.party), 'map')}`,
   );
 }
 
diff --git a/src/render/train-dialogs.test.ts b/src/render/train-dialogs.test.ts
index f2af5004731e4783e043960dd5aef9a8b7783df5..93cdd98dab99835239bf48bbb3b14cb7628c3201 100644
--- a/src/render/train-dialogs.test.ts
+++ b/src/render/train-dialogs.test.ts
@@ -19,6 +19,10 @@ const LONG =
   'and further still';
 gyms.set(90, testGym(90, LONG, 40.05, -80.05));
 gyms.set(91, testGym(91, `${LONG}, again`, 40.05, -80.05));
+/** A name over the 75 characters a label keeps after "Previous: back to ", within a description's 100. */
+const RATHER_LONG =
+  'A gym whose name goes on past what the label of an undo holds, though not much further';
+gyms.set(92, testGym(92, RATHER_LONG, 40.05, -80.05));
 
 /** The test train on this route of gyms, at the stop with this index. */
 function onRoute(
@@ -135,15 +139,60 @@ describe('moveDialog (plan 8X-G: Move…)', () => {
     );
   });
 
+  it('tells Next and Previous apart at the end of a turn-back route (plan 8X-H, G2)', () => {
+    // Next turns the route round; Previous undoes a Next made by mistake, still heading for the
+    // end (Matt, 2026-10-23: both stay).
+    const dialog = shown(onRoute([4, 1, 7], 2, 'turn-back'));
+    checkModal(dialog);
+    expect(dialogChoices(dialog).map(({ label, description }) => [label, description])).toEqual([
+      ['Next: turn back to The Stacks', undefined],
+      [
+        'Previous: back to The Stacks (undo)',
+        'Back one stop, still heading for the end: undoes a Next made by mistake',
+      ],
+      ['Skip The Stacks, go to Veterans Memorial Bridge', undefined],
+    ]);
+  });
+
+  it('cuts a long name in the undo’s label before " (undo)", and Next’s description holds it whole', () => {
+    const dialog = shown(onRoute([4, 92, 7], 2, 'turn-back'));
+    checkModal(dialog);
+    const [next, previous] = dialogChoices(dialog);
+    expect(RATHER_LONG.length).toBeGreaterThan(75);
+    expect(next?.label.startsWith('Next: turn back to A gym whose name')).toBe(true);
+    expect(next?.description).toBe(RATHER_LONG);
+    expect(previous?.label.startsWith('Previous: back to A gym whose name')).toBe(true);
+    expect(previous?.label.endsWith('… (undo)')).toBe(true);
+    expect(previous?.label.length).toBeLessThanOrEqual(100);
+    expect(previous?.description).toBe(
+      'Back one stop, still heading for the end: undoes a Next made by mistake',
+    );
+  });
+
+  it('leaves Previous out where it is the very move Next is (a loop of two stops)', () => {
+    for (const stop of [0, 1]) {
+      const dialog = shown(onRoute([4, 1], stop, 'loop'));
+      expect(dialogChoices(dialog)).toEqual([]);
+      expect(decodeCustomId(dialog.custom_id)?.args[1]).toBe('next');
+    }
+    // A loop of three keeps both.
+    expect(choices(onRoute([4, 1, 7], 0, 'loop')).map(([, label]) => label)).toEqual([
+      'Next: The Stacks',
+      'Previous: Harbor Lighthouse Mural',
+      'Skip The Stacks, go to Harbor Lighthouse Mural',
+    ]);
+  });
+
   it('has no choice where one move is left: the text says what Submit does, the id the move', () => {
     // A finished route: Previous alone, which takes a mistaken Finish back.
     const finished = onRoute([4, 1, 7], 3, 'finish', 1);
     const dialog = shown(finished);
     checkModal(dialog);
     expect(dialogChoices(dialog)).toEqual([]);
+    // Said once, and without Previous, which the dialog does not have (plan 8X-H, G3).
     expect(dialogTexts(dialog)).toEqual([
-      'The train has finished its route of 3 stops. Previous takes it back to stop 2: ' +
-        '**The Stacks**.\n\nSubmit takes it back to stop 2, **The Stacks**.',
+      'The train has finished its route of 3 stops.\n\n' +
+        'Submit takes it back to stop 2, **The Stacks**.',
     ]);
     expect(decodeCustomId(dialog.custom_id)?.args).toEqual([
       'end',
diff --git a/src/render/train-dialogs.ts b/src/render/train-dialogs.ts
index ade173171b1b5a810caa8d9e6fb9af09582b8e5f..c05d538fb77844e072555e8fca51b66e1abe8866 100644
--- a/src/render/train-dialogs.ts
+++ b/src/render/train-dialogs.ts
@@ -7,7 +7,7 @@ import {
   type TrainAtEnd,
   type TrainKind,
 } from '../domain/party/party.js';
-import { stopHandle, type StopRef } from '../domain/party/stops.js';
+import { sameStop, stopHandle, type StopRef } from '../domain/party/stops.js';
 import {
   cannotMove,
   cannotReverse,
@@ -139,12 +139,34 @@ function nextMove(view: TrainPlaces): OfferedMove {
   }
 }
 
-/** Where Previous takes the train, as Move… offers it; of a finished route, by its number. */
+/** What Previous beside "Next: turn back to" says it does (plan 8X-H, G2, Matt 2026-10-23). */
+export const UNDO_DESCRIPTION =
+  'Back one stop, still heading for the end: undoes a Next made by mistake';
+
+/**
+ * Where Previous takes the train, as Move… offers it; of a finished route, by its number. At the
+ * last stop of a turn-back route Next turns back to the very stop Previous goes to, but the route
+ * reversed (`train.ts`: Next reverses it, Previous keeps the direction): Previous is the undo of
+ * a Next made by mistake, after which the train still heads for the end, and says so (review
+ * R10: both stay).
+ */
 function previousMove(view: TrainPlaces): OfferedMove {
   const { party } = view;
   const to = destinationOf(party, 'previous');
   const ref = to.route[to.stop];
   const target = targetOf(party, 'previous');
+  if (!routeFinished(party) && turnAhead(party) === 'back') {
+    const prefix = 'Previous: back to ';
+    const suffix = ' (undo)';
+    return {
+      move: 'previous',
+      target,
+      label: `${prefix}${truncate(labelOf(view, ref), CHOICE_ROOM - prefix.length - suffix.length)}${suffix}`,
+      // The name whole, where cut, is Next's description: the same stop.
+      description: UNDO_DESCRIPTION,
+      sentence: endSentence(`Submit takes it back to ${boldOf(view, ref)}`),
+    };
+  }
   if (routeFinished(party)) {
     const number = `stop ${String(to.stop + 1)}`;
     return {
@@ -181,9 +203,25 @@ function skipMove(view: TrainPlaces): OfferedMove {
   };
 }
 
+/**
+ * Whether Previous leaves the train exactly where Next does, the route in the same order (a loop
+ * of two stops: both go to the other stop). The turn is not compared: at the end of a turn-back
+ * route Next reverses the route and Previous does not, so they differ (plan 8X-H, review R10).
+ */
+function previousIsNext(view: TrainPlaces): boolean {
+  const next = destinationOf(view.party, 'next');
+  const previous = destinationOf(view.party, 'previous');
+  return (
+    next.stop === previous.stop &&
+    next.route.length === previous.route.length &&
+    next.route.every((stop, index) => sameStop(stop, previous.route[index]))
+  );
+}
+
 /**
  * The moves Move… offers from where the train is, in the order Next, Previous, Skip; a move
- * that cannot be made from here (`cannotMove`) is left out, not shown switched off.
+ * that cannot be made from here (`cannotMove`) is left out, not shown switched off, and so is
+ * Previous where it is the very move Next is (`previousIsNext`, plan 8X-H, G2).
  */
 export function offeredMoves(view: TrainPlaces): OfferedMove[] {
   const offers: Record<DialogMove, (view: TrainPlaces) => OfferedMove> = {
@@ -191,28 +229,24 @@ export function offeredMoves(view: TrainPlaces): OfferedMove[] {
     previous: previousMove,
     skip: skipMove,
   };
-  return DIALOG_MOVES.filter((move) => cannotMove(view.party, move) === undefined).map((move) =>
-    offers[move](view),
-  );
+  const possible = DIALOG_MOVES.filter((move) => cannotMove(view.party, move) === undefined);
+  const same = possible.includes('next') && possible.includes('previous') && previousIsNext(view);
+  return possible
+    .filter((move) => !(same && move === 'previous'))
+    .map((move) => offers[move](view));
 }
 
 /**
  * Where the train is and what Next does, as Move… and Manage… say it at the top: the panel's
  * words (`At stop 2 of 4: X`, `Next is Y`), the stops in bold and without links (whether a
- * dialog's links can be clicked is not known); of a finished route where Previous leads.
+ * dialog's links can be clicked is not known); of a finished route only that it is (plan 8X-H,
+ * G3): Move… says once, under it, where Submit takes it; Manage… says nothing of Previous.
  */
 export function trainStateText(view: TrainPlaces): string {
   const { party } = view;
   const { route, stop } = party.train;
   if (routeFinished(party)) {
-    const back = destinationOf(party, 'previous');
-    return (
-      `The train has finished its route of ${count(route.length, 'stop')}. ` +
-      endSentence(
-        `Previous takes it back to stop ${String(back.stop + 1)}: ` +
-          boldOf(view, back.route[back.stop]),
-      )
-    );
+    return `The train has finished its route of ${count(route.length, 'stop')}.`;
   }
   const here = `At stop ${String(stop + 1)} of ${String(route.length)}: ${boldOf(view, currentStop(party))}`;
   const next = nextStop(party);
@@ -394,9 +428,7 @@ export function manageDialog(view: TrainDialogView): APIModalInteractionResponse
     customId,
     title: 'Manage the train',
     // Of a finished route only that it is: where Previous leads is Move…'s (review r0 B3).
-    text: routeFinished(party)
-      ? `The train has finished its route of ${count(party.train.route.length, 'stop')}.`
-      : trainStateText(view),
+    text: trainStateText(view),
     choices: [...(route === undefined ? [] : [route]), atEnd, kind],
   });
 }
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index 512bd2b5b29036b21a60ff0d97026afdc2d70f9d..43d70cce3f76b093e839067da93b7c03b6d3c9b8 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -874,36 +874,56 @@ describe('the controls of a train post', () => {
 
 describe('whereText', () => {
   it('says the last stop, a finished route and a train without a route, in the answer to a command', () => {
-    expect(whereText({ party: onRoute([4, 1], 1), stop: lookup(gym) })).toBe(
+    expect(whereText({ party: onRoute([4, 1], 1), stop: lookup(gym) }, 'command')).toBe(
       `The train is at stop 2 of 2: [The Stacks](<${maps(1)}>). ` +
         'It is the last stop: Next finishes the route.',
     );
-    expect(whereText({ party: onRoute([4, 1], 1, { atEnd: 'loop' }), stop: lookup(gym) })).toBe(
+    expect(
+      whereText({ party: onRoute([4, 1], 1, { atEnd: 'loop' }), stop: lookup(gym) }, 'command'),
+    ).toBe(
       `The train is at stop 2 of 2: [The Stacks](<${maps(1)}>). ` +
         `Next goes round to [Veterans Memorial Bridge](<${maps(4)}>).`,
     );
     expect(
-      whereText({ party: onRoute([4, 1, 7], 2, { atEnd: 'turn-back' }), stop: lookup(gym) }),
+      whereText(
+        { party: onRoute([4, 1, 7], 2, { atEnd: 'turn-back' }), stop: lookup(gym) },
+        'command',
+      ),
     ).toBe(
       `The train is at stop 3 of 3: [Harbor Lighthouse Mural](<${maps(7)}>). ` +
         `Next turns back to [The Stacks](<${maps(1)}>).`,
     );
     // A finished route says where Previous leads: to its last stop, or to the stop it was
     // finished from.
-    expect(whereText({ party: onRoute([4, 1], 2), stop: lookup(gym) })).toBe(
+    expect(whereText({ party: onRoute([4, 1], 2), stop: lookup(gym) }, 'command')).toBe(
       'The train has finished its route of 2 stops. ' +
-        `Previous takes it back to stop 2: [The Stacks](<${maps(1)}>).`,
+        `\`/previous\` takes it back to stop 2: [The Stacks](<${maps(1)}>).`,
     );
     expect(
-      whereText({ party: onRoute([4, 1, 7], 3, { finishedFrom: 4 }), stop: lookup(gym) }),
+      whereText(
+        { party: onRoute([4, 1, 7], 3, { finishedFrom: 4 }), stop: lookup(gym) },
+        'command',
+      ),
     ).toBe(
       'The train has finished its route of 3 stops. ' +
-        `Previous takes it back to stop 1: [Veterans Memorial Bridge](<${maps(4)}>).`,
+        `\`/previous\` takes it back to stop 1: [Veterans Memorial Bridge](<${maps(4)}>).`,
     );
-    expect(whereText({ party: testTrain(), stop: lookup(gym) })).toBe(
+    expect(whereText({ party: testTrain(), stop: lookup(gym) }, 'command')).toBe(
       'This train has no route yet. Add its stops with `/route add`.',
     );
   });
+
+  it('names what takes a finished route back where the member is: Move… on the post, Previous on the map', () => {
+    const finished = { party: onRoute([4, 1], 2), stop: lookup(gym) };
+    expect(whereText(finished, 'post')).toBe(
+      'The train has finished its route of 2 stops. ' +
+        `Move… takes it back to stop 2: [The Stacks](<${maps(1)}>).`,
+    );
+    expect(whereText(finished, 'map')).toBe(
+      'The train has finished its route of 2 stops. ' +
+        `Previous takes it back to stop 2: [The Stacks](<${maps(1)}>).`,
+    );
+  });
 });
 
 describe('movementText', () => {
diff --git a/src/render/train-words.ts b/src/render/train-words.ts
index 5ca8633c3de8c383b550ad534e7d8e194f084e39..cbac2ee1acc42f9c7c8688be17ba1884daa6cdcd 100644
--- a/src/render/train-words.ts
+++ b/src/render/train-words.ts
@@ -137,15 +137,33 @@ function nextWords(view: TrainPlaces, link: (stop: PostStop) => string): string
   }
 }
 
-/** Of a finished route: where Previous takes the train back to. */
-function finishedWords(view: TrainPlaces, link: (stop: PostStop) => string): string {
+/**
+ * Where a member moves a train from (plan 8X-H, G3): a typed command (`/previous`), the post
+ * (Move…, which has no Previous of its own: the dialog offers it), or the live map's panel, which
+ * has a Previous button.
+ */
+export type TrainSurface = 'command' | 'post' | 'map';
+
+/** What takes a finished route back, named as the member has it where they moved the train. */
+const BACK_FROM_THE_END: Readonly<Record<TrainSurface, string>> = {
+  command: '`/previous`',
+  post: 'Move…',
+  map: 'Previous',
+};
+
+/** Of a finished route: what takes the train back, and to where. */
+function finishedWords(
+  view: TrainPlaces,
+  link: (stop: PostStop) => string,
+  surface: TrainSurface,
+): string {
   const { route } = view.party.train;
   const back = destinationOf(view.party, 'previous').stop;
   const ref = route[back];
   return (
     `The train has finished its route of ${count(route.length, 'stop')}. ` +
     endSentence(
-      `Previous takes it back to stop ${back + 1}: ` +
+      `${BACK_FROM_THE_END[surface]} takes it back to stop ${back + 1}: ` +
         (ref === undefined ? '' : link(view.stop(ref))),
     )
   );
@@ -156,16 +174,17 @@ export const NO_ROUTE_YET = 'This train has no route yet. Add its stops with `/r
 
 /**
  * Where a train is on its route and what comes next, as a member is told it in the answer to a
- * move (`/next` and the others, Move…'s and Manage…'s Submit). Of a finished route it says where
- * Previous leads, which is how a Finish that was a mistake is taken back: to the stop the train
- * was at, or to the last stop of a route that remembers none.
+ * move (`/next` and the others, Move…'s and Manage…'s Submit, the map's panel). Of a finished
+ * route it says where Previous leads, which is how a Finish that was a mistake is taken back: to
+ * the stop the train was at, or to the last stop of a route that remembers none; Previous named
+ * as the member has it there (`surface`: `/previous`, Move…, the map's Previous).
  */
-export function whereText(view: TrainPlaces): string {
+export function whereText(view: TrainPlaces, surface: TrainSurface): string {
   const { party } = view;
   const { route, stop } = party.train;
   if (route.length === 0) return NO_ROUTE_YET;
   const link = (shown: PostStop) => stopLink(shown);
-  if (routeFinished(party)) return finishedWords(view, link);
+  if (routeFinished(party)) return finishedWords(view, link, surface);
   const at = currentStop(party);
   const here = endSentence(
     `The train is at stop ${stop + 1} of ${route.length}: ${at === undefined ? '' : link(view.stop(at))}`,
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index 9cd8deaf677d8ddd414e2ac363ef6d3f5c192514..a6161de651c58c56d3062b8ad0621b25f02af6cd 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -664,9 +664,18 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
           case 'kind':
             return setKindAs(ctx, party, member, staff, input.kind);
           case 'finish':
-            return moveTrainAs(ctx, party, member, 'finish', staff, input.from);
+            return moveTrainAs(ctx, party, member, 'finish', staff, 'map', input.from);
           default:
-            return moveTrainAs(ctx, party, member, input.press, staff, input.from, input.target);
+            return moveTrainAs(
+              ctx,
+              party,
+              member,
+              input.press,
+              staff,
+              'map',
+              input.from,
+              input.target,
+            );
         }
       });
       if (input.press === 'kind') {
````

### Task 3: 8X-H 3: Summary: a start or end more than a day ahead by date and time

Prototype commit: `2d1114fba04813125133427589e6247255f6c4fc`

G4 (Matt, 2026-10-23): Discord rounds a relative stamp ("in 4 days" for 3 days
and 15 hours); a timed party's start or end more than a day ahead is written
as Discord's date-and-time stamp (`<t:…:f>`), drawn in each reader's own time
zone with daylight saving; within a day the relative stamp stays.

**Files:**

```
 src/render/summary.test.ts | 16 ++++++++++++++++
 src/render/summary.ts      | 18 ++++++++++++++++--
 2 files changed, 32 insertions(+), 2 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/summary.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 2d1114fba04813125133427589e6247255f6c4fc -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-23-phase-8xh-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-H 3: Summary: a start or end more than a day ahead by date and time`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/render/summary.test.ts b/src/render/summary.test.ts
index 5316ef06ac9fc9d6c76d934015fadefd43481d64..e7463a42e90dfc91d912e7dd8ef8525731c35827 100644
--- a/src/render/summary.test.ts
+++ b/src/render/summary.test.ts
@@ -288,6 +288,22 @@ describe('renderSummary with meetups', () => {
     ]);
   });
 
+  it('says a start or end more than a day ahead as a date and time, which each reader’s Discord shows in their own zone (plan 8X-H, G4)', () => {
+    // Discord rounds a relative stamp ("in 4 days" for 3 days and 15 hours); its date-and-time
+    // stamp is drawn from the epoch in each viewer's time zone, daylight saving included.
+    const dated = (time: number) => `<t:${time / 1000}:f>`;
+    const later = meetup(1, { start: PARTY_NOW + 87 * HOUR });
+    const ending = meetup(2, { start: PARTY_NOW - HOUR, end: PARTY_NOW + 30 * HOUR });
+    const day = meetup(3, { start: PARTY_NOW + 24 * HOUR });
+    const lines = linesUnder(renderSummary([], PARTY_NOW, [later, ending, day]), '**Meetups**');
+    expect(lines).toEqual([
+      `${link(ending)} · ends ${dated(PARTY_NOW + 30 * HOUR)} · 1 trainer`,
+      // Within a day, the relative stamp as before.
+      `${link(day)} · starts ${stamp(PARTY_NOW + 24 * HOUR)} · 1 trainer`,
+      `${link(later)} · starts ${dated(PARTY_NOW + 87 * HOUR)} · 1 trainer`,
+    ]);
+  });
+
   it('orders them by their start, then those without one as they were made', () => {
     const late = meetup(1, { start: PARTY_NOW + 5 * HOUR });
     const second = meetup(3);
diff --git a/src/render/summary.ts b/src/render/summary.ts
index b730f4f38041273bb87b5e422264598c38d291be..311c0fc12f7ab3c551de99f9c17ef955d42076f0 100644
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -103,11 +103,25 @@ export const MEETUPS_HEADING = '**Meetups**';
  */
 const SECTION_ROOM = 600;
 
+/** How far ahead a time is said relatively ("in 5 hours"); beyond it, by date and time. */
+const RELATIVE_WITHIN_MS = 24 * 60 * 60_000;
+
+/**
+ * A time ahead in a list (plan 8X-H, G4, Matt 2026-10-23): within a day Discord's relative stamp;
+ * beyond it, which Discord rounds ("in 4 days" for 3 days and 15 hours), its date-and-time stamp
+ * (`f`), which each reader's client draws from the epoch in their own time zone, daylight saving
+ * included. The switch to the relative stamp comes at the summary's next draw (at the latest the
+ * hourly upkeep); a date and time is never wrong meanwhile.
+ */
+function ahead(time: number, now: number): string {
+  return timestamp(time, time - now > RELATIVE_WITHIN_MS ? 'f' : 'R');
+}
+
 /** When a timed party starts or ends, whichever is said of it now. */
 function timedWhen(party: TimedParty, now: number): string {
   const start = startTimeOf(party);
-  if (start !== null && now < start) return `starts ${timestamp(start, 'R')}`;
-  if (party.endTime !== null) return `ends ${timestamp(party.endTime, 'R')}`;
+  if (start !== null && now < start) return `starts ${ahead(start, now)}`;
+  if (party.endTime !== null) return `ends ${ahead(party.endTime, now)}`;
   return start === null ? 'no time set' : `started ${timestamp(start, 'R')}`;
 }
 
````

### Task 4: 8X-H 4: Logging: the network away is a warning, a line when a read ran

Prototype commit: `63efc1ddba1848da386db139246928087de36bd4`

G5's logging (items 6 and 7, review R8, R9, R15): a failure for the network
(`isNetworkError`: the codes of a lost network and time limits, through the
causes, also @discordjs/rest's abort after 15 s and Discord's 5xx; never a
mysql2 error, the database away being for a person: review r0 A1, A2) is a
warning in the raid and max boss syncs, the game data refresh and the updates
of a post or a summary, an error otherwise; the sweep of ended parties' posts
says the failures that are no refusal of Discord's once per sweep with how
many forums and the first of them, a refusal by forum as before. Debug lines
when a boss feed read changed nothing (with how many bosses), when the sweep
ran (archived, the forums looked through and those that failed) and when the
application's emoji were read (how many).

**Files:**

```
 src/services/application-emoji.test.ts |  20 ++++++++++++++++++++
 src/services/application-emoji.ts      |   2 ++
 src/services/boss-feed-service.ts      |  18 ++++++++++++++++--
 src/services/game-data-service.test.ts |   6 ++++--
 src/services/game-data-service.ts      |  13 +++++++++++--
 src/services/network-error.test.ts     | 108 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/network-error.ts          |  84 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/party-service.end.test.ts |  52 ++++++++++++++++++++++++++++++++++++++++++++++++----
 src/services/party-service.test.ts     |  20 ++++++++++++++++++++
 src/services/party-service.ts          |  43 +++++++++++++++++++++++++++++++++++++------
 src/services/raid-boss-service.test.ts |  30 ++++++++++++++++++++++++++++++
 11 files changed, 380 insertions(+), 16 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/services/application-emoji.test.ts src/services/game-data-service.test.ts src/services/network-error.test.ts src/services/party-service.end.test.ts src/services/party-service.test.ts src/services/raid-boss-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 63efc1ddba1848da386db139246928087de36bd4 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-23-phase-8xh-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-H 4: Logging: the network away is a warning, a line when a read ran`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/services/application-emoji.test.ts b/src/services/application-emoji.test.ts
index 944d7119787e19ca0f6e2efc71270bda3f384aad..e80d0f7f6e4004423d823405cd36fcf7ea8f8914 100644
--- a/src/services/application-emoji.test.ts
+++ b/src/services/application-emoji.test.ts
@@ -15,6 +15,26 @@ describe('ApplicationEmoji', () => {
     expect(emoji.get('ice')).toBeUndefined();
   });
 
+  it('says at debug how many emoji a read found (plan 8X-H)', async () => {
+    const { log, entries } = createTestLogger();
+    const emoji = new ApplicationEmoji(
+      {
+        list: () =>
+          Promise.resolve(
+            new Map([
+              ['rock', '<:rock:1>'],
+              ['ice', '<:ice:2>'],
+            ]),
+          ),
+      },
+      log,
+    );
+    await emoji.refresh();
+    expect(entries).toEqual([
+      expect.objectContaining({ level: 20, msg: 'read the emoji of the application', emoji: 2 }),
+    ]);
+  });
+
   it('keeps the last good list when a read fails, and says so', async () => {
     const { log, entries } = createTestLogger();
     let fail = false;
diff --git a/src/services/application-emoji.ts b/src/services/application-emoji.ts
index a2a9d07d1bd72b60e9ab58770ee64c1353bf17f5..5342beb10ba6d01550c263cb7bbb74f50d360122 100644
--- a/src/services/application-emoji.ts
+++ b/src/services/application-emoji.ts
@@ -63,6 +63,8 @@ export class ApplicationEmoji {
       .then((found) => {
         const changed = !sameEmoji(this.known, found);
         this.known = found;
+        // So that a read can be seen to have run (plan 8X-H: after an outage).
+        this.log.debug({ emoji: found.size }, 'read the emoji of the application');
         if (changed) this.listener?.();
       })
       .catch((err: unknown) => {
diff --git a/src/services/boss-feed-service.ts b/src/services/boss-feed-service.ts
index 8678d2d4b3a8d0e1bb6ca18f50aeef7d5a625956..29ac63bb9db7875ad6832df2f2ad6560af88769d 100644
--- a/src/services/boss-feed-service.ts
+++ b/src/services/boss-feed-service.ts
@@ -469,7 +469,15 @@ export class BossFeedService<T> implements BossAdmin<T> {
       }
       this.failures++;
       const reason = err instanceof Error ? err.message : String(err);
-      this.safely(() => this.options.log.error({ err }, `could not sync the ${noun}es`));
+      // A feed out of reach (the network away) is retried by itself: a warning (plan 8X-H). A
+      // feed it cannot read, or a store that failed, needs a person.
+      const offline =
+        err instanceof FeedFailure && (err.kind === 'unreachable' || err.kind === 'timeout');
+      this.safely(() =>
+        offline
+          ? this.options.log.warn({ err }, `could not sync the ${noun}es`)
+          : this.options.log.error({ err }, `could not sync the ${noun}es`),
+      );
       this.reportIfStale(now, reason);
       if (err instanceof FeedFailure) {
         return {
@@ -486,7 +494,13 @@ export class BossFeedService<T> implements BossAdmin<T> {
     this.syncedAt = now;
     this.staleReported = false;
     const remarks = this.remarks(before, this.feed.length);
-    if (!seen) return { status: 'unchanged', ...remarks };
+    if (!seen) {
+      // So that a read can be seen to have run (plan 8X-H: after an outage).
+      this.safely(() =>
+        this.options.log.debug({ bosses: this.feed.length }, `${noun}es read, unchanged`),
+      );
+      return { status: 'unchanged', ...remarks };
+    }
     this.safely(() =>
       this.options.log.info(
         {
diff --git a/src/services/game-data-service.test.ts b/src/services/game-data-service.test.ts
index 2f249d19def55e668a975283fa3d5fc7ad96279f..28ab3a4c79ef23f6178d77621246dd66b0f71183 100644
--- a/src/services/game-data-service.test.ts
+++ b/src/services/game-data-service.test.ts
@@ -322,7 +322,7 @@ describe('GameDataService', () => {
     await gameData.load();
     expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
     expect(gameData.fetchedAt).toBe(firstFetch);
-    expect(entries.some((e) => e.level === 50 && e.msg === 'could not refresh the game data')).toBe(
+    expect(entries.some((e) => e.level === 40 && e.msg === 'could not refresh the game data')).toBe(
       true,
     );
     expect(entries.some((e) => e.level === 40 && String(e.msg).includes('out of date'))).toBe(true);
@@ -373,7 +373,7 @@ describe('GameDataService', () => {
     timeouts.expire();
     await loading;
     expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
-    expect(entries.some((e) => e.level === 50 && e.msg === 'could not refresh the game data')).toBe(
+    expect(entries.some((e) => e.level === 40 && e.msg === 'could not refresh the game data')).toBe(
       true,
     );
   });
@@ -485,6 +485,8 @@ describe('GameDataService', () => {
           e.msg === 'could not refresh the game data' && JSON.stringify(e).includes('English name'),
       ),
     ).toBe(true);
+    // Data that is wrong needs a person: an error, unlike a network away (plan 8X-H).
+    expect(entries.find((e) => e.msg === 'could not refresh the game data')?.level).toBe(50);
     await expect(rm(cachePath)).rejects.toThrow();
   });
 
diff --git a/src/services/game-data-service.ts b/src/services/game-data-service.ts
index 23a6d867441dcfd2204db1fa51804dd24b2f8820..f0f26bc04ea7e947d7ed746e952d9e7c3985b683 100644
--- a/src/services/game-data-service.ts
+++ b/src/services/game-data-service.ts
@@ -7,6 +7,9 @@ import { parseTextFile } from '../domain/pogo/text.js';
 import type { Logger } from '../log.js';
 import { failureReason } from './failure-reason.js';
 
+/** A download that got no answer: the request or its body failed, or ran out of time. */
+class DownloadFailure extends Error {}
+
 /** The longest delay `setTimeout` accepts; anything longer fires immediately. */
 const MAX_TIMER_MS = 2 ** 31 - 1;
 const MINUTE_MS = 60_000;
@@ -305,7 +308,13 @@ export class GameDataService implements GameDataProvider {
       cache = { version: GAME_DATA_VERSION, fetchedAt: this.now(), data };
     } catch (err) {
       this.lastFailure = err instanceof Error ? err.message : String(err);
-      this.options.log.error({ err }, 'could not refresh the game data');
+      // A download that never got an answer (the network away, a time limit) is tried again by
+      // itself: a warning (plan 8X-H). Data that is wrong needs a person.
+      if (err instanceof DownloadFailure) {
+        this.options.log.warn({ err }, 'could not refresh the game data');
+      } else {
+        this.options.log.error({ err }, 'could not refresh the game data');
+      }
       // A newer list of icons is used all the same; it is saved with the next good refresh.
       this.iconList = (await listed) ?? this.iconList;
       return false;
@@ -405,7 +414,7 @@ export class GameDataService implements GameDataProvider {
   /** undici's `fetch failed` hides the real reason in `cause`; say which address failed and why. */
   private downloadFailure(url: string, err: unknown, signal: AbortSignal): Error {
     const reason = signal.aborted ? `timed out after ${this.timeoutMs} ms` : failureReason(err);
-    return new Error(`${url}: ${reason}`, { cause: err });
+    return new DownloadFailure(`${url}: ${reason}`, { cause: err });
   }
 
   /** A saved copy is usable only if it has the current version, is complete and builds a catalogue. */
diff --git a/src/services/network-error.test.ts b/src/services/network-error.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..910e9b0ddafc5b8467716ab38344bac3982fe071
--- /dev/null
+++ b/src/services/network-error.test.ts
@@ -0,0 +1,108 @@
+import { HTTPError } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { missingPermissions } from '../../test/support/fake-gateway.js';
+import { isNetworkError } from './network-error.js';
+
+/** An error of Node's resolver or sockets, with its code, as undici puts it in `cause`. */
+function systemError(code: string, message = `connect ${code} 162.159.135.232:443`): Error {
+  return Object.assign(new Error(message), { code });
+}
+
+describe('isNetworkError (plan 8X-H)', () => {
+  it('takes what a lost network gives: no name, no route, no answer', () => {
+    for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']) {
+      expect(
+        isNetworkError(new TypeError('fetch failed', { cause: systemError(code) })),
+        code,
+      ).toBe(true);
+      expect(isNetworkError(systemError(code)), code).toBe(true);
+    }
+    // undici's own timeouts, and a time limit of `AbortSignal.timeout`.
+    const connect = Object.assign(new Error('Connect Timeout Error'), {
+      name: 'ConnectTimeoutError',
+      code: 'UND_ERR_CONNECT_TIMEOUT',
+    });
+    expect(isNetworkError(new TypeError('fetch failed', { cause: connect }))).toBe(true);
+    expect(isNetworkError(new DOMException('The operation timed out.', 'TimeoutError'))).toBe(true);
+    // A download's failure that names the address and keeps the cause (the game data's).
+    expect(
+      isNetworkError(
+        new Error('https://x.test: getaddrinfo ENOTFOUND x.test', {
+          cause: new TypeError('fetch failed', { cause: systemError('ENOTFOUND') }),
+        }),
+      ),
+    ).toBe(true);
+    // Only the words, as some wrappers leave them.
+    expect(isNetworkError(new Error('getaddrinfo ENOTFOUND discord.com'))).toBe(true);
+  });
+
+  it('leaves out what a person must look at: Discord’s refusals and the code’s own errors', () => {
+    expect(isNetworkError(missingPermissions('PATCH'))).toBe(false);
+    expect(
+      isNetworkError(new TypeError("Cannot read properties of undefined (reading 'id')")),
+    ).toBe(false);
+    expect(isNetworkError(new Error('500'))).toBe(false);
+    expect(isNetworkError('ENOTFOUND')).toBe(false);
+    expect(isNetworkError(undefined)).toBe(false);
+  });
+
+  it('takes the abort of a request that ran out of time, and Discord’s 5xx through its edge', () => {
+    // @discordjs/rest aborts a request after 15 s: a DOMException named AbortError, or undici's
+    // RequestAbortedError.
+    expect(isNetworkError(new DOMException('This operation was aborted', 'AbortError'))).toBe(true);
+    const undiciAbort = Object.assign(new Error('Request aborted'), {
+      name: 'AbortError',
+      code: 'UND_ERR_ABORTED',
+    });
+    expect(isNetworkError(undiciAbort)).toBe(true);
+    expect(isNetworkError(Object.assign(new Error('aborted'), { code: 'UND_ERR_ABORTED' }))).toBe(
+      true,
+    );
+    // Discord's 5xx (a bad gateway of Cloudflare's) as @discordjs/rest throws it.
+    expect(isNetworkError(new HTTPError(502, 'Bad Gateway', 'PATCH', '/x', {}))).toBe(true);
+    expect(isNetworkError(new HTTPError(503, 'Service Unavailable', 'GET', '/x', {}))).toBe(true);
+    // A 4xx without Discord's error body is not the network's.
+    expect(isNetworkError(new HTTPError(413, 'Payload Too Large', 'POST', '/x', {}))).toBe(false);
+  });
+
+  it('leaves out the database going away: a mysql2 error is not the network’s', () => {
+    expect(
+      isNetworkError(
+        Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), {
+          code: 'ECONNREFUSED',
+          fatal: true,
+        }),
+      ),
+    ).toBe(false);
+    expect(
+      isNetworkError(
+        Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET', sqlState: 'HY000' }),
+      ),
+    ).toBe(false);
+    expect(
+      isNetworkError(
+        Object.assign(new Error('Connection lost: The server closed the connection.'), {
+          code: 'PROTOCOL_CONNECTION_LOST',
+          fatal: true,
+        }),
+      ),
+    ).toBe(false);
+    // Also when the query's error wraps it.
+    expect(
+      isNetworkError(
+        new Error('query failed', {
+          cause: Object.assign(new Error('connect ETIMEDOUT'), {
+            code: 'ETIMEDOUT',
+            fatal: true,
+          }),
+        }),
+      ),
+    ).toBe(false);
+  });
+
+  it('stops at a cause that refers back to itself', () => {
+    const looped = new Error('loop');
+    (looped as { cause?: unknown }).cause = looped;
+    expect(isNetworkError(looped)).toBe(false);
+  });
+});
diff --git a/src/services/network-error.ts b/src/services/network-error.ts
new file mode 100644
index 0000000000000000000000000000000000000000..62c37aa2e7ea447bdeffa5e08a0675ecfe75bdf3
--- /dev/null
+++ b/src/services/network-error.ts
@@ -0,0 +1,84 @@
+import { HTTPError } from 'discord.js';
+
+/**
+ * The codes of Node's resolver and sockets, and of undici, that a network gone away gives: no
+ * name (DNS away: `ENOTFOUND` on Windows, `EAI_AGAIN` in Docker), no route, no answer, a
+ * connection cut.
+ */
+const NETWORK_CODES = [
+  'ENOTFOUND',
+  'EAI_AGAIN',
+  'ECONNRESET',
+  'ECONNREFUSED',
+  'ECONNABORTED',
+  'ETIMEDOUT',
+  'ENETUNREACH',
+  'ENETDOWN',
+  'EHOSTUNREACH',
+  'EPIPE',
+  'UND_ERR_CONNECT_TIMEOUT',
+  'UND_ERR_HEADERS_TIMEOUT',
+  'UND_ERR_BODY_TIMEOUT',
+  'UND_ERR_SOCKET',
+  'UND_ERR_ABORTED',
+] as const;
+
+/**
+ * The names of the errors a request's time limit gives (`AbortSignal.timeout`, undici's, and the
+ * abort with which @discordjs/rest ends a request after its 15 s).
+ */
+const TIMEOUT_NAMES = new Set([
+  'TimeoutError',
+  'AbortError',
+  'ConnectTimeoutError',
+  'HeadersTimeoutError',
+  'BodyTimeoutError',
+]);
+
+/** A code of `NETWORK_CODES` as a word of a message (`getaddrinfo ENOTFOUND discord.com`). */
+const NETWORK_WORDS = new RegExp(`\\b(?:${NETWORK_CODES.join('|')})\\b`);
+
+/**
+ * Whether an error is mysql2's: the database gone away is an outage of its own, for a person to look
+ * at, even when its code is a socket's (`ECONNREFUSED` with `fatal`, a `PROTOCOL_*` code).
+ */
+function isDatabaseError(err: Error): boolean {
+  const { code, fatal, sqlState } = err as { code?: unknown; fatal?: unknown; sqlState?: unknown };
+  return (
+    typeof fatal === 'boolean' ||
+    typeof sqlState === 'string' ||
+    (typeof code === 'string' && code.startsWith('PROTOCOL_'))
+  );
+}
+
+/** How deep a chain of causes is followed. */
+const MAX_CAUSES = 8;
+
+/**
+ * Whether an error is the network's, not something a person must look at (plan 8X-H): a request
+ * that could not reach its host or whose connection went away, or that ran out of time, by its
+ * code, its name or the code in its message, on the error or any cause of it (undici's `fetch
+ * failed` keeps the reason in `cause`); also Discord's 5xx (`HTTPError`, its edge's bad gateway). A
+ * refusal of Discord's (`DiscordAPIError`, a 4xx), the database gone away (a mysql2 error, also with
+ * a socket's code) and an error of the code are not. Such failures are logged at `warn`; the rest
+ * stays `error`.
+ */
+export function isNetworkError(err: unknown): boolean {
+  const seen = new Set<unknown>();
+  let current: unknown = err;
+  for (let depth = 0; depth < MAX_CAUSES && current instanceof Error; depth++) {
+    if (seen.has(current)) return false;
+    seen.add(current);
+    if (isDatabaseError(current)) return false;
+    // Discord's 5xx (Cloudflare's bad gateway and the like), without Discord's error body.
+    if (current instanceof HTTPError) return current.status >= 500;
+    const code: unknown = (current as { code?: unknown }).code;
+    if (typeof code === 'string' && (NETWORK_CODES as readonly string[]).includes(code)) {
+      return true;
+    }
+    if (TIMEOUT_NAMES.has(current.name)) return true;
+    if (NETWORK_WORDS.test(current.message)) return true;
+    current = current.cause;
+  }
+  return false;
+}
diff --git a/src/services/party-service.end.test.ts b/src/services/party-service.end.test.ts
index bd8fc2c0844e04714bf83136393da603d2204ce7..36d4b64ca9dbf2b31ed0980df71d57e6a0557209 100644
--- a/src/services/party-service.end.test.ts
+++ b/src/services/party-service.end.test.ts
@@ -1,5 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import { watchEachTest } from '../../test/support/timers.js';
+import { missingPermissions } from '../../test/support/fake-gateway.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { ALICE, BOB } from '../../test/support/parties.js';
 import { reportedRaid } from '../../test/support/party-service.js';
@@ -252,15 +253,58 @@ describe('PartyService.sweepPosts', () => {
     expect(await service.sweepPosts()).toBe(0);
   });
 
+  it('says a sweep the network failed once, with how many forums, and Discord’s refusals by forum (plan 8X-H)', async () => {
+    const made = await reportedRaid();
+    const looked = () =>
+      made.entries.filter(
+        (entry) =>
+          entry.msg === 'could not look for open posts of ended parties' ||
+          entry.msg === 'could not sweep the posts of ended parties',
+      );
+    made.gateway.failing.set(
+      'openPosts',
+      new TypeError('fetch failed', {
+        cause: Object.assign(new Error('getaddrinfo ENOTFOUND discord.com'), { code: 'ENOTFOUND' }),
+      }),
+    );
+    expect(await made.service.sweepPosts()).toBe(0);
+    expect(looked()).toEqual([
+      expect.objectContaining({
+        level: 40,
+        msg: 'could not sweep the posts of ended parties',
+        forums: 2,
+        forum: WEST_FORUM,
+      }),
+    ]);
+    // The debug line counts only the forums looked through.
+    expect(
+      made.entries.filter((entry) => entry.msg === 'swept the posts of ended parties'),
+    ).toEqual([expect.objectContaining({ level: 20, forums: 0, failed: 2 })]);
+    // A refusal of Discord's is about that forum: said for each.
+    made.gateway.failing.set('openPosts', missingPermissions('GET'));
+    await made.service.sweepPosts();
+    expect(looked().slice(1)).toEqual([
+      expect.objectContaining({ level: 40, msg: 'could not look for open posts of ended parties' }),
+      expect.objectContaining({ level: 40, msg: 'could not look for open posts of ended parties' }),
+    ]);
+  });
+
+  it('says at debug what a sweep archived (plan 8X-H)', async () => {
+    const made = await reportedRaid();
+    await made.service.sweepPosts();
+    expect(
+      made.entries.filter((entry) => entry.msg === 'swept the posts of ended parties'),
+    ).toEqual([expect.objectContaining({ level: 20, archived: 0, forums: 2, failed: 0 })]);
+  });
+
   it('goes on with the other forums when one cannot be listed', async () => {
     const made = await reportedRaid();
     made.gateway.failing.set('openPosts', new Error('no'));
     expect(await made.service.sweepPosts()).toBe(0);
+    // Both forums were asked; their failure, no refusal of Discord's, is said once (plan 8X-H).
     expect(
-      made.entries.filter(
-        (entry) => entry.msg === 'could not look for open posts of ended parties',
-      ),
-    ).toHaveLength(2);
+      made.entries.filter((entry) => entry.msg === 'could not sweep the posts of ended parties'),
+    ).toEqual([expect.objectContaining({ forums: 2 })]);
   });
 });
 
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index 078227dfb92723c3170261dceac3f09fd264a791..64d5167bb4487376b0301257349333df3334c44c 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -387,6 +387,26 @@ describe('PartyService: keeping posts up to date', () => {
     );
   });
 
+  it('warns of an edit that failed for the network, and errors for any other failure (plan 8X-H)', async () => {
+    const { service, store, gateway, party, entries } = await withRaid();
+    const failed = () => entries.filter((entry) => entry.msg === 'could not update a party post');
+    gateway.failing.set(
+      'editPost',
+      new TypeError('fetch failed', {
+        cause: Object.assign(new Error('getaddrinfo ENOTFOUND discord.com'), { code: 'ENOTFOUND' }),
+      }),
+    );
+    await store.update(party.id, (p) => setAttendance(p, ALICE, PartyStatus.Coming, {}, limits));
+    service.changed(party.id);
+    await service.flush();
+    expect(failed().map((entry) => entry.level)).toEqual([40]);
+    gateway.failing.set('editPost', new Error('500'));
+    await store.update(party.id, (p) => setAttendance(p, ALICE, PartyStatus.Present, {}, limits));
+    service.changed(party.id);
+    await service.flush();
+    expect(failed().map((entry) => entry.level)).toEqual([40, 50]);
+  });
+
   it('logs a failed edit and tries again with the next change', async () => {
     const { service, store, gateway, party, postId, entries } = await withRaid();
     gateway.failing.set('editPost', new Error('500'));
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index d74d4c837ef3dda20330474f647af4ef844ee238..f2ccb200584210a9fdb45e3a60589a5084a2ed0a 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -1,4 +1,5 @@
 import { DiscordAPIError } from 'discord.js';
+import { isNetworkError } from './network-error.js';
 import type { Settings } from '../config/settings.js';
 import type { Gym } from '../db/repositories/gym-repository.js';
 import type { Region } from '../db/repositories/region-repository.js';
@@ -708,12 +709,20 @@ export class PartyService {
     this.posts = new Coalescer({
       delayMs,
       work: (partyId) => this.renderPost(partyId),
-      onError: (err, party) => options.log.error({ err, party }, 'could not update a party post'),
+      // The network away is a warning (plan 8X-H: the catch-up shows the posts anew once the
+      // gateway is back); anything else needs a person.
+      onError: (err, party) =>
+        isNetworkError(err)
+          ? options.log.warn({ err, party }, 'could not update a party post')
+          : options.log.error({ err, party }, 'could not update a party post'),
     });
     this.summaries = new Coalescer({
       delayMs,
       work: (regionId) => this.renderSummary(regionId),
-      onError: (err, region) => options.log.error({ err, region }, 'could not update a summary'),
+      onError: (err, region) =>
+        isNetworkError(err)
+          ? options.log.warn({ err, region }, 'could not update a summary')
+          : options.log.error({ err, region }, 'could not update a summary'),
     });
     options.wayspots?.whenChanged(() => {
       this.wayspotsChanged();
@@ -2531,9 +2540,14 @@ export class PartyService {
     } catch (err) {
       log.warn({ err }, 'could not list the forums that parties name');
     }
+    // Forums whose look failed for anything but a refusal of Discord's (the network away, most
+    // likely): one warning for the sweep, not one per forum (plan 8X-H: thirty in an outage).
+    const failed: { forum: string; err: unknown }[] = [];
+    let swept = 0;
     for (const [forumId, regionId] of forums) {
       // Only what the bot still knows as a forum: a forum deleted by hand is asked nothing.
       if (gateway.channelKind(forumId) !== 'forum') continue;
+      swept++;
       try {
         const open = (await gateway.openPosts(forumId)) ?? [];
         for (const postId of await store.endedPosts(open)) {
@@ -2548,12 +2562,29 @@ export class PartyService {
           }
         }
       } catch (err) {
-        log.warn(
-          { err, region: regionId, forum: forumId },
-          'could not look for open posts of ended parties',
-        );
+        if (err instanceof DiscordAPIError) {
+          // About this forum (Missing Access): named, for a person to look at.
+          log.warn(
+            { err, region: regionId, forum: forumId },
+            'could not look for open posts of ended parties',
+          );
+        } else {
+          failed.push({ forum: forumId, err });
+        }
       }
     }
+    const [first] = failed;
+    if (first) {
+      log.warn(
+        { err: first.err, forum: first.forum, forums: failed.length, archived },
+        'could not sweep the posts of ended parties',
+      );
+    }
+    // So that a sweep can be seen to have run (plan 8X-H: after an outage).
+    log.debug(
+      { archived, forums: swept - failed.length, failed: failed.length },
+      'swept the posts of ended parties',
+    );
     return archived;
   }
 
diff --git a/src/services/raid-boss-service.test.ts b/src/services/raid-boss-service.test.ts
index 171b2f62b8137aba1d58781f190b44d2d9e50b22..2f2559df603e7bfde09d99d3bdc06631419e099e 100644
--- a/src/services/raid-boss-service.test.ts
+++ b/src/services/raid-boss-service.test.ts
@@ -685,6 +685,36 @@ describe('RaidBossService', () => {
       expect(entries.some((e) => e['msg'] === 'could not sync the raid bosses')).toBe(true);
     });
 
+    it('warns of a feed out of reach (the network away), and errors for one it cannot read', async () => {
+      const { raidBosses, entries } = service();
+      await raidBosses.load();
+      const failed = () => entries.filter((e) => e['msg'] === 'could not sync the raid bosses');
+      respond = () =>
+        Promise.reject(
+          new TypeError('fetch failed', {
+            cause: Object.assign(new Error('getaddrinfo ENOTFOUND example.test'), {
+              code: 'ENOTFOUND',
+            }),
+          }),
+        );
+      await raidBosses.sync();
+      expect(failed().map((e) => e['level'])).toEqual([40]);
+      respond = () => Promise.resolve(reply(200, 'not json'));
+      await raidBosses.sync();
+      expect(failed().map((e) => e['level'])).toEqual([40, 50]);
+    });
+
+    it('says at debug that a read changed nothing, with how many bosses (plan 8X-H)', async () => {
+      const { raidBosses, entries } = service();
+      await raidBosses.load();
+      await raidBosses.sync();
+      now += HOUR;
+      expect(await raidBosses.sync()).toEqual({ status: 'unchanged' });
+      expect(entries.filter((e) => e['msg'] === 'raid bosses read, unchanged')).toEqual([
+        expect.objectContaining({ level: 20, bosses: 14 }),
+      ]);
+    });
+
     it('gives up on a download that stalls', async () => {
       const { raidBosses } = service({ timeoutMs: 20 });
       await raidBosses.load();
````

### Task 5: 8X-H 5: Gateway: a watch for the return after a real disconnect

Prototype commit: `365f41e940efe3db0447cc30695ac345e929908b`

G5 (review R2): `GatewayWatch` (`gateway-events.ts`) is armed by the login's
ready; the first `ShardReconnecting` marks the gateway away (a shard error
while connected starts nothing: review r0 B8), `ShardResume` or `ShardReady`
brings it back, for real when it was away 30 seconds or more (from the last
heartbeat acknowledged where that is more than a minute older than the first
reconnection: a zombie connection, a laptop asleep; a routine reconnection's
last acknowledgement is up to 41 s old and does not count, review r0 B1), when
a shard error came while away, or with a new session; then "discord gateway
back" at info with how long and how many shard errors. A routine resume is
said at debug only. Shard errors are said once per kind at warn, then at most
once a minute with how many ("discord shard errors repeated"), the rest
counted in the line of the gateway back; no longer one ERROR line each. A kind
is said anew when an outage begins, also one seen while connected (review r1
C5). One state for every shard: Pine runs one.

**Files:**

```
 src/app.ts                         |   8 +++++-
 src/discord/gateway-events.test.ts | 215 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---
 src/discord/gateway-events.ts      | 178 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 3 files changed, 395 insertions(+), 6 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/discord/gateway-events.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 365f41e940efe3db0447cc30695ac345e929908b -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-23-phase-8xh-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-H 5: Gateway: a watch for the return after a real disconnect`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 0f30cf990045d8744b897b00c6620873eb0be767..982214063291a360d25734f43f09b7a2f01e964c 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -44,7 +44,7 @@ import { ClickAnswers } from './discord/click-answers.js';
 import { createClient, loginWithFallback } from './discord/client.js';
 import { enabledCommands, enabledMessageCommands } from './discord/command.js';
 import { DiscordDmGateway } from './discord/dm-gateway.js';
-import { attachGatewayHandlers } from './discord/gateway-events.js';
+import { attachGatewayHandlers, GatewayWatch } from './discord/gateway-events.js';
 import { DiscordMemberDirectory } from './discord/member-directory.js';
 import { DiscordRegionStaff } from './discord/web-staff.js';
 import { DiscordWebMembers } from './discord/web-members.js';
@@ -934,6 +934,12 @@ export async function startApp(
     create: createClient,
     configure(client) {
       heartbeat.loggingIn(() => gatewayConnected(client.ws.shards, Date.now()));
+      // Whether the gateway is back after a real disconnect, and its shard errors said once per
+      // kind (plan 8X-H); attached before the login, whose ready arms it.
+      new GatewayWatch({
+        log,
+        lastAck: (shard) => client.ws.shards.get(shard)?.lastPingTimestamp,
+      }).attach(client);
       discordGateway.use(client);
       liveClient = client;
       appEmojiSource.use(client);
diff --git a/src/discord/gateway-events.test.ts b/src/discord/gateway-events.test.ts
index 807fe2a367473bce5afa3a41de4ca0b6894ae128..c1f3d9d7da6eac1ff55ed4dd29735936a3fa373e 100644
--- a/src/discord/gateway-events.test.ts
+++ b/src/discord/gateway-events.test.ts
@@ -1,12 +1,13 @@
+import { EventEmitter } from 'node:events';
 import { Client, Events, GatewayIntentBits } from 'discord.js';
 import { describe, expect, it, vi } from 'vitest';
 import { createTestLogger } from '../../test/support/test-logger.js';
-import { attachGatewayHandlers } from './gateway-events.js';
+import { attachGatewayHandlers, GatewayWatch, type GatewayBack } from './gateway-events.js';
 
 const closeEvent = { code: 4004, reason: '', wasClean: true };
 
 describe('attachGatewayHandlers', () => {
-  it('logs a shard error without treating it as fatal', () => {
+  it('leaves a shard error to the watch (plan 8X-H): not fatal, not an error line', () => {
     const { log, entries } = createTestLogger();
     const client = new Client({ intents: [GatewayIntentBits.Guilds] });
     const onFatal = vi.fn();
@@ -15,7 +16,7 @@ describe('attachGatewayHandlers', () => {
     client.emit(Events.ShardError, new Error('socket hiccup'), 0);
 
     expect(onFatal).not.toHaveBeenCalled();
-    expect(entries.some((l) => l.level === 50 && l.shard === 0)).toBe(true);
+    expect(entries).toEqual([]);
   });
 
   it('logs fatal and calls onFatal when a shard disconnects for good', () => {
@@ -33,3 +34,211 @@ describe('attachGatewayHandlers', () => {
     expect(entries.some((l) => l.level === 60 && l.code === 4004)).toBe(true);
   });
 });
+
+const SECOND = 1_000;
+const START = Date.UTC(2026, 9, 23, 8, 0);
+
+/** Windows' DNS away, as discord.js gives it every half second (staging of 8X-G). */
+function notFound(): Error {
+  return Object.assign(new Error('getaddrinfo ENOTFOUND gateway.discord.gg'), {
+    code: 'ENOTFOUND',
+  });
+}
+
+/** A client of one shard, on an EventEmitter, a clock the test moves, and what the watch said. */
+function watched(options: { lastAck?: number } = {}) {
+  const { log, entries } = createTestLogger();
+  const client = new EventEmitter();
+  let now = START;
+  let lastAck = options.lastAck;
+  const watch = new GatewayWatch({
+    log,
+    now: () => now,
+    lastAck: () => lastAck,
+  }).attach(client as unknown as Pick<Client, 'on'>);
+  const back: GatewayBack[] = [];
+  watch.onBack((event) => {
+    back.push(event);
+  });
+  return {
+    entries,
+    back,
+    pass(ms: number) {
+      now += ms;
+    },
+    ack(at: number) {
+      lastAck = at;
+    },
+    ready: () => client.emit(Events.ShardReady, 0, undefined),
+    reconnecting: () => client.emit(Events.ShardReconnecting, 0),
+    resume: () => client.emit(Events.ShardResume, 0, 3),
+    error: (err: Error = notFound()) => client.emit(Events.ShardError, err, 0),
+    said: (msg: string) => entries.filter((entry) => entry['msg'] === msg),
+  };
+}
+
+describe('GatewayWatch (plan 8X-H): when the gateway is back after a real disconnect', () => {
+  it('takes a routine resume of a few seconds without errors for none', () => {
+    const made = watched();
+    made.ready();
+    made.reconnecting();
+    made.pass(2 * SECOND);
+    made.resume();
+    expect(made.back).toEqual([]);
+    expect(made.said('discord gateway back')).toEqual([]);
+  });
+
+  it('is back for real after half a minute away, and says how long', () => {
+    const made = watched();
+    made.ready();
+    made.pass(10 * SECOND);
+    made.reconnecting();
+    // discord.js says it reconnects with every try: only the first counts.
+    made.pass(20 * SECOND);
+    made.reconnecting();
+    made.pass(25 * SECOND);
+    made.resume();
+    expect(made.back).toEqual([{ awayMs: 45 * SECOND, shardErrors: 0, newSession: false }]);
+    expect(made.said('discord gateway back')).toEqual([
+      expect.objectContaining({ level: 30, awayMs: 45 * SECOND, shardErrors: 0 }),
+    ]);
+    // Nothing is said of each reconnection.
+    expect(made.entries.map((entry) => entry['msg'])).toEqual(['discord gateway back']);
+    // Once back, a later routine resume is none.
+    made.reconnecting();
+    made.pass(SECOND);
+    made.resume();
+    expect(made.back).toHaveLength(1);
+  });
+
+  it('is back for real after a shard error, or with a new session, however short', () => {
+    const errors = watched();
+    errors.ready();
+    errors.reconnecting();
+    errors.error();
+    errors.pass(2 * SECOND);
+    errors.resume();
+    expect(errors.back).toEqual([{ awayMs: 2 * SECOND, shardErrors: 1, newSession: false }]);
+    // ECONNRESET and the like give no shard error: the shard comes back with a new session.
+    const fresh = watched();
+    fresh.ready();
+    fresh.reconnecting();
+    fresh.pass(3 * SECOND);
+    fresh.ready();
+    expect(fresh.back).toEqual([{ awayMs: 3 * SECOND, shardErrors: 0, newSession: true }]);
+  });
+
+  it('counts nothing before the first ready: the login and its own reconnections', () => {
+    const made = watched();
+    made.reconnecting();
+    made.pass(60 * SECOND);
+    made.ready();
+    expect(made.back).toEqual([]);
+  });
+
+  it('counts the time away from the last heartbeat Discord acknowledged, when it is older (a laptop asleep)', () => {
+    const made = watched({ lastAck: START });
+    made.ready();
+    // Asleep for an hour while connected: the first reconnection comes at wake.
+    made.pass(60 * 60 * SECOND);
+    made.reconnecting();
+    made.pass(5 * SECOND);
+    made.resume();
+    expect(made.back).toEqual([
+      { awayMs: 60 * 60 * SECOND + 5 * SECOND, shardErrors: 0, newSession: false },
+    ]);
+  });
+
+  it('takes a routine resume whose last acknowledgement is under a minute old for none', () => {
+    // Discord acknowledges a heartbeat every 41.25 s: at a routine reconnection the last one can
+    // be some 35 s old without any trouble.
+    const made = watched({ lastAck: START });
+    made.ready();
+    made.pass(35 * SECOND);
+    made.reconnecting();
+    made.pass(SECOND);
+    made.resume();
+    expect(made.back).toEqual([]);
+    expect(made.said('discord gateway resumed')).toEqual([
+      expect.objectContaining({ level: 20, awayMs: SECOND }),
+    ]);
+  });
+
+  it('counts from the last acknowledgement of a zombie connection, 85 s old', () => {
+    // Two heartbeats without an answer: discord.js gives the connection up some 82 s after the
+    // last acknowledgement.
+    const made = watched({ lastAck: START });
+    made.ready();
+    made.pass(85 * SECOND);
+    made.reconnecting();
+    made.pass(2 * SECOND);
+    made.resume();
+    expect(made.back).toEqual([{ awayMs: 87 * SECOND, shardErrors: 0, newSession: false }]);
+  });
+
+  it('is not away for a shard error while connected: only a reconnection starts it', () => {
+    const made = watched();
+    made.ready();
+    made.error();
+    // Said all the same.
+    expect(made.said('discord shard error')).toHaveLength(1);
+    made.pass(60 * SECOND);
+    made.reconnecting();
+    made.pass(2 * SECOND);
+    made.resume();
+    expect(made.back).toEqual([]);
+  });
+});
+
+describe('GatewayWatch (plan 8X-H): a run of shard errors', () => {
+  it('says the first of a kind with the error, then how many more at most once a minute', () => {
+    const made = watched();
+    made.ready();
+    made.reconnecting();
+    made.error();
+    // discord.js tries about twice a second.
+    for (let n = 0; n < 119; n++) {
+      made.pass(500);
+      made.error();
+    }
+    expect(made.said('discord shard error')).toEqual([
+      expect.objectContaining({ level: 40, shard: 0, err: expect.objectContaining({}) as unknown }),
+    ]);
+    expect(made.said('discord shard errors repeated')).toEqual([]);
+    made.pass(500);
+    made.error();
+    expect(made.said('discord shard errors repeated')).toEqual([
+      expect.objectContaining({
+        level: 40,
+        count: 120,
+        error: 'getaddrinfo ENOTFOUND gateway.discord.gg',
+      }),
+    ]);
+    // Another kind is said by itself at once.
+    made.error(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
+    expect(made.said('discord shard error')).toHaveLength(2);
+    // The rest, not said yet, are counted in the line of the gateway back.
+    for (let n = 0; n < 10; n++) {
+      made.pass(500);
+      made.error();
+    }
+    made.resume();
+    expect(made.said('discord gateway back')).toEqual([
+      expect.objectContaining({ shardErrors: 132, unsaid: 10 }),
+    ]);
+    // The next outage's first error is said again.
+    made.reconnecting();
+    made.error();
+    expect(made.said('discord shard error')).toHaveLength(3);
+  });
+
+  it('says an error of a kind seen while connected anew when the outage begins (review r1 C5)', () => {
+    const made = watched();
+    made.ready();
+    made.error();
+    made.pass(10 * SECOND);
+    made.reconnecting();
+    made.error();
+    expect(made.said('discord shard error')).toHaveLength(2);
+  });
+});
diff --git a/src/discord/gateway-events.ts b/src/discord/gateway-events.ts
index 188b8876ac9d13aa8fffe0b3c4912f4d42bf4515..291c4db9138c124a4d7461c32a5aa9654ee08dcd 100644
--- a/src/discord/gateway-events.ts
+++ b/src/discord/gateway-events.ts
@@ -5,14 +5,14 @@ import type { Logger } from '../log.js';
  * Logs gateway trouble. discord.js emits ShardDisconnect only for close codes it will not
  * reconnect after (4004 bad token, 4014 disallowed intents, and similar), so it is fatal:
  * `onFatal` should shut down and exit non-zero so the supervisor restarts the bot; it is told why,
- * in a line for the owner's alert.
+ * in a line for the owner's alert. Shard errors are the `GatewayWatch`'s (plan 8X-H): discord.js
+ * retries by itself, and a line each was 115 a minute in an outage.
  */
 export function attachGatewayHandlers(
   client: Pick<Client, 'on'>,
   log: Logger,
   onFatal: (reason: string) => void,
 ): void {
-  client.on(Events.ShardError, (err, shard) => log.error({ err, shard }, 'discord shard error'));
   client.on(Events.ShardDisconnect, (event, shard) => {
     log.fatal(
       { code: event.code, shard },
@@ -21,3 +21,177 @@ export function attachGatewayHandlers(
     onFatal(`Discord closed the gateway connection for good (code ${event.code})`);
   });
 }
+
+/** How long the gateway is away before its return counts as real without errors: 30 seconds. */
+export const REAL_AWAY_MS = 30_000;
+/**
+ * How old the last heartbeat acknowledged is, at the first reconnection, before the time away
+ * counts from it: a minute. Discord asks for a heartbeat every 41.25 s, so at a routine
+ * reconnection the last acknowledgement is up to that old; a zombie connection (discord.js gives
+ * it up two unanswered heartbeats on, some 82 s) or a laptop asleep leaves it older (review r0 B1).
+ */
+export const MISSED_ACK_MS = 60_000;
+/** A run of shard errors of one kind is said again at most once in this time: a minute. */
+export const REPEAT_EVERY_MS = 60_000;
+
+/** The gateway back after a real disconnect (`GatewayWatch.onBack`). */
+export interface GatewayBack {
+  /**
+   * How long it was away: from the first reconnection, or from the last heartbeat acknowledged
+   * where that was missed (`MISSED_ACK_MS`).
+   */
+  awayMs: number;
+  /** The shard errors meanwhile. */
+  shardErrors: number;
+  /** It came back with a new session (`ShardReady`): the events of the time away are lost. */
+  newSession: boolean;
+}
+
+export interface GatewayWatchOptions {
+  log: Logger;
+  now?: () => number;
+  /**
+   * When Discord last acknowledged the heartbeat of a shard (`client.ws.shards`'s
+   * `lastPingTimestamp`; -1 before the first, undefined for none): a laptop asleep while
+   * connected reconnects only at wake, so the time away counts from then, when it is more than
+   * `MISSED_ACK_MS` before the first reconnection.
+   */
+  lastAck?: (shardId: number) => number | undefined;
+  realAfterMs?: number;
+  repeatEveryMs?: number;
+}
+
+/** A run of shard errors of one kind: when it was last said, and how many since. */
+interface ErrorRun {
+  message: string;
+  saidAt: number;
+  unsaid: number;
+}
+
+/**
+ * Whether the gateway came back after a real disconnect (plan 8X-H, review R2), so that what
+ * failed meanwhile is caught up: armed by the first ready (the login's own and earlier
+ * reconnections never count); the first `ShardReconnecting` while up marks it away (discord.js
+ * says it with every try: later ones change nothing); `ShardResume` or `ShardReady` brings it
+ * back. Back for real when it was away `REAL_AWAY_MS` or more (from the shard's last heartbeat
+ * acknowledged when that is more than `MISSED_ACK_MS` older: a zombie connection, a laptop that
+ * slept while connected), when a shard error came meanwhile, or when it came back with a new
+ * session (`ShardReady`: the events of the time away are lost); then `discord gateway back` at
+ * info and the listeners told. A routine resume of a second without errors is none. Only a
+ * reconnection starts the time away: a shard error while connected is said, but not counted
+ * (review r0 B8). The heartbeat and the health rules are not this (`operations.md`): they say
+ * whether the bot is connected now.
+ *
+ * Shard errors (Windows' DNS away gives one each half second, some 115 a minute) are said once
+ * per kind (`code`, else the message): the first at warn with the error, then at most once a
+ * minute `discord shard errors repeated` with how many, checked as each comes (no timer); those
+ * not said yet are counted in the line of the gateway back, and a kind is said anew when the next
+ * outage begins.
+ *
+ * One state for every shard: the first away, the first back. Pine runs one shard
+ * (`createClient`, `src/discord/client.ts`, sets no `shards`: discord.js's `shardCount` of 1;
+ * Discord asks for more only beyond 2,500 servers); with several, one shard's return would end
+ * the time away of all (review r0 B9).
+ */
+export class GatewayWatch {
+  private readonly now: () => number;
+  private armed = false;
+  private downSince: number | undefined;
+  private downShard = 0;
+  private errorsWhileDown = 0;
+  private readonly runs = new Map<string, ErrorRun>();
+  private readonly listeners: ((back: GatewayBack) => void)[] = [];
+
+  constructor(private readonly options: GatewayWatchOptions) {
+    this.now = options.now ?? Date.now;
+  }
+
+  /** Listens to the client's shard events; `this`, to chain. */
+  attach(client: Pick<Client, 'on'>): this {
+    client.on(Events.ShardReady, (shard) => {
+      this.back(shard, true);
+    });
+    client.on(Events.ShardResume, (shard) => {
+      this.back(shard, false);
+    });
+    client.on(Events.ShardReconnecting, (shard) => {
+      this.away(shard);
+    });
+    client.on(Events.ShardError, (err, shard) => {
+      this.shardError(err, shard);
+    });
+    return this;
+  }
+
+  /** Who is told when the gateway is back after a real disconnect (the catch-up). */
+  onBack(listener: (back: GatewayBack) => void): void {
+    this.listeners.push(listener);
+  }
+
+  private away(shard: number): void {
+    if (!this.armed || this.downSince !== undefined) return;
+    this.downSince = this.now();
+    this.downShard = shard;
+    this.errorsWhileDown = 0;
+    // An outage's first error of a kind is said, also of a kind seen while connected (review r1 C5).
+    this.runs.clear();
+  }
+
+  private back(shard: number, newSession: boolean): void {
+    if (!this.armed) {
+      // The login's own ready: from here on a reconnection counts.
+      this.armed = true;
+      this.runs.clear();
+      return;
+    }
+    const since = this.downSince;
+    if (since === undefined) return;
+    const now = this.now();
+    const ack = this.options.lastAck?.(this.downShard);
+    const from = ack !== undefined && ack >= 0 && since - ack > MISSED_ACK_MS ? ack : since;
+    const awayMs = now - from;
+    const shardErrors = this.errorsWhileDown;
+    const unsaid = [...this.runs.values()].reduce((sum, run) => sum + run.unsaid, 0);
+    this.downSince = undefined;
+    this.errorsWhileDown = 0;
+    this.runs.clear();
+    const real = awayMs >= (this.options.realAfterMs ?? REAL_AWAY_MS) || shardErrors > 0;
+    if (!real && !newSession) {
+      this.options.log.debug({ shard, awayMs }, 'discord gateway resumed');
+      return;
+    }
+    this.options.log.info(
+      { shard, awayMs, shardErrors, unsaid, newSession },
+      'discord gateway back',
+    );
+    const event: GatewayBack = { awayMs, shardErrors, newSession };
+    for (const listener of this.listeners) {
+      try {
+        listener(event);
+      } catch (err) {
+        this.options.log.error({ err }, 'could not tell of the gateway back');
+      }
+    }
+  }
+
+  private shardError(err: Error, shard: number): void {
+    if (this.downSince !== undefined) this.errorsWhileDown++;
+    const code: unknown = (err as { code?: unknown }).code;
+    const kind = typeof code === 'string' || typeof code === 'number' ? String(code) : err.message;
+    const now = this.now();
+    const run = this.runs.get(kind);
+    if (!run) {
+      this.runs.set(kind, { message: err.message, saidAt: now, unsaid: 0 });
+      this.options.log.warn({ err, shard }, 'discord shard error');
+      return;
+    }
+    run.unsaid++;
+    if (now - run.saidAt < (this.options.repeatEveryMs ?? REPEAT_EVERY_MS)) return;
+    this.options.log.warn(
+      { shard, count: run.unsaid, error: run.message },
+      'discord shard errors repeated',
+    );
+    run.saidAt = now;
+    run.unsaid = 0;
+  }
+}
````

### Task 6: 8X-H 6: Catch-up on reconnect: what failed while the gateway was away

Prototype commit: `bba917ab3825ed293734db1ebfc21b2c85038210`

G5 and Matt's decision (catch up, not restart): when `GatewayWatch` says the
gateway is back after a real disconnect, `CatchUp` runs, one after another,
each once: every active post shown anew paced (`redrawPosts`: a post whose
edit failed stays stale otherwise), the upkeep (`scheduler.catchUp`, after one
under way), the stops' pinned posts (`stopPosts.catchUp`), then the feeds
whose last read failed (`catchUp` of the raid and max boss feeds, the events,
the research page, the Rocket lineups, the game data: read now through their
guards and rescheduled from it). "caught up" at info names what ran, failed
again and was not owed. One catch-up at a time, once more after it when the
gateway came back again meanwhile.

The closings of parties of which a part failed for the network or a rate
limit (the link line, the copies, the leftovers, the last words, the last
showing, the tags, the archiving, a moderator's deletion) are kept in a
bounded map for a day and redone by `redoClosings` as the upkeep's first step,
hourly and so at the catch-up (a request can fail without the gateway going
away); a refusal of Discord's is not kept, a post that is gone drops it, and
the redo ends between parties at the clock's stop and with the first closing
that fails again: one probe a run while the network is away (review r0 B2 to
B5, r1 C2). A moderator's deletion the network failed is `deleting`: the post
archived for now, `/delete` and a report's decision say it will be deleted
within the hour, and the report keeps `delete` (review r1 C1).

At shutdown the party clock's step (now 6 s) closes the catch-up without
waiting for its job, and the upkeep starts no step more once the clock has
stopped; a step `catch-up` (2 s) after the feeds' stop steps and the stops'
pinned posts' waits for it (review r0 B6, r1 C3). The direct messages' step
goes from 15 s to 12 s: the steps add up to 145 s, 5 s within the stop's
150 s (review r1 C4).

**Files:**

```
 src/app.ts                                     |  62 +++++++++++++++++++++++++++++++++++++++++++---
 src/commands/parties/delete.test.ts            |  25 +++++++++++++++++--
 src/commands/parties/delete.ts                 |  36 ++++++++++++++++++++++++---
 src/components/moderation-reports.test.ts      |  12 +++++++++
 src/components/moderation-reports.ts           |   7 ++++--
 src/services/boss-feed-service.ts              |  23 +++++++++++++++++
 src/services/catch-up.test.ts                  | 120 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/catch-up.ts                       |  87 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/game-data-service.test.ts         |  21 ++++++++++++++++
 src/services/game-data-service.ts              |  23 +++++++++++++++++
 src/services/moderation-reports.decide.test.ts |  16 ++++++++++++
 src/services/moderation-reports.ts             |   7 +++++-
 src/services/party-mirrors.ts                  |  10 +++++---
 src/services/party-scheduler.test.ts           | 120 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/services/party-scheduler.ts                |  36 ++++++++++++++++++++++-----
 src/services/party-service.catch-up.test.ts    | 196 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/party-service.ts                  | 180 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------------
 src/services/raid-boss-service.test.ts         |  27 ++++++++++++++++++++
 src/services/raid-event-service.test.ts        |  20 +++++++++++++++
 src/services/raid-event-service.ts             |  35 +++++++++++++++++++++++---
 src/services/research-task-service.test.ts     |  27 ++++++++++++++++++++
 src/services/research-task-service.ts          |  35 +++++++++++++++++++++++---
 src/services/rocket-lineup-service.test.ts     |  20 +++++++++++++++
 src/services/rocket-lineup-service.ts          |  35 +++++++++++++++++++++++---
 src/services/stop-posts.test.ts                |  17 +++++++++++++
 src/services/stop-posts.ts                     |  11 +++++++++
 test/support/fake-gateway.ts                   |  10 ++++++++
 27 files changed, 1170 insertions(+), 48 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/parties/delete.test.ts src/components/moderation-reports.test.ts src/services/catch-up.test.ts src/services/game-data-service.test.ts src/services/moderation-reports.decide.test.ts src/services/party-scheduler.test.ts src/services/party-service.catch-up.test.ts src/services/raid-boss-service.test.ts src/services/raid-event-service.test.ts src/services/research-task-service.test.ts src/services/rocket-lineup-service.test.ts src/services/stop-posts.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff bba917ab3825ed293734db1ebfc21b2c85038210 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-23-phase-8xh-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-H 6: Catch-up on reconnect: what failed while the gateway was away`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 982214063291a360d25734f43f09b7a2f01e964c..680d60a7a304cd418e7dc40749db0425e631b168 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -101,6 +101,7 @@ import { PartyLines } from './services/party-lines.js';
 import { ApplicationEmoji, emojiFinder } from './services/application-emoji.js';
 import { PartyHistory } from './services/party-history.js';
 import { PartyScheduler } from './services/party-scheduler.js';
+import { CatchUp, type CatchUpOutcome } from './services/catch-up.js';
 import { PartyService } from './services/party-service.js';
 import { PartyStore } from './services/party-store.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
@@ -769,6 +770,8 @@ export async function startApp(
   const clickAnswers = new ClickAnswers({ log });
   // The client that ended up connected, for what talks to Discord's REST API through it.
   let liveClient: Client | undefined;
+  // The catch-up on reconnect (plan 8X-H), made once the services of the stops are there.
+  const reconnect: { catchUp?: CatchUp } = {};
   const legacyCleanup = new LegacyCleanup({
     rest: () => liveClient?.rest,
     botId: () => liveClient?.user?.id,
@@ -935,11 +938,16 @@ export async function startApp(
     configure(client) {
       heartbeat.loggingIn(() => gatewayConnected(client.ws.shards, Date.now()));
       // Whether the gateway is back after a real disconnect, and its shard errors said once per
-      // kind (plan 8X-H); attached before the login, whose ready arms it.
+      // kind (plan 8X-H); attached before the login, whose ready arms it. Back for real, what
+      // failed meanwhile is caught up (`catchUp`, made once the services are there).
       new GatewayWatch({
         log,
         lastAck: (shard) => client.ws.shards.get(shard)?.lastPingTimestamp,
-      }).attach(client);
+      })
+        .attach(client)
+        .onBack(() => {
+          reconnect.catchUp?.request();
+        });
       discordGateway.use(client);
       liveClient = client;
       appEmojiSource.use(client);
@@ -1048,6 +1056,33 @@ export async function startApp(
       });
   researchPostLinks.posts = stopPosts;
   if (stopPosts) partyService.setStopPosts(stopPosts);
+  // The catch-up on reconnect (plan 8X-H; Matt, 2026-10-23: catch up, not restart): when the
+  // gateway is back after a real disconnect, what failed meanwhile runs at once, one job after
+  // another; first what waits an hour or for good (review R1), then the feeds, each only when its
+  // last read failed (they retry by themselves within 5 to 30 minutes). The closings the network
+  // failed are the upkeep's first step (review r0 B4: hourly as well, as a request can fail
+  // without the gateway going away); the posts' redraw only queues them, paced.
+  const done = (): Promise<CatchUpOutcome> => Promise.resolve('done');
+  reconnect.catchUp = new CatchUp({
+    log,
+    jobs: [
+      {
+        name: 'posts',
+        run: () => {
+          partyService.redrawPosts();
+          return done();
+        },
+      },
+      { name: 'upkeep', run: () => scheduler.catchUp().then(done) },
+      ...(stopPosts ? [{ name: 'stop posts', run: () => stopPosts.catchUp().then(done) }] : []),
+      { name: 'raid bosses', run: () => raidBosses.catchUp() },
+      { name: 'max bosses', run: () => maxBosses.catchUp() },
+      { name: 'events', run: () => raidEvents.catchUp() },
+      { name: 'research tasks', run: () => researchTasks.catchUp() },
+      { name: 'rocket lineups', run: () => rocketLineups.catchUp() },
+      { name: 'game data', run: () => gameData.catchUp() },
+    ],
+  });
   void connected.then(() =>
     stopPosts
       ?.start()
@@ -1194,7 +1229,19 @@ export async function startApp(
           ]
         : []),
       // First: nothing may start changing parties while the rest is being flushed.
-      { name: 'party clock', timeoutMs: 10_000, run: () => scheduler.stop() },
+      // The catch-up starts no job more (plan 8X-H); the clock's stop waits for the upkeep it may
+      // have started, which starts no step more and whose closings end between parties. A job of
+      // the catch-up's under way that reads a feed ends with that feed's stop below, one that
+      // draws the stops' pinned posts with theirs (review r0 B6). The steps add up to 145 s, 5 s
+      // within the stop's 2m30s (review r1 C4: 6 s here and 12 s for the direct messages).
+      {
+        name: 'party clock',
+        timeoutMs: 6_000,
+        run: async () => {
+          reconnect.catchUp?.close();
+          await scheduler.stop();
+        },
+      },
       // No screenshot is read from here on: the trigger first (it stops between images and sends
       // nothing more; its replies go while Discord is there), then the reader. A report on its
       // way finishes before the posts are flushed.
@@ -1292,10 +1339,17 @@ export async function startApp(
           await stopPosts?.close();
         },
       },
+      // The catch-up's job under way (plan 8X-H): a feed's read ended by the feeds' steps above,
+      // the stops' pinned posts drawn by the step before this one (review r1 C3).
+      {
+        name: 'catch-up',
+        timeoutMs: 2_000,
+        run: () => reconnect.catchUp?.whenIdle() ?? Promise.resolve(),
+      },
       // Whoever is still being looked up for an event is put in line before the line is drained.
       { name: 'notifications', timeoutMs: 5_000, run: () => notify.close() },
       // Direct messages go on at their usual rate for ten seconds (spec 9); the rest is dropped.
-      { name: 'direct messages', timeoutMs: 15_000, run: () => dms.drain(DM_DRAIN_MS) },
+      { name: 'direct messages', timeoutMs: 12_000, run: () => dms.drain(DM_DRAIN_MS) },
       { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
       // The last count of what the rehearsal dropped, once the client is down and nothing more
       // can be sent.
diff --git a/src/commands/parties/delete.test.ts b/src/commands/parties/delete.test.ts
index 9c209963f2e1de8c16baebb34ff4449e9b5e5a2f..f84f4810cf5f6103d05b6cb9391491af755c4385 100644
--- a/src/commands/parties/delete.test.ts
+++ b/src/commands/parties/delete.test.ts
@@ -24,7 +24,7 @@ import {
   WEST_CHANNEL,
   WEST_FORUM,
 } from '../../../test/support/gyms.js';
-import { missingPermissions } from '../../../test/support/fake-gateway.js';
+import { missingPermissions, networkAway } from '../../../test/support/fake-gateway.js';
 import { MODERATOR } from '../../../test/support/meetup-safety-cases.js';
 import { ALICE, BOB } from '../../../test/support/parties.js';
 import { reportedMeetup } from '../../../test/support/reports-service.js';
@@ -313,6 +313,20 @@ describe('/delete', () => {
     expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true });
   });
 
+  it('says that the deletion is still to come where the network failed it (review r1 C1)', async () => {
+    const made = await setup();
+    made.gateway.failing.set('deletePost', networkAway());
+    expect(made.shown(await made.submit('delete'))).toBe(
+      'This raid is closed: its gym is free for a new report, and its post is archived for now: ' +
+        'Discord did not answer when I tried to delete it. I will try again within the hour; if ' +
+        'it is still there after that, delete it yourself.',
+    );
+    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true });
+    made.gateway.failing.clear();
+    await made.service.redoClosings();
+    expect(made.gateway.deletedPosts).toEqual([made.postId]);
+  });
+
   it('deletes the post of a raid that ended a moment before, when Delete post was picked', async () => {
     const made = await setup();
     const dialog = await made.opened();
@@ -527,7 +541,7 @@ describe('requests to delete a raid in its post (reports without a moderators’
 
 describe('/delete of a reported party', () => {
   /** Alice's meetup reported by Bob, and Mod's answer to the question of `/delete`. */
-  async function reportedAndClosed(removal: 'archive' | 'delete', refuse = false) {
+  async function reportedAndClosed(removal: 'archive' | 'delete', refuse = false, away = false) {
     const made = await reportedMeetup();
     const outcome = await made.report();
     if (outcome.kind !== 'sent') throw new Error(outcome.kind);
@@ -540,6 +554,7 @@ describe('/delete of a reported party', () => {
       meetupSafety: made.safety,
     });
     if (refuse) made.gateway.failing.set('deletePost', missingPermissions('MANAGE_THREADS'));
+    if (away) made.gateway.failing.set('deletePost', networkAway());
     const router = new InteractionRouter(ctx, [deleteParty], [closeControls]);
     const asMod = {
       userId: MODERATOR,
@@ -592,4 +607,10 @@ describe('/delete of a reported party', () => {
     expect(textOf(refused.post)).toContain('archived: Discord refused to delete it');
     expect(buttonsOf(refused.post).map((button) => button.label)).toEqual(['Go to post']);
   });
+
+  it('keeps a deletion the network failed as deleted: the redo deletes it (review r1 C1)', async () => {
+    const { stored, post } = await reportedAndClosed('delete', false, true);
+    expect(stored).toMatchObject({ status: 'closed', removal: 'delete' });
+    expect(textOf(post)).toContain('its post is deleted.');
+  });
 });
diff --git a/src/commands/parties/delete.ts b/src/commands/parties/delete.ts
index 7ceb28385006fffd3c1d80fafee5e33efbfba2f7..547ae7b343f74de4dfee11c3da2b0ea0b674434b 100644
--- a/src/commands/parties/delete.ts
+++ b/src/commands/parties/delete.ts
@@ -18,7 +18,12 @@ import { STALE_COMPONENT } from '../../discord/router.js';
 import type { Throttle } from '../../discord/throttle.js';
 import type { PostRemoval } from '../../domain/moderation/reports.js';
 import { partyWord, type Party } from '../../domain/party/party.js';
-import { APPROVED_ACCENT, EXPIRED_ACCENT, REFUSED_ACCENT } from '../../render/meetup-safety.js';
+import {
+  APPROVED_ACCENT,
+  EXPIRED_ACCENT,
+  PENDING_ACCENT,
+  REFUSED_ACCENT,
+} from '../../render/meetup-safety.js';
 import { removalDialog, removalOf } from '../../render/moderation.js';
 import { memberText } from '../../render/text.js';
 import { textMessage } from '../../render/v2.js';
@@ -59,6 +64,26 @@ export function refusedDeletion(party: Pick<Party, 'type'>): string {
   return `This ${partyWord(party)} is closed, and ${archived}`;
 }
 
+/**
+ * Where a deletion failed because Discord did not answer: the post is archived for now and
+ * deleted with the hourly upkeep (plan 8X-H, review r1 C1). The report's decision says it too.
+ */
+export const DELETION_PENDING =
+  'Discord did not answer when I tried to delete it. I will try again within the hour; if it ' +
+  'is still there after that, delete it yourself';
+
+/** What a moderator is told whose Delete post the network failed: it is deleted later. */
+export function pendingDeletion(party: Pick<Party, 'type'>): string {
+  const archived = `its post is archived for now: ${DELETION_PENDING}.`;
+  if (party.type === 'raid') {
+    return `This raid is closed: its gym is free for a new report, and ${archived}`;
+  }
+  if (party.type === 'max') {
+    return `This max battle is closed: its spot is free for a new report, and ${archived}`;
+  }
+  return `This ${partyWord(party)} is closed, and ${archived}`;
+}
+
 /** What a moderator is told who chose to delete a post the bot may not delete. */
 export function mayNotDelete(forumId: string | null): string {
   const where = forumId === null ? 'its forum' : `<#${forumId}>`;
@@ -187,14 +212,19 @@ export const closeControls: ComponentHandler = {
         .catch(() => undefined);
       return;
     }
-    // Its reports to the moderators read closed by this moderator, the post as it really went.
+    // Its reports to the moderators read closed by this moderator, the post as it really went
+    // (or will go: a deletion the network failed is redone, review r1 C1).
     const refused = removal === 'delete' && closed === 'archived';
     await ctx.reports.closedByStaff(party.id, refused ? 'denied' : removal, moderator);
+    // An answer in a private message of its own, which opens no archived post again.
     if (refused) {
-      // An answer in a private message of its own, which opens no archived post again.
       await interaction
         .editReply(say(REFUSED_ACCENT, refusedDeletion(party)))
         .catch(() => undefined);
+    } else if (closed === 'deleting') {
+      await interaction
+        .editReply(say(PENDING_ACCENT, pendingDeletion(party)))
+        .catch(() => undefined);
     }
   },
 };
diff --git a/src/components/moderation-reports.test.ts b/src/components/moderation-reports.test.ts
index 33f1e4351b98e2002ee2c69ac40f76cd5aa8103a..8a4d5e28abf84863e98f1ffd1e62fbcb8d482476 100644
--- a/src/components/moderation-reports.test.ts
+++ b/src/components/moderation-reports.test.ts
@@ -16,6 +16,7 @@ import {
 import { SAFETY_PIN } from '../../test/support/meetup-safety-cases.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
+import { networkAway } from '../../test/support/fake-gateway.js';
 import { buttonsOf, textOf } from '../../test/support/messages.js';
 import { reportedMeetup } from '../../test/support/reports-service.js';
 import { createTestContext } from '../../test/support/test-context.js';
@@ -322,6 +323,17 @@ describe('the buttons of a report’s post', () => {
     );
   });
 
+  it('say that the deletion is still to come where the network failed it (review r1 C1)', async () => {
+    const made = await setup();
+    made.gateway.failing.set('deletePost', networkAway());
+    const chosen = await made.submit('close', 'delete');
+    expect(textOf(asV2(sent(chosen.editReply)))).toBe(
+      'Closed: the meetup is over, and its post is archived for now: Discord did not answer ' +
+        'when I tried to delete it. I will try again within the hour; if it is still there ' +
+        'after that, delete it yourself.',
+    );
+  });
+
   it('take twenty presses and Submits a minute of a moderator', async () => {
     const made = await setup();
     // Opening the dialog counts, and so does each Submit.
diff --git a/src/components/moderation-reports.ts b/src/components/moderation-reports.ts
index 1628169b262b97982bf13276b3938da32e3cc700..f8fee3c9d128ab198d066b22ffb1ec20e1fc4d31 100644
--- a/src/components/moderation-reports.ts
+++ b/src/components/moderation-reports.ts
@@ -6,7 +6,7 @@ import {
   type ModalSubmitInteraction,
 } from 'discord.js';
 import type { AppContext } from '../app-context.js';
-import { forumInDialog, mayNotDelete } from '../commands/parties/delete.js';
+import { DELETION_PENDING, forumInDialog, mayNotDelete } from '../commands/parties/delete.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { deferSubmit, readInTime } from '../discord/dialog.js';
 import { UserError } from '../discord/errors.js';
@@ -113,9 +113,12 @@ export function reportDecisionWords(outcome: ReportDecision): string {
     case 'done': {
       const { report } = outcome;
       const word = wordOf(report);
+      // "its post is archived for now: …" where the network failed the deletion (review r1 C1).
       const post = outcome.refusedDeletion
         ? 'archived: Discord refused to delete it; delete it yourself'
-        : REMOVED[report.removal ?? 'archive'];
+        : outcome.deletionPending
+          ? `is archived for now: ${DELETION_PENDING}`
+          : REMOVED[report.removal ?? 'archive'];
       switch (report.status) {
         case 'closed':
           return `Closed: the ${word} is over, and its post ${post}.`;
diff --git a/src/services/boss-feed-service.ts b/src/services/boss-feed-service.ts
index 29ac63bb9db7875ad6832df2f2ad6560af88769d..948a7c648a34c834059349abae23468685bdf973 100644
--- a/src/services/boss-feed-service.ts
+++ b/src/services/boss-feed-service.ts
@@ -13,6 +13,7 @@ import {
 } from '../domain/pogo/raid-bosses.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import type { Logger } from '../log.js';
+import type { CatchUpOutcome } from './catch-up.js';
 import { failureReason } from './failure-reason.js';
 import type { GameDataProvider } from './game-data-service.js';
 
@@ -192,6 +193,8 @@ export class BossFeedService<T> implements BossAdmin<T> {
   private readonly timeoutMs: number;
   private readonly retryMs: number;
   private failures = 0;
+  /** Whether `startAutoSync` runs the reads (until `stop`): a catch-up schedules the next. */
+  private autoSyncing = false;
   private overrideReads = 0;
   private overrideReadApplied = 0;
   private controller: AbortController | undefined;
@@ -398,15 +401,35 @@ export class BossFeedService<T> implements BossAdmin<T> {
   startAutoSync(): void {
     if (!this.loaded) throw new Error(this.notLoaded);
     this.stopped = false;
+    this.autoSyncing = true;
     if (this.timer) return;
     this.schedule();
   }
 
+  /**
+   * The gateway is back after a real disconnect (plan 8X-H, review R1): when the last attempt
+   * failed, the feed is read now instead of at the retry, through `sync`'s guard (a sync the
+   * timer started meanwhile is waited for first, and decides), and the next read scheduled from
+   * this one; else nothing is owed and nothing is asked. Never rejects.
+   */
+  async catchUp(): Promise<CatchUpOutcome> {
+    if (!this.loaded || this.stopped) return 'not-owed';
+    await this.whenIdle();
+    if (this.failures === 0) return 'not-owed';
+    // The scheduled read is this one: cleared, then set again from it.
+    if (this.timer) clearTimeout(this.timer);
+    this.timer = undefined;
+    const result = await this.sync();
+    if (this.autoSyncing && !this.stopped && !this.timer) this.schedule();
+    return result.status === 'failed' ? 'failed' : 'done';
+  }
+
   /**
    * Cancels the scheduled sync and ends a download in flight (that sync reports `stopped`).
    * Writes to the database are not interrupted.
    */
   stop(): void {
+    this.autoSyncing = false;
     this.stopped = true;
     this.controller?.abort();
     if (this.timer) clearTimeout(this.timer);
diff --git a/src/services/catch-up.test.ts b/src/services/catch-up.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4368416f6c2088664b17bbf7f883a26ec48bb732
--- /dev/null
+++ b/src/services/catch-up.test.ts
@@ -0,0 +1,120 @@
+import { describe, expect, it } from 'vitest';
+import { heldCall } from '../../test/support/held-call.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { CatchUp, type CatchUpJob, type CatchUpOutcome } from './catch-up.js';
+
+/** A job that records its runs and answers as the test says (by default, done). */
+function job(
+  name: string,
+  ran: string[],
+  answer: () => Promise<CatchUpOutcome> = () => Promise.resolve('done'),
+): CatchUpJob {
+  return {
+    name,
+    run: () => {
+      ran.push(name);
+      return answer();
+    },
+  };
+}
+
+describe('CatchUp (plan 8X-H): what failed while the gateway was away, run at once', () => {
+  it('runs the jobs one after another, and says which ran, which failed again and which were not owed', async () => {
+    const { log, entries } = createTestLogger();
+    const ran: string[] = [];
+    const held = heldCall('the sweep');
+    const catchUp = new CatchUp({
+      log,
+      jobs: [
+        job('sweep', ran, async () => {
+          held.arrive();
+          await held.released;
+          return 'done';
+        }),
+        job('raid bosses', ran, () => Promise.resolve('failed')),
+        job('lineups', ran, () => Promise.resolve('not-owed')),
+        job('emoji', ran, () => Promise.reject(new Error('down'))),
+      ],
+    });
+    catchUp.request();
+    await held.reached;
+    // One at a time: the next waits for the sweep.
+    expect(ran).toEqual(['sweep']);
+    held.release();
+    await catchUp.whenIdle();
+    expect(ran).toEqual(['sweep', 'raid bosses', 'lineups', 'emoji']);
+    expect(entries.filter((entry) => entry['msg'] === 'caught up')).toEqual([
+      expect.objectContaining({
+        level: 30,
+        ran: ['sweep'],
+        failed: ['raid bosses', 'emoji'],
+        notOwed: ['lineups'],
+      }),
+    ]);
+    expect(entries.filter((entry) => entry['msg'] === 'could not catch up')).toEqual([
+      expect.objectContaining({ level: 40, job: 'emoji' }),
+    ]);
+  });
+
+  it('runs once more after a run when the gateway came back again meanwhile, not more', async () => {
+    const { log } = createTestLogger();
+    const ran: string[] = [];
+    const held = heldCall('the first job');
+    let first = true;
+    const catchUp = new CatchUp({
+      log,
+      jobs: [
+        job('sweep', ran, async () => {
+          if (first) {
+            first = false;
+            held.arrive();
+            await held.released;
+          }
+          return 'done';
+        }),
+      ],
+    });
+    catchUp.request();
+    await held.reached;
+    // A network that flaps: three returns while the first catch-up runs.
+    catchUp.request();
+    catchUp.request();
+    catchUp.request();
+    held.release();
+    await catchUp.whenIdle();
+    expect(ran).toEqual(['sweep', 'sweep']);
+  });
+
+  it('starts nothing once closed; close does not wait for a job that blocks, whenIdle does (review r0 B6)', async () => {
+    const { log } = createTestLogger();
+    const ran: string[] = [];
+    const held = heldCall('the sweep');
+    let done = false;
+    const catchUp = new CatchUp({
+      log,
+      jobs: [
+        job('sweep', ran, async () => {
+          held.arrive();
+          await held.released;
+          done = true;
+          return 'done';
+        }),
+        job('raid bosses', ran),
+      ],
+    });
+    catchUp.request();
+    await held.reached;
+    // The shutdown's clock step closes it without waiting: a feed's read under way ends only at
+    // the feed's own stop, a later step.
+    expect(catchUp.close()).toBeUndefined();
+    expect(done).toBe(false);
+    const idle = catchUp.whenIdle();
+    held.release();
+    await idle;
+    expect(done).toBe(true);
+    expect(ran).toEqual(['sweep']);
+    catchUp.request();
+    await catchUp.whenIdle();
+    expect(ran).toEqual(['sweep']);
+  });
+});
diff --git a/src/services/catch-up.ts b/src/services/catch-up.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c85df3eb84dac82449542d9b289d6de2f5413d89
--- /dev/null
+++ b/src/services/catch-up.ts
@@ -0,0 +1,87 @@
+import type { Logger } from '../log.js';
+
+/**
+ * What a job of the catch-up did: ran (`done`), failed again (`failed`), or found nothing owed
+ * (`not-owed`: its last attempt had not failed).
+ */
+export type CatchUpOutcome = 'done' | 'failed' | 'not-owed';
+
+/** A job the catch-up runs when the gateway is back: its name in the log, and its run. */
+export interface CatchUpJob {
+  name: string;
+  run(): Promise<CatchUpOutcome>;
+}
+
+export interface CatchUpOptions {
+  /** In the order they run: what waits an hour or for good first (review R1). */
+  jobs: readonly CatchUpJob[];
+  log: Logger;
+}
+
+/**
+ * The catch-up on reconnect (plan 8X-H; Matt, 2026-10-23: catch up, not restart): when the
+ * gateway is back after a real disconnect (`GatewayWatch`), what failed meanwhile runs at once
+ * instead of at its next interval. The jobs run one after another (never in parallel), each once
+ * a catch-up, each through its own guard (a job decides itself whether it is owed); a job that
+ * throws counts as failed, logged, and the others go on. One catch-up at a time: a return of the
+ * gateway while one runs has one more run after it (a network that flaps), not one each; nothing
+ * loops while the network is down. After `close` (shutdown) nothing starts. `caught up` at info
+ * says which jobs ran, failed again and were not owed.
+ */
+export class CatchUp {
+  private running: Promise<void> | undefined;
+  private again = false;
+  private closed = false;
+
+  constructor(private readonly options: CatchUpOptions) {}
+
+  /** The gateway is back: a catch-up now, or once more after the one under way. Never throws. */
+  request(): void {
+    if (this.closed) return;
+    if (this.running) {
+      this.again = true;
+      return;
+    }
+    this.running = this.runAll().finally(() => {
+      this.running = undefined;
+    });
+  }
+
+  /** Resolves once no catch-up is under way. Never rejects. */
+  async whenIdle(): Promise<void> {
+    while (this.running) await this.running;
+  }
+
+  /**
+   * For shutdown: starts nothing more, and does not wait (review r0 B6): the job under way may be
+   * a feed's read of up to 30 s, which ends at that feed's `stop`, a later step of the shutdown;
+   * a step after those awaits `whenIdle`.
+   */
+  close(): void {
+    this.closed = true;
+  }
+
+  private async runAll(): Promise<void> {
+    do {
+      this.again = false;
+      await this.runOnce();
+    } while (this.again && !this.closed);
+  }
+
+  private async runOnce(): Promise<void> {
+    const { jobs, log } = this.options;
+    const said: Record<CatchUpOutcome, string[]> = { done: [], failed: [], 'not-owed': [] };
+    for (const job of jobs) {
+      if (this.closed) break;
+      let outcome: CatchUpOutcome;
+      try {
+        outcome = await job.run();
+      } catch (err) {
+        log.warn({ err, job: job.name }, 'could not catch up');
+        outcome = 'failed';
+      }
+      said[outcome].push(job.name);
+    }
+    log.info({ ran: said.done, failed: said.failed, notOwed: said['not-owed'] }, 'caught up');
+  }
+}
diff --git a/src/services/game-data-service.test.ts b/src/services/game-data-service.test.ts
index 28ab3a4c79ef23f6178d77621246dd66b0f71183..2f241cd560f449c5cd87baf43f90aa738c6bf7b2 100644
--- a/src/services/game-data-service.test.ts
+++ b/src/services/game-data-service.test.ts
@@ -683,6 +683,27 @@ describe('GameDataService', () => {
       gameData.stop();
     });
 
+    it('catches up at once after a failed refresh, and only then (plan 8X-H)', async () => {
+      await service().gameData.load();
+      fakeClock(now + 48 * HOUR);
+      respond = () => Promise.reject(new Error('offline'));
+      const { gameData } = service();
+      await gameData.load();
+      gameData.startAutoRefresh();
+      requests = [];
+      respond = (url) => Promise.resolve(ok(url === GAME_MASTER_URL ? gameMaster : english));
+      // Back: at once, not at the retry half an hour on.
+      expect(await gameData.catchUp()).toBe('done');
+      expect(requests).toHaveLength(2);
+      await settle(gameData);
+      expect(await gameData.catchUp()).toBe('not-owed');
+      expect(requests).toHaveLength(2);
+      // The next refresh a full period on.
+      await vi.advanceTimersByTimeAsync(24 * HOUR - 1);
+      expect(requests).toHaveLength(2);
+      gameData.stop();
+    });
+
     it('asks for the list of icons alone, after the retry period, when its download failed', async () => {
       fakeClock();
       const failing: FetchText = (url) =>
diff --git a/src/services/game-data-service.ts b/src/services/game-data-service.ts
index f0f26bc04ea7e947d7ed746e952d9e7c3985b683..b1aca7b851ab1ff42e9c7fa4e5bbaf36589d010c 100644
--- a/src/services/game-data-service.ts
+++ b/src/services/game-data-service.ts
@@ -5,6 +5,7 @@ import { GAME_DATA_VERSION, parseGameMaster, type GameData } from '../domain/pog
 import { iconNamesOf, isTruncatedListing, PokemonIcons } from '../domain/pogo/pokemon-icons.js';
 import { parseTextFile } from '../domain/pogo/text.js';
 import type { Logger } from '../log.js';
+import type { CatchUpOutcome } from './catch-up.js';
 import { failureReason } from './failure-reason.js';
 
 /** A download that got no answer: the request or its body failed, or ran out of time. */
@@ -237,6 +238,28 @@ export class GameDataService implements GameDataProvider {
     this.schedule();
   }
 
+  /**
+   * The gateway is back after a real disconnect (plan 8X-H, review R1): when the last refresh
+   * failed, the game data is downloaded now instead of at the retry half an hour on (the list of
+   * icons alone when only it failed), through the guards of `refresh` and `refreshIcons` (one
+   * the timer started meanwhile is waited for first, and decides), and the next scheduled from
+   * this one; else nothing is owed and nothing is asked. Never rejects.
+   */
+  async catchUp(): Promise<CatchUpOutcome> {
+    await this.whenIdle();
+    const dataOwed = this.lastFailure !== undefined;
+    if (this.stopped || (!dataOwed && !this.iconsFailed)) {
+      return 'not-owed';
+    }
+    // The scheduled refresh is this one: cleared, then set again from it.
+    const scheduled = this.timer !== undefined;
+    if (this.timer) clearTimeout(this.timer);
+    this.timer = undefined;
+    const ok = dataOwed ? await this.refresh() : await this.refreshIcons();
+    if (scheduled && !this.stopped && !this.timer) this.schedule();
+    return ok ? 'done' : 'failed';
+  }
+
   /** Cancels the scheduled refresh. One already running finishes but schedules nothing. */
   stop(): void {
     this.stopped = true;
diff --git a/src/services/moderation-reports.decide.test.ts b/src/services/moderation-reports.decide.test.ts
index c5366415c3eebf4e09ec17e77c1138480452031e..d1462862592f22dfc62fe769cd7db51358c48f87 100644
--- a/src/services/moderation-reports.decide.test.ts
+++ b/src/services/moderation-reports.decide.test.ts
@@ -1,4 +1,5 @@
 import { describe, expect, it } from 'vitest';
+import { networkAway } from '../../test/support/fake-gateway.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { LIBRARY, MODERATOR, SAFETY_PIN } from '../../test/support/meetup-safety-cases.js';
 import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
@@ -263,6 +264,21 @@ describe('ModerationReports: a moderator decides a report of a party', () => {
     expect(buttonsOf(made.post()).map((button) => button.label)).toEqual(['Go to post']);
   });
 
+  it('keeps a deletion the network failed as a deletion still to come (review r1 C1)', async () => {
+    const made = await reported();
+    made.gateway.failing.set('deletePost', networkAway());
+    expect(await made.decide('close', 'delete')).toMatchObject({
+      kind: 'done',
+      report: { removal: 'delete' },
+      deletionPending: true,
+    });
+    expect((await made.stored())?.removal).toBe('delete');
+    expect(textOf(made.post())).toContain('its post is deleted.');
+    made.gateway.failing.clear();
+    await made.service.redoClosings();
+    expect(made.gateway.deletedPosts).toEqual([made.postId]);
+  });
+
   it('says whether the block is new, and refuses the place as it is now', async () => {
     const made = await reported();
     await made.storage.addBlock(REPORT_SERVER, ALICE, { id: MODERATOR, name: 'Mod', at: 1 });
diff --git a/src/services/moderation-reports.ts b/src/services/moderation-reports.ts
index 115207f4b53f6ee5973879ffa0b89755a3b69b9d..3b6265166310d04ac08920fad5ebe444c3572cb0 100644
--- a/src/services/moderation-reports.ts
+++ b/src/services/moderation-reports.ts
@@ -100,7 +100,8 @@ export type ReportDecision =
   /**
    * Decided; for Block maker…, whether the block is new and how many other meetups were closed
    * and requests withdrawn; `refusedDeletion` where Discord refused to delete the post, which is
-   * archived instead.
+   * archived instead; `deletionPending` where the deletion failed for the network: archived for
+   * now, deleted with the hourly upkeep (plan 8X-H, review r1 C1).
    */
   | {
       kind: 'done';
@@ -109,6 +110,7 @@ export type ReportDecision =
       closed?: number;
       withdrawn?: number;
       refusedDeletion?: boolean;
+      deletionPending?: boolean;
     };
 
 /** What came of a report. */
@@ -678,6 +680,8 @@ export class ModerationReports {
       removed = (await parties.deletePostOf(now.postId)) === 'deleted' ? 'deleted' : 'archived';
     }
     const refusedDeletion = removal === 'delete' && removed === 'archived';
+    // A deletion the network failed is redone (`redoClosings`): it stays `delete` (review r1 C1).
+    const deletionPending = removed === 'deleting';
     if (refusedDeletion) {
       await storage.setRemoval(report.id, 'denied').catch((err: unknown) => {
         log.warn({ err, report: report.id }, 'could not keep how a reported post went');
@@ -698,6 +702,7 @@ export class ModerationReports {
       report: decided,
       ...(blocked ?? {}),
       ...(refusedDeletion ? { refusedDeletion } : {}),
+      ...(deletionPending ? { deletionPending } : {}),
     };
   }
 
diff --git a/src/services/party-mirrors.ts b/src/services/party-mirrors.ts
index e97ac32468fe62e2e2f0895a4b2bfc03b14281bd..35c8adc8b7b6ea747c6574a2461d0feee730c555 100644
--- a/src/services/party-mirrors.ts
+++ b/src/services/party-mirrors.ts
@@ -587,22 +587,26 @@ export class PartyMirrors {
 
   /**
    * Deletes every copy of the message of a party that has ended, also the one in its post, and
-   * forgets what is kept for them, also that its copies were to be gone through again. Never
-   * rejects.
+   * forgets what is kept for them, also that its copies were to be gone through again. Gives the
+   * failures, each logged as a warning, for the closing to judge whether it is owed (plan 8X-H,
+   * review r0 B2). Never rejects.
    */
-  async remove(party: Party): Promise<void> {
+  async remove(party: Party): Promise<unknown[]> {
     const { gateway, log } = this.options;
     this.settled(party.id);
+    const failures: unknown[] = [];
     for (const mirror of party.mirrorMessages) {
       this.sent.delete(mirror.messageId);
       try {
         await gateway.deleteMessage(mirror.channelId, mirror.messageId);
       } catch (err) {
+        failures.push(err);
         log.warn(
           { err, party: party.id, channel: mirror.channelId, message: mirror.messageId },
           'could not delete a copy of the message of an ended party',
         );
       }
     }
+    return failures;
   }
 }
diff --git a/src/services/party-scheduler.test.ts b/src/services/party-scheduler.test.ts
index a7ce64961882c771d9a5086a8d375dcba2bab67c..1a1e1ec4518ffaa51a8cd1d7da083dc814d78c21 100644
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -1,5 +1,6 @@
 import { describe, expect, it, vi } from 'vitest';
 import { watchEachTest, watchImmediates } from '../../test/support/timers.js';
+import { heldCall } from '../../test/support/held-call.js';
 import { WEST_FORUM } from '../../test/support/gyms.js';
 import { ALICE, asRaid, at, BOB, CAROL, MINUTE, testRaid } from '../../test/support/parties.js';
 import { partyServiceWith, reportedRaid, restarted } from '../../test/support/party-service.js';
@@ -10,7 +11,7 @@ import { setEndTime } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { Member } from './attendance-service.js';
 import { WARN_AGAIN_AFTER } from './party-scheduler.js';
-import { header } from '../../test/support/messages.js';
+import { buttonsOf, header } from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice' };
 const bob: Member = { id: BOB, name: 'Bob' };
@@ -687,6 +688,123 @@ describe('PartyScheduler: running', () => {
     expect(read).toBe(1);
   });
 
+  it('runs the upkeep again on a catch-up, after the one under way, an hour or not (plan 8X-H)', async () => {
+    const made = await reportedRaid();
+    let read = 0;
+    const held = heldCall('the first upkeep’s read of the emoji');
+    const { PartyScheduler } = await import('./party-scheduler.js');
+    const scheduler = new PartyScheduler({
+      store: made.store,
+      posts: made.service,
+      attendance: made.attendance,
+      emoji: {
+        refresh: async () => {
+          read += 1;
+          // The upkeep at wake, while the network is still away.
+          if (read === 1) {
+            held.arrive();
+            await held.released;
+          }
+        },
+      },
+      lines: made.lines,
+      gateway: made.gateway,
+      raidBosses: { autoset: () => undefined },
+      settings: made.settings,
+      log: made.log,
+      now: () => made.clock.now,
+    });
+    // Before the clock runs there is nothing to catch up.
+    await scheduler.catchUp();
+    expect(read).toBe(0);
+    await scheduler.start();
+    await held.reached;
+    const catching = scheduler.catchUp();
+    held.release();
+    await catching;
+    // The one under way, then one of the catch-up's own, though no hour has passed.
+    expect(read).toBe(2);
+    await scheduler.stop();
+    await scheduler.catchUp();
+    expect(read).toBe(2);
+  });
+
+  it('redoes the closings the network failed first in the upkeep, before the sweep (plan 8X-H, review r0 B4)', async () => {
+    const made = await reportedRaid();
+    const away = new TypeError('fetch failed', {
+      cause: Object.assign(new Error('getaddrinfo ENOTFOUND discord.com'), { code: 'ENOTFOUND' }),
+    });
+    made.gateway.failing.set('editPost', away);
+    made.gateway.failing.set('archivePost', away);
+    await made.service.end(made.party.id);
+    made.gateway.failing.clear();
+    const redo = vi.spyOn(made.service, 'redoClosings');
+    const sweep = vi.spyOn(made.service, 'sweepPosts');
+    const { PartyScheduler } = await import('./party-scheduler.js');
+    const scheduler = new PartyScheduler({
+      store: made.store,
+      posts: made.service,
+      attendance: made.attendance,
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
+    const [redoneAt] = redo.mock.invocationCallOrder;
+    const [sweptAt] = sweep.mock.invocationCallOrder;
+    expect(redoneAt).toBeLessThan(sweptAt ?? 0);
+    // Told of the clock's stop, as the history's sweep is.
+    expect(redo.mock.calls[0]?.[0]?.isStopped?.()).toBe(false);
+    // Its last showing without controls is the redo's: the sweep only archives.
+    const post = made.gateway.posts.get(made.postId);
+    expect(post?.archived).toBe(true);
+    expect(buttonsOf(post?.message)).toEqual([]);
+  });
+
+  it('runs no step of the upkeep more once the clock stopped (review r1 C3)', async () => {
+    const made = await reportedRaid();
+    const ran: string[] = [];
+    const held = heldCall('the upkeep’s sweep of the spawn reports');
+    const { PartyScheduler } = await import('./party-scheduler.js');
+    const scheduler = new PartyScheduler({
+      store: made.store,
+      posts: made.service,
+      attendance: made.attendance,
+      spawns: {
+        sweep: async () => {
+          ran.push('spawns');
+          held.arrive();
+          await held.released;
+          return 0;
+        },
+      },
+      emoji: {
+        refresh: () => {
+          ran.push('emoji');
+          return Promise.resolve();
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
+    await held.reached;
+    const stopping = scheduler.stop();
+    held.release();
+    await stopping;
+    expect(ran).toEqual(['spawns']);
+  });
+
   it('has the standing spawn reports swept with the forums, also when another step fails', async () => {
     const made = await reportedRaid();
     let swept = 0;
diff --git a/src/services/party-scheduler.ts b/src/services/party-scheduler.ts
index ae7229bd34777f3946991cd6a240d699c759ac0b..0e2d0b1cc8f3e388508d1654a6daeef6c475dada 100644
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -37,7 +37,10 @@ const LINE_NAMES = 1_500;
 
 export interface PartySchedulerOptions {
   store: PartyStore;
-  posts: Pick<PartyService, 'changed' | 'end' | 'rules' | 'view' | 'sweepPosts' | 'checkSummaries'>;
+  posts: Pick<
+    PartyService,
+    'changed' | 'end' | 'rules' | 'view' | 'redoClosings' | 'sweepPosts' | 'checkSummaries'
+  >;
   attendance: Pick<AttendanceService, 'ask' | 'removeQuestions'>;
   /** The access of members of other regions, whose leftovers are swept with the forums. */
   access?: { sweep(): Promise<unknown> };
@@ -166,6 +169,22 @@ export class PartyScheduler {
     await this.whenIdle();
   }
 
+  /**
+   * The gateway is back after a real disconnect (plan 8X-H, review R6): the upkeep (the closings
+   * the network failed, the sweep of ended parties' posts, the summaries, the access, the application's emoji and the rest) runs
+   * now, whenever the last one ran: its steps never fail as a whole, so whether one is owed is not
+   * known, and an hour is long to wait. One under way is waited for first (the upkeep at a
+   * laptop's wake, while the network was still away); then one of its own. Nothing before the
+   * clock runs or after it stopped. Never rejects.
+   */
+  async catchUp(): Promise<void> {
+    if (this.stopped || this.timer === undefined) return;
+    await this.upkeeping;
+    if (this.stopped) return;
+    this.upkeep();
+    await this.upkeeping;
+  }
+
   /** How many posts have a count of messages since their warning. For tests. */
   get counted(): number {
     return this.sinceWarning.size;
@@ -267,7 +286,9 @@ export class PartyScheduler {
   }
 
   /**
-   * Archives open posts of ended parties, looks after the summaries, takes back the access to
+   * Closes again the parties whose closing the network failed (plan 8X-H, review r0 B4: before
+   * the sweep, which would only archive them), archives open posts of ended parties, looks after
+   * the summaries, takes back the access to
    * forums that nothing calls for any more, takes stops off the routes of trains whose gym is
    * gone, has the spawn reports and grunts' messages deleted that no process deleted at their
    * time, forgets the reports at stops that ended, and the kept
@@ -280,8 +301,10 @@ export class PartyScheduler {
       this.options;
     const { history, splits, stops, grunts } = this.options;
     this.lastUpkeep = this.now();
-    // Each by itself: one that fails does not keep the others from running.
+    // Each by itself: one that fails does not keep the others from running. Once the clock has
+    // stopped none starts: the shutdown waits for the upkeep (review r1 C3).
     const step = async (work: () => Promise<unknown>): Promise<void> => {
+      if (this.stopped) return;
       try {
         await work();
       } catch (err) {
@@ -289,6 +312,9 @@ export class PartyScheduler {
       }
     };
     this.upkeeping ??= (async () => {
+      // Party by party: it ends with the clock's stop (what is left, the next start's sweep
+      // archives).
+      await step(() => posts.redoClosings({ isStopped: () => this.stopped }));
       await step(() => posts.sweepPosts());
       await step(() => posts.checkSummaries());
       if (access) await step(() => access.sweep());
@@ -302,9 +328,7 @@ export class PartyScheduler {
       if (webSessions) await step(() => webSessions.sweep());
       if (splits) await step(() => splits.settlePendingSplits(PENDING_SPLIT_MS));
       // Party by party, over what may be many old rows: it ends with the clock's stop.
-      if (history && !this.stopped) {
-        await step(() => history.sweep({ isStopped: () => this.stopped }));
-      }
+      if (history) await step(() => history.sweep({ isStopped: () => this.stopped }));
     })()
       .catch((err: unknown) => {
         log.error({ err }, 'the upkeep of the forums failed');
diff --git a/src/services/party-service.catch-up.test.ts b/src/services/party-service.catch-up.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e4b764253c5a2dadf1996fbe10081f83cd654c80
--- /dev/null
+++ b/src/services/party-service.catch-up.test.ts
@@ -0,0 +1,196 @@
+import { RateLimitError } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { missingPermissions, networkAway } from '../../test/support/fake-gateway.js';
+import { buttonsOf, textOf } from '../../test/support/messages.js';
+import { BOB, REPORTER } from '../../test/support/parties.js';
+import { reportedRaid } from '../../test/support/party-service.js';
+import { gymsFixture } from '../../test/support/providers.js';
+import { PartyStatus } from '../domain/party/status.js';
+
+/** Discord's rate limit on an archiving, as @discordjs/rest throws it with `rejectOnRateLimit`. */
+function limited(): RateLimitError {
+  return new RateLimitError({
+    global: false,
+    hash: 'h',
+    limit: 2,
+    majorParameter: 'x',
+    method: 'PATCH',
+    retryAfter: 5_000,
+    route: '/channels/:id',
+    scope: 'user',
+    sublimitTimeout: 0,
+    timeToReset: 5_000,
+    url: 'https://discord.com/api/v10/channels/1',
+  });
+}
+
+describe('PartyService on a catch-up (plan 8X-H)', () => {
+  it('shows anew a post whose edit failed while the network was away, and leaves a current one alone', async () => {
+    const made = await reportedRaid();
+    const edits = () => made.gateway.posts.get(made.postId)?.edits ?? 0;
+    made.service.changed(made.party.id);
+    await made.service.flush();
+    const before = edits();
+    // A current post: nothing to send.
+    made.service.redrawPosts();
+    await made.service.flush();
+    expect(edits()).toBe(before);
+    made.gateway.failing.set('editPost', networkAway());
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+    await made.service.flush();
+    // The post stays as it was until something shows it anew: nothing tries it again by itself.
+    made.gateway.failing.clear();
+    expect(textOf(made.gateway.posts.get(made.postId)?.message)).not.toContain('Bob');
+    made.service.redrawPosts();
+    await made.service.flush();
+    expect(edits()).toBe(before + 1);
+    expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain('Bob');
+  });
+
+  it('redoes the closing of a party that ended while the network was away, once', async () => {
+    const made = await reportedRaid();
+    made.gateway.failing.set('editPost', networkAway());
+    made.gateway.failing.set('archivePost', networkAway());
+    await made.service.end(made.party.id, undefined, { lastWords: 'Closed by the moderators.' });
+    const post = () => made.gateway.posts.get(made.postId);
+    // Its last showing and its archiving failed: the controls are still live.
+    expect(post()?.archived).toBe(false);
+    expect(buttonsOf(post()?.message).length).toBeGreaterThan(0);
+    // Still away: tried, kept for the next catch-up.
+    expect(await made.service.redoClosings()).toEqual({ redone: 0, failed: 1 });
+    made.gateway.failing.clear();
+    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
+    expect(post()?.archived).toBe(true);
+    expect(buttonsOf(post()?.message)).toEqual([]);
+    // Its last words were said once, when it ended.
+    const said = made.gateway
+      .messagesIn(made.postId)
+      .filter((message) => JSON.stringify(message.message).includes('Closed by the moderators.'));
+    expect(said).toHaveLength(1);
+    // Nothing is owed any more.
+    expect(await made.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
+  });
+
+  it('redoes the link line and a copy whose deletion failed while the network was away (review r0 B2)', async () => {
+    const made = await reportedRaid();
+    expect(await made.service.showStatus(made.party.id)).toBe(true);
+    await made.service.flush();
+    const { regionLinkMessageId: link, mirrorMessages } = made.current();
+    const [copy] = mirrorMessages;
+    if (link === null || !copy) throw new Error('no link line or copy');
+    const deleted = () => made.gateway.deleted.map(({ messageId }) => messageId);
+    made.gateway.failing.set('deleteMessage', networkAway());
+    await made.service.end(made.party.id);
+    // The post itself was closed; the link line and the copy stand.
+    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
+    expect(deleted()).not.toContain(link);
+    expect(deleted()).not.toContain(copy.messageId);
+    made.gateway.failing.clear();
+    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
+    expect(deleted()).toEqual(expect.arrayContaining([link, copy.messageId]));
+  });
+
+  it('deletes on the redo a post a moderator chose to delete, when the network failed it (review r0 B3)', async () => {
+    const made = await reportedRaid();
+    made.gateway.failing.set('deletePost', networkAway());
+    // Archived for now, the deletion still owed (review r1 C1): not a refusal.
+    expect(
+      await made.service.endAs(made.party.id, undefined, {
+        lastWords: 'This raid was closed by the moderators.',
+        removal: 'delete',
+      }),
+    ).toBe('deleting');
+    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
+    expect(made.gateway.deletedPosts).toEqual([]);
+    made.gateway.failing.clear();
+    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
+    expect(made.gateway.deletedPosts).toEqual([made.postId]);
+    // Discord refusing the deletion archives it, and nothing is owed.
+    const refused = await reportedRaid();
+    refused.gateway.failing.set('deletePost', missingPermissions('DELETE'));
+    expect(await refused.service.endAs(refused.party.id, undefined, { removal: 'delete' })).toBe(
+      'archived',
+    );
+    expect(refused.gateway.posts.get(refused.postId)?.archived).toBe(true);
+    expect(await refused.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
+  });
+
+  it('keeps only what the network failed: not a refusal of Discord’s, not a post that is gone (review r0 B5)', async () => {
+    const refused = await reportedRaid();
+    refused.gateway.failing.set('archivePost', missingPermissions('PATCH'));
+    await refused.service.end(refused.party.id);
+    expect(await refused.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
+    // A post deleted by hand: its link line failed for the network, but there is nothing to close.
+    const gone = await reportedRaid();
+    gone.gateway.gone.add(gone.postId);
+    gone.gateway.failing.set('deleteMessage', networkAway());
+    await gone.service.end(gone.party.id);
+    expect(await gone.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
+  });
+
+  it('keeps and redoes what a rate limit failed (review r1 C6)', async () => {
+    const made = await reportedRaid();
+    made.gateway.failing.set('archivePost', limited());
+    await made.service.end(made.party.id);
+    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
+    made.gateway.failing.clear();
+    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
+    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
+  });
+
+  it('tries one closing a run while the network is away, the rest kept (review r1 C2)', async () => {
+    const made = await reportedRaid();
+    const gym = gymsFixture().get(2);
+    if (!gym) throw new Error('the invented gyms have no gym 2');
+    const other = await made.service.reportRaid({
+      gym,
+      reporterId: REPORTER,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: { level: 'T5', shadow: false },
+      boss: null,
+    });
+    if (other.kind !== 'created') throw new Error(other.kind);
+    await made.service.flush();
+    made.gateway.failing.set('archivePost', networkAway());
+    await made.service.end(made.party.id);
+    await made.service.end(other.party.id);
+    const archives = () =>
+      made.gateway.calls.filter((call) => call.startsWith('archivePost ')).length;
+    const before = archives();
+    // The first still fails: the second is not tried (a black-holed request takes a minute).
+    expect(await made.service.redoClosings()).toEqual({ redone: 0, failed: 1 });
+    expect(archives()).toBe(before + 1);
+    made.gateway.failing.clear();
+    expect(await made.service.redoClosings()).toEqual({ redone: 2, failed: 0 });
+  });
+
+  it('forgets a closing still undone after a day (review r0 B4)', async () => {
+    const made = await reportedRaid();
+    made.gateway.failing.set('archivePost', networkAway());
+    await made.service.end(made.party.id);
+    made.clock.now += 24 * 60 * 60 * 1000 + 1;
+    made.gateway.failing.clear();
+    expect(await made.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
+    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
+  });
+
+  it('ends between parties when told the clock stopped (review r0 B6)', async () => {
+    const made = await reportedRaid();
+    made.gateway.failing.set('archivePost', networkAway());
+    await made.service.end(made.party.id);
+    made.gateway.failing.clear();
+    expect(await made.service.redoClosings({ isStopped: () => true })).toEqual({
+      redone: 0,
+      failed: 0,
+    });
+    // Still owed for the next run.
+    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
+  });
+
+  it('owes nothing for a closing that went through', async () => {
+    const made = await reportedRaid();
+    await made.service.end(made.party.id);
+    expect(await made.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
+  });
+});
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index f2ccb200584210a9fdb45e3a60589a5084a2ed0a..6bdd23f47cf3c6ccf01edcb48e4ee603da9aecfe 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -180,6 +180,35 @@ const CHECK_EVERY_MS = 10 * MINUTE;
  */
 export const EMOJI_RENDER_GAP_MS = 250;
 
+/** At most so many closings that failed are kept to be done again (`redoClosings`). */
+export const UNDONE_CLOSINGS_MAX = 500;
+/**
+ * A closing still undone a day after the party ended is forgotten: no post is opened and archived
+ * again days later (review r0 B4); the sweep archives what stayed open.
+ */
+export const UNDONE_CLOSING_KEPT_MS = 24 * 60 * 60 * 1000;
+
+/**
+ * Whether a failure of a closing is worth trying again with the upkeep (plan 8X-H, review r0 B5):
+ * the network's, or a rate limit discord.js would not wait for. A refusal of Discord's (Missing
+ * Access) would fail the same way again.
+ */
+function worthRedoing(err: unknown): boolean {
+  return isNetworkError(err) || rateLimitWaitMs(err) !== undefined;
+}
+
+/** A closing of an ended party of which a part failed for the network (`redoClosings`). */
+interface UndoneClosing {
+  party: Party;
+  lastWords: string | undefined;
+  /** Whether the last words were said already. */
+  said: boolean;
+  /** `delete` where a moderator chose it and the deletion failed for the network (review r0 B3). */
+  removal: PostRemoval;
+  /** When the party ended (its first closing). */
+  since: number;
+}
+
 /** How a party is ended by `end`: why, what is said last, and the post archived or deleted. */
 export interface PartyClosing {
   lastWords?: string;
@@ -188,8 +217,11 @@ export interface PartyClosing {
   removal?: PostRemoval;
 }
 
-/** How the post of a party went when it ended (`endAs`). */
-export type PostRemoved = 'archived' | 'deleted';
+/**
+ * How the post of a party went when it ended (`endAs`): `deleting` where a deletion failed for the
+ * network, so that the post is archived for now and deleted by `redoClosings` (review r1 C1).
+ */
+export type PostRemoved = 'archived' | 'deleted' | 'deleting';
 
 export interface RaidReport {
   gym: Gym;
@@ -630,6 +662,14 @@ export class PartyService {
    * summary that would be the same is not edited again.
    */
   private readonly summarySent = new Map<number, { postId: string; text: string }>();
+  /**
+   * The closings of ended parties of which a part failed for the network (plan 8X-H, review R4;
+   * Matt 2026-10-23: the network away while a party ended left its post with live controls, which
+   * the sweep only archives): the party as it ended, its last words and whether they were said,
+   * how its post goes, redone by `redoClosings` with the upkeep, for a day. In memory, bounded:
+   * after a restart the sweep archives what is left open, as before.
+   */
+  private readonly undoneClosings = new BoundedMap<string, UndoneClosing>(UNDONE_CLOSINGS_MAX);
 
   /** The regions whose summary post Discord refused to rename, said once in the log. */
   private readonly renameRefused = new Set<number>();
@@ -2196,6 +2236,22 @@ export class PartyService {
    * post whose message stays the same is not edited. Nothing after `close`; `flush` drops the rest.
    */
   emojiChanged(): void {
+    this.showAllAnew();
+  }
+
+  /**
+   * The gateway is back after a real disconnect (plan 8X-H, review R3): every active party's post
+   * is shown anew as `emojiChanged` shows them, one party every `EMOJI_RENDER_GAP_MS`. A post
+   * whose edit failed while the network was away stays as it was until something shows it anew
+   * (`showPost` forgot what it sent before trying), so it is edited now; one that is current
+   * makes no edit. Nothing after `close`.
+   */
+  redrawPosts(): void {
+    this.showAllAnew();
+  }
+
+  /** Every active post shown anew, paced (`emojiChanged`, `redrawPosts`). */
+  private showAllAnew(): void {
     if (this.closed) return;
     this.emojiQueue = this.options.store
       .active()
@@ -2279,8 +2335,9 @@ export class PartyService {
 
   /**
    * `end`, saying how the post went (plan 8S-2): `deleted` (`closing.removal` `delete` and Discord
-   * deleted it), `archived` (as usual, also where Discord refused the deletion), or false when
-   * there was no such active party (nothing was done).
+   * deleted it), `archived` (as usual, also where Discord refused the deletion), `deleting` (the
+   * deletion failed for the network: archived for now, deleted by `redoClosings`; plan 8X-H,
+   * review r1 C1), or false when there was no such active party (nothing was done).
    */
   async endAs(
     partyId: string,
@@ -2425,19 +2482,24 @@ export class PartyService {
     return 'asked';
   }
 
-  /** Deletes the line that links to a party in its region's channel; a failure is a warning. */
-  private async deleteLinkLine(party: Party): Promise<void> {
+  /**
+   * Deletes the line that links to a party in its region's channel; a failure is a warning, and
+   * given back (none or one) for the closing to judge whether it is owed (review r0 B2).
+   */
+  private async deleteLinkLine(party: Party): Promise<unknown[]> {
     const regionChannel =
       party.regionId === null ? undefined : this.options.regions.byId(party.regionId);
     const linkId = party.regionLinkMessageId;
-    if (!regionChannel || linkId === null) return;
+    if (!regionChannel || linkId === null) return [];
     try {
       await this.options.gateway.deleteMessage(regionChannel.channelId, linkId);
+      return [];
     } catch (err) {
       this.options.log.warn(
         { err, party: party.id, post: party.forumPostId },
         'could not delete the link to an ended party',
       );
+      return [err];
     }
   }
 
@@ -2451,31 +2513,64 @@ export class PartyService {
     lastWords?: string,
     said = false,
     removal: PostRemoval = 'archive',
+    since = this.now(),
   ): Promise<PostRemoved> {
     const { gateway, log } = this.options;
     const postId = party.forumPostId;
+    // What of the closing failed for the network: it is redone with the upkeep (plan 8X-H,
+    // review r0 B5: a refusal of Discord's would fail again, and is not kept).
+    let undone = false;
+    let owedRemoval: PostRemoval = 'archive';
+    let wordsSaid = said;
+    const owe = (err: unknown): void => {
+      if (worthRedoing(err)) undone = true;
+    };
     const attempt = async (what: string, work: () => Promise<unknown>): Promise<void> => {
       try {
         await work();
       } catch (err) {
+        owe(err);
         log.warn({ err, party: party.id, post: postId }, `could not ${what}`);
       }
     };
-    await this.deleteLinkLine(party);
+    // A post that is gone has nothing left to close, whatever else failed. One whose deletion the
+    // network failed is archived for now and `deleting` (review r1 C1).
+    const closed = (removed: PostRemoved, gone = false): PostRemoved => {
+      if (undone && !gone) {
+        this.undoneClosings.set(party.id, {
+          party,
+          lastWords,
+          said: wordsSaid,
+          removal: owedRemoval,
+          since,
+        });
+        if (owedRemoval === 'delete') return 'deleting';
+      } else {
+        this.undoneClosings.delete(party.id);
+      }
+      return removed;
+    };
+    for (const err of await this.deleteLinkLine(party)) owe(err);
     // What was under way when the party ended (a render, a `/status`, an edit of a copy)
     // would open the post again if it landed after the archiving. None of it can have recorded
     // a copy that `party` does not know of: the party had ended.
     await this.posts.idle(party.id);
     await this.mirrors.idle(party.id);
-    await this.mirrors.remove(party);
-    if (postId === null) return 'archived';
+    for (const err of await this.mirrors.remove(party)) owe(err);
+    if (postId === null) return closed('archived');
     if (removal === 'delete') {
       try {
         // The post goes with everything in it: nothing is said in it or done to it any more.
         await gateway.deletePost(postId);
-        return 'deleted';
+        return closed('deleted');
       } catch (err) {
         log.warn({ err, party: party.id, post: postId }, 'could not delete the post of a party');
+        // The moderator's choice is honoured once the network is back (review r0 B3); meanwhile
+        // the post is closed as usual. A refusal of Discord's leaves it archived.
+        if (worthRedoing(err)) {
+          undone = true;
+          owedRemoval = 'delete';
+        }
       }
     }
     const leftovers = [
@@ -2487,10 +2582,11 @@ export class PartyService {
         gateway.deleteMessage(postId, messageId),
       );
     }
-    if (lastWords !== undefined && !said) {
-      await attempt('say why a party ended', () =>
-        gateway.sendMessage(postId, { content: lastWords }),
-      );
+    if (lastWords !== undefined && !wordsSaid) {
+      await attempt('say why a party ended', async () => {
+        await gateway.sendMessage(postId, { content: lastWords });
+        wordsSaid = true;
+      });
     }
     let there = true;
     // A party that was closed says so in the post itself, in the place of its times; a meetup
@@ -2501,7 +2597,7 @@ export class PartyService {
     });
     if (!there) {
       log.info({ party: party.id, post: postId }, 'the post of an ended party is gone');
-      return 'archived';
+      return closed('archived', true);
     }
     const forumId = party.forumChannelId;
     if (forumId !== null && (lastWords !== undefined || !isRaid(party))) {
@@ -2513,7 +2609,57 @@ export class PartyService {
       );
     }
     await attempt('archive the post of an ended party', () => gateway.archivePost(postId));
-    return 'archived';
+    return closed('archived');
+  }
+
+  /**
+   * The closings of which a part failed for the network (plan 8X-H, review R4) are done again,
+   * oldest first, as the first step of the hourly upkeep and so of the catch-up on reconnect
+   * (review r0 B4: a request can fail without the gateway going away): `closePost` with the link
+   * line and copies, the leftover questions and the warning deleted, the last showing without
+   * controls with its Ended tag, the last words where they were not said, the archiving, or the
+   * deletion a moderator chose. One that fails again for the network is kept for the next run, for
+   * a day after the party ended (`UNDONE_CLOSING_KEPT_MS`); then it is forgotten. The run ends with
+   * the first that fails again: the rest wait for the next (review r1 C2). Ends between
+   * parties once `isStopped` says so (the clock's stop), the rest kept. Says how many were redone
+   * and how many failed again, and logs it where there were any. Never rejects.
+   */
+  async redoClosings(
+    options: { isStopped?: () => boolean } = {},
+  ): Promise<{ redone: number; failed: number }> {
+    const { log } = this.options;
+    let redone = 0;
+    let failed = 0;
+    const tooOld = this.now() - UNDONE_CLOSING_KEPT_MS;
+    for (const partyId of this.undoneClosings.keys()) {
+      if (options.isStopped?.()) break;
+      const undone = this.undoneClosings.get(partyId);
+      if (!undone) continue;
+      if (undone.since < tooOld) {
+        this.undoneClosings.delete(partyId);
+        continue;
+      }
+      try {
+        await this.closePost(
+          undone.party,
+          undone.lastWords,
+          undone.said,
+          undone.removal,
+          undone.since,
+        );
+      } catch (err) {
+        log.warn({ err, party: partyId }, 'could not close a party again');
+      }
+      if (this.undoneClosings.has(partyId)) {
+        // The network is still away: one probe a run, the rest kept for the next (a request
+        // that is black-holed takes about a minute; review r1 C2).
+        failed++;
+        break;
+      }
+      redone++;
+    }
+    if (redone + failed > 0) log.info({ redone, failed }, 'closed ended parties again');
+    return { redone, failed };
   }
 
   /**
diff --git a/src/services/raid-boss-service.test.ts b/src/services/raid-boss-service.test.ts
index 2f2559df603e7bfde09d99d3bdc06631419e099e..83da66d1cefa3da24280997643065ecfebc68cb4 100644
--- a/src/services/raid-boss-service.test.ts
+++ b/src/services/raid-boss-service.test.ts
@@ -715,6 +715,33 @@ describe('RaidBossService', () => {
       ]);
     });
 
+    it('catches up at once after a failed read, and only then (plan 8X-H)', async () => {
+      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+      const { raidBosses } = service();
+      await raidBosses.load();
+      await raidBosses.sync();
+      // The last read worked: nothing is owed, nothing asked.
+      const asked = requests.length;
+      expect(await raidBosses.catchUp()).toBe('not-owed');
+      expect(requests).toHaveLength(asked);
+      now += HOUR;
+      respond = () => Promise.reject(new TypeError('fetch failed'));
+      raidBosses.startAutoSync();
+      await vi.advanceTimersToNextTimerAsync();
+      await raidBosses.whenIdle();
+      expect(requests).toHaveLength(asked + 1);
+      // Back: read at once, not at the retry five minutes on, and once only.
+      respond = () => Promise.resolve(reply(200, downloaded));
+      expect(await raidBosses.catchUp()).toBe('done');
+      expect(requests).toHaveLength(asked + 2);
+      expect(raidBosses.lastSyncedAt).toBe(now);
+      // The next read is a refresh's interval on, as after any read that worked.
+      expect(vi.getTimerCount()).toBe(1);
+      await vi.advanceTimersByTimeAsync(HOUR - 1);
+      expect(requests).toHaveLength(asked + 2);
+      raidBosses.stop();
+    });
+
     it('gives up on a download that stalls', async () => {
       const { raidBosses } = service({ timeoutMs: 20 });
       await raidBosses.load();
diff --git a/src/services/raid-event-service.test.ts b/src/services/raid-event-service.test.ts
index de0a59859a7996ad12af9e56a340ab809da3fbc0..f1002bcb717daa6b81e7b49c246fd51c69ba79a7 100644
--- a/src/services/raid-event-service.test.ts
+++ b/src/services/raid-event-service.test.ts
@@ -80,6 +80,26 @@ describe('RaidEventService', () => {
     );
   });
 
+  it('catches up at once after a failed read, and only then (plan 8X-H)', async () => {
+    let next: () => Promise<Response> = () => Promise.reject(new TypeError('fetch failed'));
+    const fetch = vi.fn<FetchEvents>(() => next());
+    const { events } = service(fetch);
+    events.start();
+    await vi.advanceTimersToNextTimerAsync();
+    await events.whenIdle();
+    expect(fetch).toHaveBeenCalledTimes(1);
+    next = () => Promise.resolve(reply(200, downloaded));
+    expect(await events.catchUp()).toBe('done');
+    expect(fetch).toHaveBeenCalledTimes(2);
+    expect(events.events()).toHaveLength(5);
+    expect(await events.catchUp()).toBe('not-owed');
+    expect(fetch).toHaveBeenCalledTimes(2);
+    expect(vi.getTimerCount()).toBe(1);
+    await vi.advanceTimersByTimeAsync(6 * HOUR - 1);
+    expect(fetch).toHaveBeenCalledTimes(2);
+    events.stop();
+  });
+
   it('keeps the events it has when the feed fails in any way', async () => {
     let next: () => Promise<Response> = () => Promise.resolve(reply(200, downloaded));
     const { events, entries } = service(() => next());
diff --git a/src/services/raid-event-service.ts b/src/services/raid-event-service.ts
index 4449d2f263aaf912eb06e9dd9c136767d11a7668..47d9755e8f880359cd66c272a76ffd676146c2a9 100644
--- a/src/services/raid-event-service.ts
+++ b/src/services/raid-event-service.ts
@@ -16,6 +16,7 @@ import { parseSpawnEventFeed, type SpawnEvent } from '../domain/time/spawn-event
 import type { ResearchEventStorage } from '../db/repositories/research-event-repository.js';
 import type { KeptMaxEvents, MaxEventStorage } from '../db/repositories/max-event-repository.js';
 import type { Logger } from '../log.js';
+import type { CatchUpOutcome } from './catch-up.js';
 import { failureReason } from './failure-reason.js';
 
 /** The feed is about 60,000 characters; anything near this size is not the feed. */
@@ -158,6 +159,8 @@ export class RaidEventService
   private inFlight: Promise<RefreshResult> | undefined;
   private timer: NodeJS.Timeout | undefined;
   private stopped = true;
+  /** Whether the last read failed (not for a stop): the catch-up reads it again. */
+  private owed = false;
 
   constructor(private readonly options: RaidEventOptions) {
     this.timeoutMs = options.timeoutMs ?? 30_000;
@@ -277,9 +280,14 @@ export class RaidEventService
    * Reads the feed. Never rejects. Calls made while one is running share its result.
    */
   refresh(): Promise<RefreshResult> {
-    this.inFlight ??= this.refreshOnce().finally(() => {
-      this.inFlight = undefined;
-    });
+    this.inFlight ??= this.refreshOnce()
+      .then((result) => {
+        this.owed = result.status === 'failed' && result.reason !== 'stopped';
+        return result;
+      })
+      .finally(() => {
+        this.inFlight = undefined;
+      });
     return this.inFlight;
   }
 
@@ -295,6 +303,27 @@ export class RaidEventService
     this.schedule(0);
   }
 
+  /**
+   * The gateway is back after a real disconnect (plan 8X-H, review R1): when the last read
+   * failed, the feed is read now instead of at the retry, through `refresh`'s guard (a read the
+   * timer started meanwhile is waited for first, and decides), and the next read scheduled
+   * from this one; else nothing is owed and nothing is asked. Never rejects.
+   */
+  async catchUp(): Promise<CatchUpOutcome> {
+    if (this.stopped) return 'not-owed';
+    await this.whenIdle();
+    if (!this.owed) return 'not-owed';
+    // The scheduled read is this one: cleared, then set again from it.
+    if (this.timer) clearTimeout(this.timer);
+    this.timer = undefined;
+    const result = await this.refresh();
+    const failed = result.status === 'failed';
+    if (!this.stopped && !this.timer) {
+      this.schedule(failed ? this.retryMs : this.options.refreshMs);
+    }
+    return failed ? 'failed' : 'done';
+  }
+
   /** Cancels the scheduled download and ends one in flight. */
   stop(): void {
     this.stopped = true;
diff --git a/src/services/research-task-service.test.ts b/src/services/research-task-service.test.ts
index a286ff4bb8d16335f37d52fdc5979d1d63aa9791..69f34bf0e10dc150d4d291714512062a63c7371a 100644
--- a/src/services/research-task-service.test.ts
+++ b/src/services/research-task-service.test.ts
@@ -49,6 +49,33 @@ describe('ResearchTaskService', () => {
     vi.useRealTimers();
   });
 
+  it('catches up at once after a failed read, and only then (plan 8X-H)', async () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    let answer = () => page();
+    const { service, asked } = serviceWith(() => answer());
+    expect(await service.catchUp()).toBe('not-owed');
+    expect(asked).toHaveLength(0);
+    answer = () => Promise.reject(new TypeError('fetch failed'));
+    service.start();
+    await vi.advanceTimersToNextTimerAsync();
+    await service.whenIdle();
+    expect(asked).toHaveLength(1);
+    // Back: read at once, not at the retry a quarter of an hour on.
+    answer = () => page();
+    expect(await service.catchUp()).toBe('done');
+    expect(asked).toHaveLength(2);
+    expect(service.tasks()).toHaveLength(58);
+    expect(await service.catchUp()).toBe('not-owed');
+    // The next read is a refresh's interval on.
+    expect(vi.getTimerCount()).toBe(1);
+    await vi.advanceTimersByTimeAsync(HOUR - 1);
+    expect(asked).toHaveLength(2);
+    await vi.advanceTimersByTimeAsync(1);
+    await service.whenIdle();
+    expect(asked).toHaveLength(3);
+    service.stop();
+  });
+
   it('reads the page with Pine’s User-Agent and keeps the list in the database', async () => {
     const { service, store, asked } = serviceWith(() => page());
     expect(service.tasks()).toEqual([]);
diff --git a/src/services/research-task-service.ts b/src/services/research-task-service.ts
index 08ca41fb6cc58c286e2c0e47fd7806fe0bfa1262..71bfb23767af7334dfae9eacec7af2f3315255ed 100644
--- a/src/services/research-task-service.ts
+++ b/src/services/research-task-service.ts
@@ -9,6 +9,7 @@ import {
   type VersionIndex,
 } from '../domain/research/versions.js';
 import type { Logger } from '../log.js';
+import type { CatchUpOutcome } from './catch-up.js';
 import { failureReason } from './failure-reason.js';
 import type { GameDataProvider } from './game-data-service.js';
 import { readLimitedText, type LimitedResponse } from './limited-json.js';
@@ -102,6 +103,8 @@ export class ResearchTaskService implements ResearchTaskProvider {
   private inFlight: Promise<ResearchRefresh> | undefined;
   private timer: NodeJS.Timeout | undefined;
   private stopped = true;
+  /** Whether the last read failed (not for a stop): the catch-up reads it again. */
+  private owed = false;
   private staleTold = false;
   /** The task keys of the last read refused as much smaller (`shrinkAgreed`); a read clears it. */
   private shrink: string | undefined;
@@ -171,9 +174,14 @@ export class ResearchTaskService implements ResearchTaskProvider {
 
   /** Reads the page now. Never rejects; calls made while one runs share its result. */
   refresh(): Promise<ResearchRefresh> {
-    this.inFlight ??= this.refreshOnce().finally(() => {
-      this.inFlight = undefined;
-    });
+    this.inFlight ??= this.refreshOnce()
+      .then((result) => {
+        this.owed = result.status === 'failed' && result.reason !== 'stopped';
+        return result;
+      })
+      .finally(() => {
+        this.inFlight = undefined;
+      });
     return this.inFlight;
   }
 
@@ -193,6 +201,27 @@ export class ResearchTaskService implements ResearchTaskProvider {
     this.schedule(Math.max(0, this.options.refreshMs - age));
   }
 
+  /**
+   * The gateway is back after a real disconnect (plan 8X-H, review R1): when the last read
+   * failed, the page is read now instead of at the retry, through `refresh`'s guard (a read the
+   * timer started meanwhile is waited for first, and decides), and the next read scheduled
+   * from this one; else nothing is owed and nothing is asked. Never rejects.
+   */
+  async catchUp(): Promise<CatchUpOutcome> {
+    if (this.stopped) return 'not-owed';
+    await this.whenIdle();
+    if (!this.owed) return 'not-owed';
+    // The scheduled read is this one: cleared, then set again from it.
+    if (this.timer) clearTimeout(this.timer);
+    this.timer = undefined;
+    const result = await this.refresh();
+    const failed = result.status === 'failed';
+    if (!this.stopped && !this.timer) {
+      this.schedule(failed ? this.retryMs : this.options.refreshMs);
+    }
+    return failed ? 'failed' : 'done';
+  }
+
   /** Cancels the scheduled read and ends one in flight. */
   stop(): void {
     this.stopped = true;
diff --git a/src/services/rocket-lineup-service.test.ts b/src/services/rocket-lineup-service.test.ts
index acbd7d10b4b4b37e136eaed2c041827a738cb580..b48453fa593e61c1c6f2f515c7bcd8b77686b696 100644
--- a/src/services/rocket-lineup-service.test.ts
+++ b/src/services/rocket-lineup-service.test.ts
@@ -45,6 +45,26 @@ describe('RocketLineupService', () => {
     vi.useRealTimers();
   });
 
+  it('catches up at once after a failed read, and only then (plan 8X-H)', async () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    let answer = () => feed();
+    const { service, asked } = serviceWith(() => answer());
+    expect(await service.catchUp()).toBe('not-owed');
+    answer = () => Promise.reject(new TypeError('fetch failed'));
+    service.start();
+    await vi.advanceTimersToNextTimerAsync();
+    await service.whenIdle();
+    expect(asked).toHaveLength(1);
+    answer = () => feed();
+    expect(await service.catchUp()).toBe('done');
+    expect(asked).toHaveLength(2);
+    expect(await service.catchUp()).toBe('not-owed');
+    expect(vi.getTimerCount()).toBe(1);
+    await vi.advanceTimersByTimeAsync(6 * HOUR - 1);
+    expect(asked).toHaveLength(2);
+    service.stop();
+  });
+
   it('reads the feed with Pine’s User-Agent and keeps the list in the database', async () => {
     const { service, store, asked } = serviceWith(() => feed());
     expect(service.choices()).toEqual([]);
diff --git a/src/services/rocket-lineup-service.ts b/src/services/rocket-lineup-service.ts
index 072c4cd78d655b650809a693485251372a2db5a8..7ce05f7c7a3c6bea075866d6d3a952e8a24b1336 100644
--- a/src/services/rocket-lineup-service.ts
+++ b/src/services/rocket-lineup-service.ts
@@ -1,6 +1,7 @@
 import type { RocketLineupStorage } from '../db/repositories/rocket-lineup-repository.js';
 import { parseRocketLineups, type RocketChoice } from '../domain/rocket/lineups.js';
 import type { Logger } from '../log.js';
+import type { CatchUpOutcome } from './catch-up.js';
 import { failureReason } from './failure-reason.js';
 import type { GameDataProvider } from './game-data-service.js';
 import { readLimitedJson } from './limited-json.js';
@@ -76,6 +77,8 @@ export class RocketLineupService implements RocketLineupProvider {
   private inFlight: Promise<RocketRefresh> | undefined;
   private timer: NodeJS.Timeout | undefined;
   private stopped = true;
+  /** Whether the last read failed (not for a stop): the catch-up reads it again. */
+  private owed = false;
   private staleTold = false;
   /** The keys of the last read refused as much smaller (`shrinkAgreed`); a read clears it. */
   private shrink: string | undefined;
@@ -117,9 +120,14 @@ export class RocketLineupService implements RocketLineupProvider {
 
   /** Reads the feed now. Never rejects; calls made while one runs share its result. */
   refresh(): Promise<RocketRefresh> {
-    this.inFlight ??= this.refreshOnce().finally(() => {
-      this.inFlight = undefined;
-    });
+    this.inFlight ??= this.refreshOnce()
+      .then((result) => {
+        this.owed = result.status === 'failed' && result.reason !== 'stopped';
+        return result;
+      })
+      .finally(() => {
+        this.inFlight = undefined;
+      });
     return this.inFlight;
   }
 
@@ -139,6 +147,27 @@ export class RocketLineupService implements RocketLineupProvider {
     this.schedule(Math.max(0, this.options.refreshMs - age));
   }
 
+  /**
+   * The gateway is back after a real disconnect (plan 8X-H, review R1): when the last read
+   * failed, the feed is read now instead of at the retry, through `refresh`'s guard (a read the
+   * timer started meanwhile is waited for first, and decides), and the next read scheduled
+   * from this one; else nothing is owed and nothing is asked. Never rejects.
+   */
+  async catchUp(): Promise<CatchUpOutcome> {
+    if (this.stopped) return 'not-owed';
+    await this.whenIdle();
+    if (!this.owed) return 'not-owed';
+    // The scheduled read is this one: cleared, then set again from it.
+    if (this.timer) clearTimeout(this.timer);
+    this.timer = undefined;
+    const result = await this.refresh();
+    const failed = result.status === 'failed';
+    if (!this.stopped && !this.timer) {
+      this.schedule(failed ? this.retryMs : this.options.refreshMs);
+    }
+    return failed ? 'failed' : 'done';
+  }
+
   /** Cancels the scheduled read and ends one in flight. */
   stop(): void {
     this.stopped = true;
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index d65f47ed8657be0b1510d11873ced63cbb098bc9..3c097640ec8f74c6e524854543faf5ed955e4f75 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -380,6 +380,23 @@ describe('StopPostService', () => {
     expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual([first?.id]);
   });
 
+  it('draws on a catch-up a post whose edit failed while the network was away (plan 8X-H)', async () => {
+    made = postsWith();
+    await made.report(pageTask('Catch a Dragon-type Pokémon'));
+    await made.posts.flush();
+    made.gateway.failing.set('editMessage', new Error('getaddrinfo ENOTFOUND discord.com'));
+    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
+    await made.posts.flush();
+    made.gateway.failing.delete('editMessage');
+    expect(made.said()[0]).not.toContain('Yellow Mural 2');
+    await made.posts.catchUp();
+    expect(made.said()[0]).toContain('Yellow Mural 2');
+    // A post that is current is not edited again.
+    const edits = made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits;
+    await made.posts.catchUp();
+    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits).toBe(edits);
+  });
+
   it('sends a message anew whose edit Discord refuses after a restart, its kind not known (F3)', async () => {
     made = postsWith();
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
diff --git a/src/services/stop-posts.ts b/src/services/stop-posts.ts
index 9f8b31b799699a59f4722bf655d81596caac859a..96b6c8067441dd8bfe74d7cf84bf5696ee0aa4f5 100644
--- a/src/services/stop-posts.ts
+++ b/src/services/stop-posts.ts
@@ -494,6 +494,17 @@ export class StopPostService {
     await this.queue.whenIdle();
   }
 
+  /**
+   * The gateway is back after a real disconnect (plan 8X-H, review R5): every kept post is drawn
+   * as things stand now (a draw that failed meanwhile, such as the turn-over at midnight, waited
+   * for the next change of period before); one that would show the same makes no edit. Nothing
+   * after `close`.
+   */
+  async catchUp(): Promise<void> {
+    if (this.closed) return;
+    await this.turnOver();
+  }
+
   /** Stops the timer; what waits is drawn first. */
   async close(): Promise<void> {
     await this.flush();
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index 62d4e562c55bd003343332b334534fbc368b76ee..9a3dbce53e0940e40e81ea0c6db96e91f4125ae3 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -37,6 +37,16 @@ export function missingPermissions(method: string): DiscordAPIError {
   return new DiscordAPIError({ code, message: 'Missing Permissions' }, code, 403, method, '/x', {});
 }
 
+/**
+ * What undici gives while Windows' DNS is away (the staging of 8X-G): a request the network failed,
+ * not a refusal of Discord's (`isNetworkError`).
+ */
+export function networkAway(): Error {
+  return new TypeError('fetch failed', {
+    cause: Object.assign(new Error('getaddrinfo ENOTFOUND discord.com'), { code: 'ENOTFOUND' }),
+  });
+}
+
 /** Discord's refusal of a new channel in a server that has 500. */
 export function serverFull(): DiscordAPIError {
   const code = RESTJSONErrorCodes.MaximumNumberOfGuildChannelsReached;
````

### Task 7: 8X-H 7: Docs: 8X-H in the area files, the staging checklist

Prototype commit: `c64d2efb1f91957825e00f979a7d6140b44d3678`

The catch-up on reconnect, the gateway watch and the logging of an outage in
operations.md (it covers outages of about 30 seconds to 7 minutes beside the
watchdog); the closings redone, posts drawn anew, the sweep's warning and the
summary's dates in parties-and-posts.md; Move…'s Previous at a turn-back
end and a finished route's words in trains.md; the refusal's ten movesets
and a 503 in utilities.md; the helpers in testing.md. The staging checklist
`2026-10-23-phase-8xh-staging.md`.

**Files:**

```
 docs/architecture/moderation.md                        |  4 ++--
 docs/architecture/operations.md                        | 10 +++++++++-
 docs/architecture/parties-and-posts.md                 |  4 ++--
 docs/architecture/testing.md                           |  4 +++-
 docs/architecture/trains.md                            |  2 +-
 docs/architecture/utilities.md                         |  2 +-
 docs/superpowers/plans/2026-10-23-phase-8xh-staging.md | 35 +++++++++++++++++++++++++++++++++++
 7 files changed, 53 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c64d2efb1f91957825e00f979a7d6140b44d3678 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-23-phase-8xh-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-H 7: Docs: 8X-H in the area files, the staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/moderation.md b/docs/architecture/moderation.md
index 0d3f594efa18ac45933cb2ca4431dde6e7c36673..267078e3888862567acfbbe625f946174785178a 100644
--- a/docs/architecture/moderation.md
+++ b/docs/architecture/moderation.md
@@ -11,7 +11,7 @@ Members report a party or a single message to the moderators privately, the mode
 ## The moderators' post and its decisions
 
 - `reportMessage(report)` (`src/render/moderation.ts`): `### Reported meetup` (raid, train, max battle, message), what it is and when, who made it and where ("Reported by" for a raid or a max battle, "Created by" for a meetup or a train; `subject.partyType` is of `PARTY_TYPES`, so a kind added later is read back), **Where** (`placeLine`, a gym's official name beside its nickname), a meetup's **Information**, **Reasons** with every reporter (`memberText`, the words through `plain`; as many whole ones as fit, then "…and N more reasons"), and while open the buttons of `reportActions`: a raid or train Close… and Dismiss; a meetup Close…, Refuse place… (a gym or PokéStop, never a pin), Block maker… and Dismiss; a message Delete message and Dismiss; with Go to post / Go to message while it is there. Decided, it shows who decided what and when, without buttons.
-- `reportDecisionControls` (kind `mreport`, `src/components/moderation-reports.ts`): staff alone (`requireManagement`, refused uncounted), `SAFETY_THROTTLE`. An action that ends a party asks first in a dialog (plan 8Q, `removalDialog` in `src/render/moderation.ts`): titled `Close this meetup`, `Refuse this place` or `Block the maker`, today's question as its text, and the required radio group `The post` with nothing picked, Archive post (`Keeps it readable and locked.`) or Delete post (`Removes it with everything written in it: …`); where the bot may not delete the post (`PartyService.mayDeletePost`) there is no choice, the text says the post will be archived and why (the forum named, `channelInDialog`), and the custom id carries `archive`. The report is read within `DIALOG_READ_MS` (`readInTime`, else the slow-read refusal) and one decided already is said at once without a dialog. Its Submit (`mreport:<id>:<action>[:archive]:~<token>`, the per-open token of `removalDialog` left out by `removalOf`; the button Archive post carries none, the same guards and throttle) is acknowledged privately and decided, the answer private; the post is redrawn for everybody as before. `ModerationReports.decide`: one conditional change of the report (`decideReport`, the first press wins; a later one is told who decided what; a question of an action pressed on a decided report says so at once), then its work with the party as it is now (its subject renewed): Refuse place… refuses the place for good with the report's post as the ruling's source (`MeetupSafety.refusePlace`), Block maker… blocks as Block member does (`MeetupSafety.blockMember`: the maker's name kept, one DM only for a new block, the maker's other meetups closed archived, this one left to the end, their pending requests withdrawn), then the party ends as `/delete` ends it (`PartyService.endAs` with "This meetup was closed by the moderators.", `removal`; the history records `cancelled`). Refuse place… on a meetup whose place is now a pin or none changes nothing (`no-place`, said so). Where a step of the work fails, the report is opened again (`reopenReport`: its buttons back) and `failed` tells the moderator what was done before it (a place refused, a maker blocked: they stay, and a second try finds them done) and whether the report is open again (if not, to close the party with `/delete`). `endAs` says how the post went: a deletion Discord refused archives it, which the report keeps as removal `denied` (`setRemoval`; the post says "archived: Discord refused to delete it") and the moderator is told ("archived: Discord refused to delete it; delete it yourself"); a party over between the press and the closing has its post deleted all the same when Delete post was chosen (`PartyService.deletePostOf`). Delete post where the bot lacks Manage Threads (`PartyGateway.mayDeletePost`, from the cache; by Submit, since the dialog offered it) is refused before anything changes (`may-not-delete`): the private answer says so with one button, Archive post (`mreport:<id>:<action>:archive`), which decides at once. The question's Delete post of before plan 8Q (`…:delete`) gets the router's stale answer. Delete message claims the report first (`decideReport` as `deleted`, so a Dismiss at the same moment wins or loses before anything is deleted), then deletes the message (`PartyGateway.deleteReported`: an archived post is opened for the deletion and archived again as it was, locked or not, also when the deletion fails, and only where the bot has Manage Threads there, else `not-allowed` before anything is opened; a refused archiving afterwards is logged and the deletion's result stands; a channel the bot cannot see, Missing Access, is `not-allowed`): `deleted`, `gone` when it was deleted first (`markGone`; the post says so); without Manage Messages the report is opened again and the moderator told to delete it themselves, and a deletion that fails opens it again too (`failed`). In rehearsal mode the rehearsal's gateway deletes a member's message only in the post of a rehearsed party (else `not-allowed`, logged).
+- `reportDecisionControls` (kind `mreport`, `src/components/moderation-reports.ts`): staff alone (`requireManagement`, refused uncounted), `SAFETY_THROTTLE`. An action that ends a party asks first in a dialog (plan 8Q, `removalDialog` in `src/render/moderation.ts`): titled `Close this meetup`, `Refuse this place` or `Block the maker`, today's question as its text, and the required radio group `The post` with nothing picked, Archive post (`Keeps it readable and locked.`) or Delete post (`Removes it with everything written in it: …`); where the bot may not delete the post (`PartyService.mayDeletePost`) there is no choice, the text says the post will be archived and why (the forum named, `channelInDialog`), and the custom id carries `archive`. The report is read within `DIALOG_READ_MS` (`readInTime`, else the slow-read refusal) and one decided already is said at once without a dialog. Its Submit (`mreport:<id>:<action>[:archive]:~<token>`, the per-open token of `removalDialog` left out by `removalOf`; the button Archive post carries none, the same guards and throttle) is acknowledged privately and decided, the answer private; the post is redrawn for everybody as before. `ModerationReports.decide`: one conditional change of the report (`decideReport`, the first press wins; a later one is told who decided what; a question of an action pressed on a decided report says so at once), then its work with the party as it is now (its subject renewed): Refuse place… refuses the place for good with the report's post as the ruling's source (`MeetupSafety.refusePlace`), Block maker… blocks as Block member does (`MeetupSafety.blockMember`: the maker's name kept, one DM only for a new block, the maker's other meetups closed archived, this one left to the end, their pending requests withdrawn), then the party ends as `/delete` ends it (`PartyService.endAs` with "This meetup was closed by the moderators.", `removal`; the history records `cancelled`). Refuse place… on a meetup whose place is now a pin or none changes nothing (`no-place`, said so). Where a step of the work fails, the report is opened again (`reopenReport`: its buttons back) and `failed` tells the moderator what was done before it (a place refused, a maker blocked: they stay, and a second try finds them done) and whether the report is open again (if not, to close the party with `/delete`). `endAs` says how the post went: a deletion Discord refused archives it, which the report keeps as removal `denied` (`setRemoval`; the post says "archived: Discord refused to delete it") and the moderator is told ("archived: Discord refused to delete it; delete it yourself"); a deletion the network failed (`deleting`, plan 8X-H, review r1 C1) is archived for now and deleted by the hourly upkeep (`PartyService.redoClosings`, `parties-and-posts.md`): the report keeps `delete` (its post says "deleted") and the moderator is told `deletionPending` ("its post is archived for now: Discord did not answer when I tried to delete it. I will try again within the hour; if it is still there after that, delete it yourself", `DELETION_PENDING`); a party over between the press and the closing has its post deleted all the same when Delete post was chosen (`PartyService.deletePostOf`). Delete post where the bot lacks Manage Threads (`PartyGateway.mayDeletePost`, from the cache; by Submit, since the dialog offered it) is refused before anything changes (`may-not-delete`): the private answer says so with one button, Archive post (`mreport:<id>:<action>:archive`), which decides at once. The question's Delete post of before plan 8Q (`…:delete`) gets the router's stale answer. Delete message claims the report first (`decideReport` as `deleted`, so a Dismiss at the same moment wins or loses before anything is deleted), then deletes the message (`PartyGateway.deleteReported`: an archived post is opened for the deletion and archived again as it was, locked or not, also when the deletion fails, and only where the bot has Manage Threads there, else `not-allowed` before anything is opened; a refused archiving afterwards is logged and the deletion's result stands; a channel the bot cannot see, Missing Access, is `not-allowed`): `deleted`, `gone` when it was deleted first (`markGone`; the post says so); without Manage Messages the report is opened again and the moderator told to delete it themselves, and a deletion that fails opens it again too (`failed`). In rehearsal mode the rehearsal's gateway deletes a member's message only in the post of a rehearsed party (else `not-allowed`, logged).
 - A reported party that ends without a moderator (the clock, its maker, a move) ends its open report (`watch`: a listener of the store, the work on the side, `flush()` in tests): the post says it was over, without buttons. One that staff close with `/delete` ends so too, and then `closeControls` calls `closedByStaff(partyId, removal, by)`: it waits for that work, and the reports it ended (remembered by party) or still open are restated as closed by that moderator with how the post really went (`ReportStore.closeEnded`, conditional on `ended`; `denied` where Discord refused the deletion), so the post reads "Closed by …" and has no Go to post once the post is deleted.
 - In rehearsal mode the reports' posts go through meetup safety's gateway (`rehearsalModeratorsGateway`).
 
@@ -21,7 +21,7 @@ Members report a party or a single message to the moderators privately, the mode
 
 ## /delete
 
-- `/delete` is for staff (`default_member_permissions` Manage Messages, `requireManagement`, help category `admin`): it asks in a dialog whether to archive the post or delete it (plan 8Q, `removalDialog`, titled `Close this raid` / train / meetup; `pclose:<party id>:close:~<token>`, or `pclose:<party id>:close:archive:~<token>` without the choice where the bot may not delete the post (the per-open token of `removalDialog`, as for a report's dialogs, left out by `removalOf`), the forum named as in a report's dialog; the command declares no `defer`), and its Submit (`closeControls`, acknowledged privately; a deletion the bot may no longer make is refused there with today's words) ends the party as before, the post saying who closed it (`PartyService.end` with `removal`: `delete` deletes the post with everything in it in the place of its last showing and the archiving; a deletion Discord refuses archives it). The command has no throttle; its dialog's Submit has `CLOSE_THROTTLE` (twenty a minute) and takes no party of another server; the buttons of the question before plan 8Q (`pclose:<party id>:archive|delete`) get the router's stale answer. A deletion Discord refuses is said to the moderator as for a report. `/help` tells a member who asks for `/delete` to use `/report` (`TOLD_INSTEAD`, without saying that the command exists).
+- `/delete` is for staff (`default_member_permissions` Manage Messages, `requireManagement`, help category `admin`): it asks in a dialog whether to archive the post or delete it (plan 8Q, `removalDialog`, titled `Close this raid` / train / meetup; `pclose:<party id>:close:~<token>`, or `pclose:<party id>:close:archive:~<token>` without the choice where the bot may not delete the post (the per-open token of `removalDialog`, as for a report's dialogs, left out by `removalOf`), the forum named as in a report's dialog; the command declares no `defer`), and its Submit (`closeControls`, acknowledged privately; a deletion the bot may no longer make is refused there with today's words) ends the party as before, the post saying who closed it (`PartyService.end` with `removal`: `delete` deletes the post with everything in it in the place of its last showing and the archiving; a deletion Discord refuses archives it). The command has no throttle; its dialog's Submit has `CLOSE_THROTTLE` (twenty a minute) and takes no party of another server; the buttons of the question before plan 8Q (`pclose:<party id>:archive|delete`) get the router's stale answer. A deletion Discord refuses is said to the moderator as for a report; one the network failed is recorded as `delete` and said with `pendingDeletion` ("This raid is closed: its gym is free for a new report, and its post is archived for now: Discord did not answer …", a max battle's spot, a train's or meetup's "is closed, and its post is archived for now: …"; review r1 C1). `/help` tells a member who asks for `/delete` to use `/report` (`TOLD_INSTEAD`, without saying that the command exists).
 
 ## /places
 
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
index 3740cbf2878fd66fb29a08a384328d0eee2c3f14..4a55a3c5ca902e40afd9ac9a8b2dfc796bcaaf01 100644
--- a/docs/architecture/operations.md
+++ b/docs/architecture/operations.md
@@ -25,7 +25,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 - `lower_case_table_names=0` (Linux's default, set explicitly; it can only be set when the data directory is made): table names are case sensitive, the bot's are mixed case (`Guild`, `GymMeta`), and a dump of the stack loads unchanged into any server that keeps case (the test containers, another Linux host). A dump from MySQL on Windows has lower-case names; `./pine restore` renames them, and the migrator refuses such a database on a case-sensitive server before writing anything.
 - There is no profile for an external MySQL (spec 9.2's is dropped): an instance restores its dump into the stack instead.
 - `.env` is read by Compose for the values of `compose.yaml` and handed whole to the bot (`env_file`). Inside the stack the bot reaches MySQL as `mysql:3306` whatever `.env` says (`DB_HOST`, `DB_PORT` are set by the compose file); `DB_USER`, `DB_PASSWORD`, `DB_SCHEMA` also create the user and the database on MySQL's first start, `DB_ROOT_PASSWORD` is root's and is blanked for the bot. `pine-settings.json` is mounted read-only.
-- `pine` waits for a healthy `mysql`, runs under `init: true` (tini hands it SIGTERM and reaps the screen reader's process), restarts `unless-stopped`, and has `stop_grace_period: 2m30s`: the shutdown steps of `src/app.ts` have limits that add up to about two minutes (the queued DMs alone fifteen seconds; plan 8H added three seconds for the party history's last try of a record that failed). A new step there means checking that sum, and the watchdog's restart (`?t=150`).
+- `pine` waits for a healthy `mysql`, runs under `init: true` (tini hands it SIGTERM and reaps the screen reader's process), restarts `unless-stopped`, and has `stop_grace_period: 2m30s`: the shutdown steps of `src/app.ts` have limits that add up to 145 seconds with every optional step, within 150 s, with 5 s to spare (the queued DMs alone twelve seconds; plan 8H added three seconds for the party history's last try of a record that failed; plan 8X-H the catch-up's two, review r1 C4). A new step there means checking that sum, and the watchdog's restart (`?t=150`).
 - A new install is `./pine up` on empty volumes: the migrator's new-install path creates the schema.
 
 ## Health
@@ -34,6 +34,14 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 - `node dist/ops/health-cli.js` reads it and prints one line, its kind first (`healthLine`: `healthy`, `starting`, `stale`, `missing`, `unreadable`, `slow-start`, `gateway`, `database`), and exits 0 or 1 (`healthVerdict`, `src/ops/health.ts`): unhealthy when the file is missing or older than 90 seconds (a stuck or stopped bot), when the database did not answer the last check, when Discord has been away for more than two minutes after the login began, or when the start has taken more than half an hour. A start with a fresh heartbeat is healthy however long its migrations take. It is the healthcheck of `pine` (every 30 s, 3 retries, a start period of ten minutes) and a line of `./pine status`. In rehearsal mode the file has `rehearsal: true` and every line ends with "; REHEARSAL MODE IS ON" (the kind at its start is unchanged, so the watchdog reads it as before).
 - `Lifecycle` (`src/ops/lifecycle.ts`) holds the process's signals and unhandled errors from the first line of `src/index.ts` on. A SIGTERM or SIGINT during the start ends it after the step under way, never in the middle of the migrations (`startCheckpoint`, `src/ops/start-stop.ts`), cleanly: no crash marker is left; a repeat only logs that the step is still finishing (Docker's grace still bounds it). After the start a signal shuts down cleanly and a repeat exits at once. An uncaught exception or unhandled rejection during the start ends it with the owner's alert (`could not start`); after the start an exception ends the run after the shutdown, a rejection is logged.
 
+## The catch-up on reconnect
+
+- Plan 8X-H (Matt, 2026-10-23: catch up, not restart; the staging of 8X-G survived two outages, a DNS outage of two minutes and an hour without network, but what failed meanwhile waited for its next interval). Restarting on every reconnect would restart several times a day (Discord asks for routine reconnects), at the cost of a login, posts drawn anew and open dialogs failing; the watchdog's restart after a long outage stays as it is, and so do the heartbeat and the health rules (they say whether the bot is connected now). In production the watchdog restarts after about seven minutes without the gateway, so the catch-up covers outages of about 30 seconds to 7 minutes; on a laptop without the watchdog, any length.
+- **When** (`GatewayWatch`, `src/discord/gateway-events.ts`, attached in `configure` before the login): armed by the first ready (the login's own and earlier reconnections never count); the first `ShardReconnecting` while up marks the gateway away (discord.js says it with every try: the later ones change nothing, and none is logged); `ShardResume` or `ShardReady` brings it back. Back for real when it was away 30 seconds or more (`REAL_AWAY_MS`, counted from the shard's last heartbeat acknowledged where that is more than a minute older than the first reconnection, `MISSED_ACK_MS`: a zombie connection, which discord.js gives up some 82 seconds after the last acknowledgement, or a laptop asleep while connected, which reconnects only at wake; Discord asks for a heartbeat every 41.25 s, so at a routine reconnection the last acknowledgement is up to that old and does not count, review r0 B1), when a shard error came meanwhile (counted only while away: a shard error while connected is said but starts nothing, only a reconnection does, review r0 B8), or when it came back with a new session (`ShardReady`: the events of the time away are lost). Then `discord gateway back` at info (`awayMs`, `shardErrors`, `unsaid`, `newSession`); a routine resume is `discord gateway resumed` at debug. What discord.js 14.27 gives (the brief's review read `@discordjs/ws` 1.2.3): ECONNRESET, ECONNREFUSED, ETIMEDOUT and EAI_AGAIN give no shard error and come back with a fresh `ShardReady`; ENOTFOUND (Windows' DNS outage) gives a shard error every half second and comes back with `ShardResume` (or `ShardReady` after an invalid session). In Docker a DNS outage is EAI_AGAIN: no shard errors at all. One state for every shard: Pine runs one (`createClient` sets no `shards`, discord.js's `shardCount` of 1; Discord asks for more only beyond 2,500 servers), review r0 B9.
+- **Shard errors** are said once per kind (`code`, else the message): the first at warn with the error (`discord shard error`), then at most once a minute `discord shard errors repeated` with how many since and the message (`REPEAT_EVERY_MS`, checked as each arrives, no timer); those not said yet are counted in the line of the gateway back, and a kind is said anew when the next outage begins (also one seen while connected, review r1 C5). Before plan 8X-H each was an ERROR line (206 in two minutes, 819 in the hour). An ERROR line stays for what needs a person.
+- **What** (`CatchUp`, `src/services/catch-up.ts`, made in `app.ts` once the stops' posts are there): the jobs one after another, each once, in this order: every active post shown anew, paced (`redrawPosts`: it only queues them, one party every 250 ms, `EMOJI_RENDER_GAP_MS`, so the posts are drawn over N × 250 ms beside the upkeep and the feeds' reads, review r0 B10), the upkeep (`PartyScheduler.catchUp`: first the closings the network failed, `PartyService.redoClosings`, `parties-and-posts.md`, hourly as well, since a request can fail without the gateway going away, review r0 B4; then the sweep of ended parties' posts, the summaries, the access, the routes, the spawn and grunt sweeps, the application's emoji and the rest, after one under way; its steps never fail as a whole, so it runs on every catch-up), the pinned posts of the stops (`StopPostService.catchUp`: every kept post drawn, unchanged ones not edited; a turn-over at midnight that failed waited for the next change of period before), then the feeds, each only when its last read failed (`catchUp` of `BossFeedService` for the raid and max bosses, `RaidEventService`, `ResearchTaskService`, `RocketLineupService`, `GameDataService`: the read now through its in-flight guard, after one the timer started, and the next scheduled from it; they retry by themselves within 5 to 30 minutes). One catch-up at a time; a return of the gateway while one runs has one more after it, not one each; nothing loops while the network is down. `caught up` at info names what ran, failed again (`could not catch up` at warn for one that threw) and was not owed. At shutdown (review r0 B6) the party clock's step (6 s) closes it, so that it starts no job more, without waiting for the job under way, and waits for the clock and its upkeep, which starts no step more once the clock has stopped (review r1 C3) and whose closings end between parties as the history's sweep does; a feed's read under way (up to 30 s) ends at that feed's own `stop` step, a drawing of the stops' pinned posts at `posts of the stops`; the step `catch-up` (2 s) after that one waits for the job left (`CatchUp.whenIdle`). The steps' limits stay within the stop's 2m30s (`stop_grace_period`), with 5 s to spare: the party clock's step went from 10 s to 6 s and the direct messages' from 15 s to 12 s (review r1 C4). Not caught up: the events' pages with spawns (read within the hour while an event is on), direct messages that failed meanwhile (`DmSender` drops a failed send, as always: a DM is worth its moment), the lines said in posts and the pings of a movement or a start that failed, interactions (Discord's, lost).
+- **Logging of an outage:** a failure for the network (`isNetworkError`, `src/services/network-error.ts`: the codes of a lost network and the time limits, also the abort with which @discordjs/rest ends a request after 15 s, `AbortError` or undici's `UND_ERR_ABORTED`, on the error or any cause, and Discord's 5xx, an `HTTPError` of 500 or more, review r0 A1; never a mysql2 error, though its code be a socket's: the database away needs a person, review r0 A2) is a warning in the boss syncs (a feed out of reach or timed out; one it cannot read stays an error), the game data refresh (a download without an answer), and the updates of a post or a summary; the sweep says its failures once per sweep. Debug lines say that a boss feed read changed nothing (`raid bosses read, unchanged`, with how many), that the sweep ran (`swept the posts of ended parties`, archived, the forums looked through and those that failed, review r0 A4; the warning of a failed sweep names the first forum that failed besides the count, A3) and that the application's emoji were read (`read the emoji of the application`, how many), so that a catch-up can be followed at debug.
+
 ## Alerts to the owner
 
 - `OwnerAlerts` (`src/ops/owner-alerts.ts`) DMs `OWNER_ID` through Discord's REST API with the bot's token: opens the DM channel, posts plain text with no mentions; times as `<t:…:f>`, so Discord shows them in the reader's zone. Not through `DmSender`: it works without the gateway and from an exit path. `send(kind, text)` never throws, gives up after five seconds (one try), logs a failure, and sends one alert of a kind per fifteen minutes; the stamp is taken before the alert goes (a second one meanwhile is held back) and given back when it fails. The bot keeps the stamps in `var/health/alerts.json` (`FileStamps`) so that a crash loop does not spam; the watchdog in the `ops` volume. `ownerAlertsFrom(env)` needs only `DISCORD_TOKEN` and `OWNER_ID`, so it works before the config is read.
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 544ca6354702dc6c0dca3a599cf35f81db79b35c..7ea0e7a71db14d6ca70c78cd3d1607572e8b2c56 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -64,8 +64,8 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 
 - Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Where the bot may not make posts (plan 8S-3, staging of 8S-2: without Manage Threads, "Manage Posts" in a forum's settings, Discord refused a post with the forum's moderated tag as Missing Access; archiving, locking, pins and tags need it too, so a post without its tag would still break at its end), `DiscordPartyGateway.createPost` refuses before asking Discord, from the cache, where the bot lacks what the post needs there (`postNeeds`, `src/domain/party/post-permissions.ts`, names only, which the render reads without discord.js: View Channel, Create Posts, and Manage Posts only for a post with a moderated tag, as the forum lists its tags (Pine makes its tags moderated), so that a region's summary, which has none, is made without it as before and only its pin warns; not Send Messages in Posts, which Discord does not ask to start a post, though the bot needs it to write in its posts later and `cutover-check` asks it of every forum), and takes Missing Access as the same refusal (`PostsRefusedError`, with what it lacks; none known for Discord's answer); `PartyService` keeps nothing, answers `no-post` with `refused` (`NoPost`; raids, meetups, trains, moves, splits) and logs a warning once per forum while it runs, and the member is told `noPostWords` ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me."; a move, `posts-refused` with `refused`, `postsRefusedMoveWords`; an approved meetup, `postsRefusedFailure`; `/admin setup-forums` for the summary, `summaryRefusedWords`, and for a summary made but not pinned "posted the list of active raids (I could not pin it: give me Manage Posts there)", or "…; see the log)" for another failure: `ForumSetup.unpinned`). Every `no-post`, refused or a post lost while it was made, is none of the member's doing and leaves the use uncounted (`UserError` `givesBack`: `/meetup`, `/train`, `/raid` and its menu, the map's meetups, trains and raids, a screenshot's image: `screenshots.md`; the Submit of a split's dialog (Split… and `/group split`), said in its private answer, and the Submit of the dialog of `/location`, said in its private answer, both `said`); `/raid` says it in its own answer, in place of its menu or with the screenshot's feedback button (`said`). Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
-- A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else.
-- `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Going on now` (`SUMMARY_TITLE`; plan 8X-G, Matt 2026-10-22: every kind of party, `Active raids` before; `NOTHING_GOING` "Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.") with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the max battles under **Max battles** (plan 8X-3: those whose end has not come, 5 stars down to 1, Gigantamax last, the soonest end first in each), then the trains, then **Passing through** (plan 8X-G, review R9: the trains of other regions of the server with a stop in this region, as their copies go, `stopRegionsInGuild`; each linked to its copy in this region's channel, a message link by the server's snowflake, `guilds.snowflakeOf`, read once, else to its post; counted in the head as `N trains passing through`; a train's change, and its end, ask for every summary of its server, an unchanged one not edited, and a copy recorded for its region's, `PartyMirrorsOptions.copied`), then the meetups, one text display per tier and section, and last, after a line, the region's pinned post of the stops today with its counts (`[Today at the stops](<link>): 6 tasks · 2 hideouts`, `StopsLine`, from `StopPostService.summaryOf` set with `setStopPosts`; nothing where nothing is reported, none in rehearsal mode; `stop-reports.md`), all within `TEXT_BUDGET` (`SECTION_ROOM` for the max battles, the trains, the trains passing through and the meetups each, a heading and a count line for every tier, "…and N more", the stops' line kept from the start). A train counts as passing through a region while it will still reach a stop there (`stopsStillReached`, review r0 C4, Matt 2026-10-22): one that finishes the stops from its current one on, one that loops or turns back every stop (a turn-back keeps its mode and comes back), a finished route none. The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. Where the record of a region's summary is gone or empty, a `Going on now` post the bot made in the forum, or one it made as `Active raids` before plan 8X-G (`LEGACY_SUMMARY_TITLE`; renamed with its next edit, `renameSummary`, by Discord's rename limit; the text is recorded as sent, so a request with the same text edits nothing while the rename waits, and the wait is a timer of its own that renames and edits nothing, `renameSummaryLater`, review r1 R1-6; a refused permission is warned of once per region until a rename works again, the next change of the text trying it again, and any other failure is tried again after the rename window, review r0 C1, r1 R1-5), is recorded and edited instead of making a second one, which Discord would not pin beside it (30047: one pinned post per forum; `takeOverSummary`, staging of 2026-10-16): the pinned one, else the oldest open one, pinned with its next edit (`openPosts` lists open posts only: an archived one is not found). A forum that changed meanwhile gets no post; a failed look makes a new post, with a warning. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
+- A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else; a forum it cannot look through for a refusal of Discord's is warned of by name, the other failures (the network away) once per sweep with how many forums (plan 8X-H), and each sweep says at debug what it archived. A closing of which a part failed for the network or a rate limit (the link line, a copy, its last showing, a leftover's deletion, the last words, the tags, the archiving, a moderator's deletion; `worthRedoing`, review r0 B2, B5: a refusal of Discord's such as Missing Access would fail again and is not kept, and a post that is gone drops it whatever else failed) is kept in memory (`undoneClosings`, a `BoundedMap` of `UNDONE_CLOSINGS_MAX`, the party as it ended, its last words and whether they were said, `delete` where a moderator chose to delete the post and the deletion failed for the network, review r0 B3: meanwhile it is closed and archived as usual, `endAs` says `deleting` (review r1 C1: the moderator is told that it is archived for now and will be deleted within the hour, and the report keeps `delete`), and the redo deletes it; Discord refusing the deletion leaves it archived and `archived`, as before; a post that is gone is `archived`) and done again by `redoClosings()`, the first step of the hourly upkeep and so of the catch-up on reconnect (plan 8X-H, Matt 2026-10-23: such a post kept its live controls, and the sweep only archives; review r0 B4), for a day after the party ended (`UNDONE_CLOSING_KEPT_MS`: no post opened and archived again days later), ending between parties with the clock's stop and with the first closing that fails again (one probe a run while the network is away: a request that is black-holed takes about a minute, review r1 C2); it logs `closed ended parties again` with how many were redone and failed again. A restart forgets them, and the sweep archives what is left open as before. Accepted risk (review r0 B12): last words that Discord received but whose answer the network lost are said again by the redo, so they may stand twice in the post. `redrawPosts()` shows every active post anew as `emojiChanged` does, paced (it only queues them, one party every `EMOJI_RENDER_GAP_MS`, so N posts take N × 250 ms, beside the upkeep and the feeds, review r0 B10): an edit that failed leaves its post stale until something shows it anew (`showPost` forgot what it sent before trying), and a current post makes no edit. The updates of a post or a summary that failed for the network are warnings (`isNetworkError`, `src/services/network-error.ts`), errors otherwise (operations.md, "The catch-up on reconnect").
+- `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Going on now` (`SUMMARY_TITLE`; plan 8X-G, Matt 2026-10-22: every kind of party, `Active raids` before; `NOTHING_GOING` "Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.") with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the max battles under **Max battles** (plan 8X-3: those whose end has not come, 5 stars down to 1, Gigantamax last, the soonest end first in each), then the trains, then **Passing through** (plan 8X-G, review R9: the trains of other regions of the server with a stop in this region, as their copies go, `stopRegionsInGuild`; each linked to its copy in this region's channel, a message link by the server's snowflake, `guilds.snowflakeOf`, read once, else to its post; counted in the head as `N trains passing through`; a train's change, and its end, ask for every summary of its server, an unchanged one not edited, and a copy recorded for its region's, `PartyMirrorsOptions.copied`), then the meetups (a timed party's start or end more than a day ahead as Discord's date and time, `<t:…:f>`, which each reader's client shows in their own time zone with daylight saving; within a day the relative stamp, which Discord rounds, "in 4 days" for 3 days and 15 hours: plan 8X-H, Matt 2026-10-23; the switch comes with the next draw, at the latest the hourly upkeep), one text display per tier and section, and last, after a line, the region's pinned post of the stops today with its counts (`[Today at the stops](<link>): 6 tasks · 2 hideouts`, `StopsLine`, from `StopPostService.summaryOf` set with `setStopPosts`; nothing where nothing is reported, none in rehearsal mode; `stop-reports.md`), all within `TEXT_BUDGET` (`SECTION_ROOM` for the max battles, the trains, the trains passing through and the meetups each, a heading and a count line for every tier, "…and N more", the stops' line kept from the start). A train counts as passing through a region while it will still reach a stop there (`stopsStillReached`, review r0 C4, Matt 2026-10-22): one that finishes the stops from its current one on, one that loops or turns back every stop (a turn-back keeps its mode and comes back), a finished route none. The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. Where the record of a region's summary is gone or empty, a `Going on now` post the bot made in the forum, or one it made as `Active raids` before plan 8X-G (`LEGACY_SUMMARY_TITLE`; renamed with its next edit, `renameSummary`, by Discord's rename limit; the text is recorded as sent, so a request with the same text edits nothing while the rename waits, and the wait is a timer of its own that renames and edits nothing, `renameSummaryLater`, review r1 R1-6; a refused permission is warned of once per region until a rename works again, the next change of the text trying it again, and any other failure is tried again after the rename window, review r0 C1, r1 R1-5), is recorded and edited instead of making a second one, which Discord would not pin beside it (30047: one pinned post per forum; `takeOverSummary`, staging of 2026-10-16): the pinned one, else the oldest open one, pinned with its next edit (`openPosts` lists open posts only: an archived one is not found). A forum that changed meanwhile gets no post; a failed look makes a new post, with a warning. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
 - Staff for raid moderation are admins, moderators and the owner (`isStaff`, `requireManagement`, `managementRoleIds` in `guards.ts`): `/delete` and `/admin save-party` are theirs; the rest of `/admin` also admits bot developers (`requireBotManagement`). `/delete` (Manage Messages since plan 8S-2; it asks in a dialog whether to archive the post or delete it, plan 8Q, `moderation.md`) has no throttle: it is the staff's manual clean-up and must always work; the post of a raid it closed says so in the place of the times (`RaidPostView.closed`). `/admin save-party` outside a post lists the kept posts. `/shout` is for members who are signed up.
 - The forum of a region holds its raids, max battles, trains and meetups and is named `<region channel>` + `settings.regionForumSuffix` (default `-meetups`). `/admin setup-forums` creates it, renames one whose name is the region's with another one-word ending (a name chosen by hand stays), and leaves the making of posts to the bot (`PartyGateway.reservePosts`: Send Messages denied to everyone and to every role the forum allows it, allowed to the bot; writing in posts is untouched). In rehearsal mode it makes forums only for the rehearsed regions, a new one hidden from its first moment (`createForum(…, hidden)`) and one that is there hidden before anything is posted in it (`PartyGateway.hideForum`, `hiddenForumOverwrites`); a forum that cannot be hidden gets nothing posted (`operations.md`, "Rehearsal mode").
 - `RegionRepository.setForum` gives a region its forum (one forum per region, enforced by a unique key); `setSummaryMessage` names the forum the summary post was made in.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 63e6f223791070016688534bd8f38fd7ec36ad02..916eef37c0fda6c6fe0262457be783a7a0357cac 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -6,7 +6,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 - Tests are colocated: `*.test.ts` (unit, no Docker) and `*.db.test.ts` (needs Docker). Test against real MySQL and real pino loggers (`test/support/`) rather than mocks. A run of the database suite starts one MySQL container (`test/support/mysql-global-setup.ts`); `startDatabase()` (`test/support/mysql.ts`) gives each caller a database and a user of its own in it and drops both at `stop()`. The user also has `PROCESS`, to see the server's transactions: a test that has a statement wait for a lock asserts the wait (`information_schema.innodb_trx`, joined to `processlist` on its own user, since the server is shared): `lockWaits(db, holder)` (`test/support/lock-waits.ts`) asks until a transaction other than the holder's (`connectionId(trx)`) waits, every 150 ms (InnoDB fills the table anew only once it has not been read for 0.1 seconds), with a deadline of ten seconds.
 - A database test that a statement draws no warning of MySQL (a deprecated syntax, `DEPRECATED_SYNTAX` 1287) runs it through `lastWarnings(db, work)` (`test/support/mysql-warnings.ts`): `work` in a transaction of its own on one connection, then `show warnings`, which follows its last statement rather than the commit's (plan 8W-3).
-- Tests never use the network. Game data in tests comes from the fixtures built by `scripts/game-data/make-fixtures.ts` (`catalogueFixture()`, `gameDataFixture()`); raid bosses come from `test/support/raid-bosses.ts` (`readRaidBossFeed()`, `raidBossesFixture()`, and `MemoryRaidBossStore` for the service, a `MemoryBossStore` of the raid family). Max bosses (plan 8X-2): the recorded Pokebattler feed `readPokebattlerFeed()`, a feed of its shape `pokebattlerFeed(tiers)`, `MAX_FEED_READ_AT`, `MAX_ZONE` and `at(local)` (`test/support/max-bosses.ts`), the recorded max events `readMaxEventFeed()` (`test/support/max-events.ts`), and `maxBossServiceWith()` (`test/support/max-boss-service.ts`: a real `MaxBossService` over `MemoryMaxBossStore`, nothing stored yet, `restarted()` for a restart); `bossCommandsWith({ max: true })` turns max battles on for `/admin boss`, its override ids counted with the raid bosses' as in the one table (`ids`). Pokebattler in tests is `FakePokebattler` (`test/support/pokebattler.ts`: `asked`, `answer`, `known`, `failing`; for max battle teams, plan 8X-6, `maxAsked` and `maxAnswer`, by default the recorded Uxie team of two attackers and a charger, the default role's); the recorded max team answers of 2026-10-21 are `recordedMaxTeam(name)` (the JSON as Pokebattler gave it, `test/fixtures/pokebattler-max-teams.json`) and `recordedTeam(name)` (read by `readMaxTeam`).
+- Tests never use the network. Game data in tests comes from the fixtures built by `scripts/game-data/make-fixtures.ts` (`catalogueFixture()`, `gameDataFixture()`); raid bosses come from `test/support/raid-bosses.ts` (`readRaidBossFeed()`, `raidBossesFixture()`, and `MemoryRaidBossStore` for the service, a `MemoryBossStore` of the raid family). Max bosses (plan 8X-2): the recorded Pokebattler feed `readPokebattlerFeed()`, a feed of its shape `pokebattlerFeed(tiers)`, `MAX_FEED_READ_AT`, `MAX_ZONE` and `at(local)` (`test/support/max-bosses.ts`), the recorded max events `readMaxEventFeed()` (`test/support/max-events.ts`), and `maxBossServiceWith()` (`test/support/max-boss-service.ts`: a real `MaxBossService` over `MemoryMaxBossStore`, nothing stored yet, `restarted()` for a restart); `bossCommandsWith({ max: true })` turns max battles on for `/admin boss`, its override ids counted with the raid bosses' as in the one table (`ids`). Pokebattler in tests is `FakePokebattler` (`test/support/pokebattler.ts`: `asked`, `answer`, `known`, `failing`; `answerSimulating(movesets)` an answer that simulates those boss movesets in that order, plan 8X-H; for max battle teams, plan 8X-6, `maxAsked` and `maxAnswer`, by default the recorded Uxie team of two attackers and a charger, the default role's); the recorded max team answers of 2026-10-21 are `recordedMaxTeam(name)` (the JSON as Pokebattler gave it, `test/fixtures/pokebattler-max-teams.json`) and `recordedTeam(name)` (read by `readMaxTeam`).
 - Gyms and regions in tests are the invented ones of `test/support/gyms.ts` (never production rows); `createTestContext()` provides `ctx.gyms`, `ctx.pokemon` and `ctx.maps` from `test/support/providers.ts`.
 
 ## How the suites run
@@ -86,4 +86,6 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Operations
 
+- The catch-up on reconnect (plan 8X-H, `operations.md`): `GatewayWatch` is tested over an `EventEmitter` in place of the client (`Events.ShardReady`, `ShardReconnecting`, `ShardResume`, `ShardError` emitted by the test) with a clock the test moves and the shard's last heartbeat given (`lastAck`); `CatchUp` with jobs of the test's own, one held with a `heldCall` to see that the next waits; each service's `catchUp` in its own test file (a failed read, then the catch-up reads at once, then `not-owed`, and the next read a refresh's interval on by fake timers); a network failure as undici gives it is `new TypeError('fetch failed', { cause })` with a `code` on the cause (`network-error.test.ts`); for the fake gateway, `networkAway()` of `test/support/fake-gateway.ts` (`gateway.failing.set('deletePost', networkAway())`) beside `missingPermissions(method)`, Discord's refusal.
+
 - The owner's alerts are tested through `FakeAlertRest` (`test/support/fake-rest.ts`: Discord's REST API as `OwnerAlerts` uses it, recording each request and refusing an empty or too long message; `failWith` an error or `'hang'`), the watchdog against `FakeDockerApi` (`test/support/fake-docker.ts`: containers by Compose labels, `composeLabels(project, service)`, restarts recorded). The Docker Engine fake of `docker-api.test.ts` answers on a local socket (a named pipe on Windows); its slow restart and its stuck question are timed by fake timers once the request arrived (`Tally`). Health, crash marker and backup status tests write their files into a `mkdtemp` folder; `runBackupScript` (`test/support/backup-script.ts`) runs shell lines in one `sh` with `docker/backup.sh` sourced as a library (`BACKUP_SH_LIBRARY`; `BACKUP_OUT_DIR`, `BACKUP_OPS_DIR`, `BACKUP_LOCK` move its folders) and gives `undefined` where there is no `sh` (the test skips); these files are `*.sh.test.ts`, the vitest project `shell` (part of `npm run test:unit`, a minute per test, since spawning a shell takes seconds on a busy machine): `backup-status.sh.test.ts` reads what `write_status` wrote, `backup-script.sh.test.ts` the lock, the deletion of old dumps and half-written ones, and backups off. `Lifecycle` is tested over an `EventEmitter` in place of the process. The cutover tools read Discord through `FakeDiscordApi` (`test/support/fake-discord-api.ts`): the application, its emoji (`emoji`) and its global commands (`globalCommands`, by name), the bot's servers with their roles, members and channels (`addGuild`, `addRole`, `addChannel`, `overwrite`; `BOT_PERMISSIONS` is everything the bot asks for), the oldest message of a channel (`after=0&limit=1` only; a message is its author, or `{ author, content }`; `unreadable` answers Missing Access), channels deleted (`deleted`, a second delete is Unknown Channel); every request is recorded, `onlyRead()` says whether all were GETs, `failWith` fails them all and `refused` fails one route. `createTestContext`'s `legacyCleanup` throws when used: a test of `/admin cleanup-legacy` passes a `LegacyCleanup` over a `FakeDiscordApi` (`addGuild` and `addChannel` take the fakes' own ids, `FAKE_GUILD_ID`, `WEST_CHANNEL`) with `pauseMs: 0`. A legacy installation's settings for the converter are `test/fixtures/legacy-install/` (made-up secrets). The rest of the scripts of the stack (`pine`, `docker/backup.sh`) is checked with `shellcheck -s sh` and a scratch stack (`operations.md`).
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 5b7d741879d0889bfe35bf7d56fe68e8f0bbfbff..c6b738f4f6cd6e2d5937ff6ab42de5071a88d3f6 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -21,7 +21,7 @@ The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax
 
 - `renderTrainPost` (`src/render/train-post.ts`) builds on `party-post.ts` and `timed-post.ts` (`describeTimes`, shared with the meetup); a gym in a list is `stopLink` (masked link, brackets escaped). The archive warning of a timed party without an end time pings `warningAddressee(party)` (a train's conductor, otherwise the maker).
 - A train's post (plan 8D; Matt, 2026-10-17) has its boss's facts in its heading block and says where the train is under `**Where · stop 2 of 7**`: its current stop as a raid's gym (`gymWhere`: the gym, its address and Map, its notice, its picture beside them); `**Where**` and `Route complete` once the route is finished; `**Where**` and ``No route yet: `/route add` adds a stop.`` without a route. Under it a line of small print says what lies ahead: `routeAhead` (`train.ts`, pure, beside `nextStop` and `turnAhead`; `RouteAhead`) gives it and `aheadLine` words it, the names plain and cut alike through `fit.part`: a route of `WHOLE_ROUTE_STOPS` (3) or fewer whole, the current stop in bold, with the mode (`Route: 1. A · **2. B** · 3. C, loops`; finished, nobody in bold and no mode: it goes nowhere any more); on a longer one the next two stops in the order the train travels and how many more (`Next: 3. C · 4. D, and 3 more to the end`; `…, the last stop` when they reach it, `This is the last stop.` at it; a loop looks past the end, `Next: 7. G · 1. A (round again), and 4 more round the loop`, the count the stops other than the current one not shown; a turn-back train counts the stops before it turns, `…, and 3 more to the end, where it turns back`, says `…, where it turns back` when the two reach the last stop, at the last stop `Next: 6. F (turning back) · 5. E, and 4 more back to the start`, and one stop before it `Next: 7. G, then back here, and 5 more back to the start`, Matt's wording, since the second next stop is the current one), numbered as the route is stored now; nothing on a long route that is finished. Its buttons are in the third row of the post's controls (plan 8X-1B: the rows of a raid, `parties-and-posts.md`; row 1 Interested, Join, Here, Leave, row 2 −1, +1, Remote, row 3 the train's own after Group…, `bottomControls`'s `opens`). Plan 8X-G (Matt, 2026-10-22): **Group… · Move… · Manage… · Split… · Route**, short words and no emoji (on a train Group… has none either), five buttons in one row: "Move…" (`party:<id>:move`, `moveTrainButton`, `moves: true`; only while the train has a route; the action of "Manage train…" before, so the button of a post not drawn anew opens Move…, or Manage… on a train without a route), "Manage…" (`party:<id>:manage`, `manageTrainButton`, `moves: true`), "Split…" (below) and, on a route longer than `WHOLE_ROUTE_STOPS`, "Route" (`party:<id>:route`, `wholeRouteButton`, an action of the party controls: their guards and `ACTION_THROTTLE`; it only shows, so it has no `…`), which answers privately with exactly what `/route show` answers (`showWholeRoute`, `routeTexts`, `src/commands/trains/route.ts`: every stop a maps link, in as many messages as it takes), to anybody, also on a copy; a train that ended answers "This train is over.", a route emptied since what `/route show` says then.
-- Move… and Manage… are dialogs (plan 8X-G, the design talk of 2026-10-22: a post control that needs more input opens a dialog; `src/render/train-dialogs.ts`, handlers `openMove`, `submitMove`, `openManage`, `submitManage` in `src/commands/trains/move.ts`), for who may move the train and for staff, both alike (`mayNotMove`, refused privately before the dialog opens), each the first answer of its press, with the per-open token (`openToken`), and each Submit deferred privately at once and decided again. **Move…** (`moveDialog`): where the train is as text without links (`trainStateText`: `At stop 2 of 4: **X**` / `Next is **Y**`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`; of a finished route where Previous leads), then one radio choice "Where to" (the title says the act; the controller's call, review r0) of the moves that can be made from here (`offeredMoves`; a move `cannotMove` refuses is left out, not switched off; Finish is in Manage…): `Next: <stop>` picked and first (at the last stop `Next: finish the route`, `Next: round to <first>`, `Next: turn back to <stop>`), `Previous: <stop>` (of a finished route `Previous: back to stop N, <stop>`, which takes a mistaken Finish back), `Skip <next stop>, go to <stop after>`. A choice's value is `<move>:<target>` (`targetOf`), its label from `stopLabel` with no markdown, a name cut to fit Discord's 100 (each of Skip's two to 40) and given whole in the description where it was cut. With one move left (a finished route; stop 1 of a route of two that finishes) there is no choice (a radio group takes two to ten, review R1): the text says what Submit does (`Submit takes it back to stop 2, **X**.`) and the custom id carries the move. The custom id, `party:<id>:moveform:<place>[:<move>:<target>]:~<token>`, carries where the train was (`placeOf`, by `stopHandle`). Submit runs `moveTrainAs` with `from` and `target`, so the store decides: two Submits of Next drawn at one stop move it once, and a dialog drawn before somebody else moved the train, or changed its route, answers `The train has moved on since you opened this: ` and where it is now (`train-moved-on`, `route-changed`); otherwise the answer is `/next`'s (`whereText`, "I am telling the others."). Closing the dialog moves nothing. **Manage…** (`manageDialog`): where the train is (of a finished route only `The train has finished its route of N stops.`: where Previous leads is Move…'s; review r0 B3), then "The route", a radio choice (Keep it as it is, picked and first; Reverse it where `cannotReverse` allows, on a finished route with the description `Starts the route again from its last stop, <stop>, the other way round` (the name cut to fit); Finish it here while the route is not finished; left out where only Keep is left), and the menus "At the end of the route" (`AT_END_MENU_LABELS`, their emoji, `AT_END_DESCRIPTIONS`) and "What the train is mainly for" (`TRAIN_KIND_QUESTION`, below), each with the train's own picked (menus, review R7: Android picks a radio group's first choice whatever is marked); a train without a route is asked its kind alone (`NO_ROUTE_YET`). Its custom id `party:<id>:manageform:<place>:<first>:<mode>:<kind>:~<token>` carries where the train was, the stop the route began with (`NO_FIRST`, `-`, without a route) and the mode and the kind it showed, a letter each (`AT_END_CODES`, `KIND_CODES`): Submit applies only what was picked otherwise than shown (review R5: a dialog opened before somebody set the mode does not set it back), and answers `Nothing changed.` where nothing was; a refused Submit of several parts adds `Nothing was changed.` (review r0 B2). What it applies is one change, `TrainService.manage(partyId, member, staff, { kind?, route?: 'reverse' | 'finish', atEnd? }, { from, first })` (review R6): the kind (`setTrainKind`, which asks nothing of where the train is), then the route (`reverseRoute` with `from` and `first`, or Finish, `moveTrain('finish', from)`, announced as a move is, `movedFrom`), then the mode (`setAtEnd`, which asks nothing of where the train is unless the route changed in the same Submit, then where that change left it: review r0 B1, so a kind and a mode picked in a dialog drawn before somebody moved the train are applied), in one store change: one write, one line in the post (the parts' lines in that order), the route judged before the mode (Reverse refused on a turn-back route whatever mode comes with it), a refusal of any part refusing all, each part for whom it was before (the mode `mayArrange` and staff). Its answer says what it did in the words of the commands and the map (`trainKindSentence`, `The route is reversed.`, `The route is finished.`, `atEndSentence`, then `whereText` after a change of the route); a change of the route from a dialog drawn where the train no longer is answers as Move…'s. Both dialogs count as presses of the post (`ACTION_THROTTLE`). The Manage train panel of plans 3C to 8X-4 (`trainPanel`, its moves, Reverse and two menus, `OLD_PANEL`) is gone (review R16): its controls (`next`, `previous`, `skip`, `finish`, `reverse`, `atend`, `kind`, still `PARTY_ACTIONS`) answer `STALE_COMPONENT`, so a panel still open in a client changes nothing. `whereText`, `movementText` and the menus' words are in `src/render/train-words.ts`. The DM brief of a train is unchanged (`placeLine`).
+- Move… and Manage… are dialogs (plan 8X-G, the design talk of 2026-10-22: a post control that needs more input opens a dialog; `src/render/train-dialogs.ts`, handlers `openMove`, `submitMove`, `openManage`, `submitManage` in `src/commands/trains/move.ts`), for who may move the train and for staff, both alike (`mayNotMove`, refused privately before the dialog opens), each the first answer of its press, with the per-open token (`openToken`), and each Submit deferred privately at once and decided again. **Move…** (`moveDialog`): where the train is as text without links (`trainStateText`: `At stop 2 of 4: **X**` / `Next is **Y**`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`; of a finished route only `The train has finished its route of N stops.`, plan 8X-H: where Submit takes it is said once, after it, without naming Previous, which the dialog does not have), then one radio choice "Where to" (the title says the act; the controller's call, review r0) of the moves that can be made from here (`offeredMoves`; a move `cannotMove` refuses is left out, not switched off; Finish is in Manage…): `Next: <stop>` picked and first (at the last stop `Next: finish the route`, `Next: round to <first>`, `Next: turn back to <stop>`), `Previous: <stop>` (of a finished route `Previous: back to stop N, <stop>`, which takes a mistaken Finish back; at the last stop of a turn-back route, where Next turns back to the very stop Previous goes to, `Previous: back to <stop> (undo)` with the description `Back one stop, still heading for the end: undoes a Next made by mistake`, `UNDO_DESCRIPTION`: plan 8X-H, Matt 2026-10-23, Next reverses the route and Previous keeps its direction; left out only where it is the very move Next is, the same route in the same order and the same stop, a loop of two stops, `previousIsNext`), `Skip <next stop>, go to <stop after>`. A choice's value is `<move>:<target>` (`targetOf`), its label from `stopLabel` with no markdown, a name cut to fit Discord's 100 (each of Skip's two to 40) and given whole in the description where it was cut. With one move left (a finished route; stop 1 of a route of two that finishes) there is no choice (a radio group takes two to ten, review R1): the text says what Submit does (`Submit takes it back to stop 2, **X**.`) and the custom id carries the move. The custom id, `party:<id>:moveform:<place>[:<move>:<target>]:~<token>`, carries where the train was (`placeOf`, by `stopHandle`). Submit runs `moveTrainAs` with `from` and `target`, so the store decides: two Submits of Next drawn at one stop move it once, and a dialog drawn before somebody else moved the train, or changed its route, answers `The train has moved on since you opened this: ` and where it is now (`train-moved-on`, `route-changed`); otherwise the answer is `/next`'s (`whereText`, "I am telling the others."; of a finished route `whereText` names what takes it back as the member has it there, `TrainSurface`, plan 8X-H: `` `/previous` takes it back to stop 4: … `` for a typed command, `Move… takes it back …` for the post's dialogs, Move…'s and Manage…'s Submits, `Previous takes it back …` for the map's panel, which has a Previous button). Closing the dialog moves nothing. **Manage…** (`manageDialog`): where the train is (of a finished route only `The train has finished its route of N stops.`: where Previous leads is Move…'s; review r0 B3), then "The route", a radio choice (Keep it as it is, picked and first; Reverse it where `cannotReverse` allows, on a finished route with the description `Starts the route again from its last stop, <stop>, the other way round` (the name cut to fit); Finish it here while the route is not finished; left out where only Keep is left), and the menus "At the end of the route" (`AT_END_MENU_LABELS`, their emoji, `AT_END_DESCRIPTIONS`) and "What the train is mainly for" (`TRAIN_KIND_QUESTION`, below), each with the train's own picked (menus, review R7: Android picks a radio group's first choice whatever is marked); a train without a route is asked its kind alone (`NO_ROUTE_YET`). Its custom id `party:<id>:manageform:<place>:<first>:<mode>:<kind>:~<token>` carries where the train was, the stop the route began with (`NO_FIRST`, `-`, without a route) and the mode and the kind it showed, a letter each (`AT_END_CODES`, `KIND_CODES`): Submit applies only what was picked otherwise than shown (review R5: a dialog opened before somebody set the mode does not set it back), and answers `Nothing changed.` where nothing was; a refused Submit of several parts adds `Nothing was changed.` (review r0 B2). What it applies is one change, `TrainService.manage(partyId, member, staff, { kind?, route?: 'reverse' | 'finish', atEnd? }, { from, first })` (review R6): the kind (`setTrainKind`, which asks nothing of where the train is), then the route (`reverseRoute` with `from` and `first`, or Finish, `moveTrain('finish', from)`, announced as a move is, `movedFrom`), then the mode (`setAtEnd`, which asks nothing of where the train is unless the route changed in the same Submit, then where that change left it: review r0 B1, so a kind and a mode picked in a dialog drawn before somebody moved the train are applied), in one store change: one write, one line in the post (the parts' lines in that order), the route judged before the mode (Reverse refused on a turn-back route whatever mode comes with it), a refusal of any part refusing all, each part for whom it was before (the mode `mayArrange` and staff). Its answer says what it did in the words of the commands and the map (`trainKindSentence`, `The route is reversed.`, `The route is finished.`, `atEndSentence`, then `whereText` after a change of the route); a change of the route from a dialog drawn where the train no longer is answers as Move…'s. Both dialogs count as presses of the post (`ACTION_THROTTLE`). The Manage train panel of plans 3C to 8X-4 (`trainPanel`, its moves, Reverse and two menus, `OLD_PANEL`) is gone (review R16): its controls (`next`, `previous`, `skip`, `finish`, `reverse`, `atend`, `kind`, still `PARTY_ACTIONS`) answer `STALE_COMPONENT`, so a panel still open in a client changes nothing. `whereText`, `movementText` and the menus' words are in `src/render/train-words.ts`. The DM brief of a train is unchanged (`placeLine`).
 
 - On the live map the Manage train panel stays (plan 8X-G changed only the post; the map's panel waits for its UX pass): it opens in the train's popup in place of its actions ("Manage…") and stays open after each move, as the post's does (`web.md`, "Trains on the map"); the popup keeps the click that drew the panel (`keepClicksInPopup`: before plan 8S-3 Leaflet took it for a click on the map, the Manage… button being out of the page by then, and closed the popup at once).
 
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 05b6fd09c5fa4582abfe2d3445c584c3962cacc3..fe469815d17ab95bd45cfd7bdde59d14cb0a3f61 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -44,7 +44,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 ## Gyms for members, issues, counters and places
 
 - `/find-gym` and `/request` read a gym of this server through `src/commands/util/server-gym.ts` (`#n`, bare digits only when a gym of this server has that number or is called by them, a picked choice, or a clear hit; another server's gym reads as none). GitHub issues go through `ctx.issues` (`GitHubIssues`, `src/services/issue-gateway.ts`: `GITHUB_TOKEN` in the header only, never logged; `GITHUB_REPO`; answers read with a byte limit; a refusal logged by its status and a word for its kind, `refusalKind`, never GitHub's text); text in an issue body has `@`, `#`, `&`, `GH-` and `github.com/` broken by a zero-width space; names in code spans.
-- Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`; plan 8X-G after the staging of 8X-F, findings F1 and F3): 30 seconds a request, its body included (a query Pokebattler has not worked out lately took longer than ten; the answer is deferred, and Discord allows 15 minutes), a raid answer read up to 32 MB and a max battle team up to 5 MB by `readLimitedJson` (Mew's raid answer in T5 was 14.7 MB of JSON, 2.9 MB on the wire, 100 boss movesets of 30 counters, probed on 2026-10-22 with Matt's go-ahead: Pokebattler takes no moveset and no smaller aggregation, `aggregation=BEST` is as large, and its site filters one answer in the page), three requests at once, identical requests shared, the next boss name tried on 400/404 or an empty answer. A raid answer is reduced right after it is read to what the answer can show (`keptAnswer`, `src/domain/counters/counters.ts`: of each boss moveset and of the average the best moveset of the first twelve counters and the twelve fastest movesets, with the shadow Pokémon and megas asked for, so `counterRows` of it is that of the whole answer with `single` or without), and only that is kept: a scratch run of a Mew-sized answer (12.5 MB, 101 movesets) took some 270 ms and 73 MB of heap at its peak to parse and reduce, and kept some 320 KB (a boss of ten movesets some 30 KB). Answers are kept six hours and 200 of each kind (Pokebattler's simulations change only when it runs them again for new game data, and its API page asks for answers to be kept; Matt, 2026-10-22), from when they were got or last confirmed, as their headers say (`keepRule`; review r0 A1: Pokebattler sends `cache-control: max-age=3600` and a weak ETag, probed by the controller on 2026-10-22): within `max-age` an answer is used as it is; past it, it is asked for again with `If-None-Match` and its ETag, and a 304 renews it without a download (another `max-age`, or the one it had where the 304 names none; its six hours start again); a new answer replaces it; a name Pokebattler no longer knows (404, empty) asks under every name of the boss again; no answer at all (a timeout, Pokebattler away, busy) answers with the kept one, which is then used as it is for another minute (`REVALIDATION_PAUSE_MS`, review r1 R1-2: the next requests do not wait the time out again; when it was got stays as it was). `no-cache` keeps it but asks each time; `no-store` keeps nothing, said once in the log (`Pokebattler asks for its answers not to be kept`); a failure and a Pokébox are never kept. A request that could not reach Pokebattler pauses it for a minute (`unavailable`, also for what waits); a timeout does not (Pokebattler is working the query out, not down): the member reads "Pokebattler is still working this out: try again in a minute." Every failure that is not the member's gives the use back (`givesBackFor`: a timeout, unreachable, unavailable, busy, too large, unreadable, a 5xx refusal; a 4xx refusal and an unknown boss count), and an answer too large to read still says so plainly with the boss's full results on Pokebattler's site (`troubleError`: `Pokebattler’s answer for Mew is too large for me to read. See the [full results on Pokebattler](<…>).`, the address in angle brackets so that it unfurls no preview, `counterSiteLink` or `maxTeamLink` under the boss's first name). Pine's User-Agent is `Professor-Pine (+https://github.com/Googer/Professor-Pine)` (`POKEBATTLER_USER_AGENT`), as Pokebattler's developer page asks. The dialog's boss moves offer the average and 24 of a boss's movesets (Mew has 100): `/counters moveset:` typed names any. `counters` asks for a raid simulation, `maxTeam` (plan 8X-6) for a max battle team (`GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=&heal=&shield=&charge=&meterCharge=&level=&weatherCondition=&friendLevel=`, `maxTeamPath`; not among Pokebattler's documented endpoints, www.pokebattler.com/developers, so it may change without notice; a 400 or 404 there is read as a boss it does not know, but may also be parameters it refuses, for staging to tell apart): both through the same turns, limits and pause (Pokebattler out of reach for one pauses both), each kind with its own cache. What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`packages/wayspot-core/src/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). `/counters` for max battles (plan 8X-6; design section 8) is a max tier of `tier:` (D1 to D5, G, after the raid tiers) or the post of a max battle (its boss and tier, as a raid's post gives its own; a boss named there is taken in its tier), or a boss named without a tier that is no raid boss now and is a max boss (`currentMaxBoss`: the most stars, Gigantamax last; for a species a listed form of it, which is then the boss). "Gigantamax X" and "Dynamax X" are read as `/max` reads them. Gigantamax is refused, in the guard, for a Pokémon the game master has neither itself nor any form of as Gigantamax, unless it is on the max boss list at G (Pokebattler's feed may be ahead of the game data) or the post is of its own Gigantamax battle (another boss named there is not: `ownBattle`); in a train's post the train's kind decides (plan 8X-4): a raid train's boss is a raid boss (one that is no raid boss now is asked for `tier:`, and its boss moves are offered), a Dynamax train's is taken at its Dynamax tier where a max boss list names it (`currentMaxBoss` of Dynamax bosses only; else "X is not a Dynamax boss now. Say which tier to simulate with `tier`."), a Gigantamax train's at Gigantamax (refused as above where the game master has no Gigantamax of it), a boss named there alike; a species is asked under its own Gigantamax name and those of its forms that Gigantamax (`gigantamaxDefenders`: Toxtricity and both its forms, Urshifu only its forms). It shows Pokebattler's suggested team of three for the member's `role:`, one table (`MAX_ROLES`, `src/domain/counters/max-team.ts`; Matt, 2026-10-21, "a good starting point"): Attackers + charger 2/1/0/0 (attack/meterCharge/shield/heal; the default, Matt's usual team), Balanced 1/1/1/0, All attackers 3/0/0/0, Shielder 1/0/2/0, Healer 1/0/0/2, `charge` (Pokebattler's defender) 0 in all; every count is sent, and Pokebattler refuses a team that is not three. Every role but Balanced has a recorded answer in the tests (`uxie-d5-2-1-0-0` the default's). Levels are `MAX_TEAM_LEVELS`, 20 to 50 in steps of five (no best buddy levels: one Pokémon at a time is a best buddy; Matt), 40 unless named; weather and friendship as the raid's (the endpoint reads `weatherCondition` and `friendLevel`, probed live on 2026-10-21; friendship 0 without it); `moveset`, `shadow`, `mega`, `single` and the Pokébox level are refused in words for a max tier (`readMaxPlan`, in the guard, uncounted), `role` for a raid. The boss's names there are `pokebattlerMaxDefenders` (a Gigantamax boss as the feed writes it, `MACHAMP_GIGANTAMAX`, `TOXTRICITY_AMPED_GIGANTAMAX`; a mega has none and is refused); the answer is read by `readMaxTeam` (zod; `MOVE_NONE` is no charged move: the max moves are the point, and Pokebattler records it where it holds the charged move irrelevant to a max battle, so such a member is shown with its fast move alone, no separator and no small print: plan 8X-F checked the staging's Hydreigon "Bite" against the recorded answers, `test/fixtures/pokebattler-max-teams.json`, `BITE_FAST` / `MOVE_NONE` in the attacker teams, `BRUTAL_SWING` in the shielder's: Pine drops nothing; the first three slots that fit, `MAX_TEAM_SIZE`, the rest counted as left out) and its Pokémon named as the max boss feed is mapped (`maxTeamMember`, `maxBossOf`: `RILLABOOM_GIGANTAMAX` is Gigantamax Rillaboom, pictured by `maxBossPicture`; one the game data does not know by Pokebattler's name in words, logged). The answer (`renderMaxTeam`, `src/render/max-team.ts`; `src/commands/util/max-counters.ts`) is in the counters' form: the boss, its types and the role beside its picture, each of the three with its role (`slotRoleWords`, Pokebattler's page's words: `ATTACK` Attacker, `METER_CHARGE` Charger, `SHIELD` Shielder, `HEAL` Healer, `CHARGE` Defender) and moves beside its picture, the first `SHOWN_ALTERNATIVES` (five) alternatives once per role (Pokebattler gives the slots of one role the same ten; "Others" for a role Pine does not know), the lines sharing what is left of `TEXT_BUDGET` equally, each fitted with "…and N more", the level the answer used, the weather and friendship and the max move levels in small print, "Change options…" (its dialog: role, level, weather, friendship; the kept options `KeptMaxCounters`, `kind: 'max'`, in the same `keptCounters` under the same custom-id kind), and "Full results", the role's page of Pokebattler's site (`maxTeamLink`: All attackers `/max/<boss>`, a team with a charger `/METER_CHARGE`, Shielder `/TANK`, Healer `/TOTAL_HEAL`; `/CHARGER` is the defenders' and `/PARTY` a lobby of four, no role's). No trainers estimate. The raid answer's "Full results" is the boss's page of the new site (`counterSiteLink`: `/raids/<boss>`, with `includeShadow=0` and `includeMegas=0` where the answer left them out; the site sends the API's long path there, dropping every option). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `askPokebattler` and `answeredMessage` (a raid's counters or a max battle's team, by the kept options' `kind`; a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), opening the dialog in its own `MEMBER_READ_THROTTLE` window, and the guard `requireDialogPlan` refuses what does not fit before it is counted.
+- Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`; plan 8X-G after the staging of 8X-F, findings F1 and F3): 30 seconds a request, its body included (a query Pokebattler has not worked out lately took longer than ten; the answer is deferred, and Discord allows 15 minutes), a raid answer read up to 32 MB and a max battle team up to 5 MB by `readLimitedJson` (Mew's raid answer in T5 was 14.7 MB of JSON, 2.9 MB on the wire, 100 boss movesets of 30 counters, probed on 2026-10-22 with Matt's go-ahead: Pokebattler takes no moveset and no smaller aggregation, `aggregation=BEST` is as large, and its site filters one answer in the page), three requests at once, identical requests shared, the next boss name tried on 400/404 or an empty answer. A raid answer is reduced right after it is read to what the answer can show (`keptAnswer`, `src/domain/counters/counters.ts`: of each boss moveset and of the average the best moveset of the first twelve counters and the twelve fastest movesets, with the shadow Pokémon and megas asked for, so `counterRows` of it is that of the whole answer with `single` or without), and only that is kept: a scratch run of a Mew-sized answer (12.5 MB, 101 movesets) took some 270 ms and 73 MB of heap at its peak to parse and reduce, and kept some 320 KB (a boss of ten movesets some 30 KB). Answers are kept six hours and 200 of each kind (Pokebattler's simulations change only when it runs them again for new game data, and its API page asks for answers to be kept; Matt, 2026-10-22), from when they were got or last confirmed, as their headers say (`keepRule`; review r0 A1: Pokebattler sends `cache-control: max-age=3600` and a weak ETag, probed by the controller on 2026-10-22): within `max-age` an answer is used as it is; past it, it is asked for again with `If-None-Match` and its ETag, and a 304 renews it without a download (another `max-age`, or the one it had where the 304 names none; its six hours start again); a new answer replaces it; a name Pokebattler no longer knows (404, empty) asks under every name of the boss again; no answer at all (a timeout, Pokebattler away, busy) answers with the kept one, which is then used as it is for another minute (`REVALIDATION_PAUSE_MS`, review r1 R1-2: the next requests do not wait the time out again; when it was got stays as it was). `no-cache` keeps it but asks each time; `no-store` keeps nothing, said once in the log (`Pokebattler asks for its answers not to be kept`); a failure and a Pokébox are never kept. A request that could not reach Pokebattler pauses it for a minute (`unavailable`, also for what waits); a timeout does not (Pokebattler is working the query out, not down): the member reads "Pokebattler is still working this out: try again in a minute.", and so for a `503`, which Pokebattler answers to a new query it is still computing (plan 8X-H, staging G6: the same query a minute later was answered at once; `troubleText` takes the failure with its `status`, raids and max battles alike; another 5xx is "did not answer just now") Every failure that is not the member's gives the use back (`givesBackFor`: a timeout, unreachable, unavailable, busy, too large, unreadable, a 5xx refusal; a 4xx refusal and an unknown boss count), and an answer too large to read still says so plainly with the boss's full results on Pokebattler's site (`troubleError`: `Pokebattler’s answer for Mew is too large for me to read. See the [full results on Pokebattler](<…>).`, the address in angle brackets so that it unfurls no preview, `counterSiteLink` or `maxTeamLink` under the boss's first name). Pine's User-Agent is `Professor-Pine (+https://github.com/Googer/Professor-Pine)` (`POKEBATTLER_USER_AGENT`), as Pokebattler's developer page asks. The dialog's boss moves offer the average and 24 of a boss's movesets (Mew has 100): `/counters moveset:` typed names any (Matt, 2026-10-23: Mew, the one boss with more movesets than the menu holds, is never a raid or max boss, so the menu stays the game master's). A moveset Pokebattler does not simulate is refused naming ten of those it does and how many more (`SIMULATED_NAMED`, plan 8X-H: `It simulates A / B, …, and 90 more.`). `counters` asks for a raid simulation, `maxTeam` (plan 8X-6) for a max battle team (`GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=&heal=&shield=&charge=&meterCharge=&level=&weatherCondition=&friendLevel=`, `maxTeamPath`; not among Pokebattler's documented endpoints, www.pokebattler.com/developers, so it may change without notice; a 400 or 404 there is read as a boss it does not know, but may also be parameters it refuses, for staging to tell apart): both through the same turns, limits and pause (Pokebattler out of reach for one pauses both), each kind with its own cache. What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`packages/wayspot-core/src/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). `/counters` for max battles (plan 8X-6; design section 8) is a max tier of `tier:` (D1 to D5, G, after the raid tiers) or the post of a max battle (its boss and tier, as a raid's post gives its own; a boss named there is taken in its tier), or a boss named without a tier that is no raid boss now and is a max boss (`currentMaxBoss`: the most stars, Gigantamax last; for a species a listed form of it, which is then the boss). "Gigantamax X" and "Dynamax X" are read as `/max` reads them. Gigantamax is refused, in the guard, for a Pokémon the game master has neither itself nor any form of as Gigantamax, unless it is on the max boss list at G (Pokebattler's feed may be ahead of the game data) or the post is of its own Gigantamax battle (another boss named there is not: `ownBattle`); in a train's post the train's kind decides (plan 8X-4): a raid train's boss is a raid boss (one that is no raid boss now is asked for `tier:`, and its boss moves are offered), a Dynamax train's is taken at its Dynamax tier where a max boss list names it (`currentMaxBoss` of Dynamax bosses only; else "X is not a Dynamax boss now. Say which tier to simulate with `tier`."), a Gigantamax train's at Gigantamax (refused as above where the game master has no Gigantamax of it), a boss named there alike; a species is asked under its own Gigantamax name and those of its forms that Gigantamax (`gigantamaxDefenders`: Toxtricity and both its forms, Urshifu only its forms). It shows Pokebattler's suggested team of three for the member's `role:`, one table (`MAX_ROLES`, `src/domain/counters/max-team.ts`; Matt, 2026-10-21, "a good starting point"): Attackers + charger 2/1/0/0 (attack/meterCharge/shield/heal; the default, Matt's usual team), Balanced 1/1/1/0, All attackers 3/0/0/0, Shielder 1/0/2/0, Healer 1/0/0/2, `charge` (Pokebattler's defender) 0 in all; every count is sent, and Pokebattler refuses a team that is not three. Every role but Balanced has a recorded answer in the tests (`uxie-d5-2-1-0-0` the default's). Levels are `MAX_TEAM_LEVELS`, 20 to 50 in steps of five (no best buddy levels: one Pokémon at a time is a best buddy; Matt), 40 unless named; weather and friendship as the raid's (the endpoint reads `weatherCondition` and `friendLevel`, probed live on 2026-10-21; friendship 0 without it); `moveset`, `shadow`, `mega`, `single` and the Pokébox level are refused in words for a max tier (`readMaxPlan`, in the guard, uncounted), `role` for a raid. The boss's names there are `pokebattlerMaxDefenders` (a Gigantamax boss as the feed writes it, `MACHAMP_GIGANTAMAX`, `TOXTRICITY_AMPED_GIGANTAMAX`; a mega has none and is refused); the answer is read by `readMaxTeam` (zod; `MOVE_NONE` is no charged move: the max moves are the point, and Pokebattler records it where it holds the charged move irrelevant to a max battle, so such a member is shown with its fast move alone, no separator and no small print: plan 8X-F checked the staging's Hydreigon "Bite" against the recorded answers, `test/fixtures/pokebattler-max-teams.json`, `BITE_FAST` / `MOVE_NONE` in the attacker teams, `BRUTAL_SWING` in the shielder's: Pine drops nothing; the first three slots that fit, `MAX_TEAM_SIZE`, the rest counted as left out) and its Pokémon named as the max boss feed is mapped (`maxTeamMember`, `maxBossOf`: `RILLABOOM_GIGANTAMAX` is Gigantamax Rillaboom, pictured by `maxBossPicture`; one the game data does not know by Pokebattler's name in words, logged). The answer (`renderMaxTeam`, `src/render/max-team.ts`; `src/commands/util/max-counters.ts`) is in the counters' form: the boss, its types and the role beside its picture, each of the three with its role (`slotRoleWords`, Pokebattler's page's words: `ATTACK` Attacker, `METER_CHARGE` Charger, `SHIELD` Shielder, `HEAL` Healer, `CHARGE` Defender) and moves beside its picture, the first `SHOWN_ALTERNATIVES` (five) alternatives once per role (Pokebattler gives the slots of one role the same ten; "Others" for a role Pine does not know), the lines sharing what is left of `TEXT_BUDGET` equally, each fitted with "…and N more", the level the answer used, the weather and friendship and the max move levels in small print, "Change options…" (its dialog: role, level, weather, friendship; the kept options `KeptMaxCounters`, `kind: 'max'`, in the same `keptCounters` under the same custom-id kind), and "Full results", the role's page of Pokebattler's site (`maxTeamLink`: All attackers `/max/<boss>`, a team with a charger `/METER_CHARGE`, Shielder `/TANK`, Healer `/TOTAL_HEAL`; `/CHARGER` is the defenders' and `/PARTY` a lobby of four, no role's). No trainers estimate. The raid answer's "Full results" is the boss's page of the new site (`counterSiteLink`: `/raids/<boss>`, with `includeShadow=0` and `includeMegas=0` where the answer left them out; the site sends the API's long path there, dropping every option). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `askPokebattler` and `answeredMessage` (a raid's counters or a max battle's team, by the kept options' `kind`; a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), opening the dialog in its own `MEMBER_READ_THROTTLE` window, and the guard `requireDialogPlan` refuses what does not fit before it is counted.
 - `/maps` is offered where `settings.web` or `settings.regionMapLink` (blank is unset) is set. With the web pages it answers in a server with the map's address and a button of a login link (`ctx.loginLinks.issue`, `web.md`; its small print says not to share it: it logs in whoever opens it as the member), under `MEMBER_WRITE_THROTTLE` (a link is a write); in a DM, which names no server, with `regionMapLink` or "Use /maps in your server."; without them with `regionMapLink` anywhere. `MEMBER_READ_THROTTLE` is the throttle of member commands that only read.
 
 ## /help
diff --git a/docs/superpowers/plans/2026-10-23-phase-8xh-staging.md b/docs/superpowers/plans/2026-10-23-phase-8xh-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..8f3f503620896fe06c59637f2bb1e77491af7ac5
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-23-phase-8xh-staging.md
@@ -0,0 +1,35 @@
+# Phase 8X-H staging checklist: the 8X-G run's findings and the catch-up on reconnect (draft)
+
+Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord and the map in its own tab. Accounts: Googer (owner, staff) and, where a step says so, Tester (a member, on a phone). The findings are in the follow-ups, "From the staging run of 8X-G" (G1 to G7); the brief is `.superpowers/sdd/8x-h-staging-fixes/design.md`. Part one re-checks each finding, part two the catch-up on reconnect. No migration and no change of a command's definition: nothing to deploy. The dev database stays at 030.
+
+## Before
+
+1. **Start the bot at debug** (part two reads debug lines; the environment wins over `.env`): `set LOG_LEVEL=debug&& set SETTINGS_PATH=var/stage/settings.json&& node --env-file=.env --conditions=pine-source --import tsx src/index.ts > var\stage\logs\bot-8xh-1.log 2>&1`.
+2. Check `var/stage/TEST-SERVER-STATE.md` and note there that 8X-H is being staged. Between 06:00 and 21:00 for the max battle steps.
+3. **Pokebattler is asked live** in steps 4 and 5 (Matt's go-ahead for the run covers it: a few `/counters` queries, as a member would make them).
+
+## Part one: the findings
+
+4. **G1, the list of simulated movesets.** `/counters boss:Mew tier:T5 moveset:Pound / Dark Pulse` (typed): the refusal names ten movesets Pokebattler simulates and ends `, and N more.` (N about 90; no hint of `/counters moveset:`, review r0 A5), no "…" cut. One of the ten typed as `moveset:` answers with counters. "Change options…" → "Boss moves" is as before (the average and 24 of the game master's; Matt, 2026-10-23: Mew is never a raid or max boss, the menu stays).
+5. **G6, a 503.** Only if Pokebattler answers `503` to a new max query (a Gigantamax boss at an unusual level and weather, as in the 8X-G run): the member reads "Pokebattler is still working this out: try again in a minute." and the use is given back (a fourth `/counters` within the minute is not refused). The log has `Pokebattler refused a request` with `status: 503`. Not seen: the unit tests cover it.
+6. **G2, Move… at the end of a turn-back route.** A train of three stops or more, `/train … at-end:Turn back`, moved to its last stop. Move… offers `Next: turn back to <stop>` first and picked, then `Previous: back to <stop> (undo)` with the line `Back one stop, still heading for the end: undoes a Next made by mistake` under it (check it shows on Android and on the web), then Skip. Submit Previous: the train is at the stop before the last, and the post's line of what lies ahead still says the route goes on to the end (not turning back). From the last stop again, Submit Next: the post says it turns back.
+7. **G2, a loop of two stops.** A train of two stops, at-end Loop: Move… has no choice at either stop (`Submit takes it round to …` at the second, `Submit moves it to …` at the first) and one Submit moves it once.
+8. **G3, a finished route's words.** From the last stop of a train that finishes, Move… → Next: the private answer ends `Move… takes it back to stop N: <stop>.` Move… on the finished route: `The train has finished its route of N stops.` once, then `Submit takes it back to stop N, **<stop>**.` (no Previous named). Manage… → Finish it here: the answer ends `Move… takes it back …`. Typed `/finish` (after `/previous`): `` `/previous` takes it back … ``. On the map, the train's panel's Finish: `Previous takes it back …` (the map has a Previous button).
+9. **G4, a start days ahead.** `/train name:Far start:<3 days from now, 7pm>` (and a meetup a day and a half ahead): the region's summary (and `/status` in the region's channel) shows the start as a date and time (Discord's `f` stamp, e.g. "October 26, 2026 7:00 PM"), in the viewer's own time zone: if a second device is set to another zone, it shows that zone's time. A train starting in 5 hours still shows "in 5 hours". The post itself is unchanged (it said the date already).
+10. **G7.** Nothing changed: All attackers lists a charged move only where Pokebattler names one (the code confirmed; the alternatives show their fast move by design).
+
+## Part two: the catch-up on reconnect
+
+11. **Ready the outage.** In #north-side: a raid (`/raid`) whose end is about two minutes away (`/end` in 2), a train with a route, and a max battle if one is possible. Note the time. Read the log's tail: `connected to Discord`, the clock running.
+12. **Take the network away (Matt: Wi-Fi off) for 3 minutes**, the raid's end falling inside, then Wi-Fi on. Not shorter (review r0 B7): with the network gone an open socket is given up only as a zombie, about 82 seconds after Discord's last acknowledgement, and DNS fails only while reconnecting, so a short outage may never be seen. Do nothing on Discord meanwhile (Discord cannot reach the bot).
+13. **The log of the outage** (`bot-8xh-1.log`; the first shard error can come up to about 2 minutes after Wi-Fi off, see step 12): one `discord shard error` at warn (ENOTFOUND, Windows' DNS) and, for an outage over a minute, `discord shard errors repeated` at most once a minute with a count; no `discord shard error` at ERROR, no line per reconnection. The raid's end: `could not show an ended party one last time` and `could not archive the post of an ended party` at warn. A post update during the outage: `could not update a party post` at warn (not ERROR). No ERROR line for the network at all.
+14. **The return:** `discord gateway back` at info with `awayMs` (about the outage), `shardErrors` and `unsaid`; then `closed ended parties again` at info (`redone` 1: the raid that ended meanwhile, the upkeep's first step, review r0 B4) and `caught up` with `ran` holding at least `posts`, `upkeep`, `stop posts`, and the feeds under `notOwed` unless one of their reads came during the outage (then under `ran`, with the feed's own read line: `raid bosses read, unchanged` at debug, or its info line). Between them the debug lines of the upkeep: `swept the posts of ended parties` (archived, forums) and `read the emoji of the application`.
+15. **What the members see:** the raid that ended during the outage: its post shows no controls, has the Ended tag and is archived (the forum's open posts no longer list it); the summary of #north-side no longer lists it. A post that a change during the outage could not reach is current (sign up on the train during the outage is not possible; instead, before step 12, change something with the bot's own clock in it: the raid's hatch, a meeting time due during the outage) and the summary's counts are right.
+16. **A routine resume** (if the log shows one during the run, `discord gateway resumed` at debug): no `caught up` follows it. A routine resume (a second or two away, no shard error) logged as `discord gateway back` is a failure (review r0 B1).
+17. **A short outage** (Wi-Fi off for 10 seconds): either nothing at all (the socket survived: no heartbeat was missed) or a real return with shard errors, `discord gateway back` and `caught up` (only `upkeep`, `posts`, `stop posts` under `ran`, the rest not owed). Both pass; neither may log an ERROR line (review r0 B7).
+18. **Stop during a catch-up** (optional): Ctrl+C right after `discord gateway back`: the stop finishes cleanly (no crash marker at the next start), `caught up` may be cut short. The party clock's step (6 s) starts no job of the catch-up more and waits for the upkeep, which starts no step more and whose closings end between parties; a feed's read under way ends at that feed's stop step, a drawing of the stops' pinned posts at `posts of the stops`; the step `catch-up` (2 s) after that one waits for the job left (review r0 B6, r1 C3). `shutdown step finished` for `party clock` and `catch-up`, no `shutdown step failed` (`… timed out after … ms`) for either.
+
+## Notes
+
+- In production the watchdog restarts the bot after about seven minutes without the gateway: the catch-up covers outages of about 30 seconds to 7 minutes there. In Docker (Linux) a DNS outage is EAI_AGAIN, which gives no shard error at all: the return is real by its length or a new session.
+- Not caught up by design: DMs that failed meanwhile (dropped, as always), lines in posts that failed, interactions Discord could not deliver.
````

## After the last task

- [ ] `npm run check > var/8xh-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `npm run test:db` (0), one at a time.
- [ ] `git diff c64d2efb1f91957825e00f979a7d6140b44d3678 HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory.
